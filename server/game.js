// All game rules. No sockets in here, so it can be tested with plain Node (npm test).
//
// The shape of the game: the crew goes out into the field and brings rock samples home to the base.
// Things break, one at a time, and every fault eventually costs oxygen; oxygen at zero ends the mission
// at once. At the end of the clock the mission is complete if the manifest is banked. The astronaut
// reports physical work (a cell brushed, a point welded, a plug seated, a sample put in the port) with
// act(); this file alone decides whether it counted.
import { CFG, TOOLS, FAULTS, PLACES, SCRIPTS, MODES, CABLE_COLORS, DUST_CELLS, CRACK_POINTS, ROVERS, HAULER, SAMPLES } from '../client/shared/config.js';
import { sheltered, areaName, freeHand } from '../client/shared/rules.js';
import { FIELD, cellOf, layField, pushOut } from '../client/shared/field.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.seq = 0;
    this.evn = 0;
    this.mode = 'demo';
    this.reset();
  }

  // Back to the lobby. The mode is kept so the next mission is the same kind.
  reset() {
    this.phase = 'lobby';
    this.debriefLeft = 0;
    this.timeLeft = CFG.roundSeconds;
    this.o2Max = CFG.o2Start;
    this.oxygen = CFG.o2Start;
    this.score = 0;
    this.battery = 100;
    this.blackout = false;     // a flat battery: the base is dark and the suit cannot refill. Comms are not affected.
    this.genLeft = 0;
    this.hands = [null, null]; // [left, right]: the tool in each of the astronaut's hands, or null
    this.tools = this.layTools();
    this.tireBackAt = null;
    this.faults = {};          // at most one at a time
    this.meteor = null;        // { start, end, hit, falling }
    this.script = [];
    this.next = Infinity;      // when the director may start the next thing, once nothing is broken
    this.log = [];
    this.ev = null;
    this.result = null;
    this.stats = { fixed: 0, mistakes: 0, hits: 0, blackouts: 0, samples: 0, wanted: 0, duds: 0 };
    const door = PLACES.doors[CFG.spawn.door];
    this.astro = { x: door.x, z: door.z, ry: Math.PI, h: 1.65, inside: !!CFG.spawn.inside, door: CFG.spawn.door, riding: null };
    const rover = p => ({ x: p.x, z: p.z, ry: 0, v: 0, w: 0, throttle: 0, steer: 0 }); // parked facing out, away from the base
    this.rovers = { scout: rover(PLACES.rovers.scout), hauler: rover(PLACES.rovers.hauler) };
    // The field: samples, the heat map, and what has been explored (one byte per 5 m cell).
    this.samples = []; this.heat = []; this.manifest = [];
    this.carry = [];           // sample ids in the astronaut's hands (two at most, one if a tool is held)
    this.tray = Array(CFG.sample.tray).fill(null);
    this.assay = null;         // the last thing banked: { kind } or { kind: 'dud' }
    this.seen = new Uint8Array(FIELD.n * FIELD.n);
    this.seenKey = null;
    this.mark(0, 0, CFG.survey.known);
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
    this.script = [...SCRIPTS[this.mode]];
    this.tools = this.layTools(); // after reset, so free play shuffles with this mission's dice
    const f = layField(this.rng, this.mode);
    this.samples = f.samples.map(s => ({ ...s, at: 'ground' }));
    this.heat = f.heat;
    this.manifest = f.manifest.map(kind => ({ kind, got: false }));
    this.next = CFG.firstFaultSeconds;
    this.note('start', `Mission start: ${MODES[this.mode]}.`);
    return true;
  }

  get elapsed() { return CFG.roundSeconds - this.timeLeft; }
  // The base has power: lights on, and the suit refills indoors. The radio and the consoles work either way.
  get powered() { return !this.blackout || this.genLeft > 0; }
  get leaking() { return !!(this.faults.hull || this.faults.suit); }
  // 1 with no leak, 3 with one.
  get drain() { return 1 + (CFG.leakMultiplier - 1) * ((this.faults.hull ? 1 : 0) + (this.faults.suit ? 1 : 0)); }
  get quiet() { return !Object.keys(this.faults).length && !this.meteor; }
  // In a hand. A tool lying loose does not count: you cannot weld with a welder at your feet.
  has(tool) { return this.hands.includes(tool); }
  // Let go of a tool wherever it is held. Returns whether it was in a hand.
  letGo(tool) { const i = this.hands.indexOf(tool); if (i >= 0) this.hands[i] = null; return i >= 0; }
  // Two hands: a tool or a rock sample fills one each.
  get handsFree() { return 2 - this.hands.filter(Boolean).length - this.carry.length; }
  // Where each tool lies at the start: the same for every demo, shuffled in free play. Inside the hall,
  // in room coordinates. at: 'loose' (lying somewhere), 'hand', or 'gone' (used up).
  layTools() {
    const ids = Object.keys(TOOLS), spots = PLACES.toolSpots.map((_, i) => i);
    if (this.mode !== 'demo') this.shuffle(spots);
    const tools = {};
    ids.forEach((id, n) => {
      const sp = PLACES.toolSpots[this.mode === 'demo' ? PLACES.demoTools[id] : spots[n]];
      tools[id] = { at: 'loose', inside: true, x: sp.x, y: sp.y, z: sp.z, area: sp.area };
    });
    return tools;
  }
  // Is the astronaut where this loose tool is? Inside with a tool inside, or near it outside.
  reaches(t) { return t.inside ? !!this.astro.inside : !this.astro.inside && this.near(t); }
  near(p, reach = CFG.reach) { return Math.hypot(this.astro.x - p.x, this.astro.z - p.z) <= reach; }
  // The Hauler's footplate, where a rider stands, in world coordinates.
  plate() {
    const h = this.rovers.hauler, P = HAULER.plate;
    return { x: h.x + Math.sin(h.ry) * P.z + Math.cos(h.ry) * P.x, z: h.z + Math.cos(h.ry) * P.z - Math.sin(h.ry) * P.x };
  }
  // Where the astronaut's page says they are. A rider is wherever the Hauler has taken them.
  setPose(p) {
    const riding = this.astro.riding;
    this.astro = { ...p, riding };
    if (riding) Object.assign(this.astro, this.plate(), { inside: false });
  }
  // Mark the cells within r of (x, z) as explored.
  mark(x, z, r) {
    const c = FIELD.cell, R = FIELD.radius, n = FIELD.n;
    for (let i = Math.max(0, Math.floor((x - r + R) / c)); i <= Math.min(n - 1, Math.floor((x + r + R) / c)); i++)
      for (let j = Math.max(0, Math.floor((z - r + R) / c)); j <= Math.min(n - 1, Math.floor((z + r + R) / c)); j++) {
        const k = j * n + i;
        if (this.seen[k]) continue;
        const cx = -R + (i + 0.5) * c, cz = -R + (j + 0.5) * c;
        if (Math.hypot(cx - x, cz - z) <= r + c * 0.5) { this.seen[k] = 1; this.seenKey = null; }
      }
  }
  seenAt(x, z) { const k = cellOf(x, z); return k >= 0 && !!this.seen[k]; }

  tick(dt) {
    // The debrief times out, so a room nobody is watching goes back to the lobby by itself.
    if (this.phase === 'results') { this.debriefLeft -= dt; if (this.debriefLeft <= 0) this.reset(); return; }
    if (this.phase !== 'run') return;
    this.timeLeft -= dt;
    const now = this.elapsed;

    // The director: one thing at a time. Scripted events first, in order; then (free play) random ones.
    if (this.quiet && now >= this.next) {
      this.next = Infinity;
      if (this.script.length) this.fire(this.script.shift());
      else if (this.mode === 'free') {
        if (this.rng() < CFG.freeMeteorChance) this.fire({ ev: 'meteor' });
        else this.fire({ ev: this.pick(Object.keys(FAULTS)) });
      }
      if (this.quiet && this.next === Infinity && (this.script.length || this.mode === 'free')) this.next = now + CFG.faultGapSeconds;
    }

    // Meteor shower: hits anyone in the open once the impacts close in. It breaks nothing else.
    const m = this.meteor;
    if (m) {
      if (!m.falling && now >= m.start) { m.falling = true; this.note('meteor', 'Meteor shower.'); }
      if (!m.hit && now >= m.start + CFG.meteorGraceSeconds && now < m.end && !sheltered(this.astro, this.rovers.hauler)) {
        m.hit = true;
        this.oxygen -= CFG.meteorHit;
        this.stats.hits++;
        this.note('hit', 'Caught in the open by the meteor shower. The suit is leaking.', -CFG.meteorHit, 0, 'suit');
        this.break('suit', true);
      }
      if (now >= m.end) { this.meteor = null; if (this.quiet) this.next = now + CFG.faultGapSeconds; }
    }

    this.drive(dt);

    // Power: a power fault drains the battery, and a flat battery darkens the base.
    const draining = this.faults.dust || this.faults.board;
    this.battery += (draining ? -100 / CFG.batterySeconds : 100 / CFG.rechargeSeconds) * dt;
    this.battery = clamp(this.battery, 0, 100);
    if (!this.blackout && this.battery <= 0) {
      this.blackout = true;
      this.stats.blackouts++;
      this.note('blackout', 'Battery flat: the base went dark and the suit cannot refill.');
    } else if (this.blackout && this.battery > CFG.blackoutEndsAt) {
      this.blackout = false;
      this.note('power', 'Power restored.');
    }
    if (this.genLeft > 0) this.genLeft = Math.max(0, this.genLeft - dt);

    if (this.tireBackAt !== null && now >= this.tireBackAt) {
      this.tireBackAt = null;
      const sp = PLACES.toolSpots[PLACES.restock];
      this.tools.tire = { at: 'loose', inside: true, x: sp.x, y: sp.y, z: sp.z, area: sp.area };
    }

    // Oxygen: the suit drains outside, and tops up inside while the base has power.
    let d = -CFG.o2DrainPerSec * this.drain;
    if (this.astro.inside && this.powered) d += CFG.o2RefillPerSec;
    this.oxygen = Math.min(this.o2Max, this.oxygen + d * dt);
    if (this.oxygen <= 0) this.end(false, 'Suit oxygen ran out.');
    else if (this.timeLeft <= 0) {
      const done = this.manifest.every(x => x.got);
      this.end(done, done ? 'The manifest is banked: every sample the mission came for is home.' : 'Came home short: the manifest is not banked.');
    }
  }

  // Both rovers: ease toward what the keys ask, bump off rocks and the base and each other, and explore.
  drive(dt) {
    for (const id of ['scout', 'hauler']) {
      const r = this.rovers[id], spec = ROVERS[id];
      const stuck = this.faults.wheel && this.faults.wheel.which === id;
      if (stuck) r.throttle = r.steer = 0;
      const turn = id === 'hauler' && this.astro.riding ? spec.riderTurn : spec.turn;
      const acc = spec.speed / CFG.rover.rampSeconds * dt, wacc = spec.turn / CFG.rover.rampSeconds * dt;
      r.v += clamp(r.throttle * spec.speed - r.v, -acc, acc);
      r.w += clamp(r.steer * turn - r.w, -wacc, wacc);
      r.ry += r.w * dt;
      r.x += Math.sin(r.ry) * r.v * dt;
      r.z += Math.cos(r.ry) * r.v * dt;
      const p = pushOut(r.x, r.z, spec.radius);
      if (p.hit) r.v *= 0.6;
      r.x = p.x; r.z = p.z;
    }
    const a = this.rovers.scout, b = this.rovers.hauler;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = ROVERS.scout.radius + ROVERS.hauler.radius;
    if (d < min && d > 1e-6) {
      const k = (min - d) / d / 2;
      a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k;
      a.v *= 0.6; b.v *= 0.6;
    }
    for (const id of ['scout', 'hauler']) this.mark(this.rovers[id].x, this.rovers[id].z, ROVERS[id].reveal);
    if (this.astro.riding) Object.assign(this.astro, this.plate());
  }

  // One director event: a fault, or the warning of a meteor shower.
  fire(e) {
    if (e.ev === 'meteor') {
      if (this.meteor) return;
      const start = this.elapsed + CFG.meteorWarnSeconds;
      this.meteor = { start, end: start + CFG.meteorSeconds, hit: false, falling: false };
    } else this.break(e.ev, false, e.which);
  }

  // Start a fault. Only ever one at a time.
  break(type, quiet = false, which = null) {
    if (!FAULTS[type] || this.faults[type]) return;
    let d = {};
    if (type === 'dust') d = { cells: Array(DUST_CELLS).fill(true) };
    if (type === 'hull') d = { spot: this.int(0, PLACES.cracks.length - 1), welded: Array(CRACK_POINTS).fill(false) };
    if (type === 'wheel') d = { stage: 0, which: ROVERS[which] ? which : this.rng() < 0.6 ? 'scout' : 'hauler' }; // stage 0 = broken wheel still on, 1 = pulled off
    if (type === 'board') {
      // Each cable belongs in one socket. Three pop out, one stays put.
      const sockets = this.shuffle(CABLE_COLORS.map((_, i) => i));
      const stays = this.int(0, CABLE_COLORS.length - 1);
      d = { cables: CABLE_COLORS.map((color, i) => ({ color, socket: sockets[i], seated: i === stays })) };
    }
    this.faults[type] = d;
    if (!quiet) this.note('alarm', type === 'wheel' ? `${FAULTS[type].name} on the ${ROVERS[d.which].name}.` : `${FAULTS[type].name}.`, 0, 0, type);
  }

  sample(id) { return this.samples.find(s => s.id === id) || null; }
  unCarry(id) { this.carry = this.carry.filter(c => c !== id); }

  // Something the astronaut did. Wrong tool, too far away or nonsense is ignored.
  act(a) {
    if (this.phase !== 'run' || !a || typeof a !== 'object') return;

    const num = v => typeof v === 'number' && Number.isFinite(v);
    if (a.take !== undefined) {
      // Pick a loose tool up into a hand: the one named, or whichever is free (right first). Two hands,
      // one thing in each (a tool or a rock sample): with both full, put one down to take another.
      const t = this.tools[a.take], hand = freeHand(this.hands, a.hand);
      if (!t || t.at !== 'loose' || hand < 0 || this.handsFree < 1 || !this.reaches(t)) return;
      t.at = 'hand';
      this.hands[hand] = a.take;
    } else if (a.drop !== undefined) {
      // Let go: it is loose where the astronaut is, until the page says where it came to rest.
      const t = this.tools[a.drop];
      if (!t || !this.letGo(a.drop)) return;
      const inside = !!this.astro.inside;
      Object.assign(t, { at: 'loose', inside, x: this.astro.x, y: 0, z: this.astro.z });
      if (inside) { const sp = PLACES.toolSpots[0]; Object.assign(t, { x: num(a.x) ? a.x : sp.x, z: num(a.z) ? a.z : sp.z }); }
      else if (num(a.x) && num(a.z) && Math.hypot(a.x - this.astro.x, a.z - this.astro.z) < 4) Object.assign(t, { x: a.x, z: a.z });
      t.area = areaName(inside, t.x, t.z, this.rovers.hauler);
    } else if (a.rest !== undefined) {
      // A dropped (or knocked, or thrown) tool came to rest. Where it lies is the page's word: it has the physics.
      const t = this.tools[a.rest];
      if (!t || t.at !== 'loose' || ![a.x, a.y, a.z].every(num)) return;
      const inside = !!a.inside;
      if (!inside && Math.hypot(a.x, a.z) > CFG.bounds + 2) return;
      Object.assign(t, { inside, x: a.x, y: a.y, z: a.z, ry: num(a.ry) ? a.ry : 0, area: areaName(inside, a.x, a.z, this.rovers.hauler) });
    } else if (a.gen) {
      // Once per mission: pull the cord on the generator in your hand, or on one standing next to you.
      const t = this.tools.gen;
      if (!(this.has('gen') || (t.at === 'loose' && this.reaches(t)))) return;
      this.letGo('gen');
      t.at = 'gone';
      this.genLeft = CFG.generatorSeconds;
      this.note('gen', `Backup generator started: ${CFG.generatorSeconds} s of power.`);
    } else if (a.mount !== undefined) {
      // On and off the Hauler's footplate. Only while it is stopped.
      const h = this.rovers.hauler, stopped = Math.abs(h.v) < 0.25;
      if (a.mount === true) {
        if (this.astro.riding || this.astro.inside || !stopped || !this.near(this.plate(), CFG.ride.mountReach)) return;
        this.astro.riding = 'hauler';
        Object.assign(this.astro, this.plate());
      } else if (a.mount === false) {
        if (!this.astro.riding || !stopped) return;
        this.astro.riding = null;
      }
    } else if (a.pick !== undefined) {
      // A sample off the ground or out of a cup. Two hands: two samples, or a sample and a tool.
      const s = this.sample(a.pick);
      if (!s || this.astro.inside || this.handsFree < 1) return;
      if (s.at === 'ground') { if (!this.near(s, CFG.sample.reach)) return; }
      else if (s.at === 'tray') { if (!this.near(this.rovers.hauler, 4)) return; this.tray[s.slot] = null; delete s.slot; }
      else return;
      s.at = 'hand';
      this.carry.push(s.id);
    } else if (a.put !== undefined) {
      // Let go of a sample: it lies where it came to rest (near the astronaut), or outside the door if dropped indoors.
      const s = this.sample(a.put);
      if (!s || s.at !== 'hand') return;
      this.unCarry(s.id);
      s.at = 'ground';
      const ok = num(a.x) && num(a.z) && !this.astro.inside && Math.hypot(a.x - this.astro.x, a.z - this.astro.z) < 6 && Math.hypot(a.x, a.z) <= CFG.bounds;
      s.x = ok ? a.x : this.astro.x; s.z = ok ? a.z : this.astro.z;
    } else if (a.tray !== undefined) {
      const s = this.sample(a.tray);
      if (!s || s.at !== 'hand' || !Number.isInteger(a.slot) || a.slot < 0 || a.slot >= this.tray.length || this.tray[a.slot]) return;
      if (this.astro.inside || !this.near(this.rovers.hauler, 4)) return;
      this.unCarry(s.id);
      s.at = 'tray'; s.slot = a.slot; this.tray[a.slot] = s.id;
    } else if (a.bank !== undefined) {
      const s = this.sample(a.bank);
      if (!s || s.at !== 'hand' || this.astro.inside || !this.near(PLACES.port, CFG.sample.portReach)) return;
      this.bank(s);
    } else if (a.fix === 'dust') {
      const f = this.faults.dust;
      if (!f || !this.has('brush') || !PLACES.panels.some(p => this.near(p))) return;
      if (!Number.isInteger(a.cell) || !f.cells[a.cell]) return;
      f.cells[a.cell] = false;
      if (!f.cells.some(Boolean)) this.solve('dust');
    } else if (a.fix === 'board') {
      const f = this.faults.board;
      if (!f || !this.astro.inside) return; // the board is on the hall's west wall
      const cable = f.cables[a.cable];
      if (!cable || cable.seated || !Number.isInteger(a.socket) || a.socket < 0 || a.socket >= f.cables.length) return;
      if (f.cables.some(c => c.seated && c.socket === a.socket)) return; // that socket is full
      if (cable.socket !== a.socket) return this.mistake('Cable pushed into the wrong socket.', CFG.wrongPlug);
      cable.seated = true;
      if (f.cables.every(c => c.seated)) this.solve('board');
    } else if (a.fix === 'wheel') {
      const f = this.faults.wheel;
      if (!f || !this.near(this.rovers[f.which])) return;
      if (a.pull && f.stage === 0) f.stage = 1;
      else if (a.fit && f.stage === 1 && this.has('tire')) {
        this.letGo('tire'); this.tools.tire.at = 'gone'; // it is on the rover now
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

  // A sample into the port: the assay says what it was.
  bank(s) {
    this.unCarry(s.id);
    s.at = 'banked';
    if (s.kind === 'dud') {
      this.stats.duds++;
      this.assay = { kind: 'dud', look: s.look, n: this.evn + 1 };
      this.note('dud', 'A lookalike went in the port: a dud.', 0, 0);
      return;
    }
    const want = this.manifest.find(m => m.kind === s.kind && !m.got);
    const pts = want ? CFG.sample.wanted : CFG.sample.extra;
    if (want) { want.got = true; this.stats.wanted++; }
    this.stats.samples++;
    this.score += pts;
    this.assay = { kind: s.kind, look: s.look, n: this.evn + 1 };
    this.note('found', `${SAMPLES[s.kind].name} banked${want ? '' : ' (not on the manifest)'}.`, 0, pts);
  }

  solve(type) {
    delete this.faults[type];
    this.score += CFG.fixPoints;
    this.stats.fixed++;
    this.note('solve', `${FAULTS[type].name}: fixed.`, 0, CFG.fixPoints, type);
    if (this.quiet) this.next = this.elapsed + CFG.faultGapSeconds;
  }

  mistake(text, cost) {
    this.stats.mistakes++;
    this.oxygen -= cost;
    this.note('mistake', text, -cost);
  }

  end(won, reason) {
    this.phase = 'results';
    this.debriefLeft = CFG.debriefSeconds;
    this.faults = {};
    this.meteor = null;
    for (const r of Object.values(this.rovers)) { r.throttle = r.steer = 0; r.v = r.w = 0; }
    let bonus = 0;
    if (won) { bonus = Math.max(0, Math.round(this.oxygen)) * 2; this.score += bonus; }
    this.oxygen = Math.max(0, this.oxygen);
    this.result = { won, reason, bonus, ...this.stats, manifest: this.manifest.length };
    this.note('end', reason, 0, bonus);
  }

  // The text goes to the results log only. During the mission nobody is told what broke.
  // type: the fault (for its symbol in the log), if the line is about one.
  note(kind, text, o2 = 0, pts = 0, type = null) {
    this.log.push({ at: Math.round(this.elapsed), kind, text, o2, pts, ...(type ? { type } : {}) });
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
  get tally() { return { banked: this.manifest.filter(m => m.got).length, wanted: this.manifest.length }; }

  // Samples someone can see from these points: anything not banked within the draw radius, and everything
  // in a hand or a cup. Only what it looks like: never whether it is real.
  samplesNear(points) {
    const r = CFG.sample.drawRadius;
    return this.samples.filter(s => s.at === 'hand' || s.at === 'tray' || (s.at === 'ground' && points.some(p => Math.hypot(p.x - s.x, p.z - s.z) < r)))
      .map(s => ({ id: s.id, look: s.look, x: s.x, z: s.z, at: s.at, ...(s.at === 'tray' ? { slot: s.slot } : {}) }));
  }

  // What can physically be seen out on the surface: the astronaut's eyes and the rover cameras.
  scene(points = []) {
    const f = this.faults, m = this.meteor;
    const wheels = { scout: 0, hauler: 0 };
    if (f.wheel) wheels[f.wheel.which] = f.wheel.stage + 1; // 0 fine, 1 broken, 2 pulled off
    return {
      dark: !this.powered,
      dust: f.dust ? [...f.dust.cells] : null,
      // A loose cable does not say where it belongs.
      board: f.board ? f.board.cables.map(c => ({ color: c.color, seated: c.seated, socket: c.seated ? c.socket : -1 })) : null,
      wheels,
      hull: f.hull ? { spot: f.hull.spot, welded: [...f.hull.welded] } : null,
      meteor: m && m.falling ? this.elapsed - m.start : null,
      samples: this.samplesNear(points),
      tray: [...this.tray],
      port: { ...this.tally, assay: this.assay },
      // The tools the rover cameras can see: in the astronaut's hands, and lying out on the surface.
      tools: { held: [...this.hands], ground: Object.fromEntries(Object.entries(this.tools).filter(([, t]) => t.at === 'loose' && !t.inside).map(([id, t]) => [id, { x: t.x, y: t.y, z: t.z, ry: t.ry || 0 }])) },
    };
  }

  // The Scientist's chart: the heat map everywhere, and what is in the explored ground.
  survey() {
    if (this.seenKey === null) {
      let hex = '';
      for (let i = 0; i < this.seen.length; i += 4) hex += (this.seen[i] | this.seen[i + 1] << 1 | this.seen[i + 2] << 2 | this.seen[i + 3] << 3).toString(16);
      this.seenKey = hex;
    }
    const a = this.astro, rv = this.rovers;
    const out = {
      heat: this.heat.join(''), seen: this.seenKey,
      pct: Math.round(100 * this.seen.reduce((n, v) => n + v, 0) / this.seen.length),
      rovers: { scout: { x: rv.scout.x, z: rv.scout.z, ry: rv.scout.ry }, hauler: { x: rv.hauler.x, z: rv.hauler.z, ry: rv.hauler.ry } },
      astro: a.inside ? { x: 0, z: 0, ry: a.ry, inside: true } : a.riding || this.seenAt(a.x, a.z) ? { x: a.x, z: a.z, ry: a.ry, riding: !!a.riding } : null,
      samples: this.samples.filter(s => s.at === 'ground' && s.kind !== 'dud' && this.seenAt(s.x, s.z)).map(s => ({ id: s.id, kind: s.kind, x: s.x, z: s.z })),
      tools: Object.entries(this.tools).filter(([, t]) => t.at === 'loose' && !t.inside && this.seenAt(t.x, t.z)).map(([id, t]) => ({ id, x: t.x, z: t.z })),
      fault: null,
    };
    const type = Object.keys(this.faults)[0];
    if (type) {
      const p = type === 'dust' ? PLACES.panels[1] : type === 'wheel' ? rv[this.faults.wheel.which]
        : type === 'suit' ? (a.inside ? { x: 0, z: 0 } : a) : { x: 0, z: 0 };
      if (this.seenAt(p.x, p.z) || (type === 'suit' && (a.inside || a.riding))) out.fault = { type, x: p.x, z: p.z };
    }
    return out;
  }

  // What one role is allowed to know. This is where the missing-information game lives:
  // nobody gets the whole picture.
  view(role, crew = []) {
    const v = { t: 'state', n: ++this.seq, phase: this.phase, mode: this.mode, crew, score: this.score, result: this.result, powered: this.phase !== 'run' || this.powered };
    if (this.phase === 'results') { v.log = this.log; v.debriefLeft = Math.max(0, Math.ceil(this.debriefLeft)); }
    v.ev = this.ev;
    v.timeLeft = Math.max(0, this.timeLeft);
    v.oxygen = Math.max(0, this.oxygen);
    v.o2Max = this.o2Max;
    v.tally = this.tally;
    const rovers = {};
    for (const [id, r] of Object.entries(this.rovers)) rovers[id] = { x: r.x, z: r.z, ry: r.ry, v: r.v };
    const all = role === 'all';

    if (role === 'astronaut') {
      // Hands and eyes: the tool in hand, where the others lie, what is physically there, and the hiss.
      Object.assign(v, { hands: [...this.hands], tools: this.toolView(), scene: this.scene([this.astro]), suit: !!this.faults.suit, rovers, riding: this.astro.riding, carry: [...this.carry] });
      return v;
    }
    if (role === 'ops' || all) Object.assign(v, { hands: [...this.hands], tools: this.toolView(), carry: [...this.carry], tray: this.tray.map(Boolean) });
    if (role === 'tech' || all) {
      // Eyes and wheels: two cameras, no map. The meteor warning comes from the base's own radar.
      v.rovers = rovers;
      v.rider = !!this.astro.riding;
      v.scene = this.scene([this.rovers.scout, this.rovers.hauler]);
      v.astro = { ...this.astro, arms: (this.astro.arms || [null, null]).map(a => a && [...a]) }; // drawn by the rover cameras
      if (this.meteor) v.meteor = { eta: Math.max(0, this.meteor.start - this.elapsed), falling: this.meteor.falling };
      if (!v.tools) v.tools = this.toolView();
    }
    if (role === 'sci' || all) {
      v.power = { battery: this.battery, solar: this.solar(), board: this.boardOut() };
      v.leak = this.leaking; // one lamp: it does not say where
      v.drain = this.drain;
      // The wiring diagram: only the cables that are out.
      if (this.faults.board) v.wiring = this.faults.board.cables.filter(c => !c.seated).map(c => ({ color: c.color, socket: c.socket }));
      v.survey = this.survey();
      v.manifest = this.manifest.map(m => ({ ...m }));
      v.assay = this.assay;
    }
    return v;
  }

  toolView() {
    const v = {};
    for (const [id, t] of Object.entries(this.tools)) v[id] = { ...t };
    return v;
  }

  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  int(lo, hi) { return lo + Math.floor(this.rng() * (hi - lo + 1)); }
  between([lo, hi]) { return lo + this.rng() * (hi - lo); }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}
