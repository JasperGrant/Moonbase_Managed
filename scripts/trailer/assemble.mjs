// Cuts the 30-second trailer from the recorded shots: node scripts/trailer/assemble.mjs
//
// Reads trailer/frames/<shot>/ (from record.mjs), lays the shots on the timeline below, draws the captions
// and the end title in the game's own type (Courier Prime teletype lines and Michroma, docs/DESIGN.md
// palette) in a browser canvas, and encodes trailer/moonbase-trailer.mp4 with the theme under it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'trailer'), FPS = 24, W = 1920, H = 1080;
const { chromium } = await import('playwright');

// The edit: each cut is [shot, seconds on screen, where in the shot it starts], plus its caption.
// Captions are teletype lines: { text, sub, at (seconds into the cut), lamp }.
const EDIT = [
  { shot: 'establish', len: 3.6, from: 0.1, cap: { text: 'TRANQUILITY BASE.', sub: 'ALL SYSTEMS NOMINAL.', at: 0.5, lamp: 'green' } },
  { shot: 'ops', len: 1.8, from: 0.2, push: [[0.5, 0.5, 1], [0.66, 0.16, 2.3]], cap: { text: 'UNTIL SOMETHING BREAKS.', at: 0.3, lamp: 'red' } },
  { shot: 'bound', len: 1.8, from: 0.7, cap: { text: 'ONE ASTRONAUT IN VR', at: 0.15, lamp: 'amber' } },
  { shot: 'weld', len: 2.0, from: 0.4, cap: { text: 'WELDS.', at: 0.3, lamp: 'amber' } },
  { shot: 'dust', len: 1.2, from: 1.0, cap: { text: 'SWEEPS.', at: 0.1, lamp: 'amber' } },
  { shot: 'brush', len: 1.4, from: 0.3, cap: { text: 'SWEEPS.', at: -1, lamp: 'amber' } },
  { shot: 'toss', len: 1.8, from: 0.5, cap: { text: 'THROWS THINGS.', at: 0.55, lamp: 'amber' } },
  { shot: 'tech', len: 2.0, from: 0.3, push: [[0.5, 0.42, 1.08], [0.75, 0.38, 1.75]], cap: { text: 'THREE FRIENDS AT MISSION CONTROL', at: 0.15, lamp: 'green' } },
  { shot: 'ride', len: 2.6, from: 0.3, cap: { text: 'DRIVE THE ROVERS.', sub: 'THERE ARE NO ROADS.', at: 0.2, lamp: 'amber' } },
  { shot: 'sci', len: 1.6, from: 0.3, push: [[0.5, 0.5, 1.1], [0.24, 0.5, 1.75]], cap: { text: 'READ THE INSTRUMENTS.', at: 0.15, lamp: 'green' } },
  { shot: 'meteor', len: 2.8, from: 0.1, cap: { text: 'MISSION CONTROL ADVISES:', sub: 'RUN.', at: 0.2, lamp: 'red' } },
  { shot: 'hero', len: 2.8, from: 0.1, cap: { text: 'BRING THE SAMPLES HOME.', at: 0.3, lamp: 'green' } },
  { shot: 'hero', len: 4.6, from: 2.9, title: true },
];
const TOTAL = EDIT.reduce((s, c) => s + c.len, 0);
const MUSIC_FROM = 70.2, FADE_OUT = 1.6; // the theme's quiet bar, so its full band comes in on the alarm

// Every frame of the trailer: which source picture, and what to draw over it.
const frames = [], missing = new Set();
let t0 = 0;
for (const [ci, c] of EDIT.entries()) {
  const n = Math.round(c.len * FPS);
  // A caption that carries on from the cut before (at < 0) is drawn fully typed.
  const carry = c.cap && c.cap.at < 0;
  for (let i = 0; i < n; i++) {
    const src = Math.round(c.from * FPS) + i;
    const file = path.join(OUT, 'frames', c.shot, String(src).padStart(4, '0') + '.jpg');
    if (!fs.existsSync(file)) { missing.add(c.shot); }
    let capT = null;
    if (c.cap) capT = carry ? 99 + i / FPS : i / FPS - c.cap.at;
    // A slow push in on a desk: [centre x, centre y, zoom] at the start and end of the cut, eased.
    let push = null;
    if (c.push) { const u = i / Math.max(1, n - 1), e = u * u * (3 - 2 * u); push = c.push[0].map((v, k) => v + (c.push[1][k] - v) * e); }
    frames.push({ push, file: fs.existsSync(file) ? path.relative(OUT, file) : null, cap: c.cap ? { ...c.cap, t: capT, end: c.len - i / FPS } : null, title: c.title ? i / FPS : null, global: t0 + i / FPS, cut: ci });
  }
  t0 += c.len;
}

