# Lull

A floating window of low-stakes blocks, for the minutes between real work. Pieces never fall on their own: move them,
turn them, lower them a row at a time, and set them when you are ready — or walk away mid-piece and come back
tomorrow. Nothing is timed and nothing is lost.

On macOS it is a borderless, resizable panel that floats above other apps (and every Space), with a clear, glass,
tinted or solid background inside a distinct border. ⌥⌘L shows and hides it from anywhere; Esc tucks it away. The
same game runs in any browser from `Game/index.html`, and on iPhone and iPad from the Home Screen, offline
([iPhone and iPad](#iphone-and-ipad)).

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
pay past eight in a row and stops at ×2.5 (twenty in a row) — a quad on a full streak pays 12.5 (pay is kept to the hundredth, rounded down). The *chain* — the streak
plus the combo, the number to be proud of — is counted apart and shown beside the multiplier (`Chain 16 · ×1.75`).
A piece that has no room where it appears (a new one, one swapped in from hold, or one an item makes) is fitted into the nearest open spot above the stack it could get to — beside a tall column, stood on end, in another turn — never down inside the stack. Only when it fits nowhere is the board full; a hold swap or an item with no room is just refused (a short note says so, nothing is used up).
A full board just ends that board; the lines stay yours. Its Board full card shows the board's numbers (they scroll on
a short screen, the cut edge fading while there is more; the buttons always show) with Undo — there whenever a placement
can be taken back, with how many Undos you hold or its price, paid as in Puzzles: one held is used, with none one is
bought for 5 ⦵ and used at once, short of lines a note says Not enough lines — then Boards and Retire. An Undo also
takes back what that placement banked, so buying one needs the 5 and those lines (the wallet never goes below 0); and
like a set piece, an Undo that closes a card starts the set grace, so a double click does not drop the piece it
brought back. The ⦵ glyph is a cleared line running into a small black hole; in the wallet it is drawn large, a dark disc in a thin glowing ring. Everywhere else it is one character, `L.LINE` (U+29B5, never an emoji), drawn by a one-glyph font of the page's own (`scripts/line-glyph.py`) that is first in every font list and in the canvas fonts, so text, prices, toasts and the boards all show the same shape. Retiring a board (Boards ▸ Retire, or Retire when it fills up) shows its whole life: how long it
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
there, as when the piece sets), and the Undo history stays behind, as it does across a reload. New board shelves the
one in play and starts an empty board with its own seed (never the old board's queue); it is off when the library
holds 12 (it says Library full; retire or delete one).
New board first asks for a size (below); on a board nothing has been done on (no piece set, no power-up used: gold,
a net or a Giant waiting there is never thrown away), Create makes that board again at the
size chosen, in its own record, rather than shelving an empty one (so New board is on for it, and even with 12 saved). Each row has Rename (inline:
Enter keeps it, Esc leaves it, a click elsewhere keeps it and still lands; up to 24 characters, never empty or
invisible; a name another board has gets a number, "Rainy Sunday 2"), Retire (only a board that was played: its summary, then
it moves to Retired; the one in play is replaced by a new board) and Delete (asks first; nothing is kept). New boards
get a calm two-word name no other board has (Mossy Harbor, Quiet Orchard), then Board N.

*Sizes* — a board is any size from 4 × 8 to 20 × 40, chosen when it is made and fixed for its life. New board opens a
small window: Width and Height steppers (− and +; on the number, ↑ ↓, Page Up / Down by 5, Home and End; 44 px targets
by touch) beside the empty well drawn at that size, always on top; under them four tabs, Size, Shapes, Modifiers and
Mode (see [Board options](#board-options)), the Size tab holding four presets (Small 6 × 12, Standard 10 × 20, Tall 8 × 30, Wide 16 × 16), and Create (Enter, except on a button: that button, so Cancel is Cancel; a − or + at the limit
keeps focus and does nothing, and the new size is read out after a button or a preset). It opens on the size last
chosen (`boards.size` in the save; Standard at first). A board made
without asking — Retire on a full board's card, Retire or Delete of the board in play — is the size of the one it
replaces. Four wide is the flat I; eight tall is a Giant I on end; nothing in the engine assumes 10 × 20 (pieces spawn
centred at the top, a piece or item with no room is refused as always). The size is saved with the board
(`Game.toJSON`, the shelved and retired records), shown on every library row and record (`12 × 24` first, then the time; up to 440 px wide the size and time
share the tags' line and Lines and Score take their own, so neither is cut; and a Size tile in
the summary) and in Stats ▸ Free Play ▸ Past boards; a save edited to a size no board can have is not resumed. On
screen a board is fitted and centred like any other, its cells never more than 1.4 times a Standard board's in the
same space (a 4 × 8 board is a small board, not a few giant blocks), and Hold and Next keep a readable width however
small the cells of a tall board get; the library's thumbnails fit any size into a Standard one's box. At any size,
Trapdoor and Settle (like Tornado and Mirror World) are refused, "No room. Move the piece first", when a block would
come down into the piece in play, and words over the board (PERFECT CLEAR, a combo's name) fit the well (two lines,
then smaller). A board full with a piece wider than the board keeps it inside the walls (turned upright), and a control
hint wider than the well goes under, over or beside the plate instead.

*Pay per cell* — a Standard line is ten cells, so a line cleared on a board w wide is worth w/10 of one: half on a board
5 wide, two on one 20 wide; height changes nothing. `Library.scale(w)` is the one place that says so, and every reward
goes through it: a clear's pay, combos' lines, the power-up every hundred lines (Standard lines), lifetime Lines and
Best lines (Stats and the achievements' progress), Efficiency, and the line-count and pace achievements. What a clear
pays is `Pay` in js/items.js, all of it in Standard lines, so no size earns faster per piece than Standard: the
difficult-clear bonus is at most one Standard line (a board has one T a bag however wide it is); the streak's links
count by width, never more than one a clear (a narrow board makes difficult clears more often, each clearing fewer
cells), so the multiplier climbs per cell cleared; gold and a boost last for Standard clears (a Golden Piece is five
Standard-width clears: two and a half on a board 20 wide, twelve and a half on one 4 wide, the last paying its share;
Gold on the status bar counts the clears left on this board); and a won Double or Nothing adds at most one Standard
clear's worth. Pay is rounded down to the hundredth (`Library.bank`); the wallet and its totals keep hundredths (never drifting) and the
wallet shows whole lines, while "+2.5" on the board, a combo's callout and Lines banked show the hundredths. What stays
as cleared: the board's own Lines and every per-board figure (the status bar, the rows, the summary's Lines, Past
boards), clears by size, T-spin lines and the score. On a board narrower than Standard a quad takes three pieces, a
flat I on an empty board is a perfect clear and combos never end, so the Free Play feats (quads, streaks, combos,
chains, T-spins, perfect clears, score, Showman) count only on boards 10 wide or more, as do Painted Row and the
Triathlon's quad; the line counts, pace, Clean Sweep (60 blocks, six rows' worth when wider), Toolbox, Tried
Everything, Tinkerer and Old Growth count on any board. The Free Play group's note in Achievements says this. Retired keeps up to 50 read-only
records, newest first — name, started and retired dates, the final stack, the pieces it ended with (the one in play, the
held one and the first six of the queue) and the whole summary — and past 50 the oldest
goes (the Retire card says so). A record opens with a click and can be deleted.
*Full view* — a retired board can be looked at whole (`js/retiredview.js`): View on its row (or a click or tap on its
thumbnail) or View in its record. Its final stack is drawn at play size where the board in play is, by the same board
view (palette, skin, frame, backdrop, the Hold and Next trays), at its own size (a 4 × 40 or a 20 × 8 as it was);
a board retired full shows the piece that could not come in, drawn as the Board full card shows it and outlined in
the theme's red, so it stands apart from the stack it lies over. There is no ghost
and nothing moves. The status bar's place says its name, when it was retired and why (Full, or Retired by hand), with
Summary (its record's dates and numbers, in a window over it) and Back; the item bar's place has Previous, where it is
("2 of 7") and Next, through the retired boards in the list's order, stopping at either end (← and → too, or a swipe
sideways on the board by touch). Back, Esc or a click outside returns to where it was opened, focus on the View that
opened it, and the board in play is exactly as it was: the view is a window over the play view, which is only hidden
meanwhile, so no key, click, touch or power-up reaches it, and nothing is played, paid, counted, timed (its play time
waits) or saved differently. To a screen reader it is a dialog named "Retired board:" and the board's name; the board
is an image described by its name, size and why it was retired, and a step reads out the new name and place. A kept piece in a turn no piece has (a broken or hand-edited save) is
left out of its record; a record that still cannot be drawn does not open, and one that fails to draw closes the view. Retiring or deleting the board in play
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
score. The well's top row is a row like any other: every piece appears with its top in it (the I too), a piece touching
the ceiling still touches it after a turn (the space above the well counts as open, so a T turned flat against the
ceiling is no T-spin), and the game ends only when a new piece cannot appear right where it
appears (no nearby spot is tried). Then it tops out the classic way: that piece sets where it is, over the stack, and
the next three from the queue appear one after another at the same spot (about 0.4 s apart, each with a soft set
sound), each over the last, see-through where they overlap and traced round their outlines, each outline a step inside the
one before so the layers show in any palette; then the game over sound,
the announcer and the card, the pile still behind it. Nothing counts any more by then (score, lines, best and stats
are final and saved at the top out); Space or a tap skips to the card, pausing or leaving ends it there, and under
reduced motion the pile is all there at once. Lines you clear still bank as ⦵, multiplied by the back-to-back streak — ×0.5 for each tetris or T-spin in a
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
same seed is the same puzzle for everyone, so it can be shared, replayed or retried (R) as often as you like (Retry is
free). Undo takes back the last piece for one Undo, the power-up shared with Free Play: one you hold is used, and with
none it buys one for its price, 5 ⦵ (the one price of an Undo, everywhere), and uses it at once (the price is on the button, so it never asks; short of lines, a
note says Not enough lines and nothing changes). Only an undo that happens is paid for, once — ⌫, U or ⌘Z held down
undo once. Every puzzle is built backwards from a solution — rows are filled solid, pieces are lifted out only where they
could have been flown in and set, and the result is played forward on the real rules before it is kept — so every seed
is solvable, and Hard ones need tucks and spins. Goals: clear the board, clear N lines over bedrock, or clear the gems.
Every puzzle takes every piece: the board and the lines hold exactly the pieces' cells, and one gem sits in a row only the
last piece completes, kept only when an exhaustive search (every move the engine allows, every order a Hold slot
allows, pruned by counting the holes the gem rows still need) proves no fewer pieces take every gem; a search that
gives up counts as a shortcut. A gem seed that runs out of tries settles for a lines puzzle on its last board.
Solving pays lines (more on the first try, double for the Daily). Dailies are the same in every copy of Lull: day
numbers run through a fixed, keyed shuffle of all 2³² seeds per difficulty, so every date has one seed and every seed
belongs to exactly one date (hover a seed, or press and hold it, to see which). That is 4,294,967,296 seeds per difficulty, 12,884,901,888 in all. History lists every puzzle you opened — solved or
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
| Big Minos | some pieces are twice the size, each block 2×2 cells, moving one cell at a time: usually one or two among ordinary tetrominoes, sometimes about half, now and then all or nearly all (on Hard a tetromino still comes first); the chip says whether some or every piece is big. A big piece usually comes late in the queue, so the pieces before it have to keep its space open; the queue draws them to the same scale as the tetrominoes, so they look twice the size. No gems on Hard |
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
| Both Ways | only on `S` seeds, never with Rigid or Heavy: a spot needs Z (the other turn: counter-clockwise, clockwise under Inverted Controls) or A (half turn) |

The tab reads top to bottom: a slim bar (difficulty; Daily, pressed while today's is in play and ticked once it is
solved; Seed; History — icons alone in a narrow window), then the puzzle's card — its name (a small tick once solved), where it
comes from (number, Daily date or seed) and piece count, the seed (click to copy) and the star; the goal with how far along
it is (lines, gems or blocks left, and a thin meter); a chip per wildcard, each with its own icon (hover, or click for a
note that stays; Both Ways is tinted and names Z and A) — then the board, and a bar of Undo (with how many Undos you hold, or its price), Retry, Hint (with its price, or *free*
while the daily gift's free hint is held — a free hint goes before lines and still halves the reward) and
Skip, which turns into Next once solved. Every row has a fixed height and chips shorten (then drop to icons) rather
than wrap, so no puzzle and no state moves the board. Solving brings a small card with the time, tries and pay; a
board that runs out shows how far it got, with Undo (its count or price, paid the same way) and Retry (on a phone as
small as 320 × 568 both cards tighten so their buttons show: a smaller ring, and Solved without its tick). Play a seed reads a seed as it is typed (difficulty,
both ways, solved, which Daily) and refuses a bad one in place; History has counts on its tabs and marks the puzzle in
play. History, and Stats ▸ Puzzles, end with one quiet line — "37 of 12,884,901,888 puzzles solved" (doubled with
Counter-clockwise puzzles on); each difficulty button's tooltip gives its own share of 4,294,967,296.

**Factory** — a slow production chain: minos are stamped, stored, assembled, shipped and collected. Up to four
stamp heads each stamp a raw grey mino every 100 s (36 an hour) onto a top belt, which rolls them into the store (27
minos wide, 4, 8 or 12 rows: 108, 216, 324). Up to four presses (tetromino, pentomino, hexomino, heptomino) each
assemble one piece every ten minutes, a mino at a time: each mino is fed from the store down the press's own tube
(first come, first served; a press waits while the store is empty), then set in the piece's colour. A finished piece
drops onto the belt, which carries it to the shipping corridor on the right; there it slides onto the conveyor, rides up
it lying flat to the station at the top (a slow ride, 80 s, so the conveyor mostly carries something), and its minos
go one by one up the chute and into the crate (the collector) that hangs across the top of the corridor. Every four
minos in the crate are one ⦵ line — a quarter line per mino shipped, never more. The line runs as fast as its slower
end: 6 lines an hour with one head and one press; building in the natural order (a press, a head, a press …) gives 9,
13.5, 18, 22.5, 27 and 33 with four of each (every factory figure is a decimal, to the quarter line; Lines / hour's
tooltip gives both ends, "Stampers make 36 minos an hour" and "Presses use 54 minos an hour"). The crate is 4 columns
by 12 rows (48 minos, 12 lines); each bigger crate adds two columns and some rows: 6 × 16 (24 lines), 8 × 24 (48),
10 × 32 (80), 12 × 40 (120). Nothing is ever lost: when the crate cannot take the next piece, the lift stops, the belt
backs up behind it, the presses hold their finished pieces, the store fills, the top belt packs and the heads hold —
calmly, all the way back — until you Collect (the button, a click on the crate, or C), which banks every whole line
(the first minos in, four at a time, so where the width is not a multiple of four a line can end partway along a row)
and leaves the last 0–3 loose (every crate holds whole lines, so a full one empties); a ship follows within the
minute. Four things to build, in the chain's order: stamp heads (100, 300, 800 ⦵), a bigger store (120, 400 ⦵),
presses (150, 450, 1,200 ⦵) and bigger crates (60, 200, 500, 1,000 ⦵); every number lives in one frozen block,
`Factory.TUNE` in `js/factory.js`.

The model moves in quarter-second ticks on an integer clock (whole milliseconds), downstream first — the lift, the
belt, the presses, the top belt, the heads — so a place freed early in a tick is taken in the same tick. On screen and
for time away it is the same run: any slicing of the same time gives exactly the same line. Time away is replayed on
return (up to 30 days; once a tick changes nothing the chain is at rest, and the rest of the time is only counted as
time the crate was full). On the Factory tab the new minos just fade into the store and the crate; elsewhere a toast
gives the lines made ("While you were away: 12.5 lines · Crate full").

The tab reads like Play: the floor on the board's own plate, a bar under it (Lines / hour, Lines in crate, Full in, and
Collect at the right), and the things to build below, from the top of the window like the other tabs. The plate's cell
size follows its width, and the scene takes the room the bar and the list leave: as many cells high as fit (a quarter
cell at a time, 23 to 84), so it fills the window at every stage, and each purchase that takes an entry off the list
gives the scene that entry's height at once (the plate never animates its size). The list is a column of rows where the
room holds its rows beside a scene at least 27 cells high, else a grid of two by two cards; a window too short for a
scene 23 cells high at the width's cell size takes a smaller cell, with a plate its own width, centred, rather than
empty strips either side. A phone on its side shows the whole plate at the height it has and scrolls the rest. What a
taller scene gains goes to real parts, never to empty floor: on the left the store's slots grow while its rack stays
within a fifth of the plate (so an empty store is never the biggest thing on it), and the machinery takes the rest —
the stamp heads hang lower (a cell and a half at most), the drop to the belt grows (a cell at most) and the presses hang
lower from the gantry on longer tubes — up to twelve cells, past which the store's slots grow again (three floor cells
at most); on the right the collector takes about a third of the column (bigger slots) and the conveyor the rest
(longer). The floor is a small scene in the board's materials, your skin and palette, with no text on
it. Down the left, three tiers: the stamp heads on their beam over the top belt, each die filling with its next raw
mino; the store below it, a tray between two walls, its minos landing row by row from the floor, left to right; under
the store's floor — which is the gantry beam — the presses, each in a bay sized to its pieces (a mold window one cell
wider than its longest shape), a raw mino dropping down its tube from a hatch in the beam as the store's last cell
shrinks away, and taking the piece's colour from its bottom up as the ram sets it; a piece drops straight down onto a
belt of 28 cells. On the right, the shipping corridor: a broad conveyor from the belt's end up to its head rail, the
pieces riding up it lying flat on cleats, its treads shallow chevrons pointing up the way it runs (they run while it
is empty too, and stop only while its head waits under a full collector); the collector hung across the corridor's
top, standing on the head rail; and at the station under it, each piece's minos leave one by one (0.3 s apart), along
their row into the mouth of the chute cut into the corridor's right post, up it at a steady pace (about nine cells a
second, its dots moving with them) and over the collector's rim into their slots. The store and the
collector keep their room at every size: a bigger size packs its minos into smaller slots (the biggest slot in whole
device pixels that fits, never over three floor cells in the store or one and a half in the collector, and of those the
packing with the fewest empty slots, then the widest; one that would leave a lone slot or two in its top row gives way to
a tidy one a pixel or two smaller), so neither ever takes the other parts' room; the store's grid fills its tray from
its rim to the beam (a bigger store takes more of the column, and the machinery under it hangs shorter). Every tray is
a rack: a pale shelf with a faint square for every slot it has (in dark, a shelf lighter than the plate with a lighter
hairline square for each slot, never a darker hole), a slim line over its top row of slots, and a dark well under the rows that hold minos (a row begun counts), so a
nearly empty store or a collector just emptied reads as shelving waiting to be filled, never a dark hole, and what it
holds is plain at a glance. They always show every mino they hold as a mino — never a bar, never panned: slots in
whole device pixels, at least 3 (under 8 device pixels a mino is a flat square with a pixel's gap; only a 1x screen at
the smallest scenes goes under 3). Waiting is shown calmly, nothing blinks: warm means backed up (a full crate's rim and the piece at the station,
the head of the belt, a press holding its piece, a full store's rim and the top belt's head, a head holding its mino; these stay warm while presses draw on the full
store, rather than lifting for the moment each next mino rolls in),
muted means short of minos (a press's lamp dims, the next mino it waits for is a dashed outline, and its hatch has a
dim ring). Pointing at the crate (or Collect) washes what it takes, a step where a line ends partway along a row.
Collected lines lift out of the crate's open top and clear away, the loose minos riding up on them and then dropping to
the bottom; the lines fly to the wallet, which counts them (and any achievement the collect earned) as they land. The
floor's parts are buttons (in the chain's order): a head or the store points to its entry in the list, the next head
or bay builds, a press opens its mold — pin it to one shape (free; pay never changes) and fill in Stats ▸ Factory's
shape sets — and the crate collects. Stats ▸ Factory counts minos shipped and stamped, the time the crate was full and
the time the presses were short of minos.

