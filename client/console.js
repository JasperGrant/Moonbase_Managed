// Mission control. One page serves all three consoles:
//   /ops | /tech | /sci | /control   ("control" is the 2-player mode, all three consoles)
// The server only sends each role what it is allowed to know, so the panels just draw what arrives.
// Everything here is a picture: gauges, a map, a camera, lamps. Nobody is told in words what broke.
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { CFG, TOOLS, PLACES, MODES, ROLES, SAMPLES, FAULTS } from '/shared/config.js';
import { drawTool, drawFault, drawGlyph, drawSample } from '/shared/icons.js';
import { FIELD, CRATERS, BOULDERS, LANDMARKS } from '/shared/field.js';
import { seatTaken, seatRefused, kicked } from '/seat.js';
import { createLobby } from '/lobby.js';
import { music } from '/music.js';
import { PAL, FONT, SAMPLE_COL, nixie, jewel, fontsReady } from '/shared/palette.js';

// /console.html?role=ops or the clean URL /ops; /control is the all-in-one seat.
const PATH_ROLE = { ops: 'ops', tech: 'tech', sci: 'sci', control: 'all', all: 'all' };
const asked = new URLSearchParams(location.search).get('role') || PATH_ROLE[location.pathname.split('/').pop()];
const role = ['ops', 'tech', 'sci', 'all'].includes(asked) ? asked : 'all';
const has = r => role === r || role === 'all';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
// Colours and type: the 1960s palette (docs/DESIGN.md). The lobby keeps its own look.
const C = { bg: PAL.consoleDeep, line: PAL.rule, ink: PAL.ink, dim: PAL.inkDim, green: PAL.green, amber: PAL.amber, red: PAL.red, blue: PAL.blue };

const BRIEF = {
  ops: '<b>You are the voice, the kit and the tally.</b> The only voice the astronaut hears: hold SPACE to talk. The astronaut holds one thing in each hand (a tool or a rock sample): your HANDS panel shows which. The mission is to bring rock samples home. Your TOOL LOG says roughly where each tool lies; your SAMPLE LOG says what is in hand, in the tray and banked, and where the core DRILL is: a rock only comes out of the ground through it. When they are suited up, you call them GO.',
  tech: '<b>You have the EYES and the WHEELS.</b> Two rovers, two cameras, both at once: the Scout on W A S D, the Hauler on the arrows. C and / switch each camera between first and third person. The astronaut rides the Hauler. You have no map: the Scientist does.',
  sci: '<b>You have the CHART and the FIELD GUIDE.</b> Only you know what a sample looks like. The chart sharpens wherever a rover drives. POWER and AIR say how bad a fault is.',
};

const net = connect(role);
const radio = has('ops') ? new Radio(net) : null;
let state = null, lastEv = 0, rx = false, talking = false, shown = '', planKey = '', resultKey = '';
// This seat's copy of the results, from the moment the mission ended until this seat presses BACK TO
// LOBBY (or the next run starts). Someone else going back first does not pull it away.
let debrief = null;

$('roleName').textContent = ROLES[role];
document.title = `Moonbase: ${ROLES[role]}`;

// ---------- build the static parts once ----------
const briefs = ['ops', 'tech', 'sci'].filter(has).map(r => `<p class="brief">${role === 'all' ? `<b>${ROLES[r]}.</b> ` : ''}${BRIEF[r]}</p>`).join('');
// The briefing and the mission plan open over the lobby, from a button in your own panel.
$('sheet').innerHTML = `<h3>Briefing</h3>${briefs}<div id="plan"></div><button class="big" data-close>Back to the lobby</button>`;
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

const tabs = (id, names) => `<div class="tabs" data-tabs="${id}">${names.map((n, i) => `<button type="button" class="${i ? '' : 'on'}" data-tab="${i}">${n}</button>`).join('')}</div>`;
$('run').classList.toggle('all', role === 'all');
$('run').innerHTML = [
  has('ops') && `<div class="panel ops"><h3>Mission Ops</h3>
    <button id="ptt">HOLD SPACE TO TALK TO THE ASTRONAUT</button>
    <h2>Hands</h2><canvas id="handsCv" class="pic" width="560" height="150"></canvas>
    <h2>Tool log</h2><canvas id="toolCv" class="pic" width="560" height="330"></canvas>
    <h2>Sample log</h2><canvas id="sampleCv" class="pic" width="560" height="200"></canvas></div>`,
  has('tech') && `<div class="panel tech"><h3>Technician</h3>
    <div class="camwrap"><canvas id="cam"></canvas><canvas id="camHud"></canvas></div>
    <canvas id="techCv" class="pic" width="920" height="210"></canvas>
    <p class="hint" id="camHint"></p></div>`,
  has('sci') && `<div class="panel sci"><h3>Scientist</h3>
    ${tabs('sci', ['SURVEY', 'GUIDE', 'POWER', 'AIR'])}
    <div data-pane="sci0"><canvas id="surveyCv" class="pic" width="560" height="660"></canvas></div>
    <div data-pane="sci1" hidden><canvas id="guideCv" class="pic" width="560" height="620"></canvas></div>
    <div data-pane="sci2" hidden><canvas id="powerCv" class="pic" width="560" height="560"></canvas></div>
    <div data-pane="sci3" hidden><canvas id="airCv" class="pic" width="560" height="560"></canvas></div></div>`,
].filter(Boolean).join('');

// Tabs: you have to go and look.
const tabOn = { sci: 0 };
$('run').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  const id = b.parentElement.dataset.tabs, n = Number(b.dataset.tab);
  tabOn[id] = n;
  for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
  for (const pane of $('run').querySelectorAll(`[data-pane^="${id}"]`)) pane.hidden = pane.dataset.pane !== id + n;
  if (state) render();
});

// ---------- network ----------
net.onState = s => { state = s; render(); };
net.onTaken = seatTaken;
net.onRefused = seatRefused; // a seat this game does not have, or no game chosen yet
net.onKicked = kicked;
net.onBinary = buf => radio?.receive(buf);
net.onMsg = m => { if (m.t === 'ptt' && radio) { rx = m.on; radio.rxMarker(m.on); paintPtt(); } };
setInterval(() => { $('link').textContent = net.open ? '' : 'NO LINK TO SERVER'; }, 500);

