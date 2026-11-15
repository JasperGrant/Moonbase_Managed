// Small rules that both the server and the clients need to agree on.
import { CFG, PLACES } from './config.js';

// The astronaut's hands are [left, right]: a tool id or null. Which hand a take fills: the one asked
// for if it is empty, else the right, else the left. -1 if both are full.
export function freeHand(hands, want) {
  if (want === 0 || want === 1) return hands[want] ? -1 : want;
  return !hands[1] ? 1 : !hands[0] ? 0 : -1;
}
export const heldIn = (hands, id) => hands.indexOf(id);

// Is the astronaut safe from a meteor shower? Under the airlock canopy, or crouched beside the rover.
// pose: { x, z, h } with h the head height in metres. rover: { x, z }.
export function sheltered(pose, rover) {
  const c = PLACES.canopy;
  if (pose.x > c.x0 && pose.x < c.x1 && pose.z > c.z0 && pose.z < c.z1) return true;
  return pose.h < CFG.crouchHeight && Math.hypot(pose.x - rover.x, pose.z - rover.z) < CFG.roverCoverRadius;
}
