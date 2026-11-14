// Browser smoke test: starts the Node server (or targets SMOKE_URL), opens Mission Control and the astronaut page in headless
// Chromium with the real three.js build, starts a mission, and checks that the 3D scene renders
// without errors and that using a panel reaches the server. Screenshots land in test/shots/.
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
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } }); // software GL: keep the pixel count down
async function open(name, url) {
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  // Errors, and WebGL complaints, which arrive as warnings (a failed draw leaves a black surface, not an exception).
  p.on('console', m => { if (m.type() === 'error' || /GL_INVALID|WebGL: INVALID/.test(m.text())) problems.push(`${name}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) problems.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + url);
  return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 600000 });

try {
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
  await ctl.click('button:has-text("Start mission")');
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

  // The visor scope: look up at the panel's screen, zoom in, and check the scope holds a real picture
  // (lit pixels of more than one colour, not a black or blank disc). Laptop players have no gesture
  // for this; the test sets the zoom directly.
  const scope = await astro.evaluate(async () => {
    const mb = window.moonbase, pitch = mb.camera.rotation.x;
    mb.camera.rotation.x = pitch + 0.21;
    mb.setZoom(3);
    await new Promise(r => setTimeout(r, 3000)); // a few software-rendered frames
    const t = mb.scopeTarget, px = new Uint8Array(t.width * t.height * 4), seen = new Set();
    mb.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, px);
    let lit = 0;
    for (let i = 0; i < px.length; i += 4 * 97) { // a sparse sample is plenty
      if (px[i] + px[i + 1] + px[i + 2] > 120) lit++;
      seen.add((px[i] >> 5) + ',' + (px[i + 1] >> 5) + ',' + (px[i + 2] >> 5));
    }
    return { on: mb.scope.visible, zoom: mb.zoom(), lit, colours: seen.size, pitch };
  });
  if (!scope.on || scope.zoom !== 3) problems.push('visor zoom: the scope did not turn on: ' + JSON.stringify(scope));
  else if (scope.lit < 50 || scope.colours < 4) problems.push('visor zoom: the scope picture is blank: ' + JSON.stringify(scope));
  await shot(astro, 'astronaut-zoom');
  await astro.evaluate(pitch => { const mb = window.moonbase; mb.setZoom(1); mb.camera.rotation.x = pitch; }, scope.pitch);

  // Screenshots last, and one page at a time: the two WebGL pages fight for the CPU in software rendering.
  await shot(astro, 'astronaut-fuel-depot');
  await astro.evaluate(() => { const mb = window.moonbase; mb.rig.position.set(0, 0, 7); mb.rig.rotation.y = 0; mb.camera.rotation.x = 0; });
  await astro.waitForTimeout(300);
  await shot(astro, 'astronaut-spawn');
  await astro.close();
  await shot(ctl, 'mission-control');
} catch (e) {
  problems.push('smoke: ' + e.message);
} finally {
  await browser.close();
  server?.kill();
}

if (problems.length) { console.error('SMOKE FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`smoke passed: scene renders with three.js, using a panel reached the server. Screenshots in ${path.relative(ROOT, OUT)}/`);
