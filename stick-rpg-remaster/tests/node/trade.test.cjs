// tests/node/trade.test.cjs — owner: W2-RulesC (W1-C in wave 1). SR.rules.trade (GDD §4.11; BALANCE B-12): trip
// resolution in the original's order (a table of scripted scenarios with fixed seeds), the draws
// per trip, the offer formulas at CHA 30 / 150 / 300 / 600, demand, take / haggle / walk, the buyer
// voicemails, the bust threshold and the bust's jail, the red-eye and the ticket, and speaking
// tours (requirements, the weekly limit, the window, the fee), plus the pipeline integration.
//   node tests/node/trade.test.cjs
'use strict';
const K = require('./w1c-kit.cjs');

const T = K.L.suite('trade (W2-RulesC)');
const SR = K.boot();
K.fixtures(SR);
const R = SR.rules.trade;
const B = SR.tuning.bus;

/** A state at 00:00 ready to board, carrying 20 bottles with a gun, ammo and a phone. */
function base(patch) {
  const s = K.state(SR, { clock: { min: 0 }, money: { cash: 1000 }, stats: { str: 300, cha: 150, heat: 0 },
    items: { booze: 20, snow: 0, gun: 1, ammo: 10, phone: 1 } });
  if (patch) SR.util.merge(s, patch);
  return s;
}

T.section('trip resolution in the original order: 14 scripted scenarios');
{
  // Each row: [what, city, state patch, scripted draws, outcome, why, check(s, trip) → bool].
  // The mugging threshold is always the first draw (int 0..range).
  const rows = [
    ['nothing to sell, no gun, no phone: wasted first', 'gusty', { items: { booze: 0, gun: 0, phone: 0 } }, { int: [0] }, 'wasted', null,
      (s) => s.money.cash === 1000],
    ['no gun (also no phone, too much): mugged', 'gusty', { items: { gun: 0, phone: 0, booze: 60 } }, { int: [0] }, 'mugged', 'noGun',
      (s) => s.money.cash === 0 && s.items.booze === 0],
    ['a gun but no ammo: mugged', 'gusty', { items: { ammo: 0, phone: 0 } }, { int: [0] }, 'mugged', 'noAmmo', (s) => s.money.cash === 0],
    ['STR 99: always mugged (99 < 100 + rand)', 'eraser', { stats: { str: 99 }, items: { phone: 0 } }, { int: [0] }, 'mugged', 'weak',
      (s) => s.money.cash === 0 && s.items.booze === 0],
    ['STR 150 against a roll of 60: mugged', 'eraser', { stats: { str: 150 } }, { int: [60] }, 'mugged', 'weak', () => true],
    ['STR 210 is safe at Las Pegas even on the top roll; then no phone', 'pegas', { stats: { str: 210 }, items: { phone: 0 } }, { int: [110] }, 'noBuyers', 'noPhone',
      (s) => s.money.cash === 1000 && s.items.booze === 20],
    ['51 bottles in Gustytown at Heat 0: busted', 'gusty', { items: { booze: 51 } }, { int: [0] }, 'busted', null,
      (s, tr) => s.items.booze === 0 && s.items.gun === 0 && s.items.ammo === 0 && tr.lost.booze === 51],
    ['50 bottles in Gustytown: not busted, an offer', 'gusty', { items: { booze: 50 } }, { int: [0, 0, 0], float: [0.5] }, 'offer', null,
      (s, tr) => tr.units === 50 && tr.want === 'booze'],
    ['50 bottles in Crayonburg (at least the threshold): busted', 'crayonburg', { items: { booze: 50 } }, { int: [0] }, 'busted', null, () => true],
    ['Heat 25 lowers the threshold to 45: 46 bottles busted', 'gusty', { stats: { heat: 25 }, items: { booze: 46 } }, { int: [0] }, 'busted', null,
      (s, tr) => tr.lost.booze === 46 && R.bustThreshold(s) === 45],
    ['screwed (the 10 % roll): the goods are gone', 'rustbelt', { items: { booze: 0, snow: 10 } }, { int: [0], float: [0.01] }, 'screwed', null,
      (s) => s.items.snow === 0 && s.money.cash === 1000],
    ['Rustbelt wants snow; bottles only: no buyers', 'rustbelt', {}, { int: [0], float: [0.5] }, 'noBuyers', 'noWant', (s) => s.items.booze === 20],
    ['Glitter Gulch, CHA 300, 10 g: 610 × 1.2 a gram', 'glitter', { stats: { cha: 300 }, items: { booze: 0, snow: 10 } }, { int: [0, 10, 1], float: [0.5] }, 'offer', null,
      (s, tr) => tr.total === 7320 && tr.perUnit === 732],
    ['Las Pegas draws the want: snow, carried 5 g', 'pegas', { items: { snow: 5 } }, { int: [0, 1, 0, 0], float: [0.5] }, 'offer', null,
      (s, tr) => tr.want === 'product' && tr.units === 5 && tr.total === Math.round(300 * 1.1 * 5)],
  ];
  rows.forEach(([what, city, patch, q, outcome, why, check], i) => {
    const s = base(patch);
    const tr = R.trip(s, city, { rng: K.scripted(SR, q, 100 + i) });
    T.ok(tr.outcome === outcome && (why === null || tr.why === why) && check(s, tr),
      (i + 1) + '. ' + what + ' → ' + tr.outcome + (tr.why ? ' (' + tr.why + ')' : ''), { outcome: tr.outcome, why: tr.why, total: tr.total });
  });
  // A bust through smuggle() jails you: base 5 (orig) + floor(Heat / 25).
  const s = base({ stats: { heat: 30 }, items: { booze: 60 } });
  const res = R.smuggle(s, 'gusty', K.ctx(SR, 3));
  T.eq([res.jailed, res.events[0].name, res.events[0].payload.outcome, s.log.yesterday.some((e) => e.kind === 'busted')],
    [{ reason: 'bust', days: 6 }, 'trip', 'busted', true], 'a bust: the trip event, jail 5 + floor(30 / 25), the log entry');
}

