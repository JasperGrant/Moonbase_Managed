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

The Scientist has two jobs, and the console's brief says so in one line: **"Follow the light to the break. Read the peak, tag the rock."** If a part of this screen needs more explaining than that, cut it (spec-v2 design rule 3).

The look follows the Mission Control photo: recessed CRT windows in `console-deep` on a `console` face, `bezel` rims, a pushbutton bank, engraved capitals, six words at most per label.

### 1. The mimic board: find the break

One picture, drawn like a 1960s mimic panel: engraved lines joining jewel lamps.

`SUN > PANELS > BATTERY > BOARD > BASE`, with `HABITAT`, `SUIT` and `ROVER` as their own lamps.

- Every lamp starts dark and is a **press-to-test** lamp, as on real period hardware. Press one and it takes 1.5 s, then lights `lamp-green` (fine) or `lamp-red` (broken). Only one test runs at a time.
- The rule a player learns in one go: **start at the sun and press along the line until a lamp goes red.**
- A MASTER ALARM lamp flashes when anything breaks, so the Scientist knows to look. It goes out when everything is fixed.

| Fault | The lamp that goes red |
| --- | --- |
| Dusty panels | PANELS |
| Tripped switchboard | BOARD (and the wiring diagram pulls up on the second CRT, as it does now) |
| Hull breach | HABITAT |
| Suit leak | SUIT |
| Broken wheel | ROVER |

Two dials from today's POWER and AIR screens stay as they are: BATTERY (an edgewise meter) and DRAIN (a dial marked x1, x3, x5). Nothing else from the old tabs survives.

### 2. The spectrum: tag the rock

One CRT, one trace, one scale with four words under it, and two keys: SAMPLE and SKIP. When the rover has finished a reading, the keys' lamps light amber. The peak sits over a word; press SAMPLE for ICE or ORE, SKIP for the rest. The decision that remains is which site is worth the astronaut's oxygen.

### Teaching it

- The demo starts with dust, which teaches the mimic board, and its first site is a clear ICE.
- For the first fault and the first site only, the next key to press pulses softly (at most 2 Hz). After that there is no help.
- The one-line brief sits on the console from the start.

### Parked, only if it plays well

The ring of six pressure sensors and the SECTOR lamp on the astronaut's wrist cuff (it narrows the hull-leak search) and a multi-channel telemetry trace. Both were cut because they are more to learn than the first version needs.

## Technician: the driver

- **Driving is the job.** Arrow keys stay, but the console shows it as hardware: a throttle lever and a steering yoke drawn in the panel, a Nixie speed counter, and a heading dial. The rover camera sits in its own recessed CRT window.
- **Terrain matters.** The map has boulder fields and crater rims. Driving through one over about 70% of top speed risks a broken wheel (the demo script still breaks it on schedule; free play gets driver-caused breaks). Speed against safety is the decision.
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
- `client/world.js`, `client/stations.js`, `client/arm.js`: beacon poles, the sample rack and the corer interaction.
- `test/game.test.js`: the corer weight and belt limit; a sample counting only once racked; a dud tag scoring nothing; a test lamp reporting red only for a broken part; only one test at a time; tests and tags dropped in a blackout; a boulder hit above the speed limit breaking the wheel; the report's fields.

## Build order

Each step leaves the game playable.

1. **Mission report.** No new rules, only `result` fields and the report screen. Cheapest, and it makes every later change visible.
2. **Scientist mimic board.** The press-to-test lamps, the BATTERY and DRAIN dials, the wiring diagram. This works on the faults that exist today.
3. **Technician driver console** and boulder terrain.
4. **Survey loop:** sites, spectrometer, tagging, the corer and the rack, mineral values.
5. **Polish:** sounds, tuning from real playtests, the demo script.

## Done means

- A new Scientist is given the one-line brief and nothing else, and finds their first fault and tags their first site within a minute.
- A full demo mission is winnable through the laptop fallback, with at least one sample returned.
- `npm test` covers the cases above; `npm run smoke:shots` shows the new consoles against DESIGN.md (palette, contrast, nothing glassy).
- The report reads at a glance and names the crew's best and worst moment.
