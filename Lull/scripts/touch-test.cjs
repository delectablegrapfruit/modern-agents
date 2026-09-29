// Touch play in an emulated phone (Chromium: hasTouch, isMobile, 3x): real touches through CDP
// (Input.dispatchTouchEvent) and page.touchscreen, on Relaxed, Classic and turned puzzles; the phone layout (nothing
// overflows, 44 px targets, no zoom or scroll); screenshots in both themes and with reduced motion.
// Run by browser-test.cjs: require('./touch-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function touchTests({ browser, check, PAGE, OUT }) {
  const errors = [];
  const open = async (width, height, theme) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: theme || 'dark' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(500);
    const cdp = await ctx.newCDPSession(page);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, cdp, ev, shot };
  };

  // ---- the phone: 390 × 844 ------------------------------------------------------------------------------------------
  console.log('touch');
  const P = await open(390, 844, 'dark');
  const { page, cdp, ev, shot } = P;
  const welcome = await ev(() => ({ open: Lull.UI.modalOpen(), gestures: !!document.querySelector('.modal .keys.gestures'), text: (document.querySelector('.modal') || {}).textContent || '' }));
  check('a touch-only phone is welcomed with the gestures, not the keys', welcome.open && welcome.gestures && /Swipe ↓/.test(welcome.text) && !/Space/.test(welcome.text), welcome.text.slice(0, 160));
  await page.touchscreen.tap(195, 400).catch(() => {});
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });

  // Touches carry their own time stamps when asked (ts, seconds): a quick swipe then has the pace it says, however
  // slowly the harness delivers it. Slow drags and rests use the real clock.
  const touch = (type, pts, ts) => cdp.send('Input.dispatchTouchEvent', Object.assign({ type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) }, ts ? { timestamp: ts } : {}));
  /** One finger along a path: down at the first point, a move every gap ms, up at the last (timed: stamped so). */
  const stroke = async (pts, gap, timed) => {
    let ts = timed ? Date.now() / 1000 : 0;
    const next = () => (timed ? (ts += gap / 1000) : 0);
    await touch('touchStart', [pts[0]], timed ? ts : 0);
    for (const p of pts.slice(1)) { await sleep(gap); await touch('touchMove', [p], next()); }
    await sleep(Math.min(gap, 8));
    await touch('touchEnd', [], timed ? (ts += 0.004) : 0);
  };
  const line = (x, y, dx, dy, n) => Array.from({ length: n + 1 }, (_, i) => [x + (dx * i) / n, y + (dy * i) / n]);
  /** A slow drag (about 0.35 px/ms): moves and lowers. A flick (about 4 px/ms): hard drop or hold. */
  const drag = (x, y, dx, dy) => { const n = Math.max(2, Math.ceil(Math.hypot(dx, dy) / 6)); return stroke(line(x, y, dx, dy, n), 17); };
  const flick = (x, y, dx, dy) => stroke(line(x, y, dx, dy, 5), 8, true);
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []); };
  /** A tap stamped 40 ms long: a busy harness that delivers it late never makes it a long press. */
  const tapStamped = async (x, y) => { const ts = Date.now() / 1000; await touch('touchStart', [[x, y]], ts); await touch('touchEnd', [], ts + 0.04); };
  const tap2 = async (a, b) => { await touch('touchStart', [a]); await sleep(20); await touch('touchStart', [a, b]); await sleep(50); await touch('touchEnd', []); };

  // Where things are on the board in front (page CSS px), and the finger travel per cell.
  const geo = (tab) => ev((t) => {
    const m = Lull.app.modes[t], v = m.view; v.resize(); v.render(performance.now());
    const r = m.canvas.getBoundingClientRect(), b = v.lay.board, hb = v.lay.hold;
    return { x: r.left + b.x, y: r.top + b.y, w: b.w, h: b.h, s: v.lay.s, cx: r.left + b.x + b.w / 2, cy: r.top + b.y + b.h / 2,
      hold: [r.left + hb.x + hb.w / 2, r.top + hb.y + hb.h / 2], step: Lull.Touch.stepFor(v.lay.s, Lull.app.settings.touchSens) };
  }, tab);
  const piece = (tab) => ev((t) => { const g = Lull.app.modes[t].game, p = g.piece; return p ? { id: p.type.id, rot: p.rot, x: p.x, y: p.y, pieces: g.s.pieces, hold: g.hold && (g.hold.id || g.hold.type || g.hold), score: Lull.app.modes[t].score } : null; }, tab);
  const fresh = (tab, id) => ev(([t, k]) => { const m = Lull.app.modes[t], g = m.game; g.board.cells.fill(0); g.hold = null; g.holdLocked = false; g.replacePiece({ id: k }); g.piece.x = 3; m.setAt = 0; m.view.dirty = true; }, [tab, id || 'T']);

  // ---- Relaxed ----
  await ev(() => Lull.app.setTab('play'));
  await page.waitForTimeout(200);
  let G = await geo('play');
  const fill = await ev(() => { const w = document.querySelector('#view-play .boardwrap').getBoundingClientRect(), p = Lull.app.modes.play.view.lay.plate; return { wrap: [w.width, w.height], plate: [p.w, p.h] }; });
  check('the board fills the phone: the plate takes the room there is, a cell of 24 px or more, a step of one cell', G.s >= 24 && G.step === G.s && fill.plate[1] >= fill.wrap[1] - 2 * G.s, JSON.stringify({ s: G.s, step: G.step, fill }));
  await fresh('play', 'T');
  let a = await piece('play');
  await page.touchscreen.tap(G.x + G.w * 0.78, G.cy);
  await page.waitForTimeout(120);
  let b = await piece('play');
  check('tap on the right half turns clockwise', (b.rot - a.rot + 4) % 4 === 1, JSON.stringify([a, b]));
  check('after a tap the piece did not drop (no emulated mouse click)', b.pieces === a.pieces && b.y === a.y, JSON.stringify([a, b]));
  await page.touchscreen.tap(G.x + G.w * 0.22, G.cy);
  await page.waitForTimeout(900); // past the emulated-mouse guard: a late mousedown must still do nothing
  const c1 = await piece('play');
  check('tap on the left half turns counter-clockwise, and nothing drops', c1.rot === a.rot && c1.pieces === a.pieces && c1.y === a.y, JSON.stringify([b, c1]));
  await ev(() => Lull.app.settings.tapTurn = 'cw');
  await page.touchscreen.tap(G.x + G.w * 0.22, G.cy);
  await page.waitForTimeout(80);
  check('Tap to turn: Clockwise turns clockwise on either side', ((await piece('play')).rot - c1.rot + 4) % 4 === 1);
  await ev(() => Lull.app.settings.tapTurn = 'sides');

  await fresh('play', 'T');
  a = await piece('play');
  await drag(G.cx - 60, G.cy, G.step * 3.2, 0);
  b = await piece('play');
  check('a drag of 3.2 steps moves 3 columns', b.x - a.x === 3 && b.rot === a.rot && b.pieces === a.pieces, JSON.stringify([a, b, G.step]));
  await drag(G.cx + 60, G.cy, -G.step * 2.2, 0);
  const c2 = await piece('play');
  check('and back: a drag of 2.2 steps moves 2 the other way', c2.x - b.x === -2, JSON.stringify([b, c2]));

  // A slow drag down, far past the stack: it lowers onto it and never sets the piece.
  await fresh('play', 'O');
  await ev(() => { const g = Lull.app.modes.play.game; for (let y = 0; y < 3; y++) for (let x = 0; x < 10; x++) if (x !== 9) g.board.set(x, y, 8); Lull.app.modes.play.view.dirty = true; });
  a = await piece('play');
  await drag(G.cx, G.y + 20, 0, Math.min(G.h - 40, 844 - G.y - 30));
  b = await piece('play');
  check('Relaxed: a slow drag down past the stack lowers onto it and never sets the piece', b.pieces === a.pieces && b.y === 3 && b.id === 'O', JSON.stringify([a, b]));
  await sleep(250);
  await flick(G.cx, G.cy - 100, 0, 160);
  await page.waitForTimeout(40);
  const c3 = await piece('play');
  check('a flick down sets the piece (hard drop)', c3.pieces === a.pieces + 1, JSON.stringify([b, c3]));
  // A piece set just now. (The grace is stretched for the check, so a slow harness never lets it run out mid-flick.)
  await ev(() => { const m = Lull.app.modes.play; m.setAt = performance.now(); m.graceWas = m.setGrace; m.setGrace = 60000; });
  await flick(G.cx, G.cy - 100, 0, 160);
  const c4 = await piece('play');
  await ev(() => { const m = Lull.app.modes.play; m.setGrace = m.graceWas; m.setAt = 0; });
  check('a flick within 180 ms of a set is ignored (the set grace)', c4.pieces === c3.pieces && c4.id === c3.id, JSON.stringify([c3, c4]));
  await sleep(250);
  await fresh('play', 'T');
  await ev(() => { Lull.app.modes.play.game.queue[0] = { id: 'O', rot: 0 }; }); // the next piece is not a T
  a = await piece('play');
  await flick(G.cx, G.cy + 100, 0, -160);
  b = await piece('play');
  check('a flick up holds', b.pieces === a.pieces && b.hold === 'T' && b.id === 'O', JSON.stringify([a, b]));
  // One motion: a slide (or a slow lowering) that runs straight into a swipe still hard-drops, and the slide stays.
  {
    const leftCol = () => ev(() => { const g = Lull.app.modes.play.game; for (let x = 0; x < g.board.w; x++) if (g.board.get(x, 0)) return x; return -1; });
    /** Stamped: a slide of n moves gap ms apart by (dx, dy), then at once a swipe down of 150 px at about 2.5 px/ms. */
    const into = async (dx, dy, n, gap) => {
      let ts = Date.now() / 1000, x = G.cx - 40, y = G.cy - 120;
      await touch('touchStart', [[x, y]], ts);
      for (let i = 0; i < n; i++) { x += dx; y += dy; await sleep(gap); await touch('touchMove', [[x, y]], (ts += gap / 1000)); }
      for (let i = 0; i < 6; i++) { y += 25; await sleep(10); await touch('touchMove', [[x, y]], (ts += 0.01)); }
      await touch('touchEnd', [], (ts += 0.004));
    };
    await sleep(250);
    await fresh('play', 'O');
    await flick(G.cx, G.cy - 100, 0, 160);
    const off = (await leftCol()) - 3; // where an O at x 3 lands
    await sleep(250);
    await fresh('play', 'O');
    a = await piece('play');
    await into(G.step * 2.2 / 6, 0, 6, 30);
    b = await piece('play');
    const col = await leftCol();
    check('a slide that runs straight into a swipe: 2 columns over, then a hard drop', b.pieces === a.pieces + 1 && col === 5 + off, JSON.stringify({ a, b, col, off }));
    await sleep(250);
    await fresh('play', 'O');
    a = await piece('play');
    await into(0, G.step * 2.2 / 12, 12, 30);
    b = await piece('play');
    check('a slow lowering that runs straight into a swipe: a hard drop', b.pieces === a.pieces + 1 && (await leftCol()) === 3 + off, JSON.stringify({ a, b }));
    await sleep(250);
  }
  await sleep(200);
  await fresh('play', 'T');
  a = await piece('play');
  await tap2([G.cx - 40, G.cy], [G.cx + 40, G.cy + 20]);
  await page.waitForTimeout(60);
  b = await piece('play');
  check('a two-finger tap turns 180°', (b.rot - a.rot + 4) % 4 === 2 && b.pieces === a.pieces, JSON.stringify([a, b]));
  // Down under a ledge, then slide, in one touch.
  await fresh('play', 'I');
  await ev(() => { const m = Lull.app.modes.play, g = m.game; for (let x = 0; x < 10; x++) if (x < 3 || x > 6) g.board.set(x, 0, 8); m.view.dirty = true; });
  a = await piece('play');
  {
    const S = G.step, x0 = G.cx, y0 = G.y + 30, pts = line(x0, y0, 0, S * 2.3, 10).concat(line(x0, y0 + S * 2.3, S * 2.3, 0, 10).slice(1));
    await stroke(pts, 17);
  }
  b = await piece('play');
  check('one touch: drag down, then slide (the axis follows the finger)', b.y === a.y - 2 && b.x === a.x + 2 && b.pieces === a.pieces, JSON.stringify([a, b]));

  // Inverted Controls turn a drag around, as they do the arrows.
  await fresh('play', 'T');
  await ev(() => { Lull.app.modes.play.inverted = true; });
  a = await piece('play');
  await drag(G.cx, G.cy, G.step * 2.2, 0);
  b = await piece('play');
  await ev(() => { Lull.app.modes.play.inverted = false; });
  check('Inverted Controls mirror the drag', b.x - a.x === -2, JSON.stringify([a, b]));

  // The tray's buttons and HOLD are taps on their own: no turn. A touch on the board with a tray open only closes it.
  await fresh('play', 'T');
  a = await piece('play');
  const grp = await ev(() => { const r = document.querySelector('#itembar .group-btn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  // (What the tap reached, for the failure message.)
  await ev(() => { window.__taps = []; for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click', 'contextmenu']) document.addEventListener(t, (e) => { if (window.__taps.length < 24) window.__taps.push(t + ':' + (e.cancelable ? 'c' : '') + (e.target.isConnected ? '' : 'detached') + ':' + (e.target.closest && e.target.closest('button') ? e.target.closest('button').className : e.target.tagName) + (e.defaultPrevented ? ':prevented' : '') + '@' + Math.round(e.timeStamp)); }, true); });
  const trayUp = () => page.waitForFunction(() => !!Lull.app.modes.play.tray, null, { timeout: 1500 }).then(() => true, () => false);
  // A moment after the last drag, as a hand would pause: headless Chromium drops the click of a tap that comes within a few
  // tens of ms of the end of a drag (3 runs in 5 of the full suite without this pause, none in 2 with it).
  await sleep(400);
  await tapStamped(grp[0], grp[1]);
  let trayOpen = await trayUp();
  if (!trayOpen) {
    // Should it still happen (pointerdown and pointerup on the button, 40 ms apart, and no click), one more tap tells
    // that apart from a button that does not open its tray; the note says it happened.
    console.log('  note emulated tap on a tray button made no click; tapped again — ' + JSON.stringify(await ev(() => window.__taps)) + ' since board ' + await ev(() => Math.round(performance.now() - Lull.Touch.boardEnd)));
    await ev(() => { window.__taps = []; });
    await tapStamped(grp[0], grp[1]);
    trayOpen = await trayUp();
  }
  await page.touchscreen.tap(G.x + G.w * 0.78, G.cy);
  await page.waitForTimeout(100);
  b = await piece('play');
  check('a tray button opens its tray; the next touch on the board only closes it (no turn)', trayOpen && !(await ev(() => Lull.app.modes.play.tray)) && b.rot === a.rot && b.pieces === a.pieces, JSON.stringify([trayOpen, a, b, await ev(() => window.__taps)]));
  await ev(() => { const g = Lull.app.modes.play.game; g.queue[0] = { id: 'O', rot: 0 }; }); // the next piece is not a T
  await page.touchscreen.tap(G.hold[0], G.hold[1]);
  await page.waitForTimeout(80);
  const c5 = await piece('play');
  check('a tap on HOLD holds (and does not turn)', c5.hold === 'T' && c5.id === 'O' && c5.rot === 0 && c5.pieces === a.pieces, JSON.stringify([a, c5]));
  await page.touchscreen.tap(G.hold[0], G.hold[1]);
  await page.waitForTimeout(80);
  check('and again swaps back', (await piece('play')).id === 'T');

  // Control hints speak touch to a touch player.
  const hint = await ev(() => {
    const m = Lull.app.modes.play, H = Lull.Hints;
    return [H.content('drop', 'touch', m.view), H.content('mouseTurn', 'touch', m.view), H.content('hold', 'touch', m.view), H.content('otherWay', 'touch', m.view, { bothWays: true })].map((p) => p.join(' '));
  });
  check('hints in touch words', hint.join('|') === 'Swipe ↓ drops|Tap turns|Swipe ↑ holds|Two fingers: 180°', hint.join('|'));
  await ev(() => { const H = Lull.app.store.state.hints; Object.assign(H, { over: false, pieces: 0, ms: 0, shown: {}, skill: {}, retired: {} }); Lull.app.store.state.settings.hints = true; Lull.app.hints.sync(); });
  await fresh('play', 'T');
  await drag(G.cx, G.cy, G.step * 1.2, 0);
  const shown = await ev(() => { const c = Lull.app.hints; c.d.lastAt = -1e9; c.d.t.inputAt = performance.now() - 8000; Lull.app.modes.play.frame(performance.now(), 0.016); return c.d.pending || (c.el && c.el.textContent); });
  await page.waitForTimeout(200);
  const pill = await ev(() => { const e = document.querySelector('.lhint'); return e ? { text: e.textContent, kbd: e.querySelectorAll('kbd').length } : null; });
  check('a touch player idling gets "Swipe ↓ drops", with no key cap', !!pill && pill.text === 'Swipe ↓ drops' && pill.kbd === 0, JSON.stringify({ shown, pill }));
  await shot('70-touch-hint');
  await ev(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); if (Lull.app.hints.el) Lull.app.hints.hide(); });

  // A toast that turns up during a swipe never takes it; a moment after the finger lifts, a tap opens it.
  await fresh('play', 'T');
  a = await piece('play');
  await touch('touchStart', [[G.cx, G.y + 40]]);
  await ev(() => Lull.app.announce([Lull.Achievements.LIST[0]].filter(Boolean)));
  const tr = await ev(() => { const t = document.querySelector('#toasts .toast.link'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, through: document.getElementById('toasts').classList.contains('through') }; });
  if (tr) {
    // The finger slides over to the toast and lifts there.
    const pts = line(G.cx, G.y + 40, tr.x - G.cx, tr.y - (G.y + 40), 12).slice(1);
    for (const p of pts) { await sleep(17); await touch('touchMove', [p]); }
    await touch('touchEnd', []);
    await page.waitForTimeout(60);
  }
  const mid = await ev(() => ({ tab: Lull.app.tab, toast: !!document.querySelector('#toasts .toast.link:not(.out)') }));
  check('a toast that appears under a swipe lets it through (the swipe is the board\'s)', !!tr && tr.through && mid.tab === 'play' && mid.toast, JSON.stringify({ tr, mid }));
  await page.waitForTimeout(600);
  const armed = await ev(() => !document.getElementById('toasts').classList.contains('through'));
  if (tr) await page.touchscreen.tap(tr.x, tr.y);
  await page.waitForTimeout(250);
  check('half a second later the toast is tapped straight away, and opens its achievement', armed && (await ev(() => Lull.app.tab)) === 'achievements', JSON.stringify({ armed }));
  await ev(() => { document.getElementById('toasts').replaceChildren(); Lull.app.setTab('play'); });

  // No zoom, no scroll, nothing sideways, after all that.
  const still = await ev(() => ({ scale: window.visualViewport ? window.visualViewport.scale : 1, sx: window.scrollX, sy: window.scrollY, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('no page zoom or scroll during play', still.scale === 1 && still.sx === 0 && still.sy === 0 && still.sw <= still.cw, JSON.stringify(still));

  // ---- Classic ----
  await ev(() => Lull.app.setTab('classic'));
  await page.waitForTimeout(200);
  G = await geo('classic');
  await page.waitForTimeout(400); // the card settles in
  const startBtn = await ev(() => { const b = document.querySelector('#classic-overlay .btn.primary'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.height, getComputedStyle(b.querySelector('kbd') || b).display]; });
  check('Classic\'s Start is a 44 px button, its key cap hidden on a phone', startBtn[2] >= 44 && startBtn[3] === 'none', JSON.stringify(startBtn));
  await page.touchscreen.tap(startBtn[0], startBtn[1]);
  await page.waitForTimeout(100);
  check('tapping Start starts Classic', await ev(() => Lull.app.modes.classic.started && !Lull.app.modes.classic.cardOpen));
  await ev(() => { const m = Lull.app.modes.classic; m.level = 1; m.acc = -30; }); // hold gravity off for the moment
  a = await piece('classic');
  await drag(G.cx, G.y + 60, -G.step * 2.2, 0);
  b = await piece('classic');
  check('Classic: a drag moves the piece', b.x - a.x === -2 && b.pieces === a.pieces, JSON.stringify([a, b]));
  await ev(() => { Lull.app.modes.classic.acc = -30; });
  a = await piece('classic');
  await drag(G.cx, G.y + 40, 0, G.step * 3.3);
  b = await piece('classic');
  check('Classic: a slow drag down soft-drops a row a step (and never locks)', a.y - b.y === 3 && b.pieces === a.pieces && b.score - a.score === 3, JSON.stringify([a, b]));
  // Resting the finger down the board keeps lowering (every Lower repeat), without moving it further.
  await ev(() => { Lull.app.modes.classic.acc = -30; });
  a = await piece('classic');
  {
    const pts = line(G.cx, G.y + 40, 0, G.step * 1.3, 8);
    await touch('touchStart', [pts[0]]);
    for (const p of pts.slice(1)) { await sleep(17); await touch('touchMove', [p]); }
    await sleep(520);
    await touch('touchEnd', []);
  }
  b = await piece('classic');
  check('Classic: a finger resting down the board keeps lowering', b.score - a.score >= 4 && b.pieces === a.pieces, JSON.stringify([a, b]));
  await sleep(200);
  a = await piece('classic');
  await flick(G.cx, G.y + 60, 0, 170);
  await page.waitForTimeout(40);
  b = await piece('classic');
  check('Classic: a flick down hard-drops', b.pieces === a.pieces + 1, JSON.stringify([a, b]));
  await sleep(200);
  a = await piece('classic');
  await flick(G.cx, G.cy + 120, 0, -170);
  b = await piece('classic');
  check('Classic: a flick up holds (once a piece)', b.hold === a.id && b.pieces === a.pieces, JSON.stringify([a, b]));
  const pauseBtn = await ev(() => { const b = [...document.querySelectorAll('#classic-controls .btn')].find((x) => /Pause/.test(x.textContent)); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.touchscreen.tap(pauseBtn[0], pauseBtn[1]);
  await page.waitForTimeout(80);
  a = await piece('classic');
  await drag(G.cx, G.y + 60, G.step * 2.2, 0);
  b = await piece('classic');
  const paused = await ev(() => Lull.app.modes.classic.paused);
  check('Classic paused (by a tap on Pause): the board takes no gestures', paused && b.x === a.x, JSON.stringify({ paused, a, b }));
  await shot('71-touch-classic');

  // ---- puzzles on a turned board, and solved by touch alone ----
  await ev(() => Lull.app.setTab('puzzle'));
  await page.waitForTimeout(150);
  const findSeed = (mods) => ev((want) => {
    const all = ['invert', 'flip', 'side', 'hold', 'rigid', 'heavy', 'spin'];
    for (let n = 1; n < 3000; n++) for (const d of ['M', 'H', 'E']) {
      const s = Lull.Puzzles.numberedSeed(d, n), p = Lull.Puzzles.generate(s);
      if (all.every((m) => p.mods.includes(m) === want.includes(m))) return s;
    }
    return null;
  }, mods);
  const side = await findSeed(['side']);
  await ev((s) => { Lull.app.modes.puzzle.load(s, {}); Lull.app.modes.puzzle.setAt = 0; }, side);
  await page.waitForTimeout(100);
  G = await geo('puzzle');
  a = await piece('puzzle');
  await drag(G.cx, G.cy - 40, 0, G.step * 1.3);
  b = await piece('puzzle');
  check('Sideways: a drag down the screen moves the piece right (the screen\'s way, as ↓ does)', b.x - a.x === 1 && b.y === a.y, JSON.stringify([a, b]));
  await ev(() => { const m = Lull.app.modes.puzzle; m.hideCard(); });
  a = await piece('puzzle');
  await flick(G.cx + 80, G.cy, -150, 0);
  await page.waitForTimeout(60);
  b = await ev(() => Lull.app.modes.puzzle.game.s.pieces);
  check('Sideways: a flick left (toward its floor) drops the piece', b === a.pieces + 1, JSON.stringify([a, b]));
  await shot('72-touch-sideways');

  // Solve whole puzzles with gestures only: drags move and lower, taps turn, two fingers turn 180°, a swipe drops or
  // holds — through every view and Inverted Controls.
  const touchSolve = async (seed) => {
    await ev((s) => { Lull.app.modes.puzzle.load(s, {}); Lull.app.modes.puzzle.setAt = 0; }, seed);
    await page.waitForTimeout(80);
    const g = await geo('puzzle');
    const plan = await ev(() => {
      const m = Lull.app.modes.puzzle, INV = { moveL: 'moveR', moveR: 'moveL' }, map = {};
      for (const a of ['left', 'right', 'up', 'down']) { let l = m.mapArrow(a); if (m.inverted) l = INV[l] || l; map[l] = a; }
      return { map, inverted: m.inverted, targets: m.puzzle.targets.map((t) => t.path) };
    });
    const V = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }, S = g.step;
    const floor = V[plan.map.lower], away = [-floor[0], -floor[1]];
    // Start each gesture a little up-board from the middle, so a swipe toward the floor has room on screen.
    const o = [g.cx - floor[0] * 90, g.cy - floor[1] * 90];
    const right = [g.x + g.w * 0.8, g.cy], left = [g.x + g.w * 0.2, g.cy];
    for (let i = 0; i < plan.targets.length; i++) {
      if (await ev(() => Lull.app.modes.puzzle.done)) break;
      for (let k = 0; k < 2; k++) {
        const ok = await ev((j) => { const m = Lull.app.modes.puzzle, pc = m.game.piece, s = m.puzzle.solution[j]; return pc.type.id === s.id && (pc.entry.rot || 0) === (s.rot || 0); }, i);
        if (ok) break;
        await flick(g.cx + floor[0] * 90, g.cy + floor[1] * 90, away[0] * 150, away[1] * 150);
      }
      for (const mv of plan.targets[i]) {
        if (mv === 'L' || mv === 'R') { const d = V[plan.map[mv === 'L' ? 'moveL' : 'moveR']]; await drag(o[0], o[1], d[0] * S * 1.3, d[1] * S * 1.3); }
        else if (mv === 'D') await drag(o[0], o[1], floor[0] * S * 1.3, floor[1] * S * 1.3);
        else if (mv === 'CW' || mv === 'CCW') { const onRight = (mv === 'CW') !== plan.inverted; const p = onRight ? right : left; await tap(p[0], p[1]); }
        else if (mv === '180') await tap2([g.cx - 30, g.cy], [g.cx + 30, g.cy + 20]);
        else if (mv === 'DROP') { await sleep(190); await flick(o[0], o[1], floor[0] * 150, floor[1] * 150); }
        await sleep(30);
      }
      if (plan.targets[i][plan.targets[i].length - 1] !== 'DROP') { await sleep(190); await flick(o[0], o[1], floor[0] * 150, floor[1] * 150); }
      await sleep(200);
    }
    await page.waitForTimeout(80);
    return ev(() => Lull.app.modes.puzzle.done);
  };
  for (const mods of [[], ['side'], ['flip'], ['invert'], ['invert', 'side'], ['hold']]) {
    const seed = await findSeed(mods);
    const ok = seed && await touchSolve(seed);
    check('solved ' + seed + ' (' + (mods.join('+') || 'plain') + ') by touch alone', !!ok);
  }
  await shot('73-touch-solved');

  // ---- the phone layout: fits, 44 px targets, nothing sideways; in both themes and with reduced motion ----
  const layout = async (P2, tag) => {
    const r = await P2.ev(() => {
      const out = { over: [], small: [] };
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.over.push('page');
      for (const el of document.querySelectorAll('#titlebar > *, #titlebar .tabs button, .view.active .statusbar, .view.active .itembar, .view.active .puz-bar, .view.active .puz-actions, .view.active .classic-controls, .view.active .puz-bar button, .view.active .puz-actions button, .view.active .statusbar button, .view.active .itembar button')) {
        const b = el.getBoundingClientRect();
        if (b.width && (b.left < -0.5 || b.right > vw + 0.5)) out.over.push(el.id || el.className);
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && !el.matches('#titlebar')) out.over.push('clipped ' + (el.id || el.className));
      }
      // Every control a finger uses: the 44 × 44 around its middle lands on it (its own hit area included).
      const targets = document.querySelectorAll('#titlebar button, .view.active .statusbar button, .view.active .itembar button, .view.active .puz-actions button, .view.active .puz-bar button, .view.active .classic-controls button');
      for (const el of targets) {
        const b = el.getBoundingClientRect();
        if (!b.width || getComputedStyle(el).visibility === 'hidden') continue;
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const hits = [[-21, 0], [21, 0], [0, -21], [0, 21], [-14, -14], [14, 14], [-14, 14], [14, -14]].every(([dx, dy]) => { const t = document.elementFromPoint(cx + dx, cy + dy); return t && (t === el || el.contains(t)); });
        if (!hits) out.small.push((el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 18) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      }
      return out;
    });
    check(tag + ': nothing overflows; every button is a 44 px target', !r.over.length && !r.small.length, JSON.stringify(r));
  };
  for (const [w, h, theme] of [[390, 844, 'dark'], [390, 844, 'light'], [375, 667, 'dark'], [375, 667, 'light'], [667, 375, 'dark']]) {
    const P2 = w === 390 && theme === 'dark' ? P : await open(w, h, theme);
    await P2.ev((t) => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.settings.theme = t; Lull.app.applySettings(); document.getElementById('toasts').replaceChildren(); }, theme);
    for (const tab of ['play', 'puzzle', 'classic']) {
      await P2.ev((t) => Lull.app.setTab(t), tab);
      await P2.page.waitForTimeout(250);
      await layout(P2, w + 'x' + h + ' ' + theme + ' ' + tab);
      await P2.shot('74-phone-' + w + '-' + theme + '-' + tab);
    }
    await P2.ev(() => { Lull.app.setTab('play'); Lull.app.modes.play.openTray('tool'); });
    await P2.page.waitForTimeout(200);
    await P2.shot('74-phone-' + w + '-' + theme + '-tray');
    await P2.ev(() => { Lull.app.modes.play.openTray(null); Lull.UI.openSettings(Lull.app, 'controls'); });
    await P2.page.waitForTimeout(200);
    const touchCard = await P2.ev(() => {
      const nav = document.querySelector('.set-nav'), m = document.querySelector('.modal-settings').getBoundingClientRect();
      return { touch: [...document.querySelectorAll('.set-card-title')].map((e) => e.textContent), mouse: !!document.querySelector('.switch[data-setting="mouse"]'), pause: !!document.querySelector('.switch[data-setting="pauseAway"]'),
        nav: [...nav.querySelectorAll('button')].map((b) => b.textContent).join(), fits: nav.scrollWidth <= nav.clientWidth + 1 && [...nav.querySelectorAll('button')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= m.left - 0.5 && r.right <= m.right + 0.5 && b.offsetHeight >= 44 && b.offsetWidth >= 44; }) };
    });
    check(w + 'x' + h + ' ' + theme + ': Settings ▸ Controls has the Touch card, and no Mouse or Keyboard card on a touch-only phone', touchCard.touch[0] === 'Touch' && !touchCard.touch.includes('Keyboard') && !touchCard.mouse && !touchCard.pause, JSON.stringify(touchCard));
    check(w + 'x' + h + ' ' + theme + ': the Settings list (Look, Controls, Sound, Gestures, Data) fits, every button 44 px', touchCard.nav === 'Look,Controls,Sound,Gestures,Data' && touchCard.fits, JSON.stringify(touchCard));
    const icons = await P2.ev(() => {
      const nav = document.querySelector('.set-nav'), col = getComputedStyle(nav).flexDirection === 'column';
      const xs = [...nav.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(), i = b.querySelector('.ni').getBoundingClientRect(); return { l: Math.round(i.left), off: Math.abs((i.left + i.right) / 2 - (r.left + r.right) / 2), only: b.textContent.trim() === '' || getComputedStyle(b.lastElementChild).display === 'none' }; });
      return { col, lefts: xs.map((x) => x.l), ok: col ? new Set(xs.map((x) => x.l)).size === 1 : xs.filter((x) => x.only).every((x) => x.off <= 1) };
    });
    check(w + 'x' + h + ' ' + theme + ': the Settings list keeps its icons in line (one column down the side; an icon alone centred in its button)', icons.ok, JSON.stringify(icons));
    await P2.shot('74-phone-' + w + '-' + theme + '-settings');
    if (w === 667) {
      // A keyboard attached with Settings open: its first key still does its work, and focus stays in the window.
      await P2.ev(() => document.querySelector('.switch[data-setting="hints"]').focus());
      const was = await P2.ev(() => Lull.app.settings.hints);
      await P2.page.keyboard.press('Space');
      await P2.page.waitForTimeout(120);
      const k = await P2.ev(() => ({ hints: Lull.app.settings.hints, focus: document.activeElement.dataset.setting || document.activeElement.tagName, inModal: document.querySelector('.modal-settings').contains(document.activeElement), nav: [...document.querySelectorAll('.set-nav button')].map((b) => b.textContent).join() }));
      check('a first key with Settings open (Space on a switch) flips it, keeps focus on it, and brings Keys back', k.hints === !was && k.focus === 'hints' && k.inModal && k.nav === 'Look,Controls,Sound,Keys,Data', JSON.stringify(k));
    }
    await P2.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    if (P2 !== P) await P2.ctx.close();
  }
  // Reduced motion: still a board, still played.
  await ev(() => { Lull.app.settings.motion = 'reduced'; Lull.app.applySettings(); Lull.app.setTab('play'); });
  await page.waitForTimeout(150);
  G = await geo('play');
  await fresh('play', 'L');
  a = await piece('play');
  await drag(G.cx, G.cy, -G.step * 1.2, 0);
  await sleep(200);
  await flick(G.cx, G.cy - 80, 0, 160);
  b = await piece('play');
  check('reduced motion: gestures play the same', b.pieces === a.pieces + 1);
  await shot('75-phone-reduced');
  await ev(() => { Lull.app.settings.motion = 'full'; Lull.app.applySettings(); });

  check('no page errors on the phone', errors.length === 0, errors.slice(0, 5).join('\n'));
  await P.ctx.close();
};

// On its own: node Lull/scripts/touch-test.cjs [screenshot-dir]
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
