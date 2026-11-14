// The astronaut. Runs in the Quest browser in VR, or on a laptop screen for testing.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { buildWorld } from '/world.js';
import { buildFixtures } from '/stations.js';
import { buildInterior, ROOM } from '/interior.js';
import { CFG, CREW, ROLES, PLACES, covers } from '/shared/config.js';
import { beltWeight, sheltered } from '/shared/rules.js';
import { seatTaken, kicked } from '/seat.js';
import { buildArm } from '/arm.js';
import { createLobby } from '/lobby.js';

const REACH = 3.2;        // metres: how far away the mouse can work something
const REACH_VR = 1.6;     // metres: pointing in VR is a fallback for grabbing, so it only works close up
const CROUCH = 0.9;       // metres: eye height while C is held on a laptop
const WALK = 2.4;         // m/s
const GRAVITY = 1.62;     // m/s^2, lunar

const net = connect('astronaut');
const radio = new Radio(net);
let state = null, lastEv = 0, rx = false, talking = false, mode = null; // mode: 'vr' | 'desk'
let flash = '', flashUntil = 0, lastPhase = ''; // flash: 'ok' or 'bad', shown on the gauges for a few seconds
let nextThump = 0, covered = false;

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
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 2600);
camera.rotation.order = 'YXZ';
camera.position.y = 1.65; // desktop eye height; the headset overrides this
const rig = new THREE.Group(); // move this to move the player
rig.position.set(CFG.spawn.x, 0, CFG.spawn.z);
rig.add(camera);
scene.add(rig);

const sceneBefore = new Set(scene.children);
const world = buildWorld(THREE, scene, { renderer });
const outdoors = scene.children.filter(o => !sceneBefore.has(o)); // everything on the surface, sun included

// The inside of the habitat. Only one of the two places is drawn at a time.
const interior = buildInterior(THREE, scene, { sfx: k => radio.sfx(k) });
interior.group.visible = false;
interior.mount.add(world.fixtures.board); // the switchboard hangs on the interior wall
let where = 'out';                        // 'out' on the surface, 'in' inside the habitat

// Haptics: a short buzz on the controller in hand i (0 or 1). Bare hands have nothing to buzz.
function pulse(i, strength = 0.5, ms = 40) {
  const session = renderer.xr.getSession();
  const src = session && [...session.inputSources].find(x => x.handedness === controllers[i]?.userData.hand);
  src?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms)?.catch?.(() => {});
}
const fx = buildFixtures(THREE, world, { rig, camera, send: a => net.send({ t: 'do', a }), sfx: k => radio.sfx(k), pulse });

const lamp = new THREE.SpotLight(0xfff4e4, 14, 16, 0.65, 0.7, 1.4); // candela; 40 blew out panels at arm's length
lamp.target.position.set(0, -0.15, -1);
camera.add(lamp, lamp.target);
lamp.intensity = 14; // always on: the shadow side of the dome is black, and that is where cracks hide

// Going through the airlock: a pad over the outside hatch to point at, a sign on it, and a black
// card in front of the eyes that fades in, hides the move, and fades out.
const hatchOut = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.0, 0.4), new THREE.MeshBasicMaterial());
hatchOut.position.set(0, 1.05, 3.35); hatchOut.visible = false; // unseen, but the pointer still hits it
scene.add(hatchOut);
{
  const c = document.createElement('canvas'); c.width = 384; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#041008'; g.fillRect(0, 0, 384, 96); g.strokeStyle = '#58e08a'; g.lineWidth = 4; g.strokeRect(2, 2, 380, 92);
  g.textAlign = 'center'; g.fillStyle = '#58e08a'; g.font = 'bold 40px monospace'; g.fillText('AIRLOCK', 192, 44);
  g.fillStyle = '#d6e6e0'; g.font = 'bold 20px monospace'; g.fillText('POINT AND SELECT TO ENTER', 192, 78);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  sign.position.set(0, 0.52, 3.31);
  scene.add(sign); outdoors.push(sign);
}
const shade = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
shade.position.z = -0.12; shade.renderOrder = 20; shade.visible = false;
camera.add(shade);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- wrist gauges ----------
// Nothing is drawn on the visor. Oxygen, the mission clock, the radio, the alarms and the zoom
// level all live, as icons, on a gauge cluster on the left forearm, and the arm comes up in front
// of the face only while the radio is keyed (see client/arm.js).
const arm = buildArm(THREE);
camera.add(arm.group);
// Keying the radio and raising the arm are one action. On a laptop, Tab swings the arm up. In a
// headset the cuff is on your own left arm: bring it up so you can read the gauges and the radio is
// on, lower it or turn it away and the radio is off (see "the cuff on your own arm" below). The left
// trigger, and a bare left hand held to the helmet, still key the radio without looking.
let keyed = false; // the radio is keyed, whether or not there is a microphone

