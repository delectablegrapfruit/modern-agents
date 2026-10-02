// tests/e2e/electionrun.test.cjs — owner: lead (the wave-2 exit gate, BUILD_PLAN §4.14 "Remastered
// Original"). The debug-assisted election run: a Medium Standard game whose stats, karma and money
// are set through SR.debug, then played through the real UI from there: the castle bought and moved
// into at the bank's Real Estate desk, the nomination on stepping into the city (the Electoral
// Board's voicemail), the war chest picked in City Hall's Election Office (its confirm), seven
// campaign days of Election Office rows (rallies, the TV ad, door-knocking; the day-4 debate in the
// Duel frame on Auto), a night in the castle after each, and election night: the election-night
// edition of the paper (the result, the poll bar, the needle settled by a press, the stamp), then
// the morning paper and the city. In office: President of Sticks, the rival's concession, the
// office screen at City Hall, the $10,000 salary the next night. Zero console errors.
// Screenshots in shots/W2-Exit/ (git-ignored).
//   node tests/e2e/electionrun.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Exit');

(async () => {
  const T = h.suite('e2e electionrun (wave-2 exit: the debug-assisted election run)');
  const t = await h.open({ fast: true });
  const ev = (fn, a) => t.eval(fn, a);
  const quiet = () => ev(() => { const U = window.SR.ui; if (U.stamp && U.stamp.clear) U.stamp.clear(); if (U.toast && U.toast.clear) U.toast.clear(); });
  const top = async () => (await t.scenes()).slice(-1)[0];
  const shot = async (name) => { await t.step(1); return t.shot(path.join(SHOTS, name + '.png')); };
  const screen = () => ev(() => { const e = document.querySelector('#ui [data-subscreen="cityhall.campaign"]'); return e ? { status: e.getAttribute('data-status'), text: e.innerText.replace(/\s+/g, ' ') } : null; });
  const rowState = (id) => ev((id) => {
    const b = document.querySelector('#ui [data-subscreen="cityhall.campaign"] [data-id="' + id + '"]');
    return b ? { text: b.innerText.replace(/\s+/g, ' '), disabled: b.getAttribute('aria-disabled') === 'true' } : null;
  }, id);
  const toCity = async () => {
    for (let i = 0; i < 6 && (await t.scenes()).join() !== 'city'; i++) { await quiet(); await t.press('back'); await t.step(2); }
  };
  /** City Hall, then its one card row: the Election Office (cityhall.campaign). */
  const office = async () => {
    await toCity();
    await t.enter('cityhall');
    await t.step(2);
    await t.clickUI('row-cityhall.office');
    await t.step(2);
  };
  /** Clicks an Election Office row; answers its confirm (a spend over the setting, Intimidate, Bribe). */
  const campaignRow = async (id) => {
    const r = await rowState(id);
    if (!r || r.disabled) return false;
    await quiet();
    await t.clickUI(id);
    await t.step(2);
    if ((await top()) === 'confirm') { await t.clickUI('confirm-campaign-yes'); await t.step(2); }
    return true;
  };
  /** Home (the castle's door, Live mode) → Sleep → the report scene up. */
  const sleep = async () => {
    await toCity();
    await t.enter('home');
    await t.step(2);
    await quiet();
    await t.clickUI('row-home.sleep');
    await t.step(2);
  };
  const morning = async () => {
    for (let i = 0; i < 8 && (await t.scenes()).indexOf('report') >= 0; i++) { await quiet(); await t.press('confirm'); await t.step(3); }
  };

  try {
    await ev(() => {
      const SR = window.SR;
      window.__el = { calls: [], election: [], stamps: [] };
      SR.events.on('election', (p) => window.__el.election.push(p.status));
      // Every Stamp raised (its text), so a landed stamp is seen even after its wall-clock hold.
      const st = SR.ui.stamp, spy = function (o) { if (o && !o.static) window.__el.stamps.push(o.text || (o.key ? SR.text(o.key, o.vars) : '')); return st.apply(this, arguments); };
      Object.assign(spy, st);
      SR.ui.stamp = spy;
    });

    // ------------------------------------------------------------------------------------------
    T.section('a new Medium game; stats, karma and money set through SR.debug');
    await t.newGame({ seed: 1717, name: 'Candidate', length: 40, difficulty: 'standard' });
    await t.goto('city');
    await t.step(2);
    await t.set({ stats: { str: 700, int: 700, cha: 700, karma: 60, hp: 715, hpMax: 715 }, money: { cash: 760000, bank: 0 }, clock: { min: 540 } });
    let s = await t.state();
    T.eq([s.stats.str, s.stats.int, s.stats.cha, s.stats.karma, s.stats.hpMax, s.money.cash, s.election.status], [700, 700, 700, 60, 715, 760000, 'none'],
      'all stats 700, karma +60, $760,000 in cash; no nomination yet (no castle)');

    // ------------------------------------------------------------------------------------------
    T.section('the castle bought and moved into at the bank\'s Real Estate desk');
    await t.enter('bank');
    await t.step(2);
    await t.clickUI('row-bank.realestateOpen');
    await t.step(2);
    T.eq(await ev(() => window.SR.ui.card.screens()), ['bank.realestate'], 'the Real Estate desk opens');
    await t.clickUI('re-buy-castle');
    await t.step(2);
    T.eq(await top(), 'confirm', 'Buy asks first');
    await t.clickUI('confirm-re-yes');
    await t.step(2);
    await t.clickUI('re-moveIn-castle');
    await t.step(2);
    s = await t.state();
    T.eq([s.homes.owned.indexOf('castle') >= 0, s.homes.living, s.money.cash], [true, 'castle', 260000], 'the castle bought ($500,000) and lived in; $260,000 left');
    await quiet();
    await shot('election-castle-bought');

    // ------------------------------------------------------------------------------------------
    T.section('stepping into the city: the Electoral Board calls');
    await toCity();
    s = await t.state();
    T.eq([await t.scenes(), s.election.status, s.election.path, s.election.nominatedDay], [['city'], 'nominated', 'president', 1],
      'out of the bank into the city: nominated for President on day 1 (GDD §4.17: checked on stepping into the city)');
    const call = s.msgs.find((m) => m.key === 'vm.board.nominated');
    const callText = call ? await ev((m) => window.SR.text(m.key, m.vars), call) : '';
    T.ok(!!call && call.from === 'board' && !/[{⟦]/.test(callText), 'the Board\'s voicemail: ' + callText);

    // ------------------------------------------------------------------------------------------
    T.section('City Hall: the war chest');
    await office();
    let sc = await screen();
    T.eq(sc && sc.status, 'nominated', 'the Election Office shows the nomination');
    const chest = await rowState('row-campaign-chest-2');
    T.ok(chest && !chest.disabled && /\$200,000/.test(chest.text), 'the $200,000 war chest is offered', chest);
    await shot('election-office-nominated');
    await quiet();
    await t.clickUI('row-campaign-chest-2');
    await t.step(2);
    T.eq(await top(), 'confirm', 'the war chest asks first');
    await t.clickUI('confirm-campaign-yes');
    await t.step(2);
    s = await t.state();
    T.eq([s.election.status, s.election.campaignDay, s.election.chest, s.money.cash], ['campaign', 1, 200000, 60000], 'accepted: campaign day 1, $200,000 paid');
    T.ok(s.election.poll >= 60, 'the starting poll with the chest: ' + s.election.poll + ' %');
    sc = await screen();
    T.ok(sc && sc.status === 'campaign' && /Day 1 of 7/.test(sc.text), 'the screen turns into the campaign: day 1 of 7', sc && sc.text);
    await t.set({ money: { cash: 1000000 } });   // money buys the campaign (debug-assisted)

    // ------------------------------------------------------------------------------------------
    T.section('seven campaign days through the Election Office, a night in the castle after each');
    const days = [];
    let rep = null;
    for (let day = 1; day <= 7; day++) {
      await office();
      const p0 = (await t.state()).election.poll;
      const done = [];
      for (const id of ['row-campaign-rally', 'row-campaign-rally', 'row-campaign-tvAd', 'row-campaign-doorKnock', 'row-campaign-doorKnock']) {
        if (await campaignRow(id)) done.push(id.replace('row-campaign-', ''));
      }
      const deb = await rowState('row-campaign-debate');
      if (deb && !deb.disabled) {
        await quiet();
        await t.clickUI('row-campaign-debate');
        await t.step(3);
        T.eq(await top(), 'minigame', 'day ' + day + ': the debate opens the Duel frame');
        await shot('election-debate');
        await t.clickUI('mg-auto');
        for (let i = 0; i < 40 && (await t.scenes()).indexOf('minigame') >= 0; i++) await t.step(10);
        T.ok((await t.state()).election.debateDone === true, 'the debate is done (played on Auto)');
        done.push('debate');
      }
      s = await t.state();
      days.push({ day: s.election.campaignDay, done, poll: [p0, s.election.poll] });
      if (day === 2) { await quiet(); await shot('election-office-campaign'); }
      // Election night is presented without the fast skip: the needle swings until a press settles it.
      if (day === 7) await t.fast(false);
      await sleep();
      T.eq(await top(), 'report', 'campaign day ' + day + ': Sleep in the castle opens the paper');
      rep = await ev(() => { const x = window.SR.scenes.top(); return x && x.params ? JSON.parse(JSON.stringify(x.params.report)) : null; });
      if (day < 7) await morning();
    }
    console.log('  ' + days.map((d) => 'campaign day ' + d.day + ': ' + d.done.join(', ') + ' · poll ' + d.poll[0] + ' → ' + d.poll[1]).join('\n  '));
    T.ok(days.every((d, i) => d.day === i + 1 && d.done.indexOf('rally') >= 0 && d.done.indexOf('tvAd') >= 0 && d.done.indexOf('doorKnock') >= 0),
      'every campaign day: rallies, the TV ad and door-knocking', days);
    T.ok(days[3].done.indexOf('debate') >= 0 && days.filter((d) => d.done.indexOf('debate') >= 0).length === 1, 'the debate on day 4 only');

    // ------------------------------------------------------------------------------------------
    T.section('election night: the election-night edition first');
    T.ok(rep && rep.election && rep.election.won === true && rep.election.path === 'president', 'the night after campaign day 7 is election night: won', rep && rep.election);
    const front = await ev(() => {
      const box = document.querySelector('#ui [data-id="report-election"]');
      const head = box && box.querySelector('[data-id="report-headline"]');
      return { box: !!box, head: head ? head.textContent.trim() : null, poll: !!document.querySelector('#ui [data-id="report-poll"]'),
        needle: !!document.querySelector('#ui [data-id="report-needle"]'), button: document.querySelector('#ui [data-id="report-continue"]').textContent.trim() };
    });
    T.ok(front.box && front.poll && front.needle && !!front.head && !/[{⟦]/.test(front.head), 'the front page: the result, the poll bar and the needle (' + front.head + ')', front);
    // The needle swings for 1.6 s of wall-clock time (requestAnimationFrame); on a loaded machine it
    // may have settled by itself before the check, which the next assertions accept as well.
    const swinging = await ev(() => { const r = document.querySelector('#ui [data-id="report-election-result"]'); return r && r.style.visibility === 'hidden'; });
    T.ok(true, swinging ? 'the ±5 needle swings; the final reading waits for it' : 'the ±5 needle had settled by itself (a slow machine)');
    if (swinging) {
      await t.press('confirm');
      await t.step(2);
    }
    const settled = await ev(() => {
      const r = document.querySelector('#ui [data-id="report-election-result"]');
      return { result: r ? r.textContent.trim() : null, visible: r ? r.style.visibility !== 'hidden' : false, stamp: window.__el.stamps.slice(-1)[0] || null,
        page: document.querySelector('#ui [data-id="report-election"]') !== null };
    });
    const wonStamp = await ev(() => window.SR.text('news.election.stamp.president'));
    T.ok(settled.page && settled.visible && /\d/.test(settled.result || ''), (swinging ? 'a press settles the needle' : 'the needle settled') + ': the final reading shows (' + settled.result + ')', settled);
    T.eq(settled.stamp, wonStamp, 'and the stamp lands: ' + wonStamp);
    await shot('election-night-edition');
    await quiet();
    await t.press('confirm');
    await t.step(2);
    await t.fast(true);
    const second = await ev(() => ({ election: document.querySelector('#ui [data-id="report-election"]') !== null, head: (document.querySelector('#ui [data-id="report-headline"]') || {}).textContent || '' }));
    T.ok(!second.election && (await t.scenes()).indexOf('report') >= 0, 'the next press turns to the morning edition', second);
    await shot('election-morning-after');
    await morning();
    s = await t.state();
    T.eq([await t.scenes(), s.election.status, s.job.office, s.clock.day], [['city'], 'office', 'president', 8], 'in the city on day 8: in office, President of Sticks');
    const concede = s.msgs.find((m) => m.key === 'vm.doodle.concede');
    T.ok(!!concede, 'Mayor Doodle concedes by voicemail');

    // ------------------------------------------------------------------------------------------
    T.section('in office');
    await office();
    sc = await screen();
    T.ok(sc && sc.status === 'office' && /President of Sticks/i.test(sc.text) && /\$10,000/.test(sc.text), 'the Election Office is the office screen: President of Sticks, $10,000 a night', sc && sc.text);
    await quiet();
    await shot('election-office-in-office');
    const cash0 = (await t.state()).money.cash;
    await sleep();
    const salaryRep = await ev(() => { const x = window.SR.scenes.top(); return x && x.params && x.params.report ? x.params.report.lines.map((l) => l.key) : []; });
    await morning();
    T.ok((await t.state()).money.cash - cash0 >= 10000 && salaryRep.indexOf('report.salary') >= 0, 'the office pays $10,000 a night (the morning paper says so)');
    T.eq(await t.scenes(), ['city'], 'and the next day starts in the city');
    T.eq(await ev(() => window.SR.text.missing()), [], 'every text key the run showed resolves');
    T.eq(t.errors(), [], 'zero console errors');
  } catch (e) {
    T.ok(false, 'threw: ' + (e && e.stack || e));
  } finally {
    await t.close();
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
