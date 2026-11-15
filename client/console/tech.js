// The Technician's desk (docs/design/mission-control-consoles.md, 6.3): two monitors, each rover's instruments
// directly under its own screen, and the meteor warning on a pillar between them. The rover cameras
// (client/rovercam.js) draw on a canvas under this one and show through the glass.
import { PAL, FONT } from '/shared/palette.js';
import { ROVERS } from '/shared/config.js';
import { face, tile, keycap, arrow, label, nixie, jewel, icon, edgewise, homeDial, monitor, phos, blinkOn, TAU, GLASS_R } from './instruments.js';
import { regionOf } from './desk.js';

export const CAM_IDS = ['scout', 'hauler'];
export const DRIVE = { scout: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], hauler: ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'] };
export const VIEW_KEY = { scout: ['KeyC', 'C'], hauler: ['Slash', '/'] };

// Compass bearing of a heading, degrees clockwise from north (north is -z).
export const bearing = ry => ((Math.atan2(Math.sin(ry), -Math.cos(ry)) * 180 / Math.PI) + 360) % 360;
// Where the base is from a rover, as an angle off its nose (0 ahead, positive to the right), and how far.
export function homeFrom(r) {
  const dx = -r.x, dz = -r.z, cs = Math.cos(r.ry), sn = Math.sin(r.ry);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  return { rel: Math.atan2(-lx, lz), dist: Math.hypot(dx, dz) };
}

// What is drawn on a monitor's glass, over the camera: the compass tape, a reticle with clock marks, the rover's
// picture and letter, and the view it is in with the key that changes it. No camera: grey static.
export function glassHud(g, r, id, s, view, live) {
  const { x, y, w, h } = r, ro = s.rovers?.[id];
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, GLASS_R); g.clip();
  if (!live) { g.fillStyle = PAL.consoleDeep; g.fillRect(x, y, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(143,138,120,${Math.random() * 0.25})`; g.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2); } }
  const small = h < 300, th = small ? 20 : 26;
  if (ro) {
    g.fillStyle = 'rgba(28,42,28,0.6)'; g.fillRect(x, y, w, th);
    const b = bearing(ro.ry), ppd = w / 100;
    g.strokeStyle = phos(0.8); g.fillStyle = phos(0.9); g.lineWidth = 1.5;
    for (let d = Math.ceil((b - 50) / 15) * 15; d <= b + 50; d += 15) {
      const xx = x + w / 2 + (d - b) * ppd, dd = ((d % 360) + 360) % 360, card = dd % 90 === 0;
      g.beginPath(); g.moveTo(xx, y + th); g.lineTo(xx, y + th - (card ? 12 : 7)); g.stroke();
      if (card || dd % 45 === 0) { g.font = `${card ? 11 : 9}px ${FONT.label}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(card ? 'NESW'[dd / 90] : String(dd), xx, y + 8); }
    }
    g.beginPath(); g.moveTo(x + w / 2 - 6, y + th + 4); g.lineTo(x + w / 2 + 6, y + th + 4); g.lineTo(x + w / 2, y + th - 2); g.closePath(); g.fill();
  }
  const cx = x + w / 2, cy = y + h * 0.55, rr = h * 0.16;
  g.strokeStyle = phos(0.45); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; g.beginPath(); g.moveTo(cx + Math.sin(a) * rr, cy - Math.cos(a) * rr); g.lineTo(cx + Math.sin(a) * (rr + (big ? 10 : 5)), cy - Math.cos(a) * (rr + (big ? 10 : 5))); g.stroke(); }
  g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke();
  const by = y + h - (small ? 18 : 24), is = small ? 22 : 30;
  icon(g, id, x + 14 + is / 2, by, is, phos(0.9)); label(g, id === 'scout' ? 'S' : 'H', x + 24 + is, by + 2, small ? 11 : 13, phos(0.9));
  const vx = x + w - (small ? 80 : 96), vs = small ? 20 : 24;
  icon(g, 'eye', vx, by, vs, phos(view === 'third' ? 0.3 : 0.95)); icon(g, 'chase', vx + vs + 10, by, vs, phos(view === 'third' ? 0.95 : 0.3));
  g.strokeStyle = phos(0.8); g.lineWidth = 1.2; g.strokeRect(vx + 2 * vs + 6, by - 10, 22, 20); label(g, VIEW_KEY[id][1], vx + 2 * vs + 17, by + 1, 10, phos(0.9));
  g.fillStyle = 'rgba(12,18,12,0.18)'; for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1); // raster
  g.restore();
}

