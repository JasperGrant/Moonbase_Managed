// An airlock chamber: the room between the Moon and the hall. Every door on the habitat has one outside
// (client/world.js), and the hall has an identical twin of each one on its walls (client/interior.js).
// You walk in, the hatch behind you swings shut, and while both hatches are shut the astronaut page swaps
// you from one twin to the other (client/astronaut.js). The two must look the same to the pixel, so the
// inside of the chamber ignores the scene's lights: its surfaces are MeshBasicMaterial with the lamp's
// light painted into their textures. That is also cheaper on the Quest.
//
// Chamber frame (metres): the inner hatch (to the hall) is in the plane z = 0, the outer hatch (to the
// Moon) in z = DEPTH, the floor at y = 0, open end toward +z. Names: Root, Hatch_Inner, Hatch_Outer,
// Porthole_Inner, Porthole_Outer, Lamp_Status, Dial_Pressure, Floor_Trigger.
import { PAL } from '/shared/palette.js';

export const CHAMBER = { width: 1.5, depth: 1.3, height: 2.4, door: { hw: 0.55, hh: 1.95 }, port: { y: 1.4, r: 0.17 },
  // How far each outdoor chamber stands off its hatch on the habitat model: the model's skin (and its painted
  // door) bulges up to 6 cm out there, and showed through the inner hatch and the back wall.
  outset: 0.1 };
export const OPEN = 1.9; // radians a hatch swings when open

// The painted inside of the chamber, drawn once per page and shared by every chamber.
let shared = null;
function materials(THREE) {
  if (shared) return shared;
  const tex = (w, h, paint) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  // Enamel wall panels lit from the roof lamp: brighter at the top, a soft pool, darker toward the floor.
  const lit = (g, w, h, base) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,236,200,0.22)'); grd.addColorStop(0.45, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(20,16,10,0.42)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  };
  const panels = (g, w, h, cols, rows) => {
    g.strokeStyle = 'rgba(40,36,30,0.45)'; g.lineWidth = 3;
    for (let i = 1; i < cols; i++) { g.beginPath(); g.moveTo(i * w / cols, 0); g.lineTo(i * w / cols, h); g.stroke(); }
    for (let j = 1; j < rows; j++) { g.beginPath(); g.moveTo(0, j * h / rows); g.lineTo(w, j * h / rows); g.stroke(); }
    g.fillStyle = 'rgba(60,54,44,0.55)';
    for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) for (const [dx, dy] of [[8, 8], [-8, 8], [8, -8], [-8, -8]]) {
      const x = i * w / cols + dx, y = j * h / rows + dy;
      if (x > 0 && x < w && y > 0 && y < h) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
    }
    // a little wear: scuffs low down where boots and tool cases hit
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(30,26,20,${0.05 + r() * 0.08})`; g.lineWidth = 1 + r() * 2; const x = r() * w, y = h * (0.75 + r() * 0.25); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 8); g.stroke(); }
  };
  const wall = tex(256, 512, (g, w, h) => {
    lit(g, w, h, PAL.enamel); panels(g, w, h, 2, 3);
    g.fillStyle = PAL.console; g.fillRect(0, h - 46, w, 46); // kick band
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 48, w, 3);
  });
  const roof = tex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b3a3'; g.fillRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
    grd.addColorStop(0, 'rgba(255,236,200,0.35)'); grd.addColorStop(1, 'rgba(20,16,10,0.35)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h); panels(g, w, h, 2, 2);
  });
  const floor = tex(256, 256, (g, w, h) => {
    g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, w, h);
    g.strokeStyle = PAL.bezel; g.lineWidth = 3;
    for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.75);
    grd.addColorStop(0, 'rgba(255,230,190,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.hazard; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  });
  const hatch = tex(256, 512, (g, w, h) => {
    lit(g, w, h, '#b9b3a3'); panels(g, w, h, 1, 2);
    g.fillStyle = PAL.hazard; for (let x = -h; x < w; x += 40) { g.save(); g.beginPath(); g.rect(0, h - 30, w, 30); g.clip(); g.fillRect(x, h - 30, 18, 30); g.restore(); }
  });
  const dial = tex(128, 128, (g, w, h) => {
    g.fillStyle = PAL.bezel; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill();
    g.fillStyle = PAL.dial; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fill();
    g.strokeStyle = PAL.inkDial; g.lineWidth = 3;
    for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.75 + 1.5 * i / 10); g.beginPath(); g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); g.stroke(); }
    g.fillStyle = PAL.red; g.beginPath(); g.arc(64, 64, 50, Math.PI * 0.75, Math.PI * 1.05); g.arc(64, 64, 44, Math.PI * 1.05, Math.PI * 0.75, true); g.fill();
    g.fillStyle = PAL.inkDial; g.font = 'bold 14px monospace'; g.textAlign = 'center'; g.fillText('PSI', 64, 92);
  });
  const basic = map => new THREE.MeshBasicMaterial({ map });
  shared = {
    wall: basic(wall), roof: basic(roof), floor: basic(floor), hatch: basic(hatch), dial: basic(dial),
    rail: new THREE.MeshBasicMaterial({ color: 0x8a877c }),
    trim: new THREE.MeshBasicMaterial({ color: 0x4f5a56 }),
    needle: new THREE.MeshBasicMaterial({ color: PAL.hex.inkDial }),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xe8b872, toneMapped: false }),
    glass: new THREE.MeshBasicMaterial({ color: 0x2a2620, transparent: true, opacity: 0.35, depthWrite: false }),
    // The outside of the chamber and the hatch leaves: painted steel, lit like everything else outdoors.
    shell: new THREE.MeshStandardMaterial({ map: wall, color: PAL.hex.enamel, roughness: 0.8, metalness: 0.1 }),
    leaf: new THREE.MeshStandardMaterial({ color: PAL.hex.console, roughness: 0.75, metalness: 0.3 }),
    steel: new THREE.MeshStandardMaterial({ color: PAL.hex.aluminium, roughness: 0.42, metalness: 0.85 }),
  };
  return shared;
}

// A label plate: engraved capitals on an enamel placard.
function plate(THREE, text, w, h) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = PAL.console; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = PAL.bezel; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6);
  g.fillStyle = PAL.dial; g.font = `bold ${Math.round(c.height * 0.5)}px "Michroma", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// shell: build the outside skin (side walls and roof as painted steel). The hall's twins sit behind the
