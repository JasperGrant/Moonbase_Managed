// The end of a mission on the laptop pages: npm run debrief
//
// Ends a mission on the server at once (no three-minute run to wait for), then checks what the astronaut
// (on a laptop: hold X) and Mission Control see, and that every seat can go back to the lobby in either
// order. The headset half of this is in test/vr.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub, PAGES } from '../server/hub.js';
import { CFG } from '../client/shared/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), PORT = 3300;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const hub = new Hub(undefined, { requireFullCrew: false });
const g = hub.game;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4' };
const server = http.createServer((req, res) => {
  let url = new URL(req.url, 'http://x').pathname;
  if (url === '/seats') return res.end(JSON.stringify(hub.seats()));
  url = PAGES[url] || url;
  fs.readFile(path.join(WEB, url), (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(url)] || 'application/octet-stream' }); res.end(d); });
});
new WebSocketServer({ server }).on('connection', ws => {
  const c = { send: d => { if (ws.readyState === 1) ws.send(d, { binary: typeof d !== 'string' }); } };
  hub.add(c); ws.on('close', () => hub.remove(c)); ws.on('message', (d, b) => hub.message(c, b ? d : d.toString(), b));
});
const ticker = setInterval(() => hub.tick(), CFG.tickMs);
await new Promise(r => server.listen(PORT, r));

const problems = [];
const T0 = Date.now(), step = what => console.log(`  ${String(Math.round((Date.now() - T0) / 1000)).padStart(4)} s  ${what}`);
const check = (ok, what) => { if (!ok) { problems.push(what); console.log('        FAILED: ' + what); } return ok; };
const POLL = { timeout: 60000, polling: 200 };
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browsers = [];
async function open(url, size) { // a browser of its own each: software GL starves a shared one
  const b = await chromium.launch({ args: GL }); browsers.push(b);
  const p = await (await b.newContext({ viewport: size })).newPage();
  p.on('pageerror', e => problems.push(`page ${url}: ${e.message}`));
  await p.goto(`http://localhost:${PORT}${url}`);
  return p;
}

