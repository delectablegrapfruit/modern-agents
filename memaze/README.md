# Memaze

A maze game in the spirit of the *Scary Maze Game*, where **you supply the cast**: the player, the win and lose screens,
the goal, the background and the music are your own pictures, animated GIFs and videos, transparency included. The
mazes are strangely shaped, generated from seeds, and never run out.

No build step, no dependencies: plain HTML/CSS/JS, plus an optional Python server for folder sync.

## Play

| How | Command | Your media comes from |
|---|---|---|
| **Local server** (recommended) | `python3 serve.py`, or double-click `Memaze.command` (macOS) / `memaze.bat` (Windows) | the `media/<slot>/` folders, watched live; files added in the game are saved there too |
| **Just open it** | open `index.html` in a browser | files dropped into the game (kept in the browser), or a folder linked with **Link a folder** (Chrome/Edge) |
| **Phone on the same Wi-Fi** | `python3 serve.py --host 0.0.0.0` | the computer's `media/` folders |
| **Any static host** | serve this folder as-is | as "Just open it" |

`serve.py` options: `--port 8765`, `--media PATH` (keep media elsewhere), `--read-only`, `--no-open`, `--verbose`.

## How it plays

- **Your media sits still in the middle of the screen, upright and unchanged. You move the maze.** Drag anywhere: the
  maze follows your finger or mouse 1:1 and stops when you stop. WASD/arrows and a gamepad move at a steady speed.
  Settings can invert the drag and change its speed.
- **The paths float over nothing.** Reach **GOAL** and your *win* media plays.
- **Two hearts.** Touching the edge costs one: you stop right at the edge, and for a second the edges hold like walls
  (the same touch never counts twice). Go 3 seconds without another touch and both hearts are back. Two touches in a
  row and your *lose* media plays, then you go back to the last flag you reached, or the start. A bridge vanishing
  under you, or a magic carpet running out over the void, costs a heart and puts you on the nearest floor.