T.section('the bus board\'s mugging chance (B-12 mugCheck; review 2)');
{
  // mugChance is the chip the destination board shows: P(STR < 100 + rand(0..range)) at step 4,
  // checked against every roll of every city's range.
  let worst = 0;
  R.cityIds().forEach((id) => {
    const range = B.cities[id].mug;
    for (let str = 0; str <= 300; str++) {
      let n = 0;
      for (let roll = 0; roll <= range; roll++) if (str < B.mugCheck.base + roll) n++;
      worst = Math.max(worst, Math.abs(n / (range + 1) - R.mugChance(base({ stats: { str } }), id)));
    }
  });
  T.eq(worst, 0, 'mugChance is exact for every city and STR 0-300 (always at STR < 100, never at 100 + range)');
  T.eq([R.mugChance(base({ stats: { str: 210 } }), 'pegas'), R.mugChance(base({ stats: { str: 209 } }), 'pegas'), R.mugChance(base(), 'atlantis')],
    [0, 1 / 111, 0], 'Las Pegas is safe from STR 210; an unknown city reads 0');
}

T.section('draws per trip');
{
  const count = (patch, city) => { const c = K.counting(SR.rng.create(9)); R.trip(base(patch), city, { rng: c }); return c.draws; };
  T.eq([count({ items: { booze: 0 } }, 'gusty'), count({ items: { gun: 0 } }, 'gusty'), count({ items: { phone: 0 } }, 'gusty')], [1, 1, 1],
    'an early outcome takes the mugging roll only');
  T.eq(count({ items: { booze: 60 } }, 'gusty'), 1, 'a bust: one draw before the jail night');
  // The either-city offer: the mugging roll, the screwed roll, the want, the jitter, the sign.
  let d = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const c = K.counting(SR.rng.create(seed));
    const tr = R.trip(base({ items: { booze: 20, snow: 20 } }), 'pegas', { rng: c });
    if (tr.outcome === 'offer') { d = c.draws; break; }
  }
  T.eq(d, 5, 'an offer in Las Pegas: 5 draws');
}

