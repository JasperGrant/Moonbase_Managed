# Spec: light text guidance

Status: written, not started. Audited against `main` at `02f587d` (the sample run is in). Read [CLAUDE.md](../CLAUDE.md), [DESIGN.md](DESIGN.md) and [SPEC-sample-run.md](SPEC-sample-run.md) first. This spec adds words; it changes no rule, no role and nothing a seat is allowed to know.

**How it is checked:** no tests, screenshots or measurements in this pass, and `test/` is left alone. Each phase must boot with `npm start` and play without errors in the browser console. The crew playtests it.

## Goal

Today you only know what to do if someone explains it. After this pass, with no tutorial and very little text:

1. Every seat is told **its job and the objective**: find rock samples and bring them home.
2. When something breaks, **the seat that can know is told what broke and what to do**; the others are told who to ask. Dusty panels: the Scientist reads `SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.`, Ops `ALARM. ASK THE SCIENTIST WHAT BROKE.`, the astronaut's cuff `ALARM: ASK OPS`.
3. **Every tool wears a name tag**, with what it is for on the back.
4. Each seat has **one short line about what is going on now**, and it goes quiet once the player shows they understand.

## The audit: what a new player cannot work out

| Seat | Gap | Today | Where |
| --- | --- | --- | --- |
| All | The objective, and their own job | Briefs sit behind a lobby button and are never shown in the mission. The lobby's role lines are out of date ("Scientist: the gauges", "Technician: the radar and the rover"). | `console.js` 26-30, 45, 55-62; `lobby.js` 18-25 |
| All | What broke and who acts | By design nobody is told in words: one-word `ALARM`, a cuff triangle, the reason only in the end log. The Scientist's chart blinks a symbol, but nothing names the tool or who to tell. | `console.js` 4, 108, 564-577; `arm.js` 402; `game.js` 410 |
| Astronaut | Which tool is which, and what it is for | Five tools and four look-alike decoys, unnamed. The "you need this tool" outline only shows at the broken fixture. | `stations.js` 55-60, 145-190, 379-393 |
| Astronaut | Where samples go; riding; patching; the generator; that oxygen refills inside | The port is unlabelled. The controls are in the gate's folded text. The hall board disappears when the mission starts. The cuff is icons only. | `world.js` 1005; `astronaut.html` 28; `astronaut.js` 160; `arm.js` 14 |
| Mission Ops | What to do first | Nothing says to ask the Scientist, that the tool log guides the astronaut, or where samples go. | `console.js` 276-296, 435-450 |
| Technician | Where to drive; what HOME, RIDER and METEOR mean | No map by design, and nothing says to ask the Scientist. Only they get the meteor warning, and nothing says "get the astronaut under cover". | `console.js` 367-390, 710; `game.js` 509 |
| Scientist | What the chart and gauges mean and what to do | Nothing says "send the Scout to bright ground", "describe the rock", or what a low SOLAR IN means. The wiring card is only on the POWER tab. | `console.js` 478-690, 85 |
| 2-player | Who "the Scientist" is | The Mission Operator is all three Earth seats. | `config.js` `PLAYERS` |

Each seat's `view()` (`game.js` 485-527) is the ceiling on what it may be told. The astronaut and Technician get rocks **by look only**; Ops gets no faults, scene or samples; the Scientist gets samples with their kind **in explored ground only**. The astronaut's and Technician's `scene` does hold the broken thing (for drawing), so "it is in the view" is not on its own a safe rule: see rule 3.

## Ground rules

1. **Short.** A console line is at most 50 characters (about eight words), a cuff line 20, a tag or plate 16, a caption or board line 24. Capitals, plain words, no paragraphs.
2. **One line per seat,** saying who to ask or tell, never another seat's answer. The game is still the talking.
3. **Only what the seat may know.** A line is picked from the seat's own view and memory, never from the game, and each seat's lines may *say* less than its view holds:
   - **Astronaut:** never names a fault except their own suit leak; never says whether a rock is real.
   - **Ops:** never names a fault; rocks only as in hand, in the tray, banked or dud.
   - **Technician:** names only a broken wheel and the meteor warning (their lamps); never whether a rock is real.
   - **Scientist:** may name the one fault and its tool (the chart already shows it), and a sample's kind once it is on the chart.
   - **Nobody** is told when the next fault comes, where an unexplored sample is, or that comms are down.
