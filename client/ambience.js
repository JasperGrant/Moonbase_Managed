// The lobby's sound. Each role's scene has its own room tone, made live with Web Audio so nothing
// has to be downloaded:
//   astronaut  suit breathing, the life-support fan, a squelch on the suit radio now and then
//   ops        a busy control room: murmur, mains hum, teleprinter bursts, the odd Quindar tone
//   sci        a quiet study at night: a clock, the lamp's buzz, rain on the window, a page turning
//   tech       a workshop: a low drone, the ventilation, and the welding arc crackling in bursts
// A scene is heard only while its seat is taken. The one you point at comes forward and the rest
// drop back; with nothing pointed at, your own seat is the loudest.
const ROLES = ['astronaut', 'ops', 'sci', 'tech'];

export class Ambience {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.lit = new Set();
    this.focus = null;
    this.mine = [];
    this.timers = [];
  }

  // Must be called from a click or key press: browsers only allow sound after one.
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.build();
    }
    this.ctx.resume?.();
    this.on = true;
    this.mix();
    return true;
  }
  stop() { this.on = false; this.mix(); }

  setLit(roles) { this.lit = new Set(roles); this.mix(); }
  setFocus(role) { this.focus = role; this.mix(); }
  setMine(roles) { this.mine = roles; this.mix(); }

  mix() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, t, 0.25);
    for (const r of ROLES) {
      let v = 0;
      if (this.lit.has(r)) {
        if (this.focus) v = this.focus === r ? 1 : 0.07;
        else v = this.mine.includes(r) ? 0.7 : 0.16;
      } else if (this.focus === r) v = 0.05; // an empty seat is a faint hint of what is behind it
      this.bus[r].gain.setTargetAtTime(v, t, 0.35);
    }
  }

  // ---------- one-shots the lobby plays ----------
  // A two-tone radio beep when someone takes a seat.
  joined() {
    if (!this.on) return;
    this.tone(2525, 0, 0.12, 0.18); this.tone(2475, 0.16, 0.12, 0.18);
  }
  tick(n) { if (this.on) this.tone(n > 0 ? 880 : 1320, 0, n > 0 ? 0.12 : 0.6, 0.25); }

  // The technician's arc: called by the lobby when the flash it draws turns on and off.
  arc(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.arcGain.gain.cancelScheduledValues(t);
    this.arcGain.gain.setTargetAtTime(on ? 0.9 : 0, t, on ? 0.01 : 0.04);
  }

  // ---------- building blocks ----------
  build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0;
    this.master.connect(c.destination);
    this.bus = {};
    for (const r of ROLES) { this.bus[r] = c.createGain(); this.bus[r].gain.value = 0; this.bus[r].connect(this.master); }
    const len = c.sampleRate * 3;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.buildAstronaut(); this.buildOps(); this.buildSci(); this.buildTech();
  }
  noise(type, freq, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.start(0, Math.random() * 2);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    src.connect(f);
    return f;
  }
  osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.start(); return o; }
  gain(v, ...to) { const g = this.ctx.createGain(); g.gain.value = v; for (const n of to) g.connect(n); return g; }
  // A slow wobble on an AudioParam, for life in a steady sound.
  lfo(param, rate, depth) { const o = this.osc('sine', rate); o.connect(this.gain(depth, param)); }
  every(min, max, fn) {
    const go = () => { if (this.on) fn(); this.timers.push(setTimeout(go, (min + Math.random() * (max - min)) * 1000)); };
    this.timers.push(setTimeout(go, Math.random() * max * 1000));
  }
  burst(bus, type, freq, q, at, dur, vol) { // a short shaped noise hit
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(), t = c.currentTime + at;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }
  tone(freq, at, dur, vol, bus = this.master, type = 'sine') {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  // Inside the helmet: slow breathing over the hum of the suit fan.
  buildAstronaut() {
    const c = this.ctx, bus = this.bus.astronaut;
    this.noise('lowpass', 260, 0.5).connect(this.gain(0.35, bus));          // fan rumble
    this.osc('sine', 97).connect(this.gain(0.05, bus));                     // fan motor
    const breath = this.gain(0, bus);
    this.noise('bandpass', 700, 0.8).connect(breath);
    const cycle = () => {
      const t = c.currentTime, g = breath.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.32, t + 1.1); g.linearRampToValueAtTime(0.02, t + 1.9);   // in
      g.linearRampToValueAtTime(0.22, t + 2.5); g.linearRampToValueAtTime(0.0001, t + 4.2); // out
      this.timers.push(setTimeout(cycle, 5200 + Math.random() * 900));
    };
    cycle();
    this.every(7, 14, () => { // a squelch on the suit radio
      this.burst(bus, 'bandpass', 1800, 2, 0, 0.18, 0.25);
      this.tone(1240, 0.2, 0.07, 0.05, bus, 'square');
    });
  }

  // Mission Control: voices you cannot make out, mains hum, teleprinters, Quindar tones.
  buildOps() {
    const bus = this.bus.ops;
    const murmur = this.gain(0.5, bus);
    this.noise('bandpass', 420, 1.2).connect(murmur);
    this.lfo(murmur.gain, 0.7, 0.18); this.lfo(murmur.gain, 1.9, 0.12);
    this.noise('lowpass', 180, 0.7).connect(this.gain(0.4, bus));           // the room
    this.osc('sine', 60).connect(this.gain(0.06, bus));                      // mains hum
    this.osc('triangle', 120).connect(this.gain(0.025, bus));
    this.every(3, 9, () => { // a teleprinter line
      const n = 6 + Math.floor(Math.random() * 18);
      for (let i = 0; i < n; i++) this.burst(bus, 'highpass', 2200, 1, i * 0.07 + Math.random() * 0.02, 0.03, 0.22);
    });
    this.every(12, 25, () => { this.tone(2525, 0, 0.25, 0.05, bus); }); // Quindar tone, faint
  }

  // The study: a clock, the lamp buzzing, rain on the window, a page now and then.
  buildSci() {
    const c = this.ctx, bus = this.bus.sci;
    const rain = this.gain(0.12, bus);
    this.noise('highpass', 2600, 0.5).connect(rain);
    this.lfo(rain.gain, 0.13, 0.04);
    this.noise('lowpass', 140, 0.5).connect(this.gain(0.25, bus));
    const buzz = c.createBiquadFilter(); buzz.type = 'lowpass'; buzz.frequency.value = 500;
    this.osc('sawtooth', 120).connect(buzz); buzz.connect(this.gain(0.012, bus));
    let tock = false;
    this.timers.push(setInterval(() => {
      if (!this.on) return;
      tock = !tock;
      this.burst(bus, 'bandpass', tock ? 2400 : 3200, 6, 0, 0.04, 0.5);
    }, 1000));
    this.every(9, 20, () => { // a page turning
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
      const g = c.createGain(), t = c.currentTime;
      f.frequency.setValueAtTime(1500, t); f.frequency.linearRampToValueAtTime(4500, t + 0.35);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.4);
      src.connect(f).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + 0.45);
    });
  }

  // The workshop: a drone, the extractor fan, and the arc's crackle, gated by the lobby's flashes.
  buildTech() {
    const bus = this.bus.tech;
    this.noise('lowpass', 120, 0.6).connect(this.gain(0.45, bus));
    this.osc('sine', 50).connect(this.gain(0.05, bus));
    const fan = this.gain(0.1, bus);
    this.noise('bandpass', 900, 0.6).connect(fan);
    this.lfo(fan.gain, 0.4, 0.03);
    // The arc: a hissing crackle with a buzz under it. arc() opens and closes this gate.
    this.arcGain = this.gain(0, bus);
    const crackle = this.gain(0.35, this.arcGain);
    this.noise('bandpass', 3200, 0.9).connect(crackle);
    this.timers.push(setInterval(() => { // fast random level jumps make the hiss crackle
      if (!this.ctx || !this.on) return;
      crackle.gain.setValueAtTime(0.1 + Math.random() * 0.6, this.ctx.currentTime);
    }, 23));
    this.osc('sawtooth', 100).connect(this.gain(0.03, this.arcGain));
  }
}
