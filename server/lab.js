// The Real Mission's lab rules (docs/SPEC-real-mission.md, sections 3 and 5): four experiments, each opened by a
// sample coming through the port. Pure state, no sockets: server/game.js owns one Lab per mission and feeds it
// the astronaut's hands (act), the Scientist's calls (call), the Technician's breakers (breaker) and time (tick).
// Every experiment ends in a finding graded A, B or C; this file alone decides the grade.
import { EXPERIMENTS, EXP_IDS, EXP_OF, GRADE_PTS, LAB, MINERALS, E1, E2, E3, E4, BREAKERS, ageOf, ratioOf } from '../client/shared/lab.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = v => typeof v === 'number' && Number.isFinite(v);
const r2 = v => Math.round(v * 100) / 100;

export class Lab {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.breakers = { furnace: false, coldbox: true };
    this.x = {};
    for (const id of EXP_IDS) this.x[id] = { state: 'locked', sample: null, grade: null, at: null };
    // What each experiment will find, laid out when the mission starts.
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    const between = (lo, hi) => lo + rng() * (hi - lo);
    const grains = ['plag', 'plag', pick(['oliv', 'glass'])].sort(() => rng() - 0.5);
    Object.assign(this.x.E1, { grains, grain: 0, stage: 0, focus: 0.15, target: between(0.55, 0.85), pol: false, turned: [0, 0, 0], calls: [null, null, null] });
    const age = r2(between(3.15, 3.85));
    Object.assign(this.x.E2, { age, c39: Math.round(between(900, 1300)), pump: false, vac: 0, beam: false, mass: 35, latched: [], burnt: 0, capB: false, called: null });
    Object.assign(this.x.E3, { water: pick(Object.keys(E3.levels)), set: E3.room, temp: E3.room, drift: 0, door: 'closed', step: 0, hold: [0, 0, 0], inBand: [0, 0, 0], total: [0, 0, 0], reached: [false, false, false], lost: [false, false, false], called: null });
    const source = pick(Object.keys(E4.sources)), sr = E4.sources[source];
    Object.assign(this.x.E4, { source, dh: Math.round(between(sr.lo + 5, sr.hi - 5)), frac0: between(0.05, 0.12), rxAt: null, loadedAt: null, warm: 0, unpowered: 0, w1: null, w2: null, steady: [], valve: false, sub: 0, reader: false, called: null });
  }

  // A sample came through the port. Returns the experiment it opened, if any.
  receive(s, now) {
    const id = EXP_OF[s.kind], e = id && this.x[id];
    if (!e || e.state !== 'locked') return null;
    e.state = 'ready'; e.sample = s.id;
    if (id === 'E4') e.rxAt = now;
    return id;
  }

  // The astronaut's hands on an instrument. { exp, op, v }. Returns a word for a sound, or null.
  // ctx: { now, near: exp => bool, powered }
  act(a, ctx) {
    const e = this.x[a.exp]; if (!e || !ctx.near(a.exp)) return null;
    if (a.op === 'load') {
      if (e.state !== 'ready') return null;
      e.state = 'loaded'; e.at = ctx.now;
      if (a.exp === 'E4') { e.loadedAt = ctx.now; e.warm = ctx.now - e.rxAt; }
      return 'load';
    }
    if (e.state !== 'loaded') return null;
    return this[a.exp](e, a, ctx) || null;
  }

  E1(e, a) {
    if (a.op === 'focus' && num(a.v)) { e.focus = clamp(e.focus + clamp(a.v, -0.2, 0.2), 0, 1); return 'tick'; }
    if (a.op === 'pol') { e.pol = !e.pol; return 'clunk'; }
    if (a.op === 'stage' && num(a.v)) {
      const d = Math.sign(a.v) * E1.stageStep;
      e.stage = ((e.stage + d) % 360 + 360) % 360;
      if (e.pol && Math.abs(e.focus - e.target) < 0.12) e.turned[e.grain] = Math.min(360, e.turned[e.grain] + E1.stageStep); // a turn only counts if you can see
      return 'tick';
    }
    if (a.op === 'next') { e.grain = (e.grain + 1) % E1.grains; e.stage = 0; return 'clunk'; }
    return null;
  }
  E2(e, a, ctx) {
    if (e.burnt > 0) return 'refuse';
    if (a.op === 'pump') { e.pump = !e.pump; return 'clunk'; }
    if (a.op === 'beam') {
      if (e.beam) { e.beam = false; return 'clunk'; }
      if (e.vac < 0.9 || !ctx.powered) { e.burnt = E2.burnSeconds; e.capB = true; e.beam = false; return 'burn'; } // the filament burns in air
      e.beam = true; return 'clunk';
    }
    if (a.op === 'mass' && num(a.v)) { e.mass = r2(clamp(e.mass + clamp(a.v, -1, 1), E2.mass[0], E2.mass[1])); return 'tick'; }
    if (a.op === 'latch') {
      if (!e.beam || e.latched.length >= 2) return 'refuse';
      const peak = E2.peaks.reduce((b, p) => Math.abs(p - e.mass) < Math.abs(b - e.mass) ? p : b);
      e.latched.push({ mass: e.mass, peak, counts: this.counts(e, e.mass) });
      return 'latch';
    }
    return null;
  }
  // What the detector counts with the dial at mass m: each peak is a bell curve E2.width wide.
  counts(e, m) {
    const ratio = ratioOf(e.age), heights = { 36: e.c39 * 0.4, 39: e.c39, 40: e.c39 * ratio };
    let c = 0;
    for (const p of E2.peaks) c += heights[p] * Math.exp(-(((m - p) / E2.width) ** 2));
    return Math.round(c);
  }
  E3(e, a) {
    if (a.op === 'set' && num(a.v)) { e.set = clamp(e.set + clamp(a.v, -100, 100), E3.room, E3.max); return 'tick'; }
    if (a.op === 'door') {
      e.door = e.door === 'closed' ? 'open' : 'closed';
      if (e.door === 'open' && e.temp > 200 && e.step < 3) { e.hold[e.step] = 0; return 'hiss'; } // the step in progress is lost
      return 'clunk';
    }
    return null;
  }
  E4(e, a, ctx) {
    if (a.op === 'weigh' && num(a.v)) {
      const steady = a.v >= E4.steady;
      if (e.w1 === null) { e.w1 = r2(100 + this.rng() * 40); e.steady.push(steady); if (!steady) e.w1 = r2(e.w1 + (this.rng() - 0.5) * 6); return 'clink'; }
      if (e.sub >= E4.subSeconds && e.w2 === null) {
        const frac = e.frac0 * (1 - clamp((e.warm - E4.clockA) / 180, 0, 0.6));
        e.w2 = r2(e.w1 * (1 - frac)); e.steady.push(steady); if (!steady) e.w2 = r2(e.w2 + (this.rng() - 0.5) * 6);
        return 'clink';
      }
      return 'refuse';
    }
    if (a.op === 'valve') { if (e.w1 === null) return 'refuse'; e.valve = !e.valve; return 'hiss'; }
    if (a.op === 'reader') { if (e.w2 === null) return 'refuse'; e.reader = true; return 'clunk'; }
    return null;
  }

  // The Scientist's call: the answer that ends an experiment (or, for E1, one grain). Returns the finished
  // experiment's { exp, grade } or null.
  call(exp, answer) {
    const e = this.x[exp]; if (!e || e.state !== 'loaded') return null;
    if (exp === 'E1') {
      const g = answer?.grain, m = answer?.mineral;
      if (!Number.isInteger(g) || g < 0 || g >= E1.grains || !MINERALS[m]) return null;
      e.calls[g] = m;
      if (e.calls.every(Boolean)) return this.finish(exp, this.gradeE1(e));
      return null;
    }
    if (exp === 'E2') {
      if (e.latched.length < 2 || !num(answer)) return null;
      e.called = r2(answer);
      return this.finish(exp, this.gradeE2(e));
    }
    if (exp === 'E3') {
      if (e.step < 3 || !E3.levels[answer]) return null;
      e.called = answer;
      return this.finish(exp, this.gradeE3(e));
    }
    if (exp === 'E4') {
      if (!e.reader || !E4.sources[answer]) return null;
      e.called = answer;
      return this.finish(exp, this.gradeE4(e));
    }
    return null;
  }
  finish(exp, grade) {
    const e = this.x[exp];
    e.state = 'done'; e.grade = grade;
    if (exp === 'E3') this.breakers.furnace = false; // the furnace switches itself off when the run is done
    return { exp, grade, pts: GRADE_PTS[grade] };
  }

  gradeE1(e) {
    const right = e.calls.filter((m, i) => m === e.grains[i]).length;
    const looked = e.turned.every(t => t >= E1.needTurn);
    return right === 3 && looked ? 'A' : right >= 2 ? 'B' : 'C';
  }
  // The age the latched peaks give: counts at 40 over counts at 39.
  measuredAge(e) {
    const c = p => e.latched.find(l => l.peak === p)?.counts;
    return c(39) && c(40) ? ageOf(c(40) / c(39)) : null;
  }
  gradeE2(e) {
    const peaks = e.latched.map(l => l.peak).sort().join(), off = Math.max(...e.latched.map(l => Math.abs(l.mass - l.peak)));
    if (peaks !== '39,40') return 'C';
    const err = Math.abs(e.called - e.age);
    if (off <= 0.05 && err <= 0.1 && !e.capB) return 'A';
    if (off <= 0.15 && err <= 0.3) return 'B';
    return 'C';
  }
  gradeE3(e) {
    const tot = e.total.reduce((a, b) => a + b, 0), frac = tot ? e.inBand.reduce((a, b) => a + b, 0) / tot : 0;
    const right = e.called === e.water, lost = e.lost.some(Boolean);
    if (right && frac >= 0.9 && !lost) return 'A';
    if (right && frac >= 0.7) return 'B';
    return 'C';
  }
  gradeE4(e) {
    const right = e.called === e.source, steady = e.steady.every(Boolean);
    if (right && e.warm <= E4.clockA && steady) return 'A';
    if (right && (e.warm <= E4.clockB || steady)) return 'B';
    return 'C';
  }

  // The Technician's breakers.
  breaker(id, on) { if (BREAKERS[id]) this.breakers[id] = !!on; }
  // The lab's loads: the share of the recharge they take, and the % a second they drain on top.
  get load() { return (this.breakers.furnace ? BREAKERS.furnace.load : 0) + (this.breakers.coldbox ? BREAKERS.coldbox.load : 0); }
  get drain() { return this.breakers.furnace ? BREAKERS.furnace.drain : 0; }

  // Time passes: vacuum pumps, furnaces heat and drift, ice warms, water sublimes.
  tick(dt, { now, powered }) {
    const out = []; // events: { exp, what }
    const b = this.x.E2;
    if (b.burnt > 0) b.burnt = Math.max(0, b.burnt - dt);
    b.vac = clamp(b.vac + (b.pump && powered ? 1 / E2.vacSeconds : -0.05) * dt, 0, 1);
    if (b.beam && !powered) b.beam = false;

    const f = this.x.E3, heat = this.breakers.furnace && powered;
    if (f.state === 'loaded') {
      f.drift = clamp(f.drift + (this.rng() - 0.5) * E3.drift * 2 * dt, -E3.drift * 1.3, E3.drift * 1.3);
      const goal = heat ? clamp(f.set + f.drift, E3.room, E3.max + 60) : E3.room;
      f.temp += (goal - f.temp) * (1 - Math.exp(-E3.rate * dt));
      const k = f.step;
      if (k < 3 && f.door === 'closed') {
        const band = E3.steps[k];
        if (f.temp >= band.lo) f.reached[k] = true;
        if (f.reached[k]) {
          f.total[k] += dt;
          if (f.temp >= band.lo && f.temp <= band.hi) { f.inBand[k] += dt; f.hold[k] += dt; }
          if (k < 2 && f.temp > band.hi + (band.hi - band.lo) && !f.lost[k + 1]) { f.lost[k + 1] = true; out.push({ exp: 'E3', what: 'lost' }); }
          if (f.hold[k] >= E3.hold) { f.step++; out.push({ exp: 'E3', what: 'step' }); }
        }
      }
    }

    const c = this.x.E4, cold = this.breakers.coldbox && powered;
    if (c.state === 'ready' && c.rxAt !== null) c.warm = now - c.rxAt;
    if (c.state === 'loaded') {
      c.unpowered = cold ? 0 : c.unpowered + dt;
      if (c.unpowered > E4.holdUnpowered) c.warm += dt;
      if (c.valve && cold && c.sub < E4.subSeconds) { c.sub = Math.min(E4.subSeconds, c.sub + dt); if (c.sub >= E4.subSeconds) out.push({ exp: 'E4', what: 'sub' }); }
    }
    return out;
  }

  get done() { return EXP_IDS.filter(id => this.x[id].state === 'done'); }

  // What one seat may know. The astronaut sees what the instruments show; the Scientist gets the telemetry and the
  // reference, never the picture; Mission Ops the board; the Technician the breakers.
  view(role) {
    const board = Object.fromEntries(EXP_IDS.map(id => [id, { state: this.x[id].state, grade: this.x[id].grade }]));
    if (role === 'ops') return { board };
    if (role === 'tech') return { board, breakers: { ...this.breakers }, load: this.load };
    const e1 = this.x.E1, e2 = this.x.E2, e3 = this.x.E3, e4 = this.x.E4;
    if (role === 'astronaut') return {
      board, breakers: { ...this.breakers },
      E1: { grain: e1.grain, stage: e1.stage, pol: e1.pol, blur: r2(Math.abs(e1.focus - e1.target)), mineral: e1.pol ? e1.grains[e1.grain] : null },
      E2: { pump: e2.pump, vac: r2(e2.vac), beam: e2.beam, mass: e2.mass, burnt: Math.ceil(e2.burnt), trace: e2.beam ? this.trace(e2) : null, latched: e2.latched.map(l => l.counts) },
      E3: { set: Math.round(e3.set), temp: Math.round(e3.temp), door: e3.door, step: e3.step, glow: r2(clamp((e3.temp - 300) / 900, 0, 1)) },
      E4: { warm: Math.round(e4.warm), w1: e4.w1, w2: e4.w2, valve: e4.valve, sub: r2(e4.sub / E4.subSeconds), reader: e4.reader ? e4.dh : null },
    };
    // The Scientist (and the 2-player seat): telemetry and the reference.
    return {
      board, breakers: { ...this.breakers },
      E1: { state: e1.state, grain: e1.grain, stage: e1.stage, focus: r2(e1.focus), pol: e1.pol, turned: [...e1.turned], calls: [...e1.calls] },
      E2: { state: e2.state, vac: r2(e2.vac), pump: e2.pump, beam: e2.beam, burnt: Math.ceil(e2.burnt), mass: e2.mass, latched: e2.latched.map(l => ({ mass: l.mass, counts: l.counts })), called: e2.called },
      E3: { state: e3.state, temp: Math.round(e3.temp), set: Math.round(e3.set), door: e3.door, step: e3.step, hold: e3.hold.map(r2), heat: this.breakers.furnace, gas: this.gas(e3), lost: [...e3.lost], called: e3.called },
      E4: { state: e4.state, warm: Math.round(e4.warm), w1: e4.w1, w2: e4.w2, valve: e4.valve, sub: r2(e4.sub), steady: [...e4.steady], dh: e4.reader ? e4.dh : null, called: e4.called },
    };
  }
  // The CRT on the mass spectrometer: counts across +-0.6 of the dial, 25 points.
  trace(e) {
    const out = [];
    for (let i = 0; i < 25; i++) out.push(this.counts(e, e.mass - 0.6 + i * 0.05));
    return out;
  }
  // The gas the furnace's analyser sees now, 0..1: a peak while the step's band is held, scaled by how much of
  // that gas the glass held.
  gas(e) {
    const k = e.step; if (k >= 3 || e.door === 'open') return 0;
    const band = E3.steps[k]; if (e.temp < band.lo || e.temp > band.hi) return 0;
    const h = e.lost[k] ? 0.05 : k === 0 ? E3.levels[e.water] : k === 1 ? 0.5 : 0.4;
    return r2(h * Math.sin(Math.PI * clamp(e.hold[k] / E3.hold, 0, 1)));
  }
}

export { EXPERIMENTS, LAB };
