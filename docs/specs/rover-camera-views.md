# Spec: first-person and third-person rover cameras

## Want

- The Technician can switch each rover's camera between **first person** (from the rover, as now) and **third person** (a chase view from behind and above, with the rover in shot).
- The two cameras switch **independently**: the Scout can be in third person while the Hauler stays in first.
- The switch is one key per camera, under the hand that already drives that rover: **C** for the Scout (W A S D), **/** for the Hauler (arrows). Clicking a camera's screen does the same.
- The change is a smooth glide between the two views, not a cut.
- The third-person camera follows the rover's heading with a little lag, so a turn swings the view round behind it. The mouse wheel over a camera moves it nearer or further.
- Each screen says which view it is in and which key changes it.
- The choice is remembered on that laptop between missions.

## Not wanted

- Any change to driving, the radar-free game rules or what the server knows. This is the Technician's own view.
- Camera controls that fight the driving keys (no extra keys on W A S D or the arrows).

## Done when

- Pressing C or / (or clicking a screen) glides that camera between the two views, and the other camera does not move.
- In third person the rover and the ground round it are in view while driving and turning, and the camera never goes under the ground.
