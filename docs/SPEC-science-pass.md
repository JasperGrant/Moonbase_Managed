# Science pass: an objective, a real Scientist console, a driver's Technician, a mission report

This builds on [SPEC-v2.md](SPEC-v2.md) (the faults, the cascades, the belt) and follows [DESIGN.md](DESIGN.md) for every colour, font and instrument. Nothing here touches the lobby.

## The problem

Today the shift has no goal beyond "don't run out of oxygen". The Scientist and the Technician read a gauge or a map, tell Ops what they saw, and Ops tells the astronaut. They are relays. The astronaut is the only one who changes the world.

## The idea

The shift is a **survey sortie**. Repairs keep the base alive; the survey is why anyone is up there.

- **Objective:** return core samples from the right sites before the shift ends. Faults pull the crew off the survey and force triage between "keep the lights on" and "get the sample".
- **Science and Tech act on the world through instruments, not by talking.** The Scientist's decisions show up as things the astronaut can see (a beacon on a site). Ops stays the only voice on the radio, so the spec-v2 rule that each role holds one kind of knowledge still holds, but nobody's job is to recite a screen.

### The survey loop

1. **Tech drives the rover** to a candidate site and parks within 3 m. The rover's spectrometer integrates for about 8 s while the rover is still. Driving off early throws the reading away.
2. **Science reads the peak** on the SPECTRUM CRT. The scale under the trace has four engraved marks: ICE, ORE, ROCK, DUST. Whichever mark the peak sits over is what the site holds. No reference card, no table.
3. **Science tags the site** with a pushbutton: SAMPLE or SKIP. A SAMPLE tag raises an amber beacon lamp on a pole at that site, visible from the habitat. Tagging a dud wastes the astronaut's walk and oxygen.
4. **The astronaut collects it:** takes the corer from the locker (new tool, weight 2), walks to the beacon, pushes it into the ground, pulls the tube, and returns it to the sample rack at the airlock. Everything is physical: grab, push, pull, carry.
5. **Value:** ICE 3 points, ORE 2, ROCK 1, DUST 0. Samples count only once racked.

Demo mission: 3 candidate sites, 2 worth sampling, scripted so judges see the same thing every time. Free play: sites are random each round.

### No dead ends (spec-v2 rule 4 still holds)

The astronaut can always sample every beacon-less site blind; it just costs oxygen and time. A blackout kills the spectrometer link and the beacon pings, so the survey stalls with everything else. That is the reason to fix power first.

## Scientist console: two instruments, learned in ten seconds

The Scientist has two jobs, and the console's brief says so in four short sentences: **"Find the zone. Ask for the part. Read the peak. Tag the rock."** If a part of this screen needs more explaining than that, cut it (spec-v2 design rule 3).

The look follows the Mission Control photo: recessed CRT windows in `console-deep` on a `console` face, `bezel` rims, a pushbutton bank, engraved capitals, six words at most per label.

### 1. The mimic board: find the zone, then ask for the part

One picture, drawn like a 1960s mimic panel: engraved lines joining jewel lamps, in two tiers.

- **Zone lamps:** POWER, AIR, ROVER. Each is a press-to-test lamp: press it and 1.5 s later it lights `lamp-green` (fine) or `lamp-red` (broken). Only one test runs at a time. A MASTER ALARM lamp flashes when anything breaks.
- **Part lamps**, under their zone: PANELS and BOARD under POWER; HABITAT WALL and SUIT under AIR. These stay dark until **the astronaut touches the amber TEST STUD on that part** (see "Two-way problem solving"). Then they light green or red, and the stud's own small lamp shows the same result to the astronaut.

| Fault | Zone that goes red | Part that goes red |
| --- | --- | --- |
| Dusty panels | POWER | PANELS |
| Tripped switchboard | POWER | BOARD (and the wiring diagram pulls up on the second CRT, as it does now) |
| Hull breach | AIR | HABITAT WALL |
| Suit leak | AIR | SUIT |
| Broken wheel | ROVER | none: the wheel is the only rover fault |

POWER and AIR each hold two faults. That is the point: a red zone is a question for the astronaut, not an order.

