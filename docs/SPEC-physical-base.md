# Spec: a physical base (physics tools, walk-in airlocks, a live porthole, Mission Control calls GO)

Status: written, not started. Audited against `main` at `d5c427c` (PRs 5, 7, 8 and 9 merged: the 1960s pass, the clean hall that breaks, the Habitat Demonstration Unit with the open airlock vestibule and the porthole, the theme song).

## Goal

Sevan's note: *the game feels extremely static.* Make the base something you move through and handle, not something you point at:

1. **The tools obey physics.** They have weight (lunar weight), they fall, tumble, clatter and can be thrown, knocked off a bench and dropped on the regolith.
2. **You find the tools inside the base.** No rack outside. The tools are scattered round the hall at the start of a mission, and you go in and look for them.
3. **You walk into the airlock.** No pointing at a hatch and a fade to black. You step into the vestibule, the outer hatch swings shut behind you, the inner one swings open in front of you, and you are in the hall. The teleport to the bigger-inside hall happens while both hatches are shut, so you never see it.
4. **Every door on the HDU works.** The model has four hatches; each is a working airlock into the hall.
5. **The porthole is a real window.** What you see through it changes with where your head is, in stereo, like looking through glass.
6. **The awning (the airlock canopy) and the tool stand (the locker rack) are gone.**
7. **Mission Control readies the astronaut.** The astronaut no longer points at a READY board; Mission Ops calls the astronaut GO from the lobby.

This changes rules (cover, how tools are taken, where the astronaut starts), so unlike the 1960s pass it is not a restyle. The look stays the [DESIGN.md](DESIGN.md) look: every new or moved thing uses the palette, the models in [ASSETS.md](ASSETS.md), and the [CLAUDE.md](../CLAUDE.md) rules (no raw primitives, juice on every action, look at the screenshots).

## What is there now (the audit)

| Thing | Where | How it works today |
| --- | --- | --- |
| The awning | `client/world.js` 721-736 | "Airlock canopy": a flat roof on two posts over the vestibule, an orange fascia, and a hazard-striped pad. `PLACES.canopy` (`client/shared/config.js` 89) is the meteor-cover box; `sheltered()` in `client/shared/rules.js` 9-13 tests it; the radar draws it as `COVER` (`client/console.js` 306-311). |
| The tool stand | `client/world.js` 685-719 | The "tool locker": an open rack at `PLACES.locker` (-3.6, 4.6) with slots (`lockerSlots`) and, since PR 5, a shadow board of four NASA tools (wrench, ratchet, hammer, grease gun) along its top. `client/stations.js` 112-147 and 260-312 hang the five game tools on it, take them (`take`), and put them back (`stow`). The server only lets you take or stow within `CFG.reach` of `PLACES.locker` (`server/game.js` 169-177), and it keeps `this.locker` as a list (`server/game.js` 29, 130, 293, 296). Mission Ops sees it as the `Locker` canvas (`client/console.js` 65, 236-270) and the radar marks it `LOCKER` (315). |
| Tools | `client/stations.js` 50-110 | Hand-built groups, parented to the rack, the belt or a hand every frame (345-370). No physics: a tool is only ever in one of those three places. Letting go away from the rack puts it back on the belt (306-313). |
| The airlock | `client/world.js` 477-517, `client/astronaut.js` 73-91, 245-251, 608-628 | One vestibule on the core's +z door, its outer hatch fixed open at 1.9 rad. An invisible pad `hatchOut` (astronaut.js 75) and an `AIRLOCK / POINT AND SELECT TO ENTER` sign: you point and pull the trigger, a black card fades in for 0.15 s, the rig is moved to `ROOM.arrive` in the hall 500 m away, the card fades out. Leaving is the same from the invisible `interior.hatch` pad (`client/interior.js` 306-308). You cannot actually walk into the vestibule: `CFG.habRadius` (2.9 m) pushes you back out (astronaut.js 685). |
| Doors on the HDU | `hab-module.glb` | One mesh, one material: the hatches are modelled frames with the door painted in the texture. None opens. See "The four doors" below. |
| The porthole | `client/world.js` 511-515, `client/astronaut.js` 549-581 | It *is* a live render (PR 8), which is why it shows the real lights and damage. But it is a 256 × 256 texture painted flat on the disc, updated every third frame, from a camera whose position follows the head by a quarter, clamped to ±0.5 m, with a fixed field of view and a fixed look point. So it barely moves when you move, and in the headset both eyes see the same flat picture on the glass: it reads as a photo stuck on the door. That matches what Sevan saw. |
| READY | `client/astronaut.js` 135-179, `server/hub.js` 132-137, `client/lobby.js` 131, 195-200 | Each seat readies itself. The astronaut does it in the headset by pointing at a READY board in front of the spawn point (`useBoard`, part of `useAny` at 262). The board still has the old neon colours (`#58e08a`, `#ffb84a`, `#05080a` at 159-166), which the 1960s spec phase 3 listed and which never got changed. |
| Physics | `client/damage.js` | Only the falling panels and cables in the hall, integrated by hand at 1.62 m/s². No physics library is vendored. |

