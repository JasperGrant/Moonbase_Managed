// Full-screen notices from the server: this seat is taken, not in this game, or the admin removed you.
import { ROLES } from '/shared/config.js';
import { keepDevice } from '/device.js';

export function seatTaken(role) {
  document.exitPointerLock?.();
  const el = document.createElement('div');
  el.id = 'taken';
  el.innerHTML = `<div><h1>SEAT TAKEN</h1><p>Someone is already <b>${ROLES[role] || role}</b>. Pick another seat.</p><a href="/">Back to the seats</a></div>`;
  document.body.appendChild(el);
}

// The server refused the seat. No game chosen yet: go to the landing page to choose one.
// A seat this game does not have (the Scientist in a 2-player game, say): say so, and link back.
export function seatRefused(m) {
  if (m.why === 'nomode') { location.replace(keepDevice('/')); return; }
  document.exitPointerLock?.();
  const el = document.createElement('div');
  el.id = 'taken';
  const what = m.players === 2 ? 'a 2-player game, which has the Astronaut and one Mission Operator' : 'a 4-player game, where each role has its own seat';
  el.innerHTML = `<div><h1>NOT IN THIS GAME</h1><p><b>${ROLES[m.role] || m.role}</b> is not a seat in ${what}.</p><a href="${keepDevice('/')}">Back to the start</a></div>`;
  document.body.appendChild(el);
}

export function kicked() {
  document.exitPointerLock?.();
  const el = document.createElement('div');
  el.id = 'taken';
  el.innerHTML = `<div><h1>REMOVED</h1><p>The admin cleared this seat. If that was a mistake, just take it again.</p><a href="/">Back to the seats</a></div>`;
  document.body.appendChild(el);
}
