// Descent in the browser (js/descent.js, js/descentview.js): made in the Custom window (Mode ▸ Descent between
// Classic and Race; its level and stage; 4 × 8 raised to 8 × 14; the preview's hanging rows), the board it makes (the
// hanging blocks drawn, Stage, Broken and Next in the status bar), the clock (the Ready card; Space starts it; it runs in
// real time; it pauses at the Paused card on a blur, the page hidden, a window over it and P), a clear's shots, Rewind
// 5 s (Undo's place: its name, five seconds back, paid as an Undo), the Cleared card and its next stage, the Topped out
// card, a reload at the Paused card, Stats and the achievements' group, the phones (390 × 844,
// 320 × 568: the status bar and the window fit, 44 px targets, a tap starts), and frames at four sizes in both themes.
// Run by browser-test.cjs: require('./descent-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

/**
 * In the page: a Descent board w × h in play (level, stage), its lanes laid out by hand where given (lanes[x] =
 * [bot, 'gdapr…'] lowest first), your cells from rows of letters (bottom row first: a piece's letter, '#' stone), the
 * piece in play where asked ([id, x, y, rot]). go: started and running; still: started, the clock held still (for a
 * picture); neither: its Ready card (or Paused once started: started).
 */
const SCENE = (o) => {
  const app = Lull.app, m = app.modes.play, R = Lull.Recipe, P = Lull.Pieces, Ds = Lull.Descent;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  // (A game put in play by hand is the mode's own game in play, never a Custom one: a reload finds it.)
  m.custom = null;
  m.setGame(new Lull.Game({ w: o.w || 10, h: o.h || 20, seed: o.seed || 5, recipe: R.normalize({ mode: 'descent', descent: { level: o.level || 'medium', stage: o.stage || 1 } }), previewCount: m.settings.preview }));
  const g = m.game, D = Ds.of(g);
  const KIND = { g: 'glass', d: 'dense', a: 'armour', p: 'prism', r: 'drip', w: 'weight', e: 'echo', k: 'lock' };
  if (o.lanes) D.lanes.forEach((l, x) => {
    const s = o.lanes[x] || [g.h, ''];
    l.bot = s[0]; l.next = s[2] != null ? s[2] : l.next;
    l.blocks = s[1].split('').map((c) => { const k = KIND[c]; const b = { k, hp: k === 'dense' ? 2 : 1 }; if (k === 'lock') b.d = x ? -1 : 1; if (k === 'drip') b.t = 15; return b; });
  });
  if (o.lanes) D.total = o.total || D.lanes.reduce((a, l) => a + l.blocks.length, 0);
  (o.rows || []).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.') continue;
      g.board.set(x, y, c === '#' ? Ds.STONE_CELL : P.TYPES[c].color | (Ds.shotOf(P.TYPES[c]) << Lull.CELL.SHOT_SHIFT));
    }
  });
  Object.assign(D, o.D || {});
  Ds.sync(D, g.board);
  if (o.piece) { const [id, x, y, rot] = o.piece; g.piece = { type: P.get(id), rot, x, y, special: null, entry: { id, rot: 0 }, lastRot: false }; }
  else { g.piece = null; g.spawnNext(); }
  const ctl = m.ctl;
  if (!ctl.realRunning) ctl.realRunning = ctl.running;
  ctl.running = ctl.realRunning;
  if (o.go || o.still) ctl.go(); else if (o.started) { D.started = true; ctl.wait(); } else ctl.wait();
  if (o.still) ctl.running = () => false;
  m.view.pointerCol = null; m.view.fx.clear();
  m.renderStatus(); m.renderItems();
  m.view.dirty = true; m.view.render(performance.now());
  return { w: g.w, h: g.h };
};

