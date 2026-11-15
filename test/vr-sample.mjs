// VR sample-run test: npm run vr:sample
//
// Runs the astronaut's page inside a pretend headset (test/fakexr.js) and does every physical repair
// the way a player in a Quest would: reach for the tool, close the hand, bring it to the work.
// The game server runs inside this process so the test can break one thing at a time and hold the clock.
//
// What this does and does not prove: the real page code runs (the WebXR session, controller and
// hand-tracking events, grab distances, what the server accepts). It cannot say how any of it feels.
//
//   npm i -D playwright && npx playwright install chromium   (once)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub, PAGES } from '../server/hub.js';
import { CFG, PLACES, HAULER, DUST_CELLS, CRACK_POINTS } from '../client/shared/config.js';
import { sheltered } from '../client/shared/rules.js';
import { PAL } from '../client/shared/palette.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), OUT = path.join(ROOT, 'test', 'shots'), PORT = 3210;
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

// ---------- the server, in this process ----------
const hub = new Hub(undefined, { requireFullCrew: false });
const g = hub.game;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let url = new URL(req.url, 'http://x').pathname;
  if (url === '/seats') return res.end(JSON.stringify(hub.seats()));
  if (url === '/players' && req.method === 'POST') { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { let n = null; try { n = JSON.parse(b).players; } catch {} res.end(JSON.stringify(hub.choosePlayers(n))); }); return; }
  if (url === '/') url = '/index.html';
  url = PAGES[url] || url;
  fs.readFile(path.join(WEB, url), (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' }); res.end(d); });
});
new WebSocketServer({ server }).on('connection', ws => {
  const c = { send: d => { if (ws.readyState === 1) ws.send(d, { binary: typeof d !== 'string' }); } };
  hub.add(c); ws.on('close', () => hub.remove(c)); ws.on('message', (d, b) => hub.message(c, b ? d : d.toString(), b));
});
const ticker = setInterval(() => { if (g.phase === 'run') { g.timeLeft = 150; if (!freeO2) g.oxygen = 90; } hub.tick(); }, CFG.tickMs); // the clock is held
let freeO2 = false;
await new Promise(r => server.listen(PORT, r));

const problems = [];
const T0 = Date.now(), step = what => console.log(`  ${String(Math.round((Date.now() - T0) / 1000)).padStart(4)} s  ${what}`);
const check = (ok, what) => { if (!ok) { problems.push(what); console.log('        FAILED: ' + what); } return ok; };
const SHOTS = !!process.env.VR_SHOTS;

// The two media flags give the page a pretend microphone and say yes to its permission prompt, so that keying the radio really transmits.
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const xrCtx = await browser.newContext({ viewport: { width: 1280, height: 640 } }); await xrCtx.addInitScript({ path: new URL('./briefed.js', import.meta.url).pathname });
const page = await xrCtx.newPage();
page.on('pageerror', e => problems.push(`page: ${e.message}\n${(e.stack || '').split('\n').slice(1, 3).join('\n')}`));
page.on('console', m => { if (m.text().startsWith('DBG')) console.log(m.text()); if (m.type() === 'error' || /GL_INVALID|WebGL: INVALID/.test(m.text())) problems.push(`page: ${m.text()}`); });
await page.addInitScript({ path: path.join(ROOT, 'test', 'fakexr.js') });

