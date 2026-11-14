// Plain-Node checks of the game rules: npm test
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { CFG } from '../client/shared/config.js';
import { solveWires, breakerOrder } from '../client/shared/rules.js';

let seed = 42;
const rng = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// Wire rules
assert.equal(solveWires({ colors: ['red', 'yellow', 'blue', 'yellow'], serial: 'A1B2', pressure: 'HIGH' }), 3);
assert.equal(solveWires({ colors: ['red', 'white', 'red', 'blue'], serial: 'A1B3', pressure: 'LOW' }), 0);
assert.equal(solveWires({ colors: ['red', 'white', 'white', 'yellow'], serial: 'A1B2', pressure: 'LOW' }), 1);
assert.equal(solveWires({ colors: ['red', 'blue', 'white', 'white'], serial: 'A1B2', pressure: 'LOW' }), 3);

// Breaker rules: the shorted one stays off, battery decides the direction
assert.deepEqual(breakerOrder({ tripped: [1, 3, 4], fault: 3, battery: 37 }), [4, 1]);
assert.deepEqual(breakerOrder({ tripped: [1, 3, 4], fault: 3, battery: 72 }), [1, 4]);
assert.deepEqual(breakerOrder({ tripped: [0, 2, 5], fault: 0, battery: 50 }), [2, 5]);

// Loadout: mass limit is enforced
const g = new Game(rng);
assert.equal(g.setLoadout('fast', ['beacon', 'lamp', 'o2']), false, 'over capacity');
assert.equal(g.setLoadout('fast', ['beacon', 'o2']), true);
assert.equal(g.setLoadout('heavy', CFG.defaultGear), true);

// A perfect crew: solve every alarm using the hidden answers. Also check nothing leaks to the astronaut.
g.start();
assert.equal(g.phase, 'run');
const seen = new Set();
for (let t = 0; t < CFG.roundSeconds * 10 + 50 && g.phase === 'run'; t++) {
  g.tick(0.1);
  const astro = JSON.stringify(g.view('astronaut'));
  for (const secret of ['"answer"', '"pressure"', '"target"', '"confirm"', '"keep"', '"fault"', '"battery"', '"order"']) assert.ok(!astro.includes(secret), 'astronaut view leaks ' + secret);
  const ops = g.view('ops'), tech = g.view('tech'), sci = g.view('sci');
  for (const is of ops.issues) assert.ok(!('pressure' in is) && !('target' in is) && !('value' in is) && !('fault' in is) && !('battery' in is));
  for (const is of tech.issues) assert.ok(!('pressure' in is) && !('target' in is) && !('confirm' in is) && !('battery' in is));
  for (const is of sci.issues) assert.ok(!('value' in is) && !('confirm' in is) && !('fault' in is));
  for (const v of [ops, tech, sci]) assert.ok(!JSON.stringify(v).includes('"order"'), 'the breaker answer is never sent');

  const is = g.issues[0];
  if (!is || is.left > CFG.issueSeconds - 6) continue; // take 6 s per fix
  seen.add(is.type);
  const d = is.d;
  if (is.type === 'wires') g.act(is.id, { cut: d.answer });
  if (is.type === 'freq') { while (d.value !== d.target) g.act(is.id, { d: d.value < d.target ? 1 : -1 }); g.act(is.id, { lock: true }); }
  if (is.type === 'patch') {
    g.act(is.id, { key: '1' });
    assert.equal(d.entered, '', 'keypad is dead before the patch');
    assert.match(g.patch('zzzz'), /NO MATCH/);
    assert.match(g.patch(d.err.toLowerCase().split('').join('-')), /PATCH ACCEPTED/);
    assert.equal(g.view('ops').issues.find(i => i.id === is.id).confirm, d.confirm);
    for (const k of d.confirm) g.act(is.id, { key: k });
  }
  if (is.type === 'power') d.order.forEach(b => g.act(is.id, { breaker: b }));
  if (is.type === 'drill') d.rocks.forEach((r, i) => { if (!r.keep) g.act(is.id, { rock: i }); });
}
assert.equal(g.phase, 'results');
assert.equal(g.result.won, true);
assert.equal(g.result.missed, 0);
assert.equal(g.result.mistakes, 0);
assert.ok(g.result.fixed >= 5, 'expected at least 5 fixes, got ' + g.result.fixed);
assert.equal(seen.size, 5, 'all five minigames appeared');
console.log(`perfect crew: fixed ${g.result.fixed}, score ${g.score}, oxygen left ${Math.round(g.oxygen)}`);

// A crew that does nothing runs out of oxygen.
g.reset();
assert.deepEqual(g.loadout.gear, CFG.defaultGear, 'loadout survives reset');
g.setLoadout('heavy', []);
g.start();
for (let t = 0; t < 3000 && g.phase === 'run'; t++) g.tick(0.1);
assert.equal(g.result.won, false);
console.log(`idle crew: lost after ${Math.round(g.elapsed)} s, missed ${g.result.missed}`);

// Mistakes: the diagnostic kit absorbs the first, the second costs oxygen.
g.reset(); g.setLoadout('heavy', ['diag']); g.start();
while (!g.issues.length) g.tick(0.1);
const w = g.issues[0]; assert.equal(w.type, 'wires');
const wrong = [0, 1, 2, 3].filter(i => i !== w.d.answer);
let o2 = g.oxygen; g.act(w.id, { cut: wrong[0] }); assert.equal(g.oxygen, o2);
g.act(w.id, { cut: wrong[1] }); assert.equal(g.oxygen, o2 - CFG.mistakePenalty);
g.act(w.id, { cut: wrong[1] }); assert.equal(g.oxygen, o2 - CFG.mistakePenalty, 'same wire twice is ignored');
g.act(999, { cut: 0 }); g.act(w.id, null); g.act(w.id, { cut: 'x' });

// Power outage: wrong breakers cost oxygen and change nothing, the right two in order fix it.
g.reset(); g.setLoadout('heavy', []); g.start();
g.issues = [{ id: 77, type: 'power', left: 50, total: 50, d: { tripped: [1, 3, 4], fault: 3, battery: 37, reset: [], order: [4, 1] } }];
o2 = g.oxygen;
g.act(77, { breaker: 3 }); assert.equal(g.oxygen, o2 - CFG.mistakePenalty, 'shorted breaker');
g.act(77, { breaker: 0 }); assert.equal(g.oxygen, o2 - 2 * CFG.mistakePenalty, 'breaker that was not tripped');
g.act(77, { breaker: 1 }); assert.equal(g.oxygen, o2 - 3 * CFG.mistakePenalty, 'wrong order');
g.act(77, { breaker: 9 }); g.act(77, { breaker: 'x' });
assert.deepEqual(g.issues[0].d.reset, []);
g.act(77, { breaker: 4 }); assert.deepEqual(g.view('astronaut').issues[0].reset, [4]);
g.act(77, { breaker: 4 }); assert.equal(g.oxygen, o2 - 3 * CFG.mistakePenalty, 'same breaker twice is ignored');
g.act(77, { breaker: 1 }); assert.equal(g.issues.length, 0, 'power restored');
assert.equal(g.stats.fixed, 1);
console.log('all game tests passed');
