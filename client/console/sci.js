// The Scientist's desk (docs/design/mission-control-consoles.md, 6.4): the survey scope always on screen, with
// its RANGE and CENTRE switches, and beside it an auxiliary display switched between the field guide, POWER and
// AIR on three lit push-buttons (keys 1, 2, 3). POWER and AIR each have a strip-chart recorder of the last minute.
// The scope and a compact field guide are exported for the 2-player desk (all.js).
import { PAL, FONT, SAMPLE_COL } from '/shared/palette.js';
import { CFG, PLACES, SAMPLES } from '/shared/config.js';
import { drawFault, drawGlyph, drawSample, drawTool } from '/shared/icons.js';
import { FIELD, CRATERS, BOULDERS, LANDMARKS } from '/shared/field.js';
import { face, well, tile, keycap, knob, dial, strip, label, nixie, jewel, icon, arrow, phos, blinkOn, motion, TAU } from './instruments.js';
import { regionOf } from './desk.js';

// ---------- the chart's state: its two switches, what has been seen, and blooms ----------
export const RANGES = [30, 60, 120], CENTRES = ['base', 'scout', 'hauler'];
export const chart = { range: 2, centre: 0, hex: null, seen: null, first: new Float64Array(FIELD.n * FIELD.n), known: null, bloom: new Map() };
function decodeSeen(hex) {
  const out = new Uint8Array(FIELD.n * FIELD.n);
  for (let i = 0; i < hex.length; i++) { const v = parseInt(hex[i], 16); for (let b = 0; b < 4; b++) if (v >> b & 1) out[i * 4 + b] = 1; }
  return out;
}
// A click on the scope's glass: a beacon there for the astronaut, or, on the beacon itself, put it out.
export function clickScope(p, ctx, s) {
  const P = chart.proj; if (!P || Math.hypot(p.x - P.CX, p.y - P.CY) > P.R) return;
  const wx = P.c.x + (p.x - P.CX) / P.k, wz = P.c.z + (p.y - P.CY) / P.k, w = s?.waypoint;
  ctx.beaconAt(wx, wz, !!(w && !w.inside && Math.hypot((w.x - wx) * P.k, (w.z - wz) * P.k) < 14));
}
export const FAULT_TILES = ['dust', 'wheel', 'hull', 'suit'];

// ---------- the recorders: oxygen and battery, sampled at 2 Hz into a minute of paper (D11) ----------
const N = 120;
export const trace = { o2: [], batt: [], last: 0 };
export function sampleTraces(s) {
  if (!s || s.phase !== 'run') { trace.o2.length = trace.batt.length = 0; trace.last = 0; return; }
  const now = performance.now();
  if (!trace.last) trace.last = now - 500;
  const o2 = (s.oxygen ?? 0) / (s.o2Max || 100), b = (s.power?.battery ?? 0) / 100;
  while (now - trace.last >= 500) { // a throttled tab fills the gap with the value it has, so the time axis stays true
    trace.last += 500;
    trace.o2.push(o2); trace.batt.push(b);
    if (trace.o2.length > N) trace.o2.shift(); if (trace.batt.length > N) trace.batt.shift();
  }
}

