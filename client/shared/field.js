// The field round the base: one description of the ground that the server, the Moon scene (client/world.js)
// and the Scientist's chart (client/console.js) all share. Pure data and functions, no three.js.
//
//   FIELD      the grid: 5 m cells for what has been explored, 30 m blocks for the orbital heat map
//   CRATERS    the small craters on top of the LOLA ground (world.js digs them, the chart draws their rims)
//   BOULDERS   rocks big enough to stop a rover or a walker, 30 m out to the edge
//   LANDMARKS  named places, for directions: the dish, the depot, the drill, two big rocks
//   OBSTACLES  everything a rover bumps into, as circles
//   layField   where this mission's samples and their lookalikes lie, and the heat map made from them
import { CFG, PLACES, SAMPLES } from './config.js';

const R = CFG.bounds;
export const FIELD = { radius: R, cell: 5, block: 30 };
FIELD.n = Math.round(2 * R / FIELD.cell);       // 48 cells a side
FIELD.blocks = Math.round(2 * R / FIELD.block); // 8 blocks a side

// Cell index for a point, or -1 outside the grid.
export function cellOf(x, z) {
  const i = Math.floor((x + R) / FIELD.cell), j = Math.floor((z + R) / FIELD.cell);
  return i < 0 || j < 0 || i >= FIELD.n || j >= FIELD.n ? -1 : j * FIELD.n + i;
}
export const cellCentre = k => ({ x: -R + (k % FIELD.n + 0.5) * FIELD.cell, z: -R + (Math.floor(k / FIELD.n) + 0.5) * FIELD.cell });
export function blockOf(x, z) {
  const i = Math.floor((x + R) / FIELD.block), j = Math.floor((z + R) / FIELD.block);
  return i < 0 || j < 0 || i >= FIELD.blocks || j >= FIELD.blocks ? -1 : j * FIELD.blocks + i;
}
export const inField = (x, z) => Math.hypot(x, z) <= R;

// A small seeded generator (mulberry32), so every page and the server lay out the same Moon.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- craters ----------
// The lunar equilibrium crater size-frequency distribution N(>D) = 10^-1.1 D^-1.83 per km^2 (D in km;
// Trask 1966, as used by Neukum et al. 2001 for the saturated small-crater population). Fresh and degraded
// craters are mixed: depth 5-18% of diameter, rim 1.5-4%.
const SFD_B = 1.83, SFD_A = Math.pow(10, -1.1);
export const CRATERS = [];
{
  const rnd = seeded(1969);
  const sfdCount = (dMin, dMax, areaKm2) => SFD_A * (Math.pow(dMin / 1000, -SFD_B) - Math.pow(dMax / 1000, -SFD_B)) * areaKm2;
  const sfdDraw = (dMin, dMax) => dMin * Math.pow(1 - rnd() * (1 - Math.pow(dMax / dMin, -SFD_B)), -1 / SFD_B);
  const add = (rMin, rMax, dMin, dMax) => {
    const count = Math.round(sfdCount(dMin, dMax, Math.PI * (rMax * rMax - rMin * rMin) / 1e6));
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rMin * rMin + rnd() * (rMax * rMax - rMin * rMin));
      const D = sfdDraw(dMin, dMax), fresh = Math.pow(rnd(), 2.2);
      CRATERS.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, R: D / 2, depth: D * (0.05 + 0.13 * fresh), rim: D * (0.015 + 0.025 * fresh) });
    }
  };
  add(0, 130, 3, 100);      // fine enough for 3 m craters near the base
  add(130, 1080, 10, 100);  // further out, 10 m and up; anything over 100 m is already in the DEM
}

// ---------- the base, as circles a rover bumps into ----------
const BASE = [
  { x: 0, z: 0, r: 2.7 },                                                // the habitat's core
  { x: 3.2, z: 0, r: 1.5 }, { x: 4.9, z: 0, r: 1.5 }, { x: 6.6, z: 0, r: 1.5 }, // the long module
  { x: -3.4, z: 0, r: 1.4 },                                             // the short one
  ...Object.values(PLACES.doors).map(d => ({ x: d.x + Math.sin(d.ry) * (0.65 + 0.35), z: d.z + Math.cos(d.ry) * (0.65 + 0.35), r: 0.95 })), // the airlock chambers (stood off the skin)
  ...PLACES.panels.flatMap(p => [{ x: p.x, z: p.z, r: 1.2 }, { x: p.x + 3.6, z: p.z, r: 1.4 }]), // both rows of solar panels
];