Two dials from today's POWER and AIR screens stay as they are: BATTERY (an edgewise meter) and DRAIN (a dial marked x1, x3, x5). The separate SOLAR and BOARD gauges are gone, so power no longer tells the Scientist which of its two faults is active.

### 2. The spectrum: tag the rock

One CRT, one trace, one scale with four words under it, and two keys: SAMPLE and SKIP. When the rover has finished a reading, the keys' lamps light amber. The peak sits over a word; press SAMPLE for ICE or ORE, SKIP for the rest. The decision that remains is which site is worth the astronaut's oxygen.

### Teaching it

- The demo starts with dust, which teaches the mimic board, and its first site is a clear ICE.
- For the first fault and the first site only, the next key to press pulses softly (at most 2 Hz). After that there is no help.
- The one-line brief sits on the console from the start.

### Parked, only if it plays well

The ring of six pressure sensors and the SECTOR lamp on the astronaut's wrist cuff (it narrows the hull-leak search) and a multi-channel telemetry trace. Both were cut because they are more to learn than the first version needs.

## Two-way problem solving: the astronaut is a sensor, not just hands

Today the Scientist's gauge names the fault and the astronaut obeys. The rule here is that **Earth knows the system-wide picture and the astronaut knows the ground truth, and a fault is solved by the two of them swapping what they know.** The radio stays astronaut and Ops only (the Mission Ops seat is CAPCOM, as in the real programme), still delayed 1.3 s each way. That delay makes every question cost 2.6 s, so a fault should take one or two exchanges, not ten.

1. **Coarse from Earth, fine on the ground.** The Scientist's zone lamps say POWER or AIR is bad, never which part. The astronaut finds the part by looking and listening, or by touching a glove to a TEST STUD (amber studs painted on the panel array, the switchboard box, the habitat wall, the rover hub and the forearm cuff). A touch lights the part lamp on the Scientist's board and the stud's own jewel lamp for the astronaut. A typical exchange: "POWER is red, and it is falling. What do you see at the panels?" "Dusty." "Then brush."
2. **The astronaut answers without words.** A FLARE button on the wrist cuff drops a marker on the Technician's radar at the astronaut's position ("I am here", or "look here"). The Technician can answer by driving the rover to it and switching on the rover's headlamp. Tech and astronaut can talk to each other without anyone relaying.
3. **A call that is not Earth's to make.** The SAMPLE tag is provisional. At the site, the astronaut sees the surface (frost glint on ice, dark crystal on ore, plain dust). They may reject a tag by leaving the beacon alone, and the beacon lamp then goes dark on the Scientist's board. Sometimes the astronaut will disagree with the CRT and be right.
4. **The astronaut's eyes win over a lying lamp.** In free play, one stud in about six sticks on green for a fault that is active. The astronaut standing in front of grey, dusty panels has to say "the lamp says fine, the panels say otherwise". Optional: ship this only if playtests find the first three too easy.
5. **Ops chairs the conversation.** Ops holds the belt picture and the clock and decides which question goes up the radio next. Each seat gets a one-line brief to match, shown on its screen from the start:
   - Astronaut: **"Say what you see and hear."**
   - Ops: **"Ask before you tell."**
   - Scientist: **"Find the zone. Ask for the part. Read the peak. Tag the rock."**
   - Technician: **"Drive. Answer the astronaut's flare."**

No dead ends (spec-v2 rule 4): every stud result is also visible to the astronaut on the stud itself, and the faults are visible without any test. The astronaut can still fix everything alone, only more slowly. A blackout kills the radio and the board, so in a blackout the astronaut is on their own, with studs and eyes.

## Technician: the driver

- **Driving is the job.** Arrow keys stay, but the console shows it as hardware: a throttle lever and a steering yoke drawn in the panel, a Nixie speed counter, and a heading dial. The rover camera sits in its own recessed CRT window.
- **Terrain matters.** The map has boulder fields and crater rims. Driving through one over about 70% of top speed risks a broken wheel (the demo script still breaks it on schedule; free play gets driver-caused breaks). Speed against safety is the decision.
- **Answer the flare.** The astronaut's FLARE puts a marker on the radar. Drive to it, and the rover's headlamp tells the astronaut you are coming. It works without anyone relaying.
- **The rover is cover and a taxi.** It already shelters the astronaut in a shower. Stretch: the cargo hook from spec-v2, so the Technician can deliver the tire or a sample.
- **Radar screen:** the existing phosphor scope with a range-and-bearing readout to the astronaut and the sites, drawn as a plotting table.

