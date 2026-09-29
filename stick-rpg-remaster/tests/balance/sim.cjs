// tests/balance/sim.cjs — owner: W1-Q (scaffold; the lead in wave 2, W3-Balance in wave 3). The
// balance simulator of BALANCE B-23 / B-25 and ARCHITECTURE §18: loads the pure rules in Node
// (tests/node/load.cjs, mode rules), runs a bot (tests/balance/bots.cjs) for N days per seed through
// SR.rules.act.run and SR.rules.night.run, and prints a CSV row per bot × policy × seed × day, a
// median summary with an ASCII chart of net worth, and (once W3-Balance fills BANDS) asserts the
// B-23 medians.
//
//   node tests/balance/sim.cjs [--bot worker] [--policy normal|expert] [--seeds 20] [--days 100]
//        [--difficulty standard] [--out file.csv] [--quiet]
//   node tests/balance/sim.cjs --selftest   (20 seeds × 100 days with the trivial bot in < 30 s,
//                                            deterministic; the fuzz bot; a planted band miss)
//
//   const { simulate, csv, summary, assertBands } = require('./sim.cjs');
//   simulate({ bot, policy, seeds, days, difficulty }) → { rows, runs, ms }
//
// Per day, after the night: cash, bank, net worth, STR / INT / CHA, karma, HP, Heat, the job ranks,
// the lived-in home, actions taken and refused, and the cash in by source (the sources of CONTRACT
// §8.4, `night` for what the night paid: interest, rent, salary). A run ends at death or the game's
// end. Minigames resolve with the bot's `minigame(open)` or the engine's neutral Auto (m = 1.0 for
// Shift Rush and the Timing Ring, B-23); other engines' resolves are skipped until W3-Balance's bots
// sample them.
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const { bots } = require('./bots.cjs');

const SOURCES = ['wage', 'rent', 'salary', 'interest', 'deal', 'tour', 'loot', 'win', 'prize', 'other', 'night'];
const OWNERS = ['world', 'bag', 'phone', 'jail', 'trip', 'hospital'];
const DECISIONS_PER_DAY = 200;
const NEUTRAL = { shiftrush: { m: 1, hits: 0, misses: 0 }, timingring: { m: 1, hits: 0, misses: 0 } };

// B-23 bands, asserted on the median over seeds: { '<bot>/<policy>': { <day>: { <column>: [lo, hi] } } }.
// W3-Balance transcribes BALANCE B-23 here with its bots.
const BANDS = {};

let cached = null;
/** Loads the pure rules once (mode rules). @returns {object} SR */
function loadRules() {
  if (cached) return cached;
  const L = require(path.join(ROOT, 'tests', 'node', 'load.cjs'));
  const res = L.load({ mode: 'rules', console: { log() {}, info() {}, debug() {}, warn() {}, error: console.error } });
  cached = res.SR;
  return cached;
}

/**
 * The income source of a positive cash / bank delta: the delta's key when it names a source (a
 * requested refinement, docs/requests/W1-Q.md), else the first ['cash' | 'bank', n, src] of the
 * action's effects, else its group (work → wage, crime → loot), else other.
 * @returns {string}
 */
function sourceOf(def, delta) {
  if (delta && SOURCES.indexOf(delta.key) >= 0) return delta.key;
  let src = null;
  const walk = (l) => (Array.isArray(l) ? l : []).forEach((e) => {
    if (src || !Array.isArray(e)) return;
    if ((e[0] === 'cash' || e[0] === 'bank') && typeof e[2] === 'string' && SOURCES.indexOf(e[2]) >= 0) src = e[2];
    if (e[0] === 'chance') { walk(e[2]); walk(e[3]); }
    if (e[0] === 'check') { walk(e[4]); walk(e[5]); }
  });
  if (def) walk(def.effects);
  return src || (def && def.group === 'work' ? 'wage' : def && def.group === 'crime' ? 'loot' : 'other');
}

/** @returns {number} the median of a list of numbers. */
function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; }

/**
 * Runs a bot.
 * @param {object} o bot (a name or a bot object), policy, seeds (a count or a list), days,
 *   difficulty, length (the game length; default 0, Unlimited, so the run ends on day N)
 * @returns {{rows: object[], runs: object[], ms: number}}
 */
