// The astronaut's hands: the tools, and every repair.
//
// There are two ways to do each thing, and both end in the same message to the server:
//   - physical (VR): find a tool lying in the hall, pick it up and bring it to the work. Sweep the brush
//     over the dust, hold the welder on the crack, push a plug into a socket, pull the wheel off its hub.
//   - pointing (mouse, or a VR trigger at arm's length): click the thing. This is the fallback
//     that lets the game be tested, and played, without a headset.
// The server decides what counted (server/game.js). Nothing here changes the game by itself.
//
// The tools are physics bodies (client/physics.js): they lie where they were left, fall, tumble and
// can be thrown. The astronaut has two hands and holds one tool in each (docs/design/hands-and-avatar.md):
// hold the trigger or the grip on a tool to take it, let go to drop it or throw it.
import { FAULTS, TOOLS, PLACES, CFG } from '/shared/config.js';
import { drawTool } from '/shared/icons.js';
import { PAL } from '/shared/palette.js';
import { loadGlove, loadPeriod, MODELS } from '/shared/assets.js';
import { HALL, COR, SOLIDS, ROOM } from '/interior.js';
import { CHAMBER } from '/airlock.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Everything here is a guess until it has been tried on a head: tune these first.
const GRAB = 0.2;           // metres: how close a hand must be to a loose tool to take it...
const GRAB_BIG = 0.35;      // ...the tire and the generator
const GRAB_CORD = 0.14;     // ... the generator's pull handle
const GRAB_PLUG = 0.18;     // ... a loose cable plug
const SOCKET_SNAP = 0.11;   // metres: a held plug this close to a socket goes in (sockets are 0.25 apart)
const WHEEL_PULL = 0.3;     // metres the broken wheel must be pulled before it comes off
const CORD_PULL = 0.4;      // metres of generator cord
const TIRE_FIT = 0.25;      // metres from the tire's centre to the bare hub
const PATCH_RANGE = 0.13;   // metres from the patch to the leak
const WELD_DWELL = 0.4;     // seconds the tip must stay on one point of the crack
const WELD_RANGE = 0.12;    // metres from the tip to that point
const HEAVY_LAG = 9;        // 1/s: how fast the tire and the generator catch up with the hand (they swing)
// On a laptop, where the held tools sit in the view: the right hand's, then the left's (held[2], held[3]).
const DESK_HOLD = { 2: [0.24, -0.26, -0.55], 3: [-0.24, -0.26, -0.55] };

// Each tool's collider (client/physics.js parts, in the tool's own frame, -z away from the hand), how it
// lies at rest, and how far its middle sits above what it lies on.
const BODY = {
  brush:  { parts: [['box', [0.04, 0.04, 0.24], [0, 0, -0.08]], ['box', [0.2, 0.065, 0.1], [0, 0, -0.25]]], rest: [0, 0, 0], lift: 0.035 },
  patch:  { parts: [['box', [0.15, 0.15, 0.03], [0, 0, -0.06]]], rest: [-Math.PI / 2, 0, 0], lift: 0.02 },
  welder: { parts: [['box', [0.05, 0.15, 0.06], [0, -0.06, 0]], ['box', [0.065, 0.07, 0.28], [0, 0.03, -0.1]]], rest: [0, 0, Math.PI / 2], lift: 0.04 },
  tire:   { parts: [['cyl', [0.41, 0.18], [0, 0, 0], [0, 0, Math.PI / 2]]], rest: [0, 0, Math.PI / 2], lift: 0.09 },
  gen:    { parts: [['box', [0.46, 0.36, 0.34], [0, -0.03, 0]]], rest: [0, 0, 0], lift: 0.21 },
};
// The NASA hand tools that used to hang on the shadow board. Decoys: they lie round the hall, you can pick
// them up and throw them, nothing uses them, and holding one still fills your hand. Room coordinates.
const DECOYS = {
  wrench:       { mass: 0.3, at: [-0.9, 0.96, -4.45] },
  ratchet:      { mass: 0.5, at: [2.35, 0, -3.5] },
  hammer:       { mass: 1.0, at: [-2.6, 1.78, -11.2] },
  'grease-gun': { mass: 1.2, at: [-1.6, 0, -7.6] },
};
const BIG = id => id === 'tire' || id === 'gen';

