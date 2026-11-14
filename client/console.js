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

// /console.html?role=ops or the clean URL /ops; /control is the all-in-one seat.
const PATH_ROLE = { ops: 'ops', tech: 'tech', sci: 'sci', control: 'all', all: 'all' };
const asked = new URLSearchParams(location.search).get('role') || PATH_ROLE[location.pathname.split('/').pop()];
const role = ['ops', 'tech', 'sci', 'all'].includes(asked) ? asked : 'all';
const has = r => role === r || role === 'all';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const C = { bg: '#05080a', line: '#243240', ink: '#d6e6e0', dim: '#7d909c', green: '#58e08a', amber: '#ffb84a', red: '#ff5c5c', blue: '#6fb6ff' };
const CABLE = { red: '#e0453a', blue: '#3f7fe8', yellow: '#f0cf3a', green: '#45c463' };

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
const blinkOn = () => Math.floor(Date.now() / 300) % 2 === 0;
function label(g, text, x, y, size = 14, color = C.dim, align = 'center') {
  g.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, x, y);
}
// A half-circle dial from 0 to max, with the low end marked red.
function dial(g, x, y, r, value, max, name, { redBelow = 0, redAbove = Infinity, unit = '' } = {}) {
  const ang = v => Math.PI + Math.max(0, Math.min(1, v / max)) * Math.PI;
  g.lineWidth = r * 0.16; g.lineCap = 'butt';
  g.strokeStyle = C.line; g.beginPath(); g.arc(x, y, r, Math.PI, 2 * Math.PI); g.stroke();
  g.strokeStyle = '#5a1f1f';
  if (redBelow > 0) { g.beginPath(); g.arc(x, y, r, Math.PI, ang(redBelow)); g.stroke(); }
  if (redAbove < max) { g.beginPath(); g.arc(x, y, r, ang(redAbove), 2 * Math.PI); g.stroke(); }
  const bad = value < redBelow || value > redAbove;
  const a = ang(value);
  g.strokeStyle = bad ? C.red : C.green; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke();
  g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
  label(g, `${Math.round(value)}${unit}`, x, y + 32, 30, bad ? C.red : C.ink);
  label(g, name, x, y + 62, 16, C.dim);
}

