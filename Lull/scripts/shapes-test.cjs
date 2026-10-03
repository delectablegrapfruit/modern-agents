// Shapes (js/shapes.js), tested in Node: the sampling table against a fresh enumeration, recipes made safe, Normal
// dealing exactly today's pieces, every set dealing the same pieces from a seed, a resume and an Undo, the shares of a
// round, uniform draws, the measured minimum sizes, ids rebuilt from nothing, clusters, bounded candidates, the cost
// of a 12-block draw, Big's quads, and fairness (no set pays more per piece or per action than Normal shapes).
// Run by test.cjs: require('./shapes-test.cjs')(test, L).
'use strict';
const assert = require('assert');
const Bot = require('./shapes-bot.cjs');
const Poly = require('./polytable.cjs');
const Min = require('./minsize.cjs');

module.exports = function shapesTests(test, L) {
  const { Shapes: S, Pieces: P, Recipe: R, Game, Library, Pay } = L;
  console.log('shapes');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const custom = (c) => ({ preset: 'custom', custom: Object.assign({ groups: [], big: 'off' }, c) });
  const game = (shapes, w, h, seed, o) => new Game(Object.assign({ w, h, seed, recipe: { shapes }, previewCount: 5 }, o || {}));
  const dealt = (g, n) => { const out = []; for (let i = 0; i < n; i++) out.push(g.dealer.next(g)); return out; };
  const SETS = [
    ['Tiny', { preset: 'tiny' }], ['Frantic', { preset: 'frantic' }], ['Pentominoes', { preset: 'pentominoes' }], ['Big', { preset: 'big' }],
    ['12 blocks', custom({ groups: [{ n: 12 }] })], ['clusters', custom({ clusters: { min: 2, max: 8 } })],
    ['Big less', custom({ groups: [{ n: 3 }, { n: 5 }], big: 'less' })], ['Big even', custom({ groups: [{ n: 4 }], big: 'even' })],
    ['Big more', custom({ groups: [{ n: 9 }], big: 'more' })], ['Big all', custom({ groups: [{ n: 6 }, { n: 2 }], big: 'all' })], ['Big alone', custom({ big: 'even' })],
    ['picks', custom({ groups: [{ n: 9, picks: [0, 5, 77].map((k) => S.canon(S.poly(9, k))) }, { n: 4, weight: 'more', picks: ['0,0;1,0;2,0;3,0'] }] })],
    ['drawn', custom({ groups: [{ n: 11, weight: 'less', picks: [S.checkDrawn([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2], [4, 2], [3, 2], [2, 2]], 11).key] }, { n: 7 }] })],
  ];

  test('shapes: the table holds every one-sided shape with no sealed hole, exactly as a fresh enumeration counts them', () => {
    assert.deepStrictEqual(S.TOTAL.slice(1), [1, 1, 2, 7, 18, 60, 195, 693, 2432, 8808, 31968, 117487]);
    for (let n = 1; n <= 12; n++) assert.strictEqual(S.table(n) ? S.table(n).total : 1, S.TOTAL[n], 'total ' + n);
    const fresh = Poly.build(L, 9);
    for (let n = 1; n <= 9; n++) {
      assert.strictEqual(fresh[n].total, S.TOTAL[n]);
      assert.strictEqual(S.encode(fresh[n].counts), n > 1 ? L.PolyTable[n].c : S.encode(fresh[n].counts), 'table ' + n);
    }
    // One index, one shape: for n ≤ 8 every index gives a different shape, and every shape is joined and hole-free.
    for (let n = 1; n <= 8; n++) {
      const keys = S.range(n, 0, S.TOTAL[n]).map((c) => S.canon(c));
      assert.strictEqual(new Set(keys).size, S.TOTAL[n], 'distinct ' + n);
      for (let k = 0; k < S.TOTAL[n]; k += Math.max(1, S.TOTAL[n] >> 5)) {
        const c = S.poly(n, k);
        assert.strictEqual(S.canon(c), keys[k], 'poly(n, k) is the k-th ' + n);
        assert(P.isConnected(c) && !P.hasHole(c) && c.length === n);
      }
    }
    // The seven heptomino with a hole is left out; the one-sided counts less the holed ones are what the table has.
    assert(!S.range(7, 0, 195).some((c) => P.hasHole(c)));
  });

  test('shapes: recipes are made safe (every invalid case falls back), thinned for a retired board, labelled', () => {
    const N = { preset: 'normal' };
    for (const junk of [null, 5, 'x', [], {}, { preset: 'nope' }, { preset: 'custom', custom: { groups: [] } }, { preset: 'custom', custom: { groups: [{ n: 13 }, { n: 0 }, { n: 2.5 }, 'x'] } }]) assert.deepStrictEqual(S.normalize(junk), N, JSON.stringify(junk));
    assert.deepStrictEqual(S.normalize({ preset: 'custom' }), { preset: 'custom', custom: clone(S.CUSTOM_DEFAULT) }, 'Custom first chosen: 4 and 5 blocks');
    const odd = S.normalize(custom({ groups: [{ n: 5, weight: 'lots' }, { n: 3, weight: 'more' }, { n: 5, weight: 'less' }], clusters: { min: 6, max: 4, weight: 'x' }, big: 'huge' }));
    assert.deepStrictEqual(odd.custom, { groups: [{ n: 3, weight: 'more' }, { n: 5, weight: 'even' }], big: 'off', clusters: { min: 3, max: 5, weight: 'even' } }, 'each n once, in order; bad weights Even; bad clusters 3–5');
    // Picks: real shapes of n blocks (any turn, made canonical), each once; 60 in all; every shape picked is All.
    const L4 = '0,1;1,1;2,1;2,0', Lturned = '0,0;1,0;1,1;1,2';
    const pk = S.normalize(custom({ groups: [{ n: 4, picks: [L4, Lturned, 'junk', '0,0;1,1;2,2;3,3', '0,0;1,0;2,0', '0,0;0,0;1,0;2,0', 5] }] })).custom.groups[0].picks;
    assert.deepStrictEqual(pk, [S.canon(L4.split(';').map((q) => q.split(',').map(Number)))], 'one L (two turns of it), nothing else');
    assert.strictEqual(S.normalize(custom({ groups: [{ n: 3, picks: ['0,0;1,0;2,0', '0,0;0,1;1,0'] }] })).custom.groups[0].picks, undefined, 'both triominoes picked: All');
    const many = S.range(8, 0, 70).map((c) => S.canon(c));
    const capped = S.normalize(custom({ groups: [{ n: 8, picks: many.slice(0, 50) }, { n: 9, picks: S.range(9, 0, 20).map((c) => S.canon(c)) }] })).custom.groups;
    assert.strictEqual(capped[0].picks.length + capped[1].picks.length, S.MAX_PICKS, '60 picks in all');
    assert.strictEqual(S.normalize(custom({ groups: [{ n: 6, picks: [S.canon([[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [1, 2]])] }] })).custom.groups[0].picks, undefined, 'not joined: no pick');
    const holed = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
    assert.strictEqual(S.checkDrawn(holed, 8).why, 'Has a hole');
    assert.strictEqual(S.checkDrawn([[0, 0], [2, 0]], 2).why, 'Not joined');
    assert.deepStrictEqual([S.checkDrawn([[0, 0], [1, 0]], 3).ok, S.checkDrawn([[0, 0], [1, 0], [1, 1]], 3).ok], [false, true]);
    // Retired: picks become a count, shown, never played.
    const withPicks = custom({ groups: [{ n: 9, picks: S.range(9, 0, 3).map((c) => S.canon(c)) }] });
    const thin = R.thin({ shapes: withPicks });
    assert.deepStrictEqual(thin.shapes.custom.groups, [{ n: 9, weight: 'even', picked: 3 }]);
    assert.strictEqual(R.label(thin), 'Custom: 9 blocks (3 picked)');
    // Labels: short (library rows) and whole.
    assert.deepStrictEqual(['normal', 'tiny', 'frantic', 'pentominoes', 'big', 'custom'].map((p) => R.label({ shapes: { preset: p } }, true)), ['', 'Tiny', 'Frantic', 'Pentominoes', 'Big', 'Custom']);
    assert.strictEqual(R.label({ shapes: custom({ groups: [{ n: 1 }, { n: 5 }, { n: 12 }], clusters: { min: 3, max: 3 }, big: 'less' }) }), 'Custom: 1, 5 and 12 blocks, clusters of 3, some Big');
    assert.strictEqual(R.label({ shapes: custom({ groups: [{ n: 1 }], big: 'all' }) }), 'Custom: 1 block, all Big');
    assert(R.equal({ shapes: custom({ groups: [{ n: 4, picks: [L4] }] }) }, { shapes: custom({ groups: [{ n: 4, picks: [Lturned] }] }) }), 'the same pick in two turns is the same recipe');
  });

  test('shapes: Normal deals exactly today’s pieces (the 7-bag, no dealer of its own), for 2000 pieces on 3 seeds', () => {
    for (const seed of [1, 42, 99]) {
      const a = new Game({ w: 10, h: 20, seed }), b = game({ preset: 'normal' }, 10, 20, seed);
      assert.strictEqual(b.dealer, L.BAG_DEALER);
      assert.deepStrictEqual(b.ext, []);
      assert.deepStrictEqual(dealt(b, 2000), dealt(a, 2000), 'seed ' + seed);
    }
  });

  test('shapes: every set deals the same pieces from a seed, after a save mid-round and after Undo', () => {
    for (const [name, sh] of SETS) {
      const m = R.limits({ shapes: sh }), w = Math.max(m.w[0], 10), h = Math.max(m.h[0], 20);
      const a = game(sh, w, h, 7), b = game(sh, w, h, 7);
      assert.deepStrictEqual(dealt(a, 60), dealt(b, 60), name + ': seed');
      // Mid-round (a few dealt), saved and resumed: the same next 100.
      const c = game(sh, w, h, 3);
      dealt(c, 5);
      const saved = JSON.parse(JSON.stringify(c.toJSON()));
      assert(Library.playable(saved), name + ': the save is playable');
      const d = new Game({ saved });
      assert.deepStrictEqual(dealt(d, 100), dealt(c, 100), name + ': resumed');
      // Undo: the queue, the bag and the stream come back, and the same pieces come again.
      const e = game(sh, w, h, 11);
      const before = [e.piece.type.id].concat(e.queue.map((q) => q.id));
      assert(Bot.place(e), name + ': a lock');
      const after1 = e.queue.map((q) => q.id).concat(dealt(e, 0));
      e.undo();
      assert.deepStrictEqual([e.piece.type.id].concat(e.queue.map((q) => q.id)), before, name + ': undo');
      assert(Bot.place(e));
      assert.deepStrictEqual(e.queue.map((q) => q.id), after1, name + ': the same again');
      for (const id of dealt(a, 30)) assert(P.get(id), name + ': ' + id);
    }
  });

  test('shapes: a round deals each source its exact share, each list shape as evenly as it can; 7 blocks are drawn uniformly', () => {
    const c = S.compile(custom({ groups: [{ n: 3, weight: 'less' }, { n: 5, weight: 'more' }, { n: 8, weight: 'even' }], clusters: { min: 2, max: 4, weight: 'even' } }));
    const rng = new L.RNG(5);
    for (let r = 0; r < 10; r++) {
      const toks = S.round(c, rng, []);
      assert.strictEqual(toks.length, 7 + 28 + 14 + 14);
      const by = (si) => toks.filter((t) => t.split('.')[0] === String(si));
      assert.deepStrictEqual([0, 1, 2, 3].map((si) => by(si).length), [7, 28, 14, 14]);
      for (const [si, q, N] of [[0, 7, 2], [1, 28, 18]]) {
        const counts = {};
        for (const t of by(si)) counts[t] = (counts[t] || 0) + 1;
        for (let k = 0; k < N; k++) { const v = counts[si + '.' + k] || 0; assert(v === Math.floor(q / N) || v === Math.ceil(q / N), 'even ' + si + '.' + k + ': ' + v); }
      }
    }
    // Presets: Tiny 2/4/4/4; Frantic one of each of the seven, 7 of a bag of 18 kept between rounds, 2/2/2/1.
    const t = S.round(S.compile({ preset: 'tiny' }), rng, []);
    assert.deepStrictEqual(['0', '1', '2', '3'].map((si) => t.filter((x) => x.split('.')[0] === si).length), [2, 4, 4, 4]);
    const fc = S.compile({ preset: 'frantic' });
    let bag = [], pents = [];
    for (let r = 0; r < 18; r++) {
      bag = S.round(fc, rng, bag);
      const toks = bag.filter((x) => x[0] !== '~');
      assert.strictEqual(toks.length, 21);
      assert.deepStrictEqual(toks.filter((x) => x.startsWith('0.')).map((x) => x.slice(2)).sort(), ['0', '1', '2', '3', '4', '5', '6']);
      pents.push(...toks.filter((x) => x.startsWith('1.')).map((x) => +x.slice(2)));
      bag = bag.filter((x) => x[0] === '~');
    }
    // 18 rounds of 7 = 7 bags of 18: each pentomino 7 times.
    for (let k = 0; k < 18; k++) assert.strictEqual(pents.filter((x) => x === k).length, 7, 'pentomino ' + k);
    assert.strictEqual(S.meanCells({ preset: 'frantic' }), 80 / 21);
    assert.strictEqual(S.meanCells({ preset: 'tiny' }), 34 / 14);
    // Uniform: 19,500 draws of 7 blocks (195 shapes, 100 each expected), chi-square under the 0.1% point for 194 df.
    const g = game(custom({ groups: [{ n: 7 }] }), 10, 20, 1), n7 = {};
    for (let i = 0; i < 19500; i++) { const id = g.dealer.next(g); n7[id] = (n7[id] || 0) + 1; }
    assert.strictEqual(Object.keys(n7).length, 195);
    const chi = Object.values(n7).reduce((a, v) => a + (v - 100) * (v - 100) / 100, 0);
    assert(chi < 265, 'chi-square ' + chi.toFixed(1));
  });

  test('shapes: at each measured minimum every dealt piece fits where it appears, and the bot lives as long as Normal on 4 × 8', () => {
    const T = L.ShapeMins.life;
    assert.strictEqual(Min.target(L), T, 'Normal on 4 × 8');
    for (const [key, shapes] of Min.cases()) {
      const m = L.ShapeMins[key];
      assert(m, key);
      const [w, h, short] = m;
      const lim = R.limits({ shapes });
      assert.deepStrictEqual([lim.w[0], lim.h[0]], [w, h], key + ': the minimum is the measured one');
      if (short != null) assert(w === 20 && h === 40 && short < T, key + ': short of it only on the largest board');
      else assert(Min.lifeAt(L, shapes, w, h, T) >= T, key + ' at ' + w + ' x ' + h);
      const g = game(shapes, w, h, 1);
      for (let i = 0; i < 120; i++) {
        const t = P.get(g.dealer.next(g)), pos = g.spawnPosition(t, 0);
        assert(g.fitsAt({ type: t }, pos.rot, pos.x, pos.y), key + ': ' + t.id + ' fits where it appears');
        assert.strictEqual(pos.y + t.rotBounds[pos.rot].maxY, h - 1, 'its top in the top row');
      }
    }
    // A mix is as small as its largest source; Descent keeps six rows more (14 at least); sizes clamp and a board too small is not resumed.
    assert.deepStrictEqual(R.limits({ shapes: custom({ groups: [{ n: 2 }, { n: 7 }] }) }), { w: [L.ShapeMins.g7[0], 20], h: [L.ShapeMins.g7[1], 40] });
    assert.deepStrictEqual(R.limits({ shapes: { preset: 'pentominoes' }, mode: 'descent' }).h[0], (R.options().some((o) => o.path === 'mode' && o.values.includes('descent')) ? Math.max(14, R.limits({ shapes: { preset: 'pentominoes' } }).h[0] + 6) : R.limits({ shapes: { preset: 'pentominoes' } }).h[0]));
    const big = { shapes: { preset: 'big' } };
    assert.deepStrictEqual(Library.clampSize({ w: 4, h: 8 }, big), { w: L.ShapeMins.big[0], h: L.ShapeMins.big[1] });
    const small = game({ preset: 'big' }, 8, 16, 1).toJSON();
    assert(Library.playable(small));
    small.w = 6; small.h = 12; small.cells = small.cells.slice(0, 72);
    assert(!Library.playable(small), 'a Big board under its minimum is not resumed');
    const junk = game({ preset: 'tiny' }, 10, 20, 1).toJSON();
    junk.bag = ['T', 'I'];
    assert(!Library.playable(junk), 'a bag of another set');
    const lost = game({ preset: 'tiny' }, 10, 20, 1).toJSON();
    lost.queue[0] = { id: 'P:0,0;5,5', rot: 0 };
    assert(!Library.playable(lost), 'a queue id nothing rebuilds');
  });

  test('shapes: every id kind is rebuilt from the id alone (same shape, same colour), and made types stay a bounded few', () => {
    const g = game(custom({ groups: [{ n: 10 }, { n: 5 }], clusters: { min: 3, max: 6 }, big: 'less' }), 12, 24, 4);
    const some = dealt(g, 300);
    const ids = new Set(some.concat(['Fm', 'BFm', 'BZ5m', 'M:0,0;1,0;1,1', 'C:0,0;1,0', 'B' + some.find((id) => id.startsWith('P:')), 'B' + some.find((id) => id.startsWith('K:'))]));
    const was = {};
    for (const id of ids) { const t = P.get(id); assert(t, id); was[id] = [t.color, t.family, P.shapeKey(t.rots[0])]; }
    assert(['P:', 'K:', 'BP:', 'BK:'].every((k) => [...ids].some((id) => id.startsWith(k))), 'every kind dealt');
    for (const id of ids) P.evict(id);
    for (const id of ids) { const t = P.get(id); assert(t, 'rebuilt ' + id); assert.deepStrictEqual([t.color, t.family, P.shapeKey(t.rots[0])], was[id], id); }
    const k = [...ids].find((id) => id.startsWith('P:'));
    assert(P.get(k).color >= 9 && P.get(k).color <= 14, 'a shape’s colour is one of the other shapes’ slots');
    assert.strictEqual(P.mirrorOf(P.TYPES.F).id, 'Fm');
    assert.strictEqual(P.mirrorOf(P.TYPES.Fm).id, 'F');
    assert(P.mirrorOf(P.get(k)).id.startsWith('P:'), 'a shape mirrors to its own kind');
    // Only a key in its canonical turn names a shape; junk is null, never a throw.
    for (const bad of ['P:', 'P:x', 'P:0,0;0,0', 'P:0,0;2,0', 'P:0,1;1,1;1,0', 'K:0,0;1,0', 'K:0,0', 'P:' + '0,0;'.repeat(13) + '0,1', 'BP:9', 'BK:'])
      assert.strictEqual(P.get(bad), null, bad);
    // A long game of 12-block shapes: the made types stay within the LRU.
    const big = game(custom({ groups: [{ n: 12 }] }), 20, 40, 2);
    dealt(big, P.LRU + 300);
    assert(P.made() <= P.LRU, 'made ' + P.made());
  });

  test('shapes: clusters are joined through corners, never all by sides, with no sealed hole, of k blocks in a B × B box', () => {
    const rng = new L.RNG(8);
    for (const [a, b] of [[2, 2], [2, 4], [3, 5], [5, 8], [8, 8]]) {
      const seen = new Set();
      for (let i = 0; i < 400; i++) {
        const c = S.cluster(rng, a, b), bd = P.boundsOf(c), B = S.clusterBox(c.length);
        assert(c.length >= a && c.length <= b);
        assert(P.isLinked(c) && !P.isConnected(c) && !P.hasHole(c), JSON.stringify(c));
        assert(bd.w <= B && bd.h <= B);
        const t = P.clusterType(c);
        assert.strictEqual(P.get(t.id), t);
        seen.add(t.id);
      }
      if (a >= 5) assert(seen.size > 200, 'varied: ' + seen.size);
    }
  });

  test('shapes: Best Fit and Order Slip choose from a bounded list; Reroll draws from the set, never the game’s stream', () => {
    assert.deepStrictEqual(S.candidates(S.compile({ preset: 'tiny' })), ['M1', 'D2', 'I3', 'V3']);
    assert.strictEqual(S.candidates(S.compile({ preset: 'frantic' })).length, 29);
    assert.deepStrictEqual(S.candidates(S.compile({ preset: 'big' })), P.TETROMINOES.map((id) => 'B' + id));
    const g = game(custom({ groups: [{ n: 12 }] }), 20, 40, 3);
    for (let i = 0; i < 20; i++) { const c = g.dealer.candidates(g); assert(c.length >= 1 && c.length <= 7); for (const id of c) assert(P.get(id).size === 12); }
    const st = g.rng.state(), bag = g.bag.slice();
    const r = g.dealer.reroll(g, g.piece.type.id);
    assert(r !== g.piece.type.id && P.get(r).size === 12);
    assert.deepStrictEqual([g.rng.state(), g.bag], [st, bag], 'the stream and the round are untouched');
    const bf = game({ preset: 'pentominoes' }, 10, 20, 3);
    assert(bf.bestFit(), 'Best Fit finds a pentomino');
    assert(P.PENTO18.includes(bf.piece.type.id));
  });

  test('shapes: a 12-block draw is quick (200 in under 2 s; the slowest few well under 5 ms)', () => {
    const rng = new L.RNG(12), times = [];
    S.poly(12, 0);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) { const a = process.hrtime.bigint(); S.poly(12, rng.int(S.TOTAL[12])); times.push(Number(process.hrtime.bigint() - a) / 1e6); }
    const all = Number(process.hrtime.bigint() - t0) / 1e6;
    times.sort((a, b) => a - b);
    assert(all < 2000, 'all: ' + all.toFixed(0) + ' ms');
    assert(times[197] < 25, 'p99: ' + times[197].toFixed(2) + ' ms (5 ms on an idle desktop; room for a loaded machine)');
  });

  test('shapes: the rules: Big pays by its blocks and needs eight rows for a quad; every other set is unrated', () => {
    const rules = (sh, w) => R.rules({ shapes: sh }, w || 10);
    const big = rules({ preset: 'big' }, 20);
    assert.deepStrictEqual([big.u, big.E, big.f, big.rated, big.quad, big.feats], [2, 16, 0.25, true, 8, true]);
    assert.strictEqual(rules({ preset: 'big' }, 16).feats, false, 'feats need 10 columns of Big blocks');
    for (const p of ['tiny', 'frantic', 'pentominoes']) assert.strictEqual(rules({ preset: p }).rated, false, p);
    assert.strictEqual(rules(custom({ groups: [{ n: 4 }] })).rated, true, 'the seven alone');
    assert.strictEqual(rules(custom({ groups: [{ n: 4 }], big: 'all' })).u, 2);
    for (const sh of [custom({ groups: [{ n: 4 }], big: 'less' }), custom({ groups: [{ n: 4, picks: ['0,0;1,0;2,0;3,0'] }] }), custom({ groups: [{ n: 4 }], clusters: { min: 2, max: 3 } })]) {
      const Rr = rules(sh);
      assert.strictEqual(Rr.rated, false, JSON.stringify(sh));
      assert(Rr.refuse.double && Rr.refuse.net, 'Double or Nothing and Safety Net refused');
    }
    // The mean blocks a piece, a doubled piece four times its own (the arithmetic mean: f never above Standard's); a set
    // of fewer turns than the seven's 19 counted up by 19 over its turns.
    assert.strictEqual(rules(custom({ groups: [{ n: 4 }], big: 'less' })).E, (4 * 14 + 16 * 7) / 21);
    assert.deepStrictEqual(['tiny', 'frantic', 'pentominoes', 'big'].map((p) => S.variety({ preset: p })), [9, 19, 19, 19]);
    assert.strictEqual(rules({ preset: 'tiny' }).E, (34 / 14) * (19 / 9));
    assert.strictEqual(rules(custom({ groups: [{ n: 4, picks: ['0,0;1,0;2,0;3,0'] }] })).E, 4 * 19 / 2, 'the I alone: two turns');
    assert.strictEqual(rules(custom({ groups: [{ n: 12 }], clusters: { min: 2, max: 8 } })).E, (12 * 14 + 5 * 14) / 28);
    // Clusters or drawn groups count 19 turns for their share alone: squares (More) with a few Less clusters stay near
    // the square's one turn.
    const sq = '0,0;1,0;0,1;1,1', oc = custom({ groups: [{ n: 4, weight: 'more', picks: [sq] }], clusters: { min: 2, max: 2, weight: 'less' } });
    assert(Math.abs(S.variety(oc) - (28 * 1 + 7 * 19) / 35) < 1e-9, 'variety by share');
    assert(Math.abs(rules(oc).E - ((4 * 28 + 2 * 7) / 35) * 19 / ((28 + 7 * 19) / 35)) < 1e-9, 'squares and clusters: counted up');
    // Two Big lines (four rows) on a Big board: no quad, no streak, no bonus; four Big lines are a quad.
    const g = game({ preset: 'big' }, 8, 16, 1, { previewCount: 1 });
    const fill = (rows) => { for (let y = 0; y < rows; y++) for (let x = 0; x < 6; x++) g.board.set(x, y, 1); };
    fill(4);
    g.replacePiece({ id: 'BI' });
    g.piece.rot = 1; g.piece.x = 8 - 1 - g.piece.type.rotBounds[1].maxX; g.piece.y = 8;
    const r = g.drop();
    assert.strictEqual(r.lines, 4);
    assert.strictEqual(r.quad, false);
    assert.strictEqual(g.s.b2b, -1, 'no streak');
    const s = { mult: 1 };
    assert.strictEqual(Pay.clear(s, r, g.rules).pay, Library.bank(4 * g.rules.lk), 'rows alone, no difficult bonus');
    g.board.cells.fill(0);
    fill(8);
    g.replacePiece({ id: 'BI' });
    g.piece.rot = 1; g.piece.x = 8 - 1 - g.piece.type.rotBounds[1].maxX; g.piece.y = 8;
    const q = g.drop();
    assert.strictEqual(q.lines, 8);
    assert.strictEqual(q.quad, true, 'four Big lines are a quad');
  });

  test('shapes: no set pays more a piece or a press than Standard (than Normal on 4 × 8, on a board under 10 × 20), bars and squares alone included', () => {
    const run = (shapes, w, h, seed, N) => {
      const g = game(shapes, w, h, seed, { maxHistory: 0 });
      let pay = 0, n = 0;
      g.on('lock', (r) => { if (!r.lines) return; g.s.mult = Pay.mult(g); pay += Pay.clear(g.s, r, g.rules).pay; });
      while (n < N && !g.over && g.piece) { if (!Bot.play(g)) break; n++; }
      const s = g.s;
      return { pay, n, acts: s.moves + s.rotations + s.drops + s.lowers + s.holds };
    };
    const rate = (shapes, w, h) => {
      let pay = 0, n = 0, acts = 0;
      for (const seed of [1, 2, 3]) { const r = run(shapes, w, h, seed, 200); pay += r.pay; n += r.n; acts += r.acts; }
      return { piece: pay / n, action: pay / acts };
    };
    // Standard (Normal, 10 × 20) a piece: at least four blocks at a tenth of a line each, what it pays before its
    // bonuses (the bot's games end with blocks still on the board); a press: Standard's, and on a board under 10 × 20,
    // the fastest board of the seven (4 × 8: the fewest presses a piece), as sizes already pay.
    const std = rate({ preset: 'normal' }, 10, 20), fast = rate({ preset: 'normal' }, 4, 8), perPiece = Math.max(std.piece, 0.4), out = {};
    assert(fast.action > std.action);
    const bar = (n) => P.canonKey(Array.from({ length: n }, (_, i) => [i, 0]));
    const rect = (a, b) => { const c = []; for (let x = 0; x < a; x++) for (let y = 0; y < b; y++) c.push([x, y]); return P.canonKey(c); };
    const pick = (n, keys) => ({ n, picks: keys });
    for (const [name, sh] of [['tiny', { preset: 'tiny' }], ['frantic', { preset: 'frantic' }], ['pentominoes', { preset: 'pentominoes' }], ['big', { preset: 'big' }],
      ['12 blocks', custom({ groups: [{ n: 12 }] })], ['clusters', custom({ clusters: { min: 2, max: 8 } })], ['big less', custom({ groups: [{ n: 4 }], big: 'less' })],
      // Sets a player could pick to place quickly: bars and squares, one or two shapes, Big squares.
      ['I alone', custom({ groups: [pick(4, [bar(4)])] })], ['I and O', custom({ groups: [pick(4, [bar(4), rect(2, 2)])] })], ['Big dominoes', custom({ groups: [{ n: 2 }], big: 'all' })],
      // Mostly one easy shape, with a few clusters (drawn fresh) beside it.
      ['O more + clusters 2-2 less', custom({ groups: [{ n: 4, weight: 'more', picks: [rect(2, 2)] }], clusters: { min: 2, max: 2, weight: 'less' } })],
      ['I+O more + clusters 2-2 less', custom({ groups: [{ n: 4, weight: 'more', picks: [bar(4), rect(2, 2)] }], clusters: { min: 2, max: 2, weight: 'less' } })],
      ['Big 1-2', custom({ groups: [{ n: 1 }, { n: 2 }], big: 'all' })], ['a 12 bar', custom({ groups: [pick(12, [bar(12)])] })],
      ['bars 1-12', custom({ groups: [{ n: 1 }, { n: 2 }].concat([3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => pick(n, [bar(n)]))) })],
      ['rectangles', custom({ groups: [{ n: 1 }, { n: 2 }, pick(3, [bar(3)]), pick(4, [bar(4), rect(2, 2)]), pick(5, [bar(5)]), pick(6, [bar(6), rect(2, 3)]), pick(8, [rect(2, 4)])] })]]) {
      const lim = R.limits({ shapes: sh });
      for (const [w, h] of [[lim.w[0], lim.h[0]], [Math.max(10, lim.w[0]), Math.max(20, lim.h[0])]]) {
        const a = rate(sh, w, h), perAction = w >= 10 && h >= 20 ? std.action : fast.action;
        out[name + ' ' + w + 'x' + h] = a.piece.toFixed(3) + '/' + a.action.toFixed(3);
        assert(a.piece <= perPiece, name + ' ' + w + 'x' + h + ' a piece: ' + a.piece + ' vs ' + perPiece);
        assert(a.action <= perAction, name + ' ' + w + 'x' + h + ' a press: ' + a.action + ' vs ' + perAction);
      }
    }
    console.log('       a piece / a press (Standard ' + std.piece.toFixed(3) + '/' + std.action.toFixed(3) + ', Normal 4 x 8 ' + fast.piece.toFixed(3) + '/' + fast.action.toFixed(3) + '): ' + JSON.stringify(out));
  });
};
