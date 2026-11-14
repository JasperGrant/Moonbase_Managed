// The baked NASA models and photos under client/assets/. Where each one goes, and why, is in docs/ASSETS.md.
// Every model is in metres, Y up, front facing +Z (glTF), one node called "Root", base at y = 0
// (hand tools are centred on their middle instead). Sizes are the baked bounding box, x × y × z.
// Nothing in the game loads these yet: see docs/SPEC-1960s-pass.md, phase 5.

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
