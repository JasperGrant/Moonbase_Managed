// All game rules. No sockets in here, so it can be tested with plain Node (npm test).
//
// The shape of the game: faults break things, every fault eventually costs oxygen, and oxygen at
// zero is the only way to lose. The astronaut reports physical work (a cell brushed, a point
// welded, a plug seated) with act(); this file alone decides whether it counted.
import { CFG, TOOLS, FAULTS, PLACES, SCRIPTS, MODES, CABLE_COLORS, DUST_CELLS, CRACK_POINTS } from '../client/shared/config.js';
import { fits, sheltered } from '../client/shared/rules.js';

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.seq = 0;
    this.evn = 0;
    this.mode = 'demo';
    this.reset();
  }

  // Back to the lobby. The mode is kept so "Fly again" repeats the same kind of mission.
  reset() {
    this.phase = 'lobby';
    this.timeLeft = CFG.roundSeconds;
    this.o2Max = CFG.o2Start;
    this.oxygen = CFG.o2Start;
    this.score = 0;
    this.battery = 100;
    this.blackout = false;
    this.genLeft = 0;
    this.belt = [];
    this.locker = Object.keys(TOOLS);
    this.tireBackAt = null;
    this.faults = {};          // keyed by type: at most one of each at a time
    this.meteor = null;        // { start, end, hit, after }
    this.script = [];
    this.nextFault = Infinity;
    this.nextMeteor = Infinity;
    this.log = [];
    this.ev = null;
    this.result = null;
    this.stats = { fixed: 0, mistakes: 0, hits: 0, blackouts: 0 };
    this.astro = { x: CFG.spawn.x, z: CFG.spawn.z, ry: Math.PI, h: 1.65 };
    this.rover = { x: PLACES.rover.x, z: PLACES.rover.z, ry: Math.PI, throttle: 0, steer: 0 };
  }

  setMode(mode) {
    if (this.phase !== 'lobby' || !MODES[mode]) return false;
    this.mode = mode;
    return true;
  }

  start() {
    if (this.phase !== 'lobby') return false;
    this.reset();
    this.phase = 'run';
    this.script = [...SCRIPTS[this.mode]].sort((a, b) => a.at - b.at);
    if (this.mode === 'free') {
      this.nextFault = this.script.at(-1).at + this.between(CFG.freeFaultEvery);
      this.nextMeteor = this.between(CFG.freeMeteorEvery);
    }
    this.note('start', `Mission start: ${MODES[this.mode]}.`);
    return true;
  }

  get elapsed() { return CFG.roundSeconds - this.timeLeft; }
  // Radio and consoles work while this is true.
  get powered() { return !this.blackout || this.genLeft > 0; }
  get leaking() { return !!(this.faults.hull || this.faults.suit); }
  // 1 with no leak, 3 with one, 5 with the hull and the suit both leaking.
  get drain() { return 1 + (CFG.leakMultiplier - 1) * ((this.faults.hull ? 1 : 0) + (this.faults.suit ? 1 : 0)); }
  has(tool) { return this.belt.includes(tool); }
  near(p, reach = CFG.reach) { return Math.hypot(this.astro.x - p.x, this.astro.z - p.z) <= reach; }

  tick(dt) {
    if (this.phase !== 'run') return;
    this.timeLeft -= dt;
    const now = this.elapsed;

    // The director: scripted events first, then (free play) random ones.
    while (this.script.length && this.script[0].at <= now) this.fire(this.script.shift());
    if (now >= this.nextFault) {
      const pool = Object.keys(FAULTS).filter(t => !this.faults[t]);
      if (pool.length && Object.keys(this.faults).length < CFG.freeMaxFaults) this.fire({ ev: this.pick(pool) });
      this.nextFault = now + this.between(CFG.freeFaultEvery);
    }
    if (now >= this.nextMeteor) {
      if (!this.meteor) this.fire({ ev: 'meteor', after: this.rng() < CFG.freeHullChance ? ['dust', 'hull'] : ['dust'] });
      this.nextMeteor = now + this.between(CFG.freeMeteorEvery);
    }

    // Meteor shower: hits anyone in the open once the impacts close in, then leaves its damage.
    const m = this.meteor;
    if (m) {
      if (!m.falling && now >= m.start) { m.falling = true; this.note('meteor', 'Meteor shower.'); }
      if (!m.hit && now >= m.start + CFG.meteorGraceSeconds && now < m.end && !sheltered(this.astro, this.rover)) {
        m.hit = true;
        this.oxygen -= CFG.meteorHit;
        this.stats.hits++;
        this.note('hit', 'Caught in the open by the meteor shower. The suit is leaking.', -CFG.meteorHit);
        this.break('suit', true);
      }
      if (now >= m.end) {
        this.meteor = null;
        for (const type of m.after) this.break(type);
      }
    }

    // Rover: it does not move on a broken wheel.
    const r = this.rover;
    if (this.faults.wheel) r.throttle = r.steer = 0;
    r.ry += r.steer * 1.4 * dt;
    r.x += Math.sin(r.ry) * r.throttle * CFG.roverSpeed * dt;
    r.z += Math.cos(r.ry) * r.throttle * CFG.roverSpeed * dt;
    const d = Math.hypot(r.x, r.z);
    if (d > CFG.bounds) { r.x *= CFG.bounds / d; r.z *= CFG.bounds / d; }
    if (d < CFG.habRadius + 1.5 && d > 0) { const k = (CFG.habRadius + 1.5) / d; r.x *= k; r.z *= k; }

    // Power: a power fault drains the battery, and an empty battery blacks the base out.
    const draining = this.faults.dust || this.faults.board;
    this.battery += (draining ? -100 / CFG.batterySeconds : 100 / CFG.rechargeSeconds) * dt;
    this.battery = Math.max(0, Math.min(100, this.battery));
    if (!this.blackout && this.battery <= 0) {
      this.blackout = true;
      this.stats.blackouts++;
      this.note('blackout', 'Battery empty: the base blacked out. No radio, no consoles.');
    } else if (this.blackout && this.battery > CFG.blackoutEndsAt) {
      this.blackout = false;
      this.note('power', 'Power restored.');
    }
    if (this.genLeft > 0) this.genLeft = Math.max(0, this.genLeft - dt);

    if (this.tireBackAt !== null && now >= this.tireBackAt) { this.tireBackAt = null; this.locker.push('tire'); }

    this.oxygen -= CFG.o2DrainPerSec * this.drain * dt;
    if (this.oxygen <= 0) this.end(false, 'Suit oxygen ran out.');
    else if (this.timeLeft <= 0) this.end(true, 'The astronaut made it to the end of the shift.');
  }

  // One director event: a fault, or the radar warning of a meteor shower.
  fire(e) {
    if (e.ev === 'meteor') {
      if (this.meteor) return;
      const start = this.elapsed + CFG.meteorWarnSeconds;
      this.meteor = { start, end: start + CFG.meteorSeconds, hit: false, falling: false, after: e.after || ['dust'] };
    } else this.break(e.ev);
  }

  // Start a fault. A fault that is already active is left alone, except dust, which settles again.
  break(type, quiet = false) {
    if (!FAULTS[type]) return;
    if (type === 'dust' && this.faults.dust) { this.faults.dust.cells.fill(true); return; }
    if (this.faults[type]) return;
    let d = {};
    if (type === 'dust') d = { cells: Array(DUST_CELLS).fill(true) };
    if (type === 'hull') d = { spot: this.int(0, PLACES.cracks.length - 1), welded: Array(CRACK_POINTS).fill(false) };
    if (type === 'wheel') d = { stage: 0 }; // 0 = broken wheel still on, 1 = pulled off
    if (type === 'board') {
      // Each cable belongs in one socket. Three pop out, one stays put.
      const sockets = this.shuffle(CABLE_COLORS.map((_, i) => i));
      const stays = this.int(0, CABLE_COLORS.length - 1);
      d = { cables: CABLE_COLORS.map((color, i) => ({ color, socket: sockets[i], seated: i === stays })) };
    }
    this.faults[type] = d;
    if (!quiet) this.note('alarm', `${FAULTS[type].name}.`);
  }

  // Something the astronaut did. Wrong tool, too far away or nonsense is ignored.
  act(a) {
    if (this.phase !== 'run' || !a || typeof a !== 'object') return;

    if (a.take !== undefined) {
      if (!this.locker.includes(a.take) || !this.near(PLACES.locker) || !fits(this.belt, a.take)) return;
      this.locker = this.locker.filter(t => t !== a.take);
      this.belt.push(a.take);
    } else if (a.stow !== undefined) {
      if (!this.has(a.stow) || !this.near(PLACES.locker)) return;
      this.belt = this.belt.filter(t => t !== a.stow);
      this.locker.push(a.stow);
    } else if (a.gen) {
      // Once per mission: it is used up, so it does not go back in the locker.
      if (!this.has('gen')) return;
      this.belt = this.belt.filter(t => t !== 'gen');
      this.genLeft = CFG.generatorSeconds;
      this.note('gen', `Backup generator started: ${CFG.generatorSeconds} s of power.`);
    } else if (a.fix === 'dust') {
      const f = this.faults.dust;
      if (!f || !this.has('brush') || !PLACES.panels.some(p => this.near(p))) return;
      if (!Number.isInteger(a.cell) || !f.cells[a.cell]) return;
      f.cells[a.cell] = false;
      if (!f.cells.some(Boolean)) this.solve('dust');
    } else if (a.fix === 'board') {
      const f = this.faults.board;
      if (!f || !this.near(PLACES.board)) return;
      const cable = f.cables[a.cable];
      if (!cable || cable.seated || !Number.isInteger(a.socket) || a.socket < 0 || a.socket >= f.cables.length) return;
      if (f.cables.some(c => c.seated && c.socket === a.socket)) return; // that socket is full
      if (cable.socket !== a.socket) return this.mistake('Cable pushed into the wrong socket.', CFG.wrongPlug);
      cable.seated = true;
      if (f.cables.every(c => c.seated)) this.solve('board');
    } else if (a.fix === 'wheel') {
      const f = this.faults.wheel;
      if (!f || !this.near(this.rover)) return;
      if (a.pull && f.stage === 0) f.stage = 1;
      else if (a.fit && f.stage === 1 && this.has('tire')) {
        this.belt = this.belt.filter(t => t !== 'tire'); // it is on the rover now
        this.tireBackAt = this.elapsed + CFG.tireRestockSeconds;
        this.solve('wheel');
      }
    } else if (a.fix === 'hull') {
      const f = this.faults.hull;
      if (!f || !this.has('welder') || !this.near(PLACES.cracks[f.spot])) return;
      if (!Number.isInteger(a.point) || a.point < 0 || a.point >= CRACK_POINTS || f.welded[a.point]) return;
      f.welded[a.point] = true;
      if (f.welded.every(Boolean)) this.solve('hull');
    } else if (a.fix === 'suit') {
      if (!this.faults.suit || !this.has('patch')) return;
      this.solve('suit');
    }
  }

  solve(type) {
    delete this.faults[type];
    this.score += CFG.fixPoints;
    this.stats.fixed++;
    this.note('solve', `${FAULTS[type].name}: fixed.`, 0, CFG.fixPoints);
  }

  mistake(text, cost) {
    this.stats.mistakes++;
    this.oxygen -= cost;
    this.note('mistake', text, -cost);
  }

  end(won, reason) {
    this.phase = 'results';
    this.faults = {};
    this.meteor = null;
    this.rover.throttle = this.rover.steer = 0;
    let bonus = 0;
    if (won) { bonus = Math.max(0, Math.round(this.oxygen)) * 2; this.score += bonus; }
    this.oxygen = Math.max(0, this.oxygen);
    this.result = { won, reason, bonus, ...this.stats };
    this.note('end', reason, 0, bonus);
  }

  // The text goes to the results log only. During the mission nobody is told what broke.
  note(kind, text, o2 = 0, pts = 0) {
    this.log.push({ at: Math.round(this.elapsed), kind, text, o2, pts });
    this.ev = { n: ++this.evn, kind, pts };
  }

  // Readings for the Scientist's gauges.
  solar() {
    const f = this.faults.dust;
    return f ? Math.round(15 + 85 * f.cells.filter(c => !c).length / f.cells.length) : 100;
  }
  boardOut() {
    const f = this.faults.board;
    return f ? Math.round(this.solar() * f.cables.filter(c => c.seated).length / f.cables.length) : this.solar();
  }

  // What can physically be seen out on the surface: the astronaut's eyes and the rover camera.
  scene() {
    const f = this.faults, m = this.meteor;
    return {
      dark: !this.powered,
      dust: f.dust ? [...f.dust.cells] : null,
      // A loose cable does not say where it belongs.
      board: f.board ? f.board.cables.map(c => ({ color: c.color, seated: c.seated, socket: c.seated ? c.socket : -1 })) : null,
      wheel: f.wheel ? f.wheel.stage + 1 : 0, // 0 fine, 1 broken, 2 pulled off
      hull: f.hull ? { spot: f.hull.spot, welded: [...f.hull.welded] } : null,
      meteor: m && m.falling ? this.elapsed - m.start : null,
    };
  }

  // What one role is allowed to know. This is where the missing-information game lives:
  // nobody gets the whole picture.
  view(role, crew = []) {
    const run = this.phase === 'run';
    const v = { t: 'state', n: ++this.seq, phase: this.phase, mode: this.mode, crew, score: this.score, result: this.result, powered: !run || this.powered };
    if (this.phase === 'results') v.log = this.log;

    // A blackout leaves mission control with static and nothing else.
    if (role !== 'astronaut' && !v.powered) return v;

    v.ev = this.ev;
    v.timeLeft = Math.max(0, this.timeLeft);
    v.oxygen = Math.max(0, this.oxygen);
    v.o2Max = this.o2Max;
    const rover = { x: this.rover.x, z: this.rover.z, ry: this.rover.ry };
    const all = role === 'all';

    if (role === 'astronaut') {
      // Hands and eyes: the belt, the locker rack, what is physically there, and the hiss.
      Object.assign(v, { belt: [...this.belt], locker: [...this.locker], scene: this.scene(), suit: !!this.faults.suit, rover });
      return v;
    }
    if (role === 'ops' || all) Object.assign(v, { belt: [...this.belt], locker: [...this.locker] });
    if (role === 'tech' || all) {
      // The rover carries the radar. Its camera still works on a broken wheel.
      v.radar = !this.faults.wheel;
      v.rover = rover;
      v.scene = this.scene();
      v.astro = { ...this.astro }; // drawn by the rover camera; the map only shows it with radar
      if (v.radar && this.meteor) v.meteor = { eta: Math.max(0, this.meteor.start - this.elapsed), falling: this.meteor.falling };
    }
    if (role === 'sci' || all) {
      v.power = { battery: this.battery, solar: this.solar(), board: this.boardOut() };
      v.leak = this.leaking; // one lamp: it does not say where
      v.drain = this.drain;
      // The wiring diagram: only the cables that are out.
      if (this.faults.board) v.wiring = this.faults.board.cables.filter(c => !c.seated).map(c => ({ color: c.color, socket: c.socket }));
    }
    return v;
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  int(lo, hi) { return lo + Math.floor(this.rng() * (hi - lo + 1)); }
  between([lo, hi]) { return lo + this.rng() * (hi - lo); }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}
