// Mission control. One page serves all three consoles:
//   /ops | /tech | /sci | /control   ("control" is the 2-player mode, all three consoles)
// The server only sends each role what it is allowed to know, so the panels just draw what arrives.
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { CFG, VEHICLES, GEAR, STATIONS, ISSUES, ROLES, bearing } from '/shared/config.js';
import { MANUAL } from '/shared/rules.js';
import { seatTaken } from '/seat.js';
import { createLobby } from '/lobby.js';

// /console.html?role=ops or the clean URL /ops; /control is the all-in-one seat.
const PATH_ROLE = { ops: 'ops', tech: 'tech', sci: 'sci', control: 'all', all: 'all' };
const asked = new URLSearchParams(location.search).get('role') || PATH_ROLE[location.pathname.split('/').pop()];
const role = ['ops', 'tech', 'sci', 'all'].includes(asked) ? asked : 'all';
const has = r => role === r || role === 'all';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

const BRIEF = {
  ops: '<b>You are the only voice the astronaut hears.</b> Hold SPACE to talk. Your voice takes 1.3 s to reach the Moon, and the reply takes 1.3 s to come back. Pass on what the Technician (where) and the Scientist (how) tell you, and type fault codes into the uplink terminal.',
  tech: '<b>You know WHERE.</b> The astronaut has no map. Tell Mission Ops which station is in alarm and how to get there. Drive the rover with the arrow keys so the astronaut can follow its lights.',
  sci: '<b>You know HOW.</b> Each alarm shows telemetry only you can see. Combine it with the manual and tell Mission Ops exactly what the astronaut must do.',
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
    b.textContent = has('ops') ? 'Briefing and mission plan' : 'Briefing';
    b.onclick = () => { $('planSheet').hidden = false; };
    return b;
  },
});

