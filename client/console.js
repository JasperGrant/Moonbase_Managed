// Mission control. One page serves all three consoles:
//   /ops | /tech | /sci | /control   ("control" is the 2-player mode, all three consoles)
// The server only sends each role what it is allowed to know, so the panels just draw what arrives.
// Everything here is a picture: gauges, a map, a camera, lamps. Nobody is told in words what broke.
// Each seat's mission screen is one desk on one canvas (client/console/desk.js and docs/design/mission-control-consoles.md).
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { CFG, MODES, ROLES, ADMIN_MODES } from '/shared/config.js';
import { drawFault, drawIcon } from '/shared/icons.js';
import { seatTaken, seatRefused, kicked } from '/seat.js';
import { createLobby } from '/lobby.js';
import { music } from '/music.js';
import { briefHTML, pickLine } from '/shared/guide.js';
import { PAL, FONT, fontsReady } from '/shared/palette.js';
import { createDesk } from '/console/desk.js';
import * as OPS from '/console/ops.js';
import * as TECH from '/console/tech.js';
import * as SCI from '/console/sci.js';
import * as ALL from '/console/all.js';

// /console.html?role=ops or the clean URL /ops; /control is the all-in-one seat.
const PATH_ROLE = { ops: 'ops', tech: 'tech', sci: 'sci', control: 'all', all: 'all' };
const asked = new URLSearchParams(location.search).get('role') || PATH_ROLE[location.pathname.split('/').pop()];
const role = ['ops', 'tech', 'sci', 'all'].includes(asked) ? asked : 'all';
const has = r => role === r || role === 'all';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;


const net = connect(role);
const radio = has('ops') ? new Radio(net) : null;
let state = null, lastEv = 0, rx = false, talking = false, shown = '', planKey = '', resultKey = '';
// This seat's copy of the results, from the moment the mission ended until this seat presses BACK TO
// LOBBY (or the next run starts). Someone else going back first does not pull it away.
let debrief = null;

$('roleName').textContent = ROLES[role];
document.title = `Moonbase: ${ROLES[role]}`;

// ---------- build the static parts once ----------
// The briefing card (client/shared/guide.js): who you are, what to do, your controls, who you talk to.
const briefs = briefHTML(role);
// The briefing and the mission plan open over the lobby, from a button in your own panel.
$('sheet').innerHTML = `<h3>Briefing</h3>${briefs}<p><button type="button" id="guideBtn" class="ghost"></button></p><h3>Your console</h3><canvas id="legend" class="legend"></canvas><div id="plan"></div><button class="big" data-close>Back to the lobby</button>`;
$('planSheet').addEventListener('click', e => { if (e.target === $('planSheet') || e.target.closest('[data-close]')) $('planSheet').hidden = true; });

// The lobby: in 2-player mode the briefing button sits in the Mission Ops panel only.
const firstMine = role === 'all' ? 'ops' : role;
const lobby = createLobby($('lobbyView'), {
  mine: role,
  onReady: on => { radio?.init(); net.send({ t: 'ready', on }); },
  // Mission Ops (or the one player at all three consoles) calls the astronaut GO.
  onReadyFor: has('ops') ? (who, on) => { radio?.init(); net.send({ t: 'ready', for: who, on }); } : null,
  extraEl: r => {
    if (r !== firstMine) return null;
    const b = document.createElement('button');
    b.className = 'lb-plan-btn'; b.type = 'button';
    b.textContent = has('ops') ? 'Briefing and mission' : 'Briefing';
    b.onclick = () => { $('planSheet').hidden = false; };
    return b;
  },
});

$('run').innerHTML = `<canvas id="cam" aria-hidden="true"></canvas><canvas id="desk" role="img" aria-label="${ROLES[role]} console"></canvas>
  <button id="ptt" class="sr" type="button">HOLD SPACE TO TALK TO THE ASTRONAUT</button><p id="said" class="sr" aria-live="polite"></p>`;

