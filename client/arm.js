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
// soft wrinkles, the ribbed elbow joint, a red identification stripe and the metal wrist disconnect.
// The hand is the NASA EVA glove model (client/assets/models/glove.glb). Sizes are a suited arm's,
// in metres. The gauge face is a 1960s instrument (docs/DESIGN.md): cream dials with needles, jewel
// lamps, no words or numbers, only icons. Beside it is the EXIT button that ends the headset session.
import { PAL, jewel } from '/shared/palette.js';
import { loadGlove } from '/shared/assets.js';

const W = 640, H = 374;                        // gauge face, in canvas pixels
const FACE_W = 0.17, FACE_H = FACE_W * H / W;  // and in metres: a cuff display, not a tablet
const GREEN = PAL.green, RED = PAL.red, AMBER = PAL.amber, BLUE = PAL.blue, DIM = PAL.rule, INK = PAL.ink;

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
  const whiteWeave = weave('#ebe8df', '#8f8a7c'), redWeave = weave('#9a3428', '#4d1a12'), greyWeave = weave('#c9c9c4', '#6f7074');
  // A touch of emissive keeps the arm readable when the sun is behind the astronaut.
  const cloth = (map, emissive) => new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.95, emissive });
  const fabric = cloth(whiteWeave, 0x121214), stripe = cloth(redWeave, 0x140303), gloveCloth = cloth(greyWeave, 0x0f0f10);
  const silicone = new THREE.MeshStandardMaterial({ color: 0x55616b, roughness: 0.7, emissive: 0x08090a });   // fingertips and knuckle pad
  const webbing = new THREE.MeshStandardMaterial({ color: 0x7d838a, roughness: 0.9, emissive: 0x0a0a0b });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.32, metalness: 0.95 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.7 });
  const anodised = new THREE.MeshStandardMaterial({ color: 0x8e3426, roughness: 0.35, metalness: 0.8 });
  const housing = new THREE.MeshStandardMaterial({ color: PAL.hex.console, roughness: 0.75, metalness: 0.15 }); // painted steel
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
  function tube(x0, x1, radius, mat, steps = 72, parent = group) {
    const pts = [];
    for (let i = 0; i <= steps; i++) { const x = x0 + (x1 - x0) * i / steps; pts.push(new THREE.Vector2(radius(x), x)); }
    const m = add(new THREE.LatheGeometry(pts, 28), mat, 0, 0, AZ, parent);
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
  // Upper arm, running from the elbow to the shoulder. Raised by the radio key (a laptop), it runs down
  // and back to a shoulder out of view; on a tracked arm (a headset) it is aimed at where the shoulder is.
  const UPPER_LEN = 0.36, UPPER_REST = new THREE.Vector3(-0.22, -0.72, 0.66).normalize(), Y = new THREE.Vector3(0, 1, 0), toShoulder = new THREE.Vector3();
  const upper = (() => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const d = UPPER_LEN * i / 40; pts.push(new THREE.Vector2(0.067 + 0.022 * d + 0.002 * Math.sin(d * 80), d)); }
    const m = add(new THREE.LatheGeometry(pts, 28), fabric, ELBOW, 0, AZ);
    const bearing = add(new THREE.TorusGeometry(0.0715, 0.003, 10, 32), satin, 0, 0.15, 0, m); // arm bearing
    bearing.rotation.x = Math.PI / 2; bearing.scale.z = 3.5;
    return m;
  })();
  // Point the upper arm at the shoulder, given in this group's own coordinates; with nothing, back to rest.
  function aimUpper(shoulder) {
    if (!shoulder) { upper.quaternion.setFromUnitVectors(Y, UPPER_REST); upper.scale.y = 1; return; }
    toShoulder.copy(shoulder).sub(upper.position);
    const len = toShoulder.length();
    if (len < 0.05) return;
    upper.quaternion.setFromUnitVectors(Y, toShoulder.divideScalar(len));
    upper.scale.y = Math.max(0.5, Math.min(1.3, len / UPPER_LEN));
  }
  aimUpper(null);

  // Wrist: the glove's gauntlet over the end of the sleeve, then the metal disconnect.
  tube(WRIST - 0.022, WRIST + 0.012, x => 0.0555 + 0.03 * (x - WRIST), gloveCloth, 6);
  const metalRing = add(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 32), aluminium, WRIST + 0.022, 0, AZ);
  metalRing.rotation.z = Math.PI / 2;
  ring(WRIST + 0.036, 0.049, 0.004, 0.008, anodised);
  for (let i = 0; i < 6; i++) { // locking tabs round the disconnect
    const a = i / 6 * Math.PI * 2 + 0.4;
    add(new THREE.BoxGeometry(0.012, 0.008, 0.008), aluminium, WRIST + 0.022, Math.cos(a) * 0.054, AZ + Math.sin(a) * 0.054).rotation.x = -a;
  }
  // Glove: the NASA EVA glove, back of the hand toward the eyes, its cuff over the disconnect ring. It is
  // a group of its own because a headset draws the real hand (a controller's glove, or the tracked
  // fingers) instead. The model arrives a moment after the arm is built.
  const glove = new THREE.Group();
  glove.name = 'Hand';
  group.add(glove);
  loadGlove(THREE, { emissive: 0x121214 }).then(m => {
    m.position.set(WRIST + 0.024, 0, AZ);
    m.traverse(o => { if (o.isMesh) o.renderOrder = 10; });
    glove.add(m);
  }).catch(e => console.warn('glove model', e));

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
  // The EXIT button, on a plate at the elbow end of the cuff: a red-collared plunger under a guard ring,
  // and an engraved label. Hold a fingertip on it (client/astronaut.js) and the cap sinks, the lamp in it
  // lights, and the headset session ends: the way back to the lobby without taking the headset off.
  const EXIT_X = -FACE_W / 2 - 0.03, EXIT_Y = 0.006;
  const exitButton = new THREE.Group();
  exitButton.name = 'Button_Exit';
  exitButton.position.set(EXIT_X, EXIT_Y, -0.006);
  group.add(exitButton);
  {
    const shape = new THREE.Shape(); // a rounded plate, bevelled, on the side of the housing
    const pw = 0.038, ph = 0.05, pr = 0.006;
    shape.moveTo(-pw / 2 + pr, -ph / 2); shape.lineTo(pw / 2 - pr, -ph / 2); shape.quadraticCurveTo(pw / 2, -ph / 2, pw / 2, -ph / 2 + pr);
    shape.lineTo(pw / 2, ph / 2 - pr); shape.quadraticCurveTo(pw / 2, ph / 2, pw / 2 - pr, ph / 2); shape.lineTo(-pw / 2 + pr, ph / 2);
    shape.quadraticCurveTo(-pw / 2, ph / 2, -pw / 2, ph / 2 - pr); shape.lineTo(-pw / 2, -ph / 2 + pr); shape.quadraticCurveTo(-pw / 2, -ph / 2, -pw / 2 + pr, -ph / 2);
    const plate = add(new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 }), housing, 0, -0.008, -0.002, exitButton);
    plate.name = 'Plate';
    const label = document.createElement('canvas'); label.width = 128; label.height = 48;
    const lg = label.getContext('2d');
    lg.fillStyle = PAL.dial; lg.fillRect(0, 0, 128, 48);
    lg.strokeStyle = PAL.inkDial; lg.lineWidth = 3; lg.strokeRect(4, 4, 120, 40);
    lg.fillStyle = PAL.inkDial; lg.font = 'bold 30px "Courier Prime", "Courier New", monospace'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
    lg.fillText('EXIT', 64, 26);
    const labelTex = new THREE.CanvasTexture(label); labelTex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(0.03, 0.0112), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.8, metalness: 0, emissive: 0x18160f }), 0, -0.024, 0.0056, exitButton).name = 'Label';
    const guard = add(new THREE.TorusGeometry(0.0115, 0.0022, 8, 24), aluminium, 0, 0.004, 0.0062, exitButton); // guard ring
    guard.name = 'Guard';
    const collar = add(new THREE.CylinderGeometry(0.0095, 0.0105, 0.004, 24), anodised, 0, 0.004, 0.0062, exitButton);
    collar.rotation.x = Math.PI / 2;
  }
  // The cap: a Bakelite plunger, rounded on top, with a jewel lamp in its crown.
  const capPts = [[0, 0], [0.0078, 0], [0.0078, 0.006], [0.0072, 0.0075], [0.0055, 0.0085], [0, 0.009]].map(([r, y]) => new THREE.Vector2(r, y));
  const exitCap = add(new THREE.LatheGeometry(capPts, 24), new THREE.MeshStandardMaterial({ color: PAL.hex.bakelite, roughness: 0.45, metalness: 0 }), 0, 0.004, 0.006, exitButton);
  exitCap.rotation.x = Math.PI / 2; exitCap.name = 'Cap';
  const exitLampMat = new THREE.MeshBasicMaterial({ color: PAL.hex.redOff, toneMapped: false });
  const exitLamp = add(new THREE.CircleGeometry(0.0042, 20), exitLampMat, 0, 0.0091, 0, exitCap);
  exitLamp.rotation.x = -Math.PI / 2; exitLamp.name = 'Lamp_Exit';
  // Where a fingertip has to be to press it, in this group's coordinates, and how far the cap sinks.
  const EXIT_TOP = new THREE.Vector3(EXIT_X, EXIT_Y + 0.004, 0.012);
  let pressing = 0;
  // 0..1: how far the button is pressed. Moves the cap and lights the lamp. `invite`: the lamp is in
  // its amber "press me" blink and lit this frame (the caller times the blink); a finger on it wins.
  let invited = false;
  function pressExit(f, invite = false) {
    pressing = Math.max(0, Math.min(1, f));
    invited = invite;
    exitCap.position.z = 0.006 - 0.004 * pressing;
    exitLampMat.color.setHex(pressing > 0 ? PAL.hex.red : invite ? PAL.hex.amber : PAL.hex.redOff);
    if (pressing > 0 && pressing < 1) exitLampMat.color.multiplyScalar(0.55 + 0.45 * pressing);
  }

  // Radio lamp in the top edge of the bezel: a long jewel, dark until the radio does something.
  const SIGNAL = { tx: PAL.hex.red, rx: PAL.hex.blue, nomic: PAL.hex.amber, dead: PAL.hex.redOff };
  const stripMat = new THREE.MeshBasicMaterial({ color: PAL.hex.consoleDeep, toneMapped: false });
  add(new THREE.BoxGeometry(FACE_W * 0.5, 0.0035, 0.003), stripMat, 0, FACE_H / 2 + 0.004, 0);
  function signal(radio, now) {
    if (!SIGNAL[radio]) { stripMat.color.setHex(PAL.hex.consoleDeep); return; }
    const pulse = radio === 'tx' ? 0.75 + 0.25 * Math.sin(now * 9) : 1; // transmitting: a slow filament throb
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
  // A cream dial face in a bezel: dark ticks, a red-painted arc over the bad range, a thin dark needle
  // with a counterweight and a brass hub. The needle is drawn last, by needle(), over the icon.
  function dial(cx, cy, r, redBelow, redColour = PAL.red) {
    g.fillStyle = PAL.bezel; g.beginPath(); g.arc(cx, cy, r + 22, 0, 7); g.fill();
    g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(cx, cy, r + 16, 0, 7); g.fill();
    const face = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r + 14);
    face.addColorStop(0, PAL.dial); face.addColorStop(1, '#c9bfa4'); // a little shade toward the rim
    g.fillStyle = face; g.beginPath(); g.arc(cx, cy, r + 13, 0, 7); g.fill();
    g.lineCap = 'butt';
    if (redBelow) { g.globalAlpha = 0.6; g.strokeStyle = redColour; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, r + 2, A0, A0 + SWEEP * redBelow); g.stroke(); g.globalAlpha = 1; }
    g.strokeStyle = PAL.inkDial;
    for (let i = 0; i <= 10; i++) {
      const a = A0 + SWEEP * i / 10, major = i % 5 === 0, r0 = r - (major ? 10 : 4), r1 = r + 8;
      g.lineWidth = major ? 5 : 3;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
  }
  function needle(cx, cy, r, frac) {
    const a = A0 + SWEEP * Math.max(0, Math.min(1, frac)), c = Math.cos(a), sn = Math.sin(a);
    g.strokeStyle = PAL.inkDial; g.lineCap = 'round';
    g.lineWidth = 5; g.beginPath(); g.moveTo(cx - c * 18, cy - sn * 18); g.lineTo(cx + c * (r - 4), cy + sn * (r - 4)); g.stroke();
    g.lineWidth = 11; g.beginPath(); g.moveTo(cx - c * 10, cy - sn * 10); g.lineTo(cx - c * 22, cy - sn * 22); g.stroke(); // counterweight
    g.fillStyle = PAL.foilGold; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();                                       // brass hub
    g.fillStyle = PAL.inkDial; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
  }
  // Oxygen: a gas bottle, filled to the level left.
  function bottle(cx, cy, frac, colour) {
    const body = () => { g.beginPath(); g.roundRect(cx - 22, cy - 26, 44, 66, 14); };
    g.save(); body(); g.clip();
    g.fillStyle = '#cfc5aa'; g.fillRect(cx - 22, cy - 26, 44, 66);
    g.fillStyle = colour; g.fillRect(cx - 22, cy + 40 - 66 * frac, 44, 66 * frac);
    g.restore();
    g.strokeStyle = PAL.inkDial; g.lineWidth = 6; g.lineJoin = 'round'; body(); g.stroke();
    g.fillStyle = PAL.inkDial; g.fillRect(cx - 7, cy - 38, 14, 12);         // neck
    g.beginPath(); g.roundRect(cx - 17, cy - 46, 34, 9, 4); g.fill();       // valve
  }
  // Time: an hourglass, the sand in the top bulb running out.
  function hourglass(cx, cy, frac, colour, lit) {
    const h = 40, w = 30;
    const bulb = top => { g.beginPath(); g.moveTo(cx - w, cy + (top ? -h : h)); g.lineTo(cx + w, cy + (top ? -h : h)); g.lineTo(cx, cy); g.closePath(); };
    for (const top of [true, false]) {
      g.save(); bulb(top); g.clip();
      g.fillStyle = '#cfc5aa'; g.fillRect(cx - w, cy - h, w * 2, h * 2);
      if (lit) {
        g.fillStyle = colour;
        const f = Math.sqrt(top ? frac : 1 - frac); // a triangle's area goes as its height squared
        if (top) g.fillRect(cx - w, cy - h * f, w * 2, h * f); else g.fillRect(cx - w, cy + h - h * f * 0.7, w * 2, h);
      }
      g.restore();
      g.strokeStyle = lit ? PAL.inkDial : PAL.inkDim; g.lineWidth = 5; g.lineJoin = 'round'; bulb(top); g.stroke();
    }
    g.strokeStyle = lit ? PAL.inkDial : PAL.inkDim; g.lineWidth = 7; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx - w - 5, cy + s * (h + 4)); g.lineTo(cx + w + 5, cy + s * (h + 4)); g.stroke(); }
  }
  function tick(cx, cy, colour) { // done, fixed, mission complete
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [c, w] of [[PAL.inkDial, 23], [colour, 14]]) {
      g.strokeStyle = c; g.lineWidth = w;
      g.beginPath(); g.moveTo(cx - 36, cy + 2); g.lineTo(cx - 10, cy + 28); g.lineTo(cx + 38, cy - 28); g.stroke();
    }
  }
  function cross(cx, cy, colour) { // mistake, mission failed
    g.lineCap = 'round';
    for (const [c, w] of [[PAL.inkDial, 23], [colour, 14]]) {
      g.strokeStyle = c; g.lineWidth = w;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx - 30, cy - 30 * s); g.lineTo(cx + 30, cy + 30 * s); g.stroke(); }
    }
  }
  // Radio: a microphone. Solid, with sound coming off it, while you are on the air; an outline when the
  // radio is off; a bar through it when it cannot work (no microphone, or no signal).
  function microphone(cx, cy, colour, live, barred) {
    g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(cx - 15, cy - 50, 30, 58, 15);            // the capsule
    if (live) g.fill();
    g.stroke();
    g.beginPath(); g.arc(cx, cy - 8, 29, 0, Math.PI); g.stroke();          // the cradle under it
    g.beginPath(); g.moveTo(cx, cy + 21); g.lineTo(cx, cy + 46); g.moveTo(cx - 20, cy + 48); g.lineTo(cx + 20, cy + 48); g.stroke(); // stem and foot
    for (let i = 0; i < 2; i++) {                                           // sound, either side
      g.strokeStyle = live ? colour : DIM; g.lineWidth = 6;
      const r = 42 + i * 14;
      g.beginPath(); g.arc(cx, cy - 22, r, -0.5, 0.5); g.stroke();
      g.beginPath(); g.arc(cx, cy - 22, r, Math.PI - 0.5, Math.PI + 0.5); g.stroke();
    }
    if (barred) { g.strokeStyle = barred; g.lineWidth = 9; g.beginPath(); g.moveTo(cx - 44, cy + 52); g.lineTo(cx + 44, cy - 58); g.stroke(); }
  }
  // Mission Ops talking to you: a loudspeaker with sound coming out of it.
  function speaker(cx, cy, colour) {
    g.strokeStyle = colour; g.fillStyle = colour; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 44, cy - 16); g.lineTo(cx - 24, cy - 16); g.lineTo(cx + 2, cy - 40); g.lineTo(cx + 2, cy + 38); g.lineTo(cx - 24, cy + 14); g.lineTo(cx - 44, cy + 14); g.closePath();
    g.fill(); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx + 2, cy - 1, 18 + i * 15, -0.75, 0.75); g.stroke(); }
  }
  // Alarm: a warning triangle, lit while one is active.
  function warning(cx, cy, lit) {
    g.beginPath(); g.moveTo(cx, cy - 30); g.lineTo(cx + 34, cy + 26); g.lineTo(cx - 34, cy + 26); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 9;
    g.strokeStyle = PAL.bezel; g.stroke();                       // a triangular jewel in a bezel
    if (lit) { g.shadowColor = AMBER; g.shadowBlur = 14; }
    g.fillStyle = lit ? AMBER : PAL.amberOff; g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = g.fillStyle = lit ? PAL.inkDial : '#2a1f0c'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 6); g.stroke();
    g.beginPath(); g.arc(cx, cy + 17, 4, 0, Math.PI * 2); g.fill();
  }
  // Visor zoom: a magnifying glass, with a row of pips for how far in.
  function magnifier(cx, cy, level) {
    const colour = level > 0 ? INK : PAL.inkDim;
    g.strokeStyle = colour; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.arc(cx - 6, cy - 6, 19, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx + 9, cy + 9); g.lineTo(cx + 26, cy + 26); g.stroke();
    for (let i = 0; i < 5; i++) jewel(g, cx - 34 + i * 17, cy + 46, 6, 'green', i < level);
  }

  // Draw an icon made for the point (0, 0) at (cx, cy), k times its size.
  const at = (cx, cy, k, icon) => { g.save(); g.translate(cx, cy); g.scale(k, k); icon(); g.restore(); };

  let key = '', shown = null; // shown: what the face last drew, in words, for the smoke test
  // info = { state, radio: '' | 'tx' | 'rx' | 'nomic', zoom, total, status: '' | 'ok' | 'bad' | 'won' | 'lost' | 'standby', debrief }.
  // With `debrief` the gauges give way to the mission's outcome (status 'won' or 'lost').
  // Redraws only when something shown changes.
  function draw(info) {
    const s = info.state;
    const o2 = s ? Math.round(s.oxygen) : null, t = s ? Math.max(0, Math.ceil(s.timeLeft)) : null, alarms = info.alarms || 0;
    const belt = info.belt || 0, cap = info.capacity || 0;
    const level = info.zoom > 1.01 ? Math.max(1, Math.min(5, Math.round(info.zoom - 1))) : 0;
    const debrief = !!info.debrief;
    const k = [o2, s && s.o2Max, t, alarms, info.radio, level, info.status, belt, cap, debrief].join('|');
    if (k === key) return;
    key = k;

    const radio = { tx: ['TRANSMITTING', RED, 'red'], rx: ['MISSION OPS', BLUE, 'blue'], nomic: ['NO MICROPHONE', AMBER, 'amber'], dead: ['NO SIGNAL', RED, 'red'] }[info.radio];
    // A painted panel in a bezel, with a screw in each corner. The radio state is a lamp, not a frame flood.
    g.fillStyle = PAL.consoleDeep; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.05;
    for (let i = 0; i < 90; i++) { g.fillStyle = i % 2 ? PAL.bakelite : PAL.inkDim; g.fillRect((i * 151) % W, (i * 67) % H, 3 + (i % 5), 2); } // fixed wear, not random
    g.globalAlpha = 1;
    g.strokeStyle = PAL.bezel; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12);
    g.strokeStyle = PAL.bakelite; g.lineWidth = 2; g.strokeRect(12, 12, W - 24, H - 24);
    for (const [x, y] of [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]]) {
      g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.strokeStyle = PAL.bakelite; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 2); g.lineTo(x + 4, y + 2); g.stroke();
    }

    if (debrief) {
      // The debrief: one cream placard over both dials with a big tick (mission complete) or cross
      // (mission failed), and an engraved arrow to the EXIT button at the elbow end of the cuff.
      g.fillStyle = PAL.bezel; g.beginPath(); g.roundRect(44, 34, 402, 306, 6); g.fill();
      g.fillStyle = PAL.bakelite; g.beginPath(); g.roundRect(50, 40, 390, 294, 4); g.fill();
      const face = g.createRadialGradient(200, 120, 20, 245, 187, 260);
      face.addColorStop(0, PAL.dial); face.addColorStop(1, '#c9bfa4');
      g.fillStyle = face; g.beginPath(); g.roundRect(54, 44, 382, 286, 3); g.fill();
      if (info.status === 'won') at(262, 187, 2.5, () => tick(0, 0, GREEN));
      else at(262, 187, 2.5, () => cross(0, 0, RED));
      g.fillStyle = PAL.inkDial; g.lineJoin = 'round'; // the arrow, pointing out of the face toward EXIT
      g.beginPath(); g.moveTo(68, 187); g.lineTo(100, 161); g.lineTo(100, 177); g.lineTo(124, 177); g.lineTo(124, 197); g.lineTo(100, 197); g.lineTo(100, 213); g.closePath(); g.fill();
    } else {
      // Suit oxygen: the needle on the dial, a bottle below the hub filled to the level left.
      const frac = s ? Math.max(0, Math.min(1, s.oxygen / s.o2Max)) : 0, low = s ? s.oxygen < 25 : false;
      dial(122, 182, 80, s ? Math.min(1, 25 / s.o2Max) : 0.25);
      at(122, 236, 0.5, () => bottle(0, 0, frac, low ? RED : GREEN));
      needle(122, 182, 80, frac);
      jewel(g, 122, 330, 13, 'red', low);                    // low-oxygen lamp under the dial

      // Mission clock, or the outcome: a tick for fixed or complete, a cross for a mistake or failed.
      const left = s && info.total ? Math.max(0, Math.min(1, s.timeLeft / info.total)) : 0;
      const running = !!s && info.status !== 'standby', hurry = running && t <= 30;
      dial(338, 182, 80, 30 / (info.total || 300), PAL.amber);
      at(338, 236, 0.5, () => hourglass(0, 0, left, hurry ? AMBER : PAL.inkDial, running));
      needle(338, 182, 80, running ? left : 0);
      if (info.status === 'ok' || info.status === 'won') at(338, 182, 1.15, () => tick(0, 0, GREEN));
      else if (info.status === 'bad' || info.status === 'lost') at(338, 182, 1.15, () => cross(0, 0, RED));
      jewel(g, 338, 330, 13, 'amber', hurry);               // hurry lamp under the dial
    }

    // Radio: a lamp in the radio's colour above the microphone or the loudspeaker.
    jewel(g, 506, 70, 17, radio ? radio[2] : 'white', !!radio && info.radio !== 'dead');
    if (info.radio === 'rx') speaker(506, 196, BLUE);
    else microphone(506, 198, radio ? radio[1] : PAL.inkDim, info.radio === 'tx', info.radio === 'dead' ? RED : info.radio === 'nomic' ? AMBER : null);

    // The tool belt: a row of jewel lamps, one per weight unit it can carry, lit for each unit in use.
    for (let i = 0; i < cap; i++) jewel(g, 468 + i * 30, 330, 10, belt >= cap ? 'amber' : 'green', i < belt);
    for (let i = 0; i < 2; i++) at(592, 96 + i * 72, 0.78, () => warning(0, 0, i < alarms));
    at(594, 258, 0.88, () => magnifier(0, 0, level));

    tex.needsUpdate = true;
    shown = { radio: radio ? radio[0] : 'STANDBY', icon: info.radio === 'rx' ? 'speaker' : info.radio === 'tx' ? 'microphone, live' : radio ? 'microphone, barred' : 'microphone, off', lamp: radio ? radio[1] : null, oxygen: o2, seconds: t, alarms, zoomPips: level, status: info.status || '', belt, debrief };
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

  // ---------- following a real arm (a headset) ----------
  // In a headset the cuff is on your own left arm, not swung up for you. `source` is the matrix of what
  // the headset tracks, in the space this group is parented in:
  //   'hand'        the wrist joint of a tracked hand. WebXR: -z runs to the fingers, +y out of the back of the hand.
  //   'controller'  a held controller's pointing pose. Its glove (client/stations.js) runs down and back
  //                 from it by GLOVE_TILT, and the forearm carries on along that line; thumb up is +y.
  // Each is turned into this model's axes (x to the hand, z out of the face of the display, on the back
  // of the forearm) and slid so the wrist ring sits just behind the tracked wrist or the glove's cuff.
  const GLOVE_TILT = 0.6;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const fit = (xAxis, yAxis, zAxis, anchor, tilt = 0) => new THREE.Matrix4().makeRotationX(tilt)
    .multiply(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis))
    .multiply(new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z));
  const FIT = {
    hand: fit(V3(0, 0, -1), V3(-1, 0, 0), V3(0, 1, 0), V3(WRIST + 0.05, 0, AZ)),
    controller: fit(V3(0, 0, -1), V3(0, -1, 0), V3(-1, 0, 0), V3(WRIST + 0.172, 0, AZ), GLOVE_TILT),
  };
  let tracked = false;
  // Start or stop following. While following, `update` is not used: the real arm decides where this is.
  function setTracked(on) {
    tracked = on;
    group.matrixAutoUpdate = !on;
    glove.visible = !on;
    if (on) { group.visible = false; raise = 0; } else { aimUpper(null); update(0, false); }
  }
  // Put the arm on what is tracked this frame, or hide it if nothing is (`source` null).
  function follow(source, kind) {
    group.visible = !!source;
    if (!source) return;
    group.matrix.multiplyMatrices(source, FIT[kind]);
    group.matrixWorldNeedsUpdate = true;
  }

  return { group, canvas, draw, update, signal, setTracked, follow, aimUpper, exitButton, EXIT_TOP, pressExit, get pressing() { return pressing; }, get invited() { return invited; }, get tracked() { return tracked; }, get raise() { return raise; }, get shown() { return shown; } };
}
