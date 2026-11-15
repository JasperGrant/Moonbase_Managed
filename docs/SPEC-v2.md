# Moonbase v2: tools, root causes and cascading failures

This is the implementation spec for replacing the four panel minigames with physical, tool-based repairs. Read `README.md` first for how the code is laid out. Everything here builds on the existing architecture: `server/game.js` holds all rules and decides what each role may see, `client/shared/config.js` holds every number, and the clients only draw what arrives.

## The pitch in one line

Something breaks on the Moon. Mission control can see the symptoms but not the cause, the astronaut has the hands but not the information, and fixing things in the wrong order makes everything worse.

## Design rules

Follow these when a detail is not spelled out below.

1. **One bar decides the mission: oxygen.** Every failure eventually costs oxygen. Oxygen at zero is the only way to lose. Surviving until the clock runs out is the only way to win.
2. **The astronaut's part is always physical.** Grab, sweep, plug, trace, pull, duck. Never a button on a panel.
3. **Mission control reads pictures, not paragraphs.** Gauges, a map, a camera, a wiring diagram, lamps. No manual, no rule lists. If a screen needs more than about six words to explain itself, redesign it.
4. **No dead ends.** The astronaut can fix every fault alone by looking and by trial and error. Comms only make it faster. This matters because a blackout cuts comms.
5. **Each role holds one kind of knowledge.** Scientist knows *what* is wrong. Technician knows *where* and *when*. Mission Ops knows *what the astronaut is carrying*, and is the only voice on the radio.
6. **Remove the old game.** Delete the wires, frequency, airlock and drill minigames, the Scientist's manual, and the lander and gear loadout step. The tool belt replaces the loadout.

## Tools and the belt

Tools live in a **tool locker** beside the airlock. The astronaut can carry at most **4 weight units**.

| Tool | Weight | Fixes | Uses |
| --- | --- | --- | --- |
| Brush | 1 | Dusty solar panels | Unlimited |
| Patch kit | 1 | Suit leak | Unlimited |
| Welder | 2 | Hull breach | Unlimited |
| Space tire | 3 | Broken rover wheel | Consumed when fitted. The locker has a new one 30 s later |
| Backup generator | 3 | Nothing. Gives 25 s of power during a blackout | Once per mission |

The weights force a choice. Welder, brush and patch kit together fill the belt exactly, so the everyday kit leaves no room for the tire or the generator.

How it behaves:

- Tools hang on the locker rack. Grab one and it goes on the belt. If it would exceed 4 units, it refuses with a red flash and a buzz, and stays on the rack.
- To put a tool back, grab it off the belt and release it at the locker.
- The belt floats at the astronaut's waist. Grab a tool from the belt to hold it. Release it anywhere away from the locker and it snaps back to the belt. Tools are never dropped on the ground, so none can be lost.
- The astronaut starts the mission with an empty belt, standing at the locker.
- The server owns the belt and locker state and rejects any repair made without the right tool on the belt.

## Faults

There are five faults and one event. Each fault has a symptom that mission control sees, a cause that someone has to work out, and a physical fix.

### Power faults

Any active power fault drains the **battery**. It falls from 100% to 0% in 60 s (45 s in the first draft; lengthened when the switchboard moved indoors). With no power fault it recharges fully in 20 s. At 0% the base blacks out (see "Cascades").

The Scientist sees the battery falling, plus two gauges: **solar input** and **board output**. Reading these two gauges is how the team finds the cause.

**1. Dusty solar panels.** Solar input is low.

- Where: the solar array, about 10 m from the habitat. Three tilted panels, visibly grey with dust.
- Tool: brush.
- Fix: sweep the brush across the panels. Each panel is a grid of 2 by 3 dust cells and a cell clears when the brush passes over it. Dust puffs away and blue panel shows through. The Scientist's solar gauge climbs as cells clear. Fixed when all 18 cells are clear.

**2. Tripped switchboard.** *Removed: the switchboard was taken out of the game; dusty panels are the only power fault. See [SPEC-quest-fixes.md](SPEC-quest-fixes.md).* Solar input is fine but board output is low.

- Where: a switchboard box inside the habitat, on the west wall of the hall, reached through the airlock (first drafted on the outer wall; moved when the hall was built). Three cables have popped out and hang loose. Red lamp on the box, and the hall drops to its red backup lights.
- Tool: none, just hands.
- Fix: grab each cable plug and push it into the right socket. Cables are coloured, sockets are marked with shapes (triangle, circle, square, diamond). Only the Scientist sees the wiring diagram, which is a picture of coloured lines running to shapes. The pairing is random each time. A wrong socket sparks, spits the plug out and costs 4 oxygen. Fixed when all three are seated.

### Rover fault

**3. Broken rover wheel.** The rover stops where it is and will not drive.

