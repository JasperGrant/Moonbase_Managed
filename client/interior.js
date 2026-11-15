// The inside of the habitat: one industrial hall the astronaut reaches through the airlock hatch.
// It is bigger than the dome outside (12 m by 7 m), which nobody can tell because the two are never
// on screen together: the room is built far off to one side and the player is moved there in a fade.
//
// Room coordinates (metres): the airlock hatch is at x 0, z 0. North is -z, west is -x.
// The hall runs to z -12, a corridor stub carries on to z -15 along the east wall.
//
// Built for the Quest browser: almost everything is one of four instanced batches (boxes, cylinders,
// glowing boxes, soft shadow blobs), the walls and floor are one mesh each, and nothing casts a
// shadow. The light fixtures are glowing boxes; three real lights do the lighting, and they change
// intensity rather than switch on and off so no shader is ever recompiled mid-game.
import { CFG, PLACES } from '/shared/config.js';
import { buildAirlock, CHAMBER } from '/airlock.js';
import { PAL } from '/shared/palette.js';
import { loadPeriod, loadGlove } from '/shared/assets.js';
import { buildDamage } from '/damage.js';

export const ROOM = {
  origin: { x: 500, z: 0 },          // where the room sits in the world, well clear of the terrain
  arrive: { x: 0, z: -1.3 },         // where the astronaut stands after coming in
  height: 3.2,
  panel: { x: -3.44, z: -7.7 },      // the power junction box, on the west wall
};
export const HALL = { x0: -3.5, x1: 3.5, z0: -12, z1: 0 };
export const COR = { x0: 1.5, x1: 3.5, z0: -15, z1: -12 };
const H = ROOM.height, CH = 2.6;     // hall and corridor ceiling heights
const BODY = 0.3;                    // how close a head may get to a wall or a bench
// Things you cannot walk through: [x0, x1, z0, z1, top]. The top is for the tools' physics (client/physics.js).
export const SOLIDS = [
  [-2.0, 1.5, -4.9, -4.0, 0.96],     // workbench, long arm
  [-2.0, -1.1, -6.5, -4.9, 0.96],    // workbench, short arm
  [2.9, 3.5, -3.05, -0.95, 2.06],    // suit lockers
  [2.9, 3.5, -0.95, -0.05, 1.85],    // the empty pressure suit beside them
  [-3.5, -1.95, -12, -10.25, 1.78],  // life support stack
];
// The four doors, in room coordinates: each is the inner hatch of an airlock chamber whose twin is on the
// habitat outside (PLACES.doors). The opening in the wall is the chamber's doorway.
const DOOR_W = CHAMBER.door.hw * 2, DOOR_H = CHAMBER.door.hh;
const ROOF_ROWS = [-1.5, -4.2, -6.9, -9.6]; // z of each row of roof lights (two lights per row)

