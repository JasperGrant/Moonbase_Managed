// The Scientist's LAB page (docs/SPEC-real-mission.md, section 7): the Real Mission's four experiments. The
// Scientist never sees the instruments: they get the procedure, the reference and the telemetry, and make the
// call that turns a run into a finding. Drawn in its own frame, 540 wide, so the 2-player desk can draw it
// smaller; a click is handed back in the same frame (labClick).
import { PAL, FONT } from '/shared/palette.js';
import { drawGlyph } from '/shared/icons.js';
import { SAMPLES } from '/shared/config.js';
import { EXPERIMENTS, EXP_IDS, MINERALS, STEPS, E1, E2, E3, E4, ageOf, ratioOf, drawGrain, lightOf } from '/shared/lab.js';
import { well, tile, keycap, label, typed, plate, nixie, jewel, icon, edgewise, needle, blinkOn, TAU } from './instruments.js';

export const LW = 540;
const GLYPH = Object.fromEntries(EXP_IDS.map(id => [id, SAMPLES[EXPERIMENTS[id].kind].glyph]));
const STATE_LAMP = { locked: ['amber', 0], ready: ['amber', 1], loaded: ['amber', 'blink'], done: ['green', 1] };

// Which experiment the page shows: the one picked, or the one in progress, or the first one ready.
export const labSel = { id: null, slide: 50 };
export function shownExp(lab) {
  if (labSel.id && lab[labSel.id]) return labSel.id;
  return EXP_IDS.find(id => lab.board[id].state === 'loaded') || EXP_IDS.find(id => lab.board[id].state === 'ready') || 'E1';
}

// The furnace's gas trace, sampled at 2 Hz, for the recorder: the last 90 s.
const trace = { gas: [], temp: [], last: 0 };
function sampleTrace(e3) {
  const now = performance.now();
  if (now - trace.last < 500) return;
  trace.last = now;
  trace.gas.push(e3.gas); trace.temp.push(e3.temp);
  if (trace.gas.length > 180) { trace.gas.shift(); trace.temp.shift(); }
}

let rects = []; // this frame's buttons: { x, y, w, h, fn }, in the page's own frame
const btn = (x, y, w, h, fn) => rects.push({ x, y, w, h, fn });
export function labClick(p) { const r = rects.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h); if (r) { r.fn(p); return true; } return false; }

// A lit push-button with a word, the call buttons.
function push(g, x, y, w, h, text, on, fn, enabled = true) {
  keycap(g, x + w / 2, y + h / 2, w, h, text, on);
  if (!enabled) { g.fillStyle = 'rgba(29,28,25,0.55)'; g.fillRect(x, y, w, h); }
  if (enabled) btn(x, y, w, h, fn);
}

export function labPage(g, s, ctx, H) {
  rects = [];
  const lab = s.lab; if (!lab) return;
  const id = shownExp(lab), board = lab.board;
  if (lab.E3) sampleTrace(lab.E3);
  // the four tiles: the glyph of the sample each needs, a lamp for its state, its grade once done
  EXP_IDS.forEach((x, i) => {
    const cx = 70 + i * 133, cy = 34, st = board[x].state, [col, lv] = STATE_LAMP[st];
    well(g, cx - 58, 8, 116, 52);
    if (x === id) { g.strokeStyle = PAL.amber; g.lineWidth = 2; g.strokeRect(cx - 57, 9, 114, 50); }
    drawGlyph(g, GLYPH[x], cx - 34, cy, 22, st === 'locked' ? PAL.inkDim : PAL.ink);
    jewel(g, cx - 4, cy, 8, col, lv === 'blink' ? blinkOn() : !!lv);
    if (board[x].grade) nixie(g, board[x].grade, cx + 32, cy, 30); else label(g, x, cx + 32, cy + 1, 10, PAL.inkDim);
    btn(cx - 58, 8, 116, 52, () => { labSel.id = x; ctx.sfx('click'); });
  });
  const E = EXPERIMENTS[id], st = board[id].state;
  plate(g, `${E.name}  ·  ${E.theme}`, LW / 2, 80, 380, 9);
  // the procedure: numbered plates, the step in progress lit
  const step = stepOf(id, lab[id], st), steps = STEPS[id];
  steps.forEach((w, i) => {
    const x = 8 + i * 88, on = i === step, done = i < step || st === 'done';
    g.fillStyle = on ? PAL.amber : done ? PAL.green : PAL.dial; g.fillRect(x, 100, 82, 30);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeRect(x + 0.5, 100.5, 81, 29);
    typed(g, String(i + 1), x + 10, 115, 12, PAL.inkDial); label(g, w, x + 46, 116, w.length > 9 ? 6.5 : 7.5, PAL.inkDial);
  });
  const y0 = 142, hh = H - y0;
  if (st === 'locked') { label(g, 'WAITING FOR THE SAMPLE', LW / 2, y0 + 60, 11, PAL.inkDim); drawGlyph(g, GLYPH[id], LW / 2, y0 + 120, 40, PAL.inkDim); return; }
  ({ E1: pageE1, E2: pageE2, E3: pageE3, E4: pageE4 })[id](g, lab[id], st, ctx, y0, hh);
  if (st === 'done') { g.fillStyle = 'rgba(29,28,25,0.45)'; g.fillRect(0, y0, LW, hh); nixie(g, board[id].grade, LW / 2, y0 + hh / 2, 80); icon(g, 'flask', LW / 2 - 90, y0 + hh / 2, 50, PAL.green); }
  ctx.shown.lab = { shown: id, step, state: st };
}