// ---------- the scope ----------
// The round phosphor scope. Unexplored ground is the orbital heat map: 30 m blocks in four steps of brightness,
// with raster lines. Explored ground (wherever a rover has driven) clears to dark glass and is drawn fine: crater
// rims, boulders, landmarks, samples, loose tools, the rovers, the astronaut, and the one active fault's symbol.
export function scope(g, s, CX, CY, R, sfx) {
  const sv = s.survey; if (!sv) return;
  const now = performance.now();
  if (chart.hex !== sv.seen) {
    const bits = decodeSeen(sv.seen);
    for (let k = 0; k < bits.length; k++) if (bits[k] && !(chart.seen && chart.seen[k])) chart.first[k] = chart.seen ? now : now - 1000;
    chart.seen = bits; chart.hex = sv.seen;
  }
  const ids = new Set(sv.samples.map(x => x.id));
  if (chart.known) for (const id of ids) if (!chart.known.has(id)) { chart.bloom.set(id, now); sfx('ping'); }
  chart.known = ids;
  const rng = RANGES[chart.range], cid = CENTRES[chart.centre];
  const c = cid === 'base' ? { x: 0, z: 0 } : sv.rovers[cid] || { x: 0, z: 0 };
  const k = R / rng, X = x => CX + (x - c.x) * k, Y = z => CY + (z - c.z) * k;
  chart.proj = { CX, CY, R, k, c: { x: c.x, z: c.z } }; // for turning a click back into metres
  const inView = (x, z, pad = 0) => Math.hypot(x - c.x, z - c.z) < rng * 1.05 + pad;
  const ls = R / 262; // labels and marks shrink a little on a small scope
  g.strokeStyle = PAL.bezel; g.lineWidth = 10; g.beginPath(); g.arc(CX, CY, R + 5, 0, TAU); g.stroke();
  g.save(); g.beginPath(); g.arc(CX, CY, R, 0, TAU); g.clip();
  const glass = g.createRadialGradient(CX, CY, 0, CX, CY, R);
  glass.addColorStop(0, '#152015'); glass.addColorStop(1, PAL.glass);
  g.fillStyle = glass; g.fillRect(CX - R, CY - R, 2 * R, 2 * R);
  const nb = FIELD.blocks, B = FIELD.block, RF = FIELD.radius, n = FIELD.n, cell = FIELD.cell;
  for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) {
    const lv = +sv.heat[j * nb + i]; if (!lv) continue;
    g.fillStyle = phos(0.06 + lv * 0.11); g.fillRect(X(-RF + i * B), Y(-RF + j * B), B * k, B * k);
  }
  g.fillStyle = 'rgba(12,18,12,0.4)'; for (let y = CY - R; y < CY + R; y += 3) g.fillRect(CX - R, y, 2 * R, 1); // raster lines
  const seen = chart.seen;
  const cellIn = (i, j) => { const x = -RF + (i + 0.5) * cell, z = -RF + (j + 0.5) * cell; return inView(x, z, cell); };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const kk = j * n + i; if (!seen[kk] || !cellIn(i, j)) continue;
    const a = Math.min(1, (now - chart.first[kk]) / 330); if (a < 1) motion.swinging = now;
    g.fillStyle = `rgba(16,24,16,${0.97 * a})`; g.fillRect(X(-RF + i * cell) - 0.5, Y(-RF + j * cell) - 0.5, cell * k + 1, cell * k + 1);
  }
  g.strokeStyle = phos(0.4); g.lineWidth = 1; g.beginPath();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!seen[j * n + i] || !cellIn(i, j)) continue;
    const x0 = X(-RF + i * cell), y0 = Y(-RF + j * cell), w = cell * k;
    if (i === 0 || !seen[j * n + i - 1]) { g.moveTo(x0, y0); g.lineTo(x0, y0 + w); }
    if (i === n - 1 || !seen[j * n + i + 1]) { g.moveTo(x0 + w, y0); g.lineTo(x0 + w, y0 + w); }
    if (j === 0 || !seen[(j - 1) * n + i]) { g.moveTo(x0, y0); g.lineTo(x0 + w, y0); }
    if (j === n - 1 || !seen[(j + 1) * n + i]) { g.moveTo(x0, y0 + w); g.lineTo(x0 + w, y0 + w); }
  }
  g.stroke();
  g.save(); g.beginPath();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (seen[j * n + i] && cellIn(i, j)) g.rect(X(-RF + i * cell), Y(-RF + j * cell), cell * k, cell * k);
  g.clip();
  g.strokeStyle = phos(0.12); g.lineWidth = 1;
  for (let rr = 30; rr <= RF; rr += 30) { g.beginPath(); g.arc(X(0), Y(0), rr * k, 0, TAU); g.stroke(); }
  g.strokeStyle = phos(0.28);
  for (const cr of CRATERS) if (cr.R >= 3 && inView(cr.x, cr.z, cr.R)) { g.beginPath(); g.arc(X(cr.x), Y(cr.z), cr.R * k, 0, TAU); g.stroke(); }
  g.fillStyle = phos(0.65);
  for (const b of BOULDERS) if (inView(b.x, b.z)) { g.beginPath(); g.arc(X(b.x), Y(b.z), Math.max(1.6, b.r * k), 0, TAU); g.fill(); }
  for (const l of LANDMARKS) if (inView(l.x, l.z, 10)) { g.strokeStyle = phos(0.8); g.strokeRect(X(l.x) - 3, Y(l.z) - 3, 6, 6); label(g, l.name, X(l.x), Y(l.z) - 11, Math.max(7, 9 * ls), phos(0.85)); }
  for (const sm of sv.samples) { if (!inView(sm.x, sm.z)) continue; const grd = g.createRadialGradient(X(sm.x), Y(sm.z), 0, X(sm.x), Y(sm.z), Math.max(8, cell * k)); grd.addColorStop(0, phos(0.35)); grd.addColorStop(1, phos(0)); g.fillStyle = grd; g.fillRect(X(sm.x) - 40, Y(sm.z) - 40, 80, 80); }
  g.restore();
  // the base, always: the habitat, its modules, the solar panels at short range
  g.strokeStyle = phos(0.7); g.lineWidth = 1.5;
  g.beginPath(); g.arc(X(0), Y(0), CFG.habRadius * k, 0, TAU); g.stroke();
  g.strokeRect(X(2.2), Y(-1.45), 5.4 * k, 2.9 * k); g.strokeRect(X(-4.6), Y(-1.35), 2.4 * k, 2.7 * k);
  if (rng <= 60) for (const p of PLACES.panels) g.strokeRect(X(p.x) - 2, Y(p.z) - 1.1 * k, 4, 2.2 * k);
  icon(g, 'home', X(0), Y(0) + CFG.habRadius * k + 12, 14 * ls + 4, phos(0.85));
  // marks over everything
  for (const sm of sv.samples) {
    if (!inView(sm.x, sm.z)) continue;
    const b = chart.bloom.get(sm.id), u = b ? Math.min(1, (now - b) / 900) : 1;
    if (u < 1) { motion.swinging = now; g.strokeStyle = `rgba(224,163,71,${1 - u})`; g.lineWidth = 2; g.beginPath(); g.arc(X(sm.x), Y(sm.z), 6 + u * 24, 0, TAU); g.stroke(); }
    g.shadowColor = PAL.amber; g.shadowBlur = 5; drawGlyph(g, SAMPLES[sm.kind].glyph, X(sm.x), Y(sm.z), 12, PAL.amber); g.shadowBlur = 0;
  }
  for (const t of sv.tools || []) if (inView(t.x, t.z)) { g.fillStyle = PAL.amber; g.beginPath(); g.arc(X(t.x), Y(t.z), 2.5, 0, TAU); g.fill(); }
  const wedge = (x, z, ry, colour, ic) => {
    g.save(); g.translate(X(x), Y(z));
    icon(g, ic, 0, 19, 16, colour);
    g.rotate(Math.atan2(Math.sin(ry), -Math.cos(ry)));
    g.fillStyle = colour; g.shadowColor = colour; g.shadowBlur = 5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  };
  // The beacon: an amber cross-hair in a ring the size of "you are there", a dotted line to it from the astronaut,
  // and the tool's silhouette over it when it is on a tool.
  const wp = s.waypoint, wpAt = wp && (wp.inside ? { x: 0, z: 0 } : wp);
  if (wpAt && inView(wpAt.x, wpAt.z, 10)) {
    const px = X(wpAt.x), py = Y(wpAt.z), rr = Math.max(7, CFG.waypoint.reach * k);
    if (sv.astro && !sv.astro.inside) { g.strokeStyle = 'rgba(224,163,71,0.35)'; g.lineWidth = 1; g.setLineDash([4, 5]); g.beginPath(); g.moveTo(X(sv.astro.x), Y(sv.astro.z)); g.lineTo(px, py); g.stroke(); g.setLineDash([]); }
    g.strokeStyle = PAL.amber; g.lineWidth = 2; g.shadowColor = PAL.amber; g.shadowBlur = 4;
    g.beginPath(); g.arc(px, py, rr, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(px - rr - 6, py); g.lineTo(px - rr * 0.4, py); g.moveTo(px + rr * 0.4, py); g.lineTo(px + rr + 6, py);
    g.moveTo(px, py - rr - 6); g.lineTo(px, py - rr * 0.4); g.moveTo(px, py + rr * 0.4); g.lineTo(px, py + rr + 6); g.stroke();
    g.shadowBlur = 0;
    if (wp.tool) drawTool(g, wp.tool, px, py - rr - 16, 18, PAL.amber); else icon(g, 'link', px, py - rr - 16, 16, PAL.amber);
  }
  for (const id of ['scout', 'hauler']) { const r = sv.rovers[id]; if (r) wedge(r.x, r.z, r.ry, PAL.amber, id); }
  if (sv.astro && !sv.astro.inside && s.crew.includes('astronaut')) wedge(sv.astro.x, sv.astro.z, sv.astro.ry, PAL.blue, 'helmet');
  if (sv.fault && blinkOn()) { const off = sv.fault.type === 'wheel' || sv.fault.type === 'suit' ? 16 : 0; g.shadowColor = PAL.red; g.shadowBlur = 6; drawFault(g, sv.fault.type, X(sv.fault.x) + off, Y(sv.fault.z) - off, 24, PAL.red); g.shadowBlur = 0; }
  g.restore();
  label(g, 'N', CX, CY - R + 14, 12, phos(0.8));
}
// The four fault symbols as event tiles: the one the scope is showing lights red.
export function faultTiles(g, x, y, s, size, cols = 2) {
  const f = s.survey?.fault?.type;
  FAULT_TILES.forEach((t, i) => {
    const tx = x + (i % cols) * (size + 8), ty = y + Math.floor(i / cols) * (size + 8);
    tile(g, tx, ty, size, '', 'red', f === t ? (blinkOn() ? 1 : 0.45) : 0, c => drawFault(g, t, tx, ty, size * 0.74, c));
  });
}

