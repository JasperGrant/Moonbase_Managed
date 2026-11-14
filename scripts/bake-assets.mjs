// Bake the NASA models in docs/ASSETS.md into client/assets/models/: metres, Y up, centred on x/z with the
// base at y = 0 (hand tools centred on their middle), one "Root" node, simplified to a Quest budget,
// WebP textures, meshopt-compressed (three's GLTFLoader + MeshoptDecoder read them, no Draco needed).
//
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf meshoptimizer sharp
//   node scripts/bake-assets.mjs <folder with the original uploads>          (all of them)
//   node scripts/bake-assets.mjs <folder> helmet aces-suit                     (just these ids)
//
// The originals are not in the repo (some are 27 MB TIFs); they are in the project's shared files.
// File names in the folder are matched loosely: "Apollo Lunar Module.glb" and "Apollo_Lunar_Module.glb" both work.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, transformMesh, normals, getBounds, resample, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'; // three is a devDependency

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [SRC, ...only] = process.argv.slice(2);
if (!SRC) { console.error('usage: node scripts/bake-assets.mjs <folder with the original uploads> [ids...]'); process.exit(2); }
const OUT = path.join(ROOT, 'client', 'assets', 'models');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moonbase-bake-'));
fs.mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const slug = s => s.replace(/\.(glb|stl)$/i, '').replace(/^[0-9a-f]{8}-/, '').replace(/^[0-9]+ *- */, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4/f37fwAJbQPsJ0zB2gAAAABJRU5ErkJggg==', 'base64');

// ---------- 1. read every original into a plain glTF document, keyed by slug ----------
const plain = new Map();
async function readGlb(file) {
  const b = fs.readFileSync(file), n = b.readUInt32LE(12), j = JSON.parse(b.slice(20, 20 + n));
  let doc;
  if ((j.images || []).some(i => i.uri)) { // a few reference texture files the upload did not include: stand in a 1x1 png, then drop it
    const dir = fs.mkdtempSync(path.join(TMP, 'x-')), f = path.join(dir, 'm.glb'); fs.copyFileSync(file, f);
    for (const i of j.images) if (i.uri) fs.writeFileSync(path.join(dir, i.uri), PNG);
    doc = await io.read(f);
    for (const t of doc.getRoot().listTextures()) if (t.getURI()) t.dispose();
  } else doc = await io.read(file);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  return doc;
}
function readStl(file) { // STL is unitless, Z-up, flat-shaded: millimetres, rotated and re-normalled by the bake
  const buf = fs.readFileSync(file), geo = new STLLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const doc = new Document(), bin = doc.createBuffer();
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.attributes.position.array)).setBuffer(bin);
  const mat = doc.createMaterial('printed').setBaseColorFactor([0.62, 0.6, 0.55, 1]).setMetallicFactor(0.1).setRoughnessFactor(0.8);
  const mesh = doc.createMesh('part').addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos).setMaterial(mat));
  doc.createScene('Scene').addChild(doc.createNode('part').setMesh(mesh));
  return doc;
}
for (const f of fs.readdirSync(SRC)) {
  const p = path.join(SRC, f);
  if (/\.glb$/i.test(f)) plain.set(slug(f), () => readGlb(p));
  if (/\.stl$/i.test(f)) plain.set('stl-' + slug(f), () => readStl(p));
  if (/\.zip$/i.test(f)) console.log('skipping', f, '(unzip it into the folder first; only the STLs named in ASSETS are used)');
}
plain.set('tall-dish-assembly', async () => { // post and dish share one frame: put them in one file as Post and Dish
  const a = await plain.get('tall-dish-post')(), b = await plain.get('tall-dish-dish')();
  mergeDocuments(a, b); const [sa, sb] = a.getRoot().listScenes();
  const post = a.createNode('Post'), dish = a.createNode('Dish');
  for (const c of sa.listChildren()) { sa.removeChild(c); post.addChild(c); }
  for (const c of sb.listChildren()) { sb.removeChild(c); dish.addChild(c); }
  sa.addChild(post); sa.addChild(dish); sb.dispose(); await a.transform(unpartition());
  return a;
});
// the ISS tools zip names its STLs "009 - ISS Crew.stl" and so on
for (const [k, v] of [...plain]) if (k.startsWith('stl-')) plain.set(k.replace(/^stl-/, 'stl-zip-'), v);
plain.set('stl-mppt', plain.get('stl-multi-purpose-precision-maintenance-tool'));