// Which step of the procedure the telemetry says the run is at.
function stepOf(id, e, st) {
  if (st === 'done') return STEPS[id].length;
  if (st !== 'loaded') return 0;
  if (id === 'E1') return e.pol ? (e.turned.every(t => t >= E1.needTurn) ? 5 : e.turned[e.grain] >= E1.needTurn ? 4 : 3) : e.focus > 0.3 ? 2 : 1;
  if (id === 'E2') return e.latched.length >= 2 ? 5 : e.beam ? (e.latched.length ? 4 : 3) : e.vac >= 0.9 ? 2 : 1;
  if (id === 'E3') return e.step >= 3 ? 5 : e.heat ? 2 + e.step : 1;
  if (id === 'E4') return e.dh !== null ? 5 : e.w2 !== null ? 4 : e.sub > 0 ? 3 : e.w1 !== null ? 2 : 1;
  return 0;
}

// ---------- E1 THIN SECTION ----------
function pageE1(g, e, st, ctx, y0) {
  // reference: the three minerals, without and with the polariser, and how often each goes dark in a turn
  label(g, 'REFERENCE', 12, y0 + 10, 8, PAL.inkDim, 'left');
  Object.keys(MINERALS).forEach((m, i) => {
    const x = 50 + i * 90, y = y0 + 52;
    drawGrain(g, m, x - 18, y, 18, { pol: false, col: PAL });
    drawGrain(g, m, x + 22, y, 18, { pol: true, angle: 45, col: PAL });
    // dark angles per turn: a small dial with a dot at each
    const n = MINERALS[m].dark;
    g.strokeStyle = PAL.inkDim; g.lineWidth = 1; g.beginPath(); g.arc(x, y + 42, 12, 0, TAU); g.stroke();
    for (let k = 0; k < n; k++) { const a = k * TAU / n - Math.PI / 2; g.fillStyle = PAL.ink; g.beginPath(); g.arc(x + Math.cos(a) * 12, y + 42 + Math.sin(a) * 12, 3, 0, TAU); g.fill(); }
    if (!n) label(g, '—', x, y + 43, 10, PAL.ink);
    label(g, MINERALS[m].name, x, y + 68, 7, PAL.ink);
  });
  // telemetry
  const tx = 300;
  label(g, 'TELEMETRY', tx, y0 + 10, 8, PAL.inkDim, 'left');
  label(g, 'STAGE', tx, y0 + 38, 8, PAL.inkDim, 'left'); nixie(g, String(e.stage).padStart(3, ' '), tx + 110, y0 + 38, 22);
  label(g, 'FOCUS', tx, y0 + 70, 8, PAL.inkDim, 'left'); edgewise(g, 'lab-e1-focus', tx + 70, y0 + 62, 140, 16, e.focus);
  label(g, 'POL', tx, y0 + 100, 8, PAL.inkDim, 'left'); jewel(g, tx + 80, y0 + 100, 8, 'amber', e.pol);
  label(g, 'GRAIN', tx, y0 + 130, 8, PAL.inkDim, 'left');
  for (let i = 0; i < 3; i++) { jewel(g, tx + 80 + i * 30, y0 + 130, 7, 'amber', i === e.grain); }
  label(g, 'TURNED', tx, y0 + 158, 8, PAL.inkDim, 'left');
  for (let i = 0; i < 3; i++) edgewise(g, 'lab-e1-turn' + i, tx + 70 + i * 52, y0 + 150, 44, 12, Math.min(1, e.turned[i] / E1.needTurn));
  // the call: a mineral for each grain
  const cy = y0 + 196;
  label(g, 'CALL', 12, cy - 8, 8, PAL.inkDim, 'left');
  for (let gr = 0; gr < 3; gr++) {
    label(g, `GRAIN ${gr + 1}`, 12, cy + 22 + gr * 44, 8, gr === e.grain ? PAL.amber : PAL.ink, 'left');
    Object.keys(MINERALS).forEach((m, i) => push(g, 90 + i * 146, cy + 4 + gr * 44, 136, 36, MINERALS[m].name, e.calls[gr] === m, () => ctx.labCall('E1', { grain: gr, mineral: m }), st === 'loaded'));
  }
}

