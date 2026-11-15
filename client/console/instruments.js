// The instruments every Mission Control desk is built from (docs/design/mission-control-consoles.md, card
// "instruments.js"): panel faces, wells, event-light tiles, keycaps, meters, dials, a strip-chart recorder.
// All draw on a 2D canvas in design pixels, in the 1960s palette (docs/DESIGN.md). Nothing here holds game state
// except the needles' motion.
import { PAL, FONT, nixie, jewel } from '/shared/palette.js';
import { drawIcon } from '/shared/icons.js';

export const TAU = Math.PI * 2;
export const phos = a => `rgba(156,194,122,${a})`;
export const blinkOn = () => Math.floor(Date.now() / 333) % 2 === 0; // 1.5 Hz: an alarm lamp, not a strobe
export { nixie, jewel, drawIcon as icon };

// Engraved label (Michroma) and teletype text (Courier Prime).
export function label(g, text, x, y, size = 10, color = PAL.inkDim, align = 'center') {
  g.font = `${size}px ${FONT.label}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
}
export function typed(g, text, x, y, size = 12, color = PAL.inkDial, align = 'center') {
  g.font = `bold ${size}px ${FONT.type}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
}
// A cream label plate, engraved in dark ink.
export function plate(g, text, x, y, w, size = 9) {
  g.fillStyle = PAL.dial; g.fillRect(x - w / 2, y - size, w, size * 2);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - size + 0.5, w - 1, size * 2 - 1);
  label(g, text, x, y + 1, size, PAL.inkDial);
}
// A console panel: painted steel with brushed lines, a bezel edge, four screws. deep: a recessed face, no screws.
export function face(g, x, y, w, h, deep = false) {
  g.fillStyle = deep ? PAL.consoleDeep : PAL.console; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = 'rgba(143,138,120,0.07)'; g.lineWidth = 1;
  g.beginPath(); for (let yy = y + 0.5; yy < y + h; yy += 4) { g.moveTo(x, yy); g.lineTo(x + w, yy); } g.stroke();
  g.restore();
  g.strokeStyle = PAL.bezel; g.lineWidth = 1.5; g.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  if (!deep) for (const [sx, sy] of [[x + 9, y + 9], [x + w - 9, y + 9], [x + 9, y + h - 9], [x + w - 9, y + h - 9]]) {
    g.fillStyle = PAL.bezel; g.beginPath(); g.arc(sx, sy, 3, 0, TAU); g.fill();
    g.strokeStyle = PAL.bakelite; g.lineWidth = 1; g.beginPath(); g.moveTo(sx - 2, sy - 1); g.lineTo(sx + 2, sy + 1); g.stroke();
  }
}
// A recess: Bakelite black in an aluminium edge.
export function well(g, x, y, w, h) { g.fillStyle = PAL.bakelite; g.fillRect(x, y, w, h); g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
// A panel's title plate: a well with the panel's picture and its engraved name.
export function title(g, x, y, w, ic, text) { well(g, x, y, w, 26); drawIcon(g, ic, x + 16, y + 13, 16, PAL.inkDim); label(g, text, x + 32, y + 14, 9, PAL.inkDim, 'left'); }

// An event light: a square annunciator tile with a picture cast in the lens. Off is a dark jewel you can still
// read; on is the lamp's colour with the picture in dark ink. level 0..1 dims it (a light fading out).
export function tile(g, x, y, s, name, colour, level, draw) {
  g.fillStyle = PAL.bezel; g.fillRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4);
  const on = level > 0, lit = PAL[colour], off = PAL[colour + 'Off'];
  g.fillStyle = off; g.fillRect(x - s / 2, y - s / 2, s, s);
  if (on) {
    g.save(); g.globalAlpha = Math.min(1, level); g.shadowColor = lit; g.shadowBlur = 6;
    g.fillStyle = lit; g.fillRect(x - s / 2, y - s / 2, s, s); g.restore();
  }
  const ink = level >= 0.5 ? PAL.inkDial : 'rgba(143,138,120,0.55)';
  if (draw) draw(ink); else drawIcon(g, name, x, y, s * 0.7, ink);
}
// A keycap on the keyset. lit: held down (or the page it chooses is up).
export function keycap(g, x, y, w, h, text, lit = false, draw) {
  g.fillStyle = PAL.bakelite; g.beginPath(); g.roundRect(x - w / 2, y - h / 2 + 3, w, h, 4); g.fill();
  g.fillStyle = lit ? PAL.dial : PAL.keycap; g.beginPath(); g.roundRect(x - w / 2, y - h / 2 + (lit ? 2 : 0), w, h - 3, 4); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1; g.stroke();
  const ink = lit ? PAL.inkDial : PAL.ink;
  if (draw) draw(ink, lit ? 2 : 0); else label(g, text, x, y - 1 + (lit ? 2 : 0), Math.min(11, h * 0.36), ink);
}
export function arrow(g, x, y, dir, c, s = 6) { g.save(); g.translate(x, y); g.rotate(dir * Math.PI / 2); g.fillStyle = c; g.beginPath(); g.moveTo(0, -s); g.lineTo(s, s * 0.8); g.lineTo(-s, s * 0.8); g.closePath(); g.fill(); g.restore(); }
// A dotted flow arrow, from one stage to the next.
export function flow(g, x0, y0, x1, y1) {
  g.strokeStyle = PAL.inkDim; g.lineWidth = 2; g.setLineDash([2, 5]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  const a = Math.atan2(y1 - y0, x1 - x0); g.fillStyle = PAL.inkDim;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a - 0.5) * 9, y1 - Math.sin(a - 0.5) * 9); g.lineTo(x1 - Math.cos(a + 0.5) * 9, y1 - Math.sin(a + 0.5) * 9); g.fill();
}

