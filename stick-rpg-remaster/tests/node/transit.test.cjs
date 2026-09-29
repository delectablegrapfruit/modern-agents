// tests/node/transit.test.cjs — owner: W2-Transit. The bus depot, trip, jail and hospital data of
// W2-Transit through the real action pipeline in Node (BUILD_PLAN §4.9 acceptance; GDD §4.10,
// §4.11, §4.16; BALANCE B-01, B-11c, B-12, B-16, B-31):
//   - registrations: the depot building and its one card row, the `trip` / `jail` / `hospital`
//     owners (never card rows), feature flags on every P1 row, Tabby's departure-clock greeting;
//   - trips only at 00:00 with a ticket (paid once, as the row's cost), the original check order with
//     fixed seeds (wasted, no gun, no ammo, too weak, no phone, busted, screwed, the offer), the bust
//     threshold with Heat (and Crayonburg's "at least"), take / walk / haggle (P1), tours (P1) and
//     "Wait for the tour bus" (P1);
//   - jail length (base + floor(Heat / 25)), the Jail Day choices, the jail nights and the release
//     (08:00, Heat 20), bail (P1), and a timed game that ends in jail;
//   - HP 0: the hospital bill per difficulty with the shortfall written off, the hospital night (the
//     next day at 12:00, HP 50 %), Hardcore's death, a timed game that ends in hospital, and the
//     discharge row.
//   node tests/node/transit.test.cjs
'use strict';
const L = require('./load.cjs');

const T = L.suite('transit (W2-Transit)');
const warns = [];
const { SR } = L.load({ mode: 'rules', console: { log: console.log, warn: (...a) => warns.push(a.join(' ')), error: console.error } });

const json = (v) => JSON.parse(JSON.stringify(v));
const ctx = (seed) => ({ rng: SR.rng.create(seed === undefined ? 1 : seed), source: 'sim' });
const run = (s, id, params, seed) => SR.rules.act.run(s, id, params || {}, ctx(seed));
const preview = (s, id, params) => SR.rules.act.preview(s, id, params || {}, { source: 'ui' });
const tripEv = (r) => (r.events || []).filter((e) => e.name === 'trip').map((e) => e.payload)[0] || null;
function flags(map) {
  const old = {};
  Object.keys(map).forEach((k) => { old[k] = SR.features[k]; SR.features[k] = !!map[k]; });
  return () => Object.keys(old).forEach((k) => { SR.features[k] = old[k]; });
}

/** A new game (seed 7) with a patch; STR keeps the hpMax invariant. */
function state(patch, opts) {
  const s = SR.rules.state.create(Object.assign({ seed: 7 }, opts || {}));
  if (patch) SR.util.merge(s, patch);
  s.stats.hpMax = SR.tuning.start.hpMaxBase + s.stats.str;
  if (!(patch && patch.stats && patch.stats.hp !== undefined)) s.stats.hp = s.stats.hpMax;
  return s;
}
/** At 00:00, ready for the red-eye: $1,000, STR 300, CHA 150, 20 bottles, a gun, ammo, a phone. */
function ready(patch) {
  const s = state({ clock: { min: 0 }, money: { cash: 1000, bank: 0 }, stats: { str: 300, cha: 150, heat: 0 },
    items: { booze: 20, snow: 0, gun: 1, ammo: 10, phone: 1 } });
  if (patch) SR.util.merge(s, patch);
  s.stats.hpMax = SR.tuning.start.hpMaxBase + s.stats.str;
  s.stats.hp = Math.min(s.stats.hp, s.stats.hpMax);
  return s;
}