if (missing.size) console.warn(`missing frames (record them, or start the cut earlier): ${[...missing].join(', ')}. Drawn as blank.`);

// The compositor page: draws one frame and hands it back.
const PAGE = `<!doctype html><html><head><style>
@font-face { font-family:"Michroma"; src:url(/client/fonts/michroma-400.woff2) format("woff2"); }
@font-face { font-family:"Courier Prime"; src:url(/client/fonts/courier-prime-700.woff2) format("woff2"); font-weight:700; }
html,body{margin:0;background:#1d1c19}</style></head><body><canvas id="c" width="${W}" height="${H}"></canvas>
<script type="module">
import { PAL } from '/client/shared/palette.js';
const W = ${W}, H = ${H};
const c = document.getElementById('c'), g = c.getContext('2d');
const LAMP = { green: [PAL.green, PAL.greenOff], amber: [PAL.amber, PAL.amberOff], red: [PAL.red, PAL.redOff] };
await Promise.all(['40px Michroma', 'bold 40px "Courier Prime"'].map(f => document.fonts.load(f)));
const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function jewel(x, y, r, col, on) {
  const [lit, off] = LAMP[col];
  g.save();
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, r + 4, 0, 7); g.fill();
  g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(x, y, r + 1.5, 0, 7); g.fill();
  if (on) { g.shadowColor = lit; g.shadowBlur = 6; }
  g.fillStyle = on ? lit : off; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.shadowBlur = 0; g.fillStyle = 'rgba(241,226,189,' + (on ? 0.45 : 0.12) + ')'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, 7); g.fill();
  g.restore();
}
// A teletype line on a plate, bottom left: typed in, with a cursor, the lamp beside it lit.
function caption(cap) {
  const CPS = 34, t = cap.t;
  if (t < 0) return;
  const out = Math.min(1, cap.end / 0.12);      // the plate clears in the last few frames of its cut
  const main = cap.text.slice(0, Math.floor(t * CPS)), subT = t - cap.text.length / CPS - 0.25;
  const sub = cap.sub && subT > 0 ? cap.sub.slice(0, Math.floor(subT * CPS)) : '';
  g.save(); g.globalAlpha = out;
  g.font = 'bold 40px "Courier Prime"';
  const tw = Math.max(g.measureText(cap.text).width, cap.sub ? g.measureText(cap.sub).width : 0);
  const x = 96, h = cap.sub ? 128 : 76, y = H - 96 - h, w = tw + 132;
  g.fillStyle = 'rgba(29,28,25,0.88)'; g.fillRect(x, y, w, h);
  g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.strokeStyle = PAL.rule; g.lineWidth = 1; g.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
  jewel(x + 40, y + 38, 11, cap.lamp, Math.floor(t * 3) % 2 === 0 || t > 0.9 || cap.lamp !== 'red');
  g.fillStyle = PAL.ink; g.textBaseline = 'middle';
  const blink = Math.floor(t * 4) % 2 === 0;
  g.fillText(main + (!cap.sub || subT <= 0 ? (blink ? '_' : '') : ''), x + 74, y + 39);
  if (cap.sub) { g.fillStyle = PAL.amber; g.fillText(sub + (subT > 0 && blink ? '_' : ''), x + 74, y + 91); }
  g.restore();
}
// The end title over the last of the victory shot: the name, then the four seats light one by one.
function title(t) {
  g.fillStyle = 'rgba(29,28,25,' + Math.min(0.78, t * 0.9) + ')'; g.fillRect(0, 0, ${W}, ${H});
  const a = Math.min(1, Math.max(0, (t - 0.3) / 0.6));
  g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '150px Michroma'; g.fillStyle = PAL.dial;
  if ('letterSpacing' in g) g.letterSpacing = '22px';
  g.fillText('MOONBASE', ${W / 2} + 11, 400 - (1 - a) * 18);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.beginPath(); g.moveTo(${W / 2} - 520 * a, 510); g.lineTo(${W / 2} + 520 * a, 510); g.stroke();
  g.font = 'bold 40px "Courier Prime"'; g.fillStyle = PAL.ink;
  const line = 'A CO-OP FIX-IT GAME FOR THE MOON', k = Math.floor(Math.max(0, t - 0.9) * 40);
  g.fillText(line.slice(0, k), ${W / 2}, 572);
  g.restore();
  // The crew: one headset, three laptops. Each lamp comes on GO.
  const seats = [['ASTRONAUT', 'HEADSET'], ['MISSION OPS', 'LAPTOP'], ['SCIENTIST', 'LAPTOP'], ['TECHNICIAN', 'LAPTOP']];
  seats.forEach(([who, on], i) => {
    const x = ${W / 2} + (i - 1.5) * 300, y = 700, lit = t > 1.9 + i * 0.32, seen = Math.min(1, Math.max(0, (t - 1.6) / 0.4));
    g.save(); g.globalAlpha = seen;
    jewel(x, y, 16, 'green', lit);
    g.textAlign = 'center'; g.font = '24px Michroma'; g.fillStyle = lit ? PAL.ink : PAL.inkDim; g.fillText(who, x, y + 54);
    g.font = 'bold 24px "Courier Prime"'; g.fillStyle = PAL.inkDim; g.fillText(on, x, y + 88);
    g.restore();
  });
  if (t > 3.3) { g.save(); g.globalAlpha = Math.min(1, (t - 3.3) / 0.3); g.textAlign = 'center'; g.font = 'bold 30px "Courier Prime"'; g.fillStyle = PAL.amber; g.fillText('NO ROADS REQUIRED.', ${W / 2}, 880); g.restore(); }
}
window.draw = async f => {
  if (f.file) {
    const img = await load('/' + f.file), iw = img.width, ih = img.height;
    if (f.push) {
      const [cx, cy, z] = f.push, sw = iw / z, sh = ih / z;
      const sx = Math.max(0, Math.min(iw - sw, cx * iw - sw / 2)), sy = Math.max(0, Math.min(ih - sh, cy * ih - sh / 2));
      g.drawImage(img, sx, sy, sw, sh, 0, 0, ${W}, ${H});
    } else g.drawImage(img, 0, 0, ${W}, ${H});
  }
  else { g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, ${W}, ${H}); }
  if (f.cap) caption(f.cap);
  if (f.title !== null) title(f.title);
  // In from dark at the very start, out to dark at the very end.
  const fade = Math.max(0, 1 - f.global / 0.5, (f.global - (${TOTAL} - 0.6)) / 0.6);
  if (fade > 0) { g.fillStyle = 'rgba(29,28,25,' + Math.min(1, fade) + ')'; g.fillRect(0, 0, ${W}, ${H}); }
  return c.toDataURL('image/jpeg', 0.94);
};
window.ready = true;
</script></body></html>`;

