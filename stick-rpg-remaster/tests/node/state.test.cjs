// tests/node/state.test.cjs — owner: W1-R. SR.rules.state: the v1 schema of ARCHITECTURE §6.1
// (every top-level key and the nested fields), defaults() fully populated and JSON-safe, create(opts)
// deterministic per seed with the B-02 / B-09 / B-10 starting values, the cheat name, and the save
// migration's deep-fill of a partial v1 state.
//   node tests/node/state.test.cjs
'use strict';
const K = require('./w1r-kit.cjs');

const T = K.L.suite('state');
const SR = K.load();
const St = SR.rules.state;

/** @returns {string[]} every dotted path of plain-object fields (arrays and scalars are leaves). */
function paths(o, pre = '') {
  const out = [];
  for (const k of Object.keys(o)) {
    const v = o[k], p = pre ? pre + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) out.push(...paths(v, p));
    else out.push(p);
  }
  return out.sort();
}

const TOP = ['v', 'seed', 'rng', 'mode', 'clock', 'player', 'stats', 'money', 'job', 'edu', 'perks', 'items', 'homes', 'furniture',
  'stocks', 'tip', 'trade', 'fight', 'casino', 'crime', 'daily', 'weekly', 'npc', 'election', 'world', 'jail', 'pending', 'msgs',
  'log', 'journal', 'records', 'history', 'achievements', 'flags', 'over', 'result'];

T.section('defaults(): the v1 schema');
{
  const d = St.defaults();
  T.eq(Object.keys(d), TOP, 'the top-level keys of ARCHITECTURE §6.1, in order');
  T.eq([d.v, St.VERSION], [1, 1], 'schema version 1');
  T.eq(K.json(d), K.json(St.defaults()), 'defaults() is deterministic');
  T.ok(JSON.stringify(d).indexOf('null') >= 0 && !JSON.stringify(d).includes('undefined'), 'JSON-safe');
  const undef = paths(d).filter((p) => p.split('.').reduce((o, k) => o[k], d) === undefined);
  T.eq(undef, [], 'no field is undefined');
  T.eq(d.stats, { str: 7, int: 7, cha: 7, karma: 0, hp: 22, hpMax: 22, heat: 0, buzz: 0 }, 'stats: Fair start, HP 22 / 22');
  T.eq(d.clock, { day: 1, min: 480, wake: 480, pillAuto: true }, 'clock: day 1, 08:00');
  T.eq(d.money.cash, 100, 'Standard starts with $100 (orig)');
  T.eq([d.job.ranks.mcsticks, d.job.ranks.nli, d.job.rating, d.job.lastFullEnd], ['cook', null, 1, -1], 'hired as a Fry Cook (orig)');
  T.eq(d.homes, { owned: ['apt'], living: 'apt', lets: {} }, 'you live in the apartment');
  T.eq(Object.keys(d.stocks), ['MCS', 'NLI', 'SLC', 'PPR', 'GLU', 'SKY'], 'six tickers');
  T.eq(d.stocks.MCS, { price: 12, prev: 12, hist: [], held: 0, basis: 0 }, 'a ticker entry');
  T.eq(d.items.takeout, [], 'list items start as empty lists');
  T.eq(Object.keys(d.items).length, 21, 'the 21 item slots');
  T.eq(Object.keys(d.daily.campaign), ['rally', 'tvAd', 'doorKnock', 'kissBabies', 'intimidate', 'bribe'], 'daily campaign caps');
  T.eq(Object.keys(d.npc), ['harold', 'kid', 'dealer', 'mcholland', 'crease'], 'the street cast');
  T.eq(Object.keys(d.election).length, 15, 'the 15 election fields');
  T.eq(Object.keys(d.records).length, 12, 'the records');
  T.eq(d.player.cars.sports, { owned: false, bought: false, x: 1865, y: 1120, a: 0, towed: false }, 'the sports car on its lot');
  T.eq([d.jail, d.pending, d.tip, d.over, d.result], [null, null, null, false, null], 'nullable fields start null');
  T.eq(d.log, { today: [], yesterday: [] }, 'an empty log');
  T.eq(d.stats.hpMax, SR.tuning.start.hpMaxBase + d.stats.str, 'invariant: hpMax = 15 + STR');
  T.ok(St.defaults() !== St.defaults() && St.defaults().items !== St.defaults().items, 'each call returns a new object');
}