// ------------------------------------------------------------------------------------------------
T.section('registrations: the depot, its card row and the trip, jail and hospital owners');
{
  const b = SR.reg.building.bus;
  T.eq([b.name, b.owner, b.portrait, b.music, b.interior, b.exteriorId], ['place.bus', 'tabby', 'tabby', 'midnight_express', 'bus', 'bus'],
    'building bus: Tabby at the depot, midnight_express, the depot interior');
  T.eq(SR.rules.act.actions('bus'), ['bus.board'], 'the depot card shows one row: the destination board');
  T.eq(SR.reg.action['bus.board'].screen, 'bus.board', 'bus.board opens the sub-screen bus.board');
  T.eq(SR.rules.act.actions('trip'), ['trip.redeye', 'trip.take', 'trip.haggle', 'trip.walk', 'trip.tour', 'bus.wait'],
    'the trip owner: the red-eye, the offer decisions, the tour and the wait (never card rows)');
  T.eq(SR.rules.act.actions('jail'), ['jail.day', 'jail.bail'], 'the jail owner: the day\'s choice and bail');
  T.eq(SR.rules.act.actions('hospital'), ['hospital.discharge'], 'the hospital owner: the discharge');
  const p1 = ['trip.haggle', 'trip.tour', 'trip.tour:resolve', 'bus.wait', 'jail.bail'];
  T.ok(p1.every((id) => SR.reg.action[id].p === 1 && !!SR.reg.action[id].feature), 'every P1 row carries its feature flag',
    p1.map((id) => [id, SR.reg.action[id].feature]));
  T.eq(['trip.haggle', 'trip.tour', 'bus.wait'].map((id) => SR.reg.action[id].feature).concat(SR.reg.action['jail.bail'].feature),
    ['tours', 'tours', 'tours', 'police'], 'tours behind `tours`, bail behind `police` (Appendix B)');
  const ids = ['bus.board', 'trip.redeye', 'trip.take', 'trip.haggle', 'trip.walk', 'trip.tour', 'bus.wait', 'jail.day', 'jail.bail', 'hospital.discharge'];
  T.ok(ids.every((id) => !SR.reg.action[id].repeatable), 'no transit row is repeatable (trips, jail and hospital are irreversible)');
  T.ok(ids.concat(['trip.tour:resolve']).every((id) => SR.text.has(SR.reg.action[id].label)), 'every row label is registered text');
  T.eq(warns.filter((w) => /act\.(names|feature|repeatable)/.test(w)), [], 'the pipeline\'s boot check finds nothing to warn about');
}

T.section('Tabby\'s greeting is the departure clock (GDD §6.1 "Next red-eye", P0)');
{
  const g = (patch) => json(SR.reg.fn['greet.bus'](state(patch), {}, {}));
  T.eq(g({ clock: { min: 0 } }).key, 'greet.bus.now', '00:00: the red-eye is boarding');
  T.eq(g({ clock: { min: 1440 } }).key, 'greet.bus.late', '24:00: the day\'s bus has gone');
  const w = g({ clock: { min: 870 } });
  T.eq([w.key, w.vars.left], ['greet.bus.wait', '9h 30m'], '14:30: next red-eye in 9h 30m');
  T.eq(g({ clock: { min: 600 }, stats: { heat: SR.tuning.crime.police.appearHeat } }).key, 'greet.bus.heat', 'from the police Heat: a word about customs');
  const off = flags({ tours: true });
  T.eq(g({ clock: { min: 420 } }).key, 'greet.bus.tour', 'tours on, 07:00: the tour buses are boarding');
  off();
  T.ok(SR.text('greet.bus.wait', w.vars).indexOf('9h 30m') >= 0, 'the greeting text carries the time left');
  // Tabby's trip warnings (GDD §6.2) come before the clock: a bag at the bust threshold, cargo unarmed.
  const armed = { gun: 1, ammo: 10 };
  const heavy = g({ clock: { min: 0 }, items: Object.assign({ booze: 50 }, armed) });
  T.eq([heavy.key, heavy.vars.n], ['greet.bus.heavy', 50], 'a bag of 50 at Heat 0: customs (a bust in Crayonburg, the threshold elsewhere)');
  T.eq(g({ clock: { min: 0 }, items: Object.assign({ snow: 40 }, armed), stats: { heat: 50 } }).vars.n, 40, 'the threshold follows Heat (50 - floor(Heat / 5))');
  T.eq(g({ clock: { min: 0 }, items: Object.assign({ booze: 49 }, armed) }).key, 'greet.bus.now', 'under the threshold, armed: the red-eye is boarding');
  T.eq(g({ clock: { min: 870 }, items: { booze: 10, gun: 1, ammo: 0 } }).key, 'greet.bus.unarmed', 'cargo with an empty gun: a warning about muggers');
  T.eq(g({ clock: { min: 870 }, items: { booze: 0, gun: 0, ammo: 0 } }).key, 'greet.bus.wait', 'no cargo: no warning, the clock');
  T.ok(SR.text('greet.bus.heavy', heavy.vars).length <= 140 && SR.text('greet.bus.heavy', heavy.vars).indexOf('50') >= 0, 'the warning names the number (greet ≤ 140)');
}

