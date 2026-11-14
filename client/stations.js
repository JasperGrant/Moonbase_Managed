// The astronaut's hands: the tools, the belt, and every repair.
//
// There are two ways to do each thing, and both end in the same message to the server:
//   - physical (VR): grab a tool off the belt and bring it to the work. Sweep the brush over the
//     dust, hold the welder on the crack, push a plug into a socket, pull the wheel off its hub.
//   - pointing (mouse, or a VR trigger at arm's length): click the thing. This is the fallback
//     that lets the game be tested, and played, without a headset.
// The server decides what counted (server/game.js). Nothing here changes the game by itself.
import { FAULTS } from '/shared/config.js';
import { fits } from '/shared/rules.js';
import { drawTool } from '/shared/icons.js';

const GRAB = 0.24;          // metres: how close a hand must be to grab something
const BELT_R = 0.3;         // metres from the body to a belt slot
const BELT_SLOT = { gen: -1.3, brush: -0.65, patch: 0, welder: 0.65, tire: 1.3 }; // radians round the waist, left to right
const BELT_SCALE = { brush: 0.8, patch: 1, welder: 0.8, tire: 0.36, gen: 0.42 };
const RACK_TURN = { tire: Math.PI / 2 }; // the tire hangs flat against the back of the rack
const WELD_DWELL = 0.4;     // seconds the tip must stay on one point of the crack
const WELD_RANGE = 0.12;

