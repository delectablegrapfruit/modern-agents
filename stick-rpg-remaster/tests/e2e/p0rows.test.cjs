// tests/e2e/p0rows.test.cjs — owner: lead (the wave-2 exit gate, BUILD_PLAN §4.14 "Remastered
// Original": every P0 row of GDD §6.1 works through the UI; every original street interaction; the
// five original minigames; results). A tour of the real game page, one building at a time, in a
// state set up through SR.debug for the row (the cash, the items, the job, the hour it needs):
//   - every building's door opens its card; every P0 card row is clicked once (a real click), with
//     whatever it opens answered: its confirm, its sub-screen (and that sub-screen's own P0 commits:
//     the bank's forms, the Real Estate desk, the showroom, the pawn counter, the job ladder, the TV,
//     the answering machine, the stock screen, the destination board, the Election Office's chest,
//     campaign rows and debate), the save screen, the morning paper; a row the state refuses shows
//     its reason, which the test reads (and a refusal is only accepted where the plan expects one);
//   - the home door's three modes (Live, Owned: Move in, For Sale: Tour) and Campaign HQ;
//   - the street: Homeless Harold ($10, a bottle), Skid (a pack), Red (n grams), the junker
//     (hotwire, failing below INT 350 and succeeding at it), Mel's day-1 voicemail, walking into a
//     door, a car hit, a fall off the edge (the Stick General night: the card's Discharge), a lost
//     Hold-up (the Jail Day card's choices and Walk out), the Bag's smoke;
//   - the five original minigames on Auto (fight, darts, slots, blackjack; roulette, which has no
//     Auto, is bet by mouse and spun), the Hold-up on Auto, the red-eye's offer;
//   - the results (an Unlimited game retired from the pause menu: the Final Edition and its rank);
// and at the end the coverage: every P0 card row and sub-screen commit of the buildings, as the
// registry lists them, was run (or showed the refusal the plan expects). Zero console errors.
// Screenshots in shots/W2-Exit/ (git-ignored).
//   node tests/e2e/p0rows.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Exit');
// A comfortable mid-game state: HP below max (food is refused at full HP), HP max = 15 + STR.
const RICH = { money: { cash: 60000, bank: 20000 }, stats: { str: 300, int: 300, cha: 300, karma: 10, hp: 150, hpMax: 315 }, clock: { min: 600 } };

