# Spec: the 1960s visual pass

Status: being carried out on this branch. Audited against `main` at `d42b548`, re-checked after merging `db05bea` (the cuff on your own arm, the admin console).

## Goal

Take out the high-contrast modern palette (neon green, hot red, electric blue on pure black, pure-white glows) everywhere it appears and put the 1960s space-program look from [DESIGN.md](DESIGN.md) in its place: a muted, warm period palette, cream dials with needles, incandescent jewel lamps, Nixie digits, a phosphor scope, period type.

This is a **restyle**, not a redesign. Every piece of information a player gets today must still be there after the pass, in the same place, and still readable at a glance: an alarm must still be the loudest thing on the screen, the four cable colours must still be told apart, the wrist cuff must still read in the headset. Gameplay, networking and rules do not change.

## Ground rules for whoever does the pass

1. **One palette source per surface.** Add `client/shared/palette.js` exporting the DESIGN.md palette as both CSS hex strings and three.js integers (`PAL.lampGreen.on`, `PAL.lampGreen.onHex`, and so on). `console.js`, `arm.js`, `astronaut.js`, `stations.js`, `world.js`, `interior.js` and `lobby.js` import from it. `style.css` mirrors it as custom properties. After the pass, `grep -nE "0x[0-9a-fA-F]{6}|#[0-9a-fA-F]{3,6}\b" client/*.js` should show colours only in `palette.js` and in texture-noise math.
2. **Status meaning stays the same, only the colours change:** green = normal, amber = caution or "you", red = fault, blue = radio receive and the astronaut marker. Use the DESIGN.md lamp names.
3. **Contrast check.** Status text and needles must still pass WCAG AA (4.5:1) against what they sit on. The palette is muted, not low-contrast: get the contrast from light-on-dark *values*, not from saturation.
4. **Look at it.** Run `npm run smoke:shots` and `npm run vr:shots` before and after each phase, put the before and after shots side by side in the PR, and refresh the images in `docs/` that changed.
5. **Fonts are local.** Add `client/fonts/` with Michroma and Courier Prime `.woff2` files and their OFL licence, `@font-face` them in `style.css`, and preload them before any canvas draws text.

## Phases

Do them in this order; each one is a mergeable PR on its own.

1. **Palette module, fonts, and Mission Control CSS** (laptop pages, quickest visible win).
2. **Mission Control instruments** (`console.js` canvases: dials, battery, oxygen, radar, wiring, blackout).
3. **The astronaut's world** (`world.js`, `interior.js`, `stations.js`, `astronaut.js`, `arm.js`): materials, lamps, lights, in-world screens.
4. **Lobby: not touched.** The loading screen keeps its look and its graphics (see phase 4).
5. **NASA models and photos** (`client/assets/`, placed per [ASSETS.md](ASSETS.md)). Can run in parallel with phases 1 and 2, since it touches the 3D files; do it before or together with phase 3 so phase 3 restyles models rather than hand-built shapes that are about to go.

Still out of scope: bevelling the hand-built shapes that no model replaces (the brush, patch kit, tire, generator, the terrain props), and the "game juice" audit.

---

## Phase 1: palette module, fonts, Mission Control CSS

### `client/style.css`

