// Light text guidance (docs/SPEC-guidance.md). One place for the words, so Mission Control, the astronaut's
// page and (from phase 3) the server agree on them.
//
// Phase 1: the role briefings that pop up, and the role, goal and key lines each console's teletype strip
// types out at the start of a mission. The page picks the line; from phase 3 the server will.
import { CFG } from './config.js';

// ---------- the briefings: who you are, what to do, your controls, who you talk to ----------
// controls: [what, how] rows. The astronaut's rows have a headset, a bare-hands and a laptop way.
export const BRIEFINGS = {
  astronaut: {
    title: 'ASTRONAUT',
    story: 'You are the only person on the Moon. The base stands on the ridge between Shackleton and de Gerlache craters at the south pole, built by people who learned their trade on Gemini. Mission Control is 384,000 km away and can see everything except what is in front of you.',
    job: `Bring ${CFG.sample.manifest} rock samples home. Mission Ops tells you which rock and where, and a beacon marks the spot. When something breaks you are the only one with hands: take the right tool off its rack, go out, and fix it. Get inside before a meteor shower, or crouch beside the Hauler. Your oxygen refills inside.`,
    controls: {
      headset: [
        ['MOVE', 'Left stick to walk, right stick to turn, A to hop'],
        ['TAKE', 'Hold the trigger or grip on a tool or rock; let go to drop it, swing to throw'],
        ['USE', 'Hold the tool against the broken thing'],
        ['RADIO', 'Raise your left wrist like a watch'],
        ['RIDE', 'Grab the rail on the back of the Hauler'],
        ['DOORS', 'Walk into an airlock and wait'],
        ['SUIT, POWER', 'Touch the patch kit to the leak; pull the generator cord'],
        ['COVER, LEAVE', 'Crouch; hold a finger on EXIT on your cuff'],
      ],
      hands: [
        ['MOVE', 'Pinch the ground to hop there; pinch left and drag to turn'],
        ['TAKE', 'Pinch a tool or rock; let go to drop it'],
        ['RADIO', 'Raise your left wrist, or hand to helmet'],
        ['ZOOM', 'Pinch both empty hands and pull apart'],
      ],
      laptop: [
        ['MOVE', 'W A S D, mouse to look, Space to hop'],
        ['TAKE', 'Click a tool or rock, or hold E on it; Q puts it down'],
        ['USE', 'Click the broken thing; hold to keep brushing or welding'],
        ['RADIO', 'Hold Tab (your wrist comes up)'],
        ['RIDE', 'E at the Hauler; E again to step off'],
        ['DOORS', 'Walk into an airlock and wait'],
        ['SUIT, POWER', 'F to patch, G for the generator'],
        ['COVER, LEAVE', 'C to crouch; hold X'],
      ],
    },
    talk: 'Only Mission Ops. Your left wrist shows your oxygen, the clock, what is in each hand, and a triangle when something is broken.',
  },
  ops: {
    title: 'MISSION OPS',
    story: 'You are CAPCOM, the one voice the astronaut hears across 384,000 km. The Scientist and the Technician know what the astronaut needs, but only you are on the radio.',
    job: 'Turn what the others know into what the astronaut does. Ask the Scientist which rock and what broke; ask the Technician where the rovers are. Tell the astronaut where to go and what to pick up. When the astronaut is suited, call them GO in the lobby.',
    controls: [
      ['TALK', 'Hold SPACE, or the big button'],
      ['RADIO', 'ENABLE RADIO turns your microphone on'],
      ['GO', 'GO under the astronaut in the lobby, then READY for yourself'],
      ['BEACON', 'Click a tool in the TOOL LOG to light a beacon over it'],
      ['LOGS', 'HANDS: what they hold. TOOL LOG: where each tool is. SAMPLE LOG: hand, tray, banked'],
    ],
    talk: 'Everyone. You are the only seat that talks to the astronaut.',
  },
  tech: {
    title: 'TECHNICIAN',
    story: 'You drive two robots across the Moon from a chair in Houston: the Scout, a quick prospector, and the Hauler, the big rover the astronaut rides. You have no map: two camera screens, a compass and a needle that points home.',
    job: 'Take the Scout where the Scientist asks, so the chart fills in and samples show up. Bring the Hauler to the astronaut, wait for the RIDER lamp, and drive them out and back gently. You alone get the meteor warning: tell Ops at once, so the astronaut gets inside or crouches by a stopped Hauler.',
    controls: [
      ['SCOUT', 'W A S D. Let go and it stops'],
      ['HAULER', 'Arrow keys, at the same time'],
      ['VIEWS', 'C or click the left screen (Scout), / or click the right (Hauler). Wheel: chase distance'],
      ['HOME', 'The red needle points to base, with the range in metres'],
      ['LAMPS', 'WHEEL: that rover is stuck. RIDER: the astronaut is aboard. METEOR: counts down to impact'],
    ],
    talk: 'The Scientist, for where to go. Ops, for the astronaut and the meteor warning.',
  },
  sci: {
    title: 'SCIENTIST',
    story: 'You are the geologist, with an orbital survey of the ridge and a field guide to what the mission came for: anorthosite, the Moon\'s oldest crust; basalt, pitted with gas holes; the orange glass of old fire fountains; ice, from craters the sun never touches. Each one has a lookalike.',
    job: 'Read the chart: bright ground may hold samples. Send the Technician\'s Scout there; the chart sharpens wherever a rover drives, and samples appear on it. Describe the right rock from your field guide so Ops can tell the astronaut. When something breaks, its symbol blinks on the chart: tell Ops what it is and which tool fixes it.',
    controls: [
      ['SURVEY', 'The chart. RANGE zooms, CENTRE follows the base, the Scout or the Hauler. Click it to stand a beacon there'],
      ['GUIDE', 'A card for each wanted sample: what it looks like, where it lies, its telltale, and NOT THIS. ASSAY: FOUND or DUD'],
      ['POWER', 'The battery and the solar panels\' charge'],
      ['AIR', 'Oxygen, drain and the LEAK lamp'],
    ],
    talk: 'The Technician, for where to drive. Ops, for which rock and what broke.',
  },
  all: {
    title: 'MISSION OPERATOR',
    story: 'A shoestring crew: you are Mission Control, all of it.',
    job: 'Everything on the other three cards. Read the chart, drive the Scout to bright ground, find the sample, bring the astronaut on the Hauler, and talk them onto the right rock. When something breaks, the chart\'s symbol says what: tell the astronaut which tool.',
    controls: [
      ['TALK', 'Hold SPACE'],
      ['ROVERS', 'W A S D for the Scout, the arrows for the Hauler'],
      ['CHART', 'The SURVEY, GUIDE, POWER and AIR tabs'],
      ['BEACON', 'Click a tool in the TOOL LOG, or a spot on the chart'],
    ],
    talk: 'The astronaut, and nobody else.',
  },
};

