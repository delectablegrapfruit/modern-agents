// Lull — Patterns, Training's second style (js/training.js has the first, Per move; the drawing, the fit strip, the notes
// and the Guide are js/patternsview.js): the shapes a stack makes and the placements that make them, found by one
// detector that the notes in play, the Guide's diagrams and the measured costs (scripts/patterns-sim.cjs) all share.
//
// The detector reads a board as rows of bits (Bot's: bit x of rows[y], row 0 the floor). What a board is (analyze): its
// column heights; its holes (empty cells nothing can reach from above, found by a flood from the top) and overhangs
// (empty cells under a block that a piece can still slide into); its pits (one column three or more below both sides, a
// wall counting as high) and the main well among them (the lowest, then the deepest, then one at a side); its steps; and
// the fit of each of the seven pieces (fitsOf: every spot it can be dropped straight onto with nothing left open under
// it, a clean spot). What a board shows (shapesOf): the shapes below, each with the cells to mark. What a placement does
// (look): the shapes it forms and clears, the pieces it leaves without a clean spot or gives one back, and the
// placements to avoid, each an event with its cells, a few words and the pieces that fit (✓) or do not (✗).
//
// The notes (pace): at most one every few pieces (Notes: Often, Sometimes, Rare), a risk before a good shape, and each
// shape on a learning curve: shown in full the first times, then marked only, then silent once learned (kept in the
// save: state.patterns.seen). Nothing here counts toward anything; the player's own record (holes a hundred pieces,
// the average height, top outs) is kept apart, a game a line (state.patterns.log).
//
// Pure, no DOM: scripts/patterns-unit.cjs tests it in Node, every card's diagrams included.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, Bot } = L;
  if (!Pieces || !Bot) return;

  const IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  // ---- the settings ----------------------------------------------------------------------------------------------------

  /** Notes: the fewest pieces between two notes. */
  const NOTES = Object.freeze({ often: 2, sometimes: 4, rare: 8 });
  const NOTE_IDS = ['often', 'sometimes', 'rare'];
  const NOTE_NAMES = { often: 'Often', sometimes: 'Sometimes', rare: 'Rare' };
  const DETAIL_IDS = ['full', 'brief'];
  const DETAIL_NAMES = { full: 'Full', brief: 'Brief' };
  const STYLE_IDS = ['move', 'patterns'];
  const STYLE_NAMES = { move: 'Per move', patterns: 'Patterns' };
  /** The learning curve: a shape's note in full this many times, then marked only this many more, then silent. */
  const CURVE = Object.freeze({ full: 3, mark: 5 });
  const DEFAULTS = Object.freeze({ style: 'move', notes: 'sometimes', detail: 'full', advanced: false });

  /** Patterns' settings as saved (Settings: trainStyle, trainNotes, trainDetail, trainAdvanced), each its default when unset. */
  function settingsOf(st) {
    st = st || {};
    return {
      style: STYLE_IDS.includes(st.trainStyle) ? st.trainStyle : DEFAULTS.style,
      notes: NOTES[st.trainNotes] != null ? st.trainNotes : DEFAULTS.notes,
      detail: DETAIL_IDS.includes(st.trainDetail) ? st.trainDetail : DEFAULTS.detail,
      advanced: st.trainAdvanced === true,
    };
  }

  // ---- what a board is -------------------------------------------------------------------------------------------------

  const bit = (rows, x, y) => y >= 0 && y < rows.length && ((rows[y] >>> x) & 1) === 1;
  const key = (x, y) => x + ',' + y;

  /**
   * A board's facts: { W, H, rows, hgt (each column's height), top, holes and overhangs ([[x, y]]), pits ([{ x, depth,
   * floor }]), well (the main well: a pit, or null), ready (rows filled but for the well, from its floor up), bump (the
   * steps' sizes added up, the well's two left out), fits ({ id: [spot] }: fitsOf) }.
   */
  function analyze(rows, W, H) {
    const hgt = new Array(W).fill(0);
    let top = 0;
    for (let x = 0; x < W; x++) { for (let y = H - 1; y >= 0; y--) if (bit(rows, x, y)) { hgt[x] = y + 1; break; } top = Math.max(top, hgt[x]); }
    // The flood from above: every empty cell a piece could get to; the rest under a block are holes.
    const seen = new Uint8Array(W * H), stack = [];
    for (let x = 0; x < W; x++) if (!bit(rows, x, H - 1)) { seen[(H - 1) * W + x] = 1; stack.push(x, H - 1); }
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || seen[ny * W + nx] || bit(rows, nx, ny)) continue;
        seen[ny * W + nx] = 1; stack.push(nx, ny);
      }
    }
    const holes = [], overhangs = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < hgt[x]; y++) if (!bit(rows, x, y)) (seen[y * W + x] ? overhangs : holes).push([x, y]);
    // Pits: one column three or more below both its sides (a wall is as high as can be).
    const side = (x) => Math.min(x > 0 ? hgt[x - 1] : Infinity, x < W - 1 ? hgt[x + 1] : Infinity);
    const pits = [];
    for (let x = 0; x < W; x++) { const d = side(x) - hgt[x]; if (W > 1 && d >= 3 && d < Infinity) pits.push({ x, depth: d, floor: hgt[x] }); }
    const well = pits.slice().sort((a, b) => a.floor - b.floor || b.depth - a.depth || edge(b.x, W) - edge(a.x, W) || a.x - b.x)[0] || null;
    let ready = 0;
    if (well) {
      const full = (1 << W) - 1, m = 1 << well.x;
      for (let y = well.floor; y < top && ready < 4; y++) { if ((rows[y] | m) === full && !(rows[y] & m)) ready++; else break; }
    }
    let bump = 0;
    for (let x = 0; x + 1 < W; x++) if (!well || (x !== well.x && x + 1 !== well.x)) bump += Math.abs(hgt[x] - hgt[x + 1]);
    const F = { W, H, rows, hgt, top, holes, overhangs, pits, well, ready, bump };
    F.fits = fitsOf(F);
    return F;
  }
  const edge = (x, W) => (x === 0 || x === W - 1 ? 1 : 0);

  const DROPS = new Map();
  /** A piece's distinct turns as drops: [{ r, bw, bh, bottom (each column's lowest cell), cells ([dx, dy]) }]. */
  function dropsOf(id) {
    let d = DROPS.get(id);
    if (d) return d;
    const sh = Bot.shapeOf(Pieces.get(id));
    d = [];
    sh.forEach((t, r) => {
      if (sh.dOf[r] !== r) return;
      const cells = [], bottom = new Array(t.bw).fill(99);
      for (let dy = 0; dy < t.bh; dy++) for (let c = 0; c < t.bw; c++) if ((t.m[dy] >>> c) & 1) { cells.push([c, dy]); bottom[c] = Math.min(bottom[c], dy); }
      d.push({ r, bw: t.bw, bh: t.bh, bottom, cells });
    });
    DROPS.set(id, d);
    return d;
  }

  /**
   * Every spot each of the seven can be dropped straight onto: { id: [{ cells, gaps (the empty cells it would leave under
   * it), under ([[x, y]] those cells) }] }, a clean spot (gaps 0) first. Only spots under the top are counted.
   */
  function dropsAll(F, id) {
    const out = [];
    for (const d of dropsOf(id)) {
      for (let px = 0; px + d.bw <= F.W; px++) {
        let py = 0;
        for (let c = 0; c < d.bw; c++) py = Math.max(py, F.hgt[px + c] - d.bottom[c]);
        if (py + d.bh > F.H) continue;
        const under = [];
        for (let c = 0; c < d.bw; c++) for (let y = F.hgt[px + c]; y < py + d.bottom[c]; y++) under.push([px + c, y]);
        out.push({ cells: d.cells.map(([dx, dy]) => [px + dx, py + dy]), gaps: under.length, under, top: py + d.bh });
      }
    }
    return out;
  }
  function fitsOf(F) {
    const out = {};
    for (const id of IDS) out[id] = dropsAll(F, id).filter((s) => !s.gaps);
    return out;
  }
  /** The least poor spot for a piece with no clean one (fewest cells left open under it, then the lowest). */
  function leastPoor(F, id) {
    return dropsAll(F, id).sort((a, b) => a.gaps - b.gaps || a.top - b.top)[0] || null;
  }

  /** A slot a T could twist into (js/bot.js slots' rule): the T's cells, the best first, or null. */
  function slotOf(F) {
    const { rows, W, top, hgt } = F, full = (1 << W) - 1;
    let best = null, bestN = -1;
    for (let y = 0; y + 2 < top + 1 && y < 30; y++) {
      for (let x = 0; x + 2 < W; x++) {
        const r0 = rows[y], r1 = rows[y + 1] || 0, r2 = rows[y + 2] || 0;
        if ((r0 >>> (x + 1)) & 1 || ((r1 >>> x) & 7) || !((r0 >>> x) & 1) || !((r0 >>> (x + 2)) & 1)) continue;
        if (y > 0 && !((rows[y - 1] >>> (x + 1)) & 1)) continue;
        const roofL = (r2 >>> x) & 1, roofR = (r2 >>> (x + 2)) & 1;
        if (roofL === roofR || ((r2 >>> (x + 1)) & 1)) continue;
        if (hgt[roofL ? x + 2 : x] > y + 1) continue;
        const n = ((r0 | (1 << (x + 1))) === full ? 1 : 0) + ((r1 | (7 << x)) === full ? 1 : 0);
        if (n > bestN) { bestN = n; best = [[x + 1, y], [x, y + 1], [x + 1, y + 1], [x + 2, y + 1]]; }
      }
    }
    return best;
  }

  /** The filled cells on the two colours of a checkerboard, apart: how far off a fill by pieces of two and two it is. */
  function parityOf(F) {
    let d = 0;
    for (let y = 0; y < F.top; y++) for (let x = 0; x < F.W; x++) if (bit(F.rows, x, y)) d += (x + y) & 1 ? 1 : -1;
    return Math.abs(d);
  }

  // ---- the shapes ------------------------------------------------------------------------------------------------------

  /**
   * Every shape and placement the detector knows: { id, group ('risky', 'good', 'combo', 'advanced'), name (the Guide's,
   * short), note (its words in play, four at most), short (Brief's, one or two), prio (the note said first when several
   * are due: risks above good shapes), icons (the pieces its note shows as fitting or not), back (its words when it goes
   * away, for the shapes whose going is worth a note), sim ('formed': a placement that makes it, 'present': one that
   * leaves it; how the measured runs force and avoid it) }.
   */
  const SHAPES = [
    { id: 'hole', group: 'risky', name: 'Hole', note: 'New hole', short: 'Hole', prio: 90, sim: 'formed' },
    { id: 'overhang', group: 'risky', name: 'Overhang', note: 'Overhang: fill under', short: 'Overhang', prio: 70, back: 'Overhang filled', sim: 'formed' },
    { id: 'pit', group: 'risky', name: 'Deep pit', note: 'Only I fits', short: 'Pit', prio: 80, icons: () => [['I', true]], back: 'Pit filled', sim: 'formed' },
    { id: 'twoPits', group: 'risky', name: 'Two pits', note: 'Two pits, one I', short: 'Two pits', prio: 85, icons: () => [['I', true]], sim: 'formed' },
    { id: 'cliff', group: 'risky', name: 'Cliff', note: 'Step of three', short: 'Cliff', prio: 60, sim: 'formed' },
    { id: 'rough', group: 'risky', name: 'Rough top', note: 'Top getting rough', short: 'Rough', prio: 50, sim: 'formed' },
    { id: 'noSZ', group: 'risky', name: 'No home for S/Z', note: 'No step for S/Z', short: 'No S/Z', prio: 65, icons: () => [['S', false], ['Z', false]], sim: 'formed' },
    { id: 'coveredWell', group: 'risky', name: 'Covered well', note: 'Well covered', short: 'Covered', prio: 88, back: 'Well open again', sim: 'formed' },
    { id: 'high', group: 'risky', name: 'High stack', note: 'Top third: clear down', short: 'High', prio: 75, back: 'Stack back down', sim: 'formed' },
    { id: 'spot', group: 'risky', name: 'Piece with no spot', note: (e) => (e.pieces.length > 1 ? 'No spot: ' : 'No spot for ') + e.pieces.join(', '), short: (e) => 'No ' + e.pieces.join(''), prio: 72, back: (e) => 'Room for ' + e.pieces.join(', '), icons: (e) => e.pieces.map((p) => [p, e.kind === 'cleared']), sim: 'formed' },
    { id: 'nextPlan', group: 'risky', name: 'Next has no spot', note: (e) => 'Next ' + e.pieces[0] + ': no spot', short: (e) => 'Next ' + e.pieces[0], prio: 74, icons: (e) => [[e.pieces[0], false]], sim: 'formed' },
    { id: 'flat', group: 'good', name: 'Flat top', note: 'Flat: most pieces fit', short: 'Flat', prio: 20, sim: 'present' },
    { id: 'slope', group: 'good', name: 'Gentle slope', note: 'Gentle slope', short: 'Slope', prio: 18, sim: 'present' },
    { id: 'steps', group: 'good', name: 'Matching steps', note: 'S and Z fit', short: 'Steps', prio: 22, icons: () => [['S', true], ['Z', true]], sim: 'present' },
    { id: 'oFlat', group: 'good', name: 'Two-wide flat', note: 'Flat pair: O fits', short: 'O fits', prio: 12, icons: () => [['O', true]], sim: 'present' },
    { id: 'cleanWell', group: 'good', name: 'Clean well', note: 'Quad ready', short: 'Quad ready', prio: 30, icons: () => [['I', true]], sim: 'present' },
    { id: 'twistSlot', group: 'good', name: 'Twist slot', note: 'Twist slot ready', short: 'Slot', prio: 28, icons: () => [['T', true]], sim: 'present' },
    { id: 'wellEdge', group: 'good', name: 'Well at the side', note: 'Well at the side', short: 'Side well', prio: 16, sim: 'present' },
    { id: 'burn', group: 'good', name: 'Burn lines when high', note: 'High: lines burned', short: 'Burned', prio: 26, sim: 'formed' },
    { id: 'bag', group: 'good', name: 'Every piece within 12', note: (e) => 'I within ' + e.n, short: (e) => 'I ≤ ' + e.n, prio: 15, icons: () => [['I', true]], sim: 'present' },
    { id: 'holdGood', group: 'good', name: 'Hold to keep clean', note: 'Hold kept it clean', short: 'Hold', prio: 24, sim: 'formed' },
    { id: 'dig', group: 'good', name: 'Digging', note: 'Hole opened', short: 'Opened', prio: 35, sim: 'formed' },
    { id: 'streak', group: 'good', name: 'Streak', note: 'Streak kept', short: 'Streak', prio: 32, sim: 'formed' },
    { id: 'combo', group: 'good', name: 'Combo', note: (e) => 'Combo ' + e.n, short: (e) => 'Combo ' + e.n, prio: 31, sim: 'formed' },
    { id: 'spotless', group: 'good', name: 'Spotless', note: 'Spotless: board clear', short: 'Spotless', prio: 40, sim: 'formed' },
    { id: 'szFlat', group: 'combo', name: 'S/Z on flat', note: (e) => e.piece + ' on flat: overhang', short: (e) => e.piece + ' on flat', prio: 92, icons: (e) => [[e.piece, false]], sim: 'formed' },
    { id: 'ljPit', group: 'combo', name: 'L/J into a pit', note: (e) => e.piece + ' in pit: hole', short: (e) => e.piece + ' in pit', prio: 91, icons: () => [['I', true]], sim: 'formed' },
    { id: 'oUneven', group: 'combo', name: 'O on uneven ground', note: 'O on a step', short: 'O step', prio: 91, icons: () => [['O', false]], sim: 'formed' },
    { id: 'wellFill', group: 'combo', name: 'Filling the well', note: (e) => e.piece + ' in the well', short: 'Well filled', prio: 86, icons: () => [['I', true]], sim: 'formed' },
    { id: 'holdNoPlan', group: 'combo', name: 'Hold with no plan', note: (e) => 'Held ' + e.held + ' fit before', short: 'Hold', prio: 84, icons: (e) => [[e.held, true]], sim: 'formed' },
    { id: 'parity', group: 'advanced', name: 'Checkerboard', note: (e) => 'Checkerboard off ' + e.n, short: 'Parity', prio: 10, sim: 'formed' },
    { id: 'finesse', group: 'advanced', name: 'Fewest keys', note: (e) => e.n + ' extra keys', short: 'Keys', prio: 8, sim: 'formed' },
    { id: 'speed', group: 'advanced', name: 'Survive at speed', note: 'Fast: survive first', short: 'Survive', prio: 45, sim: 'present' },
  ];
  const BY = Object.fromEntries(SHAPES.map((s) => [s.id, s]));
  const GROUPS = [['risky', 'Risky'], ['good', 'Good'], ['combo', 'Combinations'], ['advanced', 'Advanced']];

  /**
   * The board shapes a board shows (F: analyze's): { id: { cells (to mark), keys (one a shape: a new key is a new one) } }.
   * o: { level (the speed, for Survive at speed), visible (the Next ids), sinceI (pieces since the last I), rand }.
   */
  function shapesOf(F, o) {
    o = o || {};
    const { W, H, hgt, top } = F, out = {};
    const put = (id, cells, keys, x) => { out[id] = Object.assign({ cells, keys }, x || {}); };
    const surface = (xs) => (xs || hgt.map((_, x) => x)).filter((x) => hgt[x] > 0).map((x) => [x, hgt[x] - 1]);
    const pitCells = (p) => { const out = []; for (let y = p.floor; y < p.floor + p.depth && y < H; y++) out.push([p.x, y]); return out; };
    if (F.holes.length) put('hole', F.holes, F.holes.map((c) => key(c[0], c[1])));
    if (F.overhangs.length) put('overhang', F.overhangs, F.overhangs.map((c) => key(c[0], c[1])));
    const others = F.pits.filter((p) => p !== F.well);
    if (others.length) put('pit', [].concat(...others.map(pitCells)), others.map((p) => 'p' + p.x));
    if (F.pits.length >= 2) put('twoPits', [].concat(...F.pits.map(pitCells)), ['two']);
    // Cliffs: a step of three or more whose low side is not a pit (a pit is its own shape).
    const cl = [];
    for (let x = 0; x + 1 < W; x++) {
      const d = hgt[x + 1] - hgt[x];
      if (Math.abs(d) < 3) continue;
      const low = d > 0 ? x : x + 1;
      if (F.pits.some((p) => p.x === low)) continue;
      const cells = []; for (let y = hgt[low]; y < hgt[low] + Math.abs(d) && y < H; y++) cells.push([low, y]);
      cl.push({ low, cells });
    }
    if (cl.length) put('cliff', [].concat(...cl.map((c) => c.cells)), cl.map((c) => 'c' + c.low));
    if (top && F.bump >= Math.ceil(1.2 * W)) put('rough', surface(), ['r']);
    if (top && !F.fits.S.length && !F.fits.Z.length) put('noSZ', surface(), ['n']);
    // A covered well: two or more holes one over another in one column, its sides filled (a pit with a roof).
    const cw = [];
    for (let x = 0; x < W; x++) {
      const col = F.holes.filter(([hx, hy]) => hx === x && (x === 0 || bit(F.rows, x - 1, hy)) && (x === W - 1 || bit(F.rows, x + 1, hy))).map((c) => c[1]).sort((a, b) => a - b);
      for (let i = 1; i < col.length; i++) if (col[i] === col[i - 1] + 1) { cw.push(x); break; }
    }
    if (cw.length) put('coveredWell', F.holes.filter(([x]) => cw.includes(x)), cw.map((x) => 'w' + x));
    if (top >= Math.ceil(2 * H / 3)) put('high', hgt.map((h, x) => [x, h - 1]).filter(([, y]) => y >= Math.ceil(2 * H / 3) - 1), ['h']);
    // Good: a flat top, a gentle slope (steps of one, all one way), matching steps, a flat pair, a clean well, a slot.
    const steps = [];
    for (let x = 0; x + 1 < W; x++) if (!F.well || (x !== F.well.x && x + 1 !== F.well.x)) steps.push(hgt[x + 1] - hgt[x]);
    const gentle = steps.every((d) => Math.abs(d) <= 1);
    if (top && gentle && F.bump <= 2 && !F.holes.length) put('flat', surface(), ['f']);
    const ups = steps.filter((d) => d > 0).length, downs = steps.filter((d) => d < 0).length;
    if (top && gentle && F.bump >= 3 && (!ups || !downs) && !F.holes.length) put('slope', surface(), ['sl']);
    if (top && F.fits.S.length && F.fits.Z.length) put('steps', F.fits.S[0].cells.concat(F.fits.Z[0].cells), ['s']);
    if (F.fits.O.length && top) put('oFlat', F.fits.O[0].cells, ['o']);
    if (F.well && F.well.depth >= 4 && F.ready >= 4) put('cleanWell', pitCells(F.well), ['w' + F.well.x], { x: F.well.x });
    const slot = slotOf(F);
    if (slot) put('twistSlot', slot, [key(slot[0][0], slot[0][1])]);
    if (F.well && (F.well.x === 0 || F.well.x === W - 1)) put('wellEdge', pitCells(F.well), ['e' + F.well.x]);
    // The bag: a ready well and no I in sight, with the 7-bag it comes within 13 pieces of the last.
    if (o.rand !== 'retro' && o.sinceI != null && F.well && F.well.depth >= 3 && F.ready >= 2 && !(o.visible || []).includes('I')) put('bag', pitCells(F.well), ['b'], { n: Math.max(1, 13 - o.sinceI) });
    const par = parityOf(F);
    if (par >= 3) put('parity', surface(), ['p'], { n: par });
    if ((o.level || 1) >= 13 && top >= H / 2 && F.well && F.well.depth >= 3) put('speed', pitCells(F.well), ['v']);
    return out;
  }

  // ---- what a placement does -------------------------------------------------------------------------------------------

  /**
   * A placement looked at: c = { W, H, before (rows), cells (where the piece was set, before its rows cleared; [] when
   * none), id, twist, perfect, streak (it kept the Streak), combo (the combo after it), holdUsed, held (in Hold after),
   * visible (the Next ids after it), rand, sinceI, level, keys, minKeys, Fb (analyze(before), when known) }. Returns {
   * events: [{ id, kind ('formed' | 'cleared' | 'made'), cells (to mark, as the board is after), mid (the same as it
   * was the moment the piece was set), word, short, icons ([[id, fits]]), ghost ({ id, cells, under }: where a piece
   * with no spot would go, and what it would leave), n, pieces }], Fa (the board after), shapes (shapesOf it), lines }.
   */
  function look(c) {
    const { W, H } = c, full = (1 << W) - 1;
    const Fb = c.Fb || analyze(c.before, W, H);
    const mid = Int32Array.from(c.before);
    for (const [x, y] of c.cells || []) if (y >= 0 && y < H) mid[y] |= 1 << x;
    const cleared = [];
    for (let y = 0; y < H; y++) if (mid[y] === full) cleared.push(y);
    const after = new Int32Array(H);
    { let n = 0; for (let y = 0; y < H; y++) if (mid[y] !== full) after[n++] = mid[y]; }
    const Fa = analyze(after, W, H);
    const toAfter = (cells) => cells.filter(([, y]) => !cleared.includes(y)).map(([x, y]) => [x, y - cleared.filter((r) => r < y).length]);
    const kept = []; for (let y = 0; y < H; y++) if (!cleared.includes(y)) kept.push(y);
    const toMid = (cells) => cells.map(([x, y]) => [x, kept[y] != null ? kept[y] : y + cleared.length]);
    const ctxB = { level: c.level, visible: c.visibleBefore || c.visible, sinceI: c.sinceIBefore != null ? c.sinceIBefore : c.sinceI, rand: c.rand };
    const ctxA = { level: c.level, visible: c.visible, sinceI: c.sinceI, rand: c.rand };
    const Sb = shapesOf(Fb, ctxB), Sa = shapesOf(Fa, ctxA);
    const out = [], placed = c.cells || [];
    const ev = (id, kind, cells, x) => out.push(Object.assign({ id, kind, cells, mid: x && x.mid ? x.mid : toMid(cells) }, x || {}));
    // Holes and overhangs: the new ones the piece left under it that are still there once its rows are gone.
    const gapKeys = (F) => new Set(F.holes.concat(F.overhangs).map((q) => key(q[0], q[1])));
    const was = gapKeys(Fb), Fp = analyze(mid, W, H);
    const madeMid = Fp.holes.concat(Fp.overhangs).filter((q) => !was.has(key(q[0], q[1])) && !cleared.includes(q[1]));
    const made = toAfter(madeMid);
    const isHole = new Set(Fa.holes.map((q) => key(q[0], q[1]))), isOver = new Set(Fa.overhangs.map((q) => key(q[0], q[1])));
    const newHoles = made.filter((q) => isHole.has(key(q[0], q[1]))), newOver = made.filter((q) => isOver.has(key(q[0], q[1])));
    if (newHoles.length) ev('hole', 'formed', newHoles);
    if (newOver.length) ev('overhang', 'formed', newOver);
    // The other board shapes: formed when a key is new, gone when none is left.
    for (const id of ['pit', 'twoPits', 'cliff', 'rough', 'noSZ', 'coveredWell', 'high', 'flat', 'slope', 'steps', 'oFlat', 'cleanWell', 'twistSlot', 'wellEdge', 'bag', 'parity', 'speed']) {
      const a = Sa[id], b = Sb[id];
      if (a && (!b || a.keys.some((k) => !b.keys.includes(k)))) ev(id, 'formed', a.cells, { n: a.n });
      else if (b && !a && BY[id].back) ev(id, 'cleared', toAfter(placed).length ? toAfter(placed) : surfaceOf(Fa), {});
    }
    if (Sb.overhang && !Sa.overhang && !newOver.length) ev('overhang', 'cleared', toAfter(placed), {});
    // A hole opened: fewer holes than before (dug down to, or its row cleared).
    if (Fa.holes.length < Fb.holes.length) ev('dig', 'made', toAfter(placed).length ? toAfter(placed) : surfaceOf(Fa), { mid: placed.slice() });
    // The pieces' clean spots: one lost (the Next piece's own: Plan with Next), one given back.
    const lost = IDS.filter((p) => Fb.fits[p].length && !Fa.fits[p].length), got = IDS.filter((p) => !Fb.fits[p].length && Fa.fits[p].length);
    const next = c.visible && c.visible[0];
    if (next && lost.includes(next)) {
      const g = leastPoor(Fa, next);
      ev('nextPlan', 'made', g ? g.under.concat(g.cells) : surfaceOf(Fa), { pieces: [next], ghost: g ? { id: next, cells: g.cells, under: g.under } : null });
    }
    const others = lost.filter((p) => p !== next);
    if (others.length) {
      const p = others[0], g = leastPoor(Fa, p);
      ev('spot', 'formed', g ? g.under.concat(g.cells) : surfaceOf(Fa), { pieces: others.slice(0, 2), ghost: g ? { id: p, cells: g.cells, under: g.under } : null });
    }
    if (got.length) ev('spot', 'cleared', Fa.fits[got[0]][0].cells, { pieces: got.slice(0, 2) });
    // The placements to avoid, by the piece and what it left.
    const id = c.id, gap = madeMid.length > 0, cols = [...new Set(placed.map((q) => q[0]))].sort((a, b) => a - b);
    const placedAfter = toAfter(placed), markMade = made.length ? made : placedAfter;
    const midMade = madeMid.length ? madeMid : placed.slice();
    if ((id === 'S' || id === 'Z') && gap && cols.length === 3 && cols.every((x) => Fb.hgt[x] === Fb.hgt[cols[0]])) ev('szFlat', 'made', placedAfter.concat(markMade), { piece: id, mid: placed.concat(madeMid) });
    // (L or J into a pit: set in a column two or more below both sides, and a gap left in that very column.)
    const sideOf = (x) => Math.min(x > 0 ? Fb.hgt[x - 1] : Infinity, x < W - 1 ? Fb.hgt[x + 1] : Infinity);
    const pitCol = (x) => sideOf(x) < Infinity && sideOf(x) - Fb.hgt[x] >= 2;
    const inPit = madeMid.some(([x]) => pitCol(x) && cols.includes(x));
    if ((id === 'L' || id === 'J') && gap && inPit) ev('ljPit', 'made', placedAfter.concat(markMade), { piece: id, mid: placed.concat(madeMid) });
    if (id === 'O' && cols.length === 2 && Fb.hgt[cols[0]] !== Fb.hgt[cols[1]]) ev('oUneven', 'made', placedAfter.concat(markMade), { mid: placed.concat(midMade) });
    if (id && id !== 'I' && Fb.well && Fb.well.depth >= 3 && cols.includes(Fb.well.x) && !cleared.length) ev('wellFill', 'made', placedAfter, { piece: id, mid: placed.slice() });
    if (c.holdUsed && c.held && id && c.held !== id) {
      if (gap && Fb.fits[c.held].length) ev('holdNoPlan', 'made', markMade, { held: c.held, mid: midMade });
      else if (!gap && !Fb.fits[c.held].length) ev('holdGood', 'made', placedAfter.length ? placedAfter : surfaceOf(Fa), { held: c.held, mid: placed.slice() });
    }
    // Clears: small ones when high (burned), the Streak kept, a combo, the whole board.
    const rowsMid = (n) => { const cells = []; for (const y of cleared.slice(0, n)) for (let x = 0; x < W; x++) cells.push([x, y]); return cells; };
    const at = placedAfter.length ? placedAfter : surfaceOf(Fa);
    if (cleared.length && cleared.length <= 2 && Fb.top >= H / 2) ev('burn', 'made', at, { mid: rowsMid(2) });
    if (cleared.length && c.streak) ev('streak', 'made', at, { mid: rowsMid(4) });
    if (cleared.length && c.combo >= 2) ev('combo', 'made', at, { n: c.combo, mid: rowsMid(4) });
    if (cleared.length && !Fa.top) ev('spotless', 'made', at, { mid: rowsMid(4) });
    if (c.keys != null && c.minKeys != null && c.keys - c.minKeys >= 2) ev('finesse', 'made', at, { n: c.keys - c.minKeys, mid: placed.slice() });
    // (Each event's words and icons, from its shape.)
    for (const e of out) {
      const s = BY[e.id], txt = e.kind === 'cleared' && s.back ? s.back : s.note;
      e.word = typeof txt === 'function' ? txt(e) : txt;
      e.short = e.kind === 'cleared' ? (e.id === 'spot' ? 'Room ' + e.pieces.join('') : e.word.split(' ').slice(0, 3).join(' ')) : typeof s.short === 'function' ? s.short(e) : s.short;
      e.icons = s.icons ? s.icons(e) : [];
      e.prio = s.prio + (e.kind === 'cleared' ? -40 : 0);
      e.group = s.group;
    }
    return { events: out, Fa, Fb, shapes: Sa, lines: cleared.length, cleared };
  }
  function surfaceOf(F) { const out = []; for (let x = 0; x < F.W; x++) if (F.hgt[x]) out.push([x, F.hgt[x] - 1]); return out.length ? out : [[Math.floor(F.W / 2), 0]]; }

  // ---- the notes' pace and the learning curve --------------------------------------------------------------------------

  /** Where a shape is on the learning curve, by the notes of it shown so far: 'full', 'mark' or 'learned'. */
  function stageOf(seen, id) { const n = (seen && seen[id]) || 0; return n < CURVE.full ? 'full' : n < CURVE.full + CURVE.mark ? 'mark' : 'learned'; }

  /**
   * The note to show for a placement, or null: mem { seen, met (every shape met at all), last (the piece of the last
   * note) }, o (settingsOf), piece (this one's number in the game). At most one every NOTES[o.notes] pieces; a learned
   * shape is silent; Advanced only when asked for. Every event is met (the Guide dots it); the one shown counts toward
   * its learning. Returns the event, with stage ('full' or 'mark') and text (Full: its words; Brief: its short ones).
   */
  function pace(events, mem, o, piece) {
    o = Object.assign({}, DEFAULTS, o || {});
    mem.seen = mem.seen || {}; mem.met = mem.met || {};
    for (const e of events) mem.met[e.id] = (mem.met[e.id] || 0) + 1;
    if (mem.last != null && piece - mem.last < NOTES[o.notes]) return null;
    const due = events.filter((e) => (o.advanced || BY[e.id].group !== 'advanced') && stageOf(mem.seen, e.id) !== 'learned').sort((a, b) => b.prio - a.prio);
    const e = due[0];
    if (!e) return null;
    const stage = stageOf(mem.seen, e.id);
    mem.seen[e.id] = (mem.seen[e.id] || 0) + 1;
    mem.last = piece;
    return Object.assign({}, e, { stage, text: stage === 'full' ? (o.detail === 'brief' ? e.short : e.word) : null });
  }

  // ---- the player's record -----------------------------------------------------------------------------------------------

  const LOG_MAX = 40;
  /** A game's line of the record (made when first wanted): { id, at, pieces, holes, hsum (heights added up), topout }. */
  function logLine(mem, gid, now) {
    mem.log = Array.isArray(mem.log) ? mem.log : [];
    let e = mem.log.find((x) => x && x.id === gid);
    if (!e) { e = { id: gid, at: now || 0, pieces: 0, holes: 0, hsum: 0, topout: false }; mem.log.push(e); while (mem.log.length > LOG_MAX) mem.log.shift(); }
    return e;
  }
  /** A placement in the record: one more piece, the holes it made, the height it left. */
  function record(mem, gid, made, height, now) { const e = logLine(mem, gid, now); e.pieces++; e.holes += made; e.hsum += height; return e; }
  /**
   * The record in figures: { now (the game given), before (every other game together), games }: each { pieces, holes100
   * (holes a hundred pieces), height (the average), topouts }.
   */
  function summary(mem, gid) {
    const log = (mem && Array.isArray(mem.log) ? mem.log : []).filter((e) => e && e.pieces > 0);
    const sum = (list) => {
      const p = list.reduce((a, e) => a + e.pieces, 0);
      return { pieces: p, holes100: p ? 100 * list.reduce((a, e) => a + e.holes, 0) / p : null, height: p ? list.reduce((a, e) => a + e.hsum, 0) / p : null, topouts: list.filter((e) => e.topout).length, games: list.length };
    };
    return { now: sum(log.filter((e) => e.id === gid)), before: sum(log.filter((e) => e.id !== gid)), games: log.length };
  }

  // ---- the Guide's cards ----------------------------------------------------------------------------------------------

  /**
   * Each card's four small boards, read from pictures (rows top first; '#' and the lowercase letters a stack, an
   * uppercase letter the piece being set; '.' empty) and drawn with what the detector finds on them: What it is (the
   * board: the shape marked), How it happens (a piece set: the shape it makes marked), How to avoid (the better spot:
   * nothing made) and How to recover (a piece that undoes it). A good shape's four read What it is, How to make it, What
   * spoils it and How to get it back. Each caption is four words at most. ctx: what else the board needs (the Next,
   * Hold, the speed, the keys pressed). by: what the recovery does ('cleared': the shape gone, 'dig': a hole opened,
   * 'lines': rows cleared, or a shape's id it makes).
   */
  const CARDS = {};

  const LABELS = { risky: ['What it is', 'How it happens', 'How to avoid', 'How to recover'], good: ['What it is', 'How to make it', 'What spoils it', 'How to get it back'] };
  const labelsOf = (id) => (BY[id] && BY[id].group === 'good' ? LABELS.good : LABELS.risky);

  /** A picture read: { W, H, rows (the stack), piece: { id, cells } or null, colors ({ "x,y": colour slot }) }. */
  function readPic(pic) {
    const H = pic.length, W = pic[0].length, rows = new Int32Array(H), colors = {}, cells = [];
    let id = null;
    pic.forEach((line, i) => {
      const y = H - 1 - i;
      [...line].forEach((ch, x) => {
        if (ch === '.' || ch === ' ') return;
        if (/[IOTSZJL]/.test(ch)) { id = ch; cells.push([x, y]); colors[key(x, y)] = Pieces.COLOR[ch]; return; }
        rows[y] |= 1 << x;
        colors[key(x, y)] = ch === '#' ? Pieces.COLOR.GARBAGE : Pieces.COLOR[ch.toUpperCase()] || Pieces.COLOR.GARBAGE;
      });
    });
    return { W, H, rows, colors, piece: id ? { id, cells } : null };
  }

  /**
   * One of a card's diagrams, as the detector sees it: { W, H, rows (the board drawn: the stack and the piece set,
   * before its rows clear), colors, piece, cleared (rows the piece fills), marks ([[x, y]]: what the detector found, as
   * drawn), ghost (where a piece with no spot would go), ok (the detector agrees with the caption: the shape is there,
   * or made; on How to avoid it is not made, or for a good shape it is spoiled; on How to recover the recovery is
   * made), cap, ctx }. which: 'what', 'happens', 'avoid', 'recover'.
   */
  function diagram(cardId, which) {
    const card = CARDS[cardId], d = card && card[which];
    if (!d) return null;
    const p = readPic(d.pic), ctx = Object.assign({}, card.ctx || {}, d.ctx || {}), good = BY[cardId].group === 'good';
    const out = { W: p.W, H: p.H, colors: p.colors, piece: p.piece, cleared: [], marks: [], ghost: null, ok: false, cap: d.cap, ctx, which };
    const drawn = Int32Array.from(p.rows);
    if (p.piece) for (const [x, y] of p.piece.cells) drawn[y] |= 1 << x;
    out.rows = drawn;
    const shapeB = () => shapesOf(analyze(p.rows, p.W, p.H), Object.assign({}, ctx, { visible: ctx.visibleBefore || ctx.visible }))[cardId];
    if (!p.piece) {
      // The board alone: the shape on it.
      const sh = shapeB();
      out.ok = !!sh && which !== 'avoid';
      out.marks = sh ? sh.cells : [];
      return out;
    }
    const lk = look(Object.assign({ W: p.W, H: p.H, before: p.rows, cells: p.piece.cells, id: p.piece.id }, ctx));
    out.cleared = lk.cleared;
    const mine = (e) => e.id === cardId && e.kind !== 'cleared';
    const e = lk.events.find(mine);
    if (which === 'what' || which === 'happens') { out.ok = !!e; out.event = e || null; }
    else if (which === 'avoid') {
      // A good shape spoiled: it was there and is gone (an event's own: not made); a risky one: not made.
      out.ok = good && BY[cardId].sim === 'present' ? !!shapeB() && !lk.shapes[cardId] : !e;
      return out;
    } else {
      const by = card.by || (good ? cardId : 'cleared');
      // (by: 'lines', 'room' (a piece's spot given back), 'none' (nothing made: the habit undone), 'cleared' or
      // 'cleared:<id>' (the shape gone), or the id of what the recovery makes.)
      const gone = (id) => lk.events.find((x) => x.id === id && x.kind === 'cleared') || (shapesOf(analyze(p.rows, p.W, p.H), ctx)[id] && !lk.shapes[id] ? { id, mid: [] } : null);
      const r = by === 'lines' ? (lk.lines ? { id: 'lines', mid: [] } : null)
        : by === 'none' ? (e ? null : { id: 'none', mid: [] })
        : by.startsWith('cleared') ? gone(by.slice(8) || cardId)
        : by === 'room' ? lk.events.find((x) => x.id === 'spot' && x.kind === 'cleared')
        : lk.events.find((x) => x.id === by && x.kind !== 'cleared');
      out.ok = !!r;
      out.event = r || null;
      out.marks = r && r.mid ? r.mid : [];
      return out;
    }
    out.marks = e ? e.mid || [] : [];
    out.ghost = e && e.ghost ? e.ghost : null;
    return out;
  }

  /** The cards in the Guide's order, by group: [[group, name, [id]]] (a dropped or merged shape has no card of its own). */
  function cardsByGroup() {
    return GROUPS.map(([g, name]) => [g, name, SHAPES.filter((s) => s.group === g && CARDS[s.id] && cardOf(s.id) === s.id).map((s) => s.id)]);
  }
  /** The card a shape's note links to: its own, or the one it was merged into (COSTS' verdict), or null if dropped. */
  function cardOf(id) {
    const c = COSTS[id], v = c && c.verdict;
    if (v === 'drop') return null;
    if (v && v.startsWith('merge:')) return v.slice(6);
    return CARDS[id] ? id : null;
  }
  /** A shape's notes are on: not dropped. */
  const noted = (id) => !(COSTS[id] && COSTS[id].verdict === 'drop');

  /**
   * The measured effect of each shape (scripts/patterns-sim.cjs writes it here): headless games of the Watch bot's eye,
   * the same seeds played twice, once forcing the shape whenever it can and once avoiding it. { id: { lines (lines a
   * hundred pieces, avoided less forced: what it costs, or for a good shape what seeking it gains), each (the same for
   * one time made), ci ([lo, hi]: 95%), topouts ([forced, avoided] of the games), n (games a side), verdict ('keep',
   * 'merge:<id>', 'drop') } }.
   */
  let COSTS = {};
  // COSTS:begin
  COSTS = {
    hole: {"lines":0.14,"ci":[-0.1,0.38],"each":0.01,"height":-0.1,"hsig":false,"score":23.38,"ssig":true,"lsig":false,"topouts":[0,0],"made":[25,25],"n":32,"verdict":"keep"},
    overhang: {"lines":0.23,"ci":[-0.06,0.51],"each":0.02,"height":0.56,"hsig":true,"score":18.27,"ssig":true,"lsig":false,"topouts":[0,0],"made":[25,25],"n":32,"verdict":"keep"},
    pit: {"lines":4.31,"ci":[1.4,7.23],"each":0.59,"height":3.04,"hsig":true,"score":37.27,"ssig":true,"lsig":true,"topouts":[5,0],"made":[18.38,19.94],"n":32,"verdict":"keep"},
    twoPits: {"lines":3.81,"ci":[1.55,6.08],"each":0.52,"height":2.88,"hsig":true,"score":41.25,"ssig":true,"lsig":true,"topouts":[6,0],"made":[18.19,19.69],"n":32,"verdict":"keep"},
    cliff: {"lines":0.43,"ci":[0.1,0.75],"each":0.04,"height":0.76,"hsig":true,"score":7.59,"ssig":false,"lsig":true,"topouts":[0,0],"made":[25,25],"n":32,"verdict":"keep"},
    rough: {"lines":0.41,"ci":[0.11,0.72],"each":0.05,"height":1.81,"hsig":true,"score":12.51,"ssig":true,"lsig":true,"topouts":[0,0],"made":[21.72,20.81],"n":32,"verdict":"keep"},
    noSZ: {"lines":0.36,"ci":[-0.03,0.76],"each":0.05,"height":0.85,"hsig":true,"score":18.26,"ssig":true,"lsig":false,"topouts":[0,0],"made":[17.09,18.22],"n":32,"verdict":"keep"},
    coveredWell: {"lines":0.25,"ci":[-0.03,0.53],"each":0.03,"height":0.95,"hsig":true,"score":31.24,"ssig":true,"lsig":false,"topouts":[0,0],"made":[24.94,24.94],"n":32,"verdict":"keep"},
    high: {"lines":0.18,"ci":[0.03,0.32],"each":0.5,"height":0.22,"hsig":true,"score":0.37,"ssig":false,"lsig":true,"topouts":[0,0],"made":[0.88,0.53],"n":32,"verdict":"keep"},
    spot: {"lines":0.26,"ci":[-0.09,0.61],"each":0.03,"height":0.97,"hsig":true,"score":18.03,"ssig":true,"lsig":false,"topouts":[0,0],"made":[23.91,24.03],"n":32,"verdict":"keep"},
    nextPlan: {"lines":-0.16,"ci":[-0.42,0.1],"each":-0.02,"height":0.7,"hsig":true,"score":12.1,"ssig":true,"lsig":false,"topouts":[0,0],"made":[17.97,17.47],"n":32,"verdict":"keep"},
    flat: {"lines":-0.14,"ci":[-0.41,0.13],"each":-0.03,"height":0.07,"hsig":false,"score":-8.75,"ssig":true,"lsig":false,"topouts":[0,0],"made":[10.28,9.94],"n":32,"verdict":"drop"},
    slope: {"lines":-0.07,"ci":[-0.3,0.15],"each":-0.02,"height":-0.1,"hsig":false,"score":-7.81,"ssig":true,"lsig":false,"topouts":[0,0],"made":[8.97,9.13],"n":32,"verdict":"drop"},
    steps: {"lines":0.7,"ci":[-0.4,1.8],"each":0.07,"height":0.56,"hsig":true,"score":20.47,"ssig":true,"lsig":false,"topouts":[1,0],"made":[23.56,23.34],"n":32,"verdict":"keep"},
    oFlat: {"lines":0.05,"ci":[-0.17,0.27],"each":0.03,"height":0.15,"hsig":true,"score":5.89,"ssig":false,"lsig":false,"topouts":[0,0],"made":[4.53,5.19],"n":32,"verdict":"drop"},
    cleanWell: {"lines":-0.14,"ci":[-0.43,0.15],"each":-0.04,"height":-0.22,"hsig":true,"score":9.25,"ssig":true,"lsig":false,"topouts":[0,0],"made":[9,8.59],"n":32,"verdict":"keep"},
    twistSlot: {"lines":0.01,"ci":[-0.24,0.26],"each":0,"height":-0.15,"hsig":false,"score":-7.09,"ssig":false,"lsig":false,"topouts":[0,0],"made":[12.09,11.44],"n":32,"verdict":"drop"},
    wellEdge: {"lines":-0.33,"ci":[-0.56,-0.09],"each":-0.04,"height":-0.58,"hsig":true,"score":-3.79,"ssig":false,"lsig":true,"topouts":[0,0],"made":[20.63,20.97],"n":32,"verdict":"drop"},
    burn: {"lines":0,"ci":[-0.09,0.09],"each":null,"height":0.01,"hsig":false,"score":1.98,"ssig":false,"lsig":false,"topouts":[0,0],"made":[0.19,0.22],"n":32,"verdict":"merge:high"},
    bag: {"lines":-0.1,"ci":[-0.42,0.22],"each":-0.02,"height":-0.68,"hsig":true,"score":10.59,"ssig":true,"lsig":false,"topouts":[0,0],"made":[14.44,14.31],"n":32,"verdict":"keep"},
    holdGood: {"lines":-0.2,"ci":[-0.44,0.04],"each":-0.16,"height":-0.02,"hsig":false,"score":2.95,"ssig":false,"lsig":false,"topouts":[0,0],"made":[3.16,3.38],"n":32,"verdict":"merge:holdNoPlan"},
    dig: {"lines":0,"ci":[-0.15,0.15],"each":0,"height":0.02,"hsig":false,"score":2.38,"ssig":false,"lsig":false,"topouts":[0,0],"made":[0.56,0.5],"n":32,"verdict":"merge:hole"},
    streak: {"lines":-0.03,"ci":[-0.14,0.09],"each":null,"height":-0.01,"hsig":false,"score":-0.07,"ssig":false,"lsig":false,"topouts":[0,0],"made":[0.34,0.28],"n":32,"verdict":"drop"},
    combo: {"lines":0.16,"ci":[-0.08,0.41],"each":0.36,"height":0.16,"hsig":true,"score":-1.06,"ssig":false,"lsig":false,"topouts":[0,0],"made":[1.13,0.94],"n":32,"verdict":"drop"},
    spotless: {"lines":0,"ci":[0,0],"each":null,"height":0,"hsig":false,"score":0,"ssig":false,"lsig":false,"topouts":[0,0],"made":[0,0],"n":32,"verdict":"drop"},
    szFlat: {"lines":-0.13,"ci":[-0.35,0.1],"each":-0.01,"height":0.28,"hsig":true,"score":20.45,"ssig":true,"lsig":false,"topouts":[0,0],"made":[22.44,22.94],"n":32,"verdict":"keep"},
    ljPit: {"lines":-0.1,"ci":[-0.37,0.17],"each":-0.01,"height":0,"hsig":false,"score":28.23,"ssig":true,"lsig":false,"topouts":[0,0],"made":[18.81,19.53],"n":32,"verdict":"keep"},
    oUneven: {"lines":0.16,"ci":[-0.11,0.44],"each":0.02,"height":-0.09,"hsig":false,"score":21.83,"ssig":true,"lsig":false,"topouts":[0,0],"made":[19.13,18.88],"n":32,"verdict":"keep"},
    wellFill: {"lines":0.53,"ci":[0.18,0.87],"each":0.06,"height":1.01,"hsig":true,"score":21.1,"ssig":true,"lsig":true,"topouts":[0,0],"made":[20.53,19.59],"n":32,"verdict":"keep"},
    holdNoPlan: {"lines":0.03,"ci":[-0.21,0.26],"each":0,"height":0.07,"hsig":false,"score":21.02,"ssig":true,"lsig":false,"topouts":[0,0],"made":[25,25],"n":32,"verdict":"keep"},
    parity: {"lines":-0.01,"ci":[-0.28,0.25],"each":0,"height":0.18,"hsig":true,"score":19.78,"ssig":true,"lsig":false,"topouts":[0,0],"made":[15.03,16.22],"n":32,"verdict":"keep"},
    finesse: {"lines":-0.05,"ci":[-0.11,0.01],"each":0,"height":-0.01,"hsig":false,"score":0.01,"ssig":false,"lsig":false,"topouts":[0,0],"made":[250,0],"n":32,"verdict":"drop"},
    speed: {"lines":0.27,"ci":[0.03,0.52],"each":0.12,"height":0.51,"hsig":true,"score":15.01,"ssig":true,"lsig":true,"topouts":[0,0],"made":[5.5,5.75],"n":32,"verdict":"keep"},
  };
  // COSTS:end

  /**
   * A card's cost line, from COSTS: what the measured games found, where it was clear (its interval clear of 0), as
   * made once in ten pieces against not: "Score −22% · stack +0.8 rows", "+3.5 lines a 100 pieces", "top outs 5 vs 0"
   * (for a good shape, what it gains); '' when dropped or nothing was clear.
   */
  function costLine(id) {
    const c = COSTS[id];
    if (!c || c.verdict === 'drop') return '';
    const good = BY[id] && BY[id].group === 'good', sign = (v) => (v > 0 ? '+' : '−') + Math.abs(v);
    const one = (v) => Math.round(v * 10) / 10, parts = [];
    if (c.ssig && c.score >= 5) parts.push('Score ' + sign(Math.round(good ? c.score : -c.score)) + '%');
    if (c.hsig && c.height >= 0.2) parts.push('stack ' + sign(one(good ? -c.height : c.height)) + ' rows');
    if (c.lsig && c.lines >= 0.3) parts.push(sign(one(good ? c.lines : -c.lines)) + ' lines a 100 pieces');
    const [tf, ta] = c.topouts || [0, 0];
    if (Math.abs(tf - ta) >= 3) parts.push('top outs ' + (good ? ta + ' vs ' + tf : tf + ' vs ' + ta));
    if (!parts.length) return '';
    const out = parts.join(' · ');
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  L.Patterns = {
    IDS, NOTES, NOTE_IDS, NOTE_NAMES, DETAIL_IDS, DETAIL_NAMES, STYLE_IDS, STYLE_NAMES, CURVE, DEFAULTS, SHAPES, BY, GROUPS, CARDS, LABELS,
    get COSTS() { return COSTS; }, set COSTS(v) { COSTS = v || {}; },
    settingsOf, analyze, fitsOf, dropsAll, leastPoor, slotOf, parityOf, shapesOf, look, stageOf, pace, logLine, record, summary, readPic, diagram, labelsOf, cardsByGroup, cardOf, noted, costLine,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