## Mission report: how the crew did

Replace the bare score with a flight director's report, printed on teletype (Courier Prime on `dial` paper), with a stamped verdict.

- **Verdict stamp** (Apollo-style, not letter grades): MISSION SUCCESS, PARTIAL SUCCESS, MISSION ABORTED, LOSS OF CREW.
- **Score** adds samples to what exists today: 100 per fault fixed, twice the oxygen left on a win, plus sample value times a bonus (tunable).
- **Per-seat lines**, one each, built from the existing `log`: Scientist (sites correctly tagged out of tagged), Technician (distance driven, boulder hits), Astronaut (repairs, plugs missed), Ops (belt swaps, seconds of dead air).
- **Highlights**, from the log: fastest repair, closest call (lowest oxygen reached), longest blackout.
- Extra fields on `result` in `server/game.js`: `samples`, `siteHits`, `siteMisses`, `lowestO2`, `blackoutSeconds`, `distance`, `boulderHits`.

## Visuals and sound

- Everything in the DESIGN.md palette: `phosphor` for CRTs, `lamp-*` jewel lamps for keys, `nixie` only on digits. No glass, no rounded cards, no cyan.
- Each action pairs a response with a sound: key click, relay clunk when a lamp is tested, a CRT hum that rises when it's powered, a beacon chirp, a corer thud. Generate them in code, as `client/ambience.js` does.
- In a blackout the consoles go to the grey-brown static from DESIGN.md.

## Where the code changes

- `client/shared/config.js`: sites, minerals and values, the `corer` tool, boulder fields, survey numbers, new score weights.
- `server/game.js`: `sites` and `samples` state, spectrometer integration, the SAMPLE and SKIP actions, rack and corer rules, the mimic-board tests (1.5 s each, one at a time), boulder-driven wheel risk, and the extended `result`. Add them to `view()` per role so each seat sees only its own instruments.
- `server/hub.js`: route the Scientist's test and tag actions; drop them in a blackout.
- `client/console.js`, `console.html`, `style.css`: the Scientist and Technician rebuilds, drawn on canvas like the existing consoles, using the shared `C` palette object.
- `client/world.js`, `client/stations.js`, `client/arm.js`: beacon poles, the sample rack and the corer interaction, the TEST STUDS with their jewel lamps, and the cuff's FLARE button.
- `test/game.test.js`: the corer weight and belt limit; a sample counting only once racked; a dud tag scoring nothing; a zone lamp reporting red only for a broken fault; a part lamp lit only by the astronaut touching its stud; only one zone test at a time; the FLARE button placing a radar marker; zone tests and tags dropped in a blackout; a boulder hit above the speed limit breaking the wheel; the report's fields.

## Build order

Each step leaves the game playable.

1. **Mission report.** No new rules, only `result` fields and the report screen. Cheapest, and it makes every later change visible.
2. **Scientist mimic board and test studs.** The zone lamps, the part lamps lit by the astronaut's touch, the BATTERY and DRAIN dials, the wiring diagram, and the FLARE button. This works on the faults that exist today.
3. **Technician driver console** and boulder terrain.
4. **Survey loop:** sites, spectrometer, tagging, the corer and the rack, mineral values.
5. **Polish:** sounds, tuning from real playtests, the demo script.

## Done means

- A new Scientist is given the one-line brief and nothing else, and finds their first fault and tags their first site within a minute.
- On the demo's POWER fault, the crew cannot name the part from the Scientist's board alone. The astronaut's report or a stud touch is needed, and the crew gets there in one or two radio exchanges.
- A full demo mission is winnable through the laptop fallback, with at least one sample returned.
- `npm test` covers the cases above; `npm run smoke:shots` shows the new consoles against DESIGN.md (palette, contrast, nothing glassy).
- The report reads at a glance and names the crew's best and worst moment.
