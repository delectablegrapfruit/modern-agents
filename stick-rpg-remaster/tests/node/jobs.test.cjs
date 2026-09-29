// tests/node/jobs.test.cjs — owner: W1-E. SR.rules.jobs (BALANCE B-05; GDD §4.6): promotion gates
// at every rung (INT, CHA, shifts at rank, the rating), one rung per request, shifts (Full; Half and
// Overtime behind `hustles`), pay and its multipliers, the Monday bonus, the rating, the weekly
// counters and bonus, credit limits, titles, hustle skins, the CEO takeover hook, and a shift run
// end to end through the action pipeline (W1-R's SR.rules.act).
//   node tests/node/jobs.test.cjs
'use strict';
const H = require('./econ-helpers.cjs');

const T = H.L.suite('jobs (W1-E)');
const SR = H.boot();
const J = SR.rules.jobs;
const TJ = SR.tuning.jobs;

T.section('promotion gates at every rung');
{
  const s = H.state(SR, { stats: { int: 19, cha: 0 } });
  T.eq(J.canApply(s, 'nli'), { ok: false, next: 'janitor', missing: [{ key: 'int', need: 20, have: 19 }] }, 'Janitor needs INT 20 (orig)');
  s.stats.int = 20;
  T.eq(J.canApply(s, 'nli').ok, true, 'INT 20 is enough');
  T.eq(J.canApply(s, 'mcsticks').reason, 'reason.hired', 'you start hired at McSticks');
  // Every NLI rung: exactly at the gate passes, one below fails.
  const ladder = TJ.ladder.nli;
  for (let i = 1; i < ladder.length; i++) {
    const cur = ladder[i - 1], next = ladder[i], row = TJ[next];
    const at = H.state(SR, { stats: { int: row.int, cha: row.cha }, job: { ranks: { nli: cur }, shiftsAtRank: { nli: row.shifts } } });
    T.ok(J.promotion(at, 'nli').ok && J.promotion(at, 'nli').next === next, cur + ' → ' + next + ' at INT ' + row.int + ', CHA ' + row.cha + ', ' + row.shifts + ' shifts');
    const low = [['int', row.int - 1], ['cha', row.cha - 1], ['shifts', row.shifts - 1]].filter((x) => x[1] >= 0);
    low.forEach(([key, v]) => {
      const st = H.state(SR, { stats: { int: row.int, cha: row.cha }, job: { ranks: { nli: cur }, shiftsAtRank: { nli: row.shifts } } });
      if (key === 'shifts') st.job.shiftsAtRank.nli = v; else st.stats[key] = v;
      const p = J.promotion(st, 'nli');
      T.ok(!p.ok && p.missing.length === 1 && p.missing[0].key === key, '  … not with ' + key + ' ' + v);
    });
  }
  const top = H.state(SR, { stats: { int: 999, cha: 999 }, job: { ranks: { nli: 'ceo' }, shiftsAtRank: { nli: 99 } } });
  T.eq(J.promotion(top, 'nli').next, null, 'CEO is the top of the ladder');
  T.eq(J.missingReason(J.promotion(top, 'nli')).reason, 'reason.topRank', '… with its reason');
  const p = J.promotion(H.state(SR, { stats: { int: 10, cha: 10 }, job: { ranks: { nli: 'mail' }, shiftsAtRank: { nli: 1 } } }), 'nli');
  T.eq(p.missing.map((m) => m.key), ['int', 'cha', 'shifts'], 'the row lists every missing requirement');
  T.eq(J.missingReason(p), { ok: false, reason: 'reason.needStat', vars: { stat: 'INT', min: 75, have: 10 } }, 'the first one is the reason ("Need INT 75 (you: 10)")');

  const net = H.state(SR, { stats: { int: 40 }, job: { ranks: { nli: 'janitor' }, shiftsAtRank: { nli: 2 } }, perks: { owned: ['networker'] } });
  T.eq(J.promotion(net, 'nli').ok, false, 'Mail Room needs 3 Janitor shifts');
  const rp = H.features(SR, { perks: true });
  T.eq(J.promotion(net, 'nli').ok, true, 'Networker: one shift fewer');
  rp();
  const vp = H.state(SR, { stats: { int: 180, cha: 90 }, job: { ranks: { nli: 'exec' }, shiftsAtRank: { nli: 5 }, rating: 0.85 } });
  T.eq(J.promotion(vp, 'nli').ok, true, 'the rating does not count in P0');
  const rh = H.features(SR, { hustles: true });
  T.eq(J.promotion(vp, 'nli').missing, [{ key: 'rating', need: 0.9, have: 0.85 }], 'with hustles, VP needs a rating ≥ 0.9');
  const mc = H.state(SR, { stats: { cha: 20 }, job: { shiftsAtRank: { mcsticks: 15 } } });
  T.eq(J.promotion(mc, 'mcsticks').next, 'manager', 'Shift Manager (P1): CHA 20 and 15 cook shifts');
  rh();
  T.eq(J.promotion(mc, 'mcsticks').next, null, 'no Shift Manager while `hustles` is off');
}

