#!/usr/bin/env node
// Lull's economy against models of play: placement bots on the real engine (Free Play at several sizes, Classic, the
// Golden Piece), a model of puzzle play, the daily gift at shop prices, and a career that
// spends what it earns. Every price and pay is read from the game; the assumptions about players (how fast
// they place, how long they play, how often they collect) are in MODEL, and nowhere else.
//   node Lull/scripts/econ-test.cjs     (test.cjs runs it too)
'use strict';
const assert = require('assert');

// ---- the assumptions ------------------------------------------------------------------------------------------------
//
// Pieces a minute: Relaxed has no clock, so a casual player places about one piece every three seconds; Classic is
// faster, and its games have gaps (the uptime). A casual Classic game tops out around 100 lines, a skilled one around
// 150, an expert's at 200 (all quads). Puzzles: per difficulty, the first attempt's time t1 and each later one's tr
// (s), a failed attempt taking TF of it, the chance to solve on the first attempt p1 and on each later one pn, and u the
// share of first-try solves that used an Undo or a hint (not clean); after GIVEUP attempts the player skips. The career:
// hours a day, the share of play in each mode, what a day's power-ups cost, the Dailies solved.
const MODEL = {
  SEEDS: [7919, 15838, 23757],
  PIECES: 3000,
  relaxedPPM: { casual: 20, skilled: 30, expert: 40 },
  classicPPM: { casual: 35, skilled: 55, expert: 85 },
  classicUptime: 0.85,
  classicCap: { casual: 100, skilled: 150, expert: 200 },
  classicGames: 20,
  puzzle: {
    TF: 0.8, GIVEUP: 8,
    casual:  { E: { t1: 35, tr: 22, p1: 0.70, pn: 0.65, u: 0.30 }, M: { t1: 70, tr: 45, p1: 0.45, pn: 0.55, u: 0.35 }, H: { t1: 130, tr: 80, p1: 0.25, pn: 0.40, u: 0.40 } },
    typical: { E: { t1: 25, tr: 15, p1: 0.85, pn: 0.75, u: 0.15 }, M: { t1: 50, tr: 30, p1: 0.65, pn: 0.65, u: 0.20 }, H: { t1: 90, tr: 55, p1: 0.45, pn: 0.55, u: 0.25 } },
    strong:  { E: { t1: 15, tr: 10, p1: 0.95, pn: 0.85, u: 0.05 }, M: { t1: 30, tr: 18, p1: 0.85, pn: 0.75, u: 0.10 }, H: { t1: 55, tr: 35, p1: 0.70, pn: 0.65, u: 0.15 } },
  },
  career: {
    casual:  { hoursPerDay: 0.5, mix: { relaxed: 0.8, puzzle: 0.1, classic: 0.1 }, puzzle: 'casual', powerUpsPerHour: 0, dailies: [] },
    skilled: { hoursPerDay: 1, mix: { relaxed: 0.6, puzzle: 0.1, classic: 0.3 }, puzzle: 'strong', powerUpsPerHour: 30, dailies: ['M'] },
    puzzle:  { hoursPerDay: 0.75, mix: { relaxed: 0.2, puzzle: 0.8, classic: 0 }, puzzle: 'typical', powerUpsPerHour: 10, dailies: ['E', 'M'] },
  },
  // Hours of play (all modes, cumulative) at which each profile [casual, skilled, puzzle] earns each achievement; null
  // not within the career, 'Dn' on day n. Judgement, informed by the bots (quad and streak rates) and the mode mix.
  // Lifetime ones are computed as the career goes.
  achievedAt: {
    quad: [2, 0.1, 3], tsd: [8, 0.5, 15], combo5: [20, 3, null], b2b3: [15, 0.2, 25], lines150: [0.5, 0.2, 3],
    toolbox: [6, 4, 15], score50k: [6, 0.4, 20], tst: [null, 3, null], pc: [40, 5, 60], mini2: [null, 20, null],
    combo10: [null, 15, null], golden_ts: [null, 20, null], pace33: [null, 1, null], quads4: [80, 0.5, null],
    lines500: [2, 0.8, 10], b2b8: [null, 1, null], tst_b2b: [null, 8, null], old_growth: ['D30', 'D30', 'D30'],
    pc_open: [null, 40, null], it_showman: [25, 10, null], pc3: [null, 25, null], pc_b2b: [null, 50, null],
    all_items: [30, 15, 50], it_sweep: [null, 40, null], score250k: [60, 2, null], sb_combos: [null, 80, null],
    twist100: [null, 40, null], clean40: [null, null, null],
    chain20: [null, 1, null], pace67: [null, null, null], pc_twist: [null, null, null], quads10: [null, 1, null],
    pc10: [null, null, null], tst10: [null, 60, null], b2b20: [null, 2, null], golden20: [null, 3, null],
    million: [null, 15, null], purist: [60, 5, null], lines5000: [15, 10, 70],
    cl_fourq: [5, 0.5, null], cl_l10: [3, 0.3, 30], cl_100k: [15, 0.5, null], cl_l15: [null, 1, null],
    cl_300k: [null, 2, null], cl_t25: [null, 5, null], cl_l20: [null, null, null], cl_1m: [null, null, null],
    cl_games100: [60, 15, null], cl_tenq: [null, 1, null], cl_nohold: [null, 3, null], cl_pc: [null, 25, null],
    cl_tst: [null, 10, null], cl_dash: [null, 20, null], cl_twist10: [null, 25, null], cl_quads4: [null, 1, null],
    cl_b2b8: [null, 1.5, null], cl_combo10: [null, 30, null], cl_allquads: [null, 5, null],
    cl_dash50: [null, null, null], cl_nohold20: [null, null, null], cl_combo15: [null, null, null], cl_l25: [null, null, null],
    pz_hard: [15, 3, 0.5], pz_hold: [6, 5, 1], pz_daily: ['D14', 'D10', 'D7'], pz_streak: [8, 5, 1], pz_wild: [null, 40, 10],
    pz_hard25: [null, 30, 4], pz_500: [100, 150, 12], pz_d100: [null, 'D150', 'D100'], pz_h50: [null, null, 60],
    pz_clean: [null, 5, 2], pz_daily3: [null, 'D10', 'D1'], pz_spin: [null, null, 15], pz_fast: [null, 25, 10],
    pz_wild3: [null, 60, 12], pz_first20: [null, null, 25], pz_hfirst25: [null, 60, 8], pz_h100: [null, null, 14],
    pz_wildH: [null, null, 50], pz_daily30: [null, null, 'D30'], pz_first100: [null, null, 120],
    lu_triathlon: [25, 2, 60],
  },
};