// Needles ease toward their value and overshoot a little, like a real meter movement. desk.swinging is set while
// one moves, so the desk draws at 30 frames a second then and at 10 otherwise.
const needles = new Map();
export const motion = { swinging: 0 };
export function needle(key, target) {
  const n = needles.get(key) || { v: target, vel: 0, t: performance.now() };
  const now = performance.now(), dt = Math.min(0.1, (now - n.t) / 1000); n.t = now;
  n.vel += ((target - n.v) * 60 - n.vel * 9) * dt; n.v += n.vel * dt;
  if (Math.abs(n.vel) > 0.05 || Math.abs(target - n.v) > 0.05) motion.swinging = now;
  needles.set(key, n); return n.v;
}

// An edgewise meter: a cream scale in a slot, the bad range painted red, a dark pointer. v is 0..1.
export function edgewise(g, key, x, y, w, h, v, redBelow = 0) {
  well(g, x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = PAL.dial; g.fillRect(x, y, w, h);
  if (redBelow) { g.fillStyle = 'rgba(196,82,58,0.7)'; g.fillRect(x, y + h - 5, w * redBelow, 5); }
  g.strokeStyle = PAL.inkDial;
  for (let i = 0; i <= 10; i++) { g.lineWidth = i % 5 ? 1 : 2; g.beginPath(); g.moveTo(x + w * i / 10, y); g.lineTo(x + w * i / 10, y + (i % 5 ? h * 0.3 : h * 0.5)); g.stroke(); }
  const px = x + w * Math.max(0, Math.min(1, needle(key, v)));
  g.fillStyle = PAL.inkDial; g.beginPath(); g.moveTo(px, y + 2); g.lineTo(px + 5, y + h); g.lineTo(px - 5, y + h); g.closePath(); g.fill();
}

// A meter: cream face in a bezel, ticks and numerals, the bad range painted red, a dark needle on a brass hub,
// the value on a Nixie counter below and a red jewel that lights out of range. The plate carries its short name.
export function dial(g, x, y, r, value, max, name, { redBelow = 0, redAbove = Infinity, fixed = 0, ico } = {}) {
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
    if (big) typed(g, String(Math.round(max * i / 20 * 10) / 10), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, Math.round(r * 0.13), PAL.inkDial);
  }
  if (ico) drawIcon(g, ico, x, y - r * 0.34, r * 0.26, 'rgba(36,34,30,0.55)');
  const a = ang(needle(name, value));
  g.strokeStyle = PAL.inkDial; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.12, y - Math.sin(a) * r * 0.12); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke();
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(x, y, r * 0.07, 0, TAU); g.fill();
  nixie(g, fixed ? value.toFixed(fixed) : String(Math.round(value)).padStart(3, ' '), x - r * 0.12, y + r * 0.44, r * 0.24);
  jewel(g, x + r * 0.62, y + r * 0.44, r * 0.09, 'red', (value < redBelow || value > redAbove) && blinkOn());
  plate(g, name, x, y + r * 0.8, r * 1.4, Math.max(8, r * 0.11));
}