// ------------------------------------------------------------------------------------------------
T.section('the red-eye leaves only at 00:00, with a ticket (GDD §4.1, §4.11; B-01 redEyeDeparts)');
{
  const P = (patch, params) => json(preview(ready(patch), 'trip.redeye', params || { city: 'gusty', kind: 'smuggle' }));
  const at8 = P({ clock: { min: 480 } });
  T.eq([at8.ok, at8.reason, SR.text(at8.reason, at8.vars)], [false, 'reason.redEye', 'Buses leave at 00:00'], '08:00: "Buses leave at 00:00"');
  T.eq(P({ clock: { min: 1410 } }).reason, 'reason.redEye', '23:30: not yet');
  T.eq(P({ clock: { min: 1440 } }).reason, 'reason.redEye', '24:00: gone (wake at 00:00 to catch it)');
  const at0 = P();
  T.eq([at0.ok, at0.cost.cash], [true, SR.tuning.bus.cities.gusty.ticket], '00:00: boards; the ticket ($115 to Gustytown) is the row\'s cost chip');
  T.eq(P({ money: { cash: 50 } }).reason, 'reason.needCash', 'short of the ticket: refused');
  T.eq(P({}, { city: 'atlantis', kind: 'smuggle' }).reason, 'reason.unknown', 'an unknown city: refused');
  T.eq(P({ clock: { min: 480 } }, { city: 'gusty' }).reason, 'reason.redEye', 'without params.kind the row still boards only at 00:00');
  Object.keys(SR.tuning.bus.cities).forEach((id) => {
    T.eq(P({}, { city: id, kind: 'smuggle' }).cost.cash, SR.tuning.bus.cities[id].ticket, 'ticket to ' + id + ' (B-12a)');
  });
  const s = ready();
  const r = run(s, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, 3);
  T.eq([r.ok, s.money.cash, s.clock.min, s.clock.day], [true, 1000 - 115, 1440, 1], 'boarding takes the ticket once and the whole day (the clock to 24:00, same day)');
  T.eq(json(s.trade.offer) && s.trade.offer.outcome, 'offer', 'the buyer\'s offer waits in state.trade.offer');
  const again = run(s, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, 3);
  T.eq([again.ok, again.reason], [false, 'reason.redEye'], 'and there is no second trip that day');
}

