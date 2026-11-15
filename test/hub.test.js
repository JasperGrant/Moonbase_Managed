// Plain-Node checks of the lobby: 2 or 4 players, seats, ready flags, the countdown and the auto start.
import assert from 'node:assert/strict';
import { Hub } from '../server/hub.js';
import { CFG, PLAYERS } from '../client/shared/config.js';

const S = CFG.lobby.countdownSeconds;
// players: the game chosen on the landing page before anyone joins (4 unless said); null for none yet.
function setup(opts = {}) {
  let t = 0;
  const hub = new Hub(undefined, { now: () => t, ...opts });
  const players = 'players' in opts ? opts.players : 4;
  if (players) hub.choosePlayers(players);
  const join = (role, extra = {}) => {
    const c = { got: [], closed: false, send(m) { this.got.push(m); }, close() { this.closed = true; } };
    hub.add(c);
    hub.message(c, JSON.stringify({ t: 'hello', role, ...extra }), false);
    return c;
  };
  const say = (c, m) => hub.message(c, JSON.stringify(m), false);
  // Advance the lobby by whole seconds without waiting in real time.
  const wait = sec => { for (let i = 0; i < sec * 10; i++) { hub.lobbyTick(0.1); hub.game.tick(0.1); } };
  const later = sec => { t += sec * 1000; }; // move the clock on, for the empty-game timeout
  return { hub, join, say, wait, later };
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

  say(a, { t: 'suited', on: true }); say(o, { t: 'ready', for: 'astronaut', on: true });
  for (const c of [o, t]) say(c, { t: 'ready', on: true });
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

  // "Fly again" is a reset: everyone goes back to the landing page to choose 2 or 4 players again.
  hub.game.end(true, 'test');
  say(o, { t: 'reset' });
  assert.equal(hub.game.phase, 'lobby');
  assert.equal(hub.players, null, 'the choice of 2 or 4 is forgotten');
  assert.equal(hub.crew().length, 0, 'every seat is freed');
  assert.ok([a, o, t, s].every(c => c.closed && c.got.some(m => m.includes('"home"'))), 'everyone is sent home');
  assert.deepEqual(hub.seats().ready, []);

  // Back to the lobby from the debrief: any seat, the astronaut included, and only from the results.
  const seat = { astronaut: a, ops: o, tech: t, sci: s };
  for (const r of ['tech', 'sci', 'astronaut', 'ops']) {
    hub.game.start();
    say(seat[r], { t: 'lobby' });
    assert.equal(hub.game.phase, 'run', `${r}: "lobby" is ignored while the mission runs`);
    hub.game.end(false, 'test');
    say(seat[r], { t: 'ready', on: true });
    assert.deepEqual(hub.seats().ready, [], `${r}: ready is still ignored in the results`);
    say(seat[r], { t: 'lobby' });
    assert.equal(hub.game.phase, 'lobby', `${r} can take the crew back to the lobby`);
    assert.deepEqual(hub.seats().ready, []);
    say(seat[r], { t: 'lobby' });
    assert.equal(hub.game.phase, 'lobby', 'a second press in the lobby does nothing');
  }
}

// Leaving clears that seat's ready flag and cancels the countdown.
{
  const { hub, join, say, wait } = setup();
  const cs = ['astronaut', 'ops', 'tech', 'sci'].map(join);
  say(cs[0], { t: 'suited', on: true }); say(cs[1], { t: 'ready', for: 'astronaut', on: true });
  for (const c of cs.slice(1)) say(c, { t: 'ready', on: true });
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
  const { hub, join, say, wait } = setup({ players: 2 });
  const a = join('astronaut'), all = join('all');
  assert.ok(join('sci').role === null, 'a 2-player game has no Scientist seat');
  say(a, { t: 'suited', on: true }); say(all, { t: 'ready', for: 'astronaut', on: true }); say(all, { t: 'ready', on: true });
  wait(S + 0.5);
  assert.equal(hub.game.phase, 'run');
}

// The state every seat receives carries ready and countdown.
{
  const { hub, join, say } = setup();
  const a = join('astronaut'), o = join('ops');
  say(a, { t: 'suited', on: true }); say(o, { t: 'ready', for: 'astronaut', on: true });
  hub.tick();
  const st = JSON.parse(a.got.at(-1));
  assert.deepEqual(st.ready, ['astronaut']);
  assert.ok('countdown' in st && st.suited === true);
}

