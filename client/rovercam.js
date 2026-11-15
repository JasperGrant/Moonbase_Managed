// Technician's rover camera: the same world as the astronaut's, seen from the rover. The astronaut is a
// figure that walks, crouches and reaches (client/avatar.js), with the tools in their hands, and any tool
// lying out on the surface lies where it came to rest.
import * as THREE from 'three';
import { buildWorld } from '/world.js';
import { buildTools, layDown } from '/tools.js';

export function startRoverCam(canvas, getState) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const world = buildWorld(THREE, scene, { shadows: false, renderer });
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2600);
  world.rover.add(camera);
  camera.position.set(0, 1.9, 0.9);
  camera.rotation.set(-0.12, Math.PI, 0, "YXZ"); // look along the rover's +z, tipped slightly down
  const tools = buildTools(THREE);
  let last = 0;

  renderer.setAnimationLoop(ms => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio()))) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const t = ms / 1000, dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    // Nothing arrives during a blackout (no rover, no scene), and there is nothing to draw while the tab is hidden.
    const s = getState();
    if (!w || !h || !s || !s.rover) return;
    world.moveRover(s.rover);
    world.update(t);
    if (s.scene) world.apply(s.scene, t);
    // Inside the habitat the astronaut is out of the camera's sight.
    world.avatar.visible = !!s.astro && s.crew.includes('astronaut') && !s.astro.inside;
    if (s.astro) world.figure.update(dt, s.astro);
    const kit = s.scene?.tools || { held: [null, null], ground: {} };
    for (const id in tools) tools[id].visible = false;
    if (world.avatar.visible) world.figure.hold(kit.held, tools);
    for (const [id, at] of Object.entries(kit.ground)) {
      const g = tools[id];
      if (!g) continue;
      if (g.parent !== scene) scene.add(g);
      layDown(THREE, g, id, at); g.visible = true;
    }
    renderer.render(scene, camera);
  });
}
