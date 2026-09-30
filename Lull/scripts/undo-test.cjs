// Undo is 5 everywhere, and the Relaxed Board full card has it. Every way of buying an Undo — the Relaxed tray's Buy &
// use (a piece in play, or the Board full card up), the Board full card's Undo, the puzzle bar's Undo on every
// difficulty and each Daily, the not-yet card's Undo, the keys (Backspace, U, Ctrl+Z) and a finger on a phone — charges
// exactly ITEMS.rewind.price, 5. The Board full card's Undo is there whenever there is a placement to take back, says
// what the puzzle Undo says (held count or price), uses one held, buys one at 5 with none, and refuses with a note when
// the wallet is short. The Board full card and the puzzle result cards fit, buttons in view, at 520 × 760 (light),
// 400 × 700 (dark) and on phones: 390 × 844, 320 × 568 and 320 × 640 (reduced motion), by touch.
// Run by browser-test.cjs: require('./undo-test.cjs')({ browser, check, PAGE, OUT }); or on its own:
//   node Lull/scripts/undo-test.cjs [screenshot-dir]
'use strict';
const path = require('path');

module.exports = async function undoTests({ browser, check, PAGE, OUT }) {
  console.log('undo is 5 everywhere');
  const errors = [];
  const open = async (width, height, theme, touch, reduced) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: reduced ? 'reduce' : 'no-preference' }, touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } : {}));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(450);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev((t) => {
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0;
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      Lull.app.settings.theme = t; Lull.app.applySettings();
    }, theme);
    const tag = width + 'x' + height + (touch ? ' touch' : '') + ' ' + theme + (reduced ? ' reduced' : '');
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, ev, tag, shot, touch };
  };

  /** The wallet, the Undos held and their tallies, as the page has them. */
  const money = () => { const S = Lull.app.store.state; return { lines: S.lines, wallet: document.getElementById('wallet-n').textContent, held: S.inventory.rewind || 0, bought: S.stats.items.bought.rewind || 0, used: S.stats.items.used.rewind || 0, modal: Lull.UI.modalOpen() }; };
  /** Sets the wallet and the Undos held (announced, as a gift or a purchase would be). */
  const setWallet = (P, lines, held) => P.ev(([l, n]) => { const st = Lull.app.store; st.state.lines = l; st.state.inventory.rewind = n; st.itemsChanged(); Lull.app.refreshWallet(); }, [lines, held]);
  /** Fills the Relaxed board to the top from a piece or two set on it: the Board full card comes up. */
  const topout = (P) => P.ev(() => {
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    Lull.app.setTab('play');
    const m = Lull.app.modes.play, g = m.game;
    m.openTray(null);
    g.board.cells.fill(0); g.replacePiece({ id: 'O' }); g.piece.x = 3;
    g.drop();
    for (let y = 0; y < 18; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
    let guard = 0;
    while (!g.over && guard++ < 50) g.drop();
    // The random pieces may clear a row on the way; the placement that filled the board banks nothing here, so an Undo
    // takes back no lines (the refund has its own checks).
    const last = g.history[g.history.length - 1];
    if (last) g.s.banked = last.s.banked || 0;
    m.view.dirty = true;
    return { over: g.over, card: m.cardOpen, hist: g.history.length, pieces: g.s.pieces };
  });
  /** The Board full card's Undo, and the puzzle bar's in the same state, in words. */
  const readTopUndo = (P) => P.ev(() => {
    const b = document.getElementById('topout-undo'), m = Lull.app.modes.play;
    const pz = Lull.app.modes.puzzle.undoBtn({}, 'Undo');
    const face = (x) => x && { cnt: x.querySelector('.cnt') && x.querySelector('.cnt').textContent, gem: x.querySelector('.gem') && x.querySelector('.gem').textContent, aria: x.getAttribute('aria-label'), tip: x.dataset.tip, title: x.dataset.tipTitle, text: x.textContent };
    return { btn: face(b), puzzle: face(pz), card: m.cardOpen, over: m.game.over, pieces: m.game.s.pieces, hist: m.game.history.length };
  });
  const same = (a, b) => !!a && !!b && a.cnt === b.cnt && a.gem === b.gem && a.aria === b.aria && a.tip === b.tip && a.title === b.title && a.text === b.text;
  const press = (P, sel) => (P.touch ? P.page.tap(sel) : P.page.click(sel));
  /** One Undo bought: exactly 5 lines, bought and used once, the wallet following, no question asked. */
  const paid5 = (a, b) => b.lines === a.lines - 5 && b.wallet === String(b.lines) && b.bought === a.bought + 1 && b.used === a.used + 1 && b.held === a.held && !b.modal;

  /** The Board full card at this size: inside the board's overlay and the screen, its buttons all in view and whole. */
  const topLayout = (P) => P.ev((touch) => {
    const o = document.getElementById('play-overlay'), c = o.querySelector('.card');
    const q = o.getBoundingClientRect(), k = c.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = innerHeight;
    const sum = c.querySelector('.board-sum');
    const btns = [...c.querySelectorAll('.row .btn')].map((b) => {
      const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { t: b.textContent, h: Math.round(r.height), in: r.top >= k.top - 0.5 && r.bottom <= k.bottom + 0.5 && r.left >= k.left - 0.5 && r.right <= k.right + 0.5 && r.bottom <= q.bottom + 0.5, whole: b.scrollWidth <= b.clientWidth + 1, hit: !!hit && (hit === b || b.contains(hit)) };
    });
    return {
      card: [Math.round(k.top), Math.round(k.bottom)], overlay: [Math.round(q.top), Math.round(q.bottom)],
      inside: k.top >= q.top - 0.5 && k.bottom <= q.bottom + 0.5 && k.left >= -0.5 && k.right <= vw + 0.5 && k.bottom <= vh + 0.5,
      cardScrolls: c.scrollHeight > c.clientHeight + 1, sumScrolls: sum.scrollHeight > sum.clientHeight + 1, page: document.documentElement.scrollWidth <= vw + 1,
      btns, ok: btns.length === 3 && btns.every((b) => b.in && b.whole && b.hit && (!touch || b.h >= 44)),
    };
  }, P.touch);
  /** A puzzle's not-yet card (No room for the next piece) with nothing held; its layout at this size. */
  const failCard = (P) => P.ev(() => {
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    Lull.app.setTab('puzzle');
    const m = Lull.app.modes.puzzle;
    m.loadNumbered('H', 3);
    let guard = 0;
    while (m.game.piece && !m.cardOpen && guard++ < 30) m.action('drop');
    return m.cardOpen && !!document.getElementById('puz-card-undo');
  });
  const puzLayout = (P) => P.ev((touch) => {
    const o = document.getElementById('puz-overlay'), c = o.querySelector('.card');
    const q = o.getBoundingClientRect(), k = c.getBoundingClientRect();
    const btns = [...c.querySelectorAll('.row .btn')].map((b) => { const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { t: b.textContent, h: Math.round(r.height), in: r.top >= k.top - 0.5 && r.bottom <= k.bottom + 0.5 && r.bottom <= q.bottom + 0.5, hit: !!hit && (hit === b || b.contains(hit)) }; });
    return { card: [Math.round(k.top), Math.round(k.bottom)], overlay: [Math.round(q.top), Math.round(q.bottom)], inside: k.top >= q.top - 0.5 && k.bottom <= q.bottom + 0.5, scrolls: c.scrollHeight > c.clientHeight + 1, btns, ok: btns.length >= 2 && btns.every((b) => b.in && b.hit && (!touch || b.h >= 44)) };
  }, P.touch);

  // ---- 520 × 760, light: the card's Undo, each way it is paid, and every other way of buying one -------------------
  const D = await open(520, 760, 'light', false);
  let t = await topout(D);
  check(D.tag + ': a full board with a placement to take back', t.over && t.card && t.hist > 0, JSON.stringify(t));
  // None held: the Undo is there all the same, with its price, said as the puzzle Undo says it.
  await setWallet(D, 100, 0);
  let u = await readTopUndo(D);
  check(D.tag + ': none held, the Board full card still has Undo, with its price (⦵5), as the puzzle Undo shows it', u.btn && u.btn.gem === '⦵5' && u.btn.cnt === null && u.btn.aria === 'Undo, costs 5 lines' && /^Buys one for 5 /.test(u.btn.tip) && u.btn.title === 'Undo' && same(u.btn, u.puzzle), JSON.stringify(u));
  await D.shot('undo-topout-none-520x760-light');
  let a = await D.ev(money);
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  let b = await D.ev(money);
  let after = await readTopUndo(D);
  check(D.tag + ': none held, its Undo buys one for exactly 5 and uses it at once (no question); the board plays on', paid5(a, b) && !after.card && !after.over && after.pieces === u.pieces - 1, JSON.stringify({ a, b, after }));
  // Held: the count, and one is used (no lines).
  t = await topout(D);
  await setWallet(D, 100, 3);
  u = await readTopUndo(D);
  check(D.tag + ': held, it shows how many (3), as the puzzle Undo does', u.btn && u.btn.cnt === '3' && u.btn.gem === null && u.btn.aria === 'Undo, 3 held' && u.btn.tip === '3 Undos held' && same(u.btn, u.puzzle), JSON.stringify(u));
  await D.shot('undo-topout-held-520x760-light');
  await setWallet(D, 100, 1);
  u = await readTopUndo(D);
  a = await D.ev(money);
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  check(D.tag + ': with one held, its Undo uses it: no lines, used once, none left', u.btn.cnt === '1' && b.lines === a.lines && b.held === 0 && b.used === a.used + 1 && b.bought === a.bought && !after.card && !after.over, JSON.stringify({ a, b, after }));
  // A double click on its Undo (the set grace as it ships): one Undo, 5 lines once; the second click lands on the board
  // now bare under it and must not drop the piece just brought back (to top out again, the lines paid for nothing).
  const graced = (P, on) => P.ev((g) => { const app = Lull.app; app.settings.mouse = true; app.focusedAt = -1e9; for (const k of ['play', 'puzzle']) { app.modes[k].setGrace = g ? Lull.Modes.SET_GRACE_MS : 0; app.modes[k].setAt = 0; } }, on);
  const topouts = (P) => P.ev(() => Lull.app.store.state.stats.free.topouts);
  for (const [held, how] of [[0, 'dblclick'], [2, 'dblclick'], [0, 'two clicks 90 ms apart']]) {
    t = await topout(D);
    await setWallet(D, 20, held);
    await graced(D, true);
    await D.page.waitForTimeout(240);
    a = await D.ev(money);
    const to0 = await topouts(D);
    // The card's Undo on screen first, however long a busy machine takes to show it.
    await D.page.locator('#topout-undo').waitFor({ state: 'visible', timeout: 20000 });
    if (how === 'dblclick') await D.page.dblclick('#topout-undo');
    else {
      // Two clicks 90 ms apart on the set grace's clock (BoardMode.clock, held for the two), however slowly a busy
      // machine delivers them.
      const r = await D.page.locator('#topout-undo').boundingBox();
      await D.ev(() => { window.__graceT = performance.now(); Lull.app.modes.play.clock = () => window.__graceT; });
      await D.page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await D.ev(() => { window.__graceT += 90; });
      await D.page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await D.ev(() => { delete Lull.app.modes.play.clock; });
    }
    await D.page.waitForTimeout(120);
    b = await D.ev(money);
    after = await readTopUndo(D);
    const to1 = await topouts(D);
    await graced(D, false);
    const once = held ? b.lines === a.lines && b.held === held - 1 && b.used === a.used + 1 && b.bought === a.bought : paid5(a, b);
    check(D.tag + ': the Board full card\'s Undo, ' + how + ', ' + held + ' held: one Undo' + (held ? '' : ', 5 once') + ', the board plays on, no new top-out', once && !after.over && !after.card && after.hist === t.hist - 1 && to1 === to0, JSON.stringify({ a, b, after, t, to0, to1 }));
  }
  // What the last placement banked goes back with it, in full: none held, the wallet must hold the price and that; held,
  // it must hold that. Short, a note and nothing changes (a held Undo is kept): an Undo never pays.
  const bank = (P, extra) => P.ev((n) => { const g = Lull.app.modes.play.game, last = g.history[g.history.length - 1]; g.s.banked = (last.s.banked || 0) + n; return g.s.banked - (last.s.banked || 0); }, extra);
  t = await topout(D);
  const refund = await bank(D, 10);
  await setWallet(D, 12, 0);
  await D.ev(() => document.getElementById('toasts').replaceChildren());
  a = await D.ev(money);
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  let note2 = await D.ev(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent + (x.classList.contains('bad') ? ' (bad)' : '')).join('|'));
  check(D.tag + ': none held, 12 lines, the last placement banked 10: Not enough lines (5 + 10), nothing changes', refund === 10 && /Not enough lines \(bad\)/.test(note2) && b.lines === 12 && b.bought === a.bought && b.used === a.used && after.card && after.over, JSON.stringify({ refund, a, b, note2 }));
  await setWallet(D, 15, 0);
  a = await D.ev(money);
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  check(D.tag + ': none held, 15 lines, 10 banked: bought for 5, the 10 taken back, 0 left', b.lines === 0 && b.wallet === '0' && b.bought === a.bought + 1 && b.used === a.used + 1 && !after.card && !after.over, JSON.stringify({ a, b }));
  t = await topout(D);
  await bank(D, 10);
  await setWallet(D, 3, 1);
  await D.ev(() => document.getElementById('toasts').replaceChildren());
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  note2 = await D.ev(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent + (x.classList.contains('bad') ? ' (bad)' : '')).join('|'));
  check(D.tag + ': one held, 3 lines, 10 banked: Not enough lines, the Undo kept, nothing changes (an Undo never pays)', /Not enough lines \(bad\)/.test(note2) && b.lines === 3 && b.held === 1 && after.card && after.over && after.hist === t.hist, JSON.stringify({ b, note2, after }));
  await setWallet(D, 12, 1);
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  check(D.tag + ': one held, 12 lines, 10 banked: used, all 10 taken back', b.lines === 2 && b.held === 0 && !after.card && !after.over, JSON.stringify({ b, after }));
  // A real clear, on the item bar: the Undo held takes back exactly what the clear banked, or nothing when the wallet
  // has spent it; the combos' taper and the power-ups earned by lines stay as they were.
  const clearOne = () => D.ev(() => {
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    const m = Lull.app.modes.play, g = m.game;
    m.hideCard(); if (g.over) m.newBoard();
    const G = m.game;
    G.board.cells.fill(0);
    for (let x = 0; x < 9; x++) G.board.set(x, 0, 8);
    G.replacePiece({ id: 'I' }); G.rotate(1); while (G.move(1));
    const w0 = Lull.app.store.state.lines;
    m.action('drop');
    const S = Lull.app.store.state;
    return { got: Math.round((S.lines - w0) * 100) / 100, banked: m.rewindRefund(), earn: JSON.stringify(S.earn), taper: JSON.stringify((S.boards || {}).taper || {}) };
  });
  let c = await clearOne();
  await setWallet(D, Math.max(0, c.banked - 0.5), 1);
  await D.ev(() => document.getElementById('toasts').replaceChildren());
  a = await D.ev(money);
  const cells0 = await D.ev(() => Lull.app.modes.play.game.board.cells.join(''));
  await D.ev(() => Lull.app.modes.play.useItem('rewind'));
  b = await D.ev(money);
  note2 = await D.ev(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent + (x.classList.contains('bad') ? ' (bad)' : '')).join('|'));
  const cells1 = await D.ev(() => Lull.app.modes.play.game.board.cells.join(''));
  check(D.tag + ': a line cleared, one Undo held, the wallet under what it banked: Not enough lines, the board and the Undo as they were', c.banked > 0 && /Not enough lines \(bad\)/.test(note2) && b.lines === a.lines && b.held === 1 && cells1 === cells0, JSON.stringify({ c, a, b, note2 }));
  await setWallet(D, 50, 1);
  const back = await D.ev(() => { const S = Lull.app.store.state, w0 = S.lines; Lull.app.modes.play.useItem('rewind'); return { back: Math.round((w0 - S.lines) * 100) / 100, earn: JSON.stringify(S.earn), taper: JSON.stringify((S.boards || {}).taper || {}), held: S.inventory.rewind }; });
  check(D.tag + ': with the wallet enough, the Undo takes back the whole of it; the taper and Earn stay', back.back === c.banked && back.held === 0 && back.earn === c.earn && back.taper === c.taper, JSON.stringify({ c, back }));
  // The tray's Buy & use: the same guard (no question asked when it could not be paid).
  await D.ev(() => { const m = Lull.app.modes.play; m.openTray(null); m.game.board.cells.fill(0); m.game.drop(); m.view.dirty = true; });
  await bank(D, 7);
  await setWallet(D, 7, 0);
  await D.ev(() => document.getElementById('toasts').replaceChildren());
  a = await D.ev(money);
  await D.ev(() => Lull.app.modes.play.useItem('rewind'));
  b = await D.ev(money);
  note2 = await D.ev(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent).join('|'));
  check(D.tag + ': the tray\'s Undo, none held, 7 lines, 7 banked: Not enough lines, no question, nothing changes', /Not enough lines/.test(note2) && !b.modal && b.lines === 7 && b.bought === a.bought, JSON.stringify({ a, b, note2 }));
  await setWallet(D, 12, 0);
  a = await D.ev(money);
  await D.ev(() => Lull.app.modes.play.useItem('rewind'));
  await D.ev(() => { const st = Lull.app.store; st.state.lines = 8; Lull.app.refreshWallet(); }); // spent while asked
  await D.page.click('.modal footer .btn.primary');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  check(D.tag + ': the tray\'s Buy & use, the wallet short by the time it is pressed: Not enough lines, nothing bought', b.lines === 8 && b.bought === a.bought && b.used === a.used && b.lines >= 0, JSON.stringify({ a, b }));
  await D.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
  // Short of lines, none held: a note, and nothing changes.
  t = await topout(D);
  await setWallet(D, 4, 0);
  u = await readTopUndo(D);
  a = await D.ev(money);
  await D.ev(() => document.getElementById('toasts').replaceChildren());
  await D.page.click('#topout-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  const note = await D.ev(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent + (x.classList.contains('bad') ? ' (bad)' : '')).join('|'));
  check(D.tag + ': none held and under 5 lines: Not enough lines, and nothing changes', /Not enough lines \(bad\)/.test(note) && b.lines === 4 && b.held === 0 && b.bought === a.bought && b.used === a.used && after.card && after.over && after.pieces === u.pieces && after.hist === u.hist, JSON.stringify({ a, b, note, after }));
  // It follows the shared count while it is up (a gift's five, one used in Puzzles).
  await D.ev(() => Lull.app.store.grant('rewind'));
  const five = await readTopUndo(D);
  await D.ev(() => Lull.app.store.useItem('rewind'));
  const four = await readTopUndo(D);
  await D.ev(() => { const st = Lull.app.store; st.state.inventory.rewind = 0; st.itemsChanged(); });
  const zero = await readTopUndo(D);
  check(D.tag + ': it follows the shared count while up: 5 given, 4 after one used elsewhere, the price again at 0', five.btn.cnt === '5' && four.btn.cnt === '4' && zero.btn.gem === '⦵5' && zero.btn.cnt === null && zero.card, JSON.stringify({ five: five.btn, four: four.btn, zero: zero.btn }));
  // Nothing to take back (no placement): no Undo on the card.
  const bare = await D.ev(() => { const m = Lull.app.modes.play, keep = m.game.history.slice(); m.game.history.length = 0; m.onTopout(true); const has = !!document.getElementById('topout-undo'); m.game.history.push(...keep); m.onTopout(true); return { has, back: !!document.getElementById('topout-undo') }; });
  check(D.tag + ': with no placement to take back the card has no Undo', !bare.has && bare.back, JSON.stringify(bare));
  // The Relaxed tray's Buy & use with the Board full card up: 5.
  await setWallet(D, 60, 0);
  a = await D.ev(money);
  await D.page.click('#itembar .group-btn[data-group="board"]');
  await D.page.click('.item-tray [data-item="rewind"]');
  const ask = await D.ev(() => { const x = document.querySelector('.modal footer .btn.primary'); return x ? x.textContent : null; });
  await D.page.click('.modal footer .btn.primary');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  after = await readTopUndo(D);
  check(D.tag + ': the Relaxed tray\'s Buy & use, the card up: asks for 5, charges 5', /Buy & use · 5 /.test(ask) && paid5(a, b) && !after.card && !after.over, JSON.stringify({ ask, a, b }));
  // The Relaxed tray's Buy & use with a piece in play: 5.
  await D.ev(() => { const m = Lull.app.modes.play; m.openTray(null); m.game.board.cells.fill(0); m.game.drop(); m.view.dirty = true; });
  await setWallet(D, 60, 0);
  a = await D.ev(money);
  await D.page.click('#itembar .group-btn[data-group="board"]');
  await D.page.click('.item-tray [data-item="rewind"]');
  const ask2 = await D.ev(() => { const x = document.querySelector('.modal footer .btn.primary'); return x ? x.textContent : null; });
  await D.page.click('.modal footer .btn.primary');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  check(D.tag + ': the Relaxed tray\'s Buy & use, a piece in play: asks for 5, charges 5', /Buy & use · 5 /.test(ask2) && paid5(a, b), JSON.stringify({ ask2, a, b }));
  await D.ev(() => Lull.app.modes.play.openTray(null));

  // Puzzles: the bar's Undo on every difficulty, numbered and Daily; the not-yet card's; the keys.
  const puz = (P, [diff, daily, drops]) => P.ev(([d, dl, n]) => {
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    Lull.app.setTab('puzzle');
    const m = Lull.app.modes.puzzle;
    if (dl) { m.ps.diff = d; m.loadDaily(); } else m.loadNumbered(d, 5);
    for (let i = 0; i < n; i++) m.action('drop');
    return { diff: m.puzzle.diff, daily: !!m.meta.daily, pieces: m.game.s.pieces };
  }, [diff, daily, drops]);
  const pieces = (P) => P.ev(() => Lull.app.modes.puzzle.game.s.pieces);
  for (const diff of ['E', 'M', 'H']) for (const daily of [false, true]) {
    const p0 = await puz(D, [diff, daily, 1]);
    await setWallet(D, 80, 0);
    a = await D.ev(money);
    const gem = await D.ev(() => { const x = document.querySelector('#puz-undo .gem'); return x && x.textContent; });
    await D.page.click('#puz-undo');
    b = await D.ev(money);
    const p1 = await pieces(D);
    check(D.tag + ': the puzzle bar\'s Undo, ' + diff + (daily ? ' Daily' : '') + ': shows ⦵5 and charges 5', p0.diff === diff && p0.daily === daily && gem === '⦵5' && paid5(a, b) && p1 === p0.pieces - 1, JSON.stringify({ p0, gem, a, b, p1 }));
  }
  await failCard(D);
  await setWallet(D, 80, 0);
  a = await D.ev(money);
  const cardGem = await D.ev(() => { const x = document.querySelector('#puz-card-undo .gem'); return x && x.textContent; });
  await D.page.click('#puz-card-undo');
  b = await D.ev(money);
  check(D.tag + ': the not-yet card\'s Undo: shows ⦵5 and charges 5', cardGem === '⦵5' && paid5(a, b) && !(await D.ev(() => Lull.app.modes.puzzle.cardOpen)), JSON.stringify({ cardGem, a, b }));
  // Its Undo double clicked (the set grace as it ships): one Undo, 5 once, the card gone, the piece back and not dropped.
  await failCard(D);
  await setWallet(D, 80, 0);
  await graced(D, true);
  await D.page.waitForTimeout(240);
  const pz0 = await D.ev(() => { const m = Lull.app.modes.puzzle; return { hist: m.game.history.length, pieces: m.game.s.pieces }; });
  a = await D.ev(money);
  await D.page.dblclick('#puz-card-undo');
  await D.page.waitForTimeout(120);
  b = await D.ev(money);
  const pz1 = await D.ev(() => { const m = Lull.app.modes.puzzle; return { hist: m.game.history.length, pieces: m.game.s.pieces, card: m.cardOpen }; });
  await graced(D, false);
  check(D.tag + ': the not-yet card\'s Undo double clicked: 5 once, the card gone, the placement taken back and the piece not dropped', paid5(a, b) && !pz1.card && pz1.hist === pz0.hist - 1 && pz1.pieces === pz0.pieces - 1, JSON.stringify({ a, b, pz0, pz1 }));
  for (const [name, key] of [['Backspace', 'Backspace'], ['U', 'KeyU'], ['Ctrl+Z', 'Control+KeyZ']]) {
    const p0 = await puz(D, ['M', false, 2]);
    await setWallet(D, 80, 0);
    a = await D.ev(money);
    await D.page.keyboard.press(key);
    b = await D.ev(money);
    const p1 = await pieces(D);
    check(D.tag + ': ' + name + ' in a puzzle charges 5', paid5(a, b) && p1 === p0.pieces - 1, JSON.stringify({ a, b, p0, p1 }));
  }
  await D.ctx.close();

  // ---- 400 × 700, dark; phones by touch: the card's layout, its Undo tapped, the puzzle Undos tapped ------------------
  for (const [w, hgt, theme, touch, reduced] of [[400, 700, 'dark', false, false], [390, 844, 'light', true, false], [320, 568, 'dark', true, false], [320, 640, 'dark', true, true]]) {
    const P = await open(w, hgt, theme, touch, reduced);
    const name = w + 'x' + hgt + '-' + theme + (touch ? '-touch' : '') + (reduced ? '-reduced' : '');
    if (reduced) check(P.tag + ': reduced motion is on', await P.ev(() => Lull.app.modes.play.reduced));
    for (const [held, label] of [[0, 'none'], [3, 'held']]) {
      t = await topout(P);
      await setWallet(P, 100, held);
      await P.page.waitForTimeout(350); // the card settles in
      const lay = await topLayout(P);
      check(P.tag + ': the Board full card fits, Undo (' + label + '), Boards and Retire all in view' + (touch ? ', 44 px' : ''), t.over && lay.inside && !lay.cardScrolls && lay.page && lay.ok, JSON.stringify(lay));
      // Its numbers, when they scroll, fade at the cut edge (more below; scrolled to the end, more above), so a cut row
      // reads as going on; when they fit, no fade. Light, the tiles show on the white card.
      const fade = await P.ev(async () => {
        const s = document.querySelector('#play-overlay .board-sum'), mask = () => { const cs = getComputedStyle(s); return (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none'; };
        const tile = getComputedStyle(s.querySelector('.bs:nth-child(4)')).backgroundColor, card = getComputedStyle(s.closest('.card')).backgroundColor;
        const scrolls = s.scrollHeight > s.clientHeight + 1, top = { b: s.classList.contains('fade-b'), t: s.classList.contains('fade-t'), mask: mask() };
        s.scrollTop = s.scrollHeight;
        await new Promise((r) => setTimeout(r, 80));
        const end = { b: s.classList.contains('fade-b'), t: s.classList.contains('fade-t'), mask: mask() };
        s.scrollTop = 0;
        await new Promise((r) => setTimeout(r, 80));
        return { scrolls, top, end, snap: getComputedStyle(s).scrollSnapType, tile, card, light: document.documentElement.dataset.theme === 'light' };
      });
      const tileShows = !fade.light || (/rgba?\(/.test(fade.tile) && fade.tile !== 'rgba(0, 0, 0, 0)' && !/255, 255, 255/.test(fade.tile));
      check(P.tag + ': the Board full numbers (' + label + ') ' + (fade.scrolls ? 'scroll, and fade at the cut edge (below, then above at the end)' : 'fit, with no fade') + (fade.light ? '; the tiles show on the light card' : ''),
        (fade.scrolls ? fade.top.b && !fade.top.t && fade.top.mask && fade.end.t && !fade.end.b && fade.end.mask && /y/.test(fade.snap) : !fade.top.b && !fade.top.t && !fade.top.mask) && tileShows && (w > 320 || fade.scrolls), JSON.stringify(fade));
      await P.shot('undo-topout-' + label + '-' + name);
    }
    // Tapped (or clicked) with none held: 5.
    await setWallet(P, 100, 0);
    a = await P.ev(money);
    await press(P, '#topout-undo');
    await P.page.waitForTimeout(120);
    b = await P.ev(money);
    after = await readTopUndo(P);
    check(P.tag + ': the Board full card\'s Undo ' + (touch ? 'tapped' : 'clicked') + ', none held: charges 5', paid5(a, b) && !after.card && !after.over, JSON.stringify({ a, b }));
    // The puzzle's not-yet card: fits, buttons in view; its Undo and the bar's, tapped: 5 each.
    const up = await failCard(P);
    await setWallet(P, 100, 0);
    await P.page.waitForTimeout(350);
    const pl = await puzLayout(P);
    check(P.tag + ': the puzzle\'s not-yet card fits in the board, Undo and Retry in view' + (touch ? ', 44 px' : ''), up && pl.inside && !pl.scrolls && pl.ok, JSON.stringify(pl));
    if (w === 320 && hgt === 568) await P.shot('undo-puzzle-failed-' + name);
    a = await P.ev(money);
    await press(P, '#puz-card-undo');
    b = await P.ev(money);
    check(P.tag + ': the not-yet card\'s Undo ' + (touch ? 'tapped' : 'clicked') + ': charges 5', paid5(a, b), JSON.stringify({ a, b }));
    await P.ev(() => Lull.app.modes.puzzle.action('drop'));
    await setWallet(P, 100, 0);
    a = await P.ev(money);
    await press(P, '#puz-undo');
    b = await P.ev(money);
    check(P.tag + ': the puzzle bar\'s Undo ' + (touch ? 'tapped' : 'clicked') + ': charges 5', paid5(a, b), JSON.stringify({ a, b }));
    if (w === 320 && hgt === 568) {
      // Solved, on the smallest phone: its buttons in view too.
      await P.ev(() => { const m = Lull.app.modes.puzzle; m.loadNumbered('E', 3); m.solved(); });
      await P.page.waitForTimeout(350);
      const sl = await puzLayout(P);
      check(P.tag + ': the Solved card fits in the board, its buttons in view', sl.inside && !sl.scrolls && sl.ok, JSON.stringify(sl));
      await P.shot('undo-puzzle-solved-' + name);
    }
    await P.ctx.close();
  }
  check('undo: no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};

// On its own: node Lull/scripts/undo-test.cjs [screenshot-dir]
if (require.main === module) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) { console.error('Playwright is not installed; skipping.'); process.exit(0); }
  }
  let failures = 0;
  const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? ' — ' + extra : '')); if (!ok) failures++; };
  (async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    await module.exports({ browser, check, PAGE: 'file://' + path.join(__dirname, '..', 'Game', 'index.html'), OUT: process.argv[2] || null });
    await browser.close();
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
