// The Watch bot in Node (js/bot.js): every spot its search finds is where the engine's own moves take the piece (random
// stacks, routes replayed on a real Game: the cells, and a Twist or Mini just as the lock counts it), a tuck under a
// ledge and a Twist into its slot among them, the half turn only when it is there; what a stack is worth (holes,
// height, a well, danger that grows with the pace); the choice (the Twist taken, Hold and Next as the rules allow);
// mistakes as often as each setting says, at random and never into danger; a short seeded soak with no top out; and
// its hands (a think and keys that vary, never a fixed beat, quicker as the pieces fall faster).
// Run by test.cjs: require('./bot-unit.cjs')({ L, test }). The long soak is scripts/bot-soak.cjs.
'use strict';
const assert = require('assert');

module.exports = function botUnit({ L, test }) {
  const { Game, Pieces, Bot, RNG } = L;
  const CL = (k) => ({ mode: 'classic', classic: Object.assign({}, k || {}) });
  /** A Classic game with a picture as its stack ('#' filled, rows top first, the last one the floor). */
  const board = (pic, k) => {
    const g = new Game({ w: 10, h: 20, seed: 3, recipe: CL(k) });
    pic.slice().reverse().forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') g.board.set(x, y, 5); }));
    return g;
  };
  /** Plays a route from the search on a copy of the game, the piece `id` at `start`: the lock's result (or null). */
  const replay = (g, id, start, route) => {
    const h = new Game({ saved: g.toJSON() }), type = Pieces.get(id);
    h.piece = { type, rot: start.rot, x: start.x, y: start.y, special: null, entry: { id, rot: 0 }, lastRot: false };
    for (const m of route) {
      if (m === 'drop') return h.drop() || null;
      const ok = m === 'L' ? h.move(-1) : m === 'R' ? h.move(1) : m === 'D' ? h.lower() === 'moved' : m === 'CW' ? h.rotate(1) : m === 'CCW' ? h.rotate(-1) : h.rotate(2);
      if (!ok) return null;
    }
    return null;
  };
  const cellsOf = (id, r, x, y) => Pieces.get(id).rots[r].map(([cx, cy]) => (x + cx) + ',' + (y + cy)).sort().join(';');
  const got = (res) => res.cells.map(([x, y]) => x + ',' + y).sort().join(';');

  test('bot: every spot the search finds is where its route takes the piece on the real engine (cells, Twist, Mini), on 120 ragged stacks', () => {
    const rng = new RNG('bot-unit');
    let n = 0, tucks = 0, spins = 0;
    for (let trial = 0; trial < 120; trial++) {
      const g = new Game({ w: 10, h: 20, seed: trial, recipe: CL() });
      const top = 2 + rng.int(9);
      for (let y = 0; y < top; y++) for (let x = 0; x < 10; x++) if (rng.next() < 0.62 - y * 0.02) g.board.set(x, y, 5);
      for (let y = 0; y < top; y++) if ([...Array(10).keys()].every((x) => g.board.get(x, y))) g.board.set(rng.int(10), y, 0);
      const id = Pieces.TETROMINOES[trial % 7], type = Pieces.get(id), sp = Bot.spawnOf(g, type);
      if (!g.fitsAt({ type, special: null }, sp.rot, sp.x, sp.y)) continue;
      const res = Bot.reach(Bot.rowsOf(g.board), 10, 20, type, sp, { r180: true, ceiling: true });
      for (const pl of res.places.map((p) => Object.assign({}, p, { route: res.route(p) }))) {
        const r = replay(g, id, sp, pl.route);
        assert(r, id + ' ' + pl.route.join(' '));
        assert.strictEqual(got(r), cellsOf(id, pl.r, pl.x, pl.y), id + ' ' + pl.route.join(' '));
        assert.strictEqual(r.twist ? 2 : r.mini ? 1 : 0, pl.twist, id + ' twist ' + pl.route.join(' '));
        n++;
        if (pl.route.includes('D')) tucks++;
        if (pl.twist) spins++;
      }
    }
    assert(n > 2500 && tucks > 50 && spins > 3, JSON.stringify({ n, tucks, spins }));
  });

  test('bot: a tuck under a ledge (a slide after a soft drop), and the half turn only when the rules have it', () => {
    // An I lying flat can only get under the ledge (columns 4 to 9) by coming down on the left, then sliding right.
    const g = board([
      '....######',
      '..........',
      '##.#######',
    ]);
    const type = Pieces.get('I'), sp = Bot.spawnOf(g, type);
    const res = Bot.reach(Bot.rowsOf(g.board), 10, 20, type, sp, { r180: true, ceiling: true });
    const tuck = res.places.find((p) => p.py === 1 && p.px === 5 && Bot.shapeOf(type)[p.r].bh === 1);
    assert(tuck, 'a spot under the ledge');
    const route = res.route(tuck);
    const d = route.lastIndexOf('D'), slide = route.slice(d + 1).filter((m) => m === 'R').length;
    assert(d > 0 && slide >= 2 && !tuck.simple, route.join(' '));
    const r = replay(g, 'I', sp, route);
    assert.strictEqual(got(r), cellsOf('I', tuck.r, tuck.x, tuck.y));
    // A T upside down: one half turn with it, two turns without; without it, no route uses it.
    const T = Pieces.get('T'), ts = Bot.spawnOf(g, T);
    // (A search is read before the next one: they share their buffers.)
    const yes = Bot.reach(Bot.rowsOf(g.board), 10, 20, T, ts, { r180: true, ceiling: true });
    const withHalf = yes.places.filter((p) => yes.route(p).includes('R180')).length, nYes = yes.places.length;
    const no = Bot.reach(Bot.rowsOf(g.board), 10, 20, T, ts, { r180: false, ceiling: true });
    assert(withHalf > 0, 'with it, some routes use it');
    assert(no.places.every((p) => !no.route(p).includes('R180')));
    assert.strictEqual(no.places.length, nYes, 'the same spots, the long way round');
  });

  test('bot: a T-slot: the search finds the spin in, the choice takes the Twist double, and the engine counts it', () => {
    const g = board([
      '...#......',
      '###...####',
      '####.#####',
    ]);
    g.spawn({ id: 'T', rot: 0 });
    const v = Bot.view(g, { hold: true, next: 3, r180: true }, 0);
    const it = Bot.think(v, {});
    let r;
    while (!(r = it.next()).done);
    const best = r.value[0];
    assert.strictEqual(best.id, 'T');
    assert(best.twist === 2 && best.lines === 2, JSON.stringify({ twist: best.twist, lines: best.lines, route: best.route }));
    const res = replay(g, 'T', { rot: g.piece.rot, x: g.piece.x, y: g.piece.y }, best.route);
    // (Just before the T comes, the board as it was.)
    assert(res && res.twist && res.lines === 2, 'the engine: a Twist double');
    // The slot is worth something before the T comes (its roof is not counted as a hole).
    const rows = Bot.rowsOf(g.board), flat = board(['###.######', '####.#####']);
    assert(Bot.slots(rows, 10, 3, Int32Array.from([2, 2, 2, 3, 1, 1, 2, 2, 2, 2])) > 0);
    assert(Bot.slots(Bot.rowsOf(flat.board), 10, 2, Int32Array.from([2, 2, 2, 1, 2, 2, 2, 2, 2, 2])) === 0, 'no roof: no slot');
  });

  test('bot: what a stack is worth: holes, height and bumps cost, a well at the side pays, the height feared sooner at speed', () => {
    const w = (pic, ctx) => { const g = board(pic); return Bot.worth(Bot.rowsOf(g.board), 10, 20, ctx || {}); };
    const flat = w(['#########.', '#########.']);
    assert(flat > w(['#########.', '####.####.']), 'a covered hole costs');
    assert(w(['####.####.', '#########.']) > w(['#########.', '####.####.']), 'an open notch costs less than a covered hole');
    assert(flat > w(['####.#####', '####.#####']), 'the well at the side over one in the middle');
    assert(flat > w(['#.#.#.#.#.', '#########.']), 'bumps cost');
    const tall = Array.from({ length: 13 }, () => '#########.');
    assert(w(tall.slice(0, 4)) > w(tall), 'lower is better');
    assert(w(tall, { urgency: 0.8 }) < w(tall, { urgency: 0 }), 'the same stack is more dangerous at speed');
    assert(w(['....##....'].concat(Array(17).fill('#########.')).concat(['....##....'])) < -500, 'blocks where the next piece appears: the end');
  });

  test('bot: the rules it plays by: no Hold when Hold is off, no hard drop when Drop is off, no Next to read when Next is 0', () => {
    const a = Bot.simulate({ classic: { hold: false, next: 1 }, seed: 11, pieces: 30 });
    assert(!a.acts.hold && a.pieces === 30 && !a.topout, JSON.stringify(a.acts));
    const b = Bot.simulate({ classic: { drop: false }, seed: 12, pieces: 20 });
    assert(!b.acts.drop && b.acts.lower > 20 && b.pieces === 20 && !b.topout, JSON.stringify(b.acts));
    const c = Bot.simulate({ classic: { next: 0, hold: false }, seed: 13, pieces: 30 });
    assert(c.pieces === 30 && !c.topout && !c.acts.hold && c.log.pondered === 0, 'no Next: nothing to think ahead with');
    const d = Bot.simulate({ classic: { next: 3 }, seed: 14, pieces: 30 });
    assert(d.acts.hold > 0 && d.log.pondered > 20, 'with Hold and Next: it holds, and thinks ahead: ' + JSON.stringify([d.acts, d.log.pondered]));
    const e = Bot.simulate({ classic: { lock: 'retro', rand: 'retro', level: 9 }, seed: 15, pieces: 30 });
    assert(e.pieces === 30 && !e.topout, 'retro lock and random');
    // Seeded: the same game twice is the same game.
    const f = Bot.simulate({ classic: {}, seed: 16, botSeed: 4, pieces: 25, mistakes: 'some' }), f2 = Bot.simulate({ classic: {}, seed: 16, botSeed: 4, pieces: 25, mistakes: 'some' });
    assert.deepStrictEqual([f.lines, f.score, f.locksAt], [f2.lines, f2.score, f2.locksAt]);
  });

  test('bot: mistakes: as often as each setting says, at random (not every so many pieces), a lesser one weighted toward second, never into danger', () => {
    // A ranked list of close placements, all safe: the draws alone decide.
    const rows = new Int32Array(20);
    const ranked = Array.from({ length: 8 }, (_, i) => ({ value: -i, rows, hold: false, simple: true }));
    const N = 6000;
    for (const id of Bot.MISTAKE_IDS) {
      const rng = new RNG('mistakes:' + id), p = Bot.MISTAKES[id].p;
      let n = 0, gaps = [], last = -1;
      const kinds = {}, ranks = [0, 0, 0, 0, 0];
      for (let i = 0; i < N; i++) {
        const c = Bot.choose(ranked, id, rng, 20);
        if (c.kind) { n++; kinds[c.kind] = (kinds[c.kind] || 0) + 1; if (last >= 0) gaps.push(i - last); last = i; }
        if (c.kind === 'rank') ranks[ranked.indexOf(c.pick)]++;
      }
      const sd = Math.sqrt(N * p * (1 - p));
      assert(Math.abs(n - N * p) <= 4 * sd + 1, id + ': ' + n + ' of ' + N + ' (expected ' + Math.round(N * p) + ')');
      if (!p) continue;
      // At random: the gaps between them vary (a fixed period would have none), about as a geometric draw's do.
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, sdev = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length);
      assert(sdev / mean > 0.7, id + ': gaps ' + mean.toFixed(1) + ' ± ' + sdev.toFixed(1));
      assert(ranks[1] > ranks[2] && ranks[2] > ranks[4] && !ranks[0], id + ': ' + ranks.join());
    }
    // Never into danger: lesser placements that would stack high, or far worse, are left out; then it plays the best.
    const high = new Int32Array(20); for (let y = 0; y < 15; y++) high[y] = 0x1ff;
    const risky = [{ value: 0, rows, hold: false, simple: true }, { value: -1, rows: high }, { value: -60, rows }, { value: -2, rows: high }];
    const rng = new RNG('danger');
    for (let i = 0; i < 2000; i++) assert.strictEqual(Bot.choose(risky, 'often', rng, 20).pick, risky[0]);
    // In a game, at Often, about as many as asked for (lapses and lesser ones), and still no top out.
    const g = Bot.simulate({ classic: { level: 5 }, seed: 21, botSeed: 2, pieces: 160, mistakes: 'often' });
    const rate = g.log.mistakes / g.log.pieces;
    assert(rate > 0.08 && rate < 0.3 && !g.topout, 'often in play: ' + rate.toFixed(3));
    const off = Bot.simulate({ classic: { level: 5 }, seed: 21, botSeed: 2, pieces: 80, mistakes: 'off' });
    assert.strictEqual(off.log.mistakes, 0);
  });

  test('bot: a short seeded soak: no top out at level 1, at level 15, at level 14 with no Next and no Hold, and on retro lock', () => {
    for (const [k, lines] of [[{ level: 1 }, 60], [{ level: 15 }, 60], [{ level: 14, next: 0, hold: false }, 40], [{ level: 10, lock: 'retro' }, 40]]) {
      const r = Bot.simulate({ classic: k, seed: 31, botSeed: 5, lines, pieces: lines * 4 });
      assert(!r.topout && r.lines >= lines, JSON.stringify(k) + ': ' + r.lines + ' lines, top out ' + r.topout);
      // As good as a Quad player: with Next and Hold, most of the lines by Quads.
      if (k.next == null && k.lock == null) assert(r.quads * 4 >= r.lines * 0.4, JSON.stringify(k) + ': quads ' + r.quads);
    }
  });

  test('bot: its hands: a think and keys that vary piece to piece (no fixed beat), quicker as the pieces fall faster', () => {
    const slow = Bot.simulate({ classic: { level: 1 }, seed: 41, pieces: 60 });
    const gaps = slow.locksAt.slice(1).map((t, i) => t - slow.locksAt[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / gaps.length);
    assert(mean > 0.35 && mean < 2.5, 'a piece every ' + mean.toFixed(2) + ' s');
    assert(sd / mean > 0.25, 'the gaps vary: ' + (sd / mean).toFixed(2));
    assert(new Set(gaps.map((x) => Math.round(x * 20))).size > 12, 'no fixed cadence');
    const thinks = slow.log.thinkMs, tm = thinks.reduce((a, b) => a + b, 0) / thinks.length;
    assert(Math.max(...thinks) > 2 * Math.min(...thinks) && tm > 120 && tm < 700, 'thinks: ' + tm.toFixed(0) + ' ms');
    const fast = Bot.simulate({ classic: { level: 15 }, seed: 41, pieces: 60 });
    const fgap = (fast.locksAt[fast.locksAt.length - 1] - fast.locksAt[0]) / (fast.locksAt.length - 1);
    assert(fgap < mean * 0.75, 'quicker at speed: ' + fgap.toFixed(2) + ' s vs ' + mean.toFixed(2) + ' s');
    // The draws of the hand are its own stream: the same game's choices whatever the pace.
    assert.deepStrictEqual(Bot.HAND.think > Bot.HAND.tap, true);
  });
};