// The briefing as a card of HTML: the pop-up on each seat's page (style.css, .brief-card).
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rows = list => `<table>${list.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`;
const WAYS = { headset: 'Headset', hands: 'Bare hands', laptop: 'Laptop' };
export function briefHTML(seat) {
  const b = BRIEFINGS[seat];
  const controls = Array.isArray(b.controls) ? `<h5>Your controls</h5>${rows(b.controls)}`
    : Object.entries(b.controls).map(([way, list]) => `<h5>Your controls: ${WAYS[way]}</h5>${rows(list)}`).join('');
  return `<div class="brief-card"><h4>${esc(b.title)}</h4><p class="story">${esc(b.story)}</p>
    <h5>Your job</h5><p>${esc(b.job)}</p>${controls}
    <h5>Who you talk to</h5><p>${esc(b.talk)}</p></div>`;
}

// ---------- the teletype lines for phase 1 ----------
// full: the 4-player wording; all: the 2-player seat's, where it differs.
export const LINES = {
  'sci.role': { full: 'YOU HAVE THE CHART AND THE FIELD GUIDE.' },
  'sci.goal': { full: `MISSION: ${CFG.sample.manifest} SAMPLES. THE GUIDE TAB SHOWS THEM.` },
  'ops.role': { full: 'YOU ARE THE ONLY VOICE. HOLD SPACE TO TALK.' },
  'ops.goal': { full: `MISSION: ${CFG.sample.manifest} SAMPLES HOME. ASK THE SCIENTIST WHERE.`, all: `MISSION: ${CFG.sample.manifest} SAMPLES HOME. THE CHART SHOWS WHERE.` },
  'tech.role': { full: 'YOU DRIVE BOTH ROVERS. NO MAP: ASK THE SCIENTIST.', all: 'YOU DRIVE BOTH ROVERS. THE CHART IS YOUR MAP.' },
  'tech.keys': { full: 'SCOUT: W A S D. HAULER: ARROWS. BOTH AT ONCE.' },
  'tech.keys.h': { full: 'HAULER: ARROWS. IT CARRIES THE ASTRONAUT.' },
  'all.role': { full: 'YOU ARE MISSION CONTROL: VOICE, ROVERS AND CHART.' },
};
export const lineText = (id, all = false) => !id ? '' : (all && LINES[id].all) || LINES[id].full;

// The role line shows this long at the start of a mission.
export const ROLE_SECONDS = 20;

// Which line a console's strip shows now, from what the page knows. seat: 'ops' | 'tech' | 'sci' | 'all'.
// done: { found, guide, scout, hauler, missions } (what this seat has done; missions it has finished).
export function pickLine(seat, s, done) {
  if (!s || s.phase !== 'run') return null;
  const elapsed = CFG.roundSeconds - (s.timeLeft ?? CFG.roundSeconds);
  const first = elapsed < ROLE_SECONDS && !done.missions;
  const keys = !(done.scout && done.hauler) ? (done.scout ? 'tech.keys.h' : 'tech.keys') : null;
  if (seat === 'ops') return first ? 'ops.role' : !done.found ? 'ops.goal' : null;
  if (seat === 'sci') return first ? 'sci.role' : !done.guide ? 'sci.goal' : null;
  if (seat === 'tech') return first ? 'tech.role' : keys;
  // 2-player: one strip, the whole of Mission Control.
  return first ? 'all.role' : keys || (!done.found ? 'ops.goal' : null);
}
