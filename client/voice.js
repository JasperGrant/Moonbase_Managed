// Radio link between the astronaut and Mission Ops.
// Push-to-talk audio goes to the server as raw 16 kHz samples, the server holds it for the
// light delay, and the other side plays it through a 1960s-style radio: narrow band,
// overdriven, with static and the Apollo "Quindar" beeps at the start and end.
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
    this.mic.port.postMessage(on);
    this.net.send({ t: 'ptt', on });
    this.tone(on ? 1400 : 1000, 0.04, 0.05);
  }

  // The other side pressed or released their talk key (already delayed by the server).
  rxMarker(on) {
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

  tone(freq, dur, vol = 0.1, type = 'sine', at = 0) {
    if (!this.ready) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    const t = c.currentTime + at;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Game sounds, made from tones so there are no audio files to load.
  sfx(kind) {
    if (kind === 'click') this.tone(900, 0.04, 0.06, 'square');
    if (kind === 'spawn') { this.tone(880, 0.15, 0.1, 'square'); this.tone(660, 0.15, 0.1, 'square', 0.18); this.tone(880, 0.15, 0.1, 'square', 0.36); }
    if (kind === 'solve') { this.tone(660, 0.1, 0.1); this.tone(880, 0.1, 0.1, 'sine', 0.1); this.tone(1320, 0.2, 0.1, 'sine', 0.2); }
    if (kind === 'mistake' || kind === 'miss') { this.tone(160, 0.35, 0.14, 'sawtooth'); }
    if (kind === 'end') { this.tone(523, 0.2, 0.1); this.tone(659, 0.2, 0.1, 'sine', 0.2); this.tone(784, 0.4, 0.1, 'sine', 0.4); }
  }
}
