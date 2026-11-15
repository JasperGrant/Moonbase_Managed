// Records the trailer's shots: node scripts/trailer/record.mjs [shot,shot,...]   (no names: every shot)
//
// Three kinds of footage, all from the game's own code, each drawn one frame at a time so it plays
// smooth however slowly this machine draws (SwiftShader takes a second or two a frame):
//   film  the film set (scripts/trailer/film.js): the Moon, the astronaut figure, both rovers, from a scripted camera
//   vr    the astronaut's real page in a pretend headset (test/fakexr.js), one eye, hands scripted frame by frame
//   desk  a Mission Control desk (client/console.html) under Playwright's clock, the real game hub in this process
// Frames go to trailer/frames/<shot>/, each shot is encoded to trailer/clips/<shot>.mp4. assemble.mjs cuts the trailer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { filmServer, ghost } from './serve.mjs';
import { Game } from '../../server/game.js';
import { PLACES, HAULER, CRACK_POINTS } from '../../client/shared/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
// TRAILER_SCALE=0.5 draws at half size, for trying a shot out quickly (assemble.mjs scales it back up).
const SCALE = +(process.env.TRAILER_SCALE || 1);
const OUT = path.join(ROOT, 'trailer'), FPS = 24, DT = 1 / FPS, W = Math.round(1920 * SCALE), H = Math.round(1080 * SCALE);
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed (it is preinstalled in cloud sessions).'); process.exit(2); }
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// ---------- small maths for the camera moves ----------
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = u => Math.max(0, Math.min(1, u));
const ease = u => { u = clamp01(u); return u * u * (3 - 2 * u); };
const easeOut = u => 1 - Math.pow(1 - clamp01(u), 3);
const easeIn = u => Math.pow(clamp01(u), 3);
const mix = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));
const span = (t, t0, t1) => clamp01((t - t0) / (t1 - t0));
const shake = (t, amp, f = 23) => [Math.sin(t * f) * amp, Math.sin(t * f * 1.31 + 1.7) * amp * 0.7, Math.sin(t * f * 0.77 + 0.4) * amp];
const add = (a, b) => a.map((v, i) => v + b[i]);
// A low-gravity bound: up and down every `period` seconds, `top` metres at the top.
const hop = (t, period, top) => { const u = (t / period) % 1; return 4 * top * u * (1 - u); };
const face = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

