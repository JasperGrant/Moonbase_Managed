// The astronaut as the rover camera (and the landing page) sees them: a figure that walks, swings its
// arms, crouches and reaches where the player's hands are, holding the tools they hold.
//
// The NASA astronaut model is unrigged and in a T-pose (docs/ASSETS.md), so it is cut into rigid parts
// by where each triangle sits (upper arms, forearms, thighs, shins and the rest) and each part hangs
// from a pivot at its joint:
//
//   Root (feet, facing +z)
//   └ Hips
//     ├ Body ── Arm_L ── Forearm_L ── Hand_L      (the figure's left is +x: it faces +z)
//     │      └ Arm_R ── Forearm_R ── Hand_R
//     ├ Leg_L ── Shin_L ── Foot_L               (the boot stays flat on the ground)
//     └ Leg_R ── Shin_R ── Foot_R
//
// Arms reach with two-bone IK toward pose.arms (from the headset), or hang and swing in step when the
// hands are not tracked. Capsules in the same rig stand in until the model loads.
//
//   const av = buildAvatar(THREE, { shadows, ground: (x, z) => y });
//   av.update(dt, { x, z, ry, h, arms }); av.hold(['brush', null], tools);
import { PAL } from '/shared/palette.js';
import { loadPeriod } from '/shared/assets.js';

// Joints in the model's own frame (metres, base at y = 0, facing +z), read off the baked model.
const J = {
  hip: 0.84,                 // height of the hip joints
  hipX: 0.12,                // ... and how far each is off the middle
  knee: 0.46,
  ankle: 0.13,               // the boot is cut off below this, and kept flat
  shoulder: [0.33, 1.41, 0], // the left shoulder (the right is mirrored in x)
  elbow: 0.6,                // x of the elbow
  hand: 0.86,                // x of the middle of the hand
};
const L1 = J.elbow - J.shoulder[0], L2 = J.hand - J.elbow; // upper arm and forearm
const LEG = J.hip;                                          // hip to sole
const THIGH = J.hip - J.knee, CALF = J.knee - J.ankle;
const MAX_KNEE = 1.05;       // radians the thighs come forward at the deepest crouch; the back bends for the rest
const STRIDE = 1.5;          // metres per full walk cycle: a long lunar lope
const STAND_EYE = 1.65;      // the pose's h when standing (client/astronaut.js scales to this)
// Where a held tool sits in the fist. The tire is carried by its rim, so the wheel is out in front.
const IN_HAND = { tire: { z: -0.32, scale: 0.8 } };

