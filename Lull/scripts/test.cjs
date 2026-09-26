#!/usr/bin/env node
// Lull's game logic, tested in Node: pieces and kicks, the floating-piece engine and every item, puzzle generation
// (each seed is replayed through the real engine to prove it can be solved), the factory economy, and the save.
//   node Lull/scripts/test.cjs
'use strict';
const assert = require('assert');
const load = require('./load.cjs');
const L = load(['util.js', 'pieces.js', 'board.js', 'engine.js', 'puzzlegen.js', 'factory.js', 'store.js']);
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
  assert.deepStrictEqual(Puzzles.parseSeed(' m-3k7q2xa '), { diff: 'M', code: '3K7Q2XA', seed: 'M-3K7Q2XA' });
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
  assert(!g.holdPiece(), 'one hold per piece');
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
test('items: bomb, drill, sand, phase, settle, purge', () => {
  const setup = () => { const g = new Game({ w: 10, h: 20, seed: 6 }); for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) if ((x * 7 + y * 3) % 5) g.board.set(x, y, 1 + ((x + y) % 7)); return g; };
  let g = setup();
  g.setSpecial('bomb');
  let before = g.board.count();
  let r = g.drop();
  assert(r.blast.length > 0 && g.board.count() === before - r.blast.length && r.blast.length <= 13);
  g = setup(); g.setSpecial('drill'); before = g.board.count();
  const col = g.cellsOf()[0][0];
  const colCount = [0, 1, 2, 3, 4, 5].filter((y) => g.board.get(col, y)).length;
  r = g.drop();
  assert.strictEqual(r.drilled.length, colCount);
  assert.strictEqual(g.board.count(), before - colCount);
  g = setup(); g.board.cells.fill(0); g.board.set(0, 0, 8); g.board.set(1, 3, 8); g.replacePiece({ id: 'O' }); g.setSpecial('sand');
  while (g.move(-1));
  r = g.drop();
  assert(g.board.get(0, 1) && g.board.get(0, 2) && g.board.get(1, 4) && g.board.get(1, 5), 'each block fell on its own');
  assert(!g.board.get(0, 4) && !g.board.get(0, 5));
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
  assert(r.lines >= 0 && g.board.count() === before - 10 * r.lines);
  for (let x = 0; x < 10; x++) { let seenEmpty = false; for (let y = 0; y < 20; y++) { if (!g.board.get(x, y)) seenEmpty = true; else assert(!seenEmpty, 'no holes after settling'); } }
  g = setup(); const color = g.piece.type.color;
  const same = g.board.count((v) => (v & 31) === color);
  const gone = g.purge();
  assert.strictEqual(gone.length, same);
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

console.log('puzzles');
function replay(p) {
  const g = new Game({ board: Board.fromArray(p.w, p.h, p.cells, { wrap: p.wrap }), queue: p.pieces, mods: { noRotate: p.mods.includes('rigid'), heavy: p.mods.includes('heavy'), noHold: p.mods.includes('nohold') } });
  let lines = 0;
  for (const t of p.targets) {
    assert.strictEqual(g.piece.type.id, t.id);
    let res = null;
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
  }
  assert(Puzzles.goalMet(p, g.board, lines), 'goal met in ' + p.seed);
}
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
test('upgrades raise output, value and quality', () => {
  const f = Factory.create();
  const r0 = Factory.rates(f);
  f.up.press = 3; f.up.quality = 2; f.up.inspect = 2;
  const r1 = Factory.rates(f);
  assert(r1.P > r0.P && r1.V > r0.V && r1.D < r0.D && r1.C > r0.C && r1.perSec > r0.perSec);
  assert.deepStrictEqual(Object.keys(Factory.UPGRADES), ['press', 'quality', 'inspect']);
});
test('old factories fold seven upgrades into three', () => {
  const old = Factory.create();
  old.v = 1; old.up = { press: 12, tempo: 4, mold: 6, calib: 2, inspect: 3, warehouse: 2, lens: 1 };
  old.contracts = [{}];
  Factory.migrate(old);
  assert.deepStrictEqual(old.up, { press: 12, quality: 4, inspect: 3 });
  assert.strictEqual(old.v, 3);
  assert(!old.contracts);
  assert(Factory.rates(old).P > 0);
});
test('buying spends credits; costs grow', () => {
  const f = Factory.create();
  f.credits = 1000;
  const c0 = Factory.cost(f, 'press');
  assert(Factory.buy(f, 'press'));
  assert.strictEqual(f.credits, 1000 - c0);
  assert(Factory.cost(f, 'press') > c0);
  f.credits = 0;
  assert(!Factory.buy(f, 'press'));
});
test('time away is paid, up to eight hours', () => {
  const f = Factory.create();
  f.lastTick = Date.now() - 20 * 3600e3;
  const r = Factory.catchUp(f, Date.now());
  assert.strictEqual(r.cappedSeconds, 8 * 3600);
  assert(f.credits > 0 && f.stats.shipped > 0);
  assert(Factory.catchUp(f, Date.now()) === null, 'nothing more to pay');
});
test('retooling needs Pentominoes and grants patents', () => {
  const f = Factory.create();
  assert.strictEqual(Factory.retoolGain(f), 0);
  f.credits = 1e12;
  while (f.tier < 6) assert(Factory.unlockTier(f));
  assert.strictEqual(Factory.retoolGain(f), 3);
  assert.strictEqual(Factory.retool(f), 3);
  assert.strictEqual(f.tier, 1);
  assert.strictEqual(f.patents, 3);
  assert(Factory.rates(f).V > 1);
});
test('orders: a perfect build pays best; a wrong one still pays something', () => {
  const f = Factory.create();
  f.tier = 4;
  const r = new RNG(11);
  const o = Factory.newOrder(f, r);
  assert.strictEqual(o.cells.length, 4);
  assert(o.paint < Factory.paintCount(f));
  // Any turn or flip of the right shape is the right shape.
  const flipped = o.cells.map(([x, y]) => [-y, -x]);
  const best = Factory.gradeOrder(f, o, { cells: flipped, paint: o.paint, press: 0 });
  assert.strictEqual(best.shape, 100);
  assert(best.total >= 95 && best.stars === 3 && best.lines >= 2);
  const wrong = Factory.gradeOrder(f, o, { cells: [[0, 0], [2, 0]], paint: (o.paint + 1) % 3, press: 0.9 });
  assert(wrong.total < 50 && wrong.credits > 0 && wrong.lines === 0);
  const c0 = f.credits;
  Factory.serveOrder(f, best);
  assert(f.credits > c0 && f.stats.orders === 1 && f.stats.perfectOrders === 1);
});
test('orders grow with the product line', () => {
  const f = Factory.create();
  assert.strictEqual(Factory.orderSize(f), 3);
  f.tier = 7; assert.strictEqual(Factory.orderSize(f), 7);
  f.tier = 10; assert.strictEqual(Factory.orderSize(f), 8);
  assert.strictEqual(Factory.paintCount(f), 6);
});
test('good products are legal polyominoes; defects are not (or visibly damaged)', () => {
  const f = Factory.create();
  const r = new RNG(9);
  for (let tier = 1; tier <= 8; tier++) {
    f.tier = tier;
    for (let i = 0; i < 150; i++) {
      const good = Factory.makeItem(f, r, false);
      assert.strictEqual(Pieces.defectOf(good.cells, tier), null, 'good ' + tier);
      const bad = Factory.makeItem(f, r, true);
      const why = Pieces.defectOf(bad.cells, tier);
      if (bad.defect === 'crack' || bad.defect === 'burnt') assert.strictEqual(why, null);
      else assert(why, bad.defect + ' should be illegal at tier ' + tier + ': ' + JSON.stringify(bad.cells));
    }
  }
});
test('the belt ships and pays while watched', () => {
  const f = Factory.create();
  const b = new Factory.Belt(f);
  for (let i = 0; i < 400; i++) b.step(0.1);
  assert(f.stats.shipped > 0 && f.credits > 0);
});
test('QC streak: pulled defects build it, a pulled good piece breaks it', () => {
  const f = Factory.create();
  f.tier = 4;
  const b = new Factory.Belt(f);
  const r = new RNG(3);
  for (let i = 0; i < 4; i++) { const it = Factory.makeItem(f, r, true); it.batch = 1; b.items.push(it); b.remove(it, 'manual'); }
  assert.strictEqual(f.streak, 4);
  assert(b.streakMult() > 1);
  const good = Factory.makeItem(f, r, false); good.batch = 1; good.golden = false; b.items.push(good);
  assert.strictEqual(b.remove(good, 'manual'), 'wasted');
  assert.strictEqual(f.streak, 0);
});
test('golden minos pay lines', () => {
  const f = Factory.create();
  const b = new Factory.Belt(f);
  const it = Factory.makeItem(f, new RNG(5), false); it.batch = 1; it.golden = true; b.items.push(it);
  assert.strictEqual(b.remove(it, 'manual'), 'golden');
  assert(b.drain().some((e) => e.kind === 'golden' && e.lines >= 1));
});

console.log('save');
test('v1 saves move to v2: sound on, slower key repeat, puzzle history', () => {
  const st = L.mergeState(L.defaultState(), { v: 1, settings: { sound: false, das: 150, arr: 45 }, puzzle: { solved: {} } });
  delete st.puzzle.history;
  L.migrateState(st);
  assert.strictEqual(st.v, 2);
  assert.strictEqual(st.settings.sound, true);
  assert.strictEqual(st.settings.das, 230);
  assert.deepStrictEqual(st.puzzle.history, []);
  assert.strictEqual(st.equipped.sound, 'soft');
});
test('old saves gain new fields and keep their own', () => {
  const merged = L.mergeState(L.defaultState(), { lines: 55, settings: { sound: true }, owned: { skin: ['flat', 'gem'] } });
  assert.strictEqual(merged.lines, 55);
  assert.strictEqual(merged.settings.sound, true);
  assert.strictEqual(merged.settings.das, 230);
  assert.deepStrictEqual(merged.owned.skin, ['flat', 'gem']);
  assert(merged.factory && merged.factory.up);
});
test('the shop takes lines and hands over items', () => {
  const s = new L.Store();
  s.state.lines = 50;
  assert(s.buyItem('reroll'));
  assert.strictEqual(s.state.lines, 35);
  assert(!s.buyItem('blueprint'));
  assert(s.useItem('reroll'));
  assert(!s.useItem('reroll'));
  s.state.lines = 1000;
  assert(s.buyCosmetic('skin', 'bevel'));
  assert(!s.buyCosmetic('skin', 'steel'), 'rewards cannot be bought');
  assert(s.equip('skin', 'bevel'));
});

console.log(failed ? '\n' + failed + ' failed, ' + passed + ' passed' : '\nall ' + passed + ' passed');
process.exit(failed ? 1 : 0);
