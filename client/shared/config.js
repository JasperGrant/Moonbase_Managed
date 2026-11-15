// Every tunable number lives here. The server and all four clients import this file,
// so nobody can disagree about the rules.

export const CFG = {
  roundSeconds: 360,          // 6:00: two or three sample runs, and four or five faults one at a time
  delayMs: 1300,              // Earth-Moon one-way light time, about 1.3 s
  tickMs: 100,                // server simulation step

  o2Start: 100,
  o2DrainPerSec: 0.35,        // suit oxygen drain: a full tank is 286 s outside, one long run
  o2RefillPerSec: 3,          // inside the base, while it has power, the suit tops up (less any leak)
  leakMultiplier: 3,          // a leak drains oxygen this many times faster
  meteorHit: 20,              // oxygen lost when caught in the open
  fixPoints: 100,             // score per fault fixed

  batterySeconds: 60,         // 100% to 0% while a power fault is active
  rechargeSeconds: 20,        // 0% to 100% with no power fault
  blackoutEndsAt: 10,         // battery % at which a flat battery is counted as charged again
  generatorSeconds: 25,       // lights and oxygen refill from one pull of the backup generator

  tireRestockSeconds: 30,     // a new space tire turns up at the cargo end of the hall this long after one is fitted

  meteorWarnSeconds: 15,      // radar warning before the first impact
  meteorSeconds: 8,           // how long a shower lasts
  meteorGraceSeconds: 3,      // the first impacts land far away
  crouchHeight: 1.1,          // head below this (metres) counts as crouching
  roverCoverRadius: 2.2,      // metres from the rover's centre (about 1.5 m from its side)

  reach: 4.5,                 // metres: the server refuses work on a fixture further away than this
  bounds: 120,                // metres from the habitat that players and rovers may go: the field
  pad: 22,                    // the graded pad round the base, where every base fault is
  habRadius: 2.9,
  teleportRecharge: 2.5,      // seconds between hand-tracked teleport hops
  rover: { rampSeconds: 0.6 },// rovers ease up to speed and down to a stop
  ride: { snapYaw: false, mountReach: 2.5 }, // riding the Hauler: turn with it (or hold heading and snap), how near to get on
  survey: { known: 30 },      // metres round the base that start explored on the Scientist's chart
  // Samples: what the mission is for. Four on the manifest, a tray of four cups on the Hauler.
  sample: { manifest: 4, tray: 4, wanted: 250, extra: 100, dud: 0, drawRadius: 45, reach: 3, portReach: 2.5 },
  // The core drill: a rock in the ground comes out only through it. Two hands to carry, a rack on the Hauler
  // to ride in, five seconds locked on a rock (five Nixie tubes count them down), then the core is presented.
  drill: { seconds: 5, reach: 2.5 },
  // The astronaut starts inside the hall (room coordinates, see client/interior.js), facing up it, with
  // the tools lying round. The server sees them at door S until they go out.
  spawn: { inside: true, x: 0, z: -1.3, door: 'S' },
  // The airlock cycle, seconds (client/airlock.js): stand in the chamber, a hatch swings shut, the air
  // hisses, the other hatch swings open.
  airlock: { dwell: 0.3, close: 1.0, repress: 1.2, open: 1.0, abort: 0.6 },

  // One thing goes wrong at a time. A fault or a shower starts only when nothing is broken and no shower is
  // under way, and after each fix there is a breather of faultGapSeconds before the next.
  firstFaultSeconds: 30,      // the quiet start: read the chart, send the Scout out, find a tool
  faultGapSeconds: 20,
  freeMaxFaults: 1,
  freeMeteorChance: 0.25,     // free play: the chance the next event is a shower rather than a fault

  // The lobby: every role is picked and ready, then a short countdown starts the mission.
  // requireFullCrew: false lets one developer ready up alone (or run the server with SOLO=1).
  // emptyModeSeconds: a 2- or 4-player game nobody has sat down in for this long is forgotten, so the
  // next visitor to the landing page can choose again.
  lobby: { requireFullCrew: true, countdownSeconds: 3, emptyModeSeconds: 60 },
  // The debrief: the results stay up until a seat goes back to the lobby, or this long at most.
  debriefSeconds: 90,
  // Power outage inside the habitat: the roof lights die, the room is dark for darkMs, then the red
  // backup lights ramp up over rampMs. Once fixed, the roof lights re-strike one row every restrikeMs.
  power: { darkMs: 1500, rampMs: 400, restrikeMs: 120 },
};