const MIME = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/') { res.setHeader('content-type', 'text/html'); return res.end(PAGE); }
  const file = url.startsWith('/client/') ? path.join(ROOT, url) : path.join(OUT, url);
  fs.readFile(file, (e, d) => { if (e) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(d); });
}).listen(3320);

const dir = path.join(OUT, 'frames', '_cut'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.error('compositor:', e.message));
  await page.goto('http://localhost:3320/');
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  const only = process.env.ASSEMBLE_ONLY ? new Set(process.env.ASSEMBLE_ONLY.split(',').map(Number)) : null;
  for (const [i, f] of frames.entries()) {
    if (only && !only.has(i)) continue;
    const url = await page.evaluate(f => window.draw(f), f);
    fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
} finally { await browser.close(); server.close(); }

if (process.env.ASSEMBLE_ONLY) { console.log('stills in ' + path.relative(ROOT, dir)); process.exit(0); }
// Encode: a little film grain, the theme from its quiet bar, faded out at the end.
const mp4 = path.join(OUT, 'moonbase-trailer.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'),
  '-ss', String(MUSIC_FROM), '-t', String(TOTAL), '-i', path.join(ROOT, 'client/assets/audio/theme.m4a'),
  '-filter_complex', `[0:v]noise=alls=3:allf=t,format=yuv420p[v];[1:a]afade=t=in:d=0.4,afade=t=out:st=${(TOTAL - FADE_OUT).toFixed(2)}:d=${FADE_OUT},loudnorm=I=-16:TP=-1.5[a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '10M', '-bufsize', '20M', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', mp4]);
console.log(`trailer: ${path.relative(ROOT, mp4)} (${TOTAL.toFixed(1)} s, ${frames.length} frames)`);
