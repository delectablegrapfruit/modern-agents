# Lull

A floating window of low-stakes blocks, for the minutes between real work. Pieces never fall on their own: move them,
turn them, lower them a row at a time, and set them when you are ready — or walk away mid-piece and come back
tomorrow. Nothing is timed and nothing is lost.

On macOS it is a borderless, resizable panel that floats above other apps (and every Space), with a clear, glass,
tinted or solid background inside a distinct border. ⌥⌘L shows and hides it from anywhere; Esc tucks it away. The
same game runs in any browser from `Game/index.html`.

**Title bar** — left to right: the places to play (Play, Puzzles, Factory, Classic) in one recessed track; empty bar to
drag the window by; the places to look (Stats, Achievements) as quiet icons; the wallet, which is also the Shop's
button (it lights up while the Shop is open); the speaker and Settings; the collapse chevron; and in the app, float on
top, hide and quit.
⌘1–⌘7 run in that order, the wallet last. The tab you are on is a raised pill with its icon in the accent colour. Labels
give way as the window narrows — all four play tabs named, then only the one you are on, then icons alone (Stats and
Achievements are named only in a wide window) — and every control's tooltip is its name and key, nothing more (what a place is, you find by going there;
no button carries a line of explanation or a key cap), so nothing wraps or crowds, down to the app's 400 px minimum (and 300 px in a browser).

## Play

**Free Play** — endless, relaxed. Every cleared line is banked as ⦵ *lines*, the currency. A quad or T-spin is worth one
line more, and the back-to-back streak multiplies it: an eighth for each quad or T-spin in the streak, so it starts to
pay past eight in a row and stops at ×2.5 (twenty in a row) — a quad on a full streak pays 13. The *chain* — the streak
plus the combo, the number to be proud of — is counted apart and shown beside the multiplier (`Chain 16 · ×1.75`).
A piece that has no room where it appears (a new one, one swapped in from hold, or one an item makes) is fitted into the nearest open spot above the stack it could get to — beside a tall column, stood on end, in another turn — never down inside the stack. Only when it fits nowhere is the board full; a hold swap or an item with no room is just refused (a short note says so, nothing is used up).
A full board just ends that board; the lines stay yours. The ⦵ glyph is a cleared line running into a small black hole; in the wallet it is drawn large, a dark disc in a thin glowing ring. Everywhere else it is one character, `L.LINE` (U+29B5, never an emoji), drawn by a one-glyph font of the page's own (`scripts/line-glyph.py`) that is first in every font list and in the canvas fonts, so text, prices, toasts and the boards all show the same shape. Retiring a board (Boards ▸ Retire, or Retire when it fills up) shows its whole life: how long it
lived and was played, pieces, lines, score, quads, T-spins, perfect clears, best combo and back-to-back, holds and
every power-up used on it; Stats ▸ Free Play keeps the last boards.

