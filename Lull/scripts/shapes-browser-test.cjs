// Shapes in the browser (js/shapes.js, js/shapepicker.js): the Shapes chips of the New board window, Big raising the
// size and giving it back, the library row, Custom (its line, the Custom shapes window, a group's picker: three shapes
// picked and one drawn, and the board dealing only those), a reload keeping the queue, 12-block pieces in the trays of
// the smallest phone, and every window fitting 320 × 568 by touch. Screenshots (with an out dir): the Shapes panel at
// 320 × 568 and 520 × 760 in both themes, the Custom window, the picker and the Draw view at 320, a Frantic game, 12
// blocks in the trays at 320 × 568, and a Big board.
// Run by browser-test.cjs: require('./shapes-browser-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

module.exports = async function shapesBrowserTests({ browser, check, PAGE, OUT }) {
  console.log('shapes');
  const errors = [];
  const open = async (o) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: 'light' }, o));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(400);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev((theme) => {
      Lull.app.settings.theme = theme; Lull.app.applySettings();
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, (o && o.colorScheme) || 'light');
    const shot = async (name) => { if (OUT) { await page.waitForTimeout(120); await page.screenshot({ path: path.join(OUT, name + '.png') }); } };
    return { ctx, page, ev, shot };
  };
  // Opened, then given time for its entrance (a window pops in: measured mid-way, it is a little small).
  const settle = (page) => page.waitForTimeout(450);
  const openNB = async (ev, page) => { await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.hideCard(); Lull.app.modes.play.openNewBoard(); document.querySelector('.nb-tab[data-tab="shapes"]').click(); }); await settle(page); };
  const size = (ev) => ev(() => [...document.querySelectorAll('.modal-newboard .nb-val')].map((v) => +v.textContent).join('x'));
  /** A window's fit: inside the viewport, its footer shown, nothing wider than it, every target 44 px (touch). */
  const fitOf = (ev, sel, targets) => ev(([sel, targets]) => {
    const m = document.querySelector(sel), r = m.getBoundingClientRect(), f = m.querySelector('footer').getBoundingClientRect(), body = m.querySelector('.body');
    const small = [...m.querySelectorAll(targets)].filter((b) => b.offsetParent).map((b) => { const q = b.getBoundingClientRect(); return [b.className + ' ' + b.textContent.slice(0, 12), Math.round(q.width), Math.round(q.height)]; }).filter(([, w, h]) => Math.min(w, h) < 43.5);
    const wide = [...m.querySelectorAll('.body *')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.right > r.right + 0.5 || q.left < r.left - 0.5); }).map((e) => e.className).slice(0, 5);
    return { inside: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5, footer: f.bottom <= r.bottom + 0.5 && f.top >= r.top, noSide: body.scrollWidth <= body.clientWidth + 1, small, wide, w: Math.round(r.width), h: Math.round(r.height) };
  }, [sel, targets]);

  // ---- 520 × 760: the chips, Big raising the size, a Big board and its library row ------------------------------------
  {
    const { ctx, page, ev, shot } = await open();
    await openNB(ev, page);
    const chips = await ev(() => [...document.querySelectorAll('.modal-newboard .nb-chip')].map((b) => b.dataset.value + ':' + b.querySelector('.nm').textContent + ':' + !!b.querySelector('canvas')));
    check('the Shapes chips: Normal, Tiny, Frantic, Pentominoes, Big, Custom, each with a sample', chips.join() === 'normal:Normal:true,tiny:Tiny:true,frantic:Frantic:true,pentominoes:Pentominoes:true,big:Big:true,custom:Custom:true', chips.join());
    await shot('shapes-01-panel-520x760-light');
    await ev(() => { document.querySelector('.nb-tab[data-tab="size"]').click(); });
    await page.focus('.modal-newboard .nb-val[data-k="w"]'); await page.keyboard.press('Home');
    await page.focus('.modal-newboard .nb-val[data-k="h"]'); await page.keyboard.press('Home');
    await ev(() => { document.querySelector('.nb-tab[data-tab="shapes"]').click(); document.querySelector('.nb-chip[data-value="big"]').click(); });
    const big = await ev(() => ({ size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x'), live: document.querySelector('.nb-live').textContent, min: document.querySelector('.nb-step[aria-label="Fewer columns"]').getAttribute('aria-disabled'), lim: Lull.Recipe.limits({ shapes: { preset: 'big' } }) }));
    await ev(() => document.querySelector('.nb-chip[data-value="normal"]').click());
    const back = await size(ev);
    const want = big.lim.w[0] + 'x' + big.lim.h[0];
    check('Big at 4 × 8 shows its smallest board (' + want + ', − off there) and says so; Normal again gives back 4 × 8', big.size === want && big.live === 'Big, ' + want.replace('x', ' × ') && big.min === 'true' && back === '4x8', JSON.stringify({ big, back }));
    await ev(() => document.querySelector('.nb-chip[data-value="big"]').click());
    await page.click('.modal-newboard footer .btn.primary');
    await page.waitForTimeout(200);
    const made = await ev(() => { const g = Lull.app.modes.play.game; Lull.app.modes.play.openLibrary(); const r = document.querySelector('.modal-lib .lib-row.current .sz'); return { size: g.w + 'x' + g.h, big: g.piece.type.big, text: r.textContent, title: r.title }; });
    check('a Big board: made at that size, dealing Big pieces; its library row reads "' + want.replace('x', ' × ') + ' · Big"', made.size === want && made.big && made.text === want.replace('x', ' × ') + ' · Big' && made.title === 'Big', JSON.stringify(made));
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const m = Lull.app.modes.play, g = m.game; for (let i = 0; i < 3; i++) { const p = g.piece, b = p.type.rotBounds[p.rot]; p.x = i === 1 ? g.w - 1 - b.maxX : i ? Math.floor((g.w - b.w) / 2) - b.minX : -b.minX; g.drop(); } m.view.dirty = true; });
    await page.waitForTimeout(700);
    await shot('shapes-02-big-' + want + '-520x760-light');
    // A Frantic game, a few pieces in.
    await openNB(ev, page);
    await ev(() => document.querySelector('.nb-chip[data-value="frantic"]').click());
    await ev(() => { document.querySelector('.nb-tab[data-tab="size"]').click(); document.querySelector('.nb-preset[data-w="10"][data-h="20"]').click(); });
    await page.click('.modal-newboard footer .btn.primary');
    await page.waitForTimeout(200);
    const frantic = await ev(() => {
      const m = Lull.app.modes.play, g = m.game, ids = new Set();
      // A plain player sets a dozen pieces (the flattest stack, fewest holes), so the board shows the mix as played.
      for (let i = 0; i < 12 && g.piece; i++) {
        ids.add(g.piece.type.id);
        const p = g.piece, t = p.type;
        let best = null;
        for (let r = 0; r < 4; r++) for (let x = -3; x < g.w + 3; x++) {
          let y = g.h - 1 - t.rotBounds[r].maxY;
          if (!g.fitsAt(p, r, x, y)) continue;
          while (g.fitsAt(p, r, x, y - 1)) y--;
          const b = g.board.clone();
          b.place(t.rots[r], x, y, 1);
          let holes = 0, top = 0, bump = 0, prev = -1;
          for (let cx = 0; cx < g.w; cx++) { let hgt = 0; for (let cy = g.h - 1; cy >= 0; cy--) if (b.get(cx, cy)) { hgt = cy + 1; break; } for (let cy = 0; cy < hgt; cy++) if (!b.get(cx, cy)) holes++; top = Math.max(top, hgt); if (prev >= 0) bump += Math.abs(hgt - prev); prev = hgt; }
          const v = holes * 6 + top * 1.5 + bump + y * 0.5 - b.fullRows().length * 8;
          if (!best || v < best.v) best = { v, r, x, y };
        }
        if (!best) break;
        p.rot = best.r; p.x = best.x; p.y = best.y;
        g.lock();
      }
      m.view.dirty = true;
      return { label: Lull.Recipe.label(g.recipe), sizes: [...ids].map((id) => Lull.Pieces.get(id).size), queue: g.queue.map((e) => e.id) };
    });
    await page.waitForTimeout(700);
    check('a Frantic board deals pieces of several sizes', frantic.label === 'Frantic' && new Set(frantic.sizes).size >= 2, JSON.stringify(frantic));
    await shot('shapes-03-frantic-520x760-light');
    await ctx.close();
  }

  // ---- 520 × 760 dark: the Shapes panel; Custom: three picked, one drawn, a board dealing only those; a reload --------
  {
    const { ctx, page, ev, shot } = await open({ colorScheme: 'dark' });
    await openNB(ev, page);
    await ev(() => document.querySelector('.nb-chip[data-value="custom"]').click());
    const line = await ev(() => ({ text: document.querySelector('.nb-custom span').textContent, edit: !!document.querySelector('.nb-custom .btn'), h: Math.round(document.querySelector('.nb-custom').getBoundingClientRect().height) }));
    check('Custom: its line says what it deals ("4 and 5 blocks") beside Edit, 44 px tall', line.text === '4 and 5 blocks' && line.edit && line.h === 44, JSON.stringify(line));
    await shot('shapes-04-panel-custom-520x760-dark');
    await page.click('.nb-custom .btn');
    await settle(page);
    const win = await ev(() => ({ title: document.querySelector('.modal-shapes .ttl').textContent, rows: document.querySelectorAll('.modal-shapes .sp-row').length, on: [...document.querySelectorAll('.modal-shapes .sp-check[aria-checked="true"] .nm')].map((e) => e.textContent) }));
    check('the Custom shapes window: 12 group rows, Clusters and Big; 4 and 5 blocks on', win.title === 'Custom shapes' && win.rows === 14 && win.on.join() === '4 blocks,5 blocks', JSON.stringify(win));
    // The last source on stays on.
    await ev(() => { document.querySelector('.sp-check[data-focus="g4"]').click(); document.querySelector('.sp-check[data-focus="g5"]').click(); });
    const last = await ev(() => ({ dis: document.querySelector('.sp-check[data-focus="g5"]').getAttribute('aria-disabled'), on: document.querySelector('.sp-check[data-focus="g5"]').getAttribute('aria-checked'), live: document.querySelector('.sp-live').textContent }));
    check('the last source that is on cannot be turned off (aria-disabled; a press says why)', last.dis === 'true' && last.on === 'true' && last.live === 'One source stays on', JSON.stringify(last));
    // 9 blocks: on, then its view (it opens on Shuffle); All, three shapes picked; Draw one more.
    await ev(() => document.querySelector('.sp-check[data-focus="g9"]').click());
    await ev(() => document.querySelector('.sp-check[data-focus="g5"]').click());
    await page.click('.sp-more[data-focus="m9"]');
    const g9 = await ev(() => ({ tab: document.querySelector('.sp-tabs [aria-pressed="true"]').textContent, tabs: [...document.querySelectorAll('.sp-tabs button')].map((b) => b.textContent).join(), status: document.querySelector('.sp-status span').textContent }));
    check('a group of 9 blocks opens on Shuffle (Shapes, Picked, Shuffle, Draw: no tab claims All), all 2,432 of it dealt', g9.tab === 'Shuffle' && g9.tabs === 'Shapes,Picked,Shuffle,Draw' && g9.status === 'All 2,432 shapes', JSON.stringify(g9));
    await ev(() => document.querySelector('.sp-tabs [data-focus="tab-all"]').click());
    await page.waitForTimeout(100);
    const paged = await ev(() => ({ n: document.querySelectorAll('.sp-shape').length, page: document.querySelector('.sp-pages span').textContent }));
    for (const i of [0, 4, 9]) await page.click('.sp-shape[data-i="' + i + '"]');
    await page.keyboard.press('PageDown');
    const pg2 = await ev(() => ({ page: document.querySelector('.sp-pages span').textContent, focus: document.activeElement.dataset.i }));
    const picked = await ev(() => ({ status: document.querySelector('.sp-status span').textContent, keys: Lull.Shapes.openCustom.last.sp.groups[9].picks.slice() }));
    // Picks made, the browse tab still reads Shapes (never All while the group deals its picks).
    const browse = await ev(() => ({ pressed: document.querySelector('.sp-tabs [aria-pressed="true"]').textContent, status: document.querySelector('.sp-status span').textContent }));
    check('picks made on the browse tab: it reads Shapes, the status "3 picked" (nothing says All)', browse.pressed === 'Shapes' && browse.status === '3 picked', JSON.stringify(browse));
    check('the picker: a page of 48 shapes (page 1 / 51), three picked; Page Down turns the page', paged.n === 48 && paged.page === '1 / 51' && picked.status === '3 picked' && picked.keys.length === 3 && pg2.page === '2 / 51', JSON.stringify({ paged, pg2, picked }));
    await ev(() => document.querySelector('.sp-tabs [data-focus="tab-draw"]').click());
    // Draw an L of nine: five across the bottom, four up the left.
    const cellsAt = await ev(() => { const g = document.querySelector('.sp-draw'), r = g.getBoundingClientRect(), n = 9, px = r.width / n; return { x: r.left, y: r.top, px }; });
    const at = (cx, cy) => [cellsAt.x + (cx + 0.5) * cellsAt.px, cellsAt.y + (cy + 0.5) * cellsAt.px];
    await page.mouse.move(...at(0, 8)); await page.mouse.down();
    for (let x = 1; x < 5; x++) await page.mouse.move(...at(x, 8));
    await page.mouse.up();
    let st = await ev(() => document.querySelector('.sp-draw-status').textContent);
    const five = st;
    await page.mouse.move(...at(0, 7)); await page.mouse.down();
    for (let y = 6; y >= 4; y--) await page.mouse.move(...at(0, y));
    await page.mouse.up();
    st = await ev(() => ({ status: document.querySelector('.sp-draw-status').textContent, add: !document.querySelector('.sp-draw-row .btn.primary').disabled }));
    await shot('shapes-05-draw-520x760-dark');
    await page.click('.sp-draw-row .btn.primary');
    const drew = await ev(() => ({ picks: Lull.Shapes.openCustom.last.sp.groups[9].picks.slice(), status: document.querySelector('.sp-draw-status').textContent, on: document.querySelectorAll('.sp-dc.on').length }));
    check('Draw: a drag paints ("5 of 9 blocks"), nine joined are "9 blocks"; Add picks it and the grid clears', five === '5 of 9 blocks' && st.status === '9 blocks' && st.add && drew.picks.length === 4 && drew.on === 0, JSON.stringify({ five, st, drew }));
    await page.keyboard.press('Escape');
    const esc = await ev(() => ({ open: !!document.querySelector('.modal-shapes'), kind: Lull.Shapes.openCustom.last.sp.view.kind, more: document.querySelector('.sp-more[data-focus="m9"]').textContent }));
    check('Escape in a group’s view goes back to the list (the window stays), the row says 4 picked', esc.open && esc.kind === 'list' && esc.more === '4 picked', JSON.stringify(esc));
    // 60 picks at most, off groups' picks too: 9 blocks (4 picked) off, 57 picked in 6 blocks; 9 blocks stays off.
    const capped = await ev(() => {
      const s = Lull.Shapes.openCustom.last.sp, P = Lull.Pieces;
      Object.assign(s.groups[6], { on: true, picks: Lull.Shapes.page(6, 0, 57).map((id) => P.canonKey(P.get(id).rots[0])) });
      s.draw('g6');
      const box = () => document.querySelector('.sp-check[data-focus="g9"]');
      box().click();
      const off = box().getAttribute('aria-checked');
      box().click();
      const r = { off, again: box().getAttribute('aria-checked'), live: document.querySelector('.sp-live').textContent, total: Object.values(s.groups).reduce((a, g) => a + (g.on ? g.picks.length : 0), 0) };
      Object.assign(s.groups[6], { on: false, picks: [] });
      s.draw('g9');
      box().click();
      r.back = box().getAttribute('aria-checked');
      r.picks9 = s.groups[9].picks.length;
      return r;
    });
    check('a group whose picks would take the picks past 60 stays off ("60 picks at most"); under 60 it turns on with its picks', capped.off === 'false' && capped.again === 'false' && capped.live === '60 picks at most' && capped.total === 57 && capped.back === 'true' && capped.picks9 === 4, JSON.stringify(capped));
    await page.click('.modal-shapes footer .btn.primary');
    const after = await ev(() => ({ line: document.querySelector('.nb-custom span').textContent, live: document.querySelector('.nb-live').textContent, size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x') }));
    check('Done: the Custom line and the live region say "9 blocks (4 picked)", and the size it grew to', after.line === '9 blocks (4 picked)' && after.live === '9 blocks (4 picked), ' + after.size.replace('x', ' × '), JSON.stringify(after));
    await page.click('.modal-newboard footer .btn.primary');
    await page.waitForTimeout(200);
    const deals = await ev((keys) => {
      const g = Lull.app.modes.play.game, got = new Set();
      const all = [g.piece.type.id].concat(g.queue.map((e) => e.id));
      for (let i = 0; i < 80; i++) all.push(g.dealer.next(g));
      for (const id of all) got.add(Lull.Pieces.canonKey(Lull.Pieces.get(id).rots[0]));
      return { only: [...got].every((k) => keys.includes(k)), n: got.size, label: Lull.Recipe.label(g.recipe, true) };
    }, drew.picks);
    check('the board deals only the four picked (three picked, one drawn)', deals.only && deals.n === 4 && deals.label === 'Custom', JSON.stringify(deals));
    // A reload keeps the queue (the rest of the round, the stream).
    const before = await ev(() => { const m = Lull.app.modes.play, g = m.game; g.drop(); m.persist(); Lull.app.saveNow && Lull.app.saveNow(); return [g.piece.type.id].concat(g.queue.map((e) => e.id)); });
    await page.reload();
    await page.waitForTimeout(500);
    const reloaded = await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const g = Lull.app.modes.play.game; return { q: [g.piece.type.id].concat(g.queue.map((e) => e.id)), label: Lull.Recipe.label(g.recipe) }; });
    check('a reload keeps the board’s queue and its recipe', reloaded.q.join() === before.join() && reloaded.label === 'Custom: 9 blocks (4 picked)', JSON.stringify({ before, reloaded }));
    await ctx.close();
  }

  // ---- 320 × 568 by touch: the Shapes panel, the Custom window, the picker and Draw fit; 12 blocks in the trays --------
  for (const theme of ['light', 'dark']) {
    const { ctx, page, ev, shot } = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: theme });
    await openNB(ev, page);
    await ev(() => document.querySelector('.nb-chip[data-value="custom"]').click());
    const nb = await fitOf(ev, '.modal-newboard', '.nb-chip, .nb-tab, .nb-custom .btn, footer .btn');
    const panel = await ev(() => { const p = document.querySelector('.nb-panel'), e = document.querySelector('.nb-custom .btn'), c = e.getBoundingClientRect(), chip = document.querySelector('.nb-chip[data-value="custom"]').getBoundingClientRect(); return { scrolls: p.scrollHeight > p.clientHeight + 1, gap: Math.round(c.top + parseFloat(getComputedStyle(e).borderTopWidth) - chip.bottom) }; });
    check('320 × 568 ' + theme + ': the Shapes panel with Custom never scrolls, and Edit is drawn clear of the chips', !panel.scrolls && panel.gap >= 2, JSON.stringify(panel));
    const heights = await ev(() => ['size', 'shapes', 'mods', 'mode'].map((k) => { document.querySelector('.nb-tab[data-tab="' + k + '"]').click(); return Math.round(document.querySelector('.modal-newboard').getBoundingClientRect().height); }));
    check('320 × 568 ' + theme + ': New board with Custom fits (footer shown, 44 px targets), one height on every tab', nb.inside && nb.footer && nb.noSide && !nb.small.length && new Set(heights).size === 1, JSON.stringify({ nb, heights }));
    await ev(() => document.querySelector('.nb-tab[data-tab="shapes"]').click());
    await shot('shapes-06-panel-320x568-' + theme);
    if (theme === 'dark') { await ctx.close(); continue; }
    await page.click('.nb-custom .btn');
    await settle(page);
    await ev(() => { document.querySelector('.sp-check[data-focus="g12"]').click(); document.querySelector('.sp-check[data-focus="cl"]').click(); document.querySelector('.sp-check[data-focus="big"]').click(); });
    const list = await fitOf(ev, '.modal-shapes', '.sp-check, .sp-more, footer .btn');
    check('320 × 568: the Custom shapes window fits (footer shown, rows 44 px, nothing wider than it; the list scrolls)', list.inside && list.footer && list.noSide && !list.small.length && !list.wide.length, JSON.stringify(list));
    await shot('shapes-07-custom-320x568-light');
    // Each row's sample: 36 px; a 1 block sample is a block of 7 px or more, a 3 block one a shape (not a dash).
    const samples = await ev(() => ['g1', 'g3', 'g12'].map((f) => {
      const c = document.querySelector('.sp-check[data-focus="' + f + '"]').closest('.sp-row').querySelector('.sp-sample canvas'), r = c.getBoundingClientRect(), d = c.width / r.width;
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { f, size: Math.round(r.width) + 'x' + Math.round(r.height), w: Math.round((x1 - x0 + 1) / d), h: Math.round((y1 - y0 + 1) / d) };
    }));
    check('320 × 568: every row sample is 36 px; 1 block draws 7 px or more, 3 blocks 20 px or more across', samples.every((s) => s.size === '36x36') && samples[0].w >= 7 && samples[0].h >= 7 && Math.max(samples[1].w, samples[1].h) >= 20 && Math.max(samples[2].w, samples[2].h) <= 36, JSON.stringify(samples));
    await page.click('.sp-more[data-focus="m5"]');
    await page.waitForTimeout(100);
    const cols = await ev(() => getComputedStyle(document.querySelector('.sp-grid')).gridTemplateColumns.split(' ').length);
    const picker = await fitOf(ev, '.modal-shapes', '.sp-shape, .sp-seg button, .sp-tabs button, .sp-back, footer .btn');
    check('320 × 568: the picker fits, 5 columns of 44 px under 360 px, every target 44 px', picker.inside && picker.footer && picker.noSide && !picker.small.length && cols === 5, JSON.stringify({ picker, cols }));
    await ev(() => { document.querySelectorAll('.sp-shape')[1].click(); document.querySelectorAll('.sp-shape')[7].click(); });
    await shot('shapes-08-picker-320x568-light');
    await ev(() => { Lull.Shapes.openCustom.last.sp.back(); });
    await page.click('.sp-more[data-focus="m12"]');
    await ev(() => document.querySelector('.sp-tabs [data-focus="tab-draw"]').click());
    const drawFit = await fitOf(ev, '.modal-shapes', '.sp-draw-row .btn, .sp-tabs button, .sp-back');
    const cell = await ev(() => { const g = document.querySelector('.sp-draw'); return Math.round(g.getBoundingClientRect().width / 12); });
    await ev(() => { const s = Lull.Shapes.openCustom.last.sp; s.view.drawn = new Set([13, 14, 15, 16, 17, 29, 41, 53, 54, 55, 43]); s.draw('draw'); });
    check('320 × 568: the Draw view fits (12 × 12 cells of ' + cell + ' px)', drawFit.inside && drawFit.footer && drawFit.noSide && !drawFit.small.length && cell >= 20, JSON.stringify({ drawFit, cell }));
    await shot('shapes-09-draw-320x568-light');
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    // 12 blocks in the trays: at least 4 px a block on the smallest phone.
    const trays = await ev(() => {
      const m = Lull.app.modes.play, r = { v: 1, shapes: { preset: 'custom', custom: { groups: [{ n: 12, weight: 'even' }], big: 'off' } } }, lim = Lull.Recipe.limits(r);
      m.setGame(new Lull.Game({ w: lim.w[0], h: lim.h[0], seed: 3, recipe: r, previewCount: m.settings.preview }));
      const g = m.game;
      g.hold = { id: g.queue[3].id, rot: 0 };
      const v = m.view;
      v.dirty = true; v.resize(); v.layout(); v.render(performance.now());
      const q = v.drawnQueue, hb = v.holdBox(), scratch = document.createElement('canvas').getContext('2d');
      const held = Lull.Render.drawPieceIn(scratch, v.trayEntry(g.hold), hb, v.lay.ts * 0.72, { skin: v.look.skin, color: () => '#888', t: 0 });
      return { size: g.w + 'x' + g.h, first: q[0] && q[0].cell, held: held && held.cell, all: q.map((d) => d.cell), n: q.length };
    });
    check('320 × 568: a 12-block piece draws at 4 px a block or more in the first Next slot and in Hold (their slots grown); Next shows it alone rather than specks', trays.first >= 4 && trays.held >= 4 && trays.n === 1, JSON.stringify(trays));
    await shot('shapes-10-twelve-trays-320x568-light');
    await ctx.close();
  }
  check('shapes: no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};

if (require.main === module) {
  // On its own: node Lull/scripts/shapes-browser-test.cjs [out dir]
  (async () => {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); }
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    let failures = 0;
    const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) failures++; };
    await module.exports({ browser, check, PAGE: 'file://' + path.join(__dirname, '..', 'Game', 'index.html'), OUT: process.argv[2] || null });
    await browser.close();
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
