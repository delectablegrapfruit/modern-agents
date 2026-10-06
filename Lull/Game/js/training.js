// Lull — Training, a board mode (js/recipe.js) on Classic's rules (js/classic.js: its setup, gravity, lock and score):
// a coach watches each placement and asks for another try when it was a poor one. After each set, the placement is
// judged by the Watch bot's eye (js/bot.js: weigh, every placement of that piece and of the one Hold brings, each by
// its best line over the board, the Next shown and Hold, no further) against the best a hand gets to at the level's
// speed, found by the piece and the cells it was set on. A placement that loses more than Strictness allows is taken
// back: the board, the score, the lines and level, Next, Hold and the random stream all as they were when the piece
// appeared, and the same piece comes again. Hold is a move too, judged as it is pressed. After a few tries in a row on
// the same piece (Hint after), the best spot is shown as an outline until the piece is placed well; Explanation shows
// why where the piece was set.
//
// What the coach promises (scripts/training-unit.cjs holds it to them): the spot it shows, set there, is always kept
// (however it got there: a Twist's cells set plainly too); the best is one a hand gets to before the piece falls past
// (HAND), so there is always a placement that is kept; judging and the hint go by one ranking of the turn, thought out
// once and kept with it for every try.
//
// The coach's settings are the player's (Settings: trainStrict, trainHint, trainExplain), set in the Training setup and
// read at each placement, so a change applies at once. The recipe is Classic's (`classic`, its own setup); Training
// adds no key of its own. A Training game is kept as Training's one game (js/library.js) and counts toward nothing:
// no Stats, bests, past boards, achievements, the day's log or lines banked (R.uncounted).
//
// What the coach keeps with the game (its engine extension's save, x.training): { v, turn (the game as the piece in
// play appeared: snap), tries (poor placements of it in a row), best (the best spot for it, once judged), why (what the
// last poor one did, for Explanation), placed, first (placed well at the first try), rewinds }; and, not saved, the
// turn's ranking (ranked, for rankedFor: the turn it was thought out for).
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
   * Strictness: the most a placement may fall short of the best (the bot's units, over the whole line in sight: a hole
   * that stays costs about six to nine a piece) before it is taken back. Measured over coach-played boards (120
   * positions, Next 3 and Hold, every placement of each piece):
   *   a placement that seals a hole the best does not: 10% lose under 9.8, the median 24.6
   *   one with no sealed hole but two rows or more higher: 25% under 10.2, the median 18.3
   *   the rest (a bumpier top, a well filled early, an overhang): the median 13, 25% under 5.9
   *   the best and the second best: the median 0.5 apart
   * Gentle (15) takes back three sealed holes in four and most needless height; Standard (9) nine sealed holes in ten,
   * most needless height and a poor top; Strict (4) nearly anything below the best, while a near equal stays.
   */
  const STRICT = Object.freeze({ gentle: 15, standard: 9, strict: 4 });
  const STRICT_IDS = ['gentle', 'standard', 'strict'];
  const STRICT_NAMES = { gentle: 'Gentle', standard: 'Standard', strict: 'Strict' };
  /** Hint after: the poor placements of one piece in a row before its best spot is shown. */
  const HINT = [1, 5];
  const DEFAULTS = Object.freeze({ strict: 'standard', hint: 3, explain: false });
  /**
   * The search that judges (Bot.weigh): every placement of the piece (and of the one Hold brings) weighed by its best
   * line over every piece in sight, the Next the setup shows and Hold, no further; a beam of four lines a piece for
   * each, the best eight a hand gets to looked at first (the best is the best of them), any other the same way once a
   * player's set is judged by it. With four or five Next a beam of three keeps the thinking within the fall of a piece.
   */
  const SEARCH = Object.freeze({ beam: 4, deep: 8 });
  const searchOf = (q) => (q >= 4 ? Object.assign({}, SEARCH, { beam: 3 }) : SEARCH);
  /**
   * A player's hands, as the coach reckons them (ms): a key every `key` (a steady hand, not a top player's), the first
   * after `look` for the piece in play and after `glance` for one planned from the Next. The best spot the coach holds
   * up (and shows) is always one these hands get to before the piece falls past, at the level's gravity.
   */
  const HAND = { key: 100, look: 400, glance: 250 };

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

  /**
   * What the bot sees of the game as the piece appeared (Bot.view, from a snap): the board, the piece where it
   * appeared, Hold (usable: it was not used yet), the Next pieces the setup shows, the Streak and combo, the height it
   * fears by the level's speed, and the hands' pace there (HAND: the rows a piece falls between two keys and before
   * the first), so the spots a hand gets to are known.
   */
  function viewOf(game, sn) {
    const k = game.recipe.classic, W = game.w, H = game.h, rows = rowsOfCells(sn.cells, W, H), p = sn.piece;
    const retro = k.lock === 'retro', lines = sn.c ? sn.c.lines : 0;
    const iv = Classic.gravity(Classic.levelOf(k, lines), retro) * 1000, room = Math.max(1, H - Bot.heightOf(rows, H) - 2);
    const urgency = Math.max(0, Math.min(0.9, 1 - (iv * room + (retro ? 0 : 350)) / 1600));
    const holdRule = !!k.hold && !game.mods.noHold;
    const rate = HAND.key / iv, start = HAND.look / iv, startNext = HAND.glance / iv;
    return {
      W, H, rows, ceiling: !!game.ceiling, cur: p ? { id: p.entry.id, rot: p.rot, x: p.x, y: p.y } : null,
      hold: holdRule && sn.hold ? sn.hold.id : null, holdRule, holdOk: holdRule && !sn.holdLocked,
      queue: sn.queue.slice(0, Math.max(0, k.next | 0)).map((e) => e.id), b2b: sn.s.b2b, combo: sn.s.combo, r180: true, urgency,
      // (Retro lock: a piece that comes to rest sets, so nothing moves on from a resting spot once the fall is quick.)
      rate, start, startNext, sticky: retro && rate >= 0.5, turn: 1, reach: retro ? startNext + 5 * rate : 0,
      spawn: (id) => Bot.spawnOf(game, Pieces.get(id)),
    };
  }
  /** The coach's thinking over a snap, as a generator (the page runs it a slice a frame): every placement, best first. */
  function think(game, sn) { const v = viewOf(game, sn); return Bot.weigh(v, searchOf(v.queue.length)); }
  /** The same, at once (Bot.weighAll); all: every placement looked at in full now (else as a set is judged by it). */
  function rank(game, sn, all) { const v = viewOf(game, sn); return Bot.weighAll(v, Object.assign({ all: !!all }, searchOf(v.queue.length))); }
  /**
   * The ranking of the turn in play, kept with the turn once thought out (or handed in: ranked), so every try at a
   * piece, and its hint, are judged by the very same list.
   */
  function rankingOf(game, ranked) {
    const T = of(game);
    if (!T || !T.turn) return ranked || [];
    if (ranked) { T.ranked = ranked; T.rankedFor = T.turn; }
    else if (T.rankedFor !== T.turn || !T.ranked) { T.ranked = rank(game, T.turn); T.rankedFor = T.turn; }
    return T.ranked;
  }
  /** The best the coach holds up (Bot.weigh's best: always a placement a hand gets to, when there is one). */
  const bestOf = (ranked) => (ranked ? ranked.best || ranked[0] || null : null);

  /** A placement's cells as one key. */
  const cellKey = (cells) => cells.map((c) => c[0] + ',' + c[1]).sort().join(';');

  /**
   * A placement judged: the player's set (placed: { id, cells (where it was set), twist (0, 1 a Mini, 2), hold (Hold
   * used) }) found among the ranked ones by its piece and its cells (with the same Hold and Twist where there is one),
   * and how far it falls short of the best a hand gets to (loss, in the bot's units). The best's own cells are never
   * taken back, however they were reached (a Twist missed included), so the spot shown is always a good one. good: it
   * loses less than Strictness allows, or it is not among them (nothing to judge it by).
   */
  function assess(ranked, placed, strict) {
    const best = bestOf(ranked), key = cellKey(placed.cells), tw = placed.twist || 0;
    let entry = null, index = -1, fit = -1;
    (ranked || []).forEach((e, i) => {
      if (e.id !== placed.id || cellKey(e.cells) !== key) return;
      const f = (!!e.hold === !!placed.hold ? 2 : 0) + (e.twist === tw ? 1 : 0);
      if (f > fit) { entry = e; index = i; fit = f; }
    });
    const limit = STRICT[strict] != null ? STRICT[strict] : STRICT[DEFAULTS.strict];
    const atBest = !!best && best.id === placed.id && cellKey(best.cells) === key;
    // (The set looked at in full first, as the best was: the same search, the same footing.)
    if (entry && !entry.deep && ranked.deepen) ranked.deepen(entry);
    if (entry) index = ranked.indexOf(entry);
    const loss = atBest ? 0 : entry && best && entry.value != null ? Math.max(0, best.value - entry.value) : null;
    return { good: loss == null || loss < limit, loss, limit, index, entry, best };
  }

  /**
   * Hold pressed, judged as a move of its own (the turn's first: Hold is free again only once a piece is set): the
   * best line through Hold (the best of the placements Hold brings that were looked at in full) against the best of
   * all. good: it loses less than Strictness allows, Hold is the best, or nothing was weighed with Hold (Hold brings a
   * piece not in sight, or the same piece). Returns { good, loss, limit, best, held (the best with Hold) }.
   */
  function assessHold(ranked, strict) {
    const best = bestOf(ranked), limit = STRICT[strict] != null ? STRICT[strict] : STRICT[DEFAULTS.strict];
    let held = null;
    for (const e of ranked || []) if (e.hold && e.deep && (!held || e.value > held.value)) held = e;
    const loss = !best || !held ? null : best.hold ? 0 : Math.max(0, best.value - held.value);
    return { good: loss == null || loss < limit, loss, limit, best, held };
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
   * rough (only a bumpier top: the bumps of each), words: at most two, each naming what and how much, the heaviest
   * first ("Covers 2 holes", "Best clears 2 rows", "Blocks the well", "+3 rows high"; with none of those, "No spot for
   * next Z" when the difference is in the pieces ahead, else "Top +3 bumps"; "Hold I fits better" first when the best
   * was through Hold and the set was not) }; held: Hold was used for the set. The cells are where they are now, on the
   * board as it was.
   */
  function reasons(game, sn, entry, best, mine, held) {
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
    // Each reason with what it weighs (about the bot's units), the heaviest said first.
    const said = [];
    const rows = (n) => n + (n === 1 ? ' row' : ' rows');
    if (out.holes.length) said.push([6 * out.holes.length, out.holes.length === 1 ? 'Covers a hole' : 'Covers ' + out.holes.length + ' holes']);
    if (out.lines) said.push([out.lines.n >= 4 ? 12 : 3 * out.lines.n, 'Best clears ' + rows(out.lines.n)]);
    if (out.well) said.push([5 + pb.well.n, 'Blocks the well']);
    if (out.height) said.push([2 * (out.height.mine - out.height.best), '+' + rows(out.height.mine - out.height.best) + ' high']);
    said.sort((a, b) => b[0] - a[0]);
    out.words = said.map((x) => x[1]);
    if (!out.words.length && entry) {
      // Nothing to see on the board now: the difference is in the pieces ahead (the next has no good spot), or the top.
      const next = sn.queue[0] && sn.queue[0].id, q = game.recipe.classic ? game.recipe.classic.next : 0;
      if (q && next && best.own - entry.own < 1.5) out.words.push('No spot for next ' + next);
      else if (pm && pm.bumps.n > pb.bumps.n) { out.rough = { mine: pm.bumps.n, best: pb.bumps.n }; out.words.push('Top +' + (pm.bumps.n - pb.bumps.n) + ' bumps'); }
    }
    // Hold was the better move, and it was not used: said first.
    if (best.hold && !held) out.words.unshift('Hold ' + best.id + ' fits better');
    out.words = out.words.slice(0, 2);
    return out;
  }

  /**
   * What made a kept set good, for Explanation: { word (at most four words, naming what and how much), col (a column
   * to point at: the well) }, or null when there is nothing worth a word (a set kept that is neither a clear nor the
   * best's own spot: most are, and a word on each would only be noise). A clear by its kind ("Twist clears 2", "Quad:
   * 4 rows", "Board cleared", "Streak kept", "Clears 2 rows"); the best's own spot by the heaviest thing it does: the
   * well kept for a Quad ("Quad ready: well 4 deep", "Well kept, 3 deep"), a Twist slot made ("Sets up Twist slot"), a
   * gap filled ("Fills the 3-wide gap"), the next piece's spot (it is the best for what comes: "Next S fits after"),
   * else the feature it leads the second best by most ("No new holes", "Stack stays low", "Flattest top", ...).
   */
  function praise(game, sn, r, verdict) {
    if (!r || !verdict) return null;
    const rows = (n) => n + (n === 1 ? ' row' : ' rows');
    if (r.lines && (r.twist || r.mini)) return { word: 'Twist clears ' + r.lines };
    if (r.lines >= 4) return { word: 'Quad: ' + rows(r.lines) };
    if (r.perfect) return { word: 'Board cleared' };
    if (r.b2b) return { word: 'Streak kept' };
    if (r.lines) return { word: 'Clears ' + rows(r.lines) };
    if (verdict.loss !== 0 || !verdict.best) return null;
    const W = game.w, H = game.h, before = rowsOfCells(sn.cells, W, H), after = Bot.rowsOf(game.board), cells = r.cells || [];
    const ex = (rows) => Bot.explain(rows, W, H, {}).parts;
    const pa = ex(after), p0 = ex(before);
    const wb = wellOf(before, W, H), wa = wellOf(after, W, H);
    if (wb.depth >= 3 && !cells.some(([x]) => x === wb.x) && wa.x === wb.x) return { word: (pa.ready.n >= 3 ? 'Quad ready: well ' : 'Well kept, ') + wa.depth + ' deep', col: wa.x };
    if (pa.slot.n && !p0.slot.n) return { word: 'Sets up Twist slot' };
    // A gap filled: the columns it rests in, side by side, lower than the stack on both sides (or a wall).
    const hg = []; for (let x = 0; x < W; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if ((before[y] >>> x) & 1) { t = y + 1; break; } hg.push(t); }
    const rest = [...new Set(cells.filter(([x, y]) => y === hg[x]).map(([x]) => x))].sort((a, b) => a - b);
    if (rest.length >= 2 && rest[rest.length - 1] - rest[0] === rest.length - 1) {
      const lo = rest[0], hi = rest[rest.length - 1], top = Math.max(...rest.map((x) => hg[x]));
      if ((lo === 0 || hg[lo - 1] > top) && (hi === W - 1 || hg[hi + 1] > top) && rest.every((x) => hg[x] === hg[lo])) return { word: 'Fills the ' + rest.length + '-wide gap' };
    }
    // The best for what comes: not the best on its own.
    const ranked = verdict.ranked, next = sn.queue[0] && sn.queue[0].id, q = game.recipe.classic ? game.recipe.classic.next : 0;
    if (ranked && q && next) { let top = -Infinity; for (const e of ranked) if (e.hand) top = Math.max(top, e.own); if (top - verdict.best.own > 1) return { word: 'Next ' + next + ' fits after' }; }
    // Else what it leads the second best by most.
    const second = ranked && ranked.find((e) => e.deep && e !== verdict.best && cellKey(e.cells) !== cellKey(verdict.best.cells));
    if (second) {
      const ps = ex(second.rows), pb = ex(verdict.best.rows);
      const NAMES = { holes: 'No new holes', covered: 'Nothing buried', bumps: 'Flattest top', height: 'Stack stays low', danger: 'Stack stays low', well: 'Keeps the well', rowTransitions: 'Rows kept clean', colTransitions: 'Rows kept clean', otherWells: 'No second well', slot: 'Sets up Twist slot', holeRows: 'No new holes' };
      let bestK = null, by = 0.5;
      for (const k of Object.keys(NAMES)) { const d = pb[k].v - ps[k].v; if (d > by) { by = d; bestK = k; } }
      if (bestK) return { word: NAMES[bestK] };
    }
    const dh = Bot.heightOf(before, H) - Bot.heightOf(after, H);
    return { word: dh > 0 ? 'Stack −' + dh : 'Stack stays low' };
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
   * A piece was set (the lock's result r, the board now after it): judged against the turn's ranking (rankingOf:
   * ranked when handed in, else the one kept with the turn, else thought now), and recorded. Placed well: counted (and
   * at the first try, when it was), the turn's hint and explanation gone. Placed poorly: one more try, the best spot
   * and the why kept, and the turn marked to go back
   * (T.back: the next piece's appearing does not start a new turn; rewind() takes the game back). o: the settings
   * (settingsOf's, or Settings). Returns { act: 'keep' | 'rewind', verdict, praise (kept: praise's word, or null), col
   * (the column it points at, or null) }.
   */
  function place(game, r, o, ranked) {
    const T = of(game);
    if (!T || !T.turn) return { act: 'keep', verdict: null };
    o = settingsOf(o);
    const list = rankingOf(game, ranked);
    // (Hold was used for this set when the game's count of holds went up since the piece appeared.)
    const placed = { id: r.type, cells: r.cells || [], twist: r.twist ? 2 : r.mini ? 1 : 0, hold: (game.s.holds || 0) > (T.turn.s.holds || 0) };
    const v = assess(list, placed, o.strict);
    if (v.good) {
      T.placed++;
      if (!T.tries) T.first++;
      T.tries = 0; T.best = null; T.why = null;
      const pr = praise(game, T.turn, r, Object.assign({ ranked: list }, v));
      return { act: 'keep', verdict: v, praise: pr ? pr.word : null, col: pr && pr.col != null ? pr.col : null };
    }
    T.tries++;
    T.rewinds++;
    T.best = v.best ? { id: v.best.id, r: v.best.r, x: v.best.x, y: v.best.y, hold: !!v.best.hold, cells: cellsOf(v.best) } : null;
    T.why = v.best && r && r.cells ? reasons(game, T.turn, v.entry, v.best, r.cells, placed.hold) : null;
    T.back = true;
    return { act: 'rewind', verdict: v };
  }

  /**
   * Hold was pressed (the piece in play went to Hold): judged at once (assessHold, by the turn's ranking). Kept, the
   * set that follows is judged as any. Poor (the piece was better set as it was): one more try, as a poor set is (the
   * best spot kept for Hint after, the why: { hold: true, words: ['T fits better now'] }: the piece Hold put away), and the turn marked to go back (rewind
   * puts the piece and Hold as they were). Returns { act: 'keep' | 'rewind', verdict, praise (when Hold was the best
   * move, what it did: "Saves I for the well", "S fits better now") }.
   */
  function holdPress(game, o, ranked) {
    const T = of(game);
    if (!T || !T.turn || T.back) return { act: 'keep', verdict: null };
    o = settingsOf(o);
    const v = assessHold(rankingOf(game, ranked), o.strict);
    // (Kept: a word for it when Hold was the best move.)
    if (v.good) {
      if (!v.best || !v.best.hold) return { act: 'keep', verdict: v, praise: null };
      // What Hold did: kept an I for a well three deep or more, else brought in the piece that fits.
      const sn = T.turn, before = rowsOfCells(sn.cells, game.w, game.h), wb = wellOf(before, game.w, game.h), cur = sn.piece ? sn.piece.entry.id : '';
      return { act: 'keep', verdict: v, praise: cur === 'I' && wb.depth >= 3 ? 'Saves I for the well' : v.best.id + ' fits better now' };
    }
    T.tries++;
    T.rewinds++;
    T.best = { id: v.best.id, r: v.best.r, x: v.best.x, y: v.best.y, hold: !!v.best.hold, cells: cellsOf(v.best) };
    const cur = T.turn.piece ? T.turn.piece.entry.id : '';
    T.why = { hold: true, mine: [], best: T.best, holes: [], lines: null, well: null, height: null, rough: null, words: [cur + ' fits better now'] };
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
    T.back = false; T.ranked = null; T.rankedFor = null;
    game.on('spawn', () => { if (!game.holdLocked && !T.back) newTurn(T, snap(game)); });
    return {
      T,
      save() { const o = Object.assign({}, T); delete o.back; delete o.ranked; delete o.rankedFor; return clone(o); },
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

  L.Training = { STRICT, STRICT_IDS, STRICT_NAMES, HINT, DEFAULTS, SEARCH, HAND, on, settingsOf, snap, restore, viewOf, think, rank, rankingOf, bestOf, cellKey, assess, assessHold, holdPress, praise, reasons, cellsOf, holeSet, wellOf, newTurn, hintOf, whyOf, place, rewind, firstPct, of, fresh, validState, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
