// The dust on the solar panels, and the brush that takes it off.
//
// The server keeps 18 cells (3 panels of 3 x 2, client/shared/config.js) and only ever hears "cell n is
// clean". What the astronaut sees is finer than that: each panel carries one dust layer, a mask on a
// small canvas, thicker toward the bottom edge where dust settles on a tilted panel, with drifts and
// clumps. The brush wipes a streaky path through it where it actually goes, its bristles leaving faint
// stripes. Once a cell has been brushed across, its share is reported, and whatever is left of the dust
// in that cell slumps down the panel and pours off the bottom edge.
//
// Grains thrown off by the brush fly in arcs under lunar gravity (there is no air to hold them up)
// and land on the regolith under the panel, where a pale patch builds up as the panel is cleaned.
//
// Budget: one plane and one 256 x 150 canvas per panel, one InstancedMesh for every grain, one ground
// patch per panel, one small lamp per panel. No lights.
import { DUST_COLS, DUST_ROWS } from '/shared/config.js';
import { PAL } from '/shared/palette.js';

const PW = 2.16, PH = 1.26;          // the dusty face of a panel, metres
const MW = 256, MH = 150;            // the mask, pixels
const PX = MW / PW;                  // pixels per metre
const CELL_W = PW / DUST_COLS, CELL_H = PH / DUST_ROWS;
const BRUSH_HALF = 0.1;              // half the width of the bristles, metres
const STREAKS = 9;                   // bristle tufts across the head: each wipes a little differently
const SWEPT = 0.12;                  // metres of brush path across a cell before it counts as brushed
const LEFT = 0.35;                   // ...or this little dust left in it
const SLUMP = 2.5;                   // seconds a brushed cell's leftovers take to slump down and off
const G = 1.62;                      // lunar gravity
const GRAINS = 160;

