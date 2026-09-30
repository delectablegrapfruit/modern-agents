// Protect in the browser (js/guard.js, js/guardview.js): made in the New board window (Mode ▸ Protect ▸ a level; a
// size too small is raised to 6 × 12; the preview's sprout), the board it makes (the sprout found in the pixels, Leaves
// in place of Score, its tip), a stone that lands (drawn, booked once in Stats however often it is undone), power-ups
// Protect refuses (nothing spent), the Wilted card and its Undo, a reload that resumes the guard, the library's Wilted
// tag and label, a retired wilted board in full view, the window at 320 × 568 with the level row, and the screenshots:
// a rose warning, moles digging (dark), the Wilted card, the smallest phone on an odd width, reduced motion.
// Run by browser-test.cjs: require('./protect-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

/**
 * In the page: a Protect board w × h in play (level), a stack from rows of letters (bottom row first: a piece's letter
 * is its colour, 'o' a stone, '0'–'3' a mole in that slot, '.' or 'S' open or the sprout), the guard's fields given (G),
 * and the piece in play where asked ([id, x, y, rot]).
 */
const SCENE = (o) => {
  const app = Lull.app, m = app.modes.play, R = Lull.Recipe, P = Lull.Pieces, Gd = Lull.Guard;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  m.setGame(new Lull.Game({ w: o.w, h: o.h, seed: o.seed || 5, recipe: R.normalize({ mode: 'protect', protect: { level: o.level || 'medium' } }), previewCount: m.settings.preview }));
  const g = m.game, G = Gd.of(g);
  (o.rows || []).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.' || c === 'S') continue;
      if (c === 'o') g.board.set(x, y, Gd.STONE);
      else if (/[0-3]/.test(c)) { g.board.set(x, y, Gd.moleCell(+c)); G.moles.push({ slot: +c, patience: 12, dig: 0, tx: -1, ty: -1, face: x <= G.ax ? 1 : -1 }); }
      else g.board.set(x, y, P.TYPES[c].color);
    }
  });
  Object.assign(G, o.G || {});
  if (o.plan) G.plan = o.plan.map((t) => Object.assign({}, t, { at: G.seq + t.in }));
  if (o.piece) { const [id, x, y, rot] = o.piece; g.piece = { type: P.get(id), rot, x, y, special: null, entry: { id, rot: 0 }, lastRot: false }; }
  g.hold = o.hold ? { id: o.hold, rot: 0 } : null;
  m.view.pointerCol = null; m.view.fx.clear();
  m.renderStatus(); m.renderItems();
  m.view.dirty = true; m.view.render(performance.now());
  return { w: g.w, h: g.h, ax: G.ax, sw: G.sw };
};

/** How many pixels of the sprout's box on the board's canvas are near its leaf green (the theme's). */
const SPROUT_PIXELS = () => {
  const m = Lull.app.modes.play, v = m.view, G = Lull.Guard.of(m.game), cv = v.canvas, dpr = cv.width / v.cssW;
  v.dirty = true; v.render(performance.now());
  const [x0, y0] = v.toScreen(G.ax, 1), s = v.lay.s;
  const d = cv.getContext('2d').getImageData(Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round(G.sw * s * dpr), Math.round(2 * s * dpr)).data;
  const leaf = Lull.app.theme.name === 'light' ? [0x4f, 0x9a, 0x5e] : [0x8f, 0xd1, 0x9e];
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - leaf[0]) + Math.abs(d[i + 1] - leaf[1]) + Math.abs(d[i + 2] - leaf[2]) < 40) n++;
  return { n, of: d.length / 4 };
};

