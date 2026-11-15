// The transport-independent half of the server: who is connected, what each role may send,
// the optional Earth-Moon delay (off unless the admin turns it on) on what crosses between the astronaut and mission
// control, and the simulation loop. Both the Node server (server.js) and the Cloudflare
// Durable Object (worker/room.js) drive one of these, so the rules live in exactly one place.
//
// A client is any object the transport hands to add(); the hub sets `role` and `open` on it and
// calls client.send(stringOrBinary). send() must never throw.
import { Game } from './game.js';
import { CFG, ROLES, CREW, PLAYERS, covers } from '../client/shared/config.js';

const isControl = role => role === 'ops' || role === 'all';

// One hand from a pose message: [x, y, z] in metres, within reach of the body, or null.
function arm(a) {
  if (!Array.isArray(a) || a.length !== 3 || !a.every(Number.isFinite)) return null;
  const [x, y, z] = a;
  return Math.abs(x) <= 1.2 && y >= -0.2 && y <= 2.6 && Math.abs(z) <= 1.2 ? [x, y, z] : null;
}

export class Hub {
  constructor(game = new Game(), opts = {}) {
    this.game = game;
    this.clients = new Set();
    this.last = Date.now();
    this.requireFullCrew = opts.requireFullCrew ?? CFG.lobby.requireFullCrew;
    this.ready = new Set();   // seats that pressed Ready, by role as held ('all' in 2-player mode)
    this.countdown = null;    // seconds until the mission starts, while everyone is ready
    this.delayOn = false;     // the Earth-Moon delay on comms and the rover: off unless the admin turns it on
    this.suited = false;      // the astronaut has the headset on (or is playing on the screen): Ops can call them GO
    this.timeScale = opts.timeScale || 1; // below 1, the mission clock runs slow (the smoke test on a slow machine)
    this.adminKey = opts.adminKey || null; // when set, /admin needs this key (ADMIN_KEY in the environment)
    this.now = opts.now || Date.now;        // a clock the tests can move
    this.players = null;                    // 2 or 4, chosen once per game on the landing page; null until then
    this.busy = this.now();                 // last time anyone held a seat, or the game was chosen
  }

  // ---- 2 or 4 players ----
  // The first choice wins; a different one after that is ignored, and the caller is told what was set.
  choosePlayers(n) {
    this.expire();
    n = Number(n);
    if (!this.players && PLAYERS[n]) { this.players = n; this.busy = this.now(); }
    return this.seats();
  }
  // Can this role be taken? true, or why not: 'nomode' (nobody has chosen 2 or 4 players yet) or
  // 'wrongseat' (the game does not have that seat). With requireFullCrew off (one developer testing
  // alone, and the VR test) any seat may be taken before a choice is made.
  seatOk(role) {
    if (!this.players) return this.requireFullCrew ? 'nomode' : true;
    return PLAYERS[this.players].includes(role) ? true : 'wrongseat';
  }
  // Forget the choice. Anyone still seated is sent back to the landing page, where it is made again.
  clearPlayers() {
    const was = this.players;
    this.players = null; this.ready.clear(); this.countdown = null; this.busy = this.now();
    if (!was) return;
    for (const c of this.live()) {
      this.remove(c);
      try { c.send(JSON.stringify({ t: 'home' })); } catch {}
      try { c.close?.(); } catch {}
    }
  }
  // A game chosen but empty for emptyModeSeconds is forgotten. Checked whenever anyone asks, so it
  // also works on Cloudflare, where nothing ticks while nobody is connected.
  expire() {
    if (this.crew().length || this.game.phase !== 'lobby') { this.busy = this.now(); return; }
    if (this.players && this.now() - this.busy >= CFG.lobby.emptyModeSeconds * 1000) this.clearPlayers();
  }
  // Back to the start: a fresh game, and 2 or 4 players chosen again.
  resetGame() { this.game.reset(); this.clearPlayers(); }

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
  seats() {
    this.expire();
    return { crew: this.crew(), taken: Object.keys(ROLES).filter(r => this.taken(r)), phase: this.game.phase, ready: [...this.ready], countdown: this.countdown, suited: this.suited,
      players: this.players, seats: this.players ? PLAYERS[this.players] : null };
  }

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

