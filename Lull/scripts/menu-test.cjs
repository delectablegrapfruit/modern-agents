// The Play menu (js/menu.js): it never opens by itself (at start, after a reload, on a tab switch); the Menu button
// and Esc open it, Esc and its X close it with the board exactly as it was; its home (a page over the Play tab: Solo and
// Multiplayer as two big tiles side by side, Manage under them, nothing else); each mode's short setup and Start;
// resume by rules (the same settings resume the board, other settings make a new one, Start new always does); Manage
// (the library's Solo and Multiplayer tabs); Custom (the full New board window). Then the phones by touch (44 px
// targets, nothing sideways, the home never scrolls, the tiles side by side) and both themes, with frames of the home,
// Solo, Multiplayer, a setup with Resume and the library's tabs at four sizes.
// Run by browser-test.cjs: require('./menu-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

module.exports = async function menuTests({ browser, check, PAGE, OUT }) {
  console.log('play menu');
  const errors = [];
  const open = async (width, height, theme, touch, keepWelcome) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme }, touch ? { hasTouch: true, isMobile: true } : {}));
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
  const state = (ev) => ev(() => { const m = Lull.app.modes.play, B = Lull.app.store.state.boards; return { cur: B.cur, n: B.list.length, mode: m.game.recipe.mode, w: m.game.w, h: m.game.h - m.bufferRows(m.game.recipe, m.game.w), json: (() => { const j = m.game.toJSON(); return JSON.stringify([j.cells, j.piece, j.hold, j.queue, j.bag, j.rng, j.s && j.s.pieces, j.s && j.s.lines]); })(), page: document.querySelector('.modal-menu') ? document.querySelector('.modal-menu').dataset.page : null }; });

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
    check('after a reload the last board is shown as it was, and no menu', !(await menuOpen(ev)) && !(await ev(() => Lull.UI.modalOpen())) && after.cur === before.cur && after.json === before.json, JSON.stringify([before.cur, after.cur]));
    for (const t of ['puzzle', 'play', 'achievements', 'stats', 'play']) await ev((id) => Lull.app.setTab(id), t);
    await page.waitForTimeout(1200);
    check('switching tabs and back to Play: no menu, the same board', !(await menuOpen(ev)) && (await state(ev)).cur === before.cur);
    // Esc on another tab does not open it.
    await ev(() => Lull.app.setTab('puzzle'));
    await page.keyboard.press('Escape');
    check('Esc on the Puzzles tab opens no menu', !(await menuOpen(ev)));
    await ev(() => Lull.app.setTab('play'));

    // ---- the Menu button and Esc --------------------------------------------------------------------------------------
    const btn = await ev(() => { const b = document.querySelector('#play-status .menu-btn'); return b && { label: b.getAttribute('aria-label'), text: b.textContent, boards: !!document.querySelector('#play-status .boards-btn') }; });
    check('under the board: the Menu button (the Boards button is gone)', btn && btn.label === 'Menu' && /Menu/.test(btn.text) && !btn.boards, JSON.stringify(btn));
    await page.click('#play-status .menu-btn');
    await page.waitForTimeout(120);
    const areas = await ev(() => {
      const md = document.querySelector('.modal-menu'), vis = [...md.querySelectorAll('button')].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden');
      const r = md.getBoundingClientRect(), view = document.getElementById('view-play').getBoundingClientRect();
      return { buttons: vis.map((b) => b.classList.contains('x') ? 'X' : b.querySelector('b') ? b.querySelector('b').textContent : b.textContent), title: md.querySelector('header .ttl').textContent,
        focus: document.activeElement && document.activeElement.className, paused: !Lull.app.modes.play.canRun(), covers: r.left <= view.left + 1 && r.right >= view.right - 1 && r.bottom >= view.bottom - 1 && Math.abs(r.top - view.top) <= 2 };
    });
    check('the Menu button opens the menu: a page over the Play tab with Solo, Multiplayer, Manage and the X, nothing else; focus on Solo; the board waits', areas.buttons.join() === 'X,Solo,Multiplayer,Manage' && areas.title === 'Menu' && /mn-solo/.test(areas.focus) && areas.paused && areas.covers, JSON.stringify(areas));
    check('its words are plain: no emoji', await ev(() => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.querySelector('.modal-menu').textContent)));
    await page.keyboard.press('Escape');
    const esc1 = await state(ev);
    check('Esc closes it: the board exactly as it was', !esc1.page && esc1.cur === before.cur && esc1.json === after.json, esc1.page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    check('Esc on the board opens it', (await state(ev)).page === 'home');
    await page.click('.modal-menu header .x');
    const esc2 = await state(ev);
    check('the X closes it, back to the same board', !esc2.page && esc2.cur === before.cur && esc2.json === esc1.json);
    // A held Esc opens it once (its repeats do not close it again at once).
    await ev(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', repeat: true, bubbles: true })); });
    check('a held Esc opens it and leaves it open', (await state(ev)).page === 'home');
    await page.keyboard.press('Escape');
    // Esc goes to a window that is open first: the library closes, the menu does not open.
    await ev(() => Lull.app.modes.play.openLibrary());
    await page.keyboard.press('Escape');
    check('Esc over the library closes the library only', !(await menuOpen(ev)) && !(await ev(() => Lull.UI.modalOpen())));

    // ---- each mode's setup and Start ----------------------------------------------------------------------------------
    const want = {
      // (The board in play is a plain Standard one: Relaxed offers it, and Start new makes another.)
      plain: { side: 'solo', sel: ['.nb-presets .nb-preset', '.nb-chips .nb-chip'], counts: [4, 5], size: [10, 20], resume: true },
      classic: { side: 'solo', sel: ['.nb-lvl .nb-level', '.cl-set'], counts: [2, 1], size: [10, 20] },
      descent: { side: 'solo', sel: ['.nb-lvl .nb-level', '.ds-row'], counts: [3, 1], size: [10, 20] },
      mural: { side: 'solo', sel: ['.mu-pics .nb-chip', '.mu-lv .nb-level'], counts: [4, 5], size: null },
      race: { side: 'multi', sel: ['.nb-lvl .nb-level', '.nb-presets .nb-preset'], counts: [4, 3], size: [10, 10] },
      battle: { side: 'multi', sel: ['.nb-lvl .nb-level', '.nb-presets .nb-preset'], counts: [4, 3], size: [10, 14] },
    };
    const made = {};
    for (const [mode, w] of Object.entries(want)) {
      await page.click('#play-status .menu-btn');
      await page.click('.modal-menu .mn-' + w.side);
      await page.click('.modal-menu [data-mode="' + mode + '"]');
      await page.waitForTimeout(60);
      const su = await ev((o) => ({ title: document.querySelector('.modal-menu header .ttl').textContent, counts: o.sel.map((s) => document.querySelectorAll('.modal-menu .mn-setup ' + s).length), start: (document.querySelector('.modal-menu .mn-start') || {}).textContent, resume: !!document.querySelector('.modal-menu .mn-resume'), other: !!document.querySelector('.modal-menu .nb-tabs, .modal-menu .nb-stepper:not(.cl-step)') }), w);
      check(mode + ': its setup shows only its own settings, then ' + (w.resume ? 'Resume and Start new' : 'Start'), su.counts.join() === w.counts.join() && su.start === (w.resume ? 'Start new' : 'Start') && su.resume === !!w.resume && !su.other, JSON.stringify(su));
      const n0 = (await state(ev)).n;
      await page.click('.modal-menu .mn-start');
      await page.waitForTimeout(80);
      const s = await state(ev);
      made[mode] = s.cur;
      check(mode + ': Start makes the board and closes the menu', !s.page && s.mode === mode && (!w.size || (s.w === w.size[0] && s.h === w.size[1])) && s.n >= n0, JSON.stringify({ mode: s.mode, w: s.w, h: s.h, n: [n0, s.n] }));
      // Something done on it, so the next Start shelves it rather than making it again.
      await ev(() => { const m = Lull.app.modes.play, g = m.game; m.hideCard(); if (g.piece) g.drop(); else g.s.pieces = (g.s.pieces || 0) + 1; m.persist(); });
    }
    if (OUT) await D.shot('menu-after-modes');

    // ---- resume by rules ----------------------------------------------------------------------------------------------
    await ev(() => Lull.app.modes.play.openMenu('classic'));
    await page.waitForTimeout(60);
    const r1 = await ev(() => ({ resume: (document.querySelector('.modal-menu .mn-resume') || {}).textContent || '', start: document.querySelector('.modal-menu .mn-start').textContent, primary: document.querySelector('.modal-menu footer .btn.primary').textContent, focus: document.activeElement && document.activeElement.className }));
    const classicName = await ev((id) => Lull.Library.find(Lull.app.store.state.boards, id).name, made.classic);
    check('the same settings: "Resume: <name> (<progress>)" above Start new, focused', r1.resume.startsWith('Resume: ' + classicName + ' (') && /\)$/.test(r1.resume) && r1.start === 'Start new' && /Resume/.test(r1.primary) && /mn-resume/.test(r1.focus), JSON.stringify(r1));
    const n1 = (await state(ev)).n;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    const s1 = await state(ev);
    check('Enter resumes that board: no new board', !s1.page && s1.cur === made.classic && s1.n === n1, JSON.stringify([s1.cur, made.classic, s1.n, n1]));
    // Other settings: a new board.
    await ev(() => Lull.app.modes.play.openMenu('classic'));
    await page.click('.modal-menu [data-focus="classic.level+"]');
    const r2 = await ev(() => ({ resume: !!document.querySelector('.modal-menu .mn-resume'), start: document.querySelector('.modal-menu .mn-start').textContent, primary: document.querySelector('.modal-menu .mn-start').classList.contains('primary'), level: Lull.app.modes.play.menuHandle.menu.setup.recipe.classic.level }));
    check('another start level: no Resume, Start', !r2.resume && r2.start === 'Start' && r2.primary && r2.level === 2, JSON.stringify(r2));
    await page.click('.modal-menu .mn-start');
    const s2 = await state(ev);
    check('Start with other settings makes a new Classic board', !s2.page && s2.cur !== made.classic && s2.mode === 'classic' && s2.n === n1 + 1 && (await ev(() => Lull.app.modes.play.game.recipe.classic.level)) === 2, JSON.stringify(s2.n));
    check('the setup is remembered for next time', await ev(() => Lull.app.store.state.boards.menu.classic.recipe.classic.level === 2));
    // Back to level 1: Resume offers the first board again (the new one is level 2); Start new makes another anyway.
    await ev(() => { const g = Lull.app.modes.play.game; g.drop(); Lull.app.modes.play.openMenu('classic'); });
    await page.click('.modal-menu [data-focus="classic.level-"]');
    const r3 = await ev(() => (document.querySelector('.modal-menu .mn-resume') || {}).textContent || '');
    check('back to the first settings: Resume names the first board', r3.startsWith('Resume: ' + classicName), r3);
    await page.click('.modal-menu .mn-start');
    const s3 = await state(ev);
    check('Start new makes a new board even so', !s3.page && s3.n === n1 + 2 && s3.cur !== made.classic, JSON.stringify([s3.n, n1]));
    // A Race board, the same opponent and size: resumed.
    await ev(() => Lull.app.modes.play.openMenu('race'));
    const r4 = await ev(() => (document.querySelector('.modal-menu .mn-resume') || {}).textContent || '');
    check('Race: the same opponent and size offer the Race board, its tally as progress', /^Resume: .+ \(vs Steady \d+–\d+\)$/.test(r4), r4);
    await page.click('.modal-menu .nb-preset[data-w="8"]');
    check('another size: no Resume', !(await ev(() => !!document.querySelector('.modal-menu .mn-resume'))));
    await page.keyboard.press('Escape');

    // ---- Manage -------------------------------------------------------------------------------------------------------
    await page.click('#play-status .menu-btn');
    await page.click('.modal-menu .mn-manage');
    await page.waitForTimeout(100);
    const lib = await ev(() => {
      const side = (k) => { document.querySelector('.modal-lib .lib-side[data-side="' + k + '"]').click(); return [...document.querySelectorAll('.modal-lib .lib-row')].map((r) => r.dataset.id); };
      const B = Lull.app.store.state.boards, of = (id) => { const r = Lull.Library.find(B, id); return Lull.Library.side(id === B.cur ? Lull.app.modes.play.game.recipe : r.game.recipe); };
      const solo = side('solo'), multi = side('multi');
      return { menu: !!document.querySelector('.modal-menu'), tabs: [...document.querySelectorAll('.modal-lib .lib-side')].map((b) => b.textContent), solo: solo.every((id) => of(id) === 'solo'), multi: multi.every((id) => of(id) === 'multi'), n: [solo.length, multi.length, B.list.length], sel: document.querySelector('.modal-lib .lib-side[aria-selected="true"]').dataset.side };
    });
    check('Manage opens the library with Solo and Multiplayer tabs; Race and Battle boards under Multiplayer', !lib.menu && lib.tabs.join() === 'Solo,Multiplayer' && lib.solo && lib.multi && lib.n[1] === 2 && lib.n[0] + lib.n[1] === lib.n[2] && lib.sel === 'multi', JSON.stringify(lib));
    // Each tab has its retired boards: retire the Race board, it shows under Multiplayer ▸ Retired only.
    const ret = await ev((id) => {
      const m = Lull.app.modes.play, B = Lull.app.store.state.boards, rec = Lull.Library.find(B, id);
      Lull.Library.retire(Lull.app.store.state, id, id === B.cur ? m.game.toJSON() : rec.game, Date.now(), 'manual');
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      m.openLibrary('multi');
      document.querySelector('.modal-lib .lib-tabs [data-k="retired"]').click();
      const multi = [...document.querySelectorAll('.modal-lib .lib-row.retired')].map((r) => r.dataset.id);
      document.querySelector('.modal-lib .lib-side[data-side="solo"]').click();
      const solo = [...document.querySelectorAll('.modal-lib .lib-row.retired')].map((r) => r.dataset.id);
      return { multi, solo };
    }, made.race);
    check('a retired Race board is under Multiplayer ▸ Retired, not Solo', ret.multi.includes(made.race) && !ret.solo.includes(made.race), JSON.stringify(ret));
    await page.keyboard.press('Escape');
    check('Esc closes the library: back to the board', !(await ev(() => Lull.UI.modalOpen())));

    // ---- Custom and Back ----------------------------------------------------------------------------------------------
    await page.click('#play-status .menu-btn');
    await page.click('.modal-menu .mn-solo');
    const solo = await ev(() => [...document.querySelectorAll('.modal-menu .mn-tiles .mn-tile')].map((b) => b.querySelector('b').textContent));
    const backX = await ev(() => { const hd = document.querySelector('.modal-menu header'), b = hd.querySelector('.mn-back'), x = hd.querySelector('.x'); return !b.hidden && b.getBoundingClientRect().right < x.getBoundingClientRect().left; });
    check('Solo: a tile a mode, Relaxed, Classic, Descent, Mural, then Custom; Back and the X at the top', solo.join() === 'Relaxed,Classic,Descent,Mural,Custom' && backX, solo.join());
    await page.click('.modal-menu .mn-back');
    check('Back returns to the menu, focus on the area it left', await ev(() => document.querySelector('.modal-menu').dataset.page === 'home' && document.activeElement.classList.contains('mn-solo')));
    await page.click('.modal-menu .mn-multi');
    const multi = await ev(() => [...document.querySelectorAll('.modal-menu .mn-tiles .mn-tile')].map((b) => b.querySelector('b').textContent));
    check('Multiplayer: Race and Battle', multi.join() === 'Race,Battle', multi.join());
    await page.keyboard.press('Escape');
    check('Esc closes it from a page too', !(await menuOpen(ev)));
    await page.click('#play-status .menu-btn');
    await page.click('.modal-menu .mn-solo');
    await page.click('.modal-menu [data-mode="custom"]');
    await page.waitForTimeout(100);
    const nb = await ev(() => ({ menu: !!document.querySelector('.modal-menu'), nb: !!document.querySelector('.modal-newboard'), tabs: document.querySelectorAll('.modal-newboard .nb-tab').length, steppers: document.querySelectorAll('.modal-newboard .nb-stepper').length }));
    check('Custom opens the full New board window (size, shapes, modifiers, mode)', !nb.menu && nb.nb && nb.tabs === 4 && nb.steppers === 2, JSON.stringify(nb));
    await page.keyboard.press('Escape');
    check('no errors in the menu', errors.length === 0, errors.slice(0, 3).join(' | '));
    await D.ctx.close();
  }

  // ---- the four window sizes, both themes: fit, 44 px by touch, frames ---------------------------------------------------
  const SIZES = [[520, 760, false], [400, 700, false], [390, 844, true], [320, 568, true]];
  for (const theme of ['light', 'dark']) for (const [w, hh, touch] of SIZES) {
    const D = await open(w, hh, theme, touch);
    const { page, ev, press, tag } = D;
    await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
    await ev(() => {
      const m = Lull.app.modes.play, R = Lull.Recipe;
      m.game.drop();
      m.shelveAndNew({ w: 10, h: 20 }, R.normalize({ mode: 'classic' })); m.game.drop();
      m.shelveAndNew({ w: 10, h: 10 }, R.normalize({ mode: 'race' })); m.game.s.pieces = 1;
      m.shelveAndNew({ w: 10, h: 20 }, R.normalize({ shapes: { preset: 'tiny' } })); m.game.drop();
      m.persist();
    });
    const fits = async (what) => {
      const f = await ev((touchy) => {
        const md = document.querySelector('#modal-root .modal:last-of-type') || document.querySelector('.modal'), r = md.getBoundingClientRect();
        const btns = [...md.querySelectorAll('button')].filter((b) => b.offsetParent && b.getClientRects().length && !b.closest('.lib-acts'));
        const small = touchy ? btns.map((b) => { const q = b.getBoundingClientRect(); return [b.className || b.textContent, Math.round(Math.min(q.width, q.height))]; }).filter(([, v]) => v < 43.5) : [];
        const side = [...md.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)).map((e) => e.className);
        return { inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, page: document.documentElement.scrollWidth <= innerWidth, small, side, cut: md.scrollWidth > md.clientWidth + 1 };
      }, touch);
      check(tag + ' ' + what + ': inside the window, nothing sideways' + (touch ? ', every target 44 px or more' : ''), f.inside && f.page && !f.side.length && !f.cut && !f.small.length, JSON.stringify(f));
    };
    const name = (k) => 'menu-' + k + '-' + w + 'x' + hh + '-' + theme;
    await press('#play-status .menu-btn');
    await page.waitForTimeout(300);
    const look = await ev(() => { const b = document.querySelector('.modal-menu .mn-tile b'), lum = (c) => { const [r, g, bb] = c.match(/[\d.]+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255; }; return { fg: lum(getComputedStyle(b).color), theme: document.documentElement.dataset.theme }; });
    check(tag + ': the menu follows the theme', look.theme === theme && (theme === 'dark' ? look.fg > 0.6 : look.fg < 0.4), JSON.stringify(look));
    await fits('menu');
    const home = await ev(() => {
      const md = document.querySelector('.modal-menu'), bd = md.querySelector('.body'), s = md.querySelector('.mn-solo').getBoundingClientRect(), m = md.querySelector('.mn-multi').getBoundingClientRect(), g = md.querySelector('.mn-manage').getBoundingClientRect();
      return { still: bd.scrollHeight <= bd.clientHeight + 1, side: Math.abs(s.top - m.top) < 1 && s.right <= m.left && Math.abs(s.height - m.height) < 1, tall: s.height >= s.width * 0.95, under: g.top >= s.bottom && Math.abs((g.left + g.right) / 2 - (s.left + m.right) / 2) < 2, sz: [Math.round(s.width), Math.round(s.height)] };
    });
    check(tag + ': the home does not scroll; Solo and Multiplayer side by side, tall; Manage centred under them', home.still && home.side && home.tall && home.under, JSON.stringify(home));
    await D.shot(name('home'));
    await press('.modal-menu .mn-solo');
    await fits('Solo');
    await D.shot(name('solo'));
    await press('.modal-menu [data-mode="plain"]');
    check(tag + ': Relaxed with Tiny shapes offers its board', await ev(() => Lull.app.modes.play.menuHandle.menu.setup.recipe.shapes.preset === 'tiny' ? true : (document.querySelector('.modal-menu .nb-chip[data-value="tiny"]').click(), true)));
    await page.waitForTimeout(60);
    const res = await ev(() => (document.querySelector('.modal-menu .mn-resume') || {}).textContent || '');
    check(tag + ': a setup with Resume', /^Resume: /.test(res), res);
    await fits('a setup with Resume');
    await D.shot(name('setup-resume'));
    await press('.modal-menu .mn-back');
    await press('.modal-menu [data-mode="classic"]');
    await fits('Classic setup');
    await D.shot(name('setup-classic'));
    await press('.modal-menu .mn-back');
    await press('.modal-menu .mn-back');
    await press('.modal-menu .mn-multi');
    await fits('Multiplayer');
    await D.shot(name('multi'));
    await press('.modal-menu [data-mode="battle"]');
    await fits('Battle setup');
    await D.shot(name('setup-battle'));
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    await press('#play-status .menu-btn');
    await press('.modal-menu .mn-manage');
    await page.waitForTimeout(300);
    await fits('the library');
    await D.shot(name('manage-solo'));
    await press('.modal-lib .lib-side[data-side="multi"]');
    await D.shot(name('manage-multi'));
    if (touch) {
      const t = await ev(() => [...document.querySelectorAll('.modal-lib .lib-side')].map((b) => Math.round(b.getBoundingClientRect().height)));
      check(tag + ': the library\'s Solo and Multiplayer tabs are 44 px', t.every((x) => x >= 44), t.join());
    }
    await D.ctx.close();
  }
  check('no errors at any size', errors.length === 0, errors.slice(0, 3).join(' | '));
};