// What the clock dial shows instead of its hourglass: a tick or a cross for the mission's outcome or
// for the thing that just happened, and a dark hourglass while waiting in the lobby.
function status(now) {
  const s = state;
  if (!s || s.phase === 'lobby') return 'standby';
  if (s.phase === 'results') return s.result.won ? 'won' : 'lost';
  return now < flashUntil ? flash : '';
}
const running = () => !!state && state.phase === 'run';
const noSignal = () => running() && !state.powered; // the base is blacked out: the radio is dead
const radioState = () => noSignal() ? 'dead' : talking ? 'tx' : rx ? 'rx' : keyed && !radio.micOk ? 'nomic' : '';
// How many things are visibly broken right now. The cuff lights a warning triangle for each (up to two);
// it does not say what they are.
function alarms() {
  if (!running()) return 0;
  const sc = state.scene;
  return (sc.dust ? 1 : 0) + (sc.board ? 1 : 0) + (sc.wheel ? 1 : 0) + (sc.hull ? 1 : 0) + (state.suit ? 1 : 0);
}
function drawGauges(now) {
  arm.draw({ state, status: status(now), zoom: scopeOn() ? zoom : 1, total: CFG.roundSeconds, radio: radioState(),
    alarms: alarms(), belt: running() ? beltWeight(state.belt) : 0, capacity: CFG.beltCapacity });
  arm.signal(radioState(), now);
}
function show(what, seconds) { flash = what; flashUntil = performance.now() / 1000 + seconds; }

// ---------- the READY board: how the astronaut readies up, from inside the headset ----------
// It stands just in front of the spawn point while the crew is in the lobby, so the mission can
// never start while the headset is still in someone's hand.
const boardCanvas = document.createElement('canvas');
boardCanvas.width = 768; boardCanvas.height = 480;
const board2d = boardCanvas.getContext('2d');
const boardTex = new THREE.CanvasTexture(boardCanvas);
boardTex.colorSpace = THREE.SRGBColorSpace;
const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.625), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
board.position.set(CFG.spawn.x, 1.65, CFG.spawn.z - 1.7); // eye height
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
  if (!raycaster.intersectObject(board, false).length) return false;
  net.send({ t: 'ready', on: !iAmReady() });
  radio.sfx(iAmReady() ? 'mistake' : 'solve');
  return true;
}

// ---------- network ----------
// Take the server's word as it arrives, not once per frame: what can be grabbed must never lag behind what exists.
const NOTHING = { belt: [], locker: [], scene: null, suit: false };
net.onState = s => { state = s; lobby.update(s); fx.sync(s.phase === 'run' ? s : NOTHING); };
net.onTaken = seatTaken;
net.onKicked = kicked;
net.onBinary = buf => radio.receive(buf);
net.onMsg = m => { if (m.t === 'ptt') { rx = m.on; radio.rxMarker(m.on); } };