T.section('promote: one rung per request');
{
  const s = H.state(SR, { stats: { int: 999, cha: 999, karma: 0 }, job: { ranks: { nli: 'janitor' }, shiftsAtRank: { nli: 99 } } });
  const r = J.promote(s, 'nli');
  T.eq([r.from, r.to, s.job.ranks.nli, s.job.shiftsAtRank.nli], ['janitor', 'mail', 'mail', 0], 'one rung (orig), shifts at rank reset');
  T.eq(s.stats.karma, 3, 'a promotion gives +3 karma (orig)');
  T.eq(r.stamps, [{ key: 'stamp.jobs.mail', vars: {} }], 'a stamp');
  T.eq(r.log, [{ kind: 'promoted', vars: { job: 'mail', title: 'Mail Room Clerk' } }], 'the log entry for the headline');
  T.eq(r.events, [{ name: 'promote', payload: { track: 'nli', from: 'janitor', to: 'mail' } }], 'the `promote` rule event');
  T.eq(J.promote(s, 'nli').reason, 'reason.needShifts', 'the next rung waits for shifts');
  const a = H.state(SR, { stats: { int: 20, karma: 0 } });
  const ap = J.promote(a, 'nli');
  T.eq([ap.to, a.stats.karma, ap.stamps[0].key], ['janitor', 0, 'stamp.jobs.hired'], 'applying hires you (no promotion karma)');
  const c = H.state(SR, { clock: { day: 17 }, stats: { int: 999, cha: 999 }, job: { ranks: { nli: 'vp' }, shiftsAtRank: { nli: 6 } } });
  const rc = J.promote(c, 'nli');
  T.eq([rc.log[0].kind, c.job.ceoSinceDay], ['promotedCeo', 17], 'CEO: its own headline, the takeover clock starts');
}

