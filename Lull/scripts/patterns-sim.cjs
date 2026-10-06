#!/usr/bin/env node
// The proof behind the Guide's cost lines (js/patterns.js COSTS): headless Classic games placed by the Watch bot's eye
// (Bot.rank: the piece, Hold and three Next, a beam of four, one piece ahead), each seed played twice, forced and
// avoided, every placement looked at by the very detector the notes use (Patterns.look). At most once every ten pieces,
// where the bot has, besides its own first choice, both a placement that makes the shape and one that does not (among
// all of them for a risk, among its best sixteen for a good shape), the forced game takes the best that makes it and
// the avoided game the best that does not; every other piece both play the bot's own best. Both leave the bot's plan
// as often, so the two differ by the shape alone (a choice a player meets now and then, not a way of playing). Fewest keys has no board to look at: it is measured by a hand two
// keys slower every piece (the spots it reaches before the piece falls past). Each game runs to 250 pieces or the top
// out, at level 1 and level 15 (the fall, the danger the bot fears, and a hand's reach at that speed).
//
// For each shape, paired by seed and level, as a cost (avoided less forced; for a good shape forced less avoided, a
// gain), each with its 95% interval: lines a 100 pieces, the average height, the score (as a share), and the top outs
// of each side. A shape with no clear effect (no interval clear of 0 with a third of a line a 100 pieces, a fifth of a
// row, 5% of the score, or three more top outs) is negligible: merged into its nearest card (MERGE) or dropped. Then
// COSTS in js/patterns.js is written anew.
//   node Lull/scripts/patterns-sim.cjs [seeds=12] [pieces=250] [--dry: print only]   (SHAPES=hole,pit: only those)
//   node Lull/scripts/patterns-sim.cjs --verdicts   (the verdicts given again to the figures in COSTS, no games)
// It takes some minutes on four processes, so it is not part of the tests: scripts/patterns-unit.cjs runs a short one.
'use strict';
const path = require('path'), fs = require('fs');
const { fork } = require('child_process');
const FILES = ['util.js', 'pieces.js', 'board.js', 'recipe.js', 'engine.js', 'items.js', 'library.js', 'classic.js', 'bot.js', 'patterns.js', 'patterncards.js'];

/** A shape with no clear effect of its own goes to the card it is nearest (its notes link there). */
const MERGE = { twoPits: 'pit', nextPlan: 'spot', slope: 'flat', oFlat: 'flat', steps: 'flat', wellEdge: 'cleanWell', bag: 'cleanWell', combo: 'streak', spotless: 'streak', dig: 'hole', burn: 'high', speed: 'high', coveredWell: 'wellFill', noSZ: 'spot', cliff: 'rough', holdGood: 'holdNoPlan', overhang: 'hole', szFlat: 'overhang', oUneven: 'overhang', ljPit: 'pit', twistSlot: 'streak' };
const HAND = { key: 100, look: 400, glance: 250 };