// ---- placement bots on the real engine ----------------------------------------------------------------------------
//
// Hard drops from above (no tucks or spins). Casual: a Dellacherie-style stacker that clears whatever it can. Skilled:
// stacks with the right column open, keeps an I in hold, and clears only quads until the stack gets tall.

function bots(L) {
  const { Pieces, Game } = L;
  function evalBoard(cells, w, h, wellCol) {
    const heights = new Array(w).fill(0);
    let holes = 0, rowT = 0, colT = 0, wells = 0, holeDepth = 0;
    for (let x = 0; x < w; x++) {
      let top = 0;
      for (let y = h - 1; y >= 0; y--) if (cells[y * w + x]) { top = y + 1; break; }
      heights[x] = top;
      let covered = 0;
      for (let y = top - 1; y >= 0; y--) { if (!cells[y * w + x]) { holes++; holeDepth += covered; } else covered++; }
      let prev = 1;
      for (let y = 0; y < h; y++) { const f = cells[y * w + x] ? 1 : 0; if (f !== prev) colT++; prev = f; }
    }
    for (let y = 0; y < h; y++) {
      let prev = 1, any = false;
      for (let x = 0; x < w; x++) { const f = cells[y * w + x] ? 1 : 0; if (f) any = true; if (f !== prev) rowT++; prev = f; }
      if (prev !== 1) rowT++;
      if (!any) break;
    }
    for (let x = 0; x < w; x++) {
      if (x === wellCol) continue;
      const l = x === 0 || x - 1 === wellCol ? (x === 0 ? h : heights[x - 1]) : heights[x - 1];
      const r = x === w - 1 || x + 1 === wellCol ? (x === w - 1 ? h : heights[x + 1]) : heights[x + 1];
      const d = Math.min(l, r) - heights[x];
      if (d > 0) wells += d * (d + 1) / 2;
    }
    let bump = 0, agg = 0, maxH = 0;
    for (let x = 0; x < w; x++) { if (x !== wellCol) { agg += heights[x]; maxH = Math.max(maxH, heights[x]); } }
    for (let x = 0; x < w - 1; x++) { if (x === wellCol || x + 1 === wellCol) continue; bump += Math.abs(heights[x] - heights[x + 1]); }
    return { heights, holes, rowT, colT, wells, bump, agg, maxH, holeDepth };
  }
  /** Every hard-drop placement of type `id` on board b. */
  function placements(b, id) {
    const t = Pieces.TYPES[id], out = [], w = b.w, h = b.h, seen = new Set();
    for (let rot = 0; rot < 4; rot++) {
      const shape = t.rots[rot], bd = t.rotBounds[rot];
      const key = shape.map(([x, y]) => (x - bd.minX) + ',' + (y - bd.minY)).sort().join(';');
      for (let x = -bd.minX; x + bd.maxX < w; x++) {
        const k2 = key + '@' + (x + bd.minX);
        if (seen.has(k2)) continue;
        seen.add(k2);
        let y = h - 1 - bd.maxY;
        if (!b.fits(shape, x, y)) continue;
        while (b.fits(shape, x, y - 1)) y--;
        const c = b.cells.slice();
        for (const [cx, cy] of shape) c[(y + cy) * w + x + cx] = 1;
        let lines = 0;
        const keep = [];
        for (let yy = 0; yy < h; yy++) { let full = true; for (let xx = 0; xx < w; xx++) if (!c[yy * w + xx]) { full = false; break; } if (full) lines++; else keep.push(yy); }
        let nc = c;
        if (lines) { nc = new Uint16Array(w * h); keep.forEach((yy, i) => { for (let xx = 0; xx < w; xx++) nc[i * w + xx] = c[yy * w + xx]; }); }
        out.push({ id, rot, x, y, cells: nc, lines, landing: y + (bd.minY + bd.maxY) / 2, cols: new Set(shape.map(([cx]) => x + cx)) });
      }
    }
    return out;
  }
  const PROFILES = {
    casual: { well: -1, noise: 0.1, useHold: false },
    skilled: { well: 9, noise: 0, useHold: true, W: { agg: 0.51, holes: 3, bump: 0.5, hd: 0.3, quad: 20, other: 10, well: 10, danger: 10 } },
  };
  function score(p, prof, b) {
    const f = evalBoard(p.cells, b.w, b.h, prof.well);
    if (prof.well < 0) return -4.5 * p.landing - 3.2 * f.rowT - 9.35 * f.colT - 7.9 * f.holes - 3.4 * f.wells + 3.4 * p.lines;
    const W = prof.W, danger = f.maxH >= W.danger * b.h / 20;
    let s = -W.agg * f.agg - W.holes * f.holes - W.bump * f.bump - W.hd * f.holeDepth;
    if (p.lines >= 4) s += W.quad;
    else if (p.lines > 0) s += danger ? 2 * p.lines : -W.other;
    if (p.cols.has(prof.well) && p.lines < 4 && !danger) s -= W.well;
    return s;
  }
  /** Plays n pieces; onLock(result, game) after each (a top-out starts the board over and is told as { topout }). */
  function play(profName, n, seed, onLock, gameOpts) {
    const prof = Object.assign({}, PROFILES[profName]);
    const g = new Game(Object.assign({ mode: 'free', seed }, gameOpts || {}));
    const W = g.w, H = g.h;
    if (prof.well >= 0) prof.well = W - 1;
    const rnd = new L.RNG('bot:' + seed);
    for (let i = 0; i < n; i++) {
      if (g.over || !g.piece) { g.board = new L.Board(W, H); g.over = false; g.spawnNext(); if (onLock) onLock({ topout: true }, g); continue; }
      const cur = g.piece.type.id, options = placements(g.board, cur).map((p) => ({ p, hold: false }));
      if (prof.useHold) {
        const alt = g.hold ? g.hold.id : g.queue[0].id;
        if (alt !== cur && Pieces.TYPES[alt]) for (const p of placements(g.board, alt)) options.push({ p, hold: true });
      }
      if (!options.length) { g.over = true; i--; continue; }
      for (const o of options) o.s = score(o.p, prof, g.board) + (o.hold ? -0.01 : 0);
      options.sort((a, b) => b.s - a.s);
      let pick = options[0];
      if (prof.noise && rnd.next() < prof.noise) pick = options[Math.min(options.length - 1, 1 + Math.floor(rnd.next() * 3))];
      if (pick.hold && !g.holdPiece()) pick = options.find((o) => !o.hold) || options[0];
      const pc = g.piece;
      if (!pc || pc.type.id !== pick.p.id) { i--; continue; }
      pc.rot = pick.p.rot; pc.x = pick.p.x; pc.y = H - 1 - pc.type.rotBounds[pick.p.rot].maxY; pc.lastRot = false;
      const r = g.drop();
      if (!r) { g.over = true; continue; }
      if (onLock) onLock(r, g);
    }
    return g;
  }
  return { play };
}

