// The astronaut. Runs in the Quest browser in VR, or on a laptop screen for testing.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { buildWorld } from '/world.js';
import { buildFixtures } from '/stations.js';
import { CFG, CREW, ROLES, TOOLS, covers } from '/shared/config.js';
import { beltWeight } from '/shared/rules.js';
import { drawTool } from '/shared/icons.js';
import { seatTaken } from '/seat.js';
import { createLobby } from '/lobby.js';

const REACH = 3.2;        // metres: how far away the mouse can work something
const REACH_VR = 1.6;     // metres: pointing in VR is a fallback for grabbing, so it only works close up
const CROUCH = 0.9;       // metres: eye height while C is held on a laptop
const WALK = 2.4;         // m/s
const GRAVITY = 1.62;     // m/s^2, lunar

const net = connect('astronaut');
const radio = new Radio(net);
let state = null, lastEv = 0, rx = false, talking = false, mode = null; // mode: 'vr' | 'desk'
let prompt = '', promptUntil = 0, runStart = 0, lastPhase = '', hitFlash = -9, nextThump = 0;

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic roll-off: the sun is harsh, the shadows stay readable
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 2000);
camera.rotation.order = 'YXZ';
camera.position.y = 1.65; // desktop eye height; the headset overrides this
const rig = new THREE.Group(); // move this to move the player
rig.position.set(CFG.spawn.x, 0, CFG.spawn.z);
rig.add(camera);
scene.add(rig);

const world = buildWorld(THREE, scene, { renderer });
const fx = buildFixtures(THREE, world, { rig, camera, send: a => net.send({ t: 'do', a }), sfx: k => radio.sfx(k) });

const lamp = new THREE.SpotLight(0xfff4e4, 14, 16, 0.65, 0.7, 1.4); // candela; 40 blew out panels at arm's length
lamp.target.position.set(0, -0.15, -1);
camera.add(lamp, lamp.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- heads-up display (a strip locked to the bottom of your view) ----------
const hudCanvas = document.createElement('canvas');
hudCanvas.width = 1024; hudCanvas.height = 160;
const hud = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas);
hudTex.colorSpace = THREE.SRGBColorSpace;
const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.18), new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthTest: false, toneMapped: false }));
hudMesh.position.set(0, -0.4, -1.3);
hudMesh.renderOrder = 10;
camera.add(hudMesh);
let hudKey = '';

