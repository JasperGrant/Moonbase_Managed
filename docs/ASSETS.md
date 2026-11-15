# Assets: the NASA models and photos

Read this before you build or replace a prop. **Use a model from this list before you build geometry by hand.** Sevan's direction is to use 3D models as much as possible and restyle them to the 1960s Apollo-era look in [DESIGN.md](DESIGN.md). The list below says where each asset goes, and phase 5 of [SPEC-1960s-pass.md](SPEC-1960s-pass.md) is the work list.

## What is in the repo

| Path | What |
| --- | --- |
| `client/assets/models/*.glb` | 28 models, baked for the Quest (see "How they were baked"). [assets-sheet.jpg](assets-sheet.jpg) shows all of them. |
| `client/assets/textures/*.webp` | 3 flight-deck panel photos and 1 lunar orbital photo |
| `client/shared/assets.js` | The manifest (`MODELS`, `TEXTURES`, with size and triangle count), `loadModel(THREE, id)`, `restyle` / `loadPeriod` (a model restyled to the palette) and `loadGlove` |
| `scripts/render-mc-room.mjs` | Renders the Mission Control room model to `client/assets/textures/mission-control-room.webp` |
| `scripts/bake-assets.mjs` | Rebuilds every model from the original uploads (`npm run bake -- <folder>`) |
| `test/assets.mjs` | `npm run assets`: loads every model in Chromium and checks size, ground and naming. `npm run assets:shots` also writes a picture of each one to `test/shots/assets/`. |
| `client/vendor/three/examples/jsm/loaders/GLTFLoader.js`, `libs/meshopt_decoder.module.js`, `utils/BufferGeometryUtils.js` | The loader, vendored like the rest of three.js (`scripts/vendor-three.mjs`) |

The originals (including two 27 MB TIFs and the Draco GLBs) are not committed. They are in the project's shared files; bake from there if you need to change a model.

## Rules for every model

- **Units and axes:** 1 unit = 1 metre, Y up, **front faces +Z** (the glTF convention; `Object3D.lookAt` points an object's +Z at the target). Standing props have their base at y = 0 and are centred on x and z, so `position.set(x, height(x, z), z)` puts them on the ground. Hand tools and small parts are centred on their middle so they turn about it in the hand.
- **One `Root` node** per file. Its children keep the source's part names, and every material keeps its source name (for example `console_nameplat`, `Keyboards`), so you can restyle by name.
- **Load through `loadModel`**, which caches one copy per page and hands back a clone. The clones share materials: clone a material before recolouring one instance. For many copies of one small prop, build an `InstancedMesh` from the clone's geometry.
- **Restyle on load, to the palette:** `loadPeriod(THREE, id, { rough, metal, sat, by, cast, receive })` loads and restyles in one call (`by` overrides single materials by name). The source materials are NASA's, not ours. After loading, set each `MeshStandardMaterial` to the DESIGN.md material table: roughness and metalness for what it is, colour from the palette. Kill anything that reads as modern (bright logos on modern craft, pure-white plastics, saturated blues). Keep textures that carry real detail (LM foil, the habitat's panels, the crew lock bag) and multiply their colour toward the palette instead of replacing them.
- **Shadows:** `castShadow` on anything larger than about 0.5 m outdoors, `receiveShadow` on big ones. Small interior clutter casts no shadow. Put a blob shadow under anything small that stands on a floor.
- **Budget:** the whole set is about 138k triangles and 4.4 MB. The Quest has room for a few of the big ones at once, not all at full detail. Hide or swap the outdoor scenery models when the astronaut is inside the habitat, as the terrain already is.
- **Check it:** `npm run assets` after any bake, `npm run vr:shots` after placing a model, and look at the pictures.

## What is placed (this branch)

