// The astronaut's hands: the tools, and every repair.
//
// There are two ways to do each thing, and both end in the same message to the server:
//   - physical (VR): hold the trigger (or the grip) on a tool to take it in that hand, bring it to the
//     work and let go to drop it, or throw it. Sweep the brush over the dust, hold the welder on the
//     crack, push a plug into a socket, pull the wheel off its hub.
//   - pointing (mouse, or a VR trigger at arm's length): click the thing. This is the fallback
//     that lets the game be tested, and played, without a headset.
// A tool is on the rack where it first hangs, in a hand, or on the ground where it came to rest. There is
// no belt. docs/design/hands-and-avatar.md has the design.
// The server decides what counted (server/game.js). Nothing here changes the game by itself.
import { CFG, FAULTS } from '/shared/config.js';
import { drawTool } from '/shared/icons.js';
import { PAL } from '/shared/palette.js';
import { loadGlove } from '/shared/assets.js';
import { buildTools, layDown, REST, RADIUS } from '/tools.js';

// Everything here is a guess until it has been tried on a head: tune these first.
const GRAB = 0.3;           // metres: how close a hand must be to grab a tool on the rack or the ground
const GRAB_BIG = 0.5;       // ... the tire and the generator
const GRAB_PLUG = 0.18;     // ... a loose cable plug
const GRAB_CORD = 0.16;     // ... the generator's pull-cord handle, once it is set down
const SOCKET_SNAP = 0.11;   // metres: a held plug this close to a socket goes in (sockets are 0.25 apart)
const WHEEL_PULL = 0.3;     // metres the broken wheel must be pulled before it comes off
const CORD_PULL = 0.4;      // metres of generator cord
const TIRE_FIT = 0.25;      // metres from the tire's centre to the bare hub
const PATCH_RANGE = 0.13;   // metres from the patch to the leak
const THROW_WINDOW = 0.1;   // seconds of hand movement a throw takes its speed from
const CONFIRM = 1.5;        // seconds a tool just taken stays in the hand before the server has said so
// How each tool hangs on the rack, so you see its side and not its end: [x, y] rotation in radians.
const RACK_TURN = { brush: [Math.PI / 2, 0], welder: [0, Math.PI / 2], tire: [0, Math.PI / 2] };
const RACK_SCALE = { brush: 1.3, patch: 1.3 }; // the welder is the life-size NASA tool
const WELD_DWELL = 0.4;     // seconds the tip must stay on one point of the crack
const WELD_RANGE = 0.12;    // metres from the tip to that point
// Where a held tool sits in the hand. The tire is carried by its rim, so the wheel is out in front.
const IN_HAND = { tire: { z: -0.36, scale: 0.8 } };
// On a laptop there are no hands to see: a held tool is drawn low in the view, left or right.
const DESK_HOLD = [[-0.24, -0.22, -0.5], [0.24, -0.22, -0.5]];
const DESK_SCALE = { tire: 0.4, gen: 0.45 };
const BIG = id => id === 'tire' || id === 'gen';

