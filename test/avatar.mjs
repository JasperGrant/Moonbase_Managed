// The rover camera's astronaut (client/avatar.js): npm run avatar, or npm run avatar:shots for pictures.
//
// Loads the figure the way the game does (the NASA model cut into limbs, in Chromium) and checks the rig:
// arms hang (no T-pose), a tracked hand is reached to within a few centimetres, a crouch lowers the body,
// the legs swing while walking, the feet stay on the ground, and tools sit in the hands. With
// AVATAR_SHOTS=1 it also draws the figure standing, mid-stride, crouched, reaching and holding tools, with
// a tool lying beside it, to test/shots/avatar/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), PORT = 3202, SHOTS = process.env.AVATAR_SHOTS ? path.join(ROOT, 'test', 'shots', 'avatar') : null;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const PAGE = `<!doctype html><body style="margin:0;background:#1d1c19">
<script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { buildAvatar } from '/avatar.js';
import { buildTools, layDown, REST } from '/tools.js';
import { PAL } from '/shared/palette.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(640, 480); document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95; r.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(PAL.hex.bakelite);
// The surface's lighting, roughly: a low warm sun and a dim grey fill from the ground.
scene.add(new THREE.HemisphereLight(0xc9c2b0, 0x4a463e, 0.7));
const sun = new THREE.DirectionalLight(0xfff0d8, 3); sun.position.set(4, 5, 6); sun.castShadow = true; sun.shadow.bias = -0.0005; scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: PAL.hex.regolith, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const av = buildAvatar(THREE, { shadows: true }); scene.add(av.group);
const tools = buildTools(THREE);
const cam = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 100);
const wp = o => o.getWorldPosition(new THREE.Vector3());
window.ready = async () => { for (let i = 0; i < 200 && !av.group.getObjectByName('Body_Mesh'); i++) await new Promise(r => setTimeout(r, 50)); return !!av.group.getObjectByName('Body_Mesh'); };
// Run the figure for a while at a pose: { x, z, ry, h, arms } moving at vx, vz m/s.
window.run = (pose, seconds, vx = 0, vz = 0, held = [null, null]) => {
  const p = { ...pose };
  for (let t = 0; t < seconds; t += 1 / 60) { p.x += vx / 60; p.z += vz / 60; av.update(1 / 60, p); }
  for (const id in tools) tools[id].visible = false;
  av.hold(held, tools);
  scene.updateMatrixWorld(true);
  const P = av.parts, j = n => wp(n).toArray();
  return { handL: j(P.hand.L), handR: j(P.hand.R), shoulderL: j(P.arm.L), hips: j(P.hips), kneeL: j(P.shin.L), kneeR: j(P.shin.R), legL: P.leg.L.rotation.x, legR: P.leg.R.rotation.x,
    feet: Math.min(...['L', 'R'].map(s => { const b = new THREE.Box3().setFromObject(P.foot[s]); return b.min.y; })), top: new THREE.Box3().setFromObject(P.body).max.y,
    welder: tools.welder.parent?.name || null, brush: tools.brush.parent?.name || null };
};
window.lie = (id, x, z, ry) => { const g = tools[id]; scene.add(g); layDown(THREE, g, id, { x, y: REST[id].y, z, ry }); g.visible = true; };
window.shot = (from, at) => { cam.position.set(...from); cam.lookAt(...at); r.render(scene, cam); return r.domElement.toDataURL('image/png'); };
window.ok = true;
</script></body>`;

// The rover camera itself (client/rovercam.js), fed a made-up state: the astronaut walking toward the rover
// with the welder in the right hand, the brush lying on the ground beside them.
const CAM = `<!doctype html><body style="margin:0;background:#1d1c19"><canvas id="cam" style="width:960px;height:540px;display:block"></canvas>
<script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }</script>
<script type="module">
import { startRoverCam } from '/rovercam.js';
const t0 = performance.now();
const scene = { dark: false, dust: null, board: null, wheel: 0, hull: null, meteor: null, tools: { held: [null, 'welder'], ground: { brush: { x: 4.75, y: 0.035, z: 5.6, ry: 0.7 } } } };
const state = () => ({ crew: ['astronaut'], rover: { x: 4, z: 9, ry: Math.PI }, scene,
  astro: { x: 4.1, z: 4.2 + Math.min(1.6, (performance.now() - t0) / 1000 * 0.9), ry: 0, h: 1.65, in: false, arms: [null, null] } });
