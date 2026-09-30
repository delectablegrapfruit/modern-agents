// Jelly (js/jelly.js): pieces set on the grid become bodies that keep their shape and never lose a mino but to a clear;
// bands clear whole minos at the threshold and split what they cross; hard drops knock the stack about and soft drops
// do not; the save, a resumed board and Undo keep the exact state; items; Mirror, Shapes, Classic and Protect with
// Jelly; the cost is bounded (and nothing is spent at rest); and fairness (bots never earn more per piece or per action
// than a Standard board, or a Normal board of the width).
// Run by test.cjs: require('./jelly-test.cjs')(test).
'use strict';
const assert = require('assert');

module.exports = function jellyTests(test) {
  const L = globalThis.Lull;
  const { Game, Recipe, CELL, Pieces, Library, Pay, Chain, Jelly, Achievements } = L;
  const JELLY = Recipe.normalize({ mods: { jelly: true } });
  const jelly = (o) => new Game(Object.assign({ w: 10, h: 20, seed: 1, recipe: JELLY }, o));
  const W = (g) => Jelly.of(g);
  /** Every mino of every body: { id, x, y, v } (centres). */
  const minos = (g) => W(g).bodies.flatMap((b) => Array.from({ length: b.m }, (_, k) => ({ id: b.id, x: b.cx(k), y: b.cy(k), v: b.v[k] })));
  /** The piece in play made `id`, turned rot, its box at column x, and hard dropped from row y (the top by default). */
  const dropAt = (g, id, x, rot, special, y) => { g.piece = { type: Pieces.get(id), rot: rot || 0, x, y: y == null ? g.h - 4 : y, special: special || null, entry: { id, rot: 0, special: special || null }, lastRot: false }; return g.drop(); };
  /** The same, set down where it lands without a hard drop (a soft drop, or gravity). */
  const setAt = (g, id, x, rot) => { g.piece = { type: Pieces.get(id), rot: rot || 0, x, y: g.h - 4, special: null, entry: { id, rot: 0 }, lastRot: false }; g.piece.y = g.ghostY(g.piece); return g.lock(); };
  /** Rows top to bottom (height n): '.' empty, '#' filled on the grid the next piece meets. */
  const rowsOf = (g, n) => { const out = []; for (let y = n - 1; y >= 0; y--) { let s = ''; for (let x = 0; x < g.w; x++) s += g.board.get(x, y) ? '#' : '.'; out.push(s); } return out; };
  /** Each body's shape intact: its minos' centres as far apart as its cells at rest (rigid), turned by its pose. */
  const intact = (g) => {
    for (const b of W(g).bodies) {
      assert(Math.abs(b.c * b.c + b.s * b.s - 1) < 1e-4, 'a unit turn');
      for (let k = 0; k < b.m; k++) for (let j = k + 1; j < b.m; j++) {
        const rd = Math.hypot(b.cells[2 * k] - b.cells[2 * j], b.cells[2 * k + 1] - b.cells[2 * j + 1]);
        const d = Math.hypot(b.cx(k) - b.cx(j), b.cy(k) - b.cy(j));
        assert(Math.abs(d - rd) < 1e-3, 'body ' + b.id + ' keeps its shape: ' + d + ' vs ' + rd);
      }
      // Its minos are one piece: joined through an edge or a corner.
      const cs = Array.from({ length: b.m }, (_, k) => [b.cells[2 * k], b.cells[2 * k + 1]]);
      assert.strictEqual(Jelly.groups(cs).length, 1, 'body ' + b.id + ' is one piece');
    }
  };
  /** Turns and moves the piece in play to the spot a steady hand picks (the fewest holes, then low and flat). */
  const pick = (g) => {
    const t = g.piece.type, W0 = g.w, H = g.h;
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const bnd = t.rotBounds[rot];
      for (let x = -bnd.minX; x <= W0 - 1 - bnd.maxX; x++) {
        const s = g.simulate(t, rot, x);
        if (!s) continue;
        let holes = 0, top = 0;
        for (let xx = 0; xx < W0; xx++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (s.board.cells[y * W0 + xx]) { roof = true; top = Math.max(top, y); } else if (roof) holes++; } }
        const cost = -(s.n + s.c) * 100 + holes * 20 + top * 3 + s.y;
        if (!best || cost < best.cost) best = { cost, rot, x };
      }
    }
    if (best) { g.piece.rot = best.rot; g.piece.x = best.x; g.piece.y = H - 1 - t.rotBounds[best.rot].maxY; }
  };
  /** Builds bodies straight into a world (tests of the geometry): [[x, y] cells] each. */
  const world = (w, h, list) => { const V = new Jelly.World(w, h); for (const cells of list) V.bodies.push(Jelly.fromCells(V.nextId(), cells, cells.map(() => 3))); return V; };

  test('jelly: the part: Jelly on the Modifiers tab, rated, no feats; Tornado, Settle and Trapdoor refused; a Normal board is untouched', () => {
    assert.strictEqual(Recipe.label(JELLY), 'Jelly');
    const R = Recipe.rules(JELLY, 10);
    assert.strictEqual(R.rated, true, 'rated for pay');
    assert.strictEqual(R.feats, false, 'feats off');
    for (const id of ['tornado', 'settle', 'trapdoor']) assert.strictEqual(R.refuse[id], 'Not on a Jelly board', id);
    assert.strictEqual(R.refuse.flip, undefined, 'Mirror World is allowed');
    assert.strictEqual(R.lk, 1, 'a row is worth what it is on a Normal board');
    const g = jelly();
    assert.deepStrictEqual(g.ext.map((e) => e.key), ['jelly']);
    assert.strictEqual(g.allow('settle'), 'Not on a Jelly board');
    assert.strictEqual(new Game({ w: 10, h: 20, seed: 1, recipe: {} }).ext.length, 0);
    assert(Recipe.options().some((o) => o.path === 'mods.jelly'));
    assert.strictEqual(L.SKINS ? L.SKINS.jelly.name : L.COSMETICS.skins.jelly.name, 'Gummy', 'the skin is Gummy');
    assert.strictEqual(Jelly.coverNeed(10), 9.2);
    assert.strictEqual(Jelly.coverNeed(20), 19.2);
    assert(Math.abs(Jelly.coverNeed(4) - 3.6) < 1e-9);
  });

  test('jelly: a set piece is one body off the grid; the grid the next piece meets is its raster; placing is unchanged', () => {
    const g = jelly();
    const r = dropAt(g, 'T', 3);
    assert.strictEqual(r.lines, 0);
    assert.strictEqual(W(g).bodies.length, 1);
    const b = W(g).bodies[0];
    assert.strictEqual(b.m, 4);
    assert.deepStrictEqual(rowsOf(g, 2), ['....#.....', '...###....'], 'the T flat on the floor, its cells where its minos rest');
    assert(!W(g).awake.length, 'everything sleeps after a lock');
    // The raster: a mino fills the cell its centre is in.
    for (const m of minos(g)) assert(g.board.get(Math.floor(m.x), Math.floor(m.y)), 'a mino at ' + m.x + ',' + m.y);
    // The next piece moves, turns and lands against that grid (ghost as ever).
    const p = g.piece;
    p.x = 3; p.rot = 0;
    assert.strictEqual(g.ghostY(p), 2 - g.piece.type.rotBounds[0].minY, 'the ghost sits on the T');
    // A board's grid holds no links (bodies do the holding).
    assert(!Array.from(g.board.cells).some((v) => v & (CELL.JOIN_R | CELL.JOIN_U)));
  });

  test('jelly: bodies keep their shape and never lose a mino but to a clear (300 pieces, several widths, hard and soft)', () => {
    for (const [w, h, seed] of [[10, 20, 3], [6, 14, 5], [13, 24, 8]]) {
      const g = jelly({ w, h, seed });
      let placed = 0, cleared = 0;
      for (let i = 0; i < 100 && !g.over; i++) {
        pick(g);
        const r = i % 3 ? g.drop() : (g.piece.y = g.ghostY(g.piece), g.lock());
        if (!r) break;
        placed += r.placed;
        for (const wv of r.cascade || []) for (const row of wv.removed) cleared += row.length;
        assert.strictEqual(minos(g).length, placed - cleared, 'no mino lost or made (piece ' + i + ')');
        intact(g);
        assert(!W(g).awake.length);
      }
      assert(placed > 60, 'placed ' + placed);
    }
  });

  test('jelly: a band clears at the threshold: whole minos centred in it; short of a mino never', () => {
    // A row of ten single minos with a gap of 0.7 (and some overlap): covered 9.3 of 10 (93% ≥ 92%): it clears.
    const row = (xs) => { const V = world(10, 8, []); for (const x of xs) { const b = Jelly.fromCells(V.nextId(), [[0, 0]], [3]); b.x = x; b.box(); V.bodies.push(b); } return V; };
    let V = row([0.5, 1.5, 2.5, 3.5, 5.2, 6.2, 7.2, 8.2, 8.8, 9.5]);
    const cover = Jelly.coverOf(V, 0);
    assert(Math.abs(cover - 0.93) < 1e-9, 'covered ' + cover);
    assert.deepStrictEqual(Jelly.bands(V), [0]);
    // Nine of ten, tight: 90% < 92%: it never clears.
    V = world(10, 8, Array.from({ length: 9 }, (_, x) => [[x, 0]]));
    assert.strictEqual(Jelly.coverOf(V, 0), 0.9);
    assert.deepStrictEqual(Jelly.bands(V), []);
    // Ten, with a gap of 0.9: 91%: never.
    V = row([0.5, 1.5, 2.5, 3.5, 5.4, 6.4, 7.4, 8.4, 8.9, 9.5]);
    assert(Math.abs(Jelly.coverOf(V, 0) - 0.91) < 1e-9, 'covered ' + Jelly.coverOf(V, 0));
    assert.deepStrictEqual(Jelly.bands(V), []);
    // A mino counts in the band its centre is in, however the body leans.
    V = world(4, 8, [[[0, 0], [1, 0], [2, 0], [3, 0]]]);
    const I = V.bodies[0];
    I.y = 0.95; I.c = Math.cos(0.1); I.s = Math.sin(0.1); I.box();
    const inBand0 = Array.from({ length: 4 }, (_, k) => Math.floor(I.cy(k)) === 0).filter(Boolean).length;
    assert(inBand0 > 0 && inBand0 < 4);
  });

  test('jelly: slicing: a clear takes exactly the minos centred in the band; what is left splits into whole-mino bodies', () => {
    // An upright I through band 1: its mino in band 1 goes; the one below and the two above are two bodies.
    let V = world(4, 8, [[[1, 0], [1, 1], [1, 2], [1, 3]], [[0, 1]], [[2, 1]], [[3, 1]]]);
    const { removed, cells } = Jelly.clearBands(V, [1]);
    assert.strictEqual(removed[0].length, 4, 'four minos: the I\u2019s and three singles');
    assert.strictEqual(cells.length, 4);
    const sizes = V.bodies.map((b) => b.m).sort();
    assert.deepStrictEqual(sizes, [1, 2], 'below: one mino; above: two, one body');
    for (const b of V.bodies) for (let k = 0; k < b.m; k++) assert(Math.floor(b.cy(k)) !== 1, 'nothing left centred in the band');
    // A T through its stem's band: the stem goes, the bar above stays one body; an S across two bands: the halves split.
    V = world(4, 8, [[[0, 2], [1, 2], [2, 2], [1, 1]], [[0, 1]], [[2, 1]], [[3, 1]]]);
    Jelly.clearBands(V, [1]);
    assert.deepStrictEqual(V.bodies.map((b) => b.m), [3], 'the bar');
    V = world(4, 8, [[[0, 0], [1, 0], [1, 1], [2, 1]]]);
    Jelly.clearBands(V, [0]);
    assert.deepStrictEqual(V.bodies.map((b) => b.m), [2]);
    // An L whose foot is cut: the upright stays whole; a tilted body loses whole minos only (never part of one).
    V = world(6, 8, [[[1, 0], [2, 0], [3, 0], [1, 1], [1, 2]]]);
    const b0 = V.bodies[0];
    b0.c = Math.cos(0.2); b0.s = Math.sin(0.2); b0.y += 0.3; b0.box();
    const before = Array.from({ length: b0.m }, (_, k) => [b0.cx(k), b0.cy(k)]);
    Jelly.clearBands(V, [1]);
    const after = V.bodies.flatMap((b) => Array.from({ length: b.m }, (_, k) => [b.cx(k), b.cy(k)]));
    for (const [x, y] of after) assert(before.some(([bx, by]) => Math.abs(bx - x) < 1e-9 && Math.abs(by - y) < 1e-9), 'a survivor is a whole mino, where it was');
    assert.strictEqual(after.length + before.filter(([, y]) => Math.floor(y) === 1).length, before.length);
    for (const b of V.bodies) assert.strictEqual(Jelly.groups(Array.from({ length: b.m }, (_, k) => [b.cells[2 * k], b.cells[2 * k + 1]])).length, 1);
  });

  test('jelly: in play a full band clears, pays only its minos at the Jelly rate (plain rows), and what it held comes down', () => {
    const g = jelly();
    // Three I's flat on the floor, then an O over the gap at the right: row 0 fills and clears.
    dropAt(g, 'I', 0, 0); dropAt(g, 'I', 4, 0);
    assert.deepStrictEqual(rowsOf(g, 1), ['########..']);
    Object.assign(g.s, { b2b: 2, combo: 1 });
    const r = setAt(g, 'O', 8);
    assert(r.cascade && r.cascade.length === 1, JSON.stringify(r.cascade && r.cascade.map((w) => w.rows)));
    assert.deepStrictEqual(r.cascade[0].rows, [0]);
    assert.strictEqual(r.cascade[0].removed[0].length, 10, 'ten minos');
    assert.strictEqual(r.n, 0, 'nothing the piece cleared itself: every Jelly clear is plain');
    assert.strictEqual(r.c, 1);
    assert.strictEqual(r.lines, 1);
    assert(Math.abs(r.own - Jelly.WORTH) < 1e-9, 'a row of ten minos pays WORTH of a row: ' + r.own);
    assert.strictEqual(g.s.b2b, 2, 'the streak is left as it was (a clear that is only plain rows)');
    assert.strictEqual(g.s.combo, 2);
    // The O's top half came down onto the floor.
    assert.deepStrictEqual(rowsOf(g, 2), ['..........', '........##']);
    assert.strictEqual(r.waves, 1);
    assert.strictEqual(r.cascades, 0, 'the first wave is no cascade');
    intact(g);
  });

  test('jelly: hard drops knock the stack about; soft drops and gravity landings leave it be', () => {
    /** A little stack of bodies: an O, a T and an I across them. */
    const scene = () => {
      const g = jelly({ seed: 9 });
      setAt(g, 'O', 3); setAt(g, 'T', 5, 2); setAt(g, 'I', 3, 0);
      return g;
    };
    const moved = (g, snap) => {
      let d = 0;
      for (const b of W(g).bodies) { const s = snap.get(b.id); if (s) d += Math.abs(b.x - s[0]) + Math.abs(b.y - s[1]) + Math.abs(b.s - s[2]); }
      return d;
    };
    const snapOf = (g) => new Map(W(g).bodies.map((b) => [b.id, [b.x, b.y, b.s]]));
    const a = scene(), sa = snapOf(a);
    setAt(a, 'O', 4);
    const soft = moved(a, sa);
    const b = scene(), sb = snapOf(b);
    const r = dropAt(b, 'O', 4);
    const hard = moved(b, sb);
    assert(r.dropDist > 10);
    assert(soft < 1e-3, 'a soft landing leaves its neighbours where they were: ' + soft);
    assert(hard > soft + 0.02, 'a hard drop moves them more: ' + hard + ' vs ' + soft);
    // Its record: frames in which the struck bodies moved.
    assert(r.jelly && r.jelly.frames.some((f) => f.set.some(([id]) => sb.has(id))), 'the knock is in the record');
    intact(b);
  });

  test('jelly: an overhang tips: a piece resting off its balance topples; a steady one stays', () => {
    const g = jelly();
    setAt(g, 'O', 0);
    // An I laid on the O's top reaching out over nothing (cells 1..4 of row 2; held only over column 1): it tips off.
    g.piece = { type: Pieces.get('I'), rot: 0, x: 1, y: 10, special: null, entry: { id: 'I', rot: 0 }, lastRot: false };
    const bnd = g.piece.type.rotBounds[0];
    g.piece.x = 1 - bnd.minX; g.piece.y = g.ghostY(g.piece);
    assert.strictEqual(g.piece.y + bnd.minY, 2, 'set on the O');
    g.lock();
    const I = W(g).bodies[1];
    assert(I.y < 1.9, 'it came down off the O: ' + I.y);
    intact(g);
    // An I laid flat across two O's is steady: it stays where it was set.
    const h = jelly();
    setAt(h, 'O', 0); setAt(h, 'O', 2);
    h.piece = { type: Pieces.get('I'), rot: 0, x: 0, y: 10, special: null, entry: { id: 'I', rot: 0 }, lastRot: false };
    h.piece.x = -bnd.minX; h.piece.y = h.ghostY(h.piece);
    h.lock();
    const J = W(h).bodies[2];
    assert(Math.abs(J.y - 2.5) < 0.05 && Math.abs(J.s) < 1e-3, 'steady: ' + J.y + ' ' + J.s);
  });

  test('jelly: determinism: the same play settles the same; the save resumes the exact state; Undo takes a lock back exactly', () => {
    const play = (g, n) => { for (let i = 0; i < n && !g.over; i++) { pick(g); g.drop(); } };
    const a = jelly({ seed: 21 }), b = jelly({ seed: 21 });
    play(a, 40); play(b, 40);
    assert.deepStrictEqual(Jelly.pack(W(a)), Jelly.pack(W(b)), 'the same');
    assert.deepStrictEqual(Array.from(a.board.cells), Array.from(b.board.cells));
    // Save and resume, then both play on: the same.
    const saved = JSON.parse(JSON.stringify(a.toJSON()));
    const c = new Game({ saved });
    assert.deepStrictEqual(Jelly.pack(W(c)), Jelly.pack(W(a)), 'resumed exactly');
    assert(Library.playable(saved), 'a saved Jelly board can be resumed');
    play(a, 15); play(c, 15);
    assert.deepStrictEqual(Jelly.pack(W(c)), Jelly.pack(W(a)), 'and plays on the same');
    assert.strictEqual(c.s.score, a.s.score);
    // Undo: the lock taken back exactly; the same drop again gives the same.
    const before = JSON.stringify(Jelly.pack(W(a))), cells0 = Array.from(a.board.cells);
    const p = a.piece, again = { rot: p.rot, x: p.x };
    const r = a.drop();
    const after = JSON.stringify(Jelly.pack(W(a)));
    assert(r);
    a.undo();
    assert.strictEqual(JSON.stringify(Jelly.pack(W(a))), before, 'Undo: the bodies as they were');
    assert.deepStrictEqual(Array.from(a.board.cells), cells0);
    a.piece.rot = again.rot; a.piece.x = again.x;
    a.drop();
    assert.strictEqual(JSON.stringify(Jelly.pack(W(a))), after, 'the same drop settles the same way');
  });

  test('jelly: items: Bomb, Black Hole, Drill and Laser take whole minos and what they held comes down; Mirror World turns the bodies', () => {
    const base = () => { const g = jelly({ seed: 2 }); setAt(g, 'I', 0, 0); setAt(g, 'I', 4, 0); setAt(g, 'O', 1); setAt(g, 'O', 5); setAt(g, 'I', 2, 0); return g; };
    const check = (g, what) => { intact(g); assert(!W(g).awake.length, what + ': at rest'); for (const m of minos(g)) assert(g.board.get(Math.floor(m.x), Math.floor(m.y)), what + ': the grid shows every mino'); };
    let g = base(), n0 = minos(g).length;
    g.replacePiece({ id: 'M1', special: 'bomb' }); g.piece.x = 2; g.piece.y = 10;
    let r = g.drop();
    assert(r.blast.length > 0);
    assert.strictEqual(minos(g).length, n0 - r.blast.length, 'the blast took whole minos, one a cell');
    check(g, 'bomb');
    g = base(); n0 = minos(g).length;
    g.replacePiece({ id: 'M1', special: 'blackhole' }); g.piece.x = 3; g.piece.y = 10;
    r = g.drop();
    assert.strictEqual(minos(g).length, n0 - r.swallowed.length);
    check(g, 'black hole');
    g = base(); n0 = minos(g).length;
    g.replacePiece({ id: 'M1', special: 'drill' }); g.piece.x = 3; g.piece.y = 10;
    r = g.drop();
    assert.strictEqual(r.special, 'drill');
    assert(r.drilled.length >= 2);
    assert.strictEqual(minos(g).length, n0 - r.drilled.length);
    check(g, 'drill');
    g = base(); n0 = minos(g).length;
    g.replacePiece({ id: 'O', special: 'laser' }); g.piece.rot = 0; g.piece.x = 7; g.piece.y = 10;
    r = g.drop();
    assert.strictEqual(r.special, 'laser');
    const lasered = r.removed.reduce((a, row) => a + row.length, 0);
    assert(lasered > 0);
    assert.strictEqual(minos(g).length, n0 + 4 - lasered - (r.cascade || []).reduce((a, w) => a + w.removed.reduce((k, row) => k + row.length, 0), 0));
    check(g, 'laser');
    // Mirror World: every body turned left to right with the board.
    g = base();
    const was = minos(g).map((m) => [g.w - m.x, m.y]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    g.piece.x = 3; g.piece.y = 15;
    assert(g.flipWorld());
    const now = minos(g).map((m) => [m.x, m.y]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    now.forEach(([x, y], i) => assert(Math.abs(x - was[i][0]) < 1e-6 && Math.abs(y - was[i][1]) < 1e-6));
    check(g, 'mirror world');
    // Settle, Trapdoor and Tornado: refused with a plain reason.
    for (const id of ['settle', 'trapdoor', 'tornado']) assert.strictEqual(g.allow(id), 'Not on a Jelly board');
  });

  test('jelly: Mirror + Jelly (the pair, two bodies), Shapes + Jelly (a cluster is one body), Classic + Jelly and Protect + Jelly play', () => {
    const m = new Game({ w: 10, h: 20, seed: 4, recipe: Recipe.normalize({ mods: { jelly: true, mirror: true } }) });
    assert.deepStrictEqual(m.ext.map((e) => e.key).sort(), ['jelly', 'mirror']);
    m.piece.x = 0; m.piece.y = m.ghostY(m.piece);
    const r = m.lock();
    assert.strictEqual(r.placed, 8, 'the piece and its copy');
    assert.strictEqual(W(m).bodies.length, 2, 'two bodies');
    intact(m);
    // A cluster joined at a corner is one body.
    const g = jelly();
    const type = Pieces.customType([[0, 0], [1, 0], [2, 1]]);
    g.piece = { type, rot: 0, x: 3, y: 10, special: null, entry: { id: type.id, rot: 0 }, lastRot: false };
    g.piece.y = g.ghostY(g.piece);
    g.lock();
    assert.strictEqual(W(g).bodies.length, 1);
    assert.strictEqual(W(g).bodies[0].m, 3);
    intact(g);
    // Shapes (Frantic) + Jelly, Classic + Jelly (B, with garbage: cells that stay on the grid), Protect + Jelly: 40 pieces each.
    for (const rc of [{ shapes: { preset: 'frantic' }, mods: { jelly: true } }, { mods: { jelly: true }, mode: 'classic', classic: { type: 'b', level: 0, height: 3 } }, { mods: { jelly: true }, mode: 'protect', protect: { level: 'easy' } }]) {
      const h = new Game({ w: 10, h: 20, seed: 6, recipe: Recipe.normalize(rc) });
      for (let i = 0; i < 40 && !h.over && h.piece; i++) { h.piece.x = Math.max(-h.piece.type.rotBounds[0].minX, Math.min(h.w - 1 - h.piece.type.rotBounds[0].maxX, (i * 3) % h.w)); h.drop(); }
      intact(h);
      assert(h.s.pieces > 5, JSON.stringify(rc));
      const saved = JSON.parse(JSON.stringify(h.toJSON()));
      assert.deepStrictEqual(Jelly.pack(W(new Game({ saved }))), Jelly.pack(W(h)), 'resumed: ' + JSON.stringify(rc));
    }
  });

  test('jelly: the streak is left alone by a clear that is only bands, never a T-spin; Knock-On counts three cascades, only on Jelly', () => {
    const g = jelly();
    Object.assign(g.s, { b2b: 3, combo: -1, quadRun: 2, hb2b: 1 });
    dropAt(g, 'I', 0, 0); dropAt(g, 'I', 4, 0);
    const r = setAt(g, 'O', 8);
    assert.deepStrictEqual([r.n, r.c, r.lines], [0, 1, 1]);
    assert.deepStrictEqual([g.s.b2b, g.s.quadRun], [3, 2], 'the streak kept');
    assert.strictEqual(r.tspin, false);
    const a = Achievements.LIST.find((x) => x.id === 'knock_on');
    assert(a && a.name === 'Knock-On' && a.pay === 30);
    const fake = { cascades: 3, lines: 4 };
    assert(Achievements.check({ achievements: {} }, { mode: 'play', r: fake, g }).some((x) => x.id === 'knock_on'));
    const plain = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
    assert(!Achievements.check({ achievements: {} }, { mode: 'play', r: fake, g: plain }).some((x) => x.id === 'knock_on'));
    // Summary: the cascades, for the Cascades tile.
    g.s.cascades = 2; g.s.bestCascade = 1;
    assert.deepStrictEqual(Recipe.summary(g).jelly, { cascades: 2, best: 1 });
  });

  test('jelly: the cost is bounded (20 × 40, phones) and nothing is spent at rest; Best Fit stays quick', () => {
    const g = jelly({ w: 20, h: 40, seed: 3 });
    const V = W(g);
    let worst = 0, total = 0, n = 0;
    for (let i = 0; i < 160 && !g.over; i++) {
      const t = g.piece.type, rot = i % 2 ? 0 : 2, bnd = t.rotBounds[rot];
      g.piece.rot = rot; g.piece.x = -bnd.minX + ((i * 7) % (20 - bnd.w + 1));
      if (!g.fitsAt(g.piece, rot, g.piece.x, g.piece.y)) break;
      const w0 = V.work, t0 = process.hrtime.bigint();
      if (!g.drop()) break;
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      worst = Math.max(worst, V.work - w0); total += ms; n++;
      assert(!V.awake.length, 'asleep after every lock');
    }
    // At most 60 000 mino-steps a lock (about a second of every mino of a full board 20 × 40 moving: a big clear).
    assert(worst < 60000, 'mino-steps a lock at most ' + worst);
    assert(total / n < 60, 'ms a lock on average ' + (total / n).toFixed(1));
    // At rest nothing runs: a step of the world with nothing awake does no work.
    const w0 = V.work;
    Jelly.step(V);
    assert.strictEqual(V.work, w0);
    // Best Fit weighs placements on the grid: quick.
    const t0 = process.hrtime.bigint();
    g.bestFit();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert(ms < 80, 'Best Fit ' + ms.toFixed(1) + ' ms');
  });

  // ---- fairness -----------------------------------------------------------------------------------------------------

  /**
   * Plays n pieces of a board with a bot and pays each lock as Free Play does (Pay.mult, then Pay.clear by the board's
   * worth). 'greedy': the most rows, then the fewest holes, the lowest, the flattest, hard dropped. 'soft': the same,
   * set down gently (no knocks). 'lean': the greedy choice, sparing actions. Counts the actions a player needs (a turn
   * each quarter, a step each column, a drop). Returns { pay, pieces, actions, quads }.
   */
  function play(recipe, w, h, seed, bot, n) {
    const g = new Game({ w, h, seed, recipe, previewCount: 1 });
    const W0 = w, H = h;
    const heights = (c) => { const hs = []; for (let x = 0; x < W0; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if (c[y * W0 + x]) { t = y + 1; break; } hs.push(t); } return hs; };
    const holes = (c) => { let k = 0; for (let x = 0; x < W0; x++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (c[y * W0 + x]) roof = true; else if (roof) k++; } } return k; };
    const shape = (c) => { const hs = heights(c); return holes(c) * 60 + Math.max(...hs) * 4 + hs.reduce((a, v) => a + v, 0) * 0.5 + hs.slice(1).reduce((a, v, i) => a + Math.abs(v - hs[i]), 0); };
    let pay = 0, actions = 0, pieces = 0, quads = 0;
    for (; pieces < n && g.piece && !g.over; pieces++) {
      const type = g.piece.type;
      let best = null;
      const seen = new Set();
      for (let rot = 0; rot < 4; rot++) {
        const key = Pieces.keyOf(type.rots[rot]);
        if (seen.has(key)) continue;
        seen.add(key);
        const bnd = type.rotBounds[rot];
        for (let x = -bnd.minX; x <= W0 - 1 - bnd.maxX; x++) {
          const sim = g.simulate(type, rot, x, g.board);
          if (!sim) continue;
          let cost = -(sim.n + sim.c) * 1000 + shape(sim.board.cells);
          if (bot === 'lean') cost += (Math.min(rot, 4 - rot) + Math.abs(x - g.piece.x)) * 40;
          if (!best || cost < best.cost) best = { cost, rot, x };
        }
      }
      if (!best) break;
      const p = g.piece;
      actions += Math.min(best.rot, 4 - best.rot) + Math.abs(best.x - p.x) + 1;
      p.rot = best.rot; p.x = best.x; p.y = H - 1 - type.rotBounds[best.rot].maxY;
      if (!g.fitsAt(p, p.rot, p.x, p.y)) break;
      let r;
      if (bot === 'soft') { p.y = g.ghostY(p); r = g.lock(); } else r = g.drop();
      if (!r) break;
      if (r.quad) quads++;
      g.s.mult = Pay.mult(g);
      if (r.lines) pay += Pay.clear(g.s, r, g.rules).pay;
    }
    return { pay, pieces, actions, quads };
  }

  test('jelly: fairness: bots that play hard, soft or lean never earn more per piece than Standard, nor per action than a Normal board of the width', () => {
    const T = process.env.JELLY_TABLE, fmt = (v) => (typeof v === 'number' ? Math.round(v * 100000) / 100000 : v);
    const pooled = (recipe, w, h, bot, seeds, n) => {
      const t = { pay: 0, pieces: 0, actions: 0, quads: 0 };
      for (const seed of seeds) { const r = play(recipe, w, h, seed, bot, n); for (const k of Object.keys(t)) t[k] += r[k]; }
      return t;
    };
    const range = (a, k, step) => Array.from({ length: k }, (_, i) => a + i * step);
    let stdPiece = 0;
    for (const bot of ['greedy', 'lean']) { const s = pooled({}, 10, 20, bot, range(1, 6, 1), 300); stdPiece = Math.max(stdPiece, s.pay / s.pieces); }
    const over = [];
    for (const w of [4, 6, 8, 10, 14, 20]) {
      const h = Math.max(16, Math.min(40, 2 * w)), bots = ['greedy', 'soft', 'lean'];
      const seeds = range(w, w >= 14 ? 2 : 3, 30), n = w >= 14 ? 150 : 200;
      let nrmAction = 0;
      for (const bot of ['greedy', 'lean']) { const r = pooled({}, w, h, bot, seeds, n); nrmAction = Math.max(nrmAction, r.pay / r.actions); }
      for (const bot of bots) {
        const j = pooled(JELLY, w, h, bot, seeds, n);
        const perPiece = j.pay / j.pieces, perAction = j.pay / j.actions;
        if (T) console.log([w, bot, perPiece, stdPiece, perAction, nrmAction].map(fmt).join('\t'));
        assert(j.pay <= j.pieces * 0.4 * Chain.mult(1e9) + 1e-9, 'within the cells’ ceiling');
        if (perPiece > stdPiece || perAction > nrmAction) over.push([w, bot, perPiece, stdPiece, perAction, nrmAction].map(fmt).join(' '));
      }
    }
    assert.deepStrictEqual(over, [], 'earns more than a Normal board');
  });
};