// ---------- render ----------
const TOAST = { alarm: 'ALARM', solve: 'FIXED', hit: 'METEOR HIT', power: 'POWER BACK', gen: 'GENERATOR RUNNING', blackout: 'BASE DARK', found: 'SAMPLE BANKED', dud: 'DUD' };
function render() {
  const s = state;
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
    if (TOAST[k]) { t.className = k; t.textContent = TOAST[k] + (s.ev.pts ? `  +${s.ev.pts}` : ''); }
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
    if (view !== 'lobby') $('planSheet').hidden = true;
    for (const id of ['run', 'results']) $(id).hidden = id !== view;
    if (view === 'lobby') { $('toast').textContent = ''; $('toast').className = ''; }
  }
  lobby.update(s);
  if (s.phase === 'lobby') renderPlan(s);
  if (view === 'run') renderRun(s);
  if (view === 'results') renderResults(s);
}

function renderPlan(s) {
  const key = s.mode;
  if (key === planKey) return;
  planKey = key;
  const canEdit = has('ops');
  $('plan').innerHTML = `<h3>Mission</h3>
    <div class="vehicles">${Object.entries(MODES).map(([k, name]) =>
      `<label class="pick ${k === s.mode ? 'sel' : ''} ${canEdit ? '' : 'off'}" data-mode="${k}"><b>${name}</b><span>${k === 'demo' ? 'The same five things break in the same order. For judges.' : 'Random faults and meteor showers.'}</span></label>`).join('')}</div>
    <p class="hint">${canEdit ? 'The mission starts when all four seats are ready.' : 'Mission Ops picks the mission. It starts when all four seats are ready.'}</p>`;
}
$('plan').addEventListener('click', e => {
  const el = e.target.closest('[data-mode]');
  if (el && has('ops')) net.send({ t: 'mode', mode: el.dataset.mode });
});

function renderRun(s) {
  if (has('ops')) { drawKit(s); drawSampleLog(s); }
  if (has('tech')) { drawTech(s); drawCamHud(s); }
  if (has('sci')) [drawSurvey, drawGuide, drawPower, drawAir][tabOn.sci](s);
}

// Needles swing, lamps blink and the radar sweeps between state updates: redraw the instruments at 30
// frames a second while a needle is swinging, and at 10 otherwise (enough for the lamps and the sweep).
// Four consoles may share one laptop, so an idle panel must not cost a full frame rate.
let lastFrame = 0, swinging = 0; // swinging: when a needle last moved
(function frame(t) {
  requestAnimationFrame(frame);
  const every = performance.now() - swinging < 200 ? 33 : 100;
  if (t - lastFrame < every || !state || state.phase !== 'run' || document.hidden) return;
  lastFrame = t; renderRun(state);
})(0);
fontsReady.then(() => { if (state) render(); });

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
    <p><b>Score ${d.score}</b> &nbsp;|&nbsp; manifest ${r.wanted ?? 0} of ${r.manifest ?? CFG.sample.manifest} &nbsp;|&nbsp; extra samples ${(r.samples ?? 0) - (r.wanted ?? 0)} &nbsp;|&nbsp; duds ${r.duds ?? 0} &nbsp;|&nbsp; fixed ${r.fixed} &nbsp;|&nbsp; meteor hits ${r.hits}${r.won ? ` &nbsp;|&nbsp; oxygen bonus +${r.bonus}` : ''}</p>
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

