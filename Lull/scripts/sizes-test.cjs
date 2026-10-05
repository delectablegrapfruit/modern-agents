// Board sizes in Free Play (js/library.js): the Custom window (Width and Height steppers that clamp to 4 × 8 …
// 20 × 40, presets, keyboard and touch), a Custom game at the chosen size (never kept), New game keeping it, the size on
// the full board's card, pay by width, every item at the extreme sizes, the board fitting and centred at 520 × 760,
// 400 × 700 and on phones, light and dark, with reduced motion, and the Custom page's presets fitting there too.
// Run by browser-test.cjs: require('./sizes-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

const EXTREMES = [[4, 8], [4, 40], [20, 8], [20, 40], [10, 20]];

module.exports = async function sizesTests({ browser, check, PAGE, OUT }) {
  const errors = [];
  const open = async (o) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: 'light' }, o));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(500);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    await ev((theme) => {
      Lull.app.settings.theme = theme; Lull.app.applySettings();
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, (o && o.colorScheme) || 'light');
    return { ctx, page, ev, shot };
  };
  /** The board in play made a given size (a new game in the same record), with a little stack to look at. */
  const boardAt = (ev, [w, h], stack) => ev(([w, h, stack]) => {
    const m = Lull.app.modes.play;
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    m.hideCard();
    document.getElementById('toasts').replaceChildren();
    m.setGame(new Lull.Game({ w, h, seed: 5, previewCount: m.settings.preview }));
    const g = m.game;
    if (stack) {
      const cols = [8, 1, 3, 5, 2, 6, 4, 7];
      for (let y = 0; y < Math.min(3, h - 5); y++) for (let x = 0; x < w; x++) if ((x + y) % 5 !== 2) g.board.set(x, y, cols[(x + y * 3) % cols.length]);
      g.hold = { id: 'T', rot: 0 };
    }
    m.view.dirty = true; m.view.resize(); m.view.layout(); m.view.render(performance.now());
  }, [w, h, !!stack]);
  /** Where the board sits in its canvas: inside, centred, cell size, trays wide enough for their labels. */
  const fitOf = (ev) => ev(() => {
    const v = Lull.app.modes.play.view, L = v.lay, W = v.cssW, H = v.cssH, p = L.plate;
    return {
      s: L.s, ts: L.ts, W, H, plate: [p.x, p.y, p.w, p.h],
      inside: p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.h <= H,
      centred: Math.abs(p.x + p.w / 2 - W / 2) <= 1 && Math.abs(p.y + p.h / 2 - H / 2) <= 1,
      trays: L.hold.w >= 36 && L.next.w >= 36 && L.hold.x >= p.x && L.next.x + L.next.w <= p.x + p.w + 0.5 && L.next.y + L.next.h <= p.y + p.h + 0.5,
      wellIn: L.board.x >= p.x && L.board.x + L.board.w <= p.x + p.w && L.board.y >= p.y && L.board.y + L.board.h <= p.y + p.h,
      noOverlap: L.wide ? L.hold.x + L.hold.w <= L.board.x && L.board.x + L.board.w <= L.next.x : L.hold.y + L.hold.h <= L.board.y,
      page: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
    };
  });

  /** A control hint shown on the board in play: inside the well, or clear of its walls (and inside the canvas). */
  const pillOf = (ev, input) => ev((input) => new Promise((done) => {
    const m = Lull.app.modes.play, c = Lull.app.hints;
    m.lastInput = input || 'key';
    c.show(m, { id: 'drop' }, performance.now());
    setTimeout(() => {
      const el = document.querySelector('.lhint'), L = m.view.lay, B = L.board, wl = L.well;
      if (!el || !el.isConnected) { c.hide(); done({ shown: false }); return; }
      const r = el.getBoundingClientRect(), cv = m.canvas.getBoundingClientRect();
      const x0 = r.left - cv.left, x1 = r.right - cv.left, y0 = r.top - cv.top, y1 = r.bottom - cv.top;
      const inWell = x0 >= B.x - 0.5 && x1 <= B.x + B.w + 0.5 && y0 >= B.y && y1 <= B.y + B.h;
      const clear = x1 <= wl.x || x0 >= wl.x + wl.w || y1 <= wl.y || y0 >= wl.y + wl.h;
      const inCanvas = r.left >= cv.left - 0.5 && r.right <= cv.right + 0.5 && r.top >= cv.top - 0.5 && r.bottom <= cv.bottom + 0.5;
      done({ shown: true, ok: (inWell || clear) && inCanvas, inWell, clear, inCanvas, pill: [x0, y0, x1, y1].map(Math.round), well: [wl.x, wl.y, wl.x + wl.w, wl.y + wl.h], text: el.textContent });
    }, 450);
  }), input);
  /** SPOTLESS drawn over the board in play: every line of it within the well (walls included). */
  const wordsOf = (ev) => ev(() => {
    const m = Lull.app.modes.play, v = m.view, L = v.lay, ctx = v.ctx, seen = [];
    v.fx.texts = [];
    v.fx.text('SPOTLESS', L.board.x + L.board.w / 2, L.board.y + L.board.h * 0.42, '#ffe28a', 22);
    const orig = ctx.fillText;
    ctx.fillText = function (str, x) { seen.push({ str, x, w: ctx.measureText(str).width, font: ctx.font }); return orig.apply(this, arguments); };
    try { v.dirty = true; v.render(performance.now()); } finally { delete ctx.fillText; if (ctx.fillText !== orig) ctx.fillText = orig; }
    const wl = L.well, t = seen.filter((o) => /SPOTLESS/.test(o.str));
    return { ok: t.length > 0 && t.every((o) => o.x - o.w / 2 >= wl.x - 1 && o.x + o.w / 2 <= wl.x + wl.w + 1), lines: t.map((o) => o.str + ' ' + Math.round(o.w) + ' (' + o.font.split(' ')[1] + ')'), well: wl.w };
  });
  /** The Custom page with two presets (long names): inside the window, nothing sideways, each row's actions in view. */
  const presetsOf = (ev) => ev(() => {
    const st = Lull.app.store.state, B = st.boards;
    B.presets = [];
    Lull.Library.addPreset(B, 'W'.repeat(24), Lull.Recipe.normalize({ shapes: { preset: 'tiny' }, mods: { mirror: true } }), { w: 20, h: 40 }, 1);
    Lull.Library.addPreset(B, 'Small', Lull.Recipe.normalize({ mode: 'classic' }), { w: 6, h: 12 }, 2);
    Lull.app.modes.play.openMenu('custom');
    const md = document.querySelector('.modal-menu'), rows = [...md.querySelectorAll('.mn-preset')];
    return { n: rows.length, page: document.documentElement.scrollWidth <= innerWidth, side: md.querySelector('.body').scrollWidth <= md.querySelector('.body').clientWidth + 1,
      acts: rows.every((r) => { const a = r.querySelector('.mn-pacts').getBoundingClientRect(), b = r.getBoundingClientRect(); return a.right <= b.right + 0.5 && a.left >= b.left; }) };
  });

  // ---- the Custom window, on a desktop (light) ----------------------------------------------------------------------
  console.log('board sizes');
  const D = await open();
  let { page, ev, shot } = D;
  /** What is kept: the mode in play, every mode's game, the save's game in play, the window's last size. */
  const keptNow = () => ev(() => { const st = Lull.app.store.state, B = st.boards; Lull.app.saveNow(); const sv = JSON.parse(localStorage.getItem('lull.save.v1')); return JSON.stringify({ cur: B.cur, games: Object.keys(B.games), free: sv.free && [sv.free.w, sv.free.h, sv.free.s.pieces], size: B.size }); });
  await ev(() => { const g = Lull.app.modes.play.game; g.drop(); g.drop(); });
  const first = await ev(() => ({ cur: Lull.app.store.state.boards.cur, w: Lull.app.modes.play.game.w, h: Lull.app.modes.play.game.h }));
  await page.click('#play-status .menu-btn');
  await page.click('.modal-menu .mn-solo');
  await page.click('.modal-menu [data-mode="custom"]');
  await page.click('.modal-menu .mn-newcustom');
  await page.waitForTimeout(150);
  const dlg = await ev(() => {
    const m = document.querySelector('.modal-newboard'), vals = [...m.querySelectorAll('.nb-val')].map((v) => +v.textContent);
    return { open: !!m, title: m.querySelector('header .ttl').textContent, vals, focus: document.activeElement && document.activeElement.getAttribute('aria-label'),
      labels: [...m.querySelectorAll('.nb-label')].map((l) => l.textContent), pressed: [...m.querySelectorAll('.nb-preset[aria-pressed="true"]')].map((b) => b.textContent),
      buttons: [...m.querySelectorAll('footer .btn')].map((b) => b.textContent), preview: (() => { const c = m.querySelector('.nb-preview'); return [c.width, c.height]; })(),
      text: m.textContent };
  });
  check('New custom game opens the Custom window: Width and Height, Standard to begin with, the width field focused', dlg.open && dlg.title === 'Custom' && dlg.vals.join() === '10,20' && dlg.focus === 'Width' && dlg.labels.join() === 'Width,Height' && /Standard/.test(dlg.pressed[0] || '') && dlg.buttons.join() === 'Cancel,Save preset,Start', JSON.stringify(dlg));
  check('the window draws the empty well at its size (10 by 20, on whole pixels)', dlg.preview[0] * 2 === dlg.preview[1] && dlg.preview[0] % 10 === 0, JSON.stringify(dlg.preview));
  check('the window is plain: no emoji', !/\p{Extended_Pictographic}/u.test(dlg.text), dlg.text);
  // The steppers clamp: − to the floor (and then off), + to the ceiling (and then off); keys on the value.
  for (let i = 0; i < 9; i++) await page.click('.modal-newboard .nb-step[aria-label="Fewer columns"]', { force: true }).catch(() => {});
  const low = await ev(() => ({ w: +document.querySelector('.nb-val[data-k="w"]').textContent, off: document.querySelector('.nb-step[aria-label="Fewer columns"]').getAttribute('aria-disabled'), now: document.querySelector('.nb-val[data-k="w"]').getAttribute('aria-valuenow'), said: document.querySelector('.modal-newboard .nb-live').textContent, live: document.querySelector('.modal-newboard .nb-live').getAttribute('aria-live') }));
  check('Width stops at 4, and − turns off there (still focusable); the new width is read out', low.w === 4 && low.off === 'true' && low.now === '4' && low.said === 'Width 4' && low.live === 'polite', JSON.stringify(low));
  await page.focus('.modal-newboard .nb-val[data-k="w"]');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  const hiW = await ev(() => ({ w: +document.querySelector('.nb-val[data-k="w"]').textContent, off: document.querySelector('.nb-step[aria-label="More columns"]').getAttribute('aria-disabled') === 'true' }));
  await page.keyboard.press('ArrowUp');
  check('keys: ↓ at 4 stays 4, End is 20, ↑ at 20 stays 20 (+ off there)', hiW.w === 20 && hiW.off && (await ev(() => +document.querySelector('.nb-val[data-k="w"]').textContent)) === 20, JSON.stringify(hiW));
  await page.focus('.modal-newboard .nb-val[data-k="h"]');
  for (let i = 0; i < 6; i++) await page.keyboard.press('PageUp');
  const hiH = await ev(() => +document.querySelector('.nb-val[data-k="h"]').textContent);
  await page.keyboard.press('Home');
  const loH = await ev(() => +document.querySelector('.nb-val[data-k="h"]').textContent);
  check('Height: Page Up steps by 5 and stops at 40; Home is 8', hiH === 40 && loH === 8, [hiH, loH].join());
  await page.click('.modal-newboard .nb-preset[data-w="8"][data-h="30"]');
  const tall = await ev(() => ({ vals: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join(), pressed: [...document.querySelectorAll('.nb-preset[aria-pressed="true"]')].map((b) => b.dataset.w + 'x' + b.dataset.h) }));
  check('a preset sets both numbers and shows pressed', tall.vals === '8,30' && tall.pressed.join() === '8x30', JSON.stringify(tall));
  const saidTall = await ev(() => document.querySelector('.modal-newboard .nb-live').textContent);
  check('a preset\'s size is read out', saidTall === '8 × 30', saidTall);
  // Enter on a preset presses it (not Start); Enter on a value is Start.
  await page.focus('.modal-newboard .nb-preset[data-w="16"]');
  await page.keyboard.press('Enter');
  check('Enter on a preset picks it and leaves the window open', await ev(() => !!document.querySelector('.modal-newboard') && [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join() === '16,16'));
  await page.focus('.modal-newboard .nb-val[data-k="w"]');
  await page.keyboard.press('Home');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
  await page.focus('.modal-newboard .nb-val[data-k="h"]');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  await shot('dims-01-dialog-desktop-light');
  const pv = await ev(() => { const c = document.querySelector('.nb-preview'); return [c.width, c.height]; });
  check('the preview follows the size (12 by 24)', pv[0] * 2 === pv[1] && pv[0] % 12 === 0, JSON.stringify(pv));
  const kept0 = await keptNow();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const made = await ev(() => { const m = Lull.app.modes.play, B = Lull.app.store.state.boards; return { w: m.game.w, h: m.game.h, size: B.size, cur: B.cur, custom: !!m.custom, modal: Lull.UI.modalOpen() }; });
  check('Enter is Start: a Custom game at 12 × 24, the window and the menu closed; the size is remembered', made.w === 12 && made.h === 24 && made.size.w === 12 && made.size.h === 24 && made.cur === first.cur && made.custom && !made.modal, JSON.stringify(made));
  const kept1 = await keptNow();
  check('a Custom game is kept nowhere: the save still holds the Relaxed game as it was', JSON.parse(kept1).free.join() === JSON.parse(kept0).free.join() && JSON.parse(kept1).games.join() === JSON.parse(kept0).games.join(), kept0 + ' vs ' + kept1);
  // Played on, then another: the window opens on the size last chosen; Start takes the first one's place.
  await ev(() => { const g = Lull.app.modes.play.game; for (let i = 0; i < 4; i++) g.drop(); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(120);
  const again = await ev(() => [...document.querySelectorAll('.modal-newboard .nb-val')].map((v) => +v.textContent).join());
  check('the Custom window opens on the size last chosen', again === '12,24', again);
  await page.focus('.modal-newboard .nb-val[data-k="w"]');
  await page.keyboard.press('Home');
  await page.focus('.modal-newboard .nb-val[data-k="h"]');
  await page.keyboard.press('Home');
  await page.click('.modal-newboard footer .btn.primary');
  await page.waitForTimeout(150);
  const made2 = await ev(() => { const m = Lull.app.modes.play; return { w: m.game.w, h: m.game.h, pieces: m.game.s.pieces, custom: !!m.custom, aside: m.custom && [m.custom.saved.w, m.custom.saved.h] }; });
  check('Start from a Custom game: a new 4 × 8 one in its place; the Relaxed game still set aside, as it was', made2.w === 4 && made2.h === 8 && made2.pieces === 0 && made2.custom && made2.aside.join() === first.w + ',' + first.h, JSON.stringify(made2));
  check('still kept nowhere', JSON.parse(await keptNow()).free.join() === JSON.parse(kept0).free.join());
  // Cancel changes nothing.
  await ev(() => Lull.app.modes.play.openNewBoard());
  await page.focus('.modal-newboard .nb-val[data-k="w"]');
  await page.keyboard.press('End');
  await page.click('.modal-newboard footer .btn:not(.primary):not(.nb-save)');
  check('Cancel changes nothing', await ev(() => { const m = Lull.app.modes.play; return m.game.w === 4 && Lull.app.store.state.boards.size.w === 4 && !document.querySelector('.modal-newboard'); }));
  // Keyboard: Enter held on + to the limit keeps focus on + (and starts nothing); Enter on Cancel or Close is that button.
  const gameNow = () => ev(() => { const m = Lull.app.modes.play; return JSON.stringify({ g: [m.game.w, m.game.h], seed: JSON.stringify(m.game.rng.state()), size: Lull.app.store.state.boards.size }); });
  const kb0 = await gameNow();
  await ev(() => Lull.app.modes.play.openNewBoard());
  await page.waitForTimeout(120);
  await page.focus('.modal-newboard .nb-step[aria-label="More columns"]');
  for (let i = 0; i < 20; i++) await page.keyboard.press('Enter');
  const held = await ev(() => ({ w: +document.querySelector('.nb-val[data-k="w"]').textContent, focus: document.activeElement && document.activeElement.getAttribute('aria-label'), open: !!document.querySelector('.modal-newboard'), said: document.querySelector('.modal-newboard .nb-live').textContent }));
  check('Enter held on + stops at 20 with focus still on +, the window open, no game started', held.w === 20 && held.focus === 'More columns' && held.open && held.said === 'Width 20' && (await gameNow()) === kb0, JSON.stringify(held));
  await page.focus('.modal-newboard .nb-step[aria-label="Fewer rows"]');
  for (let i = 0; i < 16; i++) await page.keyboard.press('Space');
  const spaced = await ev(() => ({ h: +document.querySelector('.nb-val[data-k="h"]').textContent, focus: document.activeElement && document.activeElement.getAttribute('aria-label') }));
  check('Space on − to 8 keeps focus on −', spaced.h === 8 && spaced.focus === 'Fewer rows', JSON.stringify(spaced));
  await page.focus('.modal-newboard footer .btn:not(.primary):not(.nb-save)');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  check('Enter on Cancel cancels', !(await ev(() => !!document.querySelector('.modal-newboard'))) && (await gameNow()) === kb0, await gameNow());
  await ev(() => Lull.app.modes.play.openNewBoard());
  await page.waitForTimeout(120);
  await page.focus('.modal-newboard .nb-val[data-k="w"]');
  await page.keyboard.press('End');
  await page.focus('.modal-newboard header .x');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  check('Enter on Close closes', !(await ev(() => !!document.querySelector('.modal-newboard'))) && (await gameNow()) === kb0, await gameNow());
  // A full board's card shows its size; its New game is one of the same size, without asking.
  const renewed = await ev(() => {
    const m = Lull.app.modes.play, g = m.game;
    let guard = 0;
    while (!g.over && guard++ < 200) { g.move(guard % 3 - 1); g.drop(); }
    const card = document.querySelector('#play-overlay .card');
    const text = card ? card.textContent : '';
    const sum = card && card.querySelector('.board-sum');
    document.querySelector('#play-overlay .btn.primary').click();
    return { over: g.over, card: text, fits: !!sum && sum.scrollWidth <= sum.clientWidth + 1, w: m.game.w, h: m.game.h, pieces: m.game.s.pieces, custom: !!m.custom, dialog: !!document.querySelector('.modal-newboard') };
  });
  check('a full board\'s card shows its size (a Size tile); New game is a new one of the same size, without asking (still a Custom game)', renewed.over && /4 × 8Size/.test(renewed.card) && renewed.fits && renewed.w === 4 && renewed.h === 8 && renewed.pieces === 0 && renewed.custom && !renewed.dialog, JSON.stringify(renewed));
  await shot('dims-03-renewed');
  // Across a reload: the Custom game is gone; the Relaxed game and the window's last size are as they were.
  await page.reload();
  await page.waitForTimeout(400);
  const back = await ev(() => { const m = Lull.app.modes.play, B = Lull.app.store.state.boards; return { g: [m.game.w, m.game.h], pieces: m.game.s.pieces, custom: !!m.custom, size: B.size, cur: B.cur }; });
  check('after a reload the Custom game is gone: the Relaxed game as it was, the last size remembered', !back.custom && back.g.join() === first.w + ',' + first.h && back.pieces === JSON.parse(kept0).free[2] && back.size.w === 4 && back.size.h === 8 && back.cur === 'plain', JSON.stringify(back));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });

  // ---- pay by width: the same clear pays w/10 of Standard ---------------------------------------------------------------
  const pay = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store.state, out = {};
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    for (const w of [5, 10, 20]) {
      m.setGame(new Lull.Game({ w, h: 20, seed: 1 }));
      const g = m.game;
      for (let y = 0; y < 4; y++) for (let x = 1; x < w; x++) g.board.set(x, y, 8);
      g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
      const l0 = st.lines, F0 = st.stats.free.lines, ach0 = st.stats.lines.achievements || 0;
      const r = g.drop();
      out[w] = { banked: r.banked, wallet: Math.round((st.lines - l0 - ((st.stats.lines.achievements || 0) - ach0)) * 100) / 100, F: Math.round((st.stats.free.lines - F0) * 100) / 100, lines: g.s.lines, status: document.getElementById('play-status').textContent };
    }
    out.shown = document.getElementById('wallet-n').textContent;
    out.whole = Number.isInteger(+out.shown.replace(/,/g, ''));
    return out;
  });
  check('a quad pays by width: 5 wide 2.5, Standard 5, 20 wide 8.25 (its bonus a quarter of a Standard line, (10/w)²; the wallet and lifetime lines too); the board counts its own 4', pay[5].banked === 2.5 && pay[10].banked === 5 && pay[20].banked === 8.25 && pay[5].wallet >= 2.5 && pay[5].F === 2 && pay[20].F === 8 && pay[5].lines === 4 && /Lines 4/.test(pay[5].status) && pay.whole, JSON.stringify(pay));

  // ---- every item at the extreme sizes: nothing throws, nothing out of the board ------------------------------------------
  const items = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store, bad = [];
    const sizes = [[4, 8], [4, 40], [20, 8], [20, 40]];
    for (const [w, h] of sizes) {
      m.setGame(new Lull.Game({ w, h, seed: w * h }));
      for (const id of Lull.ITEM_ORDER) {
        while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
        m.hideCard();
        if (m.game.over) m.setGame(new Lull.Game({ w, h, seed: w + h }));
        const g = m.game;
        for (let y = 0; y < Math.min(3, h - 6); y++) for (let x = 0; x < w; x++) if ((x * 7 + y) % 4) g.board.set(x, y, 3);
        st.state.inventory[id] = (st.state.inventory[id] || 0) + 1;
        try {
          m.useItem(id);
          // The windows some items open: the first choice.
          const pick = document.querySelector('.modal .pick-card, .modal .order-grid button, .modal .slip button');
          if (pick) pick.click();
          while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
          m.armed = null;
          const p = g.piece;
          if (p && !g.over) for (const [x, y] of g.cellsOf(p)) if (x < 0 || x >= w || y < 0 || y >= h || g.board.get(x, y)) bad.push(w + 'x' + h + ' ' + id + ' piece at ' + x + ',' + y);
          if (g.board.cells.length !== w * h) bad.push(w + 'x' + h + ' ' + id + ' cells');
          if (g.piece) g.drop();
          m.view.render(performance.now() + 500);
        } catch (e) { bad.push(w + 'x' + h + ' ' + id + ': ' + e.message); }
      }
    }
    document.getElementById('toasts').replaceChildren();
    return bad;
  });
  check('every item at 4 × 8, 4 × 40, 20 × 8 and 20 × 40: no error, no piece out of the board or in a block', items.length === 0, items.slice(0, 5).join('; '));

  // ---- the board fits and stays centred -------------------------------------------------------------------------------
  for (const [W, H] of [[520, 760], [400, 700]]) {
    await page.setViewportSize({ width: W, height: H });
    await page.waitForTimeout(150);
    for (const size of EXTREMES) {
      await boardAt(ev, size, true);
      await page.waitForTimeout(60);
      const f = await fitOf(ev);
      const ok = f.inside && f.centred && f.trays && f.wellIn && f.noOverlap && f.page && f.s >= 6 && (size[0] > 4 || size[1] > 8 || f.s <= 40);
      check(W + '×' + H + ' ' + size.join(' × ') + ': the board fits, centred, trays beside it', ok, JSON.stringify(f));
      await shot('dims-10-' + W + 'x' + H + '-' + size.join('x') + '-light');
      const pl = await pillOf(ev), wd = await wordsOf(ev);
      check(W + '×' + H + ' ' + size.join(' × ') + ': a control hint is in the well or clear of its walls; SPOTLESS fits the well', pl.shown && pl.ok && wd.ok, JSON.stringify({ pl, wd }));
      if (size[0] === 4) await shot('dims-13-' + W + 'x' + H + '-' + size.join('x') + '-hint-words');
      await ev(() => { Lull.app.hints.hide(); Lull.app.modes.play.view.fx.texts = []; });
    }
    // The Custom page's presets fit: names, rules and sizes, each row's actions in view.
    await page.waitForTimeout(150);
    const pr = await presetsOf(ev);
    check(W + '×' + H + ' the Custom page lists its presets inside the window, nothing sideways', pr.n === 2 && pr.page && pr.side && pr.acts, JSON.stringify(pr));
    await shot('dims-14-' + W + 'x' + H + '-presets');
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  }
  // Standard is exactly as before; a small board is not a few giant blocks.
  await page.setViewportSize({ width: 520, height: 760 });
  await page.waitForTimeout(100);
  await boardAt(ev, [10, 20]);
  const std = await fitOf(ev);
  await boardAt(ev, [4, 8]);
  const small = await fitOf(ev);
  check('a 4 × 8 board\'s cells are at most 1.4 times a Standard board\'s', small.s <= Math.floor(std.s * 1.4) && small.s > std.s, JSON.stringify([std.s, small.s]));
  // Dark and reduced motion, on the desktop.
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await ev(() => { Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); });
  for (const size of [[4, 40], [20, 8]]) {
    await boardAt(ev, size, true);
    await page.waitForTimeout(80);
    await shot('dims-11-520x760-' + size.join('x') + '-dark-reduced');
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await D.ctx.close();

  // ---- a phone (dark, touch) ------------------------------------------------------------------------------------------
  const P = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  ({ page, ev, shot } = P);
  const tapEl = async (sel) => { const b = await page.$(sel); const r = await b.boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(120); };
  await ev(() => { const g = Lull.app.modes.play.game; g.drop(); g.drop(); });
  await tapEl('#play-status .menu-btn');
  await tapEl('.modal-menu .mn-solo');
  await tapEl('.modal-menu [data-mode="custom"]');
  await tapEl('.modal-menu .mn-newcustom');
  await page.waitForTimeout(400); // the window has finished opening (it grows in)
  const targets = await ev(() => [...document.querySelectorAll('.modal-newboard .nb-step, .modal-newboard .nb-preset, .modal-newboard footer .btn')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  check('by touch: the steppers, presets and buttons are 44 px or more', targets.length >= 10 && targets.every((x) => x >= 43.5), JSON.stringify(targets));
  const fitD = await ev(() => { const m = document.querySelector('.modal-newboard'), r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && m.querySelector('.body').scrollWidth <= m.querySelector('.body').clientWidth + 1; });
  check('the window fits the phone', fitD);
  await tapEl('.modal-newboard .nb-step[aria-label="More columns"]');
  await tapEl('.modal-newboard .nb-step[aria-label="More columns"]');
  await tapEl('.modal-newboard .nb-step[aria-label="Fewer rows"]');
  const tv = await ev(() => [...document.querySelectorAll('.modal-newboard .nb-val')].map((v) => +v.textContent).join());
  check('taps step the size (12 × 19)', tv === '12,19', tv);
  await shot('dims-04-dialog-phone-dark');
  await tapEl('.modal-newboard .nb-preset[data-w="6"]');
  await tapEl('.modal-newboard footer .btn.primary');
  const pm = await ev(() => [Lull.app.modes.play.game.w, Lull.app.modes.play.game.h, !!document.querySelector('.modal-newboard')]);
  check('a preset and Start by touch: a 6 × 12 board', pm.join() === '6,12,false', pm.join());
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  for (const [W, H] of [[390, 844], [320, 640]]) {
    await page.setViewportSize({ width: W, height: H });
    await page.waitForTimeout(150);
    for (const size of EXTREMES) {
      await boardAt(ev, size, true);
      await page.waitForTimeout(60);
      const f = await fitOf(ev);
      check(W + '×' + H + ' touch ' + size.join(' × ') + ': the board fits, centred', f.inside && f.centred && f.trays && f.wellIn && f.noOverlap && f.page, JSON.stringify(f));
      if (W === 390) await shot('dims-12-390x844-' + size.join('x') + '-touch-dark');
      const pl = await pillOf(ev, 'touch'), wd = await wordsOf(ev);
      check(W + '×' + H + ' touch ' + size.join(' × ') + ': a control hint is in the well or clear of its walls; SPOTLESS fits the well', pl.shown && pl.ok && wd.ok, JSON.stringify({ pl, wd }));
      if (size[0] === 4) await shot('dims-13-' + W + 'x' + H + '-' + size.join('x') + '-hint-words');
      await ev(() => { Lull.app.hints.hide(); Lull.app.modes.play.view.fx.texts = []; });
    }
    const pr = await presetsOf(ev);
    await page.waitForTimeout(300);
    check(W + '×' + H + ' touch: the Custom page lists its presets inside the window, nothing sideways', pr.n === 2 && pr.page && pr.side && pr.acts, JSON.stringify(pr));
    await shot('dims-14-' + W + 'x' + H + '-presets');
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  }
  // A drag of one step moves one cell on a board of tiny cells too (the step is clamped: js/touch.js).
  await page.setViewportSize({ width: 390, height: 844 });
  await boardAt(ev, [20, 40]);
  const step = await ev(() => { const v = Lull.app.modes.play.view; return { s: v.lay.s, step: Lull.Touch.stepFor(v.lay.s, Lull.app.settings.touchSens) }; });
  check('touch: a board of small cells still has a finger-sized drag step', step.step >= 12, JSON.stringify(step));
  await P.ctx.close();
  check('board sizes: no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};
