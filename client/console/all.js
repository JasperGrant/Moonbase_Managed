// The 2-player desk (docs/design/mission-control-consoles.md, 6.7): one Mission Control player runs the whole
// base, so this is the three desks cut down to what one person can watch at once, on one screen.
//   left:   the astronaut's hands, the five tools with the bay each lies in, the samples on their way home
//   centre: the two rover cameras, one over the other, each with a strip of instruments
//   right:  the survey scope with its two switches, the fault lamps, and a field guide of one row per sample
// Left out against the 4-player desks: the tool board's plan of the hall, the mission tape, the voice-loop panel
// (its lamps are on the keyset), the POWER and AIR pages (the scope shows which fault it is) and the guide's
// pictograms.
import { PAL } from '/shared/palette.js';
import { drawTool } from '/shared/icons.js';
import { TOOLS, ROVERS } from '/shared/config.js';
import { face, well, title, tile, keycap, label, jewel, icon, monitor } from './instruments.js';
import { regionOf } from './desk.js';
import { handsOf, drawHand, toolLamp, sampleFlow, drillRow, beaconRing } from './ops.js';
import { CAM_IDS, VIEW_KEY, glassHud, roverInstruments, meteorTiles, driveKeys, driveHits } from './tech.js';
import { scope, faultTiles, guideRows, guideAssay, chart, clickScope, RANGES, CENTRES } from './sci.js';
import { labPage, labClick, labTiles, LW } from './lab.js';
import { knob, nixie } from './instruments.js';

const TOOL_IDS = Object.keys(TOOLS);
// The word for where a tool is: its bay, or which hand.
function where(s, id) {
  const t = s.tools?.[id]; if (!t) return '';
  if (t.at === 'hand') { const i = (s.hands || []).indexOf(id); return i === 0 ? 'L' : i === 1 ? 'R' : ''; }
  if (t.at !== 'loose') return '';
  return (t.area || '').replace(/^OUTSIDE /, '');
}

