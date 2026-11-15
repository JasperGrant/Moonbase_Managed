# Spec: the Real Mission (design it, fly it, read the report)

Status: written, not started. Audited against `claude/tender-thompson-apmr2e` at `3ba706e` (the sample run, the core drill, the tool racks and the waypoint beacon are in; `npm test` passes).

Read [CLAUDE.md](../CLAUDE.md), [DESIGN.md](DESIGN.md), [ASSETS.md](ASSETS.md), [SPEC-sample-run.md](SPEC-sample-run.md) and [SPEC-guidance.md](SPEC-guidance.md) first. This spec adds a third mission mode. Demo and Free play do not change. Where this spec disagrees with an older one, it wins **in the Real Mission only**; "What changes in the older rules" lists every place.

## Goal

A third mode, **Real Mission**, built for the NASA Space Apps 2026 challenge *Space Mission Design Game*. One loop is about 20 minutes and has three acts:

| Act | Length | What happens |
| --- | --- | --- |
| **Design** | about 4:00 | The crew designs the expedition before it flies. Each seat owns one decision: Mission Ops the **rocket**, the Technician the **rovers**, the Scientist the **instruments**, the Astronaut the **EVA kit**. All four share one ledger: mass, cost, power, data, time. Nobody can launch a design that does not close. |
| **Fly** | 15:00 | The surface mission that exists today, played with what the crew chose to bring. Things go wrong rarely (two to four times), and each one is a real procedure worked by all four seats. |
| **Report** | 1:00 and up | A mission report: what was achieved, what each decision bought and cost, what each anomaly was in real life, and how this design compares with the last one. |

The requests this answers:

1. A **separate section on the admin page** where the rovers and the rocket are chosen (and everything else in the design can be seen and set).
2. The **Technician selects the rovers**; **Mission Ops selects the rocket**, and each rocket changes the mission's parameters.
3. A **longer loop** (20 minutes) that is **more scientifically accurate** than the demo.
4. **Fewer anomalies, each with a deeper fix** that explains the real procedure.
5. Whatever else the challenge asks for that this game can honestly deliver (see the next table).

## What the challenge asks for, and where it is in this spec

| The challenge | Here |
| --- | --- |
| Define a mission objective before the engineering | Three objectives (PROSPECT, GENESIS, STATION). The objective sets the manifest and what each instrument is worth. |
| Choose a launch vehicle; check mass against its capacity | Three real launch vehicles. The server computes landed cargo from the rocket equation and refuses a design that is over. |
| Choose an orbit | The transfer: lunar orbit then down, or direct descent. It changes cargo, where the cargo lands, and how good the orbital survey is. |
| Spacecraft and payload, simple or advanced | Rovers (none, small, large in each of two slots), six instruments, two life-support packs, three spares kits, two radio links. |
| Mass, power, budget, data, communications, time | The ledger: five meters and a margin on each. Which two are critical for this mission is stated (mass and time). |
| Every decision has a consequence | Every card costs in at least two meters and changes something the crew can see or feel in the 15 minutes. "What each choice does on the Moon" lists them. |
| Rarely one perfect solution | A unit test walks every legal design (41,472 of them) and fails if one option is never in a near-best design. |
| Up to four players, different responsibilities, negotiation | Four seats, four decisions, one mass and cost budget. A change after the poll stands every GO down. |
| Single player | One person at `/control` can do the whole design and run the desk simulation; with a laptop astronaut (`SOLO=1`) they can fly it. |
| Modify the design and simulate it more than once | SIM RUN on the design board: a prediction from the same model that scores the flown mission. |
| Scoring that rewards success, science, efficiency, decisions | Four score lines: science, operations, efficiency, teamwork. |
| Difficulty levels, scenarios, random events | CADET, FLIGHT, CHIEF and SANDBOX; three objectives; an anomaly deck that the design changes. |
| Teach why, not just right or wrong | A WHY line on every card and every procedure step, and IN REAL LIFE in the report. |
| Dashboards of live resource use | The Scientist's TAPE, loads and reserve; the Technician's amp-hours; Mission Ops' walkback margin. |
| Mission report, post-mission analysis | Act three. |
| Save, share, compare designs; leaderboard | A design code on the report, typed into the admin page to fly it again; a board of the best missions on this server. |
| Competitive teams on one objective | Stretch (phase 5): the design code and the board already let two tables compare. |

## How this pass is checked

The rules are pure functions, so they are tested: every phase adds its cases to `npm test`. Anything drawn follows CLAUDE.md section 4 (`npm run smoke:shots`, `npm run vr:shots`, look at the pictures). Demo and Free play must behave exactly as they do today: a test asserts that their parameters equal today's `CFG` values.

## Ground rules

1. **Demo and Free play do not change.** Everything here is behind `mode === 'real'`. The lobby keeps its look (CLAUDE.md): the design board opens in the sheet that already opens over the lobby (`#planSheet`), not in the lobby's scenes.
2. **The server decides.** The design, the ledger and the GO poll live in `server/game.js`. The catalogue and the sums are in one shared file, `client/shared/mission.js`, pure data and functions, imported by the server, the consoles and the admin page.
3. **A design choice changes a parameter, never a rule.** At the start of a mission the server builds `game.params` from the mode and the design. Anything a choice can change is read from `params`, not from `CFG`. The clients get the part they need in their view.
4. **Every number on a card is real, or says it is not.** Each catalogue entry carries `real` (the number, its unit, its source) and `game` (what the simulation uses). A new file, `docs/SOURCES.md`, lists every one with a link. A number nobody could verify is marked `est.` on its card.
5. **Every choice costs in two meters and shows on the Moon.** A card that changes nothing the crew can see is cut.
6. **No single best design.** Checked by test (phase 1).
7. **Words are allowed in three places only:** data cards (design), procedure cards (anomalies) and the report. Cream cards, Courier Prime, capitals for plates. Nothing on the visor: the astronaut's words are on the cuff's label tape (SPEC-guidance) and on cards in the world.
8. **No dead ends** (SPEC-v2 rule 4). Every procedure can be finished by the astronaut alone from the cuff checklist, slowly. A design that cannot fly is refused before launch, not discovered on the Moon.
9. **One thing at a time** (SPEC-sample-run rule 10) stays. Comms always work for voice (rule 11) stays.
10. **The Quest is the budget.** No new light. New props are merged or instanced, and each rover variant costs no more draw calls than the rover it replaces plus four.

## What changes in the older rules (Real Mission only)

