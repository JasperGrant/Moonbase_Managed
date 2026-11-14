// The transport-independent half of the server: who is connected, what each role may send,
// the 1.3 s Earth-Moon delay on everything that crosses between the astronaut and mission
// control, and the simulation loop. Both the Node server (server.js) and the Cloudflare
// Durable Object (worker/room.js) drive one of these, so the rules live in exactly one place.
//
// A client is any object the transport hands to add(); the hub sets `role` and `open` on it and
// calls client.send(stringOrBinary). send() must never throw.
import { Game } from './game.js';
import { CFG, ROLES, CREW, covers } from '../client/shared/config.js';

const isControl = role => role === 'ops' || role === 'all';

export class Hub {
  constructor(game = new Game(), opts = {}) {
    this.game = game;
    this.clients = new Set();
    this.last = Date.now();
    this.requireFullCrew = opts.requireFullCrew ?? CFG.lobby.requireFullCrew;
    this.ready = new Set();   // seats that pressed Ready, by role as held ('all' in 2-player mode)
    this.countdown = null;    // seconds until the mission starts, while everyone is ready
  }

  live() { return [...this.clients].filter(c => c.open && c.role); }
  crew() { return [...new Set(this.live().map(c => c.role))]; }

  // One person per seat. The all-in-one console counts as Ops, Tech and Sci at once.
  taken(role) {
    const crew = this.crew();
    if (crew.includes(role)) return true;
    if (role === 'all') return ['ops', 'tech', 'sci'].some(r => crew.includes(r));
    return crew.includes('all') && ['ops', 'tech', 'sci'].includes(role);
  }
  // For the landing page: which seats are free right now.
  seats() { return { crew: this.crew(), taken: Object.keys(ROLES).filter(r => this.taken(r)), phase: this.game.phase, ready: [...this.ready], countdown: this.countdown }; }

  // Lobby: the mission starts by itself once every role is held and every seat is ready.
  // With requireFullCrew off, any crew that is all ready will do (one developer testing alone).
  allReady() {
    const crew = this.crew();
    if (!crew.length || !crew.every(r => this.ready.has(r))) return false;
    return !this.requireFullCrew || CREW.every(r => crew.some(h => covers(h, r)));
  }
  lobbyTick(dt) {
    if (this.game.phase !== 'lobby' || !this.allReady()) { this.countdown = null; return; }
    if (this.countdown === null) { this.countdown = CFG.lobby.countdownSeconds; return; }
    this.countdown -= dt;
    if (this.countdown <= 0) { this.countdown = null; this.ready.clear(); this.game.start(); }
  }

  add(client) { client.role = null; client.open = true; this.clients.add(client); }
  remove(client) {
    client.open = false;
    this.clients.delete(client);
    if (client.role && !this.crew().includes(client.role)) this.ready.delete(client.role); // their panel goes grey
    if (!this.allReady()) this.countdown = null;
  }

  // True while the base is blacked out: no radio, no commands.
  silent() { return this.game.phase === 'run' && !this.game.powered; }

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
    // A blackout kills the radio in both directions.
    if (isBinary) {
      if (data.byteLength > 64000 || this.silent()) return;
      const to = ws.role === 'astronaut' ? ['ops', 'all'] : isControl(ws.role) ? ['astronaut'] : [];
      for (const c of this.live()) if (c !== ws && to.includes(c.role)) setTimeout(() => { if (c.open) c.send(data); }, CFG.delayMs);
      return;
    }

    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello') {
      if (!ROLES[m.role]) return;
      if (this.taken(m.role)) { ws.send(JSON.stringify({ t: 'taken', role: m.role })); return; }
      ws.role = m.role;
      return;
    }
    if (!ws.role) return;

    if (m.t === 'ready') {
      if (game.phase !== 'lobby') return;
      if (m.on) this.ready.add(ws.role); else this.ready.delete(ws.role);
      if (!this.allReady()) this.countdown = null;
      return;
    }

    if (ws.role === 'astronaut') {
      // h is the head height in metres: crouching is how you take cover beside the rover.
      if (m.t === 'pose' && [m.x, m.z, m.ry].every(Number.isFinite)) game.astro = { x: m.x, z: m.z, ry: m.ry, h: Number.isFinite(m.h) ? m.h : 1.65 };
      else if (m.t === 'do') game.act(m.a);
      else if (m.t === 'ptt' && (!m.on || !this.silent())) this.sendTo(['ops', 'all'], { t: 'ptt', from: 'astronaut', on: !!m.on }, CFG.delayMs);
      return;
    }

    // Everything below comes from Earth, so it reaches the Moon one light-delay later.
    // Nothing from Earth gets through a blackout except a released talk key and starting over.
    if (this.silent() && m.t !== 'reset' && !(m.t === 'ptt' && !m.on)) return;
    if (m.t === 'rover' && (ws.role === 'tech' || ws.role === 'all')) {
      const throttle = Math.max(-1, Math.min(1, Number(m.throttle) || 0));
      const steer = Math.max(-1, Math.min(1, Number(m.steer) || 0));
      this.later(this.lag(), () => { if (game.phase === 'run') Object.assign(game.rover, { throttle, steer }); });
    } else if (isControl(ws.role)) {
      if (m.t === 'mode') game.setMode(m.mode);
      else if (m.t === 'start' && !this.requireFullCrew) game.start(); // normally the crew starts it by readying up
      else if (m.t === 'reset') { game.reset(); this.ready.clear(); this.countdown = null; }
      else if (m.t === 'ptt') this.sendTo(['astronaut'], { t: 'ptt', from: 'ops', on: !!m.on }, CFG.delayMs);
    }
  }

  // Call every CFG.tickMs. The astronaut sees the present; mission control sees 1.3 s ago.
  tick() {
    const now = Date.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.lobbyTick(dt);
    this.game.tick(dt);
    this.last = now;
    const who = this.crew(), ready = [...this.ready], countdown = this.countdown;
    for (const c of this.live()) {
      const msg = JSON.stringify({ ...this.game.view(c.role, who), ready, countdown });
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