// ---------- the field guide ----------
// Pictures on the cards sit on a grey "photo" of the regolith, so a pale rock reads against the cream card.
function photo(g, x, y, w, h) { g.fillStyle = PAL.regolith; g.fillRect(x - w / 2, y - h / 2, w, h); g.strokeStyle = 'rgba(36,34,30,0.45)'; g.lineWidth = 1.5; g.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1); }
function pictoFrame(g, x, y) { photo(g, x, y, 68, 68); }
function pictoSize(g, x, y, look) { // a glove beside the rock, to scale
  g.save(); g.strokeStyle = PAL.inkDial; g.fillStyle = 'rgba(36,34,30,0.12)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x - 30, y - 6, 22, 26, 5); g.fill(); g.stroke();
  for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(x - 30 + i * 5.5, y - 22 + Math.abs(i - 1.5) * 2, 4.5, 18, 2); g.stroke(); }
  g.restore();
  drawSample(g, look, x + 14, y + 6, 30, SAMPLE_COL, PAL.foilGold);
}
function pictoWhere(g, x, y, where, look) {
  g.save(); g.strokeStyle = PAL.inkDial; g.lineWidth = 2.5;
  if (where === 'rim' || where === 'shadow') {
    g.beginPath(); g.moveTo(x - 32, y - 2); g.lineTo(x - 22, y - 6); g.quadraticCurveTo(x, y + 34, x + 22, y - 6); g.lineTo(x + 32, y - 2); g.stroke();
    if (where === 'shadow') { g.fillStyle = 'rgba(36,34,30,0.55)'; g.beginPath(); g.moveTo(x - 22, y - 6); g.quadraticCurveTo(x - 8, y + 22, x + 4, y + 15); g.lineTo(x - 22, y - 6); g.fill(); }
  } else { g.beginPath(); g.moveTo(x - 32, y + 12); g.lineTo(x + 32, y + 12); g.stroke(); }
  if (where === 'patch') { g.fillStyle = SAMPLE_COL.glass; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(x, y + 12, 26, 6, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
  g.restore();
  const at = { rim: [x - 22, y - 12], shadow: [x - 4, y + 6], flat: [x, y + 4], patch: [x, y + 4] }[where];
  drawSample(g, look, at[0], at[1], 16, SAMPLE_COL, PAL.foilGold);
}
function pictoTell(g, x, y, look) { // a magnifier on the rock's surface
  g.save(); g.beginPath(); g.arc(x - 4, y - 4, 22, 0, 7); g.clip();
  drawSample(g, look, x - 4, y - 4, 110, SAMPLE_COL, PAL.foilGold);
  g.restore();
  g.strokeStyle = PAL.inkDial; g.lineWidth = 3; g.beginPath(); g.arc(x - 4, y - 4, 22, 0, 7); g.stroke();
  g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + 12, y + 12); g.lineTo(x + 26, y + 26); g.stroke();
}

// A cream card for each kind of sample the mission wants: a picture of it, three pictograms (its size against a
// glove, where it lies, its tell-tale), its lookalike struck through, and a lamp for each piece wanted, lit as it
// is banked. Under the cards, the ASSAY strip: what the last thing into the port was. Drawn in a 560-wide frame
// and scaled into the box it is given.
export function guide(g, s, bx, by, bw, bh) {
  const manifest = s.manifest || [], kinds = [...new Set(manifest.map(m => m.kind))];
  const cardH = 146, need = 12 + Math.max(1, kinds.length) * (cardH + 10) + 74, W = 560;
  const k = Math.min(bw / W, bh / need);
  g.save(); g.translate(bx + (bw - W * k) / 2, by); g.scale(k, k);
  kinds.forEach((kind, n) => {
    const y = 12 + n * (cardH + 10), T = SAMPLES[kind];
    g.fillStyle = PAL.dial; g.fillRect(14, y, W - 28, cardH);
    g.strokeStyle = PAL.inkDim; g.lineWidth = 1; g.strokeRect(20.5, y + 6.5, W - 41, cardH - 13);
    drawGlyph(g, T.glyph, 38, y + 26, 16, PAL.inkDial);
    photo(g, 92, y + 66, 112, 100);
    drawSample(g, T.look, 92, y + 66, 92, SAMPLE_COL, PAL.foilGold);
    for (const [fx, x] of [[pictoSize, 196], [pictoWhere, 276], [pictoTell, 356]]) { pictoFrame(g, x, y + 62); fx(g, x, y + 62, fx === pictoWhere ? T.where : T.look, T.look); }
    label(g, 'SIZE', 196, y + 112, 9, PAL.inkDial); label(g, 'WHERE', 276, y + 112, 9, PAL.inkDial); label(g, 'TELL', 356, y + 112, 9, PAL.inkDial);
    if (!s.real) { dud(g, T.dud, 470, y + 61, 74, 68); label(g, 'NOT THIS', 470, y + 112, 9, PAL.inkDial); } // no lookalikes, no NOT THIS
    manifest.filter(m => m.kind === kind).forEach((m, i) => jewel(g, 40 + i * 26, y + cardH - 20, 8, 'green', m.got));
  });
  assay(g, s, 14, need - 70, W - 28);
  g.restore();
}
// The lookalike, struck through.
function dud(g, look, x, y, w, h) {
  photo(g, x, y, w, h);
  drawSample(g, look, x, y - 1, Math.min(w, h) * 0.85, SAMPLE_COL, PAL.foilGold);
  g.strokeStyle = PAL.red; g.lineWidth = Math.max(3, w * 0.07); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - w * 0.4, y - h * 0.42); g.lineTo(x + w * 0.4, y + h * 0.42); g.moveTo(x + w * 0.4, y - h * 0.42); g.lineTo(x - w * 0.4, y + h * 0.42); g.stroke();
}
// The ASSAY strip: the last thing into the port, its glyph, and FOUND or DUD.
function assay(g, s, x, y, w, h = 60) {
  g.fillStyle = PAL.consoleDeep; g.fillRect(x, y, w, h);
  g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  icon(g, 'port', x + 34, y + h / 2, 34, PAL.inkDim);
  const a = s.assay, cy = y + h / 2;
  if (a) { drawSample(g, a.look, x + 140, cy, h * 0.75, SAMPLE_COL, PAL.foilGold); if (a.kind !== 'dud') drawGlyph(g, SAMPLES[a.kind].glyph, x + 190, cy, 18, PAL.amber); }
  tile(g, x + w - 150, cy, h * 0.6, 'banked', 'green', a && a.kind !== 'dud' ? 1 : 0);
  if (!s.real) tile(g, x + w - 70, cy, h * 0.6, 'dud', 'amber', a && a.kind === 'dud' ? 1 : 0);
}
// The 2-player desk's guide: one row per kind, its glyph, its picture, the lookalike struck through, a lamp per
// piece wanted. No pictograms: one player has the whole base to run.
export function guideRows(g, s, x, y, w, rowH) {
  const manifest = s.manifest || [], kinds = [...new Set(manifest.map(m => m.kind))];
  kinds.forEach((kind, n) => {
    const yy = y + n * rowH, T = SAMPLES[kind], ph = rowH - 8, cy = yy + rowH / 2;
    g.fillStyle = PAL.dial; g.fillRect(x, yy + 3, w, rowH - 6);
    drawGlyph(g, T.glyph, x + 20, cy, 16, PAL.inkDial);
    photo(g, x + 40 + ph * 0.6, cy, ph * 1.2, ph); drawSample(g, T.look, x + 40 + ph * 0.6, cy, ph * 0.9, SAMPLE_COL, PAL.foilGold);
    if (!s.real) dud(g, T.dud, x + 60 + ph * 1.8, cy, ph * 1.1, ph);
    manifest.filter(m => m.kind === kind).forEach((m, i) => jewel(g, x + w - 24 - i * 22, cy, 7, 'green', m.got));
  });
  return kinds.length;
}
export const guideAssay = assay;