// Mission Ops calls the astronaut GO. The astronaut cannot ready themselves, nobody can ready an astronaut
// who is not suited up, only Ops (or the 2-player console) can do it, and taking the headset off stands them down.
{
  const { hub, join, say } = setup();
  const a = join('astronaut'), o = join('ops'), t = join('tech'), s = join('sci');
  say(a, { t: 'ready', on: true });
  assert.ok(!hub.seats().ready.includes('astronaut'), 'the astronaut cannot ready themselves');
  say(o, { t: 'ready', for: 'astronaut', on: true });
  assert.ok(!hub.seats().ready.includes('astronaut'), 'not before the headset is on');
  say(a, { t: 'suited', on: true });
  assert.equal(hub.seats().suited, true);
  for (const c of [t, s]) say(c, { t: 'ready', for: 'astronaut', on: true });
  assert.ok(!hub.seats().ready.includes('astronaut'), 'only Mission Ops calls the astronaut GO');
  say(o, { t: 'ready', for: 'astronaut', on: true });
  assert.ok(hub.seats().ready.includes('astronaut') && !hub.seats().ready.includes('ops'), 'Ops readied the astronaut, not themselves');
  say(a, { t: 'suited', on: false });
  assert.ok(!hub.seats().ready.includes('astronaut') && !hub.seats().suited, 'headset off: stood down');
  say(a, { t: 'suited', on: true }); say(o, { t: 'ready', for: 'astronaut', on: true });
  hub.remove(a);
  assert.ok(!hub.seats().suited && !hub.seats().ready.includes('astronaut'), 'the astronaut leaving clears both');
}

// Testing alone: with requireFullCrew off, one ready player starts the mission.
{
  const { hub, join, say, wait } = setup({ requireFullCrew: false, players: null });
  const o = join('ops');
  say(o, { t: 'ready', on: true });
  wait(S + 0.5);
  assert.equal(hub.game.phase, 'run');
}

// ---- 2 or 4 players ----

// Before anyone chooses, no seat can be taken: the page is sent to the landing page to choose.
{
  const { hub, join } = setup({ players: null });
  const a = join('astronaut');
  assert.equal(a.role, null);
  const m = JSON.parse(a.got.at(-1));
  assert.equal(m.t, 'refused'); assert.equal(m.why, 'nomode');
  assert.equal(hub.seats().players, null);
  assert.equal(hub.seats().seats, null);
}

// The first choice wins; a different one after it is ignored, and the answer says what was set.
{
  const { hub } = setup({ players: null });
  assert.equal(hub.choosePlayers(2).players, 2);
  assert.equal(hub.choosePlayers(4).players, 2, 'the second choice does not change the game');
  assert.deepEqual(hub.seats().seats, PLAYERS[2]);
  assert.equal(hub.choosePlayers('nonsense').players, 2);
  const { hub: h2 } = setup({ players: null });
  assert.equal(h2.choosePlayers(3).players, null, 'only 2 or 4');
}

// Each game refuses the other's seats, and says which game it is.
{
  const two = setup({ players: 2 });
  for (const r of ['ops', 'sci', 'tech']) {
    const c = two.join(r), m = JSON.parse(c.got.at(-1));
    assert.ok(c.role === null && m.t === 'refused' && m.why === 'wrongseat' && m.players === 2, `2 players: ${r} refused`);
  }
  assert.equal(two.join('all').role, 'all', '2 players: the Mission Operator seat');
  const four = setup({ players: 4 });
  const c = four.join('all');
  assert.ok(c.role === null && JSON.parse(c.got.at(-1)).why === 'wrongseat', '4 players: no all-in-one seat');
  for (const r of ['astronaut', 'ops', 'sci', 'tech']) assert.equal(four.join(r).role, r);
}

// A 2-player game starts with two ready seats; a 4-player game does not start with only those.
{
  const two = setup({ players: 2 });
  const [a, all] = ['astronaut', 'all'].map(two.join);
  two.say(a, { t: 'suited', on: true }); two.say(all, { t: 'ready', for: 'astronaut', on: true }); two.say(all, { t: 'ready', on: true });
  two.wait(S + 0.5);
  assert.equal(two.hub.game.phase, 'run');
  const four = setup({ players: 4 });
  const [a4, o4] = ['astronaut', 'ops'].map(four.join);
  four.say(a4, { t: 'suited', on: true }); four.say(o4, { t: 'ready', for: 'astronaut', on: true }); four.say(o4, { t: 'ready', on: true });
  four.wait(S + 1);
  assert.equal(four.hub.game.phase, 'lobby', '4 players: two ready is not enough');
}

