// Plain-Node checks of the game rules: npm test
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { Hub } from '../server/hub.js';
import { CFG, TOOLS, PLACES, SCRIPTS, DUST_CELLS, CRACK_POINTS } from '../client/shared/config.js';
import { sheltered } from '../client/shared/rules.js';

let seed = 42;
const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const run = (g, seconds) => { for (let t = 0; t < Math.round(seconds * 10) && g.phase === 'run'; t++) g.tick(0.1); };
const at = (g, p) => { g.astro = { ...g.astro, x: p.x, z: p.z, h: 1.65 }; };
const fresh = (mode = 'demo') => { const g = new Game(rng); g.setMode(mode); g.start(); g.script = []; return g; }; // no director: the test breaks things itself
const kit = (g, ...tools) => { at(g, PLACES.locker); for (const t of [...g.belt]) g.act({ stow: t }); for (const t of tools) g.act({ take: t }); };

// ---------- the belt ----------
{
  const g = fresh();
  assert.deepEqual(g.belt, [], 'the astronaut starts with an empty belt');
  kit(g, 'welder', 'brush', 'patch');
  assert.deepEqual(g.belt, ['welder', 'brush', 'patch'], 'the everyday kit fills the belt exactly');
  g.act({ take: 'tire' });
  assert.ok(!g.belt.includes('tire') && g.locker.includes('tire'), 'over the weight limit: refused, stays on the rack');
  g.act({ stow: 'welder' }); g.act({ take: 'tire' });
  assert.ok(!g.belt.includes('tire'), 'brush + patch + tire is 5: still refused');
  g.act({ stow: 'brush' }); g.act({ take: 'tire' });
  assert.deepEqual(g.belt, ['patch', 'tire']);
  at(g, PLACES.panels[2]);
  g.act({ stow: 'tire' }); g.act({ take: 'brush' });
  assert.deepEqual(g.belt, ['patch', 'tire'], 'the locker only works when you are standing at it');
  g.act({ take: 'nonsense' }); g.act(null); g.act('x'); g.act({ fix: 'dust', cell: 0 });
}

// ---------- a repair needs its tool, and the astronaut has to be there ----------
{
  const g = fresh();
  g.break('dust');
  at(g, PLACES.panels[0]);
  g.act({ fix: 'dust', cell: 0 });
  assert.equal(g.faults.dust.cells[0], true, 'no brush on the belt: refused');
  kit(g, 'brush');
  g.act({ fix: 'dust', cell: 0 });
  assert.equal(g.faults.dust.cells[0], true, 'brushing from the locker: refused');
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

  g.break('wheel');
  at(g, g.rover);
  g.act({ fix: 'wheel', fit: true });
  assert.equal(g.faults.wheel.stage, 0, 'the old wheel has to come off first');
  g.act({ fix: 'wheel', pull: true });
  g.act({ fix: 'wheel', fit: true });
  assert.ok(g.faults.wheel, 'no tire: refused');
  kit(g, 'tire'); at(g, g.rover);
  g.act({ fix: 'wheel', fit: true });
  assert.ok(!g.faults.wheel && !g.belt.includes('tire') && !g.locker.includes('tire'), 'the tire is used up');
  run(g, CFG.tireRestockSeconds + 1);
  assert.ok(g.locker.includes('tire'), 'a new tire turns up in the locker');
}

// ---------- the switchboard ----------
{
  const g = fresh();
  g.break('board');
  at(g, PLACES.board);
  const cables = g.faults.board.cables;
  assert.equal(cables.filter(c => !c.seated).length, 3);
  const loose = cables.findIndex(c => !c.seated), full = cables.find(c => c.seated).socket;
  const wrong = [0, 1, 2, 3].find(s => s !== cables[loose].socket && s !== full);
  let o2 = g.oxygen;
  g.act({ fix: 'board', cable: loose, socket: full });
  assert.equal(g.oxygen, o2, 'a full socket is ignored');
  g.act({ fix: 'board', cable: loose, socket: wrong });
  assert.equal(g.oxygen, o2 - CFG.wrongPlug, 'a wrong socket costs oxygen');
  assert.equal(g.view('sci').wiring.length, 3, 'the Scientist sees where each loose cable goes');
  assert.ok(!JSON.stringify(g.view('astronaut').scene.board.filter(c => !c.seated)).match(/"socket":[0-9]/), 'the astronaut does not');
  assert.equal(g.view('sci').power.board, 25, 'board output falls with the cables out');
  cables.forEach((c, i) => g.act({ fix: 'board', cable: i, socket: c.socket }));
  assert.ok(!g.faults.board, 'no tool needed, just hands');
}