| Older rule | In the Real Mission |
| --- | --- |
| SPEC-v2 rule 3: pictures, not paragraphs | Stands for the instruments. Cards and the report carry sentences (ground rule 7). |
| A round is 6:00 | 15:00 on the surface. |
| Faults come every 20 s or so | Two to four anomalies in the whole mission, never in the first 2:30 or the last 2:00. |
| A fault is one action with one tool | An anomaly is a procedure of four to seven steps across the seats. The one-action fixes still work as the last step. |
| Meteor shower, 15 s warning; crouching beside the Hauler is cover | Solar particle event, 60 s warning; only the habitat is cover. Micrometeoroids stay as the cause of a cabin leak. |
| Every rock in the ground needs the core drill | Surface rocks (anorthosite, basalt, orange glass) are loose and picked up by hand. Ice comes only as a drilled core. |
| Oxygen refills indoors without limit | Each refill is drawn from the base reserve, which the design sets. |
| Oxygen drains at one rate | Riding drains at half the walking rate; carrying the drill at one and a half. |
| Dusty panels are a random fault | Dust is a consequence: of landing the cargo on the pad, and of a lost fender. |
| Two rovers, always | Whatever the Technician brought: none, one or two. |
| Mission Ops picks the mode | Still does, and the admin page can. |

## What is real and what is scaled

Say this once on the briefing card and once in the report. The game does not pretend.

| Thing | In the game | In reality |
| --- | --- | --- |
| Time | 15:00 of play | One 7 h 30 min day outside: 1 second of play is 30 seconds of mission. The mission clock reads hours and minutes. |
| Distance | The field is 120 m from the base | Stands for 7.6 km, the farthest an Apollo crew drove from the lander (Apollo 16 and 17 class traverses): 1 m is about 63 m. |
| Suit oxygen | 8:00 or 16:00 of play | The Apollo -6 pack was rated about 4 hours; the -7 pack of Apollo 15 to 17 raised oxygen to 1,430 psi for up to 8 hours. |
| Emergency oxygen | 60 s of play | The Oxygen Purge System gave about 30 minutes. |
| Storm warning | 60 s of play | X-rays arrive in 8 minutes; the protons that do the harm follow from tens of minutes to hours later. |
| Rover and walking speeds | Game values | Not real. A robot rover is far slower than a person (Lunokhod 1: 0.8 or 2 km/h); the LRV's record is about 18 km/h. Only the order is kept: Hauler, then walking. |
| Masses, power, data rates, the vehicles, the instruments, the procedures | Real figures | From the sources at the end. |

---

## Act one: the design

### Who decides what

| Seat | Decides (must) | Also decides (phase 1) | Sees |
| --- | --- | --- | --- |
| **Mission Ops** (flight director) | **Rocket** | Transfer; the objective and difficulty | The whole ledger; runs the GO poll |
| **Technician** | **Rovers**: the Scout slot and the Hauler slot | Radio link | Ledger |
| **Scientist** | **Instruments**: any of six | | Ledger; what each instrument is worth for this objective |
| **Astronaut** | **EVA kit**: life-support pack and spares | | Ledger, as five small dials |
| **Mission Operator** (2-player) | Everything Earth-side | | |
| **Admin** (referee) | Can set any slot, load a preset or a design code, lock the design | | Everything |

Every seat sees every card and the whole ledger. A seat can change only its own slots. Mass and cost are shared, so the talking is the game: the Technician's large rover is the Scientist's instruments and the Astronaut's spare wheel.

### The ledger

Five meters, each an edgewise meter with a red arc past 100 % and the margin on a Nixie pair. `ledger(design)` in `mission.js` returns all of it; the server is the only judge of GO.

| Meter | Used | Limit | Critical? |
| --- | --- | --- | --- |
| **MASS** kg | Every card | Landed cargo of the rocket and transfer | **Yes.** It decides what can come at all. |
| **COST** $M | Every card | The budget (difficulty) | Caps the design; what is left over scores. |
| **POWER** W | Life support 650, thermal 150, the link, the instruments | The solar array, 1,000 W clean | Only with a heavy payload, and only when the array is dusty. |
| **DATA** kbps | Rover telemetry (0.5 for a Scout, 0.3 for a Hauler) and the instruments | The link | Only with several instruments on the small antenna. |
| **TIME** h | 7 h 30 min planned outside | Suit hours × (1 + refills in the base reserve) | **Yes.** Mass left over becomes reserve. |

- **Margin becomes consumables.** Cargo mass not spent is loaded as oxygen, water and scrubber canisters: one suit refill for every 25 kg, six at most. A crew that fills the rocket to the last kilogram flies with none, and a 4-hour pack with no refill cannot cover the day: NO-GO on time.
- **GO needs** mass, cost and data at or under 100 %, power at or under 100 % with a clean array, time at or over 100 %, and every mount satisfied (an instrument that rides on a rover needs that rover).
- **NO-GO says why**, in one line per problem, on every seat's board: `MASS OVER BY 84 KG`, `NEUTRON SPECTROMETER NEEDS A SCOUT`.
- **The poll.** Pressing Ready is calling GO. The server refuses a Ready while the ledger is NO-GO. Any change to any slot stands every seat's Ready down: the poll is taken again, as it is in a real flight control room. The astronaut is still called GO by Mission Ops.
- **The design clock** counts up from the moment the fourth seat is taken. It never forces a launch. Past 4:00 the teamwork score falls (see "The score").
- **The board opens on a reference design** that is legal and ordinary (CADET and FLIGHT), so a crew can launch at once or improve it. On CHIEF it opens empty.

### The catalogue (`client/shared/mission.js`)

Period hardware, because it is documented to the kilogram and it fits the look. "Game" is what the simulation uses when it differs. `est.` means no primary source was found while writing this spec: phase 0 verifies or re-marks it in `docs/SOURCES.md`.

**Rockets (Mission Ops).** Cargo is derived, and the card shows the sum: of what the rocket sends toward the Moon, the landing burn (about 3 km/s) leaves four tenths, and the lander's own tanks, legs and engine are two thirds of that. Luna 17 is the check: about 5,600 kg sent, a 756 kg rover delivered, 13.5 %.

| Id | Plate | It flew | Sent to the Moon | Cargo landed (orbit / direct) | Cost | What it buys in play |
| --- | --- | --- | --- | --- | --- | --- |
| `atlas` | ATLAS-CENTAUR | Surveyor 1, 1966: 995 kg sent, 294 kg landed, 63.6 hours, direct | 1,000 kg | 135 / 150 kg | $20M est. | A walking expedition with a small scout. Nearly the whole budget is left for efficiency. |
| `proton` | PROTON-K | Luna 17, 1970: delivered Lunokhod 1 | 5,600 kg | 756 / 830 kg | $60M est. | One large rover, or a Hauler and a small scout with instruments and a few refills. |
| `saturn` | SATURN V | Apollo 15 to 17 | 43,500 kg | 5,900 / 6,500 kg | $185M (1969 to 1971 dollars) | Everything, with the reserve full. Leaves little budget on FLIGHT and breaks it on CHIEF. |