4. **Never required.** Nothing blocks, pauses or covers an instrument. With guidance off, the game is unchanged.
5. **Goes quiet.** A line shows while it is true. Teaching lines retire once done. Fault lines shrink after the first fix. Danger lines always show.
6. **1960s look, nothing on the visor.** A teletype strip, cuff label tape, tags, plates and the hall board. No pop-ups, arrows or floating text. The lobby is not restyled (decision 9 is copy only).
7. **Feedback.** A new console line types itself out (about 30 characters a second, a soft clatter). An urgent cuff line gives a tick and a short buzz in the left hand. Tags and plates share one texture; boards and the cuff redraw only on change.

## Where the words go

- **Consoles:** a **teletype strip** across the top of each panel: a `console-deep` slot in a `bezel` frame, one line of Courier Prime capitals, and an amber jewel that lights as a line arrives. Danger lines show in `lamp-red`, faults in `lamp-amber`, the rest in `ink`. The header's one-word toast stays. The 2-player seat has **one** strip with the most urgent of its three seats' lines.
- **Astronaut, cuff:** one strip of embossed **label tape** above the two dials (about x 30-450, y 28-76 on the 640 × 374 face), with `dial` Michroma capitals on `bakelite` tape. This is the only text on the cuff. On a laptop, where the arm is up only while the radio is keyed, an urgent line raises it for 3 s.
- **Astronaut, hall board:** during the mission the FLIGHT STATUS board stays up as a **MISSION** board: `BRING 4 SAMPLES HOME`, the tally on Nixie tubes, and `OXYGEN REFILLS IN HERE` (or `BASE DARK: NO REFILL`).
- **Tags** on every tool and decoy: an enamel tag on a wire loop, about 12 × 4 cm with 2 cm letters, readable at 1.5 m. They are part of the tool's model and are hidden on the rover cameras' copies.
- **Plates,** in the airlocks' engraved style (`airlock.js` 98): `SAMPLE PORT` (port collar), `SOLAR ARRAY` (middle near panel's post), `SWITCHBOARD` (above the board in the hall), `SAMPLE TRAY` (Hauler's aft bay), `RIDER: HOLD RAIL` (the rail).

## The lines

`{B}` is banked, `{W}` wanted (4 in the demo), `{N}` seconds, `{KIND}` the short kind name (`ANORTHOSITE`, `BASALT`, `ORANGE GLASS`, `ICE CLOD`) and `{ROVER}` either `SCOUT` or `HAULER`. Tiers: **1 danger, 2 fault, 3 event (6 s), 4 step, 5 teach, 6 idle (after 45 s with nothing new).** "Short" is the form used once the crew has done or fixed it once.

### Scientist

| Id | T | When | Line | Quiet |
| --- | --- | --- | --- | --- |
| `sci.role` | 5 | First 20 s | `YOU HAVE THE CHART AND THE FIELD GUIDE.` | After the first mission |
| `sci.goal` | 5 | Then, until GUIDE is opened | `MISSION: {W} SAMPLES. THE GUIDE TAB SHOWS THEM.` | GUIDE opened |
| `sci.scout` | 4 | Nothing wanted on the chart, SURVEYED up less than 5 | `BRIGHT GROUND MAY HOLD SAMPLES. SEND THE SCOUT.` | SURVEYED up 5 |
| `sci.seen` | 4 | A wanted kind on the chart, no rover within 6 m | `{KIND} ON THE CHART. TALK THE SCOUT ONTO IT.` | Short: `{KIND} ON THE CHART.` |
| `sci.parked` | 4 | The Scout within 6 m of it | `SCOUT IS THERE. DESCRIBE THE ROCK FOR OPS.` | Short: `SCOUT IS THERE.` |
| `sci.found` / `sci.dud` | 3 | New assay | `FOUND: {KIND}. {B} OF {W} HOME.` / `DUD: A LOOKALIKE. SEE NOT THIS ON THE CARD.` | |
| `sci.done` | 4 | Manifest banked | `MANIFEST HOME. EXTRA SAMPLES STILL SCORE.` | |
| `sci.dust` | 2 | Dust symbol, or SOLAR IN under 60 | `SOLAR PANELS DUSTY. TELL OPS: THE BRUSH.` | Short: `SOLAR PANELS DUSTY.` |
| `sci.board` | 2 | Board symbol or wiring card, POWER open (if not: `SWITCHBOARD OUT. THE WIRING CARD IS ON POWER.`) | `SWITCHBOARD OUT. READ THE WIRING CARD TO OPS.` | Short: `SWITCHBOARD OUT.` |
| `sci.wheel` | 2 | Wheel symbol | `{ROVER} WHEEL BROKEN. TELL OPS: A SPACE TIRE.` | Short: `{ROVER} WHEEL BROKEN.` |
| `sci.hull` | 2 | Hull symbol | `HULL BREACH. TELL OPS: THE WELDER.` | Short: `HULL BREACH.` |
| `sci.suit` | 2 | Suit symbol | `SUIT LEAK. TELL OPS: THE PATCH KIT, NOW.` | Short: `SUIT LEAK.` |
| `sci.leak` | 2 | LEAK lit, no symbol on the chart | `LEAK LAMP: HULL OR SUIT. ASK OPS.` | |
| `sci.batt` / `sci.dark` | 1 | Battery under 30 on a power fault / base dark | `BATTERY LOW. THE BASE GOES DARK AT ZERO.` / `BASE DARK: NO OXYGEN REFILL INSIDE.` | |

### Mission Ops

| Id | T | When | Line | Quiet |
| --- | --- | --- | --- | --- |
| `ops.role` | 5 | First 20 s | `YOU ARE THE ONLY VOICE. HOLD SPACE TO TALK.` | First transmission |
| `ops.goal` | 5 | Then | `MISSION: {W} SAMPLES HOME. ASK THE SCIENTIST WHERE.` | First FOUND |
| `ops.alarm` | 2 | Broken, first 15 s | `ALARM. ASK THE SCIENTIST WHAT BROKE.` | Short: `ALARM. ASK THE SCIENTIST.` |
| `ops.tool` | 2 | Still broken after 15 s | `YOUR TOOL LOG SAYS WHERE EACH TOOL LIES.` | After a fix |
| `ops.full` | 2 | Broken, both hands full | `HANDS FULL. TELL THEM TO PUT ONE DOWN.` | |
| `ops.carry` / `ops.tray` | 4 | Sample in hand / in the tray only | `SAMPLE IN HAND. TRAY ON THE HAULER, OR THE PORT.` / `SAMPLES IN THE TRAY. THE PORT IS BY DOOR S.` | First bank |
| `ops.found` / `ops.dud` | 3 | New bank | `BANKED. {B} OF {W} HOME.` / `DUD. ASK THE SCIENTIST WHAT TO LOOK FOR.` | |
| `ops.o2` / `ops.dark` | 1 | Oxygen under 30 / base dark | `SUIT OXYGEN LOW. ASTRONAUT INSIDE TO REFILL.` / `BASE DARK. THE GENERATOR GIVES 25 S OF POWER.` | |
| `ops.idle` | 6 | 45 s quiet | `ASK THE SCIENTIST FOR THE NEXT SAMPLE.` | |

### Technician

| Id | T | When | Line | Quiet |
| --- | --- | --- | --- | --- |
| `tech.role` | 5 | First 20 s | `YOU DRIVE BOTH ROVERS. NO MAP: ASK THE SCIENTIST.` | After the first mission |
| `tech.keys` | 5 | Until both are driven (Hauler only left: `HAULER: ARROWS. IT CARRIES THE ASTRONAUT.`) | `SCOUT: W A S D. HAULER: ARROWS. BOTH AT ONCE.` | Each driven |
| `tech.home` | 4 | A rover first past 60 m, 8 s | `HOME DIAL: THE RED NEEDLE POINTS TO BASE.` | Once |
| `tech.mount` | 4 | Astronaut outside within 4 m of the stopped Hauler | `ASTRONAUT AT THE HAULER. WAIT FOR THE RIDER LAMP.` | First ride |
| `tech.ride` | 4 | RIDER lit | `RIDER ABOARD. DRIVE GENTLY. STOP TO LET THEM OFF.` | Short: `RIDER ABOARD.` |
| `tech.wheel` | 2 | A WHEEL lamp lit | `{ROVER} WHEEL BROKEN. TELL OPS: IT NEEDS A TIRE.` | Short: `{ROVER} WHEEL BROKEN.` |
| `tech.meteor` / `tech.falling` | 1 | Countdown / falling | `METEORS IN {N} S. TELL OPS: ASTRONAUT TO COVER.` / `METEORS FALLING. HOLD THE HAULER STILL.` | |
| `tech.idle` | 6 | 45 s, no rover moving | `ASK THE SCIENTIST WHERE TO DRIVE.` | |

`tech.falling` matters because cover in the open is crouching beside the Hauler (`rules.js` `sheltered`).

### Astronaut (cuff tape; laptop form in brackets)

| Id | T | When | Line | Quiet |
| --- | --- | --- | --- | --- |
| `astro.go` | 5 | First 30 s, inside | `ASK OPS WHERE TO GO` | After the first mission |
| `astro.alarm` | 2 | Broken, not the suit | `ALARM: ASK OPS` | |
| `astro.suit` / `astro.patch` | 1 | Suit leak / patch kit in hand | `SUIT LEAK: PATCH KIT` / `TOUCH KIT TO LEAK` (`PRESS F TO PATCH`) | |
| `astro.o2` / `astro.dark` | 1 | Oxygen under 30 outside / base dark | `O2 LOW: GO INSIDE` / `BASE DARK: NO REFILL` | |
| `astro.meteor` | 1 | Falling, outside | `METEORS: TAKE COVER` | |
| `astro.rail` / `astro.off` | 4 | Near the rail / riding and stopped | `GRAB RAIL TO RIDE` (`E: RIDE THE HAULER`) / `STEP OFF THE PLATE` (`E: STEP OFF`) | First ride / dismount |
| `astro.sample` / `astro.full` | 4 | Sample in hand / hands full near a tool | `PORT IS BY DOOR S` / `HANDS FULL: DROP ONE` | First bank |
| `astro.idle` | 6 | 45 s quiet | `ASK OPS: WHAT NEXT` | |

The astronaut gets no meteor *warning* line: they do not get the warning, so it comes over the radio, as now.

### Tags, captions and the 2-player seat

- **Tags (front / back):** `BRUSH` / `SOLAR PANELS`, `WELDER` / `HULL CRACKS`, `PATCH KIT` / `SUIT LEAKS`, `SPACE TIRE` / `ROVER WHEELS`, `GENERATOR` / `PULL CORD`. The decoys read `WRENCH`, `RATCHET`, `HAMMER`, `GREASE GUN` / `SPARE`.
- **Captions** (phase 5): small `ink-dim` plates under an instrument, hidden after that thing has happened once:
  - Technician: HOME `POINTS TO BASE`, WHEEL `LIT: ROVER STUCK`, RIDER `LIT: ASTRONAUT ON`, METEOR `IMPACT COUNTDOWN`.
  - Scientist: the chart `BRIGHT: LIKELY SAMPLES`, SURVEYED `SEEN BY ROVERS`, SOLAR IN `LOW: DUSTY PANELS`, BOARD OUT `LOW, SOLAR OK: BOARD`, BATTERY `DRAINS ON A POWER FAULT`, LEAK `HULL OR SUIT`, DRAIN `3X WITH A LEAK`, ASSAY `LAST ROCK IN THE PORT`.
  - Ops: HANDS `WHAT THEY HOLD`, TOOL LOG `WHERE EACH TOOL LIES`, SAMPLE LOG `HANDS, TRAY, BANKED`.
- **2-player wording:** lines that send you to another Earth seat change. `TELL OPS:` becomes `ASTRONAUT NEEDS`. Special lines:
  - `ops.goal`: `MISSION: {W} SAMPLES HOME. THE CHART SHOWS WHERE.`
  - `ops.alarm`: `ALARM. THE CHART'S SYMBOL SAYS WHAT BROKE.`
  - `ops.dud`: `DUD. CHECK NOT THIS ON THE GUIDE CARD.`
  - The idle lines: `PICK BRIGHT GROUND ON THE CHART. SEND THE SCOUT.`
  - `tech.role`: `YOU DRIVE BOTH ROVERS. THE CHART IS YOUR MAP.`
  - `tech.wheel`: `{ROVER} WHEEL BROKEN. ASTRONAUT NEEDS A TIRE.`
  - `tech.meteor`: `METEORS IN {N} S. ASTRONAUT TO COVER, NOW.`
  - `sci.board`: `SWITCHBOARD OUT. READ THE WIRING CARD ALOUD.`
  - `sci.parked`: `SCOUT IS THERE. DESCRIBE THE ROCK ON THE RADIO.`
  - `sci.leak`: `LEAK LAMP: HULL OR SUIT. ASK THE ASTRONAUT.`

## Role briefings (what pops up)

One card per seat: who you are, what to do, your controls, who you talk to. It replaces the brief on Mission Control's briefing sheet (`console.js` 26-30 `BRIEF`, the sheet at 45) and the astronaut's folded "Controls" text (`astronaut.html` 28). Both changes are copy only, in the same elements, with the lobby's look untouched. The card **pops up once on its own** the first time a person takes a seat in a game (decision 12), and is on the existing button after that. It is set in Courier Prime on a cream `dial` card, with the four headings in Michroma.

### Astronaut

> **The story.** You are the only person on the Moon. The base stands on the ridge between Shackleton and de Gerlache craters at the south pole, built by people who learned their trade on Gemini. Mission Control is 384,000 km away and can see everything except what is in front of you.
>
> **Your job.** Bring rock samples home. Mission Ops will tell you which rock and where. When something breaks, you are the only one with hands: find the right tool, go out, fix it. Get inside before a meteor shower, or crouch beside the Hauler. Your oxygen refills inside.
>
> **Your controls.**
>
> | | Headset | Bare hands | Laptop |
> | --- | --- | --- | --- |
> | Move | Left stick, right stick turns, A hops | Pinch the ground to hop there | W A S D, mouse to look, Space hops |
> | Take a tool or rock | Hold the trigger or grip on it | Pinch it | Click it |
> | Put it down | Let go (swing to throw) | Let go | Q |
> | Use a tool | Hold it against the broken thing | The same | Click, hold to keep brushing or welding |
> | Radio | Raise your left wrist like a watch | Left hand to your helmet | Hold Tab |
> | Ride the Hauler | Grab its rail | Pinch its rail | E (E again to step off) |
> | Through a door | Walk into the airlock | The same | The same |
> | Patch your suit, the generator | Touch the kit to the leak, pull the cord | The same | F, G |
> | Crouch, leave | Crouch; hold a finger on EXIT on your cuff | The same | C; hold X |
>
> **Who you talk to.** Only Mission Ops. Your wrist shows your oxygen, the clock, what is in each hand, and a triangle when something is broken.

### Mission Ops

> **The story.** You are CAPCOM, the one voice the astronaut hears across 384,000 km. The Scientist and the Technician know things the astronaut needs, but only you are on the radio.
>
> **Your job.** Turn what the others know into what the astronaut does. Ask the Scientist which rock and which fault; ask the Technician where the rovers are. Tell the astronaut where each tool lies (your tool log knows), where to go, and what to pick up. When the astronaut is suited, call them GO in the lobby.
>
> **Your controls.** Hold **Space** (or the big button) to talk. The **Enable radio** button turns your microphone on. Click **GO** under the astronaut in the lobby, then **Ready** for yourself. The **HANDS** panel shows what the astronaut holds, the **TOOL LOG** where every tool lies, and the **SAMPLE LOG** what is in hand, in the tray and banked.
>
> **Who you talk to.** Everyone. You are the only seat that talks to the astronaut.

### Technician

> **The story.** You drive two robots across the Moon from a chair in Houston: the Scout, a quick prospector, and the Hauler, the big rover the astronaut rides. You have no map. You have two camera screens, a compass and a needle that points home.
>
> **Your job.** Take the Scout where the Scientist asks, so the chart fills in and samples show up. Bring the Hauler to the astronaut, wait for the RIDER lamp, and drive them out and back gently. You alone get the meteor warning: tell Ops at once, so the astronaut gets inside or crouches by a stopped Hauler.
>
> **Your controls.** **W A S D** drive the Scout, the **arrow keys** the Hauler, both at once; let go and a rover stops. **C** or a click on the left screen switches the Scout's view between first and third person, and **/** or a click on the right screen does the same for the Hauler. The mouse **wheel** over a screen moves the chase camera. **HOME** needles point to base, with the range in metres. A **WHEEL** lamp means that rover is stuck, **RIDER** means the astronaut is aboard, and **METEOR** counts down to impact.
>
> **Who you talk to.** The Scientist, for where to go. Ops, for the astronaut and the meteor warning.

### Scientist

> **The story.** You are the mission's geologist, with an orbital survey of the ridge and a field guide to what the mission came for. Anorthosite, the Moon's oldest crust. Basalt, pitted with gas holes. The orange glass of old fire fountains. Ice, from craters the sun never touches. Each one has a lookalike.
>
> **Your job.** Read the chart: bright ground may hold samples. Send the Technician's Scout there; the chart sharpens wherever a rover drives, and samples appear on it. Describe the right rock from your field guide so Ops can tell the astronaut. When something breaks, its symbol blinks on your chart: work out what it is and tell Ops which tool fixes it.
>
> **Your controls.** Four tabs. **SURVEY** is the chart: click **RANGE** to zoom, and **CENTRE** to follow the base, the Scout or the Hauler. **GUIDE** has the card for each wanted sample (what it looks like, where it lies, its telltale, and NOT THIS) and the **ASSAY** lamps: FOUND or DUD. **POWER** has the battery, solar and board gauges, and the wiring card when the switchboard trips. **AIR** has oxygen, drain and the LEAK lamp.
>
> **Who you talk to.** The Technician, for where to drive. Ops, for which rock and which fault.

### Mission Operator (2-player)

> **The story.** A shoestring crew: you are Mission Control, all of it.
>
> **Your job and controls.** Everything on the three cards above: the radio (**Space**), the rovers (**W A S D** and the **arrows**), the chart and guide (the tabs). Read the chart, drive the Scout to bright ground, find the sample, bring the astronaut on the Hauler, and talk them onto the right rock. When something breaks, the chart's symbol says what; tell the astronaut which tool.
>
> **Who you talk to.** The astronaut, and nobody else.

## How the server picks a line

The server picks, so the hiding stays in one place and works the same on a laptop and on Cloudflare. The page words the line, because only it knows headset from laptop.

- **Inputs:** the view about to be sent to that seat, already filtered by `game.view(role)`, and that seat's memory. Never `game`. Each seat's lines read only these fields:
  - Astronaut: `alarm suit hands carry riding rovers.hauler me scene.meteor oxygen powered ev`
  - Ops: `alarm hands carry tray tally oxygen powered ev`
  - Technician: `alarm rovers rider astro meteor scene.wheels powered ev`
  - Scientist: `power leak wiring survey manifest assay tally powered ev`
- **Two view additions, neither new knowledge:** `v.alarm` (something is broken: already public as the ALARM toast and the cuff triangle) for every seat, and `v.me` (their own pose) for the astronaut.
- **Memory,** one per seat in `server/hub.js`, so it works in both `server.js` and the Durable Object: `{ learned, fixed, line, since, last, quietSince, missions }`. It is kept across missions in a game and cleared when the game is (Start over, `clearPlayers`) or when the seat has been empty 60 s.
- **Choosing,** in `client/shared/guide.js` (new, shared by the server and the pages): per seat a list of `{ id, tier, when(v, mem), done(mem) }`, plus the words `TEXT[id] = { full, short, all, vr, desk }`. Drop the learned lines, take the most urgent true one, and hold it at least 4 s unless something more urgent arrives.
- **Wire:** each tick, `v.guide = { id, a, tier }` (the 2-player seat gets its most urgent one, with a 2-player flag). It travels with the view, so it is delayed with the instruments when the admin's comms delay is on. Pages report UI-only lessons with `{ t: 'learned', id }`, which is accepted only for that seat's own ids.

## Phases

Each phase is one mergeable PR that leaves the game playable. Phase 1 is the smallest cold-start fix and touches no server code. Phase 3 needs 1; phases 4 and 5 need 3.

| Phase | What | Files | It runs when |
| --- | --- | --- | --- |
| 1. Your job and the objective | The role briefings (copy, and popping up once per seat). The teletype strip. The page shows `*.role` for 20 s, then `*.goal`, then `tech.keys`. The MISSION board in the hall. | `client/shared/guide.js` (new), `console.js`, `style.css` (period section), `astronaut.html` 28, `astronaut.js` 134-200 | Every console shows its role and goal at the start; the hall board shows the tally and says when the base is dark |
| 2. Names on things | Tags on the tools and decoys; the five plates. Canvas text waits for the font (DESIGN.md). | `tools.js`, `stations.js` 145-155, `world.js`, `interior.js` | Every tag reads from 1.5 m, with its purpose on the back; the fixtures are labelled |
| 3. Faults and danger, from the server | `v.alarm`, `v.me`, the picker, the memory, tiers 1 and 2 for all seats, the cuff tape, and the tick, buzz and arm-up | `game.js` 485, `hub.js`, `guide.js`, `console.js`, `arm.js` 335-412, `astronaut.js` 128-131 | Dust gives the lines in the Goal section; a wheel tells the Technician which rover; the second dust shows the short form; read every `v.guide` the astronaut, Ops and the Technician get in a demo and find nothing they may not know |
| 4. The sample run, step by step | Tiers 3 and 4: the scout, seen, parked, carry, tray, mount, ride, rail, sample and bank lines | `guide.js`, `hub.js` | A first-time crew is talked from chart to bank by the lines; a dud never says which rock was real |
| 5. Instruments, and going quiet | Captions; the idle lines; the short forms; `learned` from the pages; a GUIDE switch (`ON` / `QUIET` keeps tiers 1-2), stored per seat in `localStorage` inside a try/catch | `console.js`, `guide.js`, `hub.js` | A seat is not told what it has done, in later missions of the same game; on QUIET only danger and faults show and the game plays as before |

**Done** when four people who have never played, told only their seat, bank a sample in their first mission.

## Risks

| Risk | What to do |
| --- | --- |
| The words do the talking | Lines say who to ask, not the answer. If seats act without speaking, cut the line. |
| A line leaks | The picker never sees `game`; read lists are narrower than the views; phase 3's check of every `v.guide`. |
| Too much text in the headset | 20 characters, urgent-only buzz, lines that retire. Fall back to the board, tags and plates only (decision 2). |
| Flicker | The 4 s hold. |
| Words drift from the rules | One table beside `config.js`, with numbers from `CFG`. |
| Quest cost | One texture for nine tags and five plates. |

## Decisions to confirm

The spec is written to each recommendation. None blocks phase 1.

1. **Console line:** a strip per panel (recommended), or reuse the header toast.
2. **Cuff:** one strip of label tape, the only text on the cuff (recommended), or icons only, with words only in the world.
3. **Laptop astronaut:** an urgent line raises the arm for 3 s (recommended), or the cuff shows only while talking.
4. **2-player seat:** one strip with its own wording (recommended), or three strips in 4-player wording.
5. **Who is told what broke:** the Scientist names the fault and the tool, Ops and the astronaut are told who to ask, and the Technician names only wheels and meteors (recommended). Alternatively, Ops is also told the tool.
6. **Server picks, page words** (recommended), or each page picks from its own state: simpler, but four places to review for leaks.
7. **Memory:** per seat for the game, cleared on Start over or after 60 s empty (recommended), or per browser.
8. **GUIDE switch** `ON` / `QUIET` (recommended), or none.
9. **Lobby copy only:** Scientist "The chart and the field guide. Knows what", Technician "Two rovers, two cameras. Knows where" (recommended), or leave the lobby exactly as is.
10. **Hall board** stays up as the MISSION board (recommended), or it goes when the mission starts.
11. **Decoy tags** with `SPARE` on the back (recommended), or decoys left bare.
12. **Briefings pop up** once on their own the first time a person takes a seat in a game (recommended), or they stay behind the button as now.
