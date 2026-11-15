# Spec: the sample run (a bigger Moon, two rovers, a survey chart, rocks to bring home)

Status: written, not started. Audited against `main` at `60bbbc1` (the physical base is in: one tool at a time, walk-in airlocks, Mission Ops calls GO).

Read [CLAUDE.md](../CLAUDE.md), [DESIGN.md](DESIGN.md), [ASSETS.md](ASSETS.md) and [SPEC-v2.md](SPEC-v2.md) first. This spec changes rules, so where it disagrees with SPEC-v2, this one wins; "What changes in the v2 rules" below lists every place.

## How this pass is checked

Do not write, update or run tests, screenshot runs or frame-time measurements in this pass: no `npm test`, `npm run smoke`, `npm run vr`, `npm run assets` or the `:shots` variants, and leave `test/` alone even where it stops matching the new rules. The bar for each phase is that it runs: `npm start` boots, and the pages load and play without errors in the browser console. The crew playtests it. This replaces the "look before you say done" loop in CLAUDE.md section 4 for this pass.

## Goal

Make the game more fun and more interactive by giving the crew something to go and get. Today the mission is "survive the shift": things break, the astronaut fixes them, and everything is within 22 m of the door. After this pass:

1. **The mission has an objective: collect rock samples out on the Moon and bring them back to the base.** Faults stay. They are what gets in the way.
2. **The Moon you can walk and drive on is much bigger:** 120 m from the base in every direction instead of 22 m, about 30 times the area.
3. **The Technician drives two rovers at once** and watches both cameras: a small **Scout** (W A S D) that surveys the ground for the Scientist, and a large **Hauler** (arrow keys) that the astronaut rides.
4. **The Scientist has the survey chart:** a coarse heat map of where samples might be, which sharpens into a real top-down chart wherever a rover has driven. Samples, landmarks and faults show on it in explored ground only.
5. **Every fault has its own symbol** on that chart.
6. **Only the Scientist knows what a wanted sample looks like.** The Technician sees rocks through a camera and the astronaut sees rocks through a visor; neither is told which ones matter.
7. **One thing goes wrong at a time.** Faults stay, but never two at once, so the crew always knows what the next job is and never has to pick between two urgent ones.
8. **Comms always work.** No blackout cuts the radio or the consoles.

## The loop

This is the minute-to-minute game, and the reason each seat has to talk.

| Step | Who | What they do | Who they need |
| --- | --- | --- | --- |
| 1 | Scientist | Reads the heat map, picks the most promising ground | |
| 2 | Scientist to Technician | "Scout north-east, about 60 metres, past the lander" | The Technician has no chart |
| 3 | Technician | Drives the Scout there by camera and compass. The chart develops behind it | The Scientist corrects the heading from the chart |
| 4 | Scientist | A sample appears on the chart. Looks it up in the field guide and describes it: "pale, angular, dark flecks, on the crater rim" | |
| 5 | Technician | Finds it in the Scout's camera and parks beside it, lights on | The Scientist confirms the place |
| 6 | Mission Ops to astronaut | "Get on the Hauler. We are taking you north-east. You want the pale rock with dark flecks, next to the Scout" | Ops is the only voice on the radio |
| 7 | Technician | Drives the Hauler, with the astronaut on it, to the Scout | Ops relays where the astronaut wants to stop |
| 8 | Astronaut | Steps off, picks the right rock (there is a lookalike beside it), puts it in a cup on the Hauler, climbs back on | |
| 9 | Technician | Drives home | |
| 10 | Astronaut | Carries the sample in through an airlock and feeds it into the port in the hall. The Scientist's assay lamp says FOUND or DUD | |

Every so often one thing breaks: the panels get dusty, the hull cracks, a wheel breaks 90 m from home. It is the only thing broken, so it is the job: the crew stops the sample run, fixes it, and picks the run back up. A meteor shower is the same: it comes alone, with a warning, and the only question is where to take cover.

## What is there now (the audit)

| Thing | Where | How it works today |
| --- | --- | --- |
| The play area | `CFG.bounds` 22 (`client/shared/config.js` 31) | A circle of 22 m. The astronaut is clamped to it (`client/astronaut.js` 365-373, 961-964), the rover is clamped to it (`server/game.js` 131-133), and the radar is drawn to it (`client/console.js` 298). |
| The ground | `client/world.js` 228-309 | The terrain mesh is already 1500 m across, with the real LOLA south-pole topography blended in past 18 m, craters out to 1080 m and a skyline to 1 km. So the Moon is already drawn far past where you can go. |
| Standing on it | `astronaut.js` 1019-1022, `world.js` `moveRover` 946-952, `client/physics.js` `moveRover` 120 | **Nothing follows the ground.** The astronaut's rig is at y = 0, the rover is at y = 0, the rover's physics box is at a fixed 0.75 m. That works because the pad inside 22 m is graded flat. |
| Rocks | `world.js` 366-384 | Three instanced scatters out to 60, 90 and 120 m. Any rock over 0.6 m is kept out of the play area (370) so there is nothing to walk through. |
| Shadows | `world.js` 85 | One 2048 px shadow map over a fixed 64 m box centred on the base. |
| The rover | `world.js` 748-789, `game.js` 43, 125-133, `server/hub.js` 223-227 | One rover, an LRV with two seats, built from plain boxes. The Technician's arrow keys set `throttle` and `steer`; the server integrates it at `CFG.roverSpeed` 2.7 m/s and 1.4 rad/s, flat, with no obstacles. Nobody can ride it. The astronaut walks at 2.4 m/s (`astronaut.js` 23), so the rover is barely faster than walking. |
| The rover camera | `client/rovercam.js` (34 lines) | Builds a second copy of the whole world with `buildWorld` and renders it from a camera on the rover. One renderer, one canvas, one camera. |
| The Technician | `console.js` 69-72, 297-372, 432-447 | Two tabs: RADAR (a round phosphor scope: base, rover, astronaut, loose tools, meteor ring) and ROVER CAM. Arrow keys drive. |
| The Scientist | `console.js` 73-76, 375-418 | Two tabs of gauges: POWER (battery, solar in, board out, the wiring card) and AIR (oxygen, drain, the LEAK lamp). No map. Works out *which* fault from the gauges. |
| Mission Ops | `console.js` 66-68, 272-288 | The talk key and the TOOL LOG. |
| The mission | `config.js` 5-14, 139-151, `game.js` 155-157 | 3:00. Oxygen drains at 0.28 a second (a full tank lasts 357 s with no leak) and never refills. Win by being alive at 0:00. Score is 100 a fix plus an oxygen bonus. |
| Fault symbols | `client/shared/icons.js` | There are none. The file draws the five tools and the four socket shapes. |
| The director | `config.js` 41-44 and 139-151, `game.js` 96-123 | Several faults can be active at once (free play allows 3, and the demo script lays dust, a wheel, a hull breach and a board fault inside two minutes). A meteor shower can arrive on top of them and leaves dust, a crack and a tripped board behind it. |
| Blackout | `game.js` 135-146, `hub.js` 138, 156-157, 222, `console.js` 104-136 and 420-429 | An empty battery cuts the radio both ways, drops every command from Earth, and turns every console to static. |