T.section('shifts and pay');
{
  const s = H.state(SR, { clock: { min: 840 }, stats: { karma: 0 } });
  const w = J.work(s, 'mcsticks', 'full');
  T.eq([w.pay, s.money.cash, s.stats.karma, s.job.shiftsAtRank.mcsticks, s.job.lastFullEnd], [42, 142, 1, 1, 840],
    'Full cook shift: $42 (7 × 6), +1 karma, one shift, lastFullEnd = the clock at its end');
  T.eq(w.events[0], { name: 'shift', payload: { track: 'mcsticks', rank: 'cook', variant: 'full', m: 1, pay: 42 } }, 'the `shift` rule event');
  T.eq(J.work(s, 'nli', 'full').reason, 'reason.notHired', 'no NLI job yet');
  T.eq(J.work(s, 'mcsticks', 'half').reason, 'reason.featureOff', 'Half is P1');
  T.eq(J.work(H.state(SR, {}, { difficulty: 'relaxed' }), 'mcsticks', 'full').pay, 53, 'Relaxed wages ×1.25 (52.5, rounded half up)');
  T.eq(J.work(H.state(SR, { election: { decrees: ['fourDayWeek'] } }), 'mcsticks', 'full').pay, 53, 'Four-Day Week ×1.25');
  T.eq(J.work(H.state(SR, {}), 'mcsticks', 'full', 1.3).pay, 55, 'the hustle multiplier (1.3 × 42 = 54.6)');
  T.eq(J.work(H.state(SR, {}), 'mcsticks', 'full', 9).pay, 55, 'm is clamped to 1.3');
  T.eq(J.work(H.state(SR, {}), 'mcsticks', 'full', 0.1).pay, 29, '… and to 0.7');
  const n = H.state(SR, { job: { ranks: { nli: 'exec' } } });
  J.work(n, 'nli', 'full');
  J.work(n, 'nli', 'full');
  T.eq([n.job.weekNliWages, n.job.weekNliShifts, n.job.totalShifts], [600, 2, 2], 'NLI wages and shifts are counted for the week');
  T.eq(J.work(H.state(SR, { money: { lien: 1000 } }), 'mcsticks', 'full').pay, 42, 'pay is reported whole…');
  const l = H.state(SR, { money: { cash: 0, lien: 1000 } });
  J.work(l, 'mcsticks', 'full');
  T.eq([l.money.cash, l.money.lien], [21, 979], '… and half of it goes to a lien (wages are income)');

  const rh = H.features(SR, { hustles: true });
  const h = H.state(SR, { clock: { min: 600 } });
  const hw = J.work(h, 'mcsticks', 'half');
  T.eq([hw.pay, h.job.shiftsAtRank.mcsticks, h.stats.karma], [21, 0.5, 0], 'Half: 3 h at the same rate, 0.5 shift, no karma');
  T.eq(J.canWork(h, 'mcsticks', 'overtime').reason, 'reason.overtimeNotNow', 'Overtime only right after a Full shift');
  J.work(h, 'mcsticks', 'full');
  T.eq(J.canWork(h, 'mcsticks', 'overtime').ok, true, '… with nothing in between (lastFullEnd == now)');
  const ot = J.work(h, 'mcsticks', 'overtime');
  T.eq([ot.pay, h.job.overtimeToday], [21, 1], 'Overtime: 2 h at 1.5× (7 × 2 × 1.5)');
  h.job.lastFullEnd = h.clock.min;
  T.eq(J.canWork(h, 'mcsticks', 'overtime').reason, 'reason.dailyLimit', 'once a day');
  T.eq(J.shiftCost(h, 'overtime'), { min: 120, hp: 10 }, 'Overtime costs 120 min and 10 HP');
  const wk = H.state(SR, { perks: { owned: ['workaholic'] }, job: { overtimeToday: 1, lastFullEnd: 480 } });
  const rp = H.features(SR, { perks: true });
  T.eq([J.canWork(wk, 'mcsticks', 'overtime').ok, J.shiftCost(wk, 'overtime').hp], [true, 0], 'Workaholic: twice a day, no HP cost');
  rp();
  const hurt = H.state(SR, { stats: { hp: 10 }, job: { lastFullEnd: 480 } });
  T.eq(J.canWork(hurt, 'mcsticks', 'overtime').reason, 'reason.tooHurt', 'Overtime needs HP > 10');
  const r = H.state(SR, {});
  J.work(r, 'mcsticks', 'full', 1.3);
  T.eq(r.job.rating, 1.09, 'the rating: a moving average of m (α 0.3)');
  rh();
  const rc = H.features(SR, { calendar: true });
  const mon = H.state(SR, { clock: { day: 8 }, stats: { cha: 10 } });
  J.work(mon, 'mcsticks', 'full');
  J.work(mon, 'mcsticks', 'full');
  T.eq(mon.stats.cha, 11, 'Motivation Monday: +1 CHA on the first shift of a Monday only');
  const tue = H.state(SR, { clock: { day: 9 }, stats: { cha: 10 } });
  J.work(tue, 'mcsticks', 'full');
  T.eq(tue.stats.cha, 10, 'not on a Tuesday');
  rc();
}