**Transfer (Mission Ops).** This is the orbit decision.

| Id | Plate | Real basis | Cargo | Where the cargo lands | Orbital survey | Side effect |
| --- | --- | --- | --- | --- | --- | --- |
| `orbit` | LUNAR ORBIT, THEN DOWN | Apollo and Luna 17. Apollo 12 came down 163 m from Surveyor 3 | as listed | On the pad, 20 m from the door | The chart's heat map is in 15 m blocks: an orbiter mapped the site first | The descent plume dusts the solar array: the mission starts with the panels half covered (Apollo 12 found Surveyor 3 sandblasted by its own landing). +$10M |
| `direct` | DIRECT DESCENT | Surveyor | +10 % (300 m/s less to cancel) | 70 to 100 m out, at a bearing drawn at launch | 30 m blocks, as today | The rovers, the drill and the instruments start out there. No plume dust. |

**Rovers (Technician).** Two slots.

| Slot | Id | Plate | Real basis | Mass | Cost | In play |
| --- | --- | --- | --- | --- | --- | --- |
| Scout | `none` | NO SCOUT | | 0 | 0 | The chart develops only round the Hauler. |
| Scout | `slrv` | SURVEYOR ROVER | The 1964 Surveyor Lunar Roving Vehicle study (Bendix; General Motors built a six-wheeled prototype): a 100 lb limit | 45 kg | $5M est. | Speed 3 m/s, reveal 8 m, one instrument mount. Fits on an Atlas. |
| Scout | `lunokhod` | LUNOKHOD CLASS | Lunokhod 1, 1970: 756 kg, driven from Earth by five-person crews on slow-scan television | 756 kg | $30M est. | Today's Scout: 6 m/s, reveal 16 m, two mounts, powers itself from its solar lid. |
| Hauler | `none` | NO HAULER | Apollo 11 to 14 | 0 | 0 | The astronaut walks. Samples come home two at a time. |
| Hauler | `lrv` | LUNAR ROVING VEHICLE | Apollo 15 to 17: 210 kg, carries 490 kg, two 36 V 121 Ah batteries that cannot be recharged, rated 92 km | 210 kg | $10M (the programme was $38M for four) | Today's Hauler, with an AMP-HOURS meter: 1,450 m of driving in the whole mission (92 km at the field's scale). |
| Hauler | `molab` | MOBILE LABORATORY | The 1964 MOLAB studies: a pressurised two-person rover, about 3.7 t in one study (est.), never built for flight | 3,700 kg | $60M est. | 3.5 m/s, a tray of eight cups, a suit umbilical on the footplate (oxygen refills at a third of the base rate while riding), half the storm dose aboard. No amp-hour limit (fuel cells). Saturn V only. |

**Instruments (Scientist).** Any of six. Worth is per objective (see below).

| Id | Plate | Real basis | Mass | Power | Data | Cost | Mounts | In play |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ns` | NEUTRON SPECTROMETER | Lunar Prospector, 1998: found hydrogen at the poles from orbit | 4 kg est. | 3 W | 0.1 | $3M | A Scout | Ice shows on the chart as soon as the Scout's reveal circle touches it, and never as a false positive. |
| `alsd` | CORE DRILL | The Apollo Lunar Surface Drill, Apollo 15 to 17 | 13 kg est. | 40 W (charger) | 0.2 | $2M | The Hauler's rack, or carried | The existing drill. Without it there is no ice. |
| `ms` | MASS SPECTROMETER | Apollo 17's atmosphere experiment; VIPER's MSolo | 9 kg est. | 60 W | 0.4 | $6M | The sample port | Every banked sample is worth half as much again. |
| `tge` | TRAVERSE GRAVIMETER | Apollo 17, carried on the rover: one reading at each stop | 13 kg est. | 15 W | 0.05 | $4M | A Hauler | Science for each 30 m block where the Hauler has stood still for 6 s. |
| `pse` | SEISMOMETER | The Passive Seismic Experiment of every ALSEP | 12 kg est. | 6 W | 0.5 | $5M | Set out by hand (phase 5) | Science every minute once levelled 60 m or more from the base. |
| `lrrr` | LASER REFLECTOR | Apollo 11, 14 and 15. Still in use | 24 kg est. | 0 | 0 | $2M | Set out by hand (phase 5) | Science once, when aimed at Earth. Costs no power and no data: the only card that does not. |

**Radio link (Technician).**

| Id | Plate | Real basis | Mass | Power | Carries | In play |
| --- | --- | --- | --- | --- | --- | --- |
| `omni` | OMNI ANTENNA | Apollo's low bit rate | 0 | 20 W | 1.6 kbps | Voice is unaffected. The rover cameras are slow-scan: one frame every 2 s. |
| `hga` | HIGH-GAIN DISH | Apollo's high bit rate; the rover's own relay unit and dish | 25 kg est., $6M | 80 W | 51.2 kbps | Full-rate cameras. Data never binds. |

**EVA kit (Astronaut).**

| Slot | Id | Plate | Real basis | Mass | In play |
| --- | --- | --- | --- | --- | --- |
| Pack | `p6` | -6 PACK, 4 HOURS | Apollo 11 to 14 | 0 | A full suit lasts 8:00 of play walking. |
| Pack | `p7` | -7 PACK, 8 HOURS | Apollo 15 to 17: oxygen raised to 1,430 psi | 12 kg est., $2M | 16:00. |
| Spares | `lean` | TAPE AND PATCHES | | 5 kg | Every anomaly is the improvised procedure. |
| Spares | `std` | STANDARD SPARES | | 25 kg, $1M | Adds one wheel, two round scrubber canisters, two clamps. |
| Spares | `full` | FULL SPARES | | 60 kg, $3M | Adds a second wheel, a fender, a third canister and the backup generator. |

**Objectives (Mission Ops proposes; it is on every board).**

| Id | Plate | Real basis | Manifest | What scores most |
| --- | --- | --- | --- | --- |
| `prospect` | PROSPECT | Water ice in shadowed polar craters (Lunar Prospector, LCROSS, the VIPER plan) | 3 ice, 1 anorthosite | Cores. The drill is required; the neutron spectrometer and the mass spectrometer pay. |
| `genesis` | GENESIS | Apollo 15's Genesis Rock: the Moon's oldest crust | 2 anorthosite, 2 basalt, 1 orange glass | Reach and carrying. Rovers, cups and the gravimeter pay. |
| `station` | STATION | ALSEP: instruments left running for years | Seismometer and reflector set out, 2 samples | Phase 5. |

**Difficulty.** CADET: budget $400M, two anomalies, NO-GO lines name the fix. FLIGHT: $300M, three. CHIEF: $240M, four, the board opens empty. SANDBOX: no limits, the meters still read, nothing goes on the board.

### What each choice does on the Moon

`game.params`, built in `start()` from `paramsFor(mode, design)`. In Demo and Free play it is today's `CFG` and `ROVERS` values, unchanged.

| Parameter | Today | Set by |
| --- | --- | --- |
| `roundSeconds` | `CFG.roundSeconds` 360 | 900 in the Real Mission |
| `o2Seconds` (a full suit, walking) | 286 | The pack: 480 or 960 |
| `refills` (base reserve, in suits) | unlimited | Leftover kg / 25, at most 6 |
| `drainRiding`, `drainCarrying` | 1, 1 | 0.5, 1.5 |
| `rovers.scout`, `rovers.hauler` | `ROVERS` | The rover cards, or `null` for none |
| `haulerRangeM` | unlimited | 1,450 for the LRV |
| `tray` | 4 | 4, or 8 on the MOLAB |
| `umbilical`, `shield` | none | MOLAB |
| `cargoAt` | the pad | The transfer: the pad, or a point 70 to 100 m out |
| `plumeDust` | no | The transfer: half the dust cells set at the start |
| `heatBlock` | 30 m | The transfer: 15 or 30 |
| `linkKbps`, `tvEveryMs` | no limit, 0 | The link |
| `loads` (W, by name) and `supplyW` | not modelled | The instruments and the link |
| `instruments` | the drill | The instrument cards |
| `spares` | one tire, restocked | The spares kit: counts of wheel, canister, clamps, fender, generator |
| `manifest`, `worth` | four samples, 250 each | The objective |
| `anomalies` | the fault scripts | Difficulty, and what was brought (no Hauler, no fender anomaly) |

### The design board (Mission Control)

In `#planSheet`, in the period look. The sheet today is the briefing and the mode picker (`console.js` 148-161); in the Real Mission it becomes the board.