T.section('the original check order with fixed seeds (GDD §4.11 steps 1-8)');
{
  const trip = (city, patch, seed) => {
    const s = ready(patch);
    const r = run(s, 'trip.redeye', { city, kind: 'smuggle' }, seed);
    // A final outcome raises the `trip` event; an offer waits in state.trade.offer instead.
    return { s, r, ev: tripEv(r) || (s.trade.offer ? { outcome: s.trade.offer.outcome } : null) };
  };
  let x = trip('gusty', { items: { booze: 0, snow: 0, gun: 0, phone: 0 } });
  T.eq([x.ev.outcome, x.s.money.cash], ['wasted', 885], '1 nothing to sell: a wasted trip (before the gun and phone checks)');
  x = trip('gusty', { items: { gun: 0, phone: 0, booze: 60 } });
  T.eq([x.ev.outcome, x.ev.key, x.s.money.cash, x.s.items.booze], ['mugged', 'trip.mugged.noGun', 0, 0], '2 no gun: mugged, all cash and goods (before the bust)');
  x = trip('gusty', { items: { ammo: 0 } });
  T.eq([x.ev.outcome, x.ev.key], ['mugged', 'trip.mugged.noAmmo'], '3 a gun but no ammo: mugged');
  x = trip('eraser', { stats: { str: 99 } });
  T.eq([x.ev.outcome, x.ev.key], ['mugged', 'trip.mugged.weak'], '4 STR < 100 + rand(0..range): mugged (STR 99 always)');
  x = trip('pegas', { stats: { str: 210 }, items: { phone: 0, booze: 70 } });
  T.eq([x.ev.outcome, x.ev.key, x.s.items.booze], ['noBuyers', 'trip.noBuyers.noPhone', 70], '5 no phone: no buyers (STR 210 is always safe in Las Pegas; before the bust)');
  x = trip('gusty', { items: { booze: 51 } });
  T.eq([x.ev.outcome, x.r.jailed && x.r.jailed.reason, x.s.items.booze, x.s.items.gun, x.s.items.ammo], ['busted', 'bust', 0, 0, 0],
    '6 busted: goods, gun and ammo gone, jail');
  // 7 screwed is a 10 % roll: find it among fixed seeds, then check the seed replays the same trip.
  const outcomes = {};
  let screwedSeed = null;
  for (let seed = 1; seed <= 120; seed++) {
    const o = trip('rustbelt', { items: { booze: 0, snow: 10 } }, seed).ev.outcome;
    outcomes[o] = (outcomes[o] || 0) + 1;
    if (o === 'screwed' && screwedSeed === null) screwedSeed = seed;
  }
  T.ok(screwedSeed !== null && outcomes.offer > outcomes.screwed, '7 screwed happens on some seeds (about 10 %)', outcomes);
  x = trip('rustbelt', { items: { booze: 0, snow: 10 } }, screwedSeed);
  T.eq([x.ev.outcome, x.s.items.snow, x.s.money.cash], ['screwed', 0, 1000 - SR.tuning.bus.cities.rustbelt.ticket],
    'the screwed seed replays: the goods are gone, the cash stays');
  const a = trip('glitter', { stats: { cha: 300 }, items: { booze: 0, snow: 10 } }, 11);
  const b = trip('glitter', { stats: { cha: 300 }, items: { booze: 0, snow: 10 } }, 11);
  T.eq([a.s.trade.offer.outcome, json(a.s.trade.offer)], ['offer', json(b.s.trade.offer)], '8 the offer: the same seed, the same offer');
  T.eq(json(a.r.events.filter((e) => e.name === 'trip')), [], 'an offer raises no `trip` event until it is decided');
}

T.section('the bust threshold with Heat: 50 - floor(Heat / 5); Crayonburg "at least" (B-12)');
{
  const busted = (city, heat, n) => {
    const s = ready({ stats: { heat }, items: { booze: n } });
    return (tripEv(run(s, 'trip.redeye', { city, kind: 'smuggle' }, 1)) || {}).outcome === 'busted';
  };
  T.eq([busted('gusty', 0, 50), busted('gusty', 0, 51)], [false, true], 'Heat 0 in Gustytown: 50 pass, 51 are busted');
  T.eq([busted('gusty', 25, 45), busted('gusty', 25, 46)], [false, true], 'Heat 25: the threshold is 45');
  T.eq([busted('gusty', 100, 30), busted('gusty', 100, 31)], [false, true], 'Heat 100: the threshold is 30');
  T.eq([busted('crayonburg', 25, 44), busted('crayonburg', 25, 45)], [false, true], 'Crayonburg busts at the threshold itself (orig)');
  const s = ready({ stats: { heat: 25 }, items: { booze: 60 } });
  const r = run(s, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, 1);
  const days = SR.tuning.crime.jail.bases.bust + Math.floor(25 / SR.tuning.crime.jail.heatDiv);
  T.eq([r.jailed.days, r.report && r.report.kind, s.jail.daysLeft, s.jail.served, s.clock.day, s.clock.min],
    [days, 'jail', days - 1, 1, 2, 480], 'the bust jails for 5 + floor(Heat / 25) days; the arrest night runs at once (08:00 in the cell)');
  T.eq(r.events.map((e) => e.name).filter((n) => n === 'trip' || n === 'jail'), ['trip', 'jail'], 'the `trip` (busted) event, then `jail`');
}

