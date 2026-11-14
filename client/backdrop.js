// The landing page's backdrop: the base as it stands before the shift starts, nothing broken, with a
// camera drifting slowly past it. It is the game's own world (client/world.js), so the habitat, the
// solar array, the rover, the NASA models (the Apollo LM and the Viking lander on the skyline, the
// comms dish) and the real south-pole terrain are exactly what the players will stand in.
//
//   const bd = startBackdrop(canvas, { onReady, onGiveUp });  bd.pause(true|false)
//
// onReady fires once the first frames are drawn (the page fades the canvas in over its still
// picture). onGiveUp fires if this device cannot draw it smoothly; the still picture then stays.
import * as THREE from 'three';
import { buildWorld } from '/world.js';
import { PLACES } from '/shared/config.js';

// One slow sweep on the south-east side of the base, looking north-west: the habitat and the Apollo
// lander against the sky, Earth low over the skyline to their right, the sun raking in from the west
// so every crater and strut throws a long shadow. The page's words sit on the left, over the dark
// side of the picture, so the camera keeps what matters in the right two-thirds of the frame.
const LOOP = 110;                        // seconds for one there-and-back sweep
const CENTRE = { x: 0, z: -2 };          // what the camera swings around
const RADIUS = 22;
const SWEEP = [0.25, -0.12];             // radians either side of due south, starting east; clear of the solar array and the drill
const HEIGHT = [1.9, 4.6];               // metres: low, so the base stands against the sky
const AIM = 0.16;                        // radians: look this far left of the habitat, so it sits right of centre
const HAB_Y = 2.2;                       // the height on the habitat the camera aims at

// Where the camera is at time t (seconds). The still picture is t = 0: the shot the page opens on.
export function shot(t, pos, look) {
  const u = 0.5 - 0.5 * Math.cos((t / LOOP) * Math.PI * 2);               // 0 -> 1 -> 0, easing at the ends
  const a = SWEEP[0] + (SWEEP[1] - SWEEP[0]) * u;
  const h = HEIGHT[0] + (HEIGHT[1] - HEIGHT[0]) * (0.5 - 0.5 * Math.cos((t / (LOOP * 0.62)) * Math.PI * 2));
  pos.set(CENTRE.x + Math.sin(a) * RADIUS, h, CENTRE.z + Math.cos(a) * RADIUS);
  // The line to the habitat (at the origin), turned left by AIM.
  const dx = -pos.x, dz = -pos.z, c = Math.cos(AIM), s = Math.sin(AIM);
  look.set(pos.x + dx * c + dz * s, HAB_Y + h * 0.12, pos.z - dx * s + dz * c);
}

export function startBackdrop(canvas, { onReady, onGiveUp } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { onGiveUp?.('no WebGL'); return { pause() {}, stop() {} }; }
  let ratio = Math.min(devicePixelRatio, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 2600);
  const world = buildWorld(THREE, scene, { renderer });
  // The rover parked by the array, and an astronaut standing by the locker, looking out.
  world.moveRover({ x: PLACES.rover.x, z: PLACES.rover.z, ry: -0.5 }, 1);
  world.avatar.visible = true;
  world.avatar.position.set(PLACES.locker.x + 1.6, world.height(PLACES.locker.x + 1.6, PLACES.locker.z + 2.2), PLACES.locker.z + 2.2);
  world.avatar.rotation.y = 2.6;

  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  function size() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // A tall phone screen keeps the base in shot by widening the view, not by cropping it.
    camera.fov = camera.aspect < 1 ? 70 : 48;
    camera.updateProjectionMatrix();
  }
  size();
  addEventListener('resize', size);

  // Watch the first few seconds: a device that cannot keep up draws less, then gives up.
  const start = performance.now();
  let frames = 0, slowFor = 0, ready = false, paused = false, gone = false, last = start;
  function frame() {
    const now = performance.now(), ms = now - last;
    last = now;
    shot((now - start) / 1000, pos, look);
    camera.position.copy(pos);
    camera.lookAt(look);
    world.update(now / 1000);
    renderer.render(scene, camera);
    frames++;
    if (!ready && frames >= 12) { ready = true; onReady?.(); }
    if (frames > 20 && frames < 400) {
      slowFor = ms > 70 ? slowFor + 1 : Math.max(0, slowFor - 1);
      if (slowFor > 30 && ratio > 0.6) { ratio = Math.max(0.6, ratio * 0.7); renderer.setPixelRatio(ratio); size(); renderer.shadowMap.autoUpdate = false; slowFor = 0; }
      else if (slowFor > 30) { stop(); onGiveUp?.('too slow'); }
    }
  }
  function run() { renderer.setAnimationLoop(paused || gone || document.hidden ? null : frame); last = performance.now(); }
  function stop() { gone = true; run(); }
  document.addEventListener('visibilitychange', run); // nothing is drawn while the tab is hidden
  run();

  window.moonbase = { ...(window.moonbase || {}), backdrop: { renderer, scene, camera, world, get frames() { return frames; } } };
  return { pause(on) { paused = on; run(); }, stop };
}
