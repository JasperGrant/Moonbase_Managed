# Spec: the end of a mission, and getting back to the lobby

When a mission ends, the crew is stuck in it. The astronaut is never clearly told whether the mission passed or failed, and has no way back to the READY board. On Mission Control, only Mission Ops can leave the results screen. This spec fixes both sides so that, at the end of every mission, each player sees **MISSION COMPLETE** or **MISSION FAILED** and reaches the ready-up screen with one action.

Read [CLAUDE.md](../CLAUDE.md), [DESIGN.md](DESIGN.md) and [SPEC-v2.md](SPEC-v2.md) first. The lobby stays off limits for restyling: nothing here changes how it looks.

## What happens today (the bug)

The server goes `run → results` when the clock runs out (won) or oxygen reaches zero (lost) (`Game.end()` in `server/game.js`). After that:

| Who | What they get | Why they are stuck |
| --- | --- | --- |
| **Server** | `phase: 'results'` stays forever. | Only a `reset` from Ops/All or the admin page goes back to the lobby. Nothing times out. |
| **Astronaut (headset)** | The `end` chime (the same rising tones for a win and a loss), and a small tick or cross on the cuff's clock dial, which shows only while the wrist is raised and read (`status()` in `client/astronaut.js`). The world just goes quiet. | Nothing says the mission is over. The cuff's EXIT button calls `session.end()`, which drops them out of VR onto the 2D gate ("Mission over. Mission Ops can fly again."), with no READY board and no way to get back into the mission flow from inside the headset. |
| **Astronaut, after Ops presses Fly again** | The READY board appears at the spawn point. | The rig is only moved back to spawn when a **run starts** (`lastPhase` handler, `astronaut.js` ~l.723). If the mission ended while they were in the habitat or out at the rover, the board is somewhere they cannot see. Leaving and re-entering VR does not move them either: `sessionstart` does not reset `where` or the rig. |
| **Mission Ops** | The results panel with a **Fly again** button (`renderResults` in `client/console.js`). | Works, but it is the only way out for the whole crew. |
| **Technician, Scientist** | The results panel with "Mission Ops can send the crew back to the lobby for another run." | No button. They have to wait for Ops, or reload the page (which drops their seat). |

## The fix in one paragraph

Each player leaves the debrief by themselves, with one action: the **EXIT button on the astronaut's cuff**, and a **BACK TO LOBBY** button on every Mission Control seat. The first seat to leave sends the server back to the lobby, and the server also returns there on its own after a timeout. Every other player keeps their own debrief on screen until they leave it, so nobody's result is pulled away mid-read. The astronaut is told the result clearly with a sound, a haptic pulse and a full-face tick or cross on the cuff, and leaving the debrief puts them in front of the READY board without taking the headset out of VR.

## 1. Server (`server/game.js`, `server/hub.js`, `client/shared/config.js`)

### 1.1 Any seat can end the debrief

- New client message `{ t: 'lobby' }`. The hub accepts it from **any seated role**, astronaut included, and **only while `game.phase === 'results'`**. It calls `game.reset()`, clears `ready` and `countdown`, the same as a `reset` does today.
- It is ignored during `run` (no accidental scrub mid-mission) and in `lobby` (a no-op).
- `reset` from Ops/All and the admin commands keep working as they do now.
- In `results` the light delay is already 0 (`lag()`) and `silent()` is false, so the message is handled at once. Keep it that way.

### 1.2 The results phase times out

- New `CFG.debriefSeconds = 90` in `client/shared/config.js`.
- `Game.end()` sets `this.debriefLeft = CFG.debriefSeconds`. `Game.tick(dt)` counts it down while `phase === 'results'` and calls `reset()` at zero. An unattended room returns to the lobby on its own, for the venue.
- `debriefLeft` goes out in the view so the consoles can show it (see 3.2).

### 1.3 Remember the last mission

- `reset()` keeps a small `this.last = { won, score, mode }` when it is called from `results` (it already keeps `mode`). It is cleared by `start()`.
- `view()` sends `last` while in the lobby. It is used for one line on the astronaut's READY board (2.5). The full log is **not** re-sent: each client keeps its own copy of the results it saw (2.1, 3.1).

## 2. Astronaut (`client/astronaut.js`, `client/arm.js`, `client/voice.js`)

### 2.1 The debrief is client-side state

