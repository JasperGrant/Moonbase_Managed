// The Moon base scene. Shared by the astronaut (VR) and the Technician's rover camera, so both
// see the same place. Everything is procedural: terrain, rocks, textures, Earth, stars. Nothing
// is downloaded, so the page works offline and on Cloudflare as is. Swap in real models here
// later without touching the game logic.
import { CFG, PLACES, DUST_COLS, DUST_ROWS, CRACK_POINTS, HAULER, LOOKS } from '/shared/config.js';
import { CRATERS, BOULDERS as FIELD_BOULDERS, LANDMARKS } from '/shared/field.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HORIZON, TERRAIN, SUN_AZ_DEG } from '/shared/horizon.js';
import { PAL, SAMPLE_COL, FONT, nixie } from '/shared/palette.js';
import { buildDust } from '/dust.js';
import { loadPeriod, loadModel } from '/shared/assets.js';
import { buildAvatar } from '/avatar.js';
import { buildAirlock, CHAMBER } from '/airlock.js';

// The base sits on the Connecting Ridge between Shackleton and de Gerlache craters at the lunar
// south pole (89.45 S, 222.69 E), an Artemis III candidate region. The ground beyond the pad and
// the whole skyline come from NASA LRO LOLA topography (see scripts/lola-horizon.py). Scene -z
// points along the 0 E meridian, toward Earth; +x points toward 90 E.
//
// Sun: at the pole the real sun never climbs above about 1.5 degrees. We use 5 degrees, at an
// azimuth where the real horizon is lowest, so shadows are long but the ground is still readable.
const SUN_EL = 5 * Math.PI / 180, SUN_AZ = SUN_AZ_DEG * Math.PI / 180;
export const SUN_DIR = [Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)];
// Earth from here hangs at the horizon along 0 E, rising to about 6 degrees at favourable libration.
const EARTH_EL = 4.5 * Math.PI / 180, EARTH_DIST = 1800, EARTH_R = 46; // 1.5x its true angular size
export const EARTH_POS = [0, Math.sin(EARTH_EL) * EARTH_DIST, -Math.cos(EARTH_EL) * EARTH_DIST];

// ---------- deterministic noise (every client builds the same Moon) ----------
function makeNoise(seed) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  const grad = (h, x, y, z) => { const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  // 3D Perlin noise, range about [-0.9, 0.9]. `period` (lattice units) makes it tile.
  function noise3(x, y, z, period = 256) {
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    X = ((X % period) + period) % period; Y = ((Y % period) + period) % period; Z = ((Z % period) + period) % period;
    const X1 = (X + 1) % period, Y1 = (Y + 1) % period, Z1 = (Z + 1) % period;
    const u = fade(x), v = fade(y), w = fade(z);
    const h = (a, b, c) => perm[perm[perm[a & 255] + (b & 255)] + (c & 255)] & 15;
    return lerp(w,
      lerp(v, lerp(u, grad(h(X, Y, Z), x, y, z), grad(h(X1, Y, Z), x - 1, y, z)), lerp(u, grad(h(X, Y1, Z), x, y - 1, z), grad(h(X1, Y1, Z), x - 1, y - 1, z))),
      lerp(v, lerp(u, grad(h(X, Y, Z1), x, y, z - 1), grad(h(X1, Y, Z1), x - 1, y, z - 1)), lerp(u, grad(h(X, Y1, Z1), x, y - 1, z - 1), grad(h(X1, Y1, Z1), x - 1, y - 1, z - 1))));
  }
  function fbm(x, y, z, oct = 4, period = 256, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * noise3(x * f, y * f, z * f, period * f); norm += a; a *= gain; f *= 2; }
    return sum / norm;
  }
  return { noise3, fbm, rnd: r };
}

