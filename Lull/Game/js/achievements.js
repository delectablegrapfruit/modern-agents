// Lull — achievements: quiet milestones for special, rare or difficult play. They pay ◆ lines, turn up as one small
// toast when earned, and otherwise live out of the way under Stats ▸ Achievements. None is a gimme; the hard ones pay
// accordingly.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // on: which event checks it ('play' lock, 'classic' lock or game over, 'puzzle' solve, 'factory', or 'any').
  // test(state, event) → earned? · progress(state) → [have, need] for the list (optional).
  const GROUPS = [
    { id: 'play', name: 'Free Play' },
    { id: 'classic', name: 'Classic' },
    { id: 'puzzle', name: 'Puzzles' },
    { id: 'factory', name: 'Factory' },
  ];

  const LIST = [
    // Free Play — per board, per piece.
    { id: 'quad', group: 'play', name: 'Four at Once', desc: 'Clear four lines with one piece.', pay: 15, on: 'play', test: (s, e) => e.r.lines >= 4 },
    { id: 'tsd', group: 'play', name: 'Twist', desc: 'A T-spin double.', pay: 25, on: 'play', test: (s, e) => e.r.tspin && e.r.lines === 2 },
    { id: 'combo5', group: 'play', name: 'Chain Reaction', desc: 'A 5-combo: clear lines with six pieces in a row.', pay: 25, on: 'play', test: (s, e) => e.r.combo >= 5 },
    { id: 'score50k', group: 'play', name: 'Fifty Grand', desc: 'Score 50,000 points on one board.', pay: 30, on: 'play', test: (s, e) => e.g.s.score >= 50000 },
    { id: 'b2b3', group: 'play', name: 'Back to Back to Back', desc: 'Three back-to-back quads or T-spins in a row.', pay: 40, on: 'play', test: (s, e) => e.g.s.b2b >= 3 },
    { id: 'lines150', group: 'play', name: 'Long Haul', desc: 'Clear 150 lines on one board.', pay: 50, on: 'play', test: (s, e) => e.g.s.lines >= 150 },
    { id: 'pc', group: 'play', name: 'Clean Slate', desc: 'A perfect clear: empty the board.', pay: 60, on: 'play', test: (s, e) => e.r.perfect },
    { id: 'tst', group: 'play', name: 'Corkscrew', desc: 'A T-spin triple.', pay: 80, on: 'play', test: (s, e) => e.r.tspin && e.r.lines >= 3 },
    { id: 'combo10', group: 'play', name: 'Unbroken', desc: 'A 10-combo.', pay: 100, on: 'play', test: (s, e) => e.r.combo >= 10 },
    { id: 'score250k', group: 'play', name: 'Quarter Million', desc: 'Score 250,000 points on one board.', pay: 120, on: 'play', test: (s, e) => e.g.s.score >= 250000 },
    { id: 'b2b8', group: 'play', name: 'Relentless', desc: 'Eight back-to-back quads or T-spins in a row.', pay: 150, on: 'play', test: (s, e) => e.g.s.b2b >= 8 },
    { id: 'pc3', group: 'play', name: 'Spotless', desc: 'Three perfect clears on one board.', pay: 200, on: 'play', test: (s, e) => e.g.s.perfect >= 3 },

    // Classic — per game.
    { id: 'cl_tetris4', group: 'classic', name: 'Four Tetrises', desc: 'Four tetrises in one Classic game.', pay: 40, on: 'classic', test: (s, e) => e.tetrises >= 4 },
    { id: 'cl_l10', group: 'classic', name: 'Double Digits', desc: 'Reach level 10 in Classic.', pay: 50, on: 'classic', test: (s, e) => e.level >= 10 },
    { id: 'cl_100k', group: 'classic', name: 'Six Figures', desc: 'Score 100,000 in one Classic game.', pay: 60, on: 'classic', test: (s, e) => e.score >= 100000 },
    { id: 'cl_l15', group: 'classic', name: 'Terminal Velocity', desc: 'Reach level 15 in Classic.', pay: 150, on: 'classic', test: (s, e) => e.level >= 15 },
    { id: 'cl_300k', group: 'classic', name: 'High Roller', desc: 'Score 300,000 in one Classic game.', pay: 200, on: 'classic', test: (s, e) => e.score >= 300000 },

    // Puzzles — first solves.
    { id: 'pz_hard', group: 'puzzle', name: 'Hard Nut', desc: 'Solve a Hard puzzle on the first try, without hints.', pay: 40, on: 'puzzle', test: (s, e) => e.diff === 'H' && e.firstTry && !e.hinted },
    { id: 'pz_hold', group: 'puzzle', name: 'Juggler', desc: 'Solve five Hold puzzles.', pay: 30, on: 'puzzle', test: (s) => ((s.stats.puzzle.mods.hold || {}).solved || 0) >= 5, progress: (s) => [((s.stats.puzzle.mods.hold || {}).solved || 0), 5] },
    { id: 'pz_daily', group: 'puzzle', name: 'Daily Habit', desc: 'Solve the Daily on seven different days.', pay: 60, on: 'puzzle', test: (s) => s.stats.puzzle.daily >= 7, progress: (s) => [s.stats.puzzle.daily, 7] },
    { id: 'pz_streak', group: 'puzzle', name: 'On a Roll', desc: 'Solve ten puzzles of one difficulty in a row without giving up.', pay: 80, on: 'puzzle', test: (s) => ['E', 'M', 'H'].some((d) => s.stats.puzzle[d].bestStreak >= 10), progress: (s) => [Math.max(...['E', 'M', 'H'].map((d) => s.stats.puzzle[d].bestStreak)), 10] },
    { id: 'pz_wild', group: 'puzzle', name: 'Wildcard Collector', desc: 'Solve a puzzle with every wildcard.', pay: 100, on: 'puzzle', test: (s) => wildIds().every((m) => ((s.stats.puzzle.mods[m] || {}).solved || 0) > 0), progress: (s) => [wildIds().filter((m) => ((s.stats.puzzle.mods[m] || {}).solved || 0) > 0).length, wildIds().length] },
    { id: 'pz_hard25', group: 'puzzle', name: 'Puzzle Master', desc: 'Solve 25 Hard puzzles.', pay: 150, on: 'puzzle', test: (s) => s.stats.puzzle.H.solved >= 25, progress: (s) => [s.stats.puzzle.H.solved, 25] },

    // Factory
    { id: 'fa_streak', group: 'factory', name: 'Eagle Eye', desc: 'Pull 25 cracked minos off the belt in a row.', pay: 40, on: 'factory', test: (s) => s.factory.bestStreak >= 25, progress: (s) => [s.factory.bestStreak, 25] },
    { id: 'fa_hexo', group: 'factory', name: 'Six Sides', desc: 'Own a hexomino press.', pay: 40, on: 'factory', test: (s) => (s.factory.owned[6] || 0) > 0 },
    { id: 'fa_crates', group: 'factory', name: 'Shipping Department', desc: 'Open 20 crates.', pay: 60, on: 'factory', test: (s) => s.factory.crates >= 20, progress: (s) => [s.factory.crates, 20] },
    { id: 'fa_deco', group: 'factory', name: 'Ten of a Kind', desc: 'Own a decomino press.', pay: 300, on: 'factory', test: (s) => (s.factory.owned[10] || 0) > 0 },
  ];

  function wildIds() { return L.Puzzles ? Object.keys(L.Puzzles.MODS) : []; }

  /**
   * Checks the achievements an event could earn; books the new ones (with the time) and returns them.
   * event: { mode: 'play' | 'classic' | 'puzzle' | 'factory', … }
   */
  function check(state, event) {
    const got = state.achievements || (state.achievements = {});
    const out = [];
    for (const a of LIST) {
      if (got[a.id] || (a.on !== event.mode && a.on !== 'any')) continue;
      let ok = false;
      try { ok = !!a.test(state, event); } catch (e) { ok = false; }
      if (ok) { got[a.id] = Date.now(); out.push(a); }
    }
    return out;
  }

  function total() { return LIST.reduce((n, a) => n + a.pay, 0); }

  L.Achievements = { LIST, GROUPS, check, total };
})(typeof globalThis !== 'undefined' ? globalThis : this);
