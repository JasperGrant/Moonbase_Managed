// Physics for the tools: they fall, tumble, clatter, roll and can be thrown, at lunar gravity.
// cannon-es (vendored, client/vendor/cannon-es/) does the work; nothing else in the game imports it.
//
// Two worlds, because the hall is somewhere else (client/interior.js builds it 500 m off to one side, in
// its own coordinates): `hall`, in room coordinates, and `surface`, in world coordinates. Only the one
// the astronaut is in is stepped; the other waits, frozen, until they come back.
//
// Built for the Quest: a dozen bodies at most, boxes, spheres and cylinders only, everything asleep the
// moment it stops, a fixed 1/72 s step with at most three sub-steps a frame.
import * as CANNON from 'cannon-es';

export const G = 1.62; // m/s^2, the Moon
const STEP = 1 / 72;
const HAND_MAX = 8;    // m/s: the fastest a hand body pushes things
const HAND_JUMP = 0.4;  // m in one frame: further than this is a jump, not a swing

export function buildPhysics() {
  const make = damping => {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0), allowSleep: true });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.defaultContactMaterial.friction = 0.55;
    w.defaultContactMaterial.restitution = 0.18;
    w.userData = { damping };
    return w;
  };
  const worlds = { hall: make(0.02), surface: make(0) }; // no air outside
  const bodies = new Map(); // id -> { body, place, shapeOf }
  let onHit = () => {}, onRest = () => {};

  // ---------- static things to land on and bounce off ----------
  const fixed = (place, shape, x, y, z, q) => {
    const b = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, shape });
    b.position.set(x, y, z); if (q) b.quaternion.copy(q);
    // The box cannon worked out when the shape went in was at the origin, and a static body never moves to
    // refresh it. The sweep-and-prune broadphase sorts by that box, so a stale one hides the body from
    // whatever falls on it (a tool sank through the wall rack's shelf).
    b.updateAABB();
    b.userData = { kind: 'fixed' };
    worlds[place].addBody(b); return b;
  };
  const box = (w, h, d) => new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
  const yaw = a => new CANNON.Quaternion().setFromEuler(0, a, 0);

  // ---------- the tools ----------
  // shape: a list of parts [kind, size, offset] with kind 'box' ([w,h,d]), 'cyl' ([r, len], along z) or 'sphere' ([r]).
  function add(id, parts, mass, place, pose) {
    const b = new CANNON.Body({ mass, linearDamping: worlds[place].userData.damping, angularDamping: 0.12, sleepSpeedLimit: 0.06, sleepTimeLimit: 0.5 });
    for (const [kind, size, off = [0, 0, 0], rot] of parts) {
      const shape = kind === 'box' ? box(...size) : kind === 'sphere' ? new CANNON.Sphere(size[0]) : new CANNON.Cylinder(size[0], size[0], size[1], 10);
      // cannon's cylinder runs along y: turn it to run along z (the way the tools are modelled), unless told otherwise
      const q = rot ? new CANNON.Quaternion().setFromEuler(...rot) : kind === 'cyl' ? new CANNON.Quaternion().setFromEuler(Math.PI / 2, 0, 0) : undefined;
      b.addShape(shape, new CANNON.Vec3(...off), q);
    }
    b.userData = { kind: 'tool', id };
    b.addEventListener('collide', e => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 0.6) { const p = e.contact.bi === b ? e.contact.ri.vadd(b.position) : e.contact.rj.vadd(b.position); onHit(id, v, [p.x, p.y, p.z], bodies.get(id)?.place); }
    });
    b.addEventListener('sleep', () => { if (bodies.get(id)?.state === 'loose') onRest(id); });
    const entry = { body: b, place, parts, mass, state: 'loose' };
    bodies.set(id, entry);
    set(id, place, pose);
    worlds[place].addBody(b);
    return entry;
  }
  // Put a tool at pose ({x, y, z, q: THREE.Quaternion-like {x,y,z,w}}) in a place, at rest.
  function set(id, place, pose) {
    const e = bodies.get(id); if (!e) return;
    const b = e.body;
    if (e.place !== place) { worlds[e.place].removeBody(b); worlds[place].addBody(b); e.place = place; b.linearDamping = worlds[place].userData.damping; }
    b.position.set(pose.x, pose.y, pose.z);
    if (pose.q) b.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w);
    b.velocity.setZero(); b.angularVelocity.setZero();
    b.wakeUp();
  }
  // In a hand: kinematic, so it pushes other things about but nothing pushes it. Moved by follow().
  function hold(id) {
    const e = bodies.get(id); if (!e) return;
    e.state = 'held'; e.body.type = CANNON.Body.KINEMATIC; e.body.mass = 0; e.body.updateMassProperties();
    e.body.velocity.setZero(); e.body.angularVelocity.setZero(); e.body.wakeUp();
  }
  function follow(id, place, x, y, z, q, dt) {
    const e = bodies.get(id); if (!e || e.state !== 'held') return;
    if (e.place !== place) set(id, place, { x, y, z, q });
    const b = e.body;
    if (dt > 0) b.velocity.set((x - b.position.x) / dt, (y - b.position.y) / dt, (z - b.position.z) / dt);
    b.position.set(x, y, z); b.quaternion.set(q.x, q.y, q.z, q.w);
  }
  // Let go, with the hand's velocity: dropped, or thrown.
  function release(id, v = [0, 0, 0], w = [0, 0, 0]) {
    const e = bodies.get(id); if (!e) return;
    e.state = 'loose';
    const b = e.body;
    b.type = CANNON.Body.DYNAMIC; b.mass = e.mass; b.updateMassProperties();
    const cap = 6, len = Math.hypot(...v), k = len > cap ? cap / len : 1;
    b.velocity.set(v[0] * k, v[1] * k, v[2] * k); b.angularVelocity.set(...w);
    b.wakeUp();
  }
  // Used up (the generator after its pull, the tire on the rover): out of the world.
  function remove(id) { const e = bodies.get(id); if (!e) return; worlds[e.place].removeBody(e.body); e.state = 'gone'; }
  function restore(id) { const e = bodies.get(id); if (!e || e.state !== 'gone') return; e.state = 'loose'; worlds[e.place].addBody(e.body); }

  // A kinematic ball on each hand, so a hand can knock a tool off a bench or nudge it along the floor.
  const hands = [0, 1].map(() => { const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: new CANNON.Sphere(0.05) }); b.userData = { kind: 'hand' }; b.collisionResponse = true; return b; });
  let handPlace = null;
  function moveHands(place, points, dt) {
    if (handPlace !== place) { for (const h of hands) { if (handPlace) worlds[handPlace].removeBody(h); if (place) worlds[place].addBody(h); } handPlace = place; }
    hands.forEach((h, i) => {
      const p = points[i];
      if (!p) { h.position.set(0, -50, 0); h.velocity.setZero(); return; }
      // A hand that jumped (a teleport, an airlock, the first frame) arrives at rest: swept along the jump at
      // jump/dt it would knock whatever it crossed through the floor. A real arm swing is capped too.
      const dx = p.x - h.position.x, dy = p.y - h.position.y, dz = p.z - h.position.z, d = Math.hypot(dx, dy, dz);
      if (d > HAND_JUMP || !(dt > 0)) h.velocity.setZero();
      else { const k = Math.min(1 / dt, HAND_MAX / Math.max(d, 1e-6)); h.velocity.set(dx * k, dy * k, dz * k); }
      h.position.set(p.x, p.y, p.z);
    });
  }

  // A kinematic box that follows the rover, so a tool on the ground is shoved aside when it drives by.
  const rover = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape: box(2.2, 1.2, 3.2) });
  rover.userData = { kind: 'rover' };
  worlds.surface.addBody(rover);

  let acc = 0, lastStepMs = 0;
  return {
    worlds, bodies, CANNON, fixed, box, yaw,
    add, set, hold, follow, release, remove, restore, moveHands,
    onHit: fn => { onHit = fn; }, onRest: fn => { onRest = fn; },
    moveRover(r, dt) {
      if (!r) return;
      const y = 0.75;
      if (dt > 0) rover.velocity.set((r.x - rover.position.x) / dt, 0, (r.z - rover.position.z) / dt);
      rover.position.set(r.x, y, r.z); rover.quaternion.setFromEuler(0, r.ry || 0, 0);
    },
    // The terrain as a heightfield, sampled from the world's height(x, z) at `step` metres out to `half`.
    terrain(height, half, step = 1) {
      const n = Math.round(2 * half / step) + 1, data = [];
      // cannon's heightfield lies in its local xy plane with height along +z; turned -90 deg about x,
      // local (i, j) is world (x0 + i*step, z0 - j*step) ... so sample with z running backwards.
      for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < n; j++) row.push(height(-half + i * step, half - j * step)); data.push(row); }
      const hf = new CANNON.Heightfield(data, { elementSize: step });
      const b = new CANNON.Body({ mass: 0 });
      b.addShape(hf); b.position.set(-half, 0, half); b.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      b.updateAABB(); // see fixed()
      b.userData = { kind: 'ground' };
      worlds.surface.addBody(b);
      return b;
    },
    // Advance the world the astronaut is in.
    step(dt, place) {
      const t0 = performance.now();
      const w = worlds[place];
      if (w) w.step(STEP, Math.min(dt, 0.05), 3);
      lastStepMs = performance.now() - t0;
      acc += dt;
    },
    get stepMs() { return lastStepMs; },
    count: () => bodies.size,
    // Where a tool's body is: { place, x, y, z, q }.
    pose(id) {
      const e = bodies.get(id); if (!e) return null;
      const { position: p, quaternion: q } = e.body;
      return { place: e.place, state: e.state, x: p.x, y: p.y, z: p.z, q: { x: q.x, y: q.y, z: q.z, w: q.w }, asleep: e.body.sleepState === CANNON.Body.SLEEPING };
    },
  };
}
