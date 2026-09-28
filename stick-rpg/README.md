# Stick RPG Complete — browser recreation

A fan recreation of XGen Studios' 2005 Flash game **Stick RPG Complete** (v1.22) in plain
HTML5 canvas and JavaScript: the same city, buildings, prices, jobs, stats, minigames and endings,
running in any modern browser with no plugins, build step or dependencies.

> Unofficial fan project, not affiliated with or endorsed by XGen Studios. All code, art and
> sound here are original, drawn and synthesized in code. Game rules and numbers follow the
> original; dialogue and story text are paraphrased.

## Play

Open `index.html` in a browser (double-clicking the file works; no server needed).

| Key / mouse | Action |
|---|---|
| Arrow keys or WASD | walk (walk into a door to enter a building) |
| Shift (with skateboard) | skate, 2× speed |
| C (with a car) | get in / out of the car |
| I | inventory |
| Esc | stats / options |
| Mouse | menus, street people, HUD buttons |
| Tab / Enter | move the yellow focus box over buttons / press it (hold to repeat), as in Flash |

## What's in it

- The whole city of the 2nd Dimension with the original's map layout, walking limits, door
  positions, traffic, falling off the paper-thin edges, the day/night sky.
- Every building: home (apartment, penthouse, mansion, castle) with sleep, messages, TV, stocks
  and saving; McSticks; the convenience store (and robbing it); pawn shop; furniture store; bank
  with loans and real estate; New Lines Incorporated's job ladder; University of Stick; the bus
  depot's out-of-town commodity deals; Sticky's bar with bar fights and drunken darts; the
  Silver Lining Casino with slots, blackjack and roulette.
- Street people: the smokes kid, Homeless Harold, the dealer, and the car you can hotwire.
- Game lengths of 15, 40, 100 days or unlimited; elections; the end-of-game net worth and rank.
- One save slot (browser localStorage), like the original.

## Faithfulness

Mechanics follow the original's ActionScript: prices, formulas, random ranges, time costs and the
order of checks. The original's quirks are kept (for example, a defaulted bank loan is fatal, and
blackjack hands stop at four cards). The rules were checked state-by-state against the original running in the Ruffle Flash emulator
(hundreds of scripted scenarios and walking replays). A few outright bugs are fixed:

- A timed game always ends once its last day is over (the original could skip past the end
  when days advanced outside of sleeping).
- Roulette pays straight-up numbers at 36×, pays bets on 30 and 36, and 0/00 lose outside bets.

## Development

```
js/core      engine, state, rules, UI widgets, audio
js/world     map geometry, walking rules, map art, sprites
js/scenes    city, building menus, title, intro, results
js/locations buildings and street dialogs
js/minigames fight, darts, slots, blackjack, roulette
tests        Playwright checks: node tests/<name>.cjs
```

See `docs/ARCHITECTURE.md` for the module contract. Tests need Playwright with Chromium.
