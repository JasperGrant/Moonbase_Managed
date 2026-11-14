// The Moon base scene. Shared by the astronaut (VR) and the Technician's rover camera, so both
// see the same place. Everything is procedural: terrain, rocks, textures, Earth, stars. Nothing
// is downloaded, so the page works offline and on Cloudflare as is. Swap in real models here
// later without touching the game logic.
import { CFG, STATIONS } from '/shared/config.js';

export const SUN_DIR = [-0.912, 0.143, 0.391]; // unit vector toward the sun: low in the sky, as at the lunar south pole

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

  scene.background = new THREE.Color(0x000000);

  // ---------- light ----------
  // Harsh sunlight, near-black shadows, a whisper of earthshine. There is no sky to scatter light.
  const sun = new THREE.DirectionalLight(0xfff3e2, 3.4);
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
  scene.add(new THREE.HemisphereLight(0x8fa6d6, 0x1a1916, 0.22));

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
  const regolith = canvasTexture(THREE, 512, 512, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = N.fbm(x / 64, y / 64, 0.5, 5, 8), fine = N.noise3(x / 6, y / 6, 3.1, 86);
      let v = 150 + n * 70 + fine * 14;
      const sp = N.noise3(x / 2.3, y / 2.3, 9.7, 223);
      if (sp > 0.62) v += 60; else if (sp < -0.66) v -= 50; // glassy specks and dark grains
      const i = (y * w + x) * 4; d[i] = v + 2; d[i + 1] = v; d[i + 2] = v - 4; d[i + 3] = 255;
    }
  }, { repeat: 90 });
  const regolithBump = canvasTexture(THREE, 256, 256, (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = 128 + N.fbm(x / 12, y / 12, 1.5, 4, 22) * 110;
      const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }, { repeat: 400, srgb: false });
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
  const solarTex = canvasTexture(THREE, 256, 256, (d, w, h) => { // photovoltaic cells behind a silver grid
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = x % 32, cy = y % 32, i = (y * w + x) * 4;
      if (cx < 2 || cy < 2) { d[i] = d[i + 1] = d[i + 2] = 190; }
      else { const t = (cx + cy) / 64; d[i] = 14 + t * 20; d[i + 1] = 26 + t * 30; d[i + 2] = 92 + t * 70; if (cx % 8 === 5) { d[i] += 30; d[i + 1] += 30; d[i + 2] += 30; } }
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
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.12, 'rgba(255,250,235,1)'); grd.addColorStop(0.2, 'rgba(255,235,200,0.55)'); grd.addColorStop(0.5, 'rgba(255,220,170,0.12)'); grd.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });

  // ---------- materials ----------
  const regolithMat = new THREE.MeshStandardMaterial({ map: regolith, bumpMap: regolithBump, bumpScale: 0.35, roughness: 1, metalness: 0, vertexColors: true });
  const rockMat = new THREE.MeshStandardMaterial({ map: regolith, bumpMap: regolithBump, bumpScale: 0.5, roughness: 0.95, color: 0xb9b5ad });
  const white = new THREE.MeshStandardMaterial({ map: panelTex, color: 0xf5f2ec, roughness: 0.5, metalness: 0.15 });
  const whitePlain = new THREE.MeshStandardMaterial({ color: 0xeeebe4, roughness: 0.6, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe3b24d, metalness: 1, roughness: 0.32, bumpMap: foilBump, bumpScale: 0.6 });
  const silverFoil = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, metalness: 1, roughness: 0.35, bumpMap: foilBump, bumpScale: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.6, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.8, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.9 });
  const solar = new THREE.MeshStandardMaterial({ map: solarTex, roughness: 0.22, metalness: 0.55 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xf0b63a, metalness: 1, roughness: 0.06 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xd9662b, roughness: 0.6 });
  const warmGlow = new THREE.MeshBasicMaterial({ color: 0xffc46b, toneMapped: false });

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
  // Flat and swept around the base (the play area), craters and boulder fields beyond it, and a
  // mountain rim on the horizon, kept low toward the sun and Earth so neither is hidden.
  const craters = [];
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * rnd() * 260;
    const R = r < 60 ? 2 + rnd() * 7 : 4 + rnd() * rnd() * 40;
    craters.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, R, depth: R * (0.12 + rnd() * 0.1) });
  }
  const ramp = (v, a, b) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  function height(x, z) {
    const r = Math.hypot(x, z);
    const far = ramp(r, 15, 26);
    let h = far * (2.4 * N.fbm(x * 0.03, z * 0.03, 0, 4) + 0.9 * N.fbm(x * 0.11, z * 0.11, 1, 3) + 0.9);
    h += (0.05 + far * 0.25) * N.fbm(x * 0.6, z * 0.6, 2, 3);
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z) / c.R;
      if (d > 1.7) continue;
      const bowl = d < 1 ? c.depth * (d * d - 1) : 0;
      const rim = c.depth * 0.32 * Math.exp(-(((d - 1) / 0.28) ** 2));
      h += (bowl + rim) * far;
    }
    if (r > 95) {
      const dir = [x / r, z / r];
      const shade = (1 - 0.85 * Math.max(0, dir[0] * -0.92 + dir[1] * 0.39)) * (1 - 0.7 * Math.max(0, dir[0] * 0.21 + dir[1] * -0.98));
      h += ramp(r, 95, 230) * shade * (26 * (N.fbm(x * 0.006, z * 0.006, 3, 4) + 0.55) + 7 * Math.abs(N.fbm(x * 0.02, z * 0.02, 4, 3)));
    }
    return h;
  }
  const SIZE = 640, SEG = 230;
  const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const gp = groundGeo.attributes.position, col = new Float32Array(gp.count * 3), uv = groundGeo.attributes.uv;
    for (let i = 0; i < gp.count; i++) {
      // Denser vertices near the base: remap the regular grid with a power curve.
      const u = gp.getX(i) / (SIZE / 2), v = gp.getZ(i) / (SIZE / 2);
      const x = Math.sign(u) * Math.pow(Math.abs(u), 1.75) * (SIZE / 2), z = Math.sign(v) * Math.pow(Math.abs(v), 1.75) * (SIZE / 2);
      const h = height(x, z);
      gp.setXYZ(i, x, h, z);
      uv.setXY(i, x / SIZE + 0.5, z / SIZE + 0.5);
      // Vertex colour breaks up texture tiling: broad bright/dark patches, darker crater floors.
      const tone = 0.86 + 0.18 * N.fbm(x * 0.02 + 40, z * 0.02, 5, 3) + 0.06 * N.fbm(x * 0.15, z * 0.15, 6, 2);
      col[i * 3] = tone; col[i * 3 + 1] = tone; col[i * 3 + 2] = tone * 0.985;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, regolithMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- rocks ----------
  // Two shapes (jagged, rounded), each displaced by noise, instanced many times.
  const keepClear = (x, z, m) => Math.hypot(x, z) > 4.5 + m && Object.values(STATIONS).every(s => Math.hypot(x - s.x, z - s.z) > 2.8 + m) && Math.hypot(x - 4, z - 9) > 2.5 + m && Math.hypot(x - CFG.spawn.x, z - CFG.spawn.z) > 2 + m;
  function rockGeo(detail, amp, seed) {
    // Icosahedron geometry is unindexed (flat shaded); weld shared vertices first so normals smooth.
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
    const p = g.attributes.position, v = new THREE.Vector3(), uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = N.fbm(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6, 3) + 0.35 * N.fbm(v.x * 5 + seed, v.y * 5, v.z * 5, 2);
      uv[i * 2] = Math.atan2(v.z, v.x) / Math.PI; uv[i * 2 + 1] = v.y;
      v.multiplyScalar(1 + n * amp).multiply(new THREE.Vector3(1, 0.72, 1));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), c3 = new THREE.Color();
  function scatter(geo, count, rMin, rMax, sMin, sMax, bury) {
    const im = new THREE.InstancedMesh(geo, rockMat, count);
    for (let i = 0; i < count; i++) {
      let x, z, s;
      do { const a = rnd() * Math.PI * 2, r = rMin + Math.pow(rnd(), 1.4) * (rMax - rMin); x = Math.cos(a) * r; z = Math.sin(a) * r; s = sMin + rnd() * rnd() * (sMax - sMin); } while (!keepClear(x, z, s) || (s > 0.6 && Math.hypot(x, z) < CFG.bounds + 1)); // nothing you could walk through inside the play area
      e.set(rnd() * 0.5, rnd() * Math.PI * 2, rnd() * 0.5);
      m4.compose(v3.set(x, height(x, z) + s * (0.55 - bury), z), q.setFromEuler(e), sc.set(s * (0.8 + rnd() * 0.5), s, s * (0.8 + rnd() * 0.5)));
      im.setMatrixAt(i, m4);
      const t = 0.75 + rnd() * 0.4;
      im.setColorAt(i, c3.setRGB(t, t * (0.98 + rnd() * 0.03), t * 0.95));
    }
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  const jagged = rockGeo(3, 0.4, 3), rounded = rockGeo(2, 0.22, 11);
  scatter(jagged, 70, 6, 120, 0.3, 2.6, 0.25);
  scatter(rounded, 90, 5, 90, 0.25, 1.6, 0.3);
  scatter(rounded, 500, 2.5, 60, 0.05, 0.3, 0.2);

  // ---------- sky ----------
  {
    // Stars with their own size and colour, denser along a tilted Milky Way band.
    const COUNT = 5000, pos = new Float32Array(COUNT * 3), size = new Float32Array(COUNT), col = new Float32Array(COUNT * 3);
    const bandN = new THREE.Vector3(0.35, 0.82, 0.45).normalize();
    for (let i = 0; i < COUNT; i++) {
      let v;
      if (i < COUNT * 0.6) { // band star: near the great circle perpendicular to bandN
        const a = rnd() * Math.PI * 2, off = (rnd() + rnd() + rnd() - 1.5) * 0.22;
        const t1 = new THREE.Vector3(1, 0, 0).cross(bandN).normalize(), t2 = bandN.clone().cross(t1);
        v = t1.multiplyScalar(Math.cos(a)).add(t2.multiplyScalar(Math.sin(a))).add(bandN.clone().multiplyScalar(off)).normalize();
      } else {
        const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
        v = new THREE.Vector3(rr * Math.cos(a), u, rr * Math.sin(a));
      }
      if (v.y < 0.01) v.y = 0.01 + rnd() * 0.05;
      pos.set([v.x * 1500, v.y * 1500, v.z * 1500], i * 3);
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
    disc.position.copy(sunDir).multiplyScalar(1400); disc.scale.setScalar(190);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.55 }));
    glow.position.copy(disc.position); glow.scale.setScalar(900);
    scene.add(disc, glow);
  }

  // Earth, low over the northern horizon: continents, clouds, a sunlit atmosphere rim, and the
  // same sun lighting it, so it shows a phase.
  const earth = new THREE.Group();
  earth.position.set(140, 118, -640);
  {
    const R = 34;
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

  // ---------- the habitat ----------
  const hab = new THREE.Group();
  {
    mesh(new THREE.CylinderGeometry(2.7, 2.8, 0.5, 24), dark, 0, 0.25, 0, hab);                 // footing ring
    const skirt = mesh(new THREE.CylinderGeometry(2.55, 2.6, 0.9, 24), gold, 0, 0.95, 0, hab);  // insulated lower band
    skirt.material.map = null;
    mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.0, 24), white, 0, 1.9, 0, hab);
    const dome = mesh(new THREE.SphereGeometry(2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 2.4, 0, hab);
    dome.material = new THREE.MeshStandardMaterial({ map: panelTex, color: 0xf5f2ec, roughness: 0.5, metalness: 0.15 });
    dome.material.map = panelTex.clone(); dome.material.map.repeat.set(6, 2); dome.material.map.needsUpdate = true;
    for (let i = 0; i < 12; i++) { // ribs
      const a = (i / 12) * Math.PI * 2;
      const rib = mesh(new THREE.BoxGeometry(0.08, 1.1, 0.1), steel, Math.cos(a) * 2.52, 1.9, Math.sin(a) * 2.52, hab);
      rib.rotation.y = -a;
    }
    mesh(new THREE.TorusGeometry(2.52, 0.05, 8, 48), steel, 0, 2.42, 0, hab).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(2.52, 0.05, 8, 48), steel, 0, 1.42, 0, hab).rotation.x = Math.PI / 2;
    // Airlock, facing the spawn point, with a round hatch window and a floodlight over the door
    mesh(new THREE.BoxGeometry(1.6, 2.3, 1.3), white, 0, 1.15, 2.6, hab);
    mesh(new THREE.BoxGeometry(1.1, 1.8, 0.08), grey, 0, 1.05, 3.26, hab);                      // hatch
    mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 24), steel, 0, 1.5, 3.31, hab);                 // porthole frame
    mesh(new THREE.CircleGeometry(0.24, 24), warmGlow, 0, 1.5, 3.31, hab);
    mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 20), steel, 0, 1.0, 3.33, hab).rotation.y = 0;   // hatch wheel
    tube(steel, [-0.7, 0.6, 3.3], [-0.7, 1.9, 3.3], 0.025, hab); tube(steel, [0.7, 0.6, 3.3], [0.7, 1.9, 3.3], 0.025, hab); // handrails
    mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), dark, 0, 2.4, 3.3, hab);
    mesh(new THREE.CircleGeometry(0.06, 12), warmGlow, 0, 2.34, 3.4, hab).rotation.x = -Math.PI / 2;
    const flood = new THREE.SpotLight(0xffd9a8, 25, 12, 0.7, 0.6, 1.2);
    flood.position.set(0, 2.4, 3.35); flood.target.position.set(0, 0, 6);
    hab.add(flood, flood.target);
    hab.userData.flood = flood;
    hab.userData.windows = [];
    // Steps, radiators, mast with a dish, two lit windows, a conduit around the base
    mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), grey, 0, 0.09, 3.5, hab);
    mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), grey, 0, 0.27, 3.15, hab);
    for (const s of [-1, 1]) { const rad = mesh(new THREE.BoxGeometry(1.6, 0.04, 0.9), whitePlain, s * 0.9, 4.8, -0.9, hab); rad.rotation.z = s * 0.32; rad.rotation.x = 0.34; }
    tube(steel, [1.2, 2.0, 0], [1.2, 6.4, 0], 0.035, hab);
    const dish = mesh(new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => new THREE.Vector2(i * 0.05, (i * 0.05) ** 2 * 0.5)), 24), whitePlain, 1.2, 6.5, 0, hab);
    dish.lookAt(new THREE.Vector3(140, 118, -640).add(hab.position)); dish.rotateX(-Math.PI / 2 + 0.6);
    for (const a of [1.1, -1.1]) { // two lit windows with frames
      const f = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.06), dark, Math.sin(a) * 2.5, 2.0, Math.cos(a) * 2.5, hab); f.lookAt(new THREE.Vector3(Math.sin(a) * 6, 2.0, Math.cos(a) * 6));
      const w = mesh(new THREE.BoxGeometry(0.64, 0.34, 0.05), new THREE.MeshBasicMaterial({ color: 0xffbf6a, toneMapped: false }), Math.sin(a) * 2.52, 2.0, Math.cos(a) * 2.52, hab); w.lookAt(new THREE.Vector3(Math.sin(a) * 6, 2.0, Math.cos(a) * 6));
      hab.userData.windows.push(w.material);
    }
    mesh(new THREE.TorusGeometry(2.72, 0.04, 8, 48), dark, 0, 0.55, 0, hab).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { // legs with footpads, the module sits on them
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      tube(steel, [Math.cos(a) * 2.4, 0.5, Math.sin(a) * 2.4], [Math.cos(a) * 3.3, 0.05, Math.sin(a) * 3.3], 0.05, hab);
      mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.1, 12), grey, Math.cos(a) * 3.3, 0.05, Math.sin(a) * 3.3, hab);
    }
  }
  scene.add(hab);

  // ---------- solar farm, angled to the sun ----------
  for (let i = 0; i < 6; i++) {
    const x = 8 + (i % 3) * 3.2, z = 10 + Math.floor(i / 3) * 3.2;
    const base = mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.2, 10), dark, x, 0.1, z);
    tube(steel, [x, 0.2, z], [x, 1.6, z], 0.06);
    const panel = new THREE.Group(); panel.position.set(x, 1.7, z);
    mesh(new THREE.BoxGeometry(2.6, 1.5, 0.06), solar, 0, 0, 0, panel);
    mesh(new THREE.BoxGeometry(2.7, 1.6, 0.03), steel, 0, 0, -0.03, panel);
    panel.lookAt(panel.position.clone().add(sunDir));
    scene.add(panel);
    base.receiveShadow = true;
  }

  // ---------- stations: one group per minigame. Local +z is the side the astronaut stands on. ----------
  const stations = {}, alarms = {};
  for (const [key, st] of Object.entries(STATIONS)) {
    const g = new THREE.Group();
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.ry;
    scene.add(g);
    stations[key] = g;
    tube(steel, [0.85, 0, -0.1], [0.85, 2.4, -0.1], 0.03, g);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1c3a22, toneMapped: false }));
    lamp.position.set(0.85, 2.45, -0.1);
    g.add(lamp);
    alarms[key] = lamp;
    mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.08, 16), dark, 0, 0.04, -1.2, g).receiveShadow = true; // concrete-ish pad
  }
  // Fuel depot: two insulated tanks on cradles, plumbing, a valve wheel
  for (const y of [0.75, 2.05]) {
    const st = stations.wires;
    const t = mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.6, 24), whitePlain, 0, y, -1.7, st); t.rotation.z = Math.PI / 2;
    for (const dx of [-1.0, 1.0]) { const band = mesh(new THREE.CylinderGeometry(0.63, 0.63, 0.2, 24), orange, dx, y, -1.7, st); band.rotation.z = Math.PI / 2; }
    for (const dx of [-1.3, 1.3]) { const cap = mesh(new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), whitePlain, dx, y, -1.7, st); cap.rotation.z = dx > 0 ? -Math.PI / 2 : Math.PI / 2; }
  }
  for (const dx of [-1.0, 1.0]) { // frame
    tube(steel, [dx, 0, -1.1], [dx, 2.1, -1.1], 0.04, stations.wires); tube(steel, [dx, 0, -2.3], [dx, 2.1, -2.3], 0.04, stations.wires);
    tube(steel, [dx, 1.4, -1.1], [dx, 1.4, -2.3], 0.04, stations.wires); tube(steel, [dx, 2.1, -1.1], [dx, 2.1, -2.3], 0.04, stations.wires);
  }
  tube(steel, [0.9, 1.4, -1.1], [0.6, 1.4, -0.3], 0.05, stations.wires); // feed line to the panel
  tube(steel, [1.9, 0.75, -1.7], [1.9, 2.05, -1.7], 0.05, stations.wires);
  mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20), orange, 1.0, 1.4, -0.7, stations.wires).rotation.z = Math.PI / 2;
  // Comms dish: a true parabola on a yoke, feed on a tripod, pointed at Earth
  {
    const st = stations.freq;
    mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.3, 12), dark, 0, 0.15, -1.6, st);
    tube(steel, [0, 0.3, -1.6], [0, 2.6, -1.6], 0.09, st);
    const yoke = new THREE.Group(); yoke.position.set(0, 2.8, -1.6); st.add(yoke);
    const dish = mesh(new THREE.LatheGeometry(Array.from({ length: 13 }, (_, i) => new THREE.Vector2(i * 0.1, (i * 0.1) ** 2 * 0.2)), 40), whitePlain, 0, 0, 0, yoke);
    dish.material = new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) { // ribs on the back, so it reads as a dish from behind
      const a = (i / 8) * Math.PI * 2;
      tube(steel, [0, -0.08, 0], [Math.cos(a) * 1.18, 1.18 * 1.18 * 0.2 - 0.04, Math.sin(a) * 1.18], 0.02, yoke);
    }
    mesh(new THREE.TorusGeometry(1.2, 0.025, 8, 40), steel, 0, 1.2 * 1.2 * 0.2, 0, yoke).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; tube(steel, [Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1], [0, 1.5, 0], 0.015, yoke); } // feed on its tripod, near the focus
    mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.25, 10), dark, 0, 1.55, 0, yoke);
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 12), grey, 0, -0.1, 0, yoke);
    const toEarth = st.worldToLocal(new THREE.Vector3(140, 118, -640)).sub(yoke.position).normalize();
    yoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toEarth);
  }
  // Drill rig: tripod with winch, drill string, cuttings pile
  {
    const st = stations.drill;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      tube(steel, [Math.sin(a) * 1.3, 0, -1.8 + Math.cos(a) * 1.3], [0, 4.2, -1.8], 0.05, st);
      mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.06, 10), grey, Math.sin(a) * 1.3, 0.03, -1.8 + Math.cos(a) * 1.3, st);
    }
    mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), gold, 0, 4.3, -1.8, st);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 10), steel, 0, 1.9, -1.8, st);
    mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 12), dark, 0, 0.25, -1.8, st);
    const pile = mesh(new THREE.ConeGeometry(0.9, 0.45, 14), rockMat, 0.9, 0.2, -2.4, st); pile.scale.z = 0.7;
    mesh(new THREE.BoxGeometry(0.9, 0.6, 0.5), grey, -1.3, 0.3, -1.0, st); // generator box
    tube(dark, [-1.3, 0.6, -1.0], [0, 4.0, -1.8], 0.015, st);
  }
  // Airlock terminal: pedestal with a conduit back to the habitat
  mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), grey, 0, 0.25, -0.3, stations.patch);
  tube(dark, [0, 0.1, -0.5], [-1.2, 0.1, -1.3], 0.02, stations.patch);

  // ---------- rover (model faces +z). Its lights are what the astronaut follows in the dark. ----------
  const rover = new THREE.Group();
  {
    mesh(new THREE.BoxGeometry(1.5, 0.12, 2.4), whitePlain, 0, 0.62, 0, rover);                   // chassis floor
    mesh(new THREE.BoxGeometry(1.5, 0.3, 0.4), gold, 0, 0.83, -1.0, rover);                       // aft equipment bay
    mesh(new THREE.BoxGeometry(1.1, 0.5, 0.7), gold, 0, 0.93, -0.35, rover);
    for (const x of [-0.45, 0.45]) { mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), dark, x, 0.72, 0.5, rover); mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), dark, x, 1.0, 0.25, rover); } // seats
    mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), dark, 0, 1.05, 0.95, rover);                       // console
    mesh(new THREE.BoxGeometry(0.3, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: 0x58e08a, toneMapped: false }), 0, 1.08, 0.98, rover);
    tube(steel, [0, 0.9, 0.95], [0, 1.3, 1.1], 0.02, rover);                                        // hand controller stalk
    for (const [x, z] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) {
      const w = mesh(new THREE.TorusGeometry(0.32, 0.09, 10, 24), dark, x, 0.4, z, rover); w.rotation.y = Math.PI / 2; // wire-mesh wheel
      const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), steel, x, 0.4, z, rover); hub.rotation.z = Math.PI / 2;
      for (let i = 0; i < 6; i++) { const sp = tube(steel, [x, 0.4, z], [x, 0.4 + Math.cos(i) * 0.3, z + Math.sin(i) * 0.3], 0.012, rover); sp.castShadow = false; }
      const fender = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.26, 12, 1, true, 0, Math.PI), orange, x, 0.42, z, rover); fender.rotation.z = Math.PI / 2; fender.material = new THREE.MeshStandardMaterial({ color: 0xd9662b, roughness: 0.6, side: THREE.DoubleSide });
      tube(steel, [x * 0.6, 0.6, z], [x, 0.4, z], 0.03, rover);
    }
    tube(steel, [0.5, 1.1, -1.0], [0.5, 2.2, -1.0], 0.025, rover);
    const lrvDish = mesh(new THREE.LatheGeometry(Array.from({ length: 8 }, (_, i) => new THREE.Vector2(i * 0.05, (i * 0.05) ** 2 * 0.6)), 16), silverFoil, 0.5, 2.25, -1.0, rover);
    lrvDish.rotation.x = -0.9;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false }));
    beacon.position.set(-0.5, 1.7, -1.0); rover.add(beacon);
    tube(steel, [-0.5, 1.1, -1.0], [-0.5, 1.65, -1.0], 0.02, rover);
    rover.userData.beacon = beacon;
    for (const x of [-0.5, 0.5]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xffffee, toneMapped: false }));
      h.position.set(x, 0.8, 1.22); h.rotation.x = Math.PI / 2; rover.add(h);
    }
    const head = new THREE.SpotLight(0xfff6e8, 30, 18, 0.55, 0.6, 1.2);
    head.position.set(0, 0.9, 1.2); head.target.position.set(0, 0.2, 7);
    rover.add(head, head.target);
    rover.position.set(4, 0, 9);
  }
  scene.add(rover);

  // ---------- a lander on the horizon, with its flag ----------
  {
    const L = new THREE.Group(); L.position.set(-30, height(-30, -34), -34); L.rotation.y = 0.6;
    mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.7, 8), gold, 0, 1.9, 0, L);
    mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.3, 8), dark, 0, 2.9, 0, L);
    mesh(new THREE.BoxGeometry(2.6, 2.1, 2.4), silverFoil, 0, 4.0, 0, L);
    mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.2, 12), grey, 0, 0.6, 0, L); // engine bell
    for (const [x, z] of [[-0.6, 1.21], [0.6, 1.21]]) mesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), dark, x, 4.3, z, L);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, fx = Math.cos(a) * 4.2, fz = Math.sin(a) * 4.2;
      tube(gold, [Math.cos(a) * 2.1, 1.3, Math.sin(a) * 2.1], [fx, 0.1, fz], 0.1, L);
      tube(steel, [Math.cos(a) * 2.1, 2.4, Math.sin(a) * 2.1], [fx * 0.75, 0.6, fz * 0.75], 0.04, L);
      mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.15, 12), gold, fx, 0.08, fz, L);
    }
    for (let i = 0; i < 8; i++) tube(steel, [0.9, 0.3 + i * 0.4, 2.1 + i * 0.12], [1.5, 0.3 + i * 0.4, 2.1 + i * 0.12], 0.015, L); // ladder
    scene.add(L);
    const F = new THREE.Group(); F.position.set(-24, height(-24, -28), -28);
    tube(steel, [0, 0, 0], [0, 2.4, 0], 0.02, F);
    tube(steel, [0, 2.38, 0], [1.1, 2.38, 0], 0.012, F);
    const flagTex = canvasTexture(THREE, 128, 80, (d, w, h, g) => { g.fillStyle = '#e8ecf4'; g.fillRect(0, 0, w, h); g.fillStyle = '#1f3f8f'; g.fillRect(0, 0, w, 24); g.fillRect(0, 56, w, 24); g.fillStyle = '#d9662b'; g.beginPath(); g.arc(64, 40, 12, 0, 7); g.fill(); });
    const flag = mesh(new THREE.PlaneGeometry(1.0, 0.65), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }), 0.55, 2.05, 0, F);
    flag.rotation.y = -Math.PI / 2; flag.rotation.y = 0;
    scene.add(F);
  }

  // ---------- astronaut figure, shown in the rover camera ----------
  const avatar = new THREE.Group();
  {
    mesh(new THREE.CapsuleGeometry(0.27, 0.7, 4, 12), whitePlain, 0, 1.0, 0, avatar);
    for (const s of [-1, 1]) { mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), whitePlain, s * 0.36, 1.1, 0, avatar).rotation.z = s * 0.25; mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), whitePlain, s * 0.15, 0.4, 0, avatar); }
    mesh(new THREE.SphereGeometry(0.25, 16, 12), whitePlain, 0, 1.72, 0, avatar);
    mesh(new THREE.SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), visor, 0, 1.72, 0.1, avatar).rotation.x = Math.PI / 2 - 0.3;
    mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), whitePlain, 0, 1.2, -0.32, avatar);
    mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0x58e08a, toneMapped: false }), 0, 1.25, 0.29, avatar);
    mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), orange, 0, 1.55, -0.5, avatar);
  }
  avatar.visible = false;
  scene.add(avatar);

  return {
    stations, rover, avatar, sun, height,
    // Call every frame. `live` is the list of station keys with an active alarm.
    update(time, live = []) {
      const blink = Math.floor(time * 4) % 2 === 0;
      for (const key in alarms) alarms[key].material.color.setHex(live.includes(key) ? (blink ? 0xff2a2a : 0x4a0b0b) : 0x1c3a22);
      rover.userData.beacon.material.color.setHex(Math.floor(time * 2) % 2 ? 0xffb030 : 0x4a3008);
      earth.userData.clouds.rotation.y = time * 0.004;
      // A power outage shows from outside: the floodlight and the lit windows go dark, then dim red.
      const outage = live.includes('power');
      hab.userData.flood.intensity = outage ? 0 : 25;
      warmGlow.color.setHex(outage ? 0x3a0c06 : 0xffc46b);
      for (const m of hab.userData.windows) m.color.setHex(outage ? 0x5a1008 : 0xffbf6a);
    },
    // Ease the rover toward the server's position.
    moveRover(r, k = 0.2) {
      rover.position.x += (r.x - rover.position.x) * k;
      rover.position.z += (r.z - rover.position.z) * k;
      let d = r.ry - rover.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      rover.rotation.y += d * k;
    },
  };
}