| Line | Now | Replace with |
| --- | --- | --- |
| 1 | `:root { --bg:#07090c; --panel:#0e1319; --line:#243240; --ink:#d6e6e0; --dim:#7d909c; --green:#58e08a; --amber:#ffb84a; --red:#ff5c5c; --blue:#6fb6ff; }` | `--bg: bakelite #1d1c19; --panel: console #3f4a47; --panel-deep: #2b3230; --bezel: #8b887d; --line: rule #55605b; --ink: #d6ccb4; --dim: #8f8a78; --dial: #e3d9bf; --green: #8fb05a; --amber: #e0a347; --red: #c4523a; --blue: #7a99b0; --nixie: #ff8a3d; --phosphor: #9cc27a`, plus `-off` values for each lamp |
| 3 | body font `ui-monospace, "SF Mono", Menlo, Consolas` | `"Courier Prime", "Courier New", monospace` for body; headings and `.brand`, `h1`-`h3`, `.tabs button`, `.stat label`, `.lb-top h2` use `"Michroma", "Eurostile", sans-serif`, capitals, tracked |
| 4 | `button { background:var(--green) }`: a neon-green filled button | A panel push-button: `--panel` face, `2px solid var(--bezel)`, `--ink` label in Michroma, a small lamp (`::before`) that is `--green-off` and turns `--green` when the action is live; `:active` presses in 1 px. Radius 2 px at most. |
| 11, 15, 32 | `.landing h1`, `.seats a b`, `.brand` in `--green` | `--ink` in Michroma. Green is a status, not a brand colour. |
| 22 | `.seats a i` taken tag in `--red` | `--amber` engraved tag, or a red jewel lamp next to the seat name |
| 24, 27 | `#taken` overlay `rgba(4,6,8,.96)` and red title, green link button | `--bg` at .94; title `--red` but in Michroma at normal weight; the link is the panel button above |
| 38-39 | `.bar` on `#000`, fill `--green`, low `--red` (header O2) | Replace with a small edgewise meter (cream `--dial` strip, a dark needle) and a Nixie number; or keep a bar but fill `--green` on `--panel-deep` with tick marks |
| 41 | `#crew i.on` neon-green chip with black text | A row of jewel lamps, one per seat, `--green-off` to `--green`, with the seat name engraved below in `--dim` |
| 42 | `#radioBtn` amber fill | Panel button with an amber lamp |
| 45 | `#toast` coloured text | Keep, using the new values. Better: an annunciator strip (a row of labelled tiles that light), see Phase 2 |
| 51 | `.panel` radius 6 px on `#0e1319` | `--panel` face, `1px solid var(--bezel)` outer, `inset 0 0 0 3px var(--panel-deep)` for a bevelled bezel, 2 px radius, four small screw heads optional (`radial-gradient` in the corners) |
| 52 | `.panel > h3` in `--amber` | Engraved label plate: `--dim` text in Michroma on a slightly lighter strip, no colour |
| 57-63 | `.alarm` left border amber/red, meter on `#000` | Annunciator tile: off `--amber-off`, on `--amber` (hot: `--red`) face with `--bg` text. Meter on `--panel-deep` |
| 65-67 | `#ptt` grey, `.tx` red fill with white text, `.rx` blue fill with black text | A big push-to-talk key: `--panel` face, a TRANSMIT lamp (`--red` when keyed) and a RECEIVE lamp (`--blue` when receiving) above it. No full-button colour floods. |
| 68-71 | `#term` and its input: `#000` background, `--green` text | A teleprinter: `--dial` paper with `--ink-dial` Courier Prime text, or a phosphor terminal on `--panel-deep` with `--phosphor` text. Pick one; the paper version is more 1960s. |
| 73-74 | `#map`, `#cam` on `#000` | `--panel-deep` surround; the scope glass itself is drawn by `console.js` |
| 85 | `.pick.sel` `#10201a` with green border | `--panel-deep` with an amber lamp in the corner |
| 92, 96 | `.verdict.won/.lost`, `.log` colours | New palette values, verdict in Michroma |
| 172-173 | `.tabs button.on` | A rotary-selector feel: off tabs `--panel-deep`, on tab `--panel` with an amber lamp, label in Michroma |
| 174 | `canvas.pic` background `#05080a` | `--panel-deep` |
| 176 | `#static` on `#000` | `--bg` |

### `client/astronaut.html` (inline style, lines 9-17)

- Line 13: `#gateActions details` colour `#c8d2d8` becomes `var(--ink)`.
- Line 15: `#vrSlot button` forced `background:var(--green) !important; color:#000` becomes the panel button from Phase 1.
- Line 16: `#cross` crosshair `#fff` becomes `--lamp-white` on at 0.6 opacity.

