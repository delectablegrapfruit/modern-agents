// Protect in the browser (js/guard.js, js/guardview.js): made in the New board window (Mode ▸ Protect ▸ a level; a
// size too small is raised to 6 × 12; the preview's sprout), the board it makes (the sprout in the pixels, Leaves and
// Time in place of Score), the clock (the Ready card; Space starts it; it runs in real time; it pauses at the Paused
// card on a blur and on P, holds under a window, and a tap starts it on a phone), a meteor's warning column drawn and
// the blocks it breaks rebuilt with a piece (booked in Stats once, through an Undo), power-ups Protect refuses, the
// Wilted card and its Undo, a reload that resumes the guard at the Paused card, the library's Wilted tag, a retired
// wilted board in full view, the phones (320 × 568, 390 × 844) with the status bar and the window, reduced motion, and
// the screenshots in both themes. Run by browser-test.cjs: require('./protect-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

/**
 * In the page: a Protect board w × h in play (level), a stack from rows of letters (bottom row first: a piece's letter
 * is its colour, '0'–'3' a mole in that slot, '.' or 'S' open or the sprout), the guard's fields given (G), meteors
 * ([x, sw, ticks to fall, rows above the floor]: fall ≤ 0 is falling), planned threats ({ in: ticks, kind, ... }), and
 * the piece in play where asked ([id, x, y, rot]). go: the clock starts (no card); still: started, but the clock held
 * still (for a picture); neither: its card (Ready, or Paused once started).
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
      if (/[0-3]/.test(c)) { g.board.set(x, y, Gd.moleCell(+c)); G.moles.push({ slot: +c, wait: 999, tx: -1, ty: -1, face: x <= G.ax ? 1 : -1 }); }
      else g.board.set(x, y, P.TYPES[c].color);
    }
  });
  Object.assign(G, o.G || {});
  if (o.digs) for (const [slot, tx, ty, wait] of o.digs) Object.assign(G.moles.find((mm) => mm.slot === slot), { tx, ty, wait });
  if (o.meteors) G.meteors = o.meteors.map(([x, sw, fall, rows]) => ({ x, sw, fall: G.tk + fall, yc: Math.round((rows == null ? g.h : rows) * 100) }));
  if (o.plan) G.plan = o.plan.map((t) => Object.assign({}, t, { at: G.tk + t.in }));
  if (o.trail) G.trail = o.trail.map(([x, y, age]) => [x, y, G.tk - age]);
  if (o.piece) { const [id, x, y, rot] = o.piece; g.piece = { type: P.get(id), rot, x, y, special: null, entry: { id, rot: 0 }, lastRot: false }; }
  g.hold = o.hold ? { id: o.hold, rot: 0 } : null;
  const ctl = m.ctl;
  if (!ctl.realRunning) ctl.realRunning = ctl.running;
  ctl.running = ctl.realRunning;
  if (o.go || o.still) ctl.go();
  else ctl.wait();
  if (o.still) ctl.running = () => false;
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

/** Rose-ish pixels in a cell of the board (x, y). */
const ROSE_AT = ([x, y]) => {
  const m = Lull.app.modes.play, v = m.view, cv = v.canvas, dpr = cv.width / v.cssW, s = v.lay.s;
  v.dirty = true; v.render(performance.now());
  const [x0, y0] = v.toScreen(x, y);
  const d = cv.getContext('2d').getImageData(Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round(s * dpr), Math.round(s * dpr)).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1] + 30 && d[i] > d[i + 2] && Math.abs(d[i] - 0xeb) < 70) n++;
  return n;
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
  const tk = (ev) => ev(() => Lull.Guard.of(Lull.app.modes.play.game).tk);
  const card = (ev) => ev(() => { const m = Lull.app.modes.play, ov = m.overlay; return { open: m.cardOpen, title: (ov.querySelector('h2') || {}).textContent, sub: (ov.querySelector('.cl-sub') || {}).textContent || null, btn: (ov.querySelector('#gd-go') || {}).textContent || null }; });

  // ---- the New board window: Mode ▸ Protect ▸ Medium; 4 × 8 raised to 6 × 12; the preview's sprout; Create ----------
  const D = await open();
  let { page, ev } = D;
  await ev(() => { const B = Lull.app.store.state.boards; B.size = { w: 4, h: 8 }; B.recipe = Lull.Recipe.normalize({}); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
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
  const made = await ev(() => { const g = Lull.app.modes.play.game, G = Lull.Guard.of(g); return { w: g.w, h: g.h, G: !!G, level: G && G.level, remembered: Lull.app.store.state.boards.recipe }; });
  check('Create makes a Protect Medium board 6 × 12, and remembers the choice', made.w === 6 && made.h === 12 && made.G && made.level === 'medium' && made.remembered.protect.level === 'medium', JSON.stringify(made));

  // ---- the Ready card: the clock waits; Space starts it, and it runs in real time ---------------------------------------
  const ready = await card(ev);
  const t0 = await tk(ev);
  await page.waitForTimeout(500);
  const t1 = await tk(ev);
  check('a new Protect board waits at its Ready card ("Protect Medium", Start), the clock still', ready.open && ready.title === 'Protect Medium' && /^Start/.test(ready.btn) && t0 === 0 && t1 === 0, JSON.stringify({ ready, t0, t1 }));
  await D.shot('protect-ready-520x760');
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  const ta = await tk(ev);
  await page.waitForTimeout(1000);
  const tb = await tk(ev);
  const go = await card(ev);
  check('Space starts the clock: no card, and it runs about ten ticks a second, no piece set', !go.open && tb - ta >= 7 && tb - ta <= 13 && (await ev(() => Lull.app.modes.play.game.s.pieces)) === 0, JSON.stringify({ ta, tb }));

  // ---- the status bar: Leaves and Time in place of Score, a Pause button -----------------------------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', still: true });
  const px = await ev(SPROUT_PIXELS);
  check('the sprout is drawn on the board (leaf green in its cells)', px.n > px.of * 0.05, JSON.stringify(px));
  const bar = await ev(() => ({ labels: [...document.querySelectorAll('#play-status .stats .stat i')].map((i) => i.textContent.trim()), leaves: (document.querySelector('#play-status .stat.leaves b') || {}).textContent, time: (document.querySelector('#play-status .gd-time b') || {}).textContent, tip: (document.querySelector('#play-status .stat.leaves') || { dataset: {} }).dataset.tip, pause: !!document.querySelector('#play-status .gd-pause') }));
  check('the status bar: Leaves (3) and Time (0:00) in place of Score, its tip the calm before wave 1, a Pause button', bar.labels.includes('Leaves') && bar.labels.includes('Time') && !bar.labels.includes('Score') && bar.leaves === '3' && bar.time === '0:00' && bar.tip === 'Calm · 8 s to wave 1' && bar.pause, JSON.stringify(bar));

  // ---- pausing: a blur shows the Paused card and stops the clock; P too; a window only holds it ------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', go: true });
  await page.waitForTimeout(400);
  await ev(() => window.dispatchEvent(new Event('blur')));
  const p1 = await card(ev), pa = await tk(ev);
  await page.waitForTimeout(500);
  const pb = await tk(ev);
  check('a blur pauses: the Paused card (the time and the wave), the clock stops', p1.open && p1.title === 'Paused' && /^0:0\d · Before wave 1$/.test(p1.sub) && /^Resume/.test(p1.btn) && pa === pb && pa > 0, JSON.stringify({ p1, pa, pb }));
  await D.shot('protect-paused-520x760');
  const swallowed = await ev(() => { const m = Lull.app.modes.play, x = m.game.piece.x; m.action('left'); return m.game.piece.x === x; });
  check('while paused, the board takes no moves', swallowed);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const resumed1 = await card(ev), pc = await tk(ev);
  await page.keyboard.press('KeyP');
  const p2 = await card(ev);
  await page.keyboard.press('KeyP');
  const p3 = await card(ev);
  check('Space resumes; P pauses and P resumes', !resumed1.open && pc > pb && p2.open && p2.title === 'Paused' && !p3.open, JSON.stringify({ resumed1, p2, p3 }));
  await ev(() => Lull.app.openSettings());
  await page.waitForTimeout(100);
  const ma = await tk(ev);
  await page.waitForTimeout(400);
  const mb = await tk(ev);
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  await page.waitForTimeout(400);
  const mc = await tk(ev), mcard = await card(ev);
  check('a window over the board holds the clock; closed, it runs on with no card', ma === mb && mc > mb && !mcard.open, JSON.stringify({ ma, mb, mc }));
  await ev(() => { document.querySelector('#play-status .gd-pause').click(); });
  const pbtn = await card(ev);
  check('the Pause button pauses', pbtn.open && pbtn.title === 'Paused');

  // ---- a meteor: its column shown (rose over a thin roof), it falls in real time and breaks; the roof rebuilt ---------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', rows: ['JJJ.SSLLL.', 'J...SS.ZZL', '...LL.ZZ..'], meteors: [[4, 1, 6, 8]], G: { phase: 'wave', wave: 2, left: 200 }, still: true });
  const warnRose = await ev(ROSE_AT, [4, 2]);
  const pv = await ev(() => { const m = Lull.app.modes.play; return Lull.Guard.preview(Lull.Guard.of(m.game), m.game.board).meteors[0]; });
  check('a meteor’s warning: a rose column over the sprout’s thin roof, the cells it would break outlined', pv.hit && !pv.falling && pv.cells.length === 2 && warnRose > 20, JSON.stringify({ pv, warnRose }));
  await D.shot('protect-warning-520x760');
  const F0 = await ev(() => { const F = Lull.app.store.state.stats.free; F.guard = F.guard || {}; return { meteors: F.guard.meteors || 0, broken: F.guard.broken || 0 }; });
  await ev(() => { const m = Lull.app.modes.play; m.ctl.running = m.ctl.realRunning; });
  await page.waitForTimeout(1800);
  const hit = await ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game), b = m.game.board; return { leaves: G.leaves, roof: [b.get(3, 2), b.get(4, 2)], meteors: G.st.meteors, left: G.meteors.length }; });
  check('it falls in real time and breaks the roof; the blast reaches the sprout: a leaf', hit.meteors === 1 && hit.left === 0 && hit.roof.join() === '0,0' && hit.leaves === 2, JSON.stringify(hit));
  // Rebuild: an O over the sprout; booked once, through an Undo and the same drop again.
  const rebuilt = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, F = Lull.app.store.state.stats.free;
    Lull.app.store.state.inventory.rewind = 3;
    g.replacePiece({ id: 'O' });
    g.piece.x = 3 - g.piece.type.rotBounds[0].minX;
    m.action('drop');
    const roof = [g.board.get(3, 2), g.board.get(4, 2)];
    const s1 = F.guard.meteors;
    m.useItem('rewind');
    g.replacePiece({ id: 'O' });
    g.piece.x = 3 - g.piece.type.rotBounds[0].minX;
    m.action('drop');
    return { roof, s1, s2: F.guard.meteors, now: [g.board.get(3, 2), g.board.get(4, 2)] };
  });
  check('the roof rebuilt with a piece; Stats books the meteor once, through an Undo and the same drop again', rebuilt.roof.every((v) => v > 0) && rebuilt.now.every((v) => v > 0) && rebuilt.s1 === F0.meteors + 1 && rebuilt.s2 === rebuilt.s1, JSON.stringify({ rebuilt, F0 }));
  await ev(() => { Lull.app.modes.play.ctl.wait(); Lull.UI.renderStats(Lull.app, 'free'); });
  const statsRow = await ev(() => { const h4 = [...document.querySelectorAll('#stats-body h4')].find((x) => x.textContent === 'Protect'); return { has: !!h4, rows: h4 && h4.nextElementSibling ? [...h4.nextElementSibling.querySelectorAll('td:first-child')].map((t) => t.textContent) : [] }; });
  check('Stats ▸ Free Play has a Protect section (Time, Meteors, Boards wilted)', statsRow.has && ['Time', 'Meteors', 'Boards wilted'].every((r) => statsRow.rows.includes(r)), JSON.stringify(statsRow));

  // ---- power-ups Protect refuses: the reason, nothing spent ------------------------------------------------------------
  await ev(SCENE, { w: 10, h: 20, level: 'medium', go: true });
  const refused = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store.state;
    st.inventory.tornado = 2; st.inventory.trapdoor = 0;
    const lines = st.lines;
    m.useItem('tornado');
    const toastT = [...document.querySelectorAll('.toast')].map((t) => t.textContent).pop();
    m.useItem('trapdoor');
    return { toast: toastT, tornado: st.inventory.tornado, trapdoor: st.inventory.trapdoor, lines: st.lines === lines, why: m.game.allow('flip') };
  });
  check('Tornado, Trapdoor and Mirror World are refused ("Not in Protect"), nothing spent or bought', refused.toast === 'Not in Protect' && refused.tornado === 2 && refused.trapdoor === 0 && refused.lines && refused.why === 'Not in Protect', JSON.stringify(refused));
  await ev(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  const bare = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store.state;
    st.inventory.settle = 1;
    const lines = st.lines;
    m.useItem('settle');
    const toastT = [...document.querySelectorAll('.toast')].map((t) => t.textContent).pop();
    return { toast: toastT, settle: st.inventory.settle, lines: st.lines === lines };
  });
  check('Settle with only the sprout on the board is refused ("Nothing to settle"), nothing spent', bare.toast === 'Nothing to settle' && bare.settle === 1 && bare.lines, JSON.stringify(bare));

  // ---- the Wilted card, its Undo; a reload resumes the guard at the Paused card ------------------------------------------
  await ev(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  await ev(SCENE, { w: 10, h: 20, level: 'medium', rows: ['JJJSS.LLLL', 'J..SS...ZL', 'TTT....ZZ.', '.T.....Z..'], G: { leaves: 1, phase: 'wave', wave: 4, left: 200 }, still: true });
  // A piece set first (the Undo goes back to just before it), then a meteor over the bare sprout.
  await ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game); Lull.app.store.state.inventory.rewind = 3; m.game.replacePiece({ id: 'O' }); m.game.piece.x = 7 - m.game.piece.type.rotBounds[0].minX; m.action('drop'); G.meteors = [{ x: G.ax, sw: 1, fall: G.tk + 3, yc: 600 }]; m.ctl.running = m.ctl.realRunning; });
  const topouts0 = await ev(() => Lull.app.store.state.stats.free.topouts);
  await page.waitForTimeout(1200);
  const wilt = await ev(() => { const m = Lull.app.modes.play, ov = m.overlay; return { card: m.cardOpen, title: (ov.querySelector('h2') || {}).textContent, undo: !!ov.querySelector('#topout-undo'), over: m.game.over, kind: m.game.endKind, wilted: Lull.app.store.state.stats.free.guard.wilted, topouts: Lull.app.store.state.stats.free.topouts, tiles: [...ov.querySelectorAll('.bs .l')].map((l) => l.textContent) }; });
  check('0 leaves: the Wilted card (the summary with Time, Waves and Leaves lost; Undo, Boards, Retire), counted as wilted, not as a full board', wilt.card && wilt.title === 'Wilted' && wilt.undo && wilt.over && wilt.kind === 'wilted' && wilt.wilted >= 1 && wilt.topouts === topouts0 && ['Time', 'Waves', 'Leaves lost', 'Board'].every((t) => wilt.tiles.includes(t)), JSON.stringify(wilt));
  await D.shot('protect-wilted-520x760');
  await ev(() => Lull.app.modes.play.openLibrary());
  await page.waitForTimeout(150);
  const row = await ev(() => { const r = document.querySelector('.modal-lib .lib-row.current'); return { tags: [...r.querySelectorAll('.tag')].map((t) => t.textContent), sz: r.querySelector('.sz').textContent }; });
  check('the library row: Wilted (not Full), and "Protect Medium" after its size', row.tags.includes('Wilted') && !row.tags.includes('Full') && /10 × 20 · Protect Medium/.test(row.sz), JSON.stringify(row));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  await page.click('#topout-undo');
  await page.waitForTimeout(100);
  const undone = await ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game); return { card: m.cardOpen, over: m.game.over, leaves: G.leaves, tag: document.querySelector('#play-status .stat.leaves b').textContent, meteors: G.meteors.length }; });
  check('Undo on the Wilted card: the leaf is back (the clock back to before the last piece), the board plays on', !undone.card && !undone.over && undone.leaves === 1 && undone.tag === '1' && undone.meteors === 0, JSON.stringify(undone));
  const saved = await ev(() => { const m = Lull.app.modes.play; m.ctl.wait(); m.persist(); return JSON.stringify(Lull.Guard.of(m.game)); });
  await page.reload();
  await page.waitForTimeout(500);
  const resumed = await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const m = Lull.app.modes.play; return { G: JSON.stringify(Lull.Guard.of(m.game)), leaves: (document.querySelector('#play-status .stat.leaves b') || {}).textContent, title: (m.overlay.querySelector('h2') || {}).textContent, open: m.cardOpen }; });
  check('a reload resumes the guard exactly (the clock, its plan, moles and leaves), at the Paused card', resumed.G === saved && resumed.leaves === '1' && resumed.open && resumed.title === 'Paused', resumed.G.slice(0, 120));

  // ---- a wilted board retired: its record, and the full view says Wilted ------------------------------------------------
  await ev(() => { for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
  await ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game); m.ctl.go(); m.game.replacePiece({ id: 'O' }); m.game.piece.x = 7 - m.game.piece.type.rotBounds[0].minX; m.action('drop'); G.meteors = [{ x: G.ax, sw: 1, fall: G.tk + 1, yc: 300 }]; });
  await page.waitForTimeout(800);
  await ev(() => { [...Lull.app.modes.play.overlay.querySelectorAll('.btn')].find((b) => b.textContent.trim() === 'Retire').click(); });
  await page.waitForTimeout(150);
  const retired = await ev(() => { const B = Lull.app.store.state.boards, e = B.retired[0], g = Lull.app.modes.play.game, m = Lull.app.modes.play; return { reason: e.reason, recipe: e.recipe.mode, waves: e.sum.ext && e.sum.ext.protect && e.sum.ext.protect.waves, ms: e.sum.ext && e.sum.ext.protect && e.sum.ext.protect.ms, next: g.recipe.mode, fresh: Lull.Guard.of(g).leaves, id: e.id, log: Lull.app.store.state.stats.free.boardLog[0].reason, title: (m.overlay.querySelector('h2') || {}).textContent }; });
  check('Retire on the Wilted card: retired as wilted with its numbers; the next board is Protect too, at its Ready card', retired.reason === 'wilted' && retired.recipe === 'protect' && retired.waves != null && retired.ms > 0 && retired.next === 'protect' && retired.fresh === 3 && retired.log === 'wilted' && retired.title === 'Protect Medium', JSON.stringify(retired));
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
  await D.ctx.close();

  // ---- dark: moles burrowing (a bite in the block, the tunnel), a meteor falling ----------------------------------------
  const MOLES = { w: 12, h: 20, level: 'hard', seed: 4, rows: ['JJ.LL.SS.JJ1', 'J0LLZZSSJJZZ', 'JJJZZIIIIZZT', 'OO.I.....TTT', 'OO.I........', '...I........'],
    G: { phase: 'wave', wave: 3, left: 140, leaves: 2 }, digs: [[0, 2, 1, 6], [1, 10, 0, 3]], trail: [[2, 0, 5], [8, 0, 10]], meteors: [[3, 1, 0, 9.4], [8, 2, 6]], plan: [{ in: 5, kind: 'mole', side: 0 }], piece: ['L', 5, 14, 0], hold: 'I' };
  const K = await open({}, 'dark');
  await K.ev(SCENE, Object.assign({}, MOLES, { still: true }));
  await K.page.waitForTimeout(60);
  await K.shot('protect-moles-520x760-dark');
  const px2 = await K.ev(SPROUT_PIXELS);
  check('dark theme: the sprout in its own leaf green', px2.n > px2.of * 0.05, JSON.stringify(px2));
  // The mole digging is drawn with its bite: the block it eats is darker at the mole's side than at the far side.
  const bite = await K.ev(() => {
    const m = Lull.app.modes.play, v = m.view, cv = v.canvas, dpr = cv.width / v.cssW, s = v.lay.s;
    v.dirty = true; v.render(performance.now());
    const lum = (x, y) => { const d = cv.getContext('2d').getImageData(Math.round(x * dpr), Math.round(y * dpr), 2, 2).data; return d[0] + d[1] + d[2]; };
    const [sx, sy] = v.toScreen(2, 1);
    return { near: lum(sx + 2, sy + s / 2), far: lum(sx + s - 3, sy + s / 2) };
  });
  check('a mole’s bite shows in the block it is eating', bite.near < bite.far, JSON.stringify(bite));
  // Running: a few seconds on Hard and the moles eat on, meteors break blocks, all on the clock.
  await K.ev(() => { const m = Lull.app.modes.play; m.ctl.running = m.ctl.realRunning; });
  await K.page.waitForTimeout(2500);
  const ran = await K.ev(() => { const G = Lull.Guard.of(Lull.app.modes.play.game); return { eaten: G.st.eaten, meteors: G.st.meteors, tk: G.tk, pieces: Lull.app.modes.play.game.s.pieces }; });
  check('on the clock, with no piece set: moles eat blocks and meteors break them', ran.eaten >= 1 && ran.meteors >= 1 && ran.pieces === 0 && ran.tk >= 20, JSON.stringify(ran));
  await K.shot('protect-running-520x760-dark');
  await K.ctx.close();

  // ---- phones: 320 × 568 (an odd width), 390 × 844 dark; a tap starts the clock; the window's level row ----------------
  const T = await open({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await T.ev(SCENE, { w: 11, h: 22, level: 'easy', seed: 6, rows: ['JJJ.SSSLLLL', 'J.T.SSS...L', '.TTT....1..', '...........'], G: { phase: 'calm', wave: 2, left: 50, leaves: 3, started: true, tk: 754 }, meteors: [[1, 1, 12]], piece: ['S', 4, 17, 0] });
  const tcard = await card(T.ev);
  const odd = await T.ev(() => { const G = Lull.Guard.of(Lull.app.modes.play.game); const bar = document.querySelector('#play-status'); const r = bar.getBoundingClientRect(); return { sw: G.sw, ax: G.ax, fits: r.right <= window.innerWidth + 0.5 && bar.scrollWidth <= bar.clientWidth + 1, time: document.querySelector('#play-status .gd-time b').textContent, tip: document.querySelector('#play-status .stat.leaves').dataset.tip }; });
  check('320 × 568, an odd width: the sprout 3 wide and centred; the status bar fits (Time 1:15); the Paused card', odd.sw === 3 && odd.ax === 4 && odd.fits && odd.time === '1:15' && odd.tip === 'Calm · 5 s to wave 3' && tcard.open && tcard.title === 'Paused', JSON.stringify({ odd, tcard }));
  await T.shot('protect-320x568-paused');
  /** A control a finger uses: the 44 × 44 around its middle lands on it. */
  const target44 = (sel) => T.ev((q) => {
    const el = document.querySelector(q), b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    return [[-21, 0], [21, 0], [0, -21], [0, 21], [-14, -14], [14, 14], [-14, 14], [14, -14]].every(([dx, dy]) => { const t = document.elementFromPoint(cx + dx, cy + dy); return t && (t === el || el.contains(t)); });
  }, sel);
  const t44 = { resume: await target44('#gd-go'), pause: await target44('#play-status .gd-pause') };
  const box = await T.ev(() => { const r = document.querySelector('#gd-go').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await T.page.touchscreen.tap(box.x, box.y);
  await T.page.waitForTimeout(600);
  const tapped = await card(T.ev), ttk = await tk(T.ev);
  check('a phone: Resume and Pause are 44 px targets; a tap on Resume starts the clock', t44.resume && t44.pause && !tapped.open && ttk > 754, JSON.stringify({ t44, tapped, ttk }));
  await T.ev(() => { const m = Lull.app.modes.play; m.ctl.running = () => false; m.view.dirty = true; });
  const px3 = await T.ev(SPROUT_PIXELS);
  check('320 × 568: the sprout is drawn', px3.n > px3.of * 0.04, JSON.stringify(px3));
  await T.shot('protect-320x568-odd');
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

  const I = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'dark');
  await I.ev(SCENE, Object.assign({}, MOLES, { w: 10, rows: ['JJ.LSSL.J1', 'J0LLSSJJZZ', 'JJJZZIIIIZ', 'OO.I...TTT'], digs: [[0, 2, 1, 6], [1, 8, 0, 3]], trail: [[2, 0, 5], [7, 0, 10]], meteors: [[3, 1, 0, 9.4], [6, 2, 6]], piece: ['L', 4, 14, 0], still: true }));
  const iphone = await I.ev(() => { const bar = document.querySelector('#play-status'), r = bar.getBoundingClientRect(), cv = Lull.app.modes.play.view.canvas.getBoundingClientRect(); return { fits: r.right <= window.innerWidth + 0.5 && bar.scrollWidth <= bar.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth, board: cv.width > 200 }; });
  check('390 × 844 dark: the status bar fits, no sideways scroll, the board drawn', iphone.fits && iphone.board, JSON.stringify(iphone));
  await I.shot('protect-390x844-dark');
  await I.ctx.close();

  // ---- reduced motion: a meteor breaks blocks with a short fade, nothing shakes ------------------------------------------
  const M = await open({ reducedMotion: 'reduce' });
  await M.ev(SCENE, { w: 10, h: 20, level: 'hard', seed: 8, rows: ['ZZ..SSLLLL', '.ZZ.SS...L', '....LLL...', '....LL....'], G: { phase: 'wave', wave: 2, left: 60, leaves: 2 }, meteors: [[4, 2, 0, 5]], go: true });
  await M.page.waitForTimeout(450);
  const rm = await M.ev(() => { const m = Lull.app.modes.play, G = Lull.Guard.of(m.game); return { reduced: m.reduced, shake: m.view.fx.shake, broke: G.st.broken, leaves: G.leaves }; });
  await M.shot('protect-reduced-520x760');
  check('reduced motion: the meteor breaks its blocks and nothing shakes', rm.reduced && rm.shake === 0 && rm.broke >= 2, JSON.stringify(rm));
  await M.ctx.close();

  check('protect: no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
};
