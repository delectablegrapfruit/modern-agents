// Lull — achievements: quiet milestones for special, rare or difficult play. They pay lines, turn up as one small
// toast when earned, and otherwise live out of the way under Stats ▸ Achievements. None is a gimme; the hard ones pay
// accordingly.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // on: which event checks it ('play' lock, 'classic' lock or game over, 'puzzle' solve, 'factory', or 'any' — any
  // event, and the app's once-a-minute 'tick').
  // test(state, event) → earned? · progress(state) → [have, need] for the list (optional).
  // Each group is a place to play, coded by colour (css/lull.css: --area-<id>, set on anything with data-area) and by
  // that place's own tab icon, so it reads without the colour too; Lifetime, across all of them, is the neutral one.
  const GROUPS = [
    // "No power-ups on the board" (the skill ones) is said in each description; what it means exactly, once, here.
    // Board sizes (js/library.js): lines count by width, and a board narrower than Standard makes feats easy.
    { id: 'play', name: 'Free Play', icon: 'play', noteTitle: 'How these count',
      note: 'No power-ups on the board: none used since the board was last empty. Luck power-ups, and one taken back before its piece is set, do not count. Lines count by width: a line on a board 5 wide is half of one, on 20 wide two. Feats count on boards 10 wide or more.' },
    { id: 'classic', name: 'Classic', icon: 'classic' },
    { id: 'puzzle', name: 'Puzzles', icon: 'puzzle' },
    { id: 'lull', name: 'Lifetime', icon: 'lifetime' },
    { id: 'factory', name: 'Factory', icon: 'factory' },
  ];

  const LIST = [
    // Free Play — per board, per piece. Relaxed play has no clock and a bag of power-ups, so almost anything could be
    // waited out: the skill ones count only what was done by hand — "no power-ups on the board" (no item that touches the pieces or the
    // board — Rewind included — during the feat, or since the board was last empty; Luck items never count against
    // it: see freshStats in js/engine.js), the score ones only boards without a single item, and a few ask for pace.
    { id: 'quad', group: 'play', name: 'Four at Once', desc: 'Clear 4 lines with one piece. No power-ups on the board.', pay: 15, on: 'play', test: (s, e) => e.r.lines >= 4 && e.r.hand },
    { id: 'tsd', group: 'play', name: 'Twist', desc: 'Clear 2 lines with a T-spin. No power-ups on the board.', pay: 25, on: 'play', test: (s, e) => e.r.tspin && e.r.lines === 2 && e.r.hand },
    { id: 'combo5', group: 'play', name: 'In the Groove', desc: 'Reach a 5-combo. No power-ups on the board.', pay: 40, on: 'play', test: (s, e) => hs(e).hcombo >= 5 },
    { id: 'b2b3', group: 'play', name: 'Back to Back to Back', desc: '3 quads or T-spins back to back. No power-ups on the board.', pay: 50, on: 'play', test: (s, e) => hs(e).hb2b >= 3 },
    { id: 'lines150', group: 'play', name: 'Long Haul', desc: 'Clear 150 lines on one board.', pay: 50, on: 'play', test: (s, e) => std(e.g) >= 150 },
    { id: 'toolbox', group: 'play', name: 'Toolbox', desc: 'Use one power-up of each type on one board.', pay: 50, on: 'play', test: (s, e) => L.ITEM_GROUPS.every((gr) => L.ITEM_ORDER.some((id) => L.ITEMS[id].group === gr.id && (e.g.s.items || {})[id] > 0)) },
    { id: 'score50k', group: 'play', name: 'Fifty Grand', desc: 'Score 50,000 on one board. No power-ups used.', pay: 60, on: 'play', test: (s, e) => e.g.s.score >= 50000 && !usedItems(e.g) },
    { id: 'tst', group: 'play', name: 'Corkscrew', desc: 'Clear 3 lines with a T-spin. No power-ups on the board.', pay: 80, on: 'play', test: (s, e) => e.r.tspin && e.r.lines >= 3 && e.r.hand },
    { id: 'pc', group: 'play', name: 'Clean Slate', desc: 'Clear the whole board. No power-ups on the board.', pay: 120, on: 'play', test: (s, e) => e.r.perfect && e.r.hand },
    { id: 'mini2', group: 'play', name: 'Small Wonder', desc: 'Clear 2 lines with a T-spin Mini. No power-ups on the board.', pay: 150, on: 'play', test: (s, e) => e.r.mini && e.r.lines >= 2 && e.r.hand },
    { id: 'combo10', group: 'play', name: 'Unbroken', desc: 'Reach a 10-combo. No power-ups on the board.', pay: 200, on: 'play', test: (s, e) => hs(e).hcombo >= 10 },
    { id: 'golden_ts', group: 'play', name: 'Gilded Twist', desc: 'T-spin triple while gold is out. No other power-ups on the board.', pay: 200, on: 'play', test: (s, e) => e.r.golden && e.r.tspin && e.r.lines >= 3 && e.r.hand },
    // Pace: the last hundred pieces set by hand, timed on the wall clock (nothing pauses it), clearing 36 lines —
    // a tidy stack at a steady clip.
    { id: 'pace33', group: 'play', name: 'Allegro', desc: '100 pieces in 3 minutes, clearing 36+ lines. No power-ups on the board.', pay: 250, on: 'play', test: (s, e) => pace(e.g, 180e3) },
    { id: 'quads4', group: 'play', name: 'Quartet', desc: '4 quads in a row, no other clears between. No power-ups on the board.', pay: 250, on: 'play', test: (s, e) => hs(e).hquads >= 4 },
    { id: 'lines500', group: 'play', name: 'Marathon', desc: 'Clear 500 lines on one board.', pay: 250, on: 'play', test: (s, e) => std(e.g) >= 500, progress: (s) => [s.stats.free.bestLines, 500] },
    { id: 'b2b8', group: 'play', name: 'Relentless', desc: '8 quads or T-spins back to back. No power-ups on the board.', pay: 300, on: 'play', test: (s, e) => hs(e).hb2b >= 8 },
    { id: 'tst_b2b', group: 'play', name: 'Spiral Staircase', desc: 'A back-to-back T-spin triple. No power-ups on the board.', pay: 300, on: 'play', test: (s, e) => e.r.tspin && e.r.lines >= 3 && e.r.hand && hs(e).hb2b >= 1 },
    { id: 'old_growth', group: 'play', name: 'Old Growth', desc: 'Keep one board for 30 days and 2,000 pieces.', pay: 300, on: 'play', test: (s, e) => e.g.s.pieces >= 2000 && Date.now() - (e.g.s.startedAt || Date.now()) >= 30 * 86400e3 },
    // The perfect-clear opener: ten pieces from an empty board, four lines, nothing left, no items.
    { id: 'pc_open', group: 'play', name: 'Opening Act', desc: 'Clear the whole board within the first 10 pieces. No power-ups used.', pay: 300, on: 'play', test: (s, e) => e.r.perfect && e.g.s.pieces <= 10 && e.g.s.pieces * 4 === e.g.s.lines * e.g.w && !usedItems(e.g) },
    // Power-ups played well: three different power-up combos on one board.
    { id: 'it_showman', group: 'play', name: 'Showman', desc: 'Find 3 different power-up combos on one board.', pay: 300, on: 'play', test: (s, e) => itemCombos(e.g) >= 3 },
    { id: 'pc3', group: 'play', name: 'Spotless', desc: 'Clear the whole board 3 times on one board. No power-ups on the board.', pay: 400, on: 'play', test: (s, e) => (e.g.s.hperfect || 0) >= 3 },
    { id: 'pc_b2b', group: 'play', name: 'Grand Finale', desc: 'A back-to-back quad that clears the whole board. No power-ups on the board.', pay: 400, on: 'play', test: (s, e) => e.r.perfect && e.r.lines >= 4 && e.r.b2b && e.r.hand && hs(e).hb2b >= 1 },
    { id: 'all_items', group: 'play', name: 'Tried Everything', desc: 'Use every power-up once.', pay: 400, on: 'play', test: (s) => itemsTried(s) >= L.ITEM_ORDER.length, progress: (s) => [itemsTried(s), L.ITEM_ORDER.length] },
    { id: 'it_sweep', group: 'play', name: 'Clean Sweep', desc: 'Empty a board of 60+ blocks with one power-up.', pay: 400, on: 'play', test: (s, e) => swept(e) },
    { id: 'score250k', group: 'play', name: 'Quarter Million', desc: 'Score 250,000 on one board. No power-ups used.', pay: 500, on: 'play', test: (s, e) => e.g.s.score >= 250000 && !usedItems(e.g) },
    { id: 'sb_combos', group: 'play', name: 'Tinkerer', desc: 'Find every Free Play combo.', pay: 500, on: 'play', test: (s) => combosFound(s) >= combosAll(), progress: (s) => [combosFound(s), combosAll()] },
    { id: 'tspin100', group: 'play', name: 'Spin Cycle', desc: '100 line-clearing T-spins on one board. No power-ups on the board.', pay: 600, on: 'play', test: (s, e) => (e.g.s.htspins || 0) >= 100 },
    // Forty lines in a hundred pieces is every block cleared: a perfect clear on the hundredth piece.
    { id: 'clean40', group: 'play', name: 'Nothing Left Over', desc: 'Clear 40 lines in the first 100 pieces, ending empty. No power-ups used.', pay: 700, on: 'play', test: (s, e) => e.r.perfect && std(e.g) >= 40 && e.g.s.pieces <= 100 && e.g.s.pieces * 4 === e.g.s.lines * e.g.w && !usedItems(e.g) },

    { id: 'chain20', group: 'play', name: 'Maxed Out', desc: 'Reach a chain of 20. No power-ups on the board.', pay: 800, tier: 'legend', on: 'play', test: (s, e) => hs(e).hchain >= 20 },
    { id: 'pace67', group: 'play', name: 'Presto', desc: '100 pieces in 90 seconds, clearing 36+ lines. No power-ups on the board.', pay: 1000, tier: 'legend', on: 'play', test: (s, e) => pace(e.g, 90e3) },
    { id: 'pc_tspin', group: 'play', name: 'Twist Ending', desc: 'Clear the whole board with a T-spin. No power-ups on the board.', pay: 1000, tier: 'legend', on: 'play', test: (s, e) => e.r.perfect && e.r.tspin && e.r.hand },
    { id: 'quads10', group: 'play', name: 'Ten Tall', desc: '10 quads in a row, no other clears between. No power-ups on the board.', pay: 1200, tier: 'legend', on: 'play', test: (s, e) => hs(e).hquads >= 10 },
    { id: 'pc10', group: 'play', name: 'Perfect Ten', desc: 'Clear the whole board 10 times on one board. No power-ups on the board.', pay: 1500, tier: 'legend', on: 'play', test: (s, e) => (e.g.s.hperfect || 0) >= 10 },
    { id: 'tst10', group: 'play', name: 'Corkscrew Virtuoso', desc: '10 T-spin triples on one board. No power-ups on the board.', pay: 1500, tier: 'legend', on: 'play', test: (s, e) => (e.g.s.htst || 0) >= 10 },
    { id: 'b2b20', group: 'play', name: 'Unbreakable', desc: '20 quads or T-spins back to back. No power-ups on the board.', pay: 1500, tier: 'legend', on: 'play', test: (s, e) => hs(e).hb2b >= 20 },
    { id: 'golden20', group: 'play', name: 'Midas', desc: '5 gold clears in a row on a chain of 20+. No other power-ups on the board.', pay: 1500, tier: 'legend', on: 'play', test: (s, e) => (e.g.s.goldRun || 0) >= 5 },
    { id: 'million', group: 'play', name: 'Pure Million', desc: 'Score 1,000,000 on one board. No power-ups used.', pay: 2000, tier: 'legend', on: 'play', test: (s, e) => e.g.s.score >= 1e6 && !usedItems(e.g) },
    { id: 'purist', group: 'play', name: 'Purist', desc: 'Clear 1,000 lines on one board. No power-ups used.', pay: 2500, tier: 'legend', on: 'play', test: (s, e) => std(e.g) >= 1000 && !usedItems(e.g) },
    { id: 'lines5000', group: 'play', name: 'Evergreen', desc: 'Clear 5,000 lines on one board.', pay: 3000, tier: 'legend', on: 'play', test: (s, e) => std(e.g) >= 5000, progress: (s) => [s.stats.free.bestLines, 5000] },

    // Classic — per game.
    { id: 'cl_tetris4', group: 'classic', name: 'Four Tetrises', desc: '4 tetrises in one game.', pay: 40, on: 'classic', test: (s, e) => e.tetrises >= 4 },
    { id: 'cl_l10', group: 'classic', name: 'Double Digits', desc: 'Reach level 10.', pay: 50, on: 'classic', test: (s, e) => e.level >= 10 },
    { id: 'cl_100k', group: 'classic', name: 'Six Figures', desc: 'Score 100,000 in one game.', pay: 60, on: 'classic', test: (s, e) => e.score >= 100000 },
    { id: 'cl_l15', group: 'classic', name: 'Terminal Velocity', desc: 'Reach level 15.', pay: 150, on: 'classic', test: (s, e) => e.level >= 15 },
    { id: 'cl_300k', group: 'classic', name: 'High Roller', desc: 'Score 300,000 in one game.', pay: 200, on: 'classic', test: (s, e) => e.score >= 300000 },

    { id: 'cl_t25', group: 'classic', name: 'Tetris Machine', desc: '25 tetrises in one game.', pay: 1500, tier: 'legend', on: 'classic', test: (s, e) => e.tetrises >= 25 },
    { id: 'cl_l20', group: 'classic', name: 'Level Twenty', desc: 'Reach level 20.', pay: 1500, tier: 'legend', on: 'classic', test: (s, e) => e.level >= 20 },
    { id: 'cl_1m', group: 'classic', name: 'Classic Million', desc: 'Score 1,000,000 in one game.', pay: 3000, tier: 'legend', on: 'classic', test: (s, e) => e.score >= 1e6 },

    { id: 'cl_games100', group: 'classic', name: 'Regular', desc: 'Play 100 games (1 minute or 10 lines each).', pay: 120, on: 'classic', test: (s) => s.stats.classic.games >= 100, progress: (s) => [s.stats.classic.games, 100] },
    { id: 'cl_tetris10', group: 'classic', name: 'Tetris Ten', desc: '10 tetrises in one game.', pay: 200, on: 'classic', test: (s, e) => e.tetrises >= 10 },
    { id: 'cl_nohold', group: 'classic', name: 'Hands Free', desc: 'Reach level 10 without hold.', pay: 250, on: 'classic', test: (s, e) => e.level >= 10 && !e.g.s.holds },
    { id: 'cl_pc', group: 'classic', name: 'Clean Sweep', desc: 'Clear the whole board.', pay: 300, on: 'classic', test: (s, e) => e.r.perfect },
    { id: 'cl_tst', group: 'classic', name: 'Falling Corkscrew', desc: 'Clear 3 lines with a T-spin.', pay: 300, on: 'classic', test: (s, e) => e.r.tspin && e.r.lines >= 3 },
    { id: 'cl_sprint', group: 'classic', name: 'Sprint', desc: 'Clear 40 lines in 90 seconds.', pay: 300, on: 'classic', test: (s, e) => e.lines >= 40 && e.ms < 90000 },
    { id: 'cl_tspin10', group: 'classic', name: 'Spinning Plates', desc: '10 T-spins in one game.', pay: 350, on: 'classic', test: (s, e) => e.g.s.tspins >= 10 },
    // Streaks and combos are about keeping up: with no clock in Free Play they are a matter of patience there, so the
    // long ones live here, under gravity.
    { id: 'cl_quads4', group: 'classic', name: 'Four on the Floor', desc: '4 tetrises in a row, no other clears between.', pay: 300, on: 'classic', test: (s, e) => (e.g.s.quadRun || 0) >= 4 },
    { id: 'cl_b2b8', group: 'classic', name: 'Under Pressure', desc: '8 tetrises or T-spins back to back.', pay: 600, on: 'classic', test: (s, e) => e.g.s.b2b >= 8 },
    { id: 'cl_combo10', group: 'classic', name: 'Stay Lit', desc: 'Reach a 10-combo.', pay: 400, on: 'classic', test: (s, e) => e.r.combo >= 10 },
    { id: 'cl_allquads', group: 'classic', name: 'Nothing but Tetrises', desc: 'Clear 40 lines in one game with tetrises only.', pay: 700, on: 'classic', test: (s, e) => e.lines >= 40 && e.lines === e.tetrises * 4 },

    { id: 'cl_sprint60', group: 'classic', name: 'Photo Finish', desc: 'Clear 40 lines in 50 seconds.', pay: 2000, tier: 'legend', on: 'classic', test: (s, e) => e.lines >= 40 && e.ms < 50000 },
    { id: 'cl_nohold20', group: 'classic', name: 'Unaided', desc: 'Reach level 20 without hold.', pay: 2000, tier: 'legend', on: 'classic', test: (s, e) => e.level >= 20 && !e.g.s.holds },
    { id: 'cl_combo15', group: 'classic', name: 'Endless Chain', desc: 'Reach a 15-combo.', pay: 1500, tier: 'legend', on: 'classic', test: (s, e) => e.r.combo >= 15 },
    { id: 'cl_l25', group: 'classic', name: 'Past the Curve', desc: 'Reach level 25.', pay: 2500, tier: 'legend', on: 'classic', test: (s, e) => e.level >= 25, progress: (s) => [s.stats.classic.bestLevel, 25] },

    // Puzzles — first solves.
    { id: 'pz_hard', group: 'puzzle', name: 'Hard Nut', desc: 'Solve a Hard puzzle first try. No hints.', pay: 40, on: 'puzzle', test: (s, e) => e.diff === 'H' && e.firstTry && !e.hinted },
    { id: 'pz_hold', group: 'puzzle', name: 'Juggler', desc: 'Solve 5 Hold puzzles.', pay: 30, on: 'puzzle', test: (s) => ((s.stats.puzzle.mods.hold || {}).solved || 0) >= 5, progress: (s) => [((s.stats.puzzle.mods.hold || {}).solved || 0), 5] },
    { id: 'pz_daily', group: 'puzzle', name: 'Daily Habit', desc: 'Solve the Daily on 7 days.', pay: 60, on: 'puzzle', test: (s) => s.stats.puzzle.daily >= 7, progress: (s) => [s.stats.puzzle.daily, 7] },
    { id: 'pz_streak', group: 'puzzle', name: 'On a Roll', desc: 'Solve 10 puzzles of one difficulty in a row.', pay: 80, on: 'puzzle', test: (s) => ['E', 'M', 'H'].some((d) => s.stats.puzzle[d].bestStreak >= 10), progress: (s) => [Math.max(...['E', 'M', 'H'].map((d) => s.stats.puzzle[d].bestStreak)), 10] },
    { id: 'pz_wild', group: 'puzzle', name: 'Wildcard Collector', desc: 'Solve a puzzle with each wildcard.', pay: 100, on: 'puzzle', test: (s) => wildIds().every((m) => ((s.stats.puzzle.mods[m] || {}).solved || 0) > 0), progress: (s) => [wildIds().filter((m) => ((s.stats.puzzle.mods[m] || {}).solved || 0) > 0).length, wildIds().length] },
    { id: 'pz_hard25', group: 'puzzle', name: 'Puzzle Master', desc: 'Solve 25 Hard puzzles.', pay: 150, on: 'puzzle', test: (s) => s.stats.puzzle.H.solved >= 25, progress: (s) => [s.stats.puzzle.H.solved, 25] },

    { id: 'pz_500', group: 'puzzle', name: 'Seed Hunter', desc: 'Solve 500 puzzles.', pay: 1000, tier: 'legend', on: 'puzzle', test: (s) => ['E', 'M', 'H'].reduce((a, d) => a + s.stats.puzzle[d].solved, 0) >= 500, progress: (s) => [['E', 'M', 'H'].reduce((a, d) => a + s.stats.puzzle[d].solved, 0), 500] },
    { id: 'pz_d100', group: 'puzzle', name: 'Devotion', desc: 'Solve the Daily on 100 days.', pay: 1500, tier: 'legend', on: 'puzzle', test: (s) => s.stats.puzzle.daily >= 100, progress: (s) => [s.stats.puzzle.daily, 100] },
    { id: 'pz_h50', group: 'puzzle', name: 'Unflinching', desc: 'Solve 50 Hard puzzles in a row.', pay: 2000, tier: 'legend', on: 'puzzle', test: (s) => s.stats.puzzle.H.bestStreak >= 50, progress: (s) => [s.stats.puzzle.H.bestStreak, 50] },

    { id: 'pz_clean', group: 'puzzle', name: 'Clean Hands', desc: 'Solve a Hard puzzle first try. No hints, no undo.', pay: 120, on: 'puzzle', test: (s, e) => e.diff === 'H' && e.firstTry && !e.hinted && !e.undos },
    { id: 'pz_daily3', group: 'puzzle', name: 'Full Set', desc: 'Solve the Easy, Medium and Hard Dailies on their day.', pay: 150, on: 'puzzle', test: (s) => dailiesToday(s) >= 3, progress: (s) => [dailiesToday(s), 3] },
    { id: 'pz_spin', group: 'puzzle', name: 'Widdershins', desc: 'Solve a Hard Both Ways puzzle.', pay: 250, on: 'puzzle', test: (s, e) => e.diff === 'H' && e.mods.includes('spin') },
    { id: 'pz_fast', group: 'puzzle', name: 'Quick Study', desc: 'Solve a Hard puzzle first try in under 20 seconds. No hints.', pay: 300, on: 'puzzle', test: (s, e) => e.diff === 'H' && e.firstTry && !e.hinted && e.ms < 20000 },
    { id: 'pz_wild3', group: 'puzzle', name: 'Three Wild', desc: 'Solve a Hard puzzle with 3 wildcards first try. No hints, no undo.', pay: 300, on: 'puzzle', test: (s, e) => e.diff === 'H' && e.mods.length >= 3 && e.firstTry && !e.hinted && !e.undos },
    { id: 'pz_first20', group: 'puzzle', name: 'In the Zone', desc: '20 first-try solves in a row. No hints.', pay: 400, on: 'puzzle', test: (s) => s.stats.puzzle.bestFirstRun >= 20, progress: (s) => [s.stats.puzzle.bestFirstRun || 0, 20] },
    { id: 'pz_hfirst25', group: 'puzzle', name: 'Sharp Eye', desc: 'Solve 25 Hard puzzles first try.', pay: 500, on: 'puzzle', test: (s) => s.stats.puzzle.H.firstTry >= 25, progress: (s) => [s.stats.puzzle.H.firstTry, 25] },
    { id: 'pz_h100', group: 'puzzle', name: 'Grandmaster', desc: 'Solve 100 Hard puzzles.', pay: 600, on: 'puzzle', test: (s) => s.stats.puzzle.H.solved >= 100, progress: (s) => [s.stats.puzzle.H.solved, 100] },

    { id: 'pz_wildH', group: 'puzzle', name: 'Full House', desc: 'Solve a Hard puzzle with every wildcard.', pay: 1500, tier: 'legend', on: 'puzzle', test: (s) => wildIds().length > 0 && hardWilds(s) >= wildIds().length, progress: (s) => [hardWilds(s), wildIds().length] },
    { id: 'pz_daily30', group: 'puzzle', name: 'Every Single Day', desc: 'Solve a Daily 30 days in a row.', pay: 2000, tier: 'legend', on: 'puzzle', test: (s) => s.stats.puzzle.bestDailyRun >= 30, progress: (s) => [s.stats.puzzle.bestDailyRun || 0, 30] },
    { id: 'pz_first100', group: 'puzzle', name: 'Clairvoyant', desc: '100 first-try solves in a row. No hints.', pay: 3000, tier: 'legend', on: 'puzzle', test: (s) => s.stats.puzzle.bestFirstRun >= 100, progress: (s) => [s.stats.puzzle.bestFirstRun || 0, 100] },

    // Lifetime — across every mode; checked on any event and once a minute.
    { id: 'lu_triathlon', group: 'lull', name: 'Triathlon', desc: 'In one day: a Free Play quad, a Classic tetris and a Hard puzzle.', pay: 150, on: 'any', test: (s) => triathlon(s) >= 3, progress: (s) => [triathlon(s), 3] },
    { id: 'lu_hours10', group: 'lull', name: 'Good Company', desc: 'Play for 10 hours.', pay: 150, on: 'any', test: (s) => s.stats.timeMs.total >= 10 * 3600e3, progress: (s) => [Math.floor(s.stats.timeMs.total / 3600e3), 10] },
    { id: 'lu_days30', group: 'lull', name: 'Familiar Face', desc: 'Play on 30 days.', pay: 300, on: 'any', test: (s) => s.stats.days >= 30, progress: (s) => [s.stats.days || 0, 30] },
    { id: 'lu_half', group: 'lull', name: 'Halfway There', desc: 'Earn half of the other achievements.', pay: 400, on: 'any', test: (s) => earnedOthers(s) >= Math.ceil(others().length / 2), progress: (s) => [earnedOthers(s), Math.ceil(others().length / 2)] },
    { id: 'lu_100k', group: 'lull', name: 'Deep Pockets', desc: 'Earn 100,000 lines.', pay: 500, on: 'any', test: (s) => earned(s) >= 1e5, progress: (s) => [earned(s), 1e5] },

    { id: 'lu_curator', group: 'lull', name: 'Curator', desc: 'Own every cosmetic the Shop sells.', pay: 2000, tier: 'legend', on: 'any', test: (s) => forSale().length > 0 && cosmeticsOwned(s) >= forSale().length, progress: (s) => [cosmeticsOwned(s), forSale().length] },
    { id: 'lu_hours100', group: 'lull', name: 'Old Friend', desc: 'Play for 100 hours.', pay: 2000, tier: 'legend', on: 'any', test: (s) => s.stats.timeMs.total >= 100 * 3600e3, progress: (s) => [Math.floor(s.stats.timeMs.total / 3600e3), 100] },
    { id: 'lu_days100', group: 'lull', name: 'A Hundred Mornings', desc: 'Play on 100 days.', pay: 2000, tier: 'legend', on: 'any', test: (s) => s.stats.days >= 100, progress: (s) => [s.stats.days || 0, 100] },
    { id: 'lu_1m', group: 'lull', name: 'Line Baron', desc: 'Earn 1,000,000 lines.', pay: 5000, tier: 'legend', on: 'any', test: (s) => earned(s) >= 1e6, progress: (s) => [earned(s), 1e6] },
    { id: 'lu_all', group: 'lull', name: 'Lull', desc: 'Earn every other achievement.', pay: 5000, tier: 'legend', on: 'any', test: (s) => earnedOthers(s) >= others().length, progress: (s) => [earnedOthers(s), others().length] },

    // Factory — the line runs slowly, so these take weeks; the shape sets need patience (or a pinned mold).
    { id: 'fac_twelve', group: 'factory', name: 'Twelve Tiles', desc: 'Press all 12 pentominoes.', pay: 60, on: 'factory', test: (s) => fseen(s, 5) >= 12, progress: (s) => [fseen(s, 5), 12] },
    { id: 'fac_sweep', group: 'factory', name: 'Empty Bin', desc: 'Collect 60+ lines at once, no loose minos left.', pay: 80, on: 'factory', test: (s, e) => e.collected >= 60 && e.loose === 0 },
    { id: 'fac_1k', group: 'factory', name: 'A Thousand Lines', desc: 'Collect 1,000 lines.', pay: 100, on: 'factory', test: (s) => s.factory.stats.lines >= 1000, progress: (s) => [s.factory.stats.lines, 1000] },
    { id: 'fac_keyhole', group: 'factory', name: 'Keyhole', desc: 'Press the heptomino with a hole on a press set to Any.', pay: 120, on: 'factory', test: (s) => !!s.factory.stats.holeFree },
    { id: 'fac_line', group: 'factory', name: 'Full Line', desc: 'Build all 4 presses.', pay: 150, on: 'factory', test: (s) => s.factory.presses >= 4, progress: (s) => [s.factory.presses, 4] },
    { id: 'fac_silo', group: 'factory', name: 'Silo', desc: 'Build the biggest bin.', pay: 150, on: 'factory', test: (s) => s.factory.binLevel >= 4, progress: (s) => [s.factory.binLevel, 4] },
    { id: 'fac_35', group: 'factory', name: 'Thirty-Five', desc: 'Press all 35 hexominoes.', pay: 150, on: 'factory', test: (s) => fseen(s, 6) >= 35, progress: (s) => [fseen(s, 6), 35] },
    { id: 'fac_10k', group: 'factory', name: 'Ten Thousand Minos', desc: 'Make 10,000 minos.', pay: 150, on: 'factory', test: (s) => s.factory.stats.minos >= 10000, progress: (s) => [s.factory.stats.minos, 10000] },
    { id: 'fac_days30', group: 'factory', name: 'Shift Worker', desc: 'Collect on 30 days.', pay: 150, on: 'factory', test: (s) => s.factory.stats.days >= 30, progress: (s) => [s.factory.stats.days, 30] },
    { id: 'fac_hundred', group: 'factory', name: 'Exactly a Hundred', desc: 'Collect exactly 100 lines at once.', pay: 200, on: 'factory', test: (s, e) => e.collected === 100 },

    { id: 'fac_days100', group: 'factory', name: 'Old Hand', desc: 'Collect on 100 days.', pay: 1200, tier: 'legend', on: 'factory', test: (s) => s.factory.stats.days >= 100, progress: (s) => [s.factory.stats.days, 100] },
    { id: 'fac_108', group: 'factory', name: 'Hundred and Eight', desc: 'Press all 108 heptominoes.', pay: 1500, tier: 'legend', on: 'factory', test: (s) => fseen(s, 7) >= 108, progress: (s) => [fseen(s, 7), 108] },
    { id: 'fac_mountain', group: 'factory', name: 'Mino Mountain', desc: 'Make 100,000 minos.', pay: 2500, tier: 'legend', on: 'factory', test: (s) => s.factory.stats.minos >= 100000, progress: (s) => [s.factory.stats.minos, 100000] },
  ];

  /** The board's numbers after this lock (its hand counts: see freshStats in js/engine.js). */
  const hs = (e) => e.g.s;
  // Board sizes (js/library.js). Lines are counted in Standard lines: a line w wide is w/10 of one.
  const scale = (g) => (L.Library ? L.Library.scale(g.w) : 1);
  /** The board's lines, in Standard lines. */
  const std = (g) => g.s.lines * scale(g);
  /** A board narrower than Standard: quads, combos, perfect clears and points come in a few pieces there. */
  const narrow = (g) => !!g && g.w < (L.Library ? L.Library.STANDARD.w : 10);
  // Free Play ones that count on any board: counted in Standard lines (the line counts and pace), by width (Clean
  // Sweep), or not about the stack at all. Every other Free Play one counts only on a board at least Standard width.
  const ANY_SIZE = new Set(['lines150', 'lines500', 'lines5000', 'purist', 'pace33', 'pace67', 'it_sweep', 'toolbox', 'all_items', 'sb_combos', 'old_growth']);
  /** The last hundred pieces by hand: within ms, clearing 36 lines or more. */
  const pace = (g, ms) => { const p = L.paceOf ? L.paceOf(g.s, 100) : null; return !!p && p.ms <= ms && p.lines * scale(g) >= 36; };
  /** One power-up (a Tool piece or a Board item) took a board of 60 blocks or more to empty: six rows' worth on a board wider than Standard. */
  const swept = (e) => !!e.r.special && (e.r.had || 0) >= 60 * Math.max(1, scale(e.g)) && e.g.board.isEmpty();
  /** Different power-up combos found on this board. */
  const itemCombos = (g) => (L.Combos ? L.Combos.LIST.filter((c) => c.kind === 'item' && (g.s.combos || {})[c.id]).length : 0);
  const combosAll = () => (L.Combos ? L.Combos.LIST.length : 1);
  const combosFound = (s) => (L.Combos ? L.Combos.LIST.filter((c) => (s.combos || {})[c.id]).length : 0);
  /** Lines earned for the Lifetime ones, less what Rewind took back (replaying a clear would count it twice). */
  const earned = (s) => Math.max(0, s.stats.lines.earned - s.stats.lines.rewound);

  function fseen(s, n) { return L.Factory ? L.Factory.seenCount(s.factory, n) : 0; }
  function wildIds() { return L.Puzzles ? Object.keys(L.Puzzles.MODS) : []; }
  const usedItems = (g) => Object.values(g.s.items || {}).some((n) => n > 0);
  const itemsTried = (s) => L.ITEM_ORDER.filter((id) => (s.stats.items.used[id] || 0) > 0).length;
  const hardWilds = (s) => wildIds().filter((m) => ((s.stats.puzzle.mods[m] || {}).hard || 0) > 0).length;
  // Today's line in the day log: which Dailies were solved on their day, and the day's quad / tetris / Hard puzzle.
  const today = (s) => (s.history || {})[L.dateKey()] || {};
  const dailiesToday = (s) => ['E', 'M', 'H'].filter((d) => (today(s).dailies || '').includes(d)).length;
  const triathlon = (s) => ['quad', 'tetris', 'hard'].filter((k) => today(s)[k]).length;
  // Everything the shop sells for lines (factory rewards and the free starters aside).
  const forSale = () => Object.keys(L.COSMETICS || {}).flatMap((k) => Object.keys(L.COSMETICS[k]).filter((id) => L.COSMETICS[k][id].price > 0 && !L.COSMETICS[k][id].reward).map((id) => [k, id]));
  const cosmeticsOwned = (s) => forSale().filter(([k, id]) => (s.owned[k] || []).includes(id)).length;
  // The two that count the others leave each other out.
  const others = () => LIST.filter((a) => a.id !== 'lu_half' && a.id !== 'lu_all');
  const earnedOthers = (s) => others().filter((a) => (s.achievements || {})[a.id]).length;

  /**
   * Checks the achievements an event could earn; books the new ones (with the time) and returns them.
   * event: { mode: 'play' | 'classic' | 'puzzle' | 'factory', … }
   */
  function check(state, event) {
    const got = state.achievements || (state.achievements = {});
    const out = [];
    for (const a of LIST) {
      if (got[a.id] || (a.on !== event.mode && a.on !== 'any')) continue;
      if (a.on === 'play' && !ANY_SIZE.has(a.id) && narrow(event.g)) continue;
      let ok = false;
      try { ok = !!a.test(state, event); } catch (e) { ok = false; }
      if (ok) { got[a.id] = Date.now(); out.push(a); }
    }
    return out;
  }

  /**
   * Puzzle runs, counted on each first solve: first-try solves in a row (clean: first try, no hints; a retry, a hint
   * or a fail ends the run), and Dailies solved on consecutive dates (runDay: the latest date in the run; solving an
   * older Daily later leaves the run alone). A Daily only counts solved on its day (or the next, for just past
   * midnight), so old Dailies kept in the history cannot be strung together in one sitting.
   */
  function puzzleRuns(P, clean, dailyKey, todayKey) {
    P.firstRun = clean ? (P.firstRun || 0) + 1 : 0;
    P.bestFirstRun = Math.max(P.bestFirstRun || 0, P.firstRun);
    if (!dailyKey || (P.runDay && dailyKey <= P.runDay)) return;
    if (Date.parse(todayKey || L.dateKey()) - Date.parse(dailyKey) > 86400000) return;
    const gap = P.runDay ? Math.round((Date.parse(dailyKey) - Date.parse(P.runDay)) / 86400000) : 0;
    P.dailyRun = gap === 1 ? (P.dailyRun || 0) + 1 : 1;
    P.runDay = dailyKey;
    P.bestDailyRun = Math.max(P.bestDailyRun || 0, P.dailyRun);
  }

  /**
   * The most recently earned, newest first: [{ a, when }]. Ones earned at the same moment (one event can earn several)
   * keep the order they were told in, reversed, so the last toast is the first here.
   */
  function recent(state, n) {
    const got = state.achievements || {};
    return LIST.map((a, i) => ({ a, i, when: got[a.id] })).filter((x) => x.when)
      .sort((x, y) => y.when - x.when || y.i - x.i).slice(0, n == null ? 5 : n).map(({ a, when }) => ({ a, when }));
  }

  function total() { return LIST.reduce((n, a) => n + a.pay, 0); }

  /** An achievement's group (its place to play: the colour and icon it is shown with). */
  function groupOf(a) { return GROUPS.find((g) => g.id === a.group) || GROUPS[0]; }

  L.Achievements = { LIST, GROUPS, ANY_SIZE, groupOf, check, total, puzzleRuns, earned, recent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