// ---------- the desk ----------
const tape = [];   // the mission tape: { at, kind } for each event this seat has seen this mission (D9)
let camApi = null; // the rover cameras (client/rovercam.js)
const AUX_KEY = 'moonbase.sci.aux';
let aux = 'air', labView = false;
try { aux = SCI.AUX.includes(localStorage.getItem(AUX_KEY)) ? localStorage.getItem(AUX_KEY) : 'air'; } catch { /* a per-viewer convenience */ }
const desk = createDesk({
  canvas: $('desk'), cam: $('cam'), seat: role, roundSeconds: CFG.roundSeconds, linkOpen: () => net.open,
  teletype: () => ctx.teletype(),
  layoutFor: (W, H) => ({ ops: OPS, tech: TECH, sci: SCI, all: ALL })[role].layout(W, H, ctx),
});
const ctx = {
  press, sfx, tape, get roundSeconds() { return state?.round || CFG.roundSeconds; }, shown: desk.D.shown,
  state: () => state,
  // The Scientist's call on a lab experiment (the Real Mission).
  labCall: (exp, answer) => { net.send({ t: 'lab', exp, answer }); sfx('click'); },
  // Throw a lab breaker (the Technician).
  breaker: (id, on) => { net.send({ t: 'breaker', id, on }); sfx('click'); },
  cam: () => camApi,
  aux: () => aux,
  labView: () => labView, // the 2-player desk: the lab in the right-hand column (L)
  canBreak: role === 'all', // the 2-player seat throws the lab's breakers itself
  talk: () => ({ state: talking ? 'tx' : rx ? 'rx' : 'idle', level: () => radio?.level?.() || 0 }),
  teletype: () => ({ ...(tt && tt.id ? { text: tt.text.slice(0, tt.shown), tier: tt.tier, fresh: performance.now() - tt.at < 1200, typing: tt.shown < tt.text.length } : {}), quiet: guideQuiet }),
  // A beacon for the astronaut (docs/SPEC-guidance.md): on a loose tool, or on a spot of ground; the same again puts it out.
  beaconTool(id) {
    if (!state || state.phase !== 'run') return;
    if (state.tools?.[id]?.at === 'loose') net.send(state.waypoint?.tool === id ? { t: 'waypoint', clear: true } : { t: 'waypoint', tool: id });
    sfx('click');
  },
  beaconAt(x, z, near) {
    if (!state || state.phase !== 'run') return;
    if (near) net.send({ t: 'waypoint', clear: true });
    else if (Math.hypot(x, z) <= CFG.bounds) net.send({ t: 'waypoint', x: +x.toFixed(1), z: +z.toFixed(1) });
    sfx('click');
  },
};

// ---------- network ----------
net.onState = s => { state = s; render(); };
net.onTaken = seatTaken;
net.onRefused = seatRefused; // a seat this game does not have, or no game chosen yet
net.onKicked = kicked;
net.onBinary = buf => radio?.receive(buf);
net.onMsg = m => { if (m.t === 'ptt' && radio) { rx = m.on; radio.rxMarker(m.on); paintPtt(); } };
setInterval(() => { $('link').textContent = net.open ? '' : 'NO LINK TO SERVER'; }, 500);

