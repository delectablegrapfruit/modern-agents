// The Mirror modifier's rules in Node (js/mirror.js): the pair, where it appears and what it counts, items in pairs,
// symmetry kept through 500 pieces of play at every width, pay (half a Standard row, and no bot earns faster per piece
// or per action than on a Standard board) and Butterfly. Run by test.cjs: require('./mirror-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function mirrorUnit({ L, test }) {
  const { Game, Pieces, Recipe, Pay, Combos, CELL } = L;
  const MIRROR = { mods: { mirror: true } };
  const mk = (w, h, seed, o) => new Game(Object.assign({ w, h: h || 20, seed: seed == null ? 1 : seed, recipe: MIRROR }, o || {}));
  const std = (w, h, seed) => new Game({ w, h: h || 20, seed: seed == null ? 1 : seed, recipe: {} });
  const key = (cells) => cells.map(([x, y]) => x + ',' + y).sort().join(' ');
  /** The piece in play becomes `id`, turned rot, its box at column x, from the top; then it drops. */
  const dropAt = (g, id, x, rot) => {
    const type = Pieces.get(id);
    g.piece = { type, rot: rot || 0, x, y: g.h - 1 - type.rotBounds[rot || 0].maxY, special: null, entry: { id, rot: 0 }, lastRot: false };
    return g.drop();
  };
  /** Fills rows [y0, y1] except the columns given. */
  const fillRows = (g, y0, y1, gaps) => { for (let y = y0; y <= y1; y++) for (let x = 0; x < g.w; x++) if (!gaps.includes(x)) g.board.set(x, y, 1 + (Math.min(x, g.w - 1 - x) % 7)); };
  /** Is the board its own reflection, colours and all? */
  const symmetric = (b) => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.get(x, y) !== b.get(b.w - 1 - x, y)) return false; return true; };

  console.log('mirror');

  test('mirror: the recipe, its rules (copies 2: E 8, f ½, a row worth w/20, wEff w/2), Mirror World refused, never in Battle', () => {
    assert.strictEqual(Recipe.label(MIRROR), 'Mirror');
    assert.strictEqual(Recipe.normalize(MIRROR).mods.mirror, true);
    assert.strictEqual(Recipe.normalize({ mods: { mirror: 'yes' } }).mods.mirror, false, 'only true is on');
    const R = Recipe.rules(MIRROR, 10);
    for (const [k, v] of Object.entries({ copies: 2, E: 8, f: 0.5, lk: 0.5, wEff: 5, feats: false, quad: 4, rated: true, undo: true, u: 1 })) assert.strictEqual(R[k], v, k);
    assert.deepStrictEqual(R.refuse, { flip: 'Not on a Mirror board' });
    const R20 = Recipe.rules(MIRROR, 20);
    assert(R20.lk === 1 && R20.wEff === 10 && R20.feats, 'a Mirror board 20 wide: the feats count, a row is one Standard line');
    assert.strictEqual(Recipe.rules(MIRROR, 11).lk, 0.55);
    assert.strictEqual(mk(10).allow('flip'), 'Not on a Mirror board');
    assert.strictEqual(mk(10).allow('tornado'), null);
    assert.strictEqual(std(10).allow('flip'), null, 'a plain board keeps Mirror World');
    // (Physics, a modifier that does not go with Mirror, and Descent, a mode that does not, are ruled out beside it.)
    const phys = Object.assign(Recipe.get('physics') ? { 'mods.physics=true': 'Not with Mirror' } : {}, Recipe.get('descent') ? { 'mode=descent': 'Not with Mirror' } : {});
    // (In Battle, the shapes it rules out are the shapes part's own.)
    const inB = Recipe.conflicts({ mods: { mirror: true }, mode: 'battle' });
    for (const k of Object.keys(inB)) if (k.startsWith('shapes.')) delete inB[k];
    assert.deepStrictEqual(inB, Object.assign(Recipe.get('battle') ? { 'mods.mirror=true': 'Not in Battle' } : {}, phys));
    // Sizes: none of its own (a pair always fits inside w).
    assert.deepStrictEqual(Recipe.limits(MIRROR), Recipe.limits(Recipe.DEFAULT));
    // A default board has no Mirror extension at all.
    assert(!std(10).ext.some((e) => e.key === 'mirror') && mk(10).ext.some((e) => e.key === 'mirror'));
  });

  test('mirror: the pair (the reflection, overlaps counted once; an odd width’s centre column is its own mirror)', () => {
    const { pair } = L.Mirror;
    assert.deepStrictEqual(pair(10, [[0, 0], [1, 0]]), [[0, 0], [1, 0], [9, 0], [8, 0]]);
    assert.deepStrictEqual(pair(10, [[4, 3], [5, 3]]), [[4, 3], [5, 3]], 'a piece across the line meets its reflection: one cell each');
    assert.deepStrictEqual(pair(11, [[5, 0], [5, 1]]), [[5, 0], [5, 1]], 'the centre column');
    assert.deepStrictEqual(pair(11, [[4, 0], [5, 0], [6, 1]]), [[4, 0], [5, 0], [6, 1], [6, 0], [4, 1]]);
    const g = mk(10);
    g.piece = { type: Pieces.TYPES.T, rot: 0, x: 2, y: 10, special: null, entry: { id: 'T', rot: 0 }, lastRot: false };
    assert.strictEqual(key(g.absCells()), key([[3, 12], [2, 11], [3, 11], [4, 11], [6, 12], [7, 11], [6, 11], [5, 11]]));
    // Turned: the copy turns the other way (it is the reflection, always).
    g.rotate(1);
    const own = g.piece.type.rots[g.piece.rot].map(([cx, cy]) => [g.piece.x + cx, g.piece.y + cy]);
    assert.strictEqual(key(g.absCells()), key(own.concat(own.map(([x, y]) => [9 - x, y]))));
  });

  test('mirror: the pair fits, moves and lands as one on a board that is not symmetric (either half can stop it)', () => {
    const g = mk(10);
    // One block on the right only: the piece's own cells are free there, its copy's are not.
    g.board.set(8, 5, 3);
    const O = { type: Pieces.TYPES.O, rot: 0, x: 0, y: 5, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    assert(g.board.fits(O.type.rots[0], 0, 5), 'the piece alone would fit');
    assert(!g.fitsAt(O, 0, 0, 5), 'the copy covers the block: the pair does not');
    assert(g.fitsAt(O, 0, 0, 6));
    // Lowered from above, it lands on the block under its copy, its own cells in the air.
    g.piece = Object.assign({}, O, { y: 15 });
    const r = g.drop();
    assert(r && key(r.cells) === key([[0, 6], [1, 6], [0, 7], [1, 7], [9, 6], [8, 6], [9, 7], [8, 7]]), JSON.stringify(r && r.cells));
    assert(!g.board.get(0, 5) && g.board.get(8, 5), 'nothing under the piece itself');
    // Sideways: a column of blocks on the right stops the piece moving left (its copy moves right into it).
    const s = mk(10);
    for (let y = 0; y < 20; y++) s.board.set(9, y, 2);
    s.piece = { type: Pieces.TYPES.O, rot: 0, x: 2, y: 10, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    assert(s.move(-1) && !s.move(-1) && s.piece.x === 1, 'stopped a column short of the wall by the copy');
  });

  test('mirror: a lock counts one piece (byType once) and the pair’s cells; the odd centre; where a piece appears', () => {
    const g = mk(10);
    const r = dropAt(g, 'O', 0);
    assert.strictEqual(r.placed, 8);
    assert.strictEqual(g.s.pieces, 1);
    assert.deepStrictEqual(g.s.byType, { O: 1 });
    assert.strictEqual(g.s.cells, 8);
    assert.strictEqual(g.board.count(), 8);
    // Odd width: a vertical I in the centre column is its own copy (4 cells); a T with its stem there shares one.
    const o = mk(11);
    const ri = dropAt(o, 'I', 5 - 2, 1);
    assert(ri.placed === 4 && o.s.cells === 4 && o.board.count() === 4, JSON.stringify(ri.cells));
    const ot = mk(11);
    const rt = dropAt(ot, 'T', 5, 0);
    assert.strictEqual(rt.placed, 7, 'a T with a block in the centre column shares it with its copy');
    assert.strictEqual(dropAt(mk(11), 'T', 4, 2).placed, 4, 'a T centred on the centre column is its own copy');
    // Across the line on an even width: an O on the two middle columns is its own copy.
    const e = mk(10);
    assert.strictEqual(dropAt(e, 'O', 4).placed, 4);
    // Spawn: centred in the left half; a piece wider than the half keeps the centred spot (and overlaps its copy).
    const spawnCols = (w, id) => { const t = mk(w, 20, 1); t.spawn({ id, rot: 0 }); return t.piece.type.rots[t.piece.rot].map(([cx]) => t.piece.x + cx).sort((a, b) => a - b); };
    assert.deepStrictEqual(spawnCols(10, 'T'), [1, 2, 2, 3]);
    assert.deepStrictEqual(spawnCols(10, 'I'), [0, 1, 2, 3]);
    assert.deepStrictEqual(spawnCols(10, 'O'), [1, 1, 2, 2]);
    assert.deepStrictEqual(spawnCols(11, 'T'), [1, 2, 2, 3]);
    assert.deepStrictEqual(spawnCols(20, 'T'), [3, 4, 4, 5]);
    assert.deepStrictEqual(spawnCols(4, 'T'), [0, 1, 1, 2], '4 wide: wider than the half, centred on the board');
    assert.deepStrictEqual(spawnCols(5, 'I'), [0, 1, 2, 3]);
    const t = mk(10, 20, 3);
    assert(t.piece.y === std(10, 20, 3).piece.y, 'at the same height as on a plain board');
  });

  test('mirror: twists read the piece’s own box; the copy is placed by the piece, never scored as one', () => {
    // A twist double slot on the left (and its mirror on the right): the T turned into it last spins (three corners
    // of its own box blocked, the copy not yet on the board), and its copy fills the mirrored slot: two rows clear.
    const g = mk(10);
    // Rows 0 and 1 full but for the slots: row 0 misses x 2 (and 7), row 1 misses 1..3 (and 6..8); overhangs at
    // (1, 2) and (3, 2) (and 6, 8). The T pointing down, its box at x 1, y 0: cells (2,0), (1,1), (2,1), (3,1).
    fillRows(g, 0, 0, [2, 7]);
    fillRows(g, 1, 1, [1, 2, 3, 6, 7, 8]);
    for (const x of [1, 3, 6, 8]) g.board.set(x, 2, 5);
    g.piece = { type: Pieces.TYPES.T, rot: 2, x: 1, y: 0, special: null, entry: { id: 'T', rot: 0 }, lastRot: true, kick: 0 };
    const r = g.lock();
    assert(r && r.twist && r.n === 2 && r.lines === 2 && r.placed === 8, JSON.stringify(r && { twist: r.twist, mini: r.mini, n: r.n, placed: r.placed }));
    assert.strictEqual(g.s.pieces, 1);
  });

  test('mirror: hold and replace find room for the pair: the copy never lands in blocks, and never passes through them', () => {
    // A band of blocks across the right half near the top: the copy of a piece at the top of the left half is in it.
    const g = mk(10);
    for (let y = 15; y < 20; y++) for (let x = 5; x < 10; x++) g.board.set(x, y, 4);
    g.piece = { type: Pieces.TYPES.O, rot: 0, x: 0, y: 8, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    g.hold = { id: 'I', rot: 0 };
    assert(g.holdPiece(), 'the held I comes in');
    const cells = g.absCells();
    assert(g.piece.type.id === 'I' && cells.every(([x, y]) => !g.board.get(x, y)), JSON.stringify(cells));
    assert(cells.every(([, y]) => y < 15), 'under the band: the copy cannot come through it from the top: ' + JSON.stringify(cells));
    // Replace: the own cells alone would fit flat at the floor (row 0), the copy's would not (blocks at 6, 7); the pair
    // goes where it fits.
    const r = mk(10);
    fillRows(r, 0, 1, [0, 1, 2, 3, 4, 8, 9]);
    r.piece = { type: Pieces.TYPES.O, rot: 0, x: 0, y: 0, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    assert(r.fitsAt(r.piece, 0, 0, 0));
    assert(r.replacePiece({ id: 'I' }));
    const rc = r.absCells();
    assert(rc.every(([x, y]) => !r.board.get(x, y)), 'the pair fits where it came in: ' + JSON.stringify(rc));
    assert(!rc.some(([x, y]) => (x === 6 || x === 7) && y < 2));
  });

  test('mirror: items act in pairs (Drill, Bomb, Black Hole, Laser, Patch), Tornado mirrors its shuffle, Settle and Trapdoor as ever', () => {
    // Drill: two bores.
    const d = mk(10);
    fillRows(d, 0, 3, [4, 5]);
    d.piece = { type: Pieces.get('M1'), rot: 0, x: 1, y: 10, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    d.setSpecial('drill');
    const rd = d.drop();
    assert(rd && rd.bits && rd.bits.length === 2, 'two bits');
    for (let y = 0; y < 4; y++) assert(!d.board.get(1, y) && !d.board.get(8, y), 'both columns bored');
    assert(symmetric(d.board));
    // Bomb: two blasts, one on each side; Full Blast counts one half.
    const b = mk(10);
    fillRows(b, 0, 4, [4, 5]);
    b.piece = { type: Pieces.get('M1'), rot: 0, x: 1, y: 12, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    b.setSpecial('bomb');
    const rb = b.drop();
    assert(rb.centers && key(rb.centers) === key([[1, 5], [8, 5]]), JSON.stringify(rb.centers));
    assert(symmetric(b.board));
    const half = rb.blast.filter(([x]) => x < 5).length;
    assert(half > 0 && rb.blast.length === 2 * half);
    assert.strictEqual(Combos.blocksOf('fullblast', rb.blast, b), half, 'Full Blast counts one half');
    assert.strictEqual(Combos.detect(rb, b).includes('fullblast'), half >= 10);
    // Odd width, a bomb in the centre column: one blast (its own mirror), counted as the larger half with the centre.
    const bo = mk(11);
    fillRows(bo, 0, 4, [0, 10]);
    bo.piece = { type: Pieces.get('M1'), rot: 0, x: 5, y: 12, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    bo.setSpecial('bomb');
    const rbo = bo.drop();
    assert(!rbo.centers, 'one centre: it is its own mirror');
    assert.strictEqual(Combos.blocksOf('fullblast', rbo.blast, bo), rbo.blast.filter(([x]) => x <= 5).length);
    assert(Combos.blocksOf('fullblast', rbo.blast, bo) > rbo.blast.length / 2, 'more than the plain half: a lone blast at the line is not undercounted');
    // Black Hole: two centres; Event Horizon counts one half.
    const h = mk(10);
    fillRows(h, 0, 6, [4, 5]);
    h.piece = { type: Pieces.get('M1'), rot: 0, x: 2, y: 12, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    h.setSpecial('blackhole');
    const rh = h.drop();
    assert(rh.centers && rh.centers.length === 2 && symmetric(h.board));
    assert.strictEqual(Combos.blocksOf('horizon', rh.swallowed, h), rh.swallowed.filter(([x]) => x < 5).length);
    // Laser: the rows the pair touches.
    const l = mk(10);
    fillRows(l, 0, 2, [0, 1, 8, 9]);
    l.piece = { type: Pieces.TYPES.O, rot: 0, x: 0, y: 12, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    l.setSpecial('laser');
    const rl = l.drop();
    assert(rl.laser && rl.laser.join() === '0,1' && symmetric(l.board), JSON.stringify(rl.laser));
    // Patch: into a covered hole only where its copy's hole is open too, in the same row.
    const p = mk(10);
    fillRows(p, 0, 3, [4, 5]);
    p.board.set(1, 1, 0); p.board.set(8, 1, 0);
    p.board.set(2, 2, 0);
    p.piece = { type: Pieces.get('M1'), rot: 0, x: 1, y: 12, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    p.setSpecial('patch');
    assert.strictEqual(p.patchTarget(p.piece), 1, 'both holes open in row 1');
    p.drop();
    assert(p.board.get(1, 1) && p.board.get(8, 1), 'both filled');
    const q = mk(10);
    fillRows(q, 0, 3, [4, 5]);
    q.board.set(2, 2, 0);
    q.piece = { type: Pieces.get('M1'), rot: 0, x: 2, y: 12, special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    q.setSpecial('patch');
    assert.strictEqual(q.patchTarget(q.piece), null, 'its copy’s cell is filled: it lands like a block');
    // Tornado: the left half shuffled, the right half its reflection; the centre of an odd width stays put.
    const { tornadoOrder } = L.Mirror;
    for (let w = 4; w <= 20; w++) {
      for (let k = 0; k < 20; k++) {
        const order = new L.RNG(w * 100 + k).shuffle([...Array(w).keys()]);
        const out = tornadoOrder(w, order);
        assert.strictEqual(new Set(out).size, w, 'every column once');
        for (let x = 0; x < w; x++) assert.strictEqual(out[w - 1 - x], w - 1 - out[x], 'mirrored');
        if (w % 2) assert.strictEqual(out[(w - 1) / 2], (w - 1) / 2);
        assert(out.some((c, i) => c !== i), 'never the same order');
      }
    }
    const t = mk(10, 20, 5);
    for (let x = 0; x < 5; x++) for (let y = 0; y <= x; y++) { t.board.set(x, y, 1 + x); t.board.set(9 - x, y, 1 + x); }
    t.piece.y = 15;
    assert(t.tornado() && symmetric(t.board), 'the board stays its own reflection');
    // Settle and Trapdoor: unchanged, and a symmetric board stays symmetric.
    const s = mk(10);
    s.board.set(0, 3, 2); s.board.set(9, 3, 2); s.board.set(3, 0, 1); s.board.set(6, 0, 1);
    s.piece.y = 15;
    assert(s.settle() && symmetric(s.board) && s.board.get(0, 0) === 2);
    assert(s.trapdoor() && symmetric(s.board));
  });

  test('mirror: 500 pieces at widths 4-20 with Patch, Tornado, Laser, Bomb, Drill, Black Hole, hold and Turnabout: the board stays its own reflection', () => {
    const rng = new L.RNG(4242);
    let pieces = 0, items = 0;
    const ITEMS = ['patch', 'tornado', 'laser', 'bomb', 'drill', 'blackhole', 'hold', 'turnabout', 'settle', 'trapdoor'];
    for (let w = 4; w <= 20; w++) {
      const g = mk(w, w < 6 ? 12 : 16, w * 7);
      for (let i = 0; i < 30; i++) {
        if (g.over) g.resetBoard();
        if (rng.next() < 0.35) {
          const it = ITEMS[rng.int(ITEMS.length)];
          let ok = null;
          if (it === 'tornado') ok = g.tornado();
          else if (it === 'hold') ok = g.holdPiece();
          else if (it === 'turnabout') ok = g.replacePiece({ id: Pieces.mirrorOf(g.piece.type).id, special: g.piece.special });
          else if (it === 'settle') ok = g.settle();
          else if (it === 'trapdoor') ok = g.trapdoor();
          else ok = g.setSpecial(it);
          if (ok) items++;
          assert(symmetric(g.board), w + ' wide, after ' + it);
          if (g.piece && !g.over) assert(g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y), 'the pair in play fits');
        }
        if (g.over || !g.piece) continue;
        for (let k = rng.int(4); k > 0; k--) g.rotate(1);
        const dx = rng.int(w) - g.piece.x;
        for (let k = 0; k < Math.abs(dx); k++) g.move(Math.sign(dx));
        const r = g.drop();
        if (r) pieces++;
        assert(symmetric(g.board), w + ' wide, piece ' + i + ': ' + JSON.stringify(r && { type: r.type, special: r.special }));
        if (g.piece && !g.over) assert(g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y), 'the next pair fits');
        // Undo, now and then: the board comes back, still symmetric.
        if (rng.next() < 0.05 && g.history.length) { g.undo(); assert(symmetric(g.board)); }
      }
      // Saved and resumed: the same pair, the same board.
      if (g.piece) {
        const again = new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())) });
        assert(again.recipe.mods.mirror && key(again.absCells()) === key(g.absCells()));
      }
    }
    assert(pieces >= 500 && items >= 100, pieces + ' pieces, ' + items + ' items');
  });

  test('mirror: Best Fit counts the pair', () => {
    // Four rows full but for column 0 and column 9: only an upright I there (with its copy) clears them.
    const g = mk(10);
    fillRows(g, 0, 3, [0, 9]);
    const best = g.bestFit();
    assert(best && best.id === 'I', JSON.stringify(best));
    const r = g.drop();
    assert(r && r.lines === 4 && r.quad && g.board.isEmpty(), JSON.stringify(r && { lines: r.lines }));
    // The same stack on a plain board: an I at column 0 alone clears nothing; the pair's quad is what Best Fit saw.
    const s = std(10);
    fillRows(s, 0, 3, [0, 9]);
    const sim = s.simulate(Pieces.TYPES.I, 1, -2, s.board);
    const msim = g.simulate(Pieces.TYPES.I, 1, -2, (() => { const t = mk(10); fillRows(t, 0, 3, [0, 9]); return t.board; })());
    assert(sim.n === 0 && sim.placed === 4 && msim.n === 4 && msim.placed === 8, JSON.stringify({ plain: [sim.n, sim.placed], mirror: [msim.n, msim.placed] }));
  });

  test('mirror: a single pays half a Standard single; a quad is a quad (R.quad 4) and pays half a Standard quad', () => {
    const single = (g) => { fillRows(g, 0, 0, g.recipe.mods.mirror ? [0, 1, 8, 9] : [0, 1]); const r = dropAt(g, 'O', 0); return { r, pay: Pay.clear({ mult: 1 }, r, g.rules).pay }; };
    const m = single(mk(10)), s = single(std(10));
    assert(m.r.lines === 1 && s.r.lines === 1 && m.r.own === 1);
    assert.strictEqual(m.pay, 0.5);
    assert.strictEqual(s.pay, 1);
    const quad = (g) => { fillRows(g, 0, 3, g.recipe.mods.mirror ? [0, 9] : [0]); const r = dropAt(g, 'I', -2, 1); return { r, pay: Pay.clear({ mult: 1 }, r, g.rules).pay }; };
    const mq = quad(mk(10)), sq = quad(std(10));
    assert(mq.r.quad && mq.r.n === 4 && sq.r.quad, 'a Mirror quad is a quad');
    assert.strictEqual(mk(10).rules.quad, 4);
    assert.strictEqual(mq.pay, 2.5);
    assert.strictEqual(sq.pay, 5);
    assert.strictEqual(mq.pay, sq.pay / 2);
    // What a row is worth in records and Earn: own × lk (own is Standard-comparable rows: the pair's cells / w).
    assert.strictEqual(L.Library.worth(mk(10)), 0.5);
    assert.strictEqual(L.Library.worth(mk(20)), 1);
  });

  test('mirror: quads only, never broken, per piece: a Mirror board never out-earns Standard at any width', () => {
    // A pair is 8 cells: after the same number of pieces, what quads have paid on Mirror w wide against Standard 10.
    const run = (w, mirror, pieces) => {
      const R = Recipe.rules(mirror ? MIRROR : {}, w), g = { w, rules: R, s: { b2b: -1 } }, per = mirror ? 8 : 4;
      let paid = 0, cells = 0;
      for (let i = 0; i < pieces; i++) {
        cells += per;
        if (cells >= 4 * w) { cells -= 4 * w; g.s.b2b++; g.s.mult = Pay.mult(g); paid += Pay.clear(g.s, { lines: 4, own: 4, quad: true }, R).pay; }
      }
      return paid;
    };
    for (let w = 4; w <= 20; w++) for (let n = 10; n <= 400; n += 10) {
      const here = run(w, true, n), base = run(10, false, n);
      assert(here <= base + 0.011, w + ' wide, ' + n + ' pieces: ' + here + ' vs ' + base);
    }
  });

  test('mirror: a streak bot (quads, streak, hold; the real controls) earns no more per piece or per action than on Standard', () => {
    // A tidy player (Dellacherie-style weights) that keeps the edge column open for an upright I (on Mirror both edges: the
    // copy fills the other), takes quads, holds a piece for later, and avoids small clears while the stack is low.
    const play = (g, n) => {
      let paid = 0;
      g.on('lock', (r) => { if (!r.lines) return; g.s.mult = Pay.mult(g); paid += Pay.clear(g.s, r, g.rules).pay; });
      const W = g.w, H = g.h, wells = g.recipe && g.recipe.mods.mirror ? [0, W - 1] : [0];
      const judge = (sim) => {
        const t = sim.board, hs = [];
        let rowT = 0, colT = 0, holes = 0, wellSum = 0, maxH = 0;
        for (let x = 0; x < W; x++) { let hh = 0; for (let y = H - 1; y >= 0; y--) if (t.get(x, y)) { hh = y + 1; break; } hs.push(hh); if (!wells.includes(x)) maxH = Math.max(maxH, hh); }
        for (let y = 0; y < H; y++) { let prev = 1; for (let x = 0; x < W; x++) { const f = t.get(x, y) ? 1 : 0; if (f !== prev) rowT++; prev = f; } if (!prev) rowT++; }
        for (let x = 0; x < W; x++) { let prev = 1; for (let y = 0; y < H; y++) { const f = t.get(x, y) ? 1 : 0; if (f !== prev) colT++; if (!f && y < hs[x]) holes++; prev = f; } }
        for (let x = 0; x < W; x++) { if (wells.includes(x)) continue; const d = Math.min(x ? hs[x - 1] : 99, x < W - 1 ? hs[x + 1] : 99) - hs[x]; if (d > 0 && d < 90) wellSum += d * (d + 1) / 2; }
        const lines = sim.n + sim.c, land = sim.abs.reduce((a, c) => a + c[1], 0) / sim.abs.length;
        let v = -4.5 * land + 3.4 * lines - 3.2 * rowT - 9.3 * colT - 7.9 * holes - 3.4 * wellSum;
        if (lines >= 4) v += 40;
        else if (maxH < 12) { if (sim.abs.some(([x]) => wells.includes(x))) v -= 40; v -= 6 * lines; }
        return v;
      };
      for (let i = 0; i < n && !g.over; i++) {
        const p = g.piece, alt = Pieces.get(g.hold ? g.hold.id : g.queue[0].id);
        let best = null;
        for (const [type, held] of [[p.type, false]].concat(alt && alt.id !== p.type.id ? [[alt, true]] : [])) {
          for (let rot = 0; rot < 4; rot++) {
            const b = type.rotBounds[rot];
            for (let x = -b.minX; x <= W - 1 - b.maxX; x++) {
              const sim = g.simulate(type, rot, x);
              if (!sim) continue;
              const v = judge(sim);
              if (!best || v > best.v) best = { v, rot, x, held };
            }
          }
        }
        if (!best || (best.held && !g.holdPiece())) break;
        for (let k = 0; k < best.rot; k++) g.rotate(1);
        for (let k = 0; k < W && g.piece.x !== best.x; k++) if (!g.move(Math.sign(best.x - g.piece.x))) break;
        g.drop();
      }
      const acts = g.s.moves + g.s.rotations + g.s.drops + g.s.lowers + g.s.holds;
      return { perPiece: paid / Math.max(1, g.s.pieces), perAct: paid / Math.max(1, acts), quads: g.s.clears[4] || 0, over: g.over };
    };
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
    const mean = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const run = (w, recipe) => SEEDS.map((seed) => play(new Game({ w, h: 20, seed, recipe }), 250));
    const base = run(10, {});
    const stdPiece = mean(base, 'perPiece'), stdAct = mean(base, 'perAct');
    assert(base.every((b) => b.quads >= 12 && !b.over), 'the bot plays long streaks of quads on Standard: ' + base.map((b) => b.quads));
    const fmt = (v) => v.toFixed(4);
    for (const w of [10, 11, 20]) {
      const m = run(w, MIRROR);
      assert(m.every((b) => b.quads >= 12), w + ' wide: the bot plays for quads there too (' + m.map((b) => b.quads) + ')');
      // Per action, against Standard at every width.
      assert(mean(m, 'perAct') <= stdAct, w + ' wide: ' + fmt(mean(m, 'perAct')) + ' an action vs Standard ' + fmt(stdAct));
      // Per piece: against Standard at every width (20 included), and never above a plain board of its own width up
      // to Standard (Mirror only ever takes away from what a size pays, js/library.js). Wider, a plain board pays less
      // for its easy streaks (Pay.mult); a Mirror board 20 wide is worth Standard a row (lk 1) and plays like one, so
      // Standard is its measure there (a plain board 20 wide now pays well under both: ~0.40 a piece vs ~0.50).
      const plain = w === 10 ? base : null;
      if (w === 20) { const p20 = mean(run(w, {}), 'perPiece'); assert(p20 <= stdPiece, 'a plain board 20 wide: ' + fmt(p20) + ' a piece vs Standard ' + fmt(stdPiece)); }
      if (plain) assert(mean(m, 'perPiece') <= mean(plain, 'perPiece'), w + ' wide: ' + fmt(mean(m, 'perPiece')) + ' a piece vs a plain board as wide ' + fmt(mean(plain, 'perPiece')));
      assert(mean(m, 'perPiece') <= stdPiece, w + ' wide: ' + fmt(mean(m, 'perPiece')) + ' a piece vs Standard ' + fmt(stdPiece));
    }
  });

  test('mirror: Butterfly (a spotless clear by hand on a Mirror board 20 wide) and the feats there', () => {
    const A = L.Achievements;
    const a = A.LIST.find((x) => x.id === 'butterfly');
    assert(a && a.name === 'Butterfly' && a.pay === 45 && a.group === 'play' && !/[\u{1F300}-\u{1FAFF}]/u.test(a.desc));
    const clear = (g) => { fillRows(g, 0, 1, [0, 1, g.w - 2, g.w - 1]); const r = dropAt(g, 'O', 0); return A.check(L.defaultState(), { mode: 'play', r, g }).map((x) => x.id); };
    const g20 = mk(20);
    const got = clear(g20);
    assert(g20.board.isEmpty() && got.includes('butterfly') && got.includes('pc'), got.join());
    assert(!clear(mk(10)).includes('butterfly') && !clear(mk(10)).includes('pc'), 'a Mirror board 10 wide: neither (wEff 5)');
    const s20 = std(20);
    fillRows(s20, 0, 1, [0, 1, 18, 19]);
    s20.board.set(18, 0, 1); s20.board.set(19, 0, 1); s20.board.set(18, 1, 1); s20.board.set(19, 1, 1);
    const rs = dropAt(s20, 'O', 0);
    const sg = A.check(L.defaultState(), { mode: 'play', r: rs, g: s20 }).map((x) => x.id);
    assert(rs.perfect && !sg.includes('butterfly') && sg.includes('pc'), 'a plain board 20 wide: Clean Slate only: ' + sg);
    // Not by hand: an item on the board.
    const gi = mk(20);
    gi.noteItem(false);
    assert(!clear(gi).includes('butterfly'));
  });

  test('mirror: the Free Play note says how lines and feats count on a Mirror board', () => {
    const note = L.Achievements.GROUPS.find((x) => x.id === 'play').note;
    const r = (w) => L.Recipe.rules(MIRROR, w);
    // A Mirror board counts half as wide: a line 20 wide is one Standard line, 10 wide half of one.
    assert.strictEqual(r(20).lk, 1);
    assert.strictEqual(r(10).lk, 0.5);
    assert(/on a Mirror board half that/.test(note), note);
    // Feats: not on a Mirror board 10 wide, yes on one 20 wide; the note says so.
    assert(!r(10).feats && r(20).feats && !r(19).feats);
    assert(/10 wide or more \(a Mirror board 20 wide\)/.test(note), note);
    assert(!/[\u{1F300}-\u{1FAFF}]/u.test(note));
  });

  test('mirror: the Turnabout power-up (id mirror) keeps its id; Mirror World keeps its name', () => {
    assert.strictEqual(L.ITEMS.mirror.name, 'Turnabout');
    assert.strictEqual(L.ITEMS.flip.name, 'Mirror World');
    assert(!Object.values(L.ITEMS).some((it) => it.name === 'Mirror'), 'no power-up is called Mirror');
  });
};