T.section('the offer formulas at CHA 30 / 150 / 300 / 600 (orig, B-12)');
{
  const range = (cha, what) => {
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= (what === 'booze' ? 4 : 49); j++) {
      for (let sign = 0; sign <= 1; sign++) {
        const v = R.offerPerUnit(base({ stats: { cha } }), what, K.scripted(SR, { int: [j, sign] }));
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
    }
    return [lo, hi];
  };
  T.eq([30, 150, 300, 600].map((c) => range(c, 'booze')), [[5, 9], [21, 29], [46, 54], [46, 54]],
    'booze: max(5, min(CHA/6, 50) ± rand(0..4))');
  T.eq([30, 150, 300, 600].map((c) => range(c, 'product')), [[50, 109], [251, 349], [551, 649], [551, 649]],
    'product: max(50, min(2·CHA, 600) ± rand(0..49))');
  const s = base({ stats: { cha: 150 } });
  T.eq([R.demand(s, 'gusty', 'booze'), R.demand(s, 'gusty', 'product'), R.demand(s, 'glitter', 'product'), R.demand(s, 'crayonburg', 'booze')],
    [1.2, 0, 1.2, 1], 'the city demand columns of B-12a (daily demand off while tours is off)');
  const tr = R.trip(base({ stats: { cha: 150 }, items: { booze: 20 } }), 'eraser', { rng: K.scripted(SR, { int: [0, 3, 1], float: [0.5] }) });
  T.eq([tr.perUnit, tr.total], [36.4, Math.round(28 * 1.3 * 20)], 'Port Eraser: (25 + 3) × 1.3 a bottle, for all 20');
  const rt = K.features(SR, { karmaTiers: true });
  const w = R.trip(base({ stats: { cha: 150, karma: -90 }, items: { booze: 20 } }), 'eraser', { rng: K.scripted(SR, { int: [0, 3, 1], float: [0.5] }) });
  T.eq(w.total, Math.round(28 * 1.3 * 1.1 * 20), 'Wicked (P1 karmaTiers): offers +10 %');
  rt();
}

T.section('demand varies per city per day (P1 tours)');
{
  const r = K.features(SR, { tours: true });
  const s = base();
  const seen = new Set();
  let ok = true;
  for (let day = 1; day <= 60; day++) {
    s.clock.day = day;
    R.cityIds().forEach((id) => {
      const d = R.dailyDemand(s, id), t = R.tourDemand(s, id);
      seen.add(d);
      ok = ok && d >= 0.85 && d <= 1.15 && t >= 0.8 && t <= 1.3 && K.near(Math.round(d * 100), d * 100, 1e-9);
      s.clock.min = 900;
      ok = ok && R.dailyDemand(s, id) === d;
      s.clock.min = 0;
    });
  }
  T.ok(ok && seen.size > 20, 'daily demand in 0.85..1.15, tour demand in 0.80..1.30, the same all day (' + seen.size + ' values seen)');
  const d = R.rollDemand(s);
  T.eq([d.day, s.trade.demand.gusty, s.trade.tourDemand.gusty], [s.clock.day, R.dailyDemand(s, 'gusty'), R.tourDemand(s, 'gusty')], 'rollDemand writes today to the state');
  T.eq(R.demand(s, 'gusty', 'booze'), 1.2 * R.dailyDemand(s, 'gusty'), 'demand = city column × today');
  r();
}

