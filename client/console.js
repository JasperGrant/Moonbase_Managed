// Mission control. One page serves all three consoles:
//   /ops | /tech | /sci | /control   ("control" is the 2-player mode, all three consoles)
// The server only sends each role what it is allowed to know, so the panels just draw what arrives.
// Everything here is a picture: gauges, a map, a camera, lamps. Nobody is told in words what broke.
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { CFG, TOOLS, PLACES, MODES, ROLES, SOCKET_SHAPES } from '/shared/config.js';
import { beltWeight } from '/shared/rules.js';
import { drawTool, drawShape } from '/shared/icons.js';
import { seatTaken, kicked } from '/seat.js';
import { createLobby } from '/lobby.js';
import { music } from '/music.js';
import { PAL, CABLE, FONT, nixie, jewel, fontsReady } from '/shared/palette.js';

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
  ops: '<b>You are the only voice the astronaut hears.</b> Hold SPACE to talk; it takes 1.3 s to reach the Moon. You see what is on their belt and what is left in the locker. Decide what they carry and what gets fixed first.',
  tech: '<b>You know WHERE and WHEN.</b> The radar map and the rover camera. The radar is on the rover. Arrow keys drive.',
  sci: '<b>You know WHAT is wrong.</b> Two screens of gauges: POWER and AIR. Read them and work out the cause.',
};

const net = connect(role);
const radio = has('ops') ? new Radio(net) : null;
let state = null, lastEv = 0, rx = false, talking = false, shown = '', planKey = '', resultKey = '';

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
$('run').innerHTML = [
  has('ops') && `<div class="panel"><h3>Mission Ops</h3>
    <button id="ptt">HOLD SPACE TO TALK TO THE ASTRONAUT</button>
    <h2>Belt</h2><canvas id="beltCv" class="pic" width="560" height="170"></canvas>
    <h2>Locker</h2><canvas id="lockerCv" class="pic" width="560" height="150"></canvas></div>`,
  has('tech') && `<div class="panel"><h3>Technician</h3>
    ${tabs('tech', ['RADAR', 'ROVER CAM'])}
    <div data-pane="tech0"><canvas id="map" width="460" height="460"></canvas></div>
    <div data-pane="tech1" hidden><canvas id="cam"></canvas><p class="hint" id="camHint">Arrow keys drive.</p></div></div>`,
  has('sci') && `<div class="panel"><h3>Scientist</h3>
    ${tabs('sci', ['POWER', 'AIR'])}
    <div data-pane="sci0"><canvas id="powerCv" class="pic" width="560" height="560"></canvas></div>
    <div data-pane="sci1" hidden><canvas id="airCv" class="pic" width="560" height="560"></canvas></div></div>`,
].filter(Boolean).join('') + '<div id="static" hidden><canvas id="staticCv" width="240" height="135"></canvas></div>';

// Tabs: you have to go and look.
const tabOn = { tech: 0, sci: 0 };
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
net.onKicked = kicked;
net.onBinary = buf => radio?.receive(buf);
net.onMsg = m => { if (m.t === 'ptt' && radio) { rx = m.on; radio.rxMarker(m.on); paintPtt(); } };
setInterval(() => { $('link').textContent = net.open ? '' : 'NO LINK TO SERVER'; }, 500);