```
+---------------------------- MISSION DESIGN REVIEW ---------------------------+
| OBJECTIVE [PROSPECT]   DIFFICULTY [FLIGHT]   DESIGN CLOCK [02:14]            |
|                                                                              |
| MASS  ====|=====.   COST  ===|======.   POWER ==|=======.                    |
|  [ 309 / 756 KG ]    [  93 / 300 ]       [ 863 / 1000 W ]                    |
| DATA  ======|===.   TIME  =========|.    (red arc past 100 on each)          |
|  [ 1.1 / 1.6 ]       [ 56 / 7.5 H ]                                          |
|                                                                              |
| ROCKET        ROVERS         INSTRUMENTS        EVA KIT                      |
| (o) ATLAS     SCOUT (o)(o)(o)  [x] NEUTRON       PACK (o)(o)                 |
| (*) PROTON    HAULER(o)(*)(o)  [x] DRILL         SPARES (o)(*)(o)            |
| (o) SATURN V  LINK  (*)(o)     [ ] MASS SPEC ...                             |
|                                                                              |
| +-- the card under the pointer: a line drawing, four numbers, one WHY --+    |
| | LUNAR ROVING VEHICLE  210 KG  $10M  RANGE 92 KM  FLEW APOLLO 15-17    |    |
| | WHY: IT CANNOT BE RECHARGED. EVERY METRE DRIVEN IS SPENT.             |    |
| +-----------------------------------------------------------------------+    |
|                                                                              |
| GO/NO-GO   (OPS) (TECH) (SCI) (ASTRO)      [ SIM RUN ]   (NO-GO lines here)  |
+------------------------------------------------------------------------------+
```

- A slot is a row of jewel lamps under engraved plates; the chosen one is lit `lamp-amber`. Slots that are not yours are drawn the same but do not take a click. Cards are cream `dial` with `ink-dial` type and a line drawing from `icons.js` (`drawCard(g, id, x, y, w)`, new).
- **SIM RUN** shows `estimate(design)`: the samples and science a competent crew should bring home, as a range, and the risks it sees (`ONE REFILL`, `NO SPARE WHEEL`, `DATA TIGHT`). Real flight controllers ran simulations before every mission; this is that. It is the same function the report uses for "roads not taken".
- Feedback: a lamp click and a relay tick on every pick; the meter needles swing; a NO-GO line types out on the teletype strip; all four GO lamps lit plays the status board's "go" tones.
- The astronaut's kit, phase 1: set by Mission Ops from the astronaut's panel (where they already call the astronaut GO), or by the laptop astronaut with the `1` to `5` keys. Phase 3 adds a kit panel in the hall beside the status board: two rotary selectors the hand turns, the five meters as small dials, one card.

### The admin section (`client/admin.html`, `client/admin.js`)

A new panel, **Real Mission**, under the existing Mission panel. It is the referee's and the demo-giver's view of the design.

```
+--------------------------- REAL MISSION ---------------------------+
| Mode [Real Mission v]  Objective [PROSPECT v]  Difficulty [FLIGHT v]|
|                                                                    |
| Slot         Owner        Pick                        Set it       |
| Rocket       Mission Ops  PROTON-K                    [select v]   |
| Transfer     Mission Ops  LUNAR ORBIT, THEN DOWN      [select v]   |
| Scout        Technician   SURVEYOR ROVER              [select v]   |
| Hauler       Technician   LUNAR ROVING VEHICLE        [select v]   |
| Link         Technician   OMNI ANTENNA                [select v]   |
| Instruments  Scientist    NEUTRON, DRILL              [checkboxes] |
| Pack         Astronaut    -7 PACK                     [select v]   |
| Spares       Astronaut    STANDARD                    [select v]   |
|                                                                    |
| MASS 309/756  COST 93/300  POWER 863/1000  DATA 1.1/1.6  TIME 56/7.5|
| GO: Ops yes, Tech yes, Sci no, Astro no     NO-GO: none            |
|                                                                    |
| Preset [Apollo J class v] [Load]   Design code [__________] [Load] |
| [ ] Lock the design (the seats can look but not change)            |
| While flying:  Inject anomaly [fender v] [Inject]   Next in 2:10   |
| Best missions on this server: ...                                  |
+--------------------------------------------------------------------+
```

