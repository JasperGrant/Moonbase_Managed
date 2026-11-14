// Renders the NASA Mission Control room model to the faint backdrop behind the Mission Control consoles:
// client/assets/textures/mission-control-room.webp (docs/ASSETS.md). The laptop pages are 2D, so they get a
// picture of the room, not a WebGL scene. Run it after re-baking the room: node scripts/render-mc-room.mjs
// Needs Playwright (preinstalled in cloud sessions) and sharp (npm i --no-save sharp).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'client'), PORT = 3202, OUT = path.join(WEB, 'assets', 'textures', 'mission-control-room.webp');
const [W, H] = [1600, 900];
// From the back of the room (-z), above the last row, looking over the consoles to the screen wall at +z.
const CAM = JSON.parse(process.env.CAM || '{"pos":[0,3.3,-11.6],"at":[0,1.7,8],"fov":55}');

const PAGE = `<!doctype html><body style="margin:0">
<script type="importmap">{ "imports": { "three": "/vendor/three/build/three.module.js", "three/addons/": "/vendor/three/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { loadModel } from '/shared/assets.js';
import { PAL } from '/shared/palette.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(${W}, ${H}); document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9; r.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(); scene.background = new THREE.Color(PAL.hex.consoleDeep);
scene.fog = new THREE.FogExp2(0x2a2620, 0.035); // the far wall goes into the room's haze
scene.add(new THREE.HemisphereLight(PAL.hex.photoTint, PAL.hex.bakelite, 1.1));
for (const [x, z] of [[-4, 6], [4, 6], [-4, -4], [4, -4]]) { const l = new THREE.PointLight(PAL.hex.incandescent, 18, 14, 1.6); l.position.set(x, 5, z); scene.add(l); }
const room = await loadModel(THREE, 'mission-control-room'); scene.add(room);
const c = ${JSON.stringify(CAM)}, cam = new THREE.PerspectiveCamera(c.fov, ${W} / ${H}, 0.05, 100);
cam.position.set(...c.pos); cam.lookAt(...c.at);
r.render(scene, cam); window.done = true;
</script></body>`;
const MIME = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const file = path.join(WEB, path.normalize(url));
  if (!file.startsWith(WEB) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}).listen(PORT);

const { chromium } = await import('playwright');
const sharp = (await import('sharp')).default;
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.error(e.message));
await page.goto(`http://localhost:${PORT}/`); await page.waitForFunction('window.done', null, { timeout: 60000 });
const png = await page.screenshot();
await sharp(png).webp({ quality: 70 }).toFile(process.env.OUT || OUT);
await browser.close(); server.close();
console.log('wrote', path.relative(ROOT, process.env.OUT || OUT));
