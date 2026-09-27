# Memaze

A maze game in the spirit of *Super Monkey Ball* and the *Scary Maze Game*, where **you supply the cast**: the player,
the win and lose animations, the goal, the background and the music are your own pictures, animated GIFs and videos —
transparency included. The mazes are strangely shaped, generated from seeds, and never run out.

No build step, no dependencies: plain HTML/CSS/JS, plus an optional Python server for folder sync.

## Play

| How | Command | Your media comes from |
|---|---|---|
| **Local server** (recommended) | `python3 serve.py` — or double-click `Memaze.command` (macOS) / `memaze.bat` (Windows) | the `media/<slot>/` folders, watched live; files added in-game are saved there too |
| **Just open it** | open `index.html` in a browser | files dropped into the game (kept in the browser), or a folder linked with **Link a folder…** (Chrome/Edge) |
| **Phone on the same Wi-Fi** | `python3 serve.py --host 0.0.0.0` | the computer's `media/` folders |
| **Any static host** | serve this folder as-is | as "Just open it" |

`serve.py` options: `--port 8765`, `--media PATH` (keep media elsewhere), `--read-only`, `--no-open`, `--verbose`.

## How it plays

- **You stay in the middle; the world moves.** Drag anywhere.
  - **Tilt** (default): the drag is a joystick that tilts the board — it visibly leans in 3D — and the ball rolls with momentum.
  - **Grab**: the maze sticks to your finger 1:1 and keeps sliding when you flick it (Scary-Maze precision).
  - WASD/arrows, a gamepad's left stick, and a phone's tilt sensor (Settings) work in either mode.
- **Paths float over nothing.** Roll off and your *lose* animation plays, then you're back at the start. Reach the **GOAL** for
  your *win* animation.
- **Stars**: ★ finish · ★ beat par · ★ collect every ◆ gem (they hide in dead ends). Stars unlock background patterns.
- **Hazards** arrive level by level: ice (slippery), boost pads, vanishing bridges (they flicker before they go), mud.
- **Edges** setting: *Walls* (bounce, never fall), *Fall off* (default), *Strict* (half the ball over the edge is a fall).

### Modes

| Mode | What |
|---|---|
| **Journey** | Levels 1, 2, 3… forever. Each level is generated from its number, so level 12 is the same maze for everyone. Difficulty ramps to level ~35. |
| **Daily** | One maze per day, same for everyone; best time kept. |
| **Gauntlet** | Back-to-back random mazes that get harder, 3 lives (+1 every 5 clears). |
| **Endless** | One unbounded maze streamed in chunks around you; narrower and meaner the farther you get. Gems (+3 s), beacons (checkpoint, +12 s), 3 lives. |
| **Seed** | Type any seed, choose layout, shape, size, width, hazards. **Copy link** shares it (`index.html#seed=…`). |

### Mazes

A maze is a spanning tree (growing-tree algorithm, optionally braided) carved from a lattice cut to a shape, then turned
into floating corridors with wobble and varying width. Five layouts — Grid, Shards (triangulated), Honeycomb, Rings
(polar) and Wilds (Poisson-disk, organic) — times fifteen shapes — Block, Disc, Diamond, Cross, Heart, Donut, Star,
Serpent, Figure Eight, Crescent, Hourglass, Blob, Swiss Cheese, Archipelago (islands joined by narrow bridges), Spiral.
Start and goal sit at the ends of a long route; par and the time limit come from the route's length, turns and hazards.

## Make it yours

Open **Media** in the game, or put files in the folders:

```
media/player/       what you roll around
media/background/   shown behind the maze
media/win/          plays when you reach the goal
media/lose/         plays when you fall or run out of time
media/goal/         sits on the goal pad
media/music/        loops while you play (several files = shuffled playlist)
```

- **Formats**: PNG, JPG, GIF, APNG, WebP, AVIF, SVG, BMP · MP4, WebM, MOV, OGV · MP3, OGG, OPUS, WAV, M4A, AAC, FLAC.
- **Transparency**: PNG/GIF/APNG/WebP/AVIF/SVG alpha works everywhere; video alpha needs WebM (VP8/VP9 with alpha) in
  Chrome/Edge/Firefox or HEVC-with-alpha MOV in Safari. For ordinary green-screen videos turn on **Green screen (chroma
  key)** for that slot (colour, tolerance, softness).
- Every slot can be **Random** — a different file each level / each win / each fall.
- Drag and drop works anywhere in the menus, including whole folders: sub-folders named `player`, `win`, `lose`… go to
  those slots.
- Player options: size, motion (roll / lean / face travel direction / upright), mirror when moving left. Win/lose
  options: duration for pictures, cut-off for videos, size, fit, entrance animation, video sound.
- The built-in placeholders live in `assets/defaults/`. Your `media/` files are git-ignored.

### Background

RGB by default, fully adjustable: style (gradient, colour cycle, radial, aurora), speed, saturation, brightness, spread,
angle, rotation, pulse, a hue range — or your own 2–6 colour palette — plus presets. Twelve patterns unlock as you play
(Candy Stripes, Checkerboard, Polka, Waves, Warp, Tunnel, Synthwave, Plasma, Kaleido, Code Rain, Hypno) and all are
tinted by your RGB settings. Or use your own picture/video (fill, fit, stretch or tile, dim, blur; transparent media
shows the RGB behind it). Maze floors: Classic, Neon (rims follow the RGB), Glass (see-through), Retro.

## Keys

| | |
|---|---|
| WASD / arrows | roll |
| Esc / P | pause · back |
| R | restart |
| M | minimap: explored / full / off |
| F | full screen |
| + / − (or wheel, pinch) | zoom |
| Enter | next level on the results screen |
| Gamepad | stick rolls · Start pauses · A continues · B backs out |

## Files

```
index.html  css/style.css
js/util.js        seeded RNG, maths, storage, DOM helpers
js/config.js      defaults, unlocks, save data
js/gen.js         maze generation (lattices, shapes, carving, hazards, endless chunks)
js/world.js       corridor geometry in a spatial hash; "how deep inside the floor is this point"
js/render.js      maze floor, pickups, particles, minimap
js/background.js  RGB engine and patterns
js/media.js       media library: defaults, server folders, linked folders, imports; chroma key
js/audio.js       synthesized sound effects, music playlist, built-in synth loop
js/input.js       drag (tilt/grab), pinch, keys, gamepad, tilt sensor
js/game.js        modes, physics, level flow, win/lose media
js/ui.js          menus, customisation screens, HUD
serve.py          local server + media API (Python 3.8+, stdlib only)
assets/           logo, favicon, default player/win/lose/goal art
scripts/make-pixel-gif.mjs   regenerates the default pixel GIF (own GIF encoder)
tests/            generator tests; autopilot
```

## Tests

```sh
node tests/gen.test.js       # 200 mazes: deterministic, connected, corridors never touch, sane timings; endless seams
node tests/autopilot.js 1-30 # plays levels with the real physics (needs Playwright + Chromium)
```

Save data (settings, stars, bests) is in `localStorage`; Settings ▸ Save data exports and imports it as JSON.