function drawHud(now) {
  const s = state;
  const run = !!s && s.phase === 'run';
  // No instructions during a mission: what is wrong and what to do about it comes over the radio.
  let line = now < promptUntil ? prompt : '';
  if (!s) line = 'Connecting to the base...';
  else if (s.phase === 'lobby') line = (iAmReady() ? 'You are GO. ' : (mode !== 'vr' ? 'Click' : usingHands() ? 'Point and pinch' : 'Point and pull the RIGHT TRIGGER') + ' on the READY board when you are set. ')
    + 'Radio check: ' + (mode !== 'vr' ? 'hold T' : usingHands() ? 'left hand to helmet' : 'hold LEFT TRIGGER') + ' and say hello.';
  else if (s.phase === 'results') line = (s.result.won ? 'MISSION COMPLETE' : 'MISSION FAILED') + `   Score ${s.score}.   ${s.result.reason}`;
  else if (!line && now - runStart < 12) line = mode !== 'vr' ? 'T talk.  Click to take a tool or use it.  C crouch.  F patch suit.  G generator.'
    : usingHands() ? 'Left hand to helmet = talk.  Pinch to grab.  Pinch the ground = teleport.' : 'LEFT TRIGGER talk.  GRIP to grab tools off the rack and your belt.';
  const dark = run && !s.powered;
  const radioTxt = dark ? 'NO SIGNAL' : talking ? 'TX' : rx ? 'RX' : '';
  const belt = run ? s.belt : [];
  const refused = now - fx.refusedAt < 0.8, hurt = now - hitFlash < 0.6;
  const key = [line, radioTxt, s && Math.ceil(s.timeLeft), s && Math.round(s.oxygen), belt, refused, hurt, run && s.suit && Math.floor(now * 3) % 2].join('|');
  if (key === hudKey) return;
  hudKey = key;
  const W = hudCanvas.width, H = hudCanvas.height;
  hud.clearRect(0, 0, W, H);
  hud.fillStyle = hurt ? 'rgba(120,10,10,0.8)' : 'rgba(4,10,8,0.72)'; hud.fillRect(0, 0, W, H);
  hud.textBaseline = 'middle';
  if (s && s.oxygen !== undefined) {
    const frac = Math.max(0, Math.min(1, s.oxygen / s.o2Max)), low = s.oxygen < 25;
    hud.font = 'bold 30px monospace'; hud.textAlign = 'left';
    hud.fillStyle = '#7d909c'; hud.fillText('O2', 20, 40);
    hud.strokeStyle = '#7d909c'; hud.lineWidth = 3; hud.strokeRect(74, 22, 300, 36);
    hud.fillStyle = low ? '#ff5c5c' : '#58e08a'; hud.fillRect(78, 26, 292 * frac, 28);
    hud.fillStyle = '#fff'; hud.fillText(String(Math.round(s.oxygen)), 388, 40);
    const t = Math.max(0, Math.ceil(s.timeLeft));
    hud.textAlign = 'right'; hud.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, W - 20, 40);
  }
  if (radioTxt) {
    hud.fillStyle = dark ? '#ff5c5c' : talking ? '#ff5c5c' : '#6fb6ff';
    hud.textAlign = 'center'; hud.font = 'bold 30px monospace';
    hud.fillText(dark ? 'NO SIGNAL' : talking ? 'TRANSMITTING' : 'MISSION OPS ON RADIO', W / 2 + 60, 40);
  }
  if (run) {
    // The belt: one box per weight unit, and what is hanging on it.
    const used = beltWeight(belt), x0 = 20, y0 = 78, u = 56;
    for (let i = 0; i < CFG.beltCapacity; i++) {
      hud.strokeStyle = refused ? '#ff5c5c' : '#7d909c'; hud.lineWidth = 3; hud.strokeRect(x0 + i * (u + 6), y0, u, u);
      if (i < used) { hud.fillStyle = refused ? 'rgba(255,92,92,0.35)' : 'rgba(88,224,138,0.22)'; hud.fillRect(x0 + i * (u + 6) + 3, y0 + 3, u - 6, u - 6); }
    }
    let slot = 0;
    for (const t of belt) { // a heavy tool is drawn across the boxes it fills
      const w = TOOLS[t].weight, cx = x0 + slot * (u + 6) + (w * (u + 6) - 6) / 2;
      drawTool(hud, t, cx, y0 + u / 2, u - 10, '#d6e6e0');
      slot += w;
    }
  }
  hud.fillStyle = '#ffe9a8'; hud.textAlign = 'center';
  let size = 30; hud.font = `bold ${size}px monospace`;
  const room = run ? W - 300 : W - 30, mid = run ? 280 + (W - 280) / 2 : W / 2;
  while (hud.measureText(line).width > room && size > 14) hud.font = `bold ${--size}px monospace`;
  hud.fillText(line, mid, 108);
  hudTex.needsUpdate = true;
}
function say(text, seconds = 6) { prompt = text; promptUntil = performance.now() / 1000 + seconds; }