T.section('take, walk, haggle, the buyers (B-12 take, haggle, buyerVoicemail)');
{
  const s = base({ items: { booze: 23 }, stats: { cha: 150 }, money: { cash: 100 } });
  const tr = R.trip(s, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  T.eq([tr.outcome, s.trade.offer.total], ['offer', tr.total], 'the offer waits in state.trade.offer');
  const r = R.take(s, null, { rng: K.scripted(SR, { int: [3] }) });
  T.eq([s.money.cash, s.items.booze, s.stats.karma, s.stats.heat, s.trade.offer, s.trade.smuggleProfit], [100 + tr.total, 0, -5, 15, null, tr.total],
    'take: the cash, the goods go, -5 karma (orig), +5 Heat per 10 units rounded up (23 → 15)');
  T.eq([r.msgs[0].key, r.msgs[0].vars.from, s.trade.buyers[3], r.events[0].payload.outcome, r.log[0].kind], ['trip.vm.buyer4', 'buyer4', 1, 'sold', 'smuggleDeal'],
    'a buyer voicemail (roll < 5, once each), the sold event, the log');
  const s2 = base({ items: { booze: 10 } });
  R.trip(s2, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  s2.trade.buyers = [0, 0, 0, 1, 0];
  const r2 = R.take(s2, null, { rng: K.scripted(SR, { int: [3] }) });
  const s3 = base({ items: { booze: 10 } });
  R.trip(s3, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  const r3 = R.take(s3, null, { rng: K.scripted(SR, { int: [7] }) });
  T.eq([r2.msgs.length, r3.msgs.length], [0, 0], 'no second call from the same buyer; a roll of 5-9 calls nobody');
  T.eq(R.take(s3, null, K.ctx(SR)).ok, false, 'nothing left to take');
  const again = base({ items: { booze: 10 } });
  const atr = R.trip(again, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  R.take(again, null, K.ctx(SR));
  const karma = again.stats.karma, cash = again.money.cash;
  T.eq([R.take(again, atr, K.ctx(SR)).reason, again.stats.karma, again.money.cash], ['reason.notNow', karma, cash],
    'an already-taken Trip handed in again sells nothing (no karma, no event)');
  const s4 = base();
  R.trip(s4, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  const wk = R.walk(s4);
  T.eq([wk.events[0].payload.outcome, s4.items.booze, s4.trade.offer], ['walked', 20, null], 'walk away: nothing changes hands');
  T.eq(R.haggle(base(), null, K.ctx(SR)).reason, 'reason.featureOff', 'haggle is P1 (tours)');
  const rt = K.features(SR, { tours: true, perks: true });
  const h = base({ stats: { cha: 150 } });
  const htr = R.trip(h, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  const hw = R.haggle(h, null, { rng: K.scripted(SR, { float: [0.49], int: [9] }) });
  T.eq([hw.events[0].payload.outcome, h.money.cash, hw.chance], ['sold', 1000 + Math.round(htr.total * 1.12), 0.5], 'haggle won (chance(CHA, 150)): +12 %');
  const h2 = base({ stats: { cha: 150 } });
  R.trip(h2, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  const hl = R.haggle(h2, null, { rng: K.scripted(SR, { float: [0.5] }) });
  T.eq([hl.events[0].payload.outcome, h2.items.booze, h2.trade.offer], ['walked', 20, null], 'haggle lost: the buyer walks');
  const h3 = base({ stats: { cha: 150 }, perks: { owned: ['smoothTalker'] } });
  R.trip(h3, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  T.ok(K.near(R.haggle(h3, null, { rng: K.scripted(SR, { float: [0.99] }) }).chance, 0.6, 1e-9), 'Smooth Talker: +0.10');
  const rep = base({ items: { booze: 10 } });
  R.trip(rep, 'gusty', { rng: K.scripted(SR, { int: [0, 0, 0], float: [0.5] }) });
  R.take(rep, null, K.ctx(SR));
  T.eq(rep.trade.rep.gusty, 1, 'take: +1 reputation (P1)');
  rep.trade.rep.gusty = 7;
  T.ok(K.near(R.screwedChance(rep, 'gusty'), 0.03, 1e-9) && K.near(R.screwedChance(rep, 'eraser'), 0.10, 1e-9), 'screwed: 10 % - 1 % per reputation, min 3 %');
  const v = base({ items: { gun: 0, vest: 1 }, money: { cash: 1001 } });
  R.trip(v, 'gusty', K.ctx(SR, 1));
  T.eq(v.money.cash, 501, 'a mugging with the vest (P1 tours): half the cash (floor) is lost');
  rt();
  const nv = base({ items: { gun: 0, vest: 1 } });
  R.trip(nv, 'gusty', K.ctx(SR, 1));
  T.eq(nv.money.cash, 0, 'without the flag the vest does not help (orig: all cash)');
}

T.section('boarding the red-eye (GDD §4.11, B-01)');
{
  const s = base();
  T.ok(R.canBoard(s, 'smuggle', 'gusty').ok, 'the red-eye boards at 00:00');
  s.clock.min = 30;
  T.eq([R.canBoard(s, 'smuggle', 'gusty').reason, SR.text.has('reason.redEye')], ['reason.redEye', true], 'and only then (orig; "Buses leave at 00:00", W1-C request 8)');
  s.clock.min = 0; s.money.cash = 114;
  T.eq([R.ticket(s, 'gusty'), R.canBoard(s, 'smuggle', 'gusty').reason], [115, 'reason.needCash'], 'the ticket (B-12a)');
  T.eq(R.canBoard(s, 'smuggle', 'atlantis').reason, 'reason.unknown', 'an unknown city');
  s.election.decrees = ['nationalised'];
  T.eq([R.ticket(s, 'gusty'), R.canBoard(s, 'smuggle', 'gusty').ok], [0, true], 'Sky Bus Nationalised: tickets $0 (price target ticket.<city>)');
  const b = base();
  const r = R.smuggle(b, 'gusty', K.ctx(SR, 4));
  T.eq([b.money.cash, b.clock.min, b.trade.visited.gusty, b.records.citiesVisited], [885, 1440, true, 1], 'boarding: the ticket, the whole day, the city visited');
  T.ok(r.trip && r.trip.outcome === 'offer', 'the trip resolved to an offer');
}

T.section('speaking tours (P1 tours; B-12 tour)');
{
  const tourist = (patch) => base(Object.assign({ clock: { min: 480 }, stats: { cha: 600, karma: 10, str: 300 }, job: { ranks: { nli: 'exec' } } }, patch || {}));
  T.eq(R.canBoard(tourist(), 'tour', 'gusty').reason, 'reason.featureOff', 'off without the flag');
  const rt = K.features(SR, { tours: true, degrees: true, perks: true });
  T.ok(R.canBoard(tourist(), 'tour', 'gusty').ok, 'CHA ≥ 150, karma ≥ 0, a phone, Executive: allowed');
  T.eq([
    R.canBoard(tourist({ stats: { cha: 149 } }), 'tour', 'gusty').reason,
    R.canBoard(tourist({ stats: { karma: -1 } }), 'tour', 'gusty').reason,
    R.canBoard(tourist({ items: { phone: 0 } }), 'tour', 'gusty').reason,
    R.canBoard(tourist({ job: { ranks: { nli: 'sales' } } }), 'tour', 'gusty').reason,
  ], ['reason.needStat', 'reason.karmaLow', 'reason.needPhone', 'reason.needJob'], 'each requirement refuses with its reason');
  T.ok(R.canBoard(tourist({ job: { ranks: { nli: 'sales' } }, edu: { degrees: { thr: true } } }), 'tour', 'gusty').ok, 'or the Theatre degree');
  T.ok(R.canBoard(tourist({ job: { ranks: { nli: 'ceo' } } }), 'tour', 'gusty').ok, 'CEO is Executive or better');
  T.eq([359, 360, 600, 601].map((m) => R.canBoard(tourist({ clock: { min: m } }), 'tour', 'gusty').reason),
    ['reason.notBefore', null, null, 'reason.notAfter'], 'the window 06:00-10:00, both ends inclusive');
  const s = tourist({ money: { cash: 300, bank: 0 } });
  const st = R.tourStart(s, 'gusty', K.ctx(SR, 1, { id: 'bus.tour' }));
  T.eq([st.open.skin, st.open.params.D, st.open.params.check, st.open.resolve, s.clock.min, s.money.cash, s.trade.offer.city],
    ['tourhook', 150, 'tour.hook', 'bus.tour:resolve', 1440, 185, 'gusty'], 'boarding: the hook opens, the ticket paid, the day taken');
  const want = Math.floor(600 * 3 * R.tourDemand(s, 'gusty') * 1 * 1.2 + 1e-9);
  const tr = R.tour(s, null, { beats: [true], wins: 1 }, { rng: K.scripted(SR, { int: [0] }) });
  T.eq([s.money.bank, s.money.cash, s.stats.karma, s.trade.rep.gusty, s.trade.tourWeek.gusty, s.trade.tours, tr.events[0].payload.outcome],
    [want, 185, 12, 1, 0, 1, 'toured'], 'the fee (hook won ×1.2) wired to the bank, +2 karma, +1 reputation, the week used');
  s.clock.min = 480;
  T.eq(R.canBoard(s, 'tour', 'gusty').reason, 'reason.weeklyLimit', 'one tour per city per week');
  T.ok(R.canBoard(s, 'tour', 'eraser').ok, 'another city is fine');
  s.clock.day = 8;
  T.ok(R.canBoard(s, 'tour', 'gusty').ok, 'next week, the city again');
  // The B-12 reference: CHA 600, reputation 10, demand 1.05 → $2,835.
  const ref = tourist({ trade: { rep: { gusty: 10 } } });
  let day = 1;
  for (; day < 400; day++) { ref.clock.day = day; if (R.tourDemand(ref, 'gusty') === 1.05) break; }
  T.eq([R.tourDemand(ref, 'gusty'), R.tourFee(ref, 'gusty', null)], [1.05, 2835], 'the reference tour (demand 1.05 on day ' + day + '): $2,835');
  T.eq([R.tourFee(ref, 'gusty', true), R.tourFee(ref, 'gusty', false)], [Math.floor(2835 * 1.2 + 1e-9), Math.floor(2835 * 0.8 + 1e-9)], 'the hook: ±20 %');
  ref.perks.owned = ['silverTongue'];
  ref.election.decrees = ['nationalised'];
  T.eq(R.tourFee(ref, 'gusty', null), Math.floor(2835 * 1.15 * 1.2 + 1e-9), 'Silver Tongue ×1.15, Sky Bus Nationalised ×1.2');
  const weak = tourist({ stats: { str: 50 }, money: { cash: 500, bank: 0 } });
  R.tourStart(weak, 'gusty', K.ctx(SR, 1));
  const tm = R.tour(weak, 'gusty', { wins: 0, beats: [false] }, K.ctx(SR, 2));
  T.eq([weak.money.cash, weak.money.bank > 0, tm.trip.mugged, tm.events[0].payload.outcome], [0, true, true, 'toured'],
    'mugged on a tour: only the pocket cash; the fee is safe in the bank');
  // Review 2 (W2-RulesC): CONTRACT §8.9 / §9.1 give the `trip` event a `mugged` extra (tours); the
  // payload left it out, so an arc or achievement matching { mugged: true } never saw a tour mugging.
  const safe = tourist();
  R.tourStart(safe, 'gusty', K.ctx(SR, 1));
  const ts = R.tour(safe, 'gusty', { wins: 1 }, K.ctx(SR, 2));
  const mugTrip = R.smuggle(base({ items: { gun: 0 } }), 'gusty', K.ctx(SR, 3));
  T.eq([tm.events[0].payload.mugged, ts.events[0].payload.mugged, mugTrip.events[0].payload.mugged, mugTrip.events[0].payload.outcome],
    [true, false, true, 'mugged'], 'the trip event carries `mugged`: a tour mugged on the way home, a safe tour, a mugged red-eye');
  // The resolve ('trade.tour') pays only the tour booked today, once (review probes).
  const fn = SR.reg.fn['trade.tour'];
  const nb = tourist({ money: { cash: 300, bank: 0 } });
  T.eq([fn(nb, { beats: [true], wins: 1 }, K.ctx(SR), 'gusty').reason, nb.money.bank], ['reason.notNow', 0],
    'no tour booked: the resolve pays nothing, even when the data names a city');
  R.tourStart(nb, 'gusty', K.ctx(SR, 1, { id: 'bus.tour' }));
  T.eq(fn(nb, { beats: [true], wins: 1 }, K.ctx(SR), 'eraser').reason, 'reason.notNow', 'a resolve naming another city is refused');
  const paid = fn(nb, { beats: [true], wins: 1 }, K.ctx(SR, 3));
  const bank = nb.money.bank;
  T.eq([paid.events[0].payload.outcome, bank > 0, nb.trade.offer, fn(nb, { beats: [true], wins: 1 }, K.ctx(SR, 4)).reason, nb.money.bank],
    ['toured', true, null, 'reason.notNow', bank], 'the booked tour is paid once; a repeated resolve is refused');
  const stale = tourist({ money: { cash: 300, bank: 0 } });
  R.tourStart(stale, 'gusty', K.ctx(SR, 1));
  stale.clock.day += 1;
  T.eq([fn(stale, { wins: 1 }, K.ctx(SR)).reason, stale.money.bank], ['reason.notNow', 0], 'a tour booked on an earlier day is not paid later');
  rt();
}

T.section('through the action pipeline (named fns)');
{
  const s = base({ items: { booze: 10 } });
  const snap = K.json(s);
  T.eq(K.json((SR.rules.act.preview(s, 'testc.smuggle', { city: 'gusty' }, K.ctx(SR)), s)), snap, 'the preview never mutates');
  const r = K.act(SR, s, 'smuggle', { city: 'gusty' }, 21);
  T.ok(r.ok && s.clock.min === 1440 && s.money.cash === 885, 'boarding through the pipeline');
  if (s.trade.offer) {
    const tk = K.act(SR, s, 'take', {}, 3);
    T.eq([tk.ok, tk.events[0].payload.outcome, s.log.today.some((e) => e.kind === 'smuggleDeal'), s.trade.offer], [true, 'sold', true, null],
      'take through the pipeline: the event, the log delivered');
  } else {
    T.ok(r.events.some((e) => e.name === 'trip'), 'a final outcome raised the trip event');
  }
  T.eq(K.act(SR, base(), 'take', {}).reason, 'reason.notNow', 'no offer, nothing to take');
  const pc = base({ items: { booze: 0 } });
  const pvc = SR.rules.act.preview(pc, 'testc.smuggleCost', { city: 'eraser' }, K.ctx(SR));
  const rc = K.act(SR, pc, 'smuggleCost', { city: 'eraser' }, 2);
  T.eq([pvc.cost.cash, rc.ok, pc.money.cash], [130, true, 870], 'a row whose cost is the ticket (\'trade.ticket\'): the chip shows it, it is taken once');
  const late = base({ clock: { min: 30 } });
  T.eq(K.act(SR, late, 'smuggle', { city: 'gusty' }).reason, 'reason.redEye', 'the red-eye rule through the pipeline');
}

T.done();