**Power-ups** (items, in the code) — single-use, in five types on the bar under the Relaxed board. A type's button
(with how many you hold) opens its tray; click one to use it (Esc closes the tray). There are no number keys for them.
Hover one for what it does. They are bought right there, never in the Shop: one you have none of shows its price, and
clicking it asks once (its name and a Buy & use button with the price) — dimmed when the wallet is short.

| Type | Power-ups (price ⦵, rarity) |
|---|---|
| Shapers | Reroll (15, common: a different piece), Mirror (15, common: J and L, S and Z swap), Pebble (20, common: a single block), Noodle (25, uncommon: a six-long rod), Giant (30, uncommon: twice the size), Blueprint (100, rare: draw your own, up to six blocks) |
| Choice | Pick of Three (20, common: play one of the next three now; this piece takes its place in line), Best Fit (45, uncommon: the piece becomes whichever of the seven fits the stack best, right over its spot), Order Slip (35, rare: choose the piece in play) |
| Tools | Patch (20, common: one block that drops into the highest covered hole in its column), Ghost (50, uncommon: passes through blocks into the first gap below where it fits), Drill (40, uncommon: bores out its column), Bomb (45, uncommon: clears a 13-block diamond where it lands), Laser (65, rare: clears every row it touches, full or not), Black Hole (90, rare: swallows everything within three blocks) |
| Board | Mirror World (20, common: flips the board left to right), Undo (5, common: takes back the last placement and its lines; one item with Puzzles' Undo, the count shared, and every free one comes as a pack of 5), Trapdoor (40, uncommon: the bottom row falls away, whatever it holds), Tornado (60, rare: shuffles the columns, holes and all), Settle (70, rare: every block falls straight down; full rows clear) |
| Luck | Golden Piece (35, uncommon: the next five clears pay ×3), Double or Nothing (30, uncommon: the next clear pays double if it is a quad or a T-spin, nothing if it is less), Safety Net (60, rare: keeps the back-to-back streak through one ordinary clear) |

Nothing here is about a clock — Free Play has none — so they are about choice and shape: which piece, what it
becomes, what the stack looks like after, what the next clear is worth. Tools and Shapers change the piece in play
(the ghost shows where a Patch, Ghost or Bomb will act); press the same one again before the piece is set and the old
piece, the queue and the item come back. Board items act at once and can be undone (with an Undo). Lines a power-up clears are plain
lines: they pay and keep the combo going, but are never a quad or a T-spin and never add a back-to-back link (a
Tornado only rearranges — every row keeps its count, so it never clears). Every one of them, Luck aside, puts
power-ups on the board for the achievements.

*Getting them.* Bought with lines in the tray; free from the daily gift; and, modestly, from play: one for every hundred
lines cleared on a board (counted in the save, outside the board, so an Undo and a replayed clear never pay twice) and one the first time each combo is ever found. Free ones are drawn by rarity
(common 8, uncommon 3, rare 1), and a free Undo is always 5 of them (bought, it is one at a time, and always for 5 ⦵:
the tray's Buy & use, the Board full card, the puzzle bar and card, the keys and a finger all pay the same).

**Daily gift** — the small wrapped box in the Relaxed tab's status bar glows while a gift is waiting: three different
things, drawn by rarity from the power-ups (an Undo comes as 5) and one puzzle freebie, a free hint (uncommon: one hint
at no cost, which still halves the reward; the Puzzles tab uses it before lines), so nearly six in ten of what it gives
are common, about one in thirteen rare, and one gift in ten holds a free hint. What play earns is power-ups alone. Its
cards say what each is (5 Undos; Hint, with the hint icon). It comes again 24
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
press, the biggest crate, 500 lines collected), marked with a lock and what earns them on hover. A tile says In use, Use (click it, or the tile) or its price, dimmed when you cannot afford it. Buying
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

**Achievements** — 106 quiet milestones that pay ⦵ lines, in their own tab: a small toast when one is earned, nothing
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
Slip for every I, a laser for every row, a Settle for every perfect clear, an Undo for every slip). So its skill ones
say **no power-ups on the board**: no power-up that touches the pieces or the board — Undo included — during the
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
with Lull, everything the shop sells, a million lines earned (undone lines aside, since an undone clear replayed would count
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
and first-try rates by difficulty and wildcard, factory output and shapes pressed, power-ups bought, given and used (and free hints given and used), time by mode.

## Board options

A Relaxed board is made from a *recipe* as well as a size (`js/recipe.js`): its shapes, its modifiers and its mode,
chosen when the board is made and fixed for its life. The default recipe is the board described above, exactly: the
seven in a 7-bag, no modifier, plain play (`scripts/golden.cjs` holds it to a long recorded run, lock by lock). Each
option is a *part* that registers itself: its rules (`Recipe.rules`: what a row is worth, which feats count, which
power-ups are refused and why), its engine hooks (where pieces come from and appear, which cells they cover, where an
item acts and how Tornado shuffles, what clears, what an item may remove, what happens after each piece, and ending the
board its own way: `game.end(kind)`, told after the lock and kept in the save until Undo; how Full Blast and Event
Horizon count what an item took: `comboCount`, or by default one copy's share, `R.copies`, so a Mirror Bomb counts
one half), its view and its window. An
unrated board (shapes other than the seven) has no difficult clears: no quad, no back-to-back streak, no bonus, ×1. Parts always run in a fixed
order (shapes, mirror, jelly, protect, battle), whatever order they load in. What pays and counts is measured in own
cells: a row holding a cell the player never placed is plain and pays only the player's cells, and no option pays more
per piece or per action than a Standard board (`f = min(1, 4 / E)`, E the mean cells a piece). Outside the board,
`Board.get` reads as a wall (`CELL.WALL`); every cell bit has one name in `CELL` (`js/board.js`), and anything that
reads a colour masks with `CELL.COLOR`.

*The New board window* (`PlayMode.openNewBoard`) — the steppers and the well stay on top; under them a tablist of
four tabs (roving focus: ← → Home End; Enter or Space on a tab selects it and never creates), each 44 px tall with its
name and, muted, its short value (Shapes "Normal", Modifiers "Off", "Jelly", "Mirror" or "Both", Mode "Plain"; Size has
none: its value is on the steppers), then one panel the same height on every tab (the tallest panel's at each size; a
taller one scrolls inside itself and the footer stays): Size the presets, Shapes chips in 3 × 2 (a sample beside the
name; in a narrow window the sample shrinks, and at 440 px and under sits above the name; a name keeps its line whole,
never broken inside a word, a long one a size smaller), Modifiers a switch each, Mode the modes and the chosen one's level. It opens on Size with focus on Width, on the
recipe and size last chosen (`boards.recipe`, `boards.size`). The last choice wins (`Recipe.resolve`): an option it
rules out moves to an allowed one, comes back once it is allowed again, and the change is read out (a part names its own
values: `said`); an option the other
choices rule out (`Recipe.conflicts`) stays in its place, off (`aria-disabled`), and a press shows why in one muted
line. The size shown is the one asked for as a board of the recipe can be (`Recipe.clampSize`): a larger minimum raises
it, and going back restores what was asked (a stepper changes only its own side of it). The parts fill the tabs
through `Recipe.uiPart` (chips, a switch, a mode and its levels, a panel of their own, the steppers' names, presets,
Create), so the window's code never changes for them; a panel's control keeps focus through a redraw by its
`data-focus`, and focus never falls out of the window (where Enter is Create). A board of another recipe than the
default says so: after its size and when on its library row (the short label last, so an ellipsis only takes it, the
full one as its tip; Lines and Score on a line of their own; on a phone, the label too), as a Board tile on its summary,
and as a muted second line in Past boards. A part can add tags to its rows (`tags`: Wilted, "vs Steady 3–2"), its
own numbers to a board's summary (`tiles`, from the summary's `ext`), and a name for its own end, which a retired
board's full view says in place of "Retired by hand" (`endName`: Wilted).
Retire, Delete and a full board's Retire start the next board with the same recipe; an untouched board asked for again
with another recipe is made again, in its own record.