// ---------- the READY board: how the astronaut readies up, from inside the headset ----------
// It stands just in front of the spawn point while the crew is in the lobby, so the mission can
// never start while the headset is still in someone's hand.
const boardCanvas = document.createElement('canvas');
boardCanvas.width = 768; boardCanvas.height = 480;
const board2d = boardCanvas.getContext('2d');
const boardTex = new THREE.CanvasTexture(boardCanvas);
boardTex.colorSpace = THREE.SRGBColorSpace;
const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.625), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
board.position.set(CFG.spawn.x, 1.65, CFG.spawn.z - 1.7); // eye height, clear of the HUD strip
scene.add(board);
let boardKey = '';
const iAmReady = () => !!state && (state.ready || []).includes('astronaut');
function drawBoard() {
  const s = state;
  board.visible = !!s && s.phase === 'lobby';
  if (!board.visible) return;
  const missing = CREW.filter(r => !s.crew.some(h => covers(h, r)));
  const waiting = CREW.filter(r => r !== 'astronaut' && !(s.ready || []).some(h => covers(h, r)));
  const n = s.countdown == null ? null : Math.max(1, Math.ceil(s.countdown));
  const key = [iAmReady(), missing, waiting, n].join('|');
  if (key === boardKey) return;
  boardKey = key;
  const g = board2d, W = boardCanvas.width, H = boardCanvas.height, go = iAmReady();
  g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
  g.strokeStyle = go ? '#58e08a' : '#ffb84a'; g.lineWidth = 14; g.strokeRect(7, 7, W - 14, H - 14);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = go ? '#58e08a' : '#ffb84a';
  g.font = 'bold 150px monospace'; g.fillText(n != null ? String(n) : go ? 'GO' : 'READY?', W / 2, 170);
  g.fillStyle = '#d6e6e0'; g.font = 'bold 30px monospace';
  g.fillText(n != null ? 'All four GO. Launching...' : go ? 'Trigger again to stand down' : 'Pull the trigger here when set', W / 2, 300);
  g.fillStyle = '#7d909c'; g.font = '26px monospace';
  const wait = missing.length ? 'Seats open: ' + missing.map(r => ROLES[r]).join(', ') : waiting.length ? 'Not ready yet: ' + waiting.map(r => ROLES[r]).join(', ') : 'Mission control is GO';
  g.fillText(n != null ? '' : wait, W / 2, 380);
  boardTex.needsUpdate = true;
}
function useBoard(controller) {
  if (!board.visible) return false;
  aim(controller);
  raycaster.far = REACH;
  if (!raycaster.intersectObject(board, false).length) return false;
  net.send({ t: 'ready', on: !iAmReady() });
  radio.sfx(iAmReady() ? 'mistake' : 'solve');
  return true;
}

// ---------- network ----------
// Take the server's word as it arrives, not once per frame: what can be clicked must never lag behind what exists.
const NOTHING = { belt: [], locker: [], scene: null, suit: false };
net.onState = s => { state = s; lobby.update(s); fx.sync(s.phase === 'run' ? s : NOTHING); };
net.onTaken = seatTaken;
net.onBinary = buf => radio.receive(buf);
net.onMsg = m => { if (m.t === 'ptt') { rx = m.on; radio.rxMarker(m.on); } };

// ---------- controls ----------
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') e.preventDefault(); });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
// Chrome reports one huge movementX/Y on the first event after the pointer locks (the cursor
// snapping to the centre), which used to leave the camera staring at the sky. Clamp it away.
let lockedAt = 0, skipNext = false;
document.addEventListener('pointerlockchange', () => { lockedAt = performance.now(); skipNext = true; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  if (skipNext || performance.now() - lockedAt < 100) { skipNext = false; return; }
  const dx = Math.max(-60, Math.min(60, e.movementX)), dy = Math.max(-60, Math.min(60, e.movementY));
  rig.rotation.y -= dx * 0.0022;
  camera.rotation.x = Math.max(-1.4, Math.min(1.4, camera.rotation.x - dy * 0.0022));
});
// On a laptop the mouse button is the hand: one press clicks, and holding it keeps brushing or welding.
let pressed = null, nextUse = 0; // pressed: null, 'desk', or the controller whose trigger is down
renderer.domElement.addEventListener('mousedown', () => {
  if (mode !== 'desk') return;
  if (document.pointerLockElement !== renderer.domElement) { lockPointer(); return; }
  if (!useBoard(null)) { use(null); pressed = 'desk'; nextUse = performance.now() / 1000 + 0.1; }
});
addEventListener('mouseup', () => { if (pressed === 'desk') pressed = null; });

function lockPointer() { try { renderer.domElement.requestPointerLock()?.catch?.(() => {}); } catch {} }

const raycaster = new THREE.Raycaster();
const tmpM = new THREE.Matrix4(), fwd = new THREE.Vector3(), headPos = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// Point the raycaster where the hand (or, on desktop, the centre of the screen) is pointing.
function aim(controller) {
  if (controller) {
    tmpM.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  } else {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  }
  raycaster.far = controller ? REACH_VR : REACH;
}
function targetInReach(controller) {
  if (!state || state.phase !== 'run') return null;
  aim(controller);
  return raycaster.intersectObjects(fx.targets(), false)[0] || null;
}
// Use whatever is being pointed at. Returns true if there was something. With `holding`, only
// things that work while held down (brushing dust, welding) are used again.
function use(controller, holding = false) {
  const hit = targetInReach(controller);
  if (!hit || (holding && !hit.object.userData.hold)) return !!hit && !holding;
  fx.click(hit.object);
  return true;
}