export function buildInterior(THREE, scene, { sfx = () => {} } = {}) {
  const group = new THREE.Group();
  group.position.set(ROOM.origin.x, 0, ROOM.origin.z);
  scene.add(group);

  // ---------- textures, drawn once on a canvas ----------
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  function texture(size, paint) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    paint(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }
  // Wall: one tile is 4 m wide and the full 3.2 m high. Panels 1 m wide with heavy seams, a dark
  // kick band, a grab-rail line, rivets, stencils and pencil-like scuffs, after the concept sketch.
  const wallTex = texture(1024, (g, S) => {
    const y = m => S - (m / H) * S; // metres above the floor -> canvas row
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, '#b3ad9e'); grad.addColorStop(0.12, '#cfc8b6'); grad.addColorStop(0.7, '#c4bdac'); grad.addColorStop(1, '#958f80');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    g.fillStyle = '#4c5652'; g.fillRect(0, y(0.38), S, S - y(0.38));               // kick band
    g.fillStyle = '#3f4a47'; g.fillRect(0, y(0.38) - 5, S, 5);
    for (let i = 0; i < 4; i++) {                                                   // panel seams
      const x = i * 256;
      g.fillStyle = '#5e5a50'; g.fillRect(x - 3, 0, 6, S);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3, 0, 2, S);
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x + 5, 0, 14, S);
    }
    for (const m of [1.05, 2.3]) { g.fillStyle = '#5e5a50'; g.fillRect(0, y(m) - 2, S, 4); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, y(m) + 2, S, 2); }
    g.fillStyle = '#4a463e';
    for (let i = 0; i < 4; i++) for (const m of [0.5, 0.95, 1.15, 2.2, 2.4, 3.05]) for (const dx of [20, 236]) { g.beginPath(); g.arc(i * 256 + dx, y(m), 4, 0, 7); g.fill(); }
    // inset service hatch and a vent grille, one of each per tile
    g.strokeStyle = '#5e5a50'; g.lineWidth = 5; g.strokeRect(300, y(2.0), 170, 200); g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(300, y(2.0), 170, 200);
    g.fillStyle = '#3c3a33'; for (let i = 0; i < 9; i++) g.fillRect(820, y(2.95) + i * 14, 150, 7);
    g.fillStyle = 'rgba(40,44,48,0.75)'; g.font = 'bold 34px monospace'; g.fillText('HAB-01', 40, y(2.55)); g.font = 'bold 22px monospace'; g.fillText('B4  115V', 560, y(1.2)); g.fillText('NO STEP', 310, y(1.35));
    g.fillStyle = '#b08a1f'; g.fillRect(540, y(1.5), 180, 12);                       // one yellow caution strip
    for (let i = 0; i < 50; i++) {                                                  // a few light scuffs: it is kept clean
      const x = rnd() * S, yy = rnd() * S, len = 10 + rnd() * 70, a = (rnd() - 0.5) * 0.5 + (rnd() < 0.5 ? 0 : Math.PI / 2);
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '30,32,36' : '255,255,255'},${0.03 + rnd() * 0.05})`; g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + Math.cos(a) * len, yy + Math.sin(a) * len); g.stroke();
    }
  });
  // Floor: one tile is 4 m square. Deck plates 1 m square with seams, bolts and stains.
  const floorTex = texture(1024, (g, S) => {
    g.fillStyle = '#8d8a80'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = Math.round((rnd() - 0.5) * 16);
      g.fillStyle = `rgb(${141 + v},${138 + v},${128 + v})`; g.fillRect(i * 256, j * 256, 256, 256);
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2; g.strokeRect(i * 256 + 26, j * 256 + 26, 204, 204);
      g.fillStyle = '#5e5a50'; for (const [dx, dy] of [[14, 14], [242, 14], [14, 242], [242, 242]]) { g.beginPath(); g.arc(i * 256 + dx, j * 256 + dy, 5, 0, 7); g.fill(); }
    }
    for (let i = 0; i <= 4; i++) { g.fillStyle = '#5a564c'; g.fillRect(i * 256 - 3, 0, 6, S); g.fillRect(0, i * 256 - 3, S, 6); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(i * 256 + 3, 0, 2, S); g.fillRect(0, i * 256 + 3, S, 2); }
    for (let i = 0; i < 10; i++) {
      const x = rnd() * S, yy = rnd() * S, r = 20 + rnd() * 90, rg = g.createRadialGradient(x, yy, 0, x, yy, r);
      rg.addColorStop(0, `rgba(30,32,36,${0.03 + rnd() * 0.05})`); rg.addColorStop(1, 'rgba(30,32,36,0)');
      g.fillStyle = rg; g.fillRect(x - r, yy - r, r * 2, r * 2);
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, yy = rnd() * S, len = 8 + rnd() * 60, a = rnd() * 7;
      g.strokeStyle = `rgba(${rnd() < 0.6 ? '25,27,30' : '255,255,255'},${0.03 + rnd() * 0.05})`; g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + Math.cos(a) * len, yy + Math.sin(a) * len); g.stroke();
    }
  });

  // ---------- walls and floor: one mesh each, built from quads ----------
  function quads() {
    const pos = [], nor = [], uv = [], idx = [];
    return {
      // Corners a b c d go round the quad; the normal says which side is the front.
      add(a, b, c, d, n, uvs) {
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
        const front = cx * n[0] + cy * n[1] + cz * n[2] > 0, base = pos.length / 3;
        for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) { pos.push(...p); nor.push(...n); uv.push(...t); }
        idx.push(...(front ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(i => base + i));
      },
      mesh(mat) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        const m = new THREE.Mesh(geo, mat); group.add(m); return m;
      },
    };
  }
  const walls = quads(), floor = quads();
  let run = 0; // running distance along the walls, so the panel pattern does not restart on every wall
  function wall(x0, z0, x1, z1, y0, y1, nx, nz) {
    if ((x1 - x0) * nz - (z1 - z0) * nx < 0) [x0, z0, x1, z1] = [x1, z1, x0, z0]; // left to right as seen from the room, so stencils read the right way
    const len = Math.hypot(x1 - x0, z1 - z0), u0 = run / 4, u1 = (run + len) / 4; run += len;
    walls.add([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [nx, 0, nz], [[u0, y0 / H], [u1, y0 / H], [u1, y1 / H], [u0, y1 / H]]);
  }
  // A wall with door openings cut in it: `doors` are positions along the wall (x for a wall that runs
  // along x, z for one along z). Left of the door, over it, right of it.
  function wallWithDoors(x0, z0, x1, z1, y0, y1, nx, nz, doors) {
    const alongX = z0 === z1, a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const seg = (a, b, ya, yb) => alongX ? wall(a, z0, b, z0, ya, yb, nx, nz) : wall(x0, a, x0, b, ya, yb, nx, nz);
    let a = a0;
    for (const d of [...doors].sort((p, q) => p - q)) { seg(a, d - DOOR_W / 2, y0, y1); seg(d - DOOR_W / 2, d + DOOR_W / 2, DOOR_H, y1); a = d + DOOR_W / 2; }
    seg(a, a1, y0, y1);
  }
  const D_ = PLACES.doors;
  wallWithDoors(HALL.x0, 0, HALL.x1, 0, 0, H, 0, -1, [D_.S.hall.x]);       // south, with airlock S and the window
  wallWithDoors(HALL.x0, HALL.z0, HALL.x0, 0, 0, H, 1, 0, [D_.W.hall.z]);  // west, with airlock W and the junction box
  wall(HALL.x0, HALL.z0, COR.x0, HALL.z0, 0, H, 0, 1);       // north, up to the corridor opening
  wall(COR.x0, HALL.z0, COR.x1, HALL.z0, CH, H, 0, 1);       // header over the opening
  wallWithDoors(HALL.x1, 0, HALL.x1, COR.z0, 0, H, -1, 0, [D_.E.hall.z]); // east, hall and corridor, with airlock E
  wall(COR.x0, COR.z0, COR.x0, COR.z1, 0, CH, 1, 0);         // corridor west
  wallWithDoors(COR.x0, COR.z0, COR.x1, COR.z0, 0, CH, 0, 1, [D_.N.hall.x]); // corridor end, with airlock N
  for (const r of [HALL, COR]) floor.add([r.x0, 0, r.z1], [r.x1, 0, r.z1], [r.x1, 0, r.z0], [r.x0, 0, r.z0], [0, 1, 0],
    [[r.x0 / 4, r.z1 / 4], [r.x1 / 4, r.z1 / 4], [r.x1 / 4, r.z0 / 4], [r.x0 / 4, r.z0 / 4]]);
  walls.mesh(new THREE.MeshLambertMaterial({ map: wallTex }));
  floor.mesh(new THREE.MeshLambertMaterial({ map: floorTex }));

  // ---------- batches: every box, cylinder and glowing box is one instance of a shared mesh ----------
  const lists = { box: [], cyl: [], glow: [], blob: [] };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
  const put = (list, color, s, p, r) => { lists[list].push({ color, s, p, q: r instanceof THREE.Quaternion ? r.clone() : q.setFromEuler(e.set(r[0] || 0, r[1] || 0, r[2] || 0)).clone() }); return lists[list].length - 1; };
  const box = (color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put('box', color, [w, h, d], [x, y, z], [rx, ry, rz]);
  const cyl = (color, r, h, x, y, z, rx = 0, ry = 0, rz = 0) => put('cyl', color, [r, h, r], [x, y, z], [rx, ry, rz]);
  const glow = (color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put('glow', color, [w, h, d], [x, y, z], [rx, ry, rz]);
  const blob = (w, d, x, z, a = 1) => put('blob', a, [w, 1, d], [x, 0.012, z], [0, 0, 0]); // soft dark patch under furniture
  function tube(color, from, to, r) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), dir = b.clone().sub(a), len = dir.length();
    put('cyl', color, [r, len, r], a.add(b).multiplyScalar(0.5).toArray(), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  }
  const W = PAL.hex.enamel, G = PAL.hex.bezel, D = PAL.hex.console, K = PAL.hex.consoleDeep, O = PAL.hex.orange, Y = PAL.hex.hazard, R = 0xa8402f;

  // Ceilings, wall ribs, roof beams, skirting conduit
  box(0x6e675a, 7, 0.1, 12, 0, H + 0.05, -6);
  box(0x6e675a, 2, 0.1, 3, 2.5, CH + 0.05, -13.5);
  const inDoor = (x, z) => Object.values(PLACES.doors).some(d => Math.hypot(d.hall.x - x, d.hall.z - z) < DOOR_W / 2 + 0.2);
  for (let z = -1; z > -12; z -= 2) {
    for (const x of [-3.43, 3.43]) if (!inDoor(x, z)) box(G, 0.14, H, 0.2, x, H / 2, z);
    box(D, 7, 0.16, 0.2, 0, H - 0.08, z);
  }
  for (const x of [-3.45, 3.45]) box(D, 0.08, 0.12, 12, x, 0.06, -6);
  tube(G, [-3.3, 2.75, -0.2], [-3.3, 2.75, -7.3], 0.05); tube(D, [-3.33, 2.6, -0.2], [-3.33, 2.6, -5.0], 0.025); // the rest of this cable is in damage.js: it can tear loose
  tube(G, [3.3, 2.85, -3.3], [3.3, 2.85, -11.8], 0.06);

  // Roof light housings (the glowing strips themselves are a separate mesh, below)
  for (const z of ROOF_ROWS) for (const x of [-2.2, 2.2]) box(D, 0.36, 0.08, 1.56, x, H - 0.04, z);

  // The four airlock doors: a heavy frame round each opening on the hall side, hazard stripes on the
  // floor where the hatch swings, grab handles. The hatch itself belongs to the chamber (client/airlock.js).
  for (const d of Object.values(PLACES.doors)) {
    const { x, z, ry } = d.hall, c = Math.cos(ry), sn = Math.sin(ry);
    const at = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c]; // door-local (x across, z out of the hall) to room
    const fr = (w, h, dp, lx, y, lz) => { const [px, pz] = at(lx, lz); box(D, w, h, dp, px, y, pz, 0, ry, 0); };
    // Wholly on the hall side of the wall (lz < -0.012): reaching into the chamber, it fought the chamber's
    // own door collar and showed through round the hatch.
    fr(0.12, DOOR_H + 0.12, 0.1, -DOOR_W / 2 - 0.06, (DOOR_H + 0.12) / 2, -0.064); fr(0.12, DOOR_H + 0.12, 0.1, DOOR_W / 2 + 0.06, (DOOR_H + 0.12) / 2, -0.064);
    fr(DOOR_W + 0.24, 0.14, 0.1, 0, DOOR_H + 0.07, -0.064);
    for (const lx of [-DOOR_W / 2 - 0.2, DOOR_W / 2 + 0.2]) { const [a1, b1] = at(lx, -0.08); tube(G, [a1, 0.7, b1], [a1, 1.6, b1], 0.022); }
    const [sx, sz] = at(0, -0.62); box(Y, 1.3, 0.004, 0.1, sx, 0.004, sz, 0, ry, 0);
    for (const lx of [-0.62, 0.62]) { const [px, pz] = at(lx, -0.32); box(Y, 0.1, 0.004, 0.6, px, 0.004, pz, 0, ry, 0); }
  }

  // Suit lockers, east wall
  for (let i = 0; i < 4; i++) {
    const z = -1.25 - i * 0.5;
    box(W, 0.56, 2.0, 0.47, 3.2, 1.0, z); box(D, 0.02, 0.14, 0.3, 2.915, 1.7, z); box(D, 0.03, 0.2, 0.04, 2.91, 1.05, z + 0.17);
  }
  box(D, 0.6, 0.06, 2.1, 3.2, 2.03, -2.0); box(O, 0.4, 0.26, 0.5, 3.2, 2.19, -1.4); box(G, 0.45, 0.2, 0.6, 3.2, 2.16, -2.5);
  blob(1.3, 2.6, 3.1, -2.0);

  // The window on the south wall: a round viewport in a heavy collar, looking out at the Moon from the
  // painted window on Segment C of the habitat (astronaut.js draws the view through it).
  const WIN = PLACES.window.hall;
  const win = new THREE.Group(); win.position.set(WIN.x, WIN.y, WIN.z); win.rotation.y = WIN.ry + Math.PI; win.name = 'Window_Hall'; group.add(win); // local +z into the hall
  {
    const collar = new THREE.Mesh(new THREE.LatheGeometry([[0.2, 0], [0.27, 0], [0.29, 0.03], [0.28, 0.08], [0.22, 0.09], [0.2, 0.06]].map(([r, y]) => new THREE.Vector2(r, y)), 28), new THREE.MeshLambertMaterial({ color: G }));
    collar.rotation.x = Math.PI / 2; win.add(collar);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6), new THREE.MeshLambertMaterial({ color: D })); bolt.rotation.x = Math.PI / 2; bolt.position.set(Math.cos(a) * 0.245, Math.sin(a) * 0.245, 0.09); win.add(bolt); }
    const lampW = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.hex.amberOff, toneMapped: false })); lampW.position.set(0.36, 0.2, 0.03); win.add(lampW);
    win.userData.lamp = lampW;
  }
  const windowGlass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 28), new THREE.MeshBasicMaterial({ color: 0x1d1c19 }));
  windowGlass.position.z = 0.02; windowGlass.name = 'Window_Glass'; win.add(windowGlass);

  // Workbench island: an L of two heavy benches with drawers and a gauge. Kept tidy: a working lab.
  box(D, 3.4, 0.1, 0.8, -0.25, 0.05, -4.45); box(G, 3.5, 0.8, 0.9, -0.25, 0.5, -4.45); box(D, 3.6, 0.06, 1.0, -0.25, 0.93, -4.45);
  for (let i = 0; i < 5; i++) {
    const x = -1.61 + i * 0.68;
    if (i === 3) { cyl(K, 0.16, 0.03, x, 0.64, -3.99, Math.PI / 2); cyl(W, 0.13, 0.035, x, 0.64, -3.985, Math.PI / 2); box(O, 0.012, 0.11, 0.01, x + 0.03, 0.68, -3.965, 0, 0, -0.6); }
    else { box(W, 0.58, 0.3, 0.03, x, 0.66, -3.99); box(D, 0.22, 0.03, 0.03, x, 0.7, -3.97); }
    box(W, 0.58, 0.28, 0.03, x, 0.3, -3.99); box(D, 0.22, 0.03, 0.03, x, 0.34, -3.97);
  }
  for (const x of [-2.0, 1.5]) for (const z of [-4.0, -4.9]) box(D, 0.1, 0.92, 0.1, x, 0.46, z);
  box(D, 0.8, 0.1, 1.6, -1.55, 0.05, -5.7); box(G, 0.9, 0.8, 1.6, -1.55, 0.5, -5.7); box(D, 1.0, 0.06, 1.66, -1.55, 0.93, -5.7);
  for (let i = 0; i < 3; i++) { box(W, 0.03, 0.56, 0.44, -1.09, 0.5, -5.2 - i * 0.5); box(D, 0.03, 0.03, 0.2, -1.07, 0.62, -5.2 - i * 0.5); }
  blob(4.4, 1.9, -0.25, -4.45); blob(1.9, 2.4, -1.55, -5.7);
  // on the benches
  cyl(W, 0.05, 0.22, 0.95, 1.07, -4.25); cyl(O, 0.04, 0.16, 1.1, 1.04, -4.4); cyl(G, 0.06, 0.3, 0.8, 1.11, -4.55); cyl(D, 0.02, 0.05, 0.95, 1.2, -4.25);
  box(O, 0.46, 0.2, 0.26, -0.7, 1.06, -4.55, 0, 0.3, 0); box(D, 0.2, 0.03, 0.04, -0.7, 1.18, -4.55, 0, 0.3, 0);
  box(K, 0.52, 0.36, 0.04, 0.15, 1.16, -4.7, -0.25, 0, 0); glow(0x5f7f4a, 0.46, 0.3, 0.01, 0.15, 1.16, -4.678, -0.25, 0, 0);
  box(W, 0.6, 0.5, 0.6, -1.55, 1.21, -6.05); box(D, 0.02, 0.3, 0.4, -1.245, 1.25, -6.05); glow(PAL.hex.amber, 0.012, 0.04, 0.04, -1.24, 1.42, -5.82);
  cyl(D, 0.12, 0.1, -1.6, 1.01, -5.3); cyl(G, 0.09, 0.14, -1.6, 1.03, -5.3);
  // NASA models (docs/ASSETS.md): a helmet and a spare glove on the bench, a crew lock bag by the airlock,
  // an empty pressure suit at the end of the suit lockers. Small, so none casts a shadow; blobs sit under them.
  const nasa = (id, x, y, z, ry, opts) => loadPeriod(THREE, id, opts).then(m => { m.position.set(x, y, z); m.rotation.y = ry; group.add(m); return m; })
    .catch(e => console.warn(id, e));
  nasa('helmet', -1.45, 0.96, -4.4, Math.PI - 0.4, { merge: true, rough: 0.6, metal: 0.1, by: { visor: { color: PAL.hex.foilGold, rough: 0.25, metal: 0.7 }, White: { color: PAL.hex.enamel }, helmet: { color: PAL.hex.enamel }, Tree: { color: PAL.hex.console } } });
  loadGlove(THREE).then(m => { m.position.set(-0.95, 1.0, -4.3); m.rotation.set(-Math.PI / 2, 0.5, 0); group.add(m); }).catch(e => console.warn('glove', e));
  nasa('crew-lock-bag', -1.4, 0.95, -0.2, Math.PI);
  nasa('aces-suit', 3.2, 0, -0.5, Math.PI / 2, { merge: true, rough: 0.85, sat: 0.8 });
  blob(0.8, 0.9, 3.2, -0.5);

  // Ceiling gantry over the island. Its cables are dressed in short loops and clipped to the frame.
  box(G, 2.6, 0.5, 1.1, -0.3, 2.55, -5.0); box(D, 2.7, 0.08, 1.2, -0.3, 2.28, -5.0); box(W, 0.9, 0.4, 0.8, -1.3, 2.05, -5.1);
  box(D, 3.2, 0.08, 0.08, -0.3, 2.85, -4.5); box(D, 3.2, 0.08, 0.08, -0.3, 2.85, -5.5);
  for (const x of [-1.5, 0.9]) for (const z of [-4.5, -5.5]) tube(D, [x, 2.8, z], [x, H, z], 0.035);
  cyl(D, 0.24, 0.12, 0.55, 2.18, -4.65); cyl(K, 0.1, 0.3, -0.5, 2.15, -5.3);
  box(K, 0.62, 0.42, 0.05, 0.75, 1.95, -4.15, 0.3, 0, 0); glow(0x5f7f4a, 0.54, 0.34, 0.01, 0.75, 1.95, -4.12, 0.3, 0, 0); tube(D, [0.75, 2.14, -4.2], [0.75, 2.3, -4.5], 0.02);
  const cableMat = new THREE.MeshLambertMaterial({ color: K });
  for (const pts of [
    [[-0.9, 2.26, -4.62], [-0.55, 2.1, -4.5], [-0.15, 2.12, -4.5], [0.3, 2.26, -4.62]],
    [[-1.5, 2.6, -5.2], [-2.5, 2.42, -5.6], [-3.4, 2.7, -6.2]],
    [[-0.3, H, -3.0], [-0.3, 2.86, -3.6], [-0.3, 2.86, -4.45]],
  ]) group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 12, 0.022, 5), cableMat));

  // The power junction box high on the west wall, with its conduit up into the ceiling.
  box(D, 0.1, 0.3, 0.5, -3.44, 2.15, -7.7); tube(G, [-3.42, 2.3, -7.8], [-3.42, H, -7.8], 0.04); tube(G, [-3.42, 2.3, -7.6], [-3.42, H, -7.6], 0.04);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), new THREE.MeshBasicMaterial({ color: PAL.hex.amberOff, toneMapped: false }));
  beacon.position.set(-3.34, 2.36, -7.7); group.add(beacon);
  box(D, 0.14, 0.04, 0.14, -3.34, 2.29, -7.7);

  // Life support stack, north-west corner
  for (const [x, z] of [[-3.05, -11.5], [-2.35, -11.55]]) { cyl(W, 0.33, 2.2, x, 1.1, z); cyl(O, 0.34, 0.1, x, 1.85, z); cyl(D, 0.2, 0.12, x, 2.26, z); }
  tube(G, [-3.05, 2.3, -11.5], [-3.05, H, -11.5], 0.07); tube(G, [-2.35, 2.3, -11.55], [-2.35, 2.75, -11.55], 0.07); tube(G, [-2.35, 2.75, -11.55], [-3.05, 2.75, -11.5], 0.07);
  box(G, 0.5, 1.7, 0.9, -3.2, 0.85, -10.75); box(D, 0.52, 0.08, 0.92, -3.2, 1.74, -10.75); cyl(K, 0.2, 0.03, -2.94, 0.55, -10.75, 0, 0, Math.PI / 2);
  box(G, 0.3, 0.3, 4.6, -3.25, 2.95, -9.6);
  blob(2.2, 2.6, -2.8, -11.2);

  // East wall: a cabinet, an extinguisher, a status screen (north of airlock E)
  box(G, 0.3, 0.9, 1.6, 3.33, 1.5, -6.0); box(D, 0.02, 0.8, 0.02, 3.175, 1.5, -6.0); glow(PAL.hex.green, 0.012, 0.04, 0.04, 3.175, 1.85, -5.4);
  cyl(R, 0.07, 0.42, 3.38, 1.0, -4.1); cyl(K, 0.03, 0.08, 3.38, 1.25, -4.1);
  box(K, 0.06, 0.7, 1.2, 3.45, 1.6, -10.3);

  // Corridor stub, out to airlock N
  for (const z of [-13, -14]) { for (const x of [1.57, 3.43]) box(G, 0.12, CH, 0.16, x, CH / 2, z); box(D, 2, 0.12, 0.16, 2.5, CH - 0.06, z); }

  // Build the four batches
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  function batch(list, geo, mat, tint = true) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, m4.compose(v3.set(...it.p), it.q, s3.set(...it.s))); if (tint) im.setColorAt(i, col.setHex(it.color)); });
    im.frustumCulled = false; // one bounding sphere for the whole room would be wrong for most instances
    group.add(im); return im;
  }
  batch(lists.box, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());
  batch(lists.cyl, new THREE.CylinderGeometry(1, 1, 1, 12), new THREE.MeshLambertMaterial());
  batch(lists.glow, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }));
  const blobTex = texture(64, (g, S) => { const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(0.6, 'rgba(0,0,0,0.3)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, S, S); });
  batch(lists.blob, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), false);

  // Panels and cables that come loose when something goes wrong (damage.js).
  const damage = buildDamage(THREE, group, { sfx });

  // ---------- signs and screens ----------
  function screen(w, h, pw, ph, x, y, z, ry) {
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m);
    return rows => { // rows: [text, size, colour]
      g.fillStyle = PAL.glass; g.fillRect(0, 0, pw, ph); g.textAlign = 'center'; g.textBaseline = 'top';
      let yy = 10; for (const [text, size, colour] of rows) { g.font = `bold ${size}px monospace`; g.fillStyle = colour; g.fillText(text, pw / 2, yy); yy += size + 8; }
      tex.needsUpdate = true;
    };
  }
  screen(0.9, 0.2, 360, 80, 0, 2.47, -0.03, Math.PI)([['AIRLOCK  S', 44, PAL.phosphor]]);
  screen(0.8, 0.18, 360, 80, 2.5, 2.3, -14.95, 0)([['AIRLOCK  N', 44, PAL.phosphor]]);
  screen(0.8, 0.18, 360, 80, -3.47, 2.3, -3, Math.PI / 2)([['AIRLOCK  W', 44, PAL.phosphor]]);
  screen(0.8, 0.18, 360, 80, 3.47, 2.3, -8, -Math.PI / 2)([['AIRLOCK  E', 44, PAL.phosphor]]);
  const lifeScreen = screen(0.5, 0.5, 256, 256, -2.945, 1.25, -10.75, Math.PI / 2);
  const busScreen = screen(1.1, 0.6, 440, 240, 3.415, 1.6, -10.3, -Math.PI / 2);
  function drawScreens(out) {
    lifeScreen(out
      ? [['LIFE SUPPORT', 26, PAL.inkDim], ['ON', 54, PAL.red], ['BATTERY', 54, PAL.red], ['FANS OFF', 28, PAL.amber]]
      : [['LIFE SUPPORT', 26, PAL.inkDim], ['O2 21%', 52, PAL.phosphor], ['CO2 OK', 52, PAL.phosphor], ['FANS 100%', 28, PAL.inkDim]]);
    busScreen(out
      ? [['HABITAT POWER', 30, PAL.inkDim], ['MAIN BUS', 46, PAL.red], ['OFFLINE', 70, PAL.red], ['BACKUP LIGHTING ONLY', 26, PAL.amber]]
      : [['HABITAT POWER', 30, PAL.inkDim], ['MAIN BUS', 46, PAL.phosphor], ['ONLINE', 70, PAL.phosphor], ['SOLAR 4.1 kW   LOAD 2.6 kW', 24, PAL.inkDim]]);
  }
  drawScreens(false);

  // The hall's twin of each airlock chamber, behind its door. Their inner hatches stand open onto the hall
  // (astronaut.js swings them); their outer hatches stay shut: the Moon is on the other side.
  const doors = {};
  for (const [id, d] of Object.entries(PLACES.doors)) {
    const a = buildAirlock(THREE, { id, shell: false });
    a.root.position.set(d.hall.x, 0, d.hall.z); a.root.rotation.y = d.hall.ry;
    a.setInner(1); a.setOuter(0); a.setLamp('green'); a.setPressure(1);
    group.add(a.root);
    doors[id] = a;
  }
  const hatch = doors.S.root; // where a hull breach is heard from, indoors

  // ---------- lights ----------
  // Fixtures: eight roof strips and six red backup strips, each a glowing box whose colour is its state.
  const stripMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.05, 1.42), stripMat, ROOF_ROWS.length * 2);
  ROOF_ROWS.forEach((z, r) => [-2.2, 2.2].forEach((x, i) => roof.setMatrixAt(r * 2 + i, m4.makeTranslation(x, H - 0.09, z))));
  const BACKUP = [[-3.44, 0.25, -4.9, 0], [-3.44, 0.25, -9.2, 0], [3.44, 0.25, -4.9, 0], [3.44, 0.25, -9.6, 0], [3.44, 0.25, -13.5, 0], [0, 2.33, -0.05, Math.PI / 2]];
  const backup = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.07, 0.9), stripMat.clone(), BACKUP.length);
  BACKUP.forEach(([x, y, z, ry], i) => backup.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), s3.set(1, 1, 1))));
  roof.frustumCulled = backup.frustumCulled = false;
  group.add(roof, backup);

  // Three real lights, always on in the shader; only their intensity and colour change.
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  const down = new THREE.DirectionalLight(PAL.hex.incandescent, 0);
  down.position.set(1.2, 6, -4.6); down.target.position.set(0, 0, -6);
  const red = new THREE.PointLight(0xb8402a, 0, 7, 1.4);
  red.position.set(-2.5, 1.7, ROOM.panel.z);
  group.add(hemi, down, down.target, red);

  const SKY = new THREE.Color(0xe8dcc4), GROUND = new THREE.Color(0x6e675a), RSKY = new THREE.Color(0x8a2e1e), RGROUND = new THREE.Color(0x3a140c);
  const ON = new THREE.Color(0xffe8c4), OFF = new THREE.Color(0x2b2a26), RON = new THREE.Color(PAL.hex.red), ROFF = new THREE.Color(PAL.hex.redOff);
  const MAIN_FILL = 1.75, MAIN_DOWN = 1.4, DARK_FILL = 0.035, BACKUP_FILL = 0.2, BACKUP_POINT = 9;
  // Roof rows re-strike starting with the one nearest the junction box.
  const ORDER = ROOF_ROWS.map((z, i) => i).sort((a, b) => Math.abs(ROOF_ROWS[a] - ROOM.panel.z) - Math.abs(ROOF_ROWS[b] - ROOM.panel.z));
  const rows = ROOF_ROWS.map(() => 1);
  let out = false, phase = 'main', t = 0, backupLevel = 0, struck = 0, nextAlert = 0;

  function apply(time) {
    const main = rows.reduce((a, b) => a + b, 0) / rows.length;
    hemi.color.copy(SKY).multiplyScalar(DARK_FILL + MAIN_FILL * main).add(col.copy(RSKY).multiplyScalar(BACKUP_FILL * backupLevel));
    hemi.groundColor.copy(GROUND).multiplyScalar(DARK_FILL + MAIN_FILL * main).add(col.copy(RGROUND).multiplyScalar(BACKUP_FILL * backupLevel));
    down.intensity = MAIN_DOWN * main;
    red.intensity = BACKUP_POINT * backupLevel;
    rows.forEach((lv, r) => { col.copy(OFF).lerp(ON, lv); roof.setColorAt(r * 2, col); roof.setColorAt(r * 2 + 1, col); });
    col.copy(ROFF).lerp(RON, backupLevel);
    for (let i = 0; i < BACKUP.length; i++) backup.setColorAt(i, col);
    roof.instanceColor.needsUpdate = backup.instanceColor.needsUpdate = true;
    beacon.material.color.setHex(backupLevel > 0.2 && Math.floor(time * 3) % 2 === 0 ? PAL.hex.amber : PAL.hex.amberOff);
  }
  apply(0);

  // Inside the walls of the hall or the corridor stub, a body's width clear of them.
  const EPS = 1e-6;
  const inRoom = (x, z) => x <= HALL.x1 - BODY + EPS && z <= HALL.z1 - BODY + EPS &&
    ((x >= HALL.x0 + BODY - EPS && z >= HALL.z0 + BODY - EPS) || (x >= COR.x0 + BODY - EPS && z >= COR.z0 + BODY - EPS));

  const inSolid = (x, z) => SOLIDS.some(([x0, x1, z0, z1]) => x > x0 - BODY + EPS && x < x1 + BODY - EPS && z > z0 - BODY + EPS && z < z1 + BODY - EPS);

  return {
    group, hatch, damage, doors, window: win, windowGlass,
    // The server's scene, every frame (null between rounds): faults knock things loose, fixes put them back.
    setDamage(scene, audible) { damage.audible = audible; damage.set(scene); },
    get phase() { return phase; },          // 'main' | 'fail' | 'dark' | 'backup' | 'restore'
    get dark() { return phase !== 'main'; },
    // The server says whether a power alarm is live; the sequence itself runs here.
    setPower(isOut) {
      if (isOut === out) return;
      out = isOut; t = 0;
      if (out) { phase = 'fail'; sfx('powerdown'); }
      else { phase = 'restore'; struck = 0; rows.fill(0); sfx('breaker'); }
      drawScreens(out);
    },
    update(dt, time) {
      t += dt * 1000;
      const P = CFG.power;
      if (phase === 'fail') {            // two flickers, 80 ms each, then nothing
        const lv = t < 80 ? 0 : t < 160 ? 0.6 : t < 240 ? 0 : t < 320 ? 0.3 : 0;
        rows.fill(lv); backupLevel = 0;
        if (t >= 320) phase = 'dark';
      } else if (phase === 'dark') {
        if (t >= P.darkMs) { phase = 'backup'; nextAlert = t + 900; sfx('relay'); }
      } else if (phase === 'backup') {
        backupLevel = 0.3 + 0.7 * Math.min(1, (t - P.darkMs) / P.rampMs);
        if (t >= nextAlert) { nextAlert = t + 3000; sfx('alert'); }
      } else if (phase === 'restore') {
        while (struck < ORDER.length && t >= struck * P.restrikeMs) { rows[ORDER[struck++]] = 1; sfx('restrike'); }
        if (t >= 1000) { backupLevel = 0; if (struck === ORDER.length) phase = 'main'; }
      }
      apply(time);
      damage.update(dt, time);
    },
    // World <-> room coordinates.
    toLocal: (x, z) => ({ x: x - ROOM.origin.x, z: z - ROOM.origin.z }),
    toWorld: (x, z) => ({ x: x + ROOM.origin.x, z: z + ROOM.origin.z }),
    // Can a head be at this spot (room coordinates)?
    walkable(x, z) {
      return inRoom(x, z) && !inSolid(x, z);
    },
    // Nearest allowed spot to (x, z), in room coordinates: inside the walls, outside the furniture.
    clamp(x, z) {
      const cl = (v, a, b) => Math.max(a, Math.min(b, v));
      const h = { x: cl(x, HALL.x0 + BODY, HALL.x1 - BODY), z: cl(z, HALL.z0 + BODY, HALL.z1 - BODY) };
      const c = { x: cl(x, COR.x0 + BODY, COR.x1 - BODY), z: cl(z, COR.z0 + BODY, HALL.z0 + BODY) };
      const p = Math.hypot(h.x - x, h.z - z) <= Math.hypot(c.x - x, c.z - z) ? h : c;
      for (const [x0, x1, z0, z1] of SOLIDS) {
        const a = p.x - (x0 - BODY), b = (x1 + BODY) - p.x, cc = p.z - (z0 - BODY), d = (z1 + BODY) - p.z;
        if (a <= EPS || b <= EPS || cc <= EPS || d <= EPS) continue;
        // Step out through the nearest face that does not lead into a wall.
        const ways = [[a, x0 - BODY, p.z], [b, x1 + BODY, p.z], [cc, p.x, z0 - BODY], [d, p.x, z1 + BODY]].sort((m, n) => m[0] - n[0]);
        const way = ways.find(([, nx, nz]) => inRoom(nx, nz) && !inSolid(nx, nz)) || ways.find(([, nx, nz]) => inRoom(nx, nz)) || ways[0];
        p.x = way[1]; p.z = way[2];
      }
      return p;
    },
  };
}
