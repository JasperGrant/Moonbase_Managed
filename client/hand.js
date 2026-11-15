// The hand: what the astronaut can do, right where they can do it (docs/SPEC-guidance.md, "The hand").
// A glove pictogram on a round cream badge in a bezel ring, and one engraved verb under it:
//   open   an open hand: you can take or hold this          (TAKE, RIDE, PULL)
//   point  a pointing finger: you can use this              (BRUSH, WELD, FIT, BANK, STOW, PATCH)
//   fist   a fist: you have it (shown for a moment after a grab works)
// `dim` draws it faded, for "not yet": CLOSER, WAIT.
// The same drawing is a sprite in the headset (one per hand) and the centre cue on a laptop.
import { PAL, FONT, fontsReady } from '/shared/palette.js';

export const CUE_W = 256, CUE_H = 320;

// The glove, drawn for the point (0, 0), about 150 px tall, in `ink`.
function glove(g, shape, ink) {
  g.save();
  g.fillStyle = ink; g.strokeStyle = ink; g.lineJoin = 'round'; g.lineCap = 'round';
  const finger = (x, y, w, h) => { g.beginPath(); g.roundRect(x - w / 2, y, w, h, w / 2); g.fill(); };
  // The cuff and the palm: the back of a suit glove, square-ish and padded.
  g.beginPath(); g.roundRect(-34, 30, 68, 44, 8); g.fill();          // the gauntlet cuff
  g.fillStyle = PAL.dial; g.fillRect(-30, 38, 60, 5); g.fillStyle = ink; // the wrist ring, picked out
  g.beginPath(); g.roundRect(-40, -30, 80, 64, 18); g.fill();        // the palm
  if (shape === 'open') {
    finger(-30, -84, 17, 64); finger(-10, -96, 17, 74); finger(10, -92, 17, 70); finger(30, -78, 16, 56);
    g.save(); g.translate(-40, 4); g.rotate(-0.85); finger(0, -52, 18, 56); g.restore(); // the thumb, out to the side
  } else if (shape === 'point') {
    finger(-10, -104, 18, 82);                                       // the index finger, straight up
    for (const x of [8, 24, 38]) { g.beginPath(); g.arc(x - 6, -30, 11, Math.PI, 0); g.fill(); } // the others, curled
    g.save(); g.translate(-38, 0); g.rotate(-0.5); finger(0, -40, 17, 44); g.restore();
  } else { // fist
    g.beginPath(); g.roundRect(-42, -58, 84, 40, 14); g.fill();      // the curled fingers
    g.strokeStyle = PAL.dial; g.lineWidth = 3;
    for (const x of [-21, 0, 21]) { g.beginPath(); g.moveTo(x, -54); g.lineTo(x, -24); g.stroke(); } // knuckle lines
    g.fillStyle = ink; g.save(); g.translate(-40, -14); g.rotate(0.9); finger(0, -12, 17, 36); g.restore(); // thumb across
  }
  g.restore();
}

// Draw a cue on a CUE_W x CUE_H canvas. cue = { shape, verb, dim } or null (clears it).
export function drawCue(g, cue) {
  g.clearRect(0, 0, CUE_W, CUE_H);
  if (!cue) return;
  const cx = CUE_W / 2, cy = 120, r = 108, a = cue.dim ? 0.55 : 1;
  g.save(); g.globalAlpha = a;
  g.fillStyle = PAL.bakelite; g.beginPath(); g.arc(cx, cy, r + 10, 0, 7); g.fill();   // shadow rim
  g.fillStyle = PAL.bezel; g.beginPath(); g.arc(cx, cy, r + 6, 0, 7); g.fill();       // the bezel ring
  g.fillStyle = cue.dim ? PAL.enamel : PAL.dial; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); // the cream face
  g.save(); g.translate(cx, cy + 12); g.scale(0.85, 0.85); glove(g, cue.shape, cue.dim ? PAL.inkDim : PAL.inkDial); g.restore();
  if (cue.verb) { // the verb, engraved on a plate under the badge
    let size = 34; g.font = `${size}px ${FONT.label}`;
    while (g.measureText(cue.verb).width > CUE_W - 30 && size > 18) g.font = `${--size}px ${FONT.label}`;
    const w = Math.min(CUE_W - 8, g.measureText(cue.verb).width + 34);
    g.fillStyle = PAL.bezel; g.fillRect(cx - w / 2 - 3, 255, w + 6, 58);
    g.fillStyle = PAL.dial; g.fillRect(cx - w / 2, 258, w, 52);
    g.fillStyle = PAL.inkDial; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(cue.verb, cx, 286);
  }
  g.restore();
}

const keyOf = cue => cue ? `${cue.shape}|${cue.verb || ''}|${cue.dim ? 1 : 0}` : '';

// A sprite for the headset: about 7 cm across, drawn over everything, redrawn only when its cue changes.
export function makeCueSprite(THREE) {
  const canvas = document.createElement('canvas'); canvas.width = CUE_W; canvas.height = CUE_H;
  const g = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false, transparent: true }));
  sprite.name = 'Cue_Hand'; sprite.renderOrder = 9; sprite.visible = false;
  sprite.scale.set(0.07, 0.07 * CUE_H / CUE_W, 1);
  let key = null, cue = null;
  const draw = () => { drawCue(g, cue); tex.needsUpdate = true; };
  fontsReady.then(() => { if (cue) draw(); }); // the verb is engraved in Michroma: redraw once it has arrived
  return {
    sprite,
    get cue() { return cue; },
    set(next) {
      sprite.visible = !!next;
      const k = keyOf(next);
      if (k === key) return;
      key = k; cue = next; if (next) draw();
    },
  };
}

// The laptop's centre cue: a canvas over the middle of the view, in place of the aiming dot.
export function makeCueOverlay(el) {
  el.width = CUE_W; el.height = CUE_H;
  const g = el.getContext('2d');
  let key = null, cue = null;
  fontsReady.then(() => { if (cue) drawCue(g, cue); });
  return {
    get cue() { return cue; },
    set(next) {
      const k = keyOf(next);
      if (k === key) return;
      key = k; cue = next; drawCue(g, next); el.hidden = !next;
    },
  };
}