- Symptom: the Technician's map turns to static, labelled NO RADAR, because the rover carries the radar. The astronaut dot and meteor warnings are gone with it. The rover camera still works.
- Where: wherever the rover stopped. The astronaut has no map. The Technician guides them using the last position they remember and what the rover camera can see. The rover flashes an amber hazard light.
- Tool: space tire.
- Fix: grab the broken wheel and pull it off the hub. Take the tire off the belt, push it onto the hub, and twist to lock. Fixed when it locks.
- There is no timer on this fault. The cost is flying blind until it is fixed.

### Pressure faults

The Scientist gets a single **LEAK** lamp with a hissing-air icon. It does not say where the leak is. Either leak makes oxygen drain **three times faster** until sealed. The astronaut works out which one it is by ear.

**4. Hull breach.** The hiss comes from a place in the world.

- Sound: a positional hiss from a crack in the habitat wall, at one of six preset spots around the dome. It gets louder as the astronaut gets closer and moves as they turn their head. A jet of white vapour marks the crack up close.
- Tool: welder.
- Fix: hold the welder's tip on the crack and trace along it with the trigger held. The crack is about 60 cm long, made of six points. Each point needs the tip within 12 cm for 0.4 s. Sparks fly and a glowing bead is left behind. Moving on too soon leaves that point unwelded. Fixed when all six are welded.

**5. Suit leak.** The hiss is inside the helmet.

- Sound: the same hiss, but locked to the head. It does not change when the astronaut turns or walks.
- Visual: a pulsing red spot on the left forearm, seen only by looking at the arm.
- Tool: patch kit.
- Fix: take the patch kit in the right hand and press it onto the spot.

### Event: meteor shower

- Warning: 15 s before impact, blips cross the Technician's radar toward the base with a shrinking ring. There is no warning if the radar is down.
- The shower lasts 8 s. Streaks in the sky, dust bursts on the ground, rumble. The first 3 s land far away so an astronaut with no warning who looks up still has a chance.
- Cover is either of: standing under the airlock canopy, or crouching (head below 1.1 m) within 1.5 m of the rover.
- Caught in the open: lose 20 oxygen, once per shower, and a suit leak starts.
- Aftermath: every shower leaves the solar panels dusty. It may also crack the hull. This is the root cause story: one shower sets off several faults at once and the team has to triage.

## Cascades

This is the strategy. When faults overlap, the order of repair matters.

| If this is left broken | Then this happens |
| --- | --- |
| A power fault | Battery reaches 0% and the base blacks out |
| Blackout | The radio is dead in both directions and every mission control screen shows static |
| Rover wheel | No map, no astronaut position, no meteor warning |
| No meteor warning | The astronaut is caught in the open |
| Caught in the open | 20 oxygen lost and a suit leak starts |
| Any leak | Oxygen drains three times faster (hull and suit together: five times) |

So the right order is usually power first (it has the shortest fuse and silences everyone), then the rover (it is the early warning), then leaks. But a suit leak with low oxygen can jump the queue. The team should have to argue about it.

**Blackout details.** It starts when the battery hits 0% and ends when the battery is back above 10%, which means the power fault has been fixed. During a blackout the habitat floodlight and station lamps go dark in VR, the astronaut's HUD shows NO SIGNAL, and the server stops relaying voice. The astronaut can still fix either power fault alone: dust is visible on the panels, and the switchboard can be solved by trial and error at 4 oxygen per wrong plug.

**Backup generator.** The astronaut sets it down and yanks the pull cord (grab the handle and pull 40 cm). The base gets 25 s of power: radio and consoles come back. It does not charge the battery and it works once. It is the "tell me everything quickly" button, bought with 3 of the 4 belt units.

## What each seat sees

Keep text to labels. Views are switched with big tabs so players have to go looking.

**Astronaut (VR).** Oxygen bar and belt weight on the HUD. No map, no gauges, no instructions. A fixture that needs a tool the astronaut is not carrying shows that tool's silhouette when they are within 2 m.

**Scientist: knows what.** Two tabs.

- POWER: a large battery gauge, a solar input gauge, a board output gauge. When the switchboard has tripped, the wiring diagram appears here.
- AIR: the oxygen bar, its drain rate as a needle, and the LEAK lamp.

**Technician: knows where and when.** Two tabs.

- RADAR: the map with the stations, the rover, the astronaut dot and meteor blips with a countdown ring. Static when the rover wheel is broken.
- ROVER CAM: the existing camera view. Arrow keys still drive the rover when it is working. Driving the rover to the astronaut gives them cover in a shower.

**Mission Ops: knows the kit, and is the voice.** The mission clock, the oxygen bar, a picture of the belt with the tools on it and the weight used, and a picture of the locker with what is left. Hold Space to talk, as now. Ops is still the only person the astronaut hears, with the 1.3 s delay.

**Mission Control (`/control`).** All three consoles on one page, as now.

In a blackout all consoles show static and a dead battery icon, nothing else.

## Mission script

Add a director that plays a list of timed events from `config.js`. Ship two lists.