*Boards* — the library, from the Boards button in the Relaxed status bar (`js/library.js` keeps it; the window is in
`js/modes.js`). Two tabs, Saved (count of 12) and Retired, and New board. Saved lists the board in play first (marked
Playing), then the rest by when they were last played; each row is a thumbnail of its stack (in the current palette, plain squares
on whole screen pixels so it stays crisp; cached and redrawn only when the stack or the look changed), its name, lines, score and when it was last played
(Full on one that filled up). Click a row (or ↑/↓ and Enter) to resume it exactly as it was left: cells, the piece in
play and where it was (a T turned into its slot still spins, an I brought out of hold is still one), hold, the queue, the bag and the random stream (it goes on with the same pieces it would have
dealt), score, lines, chain and multiplier, gold, boosts and Luck, per-board stats and play time; the one in play is
shelved as it stands. A power-up still waiting to be taken back is kept as used when you switch (the take-back ends
there, as when the piece sets), and the Rewind history stays behind, as it does across a reload. New board shelves the
one in play and starts an empty board with its own seed (never the old board's queue); it is off for a board nothing has
been done on, and when the library holds 12 (it says Library full; retire or delete one). Each row has Rename (inline:
Enter keeps it, Esc leaves it, a click elsewhere keeps it and still lands; up to 24 characters, never empty or
invisible; a name another board has gets a number, "Rainy Sunday 2"), Retire (only a board that was played: its summary, then
it moves to Retired; the one in play is replaced by a new board) and Delete (asks first; nothing is kept). New boards
get a calm two-word name no other board has (Mossy Harbor, Quiet Orchard), then Board N. Retired keeps up to 50 read-only
records, newest first — name, started and retired dates, the final stack and the whole summary — and past 50 the oldest
goes (the Retire card says so). A record opens with a click and can be deleted. Retiring or deleting the board in play
always starts a new game in its place, and a full board is recorded as Full however it was retired. The windows are
kept for the keyboard: the library opens with focus on the board in play, a question over it takes focus (Enter on a
Delete question is Cancel) and nothing under it can be reached, and afterwards focus is back on the nearest row. A
library in a save that has been edited by hand is made safe when it loads: broken records are dropped.

The combos' shrinking pay is the library's, not a board's: a new board beside the others is no fresh start, and it
starts over only when a board begins with no other left. Everything else about a board belongs to it: its stats, its hand-play record for the
achievements ("no power-ups on the board", "on one board", Old Growth's age) and its share of the power-ups paid every
hundred lines (the save's per-board Earn record is parked with the board, so leaving and coming back never pays a
milestone twice). Lifetime totals count play once, whichever board it was on, and switching adds nothing. There is no
duplicate: a copy would be a way to replay a board's future. The daily gift, the factory and the control hints do not
look at boards at all.

**Classic** — its own tab, the last of the places to play. Plain Tetris: pieces fall, faster every ten
lines (guideline speed curve), half-second lock delay, soft and hard drop, hold (once per piece), game over, best
score. Lines you clear still bank as ⦵, multiplied by the back-to-back streak — ×0.5 for each tetris or T-spin in a
row, up to ×10 at twenty (the status bar's *Bank*); the score is never multiplied. Music: Korobeiniki (the public-domain folk tune), note for note in its own
key, A minor, slowed to 80 and dressed as calm ambient electronica with a little IDM in its detail — a soft, round
lead (a sine with a breath of FM and a triangle under it, gliding between notes that touch, a late vibrato on long
ones) over warm, detuned analog-style saw pads of min9, min11 and maj9 chords, breathing through a slightly resonant
filter on two slow LFOs and dipping gently each time the kick lands (a sidechain-like pump), a warm sub, a soft digital
arpeggio, the odd glass bell, granular shimmer of the chord or water droplet; in some sections a sparse, lightly swung
beat (a warm, round kick, a brush, faint hat ticks nudged off the grid) and, kept low, IDM micro-edits: a note now and
then stuttered into quick fading repeats, a soft click. All of it through a tape wobble, a soft saturation and a dark
top, with chorus, a dark echo and the shared room. A three-minute
suite: pads, the theme, the theme with a harmony and the beat, the bridge floating at half time, an interlude with a
counter-melody, the theme over a low counter-line, the bridge in time, a short coda. It keeps its tempo and only
quickens as the stack nears the top. It never changes key by modulating or
transposing, but each section says which scale it is in: A minor (natural) everywhere except the bridge, both the
floating one and the one in time, which is in A melodic minor (A B C D E F# G#: its tune leans on G#, its dominant E9
adds F#, and no F sounds in it). The sound effects are in the music's key, whatever the sound pack, but not in time
with it or on its chords: they play the moment they are asked for, and every pitched voice is put in the scale of
the section sounding (read off the bars already scheduled, at the tempo of the moment), or of A minor, the song's
home key, when the music is not playing — so when the suite moves into the bridge, the sound effects move with it. A
whole sound moves first — never more than a tritone, so it keeps its register — until its first note is in the
scale, by whichever move disturbs the rest least; then each other note goes to the nearest note of the scale,
keeping the sound's shape: a rising run still rises, a chord keeps its order, twins a few cents apart still beat, and
slides, partials, FM and detune ride along. Noise, clicks and low thuds or sweeps are left alone. The Tetris Worlds announcer (her lines cut from the game's recording by `scripts/splice-voice.py`, embedded)
calls singles, doubles, triples, tetrises, T-spin singles/doubles/triples, back-to-backs, "amazing" for a perfect
clear, "rank up" for a new level and "top out" at the end. Every clip is levelled to the same loudness (BS.1770, leaning a little toward the loudest moment, then
peak-limited), so no line is louder than another, and she sits well under the sound effects. Her takes are mixed in on the fly: thinned lows, eased
low-mids and top, a gentle compressor, the same reverb as everything else and a soft stereo echo, with the music
dipping under her; Settings ▸ Sound ▸ Announcer volume sets her level. Settings ▸ Sound ▸ Announcer in Relaxed (off by default) lets her call Free Play clears too. Both toggle under the board or in Settings ▸ Sound. P pauses; another tab or another window pauses
too, and so does the pointer leaving the window (Settings ▸ Controls ▸ Pause when the pointer leaves); P or Resume
carries on.

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
not, tries, time — with its seed and a play button; the star saves a seed (from a row, or the star on the puzzle's card
for the puzzle in play; filled once saved), and History ▸ Saved keeps them. Solutions only ever need turns a person expects (in place, or
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
solved; Seed; History — icons alone in a narrow window), then the puzzle's card — its name (a small tick once solved), where it
comes from (number, Daily date or seed) and piece count, the seed (click to copy) and the star; the goal with how far along
it is (lines, gems or blocks left, and a thin meter); a chip per wildcard, each with its own icon (hover, or click for a
note that stays; Both Ways is tinted and names Z and A) — then the board, and a bar of Undo, Retry, Hint (with its price) and
Skip, which turns into Next once solved. Every row has a fixed height and chips shorten (then drop to icons) rather
than wrap, so no puzzle and no state moves the board. Solving brings a small card with the time, tries and pay; a
board that runs out shows how far it got, with Undo and Retry. Play a seed reads a seed as it is typed (difficulty,
both ways, solved, which Daily) and refuses a bad one in place; History has counts on its tabs and marks the puzzle in
play. History, and Stats ▸ Puzzles, end with one quiet line — "37 of 12,884,901,888 puzzles solved" (doubled with
Counter-clockwise puzzles on); each difficulty button's tooltip gives its own share of 4,294,967,296.

**Factory** — one slow line. Up to four presses (tetromino, pentomino, hexomino, heptomino) each form one piece every
ten minutes, a mino at a time; a belt carries it to a lift that sets each mino into a bin four minos wide, so every full row is one ⦵ line
— a quarter line per mino, never more: 6 lines an hour with one press, 13.5, 22.5, 33 with four (every factory figure is a decimal, to the quarter line). The bin holds 12 rows
(24, 48, 72, 108 when built taller); when the next piece will not fit, the line waits — nothing is lost — until you
Collect (the button, a click on the bin, or C), which banks the full rows and leaves the loose minos. It runs while
Lull is closed, replayed on return with the same step as on screen, so time away is capped only by the bin (on the
Factory tab the new minos just fade in; elsewhere a toast gives the lines made). Presses
(150, 450, 1,200 ⦵) and bins (60, 200, 500, 1,000 ⦵) are all there is to buy. The tab reads like Play: the floor on the
board's own plate, a bar under it (Lines / hour, Lines in bin, Full in, and Collect at the right), and the two things
to build below, from the top of the window like the other tabs. The plate's cell size follows its width, and the scene
grows by whole rows into the height the bar and a full list leave (up to 1.8 times as tall as wide) — the window's height
alone, so a purchase never moves it, and a list row that goes leaves its space at the bottom: a row of ground under the
belt, then a hall over the gantry — a roof beam from the post to the lift's mast, tall windows in the back wall, a lamp
hung over each bay (lit, with a soft pool of light, once its press is built; a dashed outline until then). The bin's
tower rises into it: each size is drawn taller than the last (as many sections open as the height allows, the rest
closed to a bar a row or two apart), the biggest just under the roof, and the sizes still to build stand over the bin
as a dashed outline, a band each. The
floor is a small scene in the board's materials, your skin and palette, with no text on it:
a gantry of presses, each in a bay sized to its pieces (a mold window one cell wider than its longest shape, so a
piece drops straight down onto a belt of 28 cells); a ram stamps each mino into the window; at the belt's end a
cradle lift carries the minos up one by one (the column nearest it first, so none ever passes another), over a chute and into the bin, which is drawn in 12-line sections — the
one filling open, cell by cell (with the full ones just under it, or the empty ones above, as the height allows), the
other full ones as thin slivers in their top row's colours, the other empty ones as outlines. Collected rows lift out as one and clear away, the loose minos riding up on them and then dropping to the bottom;
the lines fly to the wallet, which counts them (and any achievement the collect earned) as they land. Click a press to pin its mold to one
shape (free; pay never changes) and fill in Stats ▸ Factory's shape sets.

**Power-ups** (items, in the code) — single-use, in five types on the bar under the Relaxed board. A type's button
(with how many you hold) opens its tray; click one to use it (Esc closes the tray). There are no number keys for them.
Hover one for what it does. They are bought right there, never in the Shop: one you have none of shows its price, and
clicking it asks once (its name and a Buy & use button with the price) — dimmed when the wallet is short.

| Type | Power-ups (price ⦵, rarity) |
|---|---|
| Shapers | Reroll (15, common: a different piece), Mirror (15, common: J and L, S and Z swap), Pebble (20, common: a single block), Noodle (25, uncommon: a six-long rod), Giant (30, uncommon: twice the size), Blueprint (100, rare: draw your own, up to six blocks) |
| Choice | Pick of Three (20, common: play one of the next three now; this piece takes its place in line), Best Fit (45, uncommon: the piece becomes whichever of the seven fits the stack best, right over its spot), Order Slip (35, rare: choose the piece in play) |
| Tools | Patch (20, common: one block that drops into the highest covered hole in its column), Ghost (50, uncommon: passes through blocks into the first gap below where it fits), Drill (40, uncommon: bores out its column), Bomb (45, uncommon: clears a 13-block diamond where it lands), Laser (65, rare: clears every row it touches, full or not), Black Hole (90, rare: swallows everything within three blocks) |
| Board | Mirror World (20, common: flips the board left to right), Rewind (25, common: takes back the last placement and its lines), Trapdoor (40, uncommon: the bottom row falls away, whatever it holds), Tornado (60, rare: shuffles the columns, holes and all), Settle (70, rare: every block falls straight down; full rows clear) |
| Luck | Golden Piece (35, uncommon: the next five clears pay ×3), Double or Nothing (30, uncommon: the next clear pays double if it is a quad or a T-spin, nothing if it is less), Safety Net (60, rare: keeps the back-to-back streak through one ordinary clear) |

Nothing here is about a clock — Free Play has none — so they are about choice and shape: which piece, what it
becomes, what the stack looks like after, what the next clear is worth. Tools and Shapers change the piece in play
(the ghost shows where a Patch, Ghost or Bomb will act); press the same one again before the piece is set and the old
piece, the queue and the item come back. Board items act at once and can be rewound. Lines a power-up clears are plain
lines: they pay and keep the combo going, but are never a quad or a T-spin and never add a back-to-back link (a
Tornado only rearranges — every row keeps its count, so it never clears). Every one of them, Luck aside, puts
power-ups on the board for the achievements.

*Getting them.* Bought with lines in the tray; free from the daily gift; and, modestly, from play: one for every hundred
lines cleared on a board (counted in the save, outside the board, so a Rewind and a replayed clear never pay twice) and one the first time each combo is ever found. Free ones are drawn by rarity
(common 8, uncommon 3, rare 1).

**Daily gift** — the small wrapped box in the Relaxed tab's status bar glows while a gift is waiting: three different
power-ups, drawn by rarity, so about two thirds of what it gives is common and one in fourteen rare. It comes again 24
hours after it was last opened — the time since, not the date; its tooltip counts down. The claim time is booked in the
save as it opens, and the draw is fixed by the save and how many gifts it has opened, so reopening Lull or switching
tabs never re-rolls it or opens it twice. A clock turned back never opens it early: the next one is still 24 hours
after the booked claim, however far back the clock went (and a clock pushed forward to claim early books that claim in
the future, so the next one waits for it).

*Combos* — things that pay a little extra: lines, a short boost (the next few clears pay ×1.25–×1.5) and points, each
told once in a small callout on the board. Four are pure skill: a row all one colour (Painted Row), four lines with an I
brought back out of hold (From the Pocket), a line cleared by a piece tucked in under an overhang (Keyhole), two T-spin
doubles back to back (Twin Spin). The rest are a power-up used well, each saying exactly what to do: complete a row with
a Patch dropped into a covered hole (Patch Job); clear a line with a Ghost piece set under an overhang (Through the
Wall); clear four lines at once with a Noodle or a Giant (Tall Order); three at once with a Blueprint piece
(Architect); four with a Best Fit piece (Tailor-Made); win a Double or Nothing (All In); let a Safety Net keep a
back-to-back streak of five or more (Caught); take out ten blocks or more with one Bomb (Full Blast); swallow twenty
or more with one Black Hole (Event Horizon). With no clock in Free Play, none is for repeating: across the board library each pays
in full, then half, then a quarter, then nothing; boosts come with the first two; and a power-up combo pays less than
the power-up it takes. Stats ▸ Free Play lists them: found ones by name, the rest as a question mark.

*Luck.* Golden Piece puts gold on the board for your next five clears, each ×3 on top of everything else; it waits
through pieces that clear nothing, so it is never wasted. It adds five clears' pay twice over: built for quads (5 a
clear) that is 50 for its 35, on ordinary clears about 20 — worth it played well, not otherwise. Double or Nothing waits
for the next clear, too: a quad or a T-spin pays double, anything less pays nothing (the lines still count on the
board). Safety Net is a one-time pass for the back-to-back streak: the next clear that would end it does not, and the
multiplier stays.

Each has its own animation, mostly on a small physics layer fed with what the engine actually removed or moved: the
drill's bit spins down its column and each block it meets bursts into chips; a laser charges a line, then a beam
spreads across each row and the blocks come apart into drifting pixels; a bomb flashes and throws its diamond's blocks
out, tumbling; a black hole pulls its blocks in on tightening spirals, stretched and shrinking, then collapses with a
flash; a Ghost shimmers, sinks through as a ghost and materialises with a ripple; a Patch drops through the stack like a
plug and seats itself with a small ring; a Trapdoor lets the bottom row fall out of the board and the rest settles down
one; a Tornado whirls while every column slides to its new place; Settle's blocks fall and bounce (a block falling into
a row that cleared comes apart as it gets there, and setting the next piece mid-fall ends the fall). Gravity follows
the board, so on Upside Down and Sideways boards things fall toward its floor; shake is small and moves only the board.
It is all for show — the board is already final, so the next piece is never kept waiting — mostly over in about 0.7 s,
with fixed pools of bodies and particles; Reduced motion turns it into plain fades. Shapes beyond the seven (a Noodle, a Giant, a Blueprint drawing, a mirrored odd shape) turn wherever there is room: when no kick fits, a turn that would poke past the ceiling, floor or a wall is nudged back in by exactly that much (if the way in is clear), and one that would dip into the stack is stood on it or slid off the block beside it, never out of a well or through blocks. The seven keep plain SRS, and puzzles keep exactly the turns they were built with.

**Shop** — click the wallet (or ⌘7). Cosmetics only (power-ups are not sold), one kind at a time: a row of kinds (←/→ step
while it has focus) picks which — when it does not fit, a chevron at each end pages it a visible width at a time,
snapped to whole kinds, dimmed at each end, never picking one — and only that
kind's tiles are shown — the list scrolls within the kind, never on into the next; the Shop reopens on the kind you
looked at last. Each tile has a large live preview drawn in your current look: a small real well with a stack in it.
The catalogue is short on purpose, every item distinct:

| Kind | Items (price ⦵) |
|---|---|
| Palettes | Classic (free), Mist 300, Sunset 450, Aurora 600, Ink 750, Handheld 900, Gold Leaf 2,000, Prism 3,500 (its hues glide round the wheel, a turn in 45 s), Assembly Line (factory) |
| Mino skins | Flat (free), Bevel 300, Pixel 450, Bubble 600, Glass 750, Jelly 900, Neon Tube 1,100, Gem 1,400, Lantern 1,800, Steel (factory) |
| Frames | Hairline (free: the well's own rim), Inlay 250, Glow 500, Brass 900, Rainbow 1,400 (a slow ring of spectrum, a turn in 12 s), Hazard Tape (factory) |
| Backdrops | Plain and Grid (free), Blueprint 300, Dusk 500, Aurora 700 (three veils of light drifting on long periods), Starfield 900 (the bright stars twinkle), Conveyor (factory; its treads slide) |
| Line clears | Fade (free), Sparkle 400, Ripple 600, Bloom 800, Welding Sparks (factory) |
| Ghosts | Outline (free), Soft 100, Dotted 150, Glow 250, Off |
| Sounds | Drift (free), Chiptune 350, Marimba 500, Analog Synth 650, Glass 800, Wind Chimes 1,000 |

Moving previews (Prism, Rainbow, the moving backdrops, every line clear on a loop) share one animation loop that
runs only while they are on screen, and stand still under reduced motion, as the boards do. A light-theme well deepens
any palette colour too pale for it (hue kept), and Glass and Neon Tube paint a deeper variant there. **Sound packs**
(Drift — the default: smooth synth tones in the music's room — a breath of a different note for each move, like a
chime stirring, soft sine plucks that darken as they ring, round bell tones, slow wide detuned pads swelling under
clears, a warm felt note and soft sub when a piece sets and a low thoom for booms; no clicks on the way in, never
brighter than the music, all in its A minor (and anything played that has no sound of its own yet gets a quiet pluck)
— Chiptune coins and power-ups, rolling Marimba, Analog Synth stabs, ringing Glass, Wind Chimes — all synthesized,
each with its own clears; its preview is a Listen button); a few are factory rewards (a second, third and fourth
press, the tallest bin, 500 lines collected), marked with a lock and what earns them on hover. A tile says In use, Use (click it, or the tile) or its price, dimmed when you cannot afford it. Buying
is two clicks on the same spot — the price turns into Confirm for three seconds — and a new cosmetic goes straight on.

**Look** — one small design system (`css/lull.css`, its tokens at the top): a midnight-ink dark and a porcelain light
theme, each with three translucent surface steps (so Glass and Tint show through), two line weights, a solid raised
colour for popovers, tooltips, toasts and dialogs, and the accent you pick (with a deeper ink of it for text and icons
on light), which also lights the window faintly from the top. Type is Inter (embedded, SIL Open Font License, so every
system reads alike): a seven-step scale around 13 px, with small spaced capitals for labels. A 2/4 px spacing grid,
radii from 6 to 20, three shadows and three durations. Buttons (primary, secondary, ghost, danger), segmented
controls, chips, cards, rows, switches and sliders share them, with hover, pressed, disabled and a focus ring for the
keyboard. Every icon is one inline SVG family (`js/icons.js`): a 16-unit grid, a 1.5 stroke, round caps and joins; the
places to play are drawn in blocks, everything else in line, and each power-up, wildcard and Settings section has its
own — never a font glyph, never an emoji.

The board is one composed unit: a raised plate holding the well — a recessed tray a little larger than the grid, light
falling in from above, a shadow under its top edge and a fine rim — with Hold and Next in trays of the same material
beside it (above it, when the window is tall and narrow; puzzles without a hold slot give the room to the grid). The
still parts of the well are painted once into offscreen layers, so a frame is a couple of images plus the pieces.
Under the plate, and as wide as it, the status bar shows the board's figures as small labels over their values, and
the item bar is one recessed track with a segment per power-up type. Text everywhere is plain labels: what a thing is
and its number, no prose.

**Achievements** — 105 quiet milestones that pay ⦵ lines, in their own tab: a small toast when one is earned, nothing
more (one earned in the background, by the factory or the once-a-minute check, or while rolled up, is told when you
come back, not chimed from a hidden window). The toast is a button: a click (or Enter once it has focus) opens the tab on
that achievement — the filter set to show it, its group open, the row scrolled into the middle of the list and lit for
a moment (held still under reduced motion); "N achievements while you were away" opens the tab at Recent. Pointed at, a
toast waits (up to twice its time); focused, it waits. With mouse control on a live board a click is a drop, so there a
toast takes the pointer only once it has rested on it a moment; with a dialog open it lets clicks through. Other toasts
are only notes. The tab opens on three figures (Earned 12 / 105, Lines earned, Lines available) and folds them into Free Play,
Classic, Puzzles, Lifetime and Factory (each header keeps its count, a bar and lines earned / available; each row its
name, a plain description such as "Clear 4 lines with one piece. No power-ups on the board.", its pay and the date
earned), easiest first, with a filter for all, to do or earned; the slow ones show their progress. Left of the filter,
Recent: the latest earned (its icon and name; *Latest*, then the star alone, as the window narrows) goes to it, and its chevron lists the
last six, newest first, with how long ago (`now`, `12 min`, `5 h`, `3 d`, then the date); it is not there until one is
earned. The toast, Recent and its list all go through one function (`UI.showAchievement`). Each place has its own quiet colour and its tab's icon — Free Play sea-glass teal, Classic handheld olive, Puzzles orchid, Factory copper, Lifetime a neutral slate (`--area-*` in `lull.css`, deep inks in light, each at least 4.5:1 on its tint, apart from the accent and the gold for colour-blind eyes too) — on the group's header and bar, each row's badge, bar and pay, Recent and the toast; a legendary one stays gold (`--gold-ink` for its words), with a dot of its place's colour. None is a
gimme — the easiest is a quad with no power-ups on the board (15 ⦵) — and 150 pieces of ordinary play earn nothing new, nor do 150 with a
few items used along the way (a test plays both, at a relaxed piece every three seconds).

*Free Play has no clock and a bag of power-ups*, so nearly anything there could be bought or waited out (an Order
Slip for every I, a laser for every row, a Settle for every perfect clear, Rewind for every slip). So its skill ones
say **no power-ups on the board**: no power-up that touches the pieces or the board — Rewind included — during the
feat, nor since the board was last empty (an empty board, however it got that way, is a fresh start; Luck never counts
against it, and one taken back before its piece is set never happened). Each description says it in those words; the
exact rule is said once, in the (i) beside the Free Play header. (The code calls this play *by hand*.) Its score ones
need a board that never used a power-up at all; two ask for pace — the last hundred pieces set with no power-ups on
the board, on the wall clock, clearing 36 lines (Allegro,
within three minutes; Presto, ninety seconds); and the streaks that are really about keeping up have Classic versions under
gravity (eight back-to-back, four tetrises in a row, a 15-combo). Hover the Chain in the status bar to see whether
there are power-ups on the board (and the chain without them); a board's summary shows its best chain and its best
with no power-ups on the board. Three are for playing with power-ups on purpose: three different power-up combos on
one board (Showman), a board of 60 blocks or more emptied by one power-up (Clean Sweep), and every combo found
(Tinkerer).

Medium ones (100–300 ⦵): a perfect clear with no power-ups on the board, a T-spin Mini double, a 10-combo, a T-spin triple on gold, four quads in a row, Allegro,
the perfect-clear opener (within a fresh board's first ten pieces, no items), Showman; a Hard puzzle first try
without hints or undo, all three Dailies on their day, or a quad, a tetris and a Hard puzzle in one day; every
hexomino or 1,000 lines off the factory line. Hard ones (300–800 ⦵): eight back-to-back, three perfect clears,
100 line-clearing T-spins (all with no power-ups on the board), 250,000 points never using a power-up, Clean Sweep, Tinkerer, forty lines in a
fresh board's first hundred pieces with nothing left over, every item used; in Classic a perfect clear, a T-spin
triple, a 10-combo, eight back-to-back, level 10 without hold, 40 lines in 90 s or 40 lines of tetrises alone; a Hard
puzzle first try in under 20 s, twenty first-try solves in a row, 100 Hard puzzles; 100,000 lines in all, 30 days
played. Thirty-two are legendary (800–5,000 ⦵): a chain of 20 with no power-ups on the board, Presto, a perfect clear with a T-spin, ten
quads in a row, five gold clears on a chain of 20, ten perfect clears or 5,000 lines on one board, a million
without items; Classic level 25, a 15-combo, 40 lines in 50 s, level 20 without hold, a Classic million; every
wildcard on Hard, a Daily thirty days in a row, a hundred first-try solves in a row; a hundred hours or a hundred days
with Lull, everything the shop sells, a million lines earned (rewound lines aside, since a rewound clear replayed would count
twice); all 108 heptominoes or 100,000 minos
pressed — and *Lull*, every other one. They read the stats below plus a few kept for them: the
board's hand counts (`freshStats` in `js/engine.js`: whether there are power-ups on the board, and the back-to-back,
combo, quads in a row, chain, line-clearing T-spins, T-spin triples and perfect clears without them, gold clears on a
chain of 20, and the last 101 such pieces' times), Classic's own clock (running time only), undos per puzzle, runs of first-try solves (a retry, hint,
fail, skipped or abandoned puzzle ends one) and of Dailies on consecutive dates (each solved on its day), Hard solves per wildcard, days played (a day counts once you
play in front, not when the factory runs alone), Classic games (one counts once it has run a minute or cleared ten
lines, so a quick restart is not a game), and the
day log's quad (set by a piece: a laser or a Tornado is not one) / tetris / Hard puzzle / Dailies. Lifetime ones are also checked once a minute.

**Stats** — lines by source and day (play, combos, puzzles …), combos found, clears, T-spins, combos, pieces per minute, inputs per piece, puzzle solves
and first-try rates by difficulty and wildcard, factory output and shapes pressed, power-ups bought, given and used, time by mode.

## Keys

| | |
|---|---|
| ← → | move |
| ↓ | lower one row; on the stack, a fresh press sets the piece (holding never does) |
| Space | hard drop (for 0.18 s after a piece is set, Space, a click and the ↓ that sets are ignored, so a double press never drops the next piece unseen; moving and turning still work, and Classic's gravity never waits) |
| ↑ / X, Z, A | turn clockwise, counter-clockwise, 180° |
| C / Shift | hold; again to swap back (Free Play and Puzzles: as often as you like). On the Factory tab, C collects the bin |
| ⌫ / U, R, N, H | undo, retry, next puzzle, hint |
| ⌘1–⌘7, ⌘, | tabs (⌘7 the Shop), settings |
| ⌘J | collapse into the title bar, or expand (so does a double-click on the empty bar) |
| P | pause Classic |
| M | mute everything, on any tab (again to unmute) |
| mouse: point | slide the piece left and right (at its height; slightly sticky at column edges: the pointer goes 0.15 of a cell past one before the piece follows; mirrored under Inverted Controls; keys keep working while the pointer rests there) |
| left click | drop it straight down — anywhere on the board side (a slip into the next column in the last 0.06 s before the click is ignored) |
| right click | turn clockwise |
| wheel | lower one row (never sets the piece) |
| click HOLD | hold, or swap back |

**Window** — the panel floats over every Space, full-screen apps included: it never activates Lull (activating a regular app pulls the screen back to its own Space), so ⌥⌘L shows it right over whatever is in front and hands it the keyboard. When the pointer leaves, Lull dims and fades to 60% (Settings ▸ Window ▸ Fade when the pointer leaves); it comes back as soon as the pointer does.

**Collapse** — the chevron, ⌘J or a double-click on the empty bar rolls Lull up into its title bar, where a parade of
pieces falls along it (`js/collapse.js`): the bar is a well on its side, four lanes deep, and pieces come in from the
left and travel smoothly to the right, each in its own SRS orientation and at its own speed — a game gravity level on
the Classic curve, mostly Level 1–2 drifters (about a cell a second), some Level 3–5 walkers and now and then a Level
7–9 dart — and nobody ever slows down. Lanes and turns are the game's: a whole lane at a time, or a true SRS turn (the
kicks that keep its column), and instant, as on the board. Since speeds are steady, every meeting is known ahead: two
pieces side by side along the bar take opposite bands of two lanes, lying flat, and they agree which when the later one
comes in, then both set off for them 2.2 s early (far ahead of a dart, close ahead of a drifter), a move every 0.14 s —
the faster one moves over, the slower one steps aside, whichever is fewer moves. A piece changes band only with nobody
beside it, and a new piece comes in only when every meeting on its way can be agreed like that (a dart that finds no
way in keeps its turn for 3 s), so there is always a way past and nothing ever overlaps, lands or stacks; pieces
sharing a lane keep a clear cell between them. Free ones hop a lane or turn now and then, just because. A new piece
comes in once the last is 5 to 13 cells along, so the parade flows on without crowding or empty stretches. Behind each
one a steady rain of mirrored glyphs in its colour streams back: born continuously at the rear of each of its lanes
(more the faster it goes), drifting gently back and fading over 2.2 to 3 s, brightest at the head — some six cells
behind a drifter, twenty-five behind a dart; a third of them change character now and then, in a slow cross-fade (a
pool of 512 glyphs, drawn from one small atlas per colour). Nothing is drawn under them — no track, no lanes — and they
are your palette and skin, softened, each cell a device-resolution sprite at its exact sub-pixel place; each fades in
at the left and fades out before the expand button. The logic runs on a fixed 60 Hz tick of bar time (the same at any
frame rate); the drawing comes every display frame, paced to whole frames so the travel is even, stops while hidden,
and holds one still frame with no rain under reduced motion. Classic pauses, the factory runs on. Collapsed, it
resizes only sideways (dragging the edge, the pieces keep their places and travel on, and meetings a wider bar brings
are agreed then), and it opens back to the height it had, across launches too.

**Mute** — the speaker in the title bar (between the wallet and Settings, on every tab), M, or Settings ▸ Sound ▸ Mute:
one switch, kept in sync everywhere and saved. It ramps a gain that sits after everything else to zero in 50 ms, so
effects, Classic music (notes already ringing too), the announcer, factory sounds and Listen previews all fall silent
at once without a click; the Sound effects, Classic music and Announcer toggles and every volume are left as they
were, so unmuting brings back exactly what you had. Muted, the speaker shows a small cross in a soft amber wash. M works
over open windows too (never while typing in a text field), and Listen says it is muted rather than playing nothing.

**Control hints** — when a control seems to be missing, one small pill low on the board shows its key and a word or
two (`↓ turns`, `Z turns the other way`, `Right-click turns`), in the words of the device in use, and fades after
four seconds. What counts as struggling, read from real input (`js/hints.js`):

| Hint | Shown after |
|---|---|
| the arrow that turns (`↓ turns`) | Up pressed on an Upside Down board 3 times (Sideways: 5, Up moves there) before the piece turned by any means; an Up that set the piece counts twice. Never on Rigid |
| `Z turns the other way` | three quick clockwise turns on one piece (under 1.5 s apart), twice |
| `Space drops · ↓ lowers` (`Click to drop`) | Free Play or Puzzles: a piece moved, then left floating 7 s with the window in front |
| `↓ lowers, then slide` (`Wheel lowers`) | three fresh presses into a block the piece would clear lower down (never a wall); with the mouse, 15 clicked pieces never lowered |
| `C holds` (`Click HOLD to swap`) | a Hold puzzle failed, or retried two pieces in, without holding once |
| `← → swapped` | Inverted Controls: three fresh presses into a wall the piece could leave the other way |
| `← → move · ↑ turns` | four keys that do nothing on a board within 8 s (WASD, say) |
| `Right-click turns` | eight clicked pieces in a row never turned, or two clicked pieces undone or rewound within 5 s |

Never two at once: a hint waits for a calm moment (no card or window open; in Classic only paused, before it starts,
or at level 4 or lower with the stack at most 5 high) and gives up after 15 s; 45 s between any two, 4 minutes before
the same one again, and each is shown at most twice. They retire for good: each once its control has been used
successfully a few times (4 turns on a turned board, 3 turns with Z or A, 3 pieces set, 4 pieces lowered, 3 holds, 8
moves under Inverted Controls, 12 arrow moves or turns, 3 right-click turns), and all of them after 300 pieces or two
hours on the boards, whichever comes first — about an hour of relaxed play, by when every basic control has come up
dozens of times; the two hours catch the player who mostly thinks rather than places. Settings ▸
Controls ▸ Control hints turns them off sooner.

Every item on the bar explains itself on hover. Repeat delay (230 ms) and rate, preview length, sound, effects, background, theme and accent are in Settings.

## Build and run

```sh
Lull/scripts/make-app.sh      # macOS 14+, Xcode 15+: builds Lull/build/Lull.app
open Lull/build/Lull.app
cd Lull && swift run          # the same, straight from the package

open Lull/Game/index.html     # any browser, any OS (saves to localStorage)

node Lull/scripts/test.cjs            # game logic: 750 puzzles replayed through the engine, turns, items, factory, board library, save
node Lull/scripts/browser-test.cjs    # the page played in headless Chromium (needs Playwright)
node Lull/scripts/audio-render.cjs out/   # every sound and a minute of music rendered offline: WAVs, peak, loudness, brightness
node Lull/scripts/audio-render.cjs out/ --harmony   # every pack's pitched sounds in every section: notes found, share in its key, A/B mixes
```

A packaged build is committed by CI to [`dist/Lull.app.zip`](../dist/). It is ad-hoc signed: right-click ▸ Open the
first time. The save lives in `~/Library/Application Support/Lull/save.json` (Settings ▸ Export copies it).

## Layout

| Path | |
|---|---|
| `Game/` | the game: `index.html`, `css/`, and `js/` — `icons` (the one SVG icon set), `pieces` (SRS tetrominoes, pentominoes, big and custom shapes, polyomino enumeration), `board`, `engine` (the floating-piece rules and every item), `items` (the chain multiplier, combos, Luck, the daily gift, power-ups earned in play), `library` (the Relaxed board library: shelved and retired boards, names, caps), `puzzlegen` (seeds, wildcards, reverse construction, reachability search, forward verification), `factory` (presses, the belt, the bin, one step for play and time away, save repair), `store` (save, catalog, stats), `achievements`, `fxphysics` (the item effects' blocks, debris and dust: gravity, bounces, spirals, fixed pools), `render` (canvas: skins, frames, effects, item animations, rotated views), `factoryview` (the factory floor, drawn like the board), `hints` (control hints: the struggle signals, their limits and retirement), `collapse` (the window rolled up into its title bar, and the parade of pieces along it), `modes`, `ui`, `app` |
| `Sources/Lull/` | the macOS shell: a borderless `NSPanel` (floating, all Spaces, edge-resizable, draggable by the page's title bar) around a transparent `WKWebView`, a blur for the Glass background, the save file, the ⌥⌘L hot key, and a self-test CI runs |
| `scripts/` | `make-app.sh`, `icon.swift`, `line-glyph.py` (builds the line glyph's font into `lull.css`), `test.cjs`, `browser-test.cjs`, `audio-render.cjs` (renders and measures the synthesized audio offline), `pitch.cjs` (finds the notes in a render, to check sound effects are in the music's key), `splice-voice.py` (cuts the announcer's lines from a recording) |

## Credits

The Classic announcer's lines are cut from the announcer of *Tetris Worlds* (2001); that recording belongs to its
rights holders (The Tetris Company / THQ) and is not covered by this project's terms.
Korobeiniki is a 19th-century folk song in the public
domain. The interface face is Inter by Rasmus Andersson (SIL Open Font License 1.1), embedded in `css/lull.css`.
