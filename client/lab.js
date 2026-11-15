// The Real Mission's lab in the hall (docs/SPEC-real-mission.md, sections 4 and 5): a lab bench on the west wall
// with the microscope (E1) and the step furnace (E3), and two consoles on the east wall, the mass spectrometer
// (E2) and the cold box (E4). Each instrument has a status lamp (dark locked, amber ready, blinking amber in
// use, green done), a name plate, a display the astronaut reads, and a strip of keys the astronaut works:
// pointed at and clicked on a laptop, pointed at with the trigger in a headset. The server decides what every
// key press did (server/lab.js); this file only draws and reports.
//
// The furniture is in the hall in every mode; outside the Real Mission it stands dark. Room coordinates
// (client/interior.js): north is -z, west is -x. Each instrument's front (local +z) faces into the hall.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL, FONT, fontsReady, nixie, jewel } from '/shared/palette.js';
import { LAB, EXP_IDS, E2, E3, E4, drawGrain } from '/shared/lab.js';
import { loadPeriod } from '/shared/assets.js';
import { plate } from '/labels.js';

// The keys on each instrument's strip. hold: it repeats while held (the dials). lit: the key's lamp is on.
const KEYS = {
  E1: [['load', 'LOAD'], ['focus', 'FOCUS −', -0.03, true], ['focus', 'FOCUS +', 0.03, true], ['pol', 'POL', null, false, v => v.pol], ['stage', 'STAGE ◄', -1], ['stage', 'STAGE ►', 1], ['next', 'NEXT GRAIN']],
  E2: [['load', 'LOAD'], ['pump', 'PUMP', null, false, v => v.pump], ['beam', 'BEAM', null, false, v => v.beam], ['mass', 'MASS −', -0.05, true], ['mass', 'MASS +', 0.05, true], ['latch', 'LATCH']],
  E3: [['load', 'LOAD'], ['set', 'SET −', -25, true], ['set', 'SET +', 25, true], ['door', 'DOOR', null, false, v => v.door === 'open']],
  E4: [['load', 'LOAD'], ['weigh', 'WEIGH', null, true], ['valve', 'VALVE', null, false, v => v.valve], ['reader', 'READER', null, false, v => v.reader !== null]],
};
const KEY_GAP = 0.085, KEY_H = 0.11;
const STATE_COL = { locked: [PAL.hex.amberOff, false], ready: [PAL.hex.amber, false], loaded: [PAL.hex.amber, true], done: [PAL.hex.green, false] };