T.section('the offer: take it, walk away, haggle (P1)');
{
  const s = ready();
  run(s, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, 5);
  const offer = json(s.trade.offer);
  const before = { cash: s.money.cash, karma: s.stats.karma, heat: s.stats.heat };
  const pv = json(preview(s, 'trip.take'));
  T.ok(pv.ok && pv.gains.some((g) => g.kind === 'cash' && g.n === offer.total), 'the Take it preview shows the offer as a cash gain', pv.gains);
  const r = run(s, 'trip.take', {}, 5);
  const ev = tripEv(r);
  T.eq([r.ok, ev.outcome, s.money.cash - before.cash, s.stats.karma - before.karma, s.stats.heat - before.heat, s.items.booze],
    [true, 'sold', offer.total, -5, 5 * Math.ceil(20 / 10), 0], 'Take it: the cash, -5 karma (orig), +5 Heat per 10 units, the goods go');
  T.eq(run(s, 'trip.take', {}, 5).reason, 'reason.notNow', 'a second Take it is refused (the offer is closed)');
  const w = ready();
  run(w, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, 5);
  const rw = run(w, 'trip.walk', {}, 5);
  T.eq([tripEv(rw).outcome, w.items.booze, w.trade.offer], ['walked', 20, null], 'Walk away: the goods stay, the offer closes');
  const hv = json(preview(w, 'trip.haggle'));
  T.eq(hv.hidden, true, 'Haggle is hidden while `tours` is off');
  const off = flags({ tours: true });
  const results = [];
  for (let seed = 1; seed <= 16; seed++) {
    const h = ready();
    run(h, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, seed);
    if (!h.trade.offer) continue;   // a screwed trip has nothing to haggle over
    const total = h.trade.offer.total;
    const hr = run(h, 'trip.haggle', {}, seed);
    const e = tripEv(hr);
    results.push(e.outcome);
    if (e.outcome === 'sold') T.eq(e.cash, Math.round(total * 1.12), 'a won haggle pays +12 % (seed ' + seed + ')');
  }
  T.ok(results.indexOf('sold') >= 0 && results.indexOf('walked') >= 0, 'Haggle either sells at +12 % or the buyer walks', results);
  off();
}

// ------------------------------------------------------------------------------------------------
T.section('tours (P1 `tours`) and "Wait for the tour bus"');
{
  const s0 = state({ clock: { min: 180 } });
  T.eq(json(preview(s0, 'bus.wait')).hidden, true, 'the wait row is hidden while `tours` is off');
  const off = flags({ tours: true });
  const s = state({ clock: { min: 180 } });
  const r = run(s, 'bus.wait');
  T.eq([r.ok, s.clock.min], [true, SR.tuning.time.waitTour], '03:00: waiting sets the clock to 06:00, nothing else');
  T.eq(json(preview(s, 'bus.wait')).hidden, true, 'from 06:00 the wait row is hidden');
  const t = state({ clock: { min: 420 }, money: { cash: 500, bank: 0 }, stats: { cha: 300, karma: 5 }, items: { phone: 1 },
    job: { ranks: { nli: 'exec' } } });
  const pv = json(preview(t, 'trip.tour', { city: 'eraser', kind: 'tour' }));
  T.eq([pv.ok, pv.cost.cash], [true, SR.tuning.bus.cities.eraser.ticket], '07:00, CHA 300, an Executive with a phone: the tour boards');
  T.eq(json(preview(state({ clock: { min: 700 }, stats: { cha: 300 }, items: { phone: 1 }, job: { ranks: { nli: 'exec' } } }),
    'trip.tour', { city: 'eraser', kind: 'tour' })).reason, 'reason.notAfter', '11:40: past the window ("Only until 10:00")');
  const tr = run(t, 'trip.tour', { city: 'eraser', kind: 'tour' }, 2);
  T.eq([tr.ok, tr.open && tr.open.minigame, tr.open && tr.open.resolve, t.clock.min], [true, 'tourhook', 'trip.tour:resolve', 1440],
    'boarding opens the tourhook skin, resolved by trip.tour:resolve; the tour takes the day');
  const bank0 = t.money.bank;
  const rr = run(t, 'trip.tour:resolve', { beats: [true], wins: 1 }, 2);
  T.eq([rr.ok, tripEv(rr).outcome, t.money.bank > bank0, t.trade.tourWeek.eraser], [true, 'toured', true, 0],
    'the resolve pays the fee to the bank and uses the city\'s week');
  T.eq(run(t, 'trip.tour:resolve', { beats: [true], wins: 1 }, 2).reason, 'reason.notNow', 'a repeated resolve never pays twice');
  off();
}

