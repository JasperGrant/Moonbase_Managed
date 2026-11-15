// Mission Ops' desk (docs/design/mission-control-consoles.md, 6.2): the astronaut's two hands and the voice loop
// on the left, the tool board in the middle, the samples on their way home and the mission tape on the right.
// The pieces are exported for the 2-player desk (all.js), which uses smaller versions of some of them.
import { PAL, FONT } from '/shared/palette.js';
import { drawTool } from '/shared/icons.js';
import { TOOLS } from '/shared/config.js';
import { face, well, title, tile, keycap, flow, label, typed, nixie, jewel, icon, needle, TAU } from './instruments.js';
import { regionOf } from './desk.js';
import { labTiles } from './lab.js';

const TOOL_IDS = Object.keys(TOOLS);
// Where a tool can lie in the hall: the names the server gives (PLACES.toolSpots), laid out as a plan of the hall,
// north up and west on the left. [name, column, row]. Outside, one bay per place the server names, and FIELD for
// everywhere else.
const BAYS = [['LIFE SUPPORT', 0, 0], ['SPARES STAND', 1, 0], ['CORRIDOR', 2, 0],
  ['TOOL RACK', 0, 1], ['HALL', 1, 1], ['EAST WALL', 2, 1],
  ['WEST DOOR', 0, 2], ['BENCH', 1, 2], ['LOCKERS', 2, 2]];
const OUTSIDE = [['home', 'HAB'], ['bolt', 'SOLAR'], ['hauler', 'ROVER'], ['rock', 'FIELD']];
const INSIDE_NAMES = new Set(BAYS.map(b => b[0]));

// Which bay a tool's area falls in, and the word to show on it (a landmark's own name in FIELD).
export function bayOf(area = '') {
  if (!area.startsWith('OUTSIDE ')) return { bay: INSIDE_NAMES.has(area) ? area : 'HALL', word: null };
  const place = area.slice(8);
  return ['HAB', 'SOLAR', 'ROVER'].includes(place) ? { bay: place, word: null } : { bay: 'FIELD', word: place };
}
// Each loose tool's bay, as { bay: [ids] }, and the landmark word for FIELD.
export function bays(s) {
  const out = {}; let field = null;
  for (const id of TOOL_IDS) {
    const t = s.tools?.[id]; if (!t || t.at !== 'loose') continue;
    const { bay, word } = bayOf(t.area); (out[bay] ||= []).push(id); if (word) field = word;
  }
  return { out, field };
}
// The roster's lamp for a tool: green in a hand, amber lying somewhere, dark used up or fitted.
export const toolLamp = (s, id) => { const at = s.tools?.[id]?.at; return at === 'hand' ? ['green', true] : at === 'loose' ? ['amber', true] : ['amber', false]; };

// The two hands: what each holds (a tool, or a rock in a hand left free), left hand first.
export function handsOf(s) {
  const h = [...(s.hands || [null, null])].map(t => t ? { tool: t } : null);
  let rocks = (s.carry || []).length;
  for (let i = 0; i < 2 && rocks; i++) if (!h[i]) { h[i] = { rock: true }; rocks--; }
  return h;
}
export function drawHand(g, x, y, u, hand, mirror) {
  well(g, x, y, u, u);
  g.save(); if (mirror) { g.translate(x + u / 2, 0); g.scale(-1, 1); g.translate(-(x + u / 2), 0); }
  icon(g, 'glove', x + u / 2, y + u / 2, u * 0.8, 'rgba(143,138,120,0.28)'); g.restore();
  if (hand?.tool) drawTool(g, hand.tool, x + u / 2, y + u / 2, u * 0.65, PAL.ink);
  if (hand?.rock) icon(g, 'rock', x + u / 2, y + u / 2 + 4, u * 0.5, PAL.amber);
}

// The intercom's level meter and its two lamps. talk: { state, level }.
export function voiceMeter(g, cx, cy, r, talk) {
  g.fillStyle = PAL.dial; g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.fill(); g.strokeStyle = PAL.bezel; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(196,82,58,0.7)'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(cx, cy, r * 0.8, -0.7, -0.15); g.stroke();
  g.strokeStyle = PAL.inkDial; g.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const a = Math.PI + i * Math.PI / 10; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); g.lineTo(cx + Math.cos(a) * r * 0.96, cy + Math.sin(a) * r * 0.96); g.stroke(); }
  const v = needle('voice', talk.state === 'idle' ? 0 : Math.min(1, talk.level() * 3)), a = Math.PI * (1.08 + v * 0.84);
  g.strokeStyle = PAL.inkDial; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); g.stroke();
  g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
}

