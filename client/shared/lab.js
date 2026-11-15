// The Real Mission's lab (docs/SPEC-real-mission.md): four experiments, one for each kind of sample, each tied to
// one of NASA's Moon Base science themes. This file is what the server and every page agree on: which sample
// opens which experiment, where its instrument stands in the hall, and the numbers the rules and the pictures
// share. The rules are in server/lab.js; the instruments in client/lab.js; the Scientist's page in
// client/console/lab.js.

// One experiment per kind of sample. theme: the NASA Moon Base science theme it serves.
export const EXPERIMENTS = {
  E1: { kind: 'anor',   name: 'THIN SECTION',  station: 'MICROSCOPE',   theme: 'PLANETARY PROCESSES', icon: 'micro' },
  E2: { kind: 'basalt', name: 'ROCK CLOCK',    station: 'MASS SPEC',    theme: 'IMPACT HISTORY',      icon: 'spec' },
  E3: { kind: 'glass',  name: 'FIRE FOUNTAIN', station: 'FURNACE',      theme: 'VOLATILES',           icon: 'furnace' },
  E4: { kind: 'ice',    name: 'COLD TRAP',     station: 'COLD BOX',     theme: 'VOLATILES',           icon: 'coldbox' },
};
export const EXP_IDS = Object.keys(EXPERIMENTS);
export const EXP_OF = Object.fromEntries(EXP_IDS.map(e => [EXPERIMENTS[e].kind, e]));

// A finding is graded by how carefully the experiment was done. Every experiment ends in one: a C at worst.
export const GRADE_PTS = { A: 300, B: 200, C: 100 };

// Where the instruments stand, in room coordinates (client/interior.js): north is -z, west is -x. ry turns each
// one so its front (local +z) faces into the hall. The lab bench is on the west wall between the tool rack and
// life support; the two floor-standing consoles are on the east wall either side of nothing in particular.
export const LAB = {
  bench: { x0: -3.5, x1: -2.85, z0: -10.05, z1: -7.15, top: 0.96 },
  E1: { x: -3.12, y: 0.96, z: -9.35, ry: Math.PI / 2 },   // the microscope, on the lab bench
  E3: { x: -3.12, y: 0.96, z: -7.85, ry: Math.PI / 2 },   // the furnace, on the lab bench
  E2: { x: 3.18, y: 0, z: -9.25, ry: -Math.PI / 2 },      // the mass spectrometer console, east wall
  E4: { x: 3.18, y: 0, z: -10.85, ry: -Math.PI / 2 },     // the cold box, east wall
  reach: 1.6,                                             // metres from an instrument that the hands can work it
};
// Things you cannot walk through, the same shape as SOLIDS in client/interior.js: [x0, x1, z0, z1, top].
export const LAB_SOLIDS = [
  [LAB.bench.x0, LAB.bench.x1, LAB.bench.z0, LAB.bench.z1, LAB.bench.top],
  [2.8, 3.5, -9.75, -8.75, 1.2],     // the mass spectrometer console
  [2.8, 3.5, -11.4, -10.3, 1.15],    // the cold box
];

// ---------- E1 THIN SECTION ----------
// Three minerals the polarising microscope can tell apart, by how often a grain goes dark ("extinct") as the
// stage turns a full circle: plagioclase twice (grey stripes), olivine four times (bright colours), glass never
// lights at all between crossed polarisers.
export const MINERALS = {
  plag:  { name: 'PLAGIOCLASE', dark: 2 },
  oliv:  { name: 'OLIVINE',     dark: 4 },
  glass: { name: 'GLASS',       dark: 0 },
};
export const E1 = { grains: 3, stageStep: 15, needTurn: 180 };

// ---------- E2 ROCK CLOCK ----------
// 40Ar/39Ar dating: the dial scans argon masses 35 to 42. Three peaks show: 36 (air, a distraction), 39 (made
// from the rock's potassium) and 40 (from potassium-40 decay since the lava froze). age = ln(1 + R / J) / lambda.
export const E2 = { mass: [35, 42], step: 0.05, peaks: [36, 39, 40], want: [39, 40], width: 0.15, vacSeconds: 10, burnSeconds: 30, lambda: 0.554, J: 10 };
export const ageOf = ratio => Math.log(1 + Math.max(0, ratio) / E2.J) / E2.lambda; // billions of years
export const ratioOf = age => E2.J * (Math.exp(E2.lambda * age) - 1);

// ---------- E3 FIRE FOUNTAIN ----------
// Step heating: three temperature bands, held 12 s each, and three gases come off one per step. The bands are on
// the Scientist's card only. Overshooting a band by more than its own width boils off the next gas early.
export const E3 = {
  steps: [{ lo: 400, hi: 500, gas: 'WATER' }, { lo: 700, hi: 800, gas: 'SULFUR' }, { lo: 1000, hi: 1100, gas: 'ZINC' }],
  hold: 12, setStep: 25, max: 1200, room: 20, rate: 0.8, drift: 60,
  levels: { low: 0.3, med: 0.6, high: 0.9 }, // the water peak's height on the paper: how much water the glass held
};

