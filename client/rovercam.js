// The Technician's two rover cameras: the same world as the astronaut's, seen from the Scout (left) and the
// Hauler (right). One renderer, one copy of the world, drawn twice into the two halves of one canvas, at most
// 30 frames a second: the 2-player seat runs this beside everything else. The astronaut is a figure that
// walks, crouches and reaches (client/avatar.js), with the tools in their hands, and any tool lying out on
// the surface lies where it came to rest.
import * as THREE from 'three';
import { buildWorld } from '/world.js';
import { buildTools, layDown } from '/tools.js';

export const CAMS = ['scout', 'hauler'];
export function startRoverCam(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setScissorTest(true);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const world = buildWorld(THREE, scene, { shadows: false, renderer });
  const cams = {};
  for (const id of CAMS) {
    const cam = new THREE.PerspectiveCamera(70, 4 / 3, 0.1, 2600);
    cam.rotation.order = 'YXZ';
    const r = world.rovers[id];
    if (id === 'scout') { cam.position.set(0.3, 1.8, 0.55); cam.rotation.set(-0.16, Math.PI, 0); } // the mast camera, looking ahead
    else { cam.position.set(0, 1.9, 0.9); cam.rotation.set(-0.12, Math.PI, 0); }                    // the Hauler's, over the console
    r.add(cam); cams[id] = cam;
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
      cam.aspect = cw / h; cam.updateProjectionMatrix();
      renderer.setViewport(x, 0, cw, h); renderer.setScissor(x, 0, cw, h);
      renderer.render(scene, cam);
    });
  });
  return { world };
}
