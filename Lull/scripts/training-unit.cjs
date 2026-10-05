// Training in Node (js/training.js): a Training game is Classic's rules with the coach's record kept beside them; a
// poor set taken back puts everything as it was when the piece appeared (the board, score, lines and level, Next, Hold,
// the bag and the random stream, so the same pieces come after); Strictness as measured (a new hole is taken back even
// by Gentle, a near equal of the best is kept even by Strict, and the ranks between fall where the numbers say);
// Hint after (the best spot shown once a piece has been set poorly so many times in a row, gone on a good set or a new
// piece); the explanation (the holes covered, the rows the best clears, the well, the height, two words at most); the
// counters; the save; and nothing of it counted (R.uncounted, never a Custom mode).
// Run by test.cjs: require('./training-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function trainingUnit({ L, test }) {
  const { Game, Pieces, Bot, Training, Recipe, Library } = L;
  const TR = (k) => ({ mode: 'training', classic: Object.assign({}, k || {}) });
  /** A Training game with a picture as its stack ('#' filled, rows top first, the last one the floor); its turn taken again. */
  const board = (pic, k, seed) => {
    const g = new Game({ w: 10, h: 20, seed: seed == null ? 3 : seed, recipe: TR(k) });
    pic.slice().reverse().forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') g.board.set(x, y, 5); }));
    Training.newTurn(Training.of(g), Training.snap(g));
    return g;
  };
  /** Sets the piece in play (or, hold, the one Hold brings) at a ranked spot, as a hand would end up: its lock's result. */
  const setAt = (g, e) => {
    if (e.hold) g.holdPiece();
    Object.assign(g.piece, { rot: e.r, x: e.x, y: e.y });
    return g.lock();
  };
  /** The game as the coach and a player see it, without the time played. */
  const state = (g) => { const j = g.toJSON(); delete j.s.playMs; delete j.s.startedAt; delete j.x.training; if (j.x.classic) delete j.x.classic.ms; return JSON.stringify(j); };
  const holes = (g) => Bot.explain(Bot.rowsOf(g.board), g.w, g.h, {}).parts.holes.n;

  test('training: a mode of its own on Classic\'s rules: its label, gravity and spawn, nothing counted, never a Custom mode', () => {
    const r = Recipe.normalize(TR({ level: 4, next: 2, hold: false }));
    assert.strictEqual(r.mode, 'training');
    assert.deepStrictEqual(r.classic, Object.assign({}, L.Classic.DEFAULTS, { level: 4, next: 2, hold: false }));
    assert.strictEqual(Recipe.label(r), 'Training A · Level 4');
    const R = Recipe.rules(r, 10);
    assert(R.classic && R.uncounted && !R.feats && !R.undo, 'Classic\'s rules, uncounted');
    assert(Recipe.rules(Recipe.normalize({ mode: 'classic' }), 10).uncounted !== true, 'Classic still counts');
    assert.strictEqual(Library.modeOf(r), 'training', 'kept as its own mode, never as Classic\'s game');
    const g = new Game({ w: 10, h: 20, seed: 9, recipe: r });
    assert(g.ceiling && L.Classic.of(g) && Training.of(g), 'Classic\'s engine and the coach');
    assert.strictEqual(g.previewCount, 2);
    assert(g.mods.noHold);
    assert(Training.of(g).turn && Training.of(g).turn.piece.entry.id === g.piece.type.id, 'the first piece started a turn');
    assert.strictEqual(Training.PART.custom, false, 'not offered in the Custom window');
  });

  test('training: the coach\'s settings, each its default when unset or out of range', () => {
    assert.deepStrictEqual(Training.settingsOf({}), { strict: 'standard', hint: 3, explain: false });
    assert.deepStrictEqual(Training.settingsOf({ trainStrict: 'strict', trainHint: 1, trainExplain: true }), { strict: 'strict', hint: 1, explain: true });
    assert.deepStrictEqual(Training.settingsOf({ trainStrict: 'harsh', trainHint: 9, trainExplain: 'yes' }), { strict: 'standard', hint: 3, explain: false });
    assert.deepStrictEqual(Training.STRICT, { gentle: 12, standard: 7, strict: 3 });
  });

  test('training: a set taken back is the game exactly as the piece appeared (board, score, lines, level, Next, Hold, bag, stream), and the same pieces come after', () => {
    for (const k of [{}, { rand: 'retro' }, { level: 9, next: 5 }]) {
      const g = new Game({ w: 10, h: 20, seed: 21, recipe: TR(k) });
      const ref = new Game({ w: 10, h: 20, seed: 21, recipe: TR(k) });
      // A few pieces set the bot's way on both (a Hold used, lines cleared), so there is a score, lines and a held piece.
      for (let n = 0; n < 26; n++) {
        for (const h of [g, ref]) { const e = Training.rank(h, Training.of(h).turn)[0]; setAt(h, e); }
      }
      const T = Training.of(g);
      assert(g.s.score > 0 && L.Classic.of(g).lines > 0 && g.hold, 'a game with a score, lines and Hold: ' + JSON.stringify(k));
      const before = state(g);
      // A poor set (the worst there is, through Hold when that is the worst): judged, and taken back.
      const C = L.Classic.of(g), lines0 = C.lines, ranked = Training.rank(g, T.turn), worst = ranked[ranked.length - 1];
      let res = null;
      const off = g.on('lock', (r) => { res = Training.place(g, r, { trainStrict: 'gentle' }, ranked); });
      setAt(g, worst);
      off();
      assert.strictEqual(res.act, 'rewind', 'the worst goes back');
      assert(T.back, 'on its way back: the next piece did not start a turn');
      assert.notStrictEqual(state(g), before, 'the set changed the game');
      Training.rewind(g);
      assert.strictEqual(state(g), before, 'back exactly: ' + JSON.stringify(k));
      assert.strictEqual(L.Classic.of(g).lines, lines0);
      assert.strictEqual(L.Classic.of(g), C, 'Classic\'s record is the same object (the controller reads it)');
      assert(!g.over && !T.back);
      // The same pieces from here on as the game that never had the poor set: the queue, the bag and the stream.
      const deal = (h) => { const out = []; for (let i = 0; i < 30; i++) { h.queue.shift(); h.fillQueue(); out.push(h.queue[h.queue.length - 1].id); } return out.join(''); };
      assert.strictEqual(state(g), state(ref), 'the same game as the one that never set it');
      assert.strictEqual(deal(g), deal(ref), 'the same pieces after: ' + JSON.stringify(k));
    }
  });

  test('training: a set that tops out is taken back too, and the game goes on', () => {
    const rows = [];
    for (let y = 0; y < 17; y++) rows.push(y % 2 ? '#########.' : '.#########');
    const g = board(['..........', '..........', '..........'].concat(rows), {}, 5);
    let res = null, tops = 0;
    g.on('lock', (r) => { res = Training.place(g, r, {}); });
    g.on('topout', () => tops++);
    const before = state(g);
    // Straight down from where it appears: the next piece has nowhere to appear.
    const e = Training.rank(g, Training.of(g).turn).find((x) => !x.hold && Training.cellsOf(x).some(([cx, cy]) => cy >= 18 && cx >= 4 && cx <= 5));
    assert(e, 'a set that reaches the top');
    setAt(g, e);
    assert(g.over && tops === 1, 'the next piece had nowhere to appear');
    assert.strictEqual(res.act, 'rewind');
    Training.rewind(g);
    assert(!g.over && g.piece && state(g) === before, 'back, and the game goes on');
  });

  // A board from the middle of a game (the bot's own play, seeded), with every placement of its piece ranked.
  const midGame = () => {
    const g = new Game({ w: 10, h: 20, seed: 77, recipe: TR({}) });
    for (let n = 0; n < 23; n++) setAt(g, Training.rank(g, Training.of(g).turn)[0]);
    return g;
  };

  test('training: Strictness by the measured numbers: a new hole goes back even on Gentle, a near equal stays even on Strict, and the ranks between', () => {
    const g = midGame(), T = Training.of(g), ranked = Training.rank(g, T.turn), best = ranked[0], snap = T.turn;
    const h0 = Bot.explain(Bot.rowsOf({ w: 10, h: 20, cells: snap.cells }), 10, 20, {}).parts.holes.n;
    const judge = (e, strict) => Training.assess(ranked, e.rows, { twist: e.twist === 2, mini: e.twist === 1 }, strict);
    // The best itself, everywhere.
    for (const s of Training.STRICT_IDS) assert(judge(best, s).good && judge(best, s).index === 0, 'the best is good: ' + s);
    // Every placement: good exactly when it loses less than the limit.
    for (const e of ranked) for (const s of Training.STRICT_IDS) {
      const v = judge(e, s);
      assert.strictEqual(v.good, v.loss < Training.STRICT[s], s + ' at loss ' + v.loss);
    }
    // A placement that leaves a hole the best does not: back on all three.
    const holed = ranked.filter((e) => Bot.explain(e.rows, 10, 20, {}).parts.holes.n > h0 && !e.lines);
    assert(holed.length > 3);
    for (const e of holed) assert(!judge(e, 'gentle').good, 'a new hole is taken back on Gentle (loss ' + (best.value - e.value).toFixed(1) + ')');
    // A near equal (within the Strict limit) is kept on Strict; the ones between, as the limits fall.
    const near = ranked.filter((e) => e !== best && best.value - e.value < 3);
    for (const e of near) assert(judge(e, 'strict').good);
    const mid = ranked.find((e) => best.value - e.value >= 3 && best.value - e.value < 7);
    if (mid) assert(!judge(mid, 'strict').good && judge(mid, 'standard').good && judge(mid, 'gentle').good);
    const far = ranked.find((e) => best.value - e.value >= 7 && best.value - e.value < 12);
    if (far) assert(!judge(far, 'strict').good && !judge(far, 'standard').good && judge(far, 'gentle').good);
    assert(mid || far, 'placements between the limits on this board');
  });

  test('training: Strictness on built boards: a hole is a blunder, an I flat on a flat floor is a near equal, a tower in the middle is needless height', () => {
    // A floor two rows high with a gap in each.
    const g = board(['##.#######', '#####.####'], {});
    const T = Training.of(g), ranked = Training.rank(g, T.turn);
    const h0 = holes(g);
    const holed = ranked.find((e) => !e.hold && Bot.explain(e.rows, 10, 20, {}).parts.holes.n > h0 + 0 && !e.lines);
    assert(holed, 'a placement that covers a gap');
    for (const s of Training.STRICT_IDS) assert(!Training.assess(ranked, holed.rows, {}, s).good, 'covering a gap goes back: ' + s);
    // On an empty floor the I lies flat: the best, and every other flat spot along the floor is close to it.
    const e2 = new Game({ w: 10, h: 20, seed: 1, recipe: TR({ next: 0, hold: false }) });
    e2.piece = null; e2.spawn({ id: 'I' }); Training.newTurn(Training.of(e2), Training.snap(e2));
    const rk = Training.rank(e2, Training.of(e2).turn), flat = rk.filter((e) => e.r % 2 === 0);
    assert(flat.length >= 6);
    for (const e of flat) assert(Training.assess(rk, e.rows, {}, 'gentle').good, 'an I flat on the floor is fine on Gentle');
    // Stood on end in the middle of an empty floor: needless height, back on Standard and Strict.
    const tall = rk.find((e) => e.r % 2 === 1 && e.x + Pieces.get('I').rotBounds[e.r].minX === 4);
    assert(tall);
    assert(!Training.assess(rk, tall.rows, {}, 'standard').good && !Training.assess(rk, tall.rows, {}, 'strict').good);
  });

  test('training: Hint after: the best spot only once the same piece has gone poorly that many times in a row; gone on a good set or a new piece', () => {
    for (const n of [1, 3, 5]) {
      const g = board(['....##....', '##.###.###', '#########.'], {});
      const T = Training.of(g), ranked = Training.rank(g, T.turn), o = { trainHint: n, trainStrict: 'standard' };
      const poor = ranked.slice().reverse().find((e) => !e.hold && ranked[0].value - e.value > 20);
      let res = null;
      g.on('lock', (r) => { res = Training.place(g, r, o, ranked); });
      for (let k = 1; k <= n; k++) {
        assert.strictEqual(Training.hintOf(T, o), null, 'no hint before ' + n + ' tries (after ' + (k - 1) + ')');
        setAt(g, poor);
        assert.strictEqual(res.act, 'rewind');
        Training.rewind(g);
        assert.strictEqual(T.tries, k);
      }
      const hint = Training.hintOf(T, o);
      assert(hint, 'the hint after ' + n);
      assert.deepStrictEqual([hint.id, hint.r, hint.x, hint.y, hint.hold], [ranked[0].id, ranked[0].r, ranked[0].x, ranked[0].y, !!ranked[0].hold]);
      assert.deepStrictEqual(hint.cells, Training.cellsOf(ranked[0]));
      // A lower Hint after shows it at once; a higher one hides it again.
      assert(Training.hintOf(T, { trainHint: 1 }) && (n === 5 || !Training.hintOf(T, { trainHint: 5 })));
      // Placed well: the hint and the tries are gone, the piece counted (not at the first try).
      setAt(g, ranked[0]);
      assert.strictEqual(res.act, 'keep');
      assert.strictEqual(Training.hintOf(T, o), null);
      assert.deepStrictEqual([T.tries, T.placed, T.first, T.rewinds], [0, 1, 0, n]);
      assert(T.turn.piece && T.turn.piece.entry.id === g.piece.type.id, 'a new turn for the next piece');
    }
    // A new piece (a new turn) also clears what a poor try left.
    const g = board(['....##....', '##.###.###', '#########.'], {}), T = Training.of(g);
    T.tries = 4; T.best = { id: 'T', r: 0, x: 0, y: 0, hold: false, cells: [] }; T.why = { words: [] };
    Training.newTurn(T, Training.snap(g));
    assert.deepStrictEqual([T.tries, T.best, T.why], [0, null, null]);
    // Hold brings in another piece: the same turn (its tries stay).
    T.tries = 2;
    const t0 = T.turn;
    g.holdPiece();
    assert(T.turn === t0 && T.tries === 2, 'a piece Hold brings in is the same turn');
  });

  test('training: the counters: placed, first try (and its share), rewinds; kept with the game and back from the save', () => {
    const g = board(['..........', '##.###.###', '#########.'], {});
    const T = Training.of(g);
    let ranked = Training.rank(g, T.turn);
    g.on('lock', (r) => Training.place(g, r, {}, ranked));
    setAt(g, ranked[0]);
    ranked = Training.rank(g, T.turn);
    const poor = ranked.slice().reverse().find((e) => !e.hold && ranked[0].value - e.value > 20);
    setAt(g, poor); Training.rewind(g);
    setAt(g, ranked[0]);
    assert.deepStrictEqual([T.placed, T.first, T.rewinds, T.tries], [2, 1, 1, 0]);
    assert.strictEqual(Training.firstPct(T), '50%');
    assert.strictEqual(Training.firstPct(Training.fresh()), '–');
    // Saved and resumed (Continue): the record and the turn come back; the game is one a mode keeps.
    T.tries = 2; T.best = { id: 'O', r: 0, x: 4, y: 0, hold: false, cells: [[4, 0], [5, 0], [4, 1], [5, 1]] };
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    assert(Library.playable(json), 'a game that can be kept and resumed');
    const h = new Game({ saved: json });
    const U = Training.of(h);
    assert.deepStrictEqual([U.placed, U.first, U.rewinds, U.tries, U.best.id], [2, 1, 1, 2, 'O']);
    assert.strictEqual(JSON.stringify(U.turn), JSON.stringify(T.turn));
    assert(!('back' in json.x.training), 'the way back is never saved');
    json.x.training.placed = -1;
    assert(!Library.playable(json), 'a broken record is not resumed');
    assert.deepStrictEqual(Recipe.summary(h).training, { placed: 2, first: 1, rewinds: 1 });
  });

  test('training: why the best is better: the holes yours covered, the rows the best clears, the well it keeps, the height; two words at most', () => {
    // Holes: an O set over a one-wide gap covers it.
    {
      const g = board(['##.#######', '##.#######'], { next: 0, hold: false });
      g.piece = null; g.spawn({ id: 'O' }); Training.newTurn(Training.of(g), Training.snap(g));
      const T = Training.of(g), ranked = Training.rank(g, T.turn);
      const over = ranked.find((e) => e.x + Pieces.get('O').rotBounds[e.r].minX === 1);
      let res = null;
      g.on('lock', (r) => { res = Training.place(g, r, { trainExplain: true }, ranked); });
      setAt(g, over);
      assert.strictEqual(res.act, 'rewind');
      const why = T.why;
      assert.deepStrictEqual(why.holes.map((c) => c.join(',')).sort(), ['2,0', '2,1'], 'the two cells of the gap it covered');
      assert.strictEqual(why.words[0], '2 holes');
      assert(why.words.length <= 2);
      assert.deepStrictEqual(why.mine.map((c) => c.join(',')).sort(), ['1,2', '1,3', '2,2', '2,3']);
      assert.deepStrictEqual(Training.whyOf(T, { trainExplain: true }), why);
      assert.strictEqual(Training.whyOf(T, { trainExplain: false }), null, 'Explanation off: nothing drawn');
    }
    // Lines: an I that would clear four rows, set flat on top instead.
    {
      const g = board(['#########.', '#########.', '#########.', '#########.'], { next: 0, hold: false });
      g.piece = null; g.spawn({ id: 'I' }); Training.newTurn(Training.of(g), Training.snap(g));
      const T = Training.of(g), ranked = Training.rank(g, T.turn);
      assert.strictEqual(ranked[0].lines, 4);
      const flat = ranked.find((e) => e.r % 2 === 0 && !e.lines);
      const why = Training.reasons(g, T.turn, flat, ranked[0], Training.cellsOf(flat));
      assert(why.lines && why.lines.n === 4 && why.lines.rows.join() === '0,1,2,3', JSON.stringify(why.lines));
      assert(why.words.includes('Clears 4'));
    }
    // The well: a stack with its well at the right, five deep.
    {
      const g = board(['#########.', '#########.', '#########.', '#########.', '#####.###.'], { next: 0, hold: false });
      g.piece = null; g.spawn({ id: 'T' }); Training.newTurn(Training.of(g), Training.snap(g));
      const T = Training.of(g), ranked = Training.rank(g, T.turn), best = ranked[0];
      // A T hung into the well (it covers the well's floor, and the best stays out of it).
      const inWell = ranked.find((e) => Training.cellsOf(e).some(([x]) => x === 9));
      assert(inWell && !Training.cellsOf(best).some(([x]) => x === 9));
      const why = Training.reasons(g, T.turn, inWell, best, Training.cellsOf(inWell));
      assert.deepStrictEqual(why.well, { x: 9, floor: 0 });
      assert(why.words.includes('Keep well') && why.words.length === 2, why.words.join());
      const wl = Training.wellOf(Bot.rowsOf(g.board), 10, 20);
      assert.deepStrictEqual([wl.x, wl.depth], [9, 5]);
    }
    // Height: a tower stood up in the middle of an empty floor.
    {
      const g = new Game({ w: 10, h: 20, seed: 1, recipe: TR({ next: 0, hold: false }) });
      g.piece = null; g.spawn({ id: 'I' }); Training.newTurn(Training.of(g), Training.snap(g));
      const T = Training.of(g), ranked = Training.rank(g, T.turn);
      const tall = ranked.find((e) => e.r % 2 === 1 && e.x + Pieces.get('I').rotBounds[e.r].minX === 4);
      const why = Training.reasons(g, T.turn, tall, ranked[0], Training.cellsOf(tall));
      assert.deepStrictEqual(why.height, { mine: 4, best: 1 });
      assert(why.words.includes('+3 high'));
      assert.strictEqual(why.holes.length, 0);
    }
  });
};