function framesDir(shot) { const d = path.join(OUT, 'frames', shot); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; }
const save = (dir, n, url) => fs.writeFileSync(path.join(dir, String(n).padStart(4, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
function encode(shot) {
  fs.mkdirSync(path.join(OUT, 'clips'), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'frames', shot, '%04d.jpg'),
    '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', path.join(OUT, 'clips', shot + '.mp4')]);
}
const log = (shot, what) => console.log(`  ${shot.padEnd(9)} ${what}`);

// ---------- film shots ----------
// Each returns { seconds, setup(game), frame(t, game) -> the film set's frame spec }.
// The game (server/game.js) supplies what is broken (Game.scene()); the shot poses everyone else.
const parked = { scout: { x: -7.2, z: 4.2, ry: 1.1, v: 0 }, hauler: { x: PLACES.rovers.hauler.x, z: PLACES.rovers.hauler.z, ry: -0.5, v: 0 } };
const CRACK = PLACES.cracks[1];                      // south-west of the dome, in the low sun
const PANEL = PLACES.panels[1];
const FILM = {
  // Low over the regolith, craning up to the base; the astronaut by airlock S turns and waves.
  establish: {
    seconds: 3.8,
    frame(t, g) {
      const u = ease(t / 3.8);
      const me = [-1.4, 6.2];
      const cam = add(mix([-7.5, 0.5, 25], [-5.0, 2.0, 15.5], u), shake(t, 0.004, 3));
      const wave = t > 1.5 ? [0.38 + Math.sin((t - 1.5) * 9) * 0.12, 2.05, 0.15] : null;
      return { cam: { pos: cam, look: mix([-1.2, 1.4, 4], [-1.1, 2.4, 2.5], u), fov: lerp(36, 42, u) },
        astro: { x: me[0], z: me[1], ry: lerp(-2.6, face(me, [cam[0], cam[2]]), ease(span(t, 0.6, 1.6))), h: 1.65, arms: [null, wave] },
        rovers: parked, scene: g.scene() };
    },
  },
  // The astronaut bounds across the regolith with the welder, low-gravity leaps, the camera tracking alongside.
  bound: {
    seconds: 2.6,
    frame(t, g) {
      const z = lerp(9.6, 4.6, t / 2.6), x = -2.6, up = t < 2.1 ? hop(t, 0.7, 0.62) : 0;
      // The last landing is a wobble: they pitch forward, windmill, and catch it.
      const wob = t > 2.1 ? Math.sin((t - 2.1) * 14) * Math.exp(-(t - 2.1) * 4) * 0.28 : 0;
      const flail = t > 2.1 ? Math.sin((t - 2.1) * 22) * 0.25 : 0;
      const air = up > 0.15;
      return { cam: { pos: add([-9.2, 0.75, z - 0.9], shake(t, 0.008, 4)), look: [x, 1.25 + up * 0.35, z - 0.4], fov: 31 },
        astro: { x, z, ry: Math.PI, h: 1.65, y: up, tilt: wob,
          arms: [air || t > 2.1 ? [-0.45, 1.95 + flail, 0.2] : [-0.32, 1.2, 0.3], air || t > 2.1 ? [0.45, 1.85 - flail, 0.25] : [0.35, 1.35, 0.35]] },
        held: [null, 'welder'], rovers: { scout: { x: -5.5, z: 13.5, ry: 2.4, v: 0 }, hauler: parked.hauler }, scene: g.scene() };
    },
  },
  // Dust on the solar array. The astronaut sweeps; the dust slumps off in a cloud.
  dust: {
    seconds: 2.6,
    setup(g) { g.break('dust'); },
    frame(t, g) {
      const cells = g.faults.dust.cells, n = Math.floor(span(t, 0.4, 2.3) * 7);
      for (let i = 0; i < n; i++) cells[6 + i] = false;     // the middle panel, cell by cell, where the brush is
      const me = [PANEL.x - 0.95, PANEL.z - 0.2], sw = Math.sin(t * 7.5);
      return { cam: { pos: mix([PANEL.x - 2.6, 0.7, PANEL.z + 3.6], [PANEL.x - 2.1, 0.9, PANEL.z + 2.9], ease(t / 2.6)), look: [PANEL.x - 0.2, 1.35, PANEL.z - 0.3], fov: 44 },
        astro: { x: me[0], z: me[1], ry: 1.3, h: 1.6, arms: [[-0.25, 1.25, 0.25], [0.15 + sw * 0.45, 1.45 + Math.cos(t * 7.5) * 0.12, 0.62]] },
        held: [null, 'brush'], rovers: parked, scene: g.scene() };
    },
  },
  // The Hauler rolls up the field with the astronaut riding its footplate; the Scout photobombs, wiping across
  // the frame between the camera and the Hauler, far too close. The rider throws their arms up.
  ride: {
    seconds: 3.0,
    frame(t, g) {
      const hry = 0, hx = 1.6, hz = lerp(6.0, 14.0, t / 3.0);
      const plate = [hx + Math.sin(hry) * HAULER.plate.z, hz + Math.cos(hry) * HAULER.plate.z];
      const cam0 = [-6.2, 0.8, hz + 0.6];
      // The Scout comes the other way, 3.4 m in front of the lens: in from screen right, out to the left.
      const sz = lerp(hz + 9, hz - 9, span(t, 1.0, 2.3)), sx = cam0[0] + 3.4;
      const rovers = { hauler: { x: hx, z: hz, ry: hry, v: 3.0 }, scout: { x: sx, z: sz, ry: Math.PI, v: 4 } };
      const near = Math.exp(-Math.pow((sz - cam0[2]) / 2.5, 2)); // how close it is to passing the lens
      const startled = t > 1.75;
      return { cam: { pos: add(cam0, shake(t, 0.004 + 0.04 * near, 29)), look: add([hx, 1.3, hz - 0.2], shake(t + 7, 0.08 * near, 19)), fov: 36, roll: 0.04 * near * Math.sin(t * 17) },
        astro: { ride: { x: plate[0], z: plate[1], ry: lerp(hry, -Math.PI / 2 + 0.35, ease(span(t, 1.7, 2.0))), y: HAULER.plate.y }, h: 1.65,
          arms: startled ? [[-0.5, 2.0 + Math.sin(t * 13) * 0.08, 0.25], [0.5, 2.0 - Math.sin(t * 13) * 0.08, 0.25]] : [[-0.42, 1.35, 0.2], [0.42, 1.35, 0.2]] },
        rovers, scene: g.scene() };
    },
  },
  // A meteor shower walks in on the base; the astronaut legs it toward the camera, arms up.
  meteor: {
    seconds: 3.0,
    frame(t, g) {
      const from = [3.2, 4.6], to = [-1.6, 11.2], at = mix(from, to, t / 3.0);
      const sc = g.scene(); sc.meteor = 3.4 + t * 0.9;
      const k = 0.015 + 0.03 * t;
      return { cam: { pos: add([-3.6, 0.75, 15.2], shake(t, k, 17)), look: add([1.0, 1.7, 5.5], shake(t + 3, k * 1.6, 11)), fov: 44 },
        astro: { x: at[0], z: at[1], ry: face(from, to), h: 1.65, y: hop(t, 0.62, 0.55), arms: [[-0.3, 2.05 + Math.sin(t * 15) * 0.1, 0.25], [0.3, 2.05 - Math.sin(t * 15) * 0.1, 0.25]] },
        rovers: parked, scene: sc };
    },
  },
  // Mission accomplished: a victory leap, Earth on the skyline behind.
  hero: {
    seconds: 7.6, // the end title plays over the last of it
    frame(t, g) {
      const me = [-12, 8], up = t > 0.4 && t < 2.6;
      // Low and in front for the leap, then round behind them as they turn to look at Earth.
      const u = ease(span(t, 2.6, 6.8));
      const cam = mix([-12.3, 0.4, 11.9], [-13.7, 0.55, 11.6], u);
      const look = mix([-12, 1.8, 6], [-11.4, 1.65, 4], u);
      const ry = lerp(0, 3.0, ease(span(t, 3.0, 4.6)));
      return { cam: { pos: cam, look, fov: lerp(46, 44, u) },
        astro: { x: me[0], z: me[1], ry, h: 1.65, y: up ? hop(t - 0.4, 1.1, 0.75) : 0, arms: up ? [[-0.35, 2.15, 0.1], [0.35, 2.15, 0.1]] : [null, null] },
        rovers: parked, scene: g.scene() };
    },
  },
};

async function recordFilm(browser, server, names) {
  for (const shot of names) {
    const S = FILM[shot];
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', e => console.error('film page:', e.message));
    await page.goto(`http://localhost:${server.port}/film/film.html?w=${W}&h=${H}`);
    await page.waitForFunction(() => window.film, null, { timeout: 120000 });
    await page.evaluate(() => window.filmReady);
    const g = new Game(() => 0.42); g.start(); g.script = []; g.timeLeft = 150;
    S.setup?.(g);
    const dir = framesDir(shot), n = Math.round(S.seconds * FPS), t0 = Date.now();
    // Two frames to settle (the figure eases into its first pose), not kept.
    for (let i = -2; i < n; i++) {
      const t = Math.max(0, i) * DT, f = S.frame(t, g);
      const url = await page.evaluate(f => window.film.frame(f), { ...f, t: 100 + t, dt: DT });
      if (i >= 0) save(dir, i, url);
    }
    await page.close();
    encode(shot);
    log(shot, `${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}

// ---------- first-person shots, in a pretend headset ----------
// Each: { seconds, place(P, g): set the scene up, frame(t, P): pose head and hands for time t }.
// P runs a function in the page with window.rec (scripts/trailer/vrrig.js) as its argument.
const VR = {
  // Welding the crack: each point glows, beads, and the sparks fly.
  weld: {
    seconds: 3.0,
    async place(P, g, kit) {
      g.break('hull'); g.faults.hull.spot = 0;     // south-east of the dome, clear of the airlocks, in the shade
      await P(r => r.run(30, 40));
      const c = await P(r => { const u = r.mb.world.fixtures.crack.userData; return { x: u.centre.x, z: u.centre.z, nx: u.normal.x, nz: u.normal.z }; });
      await P((r, c) => r.stand(c.x + c.nx * 0.78, c.z + c.nz * 0.78, c.x, c.z, 1.66), c);
      await kit('welder');
    },
    frame: (t) => ({ t, fn: (r, t) => {
      const c = r.mb.world.fixtures.crack.userData, pts = r.mb.world.fixtures.crackPts;
      const k = Math.min(pts.length - 1, Math.floor(Math.max(0, t - 0.35) / 0.43));
      // The torch comes in from low on the right, angled up into the seam.
      const into = c.normal.clone().negate().add(r.V(0, 0.35, 0)).normalize();
      const here = pts[k].clone().addScaledVector(c.normal, 0.03);
      const away = c.centre.clone().addScaledVector(c.normal, 0.4).add(r.V(0, -0.3, 0));
      const at = t < 0.35 ? away.clone().lerp(pts[0].clone().addScaledVector(c.normal, 0.03), t / 0.35) : here;
      r.tip('right', 'welder', at, into);
      const side = r.V(-c.normal.z, 0, c.normal.x);
      r.hand('left', c.centre.clone().addScaledVector(c.normal, 0.28).addScaledVector(side, 0.32).add(r.V(0, -0.12, 0)), c.normal.clone().negate());
      // The head follows the torch, a little behind it.
      r.mb.rig.updateMatrixWorld(true);
      const eye = r.mb.rig.worldToLocal(at.clone()).sub(r.V(0, r.X.dev.head.p[1], 0));
      r.head(Math.atan2(-eye.x, -eye.z) * 0.6, Math.atan2(eye.y, Math.hypot(eye.x, eye.z)) * 0.6 - 0.12);
    } }),
  },
  // Brushing the solar panel: the dust comes away in a cloud.
  brush: {
    seconds: 2.4,
    async place(P, g, kit) {
      g.break('dust');
      await P(r => r.run(30, 40));
      const p = await P(r => { const c = r.mb.world.fixtures.dustCells[7], p = r.wp(c), n = c.getWorldDirection(new r.T.Vector3()); return { x: p.x, z: p.z, nx: n.x, nz: n.z }; });
      await P((r, p) => r.stand(p.x + p.nx * 0.85, p.z + p.nz * 0.85, p.x, p.z, 1.66), p);
      await kit('brush');
    },
    frame: (t) => ({ t, fn: (r, t) => {
      const F = r.mb.world.fixtures, row = t < 1.2 ? 0 : 1, cells = [0, 1, 2].map(c => F.dustCells[6 + row * 3 + c]);
      const n = cells[0].getWorldDirection(new r.T.Vector3());
      const into = n.clone().negate().add(r.V(0, 0.55, 0)).normalize(); // the handle comes up from below
      const at = c => r.wp(c).addScaledVector(n, 0.04);
      const mid = at(cells[1]), along = at(cells[2]).sub(at(cells[0])).normalize();
      const u = row ? 1 - (t - 1.2) / 1.2 : t / 1.2;
      r.tip('right', 'brush', mid.clone().addScaledVector(along, (u - 0.5) * 1.1), into);
      r.head(-0.04 + (u - 0.5) * 0.18, -0.38);
    } }),
  },
  // In the hall: wind up, and lob the brush down the hall. It bounces off into the distance.
  toss: {
    seconds: 2.6,
    async place(P, g, kit) {
      await P((r) => { r.thrown = false; r.stand(500 + 0.9, -6.4, 500 + 0.4, -12, 1.66); });
      await kit('brush');
    },
    frame: (t) => ({ t, fn: (r, t) => {
      const mb = r.mb, q = mb.rig.quaternion, head = r.wp(mb.camera);
      const P = (x, y, z) => head.clone().add(r.V(x, y, z).applyQuaternion(q));
      const fwd = r.V(0, 0.2, -1).applyQuaternion(q);
      const L = (a, b, u) => a.clone().lerp(b, Math.max(0, Math.min(1, u)));
      const hold = P(0.22, -0.42, -0.4), back = P(0.34, 0.08, 0.15), out = P(0.12, 0.02, -0.75);
      if (t < 0.5) r.hand('right', L(hold, hold, 0), fwd);
      else if (t < 1.0) r.hand('right', L(hold, back, (t - 0.5) / 0.5), r.V(0, 1, 0.3).applyQuaternion(q));
      else if (t < 1.25) {
        r.hand('right', L(back, out, (t - 1.0) / 0.25), fwd);
        // Let go mid-swing. At 24 frames a second the game's hand trail reads this as a drop, so the lob is
        // given to the tool's physics body directly: up the hall, under lunar gravity, tumbling.
        if (t > 1.12 && !r.thrown) {
          r.thrown = true; mb.fx.give(null); r.X.squeeze('right', false);
          const v = r.V(0.15, 0.55, -1).applyQuaternion(q).normalize().multiplyScalar(5.6);
          mb.phys.release('brush', v.toArray(), [7, 2, 4]);
        }
      } else r.hand('right', L(out, P(0.25, -0.5, -0.3), (t - 1.25) / 0.6));
      r.hand('left', P(-0.25, -0.5, -0.35));
      r.head(t < 1.0 ? 0.04 : 0, t < 1.0 ? -0.15 : -0.05 - Math.max(0, t - 1.3) * 0.06);
    } }),
  },
};

async function recordVR(browser, server, names) {
  const { hub, game: g } = server;
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  for (const f of ['test/briefed.js', 'test/fakexr.js', 'scripts/trailer/vrrig.js']) await ctx.addInitScript({ path: path.join(ROOT, f) });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('astronaut page:', e.message));
  const P = (fn, arg) => page.evaluate(fn, arg);
  const PR = (fn, arg) => page.evaluate(([src, arg]) => (0, eval)(src)(window.rec, arg), [fn.toString(), arg]);
  const tick = setInterval(() => { if (g.phase === 'run') { g.timeLeft = 150; g.oxygen = 80; } hub.tick(); }, 100);
  try {
    await page.goto(`http://localhost:${server.port}/astronaut?device=headset`);
    await page.waitForTimeout(3000);
    await page.click('#radioBtn');
    await page.waitForFunction(() => /ENTER VR/i.test(document.querySelector('#vrSlot button')?.textContent || ''), null, { timeout: 60000, polling: 200 });
    await page.click('#vrSlot button');
    await page.waitForFunction(() => window.moonbase.renderer.xr.isPresenting && window.fakeXR.dev.frame > 3, null, { timeout: 60000, polling: 200 });
    g.start(); g.script = [];
    await page.waitForTimeout(3000);
    await P(() => { window.rec.install(); window.rec.manual(); });
    // Put a tool straight in a hand (or empty both), on the server's word and the page's.
    const kit = async (tool, side = 'right') => {
      for (const t of g.hands) if (t && t !== tool) Object.assign(g.tools[t], { at: 'loose', inside: !!g.astro.inside, x: g.astro.x, y: 0, z: g.astro.z });
      g.hands = [null, null];
      if (tool) { g.tools[tool].at = 'hand'; g.hands[side === 'left' ? 0 : 1] = tool; }
      await P(({ tool, side }) => { const r = window.rec; r.mb.fx.give(null); if (tool) { r.X.squeeze(side, true); r.mb.fx.give(tool, r.idx(side)); } }, { tool, side });
      for (let i = 0; i < 40; i++) { await P(r => window.rec.run(1, 40)); await page.waitForTimeout(40); }
    };
    for (const shot of names) {
      const S = VR[shot];
      // Back to a clean mission for each shot: every tool home, nothing broken.
      for (const id of Object.keys(g.faults)) delete g.faults[id];
      g.tools = g.layTools(); g.hands = [null, null];
      await P(() => window.rec.mb.fx.give(null));
      await S.place((fn, arg) => PR(fn, arg), g, kit);
      const dir = framesDir(shot), n = Math.round(S.seconds * FPS), t0 = Date.now();
      for (let i = 0; i < n; i++) {
        const { fn } = S.frame(i * DT);
        await PR(fn, i * DT);
        save(dir, i, await P(ms => window.rec.frame(ms), DT * 1000));
        await page.waitForTimeout(15); // let the server hear what the hands did
      }
      // Leave hands open for the next shot.
      await P(() => { const X = window.fakeXR; for (const s of ['left', 'right']) { X.squeeze(s, false); X.trigger(s, false); } });
      encode(shot);
      log(shot, `${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  } finally { clearInterval(tick); await ctx.close(); }
}

// ---------- Mission Control desks ----------
// The page runs on Playwright's clock: paused, then moved on one frame at a time, with the hub ticked by
// hand in between, so the lamps blink and the needles swing at their real pace in the footage.
const DESK = {
  // Mission Ops: the hull alarm goes off.
  ops: {
    seat: 'ops', seconds: 2.2,
    setup(g) { g.oxygen = 74; },
    each(t, g) { if (t > 0.5 && !g.faults.hull) g.break('hull'); g.oxygen = 74 - Math.max(0, t - 0.5) * 3; },
  },
  // The Technician drives both rovers at once.
  tech: {
    seat: 'tech', seconds: 2.6,
    setup(g) { g.rovers.scout = { ...g.rovers.scout, x: -4, z: 12, ry: 0.15 }; g.rovers.hauler = { ...g.rovers.hauler, x: 5, z: 13, ry: -0.35 }; },
    each(t, g) {
      const s = g.rovers.scout, h = g.rovers.hauler;
      Object.assign(s, { ry: 0.15 + Math.sin(t * 1.4) * 0.5, v: 5, throttle: 0, steer: 0, w: 0 });
      s.x += Math.sin(s.ry) * 5 * DT; s.z += Math.cos(s.ry) * 5 * DT;
      Object.assign(h, { ry: -0.35 + t * 0.25, v: 2.5, throttle: 0, steer: 0, w: 0 });
      h.x += Math.sin(h.ry) * 2.5 * DT; h.z += Math.cos(h.ry) * 2.5 * DT;
    },
  },
  // The Scientist's survey scope, the leak lamp lit.
  sci: {
    seat: 'sci', seconds: 2.2,
    setup(g) { g.break('hull'); g.rovers.scout = { ...g.rovers.scout, x: -10, z: 16 }; },
    each(t, g) { const s = g.rovers.scout; s.x += 4 * DT; s.z += 3 * DT; s.ry = 0.9; g.mark(s.x, s.z, 9); g.oxygen = 66 - t * 2; },
  },
};

async function recordDesk(browser, server, names) {
  const { hub, game: g } = server;
  hub.lag = () => 0; hub.radioLag = () => 0;
  const astro = ghost(hub, 'astronaut');
  for (const shot of names) {
    const S = DESK[shot];
    for (const id of Object.keys(g.faults)) delete g.faults[id];
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.4057 * SCALE }); // 1366 x 768 drawn at 1920 x 1080
    await ctx.addInitScript({ path: path.join(ROOT, 'test/briefed.js') });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error('desk page:', e.message));
    await page.clock.install();
    const others = ['ops', 'sci', 'tech'].filter(r => r !== S.seat).map(r => ghost(hub, r));
    const tick = setInterval(() => hub.tick(), 100);
    await page.goto(`http://localhost:${server.port}/${S.seat}`);
    await page.waitForTimeout(4000);
    if (g.phase !== 'run') { g.start(); }
    g.script = []; g.timeLeft = 151; g.next = Infinity;
    S.setup?.(g);
    await page.waitForTimeout(4000);
    clearInterval(tick);
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
    const dir = framesDir(shot), n = Math.round(S.seconds * FPS), t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      S.each?.(t, g);
      g.timeLeft = 151 - t; // the mission clock runs
      hub.last = Date.now() - DT * 1000; hub.tick();
      await page.waitForTimeout(40);
      await page.clock.runFor(Math.round(DT * 1000));
      const buf = await page.screenshot({ type: 'jpeg', quality: 93, timeout: 600000 });
      fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), buf);
    }
    for (const o of others) hub.remove(o);
    await ctx.close();
    encode(shot);
    log(shot, `${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  hub.remove(astro);
}

// ---------- run ----------
export { FILM, VR, DESK };
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const want = (process.argv[2] || '').split(',').filter(Boolean);
  const pick = set => Object.keys(set).filter(k => !want.length || want.includes(k));
  const server = await filmServer(3310); server.port = 3310;
  server.hub.choosePlayers(4);
  const browser = await chromium.launch({ args: [...GL, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    if (pick(FILM).length) await recordFilm(browser, server, pick(FILM));
    if (pick(DESK).length) await recordDesk(browser, server, pick(DESK));
    if (pick(VR).length) await recordVR(browser, server, pick(VR));
  } finally { await browser.close(); server.close(); }
  console.log(`clips in ${path.relative(ROOT, path.join(OUT, 'clips'))}/`);
  process.exit(0);
}