*What runs a board* — Free Play asks the board's *controller* at every turn (`plainController` in `js/modes.js` is
today's Free Play exactly; each part can give its own, composed over it in the parts' order by `Recipe.compose`: a hook
a part gives replaces the one before it, reached as `this.base`, while frame, pause, attach, detach, input, onKey,
action, tiles, status and cards gather every part's; a controller's name is `id`): its layout, a clock that
runs only while `canRun()` (the tab in front, no window or card over it, the page shown and the window focused), a pause
when the window loses focus or the pointer leaves it (`app.onAway`), the page is hidden, the tab changes, a window opens
or the window rolls up, whether a second counts as played, what a clear pays, what a lock does, how the board ends
(`onEnd(kind)` and its card), the status figures, the bar under the board, more summary tiles, its own keys (`onKey`) and
actions, and what a mouse aim, a touch, a tap or a click on the board means (a tap or click it takes does nothing else). A recipe's rules can refuse power-ups (shown off in their tray, the
reason as the tip; a press spends nothing and says why), turn off Undo (no history) and the control hints; Reroll and
Order Slip ask the board's dealer. Stats rows come through `UI.statRow`.

*Drawing* (`js/render.js`) — `render()` clears the canvas, then draws the plate and `paint(ctx, box)`: the board unit
laid out in a box (`layout(box)`; the whole canvas for one board). A part's view half (`Recipe.viewPart`) composes:
the first painter whose `claims(v)` is true draws a stored cell, then a `claims: 'rest'` painter the own cells, the
piece, its ghost and the trays, then the plain cell; overlays after the stack, the piece and the rim; `busy` keeps
frames coming; move (a mouse slide's steps too), turn and lock triggers; no red rim; which turn the trays draw and how
long the first Next slot and the Hold box are for a long piece (`traySlot`); how opaque each cell of the piece in play
is (`pieceAlpha`: Mirror's copy); and marks on the New board preview and the library's thumbnails
(`Render.previewBoard`, which draws both). An item that acts at more than one spot (the engine's `targets`) is previewed
and animated at each. With `?freeze=1` every frame is drawn at one
fixed moment (`Render.clock`), for tests that compare pixels: `scripts/recipe-pixels.json` holds the board, an animated
look, the red rim, thumbnails and previews at four window sizes in both themes, recorded from the tree before the
render split, and the drawing now matches it pixel for pixel.

### Shapes
<!-- part:shapes -->

### Mirror
<!-- part:mirror -->

### Jelly
<!-- part:jelly -->

### Protect
A mode: shield a sprout from falling stones and burrowing moles (`js/guard.js`). The sprout sits on the floor in the
middle of the well, 2 wide on an even width and 3 on an odd one, 2 tall, with 3 leaves; the two rows it stands in are
its bed and never clear, no power-up removes it (Drill stops on it, Bomb and Black Hole go round it, Laser leaves the
bed rows) and Settle leaves it where it is. Time is counted in pieces set, never in seconds: after each piece lock (a
tool piece and the Drill too) the guard takes one step, in this order: the moles are read off the board (one a clear
took was swept away); each mole acts (next to the sprout it nibbles a leaf and leaves; boxed in on all four sides by
solid cells that are not stones, your blocks, other moles, the side walls and the floor, it curls up into a stone; out
of patience it wanders off; else it moves a cell along its route, digging through a stone in the level's time); stones
that are due fall, each column onto that column's own top, so a stone never leaves a covered hole, and one that would
land on the sprout breaks there and costs a leaf; moles that are due come in at a side wall, on that column's top (at
most four are out); then the wave or calm moves on. A mole crawls through open cells that touch something solid side
by side (never along the open top of the well), so it climbs faces and floors but cannot round a corner in the open:
your blocks stop it, and it digs only through stones. Settle and Undo take no step (Undo takes the last one back with
the rest), and at 0 leaves the board wilts. Tornado, Trapdoor and Mirror World are refused ("Not in Protect"). A board
is at least 6 × 12, and the shapes must fit in the rows above the bed (a shape set's minimum height plus 2).

| | Easy | Medium | Hard |
|---|---|---|---|
| Quiet start, then wave / calm (pieces) | 12, 24 / 12 | 10, 24 / 10 | 8, 24 / 8 |
| Stones a wave at 10 wide (by w/10) | 2 → 4 | 2 → 4 | 3 → 6 |
| Stone sizes | 1 | 2 wide from wave 4 (40%) | 2 wide from wave 3; 2 × 2 from wave 6 (25%) |
| Warning (pieces) | 3 | 3 | 2 |
| Moles: from wave, a wave | 3, 1 → 2 | 2, 1 → 3 | 1, 2 → 4 |
| A mole moves | every 2nd piece | every piece | every piece |
| Digging through a stone (pieces) | 3 | 2 | 1 |
| Patience (pieces) | 16 | 16 | 20 |
| A leaf grows back | every wave | every wave | every 2nd wave |

Counts go up by one every two waves to their cap. A wave's threats are drawn when it starts, spread through its 24
pieces (never sooner than their warning), 60% of stones aimed at the sprout's columns and one either side, on the
guard's own random stream (the board's seed, apart from the pieces'): saved with the board, so a resume or an Undo
brings the same stones and moles. Stones are `FOREIGN | 8`, moles `FOREIGN | MOLE | slot`, the sprout `ASSET | 31`.

*Pay* — rated as its shape set is (a Protect board on Normal shapes keeps the streak, the bonus and the feats): a row
pays only its own cells, and a row holding a stone or a mole is plain (never part of a quad, never a streak link), so
a row with k stones pays (w − k)/10. Stones, moles, waves and leaves pay nothing. Measured with a tidy bot that keeps a
roof over the sprout (`scripts/protect-unit.cjs`, 1500 pieces a level), a Protect board earns no more per piece or per
action than Standard. *Achievements* (their own group, any Protect board): **Green Thumb** (150) 5 waves on one board;
**Night Watch** (600) 20 waves on one board, Medium or Hard; **Curled Up** (300) box in 25 moles, Medium or Hard;
**Not a Leaf** (1000, legend) 8 waves in a row on Hard with no leaf lost and no power-ups, Undo included.

*The look* (`js/guardview.js`) — the sprout is a soil mound, a stem and its leaves (a lost leaf a faint outline), in its
own greens and browns in each theme; stones a warm grey with two specks; a mole a small round body with a pale nose the
way it goes, fainter when it is about to give up. What is coming is drawn still and worked out again only when the
board changes: where each stone would land now, dashed, with a dot for each piece left (rose when it would land on the
sprout), a notch at the wall where a mole will come in, and each mole's next two cells as faint dots. A stone falls a
short way and puffs dust; a lost leaf drifts off; "Wave 3" and "Calm" show quietly; nothing shakes. With reduced motion
stones fade in, moles jump and leaves fade. *In Free Play* — Leaves takes Score's place in the status bar, its tip the
wave and the pieces left in it ("Wave 4 · 9 pieces left", "Calm · 6 pieces to wave 4"); a board at 0 leaves shows the
Wilted card (its summary, Undo, which brings the leaf back, Boards and Retire), is tagged Wilted in the library and its
full view says so; its summary adds Waves, Leaves lost, Stones and Moles boxed in, and Stats ▸ Free Play a Protect
section. The New board window's Mode tab has Protect and its level row, and the preview shows the sprout.

### Battle
<!-- part:battle -->

## Keys

| | |
|---|---|
| ← → | move |
| ↓ | lower one row; on the stack, a fresh press sets the piece (holding never does) |
| Space | hard drop (for 0.18 s after a piece is set, Space, a click and the ↓ that sets are ignored, so a double press never drops the next piece unseen; moving and turning still work, and Classic's gravity never waits) |
| ↑ / X, Z, A | turn clockwise, counter-clockwise, 180° |
| C / Shift | hold; again to swap back (Free Play and Puzzles: as often as you like). On the Factory tab, C collects the crate |
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

By touch alone Settings ▸ Keys is Settings ▸ Gestures, and lists the gestures ([Touch](#touch)) instead.

## Touch

A quick swipe left or right anywhere off the board changes game tab (left: the next of Play, Puzzles, Factory,
Classic; right: the one before). A swipe on a board steers the piece instead, and slow drags, dialogs and anything
that scrolls sideways are left alone (`bindTabSwipe` in `js/app.js`).

On a phone or a tablet the board is played with one finger, anywhere on it (`js/touch.js` reads the gestures;
`BoardMode.bindTouch` in `js/modes.js` carries them out through the same `action()` as the keys):

| | |
|---|---|
| drag sideways | move, a cell per cell of finger travel (relative: the piece follows how far the finger goes, not where it is); into a wall it stops, with nothing to unwind |
| drag down | lower a row per cell of travel; never sets the piece. Down under a ledge, then sideways, works in one touch. In Classic a finger resting down the board keeps lowering (every Lower repeat) |
| swipe down | hard drop — the only way a touch sets a piece (a quick stroke: 1.1 px/ms by default, at least 28 px, under 0.22 s, within 30° of straight; a sideways step in its last 60 ms is taken back first) |
| swipe up | hold |
| tap | turn: the right half of the well clockwise, the left half counter-clockwise (Settings ▸ Controls ▸ Touch ▸ Tap to turn: Clockwise makes every tap clockwise) |
| two-finger tap | turn 180° |
| tap HOLD | hold, or swap back |

Directions are the screen's, as the arrows are: on an Upside Down board a swipe up drops, on a Sideways one a swipe left
drops and a drag up or down moves. Inverted Controls mirror a drag and swap the taps, as they do the keys. The 0.18 s
after a set holds back a swipe's drop too, a new piece mid-touch (Classic's gravity set the last one) takes no drop,
lowering or hold from it, and one touch drops or holds once at most. Only the board's canvas starts a gesture: the
bars, buttons, cards and toasts are taps of their own, and a touch on the board with a power-up tray open only closes
the tray. A tap never reaches the board as a click (it would drop the piece). Settings ▸ Controls ▸ Touch: Touch
controls, Drag sensitivity (1–10, the finger travel per cell), Hard drop swipe (Light, Medium, Firm) and Tap to turn;
Haptics where the device has them (not iPhone: Safari has no vibration). By touch alone, what a phone cannot use goes
([On phones](#iphone-and-ipad)). A long press shows a tooltip; the control hints name the gesture (`Swipe ↓ drops`, `Tap
turns`). A phone held upright gets the whole screen, clear of the notch and home indicator: a title bar of two rows
(Lull, Stats, Achievements, the wallet, sound and Settings; then the places to play), every button at least 44 px,
toasts at the top, away from the well; on its side the bars stand beside the board. No page zoom,
bounce or text selection; there is no window to roll up.

**Window** — the panel floats over every Space, full-screen apps included: it never activates Lull (activating a regular app pulls the screen back to its own Space), so ⌥⌘L shows it right over whatever is in front and hands it the keyboard. When the pointer leaves, Lull dims and fades to 60% (Settings ▸ Window ▸ Fade when the pointer leaves); it comes back as soon as the pointer does.

**Collapse** — the chevron, ⌘J or a double-click on the empty bar (never by touch alone: there is no window to roll up,
and a save rolled up on the Mac opens whole, still saying so for an Export back) rolls Lull up into its title bar, where a parade of
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
are agreed then), and it opens back to the height it had, across launches too. Both ways it starts from where the
window is now: collapsing keeps its top and left edges wherever it has been moved, the bar can be dragged anywhere, and
expanding grows down from the bar's top-left (up just as far as it must near the bottom of the screen), at the width the
bar has. The panel keeps one saved frame, always the window as it is (the bar while collapsed), with the open height
beside it.

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
| `Right-click turns` | eight clicked pieces in a row never turned, or two clicked pieces undone within 5 s |

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
node Lull/scripts/golden.cjs          # the golden identity run: a default board plays lock for lock as recorded (--write records it)
node Lull/scripts/browser-test.cjs    # the page played in headless Chromium (needs Playwright), then touch-, device-, undo- and retired-test
node Lull/scripts/touch-test.cjs      # an emulated phone played with real touches: gestures, layout, 44 px targets
node Lull/scripts/device-test.cjs     # what a phone, a desktop browser, the app and a tablet with a trackpad are offered
node Lull/scripts/undo-test.cjs       # every way of buying an Undo charges 5; the Board full and puzzle cards fit, down to 320 x 568
node Lull/scripts/recipe-test.cjs --write-pixels <Game dir>   # records recipe-pixels.json from a tree (browser-test runs recipe-test)
node Lull/scripts/retired-test.cjs    # a retired board in full view: cell for cell at play size, read-only, stepping, back exactly
node Lull/scripts/audio-render.cjs out/   # every sound and a minute of music rendered offline: WAVs, peak, loudness, brightness
node Lull/scripts/audio-render.cjs out/ --harmony   # every pack's pitched sounds in every section: notes found, share in its key, A/B mixes

node Lull/scripts/web-build.cjs site/          # the web app as deployed: the offline copy's files, sw.js stamped with their hash
npx serve site                                 # (or any static server) then open the address it prints
node Lull/scripts/web-browser-test.cjs         # the web app alone: offline, updates, Home Screen (browser-test.cjs runs it too)
node Lull/scripts/web-icons.cjs                # redraws Game/icons/ from the app icon's design (needs Playwright)
```

The tests hold up on a busy machine: they wait for what they check rather than for a set time, time work by CPU time,
and give inputs their own time stamps. Two test-only hooks, inert in play, help: `app.frameStep` (a fixed step per
display frame, to time an animation in its own time) and a mode's `clock` (the time the set grace and a resting finger go
by, held while a test sends its inputs).

A packaged build is committed by CI to [`dist/Lull.app.zip`](../dist/). It is ad-hoc signed: right-click ▸ Open the
first time. The save lives in `~/Library/Application Support/Lull/save.json` (Settings ▸ Export copies it).
Settings ▸ Data ▸ Reset (everything but the settings) and Import replace the save outright: the page hands the new one
over and saves nothing more, the app writes it (dropping the previous copy) and reloads the page with it; in a browser it
goes to localStorage and the page reloads.

## iPhone and iPad

The game is also a Home Screen web app, served by GitHub Pages at
**https://delectablegrapfruit.github.io/modern-agents/** — no App Store, no sideloading.

**Add to Home Screen** — open that address in Safari, tap Share, then Add to Home Screen, then Add. Lull opens from its
icon full screen, with no browser around it, and plays with no connection once it has been opened once. The save lives
in that Home Screen app's own storage (Safari's tabs and the Home Screen app keep separate saves; Settings ▸ Data ▸
Export and Import move one across).

**Offline** — `Game/sw.js` keeps every file the game loads (its `FILES`, which `test.cjs` holds to the files in `Game/`
and every file the page names) in one cache named for the build, and serves from it first. A new build installs
beside the old one and takes over at the next launch; while the app is open, a quiet Update ready toast offers it now
(a tap saves and reloads). Coming back to the app looks for a new build at most every half hour. The macOS app and a page
opened from a file never register the worker; the manifest and icons are ignored there.

**Full screen** — the status bar is see-through (`black-translucent`): the window fills the screen inside the phone's
safe areas (`--safe-*` in `lull.css`), the theme's ground around it; on the light theme the status bar sits on a band of
slate, since its words are always white.

**Lasting storage** — the save is in `localStorage`, the same in a tab and on the Home Screen (nothing depends on the
macOS shell). The page asks that it be kept (`navigator.storage.persist`) from the Home Screen and in a tab, where the
browser is likelier to clear it. Chromium and Safari decide without asking the player; Firefox shows a prompt, so a
Firefox tab does not ask.

**On phones** — decided by what the device has, not what it is called (`Touch.sync` in `js/touch.js`, live: a trackpad
or a keyboard attached or taken away changes it at once, Settings included). *Touch alone* — no mouse, trackpad or
hovering pen among any of its pointers, and never the macOS app (`body.touch-only`) — has no window and no pointer, so
these go: Settings ▸ Look ▸ Window background and Tint strength (the page is drawn solid; the saved choice is kept for
an Export back to the Mac), the Mouse card, Pause when the pointer leaves, the dimming when the pointer leaves, and
rolling the window up (chevron, double-click, ⌘J; a rolled-up save opens whole). The Window section (float on top,
fade, ⌥⌘L) and the pin, hide and quit buttons are the app's alone everywhere. With no key pressed yet either
(`body.keyless`), the keyboard goes too: Repeat delay and Repeat rate, key caps on buttons and key names in tooltips
(a long press names the control only), and Settings ▸ Keys becomes Gestures, a list of the gestures alone (it follows
Tap to turn). Lower repeat stays, in the Touch card: it paces Classic's resting finger. The first key pressed on a
hardware keyboard (an iPad's) brings the keyboard's settings back for the visit. An iPad with a trackpad keeps
everything a pointer has. Sound, Data (Export and Import move a save between a tab and the Home Screen) and the rest are
the same everywhere.

**Deploy** — the `pages` job in `.github/workflows/lull.yml` runs on pushes to branch `lull` once the Linux test job
passes: `scripts/web-build.cjs` builds the site and `actions/deploy-pages` publishes it. Every path is relative, so it
works under `/modern-agents/`. Once, in the repository's settings:

1. Settings ▸ Pages ▸ Build and deployment ▸ Source: **GitHub Actions**.
2. Settings ▸ Environments ▸ `github-pages` ▸ Deployment branches and tags: add **`lull`** (Pages allows only the default
   branch until then; the environment appears after step 1).
3. Re-run the latest Lull workflow run (Actions ▸ Lull ▸ Re-run jobs), or push to `lull`.

The address is shown on the `pages` job and under Settings ▸ Pages.

## Layout

| Path | |
|---|---|
| `Game/` | the game: `index.html`, `manifest.webmanifest`, `sw.js` (the offline copy), `icons/` (the Home Screen icons), `css/`, and `js/` — `webapp` (the Home Screen app: the worker, its updates, lasting storage), `icons` (the one SVG icon set), `pieces` (SRS tetrominoes, pentominoes, big and custom shapes, polyomino enumeration, ids that rebuild themselves), `board` (the grid and the one table of cell bits), `recipe` (the board recipe: its parts, rules and limits), `engine` (the floating-piece rules, every item and the recipe's hooks), `items` (the chain multiplier, combos, Luck, the daily gift, power-ups earned in play), `library` (the Relaxed board library: shelved and retired boards, names, caps), `puzzlegen` (seeds, wildcards, reverse construction, reachability search, forward verification), `factory` (the chain: stamp heads, the store, presses, belts, the lift and the crate, in ticks for play and time away alike; `Factory.TUNE`; save repair), `store` (save, catalog, stats), `achievements`, `fxphysics` (the item effects' blocks, debris and dust: gravity, bounces, spirals, fixed pools), `render` (canvas: skins, frames, effects, item animations, rotated views), `factoryview` (the factory floor, drawn like the board), `hints` (control hints: the struggle signals, their limits and retirement), `touch` (the touch gestures: a pure reader of fingers, and the page's touch helpers), `webapp` (the Home Screen web app: the offline copy's registration and updates), `collapse` (the window rolled up into its title bar, and the parade of pieces along it), `modes`, `retiredview` (a retired board in full view), `ui`, `app` |
| `Sources/Lull/` | the macOS shell: a borderless `NSPanel` (floating, all Spaces, edge-resizable, draggable by the page's title bar) around a transparent `WKWebView`, a blur for the Glass background, the save file, the ⌥⌘L hot key, and a self-test CI runs |
| `scripts/` | `make-app.sh`, `icon.swift`, `line-glyph.py` (builds the line glyph's font into `lull.css`), `test.cjs`, `browser-test.cjs`, `audio-render.cjs` (renders and measures the synthesized audio offline), `pitch.cjs` (finds the notes in a render, to check sound effects are in the music's key), `splice-voice.py` (cuts the announcer's lines from a recording), `web-build.cjs` (the site as deployed), `web-icons.cjs` (the Home Screen icons), `web-test.cjs` and `web-browser-test.cjs` (the web app's tests, run by the two above), `touch-test.cjs` (an emulated phone played with gestures, run by browser-test), `device-test.cjs` (what each device is offered in Settings and the bar, and live changes; run by browser-test), `golden.cjs` and `golden.json` (the golden identity run, and its record), `sizes-test.cjs` (board sizes: the New board window, every extreme size, pay by width, layout; run by browser-test), `undo-test.cjs` (every way of buying an Undo, and the cards that offer it at every size; run by browser-test), `retired-test.cjs` (a retired board in full view at every size, by keys and by touch; run by browser-test), `recipe-test.cjs` and `recipe-pixels.json` (the board recipe in the page: the New board window, labels, the controller, and the board drawn pixel for pixel as recorded; run by browser-test) |

## Credits

The Classic announcer's lines are cut from the announcer of *Tetris Worlds* (2001); that recording belongs to its
rights holders (The Tetris Company / THQ) and is not covered by this project's terms.
Korobeiniki is a 19th-century folk song in the public
domain. The interface face is Inter by Rasmus Andersson (SIL Open Font License 1.1), embedded in `css/lull.css`.