  add(client) { client.role = null; client.admin = false; client.open = true; client.since = Date.now(); this.clients.add(client); }
  remove(client) {
    client.open = false;
    this.clients.delete(client);
    if (client.role && !this.crew().includes(client.role)) this.ready.delete(client.role); // their panel goes grey
    if (!this.crew().includes('astronaut')) { this.suited = false; this.ready.delete('astronaut'); }
    if (!this.allReady()) this.countdown = null;
  }

  // ---- the admin console (/admin): not a seat, sees everything undelayed, can start, reset and kick ----
  admins() { return [...this.clients].filter(c => c.open && c.admin); }
  // Drop every connection holding a seat. The seat is free the instant this returns, whether or not
  // the far end ever answers the close: that is the fix for "taken, but nobody is there".
  kick(role) {
    let n = 0;
    for (const c of [...this.clients]) if (c.role === role) {
      this.remove(c);
      try { c.send(JSON.stringify({ t: 'kicked' })); } catch {}
      try { c.close?.(); } catch {}
      n++;
    }
    return n;
  }
  command(m) {
    const game = this.game;
    if (m.cmd === 'start') { // start now, whoever is or is not ready; from results or mid-run it is a restart
      if (game.phase !== 'lobby') game.reset();
      this.ready.clear(); this.countdown = null;
      game.start();
    } else if (m.cmd === 'reset') this.resetGame();
    else if (m.cmd === 'clearplayers') this.clearPlayers();
    else if (m.cmd === 'kick' && typeof m.role === 'string') this.kick(m.role);
    else if (m.cmd === 'kickall') for (const r of Object.keys(ROLES)) this.kick(r);
    else if (m.cmd === 'mode') game.setMode(m.mode);
    else if (m.cmd === 'delay') this.delayOn = !!m.on;
  }
  adminView(who) {
    const connections = [...this.clients].filter(c => c.open).map(c => ({ role: c.admin ? 'admin' : c.role, since: c.since }));
    return { ...this.game.view('all', who), ready: [...this.ready], countdown: this.countdown, suited: this.suited, players: this.players, admin: { seats: this.seats(), connections, keyed: !!this.adminKey, delay: this.delayOn } };
  }

  // True while the base is blacked out: no radio, no commands.
  silent() { return this.game.phase === 'run' && !this.game.powered; }

  // The delay only applies while a mission is running, so the lobby stays snappy.
  lag() { return this.delayOn && this.game.phase === 'run' ? CFG.delayMs : 0; }
  radioLag() { return this.delayOn ? CFG.delayMs : 0; }
  later(ms, fn) { if (ms > 0) setTimeout(fn, ms); else fn(); }
  sendTo(roles, obj, ms) {
    const msg = JSON.stringify(obj);
    for (const c of this.live()) if (roles.includes(c.role)) this.later(ms, () => { if (c.open) c.send(msg); });
  }

  // data is a string for text frames, or an ArrayBuffer / Buffer for binary ones.
  message(ws, data, isBinary) {
    const game = this.game;
    if (!ws.role && isBinary) return;

    // Binary frames are radio audio. Astronaut <-> Mission Ops only, delayed only if the admin turned the delay on.
    // A blackout kills the radio in both directions.
    if (isBinary) {
      if (data.byteLength > 64000 || this.silent()) return;
      const to = ws.role === 'astronaut' ? ['ops', 'all'] : isControl(ws.role) ? ['astronaut'] : [];
      for (const c of this.live()) if (c !== ws && to.includes(c.role)) this.later(this.radioLag(), () => { if (c.open) c.send(data); });
      return;
    }

    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'hello') {
      if (m.role === 'admin') {
        if (this.adminKey && m.key !== this.adminKey) { ws.send(JSON.stringify({ t: 'denied' })); return; }
        ws.admin = true;
        return;
      }
      if (!ROLES[m.role]) return;
      this.expire();
      const ok = this.seatOk(m.role);
      if (ok !== true) { ws.send(JSON.stringify({ t: 'refused', role: m.role, why: ok, players: this.players })); return; }
      if (this.taken(m.role)) { ws.send(JSON.stringify({ t: 'taken', role: m.role })); return; }
      ws.role = m.role;
      this.busy = this.now();
      return;
    }
    if (ws.admin) { if (m.t === 'admin') this.command(m); return; }
    if (!ws.role) return;

