// Browser smoke test: starts the Node server (or targets SMOKE_URL), opens Mission Control and the
// astronaut page in headless Chromium with the real three.js build, and plays the whole demo mission
// to a win the way a laptop player would: walk up to the thing, look at it, click. Every repair goes
// through the same raycast a mouse click does, and the socket for each cable is read off the
// Scientist's wiring diagram on the other page. Screenshots land in test/shots/.
//
//   npm i -D playwright && npx playwright install chromium   (once)
//   npm run smoke
//
// Headless Chromium renders WebGL in software here, so the scene runs at a few frames per second and
// each screenshot can take seconds. That is the test machine, not the game.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test', 'shots');
const PORT = 3100;
mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

// SMOKE_URL=http://localhost:8787 npm run smoke   tests a server that is already running (wrangler dev)
const BASE = process.env.SMOKE_URL || `http://localhost:${PORT}`;
const server = process.env.SMOKE_URL ? null : spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const problems = [];
// One browser per page: with software GL the astronaut's 3D scene hogs the GPU process, and a console
// sharing it falls minutes behind.
const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const browsers = [];
async function open(name, url, size = { width: 960, height: 540 }) { // software GL: keep the pixel count down
  const browser = await launch();
  browsers.push(browser);
  const p = await (await browser.newContext({ viewport: size })).newPage();
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') problems.push(`${name}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) problems.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + url);
  return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 600000 });
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(3)} s]`, ...a);
const POLL = { timeout: 30000, polling: 250 };

// Runs in the astronaut page. Helpers that stand the player somewhere and click what they look at.
function installHelpers() {
  const mb = window.moonbase, T = mb.THREE;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const owns = (root, m) => { for (let o = m; o; o = o.parent) if (o === root) return true; return false; };
  const ray = new T.Raycaster();
  const clear = (eye, p, mesh) => { ray.set(eye, p.clone().sub(eye).normalize()); ray.far = 3.2; return ray.intersectObjects(mb.fx.targets(), false)[0]?.object === mesh; };
  const look = (eye, p) => {
    const d = p.clone().sub(eye);
    mb.rig.rotation.y = Math.atan2(-d.x, -d.z);
    mb.camera.rotation.x = Math.atan2(d.y, Math.hypot(d.x, d.z));
    mb.rig.updateMatrixWorld(true);
    mb.camera.updateMatrixWorld(true);
  };
  // Look at `mesh`, walking somewhere it can be seen and clicked from if it cannot be from here.
  async function face(mesh) {
    const p = mesh.getWorldPosition(new T.Vector3());
    const here = new T.Vector3(mb.rig.position.x, 1.65, mb.rig.position.z);
    if (clear(here, p, mesh)) { look(here, p); return true; }
    for (const dist of [1.8, 1.3, 2.4, 2.9]) for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, eye = new T.Vector3(p.x + Math.cos(a) * dist, 1.65, p.z + Math.sin(a) * dist);
      if (Math.hypot(eye.x, eye.z) < 3.0 || !clear(eye, p, mesh)) continue; // inside the habitat, or something is in the way
      mb.rig.position.set(eye.x, 0, eye.z);
      look(eye, p);
      mb.sendPose(); // the page reports where it is ten times a second; frames are slow here, so do not wait for one
      await sleep(150);
      return true;
    }
    return false;
  }
  // Click every enabled target that `pick` accepts, until none are left or time runs out.
  async function work(pick, what, seconds = 40) {
    const end = Date.now() + seconds * 1000, done = new Set();
    let clicks = 0;
    while (Date.now() < end) {
      const all = mb.fx.targets().filter(pick);
      if (!all.length) return { ok: true, clicks };
      const m = all.find(x => !done.has(x));
      if (!m) { done.clear(); await sleep(400); continue; } // every one clicked: let the server's answer arrive
      if (!(await face(m))) return { ok: false, why: `cannot get a clear look at ${what}` };
      if (!mb.use()) return { ok: false, why: `looked at ${what} but the click hit nothing` };
      done.add(m);
      clicks++;
    }
    return { ok: false, why: `${what}: still not done after ${seconds} s (${clicks} clicks)` };
  }
  async function until(test, seconds) {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) { const v = test(mb.state()); if (v) return v; await sleep(100); }
    return null;
  }
  const F = mb.world.fixtures;
  const toolBox = id => m => owns(mb.fx.tools[id], m);
  const rackSlot = id => m => m.parent === F.locker && m.position.distanceTo(F.lockerSlots[id]) < 0.35 && !owns(mb.fx.tools[id], m);
  window.smoke = {
    sleep, until, face, work,
    // Take a tool off the rack, putting others back first if the belt would be too heavy.
    async carry(id, drop = []) {
      for (const d of drop) if (mb.state().belt.includes(d)) { const r = await work(rackSlot(d), `the ${d} slot on the rack`, 20); if (!r.ok) return r; }
      if (mb.state().belt.includes(id)) return { ok: true };
      const r = await work(toolBox(id), `the ${id} on the rack`, 20);
      if (!r.ok) return r;
      return (await until(s => s.belt.includes(id), 8)) ? { ok: true } : { ok: false, why: `the ${id} never reached the belt` };
    },
    dust: () => work(m => F.dustCells.includes(m), 'a dusty cell', 60),
    pullWheel: () => work(m => owns(F.wheel, m), 'the broken wheel', 20),
    fitTire: () => work(m => owns(F.hub, m), 'the bare hub', 20),
    weld: () => work(m => m.parent === F.crack, 'the crack', 30),
    async plug(cable, socket) {
      const plug = F.plugs[cable].children.find(c => c.userData.click);
      // The plug drops out of its socket on the next drawn frame. Wait until it is hanging where it can be picked up.
      if (!(await until(() => F.plugs[cable].position.distanceTo(F.plugRest[cable]) < 0.01, 15))) return { ok: false, why: `the ${F.plugs[cable].userData.color} plug never dropped out of its socket` };
      if (!(await face(plug)) || !mb.use()) return { ok: false, why: `could not pick up the ${F.plugs[cable].userData.color} plug` };
      const sock = mb.fx.targets().filter(m => m.parent === F.board && m.userData.click).sort((a, b) => a.position.distanceTo(F.sockets[socket]) - b.position.distanceTo(F.sockets[socket]))[0];
      if (!sock || !(await face(sock)) || !mb.use()) return { ok: false, why: `could not reach socket ${socket}` };
      return (await until(s => s.scene.board === null || s.scene.board[cable].seated, 8)) ? { ok: true } : { ok: false, why: `the ${F.plugs[cable].userData.color} plug did not seat in socket ${socket}` };
    },
    standAt(x, z) { mb.rig.position.set(x, 0, z); mb.rig.rotation.y = 0; mb.camera.rotation.x = 0; mb.rig.updateMatrixWorld(true); mb.camera.updateMatrixWorld(true); mb.sendPose(); },
  };
}

const step = async (page, name, fn, arg) => {
  const r = await page.evaluate(fn, arg);
  if (!r || !r.ok) problems.push(`astronaut: ${name}: ${r ? r.why : 'no result'}`);
  log(`  ${name}: ${r && r.ok ? 'ok' : 'FAILED'}`);
  return !!r && r.ok;
};
const waitFor = async (page, name, fn, seconds) => {
  const ok = await page.evaluate(([f, s]) => window.smoke.until(new Function('s', `return (${f})(s)`), s), [fn.toString(), seconds]);
  if (!ok) problems.push(`astronaut: waited ${seconds} s for ${name}`);
  return !!ok;
};

try {
  const ctl = await open('console', '/control', { width: 1280, height: 1400 });
  const astro = await open('astronaut', '/astronaut');
  await astro.waitForTimeout(1000);
  await astro.click('#radioBtn');
  await astro.waitForTimeout(300);
  await astro.click('#deskBtn');
  await astro.waitForTimeout(500);
  const pitch = await astro.evaluate(() => Math.abs(window.moonbase.camera.rotation.x));
  if (pitch > 0.2) problems.push(`astronaut: camera pitched ${pitch.toFixed(2)} rad right after entering (pointer-lock jump)`);
  await astro.evaluate(installHelpers);

  // Ready up: the astronaut uses the READY board in front of the spawn point, Mission Control
  // (2-player mode, so the crew is complete) presses Ready in the lobby. The mission starts itself
  // after the countdown.
  if (!(await astro.evaluate(() => window.moonbase.useBoard()))) problems.push('astronaut: the READY board was not in front of the spawn point');
  await ctl.click('[data-ready]');
  await ctl.waitForFunction(() => window.moonbase.state()?.phase === 'run', null, { timeout: 60000, polling: 250 });
  log('mission started');

  // 0:05 the solar panels get dusty. Brush off the rack, then every cell.
  await waitFor(astro, 'dust on the panels', s => s.phase === 'run' && s.scene.dust, 30);
  await ctl.waitForFunction(() => window.moonbase.state().power?.solar < 60, null, POLL).catch(() => problems.push('console: the Scientist\'s solar gauge should be low with dusty panels'));
  await shot(ctl, 'mission-control-dust');
  await step(astro, 'take the brush', () => window.smoke.carry('brush'));
  await step(astro, 'brush the panels', () => window.smoke.dust());
  await waitFor(astro, 'the panels to be clean', s => !s.scene.dust, 8);

  // 0:45 the rover wheel breaks and the radar goes with it. Swap the brush... no: brush (1) + tire (3) fits.
  await waitFor(astro, 'the rover wheel to break', s => s.scene.wheel === 1, 60);
  await ctl.waitForFunction(() => window.moonbase.state().radar === false, null, POLL).catch(() => problems.push('console: the Technician still has radar with the wheel broken'));
  await step(astro, 'take the tire', () => window.smoke.carry('tire'));
  await step(astro, 'pull the broken wheel off', () => window.smoke.pullWheel());
  await waitFor(astro, 'the wheel to come off', s => s.scene.wheel === 2, 8);
  await step(astro, 'fit the tire', () => window.smoke.fitTire());
  await waitFor(astro, 'the rover to be fixed', s => s.scene.wheel === 0, 8);

  // 1:25 the radar shows a shower coming. Get under the canopy and wait it out.
  await ctl.waitForFunction(() => !!window.moonbase.state().meteor, null, { timeout: 60000, polling: 250 }).then(() => log('  meteor warning seen on the radar'), () => problems.push('console: no meteor warning on the radar'));
  await shot(ctl, 'mission-control-meteor');
  await astro.evaluate(() => window.smoke.standAt(0, 4.6));
  await waitFor(astro, 'the shower to start', s => s.scene.meteor !== null, 30);
  await waitFor(astro, 'the shower to end', s => s.scene.meteor === null && s.scene.hull, 20);
  const hits = await astro.evaluate(() => window.moonbase.state().suit);
  if (hits) problems.push('astronaut: hit by the shower while standing under the canopy');

  // The shower left dust, a hull breach and a tripped switchboard. Power first: the board, while the
  // Scientist still has a screen to read the wiring diagram from, then the panels.
  const wiring = await ctl.evaluate(async () => { for (let i = 0; i < 50; i++) { const w = window.moonbase.state().wiring; if (w) return w; await new Promise(r => setTimeout(r, 100)); } return null; });
  if (!wiring) problems.push('console: the Scientist has no wiring diagram for the tripped switchboard');
  for (const w of wiring || []) {
    await step(astro, `plug the ${w.color} cable into socket ${w.socket}`, ({ color, socket }) => {
      const cable = window.moonbase.world.fixtures.plugs.findIndex(p => p.userData.color === color);
      return window.smoke.plug(cable, socket);
    }, w);
  }
  await waitFor(astro, 'the switchboard to be fixed', s => !s.scene.board, 8);
  await step(astro, 'brush the panels again', () => window.smoke.dust());
  await waitFor(astro, 'the panels to be clean again', s => !s.scene.dust, 8);
  await step(astro, 'take the welder', () => window.smoke.carry('welder'));
  await step(astro, 'weld the crack', () => window.smoke.weld());
  await waitFor(astro, 'the hull to be sealed', s => !s.scene.hull, 8);

  // 2:30 the suit leaks. Patch kit, then F.
  await step(astro, 'take the patch kit', () => window.smoke.carry('patch'));
  await waitFor(astro, 'the suit leak', s => s.suit || s.phase !== 'run', 60);
  await astro.keyboard.down('f');
  await waitFor(astro, 'the suit to be patched', s => !s.suit, 8);
  await astro.keyboard.up('f');

  await ctl.waitForFunction(() => window.moonbase.state()?.phase === 'results', null, { timeout: 120000, polling: 250 });
  const result = await ctl.evaluate(() => window.moonbase.state().result);
  log('result', JSON.stringify(result));
  if (!result.won) problems.push(`mission lost: ${result.reason}`);
  if (result.fixed !== 6) problems.push(`expected all 6 faults fixed, got ${result.fixed}`);
  if (result.hits || result.blackouts || result.mistakes) problems.push(`a clean run should have no hits, blackouts or wrong plugs: ${JSON.stringify(result)}`);

  // Screenshots last, and one page at a time: the two WebGL pages fight for the CPU in software rendering.
  await shot(ctl, 'mission-control-results');
} catch (e) {
  problems.push('smoke: ' + e.message);
} finally {
  await Promise.all(browsers.map(b => b.close().catch(() => {})));
  server?.kill();
}

if (problems.length) { console.error('SMOKE FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`smoke passed: the demo mission was played to a win through the laptop controls. Screenshots in ${path.relative(ROOT, OUT)}/`);
process.exit(0);
