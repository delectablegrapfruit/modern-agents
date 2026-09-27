# Lull

A floating window of low-stakes blocks, for the minutes between real work. Pieces never fall on their own: move them,
turn them, lower them a row at a time, and set them when you are ready — or walk away mid-piece and come back
tomorrow. Nothing is timed and nothing is lost.

On macOS it is a borderless, resizable panel that floats above other apps (and every Space), with a clear, glass,
tinted or solid background inside a distinct border. ⌥⌘L shows and hides it from anywhere; Esc tucks it away. The
same game runs in any browser from `Game/index.html`.

**Title bar** — left to right: the places to play (Play, Puzzles, Factory) in one recessed track; empty bar to drag the
window by; the places to look (Shop, Stats, Achievements) as quiet icons beside the wallet they spend and fill; the
wallet (click it for the Shop); the speaker and Settings; and in the app, float on top, hide and quit. ⌘1–⌘6 run in
that order. The tab you are on is a raised pill with its icon in the accent colour. Labels give way as the window
narrows — all three play tabs named, then only the one you are on, then icons alone (Shop, Stats and Achievements are
named only in a wide window) — and every control has a tooltip with its key, so nothing wraps or crowds, down to the
app's 400 px minimum (and 300 px in a browser).

## Play

**Free Play** — endless, relaxed. Every cleared line is banked as ⦵ *lines*, the currency. A quad or T-spin is worth one
line more, and the back-to-back streak multiplies it: an eighth for each quad or T-spin in the streak, so it starts to
pay past eight in a row and stops at ×2.5 (twenty in a row) — a quad on a full streak pays 13. The *chain* — the streak
plus the combo, the number to be proud of — is counted apart and shown beside the multiplier (`Chain 16 · ×1.75`).
A piece that has no room where it appears (a new one, one swapped in from hold, or one an item makes) is fitted into the nearest open spot above the stack it could get to — beside a tall column, stood on end, in another turn — never down inside the stack. Only when it fits nowhere is the board full; a hold swap or an item with no room is just refused (a short note says so, nothing is used up).
A full board just ends that board; the lines stay yours. The ⦵ glyph is a cleared line running into a small black hole; in the wallet it is drawn large, a dark disc in a thin glowing ring. Everywhere else it is one character, `L.LINE` (U+29B5, never an emoji), drawn by a one-glyph font of the page's own (`scripts/line-glyph.py`) that is first in every font list and in the canvas fonts, so text, prices, toasts and the boards all show the same shape. Retiring a board (New board, or when it fills up) shows its whole life: how long it
lived and was played, pieces, lines, score, quads, T-spins, perfect clears, best combo and back-to-back, holds and
every power-up used on it; Stats ▸ Free Play keeps the last boards.