- The admin can set any slot at any time in the lobby. That is how the Technician and Mission Ops choose in phase 0, before the seats have a board of their own, and how one person sets up a demo.
- **Presets:** `SURVEYOR LIGHT` (Atlas, small scout, walking), `LUNOKHOD` (Proton, the large scout alone), `APOLLO J CLASS` (Proton, LRV, small scout, drill), `SATURN LOGISTICS` (Saturn V, MOLAB, everything).
- **Inject** fires a named anomaly now, if nothing is broken. In real simulations the Simulation Supervisor did exactly this to the flight controllers.
- The admin page keeps its plain look; it is a tool, not a console.

---

## Act two: flying it

The sample run as it is, with the changes in "What changes in the older rules". New instruments on the consoles, all in the period look:

| Seat | New | What it is for |
| --- | --- | --- |
| Mission Ops | **PROCEDURE** card; **WALKBACK** dial | The checklist to read up. The Apollo rule: never be farther out than the suit can walk home on what is left. The dial is seconds of margin; a red lamp below zero. |
| Technician | **AMP-HOURS** (LRV), **BATT TEMP**, four **MOTOR AMPS** needles; slow-scan cameras on the omni link; the METEOR lamp becomes **FLARE** with an X-ray needle (C, M, X) | The rover as a machine with limits. |
| Scientist | AIR in real units: **CABIN** psi and its rate, **CO2** mmHg (amber at 7.6, red at 15), **SUIT** psi, **RESERVE** in refills, **DOSE** in mSv. POWER gains a row of **load switches**, one per instrument. A **TAPE** meter | What is wrong, how long there is, and what to switch off. |
| Astronaut | The cuff's label tape shows the current step; a red **OPS** pull on the chest | Real crews wore a checklist on the cuff. |

- **Data.** Banking a sample, a core, a gravimeter stop and a running instrument each write science to the tape. The link empties it at its rate. A full tape loses the newest data; the Scientist switches an instrument off to stop it. Science scored is science sent.
- **Load shedding.** Switching an instrument off drops its watts and its data. When the array is dusty and the loads exceed it, the battery falls at a rate set by the deficit (the existing battery, `game.js` 197-208); shedding slows it. This is what Apollo 13 did.
- **Reserve.** Each second of refill indoors is drawn from `refills`. At zero the suit no longer refills. A cabin leak vents it.

### Anomalies

Drawn at launch from a deck, without repeats: the count is the difficulty, the first comes no earlier than 2:30, the next 2:30 to 3:30 after the last was closed, none in the last 2:00. An anomaly whose hardware was not brought is not in the deck.

Every anomaly has the same shape, and `PROCEDURES` in `mission.js` holds each as data: **detect** (whose instrument shows what, in a real unit with a real limit), **steps** (who, what, the act the server accepts, the WHY line), **short** (the steps when the right spare was packed), **errors** (what a skipped or wrong step costs), **real** (the paragraph for the report). The server tracks `anomaly: { id, step, errors, startedAt }` and accepts a step only in order, except where a table says otherwise. The PROCEDURE card lights the current step; the WHY line is under it.

**FENDER** (needs a Hauler). *Apollo 17, December 1972: a hammer in Gene Cernan's pocket tore off a fender. The rover threw dust over the crew and its own batteries.*

| Step | Who | What | Why |
| --- | --- | --- | --- |
| Detect | Technician, astronaut | Dust fans over the Hauler's camera when it moves; BATT TEMP climbs while driving. A fender is missing | |
| 1 | Technician | Park. The server needs the Hauler stopped | Dust on the battery radiators is what overheats them, and driving makes the dust. |
| 2 | Astronaut | In the hall: lay four chart pages on the bench and press three strips of tape across them | The first repair, tape alone out on the surface, failed: dust kills the glue. Houston designed this one overnight and had John Young test it in a suit. |
| 3 | Astronaut | Carry the sheet and the two clamps out | The clamps came off a lamp in the cabin. |
| 4 | Astronaut | Hold the sheet on the fender stub; close one clamp, then the other | |
| 5 | Astronaut | Brush the battery radiators | Crews brushed them at stops all mission. |
| 6 | Technician | Drive 20 m. BATT TEMP falls out of the red | The check. |

Short (a fender in FULL spares): step 2 is "take the spare fender". Errors: a sheet taped outdoors comes off after 20 s of driving and the anomaly reopens; BATT TEMP at its limit shuts the Hauler down for 60 s.

**SCRUBBER** (always in the deck). *Apollo 13, April 1970: three men in a lander built to scrub the air for two, with square canisters from the other spacecraft that did not fit its round sockets.*

| Step | Who | What | Why |
| --- | --- | --- | --- |
| Detect | Scientist | CO2 passes 7.6 mmHg: amber lamp. The life-support panel in the hall reads CO2 HIGH | The alarm point was set before flight. Flight surgeons told the crew 15 was the limit. |
| 1 | Astronaut | Take a square canister from stores to the bench | |
| 2 | Astronaut | Pull a bag over its open end | The bag is the duct. |
| 3 | Astronaut | Tape the bag to the canister, all the way round | It has to be airtight or the fan pulls cabin air round the canister, not through it. |
| 4 | Astronaut | Arch a card inside the bag | Suction would flatten the bag against the canister and stop the flow. The card was a flight-plan cover. |
| 5 | Astronaut | Tape the suit hose into the end of the bag | The suit's fan is the pump. |
| 6 | Astronaut | Plug the hose into the life-support port | |
| 7 | Scientist | CO2 falls for 20 s | The check. |

Short (a round canister in STANDARD or FULL spares): swap it, then step 7. Errors: above 15 mmHg the hall is no shelter: the suit does not refill indoors and drains as it does outside. A step out of order does nothing and is counted.

**CABIN LEAK** (always in the deck). *The International Space Station, August 2018: a 2 mm hole in a docked Soyuz, found by closing hatches, covered with tape, then plugged with gauze and epoxy.*

| Step | Who | What | Why |
| --- | --- | --- | --- |
| Detect | Scientist | CABIN pressure falling; the reserve time on Nixie tubes | The first number a crew wants is how long they have. |
| 1 | Scientist, Ops | Read the reserve time up | It decides whether there is time to look. |
| 2 | Astronaut, Scientist | Shut the four inner hatches one at a time. The Scientist calls the one that flattens the rate | Isolation: the fastest way to find which part leaks. |
| 3 | Astronaut | Outside, at that quarter of the hull: find the crack by its hiss | Station crews use an ultrasonic detector that turns the leak into sound. |
| 4 | Astronaut | Tape over it (the patch kit). The rate falls to a tenth | A quick cover first: it buys time. |
| 5 | Astronaut | The permanent seal: the welder along its six points | |
| 6 | Scientist, astronaut | Hold 15 s with the needle steady, then reopen the hatches | The leak check. |