### The four doors on the HDU

Rendered from each side (model placed as `world.js` places it, `x + 1.5`). Positions are read off the renders and the bounding boxes; the first PR measures them exactly by raycasting the model from outside (the same way the hull crack finds the skin, `world.js` 738-766) and puts them in `PLACES.doors`.

| Id | Door on the model | Outside, about (x, z), faces | Today |
| --- | --- | --- | --- |
| `S` | Core, between Segments B and C | (0, 2.6), +z | Our vestibule is built on it |
| `N` | Core, between Segments F and G | (0, -2.6), -z | Painted, does nothing |
| `W` | The short module stencilled AIRLOCK, its hatch on the south face | (-3.4, 1.35), +z | Painted, does nothing; `inModule` keeps you off it |
| `E` | The end of the long module | (7.6, 0), +x | Painted, does nothing; `inModule` keeps you off it |

The round dark windows on the dome and on Segment C are painted too. If those are "the window" Sevan meant rather than the airlock porthole, see phase 4, step 7.

## Ground rules

1. **The server still decides.** Physics runs on the astronaut's page only (it is the only page that has hands). The server learns where a tool is when it is taken or comes to rest, and checks what it can (is the tool loose, does it fit on the belt, is the astronaut inside or near it). Nothing physical changes the game by itself, as now.
2. **The Quest is the budget.** At most 12 moving bodies at once, simple shapes only (boxes, spheres, cylinders: no mesh colliders), the physics of the place you are not in does not run, and every phase is checked in `npm run vr` with the frame time printed.
3. **No fades, no visor text.** Getting in and out is diegetic: hatches, lamps, a hiss. A black card is allowed only as the fallback if a step below fails on the device.
4. **Moon gravity everywhere**, inside too: 1.62 m/s². Things fall slowly; that is half the charm.
5. **Every new action has juice**: a sound from `client/ambience.js` (or a new one beside it) at the place it happens, a visual response, and a haptic tick on the hand involved.
6. **The lobby keeps its look.** Phase 1 changes what the lobby *does* (who can press GO for the astronaut), using the classes it already has; it adds no new styling to `client/lobby.js`, `client/lobby/*.svg` or the lobby section of `style.css`.

## Phases

Each phase is a mergeable PR. Do them in this order: 0 and 1 are quick and independent, 2 needs 0, 3 needs 0, 4 needs 3.

