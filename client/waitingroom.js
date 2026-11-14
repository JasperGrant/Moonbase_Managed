// The waiting room: where the Astronaut stands, on the real site, until the mission starts. A card
// for each seat in the game (two in a 2-player game, four in a 4-player game) stands in an arc in
// front of the spawn point, so turning the head brings each into view. Each card shows the role's
// picture and name, whether the seat is held and whether it is ready; the Astronaut's own card says
// YOU, and pointing at it and pulling the trigger (or pinching, or clicking on a laptop) readies up.
//
//   const room = buildWaitingRoom(THREE, scene, { at: {x, z}, facing: radians });
//   room.update(state)   every frame; draws only what changed
//   room.own             the Astronaut's own card (the only one that can be used)
import { PLAYERS, covers } from '/shared/config.js';

const NAMES = { astronaut: 'ASTRONAUT', ops: 'MISSION OPS', sci: 'SCIENTIST', tech: 'TECHNICIAN', all: 'MISSION OPERATOR' };
const LINES = { astronaut: 'Hands and eyes on the surface', ops: 'The only voice you hear', sci: 'The gauges. Knows what is wrong',
  tech: 'The radar and the rover. Knows where', all: 'Every screen on Earth, and the radio' };
const ART = { astronaut: 'astronaut', ops: 'ops', sci: 'sci', tech: 'tech', all: 'ops' };

const CARD_W = 0.62, CARD_H = 0.98;       // metres
const RADIUS = 1.6;                        // from the spawn point: in front of the tool locker, which stands 2.4 m ahead
const SPACING = (CARD_W + 0.14) / RADIUS;  // radians between cards around the arc: a hand's width of gap
const CENTRE_Y = 1.42;                     // card centre height: the top just above eye level
const PX = 512, PY = Math.round(PX * CARD_H / CARD_W);