module.exports = async function descentTests({ browser, check, PAGE, OUT }) {
  console.log('descent');
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
  const tk = (ev) => ev(() => Lull.Descent.of(Lull.app.modes.play.game).tk);
  const card = (ev) => ev(() => { const m = Lull.app.modes.play, ov = m.overlay; return { open: m.cardOpen, title: (ov.querySelector('h2') || {}).textContent, sub: (ov.querySelector('.cl-sub') || {}).textContent || null, line: (ov.querySelector('.ds-line') || {}).textContent || null, btns: [...ov.querySelectorAll('.btn')].map((b) => b.textContent.trim()) }; });
  const status = (ev) => ev(() => [...document.querySelectorAll('#play-status .stat')].map((s) => s.textContent.trim()));

  // ---- the Custom window: Mode ▸ Descent ▸ Hard, stage 3; 4 × 8 raised to 8 × 14; the preview; Start ----------------
  const D = await open();
  let { page, ev } = D;
  await ev(() => { const B = Lull.app.store.state.boards; B.size = { w: 4, h: 8 }; B.recipe = Lull.Recipe.normalize({}); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
  await ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
  const modes = await ev(() => [...document.querySelectorAll('.nb-mode')].map((b) => b.textContent.trim()).filter((t) => t !== 'Mural')); // (Mural: mural-test.cjs)
  check('the Mode tab: Plain, Classic, Descent, Race, Battle', modes.join() === 'Plain,Classic,Descent,Race,Battle', JSON.stringify(modes));
  await ev(() => document.querySelector('.nb-mode[data-value="descent"]').click());
  await ev(() => document.querySelector('.nb-level[data-value="hard"]').click());
  await ev(() => { document.querySelector('[data-focus="descent.stage+"]').click(); });
  await ev(() => { document.querySelector('[data-focus="descent.stage+"]').click(); });
  await page.waitForTimeout(80);
  const win = await ev(() => ({
    levels: [...document.querySelectorAll('.nb-level')].map((b) => b.textContent),
    pressed: [...document.querySelectorAll('.nb-level[aria-pressed="true"]')].map((b) => b.textContent),
    stage: document.querySelector('.ds-val').textContent, valuetext: document.querySelector('.ds-val').getAttribute('aria-valuetext'),
    w: document.querySelector('.nb-val[data-k="w"]').textContent, h: document.querySelector('.nb-val[data-k="h"]').textContent,
    tab: document.querySelector('.nb-tab[data-tab="mode"] .vl').textContent, live: document.querySelector('.nb-live').textContent,
    preview: (() => { const cv = document.querySelector('.modal-newboard .nb-preview'), d = cv.getContext('2d').getImageData(0, 0, cv.width, Math.round(cv.height * 0.2)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && Math.abs(d[i] - d[i + 2]) > 8) n++; return n; })(),
  }));
  check('Descent ▸ Hard ▸ Stage 3: the level row, the stage stepper (read out), 8 × 14 at least; the preview shows the hanging rows', win.levels.join() === 'Easy,Medium,Hard' && win.pressed.join() === 'Hard' && win.stage === '3' && win.valuetext === 'Stage 3' && win.w === '8' && win.h === '14' && win.tab === 'Descent' && /Stage 3/.test(win.live) && win.preview > 20, JSON.stringify(win));
  await D.shot('descent-newboard-520x760');
  await ev(() => { [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Start').click(); });
  await page.waitForTimeout(200);
  const made = await ev(() => { const m = Lull.app.modes.play, g = m.game; return { label: Lull.Recipe.label(g.recipe), w: g.w, h: g.h, ext: g.ext.map((e) => e.key).join(), parts: m.view.parts.map((p) => p.key).join(), title: (m.overlay.querySelector('h2') || {}).textContent, sub: (m.overlay.querySelector('.cl-sub') || {}).textContent, line: (m.overlay.querySelector('.ds-line') || {}).textContent, want: Lull.Descent.STAGES[2].line }; });
  check('Start: a Descent board (8 × 14, Hard, Stage 3), waiting at its Ready card with the stage’s line', made.label === 'Descent Hard · Stage 3' && made.w === 8 && made.h === 14 && made.ext === 'descent' && made.parts === 'descent' && made.title === 'Descent' && made.sub === 'Stage 3 · Hard' && made.line === made.want, JSON.stringify(made));

  // ---- the clock: Space starts it; it runs in real time; the board takes no moves while it waits -------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', stage: 2 });
  const ready = await card(ev), t0 = await tk(ev);
  const blocked = await ev(() => { const m = Lull.app.modes.play, x = m.game.piece.x; m.action('left'); return m.game.piece.x === x; });
  await page.waitForTimeout(400);
  const t1 = await tk(ev);
  check('the Ready card (Descent, Stage 2 · Medium, its line, Menu and Start); waiting: no clock and no moves', ready.open && ready.title === 'Descent' && ready.sub === 'Stage 2 · Medium' && !!ready.line && ready.btns.join() === 'Menu,Start Space' && t0 === 0 && t1 === 0 && blocked, JSON.stringify({ ready, t0, t1, blocked }));
  await D.shot('descent-ready-520x760');
  await page.keyboard.press('Space');
  await page.waitForTimeout(700);
  const run = { tk: await tk(ev), card: await card(ev), st: await status(ev) };
  check('Space starts it: the clock runs in real time; Stage, Broken and Next in the status bar', !run.card.open && run.tk >= 4 && run.tk <= 12 && /^Stage\s*2$/.test(run.st[1] || run.st[0]) && run.st.some((t) => /^Broken\s*0$/.test(t)) && run.st.some((t) => /^Next\s*\d+ s$/.test(t)), JSON.stringify(run));

  // ---- pausing: a blur, the page hidden, a window over the board, P: each the Paused card, the clock still ----------------
  const pausedBy = {};
  for (const why of ['blur', 'hidden', 'modal', 'key']) {
    await ev(() => { const m = Lull.app.modes.play; if (m.ctl.waiting) m.ctl.go(); });
    await page.waitForTimeout(250);
    const a = await tk(ev);
    if (why === 'blur') await ev(() => window.dispatchEvent(new Event('blur')));
    else if (why === 'hidden') await ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    else if (why === 'modal') await ev(() => Lull.UI.openSettings(Lull.app));
    else await page.keyboard.press('KeyP');
    await page.waitForTimeout(350);
    const b = await tk(ev);
    await page.waitForTimeout(300);
    const c = await tk(ev), cd = await card(ev);
    if (why === 'hidden') await ev(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    if (why === 'modal') await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    pausedBy[why] = { ran: a > 0, still: b === c, card: cd.open && cd.title === 'Paused' && /^Stage 2 · Medium · 0:0\d$/.test(cd.sub || '') && /^Resume/.test(cd.btns[1] || '') };
  }
  check('auto pause: a blur, the page hidden, a window over it and P each stop the clock at the Paused card', Object.values(pausedBy).every((p) => p.ran && p.still && p.card), JSON.stringify(pausedBy));
  await D.shot('descent-paused-520x760');

  // ---- a clear's shots: a row of yours fires up every lane; Broken counts; only own cells pay ------------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'easy', stage: 1, go: true, lanes: Array.from({ length: 10 }, (_, x) => [14, x === 4 ? 'dg' : 'ggg', 1e6]), total: 60, rows: ['TTTTTTTTT.'] });
  const shotRes = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, D = Lull.Descent.of(g), lines0 = Lull.app.store.state.lines;
    g.replacePiece({ id: 'I' }); g.piece.rot = 1; g.piece.x = 7; g.piece.y = 0;
    m.action('drop');
    return { lanes: D.lanes.map((l) => l.blocks.length).join(), broken: D.broken, paid: Lull.app.store.state.lines - lines0, st: [...document.querySelectorAll('#play-status .stat')].map((s) => s.textContent.trim()) };
  });
  check('a row of T cells: each fires a spread (its lane and both beside it; a dense block takes two); the I’s cell pierces; Broken counts the rows', shotRes.lanes === '1,0,0,0,0,0,0,0,1,0' && shotRes.broken === 27 && shotRes.paid >= 1 && shotRes.st.some((t) => /^Broken\s*2$/.test(t)), JSON.stringify(shotRes));
  await page.waitForTimeout(120);
  await D.shot('descent-shots-520x760');

  // ---- Rewind 5 s: Undo's place, its name; five seconds of play back; paid as an Undo --------------------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', stage: 4, go: true });
  const rw = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, Ds = Lull.Descent, st = Lull.app.store.state;
    for (let i = 0; i < 90; i++) { if (i % 20 === 5) Ds.play(g, true, new Lull.RNG(i)); const e = Ds.advance(g); if (e) m.ctl.onTick(e); }
    st.inventory.rewind = 2;
    m.renderItems(); m.openTray('board');
    const btn = document.querySelector('.item-btn[data-item="rewind"]'), name = btn.querySelector('.il').textContent, tip = btn.getAttribute('data-tip');
    const before = Ds.of(g).tk;
    btn.click();
    return { name, tip, before, after: Ds.of(g).tk, held: st.inventory.rewind, card: m.cardOpen, title: (m.overlay.querySelector('h2') || {}).textContent };
  });
  check('Undo reads Rewind 5 s here; it takes the board five seconds of play back, uses an Undo, and waits at Paused', rw.name === 'Rewind 5 s' && /five seconds/.test(rw.tip) && rw.before - rw.after >= 50 && rw.before - rw.after <= 52 && rw.held === 1 && rw.card && rw.title === 'Paused', JSON.stringify(rw));
  await ev(() => { const m = Lull.app.modes.play; m.openTray(null); });

  // ---- the Cleared card: the last block broken; Space goes on to the next stage (the board retired, tagged Cleared) ----------
  await ev(() => { Lull.app.store.state.stats.free.descent.stages.easy = []; });
  await ev(SCENE, { w: 10, h: 20, level: 'easy', stage: 5, go: true, lanes: Array.from({ length: 10 }, (_, x) => [16, x === 2 ? 'g' : '', 1e6]), total: 70, rows: ['OO.OOOOOOO', 'OO.OOOOOOO'] });
  const cl = await ev(() => {
    const m = Lull.app.modes.play, g = m.game;
    g.replacePiece({ id: 'I' }); g.piece.rot = 1; g.piece.x = 0; g.piece.y = 0;
    m.action('drop');
    const ov = m.overlay;
    return { over: g.over, kind: g.endKind, title: (ov.querySelector('h2') || {}).textContent, sub: (ov.querySelector('.cl-sub') || {}).textContent, btns: [...ov.querySelectorAll('.btn')].map((b) => b.textContent.trim()), stages: Lull.app.store.state.stats.free.descent.stages.easy.join(), ach: Object.keys(Lull.app.store.state.achievements).filter((k) => /^ds_/.test(k)).join() };
  });
  check('the last block broken: the Cleared card (Stage 5 · Easy; Menu, Stage 6); the stage counted cleared; Daylight earned', cl.over && cl.kind === 'cleared' && cl.title === 'Cleared' && cl.sub === 'Stage 5 · Easy' && cl.btns.join() === 'Menu,Stage 6 Space' && cl.stages === '5' && /ds_first/.test(cl.ach), JSON.stringify(cl));
  await D.shot('descent-cleared-520x760');
  await page.waitForTimeout(250);
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const nx = await ev(() => { const m = Lull.app.modes.play, g = m.game, F = Lull.app.store.state.stats.free, log = F.boardLog[0]; return { label: Lull.Recipe.label(g.recipe), title: (m.overlay.querySelector('h2') || {}).textContent, pieces: g.s.pieces, log: log && log.reason, rec: log && log.recipe && log.recipe.descent && log.recipe.descent.stage }; });
  check('Space on Cleared: a new game in its place (the cleared one in Past boards) and Stage 6 waits at its Ready card', nx.label === 'Descent Easy · Stage 6' && nx.title === 'Descent' && nx.pieces === 0 && nx.log === 'cleared' && nx.rec === 5, JSON.stringify(nx));

  // ---- topped out: the Topped out card (Rewind 5 s, Menu, Try again); its numbers -----------------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', stage: 3, go: true, lanes: Array.from({ length: 10 }, () => [4, 'gggggggggggggggg', 1e6]), total: 70, rows: ['ZZZZZZZZZ.', 'ZZZZZZZZ.Z', 'ZZZ..ZZZ.Z', 'ZZZ..ZZZZ.'], piece: ['O', 3, 2, 0] });
  const top = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, Ds = Lull.Descent;
    for (let i = 0; i < 70; i++) Ds.advance(g);
    m.action('drop');
    const ov = m.overlay;
    return { over: g.over, title: (ov.querySelector('h2') || {}).textContent, sub: (ov.querySelector('.cl-sub') || {}).textContent, btns: [...ov.querySelectorAll('.btn')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')), topped: Lull.app.store.state.stats.free.descent.topped };
  });
  check('no room for the next piece: the Topped out card (Rewind 5 s, Menu, Try again), counted', top.over && top.title === 'Topped out' && top.sub === 'Stage 3 · Medium' && /^Rewind 5 s/.test(top.btns[0]) && top.btns[1] === 'Menu' && top.btns[2] === 'Try again Space' && top.topped >= 1, JSON.stringify(top));
  await D.shot('descent-topped-520x760');
  await ev(() => { Lull.app.store.state.inventory.rewind = 1; document.querySelector('#ds-rewind').click(); });
  await page.waitForTimeout(120);
  const back = await ev(() => { const m = Lull.app.modes.play; return { over: m.game.over, title: (m.overlay.querySelector('h2') || {}).textContent, piece: !!m.game.piece }; });
  check('Rewind 5 s on the card: back in play, at the Paused card', !back.over && back.piece && back.title === 'Paused', JSON.stringify(back));

  // ---- a reload resumes the descent exactly, at the Paused card ------------------------------------------------------------
  const saved = await ev(() => { const m = Lull.app.modes.play; m.persist(); return JSON.stringify(Object.assign({}, Lull.Descent.of(m.game), { book: null })); });
  await page.reload();
  await page.waitForTimeout(500);
  const resumed = await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const m = Lull.app.modes.play; return { D: JSON.stringify(Object.assign({}, Lull.Descent.of(m.game), { book: null })), title: (m.overlay.querySelector('h2') || {}).textContent, open: m.cardOpen }; });
  check('a reload resumes the descent exactly (lanes, timers, stone), at the Paused card', resumed.D === saved && resumed.open && resumed.title === 'Paused', resumed.D.slice(0, 120));

  // ---- Stats and the achievements' group --------------------------------------------------------------------------------------
  await ev(() => Lull.UI.renderStats(Lull.app, 'free'));
  await page.waitForTimeout(150);
  const statsRow = await ev(() => { const hs = [...document.querySelectorAll('.stats-body h4')], hd = hs.find((x) => x.textContent === 'Descent'); const t = hd && hd.nextElementSibling; return { has: !!hd, rows: t ? [...t.querySelectorAll('td:first-child')].map((x) => x.textContent) : [] }; });
  check('Stats ▸ Free Play has a Descent section (Time, Stages cleared, Blocks broken, Turned to stone, Topped out)', statsRow.has && ['Time', 'Stages cleared', 'Blocks broken', 'Turned to stone', 'Topped out', 'Easy stages'].every((r) => statsRow.rows.includes(r)), JSON.stringify(statsRow));
  const grp = await ev(() => { const A = Lull.Achievements; return { group: A.GROUPS.some((g) => g.id === 'descent'), names: A.LIST.filter((a) => a.group === 'descent').map((a) => a.name), area: getComputedStyle(document.documentElement).getPropertyValue('--area-descent').trim() }; });
  check('the achievements: a Descent group of seven, its place colour', grp.group && grp.names.length === 7 && !!grp.area, JSON.stringify(grp));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.setTab('play'); });
  await D.ctx.close();

  // ---- the frames: four sizes, both themes (a Hard stage running; the Ready card; the window's Mode tab) -------------------
  const SIZES = [[520, 760], [400, 700], [390, 844], [320, 568]];
  const PLAY = { w: 10, h: 20, level: 'hard', stage: 12, seed: 3, still: true,
    lanes: [[11, 'gkdgg'], [14, 'pgdgg'], [12, 'wgaag'], [16, 'gg'], [13, 'rggeg'], [15, 'adgg'], [12, 'gegpg'], [14, 'kggg'], [17, 'gg'], [13, 'dgwg']],
    rows: ['ZZ.LLLJJJ#', 'IZZL.TJ.SS', 'I..TTT..S#', 'I.........'], piece: ['T', 3, 8, 0] };
  for (const [vw, vh] of SIZES) for (const theme of ['light', 'dark']) {
    const phone = vw < 500;
    const F = await open(Object.assign({ viewport: { width: vw, height: vh } }, phone ? { hasTouch: true, isMobile: true } : {}), theme);
    await F.ev(SCENE, Object.assign({}, PLAY, { D: { tk: 913 } }));
    await F.ev(() => { const D = Lull.Descent.of(Lull.app.modes.play.game); D.lanes[2].next = 12; D.lanes[5].next = 8; Lull.app.modes.play.renderStatus(); Lull.app.modes.play.view.dirty = true; });
    await F.page.waitForTimeout(80);
    const fit = await F.ev(() => {
      const bar = document.querySelector('#play-status'), r = bar.getBoundingClientRect(), cv = Lull.app.modes.play.view.canvas.getBoundingClientRect();
      const boards = document.querySelector('#play-status .menu-btn').getBoundingClientRect();
      return { bar: r.right <= window.innerWidth + 0.5 && boards.right <= window.innerWidth + 0.5, page: document.documentElement.scrollWidth <= window.innerWidth, board: cv.width > 100 && cv.bottom <= window.innerHeight };
    });
    check(vw + ' × ' + vh + ' ' + theme + ': the status bar and the board fit, no sideways scroll', fit.bar && fit.page && fit.board, JSON.stringify(fit));
    await F.shot('descent-play-' + vw + 'x' + vh + '-' + theme);
    if (phone) {
      // 44 px targets: the status bar's Pause, the card's buttons, the window's stage stepper; a tap on the card starts.
      const target44 = (sel) => F.ev((q) => {
        const el = document.querySelector(q);
        if (!el) return false;
        const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        return [[-21, 0], [21, 0], [0, -21], [0, 21], [-14, -14], [14, 14], [-14, 14], [14, -14]].every(([dx, dy]) => { const t = document.elementFromPoint(cx + dx, cy + dy); return t && (t === el || el.contains(t)); });
      }, sel);
      const pauseT = await target44('#play-status .ds-pause');
      await F.ev(SCENE, Object.assign({}, PLAY, { still: false }));
      await F.page.waitForTimeout(60);
      const goT = await target44('#ds-go');
      await F.shot('descent-ready-' + vw + 'x' + vh + '-' + theme);
      const box = await F.ev(() => { const r = document.querySelector('#ds-go').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await F.page.touchscreen.tap(box.x, box.y);
      await F.page.waitForTimeout(500);
      const tapped = { card: await card(F.ev), tk: await tk(F.ev) };
      check(vw + ' × ' + vh + ': Pause and Start are 44 px targets; a tap on Start starts the clock', pauseT && goT && !tapped.card.open && tapped.tk > 0, JSON.stringify({ pauseT, goT, tapped }));
      await F.ev(() => { const B = Lull.app.store.state.boards; B.recipe = Lull.Recipe.normalize({ mode: 'descent', descent: { level: 'medium', stage: 4 } }); B.size = { w: 10, h: 20 }; Lull.app.store.state.stats.free.descent.stages.medium = [1, 2, 3, 4]; Lull.app.modes.play.openNewBoard(); });
      await F.page.waitForTimeout(150);
      await F.ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
      await F.page.waitForTimeout(100);
      const nb = await F.ev(() => {
        const m = document.querySelector('.modal-newboard'), r = m.getBoundingClientRect(), panel = m.querySelector('.nb-panel');
        const hs = [...m.querySelectorAll('.nb-mode, .nb-level, .ds-step .nb-step')].map((b) => b.getBoundingClientRect());
        const step = m.querySelector('.ds-step').getBoundingClientRect(), pr = panel.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, vh: window.innerHeight, minH: Math.min(...hs.map((b) => b.height)), minW: Math.min(...[...m.querySelectorAll('.ds-step .nb-step')].map((b) => b.getBoundingClientRect().width)), stepIn: step.bottom <= pr.bottom + 0.5, scrolls: panel.scrollHeight > panel.clientHeight + 1, done: m.querySelector('.ds-val').classList.contains('done') };
      });
      check(vw + ' × ' + vh + ': the window’s Mode tab on Descent fits (44 px targets, the stage stepper in the panel, nothing scrolls; stage 4 marked cleared)', nb.top >= 0 && nb.bottom <= nb.vh && nb.minH >= 43.5 && nb.minW >= 43.5 && nb.stepIn && !nb.scrolls && nb.done, JSON.stringify(nb));
      await F.shot('descent-newboard-' + vw + 'x' + vh + '-' + theme);
    } else {
      await F.ev(SCENE, Object.assign({}, PLAY, { still: false }));
      await F.page.waitForTimeout(60);
      await F.shot('descent-ready-' + vw + 'x' + vh + '-' + theme);
    }
    await F.ctx.close();
  }

  // ---- reduced motion: no shimmer (a still frame twice is the same), breaks fade --------------------------------------------
  const M = await open({ reducedMotion: 'reduce' });
  await M.ev(SCENE, { w: 10, h: 20, level: 'easy', stage: 1, go: true, lanes: Array.from({ length: 10 }, () => [14, 'ggg', 1e6]), rows: ['LLLLLLLLL.'] });
  const rm = await M.ev(() => {
    const m = Lull.app.modes.play, g = m.game, v = m.view;
    const px = () => { v.dirty = true; v.render(performance.now()); const [x, y] = v.toScreen(2, 16); const cv = v.canvas, dpr = cv.width / v.cssW; return Array.from(cv.getContext('2d').getImageData(Math.round(x * dpr), Math.round(y * dpr), 6, 6).data).join(); };
    const a = px();
    const t0 = performance.now(); while (performance.now() - t0 < 300) { /* time passes */ }
    const b = px();
    g.replacePiece({ id: 'I' }); g.piece.rot = 1; g.piece.x = 7; g.piece.y = 0;
    m.action('drop');
    return { reduced: m.reduced, still: a === b, shake: v.fx.shake, shards: v.fx.parts.filter((p) => p.kind === 'shard').length };
  });
  check('reduced motion: no shimmer, no shards, nothing shakes', rm.reduced && rm.still && rm.shake === 0 && rm.shards === 0, JSON.stringify(rm));
  await M.ctx.close();

  check('descent: no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
};
