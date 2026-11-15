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
    story: 'You are the only person on the Moon. The base stands on the ridge between Shackleton and de Gerlache craters at the south pole. Mission Control is 384,000 km away and can see everything except what is in front of you.',
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
      ['BEACON', 'Click a tool on the TOOL BOARD to light a beacon over it; click it again to put it out'],
      ['DESK', 'HANDS: what they hold. TOOL BOARD: the bay each tool lies in. SAMPLES: hand, tray, banked, and the drill. The tape: what has happened'],
      ['LIGHTS', 'The square lamps along the top light when something happens: alarm, fixed, meteor hit, base dark, power back, banked, no link'],
    ],
    talk: 'Everyone. You are the only seat that talks to the astronaut.',
  },
  tech: {
    title: 'TECHNICIAN',
    story: 'You drive two robots across the Moon from a chair in Houston: the Scout, a quick prospector, and the Hauler, the big rover the astronaut rides. You have no map: two camera screens, a compass and a needle that points home.',
    job: 'Take the Scout where the Scientist asks, so the chart fills in and samples show up. Bring the Hauler to the astronaut, and drive them out and back gently. You alone get the meteor warning: tell Ops at once, so the astronaut gets inside.',
    controls: [
      ['SCOUT', 'W A S D. Let go and it stops'],
      ['HAULER', 'Arrow keys, at the same time'],
      ['VIEWS', 'C or click the left screen (Scout), / or click the right (Hauler). Wheel: chase distance'],
      ['HOME', 'The red needle points to base, with the range in metres'],
      ['LAMPS', 'Under each screen: WHEEL (that rover is stuck), RIDER (the astronaut is aboard). Between the screens: METEOR, counting down to impact, and TAKE COVER'],
    ],
    talk: 'The Scientist, for where to go. Ops, for the astronaut and the meteor warning.',
  },
  sci: {
    title: 'SCIENTIST',
    story: 'You are the geologist, with an orbital survey of the ridge and a field guide to what the mission came for: anorthosite, the Moon\'s oldest crust; basalt, pitted with gas holes; the orange glass of old fire fountains; ice, from craters the sun never touches.',
    job: 'Read the chart: bright ground may hold samples. Send the Technician\'s Scout there; the chart sharpens wherever a rover drives, and samples appear on it. When something breaks, its symbol blinks on the chart: tell Ops what it is and which tool fixes it.',
    controls: [
      ['SURVEY', 'The round chart, always on. R: range. E: centre on the base, the Scout or the Hauler. Click it to stand a beacon there'],
      ['1 GUIDE', 'A card for each wanted sample: what it looks like, where it lies and its telltale. ASSAY: the last rock banked'],
      ['2 POWER', 'The battery and the solar panels\' charge, with a recorder of the last minute'],
      ['3 AIR', 'Oxygen, drain and the LEAK lamp, with a recorder of the last minute'],
    ],
    talk: 'The Technician, for where to drive. Ops, for which rock and what broke.',
  },
  all: {
    title: 'MISSION OPERATOR',
    story: 'A shoestring crew: you are Mission Control, all of it.',
    job: 'Everything on the other three cards. Read the chart, drive the Scout to bright ground, find the sample, bring the astronaut on the Hauler, and talk them onto the right rock. When something breaks, the chart\'s symbol says what: tell the astronaut which tool.',
    controls: [
      ['TALK', 'Hold SPACE'],
      ['ROVERS', 'W A S D for the Scout, the arrows for the Hauler. C and / change each camera\'s view'],
      ['CHART', 'R: range. E: centre. The field guide is under it, a row per sample'],
      ['BEACON', 'Click a tool in the TOOLS list, or a spot on the chart'],
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

// ---------- the lines (docs/SPEC-guidance.md, phases 1, 3 and 5) ----------
// Each page picks its own line from its own view of the game, which the server has already cut down to what
// that seat may know, so no line can tell a seat more than its instruments do. A line is always given in full,
// however many times the thing has happened before.
// tier: 1 danger, 2 fault, 5 teach, 6 idle (lower is more urgent).
// full: the 4-player wording; all: the 2-player seat's, where it differs. {ROVER} and {N} are filled in.
const GEN = CFG.generatorSeconds;
export const LINES = {
  // teach (phase 1)
  'sci.role':    { tier: 5, full: 'YOU HAVE THE CHART AND THE FIELD GUIDE.' },
  'sci.goal':    { tier: 5, full: `MISSION: ${CFG.sample.manifest} SAMPLES. KEY 1, THE GUIDE, SHOWS THEM.` },
  'ops.role':    { tier: 5, full: 'YOU ARE THE ONLY VOICE. HOLD SPACE TO TALK.' },
  'ops.goal':    { tier: 5, full: `MISSION: ${CFG.sample.manifest} SAMPLES HOME. ASK THE SCIENTIST WHERE.`, all: `MISSION: ${CFG.sample.manifest} SAMPLES HOME. THE CHART SHOWS WHERE.` },
  'tech.role':   { tier: 5, full: 'YOU DRIVE BOTH ROVERS. NO MAP: ASK THE SCIENTIST.', all: 'YOU DRIVE BOTH ROVERS. THE CHART IS YOUR MAP.' },
  'tech.keys':   { tier: 5, full: 'SCOUT: W A S D. HAULER: ARROWS. BOTH AT ONCE.' },
  'tech.keys.h': { tier: 5, full: 'HAULER: ARROWS. IT CARRIES THE ASTRONAUT.' },
  'all.role':    { tier: 5, full: 'YOU ARE MISSION CONTROL: VOICE, ROVERS AND CHART.' },
  // danger and faults (phase 3)
  'sci.dust':    { tier: 2, full: 'SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.', all: 'SOLAR PANELS DUSTY. ASTRONAUT NEEDS THE BRUSH.' },
  'sci.wheel':   { tier: 2, full: '{ROVER} WHEEL BROKEN. TELL OPS: A SPACE TIRE.', all: '{ROVER} WHEEL BROKEN. ASTRONAUT NEEDS A SPACE TIRE.' },
  'sci.hull':    { tier: 2, full: 'HULL BREACH. TELL OPS: THE WELDER.', all: 'HULL BREACH. ASTRONAUT NEEDS THE WELDER.' },
  'sci.suit':    { tier: 2, full: 'SUIT LEAK. TELL OPS: THE PATCH KIT, NOW.', all: 'SUIT LEAK. ASTRONAUT NEEDS THE PATCH KIT, NOW.' },
  'sci.leak':    { tier: 2, full: 'LEAK LAMP: HULL OR SUIT. ASK OPS.', all: 'LEAK LAMP: HULL OR SUIT. ASK THE ASTRONAUT.' },
  'sci.batt':    { tier: 1, full: 'BATTERY LOW. THE BASE GOES DARK AT ZERO.' },
  'sci.dark':    { tier: 1, full: 'BASE DARK: NO OXYGEN REFILL INSIDE.' },
  'ops.alarm':   { tier: 2, full: 'ALARM. ASK THE SCIENTIST WHAT BROKE.', all: "ALARM. THE CHART'S SYMBOL SAYS WHAT BROKE." },
  'ops.tool':    { tier: 2, full: 'YOUR TOOL BOARD SAYS WHERE EACH TOOL LIES.' },
  'ops.full':    { tier: 2, full: 'HANDS FULL. TELL THEM TO PUT ONE DOWN.', all: 'HANDS FULL. TELL THE ASTRONAUT TO PUT ONE DOWN.' },
  'ops.o2':      { tier: 1, full: 'SUIT OXYGEN LOW. ASTRONAUT INSIDE TO REFILL.' },
  'ops.dark':    { tier: 1, full: `BASE DARK. THE GENERATOR GIVES ${GEN} S OF POWER.` },
  'tech.wheel':  { tier: 2, full: '{ROVER} WHEEL BROKEN. TELL OPS: IT NEEDS A TIRE.', all: '{ROVER} WHEEL BROKEN. ASTRONAUT NEEDS A TIRE.' },
  'tech.meteor': { tier: 1, full: 'METEORS IN {N} S. TELL OPS: ASTRONAUT TO COVER.', all: 'METEORS IN {N} S. ASTRONAUT TO COVER, NOW.' },
  'tech.falling':{ tier: 1, full: 'METEORS FALLING. HOLD THE HAULER STILL.' },
  // idle (phase 5): after IDLE_SECONDS with nothing new
  'ops.idle':    { tier: 6, full: 'ASK THE SCIENTIST FOR THE NEXT SAMPLE.', all: 'PICK BRIGHT GROUND ON THE CHART. SEND THE SCOUT.' },
  'tech.idle':   { tier: 6, full: 'ASK THE SCIENTIST WHERE TO DRIVE.' },
  // the astronaut's cuff tape: 20 characters at most
  'astro.go':    { tier: 5, full: 'ASK OPS WHERE TO GO' },
  'astro.alarm': { tier: 2, full: 'ALARM: ASK OPS' },
  'astro.suit':  { tier: 1, full: 'SUIT LEAK: PATCH KIT' },
  'astro.patch': { tier: 1, full: 'TOUCH KIT TO LEAK' },
  'astro.o2':    { tier: 1, full: 'O2 LOW: GO INSIDE' },
  'astro.dark':  { tier: 1, full: 'BASE DARK: NO REFILL' },
  'astro.meteor':{ tier: 1, full: 'METEORS: TAKE COVER' },
  'astro.idle':  { tier: 6, full: 'ASK OPS: WHAT NEXT' },
};
export const lineText = (id, all = false, vars = {}) => !id ? ''
  : ((all && LINES[id].all) || LINES[id].full).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
export const lineTier = id => LINES[id]?.tier ?? 9;

// The role line shows this long at the start of a mission; an idle line after this long with nothing new.
export const ROLE_SECONDS = 20, IDLE_SECONDS = 45;
// "Low": oxygen and battery under this share of full.
const LOW = 0.3;
const ROVER = { scout: 'SCOUT', hauler: 'HAULER' };

// What one seat could be told now, in order, from its own view. mem: what this page remembers:
//   { found, guide, scout, hauler, missions, broken, brokeAt, quietSince, now, outside }
// broken/brokeAt: Mission Ops is told only that an alarm went and a fix came; the page keeps that.
function candidates(seat, s, mem) {
  const out = [], add = (id, vars) => out.push({ id, vars });
  const elapsed = CFG.roundSeconds - (s.timeLeft ?? CFG.roundSeconds);
  const first = elapsed < ROLE_SECONDS && !mem.missions;
  const o2Low = s.o2Max ? s.oxygen / s.o2Max < LOW : false;
  if (seat === 'sci') {
    const f = s.survey?.fault?.type, sv = s.survey;
    if (s.powered === false) add('sci.dark');
    else if (s.power && s.power.battery < LOW * 100 && s.power.solar < 100) add('sci.batt');
    if (f === 'suit') add('sci.suit');
    if (f === 'hull') add('sci.hull');
    if (f === 'wheel') { // the symbol stands at the broken rover
      const d = id => Math.hypot(sv.rovers[id].x - sv.fault.x, sv.rovers[id].z - sv.fault.z);
      add('sci.wheel', { ROVER: ROVER[d('scout') <= d('hauler') ? 'scout' : 'hauler'] });
    }
    if (f === 'dust' || (s.power && s.power.solar < 60)) add('sci.dust');
    if (s.leak && f !== 'hull' && f !== 'suit') add('sci.leak');
    if (first) add('sci.role'); else if (!mem.guide) add('sci.goal');
  }
  if (seat === 'ops') {
    if (s.powered === false) add('ops.dark');
    if (o2Low) add('ops.o2');
    if (mem.broken) {
      const full = (s.hands || []).filter(Boolean).length + (s.carry || []).length + (s.drill?.at === 'hand' ? 2 : 0) >= 2;
      if (full) add('ops.full');
      add(elapsed - mem.brokeAt < 15 ? 'ops.alarm' : 'ops.tool');
    }
    if (first) add('ops.role'); else if (!mem.found) add('ops.goal');
  }
  if (seat === 'tech') {
    const m = s.meteor;
    if (m && m.falling) add('tech.falling'); else if (m) add('tech.meteor', { N: Math.max(1, Math.ceil(m.eta)) });
    for (const id of ['scout', 'hauler']) if ((s.scene?.wheels?.[id] || 0) > 0) add('tech.wheel', { ROVER: ROVER[id] });
    if (first) add('tech.role');
    else if (!(mem.scout && mem.hauler)) add(mem.scout ? 'tech.keys.h' : 'tech.keys');
  }
  if (seat === 'astronaut') {
    const sc = s.scene || {}, outside = !!mem.outside;
    if (s.suit) add((s.hands || []).includes('patch') ? 'astro.patch' : 'astro.suit');
    if (outside && sc.meteor != null) add('astro.meteor');
    if (s.powered === false) add('astro.dark');
    if (outside && o2Low) add('astro.o2');
    if (sc.dust || sc.hull || Object.values(sc.wheels || {}).some(Boolean)) add('astro.alarm');
    if (elapsed < 30 && !outside && !mem.missions) add('astro.go');
  }
  return out;
}

// The line a seat's strip (or the cuff's tape) shows now: the most urgent one, or the idle line after a quiet
// spell. quiet: the GUIDE switch on QUIET, which keeps only danger and faults.
// Returns { id, text, tier } or null. seat 'all' is the 2-player seat: its three seats' lines in one strip.
export function pickLine(seat, s, mem, { quiet = false } = {}) {
  if (!s || s.phase !== 'run') return null;
  const all = seat === 'all';
  let list = all ? [...candidates('sci', s, mem), ...candidates('tech', s, mem), ...candidates('ops', s, mem)] : candidates(seat, s, mem);
  if (all) {
    // One strip for all of Mission Control: its own role line in place of the three seats', and where the
    // chart names the fault, that line rather than Mission Ops' plain alarm.
    const named = list.some(c => c.id.startsWith('sci.') && lineTier(c.id) === 2);
    const drop = new Set(['sci.role', 'tech.role', 'ops.role', 'sci.goal', ...(named ? ['ops.alarm', 'ops.tool'] : [])]);
    list = list.filter(c => !drop.has(c.id));
    const elapsed = CFG.roundSeconds - (s.timeLeft ?? CFG.roundSeconds);
    if (elapsed < ROLE_SECONDS && !mem.missions) list.push({ id: 'all.role' });
  }
  if (quiet) list = list.filter(c => lineTier(c.id) <= 2);
  let best = null;
  for (const c of list) if (!best || lineTier(c.id) < lineTier(best.id)) best = c;
  if (!best && !quiet && mem.now - mem.quietSince >= IDLE_SECONDS * 1000) {
    const idle = { ops: 'ops.idle', all: 'ops.idle', tech: 'tech.idle', astronaut: 'astro.idle' }[seat];
    if (idle) best = { id: idle };
  }
  return best ? { id: best.id, text: lineText(best.id, all, best.vars), tier: lineTier(best.id) } : null;
}
