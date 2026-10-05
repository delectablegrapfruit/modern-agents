// Battle's rules in Node (js/battle.js): the recipe and its sizes, charges (one a row, six at most), a throw landing
// exactly where it was aimed (dropped from their top onto their stack), thrown cells clearing as the board's own (a
// backfire too), the top out, sudden death (its timing, the ceiling's stone, clears under it, both at once), the AI's
// throws by level, its handling of pieces thrown at it, the ladder, pay (never above Standard a piece or an action), and
// the save mid-round. Run by test.cjs: require('./battle-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function battleUnit({ L, test }) {
  const { Game, Pieces, Recipe, Battle: B, CELL, Library, RNG } = L;
  const R0 = (o) => Recipe.normalize(Object.assign({ mode: 'battle', battle: { level: 'steady' } }, o || {}));
  const mk = (w, hh, seed, o) => new Game(Object.assign({ w: w || 10, h: hh || 14, seed: seed == null ? 1 : seed, recipe: R0(), battleAI: true, previewCount: 5 }, o || {}));
  /** A board from rows of text, bottom row first: '#' a block, '.' empty. */
  const paint = (g, rows) => { g.board.cells.fill(0); rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.board.set(x, y, 8); }); };
  /** The piece in play becomes `id`, turned rot, its box at column x, at the top. */
  const put = (g, id, x, rot) => {
    const type = Pieces.get(id), r = rot || 0;
    g.piece = { type, rot: r, x, y: B.top(g) - 1 - type.rotBounds[r].maxY, special: null, entry: { id, rot: 0 }, lastRot: false };
    return g.piece;
  };
  const sd = (g, lv, seed) => { const s = B.side(g); s.lvl = B.LEVELS[lv || 'steady']; s.rng = new RNG(seed || 9); return s; };
  const cellsOf = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.board.get(x, y)) out.push(x + ',' + y); return out; };

  test('battle: the recipe (a mode after Race, levels Easy to Swift, Steady by default), its label, sizes 6–12 by 10–16, rules, Mirror, Physics and Big ruled out', () => {
    const modes = Recipe.options().find((o) => o.path === 'mode').values;
    assert.deepStrictEqual(modes.filter((m) => m !== 'mural').slice(-2), ['race', 'battle'], 'Race, then Battle');
    assert.deepStrictEqual(Recipe.normalize({ mode: 'battle' }).battle, { level: 'steady' });
    assert.strictEqual(Recipe.normalize({ battle: { level: 'swift' } }).battle, undefined, 'its settings only in Battle');
    assert.strictEqual(Recipe.label(R0({ battle: { level: 'swift' } })), 'Battle · Swift');
    assert.strictEqual(Recipe.label(R0(), true), 'Battle');
    assert.deepStrictEqual(Recipe.limits(R0()), { w: [6, 12], h: [10, 16] });
    assert.deepStrictEqual(Recipe.clampSize({}, R0()), { w: 10, h: 14 }, 'a size not given is 10 × 14');
    assert.deepStrictEqual(Recipe.clampSize({ w: 20, h: 40 }, R0()), { w: 12, h: 16 });
    const R = Recipe.rules(R0(), 10);
    assert(!R.k && !R.undo && !R.hints && R.timed && R.battle && R.noFeats, JSON.stringify(R));
    for (const id of Object.keys(L.ITEMS)) assert.strictEqual(R.refuse[id], 'Not in Battle', id);
    const c = Recipe.conflicts(R0());
    assert.strictEqual(c['mods.mirror=true'], 'Not in Battle');
    assert.strictEqual(c['mods.physics=true'], 'Not in Battle');
    assert.strictEqual(c['shapes.preset=big'], 'Not in Battle');
    assert.strictEqual(Recipe.resolve({ mode: 'battle', mods: { physics: true } }, 'mode', {}).recipe.mods.physics, false, 'choosing Battle turns Physics off');
    assert.strictEqual(mk().h, 14, 'no buffer: the board is its height');
  });

  test('battle: a row cleared is a charge (a quad four), six at most', () => {
    const g = mk(6, 10), S = sd(g);
    paint(g, ['#####.', '#####.', '#####.', '#####.']);
    put(g, 'I', 5 - Pieces.get('I').rotBounds[1].minX, 1);
    const r = g.drop();
    assert.strictEqual(r.lines, 4);
    B.afterLock(S, r);
    assert.deepStrictEqual([S.S.charges, S.S.lines, S.S.pieces], [4, 4, 1]);
    paint(g, ['#####.', '#####.', '#####.', '#####.']);
    put(g, 'I', 5 - Pieces.get('I').rotBounds[1].minX, 1);
    B.afterLock(S, g.drop());
    assert.strictEqual(S.S.charges, B.MAX_CHARGES, 'capped at six');
    assert.strictEqual(S.S.lines, 8, 'every row still counted');
    B.afterLock(S, { lines: 0 });
    assert.strictEqual(S.S.charges, 6);
  });

  test('battle: a throw lands exactly where it was aimed: dropped from their top to rest on their stack, their piece in play not in the way', () => {
    const a = mk(10, 14, 1), b = mk(10, 14, 2), A = sd(a), Bs = sd(b);
    paint(b, ['##########'.replace(/#/g, '.'), '..........']);
    paint(b, ['###.......', '###.......', '#.........']);
    A.S.charges = 1;
    const p = put(a, 'L', 0, 0), next = a.queue[0].id;
    // Every aim of every turn: the landing is the lowest spot straight under the top, and the cells it fills are those.
    for (const aim of B.aims(b, p.type)) {
      const land = B.landing(b, p.type, aim.rot, aim.x);
      assert(land, JSON.stringify(aim));
      const fits = (y) => p.type.rots[aim.rot].every(([cx, cy]) => { const x = aim.x + cx, yy = y + cy; return x >= 0 && x < 10 && yy >= 0 && yy < 14 && !b.board.get(x, yy); });
      assert(fits(land.y) && !fits(land.y - 1), 'resting');
      for (let y = land.y; y <= 14 - 1 - p.type.rotBounds[aim.rot].maxY; y++) assert(fits(y), 'a clear way down from the top');
    }
    // Their piece hangs right over column 5: the throw falls past it (it is not on the board).
    put(b, 'O', 4, 0);
    const aim = { rot: 2, x: 4 }, land = B.landing(b, p.type, aim.rot, aim.x);
    const before = new Set(cellsOf(b));
    const r = B.throwAt(A, Bs, aim);
    assert(r && r.id === 'L');
    const added = cellsOf(b).filter((k) => !before.has(k)).sort();
    assert.deepStrictEqual(added, land.cells.map(([x, y]) => x + ',' + y).sort(), 'exactly the shadow\'s cells');
    for (const [x, y] of land.cells) assert.strictEqual(b.board.get(x, y), Pieces.get('L').color, 'the piece\'s own colour, not FOREIGN');
    assert.deepStrictEqual([A.S.charges, A.S.throws, Bs.S.got], [0, 1, 1]);
    assert.strictEqual(a.piece.type.id, next, 'your next piece came in');
    // No charge, no throw; a turn that does not fit at their top, no throw.
    assert.strictEqual(B.throwAt(A, Bs, aim), null);
    paint(b, ['#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........']);
    A.S.charges = 1; put(a, 'I', 0, 1);
    assert.strictEqual(B.landing(b, a.piece.type, 1, -Pieces.get('I').rotBounds[1].minX), null, 'column 0 is full to the top');
    assert.strictEqual(B.throwAt(A, Bs, { rot: 1, x: -Pieces.get('I').rotBounds[1].minX }), null);
    assert.strictEqual(A.S.charges, 1, 'kept');
  });

  test('battle: thrown cells clear as their own: a row they complete clears for them (a backfire: their charge); later rows with thrown cells clear too', () => {
    const a = mk(6, 10, 1), b = mk(6, 10, 2), A = sd(a), Bs = sd(b);
    // Their bottom row lacks two cells at 4 and 5; an O thrown there completes it (and half of the next).
    paint(b, ['####..', '#.....']);
    A.S.charges = 1; put(a, 'O', 0, 0);
    const r = B.throwAt(A, Bs, { rot: 0, x: 4 - Pieces.get('O').rotBounds[0].minX });
    assert(r && r.res.lines === 1, JSON.stringify(r && r.res.lines));
    assert.deepStrictEqual([Bs.S.lines, Bs.S.backfire, Bs.S.charges, A.S.gave], [1, 1, 1, 1], 'their row, their charge');
    assert.deepStrictEqual(cellsOf(b).sort(), ['0,0', '4,0', '5,0'].sort(), 'the row cleared; the O\'s top half came down');
    // A row holding thrown cells clears on their own lock, as any row.
    paint(b, []);
    b.board.set(4, 0, Pieces.get('O').color); b.board.set(5, 0, Pieces.get('O').color);
    put(b, 'I', -Pieces.get('I').rotBounds[0].minX, 0);
    const lk = b.drop();
    assert.strictEqual(lk.lines, 1, 'their I and the thrown O make a row');
    B.afterLock(Bs, lk);
    assert.strictEqual(Bs.S.charges, 2);
    assert.strictEqual(lk.plain || 0, 0, 'not a plain (foreign) row');
  });

  test('battle: the top out: a landing their piece cannot come in under, or a next piece with no room, ends that board (over)', () => {
    const a = mk(6, 10, 1), b = mk(6, 10, 2), A = sd(a), Bs = sd(b);
    // Their stack 8 high (the right column open, so no row clears), their O about to come in at the top: an I thrown flat
    // lands on the stack right where the O is, and the O finds no room anywhere near: out.
    const rows = []; for (let y = 0; y < 8; y++) rows.push('#####.');
    paint(b, rows);
    put(b, 'O', 2 - Pieces.get('O').rotBounds[0].minX, 0);
    A.S.charges = 1; put(a, 'I', 0, 0);
    const r = B.throwAt(A, Bs, { rot: 0, x: 1 - Pieces.get('I').rotBounds[0].minX });
    assert(r && r.land.cells.every(([, y]) => y === 8), JSON.stringify(r && r.land));
    assert(b.over, 'their piece had no room: out');
    // Their spawn spot is blocked? Over only when no spot near it fits.
    const full = []; for (let y = 0; y < 10; y++) full.push('###.##');
    paint(b, full);
    b.over = false; put(b, 'O', 1, 0);
    b.spawn({ id: 'O', rot: 0 });
    assert(b.over, 'no room for the O: out');
    // Their own lock with no room for the next piece: out.
    const c = mk(6, 10, 3);
    const rr = []; for (let y = 0; y < 9; y++) rr.push(y % 2 ? '##.###' : '###.##');
    paint(c, rr);
    put(c, 'I', 0, 0);
    c.queue[0] = { id: 'O', rot: 0 };
    c.drop();
    assert(c.over, 'the O after it had nowhere to come in');
  });

  test('battle: sudden death: from 3:00 a ceiling row every 20 s, stone; rows under it clear and it stays; pieces come in under it; both out at once: the higher stack loses', () => {
    assert.deepStrictEqual([179999, 180000, 199999, 200000, 240000].map(B.ceilAt), [0, 1, 1, 2, 4]);
    assert.strictEqual(B.nextCeilIn(170000), 10000);
    assert.strictEqual(B.nextCeilIn(185000), 15000);
    const g = mk(6, 10, 1), S = sd(g);
    paint(g, ['#####.', '#####.']);
    put(g, 'O', 1, 0);
    assert.strictEqual(B.lowerTo(S, 2), false);
    assert.strictEqual(B.top(g), 8);
    for (let x = 0; x < 6; x++) { assert.strictEqual(g.board.get(x, 9), B.STONE); assert.strictEqual(g.board.get(x, 8), B.STONE); }
    assert(g.board.get(0, 9) & CELL.FOREIGN && g.board.get(0, 9) & CELL.FILL, 'stone: never yours');
    assert(g.piece.y + g.piece.type.rotBounds[0].maxY < 8, 'the piece in play moved down under it');
    // A clear under the ceiling: the rows above come down to it, the ceiling stays.
    put(g, 'I', 5 - Pieces.get('I').rotBounds[1].minX, 1);
    const r = g.drop();
    assert.strictEqual(r.lines, 2, 'the stone rows are full but never clear');
    for (let x = 0; x < 6; x++) { assert.strictEqual(g.board.get(x, 9), B.STONE); assert.strictEqual(g.board.get(x, 8), B.STONE); assert.strictEqual(g.board.get(x, 7), x === 5 ? 0 : 0); }
    assert(g.piece, 'the next piece came in');
    const p = g.piece;
    assert(p.y + p.type.rotBounds[p.rot].maxY < 8, 'under the ceiling');
    // The match: both together; both out at once, the higher stack loses.
    const me = new Game({ w: 6, h: 10, seed: 4, recipe: R0(), previewCount: 5 }), M = B.matchOf(me);
    assert(M && M.ai && M.ai.game.h === 10);
    M.round.phase = 'play'; M.round.ms = 185000;
    assert.strictEqual(B.ceilings(M), null);
    assert.deepStrictEqual([M.me.S.ceil, M.ai.S.ceil], [1, 1]);
    const tall = []; for (let y = 0; y < 8; y++) tall.push('#####.');
    paint(me, tall); paint(M.ai.game, tall.slice(0, 7).concat(['......']));
    M.ai.game.board.set(0, 7, 8);
    put(me, 'I', 5 - Pieces.get('I').rotBounds[1].minX, 1); put(M.ai.game, 'I', 5 - Pieces.get('I').rotBounds[1].minX, 1);
    M.round.ms = 240000;
    const out = B.ceilings(M);
    assert(me.over && M.ai.game.over, 'both out');
    assert.strictEqual(out, B.cellsIn(me) > B.cellsIn(M.ai.game) ? 'me' : 'ai', 'the higher stack is out');
  });

  test('battle: the AI throws by its level: Easy now and then and anywhere, Steady with two charges onto the highest column, Brisk into a well, Swift once you near the top', () => {
    const pair = (lv, seed) => { const a = mk(10, 14, seed || 1), b = mk(10, 14, (seed || 1) + 50); return [sd(a, lv, seed), sd(b, 'steady', 3)]; };
    // Easy: about one piece in three, at aims all over.
    {
      let n = 0, tries = 0; const xs = new Set();
      for (let s = 1; s <= 60; s++) {
        const [A, Bs] = pair('easy', s);
        A.S.charges = 1;
        const d = B.runAll(B.think(A, Bs, {}));
        tries++;
        if (d.kind === 'throw') { n++; xs.add(d.aim.rot + ':' + d.aim.x); }
      }
      assert(n >= 8 && n <= 32, 'Easy threw ' + n + ' of ' + tries);
      assert(xs.size >= 5, 'at many aims: ' + xs.size);
    }
    // Steady: not with one charge; with two, onto the highest column.
    {
      const [A, Bs] = pair('steady');
      paint(Bs.game, ['..........', '.......#..', '.......#..', '.......#..'].map((r, i) => (i === 0 ? '#########.' : r)));
      A.S.charges = 1;
      assert.strictEqual(B.runAll(B.think(A, Bs, {})).kind, 'place', 'one charge: kept');
      A.S.charges = 2;
      const d = B.runAll(B.think(A, Bs, {}));
      assert.strictEqual(d.kind, 'throw');
      const type = A.game.piece.type, hiOf = (l) => Math.max(...l.cells.map(([, y]) => y));
      const land = B.landing(Bs.game, type, d.aim.rot, d.aim.x);
      const best = Math.max(...B.aims(Bs.game, type).map((m) => B.landing(Bs.game, type, m.rot, m.x)).filter(Boolean).map(hiOf));
      assert.strictEqual(hiOf(land), best, 'the highest landing there is');
      assert(land.cells.some(([x]) => x === 7), 'on the tower at column 7: ' + JSON.stringify(land.cells));
    }
    // Brisk: into their well (a deep one-wide gap at column 9), never completing a row for them.
    {
      const [A, Bs] = pair('brisk');
      paint(Bs.game, ['#########.', '#########.', '#########.', '#########.', '###...###.']);
      A.S.charges = 3; put(A.game, 'O', 4, 0);
      const d = B.runAll(B.think(A, Bs, {}));
      assert.strictEqual(d.kind, 'throw');
      const land = B.landing(Bs.game, A.game.piece.type, d.aim.rot, d.aim.x);
      const wellCovered = land.cells.some(([x]) => x === 9) || land.cells.some(([x, y]) => x >= 3 && x <= 5 && y === 4);
      assert(wellCovered, 'over the well or into the slot: ' + JSON.stringify(land.cells));
      const tmp = Bs.game.board.clone(); tmp.placeCells(land.cells, 3);
      assert.strictEqual(tmp.fullRows().length, 0, 'no backfire');
    }
    // Swift: holds its charges while you are low, throws once you are near the top (or its charges are full).
    {
      const [A, Bs] = pair('swift');
      A.S.charges = 2;
      assert.strictEqual(B.runAll(B.think(A, Bs, {})).kind, 'place', 'you are low: it waits');
      const rows = []; for (let y = 0; y < 9; y++) rows.push(y % 2 ? '####.#####' : '#####.####');
      paint(Bs.game, rows);
      const d = B.runAll(B.think(A, Bs, {}));
      assert.strictEqual(d.kind, 'throw', 'you are near the top: it throws');
      paint(Bs.game, []);
      A.S.charges = B.MAX_CHARGES;
      assert.strictEqual(B.runAll(B.think(A, Bs, {})).kind, 'throw', 'charges full: it throws');
    }
  });

  test('battle: the AI plays on with pieces thrown at it: every path valid move by move; the same round from the same seed', () => {
    const run = () => { const r = B.simulate({ levels: ['brisk', 'steady'], seed: 77 }); return r.winner + ':' + r.time.toFixed(3) + ':' + r.sides.map((s) => s.pieces + '/' + s.S.throws + '/' + s.S.got).join(); };
    const one = run();
    assert.strictEqual(one, run());
    const rng = new RNG(5);
    let checked = 0;
    for (let n = 0; n < 20; n++) {
      const a = mk(10, 14, n + 1), b = mk(10, 14, n + 60), A = sd(a, 'steady'), Bs = sd(b, 'brisk');
      for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) if (rng.next() < 0.45) b.board.set(x, y, 8);
      // Three pieces thrown at it; then it places each piece it is given, its paths played on the engine.
      for (let k = 0; k < 3; k++) { A.S.charges = 1; const aim = B.aims(b, a.piece.type)[rng.int(8)]; B.throwAt(A, Bs, aim); }
      assert(Bs.S.got >= 1);
      for (let k = 0; k < 4 && !b.over; k++) {
        const d = B.runAll(B.think(Bs, A, { noThrow: true }));
        if (d.kind !== 'place') break;
        const r = B.act(Bs, d);
        assert(r.res, 'set');
        B.afterLock(Bs, r.res);
        checked++;
      }
    }
    assert(checked >= 40, String(checked));
  });

  test('battle: the ladder: Swift beats Easy in at least 18 of 20; a player at 3 s a piece (Steady\'s judgement) beats Easy in at least 14 of 20', () => {
    let swift = 0, human = 0;
    for (let s = 0; s < 20; s++) {
      if (B.simulate({ levels: ['swift', 'easy'], seed: 100 + s }).winner === 0) swift++;
      if (B.simulate({ levels: ['easy', 'easy'], seed: 100 + s, human: { pace: 3 } }).winner === 0) human++;
    }
    console.log('       Swift beats Easy ' + swift + '/20; the 3 s player beats Easy ' + human + '/20');
    assert(swift >= 18, String(swift));
    assert(human >= 14, String(human));
  });

  test('battle: pay: a row a Standard row, at most a Standard piece a piece set, the opponent\'s D, a loss half; never above Standard a piece or an action, in play', () => {
    const g = mk(10, 14, 1), S = sd(g);
    Object.assign(S.S, { lines: 4, pieces: 10 });
    assert.strictEqual(B.pay(S, 'swift', true), 4 * 1 * 1 * 0.85);
    assert.strictEqual(B.pay(S, 'swift', false), 4 * 0.85 * 0.5);
    Object.assign(S.S, { lines: 10, pieces: 4 });
    assert(Math.abs(B.pay(S, 'easy', true) - 4 * 0.4 * 0.4) < 1e-9, 'capped by pieces: backfires never pay more than pieces set');
    // At most 0.34 a piece (Standard pays 0.37–0.39): a spotless clearer of every set, against Swift.
    for (const preset of ['normal', 'tiny', 'frantic', 'pentominoes']) {
      const R = Recipe.rules(R0({ shapes: { preset } }), 10);
      assert((R.E / 10) * R.f * B.LEVELS.swift.D <= 0.34 + 1e-9, preset);
    }
    // In play: simulated rounds at every level (pay over pieces set, and over pieces set and thrown).
    let worst = 0;
    for (const lv of B.IDS) for (const preset of ['normal', 'pentominoes']) {
      let pay = 0, pieces = 0, acts = 0;
      for (let s = 0; s < 4; s++) {
        const r = B.simulate({ levels: ['swift', lv], seed: 300 + s, shapes: { preset } });
        for (const i of [0, 1]) { pay += r.sides[i].pay; pieces += r.sides[i].pieces; acts += r.sides[i].pieces + r.sides[i].S.throws; }
      }
      worst = Math.max(worst, pay / pieces);
      assert(pay / pieces <= 0.34 && pay / acts <= 0.34, lv + ' ' + preset + ' ' + (pay / pieces).toFixed(3));
    }
    console.log('       pay in simulated rounds: at most ' + worst.toFixed(3) + ' a piece (Standard 0.37–0.39)');
  });

  test('battle: the save mid-round: toJSON round trip (charges, ceilings, the match, the opponent\'s own board), playable, valid', () => {
    const g = new Game({ w: 10, h: 14, seed: 5, recipe: R0({ battle: { level: 'brisk' } }), previewCount: 5 });
    const M = B.matchOf(g);
    assert(M && M.ai && M.level === 'brisk' && M.ai.game.h === 14);
    g.drop(); M.ai.game.drop();
    M.round.phase = 'play'; M.round.ms = 201000; M.tally.brisk = [3, 2]; M.me.S.charges = 4; M.me.S.lines = 4;
    B.ceilings(M);
    assert.deepStrictEqual([M.me.S.ceil, M.ai.S.ceil], [2, 2]);
    const j = JSON.parse(JSON.stringify(g.toJSON()));
    assert(Library.playable(j) && Recipe.valid(j));
    const g2 = new Game({ saved: j, previewCount: 5 }), M2 = B.matchOf(g2);
    assert.deepStrictEqual(Array.from(g2.board.cells), Array.from(g.board.cells));
    assert.deepStrictEqual(Array.from(M2.ai.game.board.cells), Array.from(M.ai.game.board.cells));
    assert(M2.round.phase === 'play' && M2.round.ms === 201000 && M2.me.S.charges === 4 && M2.me.S.ceil === 2 && M2.ai.S.ceil === 2 && B.tallyText(M2) === 'vs Brisk 3–2');
    assert.strictEqual(g2.findRoom, false, 'a resumed board still tops out where a piece cannot come in');
    assert.deepStrictEqual(g2.toJSON(), g.toJSON());
    // The next round: both boards empty, ceilings up, charges gone.
    M2.round.phase = 'end';
    B.newRound(M2);
    assert(g2.board.isEmpty() && M2.ai.game.board.isEmpty() && M2.me.S.ceil === 0 && M2.me.S.charges === 0 && M2.round.n === 2 && g2.piece && M2.ai.game.piece);
    assert.deepStrictEqual(Recipe.summary(j).battle, { level: 'brisk', won: 3, lost: 2, wins: 0, losses: 0, rounds: 0 });
  });

  test('battle: Standard and Frantic: four rule sets each, every one a legal Battle (its size, shapes), 96 cells or more; Frantic smaller, a charge in hand, earlier ceilings', () => {
    const V = L.Versus;
    assert.strictEqual(new Set(B.SETS.map((s) => s.id)).size, B.SETS.length, 'ids are one a set');
    for (const t of V.TEMPOS) assert.strictEqual(V.poolOf(B.SETS, t).length, 4, t);
    const least = Math.min(...V.poolOf(B.SETS, 'standard').map((s) => s.w * s.h));
    for (const s of B.SETS) {
      const r = R0({ battle: { level: 'steady', set: s.id }, shapes: { preset: s.shapes } });
      assert.deepStrictEqual(r.battle, { level: 'steady', tempo: s.tempo, set: s.id }, s.id);
      assert(Recipe.sizeOk(s.w, s.h, r), s.id + ' ' + s.w + 'x' + s.h);
      assert.deepStrictEqual(Recipe.clampSize({ w: s.w, h: s.h }, r), { w: s.w, h: s.h }, s.id);
      assert(!Recipe.conflicts(r)['shapes.preset=' + s.shapes], s.id + ': its shapes are allowed in Battle');
      assert(s.w * s.h >= 96, s.id + ': wins count there (96 cells or more)');
      const R = Recipe.rules(r, s.w);
      assert(R.btSudden === s.sudden && R.btCeil === s.ceil && R.btStart === s.start && R.aiPace === s.pace, s.id);
      assert(s.start >= 0 && s.start < B.MAX_CHARGES && s.ceil >= 5000 && s.sudden >= 30000 && s.pace > 0.5 && s.pace <= 1, s.id);
      if (s.tempo === 'standard') assert(s.shapes === 'normal' && s.sudden === B.SUDDEN_MS && s.ceil === B.CEIL_MS && !s.start && s.pace === 1 && s.w * s.h >= 120, s.id + ': the usual Battle');
      else assert(s.sudden < B.SUDDEN_MS && s.ceil < B.CEIL_MS && s.start >= 1 && s.pace < 1 && s.w * s.h < least, s.id + ': quicker, on fewer cells than any Standard set');
    }
    assert.deepStrictEqual(R0({ battle: { tempo: 'x', set: 'zz' } }).battle, { level: 'steady' });
    const g = mk(10, 14, 1);
    assert(B.suddenOf(g) === B.SUDDEN_MS && B.ceilOf(g) === B.CEIL_MS && B.startOf(g) === 0 && B.setText(g) === '' && B.side(g).S.charges === 0);
  });

  test('battle: a new game draws its set with the game\'s seed (the same seed the same set, every set drawn); its timing, charges and pace in play, kept in the save', () => {
    const deal = (tempo, seed) => Recipe.deal(R0({ battle: { level: 'swift', tempo } }), { w: 10, h: 14 }, new RNG(seed));
    for (const tempo of L.Versus.TEMPOS) {
      const seen = new Set();
      for (let seed = 1; seed <= 60; seed++) {
        const a = deal(tempo, seed), s = B.SETS.find((x) => x.id === a.recipe.battle.set);
        assert.deepStrictEqual(a, deal(tempo, seed));
        assert(s && s.tempo === tempo && a.recipe.battle.level === 'swift' && a.recipe.shapes.preset === s.shapes && a.size.w === s.w && a.size.h === s.h, JSON.stringify(a));
        seen.add(s.id);
      }
      assert.strictEqual(seen.size, 4, tempo);
    }
    const f = B.SETS.find((s) => s.id === 'f2');
    const g = new Game({ w: f.w, h: f.h, seed: 5, recipe: R0({ battle: { level: 'steady', set: 'f2' }, shapes: { preset: f.shapes } }), previewCount: 5 });
    const M = B.matchOf(g);
    assert(M.me.S.charges === 2 && M.ai.S.charges === 2, 'both start with the set\'s charges');
    assert.strictEqual(M.ai.lvl.pace, Math.round(B.LEVELS.steady.pace * f.pace * 100) / 100);
    assert.deepStrictEqual([59999, 60000, 67999, 68000].map((ms) => B.ceilAt(ms, g)), [0, 1, 1, 2]);
    assert.strictEqual(B.nextCeilIn(50000, g), 10000);
    assert.strictEqual(B.setText(g), 'Frantic · 8 × 12 · Ceilings from 1:00');
    M.round.phase = 'play'; M.round.ms = 61000;
    B.ceilings(M);
    assert.deepStrictEqual([M.me.S.ceil, M.ai.S.ceil], [1, 1], 'the ceilings come down at 1:00');
    M.me.S.charges = 5;
    const j = JSON.parse(JSON.stringify(g.toJSON())), g2 = new Game({ saved: j, previewCount: 5 }), M2 = B.matchOf(g2);
    assert(Library.playable(j) && Recipe.valid(j));
    assert(M2.me.S.charges === 5 && M2.me.S.ceil === 1 && B.suddenOf(g2) === 60000 && M2.ai.lvl.pace === M.ai.lvl.pace && B.setText(g2) === B.setText(g));
    M2.round.phase = 'end';
    B.newRound(M2);
    assert(M2.me.S.charges === 2 && M2.ai.S.charges === 2 && M2.me.S.ceil === 0, 'a new round: the set\'s charges again');
  });

  test('battle: the AI on every rule set: a player at 3 s a piece (Steady\'s judgement) neither always wins nor always loses against Steady; Swift beats Easy', () => {
    const out = [];
    for (const s of B.SETS) {
      let won = 0, swift = 0, t = 0;
      const N = 10;
      for (let i = 0; i < N; i++) {
        const r = B.simulate({ levels: ['steady', 'steady'], seed: 500 + i, set: s.id, human: { pace: 3 } });
        if (r.winner === 0) won++;
        t += r.time;
        if (B.simulate({ levels: ['swift', 'easy'], seed: 900 + i, set: s.id }).winner === 0) swift++;
      }
      out.push(s.id + ' ' + won + '/' + N + ' (' + Math.round(t / N) + ' s)');
      assert(won >= 1 && won <= N - 1, s.id + ': the 3 s player won ' + won + ' of ' + N);
      assert(swift >= N - 3, s.id + ': Swift beat Easy ' + swift + ' of ' + N);
    }
    console.log('       the 3 s player against Steady, by set: ' + out.join(', '));
  });
};