// ---------- Mission Ops: the belt and the locker ----------
function drawKit(s) {
  {
    const cv = $('beltCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const used = beltWeight(s.belt), u = 110, gap = 12, x0 = (W - (CFG.beltCapacity * (u + gap) - gap)) / 2, y0 = 16;
    for (let i = 0; i < CFG.beltCapacity; i++) {
      g.strokeStyle = i < used ? C.green : C.line; g.lineWidth = 3;
      g.strokeRect(x0 + i * (u + gap), y0, u, u);
      if (i < used) { g.fillStyle = 'rgba(88,224,138,0.12)'; g.fillRect(x0 + i * (u + gap), y0, u, u); }
    }
    let slot = 0;
    for (const t of s.belt) { // a heavy tool is drawn across the boxes it fills
      const w = TOOLS[t].weight, span = w * (u + gap) - gap;
      drawTool(g, t, x0 + slot * (u + gap) + span / 2, y0 + u / 2, u - 24, C.ink);
      slot += w;
    }
    label(g, `${used} / ${CFG.beltCapacity}`, W / 2, H - 16, 18, used >= CFG.beltCapacity ? C.amber : C.dim);
  }
  {
    const cv = $('lockerCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const ids = Object.keys(TOOLS), cell = W / ids.length;
    ids.forEach((t, i) => {
      const here = s.locker.includes(t), cx = cell * i + cell / 2;
      g.globalAlpha = here ? 1 : 0.16;
      drawTool(g, t, cx, 56, 78, C.ink);
      g.globalAlpha = here ? 1 : 0.3;
      for (let k = 0; k < TOOLS[t].weight; k++) { // one pip per weight unit
        g.fillStyle = C.amber; g.fillRect(cx - TOOLS[t].weight * 9 + k * 18 + 2, 118, 14, 14);
      }
      g.globalAlpha = 1;
    });
  }
}

// ---------- Technician: the radar map ----------
function noise(g, W, H, alpha = 1) {
  const img = g.createImageData(W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 190; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255 * alpha; }
  g.putImageData(img, 0, 0);
}
function drawMap(s) {
  const cv = $('map'), g = cv.getContext('2d'), W = cv.width, k = W / (2 * (CFG.bounds + 2));
  const X = x => W / 2 + x * k, Y = z => W / 2 + z * k; // north (-z) is up
  if (!s.radar) { // the radar is on the rover, and the rover is stuck
    noise(g, W, W);
    g.fillStyle = 'rgba(5,8,10,0.75)'; g.fillRect(W / 2 - 120, W / 2 - 30, 240, 60);
    label(g, 'NO RADAR', W / 2, W / 2, 30, C.red);
    return;
  }
  g.fillStyle = C.bg; g.fillRect(0, 0, W, W);
  g.strokeStyle = '#16222b'; g.lineWidth = 1;
  for (let m = -20; m <= 20; m += 5) { g.beginPath(); g.moveTo(X(m), 0); g.lineTo(X(m), W); g.moveTo(0, Y(m)); g.lineTo(W, Y(m)); g.stroke(); }
  g.strokeStyle = '#2c4150'; g.beginPath(); g.arc(X(0), Y(0), CFG.bounds * k, 0, 7); g.stroke();
  label(g, 'N', W / 2, 12, 12);
  // The base: habitat, canopy, and the places the astronaut works.
  const cn = PLACES.canopy;
  g.fillStyle = '#3a4a2a'; g.fillRect(X(cn.x0), Y(cn.z0), (cn.x1 - cn.x0) * k, (cn.z1 - cn.z0) * k);
  g.fillStyle = '#c9d6dc'; g.beginPath(); g.arc(X(0), Y(0), CFG.habRadius * k, 0, 7); g.fill();
  label(g, 'HAB', X(0), Y(0) + 8, 11, C.bg);
  label(g, 'COVER', X(0), Y(cn.z1) + 9, 10, '#9db07a');
  const mark = (p, name, w = 10, h = 10) => { g.fillStyle = C.green; g.fillRect(X(p.x) - w / 2, Y(p.z) - h / 2, w, h); if (name) label(g, name, X(p.x), Y(p.z) - h / 2 - 9, 11); };
  mark(PLACES.locker, 'LOCKER');
  // The switchboard is inside the habitat.
  g.fillStyle = C.green; g.fillRect(X(0) - 5, Y(-1.5) - 5, 10, 10);
  label(g, 'BOARD', X(0), Y(0) - CFG.habRadius * k - 9, 11);
  PLACES.panels.forEach((p, i) => mark(p, i === 0 ? 'SOLAR' : '', 6, 22));
  for (const p of [PLACES.depot, PLACES.dish, PLACES.drill]) { g.fillStyle = '#31424d'; g.fillRect(X(p.x) - 4, Y(p.z) - 4, 8, 8); }

  const arrow = (x, z, ry, color, name) => {
    g.save(); g.translate(X(x), Y(z)); label(g, name, 0, 22, 12, color);
    g.rotate(Math.atan2(Math.sin(ry), -Math.cos(ry))); // heading (sin ry, cos ry) in x,z -> screen
    g.fillStyle = color; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill(); g.restore();
  };
  arrow(s.rover.x, s.rover.z, s.rover.ry, C.amber, 'ROVER');
  if (s.astro && s.crew.includes('astronaut')) arrow(s.astro.x, s.astro.z, s.astro.ry, C.blue, 'ASTRONAUT');

  // Meteors: blips closing on the base, a ring that shrinks to nothing at the first impact, and seconds to go.
  if (s.meteor) {
    const m = s.meteor, f = m.eta / CFG.meteorWarnSeconds, hot = blinkOn();
    if (!m.falling) {
      g.strokeStyle = C.red; g.lineWidth = 3;
      g.beginPath(); g.arc(X(0), Y(0), Math.max(4, f * (W / 2 - 8)), 0, 7); g.stroke();
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4 + 0.5, r = (0.25 + f * 0.75) * (W / 2 - 14) * (0.8 + (i % 3) * 0.1);
        g.fillStyle = C.red; g.beginPath(); g.arc(W / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, 5, 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(5,8,10,0.8)'; g.fillRect(W - 96, 8, 88, 62);
      label(g, String(Math.ceil(m.eta)), W - 52, 40, 44, C.red);
    } else {
      g.strokeStyle = hot ? C.red : '#5a1f1f'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, W - 10);
      for (let i = 0; i < 14; i++) { g.fillStyle = C.red; g.beginPath(); g.arc(Math.random() * W, Math.random() * W, 4, 0, 7); g.fill(); }
    }
  }
}

// ---------- Scientist: POWER ----------
function drawPower(s) {
  const cv = $('powerCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height, p = s.power;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  // The battery: how long until the lights go out.
  const bx = 60, by = 30, bw = W - 150, bh = 110, low = p.battery < 30;
  g.strokeStyle = C.ink; g.lineWidth = 5; g.strokeRect(bx, by, bw, bh);
  g.fillStyle = C.ink; g.fillRect(bx + bw + 4, by + 30, 16, bh - 60);
  g.fillStyle = low ? (blinkOn() ? C.red : '#5a1f1f') : p.battery < 60 ? C.amber : C.green;
  g.fillRect(bx + 8, by + 8, (bw - 16) * p.battery / 100, bh - 16);
  label(g, `${Math.round(p.battery)}%`, bx + bw / 2, by + bh / 2, 46, p.battery > 55 && !low ? '#05130a' : C.ink);
  label(g, 'BATTERY', bx + bw / 2, by + bh + 22, 16);
  // Where the power is lost: coming in from the sun, or going out through the board.
  dial(g, W * 0.27, 296, 100, p.solar, 100, 'SOLAR IN', { redBelow: 60, unit: '%' });
  dial(g, W * 0.73, 296, 100, p.board, 100, 'BOARD OUT', { redBelow: 60, unit: '%' });
  g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.27 + 112, 250); g.lineTo(W * 0.73 - 122, 250); g.stroke();
  g.fillStyle = C.line; g.beginPath(); g.moveTo(W * 0.73 - 122, 240); g.lineTo(W * 0.73 - 108, 250); g.lineTo(W * 0.73 - 122, 260); g.fill();
  // The wiring diagram: each loose cable and the socket it belongs in.
  if (s.wiring) {
    g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(20, 392, W - 40, H - 408);
    const n = s.wiring.length, row = (H - 424) / Math.max(1, n);
    s.wiring.forEach((w, i) => {
      const y = 400 + row * i + row / 2, col = CABLE[w.color];
      g.fillStyle = col; g.fillRect(70, y - 13, 60, 26); g.fillRect(130, y - 7, 16, 14);    // the plug
      g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.moveTo(152, y); g.lineTo(W - 190, y); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(W - 190, y - 12); g.lineTo(W - 166, y); g.lineTo(W - 190, y + 12); g.fill();
      drawShape(g, SOCKET_SHAPES[w.socket], W - 110, y, 44, C.ink);
    });
  }
}

// ---------- Scientist: AIR ----------
function drawAir(s) {
  const cv = $('airCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  // Oxygen left.
  const frac = Math.max(0, Math.min(1, s.oxygen / s.o2Max)), low = s.oxygen < 25;
  g.strokeStyle = C.ink; g.lineWidth = 5; g.strokeRect(60, 30, W - 120, 90);
  g.fillStyle = low ? C.red : C.green; g.fillRect(68, 38, (W - 136) * frac, 74);
  label(g, String(Math.round(s.oxygen)), W / 2, 75, 44, frac > 0.55 ? '#05130a' : C.ink);
  label(g, 'OXYGEN', W / 2, 142, 16);
  // How fast it is going.
  dial(g, W * 0.3, 360, 120, s.drain, CFG.leakMultiplier * 2 - 0.5, 'DRAIN', { redAbove: 1.6, unit: 'x' });
  // The leak lamp. It does not say where.
  const on = s.leak, lit = on && blinkOn(), lx = W * 0.74, ly = 310;
  g.fillStyle = lit ? C.red : on ? '#5a1f1f' : '#141c22';
  g.beginPath(); g.arc(lx, ly, 78, 0, 7); g.fill();
  g.strokeStyle = on ? C.red : C.line; g.lineWidth = 5; g.beginPath(); g.arc(lx, ly, 78, 0, 7); g.stroke();
  // Air hissing out of a hole.
  g.strokeStyle = on ? '#fff' : C.line; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.arc(lx - 34, ly, 10, 0, 7); g.stroke();
  for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(lx - 14 + Math.cos(a) * 6, ly + Math.sin(a) * 6); g.lineTo(lx - 14 + Math.cos(a) * 50, ly + Math.sin(a) * 50); g.stroke(); }
  label(g, 'LEAK', lx, ly + 106, 18, on ? C.red : C.dim);
}

// ---------- blackout: static, and a dead battery ----------
setInterval(() => {
  if ($('static').hidden) return;
  const cv = $('staticCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  noise(g, W, H);
  g.fillStyle = 'rgba(5,8,10,0.82)'; g.fillRect(W / 2 - 44, H / 2 - 26, 88, 52);
  g.strokeStyle = C.red; g.lineWidth = 3; g.strokeRect(W / 2 - 30, H / 2 - 14, 54, 28);
  g.fillStyle = C.red; g.fillRect(W / 2 + 26, H / 2 - 6, 5, 12);
  if (blinkOn()) g.fillRect(W / 2 - 26, H / 2 - 10, 5, 20); // one last sliver
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
