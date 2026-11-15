// VR hands test: npm run vr
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
import { CFG, PLACES, DUST_CELLS, CRACK_POINTS } from '../client/shared/config.js';
import { sheltered } from '../client/shared/rules.js';
import { PAL } from '../client/shared/palette.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), OUT = path.join(ROOT, 'test', 'shots'), PORT = 3200;
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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 640 } })).newPage();
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
  let reach = 0, reachWhy = null;
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
    const d = at.distanceTo(shoulder(s));
    if (d > reach) { reach = d; reachWhy = { s, at: at.toArray().map(v => +v.toFixed(2)), head: wp(mb.camera).toArray().map(v => +v.toFixed(2)), height }; }
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
    get reach() { return reach; }, get reachWhy() { return reachWhy; }, resetReach() { reach = 0; reachWhy = null; },
    // Stand with the head over world (x, z), facing the world point (tx, tz). Hands hang in front.
    async stand(x, z, tx, tz, h = height) {
      height = h;
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
    // Let a hand hang at your side, as stand() leaves it, whatever it holds.
    hang(s) { X.hand(s, [s === 'left' ? -0.22 : 0.22, height - 0.6, -0.1], [-0.7071, 0, 0, 0.7071]); },
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
    // Close or open the hand with the trigger (a pinch with bare hands) or the grip button.
    press(s, down, button = 'grip') { if (mb.controllers[index(s)].userData.isHand) X.pinch(s, down); else if (button === 'trigger') X.trigger(s, down); else X.squeeze(s, down); },
    get height() { return height; },
    holding: s => mb.fx.holding(index(s)),
    haptics: () => X.dev.haptics.splice(0),
    until: async (test, seconds = 5) => { for (const end = Date.now() + seconds * 1000; Date.now() < end;) { const v = test(mb.state()); if (v) return v; await sleep(50); } return null; },
    ring: s => { const r = mb.fx.rings[index(s)]; return r.visible ? '#' + r.material.color.getHexString() : null; },
    // 'rack', 'hand:left', 'hand:right', 'flying', 'ground' or 'nowhere', checked against what the tool hangs from.
    parentOf: tool => {
      const p = mb.fx.tools[tool].parent, w = mb.fx.where(tool);
      if (w.startsWith('hand:')) return mb.controllers.includes(p) && 'hand:' + p.userData.hand === w ? w : 'wrong hand: ' + w;
      if (w === 'rack') return p === F.locker ? w : 'off the rack';
      if (w === 'ground' || w === 'flying') return p === mb.scene ? w : 'not in the scene';
      return p ? 'drawn, but nowhere' : 'nowhere';
    },
    // Wait for every thrown tool to come to rest.
    landed: async (seconds = 8) => { for (const end = Date.now() + seconds * 1000; Date.now() < end && mb.fx.flights.size;) await X.frames(2); return mb.fx.flights.size === 0; },
  };
}

