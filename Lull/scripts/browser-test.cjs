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
  await page.mouse.wheel(0, 120);
  check('wheel turns', (await ev(() => Lull.app.modes.play.game.piece.rot)) !== rot0);
  await page.mouse.click(pt[0], pt[1], { button: 'right' });
  check('right-click turns', (await ev(() => Lull.app.modes.play.game.piece.rot)) === (rot0 + 2) % 4);
  // Drag: down, then under a ledge; let go on the floor to set it.
  await ev(() => { const g = Lull.app.modes.play.game; g.board.cells.fill(0); for (let x = 0; x < 6; x++) g.board.set(x, 3, 8); g.replacePiece({ id: 'O' }); });
  pt = await cellPt(8, 15);
  await page.mouse.move(pt[0], pt[1]);
  await page.mouse.down();
  for (const [cx, cy] of [[8, 12], [8, 8], [8, 4], [8, 1], [6, 1], [4, 1], [2, 1], [1, 1]]) { const q = await cellPt(cx, cy); await page.mouse.move(q[0], q[1], { steps: 3 }); }
  const dragged = await ev(() => { const g = Lull.app.modes.play.game; return { x: g.piece.x, y: g.piece.y, pieces: g.s.pieces }; });
  await page.mouse.up();
  const set = await ev(() => { const b = Lull.app.modes.play.game.board; return { under: !!(b.get(1, 0) && b.get(1, 1)), pieces: Lull.app.modes.play.game.s.pieces }; });
  check('drag pulls the piece down and under a ledge', dragged.y === 0 && dragged.x <= 2, JSON.stringify(dragged));
  check('letting go on the stack sets it', set.under && set.pieces === dragged.pieces + 1, JSON.stringify(set));
  // Click the hold box.
  const holdPt = await ev(() => { const v = Lull.app.modes.play.view; const b = v.lay.hold; const r = v.canvas.getBoundingClientRect(); return [r.left + b.x + b.w / 2, r.top + b.y + b.h / 2]; });
  const cur = await ev(() => Lull.app.modes.play.game.piece.type.id);
  await page.mouse.click(holdPt[0], holdPt[1]);
  check('clicking HOLD holds the piece', (await ev(() => Lull.app.modes.play.game.hold && Lull.app.modes.play.game.hold.id)) === cur);
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
    for (const pathMoves of plan.targets) {
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
  check('puzzles solved with the keyboard', solved === tried, solved + '/' + tried + ' · wildcards seen: ' + Array.from(modsSolved).sort().join(' '));
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
  await ev(() => { const f = Lull.app.store.state.factory; f.credits = 5e6; });
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) await page.click('#fac-panel .row-card.highlight .btn.primary[data-cost]');
  const tier = await ev(() => Lull.app.store.state.factory.tier);
  check('product lines unlock', tier === 4, 'tier ' + tier);
  // Click a defective item on the belt.
  await ev(() => { const b = Lull.app.modes.factory.belt; b.items = []; for (let k = 0; k < 5; k++) { const it = Lull.Factory.makeItem(b.f, b.rng, k % 2 === 0); it.id = 900 + k; it.x = 0.12 + k * 0.18; it.batch = 1; it.stamp = 1; b.items.push(it); } });
  const target = await ev(() => { const v = Lull.app.modes.factory.view; const g = v.geom(); const it = v.belt.items.find((i) => i.defect); const r = v.itemRect(it, g); const c = v.canvas.getBoundingClientRect(); return { x: c.left + r.x + r.w / 2, y: c.top + r.y + r.h / 2, caught: Lull.app.store.state.factory.stats.caughtManual }; });
  await page.mouse.click(target.x, target.y);
  const caught = await ev(() => Lull.app.store.state.factory.stats.caughtManual);
  check('clicking a defect pulls it off the belt', caught === target.caught + 1, JSON.stringify({ target, caught, items: await ev(() => Lull.app.modes.factory.belt.items.map((i) => [i.id, i.defect, i.gone, i.x.toFixed(3)])) }));
  await page.waitForTimeout(700);
  await shot('30-factory');
  // Streak, golden and a rush order, by clicking.
  await ev(() => { const b = Lull.app.modes.factory.belt; b.items = []; b.rushIn = 0; b.stepRush(0.1); const it = Lull.Factory.makeItem(b.f, b.rng, false, b.rush.idx); it.id = 990; it.x = 0.3; it.batch = 1; it.stamp = 1; it.golden = false; b.items.push(it); const gd = Lull.Factory.makeItem(b.f, b.rng, false); gd.id = 991; gd.x = 0.75; gd.batch = 1; gd.stamp = 1; gd.golden = true; b.items.push(gd); });
  const clickItem = async (id) => { const p = await ev((i) => { const v = Lull.app.modes.factory.view; const g = v.geom(); const it = v.belt.items.find((x) => x.id === i); const r = v.itemRect(it, g); const c = v.canvas.getBoundingClientRect(); return { x: c.left + r.x + r.w / 2, y: c.top + r.y + r.h / 2 }; }, id); await page.mouse.click(p.x, p.y); };
  const linesG = await ev(() => Lull.app.store.state.lines);
  await clickItem(991);
  await clickItem(990);
  const fx = await ev(() => ({ lines: Lull.app.store.state.lines, streak: Lull.app.store.state.factory.streak, packed: Lull.app.modes.factory.belt.rush ? Lull.app.modes.factory.belt.rush.got : -1, golden: Lull.app.store.state.factory.stats.golden }));
  check('golden mino pays lines; rush order takes its shape', fx.golden === 1 && fx.lines > linesG && fx.packed === 1, JSON.stringify(fx));
  await page.waitForTimeout(400);
  await shot('30b-factory-rush');
  await ev(() => { const c = Lull.app.store.state.factory.contracts[0]; c.progress = c.target; c.done = true; Lull.app.modes.factory.renderPanel(); });
  const before = await ev(() => ({ lines: Lull.app.store.state.lines, done: Lull.app.store.state.factory.stats.contractsDone }));
  await page.click('#fac-panel .row-card.contract.highlight .btn.primary');
  const afterClaim = await ev(() => ({ lines: Lull.app.store.state.lines, done: Lull.app.store.state.factory.stats.contractsDone }));
  check('contract claimed', afterClaim.done === before.done + 1);
  await page.click('#fac-panel .fac-foot .btn');
  await page.waitForTimeout(100);
  await shot('31-spec-sheet');
  await page.keyboard.press('Escape');
  const offline = await ev(() => { const f = Lull.app.store.state.factory; const c0 = f.credits; f.lastTick = Date.now() - 12 * 3600e3; const r = Lull.Factory.catchUp(f, Date.now()); return { gained: f.credits - c0, capped: r.cappedSeconds, secs: r.seconds }; });
  check('offline progress capped at eight hours', offline.gained > 0 && offline.capped === 8 * 3600, JSON.stringify(offline));

  // ---- shop and settings ---------------------------------------------------------------------------------------------
  console.log('shop');
  await page.click('.tabs button[data-tab="shop"]');
  const tabsFit = await ev(() => { const t = document.getElementById('shop-tabs'); const r = t.getBoundingClientRect(); return Array.from(t.children).every((b) => b.getBoundingClientRect().right <= r.right + 0.5); });
  check('every shop section is visible', tabsFit);
  await page.click('#shop-tabs button:nth-child(3)'); // skins
  await page.waitForTimeout(100);
  await shot('40-skins');
  await page.click('#shop-grid .card:nth-child(2) .btn.primary');
  await page.click('.modal footer .btn.primary');
  const skin = await ev(() => Lull.app.store.state.equipped.skin);
  check('skin bought and equipped', skin === 'bevel', skin);
  for (const [n, name] of [[2, 'palettes'], [4, 'frames'], [5, 'backdrops'], [6, 'effects'], [7, 'ghosts']]) {
    await page.click('#shop-tabs button:nth-child(' + n + ')');
    await page.waitForTimeout(60);
    await shot('41-' + name);
  }
  await page.click('#shop-tabs button:nth-child(8)'); // sounds
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
  await page.click('.modal .seg button:has-text("Light")');
  await page.click('.modal .seg button:has-text("Solid")');
  await page.keyboard.press('Escape');
  await page.click('.tabs button[data-tab="play"]');
  await page.waitForTimeout(100);
  await shot('61-light');
  check('theme and background applied', await ev(() => document.documentElement.dataset.theme === 'light' && document.getElementById('app').className === 'bg-solid'));

  // ---- window sizes -------------------------------------------------------------------------------------------------
  console.log('sizes');
  for (const [w, hgt] of [[300, 440], [900, 560], [420, 900]]) {
    await page.setViewportSize({ width: w, height: hgt });
    for (const tab of ['play', 'puzzle', 'factory']) {
      await page.click('.tabs button[data-tab="' + tab + '"]');
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
