# Spec: no switchboard, EXIT that works on the Quest, radio through a blackout, better dust

Four changes, in the order to build them. Each section says what changes for the players, where it lives in the code, and how to check it. Read [CLAUDE.md](../CLAUDE.md) and [DESIGN.md](DESIGN.md) first: everything new uses the palette names there.

| # | Change | Size |
| --- | --- | --- |
| 1 | Remove the switchboard fault and every trace of it | Medium: touches the server, three client pages and four tests |
| 2 | Make the EXIT button on the wrist cuff work in a real Quest | Small to medium: touch detection, plus a second way to press it |
| 3 | The radio and the consoles keep working in a blackout | Small, plus one design decision (what a blackout costs instead) |
| 4 | Brushing the solar panels looks and feels like brushing dust | Medium: a dust mask per panel, painted by the brush |

---

## 1. Remove the switchboard

### What the players see

There is no switchboard on the west wall of the hall and no "Tripped switchboard" fault. Dusty solar panels become the only power fault. The Scientist's POWER console loses the BOARD OUT dial and the wiring diagram. The map no longer marks BOARD inside the habitat. The results line no longer says "wrong plugs".

The hall's outage lighting stays: it now runs only for a blackout (battery empty), not for a tripped board.

### What changes in the rules (`server/game.js`, `client/shared/config.js`)

- `FAULTS.board`, `CABLE_COLORS`, `SOCKET_SHAPES`, `PLACES.board`, `CFG.wrongPlug` and the comment on `PLACES` that describes the board go.
- `fire('board')`, the `a.fix === 'board'` branch, `boardOut()`, the `board` entry in `scene()`, `v.wiring`, and `power.board` in `view()` go.
- Battery drain is driven by dust alone: `const draining = this.faults.dust;`.
- `mistake()` has no caller left. Remove it and `stats.mistakes`, or keep `mistake()` with no caller if another fault is planned to use it. Recommendation: remove it; it is easy to bring back.
- The demo script's meteor shower leaves `after: ['dust', 'hull']`. That makes the 1:25 aftermath lighter (two faults, not three). If the demo then feels thin, move the suit leak from 150 s to 120 s rather than inventing a new fault.
- Free play draws its random faults from `Object.keys(FAULTS)` (`server/game.js` near line 98), so removing `FAULTS.board` takes it out of free play too.

### What changes on the astronaut's page

- `client/world.js`: the switchboard block (the "switchboard: four sockets marked with shapes, four coloured cables" section, near line 694), its per-frame update (near line 937), and `board`, `sockets`, `plugs`, `plugRest` in `fixtures`.
- `client/astronaut.js:64`: drop `interior.mount.add(world.fixtures.board)`. Line 1142: `powerOut` becomes `debugOutage || (run && s.scene.dark)`.
- `client/stations.js`: plug targets, plug grabbing (`kind === 'plug'`), `socketRing`, `plugLoose`, and any hint that points at the board.
- `client/interior.js`: the breaker-panel surround at `ROOM.panel` and `mount` (near line 265), and the red backup lamp placed by `ROOM.panel.z` (line 363) moves to a spot of its own. Leave the west wall as plain painted enamel with its panel lines, so it does not read as a gap.
- `client/damage.js`: the `board` ceiling panel and the torn conduit cable. Recommendation: re-key them to the blackout (`scene.dark`) rather than delete them, so a blackout still has its physical moment in the hall. If that is more than wanted, delete them and the `active.board` flag.
- `client/world.js` near line 913: the outside view of habitat power keys on `s.dark` only (no `s.board` backup state). The floods go out and the windows go dim red only in a blackout.

### What changes for Mission Control

- `client/console.js`: the BOARD OUT dial (line 385), the wiring diagram, the BOARD marker and label on the map (lines 337-338), "wrong plugs" in the results line (line 186). Re-space the POWER console so the battery and SOLAR IN dials fill it; do not leave an empty bezel.
- `client/admin.js`, `client/rovercam.js`, `client/seat.js`, `client/voice.js`: grep each for `board` and remove what belongs to the switchboard. (`board` also means the READY status board in `astronaut.js`; leave that alone.)

The Scientist loses their best puzzle. That is accepted for this pass. Note it in the PR so a later pass can give them a new one.

### Docs and assets

- `README.md`: the fault table row, the hall description, the lighting paragraph, the damage paragraph, the screenshot `docs/astronaut-switchboard.png` and its caption, and the smoke-test description.
- `docs/SPEC-v2.md`: add a line at the top of fault 2 saying it was removed, with a link here. Do not rewrite the history.
- `docs/ASSETS.md`: the two breaker-panel rows that point at the switchboard become unassigned.
- Delete `docs/astronaut-switchboard.png`.

### Tests

