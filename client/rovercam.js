// The Technician's two rover cameras: the same world as the astronaut's, seen from the Scout (left) and the
// Hauler (right). One renderer, one copy of the world, drawn twice into the two halves of one canvas, at most
// 30 frames a second: the 2-player seat runs this beside everything else. The astronaut is a figure that
// walks, crouches and reaches (client/avatar.js), with the tools in their hands, and any tool lying out on
// the surface lies where it came to rest.
import * as THREE from 'three';
import { buildWorld } from '/world.js';
import { buildTools, layDown } from '/tools.js';

export const CAMS = ['scout', 'hauler'];

// Two views per rover (docs/design/rover-camera-views.md): first person, from the rover, and third person,
// a chase camera behind and above it. Each camera switches on its own and glides between the two.
const CHASE = {
  scout:  { dist: 5.5, height: 2.4, look: 1.0, ahead: 2.0 },  // metres behind, above the ground, up the rover to aim at, ahead of it
  hauler: { dist: 7.0, height: 3.0, look: 1.2, ahead: 2.5 },
};
const DIST_MIN = 3, DIST_MAX = 14;   // how near and far the wheel may take the chase camera
const LAG = 2.6;                     // 1/s: how fast the chase camera swings round behind a turn
const GLIDE = 6;                     // 1/s: how fast the two views blend into each other
const KEY = 'moonbase.camviews';
const smooth = t => t * t * (3 - 2 * t);

export function startRoverCam(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setScissorTest(true);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const world = buildWorld(THREE, scene, { shadows: false, renderer });
  const cams = {}, mounts = {}, views = {};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {} // a per-viewer convenience: fine without it
  for (const id of CAMS) {
    const cam = new THREE.PerspectiveCamera(70, 4 / 3, 0.1, 2600);
    cams[id] = cam;
    // The first-person mount on the rover. The camera itself is free, posed each frame, so it can glide.
    const mount = new THREE.Object3D(); mount.name = 'Cam_FP_' + id;
    if (id === 'scout') { mount.position.set(0.3, 1.8, 0.55); mount.rotation.set(-0.16, Math.PI, 0, 'YXZ'); } // the mast camera, looking ahead
    else { mount.position.set(0, 1.9, 0.9); mount.rotation.set(-0.12, Math.PI, 0, 'YXZ'); }                    // the Hauler's, over the console
    world.rovers[id].add(mount); mounts[id] = mount;
    scene.add(cam);
    const third = saved[id] === 'third';
    views[id] = { mode: third ? 'third' : 'first', blend: third ? 1 : 0, dist: CHASE[id].dist, yaw: null, pos: new THREE.Vector3(), has: false };
  }
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(CAMS.map(id => [id, views[id].mode])))); } catch {} };
  const api = {
    world,
    view: id => views[id]?.mode,
    setView(id, mode) { if (views[id] && (mode === 'first' || mode === 'third')) { views[id].mode = mode; remember(); } },
    toggle(id) { const v = views[id]; if (!v) return null; api.setView(id, v.mode === 'first' ? 'third' : 'first'); return v.mode; },
    // The wheel: nearer (negative) or further (positive), within limits. Only means anything in third person.
    zoom(id, delta) { const v = views[id]; if (v) v.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, v.dist * Math.exp(delta * 0.0015))); },
    // For the tests: the camera's pose and how far through the glide it is.
    state: id => ({ mode: views[id].mode, blend: views[id].blend, dist: views[id].dist, camera: cams[id] }),
  };
  // Pose camera `id`: the first-person mount, the chase camera behind and above the rover, or a blend.
  const fpP = new THREE.Vector3(), fpQ = new THREE.Quaternion(), tpP = new THREE.Vector3(), tpQ = new THREE.Quaternion();
  const aim = new THREE.Vector3(), fwd = new THREE.Vector3(), rp = new THREE.Vector3(), mtx = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  function pose(id, dt) {
    const v = views[id], r = world.rovers[id], C = CHASE[id], cam = cams[id];
    r.updateWorldMatrix(true, true);
    mounts[id].getWorldPosition(fpP); mounts[id].getWorldQuaternion(fpQ);
    v.blend += ((v.mode === 'third' ? 1 : 0) - v.blend) * (1 - Math.exp(-dt * GLIDE));
    if (Math.abs(v.blend - (v.mode === 'third' ? 1 : 0)) < 0.002) v.blend = v.mode === 'third' ? 1 : 0;
    if (v.blend === 0) { cam.position.copy(fpP); cam.quaternion.copy(fpQ); return; }
    // Third person: behind the rover along its heading, which trails the rover's own with a little lag.
    r.getWorldPosition(rp);
    const heading = r.userData.yaw ?? 0;
    if (v.yaw === null) v.yaw = heading;
    let d = heading - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    v.yaw += d * (1 - Math.exp(-dt * LAG));
    fwd.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    const dist = Math.max(2.5, v.dist);
    tpP.copy(rp).addScaledVector(fwd, -dist);
    tpP.y = Math.max(world.ground(tpP.x, tpP.z), rp.y) + C.height * (0.6 + 0.4 * dist / C.dist); // higher as it backs off, never under the ground
    tpP.y = Math.max(tpP.y, world.ground(tpP.x, tpP.z) + 0.8);
    aim.copy(rp).addScaledVector(fwd, C.ahead); aim.y += C.look;
    mtx.lookAt(tpP, aim, UP); tpQ.setFromRotationMatrix(mtx);
    const e = smooth(v.blend);
    cam.position.copy(fpP).lerp(tpP, e); cam.quaternion.copy(fpQ).slerp(tpQ, e);
  }
  const tools = buildTools(THREE);
  let last = 0, lastT = 0;
  renderer.setAnimationLoop(ms => {
    if (ms - last < 33) return;
    const dt = Math.min(0.5, (ms - last) / 1000);
    last = ms;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== w || canvas.height !== h)) renderer.setSize(w, h, false);
    const s = getState();
    if (!w || !h || !s || !s.rovers || document.hidden) return;
    const t = ms / 1000, fdt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    world.moveRovers(s.rovers, 1 - Math.exp(-dt * 10));
    world.update(t);
    if (s.scene) world.apply(s.scene, t);
    const a = s.astro;
    // Inside the habitat the astronaut is out of the cameras' sight.
    world.avatar.visible = !!a && s.crew.includes('astronaut') && !a.inside;
    if (a) world.figure.update(fdt, a);
    if (world.avatar.visible && a.riding) world.avatar.position.y = world.ground(a.x, a.z) + 0.45; // standing on the footplate
    const kit = s.scene?.tools || { held: [null, null], ground: {} };
    for (const id in tools) tools[id].visible = false;
    if (world.avatar.visible) world.figure.hold(kit.held, tools);
    for (const [id, at] of Object.entries(kit.ground)) {
      const g = tools[id];
      if (!g) continue;
      if (g.parent !== scene) scene.add(g);
      layDown(THREE, g, id, at); g.visible = true;
    }
    const half = Math.floor(w / 2);
    CAMS.forEach((id, n) => {
      const cam = cams[id], x = n * half, cw = n ? w - half : half;
      pose(id, dt);
      cam.aspect = cw / h; cam.updateProjectionMatrix();
      renderer.setViewport(x, 0, cw, h); renderer.setScissor(x, 0, cw, h);
      renderer.render(scene, cam);
    });
  });
  return api;
}