// ---------- E2 ROCK CLOCK ----------
function pageE2(g, e, st, ctx, y0) {
  label(g, 'REFERENCE', 12, y0 + 10, 8, PAL.inkDim, 'left');
  // the three peaks: 36 is air (ignore it), latch 39 and 40
  well(g, 12, y0 + 22, 250, 96);
  const X = m => 24 + (m - 35) / 7 * 226;
  g.strokeStyle = PAL.phosphor; g.lineWidth = 1.5; g.beginPath();
  for (let i = 0; i <= 120; i++) { const m = 35 + i * 7 / 120, h = [36, 39, 40].reduce((a, p, k) => a + [0.25, 0.45, 0.9][k] * Math.exp(-(((m - p) / 0.15) ** 2)), 0); g[i ? 'lineTo' : 'moveTo'](X(m), y0 + 110 - h * 78); }
  g.stroke();
  for (const [m, w, c] of [[36, 'AIR', PAL.inkDim], [39, 'LATCH', PAL.amber], [40, 'LATCH', PAL.amber]]) { typed(g, String(m), X(m), y0 + 30, 10, c); }
  label(g, 'LATCH 39 AND 40. 36 IS AIR.', 12, y0 + 132, 7.5, PAL.ink, 'left');
  // telemetry
  const tx = 300;
  label(g, 'TELEMETRY', tx, y0 + 10, 8, PAL.inkDim, 'left');
  label(g, 'VAC', tx, y0 + 36, 8, PAL.inkDim, 'left'); edgewise(g, 'lab-e2-vac', tx + 50, y0 + 28, 150, 16, e.vac, 0); g.fillStyle = 'rgba(143,176,90,0.6)'; g.fillRect(tx + 50 + 150 * 0.9, y0 + 40, 15, 4);
  label(g, 'BEAM', tx, y0 + 66, 8, PAL.inkDim, 'left'); jewel(g, tx + 70, y0 + 66, 8, e.burnt ? 'red' : 'green', e.burnt ? blinkOn() : e.beam);
  if (e.burnt) nixie(g, String(e.burnt).padStart(2, '0'), tx + 120, y0 + 66, 18);
  label(g, 'MASS', tx, y0 + 96, 8, PAL.inkDim, 'left'); nixie(g, e.mass.toFixed(2), tx + 130, y0 + 96, 20);
  label(g, 'PEAK 1', tx, y0 + 128, 8, PAL.inkDim, 'left'); label(g, 'PEAK 2', tx, y0 + 156, 8, PAL.inkDim, 'left');
  const c = i => e.latched[i] ? String(e.latched[i].counts).padStart(6, ' ') : '      ';
  // the latched counts, as latched (the Scientist decides which is which from the masses)
  e.latched.forEach((l, i) => { typed(g, l.mass.toFixed(2), tx + 200, y0 + 128 + i * 28, 10, PAL.inkDim, 'right'); });
  nixie(g, c(0), tx + 120, y0 + 128, 18); nixie(g, c(1), tx + 120, y0 + 156, 18);
  // the slide rule: ratio over age. Click to set the cursor, then CALL.
  const ry = y0 + 196, rx = 30, rw = 380;
  label(g, 'SLIDE RULE', 12, ry - 12, 8, PAL.inkDim, 'left');
  g.fillStyle = PAL.dial; g.fillRect(rx - 10, ry, rw + 20, 74);
  g.strokeStyle = PAL.inkDial; g.lineWidth = 1;
  const RX = r => rx + (r - 20) / 80 * rw;
  for (let r = 20; r <= 100; r += 2) { const x = RX(r), big = r % 10 === 0; g.beginPath(); g.moveTo(x, ry + 4); g.lineTo(x, ry + (big ? 18 : 11)); g.stroke(); if (big) typed(g, String(r), x, ry + 26, 9, PAL.inkDial); }
  for (let a = 2.6; a <= 4.21; a += 0.1) { const x = RX(ratioOf(a)), big = Math.round(a * 10) % 5 === 0; g.beginPath(); g.moveTo(x, ry + 70); g.lineTo(x, ry + (big ? 54 : 60)); g.stroke(); if (big) typed(g, a.toFixed(1), x, ry + 46, 9, PAL.inkDial); }
  label(g, 'TOP: RATIO 40 / 39     BOTTOM: AGE, BILLION YEARS', rx - 10, ry + 88, 7, PAL.inkDim, 'left');
  const cur = RX(labSel.slide);
  g.strokeStyle = PAL.red; g.lineWidth = 2; g.beginPath(); g.moveTo(cur, ry - 4); g.lineTo(cur, ry + 78); g.stroke();
  btn(rx - 10, ry, rw + 20, 74, p => { labSel.slide = Math.max(20, Math.min(100, 20 + (p.x - rx) / rw * 80)); });
  const age = ageOf(labSel.slide);
  nixie(g, age.toFixed(2), 470, ry + 22, 24); label(g, 'BN YR', 470, ry + 46, 7, PAL.inkDim);
  push(g, 430, ry + 84, 90, 34, 'CALL', false, () => ctx.labCall('E2', +age.toFixed(2)), st === 'loaded' && e.latched.length >= 2);
}