// ---------- drawing helpers ----------
const blinkOn = () => Math.floor(Date.now() / 333) % 2 === 0; // 1.5 Hz: an alarm lamp, not a strobe
function label(g, text, x, y, size = 14, color = C.dim, align = 'center') { // engraved label
  g.font = `${Math.round(size * 0.72)}px ${FONT.label}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
}
function typed(g, text, x, y, size = 14, color = C.ink, align = 'center') { // teletype text and numbers that are not counters
  g.font = `bold ${size}px ${FONT.type}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
}
function plate(g, text, x, y, w, size = 12) { // a cream label plate, engraved in dark ink
  g.fillStyle = PAL.dial; g.fillRect(x - w / 2, y - size, w, size * 2);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(x - w / 2 + 0.5, y - size + 0.5, w - 1, size * 2 - 1);
  label(g, text, x, y + 1, size, PAL.inkDial);
}
function panelBg(g, W, H) { // the console face behind every instrument
  g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(143,138,120,0.08)'; g.lineWidth = 1;
  for (let y = 0.5; y < H; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } // brushed
}
// Needles ease toward their value and overshoot a little, like a real meter movement.
const needles = new Map();
function needle(key, target) {
  const n = needles.get(key) || { v: target, vel: 0, t: performance.now() };
  const now = performance.now(), dt = Math.min(0.1, (now - n.t) / 1000); n.t = now;
  n.vel += ((target - n.v) * 60 - n.vel * 9) * dt; n.v += n.vel * dt;
  if (Math.abs(n.vel) > 0.05 || Math.abs(target - n.v) > 0.05) swinging = now;
  needles.set(key, n); return n.v;
}
// A meter: cream face in a bezel, ticks and numerals, the bad range painted red, a dark needle on a brass hub.
// Out of range, the red jewel lamp beside it lights; the value is on a Nixie counter below.
function dial(g, x, y, r, value, max, name, { redBelow = 0, redAbove = Infinity, unit = '' } = {}) {
  const ang = v => Math.PI * 1.15 + Math.max(0, Math.min(1, v / max)) * Math.PI * 0.7;
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r * 1.12, Math.PI, 2 * Math.PI); g.lineTo(x + r * 1.12, y + r * 0.22); g.lineTo(x - r * 1.12, y + r * 0.22); g.fill();
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(x, y, r * 1.03, Math.PI, 2 * Math.PI); g.lineTo(x + r * 1.03, y + r * 0.14); g.lineTo(x - r * 1.03, y + r * 0.14); g.fill();
  g.lineWidth = r * 0.1; g.lineCap = 'butt'; g.strokeStyle = 'rgba(196,82,58,0.7)';
  if (redBelow > 0) { g.beginPath(); g.arc(x, y, r * 0.86, ang(0), ang(redBelow)); g.stroke(); }
  if (redAbove < max) { g.beginPath(); g.arc(x, y, r * 0.86, ang(redAbove), ang(max)); g.stroke(); }
  g.strokeStyle = PAL.inkDial; g.fillStyle = PAL.inkDial;
  for (let i = 0; i <= 20; i++) {
    const a = ang(max * i / 20), big = i % 5 === 0, r0 = r * (big ? 0.72 : 0.8);
    g.lineWidth = big ? 2.5 : 1.2; g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke();
    if (big) { g.font = `bold ${Math.round(r * 0.13)}px ${FONT.type}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.round(max * i / 20 * 10) / 10), x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); }
  }
  label(g, unit === '%' ? 'PERCENT' : unit === 'x' ? 'RATE' : '', x, y - r * 0.32, r * 0.13, PAL.inkDim);
  const bad = value < redBelow || value > redAbove, a = ang(needle(name, value));
  g.strokeStyle = PAL.inkDial; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - Math.cos(a) * r * 0.12, y - Math.sin(a) * r * 0.12); g.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9); g.stroke();
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(x, y, r * 0.07, 0, 7); g.fill();
  nixie(g, unit === 'x' ? value.toFixed(1) : String(Math.round(value)).padStart(3, ' '), x - r * 0.12, y + r * 0.44, r * 0.24);
  jewel(g, x + r * 0.62, y + r * 0.44, r * 0.09, 'red', bad && blinkOn());
  plate(g, name, x, y + r * 0.8, r * 1.4, r * 0.11);
}

// ---------- Mission Ops: the tool log ----------
// One row per tool: its silhouette, a jewel lamp (green in the astronaut's hand, amber lying somewhere,
// dark used up), and where it lies, engraved. Ops knows roughly where; the astronaut has to look.
function drawKit(s) {
  drawHands(s);
  const cv = $('toolCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  panelBg(g, W, H);
  const ids = Object.keys(TOOLS), row = (H - 20) / ids.length;
  ids.forEach((t, i) => {
    const y = 10 + row * i + row / 2, info = s.tools?.[t], at = info?.at || 'gone';
    if (i) { g.strokeStyle = PAL.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(16, y - row / 2); g.lineTo(W - 16, y - row / 2); g.stroke(); }
    g.fillStyle = PAL.bakelite; g.fillRect(18, y - row / 2 + 6, row - 12, row - 12);
    g.globalAlpha = at === 'gone' ? 0.25 : 1;
    drawTool(g, t, 18 + (row - 12) / 2, y, row - 22, C.ink);
    g.globalAlpha = 1;
    jewel(g, row + 34, y, 8, at === 'hand' ? 'green' : 'amber', at !== 'gone');
    label(g, TOOLS[t].name.toUpperCase(), row + 56, y - 11, 13, C.dim, 'left');
    const hand = (s.hands || []).indexOf(t), where = at === 'hand' ? (hand === 0 ? 'LEFT HAND' : hand === 1 ? 'RIGHT HAND' : 'IN HAND') : at === 'gone' ? (t === 'tire' ? 'FITTED' : 'USED') : info.area || '';
    label(g, where, row + 56, y + 11, 17, at === 'gone' ? C.dim : C.ink, 'left');
  });
}

// The astronaut's two hands, left and right: a recessed bay each with the tool in it, a lamp under each lit
// while it holds one. (A decoy fills a hand on the astronaut's page but the server does not hear of it.)
function drawHands(s) {
  const cv = $('handsCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  panelBg(g, W, H);
  const u = 96, gap = 60, x0 = (W - (2 * u + gap)) / 2, y0 = 12;
  (s.hands || [null, null]).forEach((t, i) => {
    const x = x0 + i * (u + gap);
    g.fillStyle = PAL.bakelite; g.fillRect(x, y0, u, u);
    g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x + 1, y0 + 1, u - 2, u - 2);
    if (t) drawTool(g, t, x + u / 2, y0 + u / 2, u - 26, C.ink);
    jewel(g, x + u / 2 - 14, y0 + u + 20, 6, 'green', !!t);
    label(g, i ? 'R' : 'L', x + u / 2 + 6, y0 + u + 21, 13, C.dim, 'left');
  });
}

// ---------- sounds for every seat ----------
// Mission Ops has the radio's sound effects. The other seats get a few small tones of their own, once the
// page has been clicked (browsers need a gesture before they play sound).
let actx = null;
addEventListener('pointerdown', () => { if (!actx && !radio) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no sound */ } } });
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

const phos = a => `rgba(156,194,122,${a})`;
// Compass bearing of a heading, degrees clockwise from north (north is -z).
const bearing = ry => ((Math.atan2(Math.sin(ry), -Math.cos(ry)) * 180 / Math.PI) + 360) % 360;
// Where the base is from a rover, as an angle off its nose (0 ahead, positive to the right), and how far.
function homeFrom(r) {
  const dx = -r.x, dz = -r.z, cs = Math.cos(r.ry), sn = Math.sin(r.ry);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  return { rel: Math.atan2(-lx, lz), dist: Math.hypot(dx, dz) };
}

// ---------- Technician: the two rovers' instruments ----------
// Under each camera: a HOME dial (the needle points to the base, relative to the rover's nose) with the range
// on Nixie tubes, a WHEEL lamp, and on the Hauler a RIDER lamp. Between them, the meteor warning.
function homeDial(g, x, y, r, rel) {
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r * 1.14, 0, 7); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(x, y, r * 1.06, 0, 7); g.fill();
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.strokeStyle = PAL.inkDial;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; g.lineWidth = big ? 3 : 1.5; g.beginPath(); g.moveTo(x + Math.sin(a) * r * (big ? 0.72 : 0.82), y - Math.cos(a) * r * (big ? 0.72 : 0.82)); g.lineTo(x + Math.sin(a) * r * 0.94, y - Math.cos(a) * r * 0.94); g.stroke(); }
  // a small rover outline at the hub, nose up
  g.fillStyle = PAL.inkDim; g.fillRect(x - 5, y - 8, 10, 16);
  const a = needle('home' + x, rel);
  g.strokeStyle = PAL.red; g.fillStyle = PAL.red; g.lineWidth = 3; g.lineCap = 'round';
  const tx = x + Math.sin(a) * r * 0.86, ty = y - Math.cos(a) * r * 0.86;
  g.beginPath(); g.moveTo(x - Math.sin(a) * r * 0.2, y + Math.cos(a) * r * 0.2); g.lineTo(tx, ty); g.stroke();
  g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx - Math.sin(a - 0.4) * 10, ty + Math.cos(a - 0.4) * 10); g.lineTo(tx - Math.sin(a + 0.4) * 10, ty + Math.cos(a + 0.4) * 10); g.closePath(); g.fill();
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
}
const DRIVE = { scout: 'W A S D', hauler: 'ARROWS' };
function drawTech(s) {
  const cv = $('techCv'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  panelBg(g, W, H);
  ['scout', 'hauler'].forEach((id, n) => {
    const r = s.rovers?.[id]; if (!r) return;
    const x0 = n ? 540 : 20;
    plate(g, id === 'scout' ? 'SCOUT' : 'HAULER', x0 + 180, 20, 150, 11);
    const h = homeFrom(r);
    homeDial(g, x0 + 70, 110, 56, h.rel);
    plate(g, 'HOME', x0 + 70, 188, 70, 9);
    nixie(g, String(Math.round(h.dist)).padStart(3, ' '), x0 + 200, 96, 34);
    label(g, 'METRES', x0 + 200, 132, 11, C.dim);
    const broken = (s.scene?.wheels?.[id] || 0) > 0;
    jewel(g, x0 + 310, 76, 12, 'red', broken && blinkOn()); label(g, 'WHEEL', x0 + 310, 102, 10, C.dim);
    if (id === 'hauler') { jewel(g, x0 + 310, 140, 12, 'green', !!s.rider); label(g, 'RIDER', x0 + 310, 166, 10, C.dim); }
    plate(g, DRIVE[id], x0 + 200, 180, 120, 10);
  });
  // the meteor warning, from the base's own radar
  g.strokeStyle = PAL.rule; g.lineWidth = 2; g.beginPath(); g.moveTo(410, 14); g.lineTo(410, H - 14); g.moveTo(510, 14); g.lineTo(510, H - 14); g.stroke();
  const m = s.meteor;
  jewel(g, 460, 64, 15, 'red', !!m && blinkOn());
  label(g, 'METEOR', 460, 96, 10, C.dim);
  nixie(g, m ? (m.falling ? '00' : String(Math.ceil(m.eta)).padStart(2, '0')) : '  ', 460, 140, 32, { lit: !!m });
}
let camApi = null; // the rover cameras (client/rovercam.js): their views, switched with C and /
const VIEW_KEYS = { KeyC: 'scout', Slash: 'hauler' }; // under the hand that drives each rover
// Over each camera: a compass tape, a reticle with clock marks ("rock at two o'clock"), and the rover's name.
function drawCamHud(s) {
  const cv = $('camHud'), cam = $('cam'); if (!cv || !cam || cam.hidden) return;
  const w = cam.clientWidth, h = cam.clientHeight; if (!w || !h) return;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  const half = Math.floor(w / 2);
  ['scout', 'hauler'].forEach((id, n) => {
    const r = s.rovers?.[id]; if (!r) return;
    const x0 = n * half, cw = n ? w - half : half, cx = x0 + cw / 2, cy = h * 0.55;
    g.save(); g.beginPath(); g.rect(x0, 0, cw, h); g.clip();
    // the tape
    g.fillStyle = 'rgba(28,42,28,0.6)'; g.fillRect(x0, 0, cw, 26);
    const b = bearing(r.ry), ppd = cw / 100;
    g.strokeStyle = phos(0.8); g.fillStyle = phos(0.9); g.lineWidth = 1.5;
    for (let d = Math.ceil((b - 50) / 15) * 15; d <= b + 50; d += 15) {
      const x = cx + (d - b) * ppd, dd = ((d % 360) + 360) % 360, card = dd % 90 === 0;
      g.beginPath(); g.moveTo(x, 26); g.lineTo(x, card ? 14 : 19); g.stroke();
      if (card || dd % 45 === 0) { g.font = `${card ? 11 : 9}px ${FONT.label}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(card ? 'NESW'[dd / 90] : String(dd), x, 8); }
    }
    g.beginPath(); g.moveTo(cx - 6, 30); g.lineTo(cx + 6, 30); g.lineTo(cx, 24); g.closePath(); g.fill();
    // the reticle
    const rr = Math.min(cw, h) * 0.16;
    g.strokeStyle = phos(0.45); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; g.beginPath(); g.moveTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); g.lineTo(cx + Math.sin(a) * (rr + (big ? 10 : 5)), cy - Math.cos(a) * (rr + (big ? 10 : 5))); g.stroke(); }
    g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke();
    // the name, and a stuck rover's warning
    g.font = `11px ${FONT.label}`; g.textAlign = 'left'; g.fillStyle = phos(0.85); g.fillText(id === 'scout' ? 'SCOUT' : 'HAULER', x0 + 10, h - 12);
    // which view this screen is in, and the key that changes it
    const key = id === 'scout' ? 'C' : '/';
    g.textAlign = 'center'; g.fillStyle = phos(0.7); g.fillText(`${camApi?.view(id) === 'third' ? '3RD' : '1ST'} PERSON  [${key}]`, cx, h - 12);
    if ((s.scene?.wheels?.[id] || 0) > 0 && blinkOn()) { g.fillStyle = PAL.amber; g.textAlign = 'right'; g.fillText('WHEEL', x0 + cw - 10, h - 12); }
    g.restore();
  });
  g.fillStyle = PAL.bezel; g.fillRect(half - 2, 0, 4, h); // the bezel between the two screens
}

