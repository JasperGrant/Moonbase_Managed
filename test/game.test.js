// Plain-Node checks of the game rules: npm test
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { Hub } from '../server/hub.js';
import { CFG, TOOLS, FAULTS, PLACES, SCRIPTS, DUST_CELLS, CRACK_POINTS, ROVERS, SAMPLES } from '../client/shared/config.js';
import { OBSTACLES, BOULDERS, FIELD, layField } from '../client/shared/field.js';
import { sheltered } from '../client/shared/rules.js';

let seed = 42;
const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const run = (g, seconds) => { for (let t = 0; t < Math.round(seconds * 10) && g.phase === 'run'; t++) g.tick(0.1); };
const at = (g, p) => { g.astro = { ...g.astro, x: p.x, z: p.z, h: 1.65, inside: false }; };
const inside = g => { g.astro = { ...g.astro, x: PLACES.doors.S.x, z: PLACES.doors.S.z, h: 1.65, inside: true, door: 'S' }; };
const fresh = (mode = 'demo') => { const g = new Game(rng); g.setMode(mode); g.start(); g.script = []; return g; }; // no director: the test breaks things itself
// Core a rock with the drill so it can be picked up: carry the drill to it (wherever it was), lock it on,
// wait out the countdown. The core is left on the drill's tray; the drill stays on the rock.
const core = (g, s) => {
  at(g, s);
  Object.assign(g.drill, { at: 'hand', site: null, left: 0 });
  g.act({ drill: 'set', id: s.id });
  assert.equal(g.drill.at, 'site', 'the drill locks on the rock');
  for (let t = 0; t < CFG.drill.seconds * 10 + 2 && s.at !== 'drill'; t++) g.tick(0.1);
  assert.equal(s.at, 'drill', 'the core comes up onto the tray');
};
// Put whatever is in the hands down where you stand, then fetch `tool` from wherever it lies.
const kit = (g, tool) => {
  for (const t of g.hands.filter(Boolean)) g.act({ drop: t });
  const t = g.tools[tool];
  if (t.inside) inside(g); else at(g, t);
  g.act({ take: tool });
};

// ---------- two hands, one tool in each, found where it lies ----------
{
  const g = fresh();
  assert.deepEqual(g.hands, [null, null], 'the astronaut starts empty-handed');
  assert.ok(g.astro.inside, 'and inside the hall');
  for (const [id, t] of Object.entries(g.tools)) {
    assert.ok(t.at === 'loose' && t.inside && t.area, `${id} lies somewhere in the hall`);
    assert.deepEqual([t.x, t.y, t.z], [PLACES.toolHomes[id].x, PLACES.toolHomes[id].y, PLACES.toolHomes[id].z], 'every tool starts at its home, under its sign');
  }
  at(g, { x: 6, z: 6 });
  g.act({ take: 'brush' });
  assert.deepEqual(g.hands, [null, null], 'a tool in the hall cannot be picked up from outside');
  inside(g);
  g.act({ take: 'brush' });
  assert.deepEqual(g.hands, [null, 'brush'], 'a take with no hand named fills the right hand');
  g.act({ take: 'welder', hand: 1 });
  assert.ok(g.tools.welder.at === 'loose', 'the right hand is full: the welder stays where it is');
  g.act({ take: 'welder', hand: 0 });
  assert.deepEqual(g.hands, ['welder', 'brush'], 'one tool in each hand');
  g.act({ take: 'patch' });
  assert.ok(g.tools.patch.at === 'loose' && !g.has('patch'), 'both hands full: refused');
  g.act({ drop: 'brush' });
  assert.ok(g.hands[1] === null && g.has('welder') && g.tools.brush.at === 'loose' && g.tools.brush.inside);
  g.act({ rest: 'brush', inside: true, x: 2.9, y: 0, z: -10.4 });
  assert.equal(g.tools.brush.area, 'EAST WALL', 'where a tool comes to rest is logged by area');
  // Carried outside and dropped in the field: it lies there, and has to be fetched from there.
  at(g, PLACES.panels[0]);
  g.act({ drop: 'welder' });
  assert.ok(!g.tools.welder.inside && g.tools.welder.area === 'OUTSIDE SOLAR', g.tools.welder.area);
  inside(g); g.act({ take: 'welder' });
  assert.ok(!g.has('welder'), 'a tool lying outside cannot be picked up from inside');
  at(g, PLACES.panels[0]); g.act({ take: 'welder' });
  assert.ok(g.has('welder'));
  g.act({ rest: 'welder', inside: false, x: 1e9, y: 0, z: 0 });
  g.act({ take: 'nonsense' }); g.act({ drop: 'patch' }); g.act(null); g.act('x'); g.act({ fix: 'dust', cell: 0 });
  assert.ok(g.has('welder'));
  const free = new Game(rng); free.setMode('free'); free.start();
  const spots = Object.values(free.tools).map(t => `${t.x},${t.z}`);
  assert.equal(new Set(spots).size, spots.length, 'every tool has its own spot');
  for (const [id, t] of Object.entries(free.tools)) assert.equal(t.area, PLACES.toolHomes[id].area, `free play puts the ${id} at home too`);
}