// ---------- generated textures ----------
function canvasTexture(THREE, w, h, paint, { repeat = 1, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  paint(img.data, w, h, g);
  if (img.data.some(v => v)) g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

export function buildWorld(THREE, scene, { shadows = true, renderer = null } = {}) {
  const N = makeNoise(7);
  const rnd = N.rnd;
  const sunDir = new THREE.Vector3(...SUN_DIR);

  scene.background = new THREE.Color(0x050505);

  // ---------- light ----------
  // Harsh sunlight, near-black shadows, a whisper of earthshine. There is no sky to scatter light.
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
  sun.position.copy(sunDir).multiplyScalar(90);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 20, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  // The shadow box (64 m) follows whoever is looking, a metre at a time, so the far field has shadows too.
  const follow = (x, z) => {
    const fx = Math.round(x), fz = Math.round(z);
    if (sun.target.position.x === fx && sun.target.position.z === fz) return;
    sun.target.position.set(fx, 0, fz); sun.position.copy(sunDir).multiplyScalar(90).add(sun.target.position);
    sun.target.updateMatrixWorld();
  };
  scene.add(new THREE.HemisphereLight(0x4a5560, 0x2a2620, 0.25));

  // Environment map from a stand-in scene (bright ground, black sky, a hot sun) so metal,
  // gold foil and visors reflect something plausible. No HDR file needed.
  if (renderer) {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })));
    const g = new THREE.Mesh(new THREE.CylinderGeometry(49, 49, 0.1, 32), new THREE.MeshBasicMaterial({ color: 0x5c5a56 }));
    g.position.y = -1.6; env.add(g);
    const hot = new THREE.Mesh(new THREE.SphereGeometry(2.5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(40, 38, 34) }));
    hot.position.copy(sunDir).multiplyScalar(45); env.add(hot);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.6;
    pmrem.dispose();
  }

  // ---------- textures ----------
  const SFD_B = 1.83, SFD_A = Math.pow(10, -1.1); // lunar equilibrium crater distribution, per km^2 with D in km
  const regolith = canvasTexture(THREE, 512, 512, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = N.fbm(x / 64, y / 64, 0.5, 5, 8), fine = N.noise3(x / 6, y / 6, 3.1, 86);
      let v = 150 + n * 70 + fine * 14;
      const sp = N.noise3(x / 2.3, y / 2.3, 9.7, 223);
      if (sp > 0.62) v += 60; else if (sp < -0.66) v -= 50; // glassy specks and dark grains
      const i = (y * w + x) * 4; d[i] = v + 2; d[i + 1] = v; d[i + 2] = v - 4; d[i + 3] = 255;
    }
  }, { repeat: 200 });
  const regolithBump = canvasTexture(THREE, 256, 256, (d, w, h) => { // grain, plus centimetre craters (one tile is 2 m)
    const pits = [];
    for (let i = 0; i < 14; i++) pits.push({ x: rnd() * w, y: rnd() * h, R: (0.04 * Math.pow(1 - rnd() * (1 - Math.pow(12, -SFD_B)), -1 / SFD_B)) / 2 * (w / 2), f: rnd() });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 128 + N.fbm(x / 12, y / 12, 1.5, 4, 22) * 110;
      for (const p of pits) {
        let dx = Math.abs(x - p.x), dy = Math.abs(y - p.y); dx = Math.min(dx, w - dx); dy = Math.min(dy, h - dy);
        const s = Math.hypot(dx, dy) / p.R;
        if (s < 1) v += (-(1 - s * s) * 0.6 + s * s * s * s * 0.25) * 90 * (0.4 + 0.6 * p.f); else if (s < 2) v += 0.25 * 90 * (0.4 + 0.6 * p.f) * Math.pow(s, -3) * (2 - s);
      }
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v)); d[i + 3] = 255;
    }
  }, { repeat: 750, srgb: false });
  const panelTex = canvasTexture(THREE, 512, 512, (d, w, h) => { // white hull panels with seams and rivets
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 228 + N.fbm(x / 40, y / 40, 2, 3, 13) * 10;
      const sx = x % 128, sy = y % 128;
      if (sx < 3 || sy < 3) v -= 70; else if (sx < 6 || sy < 6) v -= 20;
      if (((sx - 14) % 100 < 5 && (sy - 14) % 100 < 5) || ((sx - 114) % 100 < 5 && (sy - 14) % 100 < 5)) v -= 45;
      const i = (y * w + x) * 4; d[i] = v; d[i + 1] = v - 2; d[i + 2] = v - 8; d[i + 3] = 255;
    }
  }, { repeat: 1 });
  const foilBump = canvasTexture(THREE, 256, 256, (d, w, h) => { // crinkled multi-layer insulation
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 128 + (Math.abs(N.noise3(x / 9, y / 9, 4.2, 29)) * 2 - 0.6) * 120 + N.noise3(x / 3, y / 3, 8.8, 86) * 20;
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }, { repeat: 3, srgb: false });
  const solarTex = canvasTexture(THREE, 256, 256, (d, w, h) => { // photovoltaic cells: dark blue-grey, a bezel-metal grid
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = x % 32, cy = y % 32, i = (y * w + x) * 4;
      if (cx < 2 || cy < 2) { d[i] = 139; d[i + 1] = 136; d[i + 2] = 125; } // PAL.bezel
      else {
        const t = (cx + cy) / 64, wob = ((x * 7 + y * 13) % 17) / 17 * 4; // a slight unevenness from cell to cell
        d[i] = 30 + t * 12 + wob; d[i + 1] = 37 + t * 14 + wob; d[i + 2] = 50 + t * 20 + wob;
        if (cx % 8 === 5) { d[i] += 16; d[i + 1] += 16; d[i + 2] += 14; } // the fine collector fingers
      }
      d[i + 3] = 255;
    }
  }, { repeat: 1 });
  const earthTex = canvasTexture(THREE, 768, 384, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      const lat = (0.5 - y / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2;
        const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
        const land = N.fbm(px * 2.2 + 5, py * 2.2, pz * 2.2, 6) + 0.08 - Math.abs(py) * 0.1;
        const detail = N.fbm(px * 9, py * 9, pz * 9, 3);
        const i = (y * w + x) * 4;
        let r, g, b;
        if (land > 0.05) {
          const dry = N.fbm(px * 4 + 11, py * 4, pz * 4, 3), cold = Math.abs(py) + detail * 0.15;
          if (cold > 0.86) { r = 236; g = 240; b = 244; }
          else if (dry > 0.18 && Math.abs(py) < 0.5) { r = 176 + detail * 30; g = 150 + detail * 25; b = 96; }
          else { r = 54 + detail * 30 + land * 40; g = 92 + detail * 40; b = 40; }
          if (land < 0.09) { r = (r + 120) / 2; g = (g + 150) / 2; b = (b + 120) / 2; } // coast
        } else {
          const deep = Math.min(1, -land * 2.5);
          r = 18 + (1 - deep) * 40; g = 60 + (1 - deep) * 70; b = 130 + (1 - deep) * 60;
          if (Math.abs(py) > 0.92) { r = 220; g = 228; b = 236; } // sea ice
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      }
    }
  });
  const cloudTex = canvasTexture(THREE, 512, 256, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      const lat = (0.5 - y / h) * Math.PI;
      for (let x = 0; x < w; x++) {
        const lon = (x / w) * Math.PI * 2;
        const px = Math.cos(lat) * Math.cos(lon), py = Math.sin(lat), pz = Math.cos(lat) * Math.sin(lon);
        let c = N.fbm(px * 3.5 + 20, py * 5, pz * 3.5, 5) + N.fbm(px * 12, py * 12, pz * 12, 2) * 0.3;
        c = Math.max(0, Math.min(1, (c - 0.02) * 2.2)) * (0.75 + Math.abs(py) * 0.5);
        const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = c * 255;
      }
    }
  });
  const sunTex = canvasTexture(THREE, 256, 256, (d, w, h, g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,244,220,1)'); grd.addColorStop(0.12, 'rgba(255,250,235,1)'); grd.addColorStop(0.2, 'rgba(255,235,200,0.55)'); grd.addColorStop(0.5, 'rgba(255,220,170,0.12)'); grd.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  // ---------- materials ----------
  const regolithMat = new THREE.MeshStandardMaterial({ map: regolith, bumpMap: regolithBump, bumpScale: 0.35, roughness: 1, metalness: 0, vertexColors: true });
  const rockMat = new THREE.MeshStandardMaterial({ map: regolith, bumpMap: regolithBump, bumpScale: 0.5, roughness: 0.95, color: 0xb9b5ad });
  const white = new THREE.MeshStandardMaterial({ map: panelTex, color: PAL.hex.enamel, roughness: 0.8, metalness: 0.1 });
  const whitePlain = new THREE.MeshStandardMaterial({ color: PAL.hex.enamel, roughness: 0.82, metalness: 0.08, bumpMap: regolithBump, bumpScale: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: PAL.hex.foilGold, metalness: 1, roughness: 0.32, bumpMap: foilBump, bumpScale: 0.6 });
  const silverFoil = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, metalness: 1, roughness: 0.35, bumpMap: foilBump, bumpScale: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: PAL.hex.console, roughness: 0.75, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: PAL.hex.consoleDeep, roughness: 0.85, metalness: 0.2 });
  const steel = new THREE.MeshStandardMaterial({ color: PAL.hex.aluminium, roughness: 0.42, metalness: 0.85 });
  const solar = new THREE.MeshStandardMaterial({ map: solarTex, roughness: 0.22, metalness: 0.55 });
  const orange = new THREE.MeshStandardMaterial({ color: PAL.hex.orange, roughness: 0.75 });
  const warmGlow = new THREE.MeshBasicMaterial({ color: 0xe8b872, toneMapped: false });
  const windowGlow = new THREE.MeshBasicMaterial({ color: 0xe8b872, toneMapped: false });

  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const tube = (mat, from, to, r = 0.03, parent = scene) => { // a pipe or strut between two points
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), len = a.distanceTo(b);
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat, 0, 0, 0, parent);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  };

  // ---------- terrain ----------
  // Beyond the graded pad the ground is the real LOLA 20 m topography around the site. On top of it,
  // craters too small for the DEM to see, drawn from the lunar equilibrium crater size-frequency
  // distribution N(>D) = 10^-1.1 D^-1.83 per km^2 (D in km; Trask 1966, as used by Neukum et al.
  // 2001 for the saturated small-crater population). Fresh and degraded craters are mixed: depth
  // 5-18% of diameter, rim 1.5-4%, a parabolic bowl, a raised rim, and ejecta falling off as s^-3.
  const demAt = (x, z) => { // bilinear read of TERRAIN, metres relative to the site
    const { step_m: st, half_m: hm, n, height_m: H } = TERRAIN;
    const u = Math.min(n - 1.001, Math.max(0, (x + hm) / st)), v = Math.min(n - 1.001, Math.max(0, (z + hm) / st));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    return (H[j * n + i] * (1 - fu) + H[j * n + i + 1] * fu) * (1 - fv) + (H[(j + 1) * n + i] * (1 - fu) + H[(j + 1) * n + i + 1] * fu) * fv;
  };
  const ramp = (v, a, b) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  // The small craters come from client/shared/field.js, so the Scientist's chart draws the same ones.
  const FIELD_EXT = 760, CELL = 20, NC = Math.ceil(2 * FIELD_EXT / CELL);
  const craterGrid = Array.from({ length: NC * NC }, () => []);
  for (const c of CRATERS) {
    const reach = c.R * 3;
    for (let gx = Math.floor((c.x - reach + FIELD_EXT) / CELL); gx <= Math.floor((c.x + reach + FIELD_EXT) / CELL); gx++)
      for (let gz = Math.floor((c.z - reach + FIELD_EXT) / CELL); gz <= Math.floor((c.z + reach + FIELD_EXT) / CELL); gz++)
        if (gx >= 0 && gz >= 0 && gx < NC && gz < NC) craterGrid[gz * NC + gx].push(c);
  }
  const r0 = 7.9; // the graded pad round the base, metres
  function craterHeight(x, z, r) {
    const gx = Math.floor((x + FIELD_EXT) / CELL), gz = Math.floor((z + FIELD_EXT) / CELL);
    if (gx < 0 || gz < 0 || gx >= NC || gz >= NC) return 0;
    let h = 0;
    for (const c of craterGrid[gz * NC + gx]) {
      const s = Math.hypot(x - c.x, z - c.z) / c.R;
      if (s >= 3) continue;
      if (s < 1) h += -c.depth * (1 - s * s) + c.rim * s * s * s * s;
      else h += c.rim * Math.pow(s, -3) * Math.min(1, 3 - s);
    }
    return h * ramp(r, r0 + 3, r0 + 14); // the pad around the habitat and stations was graded
  }
  // Under and round each airlock chamber the ground is dug a few centimetres below its grate floor
  // (y = 0.004): the fine undulation used to come up through the floor in patches of regolith.
  const chamberMid = Object.values(PLACES.doors).map(d => { const k = CHAMBER.outset + CHAMBER.depth / 2; return { x: d.x + Math.sin(d.ry) * k, z: d.z + Math.cos(d.ry) * k }; });
  function heightRaw(x, z) {
    const r = Math.hypot(x, z);
    let h = ramp(r, 18, 70) * demAt(x, z);                      // real ground, blended in past the pad
    h += (0.03 + 0.17 * ramp(r, 15, 40)) * N.fbm(x * 0.6, z * 0.6, 2, 3); // fine undulation
    h += craterHeight(x, z, r);
    let near = Infinity;
    for (const c of chamberMid) near = Math.min(near, Math.hypot(x - c.x, z - c.z));
    const k = ramp(near, 1.4, 3.0);
    return h * k - 0.05 * (1 - k);
  }
  // The ground you can stand on is a square lattice at 2 m over the whole field (and 10 m past it), and
  // height(x, z) reads that lattice triangle for triangle: exactly the surface that is drawn, so feet, rovers,
  // rocks and samples sit on what you see. Past it, a coarser ring out to the skyline.
  const IN = CFG.bounds + 10, STEP = 2, NI = Math.round(2 * IN / STEP), W1 = NI + 1;
  const lattice = new Float32Array(W1 * W1);
  for (let j = 0; j <= NI; j++) for (let i = 0; i <= NI; i++) lattice[j * W1 + i] = heightRaw(-IN + i * STEP, -IN + j * STEP);
  function height(x, z) {
    const u = (x + IN) / STEP, v = (z + IN) / STEP;
    if (!(u >= 0 && v >= 0 && u < NI && v < NI)) return heightRaw(x, z);
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    const ha = lattice[j * W1 + i], hd = lattice[j * W1 + i + 1], hb = lattice[(j + 1) * W1 + i], hc = lattice[(j + 1) * W1 + i + 1];
    return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }
  // The ground's slope at (x, z), as a unit normal.
  function normalAt(x, z, out) {
    const e = 0.6, hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
    return out.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize();
  }
  const SIZE = 1500;
  const tone = (x, z) => 0.86 + 0.18 * N.fbm(x * 0.02 + 40, z * 0.02, 5, 3) + 0.06 * N.fbm(x * 0.15, z * 0.15, 6, 2); // broad bright/dark patches break up the tiling
  {
    // The field: (i, j) -> (x, z), two triangles a cell, the diagonal from (i, j+1) to (i+1, j), as height() reads it.
    const pos = new Float32Array(W1 * W1 * 3), col = new Float32Array(W1 * W1 * 3), uv = new Float32Array(W1 * W1 * 2), idx = [];
    for (let j = 0; j <= NI; j++) for (let i = 0; i <= NI; i++) {
      const k = j * W1 + i, x = -IN + i * STEP, z = -IN + j * STEP, t = tone(x, z);
      pos.set([x, lattice[k], z], k * 3); col.set([t, t, t * 0.985], k * 3); uv.set([x / SIZE + 0.5, z / SIZE + 0.5], k * 2);
      if (i < NI && j < NI) { const a = k, b = k + W1, c = k + W1 + 1, d = k + 1; idx.push(a, b, d, b, c, d); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const field = new THREE.Mesh(g, regolithMat);
    field.name = 'Ground_Field'; field.receiveShadow = true;
    scene.add(field);
  }
  const SEG = 160;
  const groundAt = height; // the height of the ground as drawn: the lattice mesh is exactly what height() reads
  const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const gp = groundGeo.attributes.position, col = new Float32Array(gp.count * 3), uv = groundGeo.attributes.uv, inside = new Uint8Array(gp.count);
    for (let i = 0; i < gp.count; i++) {
      // Denser vertices near the base: remap the regular grid with a power curve.
      const u = gp.getX(i) / (SIZE / 2), v = gp.getZ(i) / (SIZE / 2);
      const x = Math.sign(u) * Math.pow(Math.abs(u), 2.0) * (SIZE / 2), z = Math.sign(v) * Math.pow(Math.abs(v), 2.0) * (SIZE / 2);
      inside[i] = Math.abs(x) < IN && Math.abs(z) < IN ? 1 : 0;
      gp.setXYZ(i, x, heightRaw(x, z) - (inside[i] ? 0.5 : 0), z); // under the field's own lattice, out of sight
      uv.setXY(i, x / SIZE + 0.5, z / SIZE + 0.5);
      const t = tone(x, z);
      col[i * 3] = t; col[i * 3 + 1] = t; col[i * 3 + 2] = t * 0.985;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const old = groundGeo.index.array, keep = [];
    for (let n = 0; n < old.length; n += 3) if (!(inside[old[n]] && inside[old[n + 1]] && inside[old[n + 2]])) keep.push(old[n], old[n + 1], old[n + 2]);
    groundGeo.setIndex(keep);
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, regolithMat);
  ground.name = 'Ground_Far';
  ground.receiveShadow = true;
  scene.add(ground);

  // The skyline: the real 360-degree horizon seen from the site (LOLA, out to 290 km, with the
  // Moon's curvature). A band of ground runs from the edge of the terrain mesh out to a ring at
  // 1 km whose top edge sits at the measured horizon angle in every direction.
  {
    const n = HORIZON.angle_deg.length, R_IN = SIZE / 2 - 2, R_OUT = 1000;
    const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx = [];
    for (let i = 0; i <= n; i++) {
      const k = i % n, az = (k * HORIZON.step_deg) * Math.PI / 180, sx = Math.sin(az), sz = -Math.cos(az);
      const edge = height(sx * R_IN, sz * R_IN);
      const top = R_OUT * Math.tan(HORIZON.angle_deg[k] * Math.PI / 180) + 1.7;
      pos.set([sx * R_IN, edge, sz * R_IN], i * 6);
      pos.set([sx * R_OUT, top, sz * R_OUT], i * 6 + 3);
      uv.set([i / n * 160, 0, i / n * 160, 12], i * 4);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const apron = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: regolith, bumpMap: regolithBump, bumpScale: 0.35, roughness: 1, color: 0xd9d6cf, side: THREE.DoubleSide }));
    apron.receiveShadow = true;
    scene.add(apron);
  }

  // ---------- rocks ----------
  // Two shapes (jagged, rounded), each displaced by noise, instanced many times.
  const SITES = [...Object.values(PLACES.doors).map(d => ({ x: d.x + Math.sin(d.ry) * 2, z: d.z + Math.cos(d.ry) * 2 })), ...PLACES.panels, ...Object.values(PLACES.rovers), PLACES.depot, PLACES.dish, PLACES.drill, PLACES.port];
  const SOLIDS = [...FIELD_BOULDERS.map(b => ({ x: b.x, z: b.z, r: b.r })), ...LANDMARKS];
  const keepClear = (x, z, m) => Math.hypot(x, z) > 4.5 + m && SITES.every(s => Math.hypot(x - s.x, z - s.z) > 2.8 + m) && SOLIDS.every(o => Math.hypot(x - o.x, z - o.z) > o.r + m + 0.5);
  // A rock: a sphere pushed about by noise (low-frequency lumps plus ridged creases), stretched to its
  // own proportions, then cut by random fracture planes so it has flat broken faces like a boulder
  // that spalled off a crater rim. Normalised to a radius of about 1, centred.
  function rockGeo(detail, seed, { amp = 0.3, cuts = 6, depth = [0.5, 0.85], squash = [1, 0.75, 1], ridged = 1 } = {}) {
    // Icosahedron geometry is unindexed; weld shared vertices so the noise moves them together.
    const raw = new THREE.IcosahedronGeometry(1, detail), rp = raw.attributes.position;
    const index = [], verts = [], seen = new Map();
    for (let i = 0; i < rp.count; i++) {
      const key = [rp.getX(i), rp.getY(i), rp.getZ(i)].map(c => c.toFixed(4)).join();
      let k = seen.get(key);
      if (k === undefined) { k = verts.length / 3; seen.set(key, k); verts.push(rp.getX(i), rp.getY(i), rp.getZ(i)); }
      index.push(k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(index);
    const planes = Array.from({ length: cuts }, () => {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      return { n: new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)), d: depth[0] + rnd() * (depth[1] - depth[0]) };
    });
    const p = g.attributes.position, v = new THREE.Vector3();
    const box = new THREE.Box3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const lump = N.fbm(v.x * 1.3 + seed, v.y * 1.3 + seed * 0.7, v.z * 1.3, 4);
      const crease = 1 - Math.abs(N.noise3(v.x * 3.1 + seed, v.y * 3.1, v.z * 3.1 - seed));
      v.multiplyScalar(1 + amp * (lump + ridged * 0.45 * (crease - 0.5)));
      v.set(v.x * squash[0], v.y * squash[1], v.z * squash[2]);
      for (const pl of planes) { const out = v.dot(pl.n) - pl.d; if (out > 0) v.addScaledVector(pl.n, -out); }
      p.setXYZ(i, v.x, v.y, v.z);
      box.expandByPoint(v);
    }
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), k = 2 / Math.max(size.x, size.y, size.z);
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).sub(c).multiplyScalar(k);
      p.setXYZ(i, v.x, v.y, v.z);
      uv[i * 2] = Math.atan2(v.z, v.x) / Math.PI; uv[i * 2 + 1] = v.y;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.userData.bottom = g.boundingBox.min.y; // how far the base sits below the centre, in unit scale
    return g;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), c3 = new THREE.Color();
  // Scatter `count` copies of one shape. Each copy gets its own stretch, turn and tilt, so no two match.
  function scatter(geo, count, rMin, rMax, sMin, sMax, { bury = 0.25, tilt = 0.5 } = {}) {
    const im = new THREE.InstancedMesh(geo, rockMat, count);
    for (let i = 0; i < count; i++) {
      let x, z, s, n = 0;
      do { const a = rnd() * Math.PI * 2, r = rMin + Math.pow(rnd(), 1.4) * (rMax - rMin); x = Math.cos(a) * r; z = Math.sin(a) * r; s = sMin + rnd() * rnd() * (sMax - sMin); } while ((!keepClear(x, z, s) || (s > 0.6 && Math.hypot(x, z) < CFG.bounds + 4)) && ++n < 50); // nothing you could walk through inside the play area
      e.set((rnd() - 0.5) * 2 * tilt, rnd() * Math.PI * 2, (rnd() - 0.5) * 2 * tilt, 'YXZ');
      sc.set(s * (0.65 + rnd() * 0.75), s * (0.55 + rnd() * 0.6), s * (0.65 + rnd() * 0.75));
      m4.compose(v3.set(x, groundAt(x, z) - geo.userData.bottom * sc.y * (1 - bury), z), q.setFromEuler(e), sc);
      im.setMatrixAt(i, m4);
      const t = 0.72 + rnd() * 0.42;
      im.setColorAt(i, c3.setRGB(t, t * (0.97 + rnd() * 0.04), t * (0.93 + rnd() * 0.04)));
    }
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  // Eight shapes. Boulders: angular blocks, slabs, many-faceted chunks, knobbly breccia and a weathered
  // rounded one. Pebbles: three small, sharp shapes. Out in the field only knee-high rocks are walked through;
  // every big one is a solid BOULDER (client/shared/field.js) so nothing blocks you that you cannot see.
  const ROCKS = [
    rockGeo(3, 101, { amp: 0.30, cuts: 9, squash: [1.25, 0.80, 0.90] }),
    rockGeo(3, 202, { amp: 0.32, cuts: 6, squash: [1.60, 0.55, 0.90] }),
    rockGeo(3, 303, { amp: 0.26, cuts: 13, depth: [0.45, 0.75], squash: [0.95, 1.00, 1.10] }),
    rockGeo(3, 404, { amp: 0.50, cuts: 4, squash: [1.10, 0.75, 1.35], ridged: 1.6 }),
    rockGeo(2, 505, { amp: 0.24, cuts: 2, depth: [0.7, 0.9], squash: [1.00, 0.70, 1.15], ridged: 0.3 }),
  ];
  const TOOTH = rockGeo(2, 909, { amp: 0.30, cuts: 6, squash: [0.7, 1.5, 0.8] });
  const PEBBLES = [
    rockGeo(1, 606, { amp: 0.30, cuts: 5, squash: [1.30, 0.70, 0.90] }),
    rockGeo(1, 707, { amp: 0.35, cuts: 4, squash: [0.90, 0.60, 1.20] }),
    rockGeo(1, 808, { amp: 0.25, cuts: 7, squash: [1.10, 0.85, 1.00] }),
  ];
  [24, 18, 18, 16, 0].forEach((n, i) => n && scatter(ROCKS[i], n * 3, CFG.bounds + 6, 400, 0.6, 2.6, { bury: 0.3, tilt: 0.45 }));  // big, past the field
  [20, 14, 16, 18, 22].forEach((n, i) => scatter(ROCKS[i], n * 3, 3, CFG.bounds + 6, 0.25, 0.6, { bury: 0.35, tilt: 0.6 }));    // knee-high, over the field
  [400, 380, 380].forEach((n, i) => scatter(PEBBLES[i], n, 2.5, CFG.bounds + 6, 0.05, 0.3, { bury: 0.2, tilt: Math.PI }));      // small, any way up
  // The field's boulders: solid, on the chart, and how people give directions.
  {
    const shapes = { jagged: ROCKS[0], rounded: ROCKS[4], tooth: TOOTH }, by = { jagged: [], rounded: [], tooth: [] };
    for (const b of FIELD_BOULDERS) by[b.shape].push(b);
    for (const [shape, list] of Object.entries(by)) {
      if (!list.length) continue;
      const geo = shapes[shape], im = new THREE.InstancedMesh(geo, rockMat, list.length);
      im.name = 'Boulders_' + shape;
      list.forEach((b, i) => {
        const tilt = Math.sin(b.x * 3.1 + b.z) * 0.12, s = b.s * 0.5;
        m4.compose(v3.set(b.x, groundAt(b.x, b.z) - geo.userData.bottom * s * 0.75, b.z), q.setFromEuler(e.set(tilt, b.ry, -tilt * 0.6, 'YXZ')), sc.set(s * 1.1, s, s));
        im.setMatrixAt(i, m4);
        const t = 0.78 + Math.abs(Math.sin(b.x * 7.7 + b.z * 3.3)) * 0.25;
        im.setColorAt(i, c3.setRGB(t, t * 0.99, t * 0.95));
      });
      im.castShadow = im.receiveShadow = true;
      scene.add(im);
    }
  }

  // ---------- sky ----------
  {
    // Stars with their own size and colour, denser along a tilted Milky Way band.
    const COUNT = 5000, pos = new Float32Array(COUNT * 3), size = new Float32Array(COUNT), col = new Float32Array(COUNT * 3);
    const bandN = new THREE.Vector3(0.35, 0.82, 0.45).normalize();
    for (let i = 0; i < COUNT; i++) {
      let v;
      do { // only stars above the horizon; the ones below are simply not there (no piling up at the horizon)
        if (i < COUNT * 0.6) { // band star: near the great circle perpendicular to bandN
          const a = rnd() * Math.PI * 2, off = (rnd() + rnd() + rnd() - 1.5) * 0.22;
          const t1 = new THREE.Vector3(1, 0, 0).cross(bandN).normalize(), t2 = bandN.clone().cross(t1);
          v = t1.multiplyScalar(Math.cos(a)).add(t2.multiplyScalar(Math.sin(a))).add(bandN.clone().multiplyScalar(off)).normalize();
        } else {
          const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
          v = new THREE.Vector3(rr * Math.cos(a), u, rr * Math.sin(a));
        }
      } while (v.y < -0.06);
      pos.set([v.x * 2200, v.y * 2200, v.z * 2200], i * 3);
      const mag = Math.pow(rnd(), 3);
      size[i] = 0.8 + mag * 3.2 + (i < COUNT * 0.6 ? 0 : rnd() * 0.6);
      const temp = rnd();
      const bright = 0.35 + mag * 0.65;
      col.set(temp < 0.15 ? [0.75 * bright, 0.85 * bright, bright] : temp < 0.85 ? [bright, bright, bright * 0.97] : [bright, bright * 0.85, bright * 0.65], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { scale: { value: renderer ? renderer.getPixelRatio() : 1 } },
      vertexShader: 'attribute float size; varying vec3 vColor; uniform float scale; void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * a, a); }',
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    stars.frustumCulled = false;
    scene.add(stars);

    // The sun itself: a hard disc and a soft glow, far along the light direction.
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    disc.position.copy(sunDir).multiplyScalar(2100); disc.scale.setScalar(285);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }));
    glow.position.copy(disc.position); glow.scale.setScalar(1350);
    scene.add(disc, glow);
  }

  // Earth, low over the northern horizon: continents, clouds, a sunlit atmosphere rim, and the
  // same sun lighting it, so it shows a phase.
  const earth = new THREE.Group();
  earth.position.set(...EARTH_POS);
  {
    const R = EARTH_R;
    earth.add(new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.75, metalness: 0, emissive: 0x06101f, emissiveIntensity: 0.6 })));
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 48, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: cloudTex, transparent: true, roughness: 1, depthWrite: false }));
    earth.add(clouds);
    earth.userData.clouds = clouds;
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 48, 32), new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
      fragmentShader: 'uniform vec3 sunDir; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(1.0 - abs(dot(vN, vV)), 2.6); float lit = clamp(dot(vN, sunDir) * 1.4 + 0.45, 0.0, 1.0); gl_FragColor = vec4(vec3(0.42, 0.68, 1.0) * rim * lit * 2.4, rim * lit); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
    }));
    earth.add(atmo);
    earth.rotation.z = 0.41; // axial tilt, as seen
  }
  scene.add(earth);

  // ---------- the habitat: NASA's Habitat Demonstration Unit (docs/ASSETS.md) ----------
  // The model's core is a 5 m drum with a dome, a long module off one side (+x here, away from the airlock)
  // and a short one off the other. The game still treats the habitat as a circle of CFG.habRadius round
  // the origin with the airlock on +z: the core is centred there, and astronaut.js keeps you out of the
  // two side modules. The airlock is our own: a vestibule built onto the core's door, its outer hatch
  // swung open so you can look inside, and a porthole in the inner hatch that shows the hall itself
  // (astronaut.js renders the hall into it with a second camera).
  const hab = new THREE.Group();
  const doors = {}, floods = [];
  {
    const CORE_X = 1.5; // the model's core is 1.5 m off its bounding-box centre
    loadModel(THREE, 'hab-module').then(m => {
      m.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = shadows;
        const old = o.material, map = old.map && periodPhoto(old.map.image);
        o.material = new THREE.MeshStandardMaterial({ map, color: PAL.hex.enamel, roughness: 0.82, metalness: 0.08, bumpMap: regolithBump, bumpScale: 0.03 });
      });
      m.position.x = CORE_X;
      hab.add(m); m.updateMatrixWorld(true);
      crack.userData.place(crack.userData.spot ?? 0); // the crack sits on the model's skin, not on the old dome
    }).catch(e => console.warn('hab-module', e));
    // The NASA texture's logos and flags are modern and bright: draw it once through a warm, faded filter.
    function periodPhoto(img) {
      if (!img || !img.width) return null;
      const c = document.createElement('canvas'); c.width = Math.min(1024, img.width); c.height = Math.round(c.width * img.height / img.width);
      const g = c.getContext('2d');
      g.filter = 'saturate(0.25) sepia(0.25) contrast(0.9) brightness(1.02)';
      g.drawImage(img, 0, 0, c.width, c.height);
      const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return t;
    }

    // The four airlocks: a walk-in chamber on each of the model's hatches (client/airlock.js), outer hatch
    // standing open, a floodlight over it and a hazard-striped apron in front. Their twins are in the hall.
    const apronTex = canvasTexture(THREE, 256, 128, (d, w2, h2, g) => {
      g.fillStyle = PAL.hazard; g.fillRect(0, 0, w2, h2);
      g.strokeStyle = '#2b2a26'; g.lineWidth = 22;
      for (let i = -256; i < 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); }
      g.fillStyle = '#35393f'; g.fillRect(16, 16, w2 - 32, h2 - 32);
    });
    const apronMat = new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.9, metalness: 0.05 });
    for (const [id, d] of Object.entries(PLACES.doors)) {
      const a = buildAirlock(THREE, { id, shell: true, castShadow: shadows });
      a.root.position.set(d.x, 0, d.z); a.root.rotation.y = d.ry; a.root.translateZ(CHAMBER.outset); // clear of the model's skin
      a.setOuter(1); a.setInner(0); a.setLamp('green'); a.setPressure(0);
      hab.add(a.root);
      doors[id] = a;
      const D = CHAMBER.depth, H = CHAMBER.height;
      mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), dark, 0, H + 0.2, D + 0.12, a.root);
      mesh(new THREE.CircleGeometry(0.06, 12), warmGlow, 0, H + 0.139, D + 0.15, a.root).rotation.x = -Math.PI / 2;
      // A real light over the main door only: every light costs the Quest on every pixel outside. The
      // others have their lamp glowing and no light.
      if (id === 'S') {
        const flood = new THREE.SpotLight(PAL.hex.incandescent, 25, 10, 0.7, 0.6, 1.2);
        flood.position.set(0, H + 0.1, D + 0.2); flood.target.position.set(0, 0, D + 3);
        a.root.add(flood, flood.target);
        floods.push(flood);
      }
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), apronMat);
      apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.012, D + 0.5); apron.receiveShadow = true; a.root.add(apron);
    }
    hab.userData.flood = floods[0];
    // The habitat's painted windows get dark glass over them, so they read as windows and not stickers.
    // The one on Segment C is the outside of the hall's window.
    {
      const W = PLACES.window.out;
      const glass = mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshStandardMaterial({ color: PAL.hex.whiteOff, roughness: 0.15, metalness: 0.4, emissive: 0x2a1e10 }), W.x, W.y, W.z, hab);
      glass.rotation.y = W.ry; glass.position.x += Math.sin(W.ry) * 0.03; glass.position.z += Math.cos(W.ry) * 0.03; glass.castShadow = false;
      glass.name = 'Window_SegmentC';
      const ring = mesh(new THREE.TorusGeometry(0.21, 0.025, 8, 24), steel, glass.position.x, W.y, glass.position.z, hab);
      ring.rotation.y = W.ry;
    }
    // Mast on the dome with the tracking mount and its dish.
    tube(steel, [1.2, 5.6, 0], [1.2, 7.2, 0], 0.035, hab);
    const dish = mesh(new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => new THREE.Vector2(i * 0.05, (i * 0.05) ** 2 * 0.5)), 24), whitePlain, 1.2, 7.3, 0, hab);
    dish.lookAt(new THREE.Vector3(...EARTH_POS).add(hab.position)); dish.rotateX(-Math.PI / 2 + 0.6);
    Promise.all([loadPeriod(THREE, 'dish-base', { by: { Default: { color: PAL.hex.console } } }), loadPeriod(THREE, 'dish-turntable', { by: { Default: { color: PAL.hex.aluminium, metal: 0.4, rough: 0.6 } } })]).then(([base, turn]) => {
      base.position.set(1.2, 7.05, 0); turn.position.set(1.2, 7.44, 0);
      turn.name = 'Turntable'; hab.add(base, turn);
      dish.position.y = 8.1; hab.userData.turntable = turn;
    }).catch(e => console.warn('dish mount', e));
  }
  scene.add(hab);

  // ---------- solar array, angled to the sun. The three near panels are the ones that get dusty. ----------
  const sunFlat = new THREE.Vector3(sunDir.x, 0.16, sunDir.z).normalize();
  const dustPanels = [];
  for (const p of PLACES.panels) {
    mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 10), dark, p.x, 0.1, p.z).receiveShadow = true;
    tube(steel, [p.x, 0.2, p.z], [p.x, 1.3, p.z], 0.06);
    const panel = new THREE.Group(); panel.position.set(p.x, 1.4, p.z);
    mesh(new THREE.BoxGeometry(2.2, 1.3, 0.06), solar, 0, 0, 0, panel);
    mesh(new THREE.BoxGeometry(2.3, 1.4, 0.03), steel, 0, 0, -0.03, panel);
    panel.lookAt(panel.position.clone().add(sunFlat)); // local +z is the face you brush
    panel.name = 'Panel_Solar';
    scene.add(panel);
    panel.updateMatrixWorld();
    dustPanels.push(panel);
  }
  // The dust on them, and the brush that takes it off: client/dust.js.
  const dustGrain = regolith.clone(); dustGrain.repeat.set(2.2, 1.3); dustGrain.needsUpdate = true;
  const dust = buildDust(THREE, { scene, panels: dustPanels, grainMap: dustGrain, ground: (x, z) => groundAt(x, z) });
  const dustCells = dust.cells;
  for (const p of PLACES.panels) { // a second row behind, scenery only
    const x = p.x + 3.6;
    mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.2, 10), dark, x, 0.1, p.z).receiveShadow = true;
    tube(steel, [x, 0.2, p.z], [x, 1.9, p.z], 0.06);
    const panel = new THREE.Group(); panel.position.set(x, 2.0, p.z);
    mesh(new THREE.BoxGeometry(2.6, 1.5, 0.06), solar, 0, 0, 0, panel);
    mesh(new THREE.BoxGeometry(2.7, 1.6, 0.03), steel, 0, 0, -0.03, panel);
    panel.lookAt(panel.position.clone().add(sunFlat));
    scene.add(panel);
  }

  // ---------- scenery: fuel depot, comms dish, drill rig. Nothing to fix here. ----------
  const site = p => {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(-p.x, -p.z); // face the habitat
    scene.add(g);
    mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.08, 16), dark, 0, 0.04, -1.2, g).receiveShadow = true;
    return g;
  };
  const depot = site(PLACES.depot), dishSite = site(PLACES.dish), drill = site(PLACES.drill);
  // Fuel depot: two insulated tanks on cradles, plumbing, a valve wheel
  for (const y of [0.75, 2.05]) {
    const t = mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.6, 24), whitePlain, 0, y, -1.7, depot); t.rotation.z = Math.PI / 2;
    for (const dx of [-1.0, 1.0]) { const band = mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.2, 24), orange, dx, y, -1.7, depot); band.rotation.z = Math.PI / 2; }
    for (const dx of [-1.3, 1.3]) { const cap = mesh(new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), whitePlain, dx, y, -1.7, depot); cap.rotation.z = dx > 0 ? -Math.PI / 2 : Math.PI / 2; }
  }
  for (const dx of [-1.0, 1.0]) { // frame
    tube(steel, [dx, 0, -1.1], [dx, 2.1, -1.1], 0.04, depot); tube(steel, [dx, 0, -2.3], [dx, 2.1, -2.3], 0.04, depot);
    tube(steel, [dx, 1.4, -1.1], [dx, 1.4, -2.3], 0.04, depot); tube(steel, [dx, 2.1, -1.1], [dx, 2.1, -2.3], 0.04, depot);
  }
  tube(steel, [1.9, 0.75, -1.7], [1.9, 2.05, -1.7], 0.05, depot);
  mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20), orange, 1.0, 1.4, -0.7, depot).rotation.z = Math.PI / 2;
  // Comms dish: a true parabola on a yoke, feed on a tripod, pointed at Earth
  {
    const st = dishSite, handBuilt = st.children.length; // the parts below give way to the NASA dish when it loads
    mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.3, 12), dark, 0, 0.15, -1.6, st);
    tube(steel, [0, 0.3, -1.6], [0, 2.6, -1.6], 0.09, st);
    const yoke = new THREE.Group(); yoke.position.set(0, 2.8, -1.6); st.add(yoke);
    const dish = mesh(new THREE.LatheGeometry(Array.from({ length: 13 }, (_, i) => new THREE.Vector2(i * 0.1, (i * 0.1) ** 2 * 0.2)), 40), whitePlain, 0, 0, 0, yoke);
    dish.material = new THREE.MeshStandardMaterial({ color: PAL.hex.enamel, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) { // ribs on the back, so it reads as a dish from behind
      const a = (i / 8) * Math.PI * 2;
      tube(steel, [0, -0.08, 0], [Math.cos(a) * 1.18, 1.18 * 1.18 * 0.2 - 0.04, Math.sin(a) * 1.18], 0.02, yoke);
    }
    mesh(new THREE.TorusGeometry(1.2, 0.025, 8, 40), steel, 0, 1.2 * 1.2 * 0.2, 0, yoke).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; tube(steel, [Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1], [0, 1.5, 0], 0.015, yoke); } // feed on its tripod, near the focus
    mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.25, 10), dark, 0, 1.55, 0, yoke);
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 12), grey, 0, -0.1, 0, yoke);
    st.updateMatrixWorld(true);
    const toEarth = st.worldToLocal(new THREE.Vector3(...EARTH_POS)).sub(yoke.position).normalize();
    yoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toEarth);
    // The NASA tall dish (docs/ASSETS.md): reflector painted enamel, not white; turned to face Earth.
    loadPeriod(THREE, 'comms-dish', { merge: true, cast: shadows, receive: shadows, by: { ant_tall: { color: PAL.hex.enamel, rough: 0.75 }, mass: { color: PAL.hex.console } } }).then(m => {
      st.remove(...st.children.slice(handBuilt));
      m.position.set(0, 0, -1.6);
      m.rotation.y = Math.atan2(toEarth.x, toEarth.z);
      st.add(m);
    }).catch(e => console.warn('comms-dish', e));
  }
  // Drill rig: tripod with winch, drill string, cuttings pile
  {
    const st = drill;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      tube(steel, [Math.sin(a) * 1.3, 0, -1.8 + Math.cos(a) * 1.3], [0, 4.2, -1.8], 0.05, st);
      mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.06, 10), grey, Math.sin(a) * 1.3, 0.03, -1.8 + Math.cos(a) * 1.3, st);
    }
    mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), gold, 0, 4.3, -1.8, st);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 10), steel, 0, 1.9, -1.8, st);
    mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 12), dark, 0, 0.25, -1.8, st);
    const pile = mesh(new THREE.ConeGeometry(0.9, 0.45, 14), rockMat, 0.9, 0.2, -2.4, st); pile.scale.z = 0.7;
    mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), grey, -1.3, 0.3, -1.0, st);
    tube(dark, [-1.3, 0.6, -1.0], [0, 4.0, -1.8], 0.015, st);
  }

  // ---------- hull crack: one crack, moved to whichever of the six spots is breached ----------
  // The habitat model's drum is faceted: find its surface at an angle by casting a ray in from outside.
  const hullRay = new THREE.Raycaster(), hullFrom = new THREE.Vector3(), hullDir = new THREE.Vector3();
  function hullRadius(a, y) {
    const shell = hab.children.find(o => o.name === 'Root');
    if (!shell) return 2.53;
    hullFrom.set(Math.cos(a) * 6, y, Math.sin(a) * 6); hullDir.set(-Math.cos(a), 0, -Math.sin(a));
    hullRay.set(hullFrom, hullDir); hullRay.far = 6;
    const hit = hullRay.intersectObject(shell, true)[0];
    return hit ? 6 - hit.distance + 0.005 : 2.53;
  }
  const crack = new THREE.Group();
  const crackPts = Array.from({ length: CRACK_POINTS }, () => new THREE.Vector3());
  const beads = [], vapour = [];
  {
    const zig = [0.03, -0.04, 0.02, -0.03, 0.04, -0.02];
    crack.userData.place = spot => {
      const a0 = PLACES.cracks[spot].a;
      for (let i = 0; i < CRACK_POINTS; i++) {
        const a = a0 + (i - (CRACK_POINTS - 1) / 2) * 0.045, r = hullRadius(a, 1.55 + zig[i]);
        crackPts[i].set(Math.cos(a) * r, 1.55 + zig[i], Math.sin(a) * r);
        beads[i].position.copy(crackPts[i]);
      }
      const pos = line.geometry.attributes.position;
      for (let i = 0; i < CRACK_POINTS; i++) pos.setXYZ(i, crackPts[i].x * 1.004, crackPts[i].y, crackPts[i].z * 1.004);
      pos.needsUpdate = true;
      crack.userData.normal.set(Math.cos(a0), 0, Math.sin(a0));
      const rc = hullRadius(a0, 1.55) + 0.02;
      crack.userData.centre.set(Math.cos(a0) * rc, 1.55, Math.sin(a0) * rc);
    };
    crack.userData.normal = new THREE.Vector3(1, 0, 0);
    crack.userData.centre = new THREE.Vector3();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(crackPts), new THREE.LineBasicMaterial({ color: 0x050505 }));
    line.frustumCulled = false;
    crack.add(line);
    for (let i = 0; i < CRACK_POINTS; i++) {
      // Dark and open until welded, then a glowing bead.
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0a0a0a, toneMapped: false }));
      crack.add(b); beads.push(b);
    }
    const puff = new THREE.MeshBasicMaterial({ color: 0xcfc8b8, transparent: true, opacity: 0.22, depthWrite: false });
    for (let i = 0; i < 10; i++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), puff); crack.add(v); vapour.push(v); }
    crack.visible = false;
    scene.add(crack);
    crack.userData.place(0);
  }

  // ---------- meteor shower: streaks out of the sky and dust where they land ----------
  const METEORS = 9;
  const meteors = [];
  {
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false });
    const fall = new THREE.Vector3(0.35, -0.85, 0.25).normalize();
    for (let i = 0; i < METEORS; i++) {
      const streak = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 5), streakMat);
      streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fall);
      const burst = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb8b1a4, transparent: true, opacity: 0, depthWrite: false }));
      streak.visible = burst.visible = false;
      scene.add(streak, burst);
      meteors.push({ streak, burst, fall });
    }
  }
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- the two rovers (each faces +z). Their lights are what the astronaut follows in the dark. ----------
  // The Hauler is the crewed LRV: two seats, a footplate and a rail at the back for a rider who stands, and a
  // tray of four sample cups on the aft bay. The Scout is a small prospecting robot in the VIPER mould: it
  // goes ahead and surveys for the Scientist's chart. Each has one wheel that can break and come off.
  const rbox = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const stencil = (text, base) => canvasTexture(THREE, 256, 128, (d, w, h, g) => { // painted steel with seams, rivets and a stencilled name
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(36,34,30,0.45)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12); g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 6); g.stroke();
    g.fillStyle = 'rgba(36,34,30,0.5)'; for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    if (text) { g.fillStyle = 'rgba(36,34,30,0.75)'; g.font = `bold 34px ${FONT.label}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w * 0.27, h / 2 + 2); }
    g.globalAlpha = 0.12; for (let i = 0; i < 60; i++) { g.fillStyle = i % 2 ? '#24221e' : '#8f8a78'; g.fillRect((i * 97) % w, (i * 41) % h, 2 + i % 4, 1 + i % 2); } // a little wear
  });
  // Merge the static meshes directly under a group into one mesh per material (the Quest is the budget: a rover
  // of a hundred parts is a handful of draw calls). Parts that move or light up are not put under it.
  function mergeStatic(parent) {
    const by = new Map(), drop = [];
    for (const o of parent.children) if (o.isMesh && !Array.isArray(o.material)) { o.updateMatrix(); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(o); drop.push(o); }
    for (const [mat, list] of by) {
      const geos = list.map(o => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(o.matrix); return g; });
      const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true; parent.add(m);
    }
    for (const o of drop) parent.remove(o);
  }
  const wheelGeo = new THREE.TorusGeometry(0.32, 0.09, 10, 24); wheelGeo.rotateY(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10); hubGeo.rotateZ(Math.PI / 2);
  function buildRover(kind) {
    const rover = new THREE.Group(); rover.name = kind === 'scout' ? 'Rover_Scout' : 'Rover_Hauler';
    const body = new THREE.Group(); body.name = 'Body'; rover.add(body);
    const k = kind === 'scout' ? 0.68 : 1, W = kind === 'scout' ? 0.62 : 0.85, L = kind === 'scout' ? 0.52 : 0.85, wy = 0.4 * k;
    const wheels = {};
    for (const [x, z, id] of [[-W, L, 'FL'], [W, L, 'FR'], [-W, -L, 'RL'], [W, -L, 'RR']]) {
      const wg = new THREE.Group(); wg.name = 'Wheel_' + id; wg.position.set(x, wy, z); wg.scale.setScalar(k); rover.add(wg);
      mesh(wheelGeo, dark, 0, 0, 0, wg); // wire-mesh tyre
      if (kind === 'hauler') for (let i = 0; i < 6; i++) { const sp = tube(steel, [0, 0, 0], [0, Math.cos(i) * 0.3, Math.sin(i) * 0.3], 0.012, wg); sp.castShadow = false; }
      else mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12), gold, 0, 0, 0, wg).rotation.z = Math.PI / 2;
      mesh(hubGeo, steel, x, wy, z, rover).scale.setScalar(k);
      mergeStatic(wg);
      wheels[id] = wg;
    }
    // The front right wheel is the one that breaks and comes off.
    const fr = wheels.FR;
    rover.userData.wheel = fr;
    rover.userData.wheelRest = fr.position.clone();
    rover.userData.hub = new THREE.Object3D(); rover.userData.hub.name = 'Hub_FR'; rover.userData.hub.position.set(W + 0.1 * k, wy, L); rover.add(rover.userData.hub);
    const warn = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.hex.red, toneMapped: false }));
    warn.name = 'Lamp_Wheel'; warn.position.set(W, wy + 0.55 * k, L); warn.visible = false; rover.add(warn);
    rover.userData.warn = warn;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.hex.amber, toneMapped: false }));
    beacon.name = 'Lamp_Beacon'; rover.add(beacon);
    rover.userData.beacon = beacon;
    if (kind === 'hauler') {
      const deck = new THREE.MeshStandardMaterial({ map: stencil('HAULER', PAL.enamel), roughness: 0.8, metalness: 0.1, bumpMap: regolithBump, bumpScale: 0.03 });
      mesh(rbox(1.5, 0.12, 2.4, 0.04), deck, 0, 0.62, 0, body);                                 // chassis floor
      mesh(rbox(1.5, 0.3, 0.45, 0.05), gold, 0, 0.83, -1.0, body);                             // aft equipment bay, the tray on top
      mesh(rbox(1.1, 0.5, 0.7, 0.06), gold, 0, 0.93, -0.35, body);
      for (const x of [-0.45, 0.45]) { mesh(rbox(0.5, 0.08, 0.5, 0.03), dark, x, 0.72, 0.5, body); mesh(rbox(0.5, 0.5, 0.08, 0.03), dark, x, 1.0, 0.25, body); } // seats
      mesh(rbox(0.5, 0.3, 0.06, 0.02), dark, 0, 1.05, 0.95, body);                              // console
      mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ color: PAL.hex.phosphor, toneMapped: false }), 0, 1.08, 0.985, body);
      tube(steel, [0, 0.9, 0.95], [0, 1.3, 1.1], 0.02, body);                                     // hand controller stalk
      for (const [x, z] of [[-W, L], [W, L], [-W, -L], [W, -L]]) {
        const fender = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.26, 12, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: PAL.hex.orange, roughness: 0.65, metalness: 0.1, side: THREE.DoubleSide }), x, 0.42, z, body);
        fender.rotation.z = Math.PI / 2;
        tube(steel, [x * 0.6, 0.6, z], [x, 0.4, z], 0.03, body);
      }
      tube(steel, [0.5, 1.1, -1.0], [0.5, 2.2, -1.0], 0.025, body);
      const lrvDish = mesh(new THREE.LatheGeometry(Array.from({ length: 8 }, (_, i) => new THREE.Vector2(i * 0.05, (i * 0.05) ** 2 * 0.6)), 16), silverFoil, 0.5, 2.25, -1.0, body);
      lrvDish.rotation.x = -0.9;
      beacon.position.set(-0.6, 1.75, -0.8);
      tube(steel, [-0.6, 1.1, -0.8], [-0.6, 1.7, -0.8], 0.02, body);
      // The rider's footplate and the hoop rail in front of it: stand on the plate, hold the rail.
      const P = HAULER.plate;
      const plate = mesh(rbox(P.hw * 2, 0.05, P.hd * 2, 0.02), new THREE.MeshStandardMaterial({ color: PAL.hex.consoleDeep, roughness: 0.7, metalness: 0.5, bumpMap: foilBump, bumpScale: 0.15 }), P.x, P.y - 0.025, P.z, rover);
      plate.name = 'Footplate';
      for (const x of [-0.35, 0.35]) tube(steel, [x, 0.6, -1.15], [x, P.y - 0.02, P.z + 0.1], 0.025, rover);
      const railPath = new THREE.CatmullRomCurve3([[-0.42, 0.66, -1.24], [-0.42, 1.3, -1.3], [-0.3, 1.42, -1.3], [0.3, 1.42, -1.3], [0.42, 1.3, -1.3], [0.42, 0.66, -1.24]].map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.1);
      const rail = mesh(new THREE.TubeGeometry(railPath, 24, 0.022, 8), new THREE.MeshStandardMaterial({ color: PAL.hex.hazard, roughness: 0.55, metalness: 0.3 }), 0, 0, 0, rover);
      rail.name = 'Rail_Rider';
      // Grip tape on the rail's top bar: where you take hold. It glows warm while the rail can be taken (the hand,
      // client/hand.js), and sits dark the rest of the time.
      const gripMat = new THREE.MeshStandardMaterial({ color: PAL.hex.bakelite, roughness: 0.92, metalness: 0, bumpMap: regolithBump, bumpScale: 0.02, emissive: PAL.hex.amber, emissiveIntensity: 0 });
      const grip = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 14), gripMat, 0, 1.42, -1.3, rover);
      grip.rotation.z = Math.PI / 2; grip.name = 'Grip_Rail';
      grip.userData.glow = (on, t) => { gripMat.emissiveIntensity = on ? 0.55 + 0.25 * Math.sin(t * 5) : 0; };
      rover.userData.grip = grip;
      rover.userData.rail = new THREE.Object3D(); rover.userData.rail.position.set(0, 1.42, -1.3); rover.add(rover.userData.rail);
      rover.userData.plate = new THREE.Object3D(); rover.userData.plate.position.set(P.x, P.y, P.z); rover.add(rover.userData.plate);
      // The tray: four open sample cups on the aft bay.
      const tray = new THREE.Group(); tray.name = 'Tray'; rover.add(tray);
      mesh(rbox(1.3, 0.04, 0.32, 0.015), dark, 0, 1.0, HAULER.cups[0].z, tray);
      const cupGeo = new THREE.LatheGeometry([[0.0, 0], [0.09, 0], [0.1, 0.02], [0.11, 0.14], [0.125, 0.15], [0.115, 0.155], [0.1, 0.03], [0.0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
      const cupMat = new THREE.MeshStandardMaterial({ color: PAL.hex.aluminium, roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide });
      rover.userData.cups = HAULER.cups.map((c, i) => { const m = mesh(cupGeo, cupMat, c.x, c.y, c.z, tray); m.name = 'Cup_' + i; m.castShadow = false; return m; });
      for (const x of [-0.5, 0.5]) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 12), new THREE.MeshBasicMaterial({ color: PAL.hex.white, toneMapped: false }));
        h.position.set(x, 0.8, 1.22); h.rotation.x = Math.PI / 2; h.name = 'Lamp_Head'; rover.add(h);
      }
      const head = new THREE.SpotLight(PAL.hex.incandescent, 30, 18, 0.55, 0.6, 1.2);
      head.position.set(0, 0.9, 1.2); head.target.position.set(0, 0.2, 7);
      rover.add(head, head.target);
    } else {
      const shell = new THREE.MeshStandardMaterial({ map: stencil('SCOUT', PAL.enamel), roughness: 0.78, metalness: 0.12, bumpMap: regolithBump, bumpScale: 0.03 });
      mesh(rbox(1.15, 0.38, 1.35, 0.09), shell, 0, 0.72, 0, body);                       // the body, top at 0.9 m
      mesh(rbox(1.25, 0.12, 1.45, 0.04), gold, 0, 0.5, 0, body);                           // foil skirt
      mesh(rbox(0.9, 0.08, 1.0, 0.03), dark, 0, 0.94, -0.05, body);                        // radiator plate on top
      const drill = mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 12), grey, 0, 0.36, 0.1, body); drill.name = 'Drill';
      for (const x of [-W, W]) tube(steel, [x * 0.6, 0.55, 0], [x, wy, 0], 0.03, body), tube(steel, [x, wy, -L], [x, wy, L], 0.025, body);
      tube(steel, [0.3, 0.92, 0.42], [0.3, 1.72, 0.42], 0.035, body);                       // the mast
      const camHead = new THREE.Group(); camHead.name = 'Camera_Head'; camHead.position.set(0.3, 1.8, 0.42); rover.add(camHead);
      mesh(rbox(0.32, 0.16, 0.2, 0.03), grey, 0, 0, 0, camHead);
      for (const x of [-0.09, 0.09]) mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), new THREE.MeshBasicMaterial({ color: PAL.hex.bakelite }), x, 0, 0.11, camHead).rotation.x = Math.PI / 2;
      for (const x of [-0.42, 0.42]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 12), new THREE.MeshBasicMaterial({ color: PAL.hex.white, toneMapped: false }));
        l.position.set(x, 0.75, 0.69); l.rotation.x = Math.PI / 2; l.name = 'Lamp_Work'; rover.add(l);
      }
      beacon.position.set(0.3, 2.0, 0.42); beacon.scale.setScalar(0.8);
      tube(steel, [0.3, 1.88, 0.42], [0.3, 1.96, 0.42], 0.015, body);
    }
    mergeStatic(body);
    return rover;
  }
  const rovers = { hauler: buildRover('hauler'), scout: buildRover('scout') };
  for (const [id, r] of Object.entries(rovers)) {
    const p = PLACES.rovers[id];
    r.position.set(p.x, height(p.x, p.z), p.z);
    r.userData.yaw = r.rotation.y = 0; r.userData.v = 0; // parked facing out, away from the base
    scene.add(r);
  }
  const rover = rovers.hauler; // the one the scenery and the older code mean by "the rover"

  // Rooster tails: each moving wheel throws a slow fan of dust that hangs and falls at lunar gravity.
  const DUSTN = 320, dustPos = new Float32Array(DUSTN * 3), dustVel = new Float32Array(DUSTN * 3), dustAge = new Float32Array(DUSTN).fill(9);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: PAL.hex.regolith, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false }));
  dustPts.name = 'Dust_Wheels'; dustPts.frustumCulled = false;
  scene.add(dustPts);
  let dustNext = 0, dustT = 0;
  const kick = (x, y, z, vx, vy, vz) => {
    const n = dustNext++ % DUSTN;
    dustPos.set([x, y, z], n * 3); dustVel.set([vx, vy, vz], n * 3); dustAge[n] = 0;
  };
  const wp = new THREE.Vector3();
  function stepDust(dt) {
    for (const r of Object.values(rovers)) {
      const v = Math.abs(r.userData.v || 0);
      if (v < 0.4) continue;
      const fx = Math.sin(r.userData.yaw), fz = Math.cos(r.userData.yaw), per = v * dt * 5;
      r.userData.dustAcc = (r.userData.dustAcc || 0) + per;
      while (r.userData.dustAcc >= 1) {
        r.userData.dustAcc -= 1;
        const wheel = Object.values(r.children).filter(o => o.name.startsWith('Wheel_'))[Math.floor(Math.random() * 4)];
        if (!wheel || !wheel.visible) continue;
        wheel.getWorldPosition(wp);
        const back = -Math.sign(r.userData.v) * v * (0.5 + Math.random() * 0.4);
        kick(wp.x, wp.y - 0.2, wp.z, fx * back + (Math.random() - 0.5) * 0.8, 1.0 + Math.random() * v * 0.35, fz * back + (Math.random() - 0.5) * 0.8);
      }
    }
    for (let n = 0; n < DUSTN; n++) {
      if (dustAge[n] > 3) { dustPos[n * 3 + 1] = -100; continue; }
      dustAge[n] += dt;
      dustVel[n * 3 + 1] -= 1.62 * dt;
      dustPos[n * 3] += dustVel[n * 3] * dt; dustPos[n * 3 + 1] += dustVel[n * 3 + 1] * dt; dustPos[n * 3 + 2] += dustVel[n * 3 + 2] * dt;
      if (dustPos[n * 3 + 1] < height(dustPos[n * 3], dustPos[n * 3 + 2])) dustAge[n] = 9; // no air: it lands, it does not drift
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  // ---------- the sample port: a hopper on the habitat wall beside door S ----------
  const port = new THREE.Group(); port.name = 'Port_Sample';
  {
    const P = PLACES.port;
    port.position.set(P.x, 0, P.z); port.rotation.y = P.ry;
    const bezelMat = new THREE.MeshStandardMaterial({ color: PAL.hex.bezel, roughness: 0.45, metalness: 0.75 });
    mesh(rbox(0.5, 1.6, 0.12, 0.03), grey, 0, 0.85, -0.2, port).name = 'Bracket';                  // against the wall
    tube(steel, [0, 0, -0.08], [0, 0.82, -0.08], 0.04, port);
    const hopper = mesh(new THREE.LatheGeometry([[0.06, 0], [0.08, 0.02], [0.2, 0.2], [0.22, 0.22], [0.2, 0.23]].map(([x, y]) => new THREE.Vector2(x, y)), 24), new THREE.MeshStandardMaterial({ color: PAL.hex.console, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }), 0, 0.8, 0.02, port);
    hopper.name = 'Hopper';
    const collar = mesh(new THREE.TorusGeometry(0.215, 0.025, 8, 28), bezelMat, 0, 1.03, 0.02, port); collar.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6), steel, Math.cos(a) * 0.215, 1.055, 0.02 + Math.sin(a) * 0.215, port).castShadow = false; }
    const hinge = new THREE.Group(); hinge.name = 'Hinge_Lid'; hinge.position.set(0, 1.05, -0.2); port.add(hinge);
    const lid = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.025, 24), bezelMat, 0, 0, 0.22, hinge); lid.name = 'Port_Lid';
    hinge.rotation.x = -1.25; // standing open
    const lampP = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: PAL.hex.greenOff, toneMapped: false }));
    lampP.name = 'Lamp_Port'; lampP.position.set(0.19, 1.56, -0.12); port.add(lampP);
    // Banked and wanted on a pair of Nixie tubes above it.
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const plateM = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plateM.name = 'Counter_Port'; plateM.position.set(-0.05, 1.56, -0.135); port.add(plateM);
    port.userData = { hinge, lamp: lampP, cv, tex, mouth: new THREE.Vector3(0, 1.06, 0.02), key: '', flashUntil: 0, flash: '', lastN: 0 };
    scene.add(port);
  }
  function drawPort(banked, wanted) {
    const u = port.userData, key = banked + '/' + wanted;
    if (u.key === key) return; u.key = key;
    const g = u.cv.getContext('2d');
    g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = PAL.bezel; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
    nixie(g, String(banked), 74, 48, 56);
    g.fillStyle = PAL.inkDim; g.font = `22px ${FONT.label}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OF', 128, 50);
    nixie(g, String(wanted), 182, 48, 56);
    u.tex.needsUpdate = true;
  }
  drawPort(0, CFG.sample.manifest);

  // ---------- the samples: rocks out on the field, one instanced batch per look ----------
  // Bigger than life (15 to 30 cm) so a camera can pick one out at 10 m. Every page sees only the look.
  const sampleGeo = {
    'pale-flecked': rockGeo(1, 41, { amp: 0.35, cuts: 8, squash: [1.1, 0.8, 0.9] }),                      // angular
    'pale-plain': rockGeo(2, 43, { amp: 0.1, cuts: 1, depth: [0.8, 0.95], squash: [1, 0.8, 1], ridged: 0 }), // rounded and plain
    'dark-pitted': rockGeo(2, 47, { amp: 0.16, cuts: 2, depth: [0.75, 0.9], ridged: 0.3 }),
    'dark-smooth': rockGeo(2, 53, { amp: 0.08, cuts: 2, depth: [0.7, 0.9], squash: [1.3, 0.45, 1], ridged: 0 }), // a slab
    'ochre-beads': rockGeo(1, 59, { amp: 0.32, cuts: 2, squash: [1, 0.6, 1], ridged: 0.2 }),
    'foil-scrap': rockGeo(1, 61, { amp: 0.55, cuts: 5, squash: [1.2, 0.35, 1], ridged: 1.4 }),
    'frost-blue': rockGeo(2, 67, { amp: 0.2, cuts: 3, ridged: 0.4 }),
    'dusty-pale': rockGeo(2, 71, { amp: 0.18, cuts: 4 }),
  };
  for (const g of Object.values(sampleGeo)) g.scale(0.5, 0.5, 0.5); // rockGeo is two metres across: the samples are 15 to 30 cm
  const sampleTex = (base, spot, kind) => canvasTexture(THREE, 128, 64, (d, w, h, g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = seededDots(kind);
    for (const [x, y, s] of r) {
      if (kind === 'flecks') { g.fillStyle = spot; g.fillRect(x * w, y * h, 2 + s * 4, 1 + s * 2); }
      else if (kind === 'holes') { g.fillStyle = spot; g.beginPath(); g.arc(x * w, y * h, 1.5 + s * 3.5, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,115,105,0.6)'; g.lineWidth = 1; g.stroke(); }
      else if (kind === 'beads') { g.fillStyle = spot; g.beginPath(); g.arc(x * w, y * h, 1.5 + s * 2.5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,240,200,0.5)'; g.fillRect(x * w - 1, y * h - 1, 1.5, 1.5); }
      else if (kind === 'frost') { g.fillStyle = spot; g.fillRect(x * w, y * h, 1 + s * 2, 1 + s * 2); }
      else if (kind === 'grain') { g.fillStyle = spot; g.globalAlpha = 0.35; g.fillRect(x * w, y * h, 1 + s * 3, 1 + s * 2); g.globalAlpha = 1; }
    }
  });
  function seededDots(kind) { const out = []; let a = kind.length * 977; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; for (let i = 0; i < 90; i++) out.push([r(), r(), r()]); return out; }
  const S = SAMPLE_COL;
  const sampleMat = {
    'pale-flecked': new THREE.MeshStandardMaterial({ map: sampleTex(S.anor, S.fleck, 'flecks'), roughness: 0.9, metalness: 0 }),
    'pale-plain': new THREE.MeshStandardMaterial({ map: sampleTex(S.anor, S.anorDust, 'grain'), roughness: 0.92, metalness: 0 }),
    'dark-pitted': new THREE.MeshStandardMaterial({ map: sampleTex(S.basalt, S.pit, 'holes'), roughness: 0.85, metalness: 0.05 }),
    'dark-smooth': new THREE.MeshStandardMaterial({ map: sampleTex(S.basalt, S.basaltLight, 'grain'), roughness: 0.6, metalness: 0.05 }),
    'ochre-beads': new THREE.MeshStandardMaterial({ map: sampleTex(S.glass, S.bead, 'beads'), roughness: 0.55, metalness: 0.1 }),
    'foil-scrap': new THREE.MeshStandardMaterial({ color: PAL.hex.foilGold, metalness: 1, roughness: 0.35, bumpMap: foilBump, bumpScale: 0.8 }),
    'frost-blue': new THREE.MeshStandardMaterial({ map: sampleTex(S.ice, S.frost, 'frost'), roughness: 0.45, metalness: 0.05 }),
    'dusty-pale': new THREE.MeshStandardMaterial({ map: sampleTex(S.dusty, S.anorDust, 'grain'), roughness: 0.95, metalness: 0 }),
  };
  const SAMPLE_MAX = 16;
  const sampleIM = {};
  for (const look of LOOKS) {
    const im = new THREE.InstancedMesh(sampleGeo[look], sampleMat[look], SAMPLE_MAX);
    im.name = 'Samples_' + look; im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    scene.add(im); sampleIM[look] = im;
  }
  // The orange soil sits on a stained patch of ground.
  const stainTex = canvasTexture(THREE, 128, 128, (d, w, h, g) => {
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(185,118,58,0.85)'); grd.addColorStop(0.6, 'rgba(185,118,58,0.4)'); grd.addColorStop(1, 'rgba(185,118,58,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const stainGeo = new THREE.CircleGeometry(0.3, 20); stainGeo.rotateX(-Math.PI / 2);
  const stains = new THREE.InstancedMesh(stainGeo, new THREE.MeshStandardMaterial({ map: stainTex, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }), SAMPLE_MAX);
  stains.name = 'Samples_Stain'; stains.count = 0; stains.frustumCulled = false; stains.receiveShadow = true;
  scene.add(stains);
  const hashId = id => { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return h / 9973; };
  const sampleSize = id => 0.17 + hashId(id) * 0.12;
  const sPos = new THREE.Vector3(), sQ = new THREE.Quaternion(), sE = new THREE.Euler(), sS = new THREE.Vector3(), sM = new THREE.Matrix4(), nrm = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
  let sampleOverride = null; // (id) => a world position for a sample in a hand or falling, or null to hide it
  let lastSamples = [];
  function drawSamples(list) {
    lastSamples = list || [];
    const counts = {}; for (const l of LOOKS) counts[l] = 0;
    let stainN = 0;
    for (const s of lastSamples) {
      const im = sampleIM[s.look]; if (!im || counts[s.look] >= SAMPLE_MAX) continue;
      const size = sampleSize(s.id), h = hashId(s.id + 'r');
      let place = null;
      const o = sampleOverride ? sampleOverride(s.id) : null;
      if (o) place = sPos.copy(o);
      else if (s.at === 'ground') place = sPos.set(s.x, height(s.x, s.z) + size * 0.3, s.z);
      else if (s.at === 'tray' && rover.userData.cups[s.slot]) { rover.userData.cups[s.slot].getWorldPosition(sPos); sPos.y += 0.09; place = sPos; }
      if (!place) continue;
      sE.set(h * 0.6, h * 6.28, (h - 0.5) * 0.5);
      sM.compose(place, sQ.setFromEuler(sE), sS.setScalar(s.at === 'tray' && !o ? Math.min(size, 0.13) : size));
      im.setMatrixAt(counts[s.look]++, sM);
      if (s.look === 'ochre-beads' && s.at === 'ground' && !o) {
        normalAt(s.x, s.z, nrm); sQ.setFromUnitVectors(UPV, nrm);
        sM.compose(sPos.set(s.x, height(s.x, s.z) + 0.01, s.z), sQ, sS.setScalar(1 + h));
        stains.setMatrixAt(stainN++, sM);
      }
    }
    for (const l of LOOKS) { sampleIM[l].count = counts[l]; sampleIM[l].instanceMatrix.needsUpdate = true; }
    stains.count = stainN; stains.instanceMatrix.needsUpdate = true;
  }

  // ---------- astronaut figure, shown in the rover camera: it walks, crouches and reaches (client/avatar.js) ----------
  const figure = buildAvatar(THREE, { shadows, ground: (x, z) => groundAt(x, z) });
  const avatar = figure.group;
  avatar.visible = false;
  scene.add(avatar);

  // The Scenery group stays (the astronaut page counts it as outdoors); nothing decorative is in it now.
  const props = new THREE.Group(); props.name = 'Scenery';
  scene.add(props);

  return {
    rover, rovers, avatar, figure, sun, height, hab, port, follow, normalAt, ground: groundAt, // ground(x, z): the height of the ground as drawn
    // Handles for the astronaut's hands (stations.js). Vectors are local to their fixture group.
    doors,
    fixtures: { dustCells, dust, crack, crackPts, wheel: rover.userData.wheel, hub: rover.userData.hub,
      wheels: Object.fromEntries(Object.entries(rovers).map(([id, r]) => [id, { wheel: r.userData.wheel, hub: r.userData.hub }])),
      rail: rover.userData.rail, grip: rover.userData.grip, plate: rover.userData.plate, cups: rover.userData.cups, portMouth: port.userData.mouth },
    // A puff of dust kicked up at a point (boots landing, a rock picked up).
    puff(p, n = 10, speed = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; kick(p.x, p.y + 0.05, p.z, Math.cos(a) * speed * Math.random(), 0.3 + Math.random() * speed, Math.sin(a) * speed * Math.random()); } },
    // Where a sample in a hand (or falling) is drawn: (id) => world position, or null to leave it to the server's word.
    set sampleOverride(fn) { sampleOverride = fn; },
    redrawSamples() { drawSamples(lastSamples); },
    drawSamples,
    // Call every frame.
    update(time) {
      const dt = Math.min(0.1, Math.max(0, time - dustT)); dustT = time;
      stepDust(dt);
      dust.update(dt, time);
      // The port's lid drops shut on each banked sample, and opens again; its lamp says FOUND or DUD.
      { const u = port.userData, closed = time < u.flashUntil - 1.6; u.hinge.rotation.x += ((closed ? 0 : -1.25) - u.hinge.rotation.x) * Math.min(1, dt * 14);
        u.lamp.material.color.setHex(time < u.flashUntil ? (u.flash === 'dud' ? PAL.hex.amber : PAL.hex.green) : PAL.hex.greenOff); }
      earth.userData.clouds.rotation.y = time * 0.004;
      if (hab.userData.turntable) hab.userData.turntable.rotation.y = Math.sin(time * 0.05) * 0.4; // a tracking antenna, slowly hunting
    },
    // Show what the server says is physically out there (Game.scene()). The astronaut and the rover
    // camera both call this, so they see the same broken things.
    apply(s, time) {
      const blink = Math.floor(time * 4) % 2 === 0;

      // The habitat's own power shows from outside: in a blackout the floodlight is off and the windows are dark.
      floods.forEach(f => { f.intensity = s.dark ? 0 : 25; });
      warmGlow.color.setHex(s.dark ? 0x120d05 : 0xe8b872);
      windowGlow.color.setHex(s.dark ? 0x120d05 : 0xe8b872);

      // Dust: the brushed cells' leftovers slump off the panel (client/dust.js).
      dust.apply(s.dust);

      // Rover wheels: 0 fine, 1 broken and hanging off, 2 pulled off and lying beside the rover.
      for (const [id, r] of Object.entries(rovers)) {
        const state = s.wheels ? s.wheels[id] || 0 : 0, w = r.userData.wheel, rest = r.userData.wheelRest, broken = state > 0;
        if (!w.userData.held) {
          if (state === 0) { w.position.copy(rest); w.rotation.set(0, 0, 0); }
          if (state === 1) { w.position.set(rest.x + 0.12, rest.y - 0.07, rest.z); w.rotation.set(0, 0.25, -0.5); }
          if (state === 2) { w.position.set(rest.x + 0.9, 0.1, rest.z - 0.25); w.rotation.set(0, 0, -Math.PI / 2); }
        }
        r.userData.warn.visible = broken && blink;
        // The hazard light flashes fast while the rover is stuck.
        r.userData.beacon.material.color.setHex((broken ? Math.floor(time * 6) % 2 : Math.floor(time * 2 + (id === 'scout' ? 0.5 : 0)) % 2) ? PAL.hex.amber : PAL.hex.amberOff);
      }
      // The port's counter, and a flash for each new assay.
      if (s.port) {
        drawPort(s.port.banked, s.port.wanted);
        const a = s.port.assay, u = port.userData;
        if (a && a.n !== u.lastN) { if (u.lastN) { u.flash = a.kind === 'dud' ? 'dud' : 'found'; u.flashUntil = time + 3; } u.lastN = a.n; }
      }
      drawSamples(s.samples);

      // Hull crack, weld beads and the vapour jet.
      crack.visible = !!s.hull;
      if (s.hull) {
        if (crack.userData.spot !== s.hull.spot) { crack.userData.spot = s.hull.spot; crack.userData.place(s.hull.spot); }
        // Welded: a bright bead. Not yet: dark, glowing redder the longer the torch has been on it.
        const heat = crack.userData.heat || [];
        beads.forEach((b, i) => { if (s.hull.welded[i]) b.material.color.setHex(0x7a6a58); else b.material.color.setRGB(0.04 + 0.96 * (heat[i] || 0), 0.04 + 0.25 * (heat[i] || 0), 0.04); b.scale.setScalar(s.hull.welded[i] ? 1 : 1 + 0.5 * (heat[i] || 0)); });
        const open = s.hull.welded.filter(x => !x).length / CRACK_POINTS;
        vapour.forEach((v, i) => {
          const u = (time * 1.3 + i / vapour.length) % 1;
          v.visible = i / vapour.length < open;
          // A thin jet, half a metre long: enough to see where the air is going, not a cloud in the welder's face.
          v.position.copy(crack.userData.centre).addScaledVector(crack.userData.normal, 0.03 + u * 0.5);
          v.position.y += Math.sin(i * 2.4) * 0.05 * u + 0.12 * u * u; v.position.x += Math.cos(i * 1.7) * 0.04 * u;
          v.scale.setScalar(0.25 + u * 0.9);
        });
      }

      // Meteors. Each one falls for the first part of its cycle, then its dust cloud spreads.
      // The first few seconds land far out, then they walk in on the base.
      meteors.forEach((m, i) => {
        if (s.meteor === null || s.meteor < 0) { m.streak.visible = m.burst.visible = false; return; }
        const len = 0.9 + i * 0.06, at = s.meteor + i * 0.31, k = Math.floor(at / len), u = at / len - k;
        const close = s.meteor > CFG.meteorGraceSeconds;
        const a = hash(i, k) * Math.PI * 2, r = close ? 5 + hash(k, i + 9) * 20 : 45 + hash(k, i + 9) * 50;
        const tx = Math.cos(a) * r, tz = Math.sin(a) * r, ty = close ? 0 : height(tx, tz);
        m.streak.visible = u < 0.55;
        if (m.streak.visible) m.streak.position.set(tx, ty, tz).addScaledVector(m.fall, -(0.55 - u) * 130);
        m.burst.visible = u >= 0.55;
        if (m.burst.visible) {
          const v = (u - 0.55) / 0.45;
          m.burst.position.set(tx, ty, tz);
          m.burst.scale.setScalar((close ? 0.4 : 2) + v * (close ? 1.6 : 9));
          m.burst.material.opacity = (1 - v) * 0.7;
        }
      });
    },
    // Ease a rover toward the server's position, sat on the ground and tipped to its slope (drawing only).
    moveRover(r, k = 0.2, id = 'hauler') {
      const g = rovers[id]; if (!g || !r) return;
      g.position.x += (r.x - g.position.x) * k;
      g.position.z += (r.z - g.position.z) * k;
      let d = r.ry - g.userData.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.userData.yaw += d * k;
      g.userData.v = r.v || 0;
      g.position.y = height(g.position.x, g.position.z);
      normalAt(g.position.x, g.position.z, nrm);
      g.quaternion.setFromUnitVectors(UPV, nrm).multiply(sQ.setFromAxisAngle(UPV, g.userData.yaw));
    },
    moveRovers(rs, k = 0.2) { if (!rs) return; for (const id in rovers) if (rs[id]) this.moveRover(rs[id], k, id); },
  };
}