// The four roles that must be filled before a mission starts. "all" (2-player mode) covers the last three.
export const CREW = ['astronaut', 'ops', 'sci', 'tech'];
export const covers = (held, role) => held === role || (held === 'all' && role !== 'astronaut');
// How many play, chosen once per game on the landing page, and the seats each game has.
// 2 players: the Astronaut and one Mission Operator, who has every Earth-side screen (the 'all' seat).
// 4 players: one person per role. Nobody can take a seat the game does not have.
export const PLAYERS = { 2: ['astronaut', 'all'], 4: ['astronaut', 'ops', 'sci', 'tech'] };

// The tools. The astronaut holds one at a time, in the hand: to take another, put the first one down.
// They start scattered round the hall (PLACES.toolSpots) and obey physics (client/physics.js).
// mass is in kilograms, for the physics only.
export const TOOLS = {
  brush:  { name: 'Brush',            mass: 0.4 },
  patch:  { name: 'Patch kit',        mass: 0.8 },
  welder: { name: 'Welder',           mass: 3.5 },
  tire:   { name: 'Space tire',       mass: 12 },
  gen:    { name: 'Backup generator', mass: 25 },
};

// What can break, the tool that fixes it, and the line for the results log.
export const FAULTS = {
  dust:  { name: 'Dusty solar panels',  tool: 'brush' },
  wheel: { name: 'Broken rover wheel',  tool: 'tire' },
  hull:  { name: 'Hull breach',         tool: 'welder' },
  suit:  { name: 'Suit leak',           tool: 'patch' },
};

export const DUST_COLS = 3, DUST_ROWS = 2, PANELS = 3;
export const DUST_CELLS = PANELS * DUST_COLS * DUST_ROWS;
export const CRACK_POINTS = 6;

// Where things are. x/z in metres, north is -z. ry is the way a fixture faces: the astronaut
// stands on its local +z side.
const CRACK_ANGLES = [45, 140, 215, 245, 295, 320]; // degrees round the habitat's drum, clear of the four airlocks, the window and the side modules
export const PLACES = {
  // The four hatches on the habitat model, each a walk-in airlock into the hall. x/z is the hatch on the
  // model's skin, ry turns the chamber so its open end (local +z) faces out. `hall` is the same chamber's
  // twin on a wall of the hall, in room coordinates: the two are swapped while both hatches are shut.
  doors: {
    S: { x: 0,    z: 2.54,  ry: 0,            hall: { x: 0,    z: 0,   ry: 0 } },
    N: { x: 0,    z: -2.54, ry: Math.PI,      hall: { x: 2.5,  z: -15, ry: Math.PI } },
    W: { x: -3.4, z: 0.95,  ry: 0,            hall: { x: -3.5, z: -3,  ry: -Math.PI / 2 } },
    E: { x: 7.4,  z: 0,     ry: Math.PI / 2,  hall: { x: 3.5,  z: -8,  ry: Math.PI / 2 } },
  },
  // The hall's window onto the Moon, and the painted window on the habitat (Segment C) it looks out of.
  window: { hall: { x: 1.9, y: 1.7, z: 0, ry: 0 }, out: { x: -1.75, y: 2.1, z: 1.84, ry: -0.76 } },
  // Where a tool can lie at the start of a mission, in room coordinates (y is the surface it lies on), and
  // what Mission Ops' tool log calls the place.
  toolSpots: [
    { x: 0.55,  y: 0.96, z: -4.15, area: 'BENCH' },
    { x: -0.35, y: 0.96, z: -4.2,  area: 'BENCH' },
    { x: -1.4,  y: 0.96, z: -5.55, area: 'BENCH' },
    { x: 2.45,  y: 0,    z: -2.1,  area: 'LOCKERS' },
    { x: -2.7,  y: 0,    z: -4.3,  area: 'WEST DOOR' },
    { x: 1.2,   y: 0,    z: -7.0,  area: 'HALL' },
    { x: -3.2,  y: 1.78, z: -10.75, area: 'LIFE SUPPORT' },
    { x: -0.5,  y: 0,    z: -11.0, area: 'NORTH END' },
    { x: 2.5,   y: 0,    z: -13.4, area: 'CORRIDOR' },
    { x: 2.9,   y: 0,    z: -10.4, area: 'EAST WALL' },
  ],
  // The demo mission always lays the tools out the same way (indexes into toolSpots); free play shuffles.
  demoTools: { brush: 0, patch: 3, welder: 7, tire: 8, gen: 5 },
  restock: 8, // a new tire turns up here
  panels: [{ x: 9, z: 8 }, { x: 9, z: 11 }, { x: 9, z: 14 }],
  cracks: CRACK_ANGLES.map(deg => { const a = deg * Math.PI / 180; return { a, x: Math.cos(a) * 2.52, z: Math.sin(a) * 2.52 }; }),
  rover:  { x: 4, z: 9 },                 // the Hauler's start (kept under this name for the scenery code)
  rovers: { hauler: { x: 4, z: 9 }, scout: { x: -4, z: 8 } },
  // The sample port: a hopper on the habitat's outside wall beside door S, at waist height.
  port:   { x: 1.6, z: 2.32, ry: Math.atan2(1.6, 2.32) },
  // Scenery only: nothing to fix here.
  depot:  { x: -9, z: -5 },
  dish:   { x: 10, z: -6 },
  drill:  { x: -7, z: 10 },
};

