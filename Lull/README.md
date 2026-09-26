# Lull

A floating window of low-stakes blocks, for the minutes between real work. Pieces never fall on their own: move them,
turn them, lower them a row at a time, and set them when you are ready — or walk away mid-piece and come back
tomorrow. Nothing is timed and nothing is lost.

On macOS it is a borderless, resizable panel that floats above other apps (and every Space), with a clear, glass,
tinted or solid background inside a distinct border. ⌥⌘L shows and hides it from anywhere; Esc tucks it away. The
same game runs in any browser from `Game/index.html`.

## Play

**Free Play** — endless, relaxed. Every cleared line is banked as ◆ *lines*, the currency. A full board just ends that
board; the lines stay yours.

**Puzzles** — procedurally generated, infinite, short, in Easy, Medium and Hard. Each has a seed (`M-3K7Q2XA`): the
same seed is the same puzzle for everyone, so it can be shared, replayed or retried (R) as often as you like; Undo is
free. Every puzzle is built backwards from a solution — rows are filled solid, pieces are lifted out only where they
could have been flown in and set, and the result is played forward on the real rules before it is kept — so every seed
is solvable, and Hard ones need tucks and spins. Goals: clear the board, clear N lines over bedrock, or clear the gems.
Solving pays lines (more on the first try, double for the Daily). Wildcards:

| Wildcard | |
|---|---|
| Big Minos | every piece is 2×2 per block, moving one cell at a time |
| Odd Shapes | trominoes and all twelve pentominoes |
| Wraparound | the side walls are portals |
| Rigid | no turning; each piece arrives already facing its way |
| Heavy | no lowering, hard drops only |
| Inverted Controls | left is right and turns are reversed |
| Upside Down / Sideways | the board turns 180° / 90°; the arrows follow the screen |
| Fog | only blocks near your piece are visible |
| Vanishing | pieces turn invisible once set |
| Blind Queue | no preview |
| No Hold, Monochrome | as named |

**Factory** — the idle part: a mino assembly line that runs while you work (and while Lull is closed, up to the
warehouse's limit). Presses stamp polyominoes onto a belt; shipped minos earn credits. Some come out *defective* —
a cell too many or too few, a piece broken off or held by a corner, cracked, scorched. Maintenance is clicking them
off the belt before they ship (the Plant tab has a spec sheet of every legal shape); inspectors do it for you,
imperfectly. Product lines climb from monominoes to decominoes (4,655 legal shapes); contracts pay credits, lines and
items; retooling trades a plant for patents that make the next one richer. Progress is tuned in weeks, not minutes.

**Shop** — single-use items for Free Play, priced so they stay a treat: Reroll, Mirror, Pebble, Sand, Rewind, Order
Slip, Drill, Bomb, Phase (passes through blocks into any gap), Settle (closes every hole), Chroma Purge, and Blueprint
(draw your own piece). Cosmetics: palettes (Prism animates), mino skins (Gem, Glass, Neon, Jelly, Pixel …), board
frames, backdrops, line-clear effects and ghost styles; a few are factory rewards.

**Stats** — lines by source and day, clears, T-spins, combos, pieces per minute, inputs per piece, puzzle solves
and first-try rates by difficulty and wildcard, factory quality control, items bought and used, time by mode.

## Keys

| | |
|---|---|
| ← → | move |
| ↓ | lower one row; on the stack, a fresh press sets the piece (holding never does) |
| Space | hard drop |
| ↑ / X, Z, A | turn clockwise, counter-clockwise, 180° |
| C / Shift | hold |
| 1–0, −, = | use an item |
| ⌫ / U, R, N, H | undo, retry, next puzzle, hint |
| ⌘1–⌘5, ⌘, | tabs, settings |
| mouse | hover a column, click to drop, wheel to turn, right-click to hold (optional) |

Repeat delay and rate, preview length, sound, effects, background, theme and accent are in Settings.

## Build and run

```sh
Lull/scripts/make-app.sh      # macOS 14+, Xcode 15+: builds Lull/build/Lull.app
open Lull/build/Lull.app
cd Lull && swift run          # the same, straight from the package

open Lull/Game/index.html     # any browser, any OS (saves to localStorage)

node Lull/scripts/test.cjs            # game logic: 750 puzzles replayed through the engine, items, factory, save
node Lull/scripts/browser-test.cjs    # the page played in headless Chromium (needs Playwright)
```

A packaged build is committed by CI to [`dist/Lull.app.zip`](../dist/). It is ad-hoc signed: right-click ▸ Open the
first time. The save lives in `~/Library/Application Support/Lull/save.json` (Settings ▸ Export copies it).

## Layout

| Path | |
|---|---|
| `Game/` | the game: `index.html`, `css/`, and `js/` — `pieces` (SRS tetrominoes, pentominoes, big and custom shapes, polyomino enumeration), `board`, `engine` (the floating-piece rules and every item), `puzzlegen` (seeds, wildcards, reverse construction, reachability search, forward verification), `factory` (economy, defects, contracts, retooling), `store` (save, catalog, stats), `render` / `factoryview` (canvas: skins, frames, effects, rotated views), `modes`, `ui`, `app` |
| `Sources/Lull/` | the macOS shell: a borderless `NSPanel` (floating, all Spaces, edge-resizable, draggable by the page's title bar) around a transparent `WKWebView`, a blur for the Glass background, the save file, the ⌥⌘L hot key, and a self-test CI runs |
| `scripts/` | `make-app.sh`, `icon.swift`, `test.cjs`, `browser-test.cjs` |
