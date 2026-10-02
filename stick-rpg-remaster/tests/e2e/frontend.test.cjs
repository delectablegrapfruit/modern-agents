// tests/e2e/frontend.test.cjs — owner: W2-Front. The front end (BUILD_PLAN §4.11; UI.md §5.1-§5.4,
// §5.10, §5.18): boot → the "Press any key or click" card → the title menu (the save card, the What's
// new card once, the Old School badge), the new-game wizard (every length and difficulty, the orig
// roll, Fair start, the steppers, the name, PAPERGOD = B-02), the intro (captions, hold-to-skip) into
// the apartment, the pause menu (Hardcore, Unlimited, over a minigame; Suspend & quit → Continue;
// Quit; Retire → the results), Classic mode (a suspend save, ../stick-rpg/index.html in the same tab,
// Back returns and Continue resumes), the profile with no game running, the credits, the Hall of Fame
// (P1 flag), each overlay registered in its own file, the a11y audit of every screen, the pad's A
// (interact + confirm) and touch taps that already acted (the boot card, the intro's hold) never
// pressing the next screen, Hardcore's Quit keeping the last change, Retire over the cell, Continue
// with an unreadable save, every screen at 150 % text (UI §8) and on a 667 × 375 phone (UI §2.2),
// zero console errors. Screenshots: shots/W2-Front/.
//   node tests/e2e/frontend.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');
const A = require('./a11y.test.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-Front');

