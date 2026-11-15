// The astronaut. Runs in the Quest browser in VR, or on a laptop screen for testing.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { connect } from '/net.js';
import { Radio } from '/voice.js';
import { buildWorld } from '/world.js';
import { buildFixtures } from '/stations.js';
import { buildInterior, ROOM } from '/interior.js';
import { buildPhysics } from '/physics.js';
import { CHAMBER } from '/airlock.js';
import { CFG, CREW, ROLES, PLACES, HAULER, covers } from '/shared/config.js';
import { sheltered } from '/shared/rules.js';
import { SOLID, pushOut } from '/shared/field.js';
import { loadPeriod } from '/shared/assets.js';
import { seatRefused, seatTaken, kicked } from '/seat.js';
import { buildArm } from '/arm.js';
import { PAL, FONT, nixie, fontsReady } from '/shared/palette.js';
import { createLobby } from '/lobby.js';
import { isHeadset } from '/device.js';
import { music } from '/music.js';
import { makeCueOverlay } from '/hand.js';

const REACH = 3.2;        // metres: how far away the mouse can work something
const REACH_VR = 1.6;     // metres: pointing in VR is a fallback for grabbing, so it only works close up
const CROUCH = 0.9;       // metres: eye height while C is held on a laptop
const WALK = 4.0;         // m/s: a brisk lunar lope (the play area is 45 m in every direction)
const GRAVITY = 1.62;     // m/s^2, lunar

const net = connect('astronaut');
const radio = new Radio(net);
let state = null, lastEv = 0, rx = false, talking = false, mode = null; // mode: 'vr' | 'desk'
let flash = '', flashUntil = 0, lastPhase = ''; // flash: 'ok' or 'bad', shown on the gauges for a few seconds
let nextThump = 0, covered = false;
// The debrief: set when a mission ends, cleared when the astronaut presses EXIT or the next run starts.
// It outlives the server's results phase, so nobody else going back to the lobby pulls it away.
// { won, score, reason, read, readFor, beepAt }
let debrief = null;

// ---------- scene ----------
// stencil: the portholes and the hall's window are drawn with a stencil mask (see "portholes" below).
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic roll-off: the sun is harsh, the shadows stay readable
renderer.toneMappingExposure = 0.95;
renderer.xr.enabled = true;
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 2600);
camera.rotation.order = 'YXZ';
camera.position.y = 1.65; // desktop eye height; the headset overrides this
const rig = new THREE.Group(); // move this to move the player
rig.add(camera);
scene.add(rig);

const sceneBefore = new Set(scene.children);
const world = buildWorld(THREE, scene, { renderer });
const outdoors = scene.children.filter(o => !sceneBefore.has(o)); // everything on the surface, sun included

// The inside of the habitat. Only one of the two places is drawn at a time.
const interior = buildInterior(THREE, scene, { sfx: k => radio.sfx(k) });
interior.group.visible = false;
let where = 'out';                        // 'out' on the surface, 'in' inside the habitat
let door = CFG.spawn.door;                // the airlock last come through: indoors, the map shows you there

// Haptics: a short buzz on the controller in hand i (0 or 1). Bare hands have nothing to buzz.
function pulse(i, strength = 0.5, ms = 40) {
  const session = renderer.xr.getSession();
  const src = session && [...session.inputSources].find(x => x.handedness === controllers[i]?.userData.hand);
  src?.gamepad?.hapticActuators?.[0]?.pulse?.(strength, ms)?.catch?.(() => {});
}
const phys = buildPhysics();
const fx = buildFixtures(THREE, world, { rig, camera, send: a => net.send({ t: 'do', a }), sfx: k => radio.sfx(k), sfxAt: (k, p, g, o) => radio.sfxAt(k, p, g, o), pulse, phys, interior, where: () => where, onRail: i => mount(i), rideCue: desk => rideCue(desk) });

// The samples banked so far stand in a rack on the hall's bench, one canister each.
const rack = [];
for (let n = 0; n < CFG.sample.manifest + 2; n++) {
  const g = new THREE.Group(); g.name = 'Rack_Canister_' + n; g.position.set(1.0 - (n % 3) * 0.14, 0.96, -4.72 + Math.floor(n / 3) * 0.14); g.visible = false;
  interior.group.add(g); rack.push(g);
}
loadPeriod(THREE, 'sample-canister', { rough: 0.6, metal: 0.4 }).then(m => { m.scale.setScalar(2.4); m.position.y = 0.04; for (const g of rack) g.add(m.clone()); }).catch(e => console.warn('sample-canister', e));
outdoors.push(fx.outside); // tools lying on the Moon are hidden with the rest of the surface

const lamp = new THREE.SpotLight(PAL.hex.incandescent, 14, 16, 0.65, 0.7, 1.4); // candela; 40 blew out panels at arm's length
lamp.target.position.set(0, -0.15, -1);
camera.add(lamp, lamp.target);
lamp.intensity = 14; // always on: the shadow side of the dome is black, and that is where cracks hide

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
  if (debrief) return debrief.won ? 'won' : 'lost';
  if (!s || s.phase === 'lobby') return 'standby';
  if (s.phase === 'results') return s.result.won ? 'won' : 'lost';
  return now < flashUntil ? flash : '';
}
const running = () => !!state && state.phase === 'run';
const radioState = () => talking ? 'tx' : rx ? 'rx' : keyed && !radio.micOk ? 'nomic' : ''; // comms always work
// How many things are visibly broken right now. The cuff lights a warning triangle for each (up to two);
// it does not say what they are.
function alarms() {
  if (!running()) return 0;
  const sc = state.scene;
  return (sc.dust ? 1 : 0) + (Object.values(sc.wheels || {}).some(Boolean) ? 1 : 0) + (sc.hull ? 1 : 0) + (state.suit ? 1 : 0);
}
function drawGauges(now) {
  arm.draw({ state, status: status(now), debrief: !!debrief, zoom: scopeOn() ? zoom : 1, total: CFG.roundSeconds, radio: radioState(),
    alarms: alarms(), held: running() ? fx.hands : [null, null], samples: running() && state.tally ? state.tally : null });
  arm.signal(radioState(), now);
}
function show(what, seconds) { flash = what; flashUntil = performance.now() / 1000 + seconds; }

// ---------- the status board: the countdown to GO, in the hall where the astronaut starts ----------
// The astronaut does not ready themselves: Mission Ops calls them GO from the ground (client/console.js,
// client/lobby.js). This board only shows it: a jewel lamp per seat, Nixie digits for the countdown, and
// one engraved line. Nothing on it is pointed at. It stands on a post in front of the spawn point.
const boardCanvas = document.createElement('canvas');
boardCanvas.width = 768; boardCanvas.height = 480;
const board2d = boardCanvas.getContext('2d');
const boardTex = new THREE.CanvasTexture(boardCanvas);
boardTex.colorSpace = THREE.SRGBColorSpace;
const board = new THREE.Group(); board.name = 'Board_Status';
{
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.625), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  face.name = 'Face'; face.position.set(0, 1.62, 0.031); board.add(face);
  const steel = new THREE.MeshStandardMaterial({ color: PAL.hex.console, roughness: 0.7, metalness: 0.35 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.69, 0.06), steel); back.position.set(0, 1.62, 0); board.add(back);
  const post = new THREE.Mesh(new THREE.LatheGeometry([[0.0, 0], [0.18, 0], [0.18, 0.03], [0.04, 0.06], [0.03, 1.3], [0.0, 1.3]].map(([x, y]) => new THREE.Vector2(x, y)), 16), steel);
  post.name = 'Post'; board.add(post);
}
const boardAt = interior.toWorld(ROOM.arrive.x, ROOM.arrive.z - 1.9);
board.position.set(boardAt.x, 0, boardAt.z); board.rotation.y = 0; // faces +z, toward the astronaut
scene.add(board);
let boardKey = '', wasGo = false;
const iAmReady = () => !!state && (state.ready || []).includes('astronaut');
function drawBoard() {
  const s = state;
  board.visible = !!s && s.phase === 'lobby' && where === 'in';
  if (!s) return;
  // The moment Mission Ops calls GO: a two-note chime and a pulse in both hands.
  const go = s.phase === 'lobby' && iAmReady();
  if (go && !wasGo) { radio.sfx('go'); pulse(0, 0.8, 120); pulse(1, 0.8, 120); }
  wasGo = go;
  if (!board.visible) return;
  const n = s.countdown == null ? null : Math.max(1, Math.ceil(s.countdown));
  const lamps = CREW.map(r => (s.ready || []).some(h => covers(h, r)) ? 'go' : s.crew.some(h => covers(h, r)) ? 'seat' : 'off');
  const key = [lamps, n, go, s.suited].join('|');
  if (key === boardKey) return;
  boardKey = key;
  const g = board2d, W = boardCanvas.width, H = boardCanvas.height;
  g.fillStyle = PAL.console; g.fillRect(0, 0, W, H);
  g.strokeStyle = PAL.bezel; g.lineWidth = 16; g.strokeRect(8, 8, W - 16, H - 16);
  g.strokeStyle = PAL.bakelite; g.lineWidth = 3; g.strokeRect(20, 20, W - 40, H - 40);
  for (const [x, y] of [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]]) { g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = PAL.ink; g.font = 'bold 30px "Michroma", "Arial Narrow", sans-serif';
  g.fillText('FLIGHT STATUS', W / 2, 66);
  // One jewel lamp per seat: dark empty, amber taken, green GO.
  const names = { astronaut: 'ASTRO', ops: 'OPS', sci: 'SCI', tech: 'TECH' };
  CREW.forEach((r, i) => {
    const x = 132 + i * 168, y = 150, st = lamps[i];
    g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(x, y, 30, 0, 7); g.fill();
    g.fillStyle = st === 'go' ? PAL.green : st === 'seat' ? PAL.amber : PAL.greenOff; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
    if (st !== 'off') { g.fillStyle = 'rgba(255,240,210,0.35)'; g.beginPath(); g.arc(x - 7, y - 7, 7, 0, 7); g.fill(); }
    g.fillStyle = PAL.ink; g.font = 'bold 22px "Courier Prime", monospace'; g.fillText(names[r], x, y + 50);
  });
  // The countdown in Nixie digits: dark tubes until there is one.
  g.fillStyle = PAL.bakelite; g.fillRect(W / 2 - 110, 236, 220, 132);
  for (let k = 0; k < 2; k++) {
    const x = W / 2 - 52 + k * 104;
    g.fillStyle = PAL.nixieOff; g.font = 'bold 108px "Courier Prime", monospace'; g.fillText('8', x, 304);
    const d = n == null ? null : String(n).padStart(2, '0')[k];
    if (d != null) { g.shadowColor = PAL.nixie; g.shadowBlur = 18; g.fillStyle = PAL.nixie; g.fillText(d, x, 304); g.shadowBlur = 0; }
  }
  g.fillStyle = go ? PAL.green : PAL.ink; g.font = 'bold 28px "Courier Prime", monospace';
  g.fillText(n != null ? 'LAUNCH' : go ? 'GO FOR EVA' : s.suited ? 'AWAIT GO FROM MISSION OPS' : 'NOT SUITED', W / 2, 412);
  boardTex.needsUpdate = true;
}

