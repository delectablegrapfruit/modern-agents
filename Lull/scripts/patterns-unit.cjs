// Patterns in Node (js/patterns.js, js/patterncards.js): the settings; what a board is (holes apart from overhangs, the
// pits and the main well among them); the fit strip's spots (each clean one leaves nothing open, every other drop
// does); every shape on built boards, found where it is and not where it is not (each card's four diagrams held to
// their captions, and a few at full size); what a placement does (its rows cleared, a hole opened, a piece's spot lost
// and given back, the Next's own); the notes' pace (Often, Sometimes, Rare; a risk before a good shape) and the learning
// curve (in full, then marked, then silent; Advanced off until asked for); the player's record; the measured costs
// (every shape measured, each verdict one of keep, merge or drop, a merge into a card that is kept); and a short run
// of the measuring games (scripts/patterns-sim.cjs), forced against avoided.
// Run by test.cjs: require('./patterns-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function patternsUnit({ L, test }) {
  const P = L.Patterns;
  /** A board from a picture (rows top first, '#' filled): { rows, W, H }. */
  const pic = (rows) => { const r = P.readPic(rows); return { rows: r.rows, W: r.W, H: r.H }; };
  const F = (rows) => { const b = pic(rows); return P.analyze(b.rows, b.W, b.H); };
  const S = (rows, o) => P.shapesOf(F(rows), o);
  /** A placement looked at: the picture's uppercase cells set on its stack. */
  const look = (rows, ctx) => { const r = P.readPic(rows); return P.look(Object.assign({ W: r.W, H: r.H, before: r.rows, cells: r.piece.cells, id: r.piece.id }, ctx || {})); };
  const ids = (lk) => lk.events.map((e) => e.id + (e.kind === 'cleared' ? '-' : ''));
  const words = (t) => String(t).trim().split(/\s+/).length;

  test('patterns: the settings, each its default when unset or out of range', () => {
    assert.deepStrictEqual(P.settingsOf({}), { style: 'move', notes: 'sometimes', detail: 'full', advanced: false });
    assert.deepStrictEqual(P.settingsOf({ trainStyle: 'patterns', trainNotes: 'rare', trainDetail: 'brief', trainAdvanced: true }), { style: 'patterns', notes: 'rare', detail: 'brief', advanced: true });
    assert.deepStrictEqual(P.settingsOf({ trainStyle: 'x', trainNotes: 'never', trainDetail: 7, trainAdvanced: 'yes' }), P.settingsOf({}));
  });

  test('patterns: a board read: holes (nothing reaches them) apart from overhangs (a piece can slide in), the pits and the main well', () => {
    const f = F(['......', '......', '###...', '##....', '#.###.', '#####.']);
    assert.deepStrictEqual(f.hgt, [4, 4, 4, 2, 2, 0]);
    assert.deepStrictEqual(f.holes, [[1, 1]], 'walled in on every side');
    assert.deepStrictEqual(f.overhangs.map(String).sort(), ['2,2'], 'open to the right');
    const g = F(['......', '##.##.', '##.##.', '##.##.', '#####.']);
    assert.deepStrictEqual(g.pits.map((p) => [p.x, p.depth]), [[2, 3], [5, 4]]);
    assert.strictEqual(g.well.x, 5, 'the lowest is the main well');
    const sh = S(['......', '##.##.', '##.##.', '##.##.', '#####.']);
    assert(sh.pit && sh.twoPits && sh.pit.keys.join() === 'p2', 'the other pit is the risk, the well is not');
    assert(!S(['......', '....#.', '....#.', '....#.', '#####.']).pit, 'one pit alone is the well');
  });

  test('patterns: the fit strip: every clean spot leaves nothing open under it, every other drop does; flat has no S or Z, a staircase no Z', () => {
    const boards = [['......', '......', '......', '##....', '###.#.', '#####.'], ['......', '......', '#.....', '##.#..', '####.#', '#####.'], ['......', '......', '......', '......', '......', '......']];
    let clean = 0, poor = 0;
    for (const b of boards) {
      const f = F(b), gaps = f.holes.length + f.overhangs.length;
      for (const id of P.IDS) {
        const keyOf = (s) => s.cells.map(String).sort().join(';'), fits = new Set(f.fits[id].map(keyOf));
        for (const s of P.dropsAll(f, id)) {
          const rows = Int32Array.from(f.rows);
          for (const [x, y] of s.cells) rows[y] |= 1 << x;
          const a = P.analyze(rows, f.W, f.H), more = a.holes.length + a.overhangs.length > gaps;
          assert.strictEqual(fits.has(keyOf(s)), !more, id + ' at ' + keyOf(s));
          if (more) poor++; else clean++;
        }
      }
    }
    assert(clean > 40 && poor > 40, clean + ' clean, ' + poor + ' poor');
    const flat = F(['......', '......', '#####.', '#####.']);
    assert(!flat.fits.S.length && !flat.fits.Z.length && flat.fits.O.length && flat.fits.I.length, 'flat: no S or Z, O and I fit');
    const stairs = F(['......', '#.....', '##....', '###...', '####..', '#####.']);
    assert(!stairs.fits.Z.length && stairs.fits.S.length, 'a staircase down: S fits, Z does not');
  });

  test('patterns: every card\'s four diagrams agree with their captions (the shape there, made, not made, undone), four words at most', () => {
    let n = 0;
    for (const s of P.SHAPES) {
      assert(P.CARDS[s.id], 'a card for ' + s.id);
      for (const w of ['what', 'happens', 'avoid', 'recover']) {
        const d = P.diagram(s.id, w);
        assert(d && d.ok, s.id + ' ' + w + ': ' + (d && d.cap));
        assert(words(d.cap) <= 4, s.id + ' ' + w + ' caption: ' + d.cap);
        if (w === 'what' || w === 'happens') assert(d.marks.length || ['finesse'].includes(s.id) || d.cleared.length, s.id + ' ' + w + ' marks something');
        n++;
      }
    }
    assert.strictEqual(n, P.SHAPES.length * 4);
    assert(P.SHAPES.every((s) => words(s.name) <= 4));
  });

  test('patterns: shapes on full boards, found and not: a hole, a deep pit beside the well, a cliff, a rough top, the top third, a clean well', () => {
    const W10 = (rows) => { const pad = Array.from({ length: 20 - rows.length }, () => '..........'); return pad.concat(rows); };
    assert(S(W10(['###.......', '#.####.##.', '#########.'])).hole);
    const side = S(W10(['.#........', '#..###.##.', '#########.']));
    assert(!side.hole && side.overhang, 'open beside: an overhang, not a hole');
    const pit = S(W10(['###.#####.', '###.#####.', '###.#####.', '#########.']));
    assert(pit.pit && pit.twoPits && !S(W10(['#########.', '#########.', '#########.'])).pit);
    assert(S(W10(['.....#####', '.....#####', '.....#####', '########..'])).cliff, 'a step of three');
    assert(!S(W10(['......####', '.....#####', '########..'])).cliff, 'steps of one');
    assert(S(W10(['.#...#....', '.#.#.#.#..', '.#.#.###..', '########..'])).rough);
    assert(!S(W10(['.........#', '########.#'])).rough);
    const tall = Array.from({ length: 14 }, () => '#########.');
    assert(S(W10(tall)).high && !S(W10(tall.slice(0, 12))).high, 'the top third is 14 rows of 20');
    const ready = S(W10(['#########.', '#########.', '#########.', '#########.']));
    assert(ready.cleanWell && ready.wellEdge && !S(W10(['#########.', '#########.', '#########.'])).cleanWell);
  });

  test('patterns: a placement looked at: rows cleared and the marks where the board is after, a hole opened, a spot lost and given back, the Next\'s own', () => {
    const lk = look(['......', '......', 'I.....', 'I.....', 'I.....', 'I#####', '##.###']);
    assert.deepStrictEqual(lk.cleared, [1]);
    assert(ids(lk).includes('dig') && !lk.Fa.holes.length, 'the hole under the cleared row opened');
    const lost = look(['......', '......', '......', 'L...#.', 'L.#.#.', 'LL###.', '#####.']);
    const e = lost.events.find((x) => x.id === 'spot');
    assert(e && e.pieces[0] === 'O' && e.ghost && e.ghost.id === 'O' && e.ghost.under.length, 'O lost its last spot: where it would go and what it would leave');
    assert(e.word === 'No spot for O' && e.icons[0][0] === 'O' && e.icons[0][1] === false);
    const next = look(['......', '......', '......', 'L...#.', 'L.#.#.', 'LL###.', '#####.'], { visible: ['O'] });
    assert(ids(next).includes('nextPlan') && !next.events.some((x) => x.id === 'spot' && x.kind !== 'cleared' && x.pieces.includes('O')), 'the Next piece\'s spot: Plan with Next, said once');
    const room = look(['......', '......', '......', '#...#I', '#.#.#I', '#####I', '#####I']);
    assert(room.events.some((x) => x.id === 'spot' && x.kind === 'cleared' && /^Room for/.test(x.word)), 'a spot given back');
    // Words: four at most, every one the detector can say on the cards.
    for (const s of P.SHAPES) for (const w of ['what', 'happens', 'avoid', 'recover']) {
      const r = P.readPic(P.CARDS[s.id][w].pic);
      if (!r.piece) continue;
      for (const x of look(P.CARDS[s.id][w].pic, Object.assign({}, P.CARDS[s.id].ctx || {}, P.CARDS[s.id][w].ctx || {})).events) assert(words(x.word) <= 4 && words(x.short) <= 3, x.id + ': ' + x.word + ' / ' + x.short);
    }
  });

  test('patterns: the notes\' pace: one every 2, 4 or 8 pieces, a risk before a good shape; the learning curve: full, then marked, then silent', () => {
    const ev = (id, prio) => ({ id, prio: prio != null ? prio : P.BY[id].prio, word: P.BY[id].note, short: 'x', group: P.BY[id].group, kind: 'formed' });
    for (const [notes, gap] of [['often', 2], ['sometimes', 4], ['rare', 8]]) {
      const mem = {}, shown = [];
      for (let i = 0; i < 40; i++) if (P.pace([ev('rough'), ev('flat')], mem, { notes }, i)) shown.push(i);
      for (let i = 1; i < shown.length; i++) assert(shown[i] - shown[i - 1] >= gap, notes + ': ' + shown.join());
      assert.strictEqual(shown[1] - shown[0], gap, notes + ' at its pace');
    }
    const mem = {};
    const first = P.pace([ev('flat'), ev('hole')], mem, {}, 0);
    assert.strictEqual(first.id, 'hole', 'the risk first');
    assert.deepStrictEqual([mem.met.flat, mem.met.hole], [1, 1], 'both met');
    const stages = [];
    for (let i = 0; i < 12; i++) { const n = P.pace([ev('pit')], mem, { notes: 'often' }, 10 + 2 * i); stages.push(n ? n.stage + (n.text ? '+' : '') : '-'); }
    assert.deepStrictEqual(stages, ['full+', 'full+', 'full+', 'mark', 'mark', 'mark', 'mark', 'mark', '-', '-', '-', '-'], 'in full three times, marked five, then silent');
    assert.strictEqual(P.stageOf(mem.seen, 'pit'), 'learned');
    const brief = P.pace([Object.assign(ev('cliff'), { short: 'Cliff' })], {}, { detail: 'brief' }, 0);
    assert.strictEqual(brief.text, 'Cliff', 'Brief: the short words');
    assert.strictEqual(P.pace([ev('parity')], {}, {}, 0), null, 'Advanced: off by default');
    assert(P.pace([ev('parity')], {}, { advanced: true }, 0), 'and on when asked for');
  });

  test('patterns: the player\'s record: holes a hundred pieces, the average height, top outs, this game against the ones before', () => {
    const mem = {};
    for (let i = 0; i < 50; i++) P.record(mem, 'a', i % 10 === 0 ? 1 : 0, 4, 1);
    P.logLine(mem, 'a').topout = true;
    for (let i = 0; i < 20; i++) P.record(mem, 'b', 0, 2, 2);
    const s = P.summary(mem, 'b');
    assert.deepStrictEqual([s.now.pieces, s.now.holes100, s.now.height, s.now.topouts], [20, 0, 2, 0]);
    assert.deepStrictEqual([s.before.pieces, s.before.holes100, s.before.height, s.before.topouts, s.before.games], [50, 10, 4, 1, 1]);
    for (let i = 0; i < 60; i++) P.record(mem, 'g' + i, 0, 1, 3);
    assert(mem.log.length <= 40, 'the last forty games kept');
  });

  test('patterns: the measured costs: every shape measured, each verdict keep, merge or drop; a merge into a kept card; a kept card has its cost line', () => {
    const C = P.COSTS;
    for (const s of P.SHAPES) {
      const c = C[s.id];
      assert(c, 'measured: ' + s.id);
      assert(/^(keep|drop|merge:\w+)$/.test(c.verdict), s.id + ' ' + c.verdict);
      if (c.verdict.startsWith('merge:')) assert.strictEqual(C[c.verdict.slice(6)].verdict, 'keep', s.id + ' merges into a kept card');
      if (c.verdict === 'keep') { assert(P.cardOf(s.id) === s.id, s.id + ' has its own card'); assert(P.costLine(s.id), s.id + ' has a cost line'); }
      if (c.verdict === 'drop') assert(!P.cardOf(s.id) && !P.noted(s.id), s.id + ' dropped: no card, no notes');
    }
    const shown = [].concat(...P.cardsByGroup().map((g) => g[2]));
    assert(shown.length >= 8 && shown.every((id) => C[id].verdict === 'keep'), 'the Guide shows the kept cards: ' + shown.join());
  });

  test('patterns: the measuring games, short: forced, holes are made; avoided, far fewer (same seeds, the same choices)', () => {
    const { game } = require('./patterns-sim.cjs');
    let f = 0, a = 0, lf = 0, la = 0;
    for (const seed of [1, 2]) {
      const F1 = game(L, { id: 'hole', level: 1, seed, pieces: 60, mode: 'force' }), A1 = game(L, { id: 'hole', level: 1, seed, pieces: 60, mode: 'avoid' });
      f += F1.occ; a += A1.occ; lf += F1.holes; la += A1.holes;
      assert.strictEqual(F1.pieces, 60);
    }
    assert(f >= 3 && lf > la, JSON.stringify({ f, a, lf, la }));
  });
};
