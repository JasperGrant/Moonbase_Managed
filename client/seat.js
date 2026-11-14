// Shown when the server says someone already has this seat. One person per role.
import { ROLES } from '/shared/config.js';

export function seatTaken(role) {
  document.exitPointerLock?.();
  const el = document.createElement('div');
  el.id = 'taken';
  el.innerHTML = `<div><h1>SEAT TAKEN</h1><p>Someone is already <b>${ROLES[role] || role}</b>. Pick another seat.</p><a href="/">Back to the seats</a></div>`;
  document.body.appendChild(el);
}