// ---------- controls ----------
const keys = {};
let debugOutage = false; // laptop only: L runs the power-outage lighting without a server alarm
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  // Space would scroll the page. Tab is the radio key once you are playing, so it must not move the
  // keyboard focus; on the start screen it is left alone, to step between the buttons as usual.
  if (e.key === ' ' || (e.key === 'Tab' && mode === 'desk')) e.preventDefault();
  if (e.key.toLowerCase() === 'l' && mode === 'desk' && !e.repeat) debugOutage = !debugOutage;
});
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
  if (useAny(null)) { pressed = 'desk'; nextUse = performance.now() / 1000 + 0.1; }
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
  raycaster.far = REACH;
}
function targetInReach(controller) {
  if (!running()) return null;
  aim(controller);
  raycaster.far = controller ? REACH_VR : REACH;
  return raycaster.intersectObjects(fx.targets(), false)[0] || null;
}
// Use the airlock hatch being pointed at: go in from the surface, or back out from the hall.
function useHatch(controller) {
  if (passage) return false;
  aim(controller);
  if (!raycaster.intersectObject(where === 'out' ? hatchOut : interior.hatch, false).length) return false;
  go(where === 'out' ? 'in' : 'out');
  return true;
}
// Use whatever tool, plug or broken thing is being pointed at. Returns true if there was something.
// With `holding`, only things that work while held down (brushing dust, welding) are used again.
function use(controller, holding = false) {
  const hit = targetInReach(controller);
  if (!hit || (holding && !hit.object.userData.hold)) return !!hit && !holding;
  fx.click(hit.object);
  return true;
}
// Use whatever is being pointed at: the READY board, the airlock hatch, or something to fix.
const useAny = controller => useBoard(controller) || useHatch(controller) || use(controller);

// ---------- hands and controllers ----------
// Controllers: grip grabs (tools off the rack and the belt, plugs, the wheel, the generator cord),
// right trigger points at things within arm's reach, left trigger talks, sticks walk and turn, A hops.
// Hand tracking (put the controllers down): pinch on something to grab it, point the right hand and
// pinch to use the hatch or the READY board, pinch at the ground to teleport there, pinch the left
// hand in empty air and drag it sideways to turn, hold the left hand up to your helmet to talk, and
// pinch both empty hands and pull them apart to zoom the visor (push them together to zoom back out).
const TELEPORT_MAX = 8;   // metres per hop
const TURN_STEP = 0.1;    // metres of left-hand drag per 30-degree snap turn
const HELMET = 0.22;      // metres from the head that counts as "hand on helmet"
const ZOOM_MAX = 6;       // visor magnification with the hands pulled wide apart
const ZOOM_OFF = 1.15;    // let go below this and the visor scope closes
const GAP_MIN = 0.1;      // metres: hands closer than this count as this far apart, so a pinch
                          // that starts with the fingers touching does not jump to full zoom
const ground = new THREE.Plane(UP, 0);
const hitPoint = new THREE.Vector3(), tmpV = new THREE.Vector3(), gapA = new THREE.Vector3(), gapB = new THREE.Vector3();
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0x58e08a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
marker.rotation.x = -Math.PI / 2; marker.visible = false;
scene.add(marker);