T.section('the weekly bonus, credit, titles, skins, the takeover');
{
  const b = (rank) => J.weeklyBonus(H.state(SR, { job: { ranks: { nli: rank }, weekNliWages: 3000 } }));
  T.eq([b('mail'), b('exec').amount, b('vp').amount, b('ceo').amount], [null, 300, 600, 900], 'Executive 10 %, VP 20 %, CEO 30 % of the week\'s NLI wages');
  T.eq(J.creditLimit(H.state(SR, {})), 1000, 'credit limit: a cook $1,000');
  T.eq(J.creditLimit(H.state(SR, { job: { ranks: { nli: 'vp' } } })), 25000, 'the best of your jobs: VP $25,000');
  T.eq(J.creditLimit(H.state(SR, { job: { ranks: { nli: 'vp' }, office: 'dictator' } })), 250000, 'in office $250,000');
  T.eq(J.bestTitle(H.state(SR, {})), 'cook', 'title: Fry Cook');
  T.eq(J.bestTitle(H.state(SR, { job: { ranks: { nli: 'janitor' } } })), 'janitor', 'Janitor outranks Fry Cook');
  T.eq(J.bestTitle(H.state(SR, { job: { ranks: { mcsticks: 'manager', nli: 'janitor' } } })), 'janitor', 'a tie with Shift Manager: NLI');
  T.eq(J.bestTitle(H.state(SR, { job: { ranks: { nli: 'ceo' }, office: 'president' } })), 'president', 'the office wins');
  T.eq([J.legacyRank(H.state(SR, {})), J.legacyRank(H.state(SR, { job: { ranks: { nli: 'vp' } } })), J.legacyRank(H.state(SR, { job: { office: 'dictator' } }))],
    [0, 5, 7], 'legacy job ranks (B-18)');
  T.eq([J.hustleSkin(H.state(SR, {}), 'mcsticks'), J.hustleSkin(H.state(SR, { job: { ranks: { nli: 'exec' } } }), 'nli'),
    J.hustleSkin(H.state(SR, { job: { ranks: { nli: 'ceo' } } }), 'nli')],
    [{ skin: 'orderup', step: 0 }, { skin: 'pitch', step: 1 }, { skin: 'boardroom', step: 0 }], 'hustle skins by rank (B-05)');
  const rh = H.features(SR, { hustles: true });
  const due = (day) => J.takeoverDue(H.state(SR, { clock: { day: day }, job: { ranks: { nli: 'ceo' }, ceoSinceDay: 10 } }));
  T.eq([due(23), due(24), due(30), due(31)], [false, true, true, false], 'the takeover is due in the third week as CEO');
  const t = H.state(SR, { clock: { day: 25 }, money: { cash: 0 }, job: { ranks: { nli: 'ceo' }, ceoSinceDay: 10 } });
  T.eq([J.takeover(t, 1.2), t.money.cash, J.takeoverDue(t)], [{ won: true, bonus: 20000 }, 20000, false], 'm ≥ 1.2 pays $20,000, once');
  T.eq(J.takeover(H.state(SR, {}), 1.19).won, false, 'a loss pays nothing');
  const tf = H.state(SR, { clock: { day: 25 }, money: { cash: 0 }, job: { ranks: { nli: 'ceo' }, ceoSinceDay: 10 } });
  T.eq(SR.reg.fn['jobs.takeoverDue'](tf, {}, {}).ok, true, 'named fn jobs.takeoverDue (condition)');
  T.eq([SR.reg.fn['jobs.takeover'](tf, { m: 1.25 }, {}).won, tf.money.cash], [true, 20000], 'named fn jobs.takeover reads the Boardroom\'s params.m');
  T.eq(SR.reg.fn['jobs.takeover'](tf, { m: 1.25 }, {}).reason, 'reason.notNow', '… once');
  rh();
  T.eq(due(24), false, 'no takeover while `hustles` is off');
}

T.section('Overtime on a Heat Wave day (review fix)');
{
  const rf = H.features(SR, { hustles: true });
  const s = H.state(SR, { clock: { min: 840 }, stats: { hp: 14 }, job: { lastFullEnd: 840 } });
  T.eq(J.canWork(s, 'mcsticks', 'overtime').ok, true, 'HP 14 > 10 on a normal day');
  T.eq(J.canWork(s, 'mcsticks', 'overtime', { hpScale: 1.5 }), { ok: false, reason: 'reason.tooHurt', vars: { n: 15 } },
    'the Heat Wave\'s ×1.5 (ceil) raises the "Too hurt" line to 15, as the pipeline scales the cost');
  s.stats.hp = 16;
  T.eq(SR.reg.fn['jobs.canWork'](s, { variant: 'overtime' }, { hpScale: 1.5 }, 'mcsticks').ok, true, 'the named fn reads the pipeline\'s ctx');
  rf();
}