// ------------------------------------------------------------------------------------------------
T.section('jail: length, the Jail Day choices, the nights and the release (B-11c)');
{
  SR.def.action('testtransit.arrest', { building: 'testtransit', group: 'special', label: 'act.jail.day', p: 0, timeRule: 'free',
    effects: [['fn', 'crime.jail', 'store']] });
  const s = state({ clock: { min: 1440 }, stats: { heat: 60, str: 20, int: 20, cha: 20 } });
  const days = SR.tuning.crime.jail.bases.store + Math.floor(60 / 25);
  const a = run(s, 'testtransit.arrest');
  T.eq([a.jailed.days, a.report.kind, s.jail.daysLeft, s.jail.served], [days, 'jail', days - 1, 1], 'a store robbery at Heat 60: 3 + 2 = 5 days; the arrest night is the first');
  const pv = json(preview(s, 'jail.day', { choice: 'str' }));
  T.ok(pv.ok && pv.gains.some((g) => g.kind === 'stat' && g.key === 'str' && g.n === 2), 'the Work out preview shows +2 STR', pv.gains);
  const got = [];
  ['str', 'int', 'cha'].forEach((c) => {
    const from = s.stats[c];
    const r = run(s, 'jail.day', { choice: c }, 4);
    got.push([c, s.stats[c] - from, r.report && r.report.kind, s.clock.min]);
  });
  T.eq(got, [['str', 2, 'jail', 480], ['int', 2, 'jail', 480], ['cha', 2, 'jail', 480]], 'each choice: +2 to its stat, then the jail night (08:00 again)');
  T.eq(s.jail.daysLeft, 1, 'one day left');
  s.stats.hp = 5;
  const last = run(s, 'jail.day', { choice: 'hp' }, 4);
  T.eq([s.stats.hp, s.jail, s.stats.heat, s.clock.min, s.clock.day, last.events.some((e) => e.name === 'release')],
    [15, null, SR.tuning.crime.jail.release.heat, 480, 6, true], 'Keep your head down: +10 HP; released on the last morning: Heat 20, 08:00');
  T.eq([s.records.jailDays, s.records.jailWorkouts], [days, 1], 'records: 5 jail days, 1 workout');
  T.eq(run(s, 'jail.day', { choice: 'str' }).reason, 'reason.notNow', 'out of jail: no more Jail Days');
  T.eq(json(preview(s, 'jail.bail')).hidden, true, 'bail is hidden while `police` is off');
  const off = flags({ police: true });
  const b = state({ clock: { min: 1440 }, money: { cash: 5000, bank: 0 }, items: { phone: 1 } });
  run(b, 'testtransit.arrest');
  const bp = json(preview(b, 'jail.bail'));
  const br = run(b, 'jail.bail');
  T.eq([bp.ok, br.ok, b.jail, br.events.some((e) => e.name === 'release' && e.payload.bailed)], [true, true, null, true], 'bail (P1): the lawyer gets you out today');
  const nb = state({ clock: { min: 1440 }, money: { cash: 5000, bank: 0 }, items: { phone: 0 } });
  run(nb, 'testtransit.arrest');
  T.eq(json(preview(nb, 'jail.bail')).reason, 'reason.needPhone', 'bail needs a phone');
  off();
}

