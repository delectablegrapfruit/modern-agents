// Lull — Training, a board mode (js/recipe.js) on Classic's rules (js/classic.js: its setup, gravity, lock and score):
// a coach watches each placement and asks for another try when it was a poor one. After each set, the placement is
// judged by the Watch bot's eye (js/bot.js: rank, then where the board left stands among every placement of that
// piece, with the same board, Next and Hold) against the best it finds. A placement that loses more than Strictness
// allows is taken back: the board, the score, the lines and level, Next, Hold and the random stream all as they were
// when the piece appeared, and the same piece comes again. After a few tries in a row on the same piece (Hint after),
// the best spot is shown as an outline until the piece is placed well; Explanation draws why on the board.
//
// The coach's settings are the player's (Settings: trainStrict, trainHint, trainExplain), set in the Training setup and
// read at each placement, so a change applies at once. The recipe is Classic's (`classic`, its own setup); Training
// adds no key of its own. A Training game is kept as Training's one game (js/library.js) and counts toward nothing:
// no Stats, bests, past boards, achievements, the day's log or lines banked (R.uncounted).
//
// What the coach keeps with the game (its engine extension's save, x.training): { v, turn (the game as the piece in
// play appeared: snap), tries (poor placements of it in a row), best (the best spot for it, once judged), why (what the
// last poor one did, for Explanation), placed, first (placed well at the first try), rewinds }.
//
// Pure rules, no DOM; the controller, the setup's settings and the drawing are js/trainingview.js.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Classic, Bot, Pieces, RNG } = L;
  if (!Recipe || !Classic || !Bot) return;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  /**
   * Strictness: the most a placement may fall short of the best (the bot's units, where a hole costs about six to nine)
   * before it is taken back. Measured over bot-played boards (720 positions, every placement of each piece):
   *   a placement that leaves a hole the best does not: 5% lose under 14.5, the median 35
   *   one with no new hole but two rows or more higher: 25% under 10.4, the median 17
   *   the rest (a bumpier top, a well filled early): the median 5.7, 75% under 10.7
   *   the best and the second best: the median 1.4 apart
   * Gentle (12) takes back nearly every new hole and the clearly needless height, little else; Standard (7) any new hole,
   * most needless height and a rough top; Strict (3) anything notably below the best, while a near equal stays.
   */
  const STRICT = Object.freeze({ gentle: 12, standard: 7, strict: 3 });
  const STRICT_IDS = ['gentle', 'standard', 'strict'];
  const STRICT_NAMES = { gentle: 'Gentle', standard: 'Standard', strict: 'Strict' };
  /** Hint after: the poor placements of one piece in a row before its best spot is shown. */
  const HINT = [1, 5];
  const DEFAULTS = Object.freeze({ strict: 'standard', hint: 3, explain: false });
  /**
   * The search that judges: the Watch bot's own (a beam of ten, three pieces deep); with nothing in sight (no Next, no
   * Hold) every placement is weighed by what the seven could make of it (the bot weighs only its best few so).
   */
  const SEARCH = { beam: 10, depth: 3, guessTop: 99 };

  const on = (r) => !!r && r.mode === 'training';

  /** The coach's settings as saved (Settings: trainStrict, trainHint, trainExplain), each its default when unset. */
  function settingsOf(st) {
    st = st || {};
    const n = st.trainHint;
    return {
      strict: STRICT[st.trainStrict] != null ? st.trainStrict : DEFAULTS.strict,
      hint: Number.isInteger(n) && n >= HINT[0] && n <= HINT[1] ? n : DEFAULTS.hint,
      explain: st.trainExplain === true,
    };
  }

  // ---- the game as a piece appeared, and back to it -----------------------------------------------------------------

  /** The game now, as the coach keeps it: everything a placement can change, and the piece in play where it is. */
  function snap(game) {
    const p = game.piece;
    return {
      cells: game.board.toArray(),
      piece: p ? { entry: Object.assign({}, p.entry, { special: p.special || null }), rot: p.rot, x: p.x, y: p.y } : null,
      hold: clone(game.hold), holdLocked: !!game.holdLocked, queue: clone(game.queue), bag: game.bag.slice(), rng: game.rng.state(),
      s: clone(game.s), c: clone(Classic.of(game)),
    };
  }

  /**
   * Back to a snap: the board, Hold, Next, the bag and the random stream (so the same pieces come), the game's stats
   * and Classic's lines and level exactly as they were, the piece where it appeared. The time played goes on (the
   * board's playMs and Classic's clock are kept as they are now).
   */
  function restore(game, sn) {
    const C = Classic.of(game), playMs = game.s.playMs, ms = C ? C.ms : 0;
    game.board.restore(sn.cells);
    game.hold = clone(sn.hold);
    game.holdLocked = sn.holdLocked;
    game.queue = clone(sn.queue);
    game.bag = sn.bag.slice();
    game.rng = RNG.from(sn.rng);
    game.s = clone(sn.s);
    if (playMs != null) game.s.playMs = playMs;
    if (C && sn.c) { for (const k of Object.keys(C)) delete C[k]; Object.assign(C, clone(sn.c), { ms }); }
    game.over = false; game.endKind = null; game.endDue = false; game.pendingDrop = null;
    const e = sn.piece && sn.piece.entry, type = e ? Pieces.get(e.id) : null;
    game.piece = type ? { type, rot: sn.piece.rot, x: sn.piece.x, y: sn.piece.y, special: e.special || null, entry: Object.assign({}, e), lastRot: false } : null;
  }

  // ---- judging a placement -------------------------------------------------------------------------------------------

  const rowsOfCells = (cells, w, h) => Bot.rowsOf({ w, h, cells });
  function sameRows(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

  /**
   * What the bot sees of the game as the piece appeared (Bot.view, from a snap): the board, the piece where it
   * appeared, Hold (usable: it was not used yet), the Next pieces the setup shows, the Streak and combo, and the height
   * it fears by the level's speed. Every spot a piece can rest on is in reach (no hand's pace).
   */
  function viewOf(game, sn) {
    const k = game.recipe.classic, W = game.w, H = game.h, rows = rowsOfCells(sn.cells, W, H), p = sn.piece;
    const retro = k.lock === 'retro', lines = sn.c ? sn.c.lines : 0;
    const iv = Classic.gravity(Classic.levelOf(k, lines), retro) * 1000, room = Math.max(1, H - Bot.heightOf(rows, H) - 2);
    const urgency = Math.max(0, Math.min(0.9, 1 - (iv * room + (retro ? 0 : 350)) / 1600));
    const holdRule = !!k.hold && !game.mods.noHold;
    return {
      W, H, rows, ceiling: !!game.ceiling, cur: p ? { id: p.entry.id, rot: p.rot, x: p.x, y: p.y } : null,
      hold: holdRule && sn.hold ? sn.hold.id : null, holdRule, holdOk: holdRule && !sn.holdLocked,
      queue: sn.queue.slice(0, Math.max(0, k.next | 0)).map((e) => e.id), b2b: sn.s.b2b, combo: sn.s.combo, r180: true, urgency,
      spawn: (id) => Bot.spawnOf(game, Pieces.get(id)),
    };
  }
  /** The bot's thinking over a snap, as a generator (the page runs it a slice a frame): every placement, best first. */
  function think(game, sn) { return Bot.think(viewOf(game, sn), SEARCH); }
  /** The same, at once (Bot.rank). */
  function rank(game, sn) { return Bot.rank(viewOf(game, sn), SEARCH); }

  /**
   * A placement judged: the board it left (rowsAfter, its full rows gone) found among the ranked ones (a Twist and a
   * plain set that leave the same board are told apart by r's twist), and how far it falls short of the best (loss, in
   * the bot's units). good: it loses less than Strictness allows, or it is not among them (nothing to judge it by).
   */
  function assess(ranked, rowsAfter, r, strict) {
    const best = ranked && ranked[0] || null, tw = r && r.twist ? 2 : r && r.mini ? 1 : 0;
    let entry = null, index = -1;
    (ranked || []).forEach((e, i) => { if (sameRows(e.rows, rowsAfter) && (!entry || (e.twist === tw && entry.twist !== tw))) { entry = e; index = i; } });
    const loss = entry && best ? Math.max(0, best.value - entry.value) : null;
    const limit = STRICT[strict] != null ? STRICT[strict] : STRICT[DEFAULTS.strict];
    return { good: loss == null || loss < limit, loss, limit, index, entry, best };
  }

  // ---- why the best spot is better (Explanation) ---------------------------------------------------------------------

  /** The cells a ranked placement covers, where it rests. */
  const cellsOf = (e) => Pieces.get(e.id).rots[e.r].map(([cx, cy]) => [e.x + cx, e.y + cy]);
  /** The empty cells under a block in their column, as "x,y". */
  function holeSet(rows, W, H) {
    const out = new Set();
    let cover = 0;
    for (let y = H - 1; y >= 0; y--) {
      const r = rows[y], hl = cover & ~r;
      for (let x = 0; x < W; x++) if ((hl >>> x) & 1) out.add(x + ',' + y);
      cover |= r;
    }
    return out;
  }
  const withCells = (rows, cells) => { const out = Int32Array.from(rows); for (const [x, y] of cells) if (y >= 0 && y < out.length) out[y] |= 1 << x; return out; };
  /** The lowest column of a stack (the well the bot keeps), and how deep it is. */
  function wellOf(rows, W, H) {
    const hgt = [];
    for (let x = 0; x < W; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if ((rows[y] >>> x) & 1) { t = y + 1; break; } hgt.push(t); }
    let wc = 0;
    for (let x = 1; x < W; x++) if (hgt[x] < hgt[wc]) wc = x;
    const nb = Math.min(wc > 0 ? hgt[wc - 1] : 99, wc < W - 1 ? hgt[wc + 1] : 99);
    return { x: wc, depth: Math.max(0, nb - hgt[wc]), floor: hgt[wc] };
  }

  /**
   * Why the best spot beats the one played (Bot.explain's features, and the boards both leave), in what the board can
   * show: { mine (its cells), best: { id, r, x, y, hold, cells }, holes (cells the played piece covers that the best
   * leaves open: [[x, y]]), lines ({ n, rows } the best clears and the played one does not), well ({ x } the best keeps
   * open and the played one fills), height ({ mine, best } after each, when the played one is two rows or more higher),
   * rough (only a bumpier top: the bumps of each), words: at most two, the first the most telling ("2 holes",
   * "Clears 2", "Keep well", "+3 high", "Flatter") }. The cells are where they are now, on the board as it was.
   */
  function reasons(game, sn, entry, best, mine) {
    const W = game.w, H = game.h, before = rowsOfCells(sn.cells, W, H), bestCells = cellsOf(best);
    const out = { mine: mine.map((c) => c.slice()), best: { id: best.id, r: best.r, x: best.x, y: best.y, hold: !!best.hold, cells: bestCells }, holes: [], lines: null, well: null, height: null, rough: null, words: [] };
    const h0 = holeSet(before, W, H), hm = holeSet(withCells(before, mine), W, H), hb = holeSet(withCells(before, bestCells), W, H);
    const newMine = [...hm].filter((k) => !h0.has(k)), newBest = [...hb].filter((k) => !h0.has(k));
    if (newMine.length > newBest.length) out.holes = newMine.filter((k) => !hb.has(k)).map((k) => k.split(',').map(Number));
    const full = (1 << W) - 1, placed = withCells(before, bestCells), got = entry ? entry.lines : 0;
    if (best.lines > got) {
      const rows = [];
      for (let y = 0; y < H; y++) if (placed[y] === full) rows.push(y);
      out.lines = { n: best.lines, rows };
    }
    const ex = (rows) => Bot.explain(rows, W, H, {}).parts;
    const pm = entry ? ex(entry.rows) : null, pb = ex(best.rows);
    const wb = wellOf(before, W, H);
    if (pm && wb.depth >= 2 && pb.well.n >= 2 && pm.well.n <= pb.well.n - 2 && mine.some(([x]) => x === wb.x) && !bestCells.some(([x]) => x === wb.x)) out.well = { x: wb.x, floor: wb.floor };
    if (entry) {
      const a = Bot.heightOf(entry.rows, H), b = Bot.heightOf(best.rows, H);
      if (a - b >= 2) out.height = { mine: a, best: b };
    }
    if (out.holes.length) out.words.push(out.holes.length === 1 ? '1 hole' : out.holes.length + ' holes');
    if (out.lines) out.words.push('Clears ' + out.lines.n);
    if (out.well) out.words.push('Keep well');
    if (out.height) out.words.push('+' + (out.height.mine - out.height.best) + ' high');
    if (!out.words.length && pm && pm.bumps.n > pb.bumps.n) { out.rough = { mine: pm.bumps.n, best: pb.bumps.n }; out.words.push('Flatter'); }
    out.words = out.words.slice(0, 2);
    return out;
  }

  // ---- the coach's record --------------------------------------------------------------------------------------------

  const fresh = () => ({ v: 1, turn: null, tries: 0, best: null, why: null, placed: 0, first: 0, rewinds: 0 });
  function validState(x) {
    return isObj(x) && x.v === 1 && ['tries', 'placed', 'first', 'rewinds'].every((k) => Number.isInteger(x[k]) && x[k] >= 0)
      && (x.turn == null || (isObj(x.turn) && Array.isArray(x.turn.cells) && Array.isArray(x.turn.queue) && isObj(x.turn.s)));
  }

  /** A new piece in play (not one Hold brought in): its turn starts, as the game is now. */
  function newTurn(T, sn) { T.turn = sn; T.tries = 0; T.best = null; T.why = null; }

  /** The best spot to show now (Hint after: once tries reach it), or null. */
  function hintOf(T, o) { return T && T.best && T.tries >= settingsOf(o).hint ? T.best : null; }
  /** The explanation to draw now (Explanation on, after a poor placement), or null. */
  function whyOf(T, o) { return T && T.why && T.tries > 0 && settingsOf(o).explain ? T.why : null; }

  /**
   * A piece was set (the lock's result r, the board now after it): judged against the turn's ranked placements
   * (ranked, or ranked now), and recorded. Placed well: counted (and at the first try, when it was), the turn's hint
   * and explanation gone. Placed poorly: one more try, the best spot and the why kept, and the turn marked to go back
   * (T.back: the next piece's appearing does not start a new turn; rewind() takes the game back). o: the settings
   * (settingsOf's, or Settings). Returns { act: 'keep' | 'rewind', verdict }.
   */
  function place(game, r, o, ranked) {
    const T = of(game);
    if (!T || !T.turn) return { act: 'keep', verdict: null };
    o = settingsOf(o);
    const list = ranked || rank(game, T.turn);
    const v = assess(list, Bot.rowsOf(game.board), r, o.strict);
    if (v.good) {
      T.placed++;
      if (!T.tries) T.first++;
      T.tries = 0; T.best = null; T.why = null;
      return { act: 'keep', verdict: v };
    }
    T.tries++;
    T.rewinds++;
    T.best = v.best ? { id: v.best.id, r: v.best.r, x: v.best.x, y: v.best.y, hold: !!v.best.hold, cells: cellsOf(v.best) } : null;
    T.why = v.best && r && r.cells ? reasons(game, T.turn, v.entry, v.best, r.cells) : null;
    T.back = true;
    return { act: 'rewind', verdict: v };
  }

  /** Takes the game back to its turn's start (after a poor placement): the same piece comes again. */
  function rewind(game) {
    const T = of(game);
    if (!T || !T.turn) return false;
    restore(game, T.turn);
    T.back = false;
    return true;
  }

  /** The share of placements made well at the first try, in whole percent ('–' before any). */
  function firstPct(T) { return T && T.placed ? Math.round(100 * T.first / T.placed) + '%' : '–'; }

  // ---- the engine's extension ----------------------------------------------------------------------------------------

  /**
   * A Training board's hooks (see Game hooks in js/engine.js); its state is T (Training.of(game)). Each piece that
   * comes into play from Next starts a turn (a piece Hold brings in is the same turn), unless the game is on its way
   * back to the turn it is in (T.back).
   */
  function extension(game, saved) {
    const T = validState(saved) ? Object.assign(fresh(), clone(saved)) : fresh();
    T.back = false;
    game.on('spawn', () => { if (!game.holdLocked && !T.back) newTurn(T, snap(game)); });
    return {
      T,
      save() { const o = Object.assign({}, T); delete o.back; return clone(o); },
      summary() { return { placed: T.placed, first: T.first, rewinds: T.rewinds }; },
    };
  }

  /** The coach's record of a game (null on a board that is not Training). */
  function of(game) {
    const e = game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'training') : null;
    return e ? e.T : null;
  }

  const PART = {
    key: 'training', order: 46, mode: 'training', name: 'Training', owns: [],
    // (Made from the menu only: never a Custom game, with its shapes and modifiers.)
    custom: false,
    label: () => '',
    rules(r, R) {
      if (!on(r)) return;
      // Classic's rules (classic.js: on), and nothing of it counts: no Stats, bests, past boards or achievements.
      R.uncounted = true;
      R.noFeats = true;
    },
    valid(g, r) {
      if (!on(r)) return true;
      const x = isObj(g.x) ? g.x.training : undefined;
      return x === undefined || validState(x);
    },
    engine(game, saved) { return on(game.recipe) ? extension(game, saved) : null; },
    controller(play, game) { return game && on(game.recipe) && L.TrainingView ? L.TrainingView.controller(play, game) : null; },
    summary(x, g) { return validState(x) && g && isObj(g.recipe) && on(Recipe.normalize(g.recipe)) ? { placed: x.placed, first: x.first, rewinds: x.rewinds } : null; },
  };
  Recipe.part(PART);

  L.Training = { STRICT, STRICT_IDS, STRICT_NAMES, HINT, DEFAULTS, SEARCH, on, settingsOf, snap, restore, viewOf, think, rank, assess, reasons, cellsOf, holeSet, wellOf, newTurn, hintOf, whyOf, place, rewind, firstPct, of, fresh, validState, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