// ---------- Mission Control's waypoint ----------
{
  const g = fresh();
  assert.equal(g.view('astronaut').waypoint, null, 'no waypoint to start with');
  g.setWaypoint({ tool: 'welder' });
  let w = g.view('astronaut').waypoint;
  assert.ok(w && w.tool === 'welder' && w.inside && w.x === PLACES.toolHomes.welder.x, 'a waypoint on a tool is where the tool lies');
  assert.deepEqual(g.view('ops').waypoint, w, 'Mission Ops sees what it set');
  inside(g); g.act({ take: 'welder' }); run(g, 0.2);
  assert.equal(g.view('astronaut').waypoint, null, 'taking the tool puts the beacon out');
  g.setWaypoint({ x: 40, z: -30 });
  w = g.view('sci').waypoint;
  assert.ok(w && !w.tool && !w.inside && w.x === 40 && w.z === -30, 'a waypoint on a spot from the chart');
  at(g, { x: 20, z: -20 }); run(g, 0.2);
  assert.ok(g.view('astronaut').waypoint, 'still lit while the astronaut is far off');
  at(g, { x: 39, z: -29 }); run(g, 0.2);
  assert.equal(g.view('astronaut').waypoint, null, 'standing at it puts it out');
  g.setWaypoint({ x: 1e6, z: 0 }); assert.equal(g.waypoint, null, 'off the field: no waypoint');
  g.setWaypoint({ tool: 'nonsense' }); assert.equal(g.waypoint, null);
  g.setWaypoint({ x: 10, z: 10 }); g.setWaypoint(null); assert.equal(g.waypoint, null, 'cleared');
  const hub = new Hub(new Game(rng)); hub.choosePlayers(4);
  const c = { send() {}, role: null }; hub.add(c); hub.message(c, JSON.stringify({ t: 'hello', role: 'tech' }), false);
  hub.game.setMode('demo'); hub.game.start();
  hub.message(c, JSON.stringify({ t: 'waypoint', tool: 'brush' }), false);
  assert.equal(hub.game.waypoint, null, 'the Technician cannot set one');
}

// ---------- a repair needs its tool, and the astronaut has to be there ----------
{
  const g = fresh();
  g.break('dust');
  at(g, PLACES.panels[0]);
  g.act({ fix: 'dust', cell: 0 });
  assert.equal(g.faults.dust.cells[0], true, 'no brush in hand: refused');
  kit(g, 'brush');
  g.act({ fix: 'dust', cell: 0 });
  assert.equal(g.faults.dust.cells[0], true, 'brushing from inside the hall: refused');
  at(g, PLACES.panels[0]);
  assert.equal(g.view('sci').power.solar, 15);
  for (let c = 0; c < DUST_CELLS - 1; c++) g.act({ fix: 'dust', cell: c });
  assert.ok(g.faults.dust && g.view('sci').power.solar > 90, 'the solar gauge climbs as cells clear');
  g.act({ fix: 'dust', cell: DUST_CELLS - 1 });
  assert.ok(!g.faults.dust, 'all cells clear: fixed');
  assert.equal(g.score, CFG.fixPoints);

  g.break('hull');
  at(g, PLACES.cracks[g.faults.hull.spot]);
  g.act({ fix: 'hull', point: 0 });
  assert.equal(g.faults.hull.welded[0], false, 'no welder: refused');
  kit(g, 'welder'); at(g, PLACES.cracks[g.faults.hull.spot]);
  for (let p = 0; p < CRACK_POINTS; p++) g.act({ fix: 'hull', point: p });
  assert.ok(!g.faults.hull);

  g.break('suit');
  g.act({ fix: 'suit' });
  assert.ok(g.faults.suit, 'no patch kit: refused');
  kit(g, 'patch'); at(g, PLACES.panels[1]);
  g.act({ fix: 'suit' });
  assert.ok(!g.faults.suit, 'a suit leak can be patched anywhere');

  // The wheel fault names a rover, and is fixed at that rover.
  g.break('wheel', false, 'scout');
  assert.equal(g.faults.wheel.which, 'scout');
  at(g, g.rovers.hauler);
  g.act({ fix: 'wheel', pull: true });
  assert.equal(g.faults.wheel.stage, 0, 'standing at the Hauler does nothing for the Scout');
  at(g, g.rovers.scout);
  g.act({ fix: 'wheel', fit: true });
  assert.equal(g.faults.wheel.stage, 0, 'the old wheel has to come off first');
  g.act({ fix: 'wheel', pull: true });
  g.act({ fix: 'wheel', fit: true });
  assert.ok(g.faults.wheel, 'no tire: refused');
  kit(g, 'tire'); at(g, g.rovers.scout);
  g.act({ fix: 'wheel', fit: true });
  assert.ok(!g.faults.wheel && !g.has('tire') && g.tools.tire.at === 'gone', 'the tire is used up');
  run(g, CFG.tireRestockSeconds + 1);
  assert.ok(g.tools.tire.at === 'loose' && g.tools.tire.inside && g.tools.tire.area === 'SPARES STAND' && g.tools.tire.x === PLACES.toolHomes.tire.x, 'a new tire turns up on its stand');
}

// ---------- no switchboard: dust is the only power fault ----------
{
  const g = fresh();
  g.break('board');
  assert.ok(!g.faults.board, 'there is no switchboard to trip');
  assert.ok(!('board' in g.view('astronaut').scene), 'the astronaut sees no switchboard');
  assert.ok(!('board' in g.view('sci').power) && !('wiring' in g.view('sci')), 'the Scientist has no board output and no wiring diagram');
  assert.ok(!Object.keys(FAULTS).includes('board') && !SCRIPTS.demo.some(e => (e.after || []).includes('board')), 'free play and the demo never trip it');
}