### `client/index.html`, `client/console.html`

Only pull in the new fonts (`<link rel="preload" as="font" ...>` for the two `.woff2` files). No inline colours to change.

---

## Phase 2: Mission Control instruments (`client/console.js`)

Line 21: `const C = { bg: '#05080a', line: '#243240', ink: '#d6e6e0', dim: '#7d909c', green: '#58e08a', amber: '#ffb84a', red: '#ff5c5c', blue: '#6fb6ff' }` and line 22 `CABLE` become imports from `client/shared/palette.js`.

| Where | Now | Replace with |
| --- | --- | --- |
| `label()` line 171 | `bold ... ui-monospace` | Michroma for labels, Courier Prime for values, and a new `nixie(g, text, x, y, size)` helper for numbers (DESIGN.md "Digits that count") |
| `dial()` lines 174-189 | Dark arc on dark ground, red zone `#5a1f1f`, neon green or hot red needle, white hub | A real gauge: `dial` cream face in a `bezel` ring, `ink-dial` ticks and numerals, the bad range painted as a muted `lamp-red` arc on the face, a thin dark needle with an eased, slightly overshooting motion, a brass hub (`foil-gold`). The value goes on a small Nixie counter under the dial. Out of range: a red jewel lamp next to the dial lights, the needle stays dark. |
| `drawKit()` lines 191-225 | Neon-green belt boxes, `rgba(88,224,138,0.12)` fill, amber weight pips | Belt slots as recessed bays on `console-deep` with a green jewel lamp per filled slot; tool icons in `ink`; weight pips as small amber lamps (off/on). The `3 / 4` count on Nixie digits; full is an amber lamp, not amber text. |
| `noise()` line 229 | White-on-black noise | Noise in warm grey (`#8f8a78` range) on `bakelite`, slightly less dense |
| `drawMap()` lines 232-286 | Black ground, blue-grey grid `#16222b`, `#2c4150` ring, `#3a4a2a` canopy, white hab, neon green marks, amber rover, blue astronaut, hot-red meteor ring and dots, red count | A round phosphor scope: square `console-deep` surround with a bezel, circular dark green-black glass (`#101810`), `phosphor` grid at low alpha, a slow sweep line with a fading afterglow, all base features as `phosphor` outlines (hab a circle, canopy a hatched rectangle, sites as small squares), the rover as an amber blip, the astronaut as a `lamp-blue` blip. Meteors: brighter phosphor blips and the shrinking ring in `lamp-amber`; the seconds-to-impact on a Nixie counter beside the scope (not inside it), with a red jewel lamp that blinks at 2 Hz. Falling: the scope flares (raise phosphor alpha), the bezel lamp stays red; no red border flood. `NO RADAR`: the scope goes to warm-grey static with an engraved `NO SIGNAL` plate. |
| `drawPower()` lines 288-317 | Big battery bar, neon green / amber / blinking hot red fill, `#05130a` text | A battery "fuel gauge": a dial (same `dial()`), or an edgewise meter, plus the percentage on Nixie digits; a LOW BATT red jewel lamp under 30 %. SOLAR IN and BOARD OUT keep their dials with the new style; the arrow between them in `rule`. |
| `drawPower()` wiring diagram lines 307-316 | Saturated cable colours on dark | Draw on a cream `dial` card (a printed schematic), cables in the desaturated wiring colours from DESIGN.md with a thin `ink-dial` outline so they hold up on cream, socket shapes in `ink-dial`. |
| `drawAir()` lines 319-345 | Neon-green oxygen bar, hot-red when low, blinking red LEAK disc with white hiss lines | Oxygen as a dial or edgewise meter with Nixie digits; DRAIN as a dial; LEAK as a large red jewel lamp in a bezel (off `#3d1a14`, on `#c4523a`, 1.5 Hz blink) with the hiss icon engraved in `ink-dim` on the label plate below |
| blackout lines 348-356 | White noise with a red battery outline | Warm-grey static, the dead battery drawn in `ink-dim` with a red jewel lamp |
| `blinkOn()` line 169 | 300 ms (about 1.7 Hz) | Fine; keep under 2 Hz everywhere |
| Header toast | Coloured text strip | Optional: an annunciator panel of labelled tiles (POWER, AIR, HULL, ROVER, METEOR, COMMS) that light amber or red. Only if it does not hide information the current toast shows. |

