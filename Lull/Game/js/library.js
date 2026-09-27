// Lull — the board library (Relaxed): the board in play plus shelved ones, each resumed exactly as it was left, and
// the retired ones kept as read-only records. Plain data on the save (state.boards), no DOM: the Boards window lives in
// js/modes.js (PlayMode), and this file is what the tests drive.
//
// state.boards = { seq, cur, list: [record], retired: [entry], taper: { comboId: times paid } }
//   record: { id, name, created, touched, game, earn } — the current board's game is the save's `free` (null here);
//           a shelved one's is its Game.toJSON() (cells, piece, hold, queue, bag, RNG state, every per-board stat).
//           earn is the save's per-board Earn record (js/items.js), parked with the board so a milestone pays once.
//   entry:  { id, name, created, at, reason, sum, w, h, cells } — the board's summary (summarize) and its last stack.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  const MAX_ACTIVE = 12, MAX_RETIRED = 50, NAME_MAX = 24;
  const ADJ = ['Quiet', 'Gentle', 'Mossy', 'Velvet', 'Sleepy', 'Patient', 'Cozy', 'Silent', 'Tidy', 'Lazy', 'Soft', 'Misty', 'Amber', 'Slow', 'Still', 'Mellow', 'Hushed', 'Dusky', 'Linen', 'Paper', 'Willow', 'Pale', 'Drowsy', 'Warm'];
  const NOUN = ['Harbor', 'Orchard', 'Garden', 'Porch', 'Meadow', 'Lantern', 'Pond', 'Attic', 'Cove', 'Hollow', 'Brook', 'Nook', 'Terrace', 'Pantry', 'Grove', 'Window', 'Lagoon', 'Valley', 'Cabin', 'Dune', 'Teacup', 'Alcove', 'Field', 'Tide'];

  function blank() { return { seq: 0, cur: null, list: [], retired: [], taper: {} }; }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  /** A shelved game that can be resumed: a stack, a queue, a bag, a random stream and stats. */
  const playable = (g) => isObj(g) && Array.isArray(g.cells) && Array.isArray(g.queue) && Array.isArray(g.bag) && g.rng != null && isObj(g.s) && num(g.w, 0) > 0 && num(g.h, 0) > 0;

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
      e.w = num(e.w, 10); e.h = num(e.h, 20); e.at = num(e.at, now); e.created = num(e.created, e.at);
      named(e);
    });
    if (B.retired.length > MAX_RETIRED) B.retired.length = MAX_RETIRED;
    if (!isObj(B.taper)) B.taper = {};
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

  /** A board's life in numbers, from its stats (Game.s), as of `now` (what the summary card and the record show). */
  function summarize(s, now) {
    s = s || {};
    return {
      startedAt: s.startedAt || 0, life: s.startedAt ? Math.max(0, now - s.startedAt) : 0, playMs: s.playMs || 0,
      pieces: s.pieces || 0, lines: s.lines || 0, score: s.score || 0,
      quads: (s.clears && s.clears[4]) || 0, tspins: s.tspins || 0, perfect: s.perfect || 0,
      maxCombo: Math.max(0, s.maxCombo || 0), maxB2B: Math.max(0, s.maxB2B || 0), chain: s.bestChain || 0, hchain: s.bestHChain || 0,
      banked: s.banked || 0, combos: Object.values(s.combos || {}).reduce((a, b) => a + b, 0),
      items: Object.assign({}, s.items || {}),
    };
  }

  const CELL_CHARS = '0123456789abcdefghijklmnopqrstuv';
  /** A stack as a short string: one character per cell, its colour slot. */
  function encodeCells(arr) { return Array.from(arr || [], (v) => CELL_CHARS[v & 31]).join(''); }
  function decodeCells(str) { return Array.from(str || '', (c) => Math.max(0, CELL_CHARS.indexOf(c))); }

  /**
   * Retires a board (the one in play or a shelved one): out of the list, onto the front of the retired records, with
   * its summary and last stack. Past MAX_RETIRED the oldest record goes. `game` is its Game.toJSON(). If it was the
   * current board, cur is left empty: the caller starts a new one (newCurrent).
   */
  function retire(st, id, game, now, reason) {
    const B = st.boards, i = B.list.findIndex((r) => r.id === id);
    if (i < 0 || !game) return null;
    const rec = B.list[i];
    B.list.splice(i, 1);
    const entry = { id: rec.id, name: rec.name, created: rec.created, at: now, reason: reason || 'manual', sum: summarize(game.s, now), w: game.w, h: game.h, cells: encodeCells(game.cells) };
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
    // starts over only when no other board is left, as when the one board used to be retired.
    if (!B.list.length) B.taper = {};
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

  L.Library = { MAX_ACTIVE, MAX_RETIRED, NAME_MAX, ADJ, NOUN, blank, ensure, find, findRetired, current, full, cleanName, uniqueName, makeName, add, shelve, take, startNew, open, rename, summarize, encodeCells, decodeCells, retire, remove, removeRetired, newCurrent, taper, ordered };
})(typeof globalThis !== 'undefined' ? globalThis : this);
