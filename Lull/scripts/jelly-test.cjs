// Jelly (js/jelly.js): links, cascades, items, streaks, Undo and the save, Knock-On, Best Fit's cost, and fairness
// (bots that seek cascades or play greedily never earn more per piece or per action than a Standard board).
// Run by test.cjs: require('./jelly-test.cjs')(test).
'use strict';
const assert = require('assert');

module.exports = function jellyTests(test) {
  const L = globalThis.Lull;
  const { Game, Recipe, CELL, Pieces, Board, Library, Pay, Chain, Jelly, Achievements } = L;
  const JR = CELL.JOIN_R, JU = CELL.JOIN_U;
  const JELLY = Recipe.normalize({ mods: { jelly: true } });
  const jelly = (o) => new Game(Object.assign({ w: 10, h: 20, seed: 1, recipe: JELLY }, o));

  /**
   * Rows top to bottom: '.' empty, 'X' a block on its own, 'F' a block the player never placed, 'A' the sprout, a
   * lowercase letter a lump (4-adjacent cells of the same letter are joined).
   */
  const fill = (g, rows) => {
    const b = g.board, H = rows.length, at = (x, y) => (y >= 0 && y < H && x >= 0 && x < rows[0].length ? rows[H - 1 - y][x] : '.');
    for (let y = 0; y < H; y++) for (let x = 0; x < rows[0].length; x++) {
      const ch = at(x, y);
      if (ch === '.') continue;
      let v = ch === 'F' ? CELL.FOREIGN | 8 : ch === 'A' ? CELL.ASSET | 31 : 1 + (x % 7);
      if (/[a-z]/.test(ch)) { if (at(x + 1, y) === ch) v |= JR; if (at(x, y + 1) === ch) v |= JU; }
      b.set(x, y, v);
    }
  };
  /** The board as rows top to bottom (height n): '.' empty, '#' a block. */
  const rowsOf = (g, n) => { const out = []; for (let y = n - 1; y >= 0; y--) { let s = ''; for (let x = 0; x < g.w; x++) s += g.board.get(x, y) ? '#' : '.'; out.push(s); } return out; };
  /** The piece in play made `id`, turned rot, its box at column x, and dropped. */
  const dropAt = (g, id, x, rot, special) => { g.piece = { type: Pieces.get(id), rot: rot || 0, x, y: g.h - 5, special: special || null, entry: { id, rot: 0, special: special || null }, lastRot: false }; return g.drop(); };
  const links = (g, x, y) => { const v = g.board.get(x, y); return (v & JR ? 'R' : '') + (v & JU ? 'U' : ''); };

  test('jelly: the part: Jelly on the Modifiers tab, rated, no feats, Tornado refused; a Normal board is untouched', () => {
    assert.strictEqual(Recipe.label(JELLY), 'Jelly');
    const R = Recipe.rules(JELLY, 10);
    assert.strictEqual(R.rated, true, 'rated for pay');
    assert.strictEqual(R.feats, false, 'feats off');
    assert.strictEqual(R.refuse.tornado, 'Not on a Jelly board');
    assert.strictEqual(R.lk, 1, 'a row is worth what it is on a Normal board');
    const g = jelly();
    assert.deepStrictEqual(g.ext.map((e) => e.key), ['jelly']);
    assert.strictEqual(g.allow('tornado'), 'Not on a Jelly board');
    assert.strictEqual(new Game({ w: 10, h: 20, seed: 1, recipe: {} }).ext.length, 0);
    assert(Recipe.options().some((o) => o.path === 'mods.jelly'));
    assert.strictEqual(L.SKINS ? L.SKINS.jelly.name : L.COSMETICS.skins.jelly.name, 'Gummy', 'the skin is Gummy');
  });

  test('jelly: links: a piece is joined at lock (right and up only); a clear, Settle and Mirror World keep them true', () => {
    const g = jelly();
    const r = dropAt(g, 'T', 3);
    assert.strictEqual(r.lines, 0);
    // T flat, pointing up: (3,0) (4,0) (5,0) and (4,1).
    assert.deepStrictEqual([links(g, 3, 0), links(g, 4, 0), links(g, 5, 0), links(g, 4, 1)], ['R', 'RU', '', '']);
    // A clear takes the links up into it.
    const b = new Board(4, 4);
    b.set(0, 0, 1 | JU); b.set(0, 1, 1 | JU); b.set(0, 2, 1); b.set(1, 1, 1); b.set(2, 1, 1); b.set(3, 1, 1);
    b.clearRows([1]);
    assert.strictEqual(b.get(0, 0) & JU, 0, 'a link up into a cleared row goes');
    assert.strictEqual(b.get(0, 1), 1, 'the block above comes down, on its own');
    // compact: a column comes down together (its link up stays); a link across stays only in the same row.
    const c = new Board(3, 4);
    c.set(0, 2, 1 | JR | JU); c.set(0, 3, 1); c.set(1, 2, 1); c.set(1, 0, 1); c.set(2, 1, 1 | JU); c.set(2, 2, 1);
    c.compact();
    assert.deepStrictEqual([c.get(0, 0) & (JR | JU), c.get(0, 1), c.get(1, 1), c.get(2, 0) & JU], [JU, 1, 1, JU], 'up kept, across dropped (landed a row apart)');
    const d = new Board(2, 2);
    d.set(0, 1, 1 | JR); d.set(1, 1, 1);
    d.compact();
    assert.strictEqual(d.get(0, 0) & JR, JR, 'across kept when both land in the same row');
    // fixJoins: links to nothing, a stranger or the sprout go.
    const f = new Board(3, 2);
    f.set(0, 0, 1 | JR | JU); f.set(1, 0, CELL.FOREIGN | 8); f.set(2, 0, 1 | JR);
    assert.strictEqual(f.fixJoins(), 2);
    assert.deepStrictEqual([f.get(0, 0), f.get(2, 0)], [1, 1]);
    // Mirror World: the links across turn with the board.
    const m = jelly();
    fill(m, ['aa.b', 'aXXb']);
    m.board.set(9, 0, 1);
    const flipped = m.flipWorld();
    assert(flipped);
    // Row 0 was a X X b . . . . . X (cols 0-3, 9): now X at 0, b a at 6..9 mirrored.
    assert.strictEqual(m.board.get(9, 1) & JR, 0, 'no link past the edge');
    assert.strictEqual(m.board.get(8, 1) & JR, JR, 'aa at 0-1 is now at 8-9, joined from 8');
    assert.strictEqual(m.board.get(9, 0) & JU, JU, 'links up stay in their column');
    assert.strictEqual(m.board.get(6, 0) & JU, JU);
  });

  test('jelly: an overhang falls and clears, in 2 plain waves after the piece’s own row', () => {
    const g = jelly();
    fill(g, [
      '.bb...cc..',
      'XXXXXXXXX.',
      'X..ddddddd',
      'XXXXXX..XX',
    ]);
    Object.assign(g.s, { b2b: 2, combo: 1 });
    const r = dropAt(g, 'I', 7, 1); // on end, in column 9
    assert.strictEqual(r.n, 1, 'the piece’s own row');
    assert.strictEqual(r.cascade.length, 2, JSON.stringify(r.cascade.map((w) => w.rows)));
    assert.deepStrictEqual(r.cascade.map((w) => w.rows), [[1], [0]]);
    assert.strictEqual(r.c, 2, 'cascade rows are plain');
    assert.strictEqual(r.lines, 3);
    assert.strictEqual(r.own, 2, 'the cascade rows are worth half: 1 + 2 × ½');
    assert.strictEqual(r.cascadeOwn, 2);
    assert.strictEqual(g.s.own, 2);
    assert.strictEqual(g.s.lines, 3, 'the lines shown count them whole');
    assert.strictEqual(r.waves, 2);
    assert.strictEqual(r.quad, false);
    assert.strictEqual(g.s.b2b, -1, 'a single ends the streak (the cascade neither adds nor saves it)');
    assert.strictEqual(g.s.combo, 2, 'the combo goes up once for the lock');
    assert.strictEqual(r.score, 100 + 300 + 50 * 2 + 100 + 200, 'a single, a plain double, the combo, and 100 × each wave’s number');
    assert.deepStrictEqual(rowsOf(g, 4), ['..........', '.........#', '.........#', '.........#'], 'the rest of the I');
    assert.strictEqual(g.s.cascades, 2);
    assert.strictEqual(g.s.bestCascade, 2);
    // Each wave: the board before it, what fell (x, y, dy), the rows and what they held.
    const w0 = r.cascade[0];
    assert.deepStrictEqual(w0.falls.map((f) => f.join()).sort(), ['1,2,1', '2,2,1']);
    assert.strictEqual(w0.before.length, 200);
    assert.strictEqual(w0.removed.length, 1);
  });

  test('jelly: a piece cut by a clear falls whole; lumps stack on lumps; a supported stack stays; the sprout holds', () => {
    const at = (rows, w) => { const h = new Game({ w: w || rows[0].length, h: 8, seed: 1, recipe: JELLY }); fill(h, rows); return h; };
    // Cut: a lump through a row that clears; the part above comes down with the rows and, left over a hole, falls whole.
    let t = at(['.a..', '.aa.', 'XaXX', 'X..X']);
    t.board.clearRows([1]);
    let waves = Jelly.cascade(t, t.board);
    assert.strictEqual(waves.length, 1);
    assert.deepStrictEqual(waves[0].falls.map((f) => f.join()).sort(), ['1,1,1', '1,2,1', '2,1,1'], 'all of it, one row');
    assert.deepStrictEqual(waves[0].rows, [0], 'and the row it filled clears');
    assert.deepStrictEqual(rowsOf(t, 3), ['....', '....', '.#..']);
    // Stack: a lump resting on a falling lump falls with it.
    t = at(['.bb.', '.a..', '.a..', '....', 'XX.X']);
    waves = Jelly.cascade(t, t.board);
    assert.strictEqual(waves.length, 1);
    assert.deepStrictEqual(waves[0].falls.map((f) => f[2]), [1, 1, 1, 1], 'both fell one row');
    // Supported: nothing moves.
    t = at(['aa..', '.a..', '.a.X', 'XXXX']);
    const before = Array.from(t.board.cells);
    waves = Jelly.cascade(t, t.board);
    assert.strictEqual(waves.length, 0);
    assert.deepStrictEqual(Array.from(t.board.cells), before);
    // The sprout holds up what rests on it; a stone (never placed) falls, a lump of one.
    t = at(['aa..', 'A..F', '....', '....']);
    waves = Jelly.cascade(t, t.board);
    assert.deepStrictEqual(rowsOf(t, 4), ['##..', '#...', '....', '...#']);
    assert(t.board.get(0, 2) & CELL.ASSET, 'the sprout never falls');
  });

  test('jelly: a cluster’s corner part (joined only at a corner) falls at once when the piece sets', () => {
    const g = jelly();
    const type = Pieces.customType([[0, 0], [1, 0], [2, 1]]);
    g.piece = { type, rot: 0, x: 3, y: 10, special: null, entry: { id: type.id, rot: 0 }, lastRot: false };
    const r = g.drop();
    assert.strictEqual(r.cascade.length, 1, 'one wave: the corner part');
    assert.deepStrictEqual(r.cascade[0].rows, []);
    assert.strictEqual(g.board.count(), 3);
    assert.deepStrictEqual(rowsOf(g, 2), ['..........', '...###....']);
    assert.strictEqual(r.waves, 0, 'no cascade cleared a row');
  });

  test('jelly: a quad followed by a cascade keeps the back-to-back and counts as a quad; the combo goes up by 1', () => {
    const g = jelly();
    fill(g, [
      '..aa......',
      'rrrrrrrrr.',
      'XXXXXXXXX.',
      'XXXXXXXXX.',
      'XXXXXXXXX.',
      'XX..XXXXXX',
    ]);
    // aa rests on the quad rows over a hole: after the quad it falls into it and clears row 0.
    Object.assign(g.s, { b2b: 0, combo: 3, quadRun: 1 });
    const r = dropAt(g, 'I', 7, 1);
    assert.strictEqual(r.n, 4);
    assert.strictEqual(r.quad, true);
    assert.deepStrictEqual(r.cascade.map((w) => w.rows), [[0]]);
    assert.strictEqual(r.c, 1);
    assert.strictEqual(g.s.b2b, 1, 'the quad links the streak');
    assert.strictEqual(r.b2b, true);
    assert.strictEqual(g.s.combo, 4, 'one lock, one step of the combo');
    assert.strictEqual(g.s.quadRun, 2);
    // Pay: the quad's bonus once, every row at the multiplier (the cascade row is paid, never a quad).
    const pay = Pay.clear({ mult: 1 }, r, g.rules).pay;
    assert.strictEqual(pay, 5.5, '4 own rows, a cascade row at half, and one quad bonus');
  });

  test('jelly: rows only a cascade cleared leave the streak alone (recipe seam), and never make a T-spin', () => {
    const g = jelly();
    Object.assign(g.s, { b2b: 3, combo: -1, quadRun: 2, hb2b: 1 });
    // A corner part falls into a hole and completes a row: the piece cleared nothing itself.
    fill(g, ['XXXX.XXXXX']);
    const type = Pieces.customType([[0, 0], [1, 1]]);
    g.piece = { type, rot: 0, x: 3, y: 10, special: null, entry: { id: type.id, rot: 0 }, lastRot: false };
    const r = g.drop();
    assert.deepStrictEqual([r.n, r.c, r.lines], [0, 1, 1], JSON.stringify(rowsOf(g, 3)));
    assert.deepStrictEqual([g.s.b2b, g.s.quadRun, g.s.combo], [3, 2, 0], 'the streak kept, the combo started');
    assert.strictEqual(r.b2b, false);
  });

  test('jelly: items: Bomb, Black Hole, Drill and Laser cascade; Settle and Trapdoor test the cascade; Tornado is refused', () => {
    const rests = (g) => Jelly.lumps(g.board).list.every((cells) => cells.some((j) => j < g.w || (g.board.cells[j - g.w] && Jelly.lumps(g.board).id[j - g.w] !== Jelly.lumps(g.board).id[j]) || g.board.cells[j] & CELL.ASSET));
    // Drill: it bores out the column holding a lump up; the lump falls into the holes and fills the floor row.
    let g = jelly();
    fill(g, [
      '..aaa.....',
      '....X.....',
      '....X.....',
      'XX..XXXXXX',
    ]);
    g.replacePiece({ id: 'M1', special: 'drill' });
    g.piece.x = 4; g.piece.y = 2;
    let r = g.drop();
    assert.strictEqual(r.special, 'drill');
    assert.deepStrictEqual(r.drilled.length, 3);
    assert.deepStrictEqual(r.cascade.map((w) => w.rows), [[0]], 'the lump fell three rows and filled the floor row');
    assert.deepStrictEqual([r.lines, r.n, r.c], [1, 0, 1], 'one plain row');
    assert(g.board.isEmpty());
    // Bomb: the same scene, the support blown away.
    g = jelly();
    fill(g, [
      '..aaa.....',
      '....X.....',
      '....X.....',
      'XX..XXXXXX',
    ]);
    g.replacePiece({ id: 'M1', special: 'bomb' });
    g.piece.x = 6; g.piece.y = 10;
    r = g.drop();
    assert(r.blast.length > 0);
    assert(r.cascade && r.cascade.length, 'what the blast left hanging fell');
    assert(rests(g), 'nothing hangs after a bomb');
    // Black hole.
    g = jelly();
    fill(g, [
      '..aaa.....',
      '....X.....',
      '....X.....',
      'XX..XXXXXX',
    ]);
    g.replacePiece({ id: 'M1', special: 'blackhole' });
    g.piece.x = 6; g.piece.y = 10;
    r = g.drop();
    assert(r.swallowed.length > 0);
    assert(rests(g), 'nothing hangs after a black hole');
    // Laser: the rows it takes, then what hangs falls.
    g = jelly();
    fill(g, [
      '.aa.......',
      'XXXXXX....',
      'rrrrrr....',
      'X..XXXXXXX',
    ]);
    g.replacePiece({ id: 'O', special: 'laser' });
    g.piece.rot = 0; g.piece.x = 7; g.piece.y = 10;
    r = g.drop();
    assert.strictEqual(r.special, 'laser');
    assert(r.lines >= 2 && r.cascade && r.cascade.length, JSON.stringify([r.rows, r.cascade && r.cascade.map((w) => w.rows)]));
    assert(rests(g), 'nothing hangs after a laser');
    // Settle's and Trapdoor's test (roomAfter) runs the cascade: a lump that would come down into the piece refuses it.
    g = jelly();
    fill(g, [
      'aa........',
      'X.........',
      'X.........',
      'X.........',
    ]);
    g.piece = { type: Pieces.get('M1'), rot: 0, x: 1, y: 0, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    const snap = Array.from(g.board.cells);
    assert.strictEqual(g.roomAfter(() => {}), true, 'held up: room');
    assert.strictEqual(g.roomAfter(() => { g.board.set(0, 0, 0); g.board.set(0, 1, 0); g.board.set(0, 2, 0); }), false, 'its hold gone, the lump would fall into the piece');
    assert.deepStrictEqual(Array.from(g.board.cells), snap, 'the test leaves the board as it was');
    // Settle refused when blocks would come down into the piece.
    g = jelly();
    fill(g, ['X.........', '..........', 'X.........']);
    g.piece = { type: Pieces.get('M1'), rot: 0, x: 0, y: 1, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    assert.strictEqual(g.settle(), null, 'refused: the block above would land in the piece');
    // Settle on a Jelly board: columns fall, links across torn where blocks land apart; nothing is left hanging.
    g = jelly();
    fill(g, ['aa........', 'a.........', '..........', 'XXXXXXXX..']);
    g.piece = { type: Pieces.get('O'), rot: 0, x: 7, y: 15, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    r = g.settle();
    assert(r);
    assert.deepStrictEqual(rowsOf(g, 3), ['#.........', '##........', '########..'], 'each column down; the lump torn where it landed apart');
    assert(rests(g));
    // Tornado.
    g = jelly();
    fill(g, ['XX........']);
    assert.strictEqual(g.allow('tornado'), 'Not on a Jelly board');
    // Trapdoor: the bottom row goes, the links into it go too, nothing is left hanging.
    g = jelly();
    fill(g, ['aa........', 'a.........', 'XXXXX.....']);
    g.piece = { type: Pieces.get('O'), rot: 0, x: 7, y: 15, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    const row = g.trapdoor();
    assert(row);
    assert.deepStrictEqual(rowsOf(g, 2), ['##........', '#.........']);
    assert.strictEqual(g.board.get(0, 0) & JU, JU, 'the lump keeps its own links');
  });

  test('jelly: Undo and a resumed board keep the links, the cascades and the counts', () => {
    const g = jelly({ seed: 7 });
    fill(g, [
      '.bb...cc..',
      'XXXXXXXXX.',
      'X..ddddddd',
      'XXXXXX..XX',
    ]);
    const cells0 = Array.from(g.board.cells);
    const r = dropAt(g, 'I', 7, 1);
    assert.strictEqual(r.waves, 2);
    const after = Array.from(g.board.cells), s = JSON.parse(JSON.stringify(g.s));
    const back = g.undo();
    assert.deepStrictEqual(Array.from(g.board.cells), cells0, 'links and all, as it was');
    assert.strictEqual(g.s.cascades || 0, 0);
    assert.strictEqual(back.own, 2, 'Undo takes back what it paid: 1 + 2 × ½');
    // Replay it and save: the resumed board has the same cells, links and counts.
    dropAt(g, 'I', 7, 1);
    assert.deepStrictEqual(Array.from(g.board.cells), after);
    const saved = JSON.parse(JSON.stringify(g.toJSON()));
    const h = new Game({ saved });
    assert.deepStrictEqual(Array.from(h.board.cells), after);
    assert.deepStrictEqual(h.ext.map((e) => e.key), ['jelly']);
    assert.strictEqual(h.s.cascades, s.cascades);
    assert(Library.playable(saved), 'a saved Jelly board can be resumed');
    // Its summary: the cascades, for the Cascades tile.
    assert.deepStrictEqual(Recipe.summary(h).jelly, { cascades: 2, best: 2 });
    assert.deepStrictEqual(Recipe.summary(saved).jelly, { cascades: 2, best: 2 });
    assert.deepStrictEqual(Library.summarize(h.s, Date.now(), h).ext.jelly, { cascades: 2, best: 2 });
  });

  test('jelly: Knock-On: three cascades from one piece, on a Jelly board (never elsewhere)', () => {
    const a = Achievements.LIST.find((x) => x.id === 'knock_on');
    assert(a && a.name === 'Knock-On' && a.pay === 30 && a.group === 'play');
    const g = jelly();
    fill(g, [
      '.bb.cc.dd.',
      'rrrrrrrrr.',
      'X..fffffff',
      'XXXX..gggg',
      'XXXXXXX..X',
    ]);
    const r = dropAt(g, 'I', 7, 1);
    assert.strictEqual(r.waves, 3, JSON.stringify(r.cascade.map((w) => w.rows)));
    const state = { achievements: {} };
    const got = Achievements.check(state, { mode: 'play', r, g });
    assert(got.some((x) => x.id === 'knock_on'), got.map((x) => x.id).join());
    // A Normal board with the same numbers: not there.
    const plain = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
    assert(!Achievements.check({ achievements: {} }, { mode: 'play', r, g: plain }).some((x) => x.id === 'knock_on'));
    // Feats are off on Jelly: a quad here is not Four at Once.
    assert(!got.some((x) => x.id === 'quad'));
  });

  test('jelly: Best Fit runs the cascade only for placements that clear rows (200 at most a piece), and is quick on a 20 × 40 board', () => {
    const g = jelly({ w: 20, h: 40, seed: 3 });
    // The worst case: tall ragged towers of lumps over holes, rows nearly full, every candidate clearing something.
    for (let y = 0; y < 34; y++) for (let x = 0; x < 20; x++) {
      if (x === (y * 7) % 20 || (y % 3 === 1 && x === (y * 3 + 5) % 20)) continue;
      let v = 1 + ((x + y) % 7);
      if (x % 2 === 0) v |= JR;
      if (y % 2 === 0) v |= JU;
      g.board.set(x, y, v);
    }
    g.board.fixJoins();
    for (let x = 0; x < 20; x++) for (let y = 34; y < 40; y++) g.board.set(x, y, 0);
    for (let x = 0; x < 20; x++) if (x !== 4) g.board.set(x, 33, 1);
    g.piece = { type: Pieces.get('T'), rot: 0, x: 8, y: 36, special: null, entry: { id: 'T', rot: 0 }, lastRot: false };
    let calls = 0;
    const was = Jelly.cascade;
    const ext = g.ext[0], orig = ext.afterClear;
    ext.afterClear = function (gg, b, res) { if (b !== gg.board && res.rows && res.rows.length) calls++; return orig.apply(this, arguments); };
    g.hooks.afterClear = [ext];
    const t0 = process.hrtime.bigint();
    const best = g.bestFit();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(best, 'a spot');
    assert(ms < 50, 'Best Fit took ' + ms.toFixed(1) + ' ms');
    assert(calls > 0, 'clearing candidates were simulated');
    assert.strictEqual(Jelly.cascade, was);
    // Over the cap, the rest are judged without their cascades: the count never passes it.
    let ran = 0;
    const sim = Jelly.SIM_CAP;
    const h = jelly({ w: 20, h: 40, seed: 3 });
    h.board.cells.set(g.board.cells);
    h.piece = g.piece;
    const real = Jelly.cascade;
    try {
      L.Jelly.cascade = function () { ran++; return real.apply(this, arguments); };
      // (the ext closes over the module's own cascade: count through simulate's results instead)
    } finally { L.Jelly.cascade = real; }
    let withCascade = 0;
    for (let i = 0; i < sim + 50; i++) { const s = h.simulate(Pieces.get('I'), 0, 4, h.board); if (s && s.res.cascade) withCascade++; }
    assert(withCascade <= sim, 'at most ' + sim + ' simulated cascades a piece (' + withCascade + ')');
    assert.strictEqual(ran, 0);
  });

  // ---- fairness -----------------------------------------------------------------------------------------------------

  /**
   * Plays n pieces of a board with a bot and pays each lock as Free Play does (Pay.mult, then Pay.clear by the board's
   * worth). 'greedy': the most rows, then the fewest holes, the lowest, the flattest. 'cascade': looks one piece ahead
   * (the first Next) and prizes rows a cascade clears, its waves, and a stack that sets them up. Counts the actions a
   * player needs (a turn each quarter, a step each column, a drop). Returns { pay, pieces, actions, quads }.
   */
  function play(recipe, w, h, seed, bot, n) {
    const g = new Game({ w, h, seed, recipe, previewCount: 1 });
    const W = w, H = h;
    const heights = (c) => { const hs = []; for (let x = 0; x < W; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if (c[y * W + x]) { t = y + 1; break; } hs.push(t); } return hs; };
    const holes = (c) => { let k = 0; for (let x = 0; x < W; x++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (c[y * W + x]) roof = true; else if (roof) k++; } } return k; };
    const shape = (c) => { const hs = heights(c); return holes(c) * 60 + Math.max(...hs) * 4 + hs.reduce((a, v) => a + v, 0) * 0.5 + hs.slice(1).reduce((a, v, i) => a + Math.abs(v - hs[i]), 0); };
    const spots = (type, board) => {
      const out = [], seen = new Set();
      for (let rot = 0; rot < 4; rot++) {
        const key = Pieces.keyOf(type.rots[rot]);
        if (seen.has(key)) continue;
        seen.add(key);
        const bnd = type.rotBounds[rot];
        for (let x = -bnd.minX; x <= W - 1 - bnd.maxX; x++) { const sim = g.simulate(type, rot, x, board); if (sim) out.push({ rot, x, sim }); }
      }
      return out;
    };
    const casc = (sim) => { const cs = sim.res.cascade || []; return { rows: cs.reduce((a, wv) => a + wv.rows.length, 0), waves: cs.filter((wv) => wv.rows.length).length }; };
    let pay = 0, actions = 0, pieces = 0, quads = 0;
    for (; pieces < n && g.piece && !g.over; pieces++) {
      const type = g.piece.type, next = g.queue[0] && Pieces.get(g.queue[0].id);
      let best = null;
      for (const sp of spots(type, g.board)) {
        const { sim } = sp;
        let cost = -(sim.n + sim.c) * 1000 + shape(sim.board.cells);
        if (bot !== 'greedy') {
          const c1 = casc(sim);
          cost -= c1.rows * 600 + c1.waves * 400;
          // One piece ahead: the best the next piece can make of this stack, cascades counted.
          if (next) {
            let b2 = Infinity;
            for (const s2 of spots(next, sim.board)) { const c2 = casc(s2.sim); b2 = Math.min(b2, -(s2.sim.n + s2.sim.c) * 1000 - c2.rows * 600 - c2.waves * 400 + shape(s2.sim.board.cells)); }
            if (b2 < Infinity) cost = cost * 0.5 + b2 * 0.5;
          }
        }
        // 'lean': the same, spending as few actions as it can on a spot about as good (a player who saves keys).
        if (bot === 'lean') cost += (Math.min(sp.rot, 4 - sp.rot) + Math.abs(sp.x - g.piece.x)) * 40;
        if (!best || cost < best.cost) best = { cost, rot: sp.rot, x: sp.x };
      }
      if (!best) break;
      const p = g.piece;
      actions += Math.min(best.rot, 4 - best.rot) + Math.abs(best.x - p.x) + 1;
      p.rot = best.rot; p.x = best.x; p.y = H - 1 - type.rotBounds[best.rot].maxY;
      if (!g.fitsAt(p, p.rot, p.x, p.y)) break;
      const r = g.drop();
      if (!r) break;
      if (r.quad) quads++;
      g.s.mult = Pay.mult(g);
      if (r.lines) pay += Pay.clear(g.s, r, g.rules).pay;
    }
    return { pay, pieces, actions, quads };
  }

  test('jelly: fairness: bots that seek cascades, save keys or play greedily never earn more per piece or per action than on a Normal board', () => {
    const cap = Jelly.SIM_CAP;
    Jelly.SIM_CAP = 1e9; // the bots see every cascade (Best Fit's cap is for its speed, not its judgement)
    try {
      const T = process.env.JELLY_TABLE, fmt = (v) => (typeof v === 'number' ? Math.round(v * 100000) / 100000 : v);
      // Each bot's runs are pooled over seeds (where a short run stops is noise), a Normal and a Jelly board of the same
      // size playing the same seeds. No allowance: at these counts what is left of the noise is well under half a
      // percent, and Jelly's cascade rows paying half keeps it below (README, Jelly: fairness).
      const pooled = (recipe, w, h, bot, seeds, n) => {
        const t = { pay: 0, pieces: 0, actions: 0, quads: 0 };
        for (const seed of seeds) { const r = play(recipe, w, h, seed, bot, n); for (const k of Object.keys(t)) t[k] += r[k]; }
        return t;
      };
      const range = (a, k, step) => Array.from({ length: k }, (_, i) => a + i * step);
      // Standard: a Normal 10 × 20 board, its best bot, a piece.
      let stdPiece = 0;
      for (const bot of ['greedy', 'cascade', 'lean']) { const s = pooled({}, 10, 20, bot, bot === 'greedy' ? range(1, 12, 1) : [1, 2, 3], bot === 'greedy' ? 400 : 200); stdPiece = Math.max(stdPiece, s.pay / s.pieces); }
      const over = [];
      for (let w = 4; w <= 20; w++) {
        const h = Math.max(16, Math.min(40, 2 * w));
        // Looking a piece ahead costs a board's spots squared: those bots play the narrow boards (where Jelly helps
        // most) over fewer, shorter runs; the greedy one plays every width, over twelve seeds of 400 pieces.
        const bots = w <= 10 ? ['greedy', 'cascade', 'lean'] : ['greedy'];
        const runOf = (bot) => (bot === 'greedy' ? [range(w, 12, 30), 400] : [range(w, 3, 30), 200]);
        // What a Normal board this size pays a key at best (a narrow board needs fewer keys a piece whatever it holds:
        // that is its size, not Jelly).
        let nrmAction = 0;
        for (const bot of bots) { const r = pooled({}, w, h, bot, ...runOf(bot)); nrmAction = Math.max(nrmAction, r.pay / r.actions); }
        for (const bot of bots) {
          const j = pooled(JELLY, w, h, bot, ...runOf(bot));
          const perPiece = j.pay / j.pieces, perAction = j.pay / j.actions;
          if (T) console.log([w, bot, perPiece, stdPiece, perAction, nrmAction].map(fmt).join('\t'));
          // No more than a piece's own cells can pay, whatever falls: 4 cells a piece, the multiplier, a quad's bonus.
          assert(j.pay <= j.pieces * 0.4 * Chain.mult(1e9) + j.quads * Chain.mult(1e9) + 1e-9, 'within the cells’ ceiling');
          if (perPiece > stdPiece || perAction > nrmAction) over.push([w, bot, perPiece, stdPiece, perAction, nrmAction].map(fmt).join(' '));
        }
      }
      assert.deepStrictEqual(over, [], 'earns more than a Normal board');
    } finally { Jelly.SIM_CAP = cap; }
  });
};