// ---------- hands and controllers ----------
// Controllers: grip grabs (tools off the rack and the belt, plugs, the wheel), right trigger points
// at things within arm's reach, left trigger talks, sticks walk and turn, A hops.
// Hand tracking (put the controllers down): pinch to grab, pinch at the ground to teleport there,
// pinch the left hand in empty air and drag it sideways to turn, left hand to your helmet to talk.
const TELEPORT_MAX = 8;   // metres per hop
const TURN_STEP = 0.1;    // metres of left-hand drag per 30-degree snap turn
const HELMET = 0.22;      // metres from the head that counts as "hand on helmet"
const ground = new THREE.Plane(UP, 0);
const hitPoint = new THREE.Vector3(), tmpV = new THREE.Vector3();
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0x58e08a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
marker.rotation.x = -Math.PI / 2; marker.visible = false;
scene.add(marker);

// Where the hand's ray meets the ground, if that spot can be stood on.
function groundTarget(controller, out) {
  aim(controller);
  const p = raycaster.ray.intersectPlane(ground, out);
  if (!p || p.distanceTo(raycaster.ray.origin) > TELEPORT_MAX) return null;
  const d = Math.hypot(p.x, p.z);
  return d > CFG.bounds - 1 || d < CFG.habRadius + 0.3 ? null : p;
}
function teleport(p) {
  camera.getWorldPosition(headPos);
  rig.position.x += p.x - headPos.x;
  rig.position.z += p.z - headPos.z;
}
// A hand's sideways offset from the head, in metres, positive to the right.
function lateral(controller) {
  controller.getWorldPosition(tmpV).sub(headPos);
  return tmpV.x * -fwd.z + tmpV.z * fwd.x;
}

const controllers = [], hands = [];
const jointGeo = new THREE.SphereGeometry(0.009, 8, 6);
const jointMat = new THREE.MeshStandardMaterial({ color: 0xe9e7e1, roughness: 0.6 });
let leftDrag = null, helmetTalk = false; // leftDrag = { x } while the left hand is pinched
const usingHands = () => controllers.some(c => c.userData.isHand);

for (const i of [0, 1]) {
  const c = renderer.xr.getController(i);
  c.addEventListener('connected', e => {
    c.userData.hand = e.data.handedness;
    c.userData.isHand = !!e.data.hand;
    if (c.userData.hand !== 'left' && !c.userData.ray) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -REACH)]);
      c.userData.ray = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x58e08a }));
      c.add(c.userData.ray);
    }
  });
  c.addEventListener('disconnected', () => { c.userData.isHand = false; marker.visible = false; leftDrag = null; });
  // Trigger on a controller, pinch on a bare hand: both arrive as "select". A pinch grabs first.
  c.addEventListener('selectstart', () => {
    if (c.userData.isHand && running() && fx.grab(i, handPoint(i, new THREE.Vector3()))) { c.userData.pinched = true; return; }
    if (c.userData.hand === 'left') { if (c.userData.isHand) leftDrag = { x: lateral(c) }; return; }
    if (useBoard(c)) return;
    if (use(c)) { pressed = c; nextUse = performance.now() / 1000 + 0.1; return; }
    if (c.userData.isHand && groundTarget(c, hitPoint)) teleport(hitPoint);
  });
  c.addEventListener('selectend', () => {
    if (c.userData.pinched) { c.userData.pinched = false; fx.release(i, handPoint(i, new THREE.Vector3())); }
    if (c.userData.hand === 'left') leftDrag = null;
    if (pressed === c) pressed = null;
  });
  // The grip button closes the hand.
  c.addEventListener('squeezestart', () => { if (running()) fx.grab(i, handPoint(i, new THREE.Vector3())); });
  c.addEventListener('squeezeend', () => fx.release(i, handPoint(i, new THREE.Vector3())));
  rig.add(c);
  controllers.push(c);

  const h = renderer.xr.getHand(i); // joints appear once the headset starts tracking the hand
  rig.add(h);
  hands.push(h);
}

const running = () => !!state && state.phase === 'run';
// Where this hand's fingers are: the pinch point of a tracked hand, or the controller itself.
function handPoint(i, out) {
  const tip = controllers[i].userData.isHand && hands[i].joints?.['index-finger-tip'];
  return (tip && tip.visible ? tip : controllers[i]).getWorldPosition(out);
}
const handInfo = [0, 1].map(i => ({ obj: null, point: new THREE.Vector3(), side: '' }));