startRoverCam(document.getElementById('cam'), state);
window.ok = true;
</script></body>`;

const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.setHeader('content-type', 'text/html'); return res.end(PAGE); }
  if (url === '/cam') { res.setHeader('content-type', 'text/html'); return res.end(CAM); }
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
  const page = await browser.newPage();
  page.on('pageerror', e => problems.push('page: ' + e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.ok, null, { timeout: 30000 });
  check(await page.evaluate(() => window.ready()), 'the NASA astronaut model did not load and get cut into parts');
  const run = (...a) => page.evaluate(a => window.run(...a), a);
  const stand = { x: 0, z: 0, ry: 0, h: 1.65, arms: [null, null] };

  // Standing: arms hang at the sides (a T-pose would have the hands out at shoulder height), feet on the ground.
  let s = await run(stand, 1);
  check(s.handL[1] < s.shoulderL[1] - 0.35 && s.handR[1] < s.shoulderL[1] - 0.35, `standing: the hands should hang well below the shoulders (a T-pose has them level): ${JSON.stringify(s)}`);
  check(Math.abs(s.handL[0]) < 0.6 && Math.abs(s.handR[0]) < 0.6, `standing: the hands should be at the sides, not out in a T: ${s.handL[0].toFixed(2)}, ${s.handR[0].toFixed(2)}`);
  check(Math.abs(s.feet) < 0.06, `standing: the feet should be on the ground, lowest point ${s.feet.toFixed(3)}`);
  const tall = s.top;

  // Walking: the legs swing opposite ways.
  let swing = 0;
  for (let t = 0.3; t < 1.6; t += 0.1) { s = await run({ ...stand }, t, 0, 1.4); swing = Math.max(swing, Math.abs(s.legL - s.legR)); }
  check(swing > 0.4, `walking at 1.4 m/s: the legs should swing apart, most ${swing.toFixed(2)} rad between them`);

  // Crouching: the body comes down with the head, the feet stay put.
  s = await run({ ...stand, h: 0.95 }, 1.5);
  check(s.top < tall - 0.45, `crouching to a 0.95 m head height: the figure should come down, top ${s.top.toFixed(2)} (standing ${tall.toFixed(2)})`);
  check(Math.abs(s.feet) < 0.12, `crouching: the feet should stay on the ground, lowest point ${s.feet.toFixed(3)}`);

  // Reaching: tracked hands in the body's frame (x right, y up, z ahead). The figure faces +z, its right is -x.
  const want = [[-0.25, 1.15, 0.45], [0.3, 1.5, 0.35]];
  s = await run({ ...stand, arms: want }, 1.5);
  const miss = (got, [x, y, z]) => Math.hypot(got[0] + x, got[1] - y, got[2] - z);
  check(miss(s.handL, want[0]) < 0.05 && miss(s.handR, want[1]) < 0.05, `reaching: the hands should reach the tracked hands, missed by ${miss(s.handL, want[0]).toFixed(3)} and ${miss(s.handR, want[1]).toFixed(3)} m`);

  // Holding: the tools go in the hands they are in.
  s = await run(stand, 0.2, 0, 0, ['brush', 'welder']);
  check(s.brush === 'Hand_L' && s.welder === 'Hand_R', `holding: brush in ${s.brush}, welder in ${s.welder}`);

  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    const save = async (name, from, at) => fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from((await page.evaluate(([f, a]) => window.shot(f, a), [from, at])).split(',')[1], 'base64'));
    const side = [3.2, 1.3, 2.2], front = [0.6, 1.4, 3.6];
    await run(stand, 1, 0, 0, [null, 'welder']); await page.evaluate(() => window.lie('brush', 0.7, 0.6, 0.6));
    await save('standing', front, [0, 0.9, 0]);
    await run({ ...stand }, 0.55, 0, 1.4, [null, 'welder']); await save('walking', side, [0, 0.9, 0.8]);
    await run({ ...stand, h: 0.95 }, 1.5, 0, 0, ['patch', null]); await save('crouching', side, [0, 0.6, 0]);
    await run({ ...stand, arms: want }, 1.5, 0, 0, ['brush', 'welder']); await save('reaching', front, [0, 1.0, 0]);
    // Through the rover camera, in the real world.
    const cam = await browser.newPage({ viewport: { width: 960, height: 540 } });
    cam.on('pageerror', e => problems.push('rover camera: ' + e.message));
    await cam.goto(`http://localhost:${PORT}/cam`);
    await cam.waitForFunction(() => window.ok, null, { timeout: 60000 });
    await cam.waitForTimeout(20000); // the terrain, the models and the walk
    await cam.screenshot({ path: path.join(SHOTS, 'rover-camera.png'), timeout: 600000 });
  }
} catch (e) {
  problems.push(e.message);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) { console.error('AVATAR TEST FAILED\n' + problems.join('\n')); process.exit(1); }
console.log(`avatar test passed: the figure stands, walks, crouches, reaches and holds tools. ${SHOTS ? `Pictures in ${path.relative(ROOT, SHOTS)}/` : 'No pictures (AVATAR_SHOTS=1 for those).'}`);