- `debrief = { won, score }` is set when this client sees the phase go `run → results`, or when it first connects into a `results` phase. It is cleared when the astronaut presses EXIT (2.3) or when a new run starts.
- If the server goes back to the lobby while the astronaut is still in debrief (Ops pressed first, or the timeout), **the astronaut is not moved**. The cuff stays in debrief until they press EXIT. The lobby already shows them as STANDING BY, so the countdown cannot start without them.

### 2.2 Telling them the result

All of this fires once, on the `end` event. Nothing on the visor.

| Channel | Won | Lost |
| --- | --- | --- |
| **Sound** (`voice.js`) | New `won` sting: the current rising triad, played from the wrist. | New `lost` sting: a slower falling minor triad (G, E♭, C), sine, lower and quieter. |
| **Haptics** | Three short pulses on the left (cuff) hand. | One long pulse on both hands. |
| **Cuff face** (`arm.js`) | The whole face becomes the debrief face (below). | Same, with a cross. |
| **Cuff reminder** | Until the cuff has been read for 1 s (`gaugesReadable`), a soft two-tone wrist-watch beep from the cuff every 6 s, so they know where to look. | Same. |

**The debrief face** replaces the gauges on the cuff while `debrief` is set. It stays icons only, as the cuff is now: a large tick in `lamp-green` or a cross in `lamp-red` across the middle of the cream `dial` face, in the same stroke style as the current small tick and cross, and an engraved arrow pointing at the EXIT plate (toward the elbow). No words, no score: the score is on Mission Control, and Ops reads it out over the radio. `arm.draw()` gets `info.status = 'won' | 'lost'` and a new `info.debrief = true`; `arm.shown` reports `debrief: true` for the tests.

**The EXIT lamp invites the press:** while `debrief` is set, the jewel in the EXIT cap blinks `lamp-amber` at 1 Hz (the DESIGN.md caution colour, under 2 Hz), instead of its dark `redOff`. While a finger is on it, it warms to `lamp-red` as it does now.

On a laptop (desk mode) the cuff swings up by itself for the debrief (`arm.update(dt, keyed || !!debrief)`), so the result is on screen without holding Tab.

### 2.3 EXIT on the cuff: what it does in each phase

The button, its 0.6 s hold, the click and the relay clunk stay as they are. What it does now depends on the phase:

| When | EXIT does |
| --- | --- |
| **In debrief** (`results`, or `lobby` with `debrief` still set) | **Back to the lobby, still in VR.** Sends `{ t: 'lobby' }` if the phase is still `results`, clears `debrief`, and runs a fade (the existing `shade`/`passage`, with the `hatch` sound swapped for `relay`) that ends with the astronaut **outside, at spawn, facing the READY board**. |
| `run` | Unchanged: ends the VR session (`session.end()`). |
| `lobby`, no debrief | Unchanged: ends the VR session, for taking the headset off. |

After a debrief EXIT, the button **only re-arms once the finger has left it** (`exitGone` stays true until `near` is false), so holding on does not go on to end the session.

On a laptop, **hold X for 0.6 s** does the same as the cuff button (Esc is taken by pointer lock). Add it to the Controls list in `astronaut.html`.

### 2.4 Back at the READY board, from wherever they were

Pull the "go to spawn" code out of the `run` branch of the `lastPhase` handler into one function, `toBoard()`: clear `passage` and `shade`, `place('out')` if they are inside, set the rig to `CFG.spawn` with `rotation.y = 0` (the board is 1.7 m in front). Call it:

1. at the end of the debrief EXIT fade (2.3),
2. when a run starts (as now),
3. on `sessionstart` while the phase is `lobby` and there is no debrief. This fixes re-entering VR and finding yourself where you left off, with the board out of sight.

### 2.5 The READY board

- Under "Pull the trigger here when set", one line for the last mission while `state.last` is set: a small tick or cross and the score in Nixie digits (`nixie()` from `client/shared/palette.js`). The board is in the world, not the lobby, so it may use the period look.
- While drawing it, move `drawBoard()` onto `PAL` and `FONT`. It still uses the DESIGN.md "Don't" colours (`#58e08a`, `#ffb84a`, `#05080a`): use `lamp-green`, `lamp-amber` and `bakelite`.

## 3. Mission Control (`client/console.js`, `client/style.css`)

### 3.1 The debrief is client-side here too

