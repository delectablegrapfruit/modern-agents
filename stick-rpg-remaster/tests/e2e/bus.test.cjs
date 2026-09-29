// tests/e2e/bus.test.cjs — owner: W2-Transit. The bus depot, the destination board and the Sky Bus
// trip in the real game page (BUILD_PLAN §4.9 acceptance; GDD §4.1, §4.11; UI §5.6, §5.13):
//   - the depot's card: one row (the destination board), Tabby's departure-clock greeting, the depot
//     interior; the board sub-screen mounts, refreshes and unmounts: the clock line, your bag, six
//     departure-board rows in data/cities.js order with their tickets, [Red-eye 00:00] refused with
//     "Buses leave at 00:00" until 00:00;
//   - boarding at 00:00 (hotkey and confirm) commits trip.redeye once: the ticket, the clock to
//     24:00; the ride (6 s, skippable only after 1 s), the event card: the offer with Take it /
//     Walk away (Haggle only with `tours`), then the ride home and the city at 24:00 outside the depot;
//   - every outcome's card with fixed seeds (sold, walked, mugged, wasted, no buyers, busted → jail,
//     screwed), a refused boarding back to the depot, a buyer still waiting after leaving the trip
//     (Back to the deal), and the P1 rows behind `tours` (the tour buttons, the wait row);
//   - zero console errors; screenshots in shots/W2-Transit/.
//   node tests/e2e/bus.test.cjs
'use strict';
const path = require('path');
const K = require('./transit-kit.cjs');
const A = require('./a11y.test.cjs');

const READY = { money: { cash: 800, bank: 0 }, items: { booze: 20, snow: 0, gun: 1, ammo: 10, phone: 1 },
  stats: { str: 300, cha: 150, heat: 0, hpMax: 322, hp: 322 } };

