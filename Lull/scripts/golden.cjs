#!/usr/bin/env node
// Lull — the golden identity run: a long scripted game on the real engine and the real pay rules, recorded lock by
// lock, so a change that must not change how the game plays (the board recipe's default, a refactor) can be held to
// it byte for byte.
//
//   node Lull/scripts/golden.cjs            # compares with scripts/golden.json; exits 1 on the first difference
//   node Lull/scripts/golden.cjs --write    # records scripts/golden.json afresh
//
// Free Play: 3 seeds (three widths) x 2000 pieces set by a small bot, using every power-up (Tools, Shapers, Choice,
// Board and Luck), hold, Undo, save and resume, and boards that fill up (the engine's findRoom). Each lock records the
// queue, a hash of the cells, the score and the lock's own numbers; each board, its stats, what it banked, the
// lifetime lines (stats.free.lines), the Earn record and every achievement it fired. The pay side is PlayMode.onLock's
// (js/modes.js), step for step. Then a Classic game and a sample of Puzzles replayed through the engine.
// The clock and Math.random are replaced with fixed ones, so every run is the same.
'use strict';
process.env.TZ = 'UTC';
const fs = require('fs');
const path = require('path');

// ---- a fixed clock and a fixed Math.random, before anything loads ----------------------------------------------------
let clock = Date.UTC(2026, 0, 5, 9, 0, 0);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(clock); }
  static now() { return clock; }
};
let mrs = 0x2545f491;
Math.random = () => { mrs ^= mrs << 13; mrs >>>= 0; mrs ^= mrs >>> 17; mrs ^= mrs << 5; mrs >>>= 0; return mrs / 4294967296; };

const load = require('./load.cjs');
const JS = path.join(__dirname, '..', 'Game', 'js');
const files = ['util.js', 'pieces.js', 'board.js', 'recipe.js', 'engine.js', 'items.js', 'library.js', 'puzzlegen.js', 'factory.js', 'store.js', 'achievements.js'].filter((f) => fs.existsSync(path.join(JS, f)));
const L = load(files);
const { Game, Board, Pieces, RNG, Library, Chain, Pay, Combos, Earn, Gifts, Luck, ITEMS, ITEM_ORDER, Puzzles } = L;

// ---- what changed shape with the board recipe, read either way ---------------------------------------------------------
/** What a line on this board is worth, in Standard lines. */
const worth = (g) => (Library.worth ? Library.worth(g) : Library.scale(g.w));
/** Standard-comparable rows (s.own, r.own); before the recipe, the rows cleared. */
const ownOf = (x) => (x.own !== undefined ? x.own : x.lines);
/** What Pay.clear is given: the board's rules, or (before the recipe) its width. */
const payArg = (g) => (g.rules ? g.rules : g.w);
/** Feats count here (a quad on the day log): Standard width or more (R.feats). */
const feats = (g) => (g.rules ? g.rules.feats : g.w >= Library.STANDARD.w);
/** A quad set by a piece (r.quad); before the recipe, 4 own lines. */
const quadOf = (r) => (r.quad !== undefined ? r.quad : r.lines - (r.plain || 0) >= 4);
const recipe = () => (L.Recipe ? { recipe: L.Recipe.DEFAULT } : {});

const hash = (cells) => { let h = 0x811c9dc5; for (let i = 0; i < cells.length; i++) { h ^= cells[i] & 0xffff; h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
/** The lock result's own numbers, as they were before the recipe (new fields are left out). */
const R_KEYS = ['type', 'special', 'tag', 'lines', 'plain', 'tspin', 'mini', 'b2b', 'perfect', 'combo', 'score', 'hand', 'covered', 'netSaved', 'banked', 'mult', 'golden', 'double', 'boost', 'chain'];
const rOf = (r) => R_KEYS.filter((k) => r[k] !== undefined && r[k] !== null && r[k] !== false && r[k] !== 0).map((k) => k + '=' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k])).join(' ');
/** A board's stats as they were before the recipe: own is read either way, cells (new) left out. */
const sOf = (g) => { const s = JSON.parse(JSON.stringify(g.s)); delete s.own; delete s.cells; s.own = ownOf(g.s); return s; };

