// The astronaut's left arm and the gauge cluster strapped to it. There is nothing drawn on the
// visor: everything the astronaut may know about the suit and the mission is on this cluster, and
// the arm only comes up in front of the face while the radio is keyed.
//
// Add `arm.group` to the camera. Call `arm.update(dt, radioKeyed)` every frame and `arm.draw(info)`
// whenever the arm is in view. The arm coming up is itself the sign that the radio is keyed; the
// light strip on the cluster, the frame round its face and the antenna icon say what the radio is
// doing: red while transmitting, blue while Mission Ops is talking, amber with no microphone.
//
// The arm is modelled on an EVA suit's: a white outer garment over the pressure bladder, with its
// soft wrinkles, the ribbed elbow joint, a red identification stripe, the metal wrist disconnect,
// and a glove with a gauntlet, a palm strap, a knuckle pad and silicone fingertips. Sizes are a
// suited arm's, in metres. The gauge face has no words or numbers on it, only icons.

const W = 640, H = 374;                        // gauge face, in canvas pixels
const FACE_W = 0.17, FACE_H = FACE_W * H / W;  // and in metres: a cuff display, not a tablet
const GREEN = '#58e08a', RED = '#ff5c5c', AMBER = '#ffb347', BLUE = '#6fb6ff', DIM = '#3a4750', INK = '#e8f0f2';