// Every seat is told the game in its state.
{
  const { hub, join } = setup({ players: 2 });
  const a = join('astronaut');
  hub.tick();
  assert.equal(JSON.parse(a.got.at(-1)).players, 2);
}

// A chosen game nobody sits down in is forgotten after emptyModeSeconds; one with a seat held is not.
{
  const { hub, join, later } = setup({ players: 4 });
  later(CFG.lobby.emptyModeSeconds - 1);
  assert.equal(hub.seats().players, 4, 'not yet');
  later(2);
  assert.equal(hub.seats().players, null, 'empty for too long: forgotten');
  hub.choosePlayers(2);
  const a = join('astronaut');
  later(CFG.lobby.emptyModeSeconds * 3);
  assert.equal(hub.seats().players, 2, 'kept while someone is seated');
  hub.remove(a);
  later(CFG.lobby.emptyModeSeconds + 1);
  assert.equal(hub.seats().players, null, 'and forgotten once they have gone');
}

// The admin can clear the choice: everyone seated is sent home.
{
  const { hub, join, say } = setup({ players: 4 });
  const admin = join('admin'), o = join('ops');
  say(admin, { t: 'admin', cmd: 'clearplayers' });
  assert.equal(hub.players, null);
  assert.ok(o.closed && o.got.some(m => m.includes('"home"')));
  assert.ok(!admin.closed, 'the admin stays');
}

// ---- the admin console ----

// Kick frees a seat at once, tells the player, and lets someone else take it.
{
  const { hub, join, say } = setup();
  const admin = join('admin');
  assert.ok(admin.admin && !admin.role, 'admin is not a seat');
  const o = join('ops');
  assert.ok(!hub.crew().includes('admin'), 'admin does not count toward the crew');
  say(o, { t: 'ready', on: true });
  say(admin, { t: 'admin', cmd: 'kick', role: 'ops' });
  assert.ok(o.closed, 'the kicked connection is closed');
  assert.ok(o.got.some(m => m.includes('"kicked"')), 'the kicked player is told');
  assert.ok(!hub.crew().includes('ops'), 'the seat is free immediately');
  assert.ok(!hub.seats().ready.includes('ops'), 'and no longer ready');
  const again = join('ops');
  assert.equal(again.role, 'ops', 'someone else can take it');
}

// Start now ignores the ready-up; reset returns to the lobby; start from results is a restart.
{
  const { hub, join, say } = setup();
  const admin = join('admin'); join('astronaut');
  say(admin, { t: 'admin', cmd: 'start' });
  assert.equal(hub.game.phase, 'run', 'started with an incomplete, unready crew');
  say(admin, { t: 'admin', cmd: 'reset' });
  assert.equal(hub.game.phase, 'lobby');
  say(admin, { t: 'admin', cmd: 'start' });
  hub.game.end(false, 'test');
  assert.equal(hub.game.phase, 'results');
  say(admin, { t: 'admin', cmd: 'start' });
  assert.equal(hub.game.phase, 'run', 'start from results restarts');
}

// Kick everyone empties every seat.
{
  const { hub, join, say } = setup();
  const admin = join('admin'); const cs = ['astronaut', 'ops', 'tech', 'sci'].map(join);
  say(admin, { t: 'admin', cmd: 'kickall' });
  assert.deepEqual(hub.crew(), []);
  assert.ok(cs.every(c => c.closed));
  assert.ok(admin.admin && !admin.closed, 'the admin stays');
}

// Seat commands from a seat are ignored; the admin's state carries the seats and connections.
{
  const { hub, join, say } = setup();
  const o = join('ops'), admin = join('admin'); join('tech');
  say(o, { t: 'admin', cmd: 'kick', role: 'tech' });
  assert.ok(hub.crew().includes('tech'), 'a player cannot kick');
  hub.tick();
  const st = JSON.parse(admin.got.at(-1));
  assert.deepEqual(st.admin.seats.crew.sort(), ['ops', 'tech']);
  assert.equal(st.admin.connections.filter(c => c.role === 'admin').length, 1);
  assert.ok(!JSON.parse(o.got.at(-1)).admin, 'players do not get the admin block');
}

// With a key set, the admin console needs it.
{
  const { hub, join } = setup({ adminKey: 'moon' });
  const no = join('admin');
  assert.ok(!no.admin && no.got.some(m => m.includes('"denied"')), 'no key: denied');
  const wrong = join('admin', { key: 'mars' });
  assert.ok(!wrong.admin);
  const yes = join('admin', { key: 'moon' });
  assert.ok(yes.admin);
  assert.equal(hub.admins().length, 1);
}

console.log('all lobby and admin tests passed');
