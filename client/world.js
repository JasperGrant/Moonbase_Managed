// The Moon base scene. Shared by the astronaut (VR) and the Technician's rover camera,
// so both see the same place. Everything is built from simple shapes: swap in real
// models here later without touching the game logic.
import { CFG, STATIONS } from '/shared/config.js';

export function buildWorld(THREE, scene, { shadows = true } = {}) {
  // Deterministic random, so every client scatters the same rocks in the same spots.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  scene.background = new THREE.Color(0x000000);

  // Sun low on the horizon, as at the lunar south pole: long shadows, harsh contrast.
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.position.set(-70, 11, 30);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0015;
  }
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x5f7fb0, 0x101010, 0.22)); // faint earthshine fill

  // Stars
  const starPos = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    starPos.set([r * Math.cos(a) * 900, Math.abs(u) * 900 + 5, r * Math.sin(a) * 900], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false })));

  // Earth, low over the northern horizon
  // Lit by the same sun as the ground, so it shows a phase instead of a flat disc.
  const earth = new THREE.Mesh(new THREE.SphereGeometry(26, 32, 16), new THREE.MeshLambertMaterial({ color: 0x4d86e0, emissive: 0x0a1630 }));
  earth.position.set(140, 70, -640);
  scene.add(earth);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(27.5, 32, 16), new THREE.MeshBasicMaterial({ color: 0x9cc4ff, transparent: true, opacity: 0.18, side: THREE.BackSide }));
  haze.position.copy(earth.position);
  scene.add(haze);

  // Ground: flat around the base, rolling hills further out.
  const height = (x, z) => {
    const r = Math.hypot(x, z);
    const k = Math.min(1, Math.max(0, (r - 18) / 14));
    return k * k * (3.2 * Math.sin(x * 0.07) * Math.cos(z * 0.06) + 1.3 * Math.sin(x * 0.19 + 1.3) * Math.sin(z * 0.16) + 2.5);
  };
  const groundGeo = new THREE.PlaneGeometry(300, 300, 110, 110);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, height(gp.getX(i), gp.getZ(i)) + (rnd() - 0.5) * 0.06);
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x8b8a86, roughness: 1, metalness: 0, flatShading: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Scattered rocks (one draw call)
  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6f6e6a, roughness: 1, flatShading: true }), 90);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = 5 + rnd() * 40, s = 0.12 + rnd() * rnd() * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    e.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m4.compose(v.set(x, height(x, z) + s * 0.3, z), q.setFromEuler(e), sc.set(s, s * 0.7, s));
    rocks.setMatrixAt(i, m4);
  }
  rocks.castShadow = true; rocks.receiveShadow = true;
  scene.add(rocks);

  const white = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.4, metalness: 0.6 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Habitat at the origin
  const hab = new THREE.Group();
  mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.6, 20), white, 0, 0.8, 0, hab);
  mesh(new THREE.SphereGeometry(2.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 1.6, 0, hab);
  mesh(new THREE.BoxGeometry(1.4, 2.1, 1.2), grey, 0, 1.05, 2.6, hab); // airlock, faces the spawn point
  mesh(new THREE.BoxGeometry(0.9, 0.5, 0.05), new THREE.MeshBasicMaterial({ color: 0xffc46b }), 0, 1.5, 3.22, hab); // lit window
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), grey, 1.2, 4.2, 0, hab); // antenna mast
  scene.add(hab);

  // Decorative solar farm to the south-east
  for (let i = 0; i < 3; i++) {
    const p = mesh(new THREE.BoxGeometry(2.4, 0.06, 1.4), new THREE.MeshStandardMaterial({ color: 0x1f3f8f, roughness: 0.3, metalness: 0.5 }), 8 + i * 2.8, 1.5, 10);
    p.rotation.z = 0.9;
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), grey, 8 + i * 2.8, 0.75, 10);
  }

  // Stations: one group per minigame. Local +z is the side the astronaut stands on.
  const stations = {}, alarms = {};
  for (const [key, st] of Object.entries(STATIONS)) {
    const g = new THREE.Group();
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.ry;
    scene.add(g);
    stations[key] = g;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), grey, 0.85, 1.2, -0.1, g);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1c3a22 }));
    lamp.position.set(0.85, 2.45, -0.1);
    g.add(lamp);
    alarms[key] = lamp;
  }
  // Fuel depot: two tanks
  for (const dx of [-0.9, 0.9]) {
    const t = mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.6, 14), white, dx, 0.9, -1.6, stations.wires);
    t.rotation.x = Math.PI / 2;
    const band = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0xd9662b }), dx, 0.9, -1.6, stations.wires);
    band.rotation.x = Math.PI / 2;
  }
  // Comms dish
  mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.6, 8), grey, 0, 1.3, -1.6, stations.freq);
  const dish = mesh(new THREE.ConeGeometry(1.5, 0.5, 20, 1, true), white, 0, 3.0, -1.6, stations.freq);
  dish.material = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.6, side: THREE.DoubleSide });
  dish.rotation.x = -2.2;
  // Drill rig: tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), grey, Math.sin(a) * 0.6, 2, -1.8 + Math.cos(a) * 0.6, stations.drill);
    leg.rotation.set(-Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); // lean in, so the tops meet above the drill
  }
  mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 8), gold, 0, 1.5, -1.8, stations.drill);
  // Airlock terminal: a pedestal
  mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), grey, 0, 0.25, -0.3, stations.patch);

  // Rover (model faces +z). Its lights are what the astronaut follows in the dark.
  const rover = new THREE.Group();
  mesh(new THREE.BoxGeometry(1.5, 0.35, 2.4), white, 0, 0.7, 0, rover);
  mesh(new THREE.BoxGeometry(1.1, 0.5, 0.9), gold, 0, 1.1, -0.4, rover);
  for (const [x, z] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) {
    const w = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12), dark, x, 0.38, z, rover);
    w.rotation.z = Math.PI / 2;
  }
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), grey, 0.5, 1.6, -0.9, rover);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
  beacon.position.set(0.5, 2.25, -0.9);
  rover.add(beacon);
  for (const x of [-0.5, 0.5]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffee }));
    h.position.set(x, 0.8, 1.22);
    rover.add(h);
  }
  const head = new THREE.SpotLight(0xffffff, 30, 18, 0.55, 0.6);
  head.position.set(0, 1, 1.2);
  head.target.position.set(0, 0.2, 6);
  rover.add(head, head.target);
  rover.position.set(4, 0, 9);
  scene.add(rover);

  // Astronaut figure, shown in the rover camera
  const avatar = new THREE.Group();
  mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), white, 0, 0.95, 0, avatar);
  mesh(new THREE.SphereGeometry(0.24, 12, 10), white, 0, 1.72, 0, avatar);
  mesh(new THREE.SphereGeometry(0.19, 12, 10), gold, 0, 1.72, 0.1, avatar);
  mesh(new THREE.BoxGeometry(0.45, 0.6, 0.25), grey, 0, 1.2, -0.3, avatar);
  avatar.visible = false;
  scene.add(avatar);

  return {
    stations, rover, avatar, sun,
    // Call every frame. `live` is the list of station keys with an active alarm.
    update(time, live = []) {
      const blink = Math.floor(time * 4) % 2 === 0;
      for (const key in alarms) alarms[key].material.color.setHex(live.includes(key) ? (blink ? 0xff2a2a : 0x4a0b0b) : 0x1c3a22);
      beacon.material.color.setHex(Math.floor(time * 2) % 2 ? 0xffb030 : 0x4a3008);
    },
    // Ease the rover toward the server's position.
    moveRover(r, k = 0.2) {
      rover.position.x += (r.x - rover.position.x) * k;
      rover.position.z += (r.z - rover.position.z) * k;
      let d = r.ry - rover.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      rover.rotation.y += d * k;
    },
  };
}
