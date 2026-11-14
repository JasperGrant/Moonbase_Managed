// The lobby: four role scenes side by side. A scene is grey while its seat is open and comes to
// life, in colour, with its own motion and sound, when someone takes the seat. Everyone presses
// Ready, and the server starts the mission once all four roles are held and ready.
// Used by the landing page (the seat picker, once 2 or 4 players is chosen) and by every seat page
// while the game is in the lobby. A 2-player game shows two panels: the Astronaut, and the Mission
// Operator, who is drawn in the Mission Ops panel and holds every Earth-side screen (the 'all' seat).
//
//   const lobby = createLobby(el, { mine: 'tech', onReady: on => ..., onPick: role => ... });
//   lobby.update({ crew, ready, countdown, phase, players });
//
// The art is client/lobby/<role>.svg, 900 x 1800. Drop in a finished painting with the same name
// and framing and nothing else changes; the motion overlays below are drawn on top of it.
import { covers } from '/shared/config.js';
import { Ambience } from '/ambience.js';

export const ORDER = ['astronaut', 'ops', 'sci', 'tech'];
const INFO = {
  astronaut: { name: 'Astronaut', line: 'Hands and eyes on the surface', url: '/astronaut' },
  ops: { name: 'Mission Ops', line: 'The only voice the astronaut hears', url: '/ops' },
  sci: { name: 'Scientist', line: 'The gauges. Knows what is wrong', url: '/sci' },
  tech: { name: 'Technician', line: 'The radar and the rover. Knows where', url: '/tech' },
};
// In a 2-player game the Mission Ops panel stands for the one person on Earth.
const OPERATOR = { name: 'Mission Operator', line: 'Radio, gauges, wiring, radar and rover' };
const ARC = { x: 355, y: 1096 }; // where the welding torch touches VIPER, in the art's coordinates

// ---------- motion overlays, one per scene, in the art's 900 x 1800 coordinates ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');

