// Technician's rover camera: the same world as the astronaut's, seen from the rover.
import * as THREE from 'three';
import { buildWorld } from '/world.js';

export function startRoverCam(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const world = buildWorld(THREE, scene, { shadows: false, renderer });
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2600);
  world.rover.add(camera);
  camera.position.set(0, 1.9, 0.9);
  camera.rotation.set(-0.12, Math.PI, 0, "YXZ"); // look along the rover's +z, tipped slightly down

  renderer.setAnimationLoop(ms => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    // Nothing arrives during a blackout (no rover, no scene), and there is nothing to draw while the tab is hidden.
    const s = getState();
    if (!w || !h || !s || !s.rover) return;
    world.moveRover(s.rover);
    world.update(ms / 1000);
    if (s.scene) world.apply(s.scene, ms / 1000);
    world.avatar.visible = !!s.astro && s.crew.includes('astronaut');
    if (s.astro) { world.avatar.position.set(s.astro.x, 0, s.astro.z); world.avatar.rotation.y = s.astro.ry; world.avatar.scale.y = Math.min(1, s.astro.h / 1.65); }
    renderer.render(scene, camera);
  });
}