(async () => {
  const T = K.h.suite('e2e bus (W2-Transit)');
  const t = await K.open();
  const P = t.page;
  const ev = (fn, arg) => P.evaluate(fn, arg);
  const trip = () => K.info(t, 'bustrip');

  /** A fresh state for a trip at 00:00 with a patch, standing in the depot with the board open. */
  async function atDepot(patch, min) {
    await t.newGame({ seed: 7 });
    await t.set(Object.assign({}, READY, { clock: { min: min === undefined ? 0 : min } }));
    if (patch) await t.set(patch);
    await t.enter('bus');
    await t.clickUI('row-bus.board');
    await t.step(1);
  }
  /** Boards the red-eye to a city from the open board through its button and the confirm. */
  async function board(city) {
    await t.clickUI('bus-redeye-' + city);
    await t.clickUI('confirm-board-yes');
    await P.waitForTimeout(20);
    await t.step(1);
  }

  T.section('the depot: one card row, Tabby\'s departure clock, the interior');
  {
    await t.set(Object.assign({}, READY, { clock: { min: 870 } }));
    await t.enter('bus');
    await t.step(1);
    const ui = await t.ui();
    T.eq(ui.rows.map((r) => r.action), ['bus.board'], 'the card shows one row: the destination board');
    const b = await ev(() => window.SR.ui.building.info());
    T.eq([b.id, b.interior], ['bus', true], 'the depot interior is drawn (SR.def.interior bus)');
    await P.evaluate(() => { const s = window.SR.ui.card; const el = document.querySelector('#ui [data-id="card-greeting"]'); if (el && el.complete) el.complete(); return !!s; });
    T.ok(/Next red-eye in 9h 30m/.test(await K.text(t, 'card-greeting')), 'Tabby: "Next red-eye in 9h 30m" at 14:30', await K.text(t, 'card-greeting'));
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'depot-1280.png'));
  }

  T.section('the destination board (bus.board): six cities, refused until 00:00');
  {
    await t.clickUI('row-bus.board');
    await t.step(1);
    T.eq(await ev(() => window.SR.ui.card.screens()), ['bus.board'], 'the row opens the sub-screen');
    const rows = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-city]'), (e) => e.getAttribute('data-city')));
    T.eq(rows, await ev(() => window.SR.rules.trade.cityIds()), 'one departure-board row per city, in data/cities.js order');
    const tickets = await ev(() => window.SR.rules.trade.cityIds().map((id) => document.querySelector('#ui [data-id="bus-ticket-' + id + '"]').textContent.trim()));
    T.eq(tickets, ['$115', '$100', '$100', '$115', '$130', '$130'], 'the tickets of B-12a as cost chips');
    const btn = await ev(() => { const b = document.querySelector('#ui [data-id="bus-redeye-gusty"]'); const d = document.getElementById(b.getAttribute('aria-describedby')); return { dis: b.getAttribute('aria-disabled'), why: d ? d.textContent : '' }; });
    T.eq(btn, { dis: 'true', why: 'Buses leave at 00:00' }, '[Red-eye 00:00] is refused with "Buses leave at 00:00"');
    T.ok(/Next red-eye in 9h 30m/.test(await K.text(t, 'bus-clock')), 'the departure clock', await K.text(t, 'bus-clock'));
    T.ok(/bottles of beer × 20 · grams of snow × 0/.test(await K.text(t, 'bus-carry')), 'what you carry', await K.text(t, 'bus-carry'));
    T.eq([await K.visible(t, 'bus-tour-gusty'), await K.visible(t, 'bus-wait'), await K.visible(t, 'bus-waiting')], [false, false, false],
      'no tour buttons, wait row or waiting buyer (P1 `tours` off, no offer)');
    // A real click on the refused button (aria-disabled: Playwright's click would wait for it).
    await ev(() => document.querySelector('#ui [data-id="bus-redeye-gusty"]').click());
    await t.step(1);
    T.eq([await t.scenes(), await K.visible(t, 'confirm-board')], [['building'], false], 'a refused board button stays on the board (no confirm)');
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'board-1280.png'));
    T.eq((await t.eval(A.audit, '#ui')).issues, [], 'the board: names, roles and contrast (the a11y audit)');
    const names = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id^="bus-redeye-"]'), (b) => b.getAttribute('aria-label')));
    T.eq([names.length, new Set(names).size, names[3]], [6, 6, 'Red-eye 00:00, Gustytown'],
      'six red-eye buttons, six accessible names: each names its city (the visible label stays "Red-eye 00:00")');
    await t.set({ clock: { min: 0 } });
    await ev(() => window.SR.ui.card.refresh());
    T.eq(await ev(() => document.querySelector('#ui [data-id="bus-redeye-gusty"]').getAttribute('aria-disabled')), null, 'at 00:00 the red-eye boards');
    T.ok(/Now boarding/.test(await K.text(t, 'bus-clock')), 'and the clock says so');
  }

  T.section('boarding at 00:00 by hotkey: the ticket once, the day, the ride, the offer');
  {
    await atDepot();
    const before = await t.state();
    await t.press('row4');
    await t.step(1);
    T.ok(await K.visible(t, 'confirm-board'), 'hotkey 4 (Gustytown) asks to confirm');
    T.ok(/Gustytown for \$115/.test(await K.text(t, 'confirm-board')), 'the confirm names the city and the ticket', await K.text(t, 'confirm-board'));
    await t.clickUI('confirm-board-yes');
    await P.waitForTimeout(20);
    await t.step(1);
    const s = await t.state();
    T.eq(await t.scenes(), ['bustrip'], 'the trip scene takes over');
    T.eq([before.money.cash - s.money.cash, s.clock.min, s.clock.day, s.trade.offer && s.trade.offer.outcome], [115, 1440, 1, 'offer'],
      'trip.redeye ran once: -$115, the clock to 24:00, the offer waits');
    const i = await trip();
    T.eq([i.phase, i.city, i.card], ['card', 'gusty', 'offer'], 'fast mode skips the ride: the offer card');
    const acts = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-choice]'), (e) => e.getAttribute('data-choice')));
    T.eq(acts, ['take', 'walk'], 'Take it and Walk away (Haggle hidden while `tours` is off)');
    const story = await K.text(t, 'trip-story');
    T.ok(/buyer in Gustytown looks over your 20 bottles and offers \$\d/.test(story), 'the offer\'s story', story);
    const chips = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-choice="take"] .chip'), (c) => c.getAttribute('data-chip')));
    T.ok(['money', 'karma', 'heat'].every((k) => chips.indexOf(k) >= 0), 'Take it shows its cash, karma and Heat chips', chips);
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'trip-offer-1280.png'));
    T.eq((await t.eval(A.audit, '#ui')).issues, [], 'the offer card: names, roles and contrast');
    const offer = s.trade.offer;
    await t.press('row1');
    await t.step(1);
    const s2 = await t.state();
    const i2 = await trip();
    T.eq([i2.card, i2.outcome, s2.money.cash - s.money.cash, s2.stats.karma - s.stats.karma, s2.stats.heat - s.stats.heat, s2.items.booze],
      ['final', 'sold', offer.total, -5, 10, 0], 'Take it (hotkey 1): sold, the cash, -5 karma, +10 Heat, the bottles go');
    T.ok(/hand over 20 bottles/.test(await K.text(t, 'trip-story')), 'the sold story');
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'trip-sold-1280.png'));
    await t.clickUI('trip-next');
    await t.step(1);
    const s3 = await t.state();
    const door = await ev(() => window.SR.world.spawnPoint('bus'));
    T.eq([await t.scenes(), s3.clock.min, Math.round(s3.player.x), Math.round(s3.player.y)], [['city'], 1440, Math.round(door.x), Math.round(door.y)],
      'Ride home: the city at 24:00, outside the depot');
    const trips = await K.events(t, ['trip']);
    T.eq(trips.map((e) => e.p.outcome), ['sold'], 'one `trip` event: sold');
  }

  T.section('the ride: 6 s, skippable only after 1 s (fast off)');
  {
    await atDepot();
    await t.fast(false);
    await board('eraser');
    T.eq((await trip()).phase, 'ride', 'the ride plays');
    await t.step(20);
    await t.press('confirm');
    await t.step(1);
    T.eq((await trip()).phase, 'ride', 'a press before 1 s does not skip');
    await t.step(60);
    await K.settle(t, 30);
    await t.shot(path.join(K.SHOTS, 'trip-ride-1280.png'));
    await t.press('confirm');
    await t.step(1);
    T.eq((await trip()).phase, 'card', 'after 1 s a press skips to the card');
    await t.clickUI('trip-walk');
    await t.step(1);
    await t.clickUI('trip-next');
    await t.step(30);
    T.eq((await trip()).phase, 'home', 'the ride home plays');
    await t.step(100);
    T.eq(await t.scenes(), ['city'], 'and ends in the city');
    await atDepot();
    await board('eraser');
    await t.step(362);
    T.eq((await trip()).phase, 'card', 'unskipped, the ride ends by itself after 6 s');
    await t.fast(true);
    await K.events(t);
  }

  T.section('every outcome\'s card with fixed seeds (GDD §4.11)');
  {
    /** Boards with a seed and a patch; returns the card. */
    async function outcome(city, patch, seed) {
      await atDepot(patch);
      await t.seed(seed || 1);
      await board(city);
      return { i: await trip(), s: await t.state(), story: await K.text(t, 'trip-story'), head: await K.text(t, 'card-title') };
    }
    let o = await outcome('gusty', { items: { booze: 0, snow: 0 } });
    T.eq([o.i.card, o.i.outcome, o.head], ['final', 'wasted', 'A wasted trip'], 'nothing to sell: a wasted trip');
    o = await outcome('gusty', { items: { gun: 0 } });
    T.eq([o.i.outcome, o.s.money.cash, o.s.items.booze, o.head], ['mugged', 0, 0, 'Mugged'], 'no gun: mugged, cash and goods gone');
    T.ok(await ev(() => document.querySelectorAll('#ui [data-id="trip-chips"] .chip').length >= 2), 'the card lists what the trip took as chips');
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'trip-mugged-1280.png'));
    o = await outcome('pegas', { stats: { str: 210 }, items: { phone: 0 } });
    T.eq([o.i.outcome, o.head], ['noBuyers', 'No buyers'], 'no phone: no buyers');
    o = await outcome('gusty', {});
    await t.clickUI('trip-walk');
    await t.step(1);
    const w = await t.state();
    T.eq([(await trip()).outcome, w.items.booze, w.trade.offer], ['walked', 20, null], 'Walk away: the bottles stay');
    const screwed = await K.seedFor(60, async (seed) => (await outcome('rustbelt', { items: { booze: 0, snow: 10 } }, seed)).i.outcome === 'screwed');
    T.ok(screwed !== null, 'screwed on a fixed seed (the 10 % roll)', screwed);
    T.eq(await K.text(t, 'card-title'), 'Screwed', 'the screwed card');
    o = await outcome('gusty', { items: { booze: 60 } });
    T.eq([o.i.card, o.i.outcome, o.head, /Booked for 5 days/.test(await K.text(t, 'trip-booked'))], ['busted', 'busted', 'Busted', true],
      'a bust: the card says Busted and how long');
    T.eq(await t.scenes(), ['bustrip'], 'the trip scene presents the bust before the jail');
    await K.settle(t, 1300);
    await t.shot(path.join(K.SHOTS, 'trip-busted-1280.png'));
    await t.clickUI('trip-next');
    await t.step(1);
    const j = await K.info(t, 'jail');
    T.eq([await t.scenes(), j && j.reason, j && j.report], [['jail'], 'bust', 'jail'], 'Go quietly: the jail scene with the arrest night');
    // A bust on the last day of a timed game: its arrest night ends the game. The trip card still
    // presents the bust (the results wait), and the cell leads to the Final Edition.
    await t.newGame({ seed: 7, length: 15 });
    await t.set(Object.assign({}, READY, { clock: { day: 15, min: 0 } }));
    await t.set({ items: { booze: 60 } });
    await t.enter('bus');
    await t.clickUI('row-bus.board');
    await t.step(1);
    await board('gusty');
    await P.waitForTimeout(30);
    await t.step(1);
    const last = await trip();
    T.eq([(await t.state()).over, await t.scenes(), last && last.card], [true, ['bustrip'], 'busted'],
      'a bust that ends a timed game: the trip card still shows Busted (the results wait)');
    await t.clickUI('trip-next');
    await t.step(1);
    await P.waitForTimeout(30);
    await t.step(1);
    T.eq([await t.scenes(), (await K.info(t, 'jail')).mode, /Read the Final Edition/.test(await K.text(t, 'card-leave'))], [['jail'], 'over', true],
      'Go quietly: the cell, where the story ends (Read the Final Edition)');
  }

  T.section('real keys: Enter and Esc on the trip card (Esc is `back` and `pause`)');
  {
    const key = async (code) => { await t.key(code); await t.step(2); await P.waitForTimeout(300); await t.step(1); };
    await atDepot();
    await key('Digit4');
    T.ok(await K.visible(t, 'confirm-board'), 'Digit4 asks to board Gustytown');
    await key('Enter');
    await t.step(2);
    T.eq([await t.scenes(), (await trip()).card], [['bustrip'], 'offer'], 'Enter boards; the same press never also decides the offer');
    await key('Escape');
    T.eq(await t.scenes(), ['bustrip', 'pause'], 'Esc on the offer: the pause menu (a decision is due, no way back)');
    await key('Escape');
    T.eq([await t.scenes(), (await trip()).card], [['bustrip'], 'offer'], 'Esc closes the pause menu; the offer is still up');
    await key('Enter');
    T.eq((await trip()).outcome, 'sold', 'Enter: the focused Take it');
    await key('Escape');
    await t.step(2);
    T.eq(await t.scenes(), ['city'], 'Esc on the final card: Ride home to the city (no pause menu on top)');
  }

  T.section('a refused boarding, a buyer still waiting, and the P1 rows');
  {
    await t.newGame({ seed: 7 });
    await t.set(Object.assign({}, READY, { clock: { min: 480 } }));
    await t.goto('bustrip', { city: 'gusty', kind: 'smuggle' });
    await t.step(1);
    const r = await trip();
    T.eq([r.card, await K.text(t, 'card-title')], ['refused', 'No bus for you'], 'boarding at 08:00 is refused on the card');
    T.ok(/Buses leave at 00:00/.test(await K.text(t, 'trip-story')), 'with the reason');
    T.eq((await t.state()).money.cash, 800, 'nothing was taken');
    await t.clickUI('trip-next');
    await t.step(1);
    T.eq([await t.scenes(), await ev(() => window.SR.ui.card.current())], [['building'], 'bus'], 'Back to the depot');
    await atDepot();
    await board('gusty');
    await t.goto('city');
    await t.enter('bus');
    await t.clickUI('row-bus.board');
    await t.step(1);
    T.ok(await K.visible(t, 'bus-waiting'), 'the board shows the buyer still waiting');
    await t.clickUI('bus-resume');
    await t.step(1);
    const rs = await trip();
    T.eq([await t.scenes(), rs.card, rs.city], [['bustrip'], 'offer', 'gusty'], 'Back to the deal: the offer card');
    await t.clickUI('trip-take');
    await t.step(1);
    T.eq((await trip()).outcome, 'sold', 'and it can still be taken');
    await t.debug('feature', 'tours', true);
    await t.newGame({ seed: 7 });
    await t.set(Object.assign({}, READY, { clock: { min: 180 } }));
    await t.enter('bus');
    await t.clickUI('row-bus.board');
    await t.step(1);
    T.eq([await K.visible(t, 'bus-tour-gusty'), await K.visible(t, 'bus-wait')], [true, true], '`tours` on: tour buttons and "Wait for the tour bus" before 06:00');
    T.ok(/Demand \d+ %/.test(await ev(() => document.querySelector('#ui [data-city="gusty"]').textContent)), 'the rows show today\'s demand');
    await t.clickUI('bus-wait');
    await t.step(1);
    T.eq([(await t.state()).clock.min, await K.visible(t, 'bus-wait')], [360, false], 'waiting sets the clock to 06:00 and the row goes');
    // A speaking tour: the hook (a forced result), trip.tour:resolve, the card; then the hook played in
    // the frame. The tourhook skin is still a stub, so the plain Duel engine plays its beat.
    const TOUR = { clock: { min: 420 }, money: { cash: 500, bank: 0 }, stats: { cha: 300, karma: 5, str: 300, hpMax: 322, hp: 322 },
      items: { phone: 1 }, job: { ranks: { nli: 'exec' } } };
    await t.newGame({ seed: 7 });
    await t.set(TOUR);
    await K.events(t);
    await t.mg({ beats: [true], wins: 1, losses: 0 });
    await t.goto('bustrip', { city: 'eraser', kind: 'tour' });
    await t.step(1);
    await P.waitForTimeout(20);
    await t.step(1);
    const tr = await trip();
    const acts = (await K.events(t, ['action:done'])).map((e) => e.p.id);
    T.eq([tr.card, tr.outcome, acts.filter((id) => /^trip\./.test(id))], ['final', 'toured', ['trip.tour', 'trip.tour:resolve']],
      'a tour: the hook, then trip.tour:resolve, then the Standing ovation card');
    T.ok((await t.state()).money.bank > 0, 'the fee is wired to the bank');
    await t.newGame({ seed: 7 });
    await t.set(TOUR);
    await t.goto('bustrip', { city: 'gusty', kind: 'tour' });
    await t.step(1);
    await P.waitForTimeout(20);
    const mg = await ev(() => { const c = window.SR.minigame.current(); return c ? { id: c.id, D: c.params.D, check: c.params.check } : null; });
    T.eq([await t.scenes(), (await trip()).phase, mg], [['bustrip', 'minigame'], 'hook', { id: 'duel', D: 150, check: 'tour.hook' }],
      'unforced, the hook opens in the minigame frame (the Duel engine while the skin is a stub)');
    await ev(() => window.SR.minigame.current().host.finish({ beats: [false], wins: 0, losses: 1 }));
    await t.step(3);
    await P.waitForTimeout(20);
    await t.step(1);
    T.eq([await t.scenes(), (await trip()).outcome], [['bustrip'], 'toured'], 'the hook\'s result resolves the tour (never stuck in the hook)');
    await t.debug('feature', 'tours', false);
  }

  T.section('the six destination postcards (the trip interior, one silhouette per city)');
  {
    await t.goto('title');
    // The postcard alone: the title's menu (W2-Front) and any toast would cover the canvas.
    await ev(() => { window.SR.ui.toast.clear(); document.getElementById('ui').style.visibility = 'hidden'; });
    const ids = await ev(() => window.SR.rules.trade.cityIds());
    const sums = [];
    for (const id of ids) {
      const sum = await ev((id) => {
        const SR = window.SR, c = document.getElementById('world'), ctx = c.getContext('2d');
        const k = c.width / SR.W;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        const r = SR.art.interior('trip', { city: id, min: 720 });
        r.drawStatic(ctx, SR.state);
        r.drawAnim(ctx, 1.3, SR.state, {});
        const d = ctx.getImageData(Math.round(180 * k), Math.round(180 * k), Math.round(520 * k), Math.round(260 * k)).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) >>> 0;
        return h;
      }, id);
      sums.push(sum);
      await t.shot(path.join(K.SHOTS, 'postcard-' + id + '.png'));
    }
    await ev(() => { document.getElementById('ui').style.visibility = ''; });
    T.eq(new Set(sums).size, ids.length, 'every city draws its own skyline on its island');
  }

  T.section('the ride and the postcards keep to the fill budget (ARCHITECTURE §17: ≤ 250 path fills a frame)');
  {
    await ev(() => {
      const ctx = document.getElementById('world').getContext('2d');
      if (ctx.__transitCount) return;
      const n = ctx.__transitCount = { fills: 0, images: 0 };
      ['fill', 'fillRect'].forEach((m) => { const o = ctx[m]; ctx[m] = function () { n.fills++; return o.apply(this, arguments); }; });
      const oi = ctx.drawImage;
      ctx.drawImage = function () { n.images++; return oi.apply(this, arguments); };
    });
    /** Runs n steps, then counts the fills of one rendered frame. */
    const frame = (n) => ev((n) => {
      const SR = window.SR, c = document.getElementById('world').getContext('2d').__transitCount;
      if (n > 1) SR.loop.step(n - 1);
      c.fills = 0; c.images = 0;
      SR.loop.step(1);
      return { fills: c.fills, images: c.images };
    }, n);
    await t.fast(false);
    const worst = {};
    for (const id of await ev(() => window.SR.rules.trade.cityIds())) {
      await atDepot();
      await t.goto('bustrip', { city: id, kind: 'smuggle' });
      let ride = 0, card = 0;
      for (let i = 0; i < 12; i++) ride = Math.max(ride, (await frame(30)).fills);
      await frame(40);
      if ((await trip()).phase === 'card') { await frame(1); card = (await frame(1)).fills; }
      worst[id] = [ride, card];
    }
    await t.fast(true);
    const over = Object.keys(worst).filter((id) => worst[id][0] > 250 || worst[id][1] > 250);
    T.eq(over, [], 'the ride (the far cities baked as sprites) and each postcard (batched windows and sequins)', worst);
  }

  T.section('1920 × 1080: the board and the offer card scale with the stage');
  {
    await t.resize(1920, 1080);
    await atDepot();
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'board-1920.png'));
    const box = await ev(() => { const r = document.querySelector('#ui [data-id="bus-cities"]').getBoundingClientRect(); return { w: r.width, x: r.x }; });
    T.ok(box.w > 600 && box.x > 1100, 'the board sits in the card at the right, scaled up', box);
    await board('crayonburg');
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'trip-card-1920.png'));
    T.ok(['offer', 'final'].indexOf((await trip()).card) >= 0, 'the trip card shows at 1920 × 1080');
    await t.resize(1280, 720);
  }

  T.section('zero console errors');
  T.eq(t.errors(), [], 'no console errors or page errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
