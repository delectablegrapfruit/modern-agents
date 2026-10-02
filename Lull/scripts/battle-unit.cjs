// Battle's rules in Node (js/battle.js): the recipe and its sizes, the buffer (a lock wholly in it refused, the rest
// trimmed, no clears), the cover (an overhang open, a lid sealed, regions lowest first, against the engine's own reach),
// Send (both sources, its order, the cooldown, received pieces neither held nor sent on), Gap fillers (earned, capped,
// fired both ways, never paid), resets and the win, pay (only the final board, a loss half, never more a piece than
// Standard), the save, the AI (deterministic, every path valid move by move), cover's speed, and the ladder.
// Run by test.cjs: require('./battle-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');
const { performance } = require('perf_hooks');

module.exports = function battleUnit({ L, test }) {
  const { Game, Pieces, Recipe, Battle: B, CELL, Library } = L;
  const R0 = (o) => Recipe.normalize(Object.assign({ mode: 'battle', battle: { level: 'steady' } }, o || {}));
  const mk = (w, rows, seed, o) => new Game(Object.assign({ w: w || 10, h: rows || 10, seed: seed == null ? 1 : seed, recipe: R0(), battleAI: true, previewCount: 5 }, o || {}));
  /** A board from rows of text, bottom row first: '#' a block, '.' empty. */
  const paint = (g, rows) => { g.board.cells.fill(0); rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.board.set(x, y, 8); }); };
  /** The piece in play becomes `id`, turned rot, its box at column x, at the top. */
  const put = (g, id, x, rot, y) => {
    const type = Pieces.get(id);
    g.piece = { type, rot: rot || 0, x, y: y != null ? y : g.h - 1 - type.rotBounds[rot || 0].maxY, special: null, entry: { id, rot: 0 }, lastRot: false };
    return g.piece;
  };
  /** An O in play over column x (its left cell), at the top, with entry fields e. */
  const O = (g, x, e) => { const type = Pieces.get('O'); g.piece = { type, rot: 0, x: x - type.rotBounds[0].minX, y: g.h - 1 - type.rotBounds[0].maxY, special: null, entry: Object.assign({ id: 'O', rot: 0 }, e), lastRot: false }; return g.piece; };
  const sd = (g, lv) => { const s = B.side(g); s.lvl = B.LEVELS[lv || 'steady']; s.rng = new L.RNG(9); return s; };

  test('battle: the recipe (a mode, levels Easy to Swift, Steady by default), its label, sizes 6–12 by rows 6–12, rules (k, no Undo, items, hints)', () => {
    assert(Recipe.options().find((o) => o.path === 'mode').values.includes('battle'));
    assert.deepStrictEqual(Recipe.normalize({ mode: 'battle' }).battle, { level: 'steady' });
    assert.deepStrictEqual(Recipe.normalize({ mode: 'battle', battle: { level: 'x' } }).battle, { level: 'steady' });
    assert.strictEqual(Recipe.normalize({ battle: { level: 'swift' } }).battle, undefined, 'its settings only in Battle');
    assert.strictEqual(Recipe.label(R0({ battle: { level: 'swift' } })), 'Battle · Swift');
    assert.strictEqual(Recipe.label(R0(), true), 'Battle');
    assert.deepStrictEqual(Recipe.limits(R0()), { w: [6, 12], h: [6, 12] });
    assert.deepStrictEqual(Recipe.clampSize({}, R0()), { w: 10, h: 10 }, 'a size not given is 10 × 10');
    assert.deepStrictEqual(Recipe.clampSize({ w: 20, h: 40 }, R0()), { w: 12, h: 12 });
    const R = Recipe.rules(R0(), 10);
    assert(R.k === 4 && !R.undo && !R.hints && R.timed && R.battle, JSON.stringify(R));
    for (const id of Object.keys(L.ITEMS)) assert.strictEqual(R.refuse[id], 'Not in Battle', id);
    assert.strictEqual(Recipe.rules(R0({ shapes: { preset: 'tiny' } }), 10).k, 3);
    assert.strictEqual(Recipe.rules(R0({ shapes: { preset: 'frantic' } }), 10).k, 5);
    assert.strictEqual(Recipe.rules(R0({ shapes: { preset: 'pentominoes' } }), 10).k, 5);
    // Mirror, Physics, Big and Custom with large groups are not in Battle; the last choice wins.
    const c = Recipe.conflicts(R0());
    assert.strictEqual(c['mods.mirror=true'], 'Not in Battle');
    assert.strictEqual(c['mods.physics=true'], 'Not in Battle');
    assert.strictEqual(c['shapes.preset=big'], 'Not in Battle');
    const res = Recipe.resolve({ mode: 'battle', mods: { physics: true, mirror: false } }, 'mode', {});
    assert.strictEqual(res.recipe.mods.physics, false, 'choosing Battle turns Physics off');
    assert.strictEqual(B.PART.noEdit(R0()), 'A Battle board keeps its rules');
  });

  test('battle: the board is rows + k tall; a lock wholly in the buffer is refused, what is left there trimmed; no row ever clears', () => {
    const g = mk(10, 10);
    assert.strictEqual(g.h, 14);
    assert.strictEqual(B.goal(g), 10);
    // A row about to be full: no clear.
    paint(g, ['######.###']);
    put(g, 'I', 6 - Pieces.get('I').rotBounds[1].minX, 1);
    const r1 = g.drop();
    assert(r1 && r1.lines === 0 && g.board.get(6, 0) === Pieces.get('I').color, 'the row stays full');
    // Set in the buffer alone: refused, the piece stays.
    const notes = [];
    g.on('refused', (n) => notes.push(n));
    paint(g, ['#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10), '#'.repeat(10)]);
    put(g, 'O', 3, 0);
    assert.strictEqual(g.drop(), false);
    assert.deepStrictEqual(notes, ['Set it on your board']);
    assert(g.piece, 'still in play');
    // Overflow: a vertical I on a stack 8 high sets with 2 cells in the goal; the 2 in the buffer go.
    paint(g, ['##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########']);
    put(g, 'I', 3, 1);
    const r = g.drop();
    assert(r && r.trimmed && r.trimmed.length === 2, JSON.stringify(r && r.trimmed));
    for (let y = 10; y < 14; y++) for (let x = 0; x < 10; x++) assert.strictEqual(g.board.get(x, y), 0, 'the buffer is empty');
  });

  test('battle: cover: an overhang is open, a lid is sealed, regions come lowest first; the flood fill agrees on these', () => {
    const g = mk(6, 6);
    // A shelf over an open pocket (reachable sideways): open. A 2 × 1 hole under a lid: sealed. A 1 × 1 in a corner under a lid.
    paint(g, ['.#.##.', '.#####', '###...', '......']);
    const s = B.sealedOf(g);
    const sealed = new Set([].concat(...s.regions).map(([x, y]) => x + ',' + y));
    // (0,0) and (0,1) are under (0,2): sealed; (2,0) under (2,1); (5,0) under (5,1).
    assert.deepStrictEqual([...sealed].sort(), ['0,0', '0,1', '2,0', '5,0'].sort(), JSON.stringify(s.regions));
    assert.deepStrictEqual(s.regions[0].map(([x, y]) => x + ',' + y).sort(), ['0,0', '0,1'], 'lowest (then leftmost) first');
    // Under a shelf two rows high, open at the side: an O slides in under it.
    paint(g, ['######', '##....', '##....', '####..']);
    assert.strictEqual(B.sealedOf(g).n, 0, 'an overhang reached from the side is open');
    // A slot one row high under a shelf: no tetromino gets a cell into its far end; the flood fill says open.
    paint(g, ['######', '#.....', '####..']);
    assert.strictEqual(B.analyse(g.board.cells, g.w, g.h, B.goal(g)).sealed, 0);
    assert(B.sealedOf(g).n > 0, 'the cover judges by shape');
    // An L-shaped pocket whose foot is under a block: no tetromino's cell gets into the foot.
    paint(g, ['######', '####..', '#####.']);
    assert.strictEqual(B.sealedOf(g).n, 1);
    // A lid over one hole.
    paint(g, ['#.####', '##....']);
    assert.strictEqual(B.sealedOf(g).n, 1, JSON.stringify(B.sealedOf(g).regions));
  });

  test('battle: reach (bit rows) is the engine\'s own reach, every turn of every set, on random boards; cover is what those reach', () => {
    const rng = new L.RNG(42);
    for (const preset of ['normal', 'tiny', 'frantic', 'pentominoes']) {
      const g = new Game({ w: 9, h: 9, seed: 3, recipe: R0({ shapes: { preset } }), battleAI: true });
      const types = B.typesOf(g);
      for (let n = 0; n < 12; n++) {
        const fill = rng.next() * 0.7;
        g.board.cells.fill(0);
        for (let y = 0; y < B.goal(g); y++) for (let x = 0; x < g.w; x++) if (rng.next() < fill * (1 - y / 10)) g.board.set(x, y, 8);
        const rows = B.rowsOf(g.board.cells, g.w, g.h), cov = new Set();
        for (const t of types) {
          const sh = B.shapeOf(t);
          for (let r = 0; r < 4; r++) {
            const F = B.fitMap(rows, g.w, g.h, sh[r], new Int32Array(g.h)), Rm = B.reachMap(F, g.h, sh[r], new Int32Array(g.h));
            const mine = new Set();
            for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) if ((Rm[py] >>> px) & 1) mine.add((px - sh[r].minX) + ',' + (py - sh[r].minY));
            const eng = new Set(g.reach({ type: t, special: null }, r, [], null).map(([x, y]) => x + ',' + y));
            assert.deepStrictEqual([...mine].sort(), [...eng].sort(), preset + ' ' + t.id + ' turn ' + r);
            for (const xy of eng) { const [x, y] = xy.split(',').map(Number); for (const [cx, cy] of t.rots[r]) if (y + cy < B.goal(g)) cov.add((x + cx) + ',' + (y + cy)); }
          }
        }
        const c = B.cover(rows, g.w, g.h, B.goal(g), types);
        let sealed = 0;
        for (let y = 0; y < B.goal(g); y++) for (let x = 0; x < g.w; x++) if (!g.board.get(x, y) && !cov.has(x + ',' + y)) sealed++;
        assert.strictEqual(c.sealed, sealed, preset + ' board ' + n);
      }
    }
  });

  test('battle: a cell outside the board (WALL) never reads as filler; a filler cell is FOREIGN, never paid', () => {
    const g = mk(6, 6);
    assert.strictEqual(g.board.get(-1, 0) & CELL.FILL, 0);
    assert.strictEqual(g.board.get(0, -1) & CELL.FILL, 0);
    assert(B.FILL & CELL.FOREIGN && B.FILL & CELL.FILL);
    paint(g, ['#####.']);
    g.board.set(5, 0, B.FILL);
    assert.strictEqual(B.ownCells(g), 5, 'the filler is not yours');
  });

  test('battle: Send: the piece in play or the first Next one; to the front of the other queue, first in first out; a cooldown of 6; received pieces neither held nor sent on', () => {
    const a = mk(10, 10, 1), b = mk(10, 10, 2), A = sd(a), Bs = sd(b);
    const cur = a.piece.type.id, nx = a.queue[0].id, bQ = b.queue[0].id;
    const e1 = B.send(A, Bs, 'current');
    assert(e1 && e1.id === cur && e1.received && e1.tag === 'received');
    assert.strictEqual(a.piece.type.id, nx, 'the next piece came in');
    assert.strictEqual(A.S.cd, B.COOLDOWN);
    assert.strictEqual(B.send(A, Bs, 'current'), null, 'not ready');
    A.S.cd = 0;
    const nx2 = a.queue[0].id, e2 = B.send(A, Bs, 'next');
    assert(e2 && e2.id === nx2, 'the first Next piece');
    assert.deepStrictEqual(b.queue.slice(0, 3).map((e) => e.id), [cur, nx2, bQ], 'first in, first out, ahead of their own');
    // Their piece in play is theirs; the received one comes next and can be neither held nor sent.
    b.lower(); while (b.piece && b.piece.entry && !b.piece.entry.received) b.drop();
    assert(b.piece.entry.received);
    assert.strictEqual(b.holdPiece(), false);
    Bs.S.cd = 0;
    assert.strictEqual(B.send(Bs, A, 'current'), null);
    // Cooldown: six pieces set.
    A.S.cd = B.COOLDOWN;
    for (let i = 0; i < 6; i++) { const r = a.drop(); B.afterLock(A, Bs, r); }
    assert.strictEqual(A.S.cd, 0);
  });

  test('battle: Gap fillers: earned when a piece you sent seals a gap as they set it (2 at most), fired on your own lock and when one is earned, lowest first; never paid', () => {
    const a = mk(6, 6, 1), b = mk(6, 6, 2), A = sd(a), Bs = sd(b);
    // B sets a received O that seals a hole: A earns one. (The O over (0,0) # and (1,0) empty: (1,0) sealed under it.)
    paint(b, ['#.####']);
    O(b, 0, { received: true, tag: 'received' });
    let r = b.drop();
    assert(r && r.tag === 'received');
    let ev = B.afterLock(Bs, A, r);
    assert(ev.earned && A.S.charges === 1 && A.S.earned === 1, JSON.stringify(ev));
    // A plain piece sealing a gap earns nothing.
    paint(b, ['#.####']);
    O(b, 0, {});
    Bs.S.sealedN = 0;
    r = b.drop();
    ev = B.afterLock(Bs, A, r);
    assert(!ev.earned && A.S.charges === 1);
    // The cap.
    A.S.charges = 2;
    paint(b, ['#.####']); Bs.S.sealedN = 0;
    O(b, 0, { received: true, tag: 'received' });
    r = b.drop();
    ev = B.afterLock(Bs, A, r);
    assert(!ev.earned && A.S.charges === 2, 'two at most');
    // Fired on earning: A had a sealed gap; the earned charge fills it at once.
    A.S.charges = 0;
    paint(a, ['.#####', '######']);
    a.board.set(0, 0, 0); a.board.set(0, 1, 8);
    assert.strictEqual(B.sealedOf(a).n, 1);
    paint(b, ['#.####']); Bs.S.sealedN = 0;
    O(b, 0, { received: true, tag: 'received' });
    r = b.drop();
    ev = B.afterLock(Bs, A, r);
    assert(ev.earned && ev.foeFilled.length === 1 && A.S.charges === 0 && a.board.get(0, 0) === B.FILL, JSON.stringify(ev));
    // Fired on your own lock: a charge held, then a gap sealed by your own piece is filled.
    paint(a, ['#.####']); A.S.charges = 1; A.S.sealedN = 0;
    O(a, 0, {});
    r = a.drop();
    ev = B.afterLock(A, Bs, r);
    assert(ev.filled.length === 1 && A.S.charges === 0 && a.board.get(1, 0) === B.FILL && A.S.fillers >= 1, JSON.stringify(ev));
    // Two regions, two charges: lowest first.
    paint(a, ['#.#.##', '######']); A.S.charges = 1;
    const filled = B.fire(A);
    assert.deepStrictEqual(filled[0].map((c) => c.join(',')), ['1,0']);
    assert.strictEqual(B.ownCells(a), 10, 'fillers are never your cells');
  });

  test('battle: the win (every cell filled), a closed board starts over (the queue kept), Start over and a stuck piece', () => {
    const a = mk(6, 6, 1), b = mk(6, 6, 2), A = sd(a), Bs = sd(b);
    const rows = [];
    for (let y = 0; y < 6; y++) rows.push(y < 4 ? '######' : '####..');
    paint(a, rows);
    a.board.set(4, 4, 0); a.board.set(5, 4, 0);
    put(a, 'O', 4, 0);
    let r = a.drop();
    let ev = B.afterLock(A, Bs, r);
    assert(ev.won && B.full(a), 'the O filled the last four');
    // Closed: the only empty cells are sealed.
    paint(a, ['.#####', '######', '######', '######', '######', '######'].map((s, i) => (i === 5 ? '#####.' : s)));
    a.board.set(5, 5, 8); a.board.set(0, 0, 0);
    put(a, 'O', 2, 0);
    const before = a.queue.map((e) => e.id).join();
    ev = { topout: B.closed(a) };
    assert(ev.topout, 'closed');
    B.resetSide(A);
    assert(a.board.isEmpty() && A.S.resets === 1 && a.queue.map((e) => e.id).join() === before, 'emptied, the queue kept');
    // Stuck: one hole a block wide left, an O in play and in hold, Send not ready.
    paint(a, ['######', '######', '######', '######', '######', '#####.']);
    put(a, 'O', 1, 0);
    a.hold = { id: 'O', rot: 0 }; A.S.cd = 3;
    assert(B.stuck(A));
    A.S.cd = 0;
    a.queue[0] = { id: 'O', rot: 0 };
    assert(B.stuck(A), 'an O next would not help either');
    a.queue[0] = { id: 'I', rot: 0 };
    assert(!B.stuck(A), 'Send ready and an I next (sticking up into the buffer): not stuck');
  });

  test('battle: pay is the final board only (a reset drops what came before), a loss half, never more a piece than Standard', () => {
    const a = mk(10, 10, 1);
    paint(a, ['##########', '##########']);
    assert.strictEqual(B.pay(a, 'swift', true), 20 / 10 * 1 * 0.85);
    assert.strictEqual(B.pay(a, 'swift', false), 20 / 10 * 1 * 0.85 * 0.5);
    assert.strictEqual(B.pay(a, 'easy', true), 20 / 10 * 0.4);
    a.board.set(0, 0, B.FILL);
    assert.strictEqual(B.pay(a, 'swift', true), 19 / 10 * 0.85, 'a filler cell pays nothing');
    B.resetSide(B.side(a));
    assert.strictEqual(B.pay(a, 'swift', true), 0, 'cells lost to a reset never pay');
    // At most 0.34 a piece (Standard pays 0.37–0.39): a perfect board of every set, against Swift.
    for (const preset of ['normal', 'tiny', 'frantic', 'pentominoes']) {
      const R = Recipe.rules(R0({ shapes: { preset } }), 10);
      const perPiece = (R.E / 10) * R.f * B.LEVELS.swift.D;
      assert(perPiece <= 0.34 + 1e-9, preset + ' ' + perPiece);
    }
    // And in play: simulated rounds at every level (the winner's pay over its pieces set, resets included).
    for (const lv of B.IDS) for (const preset of ['normal', 'pentominoes']) {
      let pay = 0, pieces = 0;
      for (let s = 0; s < 4; s++) {
        const r = B.simulate({ levels: ['swift', lv], seed: 300 + s, shapes: { preset }, w: 10, rows: 10 });
        for (const i of [0, 1]) { pay += r.sides[i].pay; pieces += r.sides[i].pieces; }
      }
      assert(pay / pieces <= 0.34, lv + ' ' + preset + ' ' + (pay / pieces).toFixed(3));
    }
  });

  test('battle: the save: toJSON round trip (the match, the opponent\'s own board), playable at rows + k, a size check by rows', () => {
    const g = new Game({ w: 8, h: 8, seed: 5, recipe: R0({ battle: { level: 'brisk' } }), previewCount: 5 });
    const M = B.matchOf(g);
    assert(M && M.ai && M.ai.game.h === 12 && M.level === 'brisk');
    g.drop(); M.ai.game.drop(); M.round.phase = 'play'; M.round.ms = 1234; M.tally.brisk = [3, 2]; M.me.S.cd = 4;
    const j = JSON.parse(JSON.stringify(g.toJSON()));
    assert(Library.playable(j), 'playable');
    assert(Recipe.valid(j));
    const g2 = new Game({ saved: j, previewCount: 5 });
    const M2 = B.matchOf(g2);
    assert.deepStrictEqual(Array.from(g2.board.cells), Array.from(g.board.cells));
    assert.deepStrictEqual(Array.from(M2.ai.game.board.cells), Array.from(M.ai.game.board.cells));
    assert(M2.round.phase === 'play' && M2.round.ms === 1234 && M2.me.S.cd === 4 && B.tallyText(M2) === 'vs Brisk 3–2');
    assert.deepStrictEqual(g2.toJSON(), g.toJSON());
    const bad = JSON.parse(JSON.stringify(j)); bad.h = 20; bad.cells = new Array(8 * 20).fill(0);
    assert(!Library.playable(bad), '16 rows is no Battle size');
    assert.deepStrictEqual(Recipe.summary(j).battle, { level: 'brisk', won: 3, lost: 2, wins: 0, losses: 0, rounds: 0 });
  });

  test('battle: the AI: the same decisions from the same seed; every path valid move by move (left, right, down, turns), ending in a set', () => {
    const run = () => { const r = B.simulate({ levels: ['brisk', 'steady'], seed: 77 }); return r.winner + ':' + r.time.toFixed(3) + ':' + r.sides.map((s) => s.pieces + '/' + s.S.sends).join(); };
    assert.strictEqual(run(), run());
    // Paths: from the spawn to every resting spot of every turn, on random boards, played on the engine.
    const rng = new L.RNG(5);
    let checked = 0;
    for (let n = 0; n < 30; n++) {
      const g = mk(10, 10, n + 1);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) if (rng.next() < 0.45) g.board.set(x, y, 8);
      const p = g.piece, rows = B.rowsOf(g.board.cells, g.w, g.h);
      const s = B.search(g, p.type, { rot: p.rot, x: p.x, y: p.y }, rows);
      for (const sp of s.restIn(B.goal(g))) {
        const t = new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())), battleAI: true });
        const path = s.path(sp.i);
        for (const m of path) assert(B.play(t, m), 'move ' + m);
        assert(t.piece.rot === sp.rot && t.piece.x === sp.x && t.piece.y === sp.y, 'arrived');
        const r = t.lower();
        assert(r && typeof r === 'object', 'set where it rests');
        checked++;
      }
    }
    assert(checked > 500, String(checked));
  });

  test('battle: cover is fast: p99 under 1 ms on Frantic 12 × 17 (29 shapes)', () => {
    const g = new Game({ w: 12, h: 12, seed: 3, recipe: R0({ shapes: { preset: 'frantic' } }), battleAI: true });
    const types = B.typesOf(g), rng = new L.RNG(4), ts = [];
    assert(g.h === 17 && types.length >= 20, g.h + ' ' + types.length);
    for (let i = 0; i < 1500; i++) {
      g.board.cells.fill(0);
      const fill = rng.next() * 0.8;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (rng.next() < fill * (1 - y / 14)) g.board.set(x, y, 8);
      const rows = B.rowsOf(g.board.cells, g.w, g.h), t0 = performance.now();
      B.cover(rows, g.w, g.h, 12, types);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    const p99 = ts[Math.floor(ts.length * 0.99)];
    assert(p99 < 1, 'p99 ' + p99.toFixed(3) + ' ms');
    console.log('       cover on Frantic 12 x 17: p50 ' + ts[ts.length >> 1].toFixed(3) + ' ms, p99 ' + p99.toFixed(3) + ' ms');
  });

  test('battle: the ladder: Swift beats Easy in at least 18 of 20; a player at 3 s a piece (Steady\'s judgement) beats Easy in at least 14 of 20', () => {
    let swift = 0, human = 0;
    const pay = [0, 0];
    for (let s = 0; s < 20; s++) {
      const a = B.simulate({ levels: ['swift', 'easy'], seed: 100 + s });
      if (a.winner === 0) swift++;
      const hm = B.simulate({ levels: ['easy', 'easy'], seed: 100 + s, human: { pace: 3 } });
      if (hm.winner === 0) human++;
      pay[0] += hm.sides[0].pay; pay[1] += hm.sides[0].pieces;
    }
    console.log('       Swift beats Easy ' + swift + '/20; the 3 s player beats Easy ' + human + '/20 (pays ' + (pay[0] / pay[1]).toFixed(3) + ' a piece)');
    assert(swift >= 18, String(swift));
    assert(human >= 14, String(human));
  });
};