**Classic** — the ► Classic button in the corner of the Play board. Plain Tetris: pieces fall, faster every ten
lines (guideline speed curve), half-second lock delay, soft and hard drop, hold (once per piece), game over, best
score. Lines you clear still bank as ⦵, multiplied by the back-to-back streak — ×0.5 for each tetris or T-spin in a
row, up to ×10 at twenty (the status bar's *Bank*); the score is never multiplied. Music: Korobeiniki (the public-domain folk tune), note for note in its own
key, A minor, slowed to 80 and dressed like a late-night console menu — a glassy FM electric piano over wide, slowly
filtered pads of min9, min11 and maj9 chords and a warm sub, a quiet arpeggio, the odd glass bell or water droplet, a
felt kick and brush in places, all on a faint tape wobble with chorus, a dark echo and the shared room. A three-minute
suite: pads, the theme, the theme with a harmony, the bridge floating at half time, an interlude with a
counter-melody, the theme over a low counter-line, the bridge in time, a short coda. It keeps its tempo and only
quickens as the stack nears the top. While it plays, the sound effects play in its harmony, whatever the sound pack:
every pitched voice is retuned to the chord sounding as it rings (read off the bars already scheduled, at the tempo
of the moment; a long note struck just before a change takes the next chord). A whole sound moves first — never more
than a tritone, so it keeps its register — until its first note is a chord tone, by whichever move disturbs the rest
least; then each other note goes to the nearest chord tone (a short blip of a note or two may be any note of the key,
with G# and F# over the dominant), keeping the sound's shape: a rising run still rises, a chord keeps its order, twins
a few cents apart still beat, and slides, partials, FM and detune ride along. Noise, clicks and low thuds or sweeps
are left alone, and without the music every sound plays as its pack made it. A quad, a T-spin or a perfect clear
waits for the next eighth of the beat only when it is at most 60 ms away — audio trailing the picture by that little
reads as together (people notice a lag from about 125 ms, ITU-R BT.1359) — and nothing you steer by ever waits. The Tetris Worlds announcer (her lines cut from the game's recording by `scripts/splice-voice.py`, embedded)
calls singles, doubles, triples, tetrises, T-spin singles/doubles/triples, back-to-backs, "amazing" for a perfect
clear, "rank up" for a new level and "top out" at the end. Her raw takes are mixed in on the fly: thinned lows, eased
low-mids and top, a gentle compressor, the same reverb as everything else and a soft stereo echo, with the music
dipping under her; Settings ▸ Sound ▸ Announcer volume sets her level. Both toggle under the board or in Settings ▸ Sound. P pauses; ‹ Relaxed, another tab or another window pauses
too.

**Puzzles** — procedurally generated, infinite, short, in Easy, Medium and Hard. Each has a seed (`M-3K7Q2XA`): the
same seed is the same puzzle for everyone, so it can be shared, replayed or retried (R) as often as you like; Undo is
free. Every puzzle is built backwards from a solution — rows are filled solid, pieces are lifted out only where they
could have been flown in and set, and the result is played forward on the real rules before it is kept — so every seed
is solvable, and Hard ones need tucks and spins. Goals: clear the board, clear N lines over bedrock, or clear the gems.
Every puzzle takes every piece: the board and the lines hold exactly the pieces' cells, and one gem sits in a row only the
last piece completes, kept only when an exhaustive search (every move the engine allows, every order a Hold slot
allows, pruned by counting the holes the gem rows still need) proves no fewer pieces take every gem; a search that
gives up counts as a shortcut. A gem seed that runs out of tries settles for a lines puzzle on its last board.
Solving pays lines (more on the first try, double for the Daily). Dailies are the same in every copy of Lull: day
numbers run through a fixed, keyed shuffle of all 2³² seeds per difficulty, so every date has one seed and every seed
belongs to exactly one date (hover a seed to see which). That is 4,294,967,296 seeds per difficulty, 12,884,901,888 in all. History lists every puzzle you opened — solved or
not, tries, time — with its seed and a ► button; ☆ saves a seed (from a row, or the ☆ beside History for the puzzle
in play), and History ▸ Saved keeps them. Solutions only ever need turns a person expects (in place, or
nudged sideways off a wall), never SRS kicks that hop a piece through a gap — and only the one direction a single
turn button gives, so that button (Up — on a turned board, the arrow pointing away from the floor — or a right-click)
solves every puzzle: clockwise, or counter-clockwise under Inverted Controls, which turns both around (those puzzles
are built, checked and hinted counter-clockwise). Upside Down and Sideways turn the picture, never mirror it, so a
clockwise turn looks clockwise there too. Settings ▸ Controls ▸ Counter-clockwise puzzles (off by default) switches
new puzzles to the both-ways seeds (`ES-`, `MS-`, `HS-` + the same seven symbols, a different puzzle), each built so
that single button alone cannot solve it. Wildcards:

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
| Both Ways | only on `S` seeds: a spot needs Z (the other turn: counter-clockwise, clockwise under Inverted Controls) or A (half turn) |

The tab reads top to bottom: a slim bar (difficulty; Daily, pressed while today's is in play and ticked once it is
solved; Seed; History — icons alone in a narrow window), then the puzzle's card — its name (✓ once solved), where it
comes from (number, Daily date or seed) and piece count, the seed (click to copy) and ☆; the goal with how far along
it is (lines, gems or blocks left, and a thin meter); a chip per wildcard, each with its own icon (hover, or click for a
note that stays; Both Ways is tinted and names Z and A) — then the board, and a bar of Undo, Retry, Hint (⦵, H) and
Skip, which turns into Next once solved. Every row has a fixed height and chips shorten (then drop to icons) rather
than wrap, so no puzzle and no state moves the board. Solving brings a small card with the time, tries and pay; a
board that runs out shows how far it got, with Undo and Retry. Play a seed reads a seed as it is typed (difficulty,
both ways, solved, which Daily) and refuses a bad one in place; History has counts on its tabs and marks the puzzle in
play.

**Factory** — one slow line. Up to four presses (tetromino, pentomino, hexomino, heptomino) each form one piece every
ten minutes, a mino at a time; a belt carries it to a straight lift that sets each mino into a bin four minos wide, so every full row is one ⦵ line
— a quarter line per mino, never more: 6 lines an hour with one press, 13.5, 22.5, 33 with four (every factory figure is a decimal, to the quarter line). The bin holds 12 rows
(24, 48, 72, 108 when built taller); when the next piece will not fit, the line waits — nothing is lost — until you
Collect (the button, a click on the bin, or C), which banks the full rows and leaves the loose minos. It runs while
Lull is closed, replayed on return with the same step as on screen, so time away is capped only by the bin. Presses
(150, 450, 1,200 ⦵) and bins (60, 200, 500, 1,000 ⦵) are all there is to buy. Click a press to pin its mold to one
shape (free; pay never changes) and fill in Stats ▸ Factory's shape sets. Drawn like the board, in your skin and
palette, on a plain well (the equipped backdrop stays on the play boards); hover anything for a line about it.

**Items** — single-use, bought and used from the bar under the board, grouped into six types; a type's button
(or keys 1–6) opens its tray, then click an item (or 1–9; Esc closes). Hover anything for what it does.

| Type | Items |
|---|---|
| Shapers | Reroll, Mirror, Pebble, Noodle (a six-long rod), Giant (twice the size), Order Slip, Blueprint (draw your own) |
| Physics | Sand, Water (runs into the lowest holes it can reach), Steel, Magnet (pulls its columns down tight), Phase (passes through blocks), Anvil (falls to the floor or onto steel, flattening its columns) |
| Elements | Oil, Frost, Torch, Lightning |
| Demolition | Drill, TNT, Bomb, Laser (vaporises every row it touches), Chroma Purge, Black Hole (swallows everything within three), Nuke |
| Board | Mirror World (flips the board), Rewind, Settle, Tornado (packs every block into solid rows) |
| Luck | Golden Piece (gold for the next five clears, ×3 each), Jackpot (a real gamble) |

*The sandbox* (`js/sandbox.js`). Seven items leave blocks made of something, and the materials play off each other and
the older toys, the way a physics sandbox does. **Ice** (Frost freezes the piece and every block it touches) is
brittle: a blast, an anvil, a drill or a T-spin into it shatters all the ice joined to it. **Oil** burns whatever its
colour and lights everything around it. **Steel** stands through blasts, fire, drills and purges, stops an anvil dead,
and carries a laser beam into every row it reaches and lightning through all of it. **TNT** sits in the stack until a
blast, fire, lightning, an anvil or a drill reaches it — or its row clears — and goes off like a bomb, setting off any
TNT in reach. **Water** runs down and sideways into the lowest hole it can reach (under overhangs too, filling a
channel from the back); fire stops at it, lightning runs through it, Frost freezes all of it. The **Torch** lights
whatever it lands against, and fire spreads through blocks of that colour and through oil, melts ice to water and sets
off TNT; **Lightning** strikes the block it lands on and runs through steel and water, frying everything they touch
(and anything else just catches fire). Every link of a chain is recorded by the engine and played back in order on the
physics layer: blasts throw their blocks, fire glows and goes up in embers, ice cracks into shards, current crackles
along steel, water runs and splashes, melting ice steams. Rewind takes a whole chain back, pay included.

*Combos* — sixteen specific things that pay a little extra: lines, a short boost (the next few clears pay ×1.25–×1.5)
and points. By hand: a row all one colour (Painted Row), a quad with an I brought out of hold (From the Pocket), a line
cleared by a piece tucked under an overhang (Keyhole), two T-spin doubles back to back (Twin Spin), fifty pieces and
twelve lines without an item (Bare Hands). With items: a T-spin into ice (Shatter Spin), six ice at once (Cold Snap),
one explosion setting off another (Chain Reaction) or three in a chain (Daisy Chain), TNT in a cleared row (Fuse Line),
twelve blocks in one fire (Wildfire), a laser carried by steel (Conductor), lightning through six blocks of wire (Live
Wire), water filling two covered holes and clearing a line (Undertow), a perfect clear from a Tornado (Eye of the
Storm), a board emptied by a chain (Scorched Earth). Each shows a small callout on the board with what it paid. With no
clock in Free Play, none is for repeating: on one board a combo pays in full, then half, then a quarter, then nothing;
boosts come with the first two; the item ones pay less than the items cost. Stats ▸ Free Play lists them: found ones by
name, the rest as a question mark.

*Luck.* Golden Piece (35 ⦵) puts gold on the board for your next five clears, each ×3 on top of everything else; it
waits through pieces that clear nothing, so it is never wasted. It adds five clears' pay twice over: built for quads
(5 a clear) that is 50 for its 35, on ordinary clears about 20 — worth it played well, not otherwise. Jackpot (50 ⦵)
is three reels (blank 7, gem 5, bomb 3, star 1 in 16): ★★★ 2,000 lines, ⦵⦵⦵ 300, ✹✹✹ three Demolition items, two ★
400, one ★ 60, two ⦵ 80, two ✹ a Demolition item, anything else nothing. On average it pays back about 45 (nine
tenths), more than half the pulls pay nothing, one in ninety pays 400 or more; the machine shows its pay table.

Each has its own animation. Demolition and Physics items play out on a small physics layer, from what the engine
actually removed or moved: the drill's bit spins down its column and each block it meets bursts into chips; a bomb's
fuse flares, a shockwave rings out and its blocks are thrown outward, tumbling and bouncing; a laser charges a line,
then a beam spreads across each row and the blocks come apart into drifting pixels; Chroma Purge sends a pulse of
the piece's colour outward and each block it reaches dissolves into grains; a black hole pulls its blocks in on
tightening spirals, stretched and shrinking, then collapses with a flash; a nuke flashes white and blows every block
out, tumbling; sand drops block by block, trickling grains, with a small bounce; a magnet shows its field, then yanks
its columns down, each block landing with a squash and a puff; a phasing piece shimmers, sinks through as a ghost and
materialises with a ripple; an anvil falls, speeding up, flattening each block it meets, and lands with a thud (Settle
uses the same falls; a block falling into a row that cleared comes apart as it gets there, and setting the next piece
mid-fall ends the fall). Gravity follows the board, so on Upside Down and Sideways boards things fall toward its floor;
shake is small and moves only the board. It is all for show — the board is already settled, so the next piece is
never kept waiting — mostly over in about 0.7 s (a nuke or black hole about 1.2 s), with fixed pools of bodies and
particles; Reduced motion turns it into plain fades. An item that changed the piece can be pressed again before the piece is set: the old
piece and the item come back; board items can be rewound. Shapes beyond the seven (a Noodle, a Giant, a Blueprint drawing, a mirrored odd shape) turn wherever there is room: when no kick fits, a turn that would poke past the ceiling, floor or a wall is nudged back in by exactly that much (if the way in is clear), and one that would dip into the stack is stood on it or slid off the block beside it, never out of a well or through blocks. The seven keep plain SRS, and puzzles keep exactly the turns they were built with.

**Shop** — cosmetics: palettes (Prism animates), mino skins (Gem, Glass, Neon, Jelly, Pixel …), board
frames, backdrops, line-clear effects, ghost styles and **sound packs** (Drift — the default: glassy FM blips,
droplets for movement, airy chord swells for clears and a soft low thoom for booms, all in the music's A minor —
Typewriter with carriage-return zips and bells, Chiptune coins and power-ups, fizzing Bubbles, rolling
Marimba, Analog Synth stabs, ringing Glass, Wind Chimes — all synthesized, each with its own clears, with a Listen
button); a few are factory rewards (a second, third and fourth press, the tallest bin, 500 lines collected).

**Achievements** — 105 quiet milestones that pay ⦵ lines, in their own tab: a small toast when one is earned, nothing
more (one earned in the background, by the factory or the once-a-minute check, is told when you come back, not chimed
from a hidden window). The tab folds them into Free Play, Classic, Puzzles, Lifetime and Factory (each header keeps its count, a bar and
what it has paid), easiest first, with a filter for all, to do or earned; the slow ones show their progress. None is a
gimme — the easiest is a quad by hand (15 ⦵) — and 150 pieces of ordinary play earn nothing new, nor do 150 with a
few items used along the way (a test plays both, at a relaxed piece every three seconds).

*Free Play has no clock and a whole sandbox of items*, so nearly anything there could be bought or waited out (an Order
Slip for every I, a laser for every quad, a Tornado for every perfect clear, Rewind for every slip). So its skill ones
count only what is done **by hand**: no item that touches the pieces or the board — Rewind included — during the feat,
nor since the board was last empty (an empty board, however it got that way, is a fresh start; Luck items never
count against it, and an item taken back before its piece is set never happened). Its score ones need a board without
a single item; two ask for pace — the last hundred pieces set by hand, on the wall clock, clearing 36 lines (Allegro,
within three minutes; Presto, ninety seconds); and the streaks that are really about keeping up have Classic versions under
gravity (eight back-to-back, four tetrises in a row), where the 20-combo moved too, as a 15-combo. Hover the Chain in the status bar to see whether
the stack is by hand; a board's summary shows its best chain and its best by hand. Three are for playing with the
sandbox on purpose: one chain reaction through lightning in a wire, fire, shattered ice and an explosion (Rube
Goldberg), a board of 60 blocks or more burnt empty in one go (Burnt Offering), and every combo found (Tinkerer).

Medium ones (100–300 ⦵): a perfect clear by hand, a T-spin Mini double, a 10-combo, a T-spin triple on gold, four quads in a row, Allegro,
the perfect-clear opener (within a fresh board's first ten pieces, no items), Rube Goldberg; a Hard puzzle first try
without hints or undo, all three Dailies on their day, or a quad, a tetris and a Hard puzzle in one day; every
hexomino or 1,000 lines off the factory line. Hard ones (300–800 ⦵): eight back-to-back by hand, three perfect clears
by hand, 100 line-clearing T-spins by hand, 250,000 points without items, Burnt Offering, Tinkerer, forty lines in a
fresh board's first hundred pieces with nothing left over, every item used; in Classic a perfect clear, a T-spin
triple, a 10-combo, eight back-to-back, level 10 without hold, 40 lines in 90 s or 40 lines of tetrises alone; a Hard
puzzle first try in under 20 s, twenty first-try solves in a row, 100 Hard puzzles; 100,000 lines in all, 30 days
played. Thirty-two are legendary (800–5,000 ⦵): a chain of 20 by hand, Presto, a perfect clear with a T-spin, ten
quads in a row, five gold clears on a chain of 20, ten perfect clears by hand or 5,000 lines on one board, a million
without items; Classic level 25, a 15-combo, 40 lines in 50 s, level 20 without hold, a Classic million; every
wildcard on Hard, a Daily thirty days in a row, a hundred first-try solves in a row; a hundred hours or a hundred days
with Lull, everything the shop sells, a million lines earned (Jackpot winnings and rewound lines aside: churning the
Jackpot would count its gross, and a rewound clear replayed would count twice); all 108 heptominoes or 100,000 minos
pressed — and *Lull*, every other one. A retired one (Free Play's 20-combo, now Classic's 15) stays with whoever
earned it, paid, marked Retired and counted in nothing. They read the stats below plus a few kept for them: the
board's hand counts (`freshStats` in `js/engine.js`: whether the stack is by hand, and the back-to-back, combo, quads
in a row, chain, line-clearing T-spins, T-spin triples and perfect clears by hand, gold clears on a chain of 20, and
the last 101 hand pieces' times; a board saved before them carries its streaks over only if no item was ever used on
it), Classic's own clock (running time only), undos per puzzle, runs of first-try solves (a retry, hint,
fail, skipped or abandoned puzzle ends one) and of Dailies on consecutive dates (each solved on its day), Hard solves per wildcard, days played (a day counts once you
play in front, not when the factory runs alone), Classic games (one counts once it has run a minute or cleared ten
lines, so a quick restart is not a game), and the
day log's quad (set by a piece: a laser or a Tornado is not one) / tetris / Hard puzzle / Dailies. Lifetime ones are also checked once a minute.

**Stats** — lines by source and day (play, combos, jackpot …), combos found, clears, T-spins, combos, pieces per minute, inputs per piece, puzzle solves
and first-try rates by difficulty and wildcard, factory output and shapes pressed, items bought and used, time by mode.

## Keys

| | |
|---|---|
| ← → | move |
| ↓ | lower one row; on the stack, a fresh press sets the piece (holding never does) |
| Space | hard drop (for 0.18 s after a piece is set, Space, a click and the ↓ that sets are ignored, so a double press never drops the next piece unseen; moving and turning still work, and Classic's gravity never waits) |
| ↑ / X, Z, A | turn clockwise, counter-clockwise, 180° |
| C / Shift | hold; again to swap back (Free Play and Puzzles: as often as you like). On the Factory tab, C collects the bin |
| 1–6, then 1–9 | open an item tray, use an item |
| ⌫ / U, R, N, H | undo, retry, next puzzle, hint |
| ⌘1–⌘6, ⌘, | tabs, settings |
| P | pause Classic |
| M | mute everything, on any tab (again to unmute) |
| mouse: point | slide the piece left and right (at its height; slightly sticky at column edges: the pointer goes 0.15 of a cell past one before the piece follows; mirrored under Inverted Controls; keys keep working while the pointer rests there) |
| left click | drop it straight down — anywhere on the board side (a slip into the next column in the last 0.06 s before the click is ignored) |
| right click | turn clockwise |
| wheel | lower one row (never sets the piece) |
| click HOLD | hold, or swap back |

**Mute** — the speaker in the title bar (between the wallet and Settings, on every tab), M, or Settings ▸ Sound ▸ Mute:
one switch, kept in sync everywhere and saved. It ramps a gain that sits after everything else to zero in 50 ms, so
effects, Classic music (notes already ringing too), the announcer, factory sounds and Listen previews all fall silent
at once without a click; the Sound effects, Classic music and Announcer toggles and every volume are left as they
were, so unmuting brings back exactly what you had. Muted, the speaker shows a slash in a soft amber wash. M works
over open windows too (never while typing in a text field), and Listen says it is muted rather than playing nothing.

Every item on the bar explains itself on hover. Repeat delay (230 ms) and rate, preview length, sound, effects, background, theme and accent are in Settings.

## Build and run

```sh
Lull/scripts/make-app.sh      # macOS 14+, Xcode 15+: builds Lull/build/Lull.app
open Lull/build/Lull.app
cd Lull && swift run          # the same, straight from the package

open Lull/Game/index.html     # any browser, any OS (saves to localStorage)

node Lull/scripts/test.cjs            # game logic: 750 puzzles replayed through the engine, turns, items, factory, save
node Lull/scripts/browser-test.cjs    # the page played in headless Chromium (needs Playwright)
node Lull/scripts/audio-render.cjs out/   # every sound and a minute of music rendered offline: WAVs, peak, loudness, brightness
node Lull/scripts/audio-render.cjs out/ --harmony   # every pack's pitched sounds over every chord: notes found, share on chord tones, A/B mixes
```

A packaged build is committed by CI to [`dist/Lull.app.zip`](../dist/). It is ad-hoc signed: right-click ▸ Open the
first time. The save lives in `~/Library/Application Support/Lull/save.json` (Settings ▸ Export copies it).

## Layout

| Path | |
|---|---|
| `Game/` | the game: `index.html`, `css/`, and `js/` — `pieces` (SRS tetrominoes, pentominoes, big and custom shapes, polyomino enumeration), `board`, `engine` (the floating-piece rules and every item), `sandbox` (materials, chain reactions, combos, the chain multiplier, the Luck odds), `puzzlegen` (seeds, wildcards, reverse construction, reachability search, forward verification), `factory` (presses, the belt, the bin, one step for play and time away, save migration), `store` (save, catalog, stats), `achievements`, `fxphysics` (the item effects' blocks, debris and dust: gravity, bounces, spirals, fixed pools), `render` (canvas: skins, frames, effects, item animations, rotated views), `factoryview` (the factory floor, drawn like the board), `modes`, `ui`, `app` |
| `Sources/Lull/` | the macOS shell: a borderless `NSPanel` (floating, all Spaces, edge-resizable, draggable by the page's title bar) around a transparent `WKWebView`, a blur for the Glass background, the save file, the ⌥⌘L hot key, and a self-test CI runs |
| `scripts/` | `make-app.sh`, `icon.swift`, `line-glyph.py` (builds the line glyph's font into `lull.css`), `test.cjs`, `browser-test.cjs`, `audio-render.cjs` (renders and measures the synthesized audio offline), `pitch.cjs` (finds the notes in a render, to check sound effects against the music's chords), `splice-voice.py` (cuts the announcer's lines from a recording), `make-voice.py` (the older synthesized whisper) |

## Credits

The Classic announcer's lines are cut from the announcer of *Tetris Worlds* (2001); that recording belongs to its
rights holders (The Tetris Company / THQ) and is not covered by this project's terms. `scripts/make-voice.py` can
render a freely licensed stand-in (Piper's LibriTTS voice, CC BY 4.0: H. Zen et al., 2019, http://www.openslr.org/60/).
Korobeiniki is a 19th-century folk song in the public
domain.