// ---------- power: a flat battery darkens the base, and comms never fail ----------
{
  const hub = new Hub(new Game(rng));
  hub.choosePlayers(4); // a 4-player game, so the Astronaut and Mission Ops seats can be taken
  const g = hub.game;
  const seat = role => { const c = { got: [], send(d) { this.got.push(d); } }; hub.add(c); hub.message(c, JSON.stringify({ t: 'hello', role })); return c; };
  const astro = seat('astronaut'), ops = seat('ops');
  g.start(); g.script = [];
  kit(g, 'gen');
  g.break('dust');
  run(g, CFG.batterySeconds - 2);
  assert.ok(!g.blackout && g.battery < 6, 'the battery lasts about a minute');
  run(g, 3);
  assert.ok(g.blackout && !g.powered, 'an empty battery darkens the base');
  assert.ok(!('silent' in hub), 'there is no radio cut-off any more');

  // Voice still goes both ways in the dark.
  const heard = c => c.got.filter(d => typeof d !== 'string').length;
  hub.message(ops, new Uint8Array(64).buffer, true);
  hub.message(astro, new Uint8Array(64).buffer, true);
  assert.equal(heard(astro) + heard(ops), 2, 'the radio works with the base dark');

  // Every console still has everything.
  for (const role of ['ops', 'tech', 'sci', 'all']) {
    const v = g.view(role);
    for (const k of ['oxygen', 'timeLeft']) assert.ok(k in v, `${role} loses ${k} during a blackout`);
  }
  assert.ok('power' in g.view('sci') && 'survey' in g.view('sci') && 'rovers' in g.view('tech'));
  assert.equal(g.view('astronaut').scene.dark, true, 'the base is dark for the astronaut');

  // The suit does not refill indoors in the dark; the generator brings the lights and the refill back.
  inside(g); g.oxygen = 50;
  run(g, 5);
  assert.ok(g.oxygen < 50, 'no refill with the base dark');
  g.act({ gen: true }); // the generator has been in the astronaut's hand since the start
  assert.ok(g.powered && g.blackout && !g.has('gen') && g.tools.gen.at === 'gone');
  const o2 = g.oxygen; run(g, 5);
  assert.ok(g.oxygen > o2, 'on generator power the suit refills');
  const b = g.battery;
  run(g, CFG.generatorSeconds - 5);
  assert.ok(g.battery === b || g.battery < b, 'it does not charge the battery');
  run(g, 2);
  assert.ok(!g.powered, 'and it runs out');
  g.act({ gen: true });
  assert.ok(!g.powered, 'it only works once');

  // The astronaut can fix it alone, in the dark.
  kit(g, 'brush');
  at(g, PLACES.panels[0]);
  for (let c = 0; c < DUST_CELLS; c++) g.act({ fix: 'dust', cell: c });
  run(g, 1);
  assert.ok(g.blackout, 'still dark until the battery is above 10%');
  run(g, CFG.rechargeSeconds * CFG.blackoutEndsAt / 100 + 0.5);
  assert.ok(!g.blackout && g.powered, 'fixing the fault ends the blackout');
  run(g, CFG.rechargeSeconds);
  assert.equal(g.battery, 100);
}

// ---------- oxygen: it drains outside and refills at home ----------
{
  const g = fresh();
  at(g, { x: 20, z: 20 });
  const o = g.oxygen; run(g, 10);
  assert.ok(Math.abs(o - g.oxygen - CFG.o2DrainPerSec * 10) < 0.05, 'outside it drains');
  inside(g);
  const o2 = g.oxygen; run(g, 5);
  assert.ok(g.oxygen > o2, 'inside it refills');
  g.oxygen = g.o2Max - 0.5; run(g, 5);
  assert.equal(g.oxygen, g.o2Max, 'and never past the tank');
}