export function buildArm(THREE) {
  const group = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // ---------- materials ----------
  // Woven outer fabric: a fine weave drawn once, used as colour and as bump.
  function weave(base, thread, size = 128) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 4) {
      g.fillStyle = thread; g.globalAlpha = 0.1; g.fillRect(i, 0, 2, size);
      g.globalAlpha = 0.08; g.fillRect(0, i, size, 2);
    }
    g.globalAlpha = 0.04;
    for (let i = 0; i < 500; i++) { g.fillStyle = i % 2 ? '#000' : '#fff'; g.fillRect((i * 53) % size, (i * 97) % size, 2, 2); } // lint: a fixed pattern, not random
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(18, 26); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const whiteWeave = weave('#ebe8df', '#8f8a7c'), redWeave = weave('#b3271f', '#4d0f0b'), greyWeave = weave('#c9c9c4', '#6f7074');
  // A touch of emissive keeps the arm readable when the sun is behind the astronaut.
  const cloth = (map, emissive) => new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.95, emissive });
  const fabric = cloth(whiteWeave, 0x121214), stripe = cloth(redWeave, 0x140303), gloveCloth = cloth(greyWeave, 0x0f0f10);
  const silicone = new THREE.MeshStandardMaterial({ color: 0x55616b, roughness: 0.7, emissive: 0x08090a });   // fingertips and knuckle pad
  const webbing = new THREE.MeshStandardMaterial({ color: 0x7d838a, roughness: 0.9, emissive: 0x0a0a0b });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.32, metalness: 0.95 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.7 });
  const anodised = new THREE.MeshStandardMaterial({ color: 0xa5231c, roughness: 0.35, metalness: 0.8 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x20252a, roughness: 0.55, metalness: 0.6 });
  const cable = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.7 });

  // ---------- the arm ----------
  // The forearm lies along x: elbow to the left, glove to the right. The gauge face is at the
  // group's origin, facing the eyes (+z); the forearm's axis runs behind it at z = AZ.
  const ELBOW = -0.2, WRIST = 0.125;
  // Radius of the sleeve along the forearm: tapering to the wrist, soft wrinkles, ribs at the elbow joint.
  const sleeveR = x => {
    const t = (x - ELBOW) / (WRIST - ELBOW);
    let r = 0.066 - 0.016 * t + 0.0022 * Math.sin(x * 95) + 0.0013 * Math.sin(x * 236 + 1);
    if (x < ELBOW + 0.06) r += 0.003 * (0.5 + 0.5 * Math.cos((x - ELBOW) / 0.06 * Math.PI * 10)); // five ribs
    return r;
  };
  const AZ = -(sleeveR(0) + 0.016);
  // A tube of varying radius along x, from a function of x.
  function tube(x0, x1, radius, mat, steps = 72) {
    const pts = [];
    for (let i = 0; i <= steps; i++) { const x = x0 + (x1 - x0) * i / steps; pts.push(new THREE.Vector2(radius(x), x)); }
    const m = add(new THREE.LatheGeometry(pts, 28), mat, 0, 0, AZ);
    m.rotation.z = -Math.PI / 2; // the lathe's axis (y) laid along x
    return m;
  }
  const ring = (x, r, thick, wide, mat) => { // a band round the arm at x
    const m = add(new THREE.TorusGeometry(r, thick, 10, 32), mat, x, 0, AZ);
    m.rotation.y = Math.PI / 2; m.scale.z = wide / (2 * thick);
    return m;
  };

  tube(ELBOW, WRIST, sleeveR, fabric);
  tube(ELBOW + 0.066, ELBOW + 0.088, x => sleeveR(x) + 0.0018, stripe, 8);       // red identification stripe
  add(new THREE.SphereGeometry(0.0715, 24, 16), fabric, ELBOW, 0, AZ);           // the elbow
  // Upper arm, running from the elbow down and back to a shoulder out of view.
  {
    const dir = new THREE.Vector3(-0.22, -0.72, 0.66).normalize(), pts = [];
    for (let i = 0; i <= 40; i++) { const d = 0.36 * i / 40; pts.push(new THREE.Vector2(0.067 + 0.022 * d + 0.002 * Math.sin(d * 80), d)); }
    const upper = add(new THREE.LatheGeometry(pts, 28), fabric, ELBOW, 0, AZ);
    upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const bearing = add(new THREE.TorusGeometry(0.0715, 0.003, 10, 32), satin, 0, 0.15, 0, upper); // arm bearing
    bearing.rotation.x = Math.PI / 2; bearing.scale.z = 3.5;
  }

  // Wrist: the glove's gauntlet over the end of the sleeve, then the metal disconnect.
  tube(WRIST - 0.022, WRIST + 0.012, x => 0.0555 + 0.03 * (x - WRIST), gloveCloth, 6);
  const metalRing = add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 32), aluminium, WRIST + 0.022, 0, AZ);
  metalRing.rotation.z = Math.PI / 2;
  ring(WRIST + 0.036, 0.049, 0.004, 0.008, anodised);
  for (let i = 0; i < 6; i++) { // locking tabs round the disconnect
    const a = i / 6 * Math.PI * 2 + 0.4;
    add(new THREE.BoxGeometry(0.012, 0.008, 0.008), aluminium, WRIST + 0.022, Math.cos(a) * 0.054, AZ + Math.sin(a) * 0.054).rotation.x = -a;
  }
  tube(WRIST + 0.036, WRIST + 0.075, x => 0.045 - 0.1 * (x - WRIST - 0.036), gloveCloth, 6); // glove wrist

  // Glove: back of the hand toward the eyes, fingers relaxed and curling away.
  const HAND = WRIST + 0.105;
  add(new THREE.SphereGeometry(0.05, 24, 16), gloveCloth, HAND, 0, AZ).scale.set(1, 0.96, 0.52);
  const palmStrap = add(new THREE.TorusGeometry(0.047, 0.0045, 8, 28), webbing, HAND + 0.004, 0, AZ);
  palmStrap.rotation.y = Math.PI / 2; palmStrap.scale.set(0.58, 1, 3);
  add(new THREE.CapsuleGeometry(0.0125, 0.068, 4, 12), silicone, HAND + 0.036, 0, AZ + 0.013); // knuckle pad
  // One finger: a chain of segments, each bent a little more toward the palm (-z) than the last.
  function finger(x, y, z, radius, lengths, curls, lean = 0) {
    let parent = new THREE.Group();
    parent.position.set(x, y, z); parent.rotation.z = lean;
    group.add(parent);
    lengths.forEach((len, i) => {
      const joint = new THREE.Group();
      joint.rotation.y = curls[i];
      parent.add(joint);
      const tip = i === lengths.length - 1;
      add(new THREE.CapsuleGeometry(radius * (1 - 0.07 * i), len, 4, 12), tip ? silicone : gloveCloth, len / 2, 0, 0, joint).rotation.z = Math.PI / 2;
      parent = new THREE.Group(); parent.position.x = len; joint.add(parent);
    });
  }
  [[0.034, 0.95], [0.012, 1], [-0.01, 0.95], [-0.032, 0.8]].forEach(([y, k], i) =>
    finger(HAND + 0.04, y, AZ + 0.004, 0.0128, [0.036 * k, 0.026 * k, 0.02 * k], [0.3 + i * 0.05, 0.5, 0.4]));
  finger(HAND - 0.02, 0.04, AZ + 0.006, 0.015, [0.036, 0.028], [0.35, 0.45], 0.95); // thumb

  // ---------- the gauge cluster ----------
  // A slim cuff unit strapped round the forearm, with a cable back to the suit.
  add(new THREE.BoxGeometry(FACE_W + 0.016, FACE_H + 0.016, 0.014), housing, 0, 0, -0.0075);
  add(new THREE.BoxGeometry(FACE_W * 0.82, FACE_H * 0.8, 0.02), housing, 0, 0, -0.02);      // cradle down to the sleeve
  for (const x of [-0.055, 0.055]) ring(x, sleeveR(x) + 0.003, 0.0035, 0.024, webbing);       // straps
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.018, 0.012, 0.006), aluminium, s * 0.055, -FACE_H / 2 - 0.012, -0.018); // buckles
  {
    const z = x => AZ + sleeveR(x) + 0.003; // lie on the sleeve
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-FACE_W / 2 - 0.008, -0.012, -0.01), new THREE.Vector3(-0.11, -0.022, z(-0.11)),
      new THREE.Vector3(-0.135, -0.012, z(-0.135)), new THREE.Vector3(-0.16, -0.026, z(-0.16) - 0.004),
    ]);
    add(new THREE.TubeGeometry(path, 24, 0.0032, 8), cable);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.014, 12), aluminium, -0.163, -0.027, z(-0.16) - 0.005).rotation.z = Math.PI / 2 - 0.4;
  }
  // Radio light strip in the top edge of the bezel. Dark until the radio does something.
  const SIGNAL = { tx: 0xff3b3b, rx: 0x4da3ff, nomic: 0xffa52e };
  const stripMat = new THREE.MeshBasicMaterial({ color: 0x1a1f24, toneMapped: false });
  add(new THREE.BoxGeometry(FACE_W * 0.5, 0.0035, 0.003), stripMat, 0, FACE_H / 2 + 0.004, 0);
  function signal(radio, now) {
    if (!SIGNAL[radio]) { stripMat.color.setHex(0x1a1f24); return; }
    const pulse = radio === 'tx' ? 0.7 + 0.3 * Math.sin(now * 9) : 1; // transmitting: a quick throb
    stripMat.color.setHex(SIGNAL[radio]).multiplyScalar(pulse);
  }

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  add(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 0, 0.0004);

  group.traverse(o => { if (o.isMesh) o.renderOrder = 10; }); // after the visor scope, so the arm covers it

  // ---------- drawing the gauge face: icons only ----------
  const A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5; // dials run from bottom-left, clockwise, to bottom-right
  function dial(cx, cy, r, frac, colour, redBelow) {
    g.lineCap = 'butt'; g.lineWidth = 17;
    g.strokeStyle = '#1b2329'; g.beginPath(); g.arc(cx, cy, r, A0, A0 + SWEEP); g.stroke();
    if (redBelow) { g.strokeStyle = '#5a1f1f'; g.beginPath(); g.arc(cx, cy, r, A0, A0 + SWEEP * redBelow); g.stroke(); }
    if (frac > 0) { g.strokeStyle = colour; g.beginPath(); g.arc(cx, cy, r, A0, A0 + SWEEP * Math.min(1, frac)); g.stroke(); }
    g.strokeStyle = '#5d6d76'; g.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      const a = A0 + SWEEP * i / 10, r0 = r + 12, r1 = r + (i % 5 ? 18 : 24);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
  }
  // Oxygen: a gas bottle, filled to the level left.
  function bottle(cx, cy, frac, colour) {
    const body = () => { g.beginPath(); g.roundRect(cx - 22, cy - 26, 44, 66, 14); };
    g.save(); body(); g.clip();
    g.fillStyle = '#141a1f'; g.fillRect(cx - 22, cy - 26, 44, 66);
    g.fillStyle = colour; g.fillRect(cx - 22, cy + 40 - 66 * frac, 44, 66 * frac);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = 5; g.lineJoin = 'round'; body(); g.stroke();
    g.fillStyle = INK; g.fillRect(cx - 7, cy - 38, 14, 12);                 // neck
    g.beginPath(); g.roundRect(cx - 17, cy - 46, 34, 9, 4); g.fill();       // valve
  }
  // Time: an hourglass, the sand in the top bulb running out.
  function hourglass(cx, cy, frac, colour, lit) {
    const h = 40, w = 30;
    const bulb = top => { g.beginPath(); g.moveTo(cx - w, cy + (top ? -h : h)); g.lineTo(cx + w, cy + (top ? -h : h)); g.lineTo(cx, cy); g.closePath(); };
    for (const top of [true, false]) {
      g.save(); bulb(top); g.clip();
      g.fillStyle = '#141a1f'; g.fillRect(cx - w, cy - h, w * 2, h * 2);
      if (lit) {
        g.fillStyle = colour;
        const f = Math.sqrt(top ? frac : 1 - frac); // a triangle's area goes as its height squared
        if (top) g.fillRect(cx - w, cy - h * f, w * 2, h * f); else g.fillRect(cx - w, cy + h - h * f * 0.7, w * 2, h);
      }
      g.restore();
      g.strokeStyle = lit ? INK : DIM; g.lineWidth = 4; g.lineJoin = 'round'; bulb(top); g.stroke();
    }
    g.strokeStyle = lit ? INK : DIM; g.lineWidth = 7; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx - w - 5, cy + s * (h + 4)); g.lineTo(cx + w + 5, cy + s * (h + 4)); g.stroke(); }
  }
  function tick(cx, cy, colour) { // done, fixed, mission complete
    g.strokeStyle = colour; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 36, cy + 2); g.lineTo(cx - 10, cy + 28); g.lineTo(cx + 38, cy - 28); g.stroke();
  }
  function cross(cx, cy, colour) { // mistake, mission failed
    g.strokeStyle = colour; g.lineWidth = 15; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx - 30, cy - 30 * s); g.lineTo(cx + 30, cy + 30 * s); g.stroke(); }
  }
  // Radio: a mast with waves coming off it. A bar through it means no microphone.
  function antenna(cx, cy, colour, waves, barred) {
    const top = cy - 34;
    g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, cy + 52); g.moveTo(cx - 22, cy + 58); g.lineTo(cx, cy + 6); g.lineTo(cx + 22, cy + 58); g.stroke();
    g.beginPath(); g.arc(cx, top, 9, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = i < waves ? colour : DIM; g.lineWidth = 6;
      const r = 22 + i * 14;
      g.beginPath(); g.arc(cx, top, r, -0.62, 0.62); g.stroke();
      g.beginPath(); g.arc(cx, top, r, Math.PI - 0.62, Math.PI + 0.62); g.stroke();
    }
    if (barred) { g.strokeStyle = AMBER; g.lineWidth = 9; g.beginPath(); g.moveTo(cx - 46, cy + 56); g.lineTo(cx + 46, cy - 66); g.stroke(); }
  }
  // Alarm: a warning triangle, lit while one is active.
  function warning(cx, cy, lit) {
    g.beginPath(); g.moveTo(cx, cy - 30); g.lineTo(cx + 34, cy + 26); g.lineTo(cx - 34, cy + 26); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 8;
    g.strokeStyle = lit ? AMBER : DIM; g.stroke();
    if (lit) { g.fillStyle = AMBER; g.fill(); }
    g.strokeStyle = g.fillStyle = lit ? '#1a1206' : DIM; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 6); g.stroke();
    g.beginPath(); g.arc(cx, cy + 17, 4, 0, Math.PI * 2); g.fill();
  }
  // Visor zoom: a magnifying glass, with a row of pips for how far in.
  function magnifier(cx, cy, level) {
    const colour = level > 0 ? GREEN : DIM;
    g.strokeStyle = colour; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.arc(cx - 6, cy - 6, 19, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx + 9, cy + 9); g.lineTo(cx + 26, cy + 26); g.stroke();
    for (let i = 0; i < 5; i++) { g.fillStyle = i < level ? GREEN : '#1b2329'; g.beginPath(); g.roundRect(cx - 40 + i * 17, cy + 40, 12, 12, 3); g.fill(); }
  }

  // Draw an icon made for the point (0, 0) at (cx, cy), k times its size.
  const at = (cx, cy, k, icon) => { g.save(); g.translate(cx, cy); g.scale(k, k); icon(); g.restore(); };

  let key = '', shown = null; // shown: what the face last drew, in words, for the smoke test
  // info = { state, radio: '' | 'tx' | 'rx' | 'nomic', zoom, total, status: '' | 'ok' | 'bad' | 'won' | 'lost' | 'standby' }.
  // Redraws only when something shown changes.
  function draw(info) {
    const s = info.state;
    const o2 = s ? Math.round(s.oxygen) : null, t = s ? Math.max(0, Math.ceil(s.timeLeft)) : null, alarms = s ? s.issues.length : 0;
    const level = info.zoom > 1.01 ? Math.max(1, Math.min(5, Math.round(info.zoom - 1))) : 0;
    const k = [o2, s && s.o2Max, t, alarms, info.radio, level, info.status].join('|');
    if (k === key) return;
    key = k;

    const radio = { tx: ['TRANSMITTING', RED], rx: ['MISSION OPS', BLUE], nomic: ['NO MICROPHONE', AMBER] }[info.radio];
    g.fillStyle = '#0a0e11'; g.fillRect(0, 0, W, H);
    g.strokeStyle = radio ? radio[1] : '#2a343b'; g.lineWidth = radio ? 9 : 4; // the frame lights up with the radio
    g.beginPath(); g.roundRect(7, 7, W - 14, H - 14, 20); g.stroke();

    // Suit oxygen.
    const frac = s ? Math.max(0, Math.min(1, s.oxygen / s.o2Max)) : 0, low = s ? s.oxygen < 25 : false;
    dial(122, 190, 86, frac, low ? RED : GREEN, s ? Math.min(1, 25 / s.o2Max) : 0.25);
    at(122, 186, 1.15, () => bottle(0, 0, frac, low ? RED : GREEN));

    // Mission clock, or the outcome: a tick for fixed or complete, a cross for a mistake or failed.
    const left = s && info.total ? Math.max(0, Math.min(1, s.timeLeft / info.total)) : 0;
    const running = !!s && info.status !== 'standby', hurry = running && t <= 30;
    dial(346, 190, 86, left, hurry ? AMBER : BLUE);
    if (info.status === 'ok' || info.status === 'won') at(346, 190, 1.15, () => tick(0, 0, GREEN));
    else if (info.status === 'bad' || info.status === 'lost') at(346, 190, 1.15, () => cross(0, 0, RED));
    else at(346, 190, 1.15, () => hourglass(0, 0, left, hurry ? AMBER : BLUE, running));

    // Radio, alarms, visor zoom.
    antenna(506, 196, radio ? radio[1] : '#77868f', radio ? 3 : 0, info.radio === 'nomic');
    for (let i = 0; i < 2; i++) at(592, 96 + i * 72, 0.78, () => warning(0, 0, i < alarms));
    at(594, 258, 0.88, () => magnifier(0, 0, level));

    tex.needsUpdate = true;
    shown = { radio: radio ? radio[0] : 'STANDBY', frame: radio ? radio[1] : null, oxygen: o2, seconds: t, alarms, zoomPips: level, status: info.status || '' };
  }

  // ---------- raising and lowering ----------
  // 0 = hanging out of sight below the view, 1 = across the face. In camera space, metres.
  const UP = { x: 0.01, y: -0.015, z: -0.3, rz: 0.07, rx: 0 };
  const DOWN = { x: -0.16, y: -0.58, z: -0.24, rz: -0.9, rx: 0.5 };
  let raise = 0;
  function update(dt, up) {
    raise += ((up ? 1 : 0) - raise) * (1 - Math.exp(-dt * 11));
    if (!up && raise < 0.004) raise = 0;
    if (up && raise > 0.996) raise = 1;
    group.visible = raise > 0;
    const e = raise * raise * (3 - 2 * raise), mix = (a, b) => a + (b - a) * e;
    group.position.set(mix(DOWN.x, UP.x), mix(DOWN.y, UP.y), mix(DOWN.z, UP.z));
    group.rotation.set(mix(DOWN.rx, UP.rx), 0, mix(DOWN.rz, UP.rz));
  }
  update(0, false);

  return { group, canvas, draw, update, signal, get raise() { return raise; }, get shown() { return shown; } };
}