---

## Phase 3: the astronaut's world

Add the palette import to each file. Lamps that switch state (board lamp, rover beacon, backup strips, socket ring) switch between the lamp's **off** and **on** values from DESIGN.md.

### `client/world.js`

| Line | Now | Replace with |
| --- | --- | --- |
| 73 | `scene.background = 0x000000` | Keep near-black but not pure: `0x050505`. The starfield and skyline give the depth. |
| 77 | Sun `0xfff3e2`, 3.4 | `0xfff0d8`, about 3.0; check that shadow sides still read in `vr:shots` |
| 88 | Hemisphere `0x8fa6d6` / `0x1a1916`, 0.22 | `0x4a5560` / `0x2a2620`, 0.25 (less blue earthshine) |
| 191 | Sun sprite gradient to pure white | Start the gradient at `#fff4dc`, not `#fff` |
| 198-199, 450 | Habitat white `0xf5f2ec` / `0xeeebe4`, roughness 0.5 / 0.6, metalness 0.15 / 0.1 | `enamel` `0xd8d2c2`, roughness 0.8, metalness 0.1. Roughness 0.5 is the plastic default the rules ban. |
| 200-201 | Gold and silver foil | Gold to `foil-gold` `0xb8913f`; silver `0xd8d8dc` to `0xb9b6ad`. Keep the bump maps. |
| 204 | Steel `0x9aa0a8` | `0xa7a59c` (warmer aluminium) |
| 206 | Visor `0xf0b63a` mirror gold | `0xc89a3e`, roughness 0.12 |
| 207 | Orange `0xd9662b` | Period "international orange" `0xb85a2c`, roughness 0.75 |
| 208-209, 821-822 | Habitat glow `0xffc46b` / `0xffbf6a`, backup `0x3a0c06` / `0x5a1008` | Incandescent `0xe8b872`; backup `0x3d1a14` / `0x5a2418` |
| 468 | Flood light `0xffd9a8`, 25 | `0xffe2b0`, keep intensity, check for blow-out |
| 593 | `CABLE_HEX` red `0xe0453a`, blue `0x3f7fe8`, yellow `0xf0cf3a`, green `0x45c463` | DESIGN.md wiring colours (`0xb0443a`, `0x40698f`, `0xd0a93c`, `0x5e8a46`). Must match `console.js` and `client/shared/rules.js`. |
| 600-604 | Switchboard box `0x6a7078` Lambert; socket plate `#12161b` with `#f4f4f0` shapes | Board in `console` with a painted canvas face; plate `console-deep` with `dial`-coloured shapes. Use `MeshStandardMaterial`, roughness 0.8, not Lambert. |
| 627, 842 | Board status lamp neon `0x2bd45a`, fault blink `0xff2a2a` / `0x4a0b0b`, dark `0x0c2a14` | Jewel lamp: `lamp-green` on/off, fault `lamp-red` on/off |
| 659-662 | Generator caution plate `#e8c93a`, black stripes `#15171a` | Hazard stripes `#c9a23a` and `#2b2a26` |
| 698 | Dust puff white | `0xcfc8b8` |
| 709 | Meteor streak `0xfff1d0` | Keep (it is already warm), just lower the size if it reads as a flash |
| 730, 798 | Rover and avatar display strips neon `0x58e08a` | `phosphor` on `0x9cc27a`, or replace with a small round amber lamp |
| 742 | Rover warn lamp `0xff2a2a` | `lamp-red` on |
| 750, 860 | Rover beacon `0xffb030` / `0x4a3008` | `lamp-amber` on / off |
| 755, 758 | Rover headlights `0xffffee`, spot `0xfff6e8` | `lamp-white` on `0xf1e2bd`, spot `0xffe2b0` |
| 784 | Flag canvas `#e8ecf4` / `#1f3f8f` | Faded: `#ddd6c4` and `#2f4a7a` |
| 868 | Weld beads cooled `0xffa23a`, hot ramp to bright orange | Cooled bead `0x7a6a58` (cold metal); hot ramp up to `nixie` `0xff8a3d`, not brighter |