$('run').innerHTML = [
  has('ops') && `<div class="panel"><h3>Mission Ops</h3>
    <button id="ptt">HOLD SPACE TO TALK TO THE ASTRONAUT</button>
    <h2>Alarms</h2><div id="opsAlarms"></div>
    <h2>Uplink terminal</h2><div id="term"></div>
    <div class="termrow"><input id="termIn" maxlength="12" placeholder="CODE" autocomplete="off" spellcheck="false"><button id="termGo">Upload</button></div>
    <p class="hint">Type the 4-character fault code the astronaut reads out, then Enter. Round trip is 2.6 s.</p></div>`,
  has('tech') && `<div class="panel"><h3>Technician</h3>
    <canvas id="map" width="460" height="460"></canvas>
    <h2 style="margin-top:1em">Alarm locations</h2><div id="techAlarms"></div>
    <canvas id="cam"></canvas>
    <p class="hint" id="camHint">Rover camera. Arrow keys drive; commands take 1.3 s to arrive.</p></div>`,
  has('sci') && `<div class="panel"><h3>Scientist</h3>
    <h2>Telemetry</h2><div id="sciAlarms"></div>
    <h2 style="margin-top:1em">Manual</h2><div class="manual" id="manual">${Object.entries(MANUAL).map(([k, m]) =>
      `<details data-type="${k}"><summary>${esc(m.title)}</summary><p>${esc(m.ask)}</p><ol>${m.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol></details>`).join('')}</div></div>`,
].filter(Boolean).join('');

// ---------- network ----------
net.onState = s => { state = s; render(); };
net.onTaken = seatTaken;
net.onBinary = buf => radio?.receive(buf);
net.onMsg = m => {
  if (m.t === 'ptt' && radio) { rx = m.on; radio.rxMarker(m.on); paintPtt(); }
  if (m.t === 'term') termLine(m.line);
};
setInterval(() => { $('link').textContent = net.open ? '' : 'NO LINK TO SERVER'; }, 500);

// ---------- render ----------
function render() {
  const s = state;
  $('clock').textContent = clock(s.timeLeft);
  $('o2').textContent = Math.round(s.oxygen);
  $('score').textContent = s.score;
  const bar = $('o2bar');
  bar.style.width = `${Math.min(100, (s.oxygen / s.o2Max) * 100)}%`;
  bar.className = s.oxygen < 25 ? 'low' : '';
  $('crew').innerHTML = ['astronaut', 'ops', 'tech', 'sci'].map(r =>
    `<i class="${s.crew.includes(r) || (r !== 'astronaut' && s.crew.includes('all')) ? 'on' : ''}">${ROLES[r]}</i>`).join('');

  if (s.ev && s.ev.n !== lastEv) {
    lastEv = s.ev.n;
    const t = $('toast');
    t.className = s.ev.kind;
    t.textContent = s.ev.text + (s.ev.o2 ? `  (${s.ev.o2} oxygen)` : '') + (s.ev.pts ? `  (+${s.ev.pts})` : '');
    radio?.sfx(s.ev.kind);
  }

  if (s.phase !== shown) {
    shown = s.phase;
    lobby.show(s.phase === 'lobby');
    if (s.phase !== 'lobby') $('planSheet').hidden = true;
    for (const id of ['run', 'results']) $(id).hidden = id !== s.phase;
    if (s.phase === 'lobby') { $('toast').textContent = ''; $('toast').className = ''; }
  }
  lobby.update(s);
  if (s.phase === 'lobby') renderPlan(s);
  if (s.phase === 'run') renderRun(s);
  if (s.phase === 'results') renderResults(s);
}

function renderPlan(s) {
  const key = JSON.stringify([s.loadout, s.crew]);
  if (key === planKey) return;
  planKey = key;
  const { vehicle, gear } = s.loadout;
  const cap = VEHICLES[vehicle].cap;
  const used = gear.reduce((m, g) => m + GEAR[g].mass, 0);
  const canEdit = has('ops');
  $('plan').innerHTML = `<h3>Mission plan</h3>
    <p class="brief">${canEdit ? 'The standard kit is already loaded. Change it if you like: a bigger lander carries more gear, a faster one leaves more oxygen. Changing the plan does not clear anyone\'s Ready.' : 'Mission Ops sets the plan. The mission starts when all four seats are ready.'}</p>
    <h2>Lander</h2>
    <div class="vehicles">${Object.entries(VEHICLES).map(([k, v]) =>
      `<label class="pick ${k === vehicle ? 'sel' : ''}" data-vehicle="${k}"><b>${v.name}</b><span>${v.blurb}</span></label>`).join('')}</div>
    <h2>Gear</h2>
    ${Object.entries(GEAR).map(([k, g]) => {
      const sel = gear.includes(k), off = !sel && used + g.mass > cap;
      return `<label class="pick ${sel ? 'sel' : ''} ${off ? 'off' : ''}" data-gear="${k}" style="margin-bottom:6px"><b>${sel ? '[x]' : '[ ]'} ${g.name} <span>(mass ${g.mass})</span></b><span>${g.blurb}</span></label>`;
    }).join('')}
    <div class="mass">Mass loaded: ${used} / ${cap} &nbsp;|&nbsp; Suit oxygen at start: ${VEHICLES[vehicle].o2 + (gear.includes('o2') ? 25 : 0)}</div>`;
}

$('plan').addEventListener('click', e => {
  if (!has('ops') || !state) return;
  const el = e.target.closest('[data-vehicle],[data-gear]');
  if (!el) return;
  let { vehicle, gear } = state.loadout;
  gear = [...gear];
  if (el.dataset.vehicle) {
    vehicle = el.dataset.vehicle;
    while (gear.reduce((m, g) => m + GEAR[g].mass, 0) > VEHICLES[vehicle].cap) gear.pop();
  } else {
    const g = el.dataset.gear;
    if (gear.includes(g)) gear = gear.filter(x => x !== g);
    else if (!el.classList.contains('off')) gear.push(g);
  }
  net.send({ t: 'loadout', vehicle, gear });
});

function alarmCard(is, body) {
  const hot = is.left < 15;
  return `<div class="alarm ${hot ? 'hot' : ''}"><div class="top"><span>${ISSUES[is.type].title}</span><span class="t">${Math.ceil(is.left)} s</span></div>
    <div class="meter"><i style="width:${(is.left / is.total) * 100}%"></i></div>${body}</div>`;
}
const none = '<p class="empty">All systems nominal.</p>';

function renderRun(s) {
  if (has('ops')) {
    $('opsAlarms').innerHTML = s.issues.map(is => alarmCard(is,
      is.type !== 'patch' ? '<div class="where">Ask the Technician where and the Scientist how.</div>'
        : is.stage === 1 ? `<div class="data">Patch uploaded. Astronaut enters key <b>${esc(is.confirm.split('').join(' '))}</b></div>`
        : '<div class="data">Needs the fault code from the astronaut\'s screen.</div>')).join('') || none;
  }
  if (has('tech')) {
    $('techAlarms').innerHTML = s.issues.map(is => {
      const st = STATIONS[is.type];
      return alarmCard(is, `<div class="where">${st.name}, ${bearing(st.x, st.z)} of the habitat</div>` +
        (is.type === 'freq' ? `<div class="data">Dish is on channel <b>${is.value}</b></div>` : ''));
    }).join('') || none;
    drawMap(s);
  }
  if (has('sci')) {
    $('sciAlarms').innerHTML = s.issues.map(is => alarmCard(is,
      is.type === 'wires' ? `<div class="data">Tank pressure: <b>${is.pressure}</b></div>`
        : is.type === 'freq' ? `<div class="data">Target channel: <b>${is.target}</b></div>`
        : is.type === 'drill' ? `<div class="data">Core sample is the <b>${is.keep.toUpperCase()}</b> rock. It stays.</div>`
        : '<div class="data">No telemetry needed. Mission Ops uploads the patch.</div>')).join('') || none;
    const live = s.issues.map(i => i.type);
    for (const d of $('manual').children) {
      const on = live.includes(d.dataset.type);
      if (on && !d.classList.contains('live')) d.open = true;
      if (!on && d.classList.contains('live')) d.open = false;
      d.classList.toggle('live', on);
    }
  }
}

function renderResults(s) {
  const key = JSON.stringify(s.result) + s.score;
  if (key === resultKey || !s.result) return;
  resultKey = key;
  const r = s.result;
  $('results').innerHTML = `<div class="panel">
    <div class="verdict ${r.won ? 'won' : 'lost'}">${r.won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</div>
    <p>${esc(r.reason)}</p>
    <p><b>Score ${s.score}</b> &nbsp;|&nbsp; fixed ${r.fixed} &nbsp;|&nbsp; timed out ${r.missed} &nbsp;|&nbsp; mistakes ${r.mistakes}${r.won ? ` &nbsp;|&nbsp; oxygen bonus +${r.bonus}` : ''}</p>
    <h2>What happened and why</h2>
    <ul class="log">${(s.log || []).filter(l => l.kind !== 'spawn').map(l =>
      `<li class="${l.kind}"><span class="at">${clock(l.at)}</span><span>${esc(l.text)}</span><span class="d">${l.pts ? '+' + l.pts : ''}${l.o2 ? l.o2 + ' O2' : ''}</span></li>`).join('')}</ul>
    ${has('ops') ? '<button class="big" data-again>Fly again</button> <span class="hint">Everyone goes back to the lobby and readies up again. Your plan stays loaded, so you can change one thing and compare.</span>' : '<p class="hint">Mission Ops can send the crew back to the lobby for another run.</p>'}
  </div>`;
}
$('results').addEventListener('click', e => { if (e.target.closest('[data-again]')) { resultKey = ''; net.send({ t: 'reset' }); } });

// ---------- Technician: map ----------
function drawMap(s) {
  const cv = $('map'), g = cv.getContext('2d'), W = cv.width, k = W / (2 * (CFG.bounds + 2));
  const X = x => W / 2 + x * k, Y = z => W / 2 + z * k; // north (-z) is up
  const blink = Math.floor(Date.now() / 300) % 2 === 0;
  g.fillStyle = '#05080a'; g.fillRect(0, 0, W, W);
  g.strokeStyle = '#16222b'; g.lineWidth = 1;
  for (let m = -20; m <= 20; m += 5) { g.beginPath(); g.moveTo(X(m), 0); g.lineTo(X(m), W); g.moveTo(0, Y(m)); g.lineTo(W, Y(m)); g.stroke(); }
  g.strokeStyle = '#2c4150'; g.beginPath(); g.arc(X(0), Y(0), CFG.bounds * k, 0, 7); g.stroke();
  g.font = '12px ui-monospace, monospace'; g.textAlign = 'center';
  g.fillStyle = '#7d909c'; g.fillText('N', W / 2, 14); g.fillText('5 m grid', W - 34, W - 8);
  g.fillStyle = '#c9d6dc'; g.beginPath(); g.arc(X(0), Y(0), CFG.habRadius * k, 0, 7); g.fill();
  g.fillStyle = '#05080a'; g.fillText('HAB', X(0), Y(0) + 4);
  const live = s.issues.map(i => i.type);
  for (const [key, st] of Object.entries(STATIONS)) {
    const on = live.includes(key);
    if (on && blink) { g.strokeStyle = '#ff5c5c'; g.lineWidth = 3; g.beginPath(); g.arc(X(st.x), Y(st.z), 16, 0, 7); g.stroke(); }
    g.fillStyle = on ? '#ff5c5c' : '#58e08a'; g.fillRect(X(st.x) - 6, Y(st.z) - 6, 12, 12);
    g.fillStyle = on ? '#ffb84a' : '#7d909c'; g.fillText(st.name, X(st.x), Y(st.z) - 12);
  }
  const arrow = (x, z, ry, color, label) => {
    g.save(); g.translate(X(x), Y(z)); g.fillStyle = color; g.fillText(label, 0, 22);
    g.rotate(Math.atan2(Math.sin(ry), -Math.cos(ry))); // heading (sin ry, cos ry) in x,z -> screen
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(-7, 8); g.closePath(); g.fill(); g.restore();
  };
  arrow(s.rover.x, s.rover.z, s.rover.ry, '#ffb84a', 'ROVER');
  if (s.astro && s.loadout.gear.includes('beacon')) arrow(s.astro.x, s.astro.z, s.astro.ry, '#6fb6ff', 'ASTRONAUT');
  else { g.fillStyle = '#7d909c'; g.textAlign = 'left'; g.fillText('No suit beacon: astronaut not tracked', 8, W - 8); }
}

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
    $('camHint').textContent = 'Rover camera unavailable (run "npm install" so three.js is present). Arrow keys still drive the rover; watch the map.';
  });
}

// ---------- Mission Ops: radio and terminal ----------
function termLine(text, mine) {
  const t = $('term'); if (!t) return;
  const d = document.createElement('div');
  d.textContent = text; if (mine) d.className = 'me';
  t.appendChild(d); t.scrollTop = t.scrollHeight;
}
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
    if (on && !radio.micOk) { termLine('NO MICROPHONE. Open this page on localhost or over HTTPS and allow the mic.'); return; }
    talking = on && radio.micOk; radio.setTalking(talking); paintPtt();
  };
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) talk(true); } });
  addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); talk(false); } });
  const b = $('ptt');
  b.addEventListener('pointerdown', () => talk(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (talking) talk(false); });

  termLine('UPLINK READY.');
  const upload = () => {
    const inp = $('termIn'), code = inp.value.trim();
    if (!code) return;
    termLine('> PATCH ' + code.toUpperCase(), true);
    net.send({ t: 'patch', code });
    inp.value = '';
  };
  $('termGo').onclick = upload;
  $('termIn').addEventListener('keydown', e => { if (e.key === 'Enter') upload(); });
}

// For debugging from the browser console.
window.moonbase = { state: () => state, radio, net, role };
