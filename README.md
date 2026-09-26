# Geometry Wars: Retro Evolved — browser recreation

An unofficial, from-scratch remake of Bizarre Creations' 2005 twin-stick shooter that runs in any browser with
WebGL 2. No build step, no dependencies, no assets: every shape is a glowing line drawn by the game, and every sound
and the soundtrack are synthesised with Web Audio.

**Play:** open `index.html` (double-clicking it works — the scripts are classic, not modules), or serve the folder:

```sh
python3 -m http.server 8000   # from this folder, then visit http://localhost:8000
```

## Controls

| | Mouse + keyboard | Keyboard only | Gamepad | Touch |
|---|---|---|---|---|
| Move | W A S D | W A S D | Left stick / d-pad | Left thumb |
| Fire | Hold left button (aims at cursor) | Arrow keys (or I J K L) | Right stick | Right thumb |
| Bomb | Right button / Space / E | Space / E / Shift | Bumpers or triggers | BOMB button |
| Pause | Esc / P | Esc / P | Start / Back | II button |

`M` mutes. Options can switch the mouse to automatic fire.

## What's in it

- **The arena**: a spring-mass grid that ripples under bullets, heaves under explosions, bulges when you die and is
  sucked into Gravity Wells; bloom rendered in two blur octaves over an HDR target.
- **All ten enemies**: Wanderer (25), Grunt (50), Weaver (100, dodges bullets), Spinner (100, splits into three
  Mini Spinners worth 50), Snake (150, only the head is vulnerable; the tail blocks bullets), Gravity Well (150 plus
  the value of everything it swallows; dormant until shot, pulls in you, enemies, bullets and sparks, bursts into
  Protons when overfed), Proton (50), Repulsor (150, shield deflects frontal shots) and Mayfly (10, swarms).
- **Rules**: 3 ships and 3 bombs; extra ship every 75,000 points, extra bomb every 100,000. The multiplier climbs
  with kills (x2 at 25 … x10 at 2,000) and resets when you die. At 10,000 points the gun upgrades, alternating
  between Rapid Fire and Spread Fire every 10 seconds. Bombs and deaths clear the arena without scoring.
- **Waves**: a trickle of singles plus set pieces — corner rushes, rings closing on you, walls of enemies, Snake
  packs, Gravity Well clusters, Repulsor squads and Mayfly swarms — ramping with time alive.
- **Front end**: attract-mode demo behind the title, pause, game over with top-ten high-score entry, twelve
  achievements, how-to-play with the enemy guide, options (volumes, glow, grid detail, resolution, mouse fire).
  Scores, achievements and options persist in `localStorage`.

Enemy values, lives/bomb thresholds and the 10,000-point weapon upgrade follow the original. Exact spawn scripts,
multiplier steps between x2 and x10, weapon patterns and the achievement list are reconstructions.

## Code

| File | |
|---|---|
| `js/renderer.js` | WebGL 2 line batcher (soft-edged quads, additive) + bloom and composite passes |
| `js/grid.js` | Spring-mass background grid and its forces |
| `js/particles.js` | Pooled spark particles (typed arrays) |
| `js/enemies.js` | Every enemy's shape, colour, value and behaviour |
| `js/spawner.js` | Difficulty curve and wave patterns |
| `js/game.js` | Player, bullets, collisions, bombs, scoring, camera, attract-mode autopilot |
| `js/audio.js` | Synthesised effects and the step-sequenced soundtrack |
| `js/input.js` | Keyboard, mouse, gamepad and touch twin-sticks |
| `js/hud.js`, `js/main.js`, `js/achievements.js` | HUD, menus, main loop, achievements |

The simulation runs at a fixed 60 steps per second; `GW.debug` in the console exposes the live game.

Geometry Wars is a trademark of its owners; this is a non-commercial fan project and uses none of the original's
code, art or audio.
