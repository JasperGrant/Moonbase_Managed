// Mission Control's waypoint, as the astronaut sees it: a beacon standing where they are meant to go.
// Mission Ops sets it on a tool (from the tool log), whoever has the chart on a spot in the field
// (server/game.js setWaypoint). Nothing on the visor: it is a thing in the world, like a surveyor's flare.
//
//   - a column of soft amber light rising from the spot, fading out upward (tall outside, so it reads
//     across the field; floor to ceiling in the hall),
//   - a ring on the ground round it that breathes slowly (under 1 Hz),
//   - a chevron bobbing over it, pointing down.
// The waypoint is in one place, the astronaut maybe in the other: then the beacon stands at airlock S,
// on whichever side of it they are, so they know to go through.
import { CFG, PLACES } from '/shared/config.js';
import { PAL } from '/shared/palette.js';
import { CHAMBER } from '/airlock.js';

export function buildWaypoint(THREE, { scene, interior, world, toolAt = () => null }) {
  // The column's fade: bright at the foot, gone at the top. One small canvas, shared.
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  const fade = new THREE.CanvasTexture(c);
  const glow = (o = {}) => new THREE.MeshBasicMaterial({ color: PAL.hex.amber, transparent: true, depthWrite: false, toneMapped: false, ...o });

  function beacon(name, { height, radius, ring }) {
    const root = new THREE.Group(); root.name = name; root.visible = false;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14, 1, true).translate(0, height / 2, 0), glow({ alphaMap: fade, opacity: 0.4, side: THREE.DoubleSide }));
    column.name = 'Column'; column.renderOrder = 2; root.add(column);
    const disc = new THREE.Mesh(new THREE.RingGeometry(ring * 0.86, ring, 40).rotateX(-Math.PI / 2), glow({ opacity: 0.75 }));
    disc.name = 'Ring'; disc.position.y = 0.02; disc.renderOrder = 2; root.add(disc);
    const inner = new THREE.Mesh(new THREE.RingGeometry(ring * 0.3, ring * 0.36, 28).rotateX(-Math.PI / 2), glow({ opacity: 0.6 }));
    inner.position.y = 0.02; inner.renderOrder = 2; root.add(inner);
    // The chevron: a squat four-sided cone, point down, in lamp amber with a darker collar.
    const s = ring * 0.5;
    const chevron = new THREE.Group(); chevron.name = 'Chevron'; root.add(chevron);
    const point = new THREE.Mesh(new THREE.ConeGeometry(s * 0.5, s * 0.8, 4).rotateX(Math.PI), glow({ opacity: 0.95 }));
    chevron.add(point);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.52, s * 0.52, s * 0.08, 4), new THREE.MeshBasicMaterial({ color: PAL.hex.amberOff, toneMapped: false }));
    collar.position.y = s * 0.42; chevron.add(collar);
    return { root, disc, inner, chevron, column, lift: s * 1.6 };
  }
  // Outside: tall enough to see from the far side of the field, the ring the size of "you are there".
  const out = beacon('Waypoint_Surface', { height: 30, radius: 0.18, ring: CFG.waypoint.reach });
  scene.add(out.root);
  // In the hall: floor (or shelf) to ceiling, a small ring round the tool.
  const hall = beacon('Waypoint_Hall', { height: 2.6, radius: 0.05, ring: 0.36 });
  interior.group.add(hall.root);

  // Where the beacon goes through airlock S: just inside its inner hatch, or just outside its outer one.
  const S = PLACES.doors.S;
  const hallDoor = { x: S.hall.x, y: 0, z: S.hall.z - 0.9 };
  const outDoor = () => { const d = CHAMBER.outset + CHAMBER.depth + 1.2, x = S.x + Math.sin(S.ry) * d, z = S.z + Math.cos(S.ry) * d; return { x, y: world.height(x, z), z }; };

  const v = new THREE.Vector3();
  let lastN = null;
  return {
    // wp: the server's waypoint ({ x, y, z, inside, tool, n }) or null. where: 'in' or 'out'.
    // Returns true the frame a new waypoint arrives (for a chime).
    update(wp, where, now) {
      const fresh = !!wp && wp.n !== lastN;
      lastN = wp ? wp.n : null;
      out.root.visible = hall.root.visible = false;
      if (!wp) return false;
      const inHall = where === 'in';
      let b, p;
      if (wp.inside === inHall) {
        b = inHall ? hall : out;
        // A tool: where this page's physics has it (it may still be settling), else the server's word.
        const t = wp.tool && toolAt(wp.tool);
        if (t) p = inHall ? { x: t.x - interior.group.position.x, y: t.y - 0.06, z: t.z - interior.group.position.z } : { x: t.x, y: world.height(t.x, t.z), z: t.z };
        else p = inHall ? { x: wp.x, y: wp.y || 0, z: wp.z } : { x: wp.x, y: world.height(wp.x, wp.z), z: wp.z };
      } else {
        b = inHall ? hall : out;
        p = inHall ? hallDoor : outDoor();
      }
      b.root.visible = true;
      b.root.position.set(p.x, p.y, p.z);
      const breathe = 0.5 + 0.5 * Math.sin(now * Math.PI * 1.4); // 0.7 Hz
      b.disc.scale.setScalar(0.92 + 0.08 * breathe);
      b.disc.material.opacity = 0.55 + 0.3 * breathe;
      b.inner.material.opacity = 0.35 + 0.3 * (1 - breathe);
      b.chevron.position.y = b.lift + Math.sin(now * 2.2) * b.lift * 0.12;
      b.chevron.rotation.y = now * 0.8;
      return fresh;
    },
    position: () => (out.root.visible ? out.root : hall.root.visible ? hall.root : null)?.getWorldPosition(v) || null,
    objects: { out, hall },
  };
}