function simulate(o) {
  o = o || {};
  const SR = o.SR || loadRules();
  const bot = typeof o.bot === 'object' && o.bot ? o.bot : bots[o.bot || 'idle'];
  if (!bot) throw new Error('sim: unknown bot "' + o.bot + '" (' + Object.keys(bots).join(', ') + ')');
  const policy = o.policy || 'normal';
  const days = o.days || 100;
  const seeds = Array.isArray(o.seeds) ? o.seeds : Array.from({ length: o.seeds || 20 }, (_, k) => k + 1);
  const rows = [];
  const runs = [];
  const t0 = Date.now();
  const has = (fn) => typeof fn === 'function';
  const netWorth = (s) => (SR.rules.endgame && has(SR.rules.endgame.netWorth) ? SR.rules.endgame.netWorth(s) : s.money.cash + s.money.bank);

  for (const seed of seeds) {
    const s = SR.rules.state.create({ seed, difficulty: o.difficulty || 'standard', length: o.length === undefined ? 0 : o.length, tutorial: false });
    const rng = SR.rng.create(1);
    rng.setState(s.rng.rules);
    const botRng = SR.rng.create(SR.util.hash(seed, 'bot', bot.name));
    const memo = {};
    const actx = () => ({ rng, now: s.clock.min, source: 'sim' });
    const candidateIds = Object.keys(SR.reg.action).filter((id) => {
      const d = SR.reg.action[id];
      return !/:resolve$/.test(id) && OWNERS.indexOf(d.building) < 0 && !d.screen && !d.confirm;
    });
    const ctx = {
      SR, rng: botRng, policy, memo, day: s.clock.day, min: s.clock.min,
      preview: (id, params) => { try { return SR.rules.act.preview(s, id, params || {}, { rng: SR.rng.create(7), now: s.clock.min, source: 'sim' }); } catch (e) { return null; } },
      candidates: (f) => candidateIds.filter((id) => !f || !f.groups || f.groups.indexOf(SR.reg.action[id].group) >= 0),
      cashIn: (p) => (p && p.gains ? p.gains.filter((g) => g.kind === 'cash' && g.n > 0).reduce((a, g) => a + g.n, 0) : 0),
      statIn: (p) => (p && p.gains ? p.gains.filter((g) => g.kind === 'stat').reduce((a, g) => a + (g.n || 0), 0) : 0),
    };
    if (has(bot.init)) bot.init(s, ctx);
    const run = { seed, days: 0, end: null, actions: 0, refused: 0, unresolved: 0 };
    for (let d = 0; d < days && !s.over; d++) {
      const day = s.clock.day;
      const income = {};
      SOURCES.forEach((k) => { income[k] = 0; });
      let taken = 0;
      let refused = 0;
      let streak = 0;
      for (let n = 0; n < DECISIONS_PER_DAY; n++) {
        ctx.day = s.clock.day;
        ctx.min = s.clock.min;
        if (s.clock.day !== day || s.over) break;              // a hospital night moved the day on
        const pick = bot.decide(s, ctx);
        if (!pick || !pick.id) break;
        const r = SR.rules.act.run(s, pick.id, pick.params || {}, actx());
        if (!r.ok) { refused++; if (++streak >= 3) break; continue; }
        streak = 0;
        taken++;
        (r.deltas || []).forEach((dl) => {
          if ((dl.kind === 'cash' || dl.kind === 'bank') && dl.n > 0) income[sourceOf(SR.reg.action[pick.id], dl)] += dl.n;
        });
        if (r.open && r.open.resolve) {
          const engine = r.open.minigame;
          const res = has(bot.minigame) ? bot.minigame(r.open, s, ctx) : NEUTRAL[SR.reg.skin && SR.reg.skin[engine] ? SR.reg.skin[engine].engine : engine] || null;
          if (res) SR.rules.act.run(s, r.open.resolve, res, actx());
          else run.unresolved++;
        }
        if (r.down && r.down.outcome === 'death') { run.end = 'death:' + (r.down.cause || '?'); break; }
        if (r.over) { run.end = 'over:' + (r.over.reason || '?'); break; }
      }
      run.actions += taken;
      run.refused += refused;
      if (run.end) { rows.push(row(s, seed, day, taken, refused, income)); break; }
      // the night (or the nights in jail)
      const before = s.money.cash + s.money.bank;
      let R = null;
      if (s.clock.day === day) {
        const kind = s.jail ? 'jail' : 'sleep';
        if (kind === 'jail' && SR.rules.crime && has(SR.rules.crime.jailDay)) { try { SR.rules.crime.jailDay(s, has(bot.jailChoice) ? bot.jailChoice(s, ctx) : 'rest'); } catch (e) { /* the jail rules decide */ } }
        R = SR.rules.night.run(s, { rng, source: 'sim' }, { kind });
      }
      income.night += Math.max(0, s.money.cash + s.money.bank - before);
      rows.push(row(s, seed, day, taken, refused, income));
      run.days++;
      if (R && R.dead) { run.end = 'dead:' + R.dead; break; }
      if (R && R.ended) { run.end = 'ended:' + R.ended; break; }
    }
    run.nw = netWorth(s);
    runs.push(run);
  }

  function row(s, seed, day, taken, refused, income) {
    const r = {
      bot: bot.name, policy, seed, day, cash: s.money.cash, bank: s.money.bank, nw: netWorth(s),
      str: s.stats.str, int: s.stats.int, cha: s.stats.cha, karma: s.stats.karma, hp: s.stats.hp, heat: s.stats.heat,
      mcsticks: (s.job && s.job.ranks && s.job.ranks.mcsticks) || '', nli: (s.job && s.job.ranks && s.job.ranks.nli) || '',
      home: (s.homes && s.homes.living) || '', actions: taken, refused,
    };
    SOURCES.forEach((k) => { r['in_' + k] = income[k]; });
    return r;
  }
  return { rows, runs, ms: Date.now() - t0 };
}

