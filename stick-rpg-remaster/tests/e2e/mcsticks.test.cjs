// tests/e2e/mcsticks.test.cjs — owner: W2-Food. McSticks (BUILD_PLAN §4.4; GDD §4.6, §4.7, §6.1;
// BALANCE B-05, B-06, B-28a): first the rules in Node (every price, HP value and time of B-06 after
// the B-28a modifiers, the full-HP refusal, repeatable food rows, the Takeout variant and the Mega
// Meal behind `shopsPlus`, the cook's shift with Half / Overtime, the Order Up hustle and the Shift
// Manager promotion behind `hustles`, Mel's voicemails and greetings), then the game in Chromium
// over file:// (the card, clicks, R to repeat, the Hustle button, the Order Up frame, the interior
// at noon and at night) with zero console errors. Screenshots go to shots/W2-Food/ (git-ignored).
//   node tests/e2e/mcsticks.test.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const { load } = require('../node/load.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Food');
const T = h.suite('e2e McSticks (W2-Food)');

// BALANCE B-06 (copied from the document, not read from tuning.js): price, HP, minutes.
const FOOD = { milkshake: [8, 12, 30], fries: [12, 20, 30], cheeseburger: [25, 40, 30], tripleburger: [50, 80, 30], megameal: [120, 200, 30] };
const EMPLOYEE_PCT = 25;        // B-05 employeeDiscount / B-28a `employee`
const TAKEOUT_ADD = 2;          // B-06 takeout: item price + 2 (B-28a `takeout`)
const TAKEOUT_STACK = 5;        // B-06 takeout stack
const THU_TRIPLE = 40;          // B-28a thuTriple (P1 calendar)
const MEGA_HPMAX = 200;         // B-06 megameal: appears once HP max ≥ 200
const COOK_FULL = [42, 360, 1]; // B-05: cook Full $42, 6 h, +1 karma
const HALF = [21, 180, 0];      // B-05 shift.half: same $/h, no karma
const OT = [21, 120, 10];       // B-05 shift.overtime: 2 h at 1.5 × $7, -10 HP
const MANAGER = { cha: 20, shifts: 15, full: 60 };   // B-05 manager (P1)
const BURGER_DAY_PCT = 50;      // B-28a burgerDay (P1 calendar)
const HEAT_WAVE_SHAKE = 2;      // B-19 heatWave: milkshakes heal ×2 (P1 calendar)
const IRON_STOMACH = 1.25;      // B-06 / B-21 ironStomach: food heals ×1.25 (P1 perks)
const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9);

// ------------------------------------------------------------------------------------------------
// The rules in Node (mode all: the building data, the text, the skins; plus the Shift Rush engine)