// ---------- landmarks ----------
export const LANDMARKS = [
  { name: 'DISH', x: PLACES.dish.x, z: PLACES.dish.z, r: 2.0 },
  { name: 'DEPOT', x: PLACES.depot.x, z: PLACES.depot.z, r: 2.6 },
  { name: 'DRILL', x: PLACES.drill.x, z: PLACES.drill.z, r: 2.0 },
  { name: 'SPLIT ROCK', x: 41, z: 56, r: 2.8, rock: true },
  { name: 'THE TOOTH', x: -82, z: -20, r: 1.6, rock: true },
];

// ---------- boulders ----------
// About forty rocks from 0.8 to 2.6 m across, from 30 m out to the edge, clear of everything above. Solid for
// the astronaut and both rovers. Two of them are named landmarks (SPLIT ROCK is a pair, THE TOOTH is tall).
export const BOULDERS = [];
{
  const rnd = seeded(4517);
  const clearOf = (x, z, r) => [...BASE, ...LANDMARKS].every(o => Math.hypot(x - o.x, z - o.z) > o.r + r + 3)
    && Object.values(PLACES.rovers).every(p => Math.hypot(x - p.x, z - p.z) > r + 4)
    && BOULDERS.every(b => Math.hypot(x - b.x, z - b.z) > b.r + r + 2);
  BOULDERS.push({ x: 40.0, z: 55.2, r: 1.25, s: 2.5, ry: 0.4, shape: 'jagged', name: 'SPLIT ROCK' });
  BOULDERS.push({ x: 42.3, z: 56.9, r: 1.1, s: 2.2, ry: 2.1, shape: 'jagged', name: 'SPLIT ROCK' });
  BOULDERS.push({ x: -82, z: -20, r: 0.9, s: 1.8, ry: 0.9, shape: 'tooth', name: 'THE TOOTH' });
  for (let tries = 0; BOULDERS.length < 43 && tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2, d = 30 + Math.sqrt(rnd()) * (R - 36), s = 0.8 + rnd() * rnd() * 1.8, r = s / 2;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!clearOf(x, z, r)) continue;
    BOULDERS.push({ x, z, r, s, ry: rnd() * Math.PI * 2, shape: rnd() < 0.6 ? 'jagged' : 'rounded' });
  }
}

// Everything a rover bumps into. Landmarks that are rocks are already in BOULDERS.
export const OBSTACLES = [...BASE, ...LANDMARKS.filter(l => !l.rock), ...BOULDERS.map(b => ({ x: b.x, z: b.z, r: b.r }))];
// What the astronaut cannot walk through out in the field (the base has its own walls in astronaut.js).
export const SOLID = [...LANDMARKS.filter(l => !l.rock && !['DISH', 'DEPOT', 'DRILL'].includes(l.name)), ...BOULDERS.map(b => ({ x: b.x, z: b.z, r: b.r }))];

// Push a circle (x, z, r) out of every obstacle in `list` and back inside the field. Returns { x, z, hit }.
export function pushOut(x, z, r, list = OBSTACLES, bound = R) {
  let hit = false;
  for (const o of list) {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), min = o.r + r;
    if (d >= min) continue;
    hit = true;
    if (d > 1e-6) { x = o.x + dx / d * min; z = o.z + dz / d * min; } else x = o.x + min;
  }
  const d = Math.hypot(x, z);
  if (d > bound) { x *= bound / d; z *= bound / d; hit = true; }
  return { x, z, hit };
}

