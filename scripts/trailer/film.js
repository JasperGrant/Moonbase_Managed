// The trailer's film set: the game's own Moon (client/world.js), the astronaut figure (client/avatar.js),
// both rovers, the tools and the habitat hall (client/interior.js), drawn one frame at a time from a
// scripted camera. scripts/trailer/record.mjs drives it: window.film.frame({...}) poses everything,
// draws once and hands back the picture, so the footage is smooth however slow this machine draws.
import * as THREE from 'three';
import { buildWorld } from '/world.js';
import { buildInterior, ROOM } from '/interior.js';
import { buildTools, layDown } from '/tools.js';
import { PAL } from '/shared/palette.js';

const W = +(new URLSearchParams(location.search).get('w') || 1280), H = +(new URLSearchParams(location.search).get('h') || 720);
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 2600);
const world = buildWorld(THREE, scene, { renderer });
const interior = buildInterior(THREE, scene);
world.avatar.visible = true;
const tools = buildTools(THREE);

// The helmet lamp the astronaut wears (the game hangs the same light off the player's camera).
const lamp = new THREE.SpotLight(PAL.hex.incandescent, 10, 14, 0.65, 0.7, 1.4);
lamp.position.set(0, 1.75, 0.15); lamp.target.position.set(0, 1.2, 3);
world.avatar.add(lamp, lamp.target);

// Welding sparks for the camera: the game's welder shows one glowing bead at its tip (a light per spark
// would cost the Quest too much); on film it throws a spray of them, and the bead lights the hull.
const SPARKS = 60, sparkMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 5, 4), new THREE.MeshBasicMaterial({ color: PAL.hex.incandescent, toneMapped: false }), SPARKS);
sparkMesh.frustumCulled = false; scene.add(sparkMesh);
const sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
const weldLight = new THREE.PointLight(PAL.hex.incandescent, 0, 4, 1.6); scene.add(weldLight);
const m4 = new THREE.Matrix4(), tipW = new THREE.Vector3();
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function weldSparks(on, dt) {
  const w = tools.welder, sp = w.userData.spark;
  sp.visible = on && w.visible;
  if (sp.visible) { sp.getWorldPosition(tipW); sp.scale.setScalar(0.8 + rnd() * 1.6); }
  weldLight.intensity = sp.visible ? 1.2 + rnd() * 1.4 : 0; weldLight.position.copy(tipW);
  let made = 0;
  sparks.forEach((s, i) => {
    if (s.life <= 0 && sp.visible && made < 4) { s.p.copy(tipW); s.v.set((rnd() - 0.5) * 2.4, rnd() * 1.6, (rnd() - 0.5) * 2.4); s.life = 0.35 + rnd() * 0.5; made++; }
    if (s.life > 0) { s.v.y -= 1.62 * dt; s.p.addScaledVector(s.v, dt); s.life -= dt; }
    m4.makeScale(s.life > 0 ? 1 : 0, s.life > 0 ? 1 : 0, s.life > 0 ? 1 : 0).setPosition(s.p);
    sparkMesh.setMatrixAt(i, m4);
  });
  sparkMesh.instanceMatrix.needsUpdate = true;
}

const pos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
let last = null;
const shadowsAt = { x: null, z: null };

window.film = {
  THREE, scene, camera, world, interior, tools, renderer, ROOM,
  height: (x, z) => world.ground(x, z),
  // f: { t, dt, cam: { pos: [x,y,z], look: [x,y,z], fov, roll }, astro: { x, z, ry, h, arms, y }, held, rovers, scene, ground: {id: at}, exposure }
  frame(f) {
    const t = f.t, dt = f.dt ?? 1 / 30;
    if (f.exposure) renderer.toneMappingExposure = f.exposure;
    world.update(t);
    if (f.rovers) world.moveRovers(f.rovers, f.roverK ?? 1);
    if (f.scene) world.apply(f.scene, t);
    const a = f.astro;
    world.avatar.visible = !!a;
    if (a) {
      if (a.ride) { // standing on a rover's footplate: the figure stands still, and the rover carries it
        world.figure.update(dt, { ...a, x: 0, z: 0, ry: 0 });
        world.avatar.position.set(a.ride.x, world.ground(a.ride.x, a.ride.z) + a.ride.y, a.ride.z);
        world.avatar.rotation.y = a.ride.ry;
      } else world.figure.update(dt, a);
      if (a.y !== undefined) world.avatar.position.y += a.y;   // a low-gravity hop, off the ground
      if (a.tilt) world.avatar.rotation.x = a.tilt;           // a pratfall
      else world.avatar.rotation.x = 0;
      if (a.spin) world.avatar.rotation.y += a.spin;
    }
    for (const id in tools) tools[id].visible = false;
    if (a) world.figure.hold(f.held || [null, null], tools);
    for (const [id, at] of Object.entries(f.ground || {})) {
      const g = tools[id]; if (!g) continue;
      if (g.parent !== scene) scene.add(g);
      layDown(THREE, g, id, at); g.visible = true;
    }
    world.avatar.updateMatrixWorld(true);
    weldSparks(!!f.weld, dt);
    lamp.intensity = f.lamp ?? (f.inside ? 6 : 10);
    interior.group.visible = !!f.inside;
    const c = f.cam;
    camera.fov = c.fov || 40; camera.aspect = W / H; camera.updateProjectionMatrix();
    pos.set(...c.pos); look.set(...c.look);
    camera.position.copy(pos);
    camera.up.copy(up);
    camera.lookAt(look);
    if (c.roll) camera.rotateZ(c.roll);
    if (!f.inside) world.follow(look.x, look.z); // the sun's shadow box follows what the camera looks at
    renderer.render(scene, camera);
    last = f;
    return canvas.toDataURL('image/jpeg', 0.93);
  },
};
// Wait for the NASA models: the world asks for them as it builds; give them time to arrive and settle.
window.filmReady = new Promise(r => setTimeout(r, 6000));
