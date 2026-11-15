// Names on things (docs/SPEC-guidance.md, phase 2): the enamel tags on the tools and decoys, and the engraved
// plates on the fixtures. One canvas texture and one material for all of them (the Quest pays per texture
// and per material), drawn again once the period type has arrived.
//
//   tag(id)      an enamel tag on a wire loop, 20 x 5 cm with 2 cm capitals (read from 1.5 m in the headset):
//                the name on the front, what it is for on the back
//   plate(id, w) an engraved plate, `w` metres wide: capitals in `dial` on painted `console` steel
// Both return one mesh (a single draw call), front face +z, the text reading along +x.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, FONT, fontsReady } from '/shared/palette.js';

// front / back. The decoys are spares: nothing fixes anything with them.
export const TAGS = {
  brush: ['BRUSH', 'SOLAR PANELS'], welder: ['WELDER', 'HULL CRACKS'], patch: ['PATCH KIT', 'SUIT LEAKS'],
  tire: ['SPACE TIRE', 'ROVER WHEELS'], gen: ['GENERATOR', 'PULL CORD'],
  wrench: ['WRENCH', null], ratchet: ['RATCHET', null], hammer: ['HAMMER', null], 'grease-gun': ['GREASE GUN', null],
};
export const PLATES = { port: 'SAMPLE PORT', solar: 'SOLAR ARRAY', tray: 'SAMPLE TRAY', rail: 'RIDER: HOLD RAIL' };

// The atlas: tag faces in slots of 320 x 80 (three to a row), plates in slots of 512 x 88 (two to a row),
// and two flat swatches for the tags' edges (enamel) and the wire and the plates' edges (steel).
const AW = 1024, TW = 320, TH = 80, PW = 512, PH = 88, PER = 3;
const TAG_IDS = Object.keys(TAGS), PLATE_IDS = Object.keys(PLATES);
const TAG_ROWS = Math.ceil(TAG_IDS.length * 2 / PER), PLATE_Y = TAG_ROWS * TH, SWATCH_Y = PLATE_Y + Math.ceil(PLATE_IDS.length / 2) * PH;
const AH = SWATCH_Y + 16;
const tagSlot = (id, back) => { const n = TAG_IDS.indexOf(id) * 2 + (back ? 1 : 0); return [(n % PER) * TW, Math.floor(n / PER) * TH, TW, TH]; };
const plateSlot = id => { const n = PLATE_IDS.indexOf(id); return [(n % 2) * PW, PLATE_Y + Math.floor(n / 2) * PH, PW, PH]; };
const ENAMEL = [8, SWATCH_Y + 8], STEEL = [40, SWATCH_Y + 8];

// Write `text` centred in a box, as large as fits (up to `size` px).
function fit(g, text, font, size, x, y, w) {
  g.font = `${size}px ${font}`;
  while (g.measureText(text).width > w && size > 10) g.font = `${--size}px ${font}`;
  g.fillText(text, x, y);
}