export function buildFixtures(THREE, world, { rig, camera, send, sfx = () => {}, sfxAt = null, pulse = () => {}, phys = null, interior = null, where = () => 'out' }) {
  const F = world.fixtures;
  const V = () => new THREE.Vector3();
  const a = V(), b = V(), c = V(), q4 = new THREE.Quaternion();
  let st = { held: null, tools: null, scene: null, suit: false };
  const clock = () => performance.now() / 1000; // not the frame time: a click can land between two slow frames
  const hits = [];           // every mesh that can be pointed at
  const held = [null, null, null, null]; // what each hand has hold of: 0 and 1 the hands in a headset, 2 and 3 a laptop's right and left
  const sides = ['', ''];                // which side each headset hand is on, as of the last frame
  const sent = new Map();    // repairs already reported, so one sweep does not send a cell fifty times
  const once = (key, fn, every = 1) => { const t = clock(); if ((sent.get(key) || -9) + every > t) return false; sent.set(key, t); fn(); return true; };
  let refusedAt = -9, refused = '', selectedPlug = -1, plugCooldown = 0;
  const DESK = 2, DESK_L = 3;
  const isDesk = i => i === DESK || i === DESK_L;
  // The server's hand for one of ours: 0 left, 1 right.
  const slotOf = i => i === DESK_L ? 0 : i === DESK ? 1 : sides[i] === 'left' ? 0 : 1;

  const ghost = new THREE.MeshBasicMaterial({ visible: false }); // never drawn, but the raycaster still finds it
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; };
  // A mesh you can point at. `hold` means it keeps working while the trigger or mouse stays down.
  const target = (mesh, enabled, click, hold = false) => { Object.assign(mesh.userData, { enabled, click, hold }); hits.push(mesh); return mesh; };
  // ---------- the five tools. Each is modelled in the hand: local -z points away from you. ----------
  const tools = {};
  const orange = PAL.hex.orange, steel = PAL.hex.aluminium, dark = 0x2b2a26;
  {
    const g = new THREE.Group();                                   // brush
    add(g, new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), mat(orange), 0, 0, -0.08).rotation.x = Math.PI / 2;
    add(g, new RoundedBoxGeometry(0.2, 0.035, 0.05, 2, 0.008), mat(dark, { roughness: 0.7, metalness: 0.1 }), 0, 0, -0.22).name = 'Head';
    add(g, new RoundedBoxGeometry(0.19, 0.03, 0.07, 2, 0.01), mat(PAL.hex.whiteOff, { roughness: 1, metalness: 0 }), 0, 0, -0.28).name = 'Bristles';
    g.userData = { tip: new THREE.Vector3(0, 0, -0.3), hit: [0.26, 0.12, 0.44, -0.12] };
    tools.brush = g;
  }
  {
    const g = new THREE.Group();                                   // patch kit
    add(g, new RoundedBoxGeometry(0.15, 0.15, 0.024, 2, 0.01), mat(orange, { roughness: 0.75, metalness: 0.05 }), 0, 0, -0.06).name = 'Body';
    add(g, new RoundedBoxGeometry(0.1, 0.03, 0.028, 1, 0.006), mat(PAL.hex.dial, { roughness: 0.8, metalness: 0 }), 0, 0, -0.06);
    add(g, new RoundedBoxGeometry(0.03, 0.1, 0.028, 1, 0.006), mat(PAL.hex.dial, { roughness: 0.8, metalness: 0 }), 0, 0, -0.06);
    g.userData = { tip: new THREE.Vector3(0, 0, -0.07), hit: [0.2, 0.2, 0.12, -0.06] };
    tools.patch = g;
  }
  {
    // Welder: NASA's pistol-grip power tool (docs/ASSETS.md), held by its grip with the bit forward. The
    // model's bit runs along +z, so it is turned round; the grip sits on the hand, the bit tip 0.27 m ahead.
    const g = new THREE.Group();
    const body = new THREE.Group(); body.name = 'Body'; g.add(body);
    add(body, new THREE.BoxGeometry(0.045, 0.14, 0.05), mat(dark), 0, -0.06, 0);     // stand-in until the model loads
    add(body, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), mat(orange), 0, 0.02, -0.1).rotation.x = Math.PI / 2;
    loadPeriod(THREE, 'pistol-grip-tool', { rough: 0.7, metal: 0.25 }).then(m => {
      m.rotation.y = Math.PI; m.position.set(0, 0.02, -0.075);
      body.clear(); body.add(m);
    }).catch(e => console.warn('welder model', e));
    const TIP = new THREE.Vector3(0, 0.107, -0.27);
    const spark = add(g, new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc98a, toneMapped: false }), TIP.x, TIP.y, TIP.z - 0.02);
    spark.name = 'Spark';
    spark.visible = false; // no light of its own: every extra light costs the Quest on every pixel
    g.userData = { tip: TIP, hit: [0.1, 0.3, 0.42, -0.07], spark };
    tools.welder = g;
  }
  {
    const g = new THREE.Group();                                   // space tire: the rover's wheel, new
    add(g, new THREE.TorusGeometry(0.32, 0.09, 10, 24), mat(dark, { roughness: 0.9 })).rotation.y = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const sp = add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), mat(steel, { metalness: 0.9 }));
      sp.rotation.x = i * Math.PI / 6;
    }
    add(g, new THREE.TorusGeometry(0.32, 0.02, 6, 24), mat(orange)).rotation.y = Math.PI / 2;
    g.userData = { tip: new THREE.Vector3(0, 0, 0), hit: [0.3, 0.86, 0.86, 0] };
    tools.tire = g;
  }
  {
    const g = new THREE.Group();                                   // backup generator, with its pull cord
    add(g, new RoundedBoxGeometry(0.42, 0.3, 0.3, 3, 0.03), mat(PAL.hex.hazard, { roughness: 0.7, metalness: 0.25 })).name = 'Body';
    add(g, new RoundedBoxGeometry(0.46, 0.04, 0.34, 2, 0.012), mat(dark, { roughness: 0.8, metalness: 0.3 }), 0, -0.17, 0).name = 'Skid';
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), mat(dark, { roughness: 0.6, metalness: 0.4 }), -0.1, 0.18, 0);
    const handle = add(g, new THREE.TorusGeometry(0.05, 0.014, 6, 14), mat(PAL.hex.red, { roughness: 0.55, metalness: 0 }), 0.12, 0.2, 0);
    handle.name = 'Handle_Cord';
    g.userData = { tip: new THREE.Vector3(0, 0, 0), hit: [0.5, 0.45, 0.4, 0], handle };
    tools.gen = g;
  }
  for (const id in tools) { tools[id].name = 'Tool_' + id; tools[id].traverse(o => { if (o.isMesh) o.castShadow = true; }); }

  // ---------- the decoys: NASA hand tools, the same shapes as the old shadow board ----------
  for (const [id, d] of Object.entries(DECOYS)) {
    const g = new THREE.Group(); g.name = 'Decoy_' + id;
    const [sx, sy, sz] = MODELS[id].size;
    g.userData = { decoy: true, tip: new THREE.Vector3(), hit: [sx + 0.06, sy + 0.06, sz + 0.06, 0], size: [sx, sy, sz] };
    loadPeriod(THREE, id, { rough: 0.55, metal: 0.6, merge: true }).then(m => {
      const box = new THREE.Box3().setFromObject(m), mid = box.getCenter(V());
      m.position.sub(mid); g.add(m);
    }).catch(e => console.warn(id, e));
    tools[id] = g;
  }

  // ---------- where the tools are: two places, two containers ----------
  // In the hall a tool is a child of the hall's group (room coordinates, the same as the hall's physics);
  // on the Moon a child of `outside`, which astronaut.js hides with the rest of the surface.
  const outside = new THREE.Group(); outside.name = 'Tools_Surface';
  world.rover.parent.add(outside);
  const ORIGIN = interior ? interior.group.position : V();
  const placeNow = () => where() === 'in' ? 'hall' : 'surface';
  const container = place => place === 'hall' && interior ? interior.group : outside;
  // id -> { state: 'loose' | 'held' | 'gone', seen (the server's last word, as a key), report (where we last said it lies),
  //         drop (when we let go; until it settles the server's guess is ignored), took (when we picked it up) }
  const T = {};
  const restQ = id => new THREE.Quaternion().setFromEuler(new THREE.Euler(...(BODY[id]?.rest || [0, 0, 0])));
  function lay(id, place, x, y, z, q) {
    const g = tools[id], lift = BODY[id]?.lift ?? (g.userData.size ? g.userData.size[1] / 2 : 0.05);
    const pose = { x, y: y + lift + 0.03, z, q: q || restQ(id) };
    if (phys) phys.set(id, place, pose);
    const cont = container(place);
    if (g.parent !== cont) cont.add(g);
    g.position.set(pose.x, pose.y, pose.z); g.quaternion.copy(pose.q);
    T[id].quiet = clock() + 0.8; // settling into place makes no noise
  }
  for (const id in tools) {
    const g = tools[id];
    T[id] = { state: 'loose', seen: '', report: null, drop: -9, took: -9, quiet: 0, trail: [] };
    const decoy = DECOYS[id];
    const parts = decoy ? [['box', g.userData.size]] : BODY[id].parts;
    const mass = decoy ? decoy.mass : TOOLS[id].mass;
    if (phys) phys.add(id, parts, mass, 'hall', { x: 0, y: -5, z: 0 });
    // The demo layout until the server says otherwise.
    const sp = decoy ? { x: decoy.at[0], y: decoy.at[1], z: decoy.at[2] } : PLACES.toolSpots[PLACES.demoTools[id]];
    lay(id, 'hall', sp.x, sp.y, sp.z);
    // One invisible box per tool to point at: click a loose tool to take it.
    const [w, h, d, z] = g.userData.hit;
    target(add(g, new THREE.BoxGeometry(w, h, d), ghost, 0, 0, z), () => T[id].state === 'loose' && running(), () => take(id, DESK));
  }
  const running = () => !!st.tools;
  const isTool = h => h?.kind === 'tool';
  // The tools (or decoys) in the hands, [left, right], ids or null.
  const hands = () => { const out = [null, null]; held.forEach((h, i) => { if (isTool(h)) out[slotOf(i)] = h.id; }); return out; };
  const inHand = () => held.find(isTool)?.id || null; // any one of them
  const has = id => held.some(h => isTool(h) && h.id === id);
  const handOf = id => held.findIndex(h => isTool(h) && h.id === id);

  // Pick a loose tool up into hand i: one tool in each hand. On a laptop (DESK) it goes in the free hand,
  // right first; with both full, the right hand's tool is put down where you stand first.
  function take(id, i) {
    if (T[id]?.state !== 'loose') return false;
    if (i === DESK) { if (held[DESK] && !held[DESK_L]) i = DESK_L; else if (held[DESK]) drop(DESK, [0, 0, 0], true); }
    if (held[i]) return false;
    const g = tools[id];
    held[i] = { kind: 'tool', id, grip: null };
    if (BIG(id) && !isDesk(i)) {
      // Heavy things are held where the hand closed on them, not snapped to it.
      const obj = handObj[i];
      if (obj) { obj.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); held[i].grip = new THREE.Matrix4().copy(obj.matrixWorld).invert().multiply(g.matrixWorld); }
    }
    T[id].state = 'held'; T[id].took = clock(); T[id].trail.length = 0;
    rig.attach(g); // carried in the rig's frame, so it comes through the airlock with you
    if (phys) phys.hold(id);
    if (!g.userData.decoy) send({ take: id, hand: slotOf(i) });
    sfx('click');
    if (i >= 0 && !isDesk(i)) pulse(i, 0.7, 50);
    return true;
  }
  // Open hand i: the tool is loose, with the hand's speed (dropped, or thrown).
  function drop(i, v, quiet = false) {
    const h = held[i]; if (!isTool(h)) return;
    held[i] = null;
    const id = h.id, g = tools[id], place = placeNow();
    container(place).attach(g);
    T[id].state = 'loose'; T[id].drop = clock();
    if (phys) phys.release(id, v || velocity(id));
    if (!g.userData.decoy) {
      g.getWorldPosition(a); const p = place === 'hall' ? a.sub(ORIGIN) : a;
      send({ drop: id, x: p.x, z: p.z });
    }
    if (!quiet) sfx('click');
  }
  // The held tool's speed over the last few frames, in m/s, for a throw.
  function velocity(id) {
    const tr = T[id].trail;
    if (tr.length < 2) return [0, 0, 0];
    const [p0, t0] = tr[0], [p1, t1] = tr[tr.length - 1], dt = Math.max(1e-3, t1 - t0);
    return [(p1.x - p0.x) / dt, (p1.y - p0.y) / dt, (p1.z - p0.z) / dt];
  }
  function pullCord() {
    if (tools.gen && T.gen.state !== 'gone' && (has('gen') || near('gen', 2))) once('gen', () => { send({ gen: true }); sfx('clank'); }, 2);
  }
  const near = (id, r) => { camera.getWorldPosition(a); return tools[id].getWorldPosition(b).distanceTo(a) < r; };
  const need = type => { const t = FAULTS[type].tool; return !t || has(t); };
  // Where each hand's held tool is drawn, set by update(): the controller, or the camera on a laptop.
  const handObj = [null, null, camera, camera];

  // ---------- tool sounds: a clank where it lands, quieter and duller outside where there is no air ----------
  const hitAt = new Map();
  const dust = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.hex.regolith, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; m.userData.born = -9; outside.add(m); return m;
  });
  let dustNext = 0;
  if (phys) phys.onHit((id, v, p, place) => {
    if (place !== placeNow() || clock() < (T[id]?.quiet || 0)) return;
    const t = clock(); if ((hitAt.get(id) || -9) > t - 0.09) return; hitAt.set(id, t);
    const inside = place === 'hall', mass = DECOYS[id]?.mass || TOOLS[id]?.mass || 1;
    a.set(p[0], p[1], p[2]); if (inside) a.add(ORIGIN);
    camera.getWorldPosition(b);
    const k = handOf(id);
    if (!inside && k < 0 && a.distanceTo(b) > 3) return; // outside you hear it through your boots, close by
    const gain = Math.min(1, v / 3) * (inside ? 1 : 0.35);
    if (sfxAt) sfxAt('thud', a, gain, { mass }); else sfx('clank');
    if (k >= 0 && !isDesk(k)) pulse(k, Math.min(1, 0.2 + v / 4), 30);
    if (!inside && p[1] < 0.4) { // a little dust where it hits the regolith, settling slowly
      const d = dust[dustNext++ % dust.length];
      d.position.copy(a); d.userData.born = t; d.visible = true; d.userData.size = 0.08 + Math.min(0.25, v * 0.04 * Math.sqrt(mass));
    }
  });
  // A tool came to rest. If it is somewhere new, tell the server (and so Mission Ops) where it lies.
  if (phys) phys.onRest(id => {
    if (DECOYS[id] || T[id].state !== 'loose') return;
    const p = phys.pose(id), inside = p.place === 'hall', srv = st.tools?.[id];
    if (srv && srv.at === 'loose' && !!srv.inside === inside && Math.hypot(srv.x - p.x, srv.z - p.z) < 0.05 && clock() - T[id].drop > 2) return;
    T[id].report = { inside, x: p.x, z: p.z };
    send({ rest: id, inside, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) });
  });

  // ---------- static things for the tools to land on ----------
  if (phys && interior) {
    const P = phys, C = P.CANNON;
    const fixedBox = (place, w, h, d, x, y, z, ry = 0) => P.fixed(place, P.box(w, h, d), x, y, z, ry ? P.yaw(ry) : undefined);
    // A box given in a door chamber's own frame (client/airlock.js), at that chamber's pose.
    const inFrame = (place, pose, w, h, d, lx, ly, lz) => {
      const cs = Math.cos(pose.ry), sn = Math.sin(pose.ry);
      fixedBox(place, w, h, d, pose.x + lx * cs + lz * sn, ly, pose.z - lx * sn + lz * cs, pose.ry);
    };
    const { width: AW, depth: AD, height: AH } = CHAMBER;
    const chamber = (place, pose, inner, outer) => {
      for (const sx of [-1, 1]) inFrame(place, pose, 0.1, AH, AD + 0.1, sx * (AW / 2 + 0.05), AH / 2, AD / 2);
      inFrame(place, pose, AW, 0.1, AD, 0, AH + 0.05, AD / 2);
      inFrame(place, pose, AW, 0.1, AD + 0.2, 0, -0.05, AD / 2);
      if (inner) inFrame(place, pose, AW, AH, 0.1, 0, AH / 2, -0.05);
      if (outer) inFrame(place, pose, AW, AH, 0.1, 0, AH / 2, AD + 0.05);
    };
    // The hall: floor, ceiling, the walls with their four doorways, and the furniture.
    fixedBox('hall', 16, 0.2, 24, 0, -0.1, -6);
    fixedBox('hall', 16, 0.2, 24, 0, ROOM.height + 0.1, -6);
    const T2 = 0.2, gap = CHAMBER.door.hw + 0.02;
    // A wall along x (at z) or along z (at x), from a to b, with doorways centred at `holes`.
    const wall = (axis, at, from, to, holes, out) => {
      const cuts = [from, ...holes.flatMap(h => [h - gap, h + gap]), to];
      for (let n = 0; n < cuts.length; n += 2) {
        const len = cuts[n + 1] - cuts[n], mid = (cuts[n] + cuts[n + 1]) / 2;
        if (len <= 0.01) continue;
        if (axis === 'x') fixedBox('hall', len, ROOM.height, T2, mid, ROOM.height / 2, at + out * T2 / 2);
        else fixedBox('hall', T2, ROOM.height, len, at + out * T2 / 2, ROOM.height / 2, mid);
      }
    };
    const D = PLACES.doors;
    wall('x', HALL.z1, HALL.x0, HALL.x1, [D.S.hall.x], 1);
    wall('z', HALL.x0, HALL.z0, HALL.z1, [D.W.hall.z], -1);
    wall('z', HALL.x1, COR.z0, HALL.z1, [D.E.hall.z], 1);
    wall('x', HALL.z0, HALL.x0, COR.x0, [], -1);
    wall('z', COR.x0, COR.z0, HALL.z0, [], -1);
    wall('x', COR.z0, COR.x0, COR.x1, [D.N.hall.x], -1);
    for (const [x0, x1, z0, z1, top] of SOLIDS) fixedBox('hall', x1 - x0, top, z1 - z0, (x0 + x1) / 2, top / 2, (z0 + z1) / 2);
    for (const d of Object.values(D)) chamber('hall', d.hall, false, true);
    // The Moon: the ground, the habitat's core and its two side modules, and the four chambers.
    if (world.height) P.terrain(world.ground || world.height, CFG.bounds + 3, 1);
    P.fixed('surface', new C.Cylinder(2.5, 2.5, 3.6, 16), 0, 1.8, 0);
    fixedBox('surface', 2.4, 2.6, 1.9, -3.4, 1.3, 0);
    fixedBox('surface', 5.2, 2.8, 2.9, 4.8, 1.4, 0);
    for (const d of Object.values(D)) chamber('surface', { x: d.x + Math.sin(d.ry) * CHAMBER.outset, z: d.z + Math.cos(d.ry) * CHAMBER.outset, ry: d.ry }, true, false); // as world.js stands them
  }

  // ---------- things to point at on the fixtures themselves ----------
  F.dustCells.forEach((cell, i) => target(cell, () => !!st.scene?.dust?.[i], () => brushCell(i), true));
  function brushCell(i) {
    if (!need('dust') || !st.scene?.dust?.[i]) return false;
    return once('dust' + i, () => { send({ fix: 'dust', cell: i }); once('brushSfx', () => sfx('brush'), 0.09); });
  }

  const plugLoose = i => !!st.scene?.board && !st.scene.board[i].seated;
  F.plugs.forEach((plug, i) => {
    const box = add(plug, new THREE.BoxGeometry(0.13, 0.13, 0.2), ghost);
    target(box, () => plugLoose(i), () => { selectedPlug = selectedPlug === i ? -1 : i; sfx('click'); });
  });
  F.sockets.forEach((p, j) => {
    const disc = add(F.board, new THREE.BoxGeometry(0.16, 0.16, 0.06), ghost, p.x, p.y, p.z - 0.02);
    target(disc, () => selectedPlug >= 0 && plugLoose(selectedPlug), () => { tryPlug(selectedPlug, j); selectedPlug = -1; });
  });
  function tryPlug(cable, socket) {
    if (!plugLoose(cable) || st.scene.board.some(x => x.seated && x.socket === socket)) return;
    sfx('click');
    send({ fix: 'board', cable, socket });
  }

  const wheelHit = add(F.wheel, new THREE.SphereGeometry(0.45, 8, 6), ghost);
  target(wheelHit, () => st.scene?.wheel === 1, () => pullWheel());
  const hubHit = add(F.hub, new THREE.SphereGeometry(0.3, 8, 6), ghost);
  target(hubHit, () => st.scene?.wheel === 2, () => fitTire());
  function pullWheel() { once('pull', () => { sfx('click'); send({ fix: 'wheel', pull: true }); }); }
  function fitTire() { return need('wheel') && once('fit', () => { sfx('click'); send({ fix: 'wheel', fit: true }); }); }

  const weldHits = F.crackPts.map((p, i) => {
    const m = add(world.fixtures.crack, new THREE.SphereGeometry(0.09, 8, 6), ghost);
    return target(m, () => !!st.scene?.hull && !st.scene.hull.welded[i], () => weldPoint(i), true);
  });
  function weldPoint(i) {
    if (!need('hull') || !st.scene?.hull || st.scene.hull.welded[i]) return false;
    return once('weld' + i, () => { send({ fix: 'hull', point: i }); sfx('weld'); });
  }
  function patchSuit() { return !!st.suit && has('patch') && once('patch', () => { sfx('click'); send({ fix: 'suit' }); }); }

  // ---------- the suit leak: a pulsing spot on your forearm ----------
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: PAL.hex.red, toneMapped: false }));
  spot.visible = false;
  const spotHit = add(spot, new THREE.SphereGeometry(0.1, 8, 6), ghost);
  target(spotHit, () => st.suit && spot.visible, () => patchSuit());

  // ---------- "you need this tool": its outline floats over a fixture you walked up to without it ----------
  const hints = {};
  for (const [type, f] of Object.entries(FAULTS)) {
    if (!f.tool || type === 'suit') continue;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(43,50,48,0.85)'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = PAL.bezel; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 59, 0, 7); g.stroke();
    drawTool(g, f.tool, 64, 64, 84, PAL.amber);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
    s.scale.setScalar(0.42); s.visible = false; s.renderOrder = 9;
    world.rover.parent.add(s);
    hints[type] = s;
  }

  // ---------- things only a headset shows ----------
  // A ring round whatever each empty hand would grab if it closed now.
  const rings = [0, 1].map(() => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: PAL.hex.green, toneMapped: false, depthTest: false, transparent: true, opacity: 0.9 }));
    r.visible = false; r.renderOrder = 8;
    world.rover.parent.add(r);
    return r;
  });
  const hover = [null, null]; // a short name for what each ring is on, to buzz once when it changes
  // The NASA EVA glove on each controller, so there is a hand to see. Tracked hands are drawn by the page itself.
  // loadGlove gives the glove in the cuff arm's axes (client/arm.js): fingers +x, back of the hand +z, thumb
  // -y for a left hand. Here the fingers run along the controller's pointing ray (-z) with the thumb on top
  // and the back of the hand outward, the same frame client/arm.js fits its forearm to, so the cuff on the
  // left controller sits on this glove's wrist. Each glove carries a left and a right hand and shows the one
  // for the side it is on.
  const GLOVE_FIT = {
    left: [[0, 0, -1], [0, -1, 0], [-1, 0, 0]],
    right: [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  };
  const CUFF_BEHIND = 0.148; // metres from the controller back to the glove's cuff, as arm.js's FIT.controller has it
  const gloves = [0, 1].map(() => {
    const g = new THREE.Group();
    g.name = 'Glove';
    for (const side of ['left', 'right']) {
      const fit = new THREE.Group();
      fit.name = side === 'left' ? 'Hand_L' : 'Hand_R';
      fit.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...GLOVE_FIT[side].map(a => new THREE.Vector3(...a))));
      g.add(fit); g.userData[side] = fit;
      loadGlove(THREE, { mirror: side === 'right', emissive: 0x0e0e0c }).then(m => { m.position.x = -CUFF_BEHIND; fit.add(m); })
        .catch(e => console.warn('glove model', e));
    }
    // A controller points where the fingers point, but the forearm behind it runs down and back to the
    // elbow. Tilted that way the glove stays below the line of sight, and does not hide what the hand is reaching for.
    g.rotation.x = 0.6;
    g.visible = false;
    return g;
  });
  // The generator's pull cord, drawn while a hand has hold of it.
  const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: 0xa8402f }));
  cord.name = 'Cord_Pull';
  cord.frustumCulled = false; cord.visible = false;
  world.rover.parent.add(cord);
  // A ring on the socket a held plug is about to go into.
  const socketRing = add(F.board, new THREE.TorusGeometry(0.07, 0.008, 6, 20), new THREE.MeshBasicMaterial({ color: PAL.hex.white, toneMapped: false }));
  socketRing.visible = false;

  // ---------- helpers for the physical path ----------
  const worldPos = (obj, out) => obj.getWorldPosition(out);
  const headXZ = V();

  // What could this hand grab right now? Each thing has its own reach; the one the hand is deepest inside wins.
  function nearest(p, i) {
    let best = null, bestD = Infinity;
    const offer = (d, limit, what) => { if (d < limit && d / limit < bestD) { bestD = d / limit; best = what; } };
    for (const id in tools) {
      const g = tools[id], s2 = T[id].state;
      if (s2 === 'loose' && g.parent?.visible !== false && g.parent === container(placeNow())) offer(worldPos(g, b).distanceTo(p), BIG(id) ? GRAB_BIG : GRAB, { kind: 'tool', id });
    }
    // The generator's pull handle, on one standing loose or held in the other hand.
    if (tools.gen && (T.gen.state === 'loose' || (T.gen.state === 'held' && handOf('gen') !== i))) {
      worldPos(tools.gen.userData.handle, b);
      offer(b.distanceTo(p), GRAB_CORD, { kind: 'cord', start: p.clone() });
    }
    F.plugs.forEach((plug, n) => { if (plugLoose(n) && !plug.userData.held) offer(worldPos(plug, b).distanceTo(p), GRAB_PLUG, { kind: 'plug', i: n }); });
    if (st.scene?.wheel === 1) offer(worldPos(F.wheel, b).distanceTo(p), 0.5, { kind: 'wheel', start: p.clone() });
    return best;
  }

  // Move a held tool to its hand: snapped for the light ones, lagging for the heavy ones. dt 0 snaps.
  const gripM = new THREE.Matrix4(), want = new THREE.Matrix4(), pW = V(), qW = new THREE.Quaternion(), sW = V();
  function follow(id, dt, i = handOf(id)) {
    const g = tools[id], h = held[i], obj = handObj[i];
    if (!g || !h) return;
    if (g.parent !== rig) rig.attach(g);
    if (dt > 0 && obj) {
      obj.updateWorldMatrix(true, false);
      if (isDesk(i)) want.compose(pW.set(...DESK_HOLD[i]), qW.identity(), sW.set(1, 1, 1)).premultiply(obj.matrixWorld);
      else if (h.grip) want.multiplyMatrices(obj.matrixWorld, h.grip);
      else want.copy(obj.matrixWorld);
      want.premultiply(gripM.copy(rig.matrixWorld).invert()); // into the rig's frame
      want.decompose(pW, qW, sW);
      const k = BIG(id) && !isDesk(i) ? 1 - Math.exp(-dt * HEAVY_LAG) : 1;
      g.position.lerp(pW, k); g.quaternion.slerp(qW, k); g.scale.setScalar(1);
    }
    g.updateMatrixWorld(true);
    if (!phys) return;
    const place = placeNow();
    g.getWorldPosition(a); g.getWorldQuaternion(q4);
    if (place === 'hall') a.sub(ORIGIN);
    const tr = T[id].trail;
    if (tr.length && tr[tr.length - 1][2] !== place) tr.length = 0; // came through an airlock: no throw from the jump
    tr.push([a.clone(), clock(), place]); if (tr.length > 4) tr.shift();
    phys.follow(id, place, a.x, a.y, a.z, q4, dt);
  }
  // Is a mesh in the part of the world being drawn?
  const isShown = m => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; };

  const api = {
    tools, rings, gloves, spot, outside,
    get refusedAt() { return refusedAt; },
    // Meshes that can be pointed at right now.
    targets: () => hits.filter(m => m.userData.enabled() && m.parent && isShown(m)),
    click(mesh) { mesh.userData.click(); },

    // Desk keys for the things you cannot point at, and Q to put the held tool down.
    patchSuit, pullCord,
    // Q on a laptop puts down the right hand's tool, then the left's.
    dropHeld() {
      const i = [DESK, DESK_L, 1, 0].find(k => isTool(held[k])); if (i === undefined) return false;
      if (isDesk(i)) { // 0.6 m in front, with a small push forward
        const g = tools[held[i].id];
        camera.getWorldPosition(a); camera.getWorldDirection(b); b.y = 0; b.normalize();
        rig.worldToLocal(c.copy(a).addScaledVector(b, 0.6).setY(Math.max(0.4, a.y - 0.45)));
        g.position.copy(c);
        g.updateMatrixWorld(true);
        follow(held[i].id, 0);
        drop(i, [b.x * 1.2, 0.4, b.z * 1.2]);
      } else drop(i);
      return true;
    },
    // What is in the hands: [left, right], the tools' (or decoys') ids or null; inHand is either one.
    get hands() { return hands(); },
    get inHand() { return inHand(); },
    toolState: id => T[id] && { state: T[id].state, ...(phys ? phys.pose(id) : {}) },
    // Put a loose tool at room/world coordinates (tests and the console).
    layTool: (id, place, x, y, z) => lay(id, place, x, y, z),
    // For the tests: put a tool straight into hand i (whatever that hand held is dropped where it is), or
    // with no id empty both hands.
    give(id, i) {
      if (!id) { held.forEach((h, k) => { if (isTool(h)) drop(k, [0, 0, 0], true); }); return; }
      if (isTool(held[i])) drop(i, [0, 0, 0], true);
      if (T[id].state === 'gone' && phys) phys.restore(id);
      T[id].state = 'loose';
      const obj = handObj[i] || camera; obj.getWorldPosition(a);
      const place = placeNow(), p = place === 'hall' ? a.clone().sub(ORIGIN) : a;
      lay(id, place, p.x, p.y, p.z);
      take(id, i);
    },

    // A hand closed (grip button, or a pinch with bare hands) at world point p. True if it got something.
    grab(i, p) {
      if (held[i]) return true;
      const what = nearest(p, i);
      if (!what) return false;
      if (what.kind === 'tool') { take(what.id, i); return true; }
      held[i] = what;
      if (what.kind === 'plug') { F.plugs[what.i].userData.held = true; selectedPlug = -1; }
      if (what.kind === 'wheel') F.wheel.userData.held = true;
      sfx('click');
      pulse(i, 0.7, 50);
      return true;
    },
    // The hand opened: a tool in it is loose, with the hand's speed. A fast hand throws it.
    release(i) {
      const h = held[i];
      if (!h) return;
      if (isTool(h)) { const v = velocity(h.id), fast = Math.hypot(...v) > 1.5; drop(i, v); if (fast) pulse(i, 0.8, 60); return; }
      held[i] = null;
      if (h.kind === 'plug') F.plugs[h.i].userData.held = false;
      if (h.kind === 'wheel') F.wheel.userData.held = false;
    },
    holding: i => held[i],
    // A new mission: the server lays the tools out again; take its word for every one.
    reset() {
      held.forEach((h, i) => { if (isTool(h)) drop(i, [0, 0, 0], true); held[i] = null; });
      for (const id in T) { T[id].seen = ''; T[id].report = null; T[id].drop = -9; }
      for (const [id, d] of Object.entries(DECOYS)) { if (T[id].state === 'gone' && phys) phys.restore(id); T[id].state = 'loose'; lay(id, 'hall', ...d.at); }
    },

    // The server's latest word on what exists and where the tools are.
    sync(s) {
      st = s;
      if (s.tools) for (const [id, t] of Object.entries(s.tools)) {
        const me = T[id], g = tools[id]; if (!me) continue;
        const key = [t.at, t.inside ? 1 : 0, (+t.x).toFixed(2), (+t.z).toFixed(2)].join('|');
        const changed = key !== me.seen; me.seen = key;
        if (t.at === 'gone') {
          if (me.state === 'held') { const k = handOf(id); if (k >= 0) held[k] = null; }
          if (me.state !== 'gone') { me.state = 'gone'; if (phys) phys.remove(id); if (g.parent) g.parent.remove(g); }
          continue;
        }
        if (me.state === 'gone') { // back again: the restocked tire
          if (phys) phys.restore(id);
          me.state = 'loose'; lay(id, t.inside ? 'hall' : 'surface', t.x, t.y, t.z);
          continue;
        }
        if (t.at === 'loose' && me.state === 'held' && clock() - me.took > 1.5) {
          // The server would not let us have it (it was not where we are, or our hand was full).
          const k = handOf(id); if (k >= 0) { drop(k, [0, 0, 0], true); sfx('refuse'); }
          continue;
        }
        if (t.at === 'hand' && me.state === 'loose' && clock() - me.drop > 2) {
          // The server has it in our hand and we do not (the page was reloaded): it is put down here.
          g.getWorldPosition(a); const pl = phys?.pose(id)?.place || 'hall', pp = pl === 'hall' ? a.sub(ORIGIN) : a;
          send({ drop: id, x: pp.x, z: pp.z }); me.drop = clock();
          continue;
        }
        if (t.at === 'loose' && me.state === 'loose' && changed && clock() - me.drop > 2.5) {
          // Moved by someone else's word (a new mission, a restock): put it there, unless it is already there.
          const pose = phys?.pose(id), inside = pose?.place === 'hall';
          const rep = me.report, ours = rep && rep.inside === !!t.inside && Math.hypot(rep.x - t.x, rep.z - t.z) < 0.05;
          if (!ours && (!pose || inside !== !!t.inside || Math.hypot(pose.x - t.x, pose.z - t.z) > 0.05)) lay(id, t.inside ? 'hall' : 'surface', t.x, t.y, t.z);
        }
      }
      held.forEach((h, i) => { // you cannot work what is already fixed
        if (h?.kind === 'plug' && !plugLoose(h.i)) { F.plugs[h.i].userData.held = false; held[i] = null; }
        if (h?.kind === 'wheel' && s.scene?.wheel !== 1) { F.wheel.userData.held = false; held[i] = null; }
        if (h?.kind === 'cord' && T.gen.state === 'gone') held[i] = null;
      });
      if (selectedPlug >= 0 && !plugLoose(selectedPlug)) selectedPlug = -1;
    },

    // Every frame. hands: [{ obj, point, side, tracked }] for the two hands (obj is where a held tool is
    // drawn, point is where the fingers are, tracked means bare hands, not controllers); empty on a laptop.
    update(dt, now, hands, vr) {
      camera.getWorldPosition(headXZ);
      const place = placeNow();
      handObj[0] = hands[0]?.obj || null; handObj[1] = hands[1]?.obj || null;
      sides[0] = hands[0]?.side || sides[0]; sides[1] = hands[1]?.side || sides[1];
      // Tools held in a headset move to the laptop's hands, on the same side, when the headset comes off.
      if (!vr) for (const i of [0, 1]) if (isTool(held[i])) { const k = slotOf(i) ? DESK : DESK_L, to = held[k] ? (k === DESK ? DESK_L : DESK) : k; held[to] = held[i]; held[i] = null; held[to].grip = null; }

      // Held tools: placed in the rig's frame (so they come with you through an airlock), the light ones
      // in the hand, the heavy ones swinging after it. Their bodies follow, pushing loose things about.
      held.forEach((h, i) => { if (isTool(h)) follow(h.id, dt, i); });
      if (phys) {
        phys.moveHands(place, vr ? hands.map(hd => { const p = hd.point.clone(); if (place === 'hall') p.sub(ORIGIN); return p; }) : [], dt);
        phys.step(dt, place);
        // Loose tools where the astronaut is take their pose from the physics.
        for (const id in tools) {
          if (T[id].state !== 'loose') continue;
          const p = phys.pose(id); if (!p || p.place !== place || p.asleep) continue;
          const g = tools[id];
          if (g.parent !== container(p.place)) container(p.place).add(g);
          g.position.set(p.x, p.y, p.z); g.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
        }
      }
      // Dust puffs settle slowly in lunar gravity.
      for (const d of dust) {
        if (!d.visible) continue;
        const age = clock() - d.userData.born;
        if (age > 1.6) { d.visible = false; continue; }
        d.scale.setScalar(d.userData.size * (1 + age * 1.4)); d.position.y += dt * 0.05;
        d.material.opacity = 0.32 * (1 - age / 1.6);
      }
      const welder = tools.welder.userData;
      let welding = false;

      // What each hand is doing with what it holds.
      hands.forEach((hand, i) => {
        const h = held[i], p = hand.point;
        if (!h) return;
        if (h.kind === 'cord') {
          // The cord comes out with the hand, buzzing harder the further it is pulled.
          const out = p.distanceTo(h.start);
          cord.visible = true;
          worldPos(tools.gen, c);
          cord.geometry.attributes.position.setXYZ(0, c.x, c.y + 0.08, c.z);
          cord.geometry.attributes.position.setXYZ(1, p.x, p.y, p.z);
          cord.geometry.attributes.position.needsUpdate = true;
          once('cordBuzz' + i, () => pulse(i, Math.min(1, 0.2 + out / CORD_PULL * 0.6), 40), 0.08);
          if (out > CORD_PULL) { pullCord(); pulse(i, 1, 200); held[i] = null; }
        } else if (h.kind === 'plug') {
          const plug = F.plugs[h.i];
          F.board.worldToLocal(plug.position.copy(p));
          plug.rotation.set(0, 0, 0); // pointing at the board, ready to go in
          // The nearest socket lights up as the plug comes close: white if it is free, red if it is full.
          let j = -1, best = 0.3;
          F.sockets.forEach((sk, n) => { const d = sk.distanceTo(plug.position); if (d < best) { best = d; j = n; } });
          const full = j >= 0 && st.scene.board.some(x => x.seated && x.socket === j);
          socketRing.visible = j >= 0;
          if (j >= 0) { socketRing.position.copy(F.sockets[j]).setZ(0.09); socketRing.material.color.setHex(full ? PAL.hex.red : PAL.hex.white); }
          // One try per push: after a spark the plug drops, and the hand has to come back for it.
          if (j >= 0 && !full && best < SOCKET_SNAP && clock() >= plugCooldown) {
            plugCooldown = clock() + 0.6;
            tryPlug(h.i, j); pulse(i, 1, 80);
            plug.userData.held = false; held[i] = null;
          }
        } else if (h.kind === 'wheel') {
          world.rover.worldToLocal(F.wheel.position.copy(p));
          const out = p.distanceTo(h.start);
          once('wheelBuzz' + i, () => pulse(i, Math.min(1, 0.3 + out / WHEEL_PULL * 0.5), 40), 0.08); // it resists
          if (out > WHEEL_PULL) { pullWheel(); pulse(i, 1, 200); F.wheel.userData.held = false; held[i] = null; }
        } else if (h.kind === 'tool') {
          const g = tools[h.id];
          g.updateWorldMatrix(true, false);
          const tip = g.localToWorld(b.copy(g.userData.tip));
          if (h.id === 'brush' && st.scene?.dust) {
            F.dustCells.forEach((cell, n) => {
              if (!st.scene.dust[n]) return;
              cell.worldToLocal(c.copy(tip));
              const { width, height } = cell.geometry.parameters;
              if (Math.abs(c.x) < width / 2 + 0.05 && Math.abs(c.y) < height / 2 + 0.05 && Math.abs(c.z) < 0.2 && brushCell(n)) pulse(i, 0.5, 35);
            });
          }
          if (h.id === 'welder' && st.scene?.hull) {
            // The torch lights by itself when the tip is on the crack. Stay on a point until it beads.
            weldHits.forEach((m, n) => {
              if (st.scene.hull.welded[n]) { m.userData.dwell = 0; return; }
              if (tip.distanceTo(F.crackPts[n]) < WELD_RANGE) {
                welding = true;
                m.userData.dwell = (m.userData.dwell || 0) + dt;
                if (m.userData.dwell >= WELD_DWELL && weldPoint(n)) pulse(i, 1, 120); // it beads
              } else m.userData.dwell = Math.max(0, (m.userData.dwell || 0) - dt * 2);
            });
            if (welding) once('weldBuzz' + i, () => pulse(i, 0.35, 60), 0.07);
          }
          if (h.id === 'patch' && st.suit && spot.visible && tip.distanceTo(worldPos(spot, c)) < PATCH_RANGE && patchSuit()) pulse(i, 1, 120);
          // The tire goes on when its centre, out in front of the hand, meets the bare hub.
          if (h.id === 'tire' && st.scene?.wheel === 2 && worldPos(g, a).distanceTo(worldPos(F.hub, c)) < TIRE_FIT && fitTire()) pulse(i, 1, 200);
        }
      });
      welder.spark.visible = welding;
      if (welding) { welder.spark.scale.setScalar(0.8 + Math.random() * 1.6); once('weldSfx', () => sfx('weld'), 0.12); }
      // Each point of the crack glows as it heats, so you can see how long to stay on it (world.js draws it).
      F.crack.userData.heat = weldHits.map(m => Math.min(1, (m.userData.dwell || 0) / WELD_DWELL));
      if (!held.some(h => h?.kind === 'cord')) cord.visible = false;
      if (!held.some(h => h?.kind === 'plug')) socketRing.visible = false;

      // Gloves on controllers, and a ring on whatever each empty hand could grab. A light tick as the ring lands on something.
      hands.forEach((hand, i) => {
        const glove = gloves[i];
        if (glove.parent !== hand.obj) hand.obj.add(glove);
        glove.visible = !hand.tracked && !!hand.side;
        glove.userData.left.visible = hand.side !== 'right'; glove.userData.right.visible = hand.side === 'right';
        const what = held[i] ? null : nearest(hand.point, i);
        const ring = rings[i], name = what ? what.kind + (what.id || what.i || '') : null;
        ring.visible = !!what;
        if (what) {
          const obj = what.kind === 'plug' ? F.plugs[what.i] : what.kind === 'wheel' ? F.wheel : what.kind === 'cord' ? tools.gen.userData.handle : tools[what.id];
          worldPos(obj, ring.position);
          const big = what.kind === 'wheel' || BIG(what.id);
          ring.scale.setScalar((big ? 0.3 : what.kind === 'plug' || what.kind === 'cord' ? 0.09 : 0.14) * (0.94 + Math.sin(now * 8) * 0.06));
          ring.quaternion.copy(camera.getWorldQuaternion(q4));
          // Red if the other hand already has a tool: one at a time.
          ring.material.color.setHex(PAL.hex.green); // an empty hand can always take what its ring is on
        }
        if (name !== hover[i]) { hover[i] = name; if (name) pulse(i, 0.25, 20); }
      });
      for (let i = hands.length; i < 2; i++) rings[i].visible = gloves[i].visible = false;

      // Crack hit targets follow the crack to its current spot.
      weldHits.forEach((m, n) => m.position.copy(F.crackPts[n]));

      // A plug chosen by pointing swells until you point at a socket.
      F.plugs.forEach((plug, n) => plug.scale.setScalar(n === selectedPlug ? 1.5 : 1));

      // The suit-leak spot sits on the forearm of the hand that is not holding the patch kit.
      // On a laptop it sits low in the view and F patches it.
      const beat = 0.9 + Math.sin(now * 9) * 0.35;
      spot.visible = st.suit;
      if (st.suit) {
        const patchHand = handOf('patch');
        const arm = vr ? hands.find((h, n) => n !== patchHand && (patchHand >= 0 || h.side === 'left')) || hands.find((_, n) => n !== patchHand) : null;
        const parent = arm ? arm.obj : camera;
        if (spot.parent !== parent) parent.add(spot);
        // On the cuff of the glove (which runs down and back from a controller), or the back of a bare wrist.
        if (arm) spot.position.set(0, arm.tracked ? 0.025 : -0.03, arm.tracked ? 0.07 : 0.125); else spot.position.set(-0.22, -0.2, -0.5);
        spot.scale.setScalar(beat);
        // The leaking arm throbs, so you look at it.
        if (arm) once('leakBuzz', () => pulse(hands.indexOf(arm), 0.6, 120), 1.1);
      }

      // Tool outlines over fixtures that need a tool you are not carrying.
      const show = (type, on, pos) => {
        const s = hints[type];
        s.visible = on && !need(type) && Math.hypot(pos.x - headXZ.x, pos.z - headXZ.z) < 3;
        if (s.visible) s.position.set(pos.x, pos.y + Math.sin(now * 2) * 0.03, pos.z);
      };
      if (st.scene) {
        const near = F.dustCells.reduce((best, cell, n) => {
          if (n % 6 !== 1) return best; // the top middle cell of each panel
          const d = worldPos(cell, c).distanceTo(headXZ);
          return d < best.d ? { d, p: c.clone() } : best;
        }, { d: Infinity, p: null });
        show('dust', !!st.scene.dust && !!near.p, near.p ? near.p.setY(2.35) : a);
        show('hull', !!st.scene.hull, a.copy(F.crack.userData.centre).addScaledVector(F.crack.userData.normal, 0.25).setY(2.1));
        show('wheel', st.scene.wheel > 0, worldPos(F.hub, a).setY(1.5));
      } else for (const k in hints) hints[k].visible = false;
    },
  };
  return api;
}
