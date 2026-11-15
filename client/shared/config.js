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

  batterySeconds: 60,         // 100% to 0% while a power fault is active
  rechargeSeconds: 20,        // 0% to 100% with no power fault
  blackoutEndsAt: 10,         // battery % at which a blackout lifts
  generatorSeconds: 25,       // power from one pull of the backup generator

  tireRestockSeconds: 30,     // a new space tire turns up at the cargo end of the hall this long after one is fitted

  meteorWarnSeconds: 15,      // radar warning before the first impact
  meteorSeconds: 8,           // how long a shower lasts
  meteorGraceSeconds: 3,      // the first impacts land far away
  crouchHeight: 1.1,          // head below this (metres) counts as crouching
  roverCoverRadius: 2.2,      // metres from the rover's centre (about 1.5 m from its side)

  reach: 4.5,                 // metres: the server refuses work on a fixture further away than this
  roverSpeed: 2.7,            // m/s, about 6 mph (crewed lunar terrain vehicle class)
  bounds: 22,                 // metres from the habitat that players and rover may go
  habRadius: 2.9,
  // The astronaut starts inside the hall (room coordinates, see client/interior.js), facing up it, with
  // the tools lying round. The server sees them at door S until they go out.
  spawn: { inside: true, x: 0, z: -1.3, door: 'S' },
  // The airlock cycle, seconds (client/airlock.js): stand in the chamber, a hatch swings shut, the air
  // hisses, the other hatch swings open.
  airlock: { dwell: 0.3, close: 1.0, repress: 1.2, open: 1.0, abort: 0.6 },

  // Free play: after the scripted opening, random faults and showers.
  freeFaultEvery: [25, 35],   // seconds between random faults
  freeMaxFaults: 3,
  freeMeteorEvery: [50, 70],  // seconds between showers
  freeHullChance: 0.5,        // chance a shower cracks the hull

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
const CRACK_ANGLES = [45, 140, 215, 245, 295, 320]; // degrees round the habitat's drum, clear of the four airlocks, the window and the side modules
export const PLACES = {
  // The switchboard is inside the habitat, on the west wall of the hall (client/interior.js). Inside
  // (the hall or any airlock chamber) is cover from a meteor shower, and the only place the board is in reach.
  board:  { x: 0, z: 0 },
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
