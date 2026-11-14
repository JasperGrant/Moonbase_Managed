// The transport-independent half of the server: who is connected, what each role may send,
// the 1.3 s Earth-Moon delay on everything that crosses between the astronaut and mission
// control, and the simulation loop. Both the Node server (server.js) and the Cloudflare
// Durable Object (worker/room.js) drive one of these, so the rules live in exactly one place.
//
// A client is any object the transport hands to add(); the hub sets `role` and `open` on it and
// calls client.send(stringOrBinary). send() must never throw.
import { Game } from './game.js';
import { CFG, ROLES } from '../shared/config.js';

const isControl = role => role === 'ops' || role === 'all';

export class Hub {
  constructor(game = new Game()) {
    this.game = game;
    this.clients = new Set();
    this.last = Date.now();
  }

  live() { return [...this.clients].filter(c => c.open && c.role); }
  crew() { return [...new Set(this.live().map(c => c.role))]; }

  add(client) { client.role = null; client.open = true; this.clients.add(client); }
  remove(client) { client.open = false; this.clients.delete(client); }

  // The delay only applies while a mission is running, so the lobby stays snappy.
  lag() { return this.game.phase === 'run' ? CFG.delayMs : 0; }
  later(ms, fn) { if (ms > 0) setTimeout(fn, ms); else fn(); }
  sendTo(roles, obj, ms) {
    const msg = JSON.stringify(obj);
    for (const c of this.live()) if (roles.includes(c.role)) this.later(ms, () => { if (c.open) c.send(msg); });
  }

  // data is a string for text frames, or an ArrayBuffer / Buffer for binary ones.
  message(ws, data, isBinary) {
    const game = this.game;
    if (!ws.role && isBinary) return;

    // Binary frames are radio audio. Astronaut <-> Mission Ops only, always delayed.
    if (isBinary) {
      if (data.byteLength > 64000) return;
      const to = ws.role === 'astronaut' ? ['ops', 'all'] : isControl(ws.role) ? ['astronaut'] : [];
      for (const c of this.live()) if (c !== ws && to.includes(c.role)) setTimeout(() => { if (c.open) c.send(data); }, CFG.delayMs);
      return;
    }

    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello') { if (ROLES[m.role]) ws.role = m.role; return; }
    if (!ws.role) return;

    if (ws.role === 'astronaut') {
      if (m.t === 'pose' && [m.x, m.z, m.ry].every(Number.isFinite)) game.astro = { x: m.x, z: m.z, ry: m.ry };
      else if (m.t === 'act') game.act(m.id, m.a);
      else if (m.t === 'ptt') this.sendTo(['ops', 'all'], { t: 'ptt', from: 'astronaut', on: !!m.on }, CFG.delayMs);
      return;
    }

    // Everything below comes from Earth, so it reaches the Moon one light-delay later.
    if (m.t === 'rover' && (ws.role === 'tech' || ws.role === 'all')) {
      const throttle = Math.max(-1, Math.min(1, Number(m.throttle) || 0));
      const steer = Math.max(-1, Math.min(1, Number(m.steer) || 0));
      this.later(this.lag(), () => { if (game.phase === 'run') Object.assign(game.rover, { throttle, steer }); });
    } else if (isControl(ws.role)) {
      if (m.t === 'loadout') game.setLoadout(m.vehicle, m.gear);
      else if (m.t === 'start') game.start();
      else if (m.t === 'reset') game.reset();
      else if (m.t === 'ptt') this.sendTo(['astronaut'], { t: 'ptt', from: 'ops', on: !!m.on }, CFG.delayMs);
      else if (m.t === 'patch') {
        const ms = this.lag();
        this.later(ms, () => this.sendTo(['ops', 'all'], { t: 'term', line: game.patch(m.code) }, ms));
      }
    }
  }

  // Call every CFG.tickMs. The astronaut sees the present; mission control sees 1.3 s ago.
  tick() {
    const now = Date.now();
    this.game.tick(Math.min(0.5, (now - this.last) / 1000));
    this.last = now;
    const who = this.crew();
    for (const c of this.live()) {
      const msg = JSON.stringify(this.game.view(c.role, who));
      this.later(c.role === 'astronaut' ? 0 : this.lag(), () => { if (c.open) c.send(msg); });
    }
  }
}

// Clean URLs for the four seats, used by both servers. index.html links to these.
export const PAGES = {
  '/astronaut': '/astronaut.html',
  '/ops': '/console.html',
  '/tech': '/console.html',
  '/sci': '/console.html',
  '/control': '/console.html',
};