- `test/game.test.js`: delete the switchboard section (from line 106) and every assertion that seats a cable or counts `mistakes`. Add one: a blackout happens with only dust active, and the battery recovers once the dust is brushed.
- `test/smoke.mjs`, `test/vr.mjs`, `test/debrief.mjs`: the demo-mission run no longer reads the wiring diagram or seats plugs. Its path through the aftermath is: brush, weld, done.

---

## 2. EXIT on the wrist cuff, in a real Quest

### The bug

The EXIT button passes `test/vr.mjs` step 13 (a fake XR device with exact, never-lost joints) and does nothing on a Quest. `exitButton()` in `client/astronaut.js:544` needs the right fingertip to stay within 2.8 cm of the cap for 0.6 s while the cuff is visible. Four things in it fail on real hardware, most likely in this order:

1. **Controllers: the touch point is not where the glove's fingers are drawn.** With controllers, the fingertip is taken as `(0, 0, -0.075)` in the glove group's frame: 7.5 cm out along the controller's ray. But `stations.js` places the glove model `CUFF_BEHIND` (0.148 m) *behind* the controller, so the drawn fingers sit near the controller itself. A player who puts the visible glove fingers on the cap is 5 to 8 cm short of the point that is tested. Check this first: draw a small marker at `tipPos` in a debug build and look.
2. **Hand tracking: the left hand drops out when the right hand covers it.** The Quest loses or freezes a tracked hand when the other hand occludes it, which is exactly the pose for pressing a button on your own wrist. When the left wrist joint goes invisible, `followArm()` hides the cuff, `near` turns false, and `exitHeld` decays at three times the rate it builds, so 0.6 s is rarely reached.
3. **The target is too small for real tracking.** 2.8 cm radius on a fingertip that jitters by 1-2 cm, measured to a point 1.2 cm above the cap.
4. **Physical clash with controllers.** The cap sits at the elbow end of the cuff, right where the left controller's ring is. The right controller hits the left one before its tip reaches the cap.

### The fix

Make it pressable three ways, all of them ending in the same `pressExit` / `leaveDebrief` / `session.end()` path:

- **Touch, made forgiving.**
  - Controllers: take the fingertip from the glove model's index-finger tip, not a fixed offset. Name that point in `stations.js` (`Glove > Hand_R > Tip_Index`, an `Object3D` placed at the model's fingertip) and read its world position.
  - Reach 4.5 cm, measured to the cap's centre, not 1.2 cm above it.
  - Keep the cuff where it was for 0.4 s after the left hand or controller drops out of tracking (hold the last `arm.group.matrix`), and do not decay `exitHeld` during that grace. Only hide the cuff after the grace runs out.
  - Hold time stays 0.6 s: it is what stops a brushing hand from ending the game.
