// Mock-ups for docs/design/mission-control-consoles.md. Not game code: nothing in client/ loads this.
// It draws one still of each proposed console with the game's own palette, fonts and icon functions, so the
// pictures in the design doc show the real colours and the real silhouettes. Serve the repo root and open
//   /docs/design/mission-control-consoles/mock.html?seat=ops|tech|sci[&aux=power|air]
import { PAL, FONT, SAMPLE_COL, nixie, jewel } from '/client/shared/palette.js';
import { drawTool, drawFault, drawGlyph, drawSample } from '/client/shared/icons.js';

const q = new URLSearchParams(location.search), seat = q.get('seat') || 'ops', aux = q.get('aux') || 'air';
const W = 1366, H = 768, cv = document.getElementById('c'), g = cv.getContext('2d');
const dpr = window.devicePixelRatio || 1;
cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g.scale(dpr, dpr);
await Promise.all(['16px Michroma', '16px "Courier Prime"', 'bold 16px "Courier Prime"'].map(f => document.fonts.load(f)));
const TAU = Math.PI * 2, phos = a => `rgba(156,194,122,${a})`;

// ---------- primitives ----------
function label(text, x, y, size = 10, color = PAL.inkDim, align = 'center') {
  g.font = `${size}px ${FONT.label}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
}
function plate(text, x, y, w, size = 9) {
  g.fillStyle = PAL.dial; g.fillRect(x - w / 2, y - size, w, size * 2);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - size + 0.5, w - 1, size * 2 - 1);
  label(text, x, y + 1, size, PAL.inkDial);
}
function face(x, y, w, h, deep = false) { // a console panel: painted steel, a bezel, four screws
  g.fillStyle = deep ? PAL.consoleDeep : PAL.console; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = 'rgba(143,138,120,0.07)'; g.lineWidth = 1;
  for (let yy = y + 0.5; yy < y + h; yy += 4) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
  g.restore();
  g.strokeStyle = PAL.bezel; g.lineWidth = 1.5; g.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  if (!deep) for (const [sx, sy] of [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]) {
    g.fillStyle = PAL.bezel; g.beginPath(); g.arc(sx, sy, 3, 0, TAU); g.fill();
    g.strokeStyle = PAL.bakelite; g.lineWidth = 1; g.beginPath(); g.moveTo(sx - 2, sy - 1); g.lineTo(sx + 2, sy + 1); g.stroke();
  }
}
function well(x, y, w, h) { g.fillStyle = PAL.bakelite; g.fillRect(x, y, w, h); g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
// An icon is drawn in a 100-unit box, one colour, round caps: the house style of client/shared/icons.js.
function icon(name, x, y, size, color) {
  const u = size / 100;
  g.save(); g.translate(x, y); g.scale(u, u);
  g.fillStyle = g.strokeStyle = color; g.lineCap = g.lineJoin = 'round'; g.lineWidth = 8;
  const L = (...p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); };
  const O = (cx, cy, r, fill) => { g.beginPath(); g.arc(cx, cy, r, 0, TAU); fill ? g.fill() : g.stroke(); };
  if (name === 'clock') { O(0, 0, 38); L(0, -22, 0, 0, 16, 10); }
  else if (name === 'o2') { g.beginPath(); g.roundRect(-20, -26, 40, 70, 16); g.stroke(); g.fillRect(-9, -44, 18, 14); L(-22, -44, 22, -44); }
  else if (name === 'rock') { g.beginPath(); g.moveTo(-36, 22); g.lineTo(-26, -18); g.lineTo(4, -34); g.lineTo(34, -8); g.lineTo(30, 26); g.closePath(); g.fill(); }
  else if (name === 'score') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 17 : 40; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
  else if (name === 'helmet') { g.beginPath(); g.arc(0, -6, 34, Math.PI * 0.85, Math.PI * 2.15); g.closePath(); g.stroke(); g.beginPath(); g.roundRect(-20, -18, 40, 24, 10); g.fill(); L(-30, 34, 30, 34); }
  else if (name === 'headset') { g.beginPath(); g.arc(0, 0, 32, Math.PI, 0); g.stroke(); g.fillRect(-42, -4, 16, 30); g.fillRect(26, -4, 16, 30); L(-34, 26, -34, 38, -6, 40); O(0, 40, 6, true); }
  else if (name === 'wheel') { g.lineWidth = 14; O(0, 0, 32); g.lineWidth = 6; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; L(0, 0, Math.cos(a) * 26, Math.sin(a) * 26); } O(0, 0, 8, true); }
  else if (name === 'lens') { O(-8, -8, 26); g.lineWidth = 12; L(12, 12, 36, 36); }
  else if (name === 'link') { L(0, 40, 0, -6); L(-18, 40, 18, 40); O(0, -12, 7, true); g.lineWidth = 6; for (const r of [22, 36]) { g.beginPath(); g.arc(0, -12, r, -Math.PI * 0.8, -Math.PI * 0.2); g.stroke(); } }
  else if (name === 'mic') { g.beginPath(); g.roundRect(-14, -42, 28, 52, 14); g.fill(); g.beginPath(); g.arc(0, 0, 28, 0.1, Math.PI - 0.1); g.stroke(); L(0, 28, 0, 42); L(-16, 42, 16, 42); }
  else if (name === 'bell') { g.beginPath(); g.moveTo(-34, 24); g.quadraticCurveTo(-26, 14, -24, -8); g.arc(0, -10, 24, Math.PI, 0); g.quadraticCurveTo(26, 14, 34, 24); g.closePath(); g.fill(); O(0, 36, 7, true); L(0, -42, 0, -34); }
  else if (name === 'fixed') { g.lineWidth = 12; L(-34, 2, -10, 26, 36, -26); }
  else if (name === 'meteor') { O(18, 18, 18, true); g.lineWidth = 7; L(-40, -40, 2, 2); L(-18, -42, 12, -12); L(-42, -18, -12, 12); }
  else if (name === 'bolt') { g.beginPath(); g.moveTo(10, -44); g.lineTo(-22, 6); g.lineTo(-2, 6); g.lineTo(-12, 44); g.lineTo(24, -8); g.lineTo(4, -8); g.closePath(); g.fill(); }
  else if (name === 'dark') { O(0, -8, 24); L(-10, 26, 10, 26); L(-8, 36, 8, 36); g.lineWidth = 9; L(-38, -40, 38, 36); }
  else if (name === 'dud') { g.globalAlpha = 0.55; g.beginPath(); g.moveTo(-36, 22); g.lineTo(-26, -18); g.lineTo(4, -34); g.lineTo(34, -8); g.lineTo(30, 26); g.closePath(); g.fill(); g.globalAlpha = 1; g.lineWidth = 10; L(-34, -34, 34, 34); L(34, -34, -34, 34); }
  else if (name === 'banked') { g.beginPath(); g.moveTo(-40, -6); g.lineTo(-30, -34); g.lineTo(-4, -40); g.lineTo(14, -22); g.lineTo(10, -4); g.closePath(); g.fill(); g.lineWidth = 9; L(-40, 12, -40, 40, 40, 40, 40, 12); L(8, 14, 20, 26, 40, -2); }
  else if (name === 'glove') { g.beginPath(); g.roundRect(-26, -8, 44, 46, 10); g.stroke(); for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(-26 + i * 11, -40 + Math.abs(i - 1.5) * 4, 9, 34, 4); g.stroke(); } g.beginPath(); g.roundRect(20, 0, 10, 26, 5); g.stroke(); }
  else if (name === 'home') { g.beginPath(); g.arc(0, 14, 34, Math.PI, 0); g.closePath(); g.fill(); g.fillRect(-6, -40, 4, 22); g.beginPath(); g.moveTo(-2, -40); g.lineTo(16, -34); g.lineTo(-2, -28); g.fill(); }
  else if (name === 'rider') { O(0, -30, 11, true); g.lineWidth = 10; L(0, -16, 0, 12); L(0, -6, 18, 2); g.lineWidth = 8; L(-40, 18, 40, 18); O(-24, 32, 9); O(24, 32, 9); }
  else if (name === 'eye') { g.beginPath(); g.moveTo(-40, 0); g.quadraticCurveTo(0, -36, 40, 0); g.quadraticCurveTo(0, 36, -40, 0); g.stroke(); O(0, 0, 11, true); }
  else if (name === 'chase') { g.fillRect(-14, 8, 28, 22); O(-16, 34, 7, true); O(16, 34, 7, true); g.lineWidth = 6; g.beginPath(); g.roundRect(-40, -42, 30, 22, 4); g.stroke(); g.setLineDash([6, 8]); L(-18, -22, 0, 4); }
  else if (name === 'scout') { g.beginPath(); g.roundRect(-30, -14, 60, 24, 6); g.fill(); O(-22, 22, 11, true); O(22, 22, 11, true); g.lineWidth = 6; L(14, -14, 14, -38); O(14, -40, 5, true); }
  else if (name === 'hauler') { g.fillRect(-42, -2, 84, 14); g.fillRect(-42, -26, 22, 26); O(-28, 24, 11, true); O(0, 24, 11, true); O(28, 24, 11, true); g.lineWidth = 6; L(-14, -4, -14, -18, 40, -18, 40, -4); }
  else if (name === 'cover') { g.lineWidth = 9; g.beginPath(); g.arc(0, 10, 38, Math.PI, 0); g.stroke(); L(-42, 10, 42, 10); O(0, -6, 8, true); L(0, 2, 0, 10); }
  else if (name === 'tray') { g.lineWidth = 7; L(-44, 14, 44, 14); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-33 + i * 22, 14, 9, 0, Math.PI); g.stroke(); } }
  else if (name === 'port') { g.lineWidth = 8; L(-34, -30, -14, 4, -14, 34); L(34, -30, 14, 4, 14, 34); L(-40, -30, 40, -30); }
  else if (name === 'scope') { O(0, 0, 38); g.lineWidth = 5; O(0, 0, 20); L(0, 0, 26, -26); O(-12, 10, 3, true); }
  else if (name === 'card') { g.beginPath(); g.roundRect(-36, -28, 72, 56, 4); g.stroke(); g.beginPath(); g.moveTo(-24, 12); g.lineTo(-18, -8); g.lineTo(-2, -14); g.lineTo(8, 0); g.lineTo(4, 14); g.closePath(); g.fill(); g.lineWidth = 5; L(18, -10, 28, -10); L(18, 4, 28, 4); }
  else if (name === 'battery') { g.beginPath(); g.roundRect(-38, -20, 70, 40, 4); g.stroke(); g.fillRect(32, -9, 8, 18); g.fillRect(-30, -12, 16, 24); g.fillRect(-10, -12, 16, 24); }
  else if (name === 'speed') { g.beginPath(); g.arc(0, 14, 36, Math.PI, 0); g.stroke(); L(0, 14, 18, -12); O(0, 14, 6, true); }
  g.restore();
}
// An event light: a square annunciator tile with a picture cast in the lens. Off is a dark jewel you can still read.
function tile(x, y, s, name, colour, on, draw) {
  g.fillStyle = PAL.bezel; g.fillRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4);
  const lit = PAL[colour], off = PAL[colour + 'Off'];
  if (on) { g.shadowColor = lit; g.shadowBlur = 6; }
  g.fillStyle = on ? lit : off; g.fillRect(x - s / 2, y - s / 2, s, s); g.shadowBlur = 0;
  const ink = on ? PAL.inkDial : 'rgba(143,138,120,0.55)';
  draw ? draw(ink) : icon(name, x, y, s * 0.7, ink);
}
function keycap(x, y, w, h, text, lit = false, draw) {
  g.fillStyle = PAL.bakelite; g.beginPath(); g.roundRect(x - w / 2, y - h / 2 + 3, w, h, 4); g.fill();
  g.fillStyle = lit ? PAL.dial : '#4a4a44'; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h - 3, 4); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
  const ink = lit ? PAL.inkDial : PAL.ink;
  if (draw) draw(ink); else label(text, x, y - 1, Math.min(11, h * 0.36), ink);
}
function arrow(x, y, dir, c) { g.save(); g.translate(x, y); g.rotate(dir * Math.PI / 2); g.fillStyle = c; g.beginPath(); g.moveTo(0, -6); g.lineTo(6, 5); g.lineTo(-6, 5); g.closePath(); g.fill(); g.restore(); }
function flow(x0, y0, x1, y1) { g.strokeStyle = PAL.inkDim; g.lineWidth = 2; g.setLineDash([2, 5]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); const a = Math.atan2(y1 - y0, x1 - x0); g.fillStyle = PAL.inkDim; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a - 0.5) * 9, y1 - Math.sin(a - 0.5) * 9); g.lineTo(x1 - Math.cos(a + 0.5) * 9, y1 - Math.sin(a + 0.5) * 9); g.fill(); }
// An edgewise meter: a cream scale in a slot, the bad range painted red, a dark pointer.
function edgewise(x, y, w, h, v, redBelow = 0) {
  well(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = PAL.dial; g.fillRect(x, y, w, h);
  if (redBelow) { g.fillStyle = 'rgba(196,82,58,0.7)'; g.fillRect(x, y + h - 5, w * redBelow, 5); }
  g.strokeStyle = PAL.inkDial;
  for (let i = 0; i <= 10; i++) { g.lineWidth = i % 5 ? 1 : 2; g.beginPath(); g.moveTo(x + w * i / 10, y); g.lineTo(x + w * i / 10, y + (i % 5 ? h * 0.3 : h * 0.5)); g.stroke(); }
  const px = x + w * v; g.fillStyle = PAL.inkDial; g.beginPath(); g.moveTo(px, y + 2); g.lineTo(px + 5, y + h); g.lineTo(px - 5, y + h); g.closePath(); g.fill();
}
function dial(x, y, r, value, max, name, { redBelow = 0, redAbove = Infinity, fixed = 0, ico } = {}) {
  const ang = v => Math.PI * 1.15 + Math.max(0, Math.min(1, v / max)) * Math.PI * 0.7;
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r * 1.12, Math.PI, TAU); g.lineTo(x + r * 1.12, y + r * 0.22); g.lineTo(x - r * 1.12, y + r * 0.22); g.fill();
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(x, y, r * 1.03, Math.PI, TAU); g.lineTo(x + r * 1.03, y + r * 0.14); g.lineTo(x - r * 1.03, y + r * 0.14); g.fill();
  g.lineWidth = r * 0.1; g.lineCap = 'butt'; g.strokeStyle = 'rgba(196,82,58,0.7)';
  if (redBelow > 0) { g.beginPath(); g.arc(x, y, r * 0.86, ang(0), ang(redBelow)); g.stroke(); }
  if (redAbove < max) { g.beginPath(); g.arc(x, y, r * 0.86, ang(redAbove), ang(max)); g.stroke(); }
  g.strokeStyle = PAL.inkDial; g.fillStyle = PAL.inkDial;
  for (let i = 0; i <= 20; i++) {
    const a = ang(max * i / 20), big = i % 5 === 0, r0 = r * (big ? 0.72 : 0.8);
    g.lineWidth = big ? 2.5 : 1.2; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke();
    if (big) { g.font = `bold ${Math.round(r * 0.13)}px ${FONT.type}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.round(max * i / 20 * 10) / 10), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); }
  }
  if (ico) icon(ico, x, y - r * 0.34, r * 0.26, 'rgba(36,34,30,0.55)');
  const a = ang(value);
  g.strokeStyle = PAL.inkDial; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.12, y - Math.sin(a) * r * 0.12); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke();
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(x, y, r * 0.07, 0, TAU); g.fill();
  nixie(g, fixed ? value.toFixed(fixed) : String(Math.round(value)).padStart(3, ' '), x - r * 0.12, y + r * 0.44, r * 0.24);
  jewel(g, x + r * 0.62, y + r * 0.44, r * 0.09, 'red', value < redBelow || value > redAbove);
  plate(name, x, y + r * 0.8, r * 1.4, r * 0.11);
}
// A strip-chart recorder: cream paper moving left under a pen. The newest value is at the pen, on the right.
function strip(x, y, w, h, series, { red } = {}) {
  well(x - 4, y - 4, w + 8, h + 8);
  g.fillStyle = PAL.dial; g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(36,34,30,0.18)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x, y + h * i / 4); g.lineTo(x + w, y + h * i / 4); g.stroke(); }
  for (let i = 0; i <= 9; i++) { const xx = x + w - 30 - i * (w - 30) / 9; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke(); }
  if (red) { g.fillStyle = 'rgba(196,82,58,0.28)'; g.fillRect(x, y + h * (1 - red), w - 30, h * red); }
  g.strokeStyle = PAL.inkDial; g.lineWidth = 1.8; g.lineJoin = 'round'; g.beginPath();
  series.forEach((v, i) => { const xx = x + (w - 30) * i / (series.length - 1), yy = y + h * (1 - v); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); });
  g.stroke();
  const py = y + h * (1 - series[series.length - 1]);
  g.fillStyle = PAL.bezel; g.fillRect(x + w - 26, y, 26, h); // the pen carriage
  g.fillStyle = PAL.red; g.beginPath(); g.moveTo(x + w - 30, py); g.lineTo(x + w - 14, py - 6); g.lineTo(x + w - 14, py + 6); g.closePath(); g.fill();
  for (const [f, t] of [[0, '60'], [0.5, '30'], [1, '0']]) { g.font = `9px ${FONT.type}`; g.textAlign = 'center'; g.fillStyle = PAL.inkDim; g.fillText(t, x + (w - 30) * f, y + h + 14); }
}