export function buildAvatar(THREE, { shadows = false, ground = () => 0 } = {}) {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const group = new THREE.Group(); group.name = 'Astronaut';
  const root = new THREE.Group(); root.name = 'Root'; group.add(root);
  const hips = new THREE.Group(); hips.name = 'Hips'; hips.position.y = J.hip; root.add(hips);
  const body = new THREE.Group(); body.name = 'Body'; hips.add(body);
  const joint = (name, parent, p) => { const g = new THREE.Group(); g.name = name; g.position.copy(p); parent.add(g); return g; };
  const arm = {}, fore = {}, hand = {}, leg = {}, shin = {}, foot = {};
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    arm[s] = joint('Arm_' + s, body, V(k * J.shoulder[0], J.shoulder[1] - J.hip, J.shoulder[2]));
    fore[s] = joint('Forearm_' + s, arm[s], V(k * L1, 0, 0));
    hand[s] = joint('Hand_' + s, fore[s], V(k * L2, 0, 0));
    hand[s].rotation.y = -k * Math.PI / 2; // a held tool's -z runs on down the forearm, out of the fist
    leg[s] = joint('Leg_' + s, hips, V(k * J.hipX, 0, 0.03));
    shin[s] = joint('Shin_' + s, leg[s], V(0, J.knee - J.hip, 0.02));
    foot[s] = joint('Foot_' + s, shin[s], V(0, J.ankle - J.knee, 0));
  }
  // Each part's pivot, in the model's frame, so a cut-out part can be moved onto it.
  const pivots = { Body: V(0, J.hip, 0) };
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    pivots['Arm_' + s] = V(k * J.shoulder[0], J.shoulder[1], J.shoulder[2]);
    pivots['Forearm_' + s] = V(k * J.elbow, J.shoulder[1], J.shoulder[2]);
    pivots['Leg_' + s] = V(k * J.hipX, J.hip, 0.03);
    pivots['Shin_' + s] = V(k * J.hipX, J.knee, 0.05);
    pivots['Foot_' + s] = V(k * J.hipX, J.ankle, 0.05);
  }
  const parts = { Body: body, Arm_L: arm.L, Arm_R: arm.R, Forearm_L: fore.L, Forearm_R: fore.R, Leg_L: leg.L, Leg_R: leg.R, Shin_L: shin.L, Shin_R: shin.R, Foot_L: foot.L, Foot_R: foot.R };

  // ---------- the stand-in: rounded capsules in the same rig, the suit's white cloth ----------
  const suit = new THREE.MeshStandardMaterial({ color: PAL.hex.enamel, roughness: 0.92, metalness: 0 });
  const stand = [];
  const cap = (parent, r, len, from, to) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), suit);
    m.position.copy(from).lerp(to, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize());
    m.castShadow = shadows; parent.add(m); stand.push(m); return m;
  };
  cap(body, 0.24, 0.5, V(0, 0.05, 0), V(0, 0.75, 0));
  { const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), suit); head.position.y = 0.95; head.castShadow = shadows; body.add(head); stand.push(head); }
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    cap(arm[s], 0.08, L1 - 0.1, V(), V(k * L1, 0, 0));
    cap(fore[s], 0.075, L2 - 0.1, V(), V(k * L2, 0, 0));
    cap(leg[s], 0.1, LEG - J.knee - 0.12, V(), V(0, J.knee - J.hip, 0));
    cap(shin[s], 0.09, CALF - 0.12, V(), V(0, J.ankle - J.knee, 0));
    cap(foot[s], 0.08, 0.14, V(0, -0.05, -0.04), V(0, -0.05, 0.16));
  }

  // ---------- the NASA model, cut at the joints ----------
  // Which part a triangle belongs to, from its centre. The life-support pack (z < -0.15) stays on the body.
  const partOf = (x, y, z) => {
    const s = x > 0 ? 'L' : 'R', ax = Math.abs(x);
    if (y > 1.15 && ax > J.shoulder[0] + 0.03) return (ax > J.elbow ? 'Forearm_' : 'Arm_') + s;
    if (y < J.hip - 0.04 && z > -0.15) return (y > J.knee ? 'Leg_' : y > J.ankle ? 'Shin_' : 'Foot_') + s;
    return 'Body';
  };
  loadPeriod(THREE, 'astronaut', { merge: true, cast: shadows, rough: 0.85 }).then(model => {
    model.updateMatrixWorld(true);
    const p = V(), out = {}; // part -> material -> { position, normal, uv }
    model.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
      const idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.count;
      const tri = [0, 0, 0], c = V();
      for (let t = 0; t < n; t += 3) {
        c.set(0, 0, 0);
        for (let k = 0; k < 3; k++) { tri[k] = idx ? idx[t + k] : t + k; c.add(p.fromBufferAttribute(pos, tri[k])); }
        c.divideScalar(3).applyMatrix4(o.matrixWorld);
        const part = partOf(c.x, c.y, c.z), piv = pivots[part];
        const bucket = ((out[part] ||= new Map()).get(o.material) || (out[part].set(o.material, { position: [], normal: [], uv: [] }), out[part].get(o.material)));
        for (const i of tri) {
          p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).sub(piv);
          bucket.position.push(p.x, p.y, p.z);
          if (nor) bucket.normal.push(nor.getX(i), nor.getY(i), nor.getZ(i));
          if (uv) bucket.uv.push(uv.getX(i), uv.getY(i));
        }
      }
    });
    for (const m of stand) m.removeFromParent();
    for (const [part, mats] of Object.entries(out)) {
      for (const [material, a] of mats) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
        if (a.normal.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.normal, 3)); else geo.computeVertexNormals();
        if (a.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = part + '_Mesh'; mesh.castShadow = shadows;
        // The body's pivot is the hips: its mesh is moved up onto them. The limbs hang from their own joints.
        parts[part].add(mesh);
      }
    }
    pose(0);
  }).catch(e => console.warn('astronaut', e));

  // ---------- moving it ----------
  const cur = { x: 0, z: 0, ry: 0, h: STAND_EYE, set: false };
  let phase = 0, speed = 0, time = 0;
  const arms = [null, null], armsSmooth = [V(), V()], armsOn = [0, 0];
  const t3 = V(), s3 = V(), e3 = V(), d3 = V(), n3 = V(), el = V(), pole = V(), qi = new THREE.Quaternion();
  const REST = { L: V(1, 0, 0), R: V(-1, 0, 0) };

  // Two-bone IK: put the hand of side s at `target` (in Root's frame), the elbow bent down and out.
  function reach(s, target) {
    const k = s === 'L' ? 1 : -1;
    body.updateWorldMatrix(true, false);
    root.localToWorld(t3.copy(target)); body.worldToLocal(t3);
    s3.copy(arm[s].position);
    d3.subVectors(t3, s3);
    const d = Math.min(L1 + L2 - 1e-3, Math.max(0.08, d3.length()));
    d3.normalize();
    pole.set(k * 0.35, -1, -0.35).normalize();
    n3.copy(pole).addScaledVector(d3, -pole.dot(d3));
    if (n3.lengthSq() < 1e-6) n3.set(0, 0, -1); else n3.normalize();
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const up = e3.copy(d3).multiplyScalar(cosA).addScaledVector(n3, Math.sqrt(1 - cosA * cosA)); // upper arm direction
    arm[s].quaternion.setFromUnitVectors(REST[s], up);
    // The forearm runs from the elbow to the target, in the upper arm's frame.
    const elbow = el.copy(s3).addScaledVector(up, L1);
    const fd = t3.copy(s3).addScaledVector(d3, d).sub(elbow).normalize(); // to the hand, from the elbow
    qi.copy(arm[s].quaternion).invert();
    fore[s].quaternion.setFromUnitVectors(REST[s], fd.applyQuaternion(qi));
  }

  // Lay out the whole figure for the current state. walk: 0 standing to 1 striding.
  function pose(dt) {
    const walk = Math.min(1, speed / 1.1);
    // A crouch: the knees take the hips down as far as they comfortably go, the back bends for the rest.
    const drop = Math.max(0, Math.min(0.8, STAND_EYE - cur.h));      // how far the head has come down
    const bend = Math.min(MAX_KNEE, Math.acos(Math.max(0, (THIGH + CALF - drop * 0.75) / (THIGH + CALF))));
    const hipDrop = (THIGH + CALF) * (1 - Math.cos(bend));
    const lean = Math.acos(Math.max(0.3, 1 - Math.max(0, drop - hipDrop) / 0.85)); // 0.85 m from the hips to the eyes
    const sw = Math.sin(phase), bob = Math.abs(Math.cos(phase)) * 0.05 * walk;
    hips.position.y = J.hip - hipDrop + bob;
    hips.position.z = -Math.sin(bend) * THIGH * 0.5;                 // sit back over the heels, so the weight stays over the feet
    body.rotation.x = lean + walk * 0.08;                            // lean into a crouch, and a little into the walk
    body.rotation.z = Math.sin(time * 0.7) * 0.015 * (1 - walk);     // a slow sway, standing
    body.position.y = Math.sin(time * 1.7) * 0.004;                   // breathing
    for (const [s, k] of [['L', 1], ['R', -1]]) {
      const swing = s === 'L' ? sw : -sw;
      leg[s].rotation.set(-bend - swing * 0.45 * walk, 0, k * 0.04);
      shin[s].rotation.x = bend * 2 + Math.max(0, Math.sin(phase + (s === 'L' ? 0 : Math.PI) - 1.1)) * 0.7 * walk;
      foot[s].rotation.x = -(leg[s].rotation.x + shin[s].rotation.x) * (1 - 0.5 * walk); // flat on the ground; it rolls a little walking
      // Arms: to the tracked hand if there is one, else hanging at the side and swinging against the legs.
      const i = s === 'L' ? 0 : 1;
      t3.set(k * 0.42, J.shoulder[1] - 0.5 - drop, 0.06 + swing * -0.2 * walk);
      if (arms[i]) {
        armsSmooth[i].lerp(d3.set(-arms[i][0], arms[i][1], arms[i][2]), dt > 0 ? Math.min(1, dt * 12) : 1);
        armsOn[i] = Math.min(1, armsOn[i] + dt * 4);
      } else armsOn[i] = Math.max(0, armsOn[i] - dt * 3);
      reach(s, t3.lerp(armsSmooth[i], armsOn[i]));
    }
  }

  return {
    group, parts: { root, hips, body, arm, fore, hand, leg, shin, foot },
    // Every frame. p: the server's astronaut { x, z, ry, h, arms }, arriving ten times a second.
    update(dt, p) {
      time += dt;
      if (!cur.set) Object.assign(cur, { x: p.x, z: p.z, ry: p.ry, set: true });
      // Ease toward the latest pose, so 10 Hz updates read as a walk, not a series of hops.
      const k = 1 - Math.exp(-dt * 9), px = cur.x, pz = cur.z;
      cur.x += (p.x - cur.x) * k; cur.z += (p.z - cur.z) * k;
      let dy = p.ry - cur.ry; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); cur.ry += dy * k;
      cur.h += ((Number.isFinite(p.h) ? p.h : STAND_EYE) - cur.h) * k;
      const v = dt > 0 ? Math.hypot(cur.x - px, cur.z - pz) / dt : 0;
      speed += (v - speed) * Math.min(1, dt * 6);
      phase += dt * speed * Math.PI * 2 / STRIDE;
      if (speed < 0.08) phase += (Math.round(phase / Math.PI) * Math.PI - phase) * Math.min(1, dt * 4); // settle feet together
      arms[0] = p.arms?.[0] || null; arms[1] = p.arms?.[1] || null;
      group.position.set(cur.x, ground(cur.x, cur.z), cur.z);
      group.rotation.y = cur.ry;
      pose(dt);
    },
    // Put tools in the figure's hands: held = [left id or null, right id or null].
    hold(held, tools) {
      ['L', 'R'].forEach((s, i) => {
        const id = held?.[i], g = id && tools[id];
        if (!g) return;
        if (g.parent !== hand[s]) hand[s].add(g);
        const o = IN_HAND[id] || {};
        g.position.set(0, 0, o.z || 0); g.rotation.set(0, 0, 0); g.scale.setScalar(o.scale || 1);
        g.visible = true;
      });
    },
  };
}
