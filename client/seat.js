// Full-screen notices from the server: this seat is taken, or the admin removed you.
import { ROLES } from '/shared/config.js';

export function seatTaken(role) {
  document.exitPointerLock?.();
  const el = document.createElement('div');
  el.id = 'taken';
  el.innerHTML = `<div><h1>SEAT TAKEN</h1><p>Someone is already <b>${ROLES[role] || role}</b>. Pick another seat.</p><a href="/">Back to the seats</a></div>`;
  document.body.appendChild(el);
}

export function kicked() {
  document.exitPointerLock?.();
  const el = document.createElement('div');
  el.id = 'taken';
  el.innerHTML = `<div><h1>REMOVED</h1><p>The admin cleared this seat. If that was a mistake, just take it again.</p><a href="/">Back to the seats</a></div>`;
  document.body.appendChild(el);
}
