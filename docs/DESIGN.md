# Moonbase art direction: a 1960s space program

Every agent reads this before changing how anything looks. [CLAUDE.md](../CLAUDE.md) has the general rules; this file has the values.

## The idea

The base was built by people who learned their trade on Mercury and Gemini. Nothing in it is a touchscreen. Information comes from **needles on cream dial faces, incandescent jewel lamps, Nixie tubes, a green phosphor scope and engraved labels**. Surfaces are painted steel, crinkled foil, Bakelite and canvas webbing, a little scuffed. Light is warm and slightly dim indoors and harsh but not white-hot outdoors.

We are lowering visual fidelity on purpose. A flat-shaded, well-coloured, well-lit console reads better in a headset and in a demo than a busy, glossy, high-contrast one. When in doubt, fewer colours, softer contrast, more texture.

**Do:** muted, slightly warm colours; a cream instrument face with a dark needle; a lamp that is visibly *off* (a dark jewel) and visibly *on* (warm glow); Nixie orange digits; olive, oxide red and amber as the status trio; a little grain and wear.

**Don't:** neon green (`#58e08a`), hot red (`#ff5c5c`, `#ff2a2a`), electric blue (`#6fb6ff`), pure `#000` backgrounds, pure `#fff` text or glows, gradients as decoration, glows with big blur radii, rounded SaaS cards, Inter, Roboto or system UI fonts.

## Models first

We have real NASA models: an Apollo Lunar Module, a Viking lander, a tall comms dish, a pressure helmet, EVA tools, a crew lock bag, a suit, a Mission Control room, and real flight-deck panel photos. Use them wherever they fit, in preference to hand-built shapes; [ASSETS.md](ASSETS.md) assigns each one a place. A model is not finished when it loads: its materials get the treatment in "3D materials" below (period palette, rough paint, warm foil, no bright modern plastics or logos), so a 2010s NASA model sits in the same 1960s world as a hand-built console.

## Palette

Use these names in code. CSS gets them as custom properties in `client/style.css`; canvas and three.js code get them from one shared module (the restyle spec adds `client/shared/palette.js`). Hex values are sRGB.

### Surfaces

| Name | Hex | Use |
| --- | --- | --- |
| `bakelite` | `#1d1c19` | Page background, the deepest shadow on a screen. Replaces `#000` / `#05080a` / `#07090c`. |
| `console` | `#3f4a47` | Console face and panel fill (the grey-green of a 1960s control room). |
| `console-deep` | `#2b3230` | Recessed panels, canvas backgrounds behind instruments, the scope surround. |
| `bezel` | `#8b887d` | Brushed aluminium bezels, frames, dividers. |
| `rule` | `#55605b` | Hairlines, grid lines, unlit outlines. Replaces `--line #243240`. |
| `dial` | `#e3d9bf` | Instrument faces, paper, placards. The only near-white surface. |
| `enamel` | `#d8d2c2` | Painted habitat walls and exterior white paint (warm, not `#f5f2ec`). |
| `foil-gold` | `#b8913f` | Kapton / gold foil insulation. |
| `regolith` | `#a8a397` | Ground tint (already close, keep it warm grey). |

### Ink and text

| Name | Hex | Use |
| --- | --- | --- |
| `ink` | `#d6ccb4` | Body text and labels on dark consoles. Replaces `--ink #d6e6e0`. |
| `ink-dim` | `#8f8a78` | Secondary labels, units. Replaces `--dim #7d909c`. |
| `ink-dial` | `#24221e` | Text, ticks and the needle on a cream dial face. |

### Lamps and indicators (the status colours)

Each lamp has an **off** value (a dark jewel you can still see) and an **on** value. Draw "on" with `toneMapped: false` in three.js or a small, tight glow (blur at most 6 px) on canvas. Never blink faster than 2 Hz.

| Name | Off | On | Meaning |
| --- | --- | --- | --- |
| `lamp-green` | `#2c3a22` | `#8fb05a` | Normal, go, connected, fixed. Replaces `#58e08a` / `#2bd45a` / `#45c463`. |
| `lamp-amber` | `#4a3514` | `#e0a347` | Caution, attention, selected, your seat. Replaces `#ffb84a` / `#ffb030`. |
| `lamp-red` | `#3d1a14` | `#c4523a` | Fault, alarm, danger. Replaces `#ff5c5c` / `#ff2a2a` / `#ff3b30`. |
| `lamp-white` | `#3a3830` | `#f1e2bd` | Incandescent white: work lights, the "on" of a neutral lamp. Replaces `#ffffff` / `#ffffee`. |
| `lamp-blue` | `#1f2a33` | `#7a99b0` | Radio receive and the astronaut marker only. Replaces `#6fb6ff` / `#4da3ff`. |
| `nixie` | `#3a1d10` | `#ff8a3d` | Nixie digits: clocks, counters, oxygen number, countdown. The one saturated colour allowed, and only on digits. |
| `phosphor` | `#1c2a1c` | `#9cc27a` | The radar scope trace and the rover-cam overlay (P1 green phosphor, soft). |