    // The astronaut does not ready themselves: Mission Ops calls them GO, once they are suited up
    // (the headset is on). Taking the headset off stands them down again.
    if (m.t === 'suited' && ws.role === 'astronaut') {
      this.suited = !!m.on;
      if (!this.suited) { this.ready.delete('astronaut'); if (!this.allReady()) this.countdown = null; }
      return;
    }
    if (m.t === 'ready') {
      if (game.phase !== 'lobby') return;
      let role = ws.role;
      if (m.for === 'astronaut') {
        if (!isControl(ws.role) || !this.crew().includes('astronaut') || (m.on && !this.suited)) return;
        role = 'astronaut';
      } else if (ws.role === 'astronaut') return;
      if (m.on) this.ready.add(role); else this.ready.delete(role);
      if (!this.allReady()) this.countdown = null;
      return;
    }

    // Leaving the debrief: any seat, the astronaut's cuff included, takes the crew back to the lobby.
    // Only from the results, so nobody scrubs a running mission by accident. The others keep their
    // own copy of the results on screen until they leave too.
    if (m.t === 'lobby') {
      if (game.phase === 'results') { game.reset(); this.ready.clear(); this.countdown = null; }
      return;
    }

    if (ws.role === 'astronaut') {
      // h is the head height in metres: crouching is how you take cover beside the rover.
      // arms: where each hand is in the body's frame (x right, y up from the floor, z forward), for the
      // rover camera's figure. Anything that is not three sensible numbers is a hand not being tracked.
      if (m.t === 'pose' && [m.x, m.z, m.ry].every(Number.isFinite)) game.astro = { x: m.x, z: m.z, ry: m.ry, h: Number.isFinite(m.h) ? m.h : 1.65, inside: !!m.inside, door: typeof m.door === 'string' ? m.door.slice(0, 2) : null, arms: [0, 1].map(i => arm(m.arms?.[i])) };
      else if (m.t === 'do') game.act(m.a);
      else if (m.t === 'ptt' && (!m.on || !this.silent())) this.sendTo(['ops', 'all'], { t: 'ptt', from: 'astronaut', on: !!m.on }, this.radioLag());
      return;
    }

    // Everything below comes from Earth: with the delay on, it reaches the Moon one light-delay later.
    // Nothing from Earth gets through a blackout except a released talk key and starting over.
    if (this.silent() && m.t !== 'reset' && !(m.t === 'ptt' && !m.on)) return;
    if (m.t === 'rover' && (ws.role === 'tech' || ws.role === 'all')) {
      const throttle = Math.max(-1, Math.min(1, Number(m.throttle) || 0));
      const steer = Math.max(-1, Math.min(1, Number(m.steer) || 0));
      this.later(this.lag(), () => { if (game.phase === 'run') Object.assign(game.rover, { throttle, steer }); });
    } else if (isControl(ws.role)) {
      if (m.t === 'mode') game.setMode(m.mode);
      else if (m.t === 'start' && !this.requireFullCrew) game.start(); // normally the crew starts it by readying up
      else if (m.t === 'reset') this.resetGame();
      else if (m.t === 'ptt') this.sendTo(['astronaut'], { t: 'ptt', from: 'ops', on: !!m.on }, this.radioLag());
    }
  }

  // Call every CFG.tickMs. With the delay on, mission control sees the base one light-delay late.
  tick() {
    const now = Date.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.expire();
    this.lobbyTick(dt);
    this.game.tick(dt * this.timeScale);
    this.last = now;
    const who = this.crew(), ready = [...this.ready], countdown = this.countdown, suited = this.suited, players = this.players;
    for (const c of this.live()) {
      const msg = JSON.stringify({ ...this.game.view(c.role, who), ready, countdown, suited, players });
      this.later(c.role === 'astronaut' ? 0 : this.lag(), () => { if (c.open) c.send(msg); });
    }
    const admins = this.admins();
    if (admins.length) { const msg = JSON.stringify(this.adminView(who)); for (const c of admins) c.send(msg); } // no delay: this is the referee
  }
}

// Clean URLs for the four seats, used by both servers. index.html links to these.
export const PAGES = {
  '/astronaut': '/astronaut.html',
  '/ops': '/console.html',
  '/tech': '/console.html',
  '/sci': '/console.html',
  '/control': '/console.html',
  '/admin': '/admin.html',
};
