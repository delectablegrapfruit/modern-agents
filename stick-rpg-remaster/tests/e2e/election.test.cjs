// tests/e2e/election.test.cjs — owner: W2-Civic. City Hall's Election Office through the real UI
// (BUILD_PLAN §4.7; GDD §4.17; BALANCE B-17; UI §5.6 Campaign HQ):
//   - the debug-assisted run from nomination to office: stats, money and the castle set, the
//     Electoral Board's call overnight, the War chest picked in `cityhall.campaign` (confirm, cash
//     then bank, the starting poll), seven campaign days of rows clicked in the sub-screen (poll
//     chips, "used n of cap", the halved repeat, the cap), the day-4 debate through the Duel frame
//     (a forced result), election night (Report.election, the rival's concession by voicemail),
//     the office screen, the portrait in the hall, the salary;
//   - the Board's requirements screen, a lapse after 14 days, a loss and the next call 30 days
//     later, campaign days in jail, the Dictator's rows (Intimidate asks first), the debate played
//     for real with keys (General Crayon), the diary and the poll ghost on the meter;
//   - review additions: the bunting hangs as soon as the nomination is accepted in the hall (not
//     on the next visit), a new game starts an empty diary, the march (ART_AUDIO §13.4) plays in
//     City Hall in office and survives the debate with the Dictator's variant (SR.audio.music spied);
//     a spend at or above `game.confirmSpendOver` asks first as on a card row; the diary is dated by
//     campaign day; the castle's Campaign HQ hosts the screen (and gives the castle its song back);
//     a nomination that no longer qualifies; a removed mayor's page.
// Screenshots in shots/W2-Civic/. Zero console errors.
//   node tests/e2e/election.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Civic');

