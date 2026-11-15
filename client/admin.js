// The admin console at /admin. A fifth, non-playing connection: it sees the full undelayed state and
// can start or restart the mission, send everyone back to the lobby, and kick a seat free.
import { connect } from '/net.js';
import { ROLES, MODES } from '/shared/config.js';
import '/music.js'; // the theme plays here too

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// The key, if the server wants one: ?key=... in the URL, or the one typed last time.
const params = new URLSearchParams(location.search);
const key = params.get('key') || localStorage.getItem('moonbase-admin-key') || undefined;
if (params.get('key')) { localStorage.setItem('moonbase-admin-key', params.get('key')); history.replaceState(null, '', location.pathname); }

const net = connect('admin', { key });
let state = null;

net.onDenied = () => { $('adminGate').hidden = false; $('key').focus(); };
$('keyForm').onsubmit = e => { e.preventDefault(); localStorage.setItem('moonbase-admin-key', $('key').value); location.reload(); };
setInterval(() => { $('link').textContent = net.open ? '' : 'NO LINK TO SERVER'; }, 500);

const cmd = (c, extra = {}) => net.send({ t: 'admin', cmd: c, ...extra });
for (const m in MODES) $('mode').insertAdjacentHTML('beforeend', `<option value="${m}">${esc(MODES[m])}</option>`);
$('mode').onchange = () => cmd('mode', { mode: $('mode').value });
$('delay').onchange = () => cmd('delay', { on: $('delay').checked });
$('roverFaults').onchange = () => cmd('roverFaults', { on: $('roverFaults').checked });
$('allReal').onchange = () => cmd('allReal', { on: $('allReal').checked });
$('labready').onclick = () => cmd('labready');
$('start').onclick = () => { if (state?.phase !== 'run' || confirm('A mission is running. Restart it from the top?')) cmd('start'); };
$('reset').onclick = () => { if (state?.phase !== 'run' || confirm('Stop the running mission and send everyone back to the landing page?')) cmd('reset'); };
$('clearplayers').onclick = () => { if (!state?.admin.seats.crew.length || confirm('Everyone seated goes back to the landing page to choose 2 or 4 players again. Go ahead?')) cmd('clearplayers'); };
$('kickall').onclick = () => { if (confirm('Drop every player? They can rejoin straight away.')) cmd('kickall'); };
$('seats').onclick = e => { const b = e.target.closest('button[data-kick]'); if (b) cmd('kick', { role: b.dataset.kick }); };

const SEATS = ['astronaut', 'ops', 'tech', 'sci', 'all'];
let seatsKey = '', connsKey = '';
net.onState = s => {
  state = s;
  const a = s.admin;
  $('phase').textContent = s.phase.toUpperCase();
  $('clock').textContent = s.phase === 'run' && Number.isFinite(s.timeLeft) ? clock(s.timeLeft) : '-:--';
  $('score').textContent = s.score;
  $('power').textContent = s.phase === 'run' ? (s.powered ? 'ON' : 'BLACKOUT') : '-';
  $('power').style.color = s.phase === 'run' && !s.powered ? 'var(--red)' : '';
  if (document.activeElement !== $('mode') && s.mode) $('mode').value = s.mode;
  if (document.activeElement !== $('delay')) $('delay').checked = !!a.delay;
  if (document.activeElement !== $('roverFaults')) $('roverFaults').checked = !!a.roverFaults;
  if (document.activeElement !== $('allReal')) $('allReal').checked = !!a.allReal;
  $('mode').disabled = s.phase !== 'lobby';
  $('labready').hidden = !(s.phase === 'run' && s.mode === 'real');
  $('start').textContent = s.phase === 'run' ? 'Restart now' : 'Start now';
  $('players').textContent = s.players ? `${s.players}-player game.` : 'No game chosen yet: the first visitor to the landing page picks 2 or 4 players.';
  $('clearplayers').hidden = !s.players;
  $('countdown').textContent = s.countdown != null ? `Everyone is ready: starting in ${Math.ceil(s.countdown)} s.` : s.phase === 'lobby' ? `Ready: ${s.ready.length ? s.ready.map(r => ROLES[r]).join(', ') : 'nobody yet'}.` : '';

  const k = JSON.stringify([a.seats, s.ready]);
  if (k !== seatsKey) {
    seatsKey = k;
    $('seats').innerHTML = '<tr><th>Seat</th><th>Status</th><th></th></tr>' + SEATS.map(r => {
      const held = a.seats.crew.includes(r), blocked = !held && a.seats.taken.includes(r), ready = s.ready.includes(r);
      const status = held ? (ready ? '<i class="on">READY</i>' : '<i class="on">ONLINE</i>') : blocked ? (r === 'all' ? '<i>blocked: a single console is in</i>' : '<i>covered by Mission Control</i>') : '<i>free</i>';
      return `<tr><td>${esc(ROLES[r])}</td><td>${status}</td><td>${held ? `<button class="ghost danger" data-kick="${r}">Kick</button>` : ''}</td></tr>`;
    }).join('');
  }
  const now = Date.now();
  const ck = a.connections.map(c => c.role + Math.floor((now - c.since) / 5000)).join();
  if (ck !== connsKey) {
    connsKey = ck;
    $('conns').innerHTML = a.connections.length
      ? a.connections.map(c => `<li><span>${esc(c.role === 'admin' ? 'admin' : ROLES[c.role] || 'choosing a seat')}</span><span class="d">${Math.round((now - c.since) / 1000)} s</span></li>`).join('')
      : '<li class="empty">nobody connected</li>';
  }
  $('resultPanel').hidden = s.phase !== 'results';
  if (s.phase === 'results' && s.result) $('result').innerHTML = `<p class="verdict ${s.result.won ? 'won' : 'lost'}">${s.result.won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</p><p class="brief">${esc(s.result.reason)} Score ${s.score}.</p>`;
};