try {
  step('opening Mission Control and the astronaut page');
  const ctl = await open('/control', { width: 1100, height: 900 });
  const astro = await open('/astronaut', { width: 640, height: 400 });
  await astro.waitForTimeout(1000);
  await astro.click('#radioBtn');
  await astro.click('#deskBtn');
  await astro.waitForFunction(() => window.moonbase && window.moonbase.state(), null, POLL);
  const lobbyShown = () => ctl.evaluate(() => !document.getElementById('lobbyView').hidden && document.getElementById('results').hidden);
  const resultsShown = () => ctl.evaluate(() => !document.getElementById('results').hidden && document.getElementById('lobbyView').hidden);

  // ---------- a lost mission; the astronaut leaves first, holding X ----------
  step('a lost mission: the astronaut leaves first');
  g.start(); g.script = [];
  await astro.waitForFunction(() => window.moonbase.state().phase === 'run', null, POLL);
  await ctl.waitForFunction(() => window.moonbase.state()?.phase === 'run', null, POLL);
  g.end(false, 'Suit oxygen ran out.');
  await astro.waitForFunction(() => window.moonbase.debrief(), null, POLL);
  await ctl.waitForFunction(() => window.moonbase.debrief(), null, POLL);
  let r = await astro.evaluate(async () => {
    const mb = window.moonbase;
    for (let i = 0; i < 30 && !mb.arm.shown?.debrief; i++) await new Promise(r => setTimeout(r, 100));
    const head = mb.camera.getWorldPosition(new mb.THREE.Vector3());
    const front = new mb.THREE.Vector3(0, 0, 1).applyQuaternion(mb.resultBoard.getWorldQuaternion(new mb.THREE.Quaternion()));
    const dir = mb.camera.getWorldDirection(new mb.THREE.Vector3()).setY(0).normalize();
    const to = mb.resultBoard.getWorldPosition(new mb.THREE.Vector3()).sub(head).setY(0).normalize();
    return { board: mb.resultBoard.visible, inFront: dir.dot(to), facesHead: front.dot(to.clone().negate()), status: mb.arm.shown?.status, face: mb.arm.shown?.debrief };
  });
  check(r.board && r.inFront > 0.9 && r.facesHead > 0.9, 'astronaut: no MISSION FAILED board in front of them, facing them: ' + JSON.stringify(r));
  check(r.face && r.status === 'lost', 'astronaut: the cuff should show the cross: ' + JSON.stringify(r));
  check(await ctl.evaluate(() => { const b = document.querySelector('#results [data-lobby]'); return !!b && !document.getElementById('crewLamp').classList.contains('on') && Number(document.getElementById('debriefLeft').textContent) > 0; }), 'console: BACK TO LOBBY, the lamp off and the seconds left should be showing');
  await astro.keyboard.down('x');
  await astro.waitForFunction(() => !window.moonbase.debrief(), null, POLL);
  await astro.keyboard.up('x');
  await astro.waitForTimeout(800); // the fade
  r = await astro.evaluate(() => { const mb = window.moonbase; return { phase: mb.state().phase, board: mb.resultBoard.visible, room: mb.board.visible, where: mb.where() }; });
  check(r.phase === 'lobby' && !r.board && r.room && r.where === 'in', 'astronaut: holding X should take everyone to the lobby and the astronaut back to the status board in the hall: ' + JSON.stringify(r));
  await ctl.waitForFunction(() => document.getElementById('crewLamp')?.classList.contains('on'), null, POLL);
  check(await resultsShown(), 'console: its results were pulled away when the astronaut went back to the lobby');
  await ctl.click('#results [data-lobby]');
  await ctl.waitForFunction(() => !document.getElementById('lobbyView').hidden, null, POLL);
  check(await lobbyShown(), 'console: BACK TO LOBBY should show the lobby');

  // ---------- a won mission; Mission Control leaves first ----------
  step('a won mission: Mission Control leaves first');
  g.start(); g.script = [];
  await astro.waitForFunction(() => window.moonbase.state().phase === 'run', null, POLL);
  await ctl.waitForFunction(() => window.moonbase.state()?.phase === 'run', null, POLL);
  g.end(true, 'The base held.');
  await astro.waitForFunction(() => window.moonbase.debrief()?.won, null, POLL);
  await ctl.waitForFunction(() => window.moonbase.debrief(), null, POLL);
  await ctl.click('#results [data-lobby]');
  await astro.waitForFunction(() => window.moonbase.state().phase === 'lobby', null, POLL);
  await astro.waitForTimeout(500);
  r = await astro.evaluate(() => { const mb = window.moonbase; return { debrief: !!mb.debrief(), board: mb.resultBoard.visible, status: mb.arm.shown?.status }; });
  check(r.debrief && r.board && r.status === 'won', 'astronaut: Mission Control going back first should not pull the debrief away: ' + JSON.stringify(r));
  await astro.keyboard.down('x');
  await astro.waitForFunction(() => !window.moonbase.debrief(), null, POLL);
  await astro.keyboard.up('x');
  await astro.waitForTimeout(800);
  r = await astro.evaluate(() => ({ phase: window.moonbase.state().phase, room: window.moonbase.board.visible, board: window.moonbase.resultBoard.visible }));
  check(r.phase === 'lobby' && r.room && !r.board, 'astronaut: EXIT after the others have left should still bring them back to the status board: ' + JSON.stringify(r));
  // And the next mission starts clean: no debrief carried over.
  g.start(); g.script = [];
  await astro.waitForFunction(() => window.moonbase.state().phase === 'run', null, POLL);
  check(await astro.evaluate(() => !window.moonbase.debrief() && !window.moonbase.resultBoard.visible), 'astronaut: a new mission should start with no debrief');
} catch (e) {
  problems.push('debrief: ' + e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  clearInterval(ticker); server.close();
}
if (problems.length) { console.error('DEBRIEF TEST FAILED\n' + problems.join('\n')); process.exit(1); }
console.log('debrief test passed: the astronaut and Mission Control both see how the mission went, and every seat gets back to the lobby, in either order.');
process.exit(0);