// hall's walls where nobody sees their outside, so they leave it off.
export function buildAirlock(THREE, { id = 'S', shell = true, castShadow = false } = {}) {
  const M = materials(THREE);
  const { width: AW, depth: D, height: AH, door: { hw, hh }, port } = CHAMBER;
  const root = new THREE.Group(); root.name = 'Airlock_' + id;
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // The inside: two side walls, the roof, the grate floor, and the two end walls round their doorways.
  for (const sx of [-1, 1]) mesh(new THREE.PlaneGeometry(D, AH), M.wall, sx * AW / 2, AH / 2, D / 2).rotation.y = -sx * Math.PI / 2;
  mesh(new THREE.PlaneGeometry(AW, D), M.roof, 0, AH, D / 2).rotation.x = Math.PI / 2;
  mesh(new THREE.PlaneGeometry(AW, D), M.floor, 0, 0.004, D / 2).rotation.x = -Math.PI / 2;
  const doorway = () => { // an end wall with a rounded doorway cut in it
    const s = new THREE.Shape(); s.moveTo(-AW / 2, 0); s.lineTo(AW / 2, 0); s.lineTo(AW / 2, AH); s.lineTo(-AW / 2, AH); s.closePath();
    const r = 0.16, hole = new THREE.Path();
    hole.moveTo(-hw + r, 0.02); hole.lineTo(hw - r, 0.02); hole.quadraticCurveTo(hw, 0.02, hw, 0.02 + r); hole.lineTo(hw, hh - r); hole.quadraticCurveTo(hw, hh, hw - r, hh);
    hole.lineTo(-hw + r, hh); hole.quadraticCurveTo(-hw, hh, -hw, hh - r); hole.lineTo(-hw, 0.02 + r); hole.quadraticCurveTo(-hw, 0.02, -hw + r, 0.02);
    s.holes.push(hole);
    const geo = new THREE.ShapeGeometry(s, 6), uv = geo.attributes.uv, p = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + AW / 2) / AW, p.getY(i) / AH);
    return geo;
  };
  mesh(doorway(), M.wall, 0, 0, 0.002);                                     // back wall, faces +z
  mesh(doorway(), M.wall, 0, 0, D - 0.002).rotation.y = Math.PI;            // front wall, faces -z
  // Door frames: a raised steel collar round each doorway.
  for (const z of [0.01, D - 0.01]) {
    mesh(new THREE.BoxGeometry(0.06, hh, 0.04), M.trim, -hw - 0.03, hh / 2, z); mesh(new THREE.BoxGeometry(0.06, hh, 0.04), M.trim, hw + 0.03, hh / 2, z);
    mesh(new THREE.BoxGeometry(2 * hw + 0.12, 0.06, 0.04), M.trim, 0, hh + 0.03, z);
  }
  if (shell) {
    const sh = (geo, x, y, z) => { const m = mesh(geo, M.shell, x, y, z); m.castShadow = castShadow; m.receiveShadow = true; return m; };
    // The shell stands 5 mm off the inner walls and roof (sharing their faces, the two fought), and runs back
    // past the inner end, over the gap to the habitat's skin (CHAMBER.outset).
    const back = CHAMBER.outset + 0.1, len = D + 0.04 + back, mid = (D + 0.04 - back) / 2;
    for (const sx of [-1, 1]) sh(new THREE.BoxGeometry(0.08, AH + 0.1, len), sx * (AW / 2 + 0.045), (AH + 0.1) / 2, mid);
    sh(new THREE.BoxGeometry(AW + 0.17, 0.1, len), 0, AH + 0.055, mid);
    // the front face round the outer doorway, seen from the Moon
    const front = mesh(doorway(), M.shell, 0, 0, D + 0.04); front.receiveShadow = true;
    mesh(new THREE.BoxGeometry(AW + 0.24, 0.08, 0.08), M.leaf, 0, AH + 0.06, D + 0.06).castShadow = castShadow; // drip rail
  }

  // Handrails, the roof lamp, a vent grille, the status lamp and the pressure dial.
  for (const sx of [-1, 1]) {
    const r = mesh(new THREE.CylinderGeometry(0.02, 0.02, D - 0.4, 8), M.rail, sx * (AW / 2 - 0.08), 1.0, D / 2); r.rotation.x = Math.PI / 2;
    for (const z of [0.25, D - 0.25]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), M.rail, sx * (AW / 2 - 0.04), 1.0, z).rotation.z = Math.PI / 2;
  }
  mesh(new THREE.BoxGeometry(0.46, 0.04, 0.16), M.lampGlow, 0, AH - 0.03, D / 2);
  mesh(new THREE.BoxGeometry(0.52, 0.03, 0.2), M.trim, 0, AH - 0.012, D / 2);
  const vent = mesh(new THREE.PlaneGeometry(0.3, 0.16), M.trim, -AW / 2 + 0.002, 0.35, D / 2); vent.rotation.y = Math.PI / 2; vent.name = 'Vent';
  for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.004, 0.012, 0.26), M.rail, -AW / 2 + 0.006, 0.3 + i * 0.035, D / 2);
  const lampMat = new THREE.MeshBasicMaterial({ color: PAL.hex.green, toneMapped: false });
  const lamp = mesh(new THREE.SphereGeometry(0.03, 12, 8), lampMat, AW / 2 - 0.004, 1.95, D * 0.3); lamp.name = 'Lamp_Status';
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14), M.trim, AW / 2 - 0.002, 1.95, D * 0.3).rotation.z = Math.PI / 2;
  const dial = mesh(new THREE.CircleGeometry(0.09, 24), M.dial, AW / 2 - 0.004, 1.6, D * 0.3); dial.rotation.y = -Math.PI / 2; dial.name = 'Dial_Pressure';
  const needle = mesh(new THREE.BoxGeometry(0.004, 0.07, 0.006), M.needle, 0, 0, 0, dial); needle.geometry.translate(0, 0.03, 0); needle.position.z = 0.004;
  const label = plate(THREE, 'AIRLOCK ' + id, 0.42, 0.09); label.position.set(0, hh + 0.16, 0.01); root.add(label);
  const label2 = plate(THREE, 'AIRLOCK ' + id, 0.42, 0.09); label2.position.set(0, hh + 0.16, D - 0.01); label2.rotation.y = Math.PI; root.add(label2);

  // The two hatches. Each leaf is painted steel with the chamber side covered by a painted plate (so it
  // matches the twin), a porthole, a locking wheel, on a hinge at the doorway's +x edge.
  const portholes = {};
  function hatch(name, z, out) {
    const hinge = new THREE.Group(); hinge.position.set(hw + 0.02, 0, z); hinge.name = 'Hatch_' + name; root.add(hinge);
    const leaf = new THREE.Shape(); leaf.moveTo(0, 0.03); leaf.lineTo(-2 * hw - 0.02, 0.03); leaf.lineTo(-2 * hw - 0.02, hh - 0.01); leaf.lineTo(0, hh - 0.01); leaf.closePath();
    const hole = new THREE.Path(); hole.absarc(-hw - 0.01, port.y, port.r, 0, Math.PI * 2, true); leaf.holes.push(hole);
    const dir = out ? 1 : -1; // which way is away from the chamber
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(leaf, { depth: 0.05, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 20 }), M.leaf);
    slab.position.z = out ? 0.012 : -0.062; slab.castShadow = castShadow; slab.receiveShadow = true; hinge.add(slab);
    const face = new THREE.ShapeGeometry(leaf, 20), uv = face.attributes.uv, p = face.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, -p.getX(i) / (2 * hw), p.getY(i) / hh);
    const plateM = new THREE.Mesh(face, M.hatch); plateM.position.z = -dir * 0.004;
    if (out) { plateM.rotation.y = Math.PI; plateM.position.x = -2 * hw - 0.02; } // turned to face the chamber
    hinge.add(plateM);
    // The porthole: a steel ring both sides, and the glass (astronaut.js may make it a window onto the other place).
    for (const z of [-dir * 0.012, dir * 0.076]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(port.r + 0.015, 0.022, 8, 24), M.rail); ring.position.set(-hw - 0.01, port.y, z); hinge.add(ring); }
    const glass = new THREE.Mesh(new THREE.CircleGeometry(port.r, 28), M.glass); glass.position.set(-hw - 0.01, port.y, -dir * 0.002); glass.name = 'Porthole_' + name;
    if (out) glass.rotation.y = Math.PI; // faces into the chamber
    hinge.add(glass); portholes[name] = glass;
    // The locking wheel on the chamber side, which spins as the hatch dogs shut.
    const wheel = new THREE.Group(); wheel.position.set(-hw - 0.01, 0.95, -dir * 0.03); hinge.add(wheel); wheel.name = 'Wheel_' + name;
    const wm = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.018, 6, 20), M.rail); wheel.add(wm);
    for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.015), M.rail); sp.rotation.z = i * Math.PI / 3; wheel.add(sp); }
    hinge.userData.wheel = wheel;
    return hinge;
  }
  const inner = hatch('Inner', 0, false), outer = hatch('Outer', D, true);
  // Opening is a positive angle for the outer hatch (it swings out onto the Moon) and negative for the
  // inner one (into the hall). t: 0 shut, 1 open.
  let innerT = 0, outerT = 0;
  const setInner = t => { innerT = t; inner.rotation.y = -OPEN * t; inner.userData.wheel.rotation.z = (1 - t) * 4; };
  const setOuter = t => { outerT = t; outer.rotation.y = OPEN * t; outer.userData.wheel.rotation.z = (1 - t) * 4; };

  // The floor box the head must stand over to start a cycle (not drawn).
  const trigger = new THREE.Box3(new THREE.Vector3(-AW / 2 + 0.15, 0, 0.15), new THREE.Vector3(AW / 2 - 0.15, AH, D - 0.12));
  root.userData.trigger = trigger;

  return {
    root, inner, outer, portholes, lamp, needle, trigger,
    setInner, setOuter,
    get innerT() { return innerT; }, get outerT() { return outerT; },
    // 'green' a hatch stands open, 'amber' cycling, 'red' held shut
    setLamp(state) { lampMat.color.setHex(state === 'amber' ? PAL.hex.amber : state === 'red' ? PAL.hex.red : PAL.hex.green); },
    setPressure(p) { needle.rotation.z = Math.PI * (0.75 - 1.5 * p) - Math.PI / 2; }, // 0 vacuum, 1 cabin
  };
}
