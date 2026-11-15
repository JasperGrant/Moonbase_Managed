// One Mission Control desk on one canvas (docs/design/mission-control-consoles.md, card "Desk").
//
// A desk is 1366 design pixels wide. Its height follows the laptop's screen between 16:9 (768) and 3:2 (911), so
// 16:9, 16:10 and 3:2 screens are filled with no scroll and no bars; anything wider or taller is letterboxed.
// The whole desk is scaled uniformly and drawn at the screen's pixel ratio, so it is sharp at any size.
//
// The frame is the same on every seat: a status strip along the top (the seat, the mission clock, suit oxygen,
// samples, the score, the crew, eight event lights) and a keyset along the bottom. Between them is the seat's own
// desk, from client/console/{ops,tech,sci,all}.js. Each seat is a layout: { back(g), live(g, s, t), holes, hits,
// glass, keyset(g, y, s) } in design pixels. back is drawn once per resize into its own layer; live every frame.
import { PAL } from '/shared/palette.js';
import { face, well, tile, label, typed, nixie, jewel, icon, edgewise, motion, blinkOn, GLASS_R } from './instruments.js';

export const DW = 1366, H_MIN = 768, H_MAX = 911;
export const TOP = 112, STRIP = 74, KEYS = 78, TT = { y: 81, h: 26 }; // TT: the teletype line under the strip
export const regionOf = H => ({ top: TOP, h: H - TOP - KEYS - 12, bottom: H - KEYS - 12 }); // the seat's own part

// The eight event lights, in the same order on every desk (D3). kind -> [icon, colour].
export const EVENTS = [['alarm', 'bell', 'red'], ['solve', 'fixed', 'green'], ['hit', 'meteor', 'red'], ['blackout', 'dark', 'red'],
  ['power', 'bolt', 'green'], ['found', 'banked', 'green'], ['dud', 'dud', 'amber'], ['link', 'link', 'red']];
const EV_LIGHT = { alarm: 'alarm', solve: 'solve', hit: 'hit', blackout: 'blackout', power: 'power', gen: 'power', found: 'found', dud: 'dud' };
const LIT_FOR = 6000, BLINK_FOR = 3000;

const SEATS = { astronaut: ['helmet', 'EVA'], ops: ['headset', 'OPS'], tech: ['wheel', 'TECH'], sci: ['lens', 'SCI'], all: ['headset', 'MC'] };

