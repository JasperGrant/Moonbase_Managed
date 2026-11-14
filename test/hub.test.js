// Plain-Node checks of the lobby: seats, ready flags, the countdown and the auto start.
import assert from 'node:assert/strict';
import { Hub } from '../server/hub.js';
import { CFG } from '../client/shared/config.js';

const S = CFG.lobby.countdownSeconds;
function setup(opts) {
  const hub = new Hub(undefined, opts);
  const join = role => {
    const c = { got: [], send(m) { this.got.push(m); } };
    hub.add(c);
    hub.message(c, JSON.stringify({ t: 'hello', role }), false);
    return c;
  };
  const say = (c, m) => hub.message(c, JSON.stringify(m), false);
  // Advance the lobby by whole seconds without waiting in real time.
  const wait = sec => { for (let i = 0; i < sec * 10; i++) { hub.lobbyTick(0.1); hub.game.tick(0.1); } };
  return { hub, join, say, wait };
}

// Nobody connected: every seat open, nobody ready.
{
  const { hub } = setup();
  assert.deepEqual(hub.seats().crew, []);
  assert.deepEqual(hub.seats().ready, []);
  assert.equal(hub.seats().countdown, null);
}

// Four players: the mission waits for all four, then starts after the countdown.
{
  const { hub, join, say, wait } = setup();
  const [a, o, t, s] = ['astronaut', 'ops', 'tech', 'sci'].map(join);
  const second = join('tech');
  assert.ok(second.got.some(m => m.includes('"taken"')), 'a second person cannot take a held seat');
  assert.equal(second.role, null);

  for (const c of [a, o, t]) say(c, { t: 'ready', on: true });
  wait(S + 1);
  assert.equal(hub.game.phase, 'lobby', 'three ready and one not: no start');

  say(o, { t: 'start' });
  assert.equal(hub.game.phase, 'lobby', 'Mission Ops cannot start alone any more');

  say(s, { t: 'ready', on: true });
  wait(0.2);
  assert.ok(hub.countdown > 0 && hub.countdown <= S, 'countdown running');
  say(t, { t: 'ready', on: false });
  assert.equal(hub.countdown, null, 'un-readying cancels the countdown');
  wait(S + 1);
  assert.equal(hub.game.phase, 'lobby');

  say(t, { t: 'ready', on: true });
  wait(S - 0.5);
  assert.equal(hub.game.phase, 'lobby', 'not before the countdown ends');
  wait(1);
  assert.equal(hub.game.phase, 'run', 'starts when the countdown ends');
  assert.deepEqual(hub.seats().ready, [], 'ready flags are cleared at the start');

  say(t, { t: 'ready', on: true });
  assert.deepEqual(hub.seats().ready, [], 'ready is ignored outside the lobby');

  // "Fly again": seats stay, nobody is ready.
  hub.game.end(true, 'test');
  say(o, { t: 'reset' });
  assert.equal(hub.game.phase, 'lobby');
  assert.equal(hub.crew().length, 4);
  assert.deepEqual(hub.seats().ready, []);
}

// Leaving clears that seat's ready flag and cancels the countdown.
{
  const { hub, join, say, wait } = setup();
  const cs = ['astronaut', 'ops', 'tech', 'sci'].map(join);
  for (const c of cs) say(c, { t: 'ready', on: true });
  wait(1);
  assert.ok(hub.countdown !== null);
  hub.remove(cs[3]);
  assert.equal(hub.countdown, null);
  assert.ok(!hub.seats().ready.includes('sci'));
  assert.ok(!hub.crew().includes('sci'));
  wait(S + 1);
  assert.equal(hub.game.phase, 'lobby');
}

// 2-player mode: the astronaut plus one Mission Control player is a full crew.
{
  const { hub, join, say, wait } = setup();
  const a = join('astronaut'), all = join('all');
  assert.ok(join('sci').role === null, 'Mission Control holds the Scientist seat');
  say(a, { t: 'ready', on: true }); say(all, { t: 'ready', on: true });
  wait(S + 0.5);
  assert.equal(hub.game.phase, 'run');
}

// The state every seat receives carries ready and countdown.
{
  const { hub, join, say } = setup();
  const a = join('astronaut');
  say(a, { t: 'ready', on: true });
  hub.tick();
  const st = JSON.parse(a.got.at(-1));
  assert.deepEqual(st.ready, ['astronaut']);
  assert.ok('countdown' in st);
}

// Testing alone: with requireFullCrew off, one ready player starts the mission.
{
  const { hub, join, say, wait } = setup({ requireFullCrew: false });
  const o = join('ops');
  say(o, { t: 'ready', on: true });
  wait(S + 0.5);
  assert.equal(hub.game.phase, 'run');
}

console.log('all lobby tests passed');
