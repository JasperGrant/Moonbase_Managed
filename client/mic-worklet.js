// Runs on the audio thread. While the talk key is held, packs the microphone into
// 100 ms chunks of 16-bit samples and hands them to the page to send.
class Mic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1600);
    this.n = 0;
    this.on = false;
    this.port.onmessage = e => { this.on = !!e.data; if (!this.on) this.flush(); };
  }
  flush() {
    if (!this.n) return;
    const out = new Int16Array(this.n);
    for (let i = 0; i < this.n; i++) out[i] = Math.max(-1, Math.min(1, this.buf[i])) * 32767;
    this.port.postMessage(out.buffer, [out.buffer]);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && this.on) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('mic', Mic);
