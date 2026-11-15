// Radio link between the astronaut and Mission Ops.
// Push-to-talk audio goes to the server as raw 16 kHz samples, the server holds it for the
// light delay, and the other side plays it through a 1960s-style radio: narrow band,
// overdriven, with static and the Apollo "Quindar" beeps at the start and end.
import { music } from '/music.js';

const RATE = 16000;

export class Radio {
  constructor(net) {
    this.net = net;
    this.ready = false;
    this.micOk = false;
    this.talking = false;
    this.next = 0;
  }

  // Must be called from a click or key press (browsers require a user gesture for audio).
  async init() {
    if (this.ready) return this.micOk;
    const AC = window.AudioContext || window.webkitAudioContext;
    const c = this.ctx = new AC({ sampleRate: RATE });
    await c.resume();

    // Receive chain: band-pass -> overdrive -> speaker
    this.rxIn = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const drive = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(4 * x + 0.15) * 0.8; }
    drive.curve = curve;
    const out = c.createGain(); out.gain.value = 1.2;
    this.rxIn.connect(hp).connect(lp).connect(drive).connect(out).connect(c.destination);

    // Static, switched on while someone is transmitting to us
    const noise = c.createBuffer(1, RATE * 2, RATE);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.5;
    this.hiss = c.createGain(); this.hiss.gain.value = 0;
    src.connect(bp).connect(this.hiss).connect(c.destination);
    src.start();
    this.noise = noise;

    // Room tone for the inside of the habitat: air handlers (low noise) over a mains hum.
    // Silent until room() turns it up; outside, in vacuum, there is nothing to hear.
    const air = c.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 420;
    const airGain = c.createGain(); airGain.gain.value = 0.5;
    this.roomGain = c.createGain(); this.roomGain.gain.value = 0;
    src.connect(air).connect(airGain).connect(this.roomGain).connect(c.destination);
    for (const [f, v] of [[60, 0.05], [120, 0.025]]) {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.value = v;
      o.connect(g).connect(this.roomGain); o.start();
    }