// Draw each tracked joint as a small white ball: a glove, without loading a model.
function drawHand(h) {
  for (const name in h.joints) {
    const j = h.joints[name];
    if (!j.userData.ball) { j.userData.ball = new THREE.Mesh(jointGeo, jointMat); j.add(j.userData.ball); }
    j.userData.ball.scale.setScalar((j.jointRadius || 0.009) / 0.009);
  }
}

// Everything hand tracking adds per frame. Sets ptt and the teleport marker.
function handControls(ptt) {
  for (let i = 0; i < 2; i++) {
    const c = controllers[i];
    if (!c.userData.isHand) continue;
    drawHand(hands[i]);
    if (c.userData.hand === 'left') {
      const tip = hands[i].joints?.['index-finger-tip'];
      (tip && tip.visible ? tip : c).getWorldPosition(tmpV);
      helmetTalk = tmpV.distanceTo(headPos) < (helmetTalk ? HELMET + 0.08 : HELMET);
      if (helmetTalk) ptt = true;
      if (leftDrag) {
        const x = lateral(c), dx = x - leftDrag.x;
        if (Math.abs(dx) > TURN_STEP) { turnRig(-Math.sign(dx) * Math.PI / 6); leftDrag.x = x; }
      }
    } else {
      const p = !fx.holding(i) && !targetInReach(c) && groundTarget(c, hitPoint);
      marker.visible = !!p;
      if (p) marker.position.set(p.x, 0.02, p.z);
    }
  }
  return ptt;
}

function turnRig(angle) { // turn on the spot, around where the head is
  camera.getWorldPosition(headPos);
  rig.position.sub(headPos).applyAxisAngle(UP, angle).add(headPos);
  rig.rotation.y += angle;
}

let vy = 0, turnArmed = true, lastPose = 0, shake = 0;
function control(dt, now) {
  let mx = 0, mz = 0, jump = false, ptt = !!keys.t;
  const session = renderer.xr.getSession();
  camera.getWorldPosition(headPos);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  if (session) {
    ptt = handControls(ptt);
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const sx = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const sy = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      if (src.handedness === 'left') {
        if (Math.abs(sx) > 0.15) mx = sx;
        if (Math.abs(sy) > 0.15) mz = sy;
        if (gp.buttons[0]?.pressed) ptt = true;
      } else {
        if (Math.abs(sx) > 0.6 && turnArmed) { turnRig(-Math.sign(sx) * Math.PI / 6); turnArmed = false; }
        if (Math.abs(sx) < 0.3) turnArmed = true;
        if (gp.buttons[4]?.pressed) jump = true;
      }
    }
  } else {
    mx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    mz = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    jump = !!keys[' '];
    // In a headset you crouch by crouching. On a laptop, hold C.
    camera.position.y += ((keys.c ? CROUCH : 1.65) - camera.position.y) * Math.min(1, dt * 10);
    if (keys.f) fx.patchSuit();
    if (keys.g) fx.pullCord();
  }

  const speed = WALK * dt;
  rig.position.x += (-mz * fwd.x + mx * -fwd.z) * speed;
  rig.position.z += (-mz * fwd.z + mx * fwd.x) * speed;

  if (jump && rig.position.y === 0) vy = 2.0; // a slow, floaty lunar hop
  vy -= GRAVITY * dt;
  rig.position.y = Math.max(0, rig.position.y + vy * dt);
  if (rig.position.y === 0) vy = 0;

  // Stay inside the play area and outside the habitat walls.
  camera.getWorldPosition(headPos);
  const d = Math.hypot(headPos.x, headPos.z);
  if (d > CFG.bounds - 1) { const k = (CFG.bounds - 1) / d; rig.position.x += headPos.x * (k - 1); rig.position.z += headPos.z * (k - 1); }
  if (d < CFG.habRadius && d > 0.01) { const k = CFG.habRadius / d; rig.position.x += headPos.x * (k - 1); rig.position.z += headPos.z * (k - 1); }

  if (ptt !== talking && radio.micOk) { talking = ptt; radio.setTalking(ptt); }

  if (now - lastPose > 0.1) { lastPose = now; sendPose(); }
}
// Tell the server where the astronaut's head is. The server checks reach and cover against this.
function sendPose() {
  camera.getWorldPosition(headPos);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  net.send({ t: 'pose', x: headPos.x, z: headPos.z, ry: Math.atan2(fwd.x, fwd.z), h: headPos.y });
}