/** @returns {string} the rows as CSV (a header line, then one line per row). */
function csv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : String(v));
  return [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n') + '\n';
}

/** @returns {object[]} per day: the median over seeds of the numeric columns. */
function summary(rows) {
  const byDay = {};
  rows.forEach((r) => { (byDay[r.day] = byDay[r.day] || []).push(r); });
  return Object.keys(byDay).map(Number).sort((a, b) => a - b).map((day) => {
    const list = byDay[day];
    const out = { day, n: list.length };
    Object.keys(list[0]).forEach((k) => { if (typeof list[0][k] === 'number' && k !== 'seed' && k !== 'day') out[k] = median(list.map((x) => x[k])); });
    return out;
  });
}

/** @returns {string} an ASCII chart of a summary column (B-25). */
function chart(sum, col, height, width) {
  height = height || 8;
  width = width || 60;
  if (!sum.length) return '';
  const pts = [];
  for (let k = 0; k < width; k++) pts.push(sum[Math.min(sum.length - 1, Math.floor(k * sum.length / width))][col] || 0);
  const lo = Math.min.apply(null, pts);
  const hi = Math.max.apply(null, pts);
  const lines = [];
  for (let y = height - 1; y >= 0; y--) {
    let line = '';
    for (let k = 0; k < width; k++) { const v = hi > lo ? (pts[k] - lo) / (hi - lo) * (height - 1) : 0; line += Math.round(v) === y ? '*' : Math.round(v) > y ? '.' : ' '; }
    lines.push((y === height - 1 ? String(Math.round(hi)) : y === 0 ? String(Math.round(lo)) : '').padStart(10) + ' |' + line);
  }
  lines.push(' '.repeat(10) + ' +' + '-'.repeat(width) + ' day 1..' + sum[sum.length - 1].day + ' (median ' + col + ')');
  return lines.join('\n');
}

/**
 * @param {object[]} sum summary()
 * @param {object} bands { <day>: { <column>: [lo, hi] } } for one bot and policy
 * @returns {string[]} the misses
 */
function assertBands(sum, bands) {
  const miss = [];
  Object.keys(bands || {}).forEach((day) => {
    const s = sum.find((x) => x.day === Number(day));
    if (!s) { miss.push('day ' + day + ': not simulated'); return; }
    Object.keys(bands[day]).forEach((col) => {
      const b = bands[day][col];
      const v = s[col];
      if (typeof v !== 'number' || v < b[0] || v > b[1]) miss.push('day ' + day + ' ' + col + ': median ' + v + ' outside [' + b[0] + ', ' + b[1] + ']');
    });
  });
  return miss;
}

