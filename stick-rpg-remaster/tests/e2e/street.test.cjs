// tests/e2e/street.test.cjs — owner: W2-Street. The street cast (BUILD_PLAN §4.10; GDD §6.2, §4.18,
// §6.5; BALANCE B-26, B-04a, B-06, B-28a; UI §5.7, §9): first the rules in Node, mirroring the
// recreation's numbers (Harold: +6 CHA with the first $10, +8 CHA with the first bottle, +2 karma and
// 60 min per $10, 60 min and no karma per bottle; Skid: 60 min and -2 karma a pack, the skateboard
// with the first, -30 karma more and removal at the tenth with McHolland's voicemail; Red: $400 a
// gram as n grams, max 99 held, no time, -ceil(n / 10) karma; the junker: INT 350 hotwires it in an
// hour that fits the wall, below it the attempt fails and still costs the hour), the P1 Timing Ring
// attempt behind `arcs` and its skin, the schedules and the day-1 job offer; then the game in
// Chromium over file:// (the city's people at their spots, Red pacing, the way back after a hop,
// barks, "[E] Talk to ...", each street dialog with its chips, the NumberField, the replies, the
// tenth pack, the hotwire and the ring's minigame, the parked junker, the answering machine) with
// zero console errors. Screenshots go to shots/W2-Street/ (git-ignored).
//   node tests/e2e/street.test.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const A11Y = require('./a11y.test.cjs');
const { load } = require('../node/load.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Street');
const T = h.suite('e2e street cast (W2-Street)');

// BALANCE B-26 (copied from the document, not read from tuning.js); (orig) = the recreation's numbers.
const HAROLD = { cash: 10, min: 60, karma: 2, firstCha: 6, bottleMin: 60, bottleKarma: 0, bottleCha: 8 };
const KID = { min: 60, karma: -2, deathAt: 10, deathKarma: -30 };
const RED = { price: 400, max: 99, min: 0 };
const HOTWIRE = { int: 350, min: 60, karma: -5, heat: 15 };
const RING = { int: [200, 349], tinker: 150, hpAbove: 45, missHp: 15, alarmHeat: 10, arc: (int) => Math.min(70, Math.max(8, 20 + (int - 200) / 5)) };
const SPOTS = { harold: [2160, 2440], kid: [2090, 1110], dealer: [2920, 3420] };   // GDD §3.4 standing points
const PACE = [2880, 2960];                                                          // Red's beat at Y 3420