    // Leaking air. Two copies of the same hiss: one locked to the head (the suit), one at a place
    // in the world (the hull crack), so the astronaut can tell them apart by turning their head.
    const hiss = () => {
      const n = c.createBufferSource(); n.buffer = noise; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2400;
      const g = c.createGain(); g.gain.value = 0;
      n.connect(f).connect(g); n.start();
      return g;
    };
    this.suitHiss = hiss();
    this.suitHiss.connect(c.destination);
    this.hullHiss = hiss();
    this.panner = c.createPanner();
    // Loud at arm's length, still there from across the base (22 m): you find the crack by walking toward the hiss.
    Object.assign(this.panner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1, maxDistance: 80 });
    this.hullHiss.connect(this.panner).connect(c.destination);
    this.ready = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      await c.audioWorklet.addModule('/mic-worklet.js');
      this.mic = new AudioWorkletNode(c, 'mic', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.mic.port.onmessage = e => this.net.sendBin(e.data);
      const mute = c.createGain(); mute.gain.value = 0;
      c.createMediaStreamSource(stream).connect(this.mic).connect(mute).connect(c.destination);
      this.micOk = true;
    } catch (err) {
      console.warn('Microphone not available (needs HTTPS or localhost, and permission):', err);
    }
    return this.micOk;
  }

  setTalking(on) {
    if (!this.micOk || on === this.talking) return;
    this.talking = on;
    music.duck('tx', on); // the theme drops while you talk, and comes back when you let go
    this.mic.port.postMessage(on);
    this.net.send({ t: 'ptt', on });
    this.tone(on ? 1400 : 1000, 0.04, 0.05);
  }

  // The other side pressed or released their talk key (already delayed by the server).
  rxMarker(on) {
    music.duck('rx', on); // and while the other side talks
    if (!this.ready) return;
    this.tone(on ? 2525 : 2475, 0.25, 0.12);
    this.hiss.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.05);
  }

  // A chunk of the other side's voice.
  receive(arrayBuffer) {
    if (!this.ready) return;
    const pcm = new Int16Array(arrayBuffer);
    if (!pcm.length) return;
    const buf = this.ctx.createBuffer(1, pcm.length, RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.rxIn);
    this.next = Math.max(this.next, this.ctx.currentTime + 0.08);
    src.start(this.next);
    this.next += buf.duration;
  }

  // Room tone level: 1 with the fans running, a faint 0.15 on battery, 0 outside.
  room(level) {
    if (!this.ready || level === this.roomLevel) return;
    this.roomLevel = level;
    this.roomGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, level ? 0.5 : 0.25);
  }

  // A tone that slides from one pitch to another: machinery winding down or spinning up.
  sweep(f0, f1, dur, vol = 0.1, type = 'sawtooth') {
    if (!this.ready) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.out || c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  tone(freq, dur, vol = 0.1, type = 'sine', at = 0) {
    if (!this.ready) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    const t = c.currentTime + at;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.out || c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // A burst of filtered noise: brushing, sparks, impacts.
  burst(dur, vol, type, freq, at = 0) {
    if (!this.ready) return;
    const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; n.loop = true;
    f.type = type; f.frequency.value = freq;
    const t = c.currentTime + at;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g).connect(this.out || c.destination);
    n.start(t, Math.random()); n.stop(t + dur + 0.02);
  }

  // Where the astronaut's ears are. Call every frame with plain {x, y, z} objects.
  listen(pos, fwd) {
    if (!this.ready) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  }

  // The sound of a leak. suit: true or false. hull: the crack's position, or null.
  leak(suit, hull) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.suitHiss.gain.setTargetAtTime(suit ? 0.09 : 0, t, 0.1);
    this.hullHiss.gain.setTargetAtTime(hull ? 0.9 : 0, t, 0.1);
    if (hull) {
      const p = this.panner;
      if (p.positionX) { p.positionX.value = hull.x; p.positionY.value = hull.y; p.positionZ.value = hull.z; }
      else p.setPosition(hull.x, hull.y, hull.z);
    }
  }

  // A game sound that comes from a place in the world (pos: {x, y, z}), at `gain` (0 to 1).
  sfxAt(kind, pos, gain = 1, opts) {
    if (!this.ready) return;
    const c = this.ctx, p = c.createPanner(), g = c.createGain();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; p.rolloffFactor = 1.2;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    g.gain.value = gain;
    g.connect(p).connect(c.destination);
    this.out = g;
    try { this.sfx(kind, opts); } finally { this.out = null; }
    setTimeout(() => { g.disconnect(); p.disconnect(); }, 3000);
  }

  // Game sounds, made from tones and noise so there are no audio files to load.
  sfx(kind, opts = {}) {
    if (kind === 'click') this.tone(900, 0.04, 0.06, 'square');
    if (kind === 'alarm') { this.tone(880, 0.15, 0.1, 'square'); this.tone(660, 0.15, 0.1, 'square', 0.18); this.tone(880, 0.15, 0.1, 'square', 0.36); }
    if (kind === 'solve') { this.tone(660, 0.1, 0.1); this.tone(880, 0.1, 0.1, 'sine', 0.1); this.tone(1320, 0.2, 0.1, 'sine', 0.2); }
    if (kind === 'mistake') { this.burst(0.25, 0.3, 'highpass', 1800); this.tone(160, 0.3, 0.12, 'sawtooth'); }   // a spark
    if (kind === 'refuse') { this.tone(140, 0.12, 0.14, 'square'); this.tone(140, 0.12, 0.14, 'square', 0.16); }  // too heavy
    if (kind === 'brush') this.burst(0.12, 0.1, 'bandpass', 3200);
    if (kind === 'weld') { this.burst(0.14, 0.12, 'highpass', 3000); this.tone(110, 0.14, 0.05, 'sawtooth'); }
    if (kind === 'toss') this.sweep(420, 160, 0.18, 0.05, 'triangle');                                  // a tool leaving the glove
    if (kind === 'thud') { this.burst(0.09, 0.22, 'lowpass', 260); this.tone(70, 0.08, 0.12); }         // a tool landing on regolith
    if (kind === 'impact') this.burst(0.5, 0.35, 'lowpass', 220);
    if (kind === 'hit') { this.burst(0.8, 0.8, 'lowpass', 300); this.tone(90, 0.5, 0.2, 'sawtooth'); }
    if (kind === 'blackout') { this.tone(440, 0.25, 0.12, 'sawtooth'); this.tone(220, 0.3, 0.12, 'sawtooth', 0.25); this.tone(110, 0.5, 0.12, 'sawtooth', 0.55); }
    if (kind === 'power') { this.tone(220, 0.15, 0.1); this.tone(440, 0.15, 0.1, 'sine', 0.15); this.tone(880, 0.3, 0.1, 'sine', 0.3); }
    if (kind === 'gen') { for (let i = 0; i < 6; i++) this.tone(55 + i * 4, 0.16, 0.16, 'sawtooth', i * 0.14); }
    // Inside the habitat
    if (kind === 'powerdown') { this.sweep(240, 35, 0.8, 0.12); this.tone(1500, 0.03, 0.05, 'square'); }
    if (kind === 'relay') { this.tone(70, 0.12, 0.22, 'square'); this.tone(1700, 0.02, 0.05, 'square'); }
    if (kind === 'alert') { this.tone(520, 0.18, 0.03); this.tone(390, 0.25, 0.03, 'sine', 0.22); }
    if (kind === 'breaker') { this.tone(90, 0.1, 0.2, 'square'); this.tone(1200, 0.02, 0.05, 'square'); this.sweep(40, 120, 0.9, 0.05); }
    if (kind === 'restrike') { this.tone(2400, 0.03, 0.04, 'square'); this.tone(120, 0.08, 0.05); }
    if (kind === 'pop') { this.tone(1800, 0.02, 0.06, 'square'); this.tone(1400, 0.02, 0.05, 'square', 0.05); }   // fasteners giving way
    if (kind === 'clank') { this.tone(180, 0.12, 0.12, 'square'); this.burst(0.08, 0.12, 'bandpass', 900); }
    if (kind === 'clang') { this.tone(310, 0.6, 0.1, 'triangle'); this.tone(463, 0.45, 0.06, 'triangle'); this.burst(0.1, 0.2, 'lowpass', 400); }
    if (kind === 'snap') { this.burst(0.06, 0.25, 'highpass', 2500); this.tone(90, 0.12, 0.1, 'square', 0.02); }
    if (kind === 'spark') { this.burst(0.05 + Math.random() * 0.12, 0.12, 'highpass', 2200 + Math.random() * 1500); }
    // The physical base: tools landing, hatches swinging, air coming back, Mission Control's GO.
    if (kind === 'thud') { const m = opts.mass || 1; this.burst(0.09 + Math.min(0.25, m * 0.01), 0.3, 'lowpass', 900 / Math.sqrt(m) + 120); this.tone(260 / Math.sqrt(m) + 60, 0.08, 0.08, 'triangle'); }
    if (kind === 'creak') this.sweep(220, 150, 0.8, 0.025, 'triangle');
    if (kind === 'repress') { this.burst(1.2, 0.18, 'bandpass', 1400); this.burst(1.4, 0.1, 'lowpass', 400, 0.1); }
    if (kind === 'go') { this.tone(587, 0.12, 0.08); this.tone(880, 0.25, 0.08, 'sine', 0.13); }
    if (kind === 'hatch') { this.sweep(150, 60, 0.35, 0.12, 'square'); this.tone(55, 0.25, 0.18, 'sine', 0.3); }
    if (kind === 'end' || kind === 'won') { this.tone(523, 0.2, 0.1); this.tone(659, 0.2, 0.1, 'sine', 0.2); this.tone(784, 0.4, 0.1, 'sine', 0.4); }
    // A loss: the same three notes falling, minor, slower and lower.
    if (kind === 'lost') { this.tone(392, 0.35, 0.08); this.tone(311, 0.35, 0.08, 'sine', 0.35); this.tone(262, 0.8, 0.08, 'sine', 0.7); }
    // The cuff asking to be read: a soft two-tone wrist-watch beep.
    // The sample run: a rock off the ground, a sample into a cup, the port's lid, its assay, a new find on the chart.
    if (kind === 'scrape') { this.burst(0.18, 0.12, 'bandpass', 700); this.burst(0.08, 0.06, 'highpass', 2600, 0.05); }
    if (kind === 'clink') { this.tone(1250, 0.12, 0.06, 'triangle'); this.tone(1870, 0.08, 0.03, 'triangle', 0.02); }
    if (kind === 'lid') { this.tone(95, 0.18, 0.2, 'square'); this.burst(0.1, 0.16, 'lowpass', 500); }
    if (kind === 'found') { this.tone(660, 0.14, 0.09); this.tone(990, 0.3, 0.09, 'sine', 0.15); }
    if (kind === 'dud') { this.tone(150, 0.45, 0.1, 'square'); }
    if (kind === 'ping') { this.tone(1400, 0.06, 0.05); this.tone(1400, 0.25, 0.025, 'sine', 0.07); }
    if (kind === 'watch') { this.tone(2100, 0.05, 0.03, 'square'); this.tone(2100, 0.05, 0.03, 'square', 0.12); }
  }
}