Errors: skipping isolation is allowed (the crack can be found by ear all round the hull, as today) but vents the reserve for longer; reopening before the check is counted.

**SUIT LEAK** (always in the deck). *The Apollo suit's answer to a leak was not a repair on the surface: it was 30 minutes of emergency oxygen and the way home.*

| Step | Who | What | Why |
| --- | --- | --- | --- |
| Detect | Astronaut, Scientist | A hiss in the helmet; SUIT pressure falling | |
| 1 | Astronaut | Pull the red OPS handle on the chest: 60 s of purge oxygen at the full leak | The Oxygen Purge System: about 30 minutes. |
| 2 | Ops, Technician | Ops calls TERMINATE. The Technician brings the Hauler | A terminated EVA ends in good order; an aborted one drops everything. |
| 3 | Astronaut | Get inside | |
| 4 | Astronaut | Patch the forearm | |
| 5 | Astronaut, Scientist | Stand still 5 s: SUIT pressure holds | The integrity check every suit got before going out. |

Errors: none are fatal. The patch still works outside (no dead ends), without the OPS the leak drains at three times, and the OPS works once.

**WHEEL DRIVE** (needs a rover). *The LRV's wheels could each be uncoupled from a failed drive; the Mars rover Spirit drove backward for years dragging a dead wheel.* (Both to be verified in phase 0.)