// Where the hand's ray meets the ground, if that spot can be stood on.
function groundTarget(controller, out) {
  aim(controller);
  const p = raycaster.ray.intersectPlane(ground, out);
  if (!p || p.distanceTo(raycaster.ray.origin) > TELEPORT_MAX) return null;
  if (where === 'in') { const l = interior.toLocal(p.x, p.z); return interior.walkable(l.x, l.z) ? p : null; }
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
let zoomGrab = null;                     // { gap, zoom } at the moment both hands pinched
const usingHands = () => controllers.some(c => c.userData.isHand);

// Where a hand is pinching: between thumb tip and index tip, or the hand itself if the joints are not tracked.
function pinchPoint(i, out) {
  const j = hands[i].joints, a = j?.['thumb-tip'], b = j?.['index-finger-tip'];
  if (a && b && a.visible && b.visible) return out.addVectors(a.getWorldPosition(out), b.getWorldPosition(tmpV)).multiplyScalar(0.5);
  return controllers[i].getWorldPosition(out);
}
const handGap = () => Math.max(GAP_MIN, pinchPoint(0, gapA).distanceTo(pinchPoint(1, gapB)));
function endZoomGrab() {
  if (!zoomGrab) return;
  zoomGrab = null;
  if (zoom < ZOOM_OFF) zoom = 1;
}

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
  c.addEventListener('disconnected', () => {
    if (c.userData.grabbed) { c.userData.grabbed = false; fx.release(i, handPoint(i, new THREE.Vector3())); }
    c.userData.isHand = c.userData.pinched = c.userData.zoomed = false;
    marker.visible = false; leftDrag = null; endZoomGrab();
    if (pressed === c) pressed = null;
  });
  // Trigger on a controller, pinch on a bare hand: both arrive as "select".
  c.addEventListener('selectstart', () => {
    const other = controllers[1 - i];
    // A bare hand that pinches on something grabs it. That is not a zoom, a turn or a teleport.
    if (c.userData.isHand && running() && fx.grab(i, handPoint(i, new THREE.Vector3()))) { c.userData.grabbed = true; return; }
    c.userData.pinched = true;
    // Both bare hands pinched: this is a zoom, not a turn, a teleport or a panel press.
    if (c.userData.isHand && other.userData.isHand && other.userData.pinched) {
      c.userData.zoomed = other.userData.zoomed = true;
      leftDrag = null;
      zoomGrab = { gap: handGap(), zoom };
      return;
    }
    if (c.userData.hand === 'left') { if (c.userData.isHand) leftDrag = { x: lateral(c) }; return; }
    if (!c.userData.isHand && useAny(c)) { pressed = c; nextUse = performance.now() / 1000 + 0.1; } // a bare hand acts when the pinch lets go, see below
  });
  c.addEventListener('selectend', () => {
    if (pressed === c) pressed = null;
    if (c.userData.grabbed) { c.userData.grabbed = false; fx.release(i, handPoint(i, new THREE.Vector3())); return; }
    const wasZoom = c.userData.zoomed, act = c.userData.pinched && !wasZoom;
    c.userData.pinched = c.userData.zoomed = false;
    endZoomGrab();
    if (c.userData.hand === 'left') { leftDrag = null; return; }
    // A bare right hand uses the board, hatch or panel, or teleports, on release, not on pinch, so that the first
    // hand of a two-handed zoom does not fire on its way in. The ring shows where you will land.
    if (c.userData.isHand && act && !useAny(c) && groundTarget(c, hitPoint)) teleport(hitPoint);
  });
  // The grip button closes the hand on whatever is within reach of it.
  c.addEventListener('squeezestart', () => { if (running() && fx.grab(i, handPoint(i, new THREE.Vector3()))) c.userData.grabbed = true; });
  c.addEventListener('squeezeend', () => { if (c.userData.grabbed) { c.userData.grabbed = false; fx.release(i, handPoint(i, new THREE.Vector3())); } });
  rig.add(c);
  controllers.push(c);

  const h = renderer.xr.getHand(i); // joints appear once the headset starts tracking the hand
  rig.add(h);
  hands.push(h);
}

// Where this hand's fingers are: the pinch point of a tracked hand, or the controller itself.
function handPoint(i, out) { return controllers[i].userData.isHand ? pinchPoint(i, out) : controllers[i].getWorldPosition(out); }
const handInfo = [0, 1].map(() => ({ obj: null, point: new THREE.Vector3(), side: '', tracked: false }));

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
  if (zoomGrab) zoom = Math.max(1, Math.min(ZOOM_MAX, zoomGrab.zoom * handGap() / zoomGrab.gap));
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
      const p = !zoomGrab && !c.userData.grabbed && !targetInReach(c) && groundTarget(c, hitPoint);
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