(async () => {
  const T = h.suite('e2e frontend (W2-Front)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => t.eval(fn, arg);
  const info = (id) => ev((id) => { const d = window.SR.reg.scene[id]; return d && d.info ? JSON.parse(JSON.stringify(d.info())) : null; }, id);
  const shot = (name) => t.shot(path.join(SHOTS, name + '.png'));
  const audit = async (label, sel) => {
    const a = await ev(A.audit, sel);
    T.eq(a.issues, [], label + ': names, roles and contrast (' + a.controls + ' controls, ' + a.checked + ' texts)');
  };
  const visible = (id) => ev((id) => { const el = document.querySelector('#ui [data-id="' + id + '"]'); return !!(el && el.getClientRects().length); }, id);
  const clearSaves = () => ev(() => { const S = window.SR.save; S.storage.keys('sr1.').forEach((k) => { if (k !== 'sr1.settings') S.storage.remove(k); }); });
  /**
   * UI §8 ("tested with no clipping at 150 %"; the touch-compact layout of UI §2.2): every control of
   * a screen, and the named texts, can be scrolled into view, then lie inside the window and on top
   * (not under a footer, not spilled out of their panel). @returns {Promise<string[]>} the problems
   */
  const reach = (tt, scope, extra) => tt.eval(([scope, extra]) => {
    const root = document.querySelector(scope);
    if (!root) return ['no ' + scope];
    const els = Array.from(root.querySelectorAll('[data-nav]')).concat(extra.map((id) => root.querySelector('[data-id="' + id + '"]') || id));
    const bad = [];
    els.forEach((el) => {
      if (typeof el === 'string') { bad.push(el + ': missing'); return; }
      if (!el.getClientRects().length || el.closest('.vh')) return;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const name = el.getAttribute('data-id') || el.textContent.trim().slice(0, 24);
      // Only a box the player can scroll may have moved: one with overflow hidden (or #ui itself, or
      // the page) scrolls for a script, never for a wheel, a finger or a scrollbar.
      let stuck = null;
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (!a.scrollTop && !a.scrollLeft) continue;
        const cs = getComputedStyle(a);
        if ((a.scrollTop && !/auto|scroll/.test(cs.overflowY)) || (a.scrollLeft && !/auto|scroll/.test(cs.overflowX))) {
          stuck = stuck || (a.getAttribute('data-id') || a.id || a.className || a.tagName) + ' (overflow ' + cs.overflowY + ')';
          a.scrollTop = 0; a.scrollLeft = 0;
        }
      }
      if (window.scrollX || window.scrollY) { stuck = stuck || 'the page'; window.scrollTo(0, 0); }
      if (stuck) { bad.push(name + ': only a script can scroll it into view (' + stuck + ')'); return; }
      const r = el.getBoundingClientRect();
      if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) { bad.push(name + ': outside the window'); return; }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
      if (!hit || !(hit === el || el.contains(hit))) bad.push(name + ': covered by ' + (hit ? hit.getAttribute('data-id') || hit.className || hit.tagName : 'nothing'));
    });
    return bad;
  }, [scope, extra || []]);

  // ------------------------------------------------------------------------------------------------
  T.section('boot → the "Press any key or click" card → the title');
  T.eq(await t.scenes(), ['title'], 'the boot scene hands over to the title at once');
  T.eq((await info('boot')).profile, true, 'the boot loaded the profile');
  let ti = await info('title');
  T.eq(ti.gate, true, 'the title opens with the boot card');
  T.ok(/PAPER SKY/.test(await t.uiText()) && /Press any key or click/.test(await t.uiText()), 'the card: the title, the fan note and "Press any key or click"');
  T.ok(/Not affiliated with or endorsed by/.test(await t.uiText()), 'the fan note (UI §5.1)');
  await audit('the boot card', '#ui [data-scene="title"]');
  const tw = await A.tabWalk(t);
  T.eq(tw.issues, [], 'Tab walks the boot card and does not dismiss it');
  T.eq((await info('title')).gate, true, 'Tab leaves the card up (focus keys pass)');
  await ev(() => { navigator.getGamepads = () => [{ id: 'test pad', index: 0, connected: true, mapping: 'standard', buttons: [], axes: [0, 0, 0, 0], timestamp: 1 }]; });
  await t.step(40);
  T.ok(/Press A to start\. Sound begins after one click or key press\./.test(await t.uiText()), 'with a gamepad the card reads "Press A to start. Sound begins after one click or key press." (UI §5.2)');
  await ev(() => { delete navigator.getGamepads; });
  await t.step(40);
  await shot('boot-card');
  await ev(() => { window.SR.scenes.push('settings', {}, { transition: false }); });
  await t.step(1);
  await t.key('KeyZ');
  T.eq([(await info('title')).gate, await t.scenes()], [true, ['title', 'settings']], 'a key meant for a scene above the title leaves the card up (the card takes keys only on top)');
  await ev(() => { window.SR.scenes.pop(); });
  await t.step(1);
  await t.key('KeyZ');
  await t.step(2);
  ti = await info('title');
  T.eq(ti.gate, false, 'any key folds the card away');
  T.ok(ti.items.indexOf('title-new') >= 0 && ti.items.indexOf('title-classic') >= 0 && ti.items.indexOf('title-achievements') >= 0, 'the menu: New Game, Load, Classic, Achievements, Settings, Credits', ti.items);
  T.eq(ti.items.indexOf('title-hof'), -1, 'Hall of Fame waits for its P1 flag (achievements)');
  T.eq(await t.scenes(), ['title'], 'the key press did not also activate a menu item');
  T.ok(await ev(() => document.activeElement && document.activeElement.getAttribute('data-id') === 'title-new'), 'the first item has focus');
  await t.goto('title');
  T.eq((await info('title')).gate, false, 'a later visit to the title has no boot card');
  await ev(() => { window.SR.scenes.go('title', { gate: true }, { transition: false }); });
  await t.press('confirm');
  T.eq([(await info('title')).gate, await t.scenes()], [false, ['title']], 'a pad button (an injected press) also folds the card, without choosing an item');
  // A real pad's A is `interact` and `confirm` in one press (CONTRACT §12.1): the card must not fold on
  // the first and let the second press the menu item that just took focus (CONTRACT §15.5).
  await ev(() => {
    const idle = () => ({ pressed: false, value: 0 });
    window.__pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, idle), axes: [0, 0, 0, 0], timestamp: 1 };
    navigator.getGamepads = () => [window.__pad];
  });
  const padA = async () => {
    await ev(() => { window.__pad.buttons[0] = { pressed: true, value: 1 }; window.__pad.timestamp++; });
    await t.step(2);
    await ev(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; window.__pad.timestamp++; });
    await t.step(2);
  };
  await ev(() => { window.SR.scenes.go('title', { gate: true }, { transition: false }); });
  await t.step(1);
  await padA();
  T.eq([(await info('title')).gate, await t.scenes()], [false, ['title']], 'the pad\'s A (interact + confirm) folds the card and opens nothing');
  await ev(() => { delete navigator.getGamepads; });
  await ev(() => { window.SR.scenes.go('title', { gate: true }, { transition: false }); });
  await t.clickUI('title-gate');
  T.eq((await info('title')).gate, false, 'so does a click');

  // ------------------------------------------------------------------------------------------------
  T.section('the title: menu, the What\'s new card, the save card, the backdrop');
  await clearSaves();
  await t.goto('title');
  T.ok(await visible('title-news'), 'the "What\'s new in the remaster" card shows (once)');
  T.ok(!(await visible('title-save')) && (await info('title')).items.indexOf('title-continue') < 0, 'no save: no save card and no Continue');
  await t.clickUI('title-news-ok');
  T.ok(!(await visible('title-news')), 'Got it dismisses it');
  await t.goto('title');
  T.ok(!(await visible('title-news')), 'and it stays dismissed (profile.hintsSeen.whatsNew)');
  await audit('the title', '#ui [data-scene="title"]');
  const walk = await A.tabWalk(t);
  T.eq(walk.issues, [], 'Tab walks the menu in order, in scope, ringed and named (' + walk.n + ' controls)');
  await t.fast(false);
  const d0 = (await info('title')).drift;
  await t.step(120);
  const d1 = (await info('title')).drift;
  await t.fast(true);
  T.ok(d0.x !== d1.x || d0.y !== d1.y, 'the backdrop drifts over the city (UI §5.2)', [d0, d1]);
  const view = await ev(() => ({ min: window.SR.render.view.min, zoom: window.SR.render.view.zoom }));
  T.eq(view.min, 1140, 'the live city at 19:00 behind the menu');
  await shot('title');
  await ev(() => window.SR.ui.focus.focus(document.querySelector('#ui [data-id="title-new"]')));
  await t.press('down');
  T.ok(await ev(() => document.activeElement.getAttribute('data-id') === 'title-load'), 'arrows move through the menu');
  await t.press('confirm');
  await t.step(2);
  T.eq(await t.scenes(), ['title', 'saveload'], 'Enter opens Load (the saveload overlay in load mode)');
  T.eq((await info('saveload')).mode, 'load', 'in load mode');
  await t.press('back');
  await t.step(1);
  T.eq(await t.scenes(), ['title'], 'Esc closes it');

  // ------------------------------------------------------------------------------------------------
  T.section('the new-game wizard: the roll, Fair start, the steppers, the name');
  await t.goto('newgame', { seed: 777 });
  let ng = await info('newgame');
  T.eq([ng.step, ng.length, ng.difficulty], [1, 40, 'standard'], 'step 1: Medium and Standard by default');
  const B02 = await ev(() => window.SR.tuning.start);
  const inRange = (s) => ['str', 'int', 'cha'].every((k) => s[k] >= B02.statRoll[0] && s[k] <= B02.statRoll[1]);
  T.ok(inRange(ng.base) && ng.pool >= B02.extraRoll[0] && ng.pool <= B02.extraRoll[1], 'the orig roll: rand(1..10) each, rand(3..9) extra (B-02)', [ng.base, ng.pool]);
  const again = await t.eval(() => { const W = window.SR.ui.newgame.create({ seed: 777 }); return [W.base, W.pool]; });
  T.eq([ng.base, ng.pool], again, 'the same seed rolls the same dice');
  await audit('wizard step 1', '#ui [data-scene="newgame"]');
  await shot('newgame-1');
  await t.clickUI('ng-next');
  await t.step(60);
  T.eq((await info('newgame')).step, 2, 'Next: step 2');
  const rolls = [];
  for (let i = 0; i < 30; i++) { await t.clickUI('ng-roll'); ng = await info('newgame'); rolls.push(ng); }
  T.ok(rolls.every((r) => inRange(r.base) && r.pool >= 3 && r.pool <= 9) && new Set(rolls.map((r) => JSON.stringify(r.base))).size > 5, 'Roll again (unlimited, orig): 30 rolls in range and varied');
  await t.clickUI('ng-fair');
  ng = await info('newgame');
  T.eq([ng.stats, ng.pool, ng.fair], [{ str: 7, int: 7, cha: 7 }, 6, true], 'Fair start: 7 / 7 / 7 + 6');
  for (let i = 0; i < 6; i++) await t.clickUI('ng-int-plus');
  await t.clickUI('ng-int-plus');
  ng = await info('newgame');
  T.eq([ng.stats.int, ng.pool], [13, 0], '+ INT spends the pool, and stops when it is empty');
  for (let i = 0; i < 3; i++) await t.clickUI('ng-str-minus');
  ng = await info('newgame');
  T.eq([ng.stats.str, ng.pool], [4, 3], '− STR moves points back to the pool (orig: down to 0)');
  T.ok(/HP 19/.test(await t.uiText()), 'the HP readout follows STR (= STR + 15)');
  T.ok(/NLI hires janitors from INT 20\./.test(await t.uiText()), 'INT 13: "NLI hires janitors from INT 20" (B-05)');
  for (let i = 0; i < 3; i++) await t.clickUI('ng-int-plus');
  for (let i = 0; i < 4; i++) { await t.clickUI('ng-cha-minus'); await t.clickUI('ng-int-plus'); }
  T.ok(/NLI would hire you as a janitor today/.test(await t.uiText()), 'INT 20: NLI would hire you today', (await info('newgame')).stats);
  await audit('wizard step 2', '#ui [data-scene="newgame"]');
  await shot('newgame-2');
  await t.clickUI('ng-next');
  await t.step(2);
  T.ok(await ev(() => document.activeElement && document.activeElement.getAttribute('data-id') === 'ng-name-input'), 'step 3 puts you in the name field');
  await t.clickUI('ng-next');
  T.eq(await t.scenes(), ['newgame'], 'Begin refuses without a name');
  T.ok(/Every stick needs a name/.test(await t.uiText()), 'and says why');
  await page.locator('#ui [data-id="ng-name-input"]').fill('papergod');
  await t.step(2);
  T.ok(await visible('ng-wink'), 'naming yourself PAPERGOD shows a wink (and no warning)');
  await audit('wizard step 3', '#ui [data-scene="newgame"]');
  await shot('newgame-3');
  await page.keyboard.press('Enter');
  await t.step(3);
  const cheat = await t.state();
  T.eq([cheat.stats.str, cheat.stats.int, cheat.stats.cha, cheat.money.cash, cheat.player.name, cheat.mode.cheat],
    [555, 555, 555, 10000, 'Totally Legit', true], 'PAPERGOD applies B-02: 555 in every stat, $10,000, "Totally Legit", achievements off');
  T.ok((await t.scenes())[0] === 'building', 'Enter in the name field begins; the intro (skipped in fast mode) leads into the apartment', await t.scenes());
  const top = await ev(() => { const x = window.SR.scenes.top(); return { id: x.params.id, params: x.params.params }; });
  T.eq([top.id, top.params.mode, top.params.homeId], ['home', 'live', 'apt'], 'the game starts inside the apartment (Live mode; B-02 startPlace)');

  // ------------------------------------------------------------------------------------------------
  T.section('a new game with each length and difficulty (UI §5.3; B-16)');
  const lengths = [['short', 15], ['medium', 40], ['long', 100], ['unlimited', 0]];
  const diffs = ['relaxed', 'standard', 'hardcore'];
  for (const [lid, len] of lengths) {
    for (const d of diffs) {
      await clearSaves();
      await t.goto('newgame', { seed: 100 + len });
      await t.clickUI('ng-length-' + lid);
      await t.clickUI('ng-diff-' + d);
      await t.clickUI('ng-next');
      await t.clickUI('ng-next');
      await page.locator('#ui [data-id="ng-name-input"]').fill('Len' + len);
      await t.clickUI('ng-next');
      await t.step(3);
      const s = await t.state();
      const cash = B02.cash[d];
      const ok = s && s.mode.length === len && s.mode.difficulty === d && s.money.cash === cash && s.player.name === 'Len' + len && (await t.scenes())[0] === 'building';
      const iron = await ev(() => window.SR.save.list().some((e) => e.slot === 'ironman'));
      T.ok(ok && iron === (d === 'hardcore'), lid + ' / ' + d + ': length ' + len + ', start cash $' + cash + (d === 'hardcore' ? ', the ironman slot written' : ''), s && [s.mode, s.money.cash]);
    }
  }
  await clearSaves();
  await t.newGame({ difficulty: 'hardcore', name: 'Iron' });
  await ev(() => window.SR.save.write('ironman'));
  await t.goto('newgame', { seed: 5 });
  await t.clickUI('ng-diff-hardcore'); await t.clickUI('ng-next'); await t.clickUI('ng-next');
  await page.locator('#ui [data-id="ng-name-input"]').fill('Second');
  await t.clickUI('ng-next');
  await t.step(1);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'a new Hardcore game over a Hardcore run in progress asks first');
  await t.press('back');
  await t.step(1);
  T.eq(await t.scenes(), ['newgame'], 'and Cancel keeps the wizard (the run in progress stays)');

  // ------------------------------------------------------------------------------------------------
  T.section('the accessory carousel: P1, behind its own flag `accessories` (UI §5.3; CONTRACT D68)');
  await clearSaves();
  await t.debug('feature', 'wardrobe', true);
  await t.goto('newgame', { seed: 6 });
  await t.clickUI('ng-next'); await t.clickUI('ng-next');
  T.ok(!(await visible('ng-acc-next')), '`wardrobe` (P2: accessories after creation) alone shows no carousel');
  await t.debug('feature', 'wardrobe', false);
  await t.debug('feature', 'accessories', true);
  await t.goto('newgame', { seed: 6 });
  await t.clickUI('ng-next'); await t.clickUI('ng-next');
  T.ok(await visible('ng-acc-next'), 'with `accessories` on, step 3 shows the carousel');
  await t.clickUI('ng-acc-next');
  await page.locator('#ui [data-id="ng-name-input"]').fill('Capper');
  await t.clickUI('ng-next');
  await t.step(3);
  T.eq((await t.state()).player.look, { acc: 'cap' }, 'the chosen accessory goes to player.look.acc');
  await t.debug('feature', 'accessories', false);

  // ------------------------------------------------------------------------------------------------
  T.section('the intro: captions, hold-to-skip, the apartment');
  await t.fast(false);
  await clearSaves();
  await t.goto('newgame', { seed: 9 });
  await t.clickUI('ng-next'); await t.clickUI('ng-next');
  await page.locator('#ui [data-id="ng-name-input"]').fill('Doodler');
  await t.clickUI('ng-next');
  await t.step(1);
  T.eq(await t.scenes(), ['intro'], 'Begin plays the intro');
  await t.step(30);
  let ii = await info('intro');
  T.eq(ii.beat, 'desk', 'beat 1: the desk at night');
  T.ok(/doodle a little city/.test(await t.uiText()), 'with its caption');
  await shot('intro-1-desk');
  // A release counts whatever the modifiers, and a window that loses focus holds nothing: neither may
  // leave a key "held" that skips the intro by itself.
  await page.keyboard.down('KeyA'); await t.step(2);
  await page.keyboard.down('Control'); await page.keyboard.up('KeyA'); await page.keyboard.up('Control');
  await t.step(50);
  T.eq([await t.scenes(), ((await info('intro')) || {}).hold], [['intro'], 0], 'a key let go while Ctrl is down is no longer held (no skip)');
  await page.keyboard.down('KeyB'); await t.step(2);
  await ev(() => window.dispatchEvent(new Event('blur')));
  await t.step(50);
  T.eq([await t.scenes(), ((await info('intro')) || {}).hold], [['intro'], 0], 'nor a key that was down when the window lost focus');
  await page.keyboard.up('KeyB');
  const lampAt = await ev(() => {
    // The dozing lamp's bulb (beat 2) at two moments: it flickers, but not with { steady } (Flash reduction).
    const px = (tt, o) => { const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const g = c.getContext('2d'); window.SR.art.intro.draw(g, tt, o); return Array.from(g.getImageData(930, 324, 1, 1).data).join(','); };
    return { flickers: px(6, {}) !== px(6.13, {}), steady: px(6, { steady: true }) === px(6.13, { steady: true }) };
  });
  T.eq(lampAt, { flickers: true, steady: true }, 'the dozing lamp flickers, and Flash reduction keeps it steady (UI §8)');
  const beats = [];
  for (const until of [7, 12, 17, 23.5]) {
    await ev((u) => { const SR = window.SR; while (SR.reg.scene.intro.info() && SR.reg.scene.intro.info().t < u) SR.loop.step(10); }, until);
    ii = await info('intro');
    beats.push(ii.beat);
    await shot('intro-' + (beats.length + 1) + '-' + ii.beat);
  }
  T.eq(beats, ['doze', 'curl', 'fall', 'reveal'], 'five beats: desk, doze, curl, fall, the reveal over the real city');
  T.ok(await visible('intro-card') && /Day 1\. 08:00\. \$100\. Mind the edges\./i.test(await t.uiText()), 'the card: "Day 1. 08:00. $100. Mind the edges."');
  await t.inject('confirm', true);
  await t.step(10);
  await t.inject('confirm', false);
  T.eq(await t.scenes(), ['intro'], 'a short press only shows the hold-to-skip ring');
  await t.hold('confirm', 40);
  await t.step(2);
  T.eq((await t.scenes())[0], 'building', 'holding a key for 0.6 s skips to the apartment');
  await t.fast(true);
  T.eq(await ev(() => window.SR.render.view.zoom), null, 'the intro gives the view back to the world');

  // ------------------------------------------------------------------------------------------------
  T.section('pause (UI §5.10)');
  await clearSaves();
  await t.newGame({ name: 'Pauser', length: 40 });
  await t.goto('city');
  await t.press('pause');
  await t.step(1);
  let pi = await info('pause');
  T.eq(pi.items, ['resume', 'settings', 'save', 'load', 'suspend', 'quit'], 'Resume · Settings · Save · Load · Suspend & quit · Quit to title');
  await audit('pause', '#ui [data-scene="pause"]');
  const pw = await A.tabWalk(t);
  T.eq(pw.issues, [], 'Tab walks the pause menu');
  await shot('pause');
  await t.press('pause');
  await t.step(1);
  T.eq(await t.scenes(), ['city'], 'Esc / Start resumes');
  // The Esc key fires `back`, then `pause` (docs/requests/W2-Pocket.md 4).
  await t.key('Escape'); await t.step(2);
  T.eq(await t.scenes(), ['city', 'pause'], 'the Esc key opens it');
  await t.clickUI('pause-settings'); await t.step(2);
  await t.key('Escape'); await t.step(2);
  T.eq(await t.scenes(), ['city', 'pause'], 'the Esc that closes Settings leaves the menu up');
  await t.clickUI('pause-load'); await t.step(2);
  await t.key('Escape'); await t.step(2);
  T.eq(await t.scenes(), ['city', 'pause'], 'so does the Esc that closes Save / Load');
  await t.key('Escape'); await t.step(2);
  T.eq(await t.scenes(), ['city'], 'and the next Esc resumes (the city does not reopen it)');
  await t.set({ mode: { difficulty: 'hardcore' } });
  await t.press('pause'); await t.step(1);
  pi = await info('pause');
  T.eq(pi.items.indexOf('save'), -1, 'Hardcore: no Save (the ironman slot saves itself)');
  await t.press('back'); await t.step(1);
  await t.set({ mode: { difficulty: 'standard', length: 0 } });
  await t.press('pause'); await t.step(1);
  T.ok((await info('pause')).items.indexOf('retire') >= 0, 'Unlimited adds Retire');
  await t.clickUI('pause-retire');
  await t.step(1);
  T.eq((await t.scenes()).slice(-1)[0], 'confirm', 'Retire asks first');
  await t.clickUI('pause-retire-yes');
  await t.step(3);
  const rs = await t.state();
  T.eq([await t.scenes(), rs.over, rs.result && rs.result.reason], [['results'], true, 'retire'], 'Retire ends the run with its results (reason retire)');
  // The cell is the whole game while you serve, pause menu included (GDD §6.6): a Retire there is no
  // jail night, so the cell does not present it; the results must still come.
  await t.newGame({ name: 'Cellmate', length: 0, seed: 3 });
  await ev(() => { const SR = window.SR; SR.state.jail = { daysLeft: 3, served: 0, reason: 'police' }; SR.scenes.go('jail', { resume: true }, { transition: false }); });
  await t.step(2);
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-retire'); await t.step(1);
  await t.clickUI('pause-retire-yes'); await t.step(3);
  T.eq([await t.scenes(), await t.get('over')], [['results'], true], 'Retire from the pause menu over the cell reaches the results (not a cell with the game over)');
  // over a minigame: only Resume and Settings
  await t.newGame({ name: 'Gamer' });
  await t.goto('city');
  await ev(() => { const SR = window.SR; if (!SR.reg.skin['test.ring']) SR.def.skin('test.ring', { engine: 'timingring', params: {}, art: {}, text: {} }); SR.minigame.run('test.ring', {}); SR.scenes.push('pause'); });
  await t.step(1);
  T.eq((await info('pause')).items, ['resume', 'settings'], 'over a minigame the menu offers Resume and Settings only');
  await ev(() => { window.SR.scenes.pop(); window.SR.scenes.pop({ m: 1, hits: 0, misses: 0 }); });
  await t.step(1);
  // Suspend & quit → the title → Continue resumes
  await clearSaves();
  await t.newGame({ name: 'Sleeper', seed: 4 });
  await t.set({ clock: { min: 900 }, money: { cash: 321 } });
  await t.goto('city');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-suspend');
  await t.step(2);
  T.eq([await t.scenes(), await ev(() => window.SR.state), await ev(() => !!window.SR.save.storage.get('sr1.suspend'))], [['title'], null, true],
    'Suspend & quit writes the suspend slot and returns to the title with no game running');
  T.ok(await visible('title-save') && /SLEEPER/i.test(await ev(() => document.querySelector('#ui [data-id="title-save-name"]').textContent)), 'the save card shows the suspended game');
  await t.clickUI('title-continue');
  await t.step(2);
  const back = await t.state();
  T.eq([await t.scenes(), back.player.name, back.clock.min, back.money.cash], [['city'], 'Sleeper', 900, 321], 'Continue resumes it in the city');
  T.eq(await ev(() => window.SR.save.storage.get('sr1.suspend')), null, 'and the suspend slot is used up (ARCHITECTURE §15)');
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-quit'); await t.step(1);
  await t.clickUI('pause-quit-yes'); await t.step(2);
  T.eq([await t.scenes(), await ev(() => window.SR.state)], [['title'], null], 'Quit to title (confirmed) leaves the game');
  // Hardcore: the ironman write is debounced 2 s (B-16); quitting inside it must not undo the change.
  await clearSaves();
  await t.newGame({ name: 'Ironside', difficulty: 'hardcore', seed: 8 });
  await ev(() => window.SR.save.write('ironman'));
  await t.goto('city');
  await ev(() => {
    const SR = window.SR;
    window.__refresh = [];
    const X = SR.art.exteriorDetail, orig = X.refresh;
    X.refresh = function () { window.__refresh.push(SR.state === null); return orig.apply(this, arguments); };
    window.__restoreRefresh = () => { X.refresh = orig; };
  });
  const shift = await t.act('mcsticks.work', {});
  const hc = await ev(() => ({ now: window.SR.state.money.cash, slot: window.SR.save.read('ironman').money.cash }));
  await t.press('pause'); await t.step(1);
  await t.clickUI('pause-quit'); await t.step(1);
  await t.clickUI('pause-quit-yes'); await t.step(2);
  const kept = await ev(() => window.SR.save.read('ironman').money.cash);
  T.ok(shift.ok && hc.slot !== hc.now && kept === hc.now, 'Hardcore: Quit to title inside the 2 s debounce still writes the last change to the ironman slot', [shift.ok, hc, kept]);
  T.eq(await ev(() => window.__refresh), [true], 'quitting re-bakes the city\'s building details for no game (docs/requests/W2-Exterior.md 11)');
  await ev(() => window.__restoreRefresh());

  // ------------------------------------------------------------------------------------------------
  T.section('Continue with a save that cannot be read');
  await clearSaves();
  await t.newGame({ name: 'Older', seed: 3 }); await ev(() => window.SR.save.write('slot2'));
  await t.newGame({ name: 'Mangled', seed: 4 }); await ev(() => window.SR.save.write('slot1'));
  await ev(() => {
    // Its meta reads, its state does not (a broken value): the title offers it until the load fails.
    const S = window.SR.save, env = JSON.parse(S.storage.get('sr1.slot1'));
    env.state.clock = 'x';
    S.storage.set('sr1.slot1', JSON.stringify(env));
    window.SR.ui.toast.clear();
    window.SR.state = null;
  });
  await t.goto('title');
  T.ok(/MANGLED/i.test(await ev(() => document.querySelector('#ui [data-id="title-save-name"]').textContent)), 'the save card shows the latest save');
  await t.clickUI('title-continue'); await t.step(2);
  const toasts = await ev(() => window.SR.ui.toast.list().map((x) => x.text));
  T.eq([await t.scenes(), toasts], [['title'], ['This save couldn\'t be read.']], 'Continue stays on the title with one "This save couldn\'t be read." (not one per listener)');
  T.ok(/OLDER/i.test(await ev(() => document.querySelector('#ui [data-id="title-save-name"]').textContent)), 'and the menu and the save card move on to the next readable save (the broken one is quarantined)');
  await clearSaves();
  await ev(() => window.SR.ui.toast.clear());

  // ------------------------------------------------------------------------------------------------
  T.section('the overlays register in their own files (BUILD_PLAN §4.11)');
  const files = await ev(() => ['pause', 'settings', 'saveload', 'halloffame', 'credits', 'profile', 'boot', 'title', 'newgame', 'intro', 'results']
    .map((id) => [id, window.SR.registry.file('scene', id), window.SR.reg.scene[id].kind || 'base']));
  T.eq(files, [['pause', 'js/ui/screens/pause.js', 'overlay'], ['settings', 'js/ui/screens/settings.js', 'overlay'], ['saveload', 'js/ui/screens/saveload.js', 'overlay'],
    ['halloffame', 'js/ui/screens/halloffame.js', 'base'], ['credits', 'js/ui/screens/credits.js', 'base'], ['profile', 'js/ui/screens/profile.js', 'base'],
    ['boot', 'js/scenes/boot.js', 'base'], ['title', 'js/scenes/title.js', 'base'], ['newgame', 'js/scenes/newgame.js', 'base'], ['intro', 'js/scenes/intro.js', 'base'],
    ['results', 'js/scenes/results.js', 'base']], 'each scene in its own file, overlays as overlays (CONTRACT §11.3)');

  // ------------------------------------------------------------------------------------------------
  T.section('the profile with no game running; the credits; the Hall of Fame (P1)');
  await ev(() => { window.SR.state = null; });
  await t.goto('title');
  await t.clickUI('title-achievements');
  await t.step(2);
  T.eq([await t.scenes(), (await info('profile')).tab], [['profile'], 'achievements'], 'Achievements opens the profile with no game running');
  T.ok(/still being inked/.test(await t.uiText()), 'the achievements grid waits for its P1 flag and data');
  await audit('profile', '#ui [data-scene="profile"]');
  await t.press('tabNext');
  T.eq((await info('profile')).tab, 'badges', 'E (the tabs context) moves to Badges');
  T.ok(/Old School/.test(await t.uiText()) && /Met the Artist/.test(await t.uiText()), 'the two badges');
  await t.press('tabNext');
  T.ok(/Runs finished/.test(await t.uiText()) && /Best net worth \(Medium\)/.test(await t.uiText()), 'Totals: runs, days, falls, fights, best net worth per length');
  await audit('profile totals', '#ui [data-scene="profile"]');
  await shot('profile');
  await t.press('back'); await t.step(1);
  T.eq(await t.scenes(), ['title'], 'Back returns to the title');
  await t.clickUI('title-credits'); await t.step(2);
  const cred = await t.uiText();
  T.ok(/Fan remaster\. Not affiliated with or endorsed by XGen Studios\./.test(cred) && /Back button returns here/.test(cred), 'credits: the fan note and the Classic note');
  await audit('credits', '#ui [data-scene="credits"]');
  await shot('credits');
  await t.clickUI('credits-back'); await t.step(1);
  T.eq(await t.scenes(), ['title'], 'the Back to title link');
  await t.debug('feature', 'achievements', true);
  await t.goto('title');
  T.ok((await info('title')).items.indexOf('title-hof') >= 0, 'with the flag on, the title lists the Hall of Fame');
  await t.clickUI('title-hof'); await t.step(2);
  T.eq([await t.scenes(), (await info('halloffame')).bucket], [['halloffame'], 'medium'], 'the Hall of Fame opens on Medium');
  await audit('hall of fame', '#ui [data-scene="halloffame"]');
  await t.press('tabPrev');
  T.eq((await info('halloffame')).bucket, 'short', 'Q moves between lengths');
  await shot('halloffame');
  await t.debug('feature', 'achievements', false);

  // ------------------------------------------------------------------------------------------------
  T.section('150 % text (UI §8): every screen reflows or scrolls, nothing clipped');
  await clearSaves();
  await ev(() => window.SR.settings.set('access.textScale', 1.5));
  await t.newGame({ name: 'Bartholomew Jr', seed: 41 });
  await ev(() => { const SR = window.SR; SR.save.write('slot1'); SR.state = null; const p = SR.save.profile(); p.hintsSeen.whatsNew = false; SR.save.saveProfile(p); });
  await t.debug('feature', 'achievements', true);
  await t.goto('title');
  T.eq(await reach(t, '#ui [data-scene="title"]', ['title-save-name', 'title-news-ok', 'title-version']), [], 'the title: the whole menu, the save card and the What\'s new card\'s Got it (not under the footer)');
  await shot('title-text150');
  for (const step of [1, 2, 3]) {
    await t.goto('newgame', { seed: 5 });
    for (let i = 1; i < step; i++) await t.clickUI('ng-next');
    await t.step(1);
    T.eq(await reach(t, '#ui [data-scene="newgame"]', ['ng-step-' + step]), [], 'the wizard, step ' + step);
  }
  for (const [scene, params, extra] of [['credits', null, ['credits-fan', 'credits-classic']], ['profile', { tab: 'totals' }, ['prof-best-unlimited']], ['halloffame', null, []]]) {
    await t.goto(scene, params);
    T.eq(await reach(t, '#ui [data-scene="' + scene + '"]', extra), [], 'the ' + scene + (params ? ' (' + params.tab + ')' : '') + ' panel scrolls instead of spilling over the city');
  }
  await shot('credits-text150');
  await t.newGame({ name: 'Bartholomew Jr', seed: 41, length: 15 });
  await t.goto('city');
  await t.press('pause'); await t.step(1);
  T.eq(await reach(t, '#ui [data-scene="pause"]'), [], 'the pause menu');
  await t.press('back'); await t.step(1);
  await ev(() => {
    const SR = window.SR, s = SR.state;
    s.clock.day = 16; s.money.cash = 2500000; s.stats.karma = 60; s.job.office = 'president'; s.flags.foldDone = true;
    s.over = true; s.result = SR.rules.endgame.results(s, 'time');
    SR.scenes.go('results', { reason: 'time', result: s.result }, { transition: false });
  });
  await t.step(1);
  T.eq(await reach(t, '#ui [data-scene="results"]', ['results-masthead', 'results-edition', 'results-headline', 'results-networth', 'results-banners', 'results-rank', 'results-meta']), [],
    'the Final Edition scrolls (the masthead and the headline are not cut off above the buttons)');
  await shot('results-text150');
  await ev(() => window.SR.settings.set('access.textScale', 1));
  await t.debug('feature', 'achievements', false);
  await clearSaves();

  // ------------------------------------------------------------------------------------------------
  T.section('Classic mode (GDD §5; ARCHITECTURE §15)');
  await clearSaves();
  await t.newGame({ name: 'Classicist', seed: 31 });
  await t.set({ clock: { min: 780 } });
  await t.goto('title');
  await t.clickUI('title-classic');
  await t.step(1);
  T.ok(/Open the 2005-rules recreation\? Your game is saved\./.test(await t.uiText()) && /Back button to return; Continue resumes your game/.test(await t.uiText()), 'the Classic confirm and its Back note (UI §5.2)');
  await audit('classic confirm', '#ui [data-scene="confirm"]');
  const errsBefore = t.errors().length;
  await Promise.all([page.waitForURL(/stick-rpg\/index\.html$/, { timeout: 10000 }), t.clickUI('classic-yes')]);
  T.ok(/\/stick-rpg\/index\.html$/.test(page.url()), 'the confirm opens ../stick-rpg/index.html in the same tab', page.url());
  const onClassic = await page.evaluate(() => ({ suspend: !!localStorage.getItem('sr1.suspend'), profile: localStorage.getItem('sr1.profile') }));
  T.ok(onClassic.suspend, 'after a suspend save of the running game');
  T.ok(/oldSchool/.test(onClassic.profile || ''), 'the Old School badge is on the profile');
  const classicErrors = t.errors().slice(errsBefore);
  await page.goBack();
  await page.waitForFunction(() => window.SR && window.SR.booted === true, null, { timeout: 10000 });
  await page.evaluate(() => { const SR = window.SR; SR.loop.pause(); SR.quality.set('high'); SR.debug.fast(true); });
  T.ok(/stick-rpg-remaster\/index\.html/.test(page.url()), 'the browser\'s Back button returns to the remaster');
  if ((await info('title')) && (await info('title')).gate) { await t.key('KeyZ'); await t.step(1); }
  T.ok((await info('title')).items.indexOf('title-continue') >= 0 && /v0\.1\.0 · Old School ★/.test(await t.uiText()), 'the title offers Continue and shows the Old School badge');
  await t.clickUI('title-continue'); await t.step(2);
  const resumed = await t.state();
  T.eq([await t.scenes(), resumed.player.name, resumed.clock.min], [['city'], 'Classicist', 780], 'Continue resumes the game');
  T.ok(true, 'the recreation logged ' + classicErrors.length + ' console message(s) of its own (not counted)');
  const ours = t.errors().slice(0, errsBefore).concat(t.errors().slice(errsBefore + classicErrors.length));

  // ------------------------------------------------------------------------------------------------
  T.section('touch: a press that already acted does not also tap the next screen');
  // A touch's click is dispatched where the finger lifts, after the boot card folded (on pointerdown)
  // or the intro skipped (on a held press): it must not land on what the next screen put there.
  const tt = await h.open({ fast: true, touch: true });
  const tev = (fn, arg) => tt.eval(fn, arg);
  await tev(() => window.SR.scenes.go('title', {}, { transition: false }));
  const newAt = await tev(() => { const r = document.querySelector('#ui [data-id="title-new"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await tev(() => window.SR.scenes.go('title', { gate: true }, { transition: false }));
  await tt.step(1);
  await tt.page.touchscreen.tap(newAt[0], newAt[1]);
  await tt.step(3);
  T.eq([await tt.scenes(), (await tt.eval(() => window.SR.reg.scene.title.info())).gate], [['title'], false], 'a tap on the boot card where New Game appears folds the card and opens nothing');
  await tt.newGame({ name: 'Toucher' });
  await tt.enter('home');
  await tt.step(2);
  const sleepAt = await tev(() => { const r = document.querySelector('#ui [data-id="row-home.sleep"]').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; });
  await tev(() => { const SR = window.SR; SR.debug.newGame({ name: 'Toucher' }); SR.scenes.go('intro', null, { transition: false }); });
  await tt.fast(false);
  await tt.step(5);
  await tev(() => { window.__clicks = []; document.addEventListener('click', (e) => { const el = e.target && e.target.closest && e.target.closest('[data-id]'); window.__clicks.push(el ? el.getAttribute('data-id') : String(e.target)); }, true); });
  const cdp = await tt.context.newCDPSession(tt.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sleepAt[0], y: sleepAt[1] }] });
  for (let i = 0; i < 6 && (await tt.scenes())[0] === 'intro'; i++) await tt.step(10);
  const skipped = await tt.scenes();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tt.page.waitForTimeout(200);
  await tt.step(3);
  const after = await tt.state();
  T.ok(skipped[0] === 'building' && (await tev(() => window.__clicks)).length === 0 && after.clock.day === 1 && after.clock.min === 480,
    'a touch held on the intro skips into the apartment, and lifting it does not press the row under it (Sleep)', [skipped, await tev(() => window.__clicks), after.clock]);
  const touchErrors = tt.errors();
  await tt.close();

  // ------------------------------------------------------------------------------------------------
  T.section('the touch-compact layout on a small phone (667 × 375; UI §2.2)');
  const ct = await h.open({ fast: true, touch: true, width: 667, height: 375 });
  T.eq(await ct.eval(() => document.getElementById('app').getAttribute('data-layout')), 'compact', 'the compact layout is on');
  await ct.eval(() => window.SR.scenes.go('title', {}, { transition: false }));
  T.eq(await reach(ct, '#ui [data-scene="title"]'), [], 'the title menu scrolls to its last item');
  const overlaps = [];
  for (const step of [1, 2, 3]) {
    await ct.eval(() => window.SR.scenes.go('newgame', { seed: 5 }, { transition: false }));
    for (let i = 1; i < step; i++) await ct.clickUI('ng-next');
    await ct.step(1);
    const bad = await ct.eval(() => {
      // The card scrolls as one: Back and Next stay below the step's content, never over it.
      document.querySelector('#ui .ng-card').scrollTop = 0;
      const foot = document.querySelector('#ui .ng-foot').getBoundingClientRect();
      return Array.from(document.querySelectorAll('#ui .ng-body [data-id]')).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && r.height && r.left < foot.right && r.right > foot.left && r.top < foot.bottom && r.bottom > foot.top;
      }).map((el) => el.getAttribute('data-id'));
    });
    overlaps.push(...bad.map((id) => step + ':' + id));
    const r = await reach(ct, '#ui [data-scene="newgame"]');
    overlaps.push(...r.map((x) => step + ':' + x));
  }
  T.eq(overlaps, [], 'every wizard step: the footer stays below the step (Fair start, the HP readout) and every control is reachable');
  await ct.shot(path.join(SHOTS, 'compact-newgame-2.png'));
  await ct.eval(() => { const SR = window.SR; SR.debug.newGame({ name: 'Pocket' }); SR.scenes.go('intro', null, { transition: false }); });
  await ct.fast(false);
  await ct.eval(() => { const SR = window.SR; while (SR.reg.scene.intro.info() && SR.reg.scene.intro.info().t < 15) SR.loop.step(10); });
  const cap = await ct.eval(() => { const r = document.querySelector('#ui [data-id="intro-caption"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  T.ok(cap, 'the intro\'s longest caption stays inside a narrow window');
  await ct.fast(true);
  const compactErrors = ct.errors();
  await ct.close();

  T.section('result');
  T.eq(await ev(() => window.SR.text.missing()), [], 'every text key the front end showed resolves');
  T.eq(ours, [], 'zero console errors in the remaster');
  T.eq(touchErrors, [], 'zero console errors in the touch session');
  T.eq(compactErrors, [], 'zero console errors in the compact session');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