// ---------- render ----------
let testSlow = 1; // tests only (moonbase.drawEvery): redraw the desk this many times less often
const TOAST = { alarm: 'ALARM', solve: 'FIXED', hit: 'METEOR HIT', power: 'POWER BACK', gen: 'GENERATOR RUNNING', blackout: 'BASE DARK', found: 'SAMPLE BANKED', dud: 'DUD' };
// ---------- the teletype line (docs/SPEC-guidance.md, phases 1, 3 and 5) ----------
// What this seat has done, so its teaching lines retire; whether an alarm is open (Mission Ops is told only that
// an alarm went and that a fix came); when anything last happened, for the idle line. The line itself is drawn by
// client/console/desk.js: danger in lamp red, faults in amber, always in full.
const done = { found: false, guide: false, scout: false, hauler: false, missions: 0, broken: false, brokeAt: 0, quietSince: performance.now(), now: 0 };
let ttPhase = '', ttEv = 0;
const ttSeat = role; // 'all' in 2-player mode: one line for the whole of Mission Control
let tt = null; // { id, text, tier, shown, at }
// The GUIDE switch: ON, or QUIET (danger and faults only). G on the keyboard, or the button on the briefing sheet.
let guideQuiet = false;
try { guideQuiet = localStorage.getItem('moonbase-guide-' + role) === 'quiet'; } catch { /* no storage: ON */ }
const paintGuide = () => { const b = $('guideBtn'); if (b) b.textContent = guideQuiet ? 'GUIDE: QUIET (G)' : 'GUIDE: ON (G)'; };
function toggleGuide() {
  guideQuiet = !guideQuiet;
  try { localStorage.setItem('moonbase-guide-' + role, guideQuiet ? 'quiet' : 'on'); } catch { /* not kept */ }
  paintGuide(); sfx('click');
  if (state) teletype(state);
}
paintGuide();
$('guideBtn').addEventListener('click', toggleGuide);
addEventListener('keydown', e => { if (e.code !== 'KeyG' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return; e.preventDefault(); toggleGuide(); });
function briefOnce() {
  let seen = false;
  try { seen = sessionStorage.getItem('moonbase-brief-' + role) === '1'; sessionStorage.setItem('moonbase-brief-' + role, '1'); } catch { /* no storage: show it each time */ }
  if (!seen) $('planSheet').hidden = false;
}
function teletype(s) {
  const now = performance.now();
  if (ttPhase === 'run' && s.phase === 'results') done.missions++;
  if (s.phase !== 'run') { done.broken = false; done.quietSince = now; }
  ttPhase = s.phase;
  if (s.tally?.banked > 0) done.found = true;
  if (aux === 'guide') done.guide = true;
  // Events: an alarm opens (a meteor hit leaves the suit leaking), a fix closes. Anything new resets the idle clock.
  if (s.ev && s.ev.n !== ttEv) {
    ttEv = s.ev.n; done.quietSince = now;
    if (s.ev.kind === 'alarm' || s.ev.kind === 'hit') { done.broken = true; done.brokeAt = (state?.round || CFG.roundSeconds) - (s.timeLeft ?? CFG.roundSeconds); }
    if (s.ev.kind === 'solve') done.broken = false;
  }
  if (has('tech') && Object.values(s.rovers || {}).some(r => Math.abs(r.v || 0) > 0.2)) done.quietSince = now; // a rover on the move is not idle
  done.now = now;
  const line = pickLine(ttSeat, s, done, { quiet: guideQuiet });
  if (!line) { tt = null; return; }
  if (!tt || tt.id !== line.id) { // a new line types itself out
    tt = { id: line.id, text: line.text, tier: line.tier, shown: 0, at: now };
    if (line.tier < 6) done.quietSince = now;
  } else if (tt.text !== line.text) { tt.text = line.text; tt.shown = line.text.length; } // a countdown ticking: no clatter
}
// About 30 characters a second, with a soft clatter.
setInterval(() => {
  if (!tt || tt.shown >= tt.text.length) return;
  tt.shown = Math.min(tt.text.length, Math.floor((performance.now() - tt.at) / 33));
  if (tt.shown % 2 === 0 && tt.text[tt.shown - 1] !== ' ') tone(1500 + Math.random() * 500, 0.012, 0.012, 'square');
}, 33);

let legendReal = null; // the legend leaves out DUD while every sample is real
function render() {
  const s = state;
  if (!!s.real !== legendReal) { legendReal = !!s.real; drawLegend(); }
  $('clock').textContent = clock(s.timeLeft ?? CFG.roundSeconds);
  $('o2').textContent = Math.round(s.oxygen ?? CFG.o2Start);
  $('score').textContent = s.score;
  $('samples').textContent = s.tally ? `${s.tally.banked}/${s.tally.wanted}` : `0/${CFG.sample.manifest}`;
  const bar = $('o2bar');
  bar.style.width = `${Math.min(100, ((s.oxygen ?? CFG.o2Start) / (s.o2Max ?? CFG.o2Start)) * 100)}%`;
  bar.className = s.oxygen < 25 ? 'low' : '';
  $('crew').innerHTML = ['astronaut', 'ops', 'tech', 'sci'].map(r =>
    `<i class="${s.crew.includes(r) || (r !== 'astronaut' && s.crew.includes('all')) ? 'on' : ''}">${ROLES[r]}</i>`).join('');

  if (s.ev && s.ev.n !== lastEv) {
    lastEv = s.ev.n;
    const k = s.ev.kind, t = $('toast');
    if (TOAST[k]) { t.className = k; t.textContent = TOAST[k] + (s.ev.pts ? `  +${s.ev.pts}` : ''); $('said').textContent = TOAST[k]; }
    desk.event(k);
    if (s.phase === 'run') tape.push({ at: (state?.round || CFG.roundSeconds) - Math.max(0, s.timeLeft ?? CFG.roundSeconds), kind: k });
    if (k === 'end') sfx(s.result && s.result.won ? 'won' : 'lost');
    else if (k !== 'meteor') sfx(k);
  }

  if (s.phase === 'run') debrief = null;
  if (s.phase === 'results' && s.result && !debrief) debrief = { result: s.result, score: s.score, log: s.log || [] };
  const view = debrief ? 'results' : s.phase;
  if (view !== shown) {
    shown = view;
    music.mood(view === 'run' ? 'run' : 'calm');
    lobby.show(view === 'lobby');
    if (view === 'lobby') briefOnce();
    if (view !== 'lobby') $('planSheet').hidden = true;
    for (const id of ['run', 'results']) $(id).hidden = id !== view;
    if (view === 'lobby') { $('toast').textContent = ''; $('toast').className = ''; }
    document.body.classList.toggle('on-desk', view === 'run');
    if (view === 'run') { tape.length = 0; desk.resetEvents(); desk.fit(); }
  }
  lobby.update(s);
  teletype(s);
  if (s.phase === 'lobby') renderPlan(s);
  if (view === 'run' && testSlow === 1) renderRun(s); // under moonbase.drawEvery the frame loop alone redraws
  if (view === 'results') renderResults(s);
}

function renderPlan(s) {
  const key = s.mode;
  if (key === planKey) return;
  planKey = key;
  const canEdit = has('ops');
  $('plan').innerHTML = `<h3>Mission</h3>
    <div class="vehicles">${Object.entries(MODES).filter(([k]) => !ADMIN_MODES.includes(k) || k === s.mode).map(([k, name]) =>
      `<label class="pick ${k === s.mode ? 'sel' : ''} ${canEdit ? '' : 'off'}" data-mode="${k}"><b>${name}</b>${k === 'demo' ? '' : k === 'real' ? '<span>Set by the admin: fifteen minutes, and a lab of four experiments.</span>' : '<span>Random faults and meteor showers.</span>'}</label>`).join('')}</div>
    <p class="hint">${canEdit ? 'The mission starts when all four seats are ready.' : 'Mission Ops picks the mission. It starts when all four seats are ready.'}</p>`;
}
$('plan').addEventListener('click', e => {
  const el = e.target.closest('[data-mode]');
  if (el && has('ops')) net.send({ t: 'mode', mode: el.dataset.mode });
});

function renderRun(s) {
  SCI.sampleTraces(s);
  desk.draw(s);
}

// Needles swing, lamps blink and the scope's ground wipes in between state updates: redraw the desk at 30 frames
// a second while something is moving, and at 10 otherwise (enough for the lamps). Four consoles may share one
// laptop, so an idle desk must not cost a full frame rate.
let lastFrame = 0;
(function frame(t) {
  requestAnimationFrame(frame);
  const every = (performance.now() - desk.swinging < 200 ? 33 : 100) * testSlow;
  if (t - lastFrame < every || !state || shown !== 'run' || document.hidden) return;
  lastFrame = t; renderRun(state);
})(0);
fontsReady.then(() => { desk.fit(); drawLegend(); if (state) render(); });

// The debrief. Every seat has its own way back to the lobby, and a lamp that lights once the crew is
// there (someone else went first, or the debrief timed out), with the seconds left until it does.
function renderResults(s) {
  const d = debrief;
  const key = JSON.stringify(d.result) + d.score;
  if (key !== resultKey) {
    resultKey = key;
    const r = d.result;
    $('results').innerHTML = `<div class="panel">
    <div class="verdict ${r.won ? 'won' : 'lost'}">${r.won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div>
    <p>${esc(r.reason)}</p>
    <p><b>Score ${d.score}</b> &nbsp;|&nbsp; manifest ${r.wanted ?? 0} of ${r.manifest ?? CFG.sample.manifest} &nbsp;|&nbsp; extra samples ${(r.samples ?? 0) - (r.wanted ?? 0)} ${state?.real ? '' : ` &nbsp;|&nbsp; duds ${r.duds ?? 0}`} &nbsp;|&nbsp; fixed ${r.fixed} &nbsp;|&nbsp; meteor hits ${r.hits}${r.won ? ` &nbsp;|&nbsp; oxygen bonus +${r.bonus}` : ''}</p>
    <h2>What happened</h2>
    <ul class="log">${d.log.filter(l => l.kind !== 'start').map(l =>
      `<li class="${l.kind}"><span class="at">${clock(l.at)}</span><span class="sym">${l.type ? `<img alt="" src="${faultIcon(l.type)}">` : ''}</span><span>${esc(l.text)}</span><span class="d">${l.pts ? '+' + l.pts : ''}${l.o2 ? l.o2 + ' O2' : ''}</span></li>`).join('')}</ul>
    <div class="debrief-out">
      <button class="big" data-lobby type="button">Back to lobby</button>
      <span class="engraved">Your seat returns. The crew can keep reading.</span>
      <span class="crew-lamp" id="crewLamp"><i></i>Crew in lobby</span>
      <b class="nixie" id="debriefLeft"></b>
    </div>
    ${has('ops') ? '<p class="hint"><button data-again type="button">Start over</button> Everyone goes back to the start, to choose 2 or 4 players again.</p>' : ''}
  </div>`;
  }
  const inLobby = s.phase !== 'results';
  $('crewLamp').classList.toggle('on', inLobby);
  $('debriefLeft').hidden = inLobby;
  if (!inLobby) $('debriefLeft').textContent = String(s.debriefLeft ?? '').padStart(2, '0');
}
function backToLobby() {
  if (!debrief) return;
  if (state && state.phase === 'results') net.send({ t: 'lobby' });
  radio?.sfx('relay');
  debrief = null; resultKey = '';
  if (state) render();
}
$('results').addEventListener('click', e => {
  if (e.target.closest('[data-lobby]')) backToLobby();
  else if (e.target.closest('[data-again]')) { debrief = null; resultKey = ''; net.send({ t: 'reset' }); if (state) render(); }
});
addEventListener('keydown', e => { if (e.key === 'Enter' && debrief && !e.repeat && !e.target.closest?.('button, a, input')) { e.preventDefault(); backToLobby(); } });

// ---------- sounds for every seat ----------
// Mission Ops has the radio's sound effects. The other seats get a few small tones of their own, once the
// page has been clicked (browsers need a gesture before they play sound).
let actx = null;
addEventListener('pointerdown', () => { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no sound */ } } });
function tone(f, dur, vol, type = 'sine', at = 0) {
  if (!actx) return;
  const t = actx.currentTime + at, o = actx.createOscillator(), gn = actx.createGain();
  o.type = type; o.frequency.value = f; gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(gn).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function sfx(k) {
  if (radio) return radio.sfx(k);
  if (k === 'ping') { tone(1400, 0.06, 0.05); tone(1400, 0.25, 0.025, 'sine', 0.07); }
  if (k === 'found') { tone(660, 0.14, 0.07); tone(990, 0.3, 0.07, 'sine', 0.15); }
  if (k === 'dud') tone(150, 0.45, 0.07, 'square');
  if (k === 'alarm') { tone(880, 0.15, 0.05, 'square'); tone(660, 0.15, 0.05, 'square', 0.18); }
  if (k === 'solve') { tone(660, 0.1, 0.05); tone(880, 0.1, 0.05, 'sine', 0.1); tone(1320, 0.2, 0.05, 'sine', 0.2); }
  if (k === 'click') tone(900, 0.04, 0.04, 'square');
}
// A fault's symbol as a small picture, for the results log.
const iconCache = {};
function faultIcon(type) {
  if (!iconCache[type]) { const c = document.createElement('canvas'); c.width = c.height = 36; drawFault(c.getContext('2d'), type, 18, 18, 30, PAL.ink); iconCache[type] = c.toDataURL(); }
  return iconCache[type];
}

// ---------- the keys: every seat's keyset, from the keyboard or a keycap pressed with the pointer ----------
// press(code, down, tap): tap is a click on a switch or a keycap, which lights the key for a moment.
const DRIVE_KEYS = new Set([...TECH.DRIVE.scout, ...TECH.DRIVE.hauler]);
const driveOf = code => TECH.CAM_IDS.find(id => TECH.DRIVE[id].includes(code));
const held = new Set();
function sendDrive(id) {
  const [u, l, d, r] = TECH.DRIVE[id];
  net.send({ t: 'rover', id, throttle: (held.has(u) ? 1 : 0) - (held.has(d) ? 1 : 0), steer: (held.has(l) ? 1 : 0) - (held.has(r) ? 1 : 0) });
}
function press(code, down, tap = false) {
  if (tap) { desk.key(code, true); setTimeout(() => desk.key(code, false), 160); } else desk.key(code, down);
  if (code === 'Space' && has('ops')) { talk(down); return true; }
  if (has('tech') && DRIVE_KEYS.has(code)) {
    if (down === held.has(code)) return true;
    if (down) done[driveOf(code)] = true;
    down ? held.add(code) : held.delete(code); sendDrive(driveOf(code)); return true;
  }
  if (!down) return false;
  if (has('tech') && (code === 'KeyC' || code === 'Slash')) { camApi?.toggle(code === 'KeyC' ? 'scout' : 'hauler'); sfx('click'); return true; }
  if (role === 'all' && code === 'KeyL' && state?.lab) { labView = !labView; sfx('click'); return true; }
  if (has('sci') && (code === 'KeyR' || code === 'KeyE')) { const k = code === 'KeyR' ? 'range' : 'centre'; SCI.chart[k] = (SCI.chart[k] + 1) % 3; sfx('click'); return true; }
  if (role === 'sci' && /^Digit[1234]$/.test(code) && (code !== 'Digit4' || state?.lab)) { aux = SCI.AUX[+code.slice(5) - 1]; try { localStorage.setItem(AUX_KEY, aux); } catch {} sfx('click'); return true; }
  return false;
}
const typing = e => e.target.closest?.('input, textarea');
addEventListener('keydown', e => {
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space' && has('ops')) { e.preventDefault(); if (!e.repeat) press('Space', true); return; }
  if (shown !== 'run' || e.repeat && !DRIVE_KEYS.has(e.code)) return;
  if (press(e.code, true)) e.preventDefault();
});
addEventListener('keyup', e => {
  if (e.code === 'Space' && has('ops')) { e.preventDefault(); press('Space', false); return; }
  if (DRIVE_KEYS.has(e.code) || desk.D.keysDown.has(e.code)) press(e.code, false);
});
addEventListener('blur', () => {
  for (const c of [...held]) press(c, false);
  if (talking) press('Space', false);
});

if (has('tech')) import('/rovercam.js').then(m => { camApi = m.startRoverCam($('cam'), () => (shown === 'run' ? state : null)); camApi.setRects(() => desk.glass()); }).catch(err => {
  console.warn(err);
  $('cam').hidden = true; // the glass shows static
});

// ---------- the briefing's legend: each picture this seat uses, and its word ----------
const LEGEND = {
  frame: [['clock', 'TIME LEFT'], ['o2', 'SUIT OXYGEN'], ['rock', 'SAMPLES BANKED'], ['score', 'SCORE'], ['bell', 'ALARM'], ['fixed', 'FIXED'], ['meteor', 'METEOR HIT'], ['dark', 'BASE DARK'], ['bolt', 'POWER BACK'], ['banked', 'SAMPLE BANKED'], ['dud', 'DUD'], ['link', 'NO LINK']],
  ops: [['glove', 'HANDS'], ['lens', 'TOOL BOARD'], ['hauler', 'HAULER TRAY'], ['port', 'SAMPLE PORT'], ['mic', 'TALK']],
  tech: [['scout', 'SCOUT'], ['hauler', 'HAULER'], ['home', 'WAY HOME'], ['speed', 'SPEED'], ['wheel', 'WHEEL BROKEN'], ['rider', 'ASTRONAUT ABOARD'], ['eye', 'FROM THE ROVER'], ['chase', 'FROM BEHIND'], ['cover', 'TAKE COVER']],
  sci: [['lens', 'RANGE'], ['scope', 'CENTRE'], ['card', 'FIELD GUIDE'], ['battery', 'POWER'], ['o2', 'AIR'], ['helmet', 'ASTRONAUT']],
};
function drawLegend() {
  const cv = $('legend'); if (!cv) return;
  const rows = [...LEGEND.frame, ...['ops', 'tech', 'sci'].filter(has).flatMap(r => LEGEND[r])].filter((r, i, a) => a.findIndex(x => x[1] === r[1]) === i && !(r[0] === 'dud' && state?.real));
  const cols = 3, rh = 34, cw = 230, k = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cols * cw * k; cv.height = Math.ceil(rows.length / cols) * rh * k;
  cv.style.width = cols * cw + 'px'; cv.style.maxWidth = '100%';
  const g = cv.getContext('2d'); g.scale(k, k);
  g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, cols * cw, cv.height / k);
  rows.forEach(([ic, word], i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * rh + rh / 2;
    drawIcon(g, ic, x + 22, y, 22, PAL.ink);
    g.font = `10px ${FONT.label}`; g.fillStyle = PAL.inkDim; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(word, x + 44, y + 1);
  });
}
drawLegend();