// ---------- the two rovers ----------
{
  const hub = new Hub(new Game(rng));
  hub.choosePlayers(4);
  const g = hub.game;
  const seat = role => { const c = { got: [], send(d) { this.got.push(d); } }; hub.add(c); hub.message(c, JSON.stringify({ t: 'hello', role })); return c; };
  const tech = seat('tech');
  g.start(); g.script = []; inside(g);
  const send = m => hub.message(tech, JSON.stringify({ t: 'rover', ...m }));
  const s0 = { ...g.rovers.scout }, h0 = { ...g.rovers.hauler };
  send({ id: 'scout', throttle: 1, steer: 0 });
  run(g, 2);
  assert.ok(Math.hypot(g.rovers.scout.x - s0.x, g.rovers.scout.z - s0.z) > 3, 'the Scout drives');
  assert.deepEqual([g.rovers.hauler.x, g.rovers.hauler.z], [h0.x, h0.z], 'the Hauler does not: each answers only its own id');
  send({ id: 'hauler', throttle: 1, steer: 0.5 });
  send({ id: 'nonsense', throttle: 1 });
  run(g, 2);
  assert.ok(g.rovers.hauler.v > 0 && g.rovers.hauler.ry !== h0.ry, 'both at once');
  assert.ok(g.rovers.scout.v > ROVERS.hauler.speed, 'the Scout is the quick one');
  send({ id: 'scout', throttle: 0, steer: 0 });
  run(g, 1.5);
  assert.equal(g.rovers.scout.v, 0, 'a rover with no key held stops by itself');
  assert.ok(g.rovers.scout.v === 0 && g.rovers.hauler.v > 0, 'while the other keeps going');

  // They bump into the base and into boulders, and into each other.
  const r = g.rovers.scout; Object.assign(r, { x: 0, z: 9, ry: Math.PI, v: 0 });
  send({ id: 'scout', throttle: 1, steer: 0 }); run(g, 6);
  assert.ok(Math.hypot(r.x, r.z) >= 2.7 + ROVERS.scout.radius - 0.05, 'the Scout cannot drive through the habitat');
  const b = BOULDERS[5];
  Object.assign(r, { x: b.x + 8, z: b.z, ry: -Math.PI / 2, v: 0 }); // facing -x, toward the boulder
  send({ id: 'scout', throttle: 1, steer: 0 }); run(g, 3);
  assert.ok(Math.hypot(r.x - b.x, r.z - b.z) >= b.r + ROVERS.scout.radius - 0.05, 'nor through a boulder');
  assert.ok(Object.values(g.rovers).every(v => Math.hypot(v.x, v.z) <= CFG.bounds + 0.01), 'and neither leaves the field');

  // A broken wheel stops that rover only.
  Object.assign(g.rovers.scout, { x: -30, z: 30, v: 0, throttle: 0 });
  Object.assign(g.rovers.hauler, { x: 30, z: 30, v: 0, throttle: 0 });
  g.break('wheel', false, 'scout');
  send({ id: 'scout', throttle: 1 }); send({ id: 'hauler', throttle: 1 });
  const z1 = g.rovers.scout.z; run(g, 2);
  assert.equal(g.rovers.scout.z, z1, 'a broken wheel stops the Scout');
  assert.ok(g.rovers.hauler.v > 0, 'and leaves the Hauler');
  assert.deepEqual(g.view('astronaut').scene.wheels, { scout: 1, hauler: 0 });
}

// ---------- one thing at a time ----------
{
  const g = new Game(rng); g.setMode('free'); g.start();
  g.oxygen = 1e6;
  let most = 0, showers = 0, last = null, faults = 0, both = 0;
  for (let t = 0; t < CFG.roundSeconds * 10 - 20; t++) {
    g.tick(0.1);
    const n = Object.keys(g.faults).length;
    most = Math.max(most, n);
    if (g.meteor && n) both++;
    if (g.meteor && g.meteor !== last) { last = g.meteor; showers++; }
    // The crew fixes whatever is broken after a while, so the director can go on.
    if (n && g.elapsed % 12 < 0.1) { const type = Object.keys(g.faults)[0]; if (type === 'wheel') { g.faults = {}; } else g.faults = {}; faults++; g.next = g.elapsed + CFG.faultGapSeconds; }
  }
  assert.equal(most, 1, 'never two faults at once');
  assert.equal(both, 0, 'and a shower never starts on top of a fault');
  assert.ok(faults >= 5 || showers >= 1, `free play: ${faults} faults, ${showers} showers`);
  // The demo goes in a fixed order, a gap apart. Rover faults are off unless the admin turns them on.
  const demoOrder = roverFaults => {
    const d = new Game(rng); d.setRoverFaults(roverFaults); d.start(); d.oxygen = 1e6;
    const seen = [];
    for (let t = 0; t < CFG.roundSeconds * 10 - 20; t++) {
      d.tick(0.1);
      for (const k of Object.keys(d.faults)) if (!seen.includes(k)) seen.push(k);
      if (d.meteor && !seen.includes('meteor')) seen.push('meteor');
      if (Object.keys(d.faults).length > 1) assert.fail('two faults in the demo');
      if (d.elapsed % 8 < 0.1) { d.faults = {}; if (d.quiet) d.next = Math.min(d.next, d.elapsed + 2); }
    }
    return seen;
  };
  assert.equal(new Game(rng).roverFaults, false, 'rover faults are off by default');
  assert.deepEqual(demoOrder(true).slice(0, 3), ['dust', 'wheel', 'meteor'], 'the demo breaks the same things in the same order');
  assert.ok(!demoOrder(false).includes('wheel'), 'with rover faults off, no wheel ever breaks');
}

