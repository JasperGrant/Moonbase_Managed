// The theme song. It plays on every page, all the time, on a loop: the landing page, the lobby, the
// three Mission Control seats, the admin console and the headset.
//
// Import it and it starts: `import { music } from '/music.js'`. Browsers only allow sound after the
// person has clicked or pressed a key on the page, so if the first try is refused it starts on the
// first click, tap or key press, whatever that click was for.
//
//   music.mood('calm' | 'run')   how loud: full in the lobby and on the results, under the game during a mission
//   music.duck(reason, on)       drop it further while the radio is on ('tx', 'rx'), so voices come through
//
// Where it is in the song follows the clock, not the page: position = time of day modulo the loop.
// So walking from the landing page to a seat carries on where it was instead of starting over, and
// every page and device in the room is at the same moment of the song.
//
// The song ends at full volume (no fade-out) and starts with a quiet intro, so the loop is a
// crossfade: over the last FADE seconds the end fades out while the start fades in on a second player.
// It does not go through Web Audio. The radio's audio context runs at 16 kHz, and music through it
// would sound like a telephone line.
const SRC = '/assets/audio/theme.m4a';
const FADE = 3;                          // seconds the end of the song overlaps its start
const LEVEL = { calm: 0.5, run: 0.22 };  // during a mission it sits under the alarms, the leak hiss and the radio
const DUCK = 0.3;                        // and drops to this share of that while anyone is on the radio
const SMOOTH = 0.6;                      // seconds for a change of level to mostly happen

class Music {
  constructor() {
    this.players = [];
    this.cur = 0;            // the player that is (or will be) carrying the song
    this.length = 0;         // seconds, once known
    this.target = LEVEL.calm;
    this.gain = 0;           // fades up from silence on every page, so arriving never starts with a jolt
    this.ducks = new Set();
    this.playing = false;
    this.last = performance.now();
    this.retried = 0;
    if (typeof Audio === 'undefined') return;
    this.load();
  }

  // The whole file is fetched once and both players read it from memory: then any moment of the song
  // can be jumped to at once, whatever the server does about partial downloads.
  async load() {
    let url = SRC;
    try { const r = await fetch(SRC); if (r.ok) url = URL.createObjectURL(await r.blob()); } catch {}
    try { await this.open(url); }
    catch {
      // The downloaded copy would not play (a server that labels it wrongly, say): try the file by its address.
      try { await this.open(SRC); } catch (e) { console.warn('music: the theme could not be loaded', e); return; }
    }
    const a = this.players[0];
    this.length = a.duration;
    a.currentTime = this.where();
    this.start();
    setInterval(() => this.step(), 50);
  }

  // Two players on the same source; resolves when the first knows how long the song is.
  open(src) {
    this.players = [0, 1].map(() => {
      const a = new Audio();
      a.preload = 'auto';
      a.src = src;
      a.volume = 0;
      // If a hidden tab's timer is too slow to start the next player in time, the end of the song starts it.
      a.addEventListener('ended', () => { if (a === this.players[this.cur]) this.handOver(); });
      return a;
    });
    const a = this.players[0];
    return new Promise((res, rej) => {
      if (a.readyState >= 1) return res();
      const timer = setTimeout(() => rej(new Error('timed out')), 15000);
      a.addEventListener('loadedmetadata', () => { clearTimeout(timer); res(); }, { once: true });
      a.addEventListener('error', () => { clearTimeout(timer); rej(a.error || new Error('error')); }, { once: true });
    });
  }

  // Where the song is right now, by the clock.
  where() { const loop = this.length - FADE; return loop > 0 ? (Date.now() / 1000) % loop : 0; }

  start() {
    const a = this.players[this.cur];
    if (!a || this.playing) return;
    a.play().then(() => { this.playing = true; }, () => this.waitForGesture());
  }
  waitForGesture() {
    if (this.waiting) return;
    this.waiting = true;
    const go = () => {
      this.waiting = false;
      for (const k of KINDS) removeEventListener(k, go, true);
      this.unlock();
    };
    // Every kind of input a browser counts as the person having touched the page.
    const KINDS = ['pointerdown', 'pointerup', 'mousedown', 'keydown', 'keyup', 'touchstart', 'touchend', 'click'];
    for (const k of KINDS) addEventListener(k, go, true);
  }

  // Try to start now. Pages call this at a moment the browser counts as the person's own action, such as
  // entering VR or pulling a trigger, which the page's click and key listeners cannot see.
  unlock() {
    if (this.playing || !this.length) return;
    const a = this.players[this.cur];
    a.currentTime = this.where(); // it has been "playing" all along: catch up
    this.start();
  }

  // The next player picks the song up from the top (or wherever the clock says, if it has drifted).
  handOver() {
    const next = this.players[1 - this.cur], pos = this.where();
    next.currentTime = pos < FADE * 2 ? pos : 0;
    next.volume = 0;
    this.cur = 1 - this.cur;
    if (this.playing) next.play().catch(() => {});
  }

  step() {
    const now = performance.now(), dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    const want = this.target * (this.ducks.size ? DUCK : 1);
    this.gain += (want - this.gain) * (1 - Math.exp(-dt * 3 / SMOOTH));
    if (!this.playing || !this.length) return;
    const a = this.players[this.cur], b = this.players[1 - this.cur], end = this.length;
    // Something paused it (a browser saving power, a call, the headset coming off): start it again, in step.
    if (a.paused && now - this.retried > 2000) { this.retried = now; a.currentTime = this.where(); a.play().catch(() => {}); }
    // Time to start the next one: the last FADE seconds of this one overlap its start.
    if (a.currentTime >= end - FADE && b.paused) this.handOver();
    // An equal-power crossfade: the one that is ending fades out, the one that is starting fades in.
    const cur = this.players[this.cur], old = this.players[1 - this.cur];
    const fadeIn = Math.min(1, cur.currentTime / FADE);
    cur.volume = clamp(this.gain * Math.sin(fadeIn * Math.PI / 2));
    if (!old.paused) {
      const left = Math.max(0, end - old.currentTime) / FADE;
      old.volume = clamp(this.gain * Math.sin(Math.min(1, left) * Math.PI / 2));
      if (left <= 0) old.pause();
    }
  }

  mood(name) { if (LEVEL[name] !== undefined) this.target = LEVEL[name]; }
  duck(reason, on) { if (on) this.ducks.add(reason); else this.ducks.delete(reason); }
  // For the tests: what is playing, and how loud.
  get status() {
    const a = this.players[this.cur];
    return { playing: this.playing && !!a && !a.paused, at: a ? a.currentTime : 0, length: this.length, volume: a ? a.volume : 0, gain: this.gain, target: this.target, ducked: this.ducks.size > 0 };
  }
}
const clamp = v => Math.max(0, Math.min(1, v));

export const music = new Music();