T.section('the game can end in jail (a timed game; GDD §4.10 "jail days count and can end it")');
{
  const s = state({ clock: { day: 2, min: 0 }, money: { cash: 1000 }, stats: { str: 300 }, items: { booze: 60, gun: 1, ammo: 10, phone: 1 } }, { length: 3 });
  const r = run(s, 'trip.redeye', { city: 'gusty', kind: 'smuggle' }, 1);
  T.eq([r.jailed.days, s.clock.day, s.over], [5, 3, false], 'busted on day 2 of 3: the arrest night brings day 3');
  const d = run(s, 'jail.day', { choice: 'int' }, 1);
  T.eq([d.ok, s.over, d.over && d.over.reason, s.result && s.result.reason, !!s.jail], [true, true, 'time', 'time', true],
    'the next jail night passes the last day: the game ends in jail');
}

// ------------------------------------------------------------------------------------------------
T.section('HP 0: the hospital bill per difficulty, the shortfall written off (B-16, B-31)');
{
  const fall = (patch, opts) => {
    const s = state(Object.assign({ clock: { min: 900 }, stats: { hp: 5 } }, patch), opts);
    const r = run(s, 'world.fall', { x: 10, y: 20 }, 2);
    // The hospital night runs the economy (GDD §4.7 steps 0-5): the bank earns its interest after the bill.
    const interest = r.down && r.down.report ? r.down.report.lines.filter((l) => l.key === 'report.interest').reduce((a, l) => a + l.vars.n, 0) : 0;
    return { s, r, d: r.down, bank: s.money.bank - interest };
  };
  let x = fall({ money: { cash: 300, bank: 1000 } });
  const bill = Math.max(50, Math.floor(0.10 * 1300));
  T.eq([x.d.outcome, x.d.bill, x.d.writtenOff, x.s.money.cash, x.bank], ['hospital', bill, 0, 300 - bill, 1000],
    'Standard: max($50, 10 % of cash + bank) = $130, paid from cash');
  T.eq([x.s.clock.day, x.s.clock.min, x.s.stats.hp, x.s.records.hospital, x.d.report.kind],
    [2, 720, Math.floor(0.5 * x.s.stats.hpMax), 1, 'hospital'], 'the hospital night: the next day at 12:00, HP = 50 % of HP max');
  T.ok(x.d.report.lines.some((l) => l.key === 'report.hospital.bill') && x.d.report.lines.some((l) => l.key === 'report.hospital.discharge'),
    'the Stick General lines (the bill, the discharge) are in the report');
  x = fall({ money: { cash: 20, bank: 1000 } });
  T.eq([x.d.bill, x.s.money.cash, x.bank], [102, 0, 918], 'cash first, then the bank (before the night\'s interest)');
  x = fall({ money: { cash: 20, bank: 10 } });
  T.eq([x.d.bill, x.d.writtenOff, x.s.money.cash, x.bank], [50, 20, 0, 0], 'the $50 minimum; the $20 shortfall is written off (never below 0)');
  x = fall({ money: { cash: 300, bank: 1000 } }, { difficulty: 'relaxed' });
  T.eq([x.d.outcome, x.d.bill, x.s.money.cash], ['hospital', 0, 300], 'Relaxed: the gag, no bill');
  x = fall({ money: { cash: 300, bank: 1000 } }, { difficulty: 'hardcore' });
  T.eq([x.d.outcome, x.s.over, x.r.over && x.r.over.reason, x.s.clock.day], ['death', true, 'death', 1], 'Hardcore: FLATLINED, the game is over');
  x = fall({ clock: { day: 3, min: 900 }, money: { cash: 300, bank: 0 } }, { length: 3 });
  T.eq([x.d.outcome, x.s.over, x.r.over && x.r.over.reason], ['hospital', true, 'time'], 'a timed game can end in hospital (day 3 of 3)');
  const h = fall({ money: { cash: 300, bank: 0 } }).s;
  const snap = json(h);
  const dr = run(h, 'hospital.discharge');
  T.eq([dr.ok, dr.deltas.length, json(h).clock], [true, 0, snap.clock], 'the discharge is free and changes nothing in the rules');
}

T.done();
