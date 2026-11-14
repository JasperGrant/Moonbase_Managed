// The baked NASA models and photos under client/assets/. Where each one goes, and why, is in docs/ASSETS.md.
// Every model is in metres, Y up, front facing +Z (glTF), one node called "Root", base at y = 0
// (hand tools are centred on their middle instead). Sizes are the baked bounding box, x × y × z.
// Where each one is placed is in docs/ASSETS.md. Load a model with loadPeriod (restyled to the palette),
// the glove with loadGlove.
import { PAL } from './palette.js';

export const MODELS = {
  // outside, scenery
  'apollo-lm':            { size: [8.97, 7.0, 8.97],   tris: 29267, ground: true },
  'viking-lander':        { size: [3.91, 2.10, 2.94],  tris: 12186, ground: true },
  'comms-dish':           { size: [3.0, 5.66, 3.0],    tris: 6627,  ground: true },  // nodes Post and Dish
  'dish-turntable':       { size: [0.61, 0.73, 0.59],  tris: 452,   ground: true },
  'dish-base':            { size: [0.6, 0.39, 0.59],   tris: 184,   ground: true },
  'hab-module':           { size: [11.9, 6.81, 5.2],   tris: 2264,  ground: true },
  'spectrograph-crate':   { size: [0.94, 0.94, 2.2],   tris: 264,   ground: true },
  'support-cradle':       { size: [1.7, 1.8, 0.87],    tris: 1316,  ground: true },
  'grace-satellite':      { size: [1.9, 1.26, 3.1],    tris: 3961,  ground: true },
  'ladee-probe':          { size: [1.4, 2.4, 1.36],    tris: 9337,  ground: true },
  'astronaut':            { size: [1.76, 1.9, 0.71],   tris: 6381,  ground: true },  // unrigged T-pose
  // habitat interior
  'aces-suit':            { size: [0.82, 1.85, 0.51],  tris: 10454, ground: true },
  'helmet':               { size: [0.4, 0.39, 0.4],    tris: 13878, ground: true },
  'glove':                { size: [0.3, 0.16, 0.17],   tris: 842 },
  'crew-lock-bag':        { size: [0.5, 0.55, 0.19],   tris: 514,   ground: true },
  'sample-canister':      { size: [0.046, 0.032, 0.09],  tris: 3296 },
  'cable-clip':           { size: [0.033, 0.003, 0.049], tris: 2614 },
  // tools
  'pistol-grip-tool':     { size: [0.066, 0.302, 0.391],   tris: 976 },
  'wrench':               { size: [0.048, 0.016, 0.25],  tris: 1892 },
  'ratchet':              { size: [0.06, 0.06, 0.3],   tris: 1692 },
  'hammer':               { size: [0.16, 0.07, 0.36],  tris: 692 },
  'grease-gun':           { size: [0.08, 0.19, 0.4],   tris: 2980 },
  'tether':               { size: [0.12, 0.12, 0.6],   tris: 3009 },
  'maintenance-tool':     { size: [0.075, 0.013, 0.1],   tris: 4440 },
  'printed-wrench':       { size: [0.033, 0.026, 0.114],  tris: 3640 },
  'crowfoot':             { size: [0.039, 0.013, 0.048],  tris: 2118 },
  'socket':               { size: [0.03, 0.025, 0.03],  tris: 1496 },
  // laptop side
  'mission-control-room': { size: [14.5, 5.89, 24.6],  tris: 11130, ground: true },
};

export const TEXTURES = {
  'flight-deck-panel-a': { size: [1024, 817] },   // circuit-breaker panel, yellow and red collars
  'flight-deck-panel-b': { size: [1024, 817] },   // toggle switches over four rows of breakers
  'flight-deck-panel-c': { size: [1024, 817] },   // circuit-breaker panel "R14"
  'lunar-far-side':      { size: [2048, 2048] },  // orbital photo, craters, hard shadows
  'mission-control-room': { size: [1600, 900] },  // rendered from the model by scripts/render-mc-room.mjs
};

export const modelUrl = id => `/assets/models/${id}.glb`;
export const textureUrl = id => `/assets/textures/${id}.webp`;

// One loader and one cache for the page. Each call returns a fresh clone, so the same model can be
// placed many times; for many copies of one small prop, use InstancedMesh with the clone's geometry.
let loader = null;
const cache = new Map();
export async function loadModel(THREE, id) {
  if (!MODELS[id]) throw new Error(`unknown model ${id}`);
  if (!loader) {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
    loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  }
  if (!cache.has(id)) cache.set(id, loader.loadAsync(modelUrl(id)).then(g => g.scene));
  return (await cache.get(id)).clone(true);
}