export function buildLab(THREE, { interior, sfx = () => {}, send = () => {} }) {
  const group = new THREE.Group(); group.name = 'Lab';
  interior.group.add(group);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  // Materials: painted steel, Bakelite, brass, frosted glass. Rough and barely metallic where painted.
  const paint = new THREE.MeshStandardMaterial({ color: PAL.hex.console, roughness: 0.8, metalness: 0.15 });
  const deep = new THREE.MeshStandardMaterial({ color: PAL.hex.consoleDeep, roughness: 0.85, metalness: 0.1 });
  const bake = new THREE.MeshStandardMaterial({ color: PAL.hex.bakelite, roughness: 0.45, metalness: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: PAL.hex.foilGold, roughness: 0.35, metalness: 0.85 });
  const alu = new THREE.MeshStandardMaterial({ color: PAL.hex.aluminium, roughness: 0.4, metalness: 0.85 });
  const ghost = new THREE.MeshBasicMaterial({ visible: false }); // never drawn, but the raycaster still finds it
  const rbox = (w, h, d, r = 0.01) => new RoundedBoxGeometry(w, h, d, 2, r);
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, name) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (name) m.name = name; parent.add(m); return m; };
  // A canvas drawn on a plane: the displays and the key strips.
  const screen = (w, h, px, parent, x, y, z, rx = 0, lit = false) => {
    const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = lit ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
    const m = mesh(new THREE.PlaneGeometry(w, h), mat, parent, x, y, z); m.rotation.x = rx;
    return { c, g: c.getContext('2d'), tex, m, W: c.width, H: c.height, key: '' };
  };
  // A blob shadow under something standing on the floor or the bench.
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(0,0,0,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const blob = (parent, w, d, y = 0.002) => { const m = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), parent, 0, y, 0); m.rotation.x = -Math.PI / 2; m.renderOrder = -1; };

  const hits = [];
  const target = (m, enabled, click, hold = false) => { Object.assign(m.userData, { enabled, click, hold }); hits.push(m); return m; };
  let st = null;          // the server's latest word (the astronaut's view)
  const view = exp => st?.lab?.[exp];
  const stateOf = exp => st?.lab?.board?.[exp]?.state || 'off';
  const live = () => st?.phase === 'run' && !!st.lab;
  const act = (exp, op, v) => send({ lab: { exp, op, ...(v !== undefined && v !== null ? { v } : {}) } });
  const weighing = { on: false, t0: 0, last: 0 };

  // ---------- the lab bench on the west wall ----------
  {
    const b = LAB.bench, w = b.x1 - b.x0, l = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const bench = new THREE.Group(); bench.name = 'Lab_Bench'; bench.position.set(cx, 0, cz); group.add(bench);
    mesh(rbox(w, b.top - 0.06, l - 0.06, 0.02), paint, bench, 0, (b.top - 0.06) / 2, 0, 'Body');
    mesh(rbox(w + 0.04, 0.05, l, 0.012), deep, bench, 0.02, b.top - 0.025, 0, 'Top');
    for (let i = 0; i < 4; i++) mesh(rbox(0.02, 0.26, 0.6, 0.006), deep, bench, w / 2 - 0.005, 0.5, -l / 2 + 0.4 + i * 0.7);
    blob(bench, w + 0.4, l + 0.3);
    const p = plate(THREE, 'lab', 0.18); p.position.set(w / 2 + 0.012, b.top - 0.18, 0); p.rotation.y = Math.PI / 2; bench.add(p);
  }

  // ---------- an instrument's common parts: root, lamp, plate, the strip of keys ----------
  const inst = {};
  function base(exp, { stripAt, stripTilt, plateAt, lampAt }) {
    const P = LAB[exp];
    const root = new THREE.Group(); root.name = 'Root_' + exp; root.position.set(P.x, P.y, P.z); root.rotation.y = P.ry; group.add(root);
    const lamp = mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshBasicMaterial({ color: PAL.hex.amberOff, toneMapped: false }), root, ...lampAt, 'Lamp_Status');
    mesh(new THREE.TorusGeometry(0.024, 0.006, 6, 16), brass, root, lampAt[0], lampAt[1], lampAt[2] - 0.004);
    const pl = plate(THREE, exp, 0.3); pl.position.set(...plateAt); root.add(pl);
    // the key strip
    const keys = KEYS[exp], sw = keys.length * KEY_GAP + 0.03;
    const strip = screen(sw, KEY_H, 64 * keys.length + 24, root, stripAt[0], stripAt[1], stripAt[2], stripTilt);
    strip.m.name = 'Keys';
    mesh(rbox(sw + 0.02, KEY_H + 0.02, 0.015, 0.005), deep, strip.m, 0, 0, -0.009);
    keys.forEach(([op, word, v, hold], i) => {
      const k = mesh(new THREE.BoxGeometry(KEY_GAP * 0.9, KEY_H * 0.9, 0.04), ghost, strip.m, -sw / 2 + 0.015 + KEY_GAP * (i + 0.5), 0, 0.01, 'Key_' + op);
      target(k, () => live() && (op === 'load' ? stateOf(exp) === 'ready' : stateOf(exp) === 'loaded'), () => press(exp, op, v, hold), !!hold);
    });
    inst[exp] = { root, lamp, strip, keys, pressedAt: new Array(keys.length).fill(-9) };
    return root;
  }
  // A key was pressed (or is held: called again every 0.09 s).
  function press(exp, op, v, hold) {
    const i = KEYS[exp].findIndex(k => k[0] === op && (k[2] ?? null) === (v ?? null));
    if (i >= 0) inst[exp].pressedAt[i] = performance.now() / 1000;
    if (op === 'weigh') { const now = performance.now() / 1000; if (!weighing.on) { weighing.on = true; weighing.t0 = now; sfx('click'); } weighing.last = now; return true; }
    act(exp, op, v);
    sfx(op === 'load' ? 'lid' : op === 'latch' ? 'latch' : op === 'beam' && view('E2') && view('E2').vac < 0.9 && !view('E2').beam ? 'burn' : hold ? 'tick' : 'clank');
    return true;
  }

  // ---------- E1: the microscope, on the lab bench ----------
  // Along the bench (local x): the eyepiece view on its post at the left, the microscope at the right, the cradle
  // beyond it. The bench is shallow (its back is the wall at local z -0.38), so everything stands well forward.
  {
    const r = base('E1', { stripAt: [0, 0.05, 0.19], stripTilt: -1.1, plateAt: [-0.22, 0.72, -0.16], lampAt: [0.4, 0.06, 0.17] });
    const scope = new THREE.Group(); scope.name = 'Microscope'; scope.position.set(0.17, 0, -0.06); r.add(scope);
    mesh(rbox(0.2, 0.035, 0.22, 0.01), bake, scope, 0, 0.018, 0, 'Base');
    mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.26, 12), deep, scope, 0, 0.16, -0.08, 'Pillar');
    const arm = mesh(rbox(0.05, 0.05, 0.16, 0.012), deep, scope, 0, 0.28, -0.02, 'Arm'); arm.rotation.x = 0.25;
    const tube = mesh(new THREE.LatheGeometry([V(0.012, -0.11), V(0.02, -0.1), V(0.022, 0.05), V(0.016, 0.08), V(0.018, 0.12), V(0.022, 0.13)], 16), brass, scope, 0, 0.27, 0.05, 'Tube'); tube.rotation.x = -0.35;
    // the stage: a disc with a degree ring, turned to the stage angle
    const ring = document.createElement('canvas'); ring.width = ring.height = 128; { const g = ring.getContext('2d'); g.fillStyle = PAL.dial; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill(); g.strokeStyle = PAL.inkDial; for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; g.lineWidth = i % 6 ? 1 : 3; g.beginPath(); g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); } g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(64, 64, 14, 0, 7); g.fill(); }
    const stage = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24), [deep, new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(ring), roughness: 0.7, metalness: 0 }), deep], scope, 0, 0.13, 0.05, 'Stage');
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), alu, scope, 0.11, 0.2, -0.06, 'Knob_Focus').rotation.z = Math.PI / 2;
    inst.E1.stage = stage;
    inst.E1.cradle = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.03, 14), deep, r, 0.4, 0.015, -0.12, 'Cradle');
    // the eyepiece view: a round screen on a post, facing into the hall (a headset cannot be put to a tube)
    mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 8), deep, r, -0.22, 0.21, -0.2);
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16), bake, r, -0.22, 0.01, -0.2);
    const eye = screen(0.3, 0.3, 256, r, -0.22, 0.5, -0.16, 0, true); eye.m.name = 'Eyepiece_View';
    eye.m.geometry = new THREE.CircleGeometry(0.15, 40); // round, like a view down a tube
    mesh(new THREE.TorusGeometry(0.155, 0.012, 8, 40), brass, eye.m, 0, 0, -0.004);
    inst.E1.eye = eye;
    blob(r, 0.9, 0.5, 0.004);
  }

  // ---------- E3: the step furnace, on the lab bench ----------
  {
    const r = base('E3', { stripAt: [0.08, 0.05, 0.2], stripTilt: -1.1, plateAt: [-0.3, 0.08, 0.24], lampAt: [0.3, 0.06, 0.22] });
    // a horizontal tube furnace on two feet, a sight glass in its door, a temperature dial beside it
    const body = mesh(new THREE.LatheGeometry([V(0, -0.2), V(0.13, -0.2), V(0.14, -0.18), V(0.14, 0.18), V(0.13, 0.2), V(0, 0.2)], 20), paint, r, -0.06, 0.2, -0.08, 'Body');
    body.rotation.z = Math.PI / 2;
    for (const x of [-0.2, 0.08]) mesh(rbox(0.05, 0.08, 0.2, 0.01), deep, r, x, 0.04, -0.08);
    const door = new THREE.Group(); door.name = 'Door'; door.position.set(-0.06, 0.2, 0.06); r.add(door);
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 20), deep, door, 0, 0, 0).rotation.x = Math.PI / 2;
    const glow = mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: PAL.hex.nixieOff, toneMapped: false }), door, 0, 0, 0.017, 'Sight_Glass');
    mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), brass, door, 0, 0, 0.016);
    const dial = screen(0.22, 0.22, 256, r, 0.3, 0.3, -0.06, 0); dial.m.name = 'Dial_Temp';
    mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.03, 32), alu, dial.m, 0, 0, -0.018).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.2, 8), deep, r, 0.3, 0.09, -0.08);
    inst.E3.cradle = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.03, 14), deep, r, -0.32, 0.015, 0.05, 'Cradle');
    Object.assign(inst.E3, { door, glow, dial });
    blob(r, 0.7, 0.5, 0.004);
  }

  // ---------- E2: the mass spectrometer console, east wall ----------
  {
    const r = base('E2', { stripAt: [0, 0.98, 0.33], stripTilt: -0.75, plateAt: [0, 1.62, 0.07], lampAt: [0.3, 1.55, 0.1] });
    mesh(rbox(0.66, 0.92, 0.6, 0.02), paint, r, 0, 0.46, 0, 'Body');
    const desk = mesh(rbox(0.66, 0.05, 0.3, 0.01), deep, r, 0, 0.95, 0.2); desk.rotation.x = 0.35;
    mesh(rbox(0.66, 0.62, 0.22, 0.02), paint, r, 0, 1.24, -0.18, 'Upright');
    const face = screen(0.58, 0.48, 512, r, 0, 1.25, -0.065, 0); face.m.name = 'Panel';
    // the vacuum pump, a drum on the floor beside it
    mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.3, 16), deep, r, 0.43, 0.15, 0.05, 'Pump');
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), alu, r, 0.38, 0.5, -0.05).rotation.z = 0.6;
    inst.E2.cradle = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.03, 14), deep, r, -0.24, 0.99, 0.24, 'Cradle');
    inst.E2.face = face;
    blob(r, 1.2, 0.9);
  }

  // ---------- E4: the cold box, east wall ----------
  {
    const r = base('E4', { stripAt: [0, 0.98, 0.42], stripTilt: -0.75, plateAt: [0, 1.62, 0.2], lampAt: [0.3, 1.55, 0.22] });
    mesh(rbox(0.9, 0.95, 0.75, 0.025), paint, r, 0, 0.475, 0, 'Body');
    const desk = mesh(rbox(0.9, 0.05, 0.22, 0.01), deep, r, 0, 0.97, 0.38); desk.rotation.x = 0.35;
    // the window onto the frozen chamber: frost creeps over it as the box runs, and two glove ports
    const win = mesh(new THREE.PlaneGeometry(0.5, 0.26), new THREE.MeshStandardMaterial({ color: 0x9fb0b8, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.55 }), r, 0, 0.7, 0.377, 'Window');
    for (const x of [-0.25, 0.25]) { const port = mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 20), bake, r, x, 0.38, 0.38, 'Port_Glove'); }
    mesh(rbox(0.9, 0.52, 0.2, 0.02), paint, r, 0, 1.26, 0.05, 'Upright');
    const face = screen(0.82, 0.42, 512, r, 0, 1.26, 0.152, 0); face.m.name = 'Panel';
    inst.E4.cradle = mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.03, 14), deep, r, -0.34, 0.99, 0.43, 'Cradle');
    Object.assign(inst.E4, { face, win });
    blob(r, 1.3, 1.1);
  }

  // A canister in each cradle once its sample is loaded (the NASA sample-canister model).
  loadPeriod(THREE, 'sample-canister', { rough: 0.6, metal: 0.4 }).then(m => {
    m.scale.setScalar(2.4);
    for (const exp of EXP_IDS) { const c = m.clone(); c.name = 'Canister'; c.position.y = 0.015; c.visible = false; inst[exp].cradle.add(c); inst[exp].canister = c; }
  }).catch(e => console.warn('sample-canister', e));

  // ---------- drawing the displays ----------
  const blinkOn = () => Math.floor(Date.now() / 333) % 2 === 0;
  function drawKeys(exp, v, now) {
    const s = inst[exp].strip, g = s.g, keys = KEYS[exp], kw = (s.W - 24) / keys.length;
    const on = stateOf(exp) === 'loaded', ready = stateOf(exp) === 'ready';
    g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, s.W, s.H);
    keys.forEach(([op, word, , , lit], i) => {
      const x = 12 + i * kw + kw / 2, pressed = now - inst[exp].pressedAt[i] < 0.15 || (op === 'weigh' && weighing.on);
      const usable = op === 'load' ? ready : on;
      g.fillStyle = PAL.bakelite; g.beginPath(); g.roundRect(x - kw * 0.42, 14, kw * 0.84, s.H - 26, 6); g.fill();
      g.fillStyle = pressed ? PAL.dial : usable ? PAL.keycap : '#33322d'; g.beginPath(); g.roundRect(x - kw * 0.4, 12 + (pressed ? 3 : 0), kw * 0.8, s.H - 30, 6); g.fill();
      let fs = 13; g.font = `${fs}px ${FONT.label}`; while (g.measureText(word).width > kw * 0.74 && fs > 8) g.font = `${--fs}px ${FONT.label}`; // fit the key
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = pressed ? PAL.inkDial : usable ? PAL.ink : PAL.inkDim; g.fillText(word, x, s.H / 2 + (pressed ? 2 : 0));
      if (lit) jewel(g, x, 10, 5, 'amber', !!(v && lit(v)));
      if (op === 'load') jewel(g, x, 10, 5, 'amber', ready && blinkOn());
    });
    s.tex.needsUpdate = true;
  }
  function drawE1(v) {
    const e = inst.E1.eye, g = e.g, S = e.W;
    g.fillStyle = PAL.bakelite; g.fillRect(0, 0, S, S);
    if (stateOf('E1') !== 'loaded' && stateOf('E1') !== 'done') { g.fillStyle = '#0e0d0b'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, 7); g.fill(); }
    else if (v) {
      // without the polariser every grain is the same pale tint; with it in, each mineral shows itself
      drawGrain(g, v.mineral || 'plag', S / 2, S / 2, S / 2 - 4, { pol: v.pol, angle: v.stage, blur: v.blur, col: PAL });
      g.fillStyle = PAL.amber; g.font = `bold 18px ${FONT.type}`; g.textAlign = 'center'; g.fillText(`${v.grain + 1}/3`, S / 2, S - 26);
    }
    e.tex.needsUpdate = true;
    if (v) inst.E1.stage.rotation.y = -v.stage * Math.PI / 180;
  }
  function drawE2(v) {
    const f = inst.E2.face, g = f.g, W = f.W, H = f.H;
    g.fillStyle = PAL.console; g.fillRect(0, 0, W, H);
    // the CRT: counts across the dial, the cross-hair at the dial's mass
    const cx = 20, cy = 20, cw = 300, ch = 220;
    g.fillStyle = PAL.bezel; g.beginPath(); g.roundRect(cx - 8, cy - 8, cw + 16, ch + 16, 14); g.fill();
    g.fillStyle = PAL.glass; g.beginPath(); g.roundRect(cx, cy, cw, ch, 12); g.fill();
    g.strokeStyle = 'rgba(156,194,122,0.15)'; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(cx + cw * i / 6, cy); g.lineTo(cx + cw * i / 6, cy + ch); g.stroke(); }
    if (v?.trace) {
      const max = Math.max(1, ...v.trace) * 1.15;
      g.strokeStyle = PAL.phosphor; g.lineWidth = 2.5; g.shadowColor = PAL.phosphor; g.shadowBlur = 4; g.beginPath();
      v.trace.forEach((c, i) => { const x = cx + cw * i / (v.trace.length - 1), y = cy + ch - 10 - (ch - 20) * Math.log10(1 + c) / Math.log10(1 + max); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.shadowBlur = 0;
    }
    g.strokeStyle = 'rgba(156,194,122,0.7)'; g.beginPath(); g.moveTo(cx + cw / 2, cy); g.lineTo(cx + cw / 2, cy + ch); g.stroke();
    // the vacuum gauge, the beam lamp, the mass on Nixie tubes, the latched counts
    const rx = 350;
    g.font = `13px ${FONT.label}`; g.fillStyle = PAL.inkDim; g.textAlign = 'left';
    g.fillText('VAC', rx, 32); g.fillStyle = PAL.dial; g.fillRect(rx + 56, 22, 98, 18); g.fillStyle = 'rgba(143,176,90,0.8)'; g.fillRect(rx + 56 + 88, 36, 10, 4);
    g.fillStyle = PAL.inkDial; const vx = rx + 56 + 98 * (v?.vac || 0); g.beginPath(); g.moveTo(vx, 24); g.lineTo(vx + 5, 40); g.lineTo(vx - 5, 40); g.fill();
    g.fillStyle = PAL.inkDim; g.fillText('BEAM', rx, 72); jewel(g, rx + 70, 67, 9, v?.burnt ? 'red' : 'green', v?.burnt ? blinkOn() : !!v?.beam);
    g.fillStyle = PAL.inkDim; g.fillText('MASS', rx, 112); nixie(g, (v?.mass ?? 35).toFixed(2), rx + 112, 108, 22);
    (v?.latched || []).forEach((c, i) => { g.fillStyle = PAL.inkDim; g.fillText(String(i + 1), rx, 160 + i * 40); nixie(g, String(c).padStart(6, ' '), rx + 100, 156 + i * 40, 20); });
    f.tex.needsUpdate = true;
  }
  function drawE3(v) {
    const d = inst.E3.dial, g = d.g, S = d.W, c = S / 2;
    g.fillStyle = PAL.bezel; g.fillRect(0, 0, S, S);
    g.fillStyle = PAL.dial; g.beginPath(); g.arc(c, c, c - 8, 0, 7); g.fill();
    const ang = t => Math.PI * 0.75 + (t / E3.max) * Math.PI * 1.5;
    g.strokeStyle = PAL.inkDial; g.fillStyle = PAL.inkDial; g.font = `bold 15px ${FONT.type}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let t = 0; t <= E3.max; t += 100) { const a = ang(t), big = t % 200 === 0; g.lineWidth = big ? 3 : 1.5; g.beginPath(); g.moveTo(c + Math.cos(a) * (c - 30), c + Math.sin(a) * (c - 30)); g.lineTo(c + Math.cos(a) * (c - 14), c + Math.sin(a) * (c - 14)); g.stroke(); if (big) g.fillText(String(t / 100), c + Math.cos(a) * (c - 46), c + Math.sin(a) * (c - 46)); }
    g.font = `11px ${FONT.label}`; g.fillText('C x100', c, c + 44);
    if (v) {
      // the set pointer (a red wedge on the rim) and the needle
      const sa = ang(v.set); g.fillStyle = PAL.red; g.beginPath(); g.moveTo(c + Math.cos(sa) * (c - 10), c + Math.sin(sa) * (c - 10)); g.lineTo(c + Math.cos(sa + 0.06) * (c - 32), c + Math.sin(sa + 0.06) * (c - 32)); g.lineTo(c + Math.cos(sa - 0.06) * (c - 32), c + Math.sin(sa - 0.06) * (c - 32)); g.fill();
      const a = ang(Math.min(E3.max, v.temp)); g.strokeStyle = PAL.inkDial; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * (c - 24), c + Math.sin(a) * (c - 24)); g.stroke();
      for (let k = 0; k < 3; k++) jewel(g, c - 30 + k * 30, c + 76, 8, 'green', v.step > k);
    }
    g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(c, c, 9, 0, 7); g.fill();
    d.tex.needsUpdate = true;
    // the sight glass glows from dull red to orange as it heats; the door swings open
    const glow = v?.glow || 0;
    inst.E3.glow.material.color.setHex(glow > 0.02 ? PAL.hex.nixie : PAL.hex.nixieOff).multiplyScalar(0.35 + 0.65 * glow);
    inst.E3.door.rotation.y += (((v?.door === 'open') ? -1.4 : 0) - inst.E3.door.rotation.y) * 0.3;
  }
  function drawE4(v) {
    const f = inst.E4.face, g = f.g, W = f.W, H = f.H;
    g.fillStyle = PAL.console; g.fillRect(0, 0, W, H);
    g.font = `13px ${FONT.label}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    // the warm-up lamp: frost blue while the ice is safe, red once it has been out too long
    const warm = v?.warm ?? 0, loaded = stateOf('E4') === 'loaded' || stateOf('E4') === 'done';
    g.fillStyle = PAL.inkDim; g.fillText('ICE', 20, 30); jewel(g, 76, 30, 10, warm > E4.clockA ? 'red' : 'blue', stateOf('E4') === 'ready' ? blinkOn() || warm <= E4.clockA : loaded);
    if (stateOf('E4') === 'ready') nixie(g, String(Math.max(0, E4.clockA - warm)).padStart(3, ' '), 140, 30, 24);
    g.fillStyle = PAL.inkDim; g.fillText('W1', 20, 78); nixie(g, v?.w1 != null ? v.w1.toFixed(1).padStart(5, ' ') : '     ', 120, 78, 22);
    g.fillStyle = PAL.inkDim; g.fillText('W2', 20, 118); nixie(g, v?.w2 != null ? v.w2.toFixed(1).padStart(5, ' ') : '     ', 120, 118, 22);
    g.fillStyle = PAL.inkDim; g.fillText('VALVE', 20, 158); jewel(g, 100, 158, 8, 'amber', !!v?.valve);
    g.fillStyle = PAL.dial; g.fillRect(130, 150, 100, 16); g.fillStyle = PAL.inkDial; g.fillRect(130, 150, 100 * (v?.sub || 0), 16);
    // the D/H reader: a needle on a bare scale (the sources are on the Scientist's card)
    const mx = 270, mw = 220, my = 60;
    g.fillStyle = PAL.dial; g.fillRect(mx, my, mw, 80);
    g.strokeStyle = PAL.inkDial; g.lineWidth = 1;
    for (let t = 0; t <= E4.scale; t += 20) { const x = mx + 10 + (mw - 20) * t / E4.scale; g.beginPath(); g.moveTo(x, my + 50); g.lineTo(x, my + (t % 100 ? 58 : 66)); g.stroke(); }
    g.fillStyle = PAL.inkDial; g.font = `11px ${FONT.label}`; g.textAlign = 'center'; g.fillText('D/H', mx + mw / 2, my + 74);
    if (v?.reader != null) { const x = mx + 10 + (mw - 20) * v.reader / E4.scale; g.strokeStyle = PAL.red; g.lineWidth = 3; g.beginPath(); g.moveTo(x, my + 6); g.lineTo(x, my + 52); g.stroke(); }
    f.tex.needsUpdate = true;
    inst.E4.win.material.opacity = loaded ? 0.8 : 0.55;
  }

  let lastDraw = 0, lastStep = 0, lastStates = '';
  fontsReady.then(() => { lastDraw = 0; });
  return {
    group,
    // Click and point targets, like client/stations.js's: only while the hall is drawn and the lab is running.
    targets: () => hits.filter(m => m.userData.enabled() && isShown(m)),
    sync(s) { st = s; },
    update(now) {
      // A held WEIGH key, let go: say how long it was held (a steady weighing is two seconds).
      const t = performance.now() / 1000;
      if (weighing.on && t - weighing.last > 0.25) { weighing.on = false; act('E4', 'weigh', +(weighing.last - weighing.t0 + 0.09).toFixed(2)); sfx('clink'); }
      if (!isShown(group) || t - lastDraw < 0.1) return;
      lastDraw = t;
      for (const exp of EXP_IDS) {
        const [col, blink] = STATE_COL[stateOf(exp)] || [PAL.hex.amberOff, false];
        inst[exp].lamp.material.color.setHex(blink && !blinkOn() ? PAL.hex.amberOff : col);
        if (inst[exp].canister) inst[exp].canister.visible = ['loaded', 'done'].includes(stateOf(exp));
        drawKeys(exp, view(exp), t);
      }
      drawE1(view('E1')); drawE2(view('E2')); drawE3(view('E3')); drawE4(view('E4'));
      // a step of the furnace done, or an experiment finished: a chime
      const step = view('E3')?.step || 0; if (step > lastStep) sfx('chime'); lastStep = step;
      const states = EXP_IDS.map(stateOf).join(); if (lastStates && states !== lastStates && states.split(',').some((x, i) => x === 'ready' && lastStates.split(',')[i] === 'locked')) sfx('chime'); lastStates = states;
    },
  };
}
function isShown(m) { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; }