T.section('rain tips on Order Up (B-05 hustle.rainTips; review fix)');
{
  const rf = H.features(SR, { weather: true });
  const cook = (weather, m, opts, patch) => {
    const s = H.state(SR, Object.assign({ money: { cash: 0 }, world: { weather: weather } }, patch || {}));
    const r = J.work(s, patch && patch.job ? 'nli' : 'mcsticks', 'full', m, opts);
    return [r.pay, s.job.rating];
  };
  T.eq(cook('rain', 1.0, { hustle: true })[0], Math.round(42 * 1.2), 'a played Order Up in the rain: m × 1.2 (42 → 50)');
  T.eq(cook('rain', 1.2, { hustle: true })[0], Math.round(42 * 1.3), '… capped at 1.3');
  T.eq(cook('clear', 1.0, { hustle: true })[0], 42, 'no tips without rain');
  T.eq(cook('rain', undefined, { hustle: true })[0], 42, 'Auto stays exactly 1.0');
  T.eq(cook('rain', 1.0)[0], 42, 'only a played hustle gets tips');
  T.eq(cook('rain', 1.0, { hustle: true }, { job: { ranks: { nli: 'janitor' } } })[0], 60, 'not on Sort It (NLI)');
  const rh = H.features(SR, { hustles: true });
  T.eq(cook('rain', 1.0, { hustle: true })[1], 1, 'the rating follows the hustle\'s own m, not the tips');
  rh();
  const s = H.state(SR, { money: { cash: 0 }, world: { weather: 'rain' } });
  SR.reg.fn['jobs.work'](s, { track: 'mcsticks', m: 1.0 }, {});
  const a = H.state(SR, { money: { cash: 0 }, world: { weather: 'rain' } });
  SR.reg.fn['jobs.work'](a, { track: 'mcsticks', m: 1.0, auto: true }, {});
  T.eq([s.money.cash, a.money.cash], [50, 42], 'the named fn: a hustle result gets the tips, an Auto result (auto: true) does not');
  rf();
  T.eq(cook('rain', 1.0, { hustle: true })[0], 42, 'no rain tips while `weather` is off');
}

T.section('a shift through the action pipeline (SR.rules.act)');
{
  SR.def.action('test.nliWork', { building: 'nli', group: 'work', p: 0, variants: ['full', 'half', 'overtime'],
    cost: { min: 'shift.min', hp: 'shift.hp' }, requires: [['fn', 'jobs.canWork', 'nli']], effects: [['fn', 'jobs.work', 'nli']] });
  SR.def.action('test.promote', { building: 'nli', group: 'services', p: 0, requires: [['fn', 'jobs.canPromote', 'nli']], effects: [['fn', 'jobs.promote', 'nli']] });
  const s = H.state(SR, { clock: { min: 480 }, stats: { int: 20, karma: 0 }, job: { ranks: { nli: 'janitor' } } });
  const c = H.ctx(SR, 1);
  const r = SR.rules.act.run(s, 'test.nliWork', { variant: 'full' }, c);
  T.eq([r.ok, s.clock.min, s.money.cash], [true, 840, 160], 'Full: 6 h on the clock, $60 for a Janitor');
  T.ok(r.deltas.some((d) => d.kind === 'cash' && d.n === 60) && r.events.some((e) => e.name === 'shift'), 'the Result has the cash delta and the `shift` event');
  s.clock.min = 1110;
  T.eq(SR.rules.act.run(s, 'test.nliWork', { variant: 'full' }, c).reason, 'reason.tooLate', 'the wall: a 6 h shift cannot start at 18:30');
  s.clock.min = 1080;
  T.eq(SR.rules.act.run(s, 'test.nliWork', { variant: 'full' }, c).ok, true, '… and can at 18:00');
  const pv = SR.rules.act.preview(s, 'test.promote', {}, c);
  T.eq([pv.ok, pv.reason], [false, 'reason.needStat'], 'the preview of a promotion shows the first missing requirement');
  const rh = H.features(SR, { hustles: true });
  const o = H.state(SR, { clock: { min: 480 }, stats: { hp: 22 }, job: { ranks: { nli: 'janitor' } } });
  SR.rules.act.run(o, 'test.nliWork', { variant: 'full' }, c);
  const ot = SR.rules.act.run(o, 'test.nliWork', { variant: 'overtime' }, c);
  T.eq([ot.ok, o.clock.min, o.stats.hp, o.money.cash], [true, 960, 12, 100 + 60 + 30], 'Overtime through the pipeline: +2 h, -10 HP, 1.5× pay');
  rh();
}

T.done();
