// A pretend VR headset for tests. Loaded into the page before anything else (Playwright's
// addInitScript), it replaces navigator.xr with just enough of WebXR for three.js to run a real
// immersive session: a head pose, two eyes, two controllers with grip, trigger, sticks and haptics,
// or two tracked hands with joints and a pinch. The test moves them with window.fakeXR.
//
// Everything is in the session's reference space, which the game parents to its "rig": metres,
// +y up, the floor at y = 0, -z ahead. Quaternions are [x, y, z, w].
//
// It draws to the page's own canvas, both eyes side by side, so a screenshot shows what the headset would.
(() => {
  const JOINTS = ['wrist',
    'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    ...['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].flatMap(f => [`${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`])];

  // ---- small maths ----
  const rotate = (q, v) => { // v turned by quaternion q
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  };
  const matrix = (p, q) => { // column-major 4x4 from a position and a quaternion
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    return new Float32Array([1 - (yy + zz), xy + wz, xz - wy, 0, xy - wz, 1 - (xx + zz), yz + wx, 0, xz + wy, yz - wx, 1 - (xx + yy), 0, p[0], p[1], p[2], 1]);
  };
  const perspective = (fovY, aspect, near, far) => {
    const f = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
    return m;
  };
  const pose = (p, q) => ({ transform: { matrix: matrix(p, q), position: { x: p[0], y: p[1], z: p[2] }, orientation: { x: q[0], y: q[1], z: q[2], w: q[3] } }, emulatedPosition: false });

  // ---- the device ----
  const dev = {
    head: { p: [0, 1.7, 0], q: [0, 0, 0, 1] },
    left: { p: [-0.2, 1.2, -0.3], q: [0, 0, 0, 1], kind: 'controller', pinch: false, buttons: [0, 0, 0, 0, 0, 0], axes: [0, 0, 0, 0] },
    right: { p: [0.2, 1.2, -0.3], q: [0, 0, 0, 1], kind: 'controller', pinch: false, buttons: [0, 0, 0, 0, 0, 0], axes: [0, 0, 0, 0] },
    haptics: [], // every buzz asked for: { side, strength, ms }
    frame: 0,
  };
  let session = null, frame = null;

  // Where each joint of a tracked hand is, relative to the hand. Only the thumb and index tips matter
  // to the game (a pinch is the two touching); the rest are laid out so a drawn hand looks like one.
  function jointOffset(name, pinch) {
    if (name === 'wrist') return [0, 0, 0.09];
    if (name === 'thumb-tip') return pinch ? [0, 0, -0.07] : [-0.05, 0, -0.03];
    if (name === 'index-finger-tip') return pinch ? [0, 0, -0.07] : [-0.01, 0.01, -0.1];
    const [finger, part] = name.startsWith('thumb') ? ['thumb', name.slice(6)] : [name.split('-finger-')[0], name.split('-finger-')[1]];
    const x = { thumb: -0.04, index: -0.015, middle: 0.005, ring: 0.025, pinky: 0.045 }[finger];
    const z = { metacarpal: 0.04, 'phalanx-proximal': 0, 'phalanx-intermediate': -0.03, 'phalanx-distal': -0.055, tip: -0.075 }[part];
    return [x, 0, z];
  }

  function makeSource(side) {
    const d = dev[side];
    const src = {
      handedness: side, targetRayMode: 'tracked-pointer',
      targetRaySpace: { side, what: 'ray' },
      profiles: d.kind === 'hand' ? ['generic-hand'] : ['meta-quest-touch-plus', 'generic-trigger-squeeze-thumbstick'],
    };
    if (d.kind === 'hand') {
      src.hand = new Map(JOINTS.map(jointName => [jointName, { jointName, side }]));
    } else {
      src.gripSpace = { side, what: 'grip' };
      src.gamepad = {
        mapping: 'xr-standard', connected: true,
        get axes() { return d.axes; },
        get buttons() { return d.buttons.map(v => ({ pressed: v > 0.5, touched: v > 0, value: v })); },
        hapticActuators: [{ pulse(strength, ms) { dev.haptics.push({ side, strength, ms }); return Promise.resolve(true); } }],
      };
    }
    return src;
  }

  class Frame {
    constructor(s) { this.session = s; }
    getViewerPose() {
      const { p, q } = dev.head, c = document.querySelector('canvas'), W = c ? c.width : 2, H = c ? c.height : 1;
      const proj = perspective(Math.PI / 2, (W / 2) / H, 0.05, 2000);
      const eye = (name, dx) => {
        const o = rotate(q, [dx, 0, 0]), ep = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
        return { eye: name, projectionMatrix: proj, transform: pose(ep, q).transform };
      };
      return { ...pose(p, q), views: [eye('left', -0.032), eye('right', 0.032)] };
    }
    getPose(space) {
      const d = dev[space.side];
      return d ? pose(d.p, d.q) : null;
    }
    getJointPose(joint) {
      const d = dev[joint.side], o = rotate(d.q, jointOffset(joint.jointName, d.pinch));
      return { ...pose([d.p[0] + o[0], d.p[1] + o[1], d.p[2] + o[2]], d.q), radius: 0.008 };
    }
    fillPoses() { return false; }
    fillJointRadii() { return false; }
  }

  class Session extends EventTarget {
    constructor() {
      super();
      this.renderState = { baseLayer: null, depthNear: 0.1, depthFar: 1000 };
      this.inputSources = [];
      this.visibilityState = 'visible';
      this.environmentBlendMode = 'opaque';
      this.enabledFeatures = ['local-floor', 'hand-tracking'];
      this.ended = false;
      this.callbacks = new Map(); this.nextId = 1;
      this.sources = {};
      // A real headset runs the page's frames itself; here a timer does, so the game keeps its own pace
      // even when the browser is too slow to draw.
      this.timer = setInterval(() => this.tick(), 16);
    }
    updateRenderState(state) { Object.assign(this.renderState, state); }
    async requestReferenceSpace() { return { what: 'reference' }; }
    requestAnimationFrame(cb) { const id = this.nextId++; this.callbacks.set(id, cb); return id; }
    cancelAnimationFrame(id) { this.callbacks.delete(id); }
    async end() { this.ended = true; clearInterval(this.timer); session = null; this.dispatchEvent(new Event('end')); }
    // Bring the list of input sources in line with the device (controllers swapped for hands, say).
    sync() {
      const added = [], removed = [];
      for (const side of ['left', 'right']) {
        const have = this.sources[side], kind = dev[side].kind;
        if (have && have.kind === kind) continue;
        if (have) removed.push(have.src);
        if (kind) { const src = makeSource(side); this.sources[side] = { kind, src }; added.push(src); } else delete this.sources[side];
      }
      if (!added.length && !removed.length) return;
      this.inputSources = ['left', 'right'].filter(s => this.sources[s]).map(s => this.sources[s].src);
      const e = new Event('inputsourceschange'); e.added = added; e.removed = removed; e.session = this;
      this.dispatchEvent(e);
    }
    fire(type, side) {
      const s = this.sources[side];
      if (!s) return;
      const e = new Event(type); e.inputSource = s.src; e.frame = frame || new Frame(this);
      this.dispatchEvent(e);
    }
    tick() {
      if (this.ended || this.busy) return;
      this.busy = true;
      try {
        frame = new Frame(this);
        this.sync();
        const cbs = [...this.callbacks.values()]; this.callbacks.clear();
        for (const cb of cbs) cb(performance.now(), frame);
        dev.frame++;
      } finally { this.busy = false; }
    }
  }

  // The layer three.js draws into: the page's own canvas (framebuffer null), split in two.
  window.XRWebGLLayer = class {
    constructor(s, gl) { this.gl = gl; this.framebuffer = null; this.ignoreDepthValues = true; this.antialias = false; }
    get framebufferWidth() { return this.gl.drawingBufferWidth; }
    get framebufferHeight() { return this.gl.drawingBufferHeight; }
    getViewport(view) { const w = this.framebufferWidth / 2; return { x: view.eye === 'right' ? w : 0, y: 0, width: w, height: this.framebufferHeight }; }
  };
  try { delete window.XRWebGLBinding; } catch {}
  if (typeof XRWebGLBinding !== 'undefined') Object.defineProperty(window, 'XRWebGLBinding', { value: undefined, configurable: true });
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) C.prototype.makeXRCompatible = () => Promise.resolve();

  const xr = new EventTarget();
  xr.isSessionSupported = async mode => mode === 'immersive-vr';
  xr.requestSession = async () => { session = new Session(); return session; };
  Object.defineProperty(navigator, 'xr', { value: xr, configurable: true });

  // ---- what the test drives ----
  const press = (side, button, type, down) => {
    const d = dev[side];
    if ((d.buttons[button] > 0.5) === down) return;
    d.buttons[button] = down ? 1 : 0;
    if (!session) return;
    session.fire(down ? `${type}start` : `${type}end`, side);
    if (!down) session.fire(type, side);
  };
  window.fakeXR = {
    dev,
    get session() { return session; },
    // Head position and where it looks: yaw to the left is positive, pitch up is positive (radians).
    head(x, y, z, yaw = 0, pitch = 0) {
      dev.head.p = [x, y, z];
      const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
      dev.head.q = [cy * sp, sy * cp, -sy * sp, cy * cp]; // yaw about y, then pitch about the turned x
    },
    // A hand or controller: its position, and optionally its orientation.
    hand(side, p, q) { dev[side].p = [...p]; if (q) dev[side].q = [...q]; },
    // 'controller', 'hand', or null for nothing tracked on that side.
    kind(side, kind) { if (dev[side].pinch || dev[side].buttons.some(v => v > 0.5)) throw new Error('let go before changing what the hand is'); dev[side].kind = kind; },
    squeeze(side, down) { press(side, 1, 'squeeze', down); },
    trigger(side, down) { press(side, 0, 'select', down); },
    stick(side, x, y) { dev[side].axes = [0, 0, x, y]; },
    button(side, index, down) { dev[side].buttons[index] = down ? 1 : 0; },
    // Tracked hands: thumb and index finger together. The browser reports this as a "select".
    pinch(side, on) {
      const d = dev[side];
      if (d.pinch === on) return;
      d.pinch = on;
      if (!session) return;
      session.fire(on ? 'selectstart' : 'selectend', side);
      if (!on) session.fire('select', side);
    },
    // Wait for n frames of the game to run.
    frames(n = 1) { const until = dev.frame + n; return new Promise(res => { const t = setInterval(() => { if (dev.frame >= until) { clearInterval(t); res(); } }, 4); }); },
  };
})();
