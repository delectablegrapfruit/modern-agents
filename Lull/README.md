# Lull

A floating window of low-stakes blocks, for the minutes between real work. Pieces never fall on their own: move them,
turn them, lower them a row at a time, and set them when you are ready — or walk away mid-piece and come back
tomorrow. Nothing is timed and nothing is lost.

On macOS it is a borderless, resizable panel that floats above other apps (and every Space), with a clear, glass,
tinted or solid background inside a distinct border. ⌥⌘L shows and hides it from anywhere; Esc tucks it away. The
same game runs in any browser from `Game/index.html`, and on iPhone and iPad from the Home Screen, offline
([iPhone and iPad](#iphone-and-ipad)).

**Title bar** — left to right: the places to play (Play, Puzzles, Factory) in one recessed track; empty bar to
drag the window by; the places to look (Stats, Achievements) as quiet icons; the wallet, which is also the Shop's
button (it lights up while the Shop is open); the speaker and Settings; the collapse chevron; and in the app, float on
top, hide and quit.
⌘1–⌘6 run in that order, the wallet last. (Classic is no longer a tab: it is a board mode, [Classic](#classic).) The tab you are on is a raised pill with its icon in the accent colour. Labels
give way as the window narrows — all three play tabs named, then only the one you are on, then icons alone (Stats and
Achievements are named only in a wide window) — and every control's tooltip is its name and key, nothing more (what a place is, you find by going there;
no button carries a line of explanation or a key cap), so nothing wraps or crowds, down to the app's 400 px minimum (and 300 px in a browser).

**Tab bar** — at 500 px wide and under (where the title bar above already gives up naming the places to play, and
every phone held upright is narrower), Play, Puzzles and Factory leave the title bar for a bar along the bottom of
the window, in reach of a thumb: three equal buttons, each its icon over its name (44 px tall by touch), the one you
are on raised. The views, the Play menu's page and toasts end above it; in a Safari tab it runs to the screen's edge
with its buttons clear of the home indicator (`env(safe-area-inset-bottom)`), and from the Home Screen the whole
window already sits above it. With the places to play gone from it, the title bar shows Lull's name again. Wider (a
520 px window keeps its board's height) the places to play stay in the title bar as above; rolled up, the tab bar
goes with everything but the title bar. Every place fits above it — a board, Puzzles, the Factory, Mural, Battle — at 400 × 700, 390 × 844 and 320 × 568,
light and dark (`scripts/tabbar-test.cjs`).

## Play

**Free Play** — endless, relaxed. Every cleared line is banked as ⦵ *lines*, the currency. A quad set by hand or a
twist (or a mini) is worth one line more — a quad made by a Noodle, a Giant or a Blueprint is not — and the
streak streak multiplies it: an extra ×0.05 for each quad or twist after the first, up to ×2 (twenty-one in a
row) — a quad on a full streak pays 10 (pay is kept to the hundredth, rounded down). The *chain* — the streak
plus the combo, the number to be proud of — is counted apart and shown beside the multiplier (`Chain 16 · ×1.65`).
A piece that has no room where it appears (a new one, one swapped in from hold, or one an item makes) is fitted into the nearest open spot above the stack it could get to — beside a tall column, stood on end, in another turn — never down inside the stack. Only when it fits nowhere is the board full; a hold swap or an item with no room is just refused (a short note says so, nothing is used up).
A full board just ends that board; the lines stay yours. Its Board full card shows the board's numbers (they scroll on
a short screen, the cut edge fading while there is more; the buttons always show) with Undo — there whenever a placement
can be taken back, with how many Undos you hold or its price, paid as in Puzzles: one held is used, with none one is
bought for 5 ⦵ and used at once, short of lines a note says Not enough lines — then Boards and Retire. An Undo also
takes back what that placement banked, in full, so buying one needs the 5 and those lines, and using one held needs
those lines (short, a note says Not enough lines and the Undo is kept: an Undo never pays, and the wallet never goes
below 0); and
like a set piece, an Undo that closes a card starts the set grace, so a double click does not drop the piece it
brought back. The ⦵ glyph is a cleared line running into a small black hole; in the wallet it is drawn large, a dark disc in a thin glowing ring. Everywhere else it is one character, `L.LINE` (U+29B5, never an emoji), drawn by a one-glyph font of the page's own (`scripts/line-glyph.py`) that is first in every font list and in the canvas fonts, so text, prices, toasts and the boards all show the same shape. Retiring a board (Boards ▸ Retire, or Retire when it fills up) shows its whole life: how long it
lived and was played, pieces, lines, score, quads, twists, spotless clears, best combo and streak, holds and
every power-up used on it; Stats ▸ Free Play keeps the last boards.

*The menu* (`js/menu.js`) — opened only by hand: the Menu button in the Relaxed status bar (where Boards was), or Esc
on the Play tab in a browser when nothing else takes it (a tray, Battle's aim, a window; in the Mac app Esc still tucks
the window away, and closes the menu when it is open). It never opens by itself: at start, after a reload and on a tab
switch the last board is shown exactly as it was. It is a page over the Play tab (below the title bar; the board
waits, as under any window), and its home holds only three things: two big tiles side by side, **Solo** (Relaxed,
Classic, Descent, Mural, then Custom: the full New board window below) and **Multiplayer** (Race and Battle, against
the computer), each a calm picture, its name and one short line; and **Manage** under them (the library). The X at the
top right closes it, back to the board in play as it was; so does Esc, from any page. Solo and Multiplayer are pages of
big tiles too, one a mode (its picture, name and a line; Custom a low dashed tile across the row), with Back beside
the X. A mode opens a short setup with only its own settings, the New board window's own controls: Relaxed its size presets and
shapes (Custom shapes are in Custom), Classic its type and settings, Descent its level and stage, Mural its picture
(Photo too) and level, Race and Battle the opponent and a size preset; then Start. Each mode's last setup is kept
(`boards.menu` in the save); a mode's setup first takes that mode's settings last chosen in New board, with Normal
shapes and no modifier. *Resume by rules*: when a saved board still to be played (not full, not ended, not retired)
has exactly these rules at this size (`Library.match`: `Recipe.editPrice` finds nothing to change, so Classic's music,
which changes for free, does not count; the board in play first, then the most recently played), the setup shows
"Resume: <name> (<progress>)" above Start new, focused, and Enter resumes it. A new board is made only when the
settings differ (Start), by Start new, or by Custom. Back steps back a page (focus on where it came from); Enter on a
button presses it, elsewhere it is the page's main button. Every target is 44 px or more, nothing scrolls sideways,
the home never scrolls and its tiles stay side by side, at 520 × 760, 400 × 700, 390 × 844 and 320 × 568, light and
dark, and under reduced motion nothing moves (`scripts/menu-test.cjs`).

*Boards* — the library, from Manage in the menu (and Boards on a board's end cards; `js/library.js` keeps it; the window is in
`js/modes.js`). Two tabs, **Solo** and **Multiplayer** (Race and Battle boards: `Library.side`), opened on the side of
the board in play; each has Saved and Retired (with that side's counts; the library holds 12 boards in all, Solo and
Multiplayer together, and New board says Library full), and New board. Saved lists the board in play first (marked
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
come down into the piece in play, and words over the board (SPOTLESS, a combo's name) fit the well (two lines,
then smaller). A board full with a piece wider than the board keeps it inside the walls (turned upright), and a control
hint wider than the well goes under, over or beside the plate instead.

*Pay per cell* — a Standard line is ten cells, so a line cleared on a board w wide is worth w/10 of one: half on a board
5 wide, two on one 20 wide; height changes nothing. `Library.scale(w)` is the one place that says so, and every reward
goes through it: a clear's pay, combos' lines, the power-up every two hundred lines (Standard lines), lifetime Lines and
Best lines (Stats and the achievements' progress), Efficiency, and the line-count and pace achievements. What a clear
pays is `Pay` in js/items.js, all of it in Standard lines, so for the same play no size earns faster per piece than
Standard (`econ-test.cjs` prices every clear its bots make at eight sizes 10 wide too, and never finds one that pays
more; casually no size pays more than Standard, within 5%, and a skilled bot does too except on 11 and 12 wide, where
it sets up quads far more easily than on Standard — seven or eight clears in ten against four — and earns up to 1.13×
a piece, a stated tolerance of 1.45×; a capped quad there pays well under Standard a piece, 0.83 of it 11 wide and
0.72 12 wide): the difficult-clear bonus is at most one Standard line, and on a board wider than Standard (10/w)² of
one (a board has one T a bag however wide it is, and a wide one makes quads easier); the streak's links count by
width, never more than one a clear (a narrow board makes difficult clears more often, each clearing fewer cells), so
the multiplier climbs per cell cleared, and wider than Standard, where streaks come easily, a link counts (10/w)² of
one and the cap falls toward ×1 by (10/w)³ (×1.58 at 12 wide, ×1.24 at 16, ×1.13 at 20; a streak bot there earns
about 1.09×, 1.01× and 0.90× Standard a piece); gold and a boost last for Standard clears (a Golden Piece is five
Standard-width clears: two and a half on a board 20 wide, twelve and a half on one 4 wide, the last paying its share;
Gold on the status bar counts the clears left on this board); and a won Double or Nothing adds at most one Standard
clear's worth. Pay is rounded down to the hundredth (`Library.bank`); the wallet and its totals keep hundredths (never drifting) and the
wallet shows whole lines, while "+2.5" on the board, a combo's callout and Lines banked show the hundredths. What stays
as cleared: the board's own Lines and every per-board figure (the status bar, the rows, the summary's Lines, Past
boards), clears by size, twist lines and the score. On a board narrower than Standard a quad takes three pieces, a
flat I on an empty board is a spotless clear and combos never end, so the Free Play feats (quads, streaks, combos,
chains, twists, spotless clears, score, Showman) count only on boards 10 wide or more, as do Painted Row and the
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
never starts over, whatever is retired or deleted. Everything else about a board belongs to it: its stats, its hand-play record for the
achievements ("no power-ups on the board", "on one board", Old Growth's age) and its share of the power-ups paid every
two hundred lines (the save's per-board Earn record is parked with the board, so leaving and coming back never pays a
milestone twice). Lifetime totals count play once, whichever board it was on, and switching adds nothing. There is no
duplicate: a copy would be a way to replay a board's future. The daily gift, the factory and the control hints do not
look at boards at all.

**Classic** — a board mode ([Classic](#classic) under Board options: New board ▸ Mode ▸ Classic), played on the Play tab like any board; what follows is how it plays with its settings at their defaults. Plain falling blocks: pieces fall, faster every ten
lines (the modern speed curve), half-second lock delay, lowering and dropping, hold (once per piece), game over, best
score. The well's top row is a row like any other: every piece appears with its top in it (the I too), a piece touching
the ceiling still touches it after a turn (the space above the well counts as open, so a T turned flat against the
ceiling is no twist), and the game ends only when a new piece cannot appear right where it
appears (no nearby spot is tried). Then it tops out the classic way: that piece sets where it is, over the stack, and
the next three from the queue appear one after another at the same spot (about 0.4 s apart, each with a soft set
sound), each over the last, see-through where they overlap and traced round their outlines, each outline a step inside the
one before so the layers show in any palette; then the game over sound,
the announcer and the card, the pile still behind it. Nothing counts any more by then (score, lines, best and stats
are final and saved at the top out); Space or a tap skips to the card, pausing or leaving ends it there, and under
reduced motion the pile is all there at once. Lines you clear still bank as ⦵: each line banks 0.7 ⦵, multiplied by the streak — ×0.05 a
link after the first, up to ×1.5 at eleven (the status bar's *Bank*); the score is never multiplied. Music: Hush, Lull's own tune (`js/audio.js`; `scripts/test.cjs` keeps it apart from
well-known melodies), in A minor at 80, dressed as calm ambient electronica with a little IDM in its detail — a soft, round
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
slides, partials, FM and detune ride along. Noise, clicks and low thuds or sweeps are left alone. The announcer whispers the big moments: "single", "double",
"triple", "quad", "twist", "twist single", "twist double" (a twist triple is "twist" and "triple"), "streak" before a
clear that carries one on, "spotless" when the board is cleared, "level up" and "game over". Her clips were generated
with ElevenLabs (see [Credits](#credits)) and are embedded by `scripts/voice-clips.cjs`, which records where her speech
starts and ends in each one (measured by decoding it in Chromium) and a loudness trim, fitted through her real chain so
every call comes out within a fraction of a dB of the others. Each is played from 20 ms before her first sound to just
past her last (a 10 ms fade in, a 70 ms fade out, so no cut clicks), so she speaks right on the event, never after the
silence a file opens with. Her desk is kept light, so the whisper sounds as it was recorded: a gentle high-pass at 85 Hz
(breath rumble), her level, and a safety limiter with a −3 dBFS ceiling at the speakers (Volume is taken into account)
that never acts at the default volumes, where her loudest peak is about 12 dB under it. No EQ, de-esser, compressor or
room. She sits about 4.5 dB under the sound effects and a few dB over the music, which dips about 4 dB under her (in
over about 40 ms, back over a second). `scripts/voice-test.cjs` (run by the browser test) renders every call through
that chain and holds it to all of this. Settings ▸ Sound ▸ Announcer volume sets her level. Settings ▸ Sound ▸ Announcer in Relaxed (off by default) lets her call Free Play clears too. Both toggle under the board or in Settings ▸ Sound. P pauses; another tab or another window pauses
too, and so does the pointer leaving the window (Settings ▸ Controls ▸ Pause when the pointer leaves); P or Resume
carries on.

**Puzzles** — procedurally generated, infinite, short, in Easy, Medium and Hard. Each has a seed (`M-3K7Q2XA`): the
same seed is the same puzzle for everyone, so it can be shared, replayed or retried (R) as often as you like (Retry
costs only a try, and only once a piece has been set). Undo takes back the last piece for one Undo, the power-up shared with Free Play: one you hold is used, and with
none it buys one for its price, 5 ⦵ (the one price of an Undo, everywhere), and uses it at once (the price is on the button, so it never asks; short of lines, a
note says Not enough lines and nothing changes). Only an undo that happens is paid for, once — ⌫, U or ⌘Z held down
undo once. Every puzzle is built backwards from a solution — rows are filled solid, pieces are lifted out only where they
could have been flown in and set, and the result is played forward on the real rules before it is kept — so every seed
is solvable, and Hard ones need tucks and spins. Goals: clear the board, clear N lines over bedrock, or clear the gems.
Every puzzle takes every piece: the board and the lines hold exactly the pieces' cells, and one gem sits in a row only the
last piece completes, kept only when an exhaustive search (every move the engine allows, every order a Hold slot
allows, pruned by counting the holes the gem rows still need) proves no fewer pieces take every gem; a search that
gives up counts as a shortcut. A gem seed that runs out of tries settles for a lines puzzle on its last board.
Solving pays lines the first time a seed is solved: Easy 3, Medium 7, Hard 18, falling ×0.8 for each try that set a
piece (rounded, never under 1, 3 or 6). A clean solve (the first try, no Undo, no hint) pays ×1.5: 5, 11, 27. The Daily
doubles it, once a date for each difficulty: the clockwise and the both-ways Daily of a date are two puzzles but one
Daily, so solving the second pays without the ×2. A hint halves it (rounded up) and costs
half of the puzzle's pay for that try before the first-try and Daily bonuses (Hard try 1: 9), so a hinted solve nets
nothing except on a Daily; on a puzzle already solved, which pays nothing, a hint is free (and never takes the gift's
free hint). The puzzle explains none of this: it shows only what solving pays now, and the solved card only what it
paid. Tries, a hint and Undos stay with the seed when you leave or reload
(`puzzle.tries` in the save, until it is solved). A reload or relaunch goes on with the attempt in play exactly as it
stood — the board, the piece in play, the queue and hold, the lines toward the goal (`puzzle.current.board`, kept after
every piece and on every save; the Undo history stays behind) — so it is still the same try; an attempt that cannot come
back (one that had run out) is over, and like Retry, or coming back to the seed from another, a new board is the next
try once a piece is set. Dailies are the same in every copy of Lull: day
numbers run through a fixed, keyed shuffle of all 2³² seeds per difficulty, so every date has one seed and every seed
belongs to exactly one date (hover a seed, or press and hold it, to see which). That is 4,294,967,296 seeds per difficulty, 12,884,901,888 in all. History lists every puzzle you opened — solved or
not, tries, time — with its seed and a play button; the star saves a seed (from a row, or the star on the puzzle's card
for the puzzle in play; filled once saved), and History ▸ Saved keeps them. Solutions only ever need turns a person expects (in place, or
nudged sideways off a wall), never kicks that hop a piece through a gap — and only the one direction a single
turn button gives, so that button (Up — on a turned board, the arrow pointing away from the floor — or a right-click)
solves every puzzle: clockwise, or counter-clockwise under Inverted Controls, which turns both around (those puzzles
are built, checked and hinted counter-clockwise). Upside Down and Sideways turn the picture, never mirror it, so a
clockwise turn looks clockwise there too. Settings ▸ Controls ▸ Counter-clockwise puzzles (off by default) switches
new puzzles to the both-ways seeds (`ES-`, `MS-`, `HS-` + the same seven symbols, a different puzzle), each built so
that single button alone cannot solve it. Wildcards:

| Wildcard | |
|---|---|
| Big Minos | some pieces are twice the size, each block 2×2 cells, moving one cell at a time: usually one or two among ordinary tetrominoes, sometimes about half, now and then all or nearly all (on Hard a tetromino still comes first); the chip says whether some or every piece is big. A big piece usually comes late in the queue, so the pieces before it have to keep its space open; the queue draws them to the same scale as the tetrominoes, so they look twice the size. No gems on Hard |
| Odd Shapes | trominoes and all 18 pentominoes (the twelve and the mirror images of the six that have one) |
| Wraparound | the side walls are portals (they glow, with ⇆) |
| Rigid | no turning; each piece arrives already facing its way |
| Heavy | no lowering, drops only |
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
comes from (number, Daily date or seed), piece count and what solving pays now (Pays ⦵14, with no tooltip; whole parts give way when the line is short, never a character of a date: the piece count first (always
under 440 px), then the weekday, then the difficulty, then a Daily's date), the seed (click to copy) and the star; the goal with how far along
it is (lines, gems or blocks left, and a thin meter); a chip per wildcard, each with its own icon (hover, or click for a
note that stays; Both Ways is tinted and names Z and A) — then the board, and a bar of Undo (with how many Undos you hold, or its price), Retry, Hint (with its price, or *free*
while the daily gift's free hint is held — a free hint goes before lines and still halves the pay) and
Skip, which turns into Next once solved. Every row has a fixed height and chips shorten (then drop to icons) rather
than wrap, so no puzzle and no state moves the board. Solving brings a small card with the time, tries and pay, and a
line saying how the pay was made (Hard 18 · try 2 → 14 · Daily ×2 → 28; Medium 7 · Undo: no ×1.5 when an Undo cost the
first-try ×1.5), the Hint button then priceless (Hints on if the solve used one); a
board that runs out shows how far it got, with Undo (its count or price, paid the same way) and Retry (on a phone as
small as 320 × 568 both cards tighten so their buttons show: a smaller ring, and Solved without its tick). Play a seed reads a seed as it is typed (difficulty,
both ways, solved, which Daily) and refuses a bad one in place; History has counts on its tabs and marks the puzzle in
play. History, and Stats ▸ Puzzles, end with one quiet line — "37 of 12,884,901,888 puzzles solved" (doubled with
Counter-clockwise puzzles on); each difficulty button's tooltip gives its own share of 4,294,967,296.

**Factory** — one fixed line, drawn whole from the first day and the same size ever after, filling the tab (between the
title bar and the tab bar on a phone, with no scrolling): three dropper spots over two mino conveyors, three assembler
spots under them, the store and its sign down the right, the belt winding down the screen, and the board at the bottom.
A spot not bought yet is dashed, with + and its price. There is no list of upgrades: everything is bought on the parts
themselves. Each part is a real button (Tab, Enter, Escape all work, 44 px or more by touch); tapping one opens a small
card anchored to it with its upgrade (what changes, the price, Buy; quiet while the wallet is short). Every box's header
row shows its progress on the left and its upgrade's price tag on the right (dimmed while you can't afford it); the
belt's tag sits inside its first loop.

- **Droppers** (one to three; an empty spot adds one, 8 then 45): each drops a single grey mino every 12 s onto the top
  conveyor (10, 8 and 6.5 s as they are sped up, 30, 100, 200 — bought on any dropper).
- **The top conveyor** carries minos right, at a steady 8 units a second and a gap apart, into the store at its own
  height and up the upper half of the store's left column. At the top each mino crosses over the pile and drops like
  sand into the lowest column (ties go to the column nearest the lift).
- **The store** holds 21 minos (42, 70, 98 as it grows: 7 columns × 3, 6, 10, 14 rows, unlocked from the bottom; the rows
  not bought yet are hatched; 10, 25, 40). When it is full the top conveyor backs up to its door, the droppers wait and
  the sign turns amber. Its card also sells every mino in it at the loose rate (two points a mino, twenty to a line).
- **The outlet**: a hopper at the bottom lets a mino out only while an assembler still needs one, so nothing rides past
  them all. The bottom mino of the column nearest the lift that has any slides into the lower lift, and that column
  settles down a cell; a mino falling into a column it passes under waits on it. The lower lift pushes it up and out
  through the store's wall onto the lower conveyor, which runs left over the assemblers (the two lifts never cross: the
  top conveyor comes in above where the lower one leaves).
- **Assemblers** (one to three; 5, 25, 90 on an empty spot): an assembler takes the mino meant for it as it passes and
  it hops down into it. It sets the minos it receives one at a time (8 s each, then 2 s to finish): grey when received,
  the piece's colour once set, no outline of what is to come. Dominoes at first; trominoes, tetrominoes, pentominoes as
  the pieces grow (10, 60, 160, bought on any assembler; a piece with no minos yet changes at once). The finished piece
  drops down the chute onto the belt right below, once there is room there.
- **The belt** is full length from the first day: under the assemblers running left, then four runs down the screen. The
  whole ride takes about 90 s (60, 40 and 25 s as it is sped up: 30, 60, 100). Pieces keep a gap and queue at its end
  while the board is busy.
- **The board** (27 × 18) plays every piece itself, like a skilled player: the piece comes down the chute to the top,
  turns a step at a time, slides a column at a time and drops, a faint outline showing where it will land. Its player
  scores every place (Dellacherie's features: landing height, eroded cells, row and column transitions, holes, wells;
  plus rows with a hole and how deep each hole is buried, and a steep guard near the top) and looks one piece ahead
  (the next on the belt, or the one an assembler will finish first) over its eight best places. Pieces are grown a mino
  at a time from the factory's seed, as the concept grew them; shapes, colours and ties are all deterministic. It never
  tops out (`scripts/test.cjs` plays 20,000 pentominoes and 20,000 mixed pieces tick by tick: worst stack 10 of 18; a
  full line ran 135,000 pentominoes without one); should it ever, the board quietly empties and plays on.
- **Lines pay straight into the wallet** — no Collect. Each cell carries its piece's worth a mino (a domino 2.5 points, a
  tromino 3, a tetromino 3.5, a pentomino 4; forty points to a line), and a full line flashes (not under reduced motion)
  and pays its cells; two, three, four, five or more at once pay ×1.25, ×1.5, ×2, ×2.5.

Prices (⦵, each kind in order): dropper 8, 45; dropper speed 30, 100, 200; store 10, 25, 40; assembler 5, 25, 90; piece
size 10, 60, 160; belt speed 30, 60, 100 — 998 in all. Every number lives in one frozen block, `Factory.TUNE` in
`js/factory.js`, beside the floor's one geometry (`Factory.GEO`, 360 × 622 units, which the view scales to fit and
centres, giving any spare height to the chutes above and below the belt).

**Nobody around**: while Lull is hidden, or left untouched for ten minutes, the line runs on — the board keeps playing
and paying — for an hour (`TUNE.AWAY_H`), then rests until you are back. Time away is replayed on return with the very
same ticks as on screen (quarter-second ticks on an integer clock; any slicing of the same time gives exactly the same
line, and a month away replays in a fraction of a second, since the line rests after the hour). On the Factory tab the
replay is simply there; elsewhere a toast says how many lines the factory cleared and what they paid.

**Balance** (`scripts/test.cjs` and `scripts/econ-test.cjs` measure it on the real line): minos ride to the far
assembler in about half a minute, so assemblers and piece size drive the income. A line left to itself makes about 8
lines an open hour with one assembler and about 80 fully built (about 100 when the store is sold whenever it fills),
under half of casual Standard play. A full factory on a casual day (half an hour open, the rest away) brings about 136
lines, about 0.6 of that day's play; over a casual career it is about a third of all income and every cosmetic is owned
at about 52 hours.

**The sign**: beside the belt, a 16 × 7 dot matrix with no words: chevrons running right, faster the busier the line is
(green), amber and still while it is stuck (a dropper waiting on a full store); a mood is held a moment so a passing
wait never flickers. Tapping it shows the board's lifetime lines in dots for about four seconds (up to 9999 in full,
then "12k"), then the chevrons come back; the count is kept in the save. Under reduced motion it is one still frame,
the treads stand and movers step with the line instead of gliding. A screen reader hears its mood ("Factory running
smoothly", "Factory working", "Factory held up: the store is full", "Factory idle") and "Show lifetime lines".

Everything that happens is drawn as it happens: a mino dropping onto the conveyor, riding it, rising in a lift, crossing
over the pile and falling into its column, sliding out of the outlet, hopping down into an assembler; a piece down a
chute to the belt and along it, down into the board; the full line's flash and its pay rising softly over the board.
Building the first assembler, the third dropper, the third assembler and the fastest belt, and delivering 500 pieces,
unlock the factory's cosmetics. Stats ▸ Factory counts lines earned, board lines cleared, pieces delivered (by size),
minos dropped and sold, the most lines at once, days visited, the pieces built while away and the time the line ran
smoothly. The save's factory is version 9; any other version starts a new factory.

**Power-ups** (items, in the code) — single-use, in five types on the bar under the Relaxed board. A type's button
(with how many you hold) opens its tray; click one to use it (Esc closes the tray). There are no number keys for them.
Hover one for what it does. They are bought right there, never in the Shop: one you have none of shows its price, and
clicking it asks once (its name and a Buy & use button with the price) — dimmed when the wallet is short.

| Type | Power-ups (price ⦵, rarity) |
|---|---|
| Shapers | Reroll (15, common: a different piece), Turnabout (15, common: J and L, S and Z swap), Pebble (20, common: a single block), Noodle (30, uncommon: a six-long rod), Giant (30, uncommon: twice the size), Blueprint (100, rare: draw your own, up to six blocks) |
| Choice | Pick of Three (20, common: play one of the next three now; this piece takes its place in line), Best Fit (45, uncommon: the piece becomes whichever of the seven fits the stack best, right over its spot), Order Slip (55, rare: choose the piece in play) |
| Tools | Patch (20, common: one block that drops into the highest covered hole in its column), Ghost (50, uncommon: passes through blocks into the first gap below where it fits), Drill (40, uncommon: bores out its column), Bomb (45, uncommon: clears a 13-block diamond where it lands), Laser (65, rare: clears every row it touches, full or not), Black Hole (90, rare: swallows everything within three blocks) |
| Board | Mirror World (20, common: flips the board left to right), Undo (5, common: takes back the last placement and its lines; one item with Puzzles' Undo, the count shared, and every free one comes as a pack of 5), Trapdoor (40, uncommon: the bottom row falls away, whatever it holds), Tornado (60, rare: shuffles the columns, holes and all), Settle (70, rare: every block falls straight down; full rows clear) |
| Luck | Golden Piece (50, uncommon: the next five clears pay ×2), Double or Nothing (30, uncommon: the next clear pays double if it is a quad set by hand — not a Noodle's, a Giant's or a Blueprint's — a twist or a mini, nothing if it is less), Safety Net (60 on Standard, less on wider boards, rare: keeps the streak through one ordinary clear) |

Nothing here is about a clock — Free Play has none — so they are about choice and shape: which piece, what it
becomes, what the stack looks like after, what the next clear is worth. Tools and Shapers change the piece in play
(the ghost shows where a Patch, Ghost or Bomb will act); press the same one again before the piece is set and the old
piece, the queue and the item come back. Board items act at once and can be undone (with an Undo). Lines a power-up clears are plain
lines: they pay and keep the combo going, but are never a quad or a twist and never add a streak link (a
Tornado only rearranges — every row keeps its count, so it never clears). Every one of them, Luck aside, puts
power-ups on the board for the achievements.

*Getting them.* Bought with lines in the tray; free from the daily gift; and, modestly, from play: one for every two
hundred lines cleared on a board (Standard lines; counted in the save, outside the board, so an Undo and a replayed clear never pay twice) and one the first time each combo is ever found. Free ones are drawn by rarity
(common 8, uncommon 3, rare 1), and a free Undo is always 5 of them (bought, it is one at a time, and always for 5 ⦵:
the tray's Buy & use, the Board full card, the puzzle bar and card, the keys and a finger all pay the same).

**Daily gift** — the small wrapped box in the Relaxed tab's status bar glows while a gift is waiting: three different
things, drawn by rarity from the power-ups (an Undo comes as 5) and one puzzle freebie, a free hint (uncommon: one hint
at no cost, which still halves the pay; the Puzzles tab uses it before lines), so nearly six in ten of what it gives
are common, about one in thirteen rare, and one gift in ten holds a free hint. What play earns is power-ups alone. Its
cards say what each is (5 Undos; Hint, with the hint icon). It comes again 24
hours after it was last opened — the time since, not the date; its tooltip counts down. The claim time is booked in the
save as it opens, and the draw is fixed by the save and how many gifts it has opened, so reopening Lull or switching
tabs never re-rolls it or opens it twice. A clock turned back never opens it early: the next one is still 24 hours
after the booked claim, however far back the clock went (and a clock pushed forward to claim early books that claim in
the future, so the next one waits for it).

*Combos* — things that pay a little extra: lines, a short boost (the next few clears pay ×1.25–×1.5) and points, each
told once in a small callout on the board. Four are pure skill: a row all one colour (Painted Row), four lines with an I
brought back out of hold (From the Pocket), a line cleared by a piece tucked in under an overhang (Keyhole), two twist
doubles in one streak (Twin Spin). The rest are a power-up used well, each saying exactly what to do: complete a row with
a Patch dropped into a covered hole (Patch Job); clear a line with a Ghost piece set under an overhang (Through the
Wall); clear four lines at once with a Noodle or a Giant (Tall Order); three at once with a Blueprint piece
(Architect); four with a Best Fit piece (Tailor-Made); win a Double or Nothing (All In); let a Safety Net keep a
streak streak of five or more (Caught); take out ten blocks or more with one Bomb (Full Blast); swallow twenty
or more with one Black Hole (Event Horizon). With no clock in Free Play, none is for repeating: across the board library each pays
in full, then half, then a quarter, then nothing; boosts come with the first two; and a power-up combo pays less than
the power-up it takes. Stats ▸ Free Play lists them: found ones by name, the rest as a question mark.

*Luck.* Golden Piece puts gold on the board for your next five clears, each ×2 on top of everything else; it waits
through pieces that clear nothing, so it is never wasted. It adds five clears' pay once over: 50 for its 50 on quads at
a full streak, so at best it breaks even, and on ordinary clears about 10 — a luxury, never a profit (none of Luck
can do better than break even). Double or Nothing waits for the next clear, too: a quad set by hand (not a Noodle, a
Giant or a Blueprint), a twist or a mini pays double, anything less pays nothing (the lines still count on the
board). Safety Net is a one-time pass for the streak: the next clear that would end it does not, and the
multiplier stays. What it keeps is worth most on a Standard board: the saved clear paid at the full streak (a triple:
3 more) and the twenty quads it would take to climb back, 52.5 more, 55.5 in all (wider, the streak climbs slower to
a lower cap, so it keeps less: about 32 at 12 wide, 10 at 20; narrower, a little under 55.5). Its price on a board is
worked out from that: the next multiple of 5 above the most it can keep at that width, 10 at least (`Luck.netPrice`).
So it is 60 on Standard and on narrower boards, 45 at 11 wide, 35 at 12, 25 at 14 and 15 from 16 wide up: close to
what it can keep, but never enough to break even. The item bar shows the price for the board you are on.

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
with fixed pools of bodies and particles; Reduced motion turns it into plain fades. Shapes beyond the seven (a Noodle, a Giant, a Blueprint drawing, a mirrored odd shape) turn wherever there is room: when no kick fits, a turn that would poke past the ceiling, floor or a wall is nudged back in by exactly that much (if the way in is clear), and one that would dip into the stack is stood on it or slid off the block beside it, never out of a well or through blocks. The seven keep plain Lull kicks, and puzzles keep exactly the turns they were built with.

**Shop** — click the wallet (or ⌘6). Cosmetics only (power-ups are not sold), one kind at a time: a row of kinds (←/→ step
while it has focus) picks which — when it does not fit, a chevron at each end pages it a visible width at a time,
snapped to whole kinds, dimmed at each end, never picking one — and only that
kind's tiles are shown — the list scrolls within the kind, never on into the next; the Shop reopens on the kind you
looked at last. Each tile has a large live preview drawn in your current look: a small real well with a stack in it.
The catalogue is short on purpose, every item distinct:

| Kind | Items (price ⦵) |
|---|---|
| Palettes | Classic (free), Mist 400, Sunset 600, Aurora 850, Ink 1,100, Moss 1,400, Gold Leaf 2,800, Prism 5,000 (its hues glide round the wheel, a turn in 45 s), Assembly Line (factory) |
| Mino skins | Flat (free), Bevel 350, Pixel 550, Bubble 750, Glass 1,000, Gummy 1,250, Neon Tube 1,600, Gem 2,100, Lantern 2,800, Steel (factory) |
| Frames | Hairline (free: the well's own rim), Inlay 300, Glow 650, Brass 1,200, Rainbow 2,500 (a slow ring of spectrum, a turn in 12 s), Hazard Tape (factory) |
| Backdrops | Plain and Grid (free), Blueprint 350, Dusk 700, Aurora 1,200 (three veils of light drifting on long periods), Starfield 1,700 (the bright stars twinkle), Conveyor (factory; its treads slide) |
| Line clears | Fade (free), Sparkle 450, Ripple 850, Bloom 1,300, Welding Sparks (factory) |
| Shadows | Outline (free), Soft 200, Dotted 300, Glow 450, Off |
| Sounds | Drift (free), Chiptune 450, Marimba 650, Analog Synth 900, Glass 1,200, Wind Chimes 1,600 |

Moving previews (Prism, Rainbow, the moving backdrops, every line clear on a loop) share one animation loop that
runs only while they are on screen, and stand still under reduced motion, as the boards do. A light-theme well deepens
any palette colour too pale for it (hue kept), and Glass and Neon Tube paint a deeper variant there. **Sound packs**
(Drift — the default: smooth synth tones in the music's room — a breath of a different note for each move, like a
chime stirring, soft sine plucks that darken as they ring, round bell tones, slow wide detuned pads swelling under
clears, a warm felt note and soft sub when a piece sets and a low thoom for booms; no clicks on the way in, never
brighter than the music, all in its A minor (and anything played that has no sound of its own yet gets a quiet pluck)
— Chiptune coins and power-ups, rolling Marimba, Analog Synth stabs, ringing Glass, Wind Chimes — all synthesized,
each with its own clears; its preview is a Listen button); a few are factory rewards (the first assembler, the third
dropper, the third assembler, the fastest belt, 500 pieces delivered), marked with a lock and what earns them on hover. A tile says In use, Use (click it, or the tile) or its price, dimmed when you cannot afford it. Buying
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

**Achievements** — 107 quiet milestones that pay ⦵ lines, in their own tab: a small toast when one is earned, nothing
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
earned. The toast, Recent and its list all go through one function (`UI.showAchievement`). Each place has its own quiet colour and its tab's icon — Free Play sea-glass teal, Classic olive, Puzzles orchid, Factory copper, Lifetime a neutral slate (`--area-*` in `lull.css`, deep inks in light, each at least 4.5:1 on its tint, apart from the accent and the gold for colour-blind eyes too) — on the group's header and bar, each row's badge, bar and pay, Recent and the toast; a legendary one stays gold (`--gold-ink` for its words), with a dot of its place's colour. None is a
gimme — the easiest is a quad with no power-ups on the board (15 ⦵) — and 150 pieces of ordinary play earn nothing new, nor do 150 with a
few items used along the way (a test plays both, at a relaxed piece every three seconds).

*Free Play has no clock and a bag of power-ups*, so nearly anything there could be bought or waited out (an Order
Slip for every I, a laser for every row, a Settle for every spotless clear, an Undo for every slip). So its skill ones
say **no power-ups on the board**: no power-up that touches the pieces or the board — Undo included — during the
feat, nor since the board was last empty (an empty board, however it got that way, is a fresh start; Luck never counts
against it, and one taken back before its piece is set never happened). Each description says it in those words; the
exact rule is said once, in the (i) beside the Free Play header. (The code calls this play *by hand*.) Its score ones
need a board that never used a power-up at all; two ask for pace — the last hundred pieces set with no power-ups on
the board, on the wall clock, clearing 36 lines (Allegro,
within three minutes; Presto, ninety seconds); and the streaks that are really about keeping up have Classic versions under
gravity (eight streak, four quads in a row, a 15-combo). Hover the Chain in the status bar to see whether
there are power-ups on the board (and the chain without them); a board's summary shows its best chain and its best
with no power-ups on the board. Three are for playing with power-ups on purpose: three different power-up combos on
one board (Showman), a board of 60 blocks or more emptied by one power-up (Clean Sweep), and every combo found
(Tinkerer).

Medium ones (50–100 ⦵): a spotless clear with no power-ups on the board, a mini twist double, a 10-combo, a twist triple on gold, four quads in a row, Allegro,
the perfect-clear opener (within a fresh board's first ten pieces, no items), Showman; a Hard puzzle first try
without hints or undo, all three Dailies on their day, or a quad, a Classic quad and a Hard puzzle in one day; 1,000
pieces delivered by the factory, or an hour of it running smoothly. Hard ones (100–200 ⦵): eight streak, three spotless clears,
100 line-clearing twists (all with no power-ups on the board), 250,000 points never using a power-up, Clean Sweep, Tinkerer, forty lines in a
fresh board's first hundred pieces with nothing left over, every item used; in Classic a spotless clear, a twist
triple, a 10-combo, eight streak, level 10 without hold, 40 lines in 90 s or 40 lines of quads alone; a Hard
puzzle first try in under 20 s, twenty first-try solves in a row, 100 Hard puzzles; 50,000 lines in all, 30 days
played. Thirty-two are legendary (250–1,000 ⦵): a chain of 20 with no power-ups on the board, Presto, a spotless clear with a twist, ten
quads in a row, five gold clears on a chain of 20, ten spotless clears or 5,000 lines on one board, a million
without items; Classic level 25, a 15-combo, 40 lines in 50 s, level 20 without hold, a Classic million; every
wildcard on Hard, a Daily thirty days in a row, a hundred first-try solves in a row; a hundred hours or a hundred days
with Lull, everything the shop sells, half a million lines earned (undone lines aside, since an undone clear replayed would count
twice); 10,000 factory pieces delivered or 50,000 minos
dropped, a hundred days collecting — and *Lull*, every other one. They read the stats below plus a few kept for them: the
board's hand counts (`freshStats` in `js/engine.js`: whether there are power-ups on the board, and the streak,
combo, quads in a row, chain, line-clearing twists, twist triples and spotless clears without them, gold clears on a
chain of 20, and the last 101 such pieces' times), Classic's own clock (running time only), undos per puzzle, runs of first-try solves (a retry, hint,
fail, skipped or abandoned puzzle ends one) and of Dailies on consecutive dates (each solved on its day), Hard solves per wildcard, days played (a day counts once you
play in front, not when the factory runs alone), Classic games (one counts once it has run a minute or cleared ten
lines, so a quick restart is not a game), and the
day log's quad (set by a piece: a laser or a Tornado is not one) / Classic quad / Hard puzzle / Dailies. Lifetime ones are also checked once a minute.

**Stats** — lines by source and day (play, combos, puzzles …), combos found, clears, twists, combos, pieces per minute, inputs per piece, puzzle solves
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
unrated board (shapes other than the seven) has no difficult clears: no quad, no streak streak, no bonus, ×1. Parts always run in a fixed
order (shapes, mirror, physics, classic, descent, race, battle), whatever order they load in. What pays and counts is measured in own
cells: a row holding a cell the player never placed is plain and pays only the player's cells, and no option pays more
per piece or per action than a Standard board (`f = min(1, 4 / E)`, E the mean cells a piece). Outside the board,
`Board.get` reads as a wall (`CELL.WALL`); every cell bit has one name in `CELL` (`js/board.js`), and anything that
reads a colour masks with `CELL.COLOR`.

*The New board window* (`PlayMode.openNewBoard`) — the steppers and the well stay on top; under them a tablist of
four tabs (roving focus: ← → Home End; Enter or Space on a tab selects it and never creates), each 44 px tall with its
name and, muted, its short value (Shapes "Normal", Modifiers "Off", "Mirror", "Physics" or "Both", Mode "Plain"; Size has
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
and as a muted second line in Past boards. A part can add tags to its rows (`tags`: Cleared, "vs Steady 3–2"), its
own numbers to a board's summary (`tiles`, from the summary's `ext`), and a name for its own end, which a retired
board's full view says in place of "Retired by hand" (`endName`: Cleared).
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
long the first Next slot and the Hold box are for a long piece (`traySlot`), and how many pieces Next shows at most
(`nextCount`: fewer when a later one would be specks); how opaque each cell of the piece in play
is (`pieceAlpha`: Mirror's copy); and marks on the New board preview and the library's thumbnails
(`Render.previewBoard`, which draws both). An item that acts at more than one spot (the engine's `targets`) is previewed
and animated at each. With `?freeze=1` every frame is drawn at one
fixed moment (`Render.clock`), for tests that compare pixels: `scripts/recipe-pixels.json` holds the board, an animated
look, the red rim, thumbnails and previews at four window sizes in both themes, recorded from the tree before the
render split, and the drawing now matches it pixel for pixel.

### Shapes

What a board deals (`js/shapes.js`, the rules; `js/shapepicker.js`, the window and the view). Six chips on the Shapes
tab, each with a sample: **Normal** (the seven in a 7-bag: today's code path exactly, with no dealer of its own),
**Tiny** (a round of 14: the monomino twice, the domino four times, each tromino four times), **Frantic** (a round of
21: the seven once each, seven pentominoes from a bag of all 18 kept between rounds, two of each tromino, two dominoes,
one monomino: 3.8 blocks a piece), **Pentominoes** (the 18 one-sided ones in an 18-bag: the twelve and the mirror images
of the six that have one, `Fm Pm Nm Ym Z5m L5m`, each with its own colour: its base's turned round the hue wheel), **Big** (the seven doubled, TGM's big mode)
and **Custom**, whose line under the chips says what it deals ("4 and 5 blocks", Custom first chosen) beside Edit.

*The Custom shapes window* (over New board; Done keeps it, Cancel does not): a row for each group of 1 to 12 blocks
(one-sided, mirror images apart as J and L are, a shape with a sealed hole left out: 1, 1, 2, 7, 18, 60, 195, 693, 2432,
8808, 31968 and 117487 of them), Clusters and Big, each on or off (the last one on stays on, and a group whose picks would take the picks past 60 stays off: each says so). An on row's
button ("All ›", "3 picked ›", "3–5 ›", "Even ›") opens its view (Back, or Escape): How often (Less, Even or More: 7,
14 or 28 of a round's pieces), then for a group Shapes (its shapes a page at a time: 48, or 45 in the five columns under
360 px; ‹ › or Page Up / Down), Picked, Shuffle (a random page, for a group of more than 60; 9 blocks and up open on it
and draw eight shapes a frame) and Draw (6 blocks and up: a grid of max(n, 6) squared, at most 12, cells at least 20 px;
drag paints or erases, the arrows and Space do it by key; it reads "7 of 9 blocks", "Not joined", "Has a hole" or
"Picked already", and Add picks it). A press on a shape picks it (60 picks in all at most, kept as each shape's
canonical key: of its four turns, the one whose key sorts first); a group with picks deals only those, Clear goes back
to All. Clusters: 2 to 8 blocks (From, To; 3–5 at first), joined through sides or corners with at least one join
through a corner alone and no sealed hole, each fitting a box ⌈√k⌉ + 1 wide, made new for every piece. Big: Less, Even
or More deal that share of doubled pieces from the groups of 1 to 5 blocks that are on (the seven when none is), All
doubles every piece.

*Dealing.* A round is a shuffled list of tokens, each source's share of it, a list's shapes drawn without repeats from
shuffled cycles; the rest of the round (and Frantic's bag) is `game.bag` (`'2.5'`, `'3'`, `'~11'`), so Undo, the save
and a reload need nothing new, and every draw is on the game's own stream. Groups of 1 to 5 blocks deal the built-in
pieces (the seven keep Lull kicks and twists); 6 blocks deals its 60 in cycles; 7 to 12 are drawn uniformly through
`js/polytable.js` (built by `scripts/polytable.cjs`: for each group, how many shapes lie under each node of its
enumeration tree at depth 8 or 9; a draw walks to the node that holds shape k, skipping whole subtrees, then enumerates
that node alone, with typed arrays: a 12-block draw well under a millisecond). A shape is named by its cells (`P:` a
polyomino, family "7 blocks", which Stats ▸ Pieces placed shows; `K:` a cluster; `B` + any id doubled) and rebuilt from
the id alone, its colour one of slots 9–14 by its key; types made this way are kept to the last 512 used. Reroll draws
from the set on its own random stream; Best Fit and Order Slip choose from the set's shapes when they are 29 or fewer
(Normal, Tiny, Frantic, Pentominoes, groups of 1 to 5), else from 7 drawn. Every piece of a set other than Normal appears
with its top in the top row, turned its flattest way that fits (ties: more blocks on its bottom row, then the lowest
turn: the seven appear in Lull's spawn orientation); the trays draw it that way, or in the turn whose blocks are more than a quarter
larger in that slot; the first Next slot and the Hold box are half its length long; and when the piece after the first
would be under 3 px a block (12 blocks on a phone), Next shows the first alone. The New board preview shows the set's
first few pieces, faint, on its floor.

*Sizes.* A set's smallest board is its sources' largest: at least the geometric floor (w ≥ max(4, M+2), h ≥ max(8,
L+4), M the largest short side of its shapes and L the longest, doubled with Big), raised to where a plain bot
(`scripts/shapes-bot.cjs`) lives as long, as the median of 20 boards, as it does with Normal shapes on 4 × 8
(`js/minsize.js`, measured by `scripts/minsize.cjs`: Pentominoes 6 × 10, Big 8 × 16, 12 blocks 13 × 26); Big shapes of 9
to 12 blocks and Big clusters of 8 never do, and are dealt only on 20 × 40. Descent keeps six rows more (14 at least).

*Pay.* Only a set of the seven is rated (Normal; Big; Custom with the seven alone, none doubled or all): Big's quad is
eight rows (four Big lines), its feats need 20 columns. Every other set pays ×1, with no difficult clear, no skill combo,
and Double or Nothing and Safety Net refused ("Needs Normal shapes"). What a block pays is `f = min(1, 4/E)` of a
Standard one, E the mean blocks a piece (a doubled piece four times its own, each source by its share of a round),
counted up by 19/D for a set whose shapes have D < 19 different turns between them (the seven's 19; by share: the
listed shapes' turns for their share of a round, 19 for the share drawn fresh, clusters and 7 blocks up): a set of few
turns is quicker to place (bars and squares alone drop where they appear, a press a piece), so Tiny pays about half,
the I alone a tenth. With that, no set pays more a piece than Standard, nor more a press than Standard (than Normal on
4 × 8, the fastest board of the seven, on a board under 10 × 20): `scripts/shapes-test.cjs` plays every preset, 12
blocks, clusters, Big mixes and sets of bars and squares (with a few clusters too) with a bot and holds them to it. Board shapes never count
toward the Factory; there are no new achievements.

### Mirror
A line runs down the middle of the well, and the piece in play has a copy: its reflection across the line (x →
w − 1 − x, `js/mirror.js`), which moves and turns with it as one rigid pair (you go left, the copy goes right; you turn
clockwise, it turns the other way). The line is not a wall: the piece may cross it and meet its own reflection, the two
overlapping where they meet, and on an odd width the centre column is its own mirror. Everything that asks where a
piece is sees the pair (the engine's `placed`): fitting, the ghost, setting, Best Fit, and the room a held or swapped
piece is given, so either half stops the pair and it lands when either half rests, even on a board that is not
symmetric. A piece appears centred in the left half (one wider than the half, centred on the board). A lock is one piece
(its shape counted once) that placed the pair's cells; a twist reads the piece's own box. Items act at both spots
(`targets`): two drill bits, two bombs, two black holes, the pair's laser rows; a Patch goes into a covered hole only
where its copy's hole is open in the same row, else lands like a block; a Ghost is a pair. Tornado shuffles the left
half and gives the right half the reflection of that order (an odd width's centre column stays put); Settle and
Trapdoor are as ever; Mirror World is refused ("Not on a Mirror board"). Mirror is never in Race or Battle.

*Pay* — the copy is placed by the piece, never by hand, so a piece is worth its pair's cells: `copies` 2, E doubled
(8 on Normal shapes, f ½), so a row pays w/20 Standard lines (half a Standard single on a Mirror board 10 wide) and a
quad is still four rows, paying half; the streak's links count by that worth, so quads come twice as often and each is
half a link. `wEff` is w/2: the feats count on a Mirror board 20 wide; Full Blast and Event Horizon count one half
(`comboCount`: the larger half, an odd width's centre column in each). Measured with a streak bot (quads in a streak,
hold, the real controls; `scripts/mirror-unit.cjs`), a Mirror board earns no more per action than Standard at 10, 11
and 20 wide, and no more per piece than Standard at 10, 11 and 20; at 10 no more per piece than a plain board 10 wide.
(At 20, where a row is a Standard line, it plays like Standard; a plain board 20 wide pays less, its easy streaks
counting less, so Standard is the measure there.) **Butterfly** (45): clear the whole board by hand on a Mirror board 20 wide.

*The look* (`js/mirrorview.js`) — the copy is drawn at 0.8 of the piece's opacity, so the piece you steer reads first;
the pair's ghost in full. The line is still and runs through the open well, never across a block: on an even width a
1.5 px accent line between the middle columns at 0.35, on an odd width the centre column tinted, a hairline on each
edge. The same line is on the New board preview and the library's thumbnails. *Controls* — keys steer the piece. A mouse pointed on the copy's side of the line aims the copy,
so the copy lands under the pointer; a touch that starts on the copy's side turns that gesture's sideways moves round,
so the copy follows the finger. Taps are unchanged.

### Physics
A modifier (Modifiers ▸ Physics, with its *Material* under the switch; the rules in `js/physics.js`, the look and Free
Play's controller in `js/physicsview.js`). Falling blocks with physics.

*The piece in play is yours until you let it go.* It is rigid and it never falls by itself (as everywhere in Relaxed
play); touching a body or the floor never sets it. ← → move it a column, the turns turn it, hold holds it, and ↓ takes
it down smoothly (10 cells/s) until it rests on what is below, where it stays. It moves through nothing: a move or a
turn into bodies *shoves* them (they are moved out of its way, set moving at 4 cells/s at least, and woken), a few
bodies deep, as long as they can go; a body pinned against a wall, the floor or bodies that cannot move (beyond 0.1 of
overlap) refuses the move or turn. ↓ never presses bodies into the floor. A body that falls or slides onto the piece
rests on it (the piece is a solid, kinematic body in the world, `W.kin`), and when the piece moves away it falls on.
Letting go:
- **Space** (a hard drop; a swipe toward the floor, a click): thrown straight down, landing at 26 cells/s, knocking what
  it hits. Already resting on something, it is set down gently instead.
- **↓ again while it rests** (a fresh press), or ↓ **held** against what it rests on for a quarter second (`REST_HOLD`;
  a drag down on touch and the mouse wheel count as held): set down gently (at most 2 cells/s).
- **Physics + Classic**: Classic's gravity moves it, row by row, rigid; it is set by Classic's lock delay while it rests
  (not on first contact), or by ↓ on the stack and the hard drop as Classic has them.

Let go, it *becomes* a soft body and the next piece appears at once while the bodies go on moving. There is no ghost:
where a piece lands depends on bodies still moving.

*Materials* are numbers (`Physics.MATERIALS`): the whole body's pull toward its shape (stiffness), each mino's pull
toward its square (mino), each mino edge's pull toward its length (edge: squash), flow (plasticity) with its yield and
drift bound, area, wobble, restitution, friction, density, damping. **Jelly** is the only one for now: soft and
malleable (it bends over an edge, sags across a gap, squishes and wobbles when it lands, and keeps the dents and bends it
took), slippery, bouncy. A new one is a new entry and its button appears under the switch. Reduced motion plays the same
material firmer and with less wobble (its `still` numbers).

*The simulation* runs live, every frame the board is in front, at a fixed step (120 a second, 2 substeps each; a frame
takes as many steps as its time holds, at most a tenth of a second), never solved ahead at the lock. Position-based
dynamics on particles, the way soft-body games do it: every mino is a quad of its four corners (minos of one body share
the corners they meet at; bodies of different pieces never share anything); Verlet-style integration with gravity
(34 cells/s²); shape matching, weak for the whole body and firmer for each mino (bodies bend and sag; each mino stays
about a square); each mino edge holds its length firmly, never more than 12% off (`SQUASH`: squash is stiff, shear and
bend soft, so a stack keeps its height), and no corner strays more than 0.12 from its mino's square (`STRAIN`);
plasticity (under load the rest shape drifts toward the deformed one, past a yield of 0.015, never more than 0.45 from
the grid shape, and the two corners of a mino edge never drift more than 0.15 apart, `BEND`, nor its rest edges more
than 3% from a cell, `REST_SQUASH`: dents and bends are kept, a mino never flattens); each mino keeps its area; the
wobble about each body's own motion is damped; collisions of particles against other bodies' minos (pushed out through
the edge they came in by, else the one facing their own mino; both sides moving), and once a step every pair of minos of
different bodies is tested by separating axes and parted along its least overlap if they overlap at all (whole minos,
no speed made, the closing stopped): two squares turned on each other, a mino sheared across another or one wedged into
another body's notch come apart, and nothing of one piece stays inside another; a split impulse in positions, mild
shock propagation for tall stacks, contact damping, low friction (0.18), a bounce off the floor and walls (0.25 of a
landing faster than 4 cells/s), and a spatial hash grid (one bucket a cell) for every lookup. A body in contact and
slower than 1.2 cells/s as a whole loses 5 of its speed a second (a slow slide or roll settles in a moment; a knock is
untouched). A body still for 0.4 s (its particles on average within 0.04 of where they were, none past 0.12: a corner
flickering in a contact does not count), all it touches still or asleep (or resting on the piece in play), sleeps and
costs nothing; a strike faster than
3 cells/s wakes it and everything resting on it; a clear wakes everything at or above it. Nothing as a whole rises
faster than 9 cells/s.

Measured (`PHYSICS_TABLE=1 node scripts/test.cjs`): a stack 15 rows tall settles 0.76 of a row lower and sleeps; a pile of
26 random hard drops (104 minos) stands 13 to 15 rows tall with at most 0.02 of a cell of area of one piece inside
another; a six-long bar across a gap of four sags 0.42 and keeps the bend; a hard drop squishes its minos visibly (their
diagonals up to 0.31 apart). A full 20 × 40 board with every one of its ~650 minos awake costs about 3.4 to 4 ms a frame
in Chromium (the Node test holds it under 8); at rest nothing runs.

*Clears* remove whole minos, never part of one, and are measured on the minos themselves. A band is one mino tall,
centred on a row of minos (the middle of those centred in a grid row, so a row that sagged is met where it is); it clears
the step the minos centred in it, each moving slower than 3 cells/s (never one passing through), *cover* 90% of its area
(less a hair, 3%, for jelly that keeps its area but not its exact square): each mino's own outline, clipped to the band,
on eight lines across it, the spans joined, so overlaps count once and gaps count as gaps. A row of minos sunk into each
other, crowded, zigzagging up and down or spread with holes does not clear; nine well set cells of ten do. Those minos go
at once, what is left of each body it crossed splits into its connected groups (new bodies), and everything above falls
in the frames after. What a clear removes pays at once.

*Pay* is per mino removed, flat: `Physics.WORTH` (0.55) of a cell of a row, by the board's worth (`Library.worth`). No
quads, twists, streak, combos, spotless clears or streak multiplier; a band scores 100 × bands² + 10 a mino.
Fairness (`scripts/physics-test.cjs`): a bot that picks the lowest landing from the bodies' picture and sets each piece
down gently never earns more per piece or per action than a Standard board played by a greedy or key-sparing bot
(measured: 0 to 0.014 a piece at widths 6, 10 and 16 against Standard's 0.38; 0 to 0.004 an action against 0.091).
Hard-drop spam (random columns and turns, a drop every quarter second, 10 × 20) tops out after about 33 pieces with
almost no lines (0 to 0.01 a piece), against Standard's 27 pieces and 0.007 (before the piece was the player's and clears were
measured by area it ran past 600 pieces, clearing 0.41 lines a piece).

*Rewind 5 s* takes Undo's place on a Physics board: the Undo power-up reads "Rewind 5 s" (tray, tooltip, Buy & use, the
Board full card) and costs what Undo costs (one held, or 5 lines). A ring of snapshots, one every quarter second for the
last five seconds (bodies, the piece and its place, hold, the queue and bag, the random stream, the board's numbers);
Rewind goes to the newest one at least five seconds old (or the oldest there is) and takes back what was banked since.
There is no exact Undo history (`R.undo` false).

*The board fills up* when a new piece cannot appear (a body where it would), or when settled bodies (asleep, or slower
than 2 cells/s as a whole) stand above the top line for 1.5 s. Its card is Board full: the board's numbers (Blocks
cleared; no quad, twist, combo or chain tiles), Rewind 5 s (while there is a moment to go back to), Boards and Retire.
Away from the board (another window or app, the pointer gone with Pause when the pointer leaves) it waits at a Paused
card (Space or Resume); a window over it only holds it.

*Combinations.* Physics + Plain and Physics + Classic play; Physics rules out Mirror and Descent, both ways
(`Recipe.conflicts`, "Not with Physics" / "Not with Mirror" / "Not in Descent"), and an edit never switches it on or off
(a Physics board stays Physics). With Classic, Classic drives the piece in play (its gravity curve, levels, level lock,
Next count, randomizer, lock delay, hold and hard drop settings), Physics the bodies; bands count as Classic's lines (its
level, B type's 25). Shapes, sizes 4 × 8 to 20 × 40 and Big play as they are.

*What was cut or changed on Physics boards* (and only there), and why:

| | |
|---|---|
| Undo | Rewind 5 s: there are no placements to take back in a moving world, only moments |
| Ghost | none: the landing spot depends on bodies still moving |
| Control hints | off: they teach placing on the grid |
| Feats, achievements by skill, combos | off (`R.noFeats`): no quads, twists or streaks exist |
| Quads, twists, streak, combo, spotless clear, multiplier | none: a clear is bands of minos, paid flat per mino |
| Best Fit | refused: it weighs placements on a still grid |
| Patch, Ghost, Drill, Bomb, Laser, Black Hole (Tools) | refused: they act on grid cells at the lock |
| Mirror World, Trapdoor, Tornado, Settle | refused: they flip, drop, shuffle or compact a still grid (bodies settle by themselves) |
| Golden Piece, Double or Nothing, Safety Net | refused: Physics pays a flat rate per mino and has no quads or streak |
| Reroll, Turnabout, Pebble, Noodle, Giant, Blueprint, Pick of Three, Order Slip | kept: they change the piece before it lands, which a moving board does not mind |
| Board full card | its own: Rewind 5 s, Boards, Retire; no skill tiles |
| Classic + Physics | its stacked top-out animation is cut (it draws a grid pile over moving bodies); B type's garbage is ruled out (grid cells the bodies could not stand on) |
| Saves | keep the bodies themselves (`x.physics`; no exact replay: the simulation is not deterministic, and needs not be); the save's cells are only a picture of the bodies for the library's thumbnails |

The golden run (`scripts/golden.cjs`) never touches a Physics board and stays identical.

*The look.* Each body is one smooth outline drawn from its particles (rounded at its corners) in the palette's colours
whatever the skin, so every squash, stretch, sag, bend and wobble on screen is the simulation's own; faint seams between
its minos, light along its top, a deeper tone low down, a gloss on its highest mino, a darker rim. The piece in play is
drawn the same way, rigid, where it is. A clear's minos swell and fade where they were (reduced motion: they only fade). Tests:
`scripts/physics-test.cjs` (Node) and `scripts/physics-browser-test.cjs` (the page, a phone, light and dark).

### Classic
A mode (`js/classic.js`, its controller and settings `js/classicview.js`): the board plays by Classic's rules (see
**Classic** under Play) and is a Relaxed board in every other way — made in New board, named, saved and shelved in the
library, resumed exactly, retired and deleted like any other; its row and record say `Classic A` (or B), with its
level. It waits at a Start card (Space, a tap or Start; Edit rules from there too) and after a switch or a reload at a
Paused card; away from the board (another tab, window or app, the pointer gone with Pause when the pointer leaves,
rolled up) it pauses there; a window over it only holds it. Pieces fall by the level's gravity (the modern curve,
as before), spawn flush with the ceiling, and a piece that cannot appear where it appears is the classic top out,
pile and all, then the Game over card (its score, level and lines; Boards, and Play again, which retires the board as
Retire does and starts the next of the same rules at once; Space there too). The score is Classic's (a clear's points
times its level, two a row of hard drop, one of soft drop); the board banks at Classic's rate (0.7 of a line a row,
by the board's worth like every board, times the streak to ×1.5; an unrated board has no streak), so it
never earns faster than Standard. No power-ups (each says Not in Classic; its bar under the board is Music and
Pause), no Undo, no control hints. Its best score, stats (Stats ▸ Classic, and its time) and the Classic achievements
count on a board where the feats count (Normal shapes, 10 wide or more); a level feat counts the levels reached by
lines, as from level 1, so a high start level is no shortcut. The Best shown (start card, status bar, New best) is the best on exactly these rules (the recipe and the
size, `stats.classic.bests`), so a new board of the same rules shows it, and the board's own (carried on by Play
again); Stats ▸ Classic keeps the best of all boards.

*Its settings* — the Mode tab, under Plain, Classic, Descent, Race and Battle, once Classic is chosen, in the spirit of the arcade and
early home-console era:

| Setting | Values | |
|---|---|---|
| Game type | A (endless), B (clear 25 lines) | B ends the board, Cleared (its tag and full view say so), level fixed |
| Start level | 1–15 (default 1) | A type goes up every ten lines from there, never below it |
| Garbage height (B) | 0–5 | the old heights, 0, 3, 5, 8, 10 or 12 rows of 20, scaled to the board; each row about three in five full, never full, grey, never the player's (it pays nothing) |
| Next | 0–5 (default 3) | whatever Settings ▸ Next says |
| Randomizer | 7-bag, Retro random | Retro: a roll of eight, a repeat or the eighth rolled once more of seven (a repeat about one in 28); needs Normal shapes (other shapes bring their own dealer), so other shapes move it to the 7-bag and Normal brings it back |
| Lock timing | Modern, Retro | Modern: half a second, renewed by a move or a turn up to 15 times (a held ↓ never sets). Retro: as on 8-bit consoles, no lock timer: pieces fall by the old frames a row (NTSC; level 1 is its level 0: 48 frames, then 43, 38 … 2 at its level 19, 1 at 29), the gravity tick that cannot move the piece down sets it, moving or turning buys nothing, and ↓ held onto the stack sets it |
| Music | Hush, Off | the one Classic track there is (the bar's Music button and Settings ▸ Sound ▸ Classic music still turn it off everywhere) |
| Drop, Hold, Shadow | on or off | drop off: Space, a click and a flick down do nothing; hold off: no Hold; shadow off: no landing shadow drawn |
| Level lock | on or off (default off) | on: the level stays at the start level all game, so gravity never speeds up; the score as ever; the status bar and the board's label say `Level 5 (locked)`; no level feat or level record (it reaches no level by lines) |

Left out: the old consoles' own speed table and 0–19 levels (the levels stay the modern curve Classic has always had, so
its records and achievements keep meaning what they did), DAS and ARE timing (movement is the keyboard's repeat and
the touch gestures, as everywhere in Lull), and B type's "height" variants beyond the six. It composes with the
board size, the shape sets (unrated ones pay without a streak), Mirror and Physics; Descent is another mode.

### Descent
A mode (`js/descent.js`, its controller, look and window `js/descentview.js`): a second stack hangs upside down from
the top of the well and lowers, lane by lane (each column is a lane). Your line clears are the weapon: every cell of a
cleared row fires one shot up its lane at the lowest hanging block, and the piece the cell came from decides the shot.
Where a hanging block reaches your stack it fuses into the board as stone, and the play space closes in from above; the
board ends as any Relaxed board does, when the next piece has no room (Topped out). A stage has a set depth: when none
of it is left (broken, or fused) the stage is Cleared; Endless never runs out. Pieces never fall by themselves: the
descent sets the pace. A board is at least 8 × 14 (the shapes' own minimum height plus 6); it is kept for its life
(no Edit rules into or out of it). Physics and Mirror are not in Descent ("Not in Descent" / "Not with Physics" /
"Not with Mirror", the last choice wins); it combines with every shape set.

*Lanes.* Each lane lowers on its own timer, always announced: a short bar over the lane's top fills toward its next
lowering, and in its last two seconds the cell it moves into is outlined (warm where the block would fuse). The rows
still to come wait above the well, so a lane fills its column from its lowest block to the ceiling; a lane running short
hangs from a thin rod, so nothing of yours ever gets above it. Lowering onto your stack, stone or the floor: the lowest
block fuses where it is, into stone (`FOREIGN | STONE`: a row's cell like any other, so it always clears with its row,
pays nothing, and fires nothing). The piece in play right under a lane is nudged down a row; where it cannot be, the
lane waits for it. Pieces appear under the descent, as high as they fit with nothing but hanging cells over them (never
in a pocket of the stack). A row holding a hanging cell never clears, hanging cells stay put through a clear, and no
power-up removes one; Tornado, Trapdoor, Mirror World and Best Fit are refused ("Not in Descent").

*Shots* (each cell remembers its piece in `CELL.SHOT`, bits 10–12):

| Piece | Shot |
|---|---|
| I | pierce: two hits up its lane |
| O | heavy: 2 damage |
| T | spread: its lane and both beside it |
| S, Z | push: its lane's hanging stack back up a row |
| L, J | angle: the lane its foot points to (L right, J left; at a wall its own) |
| stone | nothing |
| other shapes | by their form, on their spawn turn: one line pierces (I5, I3, the domino, the mono); a 2 × 2 inside is heavy (P); a cell with three neighbours spreads (X, F, Y, T5); one bend angles toward its corner's side (L5, V); more bends push (N, W, Z5, U); a cluster fires a plain hit; Big pieces as their base |

*Clears.* Double, Triple, Quad: a volley a row. A twist's volley (a mini too) breaks armour. A streak adds 1 to
every hit. Each clear of a combo holds every lane's next lowering back a second. A spotless clear (hanging blocks do not
count against it) breaks every lane's lowest block outright, armour and locks too.

*Blocks* (glass and stone, no creatures):

| Block | Look | Rule |
|---|---|---|
| Glass | a clear pane, a slow shimmer | 1 hit |
| Dense | smoky and thicker, cracked once hit | 2 hits |
| Armoured | banded top and bottom | only a twist volley (or a spotless clear) breaks it; it shields its lane |
| Prism | faceted | when broken, also hits both lanes beside it |
| Drip | a bead underneath | as the lowest block, lets a single stone fall into its lane every 8 s (the bead swells and the landing cell shows 2 s before; it waits for the piece in play) |
| Weight | dark, two chevrons | as the lowest block, its lane lowers 2 rows at a time, half as often again |
| Echo | a doubled outline | fusing, leaves a second stone beside it |
| Lock | a keyhole, a notch toward a neighbour | cannot be hit while the lane it points to hangs lower (two locks never hold each other) |

*Stages* — 12, laid out the same every time (their own stream: level, stage and width), each teaching one block or clear,
then mixing: 1 Glass, 2 Dense, 3 Push, 4 Prism, 5 Weight, 6 Armour, 7 Combo, 8 Drip, 9 Echo, 10 Lock, 11 Streak, 12
The deep; and Endless (on the board's own stream, kinds coming in as rows are broken, a hundredth faster a row to 0.55 of
its pace; its score is rows broken). The Ready card says the stage's one line ("Dense blocks take two hits. An O hits for
two."). On shapes with no T, armour is dense.

| | Easy | Medium | Hard |
|---|---|---|---|
| A lane's seconds between lowerings (10 × 20) | 13 | 9.5 | 7.5 |
| Lanes' paces | one | ±12% | ±30% (uneven, fixed per stage) |
| Hanging at the start | a quarter of the well | 0.3 | 0.3 |
| Kinds a stage | 1–2 | 1–4 | up to all 8 |
| Depth (rows) | 5–9 | 6–10 | 7–11 |

Stages 3 and 7 run faster (0.85, 0.8), 6 slower (1.1). Narrower boards' lanes are no slower than by width (×w/10, 0.6–1.4),
taller ones slower by height.

*How hard* (`scripts/descent-unit.cjs`, 10 × 20, a piece every 2 s, 2 seeds a stage): a careful bot (Dellacherie-style weights
with the room under the descent, twists where armour hangs lowest) clears Easy 23/24, Medium 22/24 and Hard 15/24 (Hard
11 and 12 mostly beat it); a careless one (any spot) clears none of Hard's 24, topping out within half a minute.

*Pay* — lines as usual for clears, by the board's rules (rated as its shape set is); only own cells pay, and a row
holding stone is plain (never a quad, no streak link). The descent itself pays nothing. Measured with the bot at a piece
every 1 and 2 s on stages 1, 4, 7, 10 and Endless: 0.368 / 0.372 / 0.353 lines a piece (Easy / Medium / Hard) against
Standard's 0.403, and 0.088 / 0.089 / 0.085 an action against 0.097.

*Rewind 5 s* — Undo's place (no exact Undo): a snapshot of the whole game every 0.2 s of play; it goes back five seconds
of play (the board, the descent, the piece, the queue, the numbers and what was banked since), costs an Undo (5), and
waits at the Paused card. From the Topped out card too.

*In Free Play* — a new board waits at its Ready card (Descent, "Stage 3 · Hard", the stage's line; Boards, Start,
Space or a tap). Away from the board (another tab, window or app, the page hidden, a window over it, the window losing
focus, rolled up) and on P it pauses at the Paused card ("Stage 3 · Hard · 1:24"; Resume). Stage, Broken (rows broken:
blocks broken over the lanes; its tip the rows left) and Next (the next lowering, its tip the lane) take Score's place
in the status bar, Lines steps aside on a phone, and a Pause button ends the row. Cleared: the stage, its rows and time,
Boards and the next stage (Space: this board retired as cleared, the next stage of the same level and size at its Ready
card; after 12, Endless). Topped out: the rows broken, Rewind 5 s, Boards and Try again (Space: the same stage anew). The
library tags a cleared board Cleared (an Endless one its rows); its summary adds Rows broken, Stone and Time; Stats ▸
Free Play has a Descent section (time, stages cleared, blocks broken, turned to stone, topped out, stages cleared on each
level, Endless best). The New board window's Mode tab has Descent between Classic and Race, its level row and a Stage
stepper (1–12, Endless) with how many of the 12 are cleared on that level (the stage's number marked when cleared); the
preview shows the hanging rows. Shots are thin lines of light from the cleared cells to what they hit; a broken block
fades out; with reduced motion nothing shimmers. No red rim. Tests: `scripts/descent-unit.cjs` (Node) and
`scripts/descent-test.cjs` (the page, phones, both themes).

*Achievements* (their own group): **Daylight** (30) clear a stage; **Unlocked** (40) break a lock; **Through the Armour**
(80) break an armoured block with a twist; **Clean Sky** (100) a spotless clear on a Descent board; **Fifty Down** (120)
break 50 rows on one Endless board; **All Twelve** (200) clear all 12 stages on one level; **The Deep** (250, legend)
clear stage 12 on Hard.

### Editing a board's rules
Every saved board that has not ended (the board in play too, and from a Classic board's Start and Paused card) has
Edit rules on its library row: the New board window on that board's size and recipe, with Apply. Its price is on it:
20 lines for each section changed (Size, Shapes, Modifiers, Mode; a mode's own settings are its section; Classic's
music alone is free), nothing when nothing changed (`Recipe.editPrice`, `EDIT_PRICE`). A size keeps the stack:
columns come and go on the right, rows at the top, and a size that would cut a block is refused with the reason
("Blocks stand in the rows it would lose"), Apply quiet (`Library.reshape`); the preview shows the stack at the size
chosen. Descent is kept for a board's life: an edit neither makes a board Descent nor changes one
(`Recipe.editConflicts`: a part's `editFixed`). Apply rebuilds the board (`Library.rebuild`): the stack, its numbers
and every other part's state stay, the piece in play comes again first as the new rules place it (no room: refused),
another dealer starts its own bag, the mode it left drops its state, and the Undo history is cleared; short of lines,
Not enough lines and nothing changes. Pay stays fair: an edit only costs, and every board, however edited, pays by its
own rules, never faster than Standard.

### Race
A mode (`js/race.js`, its controller, view and window `js/raceview.js`; what it shares with Battle: `js/versus.js`, `js/versusview.js`): your board against an opponent's, the
first to fill every cell of its board wins the round. No row ever clears. A board is 6–12 wide and 6–12 rows (the
Height stepper is named Rows; presets Quick 8 × 8, Standard 10 × 10, Long 10 × 12), and over its rows sits a buffer of
k rows (4 for Normal shapes, 3 Tiny, 5 Frantic and Pentominoes; `R.k`), where pieces come in, move and turn. A piece
must touch the board to set ("Set it on your board"); what it leaves in the buffer is trimmed away (and fades). Big,
Custom with groups over 5 blocks or Clusters, Mirror and Physics are not in Race; Classic, Descent and Battle are other modes.
A Race board keeps its rules (no Edit rules); the opponent can be changed between rounds.

*Send* — S sends the piece in play to the opponent; Shift+S, or a tap or click on the first Next slot, sends the first
Next piece. Send is ready once every six pieces you set (a ring of six on the Send button fills as they go), and a piece
sent to you goes to the front of your queue, after any sent before it, ringed in Next and outlined in play; it can be
neither held nor sent on. (Shift alone holds when it is let go, so Shift+S never holds.)

*Sealed gaps and Gap fillers* — an empty cell of the board that no piece of the set can reach (every turn of every
shape, from the top, sideways and down, as the engine moves: `Race.cover`, on bit rows, 0.05 ms typical) is a sealed
gap, drawn with a soft hatch. A piece you sent that seals a new gap as the opponent sets it earns you a Gap filler (two
at most, the dots on Send); a filler held fills your own sealed gaps at once, one region each, lowest first, with stone
(`FOREIGN | FILL`: never yours, never paid). A board that cannot be finished (closed: every empty cell sealed and no
filler held), or whose next piece cannot be set anywhere (in play, held, or sent on), starts over: a short fade, then
empty, the queue kept. Start over does the same on purpose (press twice: "Start over?" waits 3 s).

*The opponent* — four levels, apart mostly in pace:

| | Easy | Steady | Brisk | Swift |
|---|---|---|---|---|
| Seconds a piece (±30%) | 4.5 | 3.2 | 2.3 | 1.6 |
| Judgement (noise) | 8 | 4 | 1 | 0 |
| A piece that seals a gap on purpose (on one sent to it) | 1.2% (10%) | 0.6% (6%) | 0.2% (3%) | 0 (1%) |
| Looks at the next piece | no | no | its best 5 | its best 8 |
| Sends a piece that | costs it 100 | costs it 70 | costs it 50, or hurts you | costs it 35, or hurts you |
| Starts over with a gap below | 35% full | 45% | 50% | 50% |
| Moves a second | 8 | 10 | 12 | 14 |

Every piece it considers every spot it can reach (a search over turn, column and row with the engine's own kicks), scores
the board each would leave (sealed cells, covered cells, bumps, deep pits, cells left in the buffer, height), judges its
best five again by the cover, and plays the chosen spot's path move by move at its pace, so it tucks under overhangs
where you can see it (with reduced motion it jumps there). It holds like you do. It thinks in slices of under a
millisecond a frame (a generator), so the page never stutters. Measured (`scripts/race-unit.cjs`, 20 rounds each):
Swift beats Easy 20 of 20; a player setting a piece every 3 s with Steady's judgement beats Easy 17 of 20.

*In Free Play* — the opponent's board is on top, turned 180° as if seen across the table (its pieces keep their
shape), a little fainter, with no trays; the two buffers meet at a line in the middle; your board and its trays are
below. The opponent is drawn at your scale while your cells stay 16 px or more, and shrinks to half yours at the least
(on a 320 × 568 phone a Long board of Pentominoes is 11 px yours, 5.5 px theirs). A round starts at the Ready card
(Race, vs Steady; Start or Space) with 3-2-1; away from the board (another tab, window or app, the page hidden, a
window over it, the window losing focus, rolled up) it pauses at the Paused card, and Resume counts down again; a board
reloaded comes back paused. Race and Battle are the Relaxed boards with an opponent and a clock. The status bar reads You 64% · Steady 58%
(the tally in its tip); the bar under the board is Send, Start over and Pause (P). No power-ups, Undo, Luck, control
hints, shake or red rim. The End card says You win or Opponent wins, both boards' fill, the tally, the time and what it
paid, with Rematch (Space), Boards, Retire and the opponent for the next round. The library row reads "10 × 10 · Race"
and "vs Steady 3–2"; its summary adds the tally and rounds; Stats ▸ Free Play has a Race section (rounds, won, lost,
most in a row, sent, Gap fillers, started over, by opponent, time).

*Pay* — once a round, for your board as the round ends: a tenth of a line for each of your own cells on it, times the
set's `f` (min(1, 4/E)), times the opponent's D (Easy 0.4, Steady 0.55, Brisk 0.7, Swift 0.85), half for a loss. Cells
lost to a start over never pay, nor do fillers. A perfect round against Swift is 0.34 a piece at most (Standard pays
0.37–0.39); measured in simulated rounds it is 0.11–0.21. It counts toward lifetime lines and the power-ups earned by
lines (counted from the board's first round), never toward the Free Play board records. *Achievements* (their own
group; wins count against Steady or harder, on boards of 64 cells or more): **Return to Sender** (30) earn a Gap filler;
**Across the Middle** (40) win a round; **Second Wind** (80) win after starting over in that round; **Head to Head**
(100) beat Brisk; **Seamless** (120) win with no gap sealed and no start over; **Three Straight** (150) win 3 rounds in
a row on one board; **Swifter Still** (250, legend) beat Swift.

### Battle
A mode (`js/battle.js`, its controller, view and window `js/battleview.js`; the two-board view, the opponent's search,
the cards and the countdown are Race's, shared in `js/versus.js` and `js/versusview.js`): your board against an
opponent's, both played as plain boards (rows clear, pieces float as everywhere in Relaxed play). A board is 6–12 wide
and 10–16 high (presets Quick 8 × 12, Standard 10 × 14, Long 10 × 16); Big, Custom with groups over 5 blocks or
Clusters, Mirror and Physics are not in Battle. A Battle board keeps its rules (no Edit rules); the opponent can be
changed between rounds. No power-ups, Undo, Luck, control hints or red rim.

*Charges and throws* — every row you clear is a charge, six at most (the dots on Throw: a quad is four). T (or Throw)
aims the piece in play at the opponent's board: a shadow comes up there, across from your piece and turned as it looks
to you, with a faint band down the columns it falls through. ← → move it (the screen's way: their board is turned), ↑, X,
Z and A turn it, Space or Enter throws, Esc or T cancels. It drops from their top (under their ceiling) straight down and
rests on their stack, exactly where the shadow was; their piece in play is not in its way (if the landing covers it, it
comes in again where pieces appear). A turn with no room at their top shows dashed in red and is not thrown ("No room
there"). Your next piece comes in; the charge is spent. The cells thrown are theirs from then on: they clear as their
own rows do, and a row the throw itself completes clears for them at once and gives them its charge (a backfire). While
you aim, your piece waits; the clock and the opponent do not. By touch: Throw, then a drag moves the shadow, a tap on
their board moves it there (a tap on the shadow throws), a tap on your board turns it, a swipe down throws; the bar
reads Cancel and Throw here. With a mouse the shadow follows the pointer over their board and a click there throws.

*Winning* — a board whose next piece cannot come in near where pieces appear (no room is searched for, as Classic) is
out, and the round is the other's. From 3:00 both ceilings come down a row every 20 s (sudden death): the row turns to
stone (`STONE`: never yours, never cleared, what was there is crushed), rows under it clear as ever and the stone stays,
pieces come in under it, and a piece in play it reaches moves down a row or two, or comes in again. When both boards are
out at once, the one with more cells is out; level, the opponent.

*The opponent* — four levels, apart in pace, judgement and throwing:

| | Easy | Steady | Brisk | Swift |
|---|---|---|---|---|
| Seconds a piece (±30%) | 4.5 | 3.2 | 2.3 | 1.6 |
| Judgement (noise) | 9 | 4 | 1 | 0 |
| Looks at the next piece | no | no | its best 5 | its best 8 |
| Throws | a third of its pieces while it holds a charge | with two charges | with three, or with a piece bad for its board | once you are within 6 rows of the top, with six, or with three and a bad piece |
| Aims | anywhere | onto your highest column | where your board is worst after it: wells and T-slots | the same, and where your next piece has no room |
| Moves a second | 8 | 10 | 12 | 14 |

It searches every spot a piece can reach (Race's search) and scores the board each leaves, rows cleared (height,
holes and the cells over them, bumps, deep wells, a stack near the top); it never aims a throw that would clear a row for
you when another aim is clean. It plays its path move by move (with reduced motion it jumps there), holds like you do,
and plays on whatever is thrown at it. Its throw is shown on your board first: a dashed amber shadow for 0.8 s where it
will land, then it lands. It thinks in slices of under a millisecond a frame. Measured (`scripts/battle-unit.cjs`, 20
rounds each): Swift beats Easy 20 of 20; a player setting a piece every 3 s with Steady's judgement and throwing beats
Easy 20 of 20.

*In Free Play* — the two boards are laid out as Race's (theirs on top, turned 180°, a little fainter, at your scale while
your cells stay 16 px or more, half yours at the least). A round starts at the Ready card (Battle, vs Steady; Start or
Space) with 3-2-1, and pauses away from the board as Race's does; a board reloaded comes back paused. The status bar
reads You 5 · Steady 3 (rows cleared; the tally in the tip) and the round's time, amber once the ceilings come down; the
bar under the board is Throw (44 px, its six charge dots) and Pause (P). The End card says You win or Opponent wins, the
rows each cleared, the tally, the time and what it paid, with Rematch (Space), Boards, Retire and the opponent for the
next round. The library row reads "10 × 14 · Battle" and "vs Steady 3–2"; Stats ▸ Free Play has a Battle section
(rounds, won, lost, most in a row, rows cleared, thrown, backfired, won in sudden death, by opponent, time).

*Pay* — once a round: a Standard row's worth (w/10 × the set's `f`) for each row you cleared, at most a Standard piece's
worth (E/10 × `f`) for each piece you set, so thrown and backfired rows never pay more than your own pieces could; times
the opponent's D (Easy 0.4, Steady 0.55, Brisk 0.7, Swift 0.85), half for a loss. At most 0.34 a piece (Standard pays
0.37–0.39); measured in simulated rounds it is 0.09–0.20 a piece, less a piece or a throw. It counts toward lifetime lines
and the power-ups earned by lines, never toward the Free Play board records. *Achievements* (their own group; wins count
against Steady or harder, on boards of 96 cells or more): **Special Delivery** (30) throw a piece; **Over the Top** (40)
win a round; **Full Hand** (50) hold six charges; **Backfire** (60) clear a row with a piece thrown at you; **Fair
Fight** (100) beat Brisk; **Under the Wire** (120) win after the ceilings start coming down; **Hat Trick** (150) win 3
rounds in a row on one board; **Fastest Arm** (250, legend) beat Swift.

### Mural
A mode (`js/mural.js`, its controller, look and window `js/muralview.js`, `css/mural.css`): a picture becomes the
board's target. It is cut into pieces that cover the whole well with no gap, and they come in one fixed order, bottom up,
each already carrying its colours. Every block is split into 2 × 2 quarter cells, each its own colour, so the picture has
twice the board's resolution each way (16 × 20 quarters on level 1's 8 × 10, 40 × 72 on the largest board, 20 × 36: a
bigger board shows more detail); a piece's quarters turn with it,
on the board, in play and in Next. Nothing falls by itself, no line ever clears, there is no clock and nothing to lose:
time counts only while the board is used (its own `timeMs.mural`).

*Its place.* The spot the piece in play belongs in is outlined on the board (an accent line over a soft halo, its
quarters lightly in it; the ghost is a plain outline). The outline says whether the piece's turn is right: dashed while
it is in another turn, solid once its turn matches. A small badge on the place's top corner, drawn over the piece, says
the same plainly: an arrow round the way to turn it, with the presses in it past one, or a tick once the turn is right,
filled when a drop would set it there. Nothing in it moves (the same under reduced motion), and it reads on either theme
(`turnBadge` in `js/muralview.js`).

*One turn button*, as in puzzles: by default the single turn button (Up, or a right-click) places every piece:
clockwise, or counter-clockwise under Inverted Controls. The piece appears at the top in another turn than its place
wherever that looks different (its shape, or its quarters), one press of that button away (two only when one press away
cannot reach its place), nearest the middle, where its place can be reached turning only that way and only in place or
nudged sideways off a wall (one column, two for a long piece), never by a kick that hops it down or through a gap
(`reach` with a turn, `prefOf`, `spawnSpot`); with none, in its own turn right over its place (rare: a few
pieces in a thousand, Pentominoes on large boards). So the badge only ever shows that button's arrow (or a tick); the other key turned three times is
the arrow with a 3. Settings ▸ Controls ▸ Counter-clockwise puzzles on: pieces appear turned either way or a half turn,
reached by turns either way and any kick, and the badge shows either arrow or a 2. A piece whose every turn looks the
same appears in its place's turn. The turn is read as each piece appears (`setTurnMode`, from the settings).

*The buffer*, as Race's: 4 rows over the picture (`R.k`; the board's size is the picture's, the buffer on top of it),
where nothing ever sets. While the stack is low it is hidden and pieces appear at the picture's top; once the stack (or
the piece's place) reaches the picture's top 2 rows it opens, once, for good: the board grows smoothly to show it (cells
a little smaller so all of it fits; at once under reduced motion). While it is shut a piece can't be moved or turned into
it (such a move simply doesn't happen), so it never shows for a moment; it is drawn as
a soft band over a dashed top edge, and pieces appear at its top, so the picture's last rows are reached by the same
moves and the same one-button turns as the rest. A finished mural shows only its picture. A board saved before the
buffer opens with it added.

A piece must be turned and moved into its place by hand: a drop or a set anywhere else, or in
another turn, simply does not happen (the piece stays where it was; no sound, no shake, no note; the outline brightens
once). Hold is off; Undo, the hints and every power-up are off ("Not in Mural"). The last piece set: the **Finished**
card (Boards; Look, which hides it to show the whole picture, Space or a tap brings it back; New board, which keeps the
mural in the library, tagged Finished, and opens the New board window). A finished mural is drawn flat, no gaps, and
stays viewable in the library (its thumbnail and full view in the picture's colours). Status bar: Placed "n of N" and
Level; under the board, a slim progress track.

*The cut, different every time.* Every new mural is cut from a fresh random seed, so its pieces, their order and their
places differ each time, even for the same picture, level, size and set; started over (Retry), it is cut anew. A saved
board keeps its seed (`x.mural = { v: 2, seed, i }`) and resumes exactly. The cells are taken bottom up, left to right,
and the first free cell is covered next, by a piece whose every cell rests on the floor, on an earlier piece or on its
own cells: every cell under a piece belongs to an earlier one and every cell over it to a later one, so the order made is
the order dealt, each piece drops straight down into its place, and no order can cycle. **Mixed** grows each piece from
that cell (left, right or up) to a size drawn from the level's shares (the table). **Normal**, **Pentominoes** and
**Frantic** search (`cut`): candidates in a weighted, shuffled order from the seed, backtracking wherever a closed gap is
left whose size the set's pieces cannot make; a piece may reach up to 2 rows over the picture into the buffer, and what
it leaves there is trimmed as it sets and fades (Race's rule), so the top row never needs exact small pieces. Past a
budget of tries a gap with no piece left would take a single block (counted: none in any test so far). Each cut is then
**checked by playing it** (`verify`): every piece, in order, from where it appears, reached turning only clockwise and
again only counter-clockwise (both ways reaches at least as much), the picture covered exactly once; a cut that failed
would be cut again from the next seed (at most 4; deterministic, so a resumed board gets the same one). So a dealt mural
is always solvable with the one turn button. A plan is cached by recipe, seed and size. Times (cut and checked, a fresh
seed): about 30-45 ms at 16 × 26 and 85-135 ms at 20 × 36 in Node; in Chromium at 4 × CPU throttle 120-270 ms at
16 × 26 and 420-510 ms at 20 × 36 (`scripts/mural-unit.cjs`, `scripts/mural-test.cjs`). Unit tests cut every built-in
picture at levels 1-5 in each set (exact cover, order, the check, the same cut for the same seed, fallbacks reported),
and 200 random seeds a set over pictures, sizes and levels, with no unsolvable plan.

| Level | Size (default) | Colours (a photo) | Mixed: pieces of 1 / 2 / 3 / 4 blocks aimed for |
|---|---|---|---|
| 1 | 8 × 10 | 3 (5) | 24 / 34 / 28 / 14 % |
| 2 | 10 × 14 | 4 (7) | 14 / 28 / 32 / 26 % |
| 3 | 12 × 18 | 6 (10) | 8 / 20 / 32 / 40 % |
| 4 | 14 × 22 | 8 (13) | 5 / 14 / 28 / 53 % |
| 5 | 16 × 26 | 10 (16) | 3 / 10 / 22 / 65 % |

The level sets the colours (and Mixed's share of small pieces); the size is free. A board can be 6-20 wide and 8-36 tall
(the picture's rows; the buffer's 4 are on top). The largest, 20 × 36, keeps a quarter at 4 px at 320 × 568 (7.5 px at
390 × 844), its buffer open, everything fitting.

*Pictures.* Three of Lull's own, drawn as functions of the point (4 × 4 samples a quarter): **Coast** (a coastline at
dusk: a headland and lighthouse, a setting sun on the sea, sand), **Still life** (a bowl of fruit before a window) and
**Abstract** (soft shapes). Each has its own colours, most needed first; at K colours every quarter takes the nearest of
the first K (OKLab), each then the mean of its quarters, so a bowl stays blue at three. A **Photo**: the Photo chip
opens the system's file picker (the macOS app answers the page's file input with an open panel for images,
`Sources/Lull/PhotoPicker.swift`; the Home Screen web app and browsers their own), then the Photo window: the photo with a
frame of the board's shape (the size chosen in the window; drag it, or the arrows; Zoom), the frame showing the mural
it makes. On the device, the crop
is read at the photo's own pixels and area-averaged to quarters in linear light (as light mixes, so edges and fine
patterns never go muddy), then quantised to the level's photo colours (more than a built-in picture's: the table) in
OKLab, the same every time: the quarters gathered in small boxes, each weighed by the root of its count and by how vivid
it is (a small red flower on a dull field keeps a colour of its own), the first colours picked farthest first, k-means
settling them, and each colour its quarters' mean lightness and hue at their mean chroma (so averaging never greys a
colour out). The colours are drawn exactly as kept: no theme, palette or skin touches them. Measured on generated photos
(vivid primaries, skin tones, a face, a street at dusk, a small flower and door on a dull field: `scripts/mural-photos.cjs`),
the mean OKLab error a quarter, the chroma kept on vivid quarters and the distance of each feature colour from the
palette each meet a mark at levels 1, 3 and 5 (`scripts/mural-unit.cjs`). Use photo keeps only the small grid in the recipe
(`mural.own = { w, h, pal, px }`, one base-36 digit a quarter: about 1-2 KB), never the photo. Another level or size with the
photo still at hand crops it again (Create too, for the size chosen); without it, the grid is resampled and quantised
again.

*Recipe and window.* `mural: { pic: 'coast' | 'still' | 'soft' | 'own', level: 1-5, own? }` and its piece set in
`shapes.preset`: `'normal'` (the seven tetrominoes, the default), `'pentominoes'` (the 18), `'frantic'` (both, the
trominoes, a domino and a single block, weighted as Free Play's Frantic) or `'mixed'` (Mural's own: 1-4 blocks, the
level's shares; its chip shows only on a Mural board, and it is Normal anywhere else); label "Mural · Coast · Level 3", with the set after it
unless Normal. Mode ▸ Mural shows four picture chips and Level 1-5; Shapes offers Normal, Frantic, Pentominoes and
Mixed (no other chip shows there); Size offers the level's size first, then Detailed 16 × 26, Large 18 × 30 and Largest 20 × 36 (those larger than
the level's), and the steppers any size in the limits; choosing Mural or a level brings the level's size unless a size of
its own was set. The preview is the picture at the size shown. It combines with nothing else: Physics, Mirror and the
other shape sets (Tiny, Big, Custom) are off ("Not in Mural"; choosing Mural turns them off), and it keeps its picture
for life (no Edit rules). A board from before sizes and sets (`v: 1`) keeps its level's size and its Mixed cut.

*Pay* — 0.04 of a line for each block set inside the picture (0.04 to 0.2 a piece): a mural bot earns 0.10–0.14 a piece and
0.02–0.03 an action, against a careful Standard bot's 0.41 and 0.10 (`scripts/mural-unit.cjs`). *Achievements* (their
own group): **First Mural** (30) finish a mural; **Sketch**, **Study**, **Panel**, **Fresco**, **Masterwork** (20, 30,
50, 80, 250 legend) finish one at level 1 to 5; **Your Own** (60) finish one from a photo. *Stats* (Free Play): time,
murals finished, pieces placed, by level, from photos.

## Keys

| | |
|---|---|
| ← → | move |
| ↓ | lower one row; on the stack, a fresh press sets the piece (holding never does) |
| Space | hard drop (for 0.18 s after a piece is set, Space, a click and the ↓ that sets are ignored, so a double press never drops the next piece unseen; moving and turning still work, and Classic's gravity never waits) |
| ↑ / X, Z, A | turn clockwise, counter-clockwise, 180° |
| C / Shift | hold; again to swap back (Free Play and Puzzles: as often as you like). On the Factory tab, Escape closes a part's card |
| ⌫ / U, R, N, H | undo, retry, next puzzle, hint |
| ⌘1–⌘6, ⌘, | tabs (⌘6 the Shop), settings |
| ⌘J | collapse into the title bar, or expand (so does a double-click on the empty bar) |
| P | pause a Classic, Race or Battle board (Space or P starts and resumes it) |
| S, Shift+S | Race: send the piece in play, or the first Next piece (a Race board holds with Shift when it is let go alone) |
| T | Battle: aim the piece in play at the opponent's board (arrows and turns move the shadow, Space or Enter throws, Esc or T cancels) |
| M | mute everything, on any tab (again to unmute) |
| Esc | the Play menu, in a browser when nothing else takes Esc (again, or its X, to close it; in the Mac app Esc tucks the window away, and closes the menu when it is open) |
| mouse: point | slide the piece left and right (at its height; slightly sticky at column edges: the pointer goes 0.15 of a cell past one before the piece follows; mirrored under Inverted Controls; keys keep working while the pointer rests there) |
| left click | drop it straight down — anywhere on the board side (a slip into the next column in the last 0.06 s before the click is ignored) |
| right click | turn clockwise |
| wheel | lower one row (never sets the piece) |
| click HOLD | hold, or swap back |

By touch alone Settings ▸ Keys is Settings ▸ Gestures, and lists the gestures ([Touch](#touch)) instead.

## Touch

Tabs change only by a tap on them (or ⌘1–⌘6): a sideways swipe never changes tab.

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
controls, Drag sensitivity (1–10, the finger travel per cell), Drop swipe (Light, Medium, Firm) and Tap to turn;
Haptics where the device has them (not iPhone: Safari has no vibration). By touch alone, what a phone cannot use goes
([On phones](#iphone-and-ipad)). A long press shows a tooltip; the control hints name the gesture (`Swipe ↓ drops`, `Tap
turns`). A phone held upright gets the whole screen, clear of the notch and home indicator: a title bar of one row
(Lull, Stats, Achievements, the wallet, sound and Settings) and the places to play in the tab bar at the bottom
([Title bar](#lull)), every button at least 44 px, toasts at the top, away from the well; on its side the bars stand
beside the board. No page zoom,
bounce or text selection; there is no window to roll up.

**Window** — the panel floats over every Space, full-screen apps included: it never activates Lull (activating a regular app pulls the screen back to its own Space), so ⌥⌘L shows it right over whatever is in front and hands it the keyboard. When the pointer leaves, Lull dims and fades to 60% (Settings ▸ Window ▸ Fade when the pointer leaves); it comes back as soon as the pointer does.

**Collapse** — the chevron, ⌘J or a double-click on the empty bar (never by touch alone: there is no window to roll up,
and a save rolled up on the Mac opens whole, still saying so for an Export back) rolls Lull up into its title bar, where a parade of
pieces falls along it (`js/collapse.js`): the bar is a well on its side, four lanes deep, and pieces come in from the
left and travel smoothly to the right, each in its own spawn orientation and at its own speed — a game gravity level on
the Classic curve, mostly Level 1–2 drifters (about a cell a second), some Level 3–5 walkers and now and then a Level
7–9 dart — and nobody ever slows down. Lanes and turns are the game's: a whole lane at a time, or a true Lull turn (the
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

node Lull/scripts/test.cjs            # game logic: 750 puzzles replayed through the engine, turns, items, factory, board library, save, economy
node Lull/scripts/econ-test.cjs       # the economy against models of play: bots on the engine, puzzles, the factory, a career (test.cjs runs it)
node Lull/scripts/golden.cjs          # the golden identity run: a default board plays lock for lock as recorded (--write records it)
node Lull/scripts/browser-test.cjs    # the page played in headless Chromium (needs Playwright), then touch-, device-, undo-, retired- and tabbar-test
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
| `Game/` | the game: `index.html`, `manifest.webmanifest`, `sw.js` (the offline copy), `icons/` (the Home Screen icons), `css/`, and `js/` — `webapp` (the Home Screen app: the worker, its updates, lasting storage), `icons` (the one SVG icon set), `pieces` (the seven tetrominoes and Lull's kicks, pentominoes, big and custom shapes, polyomino enumeration, ids that rebuild themselves), `board` (the grid and the one table of cell bits), `recipe` (the board recipe: its parts, rules and limits), `engine` (the floating-piece rules, every item and the recipe's hooks), `items` (the chain multiplier, combos, Luck, the daily gift, power-ups earned in play), `library` (the Relaxed board library: shelved and retired boards, names, caps), `puzzlegen` (seeds, wildcards, reverse construction, reachability search, forward verification), `factory` (the line: droppers, the conveyors and lifts, the store's sand pile, assemblers, the belt and the self-playing board and its placer, in ticks for play and time away alike; the floor's geometry; the sign's moods; `Factory.TUNE`; save repair), `store` (save, catalog, stats), `achievements`, `fxphysics` (the item effects' blocks, debris and dust: gravity, bounces, spirals, fixed pools), `render` (canvas: skins, frames, effects, item animations, rotated views), `factoryview` (the factory floor: its parts, movers and board, its price tags and its dot-matrix sign), `hints` (control hints: the struggle signals, their limits and retirement), `touch` (the touch gestures: a pure reader of fingers, and the page's touch helpers), `webapp` (the Home Screen web app: the offline copy's registration and updates), `collapse` (the window rolled up into its title bar, and the parade of pieces along it), `modes`, `retiredview` (a retired board in full view), `ui`, `app` |
| `Sources/Lull/` | the macOS shell: a borderless `NSPanel` (floating, all Spaces, edge-resizable, draggable by the page's title bar) around a transparent `WKWebView`, a blur for the Glass background, the save file, the ⌥⌘L hot key, and a self-test CI runs |
| `scripts/` | `make-app.sh`, `icon.swift`, `line-glyph.py` (builds the line glyph's font into `lull.css`), `test.cjs`, `browser-test.cjs`, `audio-render.cjs` (renders and measures the synthesized audio offline), `pitch.cjs` (finds the notes in a render, to check sound effects are in the music's key), `voice-clips.cjs` (embeds the announcer's clips with where her speech is and their loudness trims; `voice-measure.cjs` is its measuring tape, shared with `voice-test.cjs`, her checks, run by browser-test), `web-build.cjs` (the site as deployed), `web-icons.cjs` (the Home Screen icons), `web-test.cjs` and `web-browser-test.cjs` (the web app's tests, run by the two above), `touch-test.cjs` (an emulated phone played with gestures, run by browser-test), `device-test.cjs` (what each device is offered in Settings and the bar, and live changes; run by browser-test), `econ-test.cjs` (the economy against models of play: placement bots on the real engine, a puzzle model, the factory measured, a career that spends what it earns; every assumption about players in its one MODEL block; run by test.cjs), `golden.cjs` and `golden.json` (the golden identity run, and its record), `sizes-test.cjs` (board sizes: the New board window, every extreme size, pay by width, layout; run by browser-test), `undo-test.cjs` (every way of buying an Undo, and the cards that offer it at every size; run by browser-test), `retired-test.cjs` (a retired board in full view at every size, by keys and by touch; run by browser-test), `tabbar-test.cjs` (the tab bar at the bottom of a narrow window: every place fits above it, the menu and toasts, wider and rolled up; run by browser-test), `recipe-test.cjs` and `recipe-pixels.json` (the board recipe in the page: the New board window, labels, the controller, and the board drawn pixel for pixel as recorded; run by browser-test) |

## Credits

The announcer's voice clips were generated with ElevenLabs (text to speech; voice "Annie - Whispering British Girl",
model eleven_v4, whispered). Use of ElevenLabs output is governed by the terms of the plan it was generated on (commercial use
needs a paid plan). Classic's music, Hush, is Lull's own. The interface face is Inter by Rasmus Andersson (SIL Open Font License 1.1), embedded in `css/lull.css`.