// ---------- the frame every seat shares ----------
const SEATS = [['helmet', 'EVA'], ['headset', 'OPS'], ['wheel', 'TECH'], ['lens', 'SCI']];
function statusStrip(me, events) {
  face(0, 0, W, 74);
  // whose desk this is
  well(14, 12, 150, 50); icon(SEATS[me][0], 44, 37, 34, PAL.amber); label(SEATS[me][1], 108, 38, 15, PAL.ink);
  // mission clock, suit oxygen, samples, score
  icon('clock', 198, 37, 26, PAL.inkDim); nixie(g, '4:12', 262, 37, 30);
  icon('o2', 338, 37, 28, PAL.inkDim); edgewise(360, 26, 150, 22, 0.71, 0.25); nixie(g, '71', 548, 37, 26);
  icon('rock', 606, 37, 24, PAL.inkDim); for (let i = 0; i < 4; i++) jewel(g, 640 + i * 26, 37, 8, 'green', i < 1);
  icon('score', 762, 37, 24, PAL.inkDim); nixie(g, ' 250', 818, 37, 26);
  // the crew: one lamp a seat, your own ringed in amber
  SEATS.forEach(([ic], i) => {
    const x = 896 + i * 40;
    if (i === me) { g.strokeStyle = PAL.amber; g.lineWidth = 1.5; g.strokeRect(x - 17, 9, 34, 56); }
    icon(ic, x, 24, 20, i === me ? PAL.ink : PAL.inkDim); jewel(g, x, 50, 7, 'green', true);
  });
  // the event lights: the same eight on every desk, in the same order
  const EV = [['bell', 'red'], ['fixed', 'green'], ['meteor', 'red'], ['dark', 'red'], ['bolt', 'green'], ['banked', 'green'], ['dud', 'amber'], ['link', 'red']];
  EV.forEach(([ic, col], i) => tile(1076 + i * 37, 37, 30, ic, col, events.includes(ic)));
}
function keyset(draw) { face(0, H - 78, W, 78); draw(H - 39); }
function title(x, y, w, ic, text) { well(x, y, w, 26); icon(ic, x + 16, y + 13, 16, PAL.inkDim); label(text, x + 32, y + 14, 9, PAL.inkDim, 'left'); }

