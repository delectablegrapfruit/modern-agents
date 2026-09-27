#!/usr/bin/env node
// Lull's game logic, tested in Node: pieces and kicks, the floating-piece engine and every item, puzzle generation
// (each seed is replayed through the real engine to prove it can be solved), the factory economy, and the save.
//   node Lull/scripts/test.cjs
'use strict';
const assert = require('assert');
const load = require('./load.cjs');
const L = load(['util.js', 'pieces.js', 'board.js', 'engine.js', 'items.js', 'puzzlegen.js', 'factory.js', 'store.js', 'achievements.js']);
const { Pieces, Board, Game, Puzzles, Factory, RNG } = L;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
}
const cellKey = (cells) => cells.map((c) => c.join(',')).sort().join(';');

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
test('SRS: T turns from spawn to pointing right', () => {
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
test('the seven keep plain SRS, and puzzles (a fixed queue) keep exactly the turns their generator searched', () => {
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
  assert(!r.b2b && g.s.b2b === -1, 'a laser never feeds the back-to-back streak');
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
test('T-spins: dropped from a turn is not one; one front corner is a Mini', () => {
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
  assert(!r.tspin && !r.mini, 'turned high up, then dropped: no spin');
  g = setup();
  g.board.set(2, 0, 0); g.board.set(4, 0, 0);
  g.board.set(4, 0, 8); g.board.set(2, 2, 8);
  // rot 2 points down: front corners (2,0) and (4,0); now only (4,0) is blocked, plus both back corners.
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true, kick: 1 });
  r = g.lock();
  assert(r.mini && !r.tspin, 'one front corner: T-spin Mini');
});
test('T-spin double is recognised', () => {
  const g = new Game({ w: 10, h: 20, seed: 4 });
  const fill = (y, row) => { for (let x = 0; x < 10; x++) if (row[x] === 'X') g.board.set(x, y, 8); };
  fill(0, 'XXX.XXXXXX');
  fill(1, 'XX...XXXXX');
  g.board.set(4, 2, 8); // the overhang that makes it a spin
  g.replacePiece({ id: 'T' });
  Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true });
  const r = g.lock();
  assert(r.tspin, 'three corners filled after a turn');
  assert.strictEqual(r.lines, 2);
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
test('Safety Net keeps a back-to-back streak through one ordinary clear, once', () => {
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
        // No hidden SRS hops: every turn the solution needs is in place or a sideways nudge.
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
  for (const s of ['E-2A8MPRG', 'E-2PUJ5AL', 'M-3S87VMC', 'M-3EXY2TD', 'H-49QGN36', 'HS-2BRP46L']) {
    const p = Puzzles.generate(s);
    assert(p.mods.includes('hold'), 'Hold: ' + s);
    check(p);
  }
  assert(seen.E >= 6 && seen.M >= 15 && seen.H >= 12 && proved > 100, 'gem puzzles turn up: ' + JSON.stringify(seen) + ', ' + proved);
});
test('making gem puzzles need every piece left every other puzzle exactly as it was', () => {
  // A fingerprint of every puzzle among the first 40 seeds of each kind that was not a gem puzzle, taken before the
  // change (these numbers were gem puzzles then; they may change, and a few now settle for lines).
  const gems = { E: [14, 25, 38, 40], ES: [1, 11, 15], M: [3, 4, 10, 13, 14, 22, 23, 26, 27, 28, 30, 39], MS: [1, 2, 4, 17, 21, 23, 25, 26, 27, 30, 31, 34, 39], H: [9, 17, 20, 21, 22, 25, 26, 27, 32], HS: [10, 14, 16, 22, 23, 25, 38] };
  const h = require('crypto').createHash('sha1');
  let n = 0;
  for (const d of ['E', 'M', 'H']) for (const spin of [false, true]) for (let i = 1; i <= 40; i++) {
    if (gems[d + (spin ? 'S' : '')].includes(i)) continue;
    const p = Puzzles.generate(Puzzles.numberedSeed(d, i, spin));
    assert.notStrictEqual(p.goal.type, 'gems', p.seed);
    n++; h.update(JSON.stringify(p));
  }
  assert.strictEqual(n + ' ' + h.digest('hex'), '192 c6040cf70e8847a36ebcf6c8cc8058f59ae84fac');
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
const counts = { E: 250, M: 250, H: 250 };
for (const d of ['E', 'M', 'H']) {
  test(Puzzles.DIFFS[d].name + ': ' + counts[d] + ' puzzles generate fast and play out through the engine', () => {
    const mods = {}; let ms = 0, worst = 0, pieces = 0;
    for (let n = 1; n <= counts[d]; n++) {
      const t0 = Date.now();
      const p = Puzzles.generate(Puzzles.numberedSeed(d, n));
      const dt = Date.now() - t0; ms += dt; worst = Math.max(worst, dt);
      assert(p && !p.fallback, 'built ' + n);
      p.mods.forEach((m) => { mods[m] = (mods[m] || 0) + 1; });
      pieces += p.pieces.length;
      replay(p);
      // Nothing starts already solved, and no row starts full.
      assert(!Puzzles.goalMet(p, Board.fromArray(p.w, p.h, p.cells), 0));
      assert.strictEqual(Board.fromArray(p.w, p.h, p.cells).fullRows().length, 0);
    }
    const avg = ms / counts[d];
    assert(avg < 40, 'average ' + avg.toFixed(1) + ' ms');
    const expected = Object.keys(Puzzles.MODS).filter((m) => Puzzles.MODS[m].w[d] > 0);
    for (const m of expected) assert(mods[m] > 0, 'wildcard ' + m + ' appears in ' + d);
    console.log('       avg ' + avg.toFixed(1) + ' ms, worst ' + worst + ' ms, ' + (pieces / counts[d]).toFixed(1) + ' pieces each');
  });
}
test('daily seeds change with the day', () => {
  assert.notStrictEqual(Puzzles.dailySeed('M', '2026-09-26'), Puzzles.dailySeed('M', '2026-09-27'));
  assert(Puzzles.parseSeed(Puzzles.dailySeed('H', '2026-09-26')));
});

console.log('factory');
const HOUR = 3600e3;
/** A factory `hours` back in time, caught up to now. */
function ranFor(f, hours) { const now = Date.now(); f.lastTick = now - hours * HOUR; Factory.catchUp(f, now); return f; }
/** A factory with presses 1…p built, each starting a fresh piece from the given seed. */
function withPresses(p, seed) {
  const f = Factory.create();
  f.seed = seed; f.serial = 0; f.molds = []; f.presses = p;
  return Factory.repair(f);
}
const beltOk = (f) => {
  for (let i = 1; i < f.belt.length; i++) {
    const a = f.belt[i], b = f.belt[i - 1];
    if (!(a.x + Factory.widthOf(a) + Factory.BELT.gap <= b.x + 1e-6)) return false;
  }
  return f.belt.every((it) => it.x >= 0 && it.x + Factory.widthOf(it) <= Factory.BELT.len + 1e-9);
};
test('a new factory: one press nearly done, a twelve-row bin, nothing else', () => {
  const f = Factory.create();
  assert.strictEqual(f.v, 6);
  assert.strictEqual(f.presses, 1);
  assert.strictEqual(f.molds.length, 1);
  assert.strictEqual(f.molds[0].p, 0.75);
  assert.strictEqual(Factory.capacity(f), 48);
  assert.strictEqual(Factory.BIN_ROWS[f.binLevel], 12);
  assert.strictEqual(f.bin, '');
  assert.deepStrictEqual(f.belt, []);
  assert(!('credits' in f) && !('crates' in f));
});
test('rates: 24, 54, 90, 132 minos an hour — 6 to 33 lines', () => {
  const f = Factory.create(), got = [Factory.perHour(f)];
  for (let k = 1; k < 4; k++) { Factory.upgrade(f, 'press'); got.push(Factory.perHour(f)); }
  assert.deepStrictEqual(got, [24, 54, 90, 132]);
  assert.strictEqual(Factory.quarters(54 / 4), '13.5');
  assert.strictEqual(Factory.quarters(21 / 4), '5.25');
  assert.strictEqual(Factory.quarters(3 / 4), '0.75');
  assert.strictEqual(Factory.quarters(4800 / 4), '1,200');
  assert.strictEqual(Factory.quarters(132 / 4), '33');
});
test('ten minutes: the first tetromino lands in the bin, one line (a quarter per mino)', () => {
  const f = Factory.create();
  ranFor(f, 600 / 3600);
  assert.strictEqual(f.bin.length, 4);
  assert.strictEqual(f.stats.minos, 4);
  const res = Factory.collect(f);
  assert.strictEqual(res.collected, 1, 'four minos pay one line');
});
test('a day away: the bin fills to capacity and the line waits (nothing lost, nothing more)', () => {
  const f = ranFor(Factory.create(), 24);
  assert.strictEqual(f.bin.length, 48);
  assert(f.molds[0].held, 'the press holds its piece');
  assert(Factory.isFull(f));
  assert(f.belt.length >= 1 && f.belt.length <= 12 && beltOk(f), 'a short queue waits on the belt: ' + f.belt.length);
  assert(f.stats.fullMs > 0);
  assert.strictEqual(f.stats.minos, f.bin.length, 'only minos in the bin count as made');
  assert.strictEqual(f.stats.away, 48);
});
test('the bin never overflows, whatever the presses make', () => {
  for (let seed = 1; seed <= 4; seed++) {
    for (let p = 1; p <= 4; p++) {
      const f = withPresses(p, seed * 97 + p);
      let now = Date.now() - 48 * HOUR;
      f.lastTick = now;
      for (let h = 0; h < 48; h++) { now += HOUR; Factory.catchUp(f, now); assert(f.bin.length <= Factory.capacity(f)); assert(beltOk(f)); }
      assert(f.bin.length > Factory.capacity(f) - 7, 'it stops at most one piece short');
    }
  }
});
test('online steps and catch-up make exactly the same line', () => {
  const a = withPresses(4, 1234);
  a.binLevel = 4;
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 2 * 3600 / 0.25; i++) Factory.step(a, 0.25);
  b.lastTick = Date.now() - 2 * HOUR; Factory.catchUp(b, Date.now());
  assert.strictEqual(a.bin, b.bin);
  assert.deepStrictEqual(a.belt, b.belt);
  assert(a.bin.length > 100);
});
test('the belt: pieces keep their gap, back up when the bin is full, and flow again after collecting', () => {
  const f = withPresses(4, 77);
  let full = false;
  for (let i = 0; i < 12 * 3600; i++) {
    const evs = Factory.step(f, 1);
    assert(beltOk(f), 'no overlap at ' + i);
    if (evs.some((e) => e.kind === 'full')) full = true;
  }
  assert(full && Factory.isFull(f));
  const len = f.bin.length, queue = f.belt.length;
  Factory.step(f, 600);
  assert.strictEqual(f.bin.length, len, 'a full bin takes nothing');
  assert(f.belt.length >= queue);
  const res = Factory.collect(f);
  assert.strictEqual(res.collected, Math.floor(len / 4));
  const evs = Factory.step(f, 60);
  assert(evs.some((e) => e.kind === 'enter') && !Factory.isFull(f), 'the line runs again');
});
test('collect: whole rows only, loose minos stay, days counted once each', () => {
  const f = Factory.create();
  assert.strictEqual(Factory.collect(f), null);
  f.bin = '1234567123456';
  const r = Factory.collect(f, '2026-09-26');
  assert.strictEqual(r.collected, 3); assert.strictEqual(r.loose, 1); assert.strictEqual(f.bin, '6');
  assert.strictEqual(r.taken, '123456712345');
  assert.strictEqual(Factory.collect(f, '2026-09-26'), null, 'three loose minos are not a line');
  f.bin += '1111';
  Factory.collect(f, '2026-09-26');
  assert.strictEqual(f.stats.days, 1);
  f.bin = '12341234';
  Factory.collect(f, '2026-09-27');
  assert.deepStrictEqual([f.stats.days, f.stats.lines, f.stats.collects, f.stats.best], [2, 6, 3, 3]);
});
test('upgrades: exact prices, four presses and five bins at most, paid in lines', () => {
  const f = Factory.create();
  const costs = [];
  let u;
  while ((u = Factory.nextUpgrade(f, 'press'))) { costs.push(u.cost); Factory.upgrade(f, 'press'); }
  assert.deepStrictEqual(costs, [150, 450, 1200]);
  assert.strictEqual(f.presses, 4); assert(!Factory.upgrade(f, 'press'));
  const bins = [];
  while ((u = Factory.nextUpgrade(f, 'bin'))) { bins.push([u.cost, u.to]); Factory.upgrade(f, 'bin'); }
  assert.deepStrictEqual(bins, [[60, 24], [200, 48], [500, 72], [1000, 108]]);
  assert.strictEqual(Factory.capacity(f), 432); assert(!Factory.upgrade(f, 'bin'));
  assert.strictEqual(f.stats.spent, 3560);
  assert.deepStrictEqual(f.molds.map((m) => m.pin), [-1, -1, -1, -1]);
  const s = new L.Store();
  s.state.lines = 149;
  assert(!s.spend(Factory.nextUpgrade(s.state.factory, 'press').cost), 'short of lines');
});
test('shapes: 5, 12, 35, 108, all lying flat; one heptomino has a hole', () => {
  assert.deepStrictEqual([4, 5, 6, 7].map((n) => Factory.shapes(n).length), [5, 12, 35, 108]);
  for (const n of [4, 5, 6, 7]) for (const c of Factory.shapes(n)) { const b = Pieces.boundsOf(c); assert(b.w >= b.h && b.w <= 7 && b.h <= 4 && c.length === n); }
  const holes = Factory.shapes(7).map((c, i) => (Factory.hasHole(c) ? i : -1)).filter((i) => i >= 0);
  assert.deepStrictEqual(holes, [Factory.HOLE]);
  assert(Factory.shapes(6).every((c) => !Factory.hasHole(c)));
  assert.deepStrictEqual(Factory.shapes(5).map((c, s) => Factory.shapeName(5, s)).sort(), ['F', 'I', 'L', 'N', 'P', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((x) => x + '-pentomino'));
  assert.strictEqual(Factory.shapeName(6, 11), 'Hexomino #12');
});
test('a pinned mold makes its shape next; shapes pressed are remembered; the keyhole needs luck', () => {
  const f = withPresses(4, 5);
  assert(Factory.setPin(f, 3, Factory.HOLE));
  assert(!Factory.setPin(f, 1, 12) && !Factory.setPin(f, 9, 0));
  const cur = f.molds[3].s;
  f.molds[3].p = 1; Factory.step(f, 0.25);
  assert.strictEqual(f.belt.find((it) => it.n === 7).s, cur, 'the piece in progress kept its shape');
  assert.strictEqual(f.molds[3].s, Factory.HOLE, 'the next one uses the pin');
  f.molds[3].p = 1;
  for (let i = 0; i < 4 * 60 * 20 && !f.belt.some((it) => it.n === 7 && it.s === Factory.HOLE); i++) Factory.step(f, 0.25);
  const it = f.belt.find((x) => x.n === 7 && x.s === Factory.HOLE);
  assert(it && it.u === 0, 'made on a pin');
  f.bin = ''; f.binLevel = 4;
  for (let i = 0; i < 400 && f.stats.seen[7][Factory.HOLE] !== '1'; i++) Factory.step(f, 1);
  assert.strictEqual(f.stats.seen[7][Factory.HOLE], '1');
  assert.strictEqual(f.stats.holeFree, false, 'a pinned keyhole does not count');
  assert(Factory.seenCount(f, 7) >= 1);
  // An unpinned one does.
  f.belt = [{ n: 7, s: Factory.HOLE, c: 1 + (Factory.HOLE % 7), x: 34 - Factory.widthOf({ n: 7, s: Factory.HOLE }), u: 1 }];
  Factory.step(f, 2);
  assert.strictEqual(f.stats.holeFree, true);
});
test('the same seed makes the same line', () => {
  const a = withPresses(3, 999), b = withPresses(3, 999);
  const now = Date.now();
  a.binLevel = b.binLevel = 4;
  a.lastTick = b.lastTick = now - 10 * HOUR;
  Factory.catchUp(a, now); Factory.catchUp(b, now);
  assert.strictEqual(a.bin, b.bin);
  assert(a.bin.length > 100);
});
test('time: a clock set back makes nothing; a long gap is capped by the bin', () => {
  const f = Factory.create(), now = Date.now();
  f.lastTick = now + HOUR;
  assert.strictEqual(Factory.catchUp(f, now), null);
  assert.strictEqual(f.lastTick, now);
  assert.strictEqual(f.stats.minos, 0);
  const g = withPresses(4, 3); g.binLevel = 4;
  g.lastTick = now - 60 * 24 * HOUR;
  const t0 = Date.now();
  const r = Factory.catchUp(g, now);
  assert.strictEqual(r.seconds, 30 * 86400, 'at most thirty days are replayed');
  assert(g.bin.length <= 432 && g.bin.length > 425);
  assert(Date.now() - t0 < 2000, 'and quickly');
  const one = Factory.create(); one.binLevel = 4; one.lastTick = now - 30 * 24 * HOUR;
  const t1 = Date.now();
  Factory.catchUp(one, now);
  assert(one.bin.length > 425 && Date.now() - t1 < 2000, 'the slowest case (one press, the tallest bin) is quick too');
});
test('a broken factory is repaired', () => {
  const junk = Factory.repair({ v: 6, presses: 9, binLevel: -3, bin: 'zz12!!' + '3'.repeat(100), molds: [{ s: 999, pin: 'x' }, null], belt: [{ n: 4, s: 1, x: 50 }, { n: 9, s: 0, x: 3 }, { n: 5, s: 1, x: 34 }], stats: { minos: 'lots', seen: { 5: '1' } } });
  assert.strictEqual(junk.presses, 4); assert.strictEqual(junk.binLevel, 0);
  assert.strictEqual(junk.molds.length, 4);
  assert(junk.molds.every((m, k) => m.s >= 0 && m.s < Factory.shapes(Factory.MOLDS[k]).length && m.pin === -1));
  assert.strictEqual(junk.bin.length, 48); assert(/^[0-9a-f]+$/.test(junk.bin));
  assert.strictEqual(junk.belt.length, 2); assert(beltOk(junk));
  assert.strictEqual(junk.stats.minos, 0);
  assert.strictEqual(junk.stats.seen[5], '1' + '0'.repeat(11));
  assert.strictEqual(junk.stats.seen[7].length, 108);
  // A press marked as holding an unfinished piece would never move again; broken numbers start over.
  const stuck = Factory.repair({ v: 6, presses: 1, molds: [{ p: 0.3, s: 1, held: true, pin: -1 }], stats: { minos: NaN, lines: -5, fullMs: Infinity } });
  assert.strictEqual(stuck.molds[0].held, false);
  assert.strictEqual(stuck.stats.minos, 0); assert.strictEqual(stuck.stats.lines, 0); assert.strictEqual(stuck.stats.fullMs, 0);
  Factory.step(stuck, 1200);
  assert(stuck.stats.minos >= 4, 'the repaired press runs');
  assert.strictEqual(L.loadState({ factory: null }).factory.presses, 1, 'a save without one gets a new factory');
});

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
  assert.deepStrictEqual(A.check(st, { mode: 'play', r: { lines: 2, tspin: true, combo: 10 }, g }).map((a) => a.id).sort(), ['score250k', 'score50k']);
  g.s.hb2b = 8; g.s.hcombo = 10;
  const big = A.check(st, { mode: 'play', r: { lines: 2, tspin: true, combo: 10, hand: true }, g }).map((a) => a.id).sort();
  assert.deepStrictEqual(big, ['b2b3', 'b2b8', 'combo10', 'combo5', 'tsd'].sort());
  assert.deepStrictEqual(A.check(st, { mode: 'classic', score: 120000, level: 10, tetrises: 1 }).map((a) => a.id).sort(), ['cl_100k', 'cl_l10']);
  st.factory.presses = 4;
  assert.deepStrictEqual(A.check(st, { mode: 'factory' }).map((a) => a.id), ['fac_line']);
  assert.deepStrictEqual(A.check(st, { mode: 'puzzle', diff: 'H', firstTry: true, hinted: true, mods: [] }), [], 'a hinted solve is not a Hard Nut');
});
test('factory achievements: collects measured exactly', () => {
  const A = L.Achievements, st = L.defaultState();
  assert.deepStrictEqual(A.check(st, { mode: 'factory' }), [], 'nothing for a fresh line');
  assert.deepStrictEqual(A.check(st, { mode: 'factory', collected: 99, loose: 1 }), []);
  assert.deepStrictEqual(A.check(st, { mode: 'factory', collected: 60, loose: 2 }), [], 'a sweep leaves nothing behind');
  assert.deepStrictEqual(A.check(st, { mode: 'factory', collected: 60, loose: 0 }).map((a) => a.id), ['fac_sweep']);
  assert.deepStrictEqual(A.check(st, { mode: 'factory', collected: 100, loose: 3 }).map((a) => a.id), ['fac_hundred']);
  st.factory.stats.seen[5] = '1'.repeat(12); st.factory.binLevel = 4;
  assert.deepStrictEqual(A.check(st, { mode: 'factory' }).map((a) => a.id).sort(), ['fac_silo', 'fac_twelve']);
  const fac = A.LIST.filter((a) => a.group === 'factory');
  assert.strictEqual(fac.length, 13);
  assert.deepStrictEqual([fac.filter((a) => a.tier !== 'legend').reduce((n, a) => n + a.pay, 0), fac.filter((a) => a.tier === 'legend').reduce((n, a) => n + a.pay, 0)], [1310, 5200]);
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
test('achievements: a fresh save and a short ordinary game earn nothing', () => {
  const st = L.defaultState(), A = L.Achievements;
  assert(A.LIST.length >= 85, 'many of them');
  assert(A.LIST.filter((a) => a.tier === 'legend').length >= 28, 'plenty of legends');
  assert(A.GROUPS.some((g) => g.id === 'lull') && A.LIST.every((a) => A.GROUPS.some((g) => g.id === a.group)));
  for (const a of A.LIST) assert(a.tier === 'legend' ? a.pay >= 800 : a.pay < 1000, a.id + ' pays for its tier');
  // Nothing on a fresh save, whatever the event.
  for (const mode of ['tick', 'play', 'classic', 'puzzle']) assert.deepStrictEqual(A.check(st, { mode, r: { lines: 0, combo: 0 }, g: new Game({ w: 10, h: 20, seed: 2 }), score: 0, level: 1, lines: 0, tetrises: 0, ms: 0, diff: 'E', firstTry: false, mods: [] }), [], mode);
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
  bot(cg, 150, (r) => { cl += r.lines; tet += r.lines >= 4 ? 1 : 0; t += 1000; earned.push(...A.check(st, { mode: 'classic', r, g: cg, score: cg.s.score, level: 1 + Math.floor(cl / 10), lines: cl, tetrises: tet, ms: t }).map((a) => a.id)); });
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
  const board = (o) => { const g = new Game({ w: 10, h: 20, seed: 1 }); Object.assign(g.s, o || {}); return g; };
  const play = (r, s) => ({ mode: 'play', r: Object.assign({ lines: 0, combo: 0 }, r), g: board(s) });
  const classic = (o, s) => Object.assign({ mode: 'classic', r: { lines: 0, combo: 0 }, g: board(s), score: 0, level: 1, lines: 0, tetrises: 0, ms: 1e7 }, o);
  const puzzle = (o) => Object.assign({ mode: 'puzzle', diff: 'H', firstTry: false, hinted: false, undos: 0, ms: 60000, mods: [] }, o);
  const today = L.dateKey();
  const cases = [
    ['toolbox', play({ lines: 1 }, { items: { reroll: 1, pick: 1, drill: 1, flip: 1 } }), null, true],
    ['toolbox', play({ lines: 1 }, { items: { reroll: 1, pick: 1, drill: 1, flip: 1, double: 1 } })],
    ['mini2', play({ lines: 2, mini: true }), null, true],
    ['mini2', play({ lines: 2, mini: true, hand: true })],
    ['golden_ts', play({ lines: 2, tspin: true, golden: true, hand: true }), null, true],
    ['golden_ts', play({ lines: 3, tspin: true, golden: true, hand: true })],
    ['quads4', play({ lines: 1 }, { quadRun: 4 }), null, true],
    ['quads4', play({ lines: 1 }, { hquads: 4 })],
    ['lines500', play({ lines: 1 }, { lines: 500 })],
    ['tst_b2b', play({ lines: 3, tspin: true, b2b: true, hand: true }, { hb2b: 0 }), null, true],
    ['tst_b2b', play({ lines: 3, tspin: true, b2b: true, hand: true }, { hb2b: 1 })],
    ['old_growth', play({ lines: 0 }, { pieces: 2000, startedAt: Date.now() - 31 * 86400e3 })],
    ['pc_b2b', play({ lines: 4, perfect: true, b2b: true }, { hb2b: 1 }), null, true],
    ['pc_b2b', play({ lines: 4, perfect: true, b2b: true, hand: true }, { hb2b: 1 })],
    ['tspin100', play({ lines: 0 }, { tspins: 100 }), null, true],
    ['tspin100', play({ lines: 0 }, { htspins: 100 })],
    ['all_items', play({ lines: 0 }), (st) => { for (const id of L.ITEM_ORDER) st.stats.items.used[id] = 1; }],
    ['pc_open', play({ lines: 4, perfect: true }, { pieces: 10, lines: 4 })],
    ['pc_tspin', play({ lines: 2, tspin: true, perfect: true, hand: true })],
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
    ['cl_tetris10', classic({ tetrises: 10 })],
    ['cl_nohold', classic({ level: 10 })],
    ['cl_pc', classic({ r: { lines: 2, combo: 0, perfect: true } })],
    ['cl_tst', classic({ r: { lines: 3, combo: 0, tspin: true } })],
    ['cl_sprint', classic({ lines: 40, ms: 89000, tetrises: 1 })],
    ['cl_tspin10', classic({}, { tspins: 10 })],
    ['cl_combo10', classic({ r: { lines: 1, combo: 10 } })],
    ['cl_allquads', classic({ lines: 40, tetrises: 10 })],
    ['cl_sprint60', classic({ lines: 40, ms: 49000, tetrises: 1 })],
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
    ['lu_triathlon', { mode: 'tick' }, (st) => { st.history[today] = { quad: 1, tetris: 1, hard: 1 }; }],
    ['lu_hours10', { mode: 'tick' }, (st) => { st.stats.timeMs.total = 10 * 3600e3; }],
    ['lu_days30', { mode: 'tick' }, (st) => { st.stats.days = 30; }],
    ['lu_100k', { mode: 'tick' }, (st) => { st.stats.lines.earned = 1e5 + 100; st.stats.lines.rewound = 200; }, true],
    ['lu_100k', { mode: 'tick' }, (st) => { st.stats.lines.earned = 1e5; }],
    ['lu_curator', { mode: 'tick' }, (st) => { for (const k of Object.keys(L.COSMETICS)) st.owned[k] = Object.keys(L.COSMETICS[k]); }],
    ['lu_hours100', { mode: 'tick' }, (st) => { st.stats.timeMs.total = 100 * 3600e3; }],
    ['lu_days100', { mode: 'tick' }, (st) => { st.stats.days = 100; }],
    ['lu_1m', { mode: 'tick' }, (st) => { st.stats.lines.earned = 1e6; }],
  ];
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
  assert(!A.check(L.defaultState(), { mode: 'play', r, g }).some((a) => a.id === 'pc' || a.id === 'quad'), 'neither a hand quad nor a hand perfect clear');
  // Lasers clear plain lines: they feed neither back-to-back streak.
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
  // A Settle's perfect clear is not by hand, but the empty board it leaves is a fresh start.
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
  assert.strictEqual(s.state.stats.days, 0, 'a day log entry alone (the factory running) is not a day played');
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

  test('the multiplier: an eighth a link in Free Play (×2.5 at twenty), a half in Classic (×10 at twenty); the chain counts apart', () => {
    assert.deepStrictEqual([0, 1, 8, 9, 12, 16, 19, 20, 30].map((n) => Chain.mult(n)), [1, 1, 1, 1.125, 1.5, 2, 2.375, 2.5, 2.5]);
    assert.deepStrictEqual([0, 1, 2, 3, 10, 19, 20, 40].map((n) => Chain.mult(n, 'classic')), [1, 1, 1, 1.5, 5, 9.5, 10, 10]);
    for (let n = 0; n <= 20; n++) assert.strictEqual(Chain.mult(n), Math.max(1, n / 8), 'the old value (n) divided by eight');
    const g = new Game({ w: 10, h: 20, seed: 1 });
    Object.assign(g.s, { b2b: 13, combo: 4 });
    assert.strictEqual(Chain.streak(g), 14);
    assert.strictEqual(Chain.count(g), 18, 'chain = streak + combo');
    assert.strictEqual(Chain.mult(Chain.streak(g)), 1.75, 'the multiplier ignores the combo');
    assert.strictEqual(Chain.fmt(1.75), '×1.75');
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
    assert(!Combos.detect({ lines: 2, tspin: true, b2b: false }, t).includes('twinspin'));
    assert(Combos.detect({ lines: 2, tspin: true, b2b: true }, t).includes('twinspin'));
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

  test('Golden is worth its price played well, and not otherwise', () => {
    assert.strictEqual(Luck.goldValue(5), 50);
    assert(Luck.goldValue(5) >= L.ITEMS.golden.price * 1.3, 'quads: well over its price');
    assert(Luck.goldValue(2) < L.ITEMS.golden.price, 'ordinary clears: under it');
  });

  test('Double or Nothing: a quad or a T-spin wins double; anything less pays nothing', () => {
    assert(Luck.doubleWins({ lines: 4 }) && Luck.doubleWins({ lines: 2, tspin: true }) && Luck.doubleWins({ lines: 1, tspin: true }));
    assert(!Luck.doubleWins({ lines: 3 }) && !Luck.doubleWins({ lines: 4, plain: 4 }) && !Luck.doubleWins({ lines: 2, mini: true }));
    assert.strictEqual(Luck.DOUBLE_X, 2);
  });

  test('every power-up has a type, a price, a rarity and an icon that is not an emoji; the engine knows every Tool', () => {
    const emoji = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;
    for (const id of L.ITEM_ORDER) {
      const it = L.ITEMS[id];
      assert(L.ITEM_GROUPS.some((g) => g.id === it.group) && it.price > 0 && Gifts.RARITY[it.rarity] && it.icon && it.desc && it.name, id);
      assert(![...it.icon].some((ch) => emoji.test(ch)), id + ' icon');
      assert(it.desc.length <= 90, id + ': a short tooltip');
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
  });

  test('the daily gift: three different power-ups, common ones far more often', () => {
    for (const id of L.ITEM_ORDER) assert(Gifts.weight(id) > 0, id);
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
    const inv0 = inv(s.state);
    const got = s.openGift(t0);
    assert(got && got.length === 3 && inv(s.state) === inv0 + 3);
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

  test('power-ups earned in play: one per hundred lines on a board, never twice for a rewound clear, never backwards', () => {
    const e = { board: null, paid: 0 };
    assert.strictEqual(Earn.lines(e, 'A', 60, 58), 0);
    assert.strictEqual(Earn.lines(e, 'A', 101, 97), 1, 'the hundredth line');
    assert.strictEqual(Earn.lines(e, 'A', 97, 99), 0, 'rewound');
    assert.strictEqual(Earn.lines(e, 'A', 101, 99), 0, 'and cleared again: already paid');
    assert.strictEqual(Earn.lines(e, 'A', 200, 199), 1);
    assert.strictEqual(Earn.lines(e, 'B', 1450, 1449), 0, 'an old board is not paid backwards');
    assert.strictEqual(Earn.lines(e, 'B', 1500, 1498), 1);
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
  assert(/const MONO = '"Lull Line", /.test(fs.readFileSync(path.join(dir, 'js', 'factoryview.js'), 'utf8')));
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
  assert(merged.factory && merged.factory.v === 6 && merged.factory.molds.length === 1);
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
test('the shop sells cosmetics', () => {
  const s = new L.Store();
  s.state.lines = 1000;
  assert(s.buyCosmetic('skin', 'bevel'));
  assert(!s.buyCosmetic('skin', 'steel'), 'rewards cannot be bought');
  assert(s.equip('skin', 'bevel'));
});

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
  test('Classic plays Korobeiniki note for note, in its own key (A minor)', () => {
    // The tune as it is usually written, the A part and the B part, in eighths.
    const A = 'E5 2,B4 1,C5 1,D5 2,C5 1,B4 1,A4 2,A4 1,C5 1,E5 2,D5 1,C5 1,B4 3,C5 1,D5 2,E5 2,C5 2,A4 2,A4 4,' +
      '- 1,D5 2,F5 1,A5 2,G5 1,F5 1,E5 3,C5 1,E5 2,D5 1,C5 1,B4 2,B4 1,C5 1,D5 2,E5 2,C5 2,A4 2,A4 2,- 2';
    const B = 'E5 4,C5 4,D5 4,B4 4,C5 4,A4 4,G#4 4,B4 2,- 2,E5 4,C5 4,D5 4,B4 4,C5 2,E5 2,A5 4,G#5 8';
    assert.strictEqual(flat(SONG.tunes.A), A);
    assert.strictEqual(flat(SONG.tunes.B), B);
    assert.strictEqual(flat(SONG.tunes.slowB), B.split(',').map((t) => t.split(' ')[0] + ' ' + t.split(' ')[1] * 2).join(','), 'the floating bridge is the same line at half time');
    for (const tune of Object.values(SONG.tunes)) assert.strictEqual([].concat(...tune).reduce((n, [, l]) => n + l, 0), 8 * tune.length, 'whole bars of eight eighths');
    assert.strictEqual(SONG.tunes.slowB.length, 16);
    const sections = [...new Set(SONG.bars.map((b) => b.section))];
    assert(sections.length >= 7 && SONG.bars.length >= 48 && SONG.loopFrom === 4, 'a long suite of sections, looping after the intro');
    assert(SONG.bars.filter((b) => b.lead && b.lead === SONG.tunes.A[0]).length >= 3, 'the theme comes round more than once');
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
    const played = new Set(['move', 'rotate', 'lower', 'lock', 'hold', 'clear', 'quad', 'tspin', 'perfect', 'combo', 'boom', 'drill']);
    for (const f of fs.readdirSync(dir)) for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\.play\('([a-z]+)'/g)) played.add(m[1]);
    // The factory plays its line's sounds through a table.
    const table = fs.readFileSync(path.join(dir, 'modes.js'), 'utf8').match(/LINE_SOUNDS = \{([^}]*)\}/);
    assert(table, 'the factory\'s sound table');
    for (const m of table[1].matchAll(/'([a-z]+)'/g)) played.add(m[1]);
    for (const n of ['stamp', 'pack', 'land', 'bell']) assert(played.has(n), n);
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
  const EVENTS = [['move'], ['rotate'], ['lower'], ['lock'], ['hold'], ['blocked'], ['clear', 1], ['clear', 2], ['clear', 3], ['quad'], ['tspin'],
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

console.log(failed ? '\n' + failed + ' failed, ' + passed + ' passed' : '\nall ' + passed + ' passed');
process.exit(failed ? 1 : 0);
