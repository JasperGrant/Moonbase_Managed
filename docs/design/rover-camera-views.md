# Design: first-person and third-person rover cameras

Spec: [../specs/rover-camera-views.md](../specs/rover-camera-views.md). Process: [../WORKFLOW.md](../WORKFLOW.md).

## 1. Reading of the spec

| | Requirement |
| --- | --- |
| R1 | Each rover camera has two views: first person (as now) and third person (chase). |
| R2 | The Scout's and the Hauler's views are independent. |
| R3 | C toggles the Scout, / toggles the Hauler; a click on a camera's half toggles that one. |
| R4 | A toggle glides (about 0.5 s) between the two poses. |
| R5 | The chase camera trails the rover's heading with lag; the wheel changes its distance. |
| R6 | Each screen shows its view and its key. |
| R7 | The choice survives a reload (browser storage, optional). |
| R8 | Nothing about the game or the server changes. |

## 2. Decisions

| | Decision | Why | Overturn → |
| --- | --- | --- | --- |
| D1 | **Keys C and /**, not V or Tab. | C sits under the left hand on W A S D; / sits under the right hand beside the arrows. Neither is a driving key, and neither is Space (Mission Ops' talk key in the 2-player seat). | Other `KeyX` codes in `VIEW_KEYS`. |
| D2 | **Per-rover state lives in `rovercam.js`**, in the page only. The server never hears of it. | It changes nothing about the game (R8). | — |
| D3 | The chase camera follows the rover's **smoothed yaw** (`g.userData.yaw`, which `moveRover` already eases) with a second, slower lag, and ignores the rover's slope tilt. | The view swings behind a turn like a real chase cam and does not rock with every bump. | Follow the tilt too. |
| D4 | The glide **blends the two poses** (position lerp, rotation slerp) rather than moving a camera child of the rover. So both cameras are free objects in the scene, posed each frame. | One mechanism for both views, and a smooth transition either way. | Cut with no glide. |
| D5 | The chase camera is kept **0.8 m above the ground** under it, and never nearer the rover than 2.5 m. | It cannot dive under the regolith or into the rover when the wheel is turned all the way in. | — |
| D6 | The choice is stored under `moonbase.camviews` in `localStorage`, read and written in try/catch. | Per-viewer convenience only. | Do not store. |

## 3. CRC cards

**`client/rovercam.js` · startRoverCam**
- R: `+ view state` per camera: `{ mode, blend (0 first, 1 third), dist, yaw, pos }`.
- R: `+ pose each camera every frame`: first-person pose from a mount on the rover (`Cam_FP_<id>`), third-person pose from the chase maths, blended by `blend` (smoothstep).
- R: `− the cameras as children of the rovers`.
- R: returns `{ world, toggle(id), view(id), setView(id, mode), zoom(id, delta) }`.
- C: console.js (keys, clicks, HUD), world.js (`rovers`, `ground`).

**`client/console.js` · Technician**
- R: `+ VIEW_KEYS` (C, /) and the click and wheel handlers on `#cam`, each choosing the camera half under the pointer.
- R: `drawCamHud` shows `1ST PERSON` or `3RD PERSON` and the key beside each rover's name.
- R: the Technician brief gains a line on the keys.
- C: rovercam.js.

**`client/style.css`**: `#cam` shows a pointer cursor (clickable).

## 4. State

Client only. No wire messages, no server state, no view changes.

```js
views = { scout: { mode: 'first' | 'third', blend: 0..1, dist: 6, yaw, pos }, hauler: { ... } }
localStorage 'moonbase.camviews' = '{"scout":"third","hauler":"first"}'
```

## 5. Sequence

```mermaid
sequenceDiagram
  participant T as Technician
  participant C as console.js
  participant R as rovercam.js
  T->>C: keydown C (or click left screen)
  C->>R: toggle('scout')
  R->>R: mode = third; blend eases 0 to 1
  loop every frame
    R->>R: pose = blend(first-person mount, chase behind the rover)
  end
  C->>R: view('scout') for the HUD plate
```

## 6. UI layout

Under each screen's compass tape, bottom centre of that screen's half:

```
  SCOUT                  3RD PERSON  [C]                 WHEEL
```

Phosphor green on the camera glass, as the name and the tape are. The cuff-style plate is the same engraved capitals as the name.

## 7. Tests

| R | Check |
| --- | --- |
| R1–R5 | `npm run camviews` (test/camviews.mjs, new): fed a scripted state in Chromium, toggling one camera moves only that camera; the third-person camera ends behind and above its rover, looking at it; it stays above the ground; it follows a turn; the wheel changes its distance. |
| R6 | `npm run camviews:shots`: first and third person for both rovers; look at them. |

## 8. Out of scope

- Free orbiting with the mouse, and a third view for the astronaut's page.
- Anything on the Scientist's chart.