// The director plays one of these, in order, one at a time: each event waits until nothing is broken, no
// shower is under way, and CFG.faultGapSeconds have passed since the last fix (CFG.firstFaultSeconds for
// the first). A meteor entry is the moment the warning starts; impacts begin CFG.meteorWarnSeconds later.
// A shower breaks nothing itself: caught in the open, the astronaut's suit starts leaking.
export const SCRIPTS = {
  // The same things in the same order every time, for judges.
  demo: [
    { ev: 'dust' },
    { ev: 'wheel', which: 'scout' },
    { ev: 'meteor' },
    { ev: 'hull' },
    { ev: 'suit' },
  ],
  // One scripted opener, then random.
  free: [
    { ev: 'dust' },
  ],
};

// The two rovers. The Technician drives both at once: the Scout with W A S D, the Hauler with the arrows.
// reveal: metres round it that the Scientist's chart develops as it drives. radius: its body, for bumping.
export const ROVERS = {
  scout:  { name: 'Scout',  speed: 6,   turn: 1.8, reveal: 16, radius: 0.9 },
  hauler: { name: 'Hauler', speed: 4.5, turn: 1.2, riderTurn: 0.7, reveal: 8, radius: 1.6 },
};
// Where the rider stands on the Hauler (its own frame: +z is forward), and the tray's four cups.
// rack: where the core drill hangs on the Hauler's left flank (its foot, in the Hauler's frame; ry turns
// the drill so its face, local +z, looks outboard and its two handles run fore and aft).
export const HAULER = { plate: { x: 0, y: 0.45, z: -1.55, hw: 0.45, hd: 0.25 }, rack: { x: -1.02, y: 0.3, z: 0, ry: -Math.PI / 2 }, cups: [-0.45, -0.15, 0.15, 0.45].map(x => ({ x, y: 1.02, z: -0.98 })) };

// The rock samples. Each type has one look, and one lookalike (a dud) that differs in a way you can say
// out loud. Only the Scientist's field guide shows which is which.
//   where: rim | shadow | flat | patch. tell: flecks | holes | beads | frost. glyph: the chart's mark.
export const SAMPLES = {
  anor:   { name: 'Anorthosite',     look: 'pale-flecked', dud: 'pale-plain',  glyph: 'diamond', where: 'rim',    tell: 'flecks' },
  basalt: { name: 'Vesicular basalt', look: 'dark-pitted', dud: 'dark-smooth', glyph: 'dots',    where: 'flat',   tell: 'holes' },
  glass:  { name: 'Orange glass',    look: 'ochre-beads',  dud: 'foil-scrap',  glyph: 'triangle', where: 'patch',  tell: 'beads' },
  ice:    { name: 'Ice-bearing clod', look: 'frost-blue',  dud: 'dusty-pale',  glyph: 'star',    where: 'shadow', tell: 'frost' },
};
export const LOOKS = Object.values(SAMPLES).flatMap(t => [t.look, t.dud]);
export const MODES = { demo: 'Demo mission', free: 'Free play' };

export const ROLES = {
  astronaut: 'Astronaut',
  ops: 'Mission Ops',
  tech: 'Technician',
  sci: 'Scientist',
  all: 'Mission Control (all consoles)',
};