Two things the audit turned up that the plan has to deal with:

- **The ground is only fit to stand on inside the pad.** Measured from the code: the terrain mesh has a vertex every 2.2 m at 22 m out but only every 5.2 m at 120 m, while `height()` puts 3 m craters there. So past the pad the drawn ground and the computed ground disagree by up to half a metre, and anything placed with `height()` would float or sink. The real relief inside 120 m is 8 m (7.0 m down, 1.1 m up) with slopes up to about 10 degrees, so "everything is at y = 0" stops working the moment the bounds grow. Phase 0 fixes this first.
- **A hand-tracked astronaut can out-run the rover.** Teleport hops are 8 m with no pause (`astronaut.js` 339). Phase 1 gives the hop a short recharge.

## Ground rules

1. **The server still decides, and still hides.** Samples, the survey grid and the rovers live in `server/game.js`. `view(role)` stays the place where the missing-information game lives: the Technician and the astronaut are never sent which rock is a real sample, and the Scientist is never sent a sample that is in unexplored ground.
2. **The Quest is the budget.** The bigger field must not cost draw calls or triangles the headset does not have. Build it the cheap way: instanced meshes, merged statics, fewer ground triangles than today.
3. **Nothing floats.** Astronaut, rovers, samples, boulders and scenery all sit on the same `world.height(x, z)`, and that function agrees with the drawn mesh to within 5 cm everywhere in the field, by construction (see phase 0).
4. **Mission Control reads pictures.** The chart, the field guide and the sample log are instruments in the DESIGN.md look: a phosphor scope, cream cards, jewel lamps, Nixie counters, engraved one-word labels. No rainbow heat map, no web dashboard.
5. **The astronaut gets no map and no markers.** No highlight on a real sample, no waypoint, nothing on the visor. They find the rock by being told what it looks like.
6. **No dead ends** (SPEC-v2 rule 4 stands). A sample in unexplored ground can still be picked up by an astronaut who finds it by eye. The field can be crossed on foot. Comms never fail.
7. **Every new action gives feedback.** (CLAUDE.md calls this "juice"; it just means the game answers what the player does.) Three answers: a sound that comes from the place it happened (`client/ambience.js`, or a new one beside it), something you can see (a puff of dust, a lamp lighting, a needle kicking), and a short buzz in the hand that did it. Picking up a rock, for example: a scrape, a puff of dust, a tick in your fingers.
8. **The lobby keeps its look.** Briefing copy changes; `client/lobby.js`, `client/lobby/*.svg` and the lobby section of `style.css` do not. (The Technician's lobby scene already shows the VIPER rover, which is what the Scout is modelled on.)
9. **The base stays where it is.** The habitat, solar panels, dish, depot and drill do not move in this pass. The field is new ground around them.
10. **One thing at a time.** At most one fault is active at any moment. A new fault or a meteor shower starts only when nothing is broken and no shower is under way, and after each fix there is a short gap before the next. A shower breaks nothing on its own; if it catches the astronaut in the open it starts a suit leak, and that leak is then the one fault.
11. **Comms always work.** The radio and every console work at all times, including when the battery is flat.

## What changes in the v2 rules

| SPEC-v2 says | Now |
| --- | --- |
| Rule 1: oxygen at zero is the only way to lose; surviving the clock is the only way to win | Oxygen at zero still ends the mission at once. At 0:00 the mission is **complete** if the manifest is banked and **failed** if it is not ("came home short"). |
| Oxygen only goes down | It refills while the astronaut is inside the base. Home is safe, the rocks are not at home. |
| Rule 5: Scientist knows *what*, Technician knows *where and when*, Ops knows the kit | **Scientist: the chart and the field guide** (what is wrong, where things are, what a sample looks like). **Technician: the eyes and the wheels** (two cameras, two rovers, and still *when*: the meteor warning). **Ops: the voice, the kit and the tally.** **Astronaut: the hands.** |
| The Technician has the radar map | The map becomes the Scientist's survey chart. The Technician navigates by camera, a compass tape and a homing needle. |
| The Scientist works out which fault from the gauges, and the LEAK lamp "does not say where" | The one active fault is a named symbol on the chart at its place. The gauges stay as the measure of how bad it is and how the fix is going. See decision 7. |
| A broken wheel turns the map to static | A broken wheel stops that rover. The chart keeps what it has. The meteor warning is not affected. |
| One rover | Two. Meteor cover is "inside, or crouched beside (or on) the Hauler". The Scout is too small to hide behind. |
| A round is 3:00 | 6:00. See decision 9. |
| Several faults can be active at once, and a shower leaves damage behind it | One fault at a time (ground rule 10). The shower leaves nothing broken behind it. |
| A blackout cuts the radio both ways and turns every console to static | Comms never fail (ground rule 11). A flat battery still darkens the base and stops oxygen refilling at home; see decision 11. |
| Cascades: no radar, then no meteor warning, then caught in the open | Gone: the warning always works. What is left: a power fault empties the battery, and a leak drains oxygen three times faster. |

## The numbers

All in `client/shared/config.js`, all expected to be tuned by playing.

| Name | Value | Why |
| --- | --- | --- |
| `CFG.bounds` | 120 | The field. The detailed craters already reach 130 m (`world.js` 259). |
| `CFG.pad` | 22 | The graded pad: today's whole play area, and still where every base fault is. |
| `CFG.roundSeconds` | 360 | Two or three sample runs and four or five faults. |
| `CFG.o2DrainPerSec` | 0.35 | A full tank is 286 s outside: one long run, not the whole mission. |
| `CFG.o2RefillPerSec` | 3 | While `astro.inside`. Net of leaks, so a leaking suit refills slowly. |
| `ROVERS.scout` | speed 6 m/s, turn 1.8 rad/s, reveal 16 m, body radius 0.9 m, keys W A S D | Fast and wide-eyed. Edge to base in 20 s. |
| `ROVERS.hauler` | speed 4.5 m/s, turn 1.2 rad/s (0.7 with a rider), reveal 8 m, body radius 1.6 m, arrow keys | LRV class. Nearly twice walking pace, so riding is worth asking for. |
| `CFG.rover.rampSeconds` | 0.6 | Rovers ease up to speed and down to a stop. Comfort for the rider, and it reads as mass. |
| `CFG.teleportRecharge` | 2.5 s | 8 m hops then average 3.2 m/s: quicker than walking, slower than the Hauler. |
| `FIELD.cell` / `FIELD.block` | 5 m / 30 m | The explored grid is 48 × 48 cells; the heat map is 8 × 8 blocks. |
| `CFG.survey.known` | 30 m | Ground round the base that starts explored. |
| `CFG.sample` | manifest 4, tray 4 cups, 250 points on the manifest, 100 for any other real sample, 0 for a dud, draw radius 45 m | |
| `CFG.freeMaxFaults` / `CFG.faultGapSeconds` | 1 / 20 s | One fault at a time, and a breather this long after each fix before the next thing goes wrong |

Travel, for a sense of scale: the edge of the field to the door is 50 s on foot, 27 s on the Hauler, 20 s for the Scout. With a suit leak (three times the drain) a full tank lasts 95 s.

## What each seat sees and knows

| | Astronaut | Technician | Scientist | Mission Ops |
| --- | --- | --- | --- | --- |
| The field | Their own eyes | Two rover cameras | The survey chart | Nothing |
| Where the rovers are | By their lights | Through the cameras; a compass tape, and a needle that points home | On the chart, always | |
| Where the astronaut is | | In a camera, if in shot; a RIDER lamp | On the chart, while on explored ground or riding | By asking, on the radio |
| Where samples might be | | | The heat map, everywhere | |
| Where samples are | What they can see | What a camera can see | On the chart, in explored ground | |
| What a wanted sample looks like | **Not told** | **Not told** | The field guide | |
| What is broken | Warning triangle on the cuff (not which) | WHEEL lamps | The one fault's symbol on the chart, plus POWER and AIR | |
| What is carried and banked | Hands, the tray, a tally on the cuff | | The assay lamp: FOUND or DUD | The TOOL LOG and the SAMPLE LOG |
| Meteor warning | | A lamp and a countdown | | |
| The radio | Talks to Ops | | | The only voice |

In a 2-player game the Mission Operator (the `all` seat) has every Earth-side column at once. That seat must fit the chart and both cameras on one screen without scrolling at 1366 × 768.

---

## Phases

Each phase is a mergeable PR that leaves the game playable. Order: 0, 1, 2, 3, 4. Phase 1 needs 0. Phases 2 and 3 need 0. Phase 4 needs 2 and 3. The first build that shows the whole idea is the end of phase 4.

0. **A bigger Moon:** the field, ground that everything stands on, a longer mission, oxygen that refills at home, one fault at a time, and comms that never fail.
1. **Ride the Hauler.**
2. **Two rovers and the Technician's console.**
3. **The survey chart, and fault symbols.**
4. **Samples:** find, carry, bank, score.

---

## Phase 0: a bigger Moon

No new mechanics. The same game, with room.

### One shared description of the field: `client/shared/field.js` (new)

Pure data and functions, no three.js, imported by the server, `world.js` and `console.js`.

- `FIELD = { radius, cell, block, n }` and the grid helpers `cellOf(x, z)`, `cellCentre(i)`, `blockOf(i)`, `inField(x, z)`.
- `CRATERS`: the crater list `world.js` builds at 246-260, made here with its own seeded generator. (`world.js` shares one `rnd` between craters, rocks and stars, so lifting the craters out changes the layout once. Refresh the `docs/` images after.)
- `BOULDERS`: about 40 rocks from 0.8 to 2.6 m across, between 30 m and the edge, each `{ x, z, r, shape }`, clear of every site in `PLACES`. These are **solid** for the astronaut and both rovers, drawn by `world.js` from this list, and marked on the chart. They are also how people give directions. Rocks under 0.6 m stay decoration, as now.
- `LANDMARKS`: named places with a short engraved name for the chart: the scenery that is already there and now inside the field (`LM` at (-30, -34), `FLAG`, `VIKING` at (16, -15), `DISH`, `DEPOT`, `DRILL`) and three or four new ones further out, using models ASSETS.md lists as not yet placed: the `ladee-probe` half sunk in a crater (`PROBE`), the `grace-satellite` as dropped cargo (`CARGO`), and two named boulders (`SPLIT ROCK`, `THE TOOTH`). Each has a collision radius. The LM is 9 m across and is now somewhere you can walk to: it needs one.

### The ground

| File | Change |
| --- | --- |
| `client/world.js` 228-309 | Build the ground in two parts: an inner square lattice at 2 m out to `FIELD.radius + 10`, and the outer ring on the existing power curve. Add `groundAt(x, z)`, which interpolates the inner lattice triangle for triangle, so it is exact against the mesh by construction, and export it as `world.height`. The inner lattice is about 34k triangles; keep the ring to about 15k. Together that is under half of the 106k the single 230 × 230 plane costs now. Craters read `CRATERS` from `field.js`. |
| `client/world.js` 366-384 | Rocks: draw `BOULDERS`; drop the "nothing over 0.6 m in the play area" test (370) for a "not within 0.5 m of a boulder, landmark or site" test; carry the small-rock scatter out to the edge so the far field is not bare. |
| `client/world.js` 81-90 | The shadow box follows whoever is looking: move `sun.target` (and the sun with it) to the viewer's position rounded to 1 m, each frame. Same 64 m box, same map. |
| `client/world.js` `moveRover`, `client/physics.js` `moveRover` | The rover sits at `groundAt` and tips to the ground's normal (drawing only). Its physics box follows. |
| `client/astronaut.js` 1019-1022 | The rig's floor is `groundAt` under the head, eased at about 10 a second so a crater lip is a ramp, not a step. The hop is added on top. |
| `client/astronaut.js` 365-373 | Teleport aims at the ground mesh, not the y = 0 plane. Add the recharge: the ground ring draws as an arc that fills over `CFG.teleportRecharge`. |
| `client/astronaut.js` 356-362, 961-964 | Boulders and landmarks push the astronaut out, the way `inModule` does for the side modules. |
| `client/stations.js` 315 | The surface heightfield uses the same 2 m lattice (at 1 m out to 123 m it would be 61,000 samples). |
| `client/rovercam.js` | The astronaut figure stands at `groundAt`. |

### The server

| File | Change |
| --- | --- |
| `client/shared/config.js` | `bounds: 120`, `pad: 22`, `roundSeconds: 360`, `o2DrainPerSec: 0.35`, `o2RefillPerSec: 3`, `teleportRecharge`, `rover.rampSeconds`, `freeMaxFaults: 1`, `faultGapSeconds`. |
| `server/game.js` 125-133 | Throttle eases over `rampSeconds`. Boulders and landmarks push the rover out (circle against circle, from `field.js`). |
| `server/game.js` 155 | Oxygen: `+o2RefillPerSec` while `astro.inside` and the base has power, capped at `o2Max`, less the drain. |
| `server/game.js` 96-123 (the director), `client/shared/config.js` | One fault at a time. A new fault or a shower fires only when `faults` is empty and no shower is under way, then waits `faultGapSeconds` after the fix. A scripted event that comes due while something is broken waits for the fix. A shower's `after` list goes: it leaves no dust, crack or board behind. `SCRIPTS.demo` becomes a plain order (dust, wheel, shower, hull, suit, board) with the gap between each, instead of clock times, so judges see the same things in the same order. |
| `server/game.js` 66-68 and 135-146, `server/hub.js` 138, 156-157 and 222, `client/console.js` 104-136 and 420-429, `client/arm.js`, `client/astronaut.js` | Comms never fail. `powered` no longer gates the radio, the commands from Earth, the consoles or the cuff: `hub.silent()` goes, the static screen and dead-battery icon go, and the cuff's barred microphone goes. A flat battery still darkens the base (the lighting sequence in `interior.js` is unchanged) and stops oxygen refilling at home; the backup generator gives both back for `generatorSeconds`. |
| `client/shared/rules.js` `areaName` | Loose tools outside are named by the nearest landmark from `LANDMARKS`. |

### The radar, for now

`drawMap` (`console.js` 297-372) gets a three-position **RANGE** switch: 30, 60, 120 m, drawn as a rotary selector with an engraved plate, clicked to step. At 120 m the whole field is 1.9 pixels a metre, which is enough for blips and too small for the base, so the switch is needed anyway. Boulders and landmarks are drawn on it. This is not throwaway work: phase 3 moves this scope, switch and all, to the Scientist.

### It runs when

- `npm start` boots, and the astronaut page and the console pages load and play without errors in the browser console.
- The astronaut can walk from the door to the edge of the field and stand on the ground the whole way; both rovers drive over it and stop at a boulder.
- Oxygen climbs while the astronaut is inside and the base has power, and never passes the tank size.
- The radio and every console keep working when the battery is flat, and only one fault is ever active.

---

## Phase 1: ride the Hauler

The existing rover becomes the Hauler. It is the same LRV; it gets a place to stand.

### The model (`client/world.js` 748-789)

- A **footplate** across the back, 0.9 × 0.5 m and 0.45 m off the ground, with a waist-high hoop rail in front of it. The astronaut rides standing, holding the rail, like the back of a fire engine. Standing matters: the player is standing in their room, so there is no seated pose to fake.
- Name the parts while in there: `Root`, `Body`, `Footplate`, `Rail_Rider`, `Tray` (phase 4), `Wheel_FL` and so on, `Lamp_Beacon`.
- The chassis is plain boxes today (751-756), which CLAUDE.md does not allow as final objects. Give the body a bevelled, extruded shape and a panel-line canvas texture as part of this work.

### Getting on and off

| Step | What happens |
| --- | --- |
| On | Stand within 1.5 m of the footplate and grab the rail (grip, or pinch). The page sends `{ mount: true }`. The server accepts if the Hauler is stopped and the astronaut is within 2.5 m. The rig jumps onto the footplate in one frame (an instant move is comfortable; a glide is not). |
| Riding | The rig moves with the Hauler. Its floor is the footplate. It does **not** pitch or roll with the ground: the horizon stays level and only the height changes. The pose the server keeps is the Hauler's. |
| Off | Only when the Hauler is stopped. Push the stick, or step off the plate, and the rig is put on the ground 1 m to that side. The page sends `{ mount: false }`. While it is moving, the head is held to the footplate box, the way an airlock chamber holds it during a cycle. |
| Laptop | `E` beside the Hauler gets on and off, so the smoke test can ride. |

The astronaut cannot steer and cannot stop it. They ask Ops, Ops asks the Technician. The Technician gets a green **RIDER** jewel lamp, so they know when the astronaut is aboard and do not drive off without them.

### Comfort (the risk in this phase)

A passenger driven by someone else is the classic way to make a headset player ill. What the design does about it:

- Speed changes are eased (`rampSeconds`), and the turn rate drops to 0.7 rad/s with a rider.
- No pitch, no roll, no camera shake while riding.
- The rail and the chassis fill the lower view and move with the player: a fixed frame to look at.
- The rig turns with the Hauler by default. `CFG.ride.snapYaw: true` is the fallback: the rig holds its heading and catches up in 30 degree steps.

The crew should try this on the Quest early. If smooth turning is bad, ship the snap.

### Feedback: sound, sight and feel

- On: a rail clank at the hand, a strong pulse in that hand, the RIDER lamp.
- Riding: a motor hum and a regolith crunch that rise with speed (through the suit: low and dull), a faint steady buzz in a hand that is on the rail.
- **Rooster tails:** each wheel throws a slow fan of dust (`Points`, as `damage.js` does its puffs) that hangs and falls at lunar gravity. Seen by the rider and by both rover cameras. Both rovers get it.
- Off: boots hitting regolith, a small dust puff at the feet.

### Server

- `game.astro.riding` (`'hauler'` or null). While set, the server writes the astronaut's x and z from the Hauler each tick, so reach and cover checks use where they really are. Crouching on the footplate is cover (the distance is zero). `view('tech')` and `view('all')` gain `rider`.

### It runs when

- The astronaut can grab the rail, ride while the Technician drives, and step off when the Hauler stops, with their feet on the ground beside it.

---

## Phase 2: two rovers and the Technician's console

### The Scout (`client/world.js`, new)

Small, quick, and plainly a robot: a prospecting rover in the VIPER mould, drawn the way the 1960s would have built it. About 1.4 m wide, 1.5 m long, body top at 1.0 m, a mast to 1.9 m.

- A low bevelled body in `enamel` with a `foil-gold` skirt, four wheels (the Hauler's wheel, instanced at 0.6 scale), a mast with a camera head, two work lamps (`lamp-white`), a short drill housing under the belly, and a blinking amber beacon on the mast. The astronaut finds it by its lights.
- There is no small-rover model in ASSETS.md, so this one is hand-built: bevels, a canvas texture with panel lines and stencilled `SCOUT`, nothing left as a bare box. Merge the static parts into one mesh; it must not cost more than six draw calls.
- Names: `Root`, `Body`, `Mast`, `Camera_Head`, `Lamp_Beacon`, `Wheel_FL` and so on, and a `hub` for the wheel repair, as on the Hauler.

### The server (`server/game.js`, `server/hub.js`)

- `this.rover` becomes `this.rovers = { scout, hauler }`, each `{ x, z, ry, v, throttle, steer }`, integrated with its own `ROVERS[id]` numbers. They push each other apart. Start places: `PLACES.rovers = { hauler: { x: 4, z: 9 }, scout: { x: -4, z: 8 } }`.
- `{ t: 'rover', id, throttle, steer }` from `tech` or `all` (`hub.js` 223-227). An `id` that is not a rover is dropped.
- The wheel fault carries `which`. The demo order names it; free play picks the Scout six times in ten. Still one wheel fault at a time. `scene.wheel` becomes `scene.wheels = { scout, hauler }` (0 fine, 1 broken, 2 pulled off). The fix needs the astronaut near *that* rover. One space tire fits either.
- Cover from a shower is the Hauler: `sheltered(pose, rovers.hauler)`.
- Views send `rovers` in place of `rover`.

### The Technician's console (`client/console.js` 69-72, 432-447, `client/rovercam.js`)

No tabs. Both cameras are up all the time, side by side, because driving two rovers at once is the job.

```
+------------------- TECHNICIAN -------------------+
| [ SCOUT camera        ] [ HAULER camera        ] |
|   compass tape on top     compass tape on top    |
|   W A S D                 ARROWS                 |
| (HOME) [042 m] (WHEEL)  (HOME) [017 m] (WHEEL)   |
|                         (RIDER)                  |
|            (METEOR)  [ 12 ]                      |
+--------------------------------------------------+
```

- **Two screens from one scene.** `rovercam.js` keeps one renderer and one copy of the world and draws it twice, once from each rover's camera, into the two halves of one canvas (viewport and scissor). Cap it at 30 frames a second and a pixel ratio of 1: the 2-player seat runs this beside everything else.
- **On each screen**, in `phosphor`: a compass tape across the top (N, E, S, W and a tick every 15 degrees) and a centre reticle with clock marks, so "rock at two o'clock" means something.
- **Under each screen:** a **HOME** dial (a cream face; the needle points to the base relative to the rover's nose) with the range in metres on a Nixie counter, and a red **WHEEL** jewel that blinks when that rover is stuck. The Hauler also has the **RIDER** lamp.
- **Between them:** the **METEOR** lamp and its Nixie countdown, lit by the shower warning.
- **Keys:** W A S D drive the Scout, the arrows drive the Hauler, both at once. Engrave the keys on a plate under each screen. (Some laptop keyboards drop a key when four are held. Worth trying the worst case, W + A + Up + Left, on the laptops that will be used.)
- The radar scope stays on the Technician's panel, under the two cameras, until phase 3 moves it to the Scientist.
- The brief (`console.js` 27): "You have the EYES and the WHEELS. Two rovers, two cameras. You have no map: the Scientist does."

### It runs when

- Both rovers drive at the same time, W A S D for the Scout and the arrows for the Hauler, and both cameras draw.
- A broken Scout wheel stops the Scout and leaves the Hauler driving; the space tire fixes whichever rover is broken.

---

## Phase 3: the survey chart, and fault symbols

This phase is the server's picture of the field and the Scientist's console. The rocks themselves arrive in phase 4, but where they will be is decided here, because the heat map is made from it.

### The server (`server/game.js`)

- **The layout.** `laySamples()`, called from `start()`: every sample and every lookalike, `{ id, kind, look, x, z }` (`kind` is a sample type or `'dud'`; see phase 4 for the types). The demo uses a fixed list in `PLACES.demoSamples`, with the first wanted sample about 45 m north-east in the brightest block, so the first run is short. Free play picks three to five hot spots between 40 and 110 m out and clusters samples round them, with lookalikes both in the clusters and alone, nothing within 30 m of the habitat, inside a boulder or on a landmark.
- **The heat map.** `field.heat`: one level, 0 to 3, for each 30 m block, worked out once at the start: the real samples in the block, plus 0.6 for each lookalike, plus a little noise, quantised. The orbital survey cannot tell a sample from a lookalike, so some hot blocks are empty. That is on purpose.
- **Explored ground.** `field.seen`: one bit per 5 m cell. At the start, every cell within `CFG.survey.known` of the base. Each tick, every cell within `ROVERS[id].reveal` of each rover. The astronaut on foot reveals nothing: that is what the rovers are for. Seen is for ever.
- **`view('sci')`** (and `all`) gains `survey`: `heat` (64 digits), `seen` (the bit grid as base64, about 400 characters), `pct` explored, `rovers` (always), `astro` (only while on a seen cell, or riding), `samples` (only those still on the ground in seen cells, with their true `kind`; lookalikes are never listed), `tools` lying outside in seen cells, and `fault`: the one active fault as `{ type, x, z }`, if its place is seen.
- **Where a fault's symbol goes:** dust at the solar panels; the switchboard and the hull at the habitat (the hull symbol does not say which of the six cracks: finding it is still done by ear); the wheel on that rover; the suit leak on the astronaut. The base starts explored and a rover always sees its own ground, so in practice the rule hides one thing: an astronaut who has walked off the chart, and their suit leak with them. The LEAK lamp on AIR still lights.
- `view('tech')` loses `radar` and the map data. It keeps `rovers`, `scene`, `rider` and the meteor warning.

### The chart (`client/console.js`: `drawMap` becomes `drawSurvey`, on a new SURVEY tab, first in the Scientist's row)

The same round phosphor scope the radar was, with two rotary switches beside it: **RANGE** (30, 60, 120 m) and **CENTRE** (BASE, SCOUT, HAULER).

- **Unexplored ground** is the heat map: 30 m blocks in four steps of phosphor brightness, drawn coarse, with visible raster lines, like a picture sent down from orbit. One hue. Brighter means more likely.
- **Explored ground** clears to dark glass and is drawn fine: crater rims as thin rings (from `CRATERS`, 6 m and up), boulders as small ticks, landmarks with their engraved names, and a soft glow on each 5 m cell that holds a sample. A cell with nothing in it is dark: known empty. A faint line marks the edge of what has been seen.
- **Samples:** an amber glyph for each, a different shape for each type (see `drawSample` in phase 4), so the chart reads without colour.
- **Rovers:** amber wedges, lettered S and H. **The astronaut:** the `lamp-blue` wedge. **Loose tools:** amber dots, as the radar had.
- **The fault:** its symbol in `lamp-red`, blinking at 1.5 Hz, at its place.
- A Nixie counter: **SURVEYED** and the percentage.
- **Feedback:** newly seen cells wipe in over about a third of a second, as if the tube were being written. When a new cell turns out to hold a sample, the glyph blooms and the console pings (`radio.sfx('ping')`, new).

### Fault symbols (`client/shared/icons.js`: `drawFault(g, type, x, y, size, colour)`)

One glyph per fault, drawn in the same hand as `drawTool`. Every fault's symbol hints at what breaks; none of them is the tool that fixes it.

| Fault | Symbol |
| --- | --- |
| Dusty solar panels | A tilted panel with a scatter of dots on it |
| Tripped switchboard | A plug pulled out of its socket |
| Broken rover wheel | A wheel with a wedge missing |
| Hull breach | A zigzag crack with a puff |
| Suit leak | A glove with a drop |
| Meteor shower (an event, for the results log and the Technician's lamp) | A streak with a tail |

A legend strip under the chart shows the five glyphs with one-word plates: SOLAR, BOARD, WHEEL, HULL, SUIT. The results log uses the same glyphs beside each line.

### It runs when

- Driving a rover through unexplored ground develops the chart there, and the ground stays developed.
- The Scientist's page lists a sample only in explored ground, and the Technician's and astronaut's pages carry no chart data at all.
- The active fault's symbol shows at its place.

---

## Phase 4: samples

### What a sample is (`client/shared/config.js`: `SAMPLES`)

Four types, each a real thing Apollo or the polar missions went looking for, each with one lookalike that differs in a way you can say out loud.

| Id | Sample | Looks like | Its lookalike | Chart glyph |
| --- | --- | --- | --- | --- |
| `anor` | Anorthosite ("genesis rock") | Pale cream, angular, dark flecks | A pale rock that is rounded and plain | Diamond |
| `basalt` | Vesicular basalt | Charcoal, rounded, pitted with holes | A dark slab, smooth, no holes | Circle with dots |
| `glass` | Orange glass soil | A clod of ochre beads on a stained patch of ground | A crumpled scrap of gold foil off a lander | Triangle |
| `ice` | Ice-bearing clod | Pale blue-grey, frosted, only ever in a crater's shadow | A pale dusty rock out in the sun | Six-pointed star |

- Sizes are 0.15 to 0.3 m: bigger than life, so a camera can pick one out at 10 m.
- **The manifest** is what this mission wants: four samples. Demo: two anorthosite, one ice, one orange glass. Free play draws it from three of the four types. The field holds about 11 real samples (more of each wanted type than the manifest needs, plus a few of the others) and about 10 lookalikes.
- The colours are new to the palette. Add a short "Samples" table to DESIGN.md in this phase and take the values from there. Proposed, to be judged in the headset: `anor` on `dial` with `ink-dial` flecks, `basalt` `#34322e`, `glass` `#b9763a` (between `foil-gold` and `lamp-amber`), `ice` `#9fb0b8`.

### In the world (`client/world.js`, `client/stations.js`)

- **Meshes:** small displaced-icosahedron rocks like `rockGeo` (`world.js` 340), one geometry and one canvas texture per look, eight looks, drawn as one `InstancedMesh` per look. Orange soil also gets a 0.6 m stain on the ground under it. Each sits on `world.height` with a contact shadow.
- **What the pages are sent:** `scene.samples`, everything within 45 m of the astronaut (for the Technician: of either rover), as `{ id, look, x, z, at }`. `look` is all they get. Nothing says which look is a real sample.
- **Picking up:** the same grab as a tool. A sample in the hand is a physics body (`phys.hold`); let go and it falls, tumbles, and when it sleeps the page sends where it lies and it goes back to being an instance. At most four sample bodies live at once.
- **Hands:** one thing in each hand, and at most one of them a tool. So on foot the astronaut carries two samples, or one sample and a tool.
- **The tray:** four open cups on the Hauler's aft bay (the `sample-canister` model with its lid off, which ASSETS.md lists as not yet placed). Let go of a sample over a cup and it drops in and stays. Take it out by grabbing it. A cup holds a sample or nothing; tools do not go in.
- **The sample port:** inside the hall, on the east wall across from the end of the workbench, at waist height (samples count once they are brought home, two at a time, one in each hand): a round hopper with a hinged lid (`Port_Lid`) in a bolted `bezel` collar, a jewel lamp (`Lamp_Port`), and a pair of Nixie tubes above it showing banked and wanted. Put a sample in and let go: the lid drops with a clunk, and the lamp goes green for a real sample or amber with a double buzz for a dud. Beside it, a rack on the bench fills with a canister for each one banked. A sample carried indoors stays in the hand through the airlock and is drawn there; one let go in the hall lies on the hall floor and can be picked up again.
- **Laptop:** click a sample to take it, click a cup or the port to put it there.

### The server (`server/game.js`)

- State: `samples` (each with `at`: `'ground'`, `'hand'`, `'tray'`, `'banked'`), `carry: { left, right }`, `tray: [4]`, `manifest`, `banked`.
- Acts, each refused unless the astronaut is where it says: `{ pick: id, hand }` (on the ground within reach, or in a cup beside the Hauler; that hand empty; not a second tool), `{ put: id, x, z }` (came to rest), `{ tray: id, slot }` (beside the Hauler, cup empty), `{ bank: id }` (within reach of `PLACES.port`).
- Banking scores `CFG.sample` points: 250 if the manifest still wants that type, 100 for any other real sample, 0 for a dud. Each goes in the results log with its glyph.
- **The end.** Oxygen at zero: failed, at once, as now. At 0:00: complete if the manifest is banked, otherwise failed, "came home short". `result` and `stats` gain `samples`, `wanted` and `duds`. The oxygen bonus stays.
- Views: the astronaut and Ops get `carry`, `tray` and the tally. The Scientist gets `manifest`, `banked` and the last `assay` (`{ kind }` or `'dud'`). Everyone's header gets the tally.

### Mission Control (`client/console.js`)

- **Scientist, GUIDE tab** (second in the row): a cream card for each type on the manifest. On it: a picture of the sample (`drawSample` in `icons.js`, the same art as the 3D texture), three pictograms (its size against a glove; where it lies: rim, shadow, flat ground or a patch; its tell-tale: flecks, holes, beads or frost), a small picture of its lookalike with a line struck through it, and one jewel lamp per piece wanted, lit as each is banked. Under the cards, the **ASSAY** strip: the glyph of the last thing banked and a FOUND (green) or DUD (amber) lamp. Pictures and one-word plates only: the Scientist has to find their own words for "angular with dark flecks".
- **Mission Ops, SAMPLE LOG** under the tool log: two hand lamps, four cup lamps (full or empty; not what is in them) and a Nixie pair for banked and wanted. Ops knows how many; the Scientist knows which.
- **Every console's header:** `SAMPLES` beside `SCORE`, on Nixie digits.
- **The astronaut's cuff** (`client/arm.js`): a rock icon with one pip per sample wanted, filled as they are banked. Icons only, as the rest of the cuff.
- Briefs (`console.js` 25-29) rewritten for all three seats. Scientist: "You have the CHART and the FIELD GUIDE. Only you know what a sample looks like."

### Feedback: sound, sight and feel

- Pick up: a soft scrape, a dust puff where it lay, a tick in the hand.
- Into a cup: a hollow clink.
- Into the port: the lid's clunk, the lamp, the Nixie tubes rolling over, and on every console a rising two-tone for FOUND or a flat buzz for DUD. When the last one on the manifest goes in, the "go" tones from the status board, and a pulse in both hands.

### It runs when

- A sample can be picked up, carried in a hand or a tray cup, put in the port, and counted.
- A lookalike in the port reads DUD; a manifest sample reads FOUND.
- The mission ends complete at 0:00 with the manifest banked, and failed without it.
- The astronaut's and Technician's pages are sent each rock's look and never its kind.

---

## Done means

- The astronaut can walk or ride 120 m from the base in any direction, with their feet, both rovers and every rock on the ground.
- The Technician drives the Scout with W A S D and the Hauler with the arrows at the same time and sees both cameras at once. They have no map.
- The astronaut gets on the Hauler by grabbing its rail, is carried by the Technician's driving, and gets off when it stops.
- The Scientist's chart starts as a coarse heat map with the base explored, and sharpens wherever either rover drives. Samples, landmarks, loose tools, the astronaut and the fault show on it only in explored ground. Each fault has its own symbol.
- The Technician's and astronaut's pages are never sent which rock is a real sample. The Scientist's page is never sent a sample in unexplored ground.
- A sample can be picked up, carried in a hand or a tray cup, and banked at the port, with a sound, a lamp and a tick in the hand at each step. A lookalike banked is a DUD.
- The mission is complete when the manifest is banked at 0:00, and failed if oxygen runs out or the crew comes home short.
- Only one fault is ever active. A shower never starts on top of one and breaks nothing itself; caught in the open, it starts a suit leak.
- The radio and every console work at all times, including with a flat battery.
- `npm start` boots and every page loads and plays without errors in the browser console. No tests, screenshots or measurements are part of this pass; the crew playtests it, and four people told only their one-line brief should be able to bank a sample in their first mission.

## Risks

| Risk | What to do about it |
| --- | --- |
| Riding makes the astronaut ill | Phase 1's comfort list, the snap-turn fallback, and the crew trying it on the Quest early. If it cannot be made comfortable, the Hauler carries samples and tools only and the astronaut walks beside it: the field shrinks to 80 m. |
| The bigger field costs frames on the Quest | Phase 0 lowers the ground's triangle count rather than raising it, samples and boulders are instanced. |
| Two cameras plus everything else on one laptop (the 2-player seat) | One renderer and one world for both cameras, 30 frames a second, pixel ratio 1. If it still drags, the 2-player seat shows one camera at a time with a switch. |
| Driving two rovers at once is too much | It is meant to be a stretch, and a rover with no key held stops by itself. If it is simply not fun, let the Scout hold its last heading at half speed with a HOLD switch. |
| Six minutes is long for a judge | Decision 9. |
| A lookalike is impossible to tell from the real thing in a headset, or trivially easy | A blind playtest: someone who has not seen the field guide is talked onto the right rock. If they cannot, or can at once, change the looks. |
| The Technician feels lost without a map | The HOME needle and range, the compass tape, named landmarks and boulders, and the Scientist's chart showing both rovers. Being a little lost is the game; being stuck is not. |

## Decisions to confirm

Each has a recommendation, and the spec above is written to it. None of them blocks phase 0.

1. **How big.** 120 m (recommended), or 80 m if riding turns out uncomfortable, or 200 m if 120 feels small once both rovers are quick.
2. **How the mission ends.** At 0:00, complete if the manifest is banked, and extra samples score (recommended: the clock stays the clock, faults keep coming, and a fast crew has something to do). Or: the mission ends the moment the last manifest sample is banked, with a bonus for time left.
3. **Oxygen refills inside the base** (recommended). The alternative is a slower drain and no refill, which makes going home pointless except to bank.
4. **Where samples are banked.** Decided: carried in through the airlock, two at a time, to the port in the hall. (Earlier draft: a port on the outside wall by door S.)
5. **The Technician gives up the map.** The request gives the Technician two rover displays and the Scientist the top-down view, so the radar scope moves to the Scientist (recommended). If the Technician should keep a scope, make it a small one centred on the Hauler showing only the Scout, the astronaut and meteors.
6. **Which keys drive which rover.** Arrows for the Hauler, W A S D for the Scout (recommended: the arrows already drive the big rover).
7. **Fault symbols name the fault.** The request is that each fault has a symbol on the chart, and that is what is specified. It retires two things the Scientist used to work out: dust or switchboard (from the two gauges) and hull or suit (the astronaut, by ear). If that is missed, the fallback is one generic alarm symbol at the right place until a rover camera or the astronaut has been within 15 m of it, and the named symbol after that.
8. **How the astronaut rides.** Standing on a rear footplate holding a rail, turning with the Hauler (recommended), with snap turning as the fallback.
9. **Mission length.** 6:00 for both modes (recommended). If judges need 3:00, keep a short demo with a manifest of two and a field of 60 m, and make 6:00 the free-play length.
10. **The base does not spread out.** The solar panels, dish and depot stay inside the pad (recommended for this pass). Moving the solar array out into the field would make dust a ride-out job; that is a good second pass once riding is proven.
11. **What a flat battery does now that it cannot cut comms.** The base goes dark and oxygen stops refilling at home until the power fault is fixed; the backup generator brings both back for 25 s (recommended: it keeps a power fault worth fixing without taking anything away from the crew). Or: it only darkens the base and nothing else.
