// tests/e2e/uofs.test.cjs — owner: W2-Civic. The University of Stick through the real UI (BUILD_PLAN
// §4.7; GDD §4.5, §6.1; BALANCE B-03): the card (Dean Quill, the interior, the three P0 rows with
// their chips), Study / Business class / Gym run by hotkeys with B-03's gains, time and cash, the U
// of S karma (+1, at most +3 a day), R repeats a training row, "Too hurt" at HP ≤ 4 and the time
// wall as disabled rows with their reasons, and the P1 `degrees` rows: Kinesiology and Theatre, a
// seminar once you qualify, the transcript sub-screen and graduation from it (its "+1 Diploma"
// chip, the ceremony's confetti and the degree stinger). Screenshots in
// shots/W2-Civic/. Zero console errors.
//   node tests/e2e/uofs.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Civic');

(async () => {
  const T = h.suite('e2e uofs (W2-Civic)');
  const t = await h.open({ fast: true });
  const TT = await t.eval(() => window.SR.tuning.training);
  const rowIds = async () => (await t.ui()).rows.map((r) => r.id);
  const row = async (id) => (await t.ui()).rows.find((r) => r.id === 'row-' + id) || null;
  const refresh = () => t.eval(() => window.SR.ui.card.refresh());
  const cardText = () => t.eval(() => { const c = document.querySelector('#ui [data-id="card"]'); return c ? c.innerText : ''; });

  try {
    // ------------------------------------------------------------------------------------------
    T.section('the card: Dean Quill, the lecture hall, the P0 rows');
    await t.newGame({});
    await t.set({ clock: { min: 480 } });
    await t.enter('uofs');
    await t.step(2);
    T.eq(await t.scenes(), ['building'], 'the U of S opens its building card');
    T.eq(await rowIds(), ['row-uofs.study', 'row-uofs.classBiz', 'row-uofs.gym'], 'P0: Study, Business class, Gym (P1 rows hidden while `degrees` is off)');
    const info = await t.eval(() => window.SR.ui.building.info());
    T.ok(info && info.interior === true, 'the registered interior draws the hall (SR.art.interior("uofs"))', info);
    const text = await cardText();
    T.ok(/UNIVERSITY OF STICK/i.test(text), 'the card is titled University of Stick');
    T.ok(!/⟦/.test(text), 'no missing text key on the card', text);
    T.ok(await t.eval(() => !!document.querySelector('#ui [data-id="card-portrait"]')), 'Dean Quill\'s portrait heads the card');
    const study = await row('uofs.study');
    T.ok(/\+2 INT/.test(study.text) && /2h/.test(study.text), 'Study shows +2 INT and 2h: ' + study.text);
    const cls = await row('uofs.classBiz');
    T.ok(/\+4 INT/.test(cls.text) && /\$20/.test(cls.text), 'Business class shows +4 INT and $20: ' + cls.text);
    const gym = await row('uofs.gym');
    T.ok(/\+2 STR/.test(gym.text) && /-4 HP/.test(gym.text), 'Gym shows +2 STR and -4 HP: ' + gym.text);
    await t.shot(path.join(SHOTS, 'uofs-card.png'));

    // ------------------------------------------------------------------------------------------
    T.section('B-03 through the card: hotkeys, +1 karma a U of S activity, at most +3 a day');
    let s0 = await t.state();
    await t.press('row1');
    await t.step(2);
    let s1 = await t.state();
    T.eq([s1.stats.int - s0.stats.int, s1.clock.min - s0.clock.min, s1.stats.karma - s0.stats.karma, s1.money.cash - s0.money.cash], [TT.study.gain, TT.study.min, 1, 0],
      'key 1 (Study): +2 INT, 2 h, +1 karma, free');
    await t.press('row2');
    await t.step(2);
    let s2 = await t.state();
    T.eq([s2.stats.int - s1.stats.int, s2.clock.min - s1.clock.min, s2.money.cash - s1.money.cash, s2.stats.karma - s1.stats.karma], [TT.classBiz.gain, TT.classBiz.min, -TT.classBiz.cash, 1],
      'key 2 (Business class): +4 INT, 2 h, -$20, +1 karma');
    await t.press('row3');
    await t.step(2);
    let s3 = await t.state();
    T.eq([s3.stats.str - s2.stats.str, s3.stats.hp - s2.stats.hp, s3.stats.hpMax - s2.stats.hpMax, s3.stats.karma - s2.stats.karma], [TT.gym.gain, -TT.gym.hp, TT.gym.gain, 1],
      'key 3 (Gym): +2 STR, -4 HP, HP max +2, +1 karma');
    await t.press('row1');
    await t.step(2);
    await t.press('repeat');
    await t.step(2);
    const s4 = await t.state();
    T.eq([s4.stats.int - s3.stats.int, s4.clock.min - s3.clock.min], [2 * TT.study.gain, 2 * TT.study.min], 'Study again, then R repeats it (a repeatable training row)');
    T.eq(s4.stats.karma - s0.stats.karma, TT.uofsKarma.dailyMax, 'five U of S activities in a day: +3 karma (the daily cap)');
    await t.shot(path.join(SHOTS, 'uofs-after-training.png'));

    // ------------------------------------------------------------------------------------------
    T.section('"Too hurt" at HP ≤ 4, the time wall');
    await t.set({ stats: { hp: 4 }, clock: { min: 600 } });
    await refresh();
    const hurt = await row('uofs.gym');
    T.ok(hurt && !hurt.enabled && /Too hurt/.test(hurt.text), 'at HP 4 the gym row is disabled: "Too hurt"', hurt);
    // The shot shows that state (the HUD rewritten from the set state first).
    await t.eval(() => { const H = window.SR.ui.hud; if (H && H.invalidate) { H.invalidate(); H.flush(); } });
    await t.shot(path.join(SHOTS, 'uofs-too-hurt.png'));
    const hp0 = await t.get('stats.hp');
    await t.press('row3');
    await t.step(2);
    T.eq(await t.get('stats.hp'), hp0, 'pressing it changes nothing');
    await t.set({ stats: { hp: 5 } });
    await refresh();
    T.ok((await row('uofs.gym')).enabled, 'at HP 5 it is enabled again');
    await t.set({ clock: { min: 1350 } });
    await refresh();
    const late = await row('uofs.study');
    T.ok(late && !late.enabled && /Ends after midnight/.test(late.text), 'at 22:30 a 2 h class ends after midnight', late);
    await t.set({ clock: { min: 1320 } });
    await refresh();
    T.ok((await row('uofs.study')).enabled, 'at 22:00 it fits');

    // ------------------------------------------------------------------------------------------
    T.section('P1 `degrees`: the other classes, a seminar, the transcript and graduation');
    await t.debug('feature', 'degrees', true);
    await t.set({ stats: { hp: 22, hpMax: 22, str: 7, int: 150, cha: 7 }, money: { cash: 1000 }, clock: { min: 480 }, edu: { classes: { biz: 10, kin: 0, thr: 0 } } });
    await refresh();
    const ids = await rowIds();
    T.ok(['row-uofs.classKin', 'row-uofs.classThr', 'row-uofs.seminarBiz', 'row-uofs.transcript'].every((x) => ids.indexOf(x) >= 0),
      'with `degrees` on: Kinesiology, Theatre, the Business seminar (INT 150 and 10 classes) and the transcript', ids);
    T.ok(ids.indexOf('row-uofs.seminarKin') < 0 && ids.indexOf('row-uofs.graduateBiz') < 0, 'no Kinesiology seminar (STR 7) and no graduation (10 classes)');
    const sem = await row('uofs.seminarBiz');
    T.ok(/\+10 INT/.test(sem.text) && /\$150/.test(sem.text) && /3h/.test(sem.text), 'the seminar row: +10 INT, $150, 3h: ' + sem.text);
    await t.shot(path.join(SHOTS, 'uofs-degrees-card.png'));
    await t.set({ edu: { classes: { biz: TT.degree.classes } } });
    await refresh();
    T.ok((await rowIds()).indexOf('row-uofs.graduateBiz') >= 0, '20 Business classes: "Graduate in Business" appears on the card');
    const tr = await row('uofs.transcript');
    await t.press('row' + tr.text.trim().charAt(0));
    await t.step(2);
    T.eq(await t.eval(() => window.SR.ui.card.screens()), ['uofs.transcript'], 'the transcript row opens uofs.transcript');
    const sheet = await t.eval(() => document.querySelector('#ui [data-subscreen="uofs.transcript"]').innerText);
    T.ok(/Business/.test(sheet) && /Kinesiology/.test(sheet) && /Theatre/.test(sheet), 'three tracks', sheet);
    T.ok(/Ready to graduate/.test(sheet) && /Seminars open/.test(sheet), 'Business: ready to graduate, seminars open', sheet);
    T.ok(!/⟦/.test(sheet), 'no missing text key');
    const prog = await t.eval(() => { const p = document.querySelector('#ui [data-id="transcript-biz-classes"]'); return p ? [p.getAttribute('aria-valuenow'), p.getAttribute('aria-valuemax')] : null; });
    T.eq(prog, [String(TT.degree.classes), String(TT.degree.classes)], 'the Business progress bar is full (20 / 20)');
    const gradRow = await t.eval(() => { const b = document.querySelector('#ui [data-id="row-transcript-graduate-biz"]'); return b ? b.innerText.replace(/\s+/g, ' ') : ''; });
    T.ok(/\+25 INT/.test(gradRow) && /\+1 Diploma\b/.test(gradRow) && !/diplomas/.test(gradRow), 'the Graduate row: +25 INT and "+1 Diploma" (the item, not the state list): ' + gradRow);
    await t.shot(path.join(SHOTS, 'uofs-transcript.png'));
    const int0 = await t.get('stats.int');
    await t.eval(() => {
      const fx = window.SR.render.fx, orig = fx.confetti;
      window.__confetti = 0;
      fx.confetti = function () { window.__confetti++; return orig.apply(this, arguments); };
      // The degree stinger is W2-Music's: until it lands, a stand-in registration lets the call show
      // (the spy records it and plays nothing).
      const A = window.SR.audio, songs = window.SR.reg.song;
      window.__stingers = [];
      window.__stingerOrig = A.stinger;
      A.stinger = function (id) { window.__stingers.push(id); };
      window.__fakeDegree = !songs['stingers.degree'];
      if (window.__fakeDegree) songs['stingers.degree'] = { standIn: true };
    });
    await t.fast(false);   // the ceremony's confetti is skipped in fast mode, like the report's
    await t.clickUI('row-transcript-graduate-biz');
    await t.fast(true);
    await t.eval(() => window.SR.ui.stamp.clear());   // the degree stamp played at full length meanwhile
    await t.step(3);
    const g = await t.state();
    T.ok(g.edu.degrees.biz === true && g.stats.int === int0 + TT.degree.bonusStat, 'Graduate: the degree and +25 INT once', { deg: g.edu.degrees, int: g.stats.int });
    T.eq(await t.eval(() => window.__confetti), 1, 'the ceremony throws confetti (GDD §4.5: confetti, a stamp)');
    T.eq(await t.eval(() => {
      const A = window.SR.audio, got = window.__stingers.slice();
      A.stinger = window.__stingerOrig;
      if (window.__fakeDegree) delete window.SR.reg.song['stingers.degree'];
      return got.filter((id) => id === 'degree');
    }), ['degree'], 'and plays the degree stinger (ART_AUDIO §13.4: the organ chord)');
    const after = await t.eval(() => document.querySelector('#ui [data-subscreen="uofs.transcript"]').innerText);
    T.ok(/Degree earned/.test(after), 'the transcript now reads "Degree earned"', after);
    await t.step(60);
    await t.shot(path.join(SHOTS, 'uofs-graduated.png'));
    await t.press('back');
    await t.step(2);
    await t.debug('feature', 'degrees', false);
    await refresh();
    T.eq(await rowIds(), ['row-uofs.study', 'row-uofs.classBiz', 'row-uofs.gym'], 'flag off again: only the P0 rows');

    // ------------------------------------------------------------------------------------------
    T.section('greetings');
    await t.set({ clock: { min: 1380 }, stats: { karma: 0, int: 20, hp: 22 }, edu: { degrees: { biz: false } } });
    await t.press('back');
    await t.step(2);
    await t.enter('uofs');
    await t.step(2);
    const greet = await t.eval(() => { const b = document.querySelector('#ui [data-id="card-greeting"]'); return b ? b.innerText : ''; });
    const lateLines = await t.eval(() => window.SR.reg.text['greet.uofs.late']);
    T.ok(lateLines.some((l) => greet.indexOf(l.slice(0, 20)) >= 0), 'at 23:00 Dean Quill greets the late student');
    T.eq(t.errors(), [], 'zero console errors');
  } catch (e) {
    T.ok(false, 'threw: ' + (e && e.stack || e));
  } finally {
    await t.close();
  }
  T.done();
})();