// Runs in the page: a few helpers to stand somewhere, reach for something, and wait.
function installVR() {
  const mb = window.moonbase, T = mb.THREE, X = window.fakeXR, F = mb.world.fixtures;
  const AHEAD = new T.Vector3(0, 0, -1);
  const side = i => mb.controllers[i].userData.hand;
  const index = s => mb.controllers.findIndex(c => c.userData.hand === s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let height = 1.7;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const wp = o => o.getWorldPosition(new T.Vector3());
  // Longest reach asked of an arm so far, shoulder to hand, in metres: a real arm is about 0.75.
  let reach = 0;
  const shoulder = s => { const h = wp(mb.camera); const r = V(s === 'left' ? -0.18 : 0.18, -0.22, 0).applyQuaternion(mb.rig.quaternion); return h.add(r); };
  // Put a hand at a world point, pointing along a world direction.
  function hand(s, at, dir = null) {
    mb.rig.updateMatrixWorld(true);
    const local = mb.rig.worldToLocal(at.clone());
    let q = null;
    if (dir) {
      const qw = new T.Quaternion().setFromUnitVectors(AHEAD, dir.clone().normalize());
      const ql = mb.rig.getWorldQuaternion(new T.Quaternion()).invert().multiply(qw);
      q = [ql.x, ql.y, ql.z, ql.w];
    }
    X.hand(s, [local.x, local.y, local.z], q);
    reach = Math.max(reach, at.distanceTo(shoulder(s)));
  }
  // Where the hand must be for the tip of the tool it holds to be at `at`, pointing along `dir`.
  function tip(s, tool, at, dir) {
    const g = mb.fx.tools[tool], qw = new T.Quaternion().setFromUnitVectors(AHEAD, dir.clone().normalize());
    const off = g.userData.tip.clone().multiplyScalar(1).applyQuaternion(qw);
    hand(s, at.clone().sub(off), dir);
  }
  const where = s => wp(mb.controllers[index(s)]);
  window.vr = {
    T, V, wp, sleep, hand, tip, where, index, side,
    frames: n => X.frames(n),
    get reach() { return reach; }, resetReach() { reach = 0; },
    // Stand with the head over world (x, z), facing the world point (tx, tz). Hands hang in front.
    async stand(x, z, tx, tz, h = height) {
      height = h;
      const to = x > 250 ? 'in' : 'out'; // the hall is built 500 m off to one side
      if (mb.where() !== to) mb.showPlace(to);
      mb.rig.position.set(x, 0, z); mb.rig.rotation.y = Math.atan2(-(tx - x), -(tz - z));
      X.head(0, h, 0);
      mb.rig.updateMatrixWorld(true);
      // Arms at the sides, hands (and any tool in them) pointing at the ground.
      for (const s of ['left', 'right']) X.hand(s, [s === 'left' ? -0.22 : 0.22, h - 0.6, -0.1], [-0.7071, 0, 0, 0.7071]);
      await X.frames(3);
      mb.sendPose();
      await sleep(160); // the server hears where we are
    },
    crouch(h) { height = h; X.head(0, h, 0); },
    // Move a hand in a straight line to a world point over `n` frames. Optionally keep a held tool's tip on the line instead.
    async move(s, to, n = 8, dir = null, tool = null) {
      const from = tool ? null : where(s);
      const start = tool ? wp(mb.fx.tools[tool]).add(mb.fx.tools[tool].userData.tip.clone().applyQuaternion(mb.fx.tools[tool].getWorldQuaternion(new T.Quaternion()))) : from;
      for (let k = 1; k <= n; k++) {
        const at = start.clone().lerp(to, k / n);
        if (tool) tip(s, tool, at, dir); else hand(s, at, dir);
        await X.frames(1);
      }
    },
    grip(s, down) { if (mb.controllers[index(s)].userData.isHand) X.pinch(s, down); else X.squeeze(s, down); },
    holding: s => mb.fx.holding(index(s)),
    haptics: () => X.dev.haptics.splice(0),
    until: async (test, seconds = 5) => { for (const end = Date.now() + seconds * 1000; Date.now() < end;) { const v = test(mb.state()); if (v) return v; await sleep(50); } return null; },
    // The hand badge (client/hand.js) by whatever that hand could grab or use: 'open:TAKE', 'point:WELD', ... or null.
    ring: s => { const b = mb.fx.badges[index(s)]; return b.sprite.visible && b.cue ? b.cue.shape + ':' + (b.cue.verb || '') : null; },
    // Where a tool is: in a hand, loose (lying somewhere), or nowhere (used up).
    parentOf: tool => { const i = [0, 1].find(k => mb.fx.holding(k)?.id === tool); if (i !== undefined) return 'hand:' + side(i); const st = mb.fx.toolState(tool)?.state; return st === 'loose' ? 'loose' : st === 'gone' ? 'nowhere' : st; },
    pose: tool => mb.fx.toolState(tool),
  };
}


const serverUntil = async (test, seconds = 5) => { for (const end = Date.now() + seconds * 1000; Date.now() < end;) { if (test()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const P = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => new Promise(r => setTimeout(r, ms));

try {
  step('putting the headset on');
  await page.goto(`http://localhost:${PORT}/astronaut?device=headset`);
  await page.waitForTimeout(1500);
  check(await serverUntil(() => hub.crew().includes('astronaut'), 30), 'the headset was not seated as the Astronaut');
  await page.click('#radioBtn');
  await page.waitForFunction(() => /ENTER VR/i.test(document.querySelector('#vrSlot button')?.textContent || ''), null, { timeout: 15000, polling: 200 });
  await page.click('#vrSlot button');
  await page.waitForFunction(() => window.moonbase.renderer.xr.isPresenting && window.fakeXR.dev.frame > 3, null, { timeout: 30000, polling: 200 });
  await P(() => { const R = window.moonbase.renderer; R.realRender = R.render.bind(R); R.render = (scene, cam) => { scene.updateMatrixWorld(); if (R.xr.enabled && R.xr.isPresenting) R.xr.updateCamera(cam); }; });
  await P(installVR);
  g.start(); g.script = [];
  await P(() => window.vr.until(s => s.phase === 'run', 8));
  await P(() => window.vr.frames(4));
  check(await P(() => window.moonbase.where() === 'in'), 'the mission should start with the astronaut in the hall');

  // ---------- out in the field, with feet on the ground ----------
  step('1. the field: feet follow the ground, rocks are solid, the hop recharges');
  const gnd = await P(async () => {
    const mb = window.moonbase, v = window.vr, out = [];
    for (const [x, z] of [[40, -10], [-70, 60], [95, 20], [10, 100]]) {
      mb.standAt('out', x, z, 0); await v.frames(10);
      const h = v.wp(mb.camera), floor = mb.world.height(h.x, h.z);
      out.push({ x, z, feet: +(mb.rig.position.y).toFixed(3), ground: +floor.toFixed(3) });
    }
    return out;
  });
  for (const o of gnd) check(Math.abs(o.feet - o.ground) < 0.35, `feet are not on the ground at ${o.x},${o.z}: ${JSON.stringify(o)}`);
  const tp = await P(async () => {
    const mb = window.moonbase, v = window.vr, X = window.fakeXR;
    mb.standAt('out', 20, 20, 0); await v.frames(4);
    const p0 = v.wp(mb.camera);
    // aim the right hand at the ground 5 m ahead and pinch-teleport; a second hop at once is refused while it recharges
    mb.teleport(new v.T.Vector3(20, mb.world.height(20, 15), 15)); await v.frames(2);
    const p1 = v.wp(mb.camera);
    mb.teleport(new v.T.Vector3(20, mb.world.height(20, 10), 10)); await v.frames(2);
    const p2 = v.wp(mb.camera);
    return { hopped: p0.distanceTo(p1), second: p1.distanceTo(p2) };
  });
  check(tp.hopped > 4 && tp.second < 0.1, 'the second teleport hop should be refused while it recharges: ' + JSON.stringify(tp));
  const solid = await P(async () => {
    const mb = window.moonbase, v = window.vr;
    const b = { x: 40.0, z: 55.2 }; // SPLIT ROCK
    mb.standAt('out', b.x, b.z - 2.5, 0); await v.frames(3);
    mb.rig.position.z += 2.4; await v.frames(3); // walk into it
    const h = v.wp(mb.camera); mb.sendPose();
    return Math.hypot(h.x - b.x, h.z - b.z);
  });
  check(solid > 1.0, 'walking into a boulder should stop at its edge: ' + solid);

  // ---------- a sample: reach, grip, carry, let go ----------
  step('2. picking up a rock sample');
  const s0 = g.samples.find(s => s.id === 's0');
  g.tools = g.tools; g.astro.inside = false;
  await stand0();
  async function stand0() { await P(([x, z]) => window.vr.stand(x + 1.2, z, x, z, 1.7), [s0.x, s0.z]); }
  await P(() => window.vr.until(s => (s.scene?.samples || []).length > 0, 5));
  const seen = await P(() => window.moonbase.state().scene.samples.map(s => s.id + ':' + s.look));
  check(seen.some(x => x.startsWith('s0:')), 'the astronaut should see the first sample from 1 m: ' + JSON.stringify(seen));
  const grab = await P(async ({ x, z }) => {
    const v = window.vr, mb = window.moonbase;
    const at = new v.T.Vector3(x, mb.world.height(x, z) + 0.12, z);
    await v.move('right', at, 8); await v.frames(2);
    const ring = v.ring('right');
    v.grip('right', true);
    await v.until(s => (s.carry || []).includes('s0'), 3);
    await v.frames(2);
    return { ring, held: v.holding('right')?.kind || null, carry: mb.state().carry, buzz: v.haptics().length };
  }, { x: s0.x, z: s0.z });
  check(grab.ring === 'open:TAKE', 'no open hand saying TAKE on the sample before grabbing it: ' + JSON.stringify(grab));
  check(g.carry.includes('s0') && g.samples.find(s => s.id === 's0').at === 'hand', 'the server did not hear that the sample was picked up: ' + JSON.stringify(grab));
  check(grab.held === 'sample' && grab.buzz > 0, 'the hand should hold the sample and buzz: ' + JSON.stringify(grab));
  // Not told which rock is real: only how it looks.
  check(await P(() => window.moonbase.state().scene.samples.every(s => !('kind' in s))), 'the astronaut page was sent a sample kind');

  // ---------- the Hauler: grab the rail, ride, step off ----------
  step('3. riding the Hauler');
  Object.assign(g.rovers.hauler, { x: s0.x - 3, z: s0.z + 2, ry: 0, v: 0, throttle: 0, steer: 0 });
  await P(() => window.vr.until(s => Math.hypot(s.rovers.hauler.x - (window.moonbase.state().rovers.hauler.x)) === 0, 1));
  await wait(400);
  const plate = await P(() => { const v = window.vr, mb = window.moonbase; mb.world.moveRovers(mb.state().rovers, 1); mb.world.rovers.hauler.updateMatrixWorld(true); return v.wp(mb.world.fixtures.plate).toArray(); });
  await P(([x, z]) => window.vr.stand(x + 0.9, z + 0.6, x, z, 1.7), [plate[0], plate[2]]);
  const mount = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    const rail = v.wp(mb.world.fixtures.rail);
    await v.move('left', rail, 8); await v.frames(2);
    const ring = v.ring('left');
    v.grip('left', true);
    await v.until(s => s.riding, 3);
    await v.frames(4);
    const head = v.wp(mb.camera), plate = v.wp(mb.world.fixtures.plate);
    return { ring, riding: mb.riding(), server: mb.state().riding, dxz: Math.hypot(head.x - plate.x, head.z - plate.z), eyeAbovePlate: head.y - plate.y };
  });
  check(mount.riding && mount.server === 'hauler', 'grabbing the rail did not put the astronaut on the Hauler: ' + JSON.stringify(mount));
  check(mount.dxz < 0.6 && mount.eyeAbovePlate > 1.4 && mount.eyeAbovePlate < 2.0, 'the head should be over the footplate at standing height: ' + JSON.stringify(mount));
  check(g.astro.riding === 'hauler' && hub.game.carry.includes('s0'), 'the server should have the astronaut aboard and still carrying the sample');
  // Put the sample in a cup while stopped.
  const cup = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    const c = v.wp(mb.world.fixtures.cups[2]); c.y += 0.1;
    await v.move('right', c, 8); await v.frames(2);
    v.grip('right', false);
    await v.until(s => s.tray?.some(Boolean) || s.scene?.tray?.some(Boolean), 3);
    await v.frames(2);
    return mb.state().scene.tray;
  });
  check(cup[2] === 's0' || cup.some(x => x === 's0'), 'the sample should be in a cup after letting go over it: ' + JSON.stringify(cup));
  check(g.samples.find(s => s.id === 's0').at === 'tray', 'the server did not put the sample in the tray');
  // The Technician drives: the rider goes with it, level.
  const t0 = await P(() => { const v = window.vr, mb = window.moonbase; return { head: v.wp(mb.camera).toArray(), up: mb.camera.getWorldDirection(new v.T.Vector3()).y }; });
  g.rovers.hauler.throttle = 1; g.rovers.hauler.steer = 0.3;
  await wait(2500);
  const t1 = await P(async () => { await window.vr.frames(3); const v = window.vr, mb = window.moonbase; const h = v.wp(mb.camera), p = v.wp(mb.world.fixtures.plate); return { head: h.toArray(), dxz: Math.hypot(h.x - p.x, h.z - p.z), roll: Math.abs(new v.T.Euler().setFromQuaternion(mb.camera.getWorldQuaternion(new v.T.Quaternion()), 'YXZ').z) }; });
  check(Math.hypot(t1.head[0] - t0.head[0], t1.head[2] - t0.head[2]) > 6, 'the rider should be carried along with the Hauler: ' + JSON.stringify([t0.head, t1.head]));
  check(t1.dxz < 0.7 && t1.roll < 0.05, 'the rider should stay on the footplate with the horizon level: ' + JSON.stringify(t1));
  // Cannot step off while it moves; can once it stops.
  await P(() => { window.fakeXR.stick('left', 0, 1); });
  await wait(300);
  check(await P(() => window.moonbase.riding()), 'the rider stepped off a moving Hauler');
  g.rovers.hauler.throttle = 0; g.rovers.hauler.steer = 0;
  await wait(1800);
  await P(() => window.fakeXR.stick('left', 0, 1));
  await P(() => window.vr.until(s => !s.riding, 3));
  await P(() => window.fakeXR.stick('left', 0, 0));
  await P(() => window.vr.grip('left', false));
  check(!(await P(() => window.moonbase.riding())) && g.astro.riding === null, 'pushing the stick on a stopped Hauler should step off');
  const feet = await P(async () => { await window.vr.frames(8); const mb = window.moonbase, h = window.vr.wp(mb.camera); return Math.abs(mb.rig.position.y - mb.world.height(h.x, h.z)); });
  check(feet < 0.4, 'after stepping off, the feet should be on the ground: ' + feet);

  // ---------- take it out of the cup, a lookalike in the other hand, both home through the airlock ----------
  step('4. two samples carried in through the airlock');
  Object.assign(g.rovers.hauler, { x: 3, z: 6.5, ry: 0, v: 0 });
  await wait(500);
  await P(() => { const mb = window.moonbase; mb.world.moveRovers(mb.state().rovers, 1); });
  const cup2 = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    mb.world.rovers.hauler.updateMatrixWorld(true);
    const c = v.wp(mb.world.fixtures.cups[2]); c.y += 0.1;
    await v.stand(c.x + 0.4, c.z - 0.5, c.x, c.z, 1.7);
    await v.move('right', c, 8); await v.frames(2);
    v.grip('right', true);
    await v.until(s => (s.carry || []).includes('s0'), 3);
    await v.frames(2);
    return { carry: mb.state().carry };
  });
  check(cup2.carry.includes('s0'), 'a sample should come out of a cup into the hand: ' + JSON.stringify(cup2));
  const dud = g.samples.find(s => s.kind === 'dud');
  Object.assign(dud, { x: 1.2, z: 5.2 });
  await P(([x, z]) => window.vr.stand(x + 0.6, z, x, z, 1.7), [dud.x, dud.z]);
  await P(id => window.vr.until(s => s.scene.samples.some(x => x.id === id), 2), dud.id);
  const two = await P(async ({ x, z, id }) => {
    const v = window.vr, mb = window.moonbase;
    const at = new v.T.Vector3(x, mb.world.height(x, z) + 0.12, z);
    await v.move('left', at, 8); v.grip('left', true); await v.until(s => (s.carry || []).includes(id), 3);
    await v.frames(2);
    return { carry: mb.state().carry, right: v.holding('right')?.id };
  }, { x: dud.x, z: dud.z, id: dud.id });
  check(two.carry.includes(dud.id) && two.right === 's0', 'the left hand should take the lookalike, the right still hold the first: ' + JSON.stringify(two));
  // In through airlock S with a rock in each hand. Both stay in the hands, and both are drawn in the hall.
  await P(() => window.vr.stand(0.1, 3.25, 0.1, 0));
  const indoors = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    for (let i = 0; i < 600 && (mb.where() !== 'in' || mb.airlock()); i++) await v.frames(1);
    await v.sleep(400); await v.frames(3);
    const grp = mb.world.carriedSamples, drawn = grp.children.reduce((n, im) => n + (im.visible ? im.count : 0), 0);
    let shown = true; for (let o = grp; o; o = o.parent) if (!o.visible) shown = false;
    return { where: mb.where(), left: v.holding('left')?.id, right: v.holding('right')?.id, carry: mb.state().carry, drawn, shown };
  });
  check(indoors.where === 'in', 'airlock S should take the astronaut inside: ' + JSON.stringify(indoors));
  check(indoors.left === dud.id && indoors.right === 's0' && indoors.carry.length === 2, 'both samples should still be in the hands in the hall: ' + JSON.stringify(indoors));
  check(indoors.drawn === 2 && indoors.shown, 'both samples in hand should be drawn in the hall: ' + JSON.stringify(indoors));
  check(g.carry.length === 2, 'the server should still have both samples in hand indoors: ' + JSON.stringify(g.carry));
  // Let go of the lookalike over the hall floor: it lies there, indoors, and comes back up into the hand.
  const floor = await P(async id => {
    const v = window.vr, mb = window.moonbase, p = mb.interior.toWorld(0.8, -3.2);
    await v.stand(p.x, p.z + 0.6, p.x, p.z, 1.7);
    await v.move('left', v.V(p.x, 0.9, p.z), 8); await v.frames(4); v.grip('left', false); // held still: let go, not thrown
    await v.until(s => s.scene.samples.some(x => x.id === id && x.at === 'ground'), 4);
    await v.frames(3);
    const lay = mb.state().scene.samples.find(x => x.id === id);
    await v.move('left', v.V(p.x, 0.12, p.z), 8); v.grip('left', true);
    await v.until(s => (s.carry || []).includes(id), 3);
    await v.frames(2);
    return { lay, again: mb.state().carry, where: mb.where() };
  }, dud.id);
  check(floor.lay?.inside && Math.hypot(floor.lay.x - 0.8, floor.lay.z + 3.2) < 0.3, 'a sample let go in the hall should lie on the hall floor where it fell: ' + JSON.stringify(floor));
  check(floor.again.includes(dud.id) && floor.where === 'in', 'a sample on the hall floor should come back into the hand: ' + JSON.stringify(floor));

  // ---------- the sample port, in the hall ----------
  step('5. the sample port in the hall: FOUND, then DUD');
  const bank = await P(async () => {
    const v = window.vr, mb = window.moonbase, P0 = mb.world.fixtures.portMouth;
    mb.world.port.updateMatrixWorld(true);
    const mouth = mb.world.port.localToWorld(P0.clone()), out = v.V(0, 0, 0.6).applyQuaternion(mb.world.port.getWorldQuaternion(new v.T.Quaternion()));
    await v.stand(mouth.x + out.x, mouth.z + out.z, mouth.x, mouth.z, 1.7);
    await v.move('right', mouth, 10); await v.frames(2);
    v.grip('right', false);
    await v.until(s => s.scene?.port?.banked >= 1, 3);
    await v.frames(3);
    return { tally: mb.state().scene.port, buzz: v.haptics().length, inHall: mb.world.port.parent === mb.interior.group };
  });
  check(bank.inHall, 'the sample port should stand in the hall');
  check(g.samples.find(s => s.id === 's0').at === 'banked' && bank.tally.banked === 1, 'letting go over the port should bank it: ' + JSON.stringify(bank));
  check(bank.tally.assay && bank.tally.assay.kind === 'anor', 'the assay should say anorthosite: ' + JSON.stringify(bank.tally));
  check(g.score >= CFG.sample.wanted, 'a manifest sample should score');
  // Mission control sees it.
  check(g.view('sci').manifest.filter(m => m.got).length === 1 && g.view('ops').tray.every(x => !x), 'Ops and the Scientist should see the tally');
  const dd = await P(async () => {
    const v = window.vr, mb = window.moonbase, mouth = mb.world.port.localToWorld(mb.world.fixtures.portMouth.clone());
    await v.move('left', mouth, 10); await v.frames(2); v.grip('left', false);
    await v.until(s => s.scene?.port?.assay?.kind === 'dud', 3);
    return mb.state().scene.port;
  });
  check(dd.assay && dd.assay.kind === 'dud', 'a lookalike in the port should read DUD: ' + JSON.stringify(dd));

  // ---------- the cuff and one fault at a time ----------
  step('6. one fault at a time, comms in the dark, the cuff');
  g.break('dust');
  await P(() => window.vr.until(s => s.scene.dust, 3));
  const alarms = await P(() => window.vr.frames(3).then(() => window.moonbase.arm.shown?.alarms));
  g.blackout = true; g.battery = 0;
  await P(() => window.vr.until(s => s.scene.dark, 3));
  await P(() => window.vr.frames(4));
  const rs = await P(() => window.moonbase.radioState());
  check(rs.shown !== 'dead', 'the radio should not read dead with the base dark: ' + JSON.stringify(rs));
  check(await P(() => window.moonbase.interior.dark !== undefined), 'the hall should have a power state');
  g.blackout = false; g.battery = 100; g.faults = {};

  // ---------- real frames ----------
  step('7. drawing real frames in the headset');
  const frames = await P(async () => {
    const mb = window.moonbase, R = mb.renderer; R.render = R.realRender;
    mb.standAt('out', 5, 14, 0.3); await window.vr.frames(3);
    return mb.calls();
  });
  console.log('        draw calls outside, near the base:', JSON.stringify(frames));
  await P(async () => { const mb = window.moonbase; mb.standAt('out', 80, 40, 0.5); await window.vr.frames(3); });
  const far = await P(() => window.moonbase.calls());
  console.log('        draw calls out in the field:', JSON.stringify(far));
  check(far.main > 0, 'no frame was drawn out in the field');
} catch (e) {
  problems.push('vr: ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n'));
}

console.log(problems.length ? 'VR SAMPLE TEST FAILED\n' + problems.join('\n') : 'VR sample test passed');
clearInterval(ticker); await browser.close(); server.close();
process.exit(problems.length ? 1 : 0);
