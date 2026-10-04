// Mural's rules in Node (js/mural.js): the recipe (a mode after Battle; its picture and level; the level's size; Physics,
// Mirror and other shapes ruled out; kept for the board's life), the tiling (it covers the well exactly; in the order
// dealt each piece drops straight down into its place and rests there; no order can cycle), the quantisation (the same
// every time; the level's colours), the pictures, quarters that turn with the piece, a set anywhere but its place (or
// in another turn) refused and the piece left where it was, the piece appearing in another turn wherever that looks
// different and its place always reachable (by default one press of the single turn button away, placed turning only
// that way — clockwise, or counter-clockwise under Inverted Controls; both ways with Counter-clockwise puzzles on), the mural Finished, save and resume mid-mural, a photo imported from pixels,
// pay no faster than a Standard board per piece or per action, and the achievements.
// Run by test.cjs: require('./mural-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function muralUnit({ L, test }) {
  const { Game, Pieces, Recipe, Mural: M, RNG } = L;
  const R = (pic, level, own, set) => Recipe.normalize({ mode: 'mural', mural: Object.assign({ pic: pic || 'coast', level: level || 1 }, own ? { own } : {}), shapes: { preset: set || 'normal' } });
  const mk = (pic, level, seed, own) => { const r = R(pic, level, own), z = Recipe.clampSize({}, r); return new Game({ w: z.w, h: z.h, seed: seed == null ? 1 : seed, recipe: r }); };
  const X = (g) => M.extOf(g);
  /** Sets the piece in play in its place (as a player would: turned, moved, dropped from above). */
  const setIt = (g) => { const pc = X(g).current(g), q = pc.goals[0], p = g.piece; p.rot = q.rot; p.x = q.x; p.y = X(g).top(g) - 1 - p.type.rotBounds[q.rot].maxY; return g.drop(); };

  console.log('mural');

  test('mural: the recipe — a mode after Battle, its picture and level, its piece set, its label, any size (the level\'s by default), nothing else combined with it, kept for the board\'s life', () => {
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
    // The level's size by default; any size in SIZE asked for (6-20 wide, 8-36 tall).
    const sizes = [1, 2, 3, 4, 5].map((n) => Recipe.clampSize({}, R('coast', n)));
    assert.deepStrictEqual(sizes, [{ w: 8, h: 10 }, { w: 10, h: 14 }, { w: 12, h: 18 }, { w: 14, h: 22 }, { w: 16, h: 26 }]);
    assert.deepStrictEqual(Recipe.clampSize({ w: 4, h: 40 }, R('coast', 2)), { w: 6, h: 36 });
    assert.deepStrictEqual(Recipe.clampSize({ w: 13, h: 21 }, R('coast', 2)), { w: 13, h: 21 });
    // (6 rows: a board saved before sizes and the buffer still opens, grown by it.)
    assert.deepStrictEqual(Recipe.limits(R('coast', 3)), { w: [6, 20], h: [6, 36] });
    // The buffer: BUF rows over the picture (R.k, as Race's), the board that much taller; nothing set there.
    assert.strictEqual(Recipe.rules(R('coast', 3), 12).k, M.BUF);
    assert.strictEqual(mk('coast', 3).h, 18 + M.BUF);
    // Its piece set (Mixed, Normal, Pentominoes, Frantic; Normal by default) and no modifier, whatever was asked.
    const r = Recipe.normalize({ mode: 'mural', mods: { mirror: true, physics: true }, shapes: { preset: 'frantic' } });
    assert(!Object.values(r.mods).some(Boolean) && r.shapes.preset === 'frantic' && !r.physics, JSON.stringify(r));
    for (const set of M.SETS) assert.strictEqual(R('coast', 1, null, set).shapes.preset, set);
    assert.strictEqual(Recipe.normalize({ mode: 'mural', shapes: { preset: 'tiny' } }).shapes.preset, 'normal');
    assert.strictEqual(Recipe.label(R('still', 3, null, 'pentominoes')), 'Mural · Still life · Level 3 · Pentominoes');
    const c = Recipe.conflicts(R());
    for (const id of ['mods.physics=true', 'mods.mirror=true', 'shapes.preset=tiny', 'shapes.preset=big', 'shapes.preset=custom']) assert.strictEqual(c[id], 'Not in Mural', id);
    for (const set of M.SETS) assert(!c['shapes.preset=' + set], set);
    // Mixed is Mural's own (its chip shows only there): anywhere else it is Normal.
    assert.strictEqual(Recipe.normalize({ shapes: { preset: 'mixed' } }).shapes.preset, 'normal');
    assert.strictEqual(Recipe.resolve(R('coast', 1, null, 'mixed'), 'mode', {}).recipe.shapes.preset, 'mixed');
    // The last choice wins: Mural chosen with Mirror on turns Mirror off.
    const res = Recipe.resolve({ mode: 'mural', mods: { mirror: true } }, 'mode', {});
    assert(res.recipe.mode === 'mural' && !res.recipe.mods.mirror);
    const rules = Recipe.rules(R(), 8);
    assert(!rules.undo && !rules.hints && !rules.rated && rules.refuse.bomb === 'Not in Mural' && rules.refuse.rewind === 'Not in Mural');
    assert.strictEqual(Recipe.editConflicts(R(), R())['mode=plain'], 'A Mural board stays Mural');
    assert.strictEqual(M.PART.noEdit(R()), 'A mural keeps its picture');
  });

  /** Checks a plan: every cell of the picture covered once (a cell over it only within UP rows), every piece resting
   *  on the floor, earlier pieces or itself with nothing over it yet, the order topological, the sizes its set's. */
  const sound = (P, set, tag) => {
    const { W, H } = P, at = new Int32Array(W * H).fill(-1), sizes = { normal: [4], pentominoes: [5], frantic: [1, 2, 3, 4, 5], mixed: [1, 2, 3, 4] }[set];
    let small = 0;
    P.pieces.forEach((pc, k) => {
      if (!sizes.includes(pc.cells.length)) { assert.strictEqual(pc.cells.length, 1, tag + ': a ' + pc.cells.length + ' in ' + set); small++; }
      for (const [x, y] of pc.cells) {
        assert(x >= 0 && x < W && y >= 0 && y < H + M.UP, tag + ': in the picture, or just over it');
        if (y >= H) { assert(set !== 'mixed', 'Mixed stays in the picture'); continue; }
        assert.strictEqual(at[y * W + x], -1, tag + ': one piece a cell'); at[y * W + x] = k;
      }
    });
    assert(at.every((k) => k >= 0), tag + ': no gap');
    const filled = new Uint8Array(W * H);
    P.pieces.forEach((pc, k) => {
      const mine = new Set(pc.cells.map(([x, y]) => x + ',' + y));
      for (const [x, y] of pc.cells) {
        if (!mine.has(x + ',' + (y - 1))) assert(y === 0 || (y - 1 < H && filled[(y - 1) * W + x]), tag + ': supported: piece ' + k);
        for (let yy = y + 1; yy < H; yy++) if (!mine.has(x + ',' + yy)) assert(!filled[yy * W + x], tag + ': clear above: piece ' + k);
      }
      for (const [x, y] of pc.cells) if (y < H) filled[y * W + x] = 1;
      for (const [x, y] of pc.cells) if (y > 0 && y < H && !mine.has(x + ',' + (y - 1))) assert(at[(y - 1) * W + x] < k);
    });
    assert.strictEqual(small, P.fallbacks, tag + ': single blocks are the counted fallbacks');
    return small;
  };

  test('mural: the cut — every built-in picture at levels 1-5 in each set (Mixed, Normal, Pentominoes, Frantic) covers the picture exactly, bottom up, each piece dropping straight into its place; checked by playing it with the one turn button either way; the same cut for the same seed; fallbacks counted', () => {
    const rate = {};
    for (const set of M.SETS) {
      let pieces = 0, fb = 0;
      for (const pic of M.PICS) for (const level of [1, 2, 3, 4, 5]) {
        const seed = level * 31 + pic.length, lv = M.LEVELS[level], P = M.plan(R(pic, level, null, set), seed, lv.w, lv.h), tag = set + ' ' + pic + ' ' + level;
        assert.strictEqual(P.set, set);
        fb += sound(P, set, tag); pieces += P.pieces.length;
        const v = M.verify(P);
        assert(v.ok, tag + ': ' + v.why);
        // The same seed, the same cut (cut again from nothing).
        const again = M.cut(lv.w, lv.h, set === 'mixed' ? 'normal' : set, new L.RNG('d' + seed)), once = M.cut(lv.w, lv.h, set === 'mixed' ? 'normal' : set, new L.RNG('d' + seed));
        assert.deepStrictEqual(again.pieces, once.pieces);
      }
      rate[set] = fb + ' of ' + pieces;
      assert(fb / pieces < 0.01, set + ': fallbacks ' + rate[set]);
    }
    console.log('    fallbacks (single blocks where the set had no piece):', JSON.stringify(rate));
    // Mixed: the level's share of small pieces — more at 1, mostly tetrominoes at 5.
    const s4 = (level) => { const lv = M.LEVELS[level], P = M.plan(R('coast', level, null, 'mixed'), 1, lv.w, lv.h); return P.pieces.filter((p) => p.cells.length === 4).length / P.pieces.length; };
    assert(s4(1) < 0.35 && s4(5) > 0.45, s4(1) + ' ' + s4(5));
    // Pieces may reach over the picture (into the buffer), so its top row needs no exact small pieces.
    const lv = M.LEVELS[3], over = M.plan(R('coast', 3, null, 'pentominoes'), 5, lv.w, lv.h).pieces.filter((p) => p.cells.some(([, y]) => y >= lv.h)).length;
    assert(over > 0, 'some pentominoes reach over the picture');
  });

  test('mural: a fresh cut every time — 200 random seeds a set (pictures, sizes and levels in turn) all cut soundly and play through with the one turn button either way; the largest board plans in under half a second', () => {
    const rng = new L.RNG('many'), sizes = [[8, 10], [10, 14], [12, 18], [14, 22], [16, 26], [6, 8], [13, 21], [9, 30]];
    let n = 0, bad = 0;
    const firsts = new Set();
    for (const set of M.SETS) for (let i = 0; i < 200; i++) {
      const seed = rng.u32() >>> 0, pic = M.PICS[i % 3], level = (i % 5) + 1, [W, H] = sizes[i % sizes.length];
      const P = M.plan(R(pic, level, null, set), seed, W, H);
      sound(P, set, set + ' ' + pic + ' ' + W + 'x' + H + ' #' + seed);
      if (!P.check.ok) bad++;
      if (W === 16 && set === 'normal') firsts.add(JSON.stringify(P.pieces.slice(0, 6).map((p) => p.cells)));
      n++;
    }
    assert.strictEqual(bad, 0, bad + ' of ' + n + ' unsolvable');
    assert(firsts.size >= 20, 'different every time: ' + firsts.size);
    // Timing: the largest board, each set, cut and checked from nothing.
    const ms = {};
    for (const set of M.SETS) { const t0 = Date.now(); M.plan(R('soft', 5, null, set), 987654 + set.length, M.SIZE.w[1], M.SIZE.h[1]); ms[set] = Date.now() - t0; }
    const t1 = Date.now(); M.plan(R('soft', 5, null, 'pentominoes'), 4321, 16, 26); ms['16x26'] = Date.now() - t1;
    console.log('    plan ms (20 x 36 by set; 16 x 26 Pentominoes):', JSON.stringify(ms));
    assert(Object.values(ms).every((v) => v < 500), JSON.stringify(ms));
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
    // Darkest first (by OKLab lightness).
    const lum = (h) => { const o = [0, 0, 0], [r, g, b] = M.hexRgb(h); M.oklab(r, g, b, o, 0); return o[0]; };
    for (let i = 1; i < q1.pal.length; i++) assert(lum(q1.pal[i]) >= lum(q1.pal[i - 1]) - 0.005, q1.pal.join());
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
      t.rots[pc.rt].forEach(([cx, cy], i) => assert.deepStrictEqual(M.cellQ(pc, pc.rt, i), M.quartersAt(pic, P.H, pc.x + cx, Math.min(P.H - 1, pc.y + cy))));
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
        else assert(lookAlike || p.y === x.top(g) - 1 - p.type.rotBounds[p.rot].maxY, 'in its own turn only when every turn looks the same, or the top is full');
        assert(M.reach(g.board, p.type, { rot: p.rot, x: p.x, y: p.y }, pc.goals, x.turn()) >= 0, 'its place can be reached');
        assert(setIt(g));
      }
      assert.strictEqual(g.endKind, 'finished');
    }
    assert(other / total > 0.85, other + ' of ' + total);
  });

  /**
   * Can the piece in play reach its place with the engine's own moves and turns, turning only `turn` (1 or -1) and only
   * in place or nudged sideways off a wall (no kick down, up or across a gap)? Searched with g.move, g.rotate and a
   * row down; the piece is left where it was.
   */
  const oneWay = (g, pc, turn) => {
    const p = g.piece, at = [p.rot, p.x, p.y], maxKick = p.type.n >= 4 ? 2 : 1, key = (r, x, y) => r + ',' + x + ',' + y;
    const goal = new Set(pc.goals.map((q) => key(q.rot, q.x, q.y))), seen = new Set([key(...at)]), todo = [at];
    let ok = false;
    while (todo.length && !ok) {
      const [r, x, y] = todo.pop();
      if (goal.has(key(r, x, y))) { ok = true; break; }
      const put = () => { p.rot = r; p.x = x; p.y = y; };
      const add = () => { const k = key(p.rot, p.x, p.y); if (!seen.has(k)) { seen.add(k); todo.push([p.rot, p.x, p.y]); } };
      for (const dx of [-1, 1]) { put(); if (g.move(dx)) add(); }
      put(); if (g.fitsAt(p, r, x, y - 1)) { p.y--; add(); }
      put(); if (g.rotate(turn) && p.y === y && Math.abs(p.x - x) <= maxKick) add();
    }
    p.rot = at[0]; p.x = at[1]; p.y = at[2];
    return ok;
  };

  test('mural: one turn button places every piece, as in puzzles — clockwise, or counter-clockwise under Inverted Controls: each appears one press (at most two) of it from its place, reached turning only that way and never by a kick that hops it (every built-in picture, levels 1-5)', () => {
    for (const turn of [1, -1]) {
      let one = 0, two = 0, same = 0, total = 0, tops = 0;
      for (const pic of ['coast', 'still', 'soft']) for (let level = 1; level <= 5; level++) {
        const r = R(pic, level), z = Recipe.clampSize({}, r);
        const g = new Game({ w: z.w, h: z.h, seed: level * 7 + 1, recipe: r, muralTurn: turn }), x = X(g);
        assert.strictEqual(x.turn(), turn);
        // The Next tray shows each piece in the turn it will appear in.
        assert.strictEqual(g.queue[0].rot, M.prefOf(x.plan().pieces[1], turn)[0]);
        while (!g.over) {
          const pc = x.current(g), p = g.piece;
          total++;
          const n = M.presses(pc.goals, p.rot, turn);
          const lookAlike = [0, 1, 2, 3].every((q) => pc.goals.some((gq) => gq.rot === q));
          if (n === 1) one++; else if (n === 2) two++;
          else {
            // Its own turn only when every turn looks the same, or right over its place when no turn at the top reaches it.
            assert.strictEqual(n, 0, pic + ' ' + level + ': ' + n + ' presses');
            if (lookAlike) total--; else { assert.strictEqual(p.y, x.top(g) - 1 - p.type.rotBounds[p.rot].maxY); same++; }
          }
          // The picture's top rows: the buffer is open and the piece appears at its top, over the picture.
          const PH = x.plan().H;
          if (pc.cells.some(([, cy]) => cy >= PH - M.OPEN)) { assert(x.open(g), 'the buffer open for a top row'); tops++; }
          if (x.open(g)) assert.strictEqual(p.y + p.type.rotBounds[p.rot].maxY, g.h - 1, 'appears at the buffer\'s top');
          else assert(p.y + p.type.rotBounds[p.rot].maxY < PH, 'under a shut buffer');
          assert(M.reach(g.board, p.type, { rot: p.rot, x: p.x, y: p.y }, pc.goals, turn) >= 0, 'reached one way');
          assert(oneWay(g, pc, turn), pic + ' ' + level + ' piece ' + X(g).M.i + ': placed with the one turn button (' + turn + ')');
          assert(setIt(g));
        }
        assert.strictEqual(g.endKind, 'finished');
      }
      // None falls back to its own turn over its place (the look-alikes aside).
      assert(one / total > 0.95 && same === 0 && tops > 100, turn + ': ' + one + ' one press, ' + two + ' two, ' + same + ' none, of ' + total + '; ' + tops + ' at the top');
    }
    // The bot, turning only the one way, finishes too.
    const g = mk('soft', 4, 5);
    assert.strictEqual(X(g).turn(), 1, 'clockwise without a setting');
    assert(M.bot(g).done);
  });

  test('mural: the buffer opens once, at the very end (the top ' + M.OPEN + ' rows), and a piece can never be turned or moved into it while it is shut', () => {
    for (const [pic, level] of [['coast', 2], ['still', 3], ['soft', 4]]) {
      const g = mk(pic, level, 7), x = X(g), PH = x.plan().H;
      let flips = 0, was = x.open(g), firstOpenAt = -1;
      while (!g.over && g.piece) {
        const open = x.open(g);
        if (open !== was) { flips++; was = open; if (open) firstOpenAt = x.M.i; }
        if (!open) {
          // Every spot with a cell over the picture is refused while it is shut.
          const p = g.piece;
          for (let r = 0; r < 4; r++) for (let px = -2; px < g.w + 2; px++) {
            const cells = p.type.rots[r].map(([cx, cy]) => [px + cx, PH - p.type.rotBounds[r].minY + cy - p.type.rotBounds[r].minY]);
            if (cells.some(([, cy]) => cy >= PH)) assert(!g.fitsAt(p, r, px, PH - p.type.rotBounds[r].minY), pic + ': a cell over a shut buffer');
          }
        }
        assert(setIt(g), pic + ' ' + level + ': piece ' + x.M.i + ' set');
      }
      assert.strictEqual(flips, 1, pic + ': the buffer changed ' + flips + ' times');
      assert(firstOpenAt > 0, pic + ': shut at the start');
    }
  });
  test('mural: the buffer — shut while the stack is low, open (and staying open) once it nears the top; a board saved before it is grown, its stack and piece kept', () => {
    const g = mk('coast', 2, 4), x = X(g), PH = x.plan().H;
    let was = false, opened = -1;
    while (!g.over) {
      const o = x.open(g);
      assert(!was || o, 'stays open');
      if (o && !was) opened = g.board.stackHeight();
      was = o;
      assert(setIt(g));
    }
    assert(opened >= PH - M.BUF - 3 && opened <= PH, 'opens near the top: ' + opened);
    // A save from before sizes, sets and the buffer (v 1): the board as tall as the level's picture, cut as then (Mixed,
    // the level's size, whatever the recipe's set says); it opens with the buffer added and plays on to the end.
    const h = mk('still', 1, 3), lv1 = M.LEVELS[1];
    const j = JSON.parse(JSON.stringify(h.toJSON()));
    const P1 = M.plan(R('still', 1), 3, lv1.w, lv1.h, 1);
    assert.strictEqual(P1.set, 'mixed');
    j.h = lv1.h; j.cells = new Array(j.w * lv1.h).fill(0); j.x.mural = { v: 1, seed: 3, i: 0 };
    j.piece = null; j.queue = P1.pieces.map((p) => ({ id: p.id, rot: p.pref[0] }));
    assert(L.Library.playable(j), 'an old save still opens');
    const back = new Game({ saved: j });
    assert.strictEqual(back.h, lv1.h + M.BUF);
    assert.strictEqual(X(back).plan(), P1);
    if (!back.piece) back.spawnNext();
    assert.strictEqual(back.piece.type.id, P1.pieces[0].id);
    while (!back.over) assert(setIt(back));
    assert.strictEqual(back.endKind, 'finished');
  });

  test('mural: a board of its own size and set — Pentominoes on 13 × 21 (the picture drawn at 26 × 42 quarters): what reaches over the picture is trimmed as it sets; saved and resumed mid-way exactly; started over, it is cut anew', () => {
    const r = R('coast', 4, null, 'pentominoes'), g = new Game({ w: 13, h: 21, seed: 99, recipe: r }), x = X(g), P = x.plan();
    assert(P.W === 13 && P.H === 21 && g.h === 21 + M.BUF && P.pic.QW === 26 && P.pic.QH === 42 && P.set === 'pentominoes');
    let trimmed = 0;
    for (let k = 0; k < 20; k++) { const res = setIt(g); assert(res); if (res.trimmed) trimmed += res.trimmed.length; }
    const j = JSON.parse(JSON.stringify(g.toJSON())), back = new Game({ saved: j });
    assert.strictEqual(X(back).plan().pieces.map((p) => p.id).join(), P.pieces.map((p) => p.id).join(), 'the same cut');
    assert.strictEqual(back.piece.type.id, g.piece.type.id);
    assert.deepStrictEqual(Recipe.summary(j).mural, { pic: 'coast', level: 4, placed: 20, total: P.pieces.length, done: false });
    while (!back.over) { const res = setIt(back); assert(res); if (res.trimmed) trimmed += res.trimmed.length; }
    assert(back.endKind === 'finished' && trimmed > 0, 'trimmed ' + trimmed);
    for (let y = 21; y < back.h; y++) for (let xx = 0; xx < 13; xx++) assert(!back.board.get(xx, y), 'nothing left over the picture');
    // Started over: a fresh seed, a fresh cut.
    const seed0 = x.M.seed;
    g.resetBoard();
    if (!g.piece) g.spawnNext();
    assert(x.M.seed !== seed0 && x.M.i === 0 && x.plan() !== P, 'cut anew');
    while (!g.over) assert(setIt(g));
    assert.strictEqual(g.endKind, 'finished');
  });

  test('mural: with Settings ▸ Controls ▸ Counter-clockwise puzzles on (turn 0), pieces appear turned either way or a half turn, every place reachable', () => {
    const seen = { 1: 0, '-1': 0, 2: 0 };
    let total = 0;
    for (const pic of ['coast', 'still', 'soft']) for (const level of [1, 3, 5]) {
      const r = R(pic, level), z = Recipe.clampSize({}, r);
      const g = new Game({ w: z.w, h: z.h, seed: level, recipe: r, muralTurn: 0 }), x = X(g);
      assert.strictEqual(x.turn(), 0);
      while (!g.over) {
        const pc = x.current(g), p = g.piece;
        total++;
        const cw = M.presses(pc.goals, p.rot, 1);
        if (cw === 1) seen[1]++; else if (cw === 3) seen[-1]++; else if (cw === 2) seen[2]++;
        assert(M.reach(g.board, p.type, { rot: p.rot, x: p.x, y: p.y }, pc.goals, 0) >= 0);
        assert(setIt(g));
      }
    }
    assert(seen[1] > total * 0.3 && seen[-1] > total * 0.3, JSON.stringify(seen) + ' of ' + total);
    // The setting is read through the view's hook, and only a game's own muralTurn outranks it.
    M.setTurnMode(() => 0);
    try { assert.strictEqual(X(mk('coast', 1, 1)).turn(), 0); } finally { M.setTurnMode(null); }
    assert.strictEqual(X(mk('coast', 1, 1)).turn(), 1);
  });

  test('mural: Finished once the last piece is set (kept in the save; no piece after it); the Next pieces is the mural\'s own, counting down', () => {
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
    // Every cell of the picture is set, each a picture's block; the buffer over it is empty.
    const PH = x.plan().H;
    assert(g.board.cells.every((v, i) => (i < g.w * PH) === (v !== 0)));
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
    const lv = M.LEVELS[3], own = M.fromPixels(px, w, hh, lv.w, lv.h, lv.pk);
    assert.strictEqual(own.w, 24); assert.strictEqual(own.h, 36); assert.strictEqual(own.px.length, 24 * 36);
    assert(M.ownOk(own) && own.pal.length >= 3 && own.pal.length <= lv.pk);
    assert.deepStrictEqual(M.fromPixels(px, w, hh, lv.w, lv.h, lv.pk), own, 'the same every time');
    const r = R('own', 3, own);
    assert.strictEqual(r.mural.pic, 'own');
    assert(JSON.stringify(r).length < 2400, 'small');
    const pic = M.picture(r), top = pic.pal[pic.q[2 * pic.QW + 2]], bottom = pic.pal[pic.q[(pic.QH - 2) * pic.QW + 2]];
    const [tr, , tb] = M.hexRgb(top), [br, bg] = M.hexRgb(bottom);
    assert(tb > tr && bg > br, top + ' ' + bottom);
    // At another level it is resampled and, with fewer colours, quantised again.
    const r1 = R('own', 1, own), p1 = M.picture(r1);
    assert(p1.QW === 16 && p1.QH === 20 && p1.pal.length <= M.LEVELS[1].pk);
    const g = mk('own', 3, 2, own);
    while (!g.over) assert(setIt(g));
    assert.strictEqual(g.endKind, 'finished');
  });

  test('mural: a photo keeps its own colours — on generated photos (primaries, skin tones, a face, a street, a small vivid flower on a dull field) the error, the chroma kept and every feature colour meet their marks at levels 1, 3 and 5', () => {
    const PH = require('./mural-photos.cjs');
    // Per level: the most mean OKLab error a quarter, the least chroma kept on vivid quarters (and never oversaturated),
    // the farthest any feature colour (a primary, the flower, the door, the car, the wall) may be from the palette.
    const MARK = { 1: { err: 0.055, chroma: 0.84, feat: 0.11 }, 3: { err: 0.018, chroma: 0.89, feat: 0.07 }, 5: { err: 0.013, chroma: 0.95, feat: 0.03 } };
    const seen = [];
    for (const name of Object.keys(PH.PHOTOS)) for (const level of [1, 3, 5]) {
      const lv = M.LEVELS[level], w = lv.w * 24, hh = lv.h * 24, px = PH.photo(name, w, hh);
      const own = M.fromPixels(px, w, hh, lv.w, lv.h, lv.pk), m = PH.measure(own, px, w, hh, PH.FEATS[name]), k = MARK[level];
      seen.push(name + level + ' ' + m.err.toFixed(4) + ' ' + m.chroma.toFixed(3) + ' ' + m.worst.toFixed(3));
      assert(M.ownOk(own) && own.pal.length <= lv.pk, name + level);
      assert(m.err <= k.err && m.chroma >= k.chroma && m.chroma <= 1.05 && m.worst <= k.feat, seen[seen.length - 1]);
    }
    // A colour is drawn exactly as kept: the picture's palette is the grid's own.
    const lv = M.LEVELS[3], own = M.fromPixels(PH.photo('small', 288, 432), 288, 432, lv.w, lv.h, lv.pk);
    assert.deepStrictEqual(M.picture(R('own', 3, own)).pal, own.pal);
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
