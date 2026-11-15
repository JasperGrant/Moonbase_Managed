// Small rules that both the server and the clients need to agree on.
import { CFG, PLACES } from './config.js';
import { LANDMARKS as FIELD_MARKS } from './field.js';

// The astronaut's hands are [left, right]: a tool id or null, one tool in each. Which hand a take fills:
// the one asked for if it is empty, else the right, else the left. -1 if both are full.
export function freeHand(hands, want) {
  if (want === 0 || want === 1) return hands[want] ? -1 : want;
  return !hands[1] ? 1 : !hands[0] ? 0 : -1;
}

// Is the astronaut safe from a meteor shower? Inside (the hall or an airlock chamber), or crouched
// beside the rover. pose: { x, z, h, inside } with h the head height in metres. rover: { x, z }.
export function sheltered(pose, rover) {
  if (pose.inside) return true;
  return pose.h < CFG.crouchHeight && Math.hypot(pose.x - rover.x, pose.z - rover.z) < CFG.roverCoverRadius;
}

// What Mission Ops' tool log calls a place: a named spot in the hall, or the nearest landmark outside.
const LANDMARKS = [['SOLAR', () => PLACES.panels[1]], ...FIELD_MARKS.map(l => [l.name, () => l])];
export function areaName(inside, x, z, rover) {
  if (inside) {
    let best = null, d = Infinity;
    for (const s of PLACES.toolSpots) { const e = Math.hypot(s.x - x, s.z - z); if (e < d) { d = e; best = s.area; } }
    return d < 2.2 ? best : 'HALL';
  }
  const marks = [...LANDMARKS.map(([n, p]) => [n, p()]), ['HAB', { x: 0, z: 0 }], ...(rover ? [['ROVER', rover]] : [])];
  let best = 'FIELD', d = 6;
  for (const [n, p] of marks) { const e = Math.hypot(p.x - x, p.z - z) - (n === 'HAB' ? 2.5 : 0); if (e < d) { d = e; best = n; } }
  return 'OUTSIDE ' + best;
}