// ---------- E3 FIRE FOUNTAIN ----------
function pageE3(g, e, st, ctx, y0) {
  label(g, 'REFERENCE', 12, y0 + 10, 8, PAL.inkDim, 'left');
  E3.steps.forEach((b, i) => {
    const y = y0 + 30 + i * 28, on = e.step === i;
    g.fillStyle = on ? PAL.amber : PAL.dial; g.fillRect(12, y - 11, 250, 22);
    typed(g, `STEP ${i + 1}  ${b.lo}-${b.hi} C`, 20, y, 10, PAL.inkDial, 'left'); label(g, b.gas, 254, y + 1, 7, PAL.inkDial, 'right');
    if (e.lost[i]) { g.strokeStyle = PAL.red; g.lineWidth = 2; g.beginPath(); g.moveTo(12, y); g.lineTo(262, y); g.stroke(); }
  });
  label(g, 'HOLD 12 S IN EACH BAND', 12, y0 + 122, 7.5, PAL.ink, 'left');
  // telemetry: the temperature, the breaker, the holds
  const tx = 300;
  label(g, 'TELEMETRY', tx, y0 + 10, 8, PAL.inkDim, 'left');
  label(g, 'TEMP', tx, y0 + 36, 8, PAL.inkDim, 'left'); nixie(g, String(e.temp).padStart(4, ' '), tx + 120, y0 + 36, 22); label(g, 'C', tx + 175, y0 + 38, 8, PAL.inkDim);
  label(g, 'SET', tx, y0 + 66, 8, PAL.inkDim, 'left'); typed(g, String(e.set), tx + 150, y0 + 66, 12, PAL.ink, 'right');
  label(g, 'POWER', tx, y0 + 92, 8, PAL.inkDim, 'left'); jewel(g, tx + 80, y0 + 92, 8, 'green', e.heat);
  // The 2-player seat is its own Technician: it throws the breaker here. The Scientist has to ask.
  if (ctx.canBreak) push(g, tx + 100, y0 + 80, 100, 26, e.heat ? 'POWER OFF' : 'POWER ON', e.heat, () => ctx.breaker('furnace', !e.heat));
  else if (!e.heat) label(g, 'ASK TECH', tx + 100, y0 + 93, 7, PAL.amber, 'left');
  label(g, 'DOOR', tx, y0 + 118, 8, PAL.inkDim, 'left'); jewel(g, tx + 80, y0 + 118, 8, 'red', e.door === 'open');
  for (let i = 0; i < 3; i++) { label(g, String(i + 1), tx + i * 70, y0 + 146, 8, PAL.inkDim, 'left'); edgewise(g, 'lab-e3-h' + i, tx + 14 + i * 70, y0 + 138, 48, 12, Math.min(1, e.hold[i] / E3.hold)); }
  // the recorder: the gas as it comes off, with the water scale marked
  const ry = y0 + 172, rw = 400, rh = 96;
  well(g, 8, ry - 4, rw + 8, rh + 8); g.fillStyle = PAL.dial; g.fillRect(12, ry, rw, rh);
  for (const [lv, w] of Object.entries(E3.levels)) { const y = ry + rh * (1 - w); g.strokeStyle = 'rgba(36,34,30,0.25)'; g.beginPath(); g.moveTo(12, y); g.lineTo(12 + rw, y); g.stroke(); label(g, lv.toUpperCase(), 12 + rw + 26, y, 7, PAL.ink); }
  g.strokeStyle = PAL.inkDial; g.lineWidth = 1.6; g.beginPath();
  trace.gas.forEach((v, i) => { const x = 12 + rw * i / 180, y = ry + rh * (1 - v); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  label(g, 'WATER', 448, ry + rh + 16, 8, PAL.inkDim);
  Object.keys(E3.levels).forEach((lv, i) => push(g, 12 + i * 112, ry + rh + 12, 104, 32, lv.toUpperCase(), e.called === lv, () => ctx.labCall('E3', lv), st === 'loaded' && e.step >= 3));
}

// ---------- E4 COLD TRAP ----------
function pageE4(g, e, st, ctx, y0) {
  label(g, 'REFERENCE', 12, y0 + 10, 8, PAL.inkDim, 'left');
  label(g, 'INTO THE BOX IN 90 S', 12, y0 + 32, 8, PAL.ink, 'left');
  label(g, 'WEIGH, VALVE, WEIGH', 12, y0 + 54, 8, PAL.ink, 'left');
  label(g, 'WATER = LOSS / FIRST', 12, y0 + 76, 8, PAL.ink, 'left');
  // telemetry
  const tx = 300;
  label(g, 'TELEMETRY', tx, y0 + 10, 8, PAL.inkDim, 'left');
  label(g, 'WARM', tx, y0 + 36, 8, PAL.inkDim, 'left'); nixie(g, String(Math.min(999, e.warm)).padStart(3, ' '), tx + 110, y0 + 36, 22);
  jewel(g, tx + 170, y0 + 36, 8, 'red', e.warm > E4.clockA && blinkOn());
  label(g, 'W1', tx, y0 + 66, 8, PAL.inkDim, 'left'); nixie(g, e.w1 !== null ? e.w1.toFixed(1).padStart(5, ' ') : '     ', tx + 110, y0 + 66, 18); jewel(g, tx + 180, y0 + 66, 6, e.steady[0] === false ? 'red' : 'green', e.steady[0] !== undefined);
  label(g, 'W2', tx, y0 + 94, 8, PAL.inkDim, 'left'); nixie(g, e.w2 !== null ? e.w2.toFixed(1).padStart(5, ' ') : '     ', tx + 110, y0 + 94, 18); jewel(g, tx + 180, y0 + 94, 6, e.steady[1] === false ? 'red' : 'green', e.steady[1] !== undefined);
  if (ctx.canBreak) { const cold = !!ctx.state()?.lab?.breakers?.coldbox; push(g, 12, y0 + 100, 150, 26, cold ? 'COLD BOX ON' : 'COLD BOX OFF', cold, () => ctx.breaker('coldbox', !cold)); }
  label(g, 'VALVE', tx, y0 + 122, 8, PAL.inkDim, 'left'); jewel(g, tx + 80, y0 + 122, 7, 'amber', e.valve); edgewise(g, 'lab-e4-sub', tx + 100, y0 + 115, 110, 14, e.sub / E4.subSeconds);
  if (e.w1 !== null && e.w2 !== null) { const pct = (100 * (e.w1 - e.w2) / e.w1).toFixed(1); typed(g, `WATER ${pct} %`, tx, y0 + 152, 11, PAL.amber, 'left'); }
  // the D/H meter, with the three sources marked on its scale
  const my = y0 + 190, mx = 30, mw = 460;
  g.fillStyle = PAL.dial; g.fillRect(mx - 10, my, mw + 20, 60);
  const X = v => mx + v / E4.scale * mw;
  for (const [k, src] of Object.entries(E4.sources)) { g.fillStyle = 'rgba(122,153,176,0.35)'; g.fillRect(X(src.lo), my + 4, X(src.hi) - X(src.lo), 22); label(g, src.name, (X(src.lo) + X(src.hi)) / 2, my + 15, 6.5, PAL.inkDial); }
  g.strokeStyle = PAL.inkDial; g.lineWidth = 1;
  for (let v = 0; v <= E4.scale; v += 20) { const x = X(v); g.beginPath(); g.moveTo(x, my + 30); g.lineTo(x, my + (v % 100 ? 36 : 42)); g.stroke(); if (v % 100 === 0) typed(g, String(v), x, my + 50, 9, PAL.inkDial); }
  label(g, 'D/H PPM', mx + mw - 30, my + 50, 6.5, PAL.inkDim);
  if (e.dh !== null) { const x = X(needle('lab-e4-dh', e.dh)); g.strokeStyle = PAL.red; g.lineWidth = 3; g.beginPath(); g.moveTo(x, my + 2); g.lineTo(x, my + 44); g.stroke(); }
  Object.entries(E4.sources).forEach(([k, src], i) => push(g, 12 + i * 140, my + 72, 130, 34, src.name, e.called === k, () => ctx.labCall('E4', k), st === 'loaded' && e.dh !== null));
}
export { FONT };

// The four experiments as a row of tiles: the glyph of the sample each needs, a lamp for its state, the grade
// once done. Mission Ops' board and the 2-player desk.
export function labTiles(g, x, y, w, s, size = 30) {
  const lab = s.lab; if (!lab) return;
  const step = w / 4;
  EXP_IDS.forEach((id, i) => {
    const b = lab.board[id], cx = x + step * i + step / 2, [col, lv] = STATE_LAMP[b.state];
    tile(g, cx - size * 0.45, y, size, '', b.state === 'done' ? 'green' : 'amber', b.state === 'locked' ? 0 : b.state === 'done' ? 1 : b.state === 'loaded' ? (blinkOn() ? 1 : 0.45) : 0.6, c => drawGlyph(g, GLYPH[id], cx - size * 0.45, y, size * 0.6, c));
    if (b.grade) nixie(g, b.grade, cx + size * 0.6, y, size * 0.8);
  });
}

// The Technician's lab breakers: a lever and a lamp for each load, lever up is on. A click throws it.
export const BREAKER_IDS = ['furnace', 'coldbox'];
export function breakers(g, x, y, s) {
  const on = s.lab?.breakers || {};
  BREAKER_IDS.forEach((id, i) => {
    const bx = x + i * 56;
    jewel(g, bx, y, 7, 'green', !!on[id]);
    well(g, bx - 12, y + 14, 24, 44);
    g.fillStyle = PAL.bakelite; g.fillRect(bx - 4, y + 18, 8, 36);
    const ly = on[id] ? y + 24 : y + 48;
    g.fillStyle = PAL.dial; g.beginPath(); g.roundRect(bx - 9, ly - 6, 18, 12, 3); g.fill();
    icon(g, id === 'furnace' ? 'bolt' : 'o2', bx, y + 72, 16, PAL.inkDim);
    label(g, id === 'furnace' ? 'FURN' : 'COLD', bx, y + 90, 7, PAL.inkDim);
  });
}