export function createDesk({ canvas, cam, seat, layoutFor, roundSeconds, linkOpen, teletype }) {
  const g = canvas.getContext('2d');
  const back = document.createElement('canvas'), bg = back.getContext('2d');
  const D = {
    W: DW, H: H_MIN, k: 1, dpr: 1, layout: null, state: null,
    keysDown: new Set(),
    events: {},            // light -> { t, amber }
    last: null,            // the light of the last event, kept at half brightness
    shown: {},             // what each instrument last drew, in words, for the tests
    hover: null,
  };

  function fit() {
    const vw = innerWidth, vh = innerHeight;
    D.H = Math.max(H_MIN, Math.min(H_MAX, Math.round(DW * vh / vw)));
    D.k = Math.min(vw / DW, vh / D.H);
    D.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(DW * D.k), ch = Math.round(D.H * D.k), left = Math.round((vw - cw) / 2), top = Math.round((vh - ch) / 2);
    Object.assign(canvas.style, { width: cw + 'px', height: ch + 'px', left: left + 'px', top: top + 'px' });
    const bw = Math.min(2732, Math.round(cw * D.dpr)), bh = Math.round(bw * D.H / DW);
    canvas.width = back.width = bw; canvas.height = back.height = bh;
    D.layout = layoutFor(DW, D.H);
    // The camera canvas covers only the monitors' glass (their bounding box), not the whole desk: a WebGL canvas
    // costs its whole area every frame, and most of the desk is not camera.
    const gl = D.layout.glass || [];
    D.camBox = gl.length ? { x: Math.min(...gl.map(r => r.x)), y: Math.min(...gl.map(r => r.y)), x1: Math.max(...gl.map(r => r.x + r.w)), y1: Math.max(...gl.map(r => r.y + r.h)) } : null;
    if (cam && D.camBox) { const b = D.camBox; Object.assign(cam.style, { left: Math.round(left + b.x * D.k) + 'px', top: Math.round(top + b.y * D.k) + 'px', width: Math.round((b.x1 - b.x) * D.k) + 'px', height: Math.round((b.y1 - b.y) * D.k) + 'px' }); }
    drawBack();
  }
  const scale = () => canvas.width / DW;

  // ---------- the layer that does not move ----------
  function drawBack() {
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, back.width, back.height);
    bg.setTransform(scale(), 0, 0, scale(), 0, 0);
    bg.fillStyle = PAL.bakelite; bg.fillRect(0, 0, DW, D.H);
    face(bg, 0, 0, DW, STRIP);
    face(bg, 0, D.H - KEYS, DW, KEYS);
    well(bg, 12, TT.y, DW - 24, TT.h);
    D.layout.back(bg);
    // Holes in the desk where a rover camera shows through from the canvas underneath.
    for (const r of D.layout.holes || []) { bg.save(); bg.beginPath(); bg.roundRect(r.x, r.y, r.w, r.h, GLASS_R); bg.clip(); bg.clearRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); bg.restore(); }
  }

  // ---------- the status strip ----------
  function strip(s, now) {
    const [ic, name] = SEATS[seat];
    well(g, 14, 12, 150, 50); icon(g, ic, 44, 37, 34, PAL.amber); label(g, name, 108, 38, 15, PAL.ink);
    const left = Math.max(0, s.timeLeft ?? roundSeconds), clock = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    icon(g, 'clock', 198, 37, 26, PAL.inkDim); nixie(g, clock, 262, 37, 30);
    const o2 = Math.max(0, s.oxygen ?? 100), o2v = o2 / (s.o2Max || 100);
    icon(g, 'o2', 338, 37, 28, o2 < 25 && blinkOn() ? PAL.red : PAL.inkDim); edgewise(g, 'strip-o2', 360, 26, 150, 22, o2v, 0.25); nixie(g, String(Math.round(o2)).padStart(3, ' '), 552, 37, 26);
    const t = s.tally || { banked: 0, wanted: 4 };
    icon(g, 'rock', 612, 37, 24, PAL.inkDim); for (let i = 0; i < t.wanted; i++) jewel(g, 644 + i * 26, 37, 8, 'green', i < t.banked);
    icon(g, 'score', 762, 37, 24, PAL.inkDim); nixie(g, String(s.score ?? 0).padStart(4, ' '), 818, 37, 26);
    // the crew: one lamp a seat, this seat's boxed in amber. The 2-player game has two seats.
    const crew = s.crew || [], seats = seat === 'all' ? ['astronaut', 'all'] : ['astronaut', 'ops', 'tech', 'sci'];
    const x0 = seat === 'all' ? 936 : 896;
    seats.forEach((r, i) => {
      const x = x0 + i * 40, on = crew.includes(r) || (r !== 'astronaut' && crew.includes('all'));
      if (r === seat) { g.strokeStyle = PAL.amber; g.lineWidth = 1.5; g.strokeRect(x - 17, 9, 34, 56); }
      icon(g, SEATS[r][0], x, 24, 20, r === seat ? PAL.ink : PAL.inkDim); jewel(g, x, 50, 7, 'green', on);
    });
    // the event lights
    if (!linkOpen()) D.events.link = { t: now };
    EVENTS.forEach(([light, ic, col], i) => {
      const e = D.events[light], age = e ? now - e.t : Infinity;
      let level = light === 'link' ? (linkOpen() ? 0 : 1) : age < LIT_FOR ? 1 : D.last === light ? 0.45 : 0;
      if (col === 'red' && age < BLINK_FOR && !blinkOn()) level = 0.45;
      tile(g, 1076 + i * 37, 37, 30, ic, light === 'power' && e?.amber ? 'amber' : col, level);
    });
    D.shown.clock = clock; D.shown.oxygen = Math.round(o2); D.shown.banked = t.banked; D.shown.score = s.score;
    D.shown.event = EVENTS.filter(([l]) => D.events[l] && now - D.events[l].t < LIT_FOR).map(([l]) => l);
    D.shown.last = D.last;
    // The teletype line (docs/SPEC-guidance.md, phase 1): what to do now, typed out, with a lamp that lights as a new line starts.
    // Danger lines in lamp red, faults in lamp amber (phase 3). At the right end, the GUIDE lamp: lit while the
    // guide is ON, dark on QUIET (only danger and faults), switched with G.
    const line = teletype?.(), tier = line?.tier;
    jewel(g, 30, TT.y + TT.h / 2, 6, tier === 1 ? 'red' : 'amber', !!line?.fresh);
    if (line?.text) typed(g, line.text + (line.typing || Math.floor(now / 500) % 2 ? '_' : ''), 48, TT.y + TT.h / 2 + 1, 14, tier === 1 ? PAL.red : tier === 2 ? PAL.amber : PAL.ink, 'left');
    jewel(g, D.W - 112, TT.y + TT.h / 2, 5, 'green', !line?.quiet);
    label(g, 'G  GUIDE', D.W - 66, TT.y + TT.h / 2 + 1, 9, PAL.inkDim);
    D.shown.teletype = line?.text || '';
    D.shown.guide = line?.quiet ? 'quiet' : 'on';
  }

  // ---------- every frame ----------
  function draw(s) {
    if (!D.layout) fit();
    const now = performance.now();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(back, 0, 0);
    g.setTransform(scale(), 0, 0, scale(), 0, 0);
    strip(s, now);
    D.layout.live(g, s, now);
    D.layout.keyset?.(g, D.H - KEYS / 2, s, D.keysDown);
    D.shown.keys = [...D.keysDown];
  }

  // ---------- pointer: design pixels, hit regions, names for hover ----------
  const at = e => { const b = canvas.getBoundingClientRect(); return { x: (e.clientX - b.left) * DW / b.width, y: (e.clientY - b.top) * D.H / b.height }; };
  const hitAt = p => (D.layout?.hits || []).find(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
  let downOn = null;
  canvas.addEventListener('pointerdown', e => { const p = at(e), h = hitAt(p); downOn = h; h?.down?.(p, e); });
  addEventListener('pointerup', e => { downOn?.up?.(at(e), e); downOn = null; });
  canvas.addEventListener('click', e => { const p = at(e); hitAt(p)?.click?.(p, e); });
  canvas.addEventListener('wheel', e => { const h = hitAt(at(e)); if (h?.wheel) { e.preventDefault(); h.wheel(e.deltaY); } }, { passive: false });
  canvas.addEventListener('pointermove', e => {
    const h = hitAt(at(e));
    if (h === D.hover) return;
    D.hover = h; canvas.title = h?.name ? (typeof h.name === 'function' ? h.name(D.state) : h.name) : '';
    canvas.style.cursor = h && (h.click || h.down) ? 'pointer' : 'default';
  });
  addEventListener('resize', fit);
  matchMedia?.('(resolution: 1dppx)')?.addEventListener?.('change', fit);

  return {
    D,
    fit,
    // The page's state arrived, or a frame is due.
    draw(s) { D.state = s; draw(s); },
    // An event happened: light its lamp (D3). The generator lights POWER BACK in amber (D4).
    event(kind) {
      const light = EV_LIGHT[kind]; if (!light) return;
      D.events[light] = { t: performance.now(), amber: kind === 'gen' }; D.last = light;
    },
    resetEvents() { D.events = {}; D.last = null; },
    key(code, down) { down ? D.keysDown.add(code) : D.keysDown.delete(code); },
    // Where the rover cameras go, in CSS pixels of the camera canvas (which starts at the glass's bounding box).
    glass() { const b = D.camBox; return b ? D.layout.glass.map(r => ({ x: (r.x - b.x) * D.k, y: (r.y - b.y) * D.k, w: r.w * D.k, h: r.h * D.k })) : []; },
    get swinging() { return motion.swinging; },
  };
}