// The samples on their way home, one stage under the next: hands, the Hauler's tray, the bank.
export function sampleFlow(g, x, top, w, s, compact = false) {
  const carry = (s.carry || []).length, tray = s.tray || [], t = s.tally || { banked: 0, wanted: 4 };
  const bh = compact ? 44 : 84, gap = compact ? 8 : 26, cx = x + w / 2;
  const stage = (i, ic) => { const y = top + i * (bh + gap); well(g, x, y, w, bh); icon(g, ic, x + (compact ? 26 : 42), y + bh / 2, compact ? 30 : 54, PAL.inkDim); if (i) flow(g, cx, y - gap + 4, cx, y - 4); return y + bh / 2; };
  let y = stage(0, 'glove'); const ts = compact ? 30 : 44;
  for (let i = 0; i < 2; i++) tile(g, x + (compact ? 80 : 142) + i * (ts + 20), y, ts, 'rock', 'amber', i < carry ? 1 : 0);
  y = stage(1, 'hauler'); const tr = compact ? 28 : 40;
  for (let i = 0; i < tray.length; i++) tile(g, x + (compact ? 78 : 108) + i * (tr + 12), y, tr, 'rock', 'green', tray[i] ? 1 : 0);
  y = stage(2, 'port');
  nixie(g, String(t.banked), x + (compact ? 80 : 132), y, compact ? 28 : 42);
  for (let i = 0; i < t.wanted; i++) jewel(g, x + (compact ? 120 : 196) + i * (compact ? 24 : 30), y, compact ? 8 : 10, 'green', i < t.banked);
  return top + 3 * bh + 2 * gap;
}

