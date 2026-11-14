// The astronaut's left arm and the gauge cluster strapped to it. There is nothing drawn on the
// visor: everything the astronaut may know about the suit and the mission is on this cluster, and
// the arm only comes up in front of the face while the radio is keyed.
//
// Add `arm.group` to the camera. Call `arm.update(dt, radioKeyed)` every frame and `arm.draw(info)`
// whenever the arm is in view. The arm coming up is itself the sign that the radio is keyed; the
// light bar on top of the cluster, the frame round the face and the RADIO lamp say what the radio
// is doing: red while transmitting, blue while Mission Ops is talking, amber with no microphone.

const W = 1024, H = 632;                       // gauge face, in canvas pixels
const FACE_W = 0.34, FACE_H = FACE_W * H / W;  // and in metres
const GREEN = '#58e08a', RED = '#ff5c5c', AMBER = '#ffb347', BLUE = '#6fb6ff', DIM = '#5d6d76', INK = '#e8f0f2';

export function buildArm(THREE) {
  const group = new THREE.Group();
  group.scale.setScalar(1.12); // a little larger than life: across the face it should fill most of the view
  const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.renderOrder = 10; group.add(m); return m; };

  // A touch of emissive on the suit keeps the arm readable when the sun is behind the astronaut.
  const fabric = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.92, emissive: 0x15161a });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.85, emissive: 0x0a0b0c });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f5fbf, roughness: 0.4, metalness: 0.6 });
  const housing = new THREE.MeshStandardMaterial({ color: 0x23282d, roughness: 0.6, metalness: 0.5 });
  const strap = new THREE.MeshStandardMaterial({ color: 0xd9662b, roughness: 0.8 });

  // The forearm lies along x: elbow to the left, glove to the right. The gauge face is at the
  // group's origin, facing the eyes (+z); the sleeve sits behind it.
  const SLEEVE_R = 0.085, SLEEVE_Z = -0.115;
  const along = m => { m.rotation.z = Math.PI / 2; return m; };
  along(mk(new THREE.CapsuleGeometry(SLEEVE_R, 0.62, 6, 20), fabric, -0.16, 0, SLEEVE_Z));
  for (const x of [-0.42, -0.31, -0.2, 0.2]) {  // folds in the pressure garment; the gauge covers the middle
    const fold = mk(new THREE.TorusGeometry(SLEEVE_R + 0.004, 0.011, 8, 28), fabric, x, 0, SLEEVE_Z);
    fold.rotation.y = Math.PI / 2;
  }
  along(mk(new THREE.CylinderGeometry(0.078, 0.078, 0.035, 28), blue, 0.245, 0, SLEEVE_Z));   // wrist disconnect ring
  along(mk(new THREE.CylinderGeometry(0.082, 0.082, 0.012, 28), metal, 0.268, 0, SLEEVE_Z));
  // Glove: a loose fist, knuckles toward the eyes.
  const palm = mk(new THREE.SphereGeometry(0.075, 20, 14), rubber, 0.35, -0.005, SLEEVE_Z);
  palm.scale.set(1.15, 1.0, 0.8);
  for (let i = 0; i < 4; i++) {
    const finger = mk(new THREE.CapsuleGeometry(0.019, 0.05, 4, 10), rubber, 0.405, 0.05 - i * 0.036, SLEEVE_Z + 0.045);
    finger.rotation.z = Math.PI / 2; finger.rotation.y = 0.5;
  }
  const thumb = mk(new THREE.CapsuleGeometry(0.021, 0.055, 4, 10), rubber, 0.34, 0.078, SLEEVE_Z + 0.03);
  thumb.rotation.z = Math.PI / 2 - 0.5;

  // The cluster: a housing strapped round the sleeve, with the gauge face on the front.
  mk(new THREE.BoxGeometry(FACE_W + 0.03, FACE_H + 0.03, 0.05), housing, 0, 0, -0.027);
  for (const x of [-0.13, 0.13]) {
    const band = mk(new THREE.TorusGeometry(SLEEVE_R + 0.012, 0.014, 6, 28), strap, x, 0, SLEEVE_Z);
    band.rotation.y = Math.PI / 2; band.scale.set(1, 1, 2.2);
  }
  for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { // corner bolts
    const bolt = mk(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10), metal, x * (FACE_W / 2 + 0.006), y * (FACE_H / 2 + 0.006), 0);
    bolt.rotation.x = Math.PI / 2;
  }

  // Radio light bar along the top edge of the housing. Dark until the radio does something.
  const SIGNAL = { tx: 0xff3b3b, rx: 0x4da3ff, nomic: 0xffa52e };
  const barMat = new THREE.MeshBasicMaterial({ color: 0x1a1f24, toneMapped: false });
  mk(new THREE.BoxGeometry(FACE_W * 0.72, 0.016, 0.02), barMat, 0, FACE_H / 2 + 0.024, -0.012);
  mk(new THREE.BoxGeometry(FACE_W * 0.78, 0.012, 0.03), housing, 0, FACE_H / 2 + 0.02, -0.03);
  function signal(radio, now) {
    if (!SIGNAL[radio]) { barMat.color.setHex(0x1a1f24); return; }
    const pulse = radio === 'tx' ? 0.7 + 0.3 * Math.sin(now * 9) : 1; // transmitting: a quick throb
    barMat.color.setHex(SIGNAL[radio]).multiplyScalar(pulse);
  }

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  mk(new THREE.PlaneGeometry(FACE_W, FACE_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 0, 0, 0.0005);

  // ---------- drawing the gauge face ----------
  const A0 = Math.PI * 0.75, SWEEP = Math.PI * 1.5; // dials run from bottom-left, clockwise, to bottom-right
  function dial(cx, cy, r, frac, colour, redBelow) {
    g.lineCap = 'butt';
    g.strokeStyle = '#1b2329'; g.lineWidth = 22;
    g.beginPath(); g.arc(cx, cy, r, A0, A0 + SWEEP); g.stroke();
    if (redBelow) { g.strokeStyle = '#5a1f1f'; g.beginPath(); g.arc(cx, cy, r, A0, A0 + SWEEP * redBelow); g.stroke(); }
    g.strokeStyle = colour;
    g.beginPath(); g.arc(cx, cy, r, A0, A0 + SWEEP * Math.max(0.004, Math.min(1, frac))); g.stroke();
    g.strokeStyle = DIM; g.lineWidth = 3;
    for (let i = 0; i <= 10; i++) {
      const a = A0 + SWEEP * i / 10, r0 = r + 15, r1 = r + (i % 5 ? 24 : 32);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
  }
  function label(text, x, y, size, colour, align = 'center') {
    g.font = `bold ${size}px monospace`; g.fillStyle = colour; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(text, x, y);
  }
  function lamp(x, y, w, h, title, value, colour, lit) {
    g.fillStyle = lit ? colour : '#141a1f';
    g.strokeStyle = lit ? colour : '#2a343b'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); g.stroke();
    label(title, x + 16, y + 26, 22, lit ? '#06100b' : DIM, 'left');
    let size = 40; g.font = `bold ${size}px monospace`;
    while (g.measureText(value).width > w - 28 && size > 18) g.font = `bold ${--size}px monospace`;
    g.fillStyle = lit ? '#06100b' : '#77868f'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(value, x + 16, y + 68);
  }
  function wrap(text, maxWidth, maxLines) {
    const lines = [];
    let cur = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = cur ? cur + ' ' + word : word;
      if (cur && g.measureText(next).width > maxWidth) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.length <= maxLines ? lines : null;
  }

  let key = '', shown = null; // shown: what the face last drew, in words, for the smoke test
  // info = { state, line, radio: '' | 'tx' | 'rx' | 'nomic', zoom, total }. Redraws only when something shown changes.
  function draw(info) {
    const s = info.state;
    const o2 = s ? Math.round(s.oxygen) : null, t = s ? Math.max(0, Math.ceil(s.timeLeft)) : null, alarms = s ? s.issues.length : 0;
    const zoom = info.zoom > 1.01 ? info.zoom.toFixed(1) : '';
    const k = [o2, s && s.o2Max, t, alarms, s && s.phase, info.radio, zoom, info.line].join('|');
    if (k === key) return;
    key = k;

    const radio = { tx: ['TRANSMITTING', RED], rx: ['MISSION OPS', BLUE], nomic: ['NO MICROPHONE', AMBER] }[info.radio];
    g.fillStyle = '#0a0e11'; g.fillRect(0, 0, W, H);
    g.strokeStyle = radio ? radio[1] : '#2a343b'; g.lineWidth = radio ? 10 : 4; // the frame lights up with the radio
    g.beginPath(); g.roundRect(8, 8, W - 16, H - 16, 22); g.stroke();

    // Suit oxygen.
    const frac = s ? Math.max(0, Math.min(1, s.oxygen / s.o2Max)) : 0, low = s ? s.oxygen < 25 : false;
    dial(190, 222, 128, frac, low ? RED : GREEN, s ? Math.min(1, 25 / s.o2Max) : 0.25);
    label(s ? String(o2) : '--', 190, 214, 92, low ? RED : INK);
    label('SUIT O2', 190, 318, 30, low ? RED : DIM);

    // Mission clock.
    const run = s && s.phase === 'run', hurry = run && t <= 30;
    dial(512, 222, 128, s && info.total ? s.timeLeft / info.total : 0, hurry ? AMBER : BLUE);
    label(s ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : '-:--', 512, 214, 84, hurry ? AMBER : INK);
    label('TIME LEFT', 512, 318, 30, DIM);

    // Status lamps.
    lamp(704, 50, 286, 100, 'RADIO', radio ? radio[0] : 'STANDBY', radio ? radio[1] : GREEN, !!radio);
    lamp(704, 164, 286, 100, 'ALARMS', alarms ? `${alarms} ACTIVE` : 'NONE', AMBER, alarms > 0);
    lamp(704, 278, 286, 100, 'VISOR ZOOM', zoom ? zoom + 'x' : 'OFF', GREEN, !!zoom);

    // Message strip.
    g.fillStyle = '#0c1a12'; g.strokeStyle = '#1f3a2a'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(34, 402, W - 68, 196, 14); g.fill(); g.stroke();
    let size = 46, lines = null;
    for (; size >= 22 && !lines; size -= 2) { g.font = `bold ${size}px monospace`; lines = wrap(info.line || '', W - 120, size > 34 ? 3 : 4); }
    lines = lines || [info.line];
    size += 2;
    g.fillStyle = '#ffe9a8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((ln, i) => g.fillText(ln, W / 2, 500 + (i - (lines.length - 1) / 2) * size * 1.2));
    tex.needsUpdate = true;
    shown = { radio: radio ? radio[0] : 'STANDBY', frame: radio ? radio[1] : null, oxygen: o2, seconds: t, alarms, zoom: zoom || 'OFF', message: lines.join(' ') };
  }

  // ---------- raising and lowering ----------
  // 0 = hanging out of sight below the view, 1 = across the face. In camera space, metres.
  const UP = { x: 0, y: -0.01, z: -0.34, rz: 0.05, rx: 0 };
  const DOWN = { x: -0.22, y: -0.62, z: -0.3, rz: -0.95, rx: 0.5 };
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

  return { group, draw, update, signal, get raise() { return raise; }, get shown() { return shown; } };
}