function rules() {
  const R = load({ mode: 'all', extra: ['js/minigames/framework.js', 'js/minigames/shiftrush.js'] });
  const SR = R.SR;
  const A = SR.rules.act;
  let seed = 1;
  const ctx = () => ({ rng: SR.rng.create(seed++), source: 'sim' });
  const fresh = (patch) => { const s = SR.rules.state.create({ seed: 42 }); if (patch) SR.util.merge(s, patch); return s; };
  const flags = (on) => { Object.keys(SR.features).forEach((f) => { SR.features[f] = false; }); (on || []).forEach((f) => { SR.features[f] = true; }); };
  const pv = (s, id, p) => A.preview(s, id, p || {}, ctx());
  const run = (s, id, p) => A.run(s, id, p || {}, ctx());

  T.section('the building and its rows');
  const b = SR.reg.building.mcsticks;
  T.eq([b.owner, b.portrait, b.music, b.interior], ['mel', 'mel', 'fry_day', 'mcsticks'], 'McSticks: Mel, fry_day, its interior');
  flags([]);
  const s0 = fresh({ stats: { hp: 5 } });
  const rows = A.actions('mcsticks').filter((id) => !pv(s0, id).hidden);
  T.eq(rows, ['mcsticks.milkshake', 'mcsticks.fries', 'mcsticks.cheeseburger', 'mcsticks.tripleburger', 'mcsticks.work'],
    'P0 card: four foods then the shift (the Mega Meal and the promotion hide with their flags off)');
  T.eq(Object.keys(FOOD).map((f) => SR.text('act.mcsticks.' + f)), ['Milkshake', 'Fries', 'Cheeseburger', 'Triple Burger', 'Mega Meal'], 'row labels');

  T.section('B-06 food after the B-28a modifiers (P0)');
  Object.keys(FOOD).filter((f) => f !== 'megameal').forEach((f) => {
    const [price, hp, min] = FOOD[f];
    const id = 'mcsticks.' + f;
    const cook = fresh({ stats: { hp: 1, str: 300, hpMax: 315 } });
    const p = pv(cook, id);
    const want = roundHalfUp(price * (1 - EMPLOYEE_PCT / 100));
    T.eq([p.ok, p.cost.cash, p.cost.min, p.gains.find((g) => g.kind === 'hp').n, p.badges], [true, want, min, hp, ['employee']], f + ': a Fry Cook pays $' + want + ' (' + EMPLOYEE_PCT + ' % off $' + price + '), +' + hp + ' HP, ' + min + ' m');
    const before = SR.util.clone(cook);
    const r = run(cook, id);
    T.eq([r.ok, before.money.cash - cook.money.cash, cook.stats.hp - before.stats.hp, cook.clock.min - before.clock.min], [true, want, hp, min], f + ': the run charges, heals and takes the time');
    const eat = r.events.find((e) => e.name === 'eat'), buy = r.events.find((e) => e.name === 'buy');
    T.eq([eat && eat.payload, buy && buy.payload], [{ item: f, hp, where: 'mcsticks' }, { item: f, n: 1, where: 'mcsticks', price: want }], f + ': the eat and buy rule events');
    const walkIn = fresh({ stats: { hp: 1, str: 300, hpMax: 315 }, job: { ranks: { mcsticks: null } } });
    T.eq(pv(walkIn, id).cost.cash, price, f + ': $' + price + ' without a McSticks job');
    const full = fresh();
    const pf = pv(full, id);
    T.eq([pf.ok, pf.reason], [false, 'reason.fullHp'], f + ': refused at full HP ("Full HP", orig)');
    T.eq([pv(full, id).repeatable, !!SR.reg.action[id].repeatable, !SR.reg.action[id].confirm], [true, true, true], f + ': repeatable (R and hold-to-repeat)');
  });
  const over = fresh({ stats: { hp: 20 } });
  const po = pv(over, 'mcsticks.fries');
  T.eq([po.gains[0].n, po.gains[0].capped], [2, true], 'overheal shows the capped gain "+2 (full)"');
  T.eq(pv(fresh({ stats: { hp: 1 } }), 'mcsticks.fries', { variant: 'takeout' }).hidden, true, 'the Takeout variant is hidden while shopsPlus is off');

  T.section('Thursday and the flyer coupon (P1 calendar, B-28a)');
  flags(['calendar']);
  const thu = fresh({ clock: { day: 4 }, stats: { hp: 1 } });
  T.eq(pv(thu, 'mcsticks.tripleburger').cost.cash, roundHalfUp(THU_TRIPLE * (1 - EMPLOYEE_PCT / 100)), 'Thursday Triple Burger: $40, then the employee 25 % → $30');
  T.eq(pv(fresh({ clock: { day: 4 }, stats: { hp: 1 }, job: { ranks: { mcsticks: null } } }), 'mcsticks.tripleburger').cost.cash, THU_TRIPLE, 'Thursday Triple Burger without the job: $40');
  T.eq(pv(fresh({ clock: { day: 3 }, stats: { hp: 1 }, job: { ranks: { mcsticks: null } } }), 'mcsticks.tripleburger').cost.cash, FOOD.tripleburger[0], 'Wednesday: $50');

  T.section('Burger Day, the Heat Wave and Iron Stomach (P1 calendar, perks; B-19, B-21, B-28a)');
  flags(['calendar']);
  const bd = fresh({ stats: { hp: 1 }, world: { cityEvent: { id: 'burgerDay', day: 1 } } });
  const pbd = pv(bd, 'mcsticks.fries');
  T.eq([pbd.cost.cash, pbd.badges], [roundHalfUp(FOOD.fries[0] * (1 - BURGER_DAY_PCT / 100)), ['burgerDay']], 'Burger Day: fries $6 for a cook (only the largest percent discount applies: 50 %, not the employee 25 %)');
  const hw = fresh({ stats: { hp: 1, str: 300, hpMax: 315 }, world: { cityEvent: { id: 'heatWave', day: 1 } } });
  T.eq(pv(hw, 'mcsticks.milkshake').gains[0].n, FOOD.milkshake[1] * HEAT_WAVE_SHAKE, 'Heat Wave: a milkshake heals ×2 (+24 HP)');
  const h0 = hw.stats.hp;
  const rhw = run(hw, 'mcsticks.milkshake');
  T.eq([hw.stats.hp - h0, rhw.events.find((e) => e.name === 'eat').payload.hp], [FOOD.milkshake[1] * HEAT_WAVE_SHAKE, FOOD.milkshake[1] * HEAT_WAVE_SHAKE], '... the run heals +24 and the eat event says so');
  T.eq(pv(hw, 'mcsticks.fries').gains[0].n, FOOD.fries[1], '... other food heals as usual');
  T.eq(pv(fresh({ stats: { hp: 1 }, world: { cityEvent: { id: 'heatWave', day: 2 } } }), 'mcsticks.milkshake').gains[0].n, FOOD.milkshake[1], '... only on the event\'s day');
  flags([]);
  T.eq(pv(fresh({ stats: { hp: 1 }, world: { cityEvent: { id: 'heatWave', day: 1 } } }), 'mcsticks.milkshake').gains[0].n, FOOD.milkshake[1], '... and only with the calendar flag');
  flags(['perks']);
  const iron = fresh({ stats: { hp: 1, str: 300, hpMax: 315 }, perks: { owned: ['ironStomach'] } });
  const i0 = iron.stats.hp;
  run(iron, 'mcsticks.fries');
  T.eq(iron.stats.hp - i0, Math.floor(FOOD.fries[1] * IRON_STOMACH), 'Iron Stomach: fries heal floor(20 × 1.25) = 25');
  flags([]);

  T.section('Free Fries Friday and Good karma (B-28a: fixed prices first, then only the largest percent)');
  const decree = (patch) => { const s = fresh(patch); s.election.decrees = ['freeFriesFriday']; return s; };
  const fri = decree({ clock: { day: 5 }, stats: { hp: 1 } });
  T.eq(Object.keys(FOOD).filter((f) => f !== 'megameal').map((f) => [pv(fri, 'mcsticks.' + f).cost.cash, pv(fri, 'mcsticks.' + f).badges.indexOf('freeFriesFriday') >= 0]),
    [[0, true], [0, true], [0, true], [0, true]], 'Free Fries Friday (decree): every McSticks food is $0 on a Friday, with its badge');
  T.eq(pv(decree({ clock: { day: 4 }, stats: { hp: 1 } }), 'mcsticks.fries').cost.cash, roundHalfUp(FOOD.fries[0] * (1 - EMPLOYEE_PCT / 100)), '... and only on Fridays (Thursday: the employee $9)');
  flags(['karmaTiers']);
  const goodCook = fresh({ stats: { hp: 1, karma: 60 } });
  T.eq([pv(goodCook, 'mcsticks.fries').cost.cash, pv(goodCook, 'mcsticks.fries').badges], [roundHalfUp(FOOD.fries[0] * (1 - EMPLOYEE_PCT / 100)), ['employee']],
    'Good karma and the employee discount: only the larger (25 %) applies, $9');
  const goodWalkIn = fresh({ stats: { hp: 1, karma: 60 }, job: { ranks: { mcsticks: null } } });
  T.eq([pv(goodWalkIn, 'mcsticks.fries').cost.cash, pv(goodWalkIn, 'mcsticks.fries').badges], [roundHalfUp(FOOD.fries[0] * 0.9), ['goodKarma']],
    'Good karma without the job: 10 % off, $11 (10.8 rounded half up)');
  flags([]);

  T.section('Takeout and the Mega Meal (P1 shopsPlus)');
  flags(['shopsPlus']);
  const to = fresh();
  const pt = pv(to, 'mcsticks.fries', { variant: 'takeout' });
  T.eq([pt.ok, pt.cost.cash, pt.cost.min], [true, roundHalfUp((FOOD.fries[0] + TAKEOUT_ADD) * 0.75), 0], 'fries to go at full HP: (12 + 2) × 0.75 = $11 (10.5 rounded half up), 0 m');
  const t0 = SR.util.clone(to);
  const rt = run(to, 'mcsticks.fries', { variant: 'takeout' });
  T.eq([rt.ok, to.items.takeout, to.stats.hp, to.clock.min], [true, ['fries'], t0.stats.hp, t0.clock.min], 'the meal goes into the Bag as a takeout entry (no HP now, no time)');
  T.ok(rt.toasts.some((x) => x.key === 'toast.mcsticks.takeout') && SR.text.has('toast.mcsticks.takeout'), 'a toast says it was bagged');
  T.eq([rt.events.filter((e) => e.name === 'buy').map((e) => e.payload), rt.events.some((e) => e.name === 'eat')],
    [[{ item: 'takeout', n: 1, where: 'mcsticks', price: pt.cost.cash }], false], 'the buy rule event carries the price paid; nothing is eaten yet');
  to.items.coupon = 1;
  const pc = pv(to, 'mcsticks.fries', { variant: 'takeout' });
  T.eq([pc.cost.cash, pc.badges.indexOf('flyerCoupon') >= 0], [7, true], 'B-28a example: fries to go as an employee with a flyer coupon = $7');
  run(to, 'mcsticks.fries', { variant: 'takeout' });
  T.eq(to.items.coupon, 0, 'the coupon is used up');
  for (let i = 0; i < 5; i++) run(to, 'mcsticks.milkshake', { variant: 'takeout' });
  T.eq(to.items.takeout.length, TAKEOUT_STACK, 'the Bag holds ' + TAKEOUT_STACK + ' takeouts');
  const pfull = pv(to, 'mcsticks.fries', { variant: 'takeout' });
  T.eq([pfull.ok, pfull.reason, pfull.vars && pfull.vars.max], [false, 'reason.stackFull', TAKEOUT_STACK], 'a sixth is refused ("Can\'t carry more")');
  T.eq(pv(fresh({ stats: { hp: 1 } }), 'mcsticks.megameal').hidden, true, 'the Mega Meal hides while HP max < 200');
  const big = fresh({ stats: { str: MEGA_HPMAX - 15, hpMax: MEGA_HPMAX, hp: 1 } });
  const pm = pv(big, 'mcsticks.megameal');
  T.eq([pm.hidden, pm.ok, pm.cost.cash, pm.gains[0].n, pm.cost.min], [false, true, 90, 199, 30], 'at HP max 200 it shows: $120 × 0.75 = $90, +200 HP (199 to full), 30 m');
  const pmt = pv(big, 'mcsticks.megameal', { variant: 'takeout' });
  T.eq([pmt.ok, pmt.cost.cash, pmt.cost.min], [true, roundHalfUp((FOOD.megameal[0] + TAKEOUT_ADD) * (1 - EMPLOYEE_PCT / 100)), 0], 'a Mega Meal to go: (120 + 2) × 0.75 = $92 (91.5 rounded half up), 0 m');
  flags(['shopsPlus', 'calendar']);
  T.eq(pv(fresh({ clock: { day: 4 }, stats: { str: MEGA_HPMAX - 15, hpMax: MEGA_HPMAX, hp: 1 } }), 'mcsticks.megameal').cost.cash, 75, 'Thursday Mega Meal: $100 × 0.75 = $75');

  T.section('the cook\'s shift (B-05)');
  flags([]);
  const w = fresh();
  const pw = pv(w, 'mcsticks.work', { variant: 'full' });
  T.eq([pw.ok, pw.cost.min, pw.repeatable], [true, COOK_FULL[1], false], 'Work Full: 6 h (not repeatable until js/rules/act.js follows CONTRACT D61)');
  T.eq([!!SR.reg.action['mcsticks.work:resolve'], !!SR.reg.action['mcsticks.work'].minigame], [false, true], 'the Hustle row has no :resolve (D61: the button commits the row itself)');
  const w0 = SR.util.clone(w);
  const rw = run(w, 'mcsticks.work', { variant: 'full' });
  T.eq([rw.ok, w.money.cash - w0.money.cash, w.clock.min - w0.clock.min, w.stats.karma - w0.stats.karma], [true].concat(COOK_FULL), 'Work Full: +$42, 6 h, +1 karma (the slice numbers)');
  T.eq(rw.events.find((e) => e.name === 'shift').payload, { track: 'mcsticks', rank: 'cook', variant: 'full', m: 1, pay: 42 }, 'the shift rule event');
  T.eq([rw.msgs.map((m) => m.key), w.msgs.map((m) => m.from)], [['vm.mel.firstShift'], ['mel']], 'Mel leaves a voicemail after your first shift');
  T.eq(run(w, 'mcsticks.work', { variant: 'full' }).msgs, [], '... only once');
  T.eq(run(fresh(), 'mcsticks.work').ok, true, 'Work without params is the Full shift');
  T.eq(pv(fresh({ clock: { min: 1110 } }), 'mcsticks.work', { variant: 'full' }).reason, 'reason.tooLate', 'a 6 h shift cannot start at 18:30 (the wall)');
  T.eq(pv(fresh({ clock: { min: 1080 } }), 'mcsticks.work', { variant: 'full' }).ok, true, '... and can at 18:00');
  T.eq(pv(fresh({ job: { ranks: { mcsticks: null } } }), 'mcsticks.work').reason, 'reason.staffOnly', '"Staff only" without the job');
  T.eq([pv(fresh(), 'mcsticks.work', { variant: 'half' }).hidden, pv(fresh(), 'mcsticks.work', { variant: 'overtime' }).hidden], [true, true], 'Half and Overtime hide while hustles is off');

  T.section('Half, Overtime, the Hustle and Shift Manager (P1 hustles)');
  flags(['hustles']);
  const hs = fresh();
  let x0 = SR.util.clone(hs);
  run(hs, 'mcsticks.work', { variant: 'half' });
  T.eq([hs.money.cash - x0.money.cash, hs.clock.min - x0.clock.min, hs.stats.karma - x0.stats.karma, hs.job.shiftsAtRank.mcsticks], HALF.concat([0.5]), 'Half: $21, 3 h, no karma, counts 0.5');
  T.eq(pv(hs, 'mcsticks.work', { variant: 'overtime' }).reason, 'reason.overtimeNotNow', 'Overtime only right after a Full shift');
  run(hs, 'mcsticks.work', { variant: 'full' });
  x0 = SR.util.clone(hs);
  const rot = run(hs, 'mcsticks.work', { variant: 'overtime' });
  T.eq([rot.ok, hs.money.cash - x0.money.cash, hs.clock.min - x0.clock.min, x0.stats.hp - hs.stats.hp], [true].concat(OT), 'Overtime: +$21 (2 h at 1.5 × $7), 2 h, -10 HP');
  const tired = fresh({ stats: { hp: 10 } });
  run(tired, 'mcsticks.work', { variant: 'full' });
  T.eq(pv(tired, 'mcsticks.work', { variant: 'overtime' }).reason, 'reason.tooHurt', 'Overtime needs HP > 10 ("Too hurt")');
  T.eq(SR.reg.fn['mcsticks.hustleSkin'](fresh()), { skin: 'orderup', step: 0 }, 'the Hustle plays orderup for the cook (B-05 hustle.skins)');
  const sk = SR.reg.skin.orderup;
  T.eq([sk.engine, sk.params.mode, sk.params.bins.length, sk.params.bins.every((bb) => SR.text.has(bb.label))], ['shiftrush', 'tickets', 6, true], 'the orderup skin: Shift Rush tickets, six labelled bins');
  const auto = SR.minigame.auto('orderup', {}, SR.rng.create(9), fresh());
  T.eq([auto.m, auto.auto], [1, true], 'Order Up Auto: m = 1.0 exactly (B-05)');
  x0 = fresh();
  const rh = run(x0, 'mcsticks.work', { variant: 'full', m: 1.3, hustle: { m: 1.3 } });
  T.eq([rh.ok, x0.money.cash - 100], [true, Math.round(42 * 1.3)], 'a played hustle at m 1.3 pays $55');
  T.eq(pv(fresh({ job: { shiftsAtRank: { mcsticks: MANAGER.shifts } } }), 'mcsticks.promote').reason, 'reason.needStat', 'Shift Manager needs CHA 20');
  const pr0 = pv(fresh(), 'mcsticks.promote'), why = SR.text(pr0.reason, pr0.vars);
  T.ok(!pr0.ok && why.indexOf('CHA ' + MANAGER.cha) >= 0 && why.indexOf(MANAGER.shifts + ' shifts') >= 0, 'a new cook sees every missing requirement (GDD §4.6): ' + why);
  const pr = fresh({ stats: { cha: MANAGER.cha }, job: { shiftsAtRank: { mcsticks: MANAGER.shifts } } });
  const k0 = pr.stats.karma;
  const rp = run(pr, 'mcsticks.promote');
  T.eq([rp.ok, pr.job.ranks.mcsticks, pr.stats.karma - k0, pr.msgs.map((m) => m.key), rp.stamps.map((st) => st.key)],
    [true, 'manager', 3, ['vm.mel.promoted'], ['stamp.jobs.manager']], 'promoted: Shift Manager, +3 karma, the stamp and Mel\'s voicemail');
  T.eq(pv(pr, 'mcsticks.promote').hidden, true, 'the promotion row hides once you hold the rank');
  x0 = SR.util.clone(pr);
  run(pr, 'mcsticks.work', { variant: 'full' });
  T.eq(pr.money.cash - x0.money.cash, MANAGER.full, 'a Shift Manager\'s Full shift pays $60');

  T.section('Mel\'s greetings and voicemails');
  flags([]);
  const g = SR.reg.fn['greet.mcsticks'];
  const cases = [
    [fresh(), 'newHire'], [fresh({ flags: { melFirstShift: true }, clock: { min: 600 } }), 'morning'],
    [fresh({ flags: { melFirstShift: true }, clock: { min: 1350 } }), 'late'], [fresh({ flags: { melFirstShift: true }, stats: { hp: 3 } }), 'hungry'],
    [fresh({ flags: { melFirstShift: true }, job: { ranks: { nli: 'janitor' } } }), 'moonlight'], [fresh({ flags: { melFirstShift: true }, stats: { karma: 60 } }), 'good'],
    [fresh({ flags: { melFirstShift: true }, stats: { karma: -60 } }), 'bad'], [fresh({ flags: { melFirstShift: true }, clock: { min: 900 } }), 'default'],
    [fresh({ flags: { melFirstShift: true }, job: { ranks: { mcsticks: 'manager' } } }), 'manager'],
  ];
  T.eq(cases.map((c) => g(c[0]).key), cases.map((c) => 'greet.mcsticks.' + c[1]), 'the greeting follows first visit, time, HP, job and karma');
  const wet = fresh({ flags: { melFirstShift: true }, clock: { min: 900 }, world: { weather: 'rain' } });
  T.eq(g(wet).key, 'greet.mcsticks.default', 'rain is not mentioned while the weather flag is off (P0 is always Clear)');
  flags(['weather']);
  T.eq([g(wet).key, SR.text.has('greet.mcsticks.rain')], ['greet.mcsticks.rain', true], '... and is with it (P1 weather)');
  flags([]);
  const keys = Object.keys(SR.reg.text).filter((k) => /^(greet|act|toast|card)\.mcsticks\.|^vm\.mel\./.test(k));
  T.ok(keys.length >= 20 && ['vm.mel.job', 'vm.mel.firstShift', 'vm.mel.promoted'].every((k) => keys.indexOf(k) >= 0), 'Mel\'s voicemails (the day-1 offer included) and ' + keys.length + ' McSticks keys are registered');
  flags([]);
}