// ---------- render ----------
const TOAST = { alarm: 'ALARM', solve: 'FIXED', mistake: 'SPARK', hit: 'METEOR HIT', power: 'POWER BACK', gen: 'GENERATOR RUNNING' };
function render() {
  const s = state;
  const dark = s.phase === 'run' && !s.powered; // blackout: static, and nothing else
  $('clock').textContent = dark ? '-:--' : clock(s.timeLeft ?? CFG.roundSeconds);
  $('o2').textContent = dark ? '-' : Math.round(s.oxygen ?? CFG.o2Start);
  $('score').textContent = s.score;
  const bar = $('o2bar');
  bar.style.width = dark ? '0%' : `${Math.min(100, ((s.oxygen ?? CFG.o2Start) / (s.o2Max ?? CFG.o2Start)) * 100)}%`;
  bar.style.visibility = dark ? 'hidden' : '';
  bar.className = s.oxygen < 25 ? 'low' : '';
  $('crew').innerHTML = ['astronaut', 'ops', 'tech', 'sci'].map(r =>
    `<i class="${s.crew.includes(r) || (r !== 'astronaut' && s.crew.includes('all')) ? 'on' : ''}">${ROLES[r]}</i>`).join('');

  if (s.ev && s.ev.n !== lastEv) {
    lastEv = s.ev.n;
    const k = s.ev.kind, t = $('toast');
    if (TOAST[k]) { t.className = k; t.textContent = TOAST[k] + (s.ev.pts ? `  +${s.ev.pts}` : ''); }
    if (k !== 'meteor') radio?.sfx(k);
  }

  if (s.phase !== shown) {
    shown = s.phase;
    music.mood(s.phase === 'run' ? 'run' : 'calm');
    lobby.show(s.phase === 'lobby');
    if (s.phase !== 'lobby') $('planSheet').hidden = true;
    for (const id of ['run', 'results']) $(id).hidden = id !== s.phase;
    if (s.phase === 'lobby') { $('toast').textContent = ''; $('toast').className = ''; }
  }
  lobby.update(s);
  $('static').hidden = !dark;
  if (dark) { $('toast').textContent = ''; if (talking) { talking = false; radio.setTalking(false); paintPtt(); } }
  if (s.phase === 'lobby') renderPlan(s);
  if (s.phase === 'run' && !dark) renderRun(s);
  if (s.phase === 'results') renderResults(s);
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
  if (has('ops')) drawKit(s);
  if (has('tech') && tabOn.tech === 0) drawMap(s);
  if (has('sci')) { if (tabOn.sci === 0) drawPower(s); else drawAir(s); }
}

// Needles swing, lamps blink and the radar sweeps between state updates: redraw the instruments at 30
// frames a second while a needle is swinging, and at 10 otherwise (enough for the lamps and the sweep).
// Four consoles may share one laptop, so an idle panel must not cost a full frame rate.
let lastFrame = 0, swinging = 0; // swinging: when a needle last moved
(function frame(t) {
  requestAnimationFrame(frame);
  const every = performance.now() - swinging < 200 ? 33 : 100;
  if (t - lastFrame < every || !state || state.phase !== 'run' || !state.powered || document.hidden) return;
  lastFrame = t; renderRun(state);
})(0);
fontsReady.then(() => { if (state) render(); });

function renderResults(s) {
  const key = JSON.stringify(s.result) + s.score;
  if (key === resultKey || !s.result) return;
  resultKey = key;
  const r = s.result;
  $('results').innerHTML = `<div class="panel">
    <div class="verdict ${r.won ? 'won' : 'lost'}">${r.won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div>
    <p>${esc(r.reason)}</p>
    <p><b>Score ${s.score}</b> &nbsp;|&nbsp; fixed ${r.fixed} &nbsp;|&nbsp; blackouts ${r.blackouts} &nbsp;|&nbsp; meteor hits ${r.hits} &nbsp;|&nbsp; wrong plugs ${r.mistakes}${r.won ? ` &nbsp;|&nbsp; oxygen bonus +${r.bonus}` : ''}</p>
    <h2>What happened</h2>
    <ul class="log">${(s.log || []).filter(l => l.kind !== 'start').map(l =>
      `<li class="${l.kind}"><span class="at">${clock(l.at)}</span><span>${esc(l.text)}</span><span class="d">${l.pts ? '+' + l.pts : ''}${l.o2 ? l.o2 + ' O2' : ''}</span></li>`).join('')}</ul>
    ${has('ops') ? '<button class="big" data-again>Fly again</button> <span class="hint">Everyone goes back to the lobby and readies up again.</span>' : '<p class="hint">Mission Ops can send the crew back to the lobby for another run.</p>'}
  </div>`;
}
$('results').addEventListener('click', e => { if (e.target.closest('[data-again]')) { resultKey = ''; net.send({ t: 'reset' }); } });

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