function rules() {
  const R = load({ mode: 'all', extra: ['js/minigames/framework.js', 'js/minigames/timingring.js'] });
  const SR = R.SR;
  const A = SR.rules.act;
  let seed = 1;
  const ctx = () => ({ rng: SR.rng.create(seed++), source: 'sim' });
  const fresh = (patch) => { const s = SR.rules.state.create({ seed: 42 }); if (patch) SR.util.merge(s, patch); return s; };
  const flags = (on) => { Object.keys(SR.features).forEach((f) => { SR.features[f] = false; }); (on || []).forEach((f) => { SR.features[f] = true; }); };
  const pv = (s, id, p) => A.preview(s, id, p || {}, ctx());
  const run = (s, id, p, c) => A.run(s, id, p || {}, c || ctx());
  const delta = (r, kind, key) => r.deltas.filter((d) => d.kind === kind && (key === undefined || d.key === key)).reduce((n, d) => n + d.n, 0);
  flags([]);

  T.section('the people and their P0 schedules (GDD §6.2, data/people.js)');
  const P = SR.reg.person;
  T.eq(Object.keys(P).sort(), ['dealer', 'harold', 'kid'], 'three named people on the street in P0: Harold, Skid, Red');
  T.eq(['harold', 'kid', 'dealer'].map((id) => [SR.text(P[id].name), P[id].look, P[id].p]),
    [['Homeless Harold', 'harold', 0], ['Skid', 'kid', 0], ['Red', 'dealer', 0]], 'names (text keys), the rig\'s looks, P0');
  const spots = SR.reg.worldmap.main.spots;
  T.eq(['harold', 'kid', 'dealer'].map((id) => { const r = P[id].schedule[0]; return [r[0], r[1], r[2], spots[r[3]]]; }),
    [['all', 0, 1440, SPOTS.harold], ['all', 0, 1440, SPOTS.kid], ['all', 0, 1440, SPOTS.dealer]], 'always (orig), at the GDD §3.4 standing points');
  T.ok(['harold', 'kid', 'dealer'].every((id) => P[id].barks.length >= 3 && P[id].barks.every((k) => SR.text.has(k) && SR.text(k).length <= 60)), 'each has three barks of ≤ 60 characters');
  T.eq([P.harold.gifts, P.kid.gifts], [{ cash: 'street.harold.give10', booze: 'street.harold.giveBottle' }, { smokes: 'street.kid.givePack' }],
    'the Bag\'s Give runs the dialog\'s own rows (GDD §6.4)');
  T.eq([A.actions('street:harold'), A.actions('street:kid'), A.actions('street:dealer'), A.actions('street:junker')],
    [['street.harold.give10', 'street.harold.giveBottle', 'street.harold.talk'], ['street.kid.givePack', 'street.kid.talk'],
      ['street.dealer.buy', 'street.dealer.talk'], ['street.junker.hotwire', 'street.junker.ring', 'street.junker.talk']], 'each street person\'s rows (building street:<npc>)');

  T.section('Homeless Harold: $10 and bottles (B-26 harold, orig)');
  let s = fresh({ money: { cash: 100 }, items: { booze: 3 } });
  const p10 = pv(s, 'street.harold.give10');
  T.eq([p10.ok, p10.cost.cash, p10.cost.min, p10.gains.map((g) => [g.kind, g.key || null, g.n])], [true, HAROLD.cash, HAROLD.min, [['stat', 'cha', HAROLD.firstCha], ['karma', null, HAROLD.karma]]],
    'Give $10: $10, 60 min; the preview shows +6 CHA (the first gift) and +2 karma');
  let r = run(s, 'street.harold.give10');
  T.eq([r.ok, delta(r, 'cash'), delta(r, 'time'), delta(r, 'stat', 'cha'), delta(r, 'karma')], [true, -HAROLD.cash, HAROLD.min, HAROLD.firstCha, HAROLD.karma], 'the first $10: -$10, 60 min, +6 CHA, +2 karma');
  T.eq([r.events.find((e) => e.name === 'gift').payload, r.stamps.map((x) => x.key), s.npc.harold.gave10], [{ npc: 'harold', item: 'cash', n: 10 }, ['stamp.stats.cha'], 1],
    'the gift rule event, the "+6 CHARM!" stamp, counted in npc.harold.gave10');
  r = run(s, 'street.harold.give10');
  T.eq([r.ok, delta(r, 'cash'), delta(r, 'time'), delta(r, 'stat', 'cha'), delta(r, 'karma'), s.npc.harold.gave10], [true, -HAROLD.cash, HAROLD.min, 0, HAROLD.karma, 2], 'the second: +2 karma and 60 min, no more CHA');
  r = run(s, 'street.harold.giveBottle');
  T.eq([r.ok, delta(r, 'item', 'booze'), delta(r, 'time'), delta(r, 'stat', 'cha'), delta(r, 'karma')], [true, -1, HAROLD.bottleMin, HAROLD.bottleCha, HAROLD.bottleKarma], 'the first bottle: -1 bottle, 60 min, +8 CHA, no karma');
  r = run(s, 'street.harold.giveBottle');
  T.eq([r.ok, delta(r, 'time'), delta(r, 'stat', 'cha'), delta(r, 'karma'), s.npc.harold.bottles], [true, HAROLD.bottleMin, 0, 0, 2], 'the second: 60 min, no CHA, no karma');
  T.eq(r.events.find((e) => e.name === 'gift').payload, { npc: 'harold', item: 'booze', n: 1 }, 'the bottle\'s gift event');
  T.eq(pv(fresh({ money: { cash: 9 } }), 'street.harold.give10').reason, 'reason.needCash', 'no $10: "Need $10"');
  T.eq(pv(fresh(), 'street.harold.giveBottle').reason, 'reason.needItem', 'no bottle: "Need Bottle of Beer" (shown, not hidden)');
  T.eq([pv(fresh({ clock: { min: 1380 } }), 'street.harold.give10').ok, pv(fresh({ clock: { min: 1410 } }), 'street.harold.give10').reason], [true, 'reason.tooLate'],
    'the wall: a gift may start at 23:00, not at 23:30 (orig: time < 24)');
  T.eq(pv(fresh({ stats: { karma: 100 } }), 'street.harold.give10').ok, true, 'karma at +100 does not block a gift (it clamps)');

  T.section('Skid, the smokes kid: packs (B-26 kid.givePack, orig)');
  s = fresh({ items: { smokes: 12 } });
  const k0 = s.stats.karma;
  const packs = [];
  for (let i = 1; i <= KID.deathAt; i++) { s.clock.min = 480; packs.push(run(s, 'street.kid.givePack')); }
  const first = packs[0];
  T.eq([first.ok, delta(first, 'item', 'smokes'), delta(first, 'time'), delta(first, 'karma'), delta(first, 'item', 'skateboard'), first.toasts.map((x) => x.key)],
    [true, -1, KID.min, KID.karma, 1, ['toast.kid.skateboard']], 'the first pack: -1 smokes, 60 min, -2 karma, and his skateboard (orig)');
  T.eq(packs.slice(1, 9).map((x) => [x.ok, delta(x, 'time'), delta(x, 'karma'), delta(x, 'item', 'skateboard')]), Array(8).fill(null).map(() => [true, KID.min, KID.karma, 0]),
    'packs 2-9: 60 min and -2 karma each, no second board');
  const tenth = packs[9];
  T.eq([tenth.ok, delta(tenth, 'karma'), s.npc.kid.dead, s.npc.kid.stage, s.npc.kid.packs, s.npc.kid.diedDay], [true, KID.karma + KID.deathKarma, true, 'dead', 10, 1],
    'the tenth: -2 and -30 karma (orig), he is gone for good (npc.kid.dead, stage dead, the day)');
  T.eq([tenth.msgs.map((m) => m.key), s.msgs.map((m) => m.from), tenth.log.map((l) => l.kind)], [['vm.mcholland.kid'], ['mcholland'], ['kidDied']],
    'McHolland\'s voicemail (orig beat, new words) and the daily log\'s kidDied (tomorrow\'s headline)');
  T.eq(s.stats.karma - k0, 10 * KID.karma + KID.deathKarma, 'ten packs: -50 karma in all');
  T.eq([pv(s, 'street.kid.givePack').reason, SR.reg.fn['street.here'](s, {}, {}, 'kid').ok], ['reason.unavailable', false], 'no eleventh pack: nobody is there');
  T.eq(pv(fresh(), 'street.kid.givePack').reason, 'reason.needItem', 'no smokes: "Need Smokes"');
  T.ok(SR.text('vm.mcholland.kid').length <= 280 && SR.text.has('news.head.kidDied'), 'the voicemail fits 280 characters; the headline template exists (W2-Home)');

  T.section('Red, the dealer: n grams (B-26 red.buy, B-06 snow, B-28a product.red)');
  [1, 9, 10, 11, 25, 99].forEach((n) => {
    const st = fresh({ money: { cash: 50000 } });
    const p = pv(st, 'street.dealer.buy', { n });
    const x = run(st, 'street.dealer.buy', { n });
    T.eq([p.ok, p.cost.cash, p.cost.min, x.ok, delta(x, 'cash'), delta(x, 'time'), delta(x, 'karma'), st.items.snow, st.npc.dealer.bought],
      [true, RED.price * n, RED.min, true, -RED.price * n, 0, -Math.ceil(n / 10), n, n], n + ' g: $' + RED.price * n + ', no time, ' + -Math.ceil(n / 10) + ' karma');
  });
  s = fresh({ money: { cash: 50000 }, items: { snow: 98 } });
  T.eq([pv(s, 'street.dealer.buy', { n: 1 }).ok, pv(s, 'street.dealer.buy', { n: 2 }).reason, pv(s, 'street.dealer.buy', { n: 2 }).vars.max], [true, 'reason.stackFull', RED.max], 'at most 99 held (orig): 98 + 1 yes, 98 + 2 no');
  r = run(s, 'street.dealer.buy', { n: 1 });
  T.eq([s.items.snow, r.events.find((e) => e.name === 'buy').payload], [99, { item: 'snow', n: 1, where: 'dealer', price: RED.price }], 'the buy rule event names Red and the price paid');
  T.eq([pv(fresh(), 'street.dealer.buy', { n: 0 }).reason, pv(fresh({ money: { cash: 799 } }), 'street.dealer.buy', { n: 2 }).reason, pv(fresh({ money: { cash: 400 } }), 'street.dealer.buy').ok],
    ['reason.amount', 'reason.needCash', true], 'no grams: "Enter an amount"; short: "Need $800"; without n it is one gram');
  flags(['arcs']);
  const loyal = fresh({ money: { cash: 50000 }, npc: { dealer: { bought: 100 } } });
  const week = SR.reg.fn['mods.redWeek'](loyal);
  T.eq(pv(loyal, 'street.dealer.buy', { n: 10 }).cost.cash, Math.floor(RED.price * 10 * week * 0.9 + 0.5), 'P1 arcs: the week\'s factor and the loyalty 10 % apply to the whole purchase (B-28a)');
  flags([]);

  T.section('the junker on the lawn: the P0 hotwire (B-26 junker.hotwire; GDD §4.18)');
  s = fresh({ stats: { int: HOTWIRE.int - 1 } });
  let ph = pv(s, 'street.junker.hotwire');
  T.eq([ph.ok, ph.cost.min, ph.chance], [true, HOTWIRE.min, 0], 'INT 349: the attempt is allowed, 1 h, the chance chip shows 0 %');
  r = run(s, 'street.junker.hotwire');
  T.eq([r.ok, delta(r, 'time'), delta(r, 'karma'), delta(r, 'heat'), s.player.cars.junker.owned], [true, HOTWIRE.min, 0, 0, false], 'below INT 350 it fails and still costs the hour (orig)');
  s = fresh({ stats: { int: HOTWIRE.int } });
  ph = pv(s, 'street.junker.hotwire');
  T.eq([ph.chance, ph.gains.map((g) => [g.kind, g.n])], [1, [['karma', HOTWIRE.karma], ['heat', HOTWIRE.heat]]], 'INT 350: 100 %, -5 karma, +15 Heat previewed');
  r = run(s, 'street.junker.hotwire');
  T.eq([r.ok, delta(r, 'time'), delta(r, 'karma'), delta(r, 'heat'), s.player.cars.junker], [true, HOTWIRE.min, HOTWIRE.karma, HOTWIRE.heat, { owned: true, bought: false, x: 727, y: 1113, a: 0, towed: false }],
    'INT 350: the car is yours where it stands (bought: false, B-18), 1 h, -5 karma, +15 Heat (new)');
  T.eq(pv(s, 'street.junker.hotwire').hidden, true, 'once yours the row hides');
  T.eq([pv(fresh({ stats: { int: 400 }, clock: { min: 1380 } }), 'street.junker.hotwire').ok, pv(fresh({ stats: { int: 400 }, clock: { min: 1410 } }), 'street.junker.hotwire').reason], [true, 'reason.tooLate'],
    'it fits the wall: 23:00 yes, 23:30 no (the original had no clock check)');
  T.eq(pv(fresh({ stats: { int: 250 } }), 'street.junker.ring').hidden, true, 'the ring row hides while arcs is off (P0 has the plain attempt only)');

  T.section('P1 arcs: the Timing Ring attempt and the hotwire skin (B-26 junker.ring, GDD §6.5)');
  flags(['arcs']);
  const strong = { stats: { str: 50, hpMax: 65, hp: 65 } };
  T.eq([200, 250, 349, 350, 199].map((int) => { const st = fresh({ stats: { int } }); return [pv(st, 'street.junker.hotwire').hidden === true, pv(st, 'street.junker.ring').hidden === true]; }),
    [[true, false], [true, false], [true, false], [false, true], [false, true]], 'INT 200-349 offers the ring instead of the plain attempt; 350 and 199 keep the plain one');
  T.eq(pv(fresh({ stats: { int: 250 } }), 'street.junker.ring').reason, 'reason.tooHurt', 'the ring needs HP > 45 (its worst case: 3 misses × 15)');
  s = fresh(SR.util.merge({ stats: { int: 250 } }, strong));
  r = run(s, 'street.junker.ring');
  T.eq([r.ok, delta(r, 'time'), r.open && r.open.skin, r.open && r.open.resolve, s.flags.junkerRing], [true, 60, 'hotwire', 'street.junker.ring:resolve', 1], 'the ring: 1 h, opens the hotwire skin, the attempt in progress');
  r = run(s, 'street.junker.ring:resolve', { started: true, hits: 3, misses: 2 });
  T.eq([r.ok, delta(r, 'hp'), delta(r, 'karma'), delta(r, 'heat'), s.player.cars.junker.owned], [true, -2 * RING.missHp, HOTWIRE.karma, HOTWIRE.heat, true], '3 hits: the car starts (-5 karma, +15 Heat); 2 misses cost 30 HP');
  T.eq(run(s, 'street.junker.ring:resolve', { started: true, hits: 3, misses: 0 }).reason, 'reason.notNow', 'a stray second resolve pays nothing');
  s = fresh(SR.util.merge({ stats: { int: 250 } }, strong));
  run(s, 'street.junker.ring');
  r = run(s, 'street.junker.ring:resolve', { started: false, hits: 1, misses: 3 });
  T.eq([delta(r, 'hp'), delta(r, 'heat'), delta(r, 'karma'), s.player.cars.junker.owned, r.toasts.map((x) => x.key)], [-3 * RING.missHp, RING.alarmHeat, 0, false, ['toast.junker.alarm']], '3 misses: -45 HP, the alarm (+10 Heat), no car');
  s = fresh(SR.util.merge({ stats: { int: 250 } }, strong));
  run(s, 'street.junker.ring');
  r = run(s, 'street.junker.ring:resolve', { started: false, hits: 1, misses: 1, exited: true });
  T.eq([delta(r, 'hp'), delta(r, 'heat'), s.player.cars.junker.owned], [-RING.missHp, 0, false], 'leaving early: the misses so far, no alarm, no car');
  flags(['arcs', 'perks']);
  const tink = fresh({ stats: { int: RING.tinker }, perks: { owned: ['tinkerer'] } });
  T.eq([pv(tink, 'street.junker.ring').hidden, pv(fresh({ stats: { int: RING.tinker } }), 'street.junker.ring').hidden], [false, true], 'Tinkerer: from INT 150 (B-21)');
  const skin = SR.reg.skin.hotwire, TR = SR.reg.minigame.timingring;
  T.eq([skin.engine, skin.stake, SR.text(skin.text.title)], ['timingring', true, 'Hotwire'], 'the skin: Timing Ring, stake-bearing (Hardcore pending), titled');
  const arcAt = (st) => TR.arcDeg(st, skin.params(st));
  T.eq([200, 250, 349, 600, 100].map((int) => Math.round(arcAt(fresh({ stats: { int } })) * 100) / 100), [200, 250, 349, 600, 100].map((int) => Math.round(RING.arc(int) * 100) / 100),
    'the sweet arc clamp(20° + (INT - 200) / 5, 8°, 70°)');
  T.eq(Math.round(arcAt(tink) * 100) / 100, Math.round(RING.arc(RING.tinker) * 1.5 * 100) / 100, 'Tinkerer widens it by half (sweet × 1.5)');
  T.eq([skin.params(fresh()).mode, skin.params(fresh()).step, TR.opts(skin.params(fresh())).presses], ['unlock', 0, 5], 'unlock mode, step 0, up to 5 presses (3 hits or 3 misses)');
  const st349 = fresh({ stats: { int: 349 } }), pr = RING.arc(349) / 360, q = 1 - pr;
  const want = pr * pr * pr * (1 + 3 * q + 6 * q * q);   // three hits before three misses
  const rng = SR.rng.create(2026);
  let wins = 0;
  const N = 6000;
  for (let i = 0; i < N; i++) if (SR.minigame.auto('hotwire', {}, rng, st349).started) wins++;
  T.ok(Math.abs(wins / N - want) < 0.01, 'Auto presses hit with p = arc / 360° (INT 349: ' + (100 * wins / N).toFixed(2) + ' % vs ' + (100 * want).toFixed(2) + ' %)');
  flags([]);

  T.section('talking, the day-1 job offer, greetings');
  s = fresh();
  ['harold', 'kid', 'dealer', 'junker'].forEach((id) => {
    const d = SR.reg.action['street.' + id + '.talk'];
    const x = run(s, 'street.' + id + '.talk');
    T.eq([d.silent, d.timeRule, x.ok, x.deltas, x.events], [true, 'free', true, [], [{ name: 'talk', payload: { npc: id } }]], 'street.' + id + '.talk: silent and free, the talk rule event');
  });
  s = fresh();
  r = run(s, 'street.jobOffer');
  T.eq([r.ok, r.deltas, s.msgs.map((m) => [m.key, m.from, m.day, m.read]), s.flags.jobOffer], [true, [], [['vm.mel.job', 'mel', 1, false]], true], 'the job offer: Mel\'s voicemail (W2-Food\'s text), free, once');
  T.eq(run(s, 'street.jobOffer').reason, 'reason.alreadyDone', 'never twice');
  const g = (id, st) => SR.reg.fn['greet.' + id](st, {}, { params: {} });
  T.eq([g('kid', fresh()).key, g('kid', fresh({ npc: { kid: { packs: 2 } } })).key, g('kid', fresh({ npc: { kid: { packs: 6 } } })).key], ['greet.kid.first', 'greet.kid.again', 'greet.kid.worse'],
    'Skid\'s greeting: the first ask, then his "supplier", then the cough');
  T.eq([g('harold', fresh()).key, g('harold', fresh({ clock: { min: 1260 } })).key, g('harold', fresh({ npc: { harold: { gave10: 3 } } })).key], ['greet.harold.day', 'greet.harold.night', 'greet.harold.friend'],
    'Harold\'s: by day, by night, to a friend');
  T.eq([g('dealer', fresh()), g('dealer', fresh({ npc: { dealer: { bought: 5 } } })).key], [{ key: 'greet.dealer.pitch', vars: { price: '$400' } }, 'greet.dealer.regular'], 'Red\'s pitch names the day\'s price');
  T.eq([g('junker', fresh()).key, g('junker', fresh({ stats: { int: 350 } })).key], ['greet.junker.look', 'greet.junker.smart'], 'the junker\'s line hints at INT');
  // The original's answering-machine beats (the recreation's pushMsg calls), each in new words here:
  // the day-1 job offer, the kid's death, the NLI promotions, the three car-hit lawyers, the five
  // buyers after a deal, the nomination, the day-365 call (BUILD_PLAN §4.10: W2-Street queues the
  // first and writes the second; the others are their packages' keys).
  const BEATS = ['vm.mel.job', 'vm.mcholland.kid', 'vm.bea.hired', 'vm.gil.promoted', 'vm.frankie.promoted', 'vm.bea.exec', 'vm.terry.vp', 'vm.terry.ceo',
    'vm.carhit.1', 'vm.carhit.2', 'vm.carhit.3', 'trip.vm.buyer1', 'trip.vm.buyer2', 'trip.vm.buyer3', 'trip.vm.buyer4', 'trip.vm.buyer5', 'vm.board.nominated', 'vm.crew.day365'];
  T.eq(BEATS.filter((k) => !SR.text.has(k)), [], 'every original voicemail beat has its text (' + BEATS.length + ' keys; tools/shingles.cjs checks the words are new)');
  const keys = Object.keys(SR.reg.text).filter((k) => /^(person|act|greet|card|toast|bark|vm)\.(street|harold|kid|dealer|junker|mcholland)\b/.test(k) || /^person\./.test(k) || /^mg\.hotwire\./.test(k));
  T.ok(keys.length >= 45 && keys.every((k) => SR.registry.file('text', k) === 'js/data/text/en-street.js'), keys.length + ' street text keys, all in en-street.js');
  return SR;
}

