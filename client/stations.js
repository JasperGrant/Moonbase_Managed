// The four minigame panels the astronaut works at. Each one only draws what the server
// says is physically there, and reports clicks back with act(issueId, action).
// To add a minigame: add a builder here, its data in server/game.js, its rule in shared/rules.js.
import { CFG, ISSUES } from '/shared/config.js';

const WIRE_HEX = { red: 0xd63b3b, blue: 0x3b6fd6, yellow: 0xe8c93a, white: 0xf2f2f2 };
const ROCK_HEX = { grey: 0x8d8d8d, red: 0xb5462f, yellow: 0xd9b84a, black: 0x1c1c1c, green: 0x3f9b52 };

export function buildPanels(THREE, world, act, sfx = () => {}) {
  const hits = [];       // every clickable mesh
  const panels = {};
  const flying = [];     // rocks in flight

  const boardMat = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.55, metalness: 0.4 });
  const ghost = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  // A small screen you can draw text on. It only redraws when `key` changes.
  function makeScreen(w, h, pw, ph) {
    const canvas = document.createElement('canvas');
    canvas.width = pw; canvas.height = ph;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    let last = null;
    return { mesh, draw(key, fn) { if (key === last) return; last = key; ctx.fillStyle = '#041008'; ctx.fillRect(0, 0, pw, ph); fn(ctx, pw, ph); tex.needsUpdate = true; } };
  }
  function lines(ctx, W, rows) { // rows: [text, size, colour]
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    let y = 12;
    for (const [text, size, colour] of rows) { ctx.font = `bold ${size}px monospace`; ctx.fillStyle = colour || '#58e08a'; ctx.fillText(text, W / 2, y); y += size + 10; }
  }
  function clickable(mesh, enabled, click) { mesh.userData = { enabled, click }; hits.push(mesh); return mesh; }

  function makeButton(label, w, h, colour = '#39424c') {
    const c = document.createElement('canvas'); c.width = 128; c.height = Math.round(128 * h / w);
    const g = c.getContext('2d');
    g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#0b0d10'; g.lineWidth = 6; g.strokeRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(c.height * 0.55)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  }

  // Common backboard with a screen on top. The work area is below the screen.
  function board(key, legs = true) {
    const g = new THREE.Group();
    world.stations[key].add(g);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.08), boardMat);
    back.position.set(0, 1.3, 0); back.castShadow = true; g.add(back);
    if (legs) for (const x of [-0.6, 0.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), boardMat); leg.position.set(x, 0.35, 0); g.add(leg); }
    const screen = makeScreen(1.25, 0.42, 640, 216);
    screen.mesh.position.set(0, 1.7, 0.045); g.add(screen.mesh);
    const p = { g, screen, issue: null };
    panels[key] = p;
    return p;
  }
  const idle = (p, name) => p.screen.draw('idle', (c, W) => lines(c, W, [[name, 34, '#7d909c'], ['NOMINAL', 64, '#58e08a']]));
  const secs = is => Math.ceil(is.left);

  // ---- Wires: fuel-ox valve purge ----
  {
    const p = board('wires');
    const wires = [], pads = [];
    for (let i = 0; i < 5; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      w.position.z = 0.07; p.g.add(w); wires.push(w);
      const pad = clickable(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.56, 0.08), ghost), () => !!p.issue && i < p.issue.colors.length && !p.issue.cut.includes(i),
        () => act(p.issue.id, { cut: i }));
      pad.position.z = 0.08; p.g.add(pad); pads.push(pad);
    }
    p.sync = is => {
      p.issue = is;
      if (!is) { wires.forEach(w => (w.visible = false)); return idle(p, 'FUEL DEPOT'); }
      const n = is.colors.length;
      wires.forEach((w, i) => {
        w.visible = i < n; if (!w.visible) return;
        const x = (i - (n - 1) / 2) * 0.22, cut = is.cut.includes(i);
        w.material.color.setHex(WIRE_HEX[is.colors[i]]);
        w.scale.y = cut ? 0.3 : 1;
        w.position.set(x, cut ? 1.33 : 1.15, 0.07);
        pads[i].position.set(x, 1.15, 0.08);
      });
      p.screen.draw(`${is.id}|${secs(is)}`, (c, W) => lines(c, W, [[ISSUES.wires.title.toUpperCase(), 34, '#ffb84a'], [`S/N ${is.serial}`, 60, '#fff'], [`PULL ONE WIRE   ${secs(is)} s`, 34, '#ff5c5c']]));
    };
  }

  // ---- Frequency: comms dish calibration ----
  {
    const p = board('freq');
    [['-10', -10, -0.48], ['-1', -1, -0.16], ['+1', 1, 0.16], ['+10', 10, 0.48]].forEach(([label, d, x]) => {
      const b = clickable(makeButton(label, 0.26, 0.2), () => !!p.issue, () => act(p.issue.id, { d }));
      b.position.set(x, 1.28, 0.06); p.g.add(b);
    });
    const lock = clickable(makeButton('LOCK', 0.6, 0.22, '#8a2b2b'), () => !!p.issue, () => act(p.issue.id, { lock: true }));
    lock.position.set(0, 0.96, 0.06); p.g.add(lock);
    p.sync = (is, t) => {
      p.issue = is;
      if (!is) return idle(p, 'COMMS DISH');
      // No number on purpose: the astronaut sees a wave, the Technician sees the channel.
      p.screen.draw(`${is.id}|${is.wave}|${Math.floor(t * 8)}`, (c, W, H) => {
        lines(c, W, [[`${ISSUES.freq.title.toUpperCase()}   ${secs(is)} s`, 30, '#ffb84a']]);
        c.strokeStyle = '#58e08a'; c.lineWidth = 4; c.beginPath();
        for (let x = 0; x <= W; x += 4) { const y = H * 0.62 + Math.sin(x / W * (2 + is.wave / 5) * Math.PI * 2 + t * 6) * H * 0.26; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke();
      });
    };
  }

  // ---- Patch: airlock software fault ----
  {
    const p = board('patch');
    '123456789'.split('').concat('0').forEach((digit, i) => {
      const col = digit === '0' ? 1 : i % 3, row = digit === '0' ? 3 : Math.floor(i / 3);
      const b = clickable(makeButton(digit, 0.17, 0.17), () => !!p.issue && p.issue.stage === 1, () => act(p.issue.id, { key: digit }));
      b.position.set((col - 1) * 0.2, 1.36 - row * 0.2, 0.06); p.g.add(b);
    });
    p.sync = is => {
      p.issue = is;
      if (!is) return idle(p, 'AIRLOCK TERMINAL');
      const entry = (is.entered + '___').slice(0, 3).split('').join(' ');
      p.screen.draw(`${is.id}|${is.stage}|${is.entered}|${secs(is)}`, (c, W) => lines(c, W, [
        [`FAULT CODE   ${secs(is)} s`, 30, '#ffb84a'], [is.err.split('').join(' '), 72, '#fff'],
        [is.stage === 0 ? 'READ CODE TO MISSION OPS' : `ENTER KEY:  ${entry}`, 34, is.stage === 0 ? '#ff5c5c' : '#58e08a']]));
    };
  }

  // ---- Drill: clear the hopper ----
  {
    const p = board('drill');
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.5), boardMat);
    tray.position.set(0, 1.0, 0.28); p.g.add(tray);
    const rocks = [];
    for (let i = 0; i < 5; i++) {
      const r = clickable(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true })),
        () => !!p.issue && !p.issue.rocks[i].gone && !r.userData.fly, () => act(p.issue.id, { rock: i }));
      r.userData.home = new THREE.Vector3((i - 2) * 0.24, 1.13, 0.28);
      p.g.add(r); rocks.push(r);
    }
    let shownId = null;
    p.sync = is => {
      p.issue = is;
      if (!is) { rocks.forEach(r => { if (!r.userData.fly) r.visible = false; }); shownId = null; return idle(p, 'DRILL RIG'); }
      rocks.forEach((r, i) => {
        const rock = is.rocks[i];
        if (shownId !== is.id) { r.userData.fly = null; r.position.copy(r.userData.home); r.rotation.set(i, i * 2, 0); r.material.color.setHex(ROCK_HEX[rock.color]); r.visible = !rock.gone; }
        else if (rock.gone && r.visible && !r.userData.fly) { // just pulled: toss it, slowly, in 1/6 g
          r.userData.fly = { v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.2, 1 + Math.random()), age: 0 };
          flying.push(r);
        }
      });
      shownId = is.id;
      const left = is.rocks.filter(r => !r.gone).length - 1;
      p.screen.draw(`${is.id}|${left}|${secs(is)}`, (c, W) => lines(c, W, [[`${ISSUES.drill.title.toUpperCase()}   ${secs(is)} s`, 30, '#ffb84a'], ['CLEAR THE HOPPER', 52, '#fff'], [`${left} TO REMOVE. KEEP THE CORE SAMPLE`, 28, '#ff5c5c']]));
    };
  }

  // ---- Power: breaker panel, on the wall inside the habitat (only where the interior is built) ----
  if (world.stations.power) {
    const p = board('power', false);
    const N = CFG.power.breakers, COLS = 3;
    const at = i => [((i % COLS) - (COLS - 1) / 2) * 0.4, 1.3 - Math.floor(i / COLS) * 0.34]; // x, y of breaker i
    // One plate behind all the breakers carries the numbers and the ON / OFF marks.
    const c = document.createElement('canvas'); c.width = 600; c.height = 360;
    const g = c.getContext('2d');
    g.fillStyle = '#c9ccce'; g.fillRect(0, 0, 600, 360); g.strokeStyle = '#30353a'; g.lineWidth = 6; g.strokeRect(3, 3, 594, 354);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      const cx = 100 + (i % COLS) * 200, cy = 96 + Math.floor(i / COLS) * 170;
      g.fillStyle = '#30353a'; g.fillRect(cx - 44, cy - 62, 88, 124);
      g.fillStyle = '#1b1e22'; g.font = 'bold 64px monospace'; g.fillText(String(i + 1), cx - 76, cy);
      g.font = 'bold 18px monospace'; g.fillStyle = '#2f8f4e'; g.fillText('ON', cx + 68, cy - 40); g.fillStyle = '#b3342a'; g.fillText('OFF', cx + 68, cy + 40);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.72), new THREE.MeshBasicMaterial({ map: tex }));
    plate.position.set(0, 1.13, 0.045); p.g.add(plate);
    // Handles and lamps are two instanced meshes; a breaker's state is its handle position and lamp colour.
    const handles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.11, 0.09), new THREE.MeshBasicMaterial({ color: 0xe9e7e1, toneMapped: false }), N);
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    handles.frustumCulled = lamps.frustumCulled = false;
    p.g.add(handles, lamps);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const [x, y] = at(i);
      lamps.setMatrixAt(i, m4.makeTranslation(x, y + 0.155, 0.06));
      const pad = clickable(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.12), ghost), () => !!p.issue && !p.issue.reset.includes(i), () => act(p.issue.id, { breaker: i }));
      pad.position.set(x, y, 0.1); pad.visible = false; p.g.add(pad); // unseen, but the pointer still hits it
    }
    let shown = null;
    p.sync = is => {
      p.issue = is;
      const key = is ? `${is.id}|${is.reset}` : 'idle';
      if (key !== shown) {
        shown = key;
        for (let i = 0; i < N; i++) {
          const off = !!is && is.tripped.includes(i) && !is.reset.includes(i), [x, y] = at(i);
          handles.setMatrixAt(i, m4.compose(v.set(x, y + (off ? -0.045 : 0.045), 0.085), q.setFromEuler(e.set(off ? 0.5 : -0.5, 0, 0)), one));
          lamps.setColorAt(i, col.setHex(off ? 0xff3b30 : 0x39d86a));
        }
        handles.instanceMatrix.needsUpdate = true; lamps.instanceColor.needsUpdate = true;
      }
      if (!is) return idle(p, 'BREAKER PANEL');
      p.screen.draw(`${is.id}|${secs(is)}`, (c, W) => lines(c, W, [[`${ISSUES.power.title.toUpperCase()}   ${secs(is)} s`, 30, '#ffb84a'], ['ON BACKUP POWER', 56, '#fff'], ['RESET THE BREAKERS. ONE HAS A SHORT', 26, '#ff5c5c']]));
    };
  }

  return {
    // Meshes that can be clicked right now.
    targets: () => hits.filter(m => m.userData.enabled()),
    click(mesh) { sfx('click'); mesh.userData.click(); },
    // Push the server's view of each station onto its panel.
    sync(issues, time) {
      for (const key in panels) panels[key].sync(issues.find(i => i.type === key) || null, time);
    },
    update(dt) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const r = flying[i], f = r.userData.fly;
        if (!f) { flying.splice(i, 1); continue; }
        f.age += dt; f.v.y -= 1.62 * dt;
        r.position.addScaledVector(f.v, dt);
        r.rotation.x += dt * 2; r.rotation.z += dt * 1.3;
        if (f.age > 4) { r.visible = false; r.userData.fly = null; flying.splice(i, 1); }
      }
    },
  };
}