// ---------- main loop ----------
let lastFrame = performance.now() / 1000;
renderer.setAnimationLoop(() => {
  const now = performance.now() / 1000, dt = Math.min(0.05, now - lastFrame);
  lastFrame = now;
  const s = state;
  if (s) {
    if (s.phase !== lastPhase) {
      if (s.phase === 'run') { runStart = now; promptUntil = 0; rig.position.set(CFG.spawn.x, 0, CFG.spawn.z); rig.rotation.y = 0; }
      lastPhase = s.phase;
    }
    if (s.ev && s.ev.n !== lastEv) {
      lastEv = s.ev.n;
      const k = s.ev.kind;
      // The astronaut is never told what broke or where: that is mission control's job.
      if (['alarm', 'solve', 'mistake', 'hit', 'blackout', 'power', 'gen', 'end'].includes(k)) radio.sfx(k);
      if (k === 'solve') say(`FIXED  +${s.ev.pts}`, 3);
      if (k === 'hit') hitFlash = now;
    }
    const run = s.phase === 'run';
    if (run) world.apply(s.scene, now);
    world.moveRover(s.rover);

    // Sound: the leak hiss, and rocks landing during a shower.
    const crack = world.fixtures.crack;
    radio.leak(run && s.suit, run && s.scene.hull ? crack.userData.centre : null);
    if (run && s.scene.meteor !== null && now > nextThump) {
      const close = s.scene.meteor > CFG.meteorGraceSeconds;
      nextThump = now + (close ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.6);
      radio.burst(close ? 0.5 : 0.35, close ? 0.4 : 0.12, 'lowpass', close ? 240 : 140);
      // A laptop screen can shake. A headset must not: that is how you make someone ill.
      if (close && mode === 'desk') shake = 0.05;
    }
  }
  world.update(now);
  if (mode) control(dt, now);
  if (pressed && now > nextUse) { nextUse = now + 0.09; use(pressed === 'desk' ? null : pressed, true); }

  // Hands for the fixtures: where a held tool is drawn, and where the fingers are.
  const vr = mode === 'vr';
  if (vr) for (const i of [0, 1]) { handInfo[i].obj = controllers[i]; handInfo[i].side = controllers[i].userData.hand; handPoint(i, handInfo[i].point); }
  fx.update(dt, now, vr ? handInfo : [], vr);

  camera.getWorldPosition(headPos); camera.getWorldDirection(fwd);
  radio.listen(headPos, fwd);
  shake *= 0.86;
  hudMesh.position.x = (Math.random() - 0.5) * shake; hudMesh.position.y = -0.4 + (Math.random() - 0.5) * shake;
  if (mode === 'desk') camera.rotation.z = (Math.random() - 0.5) * shake * 0.6;
  drawBoard();
  drawHud(now);
  renderer.render(scene, camera);
});

// For debugging from the browser console, and for the smoke test: moonbase.state(), moonbase.fx.targets() ...
window.moonbase = { state: () => state, fx, world, radio, rig, camera, net, board, THREE, renderer, scene, use: () => use(null), useBoard: () => useBoard(null), sendPose, teleport, turnRig };

// ---------- start-up screen: the lobby, with the radio and VR steps in the astronaut's panel ----------
const $ = id => document.getElementById(id);
const lobby = createLobby($('gate'), { mine: 'astronaut', actionsEl: () => $('gateActions') });
$('radioBtn').onclick = async () => {
  const mic = await radio.init();
  $('radioBtn').textContent = mic ? 'Radio on' : 'Radio on, no microphone (needs HTTPS or localhost)';
  $('radioBtn').disabled = true;
  $('step2').hidden = false;
};
$('vrSlot').appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));
$('deskBtn').onclick = () => { mode = 'desk'; lobby.show(false); $('cross').hidden = false; lockPointer(); };
renderer.xr.addEventListener('sessionstart', () => { mode = 'vr'; lobby.show(false); });
renderer.xr.addEventListener('sessionend', () => { mode = null; lobby.show(true); });