- **Point and press.** The cap becomes a ray target, like a hatch: point the right controller (or the right hand's pinch ray) at it and hold the trigger or the pinch for the same 0.6 s. The cap sinks and the lamp warms the same way. This is the path that will work for everyone on the first try, so it is the one the result board's text should describe ("HOLD EXIT ON YOUR WRIST" covers both).
- **Move the cap off the controller ring.** Put the EXIT plate on the side of the cuff that faces the right hand when the left arm is raised to read the cuff (the `+y` edge of the face in `arm.js`, near the top of the display), not the elbow end. Update `EXIT_X`, `EXIT_Y` and the engraved arrow on the debrief face (`arm.js` near line 368) to match.

### How to check

- `test/vr.mjs` step 13 keeps passing, and gains three cases: a controller whose glove fingertip (not its ray) is put on the cap; a tracked left hand that disappears for 0.3 s halfway through the hold and the press still completes; and a ray press from 1 m away.
- On a Quest, with controllers and with hands: EXIT in the lobby ends the session; EXIT in the debrief brings the astronaut back to the READY board. Write in the PR which of the six (two input kinds by three press methods) were tried on a device. If no device was available, say so.

---

## 3. The radio keeps working in a blackout

### What changes

When the battery runs flat, the astronaut and Mission Control can still talk, and the consoles still show their readings. The base is still dark: the hall drops to its backup lights and then to black, the floods go out, the windows go dark, and the battery dial reads empty.

- `server/hub.js`: `silent()` and its three uses go (binary audio at line 157, the astronaut's talk key at 216, every Earth message at 222). Earth's rover commands then also get through a blackout, which is intended.
- `server/game.js`: the early return in `view()` ("A blackout leaves mission control with static and nothing else", line 323) goes. The `blackout` note loses "No radio, no consoles."
- `client/console.js`: the `dark` render path (blanked clock, oxygen and bar), the `#static` overlay and its canvas loop (line 421), and the NO SIGNAL plate (line 305). In a blackout the POWER console's battery dial sits at zero and its jewel lamp blinks red; that is the whole sign.
- `client/astronaut.js:110`: `noSignal()` goes, and `radioState()` never returns `'dead'`. `client/arm.js`: remove the `dead` entry from `SIGNAL` and from the radio row on the cuff face.
- `test/game.test.js`: the "voice dropped in both directions during a blackout" test is turned round: voice and Earth messages pass during a blackout. `test/hub.test.js` likewise.
- `README.md` and `docs/SPEC-v2.md` ("Blackout details"): update the text.

### Decision: what a blackout costs now

Today the blackout's cost is silence, and the backup generator exists to buy the radio back. Without silence, a blackout only turns the lights off and the generator has no job. The game's rule is that every fault eventually costs oxygen (`server/game.js`, top of file), so:

**Recommended:** in a blackout, life support stops scrubbing and the suit draws harder. Add `+1` to `drain` while `blackout && genLeft <= 0` (the same cost as one leak). The backup generator stops that drain for its `CFG.generatorSeconds`. The Scientist's DRAIN reading shows it, the cuff's oxygen needle falls faster, and the astronaut hears the scrubber fans spin down (a new `ambience.js` sound beside the hall hum).

The alternative is to let a blackout cost nothing but darkness and remove the generator. That makes ignoring the dust safe, so it is not recommended. Confirm the choice before building this section.

---

## 4. Brushing the solar panels

### Today

Each of the three panels has six flat dust rectangles (`DUST_COLS` by `DUST_ROWS`) laid over it with one tiled regolith texture at 0.94 opacity. A cell vanishes all at once when the brush tip comes within 5 cm of it, and one sphere puffs off. It reads as tiles switching off, not as dust. The cells under it also use a bright synthetic blue (`world.js:147`), which is outside the palette.

### The new look

- **A dust mask per panel.** Replace the six cell meshes on each panel with one plane carrying a 256 × 160 canvas: the alpha channel is how much dust lies there. Start it with a layer that is not flat: thicker toward the bottom edge where dust settles on a tilted panel, a few drifts and clumps, a fine grain from the regolith texture. Colour `regolith`, roughness 1, metalness 0, the canvas as both `map` alpha and `bumpMap` so the dust has a little relief in low sun.
- **The brush paints it away.** Every frame the brush tip is on the panel (within 4 cm of the face), stamp an erase stroke along the path from last frame's tip to this frame's: a soft-edged, slightly streaky shape the width of the brush head (about 6 cm), oriented along the stroke. Bristle streaks are 6-8 thin lines inside the stamp with random strength, so a single pass leaves faint stripes and a second pass cleans them. Faster strokes clear less per pass. Upload the canvas at most every other frame.
- **Dust goes somewhere.** With no air, nothing hangs: each stroke throws 10-20 small grains off the leading edge of the brush in ballistic arcs under lunar gravity (1.62 m/s²), falling to the regolith below the panel and leaving a faint darker patch there (a decal on the ground under each panel, darkened as its panel is cleaned). Pool the grains in one `InstancedMesh` of 128 so it is one draw call.
- **The panel underneath.** Clean cells catch the sun: as an area clears, the solar material's glint shows through. Recolour the cells in `world.js:147` to a deep blue-grey near `console-deep` with a faint violet sheen, inside the palette, and put the silver grid in `bezel`.
- **Feel and sound.** The brush sound (`voice.js:209`) becomes continuous while bristles are on the panel, its volume and pitch following stroke speed, positioned at the brush head. Haptics follow the same speed, lightly. When a whole panel is clean, a short tick from the panel's own status lamp (a new amber-to-green jewel lamp on the panel frame) confirms it.

### The rules stay where they are

The server keeps its 18 cells (`DUST_CELLS`); nothing about the protocol changes. The astronaut's page sends `{ fix: 'dust', cell: i }` when the mask under cell `i`'s rectangle is less than 15 % covered. When the server says a cell is clean (another source of truth, such as a reset), clear that rectangle of the mask. When a new dust storm lands, refill the mask with a fresh layer.

On a laptop, holding the mouse on a panel with the brush paints the same strokes along where the crosshair moves.

### Budget

Three panel planes instead of eighteen cells (fewer draw calls than today), one 256 × 160 canvas per panel, one `InstancedMesh` of grains, three ground decals. No new lights.

### How to check

- `npm test` unchanged for dust.
- `npm run vr:shots` and `npm run smoke:shots`: new screenshots of a panel fully dusty, half brushed (stripes visible), and clean. Replace `docs/astronaut-solar.png` with the half-brushed one. Check them against DESIGN.md: no electric blue, nothing blown out, the dust reads as dust in low sun.
- `test/vr.mjs`: brushing a panel in one sweep across its width clears the cells under the sweep and not the others.

---

## Order of work

1. Section 3 (smallest, and it changes what the blackout means for section 1).
2. Section 1, which then has only the blackout left to light the hall for.
3. Section 2.
4. Section 4.

Run `npm test`, `npm run smoke:shots` and `npm run vr:shots` after each, and say in the PR what was checked on a real Quest and what was not.