// ---------- Mission Ops: radio ----------
function paintPtt() {
  const b = $('ptt'); if (!b) return;
  b.textContent = talking ? 'TRANSMITTING...' : rx ? 'ASTRONAUT IS TRANSMITTING' : 'HOLD SPACE TO TALK TO THE ASTRONAUT';
}
let want = false;
async function enableRadio() {
  const rb = $('radioBtn');
  const mic = await radio.init();
  rb.textContent = mic ? 'Radio on' : 'Radio on, no microphone';
  rb.disabled = true;
  return mic;
}
async function talk(on) {
  if (!radio) return;
  want = on;
  if (on && !radio.ready) await enableRadio();
  if (want !== on) return; // key was released while the mic prompt was open
  if (on && !radio.micOk) { $('toast').className = 'mistake'; $('toast').textContent = 'NO MICROPHONE: open this page on localhost or over HTTPS and allow the mic.'; desk.event('link'); return; }
  talking = on && radio.micOk; radio.setTalking(talking); paintPtt();
}
if (has('ops')) {
  const rb = $('radioBtn');
  rb.hidden = false;
  rb.onclick = enableRadio;
  const b = $('ptt');
  b.addEventListener('pointerdown', () => talk(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (talking) talk(false); });
}

// For debugging from the browser console, and for the tests (desk.shown says what each instrument last drew).
window.moonbase = { state: () => state, radio, net, role, debrief: () => debrief, chart: SCI.chart, desk: desk.D,
  // Tests only: draw the rover cameras one frame in n, so a software-WebGL test machine keeps up with the mission.
  // The desk redraws n times less often too (the state itself still arrives and is read at once).
  drawEvery: n => { testSlow = Math.max(1, n | 0); return import('/rovercam.js').then(m => { m.camDraw.every = testSlow; }); } };