const OVERLAY = {
  // Dust drifting off the boots, stars twinkling, and the sun sliding across the visor now and then.
  astronaut: () => `
    <defs><clipPath id="fxVisor"><ellipse cx="452" cy="572" rx="72" ry="62"/></clipPath>
      <linearGradient id="fxGlint" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    ${[[230, 310], [640, 320], [810, 350], [200, 660], [790, 640], [500, 300], [160, 900], [700, 560]].map(([x, y], i) =>
      `<circle class="fx-twinkle" cx="${x}" cy="${y}" r="3" fill="#fff" style="animation-delay:${(i * 0.73) % 4}s;animation-duration:${3 + (i % 3)}s"/>`).join('')}
    <g clip-path="url(#fxVisor)"><rect class="fx-glint" x="300" y="480" width="60" height="200" fill="url(#fxGlint)" transform="rotate(25 452 572)"/></g>
    ${many(16, i => `<circle class="fx-dust" cx="${rnd(340, 580).toFixed(0)}" cy="${rnd(1372, 1396).toFixed(0)}" r="${rnd(2, 5).toFixed(1)}" fill="#c9cbd2"
      style="--dx:${rnd(-90, 90).toFixed(0)}px;--dy:${rnd(-70, -20).toFixed(0)}px;animation-delay:${rnd(0, 6).toFixed(2)}s;animation-duration:${rnd(5, 9).toFixed(1)}s"/>`)}`,

  // Cigarette smoke curling up, the CRTs flickering, and scan lines over the whole room.
  ops: () => `
    <defs><filter id="fxBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <pattern id="fxScan" width="4" height="6" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000"/></pattern></defs>
    <path class="fx-crt" d="M584 866 L768 846 L778 1086 L598 1094Z" fill="#c9ffd9"/>
    ${[40, 150, 260, 580, 690, 800].map((x, i) => `<rect class="fx-crt" x="${x}" y="672" width="64" height="48" rx="6" fill="#9dffb8" style="animation-delay:${i * 0.37}s"/>`).join('')}
    <g filter="url(#fxBlur)">
      ${[0, 1.6, 3.2].map(d => `<path class="fx-smoke" d="M532 884 q-26 -50 6 -100 q30 -50 -4 -110 q-30 -60 10 -120" stroke="#d6d0c4" stroke-width="12" fill="none" stroke-linecap="round" style="animation-delay:${d}s"/>`).join('')}
    </g>
    <rect width="900" height="1800" fill="url(#fxScan)" opacity=".18"/>`,

  // The lamp's pool of light breathing, dust motes in its beam, and a page corner lifting.
  sci: () => `
    <defs><radialGradient id="fxPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd890" stop-opacity=".55"/><stop offset="1" stop-color="#ffb04a" stop-opacity="0"/></radialGradient>
      <clipPath id="fxCone"><path d="M322 906 L418 886 L760 1236 L170 1240Z"/></clipPath></defs>
    <ellipse class="fx-lamp" cx="470" cy="1150" rx="420" ry="190" fill="url(#fxPool)"/>
    <g clip-path="url(#fxCone)">${many(18, () => `<circle class="fx-mote" cx="${rnd(260, 640).toFixed(0)}" cy="${rnd(930, 1200).toFixed(0)}" r="${rnd(1.5, 3.5).toFixed(1)}" fill="#fff2cf"
      style="--dx:${rnd(-40, 40).toFixed(0)}px;--dy:${rnd(-60, 30).toFixed(0)}px;animation-delay:${rnd(0, 8).toFixed(2)}s;animation-duration:${rnd(7, 13).toFixed(1)}s"/>`)}</g>
    <path class="fx-page" d="M812 1246 L776 1246 L812 1218Z" fill="#fff4d8"/>`,

  // The arc: a blue-white flash that lights the rover in pulses, a glow at the torch, and sparks.
  // The lobby's animation loop drives --arc (0..1) and adds the sparks, in step with the crackle you hear.
  tech: () => `
    <defs><radialGradient id="fxArc" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".15" stop-color="#dff0ff" stop-opacity=".9"/><stop offset=".5" stop-color="#6fb6ff" stop-opacity=".25"/><stop offset="1" stop-color="#6fb6ff" stop-opacity="0"/></radialGradient></defs>
    <ellipse class="fx-haze" cx="500" cy="900" rx="420" ry="160" fill="#8aa4c0" opacity=".06"/>
    <rect width="900" height="1800" fill="#cfe6ff" style="mix-blend-mode:screen;opacity:calc(var(--arc, 0) * .22)"/>
    <circle cx="${ARC.x}" cy="${ARC.y}" r="190" fill="url(#fxArc)" style="opacity:var(--arc, 0)"/>
    <g class="fx-sparks"></g>`,
};

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SOUND_KEY = 'moonbase.sound';
function soundPref() { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } }
function saveSound(on) { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch {} }

