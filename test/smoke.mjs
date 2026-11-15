// Browser smoke test: starts the Node server (or targets SMOKE_URL) and drives the real pages in
// headless Chromium with the real three.js build.
//
//   1. Mission Control and the astronaut ready up and play the whole demo mission to a win the way a
//      laptop player would: walk up to the thing, look at it, click. Every repair goes through the same
//      raycast a mouse click does, the switchboard is reached through the airlock, and the socket for
//      each cable is read off the Scientist's wiring diagram on the other page.
//   2. On the astronaut's page: the hand-tracking gestures, the visor zoom, the wrist gauges with no
//      microphone, and the airlock with the hall's outage lighting.
//   3. In a second browser with a pretend microphone: the radio, both ways.
//
// With SMOKE_SHOTS=1, screenshots land in test/shots/. The VR hands are tested separately: npm run vr.
//
//   npm i -D playwright && npx playwright install chromium   (once)
//   npm run smoke
//
// Headless Chromium renders WebGL in software here, so the scene runs at about a frame a second and
// each screenshot can take seconds. That is the test machine, not the game.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAL } from '../client/shared/palette.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test', 'shots');
const PORT = 3100;
mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

// SMOKE_URL=http://localhost:8787 npm run smoke   tests a server that is already running (wrangler dev)
const BASE = process.env.SMOKE_URL || `http://localhost:${PORT}`;
// Software rendering draws the Moon at a frame or two a second, and the walk-in airlocks take frames, so the
// mission clock runs at half speed here (and every wait below is in mission seconds).
const SCALE = process.env.SMOKE_URL ? 1 : 0.5;
const server = process.env.SMOKE_URL ? null : spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT, TIME_SCALE: String(SCALE) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const problems = [];
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const MIC = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const browsers = [];
function watch(p, name) {
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  // Errors, and WebGL complaints, which arrive as warnings (a failed draw leaves a black surface, not an exception).
  p.on('console', m => { if (m.type() === 'error' || /GL_INVALID|WebGL: INVALID/.test(m.text())) problems.push(`${name}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) problems.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
}
// For the mission, one browser per page: with software GL the astronaut's 3D scene hogs the GPU
// process, and a console sharing it falls minutes behind.
async function openOwn(name, url, size = { width: 960, height: 540 }) { // software GL: keep the pixel count down
  const b = await chromium.launch({ args: GL });
  browsers.push(b);
  const p = await (await b.newContext({ viewport: size })).newPage();
  watch(p, name);
  await p.goto(BASE + url);
  return p;
}
// For the radio check, two pages in one browser that has a pretend microphone.
let browser = null, ctx = null;
async function open(name, url) {
  const p = await ctx.newPage();
  watch(p, name);
  await p.goto(BASE + url);
  return p;
}
const T0 = Date.now(), step = what => console.log(`  ${String(Math.round((Date.now() - T0) / 1000)).padStart(4)} s  ${what}`);
const POLL = { timeout: 60000, polling: 250 };
// Open a seat that another page has just left: it frees when the server sees that page go, so try a few times.
async function seat(name, url) {
  for (let i = 0; i < 20; i++) {
    const p = await open(name, url);
    await p.waitForTimeout(700);
    if (!await p.evaluate(() => !!document.getElementById('taken'))) return p;
    await p.close();
  }
  throw new Error(`could not take the ${name} seat`);
}
const armState = p => p.evaluate(() => { const mb = window.moonbase, a = mb.arm; return { raise: a.raise, visible: a.group.visible, mic: mb.radio.micOk, ...mb.radioState() }; });
const until = async (what, test, ms = 40000) => {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await test()) return true; await new Promise(r => setTimeout(r, 200)); }
  problems.push(what);
  return false;
};
// What the gauge face last drew, in words (the cluster records it), and whether anything else is fixed
// to the view. Not read from the pixels: see the note on screenshots below.
const gaugeFace = p => p.evaluate(() => {
  const mb = window.moonbase;
  const overlays = mb.camera.children.filter(o => o.visible && o !== mb.arm.group && o !== mb.scope && !o.isLight && o.type !== 'Object3D').length;
  return { ...mb.arm.shown, drawn: !!mb.arm.shown, overlays, text: window.__gaugeText };
});
// The gauge face is icons only. Count any text drawn on its canvas from here on; there should be none.
const watchGaugeText = p => p.evaluate(() => {
  const face = window.moonbase.arm.canvas, P = CanvasRenderingContext2D.prototype;
  window.__gaugeText = 0;
  for (const f of ['fillText', 'strokeText']) { const draw = P[f]; P[f] = function (...a) { if (this.canvas === face) window.__gaugeText++; return draw.apply(this, a); }; }
});
// Screenshots are optional (SMOKE_SHOTS=1, or npm run smoke:shots). Reading pixels back from anything
// the graphics side has drawn (the 3D view, a render target, even the gauge face's 2D canvas) is the
// one thing software rendering cannot do cheaply: each read takes the browser tens of seconds and
// gigabytes, enough to get it killed on a small machine. So none of the checks reads a pixel.
const SHOTS = !!process.env.SMOKE_SHOTS;
// The astronaut's view, from the 3D canvas itself right after a frame is drawn (so without the laptop's aiming dot).
async function view(p, name) {
  if (!SHOTS) return;
  step('screenshot ' + name);
  const url = await p.evaluate(() => window.moonbase.snap());
  writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
const shot = (p, name) => SHOTS && p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 600000 });


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
      // Somewhere a head can be: outside the dome, or indoors on the floor of the hall, with nothing in the way.
      const l = mb.interior.toLocal(eye.x, eye.z);
      if (mb.where() === 'in' ? !mb.interior.walkable(l.x, l.z) : Math.hypot(eye.x, eye.z) < 3.0) continue;
      if (!clear(eye, p, mesh)) continue;
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
  // Into the other place: stand in airlock S's chamber on this side, wait for the cycle, step out.
  async function through(to) {
    if (mb.where() === to) return { ok: true };
    const ch = (mb.where() === 'in' ? mb.interior.doors : mb.world.doors).S;
    ch.root.updateWorldMatrix(true, false);
    const p = ch.root.localToWorld(new T.Vector3(0, 0, 0.65)), head = mb.camera.getWorldPosition(new T.Vector3());
    mb.rig.position.x += p.x - head.x; mb.rig.position.z += p.z - head.z; mb.rig.updateMatrixWorld(true);
    for (let i = 0; i < 1200 && (mb.where() !== to || mb.airlock()); i++) await sleep(100);
    if (mb.where() !== to || mb.airlock()) return { ok: false, why: `the airlock cycle never finished (${mb.where()}, ${JSON.stringify(mb.airlock())})` };
    // Step out of the chamber, a pace into the hall or onto the Moon.
    const far = (mb.where() === 'in' ? mb.interior.doors : mb.world.doors).S.root.localToWorld(new T.Vector3(0, 0, mb.where() === 'in' ? -1.2 : 2.6));
    const h2 = mb.camera.getWorldPosition(new T.Vector3());
    mb.rig.position.x += far.x - h2.x; mb.rig.position.z += far.z - h2.z; mb.rig.updateMatrixWorld(true);
    mb.sendPose();
    await sleep(300);
    return { ok: true };
  }
  const need = async place => place ? through(place) : { ok: true };
  window.smoke = {
    sleep, until, face, work, through,
    // Pick a tool up from wherever it lies (one at a time: clicking it puts down whatever is in the hand).
    async carry(id) {
      if (mb.fx.inHand === id) return { ok: true };
      const pose = mb.fx.toolState(id);
      if (!pose || pose.state === 'gone') return { ok: false, why: `the ${id} is not there to take` };
      const r0 = await need(pose.place === 'hall' ? 'in' : 'out'); if (!r0.ok) return r0;
      const r = await work(toolBox(id), `the ${id}`, 30);
      if (!r.ok) return r;
      return (await until(s => s.held === id, 8)) ? { ok: true } : { ok: false, why: `the server never put the ${id} in the hand` };
    },
    async dust() { const r = await need('out'); return r.ok ? work(m => F.dustCells.includes(m), 'a dusty cell', 60) : r; },
    async pullWheel() { const r = await need('out'); return r.ok ? work(m => owns(F.wheel, m), 'the broken wheel', 20) : r; },
    async fitTire() { const r = await need('out'); return r.ok ? work(m => owns(F.hub, m), 'the bare hub', 20) : r; },
    async weld() { const r = await need('out'); return r.ok ? work(m => m.parent === F.crack, 'the crack', 30) : r; },
    async plug(cable, socket) {
      const r0 = await need('in'); if (!r0.ok) return r0;
      const plug = F.plugs[cable].children.find(c => c.userData.click);
      // The plug drops out of its socket on the next drawn frame. Wait until it is hanging where it can be picked up.
      if (!(await until(() => F.plugs[cable].position.distanceTo(F.plugRest[cable]) < 0.01, 15))) return { ok: false, why: `the ${F.plugs[cable].userData.color} plug never dropped out of its socket` };
      if (!(await face(plug)) || !mb.use()) return { ok: false, why: `could not pick up the ${F.plugs[cable].userData.color} plug` };
      const sock = mb.fx.targets().filter(m => m.parent === F.board && m.userData.click).sort((a, b) => a.position.distanceTo(F.sockets[socket]) - b.position.distanceTo(F.sockets[socket]))[0];
      if (!sock || !(await face(sock)) || !mb.use()) return { ok: false, why: `could not reach socket ${socket}` };
      return (await until(s => s.scene.board === null || s.scene.board[cable].seated, 8)) ? { ok: true } : { ok: false, why: `the ${F.plugs[cable].userData.color} plug did not seat in socket ${socket}` };
    },
    standAt(x, z) { mb.standAt(mb.where(), x, z, 0); mb.camera.rotation.x = 0; mb.sendPose(); },
  };
}

const act = async (page, name, fn, arg) => {
  const r = await page.evaluate(fn, arg);
  if (!r || !r.ok) problems.push(`astronaut: ${name}: ${r ? r.why : 'no result'}`);
  step(`${name}: ${r && r.ok ? 'ok' : 'FAILED'}`);
  return !!r && r.ok;
};
const waitFor = async (page, name, fn, seconds) => {
  const ok = await page.evaluate(([f, s]) => window.smoke.until(new Function('s', `return (${f})(s)`), s), [fn.toString(), seconds / SCALE]);
  if (!ok) problems.push(`astronaut: waited ${seconds} s for ${name}`);
  return !!ok;
};

try {
  step('opening Mission Control and the astronaut page');
  const ctl = await openOwn('console', '/control', { width: 1280, height: 1400 });
  const astro = await openOwn('astronaut', '/astronaut');
  await astro.waitForTimeout(1000);
  await astro.click('#radioBtn');
  await astro.waitForTimeout(300);
  await astro.click('#deskBtn');
  await astro.waitForTimeout(500);
  const pitch = await astro.evaluate(() => Math.abs(window.moonbase.camera.rotation.x));
  if (pitch > 0.2) problems.push(`astronaut: camera pitched ${pitch.toFixed(2)} rad right after entering (pointer-lock jump)`);
  await astro.evaluate(installHelpers);

  // Ready up. The astronaut does not: entering the game (the desk button here) tells the server they are
  // suited, and Mission Control (2-player mode, so the crew is complete) calls them GO from their panel
  // in the lobby, then presses its own Ready. The mission starts itself after the countdown.
  await ctl.waitForFunction(() => window.moonbase.state()?.suited === true, null, { timeout: 20000, polling: 250 }).catch(() => problems.push('lobby: the server never heard the astronaut suit up'));
  if (await astro.evaluate(() => window.moonbase.board.visible && window.moonbase.where() === 'in') !== true) problems.push('astronaut: no status board in the hall at the start');
  await ctl.click('[data-ready-for]');
  await ctl.waitForFunction(() => (window.moonbase.state()?.ready || []).includes('astronaut'), null, { timeout: 20000, polling: 250 }).catch(() => problems.push('lobby: Mission Control could not call the astronaut GO'));
  await ctl.click('[data-ready]');
  await ctl.waitForFunction(() => window.moonbase.state()?.phase === 'run', null, { timeout: 60000, polling: 250 });
  step('mission started');
  if (await astro.evaluate(() => window.moonbase.where()) !== 'in') problems.push('astronaut: the mission did not start in the hall');

  // 0:05 the solar panels get dusty. Find the brush in the hall, take it out through the airlock, brush every cell.
  await waitFor(astro, 'dust on the panels', s => s.phase === 'run' && s.scene.dust, 30);
  await ctl.waitForFunction(() => window.moonbase.state().power?.solar < 60, null, POLL).catch(() => problems.push('console: the Scientist\'s solar gauge should be low with dusty panels'));
  await ctl.waitForFunction(() => window.moonbase.state().tools?.brush?.area === 'BENCH', null, POLL).catch(() => problems.push('console: the tool log does not have the brush on the bench'));
  await shot(ctl, 'mission-control-dust');
  await act(astro, 'take the brush', () => window.smoke.carry('brush'));
  await act(astro, 'brush the panels', () => window.smoke.dust());
  await waitFor(astro, 'the panels to be clean', s => !s.scene.dust, 8);

  // 0:45 the rover wheel breaks and the radar goes with it. The tire is in the corridor: go back in for it
  // (taking it puts the brush down in the hall), and bring it out.
  await waitFor(astro, 'the rover wheel to break', s => s.scene.wheel === 1, 60);
  await ctl.waitForFunction(() => window.moonbase.state().radar === false, null, POLL).catch(() => problems.push('console: the Technician still has radar with the wheel broken'));
  await act(astro, 'take the tire', () => window.smoke.carry('tire'));
  await ctl.waitForFunction(() => window.moonbase.state().tools?.tire?.at === 'hand' && window.moonbase.state().tools?.brush?.at === 'loose', null, POLL).catch(() => problems.push('console: the tool log does not show the tire in hand and the brush put down'));
  await act(astro, 'pull the broken wheel off', () => window.smoke.pullWheel());
  await waitFor(astro, 'the wheel to come off', s => s.scene.wheel === 2, 8);
  await act(astro, 'fit the tire', () => window.smoke.fitTire());
  await waitFor(astro, 'the rover to be fixed', s => s.scene.wheel === 0, 8);

  // 1:25 the radar shows a shower coming. Get inside and wait it out.
  await ctl.waitForFunction(() => !!window.moonbase.state().meteor, null, { timeout: 60000 / SCALE, polling: 250 }).then(() => step('meteor warning seen on the radar'), () => problems.push('console: no meteor warning on the radar'));
  await shot(ctl, 'mission-control-meteor');
  await act(astro, 'go in through the airlock', () => window.smoke.through('in'));
  await waitFor(astro, 'the shower to start', s => s.scene.meteor !== null, 30);
  await waitFor(astro, 'the shower to end', s => s.scene.meteor === null && s.scene.hull, 20);
  const hits = await astro.evaluate(() => window.moonbase.state().suit);
  if (hits) problems.push('astronaut: hit by the shower while inside');

  // The shower left dust, a hull breach and a tripped switchboard. The board first, while the Scientist
  // still has a screen to read the wiring diagram from: it is in the hall, where we are.
  const wiring = await ctl.evaluate(async () => { for (let i = 0; i < 50; i++) { const w = window.moonbase.state().wiring; if (w) return w; await new Promise(r => setTimeout(r, 100)); } return null; });
  if (!wiring) problems.push('console: the Scientist has no wiring diagram for the tripped switchboard');
  for (const w of wiring || []) {
    await act(astro, `plug the ${w.color} cable into socket ${w.socket}`, ({ color, socket }) => {
      const cable = window.moonbase.world.fixtures.plugs.findIndex(p => p.userData.color === color);
      return window.smoke.plug(cable, socket);
    }, w);
  }
  await waitFor(astro, 'the switchboard to be fixed', s => !s.scene.board, 8);
  await act(astro, 'take the brush again', () => window.smoke.carry('brush'));
  await act(astro, 'brush the panels again', () => window.smoke.dust());
  await waitFor(astro, 'the panels to be clean again', s => !s.scene.dust, 8);
  await act(astro, 'take the welder', () => window.smoke.carry('welder'));
  await act(astro, 'weld the crack', () => window.smoke.weld());
  await waitFor(astro, 'the hull to be sealed', s => !s.scene.hull, 8);

  // 2:30 the suit leaks. The patch kit is by the lockers; then F.
  await act(astro, 'take the patch kit', () => window.smoke.carry('patch'));
  await waitFor(astro, 'the suit leak', s => s.suit || s.phase !== 'run', 60);
  await astro.keyboard.down('f');
  await waitFor(astro, 'the suit to be patched', s => !s.suit, 8);
  await astro.keyboard.up('f');

  await ctl.waitForFunction(() => window.moonbase.state()?.phase === 'results', null, { timeout: 120000 / SCALE, polling: 250 });
  const result = await ctl.evaluate(() => window.moonbase.state().result);
  step('result ' + JSON.stringify(result));

  if (!result.won) problems.push(`mission lost: ${result.reason}`);
  if (result.fixed !== 6) problems.push(`expected all 6 faults fixed, got ${result.fixed}`);
  if (result.hits || result.blackouts || result.mistakes) problems.push(`a clean run should have no hits, blackouts or wrong plugs: ${JSON.stringify(result)}`);
  await shot(ctl, 'mission-control-results');
  // The rest is on the astronaut's page alone. Mission Control's page draws the rover camera, a second
  // 3D scene, and in software rendering the two starve each other.
  await browsers[0].close();

  step('hand gestures');
  // Hand-tracking gestures, without a headset: tell the page its two input sources are bare hands,
  // then place them and fire the same "select" events a pinch fires, and run the per-frame hand code.
  const gestures = await astro.evaluate(async () => {
    const mb = window.moonbase, [left, right] = mb.controllers, bad = [];
    const stood = { p: mb.rig.position.clone(), ry: mb.rig.rotation.y, rx: mb.camera.rotation.x };
    left.dispatchEvent({ type: 'connected', data: { handedness: 'left', hand: {} } });
    right.dispatchEvent({ type: 'connected', data: { handedness: 'right', hand: {} } });
    mb.rig.position.set(0, 0, 9); mb.rig.rotation.y = 0; mb.camera.rotation.x = 0; // open ground, facing the base
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));   // let the page see where the head now is
    const place = (lx, rx) => { left.position.set(lx, 1.3, -0.4); right.position.set(rx, 1.3, -0.4); left.updateMatrix(); right.updateMatrix(); mb.rig.updateMatrixWorld(true); };
    const frame = () => { mb.rig.updateMatrixWorld(true); mb.handControls(false); };
    const pinch = c => c.dispatchEvent({ type: 'selectstart' }), release = c => c.dispatchEvent({ type: 'selectend' });
    const where = () => mb.rig.position.x.toFixed(2) + ',' + mb.rig.position.z.toFixed(2) + ',' + mb.rig.rotation.y.toFixed(2);
    const near = (got, want, what) => { if (Math.abs(got - want) > 0.05) bad.push(`${what}: zoom ${got.toFixed(2)}, expected ${want}`); };
    right.rotation.x = -0.5; // right hand points down at the ground a couple of metres ahead

    // Zoom in: right hand pinches first (the order that used to teleport), then the left; pull apart.
    const home = where();
    place(-0.1, 0.1); frame();
    pinch(right); frame(); pinch(left); frame();
    near(mb.zoom(), 1, 'both hands pinched, not moved');
    place(-0.3, 0.3); frame();
    near(mb.zoom(), 3, 'hands pulled from 20 cm to 60 cm apart');
    release(right); frame(); release(left); frame();
    near(mb.zoom(), 3, 'after letting go');
    if (where() !== home) bad.push(`zooming moved or turned the astronaut: ${home} -> ${where()}`);

    // Zoom out: push the hands together; below the threshold the scope closes.
    pinch(left); pinch(right); frame();
    place(-0.05, 0.05); frame();
    release(left); release(right); frame();
    near(mb.zoom(), 1, 'hands pushed back together');
    if (where() !== home) bad.push(`zooming out moved or turned the astronaut: ${home} -> ${where()}`);

    // Full spread stops at the limit.
    place(-0.05, 0.05); frame(); pinch(left); pinch(right); frame();
    place(-0.7, 0.7); frame();
    near(mb.zoom(), 6, 'hands pulled as wide as they go');
    release(left); release(right); mb.setZoom(1);

    // The one-handed gestures still work: left pinch + drag turns, right pinch teleports when let go.
    place(-0.2, 0.2); frame();
    pinch(left); frame(); place(-0.05, 0.2); frame(); release(left);
    if (Math.abs(Math.abs(mb.rig.rotation.y) - Math.PI / 6) > 0.01) bad.push(`left pinch + drag turned ${mb.rig.rotation.y.toFixed(2)} rad, expected 30 degrees`);
    mb.rig.rotation.y = 0; place(-0.2, 0.2); frame();
    const before = where();
    pinch(right); frame();
    if (where() !== before) bad.push('right pinch teleported before it was let go');
    release(right); frame();
    if (where() === before) bad.push('right pinch at the ground did not teleport on release');

    left.dispatchEvent({ type: 'disconnected' }); right.dispatchEvent({ type: 'disconnected' });
    mb.rig.position.copy(stood.p); mb.rig.rotation.y = stood.ry; mb.camera.rotation.x = stood.rx; // back to where we stood
    return bad;
  });
  for (const g of gestures) problems.push('hand gestures: ' + g);

  step('visor zoom');
  // The visor scope: look a little up from where we stand and zoom in. The scope must be on, its extra pass
  // must have drawn the scene, and WebGL must have no complaint: the first version of the scope drew
  // nothing but black because a copy between two buffers failed, which showed up only as a WebGL error.
  // Laptop players have no gesture for this; the test sets the zoom directly.
  const scope = await astro.evaluate(async () => {
    const mb = window.moonbase, pitch = mb.camera.rotation.x;
    mb.camera.rotation.x = pitch + 0.21;
    mb.setZoom(3);
    await new Promise(r => setTimeout(r, 4000)); // a few software-rendered frames
    return { on: mb.scope.visible, zoom: mb.zoom(), drawCalls: mb.scope.userData.drawCalls || 0, glError: mb.renderer.getContext().getError(), pitch };
  });
  if (!scope.on || scope.zoom !== 3) problems.push('visor zoom: the scope did not turn on: ' + JSON.stringify(scope));
  else if (scope.drawCalls < 1 || scope.glError) problems.push('visor zoom: the scope did not draw the scene: ' + JSON.stringify(scope));
  await view(astro, 'astronaut-zoom');
  await astro.evaluate(pitch => { const mb = window.moonbase; mb.setZoom(1); mb.camera.rotation.x = pitch; }, scope.pitch);

  step('radio key and wrist gauges, no microphone');
  // The radio and the wrist gauges are one control. Nothing is drawn over the view until the radio is
  // keyed (Tab on a laptop); then the arm comes up with the gauge cluster on it. This browser has no
  // microphone, so the arm must still come up and the cluster must say so, in amber.
  await watchGaugeText(astro);
  const rest = await armState(astro);
  if (rest.mic) problems.push('radio: this browser was not meant to have a microphone');
  if (rest.raise !== 0 || rest.visible || rest.keyed) problems.push('wrist gauges: the arm is in view with the radio idle: ' + JSON.stringify(rest));
  await astro.bringToFront();
  await astro.keyboard.down('t'); // the old talk key: it must do nothing now
  await astro.waitForTimeout(1500);
  const afterT = await armState(astro);
  if (afterT.keyed || afterT.raise !== 0) problems.push('radio: the T key still keys the radio: ' + JSON.stringify(afterT));
  await astro.keyboard.up('t');
  await astro.keyboard.down('Tab');
  await until('wrist gauges: holding Tab did not bring the arm up', async () => (await armState(astro)).raise === 1);
  const up = await armState(astro);
  if (!up.keyed || up.talking || up.shown !== 'nomic') problems.push('wrist gauges: with no microphone, Tab should raise the arm and show NO MICROPHONE: ' + JSON.stringify(up));
  await astro.waitForTimeout(1500);
  const face = await gaugeFace(astro);
  if (!face.drawn || !Number.isFinite(face.oxygen) || !Number.isFinite(face.seconds) || !Number.isFinite(face.alarms)) problems.push('wrist gauges: the gauge face is missing something: ' + JSON.stringify(face));
  if (face.text !== 0) problems.push(`wrist gauges: the face is meant to be icons only, but text was drawn on it ${face.text} time(s)`);
  if (face.overlays) problems.push(`wrist gauges: ${face.overlays} other thing(s) are still fixed to the view`);
  if (face.radio !== 'NO MICROPHONE' || face.lamp !== PAL.amber || face.icon !== 'microphone, barred') problems.push('wrist gauges: the face does not show a barred microphone in amber: ' + JSON.stringify(face));
  await view(astro, 'astronaut-wrist');
  await astro.keyboard.up('Tab');
  await until('wrist gauges: letting go of Tab did not lower the arm', async () => (await armState(astro)).raise === 0);

  step('through the airlock, power outage lighting, things knocked loose');
  // Through the airlock: walk into the chamber, the hatch shuts behind, the swap happens with the head
  // exactly where it was in the chamber, and the hatch in front opens onto the hall. The switchboard is
  // mounted there, and the outage lighting runs.
  const indoors = await astro.evaluate(async () => {
    const mb = window.moonbase, T = mb.THREE, wait = ms => new Promise(r => setTimeout(r, ms));
    if (mb.where() === 'in') { const r = await window.smoke.through('out'); if (!r.ok) return 'out: ' + r.why; }
    mb.standAt('out', 0.1, 3.25, 0); // in airlock S's chamber, facing the inner hatch
    const local = () => { const ch = (mb.where() === 'in' ? mb.interior.doors : mb.world.doors).S; return ch.root.worldToLocal(mb.camera.getWorldPosition(new T.Vector3())); };
    const before = local();
    for (let i = 0; i < 1200 && (mb.where() !== 'in' || mb.airlock()); i++) await wait(100);
    if (mb.where() !== 'in') return 'walking into airlock S never brought the astronaut inside';
    const after = local();
    if (after.distanceTo(before) > 0.02) return `the head jumped ${after.distanceTo(before).toFixed(3)} m in the chamber during the swap`;
    if (!mb.interior.group.visible || mb.world.rover.visible) return 'inside, but the wrong place is being drawn';
    if (mb.world.fixtures.board.parent !== mb.interior.mount) return 'no switchboard on the interior wall';
    mb.outage(true);
    for (let i = 0; i < 900 && mb.interior.phase !== 'backup'; i++) await wait(100);
    if (mb.interior.phase !== 'backup') return 'backup lights never came on, stuck in ' + mb.interior.phase;
    mb.outage(false);
    for (let i = 0; i < 900 && mb.interior.phase !== 'main'; i++) await wait(100);
    if (mb.interior.phase !== 'main') return 'roof lights never came back, stuck in ' + mb.interior.phase;
    // The hall starts clean; faults knock panels and cables loose, and fixing them puts them back.
    if (mb.interior.damage.broken) return 'the hall is not clean before anything has gone wrong';
    mb.wreck(true);
    const settled = () => mb.interior.damage.pieces.every(p => p.state === 'down') && mb.interior.damage.cables.every(c => c.state === 'loose');
    for (let i = 0; i < 900 && !settled(); i++) await wait(100);
    if (!settled()) return 'panels did not come down: ' + mb.interior.damage.pieces.map(p => p.state).join(',');
    mb.wreck(false);
    for (let i = 0; i < 300 && mb.interior.damage.broken; i++) await wait(100);
    if (mb.interior.damage.broken) return 'the fix did not put the panels and cables back';
    return 'ok';
  });
  if (indoors !== 'ok') problems.push('astronaut: ' + indoors);
  await view(astro, 'astronaut-interior');
  await astro.evaluate(() => window.moonbase.placeInside());

  await view(astro, 'astronaut-spawn');
  await Promise.all(browsers.map(b => b.close().catch(() => {})));

  // ---------- the radio, with a microphone ----------
  step('radio both ways, with a microphone');
  browser = await chromium.launch({ args: [...GL, ...MIC] });
  ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  // The Earth side is the Mission Ops seat alone: it has no 3D scene to starve the astronaut's.
  const ops = await seat('ops', '/ops');
  const radioman = await open('astronaut', '/astronaut');
  await radioman.waitForTimeout(1000);
  await radioman.click('#radioBtn');
  await until('radio: the astronaut page did not get its microphone', async () => (await armState(radioman)).mic);
  await radioman.click('#deskBtn');
  await radioman.waitForTimeout(500);
  const opsButton = () => ops.evaluate(() => document.getElementById('ptt').textContent);

  // Holding Tab raises the arm, puts the astronaut on the air, and Mission Ops is told 1.3 s later
  // (at once in the lobby). Letting go lowers the arm and ends the transmission.
  await radioman.bringToFront();
  await radioman.keyboard.down('Tab');
  await until('radio: holding Tab did not bring the arm up', async () => (await armState(radioman)).raise === 1);
  const onAir = await armState(radioman);
  if (!onAir.keyed || !onAir.talking || onAir.shown !== 'tx') problems.push('radio: holding Tab raised the arm but did not transmit: ' + JSON.stringify(onAir));
  await until('radio: Mission Ops was not told the astronaut is transmitting', async () => /ASTRONAUT IS TRANSMITTING/.test(await opsButton()));
  await radioman.waitForTimeout(1500);
  const red = await gaugeFace(radioman);
  if (red.radio !== 'TRANSMITTING' || red.lamp !== PAL.red || red.icon !== 'microphone, live') problems.push('wrist gauges: the face does not show a live microphone in red: ' + JSON.stringify(red));
  await radioman.keyboard.up('Tab');
  await until('radio: letting go of Tab did not lower the arm', async () => (await armState(radioman)).raise === 0);
  const offAir = await armState(radioman);
  if (offAir.keyed || offAir.talking) problems.push('radio: letting go of Tab did not end the transmission: ' + JSON.stringify(offAir));
  await until('radio: Mission Ops still shows the astronaut transmitting', async () => !/ASTRONAUT IS TRANSMITTING/.test(await opsButton()));

  // The other direction: Mission Ops holds Space and the astronaut is told. Being called does not
  // raise the arm; only the astronaut's own radio key does.
  await ops.bringToFront();
  await ops.keyboard.down('Space');
  await until('radio: the astronaut was not told Mission Ops is transmitting', async () => (await armState(radioman)).rx);
  const called = await armState(radioman);
  if (called.raise !== 0) problems.push('wrist gauges: the arm came up when Mission Ops called: ' + JSON.stringify(called));
  await ops.keyboard.up('Space');
  await until('radio: the astronaut still shows Mission Ops transmitting', async () => !(await armState(radioman)).rx);
} catch (e) {
  problems.push('smoke: ' + e.message);
} finally {
  await Promise.all([...browsers, browser].filter(Boolean).map(b => b.close().catch(() => {})));
  server?.kill();
}

if (problems.length) { console.error('SMOKE FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`smoke passed: the demo mission was played to a win through the laptop controls (tools found in the hall, one at a time, through the walk-in airlock, Mission Control calling GO); hand gestures, visor zoom, wrist gauges, the airlock swap and the radio both ways work. ${SHOTS ? `Screenshots in ${path.relative(ROOT, OUT)}/` : 'No screenshots taken (SMOKE_SHOTS=1 for those).'}`);
process.exit(0);