(async () => {
  const T = h.suite('e2e election (W2-Civic)');
  const t = await h.open({ fast: true });
  const TE = await t.eval(() => window.SR.tuning.election);
  // Every SR.audio.music request, [id, variant] (the songs are W2-Music's; the engine may be silent).
  await t.eval(() => {
    const A = window.SR.audio, orig = A.music;
    window.__civicMusic = [];
    A.music = function (id, o) { window.__civicMusic.push([id, (o && o.variant) || null]); return orig.apply(this, arguments); };
  });
  const musicLog = () => t.eval(() => window.__civicMusic.slice());
  const musicReset = () => t.eval(() => { window.__civicMusic.length = 0; });
  // A pixel of the world canvas where the campaign bunting hangs (int. cityhall banners, x 552-762).
  const buntingPx = async () => (await t.pixels(590, 120, 1, 1)).data.slice(0, 3);
  const screen = () => t.eval(() => { const e = document.querySelector('#ui [data-subscreen="cityhall.campaign"]'); return e ? { status: e.getAttribute('data-status'), text: e.innerText } : null; });
  const rowIds = () => t.eval(() => Array.from(document.querySelectorAll('#ui [data-subscreen="cityhall.campaign"] .arow-main')).map((b) => b.getAttribute('data-id')));
  const rowOf = (id) => t.eval((id) => {
    const b = document.querySelector('#ui [data-subscreen="cityhall.campaign"] [data-id="' + id + '"]');
    return b ? { text: b.innerText.replace(/\s+/g, ' '), disabled: b.getAttribute('aria-disabled') === 'true' } : null;
  }, id);
  // Toasts of earlier steps stay up in fast mode (no time passes); clear them where a shot is about
  // the screen, not the feedback.
  const cleanShot = async (name) => {
    await t.eval(() => { const T0 = window.SR.ui.toast; if (T0 && typeof T0.clear === 'function') T0.clear(); });
    await t.step(1);
    await t.shot(path.join(SHOTS, name));
  };
  const openOffice = async () => {
    await t.enter('cityhall');
    await t.step(2);
    await t.press('row1');
    await t.step(2);
  };
  const confirmYes = async () => {
    await t.step(1);
    T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'a confirm asks first');
    await t.clickUI('confirm-campaign-yes');
    await t.step(2);
  };
  const candidate = (st, money) => t.set({
    homes: { owned: ['apt', 'castle'], living: 'castle' }, money: Object.assign({ cash: 400000, bank: 100000 }, money || {}),
    stats: Object.assign({ str: 700, int: 700, cha: 700, karma: 60, hp: 715, hpMax: 715 }, st || {}),
  });

  try {
    // ------------------------------------------------------------------------------------------
    T.section('the Election Office before the call: who the Board picks');
    await t.newGame({});
    await t.set({ clock: { min: 600 } });
    await openOffice();
    T.eq(await t.eval(() => window.SR.ui.card.screens()), ['cityhall.campaign'], 'the Election Office row opens cityhall.campaign');
    let sc = await screen();
    T.eq(sc.status, 'none', 'no candidate on file');
    const reqs = await t.eval(() => Array.from(document.querySelectorAll('#ui [data-id^="campaign-req-"]')).map((li) => [li.getAttribute('data-id'), li.getAttribute('data-met')]));
    T.eq(reqs, [['campaign-req-home', 'no'], ['campaign-req-money', 'no'], ['campaign-req-stats', 'no'], ['campaign-req-karma', 'no']], 'the four requirements of B-17, all missing on day 1');
    T.ok(/castle/i.test(sc.text) && /\$200,000/.test(sc.text) && /666/.test(sc.text) && /25/.test(sc.text), 'castle, $200,000, stats 666, karma +25', sc.text);
    T.ok(!/⟦/.test(sc.text), 'no missing text key');
    await t.shot(path.join(SHOTS, 'election-office-none.png'));
    await t.press('back');
    await t.step(2);

    // ------------------------------------------------------------------------------------------
    T.section('the debug-assisted run: the Board calls overnight');
    await candidate();
    await t.set({ clock: { min: 1380 } });
    await t.night('sleep');
    let s = await t.state();
    T.eq([s.election.status, s.election.path, s.clock.day], ['nominated', 'president', 2], 'castle, $500,000, all 700, karma +60: nominated for President on day 2');
    const call = s.msgs.find((m) => m.key === 'vm.board.nominated');
    const callText = call ? await t.eval((m) => window.SR.text(m.key, m.vars), call) : '';
    T.ok(call && call.from === 'board' && !/[{⟦]/.test(callText), 'the Electoral Board\'s voicemail: ' + callText);
    await t.set({ clock: { min: 480 } });
    await t.press('back');
    await t.step(2);
    await t.enter('cityhall');
    await t.step(2);
    const greeting = await t.eval(() => { const b = document.querySelector('#ui [data-id="card-greeting"]'); return b ? b.innerText.trim() : ''; });
    T.ok(/Electoral Board/.test(greeting) && greeting.indexOf(String(2 + TE.acceptWithin - 1)) >= 0, 'Clerk Plume mentions the call and its last day');
    T.eq((await t.ui()).rows.map((r) => r.id), ['row-cityhall.office'], 'the card lists the Election Office (accept is a sub-screen row)');
    await t.shot(path.join(SHOTS, 'cityhall-card-nominated.png'));
    await t.press('row1');
    await t.step(2);
    sc = await screen();
    T.eq(sc.status, 'nominated', 'the Election Office shows the nomination');
    T.eq(await rowIds(), ['row-campaign-chest-0', 'row-campaign-chest-1', 'row-campaign-chest-2'], 'three war chests');
    const chest2 = await rowOf('row-campaign-chest-2');
    T.ok(/\$200,000/.test(chest2.text) && /\+25 poll/.test(chest2.text) && /Start at 66 %/.test(chest2.text), 'the $200,000 chest: +25 poll, start at 66 % (B-17 example)', chest2.text);
    await t.shot(path.join(SHOTS, 'election-office-nominated.png'));

    // ------------------------------------------------------------------------------------------
    T.section('accepting: the confirm, cash first, then the bank');
    await candidate({}, { cash: 150000, bank: 350000 });
    await t.eval(() => window.SR.ui.card.refresh());
    await t.step(2);
    const wallPx = await buntingPx();
    await t.press('row3');
    await confirmYes();
    await t.step(2);
    const flagPx = await buntingPx();
    T.ok(Math.abs(flagPx[0] - wallPx[0]) + Math.abs(flagPx[1] - wallPx[1]) + Math.abs(flagPx[2] - wallPx[2]) > 90,
      'the bunting hangs as soon as the campaign starts, in the hall (' + wallPx + ' → ' + flagPx + ')');
    s = await t.state();
    T.eq([s.election.status, s.election.campaignDay, s.election.poll, s.election.chest], ['campaign', 1, 66, 200000], 'accepted: campaign day 1 at 66 %');
    T.eq([s.money.cash, s.money.bank], [0, 300000], '$150,000 from cash, $50,000 from the bank');
    sc = await screen();
    T.eq(sc.status, 'campaign', 'the screen turns into the campaign');
    T.ok(await t.eval(() => !!document.querySelector('#ui [data-id="campaign-poll"] .meter-line')), 'the poll Meter with its 50 % line');
    T.ok(/Day 1 of 7/.test(sc.text) && /Mayor Doodle/.test(sc.text) && /day 4/.test(sc.text), 'day 1 of 7, the rival, the debate on day 4', sc.text);
    T.eq(await rowIds(), ['row-campaign-rally', 'row-campaign-tvAd', 'row-campaign-doorKnock', 'row-campaign-bribe'], 'a President\'s rows: rally, TV ad, door-knocking, bribe');
    const diary = await t.eval(() => window.SR.reg.subscreen['cityhall.campaign'].diary());
    T.eq(diary.map((d) => [d.key, d.day]), [['toast.election.accepted', 1]], 'the diary starts with the acceptance, on campaign day 1');
    T.ok(/Day 1 · The campaign begins at 66 %/.test(sc.text), 'its line is dated like the header ("Day 1 of 7"), not by the calendar (day 2)', sc.text);
    await t.shot(path.join(SHOTS, 'election-office-campaign.png'));

    // ------------------------------------------------------------------------------------------
    T.section('seven campaign days through the sub-screen');
    await t.set({ money: { cash: 1000000 }, stats: { cha: 700 } });
    const poll = () => t.get('election.poll');
    // UI §2.3: a spend at or above the game.confirmSpendOver setting (default $1,000) asks first,
    // in the Election Office as on a card row.
    await t.set({ clock: { min: 480 } });
    await t.eval(() => window.SR.ui.card.refresh());
    const spend0 = [await poll(), await t.get('money.cash')];
    await t.clickUI('row-campaign-rally');
    await t.step(1);
    T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'a $5,000 rally asks first (game.confirmSpendOver $1,000)');
    const ask = await t.eval(() => { const c = document.querySelector('#ui [data-id="confirm-campaign"]'); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
    T.ok(/Spend \$5,000/.test(ask), 'the confirm names the spend: ' + ask);
    await t.press('back');
    await t.step(2);
    T.eq([await poll(), await t.get('money.cash')], spend0, 'No (Esc): nothing spent, the poll unchanged');
    await t.eval(() => window.SR.settings.set('game.confirmSpendOver', 0));
    const adOf = () => t.eval(() => { const e = document.querySelector('#ui [data-id="campaign-ad"]'); return e ? e.innerText.trim() : null; });
    const ads = [];
    for (let day = 1; day <= TE.campaignDays; day++) {
      await t.set({ clock: { min: 480 } });
      await t.eval(() => window.SR.ui.card.refresh());
      ads.push(await adOf());
      let p0 = await poll();
      const rally = await rowOf('row-campaign-rally');
      if (day === 1) T.ok(/\+3\.8 poll/.test(rally.text) && /Used 0 of 2 today/i.test(rally.text), 'the rally row: +3.8 poll at CHA 700, used 0 of 2', rally.text);
      await t.clickUI('row-campaign-rally');
      await t.step(2);
      const r1 = Math.round(((await poll()) - p0) * 10) / 10;
      const again = await rowOf('row-campaign-rally');
      if (day === 1) {
        T.eq(r1, 3.8, 'a rally: +3.8 (1 + 700/250, to 0.1)');
        T.ok(/\+1\.9 poll/.test(again.text) && /half effect/i.test(again.text), 'the second rally previews half: +1.9', again.text);
      }
      await t.clickUI('row-campaign-rally');
      await t.step(2);
      const capped = await rowOf('row-campaign-rally');
      if (day === 1) T.ok(capped.disabled && /Come back tomorrow/.test(capped.text), 'after two rallies the row is capped: "Come back tomorrow"', capped.text);
      await t.clickUI('row-campaign-tvAd');
      await t.step(2);
      if (day === 1) T.eq(await adOf(), ads[0], 'the day\'s attack ad holds through the day\'s actions');
      await t.clickUI('row-campaign-doorKnock');
      await t.step(2);
      await t.clickUI('row-campaign-doorKnock');
      await t.step(2);
      if (day === TE.debate.day) {
        const deb = await rowOf('row-campaign-debate');
        T.ok(deb && !deb.disabled, 'day 4: the debate row appears', deb);
        T.ok(/3 questions: \+3 or -2 poll each/.test(deb.text), 'its chip moves the poll per question (B-17): ' + deb.text);
        await t.mg({ beats: [true, true, false], wins: 2, losses: 1 });
        await t.set({ election: { poll: 60 } });   // below the clamp, so the +4 shows
        p0 = await poll();
        await t.clickUI('row-campaign-debate');
        await t.step(3);
        T.eq(Math.round(((await poll()) - p0) * 10) / 10, TE.debate.win * 2 + TE.debate.lose, 'the debate (2 won, 1 lost): +4');
        T.ok(/Debate done/.test((await screen()).text), 'the screen reads "Debate done"');
      }
      if (day === 2) await cleanShot('election-office-day2.png');
      await t.set({ clock: { min: 1380 } });
      const rep = await t.night('sleep');
      if (day < TE.campaignDays) {
        T.ok(rep.lines.some((l) => l.key === 'report.election.rival'), 'night ' + day + ': the rival campaigns (' + (await poll()) + ' %)');
      } else {
        T.ok(rep.election && rep.election.won === true && rep.election.path === 'president', 'election night after day 7: won (' + JSON.stringify(rep.election) + ')');
      }
    }
    T.ok(ads.every((a) => a && /^Tonight's attack ad from Mayor Doodle: /.test(a)) && new Set(ads).size > 1,
      'each campaign day shows one of Mayor Doodle\'s attack ads (GDD §6.2), not always the same', ads);
    s = await t.state();
    T.eq([s.election.status, s.job.office], ['office', 'president'], 'in office: President of Sticks');
    const concede = s.msgs.find((m) => m.key === 'vm.doodle.concede');
    T.ok(!!concede, 'Mayor Doodle concedes by voicemail');
    const dia = await t.eval(() => window.SR.reg.subscreen['cityhall.campaign'].diary());
    T.ok(dia.some((d) => d.key === 'report.election.rival') && dia.some((d) => d.key === 'report.election.won'), 'the diary kept the rival\'s nights and the result', dia.map((d) => d.key));
    const lastNights = dia.filter((d) => d.key === 'report.election.rival').map((d) => d.day);
    T.eq([lastNights.slice(-1)[0], dia.find((d) => d.key === 'report.election.won').day], [TE.campaignDays, TE.campaignDays],
      'the diary dates each night by its campaign day: the rival\'s last night and the result on day 7', dia.map((d) => d.day + ' ' + d.key));
    await t.eval(() => window.SR.settings.set('game.confirmSpendOver', 1000));
    const concedeText = await t.eval((m) => window.SR.text(m.key, m.vars), concede);
    T.ok(!/[{⟦]/.test(concedeText) && concedeText.indexOf(String(concede.vars.poll)) >= 0, 'the concession names the final poll');
    sc = await screen();
    T.eq(sc && sc.status, 'office', 'the open Election Office turned into the office screen');
    T.ok(/President of Sticks/i.test(sc.text) && /\$10,000/.test(sc.text), 'the office and its $10,000 salary', sc.text);
    await t.press('back');
    await t.step(2);
    await t.press('back');
    await t.step(2);
    await musicReset();
    await t.enter('cityhall');
    await t.step(3);
    const pg = await t.eval(() => { const b = document.querySelector('#ui [data-id="card-greeting"]'); return b ? b.innerText.trim() : ''; });
    T.ok(/President/.test(pg), 'Clerk Plume greets the President');
    const inOffice = await musicLog();
    T.eq(inOffice.slice(-1)[0], ['hail_to_the_stick', null], 'City Hall in office plays the march (ART_AUDIO §13.4)', inOffice);
    await cleanShot('cityhall-in-office.png');
    await t.press('row1');
    await t.step(2);
    await cleanShot('election-office-office.png');
    const cash0 = await t.get('money.cash');
    const rep2 = await t.night('sleep');
    T.ok((await t.get('money.cash')) - cash0 >= TE.salary && rep2.lines.some((l) => l.key === 'report.salary'), 'the office pays $10,000 a night');
    await musicReset();
    await t.press('back');
    await t.step(2);
    T.ok((await musicLog()).every((m) => m[0] !== 'campus_canon'), 'closing the Election Office in office keeps the march', await musicLog());
    await t.press('back');
    await t.step(2);

    // ------------------------------------------------------------------------------------------
    T.section('a lapse, a loss and the next run 30 days later');
    await t.newGame({});
    T.eq(await t.eval(() => window.SR.reg.subscreen['cityhall.campaign'].diary()), [], 'a new game starts an empty campaign diary (the last game\'s news is gone)');
    await candidate();
    await t.set({ clock: { min: 1380 } });
    await t.night('sleep');
    const callDay = await t.get('election.nominatedDay');
    for (let i = 0; i < TE.acceptWithin; i++) await t.night('sleep');
    T.eq([await t.get('election.status'), await t.get('election.retryFromDay')], ['none', callDay + TE.acceptWithin - 1 + TE.retry], 'not accepted in 14 days: the offer lapses; a new call from 30 days later');
    await t.set({ election: { status: 'campaign', path: 'president', poll: 20, campaignDay: TE.campaignDays, chest: 50000, runs: 1 } });
    const lost = await t.night('sleep');
    const day = await t.get('clock.day');
    const lastPoll = await t.get('election.poll');
    T.eq([lost.election && lost.election.won, await t.get('election.status'), await t.get('election.retryFromDay')], [false, 'lost', day - 1 + TE.retry], 'poll 20 on election night: lost; another run from day ' + (day - 1 + TE.retry));
    T.ok((await t.state()).msgs.some((m) => m.key === 'vm.doodle.gloat'), 'Mayor Doodle gloats');
    await openOffice();
    sc = await screen();
    T.ok(sc.status === 'lost' && sc.text.indexOf('lost on ' + lastPoll + ' %') >= 0 && new RegExp('from day ' + (day - 1 + TE.retry)).test(sc.text), 'the office shows the loss (' + lastPoll + ' %) and the day of the next run', sc.text);
    await cleanShot('election-office-lost.png');
    await t.press('back');
    await t.step(2);
    await t.press('back');
    await t.step(2);
    const retry = await t.get('election.retryFromDay');
    while ((await t.get('clock.day')) < retry - 1) await t.night('sleep');
    T.eq(await t.get('election.status'), 'lost', 'no call before day ' + retry);
    await t.night('sleep');
    T.eq([await t.get('clock.day'), await t.get('election.status')], [retry, 'nominated'], 'the Board calls again on day ' + retry);

    // ------------------------------------------------------------------------------------------
    T.section('campaign days in jail still count');
    await t.set({ election: { status: 'campaign', path: 'president', poll: 50, campaignDay: 2, chest: 50000 }, jail: { daysLeft: 3, served: 0, reason: 'storeRobbery', bailBase: 0 } });
    await t.night('jail');
    T.eq(await t.get('election.campaignDay'), 3, 'a jail night advances the campaign to day 3');
    await t.set({ jail: null });

    // ------------------------------------------------------------------------------------------
    T.section('the castle\'s Campaign HQ hosts the same screen; a nomination that no longer qualifies; a removed mayor');
    await t.newGame({});
    await candidate({}, { cash: 1000000 });
    await t.set({ clock: { min: 480 }, election: { status: 'campaign', path: 'president', poll: 50, campaignDay: 2, chest: 50000, runs: 1 } });
    await musicReset();
    await t.enter('home');
    await t.step(3);
    const homeRows = (await t.ui()).rows.map((r) => r.id);
    const hq = homeRows.indexOf('row-home.campaign');
    T.ok(hq >= 0, 'the castle card lists Campaign HQ (W2-Home)', homeRows);
    await t.press('row' + (hq + 1));
    await t.step(2);
    sc = await screen();
    T.eq([await t.eval(() => window.SR.ui.card.screens()), sc && sc.status], [['cityhall.campaign'], 'campaign'], 'Campaign HQ opens cityhall.campaign on its campaign page');
    const hq0 = await t.get('election.poll');
    await t.eval(() => window.SR.settings.set('game.confirmSpendOver', 0));
    await t.clickUI('row-campaign-rally');
    await t.step(2);
    await t.eval(() => window.SR.settings.set('game.confirmSpendOver', 1000));
    T.ok((await t.get('election.poll')) > hq0, 'a rally from the castle moves the poll (' + hq0 + ' → ' + (await t.get('election.poll')) + ')');
    await t.press('back');
    await t.step(2);
    const homeSong = await t.eval(() => window.SR.reg.building.home.music);
    const hm = await musicLog();
    T.ok(hm.some((m) => m[0] === 'hail_to_the_stick') && JSON.stringify(hm.slice(-1)[0]) === JSON.stringify([homeSong, null]),
      'the march plays in the castle\'s HQ, and closing it hands the castle its own song back', hm);
    await t.press('back');
    await t.step(3);
    await t.set({ election: { status: 'nominated', path: 'president', nominatedDay: 1, poll: 0, campaignDay: 0 }, homes: { living: 'apt' } });
    await openOffice();
    sc = await screen();
    T.ok(sc.status === 'nominated' && /will not sign/.test(sc.text) && /Live in the castle/.test(sc.text) && !/Every stat/.test(sc.text),
      'nominated, then moved out of the castle: the office lists only what is missing', sc.text);
    const chests = await Promise.all([0, 1, 2].map((i) => rowOf('row-campaign-chest-' + i)));
    T.ok(chests.every((c) => c && c.disabled), 'and every war chest is disabled until it is fixed', chests);
    await t.press('back');
    await t.step(2);
    await t.press('back');
    await t.step(2);
    await t.set({ election: { status: 'removed', retryFromDay: 40 }, homes: { living: 'castle' } });
    await openOffice();
    sc = await screen();
    T.ok(sc.status === 'removed' && /ended early/.test(sc.text) && /from day 40/.test(sc.text), 'a removed mayor: the last term and the day of the next run', sc.text);
    await t.press('back');
    await t.step(2);
    await t.press('back');
    await t.step(2);

    // ------------------------------------------------------------------------------------------
    T.section('a Dictator\'s campaign: Intimidate asks first; the debate played for real');
    await t.newGame({});
    await candidate({ str: 800, int: 800, cha: 800, karma: -60 });
    await t.set({ clock: { min: 480 }, election: { status: 'campaign', path: 'dictator', poll: 45, campaignDay: TE.debate.day, chest: 50000, runs: 1 } });
    await openOffice();
    T.eq(await rowIds(), ['row-campaign-rally', 'row-campaign-tvAd', 'row-campaign-intimidate', 'row-campaign-bribe', 'row-campaign-debate'], 'a Dictator\'s rows: no door-knocking, Intimidate, and the debate on day 4');
    const intim = await rowOf('row-campaign-intimidate');
    T.ok(/\+3 or -3 poll/.test(intim.text) && /%/.test(intim.text), 'Intimidate shows both outcomes and its chance: ' + intim.text);
    await t.eval(() => { const b = document.querySelector('#ui [data-id="row-campaign-intimidate"]'); window.SR.ui.focus.focus(b); });
    const ghost = await t.eval(() => { const g = document.querySelector('#ui [data-id="campaign-poll"] .meter-ghost'); return g ? g.style.width : null; });
    T.ok(ghost && ghost !== '0' && ghost !== '0%', 'focusing a row ghosts its poll change on the meter (' + ghost + ')');
    await cleanShot('election-office-dictator.png');
    const k0 = await t.get('stats.karma'), h0 = await t.get('stats.heat');
    await t.clickUI('row-campaign-intimidate');
    await confirmYes();
    T.eq([(await t.get('stats.karma')) - k0, (await t.get('stats.heat')) - h0], [TE.intimidate.karma, TE.intimidate.heat], 'Intimidate: -5 karma, +10 Heat');
    const p0 = await t.get('election.poll');
    await musicReset();
    await t.clickUI('row-campaign-debate');
    await t.step(3);
    T.eq((await t.scenes()).slice(-1)[0], 'minigame', 'the debate opens the Duel frame');
    const frame = await t.eval(() => ({ title: document.querySelector('#ui [data-id="mg-title"]').innerText, card: document.querySelector('#ui [data-id="mg-duel-card"]').innerText }));
    T.ok(/debate/i.test(frame.title) && /General Crayon/i.test(frame.title), 'the frame: The Debate · versus General Crayon (' + frame.title + ')');
    T.ok(/Question 1 of 3/.test(frame.card) && /Quote the facts/.test(frame.card) && /Turn on the charm/.test(frame.card) && /Pile on the pressure/.test(frame.card), 'question 1 of 3 with Facts, Charm and Pressure (B-30\'s names in the labels)', frame.card);
    await t.step(10);
    await cleanShot('debate-frame.png');
    for (let i = 0; i < 3; i++) {
      await t.key('Digit3');
      await t.step(70);
    }
    await t.step(30);
    T.eq(await t.scenes(), ['building'], 'three answers end the debate');
    const done = await t.state();
    const dr = done.election;
    T.ok(dr.debateDone === true, 'the debate is done');
    const beats = Math.round((dr.poll - p0) * 10) / 10;
    T.ok([9, 4, -1, -6].indexOf(beats) >= 0, 'the poll moved by 3 × (+3 or -2): ' + beats);
    sc = await screen();
    T.ok(/Debate done/.test(sc.text), 'back in the office: "Debate done"');
    const dm = await musicLog();
    T.ok(dm.length > 0 && dm.every((m) => m[0] === 'hail_to_the_stick' && m[1] === 'dictator'),
      'the debate ducks the march and hands nothing else back: the Dictator\'s march all along', dm);
    T.eq(t.errors(), [], 'zero console errors');
  } catch (e) {
    T.ok(false, 'threw: ' + (e && e.stack || e));
  } finally {
    await t.close();
  }
  T.done();
})();
