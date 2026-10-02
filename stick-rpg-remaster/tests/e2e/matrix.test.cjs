// tests/e2e/matrix.test.cjs — owner: lead (the wave-2 exit gate, BUILD_PLAN §4.14 "Remastered
// Original": all three difficulties, all four lengths). The quick matrix: for each of the three
// difficulties (B-16) × the four lengths (GDD §5: Short 15, Medium 40, Long 100, Unlimited) a new
// game is made through the title's New Game and the wizard (fast mode skips the intro), starts in
// the apartment, steps out into the city, walks back in through the home door and sleeps: the
// morning paper, then day 2 at 08:00 in the city with the night's autosave (the ironman slot on
// Hardcore), HP and money sane, the game not over; then a timed game's last night (the day set
// through SR.debug) leads to the Final Edition and its rank, and Unlimited's pause menu Retires to
// it. Then
// Classic mode: the title's Classic link (after its confirm and a suspend save) opens the untouched
// recreation, ../stick-rpg/index.html, in the same tab; the browser's Back button returns, and
// Continue resumes the game. Zero console errors of our own (the recreation's are not counted).
//   node tests/e2e/matrix.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Exit');
const LENGTHS = [['short', 15], ['medium', 40], ['long', 100], ['unlimited', 0]];
const DIFFS = [['relaxed', 300], ['standard', 100], ['hardcore', 100]];   // B-16 starting cash