module.exports = async function protectTests({ browser, check, PAGE, OUT }) {
  console.log('protect');
  const errors = [];
  const open = async (o, theme) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: theme || 'light' }, o || {}));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(400);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev((t) => {
      Lull.app.settings.theme = t; Lull.app.applySettings();
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, theme || 'light');
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, ev, shot };
  };

  // ---- the New board window: Mode ▸ Protect ▸ Medium; 4 × 8 raised to 6 × 12; the preview's sprout; Create ----------
  const D = await open();
  let { page, ev } = D;
  await ev(() => { const B = Lull.app.store.state.boards; B.size = { w: 4, h: 8 }; B.recipe = Lull.Recipe.normalize({}); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
  /** Leaf-green pixels on the preview. */
  const previewGreen = () => ev(() => {
    const cv = document.querySelector('.modal-newboard .nb-preview'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0x4f) + Math.abs(d[i + 1] - 0x9a) + Math.abs(d[i + 2] - 0x5e) < 40) n++;
    return n;
  });
  const before = await ev(() => ({ w: document.querySelector('.nb-val[data-k="w"]').textContent, h: document.querySelector('.nb-val[data-k="h"]').textContent }));
  const green0 = await previewGreen();
  await ev(() => { document.querySelector('.nb-tab[data-tab="mode"]').click(); });
  await ev(() => { document.querySelector('.nb-mode[data-value="protect"]').click(); });
  const lv = await ev(() => ({
    levels: [...document.querySelectorAll('.nb-level')].map((b) => b.textContent),
    pressed: [...document.querySelectorAll('.nb-level')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent),
    w: document.querySelector('.nb-val[data-k="w"]').textContent, h: document.querySelector('.nb-val[data-k="h"]').textContent,
    tab: document.querySelector('.nb-tab[data-tab="mode"] .vl').textContent, live: document.querySelector('.nb-live').textContent,
  }));
  check('New board: Mode ▸ Protect shows the level row (Easy, Medium, Hard), Easy first chosen', lv.levels.join() === 'Easy,Medium,Hard' && lv.pressed.join() === 'Easy' && lv.tab === 'Protect', JSON.stringify(lv));
  check('New board: 4 × 8 is raised to 6 × 12 for Protect, and the change is read out', before.w === '4' && before.h === '8' && lv.w === '6' && lv.h === '12' && /6 × 12/.test(lv.live), JSON.stringify({ before, lv }));
  const green1 = await previewGreen();
  check('New board: the preview shows the sprout (leaf green on the floor)', green0 === 0 && green1 > 10, green0 + ' → ' + green1);
  await ev(() => { document.querySelector('.nb-level[data-value="medium"]').click(); });
  await ev(() => { [...document.querySelectorAll('.modal-newboard .btn')].find((b) => b.textContent.trim() === 'Create').click(); });
  await page.waitForTimeout(200);
  const made = await ev(() => { const g = Lull.app.modes.play.game, G = Lull.Guard.of(g); return { w: g.w, h: g.h, r: g.recipe, G: !!G, level: G && G.level, remembered: Lull.app.store.state.boards.recipe }; });
  check('Create makes a Protect Medium board 6 × 12, and remembers the choice', made.w === 6 && made.h === 12 && made.G && made.level === 'medium' && made.r.mode === 'protect' && made.remembered.protect.level === 'medium', JSON.stringify(made));

  // ---- the board: the sprout in the pixels, Leaves in place of Score, the tip ------------------------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium' });
  const px = await ev(SPROUT_PIXELS);
  check('the sprout is drawn on the board (leaf green in its cells)', px.n > px.of * 0.05, JSON.stringify(px));
  const bar = await ev(() => ({ labels: [...document.querySelectorAll('#play-status .stats .stat i')].map((i) => i.textContent.trim()), leaves: (document.querySelector('#play-status .stat.leaves b') || {}).textContent, tip: (document.querySelector('#play-status .stat.leaves') || { dataset: {} }).dataset.tip }));
  check('the status bar shows Leaves (3) in place of Score, its tip the calm before wave 1', bar.labels.includes('Leaves') && !bar.labels.includes('Score') && bar.leaves === '3' && bar.tip === 'Calm · 10 pieces to wave 1', JSON.stringify(bar));

  // ---- a stone lands: drawn, booked in Stats once (Undo and the same again do not count it twice) ---------------------
  const stone = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, G = Lull.Guard.of(g), F = Lull.app.store.state.stats.free;
    F.guard = F.guard || {};
    const s0 = F.guard.stones || 0;
    G.plan = [{ at: G.seq + 1, kind: 'stone', x: 0, sw: 1, sh: 1 }];
    Lull.app.store.state.inventory.rewind = 3;
    m.action('drop');
    const landed = g.board.get(0, 0) === Lull.Guard.STONE || g.board.get(0, 1) === Lull.Guard.STONE;
    const s1 = F.guard.stones;
    m.useItem('rewind');
    const back = G !== Lull.Guard.of(g) ? Lull.Guard.of(g).plan.length : -1;
    m.action('drop');
    return { landed, s0, s1, s2: F.guard.stones, back };
  });
  check('a stone lands on its column; the lifetime count takes it once, through an Undo and the same drop again', stone.landed && stone.s1 === stone.s0 + 1 && stone.s2 === stone.s1 && stone.back === 1, JSON.stringify(stone));
  await ev(() => { Lull.UI.renderStats(Lull.app, 'free'); });
  const statsRow = await ev(() => { const h4 = [...document.querySelectorAll('#stats-body h4')].find((x) => x.textContent === 'Protect'); return { has: !!h4, rows: h4 && h4.nextElementSibling ? [...h4.nextElementSibling.querySelectorAll('td:first-child')].map((t) => t.textContent) : [] }; });
  check('Stats ▸ Free Play has a Protect section', statsRow.has && statsRow.rows.includes('Stones') && statsRow.rows.includes('Boards wilted'), JSON.stringify(statsRow));

  // ---- power-ups Protect refuses: the reason, nothing spent ------------------------------------------------------------
  const refused = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store.state;
    st.inventory.tornado = 2; st.inventory.trapdoor = 0;
    const lines = st.lines;
    m.openTray && m.openTray(null);
    m.useItem('tornado');
    const toastT = [...document.querySelectorAll('.toast')].map((t) => t.textContent).pop();
    m.useItem('trapdoor');
    return { toast: toastT, tornado: st.inventory.tornado, trapdoor: st.inventory.trapdoor, lines: st.lines === lines, why: m.game.allow('flip') };
  });
  check('Tornado, Trapdoor and Mirror World are refused ("Not in Protect"), nothing spent or bought', refused.toast === 'Not in Protect' && refused.tornado === 2 && refused.trapdoor === 0 && refused.lines && refused.why === 'Not in Protect', JSON.stringify(refused));
  // Settle on a board that holds only the sprout settles nothing: refused, nothing spent, no power-up counted.
  await ev(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await ev(SCENE, { w: 10, h: 20, level: 'hard', piece: ['T', 3, 17, 0] });
  const bare = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store.state;
    st.inventory.settle = 1;
    const lines = st.lines, items = JSON.stringify(m.game.s.items || {});
    m.useItem('settle');
    const toastT = [...document.querySelectorAll('.toast')].map((t) => t.textContent).pop();
    return { toast: toastT, settle: st.inventory.settle, lines: st.lines === lines, items: JSON.stringify(m.game.s.items || {}) === items };
  });
  check('Settle with only the sprout on the board is refused ("Nothing to settle"), nothing spent', bare.toast === 'Nothing to settle' && bare.settle === 1 && bare.lines && bare.items, JSON.stringify(bare));

  // ---- the Wilted card, its Undo; a reload resumes the guard ----------------------------------------------------------
  await ev(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await ev(SCENE, { w: 10, h: 20, level: 'medium', rows: ['JJJSS.LLLL', 'J..SS..ooL', 'TTT....o..', '.T........'], G: { leaves: 1, phase: 'wave', wave: 4, left: 9 }, plan: [{ in: 1, kind: 'stone', x: 4, sw: 1, sh: 1 }, { in: 2, kind: 'stone', x: 8, sw: 1, sh: 1 }] });
  const topouts0 = await ev(() => Lull.app.store.state.stats.free.topouts);
  await ev(() => { const m = Lull.app.modes.play; Lull.app.store.state.inventory.rewind = 3; m.game.replacePiece({ id: 'O' }); for (let i = 0; i < 3; i++) m.action('left'); m.action('drop'); });
  await page.waitForTimeout(250);
  const wilt = await ev(() => { const m = Lull.app.modes.play, ov = m.overlay; return { card: m.cardOpen, title: (ov.querySelector('h2') || {}).textContent, undo: !!ov.querySelector('#topout-undo'), retire: [...ov.querySelectorAll('.btn')].map((b) => b.textContent.trim()), over: m.game.over, kind: m.game.endKind, wilted: Lull.app.store.state.stats.free.guard.wilted, topouts: Lull.app.store.state.stats.free.topouts, tiles: [...ov.querySelectorAll('.bs .l')].map((l) => l.textContent) }; });
  check('0 leaves: the Wilted card (the summary with Waves and Leaves lost; Undo, Boards, Retire), counted as wilted, not as a full board', wilt.card && wilt.title === 'Wilted' && wilt.undo && wilt.over && wilt.kind === 'wilted' && wilt.wilted >= 1 && wilt.topouts === topouts0 && wilt.tiles.includes('Waves') && wilt.tiles.includes('Leaves lost') && wilt.tiles.includes('Board'), JSON.stringify(wilt));
  await D.shot('protect-wilted-520x760');
  // The library says so while it is up.
  await ev(() => Lull.app.modes.play.openLibrary());
  await page.waitForTimeout(150);
  const row = await ev(() => { const r = document.querySelector('.modal-lib .lib-row.current'); return { tags: [...r.querySelectorAll('.tag')].map((t) => t.textContent), sz: r.querySelector('.sz').textContent }; });
  check('the library row: Wilted (not Full), and "Protect Medium" after its size', row.tags.includes('Wilted') && !row.tags.includes('Full') && /10 × 20 · Protect Medium/.test(row.sz), JSON.stringify(row));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  await page.click('#topout-undo');
  await page.waitForTimeout(200);
  const undone = await ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game); return { card: m.cardOpen, over: m.game.over, leaves: G.leaves, tag: document.querySelector('#play-status .stat.leaves b').textContent }; });
  check('Undo on the Wilted card: the leaf is back, the board plays on', !undone.card && !undone.over && undone.leaves === 1 && undone.tag === '1', JSON.stringify(undone));
  const saved = await ev(() => { const m = Lull.app.modes.play; m.persist(); return JSON.stringify(Lull.Guard.of(m.game)); });
  await page.reload();
  await page.waitForTimeout(500);
  const resumed = await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const m = Lull.app.modes.play; return { G: JSON.stringify(Lull.Guard.of(m.game)), leaves: (document.querySelector('#play-status .stat.leaves b') || {}).textContent }; });
  check('a reload resumes the guard exactly (its wave plan, moles and leaves)', resumed.G === saved && resumed.leaves === '1', resumed.G.slice(0, 120));

  // ---- a wilted board retired: its record, and the full view says Wilted ------------------------------------------------
  await ev(() => { for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
  await ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game); G.plan = [{ at: G.seq + 1, kind: 'stone', x: G.ax, sw: 1, sh: 1 }]; m.game.replacePiece({ id: 'O' }); for (let i = 0; i < 3; i++) m.action('left'); m.action('drop'); });
  await page.waitForTimeout(150);
  await ev(() => { [...Lull.app.modes.play.overlay.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Retire').click(); });
  await page.waitForTimeout(150);
  const retired = await ev(() => { const B = Lull.app.store.state.boards, e = B.retired[0], g = Lull.app.modes.play.game; return { reason: e.reason, recipe: e.recipe.mode, waves: e.sum.ext && e.sum.ext.protect && e.sum.ext.protect.waves, next: g.recipe.mode, fresh: Lull.Guard.of(g).leaves, id: e.id, log: Lull.app.store.state.stats.free.boardLog[0].reason }; });
  check('Retire on the Wilted card: retired as wilted with its numbers; the next board is Protect too', retired.reason === 'wilted' && retired.recipe === 'protect' && retired.waves != null && retired.next === 'protect' && retired.fresh === 3 && retired.log === 'wilted', JSON.stringify(retired));
  await ev(() => Lull.app.modes.play.openLibrary());
  await page.waitForTimeout(150);
  await ev(() => { const t = [...document.querySelectorAll('.modal-lib .lib-tabs button')].find((b) => b.dataset.k === 'retired'); if (t) t.click(); });
  await page.waitForTimeout(150);
  const rrow = await ev((id) => { const r = document.querySelector('.modal-lib .lib-row.retired[data-id="' + id + '"]'); return r ? [...r.querySelectorAll('.tag')].map((t) => t.textContent) : null; }, retired.id);
  check('the retired row is tagged Wilted', !!rrow && rrow.includes('Wilted') && !rrow.includes('Full'), JSON.stringify(rrow));
  await ev((id) => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.openRetiredView(id); }, retired.id);
  await page.waitForTimeout(250);
  const fv = await ev(() => ({ sub: (document.querySelector('.fv-sub') || {}).textContent, label: (document.querySelector('.fv-canvas') || { getAttribute: () => '' }).getAttribute('aria-label') }));
  check('its full view says Wilted (not "Retired by hand")', /^Wilted · retired /.test(fv.sub || '') && /wilted/.test(fv.label || ''), JSON.stringify(fv));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });

  // ---- screenshots: a rose warning; moles digging (dark); the smallest phone on an odd width; reduced motion -----------
  const WARN = { w: 10, h: 20, level: 'medium', seed: 3, rows: ['LLLSS.ZZ.J', 'LIISS.ZZJJ', 'III...oo.J', '..........'], G: { phase: 'wave', wave: 3, left: 9, leaves: 2 },
    plan: [{ in: 2, kind: 'stone', x: 4, sw: 1, sh: 1 }, { in: 3, kind: 'stone', x: 7, sw: 2, sh: 1 }, { in: 1, kind: 'mole', side: 0 }], piece: ['T', 3, 12, 0], hold: 'S' };
  await ev(SCENE, WARN);
  const warn = await ev(() => { const m = Lull.app.modes.play, p = Lull.Guard.preview(Lull.Guard.of(m.game), m.game.board); return { hit: p.stones.map((s) => s.hit), left: p.stones.map((s) => s.left), arrivals: p.arrivals.length }; });
  check('the warnings: the stone over the bare sprout is a hit (rose), the other not; the mole’s notch', warn.hit.join() === 'true,false' && warn.left.join() === '2,3' && warn.arrivals === 1, JSON.stringify(warn));
  const rose = await ev(() => {
    const m = Lull.app.modes.play, v = m.view, cv = v.canvas, dpr = cv.width / v.cssW, s = v.lay.s;
    v.dirty = true; v.render(performance.now());
    const [x0, y0] = v.toScreen(4, 2);
    const d = cv.getContext('2d').getImageData(Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round(s * dpr), Math.round(s * dpr)).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 0xeb) + Math.abs(d[i + 1] - 0x6f) + Math.abs(d[i + 2] - 0x92) < 60) n++;
    return n;
  });
  check('the rose outline is drawn where the stone would meet the sprout', rose > 6, String(rose));
  await D.shot('protect-warning-520x760');
  await D.ctx.close();

  const K = await open({}, 'dark');
  await K.ev(SCENE, { w: 12, h: 20, level: 'hard', seed: 4, rows: ['oo.o.SS.JJ.o', 'o2oo.SSJJo3o', 'oo.I.oo.oooo', 'OOoI.....o..', 'OO.I........', '...I........'], G: { phase: 'wave', wave: 6, left: 14, leaves: 3 }, plan: [{ in: 2, kind: 'stone', x: 5, sw: 2, sh: 2 }], piece: ['L', 5, 13, 0], hold: 'I' });
  // Two steps: the moles dig in (and are drawn mid-step).
  await K.ev(() => { const m = Lull.app.modes.play; m.game.replacePiece({ id: 'O' }); for (let i = 0; i < 4; i++) m.action('right'); m.action('drop'); });
  await K.page.waitForTimeout(80);
  await K.shot('protect-moles-520x760-dark');
  const px2 = await K.ev(SPROUT_PIXELS);
  check('dark theme: the sprout in its own leaf green', px2.n > px2.of * 0.05, JSON.stringify(px2));
  await K.ctx.close();

  const T = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await T.ev(SCENE, { w: 11, h: 22, level: 'easy', seed: 6, rows: ['JJJ.SSSLLLL', 'J.T.SSS.o.L', '.TTT....1..', '...........'], G: { phase: 'calm', wave: 2, left: 5, leaves: 3 }, plan: [{ in: 3, kind: 'stone', x: 1, sw: 1, sh: 1 }], piece: ['S', 4, 17, 0] });
  const odd = await T.ev(() => { const G = Lull.Guard.of(Lull.app.modes.play.game); const bar = document.querySelector('#play-status'); const r = bar.getBoundingClientRect(); return { sw: G.sw, ax: G.ax, fits: r.right <= window.innerWidth + 0.5 && bar.scrollWidth <= bar.clientWidth + 1, tip: document.querySelector('#play-status .stat.leaves').dataset.tip }; });
  check('an odd width: the sprout is 3 wide and centred; the status bar fits the smallest phone', odd.sw === 3 && odd.ax === 4 && odd.fits && odd.tip === 'Calm · 5 pieces to wave 3', JSON.stringify(odd));
  const px3 = await T.ev(SPROUT_PIXELS);
  check('320 × 568: the sprout is drawn', px3.n > px3.of * 0.04, JSON.stringify(px3));
  await T.shot('protect-320x568-odd');
  // The New board window with the level row: it fits, its targets are 44 px, focus stays on Width.
  await T.ev(() => { const B = Lull.app.store.state.boards; B.recipe = Lull.Recipe.normalize({ mode: 'protect', protect: { level: 'hard' } }); B.size = { w: 10, h: 20 }; Lull.app.modes.play.openNewBoard(); });
  await T.page.waitForTimeout(150);
  const focus0 = await T.ev(() => document.activeElement && document.activeElement.dataset.k);
  await T.ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
  await T.page.waitForTimeout(100);
  const nb = await T.ev(() => {
    const m = document.querySelector('.modal-newboard'), r = m.getBoundingClientRect(), create = [...m.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Create').getBoundingClientRect();
    const lv = [...m.querySelectorAll('.nb-level')].map((b) => b.getBoundingClientRect()), md = [...m.querySelectorAll('.nb-mode')].map((b) => b.getBoundingClientRect());
    const panel = m.querySelector('.nb-panel');
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight, create: create.bottom <= window.innerHeight + 0.5 && create.height >= 43.5, lvH: Math.min(...lv.map((b) => b.height)), mdH: Math.min(...md.map((b) => b.height)), n: lv.length, pressed: [...m.querySelectorAll('.nb-level[aria-pressed="true"]')].map((b) => b.textContent), clipped: panel.scrollHeight > panel.clientHeight + 1 };
  });
  check('New board at 320 × 568 on Protect: the level row fits (44 px targets), the footer shows, nothing scrolls; focus opened on Width', focus0 === 'w' && nb.top >= 0 && nb.bottom <= nb.vh && nb.create && nb.lvH >= 43.5 && nb.mdH >= 43.5 && nb.n === 3 && nb.pressed.join() === 'Hard' && !nb.clipped, JSON.stringify(nb));
  await T.shot('protect-newboard-320x568');
  await T.ctx.close();

  // Reduced motion: a stone fades in where it lands (no fall), and nothing shakes.
  const M = await open({ reducedMotion: 'reduce' });
  await M.ev(SCENE, { w: 10, h: 20, level: 'hard', seed: 8, rows: ['ZZ..SSLLLL', '.ZZ.SS...L', '....ooo...'], G: { phase: 'wave', wave: 2, left: 6, leaves: 2 }, plan: [{ in: 1, kind: 'stone', x: 1, sw: 2, sh: 2 }, { in: 2, kind: 'stone', x: 4, sw: 1, sh: 1 }] });
  const rm = await M.ev(() => { const m = Lull.app.modes.play; m.game.replacePiece({ id: 'I' }); for (let i = 0; i < 4; i++) m.action('right'); m.action('drop'); return { reduced: m.reduced, shake: m.view.fx.shake }; });
  await M.page.waitForTimeout(120);
  await M.shot('protect-reduced-520x760');
  check('reduced motion: nothing shakes as the stones land', rm.reduced && rm.shake === 0, JSON.stringify(rm));
  await M.ctx.close();

  check('protect: no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
};