// ---------- Mission Ops: the belt and the locker ----------
function drawKit(s) {
  {
    const cv = $('beltCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    panelBg(g, W, H);
    const used = beltWeight(s.belt), u = 100, gap = 12, x0 = (W - (CFG.beltCapacity * (u + gap) - gap)) / 2, y0 = 14;
    for (let i = 0; i < CFG.beltCapacity; i++) { // a recessed bay per weight unit, a lamp under each
      const x = x0 + i * (u + gap);
      g.fillStyle = PAL.bakelite; g.fillRect(x, y0, u, u);
      g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x + 1, y0 + 1, u - 2, u - 2);
      jewel(g, x + u / 2, y0 + u + 14, 6, 'green', i < used);
    }
    let slot = 0;
    for (const t of s.belt) { // a heavy tool is drawn across the bays it fills
      const w = TOOLS[t].weight, span = w * (u + gap) - gap;
      drawTool(g, t, x0 + slot * (u + gap) + span / 2, y0 + u / 2, u - 24, C.ink);
      slot += w;
    }
    nixie(g, `${used}/${CFG.beltCapacity}`, W - 52, H - 18, 18);
    jewel(g, 30, H - 18, 7, 'amber', used >= CFG.beltCapacity);
    label(g, 'FULL', 52, H - 18, 12, C.dim, 'left');
  }
  {
    const cv = $('lockerCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    panelBg(g, W, H);
    const ids = Object.keys(TOOLS), cell = W / ids.length;
    ids.forEach((t, i) => {
      const here = s.locker.includes(t), cx = cell * i + cell / 2;
      g.globalAlpha = here ? 1 : 0.18;
      drawTool(g, t, cx, 56, 78, C.ink);
      g.globalAlpha = 1;
      for (let k = 0; k < TOOLS[t].weight; k++) jewel(g, cx - (TOOLS[t].weight - 1) * 9 + k * 18, 124, 5, 'amber', here); // one lamp per weight unit
    });
  }
}

// ---------- Technician: the radar scope ----------
function noise(g, W, H, alpha = 1) { // warm grey static, not white on black
  const img = g.createImageData(W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = 20 + Math.random() * 120; d[i] = v * 1.05; d[i + 1] = v; d[i + 2] = v * 0.85; d[i + 3] = 255 * alpha; }
  g.putImageData(img, 0, 0);
}
const phos = a => `rgba(156,194,122,${a})`;
function drawMap(s) {
  const cv = $('map'), g = cv.getContext('2d'), W = cv.width, k = (W - 40) / (2 * (CFG.bounds + 2));
  const X = x => W / 2 + x * k, Y = z => W / 2 + z * k; // north (-z) is up
  const R = W / 2 - 18;
  panelBg(g, W, W);
  if (!s.radar) { // the radar is on the rover, and the rover is stuck
    g.save(); g.beginPath(); g.arc(W / 2, W / 2, R, 0, 7); g.clip(); noise(g, W, W); g.restore();
    g.strokeStyle = PAL.bezel; g.lineWidth = 8; g.beginPath(); g.arc(W / 2, W / 2, R + 4, 0, 7); g.stroke();
    plate(g, 'NO SIGNAL', W / 2, W / 2, 190, 16);
    return;
  }
  // the scope: bezel, dark glass, a phosphor graticule
  g.strokeStyle = PAL.bezel; g.lineWidth = 8; g.beginPath(); g.arc(W / 2, W / 2, R + 4, 0, 7); g.stroke();
  g.save(); g.beginPath(); g.arc(W / 2, W / 2, R, 0, 7); g.clip();
  const glass = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, R);
  glass.addColorStop(0, '#152015'); glass.addColorStop(1, PAL.glass);
  g.fillStyle = glass; g.fillRect(0, 0, W, W);
  g.strokeStyle = phos(0.13); g.lineWidth = 1;
  for (let m = -20; m <= 20; m += 5) { g.beginPath(); g.moveTo(X(m), 0); g.lineTo(X(m), W); g.moveTo(0, Y(m)); g.lineTo(W, Y(m)); g.stroke(); }
  g.strokeStyle = phos(0.35); g.beginPath(); g.arc(X(0), Y(0), CFG.bounds * k, 0, 7); g.stroke();
  // the sweep, with an afterglow behind it
  const sweep = (Date.now() / 1000 * 1.6) % (Math.PI * 2);
  for (let i = 0; i < 24; i++) {
    g.fillStyle = phos(0.16 * (1 - i / 24)); g.beginPath(); g.moveTo(W / 2, W / 2);
    g.arc(W / 2, W / 2, R, sweep - (i + 1) * 0.03, sweep - i * 0.03); g.closePath(); g.fill();
  }
  label(g, 'N', W / 2, 26, 12, phos(0.7));
  // The base, in phosphor outline: habitat, canopy, and the places the astronaut works.
  const cn = PLACES.canopy;
  g.strokeStyle = phos(0.7); g.lineWidth = 1.5;
  g.strokeRect(X(cn.x0), Y(cn.z0), (cn.x1 - cn.x0) * k, (cn.z1 - cn.z0) * k);
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(X(cn.x0) + i * (cn.x1 - cn.x0) * k / 5, Y(cn.z0)); g.lineTo(X(cn.x0) + (i - 1) * (cn.x1 - cn.x0) * k / 5, Y(cn.z1)); g.stroke(); }
  g.beginPath(); g.arc(X(0), Y(0), CFG.habRadius * k, 0, 7); g.stroke();
  label(g, 'HAB', X(0), Y(0) + 3, 10, phos(0.9));
  label(g, 'COVER', X(0), Y(cn.z1) + 10, 9, phos(0.6));
  const mark = (p, name, w = 10, h = 10) => { g.strokeStyle = phos(0.9); g.strokeRect(X(p.x) - w / 2, Y(p.z) - h / 2, w, h); if (name) label(g, name, X(p.x), Y(p.z) - h / 2 - 9, 9, phos(0.75)); };
  mark(PLACES.locker, 'LOCKER');
  g.fillStyle = phos(0.9); g.fillRect(X(0) - 4, Y(-1.5) - 4, 8, 8); // the switchboard is inside the habitat
  label(g, 'BOARD', X(0), Y(0) - CFG.habRadius * k - 9, 9, phos(0.75));
  PLACES.panels.forEach((p, i) => mark(p, i === 0 ? 'SOLAR' : '', 6, 22));
  for (const p of [PLACES.depot, PLACES.dish, PLACES.drill]) { g.strokeStyle = phos(0.4); g.strokeRect(X(p.x) - 4, Y(p.z) - 4, 8, 8); }
  const blip = (x, z, ry, colour, name) => {
    g.save(); g.translate(X(x), Y(z)); label(g, name, 0, 20, 9, colour);
    g.rotate(Math.atan2(Math.sin(ry), -Math.cos(ry))); // heading (sin ry, cos ry) in x,z -> screen
    g.shadowColor = colour; g.shadowBlur = 6; g.fillStyle = colour;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  };
  blip(s.rover.x, s.rover.z, s.rover.ry, C.amber, 'ROVER');
  if (s.astro && s.crew.includes('astronaut')) blip(s.astro.x, s.astro.z, s.astro.ry, C.blue, 'ASTRONAUT');
  // Meteors: amber blips closing on the base and a ring that shrinks to nothing at the first impact.
  if (s.meteor) {
    const m = s.meteor, f = m.eta / CFG.meteorWarnSeconds;
    if (!m.falling) {
      g.strokeStyle = C.amber; g.lineWidth = 2.5; g.shadowColor = C.amber; g.shadowBlur = 6;
      g.beginPath(); g.arc(X(0), Y(0), Math.max(4, f * (R - 8)), 0, 7); g.stroke();
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + 0.5, r = (0.25 + f * 0.75) * (R - 14) * (0.8 + (i % 3) * 0.1);
        g.fillStyle = C.amber; g.beginPath(); g.arc(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, 4.5, 0, 7); g.fill();
      }
      g.shadowBlur = 0;
    } else { // impacts: the scope flares
      g.fillStyle = phos(blinkOn() ? 0.16 : 0.06); g.fillRect(0, 0, W, W);
      for (let i = 0; i < 14; i++) { g.fillStyle = C.amber; g.beginPath(); g.arc(Math.random() * W, Math.random() * W, 4, 0, 7); g.fill(); }
    }
  }
  g.restore();
  // seconds to impact on a Nixie counter in the corner of the console, with its lamp
  if (s.meteor) {
    nixie(g, s.meteor.falling ? '00' : String(Math.ceil(s.meteor.eta)).padStart(2, '0'), W - 40, 30, 26);
    jewel(g, W - 84, 30, 8, 'red', blinkOn());
  }
}

