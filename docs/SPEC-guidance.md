# Spec: light text guidance (each seat told what to do, in a few words)

Status: written, not started. Audited against `main` at `02f587d` (the sample run is in: the 120 m field, two rovers, the survey chart, samples, one fault at a time, comms that never fail).

Read [CLAUDE.md](../CLAUDE.md), [DESIGN.md](DESIGN.md) and [SPEC-sample-run.md](SPEC-sample-run.md) first. This spec adds words to the game. It does not change any rule, any role or what any seat is allowed to know.

## How this pass is checked

Do not write, update or run tests, screenshot runs or frame-time measurements in this pass: no `npm test`, `npm run smoke`, `npm run vr`, `npm run assets` or the `:shots` variants, and leave `test/` alone. The bar for each phase is that it runs: `npm start` boots, and the pages load and play without errors in the browser console. The crew playtests it. This replaces the "look before you say done" loop in CLAUDE.md section 4 for this pass, as SPEC-sample-run did.

## Goal

The game has a good idea, but today you only know what to do if someone explains it. A new player does not know their role, the objective, what a lamp or gauge means, what a tool is for, or what to do when something breaks. After this pass:

1. **Every seat is told its job and the objective** when the mission starts: find rock samples and bring them home.
2. **When something breaks, the right seat is told what broke and what to do,** and every other seat is told who to ask. Example: the panels get dusty; the Scientist reads `SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.`, Mission Ops reads `ALARM. ASK THE SCIENTIST WHAT BROKE.`, the astronaut's cuff reads `ALARM: ASK OPS`.
3. **Every tool wears a name tag,** with what it is for on the back, so the astronaut can tell the brush from the welder and from the decoys.
4. **Each seat always has one short line about what is going on now,** and the line goes quiet once the player has shown they understand.

There is no tutorial. Nothing blocks, pauses or waits for the player. A crew that never reads a word plays exactly the same game.

## What is there now (the audit)

What a new player, told nothing, cannot work out today.

