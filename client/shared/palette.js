// The 1960s palette from docs/DESIGN.md, in one place. Canvas code uses the '#rrggbb' strings,
// three.js code the 0xrrggbb numbers (PAL.hex.name). The lobby does not use this: it keeps its own look.

export const PAL = {
  // surfaces
  bakelite: '#1d1c19', console: '#3f4a47', consoleDeep: '#2b3230', bezel: '#8b887d', rule: '#55605b',
  dial: '#e3d9bf', keycap: '#4a4a44', enamel: '#d8d2c2', foilGold: '#b8913f', regolith: '#a8a397', glass: '#101810',
  // ink
  ink: '#d6ccb4', inkDim: '#8f8a78', inkDial: '#24221e',
  // lamps: off and on
  greenOff: '#2c3a22', green: '#8fb05a',
  amberOff: '#4a3514', amber: '#e0a347',
  redOff: '#3d1a14', red: '#c4523a',
  whiteOff: '#3a3830', white: '#f1e2bd',
  blueOff: '#1f2a33', blue: '#7a99b0',
  nixieOff: '#3a1d10', nixie: '#ff8a3d',
  phosphorOff: '#1c2a1c', phosphor: '#9cc27a',
  // materials
  aluminium: '#a7a59c', orange: '#b85a2c', hazard: '#c9a23a', incandescent: '#ffe2b0',
  photoTint: '#e8dcc4', // multiplied into photo textures (the NASA models, the flight-deck panels) to warm them
};

// Four muted wire colours, for the loose wiring that hangs in the hall when something breaks (client/damage.js).
export const CABLE = { red: '#b0443a', blue: '#40698f', yellow: '#d0a93c', green: '#5e8a46' };

const toHex = s => parseInt(s.slice(1), 16);
PAL.hex = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, toHex(v)]));
export const CABLE_HEX = Object.fromEntries(Object.entries(CABLE).map(([k, v]) => [k, toHex(v)]));

// Fonts (client/fonts/, loaded by style.css). Canvas text must wait for them: await fontsReady.
export const FONT = {
  label: '"Michroma", "Eurostile", "Arial Narrow", sans-serif',
  type: '"Courier Prime", "Courier New", monospace',
};
export const fontsReady = typeof document === 'undefined' ? Promise.resolve()
  : Promise.all(['16px Michroma', '16px "Courier Prime"', 'bold 16px "Courier Prime"'].map(f => document.fonts.load(f).catch(() => null)));

// A Nixie-tube readout drawn on a 2D canvas: one glass cell per character, the lit numeral in orange
// with a tight glow, and a faint unlit "8" behind it for the cathodes that are off.
export function nixie(g, text, x, y, size, { align = 'center', lit = true } = {}) {
  const chars = String(text).split(''), cw = size * 0.66, w = chars.length * cw;
  let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${size}px ${FONT.type}`;
  for (const ch of chars) {
    const cx = x0 + cw / 2;
    g.fillStyle = '#16120e'; // the glass envelope
    g.beginPath(); g.roundRect(cx - cw * 0.46, y - size * 0.62, cw * 0.92, size * 1.24, cw * 0.3); g.fill();
    g.strokeStyle = 'rgba(143,138,120,0.35)'; g.lineWidth = 1; g.stroke();
    if (/[0-9]/.test(ch)) { g.fillStyle = PAL.nixieOff; g.fillText('8', cx, y); }
    if (lit && ch !== ' ') {
      g.shadowColor = PAL.nixie; g.shadowBlur = size * 0.12;
      g.fillStyle = PAL.nixie; g.fillText(ch, cx, y);
      g.shadowBlur = 0;
    }
    x0 += cw;
  }
  g.restore();
  return w;
}

// A round jewel lamp in a bezel, for 2D canvases.
export function jewel(g, x, y, r, colour, on) {
  g.save();
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r * 1.28, 0, 7); g.fill();
  g.fillStyle = PAL.consoleDeep; g.beginPath(); g.arc(x, y, r * 1.1, 0, 7); g.fill();
  const off = PAL[colour + 'Off'], lit = PAL[colour];
  if (on) { g.shadowColor = lit; g.shadowBlur = r * 0.5; }
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  grd.addColorStop(0, on ? '#fff3d6' : off); grd.addColorStop(0.35, on ? lit : off); grd.addColorStop(1, on ? lit : PAL.bakelite);
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.restore();
}

// The rock samples and their lookalikes (docs/DESIGN.md, "Samples"). Used by the 3D rocks and the field guide.
export const SAMPLE_COL = {
  anor: PAL.dial, fleck: PAL.inkDial, anorDust: '#b5ad9b',     // anorthosite: pale cream, dark flecks
  basalt: '#34322e', pit: '#161513', basaltLight: '#4a4741',   // vesicular basalt: charcoal, pitted
  glass: '#b9763a', bead: '#d39a55',                           // orange glass: ochre beads
  ice: '#9fb0b8', frost: '#d6dbd8',                            // ice-bearing clod: pale blue-grey, frosted
  dusty: '#b9b4a8',                                            // the ice's lookalike: a pale dusty rock
};
