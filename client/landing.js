// The landing page. The base in 3D behind a choice of 2 or 4 players. The first person to choose
// sets the game for everyone; anyone after them is offered to join it. A laptop then picks a seat;
// a headset is always the Astronaut and goes straight there, as soon as a game is chosen by anyone.
import { createLobby } from '/lobby.js';
import { startBackdrop } from '/backdrop.js';
import { isHeadset, keepDevice } from '/device.js';
import { ROLES } from '/shared/config.js';

const $ = id => document.getElementById(id);
const URLS = { astronaut: '/astronaut', ops: '/ops', sci: '/sci', tech: '/tech', all: '/control' };
const seatName = r => r === 'all' ? 'Mission Operator' : ROLES[r];
const list = names => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);

let headset = null;   // null until known
let seats = null;     // the server's answer to /seats
let picking = false;  // the seat picker is open
let lobby = null, note = '', choosing = false;

const backdrop = startBackdrop($('scene'), {
  onReady: () => document.body.classList.add('live'),
  onGiveUp: () => document.body.classList.remove('live'),
});

isHeadset().then(h => { headset = h; document.body.classList.toggle('headset', h); render(); });

const goAstronaut = () => location.assign(keepDevice('/astronaut'));

// ---------- choosing 2 or 4 ----------
for (const b of document.querySelectorAll('[data-players]')) b.addEventListener('click', () => choose(Number(b.dataset.players)));
async function choose(n) {
  if (choosing) return;
  choosing = true; render();
  backdrop.pause(true); // stop drawing: the next page should not wait behind a frame of the scene
  try {
    const r = await fetch('/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players: n }) });
    seats = await r.json();
  } catch {
    choosing = false; backdrop.pause(false); $('status').textContent = 'Could not reach the base. Try again.'; render(); return;
  }
  choosing = false;
  if (headset) { goAstronaut(); return; }
  // Someone else chose a moment earlier: join their game instead.
  note = seats.players !== n ? `Someone has just started a ${seats.players}-player game. Join it here.` : '';
  openPicker();
}

// ---------- the seat picker ----------
function openPicker() {
  if (!seats?.players) return;
  picking = true;
  backdrop.pause(true);
  if (!lobby) lobby = createLobby($('lobby'), { players: seats.players, onPick: (r, players) => location.assign(URLS[players === 2 && r === 'ops' ? 'all' : r]) });
  render();
}
function closePicker() { picking = false; note = ''; backdrop.pause(false); render(); }
$('back').addEventListener('click', closePicker);
$('joinBtn').addEventListener('click', openPicker);

// ---------- drawing ----------
function render() {
  $('headsetNote').hidden = !headset;
  if (seats?.players && headset) { backdrop.pause(true); goAstronaut(); return; } // a game is chosen: the headset is the Astronaut
  if (picking && !seats?.players) picking = false;       // the game was reset while the picker was open
  $('front').hidden = picking;
  $('lobby').hidden = !picking;
  $('back').hidden = !picking;
  if (picking) { lobby.update(seats); if (note) lobby.note?.(note); return; }

  const p = seats?.players;
  $('choose').hidden = !seats || !!p;
  $('join').hidden = !p;
  for (const b of document.querySelectorAll('[data-players]')) b.disabled = choosing;
  if (!seats) { $('status').textContent = 'Connecting to the base...'; return; }
  $('status').textContent = '';
  if (!p) return;
  const open = seats.seats.filter(r => !seats.taken.includes(r));
  const running = seats.phase !== 'lobby';
  $('joinText').textContent = running ? `A ${p}-player mission is under way.` : `A ${p}-player game is being set up.`;
  $('joinOpen').textContent = open.length ? `Open: ${list(open.map(seatName))}.` : 'Every seat is taken.';
  $('joinBtn').hidden = !open.length;
  $('joinBtn').textContent = `Join the ${p}-player game`;
}

async function refresh() {
  try { seats = await (await fetch('/seats', { cache: 'no-store' })).json(); } catch { return; }
  render();
}
refresh(); setInterval(refresh, 1000);
