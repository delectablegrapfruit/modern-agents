// Lull — the board library (Relaxed): the board in play plus shelved ones, each resumed exactly as it was left, and
// the retired ones kept as read-only records. Plain data on the save (state.boards), no DOM: the Boards window lives in
// js/modes.js (PlayMode), and this file is what the tests drive.
//
// state.boards = { seq, cur, list: [record], retired: [entry], taper: { comboId: times paid }, size: { w, h }, recipe }
//   size, recipe: the size and board recipe (js/recipe.js) last chosen in the New board window (Standard, 10 x 20, and
//   the default recipe until one is chosen).
//   record: { id, name, created, touched, game, earn } — the current board's game is the save's `free` (null here);
//           a shelved one's is its Game.toJSON() (cells, piece, hold, queue, bag, RNG state, every per-board stat).
//           earn is the save's per-board Earn record (js/items.js), parked with the board so a milestone pays once.
//   entry:  { id, name, created, at, reason, sum, w, h, cells, piece, hold, next, recipe } — the board's summary
//           (summarize), its last stack, the pieces it ended with: the one in play ({ entry, rot, x, y }: on a full
//           board the piece that could not come in), the held one and the first few of the queue (entries,
//           { id, rot, special }), and its recipe, thinned (Recipe.thin). Only shown (the full view,
//           js/retiredview.js), never played.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const MAX_ACTIVE = 12, MAX_RETIRED = 50, NAME_MAX = 24;
  // A retired record keeps this many of the queue: as many as Next can show (Settings ▸ Board, 1 to 6).
  const NEXT_KEPT = 6;
  const ADJ = ['Quiet', 'Gentle', 'Mossy', 'Velvet', 'Sleepy', 'Patient', 'Cozy', 'Silent', 'Tidy', 'Lazy', 'Soft', 'Misty', 'Amber', 'Slow', 'Still', 'Mellow', 'Hushed', 'Dusky', 'Linen', 'Paper', 'Willow', 'Pale', 'Drowsy', 'Warm'];
  const NOUN = ['Harbor', 'Orchard', 'Garden', 'Porch', 'Meadow', 'Lantern', 'Pond', 'Attic', 'Cove', 'Hollow', 'Brook', 'Nook', 'Terrace', 'Pantry', 'Grove', 'Window', 'Lagoon', 'Valley', 'Cabin', 'Dune', 'Teacup', 'Alcove', 'Field', 'Tide'];

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
  function blank() { return { seq: 0, cur: null, list: [], retired: [], taper: {}, size: { w: STANDARD.w, h: STANDARD.h }, recipe: defaultRecipe() }; }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const idOk = (e) => isObj(e) && !!L.Pieces && !!L.Pieces.get(e.id);
  /** A turn a piece can have: 0 to 3 (none: its first). */
  const rotOk = (r) => r == null || (Number.isInteger(r) && r >= 0 && r < 4);
  /** A piece as the queue and hold keep it: { id, rot, special } (an id and a turn it can have; what it names is the view's to check). */
  const pieceEntry = (x) => isObj(x) && typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 40 && rotOk(x.rot);
  /**
   * A saved game that can be resumed: a size in range with a stack to match, a queue, a bag, a random stream, stats;
   * and a board recipe every part accepts (Recipe.valid), a height its recipe allows, and every piece in the queue, in
   * hold and in play one the pieces know (Pieces.get).
   */
  const playable = (g) => isObj(g) && validSize(g.w, g.h) && Array.isArray(g.cells) && g.cells.length === g.w * g.h && Array.isArray(g.queue) && Array.isArray(g.bag) && g.rng != null && isObj(g.s)
    && (!L.Recipe || (L.Recipe.valid(g) && L.Recipe.sizeOk(g.w, g.h, g.recipe)))
    && g.queue.every(idOk) && (g.hold == null || idOk(g.hold)) && (g.piece == null || (isObj(g.piece) && idOk(g.piece.entry)));

  /**
   * The save's library, made whole and safe to show: only records with an id (each id once), a shelved board only if
   * it can be resumed, a name on every one, a summary and a stack on every retired one, seq past every id; and a record
   * for the board in play if it has none yet.
   */
  function ensure(st, now, rnd) {
    // Made whole in place: whoever holds the library object still holds the library.
    const B = st.boards = isObj(st.boards) ? st.boards : blank();
    for (const [k, v] of Object.entries(blank())) if (!(k in B)) B[k] = v;
    const seen = new Set();
    const keep = (r) => isObj(r) && typeof r.id === 'string' && r.id && !seen.has(r.id) && (seen.add(r.id), true);
    const named = (r) => { const n = cleanName(r.name); r.name = n || makeName(B, rnd); };
    const only = (k, ok) => { const a = Array.isArray(B[k]) ? B[k] : (B[k] = []), kept = a.filter(ok); if (kept.length !== a.length) a.splice(0, a.length, ...kept); };
    only('list', (r) => keep(r) && (r.id === B.cur || playable(r.game)));
    only('retired', keep);
    B.list.forEach((r) => { r.created = num(r.created, now); r.touched = num(r.touched, r.created); if (r.id === B.cur) r.game = null; named(r); });
    B.retired.forEach((e) => {
      e.sum = Object.assign(summarize({}, 0), isObj(e.sum) ? e.sum : {});
      e.cells = typeof e.cells === 'string' ? e.cells : '';
      // A retired board's recipe is a thin copy, kept as it is (only ever shown); anything else is the default.
      if (L.Recipe && !isObj(e.recipe)) e.recipe = L.Recipe.thin(null);
      const sz = clampSize(e);
      // A stack that does not match its size is not drawn (the record keeps its numbers).
      if (sz.w !== e.w || sz.h !== e.h || e.cells.length !== sz.w * sz.h) e.cells = '';
      e.w = sz.w; e.h = sz.h; e.sum.w = e.w; e.sum.h = e.h; e.at = num(e.at, now); e.created = num(e.created, e.at);
      const p = e.piece, near = (v, n) => Number.isInteger(v) && v >= -8 && v <= n + 8;
      e.piece = isObj(p) && pieceEntry(p.entry) && Number.isInteger(p.rot) && rotOk(p.rot) && near(p.x, e.w) && near(p.y, e.h) ? p : null;
      e.hold = pieceEntry(e.hold) ? e.hold : null;
      e.next = Array.isArray(e.next) ? e.next.filter(pieceEntry).slice(0, NEXT_KEPT) : [];
      named(e);
    });
    if (B.retired.length > MAX_RETIRED) B.retired.length = MAX_RETIRED;
    if (!isObj(B.taper)) B.taper = {};
    B.recipe = L.Recipe ? L.Recipe.normalize(B.recipe) : null;
    B.size = clampSize(B.size, L.Recipe ? B.recipe : undefined);
    B.seq = Math.max(num(B.seq, 0), ...B.list.concat(B.retired).map((r) => (/^b(\d+)$/.test(r.id) ? +r.id.slice(1) : 0)));
    if (typeof B.cur !== 'string' || !find(B, B.cur)) {
      const started = st.free && st.free.s && st.free.s.startedAt;
      const rec = add(B, started || now, rnd);
      B.cur = rec.id;
    }
    return B;
  }

  function find(B, id) { return B.list.find((r) => r.id === id) || null; }
  function findRetired(B, id) { return B.retired.find((r) => r.id === id) || null; }
  function current(B) { return find(B, B.cur); }
  const full = (B) => B.list.length >= MAX_ACTIVE;

  /**
   * A name as typed, cleaned: spaces collapsed, controls and invisible format characters (zero-width, bidi) dropped, at
   * most NAME_MAX characters; null when nothing visible is left.
   */
  function cleanName(raw) {
    const s = String(raw == null ? '' : raw).replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, '').replace(/ {2,}/g, ' ').trim();
    if (!/[\p{L}\p{N}\p{S}\p{P}]/u.test(s)) return null;
    return Array.from(s).slice(0, NAME_MAX).join('').trim();
  }

  /** `name`, or with " 2", " 3" … if another board (active or retired, other than `self`) already has it. */
  function uniqueName(B, name, self) {
    const taken = new Set(B.list.concat(B.retired).filter((r) => r !== self).map((r) => String(r.name).toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let k = 2; ; k++) {
      const tail = ' ' + k, n = Array.from(name).slice(0, NAME_MAX - tail.length).join('').trim() + tail;
      if (!taken.has(n.toLowerCase())) return n;
    }
  }

  /** A calm two-word name no board in the library has (active or retired); "Board N" if every pair is taken. */
  function makeName(B, rnd) {
    rnd = rnd || Math.random;
    const taken = new Set(B.list.concat(B.retired).map((r) => r.name));
    for (let i = 0; i < 40; i++) {
      const n = ADJ[Math.floor(rnd() * ADJ.length)] + ' ' + NOUN[Math.floor(rnd() * NOUN.length)];
      if (!taken.has(n)) return n;
    }
    let k = B.seq;
    while (taken.has('Board ' + k)) k++;
    return 'Board ' + k;
  }

  /** A new record (not yet the current one). */
  function add(B, now, rnd) {
    B.seq = (B.seq || 0) + 1;
    const rec = { id: 'b' + B.seq, name: null, created: now, touched: now, game: null, earn: null };
    rec.name = makeName(B, rnd);
    B.list.push(rec);
    return rec;
  }

  /** Parks the board in play in its record: its game as it stands, its Earn record, the time. */
  function shelve(st, curJSON, now) {
    const B = st.boards, rec = current(B);
    if (!rec) return null;
    rec.game = curJSON;
    rec.earn = Object.assign({ board: null, paid: 0 }, st.earn || {});
    rec.touched = now;
    return rec;
  }

  /** A record becomes the board in play: its game moves to the save's `free`, its Earn record to the save's. */
  function take(st, rec, now) {
    const B = st.boards, g = rec.game;
    B.cur = rec.id;
    rec.game = null;
    rec.touched = now;
    st.earn = Object.assign({ board: null, paid: 0 }, rec.earn || {});
    rec.earn = null;
    st.free = g;
    return g;
  }

  /**
   * Shelves the board in play and makes a new, empty one current. Returns the new record, or null when the library is
   * full (the caller says so; nothing changes). The caller starts a fresh game for it (its own seed).
   */
  function startNew(st, curJSON, now, rnd) {
    const B = st.boards;
    if (full(B)) return null;
    shelve(st, curJSON, now);
    const rec = add(B, now, rnd);
    B.cur = rec.id;
    st.earn = { board: null, paid: 0 };
    st.free = null;
    return rec;
  }

  /** Switches to a shelved board: the one in play is shelved as it stands. Returns the game to resume, or null. */
  function open(st, id, curJSON, now) {
    const B = st.boards, rec = find(B, id);
    if (!rec || id === B.cur || !rec.game) return null;
    shelve(st, curJSON, now);
    return take(st, rec, now);
  }

  function rename(B, id, raw) {
    const rec = find(B, id) || findRetired(B, id), name = cleanName(raw);
    if (!rec || !name) return null;
    rec.name = uniqueName(B, name, rec);
    return rec.name;
  }

  /**
   * A board's life in numbers, from its stats (Game.s), as of `now` (what the summary card and the record show); with
   * its size when given. Lines are the board's own (raw); banked is what it paid, in Standard lines.
   */
  function summarize(s, now, size) {
    s = s || {};
    // A board's recipe can add its own numbers (Protect's waves, Battle's rounds): Recipe.summary, from a Game or a
    // saved one (size is the board).
    const ext = size && L.Recipe ? L.Recipe.summary(size) : {};
    return Object.assign(size ? { w: size.w, h: size.h } : {}, Object.keys(ext).length ? { ext } : {}, {
      startedAt: s.startedAt || 0, life: s.startedAt ? Math.max(0, now - s.startedAt) : 0, playMs: s.playMs || 0,
      pieces: s.pieces || 0, lines: s.lines || 0, score: s.score || 0,
      quads: (s.clears && s.clears[4]) || 0, tspins: s.tspins || 0, perfect: s.perfect || 0,
      maxCombo: Math.max(0, s.maxCombo || 0), maxB2B: Math.max(0, s.maxB2B || 0), chain: s.bestChain || 0, hchain: s.bestHChain || 0,
      banked: s.banked || 0, combos: Object.values(s.combos || {}).reduce((a, b) => a + b, 0),
      items: Object.assign({}, s.items || {}),
    });
  }

  const CELL_CHARS = '0123456789abcdefghijklmnopqrstuv';
  /** A stack as a short string: one character per cell, its colour slot. */
  function encodeCells(arr) { return Array.from(arr || [], (v) => CELL_CHARS[v & L.CELL.COLOR]).join(''); }
  function decodeCells(str) { return Array.from(str || '', (c) => Math.max(0, CELL_CHARS.indexOf(c))); }

  /**
   * Retires a board (the one in play or a shelved one): out of the list, onto the front of the retired records, with
   * its summary, last stack and the pieces it ended with (in play, held, next). Past MAX_RETIRED the oldest record goes. `game` is its Game.toJSON(). If it was the
   * current board, cur is left empty: the caller starts a new one (newCurrent).
   */
  function retire(st, id, game, now, reason) {
    const B = st.boards, i = B.list.findIndex((r) => r.id === id);
    if (i < 0 || !game) return null;
    const rec = B.list[i];
    B.list.splice(i, 1);
    const copy = (x) => (pieceEntry(x) ? JSON.parse(JSON.stringify(x)) : null), p = game.piece;
    const entry = {
      id: rec.id, name: rec.name, created: rec.created, at: now, reason: reason || 'manual', sum: summarize(game.s, now, game), w: game.w, h: game.h, cells: encodeCells(game.cells),
      piece: p && copy(p.entry) ? { entry: copy(p.entry), rot: p.rot, x: p.x, y: p.y } : null,
      hold: copy(game.hold), next: (Array.isArray(game.queue) ? game.queue : []).filter(pieceEntry).slice(0, NEXT_KEPT).map(copy),
    };
    if (L.Recipe) entry.recipe = L.Recipe.thin(game.recipe);
    B.retired.unshift(entry);
    if (B.retired.length > MAX_RETIRED) B.retired.length = MAX_RETIRED;
    if (B.cur === id) B.cur = null;
    return entry;
  }

  /** Deletes a board for good (no record kept). The current one leaves cur empty, as retire does. */
  function remove(st, id) {
    const B = st.boards, i = B.list.findIndex((r) => r.id === id);
    if (i < 0) return false;
    B.list.splice(i, 1);
    if (B.cur === id) B.cur = null;
    return true;
  }

  function removeRetired(B, id) {
    const i = B.retired.findIndex((r) => r.id === id);
    if (i < 0) return false;
    B.retired.splice(i, 1);
    return true;
  }

  /** After the current board was retired or deleted: a new empty record in play (the caller starts its game). */
  function newCurrent(st, now, rnd) {
    const B = st.boards;
    // The combos' shrinking pay is the library's, not one board's (or a new board would be a fresh one for free): it
    // never starts over, whatever is retired or deleted.
    const rec = add(B, now, rnd);
    B.cur = rec.id;
    st.earn = { board: null, paid: 0 };
    st.free = null;
    return rec;
  }

  /** The (k)th time a combo comes round in the library (0 first), counted: what its pay is cut by (Combos.reward). */
  function taper(B, id, own) {
    B.taper = isObj(B.taper) ? B.taper : {};
    const k = Math.max(B.taper[id] || 0, own || 0);
    B.taper[id] = k + 1;
    return k;
  }

  /** The list as shown: the board in play first, then the rest, most recently played first. */
  function ordered(B) {
    const cur = current(B);
    return (cur ? [cur] : []).concat(B.list.filter((r) => r !== cur).sort((a, b) => (b.touched || 0) - (a.touched || 0)));
  }

  /**
   * A saved board (Game.toJSON) at another size, for an edit of its rules: columns are added or taken away on the
   * right, rows at the top, and nothing that is there may be cut. { json } (a copy), or { why } in plain words.
   */
  function reshape(json, w, h) {
    if (!json || !Array.isArray(json.cells)) return { why: 'This board cannot be changed' };
    if (!validSize(w, h)) return { why: 'No board is ' + sizeLabel(w, h) };
    const W = json.w, H = json.h, C = L.CELL;
    let cols = false, rows = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (json.cells[y * W + x] && (x >= w || y >= h)) { if (x >= w) cols = true; if (y >= h) rows = true; }
    if (cols) return { why: 'Blocks stand in the columns it would lose' };
    if (rows) return { why: 'Blocks stand in the rows it would lose' };
    const cells = new Array(w * h).fill(0);
    for (let y = 0; y < Math.min(h, H); y++) for (let x = 0; x < Math.min(w, W); x++) {
      let v = json.cells[y * W + x];
      // A join across an edge that is now a wall is let go.
      if (v && C && x === w - 1 && w < W) v &= ~C.JOIN_R;
      if (v && C && y === h - 1 && h < H) v &= ~C.JOIN_U;
      cells[y * w + x] = v;
    }
    return { json: Object.assign(JSON.parse(JSON.stringify(json)), { w, h, cells }) };
  }

  /**
   * A saved board with its rules edited (the New board window's Edit rules): the recipe `recipe` at `size`. The stack
   * stays as it is (reshape: nothing cut), the piece in play goes back to the front of the queue and appears again
   * as the new rules place it, and every part's own state carries over (the mode's it left is dropped); the Undo
   * history does not (a new game has none). A board that ended keeps its rules. { json, game } or { why }.
   */
  function rebuild(json, recipe, size) {
    const R = L.Recipe;
    if (!isObj(json) || !R || !L.Game) return { why: 'This board cannot be changed' };
    if (json.over || json.ended) return { why: 'A board that ended keeps its rules' };
    let j = JSON.parse(JSON.stringify(json));
    if (size && (size.w !== j.w || size.h !== j.h)) { const r = reshape(j, size.w, size.h); if (r.why) return r; j = r.json; }
    const from = R.normalize(j.recipe), to = R.normalize(recipe);
    if (!R.sizeOk(j.w, j.h, to)) { const lim = R.limits(to); return { why: 'Smallest here is ' + sizeLabel(lim.w[0], lim.h[0]) }; }
    // What the board keeps for life (Recipe.editConflicts: Protect) is refused here too, whatever the window allowed.
    const fixed = R.editConflicts(from, to);
    for (const [id, why] of Object.entries(fixed)) {
      const at = id.indexOf('='), path = id.slice(0, at), v = R.getPath(to, path);
      if (v !== undefined && (typeof v === 'string' ? v : JSON.stringify(v)) === id.slice(at + 1)) return { why };
    }
    j.recipe = to;
    if (isObj(j.x) && from.mode !== to.mode) delete j.x[from.mode];
    // Another dealer (other shapes, another randomizer) starts its own bag; the queue already dealt stays.
    const deal = (r) => R.canon([r.shapes, r.classic ? r.classic.rand : null]);
    if (deal(from) !== deal(to)) j.bag = [];
    if (j.piece && isObj(j.piece.entry)) j.queue.unshift(Object.assign({}, j.piece.entry));
    j.piece = null;
    j.holdLocked = false;
    delete j.over;
    let g = null;
    try { g = new L.Game({ saved: j }); } catch (e) { g = null; }
    if (!g) return { why: 'These rules do not fit this board as it stands' };
    if (g.over || !g.piece) return { why: 'No room for the piece in play' };
    const out = g.toJSON();
    if (!playable(out)) return { why: 'These rules do not fit this board as it stands' };
    return { json: out, game: g };
  }

  L.Library = { STANDARD, LIMITS, scale, worth, bank, validSize, clampSize, sizeLabel, playable, MAX_ACTIVE, MAX_RETIRED, NAME_MAX, NEXT_KEPT, ADJ, NOUN, blank, ensure, find, findRetired, current, full, cleanName, uniqueName, makeName, add, shelve, take, startNew, open, rename, summarize, encodeCells, decodeCells, retire, remove, removeRetired, newCurrent, taper, ordered, reshape, rebuild };
})(typeof globalThis !== 'undefined' ? globalThis : this);