// ---------- Mission Ops ----------
function ops() {
  statusStrip(1, ['bell']);
  const top = 86, bot = H - 90, h = bot - top;
  // left wing: the astronaut's two hands, and the voice loop
  face(12, top, 300, h);
  title(26, top + 14, 272, 'glove', 'HANDS');
  [['L', null, null], ['R', 'brush', null]].forEach(([side, tool], i) => {
    const x = 34 + i * 136;
    well(x, top + 52, 120, 120);
    g.save(); if (!i) { g.translate(x + 60, 0); g.scale(-1, 1); g.translate(-(x + 60), 0); }
    icon('glove', x + 60, top + 112, 96, 'rgba(143,138,120,0.28)'); g.restore();
    if (tool) drawTool(g, tool, x + 60, top + 112, 78, PAL.ink);
    jewel(g, x + 44, top + 190, 6, 'green', !!tool); label(side, x + 68, top + 191, 12, PAL.inkDim);
  });
  title(26, top + 222, 272, 'mic', 'VOICE LOOP');
  // the talk key: a lit push-button with TX and RX lamps and a level meter, as on an intercom keyset
  well(34, top + 260, 256, 250);
  jewel(g, 84, top + 300, 12, 'red', false); icon('headset', 84, top + 332, 20, PAL.inkDim);
  jewel(g, 240, top + 300, 12, 'blue', true); icon('helmet', 240, top + 332, 20, PAL.blue);
  // level meter
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(162, top + 330, 44, Math.PI, 0); g.fill(); g.strokeStyle = PAL.bezel; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(196,82,58,0.7)'; g.lineWidth = 5; g.beginPath(); g.arc(162, top + 330, 36, -0.7, -0.15); g.stroke();
  g.strokeStyle = PAL.inkDial; g.lineWidth = 2; g.beginPath(); g.moveTo(162, top + 330); g.lineTo(162 + Math.cos(-1.9) * 38, top + 330 + Math.sin(-1.9) * 38); g.stroke();
  keycap(162, top + 430, 210, 92, '', false, c => { icon('mic', 112, top + 426, 46, c); g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(150, top + 412, 100, 26); label('SPACE', 200, top + 426, 9, c); });

  // centre: the tool board, a plan of the hall with each tool in its bay
  face(324, top, 660, h);
  title(338, top + 14, 632, 'lens', 'TOOL BOARD');
  const bx = 346, by = top + 54, bw = 616, bh = 300;
  well(bx, by, bw, bh);
  // the hall, west up: eight bays where a tool can lie, engraved with the names Ops says out loud
  const BAYS = [['BENCH', 0, 0, 2, ['patch']], ['LOCKERS', 2, 0, 1, ['welder']], ['EAST WALL', 3, 0, 1, []], ['CORRIDOR', 4, 0, 1, ['tire']],
    ['WEST DOOR', 0, 1, 1, []], ['HALL', 1, 1, 2, []], ['LIFE SUPPORT', 3, 1, 1, ['gen']], ['NORTH END', 4, 1, 1, []]];
  const cw = (bw - 28) / 5, ch = (bh - 52) / 2;
  for (const [name, cx, cy, span, tools] of BAYS) {
    const x = bx + 14 + cx * cw, y = by + 14 + cy * (ch + 12), w = cw * span - 8;
    g.fillStyle = tools.length ? 'rgba(224,163,71,0.10)' : 'rgba(143,138,120,0.05)'; g.fillRect(x, y, w, ch);
    g.strokeStyle = tools.length ? PAL.amber : PAL.rule; g.lineWidth = tools.length ? 1.5 : 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, ch - 1);
    label(name, x + 8, y + 13, 8, tools.length ? PAL.ink : PAL.inkDim, 'left');
    tools.forEach((t, i) => drawTool(g, t, x + w / 2 + (i - (tools.length - 1) / 2) * 70, y + ch / 2 + 10, 62, PAL.amber));
  }
  // outside: the same idea, one bay per landmark the server already names
  const OUT = [['home', 'HAB', []], ['bolt', 'SOLAR', []], ['hauler', 'ROVER', []], ['rock', 'FIELD', []]];
  label('OUTSIDE', 346, by + bh + 22, 9, PAL.inkDim, 'left');
  OUT.forEach(([ic, name], i) => {
    const x = 440 + i * 132, y = by + bh + 8;
    g.strokeStyle = PAL.rule; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, 120, 30);
    icon(ic, x + 18, y + 15, 18, PAL.inkDim); label(name, x + 36, y + 16, 8, PAL.inkDim, 'left');
  });
  // the roster: one silhouette a tool, a lamp for its state (green in hand, amber lying, dark used up)
  const ry = by + bh + 56;
  ['brush', 'patch', 'welder', 'tire', 'gen'].forEach((t, i) => {
    const x = 400 + i * 124, st = t === 'brush' ? 'hand' : 'loose';
    well(x - 40, ry, 80, 74); drawTool(g, t, x, ry + 34, 50, PAL.ink);
    jewel(g, x, ry + 90, 7, st === 'hand' ? 'green' : 'amber', true);
  });

  // right wing: where the samples are on their way home
  face(996, top, 358, h);
  title(1010, top + 14, 330, 'rock', 'SAMPLES');
  const cx = 1175;
  well(1018, top + 54, 314, 96); icon('glove', 1060, top + 102, 54, PAL.inkDim);
  for (let i = 0; i < 2; i++) tile(1160 + i * 70, top + 102, 46, 'rock', 'amber', i === 0);
  flow(cx, top + 156, cx, top + 182);
  well(1018, top + 188, 314, 96); icon('hauler', 1060, top + 236, 54, PAL.inkDim);
  for (let i = 0; i < 4; i++) tile(1126 + i * 52, top + 236, 40, 'rock', 'green', i < 2);
  flow(cx, top + 290, cx, top + 316);
  well(1018, top + 322, 314, 130); icon('port', 1060, top + 370, 54, PAL.inkDim);
  nixie(g, '1', 1150, top + 366, 44); for (let i = 0; i < 4; i++) jewel(g, 1214 + i * 30, top + 366, 10, 'green', i < 1);
  for (let i = 0; i < 4; i++) drawGlyph(g, ['diamond', 'dots', 'triangle', 'star'][i], 1214 + i * 30, top + 400, 13, i < 1 ? PAL.ink : PAL.inkDim);
  icon('dud', 1150, top + 424, 22, PAL.inkDim); jewel(g, 1182, top + 424, 6, 'amber', false);
  // the mission tape: six minutes of paper, a needle at now, a mark for everything that has happened
  const tx = 1018, ty = top + 476, tw = 314;
  g.fillStyle = PAL.dial; g.fillRect(tx, ty, tw, 76); g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(tx, ty, tw, 76);
  g.strokeStyle = PAL.inkDial; g.fillStyle = PAL.inkDial;
  for (let i = 0; i <= 12; i++) { const x = tx + 12 + (tw - 24) * i / 12; g.lineWidth = i % 2 ? 1 : 2; g.beginPath(); g.moveTo(x, ty + 76); g.lineTo(x, ty + 76 - (i % 2 ? 6 : 12)); g.stroke(); if (i % 2 === 0) { g.font = `bold 10px ${FONT.type}`; g.textAlign = 'center'; g.fillText(String(i / 2), x, ty + 54); } }
  const at = s => tx + 12 + (tw - 24) * s / 360;
  [['bell', 8], ['fixed', 31], ['bell', 50], ['banked', 84], ['bell', 100]].forEach(([ic, s]) => icon(ic, at(s), ty + 22, 18, ic === 'bell' ? PAL.red : PAL.inkDial));
  g.strokeStyle = PAL.red; g.lineWidth = 2; g.beginPath(); g.moveTo(at(108), ty - 4); g.lineTo(at(108), ty + 80); g.stroke();

  keyset(y => {
    keycap(140, y, 220, 44, '', false, c => { icon('mic', 60, y - 2, 26, c); label('SPACE', 150, y - 1, 11, c); });
    label('TALK', 290, y, 10, PAL.inkDim, 'left');
  });
}