// floor(x, z): the ground under a point, { x, z, y, in }, with x and z kept inside the hall's walls or
// out of the habitat and inside the play area. place(): 'out' or 'in', where the astronaut is now.
export function buildFixtures(THREE, world, { rig, camera, send, sfx = () => {}, pulse = () => {}, floor = (x, z) => ({ x, z, y: 0, in: false }), place = () => 'out' }) {
  const F = world.fixtures;
  const V = () => new THREE.Vector3();
  const a = V(), b = V(), c = V(), q4 = new THREE.Quaternion();
  const EMPTY = { hands: [null, null], ground: {}, locker: [], scene: null, suit: false };
  let st = EMPTY;
  const sceneRoot = world.rover.parent;
  const clock = () => performance.now() / 1000; // not the frame time: a click can land between two slow frames
  const hits = [];           // every mesh that can be pointed at
  const held = [null, null]; // what each hand has hold of (by controller in a headset; [left, right] on a laptop)
  const sides = ['', ''];    // which side each controller is on, as of the last frame
  const trail = [[], []];    // the last few positions of each hand, for the speed of a throw
  const flights = new Map(); // tool id -> a thrown tool in the air: { pos, vel, quat, spin, t, down }
  const rest = {};           // tool id -> where it came to rest here, until the server says so too
  const sent = new Map();    // repairs already reported, so one sweep does not send a cell fifty times
  const once = (key, fn, every = 1) => { const t = clock(); if ((sent.get(key) || -9) + every > t) return false; sent.set(key, t); fn(); return true; };
  let refusedAt = -9, refused = '', selectedPlug = -1, plugCooldown = 0;

  const ghost = new THREE.MeshBasicMaterial({ visible: false }); // never drawn, but the raycaster still finds it
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; };
  // A mesh you can point at. `hold` means it keeps working while the trigger or mouse stays down.
  const target = (mesh, enabled, click, hold = false) => { Object.assign(mesh.userData, { enabled, click, hold }); hits.push(mesh); return mesh; };

  // ---------- the five tools (client/tools.js) ----------
  const tools = buildTools(THREE);
  const ghostEdge = new THREE.LineBasicMaterial({ color: PAL.hex.inkDim }); // a painted silhouette on the rack, like a shadow board
  for (const id in tools) {
    const g = tools[id], [w, h, d, z] = g.userData.hit;
    // One invisible box per tool to point at: on the rack or the ground it takes the tool; the generator,
    // once it is set down, is pulled instead.
    const box = add(g, new THREE.BoxGeometry(w, h, d), ghost, 0, 0, z);
    target(box, () => (onRack(id) || onGround(id)) && holder(id) < 0, () => {
      if (onRack(id)) take(id, pending ?? -1); else if (id === 'gen') pullCord(); else pick(id, pending ?? -1);
    });
    // Its outline on the rack, once it has been taken: where it hung.
    const slot = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ghostEdge);
    slot.position.copy(F.lockerSlots[id]);
    slot.geometry.translate(0, 0, z); // the box is centred on the tool, not on its grip
    slot.rotation.set(...(RACK_TURN[id] || [0, 0]), 0); slot.scale.setScalar(RACK_SCALE[id] || 1);
    F.locker.add(slot);
    g.userData.slot = slot;
  }
  const onRack = id => st.locker.includes(id);
  const onGround = id => !!st.ground[id] || flights.has(id) || !!rest[id];
  const holder = id => held.findIndex(h => h?.kind === 'tool' && h.id === id);
  // The server's hand for one of ours: [left, right]. On a laptop held[] is already in that order.
  const slotOf = i => vrNow ? (sides[i] === 'left' ? 0 : 1) : i;
  let vrNow = false, pending = null; // pending: the hand a pointing click is for (see click below)
  // A free hand: the one asked for if it is empty, else (on a laptop) the right, then the left. -1 if none.
  const freeHand = i => i >= 0 ? (held[i] ? -1 : i) : !held[1] ? 1 : !held[0] ? 0 : -1;
  function refuse(id, hand) {
    refusedAt = clock(); refused = id; sfx('refuse');
    if (hand >= 0) { pulse(hand, 1, 90); setTimeout(() => pulse(hand, 1, 90), 160); }
  }

  // Take a tool off the rack, or up off the ground, into a hand (-1: whichever is free). Both hands full:
  // it stays where it is, shakes, and buzzes. Returns whether it came.
  function take(id, hand = -1) {
    if (!onRack(id) || holder(id) >= 0) return false;
    const i = freeHand(hand);
    if (i < 0) { refuse(id, hand); return false; }
    held[i] = { kind: 'tool', id, since: clock() };
    sfx('click');
    send({ take: id, hand: slotOf(i) });
    return true;
  }
  function pick(id, hand = -1) {
    if (!onGround(id) || holder(id) >= 0) return false;
    const i = freeHand(hand);
    if (i < 0) { refuse(id, hand); return false; }
    flights.delete(id); delete rest[id]; // caught in the air, or picked up where it lay
    held[i] = { kind: 'tool', id, since: clock() };
    sfx('click');
    send({ pick: id, hand: slotOf(i) });
    return true;
  }
  // The generator works once it is set down: pull its cord.
  function pullCord() { if (st.ground.gen && !flights.has('gen')) once('gen', () => send({ gen: true }), 2); }
  const has = id => st.hands.includes(id);
  const need = type => { const t = FAULTS[type].tool; return !t || has(t); };

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
  const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: PAL.hex.red }));
  cord.name = 'Cord_Pull';
  cord.frustumCulled = false; cord.visible = false;
  world.rover.parent.add(cord);
  // A ring on the socket a held plug is about to go into.
  const socketRing = add(F.board, new THREE.TorusGeometry(0.07, 0.008, 6, 20), new THREE.MeshBasicMaterial({ color: PAL.hex.white, toneMapped: false }));
  socketRing.visible = false;

  // ---------- helpers for the physical path ----------
  const worldPos = (obj, out) => obj.getWorldPosition(out);
  const headXZ = V();
  const cordAt = out => tools.gen.localToWorld(out.set(0.12, 0.2, 0)); // the pull-cord handle

  // What could this hand grab right now? Each thing has its own reach; the one the hand is deepest
  // inside the reach of wins.
  function nearest(p) {
    let best = null, bestD = Infinity;
    const offer = (d, limit, what) => { if (d < limit && d / limit < bestD) { bestD = d / limit; best = what; } };
    for (const id in tools) {
      if (holder(id) >= 0 || !tools[id].visible) continue;
      const reach = BIG(id) ? GRAB_BIG : GRAB, d = worldPos(tools[id], b).distanceTo(p);
      if (onRack(id)) offer(d, reach, { kind: 'rack', id });
      else if (onGround(id)) {
        offer(d, reach, { kind: 'ground', id });
        // Set down, the generator also offers its cord: the handle wins when the hand is right on it.
        if (id === 'gen' && !flights.has('gen')) offer(cordAt(c).distanceTo(p), GRAB_CORD, { kind: 'cord', start: p.clone() });
      }
    }
    F.plugs.forEach((plug, i) => { if (plugLoose(i) && !plug.userData.held) offer(worldPos(plug, b).distanceTo(p), GRAB_PLUG, { kind: 'plug', i }); });
    if (st.scene?.wheel === 1) offer(worldPos(F.wheel, b).distanceTo(p), 0.5, { kind: 'wheel', start: p.clone() });
    return best;
  }

  // ---------- throwing: a tool let go keeps the hand's speed, and falls in lunar gravity ----------
  const T = CFG.throw;
  // How fast hand i has been moving, from where it was THROW_WINDOW ago to where it is now.
  function handSpeed(i, out) {
    const tr = trail[i];
    out.set(0, 0, 0);
    if (tr.length < 2) return out;
    const last = tr[tr.length - 1];
    const first = tr.find(e => last.t - e.t <= THROW_WINDOW + 1e-3) || tr[0];
    const span = last.t - first.t;
    if (span > 1e-3) out.subVectors(last.p, first.p).divideScalar(span);
    if (out.length() > T.maxSpeed) out.setLength(T.maxSpeed);
    return out;
  }
  // Let tool `id` go at its current place in the world, moving at `vel`.
  function launch(id, vel) {
    const g = tools[id];
    g.updateWorldMatrix(true, false);
    const pos = V(), quat = new THREE.Quaternion();
    g.matrixWorld.decompose(pos, quat, a);
    // It tumbles a little, more the harder it was thrown, about an axis across the throw.
    const spin = V().crossVectors(vel, b.set(0, 1, 0));
    if (spin.lengthSq() < 1e-6) spin.set(1, 0, 0);
    spin.setLength(Math.min(9, 1.5 + vel.length() * 1.2));
    flights.set(id, { pos, vel: vel.clone(), quat, spin, t: 0, down: false, in: place() === 'in' });
    delete rest[id];
    const there = floor(pos.x, pos.z);
    send({ drop: id, x: pos.x, y: Math.max(there.y, pos.y), z: pos.z, in: there.in });
    sfx(vel.length() > 1.5 ? 'toss' : 'click');
  }
  // A puff of regolith where something lands (the Moon has no air to hold it up, so it falls straight back).
  const puffTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, PAL.regolith); grd.addColorStop(1, 'rgba(168,163,151,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const puffs = [0, 1, 2, 3].map(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.name = 'Dust_Puff'; s.visible = false; sceneRoot.add(s); return s;
  });
  let puffNext = 0;
  function puff(p, size) {
    if (place() === 'in') return; // the hall floor is swept
    const s = puffs[puffNext++ % puffs.length];
    s.position.copy(p); s.userData = { born: clock(), size }; s.visible = true;
  }
  const qRest = new THREE.Quaternion(), qSpin = new THREE.Quaternion(), eul = new THREE.Euler();
  // Move every tool in the air on by dt: gravity, a bounce off the ground, a slide, then at rest.
  function fly(dt) {
    for (const [id, f] of flights) {
      f.t += dt;
      const r = REST[id];
      for (let n = 0, steps = Math.ceil(dt / 0.011); n < steps; n++) {
        const h = dt / steps;
        f.vel.y -= T.gravity * h;
        f.pos.addScaledVector(f.vel, h);
        // Walls: the hall's, the habitat's, the edge of the play area. It stops dead against them.
        const g = floor(f.pos.x, f.pos.z);
        if (Math.abs(g.x - f.pos.x) + Math.abs(g.z - f.pos.z) > 1e-4) { f.pos.x = g.x; f.pos.z = g.z; f.vel.x *= -0.2; f.vel.z *= -0.2; }
        const lowest = g.y + r.y;
        if (f.pos.y <= lowest) {
          f.pos.y = lowest;
          if (f.vel.y < -0.6) { // a bounce: a thud, a puff, and it loses most of its speed
            const hard = -f.vel.y;
            f.vel.y = hard * T.bounce; f.vel.x *= 0.6; f.vel.z *= 0.6; f.spin.multiplyScalar(0.5);
            sfx('thud'); puff(b.copy(f.pos).setY(g.y + 0.05), Math.min(0.5, 0.15 + hard * 0.08));
          } else { f.vel.y = 0; f.down = true; }
        } else f.down = false;
        if (f.down) { // sliding to a stop, and settling onto its side
          const k = Math.exp(-T.slide * h);
          f.vel.x *= k; f.vel.z *= k; f.spin.multiplyScalar(Math.exp(-12 * h));
          eul.setFromQuaternion(f.quat, 'YXZ');
          qRest.setFromEuler(eul.set(r.turn[0], eul.y, r.turn[1], 'YXZ'));
          f.quat.slerp(qRest, Math.min(1, h * 10));
        } else if (f.spin.lengthSq() > 1e-6) {
          qSpin.setFromAxisAngle(a.copy(f.spin).normalize(), f.spin.length() * h);
          f.quat.premultiply(qSpin);
        }
      }
      const still = f.down && Math.hypot(f.vel.x, f.vel.z) < T.settle;
      if (still || f.t > T.maxSeconds) {
        const g = floor(f.pos.x, f.pos.z);
        eul.setFromQuaternion(f.quat, 'YXZ');
        const spot = { x: g.x, y: g.y + r.y, z: g.z, ry: eul.y, in: g.in };
        rest[id] = { ...spot, states: 0 };
        flights.delete(id);
        sfx('thud'); puff(b.set(g.x, g.y + 0.05, g.z), BIG(id) ? 0.5 : 0.25);
        send({ drop: id, ...spot });
      }
    }
    for (const s of puffs) {
      if (!s.visible) continue;
      const u = (clock() - s.userData.born) / 0.8;
      if (u >= 1) { s.visible = false; continue; }
      s.scale.setScalar(s.userData.size * (0.6 + u)); s.material.opacity = 0.45 * (1 - u);
      s.position.y -= 0.002;
    }
  }
  // Let go of what hand i holds with a push: a laptop's toss, a metre or two ahead.
  const tossVel = V();
  function toss(i) {
    const h = held[i];
    if (h?.kind !== 'tool') return false;
    held[i] = null;
    camera.getWorldDirection(tossVel).setY(0).normalize().multiplyScalar(1.0).setY(0.8);
    launch(h.id, tossVel);
    return true;
  }

  const api = {
    tools, rings, gloves, spot, flights,
    get refusedAt() { return refusedAt; },
    // Meshes that can be pointed at right now.
    targets: () => hits.filter(m => m.userData.enabled()),
    // Click what is pointed at. In a headset, `hand` is the controller doing the pointing, so a tool
    // taken that way goes into that hand.
    click(mesh, hand = null) { pending = hand; try { mesh.userData.click(); } finally { pending = null; } },

    // Desktop keys for the things you cannot point at.
    patchSuit, pullCord,
    // Q on a laptop: toss what is in the right hand, else the left. True if something went.
    drop: () => toss(1) || toss(0),
    dropTool: id => { const i = holder(id); return i >= 0 && toss(i); },

    // Where a tool is, as this page draws it: 'rack', 'hand:left', 'hand:right', 'flying', 'ground' or 'nowhere'.
    where(id) {
      const i = holder(id);
      if (i >= 0) return 'hand:' + (vrNow ? sides[i] || 'right' : i === 0 ? 'left' : 'right');
      return flights.has(id) ? 'flying' : onRack(id) ? 'rack' : onGround(id) ? 'ground' : 'nowhere';
    },

    // A hand closed (the trigger or the grip on a controller, a pinch with bare hands) at world point p.
    // True if it got something.
    grab(i, p) {
      if (held[i]) return true;
      const what = nearest(p);
      if (!what) return false;
      if (what.kind === 'rack' || what.kind === 'ground') {
        if ((what.kind === 'rack' ? take : pick)(what.id, i)) pulse(i, 0.7, 50);
        return true;
      }
      held[i] = what;
      if (what.kind === 'plug') { F.plugs[what.i].userData.held = true; selectedPlug = -1; }
      if (what.kind === 'wheel') F.wheel.userData.held = true;
      sfx('click');
      pulse(i, 0.7, 50);
      return true;
    },
    // The hand opened. A tool goes with the hand's speed: dropped if the hand was still, thrown if not.
    release(i, p) {
      const h = held[i];
      held[i] = null;
      if (!h) return;
      if (h.kind === 'tool') launch(h.id, handSpeed(i, c));
      if (h.kind === 'plug') F.plugs[h.i].userData.held = false;
      if (h.kind === 'wheel') F.wheel.userData.held = false;
    },
    holding: i => held[i],

    // The server's latest word on what exists.
    sync(s) {
      st = s.hands ? s : EMPTY;
      held.forEach((h, i) => { // you cannot hold what is no longer in your hand, or work what is already fixed
        // (a tool just taken is given a moment for the server to say so)
        // Once the server has said a tool is in the hand, the moment it stops saying so (the tire fitted,
        // the generator spent) it is gone.
        if (h?.kind === 'tool') {
          if (st.hands.includes(h.id)) h.confirmed = true;
          else if (h.confirmed || clock() - h.since > CONFIRM) held[i] = null;
        }
        if (h?.kind === 'plug' && !plugLoose(h.i)) { F.plugs[h.i].userData.held = false; held[i] = null; }
        if (h?.kind === 'wheel' && st.scene?.wheel !== 1) { F.wheel.userData.held = false; held[i] = null; }
        if (h?.kind === 'cord' && !st.ground.gen) held[i] = null;
      });
      // The server has a tool where it came to rest: our own note of it is no longer needed.
      // A few updates after it landed the server's word wins anyway: it may have been moved, or never been ours to drop.
      for (const id in rest) {
        const there = st.ground[id];
        if (there && Math.hypot(there.x - rest[id].x, there.z - rest[id].z) < 1e-3 || ++rest[id].states > 3) delete rest[id];
      }
      if (selectedPlug >= 0 && !plugLoose(selectedPlug)) selectedPlug = -1;
    },

    // Every frame. hands: [{ obj, point, side, tracked }] for the two hands (obj is where a held tool is
    // drawn, point is where the fingers are, tracked means bare hands, not controllers); empty on a laptop.
    update(dt, now, hands, vr) {
      vrNow = vr && hands.length > 0;
      camera.getWorldPosition(headXZ);
      hands.forEach((hand, i) => {
        sides[i] = hand.side;
        const tr = trail[i];
        tr.push({ t: now, p: hand.point.clone() });
        while (tr.length > 2 && now - tr[1].t > THROW_WINDOW) tr.shift();
      });
      fly(dt);

      // Put each tool where it is: on the rack, in a hand, in the air, or lying on the ground.
      const here = place() === 'in';
      for (const id in tools) {
        const g = tools[id], hand = holder(id), f = flights.get(id);
        const lie = !f && hand < 0 && !onRack(id) ? rest[id] || st.ground[id] : null;
        const rack = onRack(id) && hand < 0 && !f;
        g.visible = rack || hand >= 0 || !!f || (!!lie && !!lie.in === here);
        g.userData.slot.visible = !rack;
        if (!g.visible) { if (g.parent) g.parent.remove(g); continue; }
        const parent = rack ? F.locker : hand >= 0 ? (vrNow ? hands[hand].obj : camera) : sceneRoot;
        if (g.parent !== parent) parent.add(g);
        if (rack) {
          g.position.copy(F.lockerSlots[id]); g.rotation.set(...(RACK_TURN[id] || [0, 0]), 0); g.scale.setScalar(RACK_SCALE[id] || 1);
          // Both hands full: it shakes its head.
          if (refused === id && clock() - refusedAt < 0.45) g.position.x += Math.sin((clock() - refusedAt) * 50) * 0.02;
        } else if (hand >= 0 && vrNow) { const o = IN_HAND[id] || {}; g.position.set(0, 0, o.z || 0); g.rotation.set(0, 0, 0); g.scale.setScalar(o.scale || 1); }
        else if (hand >= 0) { g.position.set(...DESK_HOLD[hand]); g.rotation.set(0.3, hand === 0 ? 0.25 : -0.25, 0); g.scale.setScalar(DESK_SCALE[id] || 0.7); }
        else if (f) { g.position.copy(f.pos); g.quaternion.copy(f.quat); g.scale.setScalar(1); }
        else layDown(THREE, g, id, lie);
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
          cordAt(c);
          cord.geometry.attributes.position.setXYZ(0, c.x, c.y, c.z);
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
        const what = held[i] ? null : nearest(hand.point);
        const ring = rings[i], name = what ? what.kind + (what.id || what.i || '') : null;
        ring.visible = !!what;
        if (what) {
          const obj = what.kind === 'plug' ? F.plugs[what.i] : what.kind === 'wheel' ? F.wheel : tools[what.id || 'gen'];
          if (what.kind === 'cord') cordAt(ring.position); else worldPos(obj, ring.position);
          const size = what.kind === 'wheel' ? 0.3 : what.kind === 'plug' ? 0.09 : what.kind === 'cord' ? 0.08 : Math.max(0.14, RADIUS[what.id] * 0.9);
          ring.scale.setScalar(size * (0.94 + Math.sin(now * 8) * 0.06));
          ring.quaternion.copy(camera.getWorldQuaternion(q4));
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
        const patchHand = held.findIndex(h => h?.kind === 'tool' && h.id === 'patch');
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
