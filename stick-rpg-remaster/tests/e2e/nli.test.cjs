// tests/e2e/nli.test.cjs — owner: W2-Money. New Lines Inc. (BUILD_PLAN §4.6; GDD §4.6, §6.1,
// §6.2, §6.5; BALANCE B-05, B-30): first the rules through NLI's data in Node (the rows, Apply at
// INT 20, the promotion ladder at every threshold with every missing requirement named, +3 karma,
// the new boss's voicemail and the stamp, Full shifts and their pay per rung, the time wall, the
// Friday bonus of Executive, VP and CEO over a week of nights; P1 `hustles`: the variants, the skins
// by rank, the Boardroom's Ruthless karma and the CEO takeover; the three skins' params and Auto;
// the greetings, Bea's and Terry's), then the game in Chromium over file:// (the card and the
// ladder by click, Apply and a promotion, a shift, Terry from VP up, the top of the ladder with the
// focus kept in the card, the P1 rating line and the takeover by the card, Relaxed wages in cents,
// the Hustle frames of Sort It,
// Pitch and Boardroom with Auto, a week of shifts ending in the Friday bonus on the morning report,
// the a11y audit) with zero console errors. Screenshots go to shots/W2-Money/ (git-ignored).
//   node tests/e2e/nli.test.cjs
'use strict';
const path = require('path');
const fs = require('fs');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');
const { load } = require('../node/load.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Money');
const T = h.suite('e2e New Lines Inc. (W2-Money)');

// BALANCE B-05, copied from the document: id, INT, CHA, shifts at the rank below, $/h.
const LADDER = [['janitor', 20, 0, 0, 10], ['mail', 40, 0, 3, 15], ['sales', 75, 25, 3, 25], ['exec', 120, 50, 4, 50], ['vp', 180, 90, 5, 120], ['ceo', 250, 140, 6, 300]];
const RATING = 0.9;                        // VP and CEO with `hustles`
const FULL = { min: 360, karma: 1 }, PROMO_KARMA = 3;
const BONUS = { exec: 0.10, vp: 0.20, ceo: 0.30 };
const TAKEOVER = { from: 14, to: 21, m: 1.2, bonus: 20000, dMult: 2 };
const SKINS = { janitor: ['sortit', 0], mail: ['sortit', 0], sales: ['pitch', 0], exec: ['pitch', 1], vp: ['boardroom', 0], ceo: ['boardroom', 0] };
const BOSS = { janitor: 'vm.bea.hired', mail: 'vm.gil.promoted', sales: 'vm.frankie.promoted', exec: 'vm.bea.exec', vp: 'vm.terry.vp', ceo: 'vm.terry.ceo' };