// ---------- power: battery, blackout, radio, generator ----------
{
  const hub = new Hub(new Game(rng));
  const g = hub.game;
  const seat = role => { const c = { got: [], send(d) { this.got.push(d); } }; hub.add(c); hub.message(c, JSON.stringify({ t: 'hello', role })); return c; };
  const astro = seat('astronaut'), ops = seat('ops');
  g.start(); g.script = [];
  kit(g, 'gen', 'brush');
  g.break('dust');
  run(g, CFG.batterySeconds - 2);
  assert.ok(!g.blackout && g.battery < 6, 'the battery lasts about 45 s');
  assert.equal(hub.silent(), false);
  run(g, 3);
  assert.ok(g.blackout && !g.powered, 'an empty battery blacks the base out');
  assert.ok(hub.silent());

  // Voice is dropped both ways.
  const heard = c => c.got.filter(d => typeof d !== 'string').length;
  hub.message(ops, new Uint8Array(64).buffer, true);
  hub.message(astro, new Uint8Array(64).buffer, true);
  await new Promise(r => setTimeout(r, CFG.delayMs + 200));
  assert.equal(heard(astro) + heard(ops), 0, 'no radio during a blackout');

  // Mission control gets static: nothing but the phase.
  for (const role of ['ops', 'tech', 'sci', 'all']) {
    const v = g.view(role);
    assert.equal(v.powered, false);
    for (const k of ['oxygen', 'timeLeft', 'belt', 'radar', 'rover', 'scene', 'power', 'leak', 'wiring', 'meteor', 'ev']) assert.ok(!(k in v), `${role} sees ${k} during a blackout`);
  }
  assert.equal(g.view('astronaut').scene.dark, true, 'the base goes dark for the astronaut');

  // The generator: 25 s of power, once.
  g.act({ gen: true });
  assert.ok(g.powered && g.blackout && !g.belt.includes('gen') && !g.locker.includes('gen'));
  assert.ok('power' in g.view('sci'));
  hub.message(ops, new Uint8Array(64).buffer, true);
  await new Promise(r => setTimeout(r, CFG.delayMs + 200));
  assert.equal(heard(astro), 1, 'the radio is back on generator power');
  const b = g.battery;
  run(g, CFG.generatorSeconds - 1);
  assert.ok(g.powered && g.battery === b, 'it does not charge the battery');
  run(g, 2);
  assert.ok(!g.powered, 'and it runs out');
  g.act({ gen: true });
  assert.ok(!g.powered, 'it only works once');

  // The astronaut can fix it alone, in the dark.
  at(g, PLACES.panels[0]);
  for (let c = 0; c < DUST_CELLS; c++) g.act({ fix: 'dust', cell: c });
  run(g, 1);
  assert.ok(g.blackout, 'still dark until the battery is above 10%');
  run(g, CFG.rechargeSeconds * CFG.blackoutEndsAt / 100 + 0.5);
  assert.ok(!g.blackout && g.powered, 'fixing the fault ends the blackout');
  run(g, CFG.rechargeSeconds);
  assert.equal(g.battery, 100);
}

