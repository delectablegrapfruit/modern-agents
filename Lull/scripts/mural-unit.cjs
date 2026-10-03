// Mural's rules in Node (js/mural.js): the recipe (a mode after Battle; its picture and level; the level's size; Physics,
// Mirror and other shapes ruled out; kept for the board's life), the tiling (it covers the well exactly; in the order
// dealt each piece drops straight down into its place and rests there; no order can cycle), the quantisation (the same
// every time; the level's colours), the pictures, quarters that turn with the piece, a set anywhere but its place (or
// in another turn) refused and the piece left where it was, the piece appearing in another turn wherever that looks
// different and its place always reachable, the mural Finished, save and resume mid-mural, a photo imported from pixels,
// pay no faster than a Standard board per piece or per action, and the achievements.
// Run by test.cjs: require('./mural-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function muralUnit({ L, test }) {
  const { Game, Pieces, Recipe, Mural: M, RNG } = L;
  const R = (pic, level, own) => Recipe.normalize({ mode: 'mural', mural: Object.assign({ pic: pic || 'coast', level: level || 1 }, own ? { own } : {}) });
  const mk = (pic, level, seed, own) => { const r = R(pic, level, own), z = Recipe.clampSize({}, r); return new Game({ w: z.w, h: z.h, seed: seed == null ? 1 : seed, recipe: r }); };
  const X = (g) => M.extOf(g);
  /** Sets the piece in play in its place (as a player would: turned, moved, dropped from above). */
  const setIt = (g) => { const pc = X(g).current(g), q = pc.goals[0], p = g.piece; p.rot = q.rot; p.x = q.x; p.y = g.h - 1 - p.type.rotBounds[q.rot].maxY; return g.drop(); };

  console.log('mural');

  test('mural: the recipe — a mode after Battle, its picture and level, its label, the level\'s size, nothing combined with it, kept for the board\'s life', () => {
    const modes = Recipe.options().find((o) => o.path === 'mode').values;
    assert(modes.includes('mural') && modes.indexOf('mural') === modes.length - 1, modes.join());
    assert.deepStrictEqual(Recipe.normalize({ mode: 'mural' }).mural, { pic: 'coast', level: 2 });
    assert.deepStrictEqual(R('soft', 5).mural, { pic: 'soft', level: 5 });
    assert.deepStrictEqual(Recipe.normalize({ mode: 'mural', mural: { pic: 'x', level: 9 } }).mural, { pic: 'coast', level: 2 });
    // A photo with no grid (or a broken one) is not a photo.
    assert.strictEqual(Recipe.normalize({ mode: 'mural', mural: { pic: 'own', level: 1 } }).mural.pic, 'coast');
    assert.strictEqual(Recipe.normalize({ mode: 'mural', mural: { pic: 'own', level: 1, own: { w: 2, h: 2, pal: ['#000000'], px: '0001' } } }).mural.pic, 'coast');
    assert.strictEqual(Recipe.normalize({}).mural, undefined);
    assert.strictEqual(Recipe.label(R('still', 3)), 'Mural · Still life · Level 3');
    assert.strictEqual(Recipe.label(R('still', 3), true), 'Mural');
    const sizes = [1, 2, 3, 4, 5].map((n) => Recipe.clampSize({ w: 4, h: 40 }, R('coast', n)));
    assert.deepStrictEqual(sizes, [{ w: 8, h: 10 }, { w: 10, h: 14 }, { w: 12, h: 18 }, { w: 14, h: 22 }, { w: 16, h: 26 }]);
    assert.deepStrictEqual(Recipe.limits(R('coast', 3)), { w: [12, 12], h: [18, 18] });
    // Normal shapes and no modifier, whatever was asked.
    const r = Recipe.normalize({ mode: 'mural', mods: { mirror: true, physics: true }, shapes: { preset: 'frantic' } });
    assert(!Object.values(r.mods).some(Boolean) && r.shapes.preset === 'normal' && !r.physics, JSON.stringify(r));
    const c = Recipe.conflicts(R());
    for (const id of ['mods.physics=true', 'mods.mirror=true', 'shapes.preset=frantic']) assert.strictEqual(c[id], 'Not in Mural', id);
    // The last choice wins: Mural chosen with Mirror on turns Mirror off.
    const res = Recipe.resolve({ mode: 'mural', mods: { mirror: true } }, 'mode', {});
    assert(res.recipe.mode === 'mural' && !res.recipe.mods.mirror);
    const rules = Recipe.rules(R(), 8);
    assert(!rules.undo && !rules.hints && !rules.rated && rules.refuse.bomb === 'Not in Mural' && rules.refuse.rewind === 'Not in Mural');
    assert.strictEqual(Recipe.editConflicts(R(), R())['mode=plain'], 'A Mural board stays Mural');
    assert.strictEqual(M.PART.noEdit(R()), 'A mural keeps its picture');
  });

  test('mural: the tiling covers the well exactly, bottom up; each piece, in the order dealt, drops straight down into its place and rests there (no cycle)', () => {
    for (const level of [1, 2, 3, 4, 5]) for (const seed of [1, 2, 3, 77, 4242]) {
      const lv = M.LEVELS[level], P = M.plan(R('coast', level), seed), W = lv.w, H = lv.h;
      const at = new Int32Array(W * H).fill(-1);
      P.pieces.forEach((pc, k) => { assert(pc.cells.length >= 1 && pc.cells.length <= 4); for (const [x, y] of pc.cells) { assert(x >= 0 && x < W && y >= 0 && y < H); assert.strictEqual(at[y * W + x], -1, 'one piece a cell'); at[y * W + x] = k; } });
      assert(at.every((k) => k >= 0), 'no gap');
      // In order: every cell under a piece is filled (or the floor), every cell over it in its columns is empty.
      const filled = new Uint8Array(W * H);
      P.pieces.forEach((pc, k) => {
        const mine = new Set(pc.cells.map(([x, y]) => x + ',' + y));
        for (const [x, y] of pc.cells) {
          if (!mine.has(x + ',' + (y - 1))) assert(y === 0 || filled[(y - 1) * W + x], 'supported: piece ' + k);
          for (let yy = y + 1; yy < H; yy++) if (!mine.has(x + ',' + yy)) assert(!filled[yy * W + x], 'clear above: piece ' + k);
        }
        for (const [x, y] of pc.cells) filled[y * W + x] = 1;
      });
      // The order is a topological one: a piece never comes before one under it (so no order of them can cycle).
      P.pieces.forEach((pc, k) => { for (const [x, y] of pc.cells) if (y > 0 && at[(y - 1) * W + x] !== k) assert(at[(y - 1) * W + x] < k); });
      // The level's mix: more small pieces at 1, mostly tetrominoes at 5.
      if (seed === 1) {
        const share4 = P.pieces.filter((p) => p.cells.length === 4).length / P.pieces.length;
        if (level === 1) assert(share4 < 0.35, share4); else if (level === 5) assert(share4 > 0.45, share4);
      }
    }
  });

  test('mural: the pictures — drawn the same every time, in the level\'s colours (3 to 10), twice the board\'s size each way; the quantisation is deterministic', () => {
    for (const pic of M.PICS) for (const level of [1, 3, 5]) {
      const a = M.picture(R(pic, level)), lv = M.LEVELS[level];
      assert.strictEqual(a.QW, lv.w * 2); assert.strictEqual(a.QH, lv.h * 2);
      assert(a.pal.length >= Math.min(3, lv.k) && a.pal.length <= lv.k, pic + level + ': ' + a.pal.length);
      assert(a.q.every((v) => v < a.pal.length));
      // Drawn again from nothing: the same.
      const rgb = M.render(pic, a.QW, a.QH), b = M.toKeys(rgb, a.QW * a.QH, M.KEYS[pic], lv.k);
      assert.deepStrictEqual(b.pal, a.pal); assert.deepStrictEqual(Array.from(b.idx), Array.from(a.q));
    }
    // Any pixels: the same answer twice, at most K colours, darkest first.
    const rng = new RNG('q'), n = 600, px = new Float64Array(n * 3);
    for (let i = 0; i < n * 3; i++) px[i] = Math.floor(rng.next() * 256);
    const q1 = M.quantise(px, n, 6), q2 = M.quantise(px.slice(), n, 6);
    assert.deepStrictEqual(q1.pal, q2.pal); assert.deepStrictEqual(Array.from(q1.idx), Array.from(q2.idx));
    assert(q1.pal.length === 6);
    const lum = (h) => { const [r, g, b] = M.hexRgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    for (let i = 1; i < q1.pal.length; i++) assert(lum(q1.pal[i]) >= lum(q1.pal[i - 1]) - 12, q1.pal.join());
    // A picture of two colours keeps exactly those.
    const two = new Float64Array(n * 3); for (let i = 0; i < n; i++) { const c = i % 3 ? [200, 40, 40] : [20, 60, 200]; two.set(c, i * 3); }
    assert.deepStrictEqual(M.quantise(two, n, 5).pal.sort(), ['#143cc8', '#c82828']);
  });

  test('mural: quarters turn with the piece; the piece in play shows its place\'s quarters only in its place\'s turn', () => {
    assert.deepStrictEqual(M.turnQ([0, 1, 2, 3], 1), [2, 0, 3, 1]);
    assert.deepStrictEqual(M.turnQ([0, 1, 2, 3], 4), [0, 1, 2, 3]);
    assert.deepStrictEqual(M.turnQ(M.turnQ([0, 1, 2, 3], 1), 3), [0, 1, 2, 3]);
    const g = mk('still', 4, 9), P = X(g).plan(), pic = P.pic;
    let checked = 0;
    for (const pc of P.pieces) {
      const t = Pieces.get(pc.id);
      // At its own turn each cell shows the picture's quarters where it belongs.
      t.rots[pc.rt].forEach(([cx, cy], i) => assert.deepStrictEqual(M.cellQ(pc, pc.rt, i), M.quartersAt(pic, g.h, pc.x + cx, pc.y + cy)));
      // A quarter turn later the same cell's quarters are turned a quarter clockwise.
      for (let i = 0; i < pc.cells.length; i++) assert.deepStrictEqual(M.cellQ(pc, (pc.rt + 1) % 4, i), M.turnQ(pc.qt[i], 1));
      checked++;
    }
    assert(checked > 50);
  });

  test('mural: a set anywhere but its place, or in another turn, does not happen (the piece stays where it was, nothing changes)', () => {
    const g = mk('coast', 2, 5);
    for (let k = 0; k < 6; k++) setIt(g);
    const x = X(g), pc = x.current(g), p = g.piece, before = g.board.cells.slice(), placed = x.M.i;
    // Another column.
    const q = pc.goals[0];
    const other = [-2, -1, 1, 2].map((d) => q.x + d).find((xx) => g.fitsAt(p, q.rot, xx, g.h - 1 - p.type.rotBounds[q.rot].maxY));
    p.rot = q.rot; p.x = other; p.y = g.h - 1 - p.type.rotBounds[q.rot].maxY;
    const y0 = p.y;
    assert.strictEqual(g.drop(), false);
    assert.strictEqual(g.piece, p); assert.strictEqual(p.y, y0, 'a refused drop leaves it where it was');
    assert.deepStrictEqual(Array.from(g.board.cells), Array.from(before)); assert.strictEqual(x.M.i, placed);
    // Lowered onto something, out of place: still in play.
    while (g.fitsAt(p, p.rot, p.x, p.y - 1)) g.lower();
    assert.strictEqual(g.lower(), false); assert.strictEqual(g.piece, p);
    // Its place, in a turn that looks different: refused.
    let found = 0;
    for (const P2 of [X(g).plan()]) for (const c of P2.pieces) for (let r = 0; r < 4; r++) if (!c.goals.some((gq) => gq.rot === r)) found++;
    assert(found > 0);
    const wrongRot = [0, 1, 2, 3].find((r) => !pc.goals.some((gq) => gq.rot === r) && p.type.keys[r] === p.type.keys[q.rot]);
    if (wrongRot != null) {
      const b = p.type.rotBounds, wx = q.x + b[q.rot].minX - b[wrongRot].minX, wy = q.y + b[q.rot].minY - b[wrongRot].minY;
      p.rot = wrongRot; p.x = wx; p.y = wy;
      assert.strictEqual(g.lock(), false, 'same cells, quarters turned: refused');
    }
    // In its place: set.
    p.rot = q.rot; p.x = q.x; p.y = q.y;
    const res = g.lock();
    assert(res && res.mural && res.mural.k === placed && res.lines === 0);
    assert.strictEqual(x.M.i, placed + 1);
    // No row ever clears.
    assert.deepStrictEqual(g.fullRows(), []);
  });

  test('mural: each piece appears at the top in another turn than its place whenever that looks different, and its place can always be reached', () => {
    let other = 0, total = 0;
    for (const [pic, level, seed] of [['coast', 1, 1], ['still', 3, 2], ['soft', 5, 3], ['coast', 5, 11]]) {
      const g = mk(pic, level, seed), x = X(g);
      while (!g.over) {
        const pc = x.current(g), p = g.piece;
        assert(pc, 'a piece in play');
        total++;
        const lookAlike = [0, 1, 2, 3].every((r) => pc.goals.some((q) => q.rot === r));
        if (!pc.goals.some((q) => q.rot === p.rot)) other++;
        else assert(lookAlike || p.y === g.h - 1 - p.type.rotBounds[p.rot].maxY, 'in its own turn only when every turn looks the same, or the top is full');
        assert(M.reach(g.board, p.type, { rot: p.rot, x: p.x, y: p.y }, pc.goals) >= 0, 'its place can be reached');
        assert(setIt(g));
      }
      assert.strictEqual(g.endKind, 'finished');
    }
    assert(other / total > 0.85, other + ' of ' + total);
  });

  test('mural: Finished once the last piece is set (kept in the save; no piece after it); the Next queue is the mural\'s own, counting down', () => {
    const g = mk('soft', 1, 4), x = X(g), n = x.plan().pieces.length;
    assert(g.fixed && g.queue.length === n - 1 && g.queue.every((e, i) => e.id === x.plan().pieces[i + 1].id));
    let ended = 0;
    g.on('topout', () => ended++);
    for (let k = 0; k < n; k++) assert(setIt(g));
    assert(g.over && g.endKind === 'finished' && ended === 1 && !g.piece && x.M.i === n);
    const back = new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())) });
    assert(back.over && back.endKind === 'finished');
    assert.deepStrictEqual(Recipe.summary(g).mural, { pic: 'soft', level: 1, placed: n, total: n, done: true });
    assert.deepStrictEqual(Recipe.summary(g.toJSON()).mural, { pic: 'soft', level: 1, placed: n, total: n, done: true });
    // Every cell is set, each a picture's block.
    assert(g.board.cells.every((v) => v !== 0));
  });

  test('mural: saved and resumed mid-mural: the same piece in play, the same queue, the same plan; it plays on to the end', () => {
    const g = mk('still', 2, 6);
    for (let k = 0; k < 17; k++) setIt(g);
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    assert(Recipe.valid(json) && L.Library.playable(json));
    const b = new Game({ saved: json });
    assert.deepStrictEqual(Array.from(b.board.cells), Array.from(g.board.cells));
    assert.strictEqual(X(b).M.i, 17); assert.strictEqual(b.piece.type.id, g.piece.type.id); assert.deepStrictEqual([b.piece.rot, b.piece.x, b.piece.y], [g.piece.rot, g.piece.x, g.piece.y]);
    assert.deepStrictEqual(b.queue.map((e) => e.id), g.queue.map((e) => e.id));
    assert(b.fixed && b.mods.noHold);
    while (!b.over) assert(setIt(b));
    assert.strictEqual(b.endKind, 'finished');
    // A saved mural with a broken state is not resumed.
    const bad = JSON.parse(JSON.stringify(json)); bad.x.mural.i = 9999;
    assert(!Recipe.valid(bad));
    // A piece of the mural is known by its id alone (a reload rebuilds it).
    const id = g.piece.type.id; Pieces.evict(id); delete Pieces.TYPES[id];
    assert(Pieces.get(id) && Pieces.get(id).id === id);
  });

  test('mural: a photo — pixels cropped to the board\'s shape, box-averaged to quarters, quantised; kept as its small grid only; a mural from it plays to the end', () => {
    // A test picture 90 × 120: a blue sky, a green field, a red disc.
    const w = 90, hh = 120, px = new Uint8ClampedArray(w * hh * 4);
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, sun = (x - 60) ** 2 + (y - 35) ** 2 < 15 * 15;
      const c = sun ? [220, 50, 40] : y < 70 ? [90, 150, 230] : [60, 160, 70];
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
    const lv = M.LEVELS[3], own = M.fromPixels(px, w, hh, lv.w, lv.h, lv.k);
    assert.strictEqual(own.w, 24); assert.strictEqual(own.h, 36); assert.strictEqual(own.px.length, 24 * 36);
    assert(M.ownOk(own) && own.pal.length >= 3 && own.pal.length <= lv.k);
    assert.deepStrictEqual(M.fromPixels(px, w, hh, lv.w, lv.h, lv.k), own, 'the same every time');
    const r = R('own', 3, own);
    assert.strictEqual(r.mural.pic, 'own');
    assert(JSON.stringify(r).length < 2400, 'small');
    const pic = M.picture(r), top = pic.pal[pic.q[2 * pic.QW + 2]], bottom = pic.pal[pic.q[(pic.QH - 2) * pic.QW + 2]];
    const [tr, , tb] = M.hexRgb(top), [br, bg] = M.hexRgb(bottom);
    assert(tb > tr && bg > br, top + ' ' + bottom);
    // At another level it is resampled and, with fewer colours, quantised again.
    const r1 = R('own', 1, own), p1 = M.picture(r1);
    assert(p1.QW === 16 && p1.QH === 20 && p1.pal.length <= 3);
    const g = mk('own', 3, 2, own);
    while (!g.over) assert(setIt(g));
    assert.strictEqual(g.endKind, 'finished');
  });

  test('mural: pay — a little for each block set, never more per piece or per action than a careful bot on a Standard board', () => {
    const std = L.Descent.bot(new Game({ w: 10, h: 20, seed: 5 }), { pieces: 400 });
    let pp = 0, pa = 0;
    for (const level of [1, 3, 5]) for (const pic of M.PICS) {
      const r = M.bot(mk(pic, level, level * 7));
      assert(r.done, pic + level);
      pp = Math.max(pp, r.perPiece); pa = Math.max(pa, r.perAct);
    }
    assert(pp < std.perPiece && pa < std.perAct, JSON.stringify({ pp, pa, std: { perPiece: std.perPiece, perAct: std.perAct } }));
    assert(pp <= 4 * M.PAY_CELL + 1e-9);
  });

  test('mural: the achievements — the first mural, each level, one from a photo', () => {
    const A = L.Achievements, st = L.defaultState();
    const got = (e) => A.check(st, Object.assign({ mode: 'mural' }, e)).map((a) => a.id);
    assert.deepStrictEqual(got({ kind: 'placed' }), []);
    assert.deepStrictEqual(got({ kind: 'finished', pic: 'coast', level: 3 }).sort(), ['mu_first', 'mu_l3']);
    assert.deepStrictEqual(got({ kind: 'finished', pic: 'own', level: 5 }).sort(), ['mu_l5', 'mu_own']);
    assert(A.LIST.filter((a) => a.group === 'mural').length === 7);
  });
};