// ---------- Mission Ops: the sample log ----------
// What is in the astronaut's hands, which cups on the Hauler are full (not what is in them), and the tally.
function drawSampleLog(s) {
  const cv = $('sampleCv'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  panelBg(g, W, H);
  const carry = s.carry || [], tray = s.tray || [], t = s.tally || { banked: 0, wanted: CFG.sample.manifest };
  label(g, 'HANDS', 80, 26, 12, C.dim);
  jewel(g, 56, 74, 14, 'amber', carry.length > 0); jewel(g, 104, 74, 14, 'amber', carry.length > 1);
  label(g, 'TRAY', 250, 26, 12, C.dim);
  for (let i = 0; i < CFG.sample.tray; i++) jewel(g, 190 + i * 40, 74, 13, 'green', !!tray[i]);
  label(g, 'BANKED', 450, 26, 12, C.dim);
  nixie(g, String(t.banked), 410, 78, 42);
  label(g, 'OF', 450, 80, 11, C.dim);
  nixie(g, String(t.wanted), 492, 78, 42);
  for (let i = 0; i < t.wanted; i++) jewel(g, 450 - (t.wanted - 1) * 14 + i * 28, 124, 8, 'green', i < t.banked);
  // The core drill: where it is, and while it works, its countdown on five Nixie tubes like the ones on top of it.
  const d = s.drill || { at: 'rover', left: 0 };
  g.strokeStyle = PAL.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(16, 146); g.lineTo(W - 16, 146); g.stroke();
  drawTool(g, 'drill', 46, 174, 40, C.ink);
  const working = d.at === 'site' && d.left > 0, ready = d.at === 'site' && !working && d.cored;
  jewel(g, 92, 174, 8, working ? 'amber' : 'green', d.at === 'hand' || ready || (working && Math.floor(performance.now() / 500) % 2 === 0)); // blinks at 1 Hz while it works
  label(g, 'DRILL', 110, 163, 12, C.dim, 'left');
  const where = { rover: 'ON THE HAULER', hand: 'IN BOTH HANDS', ground: 'STANDING DOWN', site: working ? 'DRILLING' : ready ? 'CORE READY' : 'ON A ROCK' }[d.at] || '';
  label(g, where, 110, 184, 15, C.ink, 'left');
  for (let i = 0; i < 5; i++) nixie(g, String(5 - i), 400 + i * 30, 174, 34, { lit: working && 5 - i <= Math.ceil(d.left) });
}

// ---------- Scientist: the survey chart ----------
// The round phosphor scope the radar used to be. Unexplored ground is the orbital heat map: 30 m blocks in four
// steps of brightness, with raster lines. Explored ground (wherever a rover has driven) clears to dark glass
// and is drawn fine: crater rims, boulders, landmarks, samples, loose tools, the rovers, the astronaut, and the
// one active fault's symbol. Two rotary switches: RANGE and CENTRE.
const RANGES = [30, 60, 120], CENTRES = ['BASE', 'SCOUT', 'HAULER'];
const KNOB = { range: { x: 80, y: 604 }, centre: { x: 210, y: 604 } };
const chart = { range: 2, centre: 0, hex: null, seen: null, first: new Float64Array(FIELD.n * FIELD.n), known: null, bloom: new Map() };
$('surveyCv')?.addEventListener('click', e => {
  const cv = e.currentTarget, b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * cv.width / b.width, y = (e.clientY - b.top) * cv.height / b.height;
  for (const [k, p] of Object.entries(KNOB)) if (Math.hypot(x - p.x, y - p.y) < 42) { chart[k] = (chart[k] + 1) % 3; sfx('click'); if (state) render(); }
});
function knob(g, x, y, stops, at, name) { // a Bakelite rotary switch with engraved stops
  const angs = [-0.75, 0, 0.75].map(a => a - Math.PI / 2);
  stops.forEach((t, i) => { const a = angs[i]; label(g, t, x + Math.cos(a) * 46, y + Math.sin(a) * 40 + 2, 11, i === at ? C.ink : C.dim); });
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, 27, 0, 7); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.strokeStyle = 'rgba(143,138,120,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke(); }
  g.strokeStyle = PAL.dial; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(angs[at]) * 19, y + Math.sin(angs[at]) * 19); g.stroke();
  plate(g, name, x, y + 40, 96, 9);
}
function decodeSeen(hex) {
  const out = new Uint8Array(FIELD.n * FIELD.n);
  for (let i = 0; i < hex.length; i++) { const v = parseInt(hex[i], 16); for (let b = 0; b < 4; b++) if (v >> b & 1) out[i * 4 + b] = 1; }
  return out;
}
const LEGEND = ['dust', 'wheel', 'hull', 'suit'], LEGEND_NAME = { dust: 'SOLAR', wheel: 'WHEEL', hull: 'HULL', suit: 'SUIT' };
function drawSurvey(s) {
  const sv = s.survey, cv = $('surveyCv'); if (!sv || !cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, CX = W / 2, CY = 280, R = 262, now = performance.now();
  panelBg(g, W, H);
  // What has been seen, and when each cell was first seen (it wipes in, like the tube being written).
  if (chart.hex !== sv.seen) {
    const bits = decodeSeen(sv.seen);
    for (let k = 0; k < bits.length; k++) if (bits[k] && !(chart.seen && chart.seen[k])) chart.first[k] = chart.seen ? now : now - 1000;
    chart.seen = bits; chart.hex = sv.seen;
  }
  // A sample turning up in new ground blooms, and the console pings.
  const ids = new Set(sv.samples.map(x => x.id));
  if (chart.known) for (const id of ids) if (!chart.known.has(id)) { chart.bloom.set(id, now); sfx('ping'); }
  chart.known = ids;
  const rng = RANGES[chart.range], cid = CENTRES[chart.centre].toLowerCase();
  const c = cid === 'base' ? { x: 0, z: 0 } : sv.rovers[cid] || { x: 0, z: 0 };
  const k = R / rng, X = x => CX + (x - c.x) * k, Y = z => CY + (z - c.z) * k;
  const inView = (x, z, pad = 0) => Math.hypot(x - c.x, z - c.z) < rng * 1.05 + pad;
  // bezel and glass
  g.strokeStyle = PAL.bezel; g.lineWidth = 10; g.beginPath(); g.arc(CX, CY, R + 5, 0, 7); g.stroke();
  g.save(); g.beginPath(); g.arc(CX, CY, R, 0, 7); g.clip();
  const glass = g.createRadialGradient(CX, CY, 0, CX, CY, R);
  glass.addColorStop(0, '#152015'); glass.addColorStop(1, PAL.glass);
  g.fillStyle = glass; g.fillRect(0, 0, W, W);
  // the heat map, coarse
  const nb = FIELD.blocks, B = FIELD.block, RF = FIELD.radius, n = FIELD.n, cell = FIELD.cell;
  for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) {
    const lv = +sv.heat[j * nb + i]; if (!lv) continue;
    g.fillStyle = phos(0.06 + lv * 0.11); g.fillRect(X(-RF + i * B), Y(-RF + j * B), B * k, B * k);
  }
  g.fillStyle = 'rgba(12,18,12,0.4)'; for (let y = 0; y < W; y += 3) g.fillRect(0, y, W, 1); // raster lines
  // explored cells clear to dark glass
  const seen = chart.seen;
  const cellIn = (i, j) => { const x = -RF + (i + 0.5) * cell, z = -RF + (j + 0.5) * cell; return inView(x, z, cell); };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const kk = j * n + i; if (!seen[kk] || !cellIn(i, j)) continue;
    const a = Math.min(1, (now - chart.first[kk]) / 330); if (a < 1) swinging = now;
    g.fillStyle = `rgba(16,24,16,${0.97 * a})`; g.fillRect(X(-RF + i * cell) - 0.5, Y(-RF + j * cell) - 0.5, cell * k + 1, cell * k + 1);
  }
  // the edge of what has been seen
  g.strokeStyle = phos(0.4); g.lineWidth = 1; g.beginPath();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (!seen[j * n + i] || !cellIn(i, j)) continue;
    const x0 = X(-RF + i * cell), y0 = Y(-RF + j * cell), w = cell * k;
    if (i === 0 || !seen[j * n + i - 1]) { g.moveTo(x0, y0); g.lineTo(x0, y0 + w); }
    if (i === n - 1 || !seen[j * n + i + 1]) { g.moveTo(x0 + w, y0); g.lineTo(x0 + w, y0 + w); }
    if (j === 0 || !seen[(j - 1) * n + i]) { g.moveTo(x0, y0); g.lineTo(x0 + w, y0); }
    if (j === n - 1 || !seen[(j + 1) * n + i]) { g.moveTo(x0, y0 + w); g.lineTo(x0 + w, y0 + w); }
  }
  g.stroke();
  // fine detail, in explored ground only
  g.save(); g.beginPath();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (seen[j * n + i] && cellIn(i, j)) g.rect(X(-RF + i * cell), Y(-RF + j * cell), cell * k, cell * k);
  g.clip();
  g.strokeStyle = phos(0.12); g.lineWidth = 1;
  for (let rr = 30; rr <= RF; rr += 30) { g.beginPath(); g.arc(X(0), Y(0), rr * k, 0, 7); g.stroke(); }
  g.strokeStyle = phos(0.28);
  for (const cr of CRATERS) if (cr.R >= 3 && inView(cr.x, cr.z, cr.R)) { g.beginPath(); g.arc(X(cr.x), Y(cr.z), cr.R * k, 0, 7); g.stroke(); }
  g.fillStyle = phos(0.65);
  for (const b of BOULDERS) if (inView(b.x, b.z)) { g.beginPath(); g.arc(X(b.x), Y(b.z), Math.max(1.6, b.r * k), 0, 7); g.fill(); }
  for (const l of LANDMARKS) if (inView(l.x, l.z, 10)) { g.strokeStyle = phos(0.8); g.strokeRect(X(l.x) - 3, Y(l.z) - 3, 6, 6); label(g, l.name, X(l.x), Y(l.z) - 11, 9, phos(0.85)); }
  for (const sm of sv.samples) { if (!inView(sm.x, sm.z)) continue; const grd = g.createRadialGradient(X(sm.x), Y(sm.z), 0, X(sm.x), Y(sm.z), Math.max(8, cell * k)); grd.addColorStop(0, phos(0.35)); grd.addColorStop(1, phos(0)); g.fillStyle = grd; g.fillRect(X(sm.x) - 40, Y(sm.z) - 40, 80, 80); }
  g.restore();
  // the base, always: the habitat, its modules, its four airlocks
  g.strokeStyle = phos(0.7); g.lineWidth = 1.5;
  g.beginPath(); g.arc(X(0), Y(0), CFG.habRadius * k, 0, 7); g.stroke();
  g.strokeRect(X(2.2), Y(-1.45), 5.4 * k, 2.9 * k); g.strokeRect(X(-4.6), Y(-1.35), 2.4 * k, 2.7 * k);
  if (rng <= 60) for (const p of PLACES.panels) g.strokeRect(X(p.x) - 2, Y(p.z) - 1.1 * k, 4, 2.2 * k);
  label(g, 'BASE', X(0), Y(0) + CFG.habRadius * k + 10, 9, phos(0.85));
  // marks over everything
  for (const sm of sv.samples) {
    if (!inView(sm.x, sm.z)) continue;
    const b = chart.bloom.get(sm.id), u = b ? Math.min(1, (now - b) / 900) : 1;
    if (u < 1) { swinging = now; g.strokeStyle = `rgba(224,163,71,${1 - u})`; g.lineWidth = 2; g.beginPath(); g.arc(X(sm.x), Y(sm.z), 6 + u * 24, 0, 7); g.stroke(); }
    g.shadowColor = C.amber; g.shadowBlur = 5; drawGlyph(g, SAMPLES[sm.kind].glyph, X(sm.x), Y(sm.z), 12, C.amber); g.shadowBlur = 0;
  }
  for (const t of sv.tools || []) if (inView(t.x, t.z)) { g.fillStyle = C.amber; g.beginPath(); g.arc(X(t.x), Y(t.z), 2.5, 0, 7); g.fill(); }
  const wedge = (x, z, ry, colour, name) => {
    g.save(); g.translate(X(x), Y(z));
    g.fillStyle = colour; g.font = `9px ${FONT.label}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 0, 17);
    g.rotate(Math.atan2(Math.sin(ry), -Math.cos(ry)));
    g.shadowColor = colour; g.shadowBlur = 5;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  };
  for (const id of ['scout', 'hauler']) { const r = sv.rovers[id]; if (r) wedge(r.x, r.z, r.ry, C.amber, id === 'scout' ? 'S' : 'H'); }
  if (sv.astro && !sv.astro.inside && s.crew.includes('astronaut')) wedge(sv.astro.x, sv.astro.z, sv.astro.ry, C.blue, 'EVA');
  if (sv.fault && blinkOn()) { g.shadowColor = C.red; g.shadowBlur = 6; drawFault(g, sv.fault.type, X(sv.fault.x) + (sv.fault.type === 'wheel' || sv.fault.type === 'suit' ? 16 : 0), Y(sv.fault.z) - (sv.fault.type === 'wheel' || sv.fault.type === 'suit' ? 16 : 0), 24, C.red); g.shadowBlur = 0; }
  g.restore();
  label(g, 'N', CX, CY - R + 14, 12, phos(0.8));
  // explored, on Nixie tubes
  nixie(g, String(sv.pct).padStart(3, ' '), W - 62, 28, 22);
  label(g, 'SURVEYED %', W - 62, 54, 8, C.dim);
  // the switches and the legend
  knob(g, KNOB.range.x, KNOB.range.y, RANGES.map(String), chart.range, 'RANGE M');
  knob(g, KNOB.centre.x, KNOB.centre.y, CENTRES.map(x => x === 'HAULER' ? 'HAUL' : x), chart.centre, 'CENTRE');
  LEGEND.forEach((t, i) => {
    const x = 316 + i * 52, on = sv.fault && sv.fault.type === t;
    drawFault(g, t, x, 600, 30, on && blinkOn() ? C.red : C.dim);
    label(g, LEGEND_NAME[t], x, 634, 8, on ? C.red : C.dim);
  });
}

// ---------- Scientist: the field guide ----------
// A cream card for each kind of sample the mission wants: a picture of it, three pictograms (its size against a
// glove, where it lies, its tell-tale), its lookalike struck through, and a lamp for each piece wanted, lit as it
// is banked. Pictures and one-word plates only: the Scientist finds their own words. The ASSAY strip below
// says what the last thing into the port was.
// Pictures on the cards sit on a grey "photo" of the regolith, so a pale rock reads against the cream card.
function photo(g, x, y, w, h) { g.fillStyle = PAL.regolith; g.fillRect(x - w / 2, y - h / 2, w, h); g.strokeStyle = 'rgba(36,34,30,0.45)'; g.lineWidth = 1.5; g.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1); }
function pictoFrame(g, x, y) { photo(g, x, y, 68, 68); }
function pictoSize(g, x, y, look) { // a glove beside the rock, to scale
  g.save(); g.strokeStyle = PAL.inkDial; g.fillStyle = 'rgba(36,34,30,0.12)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x - 30, y - 6, 22, 26, 5); g.fill(); g.stroke();
  for (let i = 0; i < 4; i++) { g.beginPath(); g.roundRect(x - 30 + i * 5.5, y - 22 + Math.abs(i - 1.5) * 2, 4.5, 18, 2); g.stroke(); }
  g.restore();
  drawSample(g, look, x + 14, y + 6, 30, SAMPLE_COL, PAL.foilGold);
}
function pictoWhere(g, x, y, where, look) {
  g.save(); g.strokeStyle = PAL.inkDial; g.lineWidth = 2.5;
  if (where === 'rim' || where === 'shadow') {
    g.beginPath(); g.moveTo(x - 32, y - 2); g.lineTo(x - 22, y - 6); g.quadraticCurveTo(x, y + 34, x + 22, y - 6); g.lineTo(x + 32, y - 2); g.stroke();
    if (where === 'shadow') { g.fillStyle = 'rgba(36,34,30,0.55)'; g.beginPath(); g.moveTo(x - 22, y - 6); g.quadraticCurveTo(x - 8, y + 22, x + 4, y + 15); g.lineTo(x - 22, y - 6); g.fill(); }
  } else { g.beginPath(); g.moveTo(x - 32, y + 12); g.lineTo(x + 32, y + 12); g.stroke(); }
  if (where === 'patch') { g.fillStyle = SAMPLE_COL.glass; g.globalAlpha = 0.6; g.beginPath(); g.ellipse(x, y + 12, 26, 6, 0, 0, 7); g.fill(); g.globalAlpha = 1; }
  g.restore();
  const at = { rim: [x - 22, y - 12], shadow: [x - 4, y + 6], flat: [x, y + 4], patch: [x, y + 4] }[where];
  drawSample(g, look, at[0], at[1], 16, SAMPLE_COL, PAL.foilGold);
}
function pictoTell(g, x, y, look) { // a magnifier on the rock's surface
  g.save(); g.beginPath(); g.arc(x - 4, y - 4, 22, 0, 7); g.clip();
  drawSample(g, look, x - 4, y - 4, 110, SAMPLE_COL, PAL.foilGold);
  g.restore();
  g.strokeStyle = PAL.inkDial; g.lineWidth = 3; g.beginPath(); g.arc(x - 4, y - 4, 22, 0, 7); g.stroke();
  g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x + 12, y + 12); g.lineTo(x + 26, y + 26); g.stroke();
}
function drawGuide(s) {
  const cv = $('guideCv'); if (!cv) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  panelBg(g, W, H);
  const manifest = s.manifest || [], kinds = [...new Set(manifest.map(m => m.kind))];
  const cardH = 146;
  kinds.forEach((kind, n) => {
    const y = 12 + n * (cardH + 10), T = SAMPLES[kind];
    g.fillStyle = PAL.dial; g.fillRect(14, y, W - 28, cardH);
    g.strokeStyle = PAL.inkDim; g.lineWidth = 1; g.strokeRect(20.5, y + 6.5, W - 41, cardH - 13);
    drawGlyph(g, T.glyph, 38, y + 26, 16, PAL.inkDial);
    photo(g, 92, y + 66, 112, 100);
    drawSample(g, T.look, 92, y + 66, 92, SAMPLE_COL, PAL.foilGold);
    for (const [fx, x] of [[pictoSize, 196], [pictoWhere, 276], [pictoTell, 356]]) { pictoFrame(g, x, y + 62); fx(g, x, y + 62, fx === pictoWhere ? T.where : T.look, T.look); }
    label(g, 'SIZE', 196, y + 112, 9, PAL.inkDial); label(g, 'WHERE', 276, y + 112, 9, PAL.inkDial); label(g, 'TELL', 356, y + 112, 9, PAL.inkDial);
    photo(g, 470, y + 61, 74, 68);
    drawSample(g, T.dud, 470, y + 60, 58, SAMPLE_COL, PAL.foilGold);
    g.strokeStyle = PAL.red; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(440, y + 32); g.lineTo(500, y + 90); g.moveTo(500, y + 32); g.lineTo(440, y + 90); g.stroke();
    label(g, 'NOT THIS', 470, y + 112, 9, PAL.inkDial);
    manifest.filter(m => m.kind === kind).forEach((m, i) => jewel(g, 40 + i * 26, y + cardH - 20, 8, 'green', m.got));
  });
  // the assay strip
  const ay = H - 74;
  g.fillStyle = PAL.consoleDeep; g.fillRect(14, ay, W - 28, 60);
  g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(15, ay + 1, W - 30, 58);
  plate(g, 'ASSAY', 70, ay + 30, 90, 10);
  const a = s.assay;
  if (a) { drawSample(g, a.look, 170, ay + 30, 46, SAMPLE_COL, PAL.foilGold); if (a.kind !== 'dud') drawGlyph(g, SAMPLES[a.kind].glyph, 220, ay + 30, 18, C.amber); }
  jewel(g, 330, ay + 30, 13, 'green', !!a && a.kind !== 'dud'); label(g, 'FOUND', 330, ay + 52, 8, C.dim);
  jewel(g, 420, ay + 30, 13, 'amber', !!a && a.kind === 'dud'); label(g, 'DUD', 420, ay + 52, 8, C.dim);
}

// ---------- Scientist: POWER ----------
function drawPower(s) {
  const cv = $('powerCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height, p = s.power;
  panelBg(g, W, H);
  // The battery: a fuel-gauge dial, laid out like the AIR console's oxygen, with a LOW BATT lamp.
  const low = p.battery < 30;
  dial(g, W * 0.5, 140, 110, p.battery, 100, 'BATTERY', { redBelow: 30, unit: '%' });
  jewel(g, W * 0.5 - 160, 160, 9, 'red', low && blinkOn()); label(g, 'LOW', W * 0.5 - 160, 182, 10, C.dim);
  // Power coming in from the sun. Below 100 the panels are dusty and the battery is running down.
  dial(g, W * 0.3, 410, 100, p.solar, 100, 'SOLAR IN', { redBelow: 60, unit: '%' });
  // Which way the battery is going: two lamps, one lit.
  const charging = p.solar >= 100, lx = W * 0.74;
  jewel(g, lx, 345, 26, 'green', charging);
  plate(g, 'CHARGE', lx, 392, 110, 12);
  jewel(g, lx, 445, 26, 'amber', !charging && blinkOn());
  plate(g, 'DRAIN', lx, 492, 110, 12);
}

// ---------- Scientist: AIR ----------
function drawAir(s) {
  const cv = $('airCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  panelBg(g, W, H);
  // Oxygen left, and how fast it is going.
  dial(g, W * 0.5, 140, 110, s.oxygen, s.o2Max, 'OXYGEN', { redBelow: 25 });
  dial(g, W * 0.3, 410, 100, s.drain, CFG.leakMultiplier * 2 - 0.5, 'DRAIN', { redAbove: 1.6, unit: 'x' });
  // The leak lamp. It does not say where.
  const on = s.leak, lx = W * 0.74, ly = 380;
  jewel(g, lx, ly, 60, 'red', on && blinkOn());
  g.strokeStyle = on ? 'rgba(36,34,30,0.8)' : 'rgba(143,138,120,0.35)'; g.lineWidth = 5; g.lineCap = 'round'; // air hissing out of a hole, cast in the lens
  g.beginPath(); g.arc(lx - 26, ly, 8, 0, 7); g.stroke();
  for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(lx - 10 + Math.cos(a) * 6, ly + Math.sin(a) * 6); g.lineTo(lx - 10 + Math.cos(a) * 38, ly + Math.sin(a) * 38); g.stroke(); }
  plate(g, 'LEAK', lx, ly + 102, 110, 13);
}


// ---------- Technician: two rovers at once ----------
// W A S D drive the Scout, the arrows drive the Hauler. A rover with no key held stops by itself.
if (has('tech')) {
  const keys = new Set();
  const BIND = { scout: ['KeyW', 'KeyS', 'KeyA', 'KeyD'], hauler: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] };
  const ALL = new Set(Object.values(BIND).flat());
  const which = code => Object.keys(BIND).find(id => BIND[id].includes(code));
  const sendDrive = id => { const [u, d, l, r] = BIND[id]; net.send({ t: 'rover', id, throttle: (keys.has(u) ? 1 : 0) - (keys.has(d) ? 1 : 0), steer: (keys.has(l) ? 1 : 0) - (keys.has(r) ? 1 : 0) }); };
  addEventListener('keydown', e => { if (!ALL.has(e.code) || e.target.closest?.('input, textarea')) return; e.preventDefault(); if (!keys.has(e.code)) { keys.add(e.code); sendDrive(which(e.code)); } });
  addEventListener('keyup', e => { if (keys.delete(e.code)) sendDrive(which(e.code)); });
  addEventListener('blur', () => { if (keys.size) { keys.clear(); sendDrive('scout'); sendDrive('hauler'); } });
  // The camera view: C for the Scout, / for the Hauler (under the hand that drives each), or a click on that
  // camera's screen. The wheel over a screen moves its chase camera nearer or further.
  const half = e => { const r = $('cam').getBoundingClientRect(); return e.clientX - r.left < r.width / 2 ? 'scout' : 'hauler'; };
  addEventListener('keydown', e => { const id = VIEW_KEYS[e.code]; if (!id || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return; e.preventDefault(); camApi?.toggle(id); });
  $('cam').addEventListener('click', e => camApi?.toggle(half(e)));
  $('cam').addEventListener('wheel', e => { if (!camApi) return; const id = half(e); if (camApi.view(id) !== 'third') return; e.preventDefault(); camApi.zoom(id, e.deltaY); }, { passive: false });
  $('camHint').textContent = 'C / click left screen: Scout view. / or click right screen: Hauler view. Wheel: chase distance.';
  import('/rovercam.js').then(m => { camApi = m.startRoverCam($('cam'), () => state); }).catch(err => {
    console.warn(err);
    $('cam').hidden = true;
    $('camHint').textContent = 'ROVER CAMERAS UNAVAILABLE';
  });
}


// ---------- Mission Ops: radio ----------
function paintPtt() {
  const b = $('ptt'); if (!b) return;
  b.className = talking ? 'tx' : rx ? 'rx' : '';
  b.textContent = talking ? 'TRANSMITTING...' : rx ? 'ASTRONAUT IS TRANSMITTING' : 'HOLD SPACE TO TALK TO THE ASTRONAUT';
}
if (has('ops')) {
  const rb = $('radioBtn');
  rb.hidden = false;
  const enable = async () => {
    const mic = await radio.init();
    rb.textContent = mic ? 'Radio on' : 'Radio on, no microphone';
    rb.disabled = true;
    return mic;
  };
  rb.onclick = enable;
  let want = false;
  const talk = async on => {
    want = on;
    if (on && !radio.ready) await enable();
    if (want !== on) return; // key was released while the mic prompt was open
    if (on && !radio.micOk) { $('toast').className = 'mistake'; $('toast').textContent = 'NO MICROPHONE: open this page on localhost or over HTTPS and allow the mic.'; return; }
    talking = on && radio.micOk; radio.setTalking(talking); paintPtt();
  };
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) talk(true); } });
  addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); talk(false); } });
  const b = $('ptt');
  b.addEventListener('pointerdown', () => talk(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (talking) talk(false); });
}

// For debugging from the browser console.
window.moonbase = { state: () => state, radio, net, role, debrief: () => debrief, chart };
