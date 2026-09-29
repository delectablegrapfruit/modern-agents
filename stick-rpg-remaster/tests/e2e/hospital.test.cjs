// tests/e2e/hospital.test.cjs — owner: W2-Transit. HP 0 in the real game page (BUILD_PLAN §4.9
// acceptance; GDD §4.16, §6.6; UI §3, §5.12; BALANCE B-16, B-31):
//   - the player:down listener: Standard and Relaxed queue the hospital scene, Hardcore the death
//     scene; a fall at 5 HP inside a dialog waits for the dialog to close; with SR.debug.fast() the
//     hospital is skipped and the city comes back at the home door (the grey-box slice's path);
//   - the hospital: the FLATLINED stamp, "BZZT!", "...JUST KIDDING" (any press skips to the card),
//     the Stick General card (the bill per difficulty, what was paid, the part written off, HP 50 %,
//     "Discharged at 12:00"), the discharge, the Stick General edition of the report, then the city
//     at 12:00 outside the home door, day:started once;
//   - a timed game that ends in hospital, and FLATLINED on Hardcore (the greyed frame, the ink blot,
//     then the results), after an HP 0 and after a Hardcore loan default's morning report;
//   - zero console errors; screenshots in shots/W2-Transit/.
//   node tests/e2e/hospital.test.cjs
'use strict';
const path = require('path');
const K = require('./transit-kit.cjs');
const A = require('./a11y.test.cjs');