function rules() {
  const R = load({ mode: 'all', extra: ['js/minigames/framework.js', 'js/minigames/duel.js', 'js/minigames/shiftrush.js', 'js/minigames/timingring.js'] });
  const SR = R.SR;
  const A_ = SR.rules.act;
  let seed = 1;
  const ctx = () => ({ rng: SR.rng.create(seed++), source: 'sim' });
  const fresh = (patch) => { const s = SR.rules.state.create({ seed: 42 }); if (patch) SR.util.merge(s, patch); return s; };
  const flags = (on) => { Object.keys(SR.features).forEach((f) => { SR.features[f] = false; }); (on || []).forEach((f) => { SR.features[f] = true; }); };
  const pv = (s, id, p) => A_.preview(s, id, p || {}, ctx());
  const run = (s, id, p, c) => A_.run(s, id, p || {}, c || ctx());
  const visible = (s) => A_.actions('nli').filter((id) => !pv(s, id).hidden);
  const at = (rank, patch) => fresh(SR.util.merge({ job: { ranks: { nli: rank } }, clock: { min: 480 } }, patch || {}));

  T.section('the building and its rows');
  flags([]);
  const b = SR.reg.building.nli;
  T.eq([b.music, b.interior, b.exteriorId], ['please_hold', 'nli', 'nli'], 'NLI: please_hold, its interior');
  SR.state = null;
  const without = [b.owner, b.portrait];
  SR.state = at('exec');
  const exec = [b.owner, b.portrait, SR.art.interior('nli').def.owner.id];
  SR.state = at('vp');
  const vp = [b.owner, b.portrait, SR.art.interior('nli').def.owner.id];
  SR.state = null;
  T.eq([without, exec, vp], [['bea', 'bea'], ['bea', 'bea', 'bea'], ['terry', 'terry', 'terry']], 'Bea receives you; Terry, your assistant, from Vice President up (card and interior)');
  T.eq(visible(fresh()), ['nli.apply', 'nli.work', 'nli.ladderOpen'], 'not hired: Apply, Work (disabled), the job ladder');
  T.eq(visible(at('janitor')), ['nli.promote', 'nli.work', 'nli.ladderOpen'], 'hired: Ask for a promotion instead of Apply');
  T.eq([SR.reg.action['nli.ladderOpen'].screen, pv(fresh(), 'nli.work').reason], ['nli.jobs', 'reason.staffOnly'], 'the ladder opens nli.jobs; Work needs the job');

  T.section('Apply (orig: INT 20 for Janitor)');
  T.eq([pv(fresh({ stats: { int: 19 } }), 'nli.apply').reason, pv(fresh({ stats: { int: 19 } }), 'nli.apply').vars], ['reason.needStat', { stat: 'INT', min: 20, have: 19 }], 'INT 19: "Need INT 20 (you: 19)"');
  let s = fresh({ stats: { int: 20, karma: 0 } });
  let r = run(s, 'nli.apply');
  T.eq([r.ok, s.job.ranks.nli, s.job.ranks.mcsticks, s.stats.karma, r.stamps.map((x) => x.key), r.msgs.map((m) => m.key)],
    [true, 'janitor', 'cook', 0, ['stamp.jobs.hired'], ['vm.bea.hired']], 'hired as Janitor: the HIRED stamp, Bea\'s voicemail; you keep cooking at McSticks');
  T.eq(s.msgs.slice(-1)[0].from, 'bea', 'the voicemail is from Bea');

  T.section('the promotion ladder at every threshold (B-05)');
  for (let i = 1; i < LADDER.length; i++) {
    const [id, int, cha, shifts] = LADDER[i], prev = LADDER[i - 1][0];
    const ready = () => at(prev, { stats: { int: int, cha: cha, karma: 0 }, job: { shiftsAtRank: { nli: shifts } } });
    s = ready();
    r = run(s, 'nli.promote');
    T.eq([r.ok, s.job.ranks.nli, s.stats.karma, s.job.shiftsAtRank.nli, r.stamps.map((x) => x.key), r.msgs.map((m) => m.key), r.log.some((l) => l.kind === (id === 'ceo' ? 'promotedCeo' : 'promoted'))],
      [true, id, PROMO_KARMA, 0, ['stamp.jobs.' + id], [BOSS[id]], true], prev + ' → ' + id + ' at exactly INT ' + int + ', CHA ' + cha + ', ' + shifts + ' shifts: +3 karma, the stamp, the new boss calls');
    const low = (patch) => pv(SR.util.merge(ready(), patch), 'nli.promote');
    T.eq([low({ stats: { int: int - 1 } }).reason, low({ stats: { int: int - 1 } }).vars.min], ['reason.needStat', int], id + ': INT one short is refused ("Need INT ' + int + '")');
    if (cha > 0) T.eq([low({ stats: { cha: cha - 1 } }).reason, low({ stats: { cha: cha - 1 } }).vars.stat], ['reason.needStat', 'CHA'], id + ': CHA one short is refused');
    T.eq([low({ job: { shiftsAtRank: { nli: shifts - 1 } } }).reason, low({ job: { shiftsAtRank: { nli: shifts - 1 } } }).vars.need], ['reason.needShifts', shifts], id + ': a shift short is refused');
    const all = low({ stats: { int: int - 1, cha: Math.max(0, cha - 1) }, job: { shiftsAtRank: { nli: shifts - 1 } } });
    const text = SR.text(all.reason, all.vars);
    T.ok(all.reason === 'reason.needAll' && /INT \d+ \(you: \d+\)/.test(text) && (cha === 0 || /CHA \d+ \(you: \d+\)/.test(text)) && /shifts \(you: \d+\)/.test(text) && text.split(' · ').length === (cha > 0 ? 3 : 2),
      id + ': every missing requirement named in one line: "' + text + '"');
  }
  T.eq(pv(at('ceo', { stats: { int: 999, cha: 999 } }), 'nli.promote').reason, 'reason.topRank', 'CEO: "Top of the ladder"');
  flags(['hustles']);
  const vpReady = at('exec', { stats: { int: 180, cha: 90 }, job: { shiftsAtRank: { nli: 5 }, rating: RATING - 0.01 } });
  T.eq(pv(vpReady, 'nli.promote').reason, 'reason.needRating', 'P1 hustles: VP needs a rating of 0.9');
  vpReady.job.rating = RATING;
  T.eq(pv(vpReady, 'nli.promote').ok, true, '... and gets it at 0.9');
  flags([]);

  T.section('shifts: Full 6 h, pay per rung, +1 karma, the time wall');
  LADDER.forEach(([id, , , , wage]) => {
    const st = at(id, { stats: { karma: 0 } });
    const rr = run(st, 'nli.work', { variant: 'full' });
    T.eq([rr.ok, st.money.cash - 100, st.clock.min, st.stats.karma, st.job.shiftsAtRank.nli, rr.events.find((e) => e.name === 'shift').payload.rank],
      [true, wage * 6, 480 + FULL.min, FULL.karma, 1, id], id + ': a Full shift pays $' + wage * 6 + ' in 6 h, +1 karma, one shift at the rank');
  });
  T.eq(pv(at('janitor', { clock: { min: 1080 } }), 'nli.work').ok, true, 'a 6 h shift can start at 18:00');
  T.eq(pv(at('janitor', { clock: { min: 1110 } }), 'nli.work').reason, 'reason.tooLate', '... and not at 18:30');
  const rel = at('janitor', { mode: { difficulty: 'relaxed' } });
  run(rel, 'nli.work');
  T.eq(rel.money.cash - 100, Math.round(60 * 1.25), 'Relaxed wages ×1.25 (B-16)');
  T.eq([pv(at('janitor'), 'nli.work', { variant: 'half' }).hidden, pv(at('janitor'), 'nli.work').repeatable], [true, false], 'Half and Overtime hide without hustles; the shift is not repeatable until js/rules/act.js follows CONTRACT D61');
  T.eq([!!SR.reg.action['nli.work:resolve'], !!SR.reg.action['nli.work'].minigame], [false, true], 'the Hustle row has no :resolve (D61: the button commits the row with { m, hustle })');

  T.section('the Friday bonus: Executive 10 %, VP 20 %, CEO 30 % of the week\'s NLI wages');
  const week = (rank, days) => {
    const st = at(rank, { money: { cash: 0 } });
    const reps = [];
    for (let d = 0; d < days; d++) {
      st.clock.min = 480;
      run(st, 'nli.work', { variant: 'full' });
      reps.push(SR.rules.night.run(st, ctx(), { kind: 'sleep' }));
    }
    return { st, reps };
  };
  ['exec', 'vp', 'ceo'].forEach((rank) => {
    const wage = LADDER.find((x) => x[0] === rank)[4] * 6;
    const { reps } = week(rank, 5);
    const lines = reps.map((rp) => rp.lines.find((l) => l.key === 'report.weeklyBonus'));
    T.eq([lines.slice(0, 4).every((l) => !l), lines[4] && lines[4].vars.n], [true, Math.floor(5 * wage * BONUS[rank])],
      rank + ': no bonus Monday to Thursday; Friday night pays ' + BONUS[rank] * 100 + ' % of 5 shifts (' + Math.floor(5 * wage * BONUS[rank]) + ')');
  });
  const mailWeek = week('mail', 5);
  T.eq(mailWeek.reps.some((rp) => rp.lines.some((l) => l.key === 'report.weeklyBonus')), false, 'no bonus below Executive');
  const reset = week('exec', 7);
  T.eq(reset.st.job.weekNliWages, 0, 'the week\'s wages reset on Monday morning');

  T.section('P1 hustles: variants, the skins by rank, Ruthless karma, the CEO takeover');
  flags(['hustles']);
  T.eq(Object.keys(SKINS).map((id) => { const x = SR.reg.fn['nli.hustleSkin'](at(id)); return [x.skin, x.step]; }), Object.keys(SKINS).map((k) => SKINS[k]), 'sortit, sortit, pitch (step 0), pitch (step 1), boardroom, boardroom');
  T.eq(pv(at('janitor'), 'nli.work', { variant: 'half' }).cost.min, 180, 'Half: 3 h');
  s = at('vp', { stats: { karma: 0 } });
  r = run(s, 'nli.work', { variant: 'full', m: 1.1, hustle: { m: 1.1, wins: 2, losses: 1, picks: ['ruthless', 'safe', 'ruthless'] } });
  T.eq([r.ok, s.money.cash - 100, s.stats.karma, r.toasts.map((x) => x.key)], [true, Math.round(720 * 1.1), FULL.karma - 2, ['toast.nli.ruthless']], 'a Boardroom with two Ruthless picks: m 1.1 pay, -1 karma each');
  const ceo = (day) => at('ceo', { job: { ceoSinceDay: 2 }, clock: { day: day } });
  T.eq([pv(ceo(2 + TAKEOVER.from - 1), 'nli.takeover').hidden, pv(ceo(2 + TAKEOVER.from), 'nli.takeover').ok, pv(ceo(2 + TAKEOVER.to), 'nli.takeover').hidden], [true, true, true],
    'the takeover row shows only in your third week as CEO');
  s = ceo(2 + TAKEOVER.from);
  r = run(s, 'nli.takeover');
  T.eq([r.ok, r.open.skin, r.open.params.dScale, r.open.resolve], [true, 'boardroom', TAKEOVER.dMult, 'nli.takeover:resolve'], 'it opens the Boardroom at double D');
  const c0 = s.money.cash;
  r = run(s, 'nli.takeover:resolve', { m: 1.25, wins: 3, picks: ['bold', 'bold', 'safe'] });
  T.eq([r.ok, s.money.cash - c0, r.msgs.map((m) => m.key), s.flags.ceoTakeover], [true, TAKEOVER.bonus, ['vm.terry.takeoverWon'], true], 'm ≥ 1.2: +$20,000 and Terry is thrilled');
  T.eq([run(s, 'nli.takeover:resolve', { m: 1.3 }).ok, pv(s, 'nli.takeover').hidden], [false, true], 'once: a second resolve pays nothing and the row is gone');
  s = ceo(2 + TAKEOVER.from);
  run(s, 'nli.takeover');
  const c1 = s.money.cash;
  r = run(s, 'nli.takeover:resolve', { m: 1.0, picks: [] });
  T.eq([s.money.cash - c1, r.msgs.map((m) => m.key)], [0, ['vm.bea.takeoverLost']], 'a loss only brings the humiliating voicemail');
  flags([]);

  T.section('the skins: sortit, pitch, boardroom');
  const L = (id, st, p) => SR.minigame.lookup(id, p || {}, st);
  const js = L('sortit', at('janitor')).params, ms = L('sortit', at('mail')).params;
  T.eq([js.mode, js.bins.map((x) => x.id), ms.bins.map((x) => x.id), js.items.length, js.items.every((x) => x.bin >= 0 && x.bin <= 2)],
    ['conveyor', ['trash', 'recycle', 'lost'], ['inbox', 'outbox', 'shred'], 6, true], 'Sort It: the Janitor\'s bins and the Mail Room\'s, six items each');
  T.ok(js.bins.concat(js.items, ms.bins, ms.items).every((x) => SR.text.has(x.label)) && SR.text.has(js.subtitle) && SR.text.has(ms.subtitle), 'every bin and item is written');
  T.eq([SR.minigame.auto('sortit', {}, SR.rng.create(1), at('janitor')), SR.minigame.auto('pitch', { step: 1 }, SR.rng.create(1), at('exec'))].map((x) => [x.m, x.auto]), [[1, true], [1, true]],
    'Auto is the Auto shift: m = 1.0 exactly (B-05)');
  T.eq([L('pitch', at('sales')).params.subtitle, L('pitch', at('exec')).params.subtitle, L('pitch', at('exec')).params.mode], ['mg.pitch.subtitle.sales', 'mg.pitch.subtitle.exec', 'grade'], 'The Pitch: the client or the quarterly vision');
  const vpS = at('vp', { stats: { int: 220, cha: 120, str: 60 }, clock: { day: 4 } });
  const bp = L('boardroom', vpS).params, bp2 = L('boardroom', vpS).params;
  T.eq([bp.situations.length, new Set(bp.situations).size, bp.cards.every((c) => c.length >= 2 && c.length <= 3), JSON.stringify(bp) === JSON.stringify(bp2), bp.situations.every((k) => SR.text.has(k))],
    [3, 3, true, true, true], 'Boardroom: three different situations of 2-3 options, the same ones on a reload, all written');
  let sum1 = 0, sum2 = 0, okRange = true, ruthless = 0;
  const rng1 = SR.rng.create(77), rng2 = SR.rng.create(77);
  for (let i = 0; i < 2000; i++) {
    const a = SR.minigame.auto('boardroom', {}, rng1, vpS), b2 = SR.minigame.auto('boardroom', { dScale: 2 }, rng2, vpS);
    sum1 += a.m; sum2 += b2.m;
    if (a.m < 0.7 || a.m > 1.3 || a.picks.length !== 3) okRange = false;
    ruthless += a.picks.filter((x) => x === 'ruthless').length;
  }
  T.ok(okRange && sum2 < sum1, 'Auto samples real rounds (m in 0.7-1.3, three picks); the takeover\'s double D pays less on average', [sum1 / 2000, sum2 / 2000]);

  T.section('greetings: Bea and Terry');
  const g = SR.reg.fn['greet.nli'];
  const cases = [
    [fresh({ stats: { int: 5 } }), 'visitor'], [fresh({ stats: { int: 25 } }), 'hiring'], [at('janitor'), 'janitor'], [at('mail'), 'mail'], [at('sales'), 'sales'],
    [at('exec', { clock: { day: 2 } }), 'exec'], [at('exec', { clock: { day: 5 } }), 'friday'], [at('janitor', { clock: { min: 1350 } }), 'late'],
    [at('janitor', { stats: { int: 50 }, job: { shiftsAtRank: { nli: 3 } } }), 'ready'], [at('vp'), 'terry'], [at('ceo'), 'ceo'],
  ];
  T.eq(cases.map((c) => g(c[0]).key), cases.map((c) => 'greet.nli.' + c[1]), 'by rank, the promotion in reach, Friday, the hour');
  T.ok(cases.every((c) => SR.text.has('greet.nli.' + c[1]) && SR.text(g(c[0]).key, g(c[0]).vars).indexOf('{') < 0), 'every greeting is written and filled');
}