(async () => {
  const T = h.suite('e2e p0rows (wave-2 exit: every P0 row through the UI)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, a) => t.eval(fn, a);
  const cov = {};                          // action id → what happened ('ran', 'opened', 'refused: …')
  const notes = [];                        // problems found along the way
  const mark = (id, how) => { if (!cov[id] || /^refused/.test(cov[id])) cov[id] = how; };

  await ev(() => {
    const SR = window.SR;
    window.__p0 = { acted: [], mg: [] };
    SR.events.on('action:done', (p) => window.__p0.acted.push({ id: p.id, ok: !!(p.result && p.result.ok), reason: p.result && p.result.reason || null }));
    SR.events.on('minigame:done', (p) => window.__p0.mg.push({ id: p.id, skin: p.skin, result: JSON.parse(JSON.stringify(p.result || null)) }));
  });
  const acted = () => ev(() => window.__p0.acted.splice(0));
  const mgDone = () => ev(() => window.__p0.mg.splice(0));
  /** Marks every action that ran ok since the last call. @returns {string[]} their ids */
  const harvest = async () => { const a = await acted(); a.filter((x) => x.ok).forEach((x) => mark(x.id, 'ran')); return a.filter((x) => x.ok).map((x) => x.id); };

  const quiet = () => ev(() => { const U = window.SR.ui; if (U.stamp && U.stamp.clear) U.stamp.clear(); if (U.toast && U.toast.clear) U.toast.clear(); });
  const scenes = () => t.scenes();
  const top = async () => (await scenes()).slice(-1)[0];
  const screens = () => ev(() => window.SR.ui.card.screens());
  const visible = (id) => ev((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); return !!(el && el.getClientRects().length); }, id);
  const shot = async (name) => { await quiet(); await t.step(1); return t.shot(path.join(SHOTS, 'p0-' + name + '.png')); };
  /** A row as the card shows it: { disabled, reason } (null when the card has no such row). */
  const rowInfo = (id) => ev((id) => {
    const el = document.querySelector('#ui [data-row="' + id + '"]');
    if (!el || !el.getClientRects().length) return null;
    const main = el.querySelector('.arow-main'), r = el.querySelector('.arow-reason');
    return { disabled: main.getAttribute('aria-disabled') === 'true', reason: r ? r.textContent.trim() : '' };
  }, id);
  /** The card's rows, in order. */
  const cardRows = async () => (await t.ui()).rows.map((r) => r.action);
  /** Clicks the Yes of whatever confirm is on top. */
  const yes = async () => {
    const id = await ev(() => { const b = Array.from(document.querySelectorAll('#ui [data-id$="-yes"]')).filter((e) => e.getClientRects().length).pop(); return b ? b.getAttribute('data-id') : null; });
    if (!id) { notes.push('a confirm without a Yes button'); return; }
    await t.clickUI(id);
    await t.step(2);
  };
  const back = async () => {
    await quiet();
    await t.press('back');
    await t.step(2);
    if ((await top()) === 'confirm') { await yes(); }
  };
  /** Closes the card's sub-screens (each Back goes up one level). */
  const closeSub = async () => { for (let i = 0; i < 4 && (await screens()).length; i++) await back(); };
  const toCity = async () => {
    for (let i = 0; i < 8 && (await scenes()).join() !== 'city'; i++) {
      const sc = await scenes();
      if (sc.some((x) => ['jail', 'hospital', 'results', 'report', 'bustrip'].indexOf(x) >= 0)) return;
      await back();
    }
  };
  /** A fresh game in the city with RICH and a patch (the hour, items, a job ...). */
  const fresh = async (patch, opts) => {
    await t.newGame(Object.assign({ seed: 6100, name: 'Rowan', length: 40, difficulty: 'standard' }, opts || {}));
    await t.set(RICH);
    if (patch) await t.set(patch);
    await t.goto('city');
    await t.step(2);
    await acted();
  };
  /** A fresh game, then through a building's door (door ids resolve as the world's doors do). */
  const open = async (building, patch, opts) => {
    await fresh(patch, opts);
    await t.enter(building);
    await t.step(2);
    await quiet();
    await acted();
  };
  /** Steps until the minigame frame closes. */
  const mgClosed = async () => { for (let i = 0; i < 80 && (await scenes()).indexOf('minigame') >= 0; i++) await t.step(10); return (await scenes()).indexOf('minigame') < 0; };
  /** Plays the open minigame on Auto (the frame's Auto button) to its end. */
  const auto = async (label) => {
    if ((await top()) !== 'minigame') { notes.push(label + ': no minigame frame (' + (await scenes()).join(' > ') + ')'); return false; }
    if (!(await visible('mg-auto'))) { notes.push(label + ': no Auto button'); return false; }
    await t.clickUI('mg-auto');
    const closed = await mgClosed();
    if (!closed) notes.push(label + ': the frame did not close after Auto');
    return closed;
  };

  /**
   * Runs a card row by a real click and answers what it opens. `o.expect` names an expected
   * refusal (a row the plan leaves refused); `o.then(ctx)` drives what the row opened.
   * @returns {Promise<{ran: string[], refused: string|null, screens: string[]}>}
   */
  const row = async (id, o = {}) => {
    await quiet();
    const info = await rowInfo(id);
    if (!info) { notes.push(id + ': no such card row (rows: ' + (await cardRows()).join(', ') + ')'); return { ran: [], refused: null, screens: [] }; }
    if (info.disabled) {
      const ok = !!info.reason && !/⟦|\{/.test(info.reason);
      if (o.expect && o.expect.test(info.reason) && ok) mark(id, 'refused: ' + info.reason);
      else notes.push(id + ': refused unexpectedly ("' + info.reason + '")');
      return { ran: [], refused: info.reason, screens: [] };
    }
    if (o.expect) notes.push(id + ': expected a refusal (' + o.expect + '), but the row is open');
    await t.clickUI('row-' + id);
    await t.step(2);
    if ((await top()) === 'confirm') await yes();
    const sc = await screens();
    const def = await ev((id) => { const d = window.SR.reg.action[id]; return { screen: d.screen || null }; }, id);
    if (def.screen) {
      if (sc.indexOf(def.screen) >= 0) mark(id, 'opened ' + def.screen);
      else notes.push(id + ': its sub-screen ' + def.screen + ' did not open (' + sc.join(',') + ')');
    }
    const ran0 = await harvest();
    if (o.then) await o.then(sc);
    const ran = ran0.concat(await harvest());
    if (!def.screen && ran.indexOf(id) < 0 && !o.noAct) notes.push(id + ': the click ran nothing (' + JSON.stringify(await acted()) + ')');
    return { ran, refused: null, screens: sc };
  };
  /** Clicks a sub-screen button (and its confirm); marks what ran. */
  const press = async (dataId, label) => {
    if (!(await visible(dataId))) { notes.push((label || dataId) + ': no button ' + dataId); return []; }
    const dis = await ev((id) => { const b = document.querySelector('#ui [data-id="' + id + '"]'); return b.getAttribute('aria-disabled') === 'true' || b.disabled; }, dataId);
    if (dis) { notes.push((label || dataId) + ': ' + dataId + ' is disabled'); return []; }
    await t.clickUI(dataId);
    await t.step(2);
    if ((await top()) === 'confirm') await yes();
    return harvest();
  };
  const fill = async (dataId, v) => { await page.locator('#ui [data-id="' + dataId + '"]').fill(String(v)); await t.step(1); };

  try {
    // ============================================================================================
    T.section('every building\'s door opens its card');
    {
      await fresh();
      const doors = await ev(() => {
        const SR = window.SR, out = [];
        Object.keys(SR.reg.building).forEach((b) => {
          SR.debug.enter(b);
          const top = SR.scenes.top();
          const card = document.querySelector('#ui [data-id="card"]');
          out.push([b, top && top.id, card ? !!card.getClientRects().length : false, SR.ui.card.current ? SR.ui.card.current() : null]);
          SR.debug.goto('city');
        });
        return out;
      });
      T.eq(doors.filter((d) => d[1] !== 'building' || !d[2] || d[3] !== d[0]), [], 'all ' + doors.length + ' buildings: the building scene and its card (' + doors.map((d) => d[0]).join(', ') + ')');
      await acted();
    }

    // ============================================================================================
    T.section('Home, Live mode: Sleep, TV (News; the satellite\'s Fitness and Dating), Messages, Computer, Save, Top floor');
    {
      const furnished = { furniture: { owned: { bed: 1, tv: 1, satellite: 1, pc: 1 } }, clock: { min: 1080 } };
      await open('home', furnished);
      const rows = await cardRows();
      T.eq(rows, ['home.sleep', 'home.tv', 'home.messages', 'home.computer', 'home.save', 'home.topFloor'], 'the apartment\'s Live rows (P0)');
      await row('home.tv', { then: async () => {
        for (const ch of ['tvNews', 'tvFitness', 'tvDating']) await press('row-home.' + ch, 'TV ' + ch);
        T.ok(/\w/.test(await ev(() => (document.querySelector('#ui [data-id="tv-text"]') || {}).textContent || '')), 'the TV plays its show');
        await shot('home-tv');
        await closeSub();
      } });
      await row('home.messages', { then: async () => {
        const first = await ev(() => { const b = document.querySelector('#ui [data-id="msg-list"] button[data-id^="msg-"]'); return b ? b.getAttribute('data-id') : null; });
        if (first) await press(first, 'a message'); else notes.push('messages: an empty inbox');
        await press('msg-archive', 'archive');
        await closeSub();
      } });
      await row('home.computer', { then: async () => {
        await press('stock-MCS', 'the MCS ticker');
        await fill('stock-n-input', 5);
        await press('stock-buy', 'buy 5 MCS');
        await fill('stock-n-input', 5);
        await press('stock-sell', 'sell 5 MCS');
        await closeSub();
      } });
      await row('home.save', { noAct: false, then: async () => {
        if ((await top()) !== 'saveload') { notes.push('home.save: no save screen (' + (await scenes()).join(' > ') + ')'); return; }
        await press('sl-save-slot1', 'save to slot 1');
        T.ok(await ev(() => window.SR.save.list().some((e) => e.slot === 'slot1')), 'Save: the save screen in save mode writes slot 1');
        await back();
      } });
      await row('home.topFloor', { then: async () => {
        await press('re-buy-apt2', 'buy the top floor');
        await press('re-moveIn-apt2', 'move in upstairs');
        T.eq((await t.state()).homes.living, 'apt2', 'Top floor: Tour → the Real Estate desk: bought and moved in');
        await closeSub();
      } });
      await row('home.sleep', { then: async () => {
        T.eq(await top(), 'report', 'Sleep: the morning paper');
        for (let i = 0; i < 4 && (await scenes()).indexOf('report') >= 0; i++) { await quiet(); await t.press('confirm'); await t.step(3); }
        T.eq([(await scenes()).join(), (await t.state()).clock.day], ['city', 2], 'its button: day 2 in the city');
      } });
    }

    T.section('Home, the other door modes: Owned (Move in), For Sale (Tour), the castle\'s Campaign HQ');
    {
      await open('home_pent', { homes: { owned: ['apt', 'pent'], living: 'apt' } });
      await row('home.moveIn');
      T.eq((await t.state()).homes.living, 'pent', 'Owned mode: Move in');
      await open('home_pent');
      await row('home.tour', { then: async () => {
        await press('re-buy-pent', 'buy the penthouse');
        T.ok((await t.state()).homes.owned.indexOf('pent') >= 0, 'For Sale mode: Tour → the desk → bought');
        await closeSub();
      } });
      await open('home', { homes: { owned: ['apt', 'castle'], living: 'castle' }, election: { status: 'campaign', path: 'president', poll: 50, campaignDay: 2, chest: 50000, runs: 1 } });
      await row('home.campaign', { then: async () => { T.ok(await visible('campaign-poll'), 'Campaign HQ: the campaign page'); await closeSub(); } });
    }

    // ============================================================================================
    T.section('McSticks: the four foods and a shift');
    {
      await open('mcsticks');
      T.eq(await cardRows(), ['mcsticks.milkshake', 'mcsticks.fries', 'mcsticks.cheeseburger', 'mcsticks.tripleburger', 'mcsticks.work'], 'Milkshake, Fries, Cheeseburger, Triple Burger, Work (P0)');
      for (const id of ['mcsticks.milkshake', 'mcsticks.fries', 'mcsticks.cheeseburger', 'mcsticks.tripleburger', 'mcsticks.work']) await row(id);
      await t.set({ stats: { hp: 315 } });
      await ev(() => window.SR.ui.card.refresh());
      const full = await rowInfo('mcsticks.fries');
      T.ok(full && full.disabled && /full/i.test(full.reason), 'food is refused at full HP, with its reason: "' + (full && full.reason) + '"');
    }

    T.section('Funkytown Five-O: the three snacks, smokes, pills, the Hold-up (Auto)');
    {
      await open('store', { items: { gun: 1, ammo: 20 } });
      T.eq(await cardRows(), ['store.slushee', 'store.candybar', 'store.nachos', 'store.smokes', 'store.pills', 'store.rob'], 'the P0 rows');
      for (const id of ['store.slushee', 'store.candybar', 'store.nachos', 'store.smokes', 'store.pills']) await row(id);
      await row('store.rob', { noAct: true, then: async () => { await auto('the Hold-up'); } });
      await harvest();
      const s = await t.state();
      T.ok(s.records.robberies === 1 && (cov['store.rob:resolve'] === 'ran' || !!s.jail), 'the Hold-up played on Auto and resolved (' + (s.jail ? 'caught' : 'got away') + ')');
    }

    T.section('the pawn shop: knife, hand gun, ammo, alarm clock, cell phone; the counter');
    {
      await open('pawn');
      T.eq(await cardRows(), ['pawn.knife', 'pawn.gun', 'pawn.ammo', 'pawn.alarm', 'pawn.phone', 'pawn.counter'], 'the P0 rows');
      await row('pawn.counter', { then: async () => {
        await press('row-shop-buy-alarm', 'the counter: buy the alarm');
        await closeSub();
      } });
      for (const id of ['pawn.knife', 'pawn.gun', 'pawn.ammo', 'pawn.phone']) await row(id);
      await row('pawn.alarm', { expect: /Already have/i });
      const it = (await t.state()).items;
      T.eq([it.knife, it.gun, it.ammo, it.alarm, it.phone], [1, 1, 5, 1, 1], 'each bought once (the alarm at the counter; the row now refuses: already have)');
    }

    T.section('Fine Line Furnishings: the showroom buys a piece');
    {
      await open('furniture');
      await row('furniture.showroom', { then: async () => {
        await press('furn-books', 'the showroom: books');
        const why = await ev(() => { const b = document.querySelector('#ui [data-id="furn-satellite"]'), r = document.querySelector('#ui [data-id="furn-satellite-reason"]');
          return { dis: b.getAttribute('aria-disabled') === 'true', reason: r ? r.textContent.trim() : '' }; });
        T.ok(why.dis && /TV/.test(why.reason), 'the satellite without a TV is refused, with its reason: "' + why.reason + '"', why);
        await press('furn-tv', 'the showroom: the TV');
        await press('furn-satellite', 'the showroom: the satellite');
        await press('furn-pc', 'the showroom: the PC');
        T.eq((await t.state()).furniture.owned, { books: 1, tv: 1, satellite: 1, pc: 1 }, 'bought the books, the TV, then the satellite (no slot), the PC');
        const full = await ev(() => { const b = document.querySelector('#ui [data-id="furn-treadmill"]'), r = document.querySelector('#ui [data-id="furn-treadmill-reason"]');
          return { shown: !!b, dis: !!b && b.getAttribute('aria-disabled') === 'true', reason: r ? r.textContent.trim() : '' }; });
        T.ok(full.shown && full.dis && /Needs a free slot/i.test(full.reason), 'the apartment\'s three slots full: a fourth piece shows "Needs a free slot" (GDD §6.1), not hidden', full);
        await shot('showroom');
        await closeSub();
      } });
    }

    T.section('the Bank of the 2nd Dimension: Deposit, Withdraw, Get a loan, Repay, Real Estate, rates, the robbery');
    {
      await open('bank', { money: { cash: 5000, bank: 5000 }, job: { ranks: { nli: 'janitor' } } });
      T.eq(await cardRows(), ['bank.depositOpen', 'bank.withdrawOpen', 'bank.loanOpen', 'bank.repayOpen', 'bank.realestateOpen', 'bank.ratesOpen', 'bank.rob'], 'the P0 rows');
      await row('bank.depositOpen', { then: async () => { await fill('bank-deposit-input', 1000); await press('bank-deposit-go', 'deposit'); await closeSub(); } });
      await row('bank.withdrawOpen', { then: async () => { await fill('bank-withdraw-input', 500); await press('bank-withdraw-go', 'withdraw'); await closeSub(); } });
      await row('bank.repayOpen', { expect: /loan/i });
      await row('bank.loanOpen', { then: async () => { await fill('bank-borrow-input', 800); await press('bank-borrow-go', 'borrow'); await closeSub(); } });
      await row('bank.repayOpen', { then: async () => { await press('bank-repay-go', 'repay'); await closeSub(); } });
      await row('bank.realestateOpen', { then: async () => {
        await press('re-buy-apt2', 'buy the top floor');
        await press('re-moveIn-apt2', 'move in');
        await closeSub();
      } });
      await row('bank.ratesOpen', { then: async () => {
        T.ok(await visible('bank-rate-value'), 'the rate board with its sparkline');
        await closeSub();
      } });
      const s = await t.state();
      T.eq([s.homes.living, s.money.loan], ['apt2', null], 'the top floor bought and lived in; the loan taken and repaid');
      await t.set({ items: { gun: 1, ammo: 20 } });
      await ev(() => window.SR.ui.card.refresh());
      await row('bank.rob', { noAct: true, then: async () => { await auto('the bank Hold-up'); } });
      await harvest();
      T.ok(cov['bank.rob'] === 'ran' && (cov['bank.rob:resolve'] === 'ran' || !!(await t.state()).jail), 'the bank Hold-up played on Auto and resolved');
    }

    T.section('New Lines Inc.: apply, the job ladder, a promotion, a shift');
    {
      await open('nli', { job: { ranks: { nli: null } } });
      T.eq(await cardRows(), ['nli.apply', 'nli.work', 'nli.ladderOpen'], 'not on the payroll: Apply, Work (refused) and the ladder');
      await row('nli.work', { expect: /staff|hired/i });
      await row('nli.apply');
      const why = await rowInfo('nli.promote');
      T.ok(why && why.disabled && /shift/i.test(why.reason), 'Ask for a promotion shows what is missing: "' + (why && why.reason) + '"', why);
      await row('nli.ladderOpen', { then: async () => { T.ok(await visible('ladder-status'), 'the ladder shows where you stand'); await closeSub(); } });
      await t.set({ job: { shiftsAtRank: { nli: 3 } } });
      await ev(() => window.SR.ui.card.refresh());
      await row('nli.promote');
      await row('nli.work');
      T.eq((await t.state()).job.ranks.nli, 'mail', 'hired as Janitor, promoted to the Mail Room, a shift worked');
    }

    T.section('the University of Stick: Study, Business class, Gym');
    {
      await open('uofs');
      T.eq(await cardRows(), ['uofs.study', 'uofs.classBiz', 'uofs.gym'], 'the P0 rows');
      for (const id of ['uofs.study', 'uofs.classBiz', 'uofs.gym']) await row(id);
    }

    T.section('City Hall: the Election Office (the Board\'s requirements; accept, the campaign rows, the debate)');
    {
      await open('cityhall');
      T.eq(await cardRows(), ['cityhall.office'], 'one card row: the Election Office');
      await row('cityhall.office', { then: async () => {
        T.ok(await visible('campaign-reqs'), 'no nomination: the Board\'s four requirements');
        await closeSub();
      } });
      const cand = { homes: { owned: ['apt', 'castle'], living: 'castle' }, money: { cash: 900000, bank: 0 }, stats: { str: 700, int: 700, cha: 700, karma: 60, hp: 700, hpMax: 715 },
        election: { status: 'nominated', path: 'president', nominatedDay: 1, poll: 0, campaignDay: 0 } };
      await open('cityhall', cand);
      await row('cityhall.office', { then: async () => {
        await press('row-campaign-chest-0', 'the $50,000 war chest');
        T.eq((await t.state()).election.status, 'campaign', 'accepted: the campaign');
        for (const r of ['rally', 'tvAd', 'doorKnock', 'bribe']) await press('row-campaign-' + r, r);
        await closeSub();
      } });
      await open('cityhall', Object.assign({}, cand, { election: { status: 'campaign', path: 'dictator', poll: 45, campaignDay: 4, chest: 50000, runs: 1 }, stats: { str: 800, int: 800, cha: 800, karma: -60, hp: 800, hpMax: 815 } }));
      await row('cityhall.office', { then: async () => {
        await press('row-campaign-intimidate', 'intimidate');
        await t.clickUI('row-campaign-debate');
        await t.step(3);
        await auto('the debate');
        await harvest();
        T.ok((await t.state()).election.debateDone, 'the day-4 debate played (Auto)');
        await closeSub();
      } });
    }

    T.section('Sticky\'s: a beer, a bottle, a bar fight (Auto), darts practice (Auto)');
    {
      await open('bar', { clock: { min: 960 } });
      await mgDone();
      T.eq(await cardRows(), ['bar.bottle', 'bar.beer', 'bar.darts', 'bar.fight'], 'the P0 rows (Buy, Train, Special)');
      await row('bar.beer');
      await row('bar.bottle');
      await row('bar.fight', { then: async () => { await auto('the bar fight'); } });
      await row('bar.darts', { then: async () => { await auto('darts practice'); } });
      const mg = (await mgDone()).map((m) => m.id);
      T.ok(mg.indexOf('fight') >= 0 && mg.indexOf('darts') >= 0, 'the fight and darts played on Auto to a result', mg);
      await harvest();
    }

    T.section('the Silver Lining Casino: slots (Auto), blackjack (a chip, Auto), roulette (a bet by mouse, a spin)');
    {
      await open('casino', { clock: { min: 1260 } });
      await mgDone();
      T.eq(await cardRows(), ['casino.slots', 'casino.blackjack', 'casino.roulette'], 'the P0 rows');
      await row('casino.slots', { noAct: true, then: async () => { await auto('slots'); } });
      await row('casino.blackjack', { noAct: true, then: async () => { await t.key('Digit1'); await t.step(2); await auto('blackjack'); } });
      await row('casino.roulette', { noAct: true, then: async () => {
        T.ok(!(await visible('mg-auto')), 'roulette has no Auto (GDD §6.5)');
        const bx = await ev(() => { const c = document.querySelector('#ui [data-id="mg-canvas"]').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
        await page.mouse.click(bx.x + (494 + 5.5 * 54) * bx.w / 1280, bx.y + (40 + 1.5 * 64) * bx.h / 576);   // a chip on 17
        await t.step(2);
        await t.key('Space');
        for (let i = 0; i < 80; i++) { const q = await ev(() => { const c = window.SR.minigame.current(); return c && c.inst && c.inst.peek ? c.inst.peek().spinning : false; }); if (!q) break; await t.step(10); }
        await shot('roulette');
        await t.clickUI('mg-roulette-cashout');
        await mgClosed();
      } });
      const mg = (await mgDone()).map((m) => m.id);
      const ran = await harvest();
      T.ok(['slots', 'blackjack', 'roulette'].every((x) => mg.indexOf(x) >= 0), 'all three tables played to a session result', mg);
      T.ok(ran.indexOf('casino.roulette.spin:resolve') >= 0 || cov['casino.roulette.spin:resolve'] === 'ran', 'the roulette spin was applied');
      T.eq(['casino.slots:resolve', 'casino.blackjack:resolve', 'casino.roulette:resolve'].filter((id) => cov[id] !== 'ran'), [], 'each session resolved (its :resolve applied)');
    }

    T.section('the Bus Depot: the destination board; the red-eye at 00:00 (Take it; Walk away)');
    {
      const smug = { items: { booze: 10, gun: 1, ammo: 10, phone: 1 }, clock: { min: 0 } };
      for (const choice of ['take', 'walk']) {
        await open('bus', smug, { seed: 6100 + (choice === 'walk' ? 1 : 0) });
        T.eq(await cardRows(), ['bus.board'], 'one card row: the destination board');
        await row('bus.board', { then: async () => {
          await press('bus-redeye-gusty', 'the red-eye to Gustytown');
          await page.waitForTimeout(20);
          await t.step(2);
          const card = await ev(() => { const d = window.SR.scenes.get('bustrip'); return d && d.info ? JSON.parse(JSON.stringify(d.info())) : null; });
          T.ok(card && card.card === 'offer', 'boarded at 00:00: the buyer\'s offer (' + (card && card.card) + ')');
          await press('trip-' + choice, choice);
          await press('trip-next', 'ride home');
          T.eq((await scenes()).join(), 'city', 'the ride home: the city at 24:00');
        } });
      }
    }

    // ============================================================================================
    T.section('the street: Harold, Skid, Red, the junker; Mel\'s voicemail');
    {
      const talk = async (x, y) => { await t.teleport(x, y); await t.step(10); await t.press('interact'); await t.step(3); };
      const choice = async (id) => { await quiet(); await press('choice-' + id, id); };
      await fresh({ items: { booze: 2, smokes: 2 }, stats: { int: 7 } });
      const vm = (await t.state()).msgs.map((m) => m.key);
      T.ok(vm.indexOf('vm.mel.job') >= 0, 'a new game: Mel\'s day-1 job offer on the answering machine');
      if (vm.indexOf('vm.mel.job') >= 0) mark('street.jobOffer', 'ran');
      await talk(2200, 2380);
      T.eq(await top(), 'dialog', 'Harold\'s dialog');
      await choice('street.harold.give10');
      await choice('street.harold.giveBottle');
      await shot('street-harold');
      await back();
      await t.setTime(600);
      await talk(2090, 1180);
      await choice('street.kid.givePack');
      await back();
      await talk(2920, 3480);
      await fill('choice-street.dealer.buy-n-input', 2);
      await choice('street.dealer.buy');
      await back();
      await talk(727, 1200);
      await choice('street.junker.hotwire');
      T.eq((await t.state()).player.cars.junker.owned, false, 'the junker at INT 7: the attempt fails (orig)');
      await back();
      await t.set({ stats: { int: 350 } });
      await talk(727, 1200);
      await choice('street.junker.hotwire');
      T.eq((await t.state()).player.cars.junker.owned, true, 'at INT 350 it starts: the car is yours');
      await back();
      const s = await t.state();
      T.eq([s.npc.harold.gave10, s.npc.harold.bottles, s.npc.kid.packs, s.npc.dealer.bought, s.items.skateboard], [1, 1, 1, 2, 1], 'Harold: $10 and a bottle; Skid: a pack (and his skateboard); Red: 2 g');
    }

    T.section('the world: walking into a door, a car hit, the Bag\'s smoke');
    {
      await fresh();
      const walk = await ev(() => {
        const SR = window.SR, d = SR.world.geometry.doorById.mcsticks;
        SR.world.player.walkTo(d.x, d.y - 40);
        let n = 0;
        while (n < 60 * 40 && SR.scenes.stack()[0] === 'city') { SR.loop.step(1); n++; }
        const top = SR.scenes.top();
        return { scene: top && top.id, id: top && top.params && top.params.id, n };
      });
      T.eq([walk.scene, walk.id], ['building', 'mcsticks'], 'click-to-walk into McSticks\' door opens its card (' + walk.n + ' steps)');
      await harvest();
      // A real E at the door (E is interact and confirm): the card opens, and none of its rows runs
      // (the milkshake is open: HP is below max). Found at the wave-2 exit gate.
      await t.goto('city');
      await t.step(2);
      const md = await ev(() => { const g = window.SR.world.geometry.doorById.mcsticks; return { x: g.x, y: g.y }; });
      await t.teleport(md.x + 60, md.y);
      await t.step(10);
      await acted();
      const cashE = (await t.state()).money.cash;
      await t.key('KeyE');
      await t.step(3);
      const ranE = (await acted()).map((a) => a.id).filter((id) => !/^world\./.test(id));
      const inE = await ev(() => { const x = window.SR.scenes.top(); return x && x.params ? x.params.id : null; });
      T.eq([inE, ranE, (await t.state()).money.cash], ['mcsticks', [], cashE], 'a real E at McSticks\' door opens its card and runs none of its rows');
      await t.goto('city');
      await t.step(2);
      const hit = await ev(() => {
        const SR = window.SR, W = SR.world, TR = W.traffic;
        W.pedestrians.list.length = 0;
        TR.clear();
        TR.spawning = false;
        SR.debug.set({ stats: { karma: 0 } });
        W.teleport(2398, 3700);
        const hp = SR.state.stats.hp;
        TR.add('mainS|J1:mainS|J2:mainS', { s: 3700 - 656 - 90, v: 480, cruise: 480 });
        let k = 0;
        while (TR.stats.hits === 0 && k < 240) { SR.loop.step(1); k++; }
        for (let i = 0; i < 90; i++) SR.loop.step(1);
        TR.spawning = true;
        return { hits: TR.stats.hits, dhp: SR.state.stats.hp - hp };
      });
      T.eq([hit.hits, hit.dhp], [1, -10], 'a car hit: -10 HP (orig)');
      await harvest();
      await t.set({ items: { smokes: 2 } });
      await ev(() => window.SR.ui.pocket.open('bag', { item: 'smokes' }));
      await t.step(2);
      await press('bag-use', 'the Bag: smoke');
      await t.press('back');
      await t.step(2);
    }

    T.section('a fall at low HP: the Stick General night (the card\'s Discharge, the paper)');
    {
      await fresh({ stats: { hp: 5 }, clock: { min: 900 } });
      await t.fast(false);
      await t.teleport(2489, 4040);
      const fell = await ev(() => {
        const SR = window.SR, F = SR.world.fall;
        let n = 0;
        SR.input.inject('down', true);
        while (n < 240 && !F.active()) { SR.loop.step(1); n++; }
        SR.input.inject('down', false);
        while (n < 900 && F.active()) { SR.loop.step(1); n++; }
        for (let i = 0; i < 5; i++) SR.loop.step(1);
        return SR.scenes.stack();
      });
      T.eq(fell, ['hospital'], 'walking off the south end at 5 HP: HP 0, Stick General');
      let card = false;
      for (let i = 0; i < 40; i++) {
        const sc = await scenes();
        if (sc.indexOf('hospital') < 0 && sc.indexOf('report') < 0) break;
        const ph = await ev(() => { const d = window.SR.scenes.get('hospital'); const x = d && d.info ? d.info() : null; return x && x.phase; });
        if (ph === 'card' && !card) { card = true; await shot('hospital-card'); }
        await quiet();
        await t.step(30);
        await t.press('confirm');
        await t.step(5);
      }
      await t.fast(true);
      await harvest();
      const s = await t.state();
      T.ok(card && cov['hospital.discharge'] === 'ran' && (await scenes()).join() === 'city' && s.clock.min === 720 && s.clock.day === 2,
        'the card\'s Discharge (hospital.discharge), the Stick General edition, then the city at 12:00 the next day', { card, cov: cov['hospital.discharge'], scenes: await scenes(), clock: s.clock });
    }

    T.section('a lost Hold-up: the Jail Day card, its choices, Walk out');
    {
      await open('store', { items: { gun: 1, ammo: 20 } });
      await t.mg({ beats: [false, false, false], wins: 0, losses: 3 });
      await row('store.rob', { noAct: true });
      for (let i = 0; i < 4 && (await scenes()).indexOf('jail') < 0; i++) await t.step(10);
      T.eq(await scenes(), ['jail'], 'caught: the cell and the Jail Day card');
      await shot('jail');
      const picks = ['jail.str', 'jail.int', 'jail.cha', 'jail.hp'];
      const chosen = [];
      for (let i = 0; i < 6 && (await t.state()).jail; i++) {
        const id = picks[i % 4];
        await quiet();
        if (!(await visible('row-' + id))) break;
        await t.clickUI('row-' + id);
        await t.step(2);
        chosen.push(id);
      }
      await harvest();
      T.ok(chosen.length >= 2 && cov['jail.day'] === 'ran' && !(await t.state()).jail, 'served: ' + chosen.join(', ') + ' (jail.day), released');
      await press('card-leave', 'Walk out');
      T.eq((await scenes()).join(), 'city', 'Walk out: the city');
    }

    T.section('the results: an Unlimited game retired from the pause menu');
    {
      await fresh({ money: { cash: 25000, bank: 0 }, stats: { karma: 30 } }, { length: 0 });
      await t.press('pause');
      await t.step(1);
      await press('pause-retire', 'Retire (its confirm answered)');
      await t.step(3);
      await harvest();
      const r = await ev(() => {
        const SR = window.SR, st = document.querySelector('#ui [data-id="results-stamp"]'), res = SR.state && SR.state.result;
        return { scenes: SR.scenes.stack(), stamp: st ? st.textContent.trim() : null, want: res ? SR.text(res.rankKey) : null, reason: res && res.reason };
      });
      T.ok(r.scenes.join() === 'results' && r.stamp && r.stamp === r.want && r.reason === 'retire', 'Retire (world.retire) → the Final Edition, stamped ' + r.stamp, r);
      await shot('results');
    }

    // ============================================================================================
    T.section('coverage: every P0 card row and sub-screen commit of the buildings');
    const plan = await ev(() => {
      const SR = window.SR, B = Object.keys(SR.reg.building), home = SR.reg.building.home;
      const inModes = {};
      Object.keys(home.modes).forEach((m) => (Array.isArray(home.modes[m]) ? home.modes[m] : home.modes[m].actions).forEach((id) => { inModes[id] = true; }));
      const all = SR.registry.entries('action').map((e) => e.def).filter((a) => B.indexOf(a.building) >= 0 && a.p === 0 && !/:resolve$/.test(a.id));
      return {
        rows: all.filter((a) => a.row !== false && (a.building !== 'home' || inModes[a.id])).map((a) => a.id),
        commits: all.filter((a) => a.row === false || (a.building === 'home' && !inModes[a.id])).map((a) => a.id),
      };
    });
    const missingRows = plan.rows.filter((id) => !cov[id]);
    const missingCommits = plan.commits.filter((id) => !cov[id]);
    T.eq(missingRows, [], 'every P0 card row was clicked (' + plan.rows.length + ' rows)');
    T.eq(missingCommits, [], 'every P0 sub-screen commit was run (' + plan.commits.length + ': the forms, the desk, the showroom, the campaign, TV, messages, stocks)');
    const refused = Object.keys(cov).filter((id) => /^refused/.test(cov[id])).map((id) => id + ' (' + cov[id] + ')');
    console.log('  refused as planned: ' + (refused.join('; ') || 'none'));
    if (process.env.P0ROWS_VERBOSE) console.log('  rows: ' + plan.rows.map((id) => id + ' ' + cov[id]).join('\n        ') + '\n  commits: ' + plan.commits.map((id) => id + ' ' + cov[id]).join('\n           '));
    const street = ['street.harold.give10', 'street.harold.giveBottle', 'street.kid.givePack', 'street.dealer.buy', 'street.junker.hotwire', 'street.jobOffer',
      'street.harold.talk', 'street.kid.talk', 'street.dealer.talk', 'street.junker.talk', 'store.rob:resolve', 'bar.fight:resolve', 'bar.darts:resolve',
      'world.enter', 'world.city', 'world.carHit', 'world.fall', 'hospital.discharge', 'jail.day', 'world.retire', 'bag.smoke', 'trip.redeye', 'trip.take', 'trip.walk'];
    T.eq(street.filter((id) => cov[id] !== 'ran'), [], 'the street, the world, the trip, the ward, the cell and the Bag (' + street.length + ' actions) all ran');
    T.eq(notes, [], 'nothing unexpected along the way');
    T.eq(await ev(() => window.SR.text.missing()), [], 'every text key shown resolves');
    T.eq(t.errors(), [], 'zero console errors');
  } catch (e) {
    T.ok(false, 'threw: ' + (e && e.stack || e));
    if (notes.length) console.log('  notes: ' + notes.join('\n         '));
  } finally {
    await t.close();
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
