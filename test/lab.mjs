// The Real Mission's lab, through the real pages: npm run lab, or npm run lab:shots for pictures.
//
// The admin chooses the Real Mission (which no seat can), starts it, and puts one sample of each kind on the lab
// rack. A laptop astronaut stands at each of the four instruments in turn and works its keys (each key must be the
// first thing a ray from the eye meets, as a click would be); the Scientist's page calls each run; the Technician
// throws the furnace's breaker. Every experiment must end in a graded finding, and the mission in a win.
// With LAB_SHOTS=1 it writes the instruments, the Scientist's LAB page and Mission Ops' board to test/shots/lab/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.LAB_SHOTS ? path.join(ROOT, 'test', 'shots', 'lab') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PORT = 3211, BASE = `http://localhost:${PORT}`;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const server = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const problems = [], browsers = [];
const check = (ok, what) => { if (!ok) problems.push(what); return ok; };
const T0 = Date.now(), step = what => console.log(`  ${String(Math.round((Date.now() - T0) / 1000)).padStart(4)} s  ${what}`);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
async function open(name, url, size, gl = false) {
  const b = await chromium.launch(gl ? { args: GL } : {}); browsers.push(b);
  const c = await b.newContext({ viewport: size }); await c.addInitScript({ path: path.join(ROOT, 'test', 'briefed.js') });
  const p = await c.newPage();
  p.on('pageerror', e => problems.push(`${name}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') problems.push(`${name}: ${m.text()}`); });
  await p.goto(BASE + url);
  return p;
}
function socket(role) {
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws');
  return new Promise((ok, fail) => { ws.once('open', () => { ws.send(JSON.stringify({ t: 'hello', role })); ok(ws); }); ws.once('error', fail); });
}
const until = async (what, test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await test()) return true; await new Promise(r => setTimeout(r, 250)); } problems.push(what); return false; };

try {
  await fetch(BASE + '/players', { method: 'POST', body: JSON.stringify({ players: 4 }) });
  const admin = await socket('admin');
  const sendAdmin = (cmd, x = {}) => admin.send(JSON.stringify({ t: 'admin', cmd, ...x }));
  step('opening the astronaut, the Scientist and Mission Ops');
  const astro = await open('astronaut', '/astronaut', { width: 960, height: 540 }, true);
  const sci = await open('scientist', '/sci', { width: 1366, height: 768 });
  const ops = await open('ops', '/ops', { width: 1366, height: 768 });
  const tech = await socket('tech');
  await astro.waitForTimeout(1500);
  await astro.click('#radioBtn', { noWaitAfter: true });
  await astro.waitForTimeout(300);
  await astro.evaluate(() => document.getElementById('deskBtn').click()); // the page is busy drawing in software: do not wait on it
  await astro.waitForTimeout(1500);

  // A seat cannot choose the Real Mission; the admin can.
  await ops.evaluate(() => window.moonbase.net.send({ t: 'mode', mode: 'real' }));
  await ops.waitForTimeout(500);
  check(await ops.evaluate(() => window.moonbase.state()?.mode) !== 'real', 'Mission Ops could choose the Real Mission');
  check(await ops.evaluate(() => !document.querySelector('[data-mode="real"]')), 'the lobby offers the Real Mission to a seat');
  sendAdmin('mode', { mode: 'real' });
  await until('the admin could not choose the Real Mission', () => ops.evaluate(() => window.moonbase.state()?.mode === 'real'));
  sendAdmin('start');
  await until('the Real Mission did not start', () => astro.evaluate(() => window.moonbase.state()?.phase === 'run' && !!window.moonbase.state()?.lab));
  check(await astro.evaluate(() => window.moonbase.state().round) === 900, 'a Real Mission is fifteen minutes');
  sendAdmin('labready');
  await until('the samples did not reach the lab rack', () => astro.evaluate(() => Object.values(window.moonbase.state().lab.board).every(b => b.state === 'ready')));
  step('four samples on the rack: every experiment ready');

  // The astronaut, inside, in front of an instrument: press its keys as clicks would.
  await astro.evaluate(() => {
    const mb = window.moonbase, T = mb.THREE, ray = new T.Raycaster();
    const LAB = { E1: [-2.25, -9.35, Math.PI / 2], E3: [-2.25, -7.85, Math.PI / 2], E2: [2.3, -9.25, -Math.PI / 2], E4: [2.3, -10.85, -Math.PI / 2] };
    window.lab = {
      stand(exp) { const [x, z, yaw] = LAB[exp]; mb.standAt('in', x, z, yaw); mb.sendPose(); },
      // Aim at the key and click it, if the ray from the eye meets it first. op: the key's op, n: which of two.
      key(exp, op, n = 0) {
        const root = mb.lab.group.getObjectByName('Root_' + exp);
        const keys = []; root.traverse(o => { if (o.name === 'Key_' + op) keys.push(o); });
        const k = keys[n]; if (!k) return 'no key ' + op;
        mb.rig.updateMatrixWorld(true); mb.camera.updateMatrixWorld(true);
        const eye = mb.camera.getWorldPosition(new T.Vector3()), p = k.getWorldPosition(new T.Vector3());
        ray.set(eye, p.clone().sub(eye).normalize()); ray.far = 3;
        const hit = ray.intersectObjects(mb.lab.targets().concat(mb.fx.targets()), false)[0];
        if (hit?.object !== k) return 'blocked ' + op + ' (' + (hit?.object?.name || 'nothing') + ')';
        k.userData.click(hit.point);
        return 'ok';
      },
      view: exp => mb.state().lab[exp], board: () => mb.state().lab.board,
      // For the pictures: step back a little and look down at the instrument, its display and its keys.
      frame(exp) {
        const [x, z, yaw] = LAB[exp], back = Math.sign(x) * 0.35, root = mb.lab.group.getObjectByName('Root_' + exp);
        mb.standAt('in', x - back, z, yaw); mb.sendPose();
        const p = root.getWorldPosition(new T.Vector3()); p.y += exp === 'E1' || exp === 'E3' ? 0.3 : 1.0; // the bench instruments' roots are on the bench top already
        mb.rig.updateMatrixWorld(true);
        const eye = mb.camera.getWorldPosition(new T.Vector3()), d = p.clone().sub(eye);
        mb.camera.rotation.x = Math.atan2(d.y, Math.hypot(d.x, d.z)); mb.camera.updateMatrixWorld(true);
      },
    };
  });
  const key = async (exp, op, n = 0, times = 1) => { for (let i = 0; i < times; i++) { const r = await astro.evaluate(([e, o, k]) => window.lab.key(e, o, k), [exp, op, n]); if (r !== 'ok') { problems.push(`astronaut: ${exp} ${r}`); return false; } await astro.waitForTimeout(60); } return true; };
  const view = exp => astro.evaluate(e => window.lab.view(e), exp);
  const board = () => sci.evaluate(() => window.moonbase.state().lab.board);
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), timeout: 300000 }); };
  const snap = async name => { if (!SHOTS) return; const url = await astro.evaluate(() => window.moonbase.snap()); const { writeFileSync } = await import('node:fs'); writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(url.split(',')[1], 'base64')); };
  const call = (exp, answer) => sci.evaluate(([e, a]) => window.moonbase.net.send({ t: 'lab', exp: e, answer: a }), [exp, answer]);
  await sci.keyboard.press('Digit4');

  // E1 THIN SECTION: load, focus, polariser, turn each grain, then the Scientist calls.
  step('E1: the microscope');
  await astro.evaluate(() => window.lab.stand('E1')); await astro.waitForTimeout(500);
  await key('E1', 'load');
  await until('E1 did not load', async () => (await board()).E1.state === 'loaded', 8000);
  await key('E1', 'focus', 1, 18); await key('E1', 'pol');
  for (let g = 0; g < 3; g++) { await key('E1', 'stage', 1, 12); if (g < 2) await key('E1', 'next'); }
  await astro.waitForTimeout(500);
  await astro.evaluate(() => window.lab.frame('E1')); await astro.waitForTimeout(1200);
  await snap('astronaut-e1-microscope');
  await shot(sci, 'scientist-lab-e1');
  for (let g = 0; g < 3; g++) await call('E1', { grain: g, mineral: 'plag' });
  await until('E1 did not end in a finding', async () => (await board()).E1.state === 'done', 8000);

  // E2 ROCK CLOCK: pump down, beam on, find 39 and 40, latch each, the Scientist reads the age off the slide rule.
  step('E2: the mass spectrometer');
  await astro.evaluate(() => window.lab.stand('E2')); await astro.waitForTimeout(500);
  await key('E2', 'load'); await until('E2 did not load', async () => (await board()).E2.state === 'loaded', 8000);
  await key('E2', 'pump');
  await until('E2: the vacuum never came good', async () => (await view('E2')).vac >= 0.9, 20000);
  await key('E2', 'beam');
  // The beam must be on to latch. If the filament burned (beam on before the vacuum was good), wait it out and try again.
  await until('E2: the beam never came on: ' + JSON.stringify(await view('E2')), async () => {
    const v = await view('E2'); if (v.beam) return true;
    if (!v.burnt && v.vac >= 0.9) await key('E2', 'beam');
    return false;
  }, 60000);
  for (const m of [39, 40]) { const v = await view('E2'); await key('E2', 'mass', 1, Math.round((m - v.mass) / 0.05)); await astro.waitForTimeout(300); await key('E2', 'latch'); }
  await astro.waitForTimeout(500);
  const e2 = await sci.evaluate(() => window.moonbase.state().lab.E2);
  check(e2.latched.length === 2, 'E2: two peaks should be latched: ' + JSON.stringify(e2));
  await astro.evaluate(() => window.lab.frame('E2')); await astro.waitForTimeout(1200);
  await snap('astronaut-e2-mass-spec');
  await shot(sci, 'scientist-lab-e2');
  const age = e2.latched.length === 2 ? Math.log(1 + (e2.latched[1].counts / e2.latched[0].counts) / 10) / 0.554 : 3.5;
  await call('E2', +age.toFixed(2));
  await until('E2 did not end in a finding', async () => (await board()).E2.state === 'done', 8000);

  // E3 FIRE FOUNTAIN: no heat until the Technician's breaker; then three steps held.
  step('E3: the step furnace');
  await astro.evaluate(() => window.lab.stand('E3')); await astro.waitForTimeout(500);
  await key('E3', 'load'); await until('E3 did not load', async () => (await board()).E3.state === 'loaded', 8000);
  tech.send(JSON.stringify({ t: 'breaker', id: 'furnace', on: true }));
  for (const target of [450, 750, 1050]) {
    const v = await view('E3');
    await key('E3', 'set', target > v.set ? 1 : 0, Math.round(Math.abs(target - v.set) / 25));
    const want = [450, 750, 1050].indexOf(target) + 1;
    // Hold it as a player does: the furnace drifts, so watch the needle and nudge the dial back toward the middle.
    await until(`E3: step ${want} was not held`, async () => {
      const e = await view('E3'); if (e.step >= want) return true;
      if (e.temp < target - 25) await key('E3', 'set', 1); else if (e.temp > target + 25) await key('E3', 'set', 0);
      return false;
    }, 90000);
  }
  await astro.evaluate(() => window.lab.frame('E3')); await astro.waitForTimeout(1200);
  await snap('astronaut-e3-furnace');
  await shot(sci, 'scientist-lab-e3');
  await call('E3', 'med');
  await until('E3 did not end in a finding', async () => (await board()).E3.state === 'done', 8000);
  check(!(await sci.evaluate(() => window.moonbase.state().lab.breakers.furnace)), 'E3: the furnace should switch itself off when done');

  // E4 COLD TRAP: into the box, weigh (held two seconds), valve, sublime, weigh, reader, the Scientist names the source.
  step('E4: the cold box');
  await astro.evaluate(() => window.lab.stand('E4')); await astro.waitForTimeout(500);
  await key('E4', 'load'); await until('E4 did not load', async () => (await board()).E4.state === 'loaded', 8000);
  await key('E4', 'weigh', 0, 26); await astro.waitForTimeout(800);
  await until('E4: the first weighing did not register', async () => (await view('E4')).w1 !== null, 5000);
  await key('E4', 'valve');
  await until('E4: the ice did not sublime', async () => (await view('E4')).sub >= 1, 30000);
  await key('E4', 'weigh', 0, 26); await astro.waitForTimeout(800);
  await until('E4: the second weighing did not register', async () => (await view('E4')).w2 !== null, 5000);
  await key('E4', 'reader');
  await until('E4: the reader did not read', async () => (await view('E4')).reader !== null, 5000);
  await astro.evaluate(() => window.lab.frame('E4')); await astro.waitForTimeout(1200);
  await snap('astronaut-e4-cold-box');
  await shot(sci, 'scientist-lab-e4');
  await shot(ops, 'ops-lab-board');
  const dh = (await view('E4')).reader;
  await call('E4', dh < 100 ? 'wind' : dh < 220 ? 'asteroid' : 'comet');
  await until('the mission did not end with all four findings', () => sci.evaluate(() => window.moonbase.state()?.phase === 'results'), 10000);
  const result = await sci.evaluate(() => window.moonbase.state().result);
  check(result?.won && result.findings === 4, 'the Real Mission should be won with four findings: ' + JSON.stringify(result));
  const log = await sci.evaluate(() => (window.moonbase.state().log || []).filter(l => l.kind === 'finding').map(l => l.text));
  step('findings: ' + log.join(' | '));
  for (const ws of [admin, tech]) ws.close();
} catch (e) {
  problems.push('lab: ' + e.message);
} finally {
  await Promise.all(browsers.map(b => b.close().catch(() => {})));
  server.kill();
}
if (problems.length) { console.error('LAB FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`lab test passed: the admin started a Real Mission, and the four experiments were run at their instruments and called from the Scientist's desk, each to a graded finding. ${SHOTS ? 'Screenshots in test/shots/lab/' : 'No screenshots (LAB_SHOTS=1 for those).'}`);