export function buildFixtures(THREE, world, { rig, camera, send, sfx = () => {} }) {
  const F = world.fixtures;
  const V = () => new THREE.Vector3();
  const a = V(), b = V(), c = V();
  let st = { belt: [], locker: [], scene: null, suit: false };
  const clock = () => performance.now() / 1000; // not the frame time: a click can land between two slow frames
  const hits = [];           // every mesh that can be pointed at
  const held = [null, null]; // what each hand has hold of
  const sent = new Map();    // repairs already reported, so one sweep does not send a cell fifty times
  const once = (key, fn, every = 1) => { const t = clock(); if ((sent.get(key) || -9) + every > t) return false; sent.set(key, t); fn(); return true; };
  let refusedAt = -9, selectedPlug = -1, plugCooldown = 0;

  const ghost = new THREE.MeshBasicMaterial({ visible: false }); // never drawn, but the raycaster still finds it
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; };
  // A mesh you can point at. `hold` means it keeps working while the trigger or mouse stays down.
  const target = (mesh, enabled, click, hold = false) => { Object.assign(mesh.userData, { enabled, click, hold }); hits.push(mesh); return mesh; };

  // ---------- the five tools. Each is modelled in the hand: local -z points away from you. ----------
  const tools = {};
  const orange = 0xe8742a, steel = 0x9aa0a8, dark = 0x23272c;
  {
    const g = new THREE.Group();                                   // brush
    add(g, new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), mat(orange), 0, 0, -0.08).rotation.x = Math.PI / 2;
    add(g, new THREE.BoxGeometry(0.2, 0.035, 0.05), mat(dark), 0, 0, -0.22);
    add(g, new THREE.BoxGeometry(0.19, 0.03, 0.07), mat(0xe9dfc4, { roughness: 1 }), 0, 0, -0.28);
    g.userData = { tip: new THREE.Vector3(0, 0, -0.3), hit: [0.26, 0.12, 0.44, -0.12] };
    tools.brush = g;
  }
  {
    const g = new THREE.Group();                                   // patch kit
    add(g, new THREE.BoxGeometry(0.15, 0.15, 0.02), mat(orange), 0, 0, -0.06);
    add(g, new THREE.BoxGeometry(0.1, 0.03, 0.024), mat(0xffffff), 0, 0, -0.06);
    add(g, new THREE.BoxGeometry(0.03, 0.1, 0.024), mat(0xffffff), 0, 0, -0.06);
    g.userData = { tip: new THREE.Vector3(0, 0, -0.07), hit: [0.2, 0.2, 0.12, -0.06] };
    tools.patch = g;
  }
  {
    const g = new THREE.Group();                                   // welder
    add(g, new THREE.BoxGeometry(0.045, 0.14, 0.05), mat(dark), 0, -0.06, 0);
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), mat(orange), 0, 0.02, -0.1).rotation.x = Math.PI / 2;
    add(g, new THREE.ConeGeometry(0.025, 0.08, 10), mat(steel, { metalness: 0.9 }), 0, 0.02, -0.27).rotation.x = -Math.PI / 2;
    const spark = add(g, new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0, toneMapped: false }), 0, 0.02, -0.32);
    spark.visible = false; // no light of its own: every extra light costs the Quest on every pixel
    g.userData = { tip: new THREE.Vector3(0, 0.02, -0.32), hit: [0.12, 0.24, 0.4, -0.12], spark };
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
    add(g, new THREE.BoxGeometry(0.42, 0.3, 0.3), mat(0xd8a62c, { metalness: 0.5 }));
    add(g, new THREE.BoxGeometry(0.46, 0.04, 0.34), mat(dark), 0, -0.17, 0);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), mat(dark), -0.1, 0.18, 0);
    add(g, new THREE.TorusGeometry(0.05, 0.014, 6, 14), mat(0xd23a2a), 0.12, 0.2, 0);
    g.userData = { tip: new THREE.Vector3(0, 0, 0), hit: [0.5, 0.45, 0.4, 0] };
    tools.gen = g;
  }
  const beltGroup = new THREE.Group();
  rig.add(beltGroup);
  const ghostEdge = new THREE.LineBasicMaterial({ color: 0x58e08a });
  for (const id in tools) {
    const g = tools[id], [w, h, d, z] = g.userData.hit;
    g.userData.id = id;
    // One invisible box per tool to point at: on the rack it takes the tool, on the belt it is used by
    // the generator only (pointing at it pulls the cord).
    const box = add(g, new THREE.BoxGeometry(w, h, d), ghost, 0, 0, z);
    target(box, () => st.locker.includes(id) || (id === 'gen' && st.belt.includes('gen')),
      () => { if (st.locker.includes(id)) take(id); else pullCord(); });
    // And an outline in its place on the rack while it is on the belt: point at it to put the tool back.
    const slot = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ghostEdge);
    slot.position.copy(F.lockerSlots[id]); slot.position.z += z;
    slot.rotation.y = RACK_TURN[id] || 0;
    F.locker.add(slot);
    const back = add(F.locker, new THREE.BoxGeometry(w, h, d), ghost, slot.position.x, slot.position.y, slot.position.z);
    back.rotation.y = slot.rotation.y;
    target(back, () => st.belt.includes(id), () => stow(id));
    g.userData.slot = slot;
  }

  function take(id) {
    if (!st.locker.includes(id)) return;
    if (!fits(st.belt, id)) { refusedAt = clock(); sfx('refuse'); return; } // too heavy: it stays on the rack
    sfx('click');
    send({ take: id });
  }
  function stow(id) { sfx('click'); send({ stow: id }); }
  function pullCord() { if (st.belt.includes('gen')) once('gen', () => send({ gen: true }), 2); }
  const need = type => { const t = FAULTS[type].tool; return !t || st.belt.includes(t); };

  // ---------- things to point at on the fixtures themselves ----------
  F.dustCells.forEach((cell, i) => target(cell, () => !!st.scene?.dust?.[i], () => brushCell(i), true));
  function brushCell(i) {
    if (!need('dust') || !st.scene?.dust?.[i]) return;
    once('dust' + i, () => { send({ fix: 'dust', cell: i }); once('brushSfx', () => sfx('brush'), 0.09); });
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
  function fitTire() { if (need('wheel')) once('fit', () => { sfx('click'); send({ fix: 'wheel', fit: true }); }); }

  const weldHits = F.crackPts.map((p, i) => {
    const m = add(world.fixtures.crack, new THREE.SphereGeometry(0.09, 8, 6), ghost);
    return target(m, () => !!st.scene?.hull && !st.scene.hull.welded[i], () => weldPoint(i), true);
  });
  function weldPoint(i) {
    if (!need('hull') || !st.scene?.hull || st.scene.hull.welded[i]) return;
    once('weld' + i, () => { send({ fix: 'hull', point: i }); sfx('weld'); });
  }
  function patchSuit() { if (st.suit && st.belt.includes('patch')) once('patch', () => { sfx('click'); send({ fix: 'suit' }); }); }

  // ---------- the suit leak: a pulsing spot on your forearm ----------
  const spot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false }));
  spot.visible = false;
  const spotHit = add(spot, new THREE.SphereGeometry(0.1, 8, 6), ghost);
  target(spotHit, () => st.suit && spot.visible, () => patchSuit());

  // ---------- "you need this tool": its outline floats over a fixture you walked up to without it ----------
  const hints = {};
  for (const [type, f] of Object.entries(FAULTS)) {
    if (!f.tool || type === 'suit') continue;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(8,12,14,0.8)'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#ffb84a'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 59, 0, 7); g.stroke();
    drawTool(g, f.tool, 64, 64, 84, '#ffb84a');
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
    s.scale.setScalar(0.42); s.visible = false; s.renderOrder = 9;
    world.rover.parent.add(s);
    hints[type] = s;
  }

  // ---------- helpers for the physical path ----------
  const worldPos = (obj, out) => obj.getWorldPosition(out);
  const lockerPos = () => { F.locker.getWorldPosition(a); a.y = 1.2; return a; };
  const atLocker = p => p.distanceTo(lockerPos()) < 1.3;
  const headXZ = V();

  // What could this hand grab right now? Nearest thing wins.
  function nearest(p) {
    let best = null, bestD = Infinity;
    const offer = (d, limit, what) => { if (d < limit && d < bestD) { bestD = d; best = what; } };
    for (const id in tools) {
      const g = tools[id], big = id === 'tire' || id === 'gen';
      if (st.locker.includes(id)) offer(worldPos(g, b).distanceTo(p), big ? 0.5 : GRAB + 0.06, { kind: 'rack', id });
      else if (st.belt.includes(id) && !held.some(h => h?.id === id)) offer(worldPos(g, b).distanceTo(p), GRAB, id === 'gen' ? { kind: 'cord', start: p.clone() } : { kind: 'tool', id });
    }
    F.plugs.forEach((plug, i) => { if (plugLoose(i)) offer(worldPos(plug, b).distanceTo(p), 0.16, { kind: 'plug', i }); });
    if (st.scene?.wheel === 1) offer(worldPos(F.wheel, b).distanceTo(p), 0.5, { kind: 'wheel', start: p.clone() });
    return best;
  }

  const api = {
    tools,
    get refusedAt() { return refusedAt; },
    // Meshes that can be pointed at right now.
    targets: () => hits.filter(m => m.userData.enabled()),
    click(mesh) { mesh.userData.click(); },

    // Desktop keys for the two things you cannot point at.
    patchSuit, pullCord,

    // A hand closed (grip button, or a pinch with bare hands) at world point p. True if it got something.
    grab(i, p) {
      const what = nearest(p);
      if (!what) return false;
      if (what.kind === 'rack') { take(what.id); return true; }
      held[i] = what;
      if (what.kind === 'plug') { F.plugs[what.i].userData.held = true; selectedPlug = -1; }
      if (what.kind === 'wheel') F.wheel.userData.held = true;
      sfx('click');
      return true;
    },
    // The hand opened. A tool let go at the locker goes back on the rack; anywhere else it returns to the belt.
    release(i, p) {
      const h = held[i];
      held[i] = null;
      if (!h) return;
      if (h.kind === 'tool' && atLocker(p)) stow(h.id);
      if (h.kind === 'plug') F.plugs[h.i].userData.held = false;
      if (h.kind === 'wheel') F.wheel.userData.held = false;
    },
    holding: i => held[i],

    // The server's latest word on what exists.
    sync(s) {
      st = s;
      held.forEach((h, i) => { // you cannot hold what is no longer on the belt, or work what is already fixed
        if (h?.kind === 'tool' && !s.belt.includes(h.id)) held[i] = null;
        if (h?.kind === 'plug' && !plugLoose(h.i)) { F.plugs[h.i].userData.held = false; held[i] = null; }
        if (h?.kind === 'wheel' && s.scene?.wheel !== 1) { F.wheel.userData.held = false; held[i] = null; }
        if (h?.kind === 'cord' && !s.belt.includes('gen')) held[i] = null;
      });
      if (selectedPlug >= 0 && !plugLoose(selectedPlug)) selectedPlug = -1;
    },

    // Every frame. hands: [{ obj, point, side }] for the two controllers (obj is where a held tool is
    // drawn, point is where the fingers are); empty on a laptop.
    update(dt, now, hands, vr) {

      // The belt rides at the waist and turns with the body, lazily, so it stays put while you look around.
      camera.getWorldPosition(headXZ);
      rig.worldToLocal(a.copy(headXZ));
      beltGroup.position.set(a.x, Math.max(0.35, a.y - 0.62), a.z);
      const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y;
      let dy = yaw - beltGroup.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      if (Math.abs(dy) > 0.6) beltGroup.rotation.y += dy - Math.sign(dy) * 0.6;

      // Put each tool where it is: on the rack, on the belt, or in a hand.
      for (const id in tools) {
        const g = tools[id];
        const hand = held.findIndex(h => h?.kind === 'tool' && h.id === id);
        const onRack = st.locker.includes(id), onBelt = st.belt.includes(id);
        g.visible = onRack || onBelt;
        g.userData.slot.visible = onBelt;
        if (!g.visible) { if (g.parent) g.parent.remove(g); continue; }
        const parent = onRack ? F.locker : hand >= 0 ? hands[hand].obj : beltGroup;
        if (g.parent !== parent) parent.add(g);
        if (onRack) { g.position.copy(F.lockerSlots[id]); g.rotation.set(0, RACK_TURN[id] || 0, 0); g.scale.setScalar(1); }
        else if (hand >= 0) { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(id === 'tire' ? 0.8 : 1); }
        else {
          const t = BELT_SLOT[id];
          g.position.set(Math.sin(t) * BELT_R, 0, -Math.cos(t) * BELT_R);
          g.rotation.set(id === 'tire' || id === 'gen' ? 0 : -Math.PI / 2, -t, 0);
          g.scale.setScalar(BELT_SCALE[id]);
        }
      }
      const welder = tools.welder.userData;
      let welding = false;

      // What each hand is doing with what it holds.
      hands.forEach((hand, i) => {
        const h = held[i], p = hand.point;
        if (!h) return;
        if (h.kind === 'cord') {
          if (p.distanceTo(h.start) > 0.4) { pullCord(); held[i] = null; }
        } else if (h.kind === 'plug') {
          const plug = F.plugs[h.i];
          F.board.worldToLocal(plug.position.copy(p));
          const j = F.sockets.findIndex(s => s.distanceTo(plug.position) < 0.09);
          // One try per push: after a spark the plug drops, and the hand has to come back for it.
          if (j >= 0 && clock() >= plugCooldown) { plugCooldown = clock() + 0.6; tryPlug(h.i, j); plug.userData.held = false; held[i] = null; }
        } else if (h.kind === 'wheel') {
          world.rover.worldToLocal(F.wheel.position.copy(p));
          if (p.distanceTo(h.start) > 0.3) { pullWheel(); F.wheel.userData.held = false; held[i] = null; }
        } else if (h.kind === 'tool') {
          const g = tools[h.id];
          g.updateWorldMatrix(true, false);
          const tip = g.localToWorld(b.copy(g.userData.tip));
          if (h.id === 'brush' && st.scene?.dust) {
            F.dustCells.forEach((cell, n) => {
              if (!st.scene.dust[n]) return;
              cell.worldToLocal(c.copy(tip));
              const { width, height } = cell.geometry.parameters;
              if (Math.abs(c.x) < width / 2 + 0.05 && Math.abs(c.y) < height / 2 + 0.05 && Math.abs(c.z) < 0.2) brushCell(n);
            });
          }
          if (h.id === 'welder' && st.scene?.hull) {
            // The torch lights by itself when the tip is on the crack. Stay on a point until it beads.
            weldHits.forEach((m, n) => {
              if (st.scene.hull.welded[n]) { m.userData.dwell = 0; return; }
              if (tip.distanceTo(F.crackPts[n]) < WELD_RANGE) {
                welding = true;
                m.userData.dwell = (m.userData.dwell || 0) + dt;
                if (m.userData.dwell >= WELD_DWELL) weldPoint(n);
              } else m.userData.dwell = Math.max(0, (m.userData.dwell || 0) - dt * 2);
            });
          }
          if (h.id === 'patch' && st.suit && spot.visible && tip.distanceTo(worldPos(spot, c)) < 0.13) patchSuit();
          if (h.id === 'tire' && st.scene?.wheel === 2 && p.distanceTo(worldPos(F.hub, c)) < 0.32) fitTire();
        }
      });
      welder.spark.visible = welding;
      if (welding) { welder.spark.scale.setScalar(0.8 + Math.random() * 1.6); once('weldSfx', () => sfx('weld'), 0.12); }

      // Crack hit targets follow the crack to its current spot.
      weldHits.forEach((m, n) => m.position.copy(F.crackPts[n]));

      // A plug chosen by pointing swells until you point at a socket.
      F.plugs.forEach((plug, n) => plug.scale.setScalar(n === selectedPlug ? 1.5 : 1));

      // The suit-leak spot sits on the forearm of the hand that is not holding the patch kit.
      // On a laptop it sits low in the view and F patches it.
      const pulse = 0.8 + Math.sin(now * 9) * 0.3;
      spot.visible = st.suit;
      if (st.suit) {
        const patchHand = held.findIndex(h => h?.kind === 'tool' && h.id === 'patch');
        const arm = vr ? hands.find((h, n) => n !== patchHand && (patchHand >= 0 || h.side === 'left')) || hands.find((_, n) => n !== patchHand) : null;
        const parent = arm ? arm.obj : camera;
        if (spot.parent !== parent) parent.add(spot);
        if (arm) spot.position.set(0, 0.03, 0.14); else spot.position.set(-0.22, -0.2, -0.5);
        spot.scale.setScalar(pulse);
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