// The HOME dial: a clock-face compass with the base on the needle's tip, pointing home from the rover's nose.
export function homeDial(g, key, x, y, r, rel) {
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r * 1.14, 0, TAU); g.fill();
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = PAL.inkDial; g.lineCap = 'butt';
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; g.lineWidth = big ? 3 : 1.5; g.beginPath(); g.moveTo(x + Math.sin(a) * r * (big ? 0.72 : 0.82), y - Math.cos(a) * r * (big ? 0.72 : 0.82)); g.lineTo(x + Math.sin(a) * r * 0.94, y - Math.cos(a) * r * 0.94); g.stroke(); }
  g.fillStyle = PAL.inkDim; g.fillRect(x - r * 0.1, y - r * 0.15, r * 0.2, r * 0.3);
  const a = needle(key, rel), tx = x + Math.sin(a) * r * 0.58, ty = y - Math.cos(a) * r * 0.58;
  g.strokeStyle = PAL.red; g.lineWidth = Math.max(2, r * 0.06); g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
  drawIcon(g, 'home', x + Math.sin(a) * r * 0.74, y - Math.cos(a) * r * 0.74, r * 0.34, PAL.red);
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(x, y, Math.max(3, r * 0.08), 0, TAU); g.fill();
}

// A Bakelite rotary switch with three stops. A stop is a number or the name of an icon.
export function knob(g, x, y, stops, at, ic) {
  const angs = [-0.75, 0, 0.75].map(a => a - Math.PI / 2);
  stops.forEach((t, i) => {
    const a = angs[i], px = x + Math.cos(a) * 46, py = y + Math.sin(a) * 40, c = i === at ? PAL.ink : PAL.inkDim;
    typeof t === 'number' ? label(g, String(t), px, py + 2, 9, c) : drawIcon(g, t, px, py, 18, c);
  });
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, 27, 0, TAU); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(x, y, 22, 0, TAU); g.fill();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.strokeStyle = 'rgba(143,138,120,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke(); }
  g.strokeStyle = PAL.dial; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(angs[at]) * 19, y + Math.sin(angs[at]) * 19); g.stroke();
  if (ic) drawIcon(g, ic, x, y + 44, 18, PAL.inkDim);
}

// A strip-chart recorder: cream paper moving left under a pen, the newest value at the pen on the right.
// series: values 0..1, oldest first. red: the height of the bad band at the foot of the paper.
export function strip(g, x, y, w, h, series, { red = 0 } = {}) {
  well(g, x - 4, y - 4, w + 8, h + 8);
  g.fillStyle = PAL.dial; g.fillRect(x, y, w, h);
  const pw = w - 30;
  if (red) { g.fillStyle = 'rgba(196,82,58,0.25)'; g.fillRect(x, y + h * (1 - red), pw, h * red); }
  g.strokeStyle = 'rgba(36,34,30,0.18)'; g.lineWidth = 1; g.beginPath();
  for (let i = 1; i < 4; i++) { g.moveTo(x, y + h * i / 4); g.lineTo(x + pw, y + h * i / 4); }
  for (let i = 0; i <= 6; i++) { const xx = x + pw - i * pw / 6; g.moveTo(xx, y); g.lineTo(xx, y + h); }
  g.stroke();
  const n = series.length;
  if (n > 1) {
    g.strokeStyle = PAL.inkDial; g.lineWidth = 1.8; g.lineJoin = 'round'; g.beginPath();
    series.forEach((v, i) => { const xx = x + pw * i / (n - 1), yy = y + h * (1 - Math.max(0, Math.min(1, v))); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); });
    g.stroke();
  }
  const last = n ? series[n - 1] : 0, py = y + h * (1 - Math.max(0, Math.min(1, last)));
  g.fillStyle = PAL.bezel; g.fillRect(x + w - 26, y, 26, h); // the pen carriage
  g.fillStyle = PAL.red; g.beginPath(); g.moveTo(x + pw, py); g.lineTo(x + pw + 16, py - 6); g.lineTo(x + pw + 16, py + 6); g.closePath(); g.fill();
  for (const [f, t] of [[0, '60'], [0.5, '30'], [1, '0']]) typed(g, t, x + pw * f, y + h + 13, 9, PAL.inkDim);
}

// A monitor: a bezel and a Bakelite lip round rounded glass. The glass itself is left for the caller to clear
// (a hole the rover camera shows through) or to fill.
export const GLASS_R = 20;
export function monitor(g, x, y, w, h) {
  g.fillStyle = PAL.bezel; g.beginPath(); g.roundRect(x - 10, y - 10, w + 20, h + 20, 8); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.roundRect(x - 5, y - 5, w + 10, h + 10, GLASS_R - 4); g.fill();
}