### `client/interior.js`

| Line | Now | Replace with |
| --- | --- | --- |
| 53-95 | Wall and floor canvas textures in cool greys (`#a9adb0` to `#3f4449`) | Shift to warm greys: walls toward `enamel` `#d8d2c2` / `#b9b3a3`, kick band `console` `#3f4a47`, floor `#8d8a80`. Keep the panel lines, rivets, scuffs and labels. Labels in Michroma (wait for the font). The caution strip `#b08a1f` is fine. |
| 152 | Palette `W 0xdfe1e2, G 0x9ea3a7, D 0x41464c, K 0x1b1e22, O 0xc9662b, Y 0xd0a11c, R 0xa8372c` | `W` `enamel` `0xd8d2c2`, `G` `bezel` `0x8b887d`, `D` `console` `0x3f4a47`, `K` `console-deep` `0x2b3230`, `O` `0xb85a2c`, `Y` `0xc9a23a`, `R` `0xa8402f` |
| 188 | Window glow `0xffc98a` | `0xe8b872` |
| 189, 259 | Small red indicators `0xff3b30` | `lamp-red` on |
| 207 | Terminal screen neon `0x58e08a` | `phosphor` `0x9cc27a`, or a dim green CRT `0x5f7f4a` with a scanline canvas |
| 209, 240, 342 | Amber indicator and beacon `0xffb030` / `0x3a2606` | `lamp-amber` on / off |
| 213 | Helmet visor `0x23272b` Lambert | `MeshStandardMaterial` `0x2b2a26`, roughness 0.2, metalness 0.6 |
| 225 | Wall screen electric blue `0x6fb6ff` | A CRT in `phosphor`, or a cream `dial` placard if it is not meant to be a screen |
| 252 | Green indicator `0x58e08a` | `lamp-green` on |
| 282-297 | In-world status screens: `#041008` background, text in `#58e08a`, `#ffb84a`, `#ff5c5c`, `#7d909c` | Turn each into an instrument panel: an engraved label plate (Michroma, `ink-dim` on `console`) above a row of jewel lamps (`MAIN BUS` lamp green/red, `BACKUP` lamp amber) and Nixie digits for `O2 21%`. If a screen stays a screen, it is a phosphor CRT: `#101810` glass, `phosphor` text. |
| 317-325 | Hemisphere `0xffffff` / `0xffffff`; directional `0xf4f7ff`; backup point `0xff3018`; `SKY 0xf1f5ff`, `GROUND 0x9a9da2`; backup sky `0xff2a14`, ground `0x5a0c06`; strip on `(1, 0.98, 0.93)`, off `0x15171a`; red strips on `(1, 0.13, 0.06)` | Warm incandescent: `SKY 0xe8dcc4`, `GROUND 0x6e675a`, directional `0xffe2b0`; strip on `0xffe8c4`, off `0x2b2a26`. Backup: point `0xb8402a`, `RSKY 0x8a2e1e`, `RGROUND 0x3a140c`, strips on `0xc4523a`. Lower `BACKUP_FILL` and `BACKUP_POINT` until the dark room is moody, not a red flood. Add `scene.fog = new THREE.FogExp2(0x2a2620, 0.02)` while inside, removed on exit. |