// ---------- the cuff on your own arm (a headset) ----------
// The arm follows the left controller or the tracked left hand. The radio is on while the gauges
// can be read: the face of the cuff is turned toward the eyes, close enough, and near the middle
// of the view. Each test is looser for staying on than for coming on, and coming on takes a moment
// of holding still, so an arm swinging through the view does not key the radio.
const READ = {
  facing: [0.7, 0.5],    // cosine of the angle between the face of the cuff and the line to the eyes: on, stay on
  near: [0.55, 0.68],    // metres from the eyes
  inView: [0.8, 0.62],   // cosine of the angle off the middle of the view
  hold: 0.25,            // seconds
};
const SHOULDER = { side: 0.19, down: 0.26 }; // where the left shoulder is from the eyes, metres
let reading = false, readFor = 0;
const cuffPos = new THREE.Vector3(), cuffOut = new THREE.Vector3(), gaze = new THREE.Vector3(), shoulder = new THREE.Vector3();
// Put the arm on the left hand or controller. Returns true if there is one to put it on.
function followArm() {
  const i = controllers.findIndex(c => c.userData.hand === 'left');
  const c = controllers[i], joint = c && c.userData.isHand ? hands[i].joints?.wrist : null;
  if (joint && joint.visible) arm.follow(joint.matrix, 'hand');
  else if (c && !c.userData.isHand && c.visible) arm.follow(c.matrix, 'controller');
  else arm.follow(null);
  if (!arm.group.visible) return false;
  arm.group.updateWorldMatrix(true, false);
  // The upper arm runs from the elbow to the left shoulder, wherever the head has got to.
  shoulder.set(headPos.x + fwd.z * SHOULDER.side, headPos.y - SHOULDER.down, headPos.z - fwd.x * SHOULDER.side);
  arm.aimUpper(arm.group.worldToLocal(shoulder));
  return true;
}
// Can the gauges be read right now? Call once a frame, after followArm.
function gaugesReadable(dt) {
  if (!arm.group.visible) { reading = false; readFor = 0; return false; }
  cuffPos.setFromMatrixPosition(arm.group.matrixWorld);
  cuffOut.setFromMatrixColumn(arm.group.matrixWorld, 2).normalize();
  camera.getWorldDirection(gaze);
  const toEyes = tmpV.copy(headPos).sub(cuffPos), far = toEyes.length();
  toEyes.divideScalar(far || 1);
  const n = reading ? 1 : 0;
  const ok = cuffOut.dot(toEyes) > READ.facing[n] && far < READ.near[n] && -gaze.dot(toEyes) > READ.inView[n];
  readFor = ok ? readFor + dt : 0;
  reading = ok && (reading || readFor >= READ.hold);
  return reading;
}