// ------------------------------------------------------------------------------------------------
// The game in Chromium

async function game() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ width: 1280, height: 720, fast: true });
  const E = (fn, arg) => t.page.evaluate(fn, arg);
  await t.newGame({ seed: 7 });
  await t.set({ stats: { hp: 3 }, clock: { min: 720 } });

  T.section('the card');
  await t.enter('mcsticks');
  await t.step(2);
  T.eq(await t.scenes(), ['building'], 'McSticks opens its building scene');
  const info = await E(() => SR.ui.building.info());
  T.eq([info.id, info.interior], ['mcsticks', true], 'with its registered interior (not the placeholder)');
  let rows = await E(() => SR.ui.card.rows());
  T.eq(rows.map((r) => r.id), ['mcsticks.milkshake', 'mcsticks.fries', 'mcsticks.cheeseburger', 'mcsticks.tripleburger', 'mcsticks.work'], 'rows in card order');
  const fries = rows.find((r) => r.id === 'mcsticks.fries');
  T.ok(fries.enabled && fries.repeatable && fries.chips.some((c) => /\$9/.test(c)) && fries.chips.some((c) => /30m/.test(c)), 'Fries: enabled, repeatable, $9 · 30m chips', fries);
  T.eq([rows.find((r) => r.id === 'mcsticks.work').repeatable, rows.find((r) => r.id === 'mcsticks.work').variant], [false, 'full'], 'Work: the Full shift, no variants shown (Half and OT are P1)');
  T.ok(!(await E(() => !!document.querySelector('[data-id="row-mcsticks.fries-variant"]'))), 'no Eat here / To go control while shopsPlus is off');
  const greet = await E(() => document.querySelector('[data-id="card-greeting"]').textContent);
  T.ok(greet.length > 10 && greet.indexOf('⟦') < 0, 'Mel greets the new hire', greet);
  // The window's sky tweens 1.5 s of loop time after a clock jump (W1-G); SR.loop.step(n) renders
  // once, after its n steps, so one render notices the jump and the next one lands on the new hour.
  await t.step(1);
  await t.step(100);
  await t.shot(path.join(SHOTS, 'mcsticks-noon.png'));

  T.section('eating by click and R');
  let s0 = await t.state();
  await t.clickUI('row-mcsticks.fries');
  await t.step(2);
  let s1 = await t.state();
  T.eq([s1.stats.hp - s0.stats.hp, s0.money.cash - s1.money.cash, s1.clock.min - s0.clock.min], [19, 9, 30], 'a click on Fries: +HP (to full), -$9, 30 m');
  await t.set({ stats: { hp: 1 } });
  await t.step(1);
  s0 = await t.state();
  await t.press('repeat');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.stats.hp - s0.stats.hp, s0.money.cash - s1.money.cash], [20, 9], 'R repeats the last food row');
  await t.set({ stats: { hp: 1 } });
  await t.step(1);
  await E(() => SR.ui.focus.focus(document.querySelector('#ui [data-id="row-mcsticks.milkshake"]')));
  s0 = await t.state();
  const every = Math.round((await E(() => SR.tuning.time.repeatHoldMs)) / (1000 / 60));
  await t.page.keyboard.down('Enter');
  await t.step(every * 4);
  await t.page.keyboard.up('Enter');
  s1 = await t.state();
  T.eq([s1.stats.hp, s0.money.cash - s1.money.cash, await E(() => SR.ui.card.repeating())], [s1.stats.hpMax, 12, false],
    'holding Enter on Milkshake repeats it every 350 ms (+12, then +9 to full) until Full HP refuses it');

  T.section('work by click');
  s0 = await t.state();
  await t.clickUI('row-mcsticks.work');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.money.cash - s0.money.cash, s1.clock.min - s0.clock.min, s1.stats.karma - s0.stats.karma], COOK_FULL, 'a click on Work: +$42, 6 h, +1 karma');
  T.ok(s1.msgs.some((m) => m.key === 'vm.mel.firstShift'), 'Mel\'s first-shift voicemail is in the inbox');
  rows = await E(() => SR.ui.card.rows());
  const late = rows.find((r) => r.id === 'mcsticks.work');
  T.eq([late.enabled, late.reason], [false, await E(() => SR.text('reason.tooLate'))], 'at 19:30 the next shift is refused: "Ends after midnight"');
  await t.set({ clock: { min: 21 * 60 + 30 } });
  await t.press('back');
  await t.step(2);
  await t.enter('mcsticks');
  // The window's sky tweens 1.5 s of loop time after a clock jump (W1-G); SR.loop.step(n) renders
  // once, after its n steps, so one render notices the jump and the next one lands on the new hour.
  await t.step(1);
  await t.step(100);
  await t.shot(path.join(SHOTS, 'mcsticks-night.png'));

  T.section('P1: Takeout (shopsPlus) and the Hustle (hustles)');
  await t.debug('feature', 'shopsPlus', true);
  await t.debug('feature', 'hustles', true);
  await t.set({ clock: { min: 600 }, stats: { hp: 22 } });
  await t.press('back');
  await t.step(2);
  await t.enter('mcsticks');
  await t.step(2);
  T.ok(await E(() => !!document.querySelector('[data-id="row-mcsticks.fries-variant-takeout"]')), 'the food rows get an Eat here / To go control');
  await t.clickUI('row-mcsticks.fries-variant-takeout');
  await t.step(1);
  s0 = await t.state();
  await t.clickUI('row-mcsticks.fries');
  await t.step(2);
  s1 = await t.state();
  T.eq([s1.items.takeout, s0.money.cash - s1.money.cash, s1.clock.min - s0.clock.min], [['fries'], 11, 0], 'fries to go at full HP: into the Bag, $11, no time');
  T.ok(await E(() => !!document.querySelector('[data-id="row-mcsticks.work-hustle"]')), 'the Work row has a Hustle button');
  T.ok(await E(() => !!document.querySelector('[data-id="row-mcsticks.work-variant-half"]')), 'and the Full / Half / OT control');
  await t.mg({ m: 1.3, hits: 8, misses: 0 });
  s0 = await t.state();
  await t.clickUI('row-mcsticks.work-hustle');
  await t.step(3);
  s1 = await t.state();
  T.eq([s1.money.cash - s0.money.cash, s1.clock.min - s0.clock.min], [55, 360], 'a Hustle at m 1.3 pays $55 for the same 6 h');

  T.section('the Order Up frame');
  await E(() => { window.__mg = null; SR.minigame.run('orderup', { skin: 'orderup' }).then((r) => { window.__mg = r; }); });
  await t.step(2);
  T.eq((await t.scenes()).slice(-1)[0], 'minigame', 'the Order Up frame opens');
  const title = await E(() => document.querySelector('[data-id="mg-title"]').textContent);
  T.ok(/Order Up/.test(title), 'titled "Order Up!"', title);
  await t.step(60 * 7);
  const peek = await E(() => SR.minigame.current().inst.peek());
  T.ok(peek.mode === 'tickets' && peek.ticket && peek.ticket.length >= 2 && peek.ticket.length <= 5, 'a ticket lists 2-5 items', peek.ticket);
  for (const b of peek.ticket) await t.press('bin' + (b + 1));
  await t.press('serve');
  await t.step(1);
  T.eq(await E(() => SR.minigame.current().inst.peek().correct), 1, 'pressing its bins in order and serving scores one ticket');
  await t.step(60 * 2);
  await t.shot(path.join(SHOTS, 'orderup.png'));
  await t.clickUI('mg-auto');
  await t.step(3);
  const res = await E(() => window.__mg);
  T.eq([res && res.m, res && res.auto], [1, true], 'Auto ends the round at m = 1.0');

  T.section('the interior draws from palette keys');
  const draw = await E(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const r = SR.art.interior('mcsticks', {});
    const out = { threw: null };
    try {
      r.drawStatic(ctx, null); r.drawAnim(ctx, 0.5, null, {});
      r.drawStatic(ctx, SR.state); r.drawAnim(ctx, 2.7, SR.state, { owner: { pose: 'work' }, you: { pose: 'happy' } });
      r.drawAnim(ctx, 5, SR.state, { owner: { pose: 'react-shock' }, you: { clip: 'eat' } });
    } catch (e) { out.threw = e.message; }
    const px = ctx.getImageData(700, 430, 1, 1).data;
    out.mascot = Array.from(px);
    return out;
  });
  T.eq(draw.threw, null, 'drawStatic / drawAnim with no state, the live state and every proprietor pose');
  const warns = (await t.warnings()).filter((x) => /interior|prop|palette|mcsticks|orderup|⟦/i.test(x));
  T.eq(warns, [], 'no warnings about props, palette keys or missing McSticks text');
  T.eq(await t.errors(), [], 'zero console errors');
  await t.close();
}

(async () => {
  rules();
  await game();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