// ---------- meteors: a warning, cover, and nothing left broken ----------
{
  const g = fresh();
  g.fire({ ev: 'meteor' });
  g.break('wheel', false, 'hauler'); // even with the Hauler stuck, the warning comes
  let v = g.view('tech');
  assert.ok(v.meteor.eta > 0 && !v.meteor.falling, 'the Technician gets the warning');
  assert.ok(!('meteor' in g.view('sci')) && !('meteor' in g.view('ops')), 'only the Technician ever gets it');
  assert.equal(g.view('astronaut').scene.meteor, null, 'the astronaut sees nothing until rocks fall');
  g.faults = {};

  // Caught in the open: 20 oxygen and a suit leak. Once per shower.
  at(g, { x: 10, z: -10 });
  run(g, v.meteor.eta + CFG.meteorGraceSeconds - 0.5);
  assert.ok(!g.faults.suit && g.view('astronaut').scene.meteor > 0, 'the first impacts land far away');
  const o2 = g.oxygen;
  run(g, 1);
  assert.ok(g.faults.suit && g.oxygen < o2 - CFG.meteorHit && g.oxygen > o2 - CFG.meteorHit - 2);
  const o3 = g.oxygen;
  run(g, 1);
  assert.ok(Math.abs(o3 - g.oxygen - CFG.o2DrainPerSec * CFG.leakMultiplier) < 0.01, 'a leak drains oxygen three times faster');
  assert.equal(g.stats.hits, 1);
  run(g, CFG.meteorSeconds);
  assert.deepEqual(Object.keys(g.faults), ['suit'], 'the shower breaks nothing else: the suit leak is the one fault');
  assert.ok(!g.meteor);
  assert.equal(g.view('sci').leak, true);

  // Cover: inside (the hall or an airlock chamber), or crouched beside the Hauler. No canopy.
  const hauler = { x: 10, z: 10 };
  assert.equal(sheltered({ x: 0, z: 3, h: 1.7, inside: true }, hauler), true, 'inside');
  assert.equal(sheltered({ x: 0, z: 4, h: 1.7 }, hauler), false, 'where the canopy used to be: in the open');
  assert.equal(sheltered({ x: 11, z: 10, h: 1.7 }, hauler), false, 'standing beside it');
  assert.equal(sheltered({ x: 11, z: 10, h: 0.9 }, hauler), true, 'crouched beside it');
  assert.equal(sheltered({ x: 15, z: 10, h: 0.9 }, hauler), false, 'crouched in the open');
  const g2 = fresh();
  inside(g2);
  g2.fire({ ev: 'meteor' });
  run(g2, CFG.meteorWarnSeconds + CFG.meteorSeconds + 1);
  assert.ok(!g2.faults.suit && g2.stats.hits === 0 && !Object.keys(g2.faults).length, 'under cover: no hit, and no damage left behind');
}

// ---------- riding the Hauler ----------
{
  const g = fresh(); g.break('dust'); g.faults = {};
  const h = g.rovers.hauler;
  at(g, { x: h.x + 10, z: h.z });
  g.act({ mount: true });
  assert.equal(g.astro.riding, null, 'from 10 m away: refused');
  const p = g.plate(); at(g, { x: p.x + 1, z: p.z });
  h.throttle = 1; run(g, 1);
  at(g, { x: g.plate().x + 1, z: g.plate().z });
  g.act({ mount: true });
  assert.equal(g.astro.riding, null, 'a moving Hauler cannot be boarded');
  h.throttle = 0; run(g, 2);
  at(g, { x: g.plate().x + 1, z: g.plate().z });
  g.act({ mount: true });
  assert.equal(g.astro.riding, 'hauler');
  h.throttle = 1; run(g, 3);
  assert.ok(Math.hypot(g.astro.x - g.plate().x, g.astro.z - g.plate().z) < 0.01, 'riding carries the astronaut with it');
  const where = { x: g.astro.x, z: g.astro.z };
  g.setPose({ x: 0, z: 0, ry: 0, h: 1.65, inside: true, door: 'S' });
  assert.ok(Math.hypot(g.astro.x - where.x, g.astro.z - where.z) < 1.5 && !g.astro.inside, 'the pose a rider sends does not move them off the Hauler');
  g.act({ mount: false });
  assert.equal(g.astro.riding, 'hauler', 'cannot get off while it is moving');
  h.throttle = 0; run(g, 2);
  g.act({ mount: false });
  assert.equal(g.astro.riding, null);
  assert.ok(g.view('tech').rider === false);
}

// ---------- the survey chart ----------
{
  const g = fresh();
  g.oxygen = 1e6;
  const first = g.samples.find(s => s.kind !== 'dud');
  assert.equal(g.view('sci').survey.samples.length, 0, 'at the start no sample is in explored ground');
  assert.equal(g.view('sci').survey.heat.length, FIELD.blocks * FIELD.blocks, 'but the heat map covers the field');
  const sc = g.rovers.scout; Object.assign(sc, { x: 20, z: -20, v: 0 });
  const pct = g.view('sci').survey.pct;
  g.tick(0.1);
  assert.ok(g.view('sci').survey.pct > pct, 'a rover drives and the chart develops');
  Object.assign(sc, { x: first.x, z: first.z }); g.tick(0.1);
  const sv = g.view('sci').survey;
  assert.ok(sv.samples.some(s => s.id === first.id && s.kind === first.kind), 'a sample appears once its ground is explored');
  assert.ok(!sv.samples.some(s => s.kind === 'dud'), 'a lookalike is never listed');
  Object.assign(sc, { x: -90, z: 90 }); g.tick(0.1);
  assert.ok(g.view('sci').survey.samples.some(s => s.id === first.id), 'and it stays developed');
  // The astronaut on foot develops nothing.
  const before = g.view('sci').survey.pct;
  at(g, { x: 80, z: 80 }); g.tick(0.1);
  assert.equal(g.view('sci').survey.pct, before);
  assert.equal(g.view('sci').survey.astro, null, 'and is not on the chart over unexplored ground');
  // Who sees the chart.
  for (const role of ['tech', 'astronaut', 'ops']) assert.ok(!('survey' in g.view(role)), `${role} has no chart`);
  assert.ok(g.view('tech').scene.samples.every(s => !('kind' in s) && !('type' in s)), 'nobody on the Moon is told which rock is real');
  assert.ok(g.view('astronaut').scene.samples.every(s => !('kind' in s) && s.look), 'the astronaut sees only how a rock looks');
  // A fault shows as a symbol in explored ground.
  g.break('dust');
  assert.deepEqual(g.view('sci').survey.fault && g.view('sci').survey.fault.type, 'dust');
  // The heat map is hot where samples are.
  const l = layField(rng, 'demo'); const hot = l.heat.filter(Boolean).length;
  assert.ok(hot >= 4, 'the heat map has hot blocks');
}

