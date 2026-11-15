# Moonbase: rules for every agent working in this repo

Read this file, then [docs/DESIGN.md](docs/DESIGN.md) (the art direction and the palette) and [docs/ASSETS.md](docs/ASSETS.md) (the NASA models and photos, and where each one goes) before you touch a scene, a material, a light, a canvas texture, a stylesheet or a lobby SVG. The game design is in [docs/SPEC-v2.md](docs/SPEC-v2.md). The planned restyle is [docs/SPEC-1960s-pass.md](docs/SPEC-1960s-pass.md). The next gameplay pass (physics tools found in the hall, walk-in airlocks on every HDU door, a stencil-portal porthole, Mission Control calling the astronaut GO) is [docs/SPEC-physical-base.md](docs/SPEC-physical-base.md). The pass after that (a 120 m field, two rovers driven by the Technician, the Scientist's survey chart, rock samples to bring home) is [docs/SPEC-sample-run.md](docs/SPEC-sample-run.md). The Mission Control consoles are control-room desks (one fixed screen each on any laptop shape, event lights, icons in place of captions, a simpler desk for the 2-player game): [docs/specs/mission-control-consoles.md](docs/specs/mission-control-consoles.md) and [docs/design/mission-control-consoles.md](docs/design/mission-control-consoles.md).

Light text guidance for every seat (teletype lines on the consoles, label tape on the cuff, name tags on the tools) is specified in [docs/SPEC-guidance.md](docs/SPEC-guidance.md).

The game is a WebXR co-op fix-it game: one astronaut in a Quest, three Mission Control players on laptops. Everything the pages load is committed under `client/` (three.js is vendored in `client/vendor/`), there is no build step, and the Quest is the performance budget.

## The look in one paragraph

Moonbase looks like a 1960s space program, not a 2020s sci-fi game. Grey-green consoles with cream dial faces and black needles. Incandescent jewel lamps that glow warm and dim, never LED-bright. Nixie-tube digits for anything that counts. A green phosphor radar scope. Painted metal, Bakelite knobs, engraved labels, a little wear. A muted period palette: no saturated neon green, no hot red, no electric blue, no pure black or pure white on screen. Lower visual fidelity on purpose: we win on cohesion and character, not on polygon count or shader tricks. The palette, type and lighting values are in [docs/DESIGN.md](docs/DESIGN.md); use those names and values, do not invent new colours.

## 1. Visual and art direction (anti-slop guardrails)

- **Models first.** Before you build or rebuild a prop by hand, check [docs/ASSETS.md](docs/ASSETS.md): there are 28 baked NASA models (the Apollo LM, a comms dish, the helmet, EVA tools, a Mission Control room and more) with a place assigned to each. Load them with `loadModel` from `client/shared/assets.js` and restyle their materials to the palette.
- **No raw primitives as final objects.** A bare `BoxGeometry` or `SphereGeometry` with a flat colour is a placeholder, not a prop. Most of this game is procedural geometry in `client/world.js`, `client/interior.js` and `client/stations.js`, and that is fine: give it a bevel or a chamfer (rounded or extruded shapes, `LatheGeometry`, `ExtrudeGeometry` with `bevelEnabled`), a canvas texture with panel lines, rivets, labels and wear, or replace it with a `.glb`. If you need an addon such as `RoundedBoxGeometry`, add it to the file list in `scripts/vendor-three.mjs` and run `npm run vendor`; do not import from a CDN.
- **A cohesive material palette.** No default plastic (`roughness: 0.5, metalness: 0.5`, or a bare `color` with nothing else). Every `MeshStandardMaterial` sets roughness and metalness on purpose for what it is (painted steel is rough and barely metallic, foil is metallic and crinkled) and carries a bump, roughness or detail map, or is deliberately flat. Colours come from the DESIGN.md palette.
- **Intentional lighting and atmosphere.** No single directional light plus a white ambient. Each scene has a key light and a hemisphere or fill whose colours are chosen, shadow bias tuned to the scene, and depth from the starfield and the LOLA horizon outside, or light haze inside. The Moon has no air, so no fog outdoors; inside the habitat a faint warm `FogExp2` is allowed. Post-processing: none on the Quest. Glow comes from `toneMapped: false` emissive shapes in period colours, never from bloom, and never neon.
- **Grounded placement.** Nothing floats. Props sit on the regolith or a surface, with a contact shadow, a blob shadow (`interior.js` has a `blobTex` for this) or ambient occlusion baked into the texture.

## 2. 3D asset and model standards

- **Scale and orientation:** 1 unit = 1 metre, Y up, and a model's front faces **+Z** (the glTF convention; `Object3D.lookAt` turns an object's +Z toward the target). Cameras look down -Z. New models go through `scripts/bake-assets.mjs`, which sets the scale, the axes and the ground, and `npm run assets` checks them.
- **Draw calls:** the Quest is the budget. Merge static meshes, use `InstancedMesh` for repeats (the habitat's roof strips already do), keep canvas textures to the sizes they are now or smaller, and compress any image textures (KTX2 or WebP, at most 1024 px for props and 2048 px for hero assets).
- **Naming:** every multi-part object gets semantic names (`Root`, `Body`, `Hatch`, `Wheel_FL`, `Lamp_Status`) so grabs, hit tests and animation attach without magic offsets.

## 3. UI and HUD rules

- **Diegetic first.** The astronaut has nothing on the visor: gauges live on the wrist cuff (`client/arm.js`), status lives on lamps, screens and boards in the world. Keep it that way. Mission Control is a console of instruments: dials, lamps, a scope and Nixie counters, not a web dashboard.
- **No generic web or AI styling.** No purple or cyan gradients, no glassmorphism, no rounded SaaS cards, no Inter or Roboto, no system-UI fonts, no emoji, no placeholder copy. Use the period type in DESIGN.md, square or lightly radiused panels with bezels, and short engraved-style labels in capitals.
- **Text is labels, not paragraphs** (from SPEC-v2): players read pictures.

## 4. Gameplay feel and the verification loop

- **Juice:** every player action (grab, weld, brush, patch, plug, pull the cord, enter the hatch) pairs a visual response (a spark, a lamp, a needle kick, a puff of dust, a small camera shake) with a positioned sound from `client/ambience.js` or a new one beside it.
- **Look before you say done.** After changing a scene, a material, a shader, a canvas texture or the UI, look at it:
  - `npm test` for the game rules.
  - `npm run assets` after adding or re-baking a model.
  - `npm run smoke:shots` for the laptop pages, and `npm run vr:shots` for the headset view (both write screenshots; see `test/`). They need Playwright, which is preinstalled in cloud sessions.
  - Open the screenshots and check them against DESIGN.md: palette, contrast, framing, nothing floating, nothing blown out. Update the matching image in `docs/` when the look changes on purpose.
- Say what you checked in the PR. If you could not run a check, say so.

## Working in this repo

- **The loading screen (the lobby) is off limits** for restyling: `client/lobby.js`, `client/lobby/*.svg`, the lobby section of `style.css`, the astronaut page's gate. Keep its look and its graphics.

- `client/assets/`: baked models and photos; `client/shared/assets.js` lists them. Never commit an unbaked `.glb`, an STL, a TIF or a texture over 2048 px.
- `client/`: the pages. `world.js` is the Moon outside, `interior.js` the habitat, `stations.js` tools and repair sites, `arm.js` the astronaut's arms and wrist cuff, `console.js` and `style.css` Mission Control (each seat's desk is drawn by `client/console/`: `desk.js` the frame, `ops.js`, `tech.js`, `sci.js` and `all.js` the seats, `instruments.js` the dials and lamps), `lobby.js` and `client/lobby/*.svg` the lobby scenes.
- `server/` and `worker/`: the same `server/hub.js` runs on a laptop and on Cloudflare. Game rules live in `server/game.js` and `client/shared/`.
- Keep colour values in one place per surface: CSS custom properties in `style.css`, `PAL` in `client/shared/palette.js` for the console canvases, and a shared palette module for three.js once the restyle lands (see the spec). Do not scatter new hex literals.
