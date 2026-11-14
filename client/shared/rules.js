// The puzzle rules. The server uses the solver; the Scientist console shows MANUAL.
// If you change a rule, change both in this file.

export const WIRE_COLORS = ['red', 'blue', 'yellow', 'white'];
export const ROCK_COLORS = ['grey', 'red', 'yellow', 'black', 'green'];
export const CODE_CHARS = 'ACFHJKLMNPTWXY34679'; // no look-alikes or sound-alikes

// Returns the index (0 = leftmost) of the wire to pull.
export function solveWires({ colors, serial, pressure }) {
  if (pressure === 'HIGH' && colors.includes('yellow')) return colors.lastIndexOf('yellow');
  const odd = Number(serial.at(-1)) % 2 === 1;
  if (odd && colors.filter(c => c === 'red').length > 1) return colors.indexOf('red');
  if (!colors.includes('blue')) return 1;
  return colors.length - 1;
}

// Returns the breakers to reset, in order (indices, 0 = breaker 1). The shorted one stays off.
export function breakerOrder({ tripped, fault, battery }) {
  const healthy = tripped.filter(i => i !== fault).sort((a, b) => a - b);
  return battery < 50 ? healthy.reverse() : healthy;
}

export const MANUAL = {
  wires: {
    title: 'Fuel-ox valve stuck (Fuel depot)',
    ask: 'Ask the astronaut: the wire colours left to right, and the serial number on the panel.',
    rules: [
      'If tank pressure is HIGH and there is a yellow wire: pull the LAST yellow wire.',
      'Otherwise, if the serial number ends in an odd digit and there is more than one red wire: pull the FIRST red wire.',
      'Otherwise, if there are no blue wires: pull the SECOND wire.',
      'Otherwise: pull the LAST wire.',
    ],
  },
  freq: {
    title: 'Comms dish off frequency (Comms dish)',
    ask: 'The astronaut has no readout. The Technician sees the current channel. You see the target.',
    rules: [
      'Work out how far the dish is from the target channel.',
      'The astronaut has buttons for -10, -1, +1 and +10. Tell them how many presses of each.',
      'When the Technician confirms the channel matches, the astronaut presses LOCK.',
    ],
  },
  patch: {
    title: 'Airlock software fault (Airlock terminal)',
    ask: 'The astronaut reads a 4-character fault code off the screen.',
    rules: [
      'Mission Ops types the fault code into the uplink terminal.',
      'The patch takes 2.6 s to go up and come back. The terminal then shows a 3-digit key.',
      'The astronaut enters the key on the keypad.',
    ],
  },
  drill: {
    title: 'Drill jammed (Drill rig)',
    ask: 'Five rocks are stuck in the hopper. One is a core sample.',
    rules: [
      'Your telemetry shows the colour of the core sample. It must stay.',
      'The astronaut pulls out the other four rocks.',
    ],
  },
  power: {
    title: 'Main power bus tripped (Breaker panel, inside the habitat)',
    ask: 'The habitat is on red backup lights. Ask the astronaut which numbered breakers show a red lamp. The Technician sees which circuit has a short.',
    rules: [
      'The shorted breaker must stay OFF. Never reset it.',
      'If your battery reading is BELOW 50%: reset the other tripped breakers from the HIGHEST number to the lowest.',
      'Otherwise: reset them from the LOWEST number to the highest.',
    ],
  },
};
