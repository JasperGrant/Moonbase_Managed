// Browser smoke test: starts the server, opens Mission Control and the astronaut page in headless
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

const server = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const problems = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
async function open(name, url) {
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') problems.push(`${name}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) problems.push(`${name}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(`http://localhost:${PORT}${url}`);
  return p;
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png'), timeout: 120000 });

try {
  const ctl = await open('console', '/console.html?role=all');
  const astro = await open('astronaut', '/astronaut.html');
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
  server.kill();
}

if (problems.length) { console.error('SMOKE FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`smoke passed: scene renders with three.js, using a panel reached the server. Screenshots in ${path.relative(ROOT, OUT)}/`);
