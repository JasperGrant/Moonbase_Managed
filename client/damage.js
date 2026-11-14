// What breaks inside the hall. The hall is clean until a fault hits; then a panel comes off the
// wall, a ceiling panel swings down on its hinge, a cable rips out of its clips and sparks. When the
// fault is fixed, everything goes back where it was.
//
// Each breakable listens to one fault in the server's scene (the same object the surface uses):
//   board   the switchboard trips: a ceiling panel over it drops, the conduit cable tears loose and sparks
//   hull    a hull breach: a wall panel by the airlock pops and falls flat, the pipe behind it vents
//   meteor  a shower is landing: a ceiling panel up the hall swings down, a gantry cable drops
//
// All motion is integrated at lunar gravity (1.62 m/s^2), so things fall slowly, the way they would.
// Everything is in room coordinates (see interior.js). Cheap for the Quest: three panels, two cables
// drawn as one instanced mesh each, one points cloud for sparks and vapour.

const G = 1.62;

export function buildDamage(THREE, group, { sfx = () => {} } = {}) {
  const pieces = [];   // panels: fall off a wall, or swing down from the ceiling
  const cables = [];
  let audible = false; // only make a noise while the astronaut is in the hall

  // ---------- materials ----------
  function panelTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#c4c7c9'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#5a5f64'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 248);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; g.strokeRect(30, 30, 196, 196);
    g.fillStyle = '#3f4449'; for (const [x, y] of [[18, 18], [238, 18], [18, 238], [238, 238], [128, 18], [128, 238]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const faceMat = new THREE.MeshLambertMaterial({ map: panelTexture() });
  const backMat = new THREE.MeshLambertMaterial({ color: 0x6a6f74 });
  const holeMat = new THREE.MeshLambertMaterial({ color: 0x121417 });
  const wireCols = [0xa8372c, 0xd0a11c, 0x3b6fd6, 0x2f8f4e, 0xdfe1e2];

  // A cavity behind a panel: dark, with a few coloured wires and a pipe across it. It is always
  // there, just covered while the panel is in place.
  function cavity(w, h, at, rot) {
    const g = new THREE.Group();
    g.position.copy(at); g.rotation.copy(rot); group.add(g);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), holeMat); back.position.z = 0.003; g.add(back);
    for (let i = 0; i < 5; i++) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h * 0.92, 6), new THREE.MeshLambertMaterial({ color: wireCols[i] }));
      wire.position.set(-w * 0.32 + i * w * 0.07, 0, 0.02); g.add(wire);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, w * 0.9, 10), new THREE.MeshLambertMaterial({ color: 0x9ea3a7 }));
    pipe.rotation.z = Math.PI / 2; pipe.position.set(0, h * 0.22, 0.04); g.add(pipe);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, h * 0.2, 0.06), new THREE.MeshLambertMaterial({ color: 0x41464c }));
    box.position.set(w * 0.25, -h * 0.15, 0.03); g.add(box);
    g.userData.pipeEnd = new THREE.Vector3(w * 0.45, h * 0.22, 0.06); // where a vent would blow from
    return g;
  }

  // A panel is a thin box on a pivot. `hinge` is where it turns about; `mesh` sits off the hinge so
  // that turning the pivot swings it the way a panel on that edge would.
  function slab(w, h) {
    const geo = new THREE.BoxGeometry(w, h, 0.03);
    // Face on +z gets the panel picture, the rest is plain painted metal.
    return new THREE.Mesh(geo, [backMat, backMat, backMat, backMat, faceMat, backMat]);
  }

  // A wall panel: pops out, drops to the floor, tips over onto its face, rocks and settles.
  // `at` is the panel's centre on the wall, `inward` the unit direction into the room.
  function wallPanel(trigger, { at, inward, w = 1.0, h = 1.5 }) {
    const yaw = Math.atan2(inward.x, inward.z);
    const cav = cavity(w * 0.96, h * 0.96, new THREE.Vector3(at.x, at.y, at.z).addScaledVector(inward, 0.002), new THREE.Euler(0, yaw, 0));
    const pivot = new THREE.Group(); group.add(pivot); // turns about the bottom edge
    const mesh = slab(w, h); mesh.position.set(0, h / 2, -0.015); pivot.add(mesh); // flush when upright, on the floor when flat
    const home = { x: at.x + inward.x * 0.012, y: at.y - h / 2, z: at.z + inward.z * 0.012 };
    const p = { kind: 'wall', trigger, pivot, mesh, cav, home, inward, yaw, h, state: 'home', y: home.y, out: 0, vy: 0, th: 0, w: 0, back: 0, landed: false };
    pieces.push(p); place(p);
    return p;
  }
  // A ceiling panel: drops on one hinged edge and swings, damped, until it hangs straight down.
  // `hingeAt` is the middle of the hinged edge; `away` points from the hinge across the panel.
  function ceilingPanel(trigger, { hingeAt, away, w = 1.0, d = 0.9 }) {
    const yaw = Math.atan2(away.x, away.z);
    const centre = new THREE.Vector3(hingeAt.x + away.x * d / 2, hingeAt.y - 0.002, hingeAt.z + away.z * d / 2);
    cavity(w * 0.96, d * 0.96, centre, new THREE.Euler(Math.PI / 2, yaw, 0, 'YXZ')); // facing down, its depth along `away`
    const pivot = new THREE.Group(); pivot.position.set(hingeAt.x, hingeAt.y - 0.017, hingeAt.z); pivot.rotation.order = 'YXZ'; pivot.rotation.y = yaw; group.add(pivot);
    const mesh = slab(w, d); mesh.rotation.x = Math.PI / 2; mesh.position.set(0, 0, d / 2); pivot.add(mesh); // face down
    const p = { kind: 'ceiling', trigger, pivot, mesh, d, state: 'home', phi: 0, w: 0, back: 0 };
    pieces.push(p); place(p);
    return p;
  }

  function place(p) {
    if (p.kind === 'wall') {
      p.pivot.position.set(p.home.x + p.inward.x * p.out, p.y, p.home.z + p.inward.z * p.out);
      p.pivot.rotation.set(0, 0, 0); p.pivot.rotation.order = 'YXZ'; p.pivot.rotation.y = p.yaw; p.pivot.rotation.x = p.th;
    } else {
      p.pivot.rotation.x = p.phi;
    }
  }

  // ---------- cables: a chain of points, clipped along a run until it tears loose ----------
  const segGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const cableMat = new THREE.MeshLambertMaterial({ color: 0x1b1e22 });
  function cable(trigger, { from, to, n = 12, slack = 1.35, sparks = false, r = 0.018 }) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const rest = Array.from({ length: n }, (_, i) => a.clone().lerp(b, i / (n - 1)));
    const seg = a.distanceTo(b) / (n - 1) * slack; // longer than the run: there was slack in the clips
    const pts = rest.map(v => v.clone()), prev = rest.map(v => v.clone());
    const im = new THREE.InstancedMesh(segGeo, cableMat, n - 1); im.frustumCulled = false; group.add(im);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.8, r * 1.8, 0.06, 8), new THREE.MeshLambertMaterial({ color: 0xb87333 }));
    group.add(end);
    const c = { trigger, rest, pts, prev, seg, n, r, im, end, sparks, state: 'home', back: 0, nextSpark: 0 };
    cables.push(c); drawCable(c);
    return c;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), mid = new THREE.Vector3(), sc = new THREE.Vector3();
  function drawCable(c) {
    for (let i = 0; i < c.n - 1; i++) {
      v.subVectors(c.pts[i + 1], c.pts[i]); const len = v.length() || 1e-4;
      q.setFromUnitVectors(UP, v.multiplyScalar(1 / len));
      mid.addVectors(c.pts[i], c.pts[i + 1]).multiplyScalar(0.5);
      c.im.setMatrixAt(i, m4.compose(mid, q, sc.set(c.r, len + c.r, c.r)));
    }
    c.im.instanceMatrix.needsUpdate = true;
    const last = c.pts[c.n - 1];
    v.subVectors(last, c.pts[c.n - 2]).normalize();
    c.end.position.copy(last); c.end.quaternion.setFromUnitVectors(UP, v);
  }
  function stepCable(c, dt) {
    const loose = c.state === 'loose';
    if (c.state === 'home') return;
    if (c.state === 'back') { // reeled back into its clips
      c.back = Math.min(1, c.back + dt / 0.9);
      const k = 1 - Math.pow(1 - c.back, 3);
      for (let i = 0; i < c.n; i++) { c.pts[i].lerp(c.rest[i], k); c.prev[i].copy(c.pts[i]); }
      if (c.back >= 1) c.state = 'home';
      return drawCable(c);
    }
    const h = Math.min(dt, 1 / 30);
    for (let i = 1; i < c.n; i++) { // Verlet, with a little air drag so the swing dies away
      const p = c.pts[i], o = c.prev[i];
      v.subVectors(p, o).multiplyScalar(0.992);
      o.copy(p); p.add(v); p.y -= G * h * h;
    }
    for (let k = 0; k < 10; k++) {
      c.pts[0].copy(c.rest[0]);
      for (let i = 0; i < c.n - 1; i++) {
        const a = c.pts[i], b = c.pts[i + 1];
        v.subVectors(b, a); const d = v.length() || 1e-4, diff = (d - c.seg) / d;
        if (i === 0) b.addScaledVector(v, -diff); else { a.addScaledVector(v, diff / 2); b.addScaledVector(v, -diff / 2); }
      }
      for (let i = 1; i < c.n; i++) { const p = c.pts[i]; if (p.y < 0.02) p.y = 0.02; p.x = Math.max(-3.45, Math.min(3.45, p.x)); }
    }
    if (loose) drawCable(c);
  }

  // ---------- sparks and vapour: one shared points cloud ----------
  const MAX = 120;
  const pPos = new Float32Array(MAX * 3), pCol = new Float32Array(MAX * 3);
  const parts = Array.from({ length: MAX }, () => ({ life: 0, max: 1, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, kind: 0 }));
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  { const g = dot.getContext('2d'), rg = g.createRadialGradient(16, 16, 0, 16, 16, 16); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.4, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 32, 32); }
  const cloud = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.05, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  cloud.frustumCulled = false; group.add(cloud);
  let pNext = 0;
  function emit(at, n, kind) { // kind 0 spark, 1 vapour
    for (let i = 0; i < n; i++) {
      const p = parts[pNext]; pNext = (pNext + 1) % MAX;
      const a = Math.random() * Math.PI * 2, s = kind ? 0.3 + Math.random() * 0.4 : 0.6 + Math.random() * 1.6;
      Object.assign(p, { kind, x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * s * (kind ? 0.4 : 1), vy: kind ? 0.1 + Math.random() * 0.2 : Math.random() * 1.2 - 0.2, vz: Math.sin(a) * s * (kind ? 0.4 : 1), life: 0, max: kind ? 0.9 + Math.random() * 0.6 : 0.35 + Math.random() * 0.4 });
      if (kind && at.dir) { p.vx += at.dir.x * 1.4; p.vy += at.dir.y * 1.4; p.vz += at.dir.z * 1.4; }
    }
  }
  function stepParts(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = parts[i];
      if (p.life >= p.max) { pPos[i * 3 + 1] = -10; continue; }
      p.life += dt;
      if (!p.kind) p.vy -= G * dt * 1.5; else { p.vx *= 0.97; p.vy *= 0.97; p.vz *= 0.97; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.01) { p.y = 0.01; p.vy *= -0.3; }
      const f = 1 - p.life / p.max;
      pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
      if (p.kind) { pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0.35 * f; }
      else { pCol[i * 3] = 1.6 * f; pCol[i * 3 + 1] = (0.5 + 0.7 * f) * f; pCol[i * 3 + 2] = 0.2 * f * f; }
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = true;
  }

  // ---------- the breakables ----------
  // board: over the switchboard on the west wall (z -7.7)
  ceilingPanel('board', { hingeAt: new THREE.Vector3(-3.0, 3.2, -8.2), away: new THREE.Vector3(1, 0, 0), w: 0.9, d: 0.9 });
  cable('board', { from: [-3.33, 2.6, -5.0], to: [-3.33, 2.6, -7.25], n: 12, slack: 1.15, sparks: true });
  // hull: the wall panel left of the airlock, and the vent pipe behind it
  const hullPanel = wallPanel('hull', { at: new THREE.Vector3(-2.3, 1.15, -0.01), inward: new THREE.Vector3(0, 0, -1), w: 1.0, h: 1.5 });
  // meteor: a ceiling panel up the hall, and a cable off the gantry
  ceilingPanel('meteor', { hingeAt: new THREE.Vector3(1.0, 3.2, -10.9), away: new THREE.Vector3(0, 0, 1), w: 1.0, d: 0.9 });
  cable('meteor', { from: [0.9, 2.26, -5.35], to: [1.4, 2.28, -5.5], n: 9, slack: 2.6, r: 0.022 });

  // ---------- running it ----------
  const active = { board: false, hull: false, meteor: false };
  function breakPiece(p) {
    if (p.state === 'down' || p.state === 'falling') return;
    if (p.kind === 'wall') Object.assign(p, { state: 'falling', vy: 0, out: 0.04, th: 0, w: 0, landed: false });
    else Object.assign(p, { state: 'falling', w: 0.4 });
    if (audible) sfx('pop');
  }
  function mendPiece(p) { if (p.state !== 'home') Object.assign(p, { state: 'back', back: 0, from: p.kind === 'wall' ? { y: p.y, out: p.out, th: p.th } : { phi: p.phi } }); }

  function stepPiece(p, dt) {
    if (p.state === 'home') return;
    if (p.state === 'back') { // lifted back into place and fastened
      p.back = Math.min(1, p.back + dt / 0.8);
      const k = 1 - Math.pow(1 - p.back, 3);
      if (p.kind === 'wall') { p.y = p.from.y + (p.home.y - p.from.y) * k; p.out = p.from.out * (1 - k); p.th = p.from.th * (1 - k); }
      else p.phi = p.from.phi * (1 - k);
      if (p.back >= 1) p.state = 'home';
      return place(p);
    }
    const h = Math.min(dt, 1 / 30);
    if (p.kind === 'wall') {
      if (p.y > 0.0) { // dropping, still upright, sliding down the wall
        p.vy -= G * h; p.y = Math.max(0, p.y + p.vy * h);
        if (p.y === 0 && audible) sfx('clank');
      } else {           // tipping over onto its face about the bottom edge
        p.w += (3 * G / (2 * p.h)) * Math.sin(Math.max(p.th, 0.03)) * h;
        p.th += p.w * h;
        if (p.th >= Math.PI / 2) {
          p.th = Math.PI / 2;
          if (Math.abs(p.w) > 0.4) { if (!p.landed && audible) sfx('clang'); p.landed = true; p.w *= -0.22; } else { p.w = 0; p.state = 'down'; }
        }
      }
    } else {
      // A plate hinged on one edge: phi'' = (3g / 2d) cos(phi), with damping in the hinge.
      p.w += ((3 * G / (2 * p.d)) * Math.cos(p.phi) - 0.55 * p.w) * h;
      p.phi += p.w * h;
      if (p.phi > Math.PI * 0.98) { p.phi = Math.PI * 0.98; p.w *= -0.3; }
      if (Math.abs(p.phi - Math.PI / 2) < 0.01 && Math.abs(p.w) < 0.02) { p.phi = Math.PI / 2; p.state = 'down'; }
    }
    place(p);
  }

  const tmp = new THREE.Vector3();
  return {
    pieces, cables,
    set audible(on) { audible = on; },
    // Pass the server's scene each frame (null when no round is running).
    set(scene) {
      const want = { board: !!scene?.board, hull: !!scene?.hull, meteor: scene?.meteor != null && scene.meteor > 0.5 };
      for (const k in want) {
        if (want[k] === active[k]) continue;
        active[k] = want[k];
        for (const p of pieces) if (p.trigger === k) (want[k] ? breakPiece : mendPiece)(p);
        for (const c of cables) if (c.trigger === k) {
          if (want[k]) { if (c.state !== 'loose') { c.state = 'loose'; c.nextSpark = 0; c.prev.forEach((o, i) => o.copy(c.pts[i]).add(tmp.set(0, 0.004 * i, 0.002 * i))); if (audible) sfx('snap'); } }
          else if (c.state === 'loose') { c.state = 'back'; c.back = 0; }
        }
      }
    },
    update(dt, time) {
      for (const p of pieces) stepPiece(p, dt);
      for (const c of cables) {
        stepCable(c, dt);
        if (c.state === 'loose' && c.sparks && time > c.nextSpark) {
          c.nextSpark = time + 0.4 + Math.random() * 1.6;
          emit(c.pts[c.n - 1], 8 + Math.floor(Math.random() * 10), 0);
          if (audible) sfx('spark');
        }
      }
      // A breached hull vents through the pipe behind the fallen panel.
      if (active.hull && hullPanel.state !== 'home' && Math.random() < dt * 30) {
        const at = hullPanel.cav.localToWorld(tmp.copy(hullPanel.cav.userData.pipeEnd));
        group.worldToLocal(at); at.dir = { x: 0.6, y: 0.1, z: -0.8 };
        emit(at, 1, 1);
      }
      stepParts(dt);
    },
    get broken() { return pieces.filter(p => p.state !== 'home').length + cables.filter(c => c.state !== 'home').length; },
  };
}