function paint(g) {
  g.clearRect(0, 0, AW, AH);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const id of TAG_IDS) {
    const [front, back] = TAGS[id];
    for (const side of [0, 1]) {
      const [x, y, w, h] = tagSlot(id, side);
      g.fillStyle = PAL.enamel; g.fillRect(x, y, w, h);
      g.strokeStyle = PAL.inkDial; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, w - 10, h - 10);   // the enamelled rim
      g.fillStyle = PAL.bezel; g.beginPath(); g.arc(x + 17, y + h / 2, 6, 0, 7); g.fill();          // the eyelet, where the loop goes
      g.fillStyle = PAL.inkDial;
      const mid = x + w / 2 + 12, room = w - 48;
      if (!side) fit(g, front, FONT.label, 44, mid, y + h / 2 + 2, room);
      else if (back) {
        g.globalAlpha = 0.7; g.font = `13px ${FONT.label}`; g.fillText('FOR', mid, y + 20); g.globalAlpha = 1;
        fit(g, back, FONT.label, 34, mid, y + 50, room);
      } else fit(g, 'SPARE', FONT.label, 40, mid, y + h / 2 + 2, room);
    }
  }
  for (const id of PLATE_IDS) {
    const [x, y, w, h] = plateSlot(id);
    g.fillStyle = PAL.console; g.fillRect(x, y, w, h);
    g.strokeStyle = PAL.bezel; g.lineWidth = 6; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = PAL.bezel; for (const sx of [x + 18, x + w - 18]) { g.beginPath(); g.arc(sx, y + h / 2, 5, 0, 7); g.fill(); } // two screws
    g.fillStyle = PAL.dial; fit(g, PLATES[id], FONT.label, 40, x + w / 2, y + h / 2 + 2, w - 70);
  }
  g.fillStyle = PAL.enamel; g.fillRect(ENAMEL[0] - 8, ENAMEL[1] - 8, 16, 16);
  g.fillStyle = PAL.aluminium; g.fillRect(STEEL[0] - 8, STEEL[1] - 8, 16, 16);
}

let shared = null;
function atlas(THREE) {
  if (shared) return shared;
  const canvas = document.createElement('canvas'); canvas.width = AW; canvas.height = AH;
  const g = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; // tags are mostly seen lying down, at a slant
  paint(g);
  fontsReady.then(() => { paint(g); map.needsUpdate = true; }); // canvas text waits for the font (DESIGN.md)
  // Enamel and painted steel: fairly smooth, barely metallic.
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.15 });
  material.name = 'Labels';
  shared = { material, cache: new Map() };
  return shared;
}

// Point a box's faces at the atlas: +z at `front`, -z at `back`, the four edges at a flat swatch.
function mapBox(geo, front, back, edge) {
  const uv = geo.attributes.uv;
  const put = (face, rect) => {
    for (let i = face * 4; i < face * 4 + 4; i++) {
      if (!rect) { uv.setXY(i, edge[0] / AW, 1 - edge[1] / AH); continue; }
      const [x, y, w, h] = rect;
      uv.setXY(i, (x + uv.getX(i) * w) / AW, 1 - (y + (1 - uv.getY(i)) * h) / AH);
    }
  };
  for (let f = 0; f < 4; f++) put(f, null); // BoxGeometry's faces: +x, -x, +y, -y, +z, -z
  put(4, front); put(5, back);
  uv.needsUpdate = true;
  return geo;
}
const solid = (geo, at) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, at[0] / AW, 1 - at[1] / AH); return geo; };

// An enamel tag on a wire loop, the loop at its left (-x) end. 20 x 5 cm, 2 cm capitals.
export const TAG_W = 0.2;
export function tag(THREE, id) {
  const A = atlas(THREE), key = 'tag:' + id;
  if (!A.cache.has(key)) {
    const W = 0.2, H = 0.05;
    const body = mapBox(new THREE.BoxGeometry(W, H, 0.003), tagSlot(id, 0), tagSlot(id, 1), ENAMEL);
    const loop = solid(new THREE.TorusGeometry(0.011, 0.0018, 4, 12), STEEL);
    loop.translate(-W / 2 + 0.006, 0, 0);
    A.cache.set(key, mergeGeometries([body, loop]));
  }
  const m = new THREE.Mesh(A.cache.get(key), A.material);
  m.name = 'Tag'; m.castShadow = false;
  return m;
}

// An engraved plate, w metres wide, its height set by the slot's proportions, 1 cm thick.
export function plate(THREE, id, w = 0.32) {
  const A = atlas(THREE), key = 'plate:' + id + ':' + w;
  if (!A.cache.has(key)) A.cache.set(key, mapBox(new THREE.BoxGeometry(w, w * PH / PW, 0.01), plateSlot(id), null, STEEL));
  const m = new THREE.Mesh(A.cache.get(key), A.material);
  m.name = 'Plate_' + id; m.castShadow = false;
  return m;
}