Placed: the `hab-module` (the Habitat Demonstration Unit) as the habitat itself, with our own open airlock vestibule on its door and a porthole that shows the live hall, the glove (cuff arm, both controllers, a spare on the bench), the pistol-grip tool as the welder, the Apollo LM, the comms dish, the dish base and turntable on the habitat mast, the rover-camera astronaut, the Viking lander, the spectrograph crate and support cradle at the depot, the helmet, the crew lock bag and the ACES suit in the habitat, the wrench, ratchet, hammer and grease gun on a shadow board along the top of the tool rack, and the Mission Control room still behind the consoles.

Taken out again at Sevan's request: the flight-deck panel photos on the habitat walls and the switchboard (they looked bad). Do not put them back on interior panels.

Not yet: `ladee-probe`, `grace-satellite`, `tether`, the printed ISS tools, `sample-canister`, `cable-clip`, and the lunar photo prints.

## Where each model goes

Sizes are the baked box, width (x) × height (y) × depth (z), in metres. "Replaces" names the hand-built geometry the model takes over.

### Outside on the Moon (`client/world.js`)

| Model | Size | Tris | Goes | Replaces | Notes |
| --- | --- | --- | --- | --- | --- |
| `apollo-lm` | 8.97 × 7.0 × 8.97 | 29k | The lander on the horizon at (-30, -34), turned 0.6 rad, flag beside it | `world.js` 765-778, the cylinder-and-box lander | The hero landmark. Keep its gold foil and textures; warm the foil toward `foil-gold`. 29k triangles at 45 m: if frame time suffers, simplify further with `npm run bake -- <folder> apollo-lm` after lowering its `ratio`. |
| `comms-dish` | 3.0 × 5.66 × 3.0 | 6.6k | The comms dish at `PLACES.dish` (10, -6) | `world.js` 553-572 | Two parts: `Post` and `Dish`. Aim the `Dish` node at Earth the way the code does now (`lookAt(EARTH_POS)` then tilt). Paint the reflector `enamel`, not white. |
| `dish-base`, `dish-turntable` | 0.6 × 0.39 × 0.59 and 0.61 × 0.73 × 0.59 | 0.6k | Stacked on the habitat roof as the mount for the small mast dish | `world.js` 477-478, the mast under the roof dish | Turntable sits on top of the base (y = 0.39). Rotate the turntable slowly; it reads as a tracking antenna. The base is a plain drum with no texture: give it the habitat panel texture. |
| `hab-module` | 11.9 × 6.81 × 5.2 | 2.3k | Candidate exterior for the habitat at the origin | `world.js` 440-470, the dome and drum | A habitat core about 5 m across with a long side module. The game treats the habitat as a 2.9 m circle (`CFG.habRadius`) with the airlock on +Z and the canopy over it: face the side module away from the work sites (toward -X and the depot), check the canopy and airlock still line up, and leave the shelter rules alone. Bigger change than the others; do it last. |
| `viking-lander` | 3.91 × 2.1 × 2.94 | 12k | An old robotic precursor, parked well clear of the work sites, for example (16, -15) | new | Scenery only: nothing to fix. Weather it: dull the white to `enamel` with dust (`regolith` multiplied in on the lower half). |
| `ladee-probe` | 1.4 × 2.4 × 1.36 | 9.3k | A crashed probe in a small crater out past the drill, for example (-18, 14), tilted about 25° and half sunk | new | Lowest priority. Desaturate the blue solar cells hard (toward `console`), it is the most modern-looking model. |
| `spectrograph-crate` | 0.94 × 0.94 × 2.2 | 0.3k | Cargo at the fuel depot `PLACES.depot` (-9, -5), lying beside the tanks | new | Reads as a sealed instrument crate. |
| `support-cradle` | 1.7 × 1.8 × 0.87 | 1.3k | Fuel depot, a handling cradle beside the tanks | new | Its gold is fine; roughen it (0.7). |
| `grace-satellite` | 1.9 × 1.26 × 3.1 | 4k | Fuel depot, cargo waiting to fly, on the ground or on the cradle | new | Lowest priority; modern. Use only if the depot looks empty. |
| `astronaut` | 1.76 × 1.9 × 0.71 | 6.4k | The astronaut figure the rover camera and Mission Control see | `client/avatar.js` (built by `world.js`) | **Unrigged and in a T-pose**, so `avatar.js` cuts it into rigid limbs by triangle position and hangs each from a joint (shoulders, elbows, hips, knees, ankles): it walks, crouches and reaches at rover-camera distance. The cut faces show if you look closely; do not use it anywhere it is seen close up. |

