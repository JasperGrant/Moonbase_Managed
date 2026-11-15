// The Technician's rover camera views: npm run camviews, or npm run camviews:shots for pictures.
//
// Runs the real client/rovercam.js in Chromium on a scripted state (both rovers driving about) and checks
// the first- and third-person views: each camera switches on its own, the third-person camera glides to a
// spot behind and above its rover and looks at it, never goes under the ground, swings round behind a turn,
// and the wheel moves it nearer and further. With CAMVIEW_SHOTS=1 it writes pictures to test/shots/camviews/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), PORT = 3203, SHOTS = process.env.CAMVIEW_SHOTS ? path.join(ROOT, 'test', 'shots', 'camviews') : null;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const PAGE = `<!doctype html><body style="margin:0;background:#1d1c19"><canvas id="cam" style="width:960px;height:360px;display:block"></canvas>
<script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }</script>
<script type="module">
import { startRoverCam } from '/rovercam.js';
const rv = { scout: { x: -4, z: 8, ry: 0.6, v: 0 }, hauler: { x: 8, z: 14, ry: -0.5, v: 0 } };
window.rv = rv;
const state = { crew: ['astronaut'], rovers: rv, scene: null, astro: null };
window.cam = startRoverCam(document.getElementById('cam'), () => state);
window.rover = id => { const g = window.cam.world.rovers[id]; return { x: g.position.x, y: g.position.y, z: g.position.z, yaw: g.userData.yaw }; };
window.pose = id => { const c = window.cam.state(id).camera, d = c.getWorldDirection(c.position.clone()); return { x: c.position.x, y: c.position.y, z: c.position.z, dx: d.x, dy: d.y, dz: d.z }; };
window.ok = true;
</script></body>`;
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.setHeader('content-type', 'text/html'); return res.end(PAGE); }
  const file = path.join(WEB, url);
  if (!file.startsWith(WEB)) { res.statusCode = 403; return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream'); res.end(data);
  });
}).listen(PORT);

const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); return ok; };
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 360 } });
  page.on('pageerror', e => problems.push('page: ' + e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.ok, null, { timeout: 60000 });
  const wait = ms => page.waitForTimeout(ms);
  const E = (fn, arg) => page.evaluate(fn, arg);
  const behind = async id => E(id => {
    const r = window.rover(id), c = window.pose(id), fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
    const rx = r.x - c.x, rz = r.z - c.z, along = rx * fx + rz * fz, // along > 0: the camera is behind the rover
       flat = Math.hypot(rx, rz);
    const to = [r.x - c.x, r.y + 1 - c.y, r.z - c.z], len = Math.hypot(...to);
    return { along, flat, up: c.y - r.y, look: (to[0] * c.dx + to[1] * c.dy + to[2] * c.dz) / len, ground: c.y };
  }, id);
  await wait(4000); // the world builds and the first frames draw

  // Both start in first person, with the camera on the rover's mount.
  const start = await E(() => ({ s: window.cam.view('scout'), h: window.cam.view('hauler') }));
  check(start.s === 'first' && start.h === 'first', `both cameras should start in first person: ${JSON.stringify(start)}`);
  const fp = await E(() => ({ c: window.pose('scout'), r: window.rover('scout') }));
  check(Math.hypot(fp.c.x - fp.r.x, fp.c.z - fp.r.z) < 1.2 && fp.c.y - fp.r.y > 1.2, `first person: the camera should sit on the rover, got ${JSON.stringify(fp)}`);
  const haulerFp = await E(() => window.pose('hauler'));
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'first-first.png') }); }

  // Toggle the Scout only: it glides behind and above; the Hauler does not move.
  await E(() => window.cam.toggle('scout'));
  await wait(300);
  const mid = await E(() => window.cam.state('scout').blend);
  check(mid > 0.05 && mid < 0.99, `the view should glide, not cut: blend ${mid.toFixed(2)} after 0.3 s`);
  await wait(1500);
  const third = await behind('scout');
  check(await E(() => window.cam.view('scout')) === 'third' && await E(() => window.cam.view('hauler')) === 'first', 'toggling the Scout should not change the Hauler');
  check(third.along > 3 && third.up > 1.2, `third person: the camera should be behind and above the Scout: ${JSON.stringify(third)}`);
  check(third.look > 0.9, `third person: the camera should be looking at the rover: ${JSON.stringify(third)}`);
  const h2 = await E(() => window.pose('hauler'));
  check(Math.hypot(h2.x - haulerFp.x, h2.y - haulerFp.y, h2.z - haulerFp.z) < 0.05, 'the Hauler camera moved when the Scout was toggled');

  // A turn: the view swings round behind it (the heading it trails, not a fixed side).
  await E(() => { window.rv.scout.ry = 2.4; });
  await wait(400);
  const early = await behind('scout');
  await wait(3000);
  const late = await behind('scout');
  check(late.along > 3 && late.along > early.along, `after a turn the camera should swing round behind the rover: early ${early.along.toFixed(2)}, late ${late.along.toFixed(2)}`);

  // Never under the ground, even tight against a slope.
  const lowest = await E(async () => {
    let low = 9;
    for (const [x, z] of [[2, 10], [-10, 4], [14, -6], [20, 20]]) {
      window.rv.scout.x = x; window.rv.scout.z = z; window.rv.scout.ry += 1.1;
      await new Promise(r => setTimeout(r, 900));
      const c = window.pose('scout'); low = Math.min(low, c.y - window.cam.world.ground(c.x, c.z));
    }
    return low;
  });
  check(lowest > 0.5, `the third-person camera should stay above the ground, lowest ${lowest.toFixed(2)} m`);

  // The wheel moves it in and out, within limits.
  const d0 = (await behind('scout')).flat;
  await E(() => window.cam.zoom('scout', -600)); await wait(1500);
  const near = (await behind('scout')).flat;
  await E(() => window.cam.zoom('scout', 3000)); await wait(1500);
  const far = (await behind('scout')).flat;
  check(near < d0 - 0.5 && far > d0 + 1, `the wheel should move the chase camera: nearer ${near.toFixed(1)}, start ${d0.toFixed(1)}, further ${far.toFixed(1)}`);
  check(far < 15 && near > 2, `the chase distance should stay within limits: ${near.toFixed(1)} to ${far.toFixed(1)}`);
  await E(() => window.cam.zoom('scout', -5000)); await wait(300);
  check(await E(() => window.cam.state('scout').dist) >= 3, 'the chase distance went under its minimum');

  // Both in third person, then back to first person: it glides home to the mount.
  await E(() => { window.rv.scout.x = -4; window.rv.scout.z = 8; const v = window.cam.state('scout'); window.cam.zoom('scout', Math.log(5.5 / v.dist) / 0.0015); window.cam.setView('hauler', 'third'); }); // back to the default 5.5 m
  await wait(2500);
  const hb = await behind('hauler');
  check(hb.along > 3 && hb.up > 1.2 && hb.look > 0.9, `the Hauler in third person: ${JSON.stringify(hb)}`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'third-third.png') });
  await E(() => { window.cam.setView('scout', 'first'); window.cam.setView('hauler', 'first'); });
  await wait(2500);
  const back = await E(() => ({ c: window.pose('scout'), r: window.rover('scout'), b: window.cam.state('scout').blend }));
  check(back.b === 0 && Math.hypot(back.c.x - back.r.x, back.c.z - back.r.z) < 1.2, `back in first person the camera should be on the rover: ${JSON.stringify(back)}`);
  // Mixed: Scout third, Hauler first.
  await E(() => window.cam.setView('scout', 'third')); await wait(2000);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'third-first.png') });
} catch (e) {
  problems.push(e.message);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) { console.error('CAMVIEWS TEST FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`camviews test passed: each rover camera switches between first and third person on its own, glides, stays behind and above, above the ground, and zooms. ${SHOTS ? `Pictures in ${path.relative(ROOT, SHOTS)}/` : 'No pictures (CAMVIEW_SHOTS=1 for those).'}`);