function selftest() {
  const { suite } = require(path.join(ROOT, 'tests', 'node', 'load.cjs'));
  const T = suite('balance sim --selftest (W1-Q)');
  T.section('the trivial bot, 20 seeds × 100 days');
  const t0 = Date.now();
  const a = simulate({ bot: 'idle', seeds: 20, days: 100 });
  const ms = Date.now() - t0;
  T.ok(ms < 30000, 'runs in ' + ms + ' ms (< 30 s, rules loaded included)');
  T.eq(a.rows.length, 2000, '2,000 rows (one per seed and day)');
  T.ok(a.runs.every((r) => r.days === 100 && !r.end), 'every run reaches day 100', a.runs.filter((r) => r.days !== 100 || r.end));
  const text = csv(a.rows);
  T.ok(/^bot,policy,seed,day,cash,bank,nw,str,int,cha/.test(text) && text.split('\n').length === 2002, 'CSV with a header and 2,000 lines');
  const b = simulate({ bot: 'idle', seeds: 20, days: 100 });
  T.ok(csv(b.rows) === text, 'deterministic: a second run prints the same CSV');
  const c = simulate({ bot: 'idle', seeds: [21, 22], days: 30 });
  T.ok(csv(c.rows) !== csv(a.rows.filter((r) => r.seed <= 2 && r.day <= 30)), 'other seeds give other runs');
  T.section('the other bots run on the current content');
  for (const name of ['sampler', 'worker']) {
    let ok = true;
    let res = null;
    try { res = simulate({ bot: name, seeds: 5, days: 20, policy: 'expert' }); } catch (e) { ok = false; console.log('  ' + e.stack); }
    T.ok(ok && res.rows.length > 0, name + ': 5 seeds × 20 days (' + (res ? res.runs.reduce((x, r) => x + r.actions, 0) + ' actions, ' + res.runs.reduce((x, r) => x + r.refused, 0) + ' refused' : 'threw') + ')');
  }
  T.section('the worker bot on test content (a separate rules instance)');
  const L = require(path.join(ROOT, 'tests', 'node', 'load.cjs'));
  const SR2 = L.load({ mode: 'rules', console: { log() {}, info() {}, debug() {}, warn() {}, error: console.error } }).SR;
  // After boot a new id registers normally (CONTRACT §3.2 D6): a job row and a training row.
  SR2.def.action('qa.work', { building: 'qa', group: 'work', label: 'act.qa.work', p: 0, cost: { min: 360 }, effects: [['cash', 42, 'wage']] });
  SR2.def.action('qa.study', { building: 'qa', group: 'train', label: 'act.qa.study', p: 0, cost: { min: 60 }, effects: [['stat', 'int', 2]], repeatable: true });
  const w = simulate({ SR: SR2, bot: 'worker', policy: 'expert', seeds: 3, days: 10 });
  const d10 = summary(w.rows).find((x) => x.day === 10) || {};
  T.ok(w.runs.every((r) => r.actions > 0) && d10.cash > 100 && d10.int > 7 && d10.in_wage > 0,
    'works and trains through SR.rules.act.run (day 10 medians: cash ' + d10.cash + ', INT ' + d10.int + ', wage in ' + d10.in_wage + ')');
  T.section('bands');
  const sum = summary(a.rows);
  T.eq(sum.length, 100, 'the summary has a median row per day');
  T.eq(assertBands(sum, { 100: { cash: [0, 1e9] } }), [], 'a median inside its band passes');
  T.eq(assertBands(sum, { 100: { nw: [1e8, 2e8] } }).length, 1, 'a planted band miss is reported');
  return T.done();
}

module.exports = { simulate, csv, summary, chart, assertBands, loadRules, median, sourceOf, BANDS, SOURCES };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const val = (f) => { const k = argv.indexOf(f); return k >= 0 ? argv[k + 1] : undefined; };
  if (argv.includes('--selftest')) selftest();
  else {
    const o = { bot: val('--bot') || 'idle', policy: val('--policy') || 'normal', seeds: Number(val('--seeds') || 20), days: Number(val('--days') || 100), difficulty: val('--difficulty') || 'standard' };
    const res = simulate(o);
    const text = csv(res.rows);
    const sum = summary(res.rows);
    const last = sum[sum.length - 1] || {};
    const info = [
      'sim: bot ' + o.bot + ' (' + o.policy + ', ' + o.difficulty + '), ' + res.runs.length + ' seeds × ' + o.days + ' days in ' + res.ms + ' ms',
      'day ' + (last.day || 0) + ' medians: NW ' + last.nw + ', cash ' + last.cash + ', bank ' + last.bank + ', STR / INT / CHA ' + last.str + ' / ' + last.int + ' / ' + last.cha + ', karma ' + last.karma + ', Heat ' + last.heat,
      'ends: ' + (res.runs.filter((r) => r.end).map((r) => r.seed + ' ' + r.end).join(', ') || 'none'),
      chart(sum, 'nw'),
    ];
    const key = o.bot + '/' + o.policy;
    const miss = BANDS[key] ? assertBands(sum, BANDS[key]) : [];
    if (BANDS[key]) info.push('bands ' + key + ': ' + (miss.length ? miss.join('; ') : 'all medians inside'));
    if (val('--out')) { fs.writeFileSync(path.resolve(val('--out')), text); console.log(info.join('\n')); }
    else { process.stdout.write(text); if (!argv.includes('--quiet')) console.error(info.join('\n')); }
    process.exitCode = miss.length ? 1 : 0;
  }
}