// ---------- rover, radar, meteors ----------
{
  const g = fresh();
  g.rover.throttle = 1;
  const z0 = g.rover.z;
  run(g, 1);
  assert.notEqual(g.rover.z, z0);
  g.break('wheel');
  const z1 = g.rover.z;
  g.rover.throttle = 1; run(g, 1);
  assert.equal(g.rover.z, z1, 'a broken wheel stops the rover');

  g.fire({ ev: 'meteor', after: ['dust', 'hull'] });
  let v = g.view('tech');
  assert.equal(v.radar, false);
  assert.ok(!('meteor' in v), 'no radar, no meteor warning');
  assert.ok(v.rover && v.scene, 'the rover camera still works');
  assert.ok(!('meteor' in g.view('sci')) && !('meteor' in g.view('ops')), 'only the Technician ever gets the warning');
  assert.equal(g.view('astronaut').scene.meteor, null, 'the astronaut sees nothing until rocks fall');

  // Fix the wheel: the warning appears.
  at(g, g.rover); g.act({ fix: 'wheel', pull: true }); kit(g, 'tire'); at(g, g.rover); g.act({ fix: 'wheel', fit: true });
  v = g.view('tech');
  assert.ok(v.radar && v.meteor.eta > 0 && !v.meteor.falling);

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
  assert.ok(g.faults.dust && g.faults.hull && !g.meteor, 'the shower leaves its damage behind');
  assert.equal(g.view('sci').leak, true);
  assert.equal(g.view('sci').drain, CFG.leakMultiplier * 2 - 1, 'the hull and the suit both leaking: five times');

  // Cover: the canopy, or crouched beside the rover.
  const rover = { x: 10, z: 10 };
  assert.equal(sheltered({ x: 0, z: 4, h: 1.7 }, rover), true, 'under the canopy');
  assert.equal(sheltered({ x: 11, z: 10, h: 1.7 }, rover), false, 'standing beside the rover');
  assert.equal(sheltered({ x: 11, z: 10, h: 0.9 }, rover), true, 'crouched beside the rover');
  assert.equal(sheltered({ x: 15, z: 10, h: 0.9 }, rover), false, 'crouched in the open');
  const g2 = fresh();
  at(g2, { x: 0, z: 4 });
  g2.fire({ ev: 'meteor' });
  run(g2, CFG.meteorWarnSeconds + CFG.meteorSeconds + 1);
  assert.ok(!g2.faults.suit && g2.stats.hits === 0 && g2.faults.dust, 'under cover: no hit, but the panels are dusty');
}

// ---------- who sees what ----------
{
  const g = fresh();
  for (const t of ['dust', 'board', 'hull', 'suit']) g.break(t);
  const only = (role, allowed) => { for (const k of Object.keys(g.view(role))) assert.ok(allowed.includes(k), `${role} sees ${k}`); };
  const common = ['t', 'n', 'phase', 'mode', 'crew', 'score', 'result', 'powered', 'ev', 'timeLeft', 'oxygen', 'o2Max'];
  only('astronaut', [...common, 'belt', 'locker', 'scene', 'suit', 'rover']);
  only('ops', [...common, 'belt', 'locker']);
  only('tech', [...common, 'radar', 'rover', 'scene', 'astro', 'meteor']);
  only('sci', [...common, 'power', 'leak', 'drain', 'wiring']);
  assert.ok(!('text' in g.view('ops').ev), 'nobody is told in words what broke');
  // The leak lamp does not say where.
  assert.equal(JSON.stringify(g.view('sci')).includes('hull'), false);
  assert.equal(JSON.stringify(g.view('sci')).includes('suit'), false);
}

// ---------- the demo mission, played well, is a win ----------
{
  const g = new Game(rng);
  g.start();
  let carrying = '';
  const plan = () => {
    // The order a good crew would pick: power, then the rover, then leaks.
    const f = g.faults;
    if (f.suit && g.oxygen < 40) return 'suit';
    return ['dust', 'board', 'wheel', 'hull', 'suit'].find(t => f[t]);
  };
  let busy = 0, sawMeteor = false;
  for (let t = 0; t < CFG.roundSeconds * 10 + 50 && g.phase === 'run'; t++) {
    g.tick(0.1);
    if (g.meteor) sawMeteor = true;
    if (g.meteor && g.elapsed > g.meteor.start - 6) { at(g, { x: 0, z: 4 }); continue; } // the Technician called it: take cover
    if (busy-- > 0) continue;
    const job = plan();
    if (!job) continue;
    const tool = { dust: 'brush', wheel: 'tire', hull: 'welder', suit: 'patch' }[job];
    if (tool && !g.belt.includes(tool)) { kit(g, tool); carrying = tool; busy = 60; continue; } // a trip to the locker: 6 s
    if (job === 'dust') { at(g, PLACES.panels[1]); for (let c = 0; c < DUST_CELLS; c++) g.act({ fix: 'dust', cell: c }); }
    if (job === 'board') { at(g, PLACES.board); g.faults.board.cables.forEach((c, i) => g.act({ fix: 'board', cable: i, socket: c.socket })); }
    if (job === 'wheel') { at(g, g.rover); g.act({ fix: 'wheel', pull: true }); g.act({ fix: 'wheel', fit: true }); }
    if (job === 'hull') { at(g, PLACES.cracks[g.faults.hull.spot]); for (let p = 0; p < CRACK_POINTS; p++) g.act({ fix: 'hull', point: p }); }
    if (job === 'suit') g.act({ fix: 'suit' });
    busy = 80; // and 8 s to walk there and do it
  }
  assert.equal(g.phase, 'results');
  assert.equal(g.result.won, true, g.result.reason);
  assert.ok(sawMeteor);
  assert.equal(g.result.fixed, 6, 'dust, wheel, then dust + hull + board, then the suit, and nothing left broken');
  assert.equal(g.result.hits, 0);
  assert.equal(g.result.blackouts, 0);
  assert.ok(SCRIPTS.demo.length >= 4 && carrying);
  console.log(`good crew, demo mission: fixed ${g.result.fixed}, score ${g.score}, oxygen left ${Math.round(g.oxygen)}`);
}