module.exports = function econTests(test, L) {
  const { Chain, Luck, Pay, Library, Gifts, Puzzles, ITEMS, ITEM_ORDER } = L;
  const { play } = bots(L);
  const round = (x, d) => Math.round(x * Math.pow(10, d)) / Math.pow(10, d);
  console.log('economy (models of play)');

  // Free Play: what a bot banks per piece (Pay, the real thing), and what a Golden Piece bought at a streak of nine or
  // more would have added (a shadow state, so gold never changes what the board pays).
  const relaxed = {};
  // Beside what it banks, each run prices the same clears on a Standard board (`std`: every clear as Pay pays it 10 wide,
  // at the streak it had there, in pieces scaled by the cells it took, w/10), so play and pay can be told apart: `std`
  // per piece is how well the bot played at that size, in Standard terms.
  const relaxedRun = (prof, w, h, goldAt) => {
    const key = prof + ' ' + w + 'x' + h;
    if (relaxed[key]) return relaxed[key];
    let pieces = 0, pay = 0, extra = 0, bought = 0, std = 0, clears = 0, quads = 0;
    for (const seed of MODEL.SEEDS) {
      let shadow = 0;
      play(prof, MODEL.PIECES, seed, (r, g) => {
        if (r.topout) return;
        pieces++;
        const s = g.s;
        s.mult = Pay.mult(g);
        if (r.lines) {
          const plain = Pay.clear(s, r, g.w).pay;
          pay += plain;
          std += Pay.clear({ mult: Chain.mult(Chain.streak(g)) }, r, 10).pay;
          clears++;
          if (r.lines >= 4) quads++;
          if (goldAt != null && shadow > 0) { const sh = { mult: s.mult, gold: shadow }; extra += Pay.clear(sh, r, g.w).pay - plain; shadow = sh.gold; }
        }
        if (goldAt != null && !(shadow > 0) && Chain.streak(g) >= goldAt) { shadow = Luck.GOLD_CLEARS; bought++; }
      }, { w, h });
    }
    return (relaxed[key] = { pieces, payPP: pay / pieces, stdPP: std / (pieces * 10 / w), quadShare: quads / clears, goldReturn: bought ? extra / (bought * ITEMS.golden.price) : 0, bought });
  };
  // An expert: every clear a quad, never broken, on a Standard board.
  const expertRelaxedPP = (() => { let p = 0; for (let k = 1; k <= 40; k++) p += Pay.clear({ mult: Chain.mult(k) }, { lines: 4 }, 10).pay; return p / (40 * 10); })();

  // Classic: a game is played to the profile's line cap (or its top-out); banks Library.bank(lines × rate × mult).
  const classicRun = (prof) => {
    let pieces = 0, bank = 0;
    for (let gi = 0; gi < MODEL.classicGames; gi++) {
      let lines = 0;
      try {
        play(prof, 100000, 1000 + gi, (r, g) => {
          if (r.topout) throw 'end';
          pieces++;
          if (r.lines) { bank += Library.bank(r.lines * Chain.CLASSIC.rate * Chain.mult(Chain.streak(g), 'classic')); lines += r.lines; }
          if (lines >= MODEL.classicCap[prof]) throw 'end';
        }, { mode: 'classic', freeHold: false, findRoom: false });
      } catch (e) { if (e !== 'end') throw e; }
    }
    return bank / pieces;
  };
  const expertClassicPP = (() => { let b = 0; const n = MODEL.classicCap.expert / 4; for (let k = 1; k <= n; k++) b += Library.bank(4 * Chain.CLASSIC.rate * Chain.mult(k, 'classic')); return b / (n * 10); })();

  // Puzzles: the expected pay and time of one puzzle, attempt by attempt (Puzzles.pay, the real thing).
  const puzzleHourly = (profile, d) => {
    const q = MODEL.puzzle[profile][d];
    let pay = 0, time = 0, reach = 1;
    for (let a = 1; a <= MODEL.puzzle.GIVEUP; a++) {
      const ps = a === 1 ? q.p1 : q.pn, t = a === 1 ? q.t1 : q.tr;
      const got = a === 1 ? (1 - q.u) * Puzzles.pay(d, { try: 1 }).pay + q.u * Puzzles.pay(d, { try: 1, undos: 1 }).pay : Puzzles.pay(d, { try: a }).pay;
      pay += reach * ps * got;
      time += reach * (ps * t + (1 - ps) * t * MODEL.puzzle.TF);
      reach *= 1 - ps;
    }
    return pay / time * 3600;
  };

  const R = {};
  const rates = () => {
    if (R.done) return R;
    const cas = relaxedRun('casual', 10, 20), sk = relaxedRun('skilled', 10, 20, 9);
    R.relaxed = { casual: cas.payPP * MODEL.relaxedPPM.casual * 60, skilled: sk.payPP * MODEL.relaxedPPM.skilled * 60, expert: expertRelaxedPP * MODEL.relaxedPPM.expert * 60 };
    const perHourClassic = (pp, p) => pp * MODEL.classicPPM[p] * MODEL.classicUptime * 60;
    R.classicPP = { casual: classicRun('casual'), skilled: classicRun('skilled'), expert: expertClassicPP };
    R.classic = { casual: perHourClassic(R.classicPP.casual, 'casual'), skilled: perHourClassic(R.classicPP.skilled, 'skilled'), expert: perHourClassic(expertClassicPP, 'expert') };
    R.puzzle = {};
    for (const p of ['casual', 'typical', 'strong']) R.puzzle[p] = Object.fromEntries(['E', 'M', 'H'].map((d) => [d, puzzleHourly(p, d)]));
    R.done = true;
    return R;
  };

  test('model: Relaxed pays about 460 an hour casually, 935 skilled (bots on the real engine)', () => {
    const r = rates();
    console.log('       lines an hour · Relaxed ' + ['casual', 'skilled', 'expert'].map((p) => p + ' ' + Math.round(r.relaxed[p])).join(', ') +
      ' · Classic ' + ['casual', 'skilled', 'expert'].map((p) => p + ' ' + Math.round(r.classic[p])).join(', ') +
      ' · Puzzles ' + Object.entries(r.puzzle).map(([p, v]) => p + ' ' + ['E', 'M', 'H'].map((d) => Math.round(v[d])).join('/')).join(', '));
    assert(r.relaxed.casual > 350 && r.relaxed.casual < 600, 'casual ' + r.relaxed.casual);
    assert(r.relaxed.skilled > r.relaxed.casual && r.relaxed.expert > r.relaxed.skilled);
  });
  // Sizes: the four presets' neighbours and the widths just over Standard, where a quad costs only a little more.
  const SIZES = [[6, 12], [8, 30], [11, 22], [12, 20], [12, 24], [13, 26], [16, 16], [20, 40]];
  test('board sizes: for the same play no board pays more per piece than Standard (every clear priced 10 wide too)', () => {
    for (const prof of ['casual', 'skilled']) {
      for (const [w, h] of SIZES) {
        const r = relaxedRun(prof, w, h);
        assert(r.payPP <= r.stdPP + 1e-9, prof + ' ' + w + 'x' + h + ': ' + r.payPP.toFixed(4) + ' a piece, the same clears 10 wide ' + r.stdPP.toFixed(4));
      }
    }
  });
  // The bots themselves play better on some sizes than on Standard. Casually no size pays more than Standard (within
  // 5%); skilled, the same holds wherever the bot's quads come about as often as on Standard. On 11 and 12 wide it
  // sets up quads far more easily (seven or eight clears in ten against four), and so earns more a piece: the tolerance
  // there is stated (1.45×), and the test above shows the pay is not why.
  test('board sizes: casually no board pays more per piece than Standard (within 5%); skilled, within 5% but on 11–12 wide (the bot\'s easier quads: 1.45×)', () => {
    const cas = relaxedRun('casual', 10, 20), sk = relaxedRun('skilled', 10, 20), rows = [];
    for (const [w, h] of SIZES) {
      const c = relaxedRun('casual', w, h), k = relaxedRun('skilled', w, h), easier = w === 11 || w === 12;
      rows.push(w + 'x' + h + ' ' + (c.payPP / cas.payPP).toFixed(2) + '/' + (k.payPP / sk.payPP).toFixed(2) + (easier ? ' (quads ' + k.quadShare.toFixed(2) + ')' : ''));
      assert(c.payPP <= 1.05 * cas.payPP, 'casual ' + w + 'x' + h + ': ' + c.payPP.toFixed(4) + ' a piece vs ' + cas.payPP.toFixed(4));
      if (!easier) assert(k.payPP <= 1.05 * sk.payPP, 'skilled ' + w + 'x' + h + ': ' + k.payPP.toFixed(4) + ' a piece vs ' + sk.payPP.toFixed(4));
      else {
        assert(k.payPP <= 1.45 * sk.payPP, 'skilled ' + w + 'x' + h + ': ' + (k.payPP / sk.payPP).toFixed(3) + '× Standard');
        // The excess is the bot's play: its quads come far more often there than on Standard.
        if (k.payPP > 1.05 * sk.payPP) assert(k.quadShare >= 1.4 * sk.quadShare, 'skilled ' + w + 'x' + h + ' quads ' + k.quadShare.toFixed(2) + ' vs ' + sk.quadShare.toFixed(2));
      }
    }
    console.log('       pay a piece against Standard, casual/skilled: ' + rows.join(', ') + ' (Standard quads ' + sk.quadShare.toFixed(2) + ')');
  });
  test('Golden Piece: a skilled player buying it at a streak of nine or more gets back less than its price', () => {
    const sk = relaxedRun('skilled', 10, 20, 9);
    assert(sk.bought > 20, 'bought ' + sk.bought);
    assert(sk.goldReturn < 1, 'returns ' + sk.goldReturn.toFixed(3) + '× its price');
    console.log('       gold returns ' + sk.goldReturn.toFixed(3) + '× (' + sk.bought + ' bought)');
  });
  test('Classic earns no faster than Relaxed: casual 0.75–1.05×, skilled and expert at most 1×, skilled at most 0.35 a piece', () => {
    const r = rates();
    const c = r.classic.casual / r.relaxed.casual;
    assert(c >= 0.75 && c <= 1.05, 'casual ' + c.toFixed(3));
    assert(r.classic.skilled <= r.relaxed.skilled, 'skilled ' + (r.classic.skilled / r.relaxed.skilled).toFixed(3));
    assert(r.classic.expert <= r.relaxed.expert, 'expert ' + (r.classic.expert / r.relaxed.expert).toFixed(3));
    assert(r.classicPP.skilled <= 0.35, 'skilled Classic ' + r.classicPP.skilled.toFixed(3) + ' a piece');
  });
  test('Puzzles earn about what Relaxed does: typical 0.8–1.25× casual Relaxed on each difficulty, strong at most 1.3× skilled', () => {
    const r = rates();
    for (const d of ['E', 'M', 'H']) {
      const x = r.puzzle.typical[d] / r.relaxed.casual;
      assert(x >= 0.8 && x <= 1.25, 'typical ' + d + ' ' + x.toFixed(3));
      const y = r.puzzle.strong[d] / r.relaxed.skilled;
      assert(y <= 1.3, 'strong ' + d + ' ' + y.toFixed(3));
    }
  });
  test('the daily gift is worth at most a third of an hour of casual play, at shop prices', () => {
    const r = rates(), N = 40000;
    let v = 0;
    for (let i = 0; i < N; i++) {
      for (const id of Gifts.forClaim('value' + (i % 2000), Math.floor(i / 2000))) v += id === 'free-hint' ? Puzzles.hintCost('H', 1) : ITEMS[id].price * L.packOf(id);
    }
    const gift = v / N;
    assert(gift <= r.relaxed.casual / 3, 'a gift is worth ' + gift.toFixed(1));
    const w = ITEM_ORDER.map((id) => Gifts.weight(id)), W = w.reduce((a, b) => a + b, 0);
    const draw = ITEM_ORDER.reduce((a, id, i) => a + w[i] / W * ITEMS[id].price * L.packOf(id), 0);
    console.log('       a gift ' + gift.toFixed(1) + ', one free draw ' + draw.toFixed(2));
  });

  // The factory is shelved for now (Lull/Shelved/factory/): its line and its part in the career went with it.

  // ---- the career ---------------------------------------------------------------------------------------------------
  //
  // Hour by hour (a quarter at a time), a day's hours at once: play pays its hourly rate (less the power-ups it buys),
  // the Dailies pay once a day, achievements pay when MODEL says they come (the Lifetime ones as they happen), and the
  // wallet buys the cheapest cosmetic it can.
  function career(name, maxH) {
    const r = rates(), P = MODEL.career[name], idx = { casual: 0, skilled: 1, puzzle: 2 }[name];
    const A = L.Achievements.LIST, byId = Object.fromEntries(A.map((a) => [a.id, a]));
    const others = A.filter((a) => a.id !== 'lu_half' && a.id !== 'lu_all');
    const fresh = L.defaultState(), need = (id) => byId[id].progress(fresh)[1];
    const forSale = [];
    for (const [k, cat] of Object.entries(L.COSMETICS)) for (const [id, c] of Object.entries(cat)) if (c.price > 0 && !c.reward) forSale.push({ key: k + ':' + id, price: c.price });
    const rate = { relaxed: r.relaxed[name === 'skilled' ? 'skilled' : 'casual'], classic: r.classic[name === 'skilled' ? 'skilled' : 'casual'], puzzle: (r.puzzle[P.puzzle].E + r.puzzle[P.puzzle].M + r.puzzle[P.puzzle].H) / 3 };
    const hourly = Object.entries(P.mix).reduce((a, [m, s]) => a + s * rate[m], 0);
    const dailies = P.dailies.reduce((a, d) => a + Puzzles.pay(d, { try: 1, daily: true }).pay, 0);
    const st = { wallet: 0, earned: { play: 0, achievements: 0, dailies: 0 }, got: {}, owned: new Set(), log: [] };
    const earn = (a, h) => { if (!a || st.got[a.id]) return; st.got[a.id] = h; st.wallet += a.pay; st.earned.achievements += a.pay; };
    const total = () => Object.values(st.earned).reduce((a, b) => a + b, 0);
    const snaps = {};
    let hours = 0, day = 0;
    while (hours < maxH - 1e-9) {
      day++;
      st.wallet += dailies; st.earned.dailies += dailies;
      for (let t = 0; t < P.hoursPerDay - 1e-9 && hours < maxH - 1e-9; t += 0.25) {
        hours += 0.25;
        st.wallet += (hourly - P.powerUpsPerHour) * 0.25; st.earned.play += hourly * 0.25;
        for (const [id, when] of Object.entries(MODEL.achievedAt)) {
          const v = when[idx];
          if (v != null && !st.got[id] && (typeof v === 'string' ? day >= +v.slice(1) : hours >= v)) earn(byId[id], hours);
        }
        const at = (id, ok) => ok && earn(byId[id], hours);
        at('lu_hours10', hours >= 10); at('lu_hours100', hours >= 100); at('lu_days30', day >= 30); at('lu_days100', day >= 100);
        at('lu_100k', total() >= need('lu_100k')); at('lu_1m', total() >= need('lu_1m'));
        at('lu_curator', forSale.every((c) => st.owned.has(c.key)));
        at('lu_half', others.filter((a) => st.got[a.id]).length >= Math.ceil(others.length / 2));
        at('lu_all', others.every((a) => st.got[a.id]));
        for (;;) {
          const pool = [];
          for (const c of forSale) if (!st.owned.has(c.key)) pool.push({ c, cost: c.price });
          pool.sort((a, b) => a.cost - b.cost);
          if (!pool.length || st.wallet < pool[0].cost) break;
          const x = pool[0];
          st.wallet -= x.cost;
          st.owned.add(x.c.key);
          st.log.push([hours, 'cosmetic']);
        }
      }
      for (const s of [5, 10, 50, 200]) if (!snaps[s] && hours >= s - 1e-9) snaps[s] = Object.assign({}, st.earned, { total: total() });
    }
    const cos = st.log.filter((x) => x[1] === 'cosmetic');
    const gap = (a, b) => { const n = st.log.filter((x) => x[0] > a && x[0] <= b).length; return n ? (b - a) / n * 60 : Infinity; };
    return { hourly, allCosmeticsAt: cos.length === forSale.length ? cos[cos.length - 1][0] : null, snaps, gap05: gap(0, 5) };
  }
  test('career: every cosmetic owned in 50–90 h casually, 25–45 h skilled, 40–70 h puzzle-focused; purchases come often early', () => {
    const c = career('casual', 400), s = career('skilled', 400), p = career('puzzle', 400);
    const share = (snap, k) => snap[k] / snap.total;
    console.log('       every cosmetic at ' + [c, s, p].map((x) => x.allCosmeticsAt + ' h').join(' / ') + ' (casual / skilled / puzzle); skilled achievements ' +
      Math.round(100 * share(s.snaps[10], 'achievements')) + '% at 10 h, ' + Math.round(100 * share(s.snaps[50], 'achievements')) + '% at 50 h; casual buys every ' + c.gap05.toFixed(0) + ' min (0–5 h)');
    const within = (x, a, b, what) => assert(x != null && x >= a && x <= b, what + ': ' + x);
    // 80 h at most while the Factory paid a casual player too (about a fifth of the income); without it, 90.
    within(c.allCosmeticsAt, 50, 90, 'casual');
    within(s.allCosmeticsAt, 25, 45, 'skilled');
    within(p.allCosmeticsAt, 40, 70, 'puzzle-focused');
    assert(c.gap05 <= 60, 'casual: a purchase every ' + c.gap05.toFixed(0) + ' min in the first five hours');
    assert(share(s.snaps[10], 'achievements') <= 0.35, 'skilled achievements at 10 h: ' + share(s.snaps[10], 'achievements').toFixed(3));
    assert(share(s.snaps[50], 'achievements') <= 0.15, 'skilled achievements at 50 h: ' + share(s.snaps[50], 'achievements').toFixed(3));
    void round;
  });
};

module.exports.MODEL = MODEL;

if (require.main === module) {
  const load = require('./load.cjs');
  const L = load(['util.js', 'pieces.js', 'board.js', 'engine.js', 'items.js', 'library.js', 'puzzlegen.js', 'store.js', 'achievements.js']);
  let passed = 0, failed = 0;
  const test = (name, fn) => {
    try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
  };
  module.exports(test, L);
  console.log(failed ? '\n' + failed + ' failed, ' + passed + ' passed' : '\nall ' + passed + ' passed');
  process.exit(failed ? 1 : 0);
}
