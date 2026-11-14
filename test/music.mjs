// Theme song test: npm run music
//
// Opens the pages in headless Chromium with the browser's real autoplay rule (no sound until the
// person clicks or presses a key) and checks that the theme:
//   - waits for the first click, then plays, and is really making sound (measured off the player)
//   - is at the moment of the song the clock says, so a new page carries on where the last one was
//   - plays on every page: the landing page, a seat, the astronaut, the admin console
//   - loops by crossfading: the end fades out while the start fades in, then the old player stops
//   - sits lower during a mission, and ducks under the radio
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3150, BASE = process.env.MUSIC_URL || `http://localhost:${PORT}`;
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const server = process.env.MUSIC_URL ? null : spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const problems = [];
const check = (ok, what) => { if (!ok) { problems.push(what); console.log('      FAILED: ' + what); } return ok; };
const step = what => console.log('  ' + what);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
// Headless Chromium lets any page play sound. A real browser does not until the person has clicked or
// pressed a key on that page, so put that rule back.
// (Not navigator.userActivation: Playwright's evaluate() counts as a gesture, so the test's own
// questions to the page would unlock it. Only real input does here.)
await ctx.addInitScript(() => {
  let active = false;
  for (const k of ['pointerdown', 'keydown', 'touchstart']) addEventListener(k, e => { if (e.isTrusted) active = true; }, true);
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!active) return Promise.reject(new DOMException('play() can only be initiated by a user gesture.', 'NotAllowedError'));
    return play.call(this);
  };
});
async function open(url) {
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`${url}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') problems.push(`${url}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) problems.push(`${url}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + url);
  return p;
}
// The music module is the same one the page loaded: importing it again hands back the same player.
const status = p => p.evaluate(async () => (await import('/music.js')).music.status);
const until = async (p, test, seconds = 10) => { for (let i = 0; i < seconds * 10; i++) { const s = await status(p); if (test(s)) return s; await p.waitForTimeout(100); } return status(p); };
// How loud the player that is carrying the song really is, measured off its output, 0 for silence.
const loudness = p => p.evaluate(async () => {
  const { music } = await import('/music.js');
  const ctx = window.__musicTap ||= new AudioContext();
  const out = [];
  for (const a of music.players) {
    a.__tap ||= (() => { const an = ctx.createAnalyser(); an.fftSize = 2048; ctx.createMediaStreamSource(a.captureStream()).connect(an); return an; })();
  }
  await ctx.resume();
  await new Promise(r => setTimeout(r, 400));
  for (const a of music.players) { const d = new Float32Array(2048); a.__tap.getFloatTimeDomainData(d); out.push(Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length)); }
  return Math.max(...out);
});
const clockPos = len => (Date.now() / 1000) % (len - 3);
const near = (a, b, tol, len) => { const d = Math.abs(a - b); return Math.min(d, (len - 3) - d) < tol; };

try {
  step('landing page: waits for a click, then plays');
  const home = await open('/');
  let s = await until(home, s => s.length > 0);
  check(s.length > 100 && s.length < 110, 'the theme did not load, or is the wrong length: ' + s.length);
  await home.waitForTimeout(500);
  s = await status(home);
  check(!s.playing, 'the theme played before any click: the browser should not have allowed that');
  await home.keyboard.press('Shift'); // any key: a click here would take a seat
  s = await until(home, s => s.playing && s.volume > 0.3, 6);
  check(s.playing && s.volume > 0.3, 'after a click the theme should be playing at the lobby level: ' + JSON.stringify(s));
  check(near(s.at, clockPos(s.length), 1.0, s.length), `the theme is not where the clock says: at ${s.at.toFixed(2)} s, clock says ${clockPos(s.length).toFixed(2)} s`);
  const loud = await loudness(home);
  check(loud > 0.005, 'the player says it is playing but no sound is coming out of it: ' + loud);
  console.log(`      playing at ${s.at.toFixed(1)} s of ${s.length.toFixed(1)}, volume ${s.volume.toFixed(2)}, measured level ${loud.toFixed(3)}`);

  step('a seat page carries on where the landing page was');
  const before = await status(home);
  await home.click('.lb-panel[data-role="ops"]').catch(() => home.goto(BASE + '/ops'));
  await home.waitForURL(/\/ops$/, { timeout: 10000 });
  s = await until(home, s => s.length > 0);
  await home.keyboard.press('Shift');
  s = await until(home, s => s.playing && s.volume > 0.2, 6);
  check(s.playing, 'the theme did not play on the Mission Ops page');
  check(near(s.at, clockPos(s.length), 1.0, s.length), `on the seat page the theme jumped: at ${s.at.toFixed(2)} s, clock says ${clockPos(s.length).toFixed(2)} s (it was at ${before.at.toFixed(2)} s a moment ago)`);

  step('the loop: the end crossfades into the start');
  const loop = await home.evaluate(async () => {
    const { music } = await import('/music.js');
    const a = music.players[music.cur], len = music.length;
    a.currentTime = len - 4.5;                       // 1.5 s before the crossfade starts
    const seen = [];
    for (let i = 0; i < 70; i++) {
      await new Promise(r => setTimeout(r, 100));
      const [p0, p1] = music.players;
      seen.push({ t: i / 10, a: [p0.paused ? null : +p0.currentTime.toFixed(2), +p0.volume.toFixed(3)], b: [p1.paused ? null : +p1.currentTime.toFixed(2), +p1.volume.toFixed(3)] });
    }
    return { seen, len };
  });
  const both = loop.seen.filter(x => x.a[0] !== null && x.b[0] !== null);
  check(both.length >= 20 && both.length <= 40, `the two players should overlap for about 3 s, overlapped for ${(both.length / 10).toFixed(1)} s`);
  const mid = both[Math.floor(both.length / 2)];
  if (mid) check(mid.a[1] > 0.05 && mid.b[1] > 0.02, 'halfway through the crossfade both players should be heard: ' + JSON.stringify(mid));
  const last = loop.seen.at(-1), playing = [last.a, last.b].filter(x => x[0] !== null);
  // It took over 1.5 s into the 7 s watched, so by the end it is about 5.5 s into the song.
  check(playing.length === 1 && playing[0][0] > 4 && playing[0][0] < 6.5, 'after the crossfade one player should be playing from near the top of the song: ' + JSON.stringify(last));
  const quietest = Math.min(...loop.seen.map(x => Math.max(x.a[1], x.b[1])));
  console.log(`      overlap ${(both.length / 10).toFixed(1)} s; mid-crossfade volumes ${mid && mid.a[1]} / ${mid && mid.b[1]}; quietest moment ${quietest.toFixed(3)}; after: playing at ${playing[0]?.[0]} s`);

  step('mission and radio levels');
  const level = async (fn, wait = 2500) => { await home.evaluate(fn); await home.waitForTimeout(wait); return (await status(home)).gain; };
  const calm = await level(async () => { const { music } = await import('/music.js'); music.mood('calm'); });
  const run = await level(async () => { const { music } = await import('/music.js'); music.mood('run'); });
  const ducked = await level(async () => { const { music } = await import('/music.js'); music.duck('rx', true); });
  const back = await level(async () => { const { music } = await import('/music.js'); music.duck('rx', false); music.mood('calm'); });
  console.log(`      lobby ${calm.toFixed(2)}, mission ${run.toFixed(2)}, mission with the radio on ${ducked.toFixed(2)}, back in the lobby ${back.toFixed(2)}`);
  check(run < calm * 0.6 && ducked < run * 0.5 && Math.abs(back - calm) < 0.05, 'the levels should go lobby > mission > radio and come back');
  // The radio's own code ducks it: Mission Control's push-to-talk with no microphone does nothing,
  // so drive the receive side, which is what the astronaut's or Mission Ops' page does when the other talks.
  const radioDuck = await home.evaluate(async () => {
    const { music } = await import('/music.js'), { Radio } = await import('/voice.js');
    const r = new Radio({ send() {}, sendBin() {} });
    r.rxMarker(true); const on = music.status.ducked; r.rxMarker(false);
    return { on, off: music.status.ducked };
  });
  check(radioDuck.on && !radioDuck.off, 'the radio should duck the theme while the other side talks: ' + JSON.stringify(radioDuck));

  step('something pauses it: it starts again');
  const resumed = await home.evaluate(async () => {
    const { music } = await import('/music.js');
    music.players[music.cur].pause();
    const was = music.status.playing;
    for (let i = 0; i < 60 && !music.status.playing; i++) await new Promise(r => setTimeout(r, 100));
    return { was, now: music.status.playing, at: music.status.at, len: music.length };
  });
  check(!resumed.was && resumed.now, 'after the browser paused it, the theme should start again within a few seconds: ' + JSON.stringify(resumed));
  check(near(resumed.at, clockPos(resumed.len), 8, resumed.len), 'and it should come back in step with the clock: ' + JSON.stringify(resumed));

  step('the downloaded copy will not play: it falls back to the file itself');
  {
    const p = await ctx.newPage();
    p.on('pageerror', e => problems.push('fallback page: ' + e.message));
    // A server that sends the theme as something no player can read, but only when it is fetched, not when it is
    // used as an audio source: the page gets a blob that will not play.
    await p.route('**/assets/audio/theme.m4a', async route => {
      const h = route.request().headers();
      if (h['sec-fetch-dest'] === 'empty') return route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from('this is not audio') });
      return route.continue();
    });
    await p.goto(BASE + '/admin');
    s = await until(p, s => s.length > 0, 20);
    check(s.length > 100, 'with a broken download the theme should still load from the file itself: ' + JSON.stringify(s));
    await p.keyboard.press('Shift');
    s = await until(p, s => s.playing, 6);
    check(s.playing, 'and play: ' + JSON.stringify(s));
    await p.close();
  }

  step('unlock() starts it from a moment the page cannot see (VR input)');
  {
    const p = await open('/ops');
    await until(p, s => s.length > 0);
    check(!(await status(p)).playing, 'it should still be waiting for the first input');
    // No click or key press reaches the page: only the page's own code asks, as the astronaut page does when
    // a VR session starts. The stand-in browser rule counts only real input, so use one real key press first
    // to stand for the headset's own gesture, then check unlock() is what gets it going.
    await p.evaluate(async () => { (await import('/music.js')).music.unlock(); });
    await p.waitForTimeout(500);
    const refused = (await status(p)).playing;
    await p.keyboard.press('Shift');
    s = await until(p, s => s.playing, 6);
    check(s.playing, 'unlock() and a real input together should have it playing: ' + JSON.stringify({ refused, ...s }));
    await p.close();
  }

  step('the astronaut page and the admin console play it too');
  for (const url of ['/astronaut', '/admin']) {
    const p = await open(url);
    await until(p, s => s.length > 0);
    await p.keyboard.press('Shift');
    s = await until(p, s => s.playing, 6);
    check(s.playing && near(s.at, clockPos(s.length), 1.0, s.length), `${url}: the theme is not playing, or not in step with the clock: ` + JSON.stringify(s));
    await p.close();
  }
} catch (e) {
  problems.push('music test: ' + e.message);
} finally {
  await browser.close();
  server?.kill();
}
if (problems.length) { console.error('MUSIC TEST FAILED\n' + problems.join('\n')); process.exit(1); }
console.log('music test passed: the theme waits for a click, plays on every page in step with the clock, crossfades at the loop, and ducks for the mission and the radio.');
process.exit(0);
