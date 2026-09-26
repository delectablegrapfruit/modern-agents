# Lull

A floating window of low-stakes blocks, for the minutes between real work. Pieces never fall on their own: move them,
turn them, lower them a row at a time, and set them when you are ready — or walk away mid-piece and come back
tomorrow. Nothing is timed and nothing is lost.

On macOS it is a borderless, resizable panel that floats above other apps (and every Space), with a clear, glass,
tinted or solid background inside a distinct border. ⌥⌘L shows and hides it from anywhere; Esc tucks it away. The
same game runs in any browser from `Game/index.html`.

## Play

**Free Play** — endless, relaxed. Every cleared line is banked as ◆ *lines*, the currency. A quad or T-spin is worth one
line more, and a *chain* multiplies it all: every back-to-back quad or T-spin in a streak and every piece in a combo
adds one, up to ×20 — a quad on a full chain pays 100. A full board just ends that
board; the lines stay yours. Retiring a board (New board, or when it fills up) shows its whole life: how long it
lived and was played, pieces, lines, score, quads, T-spins, perfect clears, best combo and back-to-back, holds and
every power-up used on it; Stats ▸ Free Play keeps the last boards.

**Classic** — the ► Classic button in the corner of the Play board. Plain Tetris: pieces fall, faster every ten
lines (guideline speed curve), half-second lock delay, soft and hard drop, hold (once per piece), game over, best
score. Lines you clear still bank as ◆. Music: Korobeiniki (the public-domain folk tune) in its own key, A minor,
arranged soft as a two-minute suite — electric piano over a round bass and a quiet pad, a soft beat in places, a
breathy lead for the bridge and an interlude with a counter-melody; it keeps its tempo and only quickens as the stack
nears the top. The Tetris Worlds announcer (her lines cut from the game's recording by `scripts/splice-voice.py`, embedded)
calls singles, doubles, triples, tetrises, T-spin singles/doubles/triples, back-to-backs, "amazing" for a perfect
clear, "rank up" for a new level and "top out" at the end. Both toggle under the board or in Settings ▸ Sound. P pauses; ‹ Relaxed, another tab or another window pauses
too.

**Puzzles** — procedurally generated, infinite, short, in Easy, Medium and Hard. Each has a seed (`M-3K7Q2XA`): the
same seed is the same puzzle for everyone, so it can be shared, replayed or retried (R) as often as you like; Undo is
free. Every puzzle is built backwards from a solution — rows are filled solid, pieces are lifted out only where they
could have been flown in and set, and the result is played forward on the real rules before it is kept — so every seed
is solvable, and Hard ones need tucks and spins. Goals: clear the board, clear N lines over bedrock, or clear the gems.
Solving pays lines (more on the first try, double for the Daily). Dailies are the same in every copy of Lull: day
numbers run through a fixed, keyed shuffle of all 2³² seeds per difficulty, so every date has one seed and every seed
belongs to exactly one date (hover a seed to see which). That is 4,294,967,296 seeds per difficulty, 12,884,901,888 in all. History lists every puzzle you opened — solved or
not, tries, time — with its seed and a ▶ button; ☆ saves a seed (from a row, or the ☆ beside History for the puzzle
in play), and History ▸ Saved keeps them. Solutions only ever need turns a person expects (in place, or
nudged sideways off a wall), never SRS kicks that hop a piece through a gap — and only clockwise ones, so a single
turn button (Up, or a right-click) solves every puzzle. Settings ▸ Controls ▸ Counter-clockwise puzzles (off by
default) switches new puzzles to the both-ways seeds (`ES-`, `MS-`, `HS-` + the same seven symbols, a different
puzzle), each built so it cannot be solved clockwise-only. Wildcards:

| Wildcard | |
|---|---|
| Big Minos | every piece is 2×2 per block, moving one cell at a time |
| Odd Shapes | trominoes and all twelve pentominoes |
| Wraparound | the side walls are portals (they glow, with ⇆) |
| Rigid | no turning; each piece arrives already facing its way |
| Heavy | no lowering, hard drops only |
| Inverted Controls | left is right and turns are reversed |
| Upside Down / Sideways | the board turns 180° / 90°; the arrows follow the screen |
| Fog | only blocks near your piece are visible |
| Vanishing | pieces turn invisible once set |
| Blind Queue | no preview |
| Hold | puzzles have no hold slot unless this is on — and then the queue arrives out of order, and a search proves the puzzle cannot be solved without holding |
| Monochrome | as named |
| Both Ways | only on `S` seeds: a spot needs Z (counter-clockwise) or A (half turn) |

**Factory** — a small idler built from the same parts as the rest of Lull. Buy presses that stamp minos, from
monominoes to decominoes; each earns credits a second and doubles its output at 10, 25, 50, 100, 200 and 400
owned, and each opens the next line. The belt (drawn like the board, in your skin and palette; minos slide in and out,
evenly spaced) now and then carries a cracked mino: click it off before it ships (a streak pays more), or buy an Inspector. Income fills crates; a full
crate trades for ◆ lines. It runs while Lull is closed, for up to 8 hours.

**Items** — single-use, bought and used from the bar under the board, grouped into five types; a type's button
(or keys 1–5) opens its tray, then click an item (or 1–9; Esc closes). Hover anything for what it does.

| Type | Items |
|---|---|
| Shapers | Reroll, Mirror, Pebble, Noodle (a six-long rod), Giant (twice the size), Order Slip, Blueprint (draw your own) |
| Physics | Sand, Magnet (pulls its columns down tight), Phase (passes through blocks), Anvil (falls to the floor, flattening its columns) |
| Demolition | Drill, Bomb, Laser (vaporises every row it touches), Chroma Purge, Black Hole (swallows everything within three), Nuke |
| Board | Mirror World (flips the board), Rewind, Settle, Tornado (packs every block into solid rows) |
| Luck | Golden Piece (its lines pay triple), Jackpot (three reels, three random items) |

Each has its own animation. An item that changed the piece can be pressed again before the piece is set: the old
piece and the item come back; board items can be rewound.

**Shop** — cosmetics: palettes (Prism animates), mino skins (Gem, Glass, Neon, Jelly, Pixel …), board
frames, backdrops, line-clear effects, ghost styles and **sound packs** (Drift — the airy default, in a soft
reverb — Typewriter with carriage-return zips and bells, Chiptune coins and power-ups, fizzing Bubbles, rolling
Marimba, Analog Synth stabs, ringing Glass, Wind Chimes — all synthesized, each with its own clears, with a Listen
button); a few are factory rewards.

**Achievements** — 42 quiet milestones that pay ◆ lines, in their own tab: a small toast when one is earned. None is a gimme — the easiest is a quad (15 ◆); the hardest are eight back-to-backs, three
perfect clears on one board, 300,000 in Classic, 25 Hard puzzles or a decomino press (150–300 ◆). Fifteen are
legendary — a ×20 chain, ten perfect clears on one board, a 20-combo, a million or 1,000 lines without a power-up,
Classic level 20 or a million, fifty Hard puzzles in a row, 400 decomino presses — paying 800–3,000 ◆.

**Stats** — lines by source and day, clears, T-spins, combos, pieces per minute, inputs per piece, puzzle solves
and first-try rates by difficulty and wildcard, factory quality control, items bought and used, time by mode.

## Keys

| | |
|---|---|
| ← → | move |
| ↓ | lower one row; on the stack, a fresh press sets the piece (holding never does) |
| Space | hard drop |
| ↑ / X, Z, A | turn clockwise, counter-clockwise, 180° |
| C / Shift | hold; again to swap back (Free Play and Puzzles: as often as you like) |
| 1–5, then 1–9 | open an item tray, use an item |
| ⌫ / U, R, N, H | undo, retry, next puzzle, hint |
| ⌘1–⌘5, ⌘, | tabs, settings |
| P | pause Classic |
| mouse: point | slide the piece left and right (at its height; sticky near column edges; mirrored under Inverted Controls; keys keep working while the pointer rests there) |
| left click | drop it straight down — anywhere on the board side (a slip in the last 0.1 s before the click is ignored) |
| right click | turn clockwise |
| wheel | lower one row (never sets the piece) |
| click HOLD | hold, or swap back |

Every item on the bar explains itself on hover. Repeat delay (230 ms) and rate, preview length, sound, effects, background, theme and accent are in Settings.

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
| `Game/` | the game: `index.html`, `css/`, and `js/` — `pieces` (SRS tetrominoes, pentominoes, big and custom shapes, polyomino enumeration), `board`, `engine` (the floating-piece rules and every item), `puzzlegen` (seeds, wildcards, reverse construction, reachability search, forward verification), `factory` (presses, milestones, crates, the belt, offline time), `store` (save, catalog, stats), `achievements`, `render` (canvas: skins, frames, effects, item animations, rotated views), `factoryview` (the belt, drawn like the board), `modes`, `ui`, `app` |
| `Sources/Lull/` | the macOS shell: a borderless `NSPanel` (floating, all Spaces, edge-resizable, draggable by the page's title bar) around a transparent `WKWebView`, a blur for the Glass background, the save file, the ⌥⌘L hot key, and a self-test CI runs |
| `scripts/` | `make-app.sh`, `icon.swift`, `test.cjs`, `browser-test.cjs`, `splice-voice.py` (cuts the announcer's lines from a recording), `make-voice.py` (the older synthesized whisper) |

## Credits

The Classic announcer's lines are cut from the announcer of *Tetris Worlds* (2001); that recording belongs to its
rights holders (The Tetris Company / THQ) and is not covered by this project's terms. `scripts/make-voice.py` can
render a freely licensed stand-in (Piper's LibriTTS voice, CC BY 4.0: H. Zen et al., 2019, http://www.openslr.org/60/).
Korobeiniki is a 19th-century folk song in the public
domain.