(async () => {
  rules();

  // ------------------------------------------------------------------------------------------------
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, a) => t.eval(fn, a);
  fs.mkdirSync(SHOTS, { recursive: true });
  const shot = (name) => t.shot(path.join(SHOTS, name));
  const city = async () => { await ev(() => { window.SR.scenes.go('city', {}, { transition: false }); return true; }); await t.step(2); };
  const people = () => ev(() => window.SR.world.streetnpcs.people.map((e) => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), state: e.state, clip: e.clip, facing: e.facing })));
  const choices = () => ev(() => Array.from(document.querySelectorAll('#ui .dlg-choice[data-choice]')).map((b) => b.getAttribute('data-choice')));
  const line = () => ev(() => { const el = document.querySelector('#ui [data-id="dialog-text"]'); return el ? el.querySelector('.vh').textContent : null; });
  const text = (key, vars) => ev(([k, v]) => { const x = window.SR.reg.text[k]; return Array.isArray(x) ? x.map((y) => window.SR.util.fmt(y, v || {})) : [window.SR.text(k, v)]; }, [key, vars]);
  const clearToasts = () => ev(() => { if (window.SR.ui.toast && window.SR.ui.toast.clear) window.SR.ui.toast.clear(); if (window.SR.ui.stamp && window.SR.ui.stamp.clear) window.SR.ui.stamp.clear(); return true; });
  /** Walks (teleports) near a person, lets the world settle, presses Interact. */
  const talkTo = async (x, y) => { await t.teleport(x, y); await t.step(10); await t.press('interact'); await t.step(3); };

  T.section('a new game: Mel\'s day-1 job offer waits on the answering machine (UI §9)');
  const s0 = await t.newGame({});
  T.eq(s0.msgs.map((m) => [m.key, m.from, m.day, m.read]), [['vm.mel.job', 'mel', 1, false]], 'one unread voicemail from Mel on day 1 (W2-Food\'s vm.mel.job)');
  T.eq(await ev(() => window.SR.rng.rules.state()), s0.rng.rules, 'queuing it draws nothing from the rules stream');
  await ev(() => { window.SR.save.write('slot2'); window.SR.save.load('slot2'); return true; });
  T.eq((await t.state()).msgs.filter((m) => m.key === 'vm.mel.job').length, 1, 'loading that day-1 save does not queue it again');
  await ev(() => { const SR = window.SR; SR.state.msgs = []; SR.state.flags.jobOffer = true; SR.save.write('slot2'); SR.save.load('slot2'); return true; });
  T.eq((await t.state()).msgs.length, 0, '... nor after it was offered once (flags.jobOffer)');
  await ev(() => { window.SR.save.remove('slot2'); return true; });

  T.section('the city: the people at their spots, Red pacing, barks, the way back after a hop');
  await t.newGame({});
  await t.set({ items: { booze: 2, smokes: 12 }, money: { cash: 50000 } });
  await city();
  let ps = await people();
  T.eq(ps.map((e) => [e.id, e.y]), [['harold', SPOTS.harold[1]], ['kid', SPOTS.kid[1]], ['dealer', SPOTS.dealer[1]]], 'Harold, Skid and Red are in the city (SR.world.entities(\'person\'))');
  T.eq([ps[0].x, ps[1].x, ps[0].clip, ps[0].facing, ps[1].state], [SPOTS.harold[0], SPOTS.kid[0], 'sit', 90, 'pause'], 'Harold sits by Sticky\'s (legs to the street), Skid stands at the mansion corner');
  const paced = await ev(() => { const SR = window.SR, e = SR.world.streetnpcs.get('dealer'), xs = []; for (let i = 0; i < 60 * 12; i++) { SR.world.update(SR.STEP); xs.push(e.x); } return { min: Math.min.apply(null, xs), max: Math.max.apply(null, xs), y: e.y, walk: e.state }; });
  T.ok(paced.min >= PACE[0] - 0.5 && paced.max <= PACE[1] + 0.5 && paced.max - paced.min > 60 && paced.y === SPOTS.dealer[1], 'Red paces X 2880-2960 at Y 3420 (' + Math.round(paced.min) + '-' + Math.round(paced.max) + ')');
  const hop = await ev(() => {
    const SR = window.SR, W = SR.world, e = W.streetnpcs.get('harold');
    W.player.car = null; W.teleport(2230, 2440);
    W.player.a = Math.PI; W.player.hopAside(e);
    const at = { x: e.x, y: e.y, state: e.state };
    for (let i = 0; i < 60 * 3; i++) W.update(SR.STEP);
    return { at, back: { x: e.x, y: e.y, state: e.state, clip: e.clip } };
  });
  T.ok(hop.at.state === 'hop' && Math.abs(hop.at.y - SPOTS.harold[1]) === 24, 'your car makes him hop 24 u aside (W1-W hopAside)', hop.at);
  T.eq(hop.back, { x: SPOTS.harold[0], y: SPOTS.harold[1], state: 'pause', clip: 'sit' }, 'then he walks back to his corner and sits down again');
  const bark = await ev(() => {
    const SR = window.SR, W = SR.world;
    W.teleport(2600, 1110); for (let i = 0; i < 10; i++) W.update(SR.STEP);
    W.teleport(2090, 1250); for (let i = 0; i < 10; i++) W.update(SR.STEP);
    const e = W.streetnpcs.get('kid');
    return { bark: e.bark, t: e.barkT };
  });
  T.ok(/^bark\.kid\.[123]$/.test(bark.bark) && bark.t > 0, 'coming near, Skid calls out a bark (' + bark.bark + ')');
  await t.teleport(2200, 2380);
  await t.step(10);
  T.ok(/Talk to Homeless Harold/.test(await t.uiText()), 'within 96 u: "[E] Talk to Homeless Harold"');
  await clearToasts();
  await shot('city-harold.png');

  T.section('Harold\'s dialog (UI §5.7): chips, the gifts, the replies');
  await t.press('interact');
  await t.step(3);
  T.eq(await t.scenes(), ['city', 'dialog'], 'Interact opens the Dialog sheet over the frozen city');
  T.eq(await choices(), ['street.harold.give10', 'street.harold.giveBottle', 'leave'], 'Give $10, Give a bottle, Leave');
  const opening = await line();
  T.ok((await text('greet.harold.day')).indexOf(opening) >= 0, 'his day greeting (' + opening + ')');
  T.ok(await ev(() => /Give \$10/.test(document.querySelector('#ui [data-id="choice-street.harold.give10"]').textContent)), 'the row reads "Give $10" (the amount from B-26)');
  const chips = await ev(() => document.querySelector('#ui [data-choice="street.harold.give10"] .dlg-chips').textContent);
  T.ok(/\$10/.test(chips) && /1h/.test(chips) && /\+6/.test(chips) && /\+2/.test(chips), 'its chips: -$10, 1h, +6 CHA, +2 karma (' + chips + ')');
  let a = await t.eval(A11Y.audit, '[data-id="street-harold"]');
  T.eq(a.issues, [], 'a11y: the street dialog');
  await shot('dialog-harold.png');
  let before = await t.state();
  await t.clickUI('choice-street.harold.give10');
  await t.step(3);
  let after = await t.state();
  T.eq([after.money.cash - before.money.cash, after.stats.cha - before.stats.cha, after.stats.karma - before.stats.karma, after.clock.min - before.clock.min], [-10, 6, 2, 60], 'Give $10: -$10, +6 CHA, +2 karma, 1 h');
  T.eq([await t.scenes(), await line()], [['city', 'dialog'], (await text('card.harold.first10'))[0]], 'the sheet comes back with his thanks for the first gift');
  await clearToasts();
  await shot('dialog-harold-thanks.png');
  await t.clickUI('choice-street.harold.give10');
  await t.step(3);
  T.ok((await text('card.harold.thanks10')).indexOf(await line()) >= 0, 'a later $10 gets one of his other lines');
  before = await t.state();
  await t.clickUI('choice-street.harold.giveBottle');
  await t.step(3);
  after = await t.state();
  T.eq([after.items.booze - before.items.booze, after.stats.cha - before.stats.cha, after.stats.karma - before.stats.karma, after.clock.min - before.clock.min, await line()],
    [-1, 8, 0, 60, (await text('card.harold.firstBottle'))[0]], 'Give a bottle: -1 bottle, +8 CHA (the first), no karma, 1 h, his reply');
  await t.press('back');
  await t.step(2);
  T.eq([await t.scenes(), await ev(() => window.SR.world.streetnpcs.talking)], [['city'], null], 'Esc leaves (the dialog\'s Leave)');

  T.section('Skid: ten packs through the dialog');
  await t.setTime(480);
  await talkTo(2090, 1180);
  T.eq([await choices(), await line()], [['street.kid.givePack', 'leave'], (await text('greet.kid.first'))[0]], 'his first ask and the pack row');
  await shot('dialog-kid.png');
  await t.clickUI('choice-street.kid.givePack');
  await t.step(3);
  let st = await t.state();
  T.eq([st.items.skateboard, st.npc.kid.packs, await line()], [1, 1, (await text('card.kid.firstPack'))[0]], 'the first pack: his skateboard, and his thanks');
  T.ok(await ev(() => { const e = window.SR.world.streetnpcs.get('kid'); return typeof e.look === 'object' && e.look.acc.indexOf('skateboard') < 0; }), 'he no longer carries the board');
  for (let i = 2; i <= 9; i++) {
    await t.setTime(480);
    await t.clickUI('choice-street.kid.givePack');
    await t.step(3);
  }
  st = await t.state();
  T.eq([st.npc.kid.packs, st.npc.kid.dead], [9, false], 'nine packs, still coughing');
  T.ok((await text('card.kid.cough')).indexOf(await line()) >= 0, 'from the sixth pack on, only coughs');
  const k9 = st.stats.karma;
  await t.clickUI('choice-street.kid.givePack');
  await t.step(3);
  st = await t.state();
  T.eq([st.npc.kid.dead, st.stats.karma - k9, await line(), await choices()], [true, KID.karma + KID.deathKarma, (await text('card.kid.last'))[0], ['leave']], 'the tenth: his last words, -32 karma, only Leave');
  await clearToasts();
  await shot('dialog-kid-last.png');
  await t.press('back');
  await t.step(3);
  ps = await people();
  T.eq([ps.map((e) => e.id), st.msgs.filter((m) => m.key === 'vm.mcholland.kid').length], [['harold', 'dealer'], 1], 'he is gone from the city; McHolland\'s voicemail is in the inbox');
  const cityPrompt = () => ev(() => { const d = window.SR.scenes.get('city').debug, p = d && d.prompt(); return p ? { kind: p.kind, id: p.id || null } : null; });
  T.eq(await cityPrompt(), null, 'no "Talk to Skid" at his corner any more (the city\'s prompt)');
  const memorial = await ev(() => { const X = window.SR.art.exteriorDetail; return X && typeof X.stateKey === 'function' ? X.stateKey('home_mansion', window.SR.state) : null; });
  T.ok(memorial === null || /memorial/.test(memorial), 'the mansion\'s exterior detail now shows his memorial (W2-Exterior reads npc.kid.dead: ' + memorial + ')');
  await shot('city-kid-gone.png');

  T.section('Red: Buy n grams with the NumberField');
  await talkTo(2920, 3480);
  T.eq(await choices(), ['street.dealer.buy', 'leave'], 'Buy snow, Leave');
  const nf = await ev(() => { const i = document.querySelector('#ui [data-id="choice-street.dealer.buy-n-input"]'); return i ? { v: i.value } : null; });
  T.eq(nf, { v: '1' }, 'the NumberField starts at 1 gram');
  await ev(() => { const i = document.querySelector('#ui [data-id="choice-street.dealer.buy-n-input"]'); i.value = '11'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; });
  await t.step(1);
  const redChips = await ev(() => document.querySelector('#ui [data-choice="street.dealer.buy"] .dlg-chips').textContent);
  T.ok(/\$4,400/.test(redChips) && /-2/.test(redChips) && /\+11/.test(redChips), 'at 11 g the chips say -$4,400, -2 karma, +11 snow (' + redChips + ')');
  a = await t.eval(A11Y.audit, '[data-id="street-dealer"]');
  T.eq(a.issues, [], 'a11y: Red\'s dialog with the NumberField');
  await shot('dialog-red.png');
  before = await t.state();
  await t.clickUI('choice-street.dealer.buy');
  await t.step(3);
  after = await t.state();
  T.eq([after.items.snow, before.money.cash - after.money.cash, after.clock.min - before.clock.min, after.stats.karma - before.stats.karma], [11, 4400, 0, -2], 'bought 11 g: $4,400, no time, -2 karma');
  T.ok((await text('card.dealer.sold', { n: 11 })).indexOf(await line()) >= 0, 'Red\'s reply (' + (await line()) + ')');
  await t.press('back');
  await t.step(2);

  T.section('the junker: the hotwire, the parked car');
  await t.set({ stats: { int: 7 } });
  await t.setTime(600);
  await talkTo(727, 1200);
  T.eq([await choices(), await line()], [['street.junker.hotwire', 'leave'], (await text('greet.junker.look'))[0]], 'the unlocked car: Try to hotwire it, Leave');
  T.ok(/0 %/.test(await ev(() => document.querySelector('#ui [data-choice="street.junker.hotwire"] .dlg-chips').textContent)), 'the chance chip warns: 0 %');
  await shot('dialog-junker.png');
  await t.clickUI('choice-street.junker.hotwire');
  await t.step(3);
  st = await t.state();
  T.eq([st.clock.min, st.player.cars.junker.owned, await line()], [660, false, (await text('card.junker.failed'))[0]], 'INT 7: it fails and costs the hour');
  await t.press('back');
  await t.step(2);
  await t.set({ stats: { int: 350 } });
  await talkTo(727, 1200);
  await t.clickUI('choice-street.junker.hotwire');
  await t.step(3);
  st = await t.state();
  T.eq([st.clock.min, st.player.cars.junker.owned, st.stats.heat, await line(), await choices()], [720, true, 15, (await text('card.junker.started'))[0], ['leave']], 'INT 350: it starts; the car is yours (only Leave now)');
  await t.press('back');
  await t.step(3);
  await clearToasts();
  await t.teleport(727, 1170);
  await t.step(10);
  const parked = await ev(() => { const SR = window.SR, j = SR.world.streetnpcs.parkedJunker(); return j && { kind: j[0].kind, x: j[0].x, y: j[0].y }; });
  T.eq(parked, { kind: 'junker', x: 727, y: 1113 }, 'the parked junker is drawn where it stands (a car source of SR.render.actors)');
  T.eq(await cityPrompt(), { kind: 'car', id: null }, 'by the car: "[C] Get in the car", no more junker dialog');
  await shot('city-junker-yours.png');
  const drove = await ev(() => { const SR = window.SR; SR.debug.press('car'); SR.world.update(SR.STEP); return { car: SR.world.player.car, drawn: SR.world.streetnpcs.parkedJunker() }; });
  T.eq(drove, { car: 'junker', drawn: null }, 'driving it: the player draws it, the parked sprite goes');
  await ev(() => { const SR = window.SR; SR.debug.press('car'); SR.world.update(SR.STEP); return true; });

  T.section('P1 arcs: the ring through the dialog and the hotwire frame');
  await t.newGame({});
  await ev(() => { window.SR.debug.feature('arcs', true); return true; });
  await t.set({ stats: { int: 250, str: 50, hpMax: 65, hp: 65 } });
  await city();
  await talkTo(727, 1200);
  T.eq(await choices(), ['street.junker.ring', 'leave'], 'INT 250 with arcs: "Feel for the right wires" replaces the plain attempt');
  await t.clickUI('choice-street.junker.ring');
  await t.step(5);
  const mg = await ev(() => { const c = window.SR.minigame.current(); return c && { id: c.id, skin: c.skin, arc: c.inst.peek().arc, total: c.inst.peek().total }; });
  T.eq(mg, { id: 'timingring', skin: 'hotwire', arc: RING.arc(250), total: 5 }, 'the Timing Ring opens with the hotwire skin (arc ' + RING.arc(250) + '°)');
  await ev(() => { const c = window.SR.minigame.current(); for (let k = 0; k < 400 && c.inst.peek().hits < 2; k++) { const p = c.inst.peek(); c.inst.update((((p.arcC - p.angle) % 360 + 360) % 360) / p.speed); c.inst.onAction('press', {}); c.inst.update(0.2); } return true; });
  await t.step(2);
  await shot('hotwire-ring.png');
  await ev(() => { window.SR.minigame.current().host.finish({ started: true, hits: 3, misses: 1 }); return true; });
  await t.step(150);
  st = await t.state();
  T.eq([await t.scenes(), st.player.cars.junker.owned, st.stats.hp, st.stats.heat, st.stats.karma, await line()], [['city', 'dialog'], true, 50, 15, -5, (await text('card.junker.started'))[0]],
    'three sparks: the car is yours, one miss cost 15 HP, and the sheet says so');
  await t.press('back');
  await t.step(2);
  await ev(() => { window.SR.debug.feature('arcs', false); return true; });

  T.section('night and a larger window');
  await t.newGame({});
  await t.setTime(1320);
  await city();
  await t.teleport(2200, 2380);
  await t.step(10);
  await t.press('interact');
  await t.step(3);
  T.ok((await text('greet.harold.night')).indexOf(await line()) >= 0, 'at 22:00 Harold has his night line');
  await clearToasts();
  await shot('dialog-harold-night.png');
  await t.press('back');
  await t.step(2);
  await t.resize(1920, 1080);
  await t.teleport(2250, 2330);
  await t.step(150);
  await clearToasts();
  await shot('city-night-1920.png');
  await t.resize(1280, 720);

  T.section('no game: the title\'s backdrop still has the cast');
  const backdrop = await ev(() => { const SR = window.SR, keep = SR.state; SR.state = null; const ids = SR.world.streetnpcs.judge(true).map((e) => e.id); SR.state = keep; SR.world.streetnpcs.judge(true); return ids; });
  T.eq(backdrop.sort(), ['dealer', 'harold', 'kid'], 'without a state everyone stands at their first spot');

  T.eq(t.errors(), [], 'no console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