(async () => {
  const T = K.h.suite('e2e hospital (W2-Transit)');
  const t = await K.open();
  const P = t.page;
  const ev = (fn, arg) => P.evaluate(fn, arg);
  const hosp = () => K.info(t, 'hospital');

  /**
   * Presses confirm until the gag gives way to the card: the first press after the FLATLINED stamp
   * appeared skips the stamp and is consumed by it (UI §2.3), the next one skips the gag.
   */
  async function skipToCard() {
    for (let i = 0; i < 6; i++) {
      const h = await hosp();
      if (!h || h.phase === 'card') return h;
      await P.waitForTimeout(130);
      await t.step(20);
      await t.press('confirm');
      await t.step(1);
    }
    return hosp();
  }

  /** A new game in the city at 15:00 with HP 5 (and a patch), then a fall through world.fall. */
  async function fall(patch, opts) {
    await t.newGame(Object.assign({ seed: 7 }, opts || {}));
    await t.goto('city');
    await t.set(Object.assign({ clock: { min: 900 }, stats: { hp: 5 } }, patch || {}));
    await K.events(t);
    return t.act('world.fall', { x: 1, y: 2 });
  }

  T.section('fast mode (the slice): SR.debug.down → the city at the home door the next day');
  {
    await t.newGame({ seed: 7 });
    await t.goto('city');
    await t.set({ stats: { hp: 5 } });
    const d = await t.down('fall');
    T.eq([d.outcome, await t.scenes()], ['hospital', ['hospital']], 'player:down queues the hospital scene');
    await t.step(2);
    const s = await t.state();
    const door = await ev(() => window.SR.world.spawnPoint('afterHospital'));
    T.eq([await t.scenes(), s.clock.day, s.clock.min, Math.round(s.player.x), Math.round(s.player.y)],
      [['city'], 2, 720, Math.round(door.x), Math.round(door.y)], 'fast: skipped; the city at 12:00, outside the home door');
    T.eq((await K.events(t, ['day:started'])).length, 1, 'the hospital night is finished once (day:started)');
  }

  T.section('the gag, the Stick General card, the discharge, the report, the city (Standard)');
  {
    await t.fast(false);
    const r = await fall({ money: { cash: 300, bank: 1000 } });
    T.eq([r.down && r.down.outcome, r.down && r.down.bill, await t.scenes()], ['hospital', 130, ['hospital']],
      'a fall at 5 HP: HP 0, the bill max($50, 10 % of $1,300) = $130, the hospital scene');
    T.eq(await ev(() => window.SR.ui.stamp.current()), 'FLATLINED', 'the FLATLINED stamp');
    T.eq((await hosp()).phase, 'gag', 'the gag plays');
    T.eq(await K.visible(t, 'hud-pocket'), false, 'no Pocket button in the ward (a cab out would skip the Stick General edition)');
    await t.step(90);
    T.eq(await K.text(t, 'hospital-word'), 'BZZT!', '"BZZT!" at 1.4 s');
    await K.settle(t, 30);
    await t.shot(path.join(K.SHOTS, 'hospital-bzzt-1280.png'));
    await t.step(60);
    T.eq(await K.text(t, 'hospital-word'), '...JUST KIDDING', '"...JUST KIDDING" at 2.3 s');
    await t.step(60);
    const h1 = await hosp();
    T.eq([h1.phase, h1.card], ['card', true], 'then the Stick General card');
    const lines = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id="hospital-lines"] li'), (l) => l.textContent.trim()));
    T.eq(lines, ['Admitted after a fall off the edge of the city. The pilot says hello.', 'Bill: $130', 'Paid: $130', 'Patched up to 11/22 HP',
      'Discharged at 12:00, outside your front door.'], 'the card: why, the bill, what was paid, HP 50 %, the discharge');
    await K.settle(t, 1300);
    await t.shot(path.join(K.SHOTS, 'hospital-card-1280.png'));
    T.eq((await t.eval(A.audit, '#ui')).issues, [], 'the Stick General card: names, roles and contrast (the a11y audit)');
    await t.press('confirm');
    await t.step(1);
    const acts = (await K.events(t, ['action:done'])).map((e) => e.p.id);
    T.ok(acts.indexOf('hospital.discharge') >= 0, 'Discharge me runs hospital.discharge', acts);
    const top = await ev(() => { const x = window.SR.scenes.top(); return { id: x.id, kind: x.params && x.params.report && x.params.report.kind }; });
    T.eq(top, { id: 'report', kind: 'hospital' }, 'then the Stick General edition of the report');
    await K.settle(t);
    await t.shot(path.join(K.SHOTS, 'hospital-report-1280.png'));
    await t.press('confirm');
    await t.step(1);
    const s = await t.state();
    const door = await ev(() => window.SR.world.spawnPoint('afterHospital'));
    T.eq([await t.scenes(), s.clock.min, Math.round(s.player.x), Math.round(s.player.y)], [['city'], 720, Math.round(door.x), Math.round(door.y)],
      'its button: the city at 12:00, outside the home door');
    T.eq((await K.events(t, ['day:started'])).length, 1, 'day:started once for the hospital night');
  }

  T.section('any press skips the gag; the shortfall written off; Relaxed has no bill');
  {
    await fall({ money: { cash: 20, bank: 10 } });
    const h = await skipToCard();
    T.ok(h.phase === 'card' && h.t < 2, 'a press after 0.3 s skips to the card (once the stamp is skipped)', h);
    const lines = await ev(() => Array.prototype.map.call(document.querySelectorAll('#ui [data-id="hospital-lines"] li'), (l) => l.getAttribute('data-id')));
    T.eq(lines, ['hospital-cause', 'hospital-bill', 'hospital-paid', 'hospital-writtenOff', 'hospital-hp', 'hospital-discharge'], 'a written-off part is listed');
    T.eq([await K.text(t, 'hospital-bill'), await K.text(t, 'hospital-paid'), await K.text(t, 'hospital-writtenOff')],
      ['Bill: $50', 'Paid: $30', 'Written off: $20'], '$50 minimum: $30 paid, $20 written off');
    await fall({ money: { cash: 300, bank: 1000 } }, { difficulty: 'relaxed' });
    await skipToCard();
    T.eq([await K.text(t, 'hospital-free'), (await t.state()).money.cash], ['No charge today. Your insurance is suspiciously good.', 300], 'Relaxed: no bill');
  }

  T.section('a fall at 5 HP inside a dialog waits for the dialog to close');
  {
    await t.fast(true);
    await t.newGame({ seed: 7 });
    await t.goto('city');
    await t.set({ clock: { min: 900 }, stats: { hp: 5 } });
    await ev(() => { window.__dlg = window.SR.ui.dialog.open({ id: 'test-dialog', name: 'card.trip.title', text: 'card.trip.home', vars: { time: '15:00' },
      choices: [{ id: 'leave', label: 'card.trip.ok' }] }); });
    await t.step(1);
    T.eq(await t.scenes(), ['city', 'dialog'], 'a dialog is open over the city');
    const r = await t.act('world.fall', { x: 1, y: 2 });
    await t.step(3);
    T.eq([r.down && r.down.outcome, await t.scenes(), (await t.state()).clock.day], ['hospital', ['city', 'dialog'], 2],
      'HP 0: the hospital night has run, the dialog stays up');
    await t.press('back');
    await t.step(1);
    const after = await t.scenes();
    T.ok(after[0] === 'hospital' || after[0] === 'city', 'the dialog closed: the hospital flow runs (fast: to the city)', after);
    await t.step(2);
    T.eq(await t.scenes(), ['city'], 'and the city comes back at 12:00');
    // The presentation itself (fast off): the gag waits for the dialog, then plays from its start.
    await t.fast(false);
    await t.newGame({ seed: 7 });
    await t.goto('city');
    await t.set({ clock: { min: 900 }, stats: { hp: 5 } });
    await ev(() => { window.SR.ui.dialog.open({ id: 'test-dialog', name: 'card.trip.title', text: 'card.trip.home', vars: { time: '15:00' },
      choices: [{ id: 'leave', label: 'card.trip.ok' }] }); });
    await t.step(1);
    await t.act('world.fall', { x: 1, y: 2 });
    await t.step(30);
    T.eq([await t.scenes(), await hosp()], [['city', 'dialog'], null], 'fast off: no gag while the dialog is up');
    for (let i = 0; i < 4 && (await t.scenes()).indexOf('dialog') >= 0; i++) {
      await P.waitForTimeout(60);
      await t.press('back');
      await t.step(1);
    }
    const hz = await hosp();
    T.ok((await t.scenes())[0] === 'hospital' && hz && hz.phase === 'gag' && hz.t < 0.1 && !hz.discharged,
      'the dialog closed: the hospital scene, its gag from the start', { scenes: await t.scenes(), hz });
    T.eq(await ev(() => window.SR.ui.stamp.current()), 'FLATLINED', 'with the FLATLINED stamp');
    await t.fast(true);
  }

  T.section('a timed game can end in hospital');
  {
    await t.fast(false);
    const r = await fall({ clock: { day: 3, min: 900 }, money: { cash: 300, bank: 0 } }, { length: 3 });
    T.eq([r.down.outcome, (await t.state()).over], ['hospital', true], 'day 3 of 3: the hospital night ends the game');
    await skipToCard();
    await t.press('confirm');
    await t.step(1);
    T.eq((await ev(() => window.SR.scenes.top().id)), 'report', 'the Stick General edition first');
    await t.press('confirm');
    await t.step(1);
    const hasResults = await ev(() => !!window.SR.reg.scene.results);
    T.eq((await t.scenes())[0], hasResults ? 'results' : 'title', 'then the Final Edition (the title until W2-Front\'s results land)');
  }

  T.section('Hardcore: FLATLINED over the greyed frame, then the results');
  {
    await t.fast(false);
    const r = await fall({ money: { cash: 300, bank: 0 } }, { difficulty: 'hardcore' });
    T.eq([r.down.outcome, r.over && r.over.reason], ['death', 'death'], 'HP 0 on Hardcore: death');
    const st = await t.scenes();
    const hasResults = await ev(() => !!window.SR.reg.scene.results);
    await P.waitForTimeout(20);   // the results listener decides after the action's microtasks
    T.eq(await t.scenes(), ['death'], 'the death scene: the results wait for FLATLINED (W2-Front honours request 1)', st);
    if (st[0] === 'death') {
      T.eq(await ev(() => window.SR.ui.stamp.current()), 'FLATLINED', 'the FLATLINED stamp');
      T.ok((await K.info(t, 'death')).shot, 'over the last frame of the world');
      await t.step(170);
      await K.settle(t, 30);
      await t.shot(path.join(K.SHOTS, 'death-blot-1280.png'));
      await t.step(40);
      T.eq((await t.scenes())[0], hasResults ? 'results' : 'title', 'the results follow (the title until W2-Front\'s land)');
    }
    await t.newGame({ seed: 7, difficulty: 'hardcore' });
    await t.goto('city');
    await t.set({ stats: { hp: 5 } });
    await t.down('fall');
    for (let i = 0; i < 4 && (await t.scenes())[0] === 'death'; i++) {
      await P.waitForTimeout(130);
      await t.step(35);
      await t.press('confirm');
      await t.step(1);
    }
    const dz = await K.info(t, 'death');
    T.ok((await t.scenes())[0] === (hasResults ? 'results' : 'title') && !dz, 'a press after 0.5 s goes straight on (once the stamp is skipped)');
    await t.newGame({ seed: 7, difficulty: 'hardcore' });
    await t.goto('city');
    await ev(() => {
      const SR = window.SR;
      SR.state.over = true;
      SR.state.result = SR.rules.endgame.results(SR.state, 'death');
      SR.events.emit('day:started', { day: SR.state.clock.day, report: { kind: 'sleep', day: SR.state.clock.day, lines: [], events: [], dead: 'loan' } });
    });
    await t.step(1);
    T.eq((await t.scenes())[0], 'death', 'a Hardcore loan default: FLATLINED after the morning report');
    // In jail: a loan default on a jail night on Hardcore. The jail's day:started listener never takes
    // the screen back from FLATLINED, whichever listener hears the night first (shuffled boot order).
    await t.newGame({ seed: 7, difficulty: 'hardcore' });
    await t.goto('city');
    const cellEntered = await ev(() => {
      const SR = window.SR, cell = SR.scenes.get('jail'), enter = cell.enter;
      let n = 0;
      cell.enter = function () { n++; return enter.apply(this, arguments); };
      SR.state.jail = { daysLeft: 2, served: 1, reason: 'store', bailBase: 500 };
      SR.state.over = true;
      SR.state.result = SR.rules.endgame.results(SR.state, 'death');
      SR.scenes.go('death', { reason: 'death', dead: 'loan' }, { transition: false });
      SR.events.emit('day:started', { day: SR.state.clock.day, report: { kind: 'jail', day: SR.state.clock.day, lines: [], events: [], dead: 'loan' } });
      cell.enter = enter;
      return n;
    });
    await t.step(1);
    T.eq([await t.scenes(), cellEntered], [['death'], 0], 'a jail night that killed you: the cell never comes back over FLATLINED');
  }

  T.section('zero console errors');
  T.eq(t.errors(), [], 'no console errors or page errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