// ---------- the core drill: two hands, the Hauler's rack, five seconds on a rock ----------
{
  const g = fresh();
  g.oxygen = 1e6;
  const s = g.samples.find(x => x.kind !== 'dud'), h = g.rovers.hauler;
  assert.equal(g.drill.at, 'rover', 'the drill starts in its rack on the Hauler');
  at(g, s);
  g.act({ pick: s.id });
  assert.equal(s.at, 'ground', 'a rock still in the ground cannot be picked up by hand');
  assert.ok(!g.view('astronaut').scene.samples.find(x => x.id === s.id)?.cored, 'and the page is told it is not cored');
  // Off the rack: beside the Hauler, with both hands empty.
  g.act({ drill: 'take' });
  assert.equal(g.drill.at, 'rover', 'from away from the Hauler: refused');
  at(g, { x: h.x + 1.5, z: h.z });
  g.tools.brush = { at: 'loose', inside: false, x: h.x + 1.5, y: 0, z: h.z, area: '' };
  g.act({ take: 'brush' }); assert.ok(g.has('brush'));
  g.act({ drill: 'take' });
  assert.equal(g.drill.at, 'rover', 'a hand full: refused, it takes two');
  g.act({ drop: 'brush' });
  g.act({ drill: 'take' });
  assert.equal(g.drill.at, 'hand'); assert.equal(g.handsFree, 0, 'the drill fills both hands');
  g.act({ take: 'brush' }); assert.ok(!g.has('brush'), 'nothing else while carrying it');
  g.act({ mount: true }); assert.equal(g.astro.riding, null, 'no riding with the drill in your arms');
  // Back into the rack, and out again.
  g.act({ drill: 'stow' }); assert.equal(g.drill.at, 'rover');
  g.act({ drill: 'take' }); assert.equal(g.drill.at, 'hand');
  // Put down on the way, then taken up again.
  at(g, { x: s.x + 1, z: s.z });
  g.act({ drill: 'put', x: s.x + 1.3, z: s.z });
  assert.deepEqual([g.drill.at, g.drill.x], ['ground', s.x + 1.3]);
  g.act({ drill: 'take' }); assert.equal(g.drill.at, 'hand');
  // Locked on the rock: too far is refused, close enough counts down five seconds.
  at(g, { x: s.x + 6, z: s.z }); g.act({ drill: 'set', id: s.id });
  assert.equal(g.drill.at, 'hand', 'out of reach of the rock: refused');
  at(g, { x: s.x + 1, z: s.z }); g.act({ drill: 'set', id: s.id });
  assert.equal(g.drill.at, 'site'); assert.equal(g.drill.site, s.id); assert.equal(g.drill.left, CFG.drill.seconds);
  assert.ok(Math.abs(g.drill.ry - Math.PI / 2) < 1e-6, 'its face turns toward the astronaut');
  assert.equal(g.view('astronaut').scene.drill.at, 'site');
  assert.equal(g.view('ops').drill.at, 'site', 'Mission Ops sees what the drill is doing');
  g.act({ drill: 'take' }); assert.equal(g.drill.at, 'site', 'locked on while it drills');
  g.act({ pick: s.id }); assert.equal(s.at, 'ground', 'nothing to take until the core is up');
  run(g, CFG.drill.seconds - 1);
  assert.ok(g.drill.left > 0.5 && g.drill.left < 1.5 && s.at === 'ground', 'one second to go: ' + g.drill.left);
  run(g, 1.2);
  assert.equal(g.drill.left, 0); assert.equal(s.at, 'drill', 'the core is presented on the drill');
  assert.ok(g.view('astronaut').scene.samples.find(x => x.id === s.id).cored);
  assert.ok(!('kind' in g.view('astronaut').scene.samples.find(x => x.id === s.id)), 'and still nobody on the Moon is told what it is');
  // Take the core; then the drill comes back up.
  g.act({ pick: s.id }); assert.equal(s.at, 'hand'); assert.deepEqual(g.carry, [s.id]);
  g.act({ drill: 'take' }); assert.equal(g.drill.at, 'site', 'one hand full: the drill stays');
  g.act({ put: s.id, x: s.x + 0.5, z: s.z });
  assert.ok(s.at === 'ground' && s.free, 'a core put down is loose');
  g.act({ drill: 'take' }); assert.equal(g.drill.at, 'hand', 'both hands free: the drill comes up');
  g.act({ pick: s.id }); assert.equal(s.at, 'ground', 'not while carrying the drill');
  g.act({ drill: 'put', x: s.x - 1, z: s.z });
  g.act({ pick: s.id }); assert.equal(s.at, 'hand', 'a loose core is picked up by hand');
  // Lifted with the core still on its tray: the core is left on the ground.
  const s2 = g.samples.find(x => x !== s && x.at === 'ground');
  g.act({ put: s.id, x: s.x, z: s.z });
  core(g, s2);
  g.act({ drill: 'take' });
  assert.ok(g.drill.at === 'hand' && s2.at === 'ground' && s2.free, 'the core drops where the drill stood');
  // A lookalike cores the same as the real thing: the drill does not tell.
  const dud = g.samples.find(x => x.kind === 'dud' && x.at === 'ground');
  core(g, dud); assert.equal(dud.at, 'drill');
  // Through an airlock it does not go: carried in, it is left outside the door.
  Object.assign(g.drill, { at: 'hand' });
  g.setPose({ x: PLACES.doors.S.x, z: PLACES.doors.S.z, ry: 0, h: 1.65, inside: true, door: 'S' });
  assert.equal(g.drill.at, 'ground'); assert.ok(Math.hypot(g.drill.x, g.drill.z) > 3, 'it stands outside the door');
}