const ACTS_NOW = new Set(['settle', 'flip', 'trapdoor', 'tornado', 'rewind']);
const SPECIALS = new Set(['patch', 'phase', 'drill', 'bomb', 'laser', 'blackhole']);
const BLUEPRINTS = [[[0, 0], [1, 0], [2, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [3, 0]], [[0, 0], [1, 0], [2, 0]]];

// ---- a small bot ------------------------------------------------------------------------------------------------------------

/**
 * Every turn and column of the piece in play, dropped from the top: the best by lines, holes, height and bumpiness,
 * keeping the right-hand column open for quads; now and then (eps) any one of them, so boards also fill up.
 */
function bot(g, rng, eps) {
  const p = g.piece, b = g.board, W = g.w, H = g.h, cands = [];
  for (let rot = 0; rot < 4; rot++) {
    const cells = p.type.rots[rot], bnd = p.type.rotBounds[rot];
    for (let x = -bnd.minX; x <= W - 1 - bnd.maxX; x++) {
      let y = H - 1 - bnd.maxY;
      if (!b.fits(cells, x, y)) continue;
      while (b.fits(cells, x, y - 1)) y--;
      const t = b.clone();
      t.place(cells, x, y, 1);
      const full = t.fullRows(), lines = full.length;
      t.clearRows(full);
      const c = t.cells;
      let holes = 0, bump = 0, prev = -1, well = 0, top = 0;
      for (let xx = 0; xx < W; xx++) {
        let hh = 0, roof = false;
        for (let yy = H - 1; yy >= 0; yy--) { if (c[yy * W + xx]) { if (!roof) hh = yy + 1; roof = true; } else if (roof) holes++; }
        if (prev >= 0) bump += Math.abs(hh - prev);
        prev = hh; top = Math.max(top, hh);
        if (xx === W - 1) well = hh;
      }
      const reward = lines >= 4 ? -400 : lines ? (top > H / 2 ? -40 * lines : 25) : 0;
      cands.push({ rot, x, cost: reward + holes * 60 + bump * 3 + top * (top > H / 2 ? 12 : 2) + well * 8 });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, c) => a.cost - c.cost || a.rot - c.rot || a.x - c.x);
  return rng.chance(eps) ? cands[rng.int(cands.length)] : cands[0];
}

// ---- Free Play ------------------------------------------------------------------------------------------------------------

function freePlay(seed, w, h, total) {
  clock = Date.UTC(2026, 0, 5 + seed, 9, 0, 0);
  const store = new L.Store(), st = store.state, F = st.stats.free;
  for (const id of ITEM_ORDER) st.inventory[id] = 100000;
  store.addLines(1000, 'play');
  Library.ensure(st, clock, () => 0.5);
  const rng = new RNG('golden:' + seed);
  const out = { seed, w, h, locks: [], boards: [], events: [] };
  let g = null, placed = 0, boardNo = 0, itemAt = 0, resumedAt = -1;

  const earnItem = () => { const id = Gifts.draw(Math.random, 1)[0]; if (id) store.grant(id); };
  const achieve = (event) => {
    const got = L.Achievements.check(st, event);
    for (const a of got) { store.addLines(a.pay, 'achievements'); out.events.push(placed + ':ach:' + a.id); }
  };
  const combo = (id) => {
    const s = g.s, c = Combos.get(id);
    s.combos = s.combos || {};
    const k = Library.taper(st.boards, id, s.combos[id]), rw = Combos.reward(c, k);
    const lines = Library.bank(rw.lines * worth(g));
    s.combos[id] = (s.combos[id] || 0) + 1;
    if (lines) { store.addLines(lines, 'combos'); s.banked = Library.bank((s.banked || 0) + lines); }
    if (rw.boost) s.boost = { x: Math.max(rw.boost.x, s.boost ? s.boost.x : 1), left: Math.max(rw.boost.clears, s.boost ? s.boost.left : 0) };
    s.score += rw.score;
    const book = st.combos = st.combos || {};
    const first = !book[id];
    book[id] = book[id] || { n: 0, lines: 0, first: clock };
    book[id].n++; book[id].lines = Library.bank(book[id].lines + lines);
    out.events.push(placed + ':combo:' + id + ':' + lines);
    if (first) earnItem();
  };
  // PlayMode.onLock, the parts that pay and count.
  const onLock = (r) => {
    const s = g.s;
    s.chain = Chain.count(g); s.bestChain = Math.max(s.bestChain || 0, s.chain);
    s.mult = Pay.mult(g); s.bestMult = Math.max(s.bestMult || 1, s.mult);
    F.bestChain = Math.max(F.bestChain || 0, s.chain); F.bestMult = Math.max(F.bestMult || 1, s.mult);
    r.chain = s.chain;
    g.notePace(r, Date.now());
    const lk = worth(g);
    if (r.lines) {
      const paid = Pay.clear(s, r, payArg(g));
      if (paid.golden) r.golden = true;
      if (paid.boost) r.boost = paid.boost;
      if (paid.double) r.double = paid.double;
      r.banked = paid.pay; r.mult = s.mult;
      s.goldRun = r.golden && r.hand && (s.hchain || 0) >= 20 ? (s.goldRun || 0) + 1 : 0;
      s.banked = Library.bank((s.banked || 0) + paid.pay);
    }
    if (r.special !== 'settle') {
      F.pieces++;
      store.day().pieces++;
      const key = Pieces.TYPES[r.type] && Pieces.TYPES[r.type].family === 'tetromino' ? r.type : (Pieces.get(r.type) || { family: 'other' }).family;
      F.byType[key] = (F.byType[key] || 0) + 1;
    }
    if (r.lines) {
      F.lines = Library.bank(F.lines + ownOf(r) * lk);
      F.clears[Math.min(5, r.lines)]++;
      if (r.banked) store.addLines(r.banked, 'play');
      const due = Earn.lines(st.earn, s.startedAt, ownOf(s) * lk, (ownOf(s) - ownOf(r)) * lk);
      for (let k = 0; k < due; k++) { earnItem(); out.events.push(placed + ':earn'); }
    }
    const found = Combos.detect(r, g);
    if (r.tspin) { F.tspins++; F.tspinLines += r.lines; }
    if (r.perfect) F.perfect++;
    if (quadOf(r) && feats(g)) store.day().quad = 1;
    F.maxCombo = Math.max(F.maxCombo, g.s.maxCombo);
    F.maxB2B = Math.max(F.maxB2B, g.s.maxB2B);
    F.bestScore = Math.max(F.bestScore, g.s.score);
    F.bestLines = Math.max(F.bestLines, Library.bank(ownOf(g.s) * lk));
    found.forEach((id) => combo(id));
    if (r.special !== 'settle') placed++;
    out.locks.push([placed, hash(g.board.cells), g.s.score, g.queue.slice(0, 6).map((e) => e.id).join(','), g.hold ? g.hold.id : '-', rOf(r)].join('|'));
    achieve({ mode: 'play', r, g });
  };
  const attach = (game) => { g = game; g.on('lock', onLock); };
  const fresh = () => {
    boardNo++;
    st.earn = { board: null, paid: 0 };
    attach(new Game(Object.assign({ w, h, seed: seed * 1000 + boardNo, previewCount: 5 }, recipe())));
  };
  const closeBoard = (why) => {
    out.boards.push({ n: boardNo, why, placed, s: sOf(g), banked: g.s.banked || 0, cells: hash(g.board.cells), sum: Library.summarize(g.s, clock, g) });
  };

  // PlayMode.apply: an item used on the board (one held is spent).
  const apply = (id) => {
    const cur = g.piece;
    let ok = false;
    const become = (entry) => g.replacePiece(Object.assign({ tag: id }, entry));
    if (SPECIALS.has(id)) ok = g.setSpecial(id);
    else switch (id) {
      // As PlayMode does: the board's dealer when there is one (it draws the same Math.random as the old list).
      case 'reroll': { if (g.dealer) { ok = become({ id: g.dealer.reroll(g, cur && cur.type.id) }); break; } const opts = Pieces.TETROMINOES.filter((t) => t !== (cur && cur.type.id)); ok = become({ id: opts[Math.floor(Math.random() * opts.length)] }); break; }
      case 'mirror': ok = become({ id: Pieces.mirrorOf(cur.type).id, special: cur.special, tag: cur.entry.tag || null }); break;
      case 'pebble': ok = become({ id: 'M1' }); break;
      case 'noodle': ok = become({ id: Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id }); break;
      case 'giant': { const base = Pieces.TYPES[cur.type.id] && Pieces.TYPES[cur.type.id].family === 'tetromino' ? cur.type.id : null; ok = !!base && become({ id: Pieces.bigOf(base).id, special: cur.special }); break; }
      case 'blueprint': ok = become({ id: Pieces.customType(BLUEPRINTS[rng.int(BLUEPRINTS.length)]).id }); break;
      case 'order': ok = become({ id: Pieces.TETROMINOES[rng.int(7)] }); break;
      case 'pick': ok = g.pickFromQueue(rng.int(3)); break;
      case 'fit': ok = !!g.bestFit(); break;
      case 'settle': ok = !!g.settle(); break;
      case 'tornado': ok = !!g.tornado(); break;
      case 'trapdoor': ok = !!g.trapdoor(); break;
      case 'flip': ok = !!g.flipWorld(); break;
      case 'golden': g.s.gold = (g.s.gold || 0) + Luck.GOLD_CLEARS; ok = true; break;
      case 'double': ok = !g.s.double; if (ok) g.s.double = true; break;
      case 'net': ok = !(g.s.net > 0); if (ok) g.s.net = 1; break;
      case 'rewind': {
        const banked0 = g.s.banked || 0;
        const res = g.undo();
        if (!res) break;
        const refund = Math.min(Math.round(Math.max(0, banked0 - (g.s.banked || 0)) * 100) / 100, Math.max(0, st.lines));
        if (refund) store.addLines(-refund, 'rewind');
        if (res.lines) F.lines = Math.max(0, Library.bank(F.lines - ownOf(res) * worth(g)));
        ok = true;
        break;
      }
      default: break;
    }
    out.events.push(placed + ':item:' + id + ':' + (ok ? 1 : 0));
    if (!ok) return false;
    g.s.items = g.s.items || {};
    g.s.items[id] = (g.s.items[id] || 0) + 1;
    if (ITEMS[id].group !== 'luck') g.noteItem(ACTS_NOW.has(id));
    store.useItem(id);
    return true;
  };

  const choose = () => bot(g, rng, 0.05);
  const playPiece = () => {
    const p = g.piece, c = choose();
    if (c && p.special !== 'drill') {
      const d = (c.rot - p.rot + 4) % 4;
      if (d) g.rotate(d === 3 ? -1 : d);
      for (let i = 0; i < g.w && g.piece === p; i++) {
        // The column of the chosen turn's left edge, for whatever turn the piece is in now (a kick may have moved it).
        const want = c.x + Math.min(...p.type.rots[c.rot].map(([cx]) => cx)) - Math.min(...p.type.rots[p.rot].map(([cx]) => cx));
        if (p.x === want || !g.move(Math.sign(want - p.x))) break;
      }
    }
    if (rng.chance(0.15)) {
      // Lowered by hand, a turn at the bottom now and then (spins), then set with a fresh lower.
      for (let i = 0; i < g.h && g.piece === p; i++) if (g.lower() !== 'moved') return;
      if (g.piece === p && rng.chance(0.5)) g.rotate(rng.chance(0.5) ? 1 : -1);
      if (g.piece === p) g.lower();
      if (g.piece === p) g.drop();
      return;
    }
    g.drop();
  };

  fresh();
  let guard = 0;
  while (placed < total && guard++ < total * 10) {
    clock += 1100 + rng.int(900);
    if (g.over) {
      out.events.push(placed + ':full:' + boardNo);
      // Board full: Undo half the time (as the card offers), else retire it and start a new one.
      if (g.history.length && rng.chance(0.5) && apply('rewind')) continue;
      closeBoard('full');
      fresh();
      continue;
    }
    if (placed && placed % 250 === 0 && resumedAt !== placed) {
      // Saved and resumed (a reload, or a board shelved and taken back): exactly as it was, history aside.
      resumedAt = placed;
      attach(new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())), previewCount: 5 }));
      out.events.push(placed + ':resume:' + hash(g.board.cells));
    }
    if (rng.chance(0.07)) { g.holdPiece(); continue; }
    // Power-ups once a board has 30 pieces on it (so each board starts by hand: the skill achievements).
    if (g.s.pieces >= 30 && rng.chance(0.2)) {
      const id = ITEM_ORDER[itemAt++ % ITEM_ORDER.length];
      apply(id);
      if (g.over || !g.piece) continue;
    }
    if (g.piece) playPiece();
  }
  closeBoard('end');
  out.end = { placed, boards: boardNo, F: JSON.parse(JSON.stringify(F)), earn: st.earn, wallet: st.lines, lines: st.stats.lines, used: st.stats.items.used, achievements: Object.keys(st.achievements).sort(), combos: st.combos, taper: st.boards.taper };
  return out;
}