// ---------- a crew that does nothing loses, and it cascades on the way ----------
{
  const g = new Game(rng);
  g.start();
  run(g, CFG.roundSeconds + 5);
  assert.equal(g.result.won, false);
  assert.ok(g.result.blackouts >= 1 && g.result.hits === 1);
  console.log(`idle crew, demo mission: lost after ${Math.round(g.elapsed)} s, blackouts ${g.result.blackouts}, meteor hits ${g.result.hits}`);
}

// ---------- hiding is not a plan: take cover but fix nothing, and the leaks finish you ----------
{
  const g = new Game(rng);
  g.start();
  at(g, { x: 0, z: 4 }); // under the canopy for the whole shift
  run(g, CFG.roundSeconds + 5);
  assert.equal(g.result.won, false, 'an unrepaired hull breach must not be survivable');
  assert.equal(g.result.hits, 0);
}

// ---------- free play keeps throwing things, never two of a kind ----------
{
  const g = new Game(rng);
  assert.equal(g.setMode('nope'), false);
  assert.equal(g.setMode('free'), true);
  g.start();
  g.oxygen = 1e6; // long enough to watch the director
  let most = 0, showers = 0, last = null;
  for (let t = 0; t < CFG.roundSeconds * 10 - 20; t++) {
    g.tick(0.1);
    most = Math.max(most, Object.keys(g.faults).length);
    if (g.meteor && g.meteor !== last) { last = g.meteor; showers++; }
  }
  assert.ok(most >= 3 && showers >= 2, `free play: ${most} faults at once, ${showers} showers`);
  g.reset();
  assert.equal(g.mode, 'free', 'the mode survives "Fly again"');
  for (const t of Object.keys(TOOLS)) assert.ok(g.locker.includes(t));
}
// ---------- the debrief times out, and the lobby remembers how it went ----------
{
  const g = new Game(rng);
  assert.equal(g.setMode('free'), true);
  g.start();
  g.score = 300;
  g.end(true, 'test');
  assert.equal(g.phase, 'results');
  assert.equal(g.debriefLeft, CFG.debriefSeconds);
  assert.equal(g.view('ops').debriefLeft, CFG.debriefSeconds, 'the consoles get the seconds left');
  assert.equal(g.view('ops').last, undefined, 'last is a lobby thing');
  for (let i = 0; i < (CFG.debriefSeconds - 1) * 10; i++) g.tick(0.1);
  assert.equal(g.phase, 'results', 'not before the time is up');
  for (let i = 0; i < 20; i++) g.tick(0.1);
  assert.equal(g.phase, 'lobby', 'an unattended debrief goes back to the lobby');
  assert.equal(g.mode, 'free', 'and keeps the mode');
  assert.deepEqual(g.last, { won: true, score: g.last.score, mode: 'free' });
  assert.ok(g.last.score >= 300, 'the score, bonus included');
  assert.deepEqual(g.view('astronaut').last, g.last, 'the READY board gets the last mission');
  g.reset();
  assert.ok(g.last, 'a second reset from the lobby keeps it');
  g.start();
  assert.equal(g.last, null, 'a new mission clears it');
  assert.equal(g.view('astronaut').last, undefined);
}
console.log('all game tests passed');