export function createLobby(root, opts = {}) {
  const mine = opts.mine || null;
  const yours = r => !!mine && covers(mine, r);
  const amb = new Ambience();
  amb.setMine(ORDER.filter(yours));

  root.classList.add('lobby');
  root.innerHTML = `
    <div class="lb-panels">${ORDER.map(r => `
      <section class="lb-panel open ${yours(r) ? 'yours' : ''}" data-role="${r}" tabindex="${opts.onPick ? 0 : -1}" aria-label="${INFO[r].name}">
        <div class="lb-stage">
          <img src="/lobby/${r}.svg" alt="" draggable="false">
          <svg class="lb-fx" viewBox="0 0 900 1800" preserveAspectRatio="none" aria-hidden="true">${OVERLAY[r]()}</svg>
        </div>
        <div class="lb-top"><h2>${INFO[r].name}</h2><p>${INFO[r].line}</p></div>
        <div class="lb-bottom"><b class="lb-state">OPEN</b><div class="lb-actions"></div><div class="lb-extra"></div></div>
      </section>`).join('')}
    </div>
    <div class="lb-count" hidden></div>
    <footer class="lb-bar"><span class="lb-status">Connecting...</span><span class="lb-links"></span><button class="lb-sound ghost" type="button"></button></footer>`;

  const panel = r => root.querySelector(`.lb-panel[data-role="${r}"]`);
  const $ = sel => root.querySelector(sel);

  // Your own seat's controls: given by the page (the astronaut's radio and VR buttons), or a Ready button.
  const custom = new Set();
  for (const r of ORDER) {
    if (!yours(r)) continue;
    const el = opts.actionsEl?.(r);
    if (el) { panel(r).querySelector('.lb-actions').appendChild(el); custom.add(r); }
    const extra = opts.extraEl?.(r);
    if (extra) panel(r).querySelector('.lb-extra').appendChild(extra);
  }
  const ownActions = r => yours(r) && !custom.has(r);

  // ---------- sound: on by default, starts with the first click or key press ----------
  let soundOn = soundPref();
  const paintSound = () => { $('.lb-sound').textContent = soundOn ? 'Sound: on' : 'Sound: off'; };
  paintSound();
  const wake = () => { if (soundOn && root.isConnected && !root.hidden) amb.start(); };
  addEventListener('pointerdown', wake, { once: true, capture: true });
  addEventListener('keydown', wake, { once: true, capture: true });
  $('.lb-sound').addEventListener('click', e => {
    e.stopPropagation();
    soundOn = !soundOn; saveSound(soundOn); paintSound();
    if (soundOn) amb.start(); else amb.stop();
  });

  // ---------- which panels this game has ----------
  let players = opts.players || null;
  const roles = () => players === 2 ? ['astronaut', 'ops'] : ORDER;
  const info = r => players === 2 && r === 'ops' ? OPERATOR : INFO[r];

  // ---------- pointing and clicking ----------
  let st = { crew: [], ready: [], countdown: null, phase: 'lobby' };
  for (const r of ORDER) {
    const p = panel(r);
    p.addEventListener('pointerenter', () => amb.setFocus(r));
    p.addEventListener('pointerleave', () => amb.setFocus(null));
    p.addEventListener('focus', () => amb.setFocus(r));
    p.addEventListener('blur', () => amb.setFocus(null));
    const pick = () => { if (opts.onPick && !held(r) && roles().includes(r)) opts.onPick(r, players); };
    p.addEventListener('click', e => {
      if (e.target.closest('[data-ready]')) { opts.onReady?.(!isReady(r)); return; }
      if (e.target.closest('button, a, input, label')) return;
      pick();
    });
    p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  }

  const held = r => st.crew.some(h => covers(h, r));
  const isReady = r => st.ready.some(h => covers(h, r));

  // ---------- the technician's arc and sparks ----------
  const tech = panel('tech'), sparksG = tech.querySelector('.fx-sparks');
  const sparks = [];
  let arcOn = false, arcUntil = 0, raf = 0, last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const live = tech.classList.contains('lit') && !root.hidden && !reduceMotion();
    if (!live) { if (arcOn) { arcOn = false; amb.arc(false); } tech.style.setProperty('--arc', 0); return; }
    if (now > arcUntil) { // the welder works in bursts: strike, weld, lift, look
      arcOn = !arcOn;
      arcUntil = now + (arcOn ? rnd(500, 1800) : rnd(500, 2600));
      amb.arc(arcOn);
    }
    tech.style.setProperty('--arc', arcOn ? rnd(0.55, 1).toFixed(2) : 0);
    if (arcOn && sparks.length < 70) for (let i = 0; i < 3; i++) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      el.setAttribute('stroke', Math.random() < 0.3 ? '#fff6c0' : '#ffa53a');
      el.setAttribute('stroke-width', rnd(2, 4).toFixed(1));
      el.setAttribute('stroke-linecap', 'round');
      sparksG.appendChild(el);
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(250, 700);
      sparks.push({ el, x: ARC.x, y: ARC.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 1.1) });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt; s.vy += 1400 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > 1330) { s.y = 1330; s.vy *= -0.3; s.vx *= 0.5; } // bounce on the workshop floor
      if (s.life <= 0) { s.el.remove(); sparks.splice(i, 1); continue; }
      s.el.setAttribute('x1', s.x.toFixed(1)); s.el.setAttribute('y1', s.y.toFixed(1));
      s.el.setAttribute('x2', (s.x - s.vx * 0.025).toFixed(1)); s.el.setAttribute('y2', (s.y - s.vy * 0.025).toFixed(1));
      s.el.setAttribute('opacity', Math.min(1, s.life * 2).toFixed(2));
    }
  }
  raf = requestAnimationFrame(frame);

  // ---------- drawing the state ----------
  let wasHeld = null, lastCount = null, actKey = {}, extraNote = '';
  function update(s) {
    st = { crew: s.crew || [], ready: s.ready || [], countdown: s.countdown ?? null, phase: s.phase || 'lobby' };
    if (s.players !== undefined) players = s.players;
    const locked = st.phase !== 'lobby', shown = roles();
    const nowHeld = shown.filter(held);
    root.classList.toggle('two', players === 2);
    root.classList.toggle('locked', locked);
    root.classList.toggle('pickable', !!opts.onPick);

    for (const r of ORDER) {
      const p = panel(r), h = held(r), rd = h && isReady(r);
      p.hidden = !shown.includes(r);
      if (p.dataset.name !== info(r).name) {
        p.dataset.name = info(r).name;
        p.setAttribute('aria-label', info(r).name);
        p.querySelector('.lb-top').innerHTML = `<h2>${info(r).name}</h2><p>${info(r).line}</p>`;
      }
      p.classList.toggle('open', !h);
      p.classList.toggle('lit', h);
      p.classList.toggle('ready', rd);
      p.querySelector('.lb-state').textContent = !h ? 'OPEN' : rd ? 'GO' : 'STANDING BY';
      if (ownActions(r)) {
        const key = [rd, locked].join();
        if (actKey[r] !== key) {
          actKey[r] = key;
          p.querySelector('.lb-actions').innerHTML = locked ? '' :
            `<button class="lb-ready ${rd ? 'on' : ''}" data-ready type="button">${rd ? 'GO · press to stand down' : 'READY'}</button>
             <a class="lb-leave" href="/">Leave seat</a>`;
        }
      }
    }
    // A seat that just lit up gets the radio beep, so the room notices someone joined.
    if (wasHeld && nowHeld.some(r => !wasHeld.includes(r))) amb.joined();
    wasHeld = nowHeld;
    amb.setLit(nowHeld);

    // Countdown across the panels.
    const n = st.countdown == null ? null : Math.max(1, Math.ceil(st.countdown));
    const c = $('.lb-count');
    c.hidden = n == null;
    if (n !== lastCount) {
      if (n != null) { c.textContent = n; c.classList.remove('beat'); void c.offsetWidth; c.classList.add('beat'); amb.tick(n); }
      lastCount = n;
    }

    // The status bar: who is missing, how many are ready.
    const missing = shown.filter(r => !held(r)).map(r => info(r).name);
    const ready = shown.filter(r => held(r) && isReady(r)).length, all = shown.length;
    let text;
    if (locked) text = st.phase === 'run' ? 'Mission in progress. An open seat can still be taken to rejoin.' : 'Mission over. Any seat can return to the lobby.';
    else if (n != null) text = `All ${all === 2 ? 'both' : 'four'} GO. Launching in ${n}...`;
    else if (missing.length) text = `Waiting for ${list(missing)}. ${ready} of ${all} ready.`;
    else text = `Crew complete. ${ready} of ${all} ready.${ready < all ? ' Everyone presses Ready.' : ''}`;
    $('.lb-status').textContent = text;
    $('.lb-links').textContent = [players ? `${players}-player game` : '', extraNote].filter(Boolean).join(' · ');
  }

  function show(on) {
    root.hidden = !on;
    if (on) { if (soundOn && amb.ctx) amb.start(); } else amb.stop();
  }

  update(st);
  // A line for the status bar from the page (the landing page: "someone just started a 4-player game").
  function note(text) { if (text !== extraNote) { extraNote = text; update({ ...st, players }); } }
  return { update, show, note, ambience: amb, destroy() { cancelAnimationFrame(raf); amb.stop(); } };
}

function list(names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names.at(-1); }