// ---------- POWER and AIR ----------
function airPage(g, s, x, y, w, h) {
  const mid = x + w / 2, rh = Math.min(260, Math.max(150, h - 330));
  dial(g, mid - 130, y + 136, 100, s.oxygen ?? 0, s.o2Max || 100, 'O2', { redBelow: 25, ico: 'o2' });
  dial(g, mid + 130, y + 136, 100, s.drain ?? 1, CFG.leakMultiplier * 2 - 0.5, 'RATE', { redAbove: 1.6, fixed: 1, ico: 'speed' });
  icon(g, 'o2', x + 30, y + 286 + rh / 2, 26, PAL.inkDim);
  strip(g, x + 56, y + 286, 330, rh, trace.o2, { red: 0.25 });
  const lx = mid + 190, ly = y + 286 + rh / 2;
  tile(g, lx, ly, 104, '', 'red', s.leak ? (blinkOn() ? 1 : 0.45) : 0, c => {
    g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(lx - 30, ly, 9, 0, TAU); g.stroke();
    for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(lx - 12 + Math.cos(a) * 6, ly + Math.sin(a) * 6); g.lineTo(lx - 12 + Math.cos(a) * 42, ly + Math.sin(a) * 42); g.stroke(); }
  });
}
function powerPage(g, s, x, y, w, h) {
  const p = s.power || { battery: 0, solar: 0 }, mid = x + w / 2, rh = Math.min(260, Math.max(150, h - 330));
  dial(g, mid - 130, y + 136, 100, p.battery, 100, 'BATT', { redBelow: 30, ico: 'battery' });
  dial(g, mid + 130, y + 136, 100, p.solar, 100, 'SUN', { redBelow: 60, ico: 'bolt' });
  icon(g, 'battery', x + 30, y + 286 + rh / 2, 26, PAL.inkDim);
  strip(g, x + 56, y + 286, 330, rh, trace.batt, { red: 0.3 });
  // charge or drain: an arrow into the battery, or out of it
  const charging = p.solar >= 100, lx = mid + 190, c1 = y + 286 + rh / 2 - 48, c2 = y + 286 + rh / 2 + 48;
  tile(g, lx, c1, 76, '', 'green', charging ? 1 : 0, c => { icon(g, 'battery', lx, c1 + 8, 44, c); arrow(g, lx, c1 - 22, 2, c); });
  tile(g, lx, c2, 76, '', 'amber', charging ? 0 : (blinkOn() ? 1 : 0.45), c => { icon(g, 'battery', lx, c2 + 8, 44, c); arrow(g, lx, c2 - 22, 0, c); });
}