(async () => {
  const T = h.suite('e2e matrix (wave-2 exit: difficulties × lengths, Classic)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, a) => t.eval(fn, a);
  const info = (id) => ev((id) => { const d = window.SR.reg.scene[id]; return d && d.info ? JSON.parse(JSON.stringify(d.info())) : null; }, id);
  const visible = (id) => ev((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); return !!(el && el.getClientRects().length); }, id);
  const quiet = () => ev(() => { const U = window.SR.ui; if (U.stamp && U.stamp.clear) U.stamp.clear(); if (U.toast && U.toast.clear) U.toast.clear(); });
  const clearSaves = () => ev(() => { const S = window.SR.save; S.storage.keys('sr1.').forEach((k) => { if (k !== 'sr1.settings') S.storage.remove(k); }); });
  /** The title's front: the boot card ("Press any key"), the What's new card, then the menu. */
  const title = async () => {
    await ev(() => { window.SR.state = null; });
    await t.goto('title');
    await t.step(2);
    for (let i = 0; i < 3; i++) {
      if (await visible('title-gate')) { await t.clickUI('title-gate'); await t.step(2); continue; }
      if (await visible('title-news-ok')) { await t.clickUI('title-news-ok'); await t.step(2); continue; }
      break;
    }
  };

  try {
    T.section('a new game on every difficulty and length reaches the city and survives a sleep');
    const rows = [];
    for (const [lid, len] of LENGTHS) {
      for (const [d, cash] of DIFFS) {
        const tag = lid + ' / ' + d;
        const bad = [];
        await clearSaves();
        await title();
        await t.clickUI('title-new');
        await t.step(2);
        if ((await t.scenes()).slice(-1)[0] !== 'newgame') bad.push('New Game opened ' + (await t.scenes()).join(' > '));
        await t.clickUI('ng-length-' + lid);
        await t.clickUI('ng-diff-' + d);
        await t.clickUI('ng-next');
        await t.clickUI('ng-next');
        await page.locator('#ui [data-id="ng-name-input"]').fill('M' + lid.slice(0, 2) + d.slice(0, 2));
        await t.clickUI('ng-next');
        await t.step(3);
        let s = await t.state();
        const start = await ev(() => { const x = window.SR.scenes.top(); return x && x.params ? { id: x.params.id, mode: x.params.params && x.params.params.mode } : null; });
        if (!(s && s.mode.length === len && s.mode.difficulty === d && s.money.cash === cash && s.clock.day === 1 && s.clock.min === 480)) bad.push('the new game: ' + JSON.stringify(s && [s.mode, s.money.cash, s.clock]));
        if (!(start && start.id === 'home' && start.mode === 'live')) bad.push('not in the apartment: ' + JSON.stringify(start));
        // Out into the city: the nomination check of stepping in runs (and finds nothing).
        await quiet();
        await t.press('back');
        await t.step(3);
        if ((await t.scenes()).join() !== 'city') bad.push('Leave: ' + (await t.scenes()).join(' > '));
        await t.step(30);
        // In again through the home door, and Sleep.
        await t.enter('home');
        await t.step(2);
        await quiet();
        await t.clickUI('row-home.sleep');
        await t.step(2);
        const rep = await ev(() => { const x = window.SR.scenes.top(); return x && x.id === 'report' ? { kind: x.params.report.kind, day: x.params.report.day, final: !!(window.SR.state && window.SR.state.over) } : null; });
        if (!(rep && rep.kind === 'sleep' && rep.day === 2 && !rep.final)) bad.push('the night: ' + JSON.stringify(rep));
        for (let i = 0; i < 4 && (await t.scenes()).indexOf('report') >= 0; i++) { await quiet(); await t.press('confirm'); await t.step(3); }
        s = await t.state();
        if ((await t.scenes()).join() !== 'city') bad.push('after the paper: ' + (await t.scenes()).join(' > '));
        if (!(s.clock.day === 2 && s.clock.min === 480 && !s.over)) bad.push('the morning: ' + JSON.stringify([s.clock, s.over]));
        if (!(s.stats.hp > 0 && s.stats.hp <= s.stats.hpMax && s.money.cash >= 0)) bad.push('HP / money: ' + JSON.stringify([s.stats.hp, s.stats.hpMax, s.money.cash]));
        const saves = await ev(() => window.SR.save.list().map((e) => e.slot));
        const want = d === 'hardcore' ? 'ironman' : 'auto';
        if (saves.indexOf(want) < 0) bad.push('no ' + want + ' save after the night: ' + JSON.stringify(saves));
        if (d === 'hardcore') {
          const iron = await ev(() => { const x = window.SR.save.read('ironman'); return x ? x.clock.day : null; });
          if (iron !== 2) bad.push('the ironman slot holds day ' + iron + ', not day 2');
        }
        if (lid === 'unlimited') {
          await t.press('pause');
          await t.step(1);
          const pi = await info('pause');
          if (!(pi && pi.items.indexOf('retire') >= 0)) bad.push('Unlimited: no Retire in the pause menu ' + JSON.stringify(pi && pi.items));
          await t.press('back');
          await t.step(2);
        }
        // The end of the game: a timed game's last night (the day set through SR.debug) leads to the
        // Final Edition; Unlimited ends by Retire from the pause menu.
        if (len) {
          await t.set({ clock: { day: len } });
          await t.enter('home');
          await t.step(2);
          await quiet();
          await t.clickUI('row-home.sleep');
          await t.step(2);
          const btn = await ev(() => { const b = document.querySelector('#ui [data-id="report-continue"]'); return b ? b.textContent.trim() : null; });
          if (!/Final Edition/i.test(btn || '')) bad.push('the last night\'s paper button: ' + btn);
          for (let i = 0; i < 4 && (await t.scenes()).indexOf('report') >= 0; i++) { await quiet(); await t.press('confirm'); await t.step(3); }
        } else {
          await t.press('pause');
          await t.step(1);
          await t.clickUI('pause-retire');
          await t.step(1);
          await t.clickUI('pause-retire-yes');
          await t.step(3);
        }
        const end = await ev(() => {
          const SR = window.SR, st = document.querySelector('#ui [data-id="results-stamp"]'), ed = document.querySelector('#ui [data-id="results-edition"]'), r = SR.state && SR.state.result;
          return { scenes: SR.scenes.stack(), stamp: st ? st.textContent.trim() : null, rank: r ? SR.text(r.rankKey) : null, reason: r && r.reason, edition: ed ? ed.textContent.trim() : null };
        });
        const edition = len ? 'Final Edition · Day ' + len + ' of ' + len : 'Final Edition · Day 2';
        if (!(end.scenes.join() === 'results' && end.stamp && end.stamp === end.rank && end.reason === (len ? 'time' : 'retire') && end.edition === edition)) bad.push('the end: ' + JSON.stringify(end));
        rows.push(tag + (bad.length ? ': ' + bad.join('; ') : ''));
        T.eq(bad, [], tag + ': the wizard → the apartment → the city → Sleep → day 2' + (d === 'hardcore' ? ' (the ironman slot written)' : '') + ' → ' + (len ? 'the last night' : 'Retire') + ' → the results');
      }
    }
    await t.shot(path.join(SHOTS, 'matrix-last.png'));

    T.section('Classic mode opens the recreation; Back returns; Continue resumes');
    await clearSaves();
    await t.newGame({ name: 'Classicist', seed: 31 });
    await t.goto('city');
    await t.set({ clock: { min: 780 } });
    await t.goto('title');
    await t.step(2);
    if (await visible('title-gate')) { await t.clickUI('title-gate'); await t.step(2); }
    if (await visible('title-news-ok')) { await t.clickUI('title-news-ok'); await t.step(2); }
    await t.clickUI('title-classic');
    await t.step(1);
    T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'the Classic link asks first (a suspend save)');
    const errsBefore = t.errors().length;
    await Promise.all([page.waitForURL(/\/stick-rpg\/index\.html$/, { timeout: 10000 }), t.clickUI('classic-yes')]);
    await page.waitForLoadState('load');
    const classic = await page.evaluate(() => ({ title: document.title, canvas: !!document.getElementById('game'), suspend: !!localStorage.getItem('sr1.suspend') }));
    T.ok(/\/stick-rpg\/index\.html$/.test(page.url()) && /recreation/i.test(classic.title) && classic.canvas,
      'the recreation opens in the same tab: ' + page.url().replace(/^.*\/(stick-rpg\/index\.html)$/, '$1') + ' (' + classic.title + ')');
    T.ok(classic.suspend, 'after a suspend save of the running game');
    await t.shot(path.join(SHOTS, 'matrix-classic.png'));
    const classicErrors = t.errors().length - errsBefore;
    await page.goBack();
    await page.waitForFunction(() => window.SR && window.SR.booted === true, null, { timeout: 10000 });
    await page.evaluate(() => { const SR = window.SR; SR.loop.pause(); SR.quality.set('high'); SR.debug.fast(true); });
    T.ok(/stick-rpg-remaster\/index\.html/.test(page.url()), 'the browser\'s Back button returns to the remaster');
    if (await visible('title-gate')) { await t.clickUI('title-gate'); await t.step(1); }
    await t.clickUI('title-continue');
    await t.step(2);
    const resumed = await t.state();
    T.eq([await t.scenes(), resumed.player.name, resumed.clock.min], [['city'], 'Classicist', 780], 'Continue resumes the game');
    T.eq(await ev(() => window.SR.text.missing()), [], 'every text key shown resolves');
    const ours = t.errors().slice(0, errsBefore).concat(t.errors().slice(errsBefore + classicErrors));
    T.eq(ours, [], 'zero console errors of our own (the recreation logged ' + classicErrors + ' of its own)');
  } catch (e) {
    T.ok(false, 'threw: ' + (e && e.stack || e));
  } finally {
    await t.close();
  }
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