// One rover's instruments: HOME dial, range, speed, the wheel lamp, and on the Hauler the rider lamp.
// size 1 is the Technician's panel (148 high); 0.45 the 2-player desk's strip.
export function roverInstruments(g, x, y, id, s, size = 1) {
  const ro = s.rovers?.[id]; if (!ro) return;
  const k = size, hm = homeFrom(ro), broken = (s.scene?.wheels?.[id] || 0) > 0;
  if (k >= 1) {
    homeDial(g, 'home-' + id, x + 66, y + 74, 52, hm.rel);
    icon(g, 'home', x + 176, y + 44, 22, PAL.inkDim); nixie(g, String(Math.round(hm.dist)).padStart(3, ' '), x + 236, y + 44, 30); label(g, 'M', x + 286, y + 46, 10, PAL.inkDim);
    icon(g, 'speed', x + 176, y + 104, 22, PAL.inkDim); edgewise(g, 'v-' + id, x + 200, y + 94, 120, 20, Math.abs(ro.v || 0) / ROVERS[id].speed);
    tile(g, x + 392, y + 74, 54, 'wheel', 'red', broken ? (blinkOn() ? 1 : 0.45) : 0);
    if (id === 'hauler') tile(g, x + 468, y + 74, 54, 'rider', 'green', s.rider ? 1 : 0);
  } else {
    homeDial(g, 'home-' + id, x + 24, y, 20, hm.rel);
    icon(g, 'home', x + 66, y, 16, PAL.inkDim); nixie(g, String(Math.round(hm.dist)).padStart(3, ' '), x + 106, y, 20);
    icon(g, 'speed', x + 152, y, 16, PAL.inkDim); edgewise(g, 'v-' + id, x + 166, y - 7, 80, 14, Math.abs(ro.v || 0) / ROVERS[id].speed);
    tile(g, x + 280, y, 30, 'wheel', 'red', broken ? (blinkOn() ? 1 : 0.45) : 0);
    if (id === 'hauler') tile(g, x + 320, y, 30, 'rider', 'green', s.rider ? 1 : 0);
  }
}
// The meteor warning: the lamp, the seconds to go on Nixie tubes, and TAKE COVER.
export function meteorTiles(g, x, y, s, size = 1) {
  const m = s.meteor;
  tile(g, x, y, 88 * size, 'meteor', 'red', m ? (blinkOn() ? 1 : 0.45) : 0);
  nixie(g, m ? (m.falling ? '00' : String(Math.ceil(m.eta)).padStart(2, '0')) : '  ', x, y + 98 * size, 50 * size, { lit: !!m });
}

// A cluster of four drive keycaps under a rover, lit while held. A keycap pressed with the pointer drives too.
export function driveKeys(g, x, y, id, keys) {
  const [u, l, d, r] = DRIVE[id], pos = [[u, 0, -1, 0], [l, -1, 1, 3], [d, 0, 1, 2], [r, 1, 1, 1]];
  for (const [code, dx, dy, dir] of pos) {
    const t = code.startsWith('Key') ? code.slice(3) : '';
    keycap(g, x + dx * 34, y + dy * 15 - 2, 30, 26, t, keys.has(code), t ? null : (c, o) => arrow(g, x + dx * 34, y + dy * 15 - 4 + o, dir, c));
  }
}
export const driveHits = (x, y, id, ctx) => {
  const [u, l, d, r] = DRIVE[id];
  return [[u, 0, -1], [l, -1, 1], [d, 0, 1], [r, 1, 1]].map(([code, dx, dy]) => ({ x: x + dx * 34 - 15, y: y + dy * 15 - 15, w: 30, h: 26, name: `Drive the ${ROVERS[id].name}`, down: () => ctx.press(code, true), up: () => ctx.press(code, false) }));
};

export function layout(W, H, ctx) {
  const { top, h } = regionOf(H);
  const cw = 572, chh = h - 196;
  const glass = [{ x: 22, y: top + 12, w: cw, h: chh }, { x: 772, y: top + 12, w: cw, h: chh }];
  const panelY = top + chh + 34;
  const ky = H - 39;
  const hits = [
    ...CAM_IDS.map((id, n) => ({ ...glass[n], name: `${ROVERS[id].name} camera: click or ${VIEW_KEY[id][1]} to change the view, wheel for distance`, click: () => ctx.cam()?.toggle(id), wheel: dy => { const c = ctx.cam(); if (c?.view(id) === 'third') c.zoom(id, dy); } })),
    { x: 616, y: top, w: 134, h: h, name: 'Meteor warning' },
    ...CAM_IDS.map((id, n) => ({ x: glass[n].x - 10, y: panelY, w: cw + 20, h: 148, name: `${ROVERS[id].name}: way home, range, speed, wheel${id === 'hauler' ? ', rider' : ''}` })),
    ...driveHits(200, ky, 'scout', ctx), ...driveHits(950, ky, 'hauler', ctx),
  ];
  return {
    glass, holes: glass, hits,
    back(g) {
      glass.forEach(r => monitor(g, r.x, r.y, r.w, r.h));
      glass.forEach(r => face(g, r.x - 10, panelY, cw + 20, 148));
      face(g, 616, top, 134, h);
      g.strokeStyle = PAL.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(634, top + 262); g.lineTo(732, top + 262); g.stroke();
      icon(g, 'clock', 683, top + 222, 22, PAL.inkDim);
    },
    live(g, s) {
      const cam = ctx.cam();
      CAM_IDS.forEach((id, n) => { glassHud(g, glass[n], id, s, cam?.view(id), !!cam); roverInstruments(g, glass[n].x, panelY, id, s); });
      meteorTiles(g, 683, top + 70, s);
      tile(g, 683, top + 330, 70, 'cover', 'amber', s.meteor ? 1 : 0);
      ctx.shown.view = Object.fromEntries(CAM_IDS.map(id => [id, cam?.view(id) || null]));
      ctx.shown.wheel = Object.fromEntries(CAM_IDS.map(id => [id, (s.scene?.wheels?.[id] || 0) > 0]));
      ctx.shown.meteor = s.meteor ? Math.ceil(s.meteor.eta) : null;
    },
    keyset(g, y, s, keys) {
      icon(g, 'scout', 104, y, 34, PAL.inkDim); driveKeys(g, 200, y, 'scout', keys);
      keycap(g, 330, y, 30, 26, 'C', keys.has('KeyC')); icon(g, 'eye', 366, y, 20, PAL.inkDim); icon(g, 'chase', 392, y, 20, PAL.inkDim);
      icon(g, 'hauler', 854, y, 34, PAL.inkDim); driveKeys(g, 950, y, 'hauler', keys);
      keycap(g, 1080, y, 30, 26, '/', keys.has('Slash')); icon(g, 'eye', 1116, y, 20, PAL.inkDim); icon(g, 'chase', 1142, y, 20, PAL.inkDim);
    },
  };
}
export { jewel };
