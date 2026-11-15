// The five tools, as models. The astronaut's page (client/stations.js) holds one set; the rover camera
// (client/rovercam.js) draws its own copy, in the figure's hands and lying on the ground.
//
// Each tool is modelled in the hand: local -z points away from the hand. userData.tip is the working end,
// userData.hit the box that can be pointed at ([w, h, d, z offset]).
import { PAL } from '/shared/palette.js';
import { loadPeriod } from '/shared/assets.js';

// How each tool lies on the ground once it has come to rest: its rotation ([x, z] in radians, the yaw is
// where it landed facing) and how high its origin then sits above the ground, in metres.
export const REST = {
  brush:  { turn: [0, Math.PI / 2], y: 0.035 },  // on its side, bristles sideways
  patch:  { turn: [-Math.PI / 2, 0], y: 0.012 }, // flat on its back
  welder: { turn: [0, Math.PI / 2], y: 0.035 },  // on its side, grip out
  tire:   { turn: [0, Math.PI / 2], y: 0.1 },    // flat, like a dropped wheel
  gen:    { turn: [0, 0], y: 0.19 },             // upright on its skid
};
// Roughly how big each one is, for bouncing it off the ground and for the ring round it: metres.
export const RADIUS = { brush: 0.12, patch: 0.08, welder: 0.12, tire: 0.32, gen: 0.25 };

export function buildTools(THREE) {
  // Painted steel and moulded handles: rough, barely metallic. Bare steel: smoother and metallic.
  const paint = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...o });
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m; };
  const orange = PAL.hex.orange, steel = PAL.hex.aluminium, dark = PAL.hex.bakelite;
  const tools = {};
  {
    const g = new THREE.Group();                                   // brush
    add(g, new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), paint(orange), 0, 0, -0.08).rotation.x = Math.PI / 2;
    add(g, new THREE.BoxGeometry(0.2, 0.035, 0.05), paint(dark, { roughness: 0.6 }), 0, 0, -0.22);
    add(g, new THREE.BoxGeometry(0.19, 0.03, 0.07), paint(PAL.hex.dial, { roughness: 1, metalness: 0 }), 0, 0, -0.28);
    g.userData = { tip: new THREE.Vector3(0, 0, -0.3), hit: [0.26, 0.12, 0.44, -0.12] };
    tools.brush = g;
  }
  {
    const g = new THREE.Group();                                   // patch kit
    add(g, new THREE.BoxGeometry(0.15, 0.15, 0.02), paint(orange), 0, 0, -0.06);
    add(g, new THREE.BoxGeometry(0.1, 0.03, 0.024), paint(PAL.hex.dial, { metalness: 0 }), 0, 0, -0.06);
    add(g, new THREE.BoxGeometry(0.03, 0.1, 0.024), paint(PAL.hex.dial, { metalness: 0 }), 0, 0, -0.06);
    g.userData = { tip: new THREE.Vector3(0, 0, -0.07), hit: [0.2, 0.2, 0.12, -0.06] };
    tools.patch = g;
  }
  {
    // Welder: NASA's pistol-grip power tool (docs/ASSETS.md), held by its grip with the bit forward. The
    // model's bit runs along +z, so it is turned round; the grip sits on the hand, the bit tip 0.27 m ahead.
    const g = new THREE.Group();
    const body = new THREE.Group(); body.name = 'Body'; g.add(body);
    add(body, new THREE.BoxGeometry(0.045, 0.14, 0.05), paint(dark), 0, -0.06, 0);     // stand-in until the model loads
    add(body, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), paint(orange), 0, 0.02, -0.1).rotation.x = Math.PI / 2;
    loadPeriod(THREE, 'pistol-grip-tool', { rough: 0.7, metal: 0.25 }).then(m => {
      m.rotation.y = Math.PI; m.position.set(0, 0.02, -0.075);
      body.clear(); body.add(m);
    }).catch(e => console.warn('welder model', e));
    const TIP = new THREE.Vector3(0, 0.107, -0.27);
    const spark = add(g, new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.hex.incandescent, toneMapped: false }), TIP.x, TIP.y, TIP.z - 0.02);
    spark.name = 'Spark';
    spark.visible = false; // no light of its own: every extra light costs the Quest on every pixel
    g.userData = { tip: TIP, hit: [0.1, 0.3, 0.42, -0.07], spark };
    tools.welder = g;
  }
  {
    const g = new THREE.Group();                                   // space tire: the rover's wheel, new
    add(g, new THREE.TorusGeometry(0.32, 0.09, 10, 24), paint(dark, { roughness: 0.95, metalness: 0 })).rotation.y = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const sp = add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), paint(steel, { roughness: 0.4, metalness: 0.9 }));
      sp.rotation.x = i * Math.PI / 6;
    }
    add(g, new THREE.TorusGeometry(0.32, 0.02, 6, 24), paint(orange)).rotation.y = Math.PI / 2;
    g.userData = { tip: new THREE.Vector3(0, 0, 0), hit: [0.3, 0.86, 0.86, 0] };
    tools.tire = g;
  }
  {
    const g = new THREE.Group();                                   // backup generator, with its pull cord
    add(g, new THREE.BoxGeometry(0.42, 0.3, 0.3), paint(PAL.hex.hazard, { metalness: 0.3 }));
    add(g, new THREE.BoxGeometry(0.46, 0.04, 0.34), paint(dark), 0, -0.17, 0);
    add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), paint(dark), -0.1, 0.18, 0);
    add(g, new THREE.TorusGeometry(0.05, 0.014, 6, 14), paint(PAL.hex.red), 0.12, 0.2, 0);
    g.userData = { tip: new THREE.Vector3(0, 0, 0), hit: [0.5, 0.45, 0.4, 0] };
    tools.gen = g;
  }
  for (const id in tools) { tools[id].name = 'Tool_' + id; tools[id].userData.id = id; }
  return tools;
}

// Put a tool where it lies: on the ground at (x, y, z), turned to yaw ry, in its resting pose.
export function layDown(THREE, g, id, { x, y, z, ry = 0 }) {
  const r = REST[id];
  g.position.set(x, y, z);
  g.quaternion.setFromEuler(new THREE.Euler(r.turn[0], ry, r.turn[1], 'YXZ'));
  g.scale.setScalar(1);
}