let fontsLoaded = false;
fontsReady.then(() => { fontsLoaded = true; }); // the result board redraws in its own type
// ---------- the RESULT board: how the astronaut is told the mission is over ----------
// A placard that appears in the world, in front of the astronaut, the moment the mission ends, and stays
// where it appeared (it is not on the visor) until they press EXIT. The wrist says the same in icons.
const resultCanvas = document.createElement('canvas');
resultCanvas.width = 768; resultCanvas.height = 480;
const result2d = resultCanvas.getContext('2d');
const resultTex = new THREE.CanvasTexture(resultCanvas);
resultTex.colorSpace = THREE.SRGBColorSpace;
const resultBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), new THREE.MeshBasicMaterial({ map: resultTex, toneMapped: false, depthTest: false, transparent: true }));
resultBoard.renderOrder = 30; resultBoard.visible = false; // always drawn: it is a message, not a prop
scene.add(resultBoard);
let resultKey = '';
function drawResultBoard() {
  resultBoard.visible = !!debrief;
  if (!debrief) { resultKey = ''; return; }
  const key = [debrief.won, debrief.score, debrief.reason, fontsLoaded].join('|');
  if (key === resultKey) return;
  resultKey = key;
  const g = result2d, W = resultCanvas.width, H = resultCanvas.height, lamp = debrief.won ? PAL.green : PAL.red;
  g.fillStyle = PAL.bakelite; g.fillRect(0, 0, W, H);
  g.strokeStyle = PAL.bezel; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  g.strokeStyle = lamp; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28);
  // A tick or a cross, in the same strokes as the wrist.
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [c, w] of [[PAL.inkDial, 30], [lamp, 19]]) {
    g.strokeStyle = c; g.lineWidth = w; g.beginPath();
    if (debrief.won) { g.moveTo(W / 2 - 42, 112); g.lineTo(W / 2 - 14, 142); g.lineTo(W / 2 + 44, 76); }
    else { g.moveTo(W / 2 - 38, 74); g.lineTo(W / 2 + 38, 146); g.moveTo(W / 2 + 38, 74); g.lineTo(W / 2 - 38, 146); }
    g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = lamp; g.font = `46px ${FONT.label}`;
  g.fillText(debrief.won ? 'MISSION COMPLETE' : 'MISSION FAILED', W / 2, 222);
  g.fillStyle = PAL.ink; g.font = `bold 28px ${FONT.type}`;
  g.fillText(debrief.reason || '', W / 2, 288);
  g.fillStyle = PAL.inkDim; g.font = `16px ${FONT.label}`;
  g.fillText('SCORE', W / 2 - 74, 352);
  nixie(g, String(debrief.score), W / 2 + 18, 352, 40, { align: 'left' });
  g.fillStyle = PAL.amber; g.font = `15px ${FONT.label}`;
  g.fillText('EXIT ON YOUR WRIST: BACK TO THE READY BOARD', W / 2, 424);
  resultTex.needsUpdate = true;
}
// ---------- network ----------
// Take the server's word as it arrives, not once per frame: what can be grabbed must never lag behind what exists.
const NOTHING = { held: null, tools: null, scene: null, suit: false };
let suitedSent = 0;
net.onState = s => {
  state = s; if (waitNote) { waitNote.remove(); waitNote = null; } lobby.update(s); fx.sync(s.phase === 'run' ? s : NOTHING);
  // Suited is the server's to forget (a reconnect, a restart): say it again while it is true here.
  const now = performance.now();
  if (mode && s.phase === 'lobby' && !s.suited && now - suitedSent > 2000) { suitedSent = now; net.send({ t: 'suited', on: true }); }
};
function suited(on) { suitedSent = performance.now(); net.send({ t: 'suited', on }); }
// A headset can only ever be the Astronaut: if the seat is held, it waits for it instead of being sent away.
let headset = false, waitNote = null;
net.onTaken = role => {
  if (!headset) { seatTaken(role); return; }
  if (!waitNote) {
    waitNote = document.createElement('div'); waitNote.id = 'taken';
    waitNote.innerHTML = '<div><h1>ASTRONAUT SEAT TAKEN</h1><p>Someone else is the Astronaut right now. You will be seated as soon as they leave.</p></div>';
    document.body.appendChild(waitNote);
  }
  setTimeout(() => net.retry(), 3000);
};
net.onRefused = seatRefused;
net.onKicked = kicked;
net.onBinary = buf => radio.receive(buf);
net.onMsg = m => { if (m.t === 'ptt') { rx = m.on; radio.rxMarker(m.on); } };

// ---------- controls ----------
const keys = {};
let debugOutage = false; // laptop only: L runs the power-outage lighting without a server alarm
let debugDamage = false; // laptop only: K knocks loose everything in the hall that can come loose
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  // Space would scroll the page. Tab is the radio key once you are playing, so it must not move the
  // keyboard focus; on the start screen it is left alone, to step between the buttons as usual.
  if (e.key === ' ' || (e.key === 'Tab' && mode === 'desk')) e.preventDefault();
  if (e.key.toLowerCase() === 'l' && mode === 'desk' && !e.repeat) debugOutage = !debugOutage;
  if (e.key.toLowerCase() === 'k' && mode === 'desk' && !e.repeat) debugDamage = !debugDamage;
  if (e.key.toLowerCase() === 'q' && mode === 'desk' && !e.repeat) { if (!fx.dropHeld()) fx.dropSample(); }
  // E: with a loose tool or a sample in view and in reach, take it and keep it while E is held (let go of E to
  // let go of it). Otherwise it goes on and off the Hauler, as before.
  if (e.key.toLowerCase() === 'e' && mode === 'desk' && !e.repeat) {
    if (!riding && running() && fx.grabKey(targetInReach(null))) { /* held until E comes up */ }
    else if (riding) dismount(-1); else mount(2);
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (e.key.toLowerCase() === 'e') fx.releaseKey(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; fx.releaseKey(); }); // losing focus lets go of what E is holding
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
// Use whatever tool or broken thing is being pointed at. Returns true if there was something.
// With `holding`, only things that work while held down (brushing dust, welding) are used again.
function use(controller, holding = false) {
  const hit = targetInReach(controller);
  if (!hit || (holding && !hit.object.userData.hold)) return !!hit && !holding;
  const hand = controller ? controllers.indexOf(controller) : -1;
  // A bare hand's pinch acts on release, so it cannot hold a tool it pointed at: it has to reach for it.
  if (hit.object.userData.tool && controller?.userData.isHand) return false;
  fx.click(hit.object, hit.point, hand >= 0 ? hand : undefined);
  return true;
}
// Use whatever is being pointed at: a loose tool, something to fix. (The airlocks are walked into.)
const useAny = controller => use(controller);