// ---------- 2. bake ----------
// fit: [axis 0|1|2|'max', metres] or a plain factor. rotX: degrees about X before fitting (STL prints are Z-up).
// ground: base at y=0 (props that stand) or centred (hand tools, so they rotate about their middle).
const ASSETS = [
  { id: 'apollo-lm',          src: 'apollo-lunar-module',            fit: [1, 7.0],  ratio: 0.22, tex: 1024, ground: true },
  { id: 'viking-lander',      src: 'viking-lander',                  fit: [1, 2.1],  ratio: 0.12, tex: 512,  ground: true },
  { id: 'hab-module',         src: 'habitat-demonstration-unit-part-1', fit: [2, 5.2], ratio: 1, tex: 1024, ground: true },
  { id: 'mission-control-room', src: 'jsc-mission-control-room',     fit: 1,         ratio: 1,    tex: 512,  ground: true },
  { id: 'astronaut',          src: 'astronaut',                      fit: [1, 1.9],  ratio: 1,    tex: 1024, ground: true },
  { id: 'aces-suit',          src: 'advanced-crew-escape-suit',      fit: [1, 1.85], ratio: 0.12, flat: true, tex: 512,  ground: true },
  { id: 'helmet',             src: 'helmet',                         fit: [0, 0.40], ratio: 0.22, flat: true, tex: 512,  ground: true },
  { id: 'glove',              src: 'astronaut-glove',                fit: [0, 0.30], ratio: 1,    tex: 512,  ground: false },
  { id: 'crew-lock-bag',      src: 'crew-lock-bag',                  fit: [1, 0.55], ratio: 1,    tex: 512,  ground: true },
  { id: 'spectrograph-crate', src: 'cosmic-origins-spectrograph',    fit: ['max', 2.2], ratio: 1, tex: 512,  ground: true },
  { id: 'support-cradle',     src: 'flight-system-support',          fit: [1, 1.8],  ratio: 1,    tex: 512,  ground: true },
  { id: 'grace-satellite',    src: 'gravity-recovery-and-climate-experiment-grace-b', fit: ['max', 3.1], ratio: 1, tex: 512, ground: true },
  { id: 'ladee-probe',        src: 'ladee',                          fit: [1, 2.4],  ratio: 0.18, tex: 512,  ground: true },
  { id: 'comms-dish',         src: 'tall-dish-assembly',             fit: 0.00328,   ratio: 0.5,  tex: 512,  ground: true },
  { id: 'dish-turntable',     src: 'tall-dish-turntable',            fit: 0.0167,    ratio: 1,    tex: 512,  ground: true },
  { id: 'dish-base',          src: 'base-station',                   fit: 0.0167,    ratio: 1,    tex: 512,  ground: true },
  { id: 'pistol-grip-tool',   src: 'pistol-grip-tool',               fit: 0.0254,    ratio: 1,    tex: 512,  ground: false },
  { id: 'wrench',             src: 'wrench',                         fit: ['max', 0.25], ratio: 0.3, tex: 512, ground: false },
  { id: 'ratchet',            src: 'ratchet',                        fit: ['max', 0.30], ratio: 0.3, tex: 512, ground: false },
  { id: 'hammer',             src: 'hammer',                         fit: 1,         ratio: 1,    tex: 512,  ground: false },
  { id: 'grease-gun',         src: 'grease-gun',                     fit: ['max', 0.40], ratio: 0.3, tex: 512, ground: false },
  { id: 'tether',             src: 'tether',                         fit: ['max', 0.60], ratio: 0.15, tex: 512, ground: false },
  { id: 'maintenance-tool',   src: 'stl-mppt',                       fit: 0.001, rotX: -90, ratio: 0.25, ground: false },
  { id: 'printed-wrench',     src: 'stl-wrench',                     fit: 0.001, rotX: -90, ratio: 0.25, ground: false },
  { id: 'crowfoot',           src: 'stl-zip-iss-crew',               fit: 0.001, rotX: -90, ratio: 0.3,  ground: false },
  { id: 'socket',             src: 'stl-zip-torque',                 fit: 0.001, rotX: -90, ratio: 0.4,  ground: false },
  { id: 'sample-canister',    src: 'stl-zip-container',              fit: 0.001, rotX: -90, ratio: 0.15, ground: false },
  { id: 'cable-clip',         src: 'stl-zip-wire-tie',               fit: 0.001, rotX: -90, ratio: 0.2,  ground: false },
];
// Mission Control room: the source has every material black. Paint it in the DESIGN.md palette by material name.
const hex = h => [1, 3, 5].map(i => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const MCR = [[/namepl/, '#e3d9bf', 0.8], [/keyboard/i, '#1d1c19', 0.5], [/screen|projector/, '#1c2a1c', 0.3, '#9cc27a', 0.12], [/picture/, '#6e675a', 0.9],
  [/console_desk/, '#2b3230', 0.6], [/console_face/, '#55605b', 0.7], [/console|cabnet|crstation/, '#3f4a47', 0.75], [/lights/, '#ffe2b0', 1, '#ffe2b0', 1],
  [/ceiling/, '#b9b3a3', 0.9], [/floor/, '#4a4136', 0.95], [/./, '#8b887d', 0.85]];
const FIX = {
  'mission-control-room': doc => { for (const m of doc.getRoot().listMaterials()) { const [, c, r, e, ei] = MCR.find(([re]) => re.test(m.getName())); m.setBaseColorFactor([...hex(c), 1]).setRoughnessFactor(r).setMetallicFactor(0); if (e) m.setEmissiveFactor(hex(e).map(v => v * ei)); } },
};
const noTransmission = doc => { for (const e of doc.getRoot().listExtensionsUsed()) if (['KHR_materials_transmission', 'KHR_materials_ior', 'KHR_materials_volume'].includes(e.extensionName)) e.dispose(); };

const report = [];
for (const a of ASSETS.filter(a => !only.length || only.includes(a.id))) {
  const load = plain.get(a.src); if (!load) { console.log('missing original for', a.id, '(' + a.src + ')'); continue; }
  const doc = await load(), root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  noTransmission(doc); if (FIX[a.id]) FIX[a.id](doc);
  const R = doc.createNode('Root');
  for (const c of scene.listChildren()) { scene.removeChild(c); R.addChild(c); }
  scene.addChild(R);
  if (a.rotX) { const h = a.rotX * Math.PI / 360; R.setRotation([Math.sin(h), 0, 0, Math.cos(h)]); }
  let b = getBounds(scene), size = b.max.map((v, i) => v - b.min[i]);
  const k = typeof a.fit === 'number' ? a.fit : a.fit[1] / (a.fit[0] === 'max' ? Math.max(...size) : size[a.fit[0]]);
  R.setScale([k, k, k]);
  b = getBounds(scene);
  const c = b.min.map((v, i) => (v + b.max[i]) / 2);
  const ty = a.ground === 'keep' ? 0 : a.ground ? -b.min[1] : -c[1];
  const tx = a.ground === 'keep' ? 0 : -c[0], tz = a.ground === 'keep' ? 0 : -c[2];
  R.setTranslation([tx, ty, tz]);
  // bake every transform into the vertices so Root ends up identity and 1 unit = 1 metre
  const uses = new Map(); for (const n of root.listNodes()) if (n.getMesh()) uses.set(n.getMesh(), (uses.get(n.getMesh()) || 0) + 1);
  const meshNodes = root.listNodes().filter(n => n.getMesh());
  const baked = meshNodes.map(n => [n, n.getWorldMatrix()]);
  for (const [n, m] of baked) {
    let mesh = n.getMesh();
    if (uses.get(mesh) > 1) { mesh = mesh.clone(); for (const p of mesh.listPrimitives()) { const q = p.clone(); mesh.removePrimitive(p); mesh.addPrimitive(q); for (const s of q.listSemantics()) q.setAttribute(s, q.getAttribute(s).clone()); if (q.getIndices()) q.setIndices(q.getIndices().clone()); } n.setMesh(mesh); }
    transformMesh(mesh, m);
  }
  for (const [n] of baked) { const p = n.getParentNode(); if (p) p.removeChild(n); for (const sc of root.listScenes()) sc.removeChild(n); n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); }
  for (const c of R.listChildren()) R.removeChild(c);
  R.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  for (const [n] of baked) R.addChild(n);
  if (a.src.startsWith('stl-') || a.flat) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
  const steps = [dedup({ propertyTypes: ['Accessor', 'Mesh', 'Texture'] }), prune(), weld()];
  if (a.ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: a.ratio, error: a.err || 0.01 }));
  steps.push(normals({ overwrite: false }), resample(), prune(), dedup({ propertyTypes: ['Accessor', 'Mesh', 'Texture'] }));
  if (root.listTextures().length) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [a.tex || 512, a.tex || 512] }));
  await doc.transform(...steps);
  for (const t of root.listTextures()) if (t.getMimeType() === 'image/png' && root.listTextures().length > 1) { /* duplicates dropped by dedup/prune */ }
  R.setName('Root');
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const file = path.join(OUT, a.id + '.glb'); await io.write(file, doc);
  const d2 = await io.read(file), bb = getBounds(d2.getRoot().listScenes()[0]);
  let tris = 0; for (const m of d2.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const r = { id: a.id, kb: Math.round(fs.statSync(file).size / 1024), tris: Math.round(tris), size: bb.max.map((v, i) => +(v - bb.min[i]).toFixed(3)), min: bb.min.map(v => +v.toFixed(3)), mats: d2.getRoot().listMaterials().length, tex: d2.getRoot().listTextures().map(t => (t.getSize() || []).join('x')).join(' ') };
  report.push(r); console.log(JSON.stringify(r));
}
fs.rmSync(TMP, { recursive: true, force: true });