| Step | Who | What | Why |
| --- | --- | --- | --- |
| Detect | Technician | The rover pulls to one side; one of four MOTOR AMPS needles is high | A stalled motor draws current. |
| 1 | Technician | Name the wheel | Only the Technician has the needles. |
| 2 | Astronaut | Pull the coupling pin on that hub (today's pull-the-wheel gesture) | A wheel that turns freely is no drag. |
| 3 | Technician | The rover drives on three wheels at 0.6 of its speed | |
| 4 | Astronaut | With a spare wheel: fit it at any stop, and full speed returns | |

Errors: the wrong hub uncoupled leaves two dead wheels: 0.3 of its speed.

**SOLAR STORM** (one at most; replaces the meteor shower). *August 1972, between Apollo 16 and 17: a storm that would have given a crew on the surface about 130 rem to the blood-forming organs.*

- The Technician's FLARE lamp and X-ray needle, 60 s before the protons. The storm lasts 40 s.
- Cover is the habitat. The Hauler is none; the MOLAB halves the dose.
- The Scientist's DOSE counter runs in the open. It costs operations points from the first millisievert (the real rule is "as low as reasonably achievable") and past 250 mSv the crew is grounded: the mission ends as failed.
- Nothing is repaired. The procedure is a decision: finish the core, or run.

### The astronaut's cuff checklist

The label tape of SPEC-guidance carries the step: `3/7 TAPE BAG ROUND` (20 characters). No other text. In the hall, the bench has a cream **procedure card** on a stand, drawn from the same `PROCEDURES` data, with the step pictures: that is the dead-end rule, for a crew with nobody on the radio.

---

## Act three: the report

The results screen, for the Real Mission, becomes a typed mission report on cream pages. `game.result.report` holds the data; `console.js` and the astronaut's result board draw it. The debrief lasts 180 s in this mode.

1. **Verdict.** MISSION COMPLETE if the objective's manifest is banked (PROSPECT, GENESIS) or the instruments are running (STATION); otherwise FAILED, with the reason. The score on Nixie tubes and its four lines.
2. **What each decision did.** One line per slot, from counters kept during the flight: `LRV: 1,180 M DRIVEN OF 1,450. RIDING SAVED 41 MIN OF OXYGEN.` `OMNI ANTENNA: 18 % OF THE SCIENCE WAS LOST ON A FULL TAPE.` `LUNAR ORBIT: CARGO ON THE PAD. THE PLUME COST 96 S OF BRUSHING.`
3. **The ledger, planned against flown.** Mass (fixed), cost, peak power against supply, data collected against sent, hours outside against hours supported, refills used.
4. **Anomalies.** For each: time to notice, time to close, steps out of order, and **IN REAL LIFE**, the paragraph from `PROCEDURES[id].real`.
5. **Roads not taken.** The two single changes that `estimate()` says would have gained most: `WITH THE HIGH-GAIN DISH: +90 SCIENCE, +25 KG`.
6. **Design code and the board.** The design as a short code (for example `RM1-P-O-S-L-O-110000-7-S`), and where this mission stands among the best on this server for its objective and difficulty.

### The score

`score(report)` in `mission.js`. The existing single score number is the sum.

| Line | Up to | From |
| --- | --- | --- |
| **Science** | 500 | Manifest samples and extras at the objective's worth, instrument science, all multiplied by the share of data that was sent |
| **Operations** | 250 | 50 for each anomaly closed, less 10 for each step out of order; less dose; plus the reserve and suit oxygen left; less time spent past the walkback line |
| **Efficiency** | 150 | Budget not spent (up to 100), and a mass margin between 10 and 25 % (50). Under 10 % is cutting it fine; over 25 % was a bigger rocket than the job needed |
| **Teamwork** | 100 | Launched inside 4:00 of design (40), every seat called its own GO (20), no load shed too late (a flat battery) and no walkback breach (40) |

---

## Phases

Each is a mergeable change that leaves all three modes playable. Order: 0, 1, 2, 3, 4; phase 5 is stretch.

### Phase 0: the mode, the parameters, and the admin section

The requests' first two points, playable end to end with the smallest amount of new screen.

| File | Change |
| --- | --- |
| `client/shared/mission.js` (new) | `ROCKETS`, `TRANSFERS`, `SCOUTS`, `HAULERS` with `real` and `game` fields; `DESIGN_OWNER` (slot to seat); `REFERENCE`; `ledger(design)` (mass and cost only in this phase); `paramsFor(mode, design)`. |
| `client/shared/config.js` 194 | `MODES.real = 'Real Mission'`. `CFG.real = { roundSeconds: 900, firstAnomaly: 150, gap: [150, 210], quietEnd: 120, debriefSeconds: 180 }`. `SCRIPTS.real = []`. |
| `server/game.js` 24-82 | `this.design` (kept across `reset()` like `mode`); `setDesign(slot, id, by)` (lobby only, the owner or the admin, a known id); `this.params` built in `start()`; `start()` refuses a NO-GO design in the Real Mission. |
| `server/game.js` 161-253, 539-577 | Read `params` wherever a choice reaches: round length, the oxygen drain and refill, each rover's numbers, a rover that is `null` (not driven, not drawn, not in any view), the tray. The director in the Real Mission uses `CFG.real` spacing with today's faults (the procedures come in phase 3). `view()` sends `params` (round length, rovers, tray) and, in the lobby, `design` and `ledger`. |
| `server/hub.js` 126-138, 186 | Admin commands `design`, `preset`, `objective`, `difficulty`, `lockdesign`. `{ t: 'design', slot, id }` from a seat, checked against `DESIGN_OWNER` with `covers`. |
| `client/admin.html`, `client/admin.js` | The Real Mission panel: mode, the rocket, transfer, Scout and Hauler selects, the mass and cost readout, the NO-GO line. |
| `client/console.js` 113, 148-161; `client/astronaut.js` 133; `client/arm.js`; `client/world.js`; `client/rovercam.js` | Clock and totals from `state.params`. A rover that is not there is not built into the view, its camera pane shows `NO SCOUT` or `NO HAULER` on a blank plate, and its keys do nothing. The mode picker lists the third mode. |
| `docs/SOURCES.md` (new) | Every catalogue number: value, unit, source, link, `verified` or `est.`. |
| `test/game.test.js` | `paramsFor('demo')` and `('free')` equal today's values. A design over mass is refused. A seat cannot set another seat's slot; the admin can. A mission with no Hauler runs to the end. |

It runs when: the admin picks Real Mission, a rocket and rovers; an Atlas with an LRV is refused with the reason; a legal design plays 15:00 with the rovers chosen.

### Phase 1: the design board

- `mission.js`: `INSTRUMENTS`, `LINKS`, `PACKS`, `SPARES`, `OBJECTIVES`, `DIFFICULTY`; the full five-meter `ledger`; `estimate(design)`; the design code (`encode`, `decode`).
- `server/game.js`: the poll (Ready refused on NO-GO, stood down on any change), the design clock, the objective's manifest and worth passed to `layField`, loose surface rocks (`free: true` at lay time for everything but ice), the instruments' effects that are only parameters (`ns`, `alsd`, `ms`, `tge`), refills and the reserve, the riding and carrying drain.
- `client/console.js`, `client/style.css`, `client/shared/icons.js`: the board in `#planSheet`, the cards, `drawCard`, SIM RUN. The 2-player seat fits it at 1366 × 768 without scrolling.
- `client/admin.*`: the rest of the slots, presets, the design code.
- **The balance test** (`test/game.test.js`): walk every design. Fail if any option of any slot appears in no legal design whose `estimate` is within 10 % of the best for at least one objective on FLIGHT; if any objective has fewer than two near-best designs that differ in rocket; or if the reference design is not legal. Tune the catalogue's `game` values, never its `real` ones, until it passes.

It runs when: four seats can argue a design to GO, launch it, and bank a sample; changing a slot after the poll puts every lamp out.

### Phase 2: what you brought is what is there

- **The cargo lander** stands where the cargo landed: `viking-lander` restyled as a Surveyor-class lander for the Atlas, the same with two ramps for the Proton, the `apollo-lm` descent stage for the Saturn V (ASSETS.md has both; they were taken out as scenery that did nothing, and now they do something). It is a landmark, `CARGO`, on the chart. The rovers and the drill start beside it.
- **Rover variants** on the existing chassis: the small scout (the Scout at 0.6 scale, one lamp, no mast drill), the MOLAB (a lathe-turned cabin with a panel-line texture ahead of the footplate, an umbilical reel on the rail, `Cabin`, `Umbilical`). Named parts, bevels, canvas textures, as CLAUDE.md asks.
- The LRV's amp-hours, the plume dust at the start, the 15 m heat map, the link (slow-scan in `rovercam.js`: draw every `tvEveryMs` and hold the frame, with scan lines), the tape, the load switches, the real-unit gauges, WALKBACK.
- Feedback: the amp-hour needle kicks on every start; a frame arriving on slow-scan ticks; a load switch thunks and its lamp goes dark; the walkback lamp has its own two-tone.

### Phase 3: procedures

`PROCEDURES`, the anomaly state and its acts in `game.js`, the PROCEDURE card, the cuff step, the hall card, the bench work for the scrubber and the fender sheet (new grabbable parts in `stations.js`: canister, bag, card, hose, tape, chart pages, clamps; each with a sound and a tick in the hand), the OPS handle on the chest (`arm.js`), the inner hatches as something the hand can shut (`airlock.js`), the solar storm (a hard-edged flicker on the regolith and static on the cameras, no bloom), Inject on the admin page, and the kit panel in the hall. Each anomaly is its own change: FENDER, SCRUBBER, CABIN LEAK, SUIT LEAK, WHEEL DRIVE, STORM, in that order. `npm test`: each procedure accepted in order, refused out of order, its short form with the spare, its error costs. `npm run vr`: each done by hand.

### Phase 4: the report

The counters, `score`, `report`, the pages on the consoles and the astronaut's result board, roads not taken, the board of best missions (`hub.board`, kept in memory on the laptop server and in the Durable Object's storage on Cloudflare), and the README.

### Phase 5: stretch

- **STATION**: the seismometer and the reflector as two-hand carries that are set down, levelled against a bubble and aimed at Earth. With it, an anomaly from Apollo 16: a boot through the heat-flow cable.
- **Comm shadows and a relay orbiter.** At the pole Earth sits within a few degrees of the horizon, so crater floors have no line to it. With a direct link, a rover in a shadow stops and its camera goes to static; a relay satellite, paid for in cargo, covers them. This is the constraint the VIPER plan was built round.
- **Two tables, one objective**: two rooms, the same seed, the board as the scoreboard.
- **An Artemis-era catalogue** as a second data file, if the judges want today's vehicles. Only `mission.js` changes.

## Done means

- The admin page has a Real Mission section that shows and sets the whole design. The Technician chooses the rovers and Mission Ops the rocket from their own seats.
- A design that does not close cannot launch, and the board says why.
- The mission is 15:00 on the surface with two to four anomalies, each worked as a procedure by more than one seat, each explained in the report.
- Every card shows a real number with a source in `docs/SOURCES.md`, or `est.`.
- The report shows the score in four lines, what each decision did, and two roads not taken.
- The balance test passes, and Demo and Free play are unchanged.
- A crew told only "design it, fly it, read the report" can launch inside five minutes.

## Risks