### `client/stations.js`

| Line | Now | Replace with |
| --- | --- | --- |
| 55 | `orange 0xe8742a`, `steel 0x9aa0a8`, `dark 0x23272c` | `0xb85a2c`, `0xa7a59c`, `0x2b2a26` |
| 67-68 | Patch-kit cross `0xffffff` | `dial` `0xe3d9bf` |
| 77 | Welder spark `0xfff2c0` | `nixie`-to-white: `0xffc98a` |
| 95, 98 | Generator `0xd8a62c`, pull ring `0xd23a2a` | `0xc9a23a`, `0xa8402f` |
| 104 | Ghost tool outline on the rack `0x58e08a` | `ink-dim` `0x8f8a78` (a painted silhouette on the rack, the 1960s shadow-board look) |
| 181 | Suit-leak spot `0xff2a2a` | `lamp-red` on `0xc4523a`, pulsing at 1.5 Hz |
| 192-194 | Belt icon: dark disc, `#ffb84a` ring and icon | `console-deep` disc, `bezel` ring, icon in `ink`; amber only when it needs attention |
| 205, 431 | Grab ring neon green `0x58e08a`, can't-fit `0xff3b3b` | `lamp-green` on / `lamp-red` on, opacity 0.7 |
| 226 | Generator cord `0xd23a2a` | `0xa8402f` |
| 230, 368 | Socket ring `0xffffff`, full `0xff3b3b` | `lamp-white` on / `lamp-red` on |

### `client/astronaut.js`

| Line | Now | Replace with |
| --- | --- | --- |
| 33-34 | ACES, exposure 1.05 | ACES, exposure about 0.95 (check outside and inside) |
| 66 | Helmet lamp `0xfff4e4` | `0xffe2b0` |
| 79-81 | AIRLOCK sign: `#041008`, neon `#58e08a` border and title, `#d6e6e0` text | An enamel placard: `console` plate, `dial` lettering in Michroma, with a small amber jewel lamp |
| 155-162 | READY board: `#05080a`, `#58e08a` or `#ffb84a` frame and title, `#d6e6e0` and `#7d909c` text | A console board: `console` face with a bezel, one big jewel lamp per crew seat (`lamp-amber` waiting, `lamp-green` ready), labels in Michroma, the countdown on Nixie digits |
| 273 | Teleport ring `0x58e08a` | `lamp-amber` on at 0.7 opacity (green is reserved for "fixed") |
| 299 | Glove joints `0xe9e7e1` | `enamel` |
| 324 | Controller ray `0x58e08a` | `ink-dim` at 0.6 opacity |

### `client/arm.js` (the wrist cuff)

| Line | Now | Replace with |
| --- | --- | --- |
| 17 | `GREEN #58e08a, RED #ff5c5c, AMBER #ffb347, BLUE #6fb6ff, DIM #3a4750, INK #e8f0f2` | Palette imports: lamp on values, `ink-dim`, `ink` |
| 40-50 | Suit weave, red stripe `#b3271f`, anodised `0xa5231c` | Stripe `#9a3428`, anodised `0x8e3426`. Fabric and metals are fine. |
| 142-146 | Radio strip `tx 0xff3b3b`, `rx 0x4da3ff`, `nomic 0xffa52e`, `dead 0x7a1010`, idle `0x1a1f24` | Jewel-lamp values: `lamp-red` on, `lamp-blue` on, `lamp-amber` on, `lamp-red` off, idle `console-deep` |
| 160-200 | Cuff gauges on `#141a1f` / `#1b2329`, red zone `#5a1f1f`, `#5d6d76` ticks | Small cream dial faces with dark needles, like the Mission Control dials, because this is what the astronaut reads in the headset. Check legibility in `vr:shots` at arm's length: if cream is too bright inside the visor, use `console` faces with `dial` ticks. |
| 231, 241 | Belt pips: lit `GREEN` on `#1b2329` | Jewel lamps, `lamp-green` on/off |
| 260-278 | Cuff background `#0a0e11`, frame lights up in the radio colour at 9 px | `console-deep`, a `bezel` frame; the radio state is a lamp on the cuff, not a frame flood |