- **The hitbox is your picture.** Every pixel that is at least half opaque counts; transparent parts don't. Animated GIFs,
  APNG/WebP animations and videos are checked frame by frame, and chroma-keyed pixels drop out too. A small buffer
  (3.5% of the picture's size) lets an edge graze the void without losing.
- **Close-up camera.** Your picture fills about a quarter of the screen's shorter side, so you see only the corridor
  around you. The map in the corner starts black and shows only what has been on screen: corridors, the goal, gems,
  flags and boxes appear once you've seen them. Pinch, the wheel, +/- or the Zoom setting change the camera.
- **Stars**: one for finishing, one for beating par, one for collecting every gem (gems hide in dead ends). Stars unlock
  background patterns.
- **Vanishing bridges** appear from level 8: they blink, disappear for a moment, then come back. Island shapes are
  joined by narrow bridges.
- **Flags** stand on the main route of long mazes (up to 3). Touch one and a loss sends you back to it with the clock,
  gems and bridges carrying on. Running out of time, or Restart, starts the maze over.
- **Ghost**: your fastest clear of each Journey, Daily or Seed maze replays as a see-through copy of your picture on
  the same clock, with an arrow at the screen edge when it's off screen (Settings: *Ghost of best run*).
- **Edges** setting: *Hurt* (default) or *Walls* (the edge stops you and you slide along it; only a bridge vanishing
  under you costs a heart).

### Mystery boxes

Colour-cycling **?** boxes sit on junctions and dead ends (about one per 1500 units of corridor; in Endless up to one
per chunk). Touch one with an empty item slot and it spins for an item; the box is back 10 seconds later. Use the item
with **Space**, **E**, the slot button (bottom left) or gamepad **A**/**X**. Settings: *Mystery boxes* turns them off.

| Item | What it does |
|---|---|
| **Invincible** | 8 s without damage; the edges hold like walls. Your picture glows. |
| **Extra hit** | Used at once: a gold heart on top of your two (up to two of them). Gold hearts go first and don't grow back. |
| **Bullet** | Carries you along the corridors toward GOAL (Endless: outward) for about 1800 units, over vanishing bridges and all, finishing on a junction short of GOAL. Invincible while flying. |
| **Launch** | Up in the air for about 5 s: the camera pulls far out and you steer anywhere, over the void and everything, dragging (or keys) at the zoomed-out scale. A target marks where you'll come down: the middle of the nearest solid corridor. The map fills in with everything the screen showed. No damage from take-off to landing. |
| **Magic carpet** | 6 s of floating over the void. It flickers when it's about to run out: be over floor by then, or it costs a heart. |
| **Shrink** | Half size (picture and hitbox) for 10 s; you grow back as soon as there's room. |

### Modes

| Mode | What |
|---|---|
| **Journey** | Levels 1, 2, 3 and on forever. Each level is generated from its number, so level 12 is the same maze for everyone. Difficulty ramps up to about level 35. |
| **Daily** | One maze per day, the same for everyone; best time kept. |
| **Gauntlet** | Back-to-back random mazes that get harder, 3 lives (one more every 5 clears). |
| **Endless** | One unbounded maze streamed in chunks around you, narrower and meaner the farther you get. Gems add 3 seconds, beacons are checkpoints that add 12 seconds, 3 lives. |
| **Seed** | Type any seed, choose layout, shape, size, path width, difficulty and vanishing bridges. **Copy link** shares it (`index.html#seed=...`). |

### Mazes

A maze is a spanning tree (growing-tree algorithm, optionally braided) carved from a lattice cut to a shape, then turned
into floating corridors with wobble and varying width. Five layouts (Grid, Shards (triangulated), Honeycomb, Rings
(polar) and Wilds (Poisson-disk, organic)) times fifteen shapes (Block, Disc, Diamond, Cross, Heart, Donut, Star,
Serpent, Figure Eight, Crescent, Hourglass, Blob, Swiss Cheese, Archipelago (islands joined by narrow bridges), Spiral).
Start and goal sit at the ends of a long route; par and the time limit come from the route's length, width, turns and
vanishing bridges.

## Make it yours

Open **Media** in the game, or put files in the folders:

```
media/player/       you: shown in the middle of the screen
media/background/   shown behind the maze
media/win/          plays when you reach the goal
media/lose/         plays when you touch the edge or run out of time
media/goal/         sits on the goal
media/music/        loops while you play (several files = shuffled playlist)
```

- **Formats**: PNG, JPG, GIF, APNG, WebP, AVIF, SVG, BMP; MP4, WebM, MOV, OGV; MP3, OGG, OPUS, WAV, M4A, AAC, FLAC.
- **Transparency**: PNG/GIF/APNG/WebP/AVIF/SVG alpha works everywhere; video alpha needs WebM (VP8/VP9 with alpha) in
  Chrome/Edge/Firefox or HEVC-with-alpha MOV in Safari. For ordinary green-screen videos turn on **Chroma key** for that
  slot (colour, tolerance, softness).
- Every slot can be **Random**: a different file each level (player, goal, background) or each time it plays (win, lose).
- Drag and drop works anywhere in the menus, including whole folders: sub-folders named `player`, `win`, `lose` and so
  on go to those slots.
- Options: player size (0.6-1.25: how big your picture is against the maze, so also its hitbox), goal size; for win and lose, picture time, video limit, size, fit, entrance animation, video
  sound and a preview.
- The built-in placeholders live in `assets/defaults/`. Your `media/` files are git-ignored.

### Background

RGB by default, fully adjustable: style (gradient, colour cycle, radial, aurora), speed, saturation, brightness, spread,
angle, rotation, pulse, a hue range or your own 2 to 6 colour palette, plus presets. Eleven more patterns unlock as you
play (Candy Stripes, Checkerboard, Polka, Waves, Warp, Tunnel, Synthwave, Plasma, Kaleido, Code Rain, Hypno), all
tinted by your RGB settings. Or use your own picture or video (fill, whole, stretch, or tile for pictures; dim, blur; transparent
media shows the RGB behind it). Maze floors: Flat, Neon (edges follow the RGB), Glass (see-through), Retro.

## Keys

| | |
|---|---|
| WASD / arrows | move |
| Space / E | use item |
| Esc / P | pause, back |
| R | restart |
| M | map on / off |
| F | full screen |
| + / - (or wheel, pinch) | zoom |
| Enter | next level on the results screen |
| Gamepad | left stick or d-pad moves, A or X uses the item, Start pauses, A continues, B backs out |

## Files

```
index.html  css/style.css
js/util.js        seeded RNG, maths, storage, DOM helpers
js/config.js      defaults, unlocks, save data
js/gen.js         maze generation (lattices, shapes, carving, vanishing bridges, endless chunks), flags, box spots
js/world.js       corridor geometry in a spatial hash; "how deep inside the floor is this point"
js/render.js      maze floor, start and goal markers, flags, gems, beacons, mystery boxes, item effects, minimap
js/background.js  RGB engine and patterns
js/media.js       media library: defaults, server folders, linked folders, imports; chroma key
js/sprite.js      the player picture: GIF decoding, frame-by-frame painting, the pixel hitbox
js/defaults-data.js  built-in player pictures as data URLs (generated by scripts/embed-defaults.mjs)
js/audio.js       synthesized sound effects, music playlist, built-in synth loop
js/input.js       drag, pinch and wheel zoom, keys, gamepad
js/game.js        modes, movement, hearts, mystery boxes and items, checkpoints, level flow, win/lose media
js/ghosts.js      records runs; replays the best clear of each maze as a ghost
js/ui.js          menus, customisation screens, HUD (hearts, item slot, effect timers)
serve.py          local server + media API (Python 3.8+, stdlib only)
assets/           logo, favicon, default player/win/lose/goal art
scripts/make-pixel-gif.mjs   regenerates the default pixel GIF (own GIF encoder)
scripts/embed-defaults.mjs   regenerates js/defaults-data.js after changing a built-in player picture
tests/            generator and sprite tests; autopilot; items
```

## Tests

```sh
node tests/gen.test.js       # 200 mazes: deterministic, connected, corridors never touch, sane timings; endless seams
node tests/sprite.test.js    # GIF decoder, pixel hitbox mask, embedded defaults up to date
node tests/autopilot.js 1-30 # drags through levels with the real game code, not one touch of the edge allowed (needs Playwright + Chromium)
node tests/items.js          # hearts, boxes, every item, flags, Endless items (needs Playwright + Chromium)
```

Save data (settings, stars, best times) is in `localStorage`; the Save data section in Settings exports and imports it
as JSON.