/** One game: the bot's best, with the shape forced, avoided, or left alone (mode). Returns its figures. */
function game(L, o) {
  const { Game, Bot, Classic, Patterns: P } = L;
  const k = Object.assign({}, Classic.DEFAULTS, { level: o.level, next: 3, hold: true, levelLock: true });
  const g = new Game({ w: 10, h: 20, seed: o.seed, recipe: { mode: 'classic', classic: k } });
  const W = g.w, H = g.h, shape = P.BY[o.id];
  const iv = Classic.gravity(o.level, false) * 1000;
  let sinceI = 0, lastForce = -99, occ = 0, holes = 0, n = 0, hsum = 0;
  const slow = o.id === 'finesse' && o.mode === 'force' ? 2 : 0;
  while (!g.over && n < o.pieces) {
    const rows = Bot.rowsOf(g.board), room = Math.max(1, H - Bot.heightOf(rows, H) - 2);
    const v = Bot.view(g, { hold: true, r180: true, next: 3 }, Math.max(0, Math.min(0.9, 1 - (iv * room + 350) / 1600)));
    Object.assign(v, { rate: HAND.key / iv, start: (HAND.look + slow * HAND.key) / iv, startNext: (HAND.glance + slow * HAND.key) / iv });
    const ranked = Bot.rank(v, { beam: 4, depth: 1 });
    if (!ranked.length) { g.over = true; break; }
    const Fb = P.analyze(rows, W, H);
    const lookOf = (e) => {
      if (e.lk) return e.lk;
      const cells = L.Pieces.get(e.id).rots[e.r].map(([cx, cy]) => [e.x + cx, e.y + cy]);
      const kq = e.hold && !g.hold ? 1 : 0;
      e.lk = P.look({ W, H, before: rows, Fb, cells, id: e.id, holdUsed: !!e.hold, held: e.hold ? g.piece.type.id : g.hold ? g.hold.id : null,
        visible: g.queue.slice(kq + 1, kq + 4).map((q) => q.id), visibleBefore: g.queue.slice(0, 3).map((q) => q.id), rand: 'bag',
        sinceI: e.id === 'I' ? 0 : sinceI + 1, sinceIBefore: sinceI, level: o.level,
        streak: (e.lines >= 4 || e.twist === 2) && g.s.b2b >= 0, combo: e.lines ? g.s.combo + 1 : -1 });
      return e.lk;
    };
    const has = (e) => {
      if (o.id === 'finesse') return false;
      const lk = lookOf(e);
      return shape.sim === 'present' ? !!lk.shapes[o.id] : lk.events.some((x) => x.id === o.id && x.kind !== 'cleared');
    };
    // Once every ten pieces at most, where the bot has both a placement that makes the shape and one that does not
    // (among its best sixteen; a risk, among all), forced takes the best that makes it and avoided the best that does
    // not; the rest of the time both play the bot's own best. So the two differ only by the shape, as often.
    let pick = ranked[0], dev = false;
    if (o.id !== 'finesse' && n - lastForce >= 10) {
      // (Both leave the bot's own first choice, so the two differ only by whether the other placement makes it.)
      const pool = shape.group === 'good' ? ranked.slice(1, 16) : ranked.slice(1);
      const yes = pool.find(has), no = yes ? pool.find((e) => !has(e)) : null;
      if (yes && no) { pick = o.mode === 'force' ? yes : no; lastForce = n; dev = true; }
    }
    if (dev) occ++;
    holes += lookOf(pick).events.filter((x) => x.id === 'hole').reduce((a, x) => a + x.cells.length, 0);
    if (pick.hold) g.holdPiece();
    sinceI = pick.id === 'I' ? 0 : sinceI + 1;
    Object.assign(g.piece, { rot: pick.r, x: pick.x, y: pick.y });
    if (!g.lock()) { g.over = true; break; }
    n++;
    hsum += Bot.heightOf(Bot.rowsOf(g.board), H);
  }
  if (o.id === 'finesse') occ = o.mode === 'force' ? n : 0;
  return { lines: g.s.lines, score: g.s.score, pieces: n, topout: !!g.over, occ, holes, height: n ? hsum / n : 0 };
}

if (process.argv[2] === '--child') {
  const L = require('./load.cjs')(FILES);
  process.on('message', (job) => {
    const out = {};
    for (const mode of ['force', 'avoid']) out[mode] = game(L, Object.assign({}, job, { mode }));
    process.send(Object.assign({ id: job.id, level: job.level, seed: job.seed }, out));
  });
  return;
}
module.exports = { game, MERGE, FILES };
if (require.main !== module) return;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), dry = process.argv.includes('--dry');
const seeds = Number(args[0]) || 12, pieces = Number(args[1]) || 250, only = process.env.SHAPES ? process.env.SHAPES.split(',') : null;
const L0 = require('./load.cjs')(FILES);
const ids = L0.Patterns.SHAPES.map((s) => s.id).filter((id) => !only || only.includes(id));
// --verdicts: the verdicts given again to the figures kept in COSTS (the rule changed, the games not run again).
if (process.argv.includes('--verdicts')) {
  const costs = JSON.parse(JSON.stringify(L0.Patterns.COSTS));
  for (const [id, c] of Object.entries(costs)) c.verdict = verdictOf(id, c);
  settle(costs);
  console.log('Verdicts: ' + Object.entries(costs).map(([id, c]) => id + ' ' + c.verdict).join(', '));
  if (!dry) write(costs);
  return;
}
const jobs = [];
for (const id of ids) for (const level of [1, 15]) for (let s = 0; s < seeds; s++) jobs.push({ id, level, seed: 7000 + s, pieces });
const res = [];
const t0 = Date.now();
let next = 0, done = 0;
const workers = Math.max(1, Math.min(4, require('os').cpus().length));
for (let w = 0; w < workers; w++) {
  const child = fork(__filename, ['--child']);
  const feed = () => { if (next < jobs.length) child.send(jobs[next++]); else child.kill(); };
  child.on('message', (r) => { res.push(r); if (++done % 50 === 0) process.stderr.write(done + '/' + jobs.length + '\r'); if (done === jobs.length) report(); feed(); });
  feed();
}