// Restyle a loaded model to the period palette (docs/DESIGN.md). Each shared material is changed once:
// colours lose most of their saturation and keep away from pure white and black, photo textures are
// multiplied by a warm tint, and the plastic sheen goes (roughness up, metalness down). `by` overrides
// single materials by name, or by a test on the material: { name or (m => bool): { color, rough, metal, ... } }.
// Shadows: `cast` and `receive` set on every mesh.
export function restyle(THREE, model, { rough = 0.8, metal = 0.05, sat = 0.45, by = {}, cast = false, receive = false } = {}) {
  const hsl = {}, rules = Object.entries(by);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = cast; o.receiveShadow = receive;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.userData.period) continue;
      m.userData.period = true;
      m.roughness = Math.max(rough, m.roughness ?? 0); m.metalness = Math.min(metal, m.metalness ?? 0);
      if (m.map) m.color.multiply(new THREE.Color(PAL.hex.photoTint));
      else {
        m.color.getHSL(hsl);
        m.color.setHSL(hsl.h, hsl.s * sat, Math.min(0.8, Math.max(0.06, hsl.l)));
        m.color.lerp(new THREE.Color(PAL.hex.photoTint), 0.08); // a breath of warm
      }
      const rule = rules.find(([k]) => k === m.name || (k.startsWith('/') && new RegExp(k.slice(1, -1)).test(m.name)));
      if (rule) {
        const r = rule[1];
        if (r.color !== undefined) m.color.setHex(r.color);
        if (r.rough !== undefined) m.roughness = r.rough;
        if (r.metal !== undefined) m.metalness = r.metal;
        if (r.emissive !== undefined) m.emissive.setHex(r.emissive);
      }
    }
  });
  return model;
}

// Merge a static model's meshes into one mesh per material, so a 157-part LM costs 12 draw calls, not 157
// (and as many again in the shadow pass). The parts' transforms are baked in; names below Root are lost,
// so do not merge a model whose parts move or are looked up by name.
export async function mergeStatic(THREE, model) {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert(), groups = new Map();
  model.traverse(o => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    let g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    for (const k of Object.keys(g.attributes)) { // meshopt quantizes: back to plain floats so parts can be joined
      const a = g.attributes[k];
      if (a.array instanceof Float32Array && !a.normalized && !a.isInterleavedBufferAttribute) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
    }
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material.uuid + '|' + Object.keys(g.attributes).sort().join();
    if (!groups.has(key)) groups.set(key, { material: o.material, geos: [], cast: o.castShadow, receive: o.receiveShadow });
    groups.get(key).geos.push(g);
  });
  const root = new THREE.Group(); root.name = 'Root';
  for (const { material, geos, cast, receive } of groups.values()) {
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (!geo) continue;
    const m = new THREE.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = receive; m.name = material.name || 'Part';
    root.add(m);
  }
  root.position.copy(model.position); root.quaternion.copy(model.quaternion); root.scale.copy(model.scale);
  return root;
}

// Load a model, restyle it (see restyle) and hand it back. merge: true joins its parts (see mergeStatic).
export async function loadPeriod(THREE, id, opts = {}) {
  const m = restyle(THREE, await loadModel(THREE, id), opts);
  return opts.merge ? mergeStatic(THREE, m) : m;
}

// The EVA glove, restyled to the palette and turned into the arm's axes: fingers along +x, the back of
// the hand toward +z, the palm toward -z, thumb toward -y (a left hand), and the middle of the cuff
// opening at the origin. GLOVE_LENGTH from cuff to fingertip. mirror: true makes it a right hand.
// Used by client/arm.js (the cuff arm) and client/stations.js (the gloves on the controllers).
export const GLOVE_LENGTH = 0.24;
export async function loadGlove(THREE, { mirror = false, emissive = 0x000000 } = {}) {
  const model = await loadModel(THREE, 'glove');
  const k = GLOVE_LENGTH / MODELS.glove.size[0];
  const cloth = new THREE.MeshStandardMaterial({ color: PAL.hex.enamel, roughness: 0.92, metalness: 0, emissive, side: THREE.DoubleSide });
  model.traverse(o => { if (o.isMesh) { o.material = cloth; o.castShadow = false; } });
  model.scale.set(k, k, mirror ? -k : k);
  model.rotation.x = Math.PI / 2;                     // the model's back of hand (+y) to +z
  // Centre the cuff opening on the origin: the curled fingers make the bounding box lopsided.
  model.updateMatrixWorld(true);
  const box = new THREE.Box3(), p = new THREE.Vector3();
  box.expandByObject(model);
  const xMin = box.min.x;
  const cuff = new THREE.Box3();
  model.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (p.x < xMin + 0.03) cuff.expandByPoint(p);
    }
  });
  cuff.getCenter(p);
  const opening = cuff.getSize(new THREE.Vector3());
  model.position.set(-xMin, -p.y, -p.z);
  const g = new THREE.Group(); g.name = 'Glove'; g.add(model);
  // Close the cuff opening with the dark of the sleeve inside, so an empty cuff does not show a hollow shell.
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: PAL.hex.bakelite, side: THREE.DoubleSide }));
  cap.name = 'Cuff_Opening'; cap.rotation.y = Math.PI / 2; cap.position.x = 0.004; cap.scale.set(opening.z * 0.92, opening.y * 0.92, 1);
  g.add(cap);
  return g;
}