T.section('create(opts)');
{
  const a = St.create({ seed: 42 });
  const b = St.create({ seed: 42 });
  T.eq(K.json(a), K.json(b), 'the same options give the same state');
  T.eq(paths(a), paths(St.defaults()), 'a new game has exactly the schema fields');
  T.eq(a.seed, 42, 'the seed is kept');
  T.eq(a.rng.rules, SR.rng.create(42).state(), 'state.rng.rules is the rules stream seeded with the seed');
  const rates = [], prices = { MCS: [], NLI: [], SLC: [], PPR: [], GLU: [], SKY: [] };
  for (let i = 1; i <= 300; i++) {
    const s = St.create({ seed: i });
    rates.push(s.money.rate);
    for (const t of Object.keys(prices)) prices[t].push(s.stocks[t].price);
  }
  T.ok(rates.every((r) => r >= 1 && r <= 3 && Math.abs(r * 10 - Math.round(r * 10)) < 1e-9), 'the starting rate is rand(10..30) / 10');
  T.ok(new Set(rates).size > 15, 'and varies by seed (' + new Set(rates).size + ' values)');
  const S = SR.tuning.stocks;
  T.ok(Object.keys(prices).every((t) => prices[t].every((p) => p >= S[t].start - S[t].jitter && p <= S[t].start + S[t].jitter)), 'stock start prices are base ± rand(jitter) (B-10)');
  T.ok(Object.keys(prices).every((t) => Math.min(...prices[t]) === S[t].start - S[t].jitter && Math.max(...prices[t]) === S[t].start + S[t].jitter), 'and cover the whole range');
  const s = St.create({ seed: 9 });
  T.eq(s.stocks.NLI.prev, s.stocks.NLI.price, 'prev starts at the start price');

  const c = St.create({ seed: 1, name: '  A very long name indeed  ', stats: { str: 3, int: 9, cha: 10 }, difficulty: 'hardcore', length: 100, tutorial: false, look: { acc: 'cap' } });
  T.eq(c.player.name, 'A very long name', 'the name is trimmed to 16 characters');
  T.eq(St.create({ name: 'Fifteen letters here' }).player.name, 'Fifteen letters', 'a cut that ends on a space leaves no trailing space');
  T.eq(St.create({ name: '   ' }).player.name, 'Stick', 'a blank name keeps the default');
  T.eq([c.stats.str, c.stats.int, c.stats.cha, c.stats.hpMax, c.stats.hp], [3, 9, 10, 18, 18], 'rolled stats, HP max 15 + STR, full HP');
  T.eq([c.mode.difficulty, c.mode.length, c.mode.tutorial, c.money.cash, c.player.look.acc], ['hardcore', 100, false, 100, 'cap'], 'mode and look');
  T.eq(St.create({ difficulty: 'relaxed' }).money.cash, 300, 'Relaxed starts with $300');
  T.eq(St.create({ difficulty: 'nonsense' }).mode.difficulty, 'standard', 'an unknown difficulty falls back to Standard');
  T.eq(St.create({ length: 0 }).mode.length, 0, 'Unlimited is length 0');
  T.eq(St.create({}).seed, 12345, 'a missing seed uses the schema default');

  const g = St.create({ seed: 3, name: 'papergod', difficulty: 'hardcore' });
  T.eq([g.mode.cheat, g.stats.str, g.stats.int, g.stats.cha, g.money.cash, g.player.name, g.stats.hpMax],
    [true, 555, 555, 555, 10000, 'Totally Legit', 570], 'the cheat name: 555s, $10,000, renamed, marked');
}

T.section('wave-1 integration additions (W1-C request 1, W1-E request R2)');
{
  const d = St.defaults();
  T.eq([d.trade.offer, d.fight.open, d.casino.match, d.crime.open], [null, null, null, null],
    'the start → :resolve records: trade.offer, fight.open, casino.match, crime.open start null');
  T.eq(d.daily.shifts, 0, 'daily.shifts: the day\'s shift count (B-05 mondayBonus)');
  T.eq(d.history, { nw: [], str: [], int: [], cha: [], karma: [] }, 'defaults() has empty history series');
  const c = St.create({ seed: 4, stats: { str: 3, int: 9, cha: 10 }, difficulty: 'relaxed' });
  T.eq(c.history, { nw: [[1, SR.rules.endgame.netWorth(c)]], str: [[1, 3]], int: [[1, 9]], cha: [[1, 10]], karma: [[1, 0]] },
    'create() seeds the day-1 point of every series as [day, value] (the shape night step 12 appends)');
  T.eq(c.history.nw[0][1], 300, 'day 1 net worth = the starting cash');
  const old = K.json(St.create({ seed: 5 }));
  delete old.trade.offer; delete old.fight.open; delete old.casino.match; delete old.crime.open; delete old.daily.shifts;
  SR.util.deepFill(old, St.defaults());
  T.eq([old.trade.offer, old.fight.open, old.casino.match, old.crime.open, old.daily.shifts], [null, null, null, null, 0],
    'an older v1 save without them is deep-filled');
}

T.section('deep-fill of a partial v1 state (the save migration)');
{
  const full = St.create({ seed: 5, name: 'Old Save' });
  const partial = K.json(full);
  delete partial.casino;
  delete partial.daily.campaign;
  delete partial.npc.crease;
  delete partial.world.skateContestDay;
  delete partial.items.coupon;
  partial.money.cash = 777;
  partial.flags.custom = 'kept';
  SR.util.deepFill(partial, St.defaults());
  T.eq(paths(partial).filter((p) => !p.startsWith('flags')), paths(St.defaults()).filter((p) => !p.startsWith('flags')), 'every missing field is filled from defaults()');
  T.eq([partial.money.cash, partial.player.name, partial.flags.custom], [777, 'Old Save', 'kept'], 'existing and unknown values are kept');
  T.eq(partial.daily.campaign.rally, 0, 'a missing nested object is filled whole');
}

T.done();