// ---------- hands and controllers ----------
// Controllers: hold the trigger (or the grip) on something to take it in that hand (a loose tool, one in
// each hand; the wheel, the generator cord) and let go to drop or throw it. With nothing in reach
// the right trigger points at things within arm's reach and the left trigger talks. Sticks walk and turn, A hops.
// Hand tracking (put the controllers down): pinch on something to grab it, point the right hand and
// pinch to use the hatch or the READY board, pinch at the ground to teleport there, pinch the left
// hand in empty air and drag it sideways to turn, hold the left hand up to your helmet to talk, and
// pinch both empty hands and pull them apart to zoom the visor (push them together to zoom back out).
const TELEPORT_MAX = 14;  // metres per hop
const TURN_STEP = 0.1;    // metres of left-hand drag per 30-degree snap turn
const HELMET = 0.22;      // metres from the head that counts as "hand on helmet"
const ZOOM_MAX = 6;       // visor magnification with the hands pulled wide apart
const ZOOM_OFF = 1.15;    // let go below this and the visor scope closes
const GAP_MIN = 0.1;      // metres: hands closer than this count as this far apart, so a pinch
                          // that starts with the fingers touching does not jump to full zoom
const ground = new THREE.Plane(UP, 0);
const hitPoint = new THREE.Vector3(), tmpV = new THREE.Vector3(), gapA = new THREE.Vector3(), gapB = new THREE.Vector3();
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: PAL.hex.amber, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
marker.rotation.x = -Math.PI / 2; marker.visible = false;
scene.add(marker);

// Where the hand's ray meets the ground, if that spot can be stood on.
// The habitat model's two side modules (client/world.js): long one to +x, short one to -x. Returns the
// push that takes a point at (x, z) back out of whichever it is in, or null.
const MODULES = [{ x0: 2.2, x1: 7.6, z: 1.45 }, { x0: -4.6, x1: -2.2, z: 1.35 }], PAD = 0.3;
function inModule(x, z) {
  for (const m of MODULES) {
    if (x < m.x0 - PAD || x > m.x1 + PAD || Math.abs(z) > m.z + PAD) continue;
    const out = [[m.x0 - PAD - x, 0], [m.x1 + PAD - x, 0], [0, Math.sign(z || 1) * (m.z + PAD) - z]]; // the shortest way out
    const [dx, dz] = out.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
    return { x: dx, z: dz };
  }
  return null;
}
function groundTarget(controller, out) {
  if (mode === 'vr' && state?.phase === 'lobby') return null; // no teleporting about before the start
  if (riding) return null;
  aim(controller);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  let p = null;
  if (where === 'in') p = raycaster.ray.intersectPlane(ground, out);
  else for (let t = 0.3; t <= TELEPORT_MAX; t += 0.15) { // march along the ray until it meets the real ground
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, g = world.height(x, z);
    if (y <= g) { p = out.set(x, g, z); break; }
  }
  if (!p || p.distanceTo(o) > TELEPORT_MAX) return null;
  if (where === 'in') { const l = interior.toLocal(p.x, p.z); return interior.walkable(l.x, l.z) ? p : null; }
  const r = Math.hypot(p.x, p.z);
  return r > CFG.bounds - 1 || r < CFG.habRadius + 0.3 || inModule(p.x, p.z) || SOLID.some(s => Math.hypot(p.x - s.x, p.z - s.z) < s.r + 0.3) ? null : p;
}
// A hop needs a moment to recharge, so hopping is quicker than walking but slower than the Hauler.
let hopAt = -9;
const hopCharge = () => Math.min(1, (performance.now() / 1000 - hopAt) / CFG.teleportRecharge);
function teleport(p) {
  if (hopCharge() < 1 && mode === 'vr') return;
  hopAt = performance.now() / 1000;
  camera.getWorldPosition(headPos);
  rig.position.x += p.x - headPos.x;
  rig.position.z += p.z - headPos.z;
  if (where === 'out') { grounded = true; vy = 0; rig.position.y = world.height(p.x, p.z); }
}
// A hand's sideways offset from the head, in metres, positive to the right.
function lateral(controller) {
  controller.getWorldPosition(tmpV).sub(headPos);
  return tmpV.x * -fwd.z + tmpV.z * fwd.x;
}

const controllers = [], hands = [];
const jointGeo = new THREE.SphereGeometry(0.009, 8, 6);
const jointMat = new THREE.MeshStandardMaterial({ color: PAL.hex.enamel, roughness: 0.85 });
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
      c.userData.ray = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: PAL.hex.inkDim }));
      c.add(c.userData.ray);
    }
  });
  c.addEventListener('disconnected', () => {
    if (c.userData.grabbed) { c.userData.grabbed = null; fx.release(i, handPoint(i, new THREE.Vector3())); }
    c.userData.isHand = c.userData.pinched = c.userData.zoomed = false;
    marker.visible = false; leftDrag = null; endZoomGrab();
    if (pressed === c) pressed = null;
  });
  // Trigger on a controller, pinch on a bare hand: both arrive as "select".
  c.addEventListener('selectstart', () => {
    music.unlock(); // a trigger pull or a pinch is a gesture the browser counts, and the page's click listeners never see it
    const other = controllers[1 - i];
    // A trigger pulled, or a bare hand pinched, on something in reach grabs it and holds it until it lets
    // go. That is not a zoom, a turn, a teleport, the radio or a point at the panel.
    if (c.userData.grabbed && !fx.holding(i)) c.userData.grabbed = null; // what it held was taken from it (dropped by the server, a new mission)
    if (c.userData.grabbed) return; // already holding on with the grip
    if (running() && fx.grab(i, handPoint(i, new THREE.Vector3()))) { c.userData.grabbed = 'select'; return; }
    c.userData.pinched = true;
    // Both bare hands pinched: this is a zoom, not a turn, a teleport or a panel press.
    if (c.userData.isHand && other.userData.isHand && other.userData.pinched) {
      c.userData.zoomed = other.userData.zoomed = true;
      leftDrag = null;
      zoomGrab = { gap: handGap(), zoom };
      return;
    }
    if (c.userData.hand === 'left') { if (c.userData.isHand) leftDrag = { x: lateral(c) }; return; }
    if (!c.userData.isHand && useAny(c)) {
      // Pointed at a loose tool: it is in this hand now, and comes out of it when the trigger lets go.
      if (fx.holding(i)) { c.userData.grabbed = 'select'; return; }
      pressed = c; nextUse = performance.now() / 1000 + 0.1;
    } // a bare hand acts when the pinch lets go, see below
  });
  c.addEventListener('selectend', () => {
    if (pressed === c) pressed = null;
    if (c.userData.grabbed === 'select') { c.userData.grabbed = null; fx.release(i, handPoint(i, new THREE.Vector3())); return; }
    const wasZoom = c.userData.zoomed, act = c.userData.pinched && !wasZoom;
    c.userData.pinched = c.userData.zoomed = false;
    endZoomGrab();
    if (c.userData.hand === 'left') { leftDrag = null; return; }
    // A bare right hand uses the board, hatch or panel, or teleports, on release, not on pinch, so that the first
    // hand of a two-handed zoom does not fire on its way in. The ring shows where you will land.
    if (c.userData.isHand && act && !c.userData.exitAim && !useAny(c) && groundTarget(c, hitPoint)) teleport(hitPoint);
  });
  // The grip button does the same as the trigger. Whichever closed the hand is the one that opens it.
  c.addEventListener('squeezestart', () => { if (c.userData.grabbed && !fx.holding(i)) c.userData.grabbed = null; if (!c.userData.grabbed && running() && fx.grab(i, handPoint(i, new THREE.Vector3()))) c.userData.grabbed = 'squeeze'; });
  c.addEventListener('squeezeend', () => { if (c.userData.grabbed === 'squeeze') { c.userData.grabbed = null; fx.release(i, handPoint(i, new THREE.Vector3())); } });
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
      const p = !zoomGrab && !c.userData.grabbed && !c.userData.exitAim && !targetInReach(c) && groundTarget(c, hitPoint);
      marker.visible = !!p;
      if (p) {
        marker.position.set(p.x, p.y + 0.03, p.z);
        // The ring fills round as the hop recharges.
        const k = hopCharge();
        marker.geometry.setDrawRange(0, 6 * Math.max(1, Math.ceil(32 * k)));
        marker.material.opacity = k < 1 ? 0.45 : 0.85;
      }
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
// The Quest loses a tracked hand for a moment when the other hand covers it, which is exactly what
// pressing a button on your own wrist does. The cuff stays where it was for this long before it goes.
const TRACK_GRACE = 0.4;
let armLost = 0;
// Put the arm on the left hand or controller. Returns true if there is one to put it on.
function followArm(dt = 0) {
  const i = controllers.findIndex(c => c.userData.hand === 'left');
  const c = controllers[i], joint = c && c.userData.isHand ? hands[i].joints?.wrist : null;
  if (joint && joint.visible) { arm.follow(joint.matrix, 'hand'); armLost = 0; }
  else if (c && !c.userData.isHand && c.visible) { arm.follow(c.matrix, 'controller'); armLost = 0; }
  else if (arm.group.visible && (armLost += dt) < TRACK_GRACE) { /* keep the last pose */ }
  else arm.follow(null);
  if (!arm.group.visible) return false;
  arm.group.updateWorldMatrix(true, false);
  // The upper arm runs from the elbow to the left shoulder, wherever the head has got to.
  shoulder.set(headPos.x + fwd.z * SHOULDER.side, headPos.y - SHOULDER.down, headPos.z - fwd.x * SHOULDER.side);
  arm.aimUpper(arm.group.worldToLocal(shoulder));
  return true;
}
// The EXIT button on the cuff. In the debrief it takes the astronaut back to the READY board, still
// in the headset; otherwise it ends the headset session, back to the lobby. Two ways to press it, both
// held for a moment so a brushing hand does not end the game:
//   touch: the right index fingertip, or the fingertip of the right controller's glove, on the cap;
//   point: aim the right controller (or the right hand's pinch ray) at the cap and hold the trigger or pinch.
// The cap sinks, its lamp warms up, a click on touch and a relay clunk when it goes. After it goes it
// only works again once the finger has come off it and the trigger or pinch has been let go.
// Aimed at, its lamp glows amber; in the debrief it blinks amber, once a second, to say "press me".
const EXIT = { reach: 0.045, hold: 0.6, aim: 0.03, aimFar: 1.2 };
let exitHeld = 0, exitTouched = false, exitGone = false, tipLost = 0, exitClock = 0;
// The hold is timed in real seconds, like the airlock and the arm: 0.6 s is 0.6 s on a slow machine too.
const exitStep = now => { const d = exitClock ? Math.min(0.25, now - exitClock) : 0; exitClock = now; return d; };
const exitPos = new THREE.Vector3(), tipPos = new THREE.Vector3(), aimV = new THREE.Vector3(), exitRay = new THREE.Ray();
const exitInvite = now => !!debrief && Math.floor(now * 2) % 2 === 0;
// Is controller c's pointing ray on the cap?
function aimsAtExit(c) {
  if (!c || !c.visible) return false;
  exitRay.origin.setFromMatrixPosition(c.matrixWorld);
  const e = c.matrixWorld.elements; // the controller points down its own -z
  exitRay.direction.set(-e[8], -e[9], -e[10]).normalize();
  const along = aimV.copy(exitPos).sub(exitRay.origin).dot(exitRay.direction);
  return along > 0.02 && along < EXIT.aimFar && exitRay.distanceToPoint(exitPos) < EXIT.aim;
}
function exitButton(_dt, now, session) {
  const dt = exitStep(now);
  let near = false, hand = -1, have = false, aimed = false, pointing = false;
  for (const c of controllers) c.userData.exitAim = false;
  if (arm.group.visible) {
    exitPos.copy(arm.EXIT_TOP).applyMatrix4(arm.group.matrixWorld);
    hand = controllers.findIndex(c => c.userData.hand === 'right');
    const c = controllers[hand];
    if (c) {
      aimed = aimsAtExit(c);
      pointing = aimed && c.userData.pinched && !c.userData.zoomed && !c.userData.grabbed;
      const tip = c.userData.isHand ? hands[hand].joints?.['index-finger-tip'] : null, glove = fx.gloves[hand];
      const gloveTip = glove?.visible ? glove.userData.right?.userData.tip : null;
      have = true;
      if (tip && tip.visible) tip.getWorldPosition(tipPos);
      else if (!c.userData.isHand && gloveTip) gloveTip.getWorldPosition(tipPos); // the glove's fingertip
      else if (!c.userData.isHand && glove?.visible) tipPos.set(0, 0, -0.075).applyMatrix4(glove.matrixWorld); // before the glove model has loaded
      else have = false;
      near = (have && tipPos.distanceTo(exitPos) < EXIT.reach) || pointing;
      c.userData.exitAim = aimed;
    }
  }
  if (exitGone) { if (!near) exitGone = false; near = false; } // re-arms once the finger is off it
  if (near && !exitTouched) { radio.sfx('click'); pulse(hand, 0.3, 25); }
  exitTouched = near;
  // A fingertip the headset has lost for a moment keeps what it had pressed so far.
  tipLost = have || !arm.group.visible ? 0 : tipLost + dt;
  if (near) exitHeld += dt;
  else if (!(exitHeld > 0 && tipLost > 0 && tipLost < TRACK_GRACE)) exitHeld = Math.max(0, exitHeld - dt * 3);
  arm.pressExit(exitHeld / EXIT.hold, exitInvite(now) || (aimed && !exitGone));
  if (exitHeld >= EXIT.hold && !exitGone) {
    exitGone = true; exitHeld = 0;
    radio.sfx('relay'); pulse(hand, 1, 90);
    if (debrief) leaveDebrief();
    else session.end().catch(() => {});
  }
}
// On a laptop, hold X for the same moment.
function deskExit(_dt, now) {
  const dt = exitStep(now);
  const down = !!keys.x;
  if (exitGone) { if (!down) exitGone = false; }
  else exitHeld = down ? exitHeld + dt : 0;
  arm.pressExit(exitGone ? 0 : exitHeld / EXIT.hold, exitInvite(now));
  if (!exitGone && exitHeld >= EXIT.hold) {
    exitGone = true; exitHeld = 0;
    radio.sfx('relay');
    if (debrief) leaveDebrief();
    else leaveDesk();
  }
}
function leaveDesk() {
  mode = null; keyed = false; $('cross').hidden = true; cueOverlay.set(null);
  try { document.exitPointerLock?.(); } catch {}
  lobby.show(true);
}