// The core drill: where it is, and while it works, its countdown on five Nixie tubes like the ones on top of it.
const DRILL_WORD = { rover: 'HAULER', hand: 'BOTH HANDS', ground: 'STANDING', site: null };
export function drillRow(g, x, y, w, s, compact = false) {
  const d = s.drill || { at: 'rover', left: 0 };
  const working = d.at === 'site' && d.left > 0, ready = d.at === 'site' && !working && d.cored;
  well(g, x, y, w, compact ? 34 : 50);
  const cy = y + (compact ? 17 : 25);
  drawTool(g, 'drill', x + 24, cy, compact ? 26 : 38, PAL.ink);
  jewel(g, x + 52, cy, compact ? 6 : 8, working ? 'amber' : 'green', d.at === 'hand' || ready || (working && Math.floor(performance.now() / 500) % 2 === 0)); // blinks at 1 Hz while it works
  label(g, DRILL_WORD[d.at] ?? (working ? 'DRILLING' : ready ? 'CORE READY' : 'ON A ROCK'), x + 66, cy + 1, compact ? 8 : 10, PAL.ink, 'left');
  const n0 = x + w - (compact ? 100 : 140), nw = compact ? 20 : 28;
  for (let i = 0; i < 5; i++) nixie(g, String(5 - i), n0 + i * nw, cy, compact ? 20 : 28, { lit: working && 5 - i <= Math.ceil(d.left) });
  return { at: d.at, left: d.left };
}
// The beacon on a tool: an amber ring round it, the same amber as the beacon the astronaut sees.
export function beaconRing(g, x, y, r) {
  g.save(); g.strokeStyle = PAL.amber; g.lineWidth = 2; g.shadowColor = PAL.amber; g.shadowBlur = 4;
  g.setLineDash([5, 4]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore();
  icon(g, 'link', x + r * 0.78, y - r * 0.78, Math.max(12, r * 0.45), PAL.amber);
}

const TAPE_ICON = { alarm: ['bell', 'red'], solve: ['fixed', 'inkDial'], hit: ['meteor', 'red'], blackout: ['dark', 'red'], power: ['bolt', 'inkDial'], gen: ['bolt', 'inkDial'], found: ['banked', 'inkDial'], dud: ['dud', 'inkDial'], finding: ['flask', 'inkDial'] };
// The mission tape: the whole mission on paper, a needle at now, a mark for each thing that has happened.
export function tape(g, x, y, w, h, s, events, roundSeconds) {
  g.fillStyle = PAL.dial; g.fillRect(x, y, w, h); g.strokeStyle = PAL.bezel; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  const mins = Math.round(roundSeconds / 60), at = sec => x + 12 + (w - 24) * Math.min(1, sec / roundSeconds);
  g.strokeStyle = PAL.inkDial;
  for (let i = 0; i <= mins * 2; i++) { const xx = at(i * 30); g.lineWidth = i % 2 ? 1 : 2; g.beginPath(); g.moveTo(xx, y + h); g.lineTo(xx, y + h - (i % 2 ? 6 : 12)); g.stroke(); if (i % 2 === 0) typed(g, String(i / 2), xx, y + h - 22, 10); }
  const lane = new Map();
  for (const e of events) {
    const m = TAPE_ICON[e.kind]; if (!m) continue;
    const b = Math.round(at(e.at) / 14), row = lane.get(b) || 0; lane.set(b, row + 1); // a second mark close by goes above the first
    icon(g, m[0], at(e.at), y + h - 40 - (row % 2) * 18, 16, PAL[m[1]]);
  }
  const now = roundSeconds - Math.max(0, s.timeLeft ?? roundSeconds);
  g.strokeStyle = PAL.red; g.lineWidth = 2; g.beginPath(); g.moveTo(at(now), y - 4); g.lineTo(at(now), y + h + 4); g.stroke();
}

export function layout(W, H, ctx) {
  const { top, h } = regionOf(H), extra = h - 592, bot = top + h;
  const L = { x: 12, w: 300 }, C = { x: 324, w: 660 }, R = { x: 996, w: 358 };
  const bx = C.x + 22, by = top + 54, bw = C.w - 44, bh = 300 + extra;
  const cw = (bw - 28) / 3, ch = (bh - 28 - 16) / 3;
  const bayRect = Object.fromEntries(BAYS.map(([n, cx, cy]) => [n, { x: bx + 14 + cx * cw, y: by + 14 + cy * (ch + 8), w: cw - 8, h: ch }]));
  const toolAt = []; // where each tool was drawn this frame, for a click to light a beacon on it
  const outY = by + bh + 8, outRect = Object.fromEntries(OUTSIDE.map(([, n], i) => [n, { x: C.x + 116 + i * 132, y: outY, w: 120, h: 30 }]));
  const rosterY = outY + 44, talkY = top + 252 + extra * 0.5, tapeY = bot - 100, drillY = tapeY - 64;
  const talkKey = { x: L.x + 52, y: talkY + 128, w: 196, h: 90 };
  const hits = [
    { ...talkKey, name: 'Talk to the astronaut (hold SPACE)', down: () => ctx.press('Space', true), up: () => ctx.press('Space', false) },
    { x: L.x + 14, y: top + 50, w: L.w - 28, h: 160, name: 'The astronaut\'s hands' },
    { x: bx, y: by, w: bw, h: bh + 40, name: 'Tool board: where each tool lies. Click a tool to light a beacon over it for the astronaut',
      click: p => { const t = toolAt.find(a => Math.hypot(p.x - a.x, p.y - a.y) < a.r); if (t) ctx.beaconTool(t.id); } },
    ...TOOL_IDS.map((id, i) => ({ x: C.x + 36 + i * 124, y: rosterY, w: 80, h: 100, name: `${TOOLS[id].name}: click to light a beacon over it`, click: () => ctx.beaconTool(id) })),
    { x: R.x + 14, y: drillY, w: R.w - 28, h: 50, name: 'The core drill' },
    { x: R.x + 14, y: top + 50, w: R.w - 28, h: 400, name: 'Samples: in hand, in the tray, banked' },
    { x: R.x + 14, y: tapeY, w: R.w - 28, h: 80, name: 'Mission tape' },
    { x: 20, y: H - 64, w: 200, h: 50, name: 'Talk key (SPACE)', down: () => ctx.press('Space', true), up: () => ctx.press('Space', false) },
  ];
  return {
    hits,
    back(g) {
      face(g, L.x, top, L.w, h); face(g, C.x, top, C.w, h); face(g, R.x, top, R.w, h);
      title(g, L.x + 14, top + 14, L.w - 28, 'glove', 'HANDS');
      title(g, L.x + 14, talkY - 38, L.w - 28, 'mic', 'VOICE LOOP');
      well(g, L.x + 22, talkY, L.w - 44, 236);
      title(g, C.x + 14, top + 14, C.w - 28, 'lens', 'TOOL BOARD');
      well(g, bx, by, bw, bh);
      label(g, 'OUTSIDE', C.x + 22, outY + 16, 9, PAL.inkDim, 'left');
      title(g, R.x + 14, top + 14, R.w - 28, 'rock', 'SAMPLES');
      for (let i = 0; i < 5; i++) well(g, C.x + 36 + i * 124, rosterY, 80, 66);
    },
    live(g, s) {
      // hands
      const hands = handsOf(s);
      hands.forEach((hd, i) => { const x = L.x + 22 + i * 136; drawHand(g, x, top + 52, 120, hd, i === 0); jewel(g, x + 44, top + 184, 6, 'green', !!hd); label(g, i ? 'R' : 'L', x + 68, top + 185, 12, PAL.inkDim); });
      // the voice loop
      const talk = ctx.talk();
      jewel(g, L.x + 72, talkY + 40, 12, 'red', talk.state === 'tx'); icon(g, 'headset', L.x + 72, talkY + 72, 20, PAL.inkDim);
      jewel(g, L.x + 228, talkY + 40, 12, 'blue', talk.state === 'rx'); icon(g, 'helmet', L.x + 228, talkY + 72, 20, talk.state === 'rx' ? PAL.blue : PAL.inkDim);
      voiceMeter(g, L.x + 150, talkY + 70, 44, talk);
      const lit = talk.state === 'tx';
      keycap(g, talkKey.x + talkKey.w / 2, talkKey.y + talkKey.h / 2, talkKey.w, talkKey.h, '', lit, (c, d) => { icon(g, 'mic', talkKey.x + 46, talkKey.y + 44 + d, 46, c); g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(talkKey.x + 88, talkKey.y + 31 + d, 92, 26); label(g, 'SPACE', talkKey.x + 134, talkKey.y + 45 + d, 9, c); });
      // the tool board
      const { out, field } = bays(s), wp = s.waypoint?.tool;
      toolAt.length = 0;
      for (const [name] of BAYS) {
        const r = bayRect[name], tools = out[name] || [];
        g.fillStyle = tools.length ? 'rgba(224,163,71,0.10)' : 'rgba(143,138,120,0.05)'; g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = tools.length ? PAL.amber : PAL.rule; g.lineWidth = tools.length ? 1.5 : 1; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        label(g, name, r.x + 8, r.y + 13, 8, tools.length ? PAL.ink : PAL.inkDim, 'left');
        const ts = Math.min(62, r.h * 0.55, (r.w - 10) / Math.max(1, tools.length) - 8);
        tools.forEach((t, i) => {
          const tx = r.x + r.w / 2 + (i - (tools.length - 1) / 2) * (ts + 8), ty = r.y + r.h / 2 + 8;
          drawTool(g, t, tx, ty, ts, PAL.amber); toolAt.push({ id: t, x: tx, y: ty, r: ts * 0.65 });
          if (t === wp) beaconRing(g, tx, ty, ts * 0.62);
        });
      }
      for (const [ic, name] of OUTSIDE) {
        const r = outRect[name], tools = out[name] || [], on = tools.length > 0;
        g.strokeStyle = on ? PAL.amber : PAL.rule; g.lineWidth = on ? 1.5 : 1; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
        icon(g, ic, r.x + 16, r.y + 15, 18, on ? PAL.amber : PAL.inkDim);
        if (on) tools.forEach((t, i) => { const tx = r.x + 50 + i * 26; drawTool(g, t, tx, r.y + 15, 22, PAL.amber); toolAt.push({ id: t, x: tx, y: r.y + 15, r: 14 }); if (t === wp) beaconRing(g, tx, r.y + 15, 14); });
        else label(g, name, r.x + 34, r.y + 16, 8, PAL.inkDim, 'left');
        if (on && name === 'FIELD' && field) label(g, field, r.x + r.w - 4, r.y + 16, 7, PAL.ink, 'right');
      }
      TOOL_IDS.forEach((t, i) => {
        const x = C.x + 76 + i * 124, [col, on] = toolLamp(s, t);
        g.globalAlpha = s.tools?.[t]?.at === 'gone' ? 0.3 : 1; drawTool(g, t, x, rosterY + 33, 46, PAL.ink); g.globalAlpha = 1;
        if (t === wp) beaconRing(g, x, rosterY + 33, 38);
        jewel(g, x, rosterY + 84, 7, col, on);
      });
      // the samples, and the tape
      sampleFlow(g, R.x + 22, top + 54, R.w - 44, s);
      ctx.shown.drill = drillRow(g, R.x + 22, drillY, R.w - 44, s);
      if (s.lab) { labTiles(g, R.x + 22, drillY - 24, R.w - 44, s, 28); ctx.shown.labBoard = Object.fromEntries(Object.entries(s.lab.board).map(([k, b]) => [k, b.grade || b.state])); }
      ctx.shown.beacon = s.waypoint ? (s.waypoint.tool || 'ground') : null;
      tape(g, R.x + 22, tapeY, R.w - 44, 80, s, ctx.tape, ctx.roundSeconds);
      ctx.shown.hands = hands.map(hd => hd?.tool || (hd?.rock ? 'rock' : null));
      ctx.shown.bays = out; ctx.shown.talk = talk.state;
      ctx.shown.flow = { carry: (s.carry || []).length, tray: (s.tray || []).filter(Boolean).length, banked: s.tally?.banked ?? 0 };
    },
    keyset(g, y, s, keys) {
      const lit = keys.has('Space') || ctx.talk().state === 'tx';
      keycap(g, 120, y, 200, 44, '', lit, (c, d) => { icon(g, 'mic', 52, y - 2 + d, 26, c); label(g, 'SPACE', 132, y - 1 + d, 11, c); });
      icon(g, 'helmet', 254, y, 24, PAL.inkDim);
    },
  };
}
export { FONT };