// ---------- E4 COLD TRAP ----------
// The ice must be in the cold box within 90 s of the port (A), 150 s (B). Weighing takes a steady 2 s. The
// sublimed water's D/H ratio (parts per million) says where it came from.
export const E4 = {
  clockA: 90, clockB: 150, steady: 2, subSeconds: 15, holdUnpowered: 40,
  sources: { wind: { name: 'SOLAR WIND', lo: 20, hi: 60 }, asteroid: { name: 'ASTEROID', lo: 130, hi: 180 }, comet: { name: 'COMET', lo: 250, hi: 340 } },
  scale: 400,
};

// The power bus (the spec's section 6, cut down): two breakers on the Technician's desk. load: the share of the
// panels' recharge it takes; drain: % a second it takes from the battery on top. The furnace is the big load: on,
// it runs a full battery flat in a little over three minutes. The cold box is small and on by default.
export const BREAKERS = { furnace: { name: 'FURNACE', load: 1.0, drain: 0.5 }, coldbox: { name: 'COLD BOX', load: 0, drain: 0 } };

// What each experiment's procedure card says, as pictures with one word each (the Scientist's LAB page).
export const STEPS = {
  E1: ['LOAD', 'FOCUS', 'POLARISER', 'TURN STAGE', 'NEXT GRAIN', 'CALL'],
  E2: ['LOAD', 'PUMP', 'BEAM', 'FIND PEAK', 'LATCH 39 + 40', 'CALL AGE'],
  E3: ['LOAD', 'POWER', 'STEP 1', 'STEP 2', 'STEP 3', 'CALL WATER'],
  E4: ['LOAD', 'WEIGH', 'VALVE', 'WEIGH', 'READER', 'CALL SOURCE'],
};

// How a grain looks down the microscope, centred on (x, y), radius r. pol: the polariser is in; angle: the stage,
// in degrees; blur: 0 sharp to 0.5 a smear. Without the polariser every grain is a pale tint; with it,
// plagioclase shows grey stripes and olivine bright colours, each going dark at its own angles, and glass stays
// black. col: the palette (PAL from client/shared/palette.js), passed in so this file needs no page.
export function lightOf(mineral, angle) {
  const n = MINERALS[mineral]?.dark || 0;
  return n ? Math.abs(Math.sin(n / 2 * angle * Math.PI / 180)) : 0;
}
export function drawGrain(g, mineral, x, y, r, { pol = false, angle = 0, blur = 0, col }) {
  g.save();
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = pol ? '#0e0d0b' : col.dial; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  if (blur > 0.02) g.filter = `blur(${Math.min(8, blur * r * 0.12).toFixed(1)}px)`;
  g.translate(x, y); g.rotate(angle * Math.PI / 180);
  const L = pol ? lightOf(mineral, angle) : 1;
  const s = r * 0.62;
  g.beginPath(); g.moveTo(-s, -s * 0.5); g.lineTo(-s * 0.2, -s); g.lineTo(s, -s * 0.45); g.lineTo(s * 0.8, s * 0.6); g.lineTo(-s * 0.3, s); g.lineTo(-s, s * 0.3); g.closePath();
  if (mineral === 'plag') {
    g.save(); g.clip();
    for (let i = -6; i <= 6; i++) { g.fillStyle = pol ? `rgba(214,204,180,${(i % 2 ? 0.35 : 0.85) * L})` : (i % 2 ? '#cfc6ae' : '#d9d1bb'); g.fillRect(i * s / 6, -s, s / 6, 2 * s); }
    g.restore();
  } else if (mineral === 'oliv') {
    const grd = g.createLinearGradient(-s, -s, s, s);
    if (pol) { grd.addColorStop(0, `rgba(224,163,71,${L})`); grd.addColorStop(0.5, `rgba(143,176,90,${L})`); grd.addColorStop(1, `rgba(122,153,176,${L})`); }
    else { grd.addColorStop(0, '#c9cfa4'); grd.addColorStop(1, '#b9c296'); }
    g.fillStyle = grd; g.fill();
  } else {
    g.fillStyle = pol ? '#0e0d0b' : '#c9b48c'; g.fill();
  }
  g.strokeStyle = pol ? `rgba(214,204,180,${0.15 + 0.3 * L})` : 'rgba(36,34,30,0.5)'; g.lineWidth = 1.5; g.stroke();
  g.restore();
  // cross-hairs
  g.strokeStyle = pol ? 'rgba(214,204,180,0.35)' : 'rgba(36,34,30,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - r, y); g.lineTo(x + r, y); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();
}
