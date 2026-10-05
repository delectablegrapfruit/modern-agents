// Battle in the browser (js/battle.js, js/battleview.js): made in the Custom window (Mode ▸ Battle after Race, a
// level, the presets), the Ready card and its 3-2-1, aiming and throwing by keys (T, arrows, turns, Esc, Space, Enter),
// by the Throw button (44 px, its six charge dots; Cancel and Throw here while aiming), by mouse (the shadow follows the
// pointer over their board, a click throws) and by touch (Throw, a drag, a tap on their board, a tap on the shadow), the
// opponent's throw shown on your board before it lands, sudden death, pausing (a window, the window losing focus, a
// reload), the End card (both ways) and Rematch, and four window sizes in both themes with the aiming shadow up.
// Run by browser-test.cjs: require('./battle-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

/** In the page: a Battle board w × h in play at a level, the round on (play), charges given, cards closed. */
const SCENE = (o) => {
  const app = Lull.app, m = app.modes.play, R = Lull.Recipe, B = Lull.Battle;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  // (A game put in play by hand is the mode's own game in play, never a Custom one: a reload finds it.)
  m.custom = null;
  m.setGame(new Lull.Game({ w: o.w || 10, h: o.h || 14, seed: o.seed || 5, recipe: R.normalize({ mode: 'battle', battle: { level: o.level || 'steady' }, shapes: { preset: o.shapes || 'normal' } }), previewCount: m.settings.preview }));
  const M = B.matchOf(m.game);
  if (o.play) {
    M.round.phase = 'play';
    Object.assign(m.ctl, { paused: false, count: null });
    m.hideCard();
  }
  if (o.charges) M.me.S.charges = o.charges;
  // The opponent holds still unless asked (its level's pace is long).
  if (o.still) M.ai.lvl = Object.assign({}, M.ai.lvl, { pace: 1e6 });
  m.renderItems(); m.renderStatus();
  m.view.dirty = true;
  m.view.resize(); m.view.render(performance.now());
  return { h: m.game.h };
};
/** In the page: a few pieces on both boards (theirs by the AI), so a frame shows play. */
const PLAYED = (n) => {
  const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game);
  const mine = Object.assign({}, M.me, { lvl: B.LEVELS.steady, rng: M.ai.rng });
  for (let i = 0; i < n; i++) {
    for (const [sd, foe] of [[mine, M.ai], [M.ai, M.me]]) {
      const d = B.runAll(B.think(sd, foe, { noThrow: true }));
      const r = B.act(sd, d);
      if (r.res) B.afterLock(sd === mine ? M.me : sd, r.res);
    }
  }
  M.me.ver++; M.ai.ver++;
  m.view.dirty = true;
};
const STATE = () => {
  const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game), c = m.ctl;
  const cells = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.board.get(x, y)) out.push(x + ',' + y); return out; };
  const land = c.aim ? c.aimLanding() : null;
  return { aim: c.aim ? Object.assign({}, c.aim) : null, land: land ? land.cells.map(([x, y]) => x + ',' + y).sort() : null, charges: M.me.S.charges, throws: M.me.S.throws, piece: m.game.piece && m.game.piece.type.id,
    pieceAt: m.game.piece && [m.game.piece.x, m.game.piece.y, m.game.piece.rot].join(), ai: cells(M.ai.game), phase: M.round.phase, winner: M.round.winner, card: (document.querySelector('#play-overlay .card') || {}).textContent || '', cardOpen: m.cardOpen };
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
  const sub = (a, b) => { const s = new Set(b); return a.filter((k) => !s.has(k)); };
  const D = await open();
  const { page, ev, shot } = D;

  // ---- the Custom window: Mode ▸ Battle (after Race) ▸ Brisk, the presets, Start ------------------------------------
  await ev(() => { const B = Lull.app.store.state.boards; B.size = { w: 10, h: 20 }; B.recipe = Lull.Recipe.normalize({}); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
  await ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
  const modes = await ev(() => [...document.querySelectorAll('.nb-mode')].map((b) => b.textContent.trim()).filter((t) => t !== 'Mural')); // (Mural: mural-test.cjs)
  await ev(() => document.querySelector('.nb-mode[data-value="battle"]').click());
  await page.waitForTimeout(80);
  await ev(() => document.querySelector('.nb-level[data-value="brisk"]').click());
  const win = await ev(() => ({ levels: [...document.querySelectorAll('.nb-lvl button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(), size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x'), mirror: (document.querySelector('[data-path="mods.mirror"]') || { getAttribute: () => '' }).getAttribute('aria-disabled') }));
  await ev(() => document.querySelector('.nb-tab[data-tab="size"]').click());
  await page.waitForTimeout(80);
  const presets = await ev(() => [...document.querySelectorAll('.nb-preset')].map((b) => b.querySelector('b').textContent + ' ' + b.querySelector('span').textContent).join(', '));
  await shot('battle-newboard');
  await ev(() => document.querySelector('.modal-newboard footer .btn.primary').click());
  await page.waitForTimeout(250);
  const made = await ev(() => { const g = Lull.app.modes.play.game, B = Lull.Battle; return { w: g.w, h: g.h, level: B.matchOf(g).level, card: (document.querySelector('#play-overlay .card') || {}).textContent || '', label: Lull.Recipe.label(g.recipe) }; });
  check('Custom: the Mode tab reads Plain, Classic, Descent, Race, Battle; Battle has its levels, a Battle size (10 × 14) and the presets Quick, Standard and Long',
    modes.join() === 'Plain,Classic,Descent,Race,Battle' && win.levels === 'Easy,Steady,Brisk*,Swift' && win.size === '10x14' && presets === 'Quick 8 × 12, Standard 10 × 14, Long 10 × 16', JSON.stringify({ modes, win, presets }));
  check('Start makes the board: 10 × 14 against Brisk, at the Ready card', made.w === 10 && made.h === 14 && made.level === 'brisk' && /Battle/.test(made.card) && /vs Brisk/.test(made.card) && made.label === 'Battle · Brisk', JSON.stringify(made));
  await shot('battle-ready');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const count = await ev(() => (document.querySelector('#play-overlay .vs-count') || {}).textContent || '');
  await page.waitForTimeout(3300);
  const started = await ev(() => { const m = Lull.app.modes.play; return { phase: Lull.Battle.matchOf(m.game).round.phase, card: m.cardOpen, running: m.ctl.running() }; });
  check('Space at the Ready card counts down 3-2-1, then the round is on', count === '3' && started.phase === 'play' && !started.card && started.running, JSON.stringify({ count, started }));

  // ---- keys: T aims, arrows move the shadow the screen's way, X turns, Esc cancels, Space throws there -----------------------
  await ev(SCENE, { play: true, charges: 2, still: true });
  const t0 = await ev(STATE);
  await page.keyboard.press('KeyT');
  const t1 = await ev(STATE);
  await page.keyboard.press('ArrowLeft');
  const t2 = await ev(STATE);
  await page.keyboard.press('KeyX');
  const t3 = await ev(STATE);
  check('T aims: the shadow comes up on their board; ← moves it left on the screen (right on their turned board); X turns it; your piece stays put',
    !t0.aim && t1.aim && t2.aim.x === t1.aim.x + 1 && t3.aim.rot === (t2.aim.rot + 1) % 4 && t3.pieceAt === t0.pieceAt && t1.land && t1.land.length === 4, JSON.stringify({ t0: t0.pieceAt, t1: t1.aim, t2: t2.aim, t3: t3.aim, at: t3.pieceAt }));
  await shot('battle-aim');
  await page.keyboard.press('Escape');
  const t4 = await ev(STATE);
  check('Esc cancels: no shadow, the charge kept, nothing thrown', !t4.aim && t4.charges === 2 && t4.ai.length === t0.ai.length && t4.piece === t0.piece, JSON.stringify(t4));
  await page.keyboard.press('KeyT');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  const t5 = await ev(STATE);
  await page.keyboard.press('Space');
  const t6 = await ev(STATE);
  check('Space throws: the piece lands on their board exactly where the shadow was, a charge spent, your next piece in',
    !t6.aim && t6.charges === 1 && t6.throws === 1 && JSON.stringify(sub(t6.ai, t5.ai).sort()) === JSON.stringify(t5.land) && t6.piece !== null, JSON.stringify({ land: t5.land, added: sub(t6.ai, t5.ai) }));
  await page.keyboard.press('KeyT');
  const t7 = await ev(STATE);
  await page.keyboard.press('Enter');
  const t8 = await ev(STATE);
  check('Enter throws too; with no charge left, T says so and aims nothing', t7.aim && t8.charges === 0 && JSON.stringify(sub(t8.ai, t7.ai).sort()) === JSON.stringify(t7.land), JSON.stringify({ t7: t7.land, added: sub(t8.ai, t7.ai) }));
  await page.keyboard.press('KeyT');
  const t9 = await ev(() => ({ aim: !!Lull.app.modes.play.ctl.aim, toast: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join('|') }));
  check('no charge: T aims nothing and says how to get one', !t9.aim && /Clear a row/.test(t9.toast), JSON.stringify(t9));

  // ---- the Throw button: 44 px, six dots (lit as charges), Cancel and Throw here while aiming ----------------------------------
  await ev(SCENE, { play: true, charges: 3, still: true });
  const btn = await ev(() => { const b = document.querySelector('.bt-throw'), r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), dots: b.querySelectorAll('.bt-dots i').length, on: b.querySelectorAll('.bt-dots i.on').length, label: b.getAttribute('aria-label'), dis: b.getAttribute('aria-disabled') }; });
  check('Throw is 44 px tall with six charge dots, three lit (Throw, 3 charges)', btn.h >= 44 && btn.w >= 44 && btn.dots === 6 && btn.on === 3 && btn.label === 'Throw, 3 charges' && btn.dis === 'false', JSON.stringify(btn));
  await page.click('.bt-throw');
  const aimBar = await ev(() => ({ aim: !!Lull.app.modes.play.ctl.aim, btns: [...document.querySelectorAll('#itembar .btn .lbl')].map((b) => b.textContent).join(','), h: Math.min(...[...document.querySelectorAll('#itembar .btn')].map((b) => b.getBoundingClientRect().height)) }));
  await page.click('.bt-cancel');
  const cancelled = await ev(STATE);
  await page.click('.bt-throw');
  const b0 = await ev(STATE);
  await page.click('.bt-throw.aiming');
  const b1 = await ev(STATE);
  check('the button aims; while aiming the bar reads Cancel, Throw here, Pause (44 px each); Cancel cancels; Throw here throws where the shadow is',
    aimBar.aim && aimBar.btns === 'Cancel,Throw here,Pause' && aimBar.h >= 44 && !cancelled.aim && cancelled.charges === 3 && b1.charges === 2 && JSON.stringify(sub(b1.ai, b0.ai).sort()) === JSON.stringify(b0.land), JSON.stringify({ aimBar, b0: b0.land, added: sub(b1.ai, b0.ai) }));

  // ---- the mouse: the shadow follows the pointer over their board; a click there throws ---------------------------------------
  await ev(SCENE, { play: true, charges: 2, still: true });
  await page.keyboard.press('KeyT');
  const geo = await ev(() => { const m = Lull.app.modes.play, r = m.canvas.getBoundingClientRect(), o = m.view.battle.opp.lay; return { x: r.left + o.board.x, y: r.top + o.board.y, s: o.s, w: m.game.w, h: o.board.h }; });
  // Their column 1 is the second from the right on the screen.
  await page.mouse.move(geo.x + (geo.w - 1 - 1 + 0.5) * geo.s, geo.y + geo.h / 2);
  await page.waitForTimeout(60);
  const m0 = await ev(STATE);
  const mid0 = await ev(() => Lull.app.modes.play.ctl.aimMid());
  await page.mouse.click(geo.x + (geo.w - 1 - 1 + 0.5) * geo.s, geo.y + geo.h / 2);
  const m1 = await ev(STATE);
  check('mouse: over their board the shadow follows the pointer (column 1); a click throws it there', mid0 === 1 && m1.charges === 1 && JSON.stringify(sub(m1.ai, m0.ai).sort()) === JSON.stringify(m0.land) && m1.pieceAt !== null, JSON.stringify({ mid0, land: m0.land, added: sub(m1.ai, m0.ai) }));

  // ---- the opponent throws: shown on your board first, then it lands there -------------------------------------------------------
  await ev(SCENE, { play: true, level: 'steady' });
  const inc = await ev(() => {
    const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game), c = m.ctl;
    M.ai.S.charges = 1;
    const type = M.ai.game.piece.type, aim = B.aims(m.game, type)[3], land = B.landing(m.game, type, aim.rot, aim.x);
    c.A = null;
    c.incoming = { aim, id: type.id, t: 0, dur: Lull.BattleView.INCOMING };
    m.view.dirty = true;
    return { land: land.cells.map(([x, y]) => x + ',' + y).sort(), before: (() => { const out = []; for (let y = 0; y < m.game.h; y++) for (let x = 0; x < m.game.w; x++) if (m.game.board.get(x, y)) out.push(x + ',' + y); return out; })() };
  });
  await page.waitForTimeout(250);
  await shot('battle-incoming');
  const mid = await ev(() => ({ still: !!Lull.app.modes.play.ctl.incoming }));
  await page.waitForTimeout(900);
  const landed = await ev(() => { const m = Lull.app.modes.play, out = []; for (let y = 0; y < m.game.h; y++) for (let x = 0; x < m.game.w; x++) if (m.game.board.get(x, y)) out.push(x + ',' + y); return { cells: out, got: Lull.Battle.matchOf(m.game).me.S.got, inc: !!m.ctl.incoming }; });
  check('the opponent\'s throw shows on your board for a moment, then lands exactly there', mid.still && !landed.inc && landed.got === 1 && JSON.stringify(sub(landed.cells, inc.before).sort()) === JSON.stringify(inc.land), JSON.stringify({ inc, landed }));

  // ---- sudden death: at 3:00 a ceiling row on both boards, stone; the clock turns amber -------------------------------------------
  await ev(SCENE, { play: true, still: true });
  await ev(() => { Lull.Battle.matchOf(Lull.app.modes.play.game).round.ms = 179900; });
  await page.waitForTimeout(400);
  const sd = await ev(() => { const m = Lull.app.modes.play, M = Lull.Battle.matchOf(m.game); return { me: M.me.S.ceil, ai: M.ai.S.ceil, stone: m.game.board.get(0, m.game.h - 1) === Lull.Battle.STONE, time: (document.querySelector('.stat.bt-time') || {}).className || '' }; });
  check('sudden death: past 3:00 both ceilings are down a row (stone), the clock marked', sd.me === 1 && sd.ai === 1 && sd.stone && /sudden/.test(sd.time), JSON.stringify(sd));
  await ev(() => { Lull.app.modes.play.ctl.paused = true; Lull.app.modes.play.view.dirty = true; });
  await shot('battle-sudden');

  // ---- pausing: a window over the board, the window losing focus, a reload ------------------------------------------------------
  await ev(SCENE, { play: true });
  await ev(() => Lull.app.openSettings());
  await page.waitForTimeout(120);
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  await page.waitForTimeout(80);
  const modalPaused = await ev(() => ({ paused: Lull.app.modes.play.ctl.paused, card: (document.querySelector('#play-overlay .card h2') || {}).textContent }));
  await ev(SCENE, { play: true, charges: 1 });
  await page.keyboard.press('KeyT');
  await ev(() => window.dispatchEvent(new Event('blur')));
  const blurPaused = await ev(() => ({ paused: Lull.app.modes.play.ctl.paused, card: (document.querySelector('#play-overlay .card h2') || {}).textContent }));
  await shot('battle-paused');
  check('a window over the board pauses it; so does the window losing focus while aiming (the Paused card)', modalPaused.paused && modalPaused.card === 'Paused' && blurPaused.paused && blurPaused.card === 'Paused', JSON.stringify({ modalPaused, blurPaused }));
  await ev(() => { const m = Lull.app.modes.play; m.ctl.cancelAim(); m.ctl.paused = false; m.game.drop(); m.save(); Lull.app.saveNow(); });
  await page.reload();
  await page.waitForTimeout(500);
  const reloaded = await ev(() => { const m = Lull.app.modes.play, M = Lull.Battle.matchOf(m.game); return { battle: !!M, phase: M && M.round.phase, card: (document.querySelector('#play-overlay .card h2') || {}).textContent, pieces: m.game.s.pieces, ai: !!(M && M.ai.game.piece), charges: M && M.me.S.charges }; });
  check('a reload resumes the round paused, charges kept', reloaded.battle && reloaded.phase === 'play' && reloaded.card === 'Paused' && reloaded.pieces === 1 && reloaded.ai && reloaded.charges === 1, JSON.stringify(reloaded));
  await ev(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; });

  // ---- the End card: a throw that leaves them no room wins; Rematch; and a loss ---------------------------------------------------
  await ev(SCENE, { play: true, w: 10, h: 12, charges: 1, still: true, level: 'steady' });
  const won = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, B = Lull.Battle, M = B.matchOf(g), P = Lull.Pieces, a = M.ai.game;
    // Their stack 10 high with the right column open; their piece at the top; an I thrown flat lands on it.
    for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) a.board.set(x, y, 3);
    g.piece = { type: P.get('I'), rot: 0, x: 0, y: g.h - 1 - P.get('I').rotBounds[0].maxY, special: null, entry: { id: 'I', rot: 0 }, lastRot: false };
    const before = Lull.app.store.state.stats.lines.battle;
    M.me.S.lines = 4; M.me.S.pieces = 10;
    m.ctl.startAim();
    m.ctl.aim = { rot: 2, x: 3 };
    m.ctl.confirm();
    return { phase: M.round.phase, winner: M.round.winner, over: a.over, card: document.querySelector('#play-overlay .card').textContent, paid: Lull.app.store.state.stats.lines.battle - before, picker: document.querySelectorAll('.vs-pick button').length };
  });
  await shot('battle-end');
  check('a throw that leaves them no room for their piece wins: the End card (You win, rows, the tally, +lines), its opponent picker, paid once',
    won.over && won.phase === 'end' && won.winner === 'me' && /You win/.test(won.card) && /vs Steady 1–0/.test(won.card) && won.picker === 4 && Math.abs(won.paid - 4 * 0.55) < 0.011, JSON.stringify(won));
  await ev(() => document.querySelector('.vs-pick [data-level="swift"]').click());
  await page.keyboard.press('Space');
  await page.waitForTimeout(3400);
  const re = await ev(() => { const m = Lull.app.modes.play, g = m.game, M = Lull.Battle.matchOf(g); return { phase: M.round.phase, n: M.round.n, empty: g.board.isEmpty() && M.ai.game.board.isEmpty(), over: g.over || M.ai.game.over, level: M.level, label: Lull.Recipe.label(g.recipe), card: m.cardOpen, ms: M.round.ms }; });
  check('Rematch (Space): a new round against the opponent picked (Swift), both boards empty, after 3-2-1', re.phase === 'play' && re.n === 2 && re.empty && !re.over && re.level === 'swift' && re.label === 'Battle · Swift' && !re.card, JSON.stringify(re));
  await ev(SCENE, { play: true, w: 10, h: 12, still: true });
  const lost = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, M = Lull.Battle.matchOf(g);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (x !== (y % 2 ? 2 : 7)) g.board.set(x, y, 4);
    g.drop();
    return { phase: M.round.phase, winner: M.round.winner, card: (document.querySelector('#play-overlay .card h2') || {}).textContent };
  });
  check('your next piece with no room: Opponent wins', lost.phase === 'end' && lost.winner === 'ai' && lost.card === 'Opponent wins', JSON.stringify(lost));

  // ---- the opponent's slices ------------------------------------------------------------------------------------------------------
  await ev(SCENE, { play: true, level: 'swift' });
  await ev(() => { const c = Lull.app.modes.play.ctl; c.sliceMax = 0; c.slices = 0; c.sliceLog = []; });
  await page.waitForTimeout(5000);
  const sl = await ev(() => { const c = Lull.app.modes.play.ctl, M = Lull.Battle.matchOf(Lull.app.modes.play.game), l = c.sliceLog.slice().sort((a, b) => a - b); return { n: l.length, p90: l[Math.floor(l.length * 0.9)] || 0, ai: M.ai.S.pieces + M.ai.S.throws }; });
  check('the opponent thinks in short slices (p90 ' + sl.p90 + ' ms) and plays (' + sl.ai + ' pieces in 5 s)', sl.n >= 1 && sl.p90 <= 3 && sl.ai >= 1, JSON.stringify(sl));
  await D.ctx.close();

  // ---- four window sizes, both themes: cells, Throw 44 px, nothing wider than the window; touch aiming; the frames ----------------
  const sizes = [[520, 760, false], [400, 700, false], [390, 844, true], [320, 568, true]];
  for (const [w, hh, touch] of sizes) for (const theme of ['dark', 'light']) {
    const V = await open({ viewport: { width: w, height: hh }, hasTouch: touch, isMobile: touch }, theme);
    await V.ev(SCENE, { play: true, charges: 3, still: true });
    await V.ev(PLAYED, 6);
    await V.ev(() => { const m = Lull.app.modes.play; m.ctl.startAim(); m.ctl.moveAim(1); m.ctl.paused = true; m.view.dirty = true; m.renderItems(); });
    await V.page.waitForTimeout(150);
    const lay = await V.ev(() => { const m = Lull.app.modes.play; m.view.render(performance.now()); const bs = [...document.querySelectorAll('#itembar .btn')].map((b) => b.getBoundingClientRect()), bar = document.querySelector('#itembar').getBoundingClientRect(); return { s: m.view.lay.s, so: m.view.battle.opp.lay.s, h: Math.round(Math.min(...bs.map((b) => b.height))), fits: bs.every((b) => b.right <= bar.right + 1 && b.left >= bar.left - 1), sw: document.documentElement.scrollWidth <= window.innerWidth }; });
    const target = w >= 500 ? [18, 9] : w >= 390 ? [14, 7] : [11, 5.5];
    if (theme === 'dark') check(w + ' × ' + hh + ': your cells ' + lay.s + ' px, theirs ' + lay.so + ' px (at least ' + target.join(' and ') + '), the bar\'s buttons 44 px and inside it, nothing wider than the window',
      lay.s >= target[0] && lay.so >= target[1] && lay.so <= lay.s && lay.h >= 44 && lay.fits && lay.sw, JSON.stringify(lay));
    if (OUT) await V.page.screenshot({ path: path.join(OUT, 'battle-aim-' + w + 'x' + hh + '-' + theme + '.png') });
    // The opponent's throw on its way, on your board.
    await V.ev(() => { const m = Lull.app.modes.play, B = Lull.Battle, M = B.matchOf(m.game); m.ctl.cancelAim(); const t = M.ai.game.piece.type; m.ctl.incoming = { aim: B.aims(m.game, t)[2], id: t.id, t: 0.2, dur: 0.8 }; m.view.dirty = true; m.view.render(performance.now()); });
    if (OUT && (w === 520 || w === 320)) await V.page.screenshot({ path: path.join(OUT, 'battle-incoming-' + w + 'x' + hh + '-' + theme + '.png') });
    await V.ev(() => { Lull.app.modes.play.ctl.incoming = null; });
    if (touch && theme === 'dark') {
      // By touch: Throw, a drag moves the shadow, a tap on their board moves it there, a tap on the shadow throws.
      const cdp = await V.ctx.newCDPSession(V.page);
      await V.ev(SCENE, { play: true, charges: 2, still: true });
      const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) });
      const tap = async (x, y) => { await tp('touchStart', [[x, y]]); await V.page.waitForTimeout(40); await tp('touchEnd', []); await V.page.waitForTimeout(80); };
      const tb = await V.ev(() => { const r = document.querySelector('.bt-throw').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await tap(tb[0], tb[1]);
      const g0 = await V.ev(() => { const m = Lull.app.modes.play, r = m.canvas.getBoundingClientRect(), o = m.view.battle.opp.lay, b = m.view.lay.board; return { aim: m.ctl.aim && Object.assign({}, m.ctl.aim), ox: r.left + o.board.x, oy: r.top + o.board.y, os: o.s, oh: o.board.h, mx: r.left + b.x + b.w / 2, my: r.top + b.y + b.h / 2, step: Lull.Touch.stepFor(m.view.lay.s, Lull.app.settings.touchSens), w: m.game.w }; });
      // A drag on your board, two steps to the left on the screen.
      await tp('touchStart', [[g0.mx, g0.my]]);
      for (let i = 1; i <= 12; i++) { await V.page.waitForTimeout(17); await tp('touchMove', [[g0.mx - (g0.step * 2.5 * i) / 12, g0.my]]); }
      await V.page.waitForTimeout(17); await tp('touchEnd', []); await V.page.waitForTimeout(80);
      const g1 = await V.ev(STATE);
      // A tap on their column 2 (third from the right on the screen): the shadow goes there.
      await tap(g0.ox + (g0.w - 1 - 2 + 0.5) * g0.os, g0.oy + g0.oh / 2);
      const g2 = await V.ev(STATE);
      const mid2 = await V.ev(() => Lull.app.modes.play.ctl.aimMid());
      // A tap on your board turns it.
      await tap(g0.mx + 20, g0.my);
      const g3 = await V.ev(STATE);
      // A tap on the shadow throws.
      const onShadow = await V.ev(() => { const m = Lull.app.modes.play, r = m.canvas.getBoundingClientRect(), o = m.view.battle.opp, land = m.ctl.aimLanding(), [sx, sy] = o.toScreen(land.cells[0][0], land.cells[0][1]); return [r.left + sx + o.lay.s / 2, r.top + sy + o.lay.s / 2]; });
      await tap(onShadow[0], onShadow[1]);
      const g4 = await V.ev(STATE);
      check(w + ' × ' + hh + ' by touch: Throw aims; a drag moves the shadow (2 left on the screen); a tap on their board puts it there; a tap on yours turns it; a tap on the shadow throws it there',
        g0.aim && g1.aim.x === g0.aim.x + 2 && mid2 === 2 && g3.aim.rot === (g2.aim.rot + 1) % 4 && g4.charges === 1 && !g4.aim && JSON.stringify(sub(g4.ai, g3.ai).sort()) === JSON.stringify(g3.land) && g4.throws === 1,
        JSON.stringify({ a0: g0.aim, a1: g1.aim, mid2, a2: g2.aim, a3: g3.aim, land: g3.land, added: sub(g4.ai, g3.ai) }));
    }
    if (w === 520 && theme === 'light') {
      // Reduced motion: the opponent still plays (its piece jumps to its spot); its throw still shows before it lands.
      await V.ev(() => { Lull.app.settings.motion = 'reduced'; Lull.app.applySettings(); });
      await V.ev(SCENE, { play: true, level: 'swift' });
      await V.page.waitForTimeout(3000);
      const rm = await V.ev(() => { const M = Lull.Battle.matchOf(Lull.app.modes.play.game); return { ai: M.ai.S.pieces }; });
      check('reduced motion: the opponent still plays', rm.ai >= 1, JSON.stringify(rm));
    }
    await V.ctx.close();
  }
  check('Battle: no errors in the page', !errors.length, errors.slice(0, 3).join(' | '));
};
