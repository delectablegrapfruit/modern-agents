// The Watch bot in Node (js/bot.js): every spot its search finds is where the engine's own moves take the piece (random
// stacks, routes replayed on a real Game: the cells, and a Twist or Mini just as the lock counts it), a tuck under a
// ledge and a Twist into its slot among them, the half turn only when it is there; what a stack is worth (holes,
// height, a well, danger that grows with the pace); the choice (the Twist taken, Hold and Next as the rules allow);
// mistakes as often as each setting says, at random and never into danger; a short seeded soak with no top out; its
// hands as Human (never past a top player: pieces a second over 5 and 20 sets, presses a second, a reaction to a piece
// not seen coming; the time a piece takes varying as a player's does, its tempo drifting rather than jumping; at the
// fastest falls only the spots those hands can get to, so it tops out where people would) and Unrestrained (quicker,
// as strong or stronger, no mistakes); and the API a teaching page uses (rank, judge, explain).
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

  /** The sets' times (s) of a run: pieces a second at most over any n sets in a row. */
  const fastest = (at, n) => { let b = 0; for (let i = n - 1; i < at.length; i++) b = Math.max(b, (n - 1) / (at[i] - at[i - n + 1])); return b; };
  /** The most separate presses in any second (ms times). */
  const pressesPerSecond = (K) => { let b = 0; for (let i = 0, j = 0; i < K.length; i++) { while (K[i] - K[j] >= 1000) j++; b = Math.max(b, i - j + 1); } return b; };
  const gapsOf = (at) => at.slice(1).map((t, i) => t - at[i]);
  const meanOf = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  /** Coefficient of variation and lag-1 autocorrelation of a series. */
  const cvAc = (g) => {
    const m = meanOf(g), v = meanOf(g.map((x) => (x - m) * (x - m)));
    let c = 0;
    for (let i = 1; i < g.length; i++) c += (g[i] - m) * (g[i - 1] - m);
    return { cv: Math.sqrt(v) / m, ac: c / (g.length - 1) / v };
  };

  test('bot: Human never plays past a top player: 3 pieces a second over 20 sets, 3.5 over 5, 15 presses a second, a reaction of 150 ms+', () => {
    const S = Bot.STYLES.human;
    assert(S.pps === 3 && S.burst === 3.5 && S.taps === 15 && S.react >= 150 && S.tapMin >= 1000 / 15 - 1e-9, JSON.stringify(S));
    for (const [k, speed] of [[{ level: 1 }], [{ level: 8 }], [{ level: 15 }], [{ level: 15 }, 18], [{ level: 12, lock: 'retro' }], [{ level: 15, lock: 'retro' }, 19], [{ level: 5, next: 0, hold: false }], [{ level: 6, drop: false }]]) {
      const r = Bot.simulate({ classic: k, speed, seed: 51, botSeed: 9, pieces: 120 }), name = JSON.stringify(k) + (speed ? ' at ' + speed : '');
      // (Every set here is the bot's own: none of these falls fast enough to set a piece before a hand would.)
      assert(fastest(r.locksAt, 5) <= 3.5 + 1e-6, name + ': ' + fastest(r.locksAt, 5).toFixed(3) + ' a second over 5 sets');
      assert(fastest(r.locksAt, 20) <= 3 + 1e-6, name + ': ' + fastest(r.locksAt, 20).toFixed(3) + ' a second over 20 sets');
      assert(pressesPerSecond(r.log.keys) <= 15, name + ': ' + pressesPerSecond(r.log.keys) + ' presses in a second');
      const fresh = r.log.firstKey.filter((x) => !x[1]).map((x) => x[0]);
      assert(fresh.every((ms) => ms >= 150), name + ': a reaction of ' + Math.min(...fresh).toFixed(0) + ' ms');
      if (!k.lock && k.drop !== false) assert(r.pieces / r.seconds > 1.4, name + ': ' + (r.pieces / r.seconds).toFixed(2) + ' pieces a second: brisk, as a top player');
    }
    // Next 0: nothing seen coming, so every piece is a reaction.
    const blind = Bot.simulate({ classic: { level: 5, next: 0, hold: false }, seed: 52, pieces: 60 });
    assert(blind.log.firstKey.length >= 55 && blind.log.firstKey.every((x) => !x[1] && x[0] >= 150), 'no Next: every first key a reaction');
  });

  test('bot: Human\'s time a piece varies as a player\'s does: spread (CV) in a natural band, the tempo drifting (lag-1 autocorrelation above 0), no long pauses', () => {
    let acs = [];
    for (const [k, seed] of [[{ level: 1 }, 61], [{ level: 8 }, 62], [{ level: 15 }, 63], [{ level: 3 }, 64]]) {
      const r = Bot.simulate({ classic: k, seed, botSeed: seed, pieces: 360 }), g = gapsOf(r.locksAt), { cv, ac } = cvAc(g);
      assert(cv > 0.18 && cv < 0.6, JSON.stringify(k) + ': CV ' + cv.toFixed(2));
      assert(ac > -0.08 && ac < 0.6, JSON.stringify(k) + ': lag-1 ' + ac.toFixed(2));
      acs.push(ac);
      // No pause: the longest piece no more than a few times the usual one.
      const sorted = g.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1];
      assert(sorted[sorted.length - 1] < med * 5 && sorted[sorted.length - 1] < 2.5, JSON.stringify(k) + ': longest ' + sorted[sorted.length - 1].toFixed(2) + ' s, median ' + med.toFixed(2));
      // The tempo drifts (each piece keeps most of the last one's), within bounds.
      const z = r.log.tempo, zc = cvAc(z.map((x) => x + 10)).ac;
      assert(zc > 0.8 && Math.max(...z) <= 0.5 && Math.min(...z) >= -0.45, 'tempo: lag-1 ' + zc.toFixed(2));
    }
    assert(meanOf(acs) > 0.03, 'on the whole, a quick stretch follows a quick one: ' + acs.map((x) => x.toFixed(2)).join(' '));
    // Its decisions: next to nothing for an obvious piece, longer for a close call, none over its bound.
    const r = Bot.simulate({ classic: { level: 1 }, seed: 65, pieces: 120 }), th = r.log.thinkMs;
    assert(Math.max(...th) > 2.5 * Math.min(...th) && Math.max(...th) < 900, 'look and decide: ' + Math.min(...th).toFixed(0) + ' to ' + Math.max(...th).toFixed(0) + ' ms');
  });

  test('bot: at a fall too fast for a hand, Human aims only where its hands can get to (and so plays worse, as people do); Unrestrained does not', () => {
    // The search at a hand's pace: with the fall reckoned, the far walls drop out of reach; with none, they are there.
    const g = new Game({ w: 10, h: 20, seed: 3, recipe: CL({ lock: 'retro' }) });
    for (let y = 0; y < 9; y++) for (let x = 1; x < 9; x++) g.board.set(x, y, 5);
    const type = Pieces.get('I'), sp = Bot.spawnOf(g, type), rows = Bot.rowsOf(g.board);
    const walls = (res) => res.places.filter((p) => Bot.shapeOf(type)[p.r].bw === 1 && (p.px === 0 || p.px === 9)).length;
    const slow = Bot.reach(rows, 10, 20, type, sp, { r180: true, ceiling: true });
    const nSlow = walls(slow);
    const fast = Bot.reach(rows, 10, 20, type, sp, { r180: true, ceiling: true, rate: 3, start: 3, sticky: true });
    assert(nSlow === 2 && walls(fast) === 0, 'walls in reach: ' + nSlow + ' at ease, ' + walls(fast) + ' at speed');
    // A fraction of a row a key adds up: 0.5 a key is a row every two keys.
    const half = Bot.reach(new Int32Array(20), 10, 20, Pieces.get('O'), Bot.spawnOf(g, Pieces.get('O')), { rate: 0.5 });
    assert(half.places.length === 9, 'an O on an empty floor still gets everywhere: ' + half.places.length);
    // In play, on Retro lock at a row a frame (past where a 15-a-second hand keeps up), Human tops out at once;
    // Unrestrained plays on; at three frames a row Human still plays on.
    const human1 = Bot.simulate({ classic: { level: 15, lock: 'retro' }, speed: 30, seed: 71, pieces: 200, lines: 40 });
    const free1 = Bot.simulate({ classic: { level: 15, lock: 'retro' }, speed: 30, seed: 71, pieces: 200, lines: 40, style: 'unrestrained' });
    const human3 = Bot.simulate({ classic: { level: 15, lock: 'retro' }, speed: 19, seed: 72, pieces: 160, lines: 40 });
    assert(human1.topout && human1.lines < 10, 'Human at a row a frame: ' + human1.lines + ' lines');
    assert(!free1.topout && free1.lines >= 40, 'Unrestrained at a row a frame: ' + free1.lines + ' lines');
    assert(!human3.topout && human3.lines >= 40, 'Human at three frames a row: ' + human3.lines + ' lines');
    // Its routes there are a hand's: only replanned now and then (it fell past the way in).
    assert(human3.log.replans <= 8, 'replans: ' + human3.log.replans);
  });

  test('bot: Unrestrained: quicker than Human, still a piece at a time (a beat each), as strong or stronger, never a mistake', () => {
    const S = Bot.STYLES.unrestrained;
    assert(!S.human && S.beam > Bot.STYLES.human.beam && S.beat >= 80, JSON.stringify(S));
    const h = Bot.simulate({ classic: { level: 10 }, seed: 81, pieces: 200, lines: 60 }), u = Bot.simulate({ classic: { level: 10 }, seed: 81, pieces: 200, lines: 60, style: 'unrestrained', mistakes: 'often' });
    const ph = h.pieces / h.seconds, pu = u.pieces / u.seconds;
    assert(pu > ph * 1.6 && pu < 1000 / (S.beat * 0.98), 'pieces a second: Human ' + ph.toFixed(2) + ', Unrestrained ' + pu.toFixed(2));
    assert(gapsOf(u.locksAt).every((d) => d >= S.beat / 1000 - 0.017), 'a beat a piece at least');
    assert(!u.topout && u.lines >= 60 && u.log.mistakes === 0 && u.log.slips === 0, 'no mistakes: ' + JSON.stringify(u.log.kinds));
    assert(u.quads * 4 >= u.lines * 0.4, 'Quads: ' + u.quads);
    // A Driver set to Unrestrained plays so; set back to Human, its mistakes are its own again.
    const d = new Bot.Driver({ game: () => null, rules: () => ({}), gravity: () => 1 }, { style: 'unrestrained', mistakes: 'some' });
    assert(d.errs === 'off');
    d.setStyle('human');
    assert(d.style === 'human' && d.errs === 'some');
  });

  test('bot: the API a teaching page uses: rank (every placement, best first), judge (where a set stands), explain (a stack\'s worth in parts)', () => {
    const g = board(['...#......', '###...####', '####.#####']);
    g.spawn({ id: 'T', rot: 0 });
    const v = Bot.view(g, { hold: true, next: 3, r180: true }, 0), ranked = Bot.rank(v, {});
    assert(ranked.length > 20 && ranked.every((e, i) => !i || e.value <= ranked[i - 1].value + 1e-9), 'ranked, best first');
    assert(ranked[0].twist === 2 && ranked[0].lines === 2);
    // Judge: the player's set, as the board it left; the best is index 0 with no loss, a lesser one its loss.
    const j0 = Bot.judge(ranked, ranked[0].rows), j5 = Bot.judge(ranked, ranked[5].rows);
    assert(j0.index === 0 && j0.loss === 0 && j5.index > 0 && j5.loss > 0, JSON.stringify([j0.index, j0.loss, j5.index, j5.loss]));
    assert(Bot.judge(ranked, new Int32Array(20).fill(1)).index === -1, 'a board no set leaves');
    // Explain: the parts add up to worth's own number, and say what costs.
    const rows = Bot.rowsOf(board(['#########.', '####.####.']).board), e = Bot.explain(rows, 10, 20, {});
    const sum = Object.values(e.parts).reduce((a, p) => a + p.v, 0);
    assert(Math.abs(sum - e.total) < 1e-9 && Math.abs(e.total - Bot.worth(rows, 10, 20, {})) < 1e-9, sum + ' vs ' + e.total);
    assert(e.parts.holes.n === 1 && e.parts.holes.v < 0 && e.parts.well.n >= 1 && e.parts.well.v > 0, JSON.stringify(e.parts));
  });
};