// ---------- Technician ----------
const cams = new Image(); cams.src = '/test/shots/camviews/third-first.png';
function crt(x, y, w, h, half, id, view, hdg) {
  g.fillStyle = PAL.bezel; g.beginPath(); g.roundRect(x - 10, y - 10, w + 20, h + 20, 8); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.roundRect(x - 5, y - 5, w + 10, h + 10, 16); g.fill();
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, 22); g.clip();
  g.drawImage(cams, half * 480, 20, 480, 320, x, y, w, h);
  g.fillStyle = 'rgba(28,42,28,0.6)'; g.fillRect(x, y, w, 26);
  g.strokeStyle = phos(0.8); g.fillStyle = phos(0.9); g.lineWidth = 1.5;
  for (let d = Math.ceil((hdg - 50) / 15) * 15; d <= hdg + 50; d += 15) {
    const xx = x + w / 2 + (d - hdg) * w / 100, dd = ((d % 360) + 360) % 360, card = dd % 90 === 0;
    g.beginPath(); g.moveTo(xx, y + 26); g.lineTo(xx, y + (card ? 14 : 19)); g.stroke();
    if (card || dd % 45 === 0) { g.font = `${card ? 11 : 9}px ${FONT.label}`; g.textAlign = 'center'; g.fillText(card ? 'NESW'[dd / 90] : String(dd), xx, y + 9); }
  }
  g.beginPath(); g.moveTo(x + w / 2 - 6, y + 30); g.lineTo(x + w / 2 + 6, y + 30); g.lineTo(x + w / 2, y + 24); g.closePath(); g.fill();
  const cx = x + w / 2, cy = y + h * 0.55, rr = h * 0.16;
  g.strokeStyle = phos(0.45); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; g.beginPath(); g.moveTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); g.lineTo(cx + Math.sin(a) * (rr + (big ? 10 : 5)), cy - Math.cos(a) * (rr + (big ? 10 : 5))); g.stroke(); }
  // bottom corners: which rover (a picture and its letter), and which view with the key that changes it
  icon(id, x + 30, y + h - 24, 30, phos(0.9)); label(id === 'scout' ? 'S' : 'H', x + 58, y + h - 22, 13, phos(0.9));
  const vx = x + w - 96; icon('eye', vx, y + h - 24, 24, phos(view === 'eye' ? 0.95 : 0.3)); icon('chase', vx + 34, y + h - 24, 24, phos(view === 'chase' ? 0.95 : 0.3));
  g.strokeStyle = phos(0.8); g.lineWidth = 1.2; g.strokeRect(vx + 54, y + h - 34, 22, 20); label(id === 'scout' ? 'C' : '/', vx + 65, y + h - 23, 10, phos(0.9));
  g.fillStyle = 'rgba(12,18,12,0.22)'; for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
  g.restore();
}
function homeDial(x, y, r, rel) {
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r * 1.14, 0, TAU); g.fill();
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = PAL.inkDial;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; g.lineWidth = big ? 3 : 1.5; g.beginPath(); g.moveTo(x + Math.sin(a) * r * (big ? 0.72 : 0.82), y - Math.cos(a) * r * (big ? 0.72 : 0.82)); g.lineTo(x + Math.sin(a) * r * 0.94, y - Math.cos(a) * r * 0.94); g.stroke(); }
  g.fillStyle = PAL.inkDim; g.fillRect(x - 5, y - 8, 10, 16);
  const tx = x + Math.sin(rel) * r * 0.62, ty = y - Math.cos(rel) * r * 0.62;
  g.strokeStyle = PAL.red; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
  icon('home', x + Math.sin(rel) * r * 0.74, y - Math.cos(rel) * r * 0.74, r * 0.34, PAL.red); // the needle carries the base on its tip
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill();
}
function tech() {
  statusStrip(2, ['meteor']);
  const top = 86, cw = 572, chh = 396;
  [['scout', 22, 'chase', 250, 1.1, 62, 0.55, false], ['hauler', 772, 'eye', 95, -2.2, 118, 0, true]].forEach(([id, x, view, hdg, rel, dist, v, broken], n) => {
    crt(x, top + 12, cw, chh, n, id, view, hdg);
    const y = top + chh + 34; face(x - 10, y, cw + 20, 148);
    homeDial(x + 66, y + 74, 52, rel);
    icon('home', x + 176, y + 44, 22, PAL.inkDim); nixie(g, String(dist).padStart(3, ' '), x + 236, y + 44, 30); label('M', x + 286, y + 46, 10, PAL.inkDim);
    icon('speed', x + 176, y + 104, 22, PAL.inkDim); edgewise(x + 200, y + 94, 120, 20, v);
    tile(x + 392, y + 74, 54, 'wheel', 'red', broken);
    if (id === 'hauler') tile(x + 468, y + 74, 54, 'rider', 'green', true);
  });
  // the pillar between the screens: the meteor warning
  face(616, top, 134, 590);
  tile(683, top + 70, 88, 'meteor', 'red', true);
  nixie(g, '12', 683, top + 168, 50);
  icon('clock', 683, top + 222, 22, PAL.inkDim);
  g.strokeStyle = PAL.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(634, top + 262); g.lineTo(732, top + 262); g.stroke();
  tile(683, top + 330, 70, 'cover', 'amber', true);
  keyset(y => {
    const cluster = (x, keys, ic, lit) => {
      icon(ic, x - 96, y, 34, PAL.inkDim);
      keys.forEach(([t, dx, dy, dir], i) => keycap(x + dx * 34, y + dy * 15 - 2, 30, 26, t, lit === i, dir === undefined ? null : c => arrow(x + dx * 34, y + dy * 15 - 4, dir, c)));
    };
    cluster(200, [['W', 0, -1], ['A', -1, 1], ['S', 0, 1], ['D', 1, 1]], 'scout', 0);
    keycap(330, y, 30, 26, 'C'); icon('eye', 366, y, 20, PAL.inkDim); icon('chase', 392, y, 20, PAL.inkDim);
    cluster(950, [['', 0, -1, 0], ['', -1, 1, 3], ['', 0, 1, 2], ['', 1, 1, 1]], 'hauler', -1);
    keycap(1080, y, 30, 26, '/'); icon('eye', 1116, y, 20, PAL.inkDim); icon('chase', 1142, y, 20, PAL.inkDim);
  });
}

