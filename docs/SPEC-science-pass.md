# Science pass: an objective, a real Scientist console, a driver's Technician, a mission report

This builds on [SPEC-v2.md](SPEC-v2.md) (the faults, the cascades, the belt) and follows [DESIGN.md](DESIGN.md) for every colour, font and instrument. Nothing here touches the lobby.

## The problem

Today the shift has no goal beyond "don't run out of oxygen". The Scientist and the Technician read a gauge or a map, tell Ops what they saw, and Ops tells the astronaut. They are relays. The astronaut is the only one who changes the world.

## The idea

The shift is a **survey sortie**. Repairs keep the base alive; the survey is why anyone is up there.

- **Objective:** return core samples from the right sites before the shift ends. Faults pull the crew off the survey and force triage between "keep the lights on" and "get the sample".
- **Science and Tech act on the world through instruments, not by talking.** The Scientist's decisions show up as things the astronaut can see (a beacon on a site, a lamp on the wrist cuff). Ops stays the only voice on the radio, so the spec-v2 rule that each role holds one kind of knowledge still holds, but nobody's job is to recite a screen.

### The survey loop

1. **Tech drives the rover** to a candidate site and parks within 3 m. The rover's spectrometer integrates for about 8 s while the rover is still. Driving off early throws the reading away.
2. **Science reads the spectrum** on the SPECTRUM CRT and matches its peaks against the reference card on the desk (a cream paper chart of four mineral glyphs: water ice, ilmenite, basalt, plain regolith). No text, only peak patterns and four pictures.
3. **Science tags the site** with a pushbutton: SAMPLE or SKIP. A SAMPLE tag raises an amber beacon lamp on a pole at that site, visible from the habitat. Tagging a dud wastes the astronaut's walk and oxygen.
4. **The astronaut collects it:** takes the corer from the locker (new tool, weight 2), walks to the beacon, pushes it into the ground, pulls the tube, and returns it to the sample rack at the airlock. Everything is physical: grab, push, pull, carry.
5. **Value:** ice 3 points, ilmenite 2, basalt 1, regolith 0. Samples count only once racked.

Demo mission: 3 candidate sites, 2 worth sampling, scripted so judges see the same thing every time. Free play: sites are random each round.

### No dead ends (spec-v2 rule 4 still holds)

The astronaut can always sample every beacon-less site blind; it just costs oxygen and time. A blackout kills the spectrometer link and the beacon pings, so the survey stalls with everything else. That is the reason to fix power first.

## Scientist console: "figure it out" instruments

Layout follows the Mission Control photo, in `console-deep` recesses on a `console` face with `bezel` rims.

- **Top row, wall displays:** the site map (LOLA contour lines in `phosphor`, sites as numbered crosses, the rover as a blip) beside the SPECTRUM CRT.
- **Middle, two recessed CRT windows:** SPECTRUM and TELEMETRY (one channel at a time, see below).
- **Pushbutton bank** under the windows: channel keys on the left, SAMPLE and SKIP keys on the right, with jewel lamps above each. Engraved labels in capitals, six words at most.
- **Desk:** the paper reference card, a Nixie sample counter and a Nixie clock.

### Telemetry: reading a trace, not a number

The Scientist no longer gets "solar 15%, board 100%". They get a six-key channel bank: SOLAR, BOARD, CABIN, SUIT, HULL, ROVER. One channel at a time shows a noisy trace on the TELEMETRY CRT. Each fault has a signature:

| Fault | What the trace shows |
| --- | --- |
| Dusty panels | SOLAR flat and low, rising in steps as cells are brushed clean |
| Tripped switchboard | BOARD a sawtooth that smooths as each cable is seated |
| Hull breach | CABIN pressure decaying along a slope |
| Suit leak | SUIT decaying faster than CABIN |
| Broken wheel | ROVER trace goes dead |

Looking at one channel means not looking at the others. That is the "figuring it out" part: the Scientist chooses where to look, and a second fault can go unnoticed.

### Leak survey: turning the hiss into a team puzzle

Six pressure sensors ring the habitat drum, one per crack position. With a hull breach, the HULL channel shows six small traces and the sensor nearest the crack decays fastest. Pushing that sector's key lights a **SECTOR lamp on the astronaut's wrist cuff** (diegetic: on the arm, not the visor). The astronaut still finds the exact crack by ear, only faster. No lamp is a dead end; the hiss alone still works.

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
- Each action pairs a response with a sound: key click, relay clunk when a channel switches, a CRT hum that rises when it's powered, a beacon chirp, a corer thud. Generate them in code, as `client/ambience.js` does.
- In a blackout the consoles go to the grey-brown static from DESIGN.md.

## Where the code changes

- `client/shared/config.js`: sites, minerals and values, the `corer` tool, boulder fields, survey numbers, new score weights.
- `server/game.js`: `sites` and `samples` state, spectrometer integration, the SAMPLE and SKIP actions, rack and corer rules, telemetry signatures per channel, the sector ping, boulder-driven wheel risk, and the extended `result`. Add them to `view()` per role so each seat sees only its own instruments.
- `server/hub.js`: route the Scientist's tag and sector actions; drop them in a blackout.
- `client/console.js`, `console.html`, `style.css`: the Scientist and Technician rebuilds, drawn on canvas like the existing consoles, using the shared `C` palette object.
- `client/world.js`, `client/stations.js`, `client/arm.js`: beacon poles, the sample rack, the corer interaction, the cuff's sector lamp.
- `test/game.test.js`: the corer weight and belt limit; a sample counting only once racked; a dud tag scoring nothing; telemetry signatures per fault; the sector ping lighting the right sector and dropping in a blackout; a boulder hit above the speed limit breaking the wheel; the report's fields.

## Build order

Each step leaves the game playable.

1. **Mission report.** No new rules, only `result` fields and the report screen. Cheapest, and it makes every later change visible.
2. **Scientist telemetry and leak survey.** The channel bank, the signatures, the SECTOR lamp. This works on the faults that exist today.
3. **Technician driver console** and boulder terrain.
4. **Survey loop:** sites, spectrometer, tagging, the corer and the rack, mineral values.
5. **Polish:** sounds, tuning from real playtests, the demo script.

## Done means

- A Scientist who is told only "you read the instruments" can find a fault's cause from the channel bank without anyone telling them the answer.
- A full demo mission is winnable through the laptop fallback, with at least one sample returned.
- `npm test` covers the cases above; `npm run smoke:shots` shows the new consoles against DESIGN.md (palette, contrast, nothing glassy).
- The report reads at a glance and names the crew's best and worst moment.