// ---------- the debrief: the mission is over ----------
const leftHand = () => controllers.findIndex(c => c.userData.hand === 'left');
function startDebrief(s, now) {
  const won = !!s.result?.won;
  debrief = { won, score: s.score, reason: s.result?.reason || '', read: false, readFor: 0, beepAt: now + 6 };
  // The result board stands 1.4 m in front of the head at eye height, turned to face it, and stays put.
  camera.getWorldPosition(headPos); camera.getWorldDirection(fwd); fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize();
  resultBoard.position.set(headPos.x + fwd.x * 1.4, headPos.y - 0.05, headPos.z + fwd.z * 1.4);
  resultBoard.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0); // its front (+Z) turned back toward the head
  // The sting comes with the 'end' event. The hands feel it too: three short taps on the cuff
  // hand for a win, one long pull on both for a loss.
  if (won) for (let k = 0; k < 3; k++) setTimeout(() => pulse(leftHand(), 0.6, 60), k * 180);
  else { pulse(0, 0.9, 600); pulse(1, 0.9, 600); }
}
// Until the cuff has been read for a second, it beeps every few seconds, so they know where to look.
function debriefStep(dt, now) {
  if (!debrief || debrief.read) return;
  const looking = mode === 'vr' ? reading : arm.raise > 0.9;
  debrief.readFor = looking ? debrief.readFor + dt : 0;
  if (debrief.readFor >= 1) debrief.read = true;
  else if (now >= debrief.beepAt) { debrief.beepAt = now + 6; radio.sfx('watch'); pulse(leftHand(), 0.25, 30); }
}
// EXIT in the debrief: the crew goes back to the lobby (if nobody has taken it there already) and the
// astronaut, wherever they were, fades out and back in facing the READY board.
function leaveDebrief() {
  if (state && state.phase === 'results') net.send({ t: 'lobby' });
  debrief = null;
  placeInside(); // back to the start in the hall, by the status board
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

// ---------- portholes: the other place, through the glass ----------
// Each outdoor airlock's inner hatch has a porthole, and through it you see the hall itself; from the hall,
// the window on the south wall and each chamber's outer porthole look out at the Moon. It is drawn in the
// same pass as the eye's view, so a headset gets true stereo and parallax: the glass writes 1 into the
// stencil buffer and pushes the depth there to the far plane, then the other place is drawn a second time
// with every one of its materials testing for that 1, seen from where the eye would be if the two places
// were joined at the glass (the rig is moved for the pass, which also moves the headset's eye cameras).
// A clipping plane at the glass drops whatever is between the eye and it on the far side. Every material of
// both places carries that one plane all the time (parked out of the way between passes): switching a
// renderer-wide clipping plane on and off would make three.js swap, and rebuild, every shader twice a frame.
// One porthole a frame at most, the nearest that can be seen, and none further than 10 m.
const PORT_RANGE = 10;
const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
const punchMat = new THREE.ShaderMaterial({
  // The disc is drawn at the far plane (z = w), not with gl_FragDepth, which some drivers handle badly.
  vertexShader: 'void main() { vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.04, 0.04, 0.035, 1.0); }',
  depthFunc: THREE.AlwaysDepth, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
});
// A frame for each pair: `near` is the glass's frame where you stand, `far` the same glass's frame in the
// other place. Both are chamber roots, or the window's frames (local +z toward the side you look from).
const winFar = new THREE.Object3D(); // the hall window's partner on the habitat, its +z into the habitat
{ const W = PLACES.window.out; winFar.position.set(W.x, W.y, W.z); winFar.rotation.y = W.ry + Math.PI; world.hab.add(winFar); }
const portals = [];
function portal(glass, near, far, toWorld, clipZ, hide) {
  const mask = new THREE.Mesh(glass.geometry, maskMat); mask.renderOrder = 50; mask.visible = false;
  const punch = new THREE.Mesh(glass.geometry, punchMat); punch.renderOrder = 51; punch.visible = false;
  mask.frustumCulled = punch.frustumCulled = false;
  glass.add(mask, punch);
  portals.push({ glass, near, far, to: toWorld, clipZ, hide, mask, punch });
}
for (const id in world.doors) {
  const o = world.doors[id], h = interior.doors[id];
  portal(o.portholes.Inner, o.root, h.root, 'in', -0.08, [h.inner]);                     // from the Moon into the hall
  portal(h.portholes.Outer, h.root, o.root, 'out', CHAMBER.depth + 0.08, [o.outer]);    // from a hall chamber out
}
if (interior.windowGlass) portal(interior.windowGlass, interior.window, winFar, 'out', -0.05, []);
// The materials of each place, to switch their stencil test on for the pass. Collected again now and then:
// models arrive as they load.
const matsOf = { in: [], out: [] };
let matsAt = -9;
const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6); // parked: clips nothing
renderer.localClippingEnabled = true;
function collectMats(now) {
  if (now - matsAt < 3) return;
  matsAt = now;
  const grab = (roots, list) => { const seen = new Set(); list.length = 0; for (const r of roots) r.traverse(o => { if (!o.material || o === board) return; for (const m of [].concat(o.material)) if (!seen.has(m) && m !== maskMat && m !== punchMat) { seen.add(m); list.push(m); } }); };
  grab([interior.group], matsOf.in); grab(outdoors, matsOf.out);
  for (const m of [...matsOf.in, ...matsOf.out]) if (!m.clippingPlanes) { m.clippingPlanes = [clip]; m.needsUpdate = true; }
}
const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sphere = new THREE.Sphere();
const pM = new THREE.Matrix4(), pInv = new THREE.Matrix4(), nrm = new THREE.Vector3();
let chosen = null, portalCalls = 0, portalMs = 0, shadowsStale = true;
// Before the main draw: which porthole (if any) gets the stencil this frame.
function choosePortal(now) {
  if (chosen) { chosen.mask.visible = chosen.punch.visible = false; chosen = null; }
  collectMats(now);
  if ((!mode && !window.moonbase?.forcePortal) || window.moonbase?.noPortal || !portalAllowed()) return;
  camera.getWorldPosition(headPos);
  // In a headset, the camera given this frame's head pose and both eyes' frustum. (Not the XR ArrayCamera:
  // its updateMatrixWorld() drops the rig, which put the frustum at the world's origin and no porthole in it.)
  rig.updateMatrixWorld(true);
  if (renderer.xr.isPresenting) renderer.xr.updateCamera(camera); else camera.updateMatrixWorld();
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projView);
  let best = Infinity;
  for (const p of portals) {
    if (p.to === where) continue;                         // it looks into the place you are already in
    if (!isShown(p.glass)) continue;
    p.glass.getWorldPosition(tmpV);
    const d = tmpV.distanceTo(headPos);
    if (d > PORT_RANGE || d > best) continue;
    nrm.set(0, 0, 1).transformDirection(p.glass.matrixWorld);
    if (nrm.dot(headPos.clone().sub(tmpV)) <= 0) continue; // seen from behind
    sphere.set(tmpV, 0.3);
    if (!frustum.intersectsSphere(sphere)) continue;
    best = d; chosen = p;
  }
  if (chosen) chosen.mask.visible = chosen.punch.visible = true;
}
const isShown = m => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; };
// In a headset three.js draws into its own multisampled render target, and at the end of every render() it
// throws that target's depth and stencil away (and, without WEBGL_multisampled_render_to_texture, its
// multisampled colour too, after copying it out). The stencil the glass wrote in the main pass would be gone
// before the porthole pass reads it. So, while a porthole is drawn: the target keeps its depth and stencil
// after the main pass (resolveDepthBuffer), and the porthole pass draws no shadow maps, which would bind
// another framebuffer in between. Without the extension there is no way to keep the colour: no porthole.
let xrKeep = null; // { rt, depth, stencil } while the main pass is told to keep its depth and stencil
const xrTarget = () => (renderer.xr.isPresenting ? renderer.getRenderTarget() : null);
function portalAllowed() {
  const rt = xrTarget();
  return !rt || !(rt.samples > 0) || renderer.extensions.has('WEBGL_multisampled_render_to_texture');
}
function keepStencil(on) {
  if (on) {
    const rt = xrTarget(); if (!rt) return;
    xrKeep = { rt, depth: rt.resolveDepthBuffer, stencil: rt.resolveStencilBuffer };
    rt.resolveDepthBuffer = rt.resolveStencilBuffer = true;
  } else if (xrKeep) {
    xrKeep.rt.resolveDepthBuffer = xrKeep.depth; xrKeep.rt.resolveStencilBuffer = xrKeep.stencil; xrKeep = null;
  }
}
// After the main draw: the other place, through the chosen glass.
// Saved as an Euler, not a quaternion: copying a quaternion back makes three.js rewrite the rig's Euler, and a
// yaw past 90 degrees comes back as (pi, pi - yaw, pi), which turns the mouse and the keys round backwards.
const rigWas = { p: new THREE.Vector3(), r: new THREE.Euler() };
function renderPortal() {
  if (!chosen) return;
  const p = chosen, other = p.to, mats = matsOf[other];
  p.near.updateWorldMatrix(true, false); p.far.updateWorldMatrix(true, false);
  pM.multiplyMatrices(p.far.matrixWorld, pInv.copy(p.near.matrixWorld).invert()); // near place -> far place
  // The clipping plane: the far glass's plane, keeping the side away from the eye.
  nrm.set(0, 0, -1).transformDirection(p.far.matrixWorld);
  tmpV.set(0, 0, p.clipZ).applyMatrix4(p.far.matrixWorld);
  clip.setFromNormalAndCoplanarPoint(p.clipZ > 0 ? nrm.negate() : nrm, tmpV);
  // Move the rig (and the eyes) by the pair's transform; hide everything that rides on it.
  rigWas.p.copy(rig.position); rigWas.r.copy(rig.rotation);
  rig.updateMatrix(); tmpM.multiplyMatrices(pM, rig.matrix); tmpM.decompose(rig.position, rig.quaternion, tmpV);
  rig.updateMatrixWorld(true);
  const riding = [...rig.children.filter(o => o !== camera), ...camera.children.filter(o => !o.isLight)];
  const shownRide = riding.map(o => o.visible); riding.forEach(o => { o.visible = false; });
  const shownHide = p.hide.map(o => o.visible); p.hide.forEach(o => { o.visible = false; });
  const shownOut = outdoors.map(o => o.visible), hallShown = interior.group.visible, boardShown = board.visible;
  for (const o of outdoors) o.visible = other === 'out';
  interior.group.visible = other === 'in'; board.visible = false;
  for (const m of mats) { m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc; m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp; }
  const autoClear = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate;
  // A colour background makes three.js clear the frame (and the stencil) even with autoClear off.
  const bg = scene.background; scene.background = null;
  renderer.autoClear = false;
  renderer.shadowMap.autoUpdate = false;
  if (!renderer.xr.isPresenting) { renderer.shadowMap.needsUpdate = other === 'out' && shadowsStale; shadowsStale = false; }
  keepStencil(false); // this pass is the last one: the target may drop its depth and stencil after it
  const t0 = performance.now();
  renderer.render(scene, camera);
  portalMs = performance.now() - t0;
  portalCalls = renderer.info.render.calls; // three.js counts each render() from zero
  renderer.autoClear = autoClear; renderer.shadowMap.autoUpdate = shadows; scene.background = bg;
  clip.set(nrm.set(0, 1, 0), 1e6); // parked again
  for (const m of mats) m.stencilWrite = false;
  outdoors.forEach((o, i) => { o.visible = shownOut[i]; }); interior.group.visible = hallShown; board.visible = boardShown;
  p.hide.forEach((o, i) => { o.visible = shownHide[i]; });
  riding.forEach((o, i) => { o.visible = shownRide[i]; });
  rig.position.copy(rigWas.p); rig.rotation.copy(rigWas.r); rig.updateMatrixWorld(true);
}

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

