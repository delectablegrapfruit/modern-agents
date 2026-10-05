#!/usr/bin/env node
// Lull's game logic, tested in Node: pieces and kicks, the floating-piece engine and every item, puzzle generation
// (each seed is replayed through the real engine to prove it can be solved), the economy, and the save.
//   node Lull/scripts/test.cjs
'use strict';
const assert = require('assert');
const load = require('./load.cjs');
const L = load([
  'util.js', 'pieces.js', 'board.js', 'recipe.js', 'engine.js', 'items.js', 'library.js', 'puzzlegen.js', 'store.js', 'achievements.js',
  // The board options' pure parts (js/recipe.js): each branch replaces its own line.
  'polytable.js', 'minsize.js', 'shapes.js',
  'mirror.js',
  'physics.js',
  'descent.js',
  'classic.js',
  // The Watch bot (js/bot.js): its search, worth, choice, mistakes and hands, headless.
  'bot.js',
  'versus.js',
  'race.js',
  'battle.js',
  'mural.js',
  // The Play menu's rules (Solo or Multiplayer, resume by rules): its page is drawn only in a browser.
  'menu.js',
]);
const { Pieces, Board, Game, Puzzles, RNG } = L;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
}
const cellKey = (cells) => cells.map((c) => c.join(',')).sort().join(';');
// The Free Play multiplier on a plain board w wide after a streak of n (Pay.mult, the real thing), and the most it gets.
const multAt = (w, n) => L.Pay.mult({ w, s: { b2b: n - 1 } }), capAt = (w) => multAt(w, 1000);

console.log('basics');
test('seeded randomness repeats', () => {
  const a = new RNG('x'), b = new RNG('x');
  for (let i = 0; i < 100; i++) assert.strictEqual(a.u32(), b.u32());
  const r = new RNG(7); let sum = 0;
  for (let i = 0; i < 10000; i++) sum += r.next();
  assert(Math.abs(sum / 10000 - 0.5) < 0.02);
});
test('seed codes round-trip', () => {
  const r = new RNG(1);
  for (let i = 0; i < 1000; i++) { const n = r.u32(); assert.strictEqual(L.intFromCode(L.codeFromInt(n)), n); }
  assert.strictEqual(L.intFromCode('bad'), null);
  assert.deepStrictEqual(Puzzles.parseSeed(' m-3k7q2xa '), { diff: 'M', spin: false, code: '3K7Q2XA', seed: 'M-3K7Q2XA' });
  assert.strictEqual(Puzzles.parseSeed('Q-3K7Q2XA'), null);
  assert.strictEqual(Puzzles.parseSeed('M-3K7Q2X'), null);
  assert.strictEqual(Puzzles.parseSeed('M-3K7Q2X0'), null, 'no 0, O, 1 or I');
});
test('free polyomino counts', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => Pieces.freePolyominoes(n).length), [1, 1, 2, 5, 12, 35, 108, 369]);
});
test('four turns come back to the start', () => {
  for (const id of Object.keys(Pieces.TYPES)) {
    const t = Pieces.TYPES[id];
    assert.strictEqual(cellKey(Pieces.rotateCW(t.rots[3], t.n)), cellKey(t.rots[0]), id);
  }
});
test('Lull kicks: T turns from spawn to pointing right', () => {
  assert.strictEqual(cellKey(Pieces.TYPES.T.rots[1]), cellKey([[1, 2], [1, 1], [2, 1], [1, 0]]));
});
test('mirror pairs', () => {
  assert.strictEqual(Pieces.mirrorOf(Pieces.TYPES.J).id, 'L');
  assert.strictEqual(Pieces.mirrorOf(Pieces.TYPES.S).id, 'Z');
  const f = Pieces.mirrorOf(Pieces.TYPES.F);
  assert.notStrictEqual(Pieces.keyOf(f.rots[0]), Pieces.keyOf(Pieces.TYPES.F.rots[0]));
  assert.strictEqual(Pieces.freeKey(f.rots[0]), Pieces.freeKey(Pieces.TYPES.F.rots[0]));
});
test('big pieces are the small ones doubled', () => {
  const b = Pieces.bigOf('T');
  assert.strictEqual(b.size, 16);
  assert.strictEqual(b.n, 6);
  assert(Pieces.isConnected(b.rots[1]));
});
test('custom shapes register and come back by id', () => {
  const t = Pieces.customType([[0, 0], [1, 0], [2, 0], [2, 1], [3, 1]]);
  assert.strictEqual(Pieces.get(t.id), t);
  assert.strictEqual(t.size, 5);
});

console.log('board and engine');
test('full rows clear and the rest comes down', () => {
  const b = new Board(4, 4);
  for (let x = 0; x < 4; x++) { b.set(x, 0, 1); b.set(x, 2, 1); }
  b.set(1, 1, 3); b.set(2, 3, 4);
  const rows = b.fullRows();
  assert.deepStrictEqual(rows, [0, 2]);
  b.clearRows(rows);
  assert.strictEqual(b.get(1, 0), 3);
  assert.strictEqual(b.get(2, 1), 4);
  assert.strictEqual(b.count(), 2);
});
test('wraparound boards wrap', () => {
  const b = new Board(5, 3, { wrap: true });
  assert(b.fits([[0, 0], [1, 0]], 4, 0));
  b.place([[0, 0], [1, 0]], 4, 0, 2);
  assert.strictEqual(b.get(0, 0), 2);
  assert.strictEqual(b.get(4, 0), 2);
});
test('pieces float: nothing moves without input', () => {
  const g = new Game({ w: 10, h: 20, seed: 1 });
  const y = g.piece.y;
  assert.strictEqual(g.piece.y, y);
  assert(y >= 16);
});
test('lowering onto the stack sets the piece; lowering in the air does not', () => {
  const g = new Game({ w: 10, h: 20, seed: 2 });
  let r;
  let steps = 0;
  while ((r = g.lower()) === 'moved') steps++;
  assert(steps > 10);
  assert.strictEqual(typeof r, 'object');
  assert.strictEqual(g.s.pieces, 1);
});
test('hard drop, hold, and a quad', () => {
  const g = new Game({ w: 10, h: 20, seed: 3 });
  for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
  g.replacePiece({ id: 'I' });
  assert(g.rotate(1));
  while (g.move(-1));
  const r = g.drop();
  assert.strictEqual(r.lines, 4);
  assert(r.perfect);
  assert(g.board.isEmpty());
  const before = g.piece.type.id;
  assert(g.holdPiece());
  assert.strictEqual(g.hold.id, before);
  const second = g.piece.type.id;
  assert(g.holdPiece(), 'hold again swaps back');
  assert.strictEqual(g.piece.type.id, before, 'the held piece returns');
  assert.strictEqual(g.hold.id, second);
  const c = new Game({ w: 10, h: 20, seed: 3, freeHold: false });
  assert(c.holdPiece());
  assert(!c.holdPiece(), 'Classic: one hold per piece');
});
test('the pointer centres on a piece\'s middle: a T pointing left follows by its stem', () => {
  const g = new Game({ w: 10, h: 20, seed: 1 });
  g.replacePiece({ id: 'T' });
  g.piece.rot = 3; // nub to the left
  for (let i = 0; i < 12; i++) if (!g.moveToward(5)) break;
  const xs = g.cellsOf().map(([x]) => x);
  const stem = xs.filter((x) => xs.filter((y) => y === x).length === 3)[0];
  assert.strictEqual(stem, 5, 'the three-block stem sits under the pointer');
  g.piece.rot = 0;
  for (let i = 0; i < 12; i++) if (!g.moveToward(5)) break;
  assert.deepStrictEqual(g.cellsOf().map(([x]) => x).sort(), [4, 5, 5, 6]);
});

// Turning odd shapes: the Noodle, Giants, Blueprint drawings, mirrors.
const NOODLE = Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id;
const oddShapes = () => {
  const ids = [NOODLE, 'I5', 'I3', 'D2', 'V3'];
  for (const t of Pieces.TETROMINOES) if (t !== 'O') ids.push(Pieces.bigOf(t).id, Pieces.mirrorOf(Pieces.bigOf(t)).id);
  // Every Blueprint drawing of up to six blocks (all free polyominoes of 2–6 cells), and the mirrored pentominoes.
  for (let n = 2; n <= 6; n++) for (const cells of Pieces.freePolyominoes(n)) ids.push(Pieces.customType(cells).id);
  for (const id of Pieces.PENTOMINOES) ids.push(Pieces.mirrorOf(Pieces.TYPES[id]).id);
  ids.push(...Pieces.PENTO18);
  return Array.from(new Set(ids));
};
const put = (g, id, rot, x, y) => { g.piece = { type: Pieces.get(id), rot, x, y, special: null, entry: { id }, lastRot: false }; return g.piece; };
test('bug: a Noodle bought over a fresh piece turns (it sits in the top row, and on end it is six tall)', () => {
  for (const first of Pieces.TETROMINOES) {
    for (const dir of [1, -1, 2]) {
      const g = new Game({ w: 10, h: 20, seed: 3 });
      g.spawn({ id: first });
      assert(g.replacePiece({ id: NOODLE }));
      assert(g.rotate(dir), 'over ' + first + ', turn ' + dir);
      assert(g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y));
      if (dir !== 2) {
        // Stood on end, pushed down just enough to fit under the ceiling.
        const cells = g.cellsOf();
        assert(Math.max(...cells.map((c) => c[1])) >= 18, first);
        assert.strictEqual(new Set(cells.map((c) => c[0])).size, 1);
      }
    }
  }
  // It turns about its middle: four turns in open space bring it back where it started.
  const g = new Game({ w: 10, h: 20, seed: 3 });
  put(g, NOODLE, 0, 2, 5);
  for (let i = 0; i < 4; i++) assert(g.rotate(1));
  assert.deepStrictEqual([g.piece.rot, g.piece.x, g.piece.y], [0, 2, 5]);
});
test('odd shapes (Noodle, Giants, every Blueprint shape, mirrors) turn everywhere on an open board: spawn, walls, floor, ceiling', () => {
  let tried = 0;
  for (const id of oddShapes()) {
    const type = Pieces.get(id);
    const g = new Game({ w: 10, h: 20, seed: 1 });
    g.spawn({ id });
    for (const dir of [1, -1, 2]) { const p = Object.assign({}, g.piece); assert(g.rotate(dir), id + ' at spawn'); g.piece = p; }
    for (let r = 0; r < 4; r++) for (let y = -type.n; y < 20; y++) for (let x = -type.n; x < 10; x++) {
      if (!g.fitsAt(put(g, id, r, x, y), r, x, y)) continue;
      for (const dir of [1, -1, 2]) {
        const p = put(g, id, r, x, y);
        const before = new Set(g.cellsOf().map((c) => c.join(',')));
        assert(g.rotate(dir), id + ' rot ' + r + ' at ' + x + ',' + y + ' turning ' + dir);
        tried++;
        // Nudged in, never far: it still touches where it was.
        const near = g.cellsOf().some(([cx, cy]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => before.has((cx + dx) + ',' + (cy + dy))));
        assert(near && Math.abs(p.x - x) < type.n && Math.abs(p.y - y) < type.n, id + ' jumped');
      }
    }
  }
  assert(tried > 20000, String(tried));
});
test('odd shapes near the stack: stood up on it, slid off a block beside it, never hopped out of a well or through a roof', () => {
  const g = new Game({ w: 10, h: 20, seed: 1 });
  // Lying on the stack (rows 0–3 full but for a well at column 9): turning on end stands it on the stack.
  for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
  put(g, NOODLE, 0, 1, 2); // row 4, columns 1–6
  assert(g.rotate(1));
  let cells = g.cellsOf();
  assert.strictEqual(Math.min(...cells.map((c) => c[1])), 4, 'stood on the stack');
  assert(cells.some(([x, y]) => y === 4 && x >= 1 && x <= 6));
  // Upright against a wall of blocks on its right: turning flat slides it off to the left.
  g.board.cells.fill(0);
  for (let y = 0; y < 14; y++) for (let x = 6; x < 10; x++) g.board.set(x, y, 8);
  put(g, NOODLE, 1, 3, 4); // column 5, rows 4–9
  assert(g.rotate(1));
  cells = g.cellsOf();
  assert(cells.every(([x]) => x <= 5) && cells.some(([x, y]) => x === 5 && y >= 4 && y <= 9), JSON.stringify(cells));
  // Down a well, poking out: turning lays it across the top of the well, not further up.
  g.board.cells.fill(0);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
  put(g, NOODLE, 1, 7, 0); // column 9, rows 0–5
  assert(g.rotate(1));
  cells = g.cellsOf();
  assert(cells.every(([, y]) => y === 4), JSON.stringify(cells));
  // Wholly inside a deep well there is no room to turn, and it does not jump out.
  for (let y = 4; y < 8; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
  put(g, NOODLE, 1, 7, 0);
  assert(!g.rotate(1) && !g.rotate(-1));
  assert.deepStrictEqual([g.piece.rot, g.piece.x, g.piece.y], [1, 7, 0]);
  // Above a full-width roof at the ceiling: standing it on end would pass through the roof, so it stays flat.
  g.board.cells.fill(0);
  for (let x = 0; x < 10; x++) g.board.set(x, 16, 8);
  put(g, NOODLE, 0, 2, 17); // row 19
  assert(!g.rotate(1) && !g.rotate(-1));
  assert.strictEqual(g.piece.rot, 0);
  // A Giant I on end against the left wall turns flat off it.
  g.board.cells.fill(0);
  const big = Pieces.bigOf('I').id;
  put(g, big, 1, -4, 6); // columns 0–1
  assert(g.rotate(1));
  assert(g.cellsOf().every(([x]) => x >= 0 && x < 10));
});
test('odd shapes on random stacks: a kick that fits is always taken first; a nudge never passes through blocks', () => {
  const ids = oddShapes(), rng = new RNG(5);
  let nudged = 0;
  for (let i = 0; i < 40000; i++) {
    const id = ids[rng.int(ids.length)], type = Pieces.get(id), g = new Game({ w: 10, h: 20, seed: 1 });
    const top = rng.int(18), dens = rng.next() * 0.9;
    for (let y = 0; y < top; y++) for (let x = 0; x < 10; x++) if (rng.next() < dens) g.board.set(x, y, 8);
    const r = rng.int(4), x = rng.int(10 + type.n) - type.n, y = rng.int(20 + type.n) - type.n;
    if (!g.fitsAt(put(g, id, r, x, y), r, x, y)) continue;
    const dir = [1, -1, 2][i % 3], to = (r + dir + 4) % 4, old = g.cellsOf();
    const kick = Pieces.kicksFor(type, r, to).find(([kx, ky]) => g.board.fits(type.rots[to], x + kx, y + ky));
    const ok = g.rotate(dir);
    if (kick) { assert(ok); assert.deepStrictEqual([g.piece.x, g.piece.y], [x + kick[0], y + kick[1]], id); continue; }
    if (!ok) continue;
    nudged++;
    // Every new cell is reachable from the old ones through empty cells (or open air above the board), within the
    // box the two span.
    const now = g.cellsOf(), all = old.concat(now);
    const x0 = Math.min(...all.map((c) => c[0])), x1 = Math.max(...all.map((c) => c[0]));
    const y0 = Math.min(...all.map((c) => c[1])), y1 = Math.max(...all.map((c) => c[1]));
    const open = (a, b) => a >= x0 && a <= x1 && b >= y0 && b <= y1 && (b >= 20 || !g.board.filled(a, b));
    const seen = new Set(old.map((c) => c.join(','))), q = old.slice();
    while (q.length) {
      const [a, b] = q.pop();
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (a + da) + ',' + (b + db);
        if (!seen.has(k) && open(a + da, b + db)) { seen.add(k); q.push([a + da, b + db]); }
      }
    }
    assert(now.every((c) => seen.has(c.join(','))), id + ' rot ' + r + ' at ' + x + ',' + y + ' turning ' + dir);
  }
  assert(nudged > 30, String(nudged));
});
test('the seven keep plain Lull kicks, and puzzles (a fixed queue) keep exactly the turns their generator searched', () => {
  const rng = new RNG(11);
  let turned = 0;
  for (let i = 0; i < 3000; i++) {
    const id = Pieces.TETROMINOES[i % 7], type = Pieces.get(id);
    const g = new Game({ w: 10, h: 20, seed: 1 });
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (rng.next() < 0.25) g.board.set(x, y, 8);
    const r = rng.int(4), x = rng.int(12) - 2, y = rng.int(22) - 2;
    if (!g.fitsAt(put(g, id, r, x, y), r, x, y)) continue;
    const dir = [1, -1, 2][i % 3], to = (r + dir + 4) % 4;
    const kick = type.kicks === 'none' ? null : Pieces.kicksFor(type, r, to).find(([kx, ky]) => g.board.fits(type.rots[to], x + kx, y + ky));
    assert.strictEqual(g.rotate(dir), !!kick, id);
    if (kick) { turned++; assert.deepStrictEqual([g.piece.x, g.piece.y], [x + kick[0], y + kick[1]]); }
  }
  assert(turned > 200);
  // In a puzzle, a Noodle in the top row gets only its kick table (which cannot stand it on end there).
  const p = new Game({ w: 10, h: 20, queue: [{ id: NOODLE }, { id: 'T' }] });
  put(p, NOODLE, 0, 2, 17);
  assert(!p.rotate(1));
  const f = new Game({ w: 10, h: 20, seed: 1 });
  put(f, NOODLE, 0, 2, 17);
  assert(f.rotate(1));
});
test('items on the board: laser, black hole, tornado, trapdoor, mirror world', () => {
  const mk = () => { const g = new Game({ w: 10, h: 20, seed: 9 }); for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) if ((x + y) % 3) g.board.set(x, y, 8); g.replacePiece({ id: 'O' }); return g; };
  let g = mk(); const before = g.board.count();
  g.setSpecial('laser'); let r = g.drop();
  assert(r.laser.length === 2 && r.lines === 2 && r.plain === 2, 'the laser vaporises both rows it touches, as plain lines');
  assert(!r.b2b && g.s.b2b === -1, 'a laser never feeds the streak');
  g = mk(); assert(g.setSpecial('blackhole')); g.piece.y = 6; r = g.drop();
  assert(r.swallowed.length > 5 && r.cells.length === 0, 'the black hole swallows its surroundings, and is gone');
  // Tornado: columns shuffled, holes and all; every row keeps its count, so nothing clears.
  g = mk();
  const rowCounts = (b) => [...Array(20)].map((_, y) => [...Array(10)].filter((_, x) => b.get(x, y)).length);
  const colSets = (b) => [...Array(10)].map((_, x) => [...Array(20)].map((_, y) => b.get(x, y)).join()).sort().join('|');
  const counts0 = rowCounts(g.board), cols0 = colSets(g.board);
  const moves = g.tornado();
  assert(moves && moves.length === before);
  assert.deepStrictEqual(rowCounts(g.board), counts0);
  assert.strictEqual(colSets(g.board), cols0, 'the same columns, in another order');
  assert(g.undo(), 'rewind undoes a tornado');
  // Trapdoor: the bottom row falls away, everything above comes down one, no lines are paid.
  g = mk(); const row1 = [...Array(10)].map((_, x) => g.board.get(x, 1));
  const lost = g.trapdoor();
  assert(lost && lost.filter(Boolean).length === [...Array(10)].filter((_, x) => (x) % 3).length);
  assert.deepStrictEqual([...Array(10)].map((_, x) => g.board.get(x, 0)), row1);
  assert.strictEqual(g.s.lines, 0);
  g = new Game({ w: 10, h: 20, seed: 1 }); assert.strictEqual(g.trapdoor(), null, 'nothing to drop on an empty floor');
  g = mk(); const row0 = [...Array(10)].map((_, x) => g.board.get(x, 0)); assert(g.flipWorld()); assert.deepStrictEqual([...Array(10)].map((_, x) => g.board.get(x, 0)), row0.reverse());
  assert(g.undo(), 'rewind undoes a board item');
  assert.deepStrictEqual([...Array(10)].map((_, x) => g.board.get(x, 0)), row0.reverse());
});
test('twists: dropped from a turn is not one; one front corner is a Mini', () => {
  const setup = () => {
    const g = new Game({ w: 10, h: 20, seed: 4 });
    const fill = (y, row) => { for (let x = 0; x < 10; x++) if (row[x] === 'X') g.board.set(x, y, 8); };
    fill(0, 'XXX.XXXXXX');
    fill(1, 'XX...XXXXX');
    g.board.set(4, 2, 8);
    g.replacePiece({ id: 'T' });
    return g;
  };
  let g = setup();
  Object.assign(g.piece, { rot: 2, x: 2, y: 6, lastRot: true });
  let r = g.drop();
  assert(!r.twist && !r.mini, 'turned high up, then dropped: no spin');
  g = setup();
  g.board.set(2, 0, 0); g.board.set(4, 0, 0);
  g.board.set(4, 0, 8); g.board.set(2, 2, 8);
  // rot 2 points down: front corners (2,0) and (4,0); now only (4,0) is blocked, plus both back corners.
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true, kick: 1 });
  r = g.lock();
  assert(r.mini && !r.twist, 'one front corner: mini twist');
});
test('twist double is recognised', () => {
  const g = new Game({ w: 10, h: 20, seed: 4 });
  const fill = (y, row) => { for (let x = 0; x < 10; x++) if (row[x] === 'X') g.board.set(x, y, 8); };
  fill(0, 'XXX.XXXXXX');
  fill(1, 'XX...XXXXX');
  g.board.set(4, 2, 8); // the overhang that makes it a spin
  g.replacePiece({ id: 'T' });
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true });
  const r = g.lock();
  assert(r.twist, 'three corners filled after a turn');
  assert.strictEqual(r.lines, 2);
});
test('a saved game keeps the piece\'s own flags: a T turned into its slot still spins after a reload; an I from hold is still one', () => {
  const g = new Game({ w: 10, h: 20, seed: 4 });
  const fill = (y, row) => { for (let x = 0; x < 10; x++) if (row[x] === 'X') g.board.set(x, y, 8); };
  fill(0, 'XXX.XXXXXX');
  fill(1, 'XX...XXXXX');
  g.board.set(4, 2, 8);
  g.replacePiece({ id: 'T' });
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true, kick: 4, fromHold: true });
  const back = new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())) });
  assert.strictEqual(back.piece.lastRot, true);
  assert.strictEqual(back.piece.kick, 4);
  assert.strictEqual(back.piece.fromHold, true);
  const r = back.lock();
  assert(r.twist && r.lines === 2 && r.fromHold, 'the twist double counts after the round trip');
  const plain = new Game({ w: 10, h: 20, seed: 5 });
  const pj = plain.toJSON().piece;
  assert(!('lastRot' in pj) && !('kick' in pj) && !('fromHold' in pj), 'nothing extra saved for a plain piece');
});
test('undo restores the board and gives back the lines it cleared', () => {
  const g = new Game({ w: 4, h: 8, seed: 5 });
  for (let x = 0; x < 3; x++) g.board.set(x, 0, 8);
  g.replacePiece({ id: 'M1' });
  while (g.move(1));
  const r = g.drop();
  assert.strictEqual(r.lines, 1);
  const u = g.undo();
  assert.strictEqual(u.lines, 1);
  assert.strictEqual(g.board.count(), 3);
  assert.strictEqual(g.s.lines, 0);
});
test('items: bomb, drill, patch, ghost, settle', () => {
  const setup = () => { const g = new Game({ w: 10, h: 20, seed: 6 }); for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) if ((x * 7 + y * 3) % 5) g.board.set(x, y, 1 + ((x + y) % 7)); return g; };
  let g = setup();
  g.setSpecial('bomb');
  let before = g.board.count();
  let r = g.drop();
  assert(r.blast.length > 0 && r.blast.length <= 13 && g.board.count() === before - r.blast.length, 'a 13-block diamond at most: ' + r.blast.length);
  assert(r.blast.every(([x, y]) => Math.abs(x - r.center[0]) + Math.abs(y - r.center[1]) <= 2 || (Math.abs(x - r.center[0]) <= 1 && Math.abs(y - r.center[1]) <= 1)));
  g = setup(); g.setSpecial('drill'); before = g.board.count();
  const col = g.cellsOf()[0][0];
  const colCount = [0, 1, 2, 3, 4, 5].filter((y) => g.board.get(col, y)).length;
  r = g.drop();
  assert.strictEqual(r.drilled.length, colCount);
  assert.strictEqual(g.board.count(), before - colCount);
  // Patch: into the highest covered hole of its column; with none, it lands like a block.
  g = new Game({ w: 10, h: 20, seed: 6 });
  g.board.set(3, 0, 8); g.board.set(3, 2, 8); g.board.set(3, 4, 8); // holes at (3,1) and (3,3)
  assert(g.setSpecial('patch'));
  g.piece.x = 3;
  assert.strictEqual(g.ghostY(g.piece), 3, 'the ghost shows the hole it will fill');
  r = g.drop();
  assert(r.patched && g.board.get(3, 3) && !g.board.get(3, 1) && !g.board.get(3, 5), 'the highest covered hole');
  g.setSpecial('patch'); g.piece.x = 3;
  while (g.lower() === 'moved');
  assert(g.board.get(3, 1), 'lowered onto the stack, it still drops into the hole below');
  g.setSpecial('patch'); g.piece.x = 6; r = g.drop();
  assert(g.board.get(6, 0) && r.cells[0][1] === 0, 'no hole: it lands like a block');
  // A patch that completes a row clears it (plain lines).
  g = new Game({ w: 10, h: 20, seed: 6 });
  for (let x = 0; x < 10; x++) { if (x !== 9) g.board.set(x, 1, 8); if (x !== 4) g.board.set(x, 0, 8); }
  g.setSpecial('patch'); g.piece.x = 4; r = g.drop();
  assert(r.lines === 1 && r.plain === 1 && g.board.count() === 9);
  // Ghost: through the shelf, down to the floor.
  g = setup(); g.board.cells.fill(0);
  for (let x = 0; x < 10; x++) g.board.set(x, 3, 8);
  g.board.set(4, 3, 0); g.board.set(5, 3, 0);
  g.replacePiece({ id: 'O' }); g.setSpecial('phase');
  g.piece.x = 4 - g.piece.type.rotBounds[0].minX;
  r = g.drop();
  assert.strictEqual(r.cells.length, 4);
  assert(g.board.get(4, 0) && g.board.get(5, 1), 'phased under the shelf, down to the floor');
  g = setup(); before = g.board.count();
  r = g.settle();
  assert(r.lines >= 0 && g.board.count() === before - 10 * r.lines && r.plain === r.lines);
  for (let x = 0; x < 10; x++) { let seenEmpty = false; for (let y = 0; y < 20; y++) { if (!g.board.get(x, y)) seenEmpty = true; else assert(!seenEmpty, 'no holes after settling'); } }
});
test('choice: Pick of Three swaps with the queue; Best Fit finds the well; both can be put back', () => {
  const g = new Game({ w: 10, h: 20, seed: 11 });
  const cur = g.piece.type.id, q = g.queue.map((e) => e.id);
  assert(g.pickFromQueue(1));
  assert.strictEqual(g.piece.type.id, q[1]);
  assert.strictEqual(g.queue[1].id, cur, 'the piece in play takes its place in line');
  assert.deepStrictEqual([g.queue[0].id, g.queue[2].id], [q[0], q[2]]);
  assert(!g.pickFromQueue(3), 'only the next three');
  // A four-deep well at the right: Best Fit is an I standing in it, over its spot.
  const f = new Game({ w: 10, h: 20, seed: 12 });
  for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) f.board.set(x, y, 8);
  const spot = f.bestFit();
  assert(spot && f.piece.type.id === 'I' && f.piece.entry.tag === 'fit');
  const r = f.drop();
  assert.strictEqual(r.lines, 4, 'it drops straight into the well');
  assert.strictEqual(r.tag, 'fit');
  // A flat floor: whatever it picks leaves no hole.
  const e = new Game({ w: 10, h: 20, seed: 13 });
  e.bestFit(); e.drop();
  let holes = 0; for (let x = 0; x < 10; x++) { let roof = false; for (let y = 19; y >= 0; y--) { if (e.board.get(x, y)) roof = true; else if (roof) holes++; } }
  assert.strictEqual(holes, 0);
});
test('Safety Net keeps a streak streak through one ordinary clear, once', () => {
  const g = new Game({ w: 10, h: 20, seed: 3 });
  g.s.b2b = 4;
  const single = () => { g.board.cells.fill(0); for (let x = 1; x < 10; x++) g.board.set(x, 0, 8); g.replacePiece({ id: 'M1' }); g.piece.x = 0; return g.drop(); };
  g.s.net = 1;
  let r = single();
  assert.strictEqual(r.netSaved, 5);
  assert(g.s.b2b === 4 && g.s.net === 0);
  r = single();
  assert(!r.netSaved && g.s.b2b === -1, 'the next ordinary clear ends it');
});
test('the saved game comes back exactly', () => {
  const g = new Game({ w: 10, h: 20, seed: 8 });
  for (let i = 0; i < 12; i++) { g.move(i % 3 - 1); g.drop(); }
  g.holdPiece();
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const h = new Game({ saved: json });
  assert.deepStrictEqual(h.toJSON(), g.toJSON());
  for (let i = 0; i < 20; i++) { g.drop(); h.drop(); }
  assert.deepStrictEqual(h.toJSON(), g.toJSON(), 'same future');
});

test('a board saved full comes back full, and a new board fixes it', () => {
  const g = new Game({ w: 6, h: 8, seed: 9 });
  let guard = 0;
  while (!g.over && guard++ < 200) g.drop();
  assert(g.over);
  const h = new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())) });
  assert(h.over, 'still over after loading');
  h.resetBoard();
  assert(!h.over && h.piece && h.drop());
});

test('top out in Free Play: a piece never appears sealed inside the stack (Classic neither)', () => {
  for (const freeHold of [true, false]) {
    const g = new Game({ w: 10, h: 20, seed: 2, freeHold });
    let tops = 0; g.on('topout', () => tops++);
    // Full to the ceiling, with a sealed pocket three rows down right under the spawn spot.
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) g.board.set(x, y, 8);
    for (let y = 15; y < 18; y++) for (let x = 2; x < 8; x++) g.board.set(x, y, 0);
    assert(!g.spawn({ id: 'O' }), 'no spawn into the pocket');
    assert(g.over && tops === 1, 'a real top-out');
  }
});
test('Free Play fits a new piece beside a tower before topping out; Classic blocks out', () => {
  const tower = (g) => { for (let y = 0; y < 20; y++) for (let x = 3; x < 7; x++) g.board.set(x, y, 8); };
  const g = new Game({ w: 10, h: 20, seed: 3 });
  tower(g);
  let tops = 0; g.on('topout', () => tops++);
  assert(g.spawn({ id: 'T' }) && !g.over && !tops);
  assert(g.cellsOf().every(([x, y]) => (x < 3 || x > 6) && y >= 17), 'up top, beside the tower: ' + JSON.stringify(g.cellsOf()));
  // Only what the piece could get to: a well two wide takes an O but a T needs a turn to fit a well one wide.
  const w = new Game({ w: 10, h: 20, seed: 3 });
  for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (x !== 8) w.board.set(x, y, 8);
  assert(w.spawn({ id: 'I' }) && w.piece.rot % 2 === 1 && w.cellsOf().every(([x]) => x === 8), 'an I stands up in the one open column');
  assert(!w.spawn({ id: 'O' }) && w.over, 'an O has nowhere: board full');
  const c = new Game({ w: 10, h: 20, seed: 3, freeHold: false });
  tower(c);
  assert(!c.spawn({ id: 'T' }) && c.over, 'Classic: blocked at the spawn spot is game over');
});
test('bug: swapping in a bigger shape never shows the board full — it fits where there is room, or is refused', () => {
  const NOODLE = Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id;
  const g = new Game({ w: 10, h: 20, seed: 1 });
  g.replacePiece({ id: 'O' }); while (g.move(-1));
  // Two columns to the ceiling in the middle: no row has six in a line, so the Noodle stands on end.
  for (let y = 0; y < 20; y++) for (let x = 4; x < 6; x++) g.board.set(x, y, 8);
  let tops = 0; g.on('topout', () => tops++);
  assert(g.replacePiece({ id: NOODLE }), 'a Noodle fits on end');
  assert(!tops && !g.over && g.piece.type.id === NOODLE && g.cellsOf().every(([x]) => x < 4), 'on the side it was on: ' + JSON.stringify(g.cellsOf()));
  // A Giant O needs a 4×4 space; with only the left three columns open it is refused and nothing changes.
  const h = new Game({ w: 10, h: 20, seed: 1 });
  h.replacePiece({ id: 'O' }); while (h.move(-1));
  for (let y = 0; y < 20; y++) for (let x = 3; x < 10; x++) h.board.set(x, y, 8);
  h.on('topout', () => tops++);
  const before = JSON.stringify(h.toJSON());
  assert(!h.replacePiece({ id: Pieces.bigOf('O').id }), 'no room for a Giant');
  assert(!tops && !h.over && JSON.stringify(h.toJSON()) === before, 'refused: nothing changed, not a full board');
  // The spot found is never one the piece could not get to: a pocket under a roof stays empty.
  const k = new Game({ w: 10, h: 20, seed: 1 });
  k.replacePiece({ id: 'M1' }); while (k.move(1)); // a pebble in the top right corner
  for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (!(y === 19 && x === 9)) k.board.set(x, y, 8);
  for (let y = 5; y < 9; y++) for (let x = 2; x < 6; x++) k.board.set(x, y, 0); // a sealed 4×4 pocket
  assert(!k.replacePiece({ id: 'O' }), 'the sealed pocket is not room');
  assert(k.piece.type.id === 'M1' && !k.over);
});
test('hold in Free Play: a swap to a piece with no room is refused and changes nothing; Classic still blocks out', () => {
  const g = new Game({ w: 10, h: 20, seed: 4 });
  g.replacePiece({ id: 'O' }); g.holdPiece(); // O held
  g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
  for (let y = 0; y < 20; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8); // one open column, the I in it
  let tops = 0, noroom = 0; g.on('topout', () => tops++); g.on('noroom', () => noroom++);
  const before = JSON.stringify(g.toJSON()), holds = g.s.holds;
  assert(!g.holdPiece(), 'the O cannot come out');
  assert(!tops && noroom === 1 && !g.over && g.s.holds === holds && JSON.stringify(g.toJSON()) === before, 'refused, nothing changed');
  // With room somewhere above the stack, the swap goes through (beside the tower, not over it).
  const s = new Game({ w: 10, h: 20, seed: 4 });
  s.replacePiece({ id: 'O' }); s.holdPiece();
  for (let y = 0; y < 20; y++) for (let x = 3; x < 7; x++) s.board.set(x, y, 8);
  s.on('topout', () => tops++);
  assert(s.holdPiece() && s.piece.type.id === 'O' && !tops && !s.over);
  // Classic: once per piece, and a held piece that cannot appear ends the game as before.
  const c = new Game({ w: 10, h: 20, seed: 4, freeHold: false });
  c.replacePiece({ id: 'O' }); while (c.move(-1));
  for (let y = 0; y < 20; y++) for (let x = 3; x < 7; x++) c.board.set(x, y, 8);
  c.hold = { id: 'T', rot: 0 };
  assert(c.holdPiece() && c.over, 'Classic block out');
});

// Classic (the ceiling option): the well's top row holds shapes like any other, and only a blocked spawn spot ends it.
const classicGame = (seed) => new Game({ w: 10, h: 20, seed: seed || 1, previewCount: 3, maxHistory: 0, freeHold: false, ceiling: true });
/** Every spot (rot, x, y) the piece in play can get to by moving, turning and lowering (never setting it). */
function reachable(g) {
  const p = g.piece, start = { rot: p.rot, x: p.x, y: p.y }, key = (s) => s.rot + ':' + s.x + ':' + s.y;
  const seen = new Map([[key(start), start]]), q = [start], quiet = g.emit;
  g.emit = () => {};
  try {
    while (q.length) {
      const s = q.shift();
      for (const op of ['L', 'R', 'D', 'CW', 'CCW', '180']) {
        Object.assign(p, s);
        let ok;
        if (op === 'L') ok = g.move(-1); else if (op === 'R') ok = g.move(1);
        else if (op === 'D') { ok = g.fitsAt(p, p.rot, p.x, p.y - 1); if (ok) p.y--; }
        else ok = g.rotate(op === 'CW' ? 1 : op === 'CCW' ? -1 : 2);
        const n = { rot: p.rot, x: p.x, y: p.y };
        if (ok && !seen.has(key(n))) { seen.set(key(n), n); q.push(n); }
      }
    }
  } finally { g.emit = quiet; Object.assign(p, start); }
  return seen;
}
test('Classic: every shape appears with its top in the top row (the I too); puzzles and Free Play keep their spawn', () => {
  for (const id of Pieces.TETROMINOES) {
    const g = classicGame(); g.spawn({ id });
    assert(!g.over && Math.max(...g.cellsOf().map(([, y]) => y)) === 19, id + ' ' + JSON.stringify(g.cellsOf()));
    const f = new Game({ w: 10, h: 20, seed: 1, freeHold: false }), t = Pieces.get(id);
    assert.deepStrictEqual(f.spawnPosition(t, 0), L.spawnPos ? L.spawnPos(10, 20, t, 0) : f.spawnPosition(t, 0), 'no ceiling: the plain spawn');
  }
  const g = classicGame(); g.spawn({ id: 'I' });
  assert(g.rotate(1) && cellKey(g.cellsOf()) === cellKey([[5, 16], [5, 17], [5, 18], [5, 19]]), 'an I stood on end at the spawn: column 5, rows 16 to 19');
  for (const id of Pieces.TETROMINOES.filter((i) => Pieces.get(i).kicks !== 'none')) {
    const c = classicGame(); c.spawn({ id });
    // (A pair, not an {x, y} object: storing a ceiling y into that shape slows the puzzle generator's spawnPos in V8.)
    const at = [c.piece.x, c.piece.y];
    for (let i = 0; i < 4; i++) assert(c.rotate(1), id + ' turns at the ceiling');
    assert(c.piece.rot === 0 && c.piece.x === at[0] && c.piece.y === at[1], id + ': four turns at the ceiling come back to the start');
  }
});
test('Classic: every piece, in every turn and column, can be moved and turned into the top row and set there', () => {
  for (const id of Pieces.TETROMINOES) {
    const t = Pieces.get(id), shapes = new Set();
    const g = classicGame(); g.spawn({ id });
    const seen = reachable(g);
    for (let rot = 0; rot < 4; rot++) {
      const b = t.rotBounds[rot], k = t.keys ? t.keys[rot] : rot;
      if (shapes.has(k)) continue;
      shapes.add(k);
      for (let x = -b.minX; x <= 9 - b.maxX; x++) {
        // Some turn of the piece puts exactly these cells there (the I and S, Z and O have twins).
        const want = cellKey(t.rots[rot].map(([cx, cy]) => [x + cx, 19 - b.maxY + cy]));
        const hit = [...seen.values()].some((s) => cellKey(g.cellsOf(g.piece, s.rot, s.x, s.y)) === want);
        assert(hit, id + ' turn ' + rot + ' at column ' + x + ' cannot reach the top row');
      }
    }
    // And sets there, at the left wall on a column built up to it, with the game going on (the next piece has room).
    for (let rot = 0; rot < 4; rot++) {
      const b = t.rotBounds[rot], x = -b.minX, y = 19 - b.maxY;
      const cells = t.rots[rot].map(([cx, cy]) => [x + cx, y + cy]);
      const s = classicGame(2); s.spawn({ id }); s.queue[0] = { id: 'O', rot: 0 };
      const [sx, sy] = cells.reduce((a, c) => (c[1] < a[1] ? c : a));
      for (let yy = 0; yy < sy; yy++) s.board.set(sx, yy, 8);
      const target = cellKey(cells);
      const spot = [...reachable(s).values()].find((q) => cellKey(s.cellsOf(s.piece, q.rot, q.x, q.y)) === target);
      assert(spot, id + ' turn ' + rot + ': the spot at the top left is reachable over the stack');
      Object.assign(s.piece, spot);
      const r = s.lower();
      assert(r && r.cells && cellKey(r.cells) === target && cells.every(([cx, cy]) => s.board.get(cx, cy)), id + ' turn ' + rot + ' set in the top row');
      assert(cells.some(([, cy]) => cy === 19) && !s.over && s.piece && s.piece.type.id === 'O', id + ' turn ' + rot + ': the game goes on');
    }
  }
});
test('Classic: the game goes on while the spawn spot is free, even with the top row partly filled', () => {
  for (const id of Pieces.TETROMINOES) {
    const g = classicGame();
    let tops = 0; g.on('topout', () => tops++);
    for (let y = 0; y < 18; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
    for (const x of [0, 1, 2, 7, 8, 9]) g.board.set(x, 19, 8);
    assert(g.spawn({ id }) && !g.over && !tops, id + ' appears');
  }
  // Rows 0-18 full but for one column: the I appears in the top row and sets there; then the T has nowhere to appear.
  const g = classicGame(3);
  let tops = 0; g.on('topout', () => tops++);
  for (let y = 0; y < 19; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
  g.queue[0] = { id: 'I', rot: 0 }; g.queue[1] = { id: 'T', rot: 0 };
  g.spawnNext();
  assert(g.piece && g.piece.type.id === 'I' && !g.over && g.cellsOf().every(([, y]) => y === 19), 'the I appears in the top row: ' + JSON.stringify(g.cellsOf()));
  assert(g.move(-1) && g.move(-1) && g.move(-1), 'and moves along it');
  const r = g.drop();
  assert(r && cellKey(r.cells) === cellKey([[0, 19], [1, 19], [2, 19], [3, 19]]) && !r.lines, 'and sets there');
  assert(g.over && tops === 1 && g.piece.type.id === 'T', 'the T, a row lower, tops out');
});
test('Classic: a piece that cannot appear right where it appears is the game over (no nearby spot is tried)', () => {
  for (const id of Pieces.TETROMINOES) {
    const t = Pieces.get(id);
    const pos = classicGame().spawnPosition(t, 0);
    for (const [cx, cy] of t.rots[0]) {
      const g = classicGame();
      let tops = 0; g.on('topout', () => tops++);
      g.board.set(pos.x + cx, pos.y + cy, 8);
      assert(!g.spawn({ id }) && g.over && tops === 1, id + ' blocked at one cell');
      assert(g.piece && g.piece.type.id === id && g.piece.x === pos.x && g.piece.y === pos.y && g.piece.rot === 0, id + ' stays where it appears');
    }
  }
  // A held piece that cannot appear is a block out too.
  const c = classicGame();
  c.spawn({ id: 'O' }); while (c.move(-1));
  c.board.set(4, 19, 8);
  c.hold = { id: 'T', rot: 0 };
  assert(c.holdPiece() && c.over && c.piece.type.id === 'T', 'the held T blocks out');
});

test('Classic: a T turned flat against the ceiling is not a twist (above the well is open); real spins still count', () => {
  // A stack one row below the top next to the spawn, the usual shape just before a top out: turn, move, turn.
  for (const [col, seq] of [[2, ['CW', 'L', 'CW']], [6, ['CCW', 'R', 'CCW']]]) {
    const g = classicGame();
    g.replacePiece({ id: 'T' });
    for (let y = 0; y <= 18; y++) g.board.set(col, y, 8);
    for (const s of seq) assert(s === 'L' ? g.move(-1) : s === 'R' ? g.move(1) : g.rotate(s === 'CW' ? 1 : -1), 'column ' + col + ': ' + s);
    assert(g.piece.rot === 2 && g.cellsOf().some(([, y]) => y === 19) && !g.fitsAt(g.piece, 2, g.piece.x, g.piece.y - 1), 'the T points down, flat in the top row');
    let r; g.on('lock', (x) => { r = x; });
    g.lock();
    assert(!r.mini && !r.twist && r.score === 0, 'column ' + col + ', ' + seq.join(' ') + ': no spin, no score ' + JSON.stringify({ mini: r.mini, twist: r.twist, score: r.score }));
  }
  // Every spot in the top row a T can reach over any one column built to row 18, set right after a turn: never a spin.
  for (let col = 0; col < 10; col++) {
    const mk = () => { const g = classicGame(); g.replacePiece({ id: 'T' }); for (let y = 0; y <= 18; y++) g.board.set(col, y, 8); return g; };
    const probe = mk();
    if (!probe.fitsAt(probe.piece, probe.piece.rot, probe.piece.x, probe.piece.y)) continue; // the stack is in the spawn spot
    for (const spot of reachable(probe).values()) {
      if (!probe.cellsOf(probe.piece, spot.rot, spot.x, spot.y).some(([, y]) => y === 19)) continue;
      const g = mk();
      Object.assign(g.piece, spot, { lastRot: true, kick: 0 });
      const r = g.lock();
      assert(r && !r.mini && !r.twist, 'column ' + col + ', ' + JSON.stringify(spot) + ': no spin at the ceiling');
    }
  }
  // Real blocks still count, in the top row too: a T turned under an overhang in row 19 is a twist double.
  let g = classicGame();
  g.replacePiece({ id: 'T' });
  for (let y = 0; y <= 18; y++) for (let x = y < 17 ? 1 : 0; x < 10; x++) g.board.set(x, y, 8);
  g.board.set(4, 17, 0); for (const x of [3, 4, 5]) g.board.set(x, 18, 0);
  g.board.set(3, 19, 8); g.board.set(5, 19, 8);
  Object.assign(g.piece, { rot: 2, x: 3, y: 17, lastRot: true, kick: 0 });
  let r = g.lock();
  assert(r.twist && r.lines === 2 && r.score > 0, 'a twist double under an overhang in the top row');
  // And at the bottom of a Classic well, the same twist double and Mini as in Relaxed.
  const slot = () => {
    const c = classicGame(4);
    const fill = (y, row) => { for (let x = 0; x < 10; x++) if (row[x] === 'X') c.board.set(x, y, 8); };
    fill(0, 'XXX.XXXXXX');
    fill(1, 'XX...XXXXX');
    c.board.set(4, 2, 8);
    c.replacePiece({ id: 'T' });
    return c;
  };
  g = slot();
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true });
  r = g.lock();
  assert(r.twist && r.lines === 2 && r.score > 0, 'a twist double under an overhang in Classic');
  g = slot();
  g.board.set(2, 0, 0); g.board.set(2, 2, 8);
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true, kick: 1 });
  r = g.lock();
  assert(r.mini && !r.twist && r.score > 0, 'a mini twist under an overhang in Classic');
});

console.log('puzzles');
function replay(p) {
  const g = new Game({ board: Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap }), queue: p.pieces, mods: { noRotate: p.mods.includes('rigid'), heavy: p.mods.includes('heavy'), noHold: !p.mods.includes('hold') } });
  let lines = 0, holds = 0;
  p.targets.forEach((t, i) => {
    // Hold puzzles: the piece the solution wants next is in the hold slot (or comes after the one in play).
    const want = (pc) => pc.type.id === t.id && (pc.entry.rot || 0) === (p.solution[i].rot || 0);
    if (!want(g.piece)) { assert(g.holdPiece(), 'hold in ' + p.seed); holds++; }
    if (!want(g.piece)) { assert(g.holdPiece(), 'hold again in ' + p.seed); holds++; }
    assert.strictEqual(g.piece.type.id, t.id);
    let res = null;
    // One turn button solves it: every turn is the one Up and right-click give on this puzzle (clockwise, or
    // counter-clockwise under Inverted Controls).
    if (!p.mods.includes('spin')) assert(t.path.every((m) => !/^(CW|CCW|180)$/.test(m) || m === Puzzles.primaryTurn(p.mods)), 'solutions only turn ' + Puzzles.primaryTurn(p.mods) + ': ' + p.seed);
    for (const m of t.path) {
      const ok = m === 'L' ? g.move(-1) : m === 'R' ? g.move(1) : m === 'D' ? g.lower() === 'moved' : m === 'CW' ? g.rotate(1) : m === 'CCW' ? g.rotate(-1) : m === '180' ? g.rotate(2) : (res = g.drop());
      assert(ok, 'move ' + m + ' in ' + p.seed);
      if (m === 'CW' || m === 'CCW' || m === '180') {
        // No hidden kick hops: every turn the solution needs is in place or a sideways nudge.
        const pc = g.piece, from = (pc.rot - (m === 'CW' ? 1 : m === 'CCW' ? -1 : 2) + 4) % 4;
        const [kx, ky] = Pieces.kicksFor(pc.type, from, pc.rot)[pc.kick];
        assert(ky === 0 && Math.abs(kx) <= 2, 'intuitive turn in ' + p.seed);
      }
    }
    if (!res) res = g.lower();
    assert(res && res !== 'moved', 'sets at the target in ' + p.seed);
    const type = Pieces.get(t.id);
    assert.strictEqual(cellKey(res.cells), cellKey(type.rots[t.r].map(([x, y]) => [g.board.wx(t.x + x), t.y + y])));
    lines += res.lines;
  });
  assert(Puzzles.goalMet(p, g.board, lines), 'goal met in ' + p.seed);
  if (p.mods.includes('hold')) assert(holds > 0, 'a Hold puzzle needs a hold: ' + p.seed);
  return holds;
}
test('counter-clockwise puzzles: only on S seeds, and each one needs it', () => {
  assert.strictEqual(Puzzles.parseSeed('ms3k7q2xa').seed, 'MS-3K7Q2XA');
  assert(!Puzzles.parseSeed('M-3K7Q2XA').spin);
  assert.strictEqual(Puzzles.dailyDateOf(Puzzles.dailySeed('H', '2026-09-26', true)).key, '2026-09-26');
  for (const d of ['E', 'M', 'H']) for (let n = 1; n <= 4; n++) {
    const p = Puzzles.generate(Puzzles.numberedSeed(d, n, true));
    assert(p.mods.includes('spin') && !p.fallback, 'both ways: ' + p.seed);
    assert(!Puzzles.verify(p, true), 'no way through with the single turn button alone ' + p.seed);
    replay(p);
    assert(!Puzzles.generate(Puzzles.numberedSeed(d, n)).mods.includes('spin'));
  }
});
test('Inverted Controls puzzles turn counter-clockwise only, the way Up and right-click turn there', () => {
  assert.strictEqual(Puzzles.primaryTurn(['flip', 'fog']), 'CW');
  assert.strictEqual(Puzzles.primaryTurn(['side', 'invert']), 'CCW');
  let n = 0, turned = 0;
  for (let i = 1; i <= 600 && n < 16; i++) {
    const p = Puzzles.generate(Puzzles.numberedSeed(i % 2 ? 'M' : 'H', i));
    if (!p.mods.includes('invert')) continue;
    n++;
    const turns = p.targets.flatMap((t) => t.path).filter((m) => /^(CW|CCW|180)$/.test(m));
    assert(turns.every((m) => m === 'CCW'), 'counter-clockwise only: ' + p.seed);
    if (turns.length) turned++;
    replay(p);
  }
  assert(n >= 10 && turned >= 5, 'inverted puzzles with turns turn up (' + n + ', ' + turned + ')');
  // Both-ways seeds under Inverted Controls need the other turn: here, a clockwise one (or a half turn).
  let spun = 0;
  for (let i = 1; i <= 300 && spun < 3; i++) {
    const p = Puzzles.generate(Puzzles.numberedSeed(i % 2 ? 'M' : 'H', i, true));
    if (!p.mods.includes('invert') || p.fallback) continue;
    spun++;
    assert(!Puzzles.verify(p, true), 'no counter-clockwise-only way through ' + p.seed);
    assert(p.targets.some((t) => t.path.some((m) => m === 'CW' || m === '180')), 'needs Z or A: ' + p.seed);
    replay(p);
  }
  assert(spun >= 1, 'inverted both-ways puzzles turn up');
});
test('puzzles have no hold unless the Hold wildcard is on, and then it is needed', () => {
  let n = 0;
  for (let i = 1; i <= 400 && n < 12; i++) {
    const p = Puzzles.generate(Puzzles.numberedSeed(i % 2 ? 'M' : 'H', i));
    if (!p.mods.includes('hold')) {
      const g = new Game({ board: Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap }), queue: p.pieces, mods: { noHold: true } });
      assert(!g.holdPiece(), 'no hold slot in ' + p.seed);
      continue;
    }
    n++;
    assert.strictEqual(Puzzles.solvableInOrder(p, p.pieces, 1e6), false, 'cannot be solved without holding: ' + p.seed);
    assert.strictEqual(Puzzles.solvableInOrder(p, p.solution.map((s) => ({ id: s.id, rot: s.rot })), 1e6), true, 'the solution order works: ' + p.seed);
  }
  assert(n >= 5, 'Hold puzzles turn up (' + n + ')');
});
// Every order of placements a one-slot hold allows (as the engine plays it: set the next piece, or set the held one
// and hold the next; once the queue runs out the held piece comes into play).
function holdOrders(q) {
  const out = new Map();
  const rec = (i, held, seq) => {
    if (seq.length) out.set(seq.map((e) => e.id + (e.rot || 0)).join(), seq);
    if (i < q.length) rec(i + 1, held, seq.concat([q[i]]));
    if (held) rec(Math.min(i + 1, q.length), i < q.length ? q[i] : null, seq.concat([held]));
    else if (i + 1 < q.length) rec(i + 2, q[i], seq.concat([q[i + 1]]));
  };
  rec(0, null, []);
  return [...out.values()];
}
test('gem puzzles need every piece: fewer never take every gem, in order or in any order a hold slot allows', () => {
  const seen = { E: 0, M: 0, H: 0 };
  let proved = 0;
  const check = (p) => {
    assert(p.goal.type === 'gems' && !p.fallback, 'a gem puzzle: ' + p.seed);
    // The generator's proof (every move the engine allows, every hold order), again with room to spare …
    assert.strictEqual(Puzzles.winsEarly(p, p.pieces, 1e6), false, 'no shortcut: ' + p.seed);
    // … and the plain search agrees: no strict prefix of any order the pieces can be set in takes every gem.
    const orders = p.mods.includes('hold') ? holdOrders(p.pieces) : [p.pieces];
    for (const o of orders) for (let k = 1; k < p.pieces.length && k <= o.length; k++) {
      const r = Puzzles.solvableInOrder(p, o.slice(0, k), 20000);
      assert.notStrictEqual(r, true, k + ' of ' + p.pieces.length + ' pieces take every gem in ' + p.seed);
      if (r === false) proved++;
    }
    // A gem sits in a row the solution's last piece completes …
    const last = p.solution[p.solution.length - 1], rows = Pieces.get(last.id).rots[last.r].map(([, cy]) => last.y + cy);
    assert(p.cells.some((v, i) => (v & L.CELL.GEM) && rows.includes(Math.floor(i / p.w))), 'a gem in the last piece\'s rows: ' + p.seed);
    // … and the whole solution still plays out through the engine.
    replay(p);
    seen[p.diff]++;
  };
  for (let i = 1; i <= 40; i++) for (const d of ['E', 'M', 'H']) for (const spin of [false, true]) {
    const p = Puzzles.generate(Puzzles.numberedSeed(d, i, spin));
    if (p.goal.type === 'gems') check(p);
  }
  // Gem puzzles with Hold are rare; these are some.
  for (const s of ['E-5AT7U5U', 'E-3M4TUNX', 'M-3F56ENZ', 'M-2C6P59U']) {
    const p = Puzzles.generate(s);
    assert(p.mods.includes('hold'), 'Hold: ' + s);
    check(p);
  }
  assert(seen.E >= 6 && seen.M >= 15 && seen.H >= 10 && proved > 100, 'gem puzzles turn up: ' + JSON.stringify(seen) + ', ' + proved);
});
test('making gem puzzles need every piece left every other puzzle exactly as it was', () => {
  // A fingerprint of every puzzle among the first 40 seeds of each kind that is not a gem puzzle (these numbers are),
  // retaken whenever GEN_VERSION goes up (6: Big Minos review fixes; 7: Odd Shapes deals all 18 pentominoes). A change to gem puzzles alone must leave it as it is.
  const gems = { E: [4, 9, 14, 15, 20, 26, 28, 31, 35, 37, 38, 40], ES: [4, 12, 16, 18, 19, 29, 36, 38], M: [5, 15, 17, 19, 21, 26, 27, 28, 32, 36], MS: [4, 5, 7, 9, 10, 11, 15, 17, 18, 21, 32], H: [5, 15, 34, 35, 37, 40], HS: [8, 10, 11, 29, 31] };
  const h = require('crypto').createHash('sha1');
  let n = 0;
  for (const d of ['E', 'M', 'H']) for (const spin of [false, true]) for (let i = 1; i <= 40; i++) {
    if (gems[d + (spin ? 'S' : '')].includes(i)) continue;
    const p = Puzzles.generate(Puzzles.numberedSeed(d, i, spin));
    assert.notStrictEqual(p.goal.type, 'gems', p.seed);
    n++; h.update(JSON.stringify(p));
  }
  assert.strictEqual(n + ' ' + h.digest('hex'), '188 7b8079034982613f0ed35b8bc0d0e1de668d4f55');
});
test('dailies: one seed per date, the same everywhere, and every seed knows its date', () => {
  const seen = new Set();
  for (let d = 0; d < 800; d++) {
    const key = new Date(Date.UTC(2026, 0, 1) + d * 86400000).toISOString().slice(0, 10);
    const s = Puzzles.dailySeed('M', key);
    assert(!seen.has(s)); seen.add(s);
    assert.strictEqual(Puzzles.dailyDateOf(s).key, key);
  }
  assert.strictEqual(Puzzles.dailySeed('E', '2026-09-26'), Puzzles.dailySeed('E', '2026-09-26'));
  assert.notStrictEqual(Puzzles.dailySeed('E', '2026-09-26'), Puzzles.dailySeed('H', '2026-09-26'));
  assert.strictEqual(Puzzles.SEEDS_PER_DIFF, 2 ** 32);
  assert.strictEqual(Puzzles.parseSeed('M-ZZZZZZZ').seed, Puzzles.parseSeed('M-' + L.codeFromInt(L.intFromCode('ZZZZZZZ'))).seed, 'codes past 2^32 read as the seed they wrap to');
});
test('the same seed builds the same puzzle', () => {
  for (const d of ['E', 'M', 'H']) {
    const s = Puzzles.numberedSeed(d, 42);
    assert.strictEqual(JSON.stringify(Puzzles.generate(s)), JSON.stringify(Puzzles.generate(s)));
  }
});
test('Odd Shapes deals all 18 pentominoes: mirror images turn up, and their solutions play out', () => {
  const mirrors = new Set(Pieces.PENTO18.filter((id) => !Pieces.PENTOMINOES.includes(id))), seen = new Set();
  let odd = 0;
  for (let i = 1; i <= 120 && odd < 30; i++) for (const d of ['E', 'M', 'H']) {
    const p = Puzzles.generate(Puzzles.numberedSeed(d, i, i % 2 === 0));
    if (!p.mods.includes('odd')) continue;
    odd++;
    for (const e of p.pieces) if (mirrors.has(e.id)) seen.add(e.id);
    if (p.pieces.some((e) => mirrors.has(e.id))) replay(p);
  }
  assert(odd >= 10 && seen.size >= 3, odd + ' Odd Shapes puzzles, mirrors seen: ' + [...seen].join(' '));
});
const counts = { E: 250, M: 250, H: 250 };
// Generation is timed by the CPU time of this thread, not the wall clock: on a loaded machine (parallel jobs, CI
// neighbours) the wall clock also counts the time spent waiting for a core, which says nothing about the generator.
// On an idle machine the two agree: generating is plain synchronous work, the wait a player sees. (A Node without
// threadCpuUsage gets the whole process's CPU time: a little more, as it counts the GC's helper threads too.)
const cpuMs = () => { const u = process.threadCpuUsage ? process.threadCpuUsage() : process.cpuUsage(); return (u.user + u.system) / 1000; };
// Numbered seeds as they were generated (and replayed) here, for the Big Minos tests below.
const generated = { E: new Map(), M: new Map(), H: new Map() };
for (const d of ['E', 'M', 'H']) {
  test(Puzzles.DIFFS[d].name + ': ' + counts[d] + ' puzzles generate fast and play out through the engine', () => {
    const mods = {}; let ms = 0, worst = 0, pieces = 0, wall = 0;
    for (let n = 1; n <= counts[d]; n++) {
      const t0 = cpuMs(), w0 = Date.now();
      const p = Puzzles.generate(Puzzles.numberedSeed(d, n));
      const dt = cpuMs() - t0; ms += dt; worst = Math.max(worst, dt); wall += Date.now() - w0;
      assert(p && !p.fallback, 'built ' + n);
      generated[d].set(n, p);
      p.mods.forEach((m) => { mods[m] = (mods[m] || 0) + 1; });
      pieces += p.pieces.length;
      replay(p);
      // Nothing starts already solved, and no row starts full.
      assert(!Puzzles.goalMet(p, Board.fromArray(p.w, p.h, p.cells), 0));
      assert.strictEqual(Board.fromArray(p.w, p.h, p.cells).fullRows().length, 0);
    }
    const avg = ms / counts[d];
    assert(avg < 40, 'average ' + avg.toFixed(1) + ' ms CPU');
    const expected = Object.keys(Puzzles.MODS).filter((m) => Puzzles.MODS[m].w[d] > 0);
    for (const m of expected) assert(mods[m] > 0, 'wildcard ' + m + ' appears in ' + d);
    console.log('       avg ' + avg.toFixed(1) + ' ms CPU (' + (wall / counts[d]).toFixed(1) + ' ms by the clock), worst ' + worst.toFixed(0) + ' ms, ' + (pieces / counts[d]).toFixed(1) + ' pieces each');
  });
}
// Big Minos: each seed draws a mix of big pieces and tetrominoes (BIG_MIX in js/puzzlegen.js). The first `want`
// Big Minos puzzles among the numbered seeds, each replayed through the engine.
function bigPuzzles(d, want) {
  const out = [];
  for (let n = 1; out.length < want; n++) {
    let p = generated[d].get(n);
    if (!p) {
      p = Puzzles.generate(Puzzles.numberedSeed(d, n));
      assert(p && !p.fallback, 'built ' + p.seed);
      generated[d].set(n, p);
      if (p.mods.includes('big')) replay(p);
    }
    if (p.mods.includes('big')) out.push(p);
  }
  return out;
}
const BIG_WANT = { E: 100, M: 60, H: 60 };
const queueOf = (p) => p.solution.map((s) => (Pieces.get(s.id).big ? 'B' : 'r')).join('');
test('Big Minos puzzles vary their mix: mostly a big piece or two among tetrominoes, some about half, a few all or nearly all big', () => {
  const shares = {};
  for (const d of ['E', 'M', 'H']) {
    const ps = bigPuzzles(d, BIG_WANT[d]), n = ps.length, by = { sparse: 0, half: 0, all: 0 };
    for (const p of ps) {
      const q = queueOf(p), big = q.split('B').length - 1;
      assert(p.pieces.every((e) => Pieces.get(e.id).big || Pieces.TETROMINOES.includes(e.id)), 'big pieces and tetrominoes: ' + p.seed);
      assert(big >= 1, 'at least one big piece: ' + p.seed);
      by[p.mix]++;
      if (p.mix === 'sparse') assert(2 * big < q.length, 'sparse: fewer than half big ' + q + ' ' + p.seed);
      else if (p.mix === 'half') assert(2 * big >= q.length && big < q.length, 'half: about half big ' + q + ' ' + p.seed);
      else if (p.mix === 'all') assert(big >= 3 && (d === 'H' ? q[0] === 'r' && big >= 0.6 * q.length : big === q.length), 'all: all big (Hard: a tetromino first, then nearly all big) ' + q + ' ' + p.seed);
      else assert.fail('no mix: ' + p.seed);
      // A big piece counts where it comes late: a queue only opens with one when one also ends it.
      assert(q[0] === 'r' || q[q.length - 1] === 'B', 'no big filler first: ' + q + ' ' + p.seed);
      if (d === 'H') assert.notStrictEqual(p.goal.type, 'gems', 'no gems on Hard: ' + p.seed);
    }
    assert(by.sparse >= 0.45 * n && by.sparse <= 0.75 * n && by.half >= 0.15 * n && by.half <= 0.45 * n && by.all >= 2 && by.all <= 0.2 * n && by.sparse > by.half && by.half > by.all,
      d + ': about 6 : 3 : 1, ' + JSON.stringify(by));
    shares[d] = by.sparse + ' : ' + by.half + ' : ' + by.all;
  }
  console.log('       sparse : half : all ' + JSON.stringify(shares));
});
test('Big Minos: the big pieces matter — set first, as filler, they mostly leave no way through', () => {
  // Lines and clear puzzles with tetrominoes too, played in order: the big pieces moved to the front of the queue.
  const share = { E: 0.35, M: 0.5, H: 0.6 };
  for (const d of ['E', 'M', 'H']) {
    let n = 0, stuck = 0;
    for (const p of bigPuzzles(d, BIG_WANT[d])) {
      const q = p.solution.map((s) => ({ id: s.id, rot: s.rot })), big = q.filter((e) => Pieces.get(e.id).big);
      if (p.goal.type === 'gems' || p.mods.includes('hold') || big.length === q.length) continue;
      n++;
      if (Puzzles.solvableInOrder(p, big.concat(q.filter((e) => !Pieces.get(e.id).big)), 20000) === false) stuck++;
    }
    assert(n >= 15 && stuck >= share[d] * n, d + ': big pieces first leave no way through in ' + stuck + ' of ' + n);
  }
});
/**
 * −log2 of the chance that a player who sets each piece, in order, on a random spot filling only holes of the band
 * (every spot the engine's moves reach) solves a lines or clear puzzle; Infinity past `limit` positions.
 */
function puzzleBits(p, limit) {
  const opts = { noRotate: p.mods.includes('rigid'), heavy: p.mods.includes('heavy'), both: true, engine: true };
  const board = Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap });
  const types = p.pieces.map((e) => Pieces.get(e.id)), memo = new Map();
  let nodes = 0;
  const go = (i, band, lines) => {
    if (i === types.length) return Puzzles.goalMet(p, board, lines) ? 1 : 0;
    const k = i + '|' + band.join() + '|' + board.cells.join('');
    if (memo.has(k)) return memo.get(k);
    if (++nodes > limit) throw puzzleBits;
    const type = types[i];
    const spots = Puzzles.restingStates(board, type, p.pieces[i].rot || 0, opts, (r, x, y) => type.rots[r].every(([, cy]) => band.includes(y + cy)));
    let sum = 0;
    for (const [r, x, y] of spots) {
      const snap = board.snapshot();
      board.place(type.rots[r], x, y, type.color);
      const rows = board.fullRows();
      board.clearRows(rows);
      sum += go(i + 1, band.filter((b) => !rows.includes(b)).map((b) => b - rows.filter((c) => c < b).length), lines + rows.length);
      board.restore(snap);
    }
    const v = spots.length ? sum / spots.length : 0;
    memo.set(k, v);
    return v;
  };
  const band = [];
  for (let y = p.base; y < p.base + p.goal.lines; y++) band.push(y);
  try { return -Math.log2(go(0, band, 0)); } catch (e) { if (e === puzzleBits) return Infinity; throw e; }
}
test('Big Minos puzzles are about as hard as the other puzzles of their difficulty', () => {
  // Coarse: lines and clear puzzles without Hold, the first `take` of each kind. A Big Minos puzzle is harder than
  // another puzzle about half the time (when every piece was big: 8 to 16% of the time).
  const take = { E: 50, M: 30, H: 40 }, out = {};
  for (const d of ['E', 'M', 'H']) {
    const fits = (p) => p.goal.type !== 'gems' && !p.mods.includes('hold');
    const big = bigPuzzles(d, BIG_WANT[d]).filter(fits).slice(0, take[d]);
    const rest = [];
    for (let n = 1; rest.length < take[d]; n++) { const p = generated[d].get(n); if (!p.mods.includes('big') && fits(p)) rest.push(p); }
    const b = big.map((p) => puzzleBits(p, 2000)), r = rest.map((p) => puzzleBits(p, 2000));
    let wins = 0;
    for (const x of b) for (const y of r) wins += x > y ? 1 : x === y ? 0.5 : 0;
    const harder = wins / (b.length * r.length);
    out[d] = harder.toFixed(2);
    // The common mix on its own: a big piece or two among tetrominoes.
    const sb = big.map((p, i) => (p.mix === 'sparse' ? b[i] : null)).filter((x) => x !== null);
    let sw = 0;
    for (const x of sb) for (const y of r) sw += x > y ? 1 : x === y ? 0.5 : 0;
    out[d + ' sparse'] = (sw / (sb.length * r.length)).toFixed(2);
    assert(sb.length >= 10 && sw / (sb.length * r.length) >= 0.3 && sw / (sb.length * r.length) <= 0.7, d + ': sparse Big Minos puzzles are harder than another ' + out[d + ' sparse']);
    assert.strictEqual(big.length, take[d], d + ': enough Big Minos puzzles');
    assert(harder >= 0.35 && harder <= 0.65, d + ': a Big Minos puzzle is harder than another ' + (harder * 100).toFixed(0) + '% of the time');
  }
  console.log('       a Big Minos puzzle is harder than another: ' + JSON.stringify(out));
});
test('Big Minos: Easy queues vary where the big piece comes, and are seldom as short as two pieces', () => {
  const ps = bigPuzzles('E', BIG_WANT.E), sparse = new Set(), at = new Set();
  let short = 0, four = 0;
  for (const p of ps) {
    const q = queueOf(p);
    if (p.mix === 'sparse') { sparse.add(q); at.add(q.length + ':' + q.indexOf('B')); }
    if (q.length < 3) short++;
    if (q.length >= 4) four++;
  }
  assert(sparse.size >= 2 && at.size >= 2, 'more than one sparse queue: ' + [...sparse].join(' '));
  assert(four >= 5 && short <= 0.2 * ps.length, 'four-piece queues ' + four + ', two-piece ' + short + ' of ' + ps.length);
});
test('Big Minos seeds stay Big Minos, both ways too, and generate in good time', () => {
  // Every eighth failed board from the 48th on redraws the wildcards; Big Minos is kept through that.
  const want = { ES: 60, MS: 40, HS: 20 }, out = {};
  for (const k of Object.keys(want)) {
    let n = 0, ms = 0, worst = 0;
    for (let i = 1; n < want[k]; i++) {
      const s = Puzzles.numberedSeed(k[0], i, true);
      if (!Puzzles.firstMods(s).includes('big')) continue;
      n++;
      const t0 = Date.now(), p = Puzzles.generate(s), dt = Date.now() - t0;
      ms += dt; worst = Math.max(worst, dt);
      assert(p && !p.fallback && p.mods.includes('big') && p.mods.includes('spin'), 'still Big Minos, both ways: ' + s + ' ' + (p && p.mods));
      assert(!Puzzles.verify(p, true), 'needs the other turn: ' + s);
      replay(p);
    }
    out[k] = (ms / n).toFixed(0) + ' ms avg, worst ' + worst;
    assert(ms / n < 150, k + ': average ' + (ms / n).toFixed(0) + ' ms');
  }
  console.log('       ' + JSON.stringify(out));
});
test('Both Ways never comes with Heavy (a heavy piece turns only in open air, where one turn button reaches every way)', () => {
  assert(Puzzles.MODS.spin.x.includes('heavy'));
  let heavy = 0;
  for (const d of ['E', 'M', 'H']) for (let i = 1; i <= 400; i++) {
    assert(!Puzzles.firstMods(Puzzles.numberedSeed(d, i, true)).includes('heavy'), 'no Heavy on ' + Puzzles.numberedSeed(d, i, true));
    if (Puzzles.firstMods(Puzzles.numberedSeed(d, i)).includes('heavy')) heavy++;
  }
  assert(heavy > 20, 'Heavy still turns up without Both Ways: ' + heavy);
});
test('the Big Minos note says every piece is big only when every piece is', () => {
  const some = Puzzles.MODS.big.desc, every = 'Every piece is twice the size.';
  let all = 0, mixed = 0;
  for (const d of ['E', 'M', 'H']) for (const p of bigPuzzles(d, BIG_WANT[d])) {
    const allBig = p.pieces.every((e) => Pieces.get(e.id).big);
    assert.strictEqual(Puzzles.modDesc(p, 'big'), allBig ? every : some, p.seed);
    if (allBig) all++; else mixed++;
  }
  assert(all >= 3 && mixed >= 30 && some === 'Some pieces are twice the size.', all + ' all big, ' + mixed + ' mixed');
  assert.strictEqual(Puzzles.modDesc({ pieces: [{ id: 'T' }] }, 'fog'), Puzzles.MODS.fog.desc);
});
test('daily seeds change with the day', () => {
  assert.notStrictEqual(Puzzles.dailySeed('M', '2026-09-26'), Puzzles.dailySeed('M', '2026-09-27'));
  assert(Puzzles.parseSeed(Puzzles.dailySeed('H', '2026-09-26')));
});

// The Factory is shelved for now (Lull/Shelved/factory/): its tests went with it.
const HOUR = 3600e3, MIN = 60e3;

console.log('achievements');
test('achievements: earned once, by the right events, none of them a gimme', () => {
  const st = L.defaultState();
  const A = L.Achievements;
  assert(A.LIST.length >= 25 && new Set(A.LIST.map((a) => a.id)).size === A.LIST.length);
  assert(A.LIST.every((a) => a.pay >= 15), 'every one pays something real');
  const g = new Game({ w: 10, h: 20, seed: 1 });
  // An ordinary single clear earns nothing.
  assert.deepStrictEqual(A.check(st, { mode: 'play', r: { lines: 1, combo: 0 }, g }), []);
  assert.deepStrictEqual(A.check(st, { mode: 'play', r: { lines: 4, combo: 0, special: 'laser' }, g }), [], 'a laser through four rows is not a quad');
  const quad = A.check(st, { mode: 'play', r: { lines: 4, combo: 0, hand: true }, g }).map((a) => a.id);
  assert.deepStrictEqual(quad, ['quad']);
  assert.deepStrictEqual(A.check(st, { mode: 'play', r: { lines: 4, combo: 0, hand: true }, g }), [], 'only once');
  g.s.b2b = 8; g.s.score = 300000;
  // The streaks and combos count only by hand: the board's own streak of 8 is not enough.
  assert.deepStrictEqual(A.check(st, { mode: 'play', r: { lines: 2, twist: true, combo: 10 }, g }).map((a) => a.id).sort(), ['score250k', 'score50k']);
  g.s.hb2b = 8; g.s.hcombo = 10;
  const big = A.check(st, { mode: 'play', r: { lines: 2, twist: true, combo: 10, hand: true }, g }).map((a) => a.id).sort();
  assert.deepStrictEqual(big, ['b2b3', 'b2b8', 'combo10', 'combo5', 'tsd'].sort());
  assert.deepStrictEqual(A.check(st, { mode: 'classic', score: 120000, level: 10, quads: 1 }).map((a) => a.id).sort(), ['cl_100k', 'cl_l10']);
  assert.deepStrictEqual(A.check(st, { mode: 'puzzle', diff: 'H', firstTry: true, hinted: true, mods: [] }), [], 'a hinted solve is not a Hard Nut');
});
test('achievements: Recent lists the latest earned, newest first (a shared moment keeps the toasts\' order, reversed)', () => {
  const A = L.Achievements, st = L.defaultState();
  assert.deepStrictEqual(A.recent(st), []);
  const ids = A.LIST.map((a) => a.id);
  st.achievements = { [ids[5]]: 1000, [ids[2]]: 3000, [ids[9]]: 2000, [ids[7]]: 3000, [ids[1]]: 500, [ids[3]]: 4000, [ids[4]]: 100 };
  // ids[7] and ids[2] were earned together: told in list order (2, then 7), so 7 is the newer.
  assert.deepStrictEqual(A.recent(st).map((x) => x.a.id), [ids[3], ids[7], ids[2], ids[9], ids[5]]);
  assert.deepStrictEqual(A.recent(st, 2).map((x) => [x.a.id, x.when]), [[ids[3], 4000], [ids[7], 3000]]);
  assert.strictEqual(A.recent(st, 10).length, 7);
});
test('how long ago, short', () => {
  const now = Date.UTC(2026, 8, 27, 12);
  assert.deepStrictEqual([0, 59e3, 60e3, 59 * 60e3, 3600e3, 23.9 * 3600e3, 24 * 3600e3, 6.9 * 86400e3].map((d) => L.fmtAgo(now - d, now)), ['now', 'now', '1 min', '59 min', '1 h', '23 h', '1 d', '6 d']);
  assert.strictEqual(L.fmtAgo(now + 5000, now), 'now', 'a clock turned back reads as now');
  assert(/\d/.test(L.fmtAgo(now - 8 * 86400e3, now)) && !/ d$/.test(L.fmtAgo(now - 8 * 86400e3, now)), 'a week on, the date');
});
console.log('effects physics');
{
  load(['fxphysics.js']);
  const { World } = L.FxPhysics;
  const S = 20, box = { x: 0, y: 0, w: 200, h: 400 };
  const world = (gx, gy, o) => { const w = new World(o); w.setFrame(box, gx == null ? 0 : gx, gy == null ? 1 : gy, S); return w; };
  const run = (w, secs) => { for (let t = 0; t < secs; t += 1 / 60) w.step(1 / 60); };
  test('fx physics: a block falls with gravity, faster and faster, along the board\'s own down', () => {
    const w = world();
    const b = w.body({ x: 100, y: 50, size: S, max: 10 });
    w.step(0.05); const v1 = b.vy, y1 = b.y;
    w.step(0.05);
    assert(b.vy > v1 && v1 > 0 && b.y > y1, 'accelerating down');
    assert(Math.abs(b.vy - 0.1 * L.FxPhysics.G * S) < 1e-6);
    const side = world(-1, 0); // Sideways: the floor is on the left
    const c = side.body({ x: 150, y: 200, size: S, max: 10 });
    side.step(0.05);
    assert(c.vx < 0 && c.vy === 0);
  });
  test('fx physics: it bounces off the floor, loses energy, and comes to rest on it inside the walls', () => {
    const w = world();
    const b = w.body({ x: 100, y: 100, vx: 400, size: S, rest: 0.4, fric: 0.8, max: 10 });
    let bounced = false, top = Infinity;
    for (let i = 0; i < 240; i++) {
      const before = b.vy;
      w.step(1 / 60);
      if (before > 0 && b.vy < 0) bounced = true;
      if (bounced) top = Math.min(top, b.y);
      assert(b.x >= S / 2 - 1e-6 && b.x <= box.w - S / 2 + 1e-6, 'inside the walls');
      assert(b.y <= box.h - S / 2 + 1e-6, 'never through the floor');
    }
    assert(bounced, 'it bounced');
    assert(top > 100, 'lower than it started: the bounce lost energy');
    assert(Math.abs(b.y - (box.h - S / 2)) < 1, 'resting on the floor');
    assert(Math.abs(b.vy) < S, 'and still');
    const flip = world(0, -1); // Upside Down: the floor is the top edge
    const u = flip.body({ x: 100, y: 300, size: S, max: 10 });
    run(flip, 3);
    assert(Math.abs(u.y - S / 2) < 1);
  });
  test('fx physics: falling blocks land on the settled stack, not through it', () => {
    const w = world();
    w.setFrame(box, 0, 1, S, (px, py) => py >= 300); // a stack whose top is at y = 300
    const b = w.body({ x: 100, y: 100, size: S, solid: true, rest: 0.2, max: 10 });
    run(w, 2);
    assert(Math.abs(b.y - (300 - S / 2)) < 1, 'on top of the stack: ' + b.y);
  });
  test('fx physics: a drop lands exactly on its spot, hides that cell until it does, then is done', () => {
    const w = world(), mask = new Uint8Array(10);
    const b = w.body({ mode: 'drop', x: 50, y: 30, tx: 50, ty: 330, v0: 0, rest: 0.3, size: S, key: 7, max: 5 });
    assert(w.fillHidden(mask) && mask[7] === 1);
    let landed = false;
    b.onLand = () => { landed = true; };
    for (let i = 0; i < 90 && w.nb; i++) { w.step(1 / 60); assert(b.y <= 330 + 1e-6, 'never below its spot'); }
    assert(landed, 'it landed');
    assert.strictEqual(w.nb, 0, 'and finished');
    assert.strictEqual(w.hiding, 0);
    mask.fill(0);
    assert(!w.fillHidden(mask) && mask[7] === 0);
  });
  test('fx physics: when the board changes again, blocks still falling to a cell are done at once; debris flies on', () => {
    const w = world(), mask = new Uint8Array(10);
    w.body({ mode: 'drop', x: 50, y: 30, tx: 50, ty: 330, size: S, key: 3, max: 5 });
    w.body({ mode: 'hold', wake: 0.02, next: 'drop', x: 70, y: 30, tx: 70, ty: 330, size: S, key: 4, max: 5 });
    const debris = w.body({ x: 100, y: 100, vx: 50, size: S, max: 5 });
    w.step(1 / 60);
    w.land();
    assert.strictEqual(w.hiding, 0);
    assert(!w.fillHidden(mask), 'no cell hidden any more');
    assert(w.nb === 1 && w.bodies[0] === debris && debris.on);
  });
  test('fx physics: a spiral ends in the middle, and breaking blocks become particles that fade away', () => {
    const w = world();
    let done = false;
    w.body({ mode: 'spiral', x: 150, y: 100, cx: 100, cy: 100, rad: 50, ang: 0, w0: 2, acc: 300, size: S, max: 5, onDone: () => { done = true; } });
    run(w, 1.2);
    assert(done && w.nb === 0);
    for (const act of ['chips', 'crush', 'pixels', 'grains', 'fade']) w.body({ mode: 'hold', x: 100, y: 100, size: S, wake: 0.05, act, max: 5 });
    run(w, 0.1);
    assert(w.nb === 0 && w.np > 40, 'bodies broke into ' + w.np + ' particles');
    run(w, 1.5);
    assert(!w.active, 'all gone');
  });
  test('fx physics: pools are bounded and recycled, and drawing needs only a canvas', () => {
    const w = world(0, 1, { maxBodies: 50, maxParts: 200 });
    const parts = w.parts.slice(), bodies = w.bodies.slice();
    for (let i = 0; i < 1000; i++) { w.body({ x: 100, y: 100, vx: i % 7, size: S, max: 1 }); w.part('chip', 100, 100, 5, -5, 1, 3, '#fff', 1); w.part('spark', 100, 100, 5, -5, 1, 3, '#fff', 1); }
    assert.strictEqual(w.nb, 50); assert.strictEqual(w.np, 200);
    assert(w.parts.every((p) => parts.includes(p)) && w.bodies.every((b) => bodies.includes(b)), 'the same objects, reused');
    const calls = {};
    const ctx = new Proxy({ __dpr: 2, getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) }, {
      get: (o, k) => (k in o ? o[k] : (calls[k] = calls[k] || 0, (...a) => { calls[k]++; })),
      set: (o, k, v) => { o[k] = v; return true; },
    });
    w.body({ x: 10, y: 10, size: S, max: 1, paint: () => { calls.paint = (calls.paint || 0) + 1; } });
    w.draw(ctx, () => ({}));
    assert.strictEqual(calls.drawImage, 49, 'every sprite body drawn');
    assert.strictEqual(calls.paint, 1, 'a painted body paints itself');
    assert.strictEqual(calls.fillRect + calls.stroke, 200, 'every particle drawn');
    run(w, 1.1);
    assert(!w.active && w.nb === 0 && w.np === 0);
  });
  test('the drill reports where its bit started', () => {
    const g = new Game({ w: 10, h: 20, seed: 3 });
    for (let x = 0; x < 10; x++) g.board.set(x, 0, 2);
    g.setSpecial('drill');
    const [x, y] = g.cellsOf()[0];
    const r = g.drop();
    assert.deepStrictEqual(r.bit, [x, y]);
    assert.deepStrictEqual(r.drilled, [[x, 0, 2]]);
  });
}
test('achievements pay a modest share: bands, the old order kept, a total well under what the Shop sells', () => {
  const A = L.Achievements;
  // What each paid before the rebalance: a cheaper one never came to pay more than a dearer one.
  const OLD = {
    quad: 15, tsd: 25, combo5: 40, b2b3: 50, lines150: 50, toolbox: 50, score50k: 60, tst: 80, pc: 120, mini2: 150,
    combo10: 200, golden_ts: 200, pace33: 250, quads4: 250, lines500: 250, b2b8: 300, tst_b2b: 300, old_growth: 300,
    pc_open: 300, it_showman: 300, pc3: 400, pc_b2b: 400, all_items: 400, it_sweep: 400, score250k: 500, sb_combos:
    500, twist100: 600, clean40: 700, chain20: 800, pace67: 1000, pc_twist: 1000, quads10: 1200, pc10: 1500, tst10:
    1500, b2b20: 1500, golden20: 1500, million: 2000, purist: 2500, lines5000: 3000, cl_fourq: 40, cl_l10: 50,
    cl_100k: 60, cl_l15: 150, cl_300k: 200, cl_t25: 1500, cl_l20: 1500, cl_1m: 3000, cl_games100: 120, cl_tenq:
    200, cl_nohold: 250, cl_pc: 300, cl_tst: 300, cl_dash: 300, cl_twist10: 350, cl_quads4: 300, cl_b2b8: 600,
    cl_combo10: 400, cl_allquads: 700, cl_dash50: 2000, cl_nohold20: 2000, cl_combo15: 1500, cl_l25: 2500,
    pz_hard: 40, pz_hold: 30, pz_daily: 60, pz_streak: 80, pz_wild: 100, pz_hard25: 150, pz_500: 1000, pz_d100:
    1500, pz_h50: 2000, pz_clean: 120, pz_daily3: 150, pz_spin: 250, pz_fast: 300, pz_wild3: 300, pz_first20: 400,
    pz_hfirst25: 500, pz_h100: 600, pz_wildH: 1500, pz_daily30: 2000, pz_first100: 3000, lu_triathlon: 150,
    lu_hours10: 150, lu_days30: 300, lu_half: 400, lu_100k: 500, lu_curator: 2000, lu_hours100: 2000, lu_days100:
    2000, lu_1m: 5000, lu_all: 5000,
  };
  // The game's own achievements (a board option's own, Achievements.add, are its tests' to hold).
  const LIST = A.LIST.filter((a) => a.id in OLD);
  assert.deepStrictEqual(Object.keys(OLD).sort(), LIST.map((a) => a.id).sort(), 'the same achievements');
  for (const a of LIST) for (const b of LIST) if (OLD[a.id] < OLD[b.id]) assert(a.pay <= b.pay, a.id + ' ' + a.pay + ' > ' + b.id + ' ' + b.pay);
  assert(LIST.every((a) => a.pay >= 15), 'every one pays something real');
  const normal = LIST.filter((a) => a.tier !== 'legend').map((a) => a.pay), legend = LIST.filter((a) => a.tier === 'legend').map((a) => a.pay);
  assert(Math.max(...normal) <= 200 && Math.max(...normal) < 250 && Math.min(...legend) >= 250, 'normal 15–200, legendary 250 and up');
  assert.deepStrictEqual(LIST.filter((a) => a.pay >= 1000).map((a) => [a.id, a.pay]), [['lu_all', 1000]], 'only Lull reaches 1,000');
  const total = LIST.reduce((n, a) => n + a.pay, 0);
  const forSale = Object.values(L.COSMETICS).flatMap((k) => Object.values(k)).filter((c) => c.price > 0 && !c.reward).reduce((n, c) => n + c.price, 0);
  assert(total <= 20000 && total <= 0.5 * forSale, total + ' against ' + forSale + ' for sale');
  assert.strictEqual(total, 17430);
  const sums = {};
  for (const a of LIST) { const k = a.group; sums[k] = sums[k] || [0, 0]; sums[k][a.tier === 'legend' ? 1 : 0] += a.pay; }
  assert.deepStrictEqual(sums, { play: [2430, 3925], classic: [1450, 2800], puzzle: [1080, 2300], lull: [495, 2950] });
});
test('achievements: a fresh save and a short ordinary game earn nothing', () => {
  const st = L.defaultState(), A = L.Achievements;
  assert(A.LIST.length >= 85, 'many of them');
  assert(A.LIST.filter((a) => a.tier === 'legend').length >= 28, 'plenty of legends');
  assert(A.GROUPS.some((g) => g.id === 'lull') && A.LIST.every((a) => A.GROUPS.some((g) => g.id === a.group)));
  const normal = A.LIST.filter((a) => a.tier !== 'legend').map((a) => a.pay), legend = A.LIST.filter((a) => a.tier === 'legend').map((a) => a.pay);
  assert(Math.max(...normal) < Math.min(...legend), 'a legendary one pays more than any other');
  // Nothing on a fresh save, whatever the event.
  for (const mode of ['tick', 'play', 'classic', 'puzzle']) assert.deepStrictEqual(A.check(st, { mode, r: { lines: 0, combo: 0 }, g: new Game({ w: 10, h: 20, seed: 2 }), score: 0, level: 1, lines: 0, quads: 0, ms: 0, diff: 'E', firstTry: false, mods: [] }), [], mode);
  // An ordinary player: each piece goes where it leaves the flattest stack (tried out, then taken back).
  const bot = (g, n, onLock, before) => {
    const place = (rot, x) => { for (let k = 0; k < rot; k++) g.rotate(1); for (let k = 0; k < 10; k++) g.moveToward(x); return g.drop(); };
    const judge = (r) => {
      const b = g.board; let agg = 0, holes = 0, bump = 0, prev = null;
      for (let x = 0; x < b.w; x++) {
        let hgt = 0; for (let y = b.h - 1; y >= 0; y--) if (b.get(x, y)) { hgt = y + 1; break; }
        for (let y = 0; y < hgt; y++) if (!b.get(x, y)) holes++;
        agg += hgt; if (prev != null) bump += Math.abs(hgt - prev); prev = hgt;
      }
      return r.lines * 8 - agg * 0.5 - holes * 4 - bump * 0.3;
    };
    let trying = false;
    g.on('lock', (r) => { if (!trying) onLock(r); });
    for (let i = 0; i < n && !g.over; i++) {
      if (before) before(i);
      let best = null;
      trying = true;
      for (let rot = 0; rot < 4; rot++) for (let x = 0; x < 10; x++) {
        const r = place(rot, x); if (!r) continue;
        const v = judge(r); if (!best || v > best.v) best = { v, rot, x };
        g.undo();
      }
      trying = false;
      place(best.rot, best.x);
    }
  };
  // 150 pieces of Free Play, fed through the real lock events.
  // Its pace is a relaxed one, a piece every three seconds (Free Play notes each lock's time as it happens).
  const g = new Game({ w: 10, h: 20, seed: 11 }), earned = [];
  let clock = 0;
  bot(g, 150, (r) => { g.notePace(r, (clock += 3000)); earned.push(...A.check(st, { mode: 'play', r, g }).map((a) => a.id)); });
  assert(g.s.pieces === 150 && g.s.lines >= 40, 'the bot plays a real game: ' + g.s.lines + ' lines');
  assert.deepStrictEqual(earned, [], 'an ordinary board earns nothing: ' + earned);
  // It clears as tidily as the pace ones ask (36 lines in 100 pieces) — the clock is what it lacks.
  assert(g.s.pace.length === 101 && L.paceOf(g.s, 100).ms === 300000, 'its last hundred pieces: ' + JSON.stringify(L.paceOf(g.s, 100)));
  // The same player with a handful of items along the way (as Free Play uses them: the item, then noteItem).
  const gi = new Game({ w: 10, h: 20, seed: 13 });
  const use = { 15: () => gi.replacePiece({ id: 'I' }), 35: () => gi.replacePiece({ id: 'M1' }), 55: () => gi.setSpecial('patch'), 75: () => gi.settle(), 95: () => gi.setSpecial('phase'), 115: () => gi.setSpecial('bomb'), 125: () => gi.setSpecial('laser') };
  const acts = new Set([75]);
  bot(gi, 150, (r) => { gi.notePace(r, (clock += 3000)); earned.push(...A.check(st, { mode: 'play', r, g: gi }).map((a) => a.id)); },
    (i) => { if (!use[i]) return; const it = use[i](); if (it) { gi.s.items['item' + i] = 1; gi.noteItem(acts.has(i)); } });
  assert(gi.s.pieces >= 140 && gi.s.lines >= 30, 'with items too: ' + gi.s.lines + ' lines');
  assert.deepStrictEqual(earned, [], 'a short board with a few items earns nothing either: ' + earned);
  // The same player in Classic: a piece a second, levels every ten lines.
  const cg = new Game({ w: 10, h: 20, seed: 12, freeHold: false });
  let cl = 0, tet = 0, t = 0;
  bot(cg, 150, (r) => { cl += r.lines; tet += r.lines >= 4 ? 1 : 0; t += 1000; earned.push(...A.check(st, { mode: 'classic', r, g: cg, score: cg.s.score, level: 1 + Math.floor(cl / 10), lines: cl, quads: tet, ms: t }).map((a) => a.id)); });
  assert(cl >= 40);
  assert.deepStrictEqual(earned, [], 'an ordinary Classic game earns nothing: ' + earned + ' ' + cl + ' lines, ' + JSON.stringify(cg.s.clears));
  // An Easy first-try solve.
  st.stats.puzzle.E.solved = 1; st.stats.puzzle.E.firstTry = 1;
  assert.deepStrictEqual(A.check(st, { mode: 'puzzle', diff: 'E', firstTry: true, hinted: false, undos: 0, ms: 9000, mods: ['mono'] }), []);
  // Progress bars never overflow and never divide by zero.
  for (const a of A.LIST) if (a.progress) { const [have, need] = a.progress(st); assert(need > 0 && have >= 0 && have < need, a.id + ' progress ' + have + '/' + need); }
});
test('achievements: every new one is earned by its own feat, once', () => {
  const A = L.Achievements;
  const fresh = () => { const st = L.defaultState(); return st; };
  // A Normal board's stats as they would be: its own rows are its lines, and its cells four a piece (js/engine.js, score).
  const asPlayed = (s, o) => Object.assign(s, o || {}, o && 'lines' in o && !('own' in o) ? { own: o.lines } : null, o && 'pieces' in o && !('cells' in o) ? { cells: o.pieces * 4 } : null);
  const board = (o) => { const g = new Game({ w: 10, h: 20, seed: 1 }); asPlayed(g.s, o); return g; };
  const play = (r, s) => ({ mode: 'play', r: Object.assign({ lines: 0, combo: 0 }, r), g: board(s) });
  const classic = (o, s) => Object.assign({ mode: 'classic', r: { lines: 0, combo: 0 }, g: board(s), score: 0, level: 1, lines: 0, quads: 0, ms: 1e7 }, o);
  const puzzle = (o) => Object.assign({ mode: 'puzzle', diff: 'H', firstTry: false, hinted: false, undos: 0, ms: 60000, mods: [] }, o);
  const today = L.dateKey();
  const cases = [
    ['toolbox', play({ lines: 1 }, { items: { reroll: 1, pick: 1, drill: 1, flip: 1 } }), null, true],
    ['toolbox', play({ lines: 1 }, { items: { reroll: 1, pick: 1, drill: 1, flip: 1, double: 1 } })],
    ['mini2', play({ lines: 2, mini: true }), null, true],
    ['mini2', play({ lines: 2, mini: true, hand: true })],
    ['golden_ts', play({ lines: 2, twist: true, golden: true, hand: true }), null, true],
    ['golden_ts', play({ lines: 3, twist: true, golden: true, hand: true })],
    ['quads4', play({ lines: 1 }, { quadRun: 4 }), null, true],
    ['quads4', play({ lines: 1 }, { hquads: 4 })],
    ['lines500', play({ lines: 1 }, { lines: 500 })],
    ['tst_b2b', play({ lines: 3, twist: true, b2b: true, hand: true }, { hb2b: 0 }), null, true],
    ['tst_b2b', play({ lines: 3, twist: true, b2b: true, hand: true }, { hb2b: 1 })],
    ['old_growth', play({ lines: 0 }, { pieces: 2000, startedAt: Date.now() - 31 * 86400e3 })],
    ['pc_b2b', play({ lines: 4, perfect: true, b2b: true }, { hb2b: 1 }), null, true],
    ['pc_b2b', play({ lines: 4, perfect: true, b2b: true, hand: true }, { hb2b: 1 })],
    ['twist100', play({ lines: 0 }, { twists: 100 }), null, true],
    ['twist100', play({ lines: 0 }, { htwists: 100 })],
    ['all_items', play({ lines: 0 }), (st) => { for (const id of L.ITEM_ORDER) st.stats.items.used[id] = 1; }],
    ['pc_open', play({ lines: 4, perfect: true }, { pieces: 10, lines: 4 })],
    ['pc_twist', play({ lines: 2, twist: true, perfect: true, hand: true })],
    ['quads10', play({ lines: 4 }, { hquads: 10 })],
    ['golden20', play({ lines: 1, golden: true, chain: 20 }), null, true],
    ['golden20', play({ lines: 1, golden: true, hand: true }, { goldRun: 5 })],
    ['lines5000', play({ lines: 1 }, { lines: 5000 })],
    ['pc', play({ lines: 4, perfect: true, special: 'tornado' }), null, true],
    ['pc', play({ lines: 4, perfect: true, hand: true })],
    ['pc3', play({ lines: 1 }, { perfect: 3 }), null, true],
    ['pc3', play({ lines: 1 }, { hperfect: 3 })],
    ['pc10', play({ lines: 1 }, { hperfect: 10 })],
    ['tst10', play({ lines: 1 }, { tst: 10 }), null, true],
    ['tst10', play({ lines: 1 }, { htst: 10 })],
    ['chain20', play({ lines: 1 }, { chain: 25 }), null, true],
    ['chain20', play({ lines: 1 }, { hchain: 20 })],
    ['b2b20', play({ lines: 4 }, { b2b: 20 }), null, true],
    ['b2b20', play({ lines: 4 }, { hb2b: 20 })],
    ['pace33', play({ lines: 1 }, { pace: Array.from({ length: 101 }, (_, i) => [i * 1790, Math.floor(i * 0.355)]) }), null, true],
    ['pace33', play({ lines: 1 }, { pace: Array.from({ length: 101 }, (_, i) => [i * 1810, Math.floor(i * 0.4)]) }), null, true],
    ['pace33', play({ lines: 1 }, { pace: Array.from({ length: 101 }, (_, i) => [i * 1790, Math.floor(i * 0.4)]) })],
    ['pace67', play({ lines: 1 }, { pace: Array.from({ length: 101 }, (_, i) => [i * 890, Math.floor(i * 0.4)]) })],
    ['it_showman', play({ lines: 0 }, { combos: { painted: 1, pocket: 1, keyhole: 1, patchjob: 1, allin: 1 } }), null, true],
    ['it_showman', play({ lines: 0 }, { combos: { patchjob: 1, allin: 1, horizon: 1 } })],
    ['it_sweep', play({ lines: 6, special: 'settle', had: 59 }), null, true],
    ['it_sweep', play({ lines: 6, special: 'settle', had: 60 })],
    ['sb_combos', play({ lines: 0 }), (st) => { for (const c of L.Combos.LIST) st.combos[c.id] = { n: 1 }; }],
    ['clean40', play({ lines: 4, perfect: true }, { pieces: 100, lines: 40, items: { golden: 1 } }), null, true],
    ['clean40', play({ lines: 4, perfect: true }, { pieces: 100, lines: 40 })],
    ['cl_quads4', classic({}, { quadRun: 4 })],
    ['cl_b2b8', classic({}, { b2b: 8 })],
    ['cl_combo15', classic({ r: { lines: 1, combo: 15 } })],
    ['cl_games100', classic({}), (st) => { st.stats.classic.games = 100; }],
    ['cl_tenq', classic({ quads: 10 })],
    ['cl_nohold', classic({ level: 10 })],
    ['cl_pc', classic({ r: { lines: 2, combo: 0, perfect: true } })],
    ['cl_tst', classic({ r: { lines: 3, combo: 0, twist: true } })],
    ['cl_dash', classic({ lines: 40, ms: 89000, quads: 1 })],
    ['cl_twist10', classic({}, { twists: 10 })],
    ['cl_combo10', classic({ r: { lines: 1, combo: 10 } })],
    ['cl_allquads', classic({ lines: 40, quads: 10 })],
    ['cl_dash50', classic({ lines: 40, ms: 49000, quads: 1 })],
    ['cl_nohold20', classic({ level: 20 })],
    ['cl_l25', classic({ level: 25 })],
    ['pz_clean', puzzle({ firstTry: true, hinted: true }), null, true],
    ['pz_clean', puzzle({ firstTry: true })],
    ['pz_daily3', puzzle({}), (st) => { st.history[today] = { dailies: 'MEH' }; }],
    ['pz_spin', puzzle({ mods: ['spin'] })],
    ['pz_fast', puzzle({ firstTry: true, undos: 3, ms: 19000 })],
    ['pz_wild3', puzzle({ firstTry: true, mods: ['fog', 'wrap', 'mono'] })],
    ['pz_first20', puzzle({}), (st) => { st.stats.puzzle.bestFirstRun = 20; }],
    ['pz_hfirst25', puzzle({}), (st) => { st.stats.puzzle.H.firstTry = 25; }],
    ['pz_h100', puzzle({}), (st) => { st.stats.puzzle.H.solved = 100; }],
    ['pz_wildH', puzzle({}), (st) => { for (const m of Object.keys(L.Puzzles.MODS)) st.stats.puzzle.mods[m] = { seen: 1, solved: 1, hard: 1 }; }],
    ['pz_daily30', puzzle({}), (st) => { st.stats.puzzle.bestDailyRun = 30; }],
    ['pz_first100', puzzle({}), (st) => { st.stats.puzzle.bestFirstRun = 100; }],
    ['lu_triathlon', { mode: 'tick' }, (st) => { st.history[today] = { quad: 1, cquad: 1, hard: 1 }; }],
    ['lu_hours10', { mode: 'tick' }, (st) => { st.stats.timeMs.total = 10 * 3600e3; }],
    ['lu_days30', { mode: 'tick' }, (st) => { st.stats.days = 30; }],
    ['lu_100k', { mode: 'tick' }, (st) => { st.stats.lines.earned = 5e4 + 100; st.stats.lines.rewound = 200; }, true],
    ['lu_100k', { mode: 'tick' }, (st) => { st.stats.lines.earned = 5e4; }],
    ['lu_curator', { mode: 'tick' }, (st) => { for (const k of Object.keys(L.COSMETICS)) st.owned[k] = Object.keys(L.COSMETICS[k]); }],
    ['lu_hours100', { mode: 'tick' }, (st) => { st.stats.timeMs.total = 100 * 3600e3; }],
    ['lu_days100', { mode: 'tick' }, (st) => { st.stats.days = 100; }],
    ['lu_1m', { mode: 'tick' }, (st) => { st.stats.lines.earned = 5e5 - 1; }, true],
    ['lu_1m', { mode: 'tick' }, (st) => { st.stats.lines.earned = 5e5; }],
  ];
  // The two Lifetime line counts: 50,000 and 500,000, the same number in the words, the test and the progress.
  for (const [id, n, words] of [['lu_100k', 5e4, '50,000'], ['lu_1m', 5e5, '500,000']]) {
    const a = A.LIST.find((x) => x.id === id), st = fresh();
    assert.deepStrictEqual([a.desc, a.progress(st)[1]], ['Earn ' + words + ' lines.', n]);
  }
  const seen = new Set();
  for (const [id, ev, setup, not] of cases) {
    const st = fresh();
    if (setup) setup(st);
    const got = A.check(st, ev).map((a) => a.id);
    if (not) { assert(!got.includes(id), id + ' needs more than that'); continue; }
    seen.add(id);
    assert(got.includes(id), id + ' earned by its feat (got ' + got.join(',') + ')');
    assert(!A.check(st, ev).some((a) => a.id === id), id + ' only once');
    // Its own feat never earns anything outside its mode's group (except the Lifetime ones that follow along).
    assert(got.every((x) => A.LIST.find((a) => a.id === x).group === A.LIST.find((a) => a.id === id).group), id + ': ' + got.join(','));
  }
  // The perfect-clear opener really is the opener: not a board that had help (blocks it was given, or an item).
  assert(!A.check(fresh(), play({ lines: 4, perfect: true }, { pieces: 1, lines: 4 })).some((a) => a.id === 'pc_open'));
  assert(!A.check(fresh(), play({ lines: 4, perfect: true }, { pieces: 10, lines: 4, items: { rewind: 1 } })).some((a) => a.id === 'pc_open'));
  // Halfway and the whole set count the others.
  const st = fresh(), others = A.LIST.filter((a) => a.id !== 'lu_half' && a.id !== 'lu_all');
  others.slice(0, Math.ceil(others.length / 2) - 1).forEach((a) => { st.achievements[a.id] = 1; });
  assert.deepStrictEqual(A.check(st, { mode: 'tick' }).map((a) => a.id), []);
  st.achievements[others[others.length - 1].id] = 1;
  assert.deepStrictEqual(A.check(st, { mode: 'tick' }).map((a) => a.id), ['lu_half']);
  others.forEach((a) => { st.achievements[a.id] = 1; });
  assert.deepStrictEqual(A.check(st, { mode: 'play', r: { lines: 0 }, g: board() }).map((a) => a.id), ['lu_all']);
  const newIds = cases.filter((c) => !c[3]).map((c) => c[0]).concat(['lu_half', 'lu_all']);
  assert(new Set(newIds).size >= 45, 'at least 45 new ones, each tested');
});
test('achievement stats: quads in a row, set by hand', () => {
  const g = new Game({ w: 10, h: 20, seed: 3 });
  const quad = (special) => {
    for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
    g.replacePiece({ id: 'I', special });
    g.rotate(1); while (g.move(-1));
    return g.drop();
  };
  quad(); quad(); quad();
  assert.strictEqual(g.s.quadRun, 3, 'quads in a row count');
  quad('laser');
  assert.strictEqual(g.s.quadRun, 0, 'a laser\'s four rows are not a quad set by hand');
  quad();
  for (let x = 1; x < 10; x++) g.board.set(x, 0, 8);
  g.replacePiece({ id: 'M1' }); while (g.move(-1));
  assert.strictEqual(g.drop().lines, 1);
  assert.strictEqual(g.s.quadRun, 0, 'a single ends the run');
  assert.strictEqual(new Game({ w: 10, h: 20, seed: 1 }).s.quadRun, 0);
});
test('achievement stats: by hand — items break the hand streaks, an empty board starts afresh', () => {
  const A = L.Achievements;
  const g = new Game({ w: 10, h: 20, seed: 3 });
  // Four rows with the left column open, and an I stood up in it: a quad that empties the board.
  const rows = () => { for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8); };
  const quad = (special, noted) => { rows(); g.replacePiece({ id: 'I', special }); if (noted) g.noteItem(false); g.rotate(1); while (g.move(-1)); return g.drop(); };
  let r = quad(); quad();
  assert.deepStrictEqual([g.s.hb2b, g.s.hquads, g.s.hperfect, g.s.hand], [1, 2, 2, true]);
  // An I from an Order Slip: the board's streak goes on, the hand one does not; the quad is not by hand.
  r = quad(null, true);
  assert(!r.hand && r.perfect && g.s.b2b === 2 && g.s.hb2b === -1 && g.s.hquads === 0 && g.s.hperfect === 2);
  assert(g.s.hand, 'the board it emptied is a fresh start');
  assert(!A.check(L.defaultState(), { mode: 'play', r, g }).some((a) => a.id === 'pc' || a.id === 'quad'), 'neither a hand quad nor a hand spotless clear');
  // Lasers clear plain lines: they feed neither streak streak.
  for (let i = 0; i < 4; i++) { r = quad('laser'); assert(!r.hand && r.plain === 4); }
  assert(g.s.b2b === -1 && g.s.hb2b === -1 && g.s.hchain === 0);
  assert(!A.check(L.defaultState(), { mode: 'play', r, g }).some((a) => /^(b2b|chain|quads|combo)/.test(a.id)));
  quad(); quad();
  assert.deepStrictEqual([g.s.hb2b, g.s.hquads, g.s.hchain], [1, 2, 2 + 1]);
  // Rewind is an item too: taking a mistake back ends the streak (and the stack it leaves is not by hand).
  rows(); for (let x = 1; x < 10; x++) g.board.set(x, 3, 0);
  g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1)); g.drop();
  g.undo(); g.noteItem(true);
  assert(g.s.hb2b === -1 && !g.s.hand);
  // A Settle's spotless clear is not by hand, but the empty board it leaves is a fresh start.
  g.board.cells.fill(0);
  for (let i = 0; i < 20; i++) g.board.set(i % 10, 2 + Math.floor(i / 10) * 3, 8);
  r = g.settle(); g.noteItem(true);
  assert(r.perfect && !r.hand && g.s.hand);
  assert(!A.check(L.defaultState(), { mode: 'play', r, g }).some((a) => a.id === 'pc'));
  // Luck items do not touch the board: Free Play never calls noteItem for them (js/modes.js). An item taken back
  // before its piece is set puts the hand counts back.
  quad(); const keep = g.handState();
  g.noteItem(false);
  assert(g.s.hb2b === -1);
  g.restoreHand(keep);
  assert(g.s.hb2b === 0 && g.s.hand);
});
test('achievement stats: a saved board keeps its hand counts', () => {
  const used = new Game({ w: 10, h: 20, seed: 4 });
  used.s.hb2b = 4; used.s.hand = true;
  const again = new Game({ saved: JSON.parse(JSON.stringify(used.toJSON())) });
  assert.deepStrictEqual([again.s.hand, again.s.hb2b], [true, 4]);
});
test('achievement stats: the pace of hand play, and Lifetime lines without rewinds', () => {
  const g = new Game({ w: 10, h: 20, seed: 5 });
  for (let i = 0; i <= 120; i++) g.notePace({ hand: true }, i * 1000);
  assert.strictEqual(g.s.pace.length, 101);
  assert.deepStrictEqual(L.paceOf(g.s, 100), { ms: 100000, lines: 0 });
  g.notePace({ hand: false }, 200000);
  assert.strictEqual(L.paceOf(g.s, 100), null, 'anything not by hand starts it over');
  const st = L.defaultState();
  Object.assign(st.stats.lines, { earned: 5000, rewound: 300 });
  assert.strictEqual(L.Achievements.earned(st), 4700);
});
test('achievement stats: first-try runs and Daily runs', () => {
  const P = L.defaultState().stats.puzzle, runs = L.Achievements.puzzleRuns;
  for (let i = 0; i < 5; i++) runs(P, true, null);
  runs(P, false, null);
  runs(P, true, null);
  assert.deepStrictEqual([P.firstRun, P.bestFirstRun], [1, 5], 'a retry or a hint ends the run; the best stays');
  runs(P, true, '2026-02-27', '2026-02-27'); runs(P, true, '2026-02-28', '2026-02-28'); runs(P, true, '2026-02-28', '2026-02-28'); runs(P, true, '2026-03-01', '2026-03-02');
  assert.deepStrictEqual([P.dailyRun, P.bestDailyRun, P.runDay], [3, 3, '2026-03-01'], 'across a month end; two Dailies on one date count once; just past midnight still counts');
  runs(P, true, '2026-02-10', '2026-03-02');
  assert.strictEqual(P.dailyRun, 3, 'an older Daily solved late leaves the run alone');
  runs(P, true, '2026-03-03', '2026-03-03');
  assert.deepStrictEqual([P.dailyRun, P.bestDailyRun], [1, 3], 'a missed day starts over');
  // Dailies left unsolved in the history and solved later, in order, do not build a run.
  const Q = L.defaultState().stats.puzzle;
  for (const d of ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04']) runs(Q, true, d, '2026-04-10');
  assert.deepStrictEqual([Q.dailyRun, Q.bestDailyRun, Q.firstRun], [0, 0, 4], 'old Dailies solved late: no run of days (first tries still count)');
});
test('achievement stats: days played', () => {
  const s = new L.Store();
  assert.strictEqual(s.state.stats.days, 0);
  s.day(); s.day();
  assert.strictEqual(s.state.stats.days, 0, 'a day log entry alone is not a day played');
  s.played(); s.played();
  assert.strictEqual(s.state.stats.days, 1, 'a day played counts once');
  assert.strictEqual(L.loadState(JSON.parse(s.serialize())).stats.days, 1, 'and a later load keeps it');
});

console.log('power-ups');
{
  const { CELL, Chain, Combos, Luck, Gifts, Earn } = L;
  // An empty 10×20 board with the given rows (bottom first): . empty, digits colour slots, X garbage, m the single
  // block's colour.
  const CODE = { X: 8, m: 13 };
  const board = (rows, piece) => {
    const g = new Game({ w: 10, h: 20, seed: 3 });
    rows.forEach((row, y) => { for (let x = 0; x < 10; x++) { const c = row[x] || '.'; g.board.set(x, y, c === '.' ? 0 : CODE[c] != null ? CODE[c] : Number(c)); } });
    g.replacePiece({ id: piece || 'O' });
    return g;
  };
  // Puts the piece in play at a spot (its rotation box's origin) and drops it.
  const dropAt = (g, x, y, special, id) => { if (id) g.replacePiece({ id }); if (special) assert(g.setSpecial(special), special); g.piece.x = x; if (y != null) g.piece.y = y; return g.drop(); };
  const inv = (st) => Object.values(st.inventory).reduce((a, b) => a + b, 0);

  test('the multiplier: ×0.05 a link after the first, ×1.5 at eleven, ×2 at twenty-one in Free Play (Classic stops at ×1.5); the chain counts apart', () => {
    const R = Chain.RELAXED, C = Chain.CLASSIC, r2 = (x) => Math.round(x * 100) / 100;
    for (const mode of [undefined, 'classic']) {
      for (let n = 1; n < 100; n++) assert(Chain.mult(n, mode) >= Chain.mult(n - 1, mode), (mode || 'relaxed') + ' never falls: ' + n);
    }
    assert.deepStrictEqual([Chain.mult(0), Chain.mult(1)], [1, 1]);
    assert.strictEqual(Chain.mult(2), r2(1 + R.step));
    assert.strictEqual(Chain.mult(11), r2(1 + 10 * R.step));
    assert.strictEqual(Chain.mult(11), 1.5);
    assert.deepStrictEqual([Chain.mult(21), Chain.mult(99)], [R.cap, R.cap]);
    assert.strictEqual(R.cap, 2);
    assert(Chain.mult(20) < R.cap, 'the cap is reached at twenty-one, not before');
    assert.deepStrictEqual([Chain.mult(11, 'classic'), Chain.mult(99, 'classic')], [C.cap, C.cap]);
    assert(C.cap <= R.cap, 'Classic never multiplies more than Free Play');
    const g = new Game({ w: 10, h: 20, seed: 1 });
    Object.assign(g.s, { b2b: 13, combo: 4 });
    assert.strictEqual(Chain.streak(g), 14);
    assert.strictEqual(Chain.count(g), 18, 'chain = streak + combo');
    assert.strictEqual(Chain.mult(Chain.streak(g)), r2(1 + 13 * R.step), 'the multiplier ignores the combo');
    assert.strictEqual(Chain.fmt(Chain.mult(Chain.streak(g))), '×1.65');
    const q = new Game({ w: 10, h: 20, seed: 2 });
    for (let k = 0; k < 3; k++) {
      for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) q.board.set(x, y, 8);
      q.replacePiece({ id: 'I' }); q.rotate(1); while (q.move(-1));
      q.drop();
    }
    assert.strictEqual(Chain.streak(q), 3);
  });

  test('combos by hand: a one-colour row, a quad from the pocket, a tuck, twin spins', () => {
    const g = board(['mmmmmmmmm.']);
    let r = dropAt(g, 9, 4, null, 'M1');
    assert(Combos.detect(r, g).includes('painted'));
    const x = board(['mmmmmmmm8.']);
    assert(!Combos.detect(dropAt(x, 9, 4, null, 'M1'), x).includes('painted'), 'a mixed row is not');
    const h = board(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], 'I');
    h.holdPiece(); h.holdPiece();
    assert(h.piece.type.id === 'I' && h.piece.fromHold);
    h.rotate(1); while (h.move(1));
    r = h.drop();
    assert(r.lines === 4 && Combos.detect(r, h).includes('pocket'));
    const k = board(['XXXXXXXX..', '.........X']);
    k.replacePiece({ id: 'O' });
    k.piece.x = 8; k.piece.y = 0;
    k.board.set(9, 1, 0); k.board.set(8, 2, 8);
    r = k.lock();
    assert(r.covered && r.lines && Combos.detect(r, k).includes('keyhole'));
    const t = new Game({ w: 10, h: 20, seed: 1 });
    assert(!Combos.detect({ lines: 2, twist: true, b2b: false }, t).includes('twinspin'));
    assert(Combos.detect({ lines: 2, twist: true, b2b: true }, t).includes('twinspin'));
    assert(!Combos.get('bare'), 'every combo says exactly what to do');
  });

  // Every power-up combo, made on a board by doing exactly what it says.
  const quadWell = () => board(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.'], 'I');
  const standUp = (g) => { g.rotate(1); while (g.move(1)); return g.drop(); };
  const FINDS = {
    patchjob: () => { const g = board(['XXXX.XXXXX', 'XXXXXXXXX.']); return [g, dropAt(g, 4, 10, 'patch')]; },
    ghostline: () => {
      const g = board(['XXXXXXXX..', 'XXXXXXXX..', '........XX']);
      g.setSpecial('phase'); g.piece.x = 8 - g.piece.type.rotBounds[0].minX; g.piece.y = 2 - g.piece.type.rotBounds[0].minY;
      return [g, g.drop()];
    },
    tower: () => { const g = quadWell(); g.replacePiece({ id: Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id, tag: 'noodle' }); return [g, standUp(g)]; },
    architect: () => { const g = board(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.']); g.replacePiece({ id: Pieces.customType([[0, 0], [0, 1], [0, 2]]).id, tag: 'blueprint' }); while (g.move(1)); return [g, g.drop()]; },
    tailor: () => { const g = quadWell(); g.bestFit(); return [g, g.drop()]; },
    allin: () => { const g = quadWell(); const r = standUp(g); r.double = Luck.doubleWins(r) ? 'won' : 'lost'; return [g, r]; },
    caught: () => { const g = board(['XXXXXXXXX.']); Object.assign(g.s, { b2b: 4, net: 1 }); return [g, dropAt(g, 9, 5, null, 'M1')]; },
    fullblast: () => { const g = board(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXX.XXXX.', 'XXXX.XXXX.', 'XXXX.XXXX.']); return [g, dropAt(g, 4, 10, 'bomb')]; },
    horizon: () => { const g = board(['XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXX.XXXX.', 'XXXX.XXXX.', 'XXXX.XXXX.', 'XXXX.XXXX.']); return [g, dropAt(g, 4, 12, 'blackhole')]; },
  };
  test('every power-up combo is found by doing exactly what it says', () => {
    const items = Combos.LIST.filter((c) => c.kind === 'item');
    assert.deepStrictEqual(items.filter((c) => !FINDS[c.id]).map((c) => c.id), [], 'a combo without its test');
    for (const c of items) {
      const [g, r] = FINDS[c.id]();
      const found = Combos.detect(r, g);
      assert(found.includes(c.id), c.id + ' not found: ' + found.join() + ' ' + JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['removed', 'cells', 'before'].includes(k)))));
    }
    // Plain play finds none of them; a quad lost on a Double or Nothing is no win.
    const p = board(['XXXXXXXXX.']);
    const found = Combos.detect(dropAt(p, 9, 5, null, 'M1'), p);
    assert(!found.some((id) => Combos.get(id).kind === 'item'), found.join());
    const one = board(['XXXXXXXXX.']), r1 = dropAt(one, 9, 5, null, 'M1');
    assert(!Luck.doubleWins(r1), 'a single loses a Double or Nothing');
    const las = quadWell(); las.setSpecial('laser'); const rl = standUp(las);
    assert(rl.lines === 4 && !Luck.doubleWins(rl), 'a laser\'s four rows are plain: no win');
  });

  test('combos are never for farming: full, half, a quarter, then nothing on one board; boosts only twice; less than the item', () => {
    const cheapest = Math.min(...L.ITEM_ORDER.map((id) => L.ITEMS[id].price));
    for (const c of Combos.LIST) {
      const pays = [0, 1, 2, 3, 4].map((k) => Combos.reward(c, k));
      assert.strictEqual(pays[3].lines + pays[4].lines, 0, c.id);
      assert(pays[1].lines <= Math.ceil(c.lines / 2) && pays[2].lines <= Math.ceil(c.lines / 4), c.id);
      assert(!pays[2].boost, c.id + ' boosts twice at most');
      assert(c.lines <= 6 && (!c.boost || (c.boost.x <= 1.5 && c.boost.clears <= 5)), c.id + ' is modest');
      if (c.kind === 'item') assert(c.lines < cheapest, c.id + ' pays less than the item it takes');
      assert(c.how.length > 12 && !/discover/i.test(c.how), c.id + ' says what to do');
    }
    assert.strictEqual(new Set(Combos.LIST.map((c) => c.id)).size, Combos.LIST.length);
    assert(Combos.LIST.filter((c) => c.kind === 'item').length >= 8);
  });

  test('Luck never profits: Golden at best breaks even, Double or Nothing and Safety Net never do', () => {
    const cap = Chain.RELAXED.cap, bank = L.Library.bank, price = (id) => L.ITEMS[id].price;
    // Golden: five quads on a full streak (the most five clears can pay, a quad being 4 + 1) give back its price at most.
    const best = bank(5 * cap);
    assert(Luck.goldValue(best) <= price('golden'), 'gold on capped quads: ' + Luck.goldValue(best) + ' for ' + price('golden'));
    assert.strictEqual(Luck.goldValue(best), 50);
    assert(Luck.goldValue(2) < price('golden'), 'ordinary clears: well under it');
    // At every width, what gold adds to five Standard clears' worth of quads at that width's cap (Pay.clear, the real thing).
    for (let w = 4; w <= 20; w++) {
      let extra = 0, guard = 0;
      const s = { mult: capAt(w), gold: Luck.GOLD_CLEARS };
      while (s.gold > 0 && guard++ < 100) { const plain = L.Pay.clear({ mult: capAt(w) }, { lines: 4 }, w).pay; extra += L.Pay.clear(s, { lines: 4 }, w).pay - plain; }
      assert(extra <= price('golden') + 1e-9, w + ' wide: gold adds ' + extra);
    }
    // Double or Nothing: won on a capped, golden quad it adds one Standard clear's worth, less than its price, even
    // with an Undo to take back a loss.
    assert(best * Luck.GOLD_X * (Luck.DOUBLE_X - 1) < price('double'), 'double: ' + best * Luck.GOLD_X * (Luck.DOUBLE_X - 1));
    // Safety Net: the most it can keep, at every width (Luck.netBest, on Pay.clear, the real thing): the clear it saves
    // paid at the full streak rather than ×1 (a triple, the most an ordinary clear set by a piece can be), then every
    // quad it takes to climb back to the cap paid at the cap rather than on the climb (each at that width's streak and
    // cap, Pay.mult). Checked here against the sum written out; its price at each width (Luck.netPrice) is over that,
    // by 10 at most, so it never pays for itself but is close.
    const netWorth = (w) => {
      const top = capAt(w);
      let v = L.Pay.clear({ mult: top }, { lines: 3 }, w).pay - L.Pay.clear({ mult: 1 }, { lines: 3 }, w).pay;
      for (let n = 1; multAt(w, n) < top; n++) v += L.Pay.clear({ mult: top }, { lines: 4 }, w).pay - L.Pay.clear({ mult: multAt(w, n) }, { lines: 4 }, w).pay;
      return v;
    };
    for (let w = 4; w <= 20; w++) {
      const best = Luck.netBest(w), p = Luck.netPrice(w);
      assert(Math.abs(best - netWorth(w)) < 1e-9, w + ' wide: netBest ' + best + ' vs ' + netWorth(w));
      assert(p >= best && p - best <= 10 && p >= 10 && p % 5 === 0, 'net ' + w + ' wide keeps ' + best.toFixed(2) + ' for ' + p);
    }
    assert(Math.abs(Luck.netBest(10) - 55.5) < 1e-9, 'net: 10 wide ' + Luck.netBest(10));
    assert.strictEqual(Luck.netPrice(10), 60);
    assert.strictEqual(price('net'), Luck.netPrice(10), 'the listed price is Standard\'s');
    for (let w = 11; w <= 20; w++) assert(Luck.netPrice(w) < Luck.netPrice(10), 'net costs less wider than Standard: ' + w + ' wide ' + Luck.netPrice(w));
    // Bought on a board, it costs that board's price; other power-ups cost their listed price anywhere.
    {
      const st = new L.Store();
      st.state.lines = 1000;
      const g20 = new Game({ w: 20, h: 20, seed: 1 });
      assert.strictEqual(st.priceOf('net', g20), Luck.netPrice(20));
      assert(st.buyItem('net', 1, g20) && st.state.lines === 1000 - Luck.netPrice(20) && st.state.inventory.net === 1, 'net bought 20 wide: ' + st.state.lines);
      assert(st.buyItem('net') && st.state.lines === 1000 - Luck.netPrice(20) - price('net'), 'net bought with no board: ' + st.state.lines);
      const before = st.state.lines;
      assert(st.buyItem('golden', 1, g20) && st.state.lines === before - price('golden'), 'golden is the same price 20 wide');
    }
    // The engine does what the sum assumes: on a 20-wide board a saved clear keeps the streak, and pays at its cap.
    {
      const g = new Game({ w: 20, h: 20, seed: 1 });
      g.s.b2b = 30; g.s.net = 1;
      const r = { lines: 3 };
      g.score(r);
      assert(r.netSaved === 31 && g.s.b2b === 30 && L.Pay.mult(g) === capAt(20) && capAt(20) < cap, JSON.stringify({ r, b2b: g.s.b2b }));
    }
    assert.strictEqual(Luck.DOUBLE_X, 2);
  });

  test('Double or Nothing and the extra line: a quad set by hand, a twist or a mini; a shaped piece\'s quad is neither', () => {
    assert(Luck.doubleWins({ lines: 4 }) && Luck.doubleWins({ lines: 2, twist: true }) && Luck.doubleWins({ lines: 1, twist: true }) && Luck.doubleWins({ lines: 2, mini: true }));
    assert(!Luck.doubleWins({ lines: 3 }) && !Luck.doubleWins({ lines: 4, plain: 4 }));
    // The pieces a Noodle, a Giant and a Blueprint make (r.tag): real quads on the board, with no bonus.
    const noodle = (() => { const g = quadWell(); g.replacePiece({ id: Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id, tag: 'noodle' }); return standUp(g); })();
    const giant = (() => { const g = board(['XXXXXX....', 'XXXXXX....', 'XXXXXX....', 'XXXXXX....'], 'O'); g.replacePiece({ id: Pieces.bigOf('O').id, tag: 'giant' }); while (g.move(1)); return g.drop(); })();
    const blue = (() => { const g = quadWell(); g.replacePiece({ id: Pieces.customType([[0, 0], [0, 1], [0, 2], [0, 3]]).id, tag: 'blueprint' }); while (g.move(1)); return g.drop(); })();
    const hand = standUp(quadWell());
    for (const [name, r, wins] of [['noodle', noodle, false], ['giant', giant, false], ['blueprint', blue, false], ['hand quad', hand, true],
      ['twist', { lines: 1, twist: true }, true], ['mini', { lines: 1, mini: true }, true]]) {
      if (r.type) assert(r.lines >= 4, name + ' clears four: ' + r.lines);
      assert.strictEqual(Luck.doubleWins(r), wins, name + ' and Double or Nothing');
      // Pay.clear agrees: the extra Standard line comes with exactly the clears that win.
      const plain = L.Pay.clear({ mult: 1 }, r, 10).pay, won = L.Pay.clear({ mult: 1, double: true }, r, 10);
      assert.strictEqual(plain, (r.lines || 0) + (wins ? 1 : 0), name + ' pays ' + plain);
      assert.strictEqual(won.double, wins ? 'won' : 'lost', name);
    }
    assert.strictEqual(noodle.tag, 'noodle');
    // What the buyer reads says the same: a quad set by hand, never a shaped piece's, a twist or a mini.
    const desc = L.ITEMS.double.desc;
    assert(/quad set by hand/.test(desc) && /twist/.test(desc) && /\bmini\b/.test(desc), desc);
    for (const id of Luck.SHAPED) assert(desc.includes(L.ITEMS[id].name), 'the description names ' + L.ITEMS[id].name + ': ' + desc);
    // And so does the README's Luck row.
    const readme = require('fs').readFileSync(require('path').join(__dirname, '..', 'README.md'), 'utf8');
    const row = (readme.match(/Double or Nothing \(\d+,[^)]*\)/) || [''])[0];
    assert(/quad set by hand/.test(row) && /twist or a mini/.test(row), 'README: ' + row);
    for (const id of Luck.SHAPED) assert(row.includes(L.ITEMS[id].name), 'README names ' + L.ITEMS[id].name + ': ' + row);
  });

  test('every power-up has a type, a price, a rarity and an icon that is not an emoji; the engine knows every Tool', () => {
    const emoji = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;
    for (const id of L.ITEM_ORDER) {
      const it = L.ITEMS[id];
      assert(L.ITEM_GROUPS.some((g) => g.id === it.group) && it.price > 0 && Gifts.RARITY[it.rarity] && it.icon && it.desc && it.name, id);
      assert(![...it.icon].some((ch) => emoji.test(ch)), id + ' icon');
      // Double or Nothing names the pieces whose quads lose it, so it may run a little longer.
      assert(it.desc.length <= (id === 'double' ? 110 : 90), id + ': a short tooltip');
    }
    assert(L.ITEM_ORDER.length >= 16 && L.ITEM_ORDER.length <= 24, L.ITEM_ORDER.length + ' power-ups');
    assert.strictEqual(new Set(L.ITEM_ORDER.map((id) => L.ITEMS[id].icon)).size, L.ITEM_ORDER.length, 'every icon its own');
    assert(L.ITEM_GROUPS.length >= 4 && L.ITEM_GROUPS.length <= 6);
    for (const sp of ['patch', 'phase', 'drill', 'bomb', 'laser', 'blackhole']) {
      assert(L.ITEMS[sp] && L.ITEMS[sp].group === 'tool', sp);
      const g = new Game({ w: 10, h: 20, seed: 1 });
      assert(g.setSpecial(sp), sp);
      assert.strictEqual(g.piece.special, sp);
    }
    const rare = L.ITEM_ORDER.filter((id) => L.ITEMS[id].rarity === 'rare'), common = L.ITEM_ORDER.filter((id) => L.ITEMS[id].rarity === 'common');
    assert(rare.length >= 4 && common.length >= 5);
    assert(Math.max(...common.map((id) => L.ITEMS[id].price)) <= Math.min(...rare.map((id) => L.ITEMS[id].price)), 'common ones cost no more than rare ones');
    // Price bands by rarity, Undo aside (it is 5 everywhere): every common below every uncommon, below every rare.
    const band = (r) => L.ITEM_ORDER.filter((id) => id !== 'rewind' && L.ITEMS[id].rarity === r).map((id) => L.ITEMS[id].price);
    assert(Math.max(...band('common')) < Math.min(...band('uncommon')), 'common ' + Math.max(...band('common')) + ' < uncommon ' + Math.min(...band('uncommon')));
    assert(Math.max(...band('uncommon')) < Math.min(...band('rare')), 'uncommon ' + Math.max(...band('uncommon')) + ' < rare ' + Math.min(...band('rare')));
    assert.deepStrictEqual([L.ITEMS.rewind.price, L.ITEMS.rewind.pack, L.packOf('rewind')], [5, 5, 5], 'Undo: 5, and free ones come as five');
    assert.strictEqual(L.ITEM_ORDER.reduce((n, id) => n + L.ITEMS[id].price, 0), 975); // the Safety Net at its Standard price, 60
  });

  test('the daily gift: three different entries (power-ups and a free hint), common ones far more often', () => {
    for (const id of L.ITEM_ORDER) assert(Gifts.weight(id) > 0, id);
    // The gift's pool: every power-up, then the free hint (uncommon); what play earns is the power-ups alone.
    assert.deepStrictEqual(Gifts.pool(), L.ITEM_ORDER.concat(['free-hint']));
    assert.strictEqual(Gifts.weight('free-hint'), Gifts.RARITY.uncommon);
    assert.strictEqual(L.FREEBIES['free-hint'].key, 'hint');
    // Puzzle pay is "pay" wherever a player reads it (the Pays line, the hint question, the solved card, the gift).
    assert(/halves the pay\./.test(L.FREEBIES['free-hint'].desc), L.FREEBIES['free-hint'].desc);
    for (const it of Object.values(L.FREEBIES).concat(Object.values(L.ITEMS))) assert(!/reward/i.test(it.desc), it.name + ': ' + it.desc);
    {
      const rg = new RNG(11), M = 30000, gpool = Gifts.pool(), gtot = gpool.reduce((a, id) => a + Gifts.weight(id), 0);
      let hints = 0, firstHint = 0, earnedHint = 0;
      for (let i = 0; i < M; i++) {
        const g = Gifts.draw(() => rg.next(), 3, gpool);
        assert(g.length === 3 && new Set(g).size === 3 && g.every((id) => gpool.includes(id)), g.join());
        if (g.includes('free-hint')) hints++;
        if (g[0] === 'free-hint') firstHint++;
        if (Gifts.draw(() => rg.next(), 1)[0] === 'free-hint') earnedHint++;
      }
      const p = Gifts.weight('free-hint') / gtot;
      assert(Math.abs(firstHint / M - p) < 4 * Math.sqrt(p * (1 - p) / M), 'first pick ' + (firstHint / M).toFixed(4) + ' vs ' + p.toFixed(4));
      assert(hints / M > 2 * p && hints / M < 3.5 * p, 'in about one gift in ' + Math.round(M / hints) + ' (p ' + p.toFixed(4) + ')');
      assert.strictEqual(earnedHint, 0, 'play never earns a free hint');
      // Some claim of a save gives it, the same on every asking.
      const n = [...Array(200).keys()].find((k) => Gifts.forClaim(77, k).includes('free-hint'));
      assert(n != null && Gifts.forClaim(77, n).includes('free-hint') && new Set(Gifts.forClaim(77, n)).size === 3);
      assert.deepStrictEqual(Gifts.forClaim(77, n), Gifts.forClaim(77, n));
    }
    const rng = new RNG(9), N = 60000;
    let common = 0, rare = 0;
    for (let i = 0; i < N; i++) {
      const g = Gifts.draw(() => rng.next());
      assert(g.length === 3 && new Set(g).size === 3);
      for (const id of g) { if (L.ITEMS[id].rarity === 'common') common++; if (L.ITEMS[id].rarity === 'rare') rare++; }
    }
    assert(common / (3 * N) > 0.5 && rare / (3 * N) < 0.12, 'common ' + (common / (3 * N)).toFixed(3) + ', rare ' + (rare / (3 * N)).toFixed(3));
    // The first pick of a draw is exactly weighted: its frequency matches weight / total.
    const tot = L.ITEM_ORDER.reduce((a, id) => a + Gifts.weight(id), 0), first = {};
    const r2 = new RNG(10);
    for (let i = 0; i < N; i++) { const id = Gifts.draw(() => r2.next())[0]; first[id] = (first[id] || 0) + 1; }
    for (const id of L.ITEM_ORDER) { const p = Gifts.weight(id) / tot, got = (first[id] || 0) / N; assert(Math.abs(got - p) < 4 * Math.sqrt(p * (1 - p) / N) + 1e-9, id + ' ' + got.toFixed(4) + ' vs ' + p.toFixed(4)); }
    // One save's nth gift is always the same; the next one (or another save) is another draw.
    assert.deepStrictEqual(Gifts.forClaim(123, 4), Gifts.forClaim(123, 4));
    const draws = new Set(); for (let n = 0; n < 20; n++) draws.add(Gifts.forClaim(123, n).join());
    assert(draws.size >= 15);
  });

  test('the daily gift opens 24 hours after the last one (not by the date), and not again by reloading or turning the clock back', () => {
    const H = 3600e3, s = new L.Store();
    s.state = L.defaultState();
    const t0 = new Date(2026, 8, 27, 23, 30).getTime();
    assert(Gifts.ready(s.state, t0) && Gifts.left(s.state, t0) === 0, 'the first one is waiting');
    const inv0 = inv(s.state), give = (ids) => ids.reduce((a, id) => a + (L.FREEBIES[id] ? 0 : L.packOf(id)), 0);
    const got = s.openGift(t0);
    assert(got && got.length === 3 && new Set(got).size === 3 && inv(s.state) === inv0 + give(got), JSON.stringify(got));
    assert.strictEqual(s.openGift(t0 + 1 * H), null, 'past midnight is not enough');
    assert.strictEqual(s.openGift(t0 + 24 * H - 60e3), null, 'a minute short');
    assert.strictEqual(Gifts.left(s.state, t0 + 20 * H), 4 * H, 'the tooltip counts down from the claim');
    // Reloaded (saved and loaded): the same claim time, no new draw.
    const again = new L.Store();
    again.state = L.loadState(JSON.parse(s.serialize()));
    assert.strictEqual(again.openGift(t0 + 2 * H), null);
    assert.strictEqual(again.state.gift.at, t0);
    // The same draw however long it waited: a copy of the save before opening gets the same three.
    const twin = new L.Store();
    twin.state = L.loadState({ created: s.state.created });
    assert.deepStrictEqual(twin.openGift(t0 + 5 * H), got);
    // 24 hours on: a new one. The clock turned back, even to long before: none, until 24 hours after the claim.
    const t1 = t0 + 24 * H;
    assert(again.openGift(t1));
    assert.strictEqual(again.openGift(t0 - 72 * H), null, 'clock turned back');
    assert.strictEqual(again.openGift(t1 + 23 * H), null);
    assert(Gifts.left(again.state, t0 - 72 * H) > 24 * H, 'back in time, the wait is longer, never shorter');
    assert.strictEqual(again.state.gift.n, 2);
    // A clock pushed forward to claim early leaves the claim booked in the future: the next one waits for it.
    const fwd = new L.Store();
    fwd.state = L.defaultState();
    assert(fwd.openGift(t0 + 1000 * H));
    assert.strictEqual(fwd.openGift(t0 + 1 * H), null);
  });

  test('the gift gives an Undo as a pack of five and a free hint into the freebies; the log keeps the ids', () => {
    const at = (want) => { for (let c = 1; c < 500; c++) if (Gifts.forClaim(c, 0).includes(want)) return c; return null; };
    const cu = at('rewind'), ch = at('free-hint');
    assert(cu != null && ch != null);
    const a = new L.Store(); a.state = L.loadState({ created: cu });
    const ids = a.openGift(1e12);
    assert.strictEqual(a.state.inventory.rewind, 5, 'five Undos');
    assert.strictEqual(a.state.stats.items.got.rewind, 5);
    assert.deepStrictEqual(a.state.gift.log[0].ids, ids);
    const b = new L.Store(); b.state = L.loadState({ created: ch });
    assert.strictEqual(b.state.freebies.hint, 0, 'a fresh save holds no free hint');
    const idsB = b.openGift(1e12);
    assert.strictEqual(b.state.freebies.hint, 1, 'one free hint');
    assert.strictEqual(b.state.stats.items.got['free-hint'], 1);
    assert(!('free-hint' in b.state.inventory), 'never in the item bar');
    assert.strictEqual(inv(b.state), idsB.filter((id) => id !== 'free-hint').reduce((n, id) => n + L.packOf(id), 0));
    assert(b.useFreebie('hint') && !b.useFreebie('hint') && b.state.freebies.hint === 0 && b.state.stats.items.used['free-hint'] === 1);
  });

  test('Undo: one item for Relaxed and Puzzles, 5 lines, common, five to every free grant and one to a purchase', () => {
    const U = L.ITEMS.rewind;
    assert(U.name === 'Undo' && U.price === 5 && U.pack === 5 && U.rarity === 'common', JSON.stringify(U));
    assert.strictEqual(L.packOf('rewind'), 5);
    assert.strictEqual(L.packOf('bomb'), 1);
    assert.strictEqual(L.itemCount('rewind', 5), '5 Undos');
    assert.strictEqual(L.itemCount('rewind', 1), 'Undo');
    const s = new L.Store();
    assert.strictEqual(s.grant('rewind'), 5, 'a free one (gift, play) is a pack');
    assert.strictEqual(s.grantItem('rewind'), 5, 'and grantItem gives the pack by default');
    assert.strictEqual(s.state.inventory.rewind, 10);
    assert.strictEqual(s.grant('bomb'), 1);
    s.state.lines = 12;
    assert(s.buyItem('rewind') && s.state.inventory.rewind === 11 && s.state.lines === 7 && s.state.stats.items.bought.rewind === 1, 'bought one at a time');
    // Puzzles' way: use one held, else buy one and use it at once; short of lines, nothing changes.
    const p = new L.Store();
    p.state.lines = 9; p.state.inventory.rewind = 1;
    assert.strictEqual(p.useOrBuy('rewind'), 'held');
    assert(p.state.inventory.rewind === 0 && p.state.lines === 9 && p.state.stats.items.used.rewind === 1);
    assert.strictEqual(p.useOrBuy('rewind'), 'bought');
    assert(p.state.inventory.rewind === 0 && p.state.lines === 4 && p.state.stats.items.used.rewind === 2 && p.state.stats.items.bought.rewind === 1);
    const snap = JSON.stringify(p.state);
    assert.strictEqual(p.useOrBuy('rewind'), false);
    assert.strictEqual(JSON.stringify(p.state), snap, 'refused: nothing changes');
    // Every change to the counts is announced, so both tabs redraw them.
    let heard = 0; p.on('items', () => heard++);
    p.state.lines = 5; p.useOrBuy('rewind'); p.grant('free-hint'); p.useFreebie('hint');
    assert(heard >= 3, heard + ' announcements');
  });

  test('Undo is 5 everywhere: one price, and every way of buying one reads it', () => {
    assert.strictEqual(L.ITEMS.rewind.price, 5);
    // Both ways the store sells one (the Relaxed tray's Buy & use; the puzzle and Board full buttons) take exactly 5.
    for (const lines of [5, 6, 50, 1234]) {
      const a = new L.Store(); a.state.lines = lines;
      assert(a.buyItem('rewind') && a.state.lines === lines - 5, 'buyItem at ' + lines);
      const b = new L.Store(); b.state.lines = lines;
      assert(b.useOrBuy('rewind') === 'bought' && b.state.lines === lines - 5, 'useOrBuy at ' + lines);
    }
    // The game prices an Undo only by ITEMS.rewind.price: no number of its own in the shared button, the Board full
    // card's undo or the puzzle undo, and no other price (a hint's, by difficulty) in them.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Game', 'js', 'modes.js'), 'utf8');
    const body = (start, end) => { const i = src.indexOf(start); assert(i >= 0, start); const j = src.indexOf(end, i); assert(j > i, start); return src.slice(i, j); };
    for (const [start, end] of [['function undoButton(', '\n  }\n'], ['    topoutUndo() {', '\n    }\n'], ['    undo() {', '\n    }\n']]) {
      const b = body(start, end);
      assert(/ITEMS\.rewind\b/.test(b) && /\bit\.price\b/.test(b), start + ' reads ITEMS.rewind.price');
      assert(!/DIFF_COST|\bcost\b|price\s*[:=]|\bspend\(|\blines\s*(?:[-+]=?|[<>]=?)\s*\d/.test(b), start + ' has no price of its own');
    }
    assert(/undoBtn\(attrs, label\) \{\s*return undoButton\(/.test(src), 'the puzzle buttons are the shared Undo button');
    assert(/undoButton\(this\.app\.store, \{ class: 'btn', id: 'topout-undo', onclick: \(\) => this\.topoutUndo\(\) \}/.test(src), 'so is the Board full card\'s');
  });

  test('power-ups earned in play: one per two hundred lines on a board, never twice for a rewound clear, never backwards', () => {
    const N = Earn.EVERY, e = { board: null, paid: 0 };
    assert.strictEqual(N, 200);
    assert.strictEqual(Earn.lines(e, 'A', N * 0.6, N * 0.58), 0);
    assert.strictEqual(Earn.lines(e, 'A', N + 1, N - 3), 1, 'the two hundredth line');
    assert.strictEqual(Earn.lines(e, 'A', N - 3, N - 1), 0, 'rewound');
    assert.strictEqual(Earn.lines(e, 'A', N + 1, N - 1), 0, 'and cleared again: already paid');
    assert.strictEqual(Earn.lines(e, 'A', 2 * N, 2 * N - 1), 1);
    assert.strictEqual(Earn.lines(e, 'B', 14.5 * N, 14.5 * N - 1), 0, 'an old board is not paid backwards');
    assert.strictEqual(Earn.lines(e, 'B', 15 * N, 15 * N - 2), 1);
    assert.strictEqual(Earn.lines(e, 'C', 4, 0), 0, 'a new board starts from nothing');
  });

  test('the shop never sells power-ups; the item bar does, for lines', () => {
    const s = new L.Store();
    s.state.lines = 50;
    assert(s.buyItem('reroll'));
    assert.strictEqual(s.state.lines, 35);
    assert.strictEqual(s.state.stats.items.bought.reroll, 1);
    assert(!s.buyItem('blueprint'), 'not enough lines');
    s.grantItem('bomb', 2);
    assert(s.state.inventory.bomb === 2 && s.state.stats.items.got.bomb === 2 && s.state.lines === 35, 'a gift costs nothing');
    assert(s.useItem('reroll') && !s.useItem('reroll'));
  });
}

console.log('economy');
{
  const { Chain, Combos, Gifts } = L;
  const DS = ['E', 'M', 'H'];
  test('puzzle pay: less each try that sets a piece, never under its difficulty\'s floor; Easy under Medium under Hard', () => {
    const D = Puzzles.DIFFS, P = Puzzles.PAY;
    for (const d of DS) {
      const first = Puzzles.pay(d, { try: 1 }).pay;
      let prev = Infinity;
      for (let t = 1; t <= 12; t++) {
        const r = Puzzles.pay(d, { try: t });
        assert.strictEqual(r.byTries, Math.max(D[d].min, Math.round(D[d].reward * Math.pow(P.DECAY, t - 1))), d + ' try ' + t);
        assert(r.pay <= prev && r.pay >= D[d].min && first >= r.pay, d + ' try ' + t + ': ' + r.pay);
        for (const o of [{ undos: 1 }, { daily: true }, { undos: 2, daily: true }]) {
          const a = Puzzles.pay(d, Object.assign({ try: t }, o)), b = Puzzles.pay(d, Object.assign({ try: t + 1 }, o));
          assert(b.pay <= a.pay && a.pay >= D[d].min, d + ' ' + JSON.stringify(o) + ' try ' + t);
        }
        prev = r.pay;
      }
      assert.strictEqual(Puzzles.pay(d, { try: 0 }).try, 1, 'a solve is at least the first try');
    }
    assert(D.E.min < D.M.min && D.M.min < D.H.min, 'floors');
    assert(D.E.reward < D.M.reward && D.M.reward < D.H.reward, 'first-try pay');
    // The ladders (clean, then tries 1–7), and the floor is reached.
    const ladder = (d) => [Puzzles.pay(d, { try: 1 }).pay].concat([1, 2, 3, 4, 5, 6, 7].map((t) => Puzzles.pay(d, { try: t, undos: 1 }).pay));
    assert.deepStrictEqual(DS.map(ladder), [[5, 3, 2, 2, 2, 1, 1, 1], [11, 7, 6, 4, 4, 3, 3, 3], [27, 18, 14, 12, 9, 7, 6, 6]]);
    assert(DS.every((d) => Puzzles.pay(d, { try: 12 }).floor && !Puzzles.pay(d, { try: 1 }).floor));
    // Big Minos pays by the same rule: what solving pays depends on the difficulty and the tries alone.
    for (const d of DS) {
      const p = bigPuzzles(d, 1)[0];
      assert(p.mods.includes('big'));
      assert.deepStrictEqual(Puzzles.pay(p.diff, { try: 3 }), Puzzles.pay(d, { try: 3 }));
    }
  });
  test('puzzle pay: a clean first try pays ×1.5; the Daily doubles after it; a hint halves last, rounded up', () => {
    const D = Puzzles.DIFFS, P = Puzzles.PAY;
    for (const d of DS) {
      const R = D[d].reward;
      assert.strictEqual(Puzzles.pay(d, { try: 1 }).pay, Math.round(R * P.CLEAN));
      for (const o of [{ try: 1, undos: 1 }, { try: 1, hint: true }, { try: 2 }]) assert(!Puzzles.pay(d, o).clean, d + ' ' + JSON.stringify(o) + ' is not clean');
      assert.strictEqual(Puzzles.pay(d, { try: 1, undos: 1 }).pay, R);
      assert.strictEqual(Puzzles.pay(d, { try: 1, daily: true }).pay, Math.round(R * P.CLEAN) * P.DAILY);
      assert.strictEqual(Puzzles.pay(d, { try: 1, hint: true, daily: true }).pay, Math.ceil((R * P.DAILY) / 2));
      assert.strictEqual(Puzzles.pay(d, { try: 3, hint: true }).pay, Math.ceil(Puzzles.pay(d, { try: 3 }).byTries / 2));
    }
    assert.deepStrictEqual(DS.map((d) => Puzzles.pay(d, { try: 1 }).pay), [5, 11, 27]);
    assert.deepStrictEqual(DS.map((d) => Puzzles.pay(d, { try: 1, daily: true }).pay), [10, 22, 54], 'three clean Dailies: 86 a day');
    const r = Puzzles.pay('H', { try: 2, hint: true, daily: true });
    assert.deepStrictEqual([r.base, r.byTries, r.afterClean, r.afterDaily, r.pay], [18, 14, 14, 28, 14], 'every step kept');
  });
  test('the Daily\'s ×2: once a date for each difficulty, whichever turn setting it was solved with', () => {
    const ps = {}, key = '2026-09-29';
    // The clockwise and the both-ways Daily of a date are different puzzles (two seeds), but one Daily.
    assert.notStrictEqual(Puzzles.dailySeed('E', key, false), Puzzles.dailySeed('E', key, true));
    assert(Puzzles.dailyDue(ps, key, 'E') && !Puzzles.dailyDue(ps, null, 'E'));
    Puzzles.noteDaily(ps, key, 'E');
    assert(!Puzzles.dailyDue(ps, key, 'E') && Puzzles.dailyDue(ps, key, 'M') && Puzzles.dailyDue(ps, '2026-09-30', 'E'));
    Puzzles.noteDaily(ps, key, 'H'); Puzzles.noteDaily(ps, key, 'E');
    assert.strictEqual(ps.dailyPaid[key], 'EH');
    // Bounded: the oldest dates go first.
    for (let i = 0; i < 500; i++) Puzzles.noteDaily(ps, '2020-01-01+' + String(i).padStart(3, '0'), 'M');
    assert(Object.keys(ps.dailyPaid).length <= 400 && ps.dailyPaid['2020-01-01+499'] === 'M');
    // PuzzleMode asks dailyDue for every Daily pay (the Pays line, the hint question, the solve) and notes the solve's.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Game', 'js', 'modes.js'), 'utf8');
    assert(!/daily: !!this\.meta\.daily/.test(src), 'no Daily pay from meta.daily alone');
    assert(/if \(paid\.daily\) Puzzles\.noteDaily\(this\.ps, this\.meta\.daily, p\.diff\)/.test(src));
  });
  test('puzzle hints: bought, one never pays for itself (a Daily aside); bought early and used late, it loses', () => {
    for (const d of DS) {
      assert.deepStrictEqual([Puzzles.hintCost(d, 1), Puzzles.hintCost(d, 30)], { E: [2, 1], M: [4, 2], H: [9, 3] }[d]);
      for (let t = 1; t <= 12; t++) {
        const cost = Puzzles.hintCost(d, t);
        for (const undos of [0, 1]) {
          assert.strictEqual(Puzzles.pay(d, { try: t, undos, hint: true }).pay - cost, 0, d + ' try ' + t + ': a hinted solve nets nothing');
          assert(Puzzles.pay(d, { try: t, undos, hint: true, daily: true }).pay - cost >= 0, d + ' Daily');
          for (let t2 = t + 1; t2 <= 14; t2++) assert(Puzzles.pay(d, { try: t2, undos, hint: true }).pay - cost <= 0, d + ' hint at ' + t + ', solved at ' + t2);
        }
        assert(cost <= Puzzles.hintCost(d, t - 1 || 1), 'a hint never costs more later');
      }
    }
  });
  test('the daily gift: about one in four holds an Undo pack, one in ten a free hint', () => {
    let undo = 0, hint = 0;
    const N = 40000;
    for (let i = 0; i < N; i++) {
      const g = Gifts.forClaim('econ' + (i % 2000), Math.floor(i / 2000));
      if (g.includes('rewind')) undo++;
      if (g.includes('free-hint')) hint++;
    }
    assert(undo / N >= 0.23 && undo / N <= 0.27, 'Undo in ' + (undo / N).toFixed(4));
    assert(hint / N >= 0.08 && hint / N <= 0.12, 'free hint in ' + (hint / N).toFixed(4));
  });
  test('combos: each first pay is less than any power-up but Undo (5, everywhere); the taper never starts over', () => {
    const cheapest = Math.min(...L.ITEM_ORDER.filter((id) => id !== 'rewind').map((id) => L.ITEMS[id].price));
    for (const c of Combos.LIST) assert(Combos.reward(c, 0).lines < cheapest, c.id + ' pays ' + Combos.reward(c, 0).lines);
    assert(!/B\.list\.length\) B\.taper = \{\}/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'Game', 'js', 'library.js'), 'utf8')), 'nothing resets the taper');
  });
  test('cosmetics: each kind rises in catalogue order, from 450 or less to 5,000 at most; 39,500 in all', () => {
    let total = 0;
    for (const [kind, cat] of Object.entries(L.COSMETICS)) {
      const prices = Object.values(cat).filter((c) => c.price > 0 && !c.reward).map((c) => c.price);
      for (let i = 1; i < prices.length; i++) assert(prices[i] > prices[i - 1], kind + ': ' + prices);
      assert(prices[0] <= 450 && prices[prices.length - 1] <= 5000, kind + ': ' + prices);
      total += prices.reduce((a, b) => a + b, 0);
    }
    assert.strictEqual(total, 39500);
    for (const cat of Object.values(L.COSMETICS)) for (const c of Object.values(cat)) if (c.reward) assert.strictEqual(c.price, 0, c.name + ' is a reward');
  });
  test('the Factory\'s reward looks are shelved with it: out of the shop and its counts, unless a save owns one', () => {
    const rewards = Object.entries(L.COSMETICS).flatMap(([k, cat]) => Object.keys(cat).filter((id) => cat[id].reward).map((id) => [k, id]));
    assert.strictEqual(rewards.length, 5);
    for (const [k, id] of rewards) { assert(!L.inShop(k, id, []), k + ':' + id); assert(L.inShop(k, id, [id]), k + ':' + id + ' owned'); }
    for (const [k, cat] of Object.entries(L.COSMETICS)) for (const id of Object.keys(cat)) if (!cat[id].reward) assert(L.inShop(k, id, []), k + ':' + id);
  });
  test('no dead code: nothing reads a Jackpot or lines.luck any more', () => {
    const dir = require('path').join(__dirname, '..', 'Game', 'js');
    for (const f of require('fs').readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const src = require('fs').readFileSync(require('path').join(dir, f), 'utf8');
      assert(!/lines\.luck|Jackpot/.test(src), f);
    }
  });
  void Chain;
}

console.log('save');
test('no emoji anywhere in the app', () => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'Game');
  const files = fs.readdirSync(path.join(dir, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, 'js', f))
    .concat([path.join(dir, 'index.html'), path.join(dir, '..', 'README.md')], fs.readdirSync(path.join(dir, 'css')).map((f) => path.join(dir, 'css', f)));
  const found = [];
  for (const f of files) for (const ch of fs.readFileSync(f, 'utf8')) if (/\p{Extended_Pictographic}|\p{Emoji_Presentation}/u.test(ch)) found.push(path.basename(f) + ' ' + ch);
  assert.deepStrictEqual(found, []);
});
test('the line glyph: one character (L.LINE), its own font everywhere', () => {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'Game');
  assert.strictEqual(L.LINE, '⦵');
  assert(!/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}/u.test(L.LINE), 'never an emoji, not even with a variation selector');
  // The font: first in both CSS font lists and both canvas fonts, holding just the glyph.
  const css = fs.readFileSync(path.join(dir, 'css', 'lull.css'), 'utf8');
  const face = css.match(/@font-face \{ font-family: "Lull Line";[^}]*unicode-range: ([^;]+);[^}]*base64,([A-Za-z0-9+/=]+)\)/);
  assert(face, 'the @font-face is in lull.css');
  assert.strictEqual(face[1].trim(), 'U+29B5');
  assert(/--font: "Lull Line", /.test(css) && /--mono-font: "Lull Line", /.test(css));
  assert(/const FONT = '"Lull Line", /.test(fs.readFileSync(path.join(dir, 'js', 'render.js'), 'utf8')));
  // Its cmap (format 4) maps the code point to the glyph.
  const font = Buffer.from(face[2], 'base64');
  assert.strictEqual(font.toString('latin1', 0, 4), 'OTTO');
  const nt = font.readUInt16BE(4);
  let cmap = -1;
  for (let i = 0; i < nt; i++) if (font.toString('latin1', 12 + i * 16, 16 + i * 16) === 'cmap') cmap = font.readUInt32BE(12 + i * 16 + 8);
  assert(cmap > 0);
  const glyphFor = (cp) => {
    for (let i = 0, n = font.readUInt16BE(cmap + 2); i < n; i++) {
      const sub = cmap + font.readUInt32BE(cmap + 4 + i * 8 + 4);
      if (font.readUInt16BE(sub) !== 4) continue;
      const segs = font.readUInt16BE(sub + 6) / 2, ends = sub + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, offs = deltas + segs * 2;
      for (let k = 0; k < segs; k++) {
        const end = font.readUInt16BE(ends + k * 2), start = font.readUInt16BE(starts + k * 2);
        if (cp < start || cp > end) continue;
        const ro = font.readUInt16BE(offs + k * 2), d = font.readInt16BE(deltas + k * 2);
        if (!ro) return (cp + d) & 0xffff;
        const g = font.readUInt16BE(offs + k * 2 + ro + (cp - start) * 2);
        return g ? (g + d) & 0xffff : 0;
      }
    }
    return 0;
  };
  assert(glyphFor(0x29B5) > 0, 'U+29B5 has a glyph');
});
test('a loaded save gains missing fields and keeps its own', () => {
  const merged = L.loadState({ lines: 55, settings: { sound: true }, owned: { skin: ['flat', 'gem'] } });
  assert.strictEqual(merged.lines, 55);
  assert.strictEqual(merged.settings.sound, true);
  assert.strictEqual(merged.settings.das, 230);
  assert.deepStrictEqual(merged.owned.skin, ['flat', 'gem']);
  assert(!('factory' in merged), 'no factory for a new save: it is shelved');
  // A save from before the Factory was shelved loads, its factory kept as it was.
  const old = { v: 9, droppers: 3, asm: [{ n: 4 }], stats: { made: 5000, delivered: 12 } };
  const kept = L.loadState(JSON.parse(JSON.stringify({ lines: 9, factory: old, achievements: { fac_first: 1 }, stats: { timeMs: { factory: 6e4 }, lines: { factory: 40 } } })));
  assert.deepStrictEqual([kept.lines, kept.factory, kept.achievements.fac_first, kept.stats.timeMs.factory, kept.stats.lines.factory], [9, old, 1, 6e4, 40]);
  assert.deepStrictEqual(L.Achievements.check(kept, { mode: 'any' }), [], 'an old achievement id is left alone');
});
test('mute: off by default, kept by a save', () => {
  assert.strictEqual(L.defaultState().settings.muted, false);
  const st = L.loadState({ settings: { sound: true, volume: 0.5 } });
  assert.strictEqual(st.settings.muted, false);
  assert.strictEqual(st.settings.volume, 0.5);
  assert.strictEqual(L.loadState({ settings: { muted: true } }).settings.muted, true);
});
test('mute ramps a gain after everything and leaves the levels alone', () => {
  const S = L.Sound || load(['audio.js']).Sound, saved = { ctx: S.ctx, muteGain: S.muteGain, muted: S.muted, enabled: S.enabled, volume: S.volume };
  const calls = [];
  const param = { value: 1, cancelScheduledValues: (t) => calls.push(['cancel', t]), setValueAtTime: (v, t) => calls.push(['set', v, t]), linearRampToValueAtTime: (v, t) => calls.push(['ramp', v, t]) };
  try {
    S.ctx = null; S.muteGain = null;
    S.setMuted(true); // no audio yet: just remembered, for when there is
    assert.strictEqual(S.muted, true);
    S.ctx = { currentTime: 2, state: 'running' }; S.muteGain = { gain: param };
    S.setMuted(true);
    assert.deepStrictEqual(calls.pop(), ['ramp', 0, 2.05]);
    S.setMuted(false);
    assert.deepStrictEqual(calls.pop(), ['ramp', 1, 2.05]);
    // Not yet running (time stands still): set outright, so it is already silent the moment it wakes.
    S.ctx.state = 'suspended';
    S.setMuted(true);
    assert.strictEqual(param.value, 0);
    assert.notStrictEqual(calls[calls.length - 1][0], 'ramp');
    assert.strictEqual(S.enabled, saved.enabled);
    assert.strictEqual(S.volume, saved.volume);
  } finally { Object.assign(S, saved); }
});
test('native Reset: the fresh save goes to the panel as one reset message, and the old page saves nothing after it', () => {
  const posts = [];
  const hadWebkit = 'webkit' in globalThis, oldWebkit = globalThis.webkit;
  globalThis.webkit = { messageHandlers: { lull: { postMessage: (m) => posts.push(m) } } };
  try {
    assert(L.native.available);
    const s = new L.Store();
    s.state.lines = 900; s.state.achievements.quad = 1; s.state.settings.das = 199;
    s.state.boards.presets.push({ id: 'p1', name: 'Kept' });
    s.save();
    assert.deepStrictEqual(posts.map((m) => m.type), ['save']);
    s.reset();
    assert.deepStrictEqual(posts.map((m) => m.type), ['save', 'reset']);
    const sent = JSON.parse(posts[1].data);
    assert.deepStrictEqual([sent.lines, Object.keys(sent.achievements).length, sent.boards.presets.length, sent.settings.das], [0, 0, 0, 199]);
    // The page on its way out (a pending autosave, a flush, pagehide) writes nothing over it.
    s.state.lines = 5; s.touch(); s.save(); s.save();
    assert.strictEqual(posts.length, 2);
    // The panel does the reload: the page must not reload itself onto its old embedded save.
    let reloaded = false;
    const hadLocation = 'location' in globalThis, oldLocation = globalThis.location;
    globalThis.location = { reload: () => { reloaded = true; } };
    try { s.restart(); } finally { if (hadLocation) globalThis.location = oldLocation; else delete globalThis.location; }
    assert.strictEqual(reloaded, false);
    // Import goes the same way.
    const t = new L.Store();
    t.importJSON(JSON.stringify(Object.assign(L.defaultState(), { lines: 777 })));
    assert.strictEqual(posts[2].type, 'reset');
    assert.strictEqual(JSON.parse(posts[2].data).lines, 777);
    t.save();
    assert.strictEqual(posts.length, 3);
    assert.throws(() => new L.Store().importJSON('{"a":1}'));
    assert.strictEqual(posts.length, 3, 'a bad import sends nothing');
  } finally { if (hadWebkit) globalThis.webkit = oldWebkit; else delete globalThis.webkit; }
});
test('browser Reset: the fresh save is stored at once, the page reloads, and the old page saves nothing after it', () => {
  const mem = {}, hadLS = 'localStorage' in globalThis, oldLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  let reloaded = 0;
  const hadLocation = 'location' in globalThis, oldLocation = globalThis.location;
  globalThis.location = { reload: () => { reloaded++; } };
  try {
    assert(!L.native.available);
    const s = new L.Store();
    s.state.lines = 900; s.state.settings.das = 199; s.save();
    s.reset(); s.restart();
    assert.strictEqual(reloaded, 1);
    s.state.lines = 900; s.save();
    const stored = JSON.parse(mem['lull.save.v1']);
    assert.deepStrictEqual([stored.lines, stored.settings.das], [0, 199]);
    const again = new L.Store(); again.load();
    assert.deepStrictEqual([again.state.lines, again.state.settings.das], [0, 199]);
  } finally {
    if (hadLS) globalThis.localStorage = oldLS; else delete globalThis.localStorage;
    if (hadLocation) globalThis.location = oldLocation; else delete globalThis.location;
  }
});
test('the shop sells cosmetics', () => {
  const s = new L.Store();
  s.state.lines = 1000;
  assert(s.buyCosmetic('skin', 'bevel'));
  assert(!s.buyCosmetic('skin', 'steel'), 'rewards cannot be bought');
  assert(s.equip('skin', 'bevel'));
});

console.log('one game a mode, and presets');
{
  const { Library, Recipe: R } = L;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  /** A played game of `recipe` (Relaxed by default), the way PlayMode leaves it. */
  const played = (seed, n, recipe, size) => {
    const z = size || { w: 10, h: 20 };
    const g = new Game({ w: z.w, h: z.h, seed, recipe });
    for (let i = 0; i < n && !g.over; i++) { g.move((i % 5) - 2); if (i % 4 === 1) g.holdPiece(); if (i % 3 === 0) g.rotate(1); g.drop(); }
    return g;
  };
  test('a new save keeps no games and no presets; the game in play is Relaxed\'s', () => {
    const st = L.loadState({});
    assert.deepStrictEqual(st.boards, { cur: null, games: {}, presets: [], seq: 0 });
    const B = Library.ensure(st, 1000);
    assert.deepStrictEqual([B.cur, Object.keys(B.games), B.presets], ['plain', [], []]);
    st.free = played(3, 2, R.normalize({ mode: 'classic' })).toJSON();
    Library.ensure(st, 2000);
    assert.strictEqual(B.cur, 'classic', 'cur is the mode of the game in play');
    assert.strictEqual(Library.ensure(st, 3000), B, 'ensure is idempotent, in place');
  });
  test('Continue: a mode\'s game comes back exactly (cells, piece, hold, queue, bag, RNG, stats, Earn) and plays on the same', () => {
    const st = L.loadState({});
    const a = played(21, 17);
    a.s.gold = 3; a.s.boost = { x: 1.25, left: 2 }; a.s.playMs = 123456; a.s.items = { bomb: 1 }; a.s.hand = false;
    st.free = a.toJSON();
    st.earn = { board: a.s.startedAt, paid: 1 };
    Library.ensure(st, 1000);
    const ref = new Game({ saved: clone(a.toJSON()) });
    // Classic, from the menu: none kept yet, so nothing to resume (the caller starts one); Relaxed is parked.
    assert.strictEqual(Library.open(st, 'classic', a.toJSON(), 2000), null);
    assert.deepStrictEqual([st.boards.cur, Object.keys(st.boards.games), st.free], ['classic', ['plain'], null]);
    assert.deepStrictEqual(st.earn, { board: null, paid: 0 }, 'the new game earns from nothing');
    const c = played(99, 9, R.normalize({ mode: 'classic' }));
    // Through a reload: the whole save as JSON and back.
    const st2 = L.loadState(JSON.parse(JSON.stringify(st)));
    Library.ensure(st2, 2500);
    const json = Library.open(st2, 'plain', c.toJSON(), 3000);
    assert.deepStrictEqual([st2.boards.cur, Object.keys(st2.boards.games), st2.free === json], ['plain', ['classic'], true]);
    assert.deepStrictEqual(st2.earn, { board: a.s.startedAt, paid: 1 }, 'its Earn record comes back with it');
    const back = new Game({ saved: clone(json) });
    assert.deepStrictEqual(back.toJSON(), ref.toJSON(), 'exactly as it was');
    assert.deepStrictEqual([back.hold, back.queue, back.bag, back.rng.state(), back.piece.x, back.piece.y, back.piece.rot], [ref.hold, ref.queue, ref.bag, ref.rng.state(), ref.piece.x, ref.piece.y, ref.piece.rot]);
    for (let i = 0; i < 40 && !ref.over; i++) { ref.move(i % 3 - 1); back.move(i % 3 - 1); ref.drop(); back.drop(); }
    assert.deepStrictEqual(back.toJSON(), ref.toJSON(), 'the same future: the RNG goes on where it was');
    assert.deepStrictEqual(clone(Library.saved(st2.boards, 'classic')), clone(c.toJSON()), 'Classic\'s game was parked as it stood');
    assert.strictEqual(Library.saved(st2.boards, 'plain', 'x'), 'x', 'the mode in play: the game in play');
    assert.strictEqual(Library.open(st2, 'plain', back.toJSON(), 4000), null, 'the mode in play is not opened again');
    assert.deepStrictEqual(Object.keys(st2.boards.games), ['classic'], 'and nothing moved');
  });
  test('New game: the mode\'s game is replaced (returned for the log); another mode\'s is parked; one game a mode, always', () => {
    const st = L.loadState({});
    const a = played(5, 6);
    st.free = a.toJSON();
    Library.ensure(st, 1000);
    // New Relaxed game in place of the one in play.
    const gone = Library.replace(st, 'plain', a.toJSON(), 2000);
    assert.deepStrictEqual(clone(gone), clone(a.toJSON()));
    assert.deepStrictEqual([st.boards.cur, Object.keys(st.boards.games), st.free, st.earn], ['plain', [], null, { board: null, paid: 0 }]);
    const b = played(6, 4);
    // New Descent game while Relaxed is in play: Relaxed parked, nothing replaced.
    assert.strictEqual(Library.replace(st, 'descent', b.toJSON(), 3000), null);
    assert.deepStrictEqual([st.boards.cur, Object.keys(st.boards.games)], ['descent', ['plain']]);
    const d = played(7, 3, R.normalize({ mode: 'descent' }));
    // New Relaxed game from Descent: Relaxed's kept game is the one replaced; Descent's is parked.
    const gone2 = Library.replace(st, 'plain', d.toJSON(), 4000);
    assert.deepStrictEqual(clone(gone2), clone(b.toJSON()));
    assert.deepStrictEqual([st.boards.cur, Object.keys(st.boards.games).sort()], ['plain', ['descent']]);
    // Every mode at once: still one each.
    const modes = ['classic', 'descent', 'mural', 'race', 'battle', 'plain'];
    let cur = played(8, 2);
    for (const m of modes) { Library.replace(st, m, cur.toJSON(), 5000); cur = played(9, 2, R.normalize({ mode: m }), m === 'race' ? { w: 10, h: 10 } : m === 'battle' ? { w: 10, h: 14 } : null); }
    st.free = cur.toJSON();
    const B = Library.ensure(L.loadState(clone(st)), 6000);
    assert.strictEqual(B.cur, 'plain');
    assert.deepStrictEqual(Object.keys(B.games).sort(), ['battle', 'classic', 'descent', 'mural', 'race']);
    for (const [k, e] of Object.entries(B.games)) assert.strictEqual(Library.modeOf(e.game.recipe), k, k + ' kept under its own mode');
  });
  test('migration: an old library keeps the most recently played board of each mode, the board in play stays in play, the rest and every retired record go', () => {
    const classic = R.normalize({ mode: 'classic' }), tiny = R.normalize({ shapes: { preset: 'tiny' } });
    const g = (seed, recipe) => played(seed, 3, recipe).toJSON();
    const list = [
      { id: 'b1', name: 'In play', created: 1, touched: 100 },
      { id: 'b2', name: 'Old plain', touched: 900, game: g(2), earn: { board: 5, paid: 2 } },
      { id: 'b3', name: 'Old classic', touched: 300, game: g(3, classic) },
      { id: 'b4', name: 'New classic', touched: 800, game: g(4, classic), earn: { board: 4, paid: 1 } },
      { id: 'b5', name: 'Tiny', touched: 700, game: g(5, tiny) },
      { id: 'b6', name: 'Broken', touched: 9999, game: { w: 10, h: 20 } },
      null, 7,
    ];
    const retired = Array.from({ length: 50 }, (_, i) => ({ id: 'r' + i, name: 'Gone ' + i, at: i, w: 10, h: 20, cells: '' }));
    const free = g(1);
    const old = { v: 2, lines: 42, free, earn: { board: 1, paid: 3 }, boards: { seq: 60, cur: 'b1', list, retired, taper: { painted: 4 }, size: { w: 12, h: 24 }, recipe: tiny, menu: { classic: { recipe: classic, size: { w: 10, h: 20 } } } } };
    const st = L.loadState(JSON.parse(JSON.stringify(old)));
    assert.strictEqual(st.v, L.SAVE_VERSION);
    assert(L.SAVE_VERSION >= 3);
    const B = st.boards;
    assert(!('list' in B) && !('retired' in B), 'no library left');
    assert.strictEqual(B.cur, 'plain', 'the board in play stays in play');
    assert.deepStrictEqual(clone(st.free), clone(free));
    assert.deepStrictEqual(st.earn, { board: 1, paid: 3 });
    assert.deepStrictEqual(Object.keys(B.games), ['classic'], 'Relaxed\'s is the board in play (newer than any shelved one); the newest Classic kept');
    assert.deepStrictEqual(clone(B.games.classic.game), clone(list[3].game));
    assert.deepStrictEqual([B.games.classic.earn, B.games.classic.touched], [{ board: 4, paid: 1 }, 800]);
    assert.deepStrictEqual([B.taper, B.size, B.menu.classic.size], [{ painted: 4 }, { w: 12, h: 24 }, { w: 10, h: 20 }], 'the rest of it stays');
    assert.strictEqual(st.lines, 42);
    Library.ensure(st, 5000);
    assert.deepStrictEqual([B.presets, Object.keys(B.games)], [[], ['classic']]);
    // A board in play with no record (cur pointing nowhere), and no board in play at all.
    const st2 = L.loadState({ v: 1, free: g(11, classic), boards: { cur: 'zz', list: [{ id: 'b2', touched: 5, game: g(12, classic) }, { id: 'b3', touched: 6, game: g(13) }], retired: [{ id: 'x' }] } });
    assert.deepStrictEqual([st2.boards.cur, Object.keys(st2.boards.games)], ['classic', ['plain']], 'the save\'s free is the game in play; a shelved Classic is passed over for it');
    const st3 = L.loadState({ v: 2, free: null, boards: { cur: null, list: [{ id: 'b2', touched: 5, game: g(14, classic) }], retired: [] } });
    Library.ensure(st3, 1);
    assert.deepStrictEqual([st3.boards.cur, Object.keys(st3.boards.games)], ['plain', ['classic']]);
    // Broken old libraries load without a throw.
    for (const boards of [{ list: 'x', retired: {}, cur: 5 }, { list: [null, { id: 3 }], retired: null }, { retired: [] }]) {
      const s = L.loadState({ v: 1, boards });
      Library.ensure(s, 1);
      assert.deepStrictEqual([s.boards.cur, s.boards.games, 'list' in s.boards], ['plain', {}, false], JSON.stringify(boards));
    }
    // A version 3 save is never migrated again.
    assert.strictEqual(Library.migrate(st, 1), false);
  });
  test('a broken save is made safe: games that cannot be resumed, kept under another mode or under the one in play are dropped; cur follows the game in play', () => {
    const classic = R.normalize({ mode: 'classic' });
    const good = played(3, 2, classic).toJSON(), plain = played(4, 2).toJSON();
    const st = L.loadState({ v: 3, free: plain, boards: { cur: 'race', games: { classic: { game: good, touched: 'x' }, descent: { game: plain }, plain: { game: plain }, mural: { game: { w: 10 } }, race: 5 }, presets: 'x', taper: 3, menu: 'bad' } });
    const B = Library.ensure(st, 7000);
    assert.deepStrictEqual([B.cur, Object.keys(B.games), B.games.classic.touched, B.presets, B.taper, B.menu], ['plain', ['classic'], 7000, [], {}, {}]);
  });
  test('presets: named, cleaned and kept in order; a name another has gets a number; renamed; deleted; twelve at most', () => {
    const st = L.loadState({});
    const B = Library.ensure(st, 1000);
    const r = R.normalize({ shapes: { preset: 'tiny' }, mods: { mirror: true } });
    const p1 = Library.addPreset(B, '  Little   mirror \n', r, { w: 12, h: 24 }, 2000);
    assert.deepStrictEqual([p1.id, p1.name, p1.size, R.equal(p1.recipe, r)], ['p1', 'Little mirror', { w: 12, h: 24 }, true]);
    assert.strictEqual(Library.addPreset(B, '​ ', r, { w: 10, h: 20 }, 2100), null, 'nothing visible: refused');
    const p2 = Library.addPreset(B, 'little MIRROR', r, { w: 2, h: 99 }, 2200);
    assert.deepStrictEqual([p2.name, p2.size], ['little MIRROR 2', L.Recipe.clampSize({ w: 2, h: 99 }, r)], 'a name taken gets a number; the size clamped for its recipe');
    assert.strictEqual(Library.renamePreset(B, p2.id, 'Wide one'), 'Wide one');
    assert.strictEqual(Library.renamePreset(B, p2.id, '   '), null);
    assert.strictEqual(Library.renamePreset(B, 'nope', 'X'), null);
    assert.strictEqual(Library.renamePreset(B, p1.id, 'W'.repeat(40)), 'W'.repeat(Library.NAME_MAX));
    assert.strictEqual(Library.renamePreset(B, p2.id, 'W'.repeat(40)), 'W'.repeat(Library.NAME_MAX - 2) + ' 2');
    assert(Library.removePreset(B, p1.id));
    assert(!Library.removePreset(B, p1.id));
    assert.deepStrictEqual(B.presets.map((p) => p.id), [p2.id]);
    for (let i = 0; i < Library.MAX_PRESETS - 1; i++) assert(Library.addPreset(B, 'Set ' + i, R.normalize({ mode: 'classic' }), { w: 10, h: 20 }, 3000 + i));
    assert.strictEqual(B.presets.length, 12);
    assert(Library.presetsFull(B));
    const before = JSON.stringify(B);
    assert.strictEqual(Library.addPreset(B, 'Thirteenth', r, { w: 10, h: 20 }, 4000), null);
    assert.strictEqual(JSON.stringify(B), before, 'refused: nothing changes');
    // Kept in the save: through a reload, every one as it was; ids never reused.
    const back = Library.ensure(L.loadState(JSON.parse(JSON.stringify(st))), 5000);
    assert.deepStrictEqual(clone(back.presets), clone(B.presets));
    Library.removePreset(back, back.presets[3].id);
    assert.strictEqual(Library.addPreset(back, 'Again', r, { w: 10, h: 20 }, 6000).id, 'p14');
    // Broken presets in a save: dropped, or made whole.
    const odd = L.loadState({ v: 3, boards: { presets: [null, { id: 'p1', name: '​' }, { id: 'p2', name: 'Fine', recipe: 'junk', size: { w: 99 } }, { id: 'p2', name: 'Twin' }, { name: 'No id' }].concat(Array.from({ length: 20 }, (_, i) => ({ id: 'p' + (10 + i), name: 'N' + i }))) } });
    const OB = Library.ensure(odd, 1);
    assert.strictEqual(OB.presets.length, 12);
    assert.deepStrictEqual([OB.presets[0].id, OB.presets[0].name, OB.presets[0].size, R.equal(OB.presets[0].recipe, R.DEFAULT)], ['p2', 'Fine', { w: 20, h: 20 }, true]);
    assert(OB.seq >= Math.max(...OB.presets.map((p) => +p.id.slice(1))), 'ids go on past every one kept');
  });
  test('combos pay less each time they come round in any game, not per game: it never starts over', () => {
    const st = L.loadState({});
    const B = Library.ensure(st, 1000);
    assert.deepStrictEqual([0, 1, 2].map(() => Library.taper(B, 'painted', 0)), [0, 1, 2]);
    Library.replace(st, 'plain', played(11, 3).toJSON(), 2000);
    assert.strictEqual(Library.taper(B, 'painted', 0), 3, 'a new game: no fresh start');
    Library.replace(st, 'classic', played(12, 3).toJSON(), 3000);
    Library.open(st, 'plain', played(13, 3, R.normalize({ mode: 'classic' })).toJSON(), 4000);
    assert.strictEqual(Library.taper(B, 'painted', 0), 4, 'another mode and back: still none');
    assert.strictEqual(Library.taper(B, 'keyhole', 2), 2, 'a game\'s own count is never undercut');
  });
  test('a power-up per two hundred lines stays per game: another mode and back never pays a milestone twice', () => {
    const st = L.loadState({});
    const a = played(40, 1);
    a.s.lines = 199;
    st.free = a.toJSON();
    Library.ensure(st, 1000);
    assert.strictEqual(L.Earn.lines(st.earn, a.s.startedAt, 200, 199), 1, 'the 200th line pays');
    // Rewound to 199, another mode played, then back: the 200th line again pays nothing.
    Library.open(st, 'classic', a.toJSON(), 2000);
    assert.strictEqual(L.Earn.lines(st.earn, 777, 50, 49), 0);
    Library.open(st, 'plain', played(41, 1, R.normalize({ mode: 'classic' })).toJSON(), 3000);
    assert.strictEqual(L.Earn.lines(st.earn, a.s.startedAt, 200, 199), 0);
  });
}

console.log('board sizes');
{
  const { Library } = L;
  const EXTREMES = [[4, 8], [4, 40], [20, 8], [20, 40]];
  /** Every cell of the piece in play inside the board and on an empty cell; the stack the right length. */
  const sane = (g, what) => {
    assert.strictEqual(g.board.cells.length, g.w * g.h, what + ': stack length');
    if (g.piece && !g.over) {
      for (const [x, y] of g.cellsOf(g.piece)) {
        assert(x >= 0 && x < g.w && y >= 0 && y < g.h, what + ': piece cell ' + x + ',' + y + ' out of a ' + g.w + ' x ' + g.h + ' board');
        assert(!g.board.get(x, y), what + ': piece over a block at ' + x + ',' + y);
      }
    }
  };
  const fillRow = (g, y, gapAt) => { for (let x = 0; x < g.w; x++) if (!gapAt || !gapAt.includes(x)) g.board.set(x, y, 8); };
  test('sizes: 4 x 8 to 20 x 40, whole numbers; anything else is clamped; a line w wide is worth w/10; pay rounds down to the hundredth', () => {
    assert.deepStrictEqual([Library.LIMITS.w, Library.LIMITS.h], [[4, 20], [8, 40]]);
    for (const [w, h] of EXTREMES.concat([[10, 20], [7, 13]])) assert(Library.validSize(w, h), w + 'x' + h);
    for (const [w, h] of [[3, 20], [21, 20], [10, 7], [10, 41], [10.5, 20], ['10', 20], [null, 20], [NaN, 20]]) assert(!Library.validSize(w, h), w + 'x' + h);
    assert.deepStrictEqual(Library.clampSize({ w: 2, h: 99 }), { w: 4, h: 40 });
    assert.deepStrictEqual(Library.clampSize({ w: 12.4, h: 'x' }), { w: 12, h: 20 });
    assert.deepStrictEqual(Library.clampSize(null), { w: 10, h: 20 });
    assert.deepStrictEqual([4, 5, 10, 15, 20].map(Library.scale), [0.4, 0.5, 1, 1.5, 2]);
    assert.strictEqual(Library.bank(8.75), 8.75);
    assert.strictEqual(Library.bank(5 * 1.1 * 1.25), 6.87, 'rounded down, never up');
    assert.strictEqual(Library.bank(0.7 + 0.1 + 0.2), 1, 'float drift does not lose a hundredth');
    assert.strictEqual(Library.bank(-3), 0);
    assert.strictEqual(Library.sizeLabel(12, 24), '12 × 24');
    assert.deepStrictEqual([L.fmtLines(12.5), L.fmtLines(0.4), L.fmtLines(1204.75), L.fmtLines(0.1 + 0.2), L.fmtLines(3), L.fmtLines(0.05)], ['12.5', '0.4', '1,204.75', '0.3', '3', '0.05']);
  });
  test('sizes: the same clear pays w/10 of Standard, at every width (and never faster per cell)', () => {
    // What PlayMode.onLock pays (js/items.js, Pay.clear): lines x scale, plus a bonus for a difficult clear (w/10 of a
    // Standard line up to 10 wide; wider, (10/w)² of one, as quads are easier there), x the multiplier, rounded down.
    const pay = (lines, difficult, mult, w) => L.Pay.clear({ mult }, { lines, twist: difficult && lines < 4 }, w).pay;
    const cap = L.Chain.RELAXED.cap;
    for (let w = 4; w <= 20; w++) {
      for (const [lines, diff, mult] of [[1, false, 1], [2, false, 1], [4, true, 1], [4, true, 1.75], [2, true, cap], [4, true, cap * L.Luck.GOLD_X]]) {
        const std = pay(lines, diff, mult, 10), here = pay(lines, diff, mult, w);
        const k = w / 10;
        if (w <= 10 || !diff) assert(Math.abs(here - Library.bank(std * k)) <= 0.01, w + ' wide: ' + here + ' vs ' + std);
        else assert(Math.abs(here - Library.bank((lines * k + 1 / (k * k)) * mult)) <= 0.01, w + ' wide, difficult: ' + here);
        assert(here / w <= std / 10 + 1e-9, w + ' wide pays faster per cell: ' + here + ' vs ' + std);
      }
    }
    assert.strictEqual(pay(4, true, 1.75, 10), 8.75, 'a Standard quad at x1.75');
    assert.strictEqual(pay(4, true, 1, 5), 2.5, 'a quad 5 wide');
    assert.strictEqual(pay(1, false, 1, 20), 2, 'a single 20 wide');
    assert.strictEqual(pay(4, true, 1, 20), 8.25, 'a quad 20 wide: its bonus is a quarter of a Standard line');
    assert.strictEqual(pay(1, true, 1, 20), 2.25, 'a twist single 20 wide: two lines and a quarter');
  });
  test('sizes: the most a clear can pay, at every width; Classic never pays more per line than Free Play', () => {
    const { Chain, Pay } = L, cap = Chain.RELAXED.cap;
    for (let w = 4; w <= 20; w++) {
      // Wider than Standard the cap falls toward x1 by (10/w)³, and the bonus is (10/w)² of a Standard line.
      const k = Library.scale(w), top = k > 1 ? Math.round((1 + (cap - 1) / (k * k * k)) * 100) / 100 : cap;
      assert.strictEqual(capAt(w), top, w + ' wide: the cap');
      const most = Pay.clear({ mult: top }, { lines: 4 }, w).pay;
      assert.strictEqual(most, Library.bank(top * (4 * k + Math.min(k, 1 / (k * k)))), w + ' wide');
      if (w <= 10) assert.strictEqual(most, w, w + ' wide: a capped quad pays w');
      else assert(most < w, w + ' wide: a capped quad pays less than w (' + most + ')');
    }
    assert.deepStrictEqual([12, 20].map((w) => Pay.clear({ mult: capAt(w) }, { lines: 4 }, w).pay), [8.68, 9.32]);
    // Classic: a capped quad banks four lines at its rate and its cap.
    const C = Chain.CLASSIC;
    assert.strictEqual(Library.bank(4 * C.rate * C.cap), 4.2);
    for (let n = 0; n < 100; n++) assert(C.rate * Chain.mult(n, 'classic') <= Chain.mult(n) + 1e-9, 'Classic pays no more a line at a streak of ' + n);
  });
  test('sizes: the difficult-clear bonus is at most one Standard line, so a T a bag never earns more on a wide board', () => {
    // The best a bag can do: its one T clears a line with a twist, the other 28 - w cells go as quads; at the cap.
    const bag = (w) => {
      const cap = L.Chain.RELAXED.cap, tss = L.Pay.clear({ mult: cap }, { lines: 1, twist: true }, w).pay, quad = L.Pay.clear({ mult: cap }, { lines: 4 }, w).pay;
      return tss + quad * (28 - w) / (4 * w);
    };
    const std = bag(10);
    for (let w = 4; w <= 20; w++) assert(bag(w) <= std + 0.01, w + ' wide: ' + bag(w).toFixed(3) + ' a bag vs ' + std.toFixed(3));
  });
  test('sizes: the streak climbs by cells cleared: a narrow board playing quads never out-earns Standard', () => {
    // Quads only, never broken: after the same number of cells, a board w wide has paid no more than Standard.
    const run = (w, cells) => {
      const g = { w, s: { b2b: -1 } };
      let paid = 0, done = 0;
      while (done + 4 * w <= cells) {
        g.s.b2b++;
        g.s.mult = L.Pay.mult(g);
        paid += L.Pay.clear(g.s, { lines: 4 }, w).pay;
        done += 4 * w;
      }
      return paid;
    };
    for (const w of [4, 5, 6, 7, 8, 9, 11, 12, 14, 16, 20]) {
      for (let cells = 40; cells <= 40 * 60; cells += 40) {
        const here = run(w, cells), std = run(10, cells);
        assert(here <= std + 0.01, w + ' wide after ' + cells + ' cells: ' + here + ' vs ' + std);
      }
    }
    // Per piece, at every width: a quad w wide takes w pieces (4w cells), so after the same number of pieces no board
    // has paid more than Standard.
    for (let w = 4; w <= 20; w++) {
      for (let pieces = 10; pieces <= 10 * 60; pieces += 10) {
        const here = run(w, 4 * Math.floor(pieces / w) * w), std = run(10, 4 * Math.floor(pieces / 10) * 10);
        assert(here <= std + 0.01, w + ' wide after ' + pieces + ' pieces: ' + here + ' vs ' + std);
      }
    }
    // The count itself (the chain, achievements) stays raw: twelve quads in a row are a streak of twelve at any width.
    const g = { w: 7, s: { b2b: 11 } };
    assert.strictEqual(L.Chain.streak(g), 12);
    assert.strictEqual(L.Pay.mult(g), L.Chain.mult(12 * 0.7));
    assert.strictEqual(L.Pay.mult({ w: 20, s: { b2b: 11 } }), L.Chain.mult(12 / 4), 'wider: a link counts (10/w)² of one');
    assert.strictEqual(L.Pay.mult({ w: 20, s: { b2b: 999 } }), Math.round((1 + (L.Chain.RELAXED.cap - 1) / 8) * 100) / 100, 'wider: the cap falls by (10/w)³');
    for (let w = 11; w <= 20; w++) for (let n = 0; n <= 60; n++) assert(multAt(w, n) <= multAt(10, n), w + ' wide never climbs faster than Standard: ' + n);
  });
  test('sizes: a Golden Piece, a boost and Double or Nothing are worth the same at every width (in Standard clears)', () => {
    const { Luck, Pay } = L;
    // One Golden Piece, spent on quads at x1: what it adds over the same quads without it.
    const golden = (w) => {
      const s = { mult: 1, gold: Luck.GOLD_CLEARS };
      let extra = 0, n = 0;
      while (s.gold > 0 && n++ < 100) extra += Pay.clear(s, { lines: 4 }, w).pay - Pay.clear({ mult: 1 }, { lines: 4 }, w).pay;
      return { extra: Math.round(extra * 100) / 100, clears: n };
    };
    const std = golden(10);
    assert.deepStrictEqual(std, { extra: Luck.goldValue(5), clears: 5 });
    assert.strictEqual(std.extra, 25);
    // (Wider than Standard a quad's bonus is (10/w)² of a Standard line, so a quad there is worth (4 + (10/w)³)/5 of five
    // Standard lines a line's worth, and gold on it adds that share of what it adds on Standard.)
    const wideShare = (w) => { const k = w / 10; return k > 1 ? (4 + 1 / (k * k * k)) / 5 : 1; };
    for (let w = 4; w <= 20; w++) assert(golden(w).extra <= std.extra + 1e-9 && golden(w).extra >= std.extra * wideShare(w) - 0.1, w + ' wide: ' + JSON.stringify(golden(w)));
    assert.strictEqual(golden(20).clears, 3, '20 wide: two clears and a half');
    assert.strictEqual(golden(4).clears, 13, '4 wide: twelve clears and a half');
    assert.strictEqual(Pay.clearsLeft(5, 20), 3);
    assert.strictEqual(Pay.clearsLeft(5, 4), 13);
    assert.strictEqual(Pay.clearsLeft(5, 10), 5);
    assert.strictEqual(Pay.clearsLeft(0, 10), 0);
    // A x1.5 boost for three clears: 20 wide it covers a clear and a half.
    const boost = (w) => {
      const s = { mult: 1, boost: { x: 1.5, left: 3 } };
      let extra = 0, n = 0;
      while (s.boost && n++ < 100) extra += Pay.clear(s, { lines: 4 }, w).pay - Pay.clear({ mult: 1 }, { lines: 4 }, w).pay;
      return Math.round(extra * 100) / 100;
    };
    for (let w = 4; w <= 20; w++) assert(boost(w) <= boost(10) + 1e-9 && boost(w) >= boost(10) * wideShare(w) - 0.1, w + ' wide boost ' + boost(w) + ' vs ' + boost(10));
    // A won Double or Nothing adds at most one Standard clear's worth; lost, the clear pays nothing.
    const cap = L.Chain.RELAXED.cap;
    const dbl = (w) => { const s = { mult: cap, gold: 5, double: true }, r = Pay.clear(s, { lines: 4 }, w); return [r.pay, r.double, s.double]; };
    const plain = (w) => Pay.clear({ mult: cap, gold: 5 }, { lines: 4 }, w).pay;
    for (let w = 4; w <= 20; w++) {
      const [won, what, left] = dbl(w);
      assert.strictEqual(what, 'won'); assert.strictEqual(left, false);
      assert(won - plain(w) <= dbl(10)[0] - plain(10) + 0.01, w + ' wide: double adds ' + (won - plain(w)));
    }
    const lost = { mult: 1, double: true };
    assert.deepStrictEqual([Pay.clear(lost, { lines: 1 }, 20).pay, lost.double], [0, false]);
  });
  test('sizes: the wallet keeps hundredths and never drifts', () => {
    const s = new L.Store();
    const st = s.state;
    const l0 = st.lines;
    for (let i = 0; i < 10; i++) s.addLines(0.1, 'play');
    assert.strictEqual(st.lines, l0 + 1);
    s.addLines(0.7, 'play'); s.addLines(0.2, 'play');
    assert.strictEqual(st.lines, l0 + 1.9);
    assert(s.spend(0.3));
    assert.strictEqual(st.lines, l0 + 1.6);
    s.addLines(-0.6, 'rewind');
    assert.strictEqual(st.lines, l0 + 1);
    assert.strictEqual(L.fmtInt(st.lines), String(l0 + 1));
  });
  test('sizes: at 4 x 8, 4 x 40, 20 x 8 and 20 x 40 every piece spawns inside (the I flat), lines clear, a spotless clear is seen, and undo takes it back', () => {
    for (const [w, h] of EXTREMES) {
      const g = new Game({ w, h, seed: 3 });
      sane(g, w + 'x' + h + ' spawn');
      for (const id of L.Pieces.TETROMINOES) {
        assert(g.replacePiece({ id }), w + 'x' + h + ' ' + id + ' fits');
        sane(g, w + 'x' + h + ' ' + id);
      }
      g.replacePiece({ id: 'I' });
      assert.strictEqual(g.piece.rot, 0, 'the I is flat');
      assert.strictEqual(g.piece.y + g.piece.type.rotBounds[0].maxY <= h - 1, true);
      // Two rows full but for four cells, and an I dropped flat into them: two lines, then an empty board.
      g.resetBoard();
      fillRow(g, 0, [0, 1, 2, 3]);
      g.replacePiece({ id: 'I' });
      while (g.move(-1));
      const r = g.drop();
      assert.strictEqual(r.lines, 1, w + 'x' + h + ' one line');
      assert(r.perfect, w + 'x' + h + ' spotless clear');
      assert(g.board.isEmpty());
      sane(g, w + 'x' + h + ' after the clear');
      const res = g.undo();
      assert.strictEqual(res.lines, 1, 'undo gives back the line');
      assert.strictEqual(g.board.count(), w - 4, 'and the row it cleared');
      sane(g, w + 'x' + h + ' after undo');
    }
  });
  test('sizes: a twist double against the wall and in the middle, at both widths', () => {
    for (const w of [4, 20]) {
      for (const at of w === 4 ? [0] : [0, 8, 17]) {
        const g = new Game({ w, h: 8, seed: 4 });
        // Rows 0 and 1 full but for a T-slot at column at+1 (row 0) and at..at+2 (row 1), roofed at at+2 over row 2.
        for (let x = 0; x < w; x++) { if (x !== at + 1) g.board.set(x, 0, 8); if (x < at || x > at + 2) g.board.set(x, 1, 8); }
        g.board.set(at + 2 < w ? at + 2 : at, 2, 8);
        g.replacePiece({ id: 'T' });
        Object.assign(g.piece, { rot: 2, x: at, y: 0, lastRot: true });
        assert(g.fitsAt(g.piece, 2, at, 0), 'the T fits its slot');
        const r = g.lock();
        assert(r.twist && r.lines === 2, w + ' wide at ' + at + ': ' + JSON.stringify({ twist: r.twist, lines: r.lines }));
      }
    }
  });
  test('sizes: a piece wider than the board (a Noodle 4 or 5 wide) tops out inside the walls, and stays inside after a reload', () => {
    const noodle = L.Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id;
    for (const [w, h] of [[4, 8], [5, 12]]) {
      const g = new Game({ w, h, seed: 2 });
      // A Noodle in play goes back into the line with Pick of Three; then a stack with no column six rows free.
      assert(g.replacePiece({ id: noodle }), 'a Noodle');
      assert(g.pickFromQueue(0), 'picked');
      assert.strictEqual(g.queue[0].id, noodle);
      for (let y = 0; y < h - 4; y++) for (let x = 0; x < w; x++) if (x !== y % w) g.board.set(x, y, 8);
      g.drop();
      assert(g.over, w + 'x' + h + ' full');
      for (const [x, y] of g.cellsOf(g.piece)) assert(x >= 0 && x < w && y >= 0 && y < h, w + 'x' + h + ' cell ' + x + ',' + y + ' out of the well');
      const back = new Game({ saved: JSON.parse(JSON.stringify(g.toJSON())) });
      for (const [x, y] of back.cellsOf(back.piece)) assert(x >= 0 && x < w && y >= 0 && y < h, 'reloaded: ' + x + ',' + y);
    }
  });
  test('Laser on a Ghost piece or a drill bit inside blocks is refused; out in the open it turns', () => {
    for (const [w, h] of [[10, 20], [4, 8], [20, 40]]) {
      const g = new Game({ w, h, seed: 3 });
      for (let x = 0; x < w; x++) for (let y = 0; y < 3; y++) g.board.set(x, y, 8);
      assert(g.setSpecial('phase'));
      Object.assign(g.piece, { y: 0 });
      assert(g.fitsAt(g.piece, g.piece.rot, g.piece.x, 0), 'the ghost sits in the blocks');
      assert.strictEqual(g.setSpecial('laser'), false, w + 'x' + h + ' refused');
      assert.strictEqual(g.piece.special, 'phase');
      Object.assign(g.piece, { y: h - 1 - g.piece.type.rotBounds[g.piece.rot].maxY });
      assert(g.setSpecial('laser'), 'in the open');
      assert.strictEqual(g.piece.special, 'laser');
    }
  });
  test('sizes: every item at the extremes never throws, never leaves a piece out of the board or in a block, and saves and loads', () => {
    const rnd = new RNG('items-at-sizes');
    const shapes = [() => ({ id: 'M1' }), () => ({ id: L.Pieces.customType([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]).id }), () => ({ id: L.Pieces.bigOf('I').id }), () => ({ id: L.Pieces.bigOf('T').id }),
      () => ({ id: L.Pieces.customType([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]]).id }), () => ({ id: L.Pieces.mirrorOf(L.Pieces.TYPES.J).id })];
    const acts = [
      (g) => g.replacePiece(shapes[rnd.int(shapes.length)]()),
      (g) => g.setSpecial(['patch', 'phase', 'drill', 'bomb', 'laser', 'blackhole'][Math.floor(rnd.next() * 6)]),
      (g) => g.bestFit(), (g) => g.pickFromQueue(Math.floor(rnd.next() * 3)),
      (g) => g.settle(), (g) => g.tornado(), (g) => g.trapdoor(), (g) => g.flipWorld(), (g) => g.undo(), (g) => g.holdPiece(),
    ];
    for (const [w, h] of EXTREMES.concat([[10, 20], [5, 9]])) {
      for (let run = 0; run < 6; run++) {
        const g = new Game({ w, h, seed: run * 7 + w });
        for (let i = 0; i < 160 && !g.over; i++) {
          const what = w + 'x' + h + ' run ' + run + ' step ' + i;
          if (rnd.next() < 0.35) { const k = Math.floor(rnd.next() * acts.length); acts[k](g); sane(g, what + ' act ' + k); }
          if (!g.piece) break;
          for (let t = Math.floor(rnd.next() * 3); t > 0; t--) g.rotate(1);
          g.move(Math.floor(rnd.next() * (w + 1)) - Math.floor(w / 2));
          sane(g, what + ' moved');
          g.drop();
          sane(g, what + ' dropped');
          if (i % 25 === 0) {
            const j = JSON.parse(JSON.stringify(g.toJSON())), back = new Game({ saved: j });
            assert.strictEqual(JSON.stringify(back.toJSON()), JSON.stringify(g.toJSON()), what + ' round trip');
            assert.deepStrictEqual([back.w, back.h], [w, h]);
          }
        }
      }
    }
  });
  test('sizes: Settle and Trapdoor refuse (nothing changes) when a block would come down into the piece in play', () => {
    for (const [w, h] of [[10, 20], [20, 8], [4, 40]]) {
      // A column of blocks over a gap, the piece tucked in the gap beside the stack's foot.
      const g = new Game({ w, h, seed: 9 });
      g.replacePiece({ id: 'M1' });
      for (let x = 1; x < w - 1; x++) g.board.set(x, 0, 8);
      g.board.set(0, 2, 8); g.board.set(0, 3, 8);
      Object.assign(g.piece, { x: 0, y: 1, rot: 0 });
      assert(g.fitsAt(g.piece, 0, 0, 1));
      const before = JSON.stringify(g.toJSON()), hist = g.history.length;
      assert.strictEqual(g.settle(), null, w + 'x' + h + ' settle refused');
      assert.strictEqual(g.trapdoor(), null, w + 'x' + h + ' trapdoor refused');
      assert.strictEqual(JSON.stringify(g.toJSON()), before, 'nothing moved');
      assert.strictEqual(g.history.length, hist, 'nothing to undo');
      // Moved out from under them, both work.
      Object.assign(g.piece, { x: Math.floor(w / 2), y: h - 1 });
      assert(g.trapdoor(), 'trapdoor with room');
      sane(g, 'after trapdoor');
    }
  });
  test('sizes: saved and loaded with the game, parked and resumed; a size no board can have is dropped', () => {
    const st = L.loadState({});
    const B = Library.ensure(st, 1000);
    assert.deepStrictEqual(B.size, { w: 10, h: 20 }, 'Standard until one is chosen');
    const a = new Game({ w: 7, h: 13, seed: 1 });
    for (let i = 0; i < 5; i++) a.drop();
    st.free = a.toJSON();
    const b = new Game({ w: 20, h: 40, seed: 2, recipe: L.Recipe.normalize({ mode: 'classic' }) });
    Library.open(st, 'classic', a.toJSON(), 2000);
    const back = Library.open(st, 'plain', b.toJSON(), 3000);
    const g = new Game({ saved: JSON.parse(JSON.stringify(back)) });
    assert.deepStrictEqual([g.w, g.h, g.s.pieces], [7, 13, 5]);
    // Edited by hand: a kept game of an impossible size goes; the Custom window's size is clamped.
    const bad = Object.assign(new Game({ w: 10, h: 20, seed: 5, recipe: L.Recipe.normalize({ mode: 'descent' }) }).toJSON(), { w: 30 });
    const st2 = L.loadState({ v: 3, boards: { cur: 'plain', games: { descent: { game: bad }, classic: { game: new Game({ w: 4, h: 40, recipe: L.Recipe.normalize({ mode: 'classic' }) }).toJSON() } }, size: { w: 99, h: 'x' } } });
    const B2 = Library.ensure(st2, 1);
    assert.deepStrictEqual(Object.keys(B2.games), ['classic']);
    assert.deepStrictEqual(B2.size, { w: 20, h: 20 });
    assert(!Library.playable(bad) && Library.playable(new Game({ w: 4, h: 8 }).toJSON()));
  });
  test('sizes: power-ups every two hundred lines and the line achievements count Standard lines; feats count on boards 10 wide or more', () => {
    // A board 5 wide: 400 of its lines are 200 Standard ones (as PlayMode passes them to Earn).
    const e = { board: null, paid: 0 }, k = Library.scale(5), n = L.Earn.EVERY / k;
    assert.strictEqual(n, 400);
    assert.strictEqual(L.Earn.lines(e, 1, (n - 1) * k, (n - 2) * k), 0);
    assert.strictEqual(L.Earn.lines(e, 1, n * k, (n - 1) * k), 1);
    const A = L.Achievements;
    const asPlayed = (s, o) => Object.assign(s, o || {}, o && 'lines' in o && !('own' in o) ? { own: o.lines } : null, o && 'pieces' in o && !('cells' in o) ? { cells: o.pieces * 4 } : null);
    const on = (w, h, s, r) => { const g = new Game({ w, h, seed: 1 }); asPlayed(g.s, s); return { mode: 'play', r: Object.assign({ lines: 1, combo: 0 }, r), g }; };
    const ids = (st, ev) => A.check(st, ev).map((a) => a.id);
    let st = L.defaultState();
    assert.deepStrictEqual(ids(st, on(5, 20, { lines: 299 })), [], '299 lines 5 wide are under 150');
    assert.deepStrictEqual(ids(st, on(5, 20, { lines: 300 })), ['lines150']);
    st = L.defaultState();
    assert.deepStrictEqual(ids(st, on(20, 20, { lines: 75 })), ['lines150'], '75 lines 20 wide are 150');
    // A quad, a spotless clear and a combo on a narrow board: nothing. The same at Standard width and wider: earned.
    st = L.defaultState();
    assert.deepStrictEqual(ids(st, on(4, 20, { hcombo: 10, hperfect: 10 }, { lines: 4, perfect: true, hand: true })), []);
    assert.deepStrictEqual(ids(st, on(9, 20, { score: 1e6 }, { lines: 4, hand: true })), [], '9 wide is still narrow');
    assert.deepStrictEqual(ids(st, on(12, 20, {}, { lines: 4, hand: true })), ['quad']);
    // The perfect-clear opener counts every block: pieces x 4 = lines x width.
    st = L.defaultState();
    assert(!ids(st, on(12, 20, { pieces: 10, lines: 3 }, { lines: 3, perfect: true, hand: true })).includes('pc_open'), '40 cells are not 36');
    assert(ids(st, on(12, 20, { pieces: 9, lines: 3 }, { lines: 3, perfect: true, hand: true })).includes('pc_open'));
    // Clean Sweep: 60 blocks, or six rows' worth on a wider board.
    st = L.defaultState();
    assert.deepStrictEqual(ids(st, on(20, 20, {}, { lines: 3, special: 'settle', had: 100 })), []);
    assert.deepStrictEqual(ids(st, on(20, 20, {}, { lines: 3, special: 'settle', had: 120 })), ['it_sweep']);
    st = L.defaultState();
    assert.deepStrictEqual(ids(st, on(4, 40, {}, { lines: 3, special: 'settle', had: 59 })), []);
    assert.deepStrictEqual(ids(st, on(4, 40, {}, { lines: 3, special: 'settle', had: 60 })), ['it_sweep'], 'counts on a narrow board too');
    // Pace: 36 Standard lines in the last hundred pieces.
    st = L.defaultState();
    const pace = (per) => Array.from({ length: 101 }, (_, i) => [i * 890, Math.floor(i * per)]);
    assert.deepStrictEqual(ids(st, on(5, 20, { pace: pace(0.4) })), [], '40 lines 5 wide are 20');
    assert.deepStrictEqual(ids(st, on(5, 20, { pace: pace(0.8) })).sort(), ['pace33', 'pace67']);
    // Painted Row: one colour across a row is a flat I on a board 4 wide.
    const painted = (w) => { const g = new Game({ w, h: 20, seed: 1 }); return L.Combos.detect({ lines: 1, removed: [Array(w).fill(1)] }, g); };
    assert.deepStrictEqual([painted(4), painted(9), painted(10), painted(16)], [[], [], ['painted'], ['painted']]);
    assert(['lines150', 'lines500', 'lines5000', 'purist', 'pace33', 'pace67', 'it_sweep'].every((id) => A.ANY_SIZE.has(id)));
  });
}

console.log('board recipe');
{
  const { Recipe, Library, CELL, Pay } = L;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  /** A throwaway part for one test (js/recipe.js): registered, used, taken away again. */
  const withParts = (defs, fn) => { defs.forEach((d) => Recipe.part(d)); try { return fn(); } finally { defs.forEach((d) => Recipe.unpart(d.key)); } };
  /** The foundation alone: the feature parts loaded (shapes, …) taken away for one test, then put back. */
  const bare = (fn) => { const had = Recipe.parts().filter((p) => p.key !== 'core'); had.forEach((p) => Recipe.unpart(p.key)); try { return fn(); } finally { had.forEach((p) => Recipe.part(p)); } };
  const fill = (g, rows) => rows.forEach((row, i) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') g.board.set(x, rows.length - 1 - i, row[x] === 'F' ? CELL.FOREIGN | 8 : row[x] === 'A' ? CELL.FOREIGN | CELL.HANG | 14 : 1 + (x % 7)); });
  /** Sets the piece in play to `id` at column x (its box), turned rot, from the top, and drops it. */
  const dropAt = (g, id, x, rot) => { g.piece = { type: Pieces.get(id), rot: rot || 0, x, y: g.h - 4, special: null, entry: { id, rot: 0 }, lastRot: false }; return g.drop(); };

  test('recipe: the default is today’s board, and anything unknown or invalid falls back to it', () => bare(() => {
    // (The modifiers are the parts': none in the foundation alone.)
    assert.deepStrictEqual(clone(Recipe.DEFAULT), { v: 1, shapes: { preset: 'normal' }, mods: {}, mode: 'plain' });
    assert(Object.isFrozen(Recipe.DEFAULT) && Object.isFrozen(Recipe.DEFAULT.mods));
    for (const junk of [null, undefined, 5, 'x', [], { mode: 'battle' }, { mode: 'descent', descent: { level: 'easy' } }, { mode: 'tide', tide: { level: 'easy' } }].filter((j) => !(j && Recipe.parts().some((p) => p.mode && p.mode === j.mode))).concat([{ mods: { jelly: 'yes', mirror: 1 } }, { shapes: { preset: 'frantic' }, extra: 1 }, { v: 9 }])) {
      assert.deepStrictEqual(clone(Recipe.normalize(junk)), clone(Recipe.DEFAULT), JSON.stringify(junk));
      assert(Recipe.equal(junk, Recipe.DEFAULT) && Recipe.isDefault(junk));
    }
    assert.strictEqual(Recipe.key({ mode: 'plain', v: 1 }), Recipe.key({ v: 1, mode: 'plain' }), 'key order is not meaning');
    assert.strictEqual(Recipe.label(Recipe.DEFAULT), '');
    assert.strictEqual(Recipe.label({}, true), '');
    const t = Recipe.thin(Recipe.DEFAULT);
    assert.deepStrictEqual(t, clone(Recipe.DEFAULT));
    assert(t !== Recipe.DEFAULT && !Object.isFrozen(t));
  }));

  test('recipe: sizes clamp into the limits every part has raised (Library.clampSize with a recipe goes there)', () => {
    assert.deepStrictEqual(Recipe.limits(Recipe.DEFAULT), { w: [4, 20], h: [8, 40] });
    assert.deepStrictEqual(Recipe.clampSize({ w: 2, h: 99 }, Recipe.DEFAULT), { w: 4, h: 40 });
    assert.deepStrictEqual(Recipe.clampSize(null, Recipe.DEFAULT), { w: 10, h: 20 });
    assert.deepStrictEqual(Library.clampSize({ w: 12.4, h: 'x' }, Recipe.DEFAULT), Library.clampSize({ w: 12.4, h: 'x' }));
    withParts([{ key: 'tbig', order: 45, owns: ['tbig'], normalize: (raw, out) => { if (raw.tbig === true) out.tbig = true; }, limits: (r, lim) => { if (r.tbig) { lim.w[0] = 6; lim.h[0] = 12; } } }], () => {
      const r = { tbig: true };
      assert.deepStrictEqual(Recipe.limits(r), { w: [6, 20], h: [12, 40] });
      assert.deepStrictEqual(Recipe.clampSize({ w: 4, h: 8 }, r), { w: 6, h: 12 });
      assert.deepStrictEqual(Library.clampSize({ w: 4, h: 8 }, r), { w: 6, h: 12 });
      assert(!Recipe.sizeOk(4, 8, r) && Recipe.sizeOk(6, 12, r) && Recipe.sizeOk(4, 8, Recipe.DEFAULT));
      assert.deepStrictEqual(clone(Recipe.DEFAULT), { v: 1, shapes: { preset: 'normal' }, mods: { mirror: false, physics: false }, mode: 'plain' }, 'a part that is off leaves the default alone');
    });
  });

  test('recipe: R, the rules: the defaults, and f, lk, wEff, feats and quad derived from what the parts set', () => {
    const R = Recipe.rules(Recipe.DEFAULT, 10);
    for (const [k, v] of Object.entries({ u: 1, copies: 1, E: 4, f: 1, lk: 1, wEff: 10, feats: true, quad: 4, undo: true, hints: true, rated: true, timed: false, noFeats: false, k: 0 })) assert.strictEqual(R[k], v, k);
    assert.deepStrictEqual(R.refuse, {});
    for (let w = 4; w <= 20; w++) {
      assert.strictEqual(Recipe.rules({}, w).lk, Library.scale(w), 'lk is w/10 on a Normal board, ' + w);
      assert.strictEqual(Recipe.rules({}, w).feats, w >= 10);
    }
    withParts([{ key: 'trules', order: 45, rules: (r, R) => { R.E = 8; R.copies = 2; R.u = 2; R.rated = false; } }], () => {
      const T = Recipe.rules({}, 16);
      assert.deepStrictEqual([T.f, T.lk, T.wEff, T.quad, T.feats], [0.5, 0.8, 4, 8, false]);
      assert.deepStrictEqual(T.refuse, { double: 'Needs Normal shapes', net: 'Needs Normal shapes' }, 'unrated: Double or Nothing and Safety Net are refused');
      const g = new Game({ w: 16, h: 20, seed: 1, recipe: {} });
      assert.strictEqual(g.allow('double'), 'Needs Normal shapes');
      assert.strictEqual(g.allow('bomb'), null);
      assert.strictEqual(Library.worth(g), 0.8);
      assert.strictEqual(Library.worth({ w: 16, recipe: {} }), 0.8, 'a saved board: from its recipe');
    });
  });

  test('recipe: Full Blast and Event Horizon count one copy\'s share (R.copies), or a part\'s own count (comboCount); a plain board every cell', () => {
    const cells = (n) => Array.from({ length: n }, (_, i) => [i % 10, Math.floor(i / 10), 1]);
    const found = (g, r) => L.Combos.detect(Object.assign({ lines: 0 }, r), g);
    const plain = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
    assert.deepStrictEqual(found(plain, { special: 'bomb', blast: cells(10) }), ['fullblast'], 'plain: ten blocks is Full Blast');
    assert.deepStrictEqual(found(plain, { special: 'bomb', blast: cells(9) }), []);
    assert.deepStrictEqual(found(plain, { special: 'blackhole', swallowed: cells(20) }), ['horizon']);
    assert.strictEqual(L.Combos.blocksOf('fullblast', cells(12), plain), 12);
    assert.strictEqual(L.Combos.blocksOf('fullblast', cells(12), { w: 10, s: {} }), 12, 'a board with no rules: every cell');
    withParts([{ key: 'tcopy', order: 45, rules: (r, R) => { R.copies = 2; } }], () => {
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
      assert.deepStrictEqual(found(g, { special: 'bomb', blast: cells(19) }), [], 'two copies: 19 blocks is 9.5 on one half');
      assert.deepStrictEqual(found(g, { special: 'bomb', blast: cells(20) }), ['fullblast']);
      assert.deepStrictEqual(found(g, { special: 'blackhole', swallowed: cells(39) }), []);
      assert.deepStrictEqual(found(g, { special: 'blackhole', swallowed: cells(40) }), ['horizon']);
    });
    // A part's own count wins (here: only the left half's cells).
    withParts([{ key: 'tcopy', order: 45, rules: (r, R) => { R.copies = 2; }, engine: () => ({ comboCount: (g, id, cs) => cs.filter(([x]) => x < g.w / 2).length }) }], () => {
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
      assert.strictEqual(L.Combos.blocksOf('fullblast', cells(20), g), 10);
      assert.deepStrictEqual(found(g, { special: 'bomb', blast: cells(20) }), ['fullblast']);
      assert.deepStrictEqual(found(g, { special: 'bomb', blast: cells(10).concat(cells(9).map(([x, y, v]) => [x + 5, y + 5, v])) }), [], 'five on the left half only');
    });
  });

  test('recipe: parts run in their order, never in the order they registered; labels; the last choice wins', () => bare(() => {
    const log = [];
    const mk = (key, order) => ({ key, order, engine: () => ({ step: () => log.push(key), afterPlace: () => log.push(key + ':placed') }) });
    withParts([mk('tzz', 50), mk('taa', 10), mk('tmm', 30)], () => {
      // (The real parts loaded with the game, Mirror's and the others', sit among them by their own order.)
      const ordered = Recipe.parts();
      assert.deepStrictEqual(ordered.map((p) => p.key).filter((k) => ['core', 'taa', 'tmm', 'tzz'].includes(k)), ['core', 'taa', 'tmm', 'tzz']);
      assert(ordered.every((p, i) => i === 0 || (ordered[i - 1].order || 0) <= (p.order || 0)), 'every part in ascending order');
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
      assert.deepStrictEqual(g.ext.map((e) => [e.key, e.order]), [['taa', 10], ['tmm', 30], ['tzz', 50]]);
      g.drop();
      assert.deepStrictEqual(log, ['taa:placed', 'tmm:placed', 'tzz:placed', 'taa', 'tmm', 'tzz']);
      const plain = new Game({ w: 10, h: 20, seed: 1 });
      assert.deepStrictEqual(plain.ext, [], 'Classic and Puzzles (no recipe): no extensions');
    });
    const MODS = [
      { key: 'tmirror', order: 20, mod: 'mirror' },
      { key: 'tphysics', order: 30, mod: 'physics' },
      { key: 'ttide', order: 40, mode: 'tide', owns: ['tide'],
        normalize: (raw, out) => { if (out.mode === 'tide') out.tide = { level: ['easy', 'medium', 'hard'].includes(raw.tide && raw.tide.level) ? raw.tide.level : 'easy' }; },
        label: (r) => (r.mode === 'tide' ? 'Tide ' + r.tide.level[0].toUpperCase() + r.tide.level.slice(1) : '') },
      { key: 'tbattle', order: 50, mode: 'battle', label: (r) => (r.mode === 'battle' ? 'Battle' : ''), conflicts: (r, out) => { if (r.mode === 'battle') out['mods.mirror=true'] = 'Not in Battle'; } },
    ];
    // (A mode a real part loaded with the game brings is that part's: no stand-in for it.)
    withParts(MODS.filter((m) => !(m.mode && Recipe.parts().some((p) => p.mode === m.mode))), () => {
      assert.deepStrictEqual(clone(Recipe.DEFAULT), { v: 1, shapes: { preset: 'normal' }, mods: { mirror: false, physics: false }, mode: 'plain' });
      assert.strictEqual(Recipe.label({ mods: { mirror: true, physics: true } }), 'Mirror, Physics');
      assert.strictEqual(Recipe.label({ mods: { physics: true }, mode: 'tide', tide: { level: 'hard' } }, true), 'Physics · Tide Hard');
      assert.deepStrictEqual(Recipe.normalize({ mode: 'tide', tide: { level: 'nope' } }).tide, { level: 'easy' });
      withParts([{ key: 'tshapes', order: 10, label: () => 'Frantic' }], () => {
        assert.strictEqual(Recipe.label({ mods: { physics: true }, mode: 'tide', tide: { level: 'easy' } }, true), 'Frantic \u00b7 Physics \u00b7 Tide Easy', 'shapes, then modifiers, then the mode');
      });
      const memo = {};
      let res = Recipe.resolve({ mods: { mirror: true }, mode: 'battle' }, 'mode', memo);
      assert.strictEqual(res.recipe.mods.mirror, false, 'Battle turns Mirror off');
      assert.deepStrictEqual(res.changes, [{ path: 'mods.mirror', from: true, to: false }]);
      assert.deepStrictEqual(memo, { 'mods.mirror': true });
      assert.deepStrictEqual(Recipe.conflicts(res.recipe), { 'mods.mirror=true': 'Not in Battle' });
      res = Recipe.resolve(Object.assign(clone(res.recipe), { mode: 'plain' }), 'mode', memo);
      assert.strictEqual(res.recipe.mods.mirror, true, 'and back on once the mode allows it');
      assert.deepStrictEqual(memo, {});
    });
  }));

  test('recipe: a board keeps its recipe and its parts’ state through the save, the library and a retire; junk is made safe', () => {
    const part = {
      key: 'tkeep', order: 60, owns: ['tkeep'],
      normalize: (raw, out) => { if (Array.isArray(raw.tkeep)) out.tkeep = raw.tkeep.filter((x) => typeof x === 'string'); },
      thin: (r) => { if (r.tkeep) r.tkeep = r.tkeep.length; },
      label: (r) => (r.tkeep ? r.tkeep.length + ' kept' : ''),
      valid: (g, r) => !(r.tkeep && g.h < 12),
      summary: (x) => (x ? { steps: x.steps } : null),
      engine: (game, saved) => (game.recipe.tkeep ? { steps: saved ? saved.steps : 0, step() { this.steps++; }, save() { return { steps: this.steps }; }, summary() { return { steps: this.steps }; } } : null),
    };
    withParts([part], () => {
      const r = { tkeep: ['a', 'b', 3] };
      const g = new Game({ w: 10, h: 20, seed: 3, recipe: r });
      for (let i = 0; i < 5; i++) g.drop();
      const json = clone(g.toJSON());
      assert.deepStrictEqual(json.recipe, Recipe.normalize(r));
      assert.deepStrictEqual(json.x, { tkeep: { steps: 5 } });
      const back = new Game({ saved: clone(json) });
      assert(Recipe.equal(back.recipe, r) && back.ext[0].steps === 5, 'resumed with its recipe and its part’s state');
      back.drop();
      assert.strictEqual(back.toJSON().x.tkeep.steps, 6);
      assert.strictEqual(new Game({ w: 10, h: 20, seed: 3 }).toJSON().recipe, undefined, 'no recipe, no key: Classic and Puzzles save as before');
      assert(Library.playable(json));
      // Kept as a mode's game: parked, taken back, and made safe when it loads.
      const st = L.loadState({});
      st.free = json;
      Library.ensure(st, 1000);
      assert.deepStrictEqual(clone(st.boards.recipe), clone(Recipe.DEFAULT), 'the last choice starts as the default');
      Library.open(st, 'classic', json, 2000);
      assert.deepStrictEqual(Library.saved(st.boards, 'plain').recipe, json.recipe);
      const opened = Library.open(L.loadState(clone(st)) && st, 'plain', new Game({ w: 10, h: 20, seed: 4, recipe: { mode: 'classic' } }).toJSON(), 3000);
      assert.deepStrictEqual(opened.recipe, json.recipe);
      assert.deepStrictEqual(Library.summarize(g.s, 5000, g).ext, { tkeep: { steps: 5 } }, 'the parts’ own numbers in a summary');
      assert.deepStrictEqual(Recipe.thin(json.recipe).tkeep, 2, 'a past board keeps a thin copy');
      const junk = L.loadState(clone(st));
      junk.boards.recipe = 'junk';
      Library.ensure(junk, 6000);
      assert.deepStrictEqual(clone(junk.boards.recipe), clone(Recipe.DEFAULT));
      // Not resumed: a recipe that is not an object, a part's own check, a height the recipe does not allow, a piece no one knows.
      const bad = (f) => { const j = clone(json); f(j); return Library.playable(j); };
      assert(!bad((j) => { j.recipe = 5; }));
      assert(!bad((j) => { j.h = 10; j.cells = j.cells.slice(0, 100); }), 'the part’s check');
      assert(!bad((j) => { j.queue[0].id = 'nope'; }));
      assert(!bad((j) => { j.hold = { id: 'Q:1' }; }));
      assert(!bad((j) => { j.piece.entry.id = 'Zz'; }));
      assert(bad((j) => { j.hold = { id: 'BC:0,0;1,0' }; }), 'any id the pieces can rebuild is fine');
      const listed = L.loadState(clone(st));
      listed.boards.games.plain = { game: Object.assign(clone(json), { queue: [{ id: '??' }] }) };
      listed.free = new Game({ w: 10, h: 20, seed: 4, recipe: { mode: 'classic' } }).toJSON();
      Library.ensure(listed, 7000);
      assert(!listed.boards.games.plain, 'a game that cannot be resumed is dropped');
    });
  });

  test('recipe: each Undo step keeps the parts’ state (snap, restore); a board without Undo keeps no history', () => {
    const part = { key: 'tsnap', order: 60, rules: (r, R) => { if (r.mode === 'plain' && r.tsnapOff) R.undo = false; },
      normalize: (raw, out) => { if (raw.tsnapOff === true) out.tsnapOff = true; },
      engine: () => ({ n: 0, step() { this.n++; }, snap() { return this.n; }, restore(g, v) { this.n = v; } }) };
    withParts([part], () => {
      const g = new Game({ w: 10, h: 20, seed: 5, recipe: {} });
      g.drop(); g.drop(); g.drop();
      assert.strictEqual(g.ext[0].n, 3);
      g.undo();
      assert.strictEqual(g.ext[0].n, 2);
      g.undo(); g.drop();
      assert.strictEqual(g.ext[0].n, 2);
      const off = new Game({ w: 10, h: 20, seed: 5, recipe: { tsnapOff: true } });
      assert.strictEqual(off.rules.undo, false);
      off.drop(); off.drop();
      assert.deepStrictEqual([off.maxHistory, off.history.length, off.undo()], [0, 0, null]);
    });
  });

  test('recipe: the engine’s hooks act where they are called (dealer, spawnAt, placed, targets, refuseLock, rows, keep, clean, afterChange, allow)', () => {
    const calls = [];
    const mirror = { key: 'tmir', order: 20, engine: (game) => (game.recipe.v ? {
      placed: (g, b, abs) => { const out = abs.slice(), seen = new Set(abs.map((c) => c.join(','))); for (const [x, y] of abs) { const k = (b.w - 1 - x) + ',' + y; if (!seen.has(k)) { seen.add(k); out.push([b.w - 1 - x, y]); } } return out; },
      targets: (g, b, kind, cells) => { calls.push(kind); return cells.concat(cells.map(([x, y]) => [b.w - 1 - x, y])); },
      spawnAt: (g, b, pos) => Object.assign({}, pos, { x: 0 }),
      afterChange: (g, kind) => calls.push('change:' + kind),
      allow: (g, id) => (id === 'flip' ? 'Not on a Mirror board' : null),
    } : null) };
    withParts([mirror], () => {
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
      const p = g.piece, cells = g.absCells(p);
      assert.strictEqual(p.x, 0, 'spawnAt had the last word');
      assert.strictEqual(cells.length, p.type.size * 2, 'the piece and its reflection');
      assert.strictEqual(g.allow('flip'), 'Not on a Mirror board');
      const r = g.drop();
      assert.strictEqual(r.placed, p.type.size * 2);
      assert.strictEqual(g.board.count(), p.type.size * 2);
      assert.strictEqual(g.s.cells, p.type.size * 2);
      for (const [x, y] of r.cells) assert(g.board.get(g.w - 1 - x, y), 'mirrored on the board');
      // The copy blocks the piece: a cell right of the reflection's column is taken.
      const q = g.piece;
      const at = g.absCells(q, q.rot, q.x, q.y).map(([x, y]) => [g.w - 1 - x, y]);
      g.board.set(at[0][0], at[0][1] - 1, 0);
      // Items act in pairs: two bomb centres.
      g.board.cells.fill(0);
      fill(g, ['X.X.X.X.X.', 'XXXXXXXXX.']);
      g.replacePiece({ id: 'M1', special: 'bomb' });
      const b = g.drop();
      assert(b.centers && b.centers.length === 2 && calls.includes('bomb'));
      g.settle();
      assert(calls.includes('change:settle') || g.board.isEmpty());
    });
    // One dealer a game; a lock refused; rows that never clear; cells no item removes; a clean board that is not empty.
    let dealt = 0;
    const keeper = { key: 'tkeeper', order: 40, engine: (game) => (game.recipe.v ? {
      dealer: { next: () => (dealt++ % 2 ? 'O' : 'I'), reroll: () => 'T', candidates: () => ['O', 'I'] },
      refuseLock: (g, b, abs) => (abs.some(([, y]) => y >= 15) ? 'Too high' : null),
      rows: (g, b, rows) => rows.filter((y) => y !== 0),
      keep: (g, b, v) => !!(v & CELL.HANG),
      clean: (g, b) => b.count((v) => !(v & CELL.HANG)) === 0,
    } : null) };
    withParts([keeper], () => {
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
      assert.deepStrictEqual([g.piece.type.id].concat(g.queue.slice(0, 4).map((e) => e.id)), ['I', 'O', 'I', 'O', 'I'], 'the part’s dealer');
      assert.strictEqual(g.dealer.reroll(g, 'O'), 'T');
      const notes = [];
      g.on('refused', (n) => notes.push(n));
      fill(g, Array(15).fill('XXXXX.....'));
      g.piece = { type: Pieces.get('O'), rot: 0, x: 0, y: 15, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
      assert.strictEqual(g.lock(), false);
      assert.deepStrictEqual(notes, ['Too high']);
      g.board.cells.fill(0);
      fill(g, ['AAXXXXXX..', 'XXXXXXXX..']);
      const r = dropAt(g, 'O', 8);
      assert.deepStrictEqual(r.rows, [1], 'row 0 never clears (rows hook)');
      g.board.cells.fill(0);
      fill(g, ['AA........']);
      g.replacePiece({ id: 'M1', special: 'bomb' });
      g.piece.x = 1; g.piece.y = 3;
      g.drop();
      assert.strictEqual(g.board.get(0, 0), CELL.FOREIGN | CELL.HANG | 14, 'a bomb never takes a kept cell');
      g.board.cells.fill(0);
      fill(g, ['A.........', 'X.........', '..........']);
      g.board.set(0, 3, 1);
      g.replacePiece({ id: 'M1', special: 'drill' });
      g.piece.x = 0; g.piece.y = 4;
      const d = g.drop();
      assert.deepStrictEqual(d.drilled.map(([x, y]) => [x, y]), [[0, 3]], 'the drill stops at a kept cell');
      g.board.cells.fill(0);
      fill(g, ['XXXXXXXX..', 'XXXXXXXX..', 'AAAAAAAAAA']);
      const pc = dropAt(g, 'O', 8);
      assert.deepStrictEqual(pc.rows, [1, 2]);
      assert(pc.perfect, 'a spotless clear with only the kept cells left (clean)');
      g.board.cells.fill(0);
      fill(g, ['A.........', '..........']);
      g.board.set(0, 3, 5); g.board.set(2, 2, 6);
      assert(g.settle());
      assert.deepStrictEqual([g.board.get(0, 1), g.board.get(0, 2), g.board.get(0, 3), g.board.get(2, 0)], [CELL.FOREIGN | CELL.HANG | 14, 5, 0, 6], 'settle: kept cells stay, what is above lands on them');
    });
  });

  test('recipe: rows holding a FOREIGN cell are plain and pay only their own cells; a quad is R.quad rows', () => {
    const g = new Game({ w: 10, h: 20, seed: 2, recipe: {} });
    fill(g, ['XXXXXXXXX.', 'XXXXXXXXX.', 'XFXXXXXXX.', 'FXXXXXFXX.']);
    const r = dropAt(g, 'I', 7, 1);
    assert.deepStrictEqual([r.n, r.c, r.lines, r.plain, r.quad, r.ownCells, r.own], [2, 2, 4, 2, false, 37, 3.7]);
    assert.strictEqual(g.s.b2b, -1, 'not a quad: no streak');
    assert.strictEqual(g.s.own, 3.7);
    assert.strictEqual(g.s.lines, 4, 'lines stay rows cleared');
    assert.strictEqual(Pay.clear({ mult: 1 }, r, g.rules).pay, 3.7, 'pays its own cells: 37 of 40');
    const h = new Game({ w: 10, h: 20, seed: 2, recipe: {} });
    fill(h, Array(4).fill('XXXXXXXXX.'));
    const q = dropAt(h, 'I', 7, 1);
    assert.deepStrictEqual([q.n, q.c, q.quad, q.own, h.s.b2b], [4, 0, true, 4, 0]);
    withParts([{ key: 'tbigq', order: 10, rules: (rc, R) => { R.u = 2; R.E = 16; } }], () => {
      const b = new Game({ w: 10, h: 20, seed: 2, recipe: {} });
      assert.strictEqual(b.rules.quad, 8);
      fill(b, Array(4).fill('XXXXXXXXX.'));
      const x = dropAt(b, 'I', 7, 1);
      assert.deepStrictEqual([x.n, x.quad, b.s.b2b, b.s.quadRun], [4, false, -1, 0], 'four rows of big blocks are two big lines, not a quad');
      assert.strictEqual(Pay.clear({ mult: 1 }, x, b.rules).pay, 1, 'f = 1/4: four rows pay one Standard line');
    });
  });

  test('recipe: an unrated board has no difficult clears: four rows keep no streak, a twist is no link, pay is own × lk at ×1', () => {
    withParts([{ key: 'tunr', order: 10, rules: (rc, R) => { R.rated = false; R.E = 5; } }], () => {
      const g = new Game({ w: 10, h: 20, seed: 2, recipe: {} });
      assert.deepStrictEqual([g.rules.rated, g.rules.quad, g.rules.lk], [false, 4, 0.8]);
      for (let i = 0; i < 12; i++) {
        g.board.cells.fill(0);
        fill(g, ['X.........'].concat(Array(4).fill('XXXXXXXXX.')));
        const r = dropAt(g, 'I', 7, 1);
        assert.deepStrictEqual([r.n, r.quad, r.b2b, g.s.b2b, g.s.quadRun, g.s.hb2b], [4, false, false, -1, 0, -1], 'lock ' + i);
        assert.strictEqual(r.score, 800 + 50 * i, 'the rows’ points and the combo, never ×1.5');
        g.s.mult = Pay.mult(g);
        assert.strictEqual(g.s.mult, 1);
        assert.strictEqual(Pay.clear({ mult: g.s.mult }, r, g.rules).pay, 3.2, 'own × lk: no difficult bonus');
        assert.strictEqual(Pay.clear({ mult: 1 }, r, g).pay, 3.2, 'from the game too');
      }
      const t = new Game({ w: 10, h: 20, seed: 4, recipe: {} });
      t.board.cells.fill(0);
      fill(t, ['....X.....', 'XX...XXXXX', 'XXX.XXXXXX']);
      t.replacePiece({ id: 'T' });
      Object.assign(t.piece, { rot: 2, x: 2, y: 0, lastRot: true });
      const r = t.lock();
      assert(r.twist && r.lines === 2 && !r.b2b && t.s.b2b === -1, 'a twist scores its points and is no link');
      assert.strictEqual(r.score, 1200);
      assert.strictEqual(Pay.clear({ mult: 1 }, r, t.rules).pay, 1.6);
    });
    // Rated (the default): the same four rows are a quad, a link and a bonus, as always.
    const d = new Game({ w: 10, h: 20, seed: 2, recipe: {} });
    fill(d, Array(4).fill('XXXXXXXXX.'));
    const q = dropAt(d, 'I', 7, 1);
    assert.deepStrictEqual([q.quad, d.s.b2b, Pay.clear({ mult: 1 }, q, d.rules).pay], [true, 0, 5]);
  });

  test('recipe: the parts’ controllers compose over the plain one in order (Recipe.compose)', () => {
    const log = [];
    const plain = { id: 'plain', view: 'single', timed: false, frame() { log.push('plain.frame'); }, pause() {}, counts: () => true, onLock: (r) => log.push('plain.lock:' + r), onEnd: () => 'full',
      cards: { full: () => 'Board full' }, status: (parts) => [parts.lines, parts.score], tiles: () => [], onKey: () => false, action: () => false, input: (kind, v) => v, attach() { log.push('plain.attach'); }, detach() {} };
    assert.strictEqual(Recipe.compose(plain, []), plain, 'no part’s: plain itself');
    const mirror = { key: 'mirror', input: (kind, v) => (kind === 'aim' ? 9 - v : kind === 'tap' && v === 'left' ? null : v), attach() { log.push('mirror.attach'); } };
    const tide = { key: 'tide', tides: 3, onEnd(kind) { return kind === 'ebbed' ? 'ebbed ' + this.tides : this.base.onEnd(kind); },
      onLock(r) { this.base.onLock(r); log.push('tide.lock'); this.tides--; }, status(parts, o) { return o.prev.slice(0, 1).concat(['Tides ' + this.tides]); },
      tiles: () => [['3', 'Waves']], cards: { ebbed: () => 'Ebbed' }, onKey: (e) => e === 'w', frame() { log.push('tide.frame'); } };
    const physics = { id: 'physics', tiles: () => [['2', 'Cascades']], input: (kind, v) => (kind === 'aim' ? v + 100 : v), key(e) { return e === 'j'; } };
    const ctl = Recipe.compose(plain, [{ part: 'mirror', ctl: mirror }, tide, physics]);
    assert.strictEqual(typeof ctl.onKey, 'function', 'a string key is a name, never the key hook');
    assert.strictEqual(ctl.id, 'physics');
    assert.deepStrictEqual([ctl.onKey('w'), ctl.onKey('j'), ctl.onKey('x')], [true, true, false], 'asked in turn; a function key is onKey');
    assert.strictEqual(ctl.input('aim', 2), 107, 'input chained in order: Mirror’s answer goes to Physics');
    assert.strictEqual(ctl.input('tap', 'left'), null, 'a tap taken (null) ends it');
    assert.strictEqual(ctl.input('tap', 'right'), 'right');
    assert.deepStrictEqual(ctl.tiles(), [['3', 'Waves'], ['2', 'Cascades']], 'tiles joined');
    assert.deepStrictEqual(ctl.status({ lines: 'L', score: 'S' }, {}), ['L', 'Tides 3'], 'status gets the list before it');
    assert.deepStrictEqual(Object.keys(ctl.cards).sort(), ['ebbed', 'full']);
    ctl.attach(); ctl.frame();
    ctl.onLock('r');
    assert.deepStrictEqual(log, ['plain.attach', 'mirror.attach', 'plain.frame', 'tide.frame', 'plain.lock:r', 'tide.lock'], 'run for every part, earlier first; a replaced hook reaches the one before as this.base');
    assert.strictEqual(ctl.tides, 2, 'a part’s state lives on the one controller');
    assert.deepStrictEqual([ctl.onEnd('ebbed'), ctl.onEnd('full')], ['ebbed 2', 'full']);
    assert.strictEqual(typeof ctl.base.onLock, 'function', 'outside a hook, base is the plain controller');
    assert.strictEqual(ctl.base.id, 'plain');
    withParts([{ key: 'tc1', order: 70, controller: (play, game) => (game.recipe.v ? { id: 'a' } : null) }, { key: 'tc0', order: 60, controller: () => ({ id: 'b' }) }], () => {
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
      assert.deepStrictEqual(Recipe.controllers(null, g).map((c) => c.part + ':' + c.ctl.id), ['tc0:b', 'tc1:a'], 'every part’s, in order');
      assert.strictEqual(Recipe.controller(null, g).id, 'b');
    });
  });

  test('recipe: Tornado’s columns go through the parts (columns), drawn on the game’s stream as before; a bad order is ignored', () => {
    const mirrorCols = (g, b, kind, order) => {
      // The left half shuffled as drawn (its own columns, in the order they came), the right half its mirror.
      const W = order.length, half = Math.floor(W / 2), left = order.filter((c) => c < half);
      const out = order.slice();
      left.forEach((c, i) => { out[i] = c; out[W - 1 - i] = W - 1 - c; });
      return out;
    };
    const seen = [];
    withParts([{ key: 'tcols', order: 20, engine: () => ({ columns: mirrorCols, afterChange: (g, kind, what) => seen.push(kind + ':' + (what && what.order ? what.order.length : '-')) }) }], () => {
      for (let seed = 1; seed <= 30; seed++) {
        const g = new Game({ w: 10, h: 20, seed, recipe: {} });
        fill(g, ['X........X', 'XX......XX', '.X..XX..X.']);
        g.piece.y = 15;
        assert(g.tornado(), 'seed ' + seed);
        for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) assert.strictEqual(!!g.board.get(x, y), !!g.board.get(9 - x, y), 'still symmetric, seed ' + seed);
      }
    });
    assert(seen.length === 30 && seen.every((k) => k === 'tornado:10'), 'afterChange hears the order');
    // The stream is drawn as always: a part that keeps the order changes nothing.
    const a = new Game({ w: 10, h: 20, seed: 7, recipe: {} }), b0 = new Game({ w: 10, h: 20, seed: 7 });
    withParts([{ key: 'tbad', order: 20, engine: () => ({ columns: () => [0, 0, 1] }) }], () => {
      const b = new Game({ w: 10, h: 20, seed: 7, recipe: {} });
      for (const g of [a, b, b0]) { fill(g, ['XXXX......', 'X.X.X.X.X.']); g.piece.y = 15; }
      const ma = a.tornado(), mb = b.tornado(), m0 = b0.tornado();
      assert.deepStrictEqual(mb, ma, 'a bad order is ignored');
      assert.deepStrictEqual(m0, ma);
      assert.deepStrictEqual(Array.from(b.board.cells), Array.from(a.board.cells));
    });
  });

  test('recipe: a drill’s rows the recipe fills (its cascades) clear and are scored as plain; a plain drill scores nothing', () => {
    const plain = new Game({ w: 10, h: 20, seed: 3, recipe: {} });
    fill(plain, ['XXXXX.XXXX', 'XXXXXXXXX.']);
    Object.assign(plain.s, { combo: 2 });
    plain.replacePiece({ id: 'M1', special: 'drill' });
    plain.piece.x = 3; plain.piece.y = 10;
    const d = plain.drop();
    assert.deepStrictEqual([d.lines, d.rows, d.removed, d.score, plain.s.combo, plain.s.lines, d.bits], [0, [], [], 0, 2, 0, undefined], 'as before: nothing scored, the combo kept');
    const calls = [];
    const cascader = { key: 'tcas', order: 30, engine: () => ({
      afterClear(g, b, res) {
        calls.push('afterClear:' + res.special);
        // A lump the drill left hanging falls into the hole under it and fills row 0: one cascade wave.
        if (res.special === 'drill' && b.get(6, 2)) { b.set(6, 2, 0); b.set(3, 0, 4); const row = b.fullRows(); res.cascade = [{ rows: row, removed: b.clearRows(row) }]; }
      },
      afterChange(g, kind, what) { calls.push('afterChange:' + kind + ':' + (what && what.special)); },
    }) };
    withParts([cascader], () => {
      const g = new Game({ w: 10, h: 20, seed: 3, recipe: {} });
      fill(g, ['......X...', '.X.X......', 'XXX.XXXXXX']);
      g.replacePiece({ id: 'M1', special: 'drill' });
      g.piece.x = 3; g.piece.y = 12;
      const r = g.drop();
      assert.deepStrictEqual(calls, ['afterClear:drill', 'afterChange:bore:drill']);
      assert.deepStrictEqual([r.lines, r.c, r.n, r.own, r.quad, g.s.lines, g.s.own, g.s.combo], [1, 1, 0, 1, false, 1, 1, 0], 'one plain row, counted and scored');
      assert.strictEqual(r.score, 100);
      assert.strictEqual(Pay.clear({ mult: 1 }, r, g.rules).pay, 1);
    });
    // Two bits (targets): both are in the result for the view.
    withParts([{ key: 'tbits', order: 20, engine: () => ({ targets: (g, b, kind, cells) => (kind === 'bore' ? cells.concat(cells.map(([x, y]) => [b.w - 1 - x, y])) : cells) }) }], () => {
      const g = new Game({ w: 10, h: 20, seed: 3, recipe: {} });
      g.replacePiece({ id: 'M1', special: 'drill' });
      g.piece.x = 2; g.piece.y = 10;
      assert.deepStrictEqual(g.drop().bits, [[2, 10], [7, 10]]);
    });
  });

  test('recipe: a part ends a board (Game.end): after the lock, kept in the save, taken back by Undo and a reset', () => {
    const ebb = { key: 'tebb', order: 40, engine: (game, saved, o) => ({ n: saved ? saved.n : 0, seen: { rng: typeof game.rng, seed: game.seed, o: o && o.previewCount, recipe: !!game.recipe },
      step(g) { if (++this.n === 3) g.end('ebbed'); }, save() { return { n: this.n }; }, snap() { return this.n; }, restore(g, v) { this.n = v; } }) };
    withParts([ebb], () => {
      const g = new Game({ w: 10, h: 20, seed: 11, recipe: {}, previewCount: 4 });
      assert.deepStrictEqual(g.ext[0].seen, { rng: 'object', seed: 11, o: 4, recipe: true }, 'engine() sees the stream, the seed and the options');
      const ev = [];
      g.on('lock', () => ev.push('lock')); g.on('topout', () => ev.push('topout:' + g.endKind)); g.on('spawn', () => ev.push('spawn'));
      g.drop(); g.drop();
      ev.length = 0;
      g.drop();
      assert.deepStrictEqual(ev, ['lock', 'topout:ebbed'], 'the end comes after the lock, and no piece');
      assert(g.over && g.piece === null);
      const json = JSON.parse(JSON.stringify(g.toJSON()));
      assert.strictEqual(json.ended, 'ebbed');
      const back = new Game({ saved: json });
      assert.deepStrictEqual([back.over, back.endKind, back.piece, back.queue.map((e) => e.id).join()], [true, 'ebbed', null, g.queue.map((e) => e.id).join()], 'comes back ended, no piece dealt');
      g.undo();
      assert.deepStrictEqual([g.over, g.endKind, !!g.piece, g.toJSON().ended], [false, null, true, undefined], 'Undo takes it back');
      g.drop();
      assert(g.over && g.endKind === 'ebbed');
      g.resetBoard();
      assert.deepStrictEqual([g.over, g.endKind, !!g.piece], [false, null, true]);
      // A drill that ends the board spawns nothing either.
      const d = new Game({ w: 10, h: 20, seed: 11, recipe: {} });
      d.ext[0].n = 2;
      d.replacePiece({ id: 'M1', special: 'drill' });
      const e2 = [];
      d.on('topout', () => e2.push('topout')); d.on('spawn', () => e2.push('spawn')); d.on('lock', () => e2.push('lock'));
      d.drop();
      assert.deepStrictEqual([e2, d.piece, d.endKind], [['lock', 'topout'], null, 'ebbed']);
      // Called outside a step: at once.
      const n = new Game({ w: 10, h: 20, seed: 11, recipe: {} }), e3 = [];
      n.on('topout', () => e3.push(n.endKind));
      n.end('closed');
      assert.deepStrictEqual(e3, ['closed']);
    });
    const plain = new Game({ w: 10, h: 20, seed: 11, recipe: {} });
    assert(!('ended' in plain.toJSON()) && plain.seed === 11, 'nothing more saved for a plain board');
  });

  test('recipe: a full board’s last piece stays where the parts put it (spawnAt), inside the walls', () => {
    withParts([{ key: 'tspl', order: 20, engine: () => ({ spawnAt: (g, b, pos) => Object.assign({}, pos, { x: 0 }) }) }], () => {
      for (const findRoom of [true, false]) {
        const g = new Game({ w: 10, h: 20, seed: 1, recipe: {}, findRoom });
        for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if ((x + y) % 3) g.board.set(x, y, 1);
        g.spawnNext();
        assert(g.over, 'full');
        const at = g.spawnPosition(g.piece.type, g.piece.rot);
        assert.strictEqual(g.piece.x, Math.max(at.x, -g.piece.type.rotBounds[g.piece.rot].minX), 'findRoom ' + findRoom);
      }
    });
  });

  test('recipe: simulate is Best Fit’s one path, and Best Fit picks as it always did (500 positions)', () => {
    // Best Fit as it was (js/engine.js before the recipe), verbatim.
    const oldBest = (g) => {
      const b = g.board, W = g.w, H = g.h;
      const heights = (cells) => { const hs = []; for (let x = 0; x < W; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if (cells[y * W + x]) { t = y + 1; break; } hs.push(t); } return hs; };
      const holes = (cells) => { let n = 0; for (let x = 0; x < W; x++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (cells[y * W + x]) roof = true; else if (roof) n++; } } return n; };
      const holes0 = holes(b.cells);
      let best = null;
      for (const id of Pieces.TETROMINOES) {
        const type = Pieces.get(id), seen = new Set();
        for (let rot = 0; rot < 4; rot++) {
          const cells = type.rots[rot], key = Pieces.keyOf(cells);
          if (seen.has(key)) continue;
          seen.add(key);
          const bnd = type.rotBounds[rot];
          const top = H - 1 - bnd.maxY;
          for (let x = -bnd.minX; x <= W - 1 - bnd.maxX; x++) {
            if (!b.fits(cells, x, top)) continue;
            let y = top;
            while (b.fits(cells, x, y - 1)) y--;
            const t = b.clone();
            t.place(cells, x, y, type.color);
            const lines = t.fullRows().length;
            t.clearRows(t.fullRows());
            const hs = heights(t.cells), bump = hs.slice(1).reduce((a, h, i) => a + Math.abs(h - hs[i]), 0);
            const cost = -lines * 1000 + (holes(t.cells) - holes0) * 60 + Math.max(...hs) * 4 + hs.reduce((a, h) => a + h, 0) * 0.5 + bump;
            if (!best || cost < best.cost) best = { cost, id, rot, x, y, top };
          }
        }
      }
      return best;
    };
    const rng = new RNG('bestfit');
    for (let i = 0; i < 500; i++) {
      const w = 4 + rng.int(17), h = 8 + rng.int(12), g = new Game({ w, h, seed: i, recipe: {} });
      const tall = rng.int(h - 2);
      for (let x = 0; x < w; x++) { const top = rng.int(tall + 1); for (let y = 0; y < top; y++) if (rng.chance(0.8)) g.board.set(x, y, 1 + rng.int(7)); }
      g.board.clearRows(g.board.fullRows());
      const want = oldBest(g), got = g.bestFit();
      assert.deepStrictEqual(got, want, 'position ' + i + ' (' + w + 'x' + h + ')');
    }
    const g = new Game({ w: 10, h: 20, seed: 1, recipe: {} });
    fill(g, ['XXXXXXXXX.', 'XXXXXXXXX.']);
    const sim = g.simulate(Pieces.get('I'), 1, 7);
    assert.deepStrictEqual([sim.n, sim.c, sim.placed, sim.y], [2, 0, 4, 0]);
    assert.strictEqual(g.board.count(), 18, 'on a copy: the board is as it was');
    assert.strictEqual(sim.board.count(), 2);
    assert.strictEqual(g.simulate(Pieces.get('I'), 0, 20), null, 'no room at the top');
  });

  test('recipe: inject, takeCurrent and takeNext (received pieces first, never held or taken)', () => {
    const g = new Game({ w: 10, h: 20, seed: 7, recipe: {} });
    const q0 = g.queue.map((e) => e.id), cur = g.piece.type.id;
    g.inject('T', { received: true });
    g.inject('S', { received: true });
    assert.deepStrictEqual(g.queue.slice(0, 3).map((e) => e.id), ['T', 'S', q0[0]], 'first in, first out');
    const took = g.takeCurrent();
    assert.strictEqual(took.id, cur);
    assert.strictEqual(g.piece.type.id, 'T');
    assert(g.piece.entry.received);
    assert.strictEqual(g.takeCurrent(), null, 'a received piece is not sent on');
    assert.strictEqual(g.holdPiece(), false, 'nor held');
    assert.strictEqual(g.takeNext(), null, 'the received piece next in line stays too');
    g.drop();
    g.drop();
    const next = g.queue[0].id, e = g.takeNext();
    assert.strictEqual(e.id, next);
    assert(g.queue.length >= 6, 'the queue fills up behind it');
    // No room for the next piece: nothing changes.
    const f = new Game({ w: 10, h: 20, seed: 7, recipe: {} });
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (!f.absCells(f.piece).some(([cx, cy]) => cx === x && cy === y)) f.board.set(x, y, 1);
    const before = JSON.stringify(f.toJSON());
    assert.strictEqual(f.takeCurrent(), null);
    assert.strictEqual(JSON.stringify(f.toJSON()), before);
  });

  test('recipe: on a default board worth is scale and own is lines, at every width from 4 to 20', () => {
    for (let w = 4; w <= 20; w++) {
      const g = new Game({ w, h: 16, seed: w, recipe: {} }), rng = new RNG('own' + w);
      assert.strictEqual(Library.worth(g), Library.scale(w));
      for (let i = 0; i < 150 && !g.over; i++) {
        const k = rng.int(20);
        if (k === 0) g.settle(); else if (k === 1) g.setSpecial('laser'); else if (k === 2) g.setSpecial('bomb'); else if (k === 3 && g.history.length) g.undo();
        if (g.over || !g.piece) break;
        if (rng.chance(0.6)) g.rotate(rng.chance(0.5) ? 1 : -1);
        for (let m = rng.int(w) - Math.floor(w / 2), j = 0; j < Math.abs(m); j++) g.move(Math.sign(m));
        g.drop();
        assert.strictEqual(g.s.own, g.s.lines, w + ' wide, piece ' + i);
      }
      assert(g.s.lines > 0 || g.over, w + ' wide cleared something');
    }
  });

  test('cells: one table of bits; outside the board is a WALL that is never stored; flags never change colours, scores or saves', () => {
    const bits = ['GEM', 'HIDDEN', 'FOREIGN', 'HANG', 'STONE', 'FILL', 'WALL'].map((k) => CELL[k]);
    assert.strictEqual(bits.concat([CELL.SHOT, CELL.COLOR, 8192]).reduce((a, b) => a + b, 0), 0xffff, 'all 16 bits, each once (8192 free)');
    assert.strictEqual(CELL.SHOT >> CELL.SHOT_SHIFT, 7);
    const b = new Board(6, 6);
    for (const [x, y] of [[-1, 0], [6, 0], [0, -1], [0, 6], [-5, 9]]) {
      assert.strictEqual(b.get(x, y), CELL.WALL);
      assert.strictEqual(b.get(x, y) & (CELL.FOREIGN | CELL.HANG | CELL.STONE | CELL.SHOT | CELL.FILL), 0);
      assert(b.filled(x, y));
    }
    b.set(-1, 0, 5);
    assert.strictEqual(b.count(), 0, 'nothing is stored outside');
    const wrap = new Board(6, 6, { wrap: true });
    wrap.set(5, 0, 3);
    assert.strictEqual(wrap.get(-1, 0), 3, 'a wraparound board has no side walls');
    // Every stored flag on a cell: the colour reads the same, the row clears as its own.
    const flags = CELL.GEM | CELL.HIDDEN | CELL.SHOT | CELL.FILL;
    const plain = [1, 2, 3, 4, 5, 6, 7, 8, 9, 15], flagged = plain.map((v) => v | flags);
    assert(flagged.every((v, i) => (v & CELL.COLOR) === plain[i]));
    assert.strictEqual((CELL.FOREIGN | CELL.HANG) & CELL.COLOR, 0, 'a rod has no colour');
    const g = new Game({ w: 10, h: 20, seed: 3, recipe: {} });
    for (let x = 0; x < 9; x++) g.board.set(x, 0, 3 | (flags & ~CELL.HIDDEN));
    const r = dropAt(g, 'I', 7, 1);
    assert.deepStrictEqual([r.n, r.c, r.own, r.score], [1, 0, 1, 100]);
    assert.deepStrictEqual(L.Combos.detect({ lines: 1, n: 1, quad: false, removed: [Array(10).fill(3 | CELL.GEM)] }, g), ['painted'], 'Painted Row reads colours');
    // Nothing a game does stores a WALL.
    const p = new Game({ w: 6, h: 10, seed: 4, recipe: {} });
    for (let i = 0; i < 60 && !p.over; i++) { p.move(i % 3 - 1); p.drop(); }
    assert(Array.from(p.board.cells).every((v) => !(v & CELL.WALL)));
  });

  test('board: fitsAbs, inBoundsAbs, placeCells, and compact with cells that never move', () => {
    const b = new Board(5, 5);
    b.placeCells([[0, 0], [1, 0], [4, 4]], 2);
    assert.deepStrictEqual([b.get(0, 0), b.get(1, 0), b.get(4, 4), b.count()], [2, 2, 2, 3]);
    assert(b.fitsAbs([[2, 0], [3, 1]]) && !b.fitsAbs([[1, 0]]) && !b.fitsAbs([[5, 0]]) && !b.fitsAbs([[0, -1]]));
    assert(b.inBoundsAbs([[1, 0], [4, 4]]) && !b.inBoundsAbs([[-1, 2]]));
    assert.strictEqual(b.fitsAbs([[2, 0], [3, 0]]), b.fits([[0, 0], [1, 0]], 2, 0));
    const c = new Board(3, 6);
    c.set(0, 1, CELL.FOREIGN | CELL.HANG | 14); c.set(0, 4, 5); c.set(1, 5, 6); c.set(2, 3, 7);
    c.compact((v) => !!(v & CELL.HANG));
    assert.deepStrictEqual([c.get(0, 1), c.get(0, 2), c.get(0, 4), c.get(1, 0), c.get(2, 0)], [CELL.FOREIGN | CELL.HANG | 14, 5, 0, 6, 7]);
    const d = new Board(3, 6);
    d.set(0, 4, 5); d.compact();
    assert.strictEqual(d.get(0, 0), 5);
  });

  test('pieces: get rebuilds doubled and drawn shapes from their ids alone; resolvers; a colour from a key', () => {
    const ids = ['BT', 'BC:0,0;1,0;2,0;2,1', 'C:0,0;0,1;1,1', 'BBO', 'M:0,0;1,0;1,1', 'BM:0,0;1,0;1,1'];
    const cellsOf = (id) => Pieces.keyOf(Pieces.get(id).rots[0]);
    const want = ids.map(cellsOf);
    for (const id of Object.keys(Pieces.TYPES)) Pieces.evict(id);
    assert(Pieces.TETROMINOES.concat(Pieces.PENTOMINOES, ['M1', 'D2', 'I3', 'V3']).every((id) => Pieces.TYPES[id]), 'built-in shapes stay');
    assert(!Pieces.TYPES.BT && !Pieces.TYPES['BC:0,0;1,0;2,0;2,1'], 'made ones went');
    assert.deepStrictEqual(ids.map(cellsOf), want, 'rebuilt the same');
    assert.strictEqual(Pieces.get('BC:0,0;1,0;2,0;2,1').size, 16);
    assert.strictEqual(Pieces.get('BBO').size, 64, 'doubled twice');
    assert.strictEqual(Pieces.get('Bnope'), null);
    assert.strictEqual(Pieces.get('Q:1,2'), null, 'no resolver, no type');
    Pieces.resolver('Q', (rest, id) => Pieces.defineType && (Pieces.TYPES[id] = Pieces.defineType(id, [[0, 0], [Number(rest), 0]], { color: Pieces.hashColor(id) })));
    assert.strictEqual(Pieces.get('Q:1').size, 2);
    assert.strictEqual(Pieces.get('BQ:1').size, 8, 'doubled through the resolver');
    for (const k of ['a', 'P:0,0;1,0', 'K:x', '']) { const c = Pieces.hashColor(k); assert(c >= 9 && c <= 14 && c === Pieces.hashColor(k)); }
  });

  test('pieces: every made type dropped mid-game changes nothing: the game plays on, saves and resumes the same', () => {
    const g = new Game({ w: 10, h: 20, seed: 8, recipe: {} });
    g.replacePiece({ id: Pieces.bigOf('T').id });
    g.inject('C:0,0;1,0;2,0;1,1');
    g.inject('BC:0,0;1,0');
    for (const id of Object.keys(Pieces.TYPES)) Pieces.evict(id);
    const twin = new Game({ saved: clone(g.toJSON()) });
    for (const x of [g, twin]) { for (let i = 0; i < 4; i++) { for (const id of Object.keys(Pieces.TYPES)) Pieces.evict(id); x.drop(); } }
    assert.deepStrictEqual(twin.toJSON(), g.toJSON());
    assert.deepStrictEqual([g.s.byType.big, g.s.byType.custom, g.s.pieces], [2, 1, 4], 'the Giant, the doubled domino and the drawn shape were played');
  });

  test('store: a part’s stats defaults are in a new save, and never over one already there', () => {
    withParts([{ key: 'tstats', order: 60, stats: { free: { ttide: { waves: 0, best: { easy: 0 } } }, tbattle: { rounds: 0 }, timeMs: { tbattle: 0 } } }], () => {
      const st = L.defaultState();
      assert.deepStrictEqual(st.stats.free.ttide, { waves: 0, best: { easy: 0 } });
      assert.deepStrictEqual([st.stats.tbattle, st.stats.timeMs.tbattle, st.stats.timeMs.total], [{ rounds: 0 }, 0, 0]);
      const loaded = L.loadState({ v: 1, stats: { tbattle: { rounds: 7 } } });
      assert.strictEqual(loaded.stats.tbattle.rounds, 7);
      assert.strictEqual(loaded.stats.free.ttide.waves, 0);
      st.stats.free.ttide.waves = 3;
      assert.strictEqual(L.defaultState().stats.free.ttide.waves, 0, 'each save its own copy');
    });
    assert.strictEqual(L.defaultState().stats.tbattle, undefined);
  });

  test('achievements: the feats count where R.feats does; a part’s group, and one that says where it counts', () => {
    const A = L.Achievements;
    const on = (g, r) => ({ mode: 'play', r: Object.assign({ lines: 4, n: 4, quad: true, hand: true, combo: 0 }, r), g });
    assert.deepStrictEqual(A.check(L.defaultState(), on(new Game({ w: 10, h: 20, seed: 1, recipe: {} }))).map((a) => a.id), ['quad']);
    withParts([{ key: 'tnofeat', order: 30, rules: (r, R) => { R.noFeats = true; } }], () => {
      const g = new Game({ w: 12, h: 20, seed: 1, recipe: {} });
      assert.deepStrictEqual(A.check(L.defaultState(), on(g)).map((a) => a.id), [], 'no feats on this board');
      g.s.lines = g.s.own = 1500;
      assert(A.check(L.defaultState(), on(g)).some((a) => a.id === 'lines150'), 'the line counts still count');
    });
    const n0 = A.LIST.length, g0 = A.GROUPS.length;
    try {
      A.group({ id: 'tgrp', name: 'Test', icon: 'play', note: 'Test note.', list: [
        { id: 't_any', name: 'Anywhere', desc: 'x', pay: 1, on: 'play', counts: (r, g) => g.w === 4, test: () => true },
        { id: 't_feat', name: 'Feat', desc: 'x', pay: 1, on: 'play', test: () => true },
      ] });
      // After Free Play, and after the groups the board options loaded with the game have put there (Descent's, Battle's).
      const at = A.GROUPS.findIndex((x) => x.id === 'tgrp'), play = A.GROUPS.findIndex((x) => x.id === 'play');
      assert(at > play && A.GROUPS.slice(play + 1, at).every((x) => x.part), 'after Free Play');
      assert.deepStrictEqual(A.check(L.defaultState(), on(new Game({ w: 4, h: 8, seed: 1, recipe: {} }), { quad: false, lines: 0 })).map((a) => a.id), ['t_any'], 'its own rule, not the feats’');
      assert.deepStrictEqual(A.check(L.defaultState(), on(new Game({ w: 10, h: 20, seed: 1, recipe: {} }), { quad: false, lines: 0 })).map((a) => a.id), ['t_feat']);
      assert.strictEqual(A.groupOf(A.LIST.find((a) => a.id === 't_any')).id, 'tgrp');
    } finally {
      A.LIST.splice(n0); A.GROUPS.splice(A.GROUPS.findIndex((x) => x.id === 'tgrp'), 1);
    }
    assert.strictEqual(A.GROUPS.length, g0);
  });

  test('golden: a default board plays exactly as boards did before the recipe (scripts/golden.cjs)', () => {
    const out = require('child_process').spawnSync(process.execPath, [require('path').join(__dirname, 'golden.cjs')], { encoding: 'utf8' });
    assert.strictEqual(out.status, 0, (out.stdout || '') + (out.stderr || ''));
  });
}

console.log('play menu');
{
  const { Library, Recipe: R, Menu } = L;
  const mk = (recipe, w, h, seed, n) => { const g = new Game({ w, h, recipe: R.normalize(recipe), seed }); for (let i = 0; i < (n || 0); i++) g.drop(); return g; };
  test('Solo and Multiplayer: Race and Battle boards are Multiplayer, every other board (and a broken recipe) Solo', () => {
    assert.deepStrictEqual(['race', 'battle'].map((m) => Library.side(R.normalize({ mode: m }))), ['multi', 'multi']);
    assert.deepStrictEqual(['plain', 'classic', 'descent', 'mural'].map((m) => Library.side(R.normalize({ mode: m }))), ['solo', 'solo', 'solo', 'solo']);
    assert.strictEqual(Library.side(R.normalize({ shapes: { preset: 'tiny' }, mods: { mirror: true } })), 'solo');
    assert.strictEqual(Library.side(null), 'solo');
    assert.strictEqual(Library.side('race'), 'solo');
    // A past board's thin recipe says the same.
    assert.strictEqual(Library.side(R.thin(R.normalize({ mode: 'battle' }))), 'multi');
    // The menu's two lists are the same split.
    assert.deepStrictEqual(Menu.SOLO.map((x) => x.mode), ['plain', 'classic', 'descent', 'mural']);
    assert.deepStrictEqual(Menu.MULTI.map((x) => x.mode), ['race', 'battle']);
    assert(Menu.SOLO.every((x) => Library.side(R.normalize({ mode: x.mode })) === 'solo') && Menu.MULTI.every((x) => Library.side(R.normalize({ mode: x.mode })) === 'multi'));
  });
  test('Continue is offered for a game something was played on (a piece set, or it ended); a fresh one is started over', () => {
    const fresh = mk({}, 10, 20, 7, 0), one = mk({}, 10, 20, 8, 1);
    assert.deepStrictEqual([Menu.played(null), Menu.played(fresh.toJSON()), Menu.played(one.toJSON())], [false, false, true]);
    const full = fresh.toJSON(); full.over = true;
    const ended = fresh.toJSON(); ended.ended = 'cleared';
    assert(Menu.played(full) && Menu.played(ended));
  });
  test('a mode\'s setup: its own last one, else its settings from the Custom window, at its own size; no modifiers; kept in the save', () => {
    const B = Library.blank();
    assert.deepStrictEqual(B.menu, {});
    const race = Menu.setupOf(B, 'race');
    assert.strictEqual(race.recipe.mode, 'race');
    assert.deepStrictEqual(race.size, { w: 10, h: 10 });
    assert.deepStrictEqual(Menu.setupOf(B, 'battle').size, { w: 10, h: 14 });
    assert.deepStrictEqual(Menu.setupOf(B, 'classic').size, { w: 10, h: 20 });
    B.recipe = R.normalize({ mode: 'classic', classic: { level: 7 }, mods: { mirror: true }, shapes: { preset: 'tiny' } });
    const cl = Menu.setupOf(B, 'classic');
    assert.strictEqual(cl.recipe.classic.level, 7, 'its settings from the Custom window');
    assert(!R.MODS.some((k) => cl.recipe.mods[k]) && cl.recipe.shapes.preset === 'normal', 'no modifiers, Normal shapes');
    B.menu.classic = { recipe: R.normalize({ mode: 'classic', classic: { level: 3 } }), size: { w: 10, h: 20 } };
    assert.strictEqual(Menu.setupOf(B, 'classic').recipe.classic.level, 3, 'the menu\'s own last setup');
    B.menu.plain = { recipe: R.normalize({ shapes: { preset: 'frantic' } }), size: { w: 16, h: 16 } };
    const p = Menu.setupOf(B, 'plain');
    assert.strictEqual(p.recipe.shapes.preset, 'frantic');
    assert.deepStrictEqual(p.size, { w: 16, h: 16 });
    B.menu.mural = { recipe: { mode: 'classic' }, size: { w: 99, h: 1 } };
    const mu = Menu.setupOf(B, 'mural');
    assert.strictEqual(mu.recipe.mode, 'mural', 'junk is made safe');
    assert(R.sizeOk(mu.size.w, mu.size.h, mu.recipe));
    // Through a save: ensure keeps it, and drops what is not a setup.
    const st = L.loadState({});
    st.boards = { menu: { race: { recipe: race.recipe, size: race.size }, junk: 3 } };
    Library.ensure(st, 1000);
    assert.deepStrictEqual(Object.keys(st.boards.menu), ['race']);
    st.boards.menu = 'bad';
    Library.ensure(st, 1000);
    assert.deepStrictEqual(st.boards.menu, {});
  });
  test('Race and Battle setups: an opponent and Standard or Frantic (Standard first, the last choice kept); never a set (each new game draws one); a kept game\'s set in words', () => {
    const B = Library.blank();
    for (const m of ['race', 'battle']) {
      assert.deepStrictEqual(Menu.setupOf(B, m).recipe[m], { level: 'steady', tempo: 'standard' }, m + ': Standard first');
      B.menu[m] = { recipe: R.normalize({ mode: m, [m]: { level: 'brisk', tempo: 'frantic', set: 'f1' }, shapes: { preset: 'frantic' } }), size: { w: 8, h: 8 } };
      const su = Menu.setupOf(B, m);
      assert.deepStrictEqual(su.recipe[m], { level: 'brisk', tempo: 'frantic' }, m + ': the last choice, and no set');
      assert.strictEqual(su.recipe.shapes.preset, 'normal');
      const d = R.deal(su.recipe, su.size, new L.RNG(4)), P = { race: L.Race, battle: L.Battle }[m];
      assert(P.setIn(d.recipe) && P.setIn(d.recipe).tempo === 'frantic', m + ': a new game draws a Frantic set');
      const g = new L.Game({ w: d.size.w, h: d.size.h, recipe: d.recipe, seed: 3 });
      assert(/^Frantic \u00b7 \d+ \u00d7 \d+/.test(Menu.rulesOf(g.toJSON())), Menu.rulesOf(g.toJSON()));
      assert.strictEqual(Menu.rulesOf(new L.Game({ w: 10, h: m === 'race' ? 10 : 14, recipe: R.normalize({ mode: m }), seed: 3 }).toJSON()), '', m + ': a game with no set says nothing');
    }
    assert.strictEqual(Menu.rulesOf(mk({}, 10, 20, 3).toJSON()), '');
  });
  test('progress in a few words: lines (or pieces), a match\'s tally, a picture\'s pieces, Full, a mode\'s own end', () => {
    const g = mk({}, 10, 20, 30, 2);
    g.s.lines = 12;
    assert.strictEqual(Menu.progress(g.toJSON()), 'Lines 12');
    g.s.lines = 0;
    assert.strictEqual(Menu.progress(g.toJSON()), '2 pieces', 'nothing cleared yet: the pieces set');
    g.s.pieces = 1;
    assert.strictEqual(Menu.progress(g.toJSON()), '1 piece');
    g.s.pieces = 2; g.s.lines = 12;
    assert.strictEqual(Menu.progress(mk({ mode: 'race' }, 10, 10, 31).toJSON()), 'vs Steady 0\u20130');
    assert(/^0 of \d+ placed$/.test(Menu.progress(mk({ mode: 'mural' }, 10, 20, 32).toJSON())), Menu.progress(mk({ mode: 'mural' }, 10, 20, 32).toJSON()));
    const j = g.toJSON(); j.over = true;
    assert.strictEqual(Menu.progress(j), 'Full');
    assert.strictEqual(Menu.modeLabel(R.normalize({})), 'Relaxed');
    assert.strictEqual(Menu.modeLabel(R.normalize({ shapes: { preset: 'tiny' } })), 'Relaxed \u00b7 Tiny');
    assert.strictEqual(Menu.modeLabel(R.normalize({ mode: 'classic' })), 'Classic A');
  });
}

console.log('sound and music');
{
  load(['audio.js']);
  const { SONG, Sound, Music } = L;
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = (m) => (m == null ? '-' : NAMES[m % 12] + (Math.floor(m / 12) - 1));
  const flat = (tune) => [].concat(...tune).map(([m, l]) => name(m) + ' ' + l).join(',');
  const A_MINOR = [9, 11, 0, 2, 4, 5, 7]; // A B C D E F G
  const midiOf = (f) => 69 + 12 * Math.log2(f / 440);
  const hzOf = (m) => 440 * Math.pow(2, (m - 69) / 12);
  test('Classic plays Hush, Lull\'s own tune, note for note, in its own key (A minor)', () => {
    // The tune as written in js/audio.js, the A part and the B part, in eighths.
    const A = 'G4 3,B4 1,E5 4,G5 2,E5 2,C5 4,D5 3,B4 1,A4 2,G4 2,A4 6,- 2,A4 2,D5 2,F5 3,E5 1,E5 4,D5 2,B4 2,G4 2,B4 2,D5 2,E5 2,C5 3,B4 1,A4 4';
    const B = 'A4 2,C5 2,E5 4,F#5 2,E5 2,D5 2,B4 2,C5 4,B4 2,A4 2,G#4 6,- 2,E5 2,A5 4,E5 2,F#5 3,E5 1,D5 2,B4 2,C5 2,E5 2,B4 2,A4 2,G#4 2,B4 2,E5 4';
    assert.strictEqual(flat(SONG.tunes.A), A);
    assert.strictEqual(flat(SONG.tunes.B), B);
    assert.strictEqual(flat(SONG.tunes.slowB), B.split(',').map((t) => t.split(' ')[0] + ' ' + t.split(' ')[1] * 2).join(','), 'the floating bridge is the same line at half time');
    for (const tune of Object.values(SONG.tunes)) assert.strictEqual([].concat(...tune).reduce((n, [, l]) => n + l, 0), 8 * tune.length, 'whole bars of eight eighths');
    assert.strictEqual(SONG.tunes.slowB.length, 16);
    const sections = [...new Set(SONG.bars.map((b) => b.section))];
    assert(sections.length >= 7 && SONG.bars.length >= 48 && SONG.loopFrom === 4, 'a long suite of sections, looping after the intro');
    assert(SONG.bars.filter((b) => b.lead && b.lead === SONG.tunes.A[0]).length >= 3, 'the theme comes round more than once');
  });
  // Lull's melodies are its own: no stretch of six intervals in a row (seven notes, in any key) of any line the music
  // plays is found in the well-known folk tune Classic used to play (Korobeiniki, its A and B parts as usually written).
  test('the music quotes no well-known melody: no six intervals in a row of Korobeiniki, in any key', () => {
    const KNOWN = {
      'Korobeiniki A': 'E5 B4 C5 D5 C5 B4 A4 A4 C5 E5 D5 C5 B4 C5 D5 E5 C5 A4 A4 D5 F5 A5 G5 F5 E5 C5 E5 D5 C5 B4 B4 C5 D5 E5 C5 A4 A4',
      'Korobeiniki B': 'E5 C5 D5 B4 C5 A4 G#4 B4 E5 C5 D5 B4 C5 E5 A5 G#5',
    };
    const midi = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12; };
    const steps = (ms) => ms.slice(1).map((m, i) => m - ms[i]);
    const runs = (st, n) => new Set(st.map((_, i) => st.slice(i, i + n).join(',')).filter((r, i) => i + n <= st.length));
    const known = new Set(Object.values(KNOWN).flatMap((t) => [...runs(steps(t.split(' ').map(midi)), 6)]));
    const lines = Object.assign({}, SONG.tunes, { counter: SONG.bars.filter((b) => b.section === 'interlude').map((b) => b.lead), under: SONG.bars.filter((b) => b.under).map((b) => b.under) });
    for (const [name, tune] of Object.entries(lines)) {
      const ms = [].concat(...tune).map(([m]) => m).filter((m) => m != null);
      const hit = [...runs(steps(ms), 6)].filter((r) => known.has(r));
      assert.deepStrictEqual(hit, [], name + ' shares a run of six intervals with a known melody');
    }
  });
  // Each section says what key it is in: A minor, but for the bridge (in time and floating), whose tune takes G# and whose
  // dominant takes F#, with no F anywhere: A melodic minor.
  test('each section is in its key: A minor, and the bridge (both times) A melodic minor; no modulation', () => {
    const keys = {};
    for (const b of SONG.bars) keys[b.section] = b.key;
    assert.deepStrictEqual(keys, { intro: 'A minor', theme: 'A minor', theme2: 'A minor', float: 'A melodic minor', interlude: 'A minor', variation: 'A minor', bridge: 'A melodic minor', coda: 'A minor' });
    assert.strictEqual(SONG.home, 'A minor');
    assert.deepStrictEqual(SONG.keys['A minor'].slice().sort((x, y) => x - y), A_MINOR.slice().sort((x, y) => x - y));
    assert.deepStrictEqual(SONG.keys['A melodic minor'].slice().sort((x, y) => x - y), [0, 2, 4, 6, 8, 9, 11]);
    for (const b of SONG.bars) assert(b.key in SONG.keys, b.section);
    // Every note of every tune is in its section's key; of the chords, the only notes outside it are the colours
    // named: the interlude's closing E9 (F#, G#) and, in the bridge, Am9's seventh (G).
    const outside = new Set();
    for (const b of SONG.bars) {
      const k = SONG.keys[b.key];
      for (const line of [b.lead, b.under]) if (line) for (const [m] of line) if (m != null) assert(k.includes(m % 12), name(m) + ' in the ' + b.section + ' (' + b.key + ')');
      for (const m of [b.harm[0]].concat(b.harm[1])) if (!k.includes(m % 12)) outside.add(b.section + ' ' + b.name + ' ' + NAMES[m % 12]);
    }
    assert.deepStrictEqual([...outside].sort(), ['bridge Am9 G', 'float Am9 G', 'interlude E9 F#', 'interlude E9 G#']);
    // No F in the bridge at all (which is why it is not harmonic minor).
    for (const b of SONG.bars) if (b.key === 'A melodic minor') for (const m of [b.harm[0]].concat(b.harm[1], (b.lead || []).map(([x]) => x).filter((x) => x != null))) assert.notStrictEqual(m % 12, 5, b.section);
  });
  test('the music changes speed only through Music.tempo (not level, not section)', () => {
    for (const b of SONG.bars) assert(!('bpm' in b) && !('tempo' in b));
    const starts = [], play = Music.playBar, echo = Music.echo;
    Music.playBar = (bar, t0, e) => starts.push([t0, e]);
    Music.echo = null;
    try {
      Music.tempo = 1; Music.pos = { bar: 0, at: 0 }; Music.fill(60);
      const gaps = starts.slice(1).map(([t], i) => t - starts[i][0]);
      assert(gaps.every((g) => Math.abs(g - 8 * 60 / Music.bpm / 2) < 1e-9), 'every bar the same length');
      assert(Music.bpm <= 84, 'slow');
      starts.length = 0; Music.tempo = 1.3; Music.pos = { bar: 0, at: 0 }; Music.fill(60);
      assert(Math.abs((starts[1][0] - starts[0][0]) - 8 * 60 / (Music.bpm * 1.3) / 2) < 1e-9, 'tempo quickens it');
    } finally { Music.playBar = play; Music.echo = echo; Music.tempo = 1; Music.pos = null; }
  });
  test('coming back mid-chord (after a pause) still sounds the chord and bass, for the rest of it', () => {
    const mid = SONG.bars.findIndex((b) => !b.chord), keep = {}, pads = [], basses = [];
    assert(mid > 0 && SONG.bars[mid].left === 1, 'the floating bridge holds chords over two bars');
    for (const k of ['pad', 'bass', 'pluck', 'bell', 'shimmer', 'stutter', 'drop', 'kick', 'brush', 'tick', 'click', 'lead', 'keys', 'round', 'breath', 'echo']) { keep[k] = Music[k]; Music[k] = () => {}; }
    Music.pad = (m, at, len) => pads.push(len);
    Music.bass = (m, at, dur) => basses.push(dur);
    Music.echo = null;
    try {
      Music.tempo = 1; Music.fresh = true; Music.pos = { bar: mid, at: 0 }; Music.fill(0.1);
      const bar = 8 * 60 / Music.bpm / 2;
      assert(pads.length === 4 && pads.every((l) => Math.abs(l - bar) < 1e-9) && basses.length === 1, JSON.stringify([pads, basses]));
      pads.length = 0; Music.pos = { bar: mid, at: 0 }; Music.fill(0.1);
      assert.strictEqual(pads.length, 0, 'in the flow of the song, a held chord is not struck again');
    } finally { Object.assign(Music, keep); Music.pos = null; }
  });
  test('the music\'s dress: the round lead sings the theme; a beat and glitches only in places, and sparse', () => {
    const by = {};
    for (const b of SONG.bars) (by[b.section] = by[b.section] || []).push(b);
    for (const b of SONG.bars) if (b.lead === SONG.tunes.A[0]) assert.strictEqual(b.voice, 'round', b.section);
    const beat = Object.keys(by).filter((k) => by[k][0].groove), calm = Object.keys(by).filter((k) => !by[k][0].groove);
    assert(beat.length >= 3 && calm.length >= 3, 'some sections with a beat, some without: ' + beat);
    for (const k of Object.keys(by)) if (by[k][0].glitch) assert(by[k][0].groove, k + ': glitches ride on a beat');
    // Counted over the whole suite, with every instrument stubbed: few stutters, few clicks, ticks never on every offbeat.
    const keep = {}, n = { stutter: 0, click: 0, tick: 0, kick: 0, bars: 0 }, pumps = [];
    for (const k of ['pad', 'bass', 'pluck', 'bell', 'shimmer', 'drop', 'brush', 'keys', 'round', 'breath', 'lead', 'stutter', 'click', 'tick']) { keep[k] = Music[k]; Music[k] = n[k] != null ? () => n[k]++ : () => {}; }
    const osc = Music.osc, env = Music.env, pump = Music.pump, nop = () => {};
    Music.osc = () => ({ frequency: { setValueAtTime: nop, exponentialRampToValueAtTime: nop } }); Music.env = nop; // the kick's own note
    Music.pump = { gain: { setTargetAtTime: (v, at) => pumps.push([v, at]) } };
    try {
      SONG.bars.forEach((b, i) => { Music.playBar(b, i * 3, 0.375, i); n.bars++; });
      n.kick = pumps.filter(([v]) => v < 1).length;
      const grooveBars = SONG.bars.filter((b) => b.groove).length, glitchBars = SONG.bars.filter((b) => b.glitch).length;
      assert(n.stutter > 0 && n.stutter <= glitchBars * 0.6, 'stutters ' + n.stutter + ' in ' + glitchBars);
      assert(n.click > 0 && n.click <= glitchBars * 1.2, 'clicks ' + n.click);
      assert(n.tick > 0 && n.tick < grooveBars * 4 * 0.8, 'ticks ' + n.tick + ' in ' + grooveBars);
      assert(n.kick > 0 && pumps.every(([v]) => v >= 0.6 && v <= 1), 'every kick dips the pads, gently: ' + JSON.stringify(pumps.slice(0, 4)));
    } finally { Object.assign(Music, keep); Music.osc = osc; Music.env = env; Music.pump = pump; Music.prevLead = null; }
  });
  test('the default pack voices every sound the game plays, softly and in the music\'s key', () => {
    const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'Game', 'js');
    const played = new Set(['move', 'rotate', 'lower', 'lock', 'hold', 'clear', 'quad', 'twist', 'perfect', 'combo', 'boom', 'drill']);
    for (const f of fs.readdirSync(dir)) for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\.play\('([a-z]+)'/g)) played.add(m[1]);
    const soft = Sound.PACKS.soft;
    assert.strictEqual(L.defaultState().equipped.sound, 'soft');
    for (const n of played.add('a-sound-nobody-has-voiced-yet')) {
      for (const arg of [1, 2, 3, 9]) {
        // Its own sound, a shared one, or (for a name added since) the pack's quiet fallback: never silence.
        const voices = Sound.voices(n, arg, 'soft').list;
        assert(voices && voices.length, n + ' makes a sound');
        for (const v of voices) {
          assert(v.g > 0 && v.g <= 0.2, n + ' gain ' + v.g);
          if (v.n) { assert(v.q && v.q <= 600 && v.a >= 0.01, n + ': noise only as a dark, soft breath'); continue; }
          const m = midiOf(v.f);
          assert(Math.abs(m - Math.round(m)) < 0.02 && A_MINOR.includes(Math.round(m) % 12), n + ' plays ' + v.f.toFixed(1) + ' Hz, not in A minor');
          // Smooth: no click on the way in, pure waves (sine or triangle), no harsh FM, and never brighter than the music.
          assert(v.a >= 0.01, n + ': attack ' + v.a);
          assert(!v.w || v.w === 'sine' || v.w === 'triangle', n + ' wave ' + v.w);
          assert(!v.fm && !v.fe && !v.bp && !v.hp, n + ': a plain, soft tone');
          assert(v.f < 1400 && Math.min(v.q || Infinity, v.sw ? Math.max(...v.sw) : Infinity, soft.lp) <= 2400, n + ' is too bright');
        }
      }
    }
    // Movement is barely there: quiet, short, and not bright.
    for (const n of ['move', 'rotate', 'lower']) for (let i = 0; i < 12; i++) for (const v of soft[n](Sound)) assert(v.g <= 0.03 && v.d <= 0.25 && v.f < 1000, n);
  });

  // Sound effects in the music's key (Lull.Key): the key of the moment, the snapping, and the fit. Never its chords,
  // never its beat.
  const { Key } = L;
  const pcOf = (f) => ((Math.round(midiOf(f)) % 12) + 12) % 12;
  const firstOf = (section) => SONG.bars.findIndex((b) => b.section === section);
  const SECTION_NAMES = [...new Set(SONG.bars.map((b) => b.section))];
  const lineAt = (section) => ({ sched: [{ bar: firstOf(section), at: 0, e: 0.375 }], e: 0.375 });
  test('the keys\' scales; an unknown key is the home key', () => {
    const set = (fl) => fl.map((on, pc) => (on ? NAMES[pc] : null)).filter(Boolean).join(' ');
    assert.strictEqual(set(Key.scale('A minor')), 'C D E F G A B');
    assert.strictEqual(set(Key.scale('A melodic minor')), 'C D E F# G# A B');
    assert.strictEqual(Key.scale('B flat lydian'), Key.scale('A minor'));
    assert.strictEqual(Key.HOME, 'A minor');
  });
  test('snapping: the nearest note of the key within a tritone, the lower on a tie, and the sound\'s shape kept', () => {
    const am = Key.scale('A minor'), mel = Key.scale('A melodic minor');
    assert.strictEqual(Key.snap(69, am), 69, 'a note of the key stays');
    assert.strictEqual(Key.snap(70, am), 69, 'Bb: A and B are both a semitone away; the lower');
    assert.strictEqual(Key.snap(66, am), 65, 'F# to F in A minor');
    assert.strictEqual(Key.snap(66, mel), 66, 'but F# is in the bridge\'s key');
    assert.strictEqual(Key.snap(65, mel), 64, 'and F is not: the lower of E and F#');
    assert.strictEqual(Key.snap(67, mel), 66, 'G, between F# and G#');
    assert.strictEqual(Key.snap(70, am, 69, 1), 71, 'rising from A, Bb has to go up');
    assert.strictEqual(Key.snap(70, am, 69, 0), 69, 'a twin of A stays on A');
    assert.strictEqual(Key.snap(61, new Array(12).fill(false)), 61, 'nothing allowed: left where it was');
  });
  test('the bar (and key) at a moment follows the tempo each bar was scheduled at, and counts on past the last', () => {
    const play = Music.playBar, echo = Music.echo;
    Music.playBar = () => {}; Music.echo = null;
    try {
      Music.tempo = 1; Music.pos = { bar: 0, at: 0, keep: Infinity }; Music.fill(5); // bars 0 and 1 at 3 s each
      Music.tempo = 1.5; Music.fill(9); // then 2 s bars: 2 at 6 s, 3 at 8 s
      const line = { sched: Music.pos.sched, e: 60 / (Music.bpm * 1.5) / 2 };
      const at = (t) => { const b = Music.barAt(t, line); return [b.idx, +b.at.toFixed(6), +(b.e * 8).toFixed(6)]; };
      assert.deepStrictEqual(at(0), [0, 0, 3]);
      assert.deepStrictEqual(at(2.99), [0, 0, 3]);
      assert.deepStrictEqual(at(3), [1, 3, 3]);
      assert.deepStrictEqual(at(6.5), [2, 6, 2], 'the quicker tempo from here');
      assert.deepStrictEqual(at(9.9), [3, 8, 2]);
      assert.deepStrictEqual(at(10.5), [4, 10, 2], 'not yet scheduled: counted on at the tempo now');
      assert.deepStrictEqual(at(-1), [0, 0, 3], 'before the first: the first');
      assert.strictEqual(Music.barAt(1, { sched: [] }), null);
      // Round the end of the suite it goes back to the theme, not the intro.
      const last = SONG.bars.length - 1, wrap = Music.barAt(4, { sched: [{ bar: last, at: 0, e: 0.375 }], e: 0.375 });
      assert.strictEqual(wrap.idx, SONG.loopFrom);
      // The live timeline only while playing on the context it plays on; a render's on its own context.
      const keepCtx = Sound.ctx, keepOn = Music.on, keepPlaying = Music.playing;
      Sound.ctx = { id: 1 }; Music.on = Sound.ctx; Music.playing = true;
      assert(Music.timeline() && Music.timeline().sched === Music.pos.sched);
      Sound.ctx = { id: 2 };
      assert.strictEqual(Music.timeline(), null, 'another context (an offline render) does not follow the live music');
      Music.playing = false; Sound.ctx = Music.on;
      assert.strictEqual(Music.timeline(), null, 'no music, no timeline');
      assert.strictEqual(Key.at(3, null), 'A minor', 'no music: the home key');
      Sound.ctx = keepCtx; Music.on = keepOn; Music.playing = keepPlaying;
    } finally { Music.playBar = play; Music.echo = echo; Music.tempo = 1; Music.pos = null; }
  });
  test('the key at a moment is its section\'s, at any tempo: into the bridge and out of it again', () => {
    const play = Music.playBar, echo = Music.echo;
    Music.playBar = () => {}; Music.echo = null;
    try {
      for (const tempo of [1, 1.25, 1.6]) {
        const from = firstOf('theme2') + 6; // two bars before the float
        Music.tempo = tempo; Music.pos = { bar: from, at: 0, keep: Infinity }; Music.fill(200);
        const line = { sched: Music.pos.sched, e: 60 / (Music.bpm * tempo) / 2 }, barLen = 8 * line.e;
        for (let i = 0; i < 40; i++) {
          const t = (i + 0.5) * barLen, b = SONG.bars[Music.pos.sched[i].bar];
          assert.strictEqual(Key.at(t, line), b.key, 'tempo ' + tempo + ', bar ' + i + ' (' + b.section + ')');
        }
        assert.strictEqual(Key.at(1.5 * barLen, line), 'A minor', 'the end of theme2');
        assert.strictEqual(Key.at(2.5 * barLen, line), 'A melodic minor', 'the float');
        assert.strictEqual(Key.at(18.5 * barLen, line), 'A minor', 'the interlude');
        // Past what was scheduled, counted on at the tempo now.
        const short = { sched: Music.pos.sched.slice(0, 1), e: line.e };
        assert.strictEqual(Key.at(2.5 * barLen, short), 'A melodic minor', 'counted on, tempo ' + tempo);
      }
    } finally { Music.playBar = play; Music.echo = echo; Music.tempo = 1; Music.pos = null; }
  });
  const EVENTS = [['move'], ['rotate'], ['lower'], ['lock'], ['hold'], ['blocked'], ['clear', 1], ['clear', 2], ['clear', 3], ['quad'], ['twist'],
    ['perfect'], ['combo', 3], ['combo', 9], ['boom'], ['drill'], ['buy'], ['error'], ['solve'], ['fail'], ['golden'], ['item'], ['stamp'],
    ['pack'], ['land'], ['bell'], ['sparkle-from-a-new-item']];
  test('every pitched voice of every pack lands in the key of each section, shape and register kept', () => {
    let checked = 0;
    for (const section of SECTION_NAMES) {
      const line = lineAt(section), key = SONG.bars[firstOf(section)].key, set = Key.scale(key);
      for (const pack of Object.keys(Sound.PACKS)) {
        for (const [ev, arg] of EVENTS) {
          const { list } = Sound.voices(ev, arg, pack);
          if (!list) continue;
          const before = JSON.stringify(list), out = Key.tune(list, 0.2, line);
          assert.strictEqual(JSON.stringify(list), before, 'the pack\'s own voices are left as they were');
          assert.strictEqual(out.length, list.length);
          const pitched = list.map((v, i) => [v, out[i]]).filter(([v]) => Key.tonal(v));
          for (const [v, w] of list.map((x, i) => [x, out[i]])) {
            if (Key.tonal(v)) continue;
            assert.deepStrictEqual(w, v, pack + ' ' + ev + ': noise, clicks and thuds untouched');
          }
          for (const [v, w] of pitched) {
            const m = midiOf(w.f), where = pack + ' ' + ev + ' in the ' + section + ': ' + w.f.toFixed(1) + ' Hz';
            assert(Math.abs(m - Math.round(m)) <= 0.081, where + ' is off the note');
            assert(set[pcOf(w.f)], where + ' is not in ' + key);
            assert(Math.abs(midiOf(w.f) - midiOf(v.f)) <= 6.6, where + ' left its register');
            if (v.to) assert(Math.abs(w.to / w.f - v.to / v.f) < 1e-9, where + ': the slide keeps its span');
            for (const k of ['p', 'fm', 'dt', 'vib', 'g', 'd', 'at', 'w', 'q', 'fe']) assert.deepStrictEqual(w[k], v[k], where + ' ' + k);
            checked++;
          }
          // Its shape: in time order (low to high within a moment), each step goes the same way it did.
          const order = pitched.map(([v, w]) => [v.at || 0, Math.round(midiOf(v.f)), Math.round(midiOf(w.f))]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const bent = order.slice(1).filter((x, i) => Math.sign(x[1] - order[i][1]) !== Math.sign(x[2] - order[i][2])).length;
          assert(bent <= Math.max(0, Math.floor(order.length / 8)), pack + ' ' + ev + ' in the ' + section + ' lost its shape: ' + JSON.stringify(order));
        }
      }
    }
    assert(checked > 1000, String(checked));
  });
  test('a sound already in the key stays put: the default pack in A minor moves nothing; in the bridge only its F and G move', () => {
    for (const [ev, arg] of EVENTS) {
      const { list } = Sound.voices(ev, arg, 'soft');
      if (!list) continue;
      const out = Key.fit(list, 'A minor');
      out.forEach((w, i) => { if (Key.tonal(list[i]) && A_MINOR.includes(pcOf(list[i].f))) assert(Math.abs(w.f - list[i].f) < 0.5, ev); });
      const mel = Key.fit(list, 'A melodic minor');
      mel.forEach((w, i) => {
        if (!Key.tonal(list[i])) return;
        const pc = pcOf(list[i].f);
        if (pc !== 5 && pc !== 7) assert(Math.abs(midiOf(w.f) - midiOf(list[i].f)) < 1.01, ev + ': a note already in the key moves a semitone at most');
      });
    }
  });
  test('without the music, sounds are in A minor; played straight away; odd voices from new sounds taken in their stride', () => {
    const odd = { f: hzOf(70), d: 0.3 }, keepCtx = Sound.ctx;
    Sound.ctx = null;
    try { assert.strictEqual(pcOf(Key.tune([odd], 3)[0].f), 9, 'Bb, with no music: A (the home key)'); } finally { Sound.ctx = keepCtx; }
    assert.strictEqual(pcOf(Key.fit([{ f: hzOf(67), d: 0.3 }], [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0].map(Boolean))[0].f), 8, 'a key given as flags');
    const weird = [null, 7, {}, { f: NaN, d: 1 }, { f: Infinity, d: 1 }, { f: 1234.5, d: 0.6 }, { f: 300, to: NaN, d: 0.4 }, { n: 1, d: 0.2 }, { f: 440 }];
    const out = Key.tune(weird, 0, lineAt('bridge'));
    assert.strictEqual(out.length, weird.length);
    assert(out.every((v) => v == null || typeof v !== 'object' || v.f === undefined || Number.isNaN(v.f) || v.f === Infinity || isFinite(v.f)));
    assert(Key.scale('A melodic minor')[pcOf(out[5].f)], 'an unknown sound\'s tone still finds the key');
    assert.strictEqual(out[8].f, 440, 'a voice with no length is a click: left alone');
    // Nothing waits for the beat any more: Sound.play voices every sound at no delay.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'Game', 'js', 'audio.js'), 'utf8');
    assert(/Key\.tune\(list, ctx\.currentTime\)\) this\.voice\(v, 0, pack\)/.test(src), 'Sound.play plays at once');
    assert(!/QUANTIZE|CELEBRATE|Harmony\b/.test(src), 'no beat quantizing or chord following left');
  });
}

console.log('control hints');
{
  load(['hints.js']);
  const { Detector, T, RETIRE_PIECES, RETIRE_MS, MAX_SHOWN, GAP_MS, SAME_GAP_MS, PENDING_MS, SKILL, content } = L.Hints;
  const piece = () => ({});
  const up = (p, extra) => Object.assign({ act: 'up', a: 'lower', ok: true, rep: false, mouse: false, set: false, piece: p, rot: 180 }, extra);
  test('Up pressed on an Upside Down board, where it lowers, three times before any turn: the hint for the arrow that turns', () => {
    const d = new Detector(), p = piece();
    d.action(up(p), 0); d.action(up(p), 100);
    assert.strictEqual(d.take(200, true), null, 'two is not yet struggling');
    d.action(up(p), 300);
    const got = d.take(400, true);
    assert.strictEqual(got && got.id, 'turnArrow');
    assert.strictEqual(d.hs.shown.turnArrow, 1);
    assert.strictEqual(d.take(500, true), null, 'shown once, not again at once');
  });
  test('an Up that set the piece counts double; a turn by any means clears it; Sideways asks for more', () => {
    const d = new Detector();
    d.action(up(piece(), { set: true }), 0); d.action(up(piece()), 10);
    assert.strictEqual(d.pending && d.pending.id, 'turnArrow');
    const e = new Detector(), p = piece();
    e.action(up(p), 0); e.action(up(p), 10);
    e.action({ act: 'cw', a: 'cw', ok: true, piece: p, rot: 180 }, 20);
    e.action(up(p), 30); e.action(up(p), 40);
    assert.strictEqual(e.pending, null, 'this piece turned: Up is being used on purpose');
    const f = new Detector(), q = piece();
    for (let i = 0; i < 4; i++) f.action(up(q, { rot: 90, a: 'moveL' }), i);
    assert.strictEqual(f.pending, null, 'on Sideways Up moves, so it takes five');
    f.action(up(q, { rot: 90, a: 'moveL' }), 5);
    assert.strictEqual(f.pending && f.pending.id, 'turnArrow');
    const g = new Detector(), r = piece();
    for (let i = 0; i < 6; i++) g.action(up(r, { rot: 0, a: 'rotate' }), i * 3000);
    assert.strictEqual(g.pending, null, 'an upright board: Up turns, nothing to say');
    const k = new Detector(), rr = piece();
    for (let i = 0; i < 6; i++) k.action(up(rr, { noRotate: true }), i);
    assert.strictEqual(k.pending, null, 'Rigid: nothing turns, so no arrow does');
  });
  test('the long way round: three quick clockwise turns, twice, bring Z; slow or mixed turns do not', () => {
    const d = new Detector(), turn = (p, at, a) => d.action({ act: a === 'ccw' ? 'ccw' : 'up', a: a || 'rotate', ok: true, piece: p, rot: 0 }, at);
    let p = piece(); turn(p, 0); turn(p, 300); turn(p, 600);
    assert.strictEqual(d.pending, null, 'once could be anything');
    p = piece(); turn(p, 5000); turn(p, 7000); turn(p, 9000);
    assert.strictEqual(d.pending, null, 'slow turns are thinking, not the long way');
    p = piece(); turn(p, 20000); turn(p, 20300); turn(p, 20600);
    assert.strictEqual(d.pending && d.pending.id, 'otherWay');
    assert.deepStrictEqual(content('otherWay', null, { screenDir: (x, y) => [x, -y] })[0], ['Z']);
  });
  test('Relaxed: a piece moved and then left floating 7 s brings Space; never an untouched piece or one resting', () => {
    const d = new Detector(), p = piece();
    d.idle({ relaxed: true, floating: true, piece: p }, 20000);
    assert.strictEqual(d.pending, null, 'never touched: the player may be away');
    d.action({ act: 'left', a: 'moveL', ok: true, piece: p, rot: 0 }, 21000);
    d.idle({ relaxed: true, floating: true, piece: p }, 21000 + T.idleMs - 1);
    assert.strictEqual(d.pending, null);
    d.idle({ relaxed: false, floating: true, piece: p }, 21000 + T.idleMs);
    assert.strictEqual(d.pending, null, 'Classic falls on its own');
    d.idle({ relaxed: true, floating: true, piece: p }, 21000 + T.idleMs);
    assert.strictEqual(d.pending && d.pending.id, 'drop');
  });
  test('three fresh presses into a block the piece could pass lower: ↓; into a wall: nothing; inverted, back from a wall: swapped', () => {
    const d = new Detector(), p = piece(), push = (dd, at, x) => dd.action(Object.assign({ act: 'left', a: 'moveL', ok: false, piece: p, rot: 0 }, x), at);
    push(d, 0, { wall: 'wall' }); push(d, 100, { wall: 'wall' }); push(d, 200, { wall: 'wall' });
    assert.strictEqual(d.pending, null, 'at the wall: nothing to teach');
    push(d, 300, { wall: 'block', lowerThenSlide: true }); push(d, 400, { wall: 'block', lowerThenSlide: true }, 1);
    push(d, 500, { wall: 'block', lowerThenSlide: true, rep: true });
    assert.strictEqual(d.pending, null, 'held repeats are not fresh presses');
    push(d, 600, { wall: 'block', lowerThenSlide: true });
    assert.strictEqual(d.pending && d.pending.id, 'lower');
    const e = new Detector();
    for (let i = 0; i < 3; i++) push(e, i * 100, { wall: 'wall', inverted: true, otherSideFree: true });
    assert.strictEqual(e.pending && e.pending.id, 'invert');
  });
  test('keys that do nothing: four within 8 s', () => {
    const d = new Detector();
    d.unknownKey(0); d.unknownKey(3000); d.unknownKey(9000);
    assert.strictEqual(d.pending, null);
    d.unknownKey(9500); d.unknownKey(10000);
    assert.strictEqual(d.pending && d.pending.id, 'keys');
  });
  test('mouse: eight clicked pieces never turned bring right-click; clicks undone at once bring it too', () => {
    const d = new Detector(), click = (at) => d.action({ act: 'drop', a: 'drop', ok: true, mouse: true, set: true, piece: piece(), rot: 0 }, at);
    for (let i = 0; i < 7; i++) click(i * 1000);
    assert.strictEqual(d.pending, null);
    click(8000);
    assert.strictEqual(d.pending && d.pending.id, 'mouseTurn');
    const e = new Detector(), c2 = (at) => e.action({ act: 'drop', a: 'drop', ok: true, mouse: true, set: true, piece: piece(), rot: 0 }, at);
    c2(0); e.undo(1000); c2(2000); e.undo(9000);
    assert.strictEqual(e.pending, null, 'an undo long after is a change of mind');
    c2(10000); e.undo(11000);
    assert.strictEqual(e.pending && e.pending.id, 'mouseTurn');
  });
  test('a Hold puzzle ended without holding: C', () => {
    const d = new Detector();
    d.attemptEnded({ holdMod: true, holds: 2 }, 0);
    d.attemptEnded({ holdMod: false, holds: 0 }, 0);
    assert.strictEqual(d.pending, null);
    d.attemptEnded({ holdMod: true, holds: 0 }, 0);
    assert.strictEqual(d.pending && d.pending.id, 'hold');
  });
  test('one at a time, rate-limited, waits for a calm moment, gives up after a while; each at most twice', () => {
    const d = new Detector();
    d.attemptEnded({ holdMod: true, holds: 0 }, 0);
    d.unknownKey(0); d.unknownKey(1); d.unknownKey(2); d.unknownKey(3);
    assert.strictEqual(d.pending.id, 'hold', 'the first in keeps its place');
    assert.strictEqual(d.take(10, false), null, 'not calm: it waits');
    assert.strictEqual(d.take(20, true).id, 'hold');
    d.unknownKey(100); d.unknownKey(101); d.unknownKey(102); d.unknownKey(103);
    assert.strictEqual(d.take(200, true), null, 'too soon after the last one');
    assert.strictEqual(d.take(103 + PENDING_MS + 1, true), null, 'and it gave up');
    assert.strictEqual(d.pending, null);
    let t = 1e6;
    for (let i = 0; i < 5; i++) { d.attemptEnded({ holdMod: true, holds: 0 }, t); d.take(t, true); t += SAME_GAP_MS + GAP_MS; }
    assert.strictEqual(d.hs.shown.hold, MAX_SHOWN);
  });
  test('used well a few times, a hint retires for good, even one already on its way', () => {
    const d = new Detector();
    d.attemptEnded({ holdMod: true, holds: 0 }, 0);
    for (let i = 0; i < SKILL.hold; i++) d.action({ act: 'hold', a: 'hold', ok: true, piece: piece(), rot: 0 }, i);
    assert(d.hs.retired.hold);
    assert.strictEqual(d.take(10, true), null);
    d.attemptEnded({ holdMod: true, holds: 0 }, 20);
    assert.strictEqual(d.pending, null, 'retired: never again');
    const e = new Detector(), p = piece();
    for (let i = 0; i < SKILL.turnArrow; i++) e.action({ act: 'down', a: 'rotate', ok: true, piece: piece(), rot: 180 }, i);
    assert(e.hs.retired.turnArrow, 'turning on a turned board');
    for (let i = 0; i < 6; i++) e.action(up(p), 100 + i);
    assert.strictEqual(e.pending, null);
  });
  test('all hints stop for good at 300 pieces or two hours on the boards, whichever comes first', () => {
    const d = new Detector();
    for (let i = 0; i < RETIRE_PIECES - 1; i++) d.piece();
    assert(!d.over);
    d.piece();
    assert(d.over);
    d.unknownKey(0); d.unknownKey(1); d.unknownKey(2); d.unknownKey(3);
    assert.strictEqual(d.pending, null);
    const e = new Detector();
    e.unknownKey(0); e.unknownKey(1); e.unknownKey(2); e.unknownKey(3);
    e.time(RETIRE_MS / 2); assert(!e.over); e.time(RETIRE_MS / 2);
    assert(e.over && e.take(10, true) === null, 'and a waiting one is dropped');
  });
  test('the save: a new one starts with hints on and nothing counted; a loaded one keeps what it had', () => {
    const fresh = L.loadState({});
    assert.strictEqual(fresh.settings.hints, true);
    assert.deepStrictEqual([fresh.hints.pieces, fresh.hints.ms, fresh.hints.over], [0, 0, false]);
    const off = L.loadState({ settings: { hints: false }, hints: { pieces: 12, shown: { keys: 1 }, retired: { hold: true } } });
    assert.strictEqual(off.settings.hints, false);
    assert.deepStrictEqual([off.hints.pieces, off.hints.shown.keys, off.hints.retired.hold, off.hints.skill], [12, 1, true, {}]);
  });
}

console.log('touch gestures');
{
  load(['touch.js']);
  const { TouchGestures, Touch } = L, TT = Touch.T;
  // A board 10 wide with 33 px cells (an iPhone held upright): step 33 at sensitivity 5. Every intent is recorded;
  // refuse() makes moves into a wall fail from then on.
  const rig = (over) => {
    const out = [];
    let wall = null;
    const G = new TouchGestures((it) => { out.push(it.type + (it.dir ? ':' + it.dir : '') + (it.side ? ':' + it.side : '') + (it.undo ? ':undo' : '')); return !(wall && it.type === 'move' && it.dir === wall); });
    const o = Object.assign({ step: 33, flickV: 1.1, flickMin: 28, slide: 'x', floor: [0, 1], centerX: 150, onHold: false, softMs: 0 }, over);
    return { G, out, o, wallOn: (d) => { wall = d; } };
  };
  /** One finger from (x, y) by (dx, dy) in n moves, gap ms apart, starting at t (lifted unless keep). */
  const path = (r, t, x, y, dx, dy, n, gap, keep) => {
    r.G.down(1, x, y, t, r.o);
    for (let i = 1; i <= n; i++) r.G.move(1, x + (dx * i) / n, y + (dy * i) / n, t + i * gap);
    if (!keep) r.G.up(1, x + dx, y + dy, t + n * gap + 4);
    return t + n * gap + 4;
  };
  test('touch: a tap is under 10 px and 280 ms; the side of the well it lands on picks the turn', () => {
    let r = rig();
    r.G.down(1, 200, 300, 0, r.o); r.G.move(1, 206, 305, 60); r.G.up(1, 206, 305, 120);
    assert.deepStrictEqual(r.out, ['tap:right']);
    r = rig(); r.G.down(1, 60, 300, 0, r.o); r.G.up(1, 61, 300, 90);
    assert.deepStrictEqual(r.out, ['tap:left']);
    r = rig(); r.G.down(1, 200, 300, 0, r.o); r.G.move(1, 211, 300, 60); r.G.up(1, 200, 300, 120);
    assert.deepStrictEqual(r.out, [], 'past SLOP (even if it comes back) is not a tap');
    r = rig(); r.G.down(1, 200, 300, 0, r.o); r.G.up(1, 200, 300, TT.TAP_MS + 30);
    assert.deepStrictEqual(r.out, [], 'held too long');
    r = rig({ onHold: true }); r.G.down(1, 20, 20, 0, r.o); r.G.up(1, 20, 20, 80);
    assert.deepStrictEqual(r.out, ['hold'], 'a tap on the Hold box holds');
  });
  test('touch: a cell per step of finger travel, the step set by sensitivity (1, 5, 10)', () => {
    assert.deepStrictEqual([1, 5, 10].map((k) => Touch.stepFor(33, k)), [53, 33, 17]);
    assert.strictEqual(Touch.stepFor(8, 10), TT.STEP_MIN); assert.strictEqual(Touch.stepFor(60, 1), TT.STEP_MAX);
    for (const [sens, cells] of [[1, 2], [5, 3], [10, 6]]) {
      const r = rig({ step: Touch.stepFor(33, sens) });
      path(r, 0, 50, 300, 110, 0, 30, 16);
      assert.deepStrictEqual(r.out, Array(cells).fill('move:right'), 'sensitivity ' + sens);
    }
    const r = rig();
    path(r, 0, 50, 300, 33 * 3.2, 0, 20, 16);
    assert.strictEqual(r.out.length, 3, '3.2 steps: 3 cells');
  });
  test('touch: turning back needs a quarter step more before the first step the other way', () => {
    const r = rig();
    r.G.down(1, 100, 300, 0, r.o);
    r.G.move(1, 120, 300, 16); r.G.move(1, 134, 300, 32); // one step right (at 33)
    assert.deepStrictEqual(r.out, ['move:right']);
    r.G.move(1, 100, 300, 64); // back to where the step began: one step's travel the other way, not yet enough
    assert.deepStrictEqual(r.out, ['move:right']);
    r.G.move(1, 92, 300, 80); // not quite 1.25 steps back from the new anchor (133)
    assert.deepStrictEqual(r.out, ['move:right']);
    r.G.move(1, 90, 300, 90); // 1.25 steps and a little
    assert.deepStrictEqual(r.out, ['move:right', 'move:left']);
  });
  test('touch: out and back to where it began, in one touch: the piece is back where it began', () => {
    for (const k of [1, 2, 3, 4]) {
      const r = rig();
      r.G.down(1, 200, 300, 0, r.o);
      let t = 0;
      const to = (x) => r.G.move(1, x, 300, (t += 16));
      const go = (from, dx) => { for (let i = 1; i <= 20; i++) to(from + (dx * i) / 20); };
      go(200, 33 * (k + 0.1)); go(200 + 33 * (k + 0.1), -33 * (k + 0.1));
      r.G.up(1, 200, 300, t + 4);
      const net = r.out.filter((x) => x === 'move:right').length - r.out.filter((x) => x === 'move:left').length;
      assert.strictEqual(net, k === 1 ? 1 : 0, k + ' steps out and back: ' + JSON.stringify(r.out));
    }
    const r = rig();
    r.G.down(1, 200, 300, 0, r.o);
    let t = 0;
    for (let w = 0; w < 4; w++) for (const x of [243, 200 - 43, 200]) r.G.move(1, x, 300, (t += 40));
    r.G.up(1, 200, 300, t + 4);
    const net = r.out.filter((x) => x === 'move:right').length - r.out.filter((x) => x === 'move:left').length;
    assert(Math.abs(net) <= 1 && r.out.length >= 8, 'a wiggle ends near where it began: ' + JSON.stringify(r.out));
  });
  test('touch: a move into a wall re-anchors at the finger, so there is nothing to unwind', () => {
    const r = rig();
    r.G.down(1, 100, 300, 0, r.o);
    r.G.move(1, 134, 300, 16);
    r.wallOn('right');
    r.G.move(1, 240, 300, 60); // three steps' worth into the wall: one refused try
    r.G.move(1, 210, 300, 90); r.G.move(1, 200, 300, 110); // backing off a little: no step yet
    assert.deepStrictEqual(r.out, ['move:right', 'move:right'], JSON.stringify(r.out));
    r.G.move(1, 198, 300, 130); // 42 px back from the wall point: 1.25 steps with the turn-back margin
    assert.deepStrictEqual(r.out, ['move:right', 'move:right', 'move:left']);
  });
  test('touch: down under a ledge, then slide, in one touch (the axis follows the finger, however slowly)', () => {
    for (const gap of [16, 45]) {
      const r = rig();
      r.G.down(1, 100, 100, 0, r.o);
      let t = 0;
      for (let i = 1; i <= 12; i++) r.G.move(1, 100, 100 + i * 6, (t += gap));
      for (let i = 1; i <= 12; i++) r.G.move(1, 100 + i * 6, 172, (t += gap));
      r.G.up(1, 172, 172, t + 4);
      assert.deepStrictEqual(r.out, ['lower', 'lower', 'move:right', 'move:right'], gap + ' ms: ' + JSON.stringify(r.out));
    }
  });
  test('touch: a swipe toward the floor at 1.2 px/ms is a hard drop; a drag at 0.5 px/ms only lowers', () => {
    let r = rig();
    path(r, 0, 100, 100, 0, 96, 10, 8); // 1.2 px/ms
    assert.deepStrictEqual(r.out.filter((x) => x !== 'lower'), ['drop'], JSON.stringify(r.out));
    r = rig();
    path(r, 0, 100, 100, 0, 200, 50, 8); // 0.5 px/ms
    assert(r.out.length === 6 && r.out.every((x) => x === 'lower'), JSON.stringify(r.out));
    for (const [k, fires] of [[0, true], [1, true], [2, false]]) {
      r = rig({ flickV: TT.FLICK_V[k] }); path(r, 0, 100, 100, 0, 96, 10, 8);
      assert.strictEqual(r.out.includes('drop'), fires, 'Light / Medium / Firm at 1.2 px/ms');
    }
    r = rig(); path(r, 0, 100, 100, 0, 20, 2, 8); assert.deepStrictEqual(r.out, [], 'too short: under FLICK_MIN');
    r = rig(); path(r, 0, 100, 100, 70, 60, 10, 5); assert(!r.out.includes('drop'), 'too slanted: more than 30 degrees off');
    r = rig(); path(r, 0, 100, 100, 0, 200, 25, 8); assert(!r.out.includes('drop'), 'too long a stroke');
    // A rest, then a swipe: the swipe counts from where the finger set off.
    r = rig(); r.G.down(1, 100, 100, 0, r.o); for (let i = 1; i <= 6; i++) r.G.move(1, 100, 100 + i * 20, 400 + i * 12); r.G.up(1, 100, 220, 480);
    assert(r.out.includes('drop'), JSON.stringify(r.out));
  });
  test('touch: a slide step the swipe itself made in its last 60 ms is taken back first', () => {
    const r = rig();
    r.G.down(1, 100, 100, 0, r.o);
    r.G.move(1, 112, 101, 10); // setting off sideways
    r.G.move(1, 134, 120, 18); // the swipe begins on a slant: a step right
    for (let i = 1; i <= 4; i++) r.G.move(1, 134, 120 + i * 25, 18 + i * 8);
    r.G.up(1, 134, 220, 54);
    assert.deepStrictEqual(r.out.filter((x) => x !== 'lower'), ['move:right', 'move:left:undo', 'drop'], JSON.stringify(r.out));
  });
  test('touch: a slide or a slow lowering that runs straight into a swipe: the swipe still drops, the slide stays', () => {
    let r = rig(), t = 0;
    r.G.down(1, 100, 300, 0, r.o);
    for (let i = 1; i <= 6; i++) r.G.move(1, 100 + i * 12, 300, (t += 30)); // 72 px right, slowly: two steps
    for (let i = 1; i <= 6; i++) r.G.move(1, 172, 300 + i * 25, (t += 10)); // then at once 150 px down at 2.5 px/ms
    r.G.up(1, 172, 450, t + 4);
    assert.deepStrictEqual(r.out.filter((x) => x !== 'lower'), ['move:right', 'move:right', 'drop'], JSON.stringify(r.out));
    r = rig(); t = 0;
    r.G.down(1, 100, 100, 0, r.o);
    for (let i = 1; i <= 12; i++) r.G.move(1, 100, 100 + i * 6, (t += 30)); // 72 px down at 0.2 px/ms: two rows
    for (let i = 1; i <= 6; i++) r.G.move(1, 100, 172 + i * 25, (t += 10));
    r.G.up(1, 100, 322, t + 4);
    assert.deepStrictEqual(r.out.slice(0, 2), ['lower', 'lower'], JSON.stringify(r.out));
    assert.strictEqual(r.out[r.out.length - 1], 'drop', JSON.stringify(r.out));
    // A long drag at more than half the swipe speed is still one old stroke: no drop at its end.
    r = rig({ flickV: 1.5 }); t = 0;
    r.G.down(1, 100, 100, 0, r.o);
    for (let i = 1; i <= 30; i++) r.G.move(1, 100, 100 + i * 8, (t += 8)); // 240 ms at 1 px/ms
    for (let i = 1; i <= 3; i++) r.G.move(1, 100, 340 + i * 16, (t += 8));
    r.G.up(1, 100, 388, t + 4);
    assert(!r.out.includes('drop'), JSON.stringify(r.out));
  });
  test('touch: a swipe away from the floor holds; one drop or hold a touch; on a turned board the floor is where it is', () => {
    let r = rig();
    path(r, 0, 100, 300, 0, -120, 6, 8);
    assert.deepStrictEqual(r.out, ['hold']);
    r = rig();
    r.G.down(1, 100, 300, 0, r.o);
    for (let i = 1; i <= 6; i++) r.G.move(1, 100, 300 - i * 20, i * 8);
    for (let i = 1; i <= 12; i++) r.G.move(1, 100, 180 + i * 20, 48 + i * 8);
    r.G.up(1, 100, 420, 150);
    assert.deepStrictEqual(r.out, ['hold'], 'back down after the hold: nothing');
    r = rig({ slide: 'y', floor: [-1, 0] }); // Sideways: the floor is on the left, vertical moves slide
    path(r, 0, 300, 300, -120, 0, 6, 8);
    assert.deepStrictEqual(r.out.filter((x) => x !== 'lower'), ['drop']);
    r = rig({ slide: 'y', floor: [-1, 0] });
    path(r, 0, 300, 300, 0, 70, 20, 16);
    assert.deepStrictEqual(r.out, ['move:down', 'move:down']);
  });
  test('touch: a two-finger tap turns 180°; a late second finger is ignored; three fingers cancel', () => {
    let r = rig();
    r.G.down(1, 100, 300, 0, r.o); r.G.down(2, 200, 300, 60); r.G.up(1, 101, 300, 150); r.G.up(2, 200, 301, 170);
    assert.deepStrictEqual(r.out, ['r180']);
    r = rig();
    r.G.down(1, 100, 300, 0, r.o); r.G.down(2, 200, 300, 200); r.G.up(1, 100, 300, 220); r.G.up(2, 200, 300, 240);
    assert.deepStrictEqual(r.out, ['tap:left'], 'the second finger came too late for a two-finger tap: ignored, the first one taps');
    r = rig();
    r.G.down(1, 100, 300, 0, r.o); r.G.move(1, 140, 300, 30); r.G.down(2, 200, 300, 60); r.G.move(2, 260, 300, 80); r.G.move(1, 180, 300, 100); r.G.up(2, 260, 300, 110); r.G.up(1, 180, 300, 130);
    assert.deepStrictEqual(r.out, ['move:right', 'move:right'], 'a finger landing during a drag is ignored');
    r = rig();
    r.G.down(1, 100, 300, 0, r.o); r.G.move(1, 140, 300, 30); r.G.down(2, 200, 300, 40); r.G.down(3, 220, 300, 50);
    r.G.move(1, 240, 300, 80); r.G.up(1, 240, 300, 90); r.G.up(2, 200, 300, 90); r.G.up(3, 220, 300, 90);
    assert.deepStrictEqual(r.out, ['move:right'], 'three fingers: cancelled');
    r = rig();
    r.G.down(1, 100, 300, 0, r.o); r.G.move(1, 140, 300, 30); r.G.cancel(1); r.G.up(1, 240, 300, 90);
    assert.deepStrictEqual(r.out, ['move:right'], 'a system gesture (pointercancel): no more');
  });
  test('touch: a new piece mid-touch (gravity set it) takes no drop, lowering or hold; slides go on', () => {
    const r = rig();
    r.G.down(1, 100, 100, 0, r.o);
    r.G.move(1, 100, 140, 40);
    r.G.newPiece();
    for (let i = 1; i <= 5; i++) r.G.move(1, 100, 140 + i * 30, 40 + i * 8);
    for (let i = 1; i <= 10; i++) r.G.move(1, 100 + i * 8, 290, 80 + i * 16);
    r.G.up(1, 180, 290, 260);
    assert.deepStrictEqual(r.out, ['lower', 'move:right', 'move:right'], JSON.stringify(r.out));
    const c = rig(); c.G.down(1, 100, 100, 0, c.o); c.G.move(1, 100, 104, 20); c.G.consume(); c.G.up(1, 100, 104, 60);
    assert.deepStrictEqual(c.out, [], 'consumed (a card came up): not even a tap');
  });
  test('touch: Classic: a finger resting a step or more down the board keeps lowering every Lower repeat', () => {
    const r = rig({ softMs: 70 });
    r.G.down(1, 100, 100, 0, r.o);
    for (let i = 1; i <= 8; i++) r.G.move(1, 100, 100 + i * 5, i * 16); // 40 px down: one lower
    for (let t = 140; t <= 500; t += 16) r.G.tick(t);
    const n = r.out.length;
    assert(n >= 4 && n <= 6 && r.out.every((x) => x === 'lower'), JSON.stringify(r.out));
    r.G.move(1, 100, 120, 510); // moved back up: it stops
    for (let t = 520; t <= 800; t += 16) r.G.tick(t);
    assert.strictEqual(r.out.length, n);
    const q = rig(); q.G.down(1, 100, 100, 0, q.o); for (let t = 16; t < 600; t += 16) q.G.tick(t); q.G.up(1, 100, 100, 600);
    assert.deepStrictEqual(q.out, [], 'no soft drop in Relaxed, and a long still press is nothing');
  });
  test('touch: hints speak gestures to a touch player; taps and swipes retire them', () => {
    load(['hints.js']);
    const { Detector, content } = L.Hints;
    const view = { screenDir: (dx, dy) => [dx, -dy] }, side = { screenDir: (dx, dy) => [dy, dx] };
    assert.deepStrictEqual(content('drop', 'touch', view), ['Swipe ↓ drops']);
    assert.deepStrictEqual(content('lower', 'touch', side), ['Drag ← lowers, then slide'], 'Sideways: the floor is on the left');
    assert.deepStrictEqual(content('hold', 'touch', view), ['Swipe ↑ holds']);
    assert.deepStrictEqual(content('otherWay', 'touch', view), ['Tap left: other way']);
    assert.deepStrictEqual(content('otherWay', 'touch', view, { bothWays: true }), ['Two fingers: 180°']);
    assert.deepStrictEqual(content('invert', 'touch', view), ['Drag is mirrored']);
    assert.deepStrictEqual(content('mouseTurn', 'touch', view), ['Tap turns']);
    const d = new Detector(), place = () => d.action({ act: 'drop', a: 'drop', ok: true, touch: true, set: true, piece: {} }, 0);
    for (let i = 0; i < 8; i++) place();
    assert.deepStrictEqual(d.pending && [d.pending.id, d.pending.variant], ['mouseTurn', 'touch'], 'eight pieces set by touch, never turned');
    const e = new Detector(), p = {};
    for (let i = 0; i < 5; i++) e.action({ act: 'up', a: 'moveL', ok: true, rep: false, touch: true, piece: p, rot: 90 }, i);
    assert.strictEqual(e.pending, null, 'a swipe on a turned board is not an Up key pressed wrong');
    for (let i = 0; i < 3; i++) e.action({ act: 'cw', a: 'cw', ok: true, touch: true, piece: {} }, 10 + i);
    assert(e.hs.retired.mouseTurn, 'tap turns retire the hint');
  });
}

// The economy against the models of play: bots on the real engine, the puzzle model, the career (scripts/econ-test.cjs).
require('./econ-test.cjs')(test, L);

// The Mirror modifier's rules (scripts/mirror-unit.cjs).
require('./mirror-unit.cjs')({ L, test });

// Shapes, the board recipe's shape sets (scripts/shapes-test.cjs).
require('./shapes-test.cjs')(test, L);

// Physics, a board modifier (scripts/physics-test.cjs).
console.log('physics');
require('./physics-test.cjs')(test, L);

// Mural, a board mode (scripts/mural-unit.cjs).
require('./mural-unit.cjs')({ L, test });

// Descent, a board mode (scripts/descent-unit.cjs).
require('./descent-unit.cjs')({ L, test });

// Classic, a board mode, and editing a board's rules (scripts/classic-unit.cjs).
require('./classic-unit.cjs')({ L, test });

// Watch: the bot that plays Classic, headless (scripts/bot-unit.cjs; the long soak is scripts/bot-soak.cjs).
console.log('watch bot');
require('./bot-unit.cjs')({ L, test });

// Race, a board mode, and its AI (scripts/race-unit.cjs).
console.log('race');
require('./race-unit.cjs')({ L, test });

// Battle, a board mode where cleared lines are thrown as pieces, and its AI (scripts/battle-unit.cjs).
console.log('battle');
require('./battle-unit.cjs')({ L, test });

// Lull's own names, colours and voice: nothing of another game's brand in what ships or what documents it.
console.log('own names, colours and voice');
{
  const fsx = require('fs'), pathx = require('path'), ROOT = pathx.join(__dirname, '..');
  const BANNED = /tetris|t-spin|tspin|\bsrs\b|\bnes\b|nintendo|tetrimino/i;
  test('no retired brand word (tetris, t-spin, tspin, srs, nes, nintendo, tetrimino) in Game/** or README.md', () => {
    const files = [pathx.join(ROOT, 'README.md')];
    const walk = (d) => { for (const e of fsx.readdirSync(d, { withFileTypes: true })) { const f = pathx.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } };
    walk(pathx.join(ROOT, 'Game'));
    const hits = [];
    for (const f of files) {
      if (/\.(png|jpe?g|gif|webp|ico|woff2?|otf|ttf|mp3|wav)$/i.test(f)) continue;
      // Embedded audio and fonts are bytes, not words: their base64 is left out.
      const text = fsx.readFileSync(f, 'utf8').replace(/(['"(,])[A-Za-z0-9+/=]{200,}/g, '$1');
      text.split('\n').forEach((line, i) => { const m = BANNED.exec(line); if (m) hits.push(pathx.relative(ROOT, f) + ':' + (i + 1) + ' "' + m[0] + '"'); });
    }
    assert.deepStrictEqual(hits, []);
  });
  test('no piece wears the colour the familiar guideline gives it, in any palette of many hues', () => {
    const GUIDE = { I: 185, O: 55, T: 285, S: 125, Z: 0, J: 220, L: 30 }, ids = Object.keys(GUIDE);
    const hue = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); return d ? 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) : 0; };
    const apart = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    let checked = 0;
    for (const [id, p] of Object.entries(L.PALETTES)) {
      if (!p.colors) continue;
      const hs = ids.map((k) => hue(p.colors[L.Pieces.COLOR[k]]));
      // One-hue palettes (Ink, Moss, Gold Leaf) tell the seven apart by value, not hue.
      if (Math.max(...hs.map((h) => Math.max(...hs.map((x) => apart(h, x))))) < 60) continue;
      checked++;
      ids.forEach((k, i) => assert(apart(hs[i], GUIDE[k]) >= 30, id + ' ' + k + ': hue ' + Math.round(hs[i])));
    }
    assert(checked >= 5, 'the palettes of many hues: ' + checked);
    assert.strictEqual(L.PALETTES.handheld.name, 'Moss');
  });
  test('the announcer: two voices of eleven whispered clips with where her speech is, credited to ElevenLabs; every line she is given has its clip', () => {
    load(['voice-annie.js', 'voice-velvet.js']);
    const KEYS = ['single', 'double', 'triple', 'quad', 'twist', 'twist_single', 'twist_double', 'streak', 'spotless', 'levelup', 'gameover'];
    assert.deepStrictEqual(Object.keys(L.VOICES), ['annie', 'velvet']);
    assert.deepStrictEqual(Object.values(L.VOICES).map((v) => v.name), ['Annie', 'Velvet']);
    const src = fsx.readFileSync(pathx.join(ROOT, 'Game', 'js', 'audio.js'), 'utf8');
    for (const id of Object.keys(L.VOICES)) {
      const V = L.VOICES[id];
      assert.deepStrictEqual(Object.keys(V.clips).sort(), KEYS.slice().sort(), id);
      assert.deepStrictEqual(Object.keys(V.meta).sort(), KEYS.slice().sort(), id);
      for (const k of KEYS) {
        const m = V.meta[k], bytes = Buffer.from(V.clips[k], 'base64');
        assert(bytes.length > 10000 && (bytes.slice(0, 3).toString() === 'ID3' || bytes[0] === 0xff), id + ' ' + k + ' is an MP3');
        assert(m.start >= 0 && m.end > m.start + 0.25 && m.end - m.start < 2 && Math.abs(m.gain) < 12, id + ' ' + k + ' ' + JSON.stringify(m));
      }
      // The silence before each word is skipped (it starts where she speaks).
      assert(KEYS.every((k) => V.meta[k].start > 0.1), id + ': every clip starts where her speech does');
      const head = fsx.readFileSync(pathx.join(ROOT, 'Game', 'js', 'voice-' + id + '.js'), 'utf8').slice(0, 600);
      assert(/ElevenLabs/.test(head) && /eleven_v4/.test(head) && head.includes(V.name) && !/Flick|eleven_v3/.test(head), id + ': credited to ElevenLabs, the voice and the model (eleven_v4)');
    }
    assert(!fsx.existsSync(pathx.join(ROOT, 'Game', 'js', 'voice-data.js')), 'one file a voice');
    assert(/ElevenLabs/.test(src.slice(src.indexOf('the announcer (Classic)'))) && !/Flick|eleven_v3/.test(src), 'credited as generated with ElevenLabs');
    // Her desk is light: a high-pass, her level and a limiter; no EQ, compressor, de-esser or room of her own.
    const desk = src.slice(src.indexOf('    bus() {', src.indexOf('const Announcer')), src.indexOf('    sync() {', src.indexOf('const Announcer')));
    assert(/'highpass'/.test(desk) && (desk.match(/createDynamicsCompressor/g) || []).length === 1 && !/peaking|highshelf|lowpass|createConvolver/.test(desk), 'her desk: a high-pass and a limiter only');
    assert(!fsx.existsSync(pathx.join(__dirname, 'splice-voice.py')), 'the old splicing script is gone');
    if (!L.Announcer) load(['audio.js']);
    const A = L.Announcer, said = new Set();
    for (const r of [{ lines: 1 }, { lines: 2 }, { lines: 3 }, { lines: 4 }, { lines: 4, b2b: true }, { twist: true, lines: 0 }, { twist: true, lines: 1 }, { twist: true, lines: 2 }, { twist: true, lines: 3 },
      { mini: true, lines: 1 }, { lines: 2, perfect: true }]) for (const k of A.phrase(r, 3)) said.add(k);
    said.add('gameover');
    assert.deepStrictEqual([...said].sort(), KEYS.slice().sort(), 'every clip is used and no line lacks one');
    assert.deepStrictEqual(A.phrase({ lines: 4, b2b: true, perfect: true }), ['streak', 'quad', 'spotless']);
  });
  test('saves from before the rename keep their twists, Classic quads, achievements and Classic settings', () => {
    const o = (a, b) => a + b;
    const before = JSON.stringify({ stats: { free: { [o('t', 'spins')]: 3, [o('t', 'spinLines')]: 4 } }, achievements: { [o('cl_tet', 'ris4')]: { at: 1 }, [o('pc_t', 'spin')]: { at: 2 }, cl_sprint60: { at: 3 } },
      history: { d: { [o('tet', 'ris')]: 1, quad: 1 } }, free: { s: { [o('ht', 'spins')]: 2 }, classic: { [o('tet', 'rises')]: 5 }, recipe: { classic: { rand: o('n', 'es'), lock: o('n', 'es'), music: 'korobeiniki' } } } });
    const st = L.loadState(JSON.parse(L.renameOld(before)));
    assert.strictEqual(st.stats.free.twists, 3); assert.strictEqual(st.stats.free.twistLines, 4);
    assert.deepStrictEqual(Object.keys(st.achievements).sort(), ['cl_dash50', 'cl_fourq', 'pc_twist']);
    assert.deepStrictEqual(st.history.d, { cquad: 1, quad: 1 });
    assert.strictEqual(st.free.s.htwists, 2); assert.strictEqual(st.free.classic.quads, 5);
    assert.deepStrictEqual(st.free.recipe.classic, { rand: 'retro', lock: 'retro', music: 'hush' });
    for (const id of ['cl_dash50', 'cl_fourq', 'pc_twist', 'twist100', 'cl_twist10', 'cl_tenq', 'cl_dash']) assert(L.Achievements.LIST.some((a) => a.id === id), id);
  });
}

// The Home Screen web app: the offline copy, the manifest and icons, the deployed build (scripts/web-test.cjs).
require('./web-test.cjs')(test).then(() => {
  console.log(failed ? '\n' + failed + ' failed, ' + passed + ' passed' : '\nall ' + passed + ' passed');
  process.exit(failed ? 1 : 0);
});