async function game() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const t = await h.open({ width: 1280, height: 720, fast: true });
  const E = (fn, arg) => t.page.evaluate(fn, arg);
  const rows = () => E(() => SR.ui.card.rows());
  const row = async (id) => (await rows()).find((r) => r.id === id);
  const txt = (id) => E((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); return el ? el.textContent : null; }, id);
  const quiet = () => E(() => { if (SR.ui.toast && SR.ui.toast.clear) SR.ui.toast.clear(); if (SR.ui.stamp && SR.ui.stamp.clear) SR.ui.stamp.clear(); });
  const settle = async () => { await t.step(1); await t.step(100); };
  const reenter = async () => { await t.goto('city'); await t.enter('nli'); await settle(); };

  T.section('the card, the ladder, Apply');
  await t.newGame({ seed: 51 });
  await t.set({ stats: { int: 25, cha: 10 }, clock: { day: 2, min: 600 } });
  await t.enter('nli');
  await settle();
  T.eq((await rows()).map((r) => r.id), ['nli.apply', 'nli.work', 'nli.ladderOpen'], 'rows: Apply, Work, the job ladder');
  T.ok(/janitor opening/.test(await txt('card-greeting')), 'Bea is hiring', await txt('card-greeting'));
  await quiet();
  await t.shot(path.join(SHOTS, 'nli-day.png'));
  await A.check(T, t, 'W2-Money nli card', '#ui [data-scene="building"]', { tab: false });
  await t.clickUI('row-nli.ladderOpen');
  await t.step(2);
  T.eq(await E(() => SR.ui.card.screens()), ['nli.jobs'], 'the job ladder opens');
  T.eq([await txt('ladder-status'), await E(() => document.querySelector('#ui [data-id="ladder-janitor"] [data-id="ladder-next"]') !== null)], ['Not on the payroll yet.', true], 'not hired; Janitor is Next');
  await A.check(T, t, 'W2-Money nli.jobs', '#ui [data-scene="building"]');
  await t.clickUI('ladder-go');
  await t.step(3);
  let s = await t.state();
  T.eq(s.job.ranks.nli, 'janitor', 'Apply from the ladder: hired as Janitor');
  T.ok(/Janitor/.test(await txt('ladder-status')) && (await E(() => document.querySelector('#ui [data-id="ladder-janitor"] [data-id="ladder-here"]') !== null)), 'You are here: Janitor');
  const miss = await txt('ladder-missing');
  T.ok(/INT 40 \(you: 25\)/.test(miss) && /3 shifts as Janitor \(you: 0\)/.test(miss), 'Next, Mail Room: every missing requirement in danger ink', miss);
  T.eq(await E(() => document.querySelector('#ui [data-id="ladder-missing"]').style.color), 'var(--danger-ink)', 'in danger ink');
  await quiet();
  await t.shot(path.join(SHOTS, 'nli-ladder.png'));
  await t.press('back');
  await t.step(2);
  T.eq((await rows()).map((r) => r.id), ['nli.promote', 'nli.work', 'nli.ladderOpen'], 'the card now has Ask for a promotion');
  const pr = await row('nli.promote');
  T.ok(!pr.enabled && /INT 40/.test(pr.reason) && /3 shifts/.test(pr.reason), 'the row lists every missing requirement', pr.reason);

  T.section('a shift, then a promotion by click');
  let s0 = await t.state();
  await t.clickUI('row-nli.work');
  await t.step(3);
  s = await t.state();
  T.eq([s.money.cash - s0.money.cash, s.clock.min - s0.clock.min, s.stats.karma - s0.stats.karma, s.job.shiftsAtRank.nli], [60, 360, 1, 1], 'Work a shift: +$60, 6 h, +1 karma');
  await t.set({ stats: { int: 40 }, job: { shiftsAtRank: { nli: 3 } }, clock: { min: 600 } });
  await reenter();
  T.ok(/promotion/i.test(await txt('card-greeting')), 'Bea knows a promotion is in reach', await txt('card-greeting'));
  s0 = await t.state();
  await t.clickUI('row-nli.promote');
  await t.step(3);
  s = await t.state();
  T.eq([s.job.ranks.nli, s.stats.karma - s0.stats.karma, s.msgs.slice(-1)[0].key, s.msgs.slice(-1)[0].from], ['mail', 3, 'vm.gil.promoted', 'gil'], 'promoted to the Mail Room: +3 karma, Gil calls');

  T.section('Terry, from Vice President up');
  await t.set({ job: { ranks: { nli: 'vp' } } });
  await reenter();
  T.ok(/Terry|pencils|stapler/.test(await txt('card-greeting')), 'Terry greets you', await txt('card-greeting'));
  T.eq(await E(() => [SR.reg.building.nli.portrait, SR.art.interior('nli').def.owner.id]), ['terry', 'terry'], 'Terry is at the desk and on the card');
  await quiet();
  await t.shot(path.join(SHOTS, 'nli-terry.png'));

  T.section('the top of the ladder; P1: the rating line and the CEO takeover through the card');
  await t.set({ job: { ranks: { nli: 'vp' }, shiftsAtRank: { nli: 6 } }, stats: { int: 260, cha: 150, karma: 0 }, money: { cash: 0, lien: 0 }, clock: { min: 600 } });
  await reenter();
  await t.clickUI('row-nli.ladderOpen');
  await t.step(2);
  await t.clickUI('ladder-go');
  await t.step(3);
  s = await t.state();
  T.eq([s.job.ranks.nli, (await txt('ladder-top')) !== null, await E(() => { const a = document.activeElement; return !!a && a !== document.body && !!a.closest('[data-scene="building"]'); })],
    ['ceo', true, true], 'CEO from the ladder: "You run the place", and the focus stays in the card (the breadcrumb), not the page body');
  T.eq(await txt('ladder-rating'), null, 'no rating line while hustles is off');
  await t.press('back');
  await t.step(2);
  await t.debug('feature', 'hustles', true);
  await t.clickUI('row-nli.ladderOpen');
  await t.step(2);
  T.ok(/Performance rating: 1\.00/.test(await txt('ladder-rating') || '') && /need 0\.9/.test(await txt('ladder-rating') || ''), 'P1 hustles: the ladder shows your rating and the bar VP and CEO set', await txt('ladder-rating'));
  await t.press('back');
  await t.step(2);
  T.eq((await rows()).some((r) => r.id === 'nli.takeover'), false, 'no takeover in the first week as CEO');
  await t.set({ clock: { day: s.job.ceoSinceDay + TAKEOVER.from, min: 600 } });
  await reenter();
  T.eq((await row('nli.takeover') || {}).enabled, true, 'the third week as CEO: Face the hostile takeover');
  s0 = await t.state();
  await t.mg({ beats: [true, true, true], wins: 3, losses: 0, picks: ['ruthless', 'bold', 'safe'], sum: 0.3, m: 1.3 });
  await t.clickUI('row-nli.takeover');
  await t.step(4);
  s = await t.state();
  T.eq([s.money.cash - s0.money.cash, s.stats.karma - s0.stats.karma, s.flags.ceoTakeover, s.msgs.slice(-1)[0].key, (await rows()).some((r) => r.id === 'nli.takeover')],
    [TAKEOVER.bonus, -1, true, 'vm.terry.takeoverWon', false], 'won at m 1.3: +$20,000, -1 karma for the Ruthless pick, Terry calls, the row is gone');
  T.ok(/karma/i.test(await E(() => SR.text('mg.boardroom.ruthless'))), 'the Boardroom\'s Ruthless option says it costs karma (B-30)');
  await t.debug('feature', 'hustles', false);
  await t.set({ mode: { difficulty: 'relaxed' } });
  await t.clickUI('row-nli.ladderOpen');
  await t.step(2);
  T.eq(await txt('ladder-pay-janitor'), '$12.50 an hour, $75 a full shift', 'Relaxed wages ×1.25 on the ladder, cents shown (not "$13 an hour")');
  await t.press('back');
  await t.step(2);
  await t.set({ mode: { difficulty: 'standard' } });

  T.section('P1 hustles: Sort It, The Pitch, Boardroom with Auto');
  const hustle = async (rank, shot, play) => {
    await t.set({ job: { ranks: { nli: rank } }, clock: { min: 480 }, stats: { hp: 22 } });
    await reenter();
    const c0 = (await t.state()).money.cash;
    await t.clickUI('row-nli.work-hustle');
    await t.step(3);
    const top = (await t.scenes()).slice(-1)[0];
    const title = await E(() => { const el = document.querySelector('[data-id="mg-title"]'); return el ? el.textContent : null; });
    if (play) await play();
    await t.step(2);
    await quiet();
    await t.shot(path.join(SHOTS, shot + '.png'));
    await t.clickUI('mg-auto');
    await t.step(240);
    const s1 = await t.state();
    return { top, title, pay: s1.money.cash - c0, closed: (await t.scenes()).indexOf('minigame') < 0 };
  };
  await t.debug('feature', 'hustles', true);
  let hr = await hustle('janitor', 'hustle-sortit-janitor', async () => { await t.step(150); await t.press('left'); await t.step(30); });
  T.eq([hr.top, /Sort It/i.test(hr.title), hr.closed], ['minigame', true, true], 'Janitor: the Hustle plays Sort It', hr.title);
  T.ok(hr.pay >= Math.round(60 * 0.7) && hr.pay <= Math.round(60 * 1.3), 'the shift pays by the round\'s m (0.7-1.3)', hr.pay);
  hr = await hustle('mail', 'hustle-sortit-mail');
  T.eq([/Sort It/i.test(hr.title), await E(() => SR.minigame.current() === null)], [true, true], 'Mail Room: Sort It with the mail pile');
  hr = await hustle('sales', 'hustle-pitch', async () => { await t.step(30); await t.press('confirm'); await t.step(20); });
  T.ok(/Pitch/i.test(hr.title) && hr.closed && hr.pay >= Math.round(150 * 0.7) && hr.pay <= Math.round(150 * 1.3), 'Salesperson: The Pitch, paid by its m', [hr.title, hr.pay]);
  await t.set({ stats: { int: 220, cha: 120, str: 80 } });
  hr = await hustle('vp', 'hustle-boardroom', async () => { await t.clickUI('mg-duel-opt-1'); await t.step(80); });
  T.ok(/Boardroom/i.test(hr.title) && hr.closed && hr.pay >= Math.round(720 * 0.7) && hr.pay <= Math.round(720 * 1.3), 'VP: Boardroom, paid by its m', [hr.title, hr.pay]);
  await t.debug('feature', 'hustles', false);

  T.section('a week of shifts and the Friday bonus on the report');
  await t.newGame({ seed: 52 });
  await t.set({ job: { ranks: { nli: 'exec' } }, money: { cash: 0 }, clock: { day: 1, min: 480 } });
  let rep = null;
  for (let d = 0; d < 5; d++) {
    await t.enter('nli');
    await t.step(2);
    await t.clickUI('row-nli.work');
    await t.step(2);
    await t.goto('city');
    rep = await t.debug('night', 'sleep');
    if (d < 4) T.eq(rep.lines.some((l) => l.key === 'report.weeklyBonus'), false, 'no bonus after day ' + (d + 1));
  }
  const bonus = rep.lines.find((l) => l.key === 'report.weeklyBonus');
  T.eq([bonus && bonus.vars.n, bonus && bonus.vars.pct], [Math.floor(5 * 300 * BONUS.exec), 10], 'Friday night: 10 % of five Executive shifts ($150) on the morning report');
  s = await t.state();
  T.eq(s.money.cash, 5 * 300 + 150, 'paid: five shifts and the bonus');
  await t.enter('nli');
  await t.step(2);
  await t.clickUI('row-nli.ladderOpen');
  await t.step(2);
  T.ok(/Friday night bonus at 10 %/.test(await txt('ladder-bonus')), 'the ladder shows the week\'s bonus line', await txt('ladder-bonus'));

  T.section('the interior draws from palette keys; the night');
  const draw = await E(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const r = SR.art.interior('nli', {});
    try {
      r.drawStatic(ctx, null); r.drawAnim(ctx, 0.5, null, {});
      r.drawStatic(ctx, SR.state); r.drawAnim(ctx, 3.3, SR.state, { owner: { pose: 'talk' }, you: { pose: 'work' } });
      return null;
    } catch (e) { return e.message; }
  });
  T.eq(draw, null, 'drawStatic / drawAnim with no state and the live state');
  await t.newGame({ seed: 53 });
  await t.set({ clock: { day: 2, min: 1320 }, stats: { int: 30 } });
  await t.enter('nli');
  await settle();
  await quiet();
  await t.shot(path.join(SHOTS, 'nli-night.png'));
  const warns = (await t.warnings()).filter((x) => /interior|prop|palette|nli|sortit|pitch|boardroom|terry|bea|⟦/i.test(x) && !/no song/.test(x));
  T.eq(warns, [], 'no warnings about props, palette keys or missing NLI text');
  T.eq(await t.errors(), [], 'zero console errors');
  await t.close();
}

(async () => {
  rules();
  await game();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
