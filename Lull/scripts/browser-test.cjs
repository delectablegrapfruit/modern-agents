#!/usr/bin/env node
// Drives the game page in headless Chromium the way a player would: keys, clicks, the shop, items, puzzles solved
// through the real controls (rotated views and inverted controls included), the factory belt, saving and reloading.
//   node Lull/scripts/browser-test.cjs [screenshot-dir]
// Needs Playwright (npm i -g playwright, or NODE_PATH pointing at one).
'use strict';
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) {
    console.error('Playwright is not installed; skipping the browser test.');
    process.exit(0);
  }
}

const PAGE = 'file://' + path.join(__dirname, '..', 'Game', 'index.html');
const OUT = process.argv[2] || null;
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra ? ' — ' + extra : ''));
  if (!ok) failures++;
}

const KEY_FOR = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', cw: 'KeyX', ccw: 'KeyZ', r180: 'KeyA', drop: 'Space', hold: 'KeyC' };

(async () => {
  const launchOpts = {};
  if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
  const ev = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(PAGE);
  await page.waitForTimeout(500);
  check('welcome shown on first run', await page.isVisible('.modal'));
  await page.keyboard.press('Enter');
  check('welcome dismissed with Enter', !(await page.isVisible('.modal')));

  // ---- free play: moves, a line clear, the wallet ------------------------------------------------------------------
  console.log('free play');
  const cleared = await ev(() => {
    const m = Lull.app.modes.play, g = m.game;
    g.resetBoard();
    // Fill the bottom four rows except column 0, then make the current piece an I.
    for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
    g.replacePiece({ id: 'I' });
    m.view.dirty = true;
    return Lull.app.store.state.lines;
  });
  await page.keyboard.press('ArrowUp'); // vertical
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  const after = await ev(() => ({ lines: Lull.app.store.state.lines, wallet: document.getElementById('wallet-n').textContent, board: Lull.app.modes.play.game.board.count() }));
  check('quad banks 4 lines', after.lines === cleared + 4, JSON.stringify(after));
  check('board empty after the quad', after.board === 0);
  await page.waitForTimeout(120);
  await shot('10-quad');

  // Lowering never sets while held; a fresh press on the stack does.
  const lowered = await ev(() => {
    const g = Lull.app.modes.play.game;
    const y0 = g.piece.y, pieces = g.s.pieces;
    for (let i = 0; i < 40; i++) Lull.app.modes.play.action('down', true);
    const rested = g.piece && g.s.pieces === pieces;
    Lull.app.modes.play.action('down', false);
    return { y0, rested, set: g.s.pieces === pieces + 1 };
  });
  check('held ↓ lowers without setting', lowered.rested);
  check('a fresh ↓ on the stack sets the piece', lowered.set);

  // ---- items ---------------------------------------------------------------------------------------------------------
  console.log('items');
  await ev(() => { const s = Lull.app.store; s.state.lines = 20000; Lull.app.refreshWallet(); for (const id of Lull.ITEM_ORDER) s.buyItem(id, 2); Lull.app.modes.play.renderItems(); });
  const invBefore = await ev(() => Object.assign({}, Lull.app.store.state.inventory));
  const itemKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
  for (let i = 0; i < itemKeys.length; i++) {
    const id = await ev((k) => Lull.ITEM_ORDER[k], i);
    // Give every item something to work on.
    await ev(() => {
      const g = Lull.app.modes.play.game;
      if (g.over) Lull.app.modes.play.newBoard();
      g.board.cells.fill(0);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 10; x++) if ((x + y) % 4) g.board.set(x, y, 1 + ((x + y) % 7));
      g.board.set(4, 5, 3);
      if (!g.piece) g.spawnNext();
    });
    if (id === 'rewind') { await page.keyboard.press('Space'); }
    await page.keyboard.press(itemKeys[i]);
    await page.waitForTimeout(60);
    if (id === 'order') { await page.click('.picker button'); }
    if (id === 'blueprint') { await page.click('.modal footer .btn.primary'); }
    const inv = await ev((k) => Lull.app.store.state.inventory[k], id);
    check('item ' + id + ' used', inv === invBefore[id] - 1, 'have ' + inv);
    if (['bomb', 'drill', 'phase', 'sand'].includes(id)) {
      const sp = await ev(() => Lull.app.modes.play.game.piece && Lull.app.modes.play.game.piece.special);
      check('  ' + id + ' piece in play', sp === id);
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(40);
  }
  // Pressing an item again takes it back: the old piece returns, and so does the item.
  const toggle = await ev(async () => {
    const m = Lull.app.modes.play, g = m.game, inv = Lull.app.store.state.inventory;
    if (g.over) m.newBoard();
    g.board.cells.fill(0);
    g.replacePiece({ id: 'L' });
    const n0 = inv.bomb;
    m.useItem('bomb');
    const armed = g.piece.special === 'bomb' && inv.bomb === n0 - 1 && !!document.querySelector('#itembar .item-btn.on');
    m.useItem('bomb');
    return { armed, back: g.piece.type.id === 'L' && !g.piece.special && inv.bomb === n0 };
  });
  check('an item in use shows as on', toggle.armed);
  check('pressing it again puts it back', toggle.back, JSON.stringify(toggle));
  await page.waitForTimeout(200);
  await shot('11-items');

  // ---- mouse only ---------------------------------------------------------------------------------------------------
  console.log('mouse');
  await ev(() => { const m = Lull.app.modes.play; m.newBoard(); m.game.replacePiece({ id: 'T' }); m.view.resize(); m.view.layout(); m.view.render(performance.now()); });
  const cellPt = (x, y) => ev(([cx, cy]) => { const v = Lull.app.modes.play.view; const [sx, sy] = v.toScreen(cx, cy); const r = v.canvas.getBoundingClientRect(); return [r.left + sx + v.lay.s / 2, r.top + sy + v.lay.s / 2]; }, [x, y]);
  const pieceCol = () => ev(() => { const g = Lull.app.modes.play.game, p = g.piece, b = p.type.rotBounds[p.rot]; return p.x + b.minX + Math.floor((b.w - 1) / 2); });
  await page.waitForTimeout(350);
  let pt = await cellPt(1, 12);
  await page.mouse.move(pt[0], pt[1]);
  check('hover: the piece follows the pointer', (await pieceCol()) === 1);
  const rot0 = await ev(() => Lull.app.modes.play.game.piece.rot);
  await page.mouse.click(pt[0], pt[1], { button: 'right' });
  check('right-click turns', (await ev(() => Lull.app.modes.play.game.piece.rot)) === (rot0 + 1) % 4);
  const y0w = await ev(() => Lull.app.modes.play.game.piece.y), pw = await ev(() => Lull.app.modes.play.game.s.pieces);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(80);
  await page.mouse.wheel(0, 120);
  const yw = await ev(() => Lull.app.modes.play.game.piece.y);
  check('the wheel lowers', yw === y0w - 2, y0w + ' → ' + yw);
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(50); }
  check('the wheel never sets the piece', (await ev(() => Lull.app.modes.play.game.s.pieces)) === pw);
  // Keys still work with the pointer resting on the board.
  await ev(() => { Lull.app.modes.play.game.replacePiece({ id: 'T' }); });
  const colK = await pieceCol();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  check('arrow keys work with the pointer over the board', (await pieceCol()) === colK + 2, colK + ' → ' + (await pieceCol()));
  // No slipping under ledges: a click drops straight down.
  await ev(() => { const g = Lull.app.modes.play.game; g.board.cells.fill(0); for (let x = 0; x < 6; x++) g.board.set(x, 3, 8); g.replacePiece({ id: 'O' }); g.piece.y = 17; });
  pt = await cellPt(1, 0);
  await page.mouse.move(pt[0] + 3, pt[1]);
  await page.mouse.move(pt[0], pt[1]);
  const pcs = await ev(() => Lull.app.modes.play.game.s.pieces);
  await page.mouse.click(pt[0], pt[1]);
  const set = await ev(() => { const b = Lull.app.modes.play.game.board; return { under: !!(b.get(1, 0) || b.get(1, 1)), onTop: !!(b.get(1, 4) && b.get(1, 5)), pieces: Lull.app.modes.play.game.s.pieces }; });
  check('a click drops straight down (never under a ledge)', !set.under && set.onTop && set.pieces === pcs + 1, JSON.stringify(set));
  // Off the grid still places.
  const offPt = await ev(() => { const v = Lull.app.modes.play.view; const r = v.canvas.getBoundingClientRect(); return [r.left + v.lay.board.x + v.lay.board.w + 8, r.top + v.lay.board.y + v.lay.board.h - 10]; });
  const pcs2 = await ev(() => Lull.app.modes.play.game.s.pieces);
  await page.mouse.click(offPt[0], offPt[1]);
  check('a click off the grid still places', (await ev(() => Lull.app.modes.play.game.s.pieces)) === pcs2 + 1);
  // Click the hold box, then again to swap back.
  const holdPt = await ev(() => { const v = Lull.app.modes.play.view; const b = v.lay.hold; const r = v.canvas.getBoundingClientRect(); return [r.left + b.x + b.w / 2, r.top + b.y + b.h / 2]; });
  await ev(() => { const g = Lull.app.modes.play.game; g.hold = null; g.holdLocked = false; });
  const cur = await ev(() => Lull.app.modes.play.game.piece.type.id);
  await page.mouse.click(holdPt[0], holdPt[1]);
  check('clicking HOLD holds the piece', (await ev(() => Lull.app.modes.play.game.hold && Lull.app.modes.play.game.hold.id)) === cur);
  await page.mouse.click(holdPt[0], holdPt[1]);
  check('clicking HOLD again brings it back', (await ev(() => Lull.app.modes.play.game.piece.type.id)) === cur);
  // A click on the board drops.
  const before2 = await ev(() => Lull.app.modes.play.game.s.pieces);
  pt = await cellPt(5, 10);
  await page.mouse.click(pt[0], pt[1]);
  check('click drops', (await ev(() => Lull.app.modes.play.game.s.pieces)) === before2 + 1);
  await page.waitForTimeout(100);
  await shot('12-mouse');
  // Tooltip on an item.
  const ib = await page.$('#itembar .item-btn');
  await ib.hover();
  await page.waitForTimeout(450);
  check('hovering an item explains it', await page.isVisible('.tip:not(.hidden)') && /Swap the piece/.test(await page.textContent('.tip')));
  await shot('13-tooltip');
  await page.mouse.move(5, 300);
  const barFits = await ev(() => { const bar = document.getElementById('itembar'); const r = bar.getBoundingClientRect(); return Array.from(bar.children).every((b) => { const q = b.getBoundingClientRect(); return q.right <= r.right + 0.5 && q.top - r.top < 12; }); });
  check('all twelve items fit on one row', barFits);

  // ---- classic ------------------------------------------------------------------------------------------------------
  console.log('classic');
  await page.mouse.move(5, 300);
  await page.click('#to-classic');
  check('Classic opens from the corner of Play (Play stays lit)', await ev(() => Lull.app.tab === 'classic' && document.querySelector('.tabs button[aria-selected="true"]').dataset.tab === 'play' && !document.querySelector('.tabs button[data-tab="classic"]')));
  await page.waitForTimeout(150);
  check('classic waits for a start', await ev(() => !Lull.app.modes.classic.started && Lull.app.modes.classic.cardOpen));
  await page.keyboard.press('Space');
  const y0 = await ev(() => Lull.app.modes.classic.game.piece.y);
  await page.waitForTimeout(2200);
  const fell = await ev(() => ({ y: Lull.app.modes.classic.game.piece.y, pieces: Lull.app.modes.classic.game.s.pieces, music: Lull.Music.playing }));
  check('pieces fall on their own', fell.y < y0 || fell.pieces > 0, JSON.stringify([y0, fell]));
  check('music plays during a game', fell.music);
  await page.keyboard.press('Space');
  check('hard drop scores', await ev(() => Lull.app.modes.classic.score > 0));
  await ev(() => { const m = Lull.app.modes.classic; m.lines = 9; const g = m.game; for (let x = 1; x < 10; x++) g.board.set(x, 0, 8); g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1)); });
  await page.keyboard.press('Space');
  check('ten lines: level 2', await ev(() => Lull.app.modes.classic.level === 2));
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(100);
  const ann = await ev(() => { const A = Lull.Announcer; return [A.phrase({ lines: 1 }), A.phrase({ lines: 4, b2b: true }), A.phrase({ tspin: true, lines: 2 }), A.phrase({ mini: true, lines: 0 }), A.phrase({ lines: 0 }), A.phrase({ lines: 2, perfect: true }, 3)]; });
  check('the announcer knows its lines', JSON.stringify(ann) === JSON.stringify(['single', 'back to back, tetris', 'T-spin double', 'T-spin mini', null, 'double. perfect clear. level 3']), JSON.stringify(ann));
  check('the remix is a long suite', await ev(() => Lull.SONG.bars.length >= 48 && Lull.SONG.loopFrom === 4));
    check('P pauses (and the music stops)', await ev(() => Lull.app.modes.classic.paused && !Lull.Music.playing));
  await shot('14-classic-paused');
  await page.keyboard.press('KeyP');
  await ev(() => { const g = Lull.app.modes.classic.game; for (let y = 0; y < 19; y++) for (let x = 0; x < 10; x++) if (x !== y % 10) g.board.set(x, y, 8); });
  await page.waitForTimeout(2500);
  check('topping out ends the game', await ev(() => Lull.app.modes.classic.over && Lull.app.store.state.stats.classic.best > 0));
  await shot('15-classic-over');
  await page.click('.tabs button[data-tab="play"]');
  check('leaving Classic stops the music', await ev(() => !Lull.Music.playing));

  // ---- puzzles solved through the real keys --------------------------------------------------------------------------
  console.log('puzzles');
  await page.click('.tabs button[data-tab="puzzle"]');
  await page.waitForTimeout(200);
  // Screen-relative arrows under every view turn.
  for (const [mod, rot] of [['side', 90], ['flip', 180]]) {
    const seed = await ev(([m]) => { for (let n = 1; n < 400; n++) { for (const d of ['E', 'M', 'H']) { const s = Lull.Puzzles.numberedSeed(d, n); const p = Lull.Puzzles.generate(s); if (p.mods.includes(m) && !p.mods.includes('invert')) return s; } } return null; }, [mod]);
    await ev((s) => Lull.app.modes.puzzle.load(s, {}), seed);
    const res = await ev(() => {
      const m = Lull.app.modes.puzzle, v = m.view;
      v.resize(); v.layout();
      const screenX = () => Math.min(...m.game.cellsOf().map(([x, y]) => v.toScreen(x, y)[0]));
      const screenY = () => Math.min(...m.game.cellsOf().map(([x, y]) => v.toScreen(x, y)[1]));
      const out = {};
      // Along the floor: left/right in the normal and upside-down views, up/down when sideways. ← lowers when sideways.
      const along = v.view.rot % 180 === 0 ? ['left', 'right', screenX] : ['up', 'down', screenY];
      let a0 = along[2](); m.action(along[1]); out.fwd = along[2]() > a0;
      a0 = along[2](); m.action(along[0]); out.back = along[2]() < a0;
      if (v.view.rot === 90) { const x0 = screenX(); m.action('left'); out.lowerIsLeft = screenX() < x0; }
      out.rot = v.view.rot;
      return out;
    });
    check('arrows follow the screen with ' + mod + ' (rot ' + res.rot + ')', res.fwd && res.back && res.lowerIsLeft !== false && res.rot === rot, JSON.stringify(res));
    await shot('20-' + mod);
  }

  const solveOne = async (seed) => {
    await ev((s) => Lull.app.modes.puzzle.load(s, {}), seed);
    const plan = await ev(() => {
      const m = Lull.app.modes.puzzle;
      // Which key gives each logical move (through the view turn and inverted controls).
      const map = {};
      for (const a of ['left', 'right', 'up', 'down']) {
        let l = m.mapArrow(a);
        if (m.inverted) l = { moveL: 'moveR', moveR: 'moveL', rotate: 'rotateInv' }[l] || l;
        map[l] = a;
      }
      const keys = { L: map.moveL, R: map.moveR, D: map.lower, CW: m.inverted ? 'ccw' : 'cw', CCW: m.inverted ? 'cw' : 'ccw', '180': 'r180', DROP: 'drop' };
      return { targets: m.puzzle.targets.map((t) => t.path), keys, lower: map.lower, mods: m.puzzle.mods };
    });
    for (let i = 0; i < plan.targets.length; i++) {
      const pathMoves = plan.targets[i];
      // Hold puzzles: hold until the piece the solution wants is in play.
      for (let k = 0; k < 2; k++) {
        const ok = await ev((j) => { const m = Lull.app.modes.puzzle, pc = m.game.piece, s = m.puzzle.solution[j]; return pc.type.id === s.id && (pc.entry.rot || 0) === (s.rot || 0); }, i);
        if (ok) break;
        await page.keyboard.press(KEY_FOR.hold);
      }
      for (const mv of pathMoves) await page.keyboard.press(KEY_FOR[plan.keys[mv]]);
      if (pathMoves[pathMoves.length - 1] !== 'DROP') await page.keyboard.press(KEY_FOR[plan.lower]);
    }
    await page.waitForTimeout(50);
    return { solved: await ev(() => Lull.app.modes.puzzle.done), mods: plan.mods };
  };

  const linesBefore = await ev(() => Lull.app.store.state.lines);
  let solved = 0, tried = 0;
  const modsSolved = new Set();
  for (const d of ['E', 'M', 'H']) {
    for (let n = 1; n <= 12; n++) {
      const seed = await ev(([dd, nn]) => Lull.Puzzles.numberedSeed(dd, nn), [d, n]);
      const r = await solveOne(seed);
      tried++;
      if (r.solved) { solved++; r.mods.forEach((m) => modsSolved.add(m)); } else console.log('    unsolved ' + seed + ' ' + r.mods.join(','));
    }
  }
  check('puzzles solved with the keyboard (Hold ones by holding)', solved === tried && modsSolved.has('hold'), solved + '/' + tried + ' · wildcards seen: ' + Array.from(modsSolved).sort().join(' '));
  const linesAfter = await ev(() => Lull.app.store.state.lines);
  check('puzzle rewards banked', linesAfter > linesBefore, (linesAfter - linesBefore) + ' lines');
  await shot('21-solved');
  await page.click('#puz-history');
  const histRows = await page.$$eval('.hist-row', (r) => r.length);
  check('puzzle history lists what was played', histRows >= 36, histRows + ' rows');
  await shot('23-history');
  await page.keyboard.press('Escape');

  // Retry, undo and failing.
  await ev(() => Lull.app.modes.puzzle.loadNumbered('H', 3));
  const fail = await ev(() => { const m = Lull.app.modes.puzzle; let guard = 0; while (m.game.piece && guard++ < 20) m.action('drop'); return { card: m.cardOpen, done: m.done }; });
  check('dropping everything anywhere fails the puzzle (or solves it)', fail.card);
  await page.keyboard.press('Backspace');
  check('undo takes the card away', !(await ev(() => Lull.app.modes.puzzle.cardOpen)));
  await page.keyboard.press('KeyR');
  check('retry restarts', await ev(() => Lull.app.modes.puzzle.game.s.pieces === 0));
  await shot('22-puzzle');

  // ---- factory -------------------------------------------------------------------------------------------------------
  console.log('factory');
  await page.click('.tabs button[data-tab="factory"]');
  await page.waitForTimeout(200);
  const hitCenter = (id, data) => ev(([i, d]) => { const v = Lull.app.modes.factory.view; const hh = v.hits.find((x) => x.id === i && (d === undefined || x.data === d)); if (!hh) return null; const r = v.canvas.getBoundingClientRect(); return [r.left + v.ox + (hh.x + hh.w / 2) * v.k, r.top + v.oy + (hh.y + hh.h / 2) * v.k]; }, [id, data]);
  await ev(() => { const m = Lull.app.modes.factory; m.work.inbox = []; m.work.tickets = []; m.active = null; m.nextOrder = 0; });
  await page.waitForTimeout(400);
  check('an online order arrives', await ev(() => Lull.app.modes.factory.work.inbox.length === 1));
  await shot('30-orders');
  let at = await hitCenter('accept');
  await page.mouse.click(at[0], at[1]);
  await page.waitForTimeout(450);
  await shot('31-printing');
  await page.waitForTimeout(1100);
  const order = await ev(() => { const m = Lull.app.modes.factory, j = m.work.tickets[0]; return j && { stage: j.stage, cells: j.order.cells, colors: j.order.colors, fire: j.order.fire }; });
  check('accepting prints a ticket onto the rail', order && order.stage === 'mold');
  await page.click('#fac-stations [data-station="mold"]');
  await page.waitForTimeout(60);
  for (const [x, y] of order.cells) { const q = await hitCenter('cell', (x + 1) + ',' + (y + 1)); await page.mouse.click(q[0], q[1]); }
  await page.waitForTimeout(80);
  await shot('32-mold');
  at = await hitCenter('toKiln'); await page.mouse.click(at[0], at[1]);
  check('into the kiln', await ev(() => Lull.app.modes.factory.station === 'kiln' && Lull.app.modes.factory.work.tickets[0].stage === 'kiln'));
  await ev(() => { const j = Lull.app.modes.factory.work.tickets[0]; j.heat = Lull.Factory.FIRING[j.order.fire].at - 0.02; });
  await page.waitForTimeout(150);
  await shot('33-kiln');
  at = await hitCenter('pull', 0); await page.mouse.click(at[0], at[1]);
  check('taken out, on to the paint booth', await ev(() => Lull.app.modes.factory.station === 'paint' && Lull.app.modes.factory.work.tickets[0].stage === 'paint'));
  await page.waitForTimeout(60);
  // Spray every cell in its paint.
  const cellPts = await ev(() => { const m = Lull.app.modes.factory, v = m.view, g = v.paintG, r = v.canvas.getBoundingClientRect(); return m.active.built.map((k, i) => { const c = v.cellRect(g, i); return [r.left + v.ox + (c.x + c.s / 2) * v.k, r.top + v.oy + (c.y + c.s / 2) * v.k]; }); });
  at = await hitCenter('can', order.colors[0]); await page.mouse.click(at[0], at[1]);
  for (const [x, y] of cellPts) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); }
  await page.mouse.move(cellPts[0][0] + 5, cellPts[0][1] + 5);
  await shot('34-paint');
  at = await hitCenter('ship'); await page.mouse.click(at[0], at[1]);
  await page.waitForTimeout(1600);
  await shot('35-delivery');
  const lines0 = await ev(() => Lull.app.store.state.lines);
  check('the review waits', await ev(() => !Lull.app.modes.factory.judge.booked));
  await page.waitForTimeout(4400);
  await shot('36-review');
  const rev = await ev(() => { const J = Lull.app.modes.factory.judge; return J && { booked: J.booked, score: J.review.score, stars: J.review.stars, rows: J.review.rows }; });
  check('then the customer reviews it', rev && rev.booked && rev.score >= 90 && rev.stars >= 4, JSON.stringify(rev));
  check('the review pays lines', (await ev(() => Lull.app.store.state.lines)) > lines0);
  at = await hitCenter('continue'); await page.mouse.click(at[0], at[1]);
  check('Continue closes the review', await ev(() => !Lull.app.modes.factory.judge));
  // The line: click a defect off it.
  await page.click('#fac-stations [data-station="line"]');
  await ev(() => { const L2 = Lull.app.modes.factory.line; L2.items = []; for (let k = 0; k < 4; k++) { const it = Lull.Factory.makeItem(L2.f, L2.rng, k % 2 === 0); it.id = 900 + k; it.x = 0.1 + k * 0.2; it.golden = false; L2.items.push(it); } L2.speed = 0.0001; });
  await page.waitForTimeout(80);
  const caught0 = await ev(() => Lull.app.store.state.factory.stats.caught);
  const def = await ev(() => { const it = Lull.app.modes.factory.line.items.find((i) => i.defect); return it.id; });
  at = await ev((id) => { const v = Lull.app.modes.factory.view; const hh = v.hits.find((x) => x.id === 'item' && x.data.id === id); const r = v.canvas.getBoundingClientRect(); return [r.left + v.ox + (hh.x + hh.w / 2) * v.k, r.top + v.oy + (hh.y + hh.h / 2) * v.k]; }, def);
  await page.mouse.click(at[0], at[1]);
  check('clicking a defect on the line pulls it', (await ev(() => Lull.app.store.state.factory.stats.caught)) === caught0 + 1);
  await page.waitForTimeout(250);
  await shot('37-line');
  await ev(() => { Lull.app.modes.factory.line.speed = 0.075; });
  // Upgrades
  await ev(() => { Lull.app.store.state.factory.credits = 1e5; });
  await page.click('#fac-head .btn');
  await page.waitForTimeout(100);
  await page.click('.modal .up-card .btn.primary');
  check('upgrades can be bought', (await ev(() => Lull.app.store.state.factory.up.line)) === 1);
  await shot('38-upgrades');
  await page.keyboard.press('Escape');
  const offline = await ev(() => { const f = Lull.app.store.state.factory; const c0 = f.credits; f.lastTick = Date.now() - 12 * 3600e3; const r = Lull.Factory.catchUp(f, Date.now()); return { gained: f.credits - c0, capped: r.cappedSeconds }; });
  check('offline progress capped at eight hours', offline.gained > 0 && offline.capped === 8 * 3600, JSON.stringify(offline));

  // ---- shop and settings ---------------------------------------------------------------------------------------------
  console.log('shop');
  await page.click('.tabs button[data-tab="shop"]');
  const tabsFit = await ev(() => { const t = document.getElementById('shop-tabs'); const r = t.getBoundingClientRect(); return Array.from(t.children).every((b) => b.getBoundingClientRect().right <= r.right + 0.5); });
  check('every shop section is visible', tabsFit);
  await page.click('#shop-tabs button:nth-child(2)'); // skins
  await page.waitForTimeout(100);
  await shot('40-skins');
  await page.click('#shop-grid .card:nth-child(2) .btn.primary');
  await page.click('.modal footer .btn.primary');
  const skin = await ev(() => Lull.app.store.state.equipped.skin);
  check('skin bought and equipped', skin === 'bevel', skin);
  for (const [n, name] of [[1, 'palettes'], [3, 'frames'], [4, 'backdrops'], [5, 'effects'], [6, 'ghosts']]) {
    await page.click('#shop-tabs button:nth-child(' + n + ')');
    await page.waitForTimeout(60);
    await shot('41-' + name);
  }
  await page.click('#shop-tabs button:nth-child(7)'); // sounds
  await page.waitForTimeout(60);
  await shot('43-sounds');
  await page.click('#shop-grid .card:nth-child(3) .sound-preview');
  await page.click('#shop-grid .card:nth-child(3) .btn.primary');
  await page.click('.modal footer .btn.primary');
  check('sound pack bought and in use', await ev(() => Lull.app.store.state.equipped.sound === 'chip' && Lull.Sound.pack === 'chip'));
  await ev(() => { const s = Lull.app.store; s.state.lines += 20000; for (const k of Object.keys(Lull.COSMETICS)) for (const id of Object.keys(Lull.COSMETICS[k])) if (!Lull.COSMETICS[k][id].reward) s.buyCosmetic(k, id); });
  for (const [kind, id] of [['palette', 'prism'], ['skin', 'gem'], ['frame', 'rainbow'], ['backdrop', 'stars'], ['effect', 'confetti'], ['ghost', 'glow']]) await ev(([k, i]) => Lull.app.store.equip(k, i), [kind, id]);
  await ev(() => Lull.app.applyLook());
  await page.click('.tabs button[data-tab="play"]');
  await page.waitForTimeout(150);
  await shot('42-dressed');

  console.log('stats and settings');
  await page.click('.tabs button[data-tab="stats"]');
  for (let n = 1; n <= 5; n++) {
    await page.click('#stats-tabs button:nth-child(' + n + ')');
    await page.waitForTimeout(50);
    await shot('50-stats-' + n);
  }
  await page.click('#btn-settings');
  await page.waitForTimeout(100);
  await shot('60-settings');
  await page.click('.modal .tile:has-text("Light")');
  await page.click('.modal .tile:has-text("Solid")');
  for (const sec of ['Controls', 'Sound', 'Keys', 'Data']) { await page.click('.set-nav button:has-text("' + sec + '")'); await page.waitForTimeout(40); await shot('60-settings-' + sec.toLowerCase()); }
  await page.keyboard.press('Escape');
  await page.click('.tabs button[data-tab="play"]');
  await page.waitForTimeout(100);
  await shot('61-light');
  check('theme and background applied', await ev(() => document.documentElement.dataset.theme === 'light' && document.getElementById('app').className === 'bg-solid'));

  // ---- window sizes -------------------------------------------------------------------------------------------------
  console.log('sizes');
  for (const [w, hgt] of [[300, 440], [900, 560], [420, 900]]) {
    await page.setViewportSize({ width: w, height: hgt });
    for (const tab of ['play', 'classic', 'puzzle', 'factory']) {
      await ev((t) => Lull.app.setTab(t), tab);
      await page.waitForTimeout(150);
      const overflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      check(w + '×' + hgt + ' ' + tab + ' fits', !overflow);
      await shot('70-' + w + 'x' + hgt + '-' + tab);
    }
  }

  // ---- save and reload ----------------------------------------------------------------------------------------------
  console.log('persistence');
  const snap = await ev(() => { Lull.app.setTab('play'); Lull.app.saveNow(); const s = Lull.app.store.state; return { lines: s.lines, cells: Lull.app.modes.play.game.board.count(), skin: s.equipped.skin, solved: Object.keys(s.puzzle.solved).length }; });
  await page.reload();
  await page.waitForTimeout(400);
  const back = await ev(() => { const s = Lull.app.store.state; return { lines: s.lines, cells: Lull.app.modes.play.game.board.count(), skin: s.equipped.skin, solved: Object.keys(s.puzzle.solved).length, modal: !!document.querySelector('.modal') }; });
  check('progress survives a reload', back.lines === snap.lines && back.cells === snap.cells && back.skin === snap.skin && back.solved === snap.solved, JSON.stringify([snap, back]));
  check('no welcome on the second run', !back.modal);

  check('no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
  await browser.close();
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
