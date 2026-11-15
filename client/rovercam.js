// The Technician's two rover cameras: the same world as the astronaut's, seen from the Scout (left) and the
// Hauler (right). One renderer, one copy of the world, drawn twice into the two halves of one canvas, at most
// 30 frames a second: the 2-player seat runs this beside everything else.
import * as THREE from 'three';
import { buildWorld } from '/world.js';

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
  let last = 0;
  renderer.setAnimationLoop(ms => {
    if (ms - last < 33) return;
    const dt = Math.min(0.5, (ms - last) / 1000);
    last = ms;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== w || canvas.height !== h)) renderer.setSize(w, h, false);
    const s = getState();
    if (!w || !h || !s || !s.rovers || document.hidden) return;
    world.moveRovers(s.rovers, 1 - Math.exp(-dt * 10));
    world.update(ms / 1000);
    if (s.scene) world.apply(s.scene, ms / 1000);
    const a = s.astro;
    world.avatar.visible = !!a && s.crew.includes('astronaut') && !a.inside;
    if (a) {
      world.avatar.position.set(a.x, world.height(a.x, a.z) + (a.riding ? 0.45 : 0), a.z);
      world.avatar.rotation.y = a.ry; world.avatar.scale.y = Math.min(1, a.h / 1.65);
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