function report() {
  const P = L0.Patterns, costs = {};
  console.log('Patterns: ' + seeds + ' seeds × levels 1 and 15, each to ' + pieces + ' pieces or the top out, forced and avoided (' + Math.round((Date.now() - t0) / 1000) + ' s)\n');
  console.log('| Shape | Lines /100 pieces | Height (rows) | Score | Each (lines) | Chosen a game (forced / avoided) | Top outs (forced / avoided) | Verdict |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const id of ids) {
    const rs = res.filter((r) => r.id === id), good = P.BY[id].group === 'good', sg = good ? -1 : 1;
    // Each measure paired by seed and level, as a cost (avoided less forced; a good shape: forced less avoided, a gain),
    // with its 95% interval.
    const stat = (f) => {
      const d = rs.map((r) => sg * (f(r.avoid) - f(r.force))), m = mean(d), sd = Math.sqrt(d.reduce((a, x) => a + (x - m) * (x - m), 0) / Math.max(1, d.length - 1)), half = 1.96 * sd / Math.sqrt(d.length);
      return { m, lo: m - half, hi: m + half, sig: m - half > 0 || m + half < 0 };
    };
    // (Lines a 100 pieces of each game: a game that topped out early counts what it cleared, and loses the rest.)
    const lines = stat((x) => 100 * x.lines / pieces), height = stat((x) => -x.height), score = stat((x) => x.score / Math.max(1, mean(rs.map((r) => r.avoid.score + r.force.score)) / 2) * 100);
    const occF = mean(rs.map((r) => r.force.occ)), occA = mean(rs.map((r) => r.avoid.occ));
    const each = occF >= 0.5 ? lines.m * pieces / 100 / occF : null;
    const tf = rs.filter((r) => r.force.topout).length, ta = rs.filter((r) => r.avoid.topout).length;
    costs[id] = { lines: r2(lines.m), ci: [r2(lines.lo), r2(lines.hi)], each: each == null ? null : r2(each), height: r2(height.m), hsig: height.sig, score: r2(score.m), ssig: score.sig, lsig: lines.sig, topouts: good ? [ta, tf] : [tf, ta], made: [r2(occF), r2(occA)], n: rs.length };
    costs[id].verdict = verdictOf(id, costs[id]);
    const verdict = costs[id].verdict;
    const cell = (s, unit) => f1(s.m) + unit + ' [' + f1(s.lo) + ', ' + f1(s.hi) + ']' + (s.sig ? '*' : '');
    console.log('| ' + [P.BY[id].name, cell(lines, ''), cell(height, ''), cell(score, '%'), each == null ? '–' : f1(each), f1(occF) + ' / ' + f1(occA), tf + ' / ' + ta, verdict].join(' | ') + ' |');
  }
  settle(costs);
  console.log('\n(* the 95% interval leaves out 0. A good shape\'s figures are what seeking it gains; the rest, what making it costs.)');
  console.log('Verdicts: ' + Object.entries(costs).map(([id, c]) => id + ' ' + c.verdict).join(', '));
  if (dry || only) return;
  write(costs);
}
/**
 * A shape's verdict from its figures: kept when the choice came up (half a time a game or more) with a clear effect the
 * right way on the lines (a third of a line a 100 pieces), the height (a fifth of a row), the score (5%) or three more
 * top outs; dropped when its only clear effect goes the wrong way (seeking a "good" shape that costs); else merged
 * into its nearest card (MERGE), or dropped when it has none.
 */
function verdictOf(id, c) {
  const good = L0.Patterns.BY[id].group === 'good', [tf, ta] = good ? [c.topouts[1], c.topouts[0]] : c.topouts;
  const real = c.made[0] >= 0.5 && ((c.lsig && c.lines >= 0.3) || (c.hsig && c.height >= 0.2) || (c.ssig && c.score >= 5) || (good ? ta - tf : tf - ta) >= 3);
  const wrong = (c.lsig && c.lines <= -0.3) || (c.hsig && c.height <= -0.2) || (c.ssig && c.score <= -5);
  return real ? 'keep' : wrong ? 'drop' : MERGE[id] ? 'merge:' + MERGE[id] : 'drop';
}
/** A merge into a card that is itself not kept: dropped instead. */
function settle(costs) { for (const c of Object.values(costs)) if (c.verdict.startsWith('merge:') && !(costs[c.verdict.slice(6)] && costs[c.verdict.slice(6)].verdict === 'keep')) c.verdict = 'drop'; }
function write(costs) {
  const file = path.join(__dirname, '..', 'Game', 'js', 'patterns.js'), src = fs.readFileSync(file, 'utf8');
  const body = '  COSTS = {\n' + Object.entries(costs).map(([id, c]) => '    ' + id + ': ' + JSON.stringify(c) + ',').join('\n') + '\n  };\n';
  fs.writeFileSync(file, src.replace(/(  \/\/ COSTS:begin\n)[\s\S]*?(  \/\/ COSTS:end)/, '$1' + body + '$2'));
  console.log('\nCOSTS written to Game/js/patterns.js');
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function r2(v) { return Math.round(v * 100) / 100; }
function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