export function layout(W, H, ctx) {
  const { top, h } = regionOf(H), extra = h - 592;
  const L = { x: 12, w: 330 }, C = { x: 354, w: 560 }, Rt = { x: 926, w: 428 };
  // left column
  const handsY = top + 46, u = 80, toolsY = handsY + u + 40, rowH = 32 + Math.max(0, extra) / 10, drillY = toolsY + 34 + 5 * rowH + 2, flowY = drillY + 40;
  // centre: two monitors, each with its instrument strip under it
  const blockH = (h - 12) / 2, mh = blockH - 70;
  const glass = CAM_IDS.map((id, n) => ({ x: C.x + 12, y: top + 12 + n * (blockH + 6), w: C.w - 24, h: mh }));
  // right: the scope and its switches, the fault lamps, the guide rows
  const R = Math.min(140, Math.floor((h - 300) / 2)), CX = Rt.x + 22 + R, CY = top + 20 + R, KX = Rt.x + Rt.w - 60;
  const gy = CY + R + 64, grow = Math.min(70, (top + h - gy - 70) / 4);
  const ky = H - 39;
  // The Real Mission: L puts the LAB page (client/console/lab.js) in the right-hand column, over the scope.
  const labK = (Rt.w - 16) / LW, labOn = () => !!ctx.state()?.lab && ctx.labView();
  const hits = [
    { x: Rt.x, y: top, w: Rt.w, h, when: labOn, name: 'The lab (L for the chart)', click: p => labClick({ x: (p.x - Rt.x - 8) / labK, y: (p.y - top - 8) / labK }) },
    { x: L.x + 14, y: handsY, w: L.w - 28, h: u + 20, name: 'The astronaut\'s hands' },
    ...TOOL_IDS.map((id, i) => ({ x: L.x + 14, y: toolsY + 34 + i * rowH, w: L.w - 28, h: rowH, name: `${TOOLS[id].name}: green in a hand, amber lying where it says, dark used up. Click to light a beacon over it`, click: () => ctx.beaconTool(id) })),
    { x: L.x + 14, y: drillY, w: L.w - 28, h: 34, name: 'The core drill' },
    { x: L.x + 14, y: flowY, w: L.w - 28, h: 170, name: 'Samples: in hand, in the tray, banked' },
    ...CAM_IDS.map((id, n) => ({ ...glass[n], name: `${ROVERS[id].name} camera: click or ${VIEW_KEY[id][1]} to change the view, wheel for distance`, click: () => ctx.cam()?.toggle(id), wheel: dy => { const c = ctx.cam(); if (c?.view(id) === 'third') c.zoom(id, dy); } })),
    { x: CX - R, y: CY - R, w: 2 * R, h: 2 * R, name: 'Survey chart: click to stand a beacon there for the astronaut', click: p => clickScope(p, ctx, ctx.state()) },
    { x: KX - 50, y: CY - R - 10, w: 100, h: 100, name: 'Range (R)', click: () => ctx.press('KeyR', true, true) },
    { x: KX - 50, y: CY + R - 90, w: 100, h: 100, name: 'Centre (E)', click: () => ctx.press('KeyE', true, true) },
    { x: Rt.x + 14, y: gy - 6, w: Rt.w - 28, h: 4 * grow + 60, name: 'Field guide' },
    { x: 34, y: ky - 22, w: 180, h: 44, name: 'Talk to the astronaut (hold SPACE)', down: () => ctx.press('Space', true), up: () => ctx.press('Space', false) },
    ...driveHits(420, ky, 'scout', ctx), ...driveHits(760, ky, 'hauler', ctx),
  ];
  return {
    glass, holes: glass, hits,
    back(g) {
      face(g, L.x, top, L.w, h); face(g, C.x, top, C.w, h); face(g, Rt.x, top, Rt.w, h);
      title(g, L.x + 14, top + 12, L.w - 28, 'glove', 'HANDS');
      title(g, L.x + 14, toolsY, L.w - 28, 'lens', 'TOOLS');
      glass.forEach(r => monitor(g, r.x, r.y, r.w, r.h));
    },
    live(g, s) {
      handsOf(s).forEach((hd, i) => { const x = L.x + 40 + i * (u + 54); drawHand(g, x, handsY, u, hd, i === 0); jewel(g, x + u + 16, handsY + u - 10, 6, 'green', !!hd); label(g, i ? 'R' : 'L', x + u + 16, handsY + u - 30, 11, PAL.inkDim); });
      TOOL_IDS.forEach((id, i) => {
        const y = toolsY + 34 + i * rowH, cy = y + rowH / 2, [col, on] = toolLamp(s, id);
        well(g, L.x + 22, y + 3, rowH - 6, rowH - 6);
        g.globalAlpha = s.tools?.[id]?.at === 'gone' ? 0.3 : 1; drawTool(g, id, L.x + 22 + (rowH - 6) / 2, cy, rowH - 14, PAL.ink); g.globalAlpha = 1;
        jewel(g, L.x + rowH + 34, cy, 7, col, on);
        label(g, where(s, id), L.x + rowH + 52, cy + 1, 10, on ? PAL.ink : PAL.inkDim, 'left');
        if (s.waypoint?.tool === id) beaconRing(g, L.x + 22 + (rowH - 6) / 2, cy, rowH / 2 + 2);
      });
      drillRow(g, L.x + 14, drillY, L.w - 28, s, true);
      sampleFlow(g, L.x + 14, flowY, L.w - 28, s, true);
      ctx.shown.beacon = s.waypoint ? (s.waypoint.tool || 'ground') : null;
      const cam = ctx.cam();
      CAM_IDS.forEach((id, n) => { glassHud(g, glass[n], id, s, cam?.view(id), !!cam); roverInstruments(g, glass[n].x + 4, glass[n].y + mh + 38, id, s, 0.45); });
      if (s.lab && ctx.labView()) {
        face(g, Rt.x, top, Rt.w, h, true);
        g.save(); g.translate(Rt.x + 8, top + 8); g.scale(labK, labK); labPage(g, s, ctx, (h - 16) / labK); g.restore();
        ctx.shown.labView = true;
      } else {
      ctx.shown.labView = false;
      // the scope
      scope(g, s, CX, CY, R, ctx.sfx);
      knob(g, KX, CY - R + 40, RANGES, chart.range, null);
      knob(g, KX, CY + R - 40, ['home', 'scout', 'hauler'], chart.centre, null);
      faultTiles(g, Rt.x + 40, CY + R + 32, s, 30, 4);
      nixie(g, String(s.survey?.pct ?? 0).padStart(3, ' '), Rt.x + Rt.w - 74, CY + R + 32, 20); icon(g, 'scope', Rt.x + Rt.w - 30, CY + R + 32, 18, PAL.inkDim);
      guideRows(g, s, Rt.x + 14, gy, Rt.w - 28, grow);
      if (s.lab) labTiles(g, Rt.x + 14, top + h - 34, Rt.w - 28, s, 30); // the four experiments, in place of the assay strip
      else guideAssay(g, s, Rt.x + 14, top + h - 56, Rt.w - 28, 44);
      }
      ctx.shown.hands = handsOf(s).map(hd => hd?.tool || (hd?.rock ? 'rock' : null));
      ctx.shown.tools = Object.fromEntries(TOOL_IDS.map(id => [id, where(s, id)]));
      ctx.shown.talk = ctx.talk().state;
      ctx.shown.view = Object.fromEntries(CAM_IDS.map(id => [id, cam?.view(id) || null]));
      ctx.shown.scope = { range: RANGES[chart.range], centre: CENTRES[chart.centre], pct: s.survey?.pct ?? 0, fault: s.survey?.fault?.type || null };
    },
    keyset(g, y, s, keys) {
      const talk = ctx.talk();
      keycap(g, 124, y, 180, 44, '', keys.has('Space') || talk.state === 'tx', (c, d) => { icon(g, 'mic', 60, y - 2 + d, 24, c); label(g, 'SPACE', 136, y - 1 + d, 11, c); });
      jewel(g, 240, y - 12, 7, 'red', talk.state === 'tx'); jewel(g, 240, y + 12, 7, 'blue', talk.state === 'rx'); icon(g, 'helmet', 266, y + 12, 18, talk.state === 'rx' ? PAL.blue : PAL.inkDim);
      icon(g, 'scout', 340, y, 30, PAL.inkDim); driveKeys(g, 420, y, 'scout', keys); keycap(g, 510, y, 30, 26, 'C', keys.has('KeyC'));
      icon(g, 'hauler', 680, y, 30, PAL.inkDim); driveKeys(g, 760, y, 'hauler', keys); keycap(g, 850, y, 30, 26, '/', keys.has('Slash'));
      keycap(g, 950, y, 30, 26, 'R', keys.has('KeyR')); icon(g, 'lens', 984, y, 20, PAL.inkDim);
      keycap(g, 1040, y, 30, 26, 'E', keys.has('KeyE')); icon(g, 'scope', 1074, y, 20, PAL.inkDim);
      if (s.lab) { keycap(g, 1110, y, 30, 26, 'L', ctx.labView()); icon(g, 'flask', 1140, y, 20, PAL.inkDim); }
      const m = s.meteor;
      tile(g, 1200, y, 46, 'meteor', 'red', m ? 1 : 0);
      nixie(g, m ? (m.falling ? '00' : String(Math.ceil(m.eta)).padStart(2, '0')) : '  ', 1270, y, 30, { lit: !!m });
      tile(g, 1326, y, 40, 'cover', 'amber', m ? 1 : 0);
    },
  };
}
export { meteorTiles, tile };
