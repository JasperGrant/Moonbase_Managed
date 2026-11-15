# Spec → Design → Code

How a feature goes from an idea to code in this repo. Three layers, each written before the next, each reviewed by a person before the next is written.

```
docs/specs/<feature>.md    what we want, in plain language          (a person writes it, or dictates it)
docs/design/<feature>.md   how the code will do it                  (Claude writes it from the spec; a person reviews it)
client/ server/ test/      the code, generated from the design      (Claude writes it from the design, not the spec)
```

The design layer is where misreadings are caught cheaply. A spec says "remove the tool belt"; the design has to say what happens to Mission Ops' belt panel, the wrist cuff's weight lamps, the server's weight rule and the tests that check it. Arguing about that in a 150-line design doc is fast. Finding it in a 1,500-line diff is not.

Once a feature is in a design doc, it is the contract. Later changes respect it, and a change that breaks it changes the design doc first.

## 1. Spec (`docs/specs/<feature>.md`)

Plain language, written for a player and a designer, not a programmer. Short.

- **Want:** what should happen, as the player sees it. One bullet per behaviour.
- **Not wanted:** what to remove or never do.
- **Done when:** how we will know, in terms of what can be seen or played.
- **Supersedes:** sections of older specs (`SPEC-v2.md`, `SPEC-1960s-pass.md`) this one replaces, by heading.

No file names, no function names. If it needs a number ("a tool lands within 30 m"), write the number.

## 2. Design (`docs/design/<feature>.md`)

Claude writes this from the spec and the code as it stands, then stops for review. Every design doc has these sections, in this order:

1. **Reading of the spec.** The spec restated as numbered requirements (`R1`, `R2`, ...). This is where a misreading shows up first.
2. **Decisions.** Every place the spec was silent or ambiguous and a choice was made, with the choice and the reason. Each one is a question the reviewer can overturn: `D3: the generator is set down by letting go of it. Overturn → ...`.
3. **CRC cards.** One per component the feature touches: its **C**lass (the module and the object in it), its **R**esponsibilities (what it knows and does, after the change), and its **C**ollaborators (who it talks to). Mark what is new (`+`) and what goes away (`−`). A component that is not on a card does not change.
4. **State.** The data the feature adds or changes: the server's state, the wire messages (both directions), and what each role's `view()` gets. Write the shapes.
5. **Sequences.** A Mermaid `sequenceDiagram` for each workflow that crosses a component boundary: a grab, a throw, a repair. Show who is authoritative.
6. **UI layouts.** For anything drawn: a sketch in a code block (ASCII is fine) with the palette names from [DESIGN.md](DESIGN.md). Diegetic first: say where in the world, on the cuff or on which console it lives.
7. **Tests.** Which checks cover each `R`: `npm test` cases, `npm run vr` steps, `npm run smoke` steps, and the screenshots to look at.
8. **Amendments made while coding.** Empty at review. Anything the code needed that the sections above did not say, numbered `A1`, `A2`, ..., each naming the card it changes (see "Code" below).
9. **Out of scope.** What this design deliberately leaves alone.

Rules for the design:

- Requirements trace. Every `R` appears on at least one card and in at least one test. Every card responsibility traces to an `R` or a `D`.
- Follow [CLAUDE.md](../CLAUDE.md): models first, the palette, the Quest budget, diegetic UI, juice for every action.
- Name things the code will name. If the design says `Arm_L`, the code says `Arm_L`.
- Small. A design doc that runs past a few hundred lines is two features.

## 3. Code

Generated from the design. In order:

1. Server rules and `client/shared/` first, with their `npm test` cases (the rules are the cheapest to test and everything else depends on them).
2. Then the clients, one card at a time.
3. Then the end-to-end tests (`npm run vr`, `npm run smoke`) and screenshots, and look at them (CLAUDE.md, "Look before you say done").

If the code needs something the design does not say, stop and amend the design doc in the same branch, under **Amendments made while coding**, rather than letting the code drift. The PR shows the design diff and the code diff together, design first.

## Gap analysis

Run this before opening a PR, and any time the three layers might have drifted. Claude can be asked to "run the gap analysis for `<feature>`".

| Check | How |
| --- | --- |
| Spec → design | Every spec bullet maps to at least one `R`. List any that do not. |
| Design → code | Every card responsibility marked `+` exists in the named module; every `−` is gone (`grep` for its names). |
| Code → design | Every file the diff touches is on a card. A touched file with no card is either a missing card or scope creep. |
| Design → tests | Every `R` has a test listed, and the test exists and passes. |
| Old specs | Every section listed under **Supersedes** carries a note pointing to the new spec. |

Write the result as a short table at the bottom of the design doc (`## Gap analysis, <date>`), so the next agent sees what was checked.

## Changing a feature later

A change that is in scope of an existing design doc goes through that doc: edit the spec if what we want changed, edit the design (Decisions, cards, state, sequences), then the code. Review the design diff before the code diff.

## Index

| Feature | Spec | Design | Status |
| --- | --- | --- | --- |
| Hands, throwing and an animated astronaut | [specs/hands-and-avatar.md](specs/hands-and-avatar.md) | [design/hands-and-avatar.md](design/hands-and-avatar.md) | Implemented |