export const AUX = ['guide', 'power', 'air'], AUX_ICON = { guide: 'card', power: 'battery', air: 'o2' };
const AUX_NAME = { guide: 'Field guide (1)', power: 'Power (2)', air: 'Air (3)' };

export function layout(W, H, ctx) {
  const { top, h } = regionOf(H);
  // The scope, with a clear gap between its bezel and the switches beside it.
  const R = Math.min(262, Math.floor((h - 40) / 2)), CX = 30 + R, CY = top + h / 2;
  const KX = 620, knobs = { range: { x: KX, y: top + 96 }, centre: { x: KX, y: top + 246 } };
  const ax = 800, aw = 540, ay = top + 14, ah = h - 28;
  const btn = i => ({ x: 704, y: top + 34 + i * 84, w: 68, h: 64 });
  const hits = [
    { x: CX - R, y: CY - R, w: 2 * R, h: 2 * R, name: 'Survey chart: click to stand a beacon there for the astronaut', click: p => clickScope(p, ctx, ctx.state()) },
    { x: KX - 50, y: knobs.range.y - 50, w: 100, h: 110, name: 'Range (R)', click: () => ctx.press('KeyR', true, true) },
    { x: KX - 50, y: knobs.centre.y - 50, w: 100, h: 110, name: 'Centre on the base, the Scout or the Hauler (E)', click: () => ctx.press('KeyE', true, true) },
    { x: 580, y: top + 350, w: 90, h: 90, name: 'Surveyed, percent' },
    { x: 560, y: top + 460, w: 100, h: 100, name: 'Which fault the chart shows' },
    ...AUX.map((a, i) => ({ ...btn(i), name: AUX_NAME[a], click: () => ctx.press('Digit' + (i + 1), true, true) })),
    { x: ax, y: ay, w: aw, h: ah, name: () => AUX_NAME[ctx.aux()] },
  ];
  return {
    hits,
    back(g) {
      face(g, 12, top, 664, h);
      face(g, 688, top, 666, h);
      well(g, ax - 4, ay - 4, aw + 8, ah + 8);
    },
    live(g, s) {
      scope(g, s, CX, CY, R, ctx.sfx);
      knob(g, knobs.range.x, knobs.range.y, RANGES, chart.range, 'lens');
      knob(g, knobs.centre.x, knobs.centre.y, ['home', 'scout', 'hauler'], chart.centre, 'scope');
      nixie(g, String(s.survey?.pct ?? 0).padStart(3, ' '), KX, top + 384, 26); icon(g, 'scope', KX - 24, top + 424, 18, PAL.inkDim); label(g, '%', KX + 6, top + 425, 11, PAL.inkDim);
      faultTiles(g, KX - 23, top + 484, s, 38);
      const aux = ctx.aux();
      AUX.forEach((a, i) => { const b = btn(i); keycap(g, b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, '', a === aux, (c, d) => icon(g, AUX_ICON[a], b.x + b.w / 2, b.y + b.h / 2 - 2 + d, 40, c)); label(g, String(i + 1), b.x + b.w + 12, b.y + b.h - 10, 9, PAL.inkDim); });
      face(g, ax, ay, aw, ah, true);
      if (aux === 'guide') guide(g, s, ax + 6, ay + 4, aw - 12, ah - 8);
      else if (aux === 'power') powerPage(g, s, ax, ay, aw, ah);
      else airPage(g, s, ax, ay, aw, ah);
      ctx.shown.aux = aux; ctx.shown.scope = { range: RANGES[chart.range], centre: CENTRES[chart.centre], pct: s.survey?.pct ?? 0, fault: s.survey?.fault?.type || null };
    },
    keyset(g, y, s, keys) {
      AUX.forEach((a, i) => { keycap(g, 90 + i * 110, y, 30, 26, String(i + 1), a === ctx.aux()); icon(g, AUX_ICON[a], 130 + i * 110, y, 24, PAL.inkDim); });
      keycap(g, 470, y, 30, 26, 'R', keys.has('KeyR')); icon(g, 'lens', 506, y, 22, PAL.inkDim);
      keycap(g, 580, y, 30, 26, 'E', keys.has('KeyE')); icon(g, 'scope', 616, y, 22, PAL.inkDim);
    },
  };
}
export { FONT };
