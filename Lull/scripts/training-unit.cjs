// Training in Node (js/training.js): a Training game is Classic's rules with the coach's record kept beside them; a
// poor set taken back puts everything as it was when the piece appeared (the board, score, lines and level, Next, Hold,
// the bag and the random stream, so the same pieces come after); Strictness as measured (a sealed hole is taken back
// on Standard, a near equal of the best is kept even by Strict, and the ranks between fall where the numbers say);
// Hint after (the best spot shown once a piece has been set poorly so many times in a row, gone on a good set or a new
// piece); the explanation (the holes covered, the rows the best clears, the well, the height, two words at most); the
// counters; the save; and nothing of it counted (R.uncounted, never a Custom mode). Then the coach's promises, over
// seeded games of every setup (levels, both locks, Next 0 to 5, Hold or not), played through the engine by a hand at
// the coach's own pace: the spot it shows is always kept when a piece is set there (a Twist missed, through Hold, after
// rewinds), the best is always kept and a hand gets to it, judging and the hint go by the same ranking (thought in
// slices or at once); it looks ahead exactly as far as the Next shows; Hold judged as a move (a poor Hold goes back,
// then the spot shown is kept; Hold missed is said); the deadlock first found (a Twist's cells set plainly, a spot
// out of a hand's reach at speed) never again; and its long game against a one-piece look.
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
  /** A ranked placement as the player's set it would be (assess's placed). */
  const placedOf = (e) => ({ id: e.id, cells: Training.cellsOf(e), twist: e.twist, hold: !!e.hold });
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
    assert.deepStrictEqual(Training.STRICT, { gentle: 15, standard: 9, strict: 4 });
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

  /** Empty cells no piece can get to from above (sealed under the stack). */
  const sealed = (rows) => {
    const seen = new Set(), st = [];
    for (let x = 0; x < 10; x++) if (!((rows[19] >>> x) & 1)) { st.push([x, 19]); seen.add(x + ',19'); }
    while (st.length) {
      const [x, y] = st.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
        if (nx < 0 || nx > 9 || ny < 0 || ny > 19 || seen.has(key) || ((rows[ny] >>> nx) & 1)) continue;
        seen.add(key); st.push([nx, ny]);
      }
    }
    let n = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) if (!((rows[y] >>> x) & 1) && !seen.has(x + ',' + y)) n++;
    return n;
  };

  test('training: Strictness by the measured numbers: good exactly under the limit, a sealed hole goes back on Standard, a near equal stays even on Strict, and the ranks between', () => {
    let sealedN = 0, sealedBack = 0, mid = 0, far = 0;
    for (const seed of [77, 79, 81]) {
      const g = new Game({ w: 10, h: 20, seed, recipe: TR({}) });
      for (let n = 0; n < 15; n++) setAt(g, Training.rank(g, Training.of(g).turn).best);
      const T = Training.of(g), ranked = Training.rank(g, T.turn, true), best = ranked.best;
      const s0 = sealed(Bot.rowsOf({ w: 10, h: 20, cells: T.turn.cells }));
      const judge = (e, strict) => Training.assess(ranked, placedOf(e), strict);
      // The best itself, everywhere.
      for (const s of Training.STRICT_IDS) assert(judge(best, s).good && judge(best, s).loss === 0, 'the best is good: ' + s);
      for (const e of ranked) {
        // Every placement: good exactly when it loses less than the limit (or is the best's own cells).
        for (const s of Training.STRICT_IDS) { const v = judge(e, s); assert.strictEqual(v.good, v.loss < Training.STRICT[s], s + ' at loss ' + v.loss); }
        const loss = best.value - e.value;
        if (!e.lines && sealed(e.rows) > s0 && sealed(best.rows) <= s0) { sealedN++; if (!judge(e, 'standard').good) sealedBack++; }
        // A near equal (within the Strict limit) is kept on Strict; the ones between, as the limits fall.
        if (e !== best && loss < Training.STRICT.strict) assert(judge(e, 'strict').good);
        if (loss >= Training.STRICT.strict && loss < Training.STRICT.standard) { mid++; assert(!judge(e, 'strict').good && judge(e, 'standard').good && judge(e, 'gentle').good); }
        if (loss >= Training.STRICT.standard && loss < Training.STRICT.gentle) { far++; assert(!judge(e, 'strict').good && !judge(e, 'standard').good && judge(e, 'gentle').good); }
      }
    }
    assert(sealedN > 20 && sealedBack / sealedN >= 0.85, 'sealed holes taken back on Standard: ' + sealedBack + ' of ' + sealedN);
    assert(mid && far, 'placements between the limits: ' + mid + ', ' + far);
  });

  test('training: Strictness on built boards: a sealed hole is a blunder, an I flat on a flat floor is a near equal, a tower in the middle is needless height', () => {
    // A gap three deep: an O over it seals it.
    const g = board(['##.#######', '##.#######', '##.#######'], { hold: false });
    g.piece = null; g.spawn({ id: 'O' }); Training.newTurn(Training.of(g), Training.snap(g));
    const T = Training.of(g), ranked = Training.rank(g, T.turn, true);
    const holed = ranked.filter((e) => Training.cellsOf(e).some(([x]) => x === 2));
    assert(holed.length >= 2, 'placements that cover the gap');
    for (const e of holed) for (const s of Training.STRICT_IDS) assert(!Training.assess(ranked, placedOf(e), s).good, 'covering a gap goes back: ' + s);
    // On an empty floor the I lies flat: the best, and every other flat spot along the floor is close to it.
    const e2 = new Game({ w: 10, h: 20, seed: 1, recipe: TR({ next: 0, hold: false }) });
    e2.piece = null; e2.spawn({ id: 'I' }); Training.newTurn(Training.of(e2), Training.snap(e2));
    const rk = Training.rank(e2, Training.of(e2).turn, true), flat = rk.filter((e) => e.r % 2 === 0);
    assert(flat.length >= 6);
    for (const e of flat) assert(Training.assess(rk, placedOf(e), 'gentle').good, 'an I flat on the floor is fine on Gentle');
    // Stood on end in the middle of an empty floor: needless height, back on Standard and Strict.
    const tall = rk.find((e) => e.r % 2 === 1 && e.x + Pieces.get('I').rotBounds[e.r].minX === 4);
    assert(tall);
    assert(!Training.assess(rk, placedOf(tall), 'standard').good && !Training.assess(rk, placedOf(tall), 'strict').good);
  });

  test('training: Hint after: the best spot only once the same piece has gone poorly that many times in a row; gone on a good set or a new piece', () => {
    for (const n of [1, 3, 5]) {
      const g = board(['....##....', '##.###.###', '#########.'], {});
      const T = Training.of(g), ranked = Training.rank(g, T.turn, true), o = { trainHint: n, trainStrict: 'standard' };
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
    ranked = Training.rank(g, T.turn, true);
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

  test('training: why the best is better, by what and how much: the holes yours covered, the rows the best clears, the well, the height, the next piece, the top; two at most, the heaviest first', () => {
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
      assert.strictEqual(why.words[0], 'Covers 2 holes');
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
      assert(why.words.includes('Best clears 4 rows'), why.words.join());
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
      assert(why.words.includes('Blocks the well') && why.words.length === 2, why.words.join());
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
      assert(why.words.includes('+3 rows high'), why.words.join());
      assert.strictEqual(why.holes.length, 0);
    }
    // Nothing on the board between them, and the difference in the pieces ahead: the next piece named.
    {
      const g = board(['##...#####'], { next: 3, hold: false });
      const T = Training.of(g), next = T.turn.queue[0].id, e = Training.rank(g, T.turn).best;
      const mine = Object.assign({}, e, { own: e.own - 0.5, value: e.value - 10, x: e.x + 0 }), best = Object.assign({}, e);
      const why = Training.reasons(g, T.turn, mine, best, Training.cellsOf(mine));
      assert.deepStrictEqual(why.words, ['No spot for next ' + next]);
    }
    // Only a rougher top (no Next): the bumps it adds, counted (an O in the open against one at the wall).
    {
      const g = board(['..........'], { next: 0, hold: false }), T = Training.of(g), ex = (rows) => Bot.explain(rows, 10, 20, {}).parts;
      const at = (x) => { const rows = new Int32Array(20); rows[0] = rows[1] = 3 << x; return { id: 'O', r: 0, x: x - Pieces.get('O').rotBounds[0].minX, y: -Pieces.get('O').rotBounds[0].minY, rows, own: -1, value: -1, lines: 0 }; };
      const best = at(0), mine = at(4);
      const why = Training.reasons(g, T.turn, mine, best, Training.cellsOf(mine));
      assert(ex(mine.rows).bumps.n > ex(best.rows).bumps.n);
      assert.deepStrictEqual(why.words, ['Top +' + (ex(mine.rows).bumps.n - ex(best.rows).bumps.n) + ' bumps']);
    }
    // The best through Hold, not used: said first, with the piece.
    {
      const g = board(['..........'], { next: 3 });
      const T = Training.of(g), e = Training.rank(g, T.turn).best, best = Object.assign({}, e, { hold: true, id: 'I' });
      const why = Training.reasons(g, T.turn, Object.assign({}, e, { value: e.value - 9 }), best, Training.cellsOf(e), false);
      assert.strictEqual(why.words[0], 'Hold I fits better');
    }
  });

  // ---- the coach's promises ------------------------------------------------------------------------------------------

  const ck = (cells) => cells.map((c) => c.join(',')).sort().join(';');
  /**
   * A hand at the coach's own pace (Training.HAND) sets the piece in play on `cells` through the engine: Hold first if
   * asked, the first key after look, then a key every key ms, each along the search's way from where the piece is
   * then (the hand's pace, else any); gravity and the lock in 1 ms steps between (Classic.fall). The lock's result.
   */
  const drive = (g, cells, hold) => {
    const k = g.recipe.classic, retro = k.lock === 'retro', H = Training.HAND, t = { acc: 0, lockT: 0, resets: 0 };
    const iv = () => L.Classic.gravity(L.Classic.levelOf(k, L.Classic.of(g).lines), retro);
    let res = null;
    const off = g.on('lock', (r) => { res = r; });
    if (hold) g.holdPiece();
    const want = ck(cells), rate = () => H.key / (iv() * 1000);
    const plan = () => {
      const p = g.piece, rows = Bot.rowsOf(g.board), o = { r180: true, ceiling: g.ceiling, twist: true };
      for (const opts of [Object.assign({ rate: rate(), start: t.acc / iv(), sticky: retro && rate() >= 0.5, turn: 1 }, o), o]) {
        const rch = Bot.reach(rows, g.w, g.h, p.type, { rot: p.rot, x: p.x, y: p.y }, opts);
        const at = (q) => ck(p.type.rots[q.r].map(([cx, cy]) => [q.x + cx, q.y + cy])) === want;
        const pl = rch.places.find((q) => !q.spun && at(q)) || rch.places.find(at);
        if (pl) return rch.route(pl);
      }
      return null;
    };
    let clock = 0, next = H.look / 1000;
    while (!res && clock < 60) {
      clock += 0.001;
      if (L.Classic.fall(t, g, 0.001, iv(), retro) === 'lock' || res) break;
      if (clock + 1e-9 < next) continue;
      next += H.key / 1000;
      const p = g.piece, route = p && plan();
      if (!route) break;
      const m = route[0];
      if (m === 'drop') { g.drop(); break; }
      if (m === 'L') g.move(-1); else if (m === 'R') g.move(1); else if (m === 'D') { if (g.fitsAt(p, p.rot, p.x, p.y - 1)) L.Classic.softDrop(t, g, false, retro); }
      else if (m === 'CW') g.rotate(1); else if (m === 'CCW') g.rotate(-1); else g.rotate(2);
      if (m !== 'D') L.Classic.rested(t, g, retro);
    }
    off();
    return res;
  };
  /** Seeded setups: every level band, both locks, Next 0 to 5, Hold on and off. */
  const SETUPS = [];
  for (const level of [1, 9, 15]) for (const lock of ['modern', 'retro']) for (const [next, hold] of [[0, true], [1, false], [3, true], [5, false], [5, true]]) SETUPS.push({ level, lock, next, hold, levelLock: true });

  test('training: the spot shown is always kept when a piece is set there by hand (after a poor try, through Hold, both locks, every speed, Next 0 to 5)', () => {
    let shown = 0;
    for (const k of SETUPS) {
      const g = new Game({ w: 10, h: 20, seed: 31 + k.level + k.next, recipe: TR(k) }), T = Training.of(g), o = { trainHint: 1, trainStrict: 'strict' };
      let res = null;
      g.on('lock', (r) => { res = Training.place(g, r, o); });
      for (let n = 0; n < 6 && !g.over; n++) {
        const ranked = Training.rankingOf(g), worst = ranked.slice().reverse().find((e) => !e.hold);
        // A poor try first (dropped where it would go worst), taken back; then the spot shown, by hand.
        if (Training.bestOf(ranked).cells && worst !== Training.bestOf(ranked)) {
          setAt(g, worst);
          if (res.act === 'rewind') {
            Training.rewind(g);
            const hint = Training.hintOf(T, o);
            assert(hint, 'a hint after one try');
            const r = drive(g, hint.cells, hint.hold);
            assert(r && ck(r.cells) === ck(hint.cells), 'a hand gets to the spot shown: ' + JSON.stringify(k) + ' ' + n);
            assert.strictEqual(res.act, 'keep', 'the spot shown is kept: ' + JSON.stringify(k) + ' ' + n);
            shown++;
            continue;
          }
        }
        // (A kept try: the next piece.)
      }
    }
    assert(shown >= SETUPS.length * 3, 'hints followed: ' + shown);
  });

  test('training: the best is always kept, a hand at the level\'s pace gets to it, and there is always a placement that is kept', () => {
    for (const k of SETUPS) {
      const g = new Game({ w: 10, h: 20, seed: 7 + k.level, recipe: TR(k) }), T = Training.of(g);
      for (let n = 0; n < 5 && !g.over; n++) {
        const ranked = Training.rankingOf(g), best = Training.bestOf(ranked);
        assert(best && best.hand && best.deep, 'the best is one a hand gets to');
        for (const s of Training.STRICT_IDS) {
          // Its cells set any way at all (a Twist missed: no turn last) are kept.
          assert(Training.assess(ranked, { id: best.id, cells: best.cells, twist: 0, hold: !!best.hold }, s).good);
          assert(Training.assess(ranked, { id: best.id, cells: best.cells, twist: best.twist, hold: !!best.hold }, s).good);
        }
        let res = null;
        const off = g.on('lock', (r) => { res = Training.place(g, r, { trainStrict: 'strict' }); });
        const r = drive(g, best.cells, best.hold);
        off();
        assert(r && ck(r.cells) === ck(best.cells) && res.act === 'keep', 'set by hand and kept: ' + JSON.stringify(k) + ' ' + n);
        assert(!T.back);
      }
    }
  });

  test('training: the deadlock found: a Twist\'s cells set without the turn were taken back, and at speed the spot shown was out of a hand\'s reach; neither now', () => {
    // A T whose best is a Twist (or a Mini) with the same cells reachable plainly: set plainly, it is kept.
    let twists = 0;
    for (let seed = 1; seed <= 40 && twists < 3; seed++) {
      const g = new Game({ w: 10, h: 20, seed, recipe: TR({ level: 5 }) });
      for (let n = 0; n < 30 && !g.over && twists < 3; n++) {
        const ranked = Training.rankingOf(g), best = Training.bestOf(ranked);
        const plain = best.twist && ranked.find((e) => e !== best && e.twist === 0 && e.id === best.id && ck(e.cells) === ck(best.cells));
        if (plain) {
          twists++;
          let res = null;
          const off = g.on('lock', (r) => { res = Training.place(g, r, { trainStrict: 'strict' }); });
          setAt(g, best);
          off();
          assert.strictEqual(res.act, 'keep', 'the Twist\'s cells set plainly are kept (once taken back by the Twist\'s worth)');
          continue;
        }
        setAt(g, best);
      }
    }
    assert(twists >= 1, 'a Twist found');
    // Level 15, Retro lock and modern: every spot shown is one a hand gets to from where the piece appears.
    for (const lock of ['modern', 'retro']) {
      const g = new Game({ w: 10, h: 20, seed: 43, recipe: TR({ level: 15, lock, next: 0 }) });
      for (let n = 0; n < 20 && !g.over; n++) {
        const T = Training.of(g), v = Training.viewOf(g, T.turn), ranked = Training.rankingOf(g), best = Training.bestOf(ranked);
        const type = Pieces.get(best.id), start = best.hold ? v.spawn(best.id) : v.cur;
        const rch = Bot.reach(v.rows, 10, 20, type, start, { r180: true, ceiling: true, twist: true, rate: v.rate, start: v.start, sticky: v.sticky, turn: 1 });
        assert(rch.places.some((q) => ck(type.rots[q.r].map(([cx, cy]) => [q.x + cx, q.y + cy])) === ck(best.cells)), 'in a hand\'s reach at level 15 (' + lock + ')');
        // Some placements are out of reach there: the search knows the difference.
        setAt(g, best);
      }
    }
  });

  test('training: judging and the hint go by one ranking: thought in slices or at once the same, kept with the turn for every try', () => {
    const g = new Game({ w: 10, h: 20, seed: 12, recipe: TR({ next: 3 }) });
    for (let n = 0; n < 8; n++) setAt(g, Training.rank(g, Training.of(g).turn).best);
    const T = Training.of(g), a = Training.rank(g, T.turn), it = Training.think(g, T.turn);
    let r = it.next(), slices = 0;
    while (!r.done) { r = it.next(); slices++; }
    const b = r.value, sig = (x) => x.filter((e) => e.deep).map((e) => e.id + e.r + ':' + e.x + ',' + e.y + (e.hold ? 'h' : '') + '=' + e.value.toFixed(9)).join(' ');
    assert(slices > 20, 'thought in slices');
    assert.strictEqual(sig(a), sig(b));
    assert.strictEqual(ck(a.best.cells), ck(b.best.cells));
    // Kept with the turn: a try, a rewind, another try are judged by the very same list; the hint is its best.
    const o = { trainHint: 1 }, kept = Training.rankingOf(g, b);
    assert.strictEqual(Training.rankingOf(g), kept);
    let res = null;
    g.on('lock', (rr) => { res = Training.place(g, rr, o); });
    const worst = kept.slice().reverse().find((e) => !e.hold);
    setAt(g, worst); assert.strictEqual(res.act, 'rewind'); Training.rewind(g);
    assert.strictEqual(Training.rankingOf(g), kept, 'the same list after the rewind');
    assert.strictEqual(ck(Training.hintOf(T, o).cells), ck(kept.best.cells));
    // A set judged by a placement not looked at yet: looked at in full first, the same way as the best.
    const later = kept.find((e) => !e.deep);
    if (later) { setAt(g, later); assert(later.deep && later.value != null); if (res.act === 'rewind') Training.rewind(g); }
    // Saved, the list is not: it is thought again (the same) after a resume.
    assert(!('ranked' in g.toJSON().x.training) && !('rankedFor' in g.toJSON().x.training));
  });

  test('training: the coach looks ahead exactly as far as the Next shows, never at a piece not shown', () => {
    for (const next of [0, 1, 3, 5]) for (const hold of [false, true]) {
      const g = new Game({ w: 10, h: 20, seed: 5, recipe: TR({ next, hold }) });
      for (let n = 0; n < 6; n++) setAt(g, Training.rank(g, Training.of(g).turn).best);
      const sn = Training.snap(g), ranked = Training.rank(g, sn);
      assert.strictEqual(ranked.depth, next, 'depth = Next shown');
      assert.strictEqual(Training.viewOf(g, sn).queue.length, next);
      // The pieces past the Next changed: the same ranking.
      const other = JSON.parse(JSON.stringify(sn));
      for (let i = next; i < other.queue.length; i++) other.queue[i] = { id: other.queue[i].id === 'I' ? 'O' : 'I', rot: 0 };
      const again = Training.rank(g, other), sig = (x) => x.filter((e) => e.deep).map((e) => e.id + e.r + e.x + e.y + (e.hold ? 'h' : '') + e.value.toFixed(6)).join();
      assert.strictEqual(sig(again), sig(ranked), 'nothing past the Next: ' + next + (hold ? ' with Hold' : ''));
    }
    // Every first placement there is, tucks and spins too, the Hold ones with them.
    const g = board(['...#......', '###...####', '####.#####'], { next: 3 }, 4);
    g.piece = null; g.spawn({ id: 'T' }); Training.newTurn(Training.of(g), Training.snap(g));
    const ranked = Training.rank(g, Training.of(g).turn);
    assert(ranked.some((e) => e.twist === 2), 'spins among them');
    assert(ranked.some((e) => !e.simple), 'tucks among them');
    assert(ranked.some((e) => e.hold), 'Hold among them');
    assert(ranked.length >= 40);
  });

  test('training: Hold is a move: a poor Hold goes back at once, then the spot shown (no Hold) is kept; Hold when it is best is kept; Hold missed is said', () => {
    let poorHolds = 0, goodHolds = 0, missed = 0;
    for (let seed = 1; seed <= 30 && (poorHolds < 2 || goodHolds < 2 || missed < 1); seed++) {
      const g = new Game({ w: 10, h: 20, seed, recipe: TR({ next: 3 }) }), T = Training.of(g), o = { trainHint: 1, trainStrict: 'standard', trainExplain: true };
      for (let n = 0; n < 12 && !g.over; n++) {
        const ranked = Training.rankingOf(g), best = Training.bestOf(ranked), h = Training.assessHold(ranked, 'standard');
        if (h.held && !h.good && poorHolds < 2) {
          // Hold pressed where it is poor: back at once (the piece and Hold as they were), the hint says where instead.
          const before = JSON.stringify([g.piece.type.id, g.hold, g.queue.map((e) => e.id)]);
          g.holdPiece();
          const res = Training.holdPress(g, o);
          assert.strictEqual(res.act, 'rewind');
          assert(T.back && T.why.hold && T.why.words[0] === T.turn.piece.entry.id + ' fits better now', T.why.words[0]);
          Training.rewind(g);
          assert.strictEqual(JSON.stringify([g.piece.type.id, g.hold, g.queue.map((e) => e.id)]), before, 'Hold undone');
          const hint = Training.hintOf(T, o);
          assert(hint && !hint.hold, 'the hint: set it, no Hold');
          let kept = null;
          const off = g.on('lock', (r) => { kept = Training.place(g, r, o); });
          const r = drive(g, hint.cells, false);
          off();
          assert(r && kept.act === 'keep', 'the spot shown is kept after a poor Hold');
          poorHolds++;
          continue;
        }
        if (best.hold && goodHolds < 2) {
          // Hold is the best: pressing it is kept, and the hint (with Hold) set by hand is kept.
          g.holdPiece();
          assert.strictEqual(Training.holdPress(g, o).act, 'keep');
          let kept = null;
          const off = g.on('lock', (r) => { kept = Training.place(g, r, o); });
          const r = drive(g, best.cells, false);
          off();
          assert(r && kept.act === 'keep');
          goodHolds++;
          continue;
        }
        if (best.hold && missed < 1) {
          // Not held when Hold was clearly better: the set is judged against the best through Hold, and said.
          const plain = ranked.filter((e) => !e.hold), worstLoss = plain.map((e) => ranked.deepen(e)).map((v) => best.value - v);
          const e = plain[worstLoss.findIndex((l) => l >= Training.STRICT.standard)];
          if (e) {
            let res = null;
            const off = g.on('lock', (r) => { res = Training.place(g, r, o); });
            setAt(g, e); off();
            assert.strictEqual(res.act, 'rewind');
            assert.strictEqual(T.why.words[0], 'Hold ' + best.id + ' fits better');
            Training.rewind(g);
            missed++;
          }
        }
        setAt(g, best);
      }
    }
    assert(poorHolds >= 1 && goodHolds >= 1 && missed >= 1, 'found: ' + [poorHolds, goodHolds, missed]);
    // Hold that brings a piece not in sight (no Next, none held): nothing to judge it by, kept.
    const g = new Game({ w: 10, h: 20, seed: 2, recipe: TR({ next: 0 }) });
    g.holdPiece();
    assert.strictEqual(Training.holdPress(g, {}).act, 'keep');
  });

  test('training: the long game: following the coach scores more and makes more Quads than a one-piece look, with no top out', () => {
    const play = (pick) => {
      const g = new Game({ w: 10, h: 20, seed: 11, recipe: TR({ level: 8, levelLock: true, next: 3 }) });
      let quadLines = 0;
      g.on('lock', (r) => { if (r.lines >= 4) quadLines += r.lines; });
      for (let n = 0; n < 70 && !g.over; n++) {
        const e = pick(Training.rank(g, Training.of(g).turn));
        if (e.hold) g.holdPiece();
        Object.assign(g.piece, { rot: e.r, x: e.x, y: e.y });
        g.drop();
      }
      return { score: g.s.score, lines: L.Classic.of(g).lines, quadLines, over: g.over };
    };
    const coach = play((rk) => rk.best), myopic = play((rk) => rk.filter((e) => e.hand).sort((a, b) => b.own - a.own)[0]);
    assert(!coach.over && !myopic.over, 'no top out');
    assert(coach.lines >= 20, JSON.stringify(coach));
    assert(coach.score >= myopic.score * 1.1, 'more score: ' + JSON.stringify([coach, myopic]));
    assert(coach.quadLines / coach.lines >= 0.5 && coach.quadLines >= myopic.quadLines, 'more Quads: ' + JSON.stringify([coach, myopic]));
  });

  test('training: a good move\'s word names what it did, from the board\'s own features: each kind on a built board; a plain kept set none', () => {
    /** A game with `pic` as its stack before, the piece set on `cells` after: praise's word for it as the best (o). */
    const say = (pic, cells, o) => {
      o = o || {};
      const g = board(pic, Object.assign({ next: 3 }, o.k || {})), sn = Training.of(g).turn;
      for (const [x, y] of cells) g.board.set(x, y, 4);
      const best = Object.assign({ id: 'O', own: 0, cells, rows: Bot.rowsOf(g.board) }, o.best || {});
      const r = Object.assign({ cells, lines: 0 }, o.r || {});
      const p = Training.praise(g, sn, r, { loss: o.loss == null ? 0 : o.loss, best, ranked: o.ranked ? o.ranked(best) : [best] });
      return p && p.word;
    };
    const O = (x, y) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
    // Clears, by kind.
    assert.strictEqual(say([], O(0, 0), { r: { lines: 2, twist: true } }), 'Twist clears 2');
    assert.strictEqual(say([], O(0, 0), { r: { lines: 4 } }), 'Quad: 4 rows');
    assert.strictEqual(say([], O(0, 0), { r: { lines: 2, perfect: true } }), 'Board cleared');
    assert.strictEqual(say([], O(0, 0), { r: { lines: 4, b2b: true, twist: false } }), 'Quad: 4 rows');
    assert.strictEqual(say([], O(0, 0), { r: { lines: 3, b2b: true } }), 'Streak kept');
    assert.strictEqual(say([], O(0, 0), { r: { lines: 1 } }), 'Clears 1 row');
    // The well kept, four deep with its rows ready: a Quad ready.
    const well = ['#########.', '#########.', '#########.', '#########.'];
    assert.strictEqual(say(well, O(0, 4)), 'Quad ready: well 4 deep');
    assert.strictEqual(say(['#########.', '#########.', '#####.###.'], O(0, 3)), 'Well kept, 3 deep');
    // A Twist slot made: a roof over one side of a slot a T can turn into.
    assert.strictEqual(say(['##...#####', '###.######'], O(1, 2)), 'Sets up Twist slot');
    // A gap filled, two wide, the stack higher on both sides.
    assert.strictEqual(say(['###..#####'], O(3, 0)), 'Fills the 2-wide gap');
    // Not the best on its own, the best for what comes: the next piece named.
    {
      const g = board([], { next: 3 }), next = Training.of(g).turn.queue[0].id;
      assert.strictEqual(say([], O(4, 0), { ranked: (b) => [b, { hand: true, own: 5, deep: true, cells: O(0, 0), rows: b.rows }] }), 'Next ' + next + ' fits after');
    }
    // Else what it leads the second best by most: here, no new holes.
    {
      const holed = Int32Array.from(Bot.rowsOf(board(['.#########', '#.########'], {}).board));
      assert.strictEqual(say(['##########'.replace(/#/g, '.')], O(0, 0), { ranked: (b) => [b, { hand: true, own: -9, deep: true, cells: O(2, 0), rows: holed }] }), 'No new holes');
    }
    // A set kept that is neither a clear nor the best's spot: no word.
    assert.strictEqual(say([], O(0, 0), { loss: 2 }), null);
    // A Hold that was the best move: what it did; one kept that was not: no word.
    let good = 0, plain = 0;
    for (let seed = 1; seed <= 30 && (!good || !plain); seed++) {
      const g = new Game({ w: 10, h: 20, seed, recipe: TR({ next: 3 }) });
      for (let n = 0; n < 10 && !g.over; n++) {
        const ranked = Training.rankingOf(g), best = Training.bestOf(ranked), h = Training.assessHold(ranked, 'gentle');
        if (h.held && h.good && (best.hold ? !good : !plain)) {
          const snapJ = JSON.stringify(Training.snap(g)), cur = g.piece.type.id;
          g.holdPiece();
          const res = Training.holdPress(g, { trainStrict: 'gentle' });
          assert.strictEqual(res.act, 'keep');
          if (best.hold) { assert(res.praise === 'Saves I for the well' || (res.praise === best.id + ' fits better now' && cur !== 'I') || cur === 'I', res.praise); good++; }
          else { assert.strictEqual(res.praise, null); plain++; }
          Training.restore(g, JSON.parse(snapJ));
        }
        setAt(g, best);
      }
    }
    assert(good && plain, 'both found: ' + [good, plain]);
  });

};
