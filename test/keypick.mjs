// Picking tools up from the keyboard: npm run keypick
//
// On a laptop, E takes the loose tool (or sample) you are looking at and keeps it for as long as E is held;
// letting go of E lets go of it. With nothing in view E is left to its other job (on and off the Hauler).
// Runs the astronaut's page in desk mode against the game server in this process.
//
//   npm i -D playwright && npx playwright install chromium   (once)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub, PAGES } from '../server/hub.js';
import { CFG } from '../client/shared/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), PORT = 3204;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const hub = new Hub(undefined, { requireFullCrew: false });
const g = hub.game;
hub.choosePlayers(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let url = new URL(req.url, 'http://x').pathname;
  if (url === '/seats') return res.end(JSON.stringify(hub.seats()));
  if (url === '/') url = '/index.html';
  url = PAGES[url] || url;
  fs.readFile(path.join(WEB, url), (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' }); res.end(d); });
});
new WebSocketServer({ server }).on('connection', ws => {
  const c = { send: d => { if (ws.readyState === 1) ws.send(d, { binary: typeof d !== 'string' }); } };
  hub.add(c); ws.on('close', () => hub.remove(c)); ws.on('message', (d, b) => hub.message(c, b ? d : d.toString(), b));
});
const ticker = setInterval(() => { if (g.phase === 'run') { g.timeLeft = 150; g.oxygen = 90; } hub.tick(); }, CFG.tickMs);
await new Promise(r => server.listen(PORT, r));

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); return ok; };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const c = await browser.newContext({ viewport: { width: 960, height: 540 } }); await c.addInitScript({ path: new URL('./briefed.js', import.meta.url).pathname });
  const page = await c.newPage();
  page.on('pageerror', e => problems.push('page: ' + e.message));
  await page.goto(`http://localhost:${PORT}/astronaut`);
  await page.waitForTimeout(1500);
  await page.click('#radioBtn'); await page.waitForTimeout(300);
  await page.click('#deskBtn'); await page.waitForTimeout(800);
  g.start(); g.script = [];
  await page.waitForFunction(() => window.moonbase.state()?.phase === 'run', null, { timeout: 60000, polling: 200 });
  const E = (fn, arg) => page.evaluate(fn, arg);
  const until = async (test, seconds = 8) => { for (const end = Date.now() + seconds * 1000; Date.now() < end;) { if (await test()) return true; await page.waitForTimeout(100); } return false; };
  // Lay a tool 1 m ahead of the head on the hall floor and look straight down at it.
  const lookAt = (id) => E(async id => {
    const mb = window.moonbase, T = mb.THREE;
    mb.fx.give(null);
    mb.camera.rotation.x = 0; mb.camera.updateMatrixWorld(true);
    const head = mb.camera.getWorldPosition(new T.Vector3()), f = mb.camera.getWorldDirection(new T.Vector3()).setY(0).normalize();
    const p = head.clone().addScaledVector(f, 1.0), l = mb.interior.toLocal(p.x, p.z);
    mb.fx.layTool(id, 'hall', l.x, 0, l.z);
    mb.camera.rotation.x = -Math.atan2(head.y - 0.05, 1.0);
    await new Promise(r => setTimeout(r, 900));
  }, id);
  const hands = () => E(() => window.moonbase.fx.hands);

  // Holding E takes the tool and keeps it; letting go of E lets go of it.
  await lookAt('brush');
  await page.keyboard.down('e');
  check(await until(async () => (await hands())[1] === 'brush'), `E held on the brush: it should be in the right hand, hands are ${JSON.stringify(await hands())}`);
  check(await until(() => g.hands[1] === 'brush'), `E held: the server should have the brush in the right hand: ${JSON.stringify(g.hands)}`);
  await page.waitForTimeout(1800);
  check((await hands())[1] === 'brush' && g.hands[1] === 'brush', 'E still held: the brush should stay in the hand (nothing should let go of it)');
  await page.keyboard.up('e');
  check(await until(async () => (await hands()).every(h => !h)), `E released: the brush should leave the hand, hands are ${JSON.stringify(await hands())}`);
  check(await until(() => g.hands.every(h => !h) && g.tools.brush.at === 'loose'), `E released: the server should have the brush loose: ${JSON.stringify(g.hands)} ${g.tools.brush.at}`);
  check(await E(() => window.moonbase.fx.keyHeld) === null, 'E released: nothing should be marked as held by the key');

  // It can be picked up again, and a tool taken by click is not let go when E is pressed and released elsewhere.
  await lookAt('welder');
  await page.keyboard.down('e');
  check(await until(async () => (await hands()).includes('welder')), 'E held on the welder: it should be in a hand');
  await page.keyboard.up('e');
  check(await until(async () => (await hands()).every(h => !h)), 'E released: the welder should leave the hand');

  // With nothing in view E takes nothing, and does not disturb what is already in a hand.
  await lookAt('patch');
  await E(() => { const mb = window.moonbase, owns = (r, m) => { for (let o = m; o; o = o.parent) if (o === r) return true; return false; }; const m = mb.fx.targets().find(m => owns(mb.fx.tools.patch, m)); mb.fx.click(m, null); });
  check(await until(async () => (await hands()).includes('patch')), 'a click should still take the patch kit');
  await E(() => { window.moonbase.camera.rotation.x = 0.9; }); // look up at the ceiling
  await page.waitForTimeout(300);
  await page.keyboard.down('e'); await page.waitForTimeout(500); await page.keyboard.up('e'); await page.waitForTimeout(500);
  check((await hands()).includes('patch'), 'E pressed at nothing must not let go of a tool taken by click');
  check(await E(() => window.moonbase.riding()) === false, 'E at nothing, far from the Hauler, should not mount it');
} catch (e) {
  problems.push(e.message);
} finally {
  clearInterval(ticker);
  await browser.close();
  server.close();
}
if (problems.length) { console.error('KEYPICK TEST FAILED\n' + problems.join('\n')); process.exit(1); }
console.log('keypick test passed: E held takes the tool you look at and keeps it, letting go of E lets go, and E at nothing is left alone.');
process.exit(0);