0. **Take out the awning and the tool stand** (and move cover and the tools' home).
1. **Mission Control readies the astronaut.**
2. **Physics tools, found in the hall.**
3. **Walk-in airlocks, on all four doors.**
4. **A real porthole: a stencil portal into the hall.**

---

## Phase 0: take out the awning and the tool stand

### The awning

| File | Change |
| --- | --- |
| `client/world.js` 721-736 | Delete the canopy roof, fascia, posts and the hazard pad. The floodlight over the door (`world.js` 518-524) stays: it lights the way in. Put a small painted apron (the same hazard-stripe canvas, 1.4 × 0.8 m, on the regolith) in front of each vestibule built in phase 3 so the doors still read from a distance. |
| `client/shared/config.js` 85-89 | Remove `canopy`. Fix the comment at 85 ("inside is cover"). |
| `client/shared/rules.js` 7-13 | `sheltered(pose, rover)`: cover is **inside** (`pose.inside`, phase 3: the hall or any vestibule) or crouched beside the rover. Until phase 3 lands, `inside` is true whenever the astronaut is in the hall (`where === 'in'`). |
| `client/console.js` 306-311 | The radar stops drawing the canopy and `COVER`. Draw a small phosphor tick on the habitat circle at each door in `PLACES.doors` instead (one at `S` until phase 3), so the Technician can say "nearest hatch is east". |
| `server/game.js` | No change: it already calls `sheltered(this.astro, this.rover)`. The astronaut's pose gains `inside` (see phase 3; for now `astronaut.js` `myPose()` at 705-709 adds `inside: where === 'in'`). |
| `test/game.test.js` 199-201, 280; `test/vr.mjs` 573-576 | Replace "under the canopy" with "inside" (pose with `inside: true`). The full-shift test at 280 stands the astronaut inside. |
| `README.md` 160, 235; `docs/SPEC-v2.md` 95 | Cover is "go inside, or crouch beside the rover". Refresh `docs/astronaut-habitat.png`. |

Gameplay check: the meteor warning is 15 s. Without the canopy the solar panels at (9, 8-14) are about 10 m from door `E` once phase 3 opens it, and 12 m from `S`; at walking speed that is fine. Until phase 3, the only cover near the panels is the rover, so ship phase 0 and phase 3 close together, or keep `PLACES.canopy` in the rules (with nothing drawn) until phase 3 merges.

### The tool stand

| File | Change |
| --- | --- |
| `client/world.js` 685-719 | Delete the locker rack, `lockerSlots`, and the shadow board. The four NASA tools on it (wrench, ratchet, hammer, grease gun) move into the hall as loose clutter (phase 2). Remove `locker` and `lockerSlots` from `fixtures` (905) and `PLACES.locker` from `SITES` (331). |
| `client/shared/config.js` | Remove `PLACES.locker`. `CFG.spawn` moves inside (see "Where the astronaut starts" below). |
| `client/stations.js` 112-147, 260-272, 290-313, 345-360 | Remove the rack: the invisible rack boxes and the painted outlines, `take`/`stow` against the rack, `lockerPos`/`atLocker`, the `rack` grab kind and the rack placement branch. Phase 2 replaces them. |
| `server/game.js` 29, 130, 169-177, 293, 296 | `locker` becomes `tools` (phase 2). Until phase 2 lands, keep the list but drop the `near(PLACES.locker)` checks so the point-and-click fallback still works. |
| `client/console.js` 27, 65, 236-270, 315 | The `Locker` canvas becomes the **TOOL LOG** (phase 2). Remove the `LOCKER` mark on the radar. |
| `test/vr.mjs` 123, 144-160, 199-212, 408 | The rack tests go; phase 2 adds pick-up-from-the-floor tests. |

### Where the astronaut starts

**Recommendation: start inside the hall**, at `ROOM.arrive` (room 0, -1.3) facing up the hall, with the tools scattered round you. The first thing a new player does is look for tools and then walk out through an airlock, which teaches both new mechanics before the first fault (dust at 5 s in the demo script, which is outside and slow). `CFG.spawn` becomes `{ inside: true, x: 0, z: -1.3 }`, `astronaut.js` calls `place('in')` (608-622) at start, and the status board from phase 1 stands in the hall in front of the spawn. If the team prefers to start outside, spawn at (0, 6) facing door `S`; nothing else in this spec depends on it.

---

## Phase 1: Mission Control readies the astronaut

The astronaut puts the headset on and waits; Mission Ops checks they are suited and calls GO. That is how a real launch works, and it means nobody has to find and point at a board with a headset they have just put on.

### Server (`server/hub.js`)

- New message from the astronaut's page: `{ t: 'suited', on }`. Sent `true` on the WebXR `sessionstart` and when the desk mode starts (`astronaut.js` 808-810), `false` on `sessionend` (811). The hub keeps `this.suited` (false when the astronaut seat is empty: clear it in `remove()` at 52-56).
- `ready` (132-137): a `ready` from the astronaut seat is ignored. A `ready` from `ops` or `all` with `for: 'astronaut'` sets or clears `'astronaut'` in `this.ready`, and only while the astronaut seat is held and `this.suited` is true. Their own `ready` (no `for`) works as now.
- When `suited` goes false (the astronaut takes the headset off), `'astronaut'` leaves `this.ready` and the countdown stops (as `remove()` does now for a seat that leaves).
- `seats()` (35) and the broadcast (169-171) carry `suited`.
- `test/hub.test.js`: the astronaut cannot ready itself; Ops cannot ready an astronaut who is not suited; Ops can ready a suited one; Sci and Tech cannot; taking the headset off un-readies; 2-player `all` can ready the astronaut.

### Lobby (`client/lobby.js`), behaviour only

- New option `readyFor: ['astronaut']`, passed by `client/console.js` (49) for the `ops` and `all` seats, with `onReadyFor(role, on)` sending `{ t: 'ready', for: role, on }`.
- On those pages, the astronaut's panel gets the same `.lb-ready` button the seat's own panel uses (built the way 195-200 builds it, same classes, no new CSS): `ASTRONAUT GO` / `GO · press to stand down`, and while the astronaut is not suited the button is `disabled` and reads `NOT SUITED`. The panel's state line (193) reads `SUITED` instead of `STANDING BY` once suited.
- On the astronaut's own page the panel keeps its radio and VR steps (`actionsEl`), and gets no Ready button.
- Status line (223-224): "Crew complete. 3 of 4 ready. Mission Ops calls the astronaut GO."

### In the headset (`client/astronaut.js` 135-179)

- The READY board is no longer pointed at: drop `useBoard` from `useAny` (262). It becomes a **status board**: a `console` face in a `bezel` frame, one jewel lamp per seat (`lamp-amber` off = waiting, `lamp-green` on = GO), engraved seat names, and the countdown on Nixie digits; `STAND BY FOR GO` while waiting. This also clears the old neon colours at 159-166 that the 1960s pass missed. Draw it with `nixie()` and `jewel()` from `client/shared/palette.js`, as `console.js` does.
- When Ops calls the astronaut GO: the astronaut's lamp lights, a two-tone "go" sound plays from the board (a new `radio.sfx('go')`), and both controllers give one short pulse.
- It stands in the hall in front of the spawn (if the spawn moves inside), at eye height, 1.7 m ahead.

### Mission Control (`client/console.js`)

Nothing else: the readiness is on the lobby, which Mission Control already looks at before a mission.

---

## Phase 2: physics tools, found in the hall

### The engine: `cannon-es`, vendored

**Recommendation: [cannon-es](https://github.com/pmndrs/cannon-es) 0.20.0**, vendored like three.js: add it to `scripts/vendor-three.mjs` (copy `node_modules/cannon-es/dist/cannon-es.js` to `client/vendor/cannon-es/cannon-es.js`), add `"cannon-es"` to the import maps in `astronaut.html` (and in `test/` pages that need it), and `npm run vendor`.

Why it and not the alternatives, for this game on a Quest:

| | cannon-es | Rapier (`@dimforge/rapier3d-compat`) | Hand-rolled (like `damage.js`) |
| --- | --- | --- | --- |
| Size | ~90 KB gzipped, plain JS | ~1.5 MB (WASM as base64), async init | 0 |
| No build step | Yes: one ES module | Yes, but WASM start-up on page load | Yes |
| Enough for ≤ 12 bodies, boxes and cylinders, 72-90 Hz | Yes, well under 1 ms a step | Yes, faster | Only if tools never touch each other |
| Stacking, tumbling, sleeping, a heightfield | Yes | Yes | No |

A dozen bodies is far inside what cannon-es does comfortably in the Quest browser, and it is the least to ship and the least to learn this weekend. Move to Rapier only if we later want dozens of bodies or mesh colliders.

### `client/physics.js` (new)

One module owns both physics worlds. Nothing else imports cannon-es.

- **Two worlds**, `hall` and `surface`, gravity (0, -1.62, 0) each. Step only the one the astronaut is in (`where`), fixed 1/72 s with at most 3 sub-steps per frame (`world.fixedStep`). The other is frozen; the porthole shows the hall as it was left.
- **Sleeping on**, `sleepSpeedLimit` 0.05, `sleepTimeLimit` 0.5. A resting tool costs nothing.
- **Damping**: outside 0 linear (no air), inside 0.02; 0.1 angular both, so a tool does not spin forever.
- **Static colliders, hall** (room coordinates, built from `client/interior.js`): a floor plane, the walls of `HALL` and `COR` as thin boxes, and each `SOLIDS` box (`interior.js` 27-33) with a real height. Give `SOLIDS` a fifth number, the top: workbench 0.96, short arm 0.96, suit lockers 2.0, the suit 1.85, life support 2.4. Add the bench drawers' top and the shelf under the gantry if tools spawn there.
- **Static colliders, surface**: a `Heightfield` sampled from the terrain's `height(x, z)` (the one `world.js` uses for placing props) at 1 m within `CFG.bounds`, one cylinder for the HDU core (r 2.55, h 3.6), two for the side modules (`MODULES` in `astronaut.js` 287), a box per vestibule, a box for each solar panel and the depot crates. The rover is a **kinematic** box moved to the server's rover pose every frame, so a tool on the ground is shoved aside by it.
- **Hands**: a kinematic sphere (r 0.05) on each hand's grab point, so you can knock a tool off the bench or nudge it along the floor. On a laptop, none.
- **Contacts**: on `collide` with an impact speed over 0.6 m/s, call back with the place, the speed and the two materials, for the sound and the dust (see "Juice").
- API: `phys.add(id, shape, mass, place, pose)`, `phys.hold(id, handObject)` (kinematic, follows the hand), `phys.release(id, linVel, angVel)` (dynamic, thrown), `phys.remove(id)` (on the belt: out of the world), `phys.step(dt, where)`, `phys.onRest(cb)`, `phys.onHit(cb)`.

### The tools as bodies

Each game tool gets a compound collider of two or three primitives and a real mass. The meshes stay as they are in `stations.js` (the welder is the NASA pistol-grip tool; the others are hand-built and should be bevelled and textured per CLAUDE.md while we are in there).

| Tool | Collider | Mass (kg) | Notes |
| --- | --- | --- | --- |
| `brush` | cylinder handle + box head | 0.4 | |
| `patch` | box | 0.8 | |
| `welder` | box body + cylinder grip | 3.5 | The NASA pistol-grip tool's own box |
| `tire` | cylinder | 12 | Rolls. Fun on the regolith. |
| `gen` | box | 25 | Heavy: it barely moves when knocked |
| `wrench`, `ratchet`, `hammer`, `grease-gun` | box each | 0.3-1.2 | The NASA tools from the old shadow board. **Decoys**: loose in the hall, you can pick them up and throw them, nothing uses them, they never go on the belt, and they are not in `TOOLS`. They make the search a search. |

### Where the tools are at the start

- `PLACES.toolSpots` in `client/shared/config.js`: about a dozen spots in room coordinates where a tool can sensibly lie, each with a height and a coarse **area name** for Mission Control: `BENCH` (on the long bench, on the short arm), `UNDER BENCH` (floor, between the legs), `LOCKERS` (on top of the suit lockers, on the floor in front), `LIFE SUPPORT` (on its shelf), `CORRIDOR` (the stub at the north-east), `WEST DOOR` (the floor by it), `GANTRY` (the shelf under it, reachable at 2.0 m).
- `Game.start()` puts each of the five tools on a different spot. The **demo** script uses one fixed layout (judges see the same game every time); **free play** picks with the server's `rng` (`server/game.js` `pick`).
- The decoys get fixed spots, chosen so a few sit near the real tools.
- On the page, each tool is dropped from 5 cm above its spot when the mission starts, so it settles naturally.

### Picking up, carrying, dropping

Rules stay: the belt holds `CFG.beltCapacity` (4) weight units; a tool you carry counts whether it is in a hand or on the belt.

- **Grab** (`stations.js` `nearest()` 265-279 and `grab()` 290-305): a loose tool within `GRAB_LOOSE` (0.2 m; 0.35 for the tire and generator) of the hand gets the ring. Closing the hand sends `{ take: id }` and makes the body kinematic in the hand (`phys.hold`). If it does not fit (`fits()` false), it is still grabbed but the ring is red, the hand buzzes twice, and the server does not count it: it cannot be put on the belt and drops when let go. (Today it shakes on the rack; on the floor, holding it and feeling it refuse is clearer.)
- **Belt**: let go of a counted tool with the hand within 0.25 m of its belt slot (`BELT_SLOT`, 27) and it goes on the belt, as now; `phys.remove(id)`.
- **Drop and throw**: let go anywhere else and it is loose: `phys.release(id, v, w)` with the hand's velocity averaged over the last three frames (clamp 6 m/s) and its angular velocity, and the page sends `{ drop: id }`. It tumbles, lands and settles.
- **Rest**: when a dropped tool falls asleep, the page sends `{ rest: id, inside, x, y, z }` (world coordinates outside, room coordinates inside), so the server and Mission Control know where it lies.
- **Laptop**: a click on a loose tool takes it to the belt (as the rack click does now); **Q** drops the last tool taken, 0.6 m in front, with a small forward push. That keeps `npm run smoke` and desk play working without hands.
- **Using a tool** (brush, weld, patch, tire, generator cord) is unchanged: it must be in a hand or on the belt.

### Server (`server/game.js`)

- `this.locker` (list) becomes `this.tools`: `{ [id]: { at: 'belt' | 'loose' | 'gone', inside, x, y, z, area } }`. `belt` stays as the list of carried tools so `fits()`, `has()` and the views keep working.
- `{ take: id }`: allowed if the tool is `loose`, it fits, and the astronaut is where it is: `inside` and the astronaut is inside, or outside and within `CFG.reach` of its last resting place.
- `{ drop: id }`: from the belt to `loose`, at the astronaut's position until a `rest` arrives.
- `{ rest: id, ... }`: updates a loose tool's place (and its `area`: the nearest tool spot's area inside, `OUTSIDE` plus the nearest named place outside).
- The generator, once pulled, is `gone` (as now). The fitted tire is `gone`, and a new tire appears loose at the `CORRIDOR` spot after `CFG.tireRestockSeconds` (the cargo end of the hall).
- `view()` (292-296): the astronaut and Ops get `tools`; drop `locker`.
- `test/game.test.js`: take refused when it does not fit, refused outside for a tool inside, a drop then a take, the restocked tire appears in the hall.

### Mission Ops: the TOOL LOG (`client/console.js` 236-270)

The `Locker` canvas becomes **TOOL LOG**: one row per tool, its icon (`drawTool`), a jewel lamp (green = on the belt, amber = loose, off = gone), and the area engraved beside it in Courier Prime capitals (`BELT`, `BENCH`, `UNDER BENCH`, `CORRIDOR`, `OUTSIDE · SOLAR`...). Ops knows roughly where everything is; the astronaut has to look. That is a new reason to talk on the radio ("the welder is under the bench"), which is what the game is about. Update the Ops brief at 27.

Optional: the Technician's radar shows tools lying outside as tiny amber phosphor dots, so a tool dropped in the field can be found again.

### Juice

- **Impact**: a positioned `clank` from `client/ambience.js` (new, short filtered noise burst plus a pitched ring; pitch down with mass, gain up with speed) at the contact point. Inside it is a clank; outside, where there is no air, it is quieter and duller (you hear it through your boots and glove), only for tools within 3 m or in hand.
- **Outside**: a small dust puff (the `world.js` puff at 698) where a tool lands on the regolith, settling slowly in lunar gravity.
- **Hands**: a haptic tick when a held tool hits something, a stronger one on a throw release, and the grab ring (stations.js 205, 431) as now.
- **Picking up**: a soft click and the existing ring flash; the belt slot's lamp on the cuff lights.

### Budget and checks

- 5 tools + 4 decoys + at most 3 loose damage pieces (see below) = 12 bodies. Count them in `npm run vr` and print the physics step time; it must stay under 1.5 ms on the test machine.
- `test/vr.mjs`: replace the rack tests (199-212, 408) with: find the brush on its spot, grab it, put it on the belt; drop the welder, it lands and the server logs it loose with the right area; throw the brush, it travels; a tool too heavy for the belt is held with a red ring and refused.

### Optional, if time allows

- `client/damage.js` keeps its own integrator for the panels and cables (it is already lunar and cheap). A panel that has *fallen* could become a physics body so you can kick it, but only after the tools work.

---

## Phase 3: walk-in airlocks, on all four doors

### The idea

Each HDU door gets a vestibule (an airlock chamber), and the hall gets an **identical twin** of each vestibule on a hall wall. Walk into the outdoor one: the outer hatch swings shut behind you. Once it is latched, you are inside a closed box that looks exactly the same as its twin; in that frame the rig is moved to the twin, the surface is hidden and the hall shown. Nothing on screen changes. Then the inner hatch swings open onto the hall. Leaving is the same backwards.

This keeps the non-Euclidean trick (the hall is 12 × 7 m and lives at `ROOM.origin` 500 m away, bigger than the HDU outside) and hides it completely, without a fade.

### The vestibule, built once (`client/airlock.js`, new)

Lift the vestibule out of `world.js` 477-517 into `buildAirlock(THREE, { id, sfx })`, returning a group in its own frame (opening on local +z, the habitat on -z), with:

- `Hatch_Outer` and `Hatch_Inner` on hinge groups that **animate** (today both are static: the outer one fixed at 1.9 rad, the inner one a plain box at 511).
- The porthole in the inner hatch (`Porthole_Inner`) and one in the outer hatch (`Porthole_Outer`, the hole already cut at world.js 502).
- `Lamp_Status` (jewel lamp: green = a hatch is open to where you are, amber = cycling, red = blocked), a pressure dial on the side wall (cream face, a needle that swings during the cycle), the handrails, the roof lamp, the grate floor.
- `Floor_Trigger`: the box the head must be inside to start a cycle (the vestibule floor, 1.3 × 0.7 m, from 0.3 m inside the outer hatch).
- **Baked lighting.** Every surface inside the chamber uses a material that ignores the scene's lights: `MeshBasicMaterial` with the panel canvas texture pre-shaded (roof lamp falloff drawn into the canvas) or `MeshLambertMaterial` with that texture as `emissiveMap` and a black `color`. That is what makes the two twins identical on screen even though the surface has a sun and the hall has its own three lights. It is also cheaper on the Quest. The hatches' outer faces (seen from outside) keep their lit `MeshStandardMaterial`.

### The four pairs

`PLACES.doors` in `client/shared/config.js`: one entry per door, with the outdoor pose (x, z, facing) and the hall pose (room coordinates and facing).

| Door | Outside | Its twin in the hall | Hall work needed (`client/interior.js`) |
| --- | --- | --- | --- |
| `S` | Core south door (0, 2.6), faces +z | South wall, room (0, 0), the hatch that is there now | The hall's hatch (172-180) becomes the twin's inner hatch, on a hinge. Delete the invisible exit pad (306-308). |
| `N` | Core north door (0, -2.6), faces -z | North end of the corridor stub, room (2.5, -15), faces -z | Cut a door in the stub's north wall; nothing stands there now. |
| `W` | Short module's hatch (-3.4, 1.35), faces +z | West wall, room (-3.42, -3), faces -x | The "sealed door with a lit window" (189-193) becomes this twin's inner hatch, so it finally opens. |
| `E` | Long module's end hatch (7.6, 0), faces +x | East wall, room (3.5, -7.0), faces +x | New door between the suit lockers and the corridor, clear of `SOLIDS`; move the backup strip at (3.44, 0.25, -4.9) if it is in the way. |

Compass sense is kept where it can be (in at the south, you are at the south wall; in at the north, you are at the north end; in at the east, the east wall). `W` turns you 90°, which you only notice if you think hard about it, and that is the fun of a bigger-inside base.

Outside, the vestibules for `N`, `W` and `E` are built onto the model at those hatches, the same way `S` is now. `W` and `E` stick out of the side modules: extend `inModule` (`astronaut.js` 287-296) with a gap at each door so you can walk up to it, and the hab circle push (685) with a gap for `S` and `N`. Each vestibule gets its own floodlight and the hazard-stripe apron from phase 0, and its own small enamel placard (`AIRLOCK S`... in Michroma; no "point and select", since there is nothing to point at).

The transform for door *d* is `T_d = twin_d.matrixWorld · inverse(outdoor_d.matrixWorld)` (and its inverse to go out). Compute it once after both are built.

### The cycle (`client/astronaut.js`, replacing `go`, `place`, `passageStep` at 608-628 and `useHatch` at 245-251)

A small state machine per door, all timings in `CFG.airlock`:

| Step | Time | What happens |
| --- | --- | --- |
| Idle, outside | | Outer hatch open (swung to 1.9 rad), inner shut, lamp green. |
| Enter | head inside `Floor_Trigger` for 0.3 s | Outer hatch starts to swing shut (1.0 s, ease in-out), its wheel spins, a hinge creak and a heavy `hatch` clunk at the end, positioned at the hatch. Lamp amber. **Step back out before 0.6 s and it swings open again.** |
| Latched | | Both hatches shut. **Same frame:** move the rig by `T_d` (position and yaw, so the head keeps its exact place and view relative to the chamber), set `where = 'in'`, hide `outdoors`, show `interior.group`, turn the hall fog on, switch physics worlds. Nothing visible changes. |
| Repress | 1.2 s | A hiss (`radio.sfx('repress')`, new, a filtered noise swell), the pressure dial's needle swings up, a small vapour puff from the vent grille (a `Points` burst, as `damage.js` does), one long low haptic pulse on both hands. No camera shake in the headset. |
| Open | 1.0 s | Inner hatch swings open onto the hall, lamp green. Walking is clamped to the chamber until it is open past half way. |

Going out is the mirror: walk into the hall-side chamber, the inner hatch shuts, latch, `T_d⁻¹`, depress hiss, the outer hatch opens onto the Moon.

- **Walking during the cycle**: clamp the head to the chamber box (the same way `interior.clamp` clamps to the hall).
- **Desk mode**: identical; you walk in with WASD. Nothing is pointed at.
- **Shared doors**: only one door cycles at a time (the astronaut is in one place).
- **What the server sees**: `myPose()` (705-709) sends `inside: true` and `door: d` from the moment the outer hatch latches until it opens again on the way out. Indoors the map shows the astronaut at that door's outdoor position (today it is always `PLACES.airlock`). `inside` is cover (phase 0). The switchboard reach check (`server/game.js`, the `near(PLACES.board)` for the board fix) becomes "is inside".
- **Hall walls** (`interior.js` `inRoom`/`clamp`, 380-410): each hall door is a gap you can walk through into its chamber.
- **Delete**: `hatchOut` and the AIRLOCK sign (75-88), the black `shade` (89-91), `useHatch` and its place in `useAny`, the interior exit pad. `test/vr.mjs` 314-324 (in through the airlock by pointing) becomes: walk into `S`, wait for the cycle, check `where() === 'in'` and that the head's position relative to the chamber did not jump; walk out through `E`, end up outside door `E`.

### Look before calling it done

`npm run vr:shots` should add four shots: standing in the outdoor `S` chamber with the outer hatch half shut; the same moment from the hall-side twin (the two must look the same); the inner hatch open onto the hall; and door `E` from outside. Check them side by side.

---

## Phase 4: a real porthole, a stencil portal into the hall

### Recommendation: a stencil portal in the main pass

Draw the hall *through* the porthole in the same pass that draws the eye's view, masked by the stencil buffer. Because it is the same pass, WebXR draws it for each eye with that eye's own camera, so the view through the glass has true parallax **and true stereo depth**: it looks like a room behind glass, not a picture on it. It also draws only the porthole's pixels and needs no render target.

How, in `client/astronaut.js` (replacing `renderPortal`, 549-581) and `client/world.js` (the porthole mesh, now in `client/airlock.js`):

1. **Stencil on.** `new THREE.WebGLRenderer({ antialias: true, stencil: true })` (`astronaut.js` 30). three.js passes `stencil` to the XR layer, so the headset's framebuffer gets a stencil buffer too. Check this on the Quest first (see "Fallback").
2. **The mask.** The porthole disc gets a material with `colorWrite: false`, `depthWrite: false`, `stencilWrite: true`, `stencilRef: 1`, `stencilZPass: THREE.ReplaceStencilOp`, drawn after the opaque scene (`renderOrder` high), depth-tested, so it marks only the glass you can actually see.
3. **Punch the depth.** A second disc, same shape, a tiny `ShaderMaterial` that writes `gl_FragDepth = 1.0`, `depthFunc: THREE.AlwaysDepth`, `colorWrite: false`, stencil test `EqualStencilFunc` 1. It clears the depth behind the glass so the hall is not hidden by the HDU's own wall.
4. **Draw the hall through it.** In the same animation frame, a second `renderer.render(scene, camera)` with `renderer.autoClear = false`:
   - Move `interior.group` by `T_d⁻¹` (its matrix, not its position: set `matrixAutoUpdate = false` for the pass) so its door `d` twin sits exactly behind the outdoor door's inner hatch. The hall's lights are in the group, so they come along.
   - Hide `outdoors`, show `interior.group` (what `renderPortal` already does), set the hall fog.
   - Every interior material tests the stencil (`stencilWrite: true`, `stencilFunc: EqualStencilFunc`, `stencilRef: 1`, write ops `Keep`). Set this once at build time on all interior and damage materials, and toggle `stencilWrite` for the pass only; stencil state is set per draw, it does not recompile shaders.
   - A clipping plane at the inner hatch's plane (`renderer.clippingPlanes`, 0.1 m into the hall) drops the twin chamber and its shut hatch, which would otherwise fill the glass.
   - Put it all back: group matrix, visibility, fog, clipping, `autoClear`. Clear the stencil.
5. **Only when it can be seen.** Skip the pass unless the astronaut is outside, within 10 m of a porthole, the porthole is in the view frustum (bounding sphere test) and faces the head (dot product > 0). Draw at most one porthole per frame: the nearest that passes.
6. **Warm the shaders.** Toggling the outdoor lights off and the hall lights on, and the clipping plane, are different shader variants. Call `renderer.compile(scene, camera)` once in each state at load, so the first look through the glass does not hitch.
7. **The other way, and the painted windows (optional).** The hall-side outer hatch has a porthole too: the same pass in reverse would show the Moon from inside the chamber. The surface is heavier to draw than the hall (terrain, rocks, the LM), so only do it while the astronaut stands in a chamber, and only after measuring. The round windows painted on the HDU's dome and Segment C do not line up with anything in the hall; if Sevan meant those, the cheap answer is to make them dark glass with a faint warm glow from inside (emissive, `lamp-white` off value), not portals.

### Cost on the Quest

The hall is mostly four instanced batches plus a handful of models (the helmet, the glove, the bag, the suit) and the damage pieces: count its draw calls with `renderer.info.render.calls` in `npm run vr` and print them. Expect about 25 more draw calls per eye while the porthole is in view, only the porthole's pixels shaded, and nothing at all when it is out of view. The old path drew the same hall into a texture every third frame plus a texture upload; the stencil path costs about the same geometry and less fill, and needs no 256-pixel texture.

### Fallback: off-axis render target

If the Quest browser will not give the XR layer a stencil buffer, keep a render target but do it properly:

- For each eye (`renderer.xr.getCamera().cameras`), build the portal camera at that eye's pose transformed by `T_d⁻¹`, with an **off-axis frustum** through the porthole's rectangle (the generalised perspective projection: the near plane is the glass), not the fixed 55° look-at camera there is now.
- Two 512 × 512 targets (one per eye), drawn every other frame.
- The porthole shader samples the target in **screen space** (`gl_FragCoord` over the viewport), choosing the eye's target in `onBeforeRender` (three.js calls it per eye in XR).

That gives the right view from each eye at the cost of two extra hall renders and two texture samples. It is the plan B, not the plan.

### Checks

- `test/vr.mjs`: stand at two places 0.5 m apart in front of door `S`, render, and check that a known hall landmark (the green CRT on the bench) moves inside the porthole by about what geometry says it should. With the old porthole it barely moves; that is the regression this test pins.
- `npm run vr:shots`: the porthole from the left, centre and right (the docs image `visual-pass/airlock-porthole.png` gets replaced).
- Look at it in the headset: close one eye, then the other; the hall should shift between them like a real room.

---

## Done means

- No canopy and no tool rack anywhere: `grep -n "canopy\|locker" client server` finds nothing but history in comments you have removed too.
- The astronaut starts inside (or at the door, if the team chose that), with five tools and four decoys lying round the hall, different in free play and the same in the demo.
- Tools fall, roll, stack and can be thrown, at lunar gravity, with a sound, dust outside, and a buzz in the hand.
- Mission Ops sees where each tool was last seen, in words, on the TOOL LOG.
- All four HDU doors are airlocks you walk into; nothing is pointed at and there is no fade; the moment you change places cannot be seen in the headset.
- Cover is "inside" (any chamber or the hall) or crouched by the rover; the tests say so.
- Looking through the porthole while moving your head shows the hall moving behind the glass, in stereo.
- The astronaut cannot ready themselves; Mission Ops calls them GO once they are suited, from the lobby, which looks exactly as before.
- `npm test`, `npm run smoke`, `npm run vr` pass; `npm run vr:shots` and `npm run smoke:shots` pictures checked against DESIGN.md and the ones in `docs/` refreshed (habitat, airlock, porthole, interior with tools).
- Frame time in `npm run vr` printed before and after each phase, and someone has walked through a door in the Quest.

## Open questions (with the default this spec assumes)

1. **Start inside or outside?** Default: inside, in the hall with the tools. (Phase 0.)
2. **Who calls the astronaut GO?** Default: Mission Ops, or the all-in-one console in 2-player mode. Any Mission Control seat would also work.
3. **Can a held tool that does not fit be carried in the hand?** Default: you can hold it but it does not count, cannot go on the belt, and the work it is for is refused. The alternative is the old shake-and-refuse.
4. **The window**: this spec makes the airlock porthole a real window. If the painted round windows on the dome were meant, see phase 4, step 7.