### `client/rovercam.js`

Lines 8-9: same tone-mapping change as `astronaut.js`. Optional: a phosphor-tinted overlay (desaturate to warm monochrome, a few scanlines, vignette) on the canvas in `console.js`, drawn in 2D after the frame, so the rover camera reads as a 1960s TV feed. Keep it cheap: the laptop renders this every frame.

---

## Phase 4: the lobby (not touched)

Sevan's call: **the loading screen stays exactly as it is.** That covers the lobby on every page (`client/lobby.js`, `client/lobby/*.svg`, the lobby section of `style.css`, the astronaut page's gate, the briefing sheet that opens over it) and its pictures. The restyle in phases 1-3 is scoped so none of it reaches the lobby: the old CSS variables stay in `:root` for the lobby, and the new look applies only to the Mission Control header, toast, consoles and results.

--- | --- | --- |
| 98 | `.lobby` background `#000` | `--bg` |
| 109 | `.lb-panel.yours` inset amber 3 px | Keep, with the new amber |
| 110 | `.lb-panel.ready::before` 8 px neon-green bar with `0 0 24px` glow | A row of lamps along the bottom edge, or a 4 px `--green` bar with no glow |
| 114 | `.lb-top h2` `#fff` | `--ink`, Michroma |
| 115, 125 | `#c8d2d8` | `--ink` |
| 120-122 | `.lb-state` chips, ready is neon-green fill with black text | Engraved plate with a jewel lamp: open = lamp off, taken = amber, ready = green |
| 124-125 | `.lb-ready` amber fill, `.on` green fill | Panel button with lamps (Phase 1) |
| 128-129 | Countdown: `#fff` with a `0 0 40px` green glow | Nixie digits: a huge `--nixie` numeral with a tight 6 px glow and a faint unlit `8` behind it |
| 133 | `.lb-bar` `#06090c` | `--panel-deep` |
| 136 | `.lb-links a` `--blue` | `--ink` underlined |

### `client/lobby.js` effects

| Line | Now | Replace with |
| --- | --- | --- |
| 31, 33 | Glint gradient and star twinkle in `#fff` | `#f1e2bd` |
| 42-43 | Ops CRT flicker `#c9ffd9` and `#9dffb8` | `phosphor` `#9cc27a` at the same low opacity |
| 61-63 | Welding arc `#fff` to `#dff0ff` to `#6fb6ff`, screen wash `#cfe6ff` | Arc core `#fff4dc`, falloff `#ffc98a` to `#e0a347`; wash `#ffe2b0`. A 1960s arc photographed on film reads warm. |
| 62 | Haze `#8aa4c0` | `#8f8a78` |
| 158 | Sparks `#fff6c0` / `#ffa53a` | `#ffe2b0` / `#e0a347` |

### `client/lobby/*.svg`

Each scene has a handful of saturated accents that bypass the grayscale-to-colour idea. Replace these, leave the rest of each drawing alone:

- `astronaut.svg`: line 57 and 92 `#ff5c5c` and `#58e08a` lamps become `lamp-red` / `lamp-green` on; line 97 `#ffb84a` stroke becomes `#e0a347`; lines 117-118 `#ffe7b0` is fine.
- `ops.svg`: line 15 `#4dff8c` CRT glow gradient becomes `#9cc27a`; line 40 and 116 `#ffb84a` lamps become `#e0a347`; line 117 `#ff5c5c` lamps become `#c4523a`.
- `sci.svg`: lamp-light ambers (`#ffe7b0`, `#ffd38a`, `#ffb04a`) already fit; check that nothing in it is `#fff`.
- `tech.svg`: the cool blue-greys (`#5d6672`, `#aab4c0`, `#dfe6ee`) shift slightly warm (`#66655e`, `#b3ae9f`, `#e3dccb`) so the four scenes sit in one palette.

