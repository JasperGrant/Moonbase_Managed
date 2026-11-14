// Every tunable number lives here. The server and all four clients import this file,
// so nobody can disagree about the rules.

export const CFG = {
  roundSeconds: 150,      // judges get 3 minutes: 2:30 of play + briefing
  delayMs: 1300,          // Earth-Moon one-way light time, about 1.3 s
  tickMs: 100,            // server simulation step
  o2DrainPerSec: 0.45,    // suit oxygen drain (about 100x faster than a real EVA)
  mistakePenalty: 8,      // oxygen lost per wrong action
  missPenalty: 15,        // oxygen lost when an alarm times out
  issueSeconds: 50,       // time to fix each alarm
  firstSpawnAt: 4,        // seconds into the round
  spawnEvery: 24,         // seconds between alarms
  maxActive: 2,           // alarms at once
  firstIssue: 'wires',    // the first alarm is always this one, so the opening is predictable
  roverSpeed: 2.7,        // m/s, about 6 mph (crewed lunar terrain vehicle class)
  bounds: 22,             // metres from the habitat that players and rover may go
  habRadius: 2.9,
  spawn: { x: 0, z: 7 },
  defaultVehicle: 'heavy',
  defaultGear: ['beacon', 'lamp', 'diag', 'o2'],
};

// Mission design step (Space Apps): pick a lander, then fit gear into its mass capacity.
export const VEHICLES = {
  heavy: { name: 'Heavy cargo lander', cap: 5, o2: 100, blurb: 'Carries 5 mass units of gear. Slow transit uses more suit oxygen.' },
  fast:  { name: 'Fast courier',       cap: 3, o2: 120, blurb: 'Carries only 3 mass units. Quick transit leaves 20% more oxygen.' },
};

export const GEAR = {
  beacon: { name: 'Suit beacon',    mass: 1, blurb: 'Technician sees the astronaut on the map.' },
  lamp:   { name: 'Helmet lamp',    mass: 1, blurb: 'Lights up the long south-pole shadows.' },
  diag:   { name: 'Diagnostic kit', mass: 1, blurb: 'The first mistake costs no oxygen.' },
  o2:     { name: 'Spare O2 tank',  mass: 2, blurb: '+25 suit oxygen.' },
  boots:  { name: 'Hop boots',      mass: 1, blurb: 'Astronaut moves 40% faster and jumps higher.' },
};

// One station per minigame. x/z in metres, north is -z. ry is the way the panel faces.
const face = (x, z) => Math.atan2(-x, -z); // face the habitat at the origin
export const STATIONS = {
  wires: { name: 'Fuel depot',       x: -9, z: -5, ry: face(-9, -5) },
  freq:  { name: 'Comms dish',       x: 10, z: -6, ry: face(10, -6) },
  patch: { name: 'Airlock terminal', x: 4.2, z: 3.4, ry: 0 },
  drill: { name: 'Drill rig',        x: -6, z: 9,  ry: face(-6, 9) },
};

export const ISSUES = {
  wires: { title: 'Fuel-ox valve stuck' },
  freq:  { title: 'Comms dish off frequency' },
  patch: { title: 'Airlock software fault' },
  drill: { title: 'Drill jammed' },
};

export const ROLES = {
  astronaut: 'Astronaut',
  ops: 'Mission Ops',
  tech: 'Technician',
  sci: 'Scientist',
  all: 'Mission Control (all consoles)',
};

export function bearing(x, z) {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const a = Math.atan2(x, -z); // 0 = north, clockwise
  return names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
