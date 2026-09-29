// A retired board in full view (js/retiredview.js): opened from a retired row (View, or its thumbnail) and from a
// retired record (View); its final stack drawn at play size, cell for cell, at its own size (a 10 × 20 board retired
// full, with the piece that could not come in; a 4 × 40 and a 20 × 8 retired by hand); read-only — no key, click,
// touch, item, timer, pay, stat or autosave reaches the board in play; Previous and Next (← →, a swipe) step in order
// and stop at the ends; Esc and Back return to the board in play exactly as it was, focus where it was. At 520 × 760
// (light), 400 × 700 (dark), and on phones by touch: 390 × 844 (dark) and 320 × 568 (light, reduced motion).
// Run by browser-test.cjs: require('./retired-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function retiredTests({ browser, check, PAGE, OUT }) {
  console.log('retired boards in full view');
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
      Lull.app.modes.play.setGrace = 0;
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      Lull.app.settings.theme = t; Lull.app.applySettings();
      Lull.app.setTab('play');
    }, theme);
    const cdp = touch ? await ctx.newCDPSession(page) : null;
    const tag = width + 'x' + height + (touch ? ' touch' : '') + ' ' + theme + (reduced ? ' reduced' : '');
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, ev, tag, shot, touch, cdp, width, height };
  };

  /**
   * Three retired boards, newest first: a 10 × 20 board retired full (a held piece, the one that could not come in),
   * a 4 × 40 and a 20 × 8 retired by hand; and a board in play with pieces set, one held and the piece turned.
   */
  const seed = (P) => P.ev(() => {
    const L = Lull, m = L.app.modes.play, st = L.app.store.state, B = st.boards, now = Date.now(), day = 86400e3;
    const make = (w, hh, rows, full, name, at) => {
      const rec = L.Library.add(B, at - day);
      rec.name = name;
      const g = new L.Game({ w, h: hh, seed: w * 100 + hh });
      for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) if ((x * 7 + y * 3) % 5) g.board.set(x, y, 1 + ((x + y) % 7));
      g.holdPiece();
      g.s.pieces = 40; g.s.lines = 12; g.s.startedAt = at - day;
      if (full) {
        for (let y = rows; y < hh - 2; y++) for (let x = 0; x < w - 1; x++) g.board.set(x, y, 8);
        let guard = 0;
        while (!g.over && guard++ < 60) g.drop();
      }
      L.Library.retire(st, rec.id, g.toJSON(), at, full ? 'full' : 'manual');
      return { over: g.over };
    };
    make(20, 8, 5, false, 'Wide Dune', now - 3 * day);
    make(4, 40, 22, false, 'Tall Willow', now - 2 * day);
    const f = make(10, 20, 6, true, 'Full Harbor', now - day);
    const g = m.game;
    for (let i = 0; i < 4; i++) { g.move((i % 3) - 1); g.drop(); }
    g.holdPiece(); g.rotate(1);
    m.renderStatus(); m.view.dirty = true;
    L.app.saveNow();
    return { full: f.over, ids: B.retired.map((r) => r.id), names: B.retired.map((r) => r.name) };
  });

  /** Everything about the board in play and what it pays into, to compare after the full view. */
  const snap = (P) => P.ev(() => {
    const L = Lull, app = L.app, m = app.modes.play, st = app.store.state;
    app.saveNow();
    // Play time is counted while the Boards window is open (a second's timer): it is compared on its own, in the view.
    const noMs = (j) => { j = JSON.parse(JSON.stringify(j)); delete j.s.playMs; return JSON.stringify(j); };
    return {
      game: noMs(m.game.toJSON()), lines: st.lines, inv: JSON.stringify(st.inventory), free: JSON.stringify(st.stats.free),
      stored: noMs(JSON.parse(localStorage.getItem('lull.save.v1')).free), card: m.cardOpen, armed: !!m.armed, tray: !!document.querySelector('.item-tray:not(.hidden)'),
      earn: JSON.stringify(st.earn), boards: JSON.stringify(st.boards.list.map((r) => [r.id, r.touched])),
    };
  });
  const same = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

  /** The full view as it stands: which record, what is drawn and where, the bars, focus. */
  const read = (P) => P.ev(() => {
    const L = Lull, m = L.app.modes.play, v = m.fullView;
    if (!v) return { open: false, modal: !!document.querySelector('.modal-fullview') };
    v.frame(performance.now(), 0);
    const e = v.rec, g = v.game, lay = v.view.lay, cv = v.canvas.getBoundingClientRect(), wrap = document.querySelector('#view-play .boardwrap').getBoundingClientRect();
    // What the board in play's view would lay out for a board this size, in the same room.
    const twin = new L.Render.BoardView(m.canvas, { cellCap: m.view.opts.cellCap });
    twin.attach(new L.Game({ w: e.w, h: e.h, seed: 1 }), {}); twin.resize(); const tl = twin.layout();
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; };
    const btns = [...document.querySelectorAll('.modal-fullview .body button')];
    return {
      open: true, id: e.id, name: e.name, w: g.w, h: g.h, cols: lay.cols, rows: lay.rows, s: lay.s, twinS: tl.s, twinBoard: [tl.board.x, tl.board.y].join(),
      board: [lay.board.x, lay.board.y].join(), canvas: [cv.left, cv.top, cv.width, cv.height].map(Math.round).join(), wrap: [wrap.left, wrap.top, wrap.width, wrap.height].map(Math.round).join(),
      cells: L.Library.encodeCells(g.board.cells) === e.cells, piece: g.piece ? { id: g.piece.type.id, rot: g.piece.rot, x: g.piece.x, y: g.piece.y } : null,
      recPiece: e.piece ? { id: e.piece.entry.id, rot: e.piece.rot, x: e.piece.x, y: e.piece.y } : null, reason: e.reason,
      hold: g.hold && g.hold.id, recHold: e.hold && e.hold.id, next: g.queue.map((q) => q.id).join(''), recNext: e.next.map((q) => q.id).join(''), ghost: g.piece ? g.ghostY(g.piece) : null,
      name1: document.querySelector('.fv-name').textContent, sub: document.querySelector('.fv-sub').textContent, pos: document.querySelector('.fv-pos').textContent,
      prevOff: document.querySelector('.fv-prev').getAttribute('aria-disabled'), nextOff: document.querySelector('.fv-next').getAttribute('aria-disabled'),
      label: v.el.getAttribute('aria-label'), role: v.el.getAttribute('role'), canvasLabel: v.canvas.getAttribute('aria-label'),
      inert: document.getElementById('main').inert, hidden: getComputedStyle(document.querySelector('#view-play .boardwrap')).visibility,
      fits: btns.every(vis) && vis(document.querySelector('.fv-bar')) && vis(document.querySelector('.fv-foot')) && document.querySelector('.fv-bar').scrollWidth <= document.querySelector('.fv-bar').clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
      small: btns.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }).reduce((a, b) => Math.min(a, b), 99),
      focusIn: v.el.contains(document.activeElement),
    };
  });

  /**
   * The canvas, cell for cell: drawn with the record's stack and again with none (the same moment, no piece), every
   * filled cell must differ from the empty well there and every empty cell match it; the blocked piece's cells differ
   * from the stack drawn without it.
   */
  const pixels = (P) => P.ev(() => {
    const v = Lull.app.modes.play.fullView, bv = v.view, g = v.game, ctx = v.canvas.getContext('2d'), t = performance.now();
    const grab = () => { bv.render(t); return ctx.getImageData(0, 0, v.canvas.width, v.canvas.height).data; };
    const piece = g.piece, cells = g.board.cells.slice();
    g.piece = null;
    const full = grab();
    g.board.cells.fill(0);
    const empty = grab();
    g.board.cells.set(cells);
    let withPiece = null;
    if (piece) { g.piece = piece; withPiece = grab(); }
    g.piece = piece; bv.dirty = true; bv.render(t); v.markBlocked();
    const { s } = bv.lay, dpr = bv.dpr, W = v.canvas.width;
    const at = (d, x, y) => { const [sx, sy] = bv.toScreen(x, y), px = Math.round((sx + s * 0.5) * dpr), py = Math.round((sy + s * 0.5) * dpr), i = (py * W + px) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    let bad = 0, filled = 0;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const on = !!cells[y * g.w + x], d = diff(at(full, x, y), at(empty, x, y));
      if (on) filled++;
      if (on ? d < 24 : d > 6) bad++;
    }
    let pieceOk = null;
    if (piece) pieceOk = g.cellsOf(piece).filter(([x, y]) => y < g.h).every(([x, y]) => diff(at(withPiece, x, y), at(full, x, y)) > 24);
    return { bad, filled, pieceOk };
  });

  /**
   * The blocked piece, marked: drawn once as the Board full view draws it and again with its mark; on every outer side
   * of each of its cells, the line is in the theme's red (--bad) and stands apart from the same spot unmarked; every
   * other cell, and the stack cells right beside the piece, are untouched.
   */
  const marked = (P) => P.ev(() => {
    const v = Lull.app.modes.play.fullView, bv = v.view, g = v.game, ctx = v.canvas.getContext('2d'), t = performance.now();
    if (!g.piece) return { piece: false };
    bv.render(t);
    const W = v.canvas.width, plain = ctx.getImageData(0, 0, W, v.canvas.height).data;
    v.markBlocked();
    const mark = ctx.getImageData(0, 0, W, v.canvas.height).data;
    const { s } = bv.lay, dpr = bv.dpr, lw = Math.max(2, Math.round(s * 0.07)), inset = (lw + 3) / 2;
    const px = (d, x, y) => { const i = (Math.round(y * dpr) * W + Math.round(x * dpr)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim().replace('#', '');
    const bad = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const cells = g.cellsOf(g.piece).filter(([, y]) => y < g.h), key = new Set(cells.map(([x, y]) => x + ',' + y));
    let sides = 0, red = 0, apart = 0, spill = 0, others = 0;
    for (const [x, y] of cells) {
      const [sx, sy] = bv.toScreen(x, y);
      for (const [dx, dy, mx, my] of [[0, 1, 0.5, 0], [0, -1, 0.5, 1], [-1, 0, 0, 0.5], [1, 0, 1, 0.5]]) {
        if (key.has((x + dx) + ',' + (y + dy))) continue;
        sides++;
        const ix = sx + mx * s + (mx === 0 ? inset : mx === 1 ? -inset : 0), iy = sy + my * s + (my === 0 ? inset : my === 1 ? -inset : 0);
        if (diff(px(mark, ix, iy), bad) < 60) red++;
        if (diff(px(mark, ix, iy), px(plain, ix, iy)) > 60) apart++;
        // Just outside that side, in the next cell (stack or empty): untouched.
        const ox = sx + mx * s + (mx === 0 ? -1.5 : mx === 1 ? 1.5 : 0), oy = sy + my * s + (my === 0 ? -1.5 : my === 1 ? 1.5 : 0);
        if (x + dx >= 0 && x + dx < g.w && y + dy >= 0 && y + dy < g.h && diff(px(mark, ox, oy), px(plain, ox, oy)) > 6) spill++;
      }
    }
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (key.has(x + ',' + y)) continue;
      const [sx, sy] = bv.toScreen(x, y);
      if (diff(px(mark, sx + s / 2, sy + s / 2), px(plain, sx + s / 2, sy + s / 2)) > 0) others++;
    }
    return { piece: true, cells: cells.length, sides, red, apart, spill, others };
  });

  // (force: a button marked off, aria-disabled, is still pressed: it must do nothing.)
  const press = (P, sel, force) => (P.touch ? P.page.tap(sel, { force: !!force }) : P.page.click(sel, { force: !!force }));
  const focusInfo = (P) => P.ev(() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || a.textContent || a.tagName) + '|' + (a.closest('.lib-row') ? a.closest('.lib-row').dataset.id : a.closest('.modal-retire') ? 'record' : '') : null; });
  /** A finger swiped across the board of the full view (CDP touches: pointer events of type touch). */
  const swipe = async (P, dx) => {
    const r = await P.ev(() => { const b = document.querySelector('.fv-stage').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    const pts = Array.from({ length: 7 }, (_, i) => [r[0] - dx / 2 + (dx * i) / 6, r[1] + i]);
    const t = (type, p) => P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });
    await t('touchStart', pts[0]);
    for (const p of pts.slice(1)) { await sleep(16); await t('touchMove', p); }
    await t('touchEnd', null);
    await sleep(60);
  };

  const SIZES = [[520, 760, 'light', false, false], [400, 700, 'dark', false, false], [390, 844, 'dark', true, false], [320, 568, 'light', true, true]];
  for (const [w, hh, theme, touch, reduced] of SIZES) {
    const P = await open(w, hh, theme, touch, reduced);
    const { ev, tag, page } = P;
    const made = await seed(P);
    check(tag + ': three retired boards (a 10 × 20 full, a 4 × 40, a 20 × 8)', made.full && made.ids.length === 3 && made.names.join() === 'Full Harbor,Tall Willow,Wide Dune', JSON.stringify(made));
    const before = await snap(P);
    // From the retired row: its View.
    await press(P, '#play-status .boards-btn');
    await page.waitForTimeout(150);
    await press(P, '.modal-lib .lib-tabs [data-k="retired"]');
    await page.waitForTimeout(100);
    if (touch) {
      const rows = await ev(() => [...document.querySelectorAll('.modal-lib .lib-row.retired')].map((row) => {
        const [a, b] = [...row.querySelectorAll('.lib-acts .icon-btn')].map((x) => x.getBoundingClientRect()), t = row.querySelector('.lib-open .t').getBoundingClientRect(), list = row.parentElement;
        return { n: row.querySelectorAll('.lib-acts .icon-btn').length, small: Math.min(a.width, a.height, b.width, b.height), side: Math.abs(a.top - b.top) < 1, gap: b.left - a.right, name: t.width, fits: row.getBoundingClientRect().right <= list.getBoundingClientRect().right + 0.5 && list.scrollWidth <= list.clientWidth + 1 };
      }));
      await P.shot('79-retired-' + w + 'x' + hh + '-rows');
      check(tag + ': a retired row\'s View and Delete are 44 px targets, side by side and apart; the name keeps its room', rows.length === 3 && rows.every((r) => r.n === 2 && r.small >= 44 && r.side && r.gap >= 4 && r.name >= 80 && r.fits), JSON.stringify(rows));
    }
    await press(P, '.modal-lib .lib-row.retired[data-id="' + made.ids[0] + '"] .fv-open');
    await page.waitForTimeout(120);
    let r = await read(P);
    check(tag + ': View on a retired row opens it in full view, labelled with its name', r.open && r.id === made.ids[0] && r.role === 'dialog' && r.label === 'Retired board: Full Harbor' && r.name1 === 'Full Harbor' && /^Full · retired \w+ \d+/.test(r.sub) && r.pos === '1 of 3' && r.focusIn, JSON.stringify(r));
    check(tag + ': drawn at play size where the board in play is, at its own size (10 × 20)', r.canvas === r.wrap && r.cols === 10 && r.rows === 20 && r.w === 10 && r.h === 20 && r.s === r.twinS && r.board === r.twinBoard && r.cells && r.hidden === 'hidden' && r.inert, JSON.stringify(r));
    check(tag + ': a board retired full shows the piece that could not come in, its hold and next; no ghost', r.reason === 'full' && r.piece && JSON.stringify(r.piece) === JSON.stringify(r.recPiece) && r.hold && r.hold === r.recHold && r.next.length >= 5 && r.next === r.recNext && r.ghost === null && /could not come in/.test(r.canvasLabel), JSON.stringify(r));
    let px = await pixels(P);
    check(tag + ': the canvas matches the record cell for cell, and the blocked piece is drawn', px.bad === 0 && px.filled > 50 && px.pieceOk === true, JSON.stringify(px));
    const mk = await marked(P);
    check(tag + ': the piece that could not come in is marked: its outline in red over the stack, nothing else touched', mk.piece && mk.cells > 0 && mk.sides >= 4 && mk.red === mk.sides && mk.apart === mk.sides && mk.spill === 0 && mk.others === 0, JSON.stringify(mk));
    check(tag + ': the view fits: bars, buttons, no sideways scroll' + (touch ? '; 44 px targets' : ''), r.fits && (!touch || r.small >= 44), JSON.stringify({ fits: r.fits, small: r.small }));
    await page.waitForTimeout(100);
    await P.shot('80-retired-' + w + 'x' + hh + '-full');
    // Nothing reaches the board in play: keys, clicks, touch, the item bar, timers, pay, stats, autosave.
    for (const k of ['Space', 'ArrowDown', 'ArrowUp', 'KeyC', 'KeyX', 'KeyZ', 'KeyA', 'ShiftLeft', 'Backspace', 'KeyU', 'Enter']) await page.keyboard.press(k);
    const st0 = await ev(() => document.querySelector('.fv-stage').getBoundingClientRect().toJSON());
    if (touch) { await page.touchscreen.tap(st0.x + st0.width * 0.3, st0.y + st0.height * 0.5); await page.touchscreen.tap(st0.x + st0.width * 0.7, st0.y + st0.height * 0.4); }
    else {
      await page.mouse.move(st0.x + st0.width * 0.3, st0.y + st0.height * 0.5);
      await page.mouse.click(st0.x + st0.width * 0.3, st0.y + st0.height * 0.5);
      await page.mouse.click(st0.x + st0.width * 0.6, st0.y + st0.height * 0.5, { button: 'right' });
      await page.mouse.wheel(0, 300);
    }
    const t0 = await ev(() => ({ ms: Lull.app.modes.play.game.s.playMs || 0, play: Lull.app.store.state.stats.timeMs.play }));
    const tried = await ev(() => {
      const app = Lull.app, m = app.modes.play;
      const acts = ['drop', 'left', 'hold', 'cw', 'down'].map((a) => m.action(a));
      // The item bar and the status bar are under the view: a click where they are lands in the view.
      const under = ['#itembar', '#play-status', '#cv-play'].every((sel) => { const b = document.querySelector(sel).getBoundingClientRect(), el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!(el && el.closest('.modal-fullview')); });
      for (let i = 0; i < 3; i++) { app.lastActivity = performance.now(); app.second(); }
      return { acts: acts.some(Boolean), under, inert: document.getElementById('main').inert, still: !!m.fullView };
    });
    await page.waitForTimeout(1300);
    const t1 = await ev(() => ({ ms: Lull.app.modes.play.game.s.playMs || 0, play: Lull.app.store.state.stats.timeMs.play }));
    const during = await snap(P);
    check(tag + ': nothing reaches the board in play (keys, clicks, touches, items, pay, stats, autosave)', !tried.acts && tried.under && tried.inert && tried.still && same(before, during).length === 0, JSON.stringify({ tried, changed: same(before, during) }));
    check(tag + ': its play time waits while the view is up', t1.ms === t0.ms && t1.play === t0.play, JSON.stringify([t0, t1]));
    // Previous / Next and ← →: in order, stopping at the ends.
    check(tag + ': at the first board, Previous is off', r.prevOff === 'true' && r.nextOff === 'false');
    const order = [];
    if (touch) await swipe(P, -160); else await page.keyboard.press('ArrowRight');
    r = await read(P); order.push(r.id);
    check(tag + ': ' + (touch ? 'a swipe to the left' : '→') + ' steps to the next board (4 × 40, drawn at its size, no piece)', r.id === made.ids[1] && r.cols === 4 && r.rows === 40 && r.s === r.twinS && r.cells && r.piece === null && r.pos === '2 of 3' && /^Retired by hand · \w+ \d+/.test(r.sub) && r.canvas === r.wrap, JSON.stringify(r));
    px = await pixels(P);
    check(tag + ': the 4 × 40 matches its record cell for cell', px.bad === 0 && px.filled > 20, JSON.stringify(px));
    check(tag + ': the 4 × 40 view fits', r.fits, JSON.stringify(r));
    await page.waitForTimeout(80);
    await P.shot('81-retired-' + w + 'x' + hh + '-4x40');
    await press(P, '.fv-next');
    r = await read(P); order.push(r.id);
    check(tag + ': Next steps to the last (20 × 8, at its size); Next is off there', r.id === made.ids[2] && r.cols === 20 && r.rows === 8 && r.s === r.twinS && r.cells && r.nextOff === 'true' && r.prevOff === 'false' && r.pos === '3 of 3', JSON.stringify(r));
    px = await pixels(P);
    check(tag + ': the 20 × 8 matches its record cell for cell', px.bad === 0 && px.filled > 50, JSON.stringify(px));
    await page.waitForTimeout(80);
    await P.shot('82-retired-' + w + 'x' + hh + '-20x8');
    if (touch) await swipe(P, -160); else await page.keyboard.press('ArrowRight');
    await press(P, '.fv-next', true);
    r = await read(P);
    check(tag + ': past the last board nothing moves (and focus stays in the view)', r.id === made.ids[2] && r.focusIn, JSON.stringify(r));
    if (touch) await swipe(P, 160); else await page.keyboard.press('ArrowLeft');
    r = await read(P); order.push(r.id);
    await press(P, '.fv-prev');
    r = await read(P); order.push(r.id);
    await press(P, '.fv-prev', true);
    if (!touch) await page.keyboard.press('ArrowLeft');
    r = await read(P);
    check(tag + ': back again in order, stopping at the first', order.join() === [made.ids[1], made.ids[2], made.ids[1], made.ids[0]].join() && r.id === made.ids[0] && r.prevOff === 'true', JSON.stringify(order));
    // Esc (or Back by touch): the library again, focus on the View it came from, the board in play exactly as it was.
    if (touch) await press(P, '.fv-back'); else await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    const back1 = await ev(() => ({ open: !!Lull.app.modes.play.fullView, fv: !!document.querySelector('.modal-fullview'), lib: !!document.querySelector('.modal-lib'), libShown: getComputedStyle(document.querySelector('.modal-lib').closest('.scrim')).opacity, body: document.body.classList.contains('fv-open'), wrap: getComputedStyle(document.querySelector('#view-play .boardwrap')).visibility }));
    const f1 = await focusInfo(P);
    check(tag + ': ' + (touch ? 'Back' : 'Esc') + ' closes the full view: the library as it was, focus back on View', !back1.open && !back1.fv && back1.lib && back1.libShown === '1' && !back1.body && back1.wrap === 'visible' && f1 === 'View|' + made.ids[0], JSON.stringify([back1, f1]));
    // The thumbnail opens it too (a mouse or a finger on it).
    await press(P, '.modal-lib .lib-row.retired[data-id="' + made.ids[1] + '"] .lib-thumb');
    await page.waitForTimeout(80);
    r = await read(P);
    check(tag + ': a retired row\'s thumbnail opens that board in full view', r.open && r.id === made.ids[1], JSON.stringify(r));
    if (touch) await press(P, '.fv-back'); else await page.keyboard.press('Escape');
    // From the record window: View, then Back; the record is still there, focus on its View.
    await press(P, '.modal-lib .lib-row.retired[data-id="' + made.ids[2] + '"] .lib-open .grow');
    await page.waitForTimeout(80);
    const recOpen = await ev(() => !!document.querySelector('.modal-retire .fv-view'));
    await press(P, '.modal-retire footer .fv-view');
    await page.waitForTimeout(80);
    r = await read(P);
    check(tag + ': a retired record\'s View opens it in full view', recOpen && r.open && r.id === made.ids[2] && r.label === 'Retired board: Wide Dune', JSON.stringify(r));
    // Its summary, over the view; Esc closes only that.
    await press(P, '.fv-sum');
    await page.waitForTimeout(80);
    const sum = await ev(() => { const ms = document.querySelectorAll('.modal'), top = ms[ms.length - 1]; const r = top.getBoundingClientRect(); return { cls: top.className, sum: !!top.querySelector('.board-sum'), dates: !!top.querySelector('.lib-dates'), fits: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, shown: !top.closest('.scrim').classList.contains('fv-under') }; });
    await P.shot('83-retired-' + w + 'x' + hh + '-summary');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
    r = await read(P);
    check(tag + ': Summary shows its numbers over the view; Esc comes back to the view', /modal-retire/.test(sum.cls) && sum.sum && sum.dates && sum.fits && sum.shown && r.open && r.id === made.ids[2], JSON.stringify(sum));
    await press(P, '.fv-back');
    await page.waitForTimeout(80);
    const back2 = await ev(() => ({ open: !!Lull.app.modes.play.fullView, rec: !!document.querySelector('.modal-retire'), n: document.querySelectorAll('.modal').length }));
    const f2 = await focusInfo(P);
    check(tag + ': Back returns to the record, focus on its View', !back2.open && back2.rec && back2.n === 2 && f2 === 'View|record', JSON.stringify([back2, f2]));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    const after = await snap(P);
    const played = await ev(() => { const m = Lull.app.modes.play, g = m.game, n = g.s.pieces; return { modal: Lull.UI.modalOpen(), drop: m.action('drop'), set: g.s.pieces === n + 1 }; });
    check(tag + ': closed, the board in play is exactly as it was, and plays on', same(before, after).length === 0 && !played.modal && played.drop && played.set, JSON.stringify({ changed: same(before, after), played }));
    await P.ctx.close();
  }
  // A record in a turn no piece has (past Library.ensure, as a broken save could be): opened, those pieces are left out
  // and the app draws on; a record that cannot be drawn at all opens nothing; a board that fails to draw closes the
  // view, never the app's loop.
  {
    const P = await open(520, 760, 'light', false, false);
    const { ev, tag, page } = P;
    const made = await seed(P);
    const r = await ev((ids) => {
      const L = Lull, m = L.app.modes.play, B = L.app.store.state.boards, e = L.Library.findRetired(B, ids[0]);
      e.piece.rot = 6; e.hold = { id: 'T', rot: 9 }; e.next = [{ id: 'T', rot: 7 }, { id: 'I', rot: 1 }];
      const v = m.openRetiredView(e.id, document.body);
      v.frame(performance.now());
      const out = { open: !!m.fullView, piece: v.game.piece, hold: v.game.hold, next: v.game.queue.map((q) => q.id + q.rot).join() };
      v.close();
      // Cells that cannot be read: nothing opens, nothing is left behind.
      const dec = L.Library.decodeCells;
      L.Library.decodeCells = () => { throw new Error('unreadable'); };
      const none = m.openRetiredView(ids[1], document.body);
      L.Library.decodeCells = dec;
      Object.assign(out, { none: none === null && !m.fullView, left: document.querySelectorAll('.modal').length, body: document.body.classList.contains('fv-open'), under: document.querySelectorAll('.scrim.fv-under').length });
      return out;
    }, made.ids);
    check(tag + ': a retired piece in a turn it cannot have is left out; the view opens and draws', r.open && r.piece === null && r.hold === null && r.next === 'I1', JSON.stringify(r));
    check(tag + ': a record that cannot be drawn opens nothing and leaves nothing open', r.none && r.left === 0 && !r.body && r.under === 0, JSON.stringify(r));
    await ev((id) => { const m = Lull.app.modes.play, v = m.openRetiredView(id, document.body); v.view.render = () => { throw new Error('broken'); }; v.view.dirty = true; }, made.ids[2]);
    const t0 = await ev(() => Lull.app.lastTime);
    await page.waitForTimeout(400);
    const after = await ev(() => ({ t: Lull.app.lastTime, open: !!Lull.app.modes.play.fullView, fv: !!document.querySelector('.modal-fullview'), body: document.body.classList.contains('fv-open') }));
    await page.waitForTimeout(200);
    const t2 = await ev(() => Lull.app.lastTime);
    check(tag + ': a board that fails to draw closes the view; the app draws on', !after.open && !after.fv && !after.body && after.t > t0 && t2 > after.t, JSON.stringify([t0, after, t2]));
    await P.ctx.close();
  }
  check('full view: no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};

if (require.main === module) {
  (async () => {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); }
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    let failed = 0;
    const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra && !ok ? ' — ' + extra : '')); if (!ok) failed++; };
    await module.exports({ browser, check, PAGE: 'file://' + path.join(__dirname, '..', 'Game', 'index.html'), OUT: process.argv[2] || null });
    await browser.close();
    console.log(failed ? failed + ' failed' : 'all passed');
    process.exit(failed ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
