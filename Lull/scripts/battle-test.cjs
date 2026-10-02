// Battle in the browser (js/battle.js, js/battleview.js): made in the New board window (Mode ▸ Battle ▸ a level; Rows;
// the presets), the Ready card and its 3-2-1, Send (S, Shift+S, a tap or click on the first Next slot), pausing (a
// window, the window losing focus, a reload resumes paused), no control hints, a touch that starts on the opponent's
// half moving your piece, the End card and Rematch, both boards' cells within their targets at four window sizes with
// Send 44 px, the opponent's time slices under a 4× slower CPU, and the screenshots (10 × 10 at four sizes in both
// themes, Long with Pentominoes at 320 × 568, a sealed gap's hatch, a filler, the cards, reduced motion).
// Run by browser-test.cjs: require('./battle-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

/** In the page: a Battle board w × rows in play at a level (and shapes), the round on (phase), cards closed. */
const SCENE = (o) => {
  const app = Lull.app, m = app.modes.play, R = Lull.Recipe, B = Lull.Battle;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  m.setGame(new Lull.Game({ w: o.w || 10, h: o.rows || 10, seed: o.seed || 5, recipe: R.normalize({ mode: 'battle', battle: { level: o.level || 'steady' }, shapes: { preset: o.shapes || 'normal' } }), previewCount: m.settings.preview }));
  const M = B.matchOf(m.game);
  if (o.play) {
    M.round.phase = 'play';
    Object.assign(m.ctl, { paused: false, count: null });
    m.hideCard();
    m.renderItems();
  }
  m.view.dirty = true;
  m.view.resize(); m.view.render(performance.now());
  return { h: m.game.h, goal: B.goal(m.game) };
};

