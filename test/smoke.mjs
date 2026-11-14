// Browser smoke test: starts the Node server (or targets SMOKE_URL), opens Mission Control and the astronaut page in headless
// Chromium with the real three.js build, starts a mission, and checks that the 3D scene renders
// without errors and that using a panel reaches the server. With SMOKE_SHOTS=1, screenshots land in test/shots/.
//
//   npm i -D playwright && npx playwright install chromium   (once)
//   npm run smoke
//
// Headless Chromium renders WebGL in software here, so the scene runs at a few frames per second and
// each screenshot can take seconds. That is the test machine, not the game.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
// Two browsers, one after the other. The first has no microphone and does the scene, the gestures and
// the screenshots. The second has a pretend microphone (and says yes to the permission prompt) so the
// radio really transmits; it runs only the radio check, because here the pretend microphone doubles
// the browser's memory and halves its frame rate, and with the screenshots on top the run gets killed.
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const MIC = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
let browser = await chromium.launch({ args: GL });
let ctx = await browser.newContext({ viewport: { width: 960, height: 540 } }); // software GL: keep the pixel count down
async function open(name, url) {
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  // Errors, and WebGL complaints, which arrive as warnings (a failed draw leaves a black surface, not an exception).
  p.on('console', m => { if (m.type() === 'error' || /GL_INVALID|WebGL: INVALID/.test(m.text())) problems.push(`${name}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) problems.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + url);
  return p;
}
const T0 = Date.now(), step = what => console.log(`  ${String(Math.round((Date.now() - T0) / 1000)).padStart(4)} s  ${what}`);
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

try {
  step('opening Mission Control and the astronaut page');
  const ctl = await open('console', '/control');
  const astro = await open('astronaut', '/astronaut');
  await astro.waitForTimeout(1000);
  await astro.click('#radioBtn');
  await astro.waitForTimeout(300);
  await astro.click('#deskBtn');
  await astro.waitForTimeout(500);
  const pitch = await astro.evaluate(() => Math.abs(window.moonbase.camera.rotation.x));
  if (pitch > 0.2) problems.push(`astronaut: camera pitched ${pitch.toFixed(2)} rad right after entering (pointer-lock jump)`);

  // Start the round now: the first alarm is always the fuel depot, 4 s in. Wait until one of its
  // wires is clickable (the panel syncs on the next rendered frame, which lags here).
  step('starting the mission, waiting for the fuel depot alarm');
  await ctl.click('button:has-text("Start mission")');
  // Mission Control's page draws the rover camera, a second 3D scene. In software rendering the two
  // scenes starve each other, so it is closed for now and opened again at the end for its screenshot.
  await ctl.close();
  const issueId = await astro.evaluate(async () => {
    const mb = window.moonbase, st = mb.world.stations.wires;
    const onDepot = m => { for (let o = m; o; o = o.parent) if (o === st) return true; return false; };
    for (let i = 0; i < 300; i++) {
      const is = mb.state()?.issues.find(x => x.type === 'wires');
      if (is && is.left > 15 && mb.panels.targets().some(onDepot)) return is.id;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  });
  if (issueId == null) problems.push('astronaut: no clickable fuel-depot alarm appeared within 30 s');

  step('using the fuel depot panel');
  // Stand in front of the fuel depot panel, aim the view at a wire, and use it (same path as a click).
  const result = await astro.evaluate(async id => {
    const mb = window.moonbase, st = mb.world.stations.wires;
    const pad = mb.panels.targets().find(m => { for (let o = m; o; o = o.parent) if (o === st) return true; return false; });
    if (!pad) return 'no clickable wire on the fuel depot panel';
    const p = pad.getWorldPosition(new pad.position.constructor());
    const back = 1.6;
    mb.rig.position.set(p.x + Math.sin(st.rotation.y) * back, 0, p.z + Math.cos(st.rotation.y) * back);
    mb.rig.rotation.y = st.rotation.y;
    mb.camera.rotation.x = Math.atan2(p.y - 1.65, back);
    mb.rig.updateMatrixWorld(true);
    mb.use();
    // Either the wrong wire was cut (it stays on the panel) or the right one (the alarm is solved and gone).
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      const s = mb.state(), is = s?.issues.find(x => x.id === id);
      if (is && is.cut.length) return 'cut';
      if (!is && s?.ev && (s.ev.kind === 'solve' || s.ev.kind === 'mistake')) return 'solved';
    }
    return 'use() did not reach the server: ' + JSON.stringify(mb.state()?.ev);
  }, issueId);
  if (result !== 'cut' && result !== 'solved') problems.push('astronaut: ' + result);

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
    mb.rig.position.copy(stood.p); mb.rig.rotation.y = stood.ry; mb.camera.rotation.x = stood.rx; // back to the fuel depot
    return bad;
  });
  for (const g of gestures) problems.push('hand gestures: ' + g);

  step('visor zoom');
  // The visor scope: look up at the panel's screen and zoom in. The scope must be on, its extra pass
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
  if (face.radio !== 'NO MICROPHONE' || face.frame !== '#ffb347') problems.push('wrist gauges: the face does not show NO MICROPHONE in amber: ' + JSON.stringify(face));
  await view(astro, 'astronaut-wrist');
  await astro.keyboard.up('Tab');
  await until('wrist gauges: letting go of Tab did not lower the arm', async () => (await armState(astro)).raise === 0);

  await view(astro, 'astronaut-fuel-depot');
  await astro.evaluate(() => { const mb = window.moonbase; mb.rig.position.set(0, 0, 7); mb.rig.rotation.y = 0; mb.camera.rotation.x = 0; });
  await astro.waitForTimeout(300);
  await view(astro, 'astronaut-spawn');
  await astro.close();
  const ctl2 = await seat('console', '/control');
  await ctl2.waitForTimeout(1500);
  await shot(ctl2, 'mission-control');
  await browser.close();

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
  if (red.radio !== 'TRANSMITTING' || red.frame !== '#ff5c5c') problems.push('wrist gauges: the face does not show TRANSMITTING in red: ' + JSON.stringify(red));
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
  await browser.close();
  server?.kill();
}

if (problems.length) { console.error('SMOKE FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`smoke passed: scene renders with three.js, using a panel reached the server, hand gestures, visor zoom, wrist gauges and the radio both ways work. ${SHOTS ? `Screenshots in ${path.relative(ROOT, OUT)}/` : 'No screenshots taken (SMOKE_SHOTS=1 for those).'}`);
