// Asset check: npm run assets
//
// Loads every model in client/shared/assets.js the way the game would (vendored GLTFLoader + meshopt
// decoder, in Chromium) and checks it against the manifest: it loads, its bounding box is the size
// the manifest says (so metres and the bake are right), it sits on y = 0 when it should, and every
// photo texture is served. With ASSET_SHOTS=1 it also writes one picture per model to test/shots/assets/.
//
//   npm i -D playwright && npx playwright install chromium   (once; cloud sessions have it already)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, TEXTURES } from '../client/shared/assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), PORT = 3201, SHOTS = process.env.ASSET_SHOTS ? path.join(ROOT, 'test', 'shots', 'assets') : null;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const PAGE = `<!doctype html><body style="margin:0;background:#1d1c19">
<script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { loadModel } from '/shared/assets.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(480, 360); document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
window.check = async id => {
  const m = await loadModel(THREE, id), box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2b3230);
  scene.add(new THREE.HemisphereLight(0xe8dcc4, 0x6e675a, 1.4)); const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); sun.position.set(3, 5, 4); scene.add(sun, m);
  const c = box.getCenter(new THREE.Vector3()), R = size.length() / 2, cam = new THREE.PerspectiveCamera(35, 4 / 3, R / 100, R * 100);
  cam.position.copy(c).add(new THREE.Vector3(1, 0.6, 1.4).normalize().multiplyScalar(R / Math.tan(0.3) * 1.05)); cam.lookAt(c); r.render(scene, cam);
  let root = 0; m.traverse(o => { if (o.name === 'Root') root++; });
  return { size: size.toArray(), minY: box.min.y, root };
};
window.ready = true;
</script></body>`;
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const file = path.join(WEB, path.normalize(url));
  if (!file.startsWith(WEB) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}).listen(PORT);

const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 480, height: 360 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/`); await page.waitForFunction('window.ready');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const fail = (id, why) => { failed++; console.log(`FAIL ${id}: ${why}`); };
for (const [id, want] of Object.entries(MODELS)) {
  let got;
  try { got = await page.evaluate(id => window.check(id), id); } catch (e) { fail(id, e.message.split('\n')[0]); continue; }
  const off = got.size.map((v, i) => Math.abs(v - want.size[i]) / Math.max(want.size[i], 0.01));
  if (off.some(d => d > 0.05)) fail(id, `size ${got.size.map(v => v.toFixed(3)).join(' x ')} m, manifest says ${want.size.join(' x ')}`);
  else if (want.ground && Math.abs(got.minY) > 0.01) fail(id, `base at y = ${got.minY.toFixed(3)}, should sit on 0`);
  else if (got.root !== 1) fail(id, `${got.root} nodes named Root, want 1`);
  else console.log(`ok   ${id.padEnd(22)} ${got.size.map(v => v.toFixed(2)).join(' x ')} m`);
  if (SHOTS) await page.locator('canvas').screenshot({ path: path.join(SHOTS, `${id}.png`) });
}
for (const id of Object.keys(TEXTURES)) {
  const r = await page.evaluate(u => fetch(u).then(r => r.status), `/assets/textures/${id}.webp`);
  if (r !== 200) fail(id, `texture answered ${r}`); else console.log(`ok   ${id}.webp`);
}
if (errors.length) fail('page', errors.join(' | '));
await browser.close(); server.close();
console.log(failed ? `${failed} problem(s)` : 'all assets ok');
process.exit(failed ? 1 : 0);
