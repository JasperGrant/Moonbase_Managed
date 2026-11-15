# Spec: Mission Control consoles that look like a control room

Design: [../design/mission-control-consoles.md](../design/mission-control-consoles.md). Process: [../WORKFLOW.md](../WORKFLOW.md).

## Why

The three laptop seats (Mission Ops, Technician, Scientist) carry the right information, but they read as a web page with instruments pasted in: a header of captions, a line of text for alarms, pictures stretched to the width of the window until they blur, and a page that has to be scrolled in the middle of a mission. A real Mission Operations Control Room desk is the opposite: one fixed console that never scrolls, a wall of event lights, meters and recorders, a keyset under the hand, and almost nothing to read.

## Want

- **One desk, one screen.** Each seat's console fits a 1366 x 768 laptop screen with no scrolling, and fills a bigger screen without blurring.
- **The same frame on every desk**, so a player who changes seats is not lost:
  - a **status strip** along the top: whose desk it is, the mission clock, suit oxygen, samples banked, the score, and a lamp for each of the four seats;
  - a row of **event lights** in place of the line of alarm text: one square lamp with a picture for each thing that can happen (alarm, fixed, meteor hit, base dark, power back, sample banked, dud, no link). The same eight, in the same order, on every desk. A lamp lights when its event happens and fades back to dark after a few seconds;
  - a **keyset** along the bottom: the keys this seat uses, drawn as keycaps with a picture of what each does. A keycap lights while its key is held.
- **Pictures, not captions.** Every caption that can be a picture becomes one: a clock for the mission clock, an oxygen bottle, a rock, the four seats as a helmet, a headset, a wheel and a magnifier, the two rovers as their silhouettes, a house for the base. Words stay only where a player has to *say* them on the radio (the names of the bays in the hall, N E S W) and on the plate under a meter.
- **Mission Ops** gets three things side by side:
  - the astronaut's **two hands**, each a glove with what it holds drawn in the palm (a tool or a rock);
  - a **tool board**: a plan of the hall divided into its named bays, with each tool's silhouette sitting in the bay where it lies, and a row for outside. As rough as today's tool log: the bay, not the spot;
  - the **samples on their way home**, as one picture read top to bottom: hands, the Hauler's tray, the bank;
  - a **mission tape**: six minutes of paper with a needle at now and a small mark for each thing that has happened.
  - The talk key looks like an intercom key: a transmit lamp, a receive lamp, a level meter that moves with the voice.
- **The Technician** gets two camera screens that look like monitors (rounded glass in a bezel), with each rover's instruments on a panel directly under its own screen, and the meteor warning on a pillar between them. Each rover gets a speed meter. The view each camera is in, and the key that changes it, are pictures in the corner of the screen.
- **The Scientist** keeps the survey scope on screen all the time, and has a second, switchable display beside it for the field guide, power and air. Power and air each gain a **strip-chart recorder**: a pen on moving paper that shows the last minute, so a slow leak or a draining battery is seen as a slope, not read as a number.
- Every action still answers: a key pressed lights its keycap and clicks, an event light comes on with its sound, needles swing, the recorder pen moves.
- A player who hovers over (or tabs to) any instrument is told its name in words.

## Not wanted

- Any change to what a seat knows. No seat learns anything it does not learn today; the server sends nothing new.
- Any change to the lobby, the briefing sheet's look, or the debrief.
- A modern dashboard: no cards, no charts with gradients, no tooltips styled as bubbles, no icon font, no emoji. The 1960s look in [DESIGN.md](../DESIGN.md) stands.
- Paragraphs. The hint lines under the Technician's cameras and the sentence on the talk key go.

## Done when

- At 1366 x 768 each of `/ops`, `/tech` and `/sci` shows its whole console with no scroll bar, and at 1920 x 1080 nothing is blurred.
- A screenshot of each console during a mission has no sentence on it, and no caption that is not either a word a player says aloud or a meter's plate.
- A new player, shown the three consoles for one minute with the sound off, can point to: the time left, the oxygen, which tool is in which hand, where the welder is, which rover has a broken wheel, how long until the meteors, and whether the air is leaking.
- The demo mission can still be won from the consoles, and every check that passes today still passes.

## Supersedes

- [SPEC-v2.md](../SPEC-v2.md), "Views are switched with big tabs": the Scientist's survey chart is no longer behind a tab. The field guide, power and air still are.
- [SPEC-1960s-pass.md](../SPEC-1960s-pass.md), Phase 1, the rows for the header, `#crew`, `#toast` and `#ptt`: replaced by the status strip, the event lights and the keyset.
- [SPEC-sample-run.md](../SPEC-sample-run.md), the layout of the Mission Ops tool log and sample log, and of the Technician's instrument strip. What they show is unchanged.