// ---- Classic ---------------------------------------------------------------------------------------------------------------

function classic(seed) {
  // As ClassicMode makes it (ceiling: Classic's top out and spawn flush with the ceiling).
  const g = new Game({ w: 10, h: 20, previewCount: 3, maxHistory: 0, freeHold: false, ceiling: true, seed });
  const rng = new RNG('golden:classic:' + seed), locks = [];
  g.on('lock', (r) => locks.push([hash(g.board.cells), g.s.score, g.queue.slice(0, 3).map((e) => e.id).join(','), rOf(r)].join('|')));
  for (let i = 0; i < 1500 && !g.over && g.piece; i++) {
    if (rng.chance(0.1)) g.holdPiece();
    if (g.over || !g.piece) break;
    const p = g.piece, c = bot(g, rng, 0.08);
    if (c) {
      const d = (c.rot - p.rot + 4) % 4;
      if (d) g.rotate(d === 3 ? -1 : d);
      for (let k = 0; k < g.w && p.x !== c.x; k++) if (!g.move(Math.sign(c.x - p.x))) break;
    }
    if (g.piece === p) g.drop();
  }
  return { seed, over: g.over, s: sOf(g), locks };
}

// ---- Puzzles ---------------------------------------------------------------------------------------------------------------

function puzzle(seedStr) {
  const p = Puzzles.generate(seedStr);
  const g = new Game({ board: Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap }), queue: p.pieces, mods: { noRotate: p.mods.includes('rigid'), heavy: p.mods.includes('heavy'), noHold: !p.mods.includes('hold') } });
  const locks = [];
  let lines = 0;
  g.on('lock', (r) => { lines += r.lines; locks.push([hash(g.board.cells), g.s.score, rOf(r)].join('|')); });
  p.targets.forEach((t, i) => {
    const want = (pc) => pc && pc.type.id === t.id && (pc.entry.rot || 0) === (p.solution[i].rot || 0);
    if (!want(g.piece)) g.holdPiece();
    if (!want(g.piece)) g.holdPiece();
    let res = null;
    for (const m of t.path) {
      if (m === 'L') g.move(-1); else if (m === 'R') g.move(1); else if (m === 'D') g.lower(); else if (m === 'CW') g.rotate(1); else if (m === 'CCW') g.rotate(-1); else if (m === '180') g.rotate(2); else res = g.drop();
    }
    if (!res && g.piece) g.lower();
  });
  const met = Puzzles.goalMet(p, g.board, lines);
  // One Undo (Puzzles' Undo): the last piece back in play.
  const back = g.undo();
  return { seed: p.seed, mods: p.mods, goal: p.goal.type, cells: hash(p.cells), pieces: p.pieces.map((e) => e.id).join(','), locks, met, undo: back && back.lines, after: hash(g.board.cells), piece: g.piece && g.piece.type.id };
}