// ---------- visor zoom ----------
// A round scope in the middle of the view showing the scene through a narrow lens. A headset
// will not let a page change the field of view of the eyes themselves, so the magnified picture
// is drawn into a texture from the head's position and shown on a disc fixed to the visor.
// The disc's lens is sized so that things in it look exactly `zoom` times bigger.
const SCOPE_R = 0.3, SCOPE_D = 1.3; // disc radius and distance from the eyes, metres
let zoom = 1;
const scopeOn = () => zoom > 1.01 || !!zoomGrab;
const scopeRT = new THREE.WebGLRenderTarget(1024, 1024);
// Marking the target as a display target makes three.js draw into it exactly as it draws to the
// screen or headset (tone mapped, sRGB), so the disc below can copy its pixels through unchanged
// and panel screens look the same in the scope as outside it. No multisampling: with this mark
// three.js gives the multisample buffer a different format from the texture and the copy between
// them fails, leaving the scope black. 1024 pixels across a 26-degree disc is already finer than
// the headset's own pixels, which does the smoothing instead.
scopeRT.isXRRenderTarget = true;
scopeRT.texture.colorSpace = THREE.SRGBColorSpace;
const scopeCam = new THREE.PerspectiveCamera(20, 1, 0.1, 2000);
const scopeMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCOPE_R * 2, SCOPE_R * 2), new THREE.ShaderMaterial({
  uniforms: { map: { value: scopeRT.texture } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D map; varying vec2 vUv;
    void main() {
      float r = length(vUv - 0.5) * 2.0;
      if (r > 1.0) discard;
      vec3 c = texture2D(map, vUv).rgb;
      c = mix(c, vec3(0.345, 0.878, 0.541), smoothstep(0.95, 0.96, r)); // green rim
      gl_FragColor = vec4(c, 1.0);
    }`,
  // Drawn after the world and over it whatever is in the way, but leaving its own depth behind,
  // so that the arm (drawn next, and nearer) covers the scope when it comes up.
  depthFunc: THREE.AlwaysDepth,
}));
scopeMesh.position.set(0, 0.03, -SCOPE_D);
scopeMesh.renderOrder = 9;
scopeMesh.visible = false;
camera.add(scopeMesh);

function renderScope() {
  scopeMesh.visible = scopeOn();
  if (!scopeMesh.visible) return;
  rig.updateMatrixWorld(true);                                    // wherever this frame's walking and turning left the rig
  if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera); // and this frame's head pose, not the last one's
  camera.matrixWorld.decompose(scopeCam.position, scopeCam.quaternion, tmpV);
  scopeCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(SCOPE_R / (SCOPE_D * zoom)));
  scopeCam.updateProjectionMatrix();
  // Draw the scene once more into the scope's texture. The headset path and the shadow pass are
  // switched off for this one draw (the main draw redoes the shadows anyway) and put back after.
  const target = renderer.getRenderTarget(), xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate, armWas = arm.group.visible;
  scopeMesh.visible = arm.group.visible = false;
  renderer.xr.enabled = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.setRenderTarget(scopeRT);
  renderer.clear();
  renderer.render(scene, scopeCam);
  scopeMesh.userData.drawCalls = renderer.info.render.calls; // for the smoke test: the scope pass drew the scene
  renderer.setRenderTarget(target);
  renderer.shadowMap.autoUpdate = shadows;
  renderer.xr.enabled = xr;
  scopeMesh.visible = true; arm.group.visible = armWas;
}
function setZoom(z) { zoom = Math.max(1, Math.min(ZOOM_MAX, +z || 1)); }

// ---------- the airlock: moving between the surface and the hall ----------
const FADE = 0.15; // seconds each way
let passage = null; // { to, t, moved } while a fade is running
function go(to) { passage = { to, t: 0, moved: false }; shade.visible = true; radio.sfx('hatch'); }
// Put the head at (x, z) facing `yaw` (0 = north), and draw only the place it is now in.
function place(to) {
  where = to;
  interior.group.visible = to === 'in';
  for (const o of outdoors) o.visible = to === 'out';
  rig.position.y = 0; vy = 0;
  rig.updateMatrixWorld(true);
  camera.getWorldDirection(fwd);
  const spot = to === 'in' ? interior.toWorld(ROOM.arrive.x, ROOM.arrive.z) : { x: 0, z: 4.5 };
  turnRig((to === 'in' ? 0 : Math.PI) - Math.atan2(-fwd.x, -fwd.z)); // in: face up the hall. out: back to the hatch
  rig.updateMatrixWorld(true);
  teleport(spot);
  marker.visible = false;
}
function passageStep(dt) {
  if (!passage) return;
  passage.t += dt;
  if (!passage.moved && passage.t >= FADE) { passage.moved = true; place(passage.to); }
  shade.material.opacity = Math.max(0, Math.min(1, passage.t < FADE ? passage.t / FADE : 2 - passage.t / FADE));
  if (passage.t >= FADE * 2) { passage = null; shade.visible = false; }
}

let vy = 0, turnArmed = true, lastPose = 0, shake = 0;
function control(dt, now) {
  let mx = 0, mz = 0, jump = false, ptt = mode === 'desk' && !!keys.tab;
  const session = renderer.xr.getSession();
  camera.getWorldPosition(headPos);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  if (session) {
    ptt = handControls(ptt);
    if (followArm() && gaugesReadable(dt)) ptt = true;
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

  // Stay inside the play area and outside the habitat walls; or, indoors, inside the hall.
  camera.getWorldPosition(headPos);
  const d = Math.hypot(headPos.x, headPos.z);
  if (where === 'in') {
    const l = interior.toLocal(headPos.x, headPos.z), c = interior.clamp(l.x, l.z);
    rig.position.x += c.x - l.x; rig.position.z += c.z - l.z;
  } else if (d > CFG.bounds - 1) { const k = (CFG.bounds - 1) / d; rig.position.x += headPos.x * (k - 1); rig.position.z += headPos.z * (k - 1); }
  if (where === 'out' && d < CFG.habRadius && d > 0.01) { const k = CFG.habRadius / d; rig.position.x += headPos.x * (k - 1); rig.position.z += headPos.z * (k - 1); }

  keyed = ptt;
  if (ptt !== talking && radio.micOk) { talking = ptt; radio.setTalking(ptt); }

  if (now - lastPose > 0.1) { lastPose = now; sendPose(); }
}
// Tell the server where the astronaut's head is: it checks reach and cover against this. Indoors, the
// server (and the Technician's map) sees the astronaut at the airlock.
// How tall this player stands, measured as they play, so that "crouching" means the same thing for a
// tall adult, a child and someone playing seated: the height sent is scaled to a 1.65 m standing head.
let standing = 1.2;
function headHeight() {
  camera.getWorldPosition(headPos);
  const h = headPos.y - rig.position.y;
  if (!renderer.xr.isPresenting) return h;
  standing = Math.min(2.1, Math.max(standing, h)); // the tallest they have stood this session
  return h / standing * 1.65;
}
function myPose() {
  const h = headHeight();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  return { x: where === 'in' ? PLACES.airlock.x : headPos.x, z: where === 'in' ? PLACES.airlock.z : headPos.z, ry: Math.atan2(fwd.x, fwd.z), h };
}
function sendPose() { net.send({ t: 'pose', ...myPose() }); }

// ---------- main loop ----------
// A picture of the view as just drawn, as a PNG data URL, for the smoke test's optional screenshots.
let snapWaiting = null;
const snap = () => new Promise(resolve => { snapWaiting = resolve; });
let lastFrame = performance.now() / 1000;
let armFrame = lastFrame;
renderer.setAnimationLoop(() => {
  const now = performance.now() / 1000, dt = Math.min(0.05, now - lastFrame);
  lastFrame = now;
  const s = state;
  const run = !!s && s.phase === 'run';
  if (s) {
    if (s.phase !== lastPhase) {
      if (run) { flashUntil = 0; passage = null; shade.visible = false; if (where === 'in') place('out'); rig.position.set(CFG.spawn.x, 0, CFG.spawn.z); rig.rotation.y = 0; }
      lastPhase = s.phase;
    }
    if (s.ev && s.ev.n !== lastEv) {
      lastEv = s.ev.n;
      const k = s.ev.kind;
      // The astronaut is never told what broke or where: that is mission control's job.
      if (['alarm', 'solve', 'mistake', 'hit', 'blackout', 'power', 'gen', 'end'].includes(k)) radio.sfx(k);
      if (k === 'solve') show('ok', 4);
      if (k === 'mistake' || k === 'hit') show('bad', 5);
      if (k === 'hit' || k === 'mistake') { pulse(0, 1, 250); pulse(1, 1, 250); }
    }
    if (run) world.apply(s.scene, now);
    world.moveRover(s.rover);

    // Sound: the leak hiss, and rocks landing during a shower. Indoors a hull breach is heard from
    // the airlock end of the hall, and the shower is a rumble through the walls.
    const inside = where === 'in';
    const crackAt = inside ? interior.hatch.getWorldPosition(tmpV).setY(1.6) : world.fixtures.crack.userData.centre;
    radio.leak(run && s.suit, run && s.scene.hull ? crackAt : null);
    if (run && s.scene.meteor !== null && now > nextThump) {
      const close = s.scene.meteor > CFG.meteorGraceSeconds;
      nextThump = now + (close ? 0.25 + Math.random() * 0.3 : 0.6 + Math.random() * 0.6);
      // Under cover the impacts are duller and quieter: that, and the cuff, is how you know you are safe.
      const dull = inside || covered;
      radio.burst(close ? 0.5 : 0.35, (close ? 0.4 : 0.12) * (dull ? 0.4 : 1), 'lowpass', close && !dull ? 240 : 110);
      // A laptop screen can shake. A headset must not: that is how you make someone ill.
      if (close && mode === 'desk') shake = 0.012;
      if (close) { pulse(0, dull ? 0.15 : 0.45, 60); pulse(1, dull ? 0.15 : 0.45, 60); }
    }
  }
  world.update(now);
  // The hall goes to its red backup lights when the switchboard trips, and when the battery runs flat.
  const powerOut = debugOutage || (run && (!!s.scene.board || s.scene.dark));
  interior.setPower(powerOut);
  interior.update(dt, now);
  radio.room(where === 'in' ? (interior.dark ? 0.15 : 1) : 0);
  passageStep(Math.min(0.25, now - armFrame)); // real time, so the airlock is as quick on a slow machine
  if (mode) control(dt, now); else keyed = false;
  if (pressed && now > nextUse) { nextUse = now + 0.09; use(pressed === 'desk' ? null : pressed, true); }

  // Hands for the fixtures: where a held tool is drawn, and where the fingers are.
  const vr = mode === 'vr';
  if (vr) for (const i of [0, 1]) {
    const h = handInfo[i], c = controllers[i];
    h.obj = c; h.side = c.userData.hand || ''; h.tracked = !!c.userData.isHand; handPoint(i, h.point);
  }
  fx.update(dt, now, vr ? handInfo : [], vr);
  // Under cover while rocks are falling: the cuff says so, because there is no other way to know.
  covered = run && s.scene.meteor !== null && sheltered(myPose(), s.rover);

  camera.getWorldPosition(headPos); camera.getWorldDirection(tmpV);
  radio.listen(headPos, tmpV);
  shake *= 0.86;
  if (mode === 'desk') camera.rotation.z = (Math.random() - 0.5) * shake;
  drawBoard();
  // On a laptop the radio key swings the arm up. In a headset it is on your own arm (see followArm).
  if (!arm.tracked) arm.update(Math.min(0.25, now - armFrame), keyed); // real time, so the arm is as quick on a slow machine
  armFrame = now;
  if (arm.group.visible) drawGauges(now);
  renderScope();
  renderer.render(scene, camera);
  if (snapWaiting) { snapWaiting(renderer.domElement.toDataURL('image/png')); snapWaiting = null; } // must follow the draw in the same frame
});

// For debugging from the browser console, and for the tests: moonbase.state(), moonbase.fx.targets() ...
window.moonbase = { resetStanding: () => { standing = 1.2; }, state: () => state, fx, world, interior, radio, rig, camera, net, board, THREE, scene, use: () => use(null), useBoard: () => useBoard(null), useHatch: () => useHatch(null), sendPose, myPose, teleport, turnRig,
  where: () => where, place, renderer, outage: on => { debugOutage = on; },
  zoom: () => zoom, setZoom, controllers, handControls, scope: scopeMesh, arm, snap, radioState: () => ({ keyed, talking, rx, reading, shown: radioState() }) };

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
$('deskBtn').onclick = () => { mode = 'desk'; keys.tab = false; $('deskBtn').blur(); lobby.show(false); $('cross').hidden = false; lockPointer(); };
// In a headset the arm lives in the room with the hands, and follows the left one; on a laptop it hangs off the view.
renderer.xr.addEventListener('sessionstart', () => { mode = 'vr'; rig.add(arm.group); arm.setTracked(true); lobby.show(false); });
renderer.xr.addEventListener('sessionend', () => { mode = null; zoom = 1; zoomGrab = null; reading = false; readFor = 0; camera.add(arm.group); arm.setTracked(false); lobby.show(true); });
