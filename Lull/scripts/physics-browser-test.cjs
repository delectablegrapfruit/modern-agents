#!/usr/bin/env node
// Physics in the page (js/physics.js, js/physicsview.js): a Physics board made from the New board window (Modifiers ▸
// Physics, its Material; Mirror off beside it), the power-ups it refuses shown off with the reason and Undo reading
// Rewind 5 s; the simulation running in real time while the piece in play stays where it is; ↓ resting it and ↓ again
// (or held, or a drag down) letting it go; a move shoving a body, refused when the body is pinned; a hard drop knocking
// a resting piece and a soft drop setting down gently; a band clearing whole minos and paying at once; Rewind 5 s; the
// Board full card (Rewind 5 s, Boards, Retire); reduced motion (the stiller material); a phone (390 × 844 and
// 320 × 568, touch); the cost of a full 20 × 40 board all awake; no console errors; screenshots (light and dark: a hard
// drop into a stack, a bar draped over a gap).
// Run by browser-test.cjs: require('./physics-browser-test.cjs')({ browser, check, PAGE, OUT }); or on its own:
//   node Lull/scripts/physics-browser-test.cjs [screenshot-dir]
'use strict';
const path = require('path');

module.exports = async function physicsTests({ browser, check, PAGE, OUT }) {
  console.log('physics');
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
    await ev(() => {
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      Lull.app.modes.play.setGrace = 0;
      Lull.app.setTab('play');
      // Helpers: a fresh Physics board; bodies put straight into its world (cells, colour); the world's numbers.
      window.__phys = (w, h, seed) => {
        const m = Lull.app.modes.play;
        while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
        m.hideCard();
        m.setGame(new Lull.Game({ w, h, seed, recipe: Lull.Recipe.normalize({ mods: { physics: true } }), previewCount: m.settings.preview }));
        m.ctl.waiting = false;
        return m.game;
      };
      window.__body = (cells, color) => { const X = Lull.Physics.of(Lull.app.modes.play.game), W = X.W; const b = Lull.Physics.fromCells(W.next++, cells, cells.map(() => color || 3), 0, 0, 0); W.bodies.push(b); W.hashed = false; return b.id; };
      window.__aim = (id, x, y) => { const g = Lull.app.modes.play.game, X = Lull.Physics.of(g); g.replacePiece({ id }); const p = g.piece; p.rot = 0; p.x = x - p.type.rotBounds[0].minX; X.off = 0; p.y = y != null ? y - p.type.rotBounds[0].minY : g.h - 1 - p.type.rotBounds[0].maxY; Lull.app.modes.play.view.dirty = true; };
      window.__state = () => { const m = Lull.app.modes.play, g = m.game, X = Lull.Physics.of(g); return { t: X.t, bodies: X.W.bodies.length, awake: X.W.bodies.filter((b) => b.awake).length, minos: X.W.bodies.reduce((a, b) => a + b.m, 0), pieces: g.s.pieces, lines: g.s.lines, over: g.over, card: m.cardOpen, y: g.piece ? g.piece.y - X.off : null }; };
    });
    return { ctx, page, ev, shot };
  };
  /** The fastest a body moves over the next `ms` (sampled every frame in the page). */
  const watch = (ev, id, ms) => ev(([id, ms]) => new Promise((res) => {
    const X = Lull.Physics.of(Lull.app.modes.play.game), t0 = performance.now();
    let peak = 0, lastAt = null;
    const look = () => {
      const b = X.W.bodies.find((o) => o.id === id);
      if (b) { let cy = 0; for (let k = 0; k < b.n; k++) cy += b.y[k] / b.n; let cx = 0; for (let k = 0; k < b.n; k++) cx += b.x[k] / b.n; const now = performance.now(); if (lastAt) peak = Math.max(peak, Math.hypot(cx - lastAt[0], cy - lastAt[1]) / ((now - lastAt[2]) / 1000)); lastAt = [cx, cy, now]; }
      if (performance.now() - t0 < ms) requestAnimationFrame(look); else res(peak);
    };
    requestAnimationFrame(look);
  }), [id, ms]);

  // ---- the window ------------------------------------------------------------------------------------------------------
  {
    const { ctx, ev } = await open({});
    const made = await ev(async () => {
      const m = Lull.app.modes.play;
      m.openNewBoard();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('.nb-tab[data-tab="mods"]').click();
      const sw = () => document.querySelector('.nb-switch[data-path="mods.physics"]');
      const name = sw() && sw().querySelector('.nm').textContent, before = sw() && sw().getAttribute('aria-checked');
      const noMaterial = !document.querySelector('[data-path="physics.material"]');
      sw().click();
      const after = sw().getAttribute('aria-checked');
      const mat = [...document.querySelectorAll('[data-path="physics.material"]')].map((b) => b.textContent.trim());
      const mirror = document.querySelector('.nb-switch[data-path="mods.mirror"]');
      const mirrorOff = mirror && mirror.getAttribute('aria-disabled');
      const modes = [...document.querySelectorAll('.nb-tab[data-tab="mode"]')].length;
      document.querySelector('.nb-tab[data-tab="mode"]').click();
      const protect = document.querySelector('.nb-mode[data-value="protect"]');
      const protectOff = protect && protect.getAttribute('aria-disabled');
      const modeNames = [...document.querySelectorAll('.nb-mode')].map((b) => b.textContent.trim());
      [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Create').click();
      await new Promise((r) => setTimeout(r, 150));
      const g = m.game;
      return { name, before, after, noMaterial, mat, mirrorOff, protectOff, modeNames, modes, on: !!g.recipe.mods.physics, ext: g.ext.map((e) => e.key).join(), parts: m.view.parts.map((p) => p.key).join(), label: Lull.Recipe.label(g.recipe) };
    });
    check('New board ▸ Modifiers: a Physics switch; on, its Material (Jelly); Create makes a Physics board', made.name === 'Physics' && made.before === 'false' && made.after === 'true' && made.noMaterial && made.mat.join() === 'Jelly' && made.on && made.ext === 'physics' && made.parts === 'physics' && made.label === 'Physics', JSON.stringify(made));
    check('with Physics on, Mirror and Protect are off (aria-disabled); the modes stay Plain, Protect, Classic', made.mirrorOff === 'true' && made.protectOff === 'true' && !made.modeNames.includes('Physics') && made.modeNames.includes('Classic'), JSON.stringify(made));
    const bar = await ev(() => {
      const m = Lull.app.modes.play, out = {};
      for (const tray of ['tool', 'board', 'choice', 'luck']) {
        m.openTray(tray);
        for (const b of document.querySelectorAll('.item-btn')) out[b.dataset.item] = [b.getAttribute('aria-disabled'), b.getAttribute('data-tip'), b.querySelector('.il').textContent];
      }
      m.openTray(null);
      return Object.assign(out, { refusedIds: Object.keys(Lull.Physics.REFUSE) });
    });
    const refused = bar.refusedIds;
    check('its trays show the refused power-ups off, each with its reason; the rest on', refused.every((id) => bar[id] && bar[id][0] === 'true' && bar[id][1] && bar[id][1].length > 8) && bar.pick[0] === null && bar.order[0] === null, JSON.stringify(bar));
    check('Undo reads Rewind 5 s on a Physics board', bar.rewind && bar.rewind[2] === 'Rewind 5 s' && bar.rewind[0] === null, JSON.stringify(bar.rewind));
    await ctx.close();
  }

  // ---- in play ---------------------------------------------------------------------------------------------------------
  for (const theme of ['light', 'dark']) {
    const { ctx, page, ev, shot } = await open({ colorScheme: theme });
    await ev(() => window.__phys(10, 20, 4));
    const a = await ev(() => window.__state());
    await page.waitForTimeout(600);
    const b = await ev(() => window.__state());
    if (theme === 'light') {
      check('the simulation runs in real time, and the piece in play stays where it is (no fall by itself)', b.y === a.y && b.t > a.t + 0.4 && b.pieces === 0, JSON.stringify([a, b]));
      // ↓ takes it down to rest on the floor, not set; ↓ again lets it go.
      await ev(() => window.__aim('O', 4, 2));
      await page.keyboard.down('ArrowDown'); await page.waitForTimeout(450); await page.keyboard.up('ArrowDown');
      await page.waitForTimeout(700);
      const rest = await ev(() => Object.assign(window.__state(), { resting: Lull.Physics.of(Lull.app.modes.play.game).resting(Lull.app.modes.play.game) }));
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(120);
      const set = await ev(() => window.__state());
      check('↓ lowers the piece to rest on the floor without setting it; ↓ pressed again lets it go', rest.resting && rest.pieces === 0 && Math.abs(rest.y) < 0.05 && set.pieces === 1 && set.bodies === 1, JSON.stringify({ rest, set }));
      // Held against what it rests on (or a drag down, as touch sends it), it is let go after a moment.
      await ev(() => window.__aim('O', 0, 1));
      await page.waitForTimeout(100);
      const drag = await ev(async () => {
        const m = Lull.app.modes.play, g = m.game, before = g.s.pieces;
        for (let i = 0; i < 4; i++) { m.action('down', true); await new Promise((r) => setTimeout(r, 30)); }
        const early = g.s.pieces;
        for (let i = 0; i < 20 && g.s.pieces === early; i++) { m.action('down', true); await new Promise((r) => setTimeout(r, 40)); }
        return { before, early, after: g.s.pieces };
      });
      check('a drag down (or ↓ held) brings it to rest, then lets it go after a moment against the stack', drag.early === drag.before && drag.after === drag.before + 1, JSON.stringify(drag));
      // A move into a body shoves it; against the wall it is pinned and the move is refused.
      await ev(() => window.__phys(10, 20, 5));
      const box = await ev(() => window.__body([[5, 0], [6, 0], [5, 1], [6, 1]], 5));
      await ev(() => window.__aim('O', 3, 0));
      await page.waitForTimeout(300);
      const x0 = await ev((id) => Lull.Physics.of(Lull.app.modes.play.game).W.bodies.find((b) => b.id === id).x0, box);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(60);
      const shove = await ev((id) => { const b = Lull.Physics.of(Lull.app.modes.play.game).W.bodies.find((o) => o.id === id); return { x0: b.x0, awake: b.awake, px: Lull.app.modes.play.game.piece.x }; }, box);
      check('moving the piece into a body shoves it along (it wakes and moves off)', shove.x0 > x0 + 0.9 && shove.awake, JSON.stringify({ x0, shove }));
      await ev(() => { window.__phys(10, 20, 5); window.__body([[7, 0], [8, 0], [9, 0], [7, 1], [8, 1], [9, 1]], 2); window.__aim('O', 5, 0); });
      await page.waitForTimeout(400);
      const px0 = await ev(() => Lull.app.modes.play.game.piece.x);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(60);
      const px1 = await ev(() => Lull.app.modes.play.game.piece.x);
      check('a body pinned against the wall cannot be shoved: the move is refused', px1 === px0, JSON.stringify({ px0, px1 }));
    }

    // A hard drop onto a resting O knocks it; a soft drop does not.
    const knock = async (hard) => {
      await ev(() => window.__phys(10, 20, 4));
      const id = await ev(() => window.__body([[4, 0], [5, 0], [4, 1], [5, 1]], 5));
      await page.waitForTimeout(500);
      await ev(() => window.__aim('I', 3));
      if (hard) { const p = watch(ev, id, 700); await page.keyboard.press('Space'); return p; }
      // (↓ held: down to the O, a moment against it, let go.)
      await page.keyboard.down('ArrowDown');
      const p = watch(ev, id, 2600);
      await page.waitForTimeout(2400);
      await page.keyboard.up('ArrowDown');
      return p;
    };
    const hard = await knock(true);
    if (theme === 'light') await shot('physics-hard-drop-' + theme);
    const soft = await knock(false);
    if (theme === 'light') check('a hard drop (Space) knocks the O it lands on; a soft drop (held ↓) sets down gently', hard > 1 && soft < hard / 4, JSON.stringify({ hard, soft }));

    // A band: row 0 five short of full; an I dropped into the gap makes it 9 of 10, which clears at once, and pays.
    await ev(() => { window.__phys(10, 20, 6); window.__body([[0, 0], [1, 0], [2, 0]], 2); window.__body([[8, 0], [9, 0]], 6); window.__body([[1, 1], [2, 1], [1, 2]], 4); window.__aim('I', 4); });
    await page.waitForTimeout(300);
    const wallet0 = await ev(() => Lull.app.store.state.lines);
    const lines = await ev(() => new Promise((res) => {
      const m = Lull.app.modes.play, g = m.game, t0 = performance.now(); let frames = 0;
      m.action('drop');
      const look = () => { frames++; if (g.s.lines > 0 || performance.now() - t0 > 2000) res({ lines: g.s.lines, frames, minos: Lull.Physics.of(g).W.bodies.reduce((a, b) => a + b.m, 0) }); else requestAnimationFrame(look); };
      requestAnimationFrame(look);
    }));
    const wallet1 = await ev(() => Lull.app.store.state.lines);
    await page.waitForTimeout(120);
    await shot('physics-clear-' + theme);
    if (theme === 'light') check('a band clears whole minos within a few frames of the landing (once they are still) and pays at once', lines.lines === 1 && lines.frames <= 45 && lines.minos === 3 + 2 + 3 + 4 - 9 && wallet1 > wallet0, JSON.stringify({ lines, wallet0, wallet1 }));

    // A stack at rest; then Rewind 5 s from the tray (an Undo held).
    if (theme === 'light') {
      await ev(() => { window.__phys(10, 20, 7); Lull.app.store.state.inventory.rewind = 1; });
      for (let i = 0; i < 5; i++) { await page.keyboard.press(['ArrowLeft', 'ArrowRight'][i % 2]); await page.keyboard.press('Space'); await page.waitForTimeout(450); }
      const before = await ev(() => window.__state());
      await page.waitForTimeout(3000);
      await shot('physics-rest-' + theme);
      const mid = await ev(() => window.__state());
      const back = await ev(() => { const m = Lull.app.modes.play; m.useItem('rewind'); return Object.assign(window.__state(), { held: Lull.app.store.state.inventory.rewind }); });
      check('Rewind 5 s (the Undo held) turns time back about five seconds: fewer pieces, the clock back', back.held === 0 && back.pieces < mid.pieces && mid.t - back.t > 4.5 && mid.t - back.t < 5.6 && !back.over, JSON.stringify({ before, mid, back }));
      check('at rest the bodies (nearly all) sleep', mid.awake <= 2 && mid.bodies >= 3, JSON.stringify(mid));
    }

    // Full: bodies under where the pieces appear; the Board full card.
    await ev(() => window.__phys(8, 10, 9));
    await page.waitForTimeout(700);
    // (The piece in play set down to one side first; then the stack, up to the top, where the next one appears.)
    await ev(() => { window.__aim('O', 6, 0); for (let y = 0; y < 10; y++) window.__body([[2, y], [3, y], [4, y], [5, y]], 1 + (y % 7)); });
    await page.waitForTimeout(300);
    await ev(() => Lull.app.modes.play.action('drop'));
    await page.waitForTimeout(900);
    const card = await ev(() => ({ state: window.__state(), h: (document.querySelector('#play-overlay h2') || {}).textContent, btns: [...document.querySelectorAll('#play-overlay .row .btn')].map((b) => (b.querySelector('.lbl') || b).textContent.trim()), tiles: [...document.querySelectorAll('#play-overlay .bs .l')].map((l) => l.textContent) }));
    await shot('physics-full-' + theme);
    if (theme === 'light') {
      check('a board that cannot take its next piece is full: the Physics card has Rewind 5 s, Boards and Retire', card.state.over && card.h === 'Board full' && card.btns.join('|') === 'Rewind 5 s|Boards|Retire', JSON.stringify(card));
      check('its summary leaves out quads, T-spins, combos and chains, and counts the blocks cleared', !card.tiles.includes('Quads') && !card.tiles.includes('Best chain') && card.tiles.includes('Blocks cleared'), JSON.stringify(card.tiles));
    }
    await ctx.close();
  }

  // ---- the look of soft bodies: a hard drop into a stack, a bar over a gap ------------------------------------------
  for (const theme of ['light', 'dark']) {
    const { ctx, page, ev, shot } = await open({ colorScheme: theme });
    await ev(() => { window.__phys(10, 20, 11); for (const x of [0, 2, 6]) window.__body([[x, 0], [x + 1, 0], [x, 1], [x + 1, 1]], 1 + x / 2); window.__body([[4, 0], [4, 1], [4, 2]], 3); window.__body([[8, 0], [8, 1], [8, 2]], 6); });
    await page.waitForTimeout(700);
    await ev(() => { window.__aim('I', 2); Lull.app.modes.play.action('drop'); });
    await page.waitForTimeout(70);
    await shot('physics-squish-' + theme);
    await page.waitForTimeout(1500);
    await shot('physics-stack-' + theme);
    // A six-long bar over a gap of four.
    await ev(() => { window.__phys(10, 20, 12); window.__body([[1, 0], [1, 1]], 2); window.__body([[6, 0], [6, 1]], 2); window.__body([[1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]], 1); window.__aim('O', 8); });
    await page.waitForTimeout(2500);
    await shot('physics-drape-' + theme);
    if (theme === 'light') {
      const sag = await ev(() => { const b = Lull.Physics.of(Lull.app.modes.play.game).W.bodies[2]; let mid = 9, end = 9; for (let i = 0; i < b.n; i++) if (b.ly[i] === 2) { if (b.lx[i] === 4) mid = b.y[i]; if (b.lx[i] === 1) end = b.y[i]; } return end - mid; });
      check('a bar over a gap sags (the jelly is malleable)', sag > 0.2, String(sag));
      // The cost of a full 20 × 40 board, every mino awake, in the page.
      const ms = await ev(() => {
        const P = Lull.Physics, W = new P.World(20, 40, 'jelly');
        for (let y = 0; y < 38; y++) { const gap = (y * 7) % 20; let run = []; const flush = () => { if (run.length) W.bodies.push(P.fromCells(W.next++, run.map((c) => [c, y]), run.map(() => 3), 0, 0, 0)); run = []; }; for (let c = 0; c < 20; c++) { if (c >= gap && c < gap + 3) { flush(); continue; } if (run.length === 4) flush(); run.push(c); } flush(); }
        const frame = () => { P.stepWorld(W); P.stepWorld(W); P.clearBands(W); };
        for (let i = 0; i < 90; i++) frame();
        for (const b of W.bodies) { b.awake = true; b.still = 0; }
        const t = performance.now();
        for (let i = 0; i < 200; i++) frame();
        return (performance.now() - t) / 200;
      });
      console.log('    20 × 40, all awake: ' + ms.toFixed(2) + ' ms a frame in Chromium');
      check('a full 20 × 40 board, all awake, costs under 6 ms a frame here (about 4 on a quiet machine)', ms < 6, ms.toFixed(2));
    }
    await ctx.close();
  }

  // ---- reduced motion; a phone ---------------------------------------------------------------------------------------
  {
    const { ctx, page, ev } = await open({ reducedMotion: 'reduce' });
    await ev(() => window.__phys(10, 20, 3));
    await page.waitForTimeout(200);
    const r = await ev(() => { const W = Lull.Physics.of(Lull.app.modes.play.game).W; return { reduced: W.reduced, stiff: Lull.Physics.material(W.mat, W.reduced).stiffness, base: Lull.Physics.material(W.mat).stiffness }; });
    check('reduced motion: the stiller material (less wobble), the same game', r.reduced && r.stiff > r.base, JSON.stringify(r));
    await ctx.close();
  }
  for (const [w, h] of [[390, 844], [320, 568]]) {
    const { ctx, page, ev, shot } = await open({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await ev(() => window.__phys(10, 20, 5));
    for (let i = 0; i < 4; i++) { await ev(() => Lull.app.modes.play.action('drop')); await page.waitForTimeout(400); }
    await page.waitForTimeout(600);
    const lay = await ev(() => { const c = document.getElementById('cv-play').getBoundingClientRect(), b = Lull.app.modes.play.view.lay.board; return { cw: c.width, ch: c.height, sw: document.documentElement.scrollWidth, iw: innerWidth, board: b && [b.x, b.w], pieces: Lull.app.modes.play.game.s.pieces }; });
    await shot('physics-phone-' + w + 'x' + h);
    check('a phone ' + w + ' × ' + h + ': the board fits, no sideways scroll, pieces land', lay.sw <= lay.iw && lay.cw <= w && lay.pieces >= 4 && lay.board && lay.board[0] >= 0, JSON.stringify(lay));
    await ctx.close();
  }

  check('physics: no console errors', !errors.length, errors.slice(0, 3).join(' | '));
};

if (require.main === module) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) { console.error('Playwright is not installed; skipping.'); process.exit(0); }
  }
  (async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    let failures = 0;
    const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra && !ok ? ' — ' + extra : '')); if (!ok) failures++; };
    await module.exports({ browser, check, PAGE: 'file://' + path.join(__dirname, '..', 'Game', 'index.html'), OUT: process.argv[2] || null });
    await browser.close();
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })();
}
