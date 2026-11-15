# The trailer

The current cut is committed as [docs/moonbase-trailer.mp4](../../docs/moonbase-trailer.mp4). After recording a new
one, copy `trailer/moonbase-trailer.mp4` over it.

A 30-second trailer cut from the game's own code: the Moon, the habitat, the astronaut figure, the rovers,
the real astronaut page in a pretend headset and the real Mission Control desks. Nothing is painted over
afterwards except the captions and the end title, which use the game's type and palette (docs/DESIGN.md).

```bash
npm run trailer
```

That is `record.mjs` (every shot, about 40 minutes on a cloud session's software renderer) and then
`assemble.mjs` (the cut, a couple of minutes). Record one or a few shots again with:

```bash
node scripts/trailer/record.mjs ride,meteor
```

Output, none of it committed:

- `trailer/frames/<shot>/`: every frame of every shot, JPEG, 1920 x 1080
- `trailer/clips/<shot>.mp4`: each shot on its own, 24 fps, no sound
- `trailer/moonbase-trailer.mp4`: the 30-second cut with captions, the end title and the theme

## How the footage is made

Each frame is posed, drawn once and saved, so the footage is smooth however slowly the machine draws.

| Kind | Shots | Source |
| --- | --- | --- |
| Film set | `establish`, `bound`, `dust`, `ride`, `meteor`, `hero` | `film.html` / `film.js`: `buildWorld`, the astronaut figure, both rovers and the tools, from a scripted camera. `server/game.js` supplies what is broken. |
| Headset | `weld`, `brush`, `toss` | The real `/astronaut` page in `test/fakexr.js` (one eye, 16:9, a manual clock, set by `vrrig.js`). The hands are scripted frame by frame; the real game server judges the welds and the sweeps. |
| Desk | `ops`, `tech`, `sci` | The real Mission Control desks on Playwright's clock, with the game hub (`server/hub.js`) in the recorder's process, ticked once per frame. |

The edit (which shot, how long, from where, and each caption) is the `EDIT` table at the top of `assemble.mjs`.
The music is `client/assets/audio/theme.m4a` from 70.2 s, so its full band comes in on the alarm.
