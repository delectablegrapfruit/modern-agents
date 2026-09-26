# Geometry Wars: Retro Evolved (browser recreation)

An unofficial, from-scratch remake of Bizarre Creations' 2005 twin-stick shooter, targeting the 2007 PC "Evolved"
mode. It runs in any browser with WebGL 2. There is no build step, no dependencies and no assets: every shape is a
glowing line drawn by the game, and every sound and the soundtrack are synthesised with Web Audio. The only external
request is the Orbitron web font; without it the game falls back to a system font.

**Play:** open `index.html`. Double-clicking it works because the scripts are classic, not modules. You can also
serve the folder:

```sh
python3 -m http.server 8000   # from this folder, then visit http://localhost:8000
```

## Controls

These are the defaults. **Help and Options › Controls** lists every binding and lets you change them. It has
presets (Classic, ESDF, Left-handed), per-action key rebinding, the mouse fire mode (hold or automatic) and a
pointer-locked "relative" aim mode with its own sensitivity. Everything there is saved.

| | Mouse + keyboard | Keyboard only | Gamepad | Touch |
|---|---|---|---|---|
| Move | W A S D | W A S D | Left stick | Left thumb |
| Fire | Hold left button (aims at the cursor) | Arrow keys, I J K L or the numpad (7 9 1 3 fire diagonally) | Right stick | Right thumb |
| Bomb | Right, middle or side buttons, Space, E | Space, E | Triggers | BOMB button |
| Pause | Esc, P | Esc, P | Start | II button |

`M` mutes. In menus, use the arrow keys (or W/S), Enter and Esc, or the d-pad, A and B (Back also goes back).

## Presentation

- **Title:** a hollow neon wordmark that sweeps from yellow through red and magenta to blue. The "O" is the
  ship's claw in a ring. The attract-mode demo plays behind it. The menu has **Evolved** (play), **High Scores**,
  **Achievements** and **Help and Options**. Help and Options holds **Controls**, **How to Play** and
  **Options**.
- **Menus:** green text in Orbitron small caps on a dark scrim over the running game, with no boxes. The focused
  item turns bright and gets a claw marker. The pause menu has Resume, Restart, Help and Options, and Quit to
  Title.
- **HUD:** one glowing green. At the top left, "Score xN" (the multiplier always shows) sits over the score. At
  the top centre are the reserve ships (left) and bombs (right), up to nine of each. The newest one blinks when it
  is awarded. At the top right is the dimmed high score. Kills float small yellow point values, and a multiplier
  rise floats "Multiplier xN". There is no timer. On narrow portrait screens the HUD scales to the width, and the
  ship and bomb row moves below the score line.
- **Game over and high scores:** the final score and stats. If the score beats row ten of the table you type a
  name (up to 12 letters, Enter saves). The table ships pre-filled with the enemies' names (Wanderer 50,000 down
  to Tiny Spinner 2,500), so nearly every game earns a place. The newest entry is highlighted.
- **Achievements:** the twelve Xbox Live Arcade ones: Pacifism, Mad Cat Skillz (nine lives), Multitastic (x10),
  Quartermaster (nine bombs), Score 100,000 / 250,000 / 500,000 / 1,000,000, and Survived at the same scores
  without dying. Unlocks show as a pill toast at the bottom centre.
- **Options:** master, music and effects volume; glow; grid detail; resolution; fullscreen. Reset restores the
  seeded high-score table and clears achievements. Scores, achievements, options and controls persist in
  `localStorage`.

## Rules

You start with 3 bombs and 3 spare ships. Each is capped at 9. You get an extra ship every 75,000 points and an
extra bomb every 100,000. The multiplier climbs with kills (x2 at 25 … x10 at 2,000) and resets when you die. Every
10,000 points your gun may change. Bombs and deaths clear the arena without scoring. An awake Gravity Well pulls you
in and bends your bullets away.

Enemy values, the lives and bombs thresholds, and the weapon rule follow the original. The spawn scripts, the
multiplier steps between x2 and x10, the exact weapon patterns, the look of the menus and the seeded scores are
reconstructions.

## Layout

Everything sits at the repository root:

| File | |
|---|---|
| `index.html` | Page, the screens' markup and the SVG logo |
| `style.css` | Title, menus, overlays, high scores, achievements, toasts |
| `controls.css` | The Controls page |
| `js/util.js` | Shared helpers and `GW.store` (localStorage) |
| `js/renderer.js` | WebGL 2 line batcher (soft-edged additive quads), bloom and composite passes |
| `js/grid.js` | Spring-mass background grid and its forces |
| `js/particles.js` | Pooled spark particles (typed arrays) |
| `js/enemies.js` | Every enemy's shape, colour, value and behaviour, plus the ship outline `GW.SHIP` |
| `js/spawner.js` | Difficulty curve and wave patterns |
| `js/game.js` | Player, bullets, collisions, bombs, scoring, camera and the attract-mode autopilot |
| `js/audio.js` | Synthesised effects and the step-sequenced soundtrack |
| `js/input.js` | Keyboard, mouse, gamepad and touch; bindings, pointer lock and the reticle |
| `js/controls-ui.js` | The Controls page: presets, rebinding and aim settings |
| `js/achievements.js` | The achievement list and its checks |
| `js/hud.js` | HUD, popups and crosshair, and the menu enemy icons |
| `js/main.js` | Boot, main loop, screens and menu navigation, game flow, high scores, options |

All scripts share the global `GW` namespace and load in the order listed in `index.html`. The simulation runs at a
fixed 60 steps per second. `GW.debug` in the console exposes the live game, input, renderer and HUD.

Geometry Wars is a trademark of its owners. This is a non-commercial fan project and uses none of the original's
code, art or audio.