| Seat | What they cannot work out | What the game gives today | Where |
| --- | --- | --- | --- |
| All | **The objective.** That the mission is to bring samples home. | Two of the three console briefs mention samples, but the briefs live on a sheet behind a lobby button and are never shown once the mission starts. The astronaut is told nothing; their only hint is the rock and its pips on the cuff. The consoles have a `SAMPLES 0/4` counter in the header. | `client/console.js` 26-30 (`BRIEF`), 45 (the sheet), 55-62 (the button); `client/console.html` (header); `client/arm.js` 403-409 |
| All | **Their own job.** | The lobby's one-line role descriptions are out of date: the Scientist is "The gauges. Knows what is wrong" and the Technician "The radar and the rover. Knows where", but since the sample run the Scientist has the chart and the Technician has no map. | `client/lobby.js` 18-25 (`INFO`) |
| All | **What broke, and who should do what.** | By design, nobody is told in words what broke: the consoles flash one word, `ALARM`, the cuff lights a triangle, and the reason only appears in the results log at the end. The Scientist's chart blinks the fault's symbol with a one-word legend, but nothing says which tool fixes it or who to tell. Ops and the Technician get `ALARM` and nothing else. | `client/console.js` 4 ("Nobody is told in words what broke"), 108 (`TOAST`), 564-577 (the chart's fault symbol and legend); `client/arm.js` 402; `client/astronaut.js` 123 (`alarms()`); `server/game.js` 410 (`note()`: "the text goes to the results log only") |
| Astronaut | **Which tool is which.** | Five tools and four decoys (a wrench, a ratchet, a hammer and a grease gun, on purpose: "they make the search a search") lie round the hall with no names. Only Ops' tool log names where each one is. The "you need this tool" outline floats over a broken fixture, but only once you are already standing at it without the tool. | `client/stations.js` 55-60 (`DECOYS`), 145-190, 379-393 and 903-919 (the outline); `docs/SPEC-physical-base.md` 171 |
| Astronaut | **What a tool is for.** | Nowhere in the astronaut's world. | |
| Astronaut | **Where samples go.** | The sample port has a lamp and Nixie tubes but no label. "Door S" is findable: each airlock carries a plate with its letter (`AIRLOCK S` and so on). | `client/world.js` 1005 (`Port_Sample`); `client/airlock.js` 164-165 |
| Astronaut | **How to ride the Hauler and get off, how to patch the suit, how to pull the generator's cord.** | Only in the gate's folded "Controls" text, read before the mission or not at all. On a laptop: E rides, F patches, G pulls the cord. | `client/astronaut.html` 28; `client/astronaut.js` 285, 1156-1157 |
| Astronaut | **That oxygen refills inside.** | Not said anywhere. The hall's FLIGHT STATUS board, the one board in front of the spawn point, is only shown in the lobby and disappears when the mission starts. | `client/astronaut.js` 134-200, 160 |
| Astronaut | **What the cuff's icons mean.** | Icons only, by design: a bottle, an hourglass, a warning triangle, a rock with pips, a magnifier. | `client/arm.js` 14, 335-412 |
| Mission Ops | **What to do first.** | The talk button is labelled. Nothing says to ask the Scientist what broke, that the tool log is how the astronaut finds a tool, or that a sample goes in the tray or the port. | `client/console.js` 276-296 (`drawKit`), 435-450 (`drawSampleLog`) |
| Technician | **Where to drive, and what the instruments mean.** | No map, by design, and nothing says to ask the Scientist. The keys are on plates and in one hint line under the cameras. The HOME dial, the RIDER lamp and the METEOR lamp are labelled but not explained, and only the Technician gets the meteor warning, with nothing telling them to get the astronaut under cover. | `client/console.js` 367-390 (`drawTech`), 710 (`camHint`); `server/game.js` 509 (`v.meteor`) |
| Scientist | **What the chart and gauges mean, and what to do with them.** | The heat map's brightness, the field guide's cards and the POWER and AIR gauges are all there, but nothing says "send the Scout to bright ground", "describe the rock to Ops", or what a low SOLAR IN means. The wiring card is only on the POWER tab, and tabs are on purpose "you have to go and look". | `client/console.js` 478-578 (`drawSurvey`), 613-645 (`drawGuide`), 647-690 (`drawPower`, `drawAir`), 85 (tabs) |
| 2-player seat | **Who "the Scientist" is.** | The Mission Operator is Ops, Technician and Scientist at once, so any line that says "ask the Scientist" would mean "ask yourself". | `client/shared/config.js` (`PLAYERS`) |

What each seat's `view()` is sent today (`server/game.js` 485-527), which is the ceiling on what its guidance may ever say:

| Seat | Gets | Does not get |
| --- | --- | --- |
| Astronaut | Hands, tools and where they lie, the rovers, whether riding, what they carry, `scene` (dust cells, the board's cables, broken wheels, the hull's weld points, the meteor falling, the rocks near them by **look only**, the tray, the port's tally), `suit` | Which rock is real. The meteor warning. |
| Mission Ops | Hands, tools and where they lie, carry, the tray as full or empty | Any fault, the scene, the field, samples |
| Technician | Both rovers, `rider`, `scene` near the rovers (rocks by look only), the astronaut's pose, the meteor warning | Which rock is real. The chart. |
| Scientist | Power, leak, drain, the wiring card, the survey (heat map, explored ground, samples **with their kind** in explored ground only, the one fault's symbol if its place is explored), the manifest, the last assay | The rover cameras. Anything in unexplored ground. |
| All | Phase, clock, oxygen, score, the sample tally, the last event's kind (`alarm`, `solve`, `found`, `dud`, ...), whether the base has power | |

Note the astronaut's and Technician's `scene` does contain the broken thing (for drawing it), so "what is in the view" is not on its own a safe rule for what a line may say. Ground rule 3 adds a stricter list.

## Ground rules

1. **Short.** A console line is at most **50 characters** and about eight words. A cuff line is at most **20 characters**. A tag or plate is at most **16 characters** a line, a caption or a board line at most **24**. Capitals, plain words, an instruction where there is one (`TELL OPS: THE BRUSH`). No paragraphs, no exclamation marks, no question marks on the consoles. This sits beside SPEC-v2 rule 3 ("if a screen needs more than about six words to explain itself, redesign it"): the screens still explain themselves; a line says what to do next.
2. **One line per seat at a time,** and it tells you who to talk to, not another seat's answer. The game is still the talking: Ops is told to ask the Scientist, not told what the Scientist knows.
3. **Each seat is only told what it is allowed to know.** A line is chosen from that seat's own `view()` and its own memory, never from the game directly (see "How the server picks a line"). On top of that, each seat has a list of what its lines may *say*:
   - **Astronaut:** never names a fault, except their own suit leak (their arm is throbbing). Never says whether a rock is real.
   - **Mission Ops:** never names a fault. Never says anything about a rock beyond "in hand", "in the tray", "banked", "dud".
   - **Technician:** may name a broken wheel (it is their rover, their WHEEL lamp) and the meteor warning (their lamp). Nothing else that is broken. Never says whether a rock is real.
   - **Scientist:** may name the one fault and the tool that fixes it (the chart already shows its symbol, SPEC-sample-run decision 7), and may name a sample's kind once it is on the chart.
   - **Nobody:** is told when the next fault will come, where a sample is in unexplored ground, or that comms are down (they never are).
4. **Never required, never in the way.** No line blocks, pauses, waits for a click or covers an instrument. Every mechanic works the same with all guidance switched off.
5. **Goes quiet.** A line shows while it is true. Teaching lines retire once the seat has done the thing. Fault lines shrink to a short form once the crew has fixed that fault once. Danger lines always show.
6. **The 1960s look, and nothing on the visor.** Consoles: a teletype strip. The cuff: one strip of embossed label tape. The world: name tags on tools, engraved plates on fixtures, the hall's status board. No pop-ups, arrows, glowing markers or floating text (the existing "you need this tool" outline stays as it is).
7. **The lobby keeps its look.** `client/lobby.js`, `client/lobby/*.svg`, the lobby section of `style.css` and the astronaut's gate are not restyled. The only lobby change considered is two lines of copy (decision 9).
8. **Every new line gives feedback.** On a console the line types itself out (about 30 characters a second, a soft teletype clatter, Ops' radio sound set or the console tones). On the cuff an urgent line gives one soft tick and a short buzz in the left hand, so the astronaut looks at their wrist.
9. **The Quest is the budget.** Tags and plates share one canvas texture; boards and the cuff redraw only when their text changes, as they do now.

---

## Where the words go

### Mission Control: the teletype strip

A strip across the top of each console panel, under its engraved name (`MISSION OPS`, `TECHNICIAN`, `SCIENTIST`): a `console-deep` slot in a thin `bezel` frame, one line of Courier Prime capitals in `ink`, with a small `lamp-amber` jewel at its left that lights for a moment when a new line arrives.

```
+-------------------- SCIENTIST --------------------+
| (o) SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.      |   <- teletype strip, one line
| [ SURVEY ] [ GUIDE ] [ POWER ] [ AIR ]            |
|  ...                                              |
```

- A danger line (tier 1, below) is typed in `lamp-red`'s on value; a fault line in `lamp-amber`'s; everything else in `ink`.
- The header's one-word toast (`ALARM`, `FIXED`, `SAMPLE BANKED`) stays as it is: it is the event; the strip is what to do about it.
- **The 2-player seat** has one strip across the top of the whole console instead of three, showing the most urgent of its three seats' lines, in 2-player wording (decision 4).

### The astronaut

- **The cuff: label tape.** One strip of embossed label tape across the top of the gauge face, above the two dials (on the 640 × 374 face, about x 30-450, y 28-76): `bakelite` tape with raised `dial`-coloured Michroma capitals, at most 20 characters. Blank tape when there is nothing to say. The rest of the cuff stays icons only; this is the one exception (decision 2).
- **On a laptop the cuff is only up while the radio is keyed,** so an urgent new line also raises the arm for 3 seconds (decision 3).
- **The hall's board.** The FLIGHT STATUS board in front of the spawn point stays up during the mission and turns into a MISSION board (decision 10).
- **Name tags** on every tool and decoy, and **engraved plates** on the fixtures that have none.

---

## The lines

`{B}`, `{W}`, `{N}`, `{KIND}`, `{ROVER}` are filled in from the seat's own view. The demo's manifest is 4, so `{W}` is 4 there. Kinds use short names: `ANORTHOSITE`, `BASALT`, `ORANGE GLASS`, `ICE CLOD`. Tiers decide which line wins (see "How the server picks a line"): **1 danger, 2 fault, 3 event, 4 step, 5 teach, 6 idle.**

### Scientist (the SCIENTIST strip)

| Id | Tier | Shows when (from this seat's view) | Line | Goes quiet |
| --- | --- | --- | --- | --- |
| `sci.role` | 5 | The first 20 s of a mission | `YOU HAVE THE CHART AND THE FIELD GUIDE.` | After the first mission |
| `sci.goal` | 5 | After `sci.role`, until the GUIDE tab has been opened | `MISSION: {W} SAMPLES. THE GUIDE TAB SHOWS THEM.` | GUIDE tab opened |
| `sci.scout` | 4 | No wanted sample on the chart, and SURVEYED has not yet risen 5 points | `BRIGHT GROUND MAY HOLD SAMPLES. SEND THE SCOUT.` | SURVEYED up 5 points |
| `sci.seen` | 4 | A kind the manifest still wants is on the chart, no rover within 6 m of it | `{KIND} ON THE CHART. TALK THE SCOUT ONTO IT.` | Short form after the first FOUND: `{KIND} ON THE CHART.` |
| `sci.parked` | 4 | The Scout is within 6 m of that sample | `SCOUT IS THERE. DESCRIBE THE ROCK FOR OPS.` | Short form after the first FOUND: `SCOUT IS THERE.` |
| `sci.found` | 3 | A new assay that is a sample, for 6 s | `FOUND: {KIND}. {B} OF {W} HOME.` | |
| `sci.dud` | 3 | A new assay that is a dud, for 6 s | `DUD: A LOOKALIKE. SEE NOT THIS ON THE CARD.` | |
| `sci.done` | 4 | Every manifest lamp lit | `MANIFEST HOME. EXTRA SAMPLES STILL SCORE.` | |
| `sci.dust` | 2 | The fault symbol is dust, or SOLAR IN is under 60 | `SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.` | Short form once fixed once: `SOLAR PANELS DUSTY.` |
| `sci.board` | 2 | The fault symbol is the board, or the wiring card is up, and the POWER tab is open | `SWITCHBOARD OUT. READ THE WIRING CARD TO OPS.` | Short form once fixed once: `SWITCHBOARD OUT.` |
| `sci.board.tab` | 2 | The same, and the POWER tab is not open | `SWITCHBOARD OUT. THE WIRING CARD IS ON POWER.` | POWER tab opened |
| `sci.wheel` | 2 | The fault symbol is a wheel (on the rover it sits on) | `{ROVER} WHEEL BROKEN. TELL OPS: A SPACE TIRE.` | Short form once fixed once: `{ROVER} WHEEL BROKEN.` |
| `sci.hull` | 2 | The fault symbol is the hull | `HULL BREACH. TELL OPS: THE WELDER.` | Short form once fixed once: `HULL BREACH.` |
| `sci.suit` | 2 | The fault symbol is the suit | `SUIT LEAK. TELL OPS: THE PATCH KIT, NOW.` | Short form once fixed once: `SUIT LEAK.` |
| `sci.leak` | 2 | The LEAK lamp is lit and no symbol is on the chart (the astronaut is off the chart) | `LEAK LAMP: HULL OR SUIT. ASK OPS.` | |
| `sci.batt` | 1 | Battery under 30, while dust or the board is the fault | `BATTERY LOW. THE BASE GOES DARK AT ZERO.` | |
| `sci.dark` | 1 | The base has no power | `BASE DARK: NO OXYGEN REFILL INSIDE.` | |

### Mission Ops (the MISSION OPS strip)

| Id | Tier | Shows when | Line | Goes quiet |
| --- | --- | --- | --- | --- |
| `ops.role` | 5 | The first 20 s of a mission | `YOU ARE THE ONLY VOICE. HOLD SPACE TO TALK.` | First transmission |
| `ops.goal` | 5 | After `ops.role` | `MISSION: {W} SAMPLES HOME. ASK THE SCIENTIST WHERE.` | The first FOUND |
| `ops.alarm` | 2 | Something is broken (`alarm`), for its first 15 s | `ALARM. ASK THE SCIENTIST WHAT BROKE.` | Short form once a fault has been fixed: `ALARM. ASK THE SCIENTIST.` |
| `ops.tool` | 2 | Still broken after 15 s | `YOUR TOOL LOG SAYS WHERE EACH TOOL LIES.` | Once a fault has been fixed |
| `ops.full` | 2 | Something is broken and both of the astronaut's hands are full | `HANDS FULL. TELL THEM TO PUT ONE DOWN.` | |
| `ops.carry` | 4 | A sample in a hand | `SAMPLE IN HAND. TRAY ON THE HAULER, OR THE PORT.` | The first sample banked |
| `ops.tray` | 4 | Samples in the tray, none in hand | `SAMPLES IN THE TRAY. THE PORT IS BY DOOR S.` | The first sample banked |
| `ops.found` | 3 | A new FOUND, for 6 s | `BANKED. {B} OF {W} HOME.` | |
| `ops.dud` | 3 | A new DUD, for 6 s | `DUD. ASK THE SCIENTIST WHAT TO LOOK FOR.` | |
| `ops.o2` | 1 | Suit oxygen under 30 | `SUIT OXYGEN LOW. ASTRONAUT INSIDE TO REFILL.` | |
| `ops.dark` | 1 | The base has no power | `BASE DARK. THE GENERATOR GIVES 25 S OF POWER.` | Once the generator is used |
| `ops.idle` | 6 | 45 s with nothing new on this console | `ASK THE SCIENTIST FOR THE NEXT SAMPLE.` | |

### Technician (the TECHNICIAN strip)

| Id | Tier | Shows when | Line | Goes quiet |
| --- | --- | --- | --- | --- |
| `tech.role` | 5 | The first 20 s of a mission | `YOU DRIVE BOTH ROVERS. NO MAP: ASK THE SCIENTIST.` | After the first mission |
| `tech.keys` | 5 | Until each rover has been driven | `SCOUT: W A S D. HAULER: ARROWS. BOTH AT ONCE.` | Each rover driven |
| `tech.keys.h` | 5 | The Scout has been driven, the Hauler not | `HAULER: ARROWS. IT CARRIES THE ASTRONAUT.` | The Hauler driven |
| `tech.home` | 4 | A rover first goes past 60 m, for 8 s | `HOME DIAL: THE RED NEEDLE POINTS TO BASE.` | Shown once |
| `tech.mount` | 4 | The astronaut is outside within 4 m of the Hauler, not riding, the Hauler stopped | `ASTRONAUT AT THE HAULER. WAIT FOR THE RIDER LAMP.` | The first ride |
| `tech.ride` | 4 | The RIDER lamp is lit | `RIDER ABOARD. DRIVE GENTLY. STOP TO LET THEM OFF.` | Short form after the first dismount: `RIDER ABOARD.` |
| `tech.wheel` | 2 | A WHEEL lamp is lit | `{ROVER} WHEEL BROKEN. TELL OPS: IT NEEDS A TIRE.` | Short form once fixed once: `{ROVER} WHEEL BROKEN.` |
| `tech.meteor` | 1 | The METEOR lamp is counting down | `METEORS IN {N} S. TELL OPS: ASTRONAUT TO COVER.` | |
| `tech.falling` | 1 | Meteors are falling | `METEORS FALLING. HOLD THE HAULER STILL.` | |
| `tech.idle` | 6 | 45 s with neither rover moving | `ASK THE SCIENTIST WHERE TO DRIVE.` | |

`tech.falling` is there because cover in the open is crouching beside the Hauler (`client/shared/rules.js` `sheltered`): a Hauler that drives off leaves the astronaut exposed.

### Astronaut (the cuff's tape)

Lines with two forms pick the headset or the laptop one on the astronaut's page.

| Id | Tier | Shows when | Headset | Laptop | Goes quiet |
| --- | --- | --- | --- | --- | --- |
| `astro.go` | 5 | The first 30 s of a mission, inside | `ASK OPS WHERE TO GO` | same | After the first mission |
| `astro.alarm` | 2 | Something is broken, and it is not the suit | `ALARM: ASK OPS` | same | |
| `astro.suit` | 1 | Suit leak, no patch kit in hand | `SUIT LEAK: PATCH KIT` | same | |
| `astro.patch` | 1 | Suit leak, the patch kit in hand | `TOUCH KIT TO LEAK` | `PRESS F TO PATCH` | |
| `astro.o2` | 1 | Oxygen under 30, outside | `O2 LOW: GO INSIDE` | same | |
| `astro.dark` | 1 | The base has no power | `BASE DARK: NO REFILL` | same | |
| `astro.meteor` | 1 | Meteors falling, outside | `METEORS: TAKE COVER` | same | |
| `astro.rail` | 4 | Outside, within 2.5 m of the Hauler's rail, not riding | `GRAB RAIL TO RIDE` | `E: RIDE THE HAULER` | The first ride |
| `astro.off` | 4 | Riding, the Hauler stopped | `STEP OFF THE PLATE` | `E: STEP OFF` | The first dismount |
| `astro.sample` | 4 | A sample in a hand | `PORT IS BY DOOR S` | same | The first sample banked |
| `astro.full` | 4 | Both hands full, a loose tool within 1.5 m | `HANDS FULL: DROP ONE` | same | |
| `astro.idle` | 6 | 45 s with nothing new | `ASK OPS: WHAT NEXT` | same | |

There is deliberately no line for the meteor *warning*: the astronaut does not get it (only the Technician does), so it reaches them over the radio, as now. `astro.meteor` is for when the meteors are already falling around them.

### The hall's board (MISSION face)

While a mission runs and the astronaut is inside, the FLIGHT STATUS board (`client/astronaut.js` 134-200) shows:

```
+------------------- MISSION -------------------+
|            BRING 4 SAMPLES HOME              |
|              [ 0 ]  OF  [ 4 ]                |   <- Nixie tubes, the tally
|           OXYGEN REFILLS IN HERE             |   <- or: BASE DARK: NO REFILL
+-----------------------------------------------+
```

### Name tags (on every tool and decoy)

A small enamel tag on a wire loop, like a property tag: `dial` card, `ink-dial` Michroma capitals, about 12 × 4 cm, letters about 2 cm tall so they read from 1.5 m. Front: the name. Back: what it is for.

| Tool | Front | Back |
| --- | --- | --- |
| Brush | `BRUSH` | `SOLAR PANELS` |
| Welder | `WELDER` | `HULL CRACKS` |
| Patch kit | `PATCH KIT` | `SUIT LEAKS` |
| Space tire | `SPACE TIRE` | `ROVER WHEELS` |
| Backup generator | `GENERATOR` | `PULL CORD` |
| Wrench, ratchet, hammer, grease gun (decoys) | `WRENCH`, `RATCHET`, `HAMMER`, `GREASE GUN` | `SPARE` |

The tags are part of each tool's model (`client/tools.js` for the five tools, `client/stations.js` for the decoys), so they move with it, are not physics bodies, and are hidden on the rover cameras' copies (too small to read there).

### Plates (on fixtures that have none)

The same engraved plate as the airlocks' (`client/airlock.js` 98, `plate()`): `console` face, `dial` capitals, a `bezel` rim.

| Plate | Where |
| --- | --- |
| `SAMPLE PORT` | On the port's collar, above the lid (`client/world.js` 1005, `Port_Sample`) |
| `SOLAR ARRAY` | On the post of the middle of the three near panels |
| `SWITCHBOARD` | Above the board on the hall's west wall (`client/interior.js`) |
| `SAMPLE TRAY` | On the Hauler's aft bay, under the four cups |
| `RIDER: HOLD RAIL` | On the Hauler's rail (`Rail_Rider`) |

### What the instruments mean (captions, phase 5)

Small engraved captions in `ink-dim` under an instrument's plate, shown until the seat has seen that instrument do its thing once (decision 8 brings them back).

| Seat | Instrument | Caption | Hides after |
| --- | --- | --- | --- |
| Technician | HOME dial | `POINTS TO BASE` | The first trip past 60 m |
| Technician | WHEEL lamp | `LIT: ROVER STUCK` | The first wheel fixed |
| Technician | RIDER lamp | `LIT: ASTRONAUT ON` | The first ride |
| Technician | METEOR lamp | `IMPACT COUNTDOWN` | The first shower |
| Scientist | The chart | `BRIGHT: LIKELY SAMPLES` | SURVEYED up 5 points |
| Scientist | SURVEYED % | `SEEN BY ROVERS` | SURVEYED up 5 points |
| Scientist | SOLAR IN | `LOW: DUSTY PANELS` | The first dust fixed |
| Scientist | BOARD OUT | `LOW, SOLAR OK: BOARD` | The first board fixed |
| Scientist | BATTERY | `DRAINS ON A POWER FAULT` | The first power fault fixed |
| Scientist | LEAK | `HULL OR SUIT` | The first leak fixed |
| Scientist | DRAIN | `3X WITH A LEAK` | The first leak fixed |
| Scientist | ASSAY | `LAST ROCK IN THE PORT` | The first sample banked |
| Mission Ops | HANDS | `WHAT THEY HOLD` | The first tool taken |
| Mission Ops | TOOL LOG | `WHERE EACH TOOL LIES` | The first fault fixed |
| Mission Ops | SAMPLE LOG | `HANDS, TRAY, BANKED` | The first sample banked |

### The 2-player seat's wording

The Mission Operator is Ops, Technician and Scientist at once, so lines that send them to another Earth seat change. Every other line is the same.

| Id | 2-player line |
| --- | --- |
| `ops.goal` | `MISSION: {W} SAMPLES HOME. THE CHART SHOWS WHERE.` |
| `ops.alarm` | `ALARM. THE CHART'S SYMBOL SAYS WHAT BROKE.` |
| `ops.dud` | `DUD. CHECK NOT THIS ON THE GUIDE CARD.` |
| `ops.idle`, `tech.idle` | `PICK BRIGHT GROUND ON THE CHART. SEND THE SCOUT.` |
| `tech.role` | `YOU DRIVE BOTH ROVERS. THE CHART IS YOUR MAP.` |
| `tech.wheel` | `{ROVER} WHEEL BROKEN. ASTRONAUT NEEDS A TIRE.` |
| `tech.meteor` | `METEORS IN {N} S. ASTRONAUT TO COVER, NOW.` |
| `sci.dust`, `sci.wheel`, `sci.hull`, `sci.suit` | `TELL OPS:` becomes `ASTRONAUT NEEDS` (`SOLAR PANELS DUSTY. ASTRONAUT NEEDS THE BRUSH.`) |
| `sci.board` | `SWITCHBOARD OUT. READ THE WIRING CARD ALOUD.` |
| `sci.parked` | `SCOUT IS THERE. DESCRIBE THE ROCK ON THE RADIO.` |
| `sci.leak` | `LEAK LAMP: HULL OR SUIT. ASK THE ASTRONAUT.` |

---

## How the server picks a line

The server picks; the page words it. The choice is made where the rules and the hiding already live, so it is the same on a laptop and on Cloudflare, and the wording sits with the page, which knows whether the astronaut is in a headset.

### What a line may read

1. **A line reads only its own seat's `view()` and that seat's memory.** The picker is handed the view object that is about to be sent to that seat, already filtered by `game.view(role)`, and a small memory object. It is never handed `game`. Whatever is not in a seat's view cannot reach that seat's line, by construction.
2. **The view is the ceiling, not the rule.** Ground rule 3's lists are narrower than the views (the astronaut's `scene` holds the broken thing so it can be drawn; their lines still never name it). Each seat's lines are written against a short list of the fields they may read:

| Seat | Its lines may read |
| --- | --- |
| Astronaut | `phase`, `timeLeft`, `oxygen`, `powered`, `alarm`, `suit`, `hands`, `carry`, `riding`, `rovers.hauler`, `me`, `scene.meteor`, `ev` |
| Mission Ops | `phase`, `timeLeft`, `oxygen`, `powered`, `alarm`, `hands`, `carry`, `tray`, `tally`, `ev` |
| Technician | `phase`, `timeLeft`, `powered`, `alarm`, `rovers`, `rider`, `astro`, `meteor`, `scene.wheels`, `ev` |
| Scientist | `phase`, `timeLeft`, `powered`, `power`, `leak`, `wiring`, `survey`, `manifest`, `assay`, `tally`, `ev` |

3. **No line is about another seat's private data,** even harmlessly: Ops is never told the astronaut is inside (Ops does not get the astronaut's pose).

### State

Two small additions to `view()` (`server/game.js` 485), neither of them new knowledge:

```js
v.alarm = Object.keys(this.faults).length > 0;  // every seat: something is broken (already public: the ALARM toast, the cuff's triangle)
// the astronaut's view only:
v.me = { x, z, inside, riding };                 // their own pose, as the server has it
```

The memory, one per seat, kept by the hub (`server/hub.js`), so it works the same in `server/server.js` and in the Durable Object:

```js
hub.guide = {
  astronaut: mem, ops: mem, tech: mem, sci: mem,   // the 2-player seat uses ops, tech and sci together
};
mem = {
  learned: Set,          // lesson ids this seat has done (tab opened, rover driven, first ride, ...)
  fixed: Set,            // fault types this seat has seen fixed while its line named them (for the short forms)
  line: null, since: 0,  // the line on show and when it went up
  last: {},              // last ev number, last alarm, last rider, SURVEYED at the start: to spot changes
  quietSince: 0,         // when this console last saw something new (for the idle lines)
  missions: 0,           // missions finished with this seat held
};
```

The memory is kept across missions in the same game and cleared when the game is (`hub.clearPlayers()`, Start over, the admin's reset of players) or when that seat has been empty for `CFG.lobby.emptyModeSeconds`: those are the moments new people sit down.

### The wire

Each tick, after `game.view(role)` and before it is sent (`server/hub.js` 243, `tick()`):

```js
v.guide = { id: 'sci.dust', a: [], tier: 2 } | null;   // a: what the line fills in, e.g. ['BASALT', 2, 4]
```

The 2-player seat gets one `guide`: the highest tier of its three seats' picks, with a flag to use the 2-player wording. Earth-side views go out with the comms delay when the admin has it on; the guide goes with them, so it never runs ahead of the instruments.

Page to server, for things only the page sees (a tab opened, a camera switched):

```js
{ t: 'learned', id: 'sci.goal' }   // accepted only if the id is one of that seat's lessons
```

### Choosing

`client/shared/guide.js` (new) holds, for each seat, a list of lines: `{ id, tier, when(v, mem) -> false | args, done(mem) -> bool }`, and the words: `TEXT[id] = { full, short, all, vr, desk }`. Shared because the server picks from it and the page words from it.

1. Drop the lines whose `done` is true (learned).
2. Evaluate `when` for the rest. Of the lines that are true, take the lowest tier number; within a tier, the first in the list.
3. **Hold:** the line on show stays at least 4 s, unless a lower tier number (more urgent) arrives. Event lines (tier 3) stay 6 s.
4. Update the memory: changes in `ev`, `alarm`, `rider`, SURVEYED and the like mark lessons and start the idle clock again.

Four seats and a dozen small tests each, ten times a second: nothing.

---

## Going quiet

Three ways, all per seat:

- **While true.** A fault line shows while that fault is open, a step line while that step is the one in hand. Nothing repeats on a timer except the idle line, after 45 s with nothing new.
- **Learned.** Teaching lines (`*.role`, `*.goal`, `tech.keys`, `astro.rail`, ...) retire for good once the seat has done the thing, from the hub's own messages (a rover driven, the radio keyed, the Hauler mounted) or from the page's `learned` message.
- **Shorter.** A fault line drops to its short form once the crew has fixed that fault once while this seat was told about it. The first time: `SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.` After that: `SOLAR PANELS DUSTY.`

And one switch: a **GUIDE** toggle on each console (decision 8), engraved `ON` and `QUIET`. QUIET keeps tiers 1 and 2 (danger and faults) and hides the rest, and hides the captions. The setting is kept in the browser per seat. The astronaut has no switch: their lines are already few.

---

## Phases

Each phase is a mergeable PR that leaves the game playable. Order: 1, 2, 3, 4, 5. Phase 2 needs nothing. Phase 3 needs 1. Phases 4 and 5 need 3. Phase 1 is the smallest cold-start improvement: every seat knows its job and the objective, with no server change.

1. **Your job and the objective.**
2. **Names on things.**
3. **Faults and danger, from the server.**
4. **The sample run, step by step.**
5. **What the instruments mean, and going quiet.**

---

## Phase 1: your job and the objective

Client only. The server does not change.

| File | Change |
| --- | --- |
| `client/shared/guide.js` (new) | `TEXT` with the role and goal lines for every seat (`*.role`, `*.goal`, `tech.keys`, `astro.go`) and their 2-player wording. |
| `client/console.js`, `client/style.css` (the period section, not the lobby's) | The teletype strip in each panel (one across the top in the 2-player seat). For now the page picks: the role line for the first 20 s of a mission, then the goal line, then `tech.keys` until both rovers have been driven. The typing-out and its sound. |
| `client/astronaut.js` 134-200 | The status board stays visible while a mission runs and the astronaut is inside, with the MISSION face. Same board, same post, same place; a second drawing. |

### It runs when

- Every console shows its role line when the mission starts, then its goal line, and the 2-player seat shows one strip with 2-player wording.
- The astronaut finds the MISSION board in the hall with the tally on its Nixie tubes, and it says the base is dark when it is.

---

## Phase 2: names on things

Client only.

| File | Change |
| --- | --- |
| `client/tools.js` | A tag on a wire loop for each of the five tools, front and back, from one shared canvas texture. Off on the rover cameras' copies. |
| `client/stations.js` 145-155 | The same tags on the four decoys. |
| `client/world.js` | The `SAMPLE PORT`, `SOLAR ARRAY`, `SAMPLE TRAY` and `RIDER: HOLD RAIL` plates. |
| `client/interior.js` | The `SWITCHBOARD` plate. |

Canvas text waits for the fonts (DESIGN.md: `await document.fonts.load('32px Michroma')`), then draws, then sets `needsUpdate`.

### It runs when

- Every tool and decoy has a tag that reads from 1.5 m in the headset, and a tool turned over shows what it is for.
- The port, the near solar panel, the switchboard, the tray and the rail have their plates.

---

## Phase 3: faults and danger, from the server

| File | Change |
| --- | --- |
| `server/game.js` 485 | `v.alarm` for every seat; `v.me` for the astronaut. |
| `client/shared/guide.js` | The picker, the `when`/`done` tests and the fault and danger lines for all four seats (tiers 1 and 2), plus phase 1's lines moved under it. |
| `server/hub.js` | `hub.guide`: one memory per seat, `v.guide` added in `tick()`, the 2-player pick, clearing with the game. Marking lessons from messages it already handles (`ptt`, `rover`, `mount`). |
| `client/console.js` | The strip shows `state.guide`, worded from `TEXT`, instead of phase 1's page-side timers. Danger in `lamp-red`, faults in `lamp-amber`. |
| `client/arm.js` 335-412 | The label tape: drawn from a `tape` string in `draw(info)`, added to the redraw key. |
| `client/astronaut.js` 128-131 | Pass the line to the cuff, worded for the headset or the laptop. On a new tier 1 or 2 line: a tick, a short buzz in the left hand, and on a laptop the arm up for 3 s. |

### It runs when

- When the panels get dusty, the Scientist reads `SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.`, Ops `ALARM. ASK THE SCIENTIST WHAT BROKE.`, the Technician nothing new, and the astronaut's cuff `ALARM: ASK OPS`. After the fix, the second time it happens the Scientist reads `SOLAR PANELS DUSTY.`
- When a wheel breaks, the Technician reads which rover; when a shower is coming, the Technician reads the countdown; when the suit leaks, the astronaut's cuff says so.
- No seat's guide ever names something its seat may not know: read each `v.guide` sent to the astronaut, Ops and the Technician during a full demo mission in the browser's network panel.

---

## Phase 4: the sample run, step by step

| File | Change |
| --- | --- |
| `client/shared/guide.js` | The step and event lines (tiers 3 and 4): `sci.scout`, `sci.seen`, `sci.parked`, `sci.found`, `sci.dud`, `sci.done`, `ops.carry`, `ops.tray`, `ops.found`, `ops.dud`, `ops.full`, `tech.home`, `tech.mount`, `tech.ride`, `astro.rail`, `astro.off`, `astro.sample`, `astro.full`. |
| `server/hub.js` | Marking `tech.mount` and `tech.ride` learned from `rider` changing, SURVEYED at the start of each mission. |

### It runs when

- A first-time crew is talked through one sample, start to bank, by the lines alone: Scientist to Scout to sample, Hauler out, rock in hand, tray or port, FOUND.
- A dud banked gives `DUD` lines to the Scientist and Ops, and the astronaut's and Technician's lines never say which rock was real.

---

## Phase 5: what the instruments mean, and going quiet

| File | Change |
| --- | --- |
| `client/console.js` | The captions under the instruments, hidden once learned. The GUIDE toggle (`ON` / `QUIET`) in each panel, kept in `localStorage` (wrapped in try/catch, as the page must work without it). `{ t: 'learned' }` when the GUIDE tab, the POWER tab or a camera view is used. |
| `client/shared/guide.js`, `server/hub.js` | The idle lines (tier 6), the short forms, and accepting `learned` only for that seat's own lesson ids. |

### It runs when

- A seat that has done a thing is not told to do it again, in this mission or the next one in the same game, and a new game starts with the full guidance again.
- With every console on QUIET, only danger and fault lines show, and the mission plays exactly as before.

---

## Done means

- Every seat, at the start of a mission, is told in one line what it is and that the mission is to bring samples home.
- When anything breaks, the seat that can know what broke is told what it is and which tool fixes it, and every other seat is told who to ask, in one line each.
- Every tool and decoy wears a name tag with what it is for on the back; the port, the near solar panel, the switchboard, the tray and the rail are labelled.
- The astronaut's words are on the cuff's tape, the hall's board, tags and plates, and nowhere on the visor.
- Each seat's line comes only from that seat's own view and memory, and no line tells the astronaut, Ops or the Technician which rock is real, or names a fault their seat does not know.
- Lines retire when learned and shrink when familiar; QUIET leaves only danger and faults; the game plays the same with all guidance off.
- The lobby looks as it did.
- `npm start` boots and every page loads and plays without errors in the browser console. Four people who have never played, told only "you are the Scientist" (and so on), bank a sample in their first mission.

## Risks

| Risk | What to do about it |
| --- | --- |
| **The words do the talking for the crew,** and the game stops being about talking | Lines say who to ask and tell, not the other seat's answer (ground rule 2). If playtests show seats acting on their line without speaking, cut the line, not the radio. |
| **A line leaks hidden information** | The picker never sees `game`, only the seat's view; the per-seat read lists are narrower than the views; phase 3 includes reading every `v.guide` the astronaut, Ops and the Technician get during a demo mission. |
| **Too much text,** especially in the headset | 20 characters on the cuff, one line per seat, the tick and buzz only for urgent lines, the QUIET switch, lines that retire. If the cuff tape is still too much, drop it and keep the hall board, tags and plates (decision 2). |
| **The laptop astronaut never sees the cuff** | The arm comes up for 3 s with an urgent line (decision 3). |
| **Flicker** as conditions toggle (a rover inching in and out of 6 m) | The 4 s hold, and lower tier numbers are the only thing that interrupts a line. |
| **The words drift from the mechanics** when a rule changes | One table, `client/shared/guide.js`, beside `config.js`; numbers come from `CFG` (`{W}` from the manifest, the 25 s from `CFG.generatorSeconds`). |
| **The 2-player seat reads "ask the Scientist"** | One strip and its own wording table. |
| **Tags cost the Quest** | One shared texture, tags merged into each tool's mesh where it can be done, nine tags in all. Plates are five more small meshes. |
| **Canvas text drawn before the font arrives** | Every canvas that draws words waits for the font, as DESIGN.md says. |

## Decisions to confirm

Each has a recommendation, and the spec above is written to it. None of them blocks phase 1.

1. **Where a console's line lives.** A teletype strip at the top of each panel (recommended: in the 2-player seat each seat's line would otherwise fight for the one header toast). Or: reuse the header's toast for everything, one line per page.
2. **Words on the cuff.** One strip of label tape, at most 20 characters, the only text on an otherwise icon-only cuff (recommended: the astronaut is the seat with the least to go on). Or: the cuff stays icons only and the astronaut's words live only on the hall board, tags and plates.
3. **The laptop astronaut.** An urgent new line raises the arm for 3 s (recommended). Or: the cuff is only seen while the radio is keyed, as now.
4. **The 2-player seat.** One strip with the most urgent of its three seats' lines, in its own wording (recommended). Or: three strips, one per panel, in 4-player wording.
5. **Who is told what broke.** The Scientist names it and the tool; Ops and the astronaut are told to ask; the Technician names only wheels and meteors (recommended: it keeps the chain Scientist to Ops to astronaut). Or: Ops is also told which tool is needed, which makes Ops' line useful on its own and the Scientist's call shorter.
6. **The server picks, the page words** (recommended: the hiding stays in one place, and the page knows headset from laptop). Or: each page picks its own line from its own state, with no server change, which is simpler but puts the leak review in four places.
7. **How long guidance remembers.** Per seat, for the game, cleared when the game is cleared or the seat sits empty for 60 s (recommended: that is when new people sit down). Or: per browser, kept in `localStorage` across games, which forgets nobody but may silence a new player on a laptop someone else used.
8. **A GUIDE switch** on each console, `ON` and `QUIET` (recommended), with QUIET keeping danger and faults. Or: no switch; guidance only retires by learning.
9. **The lobby's two out-of-date role lines.** Change the copy only, in `client/lobby.js` `INFO`: the Scientist "The chart and the field guide. Knows what" and the Technician "Two rovers, two cameras. Knows where" (recommended: copy, not a restyle; the lobby's look is untouched). Or: leave the lobby exactly as it is and let the run's role lines correct it.
10. **The hall's board during the mission.** It stays up with the MISSION face (recommended: it is where the astronaut starts and comes back to refill). Or: it goes away when the mission starts, as now, and the objective is only on the cuff.
11. **Decoy tags.** Decoys wear tags too, with `SPARE` on the back (recommended: reading the tags is the search; Ops' log is still the way to know where). Or: decoys stay bare, which makes the real tools stand out at a glance.