// ---- the run -----------------------------------------------------------------------------------------------------------------

function run() {
  const t0 = RealDate.now();
  const result = {
    free: [freePlay(1, 10, 20, 2000), freePlay(2, 7, 16, 2000), freePlay(3, 14, 22, 2000)],
    classic: [classic(11), classic(12)],
    puzzles: [],
  };
  for (const d of ['E', 'M', 'H']) for (let n = 1; n <= 3; n++) result.puzzles.push(puzzle(Puzzles.numberedSeed(d, n)));
  result.puzzles.push(puzzle(Puzzles.numberedSeed('M', 2, true)));
  return { result, ms: RealDate.now() - t0 };
}

/** The first place two records part, as a path and the two values. */
function firstDiff(a, b, at) {
  at = at || '';
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return { at, want: a, got: b };
  if (Array.isArray(a) !== Array.isArray(b)) return { at, want: a, got: b };
  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], at + '.' + k);
    if (d) return d;
  }
  return null;
}

if (require.main === module) {
  const file = path.join(__dirname, 'golden.json');
  const { result, ms } = run();
  const json = JSON.stringify(result);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(file, json + '\n');
    const f = result.free.map((r) => r.w + 'x' + r.h + ': ' + r.end.placed + ' pieces, ' + r.end.boards + ' boards, ' + r.events.filter((e) => e.includes(':ach:')).length + ' achievements');
    console.log('golden: recorded ' + (json.length / 1024).toFixed(0) + ' KB in ' + ms + ' ms · ' + f.join(' · '));
  } else {
    const want = JSON.parse(fs.readFileSync(file, 'utf8'));
    const d = firstDiff(want, JSON.parse(json));
    if (d) { console.log('golden: DIFFERS at ' + d.at + '\n  want ' + JSON.stringify(d.want) + '\n  got  ' + JSON.stringify(d.got)); process.exit(1); }
    console.log('golden: identical (' + ms + ' ms)');
  }
}
module.exports = { run, firstDiff };
