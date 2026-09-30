// Protect's rules in Node (js/guard.js): the recipe and its sizes, the sprout and its bed, the wave plan, stones that
// crumble to fit, moles (routes, digging, boxed in against a wall, patience, swept), leaves lost, regrown and the wilt,
// Undo, Settle, save and resume, items, pay (only own cells, rows with a stone plain), the achievements, and bots that
// earn no more per piece or per action than on a Standard board. Run by test.cjs: require('./protect-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function protectUnit({ L, test }) {
  const { Game, Pieces, Recipe, Pay, Guard, CELL, Library } = L;
  const P = (level) => ({ mode: 'protect', protect: { level: level || 'easy' } });
  const mk = (level, w, h, seed, o) => new Game(Object.assign({ w: w || 10, h: h || 20, seed: seed == null ? 1 : seed, recipe: P(level) }, o || {}));
  const std = (w, h, seed) => new Game({ w: w || 10, h: h || 20, seed: seed == null ? 1 : seed, recipe: {} });
  const G = (g) => Guard.of(g);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  /** The piece in play becomes `id`, turned rot, its box at column x, from the top; then it drops. */
  const dropAt = (g, id, x, rot) => {
    const type = Pieces.get(id);
    g.piece = { type, rot: rot || 0, x, y: g.h - 1 - type.rotBounds[rot || 0].maxY, special: null, entry: { id, rot: 0 }, lastRot: false };
    return g.drop();
  };
  /** A piece set that changes nothing (a Bomb set off in the empty top corner): one step, and nothing else. */
  const idle = (g) => {
    g.piece = { type: Pieces.get('M1'), rot: 0, x: g.w - 1, y: g.h - 1, special: 'bomb', entry: { id: 'M1', rot: 0, special: 'bomb' }, lastRot: false };
    const r = g.lock();
    assert(r && !(r.blast || []).length, 'the corner was empty');
    return r;
  };
  const own = (g, x, y) => g.board.set(x, y, 5);
  const picture = (g) => { const rows = []; for (let y = g.h - 1; y >= 0; y--) { let s = ''; for (let x = 0; x < g.w; x++) { const v = g.board.get(x, y); s += !v ? '.' : v & CELL.ASSET ? 'S' : v & CELL.MOLE ? 'M' : v & CELL.FOREIGN ? 'o' : '#'; } rows.push(s); } return rows.join('\n'); };
  /** A mole put on the board by hand (slot, at x, y). */
  const putMole = (g, slot, x, y, o) => { g.board.set(x, y, Guard.moleCell(slot)); G(g).moles.push(Object.assign({ slot, patience: Guard.LEVELS[G(g).level].patience, dig: 0, tx: -1, ty: -1, face: 1 }, o || {})); };
  const moleAt = (g, slot) => Guard.molesOn(g.board)[slot] || null;
  /** No threats and a long calm: only what a test puts there happens. */
  const quiet = (g) => { const x = G(g); x.plan = []; x.phase = 'calm'; x.left = 1000; return x; };

  /**
   * A tidy player (El-Tetris weights, and on Protect a roof over the sprout), deterministic: the real controls (turns,
   * moves, a hard drop). n pieces or until the board ends; each lock's pay as Free Play pays it (Pay.clear).
   */
  function bot(g, n, each) {
    let paid = 0;
    g.on('lock', (r) => { if (!r.lines) return; g.s.mult = Pay.mult(g); paid += Pay.clear(g.s, r, g.rules).pay; });
    const W = g.w, H = g.h, guard = G(g);
    const judge = (sim) => {
      const t = sim.board, hs = [];
      let rowT = 0, colT = 0, holes = 0, wellSum = 0;
      for (let x = 0; x < W; x++) hs.push(Guard.colTop(t, x));
      for (let y = 0; y < H; y++) { let prev = 1; for (let x = 0; x < W; x++) { const f = t.get(x, y) ? 1 : 0; if (f !== prev) rowT++; prev = f; } if (!prev) rowT++; }
      for (let x = 0; x < W; x++) { let prev = 1; for (let y = 0; y < H; y++) { const f = t.get(x, y) ? 1 : 0; if (f !== prev) colT++; if (!f && y < hs[x]) holes++; prev = f; } }
      for (let x = 0; x < W; x++) { const d = Math.min(x ? hs[x - 1] : 99, x < W - 1 ? hs[x + 1] : 99) - hs[x]; if (d > 0 && d < 90) wellSum += d * (d + 1) / 2; }
      const lines = sim.n + sim.c, land = sim.abs.reduce((a, c) => a + c[1], 0) / sim.abs.length;
      let v = -4.5 * land + 3.4 * lines - 3.2 * rowT - 9.3 * colT - 7.9 * holes - 3.4 * wellSum;
      if (guard) {
        let expose = 0;
        for (let x = guard.ax; x < guard.ax + guard.sw; x++) if (!t.get(x, Guard.BED)) expose += 3;
        for (let y = 0; y < Guard.BED; y++) { if (!t.get(guard.ax - 1, y)) expose++; if (!t.get(guard.ax + guard.sw, y)) expose++; }
        v -= expose * 6;
      }
      return v;
    };
    for (let i = 0; i < n && !g.over && g.piece; i++) {
      const p = g.piece;
      let best = null;
      for (let rot = 0; rot < 4; rot++) {
        const b = p.type.rotBounds[rot];
        for (let x = -b.minX; x <= W - 1 - b.maxX; x++) {
          const sim = g.simulate(p.type, rot, x);
          if (!sim) continue;
          const v = judge(sim);
          if (!best || v > best.v) best = { v, rot, x };
        }
      }
      if (!best) break;
      for (let k = 0; k < best.rot; k++) g.rotate(1);
      for (let k = 0; k < W && g.piece.x !== best.x; k++) if (!g.move(Math.sign(best.x - g.piece.x))) break;
      g.drop();
      if (each) each(g, i);
    }
    const acts = g.s.moves + g.s.rotations + g.s.drops + g.s.lowers + g.s.holds;
    return { pieces: g.s.pieces, paid, perPiece: paid / Math.max(1, g.s.pieces), perAct: paid / Math.max(1, acts), over: g.over, end: g.endKind };
  }

  console.log('protect');

  test('protect: the recipe, its label and sizes (6 × 12 at least; the shapes fit above the bed), Tornado, Trapdoor and Mirror World refused', () => {
    assert.strictEqual(Recipe.label(P('easy')), 'Protect Easy');
    assert.strictEqual(Recipe.label(P('hard'), true), 'Protect Hard');
    assert.deepStrictEqual(Recipe.normalize({ mode: 'protect', protect: { level: 'nope' } }).protect, { level: 'easy' });
    assert.deepStrictEqual(Recipe.normalize({ mode: 'protect' }).protect, { level: 'easy' });
    assert.strictEqual(Recipe.normalize({ mode: 'plain', protect: { level: 'hard' } }).protect, undefined, 'a plain board has no level');
    assert.deepStrictEqual(Recipe.limits(P()), { w: [6, 20], h: [12, 40] });
    assert.deepStrictEqual(Recipe.clampSize({ w: 4, h: 8 }, P()), { w: 6, h: 12 });
    assert.deepStrictEqual(Library.clampSize({ w: 4, h: 8 }, P('medium')), { w: 6, h: 12 });
    // A shape set that needs 16 rows needs 18 here (its pieces must fit in the rows above the sprout's bed).
    Recipe.part({ key: 'ttall', order: 10, limits: (r, lim) => { lim.h[0] = Math.max(lim.h[0], 16); } });
    try { assert.deepStrictEqual(Recipe.limits(P()).h, [18, 40]); assert.deepStrictEqual(Recipe.limits({}).h, [16, 40]); } finally { Recipe.unpart('ttall'); }
    const R = Recipe.rules(P(), 10);
    assert.deepStrictEqual(R.refuse, { tornado: 'Not in Protect', trapdoor: 'Not in Protect', flip: 'Not in Protect' });
    assert(R.rated && R.feats && R.lk === 1 && R.undo, 'rated, as the shape set is (D6)');
    const g = mk();
    for (const id of ['tornado', 'trapdoor', 'flip']) assert.strictEqual(g.allow(id), 'Not in Protect');
    for (const id of ['settle', 'bomb', 'drill', 'laser', 'blackhole', 'rewind', 'fit', 'double', 'net']) assert.strictEqual(g.allow(id), null, id);
    assert(!std().ext.some((e) => e.key === 'protect') && G(std()) === null, 'a default board has no guard');
    assert.deepStrictEqual(Recipe.conflicts(P()), {}, 'Protect goes with every shape set and modifier');
    // The engine refuses them too, whatever asks (the power-up bar refuses first).
    assert.strictEqual(Recipe.rules({ mode: 'protect', mods: { mirror: true } }, 10).refuse.tornado, 'Not in Protect');
  });

  test('protect: the sprout is centred on the floor at every width 6–20 (2 wide on even widths, 3 on odd), with 3 leaves', () => {
    for (let w = 6; w <= 20; w++) {
      const g = mk('easy', w, 12 + (w % 3)), x = G(g);
      assert.strictEqual(x.sw, w % 2 ? 3 : 2, w + ': width');
      assert.strictEqual(x.ax, w - (x.ax + x.sw), w + ': centred (as much room each side)');
      for (let y = 0; y < g.h; y++) for (let xx = 0; xx < w; xx++) {
        const v = g.board.get(xx, y), inside = y < 2 && xx >= x.ax && xx < x.ax + x.sw;
        assert.strictEqual(v, inside ? (CELL.ASSET | CELL.SPROUT) : 0, w + ': ' + xx + ',' + y);
      }
      assert.strictEqual(x.leaves, 3);
      assert(g.piece && g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y), w + ': the first piece is in play');
    }
    assert(g6Plays(), 'a 6 × 12 board plays');
    function g6Plays() { const g = mk('hard', 6, 12, 3); for (let i = 0; i < 5; i++) idle(g); return !g.over && g.s.pieces === 5; }
  });

  test('protect: the bed rows never clear (a lock, the Laser, Best Fit’s copies) and nothing removes the sprout', () => {
    const g = mk('easy', 10, 20, 1), x = quiet(g);
    for (let y = 0; y < 3; y++) for (let xx = 0; xx < 10; xx++) if (!g.board.get(xx, y) && !(y === 2 && xx === 9)) own(g, xx, y);
    assert.deepStrictEqual(g.fullRows(), [], 'rows 0 and 1 are full, and are the bed');
    const r = dropAt(g, 'M1', 9);
    assert.deepStrictEqual(r.rows, [2]);
    for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) assert(g.board.get(xx, y), 'the bed is still full');
    // Best Fit's simulation sees the same.
    for (let xx = 0; xx < 9; xx++) own(g, xx, 2);
    const sim = g.simulate(Pieces.get('M1'), 0, 9);
    assert.strictEqual(sim.n + sim.c, 1, 'only row 2');
    // A Laser through the bed rows leaves them (they hold the sprout).
    const h = mk('easy', 10, 20, 2);
    quiet(h);
    for (let xx = 0; xx < 10; xx++) if (!h.board.get(xx, 0)) own(h, xx, 0);
    h.piece = { type: Pieces.TYPES.I, rot: 1, x: 0 - Pieces.TYPES.I.rotBounds[1].minX, y: 1 - Pieces.TYPES.I.rotBounds[1].minY, special: 'laser', entry: { id: 'I', rot: 0, special: 'laser' }, lastRot: false };
    const lr = h.lock();
    assert(lr && !lr.laser.includes(0) && !lr.laser.includes(1), 'laser rows: ' + (lr && lr.laser));
    assert.strictEqual(h.board.count((v) => v & CELL.ASSET), 4);
    // Bomb and Black Hole go around it; the Drill stops on it.
    for (const special of ['bomb', 'blackhole']) {
      const k = mk('easy', 10, 20, 3);
      quiet(k);
      k.piece = { type: Pieces.get('M1'), rot: 0, x: G(k).ax, y: 2, special, entry: { id: 'M1', rot: 0, special }, lastRot: false };
      k.lock();
      assert.strictEqual(k.board.count((v) => v & CELL.ASSET), 4, special);
    }
    const d = mk('easy', 10, 20, 4);
    quiet(d);
    own(d, G(d).ax, 2); own(d, G(d).ax, 3);
    d.piece = { type: Pieces.get('M1'), rot: 0, x: G(d).ax, y: 10, special: 'drill', entry: { id: 'M1', rot: 0, special: 'drill' }, lastRot: false };
    const dr = d.drop();
    assert.strictEqual(dr.drilled.length, 2, 'the drill takes the blocks above it');
    assert.strictEqual(d.board.count((v) => v & CELL.ASSET), 4, 'and stops at the sprout');
    assert.strictEqual(G(d).seq, 1, 'a Drill is a piece set: one step');
    assert(x);
  });

  test('protect: the same seed gives the same threats, on the guard’s own stream (the pieces come as on a plain board)', () => {
    const run = (seed) => { const g = mk('hard', 10, 20, seed); for (let i = 0; i < 40; i++) idle(g); return { plan: clone(G(g).plan), board: picture(g), st: clone(G(g).st), queue: g.queue.map((e) => e.id).join('') }; };
    assert.deepStrictEqual(run(7), run(7));
    assert.notDeepStrictEqual(run(7).plan, run(8).plan);
    const a = mk('hard', 10, 20, 7), b = std(10, 20, 7);
    assert.deepStrictEqual(a.queue.map((e) => e.id), b.queue.map((e) => e.id), 'dealing is untouched');
    // The first wave's plan: its stones and moles spread through 24 pieces, none sooner than its warning.
    const g = mk('hard', 10, 20, 5);
    for (let i = 0; i < 8; i++) idle(g);
    const x = G(g);
    assert.strictEqual(x.wave, 1); assert.strictEqual(x.phase, 'wave');
    assert.strictEqual(x.plan.filter((t) => t.kind === 'stone').length, 3, 'Hard: 3 stones in wave 1 at 10 wide');
    assert.strictEqual(x.plan.filter((t) => t.kind === 'mole').length, 2, 'Hard: moles from wave 1, 2 of them');
    assert(x.plan.every((t) => t.at - x.seq >= Guard.LEVELS.hard.warn && t.at - x.seq < 24), JSON.stringify(x.plan));
    // Stones scale with the width.
    const wide = mk('easy', 20, 20, 5);
    for (let i = 0; i < 12; i++) idle(wide);
    assert.strictEqual(G(wide).plan.filter((t) => t.kind === 'stone').length, 4, 'Easy at 20 wide: 2 × 2');
  });

  test('protect: stones crumble to fit (each column on its own top: no covered hole); one on the bare sprout costs a leaf and sets nothing', () => {
    const g = mk('hard', 10, 20, 1), x = quiet(g);
    for (let y = 0; y < 3; y++) own(g, 0, y);
    own(g, 1, 0);
    x.plan = [{ at: x.seq + 1, kind: 'stone', x: 0, sw: 2, sh: 2 }];
    const r = idle(g);
    assert.strictEqual(g.board.get(0, 3), Guard.STONE); assert.strictEqual(g.board.get(0, 4), Guard.STONE);
    assert.strictEqual(g.board.get(1, 1), Guard.STONE); assert.strictEqual(g.board.get(1, 2), Guard.STONE);
    assert.strictEqual(g.board.get(1, 3), 0, 'nothing hangs over a hole');
    assert.deepStrictEqual(r.guard.stones[0].cells.length, 4);
    assert.strictEqual(x.leaves, 3); assert.strictEqual(x.st.stones, 1);
    // On the bare sprout: a leaf, and nothing set.
    x.plan = [{ at: x.seq + 1, kind: 'stone', x: x.ax, sw: 1, sh: 1 }];
    const before = g.board.count();
    const r2 = idle(g);
    assert.strictEqual(x.leaves, 2); assert.strictEqual(x.st.hits, 1); assert.strictEqual(x.st.lost, 1);
    assert(r2.guard.stones[0].hit && r2.guard.lost === 1);
    assert.strictEqual(g.board.count(), before, 'nothing was set');
    // Covered, it lands on the roof.
    own(g, x.ax + 1, 2);
    x.plan = [{ at: x.seq + 1, kind: 'stone', x: x.ax + 1, sw: 1, sh: 1 }];
    idle(g);
    assert.strictEqual(x.leaves, 2); assert.strictEqual(g.board.get(x.ax + 1, 3), Guard.STONE);
    // One wider than the roof: any column on the sprout breaks the whole stone.
    x.plan = [{ at: x.seq + 1, kind: 'stone', x: x.ax, sw: 2, sh: 1 }];
    idle(g);
    assert.strictEqual(x.leaves, 1); assert.strictEqual(g.board.get(x.ax + 1, 4), 0);
    // A full column: a stone there is lost above the top.
    const k = mk('easy', 6, 12, 1), kx = quiet(k);
    for (let y = 0; y < 12; y++) own(k, 0, y);
    kx.plan = [{ at: kx.seq + 1, kind: 'stone', x: 0, sw: 1, sh: 1 }];
    idle(k);
    assert.strictEqual(kx.st.stones, 1); assert.strictEqual(k.board.count((v) => v === Guard.STONE), 0);
  });

  test('protect: a mole crawls to the sprout along what is solid, the nearest way, and nibbles a leaf; never through your blocks', () => {
    const g = mk('medium', 10, 20, 1), x = quiet(g);
    putMole(g, 0, 0, 0);
    const path = Guard.route(g.board, x, 0, 0).path;
    assert.deepStrictEqual(path, [[1, 0], [2, 0], [3, 0]], 'along the floor');
    idle(g); assert.deepStrictEqual(moleAt(g, 0), [1, 0]);
    idle(g); idle(g); assert.deepStrictEqual(moleAt(g, 0), [3, 0]);
    const r = idle(g);
    assert.strictEqual(x.leaves, 2); assert.strictEqual(x.st.taps, 1); assert.strictEqual(moleAt(g, 0), null);
    assert.strictEqual(r.guard.moles[0].kind, 'nibble'); assert.deepStrictEqual(x.moles, []);
    // Walled off by your blocks (and the ceiling), it cannot get in: it goes as near as it can and waits.
    const k = mk('medium', 10, 20, 2), kx = quiet(k);
    for (let y = 0; y < 20; y++) own(k, 2, y);
    putMole(k, 1, 0, 0);
    const rt = Guard.route(k.board, kx, 0, 0);
    assert(!rt.reach && rt.path.every(([px]) => px < 2), JSON.stringify(rt));
    assert.deepStrictEqual(rt.path, [[1, 0]], 'the reachable cell nearest the sprout');
    for (let i = 0; i < 5; i++) idle(k);
    assert.deepStrictEqual(moleAt(k, 1), [1, 0]); assert.strictEqual(kx.leaves, 3);
    // A low wall of your blocks stops it too: it climbs the wall's face (and the side wall's) but never rounds a corner in
    // the open, and never crawls along the open top of the well.
    const c = mk('medium', 10, 20, 3), cx = quiet(c);
    for (let y = 0; y < 4; y++) own(c, 2, y);
    putMole(c, 2, 0, 0);
    const cr = Guard.route(c.board, cx, 0, 0);
    assert(!cr.reach && cr.path.every(([px, py]) => px < 2 && !c.board.get(px, py)), JSON.stringify(cr));
    // With a stone in that wall, it digs through.
    c.board.set(2, 0, Guard.STONE);
    const cs = Guard.route(c.board, cx, 0, 0);
    assert(cs.reach && cs.path.some(([px, py]) => px === 2 && py === 0) && cs.path.every(([px, py]) => !c.board.get(px, py) || Guard.isStone(c.board.get(px, py))), JSON.stringify(cs));
    // Easy's moles move every second piece.
    const e = mk('easy', 10, 20, 4);
    quiet(e);
    putMole(e, 0, 0, 0);
    const seen = [];
    for (let i = 0; i < 4; i++) { idle(e); seen.push(moleAt(e, 0)[0]); }
    assert.deepStrictEqual(seen, [0, 1, 1, 2], 'one cell per 2 pieces: ' + seen);
  });

  test('protect: a mole digs through a stone in the level’s time (Easy 3 pieces, Medium 2, Hard 1)', () => {
    for (const [level, dig] of [['easy', 3], ['medium', 2], ['hard', 1]]) {
      const g = mk(level, 10, 20, 1), x = quiet(g);
      // A tall stone pillar: no way over it.
      for (let y = 0; y < 20; y++) g.board.set(2, y, Guard.STONE);
      putMole(g, 0, 1, 0);
      const pace = Guard.LEVELS[level].pace;
      // It steps into the stone on the dig-th piece it acts on.
      let acted = 0, at = null;
      for (let i = 0; i < 12 && !at; i++) { idle(g); if (x.seq % pace === 0) acted++; if (moleAt(g, 0)[0] === 2) at = acted; }
      assert.strictEqual(at, dig, level + ': in after ' + at + ' of its turns');
      assert.strictEqual(x.st.dug, 1);
      assert(g.board.get(2, 0) & CELL.MOLE, 'the stone is gone, the mole in its place');
    }
  });

  test('protect: boxed in by solid cells that are not stones (your blocks, the wall, the floor) a mole curls up into a stone', () => {
    const g = mk('medium', 10, 20, 1), x = quiet(g);
    // Against the left wall and the floor, your blocks right and above: the wall (WALL, from outside the board) is no stone.
    putMole(g, 0, 0, 0); own(g, 1, 0); own(g, 0, 1);
    assert(g.board.get(-1, 0) & CELL.WALL && !(g.board.get(-1, 0) & (CELL.FOREIGN | CELL.ASSET | CELL.MOLE | CELL.FILL)) && g.board.filled(-1, 0));
    const r = idle(g);
    assert.strictEqual(g.board.get(0, 0), Guard.STONE); assert.strictEqual(x.st.boxed, 1); assert.deepStrictEqual(x.moles, []);
    assert.strictEqual(r.guard.moles[0].kind, 'boxed');
    // With a stone beside it, it is not boxed in: it digs.
    const k = mk('medium', 10, 20, 2), kx = quiet(k);
    putMole(k, 0, 0, 0); k.board.set(1, 0, Guard.STONE); own(k, 0, 1);
    idle(k);
    assert(k.board.get(0, 0) & CELL.MOLE && kx.st.boxed === 0, 'still a mole');
    // Another mole counts as solid; the one after it (slot order) then has a stone beside it, and stays a mole.
    const m = mk('medium', 10, 20, 3), mx = quiet(m);
    putMole(m, 0, 0, 0); putMole(m, 1, 1, 0, { patience: 99 }); own(m, 0, 1); own(m, 1, 1); own(m, 2, 0);
    idle(m);
    assert.strictEqual(m.board.get(0, 0), Guard.STONE); assert.strictEqual(mx.st.boxed, 1);
    assert(m.board.get(1, 0) & CELL.MOLE || m.board.get(0, 0) & CELL.MOLE, 'the other is still a mole (it digs in)');
  });

  test('protect: a mole out of patience wanders off; one in a cleared row is swept away (the row is plain); at most 4 are out', () => {
    const g = mk('easy', 10, 20, 1), x = quiet(g);
    for (let y = 0; y < 20; y++) own(g, 2, y);
    putMole(g, 0, 0, 0, { patience: 3 });
    idle(g); idle(g);
    assert(moleAt(g, 0));
    const r = idle(g);
    assert.strictEqual(moleAt(g, 0), null); assert.strictEqual(x.st.gone, 1); assert.strictEqual(r.guard.moles.find((m) => m.slot === 0).kind, 'gone');
    // Swept: a mole in a row that clears.
    const k = mk('easy', 10, 20, 2), kx = quiet(k);
    for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) if (!k.board.get(xx, y)) own(k, xx, y);
    for (let xx = 1; xx < 9; xx++) own(k, xx, 2);
    putMole(k, 0, 0, 2);
    const kr = dropAt(k, 'M1', 9);
    assert.deepStrictEqual(kr.rows, [2]); assert.strictEqual(kx.st.swept, 1); assert.deepStrictEqual(kx.moles, []);
    assert(kr.n === 0 && kr.c === 1 && !kr.quad, 'the row held a mole: plain');
    assert.strictEqual(kx.st.blasted, 0, 'swept, not blasted');
    // Five due at once: four come in, the fifth waits for a slot.
    const f = mk('hard', 10, 20, 3), fx = quiet(f);
    fx.plan = [0, 1, 0, 1, 0].map((side) => ({ at: fx.seq + 1, kind: 'mole', side }));
    idle(f);
    assert.strictEqual(fx.moles.length, 4); assert.strictEqual(fx.plan.length, 1); assert.strictEqual(fx.plan[0].at, fx.seq + 1);
    assert.deepStrictEqual(Object.keys(Guard.molesOn(f.board)).sort(), ['0', '1', '2', '3']);
  });

  test('protect: a wave that ends regrows a leaf (Hard: every second wave); at 0 leaves the board wilts, and Undo takes it back', () => {
    const regrow = (level, wave) => { const g = mk(level, 10, 20, 1), x = G(g); Object.assign(x, { phase: 'wave', left: 1, plan: [], wave, leaves: 2 }); const r = idle(g); return { leaves: x.leaves, r, x }; };
    const e = regrow('easy', 1);
    assert.strictEqual(e.leaves, 3); assert.strictEqual(e.x.phase, 'calm'); assert.strictEqual(e.x.left, 12); assert.strictEqual(e.x.st.waves, 1);
    assert.deepStrictEqual(e.r.guard.wave, { end: 1 }); assert.strictEqual(e.r.guard.grew, 1);
    assert.strictEqual(regrow('medium', 1).leaves, 3);
    assert.strictEqual(regrow('hard', 1).leaves, 2, 'Hard: not after wave 1');
    assert.strictEqual(regrow('hard', 2).leaves, 3, 'Hard: after wave 2');
    // A wave with threats still to come waits for them.
    const w = mk('easy', 10, 20, 2), wx = G(w);
    Object.assign(wx, { phase: 'wave', left: 1, plan: [{ at: wx.seq + 5, kind: 'mole', side: 0 }] });
    idle(w);
    assert.strictEqual(wx.phase, 'wave'); assert.strictEqual(wx.left, 1);
    // The wilt.
    const g = mk('easy', 10, 20, 3), x = quiet(g);
    x.leaves = 1;
    x.plan = [{ at: x.seq + 1, kind: 'stone', x: x.ax, sw: 1, sh: 1 }];
    const events = [];
    g.on('lock', () => events.push('lock')); g.on('topout', () => events.push('topout'));
    const r = idle(g);
    assert(r.guard.out && x.leaves === 0);
    assert(g.over && g.endKind === 'wilted' && !g.piece, 'over, no next piece');
    assert.deepStrictEqual(events, ['lock', 'topout'], 'the end is told after the lock');
    const saved = JSON.parse(JSON.stringify(g.toJSON()));
    assert.strictEqual(saved.ended, 'wilted');
    assert(Recipe.valid(saved) && Library.playable(saved));
    const back = new Game({ saved });
    assert(back.over && back.endKind === 'wilted' && G(back).leaves === 0, 'it comes back wilted');
    g.undo();
    assert(!g.over && g.endKind === null && G(g).leaves === 1 && g.piece, 'Undo: the leaf is back, and the piece');
  });

  test('protect: Undo restores the guard exactly (the same placement brings the same threats); Settle runs no step', () => {
    const g = mk('hard', 10, 20, 11);
    bot(g, 60);
    const before = { G: clone(G(g)), cells: Array.from(g.board.cells) };
    delete before.G.book;
    const piece = { id: g.piece.type.id };
    const r1 = dropAt(g, piece.id, 3);
    const after = { G: clone(G(g)), cells: Array.from(g.board.cells) };
    g.undo();
    const now = clone(G(g)); delete now.book;
    assert.deepStrictEqual(now, before.G, 'the guard, deep-equal');
    assert.deepStrictEqual(Array.from(g.board.cells), before.cells);
    const r2 = dropAt(g, piece.id, 3);
    assert.deepStrictEqual(clone(G(g)).plan, after.G.plan);
    assert.deepStrictEqual(Array.from(g.board.cells), after.cells, 'the same placement, the same threats');
    assert.deepStrictEqual(clone(r2.guard), clone(r1.guard));
    // Settle: the blocks fall (the sprout stays put, moles fall with their columns), and no step.
    const k = mk('medium', 10, 20, 2), kx = quiet(k);
    own(k, 0, 5); putMole(k, 0, 0, 6); k.board.set(kx.ax, 7, Guard.STONE);
    const seq = kx.seq;
    assert(k.settle());
    assert.strictEqual(kx.seq, seq, 'no step');
    assert.strictEqual(k.board.get(0, 0), 5); assert(k.board.get(0, 1) & CELL.MOLE);
    assert.strictEqual(k.board.get(kx.ax, 2), Guard.STONE, 'a stone comes down onto the sprout’s roof: it rests there');
    assert.strictEqual(kx.leaves, 3, 'and costs no leaf (only a falling threat does)');
    assert.strictEqual(k.board.count((v) => v & CELL.ASSET), 4);
    // The next step finds the mole where Settle put it (it moved; nothing was taken).
    idle(k);
    assert.strictEqual(kx.st.blasted, 0); assert.strictEqual(kx.moles.length, 1);
    k.undo(); k.undo();
    assert.strictEqual(G(k).seq, seq); assert(k.board.get(0, 6) & CELL.MOLE, 'Undo takes Settle back too');
  });

  test('protect: save and resume in the middle of 300 bot pieces plays on exactly as an unbroken run', () => {
    for (const level of ['easy', 'hard']) {
      const a = mk(level, 10, 20, 21), trace = [];
      bot(a, 300, (g) => trace.push(g.board.cells.join(',') + '|' + JSON.stringify(G(g))));
      let b = mk(level, 10, 20, 21);
      const trace2 = [];
      bot(b, 150, (g) => trace2.push(g.board.cells.join(',') + '|' + JSON.stringify(G(g))));
      const saved = JSON.parse(JSON.stringify(b.toJSON()));
      assert(Recipe.valid(saved) && Library.playable(saved), 'the save is sound');
      b = new Game({ saved });
      bot(b, 150, (g) => trace2.push(g.board.cells.join(',') + '|' + JSON.stringify(G(g))));
      assert.strictEqual(trace2.length, trace.length, level);
      for (let i = 0; i < trace.length; i++) assert.strictEqual(trace2[i], trace[i], level + ': piece ' + i);
      assert(G(a).st.stones > 5 && G(a).st.moles > 1, level + ': threats came: ' + JSON.stringify(G(a).st));
    }
  });

  test('protect: a saved board is sound only with its guard; the summary carries its numbers; the sprout is 31 in a record', () => {
    const g = mk('medium', 10, 20, 5);
    for (let i = 0; i < 30; i++) idle(g);
    const s = JSON.parse(JSON.stringify(g.toJSON()));
    assert(s.x && s.x.protect && Library.playable(s));
    const bad = (f) => { const t = clone(s); f(t); return Library.playable(t); };
    assert(!bad((t) => { delete t.x.protect; }), 'no guard');
    assert(!bad((t) => { t.x.protect.leaves = 7; }), 'leaves');
    assert(!bad((t) => { t.x.protect.ax = 0; }), 'the sprout elsewhere');
    assert(!bad((t) => { t.x.protect.level = 'extreme'; }), 'level');
    assert(!bad((t) => { t.x.protect.plan = [{ at: 1, kind: 'meteor' }]; }), 'plan');
    assert(!bad((t) => { t.x.protect.moles = [{ slot: 1, patience: 3, dig: 0 }, { slot: 1, patience: 3, dig: 0 }]; }), 'moles');
    assert(!bad((t) => { t.cells[G(g).ax] = 0; }), 'the sprout gone from the cells');
    const sum = Library.summarize(g.s, Date.now(), g);
    assert.deepStrictEqual(Object.keys(sum.ext.protect).sort(), ['boxed', 'leaves', 'level', 'lost', 'stones', 'waves']);
    assert.deepStrictEqual(Library.summarize(s.s, Date.now(), s).ext.protect, sum.ext.protect, 'the same from the save');
    const enc = Library.encodeCells(g.board.cells);
    assert.strictEqual(enc[G(g).ax], 'v'); assert.strictEqual(Library.decodeCells(enc)[G(g).ax], 31);
    // Retired: its recipe, and its numbers.
    const st = L.defaultState(), B = Library.ensure(st, Date.now());
    const e = Library.retire(st, B.cur, s, Date.now(), 'wilted');
    assert(e && e.recipe.mode === 'protect' && e.sum.ext.protect.waves === sum.ext.protect.waves && e.reason === 'wilted');
    assert(L.defaultState().stats.free.guard && L.defaultState().stats.free.guard.boxedHard === 0, 'its lifetime stats');
  });

  test('protect: only own cells pay — a row with k stones pays (w−k)/10 and is plain (never a quad, no streak)', () => {
    for (const k of [1, 3]) {
      const g = mk('easy', 10, 20, 1);
      quiet(g);
      for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) if (!g.board.get(xx, y)) own(g, xx, y);
      for (let xx = 0; xx < 9; xx++) g.board.set(xx, 2, xx < k ? Guard.STONE : 5);
      const own0 = g.s.own;
      const r = dropAt(g, 'M1', 9);
      assert.deepStrictEqual(r.rows, [2]);
      assert(Math.abs(r.own - (10 - k) / 10) < 1e-9 && Math.abs(g.s.own - own0 - (10 - k) / 10) < 1e-9, k + ': own ' + r.own);
      assert(r.n === 0 && r.c === 1 && !r.quad);
      assert(Math.abs(Pay.clear({ mult: 1 }, r, g.rules).pay - (10 - k) / 10) < 1e-9);
    }
    // Four rows at once, one with a stone: plain rows, no quad, the streak ends.
    const g = mk('easy', 10, 20, 2);
    quiet(g);
    for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) if (!g.board.get(xx, y)) own(g, xx, y);
    for (let y = 2; y < 6; y++) for (let xx = 0; xx < 9; xx++) g.board.set(xx, y, y === 4 && xx === 3 ? Guard.STONE : 5);
    g.s.b2b = 2;
    const r = dropAt(g, 'I', 9 - Pieces.TYPES.I.rotBounds[1].minX, 1);
    assert.deepStrictEqual(r.rows, [2, 3, 4, 5]);
    assert(!r.quad && r.n === 3 && r.c === 1, JSON.stringify({ n: r.n, c: r.c }));
    assert.strictEqual(g.s.b2b, -1);
    assert(Math.abs(r.own - 3.9) < 1e-9);
  });

  test('protect: the achievements (Green Thumb, Night Watch, Not a Leaf, Curled Up) and where they count', () => {
    const A = L.Achievements;
    const grp = A.GROUPS.find((x) => x.id === 'protect');
    assert(grp && grp.name === 'Protect' && grp.icon === 'protect' && grp.part, 'its own group, after Free Play');
    const ids = ['pr_wave5', 'pr_wave20', 'pr_boxed', 'pr_clean'];
    const list = ids.map((id) => A.LIST.find((a) => a.id === id));
    assert.deepStrictEqual(list.map((a) => [a.name, a.pay, a.tier || '']), [['Green Thumb', 150, ''], ['Night Watch', 600, ''], ['Curled Up', 300, ''], ['Not a Leaf', 1000, 'legend']]);
    assert(list.every((a) => a.group === 'protect' && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(a.desc + a.name)));
    const check = (g, st) => A.check(st || L.defaultState(), { mode: 'play', r: { lines: 0 }, g }).map((a) => a.id).filter((id) => ids.includes(id));
    const e = mk('easy');
    G(e).st.waves = 5;
    assert.deepStrictEqual(check(e), ['pr_wave5']);
    G(e).st.waves = 20;
    assert.deepStrictEqual(check(e), ['pr_wave5'], 'Night Watch: Medium or Hard');
    const m = mk('medium');
    G(m).st.waves = 20;
    assert.deepStrictEqual(check(m), ['pr_wave5', 'pr_wave20']);
    const h = mk('hard');
    G(h).clean = 8;
    assert.deepStrictEqual(check(h), ['pr_clean']);
    const st = L.defaultState();
    st.stats.free.guard.boxedHard = 25;
    assert.deepStrictEqual(check(mk('easy'), st), ['pr_boxed']);
    assert.deepStrictEqual(check(std(), st), [], 'never on a board that is not Protect');
    // Not a Leaf: a wave with no leaf lost and no power-up counts; a power-up (Undo too) or a lost leaf starts over.
    const n = mk('hard', 10, 20, 3), nx = quiet(n);
    const wave = () => { Object.assign(nx, { phase: 'calm', left: 1 }); idle(n); Object.assign(nx, { plan: [], left: 1 }); idle(n); };
    wave(); wave();
    assert.strictEqual(nx.clean, 2);
    n.s.items = { golden: 1 };
    wave();
    assert.strictEqual(nx.clean, 3, 'Luck power-ups do not count');
    n.s.items.rewind = 1;
    wave();
    assert.strictEqual(nx.clean, 1, 'Undo does: that wave started over');
    Object.assign(nx, { phase: 'calm', left: 1 }); idle(n);
    nx.plan = [{ at: nx.seq + 1, kind: 'stone', x: nx.ax, sw: 1, sh: 1 }];
    idle(n);
    assert.strictEqual(nx.clean, 0, 'a lost leaf');
  });

  test('protect: bots earn no more per piece or per action than on Standard (1500 pieces a level)', () => {
    const SEEDS = [1, 2, 3], N = 500;
    const mean = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const base = SEEDS.map((seed) => bot(std(10, 20, seed), N));
    const fmt = (v) => v.toFixed(4);
    assert(base.every((b) => b.pieces === N), 'the bot keeps a Standard board going');
    for (const level of Guard.IDS) {
      const rs = SEEDS.map((seed) => bot(mk(level, 10, 20, seed), N));
      assert(rs.reduce((a, r) => a + r.pieces, 0) >= 1200, level + ': it plays: ' + rs.map((r) => r.pieces));
      assert(mean(rs, 'perPiece') <= mean(base, 'perPiece'), level + ': ' + fmt(mean(rs, 'perPiece')) + ' a piece vs ' + fmt(mean(base, 'perPiece')));
      assert(mean(rs, 'perAct') <= mean(base, 'perAct'), level + ': ' + fmt(mean(rs, 'perAct')) + ' an action vs ' + fmt(mean(base, 'perAct')));
    }
  });

  test('protect: a Guard step is quick (a board 20 × 40 with four moles out)', () => {
    const g = mk('hard', 20, 40, 9), x = quiet(g);
    for (let s = 0; s < 4; s++) putMole(g, s, s % 2 ? 19 : 0, 10 + s, { patience: 999 });
    for (let y = 0; y < 30; y++) for (let xx = 3; xx < 17; xx++) if ((xx * 7 + y * 3) % 5 && !g.board.get(xx, y)) own(g, xx, y);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) { const ev = Guard.step(g, x, g.board); assert(ev); }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20;
    assert(ms < 5, ms.toFixed(2) + ' ms a step');
  });
};