- When this console sees `run → results`, it keeps a copy of that results state (`result`, `score`, `log`) as `debrief`. `render()` shows the results section while `debrief` is set, **whatever the server phase is**, and the lobby once it is cleared. Today the `shown` / `lobby.show()` logic keys off `s.phase`; key it off `debrief ? 'results' : s.phase`.
- `debrief` is cleared by this seat's BACK TO LOBBY button, or by a new run starting.

### 3.2 BACK TO LOBBY on every seat

- The results panel ends with a **BACK TO LOBBY** button for **every seat**, Ops, Technician, Scientist and the 2-player console alike. It replaces Fly again and the "Mission Ops can send the crew back" hint. Engraved-style label, period button style already in `style.css` (`.period #results button`).
- Click, or Enter, sends `{ t: 'lobby' }` if the phase is still `results`, then clears `debrief` and shows the lobby. Play the `relay` sound.
- One line of hint beside it: `YOUR SEAT RETURNS. THE CREW CAN KEEP READING.`
- A jewel lamp on the panel, `CREW IN LOBBY`, lights `lamp-green` once the server is in the lobby (someone else left first, or the timeout). While still in `results`, a small Nixie counter beside it shows `debriefLeft` in seconds.
- Mission Ops picks the mission in the lobby, as now, so "fly the same one again" is just pressing Ready: `reset()` keeps the mode.

### 3.3 The verdict

The verdict (`MISSION COMPLETE` / `MISSION FAILED`) stays where it is. Play the same `won` / `lost` sting as the astronaut instead of the shared `end` chime, so the room hears which it was.

## 4. The lobby (text only)

`client/lobby.js` keeps its look. One string changes, because it is now wrong: the locked status bar during `results`, "Mission over. Mission Ops can fly again.", becomes "Mission over. Any seat can return to the lobby." No markup, style or SVG changes.

## 5. Out of scope

- **Scrubbing a mission mid-run.** Nobody can abort a running mission except by reset from Ops (no button) or the admin page. Worth a follow-up: a guarded SCRUB switch on the Ops console that ends the run as a loss, "Mission scrubbed". Not part of this fix.
- The admin page: `start` and `reset` keep working, and the admin view can show `debriefLeft`; no other change.

## 6. Tests and checks

**`npm test`**

- `game.test.js`: a mission that ends sets `debriefLeft`; ticking past `CFG.debriefSeconds` returns to `lobby`, keeps `mode`, sets `last = { won, score, mode }`; `start()` clears `last`.
- `hub.test.js`: in `results`, `{ t: 'lobby' }` from `tech`, from `sci` and from `astronaut` each return to the lobby with `ready` empty; during `run` it is ignored from every seat; `ready` sent during `results` is still ignored.

**`npm run smoke:shots`** (`test/smoke.mjs`, after the existing results shot)

- Every console shows BACK TO LOBBY. The Technician presses it: the Technician sees the lobby, Ops still sees the results with `CREW IN LOBBY` lit. Ops presses it: Ops sees the lobby.
- Shots: `mission-control-results` (button and lamp off), `mission-control-results-crew-in-lobby`.

**`npm run vr:shots`** (`test/vr.mjs`)

- End a mission with the astronaut **inside the habitat**. Check `arm.shown.debrief === true` and `status` is `won` / `lost`, and that the `won` / `lost` sting played.
- Press EXIT with the fake fingertip for 0.6 s: the phase goes to `lobby`, `where === 'out'`, the rig is at spawn, the READY board is visible and in view, and **the XR session is still presenting**.
- Keep holding: the session does not end. Lift and press again: it ends.
- End a mission, let Ops send the crew to the lobby first: the astronaut stays where they are with the debrief face until they press EXIT.
- Shots: `astronaut-debrief-won`, `astronaut-debrief-lost` (the cuff, raised), `astronaut-board-last-mission`. Check them against DESIGN.md (palette, the blinking lamp not blown out) and add `docs/astronaut-debrief.png`.

## 7. Done when

- At the end of every mission, all four players know whether it passed or failed without being told by someone else.
- Every player gets back to the ready-up screen with one action, in any order, and the astronaut never has to leave VR or walk to find the READY board.
- An unattended room is back in the lobby within 90 s.
- `npm test`, `npm run smoke:shots` and `npm run vr:shots` pass, and the PR says what was checked.