// Server-side: wait for the game to reach a state.
const serverUntil = async (test, seconds = 5) => { for (const end = Date.now() + seconds * 1000; Date.now() < end;) { if (test()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const P = (fn, arg) => page.evaluate(fn, arg);

// A complete grab of a tool: reach for it wherever it is (on the rack, or crouching for it on the ground),
// close the hand with the grip or the trigger, check it came, and stand back up.
async function grabTool(side, tool, button = 'grip') {
  return P(async ({ side, tool, button }) => {
    const v = window.vr, mb = window.moonbase, low = mb.fx.where(tool) === 'ground', tall = v.height;
    if (low) { v.crouch(0.9); await v.frames(3); }
    await v.move(side, v.wp(mb.fx.tools[tool]), 6);
    await v.frames(2);
    const ring = v.ring(side);
    v.press(side, true, button); (v.buttons ||= {})[side] = button;
    await v.until(s => s.hands.includes(tool), 3);
    await v.frames(2);
    if (low) { v.crouch(tall); v.hang(side); await v.frames(3); } // stand up with it
    return { ring, held: v.holding(side)?.id || null, parent: v.parentOf(tool) };
  }, { side, tool, button });
}
// Let go with the button that closed the hand, the hand still, and wait for what it held to land.
async function letGo(side) {
  return P(async side => {
    const v = window.vr;
    v.press(side, false, v.buttons?.[side] || 'grip');
    await v.frames(3);
    await v.landed();
    await v.sleep(250);
    await v.frames(2);
  }, side);
}
const LOCKER = [PLACES.locker.x, PLACES.locker.z + 0.62, PLACES.locker.x, PLACES.locker.z]; // standing at the rack, facing it
// Step sideways along the rack to stand in front of a tool that is on it.
const faceTool = async tool => { const x = await P(tool => window.vr.wp(window.moonbase.fx.tools[tool]).x, tool); await stand(x, PLACES.locker.z + 0.62, x, PLACES.locker.z); };
const stand = (x, z, tx, tz, h) => P(([x, z, tx, tz, h]) => window.vr.stand(x, z, tx, tz, h), [x, z, tx, tz, h]);
// Set the tools up for the next test without going through the motions again: these lie on the ground
// at the astronaut's feet, a little ahead, and the rest hang on the rack. Call it after stand().
const kit = async (...tools) => {
  const spots = await P(tools => {
    const mb = window.moonbase, head = window.vr.wp(mb.camera), f = mb.camera.getWorldDirection(new window.vr.T.Vector3()).setY(0).normalize();
    return tools.map((t, i) => { const side = (i % 2 ? -1 : 1) * (0.22 + 0.12 * Math.floor(i / 2)), x = head.x + f.x * 0.38 - f.z * side, z = head.z + f.z * 0.38 + f.x * side; return { x, z, y: mb.world.height(x, z) + ({ brush: 0.035, patch: 0.012, welder: 0.035, tire: 0.1, gen: 0.19 })[t], ry: 0, in: false }; });
  }, tools);
  g.hands = [null, null];
  g.ground = Object.fromEntries(tools.map((t, i) => [t, spots[i]]));
  g.locker = ['brush', 'patch', 'welder', 'tire', 'gen'].filter(t => !tools.includes(t));
  await P(tools => window.vr.until(s => s.hands.every(h => !h) && Object.keys(s.ground).length === tools.length && tools.every(t => s.ground[t]), 3), tools);
  await P(() => window.vr.frames(3));
};
const reachOk = async (what, limit = 0.8) => { const { r, why } = await P(() => { const r = window.vr.reach, why = window.vr.reachWhy; window.vr.resetReach(); return { r, why }; }); check(r <= limit, `${what}: needed an arm ${r.toFixed(2)} m long (a real one is about 0.75 m): ${JSON.stringify(why)}`); return r; };

try {
  // The landing page knows a headset (forced here with ?device=headset), says it will be the Astronaut,
  // and after the 4-player choice goes straight to the Astronaut's page with no seat to pick.
  step('0. the landing page, in a headset');
  await page.goto(`http://localhost:${PORT}/?device=headset`);
  await page.waitForSelector('#choose:not([hidden])', { timeout: 30000 });
  check(await P(() => !document.getElementById('headsetNote').hidden), 'landing: no "you will be the Astronaut" note in a headset');
  await page.click('[data-players="4"]');
  await page.waitForURL(/\/astronaut\?device=headset$/, { timeout: 60000 }).catch(() => check(false, 'landing: choosing 4 players in a headset did not go to the Astronaut page: ' + page.url()));
  check(hub.players === 4, 'landing: the 4-player choice did not reach the server');
  check(await serverUntil(() => hub.crew().includes('astronaut'), 30), 'landing: the headset was not seated as the Astronaut');

  step('putting the headset on');
  await page.waitForTimeout(1200);
  check(await P(() => window.moonbase.headset() && document.getElementById('deskBtn').hidden), 'astronaut: a headset should not be offered "Play on this screen"');
  await page.click('#radioBtn');
  await page.waitForFunction(() => /ENTER VR/i.test(document.querySelector('#vrSlot button')?.textContent || ''), null, { timeout: 15000, polling: 200 });
  await page.click('#vrSlot button');
  await page.waitForFunction(() => window.moonbase.renderer.xr.isPresenting && window.fakeXR.dev.frame > 3, null, { timeout: 30000, polling: 200 });
  // Drawing a frame takes this machine a second or more. The hands do not need pixels, so the draw is
  // skipped (the scene's positions are still brought up to date) until the last step, which draws for real.
  await P(() => {
    const R = window.moonbase.renderer;
    R.realRender = R.render.bind(R);
    R.render = (scene, cam) => { scene.updateMatrixWorld(); if (R.xr.enabled && R.xr.isPresenting) R.xr.updateCamera(cam); };
  });
  await P(installVR);
  const start = await P(() => window.moonbase.controllers.map(c => c.userData.hand));
  check(start.includes('left') && start.includes('right'), 'the two controllers did not connect: ' + JSON.stringify(start));
  // ---------- the waiting room ----------
  step('0. the waiting room: four cards, readying from your own');
  const room = await P(() => ({ seen: window.moonbase.room.group.visible, cards: window.moonbase.room.describe() }));
  check(room.seen && JSON.stringify(room.cards.map(c => c.role)) === JSON.stringify(['astronaut', 'ops', 'sci', 'tech']), 'waiting room: four cards in seat order: ' + JSON.stringify(room));
  check(room.cards.every((c, i) => i === 0 || c.x > room.cards[i - 1].x), 'waiting room: the cards should run left to right: ' + JSON.stringify(room.cards.map(c => c.x.toFixed(2))));
  check(room.cards.find(c => c.role === 'ops').key.startsWith('false'), 'waiting room: the empty Mission Ops seat should read empty');
  const opsSeat = { send() {}, close() {} }; // someone takes the Mission Ops seat on a laptop
  hub.add(opsSeat); hub.message(opsSeat, JSON.stringify({ t: 'hello', role: 'ops' }), false);
  check(await P(async () => { await window.vr.until(s => s.crew.includes('ops'), 3); await window.vr.frames(3); return window.moonbase.room.describe().find(c => c.role === 'ops').key.startsWith('true'); }),
    'waiting room: the Mission Ops card did not change when someone took the seat');
  // Point the right controller at your own card and pull the trigger: ready. Pull it again: not ready.
  const pointAtOwn = () => P(async () => {
    const v = window.vr, mb = window.moonbase, at = v.wp(mb.room.own), from = v.wp(mb.camera).add(v.V(0.18, -0.3, -0.25).applyQuaternion(mb.rig.quaternion));
    v.hand('right', from, at.clone().sub(from)); await v.frames(2);
    window.fakeXR.trigger('right', true); await v.frames(2); window.fakeXR.trigger('right', false); await v.frames(2);
  });
  await P(() => window.vr.stand(-3.6, 7.0, -3.6, 0));
  if (SHOTS) { // a picture of the waiting room, both eyes, the cards in front
    const url = await P(async () => {
      const mb = window.moonbase, R = mb.renderer, skip = R.render;
      window.fakeXR.head(0, 1.7, 0, 0.12, -0.05);
      R.render = R.realRender; await window.vr.frames(3);
      const u = await mb.snap(); R.render = skip; window.fakeXR.head(0, 1.7, 0); return u;
    });
    fs.writeFileSync(path.join(OUT, 'vr-waiting-room.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  await pointAtOwn();
  check(await serverUntil(() => hub.ready.has('astronaut'), 3), 'waiting room: the trigger on your own card did not ready you');
  check(await P(async () => { await window.vr.frames(3); return window.moonbase.room.describe()[0].key.startsWith('true,true'); }), 'waiting room: your card does not show READY');
  check(hub.game.phase === 'lobby', 'waiting room: one ready seat of two should not start the mission');
  // Taking the headset off (the session is hidden) before the start: not ready any more.
  await P(() => { const s = window.moonbase.renderer.xr.getSession(); s.visibilityState = 'hidden'; s.dispatchEvent(new Event('visibilitychange')); s.visibilityState = 'visible'; });
  check(await serverUntil(() => !hub.ready.has('astronaut'), 3), 'waiting room: taking the headset off should make the Astronaut not ready');
  // No walking or teleporting out of the waiting room.
  const walked = await P(async () => {
    const mb = window.moonbase, before = mb.rig.position.clone();
    window.fakeXR.stick('left', 0, -1); await window.vr.frames(10); window.fakeXR.stick('left', 0, 0);
    return mb.rig.position.distanceTo(before);
  });
  check(walked < 0.01, 'waiting room: the stick walked the Astronaut out of the waiting room: ' + walked.toFixed(2) + ' m');
  hub.remove(opsSeat);

  g.start(); g.script = [];
  await P(() => window.vr.until(s => s.phase === 'run', 5));
  check(await P(async () => { await window.vr.frames(3); return !window.moonbase.room.group.visible; }), 'waiting room: the cards are still up after the start');
  await P(() => window.vr.frames(5));
  check(await P(() => window.moonbase.fx.gloves.every(gl => gl.visible)), 'no gloves are drawn on the controllers');

  // ---------- 1. tools: hold the trigger to take one, let go to drop it or throw it ----------
  step('1. taking, dropping, throwing and picking up tools');
  await stand(...LOCKER);
  let r = await grabTool('right', 'brush', 'trigger');
  check(r.ring === PAL.green, 'rack: no green ring on the brush before grabbing it: ' + r.ring);
  check(g.hands[1] === 'brush' && !g.locker.includes('brush'), 'rack: the trigger on the brush did not put it in the right hand: ' + JSON.stringify(g.hands));
  check(r.held === 'brush' && r.parent === 'hand:right', 'rack: the brush should be in the right hand straight off the rack: ' + JSON.stringify(r));
  let buzz = await P(() => window.vr.haptics());
  check(buzz.some(b => b.side === 'right' && b.strength >= 0.5), 'rack: no buzz in the hand that grabbed: ' + JSON.stringify(buzz));
  check(await P(() => !window.moonbase.scene.getObjectByName('Belt') && !('beltGroup' in window.moonbase.fx)), 'no belt: there should be nothing at the waist');
  // Let go of the trigger with the hand still: it drops out of the hand onto the ground below, not back on the rack.
  const dropAt = await P(() => { const p = window.vr.where('right'); return { x: p.x, z: p.z }; });
  await P(async () => { window.vr.press('right', false, 'trigger'); await window.vr.frames(2); });
  check(await P(() => window.vr.parentOf('brush')) === 'flying' && !g.hands[1], 'drop: letting go of the trigger did not let go of the brush at once: ' + await P(() => window.vr.parentOf('brush')));
  await P(() => window.vr.landed());
  check(await serverUntil(() => g.ground.brush && g.ground.brush.y < 0.3), 'drop: the server does not have the brush lying on the ground: ' + JSON.stringify(g.ground.brush));
  check(await P(() => window.vr.parentOf('brush')) === 'ground' && !g.locker.includes('brush'), 'drop: the brush should lie on the ground, not go back on the rack: ' + await P(() => window.vr.parentOf('brush')));
  check(Math.hypot(g.ground.brush.x - dropAt.x, g.ground.brush.z - dropAt.z) < 0.5, 'drop: a tool let go with the hand still should land under the hand: ' + JSON.stringify({ dropAt, lay: g.ground.brush }));
  // Pick it up off the ground with the other hand, with the grip this time: step up to it, on your left.
  await stand(g.ground.brush.x + 0.15, g.ground.brush.z + 0.32, g.ground.brush.x + 0.15, g.ground.brush.z - 2);
  r = await grabTool('left', 'brush');
  check(r.ring === PAL.green && r.held === 'brush' && r.parent === 'hand:left' && g.hands[0] === 'brush' && !g.ground.brush, 'ground: could not pick the brush up off the ground with the left hand: ' + JSON.stringify(r));
  // Throw it: swing the hand forward and up and let go mid-swing. It flies, falls and lands well away.
  await stand(0, 9, 0, 14);
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    const head = v.wp(mb.camera), f = mb.camera.getWorldDirection(new v.T.Vector3()).setY(0).normalize();
    const from = head.clone().add(v.V(0, -0.35, 0)).addScaledVector(f, -0.1), to = head.clone().add(v.V(0, 0.1, 0)).addScaledVector(f, 0.55);
    v.hand('left', from); await v.frames(2);
    const t0 = performance.now();
    for (let k = 1; k <= 4; k++) { v.hand('left', from.clone().lerp(to, k / 4)); await v.frames(1); }
    const swing = (performance.now() - t0) / 1000;
    const at = v.where('left');
    v.press('left', false, 'grip'); await v.frames(1);
    const flying = v.parentOf('brush');
    await v.landed(12);
    const lay = v.wp(mb.fx.tools.brush);
    return { flying, from: { x: at.x, z: at.z }, lay: { x: lay.x, y: lay.y, z: lay.z }, ground: mb.world.height(lay.x, lay.z), swing, out: v.parentOf('brush') };
  });
  const thrown = Math.hypot(r.lay.x - r.from.x, r.lay.z - r.from.z);
  console.log(`        thrown: swung in ${r.swing.toFixed(2)} s, landed ${thrown.toFixed(2)} m out`);
  check(r.flying === 'flying', 'throw: the brush did not leave the hand when it opened mid-swing: ' + r.flying);
  check(thrown > 0.8, `throw: a swung throw should carry the brush well away, it landed ${thrown.toFixed(2)} m from the hand`);
  check(r.out === 'ground' && Math.abs(r.lay.y - r.ground) < 0.1, 'throw: the brush should come to rest on the ground: ' + JSON.stringify(r));
  check(await serverUntil(() => g.ground.brush && Math.hypot(g.ground.brush.x - r.lay.x, g.ground.brush.z - r.lay.z) < 0.05), 'throw: the server was not told where the brush came to rest');
  // Walk over and pick it up again with the trigger.
  await stand(r.lay.x, r.lay.z + 0.3, r.lay.x, r.lay.z - 2);
  r = await grabTool('right', 'brush', 'trigger');
  check(r.held === 'brush' && g.hands[1] === 'brush', 'throw: could not pick the thrown brush up again: ' + JSON.stringify(r));
  // One tool per hand: the trigger on a second tool with a full hand does not take it.
  await stand(...LOCKER);
  await faceTool('welder');
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    await v.move('right', v.wp(mb.fx.tools.welder), 6); await v.frames(2);
    v.press('right', true, 'trigger'); await v.frames(3); await v.sleep(300);
    const out = { held: v.holding('right')?.id, welder: v.parentOf('welder') };
    v.press('right', false, 'trigger'); await v.frames(2); await v.landed();
    return out;
  });
  check(r.held === 'brush' && r.welder === 'rack' && g.locker.includes('welder'), 'one per hand: a full hand took a second tool: ' + JSON.stringify(r));
  await kit();
  await reachOk('taking, dropping and throwing');

  // ---------- 2. sweeping the brush ----------
  step('2. sweeping the brush');
  g.break('dust');
  await P(() => window.vr.until(s => s.scene.dust, 3));
  const panels = await P(() => {
    const v = window.vr, F = window.moonbase.world.fixtures;
    return [0, 1, 2].map(pn => { const c = F.dustCells[pn * 6 + 1], p = v.wp(c), n = c.getWorldDirection(new v.T.Vector3()); return { x: p.x, z: p.z, nx: n.x, nz: n.z }; });
  });
  const sweep = (pn, gap) => P(async ({ pn, gap }) => {
    const v = window.vr, F = window.moonbase.world.fixtures;
    for (const row of [0, 1]) {
      const cells = [0, 1, 2].map(c => F.dustCells[pn * 6 + row * 3 + c]);
      const n = cells[0].getWorldDirection(new v.T.Vector3()), into = n.clone().negate();
      const at = c => v.wp(c).addScaledVector(n, gap);
      // Across the middle cell and just into the outer two: touching a cell anywhere brushes it off.
      const mid = at(cells[1]), along = at(cells[2]).sub(at(cells[0])).normalize();
      const a = mid.clone().addScaledVector(along, -0.44), b = mid.clone().addScaledVector(along, 0.44), ends = row ? [b, a] : [a, b]; // there and back
      await v.move('right', ends[0], 4, into, 'brush');
      await v.move('right', ends[1], 16, into, 'brush');
    }
  }, { pn, gap });
  await stand(panels[0].x + panels[0].nx * 0.62, panels[0].z + panels[0].nz * 0.62, panels[0].x, panels[0].z);
  await kit('brush');
  r = await grabTool('right', 'brush');
  check(r.held === 'brush', 'brush: could not pick the brush up at the panels');
  await sweep(0, 0.35);
  await page.waitForTimeout(300);
  check(g.faults.dust.cells.every(Boolean), 'brush: waving the brush 35 cm off the panel cleaned it');
  await P(() => window.vr.haptics());
  for (let pn = 0; pn < 3; pn++) {
    await stand(panels[pn].x + panels[pn].nx * 0.62, panels[pn].z + panels[pn].nz * 0.62, panels[pn].x, panels[pn].z);
    await sweep(pn, 0.04);
    await page.waitForTimeout(250);
    const left = g.faults.dust ? g.faults.dust.cells.slice(pn * 6, pn * 6 + 6).filter(Boolean).length : 0;
    check(left === 0, `brush: one pass along each row of panel ${pn + 1} left ${left} of 6 cells dusty`);
    if (pn === 0) check(await P(() => window.moonbase.scene.children.some(o => o.isMesh && o.userData.dir && o.visible)), 'brush: no puff of dust came off the panel');
  }
  check(await serverUntil(() => !g.faults.dust), 'brush: all three panels swept but the fault is not fixed');
  buzz = await P(() => window.vr.haptics());
  check(buzz.filter(b => b.side === 'right').length >= 18, `brush: expected a tick in the hand for each of 18 cells, got ${buzz.length}`);
  await letGo('right');
  await reachOk('brushing the panels');

  // ---------- 3. welding ----------
  step('3. welding');
  g.break('hull'); g.faults.hull.spot = 0;
  await P(() => window.vr.until(s => s.scene.hull && s.scene.hull.spot === 0, 3));
  await P(() => window.vr.frames(3));
  const crack = await P(() => { const c = window.moonbase.world.fixtures.crack.userData; return { x: c.centre.x, z: c.centre.z, nx: c.normal.x, nz: c.normal.z }; });
  await stand(crack.x + crack.nx * 0.7, crack.z + crack.nz * 0.7, crack.x, crack.z);
  await kit('welder');
  r = await grabTool('right', 'welder');
  check(r.held === 'welder', 'weld: could not pick up the welder');
  const weld = (point, seconds) => P(async ({ point, seconds }) => {
    const v = window.vr, mb = window.moonbase, c = mb.world.fixtures.crack.userData;
    const at = mb.world.fixtures.crackPts[point].clone().addScaledVector(c.normal, 0.03);
    await v.move('right', at, 5, c.normal.clone().negate(), 'welder');
    const t0 = performance.now();
    let spark = false, heat = 0;
    while (performance.now() - t0 < seconds * 1000) { await v.frames(1); spark = spark || mb.fx.tools.welder.userData.spark.visible; heat = Math.max(heat, (c.heat || [])[point] || 0); }
    return { spark, heat };
  }, { point, seconds });
  let w = await weld(0, 0.2);
  check(w.spark, 'weld: no spark with the tip on the crack');
  check(w.heat > 0.2 && w.heat < 1, 'weld: the point should be glowing part-way after 0.2 s, heat ' + w.heat.toFixed(2));
  // Pull the torch away before it beads: nothing welded, and the glow dies.
  await P(async () => { const v = window.vr, c = window.moonbase.world.fixtures.crack.userData; await v.move('right', c.centre.clone().addScaledVector(c.normal, 0.45), 6, c.normal.clone().negate(), 'welder'); await v.sleep(600); await v.frames(2); });
  check(!g.faults.hull.welded[0], 'weld: 0.2 s on a point was enough to weld it (it should take 0.4 s)');
  check(await P(() => (window.moonbase.world.fixtures.crack.userData.heat || [1])[0]) < 0.05, 'weld: the point stayed hot after the torch left');
  await P(() => window.vr.haptics());
  for (let i = 0; i < CRACK_POINTS; i++) {
    w = await weld(i, 0.6);
    check(await serverUntil(() => !g.faults.hull || g.faults.hull.welded[i], 2), `weld: point ${i + 1} did not weld after 0.6 s on it`);
  }
  check(await serverUntil(() => !g.faults.hull), 'weld: every point welded but the breach is not sealed');
  buzz = await P(() => window.vr.haptics());
  check(buzz.filter(b => b.strength === 1).length >= CRACK_POINTS, 'weld: no strong buzz as each point beaded');
  check(buzz.filter(b => b.strength < 0.5).length >= 10, 'weld: no steady buzz while welding');
  await letGo('right');
  await reachOk('welding the crack');

  // ---------- 4. pushing plugs into sockets (inside the habitat) ----------
  step('4. pushing plugs into sockets');
  // In through the airlock: point the right controller at the hatch and pull the trigger.
  await stand(0, 5.2, 0, 0);
  await P(async () => {
    const v = window.vr, at = v.wp(window.moonbase.camera).add(v.V(0.2, -0.4, -0.3));
    v.hand('right', at, v.V(0, 1.2, 3.35).sub(at));
    await v.frames(3);
    window.fakeXR.trigger('right', true); await v.frames(2); window.fakeXR.trigger('right', false);
    for (let i = 0; i < 100 && window.moonbase.where() !== 'in'; i++) await v.sleep(50);
    await v.frames(3);
  });
  check(await P(() => window.moonbase.where()) === 'in', 'airlock: pointing at the hatch and pulling the trigger did not go inside');
  g.break('board');
  await P(() => window.vr.until(s => s.scene.board, 3));
  check(await P(async () => { for (let i = 0; i < 120 && window.moonbase.interior.phase !== 'backup'; i++) await window.vr.sleep(50); return window.moonbase.interior.phase; }) === 'backup', 'board: the hall did not go to its red backup lights when the switchboard tripped');
  const boardAt = await P(() => { const v = window.vr, F = window.moonbase.world.fixtures; const p = F.board.localToWorld(v.V(0, 1.4, 0)), n = F.board.getWorldDirection(new v.T.Vector3()); return { x: p.x, z: p.z, nx: n.x, nz: n.z }; });
  await stand(boardAt.x + boardAt.nx * 0.6, boardAt.z + boardAt.nz * 0.6, boardAt.x, boardAt.z);
  // Carry a loose plug to a socket: grab it where it hangs, bring it up in front of the socket, push it in.
  const plugInto = (cable, socket) => P(async ({ cable, socket }) => {
    const v = window.vr, mb = window.moonbase, F = mb.world.fixtures;
    const n = F.board.getWorldDirection(new v.T.Vector3()), into = n.clone().negate();
    await v.until(() => F.plugs[cable].position.distanceTo(F.plugRest[cable]) < 0.01, 5); // it has dropped out and is hanging
    await v.move('right', v.wp(F.plugs[cable]), 6, into); await v.frames(2);
    const ring = v.ring('right');
    v.grip('right', true); await v.frames(2);
    const held = v.holding('right')?.kind;
    const sock = F.board.localToWorld(F.sockets[socket].clone());
    await v.move('right', sock.clone().addScaledVector(n, 0.25), 8, into);
    const ringBefore = { on: mb.world.fixtures.board.children.some(o => o.isMesh && o.geometry.type === 'TorusGeometry' && o.visible) };
    await v.move('right', sock, 8, into);
    await v.frames(3); await v.sleep(350); await v.frames(2);
    const stillHeld = !!v.holding('right');
    v.grip('right', false); await v.frames(2);
    return { ring, held, ringBefore: ringBefore.on, stillHeld };
  }, { cable, socket });
  freeO2 = true;
  const cables = g.faults.board.cables;
  const loose = cables.map((c, i) => ({ i, ...c })).filter(c => !c.seated);
  const fullSocket = cables.find(c => c.seated).socket;
  // A full socket: the ring is red and nothing happens.
  let o2 = g.oxygen, mistakes = g.stats.mistakes;
  r = await plugInto(loose[0].i, fullSocket);
  check(r.ring === PAL.green && r.held === 'plug', 'board: could not pick up a hanging plug: ' + JSON.stringify(r));
  check(g.stats.mistakes === mistakes && !cables[loose[0].i].seated, 'board: pushing a plug at a socket that is already full did something');
  // A wrong socket: a spark, 4 oxygen, and the plug drops out of the hand.
  const wrong = [0, 1, 2, 3].find(k => k !== fullSocket && k !== loose[0].socket);
  await P(() => window.vr.haptics());
  r = await plugInto(loose[0].i, wrong);
  check(g.stats.mistakes === mistakes + 1 && o2 - g.oxygen >= CFG.wrongPlug, `board: a wrong socket should cost ${CFG.wrongPlug} oxygen and count as a mistake`);
  check(!r.stillHeld && r.ringBefore, 'board: after a wrong socket the plug should drop out of the hand, and the socket should have lit up on the way in: ' + JSON.stringify(r));
  check((await P(() => window.vr.haptics())).some(b => b.strength === 1), 'board: no buzz when the plug went in');
  freeO2 = false;
  for (const c of loose) {
    r = await plugInto(c.i, c.socket);
    check(await serverUntil(() => !g.faults.board || g.faults.board.cables[c.i].seated, 2), `board: the ${c.color} plug did not seat in its socket: ${JSON.stringify(r)}`);
  }
  check(await serverUntil(() => !g.faults.board), 'board: all three plugs seated but the fault is not fixed');
  check(await P(async () => { for (let i = 0; i < 120 && window.moonbase.interior.phase !== 'main'; i++) await window.vr.sleep(50); return window.moonbase.interior.phase; }) === 'main', 'board: the roof lights did not come back');
  await reachOk('the switchboard');
  check(sheltered(g.astro, g.rover), 'inside the habitat should count as cover from a meteor shower');
  await P(async () => { window.moonbase.place('out'); await window.vr.frames(3); });

  // ---------- 5. pulling the wheel, fitting the tire ----------
  step('5. pulling the wheel');
  g.rover.x = 6; g.rover.z = 12; g.rover.ry = 0; g.rover.throttle = 0;
  await page.waitForTimeout(400);
  await P(async () => { const mb = window.moonbase; for (let i = 0; i < 40; i++) { mb.world.moveRover(mb.state().rover, 1); await window.vr.frames(1); } });
  g.break('wheel');
  await P(() => window.vr.until(s => s.scene.wheel === 1, 3));
  await P(() => window.vr.frames(3));
  const hubAt = await P(() => { const v = window.vr, mb = window.moonbase; const h = v.wp(mb.world.fixtures.hub), c = v.wp(mb.world.rover); const out = h.clone().sub(c).setY(0).normalize(); return { x: h.x, z: h.z, ox: out.x, oz: out.z }; });
  // Beside the wheel, bent to it: its hub is 0.4 m off the ground.
  await stand(hubAt.x + hubAt.ox * 0.6, hubAt.z + hubAt.oz * 0.6, hubAt.x, hubAt.z, 1.35);
  check(await P(() => window.moonbase.scene.children.some(o => o.isSprite && o.visible && o.scale.x < 1)), 'wheel: no outline of the missing tool (the tire) over the broken wheel');
  await P(() => window.vr.haptics());
  r = await P(async ({ ox, oz }) => {
    const v = window.vr, mb = window.moonbase, F = mb.world.fixtures;
    const top = v.wp(F.wheel).add(v.V(ox * 0.18, 0.38, oz * 0.18)); // just above the top of the rim, on the near side
    await v.move('left', top, 6); await v.frames(2);
    const ring = v.ring('left');
    v.grip('left', true); await v.frames(2);
    const held = v.holding('left')?.kind;
    await v.move('left', top.clone().add(v.V(ox * 0.2, 0, oz * 0.2)), 6);
    const early = mb.state().scene.wheel;
    await v.move('left', top.clone().add(v.V(ox * 0.36, 0, oz * 0.36)), 6);
    await v.until(s => s.scene.wheel === 2, 2);
    v.grip('left', false); await v.frames(3);
    return { ring, held, early, buzz: v.haptics().length, lying: v.wp(F.wheel).y };
  }, hubAt);
  check(r.ring && r.held === 'wheel', 'wheel: could not get hold of the broken wheel: ' + JSON.stringify(r));
  check(r.early === 1, 'wheel: it came off after only 20 cm');
  check(g.faults.wheel && g.faults.wheel.stage === 1, 'wheel: pulling it 36 cm did not take it off');
  check(r.buzz >= 3, 'wheel: no buzz in the hand as the wheel resisted');
  check(r.lying < 0.25, 'wheel: once off, the old wheel should be lying on the ground');
  await reachOk('pulling the wheel');
  // Back to the locker for the tire.
  await kit();
  await faceTool('tire');
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase;
    await v.move('right', v.wp(mb.fx.tools.tire).add(v.V(0.15, 0.2, 0.15)), 6); await v.frames(2);
    v.grip('right', true);
    await v.until(s => s.hands.includes('tire'), 3); await v.frames(2);
    return { held: v.holding('right')?.id, parent: v.parentOf('tire') };
  });
  check(r.held === 'tire' && r.parent === 'hand:right', 'tire: could not carry the tire off the rack in the hand: ' + JSON.stringify(r));
  await reachOk('taking the tire');
  await stand(hubAt.x + hubAt.ox * 0.7, hubAt.z + hubAt.oz * 0.7, hubAt.x, hubAt.z, 1.5);
  check(await P(() => window.vr.holding('right')?.id) === 'tire', 'tire: it fell out of the hand on the walk to the rover');
  await P(async ({ ox, oz }) => {
    const v = window.vr, mb = window.moonbase, hub = v.wp(mb.world.fixtures.hub), into = v.V(-ox, 0, -oz);
    // The wheel is carried out in front of the hand, by its rim: lower it on to the hub from above.
    const down = v.V(-ox * 0.5, -1, -oz * 0.5).normalize();
    await v.move('right', hub.clone().addScaledVector(down, -0.8), 6, down);
    await v.move('right', hub.clone().addScaledVector(down, -0.4), 8, down);
    await v.until(s => s.scene.wheel === 0, 2);
    v.grip('right', false); await v.frames(2);
  }, hubAt);
  check(await serverUntil(() => !g.faults.wheel), 'tire: offering the tire up to the bare hub did not fit it');
  check(!g.has('tire') && !g.ground.tire && await P(() => window.vr.parentOf('tire')) === 'nowhere', 'tire: once fitted it should be gone from the hand: ' + JSON.stringify({ hands: g.hands, ground: g.ground.tire, where: await P(() => window.vr.parentOf('tire')) }));
  await reachOk('fitting the tire');

  // ---------- 6. the generator cord ----------
  step('6. the generator cord');
  await stand(0, 9, 0, 0);
  await kit('gen'); // set down in front of you
  g.break('dust'); g.battery = 0;
  check(await serverUntil(() => g.blackout && !g.powered), 'generator: could not black the base out for the test');
  check(await P(() => window.vr.until(s => !s.powered, 3).then(() => window.moonbase.radioState().shown)) === 'dead', 'blackout: the radio should read NO SIGNAL');
  await P(() => window.vr.haptics());
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase, tall = v.height;
    v.crouch(0.95); await v.frames(3);
    const at = mb.fx.tools.gen.localToWorld(v.V(0.12, 0.2, 0)); // the pull-cord handle
    await v.move('left', at, 6); await v.frames(2);
    const ring = v.ring('left');
    v.grip('left', true); await v.frames(2);
    const held = v.holding('left')?.kind;
    const up = at.clone().add(v.V(0, 0.25, 0));
    await v.move('left', up, 6);
    const cord = mb.scene.children.some(o => o.isLine && o.visible && o.name === 'Cord_Pull');
    const early = !!mb.state().ground.gen;
    await v.move('left', at.clone().add(v.V(0.1, 0.44, -0.05)), 6);
    await v.until(s => !s.ground.gen, 2);
    v.grip('left', false); await v.frames(2);
    v.crouch(tall); v.hang('left'); await v.frames(2);
    return { ring, held, cord, early, buzz: v.haptics() };
  });
  check(r.ring && r.held === 'cord', 'generator: could not get hold of the cord of the generator on the ground: ' + JSON.stringify({ ring: r.ring, held: r.held }));
  check(r.cord, 'generator: no cord is drawn between the generator and the hand');
  check(r.early, 'generator: it started after only 25 cm of cord');
  check(g.genLeft > 0 && g.powered && !g.ground.gen && !g.has('gen'), 'generator: a full pull of the cord did not start it');
  check(r.buzz.length >= 3 && r.buzz.some(b => b.strength === 1), 'generator: no buzz building up as the cord came out');
  check(await P(() => window.vr.until(s => s.powered, 3).then(() => window.moonbase.radioState().shown)) !== 'dead', 'generator: the radio did not come back');
  delete g.faults.dust; g.battery = 100; g.blackout = false; g.genLeft = 0;
  await reachOk('the generator cord');

  // ---------- 7. patching your forearm ----------
  step('7. patching your forearm');
  await stand(0, 9, 0, 0);
  await kit('patch');
  await P(() => window.vr.haptics());
  g.break('suit', true);
  await P(() => window.vr.until(s => s.suit, 3));
  await P(async () => { await window.vr.sleep(1300); await window.vr.frames(3); });
  r = await P(() => { const mb = window.moonbase, sp = mb.fx.spot; return { on: sp.visible, arm: sp.parent?.userData?.hand, buzz: window.vr.haptics() }; });
  check(r.on && r.arm === 'left', 'patch: the leak should show as a spot on the left forearm: ' + JSON.stringify({ on: r.on, arm: r.arm }));
  check(r.buzz.some(b => b.side === 'left'), 'patch: the leaking arm should throb');
  const patch = (hand, arm) => P(async ({ hand, arm }) => {
    const v = window.vr, mb = window.moonbase;
    // Hold the leaking arm across the body and bring the patch down on it.
    const chest = v.wp(mb.camera).add(v.V(0, -0.25, 0).applyQuaternion(mb.rig.quaternion)).add(v.V(0, 0, -0.4).applyQuaternion(mb.rig.quaternion));
    v.hand(arm, chest, v.V(arm === 'left' ? 1 : -1, 0, 0).applyQuaternion(mb.rig.quaternion));
    const low = mb.fx.where('patch') === 'ground', tall = v.height;
    if (low) { v.crouch(0.9); await v.frames(3); }
    await v.move(hand, v.wp(mb.fx.tools.patch), 6); await v.frames(2);
    v.grip(hand, true); await v.frames(3);
    if (low) { v.crouch(tall); v.hang(hand); await v.frames(3); }
    v.hand(arm, chest, v.V(arm === 'left' ? 1 : -1, 0, 0).applyQuaternion(mb.rig.quaternion));
    const held = v.holding(hand)?.id, spotOn = mb.fx.spot.parent?.userData?.hand;
    const spot = v.wp(mb.fx.spot);
    // Out to the side and up, so the patch does not brush the leak on its way up from the ground, then over it.
    const out = v.V(hand === 'right' ? 0.35 : -0.35, 0, 0).applyQuaternion(mb.rig.quaternion);
    await v.move(hand, v.where(hand).add(out), 4, v.V(0, -1, 0));
    await v.move(hand, spot.clone().add(out).add(v.V(0, 0.3, 0)), 5, v.V(0, -1, 0), 'patch');
    await v.move(hand, spot.clone().add(v.V(0, 0.3, 0)), 5, v.V(0, -1, 0), 'patch');
    const early = mb.state().suit;
    await v.move(hand, spot, 6, v.V(0, -1, 0), 'patch');
    await v.until(s => !s.suit, 2);
    v.grip(hand, false); await v.frames(2); await v.landed();
    return { held, spotOn, early };
  }, { hand, arm });
  r = await patch('right', 'left');
  check(r.held === 'patch' && r.early, 'patch: could not hold the patch kit, or it worked from 30 cm away: ' + JSON.stringify(r));
  check(await serverUntil(() => !g.faults.suit), 'patch: pressing the patch on the spot did not seal the leak');
  // Patch kit in the left hand: the spot moves to the right arm.
  g.break('suit', true);
  await P(() => window.vr.until(s => s.suit, 3));
  r = await patch('left', 'right');
  check(r.spotOn === 'right', 'patch: with the patch kit in the left hand the spot should be on the right arm, got ' + r.spotOn);
  check(await serverUntil(() => !g.faults.suit), 'patch: could not patch the right arm with the left hand');
  await reachOk('patching the forearm');

  // ---------- 8. the hiss in your ears ----------
  step('8. the hiss in your ears');
  const audio = await P(() => { const r = window.moonbase.radio; return { ready: r.ready, state: r.ctx?.state }; });
  if (!check(audio.ready && audio.state === 'running', 'hiss: the browser gave the page no running audio: ' + JSON.stringify(audio))) throw new Error('no audio');
  // Listen in on the two hisses: how loud each ear hears the hull, and how loud the suit is.
  await P(() => {
    const r = window.moonbase.radio, c = r.ctx;
    const split = c.createChannelSplitter(2); r.panner.connect(split);
    const tap = (node, ch) => { const a = c.createAnalyser(); a.fftSize = 2048; if (ch === undefined) node.connect(a); else node.connect(a, ch); return a; };
    const L = tap(split, 0), R = tap(split, 1), S = tap(r.suitHiss);
    const rms = a => { const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); return Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length); };
    // Averaged over half a second: it is noise.
    window.listen = async () => { let l = 0, rr = 0, s = 0; for (let i = 0; i < 10; i++) { await window.vr.sleep(50); l += rms(L); rr += rms(R); s += rms(S); } return { left: l / 10, right: rr / 10, suit: s / 10 }; };
  });
  await stand(0, 9, 0, 0);
  let ears = await P(async () => { await window.vr.sleep(600); return window.listen(); });
  check(ears.left < 0.002 && ears.suit < 0.002, 'hiss: there is a hiss with nothing leaking: ' + JSON.stringify(ears));
  // A suit leak: the same in both ears wherever you look.
  g.break('suit', true);
  await P(() => window.vr.until(s => s.suit, 3));
  ears = await P(async () => { await window.vr.sleep(800); return window.listen(); });
  check(ears.suit > 0.01 && ears.left < 0.002, 'hiss: a suit leak should hiss in the helmet and nowhere else: ' + JSON.stringify(ears));
  const suitLevel = ears.suit;
  delete g.faults.suit;
  // A hull breach: stand 3 m out from the crack and face along the wall, so the crack is on the left, then on the right.
  g.break('hull'); g.faults.hull.spot = 0;
  await P(() => window.vr.until(s => s.scene.hull && s.scene.hull.spot === 0 && !s.suit, 3));
  const hear = async (dist, turn) => {
    const x = crack.x + crack.nx * dist, z = crack.z + crack.nz * dist;
    // turn = +1: looking along the wall with the crack on the left. -1: on the right. 0: facing it.
    const tx = turn ? x + crack.nz * turn : crack.x, tz = turn ? z - crack.nx * turn : crack.z;
    await stand(x, z, tx, tz);
    return P(async () => { await window.vr.sleep(700); return window.listen(); });
  };
  const onLeft = await hear(3, 1), onRight = await hear(3, -1), near = await hear(1, 0), far = await hear(12, 0);
  console.log(`        suit hiss ${suitLevel.toFixed(4)} in both ears. hull hiss, left ear / right ear: crack on the left ${onLeft.left.toFixed(4)} / ${onLeft.right.toFixed(4)}, on the right ${onRight.left.toFixed(4)} / ${onRight.right.toFixed(4)}; facing it at 1 m ${near.left.toFixed(4)}, at 12 m ${far.left.toFixed(4)}`);
  check(onLeft.suit < 0.002, 'hiss: a hull breach should not hiss inside the helmet');
  check(onLeft.left > onLeft.right * 1.3, 'hiss: with the crack on the left, the left ear should hear it louder');
  check(onRight.right > onRight.left * 1.3, 'hiss: with the crack on the right, the right ear should hear it louder');
  check(near.left > far.left * 4, 'hiss: it should get much louder as you walk up to the crack');
  check(far.left > 0.001, 'hiss: it should still be audible from across the base');
  delete g.faults.hull;

  // ---------- 9. crouching for cover ----------
  step('9. crouching for cover');
  await P(() => window.vr.until(s => !s.scene.hull, 3));
  // A shower whose near impacts have already begun, for `seconds`.
  // (The test holds the mission clock, so the shower is ended by hand.)
  const shower = async seconds => { g.meteor = { start: g.elapsed - CFG.meteorGraceSeconds - 0.1, end: g.elapsed + 600, hit: false, falling: true, after: [] }; await new Promise(r => setTimeout(r, seconds * 1000)); g.meteor = null; await new Promise(r => setTimeout(r, 250)); };
  const beside = [g.rover.x + 1.5, g.rover.z, g.rover.x, g.rover.z];
  let hits = g.stats.hits;
  await stand(...beside);              // standing beside the rover, 1.7 m tall
  await shower(1);
  check(g.stats.hits === hits + 1 && g.faults.suit, 'cover: standing beside the rover in a shower should be a hit and a suit leak');
  delete g.faults.suit; hits = g.stats.hits;
  await P(async () => { window.vr.crouch(0.95); await window.vr.frames(4); window.moonbase.sendPose(); await window.vr.sleep(200); });
  check(Math.abs(g.astro.h - 0.95 / 1.7 * 1.65) < 0.05, `cover: crouched to 0.95 m, the server should hear a head height near ${(0.95 / 1.7 * 1.65).toFixed(2)}, heard ${g.astro.h.toFixed(2)}`);
  await shower(1);
  check(g.stats.hits === hits, 'cover: crouched beside the rover should be safe');
  // In the open, crouching does not help.
  await stand(-12, 12, 0, 0, 0.95);
  await shower(1);
  check(g.stats.hits === hits + 1, 'cover: crouching out in the open should not be cover');
  delete g.faults.suit; hits = g.stats.hits;
  // Under the canopy, standing.
  await stand(0, 4.4, 0, 0, 1.7);
  await shower(1);
  check(g.stats.hits === hits, 'cover: standing under the airlock canopy should be safe');
  // Height is relative: a small player (1.3 m standing) is not crouching just by being short...
  await P(() => window.vr.T && (window.moonbase.resetStanding?.()));
  await stand(...beside, 1.3);
  await page.waitForTimeout(200);
  const small = g.astro.h;
  await P(async () => { window.vr.crouch(0.8); await window.vr.frames(4); window.moonbase.sendPose(); await window.vr.sleep(200); });
  check(small > CFG.crouchHeight && g.astro.h < CFG.crouchHeight, `cover: a player 1.3 m tall should count as standing (heard ${small.toFixed(2)}) and as crouched at 0.8 m (heard ${g.astro.h.toFixed(2)})`);

  // ---------- 10. bare hands (hand tracking) ----------
  step('10. the same with bare hands');
  await kit();
  delete g.faults.suit;
  await P(async () => { window.fakeXR.kind('left', 'hand'); window.fakeXR.kind('right', 'hand'); await window.vr.frames(8); });
  check(await P(() => window.moonbase.controllers.every(c => c.userData.isHand)), 'hands: the page did not notice the controllers were put down');
  check(await P(() => window.moonbase.fx.gloves.every(gl => !gl.visible)), 'hands: the controller gloves are still drawn over tracked hands');
  await faceTool('brush');
  r = await grabTool('right', 'brush'); // grip() pinches when the hand is bare
  check(r.ring && r.held === 'brush' && r.parent === 'hand:right', 'hands: a pinch on the brush did not take it off the rack: ' + JSON.stringify(r));
  await letGo('right');
  check(g.ground.brush && await P(() => window.vr.parentOf('brush')) === 'ground', 'hands: letting the pinch go did not drop the brush on the ground');
  // Holding a tool in one hand and pinching the other in empty air must not start the visor zoom.
  await stand(0, 9, 0, 0);
  await kit('brush');
  r = await grabTool('right', 'brush');
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase, X = window.fakeXR;
    const before = mb.rig.position.clone();
    v.hand('left', v.wp(mb.camera).add(v.V(-0.3, -0.3, -0.4))); await v.frames(2);
    X.pinch('left', true); await v.frames(2);
    v.hand('left', v.wp(mb.camera).add(v.V(-0.6, -0.3, -0.4))); await v.frames(3);
    const zoom = mb.zoom(), stillHeld = v.holding('right')?.id;
    X.pinch('left', false); await v.frames(2);
    mb.rig.rotation.y = Math.atan2(0, 9); // undo any turn the left-hand drag made
    return { zoom, stillHeld, moved: mb.rig.position.distanceTo(before) };
  });
  check(r.zoom === 1 && r.stillHeld === 'brush', 'hands: pinching the free hand while holding a tool zoomed, or dropped the tool: ' + JSON.stringify(r));
  await letGo('right');
  // With both hands empty, the two-handed pinch still zooms, and a right pinch at the ground still teleports on release.
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase, X = window.fakeXR, head = v.wp(mb.camera);
    // Hands held up at chest height, in view, clear of the brush lying at your feet.
    const at = dx => head.clone().add(v.V(dx, -0.2, 0).applyQuaternion(mb.rig.quaternion)).add(v.V(0, 0, -0.4).applyQuaternion(mb.rig.quaternion));
    v.hand('left', at(-0.1)); v.hand('right', at(0.1)); await v.frames(2);
    X.pinch('right', true); await v.frames(1);
    X.pinch('left', true); await v.frames(2);
    v.hand('left', at(-0.3)); v.hand('right', at(0.3)); await v.frames(3);
    const zoom = mb.zoom();
    X.pinch('right', false); X.pinch('left', false); await v.frames(2);
    mb.setZoom(1);
    const before = mb.rig.position.clone();
    const down = v.V(0, -0.5, -1).applyQuaternion(mb.rig.quaternion);
    v.hand('right', at(0.2), down); await v.frames(3);
    X.pinch('right', true); await v.frames(2);
    const early = mb.rig.position.distanceTo(before);
    X.pinch('right', false); await v.frames(2);
    return { zoom, early, moved: mb.rig.position.distanceTo(before) };
  });
  check(Math.abs(r.zoom - 3) < 0.2, 'hands: both empty hands pinched and pulled from 20 to 60 cm apart should zoom 3x, got ' + r.zoom);
  check(r.early === 0 && r.moved > 0.5, 'hands: a right pinch at the ground should teleport when let go: ' + JSON.stringify(r));

  // ---------- 11. the cuff on your own arm, and the radio ----------
  step('11. raising the cuff to read it keys the radio');
  // In a headset the gauge cuff is on the back of your own left forearm. Bring it up where you can
  // read it and the radio is on; lower it, turn it over or look away and the radio is off.
  await P(() => {
    const v = window.vr, mb = window.moonbase, T = v.T, X = window.fakeXR;
    // Hold the left arm so the forearm runs along `along` (elbow to hand) with the back of it facing `back`,
    // the wrist at `wrist`. All in the world. A controller's glove runs down and back from where the
    // controller points (0.6 rad, client/stations.js); a tracked hand's wrist joint has -z to the fingers
    // and +y out of the back of the hand.
    v.arm = (wrist, along, back) => {
      const bare = mb.controllers[v.index('left')].userData.isHand;
      const e = along.clone().normalize(), d = back.clone().addScaledVector(e, -back.dot(e)).normalize();
      const z = e.clone().negate(), x = bare ? d.clone().cross(z) : d.clone().negate(), y = bare ? d : z.clone().cross(x);
      const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
      if (!bare) q.multiply(new T.Quaternion().setFromAxisAngle(v.V(1, 0, 0), -0.6));
      mb.rig.updateMatrixWorld(true);
      const local = mb.rig.worldToLocal(wrist.clone()), ql = mb.rig.getWorldQuaternion(new T.Quaternion()).invert().multiply(q);
      // The pretend headset puts a tracked hand's wrist joint 9 cm behind the point it is given.
      if (bare) local.add(v.V(0, 0, -0.09).applyQuaternion(ql));
      X.hand('left', [local.x, local.y, local.z], [ql.x, ql.y, ql.z, ql.w]);
    };
    // The usual way to read a watch: forearm across the chest, back of it up toward the face, eyes down on it.
    v.readCuff = (turned = 1) => {
      X.head(0, 1.7, 0, 0, -0.55);
      mb.rig.updateMatrixWorld(true);
      const R = mb.rig.quaternion, head = mb.rig.localToWorld(v.V(0, 1.7, 0)); // where the head is from this frame on
      const wrist = head.clone().add(v.V(0.1, -0.27, -0.3).applyQuaternion(R));
      v.arm(wrist, v.V(1, 0.05, -0.15).applyQuaternion(R), head.clone().sub(wrist).multiplyScalar(turned));
    };
    v.cuff = () => {
      const a = mb.arm, m = a.group.matrixWorld, at = v.V().setFromMatrixPosition(m), head = v.wp(mb.camera);
      return { ...mb.radioState(), tracked: a.tracked, seen: a.group.visible, glove: !!a.group.getObjectByName('Hand')?.visible, icon: a.shown?.icon,
        faces: v.V().setFromMatrixColumn(m, 2).normalize().dot(head.clone().sub(at).normalize()), upright: v.V().setFromMatrixColumn(m, 1).normalize().y,
        fromHand: at.distanceTo(v.where('left')), fromEyes: at.distanceTo(head) };
    };
  });
  const two = n => typeof n === 'number' ? +n.toFixed(2) : n, brief = o => JSON.stringify(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, two(v)])));
  const cuffChecks = async how => {
    await stand(0, 9, 0, 0, 1.7);
    await P(() => window.vr.sleep(400));
    let c = await P(() => window.vr.cuff());
    check(c.tracked && c.seen && !c.glove, `cuff (${how}): the arm should be on the real left arm, without a second glove: ${brief(c)}`);
    check(!c.keyed && !c.reading, `cuff (${how}): the radio is on with the arms hanging at the sides: ${brief(c)}`);
    // Up into view for an instant is not enough: it has to be held there.
    c = await P(async () => { window.vr.readCuff(); await window.vr.frames(2); return window.vr.cuff(); });
    check(!c.reading, `cuff (${how}): the radio came on the instant the arm came up, with no pause: ${brief(c)}`);
    c = await P(async () => { await window.vr.sleep(700); await window.vr.frames(3); return window.vr.cuff(); });
    check(c.reading && c.keyed && c.talking, `cuff (${how}): holding the cuff up where it can be read did not put the astronaut on the air: ${brief(c)}`);
    check(c.faces > 0.9 && c.upright > 0.6, `cuff (${how}): held like a watch, the face of the cuff should be toward the eyes and the right way up: ${brief(c)}`);
    check(c.fromHand > 0.1 && c.fromHand < 0.4 && c.fromEyes > 0.25 && c.fromEyes < 0.5, `cuff (${how}): the cuff is not on the forearm behind the wrist: ${brief(c)}`);
    check(c.icon === 'microphone, live' && c.shown === 'tx', `cuff (${how}): while on the air the cuff should show a live microphone: ${brief(c)}`);
    // Looking up from it turns the radio off; looking back turns it on again.
    c = await P(async () => { window.fakeXR.head(0, 1.7, 0, -1.2, 0.3); await window.vr.frames(4); return window.vr.cuff(); }); // up and off to the right
    check(!c.reading && !c.keyed && !c.talking && c.icon === 'microphone, off', `cuff (${how}): looking away from the cuff left the radio on: ${brief(c)}`);
    c = await P(async () => { window.vr.readCuff(); await window.vr.sleep(700); await window.vr.frames(3); return window.vr.cuff(); });
    check(c.reading, `cuff (${how}): looking back at the cuff did not key the radio again: ${brief(c)}`);
    // Turning the arm over (palm side to the face) turns it off.
    c = await P(async () => { window.vr.readCuff(-1); await window.vr.frames(4); return window.vr.cuff(); });
    check(!c.reading && !c.keyed, `cuff (${how}): the radio is on with the cuff facing away: ${brief(c)}`);
    await stand(0, 9, 0, 0, 1.7);
    c = await P(async () => { await window.vr.frames(3); return window.vr.cuff(); });
    check(!c.keyed, `cuff (${how}): lowering the arm left the radio on: ${brief(c)}`);
  };
  await P(async () => { window.fakeXR.kind('left', 'controller'); window.fakeXR.kind('right', 'controller'); await window.vr.frames(8); });
  await kit();
  await cuffChecks('controllers');
  // The left trigger still keys the radio without looking, as before.
  r = await P(async () => { window.fakeXR.trigger('left', true); await window.vr.frames(3); const on = window.moonbase.radioState().keyed; window.fakeXR.trigger('left', false); await window.vr.frames(3); return { on, off: window.moonbase.radioState().keyed }; });
  check(r.on && !r.off, 'cuff: the left trigger should still key the radio while it is held: ' + JSON.stringify(r));
  await P(async () => { window.fakeXR.kind('left', 'hand'); window.fakeXR.kind('right', 'hand'); await window.vr.frames(8); });
  await cuffChecks('bare hands');

  // ---------- 12. and it draws ----------
  step('12. drawing real frames in the headset');
  // Everything above ran with the drawing skipped. Draw the scene for real, both eyes, with a tool in
  // each hand, and make sure WebGL has no complaint.
  await P(async () => { window.fakeXR.kind('left', 'controller'); window.fakeXR.kind('right', 'controller'); await window.vr.frames(8); });
  await kit('welder', 'brush', 'patch');
  g.break('dust'); g.break('hull'); g.faults.hull.spot = 0; g.faults.hull.welded[0] = g.faults.hull.welded[1] = true;
  await P(() => window.vr.until(s => s.scene.dust && s.scene.hull, 3));
  const draw = async (name, pose) => {
    await P(pose);
    const out = await P(async shots => {
      const mb = window.moonbase, R = mb.renderer, skip = R.render;
      R.render = R.realRender;
      await window.vr.frames(2);
      const url = shots ? await mb.snap() : null;
      await window.vr.frames(1);
      R.render = skip;
      return { gl: R.getContext().getError(), calls: R.info.render.calls, url };
    }, SHOTS);
    check(out.gl === 0 && out.calls > 20, `drawing (${name}): WebGL error ${out.gl}, ${out.calls} draw calls`);
    if (out.url) fs.writeFileSync(path.join(OUT, `vr-${name}.png`), Buffer.from(out.url.split(',')[1], 'base64'));
  };
  await stand(crack.x + crack.nx * 0.7, crack.z + crack.nz * 0.7, crack.x, crack.z);
  await kit('welder');
  await grabTool('right', 'welder');
  await draw('welding', async () => {
    const v = window.vr, mb = window.moonbase, c = mb.world.fixtures.crack.userData;
    await v.move('right', mb.world.fixtures.crackPts[2].clone().addScaledVector(c.normal, 0.03), 4, c.normal.clone().negate().add(v.V(0, -0.3, 0)), 'welder');
    await v.frames(12); // part-way to beading: the point is glowing
    window.fakeXR.head(0, 1.7, 0, 0, -0.15);
  });
  await letGo('right');
  if (SHOTS) {
    await kit();
    await faceTool('patch');
    await draw('rack', async () => {
      const v = window.vr, mb = window.moonbase;
      await v.move('right', v.wp(mb.fx.tools.welder).add(v.V(0.03, -0.02, 0.12)), 4, v.V(0, 0, -1));
      v.hand('left', v.wp(mb.camera).add(v.V(-0.25, -0.45, -0.35)), v.V(0, 0.2, -1));
      window.fakeXR.head(0, 1.7, 0, 0, -0.2);
      await v.frames(3);
    });
    // Tools lying on the ground at your feet, crouched, the right hand reaching for the brush.
    await stand(0, 9, 0, 0);
    await kit('welder', 'brush', 'patch');
    await draw('ground', async () => {
      const v = window.vr;
      v.crouch(1.0); await v.frames(2);
      v.hand('right', v.wp(window.moonbase.fx.tools.brush).add(v.V(0, 0.08, 0.04)), v.V(0, -1, -0.3));
      window.fakeXR.head(0, 1.0, 0, 0, -1.0);
      await v.frames(4);
    });
    await P(() => window.vr.crouch(1.7));
    await stand(panels[1].x + panels[1].nx * 0.62, panels[1].z + panels[1].nz * 0.62, panels[1].x, panels[1].z);
    await kit('brush');
    await grabTool('right', 'brush');
    await draw('brushing', async () => {
      const v = window.vr, F = window.moonbase.world.fixtures, c = F.dustCells[6 + 1], n = c.getWorldDirection(new v.T.Vector3());
      await v.move('right', v.wp(c).addScaledVector(n, 0.04), 6, n.clone().negate(), 'brush');
      await v.frames(6);
    });
    await letGo('right');
    // Inside, a plug in the hand on its way to a socket.
    await P(async () => { window.moonbase.place('in'); await window.vr.frames(3); });
    g.break('board');
    await P(() => window.vr.until(s => s.scene.board, 3));
    await stand(boardAt.x + boardAt.nx * 0.75, boardAt.z + boardAt.nz * 0.75, boardAt.x, boardAt.z);
    await draw('plug', async () => {
      const v = window.vr, mb = window.moonbase, F = mb.world.fixtures, cable = mb.state().scene.board.findIndex(c => !c.seated);
      const n = F.board.getWorldDirection(new v.T.Vector3()), into = n.clone().negate();
      await v.until(() => F.plugs[cable].position.distanceTo(F.plugRest[cable]) < 0.01, 5);
      await v.sleep(2500); await v.frames(3); // the hall is on its red backup lights by now
      await v.move('right', v.wp(F.plugs[cable]), 5, into); await v.frames(2);
      v.grip('right', true); await v.frames(2);
      const free = [0, 1, 2, 3].find(k => !mb.state().scene.board.some(c => c.seated && c.socket === k));
      await v.move('right', F.board.localToWorld(F.sockets[free].clone()).addScaledVector(n, 0.2).add(v.V(0, -0.02, 0)), 6, into);
      window.fakeXR.head(0, 1.7, 0, 0, -0.25);
      await v.frames(3);
    });
    await P(async () => { window.vr.grip('right', false); await window.vr.frames(2); window.moonbase.place('out'); await window.vr.frames(3); });
    delete g.faults.board;
    // The base, from the spawn side.
    await draw('base', async () => {
      const v = window.vr;
      await v.stand(1.2, 10.5, -0.6, 0);
      window.fakeXR.head(0, 1.7, 0, 0, -0.05);
      await v.frames(3);
    });
    await draw('cuff', async () => {
      const v = window.vr;
      await v.stand(1.2, 10.5, -0.6, 0);
      v.readCuff();
      await v.sleep(600); await v.frames(4);
    });
    g.break('suit', true);
    await P(() => window.vr.until(s => s.suit, 3));
    await draw('forearm', async () => {
      const v = window.vr, mb = window.moonbase, head = v.wp(mb.camera);
      v.hand('left', head.clone().add(v.V(0.05, -0.3, -0.38).applyQuaternion(mb.rig.quaternion)), v.V(1, 0.1, -0.2).applyQuaternion(mb.rig.quaternion));
      window.fakeXR.head(0, 1.7, 0, 0, -0.6);
      await v.frames(4);
    });
  }

  // ---------- 13. the EXIT button on the cuff ends the session ----------
  // Last, because it ends the headset session. Read the cuff with bare hands, then put the right index
  // fingertip on the button: a brush does nothing, holding it for a moment takes you back to the lobby.
  step('13. the EXIT button on the cuff');
  await P(async () => { window.fakeXR.kind('left', 'hand'); window.fakeXR.kind('right', 'hand'); await window.vr.frames(8); });
  await stand(0, 9, 0, 0, 1.7);
  // Line the right index fingertip up 6 cm out from the button's cap (the joints hang off the hand), so
  // that one push of the hand along the face of the cuff puts it on the cap. Frames stop when the session
  // ends, so every wait here gives up after a moment.
  r = await P(async () => {
    const v = window.vr, mb = window.moonbase, a = mb.arm;
    v.fr = n => mb.renderer.xr.isPresenting ? Promise.race([v.frames(n), v.sleep(3000)]) : v.sleep(50);
    v.readCuff(); await v.fr(3);
    const tipJoint = () => mb.renderer.xr.getHand(v.index('right')).joints['index-finger-tip'];
    v.exitAt = () => { a.group.updateWorldMatrix(true, false); return a.EXIT_TOP.clone().applyMatrix4(a.group.matrixWorld); };
    v.exitOut = () => v.V().setFromMatrixColumn(a.group.matrixWorld, 2).normalize();
    let at = v.where('right');
    for (let k = 0; k < 4; k++) { at = at.add(v.exitAt().addScaledVector(v.exitOut(), 0.06).sub(v.wp(tipJoint()))); v.hand('right', at); await v.fr(2); }
    v.push = async (inOut) => { v.hand('right', v.where('right').addScaledVector(v.exitOut(), -0.06 * inOut)); await v.fr(1); };
    v.tipGap = () => v.wp(tipJoint()).distanceTo(v.exitAt());
    return { off: v.tipGap() - 0.06, presenting: mb.renderer.xr.isPresenting };
  });
  check(Math.abs(r.off) < 0.015 && r.presenting, 'exit: could not line the fingertip up with the EXIT button: ' + JSON.stringify(r));
  const exitState = () => P(() => ({ presenting: window.moonbase.renderer.xr.isPresenting, pressing: +window.moonbase.arm.pressing.toFixed(2), gap: +window.vr.tipGap().toFixed(3) }));
  // A brush: on the cap for one frame and straight off again.
  r = await P(async () => { const v = window.vr; await v.push(1); const gap = v.tipGap(); await v.push(-1); await v.sleep(500); await v.fr(3); return { gap, presenting: window.moonbase.renderer.xr.isPresenting }; });
  check(r.gap < 0.02 && r.presenting, 'exit: brushing the EXIT button for an instant ended the session (or the finger never reached it): ' + JSON.stringify(r));
  r = await P(async () => { const v = window.vr; await v.push(1); await v.sleep(250); await v.fr(2); return null; });
  r = await exitState();
  check(r.presenting && r.pressing > 0, 'exit: a fingertip held on the EXIT button should start to press it (cap down, lamp warming): ' + JSON.stringify(r));
  await P(async () => { const v = window.vr; for (let k = 0; k < 10 && window.moonbase.renderer.xr.isPresenting; k++) { await v.sleep(150); await v.fr(1); } });
  r = await exitState();
  check(!r.presenting, 'exit: holding the EXIT button did not end the headset session: ' + JSON.stringify(r));
  check(await P(() => !document.getElementById('gate').hidden), 'exit: the lobby did not come back after leaving the headset');
} catch (e) {
  problems.push('vr: ' + e.message);
} finally {
  await browser.close();
  clearInterval(ticker);
  server.close();
}
if (problems.length) { console.error('VR TEST FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`vr test passed: every repair done by hand in a pretend headset, with controllers and with bare hands. ${SHOTS ? `Pictures in ${path.relative(ROOT, OUT)}/` : 'No pictures taken (VR_SHOTS=1 for those).'}`);
process.exit(0);