// ---------- samples: pick up, carry, cup, bank, score ----------
{
  const g = fresh();
  g.oxygen = 1e6;
  const real = g.samples.filter(s => s.kind !== 'dud'), dud = g.samples.find(s => s.kind === 'dud');
  const wanted = kind => g.manifest.find(m => m.kind === kind && !m.got);
  const first = real.find(s => wanted(s.kind));
  core(g, first); g.act({ drill: 'take' }); g.act({ drill: 'put', x: first.x - 1, z: first.z }); // the core left on the ground
  inside(g);
  g.act({ pick: first.id });
  assert.equal(first.at, 'ground', 'from inside the hall: refused');
  at(g, { x: first.x + 30, z: first.z });
  g.act({ pick: first.id });
  assert.equal(first.at, 'ground', 'out of reach: refused');
  at(g, first);
  g.act({ pick: first.id });
  assert.equal(first.at, 'hand'); assert.deepEqual(g.carry, [first.id]);
  assert.deepEqual(g.view('astronaut').carry, [first.id]);
  // Two hands: a sample and a tool, or two samples. Never three.
  const second = real.find(s => s !== first);
  Object.assign(second, { x: first.x + 1, z: first.z, free: true });
  g.act({ pick: second.id });
  assert.equal(g.carry.length, 2);
  const third = real.find(s => s !== first && s !== second); Object.assign(third, { x: first.x + 1, z: first.z, free: true });
  g.act({ pick: third.id });
  assert.equal(g.carry.length, 2, 'both hands full: refused');
  g.tools.brush = { at: 'loose', inside: false, x: first.x, y: 0, z: first.z, area: '' };
  g.act({ take: 'brush' });
  assert.ok(!g.has('brush'), 'and no tool either');
  g.act({ put: second.id, x: first.x + 2, z: first.z });
  assert.equal(second.at, 'ground'); assert.equal(g.carry.length, 1);
  g.act({ take: 'brush' }); assert.ok(g.has('brush'), 'a sample and a tool');
  g.act({ drop: 'brush' });
  // The tray rides with the Hauler.
  const h = g.rovers.hauler; at(g, h);
  g.act({ tray: first.id, slot: 1 });
  assert.equal(first.at, 'tray'); assert.equal(g.tray[1], first.id);
  assert.deepEqual(g.view('ops').tray, [false, true, false, false], 'Ops sees which cups are full, not what is in them');
  Object.assign(h, { x: 30, z: 30 }); at(g, { x: 30, z: 31 });
  g.act({ pick: first.id });
  assert.equal(first.at, 'hand'); assert.equal(g.tray[1], null, 'out of a cup and into a hand');
  // Banking: only at the port, which is in the hall.
  g.act({ bank: first.id });
  assert.equal(first.at, 'hand', 'outside: refused');
  inside(g);
  // Let go in the hall: it lies on the hall floor, not outside the door, and can be taken up again indoors.
  g.act({ put: first.id, x: 1.2, z: -6 });
  assert.equal(first.at, 'ground'); assert.ok(first.inside, 'dropped indoors stays indoors');
  assert.deepEqual([first.x, first.z], [1.2, -6]);
  assert.ok(g.view('astronaut').scene.samples.some(x => x.id === first.id && x.inside), 'the astronaut sees it on the hall floor');
  assert.ok(!g.view('sci').survey.samples.some(x => x.id === first.id), 'it is not on the field chart');
  at(g, { x: 1.2, z: 2 }); g.act({ pick: first.id });
  assert.equal(first.at, 'ground', 'a sample in the hall cannot be picked up from outside');
  inside(g); g.act({ pick: first.id });
  assert.equal(first.at, 'hand', 'picked up off the hall floor');
  const want = !!wanted(first.kind);
  g.act({ bank: first.id });
  assert.equal(first.at, 'banked');
  assert.equal(g.score, want ? CFG.sample.wanted : CFG.sample.extra, 'a sample on the manifest scores more');
  assert.equal(g.view('sci').assay.kind, first.kind);
  assert.equal(g.view('astronaut').scene.port.banked, g.manifest.filter(m => m.got).length);
  // A lookalike is a dud.
  Object.assign(dud, { free: true }); // already cored
  at(g, dud); g.act({ pick: dud.id }); const sc = g.score;
  inside(g); g.act({ bank: dud.id });
  assert.equal(dud.at, 'banked'); assert.equal(g.score, sc, 'a dud scores nothing');
  assert.equal(g.view('sci').assay.kind, 'dud'); assert.equal(g.result, null);
}