### Wiring colours (gameplay: must stay distinguishable)

The puzzle needs four cable colours that are told apart at a glance; the socket shapes back them up for colour-blind players. Desaturate, do not merge.

| Cable | Hex (was) |
| --- | --- |
| red | `#b0443a` (`#e0453a`) |
| blue | `#40698f` (`#3f7fe8`) |
| yellow | `#d0a93c` (`#f0cf3a`) |
| green | `#5e8a46` (`#45c463`) |

Check them side by side in the wiring diagram and on the cable plugs in the headset after changing them.

## Typography

Self-host every font under `client/fonts/` as `.woff2` (the Quest and the venue Wi-Fi may be offline; no Google Fonts link). All three below are under the SIL Open Font License.

| Role | Font | Notes |
| --- | --- | --- |
| Engraved labels, headings, the brand | **Michroma** | The Microgramma look of 1960s hardware. Capitals only, tracked `0.12em` or more, small sizes. |
| Teletype: the terminal, the log, briefings | **Courier Prime** | Typewriter, not a coder's monospace. |
| Digits that count | Nixie style, drawn | Draw on canvas: each digit in a rounded tube cell, the lit numeral in `nixie` with a tight glow, and a faint `nixie`-off "8" behind it for the unlit cathodes. Use Michroma or Courier Prime numerals as the glyph. |

Fallbacks: `"Michroma", "Eurostile", "Arial Narrow", sans-serif` and `"Courier Prime", "Courier New", monospace`. Never `Inter`, `Roboto`, `system-ui`, `-apple-system`, `ui-monospace`, `SF Mono`.

Canvas textures in three.js must wait for the font before they draw: `await document.fonts.load('32px Michroma')`, then draw, then set `texture.needsUpdate = true`.

## Instruments (Mission Control and the wrist cuff)

- **Dial:** a cream `dial` face with a `bezel` ring, black `ink-dial` ticks every 10 %, numbers at the majors, a red-painted arc (`lamp-red` at about 60 % strength, not glowing) over the bad range, a thin dark needle with a small counterweight and a brass hub. The needle eases toward its value (about 0.15 s) and overshoots slightly; it does not jump.
- **Bar meters become edgewise meters or tank gauges:** the battery and oxygen bars in `console.js` become a vertical or horizontal edgewise meter (a cream scale with a needle) or a "fuel gauge" dial, with the number on a Nixie counter beside it.
- **Lamps:** round jewel lamps with a bezel and an engraved label plate below. Off is visible. On is warm. Alarms blink at 1 to 2 Hz.
- **Scope:** the radar is a round CRT: `console-deep` surround, a dark green-black glass, `phosphor` grid and trace, a slow sweep with afterglow. Contacts are phosphor blips; danger contacts are brighter phosphor or `lamp-amber`, not hot red.
- **Static and blackout:** grey-brown noise, not pure white-on-black.

## 3D materials

| Thing | Base colour | Roughness | Metalness | Detail |
| --- | --- | --- | --- | --- |
| Painted steel (habitat, panels) | `enamel`, `console`, `bezel` | 0.75 to 0.85 | 0.05 to 0.2 | Canvas texture: panel lines, rivets, stencilled labels, scuffs |
| Bare aluminium | `#a7a59c` | 0.4 | 0.85 | Brushed bump or roughness streaks |
| Gold foil | `foil-gold` | 0.35 | 1 | Keep the crinkle bump map |
| Bakelite knobs, handles | `bakelite`, `#4a3426` | 0.45 | 0 | None needed, small |
| Canvas, webbing, suit fabric | `enamel`, `#7c7766` | 0.9 | 0 | Weave texture (`arm.js` already has one) |
| Lamp lenses | the lamp's off or on value | n/a | n/a | `MeshBasicMaterial`, `toneMapped: false` when on |

Restyling a loaded model: walk its meshes once after `loadModel`, match each material by name or by its current colour, and set colour, roughness and metalness from this table. Multiply real texture detail toward the palette rather than throwing it away. Do it once per model id, not per clone.

## Light

| Scene | Key | Fill | Notes |
| --- | --- | --- | --- |
| Moon outside (`world.js`) | Sun, slightly warm `#fff0d8`, intensity about 3 | Hemisphere sky `#4a5560`, ground `#2a2620`, about 0.25 | Keep the harsh shadows (that is the Moon). Tone mapping stays ACES; exposure about 0.95. No fog in vacuum: depth comes from the LOLA skyline and the starfield. |
| Habitat inside (`interior.js`) | Ceiling strips as warm incandescent `#ffe2b0` (about 3000 K) | Hemisphere sky `#e8dcc4`, ground `#6e675a` | A faint `FogExp2(0x2a2620, 0.02)` for depth. Backup lighting is a deep oxide red (`#b8402a`), dimmer than now. |
| Work lights and headlamps | `#ffe2b0` | | Spots, not floods. |

## Lobby (the loading screen)

Do not restyle it. The lobby on every page (its scenes, pictures, colours and type) stays as it is; the period look starts once the mission does.