| Risk | What to do about it |
| --- | --- |
| Twenty minutes standing in a headset | The design act needs no headset: the astronaut suits up when the poll starts. The Hauler and the hall are rest. If it is still too long, 12:00 on the surface. |
| The design act is a spreadsheet | The reference design, one decision a seat, cards with one WHY, and a NO-GO line that names the problem. If four minutes is not enough, cut the link and the transfer to presets. |
| Parameters read from `CFG` in many client files | Phase 0 changes only what a rocket or a rover reaches, and the test pins Demo and Free play. |
| A design with no rover is dull for the Technician | They still have the FLARE watch, and the report says what walking cost. If playtests agree it is dull, `none` in both slots is NO-GO. |
| Procedures turn into reading aloud | Split knowledge: the limits are the Scientist's, the steps are Ops', the needles are the Technician's, the hands are the astronaut's. Seven steps at most. |
| A wrong fact in front of NASA judges | `docs/SOURCES.md`, the `est.` mark, and nothing unverified in the report's IN REAL LIFE text. |
| Scope | Phase 0 alone answers the first two requests; 0 to 2 are a complete design game; 3 and 4 are the depth. |

## Decisions to confirm

Each has a recommendation, and the spec is written to it.

1. **Where the choosing happens.** At the seats, in the sheet over the lobby, mirrored and settable on the admin page (recommended; phase 0 delivers the admin half first). Or on the admin page only.
2. **What "20 minutes" is.** About 4 of design, 15 on the surface, 1 of report (recommended). Or 20:00 on the surface, with the design on top.
3. **Period vehicles.** Atlas-Centaur, Proton, Saturn V, Lunokhod, the LRV, MOLAB (recommended: documented, and they fit the 1960s look). Or Artemis-era vehicles, which the art direction would have to stretch to. Two of the six vehicles are Soviet; if that is unwanted, the Proton and Lunokhod cards can be renamed to their class with the real basis kept in the WHY line.
4. **The rocket lands cargo, not the crew.** The base and the astronaut are already there; the rocket is this expedition's logistics flight (recommended: it is the only way an Atlas-Centaur can be an honest choice). Or the rocket carries everything, and only the Saturn V can fly a person.
5. **The solar storm replaces the meteor shower** in this mode (recommended: a shower that threatens a base is not a real hazard on this timescale; a storm is).
6. **Loose surface rocks.** Only ice needs the drill (recommended, and real). Or everything is drilled, as now, and the drill stops being a choice.
7. **A design with no Hauler and no Scout is allowed** (recommended: Apollo 11 to 14 walked).
8. **Costs.** Dollars of about 1970, with most marked `est.` (recommended over invented "budget units": a judge can check them). Only the Saturn V and the LRV programme figures were confirmed while writing this.

## Sources

Checked while writing this spec. Phase 0 moves them to `docs/SOURCES.md` and adds a primary source for every `est.`.

| Fact | Source |
| --- | --- |
| Surveyor 1: 995.2 kg at launch, about 294 kg landed, Atlas-Centaur, direct, 63 h 36 min | [NASA Science: Surveyor 1](https://science.nasa.gov/mission/surveyor-1) |
| Saturn V: about $185M a launch in 1969 to 1971 dollars; 43,500 kg to translunar injection (other figures run to 48,600 kg) | [Saturn V](https://en.wikipedia.org/wiki/Saturn_V), [NASA: Saturn launch vehicles](https://www.nasa.gov/wp-content/uploads/static/history/alsj/CSM02_Saturn_Launch_Vehicles_pp8-14.pdf) |
| LRV: 210 kg, 490 kg payload, two 36 V 121 Ah batteries, not rechargeable, 92 km rated, 18 km/h record, 7.6 km from the lander | [NASA NSSDC: the Apollo Lunar Roving Vehicle](https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html), [Lunar Roving Vehicle](https://en.wikipedia.org/wiki/Lunar_Roving_Vehicle) |
| Luna 17 about 5,600 kg; Lunokhod 1 756 kg; 0.8 and 2 km/h; five-person crews; slow-scan television | [Luna 17](https://solarviews.com/eng/luna17.htm), [Astronomy: Making tracks](https://www.astronomy.com/space-exploration/making-tracks/) |
| The Apollo 17 fender: four maps, tape, two clamps; tape alone failed in the dust; designed in Houston overnight | [Apollo Lunar Surface Journal: the new fender](https://www.nasa.gov/history/alsj/a17/A17NewFender.html), [Smithsonian: duct tape auto repair on the Moon](https://airandspace.si.edu/stories/editorial/duct-tape-auto-repair-moon) |
| The Apollo 13 "mailbox"; the alarm near 7.6 mmHg and the 15 mmHg limit | [NASA: Apollo 13 lunar module "mail box"](https://nasa.gov/image-article/apollo-13-lunar-module-mail-box) |
| The -7 pack: 1,430 psi, up to 8 hours; the Oxygen Purge System: about 30 minutes | [Primary life support system](https://en.wikipedia.org/wiki/Primary_life_support_system), [Apollo Lunar Surface Journal: the PLSS](https://www.nasa.gov/wp-content/uploads/static/history/alsj/plss.html) |
| The 2018 Soyuz leak: 2 mm, tape, then gauze and epoxy | [Spaceflight Now](https://spaceflightnow.com/2018/08/30/cosmonauts-plug-small-air-leak-on-the-international-space-station/) |
| The Surveyor Lunar Roving Vehicle study: 100 lb, Bendix and General Motors, 1964 | [JPL: lunar roving vehicle prototype](https://www.jpl.nasa.gov/blog/2015/2/lunar-roving-vehicle-prototype) |
| August 1972: about 130 rem to the blood-forming organs on the surface | [NASA, Working on the Moon: radiation](https://www.nasa.gov/wp-content/uploads/static/history/alsj/WOTM/WOTM-Radiation.html) |
| ALSEP: an RTG of about 70 W; 163 kg on Apollo 17 | [Apollo Lunar Surface Journal: ALSEP](https://www.nasa.gov/history/alsj/HamishALSEP.html) |

Not confirmed, and marked `est.` or "to be verified" above: the MOLAB's mass (a related 1964 study gives 3,732 kg), every instrument's mass and power, the Atlas-Centaur and Proton costs, the 14 km Surveyor landing error (left out of the cards for that reason), the LRV's wheel uncoupling and Spirit's dragged wheel, the reserve-time figure used on the Space Station, the mass spectrometer's Apollo 17 basis, and NASA's current dose limits (the 250 mSv line is a game value until it is checked against NASA-STD-3001).

The challenge page's Resources tab could not be opened from the session that wrote this spec. Before phase 0, read it and add anything it lists to `docs/SOURCES.md`: judges look for use of the resources NASA names.