// ---------- who sees what ----------
{
  const g = fresh();
  g.break('dust'); g.break('hull'); g.break('suit'); // (the test forces what the director never would)
  const only = (role, allowed) => { for (const k of Object.keys(g.view(role))) assert.ok(allowed.includes(k), `${role} sees ${k}`); };
  const common = ['t', 'n', 'phase', 'mode', 'crew', 'score', 'result', 'powered', 'ev', 'timeLeft', 'oxygen', 'o2Max', 'tally'];
  only('astronaut', [...common, 'hands', 'tools', 'scene', 'suit', 'rovers', 'riding', 'carry', 'waypoint']);
  only('ops', [...common, 'hands', 'tools', 'carry', 'tray', 'waypoint', 'drill']);
  only('tech', [...common, 'rovers', 'rider', 'scene', 'astro', 'meteor', 'tools']);
  only('sci', [...common, 'power', 'leak', 'drain', 'survey', 'manifest', 'assay', 'waypoint']);
  assert.ok(!('text' in g.view('ops').ev), 'nobody is told in words what broke');
  // The leak lamp does not say where.
  assert.equal(JSON.stringify(g.view('sci').leak), 'true');
  assert.equal(JSON.stringify(g.view('sci')).includes('"hull"'), false, 'the Scientist is told a leak, not which');
}

// ---------- the demo mission, played well, is a win ----------
{
  const g = new Game(rng);
  g.start();
  g.oxygen = g.o2Max;
  // The crew's sample run, in one go: fetch every sample the manifest wants, from where the chart showed it.
  for (const m of g.manifest) {
    const s = g.samples.find(x => x.kind === m.kind && x.at === 'ground');
    core(g, s); g.act({ pick: s.id });
    inside(g); g.act({ bank: s.id });
  }
  inside(g);
  assert.deepEqual(g.view('sci').manifest.map(m => m.got), [true, true, true, true]);
  const peak = { n: 0 };
  let busy = 0, fixes = 0, wheel = false;
  for (let t = 0; t < CFG.roundSeconds * 10 + 50 && g.phase === 'run'; t++) {
    g.tick(0.1);
    peak.n = Math.max(peak.n, Object.keys(g.faults).length);
    if (g.meteor) inside(g);
    if (busy-- > 0) continue;
    const type = Object.keys(g.faults)[0];
    if (!type) continue;
    if (type === 'wheel') wheel = true;
    const tool = { dust: 'brush', wheel: 'tire', hull: 'welder', suit: 'patch' }[type];
    if (tool && !g.has(tool)) { kit(g, tool); busy = 60; continue; }
    if (type === 'dust') { at(g, PLACES.panels[1]); for (let c = 0; c < DUST_CELLS; c++) g.act({ fix: 'dust', cell: c }); }
    if (type === 'wheel') { at(g, g.rovers[g.faults.wheel.which]); g.act({ fix: 'wheel', pull: true }); g.act({ fix: 'wheel', fit: true }); }
    if (type === 'hull') { at(g, PLACES.cracks[g.faults.hull.spot]); for (let p = 0; p < CRACK_POINTS; p++) g.act({ fix: 'hull', point: p }); }
    if (type === 'suit') g.act({ fix: 'suit' });
    if (!g.faults[type]) fixes++;
    inside(g);
    busy = 80;
  }
  assert.equal(g.phase, 'results');
  assert.equal(g.result.won, true, g.result.reason);
  assert.equal(peak.n, 1, 'one fault at a time, all mission');
  assert.ok(fixes >= 3, 'the director kept finding things to break, one by one');
  assert.ok(!wheel, 'rover faults are off by default: no wheel broke');
  assert.equal(g.result.wanted, 4);
  assert.ok(g.score >= 4 * CFG.sample.wanted + fixes * CFG.fixPoints);
  console.log(`good crew, demo mission: banked ${g.result.wanted}/4, fixed ${g.result.fixed}, score ${g.score}`);
}

// ---------- a crew that comes home short loses ----------
{
  const g = new Game(rng);
  g.start();
  inside(g); // in the hall for the whole shift: the base keeps the suit topped up
  run(g, CFG.roundSeconds + 5);
  assert.equal(g.result.won, false);
  assert.match(g.result.reason, /short/, 'alive at 0:00 but the manifest is not banked');
  assert.equal(g.result.hits, 0);
}

// ---------- oxygen at zero ends it at once ----------
{
  const g = new Game(rng);
  g.start();
  at(g, { x: 30, z: 30 });
  g.oxygen = 5;
  run(g, 30);
  assert.equal(g.phase, 'results'); assert.equal(g.result.won, false); assert.match(g.result.reason, /oxygen/);
}

// ---------- the debrief times out ----------
{
  const g = new Game(rng);
  assert.equal(g.setMode('free'), true);
  g.start();
  g.score = 300;
  g.end(true, 'test');
  assert.equal(g.phase, 'results');
  assert.equal(g.debriefLeft, CFG.debriefSeconds);
  assert.equal(g.view('ops').debriefLeft, CFG.debriefSeconds, 'the consoles get the seconds left');
  for (let i = 0; i < (CFG.debriefSeconds - 1) * 10; i++) g.tick(0.1);
  assert.equal(g.phase, 'results', 'not before the time is up');
  for (let i = 0; i < 20; i++) g.tick(0.1);
  assert.equal(g.phase, 'lobby', 'an unattended debrief goes back to the lobby');
  assert.equal(g.mode, 'free', 'and keeps the mode');
}
console.log('all game tests passed');
