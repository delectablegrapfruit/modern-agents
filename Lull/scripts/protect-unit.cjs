// Protect's rules in Node (js/guard.js): the recipe and its sizes, the sprout and its bed, the clock (threats spawn,
// move and act in ticks of play, never per piece), meteors (the warning, the fall, blocks and moles broken, a leaf lost),
// moles (they come in on a wall's stack, burrow through blocks in the level's time, nibble a leaf, are swept by a
// clear), waves, leaves regrown and the wilt, the difficulty ramp, Undo, save and resume in the middle of a wave, pay
// (only own cells, rows with a mole plain), the achievements, a defending bot's survival by level, and bots that earn
// no more per piece or per action than on a Standard board. Run by test.cjs: require('./protect-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function protectUnit({ L, test }) {
  const { Game, Pieces, Recipe, Pay, Guard, CELL, Library } = L;
  const TPS = Guard.TPS;
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
  /** n ticks of the clock (Free Play's, Guard.advance); the events, joined. */
  const run = (g, n) => {
    const all = { meteors: [], moles: [], arrive: [], lost: 0, grew: 0, waves: [] };
    for (let i = 0; i < n && !g.over; i++) {
      const ev = Guard.advance(g);
      if (!ev) break;
      all.meteors.push(...ev.meteors); all.moles.push(...ev.moles); all.arrive.push(...ev.arrive);
      all.lost += ev.lost; all.grew += ev.grew;
      if (ev.wave) all.waves.push(ev.wave);
    }
    return all;
  };
  const own = (g, x, y) => g.board.set(x, y, 5);
  const picture = (g) => { const rows = []; for (let y = g.h - 1; y >= 0; y--) { let s = ''; for (let x = 0; x < g.w; x++) { const v = g.board.get(x, y); s += !v ? '.' : v & CELL.ASSET ? 'S' : v & CELL.MOLE ? 'M' : '#'; } rows.push(s); } return rows.join('\n'); };
  /** A mole put on the board by hand (slot, at x, y). */
  const putMole = (g, slot, x, y, o) => { g.board.set(x, y, Guard.moleCell(slot)); G(g).moles.push(Object.assign({ slot, wait: 1, tx: -1, ty: -1, face: 1 }, o || {})); };
  const moleAt = (g, slot) => Guard.molesOn(g.board)[slot] || null;
  /** No threats and a long calm: only what a test puts there happens. */
  const quiet = (g) => { const x = G(g); x.plan = []; x.phase = 'calm'; x.left = 100000; return x; };
  const meteor = (x, at, sw) => ({ at, kind: 'meteor', x, sw: sw || 1 });

  /** El-Tetris weights, and on Protect a roof two deep over the sprout and its sides kept filled. */
  function place(g) {
    const W = g.w, H = g.h, guard = G(g), p = g.piece;
    if (!p) return false;
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
        for (let x = guard.ax - 1; x <= guard.ax + guard.sw; x++) for (let y = Guard.BED; y < Guard.BED + 2; y++) if (x >= 0 && x < W && !t.get(x, y)) expose += 3;
        for (let y = 0; y < Guard.BED; y++) for (const x of [guard.ax - 2, guard.ax - 1, guard.ax + guard.sw, guard.ax + guard.sw + 1]) if (x >= 0 && x < W && !t.get(x, y)) expose++;
        v -= expose * 6;
      }
      return v;
    };
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
    if (!best) return false;
    for (let k = 0; k < best.rot; k++) g.rotate(1);
    for (let k = 0; k < W && g.piece.x !== best.x; k++) if (!g.move(Math.sign(best.x - g.piece.x))) break;
    g.drop();
    return true;
  }
  /**
   * A defending bot: it sets a piece every `pace` seconds (the real controls: turns, moves, a hard drop) while the clock
   * runs, until the board ends or `max` seconds. Each lock's pay as Free Play pays it (Pay.clear). On a Standard board
   * (no clock) it sets n pieces.
   */
  function bot(g, o) {
    o = Object.assign({ pace: 1, max: 600, pieces: Infinity }, o || {});
    let paid = 0;
    g.on('lock', (r) => { if (!r.lines) return; g.s.mult = Pay.mult(g); paid += Pay.clear(g.s, r, g.rules).pay; });
    const x = G(g), per = Math.round(o.pace * TPS);
    let k = 0;
    while (!g.over && g.s.pieces < o.pieces && (!x || x.tk < o.max * TPS)) {
      if (k++ % per === 0 || !x) { if (!place(g)) break; if (o.each) o.each(g); }
      if (x && !g.over) Guard.advance(g);
    }
    const acts = g.s.moves + g.s.rotations + g.s.drops + g.s.lowers + g.s.holds;
    return { secs: x ? x.tk / TPS : 0, pieces: g.s.pieces, paid, perPiece: paid / Math.max(1, g.s.pieces), perAct: paid / Math.max(1, acts), over: g.over, end: g.endKind, st: x && clone(x.st) };
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
    Recipe.part({ key: 'ttall', order: 10, limits: (r, lim) => { lim.h[0] = Math.max(lim.h[0], 16); } });
    try { assert.deepStrictEqual(Recipe.limits(P()).h, [18, 40]); assert.deepStrictEqual(Recipe.limits({}).h, [16, 40]); } finally { Recipe.unpart('ttall'); }
    const R = Recipe.rules(P(), 10);
    assert.deepStrictEqual(R.refuse, { tornado: 'Not in Protect', trapdoor: 'Not in Protect', flip: 'Not in Protect' });
    assert(R.rated && R.feats && R.lk === 1 && R.undo, 'rated, as the shape set is');
    const g = mk();
    for (const id of ['tornado', 'trapdoor', 'flip']) assert.strictEqual(g.allow(id), 'Not in Protect');
    for (const id of ['bomb', 'drill', 'laser', 'blackhole', 'rewind', 'fit', 'double', 'net']) assert.strictEqual(g.allow(id), null, id);
    assert.strictEqual(g.allow('settle'), 'Nothing to settle');
    assert.strictEqual(std().allow('settle'), null);
    for (const put of [(k) => own(k, 0, 0), (k) => k.board.set(0, 0, Guard.moleCell(0))]) { const k = mk('hard'); put(k); assert.strictEqual(k.allow('settle'), null); }
    assert(!std().ext.some((e) => e.key === 'protect') && G(std()) === null, 'a default board has no guard');
    assert.deepStrictEqual(Recipe.conflicts(P()), Recipe.get('physics') ? { 'mods.physics=true': 'Not in Protect' } : {});
    assert.strictEqual(Recipe.rules({ mode: 'protect', mods: { mirror: true } }, 10).refuse.tornado, 'Not in Protect');
  });

  test('protect: the sprout is centred on the floor at every width 6–20 (2 wide on even widths, 3 on odd), with 3 leaves', () => {
    for (let w = 6; w <= 20; w++) {
      const g = mk('easy', w, 12 + (w % 3)), x = G(g);
      assert.strictEqual(x.sw, w % 2 ? 3 : 2, w + ': width');
      assert.strictEqual(x.ax, w - (x.ax + x.sw), w + ': centred');
      for (let y = 0; y < g.h; y++) for (let xx = 0; xx < w; xx++) {
        const v = g.board.get(xx, y), inside = y < 2 && xx >= x.ax && xx < x.ax + x.sw;
        assert.strictEqual(v, inside ? (CELL.ASSET | CELL.SPROUT) : 0, w + ': ' + xx + ',' + y);
      }
      assert.strictEqual(x.leaves, 3);
      assert(g.piece && g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y), w + ': the first piece is in play');
    }
    const g6 = mk('hard', 6, 12, 3);
    run(g6, 30 * TPS);
    assert(G(g6).tk > 0, 'a 6 × 12 board runs');
  });

  test('protect: the bed rows never clear (a lock, the Laser, Best Fit’s copies) and nothing removes the sprout; a lock runs no tick', () => {
    const g = mk('easy', 10, 20, 1);
    quiet(g);
    for (let y = 0; y < 3; y++) for (let xx = 0; xx < 10; xx++) if (!g.board.get(xx, y) && !(y === 2 && xx === 9)) own(g, xx, y);
    assert.deepStrictEqual(g.fullRows(), []);
    const r = dropAt(g, 'M1', 9);
    assert.deepStrictEqual(r.rows, [2]);
    for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) assert(g.board.get(xx, y), 'the bed is still full');
    assert.strictEqual(G(g).tk, 0, 'a piece set is no time: the clock is Free Play’s');
    for (let xx = 0; xx < 9; xx++) own(g, xx, 2);
    const sim = g.simulate(Pieces.get('M1'), 0, 9);
    assert.strictEqual(sim.n + sim.c, 1, 'only row 2');
    const h = mk('easy', 10, 20, 2);
    quiet(h);
    for (let xx = 0; xx < 10; xx++) if (!h.board.get(xx, 0)) own(h, xx, 0);
    h.piece = { type: Pieces.TYPES.I, rot: 1, x: 0 - Pieces.TYPES.I.rotBounds[1].minX, y: 1 - Pieces.TYPES.I.rotBounds[1].minY, special: 'laser', entry: { id: 'I', rot: 0, special: 'laser' }, lastRot: false };
    const lr = h.lock();
    assert(lr && !lr.laser.includes(0) && !lr.laser.includes(1), 'laser rows: ' + (lr && lr.laser));
    assert.strictEqual(h.board.count((v) => v & CELL.ASSET), 4);
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
    assert.strictEqual(dr.drilled.length, 2);
    assert.strictEqual(d.board.count((v) => v & CELL.ASSET), 4, 'the drill stops at the sprout');
  });

  test('protect: the clock — a quiet start, then waves of 30 s and calms; threats spawn on ticks, not pieces; the same seed, the same threats', () => {
    const T = Guard.LEVELS;
    for (const level of Guard.IDS) {
      const g = mk(level, 10, 20, 5), x = G(g);
      assert.strictEqual(x.phase, 'calm'); assert.strictEqual(x.left, T[level].start * TPS);
      // Pieces set: no time passes, nothing comes.
      for (let i = 0; i < 30 && !g.over; i++) dropAt(g, 'O', (i * 2) % 9);
      assert.strictEqual(x.tk, 0); assert.strictEqual(x.wave, 0); assert.strictEqual(x.plan.length, 0);
      const ev = run(g, T[level].start * TPS);
      assert.deepStrictEqual(ev.waves, [{ start: 1 }], level + ': wave 1 after the quiet start');
      const n = Guard.counts(level, 1, 10);
      assert.strictEqual(x.plan.filter((t) => t.kind === 'meteor').length, n.meteors, level + ': its meteors');
      assert.strictEqual(x.plan.filter((t) => t.kind === 'mole').length, n.moles, level + ': its moles');
      assert(x.plan.every((t) => t.at > x.tk && t.at < x.tk + T[level].wave * TPS), 'spread through the wave');
      const ev2 = run(G(g) && g, T[level].wave * TPS);
      assert(ev2.waves.some((w) => w.end === 1), level + ': wave 1 ends after 30 s');
      assert.strictEqual(x.phase, 'calm');
    }
    const trace = (seed) => { const g = mk('hard', 10, 20, seed); run(g, 20 * TPS); return { G: clone(G(g)), board: picture(g), queue: g.queue.map((e) => e.id).join('') }; };
    assert.deepStrictEqual(trace(7), trace(7));
    assert.notDeepStrictEqual(trace(7).G.plan, trace(8).G.plan);
    const a = mk('hard', 10, 20, 7), b = std(10, 20, 7);
    run(a, 100);
    assert.deepStrictEqual(a.queue.map((e) => e.id), b.queue.map((e) => e.id), 'dealing is untouched');
    // Meteors scale with the width.
    assert.strictEqual(Guard.counts('easy', 1, 20).meteors, 2 * Guard.counts('easy', 1, 10).meteors);
  });

  test('protect: the difficulty ramp — more threats each wave, moles dig faster, to each level’s cap', () => {
    const row = (level) => [1, 2, 3, 4, 6, 10, 20].map((k) => { const c = Guard.counts(level, k, 10), p = Guard.pace(level, k); return [c.meteors, c.moles, p.dig]; });
    assert.deepStrictEqual(row('easy'), [[3, 0, 24], [4, 1, 23], [5, 1, 22], [6, 2, 21], [8, 3, 19], [8, 3, 16], [8, 3, 16]]);
    assert.deepStrictEqual(row('medium'), [[4, 1, 16], [6, 1, 15], [7, 2, 14], [9, 3, 13], [12, 4, 11], [14, 5, 9], [14, 5, 9]]);
    assert.deepStrictEqual(row('hard'), [[5, 2, 14], [7, 3, 13], [9, 4, 12], [11, 5, 11], [15, 7, 9], [20, 8, 6], [20, 8, 6]]);
    for (const level of Guard.IDS) for (let k = 1; k < 20; k++) {
      const a = Guard.counts(level, k, 10), b = Guard.counts(level, k + 1, 10);
      assert(b.meteors >= a.meteors && b.moles >= a.moles && Guard.pace(level, k + 1).dig <= Guard.pace(level, k).dig, level + ' ' + k);
    }
    // Harder at every wave: more meteors, a shorter warning, a faster fall, a wider blast, quicker moles.
    for (let k = 1; k <= 12; k++) {
      const [e, m, h] = Guard.IDS.map((l) => Guard.counts(l, k, 10));
      assert(e.meteors <= m.meteors && m.meteors <= h.meteors && e.moles <= m.moles && m.moles <= h.moles, 'wave ' + k);
      const [pe, pm, ph] = Guard.IDS.map((l) => Guard.pace(l, k));
      assert(pe.warn >= pm.warn && pm.warn >= ph.warn && pe.dig >= pm.dig && pm.dig >= ph.dig && pe.move >= pm.move && pm.move >= ph.move && pe.fall <= ph.fall);
    }
    assert.deepStrictEqual(Guard.IDS.map((l) => Guard.LEVELS[l].blast), [0, 1, 1]);
  });

  test('protect: a meteor — its column shown first, then it falls and breaks the block it hits (Easy) or a diamond round it (Medium, Hard)', () => {
    const g = mk('easy', 10, 20, 1), x = quiet(g);
    for (let y = 0; y < 4; y++) own(g, 1, y);
    x.plan = [meteor(1, 1)];
    run(g, 1);
    assert.strictEqual(x.meteors.length, 1); assert.strictEqual(x.meteors[0].fall, 1 + Guard.pace('easy', 1).warn);
    const p = Guard.preview(x, g.board);
    assert(!p.meteors[0].falling && p.meteors[0].top === 4 && p.meteors[0].cells.length === 1 && !p.meteors[0].hit, JSON.stringify(p.meteors));
    run(g, Guard.pace('easy', 1).warn - 1);
    assert.strictEqual(g.board.get(1, 3), 5, 'nothing yet: the warning');
    const ev = run(g, 3 * TPS);
    assert.strictEqual(ev.meteors.length, 1); assert.deepStrictEqual(ev.meteors[0].cells.map((c) => c.slice(0, 2)), [[1, 3]]);
    assert.strictEqual(g.board.get(1, 3), 0); assert.strictEqual(g.board.get(1, 2), 5, 'Easy: only the block it hits');
    assert.strictEqual(x.st.meteors, 1); assert.strictEqual(x.st.broken, 1); assert.strictEqual(x.leaves, 3);
    // Medium: a diamond, the block hit and the four round it (the sprout aside), and a mole in it.
    const m = mk('medium', 10, 20, 2), mx = quiet(m);
    for (let xx = 0; xx < 4; xx++) for (let y = 0; y < 4; y++) own(m, xx, y);
    putMole(m, 0, 1, 2, { wait: 999 });
    mx.plan = [meteor(1, 1)];
    const mev = run(m, 6 * TPS);
    assert.deepStrictEqual(mev.meteors[0].cells.map((c) => c.slice(0, 2).join(',')).sort(), ['0,3', '1,2', '1,3', '2,3']);
    assert.strictEqual(m.board.get(1, 1), 5, 'two rows down is out of reach');
    assert.strictEqual(mx.st.smashed, 1); assert.deepStrictEqual(mx.moles, []); assert.strictEqual(moleAt(m, 0), null);
  });

  test('protect: a meteor on the bare sprout costs a leaf; Medium needs a roof two deep (one is not enough), Easy one', () => {
    const hitWith = (level, roof) => {
      const g = mk(level, 10, 20, 3), x = quiet(g);
      for (let y = 2; y < 2 + roof; y++) own(g, x.ax, y);
      x.plan = [meteor(x.ax, 1)];
      const ev = run(g, 6 * TPS);
      return { lost: ev.lost, hit: ev.meteors[0].hit, leaves: x.leaves, roof: Array.from({ length: roof }, (_, i) => g.board.get(x.ax, 2 + i)) };
    };
    assert.deepStrictEqual(hitWith('easy', 0).lost, 1);
    assert.strictEqual(hitWith('easy', 1).lost, 0, 'Easy: one block over it is enough');
    assert.strictEqual(hitWith('medium', 0).lost, 1);
    const one = hitWith('medium', 1);
    assert(one.lost === 1 && one.hit && one.roof[0] === 0, 'Medium: one block over it breaks, and the blast reaches the sprout: ' + JSON.stringify(one));
    const two = hitWith('medium', 2);
    assert(two.lost === 0 && two.roof[0] === 0 && two.roof[1] === 0, 'two deep: both break, and the sprout is safe: ' + JSON.stringify(two));
    const three = hitWith('medium', 3);
    assert(three.lost === 0 && three.roof.join() === '5,0,0', 'three deep: one is left: ' + JSON.stringify(three));
    // The warning says so: rose (hit) over a thin roof.
    const g = mk('hard', 10, 20, 4), x = quiet(g);
    own(g, x.ax, 2);
    x.plan = [meteor(x.ax, 1)];
    run(g, 1);
    assert(Guard.preview(x, g.board).meteors[0].hit);
  });

  test('protect: a mole comes in on its wall’s stack and burrows through blocks to the sprout, eating one in the level’s dig time', () => {
    // It comes in on top of its wall column's stack.
    const c = mk('medium', 10, 20, 1), cx = quiet(c);
    for (let y = 0; y < 3; y++) own(c, 0, y);
    cx.plan = [{ at: 1, kind: 'mole', side: 0 }, { at: 1, kind: 'mole', side: 1 }];
    const arr = run(c, 1);
    assert.deepStrictEqual(arr.arrive.map((a) => a.at), [[0, 3], [9, 0]]);
    for (const level of Guard.IDS) {
      const g = mk(level, 10, 20, 1), x = quiet(g), P2 = Guard.pace(level, 1);
      // Boxed in by blocks between the left wall and the sprout: every way in is through a block.
      for (let xx = 0; xx < x.ax; xx++) for (let y = 0; y < 4; y++) own(g, xx, y);
      putMole(g, 0, 0, 0);
      let first = null, t = 0;
      while (!first && t < 200) { const e = run(g, 1); t++; const eat = e.moles.find((m) => m.kind === 'eat'); if (eat) first = { t, to: eat.to }; }
      assert(first, level + ': it eats a block');
      assert.deepStrictEqual(first, { t: 1 + P2.dig, to: [1, 0] }, level + ': along the floor toward the sprout, in the dig time');
      assert.strictEqual(g.board.get(0, 0), 0, 'its tunnel is open behind it');
      assert.strictEqual(x.st.eaten, 1);
      const left = run(g, 300);
      assert(x.leaves === 2 && left.moles.some((m) => m.kind === 'nibble') && x.st.taps === 1, level + ': it reaches the sprout and nibbles a leaf');
      assert.strictEqual(x.st.eaten, x.ax - 1, level + ': through every block on the way');
      assert.deepStrictEqual(x.moles, []);
    }
    // It never walks into the piece in play.
    const k = mk('medium', 10, 20, 2), kx = quiet(k);
    putMole(k, 0, 0, 0);
    const next = Guard.route(k.board, kx, 0, 0).path[0];
    k.piece = { type: Pieces.get('M1'), rot: 0, x: next[0], y: next[1], special: null, entry: { id: 'M1', rot: 0 }, lastRot: false };
    run(k, 20);
    assert.deepStrictEqual(moleAt(k, 0), [0, 0], 'it waits');
    k.piece = null;
    run(k, 20);
    assert.notDeepStrictEqual(moleAt(k, 0), [0, 0]);
  });

  test('protect: moles — at most 4 out; swept away by a clear (the row is plain); broken by a meteor; taken by an item', () => {
    const f = mk('hard', 10, 20, 3), fx = quiet(f);
    for (let s2 = 0; s2 < 4; s2++) putMole(f, s2, 2 + s2, 10, { wait: 9999 });
    fx.plan = [{ at: 1, kind: 'mole', side: 0 }];
    run(f, 25);
    assert.strictEqual(fx.moles.length, 4); assert.strictEqual(fx.plan.length, 1, 'the fifth waits for a slot');
    assert(fx.plan[0].at > fx.tk && fx.plan[0].at <= fx.tk + TPS, 'asking again each second');
    // Swept: a mole in a row that clears.
    const k = mk('easy', 10, 20, 2), kx = quiet(k);
    for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) if (!k.board.get(xx, y)) own(k, xx, y);
    for (let xx = 1; xx < 9; xx++) own(k, xx, 2);
    putMole(k, 0, 0, 2);
    const kr = dropAt(k, 'M1', 9);
    assert.deepStrictEqual(kr.rows, [2]); assert.strictEqual(kx.st.swept, 1); assert.deepStrictEqual(kx.moles, []);
    assert(kr.n === 0 && kr.c === 1 && !kr.quad, 'the row held a mole: plain');
    // An item: the next tick finds it gone.
    const b = mk('easy', 10, 20, 4), bx = quiet(b);
    putMole(b, 1, 0, 0, { wait: 99 });
    b.piece = { type: Pieces.get('M1'), rot: 0, x: 0, y: 1, special: 'bomb', entry: { id: 'M1', rot: 0, special: 'bomb' }, lastRot: false };
    b.lock();
    run(b, 1);
    assert.deepStrictEqual(bx.moles, []); assert.strictEqual(bx.st.blasted, 1);
  });

  test('protect: a wave that ends regrows a leaf (Easy every wave, Medium every second, Hard never); at 0 leaves the board wilts, and Undo takes it back', () => {
    const regrow = (level, wave) => { const g = mk(level, 10, 20, 1), x = G(g); Object.assign(x, { phase: 'wave', left: 1, plan: [], wave, leaves: 2 }); const ev = run(g, 1); return { leaves: x.leaves, ev, x }; };
    const e = regrow('easy', 1);
    assert.strictEqual(e.leaves, 3); assert.strictEqual(e.x.phase, 'calm'); assert.strictEqual(e.x.left, Guard.LEVELS.easy.calm * TPS); assert.strictEqual(e.x.st.waves, 1);
    assert.deepStrictEqual(e.ev.waves, [{ end: 1 }]); assert.strictEqual(e.ev.grew, 1);
    assert.strictEqual(regrow('medium', 1).leaves, 2); assert.strictEqual(regrow('medium', 2).leaves, 3);
    assert.strictEqual(regrow('hard', 2).leaves, 2); assert.strictEqual(regrow('hard', 6).leaves, 2, 'Hard: never');
    // The wilt, on the clock (no lock): over, told at once.
    const g = mk('easy', 10, 20, 3), x = G(g);
    dropAt(g, 'O', 0);
    quiet(g);
    x.leaves = 1;
    x.plan = [meteor(x.ax, x.tk + 1)];
    const events = [];
    g.on('topout', () => events.push('topout'));
    const ev = run(g, 6 * TPS);
    assert(ev.lost === 1 && x.leaves === 0 && g.over && g.endKind === 'wilted', 'wilted');
    assert.deepStrictEqual(events, ['topout']);
    assert.strictEqual(Guard.advance(g), null, 'the clock stops');
    const saved = clone(g.toJSON());
    assert.strictEqual(saved.ended, 'wilted');
    assert(Recipe.valid(saved) && Library.playable(saved));
    const back = new Game({ saved });
    assert(back.over && back.endKind === 'wilted' && G(back).leaves === 0);
    g.undo();
    assert(!g.over && g.endKind === null && G(g).leaves === 3 && G(g).tk === 0 && g.piece, 'Undo: back to before the last piece set, the clock with it');
  });

  test('protect: Undo restores the guard exactly (the clock, meteors in flight, moles); Settle runs no tick', () => {
    const g = mk('hard', 10, 20, 11);
    bot(g, { pace: 1, max: 25 });
    const x0 = G(g);
    assert(x0.wave >= 1, 'in a wave');
    const before = { G: clone(G(g)), cells: Array.from(g.board.cells) };
    delete before.G.book;
    dropAt(g, g.piece.type.id, 3);
    run(g, 17);
    g.undo();
    const now = clone(G(g)); delete now.book;
    assert.deepStrictEqual(now, before.G, 'the guard, deep-equal');
    assert.deepStrictEqual(Array.from(g.board.cells), before.cells);
    const k = mk('medium', 10, 20, 2), kx = quiet(k);
    own(k, 0, 5); putMole(k, 0, 0, 6);
    const tk = kx.tk;
    assert(k.settle());
    assert.strictEqual(kx.tk, tk, 'no tick');
    assert.strictEqual(k.board.get(0, 0), 5); assert(k.board.get(0, 1) & CELL.MOLE);
    assert.strictEqual(k.board.count((v) => v & CELL.ASSET), 4);
    run(k, 1);
    assert.strictEqual(kx.st.blasted, 0); assert.strictEqual(kx.moles.length, 1, 'found where Settle put it');
  });

  test('protect: save and resume in the middle of a wave (meteors in flight, moles digging) plays on exactly as an unbroken run', () => {
    /** The bot's rhythm, a piece a second, from tick k; until(g) stops it between ticks. Returns k. */
    const play = (g, trace, k, until) => {
      while (!g.over && G(g).tk < 120 * TPS) {
        if (until && until(g)) return k;
        if (k++ % TPS === 0) { place(g); trace.push(g.board.cells.join(',') + '|' + JSON.stringify(G(g))); }
        if (!g.over) Guard.advance(g);
      }
      return k;
    };
    for (const level of ['easy', 'hard']) {
      const trace = [], trace2 = [];
      const a = mk(level, 10, 20, 21);
      play(a, trace, 0);
      let b = mk(level, 10, 20, 21);
      // Stop in a wave with a meteor in the air and a mole out, between pieces.
      const k = play(b, trace2, 0, (g) => { const x = G(g); return x.tk % TPS === 4 && x.phase === 'wave' && x.meteors.some((m) => m.fall <= x.tk) && x.moles.length > 0; });
      const xb = G(b);
      assert(xb.tk < 120 * TPS && !b.over, level + ': stopped mid-wave');
      const saved = clone(b.toJSON());
      assert(Recipe.valid(saved) && Library.playable(saved), 'the save is sound');
      b = new Game({ saved });
      assert.deepStrictEqual(clone(G(b)), clone(xb), 'the guard comes back whole');
      play(b, trace2, k);
      assert.strictEqual(trace2.length, trace.length, level);
      for (let i = 0; i < trace.length; i++) assert.strictEqual(trace2[i], trace[i], level + ': piece ' + i);
      assert(G(a).st.meteors > 5 && G(a).st.moles > 0, level + ': threats came: ' + JSON.stringify(G(a).st));
    }
  });

  test('protect: a saved board is sound only with its guard; the summary carries its numbers; the sprout is 31 in a record', () => {
    const g = mk('medium', 10, 20, 5);
    run(g, 40 * TPS);
    const s = clone(g.toJSON());
    assert(s.x && s.x.protect && Library.playable(s));
    const bad = (f) => { const t = clone(s); f(t); return Library.playable(t); };
    assert(!bad((t) => { delete t.x.protect; }), 'no guard');
    assert(!bad((t) => { t.x.protect.leaves = 7; }), 'leaves');
    assert(!bad((t) => { t.x.protect.ax = 0; }), 'the sprout elsewhere');
    assert(!bad((t) => { t.x.protect.level = 'extreme'; }), 'level');
    assert(!bad((t) => { t.x.protect.plan = [{ at: 1, kind: 'stone' }]; }), 'plan');
    assert(!bad((t) => { t.x.protect.meteors = [{ x: 9, sw: 2, fall: 1, yc: 100 }]; }), 'a meteor off the board');
    assert(!bad((t) => { t.x.protect.moles = [{ slot: 1, wait: 3, tx: -1, ty: -1 }, { slot: 1, wait: 3, tx: -1, ty: -1 }]; }), 'moles');
    assert(!bad((t) => { t.x.protect.tk = -1; }), 'the clock');
    assert(!bad((t) => { t.cells[G(g).ax] = 0; }), 'the sprout gone from the cells');
    const sum = Library.summarize(g.s, Date.now(), g);
    assert.deepStrictEqual(Object.keys(sum.ext.protect).sort(), ['leaves', 'level', 'lost', 'meteors', 'moles', 'ms', 'waves']);
    assert.strictEqual(sum.ext.protect.ms, G(g).tk * 100);
    assert.deepStrictEqual(Library.summarize(s.s, Date.now(), s).ext.protect, sum.ext.protect, 'the same from the save');
    const enc = Library.encodeCells(g.board.cells);
    assert.strictEqual(enc[G(g).ax], 'v'); assert.strictEqual(Library.decodeCells(enc)[G(g).ax], 31);
    const st = L.defaultState(), B = Library.ensure(st, Date.now());
    const e = Library.retire(st, B.cur, s, Date.now(), 'wilted');
    assert(e && e.recipe.mode === 'protect' && e.sum.ext.protect.waves === sum.ext.protect.waves && e.reason === 'wilted');
    assert(L.defaultState().stats.free.guard && L.defaultState().stats.free.guard.sweptHard === 0 && L.defaultState().stats.free.guard.best.hard === 0, 'its lifetime stats');
    // Survival points: the score grows with the time survived (5, 10, 20 a second).
    const pts = Guard.IDS.map((l) => { const k = mk(l, 10, 20, 9); quiet(k); run(k, 10 * TPS); return k.s.score; });
    assert.deepStrictEqual(pts, [50, 100, 200]);
  });

  test('protect: only own cells pay — a row with a mole pays its own cells and is plain (never a quad, no streak)', () => {
    const g = mk('easy', 10, 20, 1);
    quiet(g);
    for (let y = 0; y < 2; y++) for (let xx = 0; xx < 10; xx++) if (!g.board.get(xx, y)) own(g, xx, y);
    for (let y = 2; y < 6; y++) for (let xx = 0; xx < 9; xx++) own(g, xx, y);
    putMole(g, 0, 3, 4);
    g.s.b2b = 2;
    const r = dropAt(g, 'I', 9 - Pieces.TYPES.I.rotBounds[1].minX, 1);
    assert.deepStrictEqual(r.rows, [2, 3, 4, 5]);
    assert(!r.quad && r.n === 3 && r.c === 1, JSON.stringify({ n: r.n, c: r.c }));
    assert.strictEqual(g.s.b2b, -1);
    assert(Math.abs(r.own - 3.9) < 1e-9);
  });

  test('protect: the achievements (Green Thumb, Night Watch, Swept Away, Not a Leaf) need real time survived', () => {
    const A = L.Achievements;
    const grp = A.GROUPS.find((x) => x.id === 'protect');
    assert(grp && grp.name === 'Protect' && grp.icon === 'protect' && grp.part);
    const ids = ['pr_thumb', 'pr_watch', 'pr_swept', 'pr_clean'];
    const list = ids.map((id) => A.LIST.find((a) => a.id === id));
    assert.deepStrictEqual(list.map((a) => [a.name, a.pay, a.tier || '']), [['Green Thumb', 60, ''], ['Night Watch', 200, ''], ['Swept Away', 100, ''], ['Not a Leaf', 300, 'legend']]);
    assert(list.every((a) => a.group === 'protect' && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(a.desc + a.name)));
    const check = (g, st) => A.check(st || L.defaultState(), { mode: 'play', r: { lines: 0 }, g }).map((a) => a.id).filter((id) => ids.includes(id));
    const e = mk('easy');
    G(e).tk = 179 * TPS;
    assert.deepStrictEqual(check(e), []);
    G(e).tk = 180 * TPS; G(e).bare = G(e).clean = 180 * TPS;
    assert.deepStrictEqual(check(e), ['pr_thumb'], 'Easy: Green Thumb only');
    const h = mk('hard');
    Object.assign(G(h), { tk: 300 * TPS, bare: 299 * TPS, clean: 179 * TPS });
    assert.deepStrictEqual(check(h), ['pr_thumb']);
    Object.assign(G(h), { bare: 300 * TPS, clean: 180 * TPS });
    assert.deepStrictEqual(check(h), ['pr_thumb', 'pr_watch', 'pr_clean']);
    const st = L.defaultState();
    st.stats.free.guard.sweptHard = 25;
    assert.deepStrictEqual(check(mk('easy'), st), ['pr_swept']);
    assert.deepStrictEqual(check(std(), st), [], 'never on a board that is not Protect');
    // The runs: a power-up (Undo too; Luck aside) ends both; a lost leaf ends the clean run only.
    const n = mk('hard', 10, 20, 3), nx = quiet(n);
    run(n, 50);
    assert.strictEqual(nx.bare, 50); assert.strictEqual(nx.clean, 50);
    n.s.items = { golden: 1 };
    run(n, 1);
    assert.strictEqual(nx.bare, 51, 'Luck power-ups do not count');
    n.s.items.rewind = 1;
    run(n, 1);
    assert.strictEqual(nx.bare, 1); assert.strictEqual(nx.clean, 1);
    run(n, 10);
    nx.plan = [meteor(nx.ax, nx.tk + 1)];
    run(n, 5 * TPS);
    assert.strictEqual(nx.leaves, 2); assert(nx.clean < 5 * TPS && nx.bare > 5 * TPS, JSON.stringify({ clean: nx.clean, bare: nx.bare }));
  });

  // A defending bot (it sets a piece a second and keeps a roof two deep over the sprout) on 5 seeds a level: Hard beats
  // it within a few minutes, Easy lasts it much longer. The measured times are printed.
  const SURVIVE = {};
  test('protect: a defending bot loses on Hard within a few minutes and lasts much longer on Easy', () => {
    const SEEDS = [1, 2, 3, 4, 5];
    for (const level of Guard.IDS) SURVIVE[level] = SEEDS.map((seed) => bot(mk(level, 10, 20, seed), { pace: 1, max: 900 }));
    const mean = (rs) => rs.reduce((a, r) => a + r.secs, 0) / rs.length;
    const m = Guard.IDS.map((l) => mean(SURVIVE[l]));
    console.log('       bot survival (s, a piece a second, cap 900): ' + Guard.IDS.map((l, i) => l + ' ' + SURVIVE[l].map((r) => r.secs + (r.over ? '' : '+')).join('/') + ' (mean ' + m[i].toFixed(0) + ')').join('; '));
    assert(SURVIVE.hard.every((r) => r.over && r.secs <= 240), 'Hard: lost within 4 minutes every time');
    assert(m[0] >= 2.5 * m[2] && m[1] > m[2] && m[0] > m[1], 'Easy lasts much longer than Medium, Medium than Hard');
    assert(m[2] < Guard.GOALS.watch && SURVIVE.hard.every((r) => r.secs < Guard.GOALS.watch), 'the Hard achievements need more than the bot can do');
  });

  test('protect: bots earn no more per piece or per action than on Standard', () => {
    const SEEDS = [1, 2, 3];
    const mean = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const base = SEEDS.map((seed) => bot(std(10, 20, seed), { pieces: 500 }));
    assert(base.every((b) => b.pieces === 500), 'the bot keeps a Standard board going');
    const fmt = (v) => v.toFixed(4);
    const out = [];
    for (const level of Guard.IDS) {
      // Twice as fast as a calm player too: speed buys no more per piece.
      const rs = SEEDS.map((seed) => bot(mk(level, 10, 20, seed), { pace: 1, max: 900 })).concat(SEEDS.map((seed) => bot(mk(level, 10, 20, seed + 10), { pace: 0.5, max: 900 })));
      assert(rs.reduce((a, r) => a + r.pieces, 0) >= 300, level + ': it plays');
      out.push(level + ' ' + fmt(mean(rs, 'perPiece')) + '/' + fmt(mean(rs, 'perAct')));
      assert(mean(rs, 'perPiece') <= mean(base, 'perPiece'), level + ': ' + fmt(mean(rs, 'perPiece')) + ' a piece vs ' + fmt(mean(base, 'perPiece')));
      assert(mean(rs, 'perAct') <= mean(base, 'perAct'), level + ': ' + fmt(mean(rs, 'perAct')) + ' an action vs ' + fmt(mean(base, 'perAct')));
    }
    console.log('       pay a piece / an action: standard ' + fmt(mean(base, 'perPiece')) + '/' + fmt(mean(base, 'perAct')) + '; ' + out.join('; '));
  });

  test('protect: a tick is quick (a board 20 × 40 with four moles digging and meteors falling)', () => {
    const g = mk('hard', 20, 40, 9), x = quiet(g);
    for (let s = 0; s < 4; s++) putMole(g, s, s % 2 ? 19 : 0, 10 + s, { wait: 1 });
    for (let y = 0; y < 30; y++) for (let xx = 3; xx < 17; xx++) if ((xx * 7 + y * 3) % 5 && !g.board.get(xx, y)) own(g, xx, y);
    for (let i = 0; i < 6; i++) x.meteors.push({ x: i * 3, sw: 1, fall: 0, yc: 4000 });
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 100; i++) { const ev = Guard.tick(g, x, g.board, {}); assert(ev); for (const m of x.moles) m.wait = 1; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 100;
    assert(ms < 4, ms.toFixed(2) + ' ms a tick');
  });
};