### Inside the habitat (`client/interior.js`)

| Model | Size | Tris | Goes | Replaces | Notes |
| --- | --- | --- | --- | --- | --- |
| `helmet` | 0.4 × 0.39 × 0.4 | 14k | On the workbench island at (-1.45, 0.96, -4.4) | `interior.js` 211-214, the two spheres | Gold-tinted visor (`foil-gold`, roughness 0.12, metalness 1). The dome is a little faceted after simplification; fine at bench distance. |
| `aces-suit` | 0.82 × 1.85 × 0.51 | 10k | An empty pressure suit standing at the suit station by the airlock, or in the crew-quarters corridor | new | Its orange is already close to period international orange: keep it, roughen it to 0.85. Shuttle-era, so keep it out of the hero view. |
| `crew-lock-bag` | 0.5 × 0.55 × 0.19 | 0.5k | Hanging on the wall by the airlock inside; a second one at the tool locker outside (`PLACES.locker`) | new | The bag the tools travel in. |
| `sample-canister`, `cable-clip` | small | 3.3k, 2.6k | Bench clutter: canisters in a row, clips holding the hanging cables | the random debris boxes at `interior.js` 218 can shrink | 3D-printed ISS parts. Grey `#8b887d`, rough. |

### The astronaut's hands (`client/arm.js`, `client/stations.js`)

| Model | Size | Tris | Goes | Replaces | Notes |
| --- | --- | --- | --- | --- | --- |
| `glove` | 0.3 × 0.16 × 0.17 | 0.8k | **The astronaut's hand**: on the end of the arm that carries the wrist gauges, and on each controller | `arm.js` 112-137 (the `glove` group of spheres and capsules) and the box gloves in `stations.js` 211-220 | Scaled to a suited hand (0.24 m wrist to fingertip), its cuff just past the wrist disconnect ring. Load it with `loadGlove(THREE, { mirror })` from `client/shared/assets.js`, which restyles it, turns it into the arm's axes (fingers +x, back of the hand +z) and centres the cuff opening on the origin; `mirror: true` makes the right hand from the left. The tracked-hand joints (`astronaut.js` 379) stay: the model cannot bend its fingers. Also one spare glove on the habitat bench. |

### Tools (`client/stations.js` and the bench)

| Model | Size | Tris | Goes | Replaces | Notes |
| --- | --- | --- | --- | --- | --- |
| `pistol-grip-tool` | 0.066 × 0.302 × 0.391 | 1k | **The welder**: the tool the astronaut holds to the crack | `stations.js` 73-80 (the welder group) | The real EVA power tool, so it is the best fit. The bit runs along Z: put the spark (`stations.js` 77) on the bit's tip, set `RACK_SCALE.welder` back to 1 because the model is life-size, and check the grab in `npm run vr`. |
| `wrench`, `ratchet`, `hammer`, `grease-gun` | 0.25, 0.3, 0.36, 0.4 long | 0.7k-3k | Hung on the locker rack as a shadow board, each over a painted outline | new | Scenery: they are not in `TOOLS`, so nothing picks them up. Do not add them to the rules. |
| `maintenance-tool`, `printed-wrench`, `crowfoot`, `socket` | 0.03-0.11 | 1.5k-4.4k | On the habitat workbench, in a tray | new | 3D-printed ISS tools. |
| `tether` | 0.12 × 0.12 × 0.6 | 3k | One hanging from each rack hook (there is no belt: docs/design/hands-and-avatar.md) | new | Small detail that sells EVA. Sag it with a slight rotation; do not simulate it. |