// ---------- Scientist ----------
function scope(CX, CY, R) {
  g.strokeStyle = PAL.bezel; g.lineWidth = 10; g.beginPath(); g.arc(CX, CY, R + 5, 0, TAU); g.stroke();
  g.save(); g.beginPath(); g.arc(CX, CY, R, 0, TAU); g.clip();
  const glass = g.createRadialGradient(CX, CY, 0, CX, CY, R); glass.addColorStop(0, '#152015'); glass.addColorStop(1, PAL.glass);
  g.fillStyle = glass; g.fillRect(CX - R, CY - R, 2 * R, 2 * R);
  const B = 2 * R / 8, heat = '0012100001332100023310001231000001100122000013310000022100000000';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const lv = +heat[j * 8 + i]; if (lv) { g.fillStyle = phos(0.06 + lv * 0.11); g.fillRect(CX - R + i * B, CY - R + j * B, B, B); } }
  g.fillStyle = 'rgba(12,18,12,0.4)'; for (let y = CY - R; y < CY + R; y += 3) g.fillRect(CX - R, y, 2 * R, 1);
  // explored ground: round the base, and the Scout's track to the north-east
  const cell = 2 * R / 48, seen = [];
  for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) { const x = i - 23.5, z = j - 23.5; if (Math.hypot(x, z) < 5.2 || (Math.abs(z + x * 0.7) < 2.6 && x > 0 && x < 15) || Math.hypot(x - 15, z + 10) < 4) seen.push([i, j]); }
  g.fillStyle = 'rgba(16,24,16,0.97)'; for (const [i, j] of seen) g.fillRect(CX - R + i * cell - 0.5, CY - R + j * cell - 0.5, cell + 1, cell + 1);
  g.save(); g.beginPath(); for (const [i, j] of seen) g.rect(CX - R + i * cell, CY - R + j * cell, cell, cell); g.clip();
  g.lineWidth = 1; g.strokeStyle = phos(0.12); for (let rr = 1; rr <= 4; rr++) { g.beginPath(); g.arc(CX, CY, rr * R / 4, 0, TAU); g.stroke(); }
  g.strokeStyle = phos(0.28); for (const [x, y, r] of [[60, -50, 16], [100, -78, 24], [30, -10, 9], [-22, 30, 12]]) { g.beginPath(); g.arc(CX + x, CY + y, r, 0, TAU); g.stroke(); }
  g.fillStyle = phos(0.65); for (const [x, y] of [[44, -22], [78, -40], [120, -100], [96, -120], [-30, -18], [14, 40]]) { g.beginPath(); g.arc(CX + x, CY + y, 2.2, 0, TAU); g.fill(); }
  g.restore();
  g.strokeStyle = phos(0.7); g.lineWidth = 1.5; g.beginPath(); g.arc(CX, CY, 9, 0, TAU); g.stroke(); g.strokeRect(CX + 8, CY - 5, 20, 10); g.strokeRect(CX - 18, CY - 5, 9, 10);
  icon('home', CX, CY + 24, 14, phos(0.85));
  g.shadowColor = PAL.amber; g.shadowBlur = 5;
  drawGlyph(g, 'diamond', CX + 104, CY - 96, 12, PAL.amber); drawGlyph(g, 'dots', CX + 52, CY - 30, 12, PAL.amber); g.shadowBlur = 0;
  const wedge = (x, y, rot, col, ic) => { g.save(); g.translate(CX + x, CY + y); icon(ic, 0, 19, 16, col); g.rotate(rot); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 5; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore(); };
  wedge(118, -84, 0.9, PAL.amber, 'scout'); wedge(-34, 44, -2.4, PAL.amber, 'hauler'); wedge(22, 30, 2, PAL.blue, 'helmet');
  g.shadowColor = PAL.red; g.shadowBlur = 6; drawFault(g, 'dust', CX + 14, CY - 44, 26, PAL.red); g.shadowBlur = 0;
  g.restore();
  label('N', CX, CY - R + 14, 12, phos(0.8));
}
function knob(x, y, stops, at, ic) {
  const angs = [-0.75, 0, 0.75].map(a => a - Math.PI / 2);
  stops.forEach((t, i) => { const a = angs[i], px = x + Math.cos(a) * 46, py = y + Math.sin(a) * 40; typeof t === 'string' && t.length > 3 ? icon(t, px, py, 20, i === at ? PAL.ink : PAL.inkDim) : label(String(t), px, py + 2, 9, i === at ? PAL.ink : PAL.inkDim); });
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, 27, 0, TAU); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(x, y, 22, 0, TAU); g.fill();
  g.strokeStyle = PAL.dial; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(angs[at]) * 19, y + Math.sin(angs[at]) * 19); g.stroke();
  icon(ic, x, y + 46, 20, PAL.inkDim);
}
function sci() {
  statusStrip(3, ['bell']);
  const top = 86, bot = H - 90, h = bot - top;
  face(12, top, 664, h);
  scope(300, top + 296, 276);
  knob(608, top + 96, [30, 60, 120], 2, 'lens'); knob(608, top + 246, ['home', 'scout', 'hauler'], 0, 'scope');
  nixie(g, ' 14', 608, top + 384, 26); icon('scope', 580, top + 424, 18, PAL.inkDim); label('%', 612, top + 425, 11, PAL.inkDim);
  ['dust', 'wheel', 'hull', 'suit'].forEach((t, i) => tile(586 + (i % 2) * 46, top + 484 + Math.floor(i / 2) * 46, 38, '', 'red', t === 'dust', c => drawFault(g, t, 586 + (i % 2) * 46, top + 484 + Math.floor(i / 2) * 46, 28, c)));
  // the auxiliary display: one of three pages, chosen on lit push-buttons
  face(688, top, 666, h);
  [['card', 'guide'], ['battery', 'power'], ['o2', 'air']].forEach(([ic, id], i) => {
    const y = top + 66 + i * 84, on = id === aux;
    keycap(738, y, 68, 64, '', on, c => icon(ic, 738, y - 2, 40, c));
    label(String(i + 1), 784, y + 22, 9, PAL.inkDim);
  });
  const ax = 800, aw = 540, mid = ax + aw / 2;
  well(ax, top + 14, aw, h - 28); face(ax + 2, top + 16, aw - 4, h - 32, true);
  if (aux === 'air') {
    dial(mid - 130, top + 150, 100, 71, 100, 'O2', { redBelow: 25, ico: 'o2' });
    dial(mid + 130, top + 150, 100, 2.2, 3.5, 'RATE', { redAbove: 1.6, fixed: 1, ico: 'speed' });
    // the leak lamp
    tile(mid + 190, top + 400, 110, '', 'red', true, c => { g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round'; const lx = mid + 190, ly = top + 400; g.beginPath(); g.arc(lx - 30, ly, 9, 0, TAU); g.stroke(); for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(lx - 12 + Math.cos(a) * 6, ly + Math.sin(a) * 6); g.lineTo(lx - 12 + Math.cos(a) * 44, ly + Math.sin(a) * 44); g.stroke(); } });
    const s = []; for (let i = 0; i < 60; i++) s.push(i < 34 ? 0.92 - i * 0.0018 : 0.86 - (i - 34) * 0.0058 + Math.sin(i) * 0.003);
    icon('o2', ax + 34, top + 340, 26, PAL.inkDim); strip(ax + 60, top + 300, 330, 180, s, { red: 0.25 });
  } else {
    dial(mid - 130, top + 150, 100, 64, 100, 'BATT', { redBelow: 30, ico: 'battery' });
    dial(mid + 130, top + 150, 100, 48, 100, 'SUN', { redBelow: 60, ico: 'bolt' });
    // charge or drain: an arrow into the battery, or out of it
    const lx = mid + 190;
    tile(lx, top + 350, 76, '', 'green', false, c => { icon('battery', lx, top + 358, 44, c); arrow(lx, top + 328, 2, c); });
    tile(lx, top + 446, 76, '', 'amber', true, c => { icon('battery', lx, top + 454, 44, c); arrow(lx, top + 424, 0, c); });
    const s = []; for (let i = 0; i < 60; i++) s.push(i < 30 ? 0.78 + Math.sin(i / 3) * 0.004 : 0.78 - (i - 30) * 0.0047);
    icon('battery', ax + 34, top + 340, 26, PAL.inkDim); strip(ax + 60, top + 300, 330, 180, s, { red: 0.3 });
  }
  keyset(y => {
    [['1', 'card'], ['2', 'battery'], ['3', 'o2']].forEach(([k, ic], i) => { keycap(90 + i * 110, y, 30, 26, k, ic === (aux === 'air' ? 'o2' : 'battery')); icon(ic, 130 + i * 110, y, 24, PAL.inkDim); });
    keycap(470, y, 30, 26, 'R'); icon('lens', 506, y, 22, PAL.inkDim);
    keycap(580, y, 30, 26, 'E'); icon('scope', 616, y, 22, PAL.inkDim);
  });
}

g.fillStyle = PAL.bakelite; g.fillRect(0, 0, W, H);
if (seat === 'tech') await new Promise(ok => { cams.complete ? ok() : (cams.onload = ok); });
({ ops, tech, sci })[seat]();
document.title = 'ready';
