// Physics (js/physics.js): the material's numbers; the recipe (a modifier: its Material, Mirror and Protect ruled out,
// Classic's garbage too); the piece in play, rigid and the player's until let go (no fall by itself, touching never sets
// it, ↓ rests it, ↓ again or held, or Space, lets it go), shoving bodies aside as it moves and refused when they are
// pinned, never passed through; bodies that never lose a mino but to a clear, never tear, never merge or sink into each
// other; a tall stack that hardly sinks, a pile as tall as its minos; soft bodies that bend, sag and keep dents; sleep at
// rest (and no work then); clears measured on the minos' own area (honest cover) that take whole minos and split what
// they cross; hard drops that knock and soft ones that do not; hard-drop spam that tops out like Standard; Rewind 5 s;
// the top out both ways; the save; Physics + Classic; power-ups refused on Physics boards only; fairness (a bot never
// earns more per piece or per action than a Standard board); and the cost of a full 20 × 40 board in Node.
// Run by test.cjs: require('./physics-test.cjs')(test, L).
'use strict';
const assert = require('assert');

module.exports = function physicsTests(test, L) {
  L = L || globalThis.Lull;
  const { Game, Recipe, Pieces, Physics, Pay, Chain, ITEMS } = L;
  const P = Physics.P;
  const PHYS = Recipe.normalize({ mods: { physics: true } });
  const phys = (o) => new Game(Object.assign({ w: 10, h: 20, seed: 1, recipe: PHYS }, o));
  const X = (g) => Physics.of(g);
  const minosOf = (W) => W.bodies.reduce((a, b) => a + b.m, 0);
  /** Steps a game's clock by `secs` (frames of 1/60 s), collecting its events. */
  const run = (g, secs, o) => { const ev = []; for (let i = 0; i < Math.round(secs * 60); i++) ev.push(...X(g).tick(g, 1 / 60, o || {})); return ev; };
  /** The piece in play made `id`, turned rot, its box at column x (at the top). */
  const aim = (g, id, x, rot) => { g.replacePiece({ id }); const p = g.piece; p.rot = rot || 0; p.x = x - p.type.rotBounds[p.rot].minX; X(g).off = 0; p.y = g.h - 1 - p.type.rotBounds[p.rot].maxY; };
  /** A world with bodies made from cell lists (each [[x, y], …], at rest). */
  const world = (w, h, shapes) => { const W = new Physics.World(w, h, 'jelly'); for (const cells of shapes) W.bodies.push(Physics.fromCells(W.next++, cells, cells.map(() => 3), 0, 0, 0)); return W; };
  const settle = (W, secs) => { for (let i = 0; i < secs * 120; i++) Physics.stepWorld(W); };
  /** Holds ↓ until the piece in play rests on something (it is not let go). */
  const lowerToRest = (g) => { const ev = []; for (let k = 0; k < 600 && g.piece && !g.over && !X(g).resting(g); k++) ev.push(...X(g).tick(g, 1 / 60, { soft: true })); return ev; };
  /** Area two convex quads share (Sutherland–Hodgman). */
  const shared = (a, b) => {
    let out = a;
    for (let i = 0; i < 4 && out.length; i++) {
      const A = b[i], B = b[(i + 1) % 4], inp = out, side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
      out = [];
      for (let j = 0; j < inp.length; j++) {
        const P0 = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P0), sq = side(Q);
        if (sp >= 0) out.push(P0);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P0[0] + t * (Q[0] - P0[0]), P0[1] + t * (Q[1] - P0[1])]); }
      }
    }
    let ar = 0;
    for (let i = 0; i < out.length; i++) { const [x0, y0] = out[i], [x1, y1] = out[(i + 1) % out.length]; ar += x0 * y1 - x1 * y0; }
    return Math.abs(ar) / 2;
  };
  const quadOf = (b, k) => [0, 1, 2, 3].map((e) => [b.x[b.q[4 * k + e]], b.y[b.q[4 * k + e]]]);
  /** The area minos of different bodies share, all of it (0: nothing of one piece is inside another). */
  const overlapOf = (W) => {
    const all = [];
    for (const b of W.bodies) for (let k = 0; k < b.m; k++) all.push([b, quadOf(b, k)]);
    let t = 0;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (all[i][0] !== all[j][0]) t += shared(all[i][1], all[j][1]);
    return t;
  };
  /** Plays n pieces at random (columns, turns, hard or soft), returns the events. */
  const randomPlay = (g, n, seed, hardShare) => {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const ev = [];
    for (let i = 0; i < n && g.piece && !g.over; i++) {
      const p = g.piece;
      for (let k = Math.floor(rnd() * 4); k > 0; k--) g.rotate(1);
      const dx = Math.floor(rnd() * g.w) - p.x;
      for (let k = 0; k < Math.abs(dx); k++) g.move(Math.sign(dx));
      if (rnd() < hardShare) { X(g).hardDrop(g); ev.push(...run(g, 0.35)); }
      else { ev.push(...lowerToRest(g)); if (!X(g).release(g)) X(g).hardDrop(g); ev.push(...run(g, 0.2)); }
    }
    return ev;
  };

  // ---- the material and the recipe ------------------------------------------------------------------------------------

  test('physics: the material is numbers (Jelly the only one); reduced motion is stiffer and calmer, the same game', () => {
    assert.deepStrictEqual(Physics.MATERIAL_IDS, ['jelly']);
    const m = Physics.material('jelly');
    for (const k of ['stiffness', 'mino', 'edge', 'flow', 'yield', 'drift', 'area', 'wobble', 'restitution', 'friction', 'density', 'damping']) assert(typeof m[k] === 'number' && m[k] >= 0, k);
    for (const k of ['stiffness', 'mino', 'edge', 'area', 'wobble', 'restitution', 'friction']) assert(m[k] <= 1, k + ' is a share');
    assert(m.friction < 0.3, 'slippery');
    assert(m.stiffness < m.mino && m.mino < m.edge, 'soft as a whole, each mino a little firmer, its squash firmest');
    assert(m.flow > 0 && m.drift > 0 && m.drift < 0.5, 'partly fluid, never far from its shape');
    assert(P.SQUASH <= 0.15 && P.BEND <= 0.2 && P.REST_SQUASH <= 0.05, 'a mino stays near a square');
    const still = Physics.material('jelly', true);
    assert(still.stiffness > m.stiffness && still.wobble > m.wobble && still.restitution < m.restitution, 'reduced motion: stiffer, less wobble');
    assert.strictEqual(Physics.material('nope'), m, 'an unknown material is Jelly');
  });

  test('physics: a modifier with a Material; Mirror and Protect ruled out both ways, Classic B garbage too; kept for the board\'s life', () => {
    assert.deepStrictEqual(PHYS.physics, { material: 'jelly' });
    assert.strictEqual(PHYS.mods.physics, true);
    assert.strictEqual(PHYS.mode, 'plain', 'not a mode');
    assert.deepStrictEqual(Recipe.normalize({ mods: { physics: true }, physics: { material: 'lava' } }).physics, { material: 'jelly' });
    assert.strictEqual(Recipe.normalize({ physics: { material: 'jelly' } }).physics, undefined, 'its setting only with the modifier');
    assert.strictEqual(Recipe.label(PHYS), 'Physics');
    assert(Recipe.options().some((o) => o.path === 'mods.physics'));
    assert(Recipe.options().some((o) => o.path === 'physics.material'));
    const c = Recipe.conflicts(PHYS);
    assert(c['mods.mirror=true'] && c['mode=protect']);
    assert(Recipe.conflicts({ mods: { mirror: true } })['mods.physics=true']);
    assert(Recipe.conflicts({ mode: 'protect' })['mods.physics=true']);
    assert(!Recipe.conflicts(PHYS)['mode=classic'], 'Physics + Classic plays');
    assert(Recipe.conflicts({ mods: { physics: true }, mode: 'classic' })['classic.height=3']);
    const r = Recipe.resolve({ mods: { physics: true, mirror: true } }, 'mods.physics', {});
    assert.strictEqual(r.recipe.mods.mirror, false, 'the last choice wins');
    const e = Recipe.editConflicts(PHYS, PHYS);
    assert(e['mods.physics=false'] && !e['mods.physics=true']);
    assert(Recipe.editConflicts({}, {})['mods.physics=true']);
  });

  test('physics: refused power-ups are refused on Physics boards only, each with its reason; Undo is Rewind 5 s', () => {
    const g = phys();
    for (const [id, why] of Object.entries(Physics.REFUSE)) {
      assert(ITEMS[id], id);
      assert.strictEqual(g.allow(id), why, id);
      for (const r of [{}, { mods: { mirror: true } }, { mode: 'protect' }, { shapes: { preset: 'tiny' } }]) {
        const o = new Game({ w: 10, h: 20, seed: 1, recipe: r });
        assert.notStrictEqual(o.allow(id), why, id + ' on ' + JSON.stringify(r));
      }
    }
    for (const id of ['reroll', 'mirror', 'pebble', 'noodle', 'giant', 'blueprint', 'pick', 'order', 'rewind']) assert.strictEqual(g.allow(id), null, id + ' works on Physics');
    assert.strictEqual(g.rules.undo, false, 'no exact Undo history');
    assert.strictEqual(g.history.length, 0);
    assert.strictEqual(g.rules.hints, false);
    assert.strictEqual(g.rules.feats, false);
  });

  // ---- bodies --------------------------------------------------------------------------------------------------------

  test('physics: the piece in play is the player\'s: it never falls by itself, touching never sets it, ↓ rests it, only the player lets it go', () => {
    const g = phys({ seed: 2 });
    const x = X(g), y0 = g.piece.y - x.off;
    run(g, 2);
    assert.strictEqual(g.piece.y - x.off, y0, 'no fall by itself');
    assert.strictEqual(g.s.pieces, 0);
    // ↓ takes it down to the floor; it rests there, not set, however long.
    const first = g.piece;
    lowerToRest(g);
    assert(x.resting(g) && g.piece === first, 'resting, still in play');
    assert(g.piece.y - x.off < 0.05, 'on the floor: ' + (g.piece.y - x.off));
    run(g, 2, { soft: true });
    assert.strictEqual(g.piece, first, 'held against the floor in Node (no controller) it stays');
    assert.strictEqual(g.s.pieces, 0);
    // Let go: it becomes a body where it rests, the next piece comes at once; the grid stays empty.
    assert(x.release(g));
    assert.notStrictEqual(g.piece, first, 'the next piece came');
    assert.strictEqual(g.s.pieces, 1);
    assert.strictEqual(x.W.bodies.length, 1);
    assert.strictEqual(minosOf(x.W), first.type.rots[0].length);
    assert(g.board.cells.every((v) => !v), 'nothing on the grid');
    run(g, 1);
    assert(x.W.bodies[0].y0 < 0.05 && x.W.bodies[0].y0 > -0.05, 'flush on the floor');
    // A piece resting on a body: not set by touching it either; Space lets it go gently (it has no room to be thrown).
    aim(g, 'O', 0, 0);
    lowerToRest(g);
    run(g, 1.5);
    assert.strictEqual(g.s.pieces, 1, 'resting on a body, still in play');
    x.hardDrop(g);
    assert.strictEqual(g.s.pieces, 2);
  });

  test('physics: the piece in play shoves bodies aside as it moves (speed given, sleepers woken); refused when they are pinned', () => {
    // An O body on the floor; the piece (an O) set down beside it, then moved into it: the body goes, the move stands.
    const g = phys({ seed: 3 });
    const x = X(g), W = x.W;
    W.bodies.push(Physics.fromCells(W.next++, [[4, 0], [5, 0], [4, 1], [5, 1]], [5, 5, 5, 5], 0, 0, 0));
    run(g, 1.5);
    const box = W.bodies[0];
    assert(!box.awake, 'asleep');
    aim(g, 'O', 2, 0);
    lowerToRest(g);
    assert(g.move(1), 'the move stands');
    assert(box.awake, 'woken');
    assert(box.x0 > 4.9, 'shoved a column over: ' + box.x0.toFixed(3));
    let vx = 0; for (let i = 0; i < box.n; i++) vx += (box.x[i] - box.px[i]) / box.n;
    assert(vx > 0, 'and moving on');
    // On into it until it is pinned against the wall: then the move is refused and nothing moves.
    let moves = 1;
    for (; moves < 8; moves++) { run(g, 0.3); if (!g.move(1)) break; }
    const right = Math.max(...x.cellsOf(g, g.piece).map(([cx]) => cx)) + 1;
    assert(moves < 8 && right >= 6.9, 'refused next to it: ' + moves + ' moves, its right side at ' + right);
    assert(box.x1 <= 10.02 && box.x1 > 9.9, 'the wall holds it');
    const at = box.x0;
    assert.strictEqual(g.move(1), false, 'refused: it has nowhere to go');
    assert(Math.abs(box.x0 - at) < 0.02);
    // Two in a row are pushed together; pinned behind one that cannot move, neither.
    const h = phys({ seed: 4 }), y = X(h), V = y.W;
    V.bodies.push(Physics.fromCells(V.next++, [[3, 0], [3, 1]], [5, 5], 0, 0, 0), Physics.fromCells(V.next++, [[4, 0], [4, 1]], [6, 6], 0, 0, 0));
    run(h, 1);
    aim(h, 'O', 1, 0);
    lowerToRest(h);
    assert(h.move(1), 'two bodies shoved together');
    assert(V.bodies[0].x0 > 3.9 && V.bodies[1].x0 > 4.9, V.bodies.map((b) => b.x0.toFixed(2)).join());
    V.bodies.push(Physics.fromCells(V.next++, [[6, 0], [7, 0], [8, 0], [9, 0], [6, 1], [7, 1], [8, 1], [9, 1]], [1, 1, 1, 1, 1, 1, 1, 1], 0, 0, 0));
    V.hashed = false;
    run(h, 0.5);
    assert.strictEqual(h.move(1), false, 'pinned by a body against the wall');
    // Down onto bodies on the floor: it rests on them, never pushes them into the floor or passes through.
    aim(h, 'O', 6, 0);
    lowerToRest(h);
    run(h, 1, { soft: true });
    assert(h.piece.y - y.off > 1.85, 'on top of what is below: ' + (h.piece.y - y.off).toFixed(3));
  });

  test('physics: a body falling onto the piece in play rests on it (never through it); a move or turn into bodies never passes them', () => {
    const g = phys({ seed: 5 });
    const x = X(g), W = x.W;
    aim(g, 'I', 3, 0);
    lowerToRest(g);
    const top = g.piece.y - x.off + 1;
    // An O let fall onto the I from above.
    W.bodies.push(Physics.fromCells(W.next++, [[4, 4], [5, 4], [4, 5], [5, 5]], [5, 5, 5, 5], 0, 0, -6));
    run(g, 2);
    const o = W.bodies[0];
    assert(o.y0 > top - 0.06, 'rests on the piece: ' + o.y0.toFixed(3) + ' over ' + top);
    assert.strictEqual(g.s.pieces, 0, 'and that did not set it');
    // Random moves and turns among bodies: the piece never overlaps one by more than a graze.
    const h = phys({ seed: 6 }), y = X(h);
    randomPlay(h, 14, 11, 0.5);
    let s = 17;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 200 && h.piece && !h.over; i++) {
      const r = rnd();
      if (r < 0.35) h.move(-1); else if (r < 0.7) h.move(1); else if (r < 0.85) h.rotate(1); else y.tick(h, 1 / 60, { soft: true });
      y.tick(h, 1 / 60, {});
      const p = h.piece;
      assert(!Physics.hits(y.W, p.type.rots[p.rot].map(([cx, cy]) => [h.board.wx(p.x + cx), cy]), p.y - y.off, 0.12), 'the piece is inside a body after step ' + i);
    }
  });

  test('physics: bodies never lose a mino but to a clear, never tear, and none floats (random play, hard and soft, three widths)', () => {
    for (const [w, h, seed] of [[6, 14, 3], [10, 20, 5], [14, 24, 7]]) {
      const g = phys({ w, h, seed });
      let placed = 0, removed = 0;
      g.on('lock', (r) => { placed += r.cells.length; });
      const ev = randomPlay(g, 45, seed * 31, 0.6).concat(run(g, 4));
      for (const e of ev) if (e.type === 'clear') removed += e.minos;
      const W = X(g).W;
      // (A board that filled up stops its clock: let what was still moving come to rest.)
      if (g.over) settle(W, 4);
      assert.strictEqual(minosOf(W), placed - removed, 'minos placed less minos cleared, w ' + w);
      for (const b of W.bodies) {
        // No tearing: every edge of every mino stays near a cell long, and every mino keeps most of its area.
        for (let k = 0; k < b.m; k++) {
          const q = b.q;
          let area = 0;
          for (let e = 0; e < 4; e++) {
            const i = q[4 * k + e], j = q[4 * k + ((e + 1) & 3)];
            const len = Math.hypot(b.x[j] - b.x[i], b.y[j] - b.y[i]);
            assert(len > 0.5 && len < 1.6, 'an edge ' + len.toFixed(2) + ' long (w ' + w + ')');
            area += b.x[i] * b.y[j] - b.x[j] * b.y[i];
          }
          assert(area / 2 > 0.6 && area / 2 < 1.4, 'a mino keeps its area: ' + (area / 2).toFixed(2));
        }
        // One piece: its minos joined through shared corners.
        const keep = new Uint8Array(b.m).fill(1);
        assert.strictEqual(Physics.split({ next: 1e6 }, b, keep).length, 1, 'body ' + b.id + ' is one piece');
        // Nothing floats: on the floor or resting on another body (something within a hair under its lowest point).
        // (or on the piece in play: it holds up what falls on it, until it is let go)
        const K = W.kin, onPiece = !!K && K.cells.some(([x, y]) => x + 1 > b.x0 - 0.05 && x < b.x1 + 0.05 && y - K.off + 1 > b.y0 - 0.12 && y - K.off < b.y0);
        const held = onPiece || b.y0 < 0.06 || W.bodies.some((o) => o !== b && o.x1 > b.x0 - 0.05 && o.x0 < b.x1 + 0.05 && o.y1 > b.y0 - 0.12 && o.y0 < b.y0);
        assert(held, 'body ' + b.id + ' at ' + b.y0.toFixed(2) + '..' + b.y1.toFixed(2) + ' x ' + b.x0.toFixed(2) + '..' + b.x1.toFixed(2) + ' rests on something (w ' + w + '; ' + (W.kin ? JSON.stringify(W.kin.cells) + ' off ' + W.kin.off : 'no piece') + '; awake ' + b.awake + '; over ' + g.over + ')');
      }
    }
  });

  test('physics: a stack 15 rows tall (soft jelly) sinks under its own weight by less than a row (7%), never into itself, then sleeps', () => {
    // Two I pieces a row against the walls (8 of 10 cells: no band clears), fifteen rows.
    const shapes = [];
    for (let y = 0; y < 15; y++) { shapes.push([[0, y], [1, y], [2, y], [3, y]]); shapes.push([[6, y], [7, y], [8, y], [9, y]]); }
    const W = world(10, 24, shapes);
    settle(W, 30);
    const top = Math.max(...W.bodies.map((b) => b.y1));
    if (process.env.PHYSICS_TABLE) console.log('       15 rows settle at ' + top.toFixed(3));
    assert(top > 15 - 1 && top < 15.1, 'the top at ' + top.toFixed(3));
    assert(overlapOf(W) < 0.15, 'rows sunk into each other: ' + overlapOf(W).toFixed(3));
    assert(W.bodies.every((b) => !b.awake), 'all asleep');
    assert.strictEqual(Physics.clearBands(W), null);
  });

  test('physics: pieces never merge: a pile of random hard drops keeps every piece its own, nothing inside another, as tall as its minos', () => {
    const sv = P.COVER;
    P.COVER = 5; // (no clears: the pile as it falls)
    try {
      for (const seed of [1, 2]) {
        const g = phys({ seed });
        let s = seed * 77 + 1;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        let worst = 0;
        for (let n = 0; n < 26 && g.piece && !g.over; n++) {
          for (let k = Math.floor(rnd() * 4); k > 0; k--) g.rotate(1);
          const dx = Math.floor(rnd() * 10) - g.piece.x;
          for (let k = 0; k < Math.abs(dx); k++) g.move(Math.sign(dx));
          X(g).hardDrop(g);
          run(g, 0.25);
          if (n % 5 === 4) worst = Math.max(worst, overlapOf(X(g).W));
        }
        const W = X(g).W;
        for (let i = 0; i < 600; i++) Physics.stepWorld(W);
        const minos = minosOf(W), ov = overlapOf(W), top = Math.max(...W.bodies.map((b) => b.y1));
        if (process.env.PHYSICS_TABLE) console.log('       pile ' + seed + ': ' + minos + ' minos, ' + top.toFixed(2) + ' tall, overlap ' + ov.toFixed(3) + ' at rest, ' + worst.toFixed(3) + ' at worst in motion');
        assert(ov < 0.004 * minos && worst < 0.01 * minos, 'pieces sunk into each other: ' + ov.toFixed(3) + ' / ' + worst.toFixed(3) + ' of ' + minos);
        // Every body is one piece (or a part a clear split off); none shares a particle with another.
        for (const b of W.bodies) assert.strictEqual(Physics.split({ next: 1e6 }, b, new Uint8Array(b.m).fill(1)).length, 1);
        // Volume kept: at least as tall as its minos packed solid, and every mino about its area.
        assert(top >= minos / 10 - 0.3, 'it melted: ' + top.toFixed(2) + ' tall for ' + minos + ' minos');
        for (const b of W.bodies) for (let k = 0; k < b.m; k++) { let a = 0; const q = quadOf(b, k); for (let i = 0; i < 4; i++) a += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1]; assert(a / 2 > 0.75 && a / 2 < 1.2, 'a mino of area ' + (a / 2).toFixed(2)); }
      }
    } finally { P.COVER = sv; }
  });

  test('physics: jelly is malleable: a piece over a gap sags and keeps the bend, an impact dents and squishes, each mino stays near a square', () => {
    // A six-long bar over a gap of four: its middle sags, it stays sagged (its rest shape took it), and it does not fall.
    const W = world(10, 20, [[[0, 0], [0, 1]], [[5, 0], [5, 1]], [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2]]]);
    settle(W, 6);
    const bar = W.bodies[2], bottom = (lx) => { let y = 0; for (let i = 0; i < bar.n; i++) if (bar.lx[i] === lx && bar.ly[i] === 2) y = bar.y[i]; return y; };
    const sag = (bottom(0) + bottom(6)) / 2 - bottom(3);
    let kept = 0; for (let i = 0; i < bar.n; i++) kept = Math.max(kept, Math.hypot(bar.rx[i] - bar.lx[i], bar.ry[i] - bar.ly[i]));
    if (process.env.PHYSICS_TABLE) console.log('       a bar over a gap of 4 sags ' + sag.toFixed(3) + ', its rest shape ' + kept.toFixed(3) + ' from the grid');
    assert(sag > 0.25 && sag < 0.8, 'it sags: ' + sag.toFixed(3));
    assert(kept > 0.1, 'and keeps the bend');
    assert(bar.y0 > 1.0, 'held up by the two posts');
    // A hard drop onto a stack: the piece squishes on impact (well off its rigid shape), and the minos stay near squares.
    const V = world(10, 20, [0, 2, 4, 6].map((x) => [[x, 0], [x + 1, 0], [x, 1], [x + 1, 1]]));
    settle(V, 2);
    const I = Physics.fromCells(V.next++, [[2, 8], [3, 8], [4, 8], [5, 8]], [1, 1, 1, 1], 0, 0, -P.HARD_V);
    V.bodies.push(I);
    let squish = 0;
    for (let i = 0; i < 90; i++) {
      Physics.stepWorld(V);
      for (let k = 0; k < I.m; k++) {
        const q = quadOf(I, k);
        for (let e = 0; e < 4; e++) { const l = Math.hypot(q[(e + 1) % 4][0] - q[e][0], q[(e + 1) % 4][1] - q[e][1]); assert(l > 1 - P.SQUASH - 0.02 && l < 1 + P.SQUASH + 0.02, 'an edge ' + l.toFixed(3)); }
        const a = Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]), b = Math.hypot(q[3][0] - q[1][0], q[3][1] - q[1][1]);
        squish = Math.max(squish, Math.abs(a - b));
      }
    }
    if (process.env.PHYSICS_TABLE) console.log('       a hard drop squishes its minos by up to ' + squish.toFixed(3) + ' (the difference of their diagonals)');
    assert(squish > 0.05, 'it squishes: ' + squish.toFixed(3));
  });

  test('physics: at rest everything sleeps and the world does no work; a strike wakes what it hits and what rests on it', () => {
    const W = world(10, 20, [[[0, 0], [1, 0], [2, 0], [3, 0]], [[1, 1], [2, 1], [1, 2], [2, 2]], [[6, 0], [7, 0], [6, 1], [7, 1]]]);
    settle(W, 3);
    assert(W.bodies.every((b) => !b.awake));
    const cost = W.cost;
    assert.strictEqual(Physics.stepWorld(W), false, 'no work at rest');
    assert.strictEqual(W.cost, cost);
    // A hard hit on the I: it and the O on it wake; the far O does not.
    W.bodies.push(Physics.fromCells(W.next++, [[0, 3], [0, 4]], [3, 3], 0.5, 0, -P.HARD_V));
    for (let i = 0; i < 12; i++) Physics.stepWorld(W);
    assert(W.bodies[0].awake && W.bodies[1].awake, 'struck and stacked on it: awake');
    assert(!W.bodies[2].awake, 'the far one sleeps on');
  });

  test('physics: a hard drop lands hard and knocks what it hits; a soft drop sets down gently', () => {
    const knock = (hard) => {
      const g = phys({ seed: 4 });
      aim(g, 'O', 4, 0);
      X(g).hardDrop(g);
      run(g, 2.5);
      const W = X(g).W, base = W.bodies[0], at = [base.x0, base.y0];
      aim(g, 'I', 3, 0);
      let peak = 0;
      if (hard) X(g).hardDrop(g);
      else { lowerToRest(g); X(g).release(g); }
      const land = W.bodies[1];
      let maxV = 0;
      for (let i = 0; i < 60; i++) {
        X(g).tick(g, 1 / 60, {});
        let v = 0; for (let k = 0; k < base.n; k++) v = Math.max(v, Math.hypot(base.x[k] - base.px[k], base.y[k] - base.py[k]) * 240);
        maxV = Math.max(maxV, v);
        peak = Math.max(peak, land.y0);
      }
      return { maxV, moved: Math.hypot(base.x0 - at[0], base.y0 - at[1]) };
    };
    const hard = knock(true), soft = knock(false);
    assert(hard.maxV > 3, 'the hard drop knocks the O: ' + hard.maxV.toFixed(2) + ' cells/s');
    assert(soft.maxV < hard.maxV / 2, 'a soft drop is gentle: ' + soft.maxV.toFixed(2) + ' vs ' + hard.maxV.toFixed(2));
  });

  // ---- clears --------------------------------------------------------------------------------------------------------

  test('physics: a band clears whole minos the moment it is covered (90%); what it crossed splits; what was above falls', () => {
    // Row 0: two I pieces and a J standing in the last two columns (8, 9); the J goes on up column 9.
    const W = world(10, 20, [[[0, 0], [1, 0], [2, 0], [3, 0]], [[4, 0], [5, 0], [6, 0], [7, 0]], [[8, 0], [9, 0], [9, 1], [9, 2]]]);
    const before = minosOf(W);
    const c = Physics.clearBands(W);
    assert(c && c.bands === 1 && c.rows[0] === 0);
    assert.strictEqual(c.removed.length, 10, 'ten whole minos');
    assert.strictEqual(minosOf(W), before - 10);
    assert.deepStrictEqual(W.bodies.map((b) => b.m), [2], 'the J\'s two left above are one body');
    assert(W.bodies[0].awake, 'and it falls');
    settle(W, 2);
    assert(W.bodies[0].y0 < 0.06, 'down to the floor');
    // 90%: nine of ten covered clears; eight does not.
    const nine = world(10, 20, [[[0, 0], [1, 0], [2, 0], [3, 0]], [[4, 0], [5, 0], [6, 0], [7, 0]], [[8, 0]]]);
    assert(Physics.clearBands(nine), 'nine of ten');
    const eight = world(10, 20, [[[0, 0], [1, 0], [2, 0], [3, 0]], [[4, 0], [5, 0], [6, 0], [7, 0]]]);
    assert.strictEqual(Physics.clearBands(eight), null, 'eight of ten');
    // A body crossing the band splits into its connected parts: an I standing in column 9 through row 2.
    const W2 = world(10, 20, [[[9, 0], [9, 1], [9, 2], [9, 3]], [[0, 2], [1, 2], [2, 2], [3, 2]], [[4, 2], [5, 2], [6, 2], [7, 2]], [[8, 2]]]);
    const c2 = Physics.clearBands(W2);
    assert(c2 && c2.rows[0] === 2 && c2.removed.length === 10);
    assert.deepStrictEqual(W2.bodies.map((b) => b.m).sort(), [1, 2], 'the I splits below and above the band');
    // Never a mino passing through: one moving fast is not counted.
    const fast = world(10, 20, [[[0, 0], [1, 0], [2, 0], [3, 0]], [[4, 0], [5, 0], [6, 0], [7, 0]], [[8, 0], [9, 0]]]);
    fast.bodies[2].py.forEach((v, i, a) => { a[i] = v + 0.1; });
    assert.strictEqual(Physics.clearBands(fast), null);
  });

  test('physics: a band clears by the area the minos really cover: overlaps count once, gaps count, a sagged row is met where it is', () => {
    const row = (xs, ys) => world(10, 20, xs.map((x, i) => [[x, ys ? ys[i] : 0]]));
    const lift = (W, ys) => W.bodies.forEach((b, i) => { for (let k = 0; k < b.n; k++) { b.y[k] += ys[i]; b.py[k] += ys[i]; } b.bounds(); });
    // Ten minos, every other one half a row up: their centres share a grid row, but they cover only about 80% of any band.
    const zig = row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    lift(zig, [0, 0.45, 0, 0.45, 0, 0.45, 0, 0.45, 0, 0.45]);
    assert.strictEqual(Physics.clearBands(zig), null, 'a zigzag row is not full');
    // Eleven minos crowded into the room of eight (each sunk into the next): eight cells' worth of cover, not eleven.
    const crowd = world(10, 20, []);
    for (let i = 0; i < 11; i++) { const b = Physics.fromCells(crowd.next++, [[0, 0]], [3], 0, 0, 0); for (let k = 0; k < b.n; k++) { b.x[k] += i * 0.7; b.px[k] += i * 0.7; } b.bounds(); crowd.bodies.push(b); }
    assert.strictEqual(Physics.clearBands(crowd), null, 'overlaps count once');
    // Nine minos with a hair between each (and one gap): about 90% and it clears; eight with gaps does not.
    assert(Physics.clearBands(row([0, 1, 2, 3, 4, 5, 6, 7, 9])), 'nine of ten');
    assert.strictEqual(Physics.clearBands(row([0, 1, 2, 3, 5, 6, 7, 9])), null, 'eight of ten');
    // A whole row sagged a third of a row: the band follows it.
    const sag = row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    lift(sag, Array(10).fill(0.33));
    const c = Physics.fullBands(sag);
    assert(c.length === 1 && c[0].cover > 9.9, 'a sagged row is full: ' + JSON.stringify(c.map((b) => b.cover)));
  });

  test('physics: a clear in play is counted and paid at once, per mino, at the reduced rate, and nothing waits for the board to rest', () => {
    const g = phys({ seed: 6 });
    // Row 0 nearly full of bodies already; an I set into the gap fills it.
    const W = X(g).W;
    for (const cells of [[[0, 0], [1, 0], [2, 0]], [[7, 0], [8, 0], [9, 0]]]) W.bodies.push(Physics.fromCells(W.next++, cells, cells.map(() => 5), 0, 0, 0));
    aim(g, 'I', 3, 0);
    X(g).hardDrop(g);
    const ev = run(g, 0.5);
    const cl = ev.find((e) => e.type === 'clear');
    assert(cl, 'the band clears');
    assert.strictEqual(cl.minos, 10);
    assert(Math.abs(cl.pay - (10 / 10) * g.rules.lk * Physics.WORTH) < 1e-9, 'WORTH of a row');
    assert.strictEqual(g.s.lines, 1);
    assert(Math.abs(g.s.own - 1) < 1e-9);
    assert(ev.indexOf(cl) < 10, 'within a few steps of the landing');
  });

  // ---- time --------------------------------------------------------------------------------------------------------------

  test('physics: Rewind 5 s brings back the bodies, the piece, the queue and the numbers of about five seconds ago', () => {
    const g = phys({ seed: 8 });
    randomPlay(g, 6, 99, 1);
    run(g, 1);
    const X0 = X(g), t0 = X0.t;
    const state = () => ({ n: X0.W.bodies.length, m: minosOf(X0.W), pos: X0.W.bodies.map((b) => +b.x0.toFixed(3) + ',' + +b.y0.toFixed(3)).join(' '), piece: g.piece && [g.piece.type.id, g.piece.x, g.piece.y], queue: g.queue.map((e) => e.id).join(''), pieces: g.s.pieces, score: g.s.score });
    // The snapshot just taken (one every quarter second): then on, past five seconds of it, then back.
    while (!X0.snaps.length || X0.snaps[X0.snaps.length - 1].t < X0.t - 1e-9) X0.tick(g, P.STEP, {});
    const snap = X0.snaps[X0.snaps.length - 1], at = state();
    randomPlay(g, 8, 7, 1);
    while (X0.t - snap.t < 5 + 1e-6) X0.tick(g, P.STEP, {});
    assert.notDeepStrictEqual(state(), at);
    assert(X0.rewindTarget().t === snap.t, 'the target is the newest snapshot at least five seconds old: ' + [X0.t, snap.t, X0.rewindTarget() && X0.rewindTarget().t, X0.snaps[0].t, g.over]);
    const r = X0.rewind(g);
    assert(r && Math.abs(r.back - 5) < 0.3, 'about five seconds: ' + (r && r.back));
    assert.deepStrictEqual(state(), at);
    assert(X0.t < t0 + 0.3);
    assert(!g.over);
    // With nothing in the buffer, nothing to rewind.
    const fresh = phys();
    assert.strictEqual(X(fresh).rewind(fresh), null);
  });

  test('physics: the board fills up when a new piece cannot appear, or when settled bodies stand above the top line for 1.5 s', () => {
    const g = phys({ w: 6, h: 10, seed: 3 });
    let ends = 0;
    g.on('topout', () => ends++);
    // Bodies piled where the pieces appear (no band full): the piece in play is let go, the next has no room.
    const Wg = X(g).W;
    for (let y = 0; y < 9; y++) Wg.bodies.push(Physics.fromCells(Wg.next++, [[1, y], [2, y], [3, y], [4, y]], [3, 3, 3, 3], 0, 0, 0));
    run(g, 0.5);
    assert(!g.over, 'not before it is let go');
    X(g).hardDrop(g);
    run(g, 0.5);
    assert(g.over && ends === 1, 'full, once');
    // Above the line: a tall stack against the wall reaching past the top (nothing in play).
    const h = phys({ w: 10, h: 8, seed: 3 });
    const W = X(h).W;
    for (let y = 0; y < 12; y++) W.bodies.push(Physics.fromCells(W.next++, [[0, y], [1, y], [2, y], [3, y]], [3, 3, 3, 3], 0, 0, 0), Physics.fromCells(W.next++, [[4, y], [5, y], [6, y], [7, y]], [3, 3, 3, 3], 0, 0, 0));
    h.piece = null;
    let t = 0;
    while (!h.over && t < 6) { run(h, 0.1); t += 0.1; }
    assert(h.over, 'over');
    assert(t > 1.4 && t < 4, 'after a second and a half above the line: ' + t.toFixed(1));
  });

  test('physics: the save keeps the bodies (and a picture of them for thumbnails); a resumed board goes on', () => {
    const g = phys({ seed: 9 });
    randomPlay(g, 12, 5, 0.5);
    run(g, 2);
    const j = JSON.parse(JSON.stringify(g.toJSON()));
    assert(j.x.physics && j.x.physics.v === 1);
    assert(j.cells.some((v) => v), 'the save\'s cells picture the bodies');
    assert(Recipe.valid(j));
    const r = new Game({ saved: j });
    assert(r.board.cells.every((v) => !v), 'the grid is empty again in play');
    const a = X(g).W, b = X(r).W;
    assert.strictEqual(b.bodies.length, a.bodies.length);
    assert.strictEqual(minosOf(b), minosOf(a));
    for (let i = 0; i < a.bodies.length; i++) assert(Math.abs(a.bodies[i].x0 - b.bodies[i].x0) < 1e-3 && Math.abs(a.bodies[i].y0 - b.bodies[i].y0) < 1e-3);
    run(r, 2);
    assert(!r.over || r.s.pieces >= g.s.pieces);
  });

  test('physics + Classic: Classic moves the piece (its gravity and lock), Physics the bodies; bands count as Classic lines', () => {
    const g = new Game({ w: 10, h: 20, seed: 2, recipe: Recipe.normalize({ mods: { physics: true }, mode: 'classic', classic: { type: 'b', height: 3 } }) });
    assert.strictEqual(X(g).drive, false);
    assert(g.board.cells.every((v) => !v), 'no garbage with Physics');
    // Run as Classic's controller does: the piece down a row at a time, locked when it cannot go on.
    const before = g.piece.y;
    run(g, 1);
    assert.strictEqual(g.piece.y, before, 'Physics does not move it');
    while (g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y - 1)) g.piece.y--;
    g.lock();
    run(g, 1);
    assert.strictEqual(X(g).W.bodies.length, 1);
    assert(X(g).W.bodies[0].y0 < 0.06, 'set flush where it rests');
    const W = X(g).W;
    for (const cells of [[[0, 3], [1, 3], [2, 3], [3, 3]], [[4, 3], [5, 3], [6, 3], [7, 3]], [[8, 3], [9, 3]]]) W.bodies.push(Physics.fromCells(W.next++, cells, cells.map(() => 3), 0, 0, 0));
    W.bodies.slice(0, 1).forEach((b) => { b.awake = true; });
    W.hashed = false;
    run(g, 0.2);
    assert.strictEqual(L.Classic.of(g).lines, 1, 'Classic counted the band');
  });

  // ---- pay ------------------------------------------------------------------------------------------------------------

  /** A Standard board played by a greedy bot (the most rows, then the fewest holes, low and flat), paid as Free Play pays. */
  function standard(seed, n, lean) {
    const g = new Game({ w: 10, h: 20, seed, recipe: {}, previewCount: 1 });
    const holes = (c) => { let k = 0; for (let x = 0; x < 10; x++) { let roof = false; for (let y = 19; y >= 0; y--) { if (c[y * 10 + x]) roof = true; else if (roof) k++; } } return k; };
    const hts = (c) => { const o = []; for (let x = 0; x < 10; x++) { let t = 0; for (let y = 19; y >= 0; y--) if (c[y * 10 + x]) { t = y + 1; break; } o.push(t); } return o; };
    let pay = 0, actions = 0, pieces = 0;
    for (; pieces < n && g.piece && !g.over; pieces++) {
      const t = g.piece.type;
      let best = null;
      for (let rot = 0; rot < 4; rot++) {
        const b = t.rotBounds[rot];
        for (let x = -b.minX; x <= 9 - b.maxX; x++) {
          const s = g.simulate(t, rot, x, g.board);
          if (!s) continue;
          const hs = hts(s.board.cells);
          let cost = -(s.n + s.c) * 1000 + holes(s.board.cells) * 60 + Math.max(...hs) * 4 + hs.reduce((a, v) => a + v, 0) * 0.5 + hs.slice(1).reduce((a, v, i) => a + Math.abs(v - hs[i]), 0);
          if (lean) cost += (Math.min(rot, 4 - rot) + Math.abs(x - g.piece.x)) * 40;
          if (!best || cost < best.cost) best = { cost, rot, x };
        }
      }
      if (!best) break;
      actions += Math.min(best.rot, 4 - best.rot) + Math.abs(best.x - g.piece.x) + 1;
      g.piece.rot = best.rot; g.piece.x = best.x; g.piece.y = 19 - t.rotBounds[best.rot].maxY;
      if (!g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y)) break;
      const r = g.drop();
      if (!r) break;
      g.s.mult = Pay.mult(g);
      if (r.lines) pay += Pay.clear(g.s, r, g.rules).pay;
    }
    return { pay, actions, pieces };
  }
  /**
   * A Physics board played by a bot: the column and turn that keep the surface lowest (the bodies' picture), lowered
   * with ↓ and set down gently (↓ again: the careful way, which clears more than throwing it).
   */
  function physicsBot(seed, n, w) {
    const g = phys({ w, h: 20, seed });
    let pay = 0, actions = 0, pieces = 0;
    g.on('lock', () => { pieces++; });
    for (let i = 0; i < n && g.piece && !g.over; i++) {
      const cells = Physics.raster(X(g).W, g.w, g.h), t = g.piece.type;
      const hs = []; for (let x = 0; x < g.w; x++) { let top = 0; for (let y = g.h - 1; y >= 0; y--) if (cells[y * g.w + x]) { top = y + 1; break; } hs.push(top); }
      let best = null;
      for (let rot = 0; rot < 4; rot++) {
        const b = t.rotBounds[rot];
        for (let x = -b.minX; x <= g.w - 1 - b.maxX; x++) {
          let land = 0; for (const [cx, cy] of t.rots[rot]) land = Math.max(land, hs[x + cx] - cy);
          let gaps = 0; for (const [cx, cy] of t.rots[rot]) gaps += land + cy - hs[x + cx];
          const cost = land * 3 + gaps * 2 + (Math.min(rot, 4 - rot) + Math.abs(x - g.piece.x)) * 0.1;
          if (!best || cost < best.cost) best = { cost, rot, x };
        }
      }
      const p = g.piece;
      actions += Math.min(best.rot, 4 - best.rot) + Math.abs(best.x - p.x) + 2;
      for (let k = 0; k < best.rot; k++) g.rotate(1);
      for (let k = 0; k < 12 && p.x !== best.x; k++) if (!g.move(Math.sign(best.x - p.x))) break;
      // (↓ held all the way, at once: straight down to what it meets.)
      const x = X(g), rel = x.rel(g, p);
      let lo = p.y - x.off;
      while (lo > 0 && !Physics.hits(x.W, rel, lo - 0.25, 1e-4)) lo -= 0.25;
      x.place(p, Math.max(0, x.contact(g, p, lo, lo - 0.25)));
      if (!x.release(g)) x.hardDrop(g);
      for (const e of run(g, 0.5)) if (e.type === 'clear') pay += e.pay;
    }
    return { pay, actions, pieces };
  }

  test('physics: fairness: a bot never earns more per piece or per action than on a Standard board; no quads, T-spins or streak', () => {
    const T = process.env.PHYSICS_TABLE;
    // Standard, as well as a simple bot plays it: the better of a greedy one and one that spares keys, each metric.
    let stdPiece = 0, stdAction = 0;
    for (const lean of [false, true]) {
      const std = { pay: 0, actions: 0, pieces: 0 };
      for (const seed of [1, 2, 3]) { const r = standard(seed, 300, lean); for (const k in std) std[k] += r[k]; }
      stdPiece = Math.max(stdPiece, std.pay / std.pieces); stdAction = Math.max(stdAction, std.pay / std.actions);
    }
    let total = 0;
    for (const w of [6, 10, 16]) {
      const ph = { pay: 0, actions: 0, pieces: 0 };
      for (const seed of [1, 2]) { const r = physicsBot(seed, 90, w); for (const k in ph) ph[k] += r[k]; }
      const perPiece = ph.pay / ph.pieces, perAction = ph.pay / ph.actions;
      if (T) console.log('       w ' + w + ': per piece ' + perPiece.toFixed(4) + ' (Standard ' + stdPiece.toFixed(4) + '), per action ' + perAction.toFixed(4) + ' (Standard ' + stdAction.toFixed(4) + ')');
      total += ph.pay;
      assert(perPiece <= stdPiece, 'per piece, w ' + w + ': ' + perPiece + ' > ' + stdPiece);
      assert(perAction <= stdAction, 'per action, w ' + w + ': ' + perAction + ' > ' + stdAction);
      // The ceiling: every mino of every piece cleared, at WORTH: never above Standard's cells.
      assert(ph.pay <= ph.pieces * 4 * Physics.WORTH * (w / 10) / w + 1e-9);
    }
    // (Honest clears are hard to come by for a bot that reads the bodies as a grid: it clears now and then.)
    assert(total > 0, 'it clears');
    // No difficult clears: the multiplier stays ×1 and nothing is a quad.
    const g = phys({ seed: 3 });
    randomPlay(g, 30, 3, 1);
    assert.strictEqual(g.s.quadRun || 0, 0);
    assert(g.s.b2b < 0 && g.s.tspins === 0);
  });

  test('physics: hard-drop spam (random columns and turns, a drop every quarter second) tops out about as soon as on Standard, with few lines', () => {
    const T = process.env.PHYSICS_TABLE;
    const spam = (seed, physics) => {
      const g = physics ? phys({ seed }) : new Game({ w: 10, h: 20, seed, recipe: {} });
      let s = seed * 77 + 1, n = 0;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      while (n < 300 && g.piece && !g.over) {
        for (let k = Math.floor(rnd() * 4); k > 0; k--) g.rotate(1);
        const dx = Math.floor(rnd() * 10) - g.piece.x;
        for (let k = 0; k < Math.abs(dx); k++) g.move(Math.sign(dx));
        n++;
        if (physics) { X(g).hardDrop(g); run(g, 0.25); } else if (!g.drop()) break;
      }
      return { n, lines: g.s.lines };
    };
    const sum = (rs) => rs.reduce((a, r) => ({ n: a.n + r.n, lines: a.lines + r.lines }), { n: 0, lines: 0 });
    const ph = sum([1, 2, 3, 4, 5].map((k) => spam(k, true))), st = sum([1, 2, 3, 4, 5].map((k) => spam(k, false)));
    if (T) console.log('       spam: Physics tops out after ' + (ph.n / 5).toFixed(1) + ' pieces (' + (ph.lines / ph.n).toFixed(3) + ' lines a piece), Standard ' + (st.n / 5).toFixed(1) + ' (' + (st.lines / st.n).toFixed(3) + ')');
    assert(ph.n / 5 < 2 * (st.n / 5), 'Physics spam lasts ' + ph.n / 5 + ' pieces, Standard ' + st.n / 5);
    assert(ph.lines / ph.n < 0.05, 'spam clears ' + (ph.lines / ph.n).toFixed(3) + ' lines a piece');
  });

  // ---- cost ------------------------------------------------------------------------------------------------------------

  test('physics: a full 20 × 40 board costs little a frame, all of it awake (at rest: nothing, above)', () => {
    const W = new Physics.World(20, 40, 'jelly');
    // Every row 17 of 20 cells (no band full yet), in runs of up to four.
    for (let y = 0; y < 38; y++) {
      const gap = (y * 7) % 20, cells = [];
      for (let c = 0; c < 20; c++) if (c < gap || c >= gap + 3) cells.push(c);
      let runC = [];
      const flush = () => { if (runC.length) W.bodies.push(Physics.fromCells(W.next++, runC.map((c) => [c, y]), runC.map(() => 3), 0, 0, 0)); runC = []; };
      for (const c of cells) { if (runC.length && (c !== runC[runC.length - 1] + 1 || runC.length === 4)) flush(); runC.push(c); }
      flush();
    }
    const minos = minosOf(W);
    assert(minos > 600, minos + ' minos');
    const frame = () => { Physics.stepWorld(W); Physics.stepWorld(W); Physics.clearBands(W); };
    for (let i = 0; i < 90; i++) frame(); // warm up (the JIT), and let the first bands go
    for (const b of W.bodies) { b.awake = true; b.still = 0; }
    const F = 120, t = process.hrtime.bigint();
    let worst = 0;
    for (let i = 0; i < F; i++) { const t1 = process.hrtime.bigint(); frame(); worst = Math.max(worst, Number(process.hrtime.bigint() - t1) / 1e6); }
    const ms = Number(process.hrtime.bigint() - t) / 1e6 / F;
    if (process.env.PHYSICS_TABLE) console.log('       ' + minos + ' minos, all awake: ' + ms.toFixed(2) + ' ms a frame on average, ' + worst.toFixed(2) + ' at worst');
    assert(ms < 8, ms.toFixed(2) + ' ms a frame (the budget in the page is 4; Node on a busy machine gets twice)');
  });
};
