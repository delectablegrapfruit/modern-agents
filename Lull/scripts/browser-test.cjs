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
  const after = await ev(() => ({ lines: Lull.app.store.state.lines, fromAch: Lull.app.store.state.stats.lines.achievements, wallet: document.getElementById('wallet-n').textContent, board: Lull.app.modes.play.game.board.count(), ach: Object.keys(Lull.app.store.state.achievements).sort() }));
  check('a quad banks 5 lines (4 + 1 for the quad; plus the first-quad and perfect-clear achievements)', after.lines === cleared + 5 + after.fromAch && after.ach.join() === 'pc,quad', JSON.stringify(after));
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

  // Nothing in the status bar may move the board (a combo appearing used to wrap it onto a second line).
  const steady = await ev(() => {
    const m = Lull.app.modes.play, c = m.canvas.getBoundingClientRect();
    m.game.s.combo = 7; m.game.s.score = 123456789; m.renderStatus();
    const c2 = m.canvas.getBoundingClientRect();
    m.game.s.combo = -1; m.renderStatus();
    return c.height === c2.height && c.width === c2.width;
  });
  check('a combo (or a long score) never resizes the board', steady);
  // The chain: back-to-back quads and combos multiply what lines pay (a quad is worth 5).
  const chain = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, out = [];
    g.resetBoard();
    for (let k = 0; k < 2; k++) {
      for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
      g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
      const w0 = Lull.app.store.state.lines, r = g.drop();
      out.push([r.banked, r.mult, Lull.app.store.state.lines - w0 - (Lull.app.store.state.stats.lines.achievements || 0) * 0]);
    }
    return { out, status: document.getElementById('play-status').textContent };
  });
  check('the chain multiplies quads: 5, then 15 (×3)', chain.out[0][0] === 5 && chain.out[1][0] === 15 && chain.out[1][1] === 3 && /Chain ×3/.test(chain.status), JSON.stringify(chain));
  // Retiring a board shows its whole life, and logs it.
  await ev(() => { const m = Lull.app.modes.play; m.game.s.items = { bomb: 2, laser: 1 }; m.game.s.startedAt = Date.now() - 3 * 86400e3; });
  await page.click('#play-status .btn');
  const sum = await ev(() => { const c = document.querySelector('#play-overlay .board-sum'); return c ? c.textContent : ''; });
  check('retiring asks, showing the board\'s life', /Lifetime/.test(sum) && /3 used/.test(sum) && /Bomb ×2/.test(sum), sum.slice(0, 200));
  await shot('10b-retire');
  const logN = await ev(() => (Lull.app.store.state.stats.free.boardLog || []).length);
  await page.click('#play-overlay .btn.primary');
  check('a retired board is logged', (await ev(() => Lull.app.store.state.stats.free.boardLog.length)) === logN + 1 && (await ev(() => Lull.app.modes.play.game.s.pieces)) === 0);
  // ---- items ---------------------------------------------------------------------------------------------------------
  console.log('items');
  await ev(() => { const s = Lull.app.store; s.state.lines = 20000; Lull.app.refreshWallet(); for (const id of Lull.ITEM_ORDER) s.buyItem(id, 2); Lull.app.modes.play.renderItems(); });
  const invBefore = await ev(() => Object.assign({}, Lull.app.store.state.inventory));
  const itemPlan = await ev(() => Lull.ITEM_ORDER.map((id) => { const g = Lull.ITEMS[id].group; const gi = Lull.ITEM_GROUPS.findIndex((x) => x.id === g); return { id, gi, ii: Lull.ITEM_ORDER.filter((k) => Lull.ITEMS[k].group === g).indexOf(id) }; }));
  check('every item belongs to a type', itemPlan.every((x) => x.gi >= 0 && x.ii >= 0) && itemPlan.length >= 20, itemPlan.length + ' items');
  for (const { id, gi, ii } of itemPlan) {
    // Give every item something to work on.
    await ev(() => {
      const g = Lull.app.modes.play.game;
      if (g.over) Lull.app.modes.play.newBoard();
      g.board.cells.fill(0);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 10; x++) if ((x + y) % 4) g.board.set(x, y, 1 + ((x + y) % 7));
      g.board.set(4, 5, 3);
      if (!g.piece) g.spawnNext();
      g.replacePiece({ id: 'T' });
    });
    if (id === 'rewind') { await page.keyboard.press('Space'); }
    await page.keyboard.press('Digit' + (gi + 1));
    check('  tray ' + (gi + 1) + ' opens for ' + id, await page.isVisible('.item-tray:not(.hidden) [data-item="' + id + '"]'));
    await page.keyboard.press('Digit' + (ii + 1));
    await page.waitForTimeout(60);
    if (id === 'order') { await page.click('.picker button'); }
    if (id === 'blueprint') { await page.click('.modal footer .btn.primary'); }
    if (id === 'jackpot') {
      await page.waitForTimeout(2600);
      const won = await ev(() => document.querySelectorAll('.reel.win').length);
      check('  jackpot: three reels stop', won === 3);
      await shot('11-jackpot');
      await page.click('.modal footer .btn.primary');
    }
    const inv = await ev((k) => Lull.app.store.state.inventory[k], id);
    const expect = id === 'jackpot' ? inv >= invBefore[id] - 1 : inv === invBefore[id] - 1;
    check('item ' + id + ' used', expect, 'have ' + inv);
    if (['bomb', 'drill', 'phase', 'sand', 'anvil', 'magnet', 'laser', 'blackhole', 'golden'].includes(id)) {
      const sp = await ev(() => Lull.app.modes.play.game.piece && Lull.app.modes.play.game.piece.special);
      check('  ' + id + ' piece in play', sp === id);
      if (id === 'laser' || id === 'blackhole') await shot('11-' + id);
      await page.keyboard.press('Space');
      await page.waitForTimeout(90);
      if (id === 'blackhole' || id === 'anvil' || id === 'laser') await shot('11-' + id + '-hit');
    }
    if (id === 'nuke' || id === 'tornado') { await page.waitForTimeout(120); await shot('11-' + id); }
    check('  the tray closes after use', !(await page.isVisible('.item-tray:not(.hidden)')));
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
    const armed = g.piece.special === 'bomb' && inv.bomb === n0 - 1 && !!document.querySelector('#itembar .group-btn.on');
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
  // Pointer on the left half of the piece's column: right-click turns the other way, and the arrow says so.
  const s1 = await ev(() => Lull.app.modes.play.view.lay.s);
  await page.mouse.move(pt[0] - s1 * 0.3, pt[1]);
  check('the turn arrow shows counter-clockwise on the left half', (await ev(() => Lull.app.modes.play.view.turnHint)) === 'ccw');
  const rot1 = await ev(() => Lull.app.modes.play.game.piece.rot);
  await page.mouse.click(pt[0] - s1 * 0.3, pt[1], { button: 'right' });
  check('right-click on the left half turns counter-clockwise', (await ev(() => Lull.app.modes.play.game.piece.rot)) === (rot1 + 3) % 4);
  await page.mouse.move(pt[0], pt[1]);
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
  // Steady aim: a pointer barely over a column edge keeps the column; a slip right before the click is ignored.
  await ev(() => { const g = Lull.app.modes.play.game; g.board.cells.fill(0); g.replacePiece({ id: 'O' }); g.piece.y = 17; });
  const c3 = await cellPt(3, 10), s0 = await ev(() => Lull.app.modes.play.view.lay.s);
  await page.mouse.move(c3[0] + 4, c3[1]); await page.mouse.move(c3[0], c3[1]);
  await page.waitForTimeout(250);
  const col3 = await pieceCol();
  await page.mouse.move(c3[0] + s0 * 0.6, c3[1]);
  check('sticky aim: just over the edge keeps the column', (await pieceCol()) === col3);
  const pcsG = await ev(() => Lull.app.modes.play.game.s.pieces);
  await page.mouse.move(c3[0] + s0 * 1.0, c3[1]);
  await page.mouse.down(); await page.mouse.up();
  const landed = await ev(() => { const b = Lull.app.modes.play.game.board; const cols = []; for (let x = 0; x < 10; x++) if (b.get(x, 0)) cols.push(x); return cols; });
  check('click grace: a slip just before the click drops where it was', landed.includes(3) && (await ev(() => Lull.app.modes.play.game.s.pieces)) === pcsG + 1, JSON.stringify([col3, landed]));
  // Inverted Controls turn the mouse around too.
  await ev(() => { const m = Lull.app.modes.play; m.inverted = true; m.rawCol = null; const g = m.game; g.board.cells.fill(0); g.replacePiece({ id: 'O' }); g.piece.y = 17; });
  const inv = await cellPt(2, 10);
  await page.mouse.move(inv[0] + 3, inv[1]); await page.mouse.move(inv[0], inv[1]);
  check('Inverted Controls mirror the mouse aim', (await pieceCol()) === 7, String(await pieceCol()));
  await ev(() => { Lull.app.modes.play.inverted = false; });
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
  const ib = await page.$('#itembar .group-btn');
  await ib.hover();
  await page.waitForTimeout(450);
  check('hovering an item type explains it', await page.isVisible('.tip:not(.hidden)') && /Change the piece/.test(await page.textContent('.tip')));
  await ib.click();
  const it0 = await page.$('.item-tray .item-btn');
  await it0.hover();
  await page.waitForTimeout(450);
  check('hovering an item explains it', /Swap the piece/.test(await page.textContent('.tip')));
  await shot('13-tray');
  await page.keyboard.press('Escape');
  check('Esc closes the tray', !(await page.isVisible('.item-tray:not(.hidden)')));
  await shot('13-tooltip');
  await page.mouse.move(5, 300);
  const barFits = await ev(() => { const bar = document.getElementById('itembar'); const r = bar.getBoundingClientRect(); return Array.from(bar.children).every((b) => { const q = b.getBoundingClientRect(); return q.right <= r.right + 0.5 && q.top - r.top < 12; }); });
  check('the item types fit on one row', barFits);

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
  check('the announcer knows its lines', JSON.stringify(ann) === JSON.stringify([['single'], ['b2b', 'tetris'], ['tspin', 'double'], ['tspin', 'mini'], null, ['double', 'perfect', 'levelup']]), JSON.stringify(ann));
  const clips = await ev(async () => { const out = {}; for (const k of Object.keys(Lull.VOICE_CLIPS)) { const b = await Lull.Announcer.decode(k); out[k] = b ? +b.duration.toFixed(2) : 0; } return out; });
  check('every whispered clip decodes (0.3–2 s)', Object.values(clips).length === 10 && Object.values(clips).every((d) => d > 0.3 && d < 2), JSON.stringify(clips));
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
  const fits = await ev(() => {
    const m = document.querySelector('.modal-hist').getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('.hist-row'));
    return { inWindow: m.top >= app.top && m.bottom <= app.bottom + 0.5, oneLine: rows.every((r) => r.getBoundingClientRect().height < 48 && r.scrollWidth <= r.clientWidth + 1), scrolls: document.querySelector('.hist').scrollHeight > document.querySelector('.hist').clientHeight };
  });
  check('history fits the window: compact rows, a scrolling list', fits.inWindow && fits.oneLine && fits.scrolls, JSON.stringify(fits));
  await shot('23-history');
  // Save a seed from a row, then find it under Saved.
  const rowSeed = await page.textContent('.hist-row .seedchip');
  await page.click('.hist-row .star');
  await page.click('.modal-hist .seg button:nth-child(4)');
  check('a saved seed shows under Saved', (await page.$$eval('.hist-row .seedchip', (r) => r.map((x) => x.textContent))).includes(rowSeed));
  await shot('24-saved');
  await page.keyboard.press('Escape');
  // And the current puzzle's ☆ in the header.
  const was = await ev(() => { const m = Lull.app.modes.puzzle; return m.isSaved(m.puzzle.seed); });
  await page.click('#puz-save');
  const savedNow = await ev(() => { const m = Lull.app.modes.puzzle; return [m.isSaved(m.puzzle.seed), document.getElementById('puz-save').textContent]; });
  check('☆ / ★ in the header saves and unsaves the puzzle in play', savedNow[0] === !was && savedNow[1] === (was ? '☆' : '★'), JSON.stringify(savedNow));
  await page.click('#puz-save');
  check('and back', await ev((w) => { const m = Lull.app.modes.puzzle; return m.isSaved(m.puzzle.seed) === w; }, was));

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
  await ev(() => { const f = Lull.app.store.state.factory; Object.assign(f, Lull.Factory.create()); f.lastTick = Date.now(); });
  await page.click('.tabs button[data-tab="factory"]');
  await page.waitForTimeout(200);
  check('a fresh factory offers its first press', await ev(() => { const b = document.querySelector('#fac-list .row-card[data-tier="1"] .btn.primary'); return b && !b.disabled; }));
  await page.click('#fac-list .row-card[data-tier="1"] .btn.primary');
  check('buying a press opens the next line', await ev(() => Lull.app.store.state.factory.owned[1] === 1 && !!document.querySelector('#fac-list .row-card[data-tier="2"]')));
  await ev(() => { const f = Lull.app.store.state.factory; f.credits = 5e5; });
  await page.waitForTimeout(300);
  await page.click('#fac-list .row-card[data-tier="1"] .fac-buy .btn:not(.primary)');
  check('Max buys as many as the credits allow', await ev(() => Lull.app.store.state.factory.owned[1] > 20));
  await page.click('#fac-list .row-card[data-tier="2"] .btn.primary');
  await page.click('#fac-list .row-card[data-tier="3"] .btn.primary');
  await page.waitForTimeout(1500);
  check('the belt carries minos', await ev(() => Lull.app.modes.factory.belt.items.length > 0));
  await shot('30-factory');
  // Click a defect off the belt.
  await ev(() => { const b = Lull.app.modes.factory.belt; b.items = []; for (let k = 0; k < 4; k++) { const it = Lull.Factory.makeItem(b.f, b.rng, k % 2 === 0); it.id = 900 + k; it.x = 2 + k * 8; it.value = 1; b.items.push(it); } b.speed = 0.0001; });
  await page.waitForTimeout(120);
  const caught0 = await ev(() => Lull.app.store.state.factory.stats.caught);
  const dpt = await ev(() => { const m = Lull.app.modes.factory, it = m.belt.items.find((i) => i.defect), c = m.view.itemCenter(it), r = m.canvas.getBoundingClientRect(); return [r.left + c[0], r.top + c[1]]; });
  await page.mouse.click(dpt[0], dpt[1]);
  check('clicking a cracked mino pulls it off the belt', (await ev(() => Lull.app.store.state.factory.stats.caught)) === caught0 + 1);
  await ev(() => { Lull.app.modes.factory.belt.speed = 1.4; });
  // A full crate trades for lines.
  const lines0 = await ev(() => { const f = Lull.app.store.state.factory; f.crate = Lull.Factory.crateSize(f); return Lull.app.store.state.lines; });
  await page.waitForTimeout(300);
  await shot('31-crate');
  await page.click('#fac-top .crate .btn');
  check('a full crate pays lines', (await ev(() => Lull.app.store.state.lines)) === lines0 + 3);
  // The inspector.
  await ev(() => { Lull.app.store.state.factory.credits = 1e6; });
  await page.waitForTimeout(300);
  await page.click('#fac-list .row-card:has(.fac-ico.big) .btn');
  check('the inspector can be bought', await ev(() => Lull.app.store.state.factory.inspect === 1));
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
  const nTabs = await page.$$eval('#stats-tabs button', (b) => b.length);
  for (let n = 1; n <= nTabs; n++) {
    await page.click('#stats-tabs button:nth-child(' + n + ')');
    await page.waitForTimeout(50);
    await shot('50-stats-' + n);
  }
  await page.click('.tabs button[data-tab="achievements"]');
  await page.waitForTimeout(80);
  await shot('51-achievements');
  const ach = await ev(() => ({ legends: document.querySelectorAll('.ach.legend').length, got: document.querySelectorAll('.ach.got').length, all: document.querySelectorAll('.ach').length, quad: !!Lull.app.store.state.achievements.quad, paid: Lull.app.store.state.stats.lines.achievements }));
  check('achievements: earned in play, listed in their own tab (legendary ones too), and paid', ach.quad && ach.got >= 1 && ach.all >= 40 && ach.legends >= 15 && ach.paid >= 15, JSON.stringify(ach));
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
      if (tab === 'play' || tab === 'classic') check(w + '×' + hgt + ' ' + tab + ' status bar shows everything', await ev((t) => { const b = document.getElementById(t === 'play' ? 'play-status' : 'classic-status'); return b.scrollWidth <= b.clientWidth + 1; }, tab));
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
