// Lull — Free Play's power-up rules that are not the engine's own: the chain multiplier, combos, Luck, the daily
// gift and the few power-ups play earns. Pure rules, no drawing. (The catalog itself is in js/store.js; what each
// item does to the board is in js/engine.js.)
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL } = L;

  // What changed with the board recipe (js/recipe.js), read from a lock result: r.quad (a quad set by a piece: R.quad
  // rows, 4 on a Normal board) and r.own (Standard-comparable rows, what pays). A result made by hand (the tests) has
  // neither: its own lines are lines less plain, a quad 4 of them.
  const quadOf = (r) => (r.quad !== undefined ? !!r.quad : (r.lines || 0) - (r.plain || 0) >= 4);
  const ownOf = (r) => (r.own !== undefined ? r.own : r.lines || 0);
  /** A board's rules, or what a width alone implies (a number, or a board without rules: a Normal board). */
  const lkOf = (R) => (typeof R === 'number' ? L.Library.scale(R) : R && R.lk != null ? R.lk : L.Library.worth(R));

  // ---- the chain multiplier -----------------------------------------------------------------------------------------
  //
  // The streak is the run of back-to-back quads and T-spins (this one included). It alone sets the multiplier: an extra
  // ×0.05 for each link after the first, to the hundredth. In Free Play ×1.05 at two in a row, ×1.5 at eleven and ×2 at
  // most, reached at twenty-one; in Classic the same steps, ×1.5 at most (eleven), on the lines Classic banks (seven
  // tenths of a line a line, CLASSIC.rate; never its score). The chain — the number to be proud of — counts the streak
  // and the combo together, and is shown beside the multiplier. Lines an item clears are plain (js/engine.js, score):
  // they never add a link. A Safety Net keeps the streak through one ordinary clear, once.

  const Chain = {
    RELAXED: { step: 0.05, cap: 2 },
    CLASSIC: { step: 0.05, cap: 1.5, rate: 0.7 },
    /** The multiplier a streak of n earns: ×1 for none or one, then `step` a link, to the hundredth, never over `cap`. */
    mult(n, mode) {
      const c = mode === 'classic' ? Chain.CLASSIC : Chain.RELAXED;
      return Math.min(c.cap, Math.round((1 + Math.max(0, (n || 0) - 1) * c.step) * 100) / 100);
    },
    /** The streak after a lock (the engine's back-to-back count already includes it). */
    streak(g) { return g.s.b2b >= 0 ? g.s.b2b + 1 : 0; },
    /** The chain count: the streak plus the combo. */
    count(g) { return Chain.streak(g) + Math.max(0, g.s.combo); },
    /** "×1.65", "×2", "×1.05". */
    fmt(m) { return '×' + String(Math.round(m * 1000) / 1000); },
  };

  // ---- combos -------------------------------------------------------------------------------------------------------
  //
  // Things worth a little more: lines, a short boost (the next few clears pay more) and points. Four are pure skill;
  // the rest are a power-up used well, each saying exactly what to do. Free Play has no clock, so none is for
  // repeating: on one board each pays in full the first time, half the second, a quarter the third and nothing after
  // (it still shows); boosts come with the first two only. The first time a combo is ever found it also brings a
  // power-up (js/modes.js), once.

  const COMBOS = [
    { id: 'painted', kind: 'skill', name: 'Painted Row', how: 'Clear a row that is all one colour.', lines: 5, score: 1000 },
    { id: 'pocket', kind: 'skill', name: 'From the Pocket', how: 'Clear four lines with an I brought back out of hold.', lines: 2, score: 300 },
    { id: 'keyhole', kind: 'skill', name: 'Keyhole', how: 'Clear a line with a piece tucked in under an overhang.', lines: 2, score: 300 },
    { id: 'twinspin', kind: 'skill', name: 'Twin Spin', how: 'Two T-spin doubles back to back.', lines: 4, boost: { x: 1.5, clears: 3 }, score: 800 },
    { id: 'patchjob', kind: 'item', name: 'Patch Job', how: 'Complete a row with a Patch dropped into a covered hole.', lines: 2, score: 300 },
    { id: 'ghostline', kind: 'item', name: 'Through the Wall', how: 'Clear a line with a Ghost piece set under an overhang.', lines: 3, score: 500 },
    { id: 'tower', kind: 'item', name: 'Tall Order', how: 'Clear four lines at once with a Noodle or a Giant.', lines: 3, score: 600 },
    { id: 'architect', kind: 'item', name: 'Architect', how: 'Clear three lines at once with a Blueprint piece.', lines: 4, score: 800 },
    { id: 'tailor', kind: 'item', name: 'Tailor-Made', how: 'Clear four lines with a Best Fit piece.', lines: 3, score: 600 },
    { id: 'allin', kind: 'item', name: 'All In', how: 'Win a Double or Nothing.', lines: 2, score: 500 },
    { id: 'caught', kind: 'item', name: 'Caught', how: 'Let a Safety Net keep a back-to-back streak of five or more.', lines: 3, boost: { x: 1.25, clears: 3 }, score: 800 },
    { id: 'fullblast', kind: 'item', name: 'Full Blast', how: 'Take out ten blocks or more with one Bomb.', lines: 2, score: 400 },
    { id: 'horizon', kind: 'item', name: 'Event Horizon', how: 'Swallow twenty blocks or more with one Black Hole.', lines: 3, score: 600 },
  ];
  const BY_ID = Object.fromEntries(COMBOS.map((c) => [c.id, c]));
  const SHARE = [1, 0.5, 0.25];

  /**
   * What a combo pays the (k+1)th time it comes round in the board library (Library.taper). Its lines are Standard
   * lines: Free Play pays them by the board's width (Library.scale), as every clear.
   */
  function reward(c, k) {
    const f = SHARE[k] || 0;
    return { lines: Math.floor((c.lines || 0) * f), boost: c.boost && k < 2 ? c.boost : null, score: c.score || 0 };
  }

  /**
   * How many blocks an item took out, as Full Blast and Event Horizon count them (id: the combo, cells: what the item
   * took): one copy's share on a board of several copies (Mirror: R.copies 2, both halves act at once, so a Bomb
   * counts for one half), or a part's own count (the engine hook comboCount(g, id, cells) -> number). A plain board:
   * every cell, as always.
   */
  function blocksOf(id, cells, g) {
    const n = (cells || []).length;
    if (g && g.hooks && g.hooks.comboCount) {
      const own = g.ask('comboCount', id, cells || []);
      if (typeof own === 'number' && isFinite(own)) return own;
    }
    const c = g && g.rules && g.rules.copies > 1 ? g.rules.copies : 1;
    return n / c;
  }

  /**
   * The combos a lock result makes (Free Play). Keeps one counter on the board's stats: was the last clear a TSD. The
   * skill ones need a rated board with the feats on (no Jelly: R.noFeats); a quad is the board's (r.quad).
   */
  function detect(r, g) {
    const s = g.s, out = [];
    const own = (r.lines || 0) - (r.plain || 0), quad = quadOf(r);
    const R = g.rules, skill = !R || (!!R.rated && !R.noFeats);
    // One colour across a row is a flat I on a board 4 wide: Painted Row needs a board at least Standard width.
    if (r.lines && (g.rules ? g.rules.wEff : g.w) >= (L.Library ? L.Library.STANDARD.w : 10) && (r.removed || []).some((row) => { const c = row[0] & CELL.COLOR; return c && c !== 8 && row.every((v) => (v & CELL.COLOR) === c); })) out.push('painted');
    if (quad && r.type === 'I' && r.fromHold && !r.special) out.push('pocket');
    if (own && r.covered && !r.special) out.push('keyhole');
    const tsd = !!(r.tspin && own === 2);
    if (tsd && r.b2b && s.lastTsd) out.push('twinspin');
    if (r.lines) s.lastTsd = tsd;
    if (r.special === 'patch' && r.lines) out.push('patchjob');
    if (r.special === 'phase' && r.lines && r.covered) out.push('ghostline');
    if ((r.tag === 'noodle' || r.tag === 'giant') && quad) out.push('tower');
    if (r.tag === 'blueprint' && own >= 3) out.push('architect');
    if (r.tag === 'fit' && quad) out.push('tailor');
    if (r.double === 'won') out.push('allin');
    if ((r.netSaved || 0) >= 5) out.push('caught');
    if (r.special === 'bomb' && blocksOf('fullblast', r.blast, g) >= 10) out.push('fullblast');
    if (r.special === 'blackhole' && blocksOf('horizon', r.swallowed, g) >= 20) out.push('horizon');
    return skill ? out : out.filter((id) => BY_ID[id].kind !== 'skill');
  }

  const Combos = { LIST: COMBOS, get: (id) => BY_ID[id], reward, detect, blocksOf, SHARE };

  // ---- luck -------------------------------------------------------------------------------------------------------------
  //
  // Golden Piece: gold for your next five clears, each paying ×2 (on top of the chain and any boost); unused gold waits
  // on the board, so it is never wasted on a piece that clears nothing. It adds five clears' pay once over: 50 for its
  // 50 on quads at a full streak, so at best it breaks even.
  // Double or Nothing: the next clear pays double if it is a difficult clear (a quad set by hand, a T-spin or a mini),
  // and nothing at all if it is anything less. A shaped piece's quad (a Noodle, a Giant, a Blueprint) is not difficult.
  // It waits for a clear, too.
  // Safety Net: see the chain above. None of the three touches the pieces or the board, so none puts power-ups on the
  // board for the achievements.

  // The pieces a power-up made (their item id, `tag`: js/modes.js, become): a quad with one is no feat.
  const SHAPED = new Set(['noodle', 'giant', 'blueprint']);
  /** A difficult clear: a quad or better set by a hand-played piece (not a shaped one), a T-spin or a mini. */
  const difficult = (r) => (quadOf(r) && !SHAPED.has(r.tag)) || !!r.tspin || !!r.mini;

  const Luck = {
    GOLD_CLEARS: 5, GOLD_X: 2, DOUBLE_X: 2, SHAPED,
    /** What gold adds over its clears, if they would have paid `pay` each. */
    goldValue(pay) { return Luck.GOLD_CLEARS * pay * (Luck.GOLD_X - 1); },
    /** Does a clear win a Double or Nothing? A difficult clear: the same one that earns the extra line (Pay.clear). */
    doubleWins(r) { return difficult(r); },
  };

  // ---- what a clear pays in Free Play ----------------------------------------------------------------------------------
  //
  // Measured in Standard lines (Library.scale: a line w wide is w/10 of one), and so is everything that pays by the
  // clear: for the same play no size earns faster per piece than Standard. The streak's links count by width too (a
  // narrow board makes difficult clears more often, each clearing fewer cells), never more than one a clear; the
  // difficult-clear bonus is at most one Standard line (a wide board's T-spin is still one T); gold and a boost last
  // for Standard clears (a Golden Piece is five Standard-width clears: two and a half 20 wide, twelve and a half 4
  // wide), the last one paying its share; and a won Double or Nothing doubles at most one Standard clear's worth.

  const Pay = {
    /** The chain multiplier after a lock on board g (what a row there is worth: Library.worth); ×1 on an unrated board. */
    mult(g) { return g.rules && g.rules.rated === false ? 1 : Chain.mult(Chain.streak(g) * Math.min(1, L.Library.worth(g))); },
    /** Gold (or a boost's clears) left, in Standard clears, as clears on a board (its rules R, or its width): "3 left". */
    clearsLeft(left, R) { return left > 0 ? Math.ceil(left / lkOf(R) - 1e-9) : 0; },
    /**
     * What clear `r` pays on board state `s` (its mult already set) on a board with rules R (or, a Normal board, its
     * width), in Standard lines, rounded down to the hundredth: r.own rows at R.lk each, and one Standard line at most
     * for a quad or T-spin (none on an unrated board: R.rated false). Spends gold, a boost's clears and Double or
     * Nothing from `s`. Returns { pay, golden, goldX, boost, double }.
     */
    clear(s, r, R) {
      const lk = lkOf(R), out = {};
      const rules = R && typeof R === 'object' ? R.rules || R : null;
      const bonus = !(rules && rules.rated === false) && difficult(r);
      let pay = (ownOf(r) * lk + (bonus ? Math.min(1, lk) : 0)) * (s.mult || 1);
      /** One clear's use of something that lasts `left` Standard clears: the share of this clear it covers. */
      const use = (left) => ({ share: Math.min(1, left / lk), left: Math.max(0, Math.round((left - lk) * 1000) / 1000) });
      if (s.gold > 0) {
        const u = use(s.gold);
        s.gold = u.left;
        out.golden = true;
        out.goldX = 1 + (Luck.GOLD_X - 1) * u.share;
        pay *= out.goldX;
      }
      if (s.boost && s.boost.left > 0) {
        const u = use(s.boost.left);
        pay *= 1 + (s.boost.x - 1) * u.share;
        out.boost = s.boost.x;
        s.boost.left = u.left;
        if (s.boost.left <= 0) s.boost = null;
      }
      if (s.double) {
        s.double = false;
        const won = Luck.doubleWins(r);
        out.double = won ? 'won' : 'lost';
        pay = won ? pay * (1 + (Luck.DOUBLE_X - 1) * Math.min(1, 1 / lk)) : 0;
      }
      out.pay = L.Library.bank(pay);
      return out;
    },
  };

  // ---- the daily gift ---------------------------------------------------------------------------------------------------
  //
  // Three different entries, drawn by rarity (common 8, uncommon 3, rare 1): the power-ups (Undo comes as its pack of
  // five) and one freebie, a free puzzle hint (store.js, FREEBIES). Nearly six in ten of what it gives is common, about
  // one in thirteen rare, and one gift in ten holds a free hint. It can be opened again 24 hours after it was last
  // opened — the time since, not the date. The claim time is booked in the save as it opens; a clock turned back never
  // opens it early (the next one is still 24 hours after the booked time, however far back the clock went), and the
  // draw is fixed by the save and the number of gifts opened, so reopening Lull or switching tabs never re-rolls it.
  // What play earns is drawn from the power-ups alone.

  const RARITY = { common: 8, uncommon: 3, rare: 1 };
  const DAY_MS = 24 * 3600e3;
  const Gifts = {
    COUNT: 3, RARITY, WAIT: DAY_MS,
    /** An entry's weight in any draw (0: never given): a power-up or a freebie. */
    weight(id) {
      const it = (L.ITEMS && L.ITEMS[id]) || (L.FREEBIES && L.FREEBIES[id]);
      return it ? RARITY[it.rarity] || 0 : 0;
    },
    /** What the daily gift draws from: every power-up, then the freebies. */
    pool() { return (L.ITEM_ORDER || []).concat(Object.keys(L.FREEBIES || {})); },
    /**
     * n different entries (three by default), drawn by weight from a random source (a function returning [0, 1)), out
     * of `ids` (by default the power-ups alone, as play earns them).
     */
    draw(rand, n, ids) {
      const pool = (ids || L.ITEM_ORDER || []).map((id) => [id, Gifts.weight(id)]).filter(([, w]) => w > 0), out = [];
      while (out.length < (n || Gifts.COUNT) && pool.length) {
        const tot = pool.reduce((a, [, w]) => a + w, 0);
        let t = rand() * tot, k = 0;
        while (k < pool.length - 1 && t >= pool[k][1]) { t -= pool[k][1]; k++; }
        out.push(pool[k][0]);
        pool.splice(k, 1);
      }
      return out;
    },
    /** The nth gift for one save: the same every time it is asked for. */
    forClaim(seed, n) { const rng = new L.RNG('lull:gift:' + seed + ':' + n); return Gifts.draw(() => rng.next(), Gifts.COUNT, Gifts.pool()); },
    /** When the next gift can be opened (ms since the epoch); 0 when there has never been one. */
    nextAt(state) { const at = state.gift && state.gift.at; return at == null ? 0 : at + DAY_MS; },
    /** Can the gift be opened at `now`? Only 24 hours or more after the last claim, by the clock of that claim. */
    ready(state, now) { return now >= Gifts.nextAt(state); },
    /** How long until the next one (0 when ready). */
    left(state, now) { return Math.max(0, Gifts.nextAt(state) - now); },
  };

  // ---- earned in play ---------------------------------------------------------------------------------------------------
  //
  // Beside the gift, play brings a few: one power-up for every two hundred lines cleared on a board (Standard lines),
  // and one the first time each combo is ever found (drawn from the power-ups alone; an Undo comes as its pack). The
  // board's count is kept in the save, outside the board (so an Undo and a replayed clear never pay twice), and starts
  // from the lines a board already has when it is first seen.

  const Earn = {
    EVERY: 200,
    /**
     * Milestones reached by a lock: e = the save's record { board, paid }, id = the board (its start time), lines = its
     * lines now, before = its lines before this lock. Updates e; returns how many power-ups are due (0 or 1, in play).
     */
    lines(e, id, lines, before) {
      if (e.board !== id) { e.board = id; e.paid = Math.floor(Math.max(0, before) / Earn.EVERY); }
      const k = Math.floor(lines / Earn.EVERY);
      if (k <= e.paid) return 0;
      const due = k - e.paid;
      e.paid = k;
      return due;
    },
  };

  Object.assign(L, { Chain, Combos, Luck, Pay, Gifts, Earn });
})(typeof globalThis !== 'undefined' ? globalThis : this);
