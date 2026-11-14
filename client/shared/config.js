// Every tunable number lives here. The server and all four clients import this file,
// so nobody can disagree about the rules.

export const CFG = {
  roundSeconds: 180,          // judges get a few minutes: 3:00 of play
  delayMs: 1300,              // Earth-Moon one-way light time, about 1.3 s
  tickMs: 100,                // server simulation step

  o2Start: 100,
  o2DrainPerSec: 0.28,        // suit oxygen drain (about 100x faster than a real EVA)
  leakMultiplier: 3,          // a leak drains oxygen this many times faster; two leaks at once, five times
  meteorHit: 20,              // oxygen lost when caught in the open
  wrongPlug: 4,               // oxygen lost per cable pushed into the wrong socket
  fixPoints: 100,             // score per fault fixed

  batterySeconds: 45,         // 100% to 0% while a power fault is active
  rechargeSeconds: 20,        // 0% to 100% with no power fault
  blackoutEndsAt: 10,         // battery % at which a blackout lifts
  generatorSeconds: 25,       // power from one pull of the backup generator

  beltCapacity: 4,            // weight units the astronaut can carry
  tireRestockSeconds: 30,     // a new space tire appears in the locker this long after one is fitted

  meteorWarnSeconds: 15,      // radar warning before the first impact
  meteorSeconds: 8,           // how long a shower lasts
  meteorGraceSeconds: 3,      // the first impacts land far away
  crouchHeight: 1.1,          // head below this (metres) counts as crouching
  roverCoverRadius: 2.2,      // metres from the rover's centre (about 1.5 m from its side)

  reach: 4.5,                 // metres: the server refuses work on a fixture further away than this
  roverSpeed: 2.7,            // m/s, about 6 mph (crewed lunar terrain vehicle class)
  bounds: 22,                 // metres from the habitat that players and rover may go
  habRadius: 2.9,
  spawn: { x: -3.6, z: 7.0 }, // facing the tool locker

  // Free play: after the scripted opening, random faults and showers.
  freeFaultEvery: [25, 35],   // seconds between random faults
  freeMaxFaults: 3,
  freeMeteorEvery: [50, 70],  // seconds between showers
  freeHullChance: 0.5,        // chance a shower cracks the hull

  // The lobby: every role is picked and ready, then a short countdown starts the mission.
  // requireFullCrew: false lets one developer ready up alone (or run the server with SOLO=1).
  lobby: { requireFullCrew: true, countdownSeconds: 3 },
};

// The four roles that must be filled before a mission starts. "all" (2-player mode) covers the last three.
export const CREW = ['astronaut', 'ops', 'sci', 'tech'];
export const covers = (held, role) => held === role || (held === 'all' && role !== 'astronaut');

// The tool belt. Welder + brush + patch kit fill it exactly, so the tire or the
// generator always means leaving something behind.
export const TOOLS = {
  brush:  { name: 'Brush',            weight: 1 },
  patch:  { name: 'Patch kit',        weight: 1 },
  welder: { name: 'Welder',           weight: 2 },
  tire:   { name: 'Space tire',       weight: 3 },
  gen:    { name: 'Backup generator', weight: 3 },
};

// What can break, the tool that fixes it, and the line for the results log.
export const FAULTS = {
  dust:  { name: 'Dusty solar panels',  tool: 'brush' },
  board: { name: 'Tripped switchboard', tool: null },
  wheel: { name: 'Broken rover wheel',  tool: 'tire' },
  hull:  { name: 'Hull breach',         tool: 'welder' },
  suit:  { name: 'Suit leak',           tool: 'patch' },
};

export const CABLE_COLORS = ['red', 'blue', 'yellow', 'green'];
export const SOCKET_SHAPES = ['triangle', 'circle', 'square', 'diamond'];
export const DUST_COLS = 3, DUST_ROWS = 2, PANELS = 3;
export const DUST_CELLS = PANELS * DUST_COLS * DUST_ROWS;
export const CRACK_POINTS = 6;

// Where things are. x/z in metres, north is -z. ry is the way a fixture faces: the astronaut
// stands on its local +z side.
const CRACK_ANGLES = [45, 135, 195, 255, 285, 345]; // degrees round the dome, between the ribs
export const PLACES = {
  locker: { x: -3.6, z: 4.6, ry: 0 },
  board:  { x: 4.2, z: 3.4, ry: 0 },
  panels: [{ x: 9, z: 8 }, { x: 9, z: 11 }, { x: 9, z: 14 }],
  canopy: { x0: -1.5, x1: 1.5, z0: 2.6, z1: 5.8 },
  cracks: CRACK_ANGLES.map(deg => { const a = deg * Math.PI / 180; return { a, x: Math.cos(a) * 2.52, z: Math.sin(a) * 2.52 }; }),
  rover:  { x: 4, z: 9 },
  // Scenery only: nothing to fix here.
  depot:  { x: -9, z: -5 },
  dish:   { x: 10, z: -6 },
  drill:  { x: -7, z: 10 },
};

// The director plays one of these. `at` is seconds into the round. A meteor entry is the moment
// the radar warning starts; impacts begin CFG.meteorWarnSeconds later and `after` lists what the
// shower breaks when it ends.
export const SCRIPTS = {
  // The same every time, for judges.
  demo: [
    { at: 5,   ev: 'dust' },
    { at: 45,  ev: 'wheel' },
    { at: 85,  ev: 'meteor', after: ['dust', 'hull', 'board'] },
    { at: 150, ev: 'suit' },
  ],
  // One scripted opener, then random.
  free: [
    { at: 5, ev: 'dust' },
  ],
};
export const MODES = { demo: 'Demo mission', free: 'Free play' };

export const ROLES = {
  astronaut: 'Astronaut',
  ops: 'Mission Ops',
  tech: 'Technician',
  sci: 'Scientist',
  all: 'Mission Control (all consoles)',
};
