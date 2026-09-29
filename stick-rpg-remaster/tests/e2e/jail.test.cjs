// tests/e2e/jail.test.cjs — owner: W2-Transit. Jail in the real game page (BUILD_PLAN §4.9
// acceptance; GDD §4.10, §6.6; UI §3, §5.12; BALANCE B-11c):
//   - an arrest (a lost Five-O hold-up through W2-Food's rows, or any action that jails) queues the
//     jail scene; its length is base + floor(Heat / 25) and the arrest night is the first;
//   - the Jail Day card: "Day 2 of 5", why, last night's one-line summary, the four choices with
//     their gain chips (hotkeys 1-4), the leave button refused while you serve; each choice runs
//     jail.day: the gain, the jail night (the Report's events and day:started, never the full
//     paper), "Day 3 of 5"; Esc and the Pocket do nothing in the cell;
//   - the release at 08:00 (Heat 20) and Walk out to the City Hall steps ('afterJail'); Bail with
//     the P1 `police` flag; a timed game that ends in jail leads to the Final Edition;
//   - zero console errors; screenshots in shots/W2-Transit/.
//   node tests/e2e/jail.test.cjs
'use strict';
const path = require('path');
const K = require('./transit-kit.cjs');
const A = require('./a11y.test.cjs');

(async () => {
  const T = K.h.suite('e2e jail (W2-Transit)');
  const t = await K.open();
  const P = t.page;
  const ev = (fn, arg) => P.evaluate(fn, arg);
  const jail = () => K.info(t, 'jail');
  await ev(() => {
    // A test row that arrests for a store robbery (CONTRACT D27: test content after boot).
    window.SR.def.action('testtransit.arrest', { building: 'testtransit', group: 'special', label: 'act.jail.day', p: 0, timeRule: 'free',
      effects: [['fn', 'crime.jail', 'store']] });
  });

  /** A new game in the city, arrested for a store robbery at a Heat. */
  async function arrest(heat, patch, opts) {
    await t.newGame(Object.assign({ seed: 7 }, opts || {}));
    await t.goto('city');
    await t.set(Object.assign({ clock: { min: 1440 }, stats: { heat: heat } }, patch || {}));
    await K.events(t);
    await t.act('testtransit.arrest', {});
    await t.step(1);
  }

  T.section('an arrest after a lost hold-up (W2-Food\'s store rows) queues the jail');
  {
    const hasStore = await ev(() => !!(window.SR.reg.action['store.rob'] && window.SR.reg.action['store.rob:resolve']));
    if (hasStore) {
      await t.newGame({ seed: 7 });
      await t.set({ clock: { min: 1200 }, items: { gun: 1, ammo: 12 }, stats: { heat: 0 } });
      await t.enter('store');
      const r = await t.act('store.rob', {});
      T.ok(r && r.ok && r.open, 'store.rob starts the hold-up', r && r.reason);
      const lost = await t.act('store.rob:resolve', { beats: [false, false], wins: 0, losses: 2 });
      await t.step(1);
      T.eq([lost.ok, !!lost.jailed, await t.scenes()], [true, true, ['jail']], 'two lost beats: jailed, and the jail scene takes over');
      const j = await jail();
      T.eq([j.reason, j.report, j.days], ['store', 'jail', 3 + Math.floor(30 / 25)], 'a store robbery: 3 + floor(Heat 30 / 25) days, the arrest night\'s report');
    } else {
      T.ok(true, 'W2-Food\'s store rows are not registered yet: the test row stands in');
    }
  }

  T.section('the Jail Day card: day, why, last night, four choices');
  {
    // Savings in the bank, so the arrest night earns interest (UI §5.12: "Interest +$42 · NLI ▲ 2 % · 1 message").
    await arrest(60, { money: { cash: 100, bank: 5000 } });
    const s = await t.state();
    T.eq([await t.scenes(), s.jail.daysLeft, s.jail.served, s.clock.day, s.clock.min], [['jail'], 4, 1, 2, 480],
      'Heat 60: 3 + 2 = 5 days; the arrest night ran (day 2, 08:00 in the cell)');
    T.eq(await K.text(t, 'jail-day'), 'Day 2 of 5', '"Day 2 of 5"');
    T.eq(await K.text(t, 'jail-reason'), 'Booked for 5 days: the Five-O hold-up.', 'why you are here');
    const sum = await K.text(t, 'jail-summary');
    T.ok(/^Last night: Interest \+\$\d+ · [A-Z]{3} [▲▼] \d+ % · \d+ messages?$/.test(sum), 'last night\'s one-line summary: interest, the mover, the messages', sum);
    const ds = (await K.events(t, ['day:started', 'night']));
    T.eq(ds.map((e) => e.n), ['night', 'day:started'], 'the arrest night is finished once: its events, then day:started');
    const rows = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id="jail-rows"] .arow:not([hidden])'), (r) => ({
      id: r.getAttribute('data-row'), chips: Array.prototype.map.call(r.querySelectorAll('.chip'), (c) => c.textContent.trim()) })));
    T.eq(rows, [{ id: 'jail.str', chips: ['+2 STR'] }, { id: 'jail.int', chips: ['+2 INT'] }, { id: 'jail.cha', chips: ['+2 CHA'] },
      { id: 'jail.hp', chips: ['+10 HP (full)'] }], 'Work out, Read, Make friends, Keep your head down, with their gains (bail hidden: `police` off)');
    const leave = await ev(() => { const b = document.querySelector('#ui [data-id="card-leave"]'); return { dis: b.getAttribute('aria-disabled'), label: b.textContent.trim() }; });
    T.eq(leave.dis, 'true', 'Walk out is refused while you serve');
    T.eq(await ev(() => !!document.querySelector('#ui [data-scene="report"]')), false, 'a jail night opens no full paper (UI §5.11)');
    await K.settle(t, 1300);
    await t.shot(path.join(K.SHOTS, 'jail-day-1280.png'));
    T.eq((await t.eval(A.audit, '#ui')).issues, [], 'the Jail Day card: names, roles and contrast (the a11y audit)');
    await t.press('back');
    await t.press('pocket');
    await t.step(1);
    T.eq(await t.scenes(), ['jail'], 'Esc and the Pocket do nothing in the cell');
    T.eq(await K.visible(t, 'hud-pocket'), false, 'and the HUD shows no Pocket button (the pause menu stays on its key)');
  }

  T.section('a Jail Day: the gain, the jail night, the next day');
  {
    const s0 = await t.state();
    await t.press('row1');
    await t.step(1);
    const s1 = await t.state();
    T.eq([s1.stats.str - s0.stats.str, s1.clock.day - s0.clock.day, s1.clock.min, s1.jail.daysLeft], [2, 1, 480, 3],
      'hotkey 1 (Work out): +2 STR, then the jail night (the next day, 08:00)');
    T.eq(await K.text(t, 'jail-day'), 'Day 3 of 5', 'the card moves on: "Day 3 of 5"');
    T.eq((await jail()).pose, 'lift', 'you work out in the cell');
    const ds = await K.events(t, ['day:started', 'night']);
    T.eq(ds.map((e) => e.n + (e.p && e.p.kind ? ':' + e.p.kind : '')), ['night:jail', 'day:started:jail'], 'the night\'s events, then day:started, once');
    await t.clickUI('row-jail.int');
    await t.step(1);
    const s2 = await t.state();
    T.eq([s2.stats.int - s1.stats.int, s2.jail.daysLeft], [2, 2], 'Read: +2 INT');
    await t.set({ stats: { hp: 5 } });
    await t.press('row4');
    await t.step(1);
    T.eq((await t.state()).stats.hp, 15, 'Keep your head down: +10 HP');
    const lastDay = await ev(() => { const b = document.querySelector('#ui [data-id="card-leave"]'); const d = document.getElementById(b.getAttribute('aria-describedby')); return d ? d.textContent.trim() : ''; });
    T.eq([await K.text(t, 'jail-day'), lastDay], ['Day 5 of 5', 'One more day to serve'], 'the last day: "One more day to serve" (never "1 days")');
    await t.press('row3');
    await t.step(1);
    const s3 = await t.state();
    T.eq([s3.jail, s3.stats.heat, s3.clock.min, (await jail()).mode], [null, 20, 480, 'released'], 'the last jail night releases you: Heat 20, 08:00');
    const released = await ev(() => window.SR.text('card.jail.released', { time: window.SR.text.time(480), heat: 20 }));
    T.eq(await K.text(t, 'jail-day'), released, 'the card says so ("Released at 08:00", Heat 20)');
    T.ok(/08:00/.test(released) && /20/.test(released), 'the released line carries the time and the Heat', released);
    T.eq(await ev(() => document.querySelector('#ui [data-id="card-leave"]').getAttribute('aria-disabled')), null, 'Walk out is on');
    T.eq((await K.events(t, ['release'])).length, 1, 'one `release` event');
    const outside = await ev(() => window.SR.world.spawnPoint('afterJail'));
    T.eq([Math.round(s3.player.x), Math.round(s3.player.y)], [Math.round(outside.x), Math.round(outside.y)],
      'released: the state already stands on the City Hall steps (a save before Walk out resumes there)');
    await K.settle(t, 1300);
    await t.shot(path.join(K.SHOTS, 'jail-released-1280.png'));
    await t.clickUI('card-leave');
    await t.step(1);
    const s4 = await t.state();
    const steps = await ev(() => window.SR.world.spawnPoint('afterJail'));
    T.eq([await t.scenes(), Math.round(s4.player.x), Math.round(s4.player.y), s4.clock.min], [['city'], Math.round(steps.x), Math.round(steps.y), 480],
      'Walk out: the city at 08:00 on the City Hall steps (afterJail)');
  }

  T.section('real keys: Esc is `back` and `pause`; digits choose; no stale tooltip on Walk out');
  {
    // A key press 300 ms apart (a stamp swallows presses for 250 ms after it is skipped).
    const key = async (code) => { await t.key(code); await t.step(2); await P.waitForTimeout(300); await t.step(1); };
    await arrest(0);
    await key('Escape');
    T.eq(await t.scenes(), ['jail', 'pause'], 'serving: Esc opens the pause menu (no way back from the cell)');
    await key('Escape');
    T.eq(await t.scenes(), ['jail'], 'Esc closes the pause menu, and its `pause` half does not open it again');
    const d0 = (await t.state()).clock.day;
    await key('Digit1');
    const s1 = await t.state();
    T.eq([s1.clock.day - d0, (await jail()).pose], [1, 'lift'], 'Digit1 works out (hotkey 1), the next day');
    // Hover the refused Walk out (its tooltip starts), then serve the last day: the button becomes
    // Walk out, and no tooltip of the refused button shows up on it. (The pointer first leaves: an
    // earlier click may have left it resting where the button is, and a hover in place fires nothing.)
    await P.mouse.move(10, 700);
    await P.locator('#ui [data-id="card-leave"]').first().hover();
    await P.waitForTimeout(100);
    await key('Digit2');
    await P.waitForTimeout(500);
    const tip = await ev(() => { const e = document.querySelector('[data-id="tooltip"].is-shown'); return e ? e.textContent : null; });
    T.eq([(await jail()).mode, tip], ['released', null], 'released: no stale tooltip of the refused Walk out');
    await P.mouse.move(10, 700);
    await key('Escape');
    T.eq(await t.scenes(), ['city'], 'released: Esc walks out (and does not also pause the city)');
  }

  T.section('a jail night\'s achievements are announced once (Report.achievements; P1 `achievements`)');
  {
    // Four days (Heat 25): the arrest night, then a plain jail night, then election night (campaign
    // day 7 → 8) with the election paper over the cell.
    await arrest(25, { clock: { day: 5, min: 1440 }, election: { status: 'campaign', campaignDay: 5, poll: 70, debateDone: true, path: 'mayor' } });
    await ev(() => {
      const SR = window.SR;
      window.__ach = { flag: SR.features.achievements, mod: SR.rules.achievements, got: [] };
      SR.features.achievements = true;
      SR.rules.achievements = { evaluate: (s, e) => (e && e.name === 'night' && e.payload.kind === 'jail' ? ['testJailNight'] : []) };
      window.__achOff = SR.events.on('achievement:unlocked', (p) => window.__ach.got.push(p.id));
    });
    const got = () => ev(() => window.__ach.got.slice());
    await t.press('row1');
    await t.step(1);
    T.eq([await got(), await t.scenes()], [['testJailNight'], ['jail']], 'a plain jail night: its achievement is announced (the cell finishes the night)');
    await t.press('row2');
    await t.step(1);
    await P.waitForTimeout(30);
    const paper = (await t.scenes()).indexOf('report') >= 0;
    for (let i = 0; i < 6 && (await t.scenes()).indexOf('report') >= 0; i++) { await t.press('confirm'); await t.step(1); await P.waitForTimeout(30); }
    const all = await got();
    await ev(() => {
      const SR = window.SR, a = window.__ach;
      SR.features.achievements = a.flag;
      SR.rules.achievements = a.mod;
      window.__achOff();
    });
    T.eq([paper, all, await t.scenes()], [true, ['testJailNight', 'testJailNight'], ['jail']],
      'election night: the paper over the cell, and the night\'s achievement once (not again by the paper)');
  }

  T.section('bail (P1 `police`) and a timed game that ends in jail');
  {
    await t.debug('feature', 'police', true);
    await arrest(0, { money: { cash: 5000, bank: 0 }, items: { phone: 0 } });
    const nophone = await ev(() => {
      const r = document.querySelector('#ui [data-row="jail.bail"]');
      const b = r && r.querySelector('button, [data-nav]');
      const d = b && document.getElementById(b.getAttribute('aria-describedby'));
      return { short: !!(r && r.querySelector('.chip--short')), why: d ? d.textContent.trim() : '' };
    });
    T.eq(nophone.short, false, 'no phone, money enough: the Bail price chip is not marked short (the reason is the phone)', nophone);
    T.ok(/phone/i.test(nophone.why), 'and the row says why', nophone.why);
    await arrest(0, { money: { cash: 5000, bank: 0 }, items: { phone: 1 } });
    const shown = await K.visible(t, 'row-jail.bail');
    T.ok(shown, 'the Bail row shows with its price');
    T.ok(/\$1,000/.test(await ev(() => document.querySelector('#ui [data-row="jail.bail"]').textContent)), 'two days left × $500 = $1,000', await ev(() => document.querySelector('#ui [data-row="jail.bail"]').textContent));
    await t.press('row5');
    await t.step(1);
    const s = await t.state();
    T.eq([s.jail, s.money.cash, (await jail()).mode], [null, 4000, 'released'], 'Bail: the lawyer takes $1,000 and you walk');
    T.ok(/lawyer/.test(await ev(() => document.querySelector('#ui [data-id="jail-done"]').textContent)), 'the bailed line');
    await t.debug('feature', 'police', false);
    await arrest(60, { clock: { day: 3, min: 1440 } }, { length: 4 });
    T.eq([(await t.state()).clock.day, await t.scenes()], [4, ['jail']], 'arrested on day 3 of 4: in the cell on day 4');
    await t.press('row2');
    await t.step(1);
    const o = await t.state();
    T.eq([o.over, o.result && o.result.reason, (await jail()).mode], [true, 'time', 'over'], 'the next jail night passes the last day: the game ends in jail');
    T.eq(await K.text(t, 'jail-day'), 'The story ends behind bars. The paper will cover it.', 'the card says so');
    T.ok(/Read the Final Edition/.test(await ev(() => document.querySelector('#ui [data-id="card-leave"]').textContent)), 'and leads to the Final Edition');
    await K.settle(t, 1300);
    await t.shot(path.join(K.SHOTS, 'jail-over-1280.png'));
    const hasResults = await ev(() => !!window.SR.reg.scene.results);
    await t.clickUI('card-leave');
    await t.step(1);
    T.eq((await t.scenes())[0], hasResults ? 'results' : 'title', 'the results (the title until W2-Front\'s results land)');
    // Arrested on the last day: the arrest night itself ends the game. The cell presents it (the
    // results listener stands aside for an arrest), straight to "Read the Final Edition".
    await arrest(0, { clock: { day: 4, min: 1440 } }, { length: 4 });
    await P.waitForTimeout(30);
    await t.step(1);
    const e = await t.state();
    T.eq([e.over, await t.scenes(), (await jail()).mode, /Read the Final Edition/.test(await K.text(t, 'card-leave'))], [true, ['jail'], 'over', true],
      'arrested on the last day: the arrest night ends the story in the cell');
  }

  T.section('a resumed cell shows only its own game\'s night; one day and an unknown reason read well');
  {
    await arrest(20);
    T.ok((await K.text(t, 'jail-summary')).length > 0, 'the arrest night\'s one-line summary');
    await t.newGame({ seed: 8 });
    await t.set({ jail: { daysLeft: 3, served: 1, reason: 'bank', bailBase: 500 } });
    await t.goto('jail', { resume: true });
    await t.step(1);
    T.eq([await t.scenes(), await K.visible(t, 'jail-summary'), await K.text(t, 'jail-reason'), await K.text(t, 'jail-day')],
      [['jail'], false, 'Booked for 4 days: the bank job.', 'Day 2 of 4'], 'another game\'s cell: no stale "Last night" line');
    await t.newGame({ seed: 8 });
    await t.set({ jail: { daysLeft: 1, served: 0, reason: 'hotwire', bailBase: 500 } });
    await t.goto('jail', { resume: true });
    await t.step(1);
    T.eq(await K.text(t, 'jail-reason'), 'Booked for 1 day: reasons the desk sergeant keeps to himself.', 'one day; a reason without its own line');
  }

  T.section('1920 × 1080: the Jail Day card');
  {
    await t.resize(1920, 1080);
    await arrest(20);
    await K.settle(t, 1300);
    await t.shot(path.join(K.SHOTS, 'jail-day-1920.png'));
    const r = await ev(() => document.querySelector('#ui [data-id="jail-card"]').getBoundingClientRect());
    T.ok(r.width > 650 && r.x > 1100, 'the card sits at the right, scaled with the stage', { w: r.width, x: r.x });
    await t.resize(1280, 720);
  }

  T.section('zero console errors');
  T.eq(t.errors(), [], 'no console errors or page errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