// ---------- Scientist: POWER ----------
function drawPower(s) {
  const cv = $('powerCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height, p = s.power;
  panelBg(g, W, H);
  // The battery: a fuel-gauge dial with its percentage on Nixie tubes, and a LOW BATT lamp.
  const low = p.battery < 30;
  dial(g, W * 0.5, 128, 100, p.battery, 100, 'BATTERY', { redBelow: 30, unit: '%' });
  jewel(g, W * 0.5 - 150, 150, 9, 'red', low && blinkOn()); label(g, 'LOW', W * 0.5 - 150, 172, 10, C.dim);
  // Where the power is lost: coming in from the sun, or going out through the board.
  dial(g, W * 0.27, 316, 90, p.solar, 100, 'SOLAR IN', { redBelow: 60, unit: '%' });
  dial(g, W * 0.73, 316, 90, p.board, 100, 'BOARD OUT', { redBelow: 60, unit: '%' });
  g.strokeStyle = PAL.rule; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.27 + 104, 300); g.lineTo(W * 0.73 - 112, 300); g.stroke();
  g.fillStyle = PAL.rule; g.beginPath(); g.moveTo(W * 0.73 - 112, 291); g.lineTo(W * 0.73 - 100, 300); g.lineTo(W * 0.73 - 112, 309); g.fill();
  // The wiring diagram, printed on a cream card: each loose cable and the socket it belongs in.
  if (s.wiring) {
    const top = 420, bottom = H - 14;
    g.fillStyle = PAL.dial; g.fillRect(20, top, W - 40, bottom - top);
    g.strokeStyle = PAL.inkDim; g.lineWidth = 1; g.strokeRect(26.5, top + 6.5, W - 53, bottom - top - 13);
    const n = s.wiring.length, row = (bottom - top - 16) / Math.max(1, n);
    s.wiring.forEach((w, i) => {
      const y = top + 8 + row * i + row / 2, col = CABLE[w.color];
      g.fillStyle = col; g.strokeStyle = PAL.inkDial; g.lineWidth = 1.5;
      g.fillRect(70, y - 11, 56, 22); g.strokeRect(70, y - 11, 56, 22); g.fillRect(126, y - 6, 14, 12);
      g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.moveTo(146, y); g.lineTo(W - 190, y); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(W - 190, y - 11); g.lineTo(W - 168, y); g.lineTo(W - 190, y + 11); g.fill();
      drawShape(g, SOCKET_SHAPES[w.socket], W - 110, y, Math.min(40, row * 0.8), PAL.inkDial);
    });
  }
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

// ---------- blackout: static, and a dead battery ----------
setInterval(() => {
  if ($('static').hidden) return;
  const cv = $('staticCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  noise(g, W, H);
  g.fillStyle = 'rgba(29,28,25,0.85)'; g.fillRect(W / 2 - 44, H / 2 - 26, 88, 52);
  g.strokeStyle = PAL.inkDim; g.lineWidth = 3; g.strokeRect(W / 2 - 30, H / 2 - 14, 54, 28);
  g.fillStyle = PAL.inkDim; g.fillRect(W / 2 + 26, H / 2 - 6, 5, 12);
  if (blinkOn()) { g.fillStyle = PAL.red; g.fillRect(W / 2 - 26, H / 2 - 10, 5, 20); } // one last sliver
}, 90);

// ---------- Technician: rover ----------
if (has('tech')) {
  const keys = new Set();
  const sendDrive = () => net.send({
    t: 'rover',
    throttle: (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0),
    steer: (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0),
  });
  addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) { e.preventDefault(); if (!keys.has(e.key)) { keys.add(e.key); sendDrive(); } } });
  addEventListener('keyup', e => { if (keys.delete(e.key)) sendDrive(); });
  addEventListener('blur', () => { if (keys.size) { keys.clear(); sendDrive(); } });
  import('/rovercam.js').then(m => m.startRoverCam($('cam'), () => state)).catch(err => {
    console.warn(err);
    $('cam').hidden = true;
    $('camHint').textContent = 'Rover camera unavailable. Arrow keys still drive.';
  });
}

// ---------- Mission Ops: radio ----------
function paintPtt() {
  const b = $('ptt'); if (!b) return;
  b.className = talking ? 'tx' : rx ? 'rx' : '';
  b.textContent = talking ? 'TRANSMITTING... (1.3 s to the Moon)' : rx ? 'ASTRONAUT IS TRANSMITTING' : 'HOLD SPACE TO TALK TO THE ASTRONAUT';
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
    if (on && state && state.phase === 'run' && !state.powered) return; // no power, no radio
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
window.moonbase = { state: () => state, radio, net, role };