// ---------- the mission's samples ----------
// Every real sample and every lookalike: { id, kind, look, x, z } (kind is a sample type, or 'dud').
// Real samples cluster round three to five hot spots between 40 and 110 m out; lookalikes lie in the
// clusters and on their own. Ice lies only in a crater's bowl. Nothing within 30 m of the habitat, in a
// boulder or on a landmark. The demo is the same every time: fixed hot spots, a fixed seed, and the first
// wanted sample 45 m north-east, in the brightest block, so the first run is short.
const DEMO_SPOTS = [{ x: 33, z: -32 }, { x: -58, z: 52 }, { x: 72, z: 50 }, { x: -70, z: -66 }];
export const DEMO_MANIFEST = ['anor', 'anor', 'ice', 'glass'];
export function layField(rng, mode) {
  const demo = mode === 'demo';
  const rnd = demo ? seeded(7311) : rng;
  const types = Object.keys(SAMPLES);
  // The manifest: four samples, from three of the four types.
  let manifest;
  if (demo) manifest = [...DEMO_MANIFEST];
  else {
    const three = types.slice().sort(() => rnd() - 0.5).slice(0, 3);
    manifest = [three[0], three[0], three[1], three[2]].sort(() => rnd() - 0.5);
  }
  // Hot spots.
  let spots = demo ? DEMO_SPOTS : [];
  for (let tries = 0; !demo && spots.length < 3 + Math.floor(rnd() * 3) && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, d = 40 + rnd() * 70, s = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    if (spots.every(o => Math.hypot(o.x - s.x, o.z - s.z) > 35)) spots.push(s);
  }
  const list = [];
  const free = (x, z) => Math.hypot(x, z) >= 30 && Math.hypot(x, z) <= R - 6
    && SOLID.every(o => Math.hypot(x - o.x, z - o.z) > o.r + 1.5) && BASE.every(o => Math.hypot(x - o.x, z - o.z) > o.r + 3)
    && list.every(o => Math.hypot(x - o.x, z - o.z) > 2.5);
  const near = (c, spread) => {
    for (let k = 0; k < 60; k++) {
      const a = rnd() * Math.PI * 2, d = spread * Math.sqrt(rnd()), x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (free(x, z)) return { x, z };
    }
    return null;
  };
  // Ice wants a crater bowl near the spot: a crater 3 to 20 m across, sample a third of the way in.
  const iceNear = c => {
    const cands = CRATERS.filter(k => k.R >= 1.5 && k.R <= 10 && Math.hypot(k.x - c.x, k.z - c.z) < 30 && Math.hypot(k.x, k.z) > 35 && Math.hypot(k.x, k.z) < R - 8);
    for (let n = 0; n < 12 && cands.length; n++) {
      const k = cands[Math.floor(rnd() * cands.length)], a = rnd() * Math.PI * 2;
      const x = k.x + Math.cos(a) * k.R * 0.3, z = k.z + Math.sin(a) * k.R * 0.3;
      if (free(x, z)) return { x, z };
    }
    return near(c, 16);
  };
  const place = (kind, c, spread, dud = false) => {
    const p = kind === 'ice' && !dud ? iceNear(c) : near(c, spread);
    if (!p) return;
    list.push({ id: 's' + list.length, kind: dud ? 'dud' : kind, look: dud ? SAMPLES[kind].dud : SAMPLES[kind].look, type: kind, x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
  };
  // The demo's first sample: right where it should be.
  if (demo) list.push({ id: 's0', kind: 'anor', look: SAMPLES.anor.look, type: 'anor', x: 32.5, z: -31.5 });
  // Real samples: each one the manifest wants, one spare of each wanted type, and two of something else.
  const wanted = [...manifest, ...new Set(manifest)];
  const others = types.filter(t => !manifest.includes(t));
  const extra = [others[0] || types[0], types[Math.floor(rnd() * types.length)]];
  const reals = [...wanted, ...extra];
  if (demo) reals.splice(reals.indexOf('anor'), 1); // s0 is one of them
  reals.forEach((kind, n) => place(kind, spots[(n + (demo ? 1 : 0)) % spots.length], 14));
  // Lookalikes: one for each real sample, most in the clusters, some on their own out in the field.
  reals.forEach((kind, n) => {
    if (rnd() < 0.65) place(kind, spots[(n + 2) % spots.length], 18, true);
    else { const a = rnd() * Math.PI * 2, d = 45 + rnd() * 60; place(kind, { x: Math.cos(a) * d, z: Math.sin(a) * d }, 10, true); }
  });
  list.forEach((s, n) => { s.id = 's' + n; });
  // The orbital heat map: what is in each 30 m block, real or not (orbit cannot tell), and a little noise.
  const score = new Array(FIELD.blocks * FIELD.blocks).fill(0);
  for (const s of list) { const b = blockOf(s.x, s.z); if (b >= 0) score[b] += s.kind === 'dud' ? 0.6 : 1; }
  const heat = score.map(v => { v += rnd() * 0.6; return v >= 2.2 ? 3 : v >= 1.2 ? 2 : v >= 0.5 ? 1 : 0; });
  return { samples: list, heat, manifest };
}