---

## Phase 5: NASA models and photos

Everything is baked and committed under `client/assets/`, with the manifest and loader in `client/shared/assets.js` and the placement in [ASSETS.md](ASSETS.md). This phase places them. Each step below is one small PR; do them in this order, because each is worth more than the next.

1. **Load and restyle helper.** In `client/shared/assets.js` or a new `client/shared/restyle.js`, a function that takes a loaded model and a material map (material name or colour to palette entry, roughness, metalness) and applies it once per model id. Turn on `castShadow` / `receiveShadow` per ASSETS.md.
2. **The astronaut glove replaces the hand models.** The cuff arm's hand in `client/arm.js` (the `glove` group built from spheres and capsules, the hand at the end of the arm that carries the wrist gauges) and the box gloves on each controller in `client/stations.js` become the `glove` model, life-size, wrist at the disconnect ring. The tracked-hand joints stay as they are: a static model cannot follow tracked fingers.
3. **The welder becomes the pistol-grip tool** (`stations.js` 73-80): the spark on the bit's tip, belt and rack scale to 1, grab offsets checked in `npm run vr`.
4. **The Apollo LM replaces the horizon lander** (`world.js` 765-778), flag kept.
5. **The comms dish** (`world.js` 553-572) and the **turntable mount** on the habitat roof (`world.js` 477).
6. **The habitat bench:** helmet replaces the two spheres (`interior.js` 211-214), spare glove beside it, crew lock bag on the wall, ACES suit at the suit station, printed tools in a tray, canisters and cable clips.
7. **The breaker-panel photos** on the switchboard face and its wall surround; the toggle-panel photo on the walls by the habitat displays.
8. **The tool rack shadow board** at the locker: wrench, ratchet, hammer, grease gun over painted outlines, with tethers.
9. **Rover-camera astronaut** (`world.js` 791-800): the `astronaut` model replaces the capsules.
10. **Mission Control room** rendered to a still, used faintly behind the Mission Control consoles (not in the lobby).
11. **Scenery:** Viking lander, depot cargo (spectrograph crate, cradle, GRACE), and last the crashed LADEE.
12. **The habitat exterior** (`hab-module`), only if time allows: it changes the silhouette the whole outdoor game is built around, so check the airlock, the canopy and `CFG.habRadius` with the team first.

For each step: `npm run assets`, `npm test`, `npm run vr:shots` (and `smoke:shots` for 10), look at the pictures, and say in the PR what the frame looks like in the headset if anyone tried it.

---

## Done means

- No hex value from the "Don't" list in DESIGN.md left in `client/` outside `client/vendor/` and the lobby (`grep -rnE "58e08a|ff5c5c|6fb6ff|ffb84a|ff2a2a|ff3b3b|ff3b30|4da3ff" client --exclude-dir=vendor --exclude-dir=lobby --exclude=lobby.js` shows only the `:root` variables the lobby keeps).
- All colours come from `client/shared/palette.js` or the CSS custom properties.
- Michroma and Courier Prime load from `client/fonts/` with no network; no `ui-monospace` or system fonts left.
- `npm test`, `npm run smoke` and `npm run vr` still pass.
- The lobby looks exactly as it did before.
- Before and after screenshots of Mission Control, the Moon outside, the habitat (main power and backup) and the wrist cuff are in the PR, and the images in `docs/` are refreshed.
- The phase 5 models are in the scenes they are listed for in ASSETS.md, restyled to the palette, and `npm run assets` passes.
- Someone has looked at it in the Quest: the wrist cuff, the board lamps and the READY board still read at arm's length.