// ---------- the airlocks: walking between the surface and the hall ----------
// Every door on the habitat is a walk-in chamber (client/airlock.js), and the hall has an identical twin of
// each (client/interior.js). Stand in one: the hatch behind you swings shut. With both shut, in one frame,
// the rig is moved from this chamber to its twin, which looks the same to the pixel, and the other place is
// drawn instead. The air hisses, and the hatch in front swings open. The hall is bigger than the habitat
// outside, and nobody can tell.
const AIR = CFG.airlock;
const ease = t => t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2;
let cycle = null;  // { id, step: 'close' | 'repress' | 'open' | 'back', t } while a door is cycling
let dwell = 0, armed = true; // seconds stood in a chamber; armed again once you have stepped out of it
const chamberOf = (id, w = where) => w === 'in' ? interior.doors[id] : world.doors[id];
const localHead = (ch, out) => { ch.root.updateWorldMatrix(true, false); return ch.root.worldToLocal(out.copy(headPos)); };
const inTrigger = (ch, l) => ch.trigger.containsPoint(l);
// Show one place, hide the other.
function showPlace(to) {
  where = to;
  interior.group.visible = to === 'in';
  for (const o of outdoors) o.visible = to === 'out';
  marker.visible = false;
}
// Apply a rigid move (a Matrix4 of a yaw and a translation) to the rig: the head keeps its place in the chamber.
const sM = new THREE.Matrix4(), sV = new THREE.Vector3(), sQ = new THREE.Quaternion();
function moveRig(m) {
  rig.updateMatrix(); sM.multiplyMatrices(m, rig.matrix); sM.decompose(rig.position, sQ, sV);
  rig.rotation.set(0, 2 * Math.atan2(sQ.y, sQ.w), 0); // yaw only, kept in the rig's usual Euler
  rig.updateMatrixWorld(true);
}
// The swap, with both hatches shut: from this door's chamber where you are to its twin in the other place.
function swap(id) {
  const from = chamberOf(id), to = chamberOf(id, where === 'in' ? 'out' : 'in');
  from.root.updateWorldMatrix(true, false); to.root.updateWorldMatrix(true, false);
  moveRig(sM.copy(to.root.matrixWorld).multiply(tmpM.copy(from.root.matrixWorld).invert()));
  showPlace(where === 'in' ? 'out' : 'in');
  door = id;
  // The chamber left behind goes back to how it stands when nobody is in it.
  if (where === 'in') { from.setOuter(1); from.setInner(0); from.setLamp('green'); from.setPressure(0); to.setOuter(0); to.setInner(0); to.setPressure(0); }
  else { from.setInner(1); from.setOuter(0); from.setLamp('green'); from.setPressure(1); to.setInner(0); to.setOuter(0); to.setPressure(1); }
  sendPose();
}
// The hatch nearest where you came from, and the far one, for the chamber you are in.
const nearHatch = (ch, w) => w === 'out' ? ['outer', ch.setOuter] : ['inner', ch.setInner];
function airlockStep(dt) {
  camera.getWorldPosition(headPos);
  if (!cycle) {
    let here = null;
    for (const id in world.doors) { const ch = chamberOf(id); if (inTrigger(ch, localHead(ch, tmpV))) { here = id; break; } }
    if (!here) { dwell = 0; armed = true; return; }
    if (!armed) return;
    dwell += dt;
    if (dwell < AIR.dwell) return;
    dwell = 0; armed = false;
    cycle = { id: here, step: 'close', t: 0, from: where };
    const ch = chamberOf(here); ch.setLamp('amber');
    hatchSound('creak', ch, where === 'out' ? CHAMBER.depth : 0);
    return;
  }
  const c = cycle, ch = chamberOf(c.id);
  c.t += dt;
  if (c.step === 'close') {
    const k = Math.min(1, c.t / AIR.close), set = c.from === 'out' ? ch.setOuter : ch.setInner;
    set(1 - ease(k));
    // Changed your mind: step back out before it is half shut and it swings open again.
    if (c.t < AIR.abort && !inTrigger(ch, localHead(ch, tmpV))) { c.step = 'back'; c.t = (1 - ease(k)) * AIR.close; return; }
    if (k >= 1) {
      hatchSound('hatch', ch, c.from === 'out' ? CHAMBER.depth : 0);
      pulse(0, 0.6, 60); pulse(1, 0.6, 60);
      swap(c.id);
      c.step = 'repress'; c.t = 0;
      radio.sfx('repress');
      pulse(0, 0.25, AIR.repress * 1000); pulse(1, 0.25, AIR.repress * 1000);
    }
  } else if (c.step === 'back') {
    const k = Math.min(1, c.t / AIR.close), set = c.from === 'out' ? ch.setOuter : ch.setInner;
    set(ease(k));
    if (k >= 1) { ch.setLamp('green'); cycle = null; }
  } else if (c.step === 'repress') {
    const k = Math.min(1, c.t / AIR.repress);
    ch.setPressure(where === 'in' ? k : 1 - k); // air in, or air out
    if (k >= 1) { c.step = 'open'; c.t = 0; hatchSound('creak', ch, where === 'in' ? 0 : CHAMBER.depth); }
  } else if (c.step === 'open') {
    const k = Math.min(1, c.t / AIR.open), set = where === 'in' ? ch.setInner : ch.setOuter;
    set(ease(k));
    if (k >= 1) { ch.setLamp('green'); cycle = null; }
  }
}
function hatchSound(kind, ch, z) {
  tmpV.set(0, 1.2, z); ch.root.localToWorld(tmpV);
  radio.sfxAt(kind, tmpV, 1);
}
// Put the astronaut in the hall at the start point, facing up it, with every airlock at rest.
function placeInside() {
  cycle = null; dwell = 0; armed = true;
  for (const id in world.doors) {
    const o = world.doors[id], h = interior.doors[id];
    o.setOuter(1); o.setInner(0); o.setLamp('green'); o.setPressure(0);
    h.setInner(1); h.setOuter(0); h.setLamp('green'); h.setPressure(1);
  }
  showPlace('in');
  door = CFG.spawn.door;
  rig.position.y = 0; vy = 0; grounded = true; riding = false; rideWas = null;
  rig.rotation.set(0, 0, 0);
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(headPos);
  const spot = interior.toWorld(CFG.spawn.x, CFG.spawn.z);
  rig.position.x += spot.x - headPos.x; rig.position.z += spot.z - headPos.z;
  rig.updateMatrixWorld(true);
}
// Keep the head out of walls. In a chamber, or its doorway: its walls, and whichever hatches are shut.
const BODY = 0.25;
function clampChamber(ch, l) {
  const { width: AW, depth: AD, door: { hw } } = CHAMBER;
  const lim = l.z < 0.12 || l.z > AD - 0.12 ? hw - 0.12 : AW / 2 - BODY;
  const x = Math.max(-lim, Math.min(lim, l.x));
  let z = l.z;
  if (ch.innerT < 0.5) z = Math.max(z, BODY);
  if (ch.outerT < 0.5) z = Math.min(z, AD - BODY);
  if (x === l.x && z === l.z) return;
  tmpV.set(x, l.y, z); ch.root.localToWorld(tmpV);
  rig.position.x += tmpV.x - headPos.x; rig.position.z += tmpV.z - headPos.z;
}
// Which chamber (or doorway into one) is the head in?
function chamberAt(l) {
  for (const id in world.doors) {
    const ch = chamberOf(id), lp = localHead(ch, l);
    if (Math.abs(lp.x) < CHAMBER.width / 2 - 0.05 && lp.z > (where === 'in' ? -0.45 : -0.1) && lp.z < CHAMBER.depth + (where === 'in' ? 0.1 : 0.35)) return { id, ch, l: lp };
  }
  return null;
}
// While a door cycles, the head stays in that chamber.
let inChamber = false;
function clampWalk() {
  camera.getWorldPosition(headPos);
  const lv = new THREE.Vector3();
  inChamber = false;
  if (riding) return; // the footplate holds the head (rideStep)
  if (cycle) inChamber = true;
  if (cycle) { const ch = chamberOf(cycle.id); clampChamber(ch, localHead(ch, lv)); return; }
  const at = chamberAt(lv);
  if (at) { inChamber = true; clampChamber(at.ch, at.l); return; }
  if (where === 'in') {
    const l = interior.toLocal(headPos.x, headPos.z), c = interior.clamp(l.x, l.z);
    rig.position.x += c.x - l.x; rig.position.z += c.z - l.z;
    return;
  }
  const d = Math.hypot(headPos.x, headPos.z);
  if (d > CFG.bounds - 1) { const k = (CFG.bounds - 1) / d; rig.position.x += headPos.x * (k - 1); rig.position.z += headPos.z * (k - 1); }
  else if (d < CFG.habRadius && d > 0.01) { const k = CFG.habRadius / d; rig.position.x += headPos.x * (k - 1); rig.position.z += headPos.z * (k - 1); }
  camera.getWorldPosition(headPos);
  const m = inModule(headPos.x, headPos.z); if (m) { rig.position.x += m.x; rig.position.z += m.z; }
  // Out in the field: boulders and landmarks are solid.
  camera.getWorldPosition(headPos);
  if (Math.hypot(headPos.x, headPos.z) > 12) {
    const p = pushOut(headPos.x, headPos.z, 0.35, SOLID, Infinity);
    if (p.hit) { rig.position.x += p.x - headPos.x; rig.position.z += p.z - headPos.z; }
  }
  // The outside of each chamber is solid.
  camera.getWorldPosition(headPos);
  for (const id in world.doors) {
    const ch = world.doors[id], lp = localHead(ch, lv), side = CHAMBER.width / 2 + 0.3;
    if (Math.abs(lp.x) < side && lp.z > -0.3 && lp.z < CHAMBER.depth + 0.05) {
      tmpV.set(Math.sign(lp.x || 1) * side, lp.y, lp.z); ch.root.localToWorld(tmpV);
      rig.position.x += tmpV.x - headPos.x; rig.position.z += tmpV.z - headPos.z;
      camera.getWorldPosition(headPos);
    }
  }
}