export function buildWaitingRoom(THREE, scene, { at, facing = 0 }) {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  group.rotation.y = facing;
  scene.add(group);

  const art = {};   // the lobby's paintings, loaded once and drawn onto the cards
  const cards = {}; // by role
  let roles = [], key = '';

  function card(role) {
    if (cards[role]) return cards[role];
    const canvas = document.createElement('canvas');
    canvas.width = PX; canvas.height = PY;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
    mesh.userData = { role, canvas, tex, key: '' };
    group.add(mesh);
    const name = ART[role];
    if (!art[name]) {
      // The paintings are SVG with a viewBox and no size of their own, so each is drawn once onto a
      // canvas of its real proportions (900 x 1800, at half size) and the cards crop from that.
      const img = new Image(), flat = document.createElement('canvas');
      flat.width = 450; flat.height = 900;
      img.onload = () => { flat.getContext('2d').drawImage(img, 0, 0, 450, 900); art[name].ready = true; key = ''; }; // redraw the cards with it
      img.src = `/lobby/${name}.svg`;
      art[name] = { img: flat, ready: false };
    }
    return (cards[role] = mesh);
  }

  // Lay out the cards of this game in an arc, centred straight ahead, in seat order, each facing the spawn point.
  function layout(list) {
    roles = list;
    for (const r in cards) cards[r].visible = list.includes(r);
    list.forEach((r, i) => {
      const m = card(r), a = (i - (list.length - 1) / 2) * SPACING; // negative = to the left
      m.position.set(Math.sin(a) * RADIUS, CENTRE_Y, -Math.cos(a) * RADIUS);
      m.rotation.set(0, -a, 0);
      m.visible = true;
    });
  }

  function draw(m, s) {
    const role = m.userData.role, g = m.userData.canvas.getContext('2d');
    const held = s.crew.some(h => covers(h, role) || h === role), ready = held && s.ready.some(h => covers(h, role) || h === role);
    const mine = role === 'astronaut', n = s.countdown == null ? null : Math.max(1, Math.ceil(s.countdown));
    const pic = art[ART[role]];
    const k = [held, ready, n, pic?.ready].join();
    if (k === m.userData.key) return;
    m.userData.key = k;

    // Card body: rounded, dark glass, edged in green when ready, amber when held and not, grey when empty.
    const edge = ready ? '#58e08a' : held ? '#ffb84a' : '#4a5a66';
    g.clearRect(0, 0, PX, PY);
    g.fillStyle = 'rgba(8,12,16,0.9)';
    rounded(g, 6, 6, PX - 12, PY - 12, 28); g.fill();
    g.lineWidth = 10; g.strokeStyle = edge; rounded(g, 6, 6, PX - 12, PY - 12, 28); g.stroke();

    // The painting: the middle of the lobby scene, in colour when the seat is held, grey and dim when not.
    const ax = 30, ay = 30, aw = PX - 60, ah = 380;
    g.save(); rounded(g, ax, ay, aw, ah, 18); g.clip();
    g.fillStyle = '#10161c'; g.fillRect(ax, ay, aw, ah);
    if (pic?.ready) {
      g.filter = held ? 'none' : 'grayscale(1) brightness(0.5)';
      const sh = 450 * ah / aw; // keep the painting's shape: a full-width slice of it, from a third of the way down
      g.drawImage(pic.img, 0, 240, 450, sh, ax, ay, aw, ah);
      g.filter = 'none';
    }
    g.restore();

    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (mine) { // YOU, on the painting's top edge
      g.fillStyle = '#58e08a'; rounded(g, PX / 2 - 60, ay + 14, 120, 44, 22); g.fill();
      g.fillStyle = '#06100a'; g.font = 'bold 28px system-ui, sans-serif'; g.fillText('YOU', PX / 2, ay + 37);
    }
    g.fillStyle = '#eef3f0'; g.font = `bold ${NAMES[role].length > 12 ? 40 : 46}px system-ui, sans-serif`;
    g.fillText(NAMES[role], PX / 2, 460);
    g.fillStyle = '#9fb0ba'; g.font = '24px system-ui, sans-serif';
    g.fillText(LINES[role], PX / 2, 504);
    g.fillStyle = held ? '#d6e6e0' : '#7d909c'; g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(held ? 'IN SEAT' : 'EMPTY', PX / 2, 570);

    // The lamp: READY / NOT READY, or the countdown once everyone is.
    const ly = 618, lh = 110;
    if (n != null) {
      g.fillStyle = 'rgba(88,224,138,0.18)'; rounded(g, 60, ly, PX - 120, lh, 22); g.fill();
      g.fillStyle = '#58e08a'; g.font = 'bold 92px system-ui, sans-serif'; g.fillText(String(n), PX / 2, ly + lh / 2 + 4);
    } else if (held) {
      g.fillStyle = ready ? 'rgba(88,224,138,0.2)' : 'rgba(255,184,74,0.14)'; rounded(g, 60, ly, PX - 120, lh, 22); g.fill();
      g.lineWidth = 5; g.strokeStyle = ready ? '#58e08a' : '#ffb84a'; rounded(g, 60, ly, PX - 120, lh, 22); g.stroke();
      g.fillStyle = ready ? '#58e08a' : '#ffb84a'; g.font = 'bold 50px system-ui, sans-serif';
      g.fillText(ready ? 'READY' : 'NOT READY', PX / 2, ly + lh / 2 + 2);
    } else {
      g.strokeStyle = '#3a4750'; g.lineWidth = 4; g.setLineDash([12, 10]); rounded(g, 60, ly, PX - 120, lh, 22); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#7d909c'; g.font = '30px system-ui, sans-serif'; g.fillText('waiting for a player', PX / 2, ly + lh / 2);
    }
    if (mine && n == null) {
      g.fillStyle = '#9fb0ba'; g.font = '22px system-ui, sans-serif';
      g.fillText(ready ? 'Point here and pull the trigger to stand down' : 'Point here and pull the trigger when set', PX / 2, PY - 28);
    }
    m.userData.tex.needsUpdate = true;
  }

  function update(s) {
    const on = !!s && s.phase === 'lobby';
    group.visible = on;
    if (!on) return;
    const list = s.players ? PLAYERS[s.players] : PLAYERS[4];
    const k = list.join();
    if (k !== key) { key = k; layout(list); for (const r in cards) cards[r].userData.key = ''; }
    const st = { crew: s.crew || [], ready: s.ready || [], countdown: s.countdown ?? null };
    for (const r of roles) draw(cards[r], st);
  }

  return {
    group, update,
    get own() { return card('astronaut'); },
    get cards() { return roles.map(r => cards[r]); },
    // What each card says, for the tests.
    describe: () => roles.map(r => ({ role: r, key: cards[r].userData.key, x: cards[r].getWorldPosition(new THREE.Vector3()).x })),
  };
}

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
