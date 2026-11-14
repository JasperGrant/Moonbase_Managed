// Small rules that both the server and the clients need to agree on.
import { CFG, TOOLS, PLACES } from './config.js';

export const beltWeight = belt => belt.reduce((w, t) => w + TOOLS[t].weight, 0);
export const fits = (belt, tool) => beltWeight(belt) + TOOLS[tool].weight <= CFG.beltCapacity;

// Is the astronaut safe from a meteor shower? Under the airlock canopy, or crouched beside the rover.
// pose: { x, z, h } with h the head height in metres. rover: { x, z }.
export function sheltered(pose, rover) {
  const c = PLACES.canopy;
  if (pose.x > c.x0 && pose.x < c.x1 && pose.z > c.z0 && pose.z < c.z1) return true;
  return pose.h < CFG.crouchHeight && Math.hypot(pose.x - rover.x, pose.z - rover.z) < CFG.roverCoverRadius;
}