// ---------- riding the Hauler ----------
// Stand on the footplate at the back and hold the rail. The Technician drives; the rig is carried with the
// Hauler (turning with it, or holding its heading with CFG.ride.snapYaw), its floor is the plate, and the
// horizon stays level: only the height changes. Get off once it has stopped: push the stick (E on a laptop).
let riding = false, rideAt = 0, rideWas = null, rideFloor = 0, rumbleAt = 0;
const plateW = new THREE.Vector3(), rideM = new THREE.Matrix4(), rideT = new THREE.Matrix4();
const haulerStopped = () => Math.abs(state?.rovers?.hauler?.v || 0) < 0.25;
// ---------- the hand on a laptop: the centre dot becomes a badge on whatever is in reach (client/hand.js) ----------
// What the Hauler's rail offers: ride it, wait for it to stop, come closer, or step off once it has stopped.
function rideCue(desk) {
  const v = verb => ({ shape: 'open', verb: desk ? 'E: ' + verb : verb });
  if (riding) return haulerStopped() ? v('STEP OFF') : null;
  if (!haulerStopped()) return { shape: 'open', verb: 'WAIT', dim: true };
  camera.getWorldPosition(headPos); world.fixtures.plate.getWorldPosition(plateW);
  return Math.hypot(plateW.x - headPos.x, plateW.z - headPos.z) > CFG.ride.mountReach ? { shape: 'open', verb: 'CLOSER', dim: true } : v('RIDE');
}
const cueOverlay = makeCueOverlay(document.getElementById('handCue'));
let cueCount = -1, cueFist = 0;
function deskCue(now) {
  if (mode !== 'desk' || !running() || debrief) { cueOverlay.set(null); if (mode === 'desk') $('cross').hidden = false; return; }
  // A grab that worked: the hand closes for a moment.
  const count = fx.hands.filter(Boolean).length + (state.carry || []).length; // tools and samples in hand
  if (cueCount >= 0 && count > cueCount) cueFist = now + 0.4;
  cueCount = count;
  let cue = null, onRail = false;
  if (now < cueFist) cue = { shape: 'fist', verb: '' };
  else {
    aim(null); raycaster.far = 8;
    const hit = raycaster.intersectObjects(fx.targets(), false)[0];
    const c = hit && hit.object.userData.cue ? hit.object.userData.cue() : null;
    if (c) { cue = hit.distance > REACH ? { shape: c.shape, verb: 'CLOSER', dim: true } : c; onRail = hit.object === fx.railHit && !cue.dim; }
  }
  cueOverlay.set(cue);
  $('cross').hidden = !!cue;
  world.fixtures.grip?.userData.glow(onRail, now);
}
function mount(i) {
  if (riding) return true; // already aboard: the hand just holds the rail
  if (!running() || where !== 'out') return false;
  if (!haulerStopped()) { radio.sfx('refuse'); return false; }
  camera.getWorldPosition(headPos);
  world.fixtures.plate.getWorldPosition(plateW);
  if (Math.hypot(plateW.x - headPos.x, plateW.z - headPos.z) > CFG.ride.mountReach) return false;
  net.send({ t: 'do', a: { mount: true } });
  riding = true; rideAt = performance.now() / 1000; rideWas = null;
  // Onto the plate in one frame: an instant move is comfortable, a glide is not.
  rig.position.x += plateW.x - headPos.x; rig.position.z += plateW.z - headPos.z;
  rideFloor = plateW.y; vy = 0; grounded = true; rig.position.y = rideFloor;
  radio.sfxAt('clank', plateW, 1);
  if (i === 0 || i === 1) pulse(i, 1, 90);
  return true;
}
function dismount(side = -1) {
  if (!riding || !haulerStopped()) return false;
  net.send({ t: 'do', a: { mount: false } });
  riding = false; rideWas = null; rideAt = performance.now() / 1000;
  const h = world.rovers.hauler, yaw = h.userData.yaw, sx = side >= 0 ? 1 : -1;
  world.fixtures.plate.getWorldPosition(plateW);
  const x = plateW.x + Math.cos(yaw) * 1.4 * sx, z = plateW.z - Math.sin(yaw) * 1.4 * sx;
  camera.getWorldPosition(headPos);
  rig.position.x += x - headPos.x; rig.position.z += z - headPos.z;
  vy = 0; grounded = true; rig.position.y = world.height(x, z);
  tmpV.set(x, rig.position.y, z); world.puff(tmpV, 14, 0.7);
  radio.sfxAt('thud', tmpV, 0.6, { mass: 80 }); pulse(0, 0.6, 60); pulse(1, 0.6, 60);
  return true;
}
function rideStep(dt, now) {
  const h = world.rovers.hauler, yaw = h.userData.yaw;
  if (rideWas) {
    // Carry the rig the way the Hauler moved since last frame: a turn about its old centre, then the step.
    const dyaw = CFG.ride.snapYaw ? 0 : yaw - rideWas.yaw;
    rideM.makeTranslation(h.position.x, 0, h.position.z).multiply(rideT.makeRotationY(dyaw)).multiply(tmpM.makeTranslation(-rideWas.x, 0, -rideWas.z));
    moveRig(rideM);
  }
  rideWas = { x: h.position.x, z: h.position.z, yaw };
  // The head stays over the footplate.
  camera.getWorldPosition(headPos);
  const P = HAULER.plate, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const dx = headPos.x - h.position.x, dz = headPos.z - h.position.z;
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // into the Hauler's frame (yaw only)
  const cx = Math.max(P.x - P.hw, Math.min(P.x + P.hw, lx)), cz = Math.max(P.z - P.hd, Math.min(P.z + P.hd, lz));
  if (cx !== lx || cz !== lz) {
    rig.position.x += (cx * cs + cz * sn) - dx; rig.position.z += (-cx * sn + cz * cs) - dz;
  }
  world.fixtures.plate.getWorldPosition(plateW);
  rideFloor = plateW.y;
  // A motor hum and the regolith under the wheels, through the suit; a faint buzz in a hand on the rail.
  const v = Math.abs(h.userData.v || 0);
  if (v > 0.3 && now > rumbleAt) {
    rumbleAt = now + 0.28;
    radio.burst(0.3, 0.02 + v * 0.012, 'lowpass', 120 + v * 30);
    for (const i of [0, 1]) if (fx.holding(i)?.kind === 'rail') pulse(i, 0.08 + v * 0.03, 40);
  }
}
let vy = 0, turnArmed = true, lastPose = 0, shake = 0, grounded = true;
const footV = new THREE.Vector3();
// The height of the ground under the head: the drawn lunar surface outside, the floor (0) indoors
// and in an airlock chamber.
function floorY() {
  if (riding) return rideFloor;
  if (where !== 'out' || cycle || chamberAt(footV)) return 0; // an airlock chamber has its own floor
  camera.getWorldPosition(footV);
  return world.ground ? world.ground(footV.x, footV.z) : 0;
}
function control(dt, now) {
  let mx = 0, mz = 0, jump = false, ptt = mode === 'desk' && !!keys.tab;
  const waiting = mode === 'vr' && !!state && state.phase === 'lobby'; // before the start, by the status board: look around, but stay put
  const session = renderer.xr.getSession();
  camera.getWorldPosition(headPos);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  if (session) {
    ptt = handControls(ptt);
    if (followArm(dt) && gaugesReadable(dt)) ptt = true;
    exitButton(dt, now, session);
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const sx = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
      const sy = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;
      if (src.handedness === 'left') {
        if (Math.abs(sx) > 0.15) mx = sx;
        if (Math.abs(sy) > 0.15) mz = sy;
        if (riding && Math.hypot(sx, sy) > 0.7) dismount(sx); // push the stick to step off (only once the Hauler has stopped)
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
    deskExit(dt, now);
  }

  if (waiting || riding) mx = mz = 0, jump = false;
  const speed = WALK * dt;
  rig.position.x += (-mz * fwd.x + mx * -fwd.z) * speed;
  rig.position.z += (-mz * fwd.z + mx * fwd.x) * speed;

  // Feet on the ground: follow it over craters and slopes; a hop is a slow, floaty lunar arc.
  const floor = floorY();
  if (jump && grounded) { vy = 2.0; grounded = false; }
  vy -= GRAVITY * dt;
  let y = rig.position.y + vy * dt;
  if (grounded && y - floor < 0.3) y = floor; // walking downhill: stay on the slope rather than drift off it
  if (y <= floor) { y = floor; vy = 0; grounded = true; } else grounded = false;
  rig.position.y = y;

  // Stay inside the play area and outside the habitat walls; or, indoors, inside the hall; or in an airlock.
  if (riding) rideStep(dt, now);
  clampWalk();

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
// Where each hand is, left then right, in the body's frame: x to the right, y up from the floor, z ahead,
// scaled like the head height. For the figure the rover camera shows. null for a hand not being tracked.
const armPos = new THREE.Vector3();
function arms() {
  if (!renderer.xr.isPresenting) return [null, null];
  const k = 1.65 / standing, round = v => Math.round(v * 100) / 100;
  return ['left', 'right'].map(side => {
    const i = controllers.findIndex(c => c.userData.hand === side), c = controllers[i];
    if (!c || !c.visible) return null;
    handPoint(i, armPos).sub(headPos);
    return [round((armPos.x * -fwd.z + armPos.z * fwd.x) * k), round((armPos.y + headPos.y - rig.position.y) * k), round((armPos.x * fwd.x + armPos.z * fwd.z) * k)];
  });
}
function myPose() {
  const h = headHeight();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const d = PLACES.doors[door] || PLACES.doors.S, inside = where === 'in';
  return { x: inside ? d.x : headPos.x, z: inside ? d.z : headPos.z, ry: Math.atan2(fwd.x, fwd.z), h, inside, door, riding, arms: arms() };
}
function sendPose() { net.send({ t: 'pose', ...myPose() }); }

placeInside(); // the astronaut starts in the hall, by the status board

// ---------- main loop ----------
// A picture of the view as just drawn, as a PNG data URL, for the smoke test's optional screenshots.
let snapWaiting = null;
const snap = () => new Promise(resolve => { snapWaiting = resolve; });
let lastFrame = performance.now() / 1000, mainCalls = 0;
let armFrame = lastFrame;
let drawEvery = 1, skipped = 0; // see moonbase.drawEvery
renderer.setAnimationLoop(() => {
  const now = performance.now() / 1000, dt = Math.min(0.05, now - lastFrame);
  lastFrame = now;
  const s = state;
  const run = !!s && s.phase === 'run';
  if (s) {
    if (s.phase !== lastPhase) {
      music.mood(run ? 'run' : 'calm');
      if (run) { flashUntil = 0; debrief = null; fx.reset(); placeInside(); }
      if (!run) riding = false;
      if (s.phase === 'results' && s.result && !debrief) startDebrief(s, now);
      lastPhase = s.phase;
    }
    if (s.ev && s.ev.n !== lastEv) {
      lastEv = s.ev.n;
      const k = s.ev.kind;
      // The astronaut is never told what broke or where: that is mission control's job.
      // The port says what went in: a rising two-tone for a sample, a flat buzz for a dud.
      if (k === 'found' || k === 'dud') { radio.sfxAt(k, world.port.localToWorld(tmpV.copy(world.fixtures.portMouth)), 1); if (k === 'found') { pulse(0, 0.5, 60); pulse(1, 0.5, 60); } else { pulse(0, 0.8, 90); setTimeout(() => pulse(0, 0.8, 90), 150); } }
      if (k === 'found' && s.tally && s.tally.banked >= s.tally.wanted) { radio.sfx('go'); pulse(0, 1, 160); pulse(1, 1, 160); } // the manifest is home
      if (k === 'end') radio.sfx(s.result && s.result.won ? 'won' : 'lost');
      if (k === 'solve') show('ok', 4);
      if (k === 'hit') show('bad', 5);
      if (k === 'hit') { pulse(0, 1, 250); pulse(1, 1, 250); }
    }
    if (run) world.apply(s.scene, now); else world.drawSamples([]);
    world.moveRovers(s.rovers, 1 - Math.exp(-Math.min(1, now - armFrame) * 10)); // eased by real time, so a slow frame does not leave a rover behind
    // The rack on the bench: one canister for each sample banked.
    const banked = run && s.scene?.samples ? (s.tally?.banked || 0) + 0 : 0;
    rack.forEach((g, n) => { g.visible = n < (run ? (s.scene?.port?.banked ?? banked) : 0); });
    // Aboard and not riding (or the other way round): believe the server once it has had time to answer.
    if (riding && run && !s.riding && performance.now() / 1000 - rideAt > 1.5) { riding = false; rideWas = null; }
    if (!riding && run && s.riding && performance.now() / 1000 - rideAt > 1.5) { riding = true; rideWas = null; }

    // Sound: the leak hiss, and rocks landing during a shower. Indoors a hull breach is heard from
    // the airlock end of the hall, and the shower is a rumble through the walls.
    const inside = where === 'in';
    const crackAt = inside ? interior.doors[door].root.getWorldPosition(tmpV).setY(1.6) : world.fixtures.crack.userData.centre;
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
  // The hall goes to its red backup lights when the battery runs flat.
  const powerOut = debugOutage || (run && s.scene.dark);
  interior.setPower(powerOut);
  interior.setDamage(debugDamage ? { dark: true, hull: {}, meteor: 5 } : run ? s.scene : null, where === 'in');
  interior.update(dt, now);
  radio.room(where === 'in' ? (interior.dark ? 0.15 : 1) : 0);
  if (mode) control(dt, now); else keyed = false;
  if (mode) airlockStep(Math.min(1, now - armFrame)); // real time, so the airlock is as quick on a slow machine
  if (pressed && now > nextUse) { nextUse = now + 0.09; use(pressed === 'desk' ? null : pressed, true); }

  // Hands for the fixtures: where a held tool is drawn, and where the fingers are.
  const vr = mode === 'vr';
  if (vr) for (const i of [0, 1]) {
    const h = handInfo[i], c = controllers[i];
    h.obj = c; h.side = c.userData.hand || ''; h.tracked = !!c.userData.isHand; handPoint(i, h.point);
  }
  fx.update(dt, now, vr ? handInfo : [], vr);
  deskCue(now);
  // Under cover while rocks are falling: the cuff says so, because there is no other way to know.
  covered = run && s.scene.meteor !== null && sheltered(myPose(), s.rovers.hauler);
  // The shadow map's box follows the head round the field.
  if (where === 'out') { camera.getWorldPosition(headPos); world.follow(headPos.x, headPos.z); }

  camera.getWorldPosition(headPos); camera.getWorldDirection(tmpV);
  radio.listen(headPos, tmpV);
  shake *= 0.86;
  if (mode === 'desk') camera.rotation.z = (Math.random() - 0.5) * shake;
  drawResultBoard();
  debriefStep(Math.min(0.25, now - armFrame), now); // real time, like the arm and the airlock: a second of reading is a second on a slow machine too
  // On a laptop the radio key swings the arm up. In a headset it is on your own arm (see followArm).
  if (!arm.tracked) arm.update(Math.min(0.25, now - armFrame), keyed || (!!debrief && !!mode)); // real time, so the arm is as quick on a slow machine
  armFrame = now;
  if (arm.group.visible) drawGauges(now);
  // Tests only (moonbase.drawEvery): on a machine with software WebGL, draw one frame in n so the game's
  // logic keeps pace with a scripted mission. Matrices still update, so aiming and clicking stay right.
  if (drawEvery > 1 && ++skipped % drawEvery && !snapWaiting) { scene.updateMatrixWorld(); return; }
  renderScope();
  choosePortal(now);
  keepStencil(!!chosen);
  renderer.render(scene, camera);
  mainCalls = renderer.info.render.calls;
  renderPortal();
  keepStencil(false);
  if (snapWaiting) { snapWaiting(renderer.domElement.toDataURL('image/png')); snapWaiting = null; } // must follow the draw in the same frame
});

// For debugging from the browser console, and for the tests: moonbase.state(), moonbase.fx.targets() ...
window.moonbase = { mount: () => mount(2), dismount: () => dismount(-1), riding: () => riding, resetStanding: () => { standing = 1.2; }, state: () => state, fx, world, interior, radio, rig, camera, net, board, THREE, scene, use: () => use(null), headset: () => headset, sendPose, myPose, teleport, turnRig,
  where: () => where, placeInside, showPlace, renderer, phys, forcePortal: false,
  drawEvery: n => { drawEvery = Math.max(1, n | 0); }, // tests: draw one frame in n (the logic still runs every frame)
  // For the tests: stand the head at (x, z) in a place ('in': room coordinates, 'out': world), facing yaw (0 = north).
  standAt(to, x, z, yaw = 0) { cycle = null; showPlace(to); rig.rotation.set(0, yaw, 0); rig.position.set(0, 0, 0); rig.updateMatrixWorld(true); camera.getWorldPosition(headPos); const p = to === 'in' ? interior.toWorld(x, z) : { x, z }; rig.position.x = p.x - headPos.x; rig.position.z = p.z - headPos.z; riding = false; vy = 0; grounded = true; rig.position.y = to === 'in' ? 0 : world.height(p.x, p.z); rig.updateMatrixWorld(true); },
  airlock: () => cycle && { ...cycle }, door: () => door, portal: () => chosen && { to: chosen.to, glass: chosen.glass.name, calls: portalCalls }, calls: () => ({ portalMs, main: mainCalls, portal: chosen ? portalCalls : 0, physicsMs: phys.stepMs, bodies: phys.count() }), outage: on => { debugOutage = on; }, wreck: on => { debugDamage = on; },
  zoom: () => zoom, setZoom, debrief: () => debrief, resultBoard, controllers, handControls, scope: scopeMesh, arm, snap, radioState: () => ({ keyed, talking, rx, reading, shown: radioState() }) };

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
$('deskBtn').onclick = () => { mode = 'desk'; suited(true); keys.tab = false; $('deskBtn').blur(); lobby.show(false); $('cross').hidden = false; lockPointer(); };
// In a headset the arm lives in the room with the hands, and follows the left one; on a laptop it hangs off the view.
// A headset is only ever the Astronaut: it has nothing to choose but entering VR.
isHeadset().then(h => { headset = h; if (h) { $('deskBtn').hidden = true; document.body.classList.add('headset'); } });
renderer.xr.addEventListener('sessionstart', () => {
  music.unlock(); mode = 'vr'; suited(true); rig.add(arm.group); arm.setTracked(true); lobby.show(false);
  // Taking the headset off before the start: not suited, so Mission Ops cannot call GO (and a GO already called stands down).
  const session = renderer.xr.getSession();
  session.addEventListener('visibilitychange', () => { if (state?.phase === 'lobby') suited(session.visibilityState !== 'hidden'); });
});
renderer.xr.addEventListener('sessionend', () => { suited(false); exitHeld = 0; exitTouched = exitGone = false; arm.pressExit(0); mode = null; zoom = 1; zoomGrab = null; reading = false; readFor = 0; camera.add(arm.group); arm.setTracked(false); lobby.show(true); });