module.exports = async function battleTests({ browser, check, PAGE, OUT }) {
  console.log('battle');
  const errors = [];
  const open = async (o, theme) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: theme || 'dark' }, o || {}));
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
    }, theme || 'dark');
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, ev, shot };
  };
  const D = await open();
  let { page, ev, shot } = D;

  // ---- the New board window: Mode ▸ Battle ▸ Brisk, Rows, the presets, Create --------------------------------------------
  await ev(() => { const B = Lull.app.store.state.boards; B.size = { w: 10, h: 20 }; B.recipe = Lull.Recipe.normalize({}); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
  await ev(() => { document.querySelector('.nb-tab[data-tab="mode"]').click(); document.querySelector('.nb-mode[data-value="battle"]').click(); });
  await page.waitForTimeout(80);
  await ev(() => document.querySelector('.nb-level[data-value="brisk"]').click());
  const win = await ev(() => ({ levels: [...document.querySelectorAll('.nb-lvl button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(), rows: document.querySelectorAll('.nb-label')[1].textContent, size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x') }));
  await ev(() => document.querySelector('.nb-tab[data-tab="size"]').click());
  await page.waitForTimeout(80);
  const presets = await ev(() => [...document.querySelectorAll('.nb-preset')].map((b) => b.querySelector('b').textContent + ' ' + b.querySelector('span').textContent).join(', '));
  await ev(() => document.querySelector('.nb-preset[data-w="8"][data-h="8"]').click());
  await shot('battle-newboard');
  await ev(() => document.querySelector('.modal-newboard footer .btn.primary').click());
  await page.waitForTimeout(250);
  const made = await ev(() => { const m = Lull.app.modes.play, g = m.game, B = Lull.Battle; return { w: g.w, h: g.h, goal: B.goal(g), level: B.matchOf(g).level, card: (document.querySelector('#play-overlay .card') || {}).textContent || '', label: Lull.Recipe.label(g.recipe) }; });
  check('New board: Mode ▸ Battle with its levels (Steady first), Height named Rows, a Battle size (10 × 10), the presets Quick, Standard and Long',
    win.levels === 'Easy,Steady,Brisk*,Swift' && win.rows === 'Rows' && win.size === '10x10' && presets === 'Quick 8 × 8, Standard 10 × 10, Long 10 × 12', JSON.stringify({ win, presets }));
  check('Create makes the board: 8 × 8 rows under a 4-row buffer, against Brisk, at the Ready card', made.w === 8 && made.h === 12 && made.goal === 8 && made.level === 'brisk' && /Battle/.test(made.card) && /vs Brisk/.test(made.card) && made.label === 'Battle · Brisk', JSON.stringify(made));
  const lib = await ev(() => { const m = Lull.app.modes.play; m.openLibrary(); const row = document.querySelector('.lib-row.current'); const out = { sz: row.querySelector('.sz').textContent, edit: !!row.querySelector('[aria-label="Edit rules"]') }; Lull.UI.closeTopModal(); return out; });
  check('the library row says the board\'s own size and Battle, and offers no Edit rules', /^8 × 8/.test(lib.sz) && /Battle/.test(lib.sz) && !lib.edit, JSON.stringify(lib));

  // ---- the Ready card, Space, 3-2-1 ----------------------------------------------------------------------------------------
  await shot('battle-ready');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const count = await ev(() => (document.querySelector('#play-overlay .bt-count') || {}).textContent || '');
  await page.waitForTimeout(3300);
  const started = await ev(() => { const m = Lull.app.modes.play; return { phase: Lull.Battle.matchOf(m.game).round.phase, card: m.cardOpen, running: m.ctl.running() }; });
  check('Space at the Ready card counts down 3-2-1, then the round is on', count === '3' && started.phase === 'play' && !started.card && started.running, JSON.stringify({ count, started }));

  // ---- Send: S, Shift+S, the first Next slot ---------------------------------------------------------------------------------
  await ev(SCENE, { play: true, level: 'easy' });
  const sendS = await ev(() => { const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game); return { cur: m.game.piece.type.id, next: m.game.queue[0].id }; });
  await page.keyboard.press('KeyS');
  const afterS = await ev(() => { const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game); return { cur: m.game.piece.type.id, recv: M.ai.game.queue[0].id, received: !!M.ai.game.queue[0].received, cd: M.me.S.cd, aria: document.querySelector('.bt-send').getAttribute('aria-disabled'), h: document.querySelector('.bt-send').getBoundingClientRect().height }; });
  check('S sends the piece in play to the front of the opponent\'s queue; Send waits 6 pieces; the button is 44 px', afterS.cur === sendS.next && afterS.recv === sendS.cur && afterS.received && afterS.cd === 6 && afterS.aria === 'true' && Math.round(afterS.h) >= 44, JSON.stringify({ sendS, afterS }));
  await ev(() => { Lull.Battle.matchOf(Lull.app.modes.play.game).me.S.cd = 0; Lull.app.modes.play.renderItems(); });
  const beforeShift = await ev(() => Lull.app.modes.play.game.queue[0].id);
  await page.keyboard.down('Shift'); await page.keyboard.press('KeyS'); await page.keyboard.up('Shift');
  const afterShift = await ev(() => { const m = Lull.app.modes.play, M = Lull.Battle.matchOf(m.game); return { q: M.ai.game.queue.slice(0, 2).map((e) => e.id + (e.received ? '*' : '')), hold: m.game.hold }; });
  check('Shift+S sends the first Next piece (after the one sent before it); Shift let go after S does not hold', afterShift.q[1] === beforeShift + '*' && afterShift.q[0] === sendS.cur + '*' && !afterShift.hold, JSON.stringify({ beforeShift, afterShift }));
  await page.keyboard.press('Shift');
  const held = await ev(() => !!Lull.app.modes.play.game.hold);
  check('Shift alone still holds', held);
  await ev(() => { Lull.Battle.matchOf(Lull.app.modes.play.game).me.S.cd = 0; Lull.app.modes.play.renderItems(); });
  const slot = await ev(() => { const m = Lull.app.modes.play, r = m.canvas.getBoundingClientRect(), b = m.ctl.nextSlot(); return { x: r.left + b.x + b.w / 2, y: r.top + b.y + b.h / 2, id: m.game.queue[0].id }; });
  await page.mouse.click(slot.x, slot.y);
  const afterClick = await ev(() => { const M = Lull.Battle.matchOf(Lull.app.modes.play.game); return { last: M.ai.game.queue.filter((e) => e.received).map((e) => e.id), cd: M.me.S.cd }; });
  check('a click on the first Next slot sends that piece', afterClick.cd === 6 && afterClick.last.length === 3 && afterClick.last[2] === slot.id, JSON.stringify({ slot, afterClick }));

  // ---- pausing: a window, the window losing focus, a reload ------------------------------------------------------------------
  await ev(SCENE, { play: true });
  await ev(() => Lull.app.openSettings());
  await page.waitForTimeout(120);
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  await page.waitForTimeout(80);
  const modalPaused = await ev(() => ({ paused: Lull.app.modes.play.ctl.paused, card: (document.querySelector('#play-overlay .card h2') || {}).textContent }));
  await shot('battle-paused');
  await ev(SCENE, { play: true });
  await ev(() => window.dispatchEvent(new Event('blur')));
  const blurPaused = await ev(() => ({ paused: Lull.app.modes.play.ctl.paused, card: (document.querySelector('#play-overlay .card h2') || {}).textContent }));
  check('a window over the board pauses it; so does the window losing focus (the Paused card)', modalPaused.paused && modalPaused.card === 'Paused' && blurPaused.paused && blurPaused.card === 'Paused', JSON.stringify({ modalPaused, blurPaused }));
  await ev(() => { const m = Lull.app.modes.play; m.game.drop(); m.save(); Lull.app.saveNow(); });
  await page.reload();
  await page.waitForTimeout(500);
  const reloaded = await ev(() => { const m = Lull.app.modes.play, M = Lull.Battle.matchOf(m.game); return { battle: !!M, phase: M && M.round.phase, card: (document.querySelector('#play-overlay .card h2') || {}).textContent, pieces: m.game.s.pieces, ai: !!(M && M.ai.game.piece) }; });
  check('a reload resumes the round paused', reloaded.battle && reloaded.phase === 'play' && reloaded.card === 'Paused' && reloaded.pieces === 1 && reloaded.ai, JSON.stringify(reloaded));
  await ev(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; });

  // ---- no control hints --------------------------------------------------------------------------------------------------------
  await ev(SCENE, { play: true });
  await ev(() => { Lull.app.store.state.settings.hints = true; Lull.app.hints.sync(); });
  for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('KeyX'); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  const hints = await ev(() => !!document.querySelector('.lhint.show'));
  check('no control hints on a Battle board', !hints);
  await ev(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });

  // ---- the End card and Rematch ------------------------------------------------------------------------------------------------
  await ev(SCENE, { play: true, w: 8, rows: 8, level: 'steady' });
  const ended = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, P = Lull.Pieces;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!(y >= 6 && x >= 6)) g.board.set(x, y, 3);
    const t = P.get('O');
    g.piece = { type: t, rot: 0, x: 6 - t.rotBounds[0].minX, y: g.h - 1 - t.rotBounds[0].maxY, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    const before = Lull.app.store.state.stats.lines.battle;
    g.drop();
    const M = Lull.Battle.matchOf(g);
    return { phase: M.round.phase, winner: M.round.winner, card: document.querySelector('#play-overlay .card').textContent, paid: Lull.app.store.state.stats.lines.battle - before, tally: Lull.Battle.tallyText(M), picker: document.querySelectorAll('.bt-pick button').length };
  });
  await shot('battle-end');
  check('a full board wins the round: the End card (You win, the tally, +lines), its opponent picker, paid once for the board as it ends', ended.phase === 'end' && ended.winner === 'me' && /You win/.test(ended.card) && /vs Steady 1–0/.test(ended.card) && ended.picker === 4 && Math.abs(ended.paid - Math.round(64 / 10 * 0.55 * 100) / 100) < 0.011, JSON.stringify(ended));
  await ev(() => document.querySelector('.bt-pick [data-level="swift"]').click());
  await ev(() => document.querySelector('#bt-again').click());
  await page.waitForTimeout(3400);
  const re = await ev(() => { const m = Lull.app.modes.play, g = m.game, M = Lull.Battle.matchOf(g); return { phase: M.round.phase, n: M.round.n, empty: Lull.Battle.fillOf(g), level: M.level, label: Lull.Recipe.label(g.recipe), card: m.cardOpen }; });
  check('Rematch: a new round against the opponent picked (Swift), both boards empty, after 3-2-1', re.phase === 'play' && re.n === 2 && re.empty === 0 && re.level === 'swift' && re.label === 'Battle · Swift' && !re.card, JSON.stringify(re));

  // ---- the hatch and a filler -------------------------------------------------------------------------------------------------
  await ev(SCENE, { play: true, level: 'easy' });
  await ev(() => {
    const m = Lull.app.modes.play, g = m.game, B = Lull.Battle, M = B.matchOf(g);
    const rows = ['#.########', '##########', '####.#####', '##########'];
    rows.forEach((row, y) => { for (let x = 0; x < 10; x++) if (row[x] === '#') g.board.set(x, y, 1 + (x % 7)); });
    M.me.ver++;
    Object.assign(m.ctl, { paused: true }); m.view.dirty = true; m.view.render(performance.now());
  });
  await page.waitForTimeout(100);
  await ev(() => { Lull.app.modes.play.hideCard(); Lull.app.modes.play.view.dirty = true; });
  await page.waitForTimeout(100);
  await shot('battle-hatch');
  const fill = await ev(() => { const m = Lull.app.modes.play, g = m.game, B = Lull.Battle, M = B.matchOf(g); const before = B.sealedOf(g).n; M.me.S.charges = 1; const f = B.fire(M.me); m.ctl.showFills(f, m.view); return { before, after: B.sealedOf(g).n, cell: g.board.get(1, 0) === B.FILL }; });
  await page.waitForTimeout(120);
  await shot('battle-filler');
  check('a sealed gap is hatched; a filler fills it (stone)', fill.before === 2 && fill.after === 1 && fill.cell, JSON.stringify(fill));

  // ---- the opponent's slices under a 4× slower CPU -----------------------------------------------------------------------------
  {
    const cdp = await D.ctx.newCDPSession(page);
    await ev(SCENE, { play: true, level: 'swift' });
    // Warmed up first (the page's code compiled, as after a few pieces of play).
    await ev(() => { const B = Lull.Battle, M = B.matchOf(Lull.app.modes.play.game); for (let i = 0; i < 12; i++) B.runAll(B.think(M.ai, M.me, {})); });
    await page.waitForTimeout(1500);
    // Beside it, a trivial generator (30 µs a step) sliced the same way: what the page itself costs a slice then (a
    // collection, the throttled timer), the floor no slicing gets under.
    await ev(() => {
      const c = Lull.app.modes.play.ctl; c.sliceMax = 0; c.slices = 0; c.sliceLog = [];
      window.__floor = [];
      const g = (function* () { for (;;) { const t = performance.now(); while (performance.now() - t < 0.03); yield; } })();
      const tick = () => { if (!window.__floor) return; window.__floor.push(Lull.Battle.slice(g, 0.75).ms); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(9000);
    const sl = await ev(() => {
      const c = Lull.app.modes.play.ctl, M = Lull.Battle.matchOf(Lull.app.modes.play.game), f = window.__floor.slice().sort((a, b) => a - b);
      window.__floor = null;
      const l = c.sliceLog.slice().sort((a, b) => a - b), q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
      return { n: l.length, p50: q(l, 0.5), p90: q(l, 0.9), max: l[l.length - 1], floorMax: f[f.length - 1], floorP90: q(f, 0.9), ai: M.ai.S.pieces + M.ai.S.sends };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log('       the opponent (Swift) under a 4× slower CPU: ' + sl.n + ' slices, p50 ' + sl.p50 + ' ms, p90 ' + sl.p90 + ' ms, the longest ' + sl.max.toFixed(1) + ' ms (a trivial generator beside it: p90 ' + sl.floorP90.toFixed(1) + ' ms, the longest ' + sl.floorMax.toFixed(1) + ' ms); ' + sl.ai + ' pieces');
    check('the opponent thinks in slices of 3 ms or less under a 4× slower CPU (p90 under 3 ms; the longest no longer than the page\'s own floor allows), and still plays',
      sl.n > 10 && sl.p90 <= 3 && sl.max <= Math.max(3, sl.floorMax + 1) && sl.ai >= 2, JSON.stringify(sl));
  }
  await D.ctx.close();

  // ---- four window sizes, both themes: cells within target, Send 44 px; the screenshots --------------------------------------
  const sizes = [[520, 760, false], [400, 700, false], [390, 844, true], [320, 568, true]];
  for (const [w, hh, touch] of sizes) for (const theme of ['dark', 'light']) {
    const V = await open({ viewport: { width: w, height: hh }, hasTouch: touch, isMobile: touch }, theme);
    const at = (o) => V.ev(SCENE, Object.assign({ play: true }, o));
    await at({});
    // A few pieces on both boards, so the frame shows play.
    await V.ev(() => { const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game); for (let i = 0; i < 5; i++) { m.game.drop(); const d = B.runAll(B.think(M.ai, M.me, { send: false })); const r = B.act(M.ai, M.me, d); if (r.res) B.afterLock(M.ai, M.me, r.res); } M.me.ver++; m.ctl.paused = true; m.view.dirty = true; });
    await V.page.waitForTimeout(150);
    const lay = await V.ev(() => { const m = Lull.app.modes.play; m.view.render(performance.now()); const b = document.querySelector('.bt-send').getBoundingClientRect(), bar = document.querySelector('#itembar').getBoundingClientRect(); return { s: m.view.lay.s, so: m.view.battle.opp.lay.s, send: [Math.round(b.width), Math.round(b.height)], fits: b.right <= bar.right + 1 && b.left >= bar.left - 1, sw: document.documentElement.scrollWidth <= window.innerWidth }; });
    const target = w >= 500 ? [18, 9] : w >= 390 ? [14, 7] : [11, 5.5];
    if (theme === 'dark') check(w + ' × ' + hh + ': your cells ' + lay.s + ' px, theirs ' + lay.so + ' px (at least ' + target.join(' and ') + '), Send ' + lay.send.join(' × ') + ', nothing wider than the window',
      lay.s >= target[0] && lay.so >= target[1] && lay.so <= lay.s && lay.send[1] >= 44 && lay.send[0] >= 44 && lay.fits && lay.sw, JSON.stringify(lay));
    if (OUT) await V.page.screenshot({ path: path.join(OUT, 'battle-' + w + 'x' + hh + '-' + theme + '.png') });
    if (w === 320 && theme === 'dark') {
      await at({ w: 10, rows: 12, shapes: 'pentominoes' });
      const long = await V.ev(() => { const m = Lull.app.modes.play; m.view.render(performance.now()); return { s: m.view.lay.s, so: m.view.battle.opp.lay.s, h: m.game.h }; });
      check('320 × 568, Long with Pentominoes (12 rows under 5): your cells ' + long.s + ' px (11 or more), theirs ' + long.so + ' px (5.5 or more)', long.h === 17 && long.s >= 11 && long.so >= 5.5, JSON.stringify(long));
      if (OUT) await V.page.screenshot({ path: path.join(OUT, 'battle-long-pentominoes-320x568.png') });
    }
    if (w === 390 && theme === 'dark') {
      // A touch that starts on the opponent's half steers your piece.
      const cdp = await V.ctx.newCDPSession(V.page);
      await at({});
      const geo = await V.ev(() => { const m = Lull.app.modes.play, r = m.canvas.getBoundingClientRect(), o = m.view.battle.opp.lay.board; return { x: r.left + o.x + o.w / 2, y: r.top + o.y + o.h / 2, step: Lull.Touch.stepFor(m.view.lay.s, Lull.app.settings.touchSens), px: m.game.piece.x }; });
      const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) });
      await t('touchStart', [[geo.x, geo.y]]);
      for (let i = 1; i <= 12; i++) { await V.page.waitForTimeout(17); await t('touchMove', [[geo.x - (geo.step * 2.5 * i) / 12, geo.y]]); }
      await V.page.waitForTimeout(17);
      await t('touchEnd', []);
      const px = await V.ev(() => Lull.app.modes.play.game.piece.x);
      check('a touch that starts on the opponent\'s board moves your piece (2 cells left)', px === geo.px - 2, JSON.stringify({ geo, px }));
    }
    if (w === 520 && theme === 'light') {
      // Reduced motion: the opponent's piece jumps to its spot (its path at once), a reset is at once.
      await V.ev(() => { Lull.app.settings.motion = 'reduced'; Lull.app.applySettings(); });
      await at({ level: 'swift' });
      await V.page.waitForTimeout(3000);
      const rm = await V.ev(() => { const M = Lull.Battle.matchOf(Lull.app.modes.play.game); return { ai: M.ai.S.pieces }; });
      check('reduced motion: the opponent still plays (its piece jumps to its spot)', rm.ai >= 1, JSON.stringify(rm));
      if (OUT) await V.page.screenshot({ path: path.join(OUT, 'battle-reduced-motion.png') });
    }
    await V.ctx.close();
  }
  check('Battle: no errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
};