// A smooth random field on a small grid, for clumps and drifts. Deterministic per seed.
function field(seed, gw, gh) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const grid = Array.from({ length: (gw + 1) * (gh + 1) }, rnd);
  return (u, v) => {
    const x = u * gw, y = v * gh, x0 = Math.min(gw - 1, Math.floor(x)), y0 = Math.min(gh - 1, Math.floor(y));
    const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => grid[j * (gw + 1) + i];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

export function buildDust(THREE, { scene, panels, grainMap, ground = () => 0 }) {
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const patchMat = makePatchMat();

  // ---------- one dust layer per panel ----------
  const layers = panels.map((panel, pn) => {
    const canvas = document.createElement('canvas'); canvas.width = MW; canvas.height = MH;
    const g = canvas.getContext('2d');
    const img = g.createImageData(MW, MH);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 2;
    // The fresh layer this panel gets every time a storm settles on it: thicker low down, clumped, drifted.
    const clumps = field(91 + pn * 17, 14, 8), drifts = field(7 + pn * 31, 4, 3), grain = field(301 + pn, 64, 38);
    const fresh = new Float32Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const u = x / MW, v = y / MH; // v = 0 at the top edge
      let a = 0.58 + 0.3 * v + 0.22 * (clumps(u, v) - 0.5) + 0.3 * smooth(0.55, 0.85, drifts(u, v)) + 0.12 * (grain(u, v) - 0.5);
      a += 0.25 * smooth(0.86, 1, v); // a lip of dust along the bottom frame
      fresh[y * MW + x] = Math.max(0.35, Math.min(1, a));
    }
    const amt = new Float32Array(MW * MH); // 0 now: there is no fault at the start
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb4b0a6, map: grainMap, alphaMap: tex, bumpMap: tex, bumpScale: 1.5,
      roughness: 1, metalness: 0, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
    mesh.name = 'Dust'; mesh.position.z = 0.034; mesh.renderOrder = 2; mesh.visible = false;
    panel.add(mesh);

    // The panel's status lamp, top corner of the frame: amber, blinking, while it is dusty; green when clean.
    const lamp = new THREE.Group(); lamp.name = 'Lamp_Panel';
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 18), new THREE.MeshStandardMaterial({ color: PAL.hex.bezel, roughness: 0.4, metalness: 0.8 }));
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.hex.greenOff, toneMapped: false }));
    lens.rotation.x = Math.PI / 2;
    lamp.add(bezel, lens); lamp.position.set(PW / 2 - 0.02, PH / 2 + 0.035, 0.03);
    panel.add(lamp);

    // Where the dust lands: a pale patch on the regolith under the panel's lower edge.
    const below = panel.localToWorld(new THREE.Vector3(0, -PH / 2, 0.25));
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), patchMat.clone());
    patch.rotation.x = -Math.PI / 2; patch.rotation.z = Math.atan2(below.x - panel.position.x, below.z - panel.position.z); // its long side along the panel
    patch.position.set(below.x, ground(below.x, below.z) + 0.012, below.z);
    patch.name = 'Dust_Ground'; patch.renderOrder = 1;
    scene.add(patch);

    return { panel, canvas, g, img, tex, fresh, amt, mesh, lamp: lens, patch, dirty: true, dusty: false, slide: new Float32Array(DUST_COLS * DUST_ROWS), fallen: 0 };
  });

  // The ground patch: a soft oval of fallen dust, paler than the regolith around it.
  function makePatchMat() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 32, 4, 64, 32, 62);
    grd.addColorStop(0, 'rgba(215,208,192,0.9)'); grd.addColorStop(0.6, 'rgba(200,193,178,0.45)'); grd.addColorStop(1, 'rgba(190,183,168,0)');
    g.save(); g.scale(1, 0.5); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); g.restore();
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(225,218,202,${0.15 + (i % 5) * 0.06})`; g.fillRect((i * 37) % 112 + 8, (i * 23) % 44 + 10, 1.5, 1.5); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0, roughness: 1, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  }

  // The 18 cells the server counts: never drawn, but there to be pointed at (and found by tests).
  const ghost = new THREE.MeshBasicMaterial({ visible: false });
  const cells = [];
  layers.forEach((L, pn) => {
    for (let r = 0; r < DUST_ROWS; r++) for (let c = 0; c < DUST_COLS; c++) {
      const cell = new THREE.Mesh(new THREE.PlaneGeometry(CELL_W, CELL_H), ghost);
      cell.name = 'Dust_Cell';
      cell.position.set((c - (DUST_COLS - 1) / 2) * CELL_W, ((DUST_ROWS - 1) / 2 - r) * CELL_H, 0.036);
      cell.visible = false;
      cell.userData = { panel: pn, col: c, row: r, swept: 0 };
      L.panel.add(cell);
      cells.push(cell);
    }
  });
  const cellIndex = (pn, c, r) => pn * DUST_COLS * DUST_ROWS + r * DUST_COLS + c;
  // A cell's rectangle on the mask, in pixels.
  const cellRect = (c, r) => ({ x0: Math.round(c * CELL_W * PX), x1: Math.round((c + 1) * CELL_W * PX), y0: Math.round(r * CELL_H * PX), y1: Math.round((r + 1) * CELL_H * PX) });
  const cellLeft = (L, c, r) => {
    const R = cellRect(c, r); let sum = 0, n = 0;
    for (let y = R.y0; y < R.y1; y += 2) for (let x = R.x0; x < R.x1; x += 2) { sum += L.amt[y * MW + x]; n++; }
    return n ? sum / n : 0;
  };

  // ---------- grains in flight ----------
  const grainMat = new THREE.MeshStandardMaterial({ color: 0x8f8a7e, roughness: 1, metalness: 0, flatShading: true }); // a shade under regolith: grains are in their own shadow
  const grains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0042, 0), grainMat, GRAINS);
  grains.name = 'Dust_Grains'; grains.frustumCulled = false; grains.count = 0;
  scene.add(grains);
  const flying = Array.from({ length: GRAINS }, () => ({ live: false, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1, rest: 0, spin: 0 }));
  let nextGrain = 0, liveGrains = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), eul = new THREE.Euler();
  function throwGrain(at, vel) {
    const f = flying[nextGrain++ % GRAINS];
    f.live = true; f.p.copy(at); f.v.copy(vel); f.s = 0.6 + Math.random() * 0.9; f.rest = 0; f.spin = Math.random() * 6;
  }
  // Panel-local (x, y on the face) to world, a little off the surface.
  const toWorld = (L, x, y, out) => L.panel.localToWorld(out.set(x, y, 0.05));

  // ---------- painting the mask ----------
  // Wipe a capsule from a to b (panel-local metres, origin at the centre of the face). Each pixel under
  // the path loses a share of its dust once per call, set by the bristle tuft over it: that is what leaves
  // the stripes. Returns how much dust came off, in mask units.
  const tufts = Array.from({ length: STREAKS }, (_, i) => 0.4 + 0.6 * Math.abs(Math.sin(i * 12.9898 + 4.1)));
  function wipe(L, ax, ay, bx, by, strength) {
    // to pixels: x right, y down from the top edge
    const x0 = (ax + PW / 2) * PX, y0 = (PH / 2 - ay) * PX, x1 = (bx + PW / 2) * PX, y1 = (PH / 2 - by) * PX;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    const half = BRUSH_HALF * PX;
    const ux = len > 1e-3 ? dx / len : 1, uy = len > 1e-3 ? dy / len : 0; // along the stroke
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - half)), maxX = Math.min(MW - 1, Math.ceil(Math.max(x0, x1) + half));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - half)), maxY = Math.min(MH - 1, Math.ceil(Math.max(y0, y1) + half));
    let removed = 0;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const along = px * ux + py * uy, across = -px * uy + py * ux;
      // flat ends, so the next call's path does not wipe the same pixels twice
      if (len > 1e-3 ? (along < 0 || along >= len) : Math.hypot(px, py) > half) continue;
      if (Math.abs(across) > half) continue;
      const k = (across + half) / (2 * half), tuft = tufts[Math.min(STREAKS - 1, Math.floor(k * STREAKS))];
      const edge = smooth(1, 0.72, Math.abs(across) / half);
      const i = y * MW + x, before = L.amt[i];
      if (before <= 0) continue;
      const after = before * (1 - strength * tuft * edge);
      L.amt[i] = after < 0.02 ? 0 : after;
      removed += before - L.amt[i];
    }
    if (removed > 0) L.dirty = true;
    return removed / (PX * PX); // in "square metres of full dust"
  }

  // Which cells a panel-local point is in.
  const cellAt = (x, y) => {
    const c = Math.floor((x + PW / 2) / CELL_W), r = Math.floor((PH / 2 - y) / CELL_H);
    return c >= 0 && c < DUST_COLS && r >= 0 && r < DUST_ROWS ? { c, r } : null;
  };

  let serverDust = null; // what the server last said, per cell

  const api = {
    cells,
    get flying() { return liveGrains; },
    // How much dust is left on panel pn, 0 to 1 of a fresh layer.
    left(pn) { const L = layers[pn]; let s = 0, f = 0; for (let i = 0; i < L.amt.length; i += 7) { s += L.amt[i]; f += L.fresh[i]; } return f ? s / f : 0; },
    // The brush moved from a to b on panel pn (both world points, the bristles' tips) over dt seconds.
    // Paints the wipe, throws grains, and returns the cells (server indices) brushed enough to count.
    stroke(pn, a, b, dt) {
      const L = layers[pn];
      const la = L.panel.worldToLocal(tmp.copy(a)), ax = la.x, ay = la.y;
      const lb = L.panel.worldToLocal(tmp.copy(b)), bx = lb.x, by = lb.y;
      const len = Math.hypot(bx - ax, by - ay), speed = len / Math.max(dt, 1 / 120);
      if (len < 0.002) return [];
      // A slow, firm stroke takes more off than a fast flick.
      const strength = Math.max(0.5, Math.min(0.92, 1.05 - speed * 0.22));
      const removed = wipe(L, ax, ay, bx, by, strength);
      // Grains spray off the leading edge of the bristles, forward and out from the panel.
      if (removed > 0.0004) {
        const n = Math.min(5, 1 + Math.round(removed * 350));
        const dir = tmp2.set(bx - ax, by - ay, 0).normalize().transformDirection(L.panel.matrixWorld);
        const nrm = L.panel.getWorldDirection(new THREE.Vector3());
        for (let k = 0; k < n; k++) {
          const off = (Math.random() - 0.5) * 2 * BRUSH_HALF;
          const at = toWorld(L, bx - (by - ay) / len * off, by + (bx - ax) / len * off, new THREE.Vector3());
          const v = new THREE.Vector3().copy(dir).normalize().multiplyScalar(Math.min(1.4, speed) * (0.3 + Math.random() * 0.5))
            .addScaledVector(nrm, 0.15 + Math.random() * 0.35).add(tmp.set((Math.random() - 0.5) * 0.2, Math.random() * 0.25, (Math.random() - 0.5) * 0.2));
          throwGrain(at, v);
        }
      }
      // Count the path against each cell it crossed (by its midpoint: frames are short).
      const out = [];
      const mid = cellAt((ax + bx) / 2, (ay + by) / 2);
      if (mid) {
        const cell = cells[cellIndex(pn, mid.c, mid.r)];
        cell.userData.swept += len;
        const n = cellIndex(pn, mid.c, mid.r);
        if (serverDust?.[n] && (cell.userData.swept >= SWEPT || cellLeft(L, mid.c, mid.r) < LEFT)) out.push(n);
      }
      return out;
    },
    // The pointing path (a laptop, or a trigger at arm's length): one sweep across the whole cell at the
    // height it was clicked, the way you would run a brush along a row.
    sweepCell(n, worldPoint) {
      const cell = cells[n], { panel: pn, col, row } = cell.userData, L = layers[pn];
      let y = ((DUST_ROWS - 1) / 2 - row) * CELL_H;
      if (worldPoint) y = L.panel.worldToLocal(tmp.copy(worldPoint)).y;
      y = Math.max(-PH / 2 + (row === DUST_ROWS - 1 ? 0.08 : 0), Math.min(PH / 2, y));
      const x0 = -PW / 2 + col * CELL_W, x1 = x0 + CELL_W;
      const a = toWorld(L, x0, y, new THREE.Vector3()), b = toWorld(L, x1, y, new THREE.Vector3());
      // as several short strokes, so the grains come off along the whole sweep
      let got = [];
      for (let k = 0; k < 6; k++) got = got.concat(api.stroke(pn, a.clone().lerp(b, k / 6), a.clone().lerp(b, (k + 1) / 6), 0.05));
      return got.includes(n);
    },
    // The server's word on which cells are dusty (null: no dust fault).
    apply(dust) {
      layers.forEach((L, pn) => {
        let any = false;
        for (let r = 0; r < DUST_ROWS; r++) for (let c = 0; c < DUST_COLS; c++) {
          const n = cellIndex(pn, c, r), now = !!dust && !!dust[n], was = !!serverDust && !!serverDust[n];
          cells[n].visible = now;
          if (now) any = true;
          if (now && !was) { // dust settled again: a fresh layer in this cell
            const R = cellRect(c, r);
            for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) L.amt[y * MW + x] = L.fresh[y * MW + x];
            cells[n].userData.swept = 0; L.slide[r * DUST_COLS + c] = 0; L.dirty = true;
          }
          if (!now && was) L.slide[r * DUST_COLS + c] = SLUMP; // brushed: what is left slumps down and off
        }
        L.dusty = any;
      });
      serverDust = dust ? [...dust] : null;
    },
    update(dt, time) {
      const blink = Math.floor(time * 2) % 2 === 0;
      layers.forEach(L => {
        // Cells that have been brushed: the rest of their dust slides down and pours off the bottom.
        for (let r = 0; r < DUST_ROWS; r++) for (let c = 0; c < DUST_COLS; c++) {
          const s = r * DUST_COLS + c;
          if (L.slide[s] <= 0) continue;
          L.slide[s] = Math.max(0, L.slide[s] - dt);
          // It creeps down (the stripes go with it) and thins, then the last film goes in the final half second.
          const R = cellRect(c, r), shift = Math.random() < dt * 24 ? 1 : 0, keep = L.slide[s] <= 0 ? 0 : Math.exp(-dt * (L.slide[s] < 0.5 ? 7 : 0.9));
          let spill = 0;
          for (let x = R.x0; x < R.x1; x++) {
            spill += L.amt[(R.y1 - 1) * MW + x];
            for (let y = R.y1 - 1; y >= R.y0; y--) {
              const from = y - shift >= R.y0 ? L.amt[(y - shift) * MW + x] : 0;
              L.amt[y * MW + x] = from * keep;
            }
          }
          L.dirty = true;
          // what pours over the bottom edge of the cell falls as grains
          const n = Math.min(2, Math.round(spill / (R.x1 - R.x0) * 3 * shift));
          for (let k = 0; k < n; k++) {
            const x = -PW / 2 + (c + Math.random()) * CELL_W, y = PH / 2 - (r + 1) * CELL_H;
            throwGrain(toWorld(L, x, y, new THREE.Vector3()), tmp.set((Math.random() - 0.5) * 0.1, -0.05, (Math.random() - 0.5) * 0.1).clone());
          }
          L.fallen += spill / (MW * MH);
        }
        // Upload the mask at most every other frame, and only if it changed.
        if (L.dirty && (Math.round(time * 60) % 2 === 0)) {
          const d = L.img.data;
          let any = false;
          for (let i = 0, j = 0; i < L.amt.length; i++, j += 4) {
            const a = L.amt[i];
            if (a > 0) any = true;
            const v = Math.round(Math.min(1, a * 1.15) * 255);
            d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
          }
          L.g.putImageData(L.img, 0, 0);
          L.tex.needsUpdate = true; L.dirty = false;
          L.mesh.visible = any;
        }
        L.lamp.material.color.setHex(L.dusty ? (blink ? PAL.hex.amber : PAL.hex.amberOff) : PAL.hex.green);
      });
      // Grains: ballistic, then lying on the regolith for a moment, then gone.
      let n = 0;
      for (const f of flying) {
        if (!f.live) continue;
        if (f.rest > 0) { f.rest += dt; if (f.rest > 1.5) { f.live = false; continue; } }
        else {
          f.v.y -= G * dt; f.p.addScaledVector(f.v, dt); f.spin += dt * 8;
          const gy = ground(f.p.x, f.p.z) + 0.004;
          if (f.p.y <= gy) { f.p.y = gy; f.rest = dt; const L = layers.reduce((best, L) => (L.panel.position.distanceToSquared(f.p) < best.panel.position.distanceToSquared(f.p) ? L : best)); L.fallen += 0.0006; }
        }
        sc.setScalar(f.s * (f.rest > 0 ? Math.max(0, 1 - f.rest / 1.5) : 1));
        m4.compose(f.p, q.setFromEuler(eul.set(f.spin, f.spin * 0.7, 0)), sc);
        grains.setMatrixAt(n++, m4);
      }
      grains.count = n; liveGrains = n;
      if (n) grains.instanceMatrix.needsUpdate = true;
      // The patch under each panel grows paler as dust comes down on it.
      layers.forEach(L => { L.patch.material.opacity = Math.min(0.55, L.fallen * 4); });
    },
  };
  return api;
}
