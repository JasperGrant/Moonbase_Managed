// All game rules. No sockets in here, so it can be tested with plain Node (npm test).
import { CFG, VEHICLES, GEAR, ISSUES } from '../client/shared/config.js';
import { solveWires, WIRE_COLORS, ROCK_COLORS, CODE_CHARS } from '../client/shared/rules.js';

const TYPES = Object.keys(ISSUES);

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.seq = 0;
    this.evn = 0;
    this.loadout = { vehicle: CFG.defaultVehicle, gear: [...CFG.defaultGear] };
    this.reset();
  }

  // Back to the lobby. The loadout is kept so "Fly again" starts from the last plan.
  reset() {
    this.phase = 'lobby';
    this.timeLeft = CFG.roundSeconds;
    this.o2Max = 100;
    this.oxygen = 100;
    this.score = 0;
    this.issues = [];
    this.log = [];
    this.ev = null;
    this.result = null;
    this.nextId = 1;
    this.nextSpawn = CFG.firstSpawnAt;
    this.lastType = null;
    this.spawned = 0;
    this.freeMistake = false;
    this.stats = { fixed: 0, missed: 0, mistakes: 0 };
    this.astro = { x: CFG.spawn.x, z: CFG.spawn.z, ry: Math.PI };
    this.rover = { x: 4, z: 9, ry: Math.PI, throttle: 0, steer: 0 };
  }

  setLoadout(vehicle, gear) {
    if (this.phase !== 'lobby' || !VEHICLES[vehicle] || !Array.isArray(gear)) return false;
    const clean = [...new Set(gear)].filter(g => GEAR[g]);
    const mass = clean.reduce((m, g) => m + GEAR[g].mass, 0);
    if (mass > VEHICLES[vehicle].cap) return false;
    this.loadout = { vehicle, gear: clean };
    return true;
  }

  start() {
    if (this.phase !== 'lobby') return false;
    const { vehicle, gear } = this.loadout;
    this.reset();
    this.phase = 'run';
    this.o2Max = VEHICLES[vehicle].o2 + (gear.includes('o2') ? 25 : 0);
    this.oxygen = this.o2Max;
    this.freeMistake = gear.includes('diag');
    this.note('start', `Mission start: ${VEHICLES[vehicle].name}, ${gear.map(g => GEAR[g].name).join(', ') || 'no gear'}.`);
    return true;
  }

  get elapsed() { return CFG.roundSeconds - this.timeLeft; }

  tick(dt) {
    if (this.phase !== 'run') return;
    this.timeLeft -= dt;
    this.oxygen -= CFG.o2DrainPerSec * dt;

    for (const is of [...this.issues]) {
      is.left -= dt;
      if (is.left <= 0) {
        this.issues = this.issues.filter(i => i !== is);
        this.oxygen -= CFG.missPenalty;
        this.stats.missed++;
        this.note('miss', `${ISSUES[is.type].title}: ran out of time.`, -CFG.missPenalty);
      }
    }

    if (this.elapsed >= this.nextSpawn && this.issues.length < CFG.maxActive && this.timeLeft > 15) this.spawn();

    const r = this.rover;
    r.ry += r.steer * 1.4 * dt;
    r.x += Math.sin(r.ry) * r.throttle * CFG.roverSpeed * dt;
    r.z += Math.cos(r.ry) * r.throttle * CFG.roverSpeed * dt;
    const d = Math.hypot(r.x, r.z);
    if (d > CFG.bounds) { r.x *= CFG.bounds / d; r.z *= CFG.bounds / d; }
    if (d < CFG.habRadius + 1.5 && d > 0) { const k = (CFG.habRadius + 1.5) / d; r.x *= k; r.z *= k; }

    if (this.oxygen <= 0) this.end(false, 'Suit oxygen ran out.');
    else if (this.timeLeft <= 0) this.end(true, 'The astronaut made it back to the airlock.');
  }

  spawn() {
    const busy = this.issues.map(i => i.type);
    let pool = TYPES.filter(t => !busy.includes(t));
    if (pool.length > 1) pool = pool.filter(t => t !== this.lastType);
    if (!pool.length) return;
    const type = this.spawned === 0 && pool.includes(CFG.firstIssue) ? CFG.firstIssue : this.pick(pool);
    const is = { id: this.nextId++, type, left: CFG.issueSeconds, total: CFG.issueSeconds, d: this.makeData(type) };
    this.issues.push(is);
    this.spawned++;
    this.lastType = type;
    this.nextSpawn = this.elapsed + CFG.spawnEvery;
    this.note('spawn', `Alarm: ${ISSUES[type].title}.`);
  }

  makeData(type) {
    if (type === 'wires') {
      const n = this.rng() < 0.5 ? 4 : 5;
      const colors = Array.from({ length: n }, () => this.pick(WIRE_COLORS));
      const serial = this.pick([...'ABCDEFGHJKLMNPQRSTUVWXYZ']) + this.int(0, 9) + this.pick([...'ABCDEFGHJKLMNPQRSTUVWXYZ']) + this.int(0, 9);
      const pressure = this.rng() < 0.5 ? 'HIGH' : 'LOW';
      return { colors, serial, pressure, cut: [], answer: solveWires({ colors, serial, pressure }) };
    }
    if (type === 'freq') {
      const target = this.int(5, 94);
      let value = this.int(0, 99);
      while (Math.abs(value - target) < 12) value = this.int(0, 99);
      return { target, value };
    }
    if (type === 'patch') {
      const err = Array.from({ length: 4 }, () => this.pick([...CODE_CHARS])).join('');
      const confirm = String(this.int(0, 999)).padStart(3, '0');
      return { err, confirm, stage: 0, entered: '' };
    }
    // drill
    const colors = [...ROCK_COLORS].sort(() => this.rng() - 0.5);
    const keep = this.int(0, colors.length - 1);
    return { rocks: colors.map((color, i) => ({ color, keep: i === keep, gone: false })) };
  }

  // An action the astronaut takes at a station.
  act(id, a) {
    if (this.phase !== 'run' || !a) return;
    const is = this.issues.find(i => i.id === id);
    if (!is) return;
    const d = is.d;

    if (is.type === 'wires') {
      if (!Number.isInteger(a.cut) || a.cut < 0 || a.cut >= d.colors.length || d.cut.includes(a.cut)) return;
      d.cut.push(a.cut);
      if (a.cut === d.answer) this.solve(is); else this.mistake('Wrong wire pulled at the fuel depot.');
    } else if (is.type === 'freq') {
      if ([1, -1, 10, -10].includes(a.d)) d.value = Math.max(0, Math.min(99, d.value + a.d));
      else if (a.lock) { if (d.value === d.target) this.solve(is); else this.mistake('Dish locked on the wrong channel.'); }
    } else if (is.type === 'patch') {
      if (d.stage !== 1 || !/^[0-9]$/.test(String(a.key))) return;
      d.entered += a.key;
      if (d.entered.length === 3) {
        if (d.entered === d.confirm) this.solve(is);
        else { d.entered = ''; this.mistake('Wrong key entered at the airlock.'); }
      }
    } else if (is.type === 'drill') {
      const rock = d.rocks[a.rock];
      if (!rock || rock.gone) return;
      if (rock.keep) return this.mistake('The core sample was nearly thrown away.');
      rock.gone = true;
      if (d.rocks.every(r => r.gone || r.keep)) this.solve(is);
    }
  }

  // Mission Ops uploads a patch for a fault code. Returns the terminal's reply.
  patch(code) {
    if (this.phase !== 'run') return 'UPLINK IDLE. No mission in progress.';
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const is = this.issues.find(i => i.type === 'patch' && i.d.err === clean);
    if (!is) return `NO MATCH for "${clean}". Ask the astronaut to read the code again.`;
    if (is.d.stage === 0) is.d.stage = 1;
    return `PATCH ACCEPTED. Tell the astronaut to enter key ${is.d.confirm.split('').join(' ')}.`;
  }

  solve(is) {
    this.issues = this.issues.filter(i => i !== is);
    const pts = 100 + Math.round(is.left);
    this.score += pts;
    this.stats.fixed++;
    this.note('solve', `${ISSUES[is.type].title}: fixed with ${Math.round(is.left)} s to spare.`, 0, pts);
    if (!this.issues.length) this.nextSpawn = Math.min(this.nextSpawn, this.elapsed + 3);
  }

  mistake(text) {
    this.stats.mistakes++;
    if (this.freeMistake) {
      this.freeMistake = false;
      return this.note('mistake', `${text} The diagnostic kit caught it: no oxygen lost.`);
    }
    this.oxygen -= CFG.mistakePenalty;
    this.note('mistake', text, -CFG.mistakePenalty);
  }

  end(won, reason) {
    this.phase = 'results';
    this.issues = [];
    this.rover.throttle = this.rover.steer = 0;
    let bonus = 0;
    if (won) { bonus = Math.max(0, Math.round(this.oxygen)) * 2; this.score += bonus; }
    this.oxygen = Math.max(0, this.oxygen);
    this.result = { won, reason, bonus, ...this.stats };
    this.note('end', reason, 0, bonus);
  }

  note(kind, text, o2 = 0, pts = 0) {
    this.log.push({ at: Math.round(this.elapsed), kind, text, o2, pts });
    this.ev = { n: ++this.evn, kind, text, o2, pts };
  }

  // What one role is allowed to know. This is where the missing-information game lives:
  // nobody gets the whole picture.
  view(role, crew = []) {
    const all = role === 'all';
    const v = {
      t: 'state', n: ++this.seq, phase: this.phase,
      timeLeft: Math.max(0, this.timeLeft), oxygen: Math.max(0, this.oxygen), o2Max: this.o2Max,
      score: this.score, loadout: this.loadout, crew, ev: this.ev, result: this.result,
      rover: { x: this.rover.x, z: this.rover.z, ry: this.rover.ry },
    };
    if (this.phase === 'lobby') v.oxygen = v.o2Max = VEHICLES[this.loadout.vehicle].o2 + (this.loadout.gear.includes('o2') ? 25 : 0);
    if (this.phase === 'results') v.log = this.log;
    if (role !== 'astronaut') v.astro = this.astro;

    v.issues = this.issues.map(is => {
      const d = is.d;
      const o = { id: is.id, type: is.type, left: is.left, total: is.total };
      if (role === 'astronaut') {
        // Only what is physically on the panel in front of them.
        if (is.type === 'wires') Object.assign(o, { colors: d.colors, serial: d.serial, cut: d.cut });
        if (is.type === 'freq') o.wave = d.value;
        if (is.type === 'patch') Object.assign(o, { err: d.err, stage: d.stage, entered: d.entered });
        if (is.type === 'drill') o.rocks = d.rocks.map(r => ({ color: r.color, gone: r.gone }));
        return o;
      }
      if (role === 'ops' || all) {
        if (is.type === 'patch') { o.stage = d.stage; if (d.stage === 1) o.confirm = d.confirm; }
      }
      if (role === 'tech' || all) {
        if (is.type === 'freq') o.value = d.value;
      }
      if (role === 'sci' || all) {
        if (is.type === 'wires') o.pressure = d.pressure;
        if (is.type === 'freq') o.target = d.target;
        if (is.type === 'drill') o.keep = d.rocks.find(r => r.keep).color;
      }
      return o;
    });
    return v;
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  int(lo, hi) { return lo + Math.floor(this.rng() * (hi - lo + 1)); }
}
