// The Play menu (js/menu.js) and one game a mode (js/library.js): it never opens by itself (at start, after a reload,
// on a tab switch); the Menu button and Esc open it, Esc and its X close it with the board exactly as it was; its home
// (a page over the Play tab: Solo and Multiplayer as two big tiles side by side, nothing else); each mode's short setup
// and Start; each mode keeping one game, resumed exactly by Continue (Enter), replaced by New game (after asking, with
// the setup's settings); Custom: New custom game (the Custom window), a Custom game never kept and gone once left, and
// the presets (Save preset, Start, Rename, Delete, twelve at most, kept in the save); nothing left of the board library.
// Then the phones by touch (44 px targets, nothing sideways, the home never scrolls, clear of the tab bar) and both
// themes (dark with reduced motion), with frames of the home, Solo, Multiplayer, a setup with Continue and the Custom
// page at four sizes.
// Run by browser-test.cjs: require('./menu-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

module.exports = async function menuTests({ browser, check, PAGE, OUT }) {
  console.log('play menu');
  const errors = [];
  const open = async (width, height, theme, touch, keepWelcome, reduced) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' }, touch ? { hasTouch: true, isMobile: true } : {}));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(450);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    if (!keepWelcome) await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
    const tag = width + 'x' + height + (touch ? '-touch' : '') + '-' + theme;
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    const press = async (sel) => {
      if (!touch) { await page.click(sel); await page.waitForTimeout(60); return; }
      const b = await page.$(sel); const r = await b.boundingBox();
      await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(90);
    };
    return { ctx, page, ev, tag, shot, press };
  };
  const menuOpen = (ev) => ev(() => !!document.querySelector('.modal-menu'));
  const state = (ev) => ev(() => { const m = Lull.app.modes.play, B = Lull.app.store.state.boards; return { cur: B.cur, games: Object.keys(B.games).sort().join(), custom: !!m.custom, mode: m.game.recipe.mode, w: m.game.w, h: m.game.h - m.bufferRows(m.game.recipe, m.game.w), json: (() => { const j = m.game.toJSON(); return JSON.stringify([j.cells, j.piece, j.hold, j.queue, j.bag, j.rng, j.s && j.s.pieces, j.s && j.s.lines]); })(), page: document.querySelector('.modal-menu') ? document.querySelector('.modal-menu').dataset.page : null }; });
  /** The topmost window that is not the menu (a question, the Custom window, Save preset). */
  const top = (ev) => ev(() => { const m = [...document.querySelectorAll('.modal:not(.modal-menu)')].pop(); return m ? { title: m.querySelector('header .ttl').textContent, cls: m.className } : null; });
  const SIDE = { plain: 'solo', classic: 'solo', descent: 'solo', mural: 'solo', race: 'multi', battle: 'multi' };

  // ---- never by itself ----------------------------------------------------------------------------------------------
  {
    const D = await open(520, 760, 'light', false, true);
    const { page, ev } = D;
    check('a first start shows the welcome, never the menu', (await ev(() => !!document.querySelector('.modal'))) && !(await menuOpen(ev)));
    await page.keyboard.press('Enter');
    await ev(() => { const g = Lull.app.modes.play.game; g.drop(); g.drop(); Lull.app.saveNow(); });
    const before = await state(ev);
    await page.reload();
    await page.waitForTimeout(900);
    const after = await state(ev);
    check('after a reload the last game is shown as it was, and no menu', !(await menuOpen(ev)) && !(await ev(() => Lull.UI.modalOpen())) && after.cur === before.cur && after.json === before.json, JSON.stringify([before.cur, after.cur]));
    for (const t of ['puzzle', 'play', 'achievements', 'stats', 'play']) await ev((id) => Lull.app.setTab(id), t);
    await page.waitForTimeout(1200);
    check('switching tabs and back to Play: no menu, the same game', !(await menuOpen(ev)) && (await state(ev)).json === after.json);
    // Esc on another tab does not open it.
    await ev(() => Lull.app.setTab('puzzle'));
    await page.keyboard.press('Escape');
    check('Esc on the Puzzles tab opens no menu', !(await menuOpen(ev)));
    await ev(() => Lull.app.setTab('play'));

    // ---- the Menu button and Esc --------------------------------------------------------------------------------------
    const btn = await ev(() => { const b = document.querySelector('#play-status .menu-btn'); return b && { label: b.getAttribute('aria-label'), text: b.textContent, boards: !!document.querySelector('#play-status .boards-btn') }; });
    check('under the board: the Menu button (no Boards button)', btn && btn.label === 'Menu' && /Menu/.test(btn.text) && !btn.boards, JSON.stringify(btn));
    await page.click('#play-status .menu-btn');
    await page.waitForTimeout(120);
    const areas = await ev(() => {
      const md = document.querySelector('.modal-menu'), vis = [...md.querySelectorAll('button')].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden');
      const r = md.getBoundingClientRect(), view = document.getElementById('view-play').getBoundingClientRect();
      return { buttons: vis.map((b) => b.classList.contains('x') ? 'X' : b.querySelector('b') ? b.querySelector('b').textContent : b.textContent), title: md.querySelector('header .ttl').textContent,
        focus: document.activeElement && document.activeElement.className, paused: !Lull.app.modes.play.canRun(), covers: r.left <= view.left + 1 && r.right >= view.right - 1 && r.bottom >= view.bottom - 1 && Math.abs(r.top - view.top) <= 2 };
    });
    check('the Menu button opens the menu: a page over the Play tab with Solo, Multiplayer and the X, nothing else (no Manage); focus on Solo; the board waits', areas.buttons.join() === 'X,Solo,Multiplayer' && areas.title === 'Menu' && /mn-solo/.test(areas.focus) && areas.paused && areas.covers, JSON.stringify(areas));
    check('its words are plain: no emoji', await ev(() => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.querySelector('.modal-menu').textContent)));
    await page.keyboard.press('Escape');
    const esc1 = await state(ev);
    check('Esc closes it: the board exactly as it was', !esc1.page && esc1.json === after.json, esc1.page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    check('Esc on the board opens it', (await state(ev)).page === 'home');
    await page.click('.modal-menu header .x');
    const esc2 = await state(ev);
    check('the X closes it, back to the same board', !esc2.page && esc2.json === esc1.json);
    // A held Esc opens it once (its repeats do not close it again at once).
    await ev(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', repeat: true, bubbles: true })); });
    check('a held Esc opens it and leaves it open', (await state(ev)).page === 'home');
    await page.keyboard.press('Escape');
    // Esc goes to a window that is open first: the Custom window closes, the menu does not open.
    await ev(() => Lull.app.modes.play.openNewBoard());
    await page.keyboard.press('Escape');
    check('Esc over the Custom window closes that window only', !(await menuOpen(ev)) && !(await ev(() => Lull.UI.modalOpen())));

    // ---- nothing left of the board library -------------------------------------------------------------------------
    const gone = await ev(() => {
      const m = Lull.app.modes.play, B = Lull.app.store.state.boards;
      return { api: ['openLibrary', 'openEditRules', 'applyEdit', 'switchTo', 'shelveAndNew', 'retire', 'confirmRetire', 'deleteBoard', 'openRetired', 'openRetiredView', 'thumb'].filter((k) => typeof m[k] === 'function'),
        view: !!Lull.RetiredView, keys: ['list', 'retired'].filter((k) => k in B), lib: ['retire', 'match', 'recent', 'rebuild', 'reshape', 'startNew'].filter((k) => k in Lull.Library), edit: ['editPrice', 'editConflicts', 'EDIT_PRICE'].filter((k) => k in Lull.Recipe),
        icons: ['boards', 'retire', 'expand'].filter((k) => Lull.Icons.icon(k)), css: [...document.styleSheets].some((sh) => { try { return [...sh.cssRules].some((r) => /\.lib-|\.modal-lib|\.fv-|\.modal-retire|\.mn-manage/.test(r.cssText)); } catch (e) { return false; } }) };
    });
    check('no Boards window, Manage, Retired, Rename of a board, Edit rules or its price: none of it left (code, save, icons, styles)', !gone.api.length && !gone.view && !gone.keys.length && !gone.lib.length && !gone.edit.length && !gone.icons.length && !gone.css, JSON.stringify(gone));

    // ---- each mode's setup and Start ----------------------------------------------------------------------------------
    const want = {
      // (The board in play is a played Relaxed one: Relaxed offers Continue, and New game asks first.)
      plain: { sel: ['.nb-presets .nb-preset', '.nb-chips .nb-chip'], counts: [4, 5], size: [10, 20], cont: true },
      classic: { sel: ['.nb-lvl .nb-level', '.cl-set'], counts: [2, 1], size: [10, 20] },
      descent: { sel: ['.nb-lvl .nb-level', '.ds-row'], counts: [3, 1], size: [10, 20] },
      mural: { sel: ['.mu-pics .nb-chip', '.mu-lv .nb-level'], counts: [4, 5], size: null },
      race: { sel: ['.nb-lvl .nb-level', '.nb-presets .nb-preset'], counts: [4, 3], size: [10, 10] },
      battle: { sel: ['.nb-lvl .nb-level', '.nb-presets .nb-preset'], counts: [4, 3], size: [10, 14] },
    };
    for (const [mode, w] of Object.entries(want)) {
      await page.click('#play-status .menu-btn');
      await page.click('.modal-menu .mn-' + SIDE[mode]);
      await page.click('.modal-menu [data-mode="' + mode + '"]');
      await page.waitForTimeout(60);
      const su = await ev((o) => ({ title: document.querySelector('.modal-menu header .ttl').textContent, counts: o.sel.map((s) => document.querySelectorAll('.modal-menu .mn-setup ' + s).length), start: (document.querySelector('.modal-menu .mn-start') || {}).textContent, cont: !!document.querySelector('.modal-menu .mn-continue'), other: !!document.querySelector('.modal-menu .nb-tabs, .modal-menu .nb-stepper:not(.cl-step)') }), w);
      check(mode + ': its setup shows only its own settings, then ' + (w.cont ? 'Continue and New game' : 'Start'), su.counts.join() === w.counts.join() && su.start === (w.cont ? 'New game' : 'Start') && su.cont === !!w.cont && !su.other, JSON.stringify(su));
      await page.click('.modal-menu .mn-start');
      if (w.cont) {
        const q = await top(ev);
        check(mode + ': New game on a game that was played asks first', q && q.title === 'New Relaxed game?', JSON.stringify(q));
        await page.click('.modal:not(.modal-menu) footer .btn.primary');
      }
      await page.waitForTimeout(80);
      const s = await state(ev);
      check(mode + ': Start makes its game and closes the menu', !s.page && s.mode === mode && s.cur === mode && (!w.size || (s.w === w.size[0] && s.h === w.size[1])), JSON.stringify({ mode: s.mode, cur: s.cur, w: s.w, h: s.h }));
      // Something done on it, so it has a game to continue.
      // (A Mural declines a piece set out of its place: counted by hand there.)
      await ev(() => { const m = Lull.app.modes.play, g = m.game; m.hideCard(); if (g.piece) g.drop(); if (!g.s.pieces) g.s.pieces = 1; m.persist(); });
    }
    const all = await state(ev);
    check('one game a mode: the one in play (Battle) and the other five kept', all.cur === 'battle' && all.games === 'classic,descent,mural,plain,race', all.games);
    if (OUT) await D.shot('menu-after-modes');

    // ---- Continue: each mode's game, exactly ------------------------------------------------------------------------
    const kept = await ev(() => { const B = Lull.app.store.state.boards, out = {}; for (const [k, e] of Object.entries(B.games)) out[k] = JSON.stringify(e.game); return out; });
    for (const mode of ['classic', 'race', 'plain', 'descent', 'mural']) {
      await ev((m) => Lull.app.modes.play.openMenu(m), mode);
      await page.waitForTimeout(60);
      const c = await ev(() => ({ cont: (document.querySelector('.modal-menu .mn-continue') || {}).textContent || '', primary: (document.querySelector('.modal-menu footer .btn.primary') || {}).className, focus: document.activeElement && document.activeElement.className, start: document.querySelector('.modal-menu .mn-start').textContent }));
      check(mode + ': Continue (how far it got) is the primary and has focus; New game beside', /^Continue/.test(c.cont) && /mn-continue/.test(c.primary) && /mn-continue/.test(c.focus) && c.start === 'New game', JSON.stringify(c));
      if (mode === 'race') check('Race: its progress is the match\'s tally', /^Continuevs Steady \d+–\d+$/.test(c.cont), c.cont);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
      const s = await ev((m) => { const pm = Lull.app.modes.play, j = pm.game.toJSON(); return { cur: Lull.app.store.state.boards.cur, page: !!document.querySelector('.modal-menu'), json: JSON.stringify(j) }; }, mode);
      const strip = (j) => { const o = JSON.parse(j); delete o.s.playMs; return JSON.stringify(o); };
      check(mode + ': Enter is Continue: exactly where it was left', s.cur === mode && !s.page && strip(s.json) === strip(kept[mode]), s.cur);
      await ev(() => Lull.app.modes.play.hideCard());
    }
    const all2 = await state(ev);
    check('still one game a mode after all that', all2.games === 'battle,classic,descent,plain,race' && all2.cur === 'mural', all2.games);

    // ---- New game replaces, with the setup's settings ---------------------------------------------------------------
    await ev(() => Lull.app.modes.play.openMenu('classic'));
    await page.click('.modal-menu [data-focus="classic.level+"]');
    const lv = await ev(() => ({ level: Lull.app.modes.play.menuHandle.menu.setup.recipe.classic.level, cont: !!document.querySelector('.modal-menu .mn-continue'), note: (document.querySelector('.modal-menu .mn-note') || {}).textContent }));
    check('another start level: Continue stays (the game kept is not changed); the setting applies to a new game', lv.level === 2 && lv.cont && /new game/.test(lv.note || ''), JSON.stringify(lv));
    const classicBefore = await ev(() => JSON.stringify(Lull.app.store.state.boards.games.classic.game));
    await page.click('.modal-menu .mn-start');
    check('New game asks first', ((await top(ev)) || {}).title === 'New Classic game?');
    await page.click('.modal:not(.modal-menu) footer .btn:not(.primary)');
    check('Cancel: nothing replaced, still in the setup', (await ev(() => JSON.stringify(Lull.app.store.state.boards.games.classic.game))) === classicBefore && (await state(ev)).page === 'setup');
    await page.click('.modal-menu .mn-start');
    await page.click('.modal:not(.modal-menu) footer .btn.primary');
    await page.waitForTimeout(80);
    const s2 = await state(ev);
    const lv2 = await ev(() => Lull.app.modes.play.game.recipe.classic.level);
    check('New game replaces Classic\'s game with a new one at level 2; still one game a mode', !s2.page && s2.cur === 'classic' && lv2 === 2 && s2.games === 'battle,descent,mural,plain,race' && (await ev(() => Lull.app.modes.play.game.s.pieces)) === 0, JSON.stringify(s2.games));
    check('the setup is remembered for next time', await ev(() => Lull.app.store.state.boards.menu.classic.recipe.classic.level === 2));
    // A Race of another size: New game there makes it that size.
    await ev(() => Lull.app.modes.play.openMenu('race'));
    await page.click('.modal-menu .nb-preset[data-w="8"]');
    await page.click('.modal-menu .mn-start');
    await page.click('.modal:not(.modal-menu) footer .btn.primary');
    await page.waitForTimeout(80);
    const s3 = await state(ev);
    check('Race: New game at 8 × 8 replaces its game; the rest kept', s3.cur === 'race' && s3.w === 8 && s3.h === 8 && s3.games === 'battle,classic,descent,mural,plain', JSON.stringify(s3));

    // ---- Custom: the page, a Custom game never kept, presets --------------------------------------------------------
    await ev(() => { const m = Lull.app.modes.play; m.hideCard(); m.game.drop(); m.persist(); });
    const savesBefore = await ev(() => { Lull.app.saveNow(); const sv = JSON.parse(localStorage.getItem('lull.save.v1')); return JSON.stringify([sv.free, sv.boards.games, sv.boards.cur]); });
    await page.click('#play-status .menu-btn');
    await page.click('.modal-menu .mn-solo');
    const solo = await ev(() => [...document.querySelectorAll('.modal-menu .mn-tiles .mn-tile')].map((b) => b.querySelector('b').textContent));
    const backX = await ev(() => { const hd = document.querySelector('.modal-menu header'), b = hd.querySelector('.mn-back'), x = hd.querySelector('.x'); return !b.hidden && b.getBoundingClientRect().right < x.getBoundingClientRect().left; });
    check('Solo: a tile a mode, Relaxed, Classic, Descent, Mural, then Custom; Back and the X at the top', solo.join() === 'Relaxed,Classic,Descent,Mural,Custom' && backX, solo.join());
    await page.click('.modal-menu [data-mode="custom"]');
    const cp = await ev(() => ({ page: document.querySelector('.modal-menu').dataset.page, title: document.querySelector('.modal-menu header .ttl').textContent, text: document.querySelector('.modal-menu .body').textContent, rows: document.querySelectorAll('.modal-menu .mn-preset').length, focus: document.activeElement && document.activeElement.className }));
    check('Custom is a page: New custom game (focused), Presets 0 of 12, a word on what a custom game is', cp.page === 'custom' && cp.title === 'Custom' && /New custom game/.test(cp.text) && /0 of 12/.test(cp.text) && /not saved\. It ends when you leave it/.test(cp.text) && cp.rows === 0 && /mn-newcustom/.test(cp.focus), JSON.stringify(cp));
    await page.click('.modal-menu .mn-newcustom');
    await page.waitForTimeout(100);
    const nb = await ev(() => ({ menu: !!document.querySelector('.modal-menu'), nb: !!document.querySelector('.modal-newboard'), tabs: document.querySelectorAll('.modal-newboard .nb-tab').length, steppers: document.querySelectorAll('.modal-newboard .nb-stepper').length, btns: [...document.querySelectorAll('.modal-newboard footer .btn')].map((b) => b.textContent).join() }));
    check('New custom game opens the Custom window over the page (size, shapes, modifiers, mode; Cancel, Save preset, Start)', nb.menu && nb.nb && nb.tabs === 4 && nb.steppers === 2 && nb.btns === 'Cancel,Save preset,Start', JSON.stringify(nb));
    // Tiny shapes and Mirror at 12 × 24, saved as a preset.
    await page.click('.modal-newboard .nb-tab[data-tab="shapes"]');
    await page.click('.modal-newboard .nb-chip[data-value="tiny"]');
    await page.click('.modal-newboard .nb-tab[data-tab="mods"]');
    await page.click('.modal-newboard .nb-switch[data-path="mods.mirror"]');
    await ev(() => { const v = document.querySelector('.modal-newboard .nb-val[data-k="w"]'); v.focus(); });
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    await page.click('.modal-newboard footer .nb-save');
    await page.waitForTimeout(80);
    const ask = await ev(() => { const m = document.querySelector('.modal-preset'); return m && { title: m.querySelector('header .ttl').textContent, value: m.querySelector('input').value, focus: document.activeElement === m.querySelector('input') }; });
    check('Save preset asks for a name, the rules in words to start from', ask && ask.title === 'Save preset' && /Tiny/.test(ask.value) && ask.focus, JSON.stringify(ask));
    await page.fill('.modal-preset input', '  Little  mirror ');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    const p1 = await ev(() => ({ presets: Lull.app.store.state.boards.presets.map((p) => [p.name, p.size.w, p.size.h, p.recipe.shapes.preset, p.recipe.mods.mirror]), nb: !!document.querySelector('.modal-newboard'), ask: !!document.querySelector('.modal-preset'), rows: [...document.querySelectorAll('.modal-menu .mn-preset')].map((r) => r.textContent), stored: JSON.parse(localStorage.getItem('lull.save.v1')).boards.presets.length }));
    check('Enter keeps it: named (cleaned), its rules and size; the window stays open; the page lists it at once; saved', JSON.stringify(p1.presets) === JSON.stringify([['Little mirror', 12, 20, 'tiny', true]]) && p1.nb && !p1.ask && p1.rows.length === 1 && /Little mirror/.test(p1.rows[0]) && /12 × 20 · Tiny/.test(p1.rows[0]) && p1.stored === 1, JSON.stringify(p1));
    if (OUT) await D.shot('menu-custom-window');
    // Start from the window: a Custom game, the menu closed; no mode's save touched.
    await page.click('.modal-newboard footer .btn.primary');
    await page.waitForTimeout(100);
    const cg = await state(ev);
    const savesCustom = await ev(() => { Lull.app.saveNow(); const sv = JSON.parse(localStorage.getItem('lull.save.v1')); return JSON.stringify([sv.free, sv.boards.games, sv.boards.cur]); });
    check('Start plays a Custom game (Tiny, Mirror, 12 × 20) and closes the menu', cg.custom && !cg.page && cg.w === 12 && cg.h === 20 && (await ev(() => Lull.app.modes.play.game.recipe.mods.mirror)), JSON.stringify(cg));
    await ev(() => { const g = Lull.app.modes.play.game; for (let i = 0; i < 4; i++) g.drop(); Lull.app.saveNow(); });
    const savesPlayed = await ev(() => { const sv = JSON.parse(localStorage.getItem('lull.save.v1')); return JSON.stringify([sv.free, sv.boards.games, sv.boards.cur]); });
    check('a Custom game, played, touches no mode\'s save: the save is exactly as before it', savesCustom === savesBefore && savesPlayed === savesBefore);
    // A reload ends it for good: the Race game comes back, nothing of the Custom one.
    await page.reload();
    await page.waitForTimeout(700);
    const rl = await state(ev);
    check('after a reload the Custom game is gone for good: the Race game in play, as it was', !rl.custom && rl.cur === 'race' && rl.mode === 'race' && rl.w === 8 && !rl.page, JSON.stringify(rl));
    check('presets are kept across the reload', await ev(() => Lull.app.store.state.boards.presets.length === 1 && Lull.app.store.state.boards.presets[0].name === 'Little mirror'));
    // A preset's Start; then Continue in another mode leaves it for good (and nothing of it is resumable).
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.openMenu('custom'); });
    await page.click('.modal-menu .mn-preset .mn-pstart');
    await page.waitForTimeout(100);
    const ps = await state(ev);
    check('a preset\'s Start plays its rules as a Custom game', ps.custom && ps.w === 12 && ps.h === 20 && !ps.page, JSON.stringify(ps));
    await ev(() => { const g = Lull.app.modes.play.game; g.drop(); g.drop(); });
    await ev(() => Lull.app.modes.play.openMenu('descent'));
    await page.click('.modal-menu .mn-continue');
    await page.waitForTimeout(80);
    const lv1 = await state(ev);
    check('Continue in Descent ends the Custom game for good: Descent in play, Race kept', !lv1.custom && lv1.cur === 'descent' && lv1.games === 'battle,classic,mural,plain,race', JSON.stringify(lv1));
    const noneOfIt = await ev(() => { const B = Lull.app.store.state.boards; return Object.values(B.games).every((e) => !e.game.recipe || !e.game.recipe.mods || !e.game.recipe.mods.mirror) && !Lull.app.modes.play.custom; });
    check('nothing of a Custom game is kept to resume', noneOfIt);
    // Rename (inline) and Delete (asks).
    await ev(() => Lull.app.modes.play.openMenu('custom'));
    await page.click('.modal-menu .mn-preset .mn-pren');
    check('Rename turns the name into a field, focused', await ev(() => document.activeElement && document.activeElement.classList.contains('mn-pname')));
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Rainy Sunday');
    await page.keyboard.press('Enter');
    const rn = await ev(() => ({ name: Lull.app.store.state.boards.presets[0].name, shown: document.querySelector('.modal-menu .mn-preset .nm').textContent, menu: !!document.querySelector('.modal-menu'), focus: document.activeElement && document.activeElement.className }));
    check('Enter keeps the new name (the menu stays, focus back on Rename)', rn.name === 'Rainy Sunday' && rn.shown === 'Rainy Sunday' && rn.menu && /mn-pren/.test(rn.focus), JSON.stringify(rn));
    await page.click('.modal-menu .mn-preset .mn-pren');
    await page.keyboard.type('zzz');
    await page.keyboard.press('Escape');
    check('Esc in the field keeps the old name and the menu', await ev(() => Lull.app.store.state.boards.presets[0].name === 'Rainy Sunday' && !!document.querySelector('.modal-menu')));
    await page.click('.modal-menu .mn-preset .mn-pren');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    check('an empty name is refused', await ev(() => Lull.app.store.state.boards.presets[0].name === 'Rainy Sunday'));
    await page.click('.modal-menu .mn-preset .mn-pdel');
    check('Delete asks first', ((await top(ev)) || {}).title === 'Delete Rainy Sunday?');
    await page.click('.modal:not(.modal-menu) footer .btn:not(.danger)');
    check('Cancel keeps it', await ev(() => Lull.app.store.state.boards.presets.length === 1));
    await page.click('.modal-menu .mn-preset .mn-pdel');
    await page.click('.modal:not(.modal-menu) footer .btn.danger');
    await page.waitForTimeout(60);
    const del = await ev(() => ({ n: Lull.app.store.state.boards.presets.length, rows: document.querySelectorAll('.modal-menu .mn-preset').length, stored: JSON.parse(localStorage.getItem('lull.save.v1')).boards.presets.length, focus: document.activeElement && document.activeElement.className }));
    check('Delete removes it, saved at once; focus stays in the page', del.n === 0 && del.rows === 0 && del.stored === 0 && /mn-newcustom/.test(del.focus), JSON.stringify(del));
    // Twelve at most: Save preset says so, and keeps nothing more.
    await ev(() => { const B = Lull.app.store.state.boards; for (let i = 0; i < 12; i++) Lull.Library.addPreset(B, 'Set ' + (i + 1), Lull.Recipe.normalize({ mode: i % 2 ? 'classic' : 'plain' }), { w: 10, h: 20 }, Date.now()); Lull.app.modes.play.menuHandle.menu.go('custom'); });
    const twelve = await ev(() => ({ rows: document.querySelectorAll('.modal-menu .mn-preset').length, count: document.querySelector('.modal-menu .mn-count').textContent }));
    await page.click('.modal-menu .mn-newcustom');
    const off = await ev(() => document.querySelector('.modal-newboard footer .nb-save').getAttribute('aria-disabled'));
    await ev(() => document.querySelector('.modal-newboard footer .nb-save').click()); // (off: aria-disabled, so a press says why)
    const full = await ev(() => ({ why: document.querySelector('.modal-newboard .nb-why').textContent, ask: !!document.querySelector('.modal-preset'), n: Lull.app.store.state.boards.presets.length }));
    check('twelve presets: the page lists all twelve (12 of 12); Save preset is off and says why; nothing more kept', twelve.rows === 12 && twelve.count === '12 of 12' && off === 'true' && /12 presets kept/.test(full.why) && !full.ask && full.n === 12, JSON.stringify([twelve, off, full]));
    await page.keyboard.press('Escape');
    await page.click('.modal-menu .mn-back');
    check('Back from Custom: to Solo, focus on the Custom tile', await ev(() => document.querySelector('.modal-menu').dataset.page === 'solo' && document.activeElement.dataset.mode === 'custom'));
    await page.click('.modal-menu .mn-back');
    check('Back returns to the menu, focus on the area it left', await ev(() => document.querySelector('.modal-menu').dataset.page === 'home' && document.activeElement.classList.contains('mn-solo')));
    await page.click('.modal-menu .mn-multi');
    const multi = await ev(() => [...document.querySelectorAll('.modal-menu .mn-tiles .mn-tile')].map((b) => b.querySelector('b').textContent));
    check('Multiplayer: Race and Battle', multi.join() === 'Race,Battle', multi.join());
    await page.keyboard.press('Escape');
    check('Esc closes it from a page too', !(await menuOpen(ev)));
    // End cards say Menu (never Boards or Retire).
    const cards = await ev(() => {
      const m = Lull.app.modes.play, g = m.game, out = {};
      m.hideCard();
      m.resumeMode('plain');
      const p = m.game; p.board.cells.fill(0); p.replacePiece({ id: 'O' });
      for (let y = 0; y < 18; y++) for (let x = 0; x < 9; x++) p.board.set(x, y, 8);
      let guard = 0; while (!p.over && guard++ < 50) p.drop();
      out.full = [...document.querySelectorAll('#play-overlay .card button')].map((b) => b.textContent);
      m.resumeMode('classic');
      out.classic = [...document.querySelectorAll('#play-overlay .card button')].map((b) => b.textContent);
      return out;
    });
    check('end and waiting cards offer Menu (no Boards, Retire or Edit rules)', cards.full.includes('Menu') && cards.full.includes('New game') && cards.classic.includes('Menu') && !JSON.stringify(cards).match(/Boards|Retire|Edit rules/), JSON.stringify(cards));
    check('no errors in the menu', errors.length === 0, errors.slice(0, 3).join(' | '));
    await D.ctx.close();
  }

  // ---- migration in the page: an old save with a library loads, one game a mode -------------------------------------
  {
    const D = await open(520, 760, 'light', false, true);
    const { page, ev } = D;
    const old = await ev(() => {
      const R = Lull.Recipe, G = (seed, recipe, n) => { const g = new Lull.Game({ w: recipe && recipe.mode === 'race' ? 10 : 10, h: recipe && recipe.mode === 'race' ? 10 : 20, seed, recipe }); for (let i = 0; i < n; i++) g.drop(); return g.toJSON(); };
      const classic = R.normalize({ mode: 'classic' }), race = R.normalize({ mode: 'race' });
      const list = [{ id: 'b1', name: 'In play', touched: 10 }];
      for (let i = 2; i <= 12; i++) list.push({ id: 'b' + i, name: 'Board ' + i, touched: i * 100, game: G(i, i % 3 === 0 ? classic : i % 3 === 1 ? race : null, 2 + i) });
      const retired = Array.from({ length: 50 }, (_, i) => ({ id: 'r' + i, name: 'Old ' + i, at: i, reason: 'manual', w: 10, h: 20, cells: '', sum: { lines: i } }));
      const save = { v: 2, lines: 77, free: G(1, null, 5), boards: { seq: 70, cur: 'b1', list, retired, size: { w: 10, h: 20 } } };
      // (The page's own saves on its way out must not write over the old one.)
      Lull.app.store.replaced = true;
      localStorage.setItem('lull.save.v1', JSON.stringify(save));
      return { classic: JSON.stringify(list.filter((r) => r.game && r.game.recipe && r.game.recipe.mode === 'classic').sort((a, b) => b.touched - a.touched)[0].game), race: JSON.stringify(list.filter((r) => r.game && r.game.recipe && r.game.recipe.mode === 'race').sort((a, b) => b.touched - a.touched)[0].game), free: JSON.stringify(save.free) };
    });
    await page.reload();
    await page.waitForTimeout(800);
    const mig = await ev(() => { const st = Lull.app.store.state, B = st.boards; Lull.app.saveNow(); return { v: st.v, cur: B.cur, keys: Object.keys(B).sort().join(), games: Object.keys(B.games).sort().join(), classic: JSON.stringify(B.games.classic && B.games.classic.game), race: JSON.stringify(B.games.race && B.games.race.game), lines: st.lines, pieces: Lull.app.modes.play.game.s.pieces, stored: JSON.parse(localStorage.getItem('lull.save.v1')).v }; });
    check('an old save with twelve boards and fifty retired ones loads: the board in play stays in play, the newest Classic and Race kept, the rest gone', mig.v >= 3 && mig.stored === mig.v && mig.cur === 'plain' && mig.games === 'classic,race' && mig.classic === old.classic && mig.race === old.race && mig.lines === 77 && mig.pieces === 5 && !/list|retired/.test(mig.keys), JSON.stringify(mig));
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.openMenu('race'); });
    check('the kept Race game is offered: Continue', await ev(() => !!document.querySelector('.modal-menu .mn-continue')));
    check('migration: no errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await D.ctx.close();
  }

  // ---- the four window sizes, both themes: fit, 44 px by touch, clear of the tab bar, frames ------------------------
  const SIZES = [[520, 760, false], [900, 700, false], [390, 844, true], [320, 568, true]];
  for (const theme of ['light', 'dark']) for (const [w, hh, touch] of SIZES) {
    const D = await open(w, hh, theme, touch, false, theme === 'dark');
    const { page, ev, press, tag } = D;
    await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
    await ev(() => {
      const m = Lull.app.modes.play, R = Lull.Recipe, B = Lull.app.store.state.boards;
      m.game.drop();
      m.newGame(R.normalize({ mode: 'classic' }), { w: 10, h: 20 }); m.game.drop();
      m.newGame(R.normalize({ mode: 'race' }), { w: 10, h: 10 }); m.game.s.pieces = 1;
      m.newGame(R.normalize({ shapes: { preset: 'tiny' } }), { w: 10, h: 20 }); m.game.drop();
      Lull.Library.addPreset(B, 'Tiny mirror', R.normalize({ shapes: { preset: 'tiny' }, mods: { mirror: true } }), { w: 12, h: 24 }, 1);
      Lull.Library.addPreset(B, 'Quick Classic B', R.normalize({ mode: 'classic', classic: { type: 'b' } }), { w: 10, h: 20 }, 2);
      Lull.Library.addPreset(B, 'A long name for a preset', R.normalize({ mode: 'descent', descent: { level: 'hard' } }), { w: 10, h: 20 }, 3);
      m.persist();
    });
    const fits = async (what) => {
      const f = await ev((touchy) => {
        const md = [...document.querySelectorAll('#modal-root .modal')].pop(), r = md.getBoundingClientRect();
        const btns = [...md.querySelectorAll('button, input')].filter((b) => b.offsetParent && b.getClientRects().length);
        const small = touchy ? btns.map((b) => { const q = b.getBoundingClientRect(); return [b.className || b.textContent, Math.round(Math.min(q.width, q.height))]; }).filter(([, v]) => v < 43.5) : [];
        const side = [...md.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)).map((e) => e.className);
        // The tab bar along the bottom (500 px wide and under): the window, and its footer's buttons, end above it.
        const tabs = document.getElementById('tabs').getBoundingClientRect(), barAt = tabs.top > innerHeight / 2 ? tabs.top : innerHeight;
        const under = [md].concat([...md.querySelectorAll('footer button')]).filter((b) => b.getClientRects().length && b.getBoundingClientRect().bottom > barAt + 0.5).map((b) => b.className || b.textContent);
        return { inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, page: document.documentElement.scrollWidth <= innerWidth, small, side, cut: md.scrollWidth > md.clientWidth + 1, under };
      }, touch);
      check(tag + ' ' + what + ': inside the window, clear of the tab bar, nothing sideways' + (touch ? ', every target 44 px or more' : ''), f.inside && f.page && !f.side.length && !f.cut && !f.small.length && !f.under.length, JSON.stringify(f));
    };
    const name = (k) => 'menu-' + k + '-' + w + 'x' + hh + '-' + theme;
    await press('#play-status .menu-btn');
    await page.waitForTimeout(300);
    const look = await ev(() => { const b = document.querySelector('.modal-menu .mn-tile b'), lum = (c) => { const [r, g, bb] = c.match(/[\d.]+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255; }; return { fg: lum(getComputedStyle(b).color), theme: document.documentElement.dataset.theme }; });
    check(tag + ': the menu follows the theme', look.theme === theme && (theme === 'dark' ? look.fg > 0.6 : look.fg < 0.4), JSON.stringify(look));
    await fits('menu');
    const home = await ev(() => {
      const md = document.querySelector('.modal-menu'), bd = md.querySelector('.body'), s = md.querySelector('.mn-solo').getBoundingClientRect(), m = md.querySelector('.mn-multi').getBoundingClientRect();
      return { still: bd.scrollHeight <= bd.clientHeight + 1, side: Math.abs(s.top - m.top) < 1 && s.right <= m.left && Math.abs(s.height - m.height) < 1, tall: s.height >= s.width * 0.95, manage: !!md.querySelector('.mn-manage'), sz: [Math.round(s.width), Math.round(s.height)] };
    });
    check(tag + ': the home does not scroll; Solo and Multiplayer side by side, tall; no Manage', home.still && home.side && home.tall && !home.manage, JSON.stringify(home));
    await D.shot(name('home'));
    await press('.modal-menu .mn-solo');
    await fits('Solo');
    await D.shot(name('solo'));
    await press('.modal-menu [data-mode="plain"]');
    await page.waitForTimeout(60);
    const res = await ev(() => (document.querySelector('.modal-menu .mn-continue') || {}).textContent || '');
    check(tag + ': Relaxed\'s setup with Continue', /^Continue/.test(res), res);
    await fits('a setup with Continue');
    await D.shot(name('setup-continue'));
    await press('.modal-menu .mn-back');
    await press('.modal-menu [data-mode="classic"]');
    await fits('Classic setup');
    await D.shot(name('setup-classic'));
    await press('.modal-menu .mn-back');
    await press('.modal-menu [data-mode="custom"]');
    await page.waitForTimeout(60);
    check(tag + ': the Custom page lists the presets', (await ev(() => document.querySelectorAll('.modal-menu .mn-preset').length)) === 3);
    await fits('the Custom page');
    await D.shot(name('custom'));
    await press('.modal-menu .mn-back');
    await press('.modal-menu .mn-back');
    await press('.modal-menu .mn-multi');
    await fits('Multiplayer');
    await D.shot(name('multi'));
    await press('.modal-menu [data-mode="battle"]');
    await fits('Battle setup');
    await D.shot(name('setup-battle'));
    await D.ctx.close();
  }
  check('no errors at any size', errors.length === 0, errors.slice(0, 3).join(' | '));
};
