// Lull — the games kept (state.boards): one game for each mode, resumed exactly as it was left, and the presets of
// Custom. Plain data on the save, no DOM: the Play menu (js/menu.js) and the board in play (js/modes.js, PlayMode) use
// it, and this file is what the tests drive.
//
// state.boards = { cur, games: { [mode]: kept }, presets: [preset], seq, taper: { comboId: times paid }, size, recipe, menu }
//   cur: the mode of the game in play (its game is the save's `free`); one of Relaxed ('plain'), Classic, Descent,
//        Mural, Race or Battle: a recipe's mode (Recipe.normalize(r).mode).
//   kept: { game, earn, touched } — the game of a mode not in play: its Game.toJSON() (cells, piece, hold, queue, bag,
//         RNG state, every per-board stat) and the save's Earn record (js/items.js) parked with it, so a milestone pays
//         once. Opening that mode again (the menu's Continue) resumes it; New game replaces it.
//   preset: { id, name, created, recipe, size } — rules saved from the Custom window, started from the Custom page. A
//           Custom game itself is never kept: it is played on the side and gone once it is left (PlayMode.startCustom).
//   size, recipe: what the Custom window last chose; menu: each mode's setup as last chosen in the menu ({ recipe, size }).
//
// Saves from before (version 2 and older) kept a library: up to twelve boards and fifty retired records. migrate()
// keeps the most recently played board of each mode as that mode's game, and lets the rest and the records go.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const MAX_PRESETS = 12, NAME_MAX = 24;

  // ---- board sizes and what a line is worth -------------------------------------------------------------------------
  //
  // A Relaxed board is any size from 4 x 8 to 20 x 40, fixed for its life. Four wide is the flat I; eight tall is a
  // Giant I on end. Everything that pays or counts toward a reward is measured in Standard lines: a Standard line is ten
  // cells, so a line cleared on a board w wide is worth w/10 of one (height changes nothing). scale() is the one place
  // that says so; bank() rounds a payout down to the hundredth, so for the same play no size earns faster than Standard
  // (scripts/econ-test.cjs prices every clear its bots make 10 wide too).

  const STANDARD = Object.freeze({ w: 10, h: 20 });
  const LIMITS = Object.freeze({ w: Object.freeze([4, 20]), h: Object.freeze([8, 40]) });
  /** What one line cleared on a board w wide is worth, in Standard lines, by its size alone. */
  function scale(w) { return (typeof w === 'number' && w > 0 ? w : STANDARD.w) / STANDARD.w; }
  /**
   * What a row cleared on board g is worth, in Standard lines: its size and its recipe (Recipe.rules: lk = (w/10)·f,
   * so a board of small pieces never pays more per cell than Standard). Every pay and count goes through this;
   * scale() stays for what is about size alone. g: a Game (its rules), or a saved one ({ w, recipe }).
   */
  function worth(g) {
    if (g && g.rules && typeof g.rules.lk === 'number') return g.rules.lk;
    const w = g && typeof g.w === 'number' && g.w > 0 ? g.w : STANDARD.w;
    return L.Recipe ? L.Recipe.rules(g && g.recipe, w).lk : scale(w);
  }
  /** A payout in lines, rounded down to the hundredth (the wallet keeps hundredths). */
  function bank(x) { return x > 0 ? Math.floor(x * 100 + 1e-6) / 100 : 0; }
  const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;
  /** A size a board can have: whole numbers in range. */
  function validSize(w, h) { return inRange(w, LIMITS.w) && inRange(h, LIMITS.h); }
  const clampTo = (v, [lo, hi], d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d);
  /**
   * Any { w, h } made a size a board can have (Standard where a number is missing): with a recipe, a size a board of
   * that recipe can have (Recipe.clampSize: its parts raise the minimums).
   */
  function clampSize(o, recipe) {
    if (recipe !== undefined && L.Recipe) return L.Recipe.clampSize(o, recipe);
    o = o || {};
    return { w: clampTo(o.w, LIMITS.w, STANDARD.w), h: clampTo(o.h, LIMITS.h, STANDARD.h) };
  }
  /** "12 × 24". */
  function sizeLabel(w, h) { return w + ' \u00d7 ' + h; }

  const defaultRecipe = () => (L.Recipe ? JSON.parse(JSON.stringify(L.Recipe.DEFAULT)) : null);
  function blank() { return { cur: null, games: {}, presets: [], seq: 0, taper: {}, size: { w: STANDARD.w, h: STANDARD.h }, recipe: defaultRecipe(), menu: {} }; }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const idOk = (e) => isObj(e) && !!L.Pieces && !!L.Pieces.get(e.id);
  /**
   * A saved game that can be resumed: a size in range with a stack to match, a queue, a bag, a random stream, stats;
   * and a board recipe every part accepts (Recipe.valid), a height its recipe allows (less a buffer it keeps on top:
   * R.k, Race's), and every piece in the queue, in hold and in play one the pieces know (Pieces.get).
   */
  const playable = (g) => isObj(g) && validSize(g.w, g.h) && Array.isArray(g.cells) && g.cells.length === g.w * g.h && Array.isArray(g.queue) && Array.isArray(g.bag) && g.rng != null && isObj(g.s)
    && (!L.Recipe || (L.Recipe.valid(g) && L.Recipe.sizeOk(g.w, g.h - (L.Recipe.rules(g.recipe, g.w).k || 0), g.recipe)))
    && g.queue.every(idOk) && (g.hold == null || idOk(g.hold)) && (g.piece == null || (isObj(g.piece) && idOk(g.piece.entry)));

  /** The mode a recipe is played in, the key its game is kept under: 'plain' (Relaxed), 'classic', 'race' … */
  function modeOf(recipe) { return L.Recipe ? L.Recipe.normalize(recipe).mode : 'plain'; }
  const freshEarn = () => ({ board: null, paid: 0 });

  /**
   * A save from before one game a mode (state.boards with a list of boards and retired records): the most recently
   * played board of each mode is kept as that mode's game (the board in play counts as the most recent of all, and
   * stays in play), the rest go, and so do the retired records. Nothing else in the save changes. True if it did that.
   */
  function migrate(st, now) {
    const B = st.boards;
    if (!isObj(B) || !(Array.isArray(B.list) || 'retired' in B)) return false;
    const best = {};
    const offer = (mode, b) => { if (!best[mode] || b.t > best[mode].t) best[mode] = b; };
    for (const r of Array.isArray(B.list) ? B.list : []) {
      if (!isObj(r) || typeof r.id !== 'string' || r.id === B.cur) continue;
      if (playable(r.game)) offer(modeOf(r.game.recipe), { t: num(r.touched, 0), game: r.game, earn: isObj(r.earn) ? r.earn : null });
    }
    // The board in play (the save's free, whether or not it had a record) stays the game in play.
    const cur = st.free && isObj(st.free) ? modeOf(st.free.recipe) : null;
    if (cur) delete best[cur];
    const games = {};
    for (const [mode, b] of Object.entries(best)) games[mode] = { game: b.game, earn: b.earn, touched: b.t || now };
    for (const k of ['list', 'retired']) delete B[k];
    B.seq = 0;
    B.cur = cur;
    B.games = games;
    return true;
  }

  /**
   * The save's games and presets, made whole and safe to show: an old library migrated (migrate), only games that
   * can be resumed, each kept under its own mode and never under the one in play, presets with a name, a recipe and a
   * size a board of it can have (twelve at most), and cur the mode of the game in play.
   */
  function ensure(st, now) {
    // Made whole in place: whoever holds the object still holds it.
    const B = st.boards = isObj(st.boards) ? st.boards : blank();
    migrate(st, now);
    for (const [k, v] of Object.entries(blank())) if (!(k in B)) B[k] = v;
    if (st.free && isObj(st.free)) B.cur = modeOf(st.free.recipe);
    else if (typeof B.cur !== 'string' || !B.cur) B.cur = 'plain';
    if (!isObj(B.games)) B.games = {};
    for (const [k, e] of Object.entries(B.games)) {
      if (k === B.cur || !isObj(e) || !playable(e.game) || modeOf(e.game.recipe) !== k) { delete B.games[k]; continue; }
      e.earn = isObj(e.earn) ? e.earn : null;
      e.touched = num(e.touched, now);
    }
    const seen = new Set();
    B.presets = (Array.isArray(B.presets) ? B.presets : []).filter((p) => isObj(p) && typeof p.id === 'string' && p.id && !seen.has(p.id) && (seen.add(p.id), true) && cleanName(p.name));
    if (B.presets.length > MAX_PRESETS) B.presets.length = MAX_PRESETS;
    B.presets.forEach((p) => {
      p.name = cleanName(p.name);
      p.recipe = L.Recipe ? L.Recipe.normalize(p.recipe) : null;
      p.size = clampSize(p.size, L.Recipe ? p.recipe : undefined);
      p.created = num(p.created, now);
    });
    B.seq = Math.max(num(B.seq, 0), ...B.presets.map((p) => (/^p(\d+)$/.test(p.id) ? +p.id.slice(1) : 0)));
    if (!isObj(B.taper)) B.taper = {};
    // The Play menu's last setup of each mode ({ recipe, size }, made whole where it is read: js/menu.js).
    if (!isObj(B.menu)) B.menu = {};
    for (const k of Object.keys(B.menu)) if (!isObj(B.menu[k])) delete B.menu[k];
    B.recipe = L.Recipe ? L.Recipe.normalize(B.recipe) : null;
    B.size = clampSize(B.size, L.Recipe ? B.recipe : undefined);
    return B;
  }

  // ---- one game a mode ----------------------------------------------------------------------------------------------

  /** The game a mode has kept (Game.toJSON), or null; the one in play is curJSON (PlayMode.boardJSON). */
  function saved(B, mode, curJSON) {
    if (mode === B.cur) return curJSON || null;
    const e = B.games[mode];
    return e && e.game ? e.game : null;
  }

  /** Parks the game in play under its mode: its game as it stands, its Earn record, the time. */
  function park(st, curJSON, now) {
    const B = st.boards;
    if (!B.cur || !curJSON) return null;
    const e = { game: curJSON, earn: Object.assign(freshEarn(), st.earn || {}), touched: now };
    B.games[B.cur] = e;
    return e;
  }

  /**
   * Continue: the game a mode kept comes into play (the one in play is parked under its own mode first). Returns its
   * game to resume, or null when that mode has none (the caller starts a new one: newGame). Not for the mode in play.
   */
  function open(st, mode, curJSON, now) {
    const B = st.boards;
    if (mode === B.cur) return null;
    park(st, curJSON, now);
    const e = B.games[mode] || null;
    delete B.games[mode];
    B.cur = mode;
    st.earn = Object.assign(freshEarn(), (e && e.earn) || {});
    st.free = e ? e.game : null;
    return st.free;
  }

  /**
   * New game: `mode`'s game is replaced by a new one (the caller starts it, with its own seed). The game in play, if
   * it is another mode's, is parked under that mode first. Returns the game that was replaced (for the log), or null.
   */
  function replace(st, mode, curJSON, now) {
    const B = st.boards;
    let gone = null;
    if (mode === B.cur) gone = curJSON || null;
    else {
      park(st, curJSON, now);
      gone = B.games[mode] ? B.games[mode].game : null;
      delete B.games[mode];
    }
    B.cur = mode;
    st.earn = freshEarn();
    st.free = null;
    return gone;
  }

  /** The (k)th time a combo comes round in any game (0 first), counted: what its pay is cut by (Combos.reward). */
  function taper(B, id, own) {
    B.taper = isObj(B.taper) ? B.taper : {};
    const k = Math.max(B.taper[id] || 0, own || 0);
    B.taper[id] = k + 1;
    return k;
  }

  // ---- presets (Custom) ---------------------------------------------------------------------------------------------

  /**
   * A name as typed, cleaned: spaces collapsed, controls and invisible format characters (zero-width, bidi) dropped, at
   * most NAME_MAX characters; null when nothing visible is left.
   */
  function cleanName(raw) {
    const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, '').replace(/ {2,}/g, ' ').trim();
    if (!/[\p{L}\p{N}\p{S}\p{P}]/u.test(s)) return null;
    return Array.from(s).slice(0, NAME_MAX).join('').trim();
  }

  /** `name`, or with " 2", " 3" … if another preset (other than `self`) already has it. */
  function uniqueName(B, name, self) {
    const taken = new Set(B.presets.filter((p) => p !== self).map((p) => String(p.name).toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let k = 2; ; k++) {
      const tail = ' ' + k, n = Array.from(name).slice(0, NAME_MAX - tail.length).join('').trim() + tail;
      if (!taken.has(n.toLowerCase())) return n;
    }
  }

  function findPreset(B, id) { return B.presets.find((p) => p.id === id) || null; }
  const presetsFull = (B) => B.presets.length >= MAX_PRESETS;

  /** Saves rules as a preset, last in the list: null when twelve are kept or the name has nothing visible. */
  function addPreset(B, raw, recipe, size, now) {
    const name = cleanName(raw);
    if (!name || presetsFull(B)) return null;
    const r = L.Recipe ? L.Recipe.normalize(recipe) : null;
    B.seq = (B.seq || 0) + 1;
    const p = { id: 'p' + B.seq, name: uniqueName(B, name), created: now, recipe: r, size: clampSize(size, L.Recipe ? r : undefined) };
    B.presets.push(p);
    return p;
  }

  function renamePreset(B, id, raw) {
    const p = findPreset(B, id), name = cleanName(raw);
    if (!p || !name) return null;
    p.name = uniqueName(B, name, p);
    return p.name;
  }

  function removePreset(B, id) {
    const i = B.presets.findIndex((p) => p.id === id);
    if (i < 0) return false;
    B.presets.splice(i, 1);
    return true;
  }

  /**
   * A game's life in numbers, from its stats (Game.s), as of `now` (what its summary card shows); with
   * its size when given. Lines are the board's own (raw); banked is what it paid, in Standard lines.
   */
  function summarize(s, now, size) {
    s = s || {};
    // A board's recipe can add its own numbers (Descent's rows broken, Race's and Battle's rounds): Recipe.summary, from a Game or a
    // saved one (size is the board).
    const ext = size && L.Recipe ? L.Recipe.summary(size) : {};
    return Object.assign(size ? { w: size.w, h: size.h } : {}, Object.keys(ext).length ? { ext } : {}, {
      startedAt: s.startedAt || 0, life: s.startedAt ? Math.max(0, now - s.startedAt) : 0, playMs: s.playMs || 0,
      pieces: s.pieces || 0, lines: s.lines || 0, score: s.score || 0,
      quads: (s.clears && s.clears[4]) || 0, twists: s.twists || 0, perfect: s.perfect || 0,
      maxCombo: Math.max(0, s.maxCombo || 0), maxB2B: Math.max(0, s.maxB2B || 0), chain: s.bestChain || 0, hchain: s.bestHChain || 0,
      banked: s.banked || 0, combos: Object.values(s.combos || {}).reduce((a, b) => a + b, 0),
      items: Object.assign({}, s.items || {}),
    });
  }

  // ---- Solo or Multiplayer ------------------------------------------------------------------------------------------

  /** The modes played against an opponent: Multiplayer in the menu. */
  const MULTI_MODES = Object.freeze(['race', 'battle']);
  /** Which side a game of this recipe is on: 'multi' (Race, Battle) or 'solo' (everything else). */
  function side(recipe) { return isObj(recipe) && MULTI_MODES.includes(recipe.mode) ? 'multi' : 'solo'; }

  L.Library = { MULTI_MODES, side, STANDARD, LIMITS, scale, worth, bank, validSize, clampSize, sizeLabel, playable, MAX_PRESETS, NAME_MAX, blank, modeOf, migrate, ensure, saved, park, open, replace, taper, summarize, cleanName, uniqueName, findPreset, presetsFull, addPreset, renamePreset, removePreset };
})(typeof globalThis !== 'undefined' ? globalThis : this);