The game's own tools (brush, patch kit, space tire, backup generator) have no model in this set. Keep them hand-built, bevelled and textured as CLAUDE.md asks.

### Mission Control (laptop pages)

| Model | Size | Tris | Goes | Notes |
| --- | --- | --- | --- | --- |
| `mission-control-room` | 14.5 × 5.89 × 24.6 | 11k | A faint backdrop behind the Mission Control consoles (never in the lobby) | The room (a cutaway: rows of consoles, the wall screens, the ceiling). The bake already painted its 45 materials in the palette (the source had them all black). The laptop pages are 2D canvases, so render it to a picture rather than running a WebGL scene beside four consoles: add a small script that loads it with `loadModel`, frames the console rows from the back of the room, and saves a 1600 px WebP to `client/assets/textures/mission-control-room.webp`. Use that picture, very faint, behind the console grid (`#run`). The lobby keeps its own pictures. |

## Where each photo goes

| Texture | What it shows | Goes | Notes |
| --- | --- | --- | --- |
| `flight-deck-panel-a.webp` | A circuit-breaker panel: rows of breakers with yellow and red collars | Unassigned (it was the face of the switchboard, which has been removed from the game) | Real Shuttle hardware that looks the part. Multiply by `#e8dcc4` to warm it. Do not paint the game's sockets, plugs or lamp into it: those stay 3D so they can light up and be grabbed. |
| `flight-deck-panel-c.webp` | Breaker panel "R14" | Unassigned (it was the wall surround of the switchboard, which has been removed from the game) | Same treatment. Interior materials are Lambert on purpose (the hall has its own three lights); a `map` works on Lambert too. |
| `flight-deck-panel-b.webp` | Toggle switches over four rows of breakers | Non-interactive wall panels in the habitat, next to the life-support and habitat-power displays (`interior.js` 282-297) | Decoration that says "control room". Two or three crops at most; do not tile it. |
| `lunar-far-side.webp` | An orbital photo of cratered terrain with hard shadows | A "site survey" print pinned on the habitat wall; a mounted print on the Technician's console (a cream `dial` card with the photo inset) | **Not a ground texture**: its shadows are baked in and its scale is kilometres. The terrain keeps its LOLA heightmap. |

## Not used

- **Tether.zip** (`Tether.fbx`): the same model as `Tether.glb`.
- **Wrench.stl**: the same file as `wrench.stl` in the ISS tools zip; baked once as `printed-wrench`.
- **ISS tools zip, test coupons**: `Column`, `Compression`, `Flexural`, `FTC`, `First Part`, `Range`, `Tensile`, `ZeroG1`, `ZeroG2`, `Cubesat` (a clip). They are print-test samples, not props.
- **The TIFs**: the WebPs are made from them; the 27 MB originals stay out of the repo.

## How they were baked

`scripts/bake-assets.mjs`, one table entry per model, run on the original uploads:

1. Read the GLB (decode Draco) or the STL (millimetres, Z-up, rotated to Y-up). Three uploads (`Base Station`, `Tall Dish dish`, `Tall Dish turntable`) point at texture files that were not uploaded; those textures are dropped. Glass-like `KHR_materials_transmission` is stripped (it made the ACES suit render black).
2. Scale to the real-world size in the table (for example the LM to 7 m tall, the pistol-grip tool from inches), centre it, and bake every transform into the vertices so `Root` is the identity.
3. Weld, simplify with meshoptimizer to the table's `ratio` (the LM from 98k to 29k triangles, the Viking lander from 100k to 12k, the ACES suit from 89k to 10k, the helmet from 65k to 14k), recompute normals where the source had none.
4. Textures to WebP, at most 1024 px for hero models and 512 px for props.
5. Compress with `EXT_meshopt_compression` (decoded by the vendored `meshopt_decoder.module.js`; no Draco decoder or WASM files to ship).

To change a model, change its row in `scripts/bake-assets.mjs`, re-run it on the originals, update the size in `client/shared/assets.js` if it moved, and run `npm run assets`.