**Demo mission (default, 3:00, the same every time for judges):**

| Time | Event | What it teaches |
| --- | --- | --- |
| 0:05 | Dusty solar panels | Reading gauges, the locker, the brush |
| 0:45 | Rover wheel breaks | The map goes dark, heavy tools force a belt swap |
| 1:25 | Meteor shower | Taking cover, and why the radar mattered |
| 1:35 | Aftermath: dusty panels, hull breach and tripped switchboard together | Triage and cascade |
| 2:30 | Suit leak | Listening, the patch kit |

**Free play:** after the first scripted fault, pick random faults every 25 to 35 s with at most three active, and a meteor shower about once a minute. Never spawn a fault that is already active.

Starting numbers, all in `config.js` and expected to be tuned by playing: round 180 s, base oxygen drain 0.35 per second, leak multiplier 3, meteor hit 20, wrong plug 4, battery drain 45 s, recharge 20 s, generator 25 s, belt capacity 4.

Score: 100 per fault fixed, plus twice the oxygen left on a win.

## Controls

- **Grab:** grip button on a controller, pinch with a bare hand. This is new, and is what picks up tools, plugs, the wheel and the pull cord.
- **Use a held tool:** trigger (welder). The brush and patch kit work on contact.
- **Crouch:** physically, in VR.
- Talk, move, turn and teleport stay as they are.
- **Laptop fallback for testing:** every repair must be doable with mouse and keys so headless tests can play a full mission. Click a tool to take it, click a fixture repeatedly or hold the mouse on it to work it, C to crouch. It does not need to be fun, only complete.

## Where the code changes

- `client/shared/config.js`: replace `ISSUES`, `STATIONS`, `GEAR` and `VEHICLES` with tools, fault definitions, fixture positions, the director scripts and the numbers above.
- `client/shared/rules.js`: delete the manual and the wire solver. Keep only what both sides need, such as cable colours and socket shapes.
- `server/game.js`: new state for battery, blackout, belt, locker, active faults, meteor timeline and generator. Replace `spawn`, `makeData` and `act`. The astronaut client reports progress on a repair (a cell brushed, a point welded, a plug seated). The server checks the tool is on the belt and the astronaut is within reach of the fixture, and it alone decides when a fault is fixed. Rewrite `view` so each role gets only what the "What each seat sees" section allows, and almost nothing during a blackout.
- `server/hub.js`: drop voice in both directions during a blackout. The Cloudflare room uses the same hub, so it follows.
- `client/world.js`: add the solar array, the switchboard box, the tool locker, the airlock canopy, the six crack spots, the rover's removable wheel and hazard light, and the blackout lighting state.
- `client/stations.js`: replace the four panels with the fixtures and their repair interactions.
- `client/astronaut.js`: grabbing, the belt, held tools, crouch detection, the suit-leak spot on the forearm, meteor effects and the trimmed HUD.
- `client/voice.js` or a new audio file: the hiss, positional for the hull and head-locked for the suit, plus welder, brush, spark, buzz and impact sounds. Generate them in code like the existing radio effects. Download nothing.
- `client/console.js`, `console.html`, `style.css`: the tabbed consoles, drawn gauges, the wiring diagram, radar blips and the static screen.
- `test/game.test.js` and `test/smoke.mjs`: rewrite for the new rules.
- `README.md`: update the alarms table, controls and seat descriptions.

## Build order

Each step leaves the game playable, so stop anywhere and still have a demo.

1. **Skeleton:** config, tools, belt and locker rules, battery, the director, role views, and unit tests. Consoles show the new state crudely. Old minigames removed.
2. **Grab and belt in VR,** with the locker in the world.
3. **Dusty panels and the brush,** with the Scientist's POWER tab. This is the first complete loop.
4. **Blackout:** radio cut, static screens, dark base.
5. **Rover wheel and the tire,** with the RADAR tab going to static.
6. **Meteor shower and cover.**
7. **Hull breach, suit leak and the hiss.**
8. **Switchboard and the wiring diagram.**
9. **Backup generator.**
10. **Polish:** sounds, sparks, dust, the Ops belt picture, tuning, README.

## Done means

- `npm test` covers: the belt weight limit; a repair refused without its tool; the battery draining to a blackout and recovering; voice dropped during a blackout; the radar hidden from the Technician while the wheel is broken; no meteor warning without radar; a meteor hit starting a suit leak; the three-times drain under a leak; the generator restoring power for 25 s once; each role's view containing only what this spec allows.
- `npm run smoke` plays the whole demo mission to a win through the laptop fallback, on the laptop server and on the Cloudflare worker.
- The Scientist and Technician consoles can be used by someone who has been told only "you know what is wrong" or "you know where things are".
- The scene stays inside the Quest 2 budget noted in the README.

## Stretch, only after everything above works

- The rover has a cargo hook that carries one tool, so the Technician can deliver the tire.
- A judge screen that shows the astronaut's view beside the three consoles.
