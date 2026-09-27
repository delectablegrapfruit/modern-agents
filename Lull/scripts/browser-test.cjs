#!/usr/bin/env node
// Drives the game page in headless Chromium the way a player would: keys, clicks, the shop, items, puzzles solved
// through the real controls (rotated views and inverted controls included), the factory line, saving and reloading.
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

const { share, overBar, sectionBars } = require('./pitch.cjs');
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
  // Scripted play sets pieces faster than any hand: the grace after a set is off here and tested on its own below.
  await ev(() => { for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0; });
  // Scripted play also turns at machine speed (the puzzle solver's three quick turns look like the long way round), so
  // control hints are off until their own section below, which turns them back on; the switch must keep every one away.
  await ev(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });

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
  check('the day log notes the quad (for the Triathlon)', await ev(() => Lull.app.store.state.history[Lull.dateKey()].quad === 1));
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
  // The chain: back-to-back quads (streak) plus the combo; only the streak multiplies, an eighth a link, ×2.5 at most.
  const chain = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, out = [];
    g.resetBoard();
    const quad = () => {
      for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
      g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
      const r = g.drop();
      return [r.banked, r.mult, r.chain];
    };
    out.push(quad(), quad());
    const status2 = document.getElementById('play-status').textContent;
    // Fourteen quads back to back: ×1.75 (streak 14), and the chain counts the combo too.
    g.s.b2b = 12; out.push(quad());
    const status14 = document.getElementById('play-status').textContent;
    g.s.b2b = 30; out.push(quad());
    return { out, status2, status14 };
  });
  check('two quads pay 5 and 5 (a streak of 2 is under ×1), chain 3', chain.out[0][0] === 5 && chain.out[1][0] === 5 && chain.out[1][1] === 1 && chain.out[1][2] === 3 && /Chain 3 · ×1/.test(chain.status2), JSON.stringify(chain));
  check('fourteen in a row pay ×1.75 (a quad: 9); the chain shows beside it', chain.out[2][0] === 9 && chain.out[2][1] === 1.75 && /Chain 16 · ×1\.75/.test(chain.status14), JSON.stringify(chain));
  check('the multiplier stops at ×2.5', chain.out[3][1] === 2.5 && chain.out[3][0] === 13, JSON.stringify(chain));
  await page.waitForTimeout(150);
  await shot('10a-chain');
  // Retiring a board shows its whole life, and logs it.
  await ev(() => { const m = Lull.app.modes.play; m.game.s.items = { bomb: 2, laser: 1 }; m.game.s.startedAt = Date.now() - 3 * 86400e3; });
  await page.click('#play-status .boards-btn');
  check('the Boards button opens the library', await page.isVisible('.modal-lib .lib-row.current'));
  await page.click('.modal-lib .lib-row.current [aria-label="Retire"]');
  const sum = await ev(() => { const c = document.querySelector('.modal-retire .board-sum'); return c ? c.textContent : ''; });
  check('retiring asks, showing the board\'s life', /Lifetime/.test(sum) && /3 used/.test(sum) && /Bomb ×2/.test(sum), sum.slice(0, 200));
  await shot('10b-retire');
  const logN = await ev(() => (Lull.app.store.state.stats.free.boardLog || []).length);
  await page.click('.modal-retire footer .btn.primary');
  check('a retired board is logged', (await ev(() => Lull.app.store.state.stats.free.boardLog.length)) === logN + 1 && (await ev(() => Lull.app.modes.play.game.s.pieces)) === 0);
  check('and kept in the library\'s retired records', await ev(() => Lull.app.store.state.boards.retired.length === 1 && Lull.app.store.state.boards.retired[0].sum.items.bomb === 2));
  await page.keyboard.press('Escape');
  check('Esc closes the library', !(await page.isVisible('.modal')));
  // ---- items ---------------------------------------------------------------------------------------------------------
  console.log('items');
  await ev(() => { const s = Lull.app.store; s.state.lines = 20000; Lull.app.refreshWallet(); for (const id of Lull.ITEM_ORDER) s.buyItem(id, 2); Lull.app.modes.play.renderItems(); });
  const invBefore = await ev(() => Object.assign({}, Lull.app.store.state.inventory));
  const itemPlan = await ev(() => Lull.ITEM_ORDER.map((id) => ({ id, group: Lull.ITEMS[id].group })));
  check('every item belongs to a type', itemPlan.every((x) => x.group) && itemPlan.length >= 16, itemPlan.length + ' items');
  // No number keys: 1–9 open nothing.
  for (const k of ['Digit1', 'Digit2', 'Digit3']) await page.keyboard.press(k);
  check('number keys do nothing to the item bar', !(await page.isVisible('.item-tray:not(.hidden)')) && !(await ev(() => document.querySelector('#itembar .k'))));
  const TOOLS = ['patch', 'phase', 'drill', 'bomb', 'laser', 'blackhole'];
  for (const { id, group } of itemPlan) {
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
    await page.click('#itembar .group-btn[data-group="' + group + '"]');
    check('  the ' + group + ' tray opens for ' + id, await page.isVisible('.item-tray:not(.hidden) [data-item="' + id + '"]'));
    if (id === 'trapdoor' || id === 'tornado') await shot('11-before-' + id);
    await page.click('.item-tray [data-item="' + id + '"]');
    await page.waitForTimeout(60);
    if (id === 'order') { await page.click('.picker button'); }
    if (id === 'pick') { await shot('11-pick'); await page.click('.picker [data-pick="1"]'); }
    if (id === 'blueprint') { await page.click('.modal footer .btn.primary'); }
    const inv = await ev((k) => Lull.app.store.state.inventory[k], id);
    check('item ' + id + ' used', inv === invBefore[id] - 1, 'have ' + inv);
    if (id === 'golden') check('  golden: gold for the next five clears', await ev(() => Lull.app.modes.play.game.s.gold === 5));
    if (id === 'double') check('  double or nothing waits for the next clear, and says so', await ev(() => Lull.app.modes.play.game.s.double === true && /Double/.test(document.getElementById('play-status').textContent)));
    if (id === 'net') check('  safety net: one', await ev(() => Lull.app.modes.play.game.s.net === 1));
    if (id === 'fit') { const f = await ev(() => { const p = Lull.app.modes.play.game.piece; return { id: p.type.id, tag: p.entry.tag }; }); check('  best fit: one of the seven, over its spot', f.tag === 'fit' && 'IJLOSTZ'.includes(f.id), JSON.stringify(f)); await shot('11-fit'); }
    if (TOOLS.includes(id)) {
      const sp = await ev(() => Lull.app.modes.play.game.piece && Lull.app.modes.play.game.piece.special);
      check('  ' + id + ' piece in play', sp === id);
      await shot('11-' + id);
      await page.keyboard.press('Space');
      await page.waitForTimeout(90);
      await shot('11-' + id + '-hit');
    }
    if (id === 'tornado' || id === 'trapdoor' || id === 'settle') { await page.waitForTimeout(150); await shot('11-' + id); }
    check('  the tray closes after use', !(await page.isVisible('.item-tray:not(.hidden)')));
    await page.waitForTimeout(40);
    await ev(() => { const m = Lull.app.modes.play; m.armed = null; m.game.s.double = false; m.game.s.net = 0; m.game.s.gold = 0; });
  }
  // Pressing an item again takes it back: the old piece returns, and so does the item.
  const toggle = await ev(async () => {
    const m = Lull.app.modes.play, g = m.game, inv = Lull.app.store.state.inventory;
    if (g.over) m.newBoard();
    g.board.cells.fill(0);
    g.replacePiece({ id: 'L' });
    const n0 = inv.bomb;
    Object.assign(g.s, { hand: true, hb2b: 2, hcombo: 1 });
    const used0 = (g.s.items || {}).bomb || 0;
    m.useItem('bomb');
    const armed = g.piece.special === 'bomb' && inv.bomb === n0 - 1 && !!document.querySelector('#itembar .group-btn.on');
    const broke = !g.s.hand && g.s.hb2b === -1 && g.s.hcombo === -1;
    m.useItem('bomb');
    const hand = { broke, back: g.s.hand && g.s.hb2b === 2 && g.s.hcombo === 1 && ((g.s.items || {}).bomb || 0) === used0 };
    // Luck items never touch the board: gold leaves play by hand alone.
    inv.golden = (inv.golden || 0) + 1;
    m.useItem('golden');
    hand.luck = g.s.hand && g.s.hb2b === 2 && g.s.gold > 0;
    m.useItem('golden');
    // Pick of Three taken back: the old piece and the queue as they were.
    const q0 = g.queue.map((e) => e.id).join();
    inv.pick = (inv.pick || 0) + 1;
    m.useItem('pick');
    document.querySelector('.picker [data-pick="2"]').click();
    const picked = !!m.armed && m.armed.id === 'pick' && g.piece.entry.tag === 'pick';
    m.useItem('pick');
    hand.pick = picked && g.piece.type.id === 'L' && g.queue.map((e) => e.id).join() === q0;
    return { armed, hand, back: g.piece.type.id === 'L' && !g.piece.special && inv.bomb === n0 };
  });
  check('an item in use shows as on', toggle.armed);
  check('pressing it again puts it back (Pick of Three puts the queue back too)', toggle.back && toggle.hand.pick, JSON.stringify(toggle));
  check('an item puts power-ups on the board (achievements); taken back, it never happened; Luck items leave it alone', toggle.hand.broke && toggle.hand.back && toggle.hand.luck, JSON.stringify(toggle.hand));
  await page.waitForTimeout(200);
  await shot('11-items');
  // An item you have none of shows its price in the tray, and is bought and used after one calm confirm.
  const noodleGroup = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store;
    if (g.over) m.newBoard();
    g.board.cells.fill(0);
    g.spawn({ id: 'T' });
    st.state.lines = Math.max(st.state.lines, 1000);
    st.state.inventory.noodle = 0;
    m.renderItems();
    return Lull.ITEMS.noodle.group;
  });
  await page.click('#itembar .group-btn[data-group="' + noodleGroup + '"]');
  const priced = await ev(() => { const b = document.querySelector('.item-tray [data-item="noodle"]'); return { n: b.querySelector('.n').textContent, empty: b.classList.contains('empty') }; });
  check('one you have none of shows its price', priced.empty && priced.n === '⦵' + '25', JSON.stringify(priced));
  await shot('11-tray-price');
  const wallet0 = await ev(() => Lull.app.store.state.lines);
  await page.click('.item-tray [data-item="noodle"]');
  check('  it asks once: Buy & use, with the price', /Buy & use · 25/.test(await page.textContent('.modal footer')));
  await page.click('.modal footer .btn.primary');
  await page.waitForTimeout(60);
  check('  bought for its price and put straight to use', (await ev(() => Lull.app.store.state.lines)) === wallet0 - 25 && (await ev(() => Lull.app.store.state.inventory.noodle)) === 0);
  const rod = () => ev(() => { const g = Lull.app.modes.play.game, p = g.piece; return { size: p.type.size, rot: p.rot, top: Math.max(...g.cellsOf().map((c) => c[1])), fits: g.fitsAt(p, p.rot, p.x, p.y) }; });
  const n0 = await rod();
  check('Noodle: bought and in play, a six-long rod in the top row', n0.size === 6 && n0.rot === 0 && n0.top === 19, JSON.stringify(n0));
  await page.keyboard.press('ArrowUp');
  const n1 = await rod();
  check('Noodle: Up stands it on end, nudged down off the ceiling', n1.rot === 1 && n1.top === 19 && n1.fits, JSON.stringify(n1));
  await page.waitForTimeout(80);
  await shot('11-noodle-up');
  await page.keyboard.press('KeyX');
  const n2 = await rod();
  await page.keyboard.press('KeyZ');
  const n3 = await rod();
  check('Noodle: X and Z turn it too', n2.rot === 2 && n3.rot === 1, JSON.stringify([n2, n3]));
  const nPt = await ev(() => { const m = Lull.app.modes.play, v = m.view, c = m.game.cellsOf()[0]; const [sx, sy] = v.toScreen(c[0], c[1]); const r = v.canvas.getBoundingClientRect(); return [r.left + sx + v.lay.s / 2, r.top + sy + v.lay.s / 2]; });
  await page.mouse.move(nPt[0], nPt[1]);
  await page.mouse.click(nPt[0], nPt[1], { button: 'right' });
  const n4 = await rod();
  check('Noodle: a right-click turns it', n4.rot === 2 && n4.fits, JSON.stringify(n4));
  await page.mouse.move(5, 300);

  // Item animations: each Tool and Board item starts its animation (physics bodies, particles, sliding blocks or a
  // drawn moment), runs on its own without holding up the next piece, and is gone again within a second and a half.
  const BOARD = ['settle', 'tornado', 'trapdoor', 'flip'];
  const fxRun = (id, motion) => ev(async ([id, motion, BOARD]) => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store.state, w = m.view.fx.world, fx = m.view.fx;
    const motion0 = st.settings.motion;
    st.settings.motion = motion;
    if (g.over) m.newBoard();
    fx.clear();
    g.board.cells.fill(0);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) if (x !== (y * 3) % 10 && (x + y) % 5) g.board.set(x, y, 1 + ((x * 7 + y * 3) % 7));
    g.replacePiece({ id: 'T' });
    st.inventory[id] = (st.inventory[id] || 0) + 1;
    m.apply(id);
    if (!BOARD.includes(id)) { g.piece.y = Math.min(g.piece.y, 15); m.action('drop'); }
    const next = !!g.piece && !g.piece.special;
    const t0 = performance.now();
    let peak = 0, props = 0;
    const out = await new Promise((res) => {
      const f = () => {
        peak = Math.max(peak, w.nb + w.np); props = Math.max(props, fx.props.length + fx.movers.length);
        const t = performance.now() - t0;
        if ((t > 50 && !w.active && !fx.props.length && !fx.movers.length) || t > 5000) res(t); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    st.settings.motion = motion0;
    return { peak, props, ms: Math.round(out), next };
  }, [id, motion, BOARD]);
  for (const id of ['drill', 'bomb', 'laser', 'blackhole', 'phase', 'patch', 'settle', 'tornado', 'trapdoor', 'flip']) {
    const r = await fxRun(id, 'full');
    check('  ' + id + ' animates, lets the next piece in, and ends', r.peak + r.props > 0 && r.ms <= 1500 && r.next, JSON.stringify(r));
  }
  // The next piece set while a Ghost's blocks are still falling: the fall ends at once.
  const quick = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store.state, w = m.view.fx.world;
    if (g.over) m.newBoard();
    m.view.fx.clear();
    g.board.cells.fill(0);
    for (let x = 0; x < 9; x++) g.board.set(x, 0, 3);
    g.replacePiece({ id: 'S' });
    st.inventory.phase = (st.inventory.phase || 0) + 1;
    m.apply('phase');
    m.action('drop');
    const falling = w.hiding;
    g.replacePiece({ id: 'O' });
    m.action('drop');
    return { falling, hiding: w.hiding };
  });
  check('  a piece set mid-fall ends it (no cell left hidden)', quick.falling > 0 && quick.hiding === 0, JSON.stringify(quick));
  // Gravity follows the board on screen: Upside Down pulls up, Sideways pulls left.
  const grav = await ev(() => {
    const v = Lull.app.modes.play.view, rot0 = v.view.rot, out = {};
    for (const rot of [0, 180, 90]) { v.view.rot = rot; v.lay = null; const w = v.phys(); out[rot] = [w.gx, w.gy]; }
    v.view.rot = rot0; v.lay = null; v.dirty = true;
    return out;
  });
  check('  effects fall toward the board\'s own floor in rotated views', JSON.stringify(grav) === JSON.stringify({ 0: [0, 1], 90: [-1, 0], 180: [0, -1] }), JSON.stringify(grav));
  const calm = await fxRun('bomb', 'reduced');
  check('  reduced motion: a bomb is a plain fade, no flying blocks', calm.peak === 0 && calm.ms <= 600, JSON.stringify(calm));
  await ev(() => { const m = Lull.app.modes.play; m.view.fx.clear(); m.game.board.cells.fill(0); m.view.dirty = true; });

  // ---- combos, and what Luck pays ------------------------------------------------------------------------------------
  console.log('combos');
  // Sets a scene (rows bottom first: . empty, digits colours, X grey), turns the piece in play into an item, drops it.
  const scene = (rows, piece, item, x, y) => ev(([rows, piece, item, x, y]) => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store;
    if (g.over) m.newBoard();
    m.view.fx.clear();
    document.getElementById('toasts').replaceChildren();
    g.board.cells.fill(0); g.s.gold = 0; g.s.boost = null; g.s.double = false; g.s.net = 0;
    rows.forEach((row, yy) => { for (let xx = 0; xx < 10; xx++) { const c = row[xx] || '.'; if (c !== '.') g.board.set(xx, yy, c === 'X' ? 8 : Number(c)); } });
    g.replacePiece({ id: piece });
    let r = null;
    const off = g.on('lock', (x2) => { r = r || x2; });
    const w0 = g.s.banked || 0;
    if (item) { st.state.inventory[item] = (st.state.inventory[item] || 0) + 1; m.apply(item); }
    g.piece.x = x; if (y != null) g.piece.y = y;
    m.action('drop');
    off();
    window.__r = r;
    return { lines: r ? r.lines : 0, gained: (g.s.banked || 0) - w0 };
  }, [rows, piece, item, x, y]);
  // A Patch dropped into a covered hole completes the row: Patch Job, paid at once, called out on the board, written
  // in the book — and, found for the first time ever, a power-up comes with it.
  await ev(() => { delete Lull.app.store.state.combos.patchjob; });
  const bag0 = await ev(() => Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0));
  const pj = await scene(['XXXX.XXXXX', 'XXXXXXXXX.'], 'O', 'patch', 4, 12);
  await page.waitForTimeout(250);
  await shot('16-patch-job');
  await page.waitForTimeout(1100);
  const pjAfter = await ev(() => { const m = Lull.app.modes.play, g = m.game; return { found: Object.keys(g.s.combos || {}), book: Object.keys(Lull.app.store.state.combos || {}), texts: m.view.fx.texts.map((t) => t.str), bag: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join() }; });
  check('a Patch into a covered hole that completes the row is Patch Job: paid, called out, in the book', pj.lines === 1 && pj.gained === 3 && pjAfter.found.includes('patchjob') && pjAfter.book.includes('patchjob') && pjAfter.texts.includes('Patch Job'), JSON.stringify({ pj, pjAfter }));
  check('  found for the first time: a power-up comes with it', pjAfter.bag === bag0 + 1 && pjAfter.toast.length > 0, JSON.stringify({ bag0, pjAfter }));
  const pj2 = await scene(['XXXX.XXXXX', 'XXXXXXXXX.'], 'O', 'patch', 4, 12);
  check('the second time on one board pays half', pj2.gained === 2 && (await ev(() => Lull.app.modes.play.game.s.combos.patchjob)) === 2, JSON.stringify(pj2));
  const rew = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store;
    st.state.inventory.rewind = (st.state.inventory.rewind || 0) + 1;
    const w0 = g.s.banked || 0;
    m.apply('rewind');
    return { back: (g.s.banked || 0) - w0, times: g.s.combos.patchjob, hole: !g.board.get(4, 0) };
  });
  check('rewind takes the patch back and what it paid', rew.back === -2 && rew.times === 1 && rew.hole, JSON.stringify(rew));
  // Gold: it waits on the board and gilds the piece in play, spent one clear at a time.
  const gold = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store;
    g.board.cells.fill(0); g.s.boost = null; g.s.b2b = -1; g.s.gold = 0;
    st.state.inventory.golden = (st.state.inventory.golden || 0) + 1;
    m.apply('golden');
    for (let x = 1; x < 10; x++) g.board.set(x, 0, 8);
    g.replacePiece({ id: 'O' }); m.action('drop'); // clears nothing: the gold waits
    const waited = g.s.gold;
    g.board.cells.fill(0);
    for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
    g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
    let r = null; g.on('lock', (x) => { r = r || x; });
    m.action('drop');
    return { waited, left: g.s.gold, banked: r.banked, status: document.getElementById('play-status').textContent };
  });
  check('gold waits through a piece that clears nothing, then a quad pays ×3 (15) and leaves four', gold.waited === 5 && gold.left === 4 && gold.banked === 15 && /Gold 4/.test(gold.status), JSON.stringify(gold));
  await page.waitForTimeout(100);
  await shot('16c-gold');
  // Double or Nothing: a single loses (pays nothing); a quad wins (pays double) and is All In.
  const dor = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store, out = {};
    g.s.gold = 0; g.s.boost = null; g.s.b2b = -1;
    const play = (rows, id, vertical) => {
      g.board.cells.fill(0);
      for (let y = 0; y < rows; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
      g.replacePiece({ id }); if (vertical) g.rotate(1); while (g.move(-1));
      let r = null; const off = g.on('lock', (x) => { r = r || x; }); m.action('drop'); off();
      return r;
    };
    st.state.inventory.double = (st.state.inventory.double || 0) + 2;
    m.apply('double');
    const lost = play(1, 'M1');
    out.lost = [lost.double, lost.banked, g.s.double];
    m.apply('double');
    const won = play(4, 'I', true);
    out.won = [won.double, won.banked, Object.keys(g.s.combos).includes('allin')];
    return out;
  });
  check('Double or Nothing: a single pays nothing; a quad pays double (10), and is All In', dor.lost[0] === 'lost' && dor.lost[1] === 0 && dor.lost[2] === false && dor.won[0] === 'won' && dor.won[1] === 10 && dor.won[2], JSON.stringify(dor));
  await page.waitForTimeout(100);
  await shot('16d-double');
  // Safety Net: a single after a quad streak keeps it going.
  const net = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store;
    g.board.cells.fill(0); g.s.b2b = 6;
    st.state.inventory.net = (st.state.inventory.net || 0) + 1;
    m.apply('net');
    const shown = /Net/.test(document.getElementById('play-status').textContent);
    for (let x = 1; x < 10; x++) g.board.set(x, 0, 8);
    g.replacePiece({ id: 'M1' }); while (g.move(-1));
    let r = null; const off = g.on('lock', (x) => { r = r || x; }); m.action('drop'); off();
    return { shown, saved: r.netSaved, b2b: g.s.b2b, net: g.s.net, caught: Object.keys(g.s.combos).includes('caught') };
  });
  check('Safety Net: shown while waiting; a single keeps a streak of seven going (Caught)', net.shown && net.saved === 7 && net.b2b === 6 && net.net === 0 && net.caught, JSON.stringify(net));
  await ev(() => { const m = Lull.app.modes.play; m.view.fx.clear(); m.game.board.cells.fill(0); m.game.s.b2b = -1; m.game.replacePiece({ id: 'T' }); m.view.dirty = true; });

  // ---- the daily gift ----------------------------------------------------------------------------------------------
  console.log('daily gift');
  await page.waitForTimeout(1500); // power-ups the combos above brought land first
  await ev(() => { const st = Lull.app.store.state; st.gift = { at: null, n: 0, log: [] }; Lull.app.modes.play.renderStatus(); });
  const inv0 = await ev(() => Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0));
  check('the Relaxed tab shows the gift, waiting', await page.isVisible('#gift-btn.ready'));
  await page.click('#gift-btn');
  await page.waitForTimeout(450);
  await shot('18-gift-opening');
  await page.waitForTimeout(900);
  await shot('18-gift');
  const gift = await ev(() => ({ cards: [...document.querySelectorAll('.modal-gift .gift-card b')].map((b) => b.textContent), inv: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), at: Lull.app.store.state.gift.at, now: Date.now(), ready: !!document.querySelector('#gift-btn.ready'), tip: document.getElementById('gift-btn').dataset.tip }));
  check('it turns over three power-ups, already in the bag, the claim booked', gift.cards.length === 3 && new Set(gift.cards).size === 3 && gift.inv === inv0 + 3 && Math.abs(gift.now - gift.at) < 5000, JSON.stringify(gift));
  check('once opened, the button says how long until the next one (24 hours on)', !gift.ready && /^Next gift in (23h 59m|24h 0m|1d 0h)$/.test(gift.tip), gift.tip);
  await page.click('.modal-gift footer .btn.primary');
  await page.click('#gift-btn');
  const twice = await ev(() => ({ modal: !!document.querySelector('.modal-gift'), inv: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join() }));
  check('not again within 24 hours: a quiet note of when, nothing more', !twice.modal && twice.inv === inv0 + 3 && /Next gift in/.test(twice.toast), JSON.stringify(twice));
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(400);
  await ev(() => { for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0; });
  const reloaded = await ev(() => ({ ready: !!document.querySelector('#gift-btn.ready'), inv: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), again: Lull.app.store.openGift(Date.now()) }));
  check('nor by reopening Lull', !reloaded.ready && reloaded.inv === inv0 + 3 && reloaded.again === null, JSON.stringify(reloaded));
  await page.click('#wallet');
  await page.click('.tabs button[data-tab="play"]');
  check('nor by switching tabs', !(await page.isVisible('#gift-btn.ready')));
  const later = await ev(() => { const st = Lull.app.store.state; st.gift.at -= 24 * 3600e3; Lull.app.modes.play.renderGift(); return !!document.querySelector('#gift-btn.ready'); });
  check('24 hours after the claim, it is waiting again', later);
  await ev(() => { const st = Lull.app.store.state; st.gift.at = Date.now(); Lull.app.modes.play.renderGift(); });

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
  // The stickiness is small now: a fifth of a cell past the edge already moves, and a click well after a slip
  // (past the click grace) drops where the pointer is.
  await ev(() => { const g = Lull.app.modes.play.game; g.board.cells.fill(0); g.replacePiece({ id: 'O' }); g.piece.y = 17; });
  await page.mouse.move(c3[0] + 4, c3[1]); await page.mouse.move(c3[0], c3[1]);
  await page.waitForTimeout(250);
  const col3b = await pieceCol();
  await page.mouse.move(c3[0] + s0 * 0.7, c3[1]);
  check('sticky aim is slight: a fifth of a cell past the edge moves', (await pieceCol()) === col3b + 1, JSON.stringify([col3b, await pieceCol()]));
  await page.waitForTimeout(Math.max(250, (await ev(() => Lull.Modes.CLICK_GRACE_MS)) + 60));
  await page.mouse.down(); await page.mouse.up();
  const landed2 = await ev(() => { const b = Lull.app.modes.play.game.board; const cols = []; for (let x = 0; x < 10; x++) if (b.get(x, 0)) cols.push(x); return cols; });
  check('a click after the grace drops where the pointer went', landed2.includes(col3b + 1) && !landed2.includes(col3b - 1), JSON.stringify([col3b, landed2]));
  // Grace after a set: a double click, a double Space or a second ↓ on the stack never sets the next piece at once;
  // moving still works in the window, and after it everything drops again.
  const grace = await ev(async () => {
    const m = Lull.app.modes.play, g = m.game, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    m.setGrace = Lull.Modes.SET_GRACE_MS;
    await wait(Lull.Modes.SET_GRACE_MS + 40); // clear of the click just before
    g.board.cells.fill(0); g.replacePiece({ id: 'O' });
    const p0 = g.s.pieces;
    m.action('drop');
    const afterFirst = g.s.pieces;
    const second = m.action('drop');
    const x0 = g.piece.x, moved = m.action('moveL') && g.piece.x !== x0;
    // ↓ on the stack within the window: the fresh press that would set it is ignored.
    while (g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y - 1)) g.piece.y--;
    const down = m.action('down');
    const within = g.s.pieces;
    await wait(Lull.Modes.SET_GRACE_MS + 40);
    const later = m.action('down') && g.s.pieces === within + 1;
    const again = m.action('drop') === false && g.s.pieces === within + 1; // a set restarts the window
    await wait(Lull.Modes.SET_GRACE_MS + 40);
    const last = !!m.action('drop') && g.s.pieces === within + 2;
    m.setGrace = 0;
    return { first: afterFirst === p0 + 1, second, moved, down, within: within === p0 + 1, later, again, last };
  });
  check('grace after a set: a second drop, and ↓ on the stack, are ignored for a moment; moves still work', grace.first && !grace.second && grace.moved && !grace.down && grace.within, JSON.stringify(grace));
  check('after the grace ↓ sets and Space drops again', grace.later && grace.again && grace.last, JSON.stringify(grace));
  // A Giant with no room above the stack is refused gently: no Board full card, the item is kept.
  const swap = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, inv = Lull.app.store.state.inventory, had = inv.giant || 0;
    inv.giant = had + 1;
    g.board.cells.fill(0); g.replacePiece({ id: 'O' }); while (g.move(-1));
    for (let y = 0; y < 20; y++) for (let x = 3; x < 10; x++) g.board.set(x, y, 8);
    m.useItem('giant');
    const out = { card: m.cardOpen, over: g.over, kept: inv.giant === had + 1, id: g.piece.type.id, toast: document.body.textContent.includes('No room') };
    inv.giant = had; g.board.cells.fill(0); m.view.dirty = true;
    return out;
  });
  check('a swap with no room is refused gently: no Board full, the item kept', !swap.card && !swap.over && swap.kept && swap.id === 'O' && swap.toast, JSON.stringify(swap));
  const dbl = await ev(async () => { const m = Lull.app.modes.play; m.setGrace = Lull.Modes.SET_GRACE_MS; await new Promise((r) => setTimeout(r, Lull.Modes.SET_GRACE_MS + 40)); m.game.board.cells.fill(0); m.game.replacePiece({ id: 'O' }); return m.game.s.pieces; });
  await page.mouse.dblclick(c3[0], c3[1]);
  check('a double click sets one piece, not two', (await ev(() => { const m = Lull.app.modes.play; m.setGrace = 0; return m.game.s.pieces; })) === dbl + 1);
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
  check('hovering an item type names it', await page.isVisible('.tip:not(.hidden)') && /Shapers/.test(await page.textContent('.tip')));
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
  await page.click('.tabs button[data-tab="classic"]');
  check('Classic is its own tab, the last of the places to play, and lit while open', await ev(() => Lull.app.tab === 'classic' && document.querySelector('.tabs button[aria-selected="true"]').dataset.tab === 'classic'
    && Array.from(document.querySelectorAll('#tabs button')).pop().dataset.tab === 'classic' && !document.querySelector('.corner-btn')));
  await page.waitForTimeout(150);
  check('classic waits for a start', await ev(() => !Lull.app.modes.classic.started && Lull.app.modes.classic.cardOpen));
  await page.keyboard.press('Space');
  const y0 = await ev(() => Lull.app.modes.classic.game.piece.y);
  await page.waitForTimeout(2200);
  const fell = await ev(() => ({ y: Lull.app.modes.classic.game.piece.y, pieces: Lull.app.modes.classic.game.s.pieces, music: Lull.Music.playing }));
  check('pieces fall on their own', fell.y < y0 || fell.pieces > 0, JSON.stringify([y0, fell]));
  check('music plays during a game', fell.music);
  check('the music keeps its voices bounded', await ev(() => Lull.Music.live > 0 && Lull.Music.live < 400), String(await ev(() => Lull.Music.live)));
  // While the music plays, sound effects are in the key of the section sounding, and played at once (voices caught as
  // they are played for real): here in the theme, then with the music moved on to the bridge (A melodic minor).
  const inKey = () => ev(() => {
    const S = Lull.Sound, K = Lull.Key, M = Lull.Music, keep = S.voice, got = [], out = [];
    S.voice = function (v, when, pack) { got.push({ v, when }); return keep.call(this, v, when, pack); };
    try {
      for (const [n, a] of [['quad'], ['clear', 2], ['tspin'], ['perfect'], ['combo', 4], ['hold'], ['solve'], ['golden']]) {
        S.lastAt[n] = 0; got.length = 0;
        const now = S.ctx.currentTime, b = M.barAt(now);
        S.play(n, a, 'soft');
        for (const { v, when } of got) {
          if (!K.tonal(v)) { out.push({ n, when }); continue; }
          const m = Math.round(69 + 12 * Math.log2(v.f / 440)), pc = ((m % 12) + 12) % 12;
          out.push({ n, section: b.bar.section, key: b.bar.key, pc, ok: K.scale(b.bar.key)[pc] && K.at(now) === b.bar.key, when });
        }
      }
    } finally { S.voice = keep; }
    return out;
  });
  const keyed = await inKey();
  await ev(() => { const M = Lull.Music; M.stop(); M.pos = { bar: Lull.SONG.bars.findIndex((b) => b.section === 'bridge') + 1 }; M.start(); });
  await page.waitForTimeout(400);
  const keyedB = await inKey();
  const pitchedA = keyed.filter((x) => x.pc != null), pitchedB = keyedB.filter((x) => x.pc != null);
  check('while the music plays, every pitched voice of a sound effect is in the key of the section sounding', pitchedA.length > 20 && pitchedA.every((x) => x.ok && x.key === 'A minor'),
    JSON.stringify(pitchedA.filter((x) => !x.ok).slice(0, 4)) + ' of ' + pitchedA.length + ' in ' + [...new Set(pitchedA.map((x) => x.section))]);
  check('in the bridge, A melodic minor (G# and F#, no F)', pitchedB.length > 20 && pitchedB.every((x) => x.ok && x.key === 'A melodic minor' && x.pc !== 5) && pitchedB.some((x) => x.pc === 8 || x.pc === 6),
    JSON.stringify(pitchedB.filter((x) => !x.ok).slice(0, 4)) + ' of ' + pitchedB.length + ' in ' + [...new Set(pitchedB.map((x) => x.section))]);
  check('no sound effect waits for the beat: every voice is played at once', keyed.concat(keyedB).every((x) => x.when === 0), JSON.stringify([...new Set(keyed.concat(keyedB).map((x) => x.n + ' ' + x.when))]));
  await ev(() => { Lull.app.modes.classic.setGrace = Lull.Modes.SET_GRACE_MS; });
  const cp0 = await ev(() => Lull.app.modes.classic.game.s.pieces);
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  const cp1 = await ev(() => Lull.app.modes.classic.game.s.pieces), cy1 = await ev(() => Lull.app.modes.classic.game.piece.y);
  await page.waitForTimeout(1200);
  check('Classic: a double Space hard drops one piece; gravity carries on', cp1 === cp0 + 1 && (await ev((y) => { const g = Lull.app.modes.classic.game; return g.s.pieces > 0 && (!g.piece || g.piece.y < y || g.s.pieces > 1); }, cy1)), JSON.stringify([cp0, cp1]));
  await ev(() => { Lull.app.modes.classic.setGrace = 0; });
  check('hard drop scores', await ev(() => Lull.app.modes.classic.score > 0));
  const clock = await ev(() => Lull.app.modes.classic.ms);
  check('Classic keeps its own clock (for the sprints)', clock > 1500 && clock < 6000, String(clock));
  // Restarting while the music plays starts the suite again from the top (it used to go silent, throwing every tick).
  const games0 = await ev(() => Lull.app.store.state.stats.classic.games);
  for (let i = 0; i < 5; i++) await page.keyboard.press('KeyR');
  await page.waitForTimeout(900);
  const rw = await ev(() => ({ playing: Lull.Music.playing, pos: Lull.Music.pos && { bar: Lull.Music.pos.bar, ahead: +(Lull.Music.pos.at - Lull.Sound.ctx.currentTime).toFixed(2) }, games: Lull.app.store.state.stats.classic.games }));
  check('R during the music starts it again from the top, still scheduling, no errors', rw.playing && rw.pos && rw.pos.ahead > 0 && rw.pos.bar <= 2 && errors.length === 0, JSON.stringify(rw) + ' ' + errors.slice(0, 1).join(''));
  check('quick restarts are not Classic games played (a minute or ten lines is)', rw.games === games0, JSON.stringify([games0, rw.games]));
  // A Volume of 0 stays 0 when the music starts.
  const vol0 = await ev(async () => {
    const st = Lull.app.settings, keep = st.volume;
    st.volume = 0; Lull.app.applySettings(); Lull.Music.stop();
    await new Promise((r) => setTimeout(r, 250));
    const out = { playing: Lull.Music.playing, master: Lull.Sound.master.gain.value };
    st.volume = keep; Lull.app.applySettings();
    return out;
  });
  check('with Volume at 0 the music starts silent', vol0.playing && vol0.master === 0, JSON.stringify(vol0));
  await ev(() => { const m = Lull.app.modes.classic; m.lines = 9; const g = m.game; for (let x = 1; x < 10; x++) g.board.set(x, 0, 8); g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1)); });
  await page.keyboard.press('Space');
  check('ten lines: level 2', await ev(() => Lull.app.modes.classic.level === 2));
  // Back-to-back tetrises multiply the lines Classic banks (a half a link, ×10 at most), never its score.
  const bank = await ev(() => {
    const m = Lull.app.modes.classic, g = m.game;
    g.s.b2b = 5; // six before: this makes seven, ×3.5
    for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
    g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
    const s0 = m.score, lvl = m.level;
    let r = null; g.on('lock', (x) => { r = r || x; });
    g.drop();
    const out = { banked: r.banked, mult: m.mult, points: m.score - s0, want: r.score * lvl + r.dropDist * 2, status: document.getElementById('classic-status').textContent };
    // Back as it was, so the checks further on see the game they expect.
    m.score = s0; m.lines -= 4; m.level = lvl; g.s.b2b = -1; m.mult = 1; m.renderStatus();
    return out;
  });
  check('Classic: seven tetrises in a row bank ×3.5 (14 lines), the score untouched', bank.banked === 14 && bank.mult === 3.5 && bank.points === bank.want && /Bank ×3\.5/.test(bank.status), JSON.stringify(bank));
  check('and ten lines make it a game played', await ev((g0) => Lull.app.store.state.stats.classic.games === g0 + 1, games0));
  // Pausing mid-bar comes back to that bar, not the one after it.
  await page.waitForTimeout(700);
  const resumeBar = await ev(() => {
    const M = Lull.Music, now = Lull.Sound.ctx.currentTime, sounding = M.pos.sched.filter((b) => b.at <= now).pop();
    Lull.app.modes.classic.togglePause(true); M.stop();
    const out = { sounding: sounding && sounding.bar, next: M.pos.bar };
    Lull.app.modes.classic.togglePause(false);
    return out;
  });
  check('a pause resumes the bar that was playing', resumeBar.sounding != null && resumeBar.next === resumeBar.sounding, JSON.stringify(resumeBar));
  await page.waitForTimeout(150);
  // The pointer leaving the window pauses a running game (a browser's mouseleave, or the panel's pointer message);
  // coming back shows the paused card, and P carries on. Settings ▸ Controls turns it off.
  {
    const st = () => ev(() => { const m = Lull.app.modes.classic; return { paused: m.paused, card: !!(m.cardOpen), running: m.running() }; });
    const leave = () => ev(() => document.documentElement.dispatchEvent(new MouseEvent('mouseleave')));
    const before = await st();
    await leave();
    const left = await st();
    await ev(() => document.documentElement.dispatchEvent(new MouseEvent('mouseenter')));
    const back = await st();
    await page.keyboard.press('KeyP');
    const resumed = await st();
    await ev(() => Lull.fromNative({ type: 'pointer', inside: false }));
    const nativeLeft = await st();
    await ev(() => Lull.fromNative({ type: 'pointer', inside: true }));
    await page.keyboard.press('KeyP');
    await ev(() => { Lull.app.settings.pauseAway = false; });
    await leave();
    await ev(() => Lull.fromNative({ type: 'pointer', inside: false }));
    const off = await st();
    await ev(() => { Lull.app.settings.pauseAway = true; Lull.fromNative({ type: 'pointer', inside: true }); document.documentElement.dispatchEvent(new MouseEvent('mouseenter')); });
    const res = { before, left, back, resumed, nativeLeft, off };
    check('Classic pauses when the pointer leaves, stays paused on return, and P resumes', before.running && left.paused && left.card && back.paused && back.card && resumed.running && nativeLeft.paused, JSON.stringify(res));
    check('with Pause when the pointer leaves off, it plays on', off.running, JSON.stringify(off));
  }
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(100);
  const ann = await ev(() => { const A = Lull.Announcer; return [A.phrase({ lines: 1 }), A.phrase({ lines: 4, b2b: true }), A.phrase({ tspin: true, lines: 2 }), A.phrase({ tspin: true, lines: 3 }), A.phrase({ mini: true, lines: 0 }), A.phrase({ lines: 0 }), A.phrase({ lines: 2, perfect: true }, 3)]; });
  check('the announcer knows its lines', JSON.stringify(ann) === JSON.stringify([['single'], ['b2b', 'tetris'], ['tspin_double'], ['tspin', 'triple'], ['tspin'], null, ['double', 'perfect', 'levelup']]), JSON.stringify(ann));
  const clips = await ev(async () => { const out = {}; for (const k of Object.keys(Lull.VOICE_CLIPS)) { const b = await Lull.Announcer.decode(k); out[k] = b ? +b.duration.toFixed(2) : 0; } return out; });
  check('every announcer clip decodes (0.3–2 s)', Object.values(clips).length === 11 && ['single', 'double', 'triple', 'tetris', 'tspin', 'tspin_single', 'tspin_double', 'b2b', 'perfect', 'levelup', 'gameover'].every((k) => clips[k] > 0) && Object.values(clips).every((d) => d > 0.3 && d < 2), JSON.stringify(clips));
  // Her level, rendered through her bus beside the sound effects: every clip about as loud as the next, and clearly under
  // the effects (loudest 400 ms, both channels).
  const voiceLevels = await ev(async () => {
    const S = Lull.Sound, A = Lull.Announcer, keep = A.volume;
    const mom = (buf) => {
      const d = buf.getChannelData(0), e = buf.getChannelData(1), w = Math.floor(buf.sampleRate * 0.4), h = Math.floor(buf.sampleRate * 0.05);
      let m = 0;
      for (let s = 0; s + w <= d.length; s += h) { let a = 0; for (let i = s; i < s + w; i++) a += (d[i] * d[i] + e[i] * e[i]) / 2; m = Math.max(m, a / w); }
      return +(10 * Math.log10(m)).toFixed(1);
    };
    const sfx = {}, voice = {};
    for (const n of ['clear', 'quad', 'tspin', 'perfect']) sfx[n] = mom(await S.offline(2.5, () => { const { pack, list } = S.voices(n, 2, 'soft'); for (const v of list) S.voice(v, 0.02, pack); }));
    A.setVolume(Lull.app.store.state.settings.announcerVolume);
    try {
      for (const k of Object.keys(Lull.VOICE_CLIPS)) {
        const buf = await A.decode(k);
        A.input = null;
        voice[k] = mom(await S.offline(2.5, () => { const src = S.ctx.createBufferSource(); src.buffer = buf; src.connect(A.bus()); src.start(0.02); }));
      }
    } finally { A.input = null; A.setVolume(keep); }
    return { sfx, voice };
  });
  {
    const v = Object.values(voiceLevels.voice), fx = Object.values(voiceLevels.sfx), mean = fx.reduce((a, x) => a + x, 0) / fx.length;
    check('the announcer\'s clips are all about as loud (within 2.5 dB)', v.length === 11 && Math.max(...v) - Math.min(...v) <= 2.5, JSON.stringify(voiceLevels.voice));
    check('the announcer sits clearly under the sound effects', Math.max(...v) < mean - 5 && Math.max(...v) < Math.min(...fx) - 3, JSON.stringify(voiceLevels));
  }
  check('the remix is a long suite', await ev(() => Lull.SONG.bars.length >= 48 && Lull.SONG.loopFrom === 4));
    check('P pauses (and the music stops)', await ev(() => Lull.app.modes.classic.paused && !Lull.Music.playing));
  await shot('14-classic-paused');
  const pausedMs = await ev(() => Lull.app.modes.classic.ms);
  await page.waitForTimeout(300);
  check('its clock stops while paused', (await ev(() => Lull.app.modes.classic.ms)) === pausedMs);
  await page.keyboard.press('KeyP');
  await ev(() => { const g = Lull.app.modes.classic.game; for (let y = 0; y < 19; y++) for (let x = 0; x < 10; x++) if (x !== y % 10) g.board.set(x, y, 8); });
  await page.waitForTimeout(2500);
  check('topping out ends the game', await ev(() => Lull.app.modes.classic.over && Lull.app.store.state.stats.classic.best > 0));
  await shot('15-classic-over');
  await page.click('.tabs button[data-tab="play"]');
  check('leaving Classic stops the music', await ev(() => !Lull.Music.playing));
  // Rendered offline (as scripts/audio-render.cjs does, at length): no clipping, nothing silent, movement barely there,
  // and the music a steady bed with no holes.
  const audio = await ev(async () => {
    const S = Lull.Sound, stat = (buf, from) => {
      const d = buf.getChannelData(0), e = buf.getChannelData(1), w = Math.floor(buf.sampleRate * 0.1);
      let peak = 0, quiet = 1, bad = false;
      for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i]), Math.abs(e[i])); if (!isFinite(d[i])) bad = true; }
      for (let s = Math.floor(buf.sampleRate * (from || 0)); s + w <= d.length; s += w) { let a = 0; for (let i = s; i < s + w; i++) a += d[i] * d[i]; quiet = Math.min(quiet, Math.sqrt(a / w)); }
      return { peak: +(20 * Math.log10(peak)).toFixed(1), quiet: +(20 * Math.log10(quiet)).toFixed(1), bad };
    };
    const out = {};
    for (const n of ['move', 'rotate', 'lower', 'lock', 'clear', 'quad', 'tspin', 'perfect', 'boom', 'solve']) {
      out[n] = stat(await S.offline(2, () => { const { pack, list } = S.voices(n, 2, 'soft'); for (const v of list) S.voice(v, 0.02, pack); }));
    }
    out.music = stat(await S.offline(8, (ctx) => Lull.Music.render(ctx, 8, 4)), 1.5);
    return out;
  });
  check('the default sounds render without clipping or silence', Object.entries(audio).every(([n, a]) => !a.bad && a.peak < -3 && a.peak > -60), JSON.stringify(audio));
  check('movement sounds stay faint', ['move', 'rotate', 'lower'].every((n) => audio[n].peak < -36), JSON.stringify([audio.move, audio.rotate, audio.lower]));
  check('the music has no holes', audio.music.quiet > -50, JSON.stringify(audio.music));
  // Heard, not just planned: sound effects rendered over the first bar of every section, the notes found in them by
  // FFT, and how much of their power is on the section's key — put in it, and as the pack made them
  // (scripts/audio-render.cjs --harmony does every pack and sound at length).
  {
    const bars = await sectionBars(page), rows = [];
    for (const [pack, sections, events] of [['soft', Object.keys(bars), [['clear', 2], ['quad'], ['tspin'], ['perfect'], ['solve']]], ['chip', ['bridge', 'theme'], [['quad'], ['perfect']]], ['marimba', ['float', 'interlude'], [['clear', 2], ['tspin']]]]) {
      for (const section of sections) {
        const res = await overBar(page, pack, bars[section][0], events);
        for (let i = 0; i < res.length; i += 2) {
          if (res[i].glide || !res[i].found.length) continue;
          rows.push({ pack, section, key: res[i].key, sound: res[i].name, tuned: share(res[i].found, res[i].allowed).share, raw: share(res[i + 1].found, res[i + 1].allowed).share });
        }
      }
    }
    const mean = (k, f) => { const r = rows.filter(f || (() => true)); return r.reduce((a, x) => a + x[k], 0) / r.length; };
    const worst = rows.reduce((w, r) => (r.tuned < w.tuned ? r : w), rows[0]), mel = (r) => r.key === 'A melodic minor';
    check('rendered in every section, the sound effects\' notes are the notes of its key', rows.length >= 40 && rows.every((r) => r.key === bars[r.section][1]) && mean('tuned') > 0.95 && worst.tuned > 0.8 && mean('tuned', mel) > mean('raw', mel) + 0.1,
      'in key ' + (mean('tuned') * 100).toFixed(1) + '%, as made ' + (mean('raw') * 100).toFixed(1) + '% (bridge ' + (mean('tuned', mel) * 100).toFixed(1) + '% / ' + (mean('raw', mel) * 100).toFixed(1) + '%), worst ' + JSON.stringify(worst) + ', ' + rows.length + ' renders');
  }

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

  // One turn button, on every view: the turn arrow and right-click give the board turn the generator builds with
  // (counter-clockwise under Inverted Controls), a turn looks that way on screen too (no view is a mirror), and
  // puzzles solve with the arrow keys alone or the mouse alone.
  const findSeed = (mods) => ev((want) => {
    const all = ['invert', 'flip', 'side', 'hold', 'rigid'];
    for (let n = 1; n < 3000; n++) for (const d of ['M', 'H', 'E']) {
      const s = Lull.Puzzles.numberedSeed(d, n), p = Lull.Puzzles.generate(s);
      if (all.every((m) => p.mods.includes(m) === want.includes(m)) && p.targets.some((t) => t.path.some((mv) => /^(CW|CCW)$/.test(mv)))) return s;
    }
    return null;
  }, mods);
  // Which arrow does what on the loaded puzzle (through the view turn and Inverted Controls).
  const arrowPlan = () => ev(() => {
    const m = Lull.app.modes.puzzle, INV = { moveL: 'moveR', moveR: 'moveL', rotate: 'rotateInv' }, map = {};
    for (const a of ['left', 'right', 'up', 'down']) { let l = m.mapArrow(a); if (m.inverted) l = INV[l] || l; map[l] = a; }
    return { map, targets: m.puzzle.targets.map((t) => t.path), primary: Lull.Puzzles.primaryTurn(m.puzzle.mods) };
  });
  const combos = [['invert'], ['flip'], ['side'], ['invert', 'flip'], ['invert', 'side']];
  for (const mods of combos) {
    const seed = await findSeed(mods);
    await ev((s) => Lull.app.modes.puzzle.load(s, {}), seed);
    const plan = await arrowPlan();
    const turnArrow = plan.map.rotate || plan.map.rotateInv;
    // One press of the turn arrow on a free-floating T: which way the board turns it, and which way it looks.
    const spinOf = async (press) => {
      const cells = () => ev(() => { const m = Lull.app.modes.puzzle; return { rot: m.game.piece.rot, cells: m.game.cellsOf().map(([x, y]) => m.view.toScreen(x, y)) }; });
      const a = await cells(); await press(); const b = await cells();
      // The T's nub, from its middle cell, on screen (y up): the cross product says which way it swung.
      const nub = (cs) => {
        const d = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1]);
        const unit = Math.min(...cs.flatMap((a) => cs.filter((c) => c !== a).map((c) => d(a, c))));
        const mid = cs.find((c) => cs.filter((o) => o !== c && d(o, c) < unit * 1.5).length === 3);
        const cx = cs.reduce((t, c) => t + c[0], 0) / 4, cy = cs.reduce((t, c) => t + c[1], 0) / 4;
        return [cx - mid[0], mid[1] - cy];
      };
      const u = nub(a.cells), w = nub(b.cells), cross = u[0] * w[1] - u[1] * w[0];
      return { board: (b.rot - a.rot + 4) % 4 === 1 ? 'CW' : (b.rot - a.rot + 4) % 4 === 3 ? 'CCW' : 'other', screen: cross < 0 ? 'CW' : cross > 0 ? 'CCW' : 'none' };
    };
    const floatT = () => ev(() => { const m = Lull.app.modes.puzzle, g = m.game; m.view.resize(); m.view.layout(); g.board.cells.fill(0); g.replacePiece({ id: 'T' }); g.piece.y = Math.max(2, g.piece.y - 2); });
    await floatT();
    const byArrow = await spinOf(() => page.keyboard.press(KEY_FOR[turnArrow]));
    const mid = await ev(() => { const m = Lull.app.modes.puzzle, r = m.canvas.getBoundingClientRect(), b = m.view.lay.board; Lull.app.focusedAt = -1e9; return [r.left + b.x + b.w / 2, r.top + b.y + b.h / 2]; });
    await page.mouse.move(mid[0], mid[1]);
    const byClick = await spinOf(() => page.mouse.click(mid[0], mid[1], { button: 'right' }));
    check('one turn button with ' + mods.join('+') + ': ' + turnArrow + ' and right-click turn ' + plan.primary + ', on the board and on screen',
      [byArrow.board, byArrow.screen, byClick.board, byClick.screen].every((d) => d === plan.primary), JSON.stringify({ byArrow, byClick }));
    // Now solve it fresh with the arrows only: ↓ lowers, sets and (Heavy) drops; one arrow turns.
    await ev((s) => Lull.app.modes.puzzle.load(s, {}), seed);
    const keys = { L: plan.map.moveL, R: plan.map.moveR, D: plan.map.lower, DROP: plan.map.lower, [plan.primary]: turnArrow };
    const need = plan.targets.flat().filter((mv) => !keys[mv]);
    for (const pathMoves of plan.targets) {
      for (const mv of pathMoves) if (keys[mv]) await page.keyboard.press(KEY_FOR[keys[mv]]);
      if (pathMoves[pathMoves.length - 1] !== 'DROP') await page.keyboard.press(KEY_FOR[plan.map.lower]);
    }
    await page.waitForTimeout(50);
    check('solved ' + seed + ' (' + mods.join('+') + ') with the arrow keys alone', !need.length && (await ev(() => Lull.app.modes.puzzle.done)), need.length ? 'needs ' + need.join(' ') : '');
  }

  // Mouse only: point, right-click, wheel, click. For each piece, a search over what the mouse can do (the piece
  // follows the pointer's column; right-click turns there; the wheel lowers; a click drops) finds a way to the known
  // target, with the turn the puzzle promises; then the real mouse plays it.
  const mouseSolve = async (seed) => {
    await ev((s) => { Lull.app.modes.puzzle.load(s, {}); Lull.app.focusedAt = -1e9; }, seed);
    const n = await ev(() => Lull.app.modes.puzzle.puzzle.targets.length);
    for (let i = 0; i < n; i++) {
      await page.waitForTimeout(60);
      // A lines goal can be met before the queue runs out.
      if (await ev(() => Lull.app.modes.puzzle.done)) break;
      const steps = await ev((k) => {
        const m = Lull.app.modes.puzzle, g = m.game, p = g.piece, W = g.w, t = m.puzzle.targets[k];
        const cellKey = (cells) => cells.map((c) => c.join(',')).sort().join(';');
        const want = cellKey(Lull.Pieces.get(t.id).rots[t.r].map(([x, y]) => [g.board.wx(t.x + x), t.y + y]));
        const dir = Lull.Puzzles.primaryTurn(m.puzzle.mods) === 'CW' ? 1 : -1;
        const saved = { rot: p.rot, x: p.x, y: p.y, lastRot: p.lastRot, kick: p.kick }, stats = JSON.stringify(g.s);
        g.emit = () => {};
        const aim = (col) => m.aimAt(m.inverted ? W - 1 - col : col);
        const put = (s) => { p.rot = s[0]; p.x = s[1]; p.y = s[2]; };
        const start = [p.rot, p.x, p.y], from = new Map([[start.join(), null]]), q = [start];
        let found = null;
        for (let h = 0; h < q.length && !found; h++) {
          for (let col = 0; col < W && !found; col++) {
            put(q[h]); aim(col);
            let y = p.y; while (g.fitsAt(p, p.rot, p.x, y - 1)) y--;
            if (cellKey(p.type.rots[p.rot].map(([cx, cy]) => [g.board.wx(p.x + cx), y + cy])) === want) { found = [q[h].join(), col]; break; }
            for (const act of ['point', 'turn', 'wheel']) {
              put(q[h]); aim(col);
              if (act === 'turn') { g.rotate(dir); aim(col); }
              if (act === 'wheel') { if (!g.fitsAt(p, p.rot, p.x, p.y - 1)) continue; p.y--; }
              const s = [p.rot, p.x, p.y], key = s.join();
              if (!from.has(key)) { from.set(key, [q[h].join(), act, col]); q.push(s); }
            }
          }
        }
        delete g.emit;
        Object.assign(p, saved); Object.assign(g.s, JSON.parse(stats)); m.view.dirty = true;
        if (!found) return null;
        const out = [['click', found[1]]];
        for (let key = found[0]; from.get(key); key = from.get(key)[0]) out.unshift([from.get(key)[1], from.get(key)[2]]);
        return out;
      }, i);
      if (!steps) return { solved: false, why: 'no mouse way to piece ' + i };
      for (const [act, col] of steps) {
        const pt = await ev((c) => { const v = Lull.app.modes.puzzle.view, [sx, sy] = v.toScreen(c, 0), r = v.canvas.getBoundingClientRect(); return [r.left + sx + v.lay.s / 2, r.top + sy + v.lay.s / 2]; }, col);
        await page.mouse.move(pt[0], pt[1]);
        if (act === 'turn') await page.mouse.click(pt[0], pt[1], { button: 'right' });
        else if (act === 'wheel') { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
        else if (act === 'click') { await page.waitForTimeout(150); await page.mouse.click(pt[0], pt[1]); }
      }
    }
    await page.waitForTimeout(50);
    return { solved: await ev(() => Lull.app.modes.puzzle.done) };
  };
  for (const mods of [['invert'], ['invert', 'flip'], ['side']]) {
    const seed = await findSeed(mods);
    const r = await mouseSolve(seed);
    check('solved ' + seed + ' (' + mods.join('+') + ') with the mouse alone: point, right-click, wheel, click', r.solved, r.why);
  }
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
  const vol = await ev(() => {
    const pz = Lull.app.store.state.stats.puzzle, n = pz.E.solved + pz.M.solved + pz.H.solved, f = document.querySelector('.hist-foot');
    const d = Lull.app.modes.puzzle.puzzle.diff, tip = document.querySelector('#puz-diff button[aria-pressed="true"]').title;
    return { n, text: f && f.textContent, fits: f && f.scrollWidth <= f.clientWidth + 1, tip, dn: pz[d].solved, dname: Lull.Puzzles.DIFFS[d].name };
  });
  check('History ends with the solved count against every seed', vol.n > 0 && vol.text === vol.n.toLocaleString('en-US') + ' of 12,884,901,888 puzzles solved' && vol.fits, JSON.stringify(vol));
  check('a difficulty button says how many of its seeds are solved', vol.tip === vol.dn.toLocaleString('en-US') + ' of 4,294,967,296 ' + vol.dname + ' puzzles solved', vol.tip);
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
  const savedNow = await ev(() => { const m = Lull.app.modes.puzzle, b = document.getElementById('puz-save'); return [m.isSaved(m.puzzle.seed), b.getAttribute('aria-pressed') + (b.classList.contains('on') ? ' on' : '') + (b.querySelector('svg') ? ' star' : '')]; });
  check('the star in the header saves and unsaves the puzzle in play (filled when saved)', savedNow[0] === !was && savedNow[1] === (was ? 'false star' : 'true on star'), JSON.stringify(savedNow));
  await page.click('#puz-save');
  check('and back', await ev((w) => { const m = Lull.app.modes.puzzle; return m.isSaved(m.puzzle.seed) === w; }, was));

  // Retry, undo and failing.
  await ev(() => Lull.app.modes.puzzle.loadNumbered('H', 3));
  const fail = await ev(() => { const m = Lull.app.modes.puzzle; let guard = 0; while (m.game.piece && guard++ < 20) m.action('drop'); return { card: m.cardOpen, done: m.done }; });
  check('dropping everything anywhere fails the puzzle (or solves it)', fail.card);
  await page.keyboard.press('Backspace');
  check('undo takes the card away', !(await ev(() => Lull.app.modes.puzzle.cardOpen)));
  check('undos are counted', await ev(() => Lull.app.store.state.puzzle.current.undos === 1));
  const runs = await ev(() => {
    const m = Lull.app.modes.puzzle, P = Lull.app.store.state.stats.puzzle, best = P.bestFirstRun;
    m.loadNumbered('H', 997);
    let guard = 0; while (m.game.piece && !m.cardOpen && guard++ < 20) m.action('drop');
    return { done: m.done, run: P.firstRun, best, best2: P.bestFirstRun };
  });
  check('a failed puzzle ends the first-try run; the best run stays', runs.done || (runs.run === 0 && runs.best >= 1 && runs.best2 === runs.best), JSON.stringify(runs));
  const skip = await ev(() => {
    const m = Lull.app.modes.puzzle, P = Lull.app.store.state.stats.puzzle;
    m.loadNumbered('H', 996); P.firstRun = 5; m.loadNumbered('H', 995);
    const browsed = P.firstRun;
    m.next();
    return { browsed, skipped: P.firstRun };
  });
  check('looking at a puzzle keeps the first-try run; skipping one ends it', skip.browsed === 5 && skip.skipped === 0, JSON.stringify(skip));
  await ev(() => Lull.app.modes.puzzle.loadNumbered('H', 3));
  await page.keyboard.press('KeyR');
  check('retry restarts', await ev(() => Lull.app.modes.puzzle.game.s.pieces === 0));
  await shot('22-puzzle');
  // A save banks the puzzle's clock and restarts it, so the time (and Quick Study's 20 s) is never counted twice.
  const t0 = await ev(() => performance.now() - Lull.app.modes.puzzle.elapsed());
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(400); await ev(() => Lull.app.saveNow()); }
  const clk = await ev((t) => ({ real: Math.round(performance.now() - t), elapsed: Math.round(Lull.app.modes.puzzle.elapsed()), saved: Lull.app.store.state.puzzle.current.ms }), t0);
  check('saves never count puzzle time twice', Math.abs(clk.elapsed - clk.real) < 60 && clk.saved <= clk.elapsed, JSON.stringify(clk));
  // Toasts sit above the puzzle's actions, not over Undo / Retry / Hint.
  const toastAt = await ev(() => { Lull.UI.toast('A toast'); const t = document.getElementById('toasts').getBoundingClientRect(), a = document.getElementById('puz-actions').getBoundingClientRect(); return { toast: Math.round(t.bottom), actions: Math.round(a.top) }; });
  check('toasts sit above the puzzle actions', toastAt.toast <= toastAt.actions, JSON.stringify(toastAt));
  // Both Ways under Inverted Controls: the chip says which way Z really turns there.
  const spinInv = await ev(() => {
    const m = Lull.app.modes.puzzle, keep = Lull.app.settings.ccwPuzzles;
    Lull.app.settings.ccwPuzzles = true;
    m.load('MS-5MJGQLP', {});
    const foot = document.querySelector('#puz-mods .mod-spin').dataset.tipFoot, g = m.game, r0 = g.piece.rot;
    m.action('ccw');
    const turned = (g.piece.rot - r0 + 4) % 4;
    Lull.app.settings.ccwPuzzles = keep;
    return { mods: m.puzzle.mods.join(' '), foot, turned };
  });
  check('Both Ways + Inverted: the chip says Z turns clockwise, and it does', /invert/.test(spinInv.mods) && /Z turns clockwise/.test(spinInv.foot) && spinInv.turned === 1, JSON.stringify(spinInv));
  await ev(() => Lull.app.modes.puzzle.loadNumbered('H', 3));

  // ---- the Puzzles tab's layout: what it shows, that it fits, and that nothing moves the board -----------------------
  console.log('puzzle tab');
  const boardBox = () => ev(() => { const r = document.getElementById('cv-puzzle').getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); });
  const tabFits = () => ev(() => {
    const v = document.getElementById('view-puzzle'), mods = document.getElementById('puz-mods');
    const over = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    return { view: !over(v), mods: mods.scrollWidth <= mods.clientWidth + 1, card: !over(document.getElementById('puz-card')), bar: !over(document.querySelector('.puz-bar')), actions: !over(document.getElementById('puz-actions')), nav: !over(document.querySelector('.puz-nav')), doc: document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  // The busiest puzzle there is: a both-ways Hard seed with the most wildcards (Hold among them if possible).
  const busy = await ev(() => { let best = null; for (let n = 1; n < 80; n++) { const s = Lull.Puzzles.numberedSeed('H', n, true), p = Lull.Puzzles.generate(s); const score = p.mods.length * 2 + (p.mods.includes('hold') ? 1 : 0); if (!best || score > best[1]) best = [s, score]; } return best[0]; });
  const plain = await ev(() => { for (let n = 1; n < 80; n++) { const s = Lull.Puzzles.numberedSeed('E', n), p = Lull.Puzzles.generate(s); if (!p.mods.length) return s; } return null; });
  const boxes = {};
  await ev((s) => Lull.app.modes.puzzle.load(s, { number: 1 }), plain);
  await page.waitForTimeout(120);
  boxes.plain = await boardBox();
  check('a puzzle without wildcards says so (the row keeps its place)', await ev(() => !!document.querySelector('#puz-mods .mod-none')));
  await ev((s) => Lull.app.modes.puzzle.load(s, {}), busy);
  await page.waitForTimeout(120);
  boxes.busy = await boardBox();
  const head = await ev(() => {
    const m = Lull.app.modes.puzzle, p = m.puzzle;
    const chips = Array.from(document.querySelectorAll('#puz-mods .mod'));
    return {
      seed: document.querySelector('#puz-seed .code').textContent === p.seed,
      goal: document.querySelector('#puz-goal .goal').textContent === Lull.Puzzles.goalText(p),
      progress: document.querySelector('#puz-goal .prog').textContent.length > 0,
      title: document.querySelector('#puz-title .t').textContent === p.title,
      chips: chips.length === p.mods.length && chips.every((c) => c.dataset.tip && c.dataset.tipTitle && c.querySelector('svg')),
      spin: !!document.querySelector('#puz-mods .mod-spin') && /counter-clockwise/.test(document.querySelector('#puz-mods .mod-spin').dataset.tipFoot || ''),
      mods: p.mods.join(' '),
    };
  });
  check('the card shows the title, seed, goal with progress, and a chip (with a tooltip) per wildcard', head.seed && head.goal && head.progress && head.title && head.chips, JSON.stringify(head));
  check('Both Ways reads as its own chip, naming Z', head.spin);
  let tabFit = await tabFits();
  check('520×760: the Puzzles tab fits with no overflow, wildcards on one line', Object.values(tabFit).every(Boolean), JSON.stringify(tabFit));
  check('520×760: Daily, Seed and History keep their words (they only drop to icons when short of room)', await ev(() => !document.querySelector('.puz-nav').classList.contains('icons') && getComputedStyle(document.querySelector('#puz-history .lbl')).display !== 'none'));
  await shot('25-puzzle-busy');
  // A click (or tap) on a chip keeps its description up until a click elsewhere.
  await page.click('#puz-mods .mod');
  const pop = await ev(() => { const p = document.querySelector('.puz-pop'), v = document.getElementById('view-puzzle').getBoundingClientRect(); if (!p) return null; const r = p.getBoundingClientRect(); return { text: p.textContent, inside: r.left >= v.left && r.right <= v.right }; });
  check('clicking a wildcard shows what it does', !!pop && pop.inside && pop.text.length > 10, JSON.stringify(pop));
  await shot('26-wildcard');
  await page.mouse.click(30, 700);
  check('and a click elsewhere puts it away', !(await page.$('.puz-pop')));
  // Solved and not-yet cards sit over the board without moving it.
  await ev(() => { const m = Lull.app.modes.puzzle; let guard = 0; while (m.game.piece && guard++ < 30) m.action('drop'); });
  await page.waitForTimeout(100);
  boxes.failed = await boardBox();
  check('the not-yet card says how far it got, with Undo and Retry', await ev(() => { const c = document.querySelector('#puz-overlay .puz-result'); return !!c && !!c.querySelector('.ring') && c.querySelectorAll('.btn').length === 2; }));
  await shot('27-not-yet');
  await page.click('#puz-retry');
  check('Retry (button) starts over', await ev(() => { const m = Lull.app.modes.puzzle; return m.game.s.pieces === 0 && !m.cardOpen; }));
  await ev(() => Lull.app.modes.puzzle.action('drop'));
  await page.click('#puz-undo');
  check('Undo (button) takes the piece back', await ev(() => Lull.app.modes.puzzle.game.s.pieces === 0));
  await page.click('#puz-daily');
  const daily = await ev(() => { const m = Lull.app.modes.puzzle; return { daily: m.meta.daily === Lull.dateKey(), pressed: document.getElementById('puz-daily').getAttribute('aria-pressed'), meta: document.getElementById('puz-id').textContent }; });
  check('Daily loads today\'s puzzle and says so', daily.daily && daily.pressed === 'true' && /^Daily/.test(daily.meta), JSON.stringify(daily));
  await ev(() => Lull.app.modes.puzzle.solved());
  await page.waitForTimeout(100);
  boxes.solved = await boardBox();
  const solvedCard = await ev(() => { const c = document.querySelector('#puz-overlay .puz-result.solved'); return { card: !!c, tiles: c ? c.querySelectorAll('.bs').length : 0, badge: !!document.querySelector('#puz-title .done'), tick: !!document.querySelector('#puz-daily .tick'), next: document.getElementById('puz-next').classList.contains('primary') }; });
  check('the solved card: time, tries and pay; the card marks it solved; Daily gets its tick; Next leads', solvedCard.card && solvedCard.tiles === 3 && solvedCard.badge && solvedCard.tick && solvedCard.next, JSON.stringify(solvedCard));
  await shot('28-solved-card');
  check('nothing a puzzle shows moves the board (wildcards, cards, solved)', new Set(Object.values(boxes)).size === 1, JSON.stringify(boxes));
  // Retry on a solved puzzle plays it again (it used to throw: a solved puzzle has no current entry).
  await page.click('#puz-retry');
  check('Retry after solving starts it again', await ev(() => { const m = Lull.app.modes.puzzle; return m.game.s.pieces === 0 && !m.done && !m.cardOpen && m.ps.current && m.ps.current.attempts === 1; }));
  const nextN = await ev(() => Lull.app.modes.puzzle.ps.next[Lull.app.modes.puzzle.ps.diff]);
  await page.click('#puz-next');
  check('Next (button) goes on to the next numbered puzzle', await ev((n) => Lull.app.modes.puzzle.meta.number === n && !Lull.app.modes.puzzle.cardOpen, nextN));
  // Play a seed: the field reads the seed as it is typed and refuses a bad one.
  await page.click('#puz-seedbtn');
  await page.keyboard.type('Q-123');
  await page.click('.modal footer .btn.primary');
  check('a bad seed is refused in place', await ev(() => !!document.querySelector('.modal .seed-status.bad')));
  await page.fill('.modal input', 'hs-3k7q2xa');
  const status = await page.textContent('.modal .seed-status');
  check('a good seed is read back (difficulty, both ways)', /Hard/.test(status) && /both ways/.test(status), status);
  await shot('29-seed');
  await page.keyboard.press('Enter');
  check('Enter plays it', await ev(() => Lull.app.modes.puzzle.puzzle.seed === 'HS-3K7Q2XA' && !document.querySelector('.modal')));
  tabFit = await tabFits();
  check('still fits after all that', Object.values(tabFit).every(Boolean), JSON.stringify(tabFit));
  await ev((s) => Lull.app.modes.puzzle.load(s, {}), busy);

  // ---- factory -------------------------------------------------------------------------------------------------------
  console.log('factory');
  await ev(() => { const f = Lull.app.store.state.factory; for (const k of Object.keys(f)) delete f[k]; Object.assign(f, Lull.Factory.create()); });
  await page.click('.tabs button[data-tab="factory"]');
  await page.waitForTimeout(300);
  const floor = await ev(() => {
    const c = document.getElementById('cv-floor'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]);
    return { w: c.width, colors: colors.size, tiles: document.querySelectorAll('#fac-top .kpi').length };
  });
  check('the factory floor is drawn, under three tiles', floor.w > 0 && floor.colors > 8 && floor.tiles === 3, JSON.stringify(floor));
  check('nothing to collect in an empty bin', await ev(() => document.querySelector('#fac-collect .btn').disabled));
  const facFits = await ev(() => { const v = document.getElementById("view-factory"), l = document.getElementById('fac-list'); return v.scrollWidth <= v.clientWidth && l.getBoundingClientRect().bottom <= window.innerHeight && l.getBoundingClientRect().height > 100; });
  check("the factory fits the window", facFits);
  const lines0 = await ev(() => { Lull.app.store.state.factory.bin = '1234'.repeat(12); return Lull.app.store.state.lines; });
  await page.waitForTimeout(350);
  const label = await ev(() => document.querySelector('#fac-collect .btn').textContent);
  check('a full row of four is a line: 48 minos read Collect 12', /^Collect 12 \u29B5/.test(label), label);
  await page.click('#fac-collect .btn');
  check('collecting banks the lines', (await ev(() => Lull.app.store.state.lines)) === lines0 + 12);
  // The bin itself, and the C key.
  await ev(() => { Lull.app.store.state.factory.bin = '5'.repeat(9); });
  await page.waitForTimeout(100);
  const binAt = await ev(() => { const v = Lull.app.modes.factory.view, r = v.canvas.getBoundingClientRect(); return [r.left + v.X(39.5), r.top + v.Y(23.5)]; });
  await page.mouse.click(binAt[0], binAt[1]);
  check('clicking the bin collects, leaving the loose mino', (await ev(() => [Lull.app.store.state.lines, Lull.app.store.state.factory.bin].join())) === (lines0 + 14) + ',5');
  await ev(() => { Lull.app.store.state.factory.bin = '6'.repeat(7); });
  await page.keyboard.press('KeyC');
  check('C collects', (await ev(() => Lull.app.store.state.lines)) === lines0 + 15);
  // Building the second press.
  await ev(() => { Lull.app.store.state.lines += 1000; Lull.app.refreshWallet(); });
  await page.waitForTimeout(350);
  await page.click('#fac-list .row-card[data-up="press"] .btn.primary');
  const built = await ev(() => ({ presses: Lull.app.store.state.factory.presses, spent: Lull.app.store.state.factory.stats.spent, next: document.querySelector('#fac-list .row-card[data-up="press"] .t').textContent }));
  check('building a press costs 150 and offers the next', built.presses === 2 && built.spent === 150 && built.next === 'Hexomino press', JSON.stringify(built));
  await ev(() => { const f = Lull.app.store.state.factory; f.lastTick = Date.now(); Lull.Factory.step(f, 1300); f.bin = f.bin || '1234123'; });
  await page.mouse.move(binAt[0], binAt[1]);
  await page.waitForTimeout(700);
  await shot('30-factory');
  // A press opens its mold picker; a shape pins it.
  const pressAt = await ev(() => { const v = Lull.app.modes.factory.view, r = v.canvas.getBoundingClientRect(); return [r.left + v.X(1.5 * 8.5), r.top + v.Y(10.5)]; });
  await page.mouse.click(pressAt[0], pressAt[1]);
  await page.waitForTimeout(150);
  const mold = await ev(() => ({ title: (document.querySelector('.modal header') || {}).textContent, tiles: document.querySelectorAll('.modal .mold').length }));
  check('clicking a press opens its mold picker', /Pentomino press · mold/.test(mold.title) && mold.tiles === 12, JSON.stringify(mold));
  await shot('32-factory-mold');
  await page.click('.modal .mold[data-s="3"]');
  check('choosing a mold pins the press', await ev(() => Lull.app.store.state.factory.molds[1].pin === 3 && !document.querySelector('.modal') && /◇/.test(document.querySelector('.fac-molds').textContent)));
  // A full bin: the Full tile and the tab badge.
  await ev(() => { const f = Lull.app.store.state.factory; f.bin = '3'.repeat(48); f.belt = [{ n: 4, s: 0, c: 1, x: 35 - Lull.Factory.widthOf({ n: 4, s: 0 }), u: 1 }]; f.lastTick = Date.now(); });
  await page.waitForTimeout(400);
  const full = await ev(() => ({ tile: document.querySelector('#fac-top .kpi.status').className + ' ' + document.querySelector('#fac-top .kpi.status .v').textContent, badge: !!document.querySelector('.tabs button[data-tab="factory"] .badge') }));
  check('a full bin says so, and badges the tab', /warn/.test(full.tile) && /Full/.test(full.tile) && full.badge, JSON.stringify(full));
  await shot('31-factory-full');
  // Twelve hours away: the bin fills only to its capacity, and a toast says what was made.
  const away = await ev(() => {
    const f = Lull.app.store.state.factory;
    f.bin = ''; f.belt = []; f.lastTick = Date.now() - 12 * 3600e3;
    Lull.fromNative({ type: 'shown' });
    return { len: f.bin.length, cap: Lull.Factory.capacity(f), toast: document.getElementById('toasts').textContent };
  });
  check('time away fills the bin up to its capacity, and says so', away.len <= away.cap && away.len > away.cap - 8 && /While you were away: \d+ minos/.test(away.toast), JSON.stringify(away));
  await ev(() => Lull.Factory.collect(Lull.app.store.state.factory));
  // Timers crawl while Lull is hidden: the quiet catch-ups they run are still announced on return.
  await page.click('.tabs button[data-tab="play"]');
  const quiet = await ev(() => {
    const f = Lull.app.store.state.factory;
    f.belt = []; f.lastTick = Date.now() - 3 * 3600e3;
    document.getElementById('toasts').replaceChildren();
    Lull.app.modes.factory.tick();
    const silent = document.getElementById('toasts').textContent;
    document.getElementById('toasts').replaceChildren();
    Lull.fromNative({ type: 'shown' });
    return { silent, after: document.getElementById('toasts').textContent };
  });
  check('time caught up behind the scenes is announced on return', /While you were away/.test(quiet.after) && !/While you were away/.test(quiet.silent), JSON.stringify(quiet));
  await ev(() => Lull.Factory.collect(Lull.app.store.state.factory));

  // ---- shop and settings ---------------------------------------------------------------------------------------------
  console.log('shop');
  // The Shop has no tab: the wallet opens it, and is lit (the current page) while it is open.
  check('no Shop tab in the title bar', !(await page.$('.tabs button[data-tab="shop"]')));
  await page.click('#wallet');
  const walletOn = await ev(() => { const w = document.getElementById('wallet'); return Lull.app.tab === 'shop' && w.classList.contains('active') && w.getAttribute('aria-current') === 'page' && /^Shop — [\d,]+ lines$/.test(w.getAttribute('aria-label')) && !document.querySelector('.tabs button[aria-selected="true"]'); });
  check('clicking the wallet opens the Shop, and the wallet shows it is open', walletOn);
  const shopFits = async () => ev(() => {
    const v = document.getElementById('view-shop'), b = document.getElementById('shop-body'), j = document.querySelector('.shop-jump');
    const r = v.getBoundingClientRect(), jr = j.getBoundingClientRect(), lit = j.querySelector('[aria-selected="true"]').getBoundingClientRect();
    const chev = Array.from(document.querySelectorAll('.shop-chev')).map((c) => c.getBoundingClientRect());
    // Nothing spills out of the window: the tiles scroll inside the view, the row holds every kind, the lit one is in
    // sight, and the chevrons sit at the row's two ends, inside the window.
    return document.documentElement.scrollWidth <= innerWidth && b.getBoundingClientRect().bottom <= r.bottom + 0.5 && b.scrollWidth <= b.clientWidth + 1
      && Array.from(j.children).map((c) => c.dataset.sec).join() === Object.keys(Lull.COSMETICS).join()
      && lit.left >= jr.left - 1 && lit.right <= jr.right + 1
      && chev.length === 2 && chev[0].right <= jr.left + 1 && chev[1].left >= jr.right - 1 && chev[0].left >= r.left && chev[1].right <= r.right + 0.5;
  });
  // One kind at a time: only its tiles, one section, and its button lit.
  const shopShows = (kind) => ev((k) => {
    const secs = document.querySelectorAll('#shop-body .shop-sec'), tiles = Array.from(document.querySelectorAll('#shop-body .shop-look'));
    const lit = document.querySelectorAll('.shop-jump [aria-selected="true"]');
    return secs.length === 1 && secs[0].dataset.sec === k && tiles.length === Object.keys(Lull.COSMETICS[k]).length
      && tiles.every((t) => t.dataset.look.startsWith(k + ':')) && lit.length === 1 && lit[0].dataset.sec === k && Lull.app.settings.shopKind === k;
  }, kind);
  const kinds = await ev(() => Object.keys(Lull.COSMETICS));
  await page.click('.shop-jump button[data-sec="' + kinds[0] + '"]');
  check('the Shop sells no power-ups: no Power-ups half, no toggle, no item tiles', await ev(() => !document.querySelector('.shop-seg, .shop-item, #shop-body [data-item]')
    && !/Power-ups/.test(document.getElementById('view-shop').textContent)));
  const chevState = () => ev(() => {
    const j = document.querySelector('.shop-jump'), [p, n] = ['prev', 'next'].map((d) => document.querySelector('.shop-chev[data-dir="' + d + '"]'));
    const jr = j.getBoundingClientRect(), whole = Array.from(j.children).filter((b) => { const r = b.getBoundingClientRect(); return r.left >= jr.left - 1 && r.right <= jr.right + 1; }).map((b) => b.dataset.sec);
    return { left: Math.round(j.scrollLeft), max: j.scrollWidth - j.clientWidth, fits: j.scrollWidth <= j.clientWidth + 1, prev: p.disabled, next: n.disabled, shown: getComputedStyle(p).visibility !== 'hidden', whole };
  });
  const c0 = await chevState();
  check('the Shop fits the window; only the first kind is shown; the left chevron is off (both hidden when the row fits)', await shopFits() && await shopShows(kinds[0])
    && c0.prev && c0.next === c0.fits && c0.shown === !c0.fits, JSON.stringify(c0));
  await shot('41-palettes');
  // The chevrons page the row of kinds (one visible width, snapped to whole kinds), never pick one; off at each end.
  await page.setViewportSize({ width: 400, height: 760 });
  await page.waitForTimeout(150);
  const pages = [await chevState()];
  for (let i = 0; i < kinds.length && !pages[pages.length - 1].next; i++) { await page.click('.shop-chev[data-dir="next"]'); await page.waitForTimeout(500); pages.push(await chevState()); }
  const kept = await shopShows(kinds[0]), last = pages[pages.length - 1];
  check('in a narrow window the right chevron pages the row (whole kinds come into view), off at the end, and picks nothing',
    !pages[0].fits && pages[0].prev && !pages[0].next && pages.length > 1 && kept && last.next && !last.prev && last.left >= last.max - 1
      && pages.slice(1).every((pg, i) => pg.left > pages[i].left && pg.whole.some((k) => !pages[i].whole.includes(k))), JSON.stringify(pages));
  for (let i = 0; i < kinds.length && !(await chevState()).prev; i++) { await page.click('.shop-chev[data-dir="prev"]'); await page.waitForTimeout(500); }
  const pagedBack = await chevState();
  check('the left chevron pages back to the start', pagedBack.left === 0 && pagedBack.prev && !pagedBack.next && await shopShows(kinds[0]), JSON.stringify(pagedBack));
  await page.setViewportSize({ width: 520, height: 760 });
  await page.waitForTimeout(150);
  await page.click('.shop-jump button[data-sec="' + kinds[kinds.length - 2] + '"]');
  // The keyboard: ← and → on the row step too.
  await page.focus('.shop-jump [aria-selected="true"]');
  await page.keyboard.press('ArrowLeft');
  const keyL = await shopShows(kinds[kinds.length - 3]);
  await page.keyboard.press('ArrowRight');
  check('← and → on the row step the kinds, and keep the focus on it', keyL && await shopShows(kinds[kinds.length - 2]) && await ev(() => document.activeElement && document.activeElement.getAttribute('aria-selected') === 'true'));
  // Scrolling the list never runs into the next kind.
  await ev(() => { const b = document.getElementById('shop-body'); b.scrollTop = b.scrollHeight; });
  await page.waitForTimeout(100);
  check('scrolled to the bottom, it is still the same kind', await shopShows(kinds[kinds.length - 2]));
  await page.click('.shop-jump button[data-sec="skin"]');
  check('clicking a kind shows it, and only it', await shopShows('skin'));
  await shot('40-skins');
  // Two calm clicks buy: the price asks first (Confirm), clicking elsewhere puts it back; the second click buys.
  await ev(() => { Lull.app.store.state.lines = Math.max(Lull.app.store.state.lines, 5000); Lull.app.refreshWallet(); });
  await page.click('.shop-look[data-look="skin:bevel"] .price-btn');
  const asked = await ev(() => { const b = document.querySelector('.shop-look[data-look="skin:bevel"] .price-btn'); return b.classList.contains('armed') && b.textContent === 'Confirm' && !document.querySelector('.modal'); });
  await page.mouse.click(5, 300);
  const backToPrice = await ev(() => !document.querySelector('.price-btn.armed'));
  check('a price asks first (Confirm, no dialog); clicking elsewhere puts it back', asked && backToPrice);
  await page.click('.shop-look[data-look="skin:bevel"] .price-btn');
  await page.click('.shop-look[data-look="skin:bevel"] .price-btn');
  const skin = await ev(() => ({ on: Lull.app.store.state.equipped.skin, lines: Lull.app.store.state.lines, wallet: document.getElementById('wallet-n').textContent }));
  check('skin bought and equipped, the wallet in step', skin.on === 'bevel' && skin.wallet === skin.lines.toLocaleString('en-US'), JSON.stringify(skin));
  check('it says In use, and the one before offers Use; still on Skins', await ev(() => /In use/.test(document.querySelector('.shop-look[data-look="skin:bevel"]').textContent) && !!document.querySelector('.shop-look[data-look="skin:flat"] .use-btn')) && await shopShows('skin'));
  await page.click('.shop-look[data-look="skin:flat"]');
  check('clicking an owned tile puts it on', await ev(() => Lull.app.store.state.equipped.skin === 'flat'));
  await page.click('.shop-look[data-look="skin:bevel"] .use-btn');
  check('a factory reward shows its lock, not a price', await ev(() => { const t = document.querySelector('.shop-look[data-look="skin:steel"]'); return t && !t.querySelector('.price-btn') && !!t.querySelector('.reward-tag') && t.dataset.tip === Lull.COSMETICS.skin.steel.reward; }));
  // A price you cannot pay is dimmed as the wallet changes, and never asks.
  const dear = await ev(() => { const t = Array.from(document.querySelectorAll('#shop-body .price-btn')).sort((a, b) => b.dataset.price - a.dataset.price)[0]; Lull.app.store.state.lines = Number(t.dataset.price) - 1; Lull.app.refreshWallet(); return t.closest('.shop-look').dataset.look; });
  const dim = await ev((d) => document.querySelector('.shop-look[data-look="' + d + '"] .price-btn').classList.contains('poor'), dear);
  await page.click('.shop-look[data-look="' + dear + '"] .price-btn');
  check('a price you cannot pay is dimmed, and never asks', dim && await ev(() => !document.querySelector('.price-btn.armed')), dear);
  await ev((n) => { Lull.app.store.state.lines = n; Lull.app.refreshWallet(); }, skin.lines);
  for (const name of ['frame', 'backdrop', 'effect', 'ghost']) {
    await page.click('.shop-jump button[data-sec="' + name + '"]');
    await page.waitForTimeout(150);
    await shot('41-' + name);
  }
  await page.click('.shop-jump button[data-sec="sound"]');
  await shot('43-sounds');
  await page.click('.shop-look[data-look="sound:chip"] .preview.listen');
  check('a sound pack\'s preview plays it', await ev(() => document.querySelector('.shop-look[data-look="sound:chip"] .preview').classList.contains('playing')));
  await page.click('.shop-look[data-look="sound:chip"] .price-btn');
  await page.click('.shop-look[data-look="sound:chip"] .price-btn');
  check('sound pack bought and in use', await ev(() => Lull.app.store.state.equipped.sound === 'chip' && Lull.Sound.pack === 'chip'));
  // It remembers the kind: away and back, the Shop opens on Sounds.
  await page.click('.tabs button[data-tab="play"]');
  await page.click('#wallet');
  check('the Shop remembers the last kind looked at', await shopShows('sound'));
  await page.click('.shop-jump button[data-sec="backdrop"]');
  for (const [w, hgt, theme] of [[400, 700, 'dark'], [900, 900, 'dark'], [520, 760, 'light']]) {
    await page.setViewportSize({ width: w, height: hgt });
    await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
    await page.waitForTimeout(120);
    check('the Shop fits at ' + w + '×' + hgt + ' (' + theme + ')', await shopFits());
    await shot('44-shop-' + w + '-' + theme);
  }
  await ev(() => { Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); });
  await page.setViewportSize({ width: 520, height: 760 });
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
  await page.click('#stats-tabs button:nth-child(2)');
  await page.waitForTimeout(50);
  const book = await ev(() => { const l = document.querySelector('.combo-list'); if (l) l.scrollIntoView(); return { all: document.querySelectorAll('.combo').length, unknown: document.querySelectorAll('.combo.unknown').length, known: [...document.querySelectorAll('.combo:not(.unknown) b')].map((b) => b.textContent), fits: [...document.querySelectorAll('.combo')].every((c) => c.scrollWidth <= c.clientWidth + 1) }; });
  check('Stats ▸ Free Play lists the combos: found ones by name, the rest as ?', book.all === await ev(() => Lull.Combos.LIST.length) && book.unknown === book.all - book.known.length && book.known.includes('Patch Job') && book.fits, JSON.stringify(book));
  await page.waitForTimeout(50);
  await shot('50b-stats-combos');
  await page.click('.tabs button[data-tab="achievements"]');
  await page.waitForTimeout(80);
  await shot('51-achievements');
  const ach = await ev(() => ({ legends: document.querySelectorAll('.ach.legend').length, got: document.querySelectorAll('.ach.got').length, all: document.querySelectorAll('.ach').length, groups: document.querySelectorAll('.ach-group').length, open: document.querySelectorAll('.ach-group[open]').length, quad: !!Lull.app.store.state.achievements.quad, paid: Lull.app.store.state.stats.lines.achievements }));
  check('achievements: earned in play, listed in their own tab (legendary ones too), and paid', ach.quad && ach.got >= 1 && ach.all >= 85 && ach.legends >= 28 && ach.paid >= 15, JSON.stringify(ach));
  check('achievements: five groups, folded away at first', ach.groups === 5 && ach.open === 0, JSON.stringify(ach));
  await page.click('.ach-group[data-group="play"] > summary');
  await page.waitForTimeout(60);
  await shot('51b-achievements-open');
  const fitA = await ev(() => { const b = document.getElementById('ach-body'); return { scrolls: b.scrollHeight > b.clientHeight + 10, page: document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1, rowsFit: [...document.querySelectorAll('.ach-group[open] .ach')].every((r) => r.scrollWidth <= r.clientWidth + 1) }; });
  check('an open group scrolls inside the view, never the window, and every row fits', fitA.scrolls && fitA.page && fitA.rowsFit, JSON.stringify(fitA));
  // "No power-ups on the board" is in each Free Play description; what it means exactly is said once, on the header.
  const rule = await ev(() => {
    const play = [...document.querySelectorAll('.ach-group[data-group="play"] .ach .d')].map((d) => d.textContent);
    const info = document.querySelector('.ach-group[data-group="play"] > summary .ach-info'), others = document.querySelectorAll('.ach-group:not([data-group="play"]) .ach-info').length;
    return { said: play.filter((t) => /no (other )?power-ups on the board/i.test(t)).length, byHand: document.getElementById('ach-body').textContent.includes('by hand'), info: info && info.dataset.tip, others };
  });
  check('Free Play skill ones say "no power-ups on the board", defined once on the header (never "by hand")', rule.said >= 20 && !rule.byHand && /last empty/.test(rule.info || '') && rule.others === 0, JSON.stringify(rule));
  const wasOpen = await ev(() => document.querySelector('.ach-group[data-group="play"]').open);
  await page.click('.ach-group[data-group="play"] > summary .ach-info');
  check('clicking the header\'s definition leaves the group as it was', (await ev(() => document.querySelector('.ach-group[data-group="play"]').open)) === wasOpen);
  await page.click('.ach-tools .seg button:nth-child(3)');
  await page.waitForTimeout(40);
  const earnedOnly = await ev(() => ({ shown: document.querySelectorAll('.ach').length, got: document.querySelectorAll('.ach.got').length, open: !!document.querySelector('.ach-group[data-group="play"][open]') }));
  check('the Earned filter shows only earned ones (and the open group stays open)', earnedOnly.shown === earnedOnly.got && earnedOnly.open, JSON.stringify(earnedOnly));
  await shot('51c-achievements-earned');
  await page.click('.ach-tools .seg button:nth-child(2)');
  await page.waitForTimeout(40);
  const todo = await ev(() => ({ got: document.querySelectorAll('.ach.got').length, shown: document.querySelectorAll('.ach').length, left: Lull.Achievements.LIST.filter((a) => !Lull.app.store.state.achievements[a.id]).length }));
  check('the To do filter hides the earned ones', todo.got === 0 && todo.shown === todo.left && todo.left <= ach.all - ach.got, JSON.stringify(todo));
  await page.click('.ach-tools .seg button:nth-child(1)');
  await ev(() => { document.querySelectorAll('.ach-group').forEach((d) => { d.open = true; }); });
  await page.waitForTimeout(40);
  await ev(() => { document.getElementById('ach-body').scrollTop = 1e6; });
  await shot('51d-achievements-bottom');
  await page.click('.ach-tools .seg button:nth-child(1)');
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
  for (const [w, hgt] of [[300, 440], [900, 560], [420, 900], [400, 700], [520, 760]]) {
    await page.setViewportSize({ width: w, height: hgt });
    for (const tab of ['play', 'classic', 'puzzle', 'factory']) {
      await ev((t) => Lull.app.setTab(t), tab);
      await page.waitForTimeout(150);
      const overflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (tab === 'play') check(w + '×' + hgt + ' the daily gift sits inside the status bar', await ev(() => { const g = document.getElementById('gift-btn'), b = document.getElementById('play-status'); if (!g) return false; const r = g.getBoundingClientRect(), q = b.getBoundingClientRect(); return r.width > 0 && r.left >= q.left - 0.5 && r.right <= q.right + 0.5 && r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5; }));
      if (tab === 'play' || tab === 'classic') check(w + '×' + hgt + ' ' + tab + ' status bar shows everything', await ev((t) => { const b = document.getElementById(t === 'play' ? 'play-status' : 'classic-status'); return b.scrollWidth <= b.clientWidth + 1; }, tab));
      check(w + '×' + hgt + ' ' + tab + ' fits', !overflow);
      if (tab === 'puzzle') check(w + '×' + hgt + ' puzzle card and wildcards fit', await ev(() => ['view-puzzle', 'puz-card', 'puz-mods', 'puz-actions'].every((id) => { const el = document.getElementById(id); return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1; })));
      await shot('70-' + w + 'x' + hgt + '-' + tab);
    }
  }


  // ---- the board library: shelve, switch back exactly, rename, retire, delete, caps, top-out, fit, reload ------------
  console.log('board library');
  {
  await page.setViewportSize({ width: 520, height: 760 });
  const noMs = (j) => { const o = JSON.parse(j); delete o.s.playMs; return JSON.stringify(o); };
  const libA = await ev(() => {
    Lull.app.setTab('play');
    const m = Lull.app.modes.play;
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    if (m.game.over) m.newBoard();
    m.hideCard();
    const g = m.game;
    for (let i = 0; i < 6; i++) { g.move((i % 3) - 1); g.drop(); }
    g.holdPiece(); g.rotate(1);
    g.s.gold = 2;
    m.renderStatus();
    return { id: Lull.app.store.state.boards.cur, json: JSON.stringify(g.toJSON()), n: Lull.app.store.state.boards.list.length, pieces: g.s.pieces };
  });
  await page.click('#play-status .boards-btn');
  await page.waitForTimeout(250);
  const lib0 = await ev(() => ({ rows: document.querySelectorAll('.modal-lib .lib-row').length, cur: !!document.querySelector('.modal-lib .lib-row.current .tag.on'), thumb: (() => { const i = document.querySelector('.modal-lib .lib-thumb'); return i && i.complete && i.naturalWidth > 0; })(), counts: document.querySelector('.lib-tabs').textContent }));
  check('the library lists the board in play, with a thumbnail and the counts', lib0.rows === libA.n && lib0.cur && lib0.thumb && /Saved/.test(lib0.counts) && /Retired/.test(lib0.counts), JSON.stringify(lib0));
  await shot('75-library');
  await page.click('.modal-lib .lib-new');
  await page.waitForTimeout(150);
  const libB = await ev(() => { const g = Lull.app.modes.play.game, B = Lull.app.store.state.boards; return { id: B.cur, n: B.list.length, pieces: g.s.pieces, empty: g.board.isEmpty(), rng: g.rng.state(), rows: document.querySelectorAll('.modal-lib .lib-row').length, first: document.querySelector('.modal-lib .lib-row').dataset.id }; });
  check('New board shelves the one in play and starts an empty one (its own seed)', libB.id !== libA.id && libB.n === libA.n + 1 && libB.pieces === 0 && libB.empty && JSON.stringify(libB.rng) !== JSON.stringify(JSON.parse(libA.json).rng) && libB.rows === libA.n + 1 && libB.first === libB.id, JSON.stringify(libB));
  check('an untouched board cannot start another', await ev(() => document.querySelector('.modal-lib .lib-new').disabled));
  await shot('75a-library-new');
  // Keyboard: ↓ to the shelved board, Enter resumes it exactly.
  await page.focus('.modal-lib button.lib-open');
  await page.keyboard.press('ArrowDown');
  const focused = await ev(() => document.activeElement && document.activeElement.dataset.id);
  check('↓ steps to the next board', focused === libA.id, focused + ' vs ' + libA.id);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const libA2 = await ev(() => ({ id: Lull.app.store.state.boards.cur, json: JSON.stringify(Lull.app.modes.play.game.toJSON()), modal: !!document.querySelector('.modal'), status: document.getElementById('play-status').textContent }));
  check('Enter resumes it: cells, piece, hold, queue, bag, RNG and stats exactly as left', libA2.id === libA.id && noMs(libA2.json) === noMs(libA.json) && !libA2.modal, libA2.id);
  check('its gold and figures come back to the status bar', /Gold/.test(libA2.status));
  // Rename: inline, Enter keeps it, Esc leaves it, at most 24 characters, never empty.
  await page.click('#play-status .boards-btn');
  await page.click('.modal-lib .lib-row.current [aria-label="Rename"]');
  check('Rename turns the name into a field, focused', await ev(() => document.activeElement && document.activeElement.classList.contains('lib-name')));
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Rainy Sunday');
  await page.keyboard.press('Enter');
  const nm = await ev(() => ({ name: Lull.app.store.state.boards.list.find((r) => r.id === Lull.app.store.state.boards.cur).name, shown: document.querySelector('.modal-lib .lib-row.current .t').textContent, modal: !!document.querySelector('.modal-lib') }));
  check('Enter keeps the new name (and the library stays open)', nm.name === 'Rainy Sunday' && nm.shown === 'Rainy Sunday' && nm.modal, JSON.stringify(nm));
  await page.click('.modal-lib .lib-row.current [aria-label="Rename"]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('x'.repeat(40));
  const typed = await ev(() => document.activeElement.value.length);
  await page.keyboard.press('Escape');
  const nm2 = await ev(() => ({ name: Lull.app.store.state.boards.list.find((r) => r.id === Lull.app.store.state.boards.cur).name, modal: !!document.querySelector('.modal-lib') }));
  check('a name is capped at 24; Esc leaves the old one and the library open', typed === 24 && nm2.name === 'Rainy Sunday' && nm2.modal, typed + ' ' + JSON.stringify(nm2));
  await page.click('.modal-lib .lib-row.current [aria-label="Rename"]');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  check('an empty name is refused', await ev(() => Lull.app.store.state.boards.list.find((r) => r.id === Lull.app.store.state.boards.cur).name === 'Rainy Sunday'));
  await shot('75b-library-renamed');
  // The untouched shelved board has no Retire (nothing to record); Delete asks, then it is gone.
  check('an untouched board offers no Retire', await ev((id) => !document.querySelector('.modal-lib .lib-row[data-id="' + id + '"] [aria-label="Retire"]'), libB.id));
  const retired0 = await ev(() => Lull.app.store.state.boards.retired.length);
  await page.click('.modal-lib .lib-row[data-id="' + libB.id + '"] [aria-label="Delete"]');
  check('Delete asks first', await page.isVisible('.modal footer .btn.danger'));
  await shot('75c-delete');
  await page.click('.modal footer .btn.danger');
  const del = await ev((id) => ({ gone: !Lull.app.store.state.boards.list.some((r) => r.id === id), rows: document.querySelectorAll('.modal-lib .lib-row').length, n: Lull.app.store.state.boards.list.length, retired: Lull.app.store.state.boards.retired.length }), libB.id);
  check('deleted for good (no record kept)', del.gone && del.rows === del.n && del.retired === retired0, JSON.stringify(del));
  // Retire the board in play from the library: its summary, then a new board takes its place.
  await page.click('.modal-lib .lib-row.current [aria-label="Retire"]');
  check('Retire shows the board\'s life', await page.isVisible('.modal-retire .board-sum'));
  await page.click('.modal-retire footer .btn.primary');
  const ret = await ev((id) => { const B = Lull.app.store.state.boards; return { cur: B.cur, retired: B.retired[0] && B.retired[0].id, name: B.retired[0] && B.retired[0].name, pieces: Lull.app.modes.play.game.s.pieces, rows: document.querySelectorAll('.modal-lib .lib-row').length }; }, libA.id);
  check('retired: into the records, a new board in play', ret.retired === libA.id && ret.name === 'Rainy Sunday' && ret.cur !== libA.id && ret.pieces === 0, JSON.stringify(ret));
  await page.click('.modal-lib .lib-tabs [data-k="retired"]');
  await page.waitForTimeout(100);
  const rrows = await ev(() => Array.from(document.querySelectorAll('.modal-lib .lib-row.retired')).map((r) => r.textContent));
  check('the Retired tab lists it first', rrows.length === retired0 + 1 && /Rainy Sunday/.test(rrows[0]), JSON.stringify(rrows));
  await shot('75d-retired');
  await page.click('.modal-lib .lib-row.retired .lib-open');
  const rec = await ev(() => { const m = document.querySelectorAll('.modal'); const top = m[m.length - 1]; return { title: top.querySelector('header').textContent, sum: !!top.querySelector('.board-sum'), dates: !!top.querySelector('.lib-dates') }; });
  check('a retired board opens its record, read-only', /Rainy Sunday/.test(rec.title) && rec.sum && rec.dates, JSON.stringify(rec));
  await shot('75e-record');
  await page.keyboard.press('Escape');
  await page.click('.modal-lib .lib-row.retired [aria-label="Delete"]');
  await page.click('.modal footer .btn.danger');
  check('a retired record can be deleted', await ev((n) => Lull.app.store.state.boards.retired.length === n && document.querySelectorAll('.modal-lib .lib-row.retired').length === n && !Lull.app.store.state.boards.retired.some((r) => r.name === 'Rainy Sunday'), retired0));
  await page.keyboard.press('Escape');
  // Fill the library: twelve boards, then New board is refused (disabled, and the call too).
  const cap = await ev(() => {
    const m = Lull.app.modes.play;
    let made = 0;
    for (let i = 0; i < 20; i++) { m.game.drop(); if (m.shelveAndNew()) made++; }
    const B = Lull.app.store.state.boards;
    m.game.drop();
    const out = { n: B.list.length, made, again: m.shelveAndNew(), names: new Set(B.list.map((r) => r.name)).size };
    document.getElementById('toasts').replaceChildren();
    return out;
  });
  check('twelve boards at most; the thirteenth is refused', cap.n === 12 && cap.again === false && cap.names === 12, JSON.stringify(cap));
  await page.click('#play-status .boards-btn');
  await page.waitForTimeout(250);
  check('a full library disables New board', await ev(() => { const b = document.querySelector('.modal-lib .lib-new'); return b.disabled && b.dataset.tip === 'Library full' && /12\/12/.test(document.querySelector('.lib-tabs').textContent); }));
  for (const [w, hgt] of [[520, 760], [400, 700]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await page.waitForTimeout(200);
    const fit = await ev(() => {
      const m = document.querySelector('.modal-lib'), r = m.getBoundingClientRect(), head = document.querySelector('.lib-head'), list = document.querySelector('.lib-list');
      const rows = Array.from(document.querySelectorAll('.modal-lib .lib-row'));
      return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, head: head.scrollWidth <= head.clientWidth + 1, rows: rows.every((x) => x.scrollWidth <= x.clientWidth + 1), scrolls: list.scrollHeight > list.clientHeight, page: document.documentElement.scrollWidth <= innerWidth + 1, acts: rows.every((x) => { const a = x.querySelector('.lib-acts').getBoundingClientRect(), q = x.getBoundingClientRect(); return a.right <= q.right + 0.5; }) };
    });
    check(w + '×' + hgt + ' the library fits (rows, head, actions; the list scrolls)', fit.inside && fit.head && fit.rows && fit.scrolls && fit.page && fit.acts, JSON.stringify(fit));
    await shot('76-library-' + w + 'x' + hgt);
    await page.click('.modal-lib .lib-row.current [aria-label="Retire"]');
    await page.waitForTimeout(150);
    const rfit = await ev(() => { const ms = document.querySelectorAll('.modal'), r = ms[ms.length - 1].getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
    check(w + '×' + hgt + ' the retire card fits', rfit);
    await shot('76a-retire-' + w + 'x' + hgt);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 520, height: 760 });
  // Top-out: the card offers Boards and Retire; Retire goes through the library.
  const top = await ev(() => {
    const m = Lull.app.modes.play, g = m.game;
    g.board.cells.fill(0); g.replacePiece({ id: 'O' });
    for (let y = 0; y < 18; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
    let guard = 0;
    while (!g.over && guard++ < 50) g.drop();
    const card = document.querySelector('#play-overlay .card');
    return { over: g.over, text: card ? card.textContent : '', btns: card ? Array.from(card.querySelectorAll('button')).map((b) => b.textContent) : [] };
  });
  check('a full board offers Boards and Retire', top.over && /Board full/.test(top.text) && top.btns.includes('Boards') && top.btns.includes('Retire'), JSON.stringify(top.btns));
  await shot('77-topout');
  const topN0 = await ev(() => ({ r: Lull.app.store.state.boards.retired.length, cur: Lull.app.store.state.boards.cur }));
  await page.click('#play-overlay .btn.primary');
  const topRet = await ev(() => { const B = Lull.app.store.state.boards; return { r: B.retired.length, reason: B.retired[0].reason, cur: B.cur, n: B.list.length, over: Lull.app.modes.play.game.over, card: !document.getElementById('play-overlay').classList.contains('hidden') }; });
  check('Retire on a full board records it (full) and starts a new one', topRet.r === topN0.r + 1 && topRet.reason === 'full' && topRet.cur !== topN0.cur && topRet.n === 12 && !topRet.over && !topRet.card, JSON.stringify(topRet));
  // Across a reload: every board, name and the one in play, exactly.
  const libSnap = await ev(() => { const m = Lull.app.modes.play; m.game.drop(); m.game.drop(); Lull.app.saveNow(); const B = Lull.app.store.state.boards; return { ids: B.list.map((r) => r.id + ':' + r.name).join(), cur: B.cur, retired: B.retired.map((r) => r.id).join(), json: JSON.stringify(m.game.toJSON()), shelved: JSON.stringify(B.list.filter((r) => r.id !== B.cur).map((r) => r.game)) }; });
  await page.reload();
  await page.waitForTimeout(400);
  const libBack = await ev(() => { const m = Lull.app.modes.play, B = Lull.app.store.state.boards; return { ids: B.list.map((r) => r.id + ':' + r.name).join(), cur: B.cur, retired: B.retired.map((r) => r.id).join(), json: JSON.stringify(m.game.toJSON()), shelved: JSON.stringify(B.list.filter((r) => r.id !== B.cur).map((r) => r.game)) }; });
  check('the library survives a reload: boards, names, records, the board in play', libBack.ids === libSnap.ids && libBack.cur === libSnap.cur && libBack.retired === libSnap.retired && noMs(libBack.json) === noMs(libSnap.json) && libBack.shelved === libSnap.shelved);
  // ---- review fixes: a fresh game on Retire, exact resume of the piece, keyboard focus, clicks while renaming … ----
  await ev(() => {
    const m = Lull.app.modes.play, B = Lull.app.store.state.boards;
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    for (const r of B.list.slice()) if (r.id !== B.cur && B.list.length > 4) m.deleteBoard(r.id);
    if (m.game.over) m.newBoard();
    m.hideCard();
    for (let i = 0; i < 3; i++) m.game.drop();
  });
  // Retire (the board in play) with a power-up in hand: the new board is a new game — its own piece, queue and stream.
  const carry = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, inv = Lull.app.store.state.inventory, B = Lull.app.store.state.boards;
    inv.bomb = (inv.bomb || 0) + 1;
    m.useItem('bomb');
    const before = { special: g.piece.special, rng: JSON.stringify(g.rng.state()), queue: g.queue.map((e) => e.id).join(''), id: B.cur };
    m.retire(B.cur);
    const n = m.game;
    return { before, same: n === g, special: n.piece.special, tag: n.piece.entry.tag || null, rng: JSON.stringify(n.rng.state()), queue: n.queue.map((e) => e.id).join(''), items: JSON.stringify(n.s.items || {}), hand: n.s.hand, cur: B.cur, stored: JSON.parse(localStorage.getItem('lull.save.v1')).boards.retired[0].id };
  });
  check('Retire with a power-up in hand: a new game, no power-up carried over, its own queue and random stream', !carry.same && carry.before.special === 'bomb' && !carry.special && !carry.tag && carry.rng !== carry.before.rng && carry.items === '{}' && carry.cur !== carry.before.id && carry.stored === carry.before.id, JSON.stringify(carry));
  // A full board in play retired from the library keeps its Full tag; the card's Retire is saved at once.
  const fullRet = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, B = Lull.app.store.state.boards;
    g.board.cells.fill(0); g.replacePiece({ id: 'O' });
    for (let y = 0; y < 18; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
    let guard = 0;
    while (!g.over && guard++ < 50) g.drop();
    const id = B.cur;
    m.retire(id);
    return { over: g.over, reason: B.retired[0].reason, log: Lull.app.store.state.stats.free.boardLog[0].reason, id: B.retired[0].id === id };
  });
  check('a full board retired from the library is recorded as full', fullRet.over && fullRet.id && fullRet.reason === 'full' && fullRet.log === 'full', JSON.stringify(fullRet));
  const cardSaved = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, B = Lull.app.store.state.boards;
    g.board.cells.fill(0); g.replacePiece({ id: 'O' });
    for (let y = 0; y < 18; y++) for (let x = 0; x < 9; x++) g.board.set(x, y, 8);
    let guard = 0;
    while (!g.over && guard++ < 50) g.drop();
    const id = B.cur;
    document.querySelector('#play-overlay .btn.primary').click();
    return { id, stored: JSON.parse(localStorage.getItem('lull.save.v1')).boards.retired[0].id, dirty: Lull.app.store.dirty };
  });
  check('Retire on the Board full card is saved at once', cardSaved.stored === cardSaved.id, JSON.stringify(cardSaved));
  // Delete the board in play: every turn and move on it still counts in the lifetime totals.
  const delCount = await ev(() => {
    const m = Lull.app.modes.play, F = Lull.app.store.state.stats.free, g = m.game;
    g.drop();
    const r0 = F.rotations, h0 = F.holds;
    g.holdPiece(); m.afterHold();
    let turned = 0;
    for (let i = 0; i < 3; i++) if (g.rotate(1)) turned++;
    m.deleteBoard(Lull.app.store.state.boards.cur);
    return { rot: F.rotations - r0, turned, holds: F.holds - h0 };
  });
  check('deleting the board in play keeps its unsaved counts (turns after the last hold)', delCount.rot === delCount.turned && delCount.turned > 0 && delCount.holds === 1, JSON.stringify(delCount));
  // A T turned into its slot and then shelved still spins when it comes back.
  const spin = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, B = Lull.app.store.state.boards;
    g.drop();
    const fill = (y, row) => { for (let x = 0; x < 10; x++) g.board.set(x, y, row[x] === 'X' ? 8 : 0); };
    g.board.cells.fill(0);
    fill(0, 'XXX.XXXXXX'); fill(1, 'XX...XXXXX');
    g.board.set(4, 2, 8);
    g.replacePiece({ id: 'T' });
    Object.assign(g.piece, { rot: 2, x: 2, y: 0, lastRot: true, kick: 1 });
    const id = B.cur;
    m.shelveAndNew();
    m.game.drop();
    m.switchTo(id);
    const p = m.game.piece, r = m.game.lock();
    return { lastRot: p.lastRot, tspin: r.tspin, lines: r.lines };
  });
  check('a T twisted into its slot, shelved and resumed, still spins', spin.lastRot && spin.tspin && spin.lines === 2, JSON.stringify(spin));
  // Keyboard: Boards opened with Enter takes focus; once only; a Delete asked for by key takes focus into the question,
  // with the library under it out of reach.
  await page.focus('#play-status .boards-btn');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const kb1 = await ev(() => ({ inLib: !!(document.activeElement && document.activeElement.closest('.modal-lib')), cls: document.activeElement && document.activeElement.className, main: document.getElementById('main').inert }));
  await page.keyboard.press('Enter'); // resumes the board in play: the library closes, it does not open twice
  await page.waitForTimeout(80);
  const kb1b = await ev(() => document.querySelectorAll('.modal-lib').length);
  check('Boards by keyboard: focus goes to the board in play; the app underneath is inert; never two libraries', kb1.inLib && /lib-open/.test(kb1.cls) && kb1.main && kb1b === 0, JSON.stringify([kb1, kb1b]));
  const twice = await ev(() => { const m = Lull.app.modes.play; m.openLibrary(); m.openLibrary(); return document.querySelectorAll('.modal-lib').length; });
  check('asked twice, the library opens once', twice === 1);
  await ev(() => document.querySelectorAll('.modal-lib .lib-row')[1].querySelector('[aria-label="Delete"]').focus());
  const delName = await ev(() => document.querySelectorAll('.modal-lib .lib-row')[1].dataset.id);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); // on Cancel now, not a second Delete
  await page.waitForTimeout(80);
  const kb2 = await ev((id) => ({ modals: Array.from(document.querySelectorAll('.modal header .ttl')).map((t) => t.textContent), kept: Lull.app.store.state.boards.list.some((r) => r.id === id), focus: document.activeElement && document.activeElement.getAttribute('aria-label') }), delName);
  check('a Delete by key: the question takes focus (Enter there is Cancel), never two of it', kb2.modals.length === 1 && kb2.modals[0] === 'Boards' && kb2.kept && kb2.focus === 'Delete', JSON.stringify(kb2));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  const kb3 = await ev(() => { const ms = document.querySelectorAll('.modal'); const top = ms[ms.length - 1]; return { n: ms.length, inTop: top.contains(document.activeElement), libInert: document.querySelector('.modal-lib').closest('.scrim').inert, label: document.activeElement.textContent }; });
  check('under a question the library is inert and focus is in the question', kb3.n === 2 && kb3.inTop && kb3.libInert && kb3.label === 'Cancel', JSON.stringify(kb3));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check('Tab stays in the question', await ev(() => { const ms = document.querySelectorAll('.modal'); return ms[ms.length - 1].contains(document.activeElement) || document.activeElement === document.body; }));
  await ev(() => { const ms = document.querySelectorAll('.modal'); ms[ms.length - 1].querySelector('footer .btn.danger').focus(); });
  const nBefore = await ev(() => Lull.app.store.state.boards.list.length);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
  const kb4 = await ev((id) => ({ gone: !Lull.app.store.state.boards.list.some((r) => r.id === id), n: Lull.app.store.state.boards.list.length, focus: document.activeElement && document.activeElement.classList.contains('lib-open'), inert: document.querySelector('.modal-lib').closest('.scrim').inert }), delName);
  check('after a Delete, focus is on the nearest row and the library works again', kb4.gone && kb4.n === nBefore - 1 && kb4.focus && !kb4.inert, JSON.stringify(kb4));
  // Renaming, then a real click (held a moment) on another row's Delete or on another board: the click lands.
  const rowsNow = await ev(() => Array.from(document.querySelectorAll('.modal-lib .lib-row')).map((r) => r.dataset.id));
  const clickHeld = async (sel) => {
    const b = await page.$(sel), r = await b.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up();
    await page.waitForTimeout(80);
  };
  await page.click('.modal-lib .lib-row[data-id="' + rowsNow[0] + '"] [aria-label="Rename"]');
  await page.keyboard.press('End');
  await page.keyboard.type(' Two');
  await clickHeld('.modal-lib .lib-row[data-id="' + rowsNow[1] + '"] [aria-label="Delete"]');
  const rc1 = await ev((id) => ({ modals: Array.from(document.querySelectorAll('.modal header .ttl')).map((t) => t.textContent), name: Lull.app.store.state.boards.list.find((r) => r.id === id).name }), rowsNow[0]);
  check('renaming, a click on another row\'s Delete lands (and the name is kept)', rc1.modals.length === 2 && /^Delete /.test(rc1.modals[1]) && / Two$/.test(rc1.name), JSON.stringify(rc1));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.click('.modal-lib .lib-row[data-id="' + rowsNow[0] + '"] [aria-label="Rename"]');
  await clickHeld('.modal-lib .lib-row[data-id="' + rowsNow[1] + '"] [aria-label="Rename"]');
  const rc2 = await ev((id) => { const a = document.activeElement; return { field: !!(a && a.classList.contains('lib-name')), row: a && a.closest('.lib-row') && a.closest('.lib-row').dataset.id === id }; }, rowsNow[1]);
  check('renaming, a click on another row\'s Rename moves the field there', rc2.field && rc2.row, JSON.stringify(rc2));
  await clickHeld('.modal-lib .lib-row[data-id="' + rowsNow[2] + '"] .lib-open');
  const rc3 = await ev((id) => ({ cur: Lull.app.store.state.boards.cur === id, lib: !!document.querySelector('.modal-lib') }), rowsNow[2]);
  check('renaming, a click on another board resumes it', rc3.cur && !rc3.lib, JSON.stringify(rc3));
  // A retired record: Delete, then Cancel, leaves the record open.
  await ev(() => { const m = Lull.app.modes.play; m.game.drop(); m.retire(Lull.app.store.state.boards.cur); m.openLibrary(); });
  await page.click('.modal-lib .lib-tabs [data-k="retired"]');
  await page.click('.modal-lib .lib-row.retired .lib-open');
  await page.click('.modal-retire footer .btn.danger');
  await ev(() => { const ms = document.querySelectorAll('.modal'); const b = [...ms[ms.length - 1].querySelectorAll('footer .btn')].find((x) => x.textContent === 'Cancel'); if (b) b.click(); });
  check('a retired record: Delete then Cancel keeps the record open', await ev(() => !!document.querySelector('.modal-retire') && document.querySelectorAll('.modal').length === 2));
  await page.keyboard.press('Escape');
  await page.click('.modal-lib .lib-tabs [data-k="saved"]');
  // The thumbnails are drawn on whole device pixels, in plain squares.
  const th = await ev(() => { const i = document.querySelector('.modal-lib .lib-thumb'); return { nw: i.naturalWidth, cw: parseFloat(i.style.width), dpr: devicePixelRatio }; });
  check('a thumbnail is on whole device pixels (its image is its size times the scale, exactly)', Math.abs(th.nw - th.cw * th.dpr) < 0.01 && th.nw % 1 === 0, JSON.stringify(th));
  // The actions stay in their columns, with or without Retire.
  const cols = await ev(() => { const xs = (l) => [...document.querySelectorAll('.modal-lib .lib-row [aria-label="' + l + '"]')].map((b) => Math.round(b.getBoundingClientRect().left)); return { rename: [...new Set(xs('Rename'))], del: [...new Set(xs('Delete'))], noRetire: document.querySelectorAll('.modal-lib .lib-acts .ph').length }; });
  check('Rename and Delete line up down the list, a row with no Retire keeping its place', cols.rename.length === 1 && cols.del.length === 1 && cols.noRetire >= 1, JSON.stringify(cols));
  // Small windows: New board still has a name; a long one-word name keeps the close button in the question; rows fit.
  for (const [w, hgt] of [[400, 700], [300, 440]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await page.waitForTimeout(150);
    check(w + '×' + hgt + ' New board has an accessible name', (await page.getByRole('button', { name: 'New board' }).count()) === 1);
    const row = await ev(() => { const rows = [...document.querySelectorAll('.modal-lib .lib-row')]; return { d: rows.every((r) => { const d = r.querySelector('.d'); return d.scrollWidth <= d.clientWidth + 1; }), t: Math.min(...rows.map((r) => r.querySelector('.t').getBoundingClientRect().width)), over: rows.every((r) => r.scrollWidth <= r.clientWidth + 1) }; });
    check(w + '×' + hgt + ' rows fit: tags and numbers inside, the name has room', row.d && row.over && row.t >= 110, JSON.stringify(row));
    await shot('78-library-review-' + w + 'x' + hgt);
    await ev(() => { const B = Lull.app.store.state.boards; Lull.Library.rename(B, Lull.Library.ordered(B)[1].id, 'WWWWWWWWWWWWWWWWWWWWWWWW'); });
    await ev(() => { const B = Lull.app.store.state.boards; Lull.app.modes.play.confirmDelete(Lull.Library.ordered(B)[1].id); });
    await page.waitForTimeout(120);
    const hd = await ev(() => { const ms = document.querySelectorAll('.modal'), top = ms[ms.length - 1], hdr = top.querySelector('header'), x = hdr.querySelector('.x').getBoundingClientRect(), r = top.getBoundingClientRect(); return { fits: hdr.scrollWidth <= hdr.clientWidth + 1, x: x.right <= r.right + 0.5 && x.left >= r.left }; });
    check(w + '×' + hgt + ' a long name in a question wraps; the close button stays in it', hd.fits && hd.x, JSON.stringify(hd));
    await shot('78a-long-name-' + w + 'x' + hgt);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 520, height: 760 });
  // A broken library in the save does not stop the app: bad records are dropped when it is opened.
  const broken = await ev(() => {
    const m = Lull.app.modes.play, B = Lull.app.store.state.boards;
    B.list.push(null, { id: 'bx', game: { w: 10, h: 20 } }); B.retired.push(null, { id: 'by', name: 'Odd' });
    const h = m.openLibrary();
    const out = { saved: document.querySelectorAll('.modal-lib .lib-row').length === B.list.length, list: B.list.every((r) => r && r.id !== 'bx') };
    document.querySelector('.modal-lib .lib-tabs [data-k="retired"]').click();
    out.retired = document.querySelectorAll('.modal-lib .lib-row.retired').length === B.retired.length && B.retired.some((e) => e.id === 'by');
    h.close();
    return out;
  });
  check('a broken library in the save is cleaned when opened; both tabs still list', broken.saved && broken.list && broken.retired, JSON.stringify(broken));
  await ev(() => { for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
  }

  // ---- save and reload ----------------------------------------------------------------------------------------------
  console.log('persistence');
  await ev(() => { Lull.app.modes.puzzle.loadNumbered('E', 1); });
  const pzBefore = await ev(() => JSON.stringify(Lull.app.store.state.puzzle.current && { seed: Lull.app.store.state.puzzle.current.seed, attempts: Lull.app.store.state.puzzle.current.attempts }));
  const snap = await ev(() => { Lull.app.setTab('play'); Lull.app.saveNow(); const s = Lull.app.store.state; return { lines: s.lines, cells: Lull.app.modes.play.game.board.count(), skin: s.equipped.skin, solved: Object.keys(s.puzzle.solved).length }; });
  await page.reload();
  await page.waitForTimeout(400);
  const back = await ev(() => { const s = Lull.app.store.state; return { lines: s.lines, cells: Lull.app.modes.play.game.board.count(), skin: s.equipped.skin, solved: Object.keys(s.puzzle.solved).length, modal: !!document.querySelector('.modal') }; });
  check('progress survives a reload', back.lines === snap.lines && back.cells === snap.cells && back.skin === snap.skin && back.solved === snap.solved, JSON.stringify([snap, back]));
  check('no welcome on the second run', !back.modal);
  const pzAfter = await ev(() => { Lull.app.setTab('puzzle'); const c = Lull.app.store.state.puzzle.current; return JSON.stringify(c && { seed: c.seed, attempts: c.attempts }); });
  check('a puzzle resumed after a reload is the same attempt (first try stays first try)', pzBefore === pzAfter && /"attempts":1/.test(pzAfter), pzBefore + ' → ' + pzAfter);
  // The factory's dot sits out of the tabs' flow: nothing shifts when the bin fills or empties.
  const badgeSteady = await ev(() => {
    const xs = () => Array.from(document.querySelectorAll('.tabs button')).map((b) => Math.round(b.getBoundingClientRect().left)).join();
    const a = xs(); Lull.app.setBadge('factory', true); const b = xs(); Lull.app.setBadge('factory', Lull.Factory.isFull(Lull.app.store.state.factory));
    return a === b;
  });
  check('the factory tab\'s dot never moves the other tabs', badgeSteady);
  // An achievement earned with Lull in the background waits (no chime, no toast) and is told on return.
  const bg = await ev(async () => {
    const S = Lull.app.store.state, keep = document.hasFocus, played = [], play = Lull.Sound.play;
    Lull.Sound.play = function (n) { played.push(n); };
    document.hasFocus = () => false;
    S.stats.days = Math.max(S.stats.days || 0, 30);
    delete S.achievements.lu_days30;
    document.getElementById('toasts').replaceChildren();
    Lull.app.achieve({ mode: 'tick' });
    const away = { toasts: document.querySelectorAll('.toast').length, played: played.length, earned: !!S.achievements.lu_days30 };
    document.hasFocus = keep;
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 600));
    const back = { toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent).join(' | '), played: played.slice() };
    Lull.Sound.play = play;
    return { away, back };
  });
  check('an achievement earned in the background is told on return, not chimed while away', bg.away.earned && bg.away.toasts === 0 && bg.away.played === 0 && /Familiar Face/.test(bg.back.toasts) && bg.back.played.length === 1, JSON.stringify(bg));

  // ---- mute: the top-bar speaker and M, over everything, persisted, leaving the toggles alone -------------------------
  console.log('relaxed announcer');
  {
    await page.click('.tabs button[data-tab="play"]');
    await page.waitForTimeout(100);
    const said = await ev(() => {
      const m = Lull.app.modes.play, A = Lull.Announcer, st = Lull.app.settings, keep = A.say, got = [];
      A.say = (k) => { got.push(k.join(' ')); return true; };
      const clearOne = () => { const g = m.game; g.board.clearRows(g.board.fullRows()); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.board.set(x, y, 0); for (let x = 0; x < g.w - 2; x++) g.board.set(x, 0, 8); g.replacePiece({ id: 'O' }); while (g.move(1)); g.drop(); };
      try {
        st.announcerRelaxed = false; clearOne();
        const off = got.length;
        st.announcerRelaxed = true; clearOne();
        return { off, on: got.slice(off) };
      } finally { A.say = keep; st.announcerRelaxed = false; }
    });
    check('the announcer calls Relaxed clears only when asked to', said.off === 0 && said.on.length > 0, JSON.stringify(said));
  }
  console.log('pointer away');
  {
    const fade = async (type) => { await ev((t) => document.documentElement.dispatchEvent(new MouseEvent(t)), type); await page.waitForTimeout(600); return ev(() => ({ away: document.body.classList.contains('away'), op: getComputedStyle(document.getElementById('app')).opacity, filter: getComputedStyle(document.getElementById('app')).filter })); };
    const out = await fade('mouseleave');
    check('the pointer leaving dims and fades Lull', out.away && +out.op < 0.7 && /brightness/.test(out.filter), JSON.stringify(out));
    const back = await fade('mouseenter');
    check('and it comes back when the pointer does', !back.away && +back.op === 1, JSON.stringify(back));
    await ev(() => { Lull.app.settings.fadeAway = false; Lull.app.applySettings(); });
    check('the fade can be switched off', !(await fade('mouseleave')).away);
    await ev(() => { Lull.app.settings.fadeAway = true; Lull.app.applySettings(); document.body.classList.remove('away'); });
    await ev(() => Lull.fromNative({ type: 'pointer', inside: false }));
    check('the native panel says when the pointer left', await ev(() => document.body.classList.contains('away')));
    await ev(() => Lull.fromNative({ type: 'pointer', inside: true }));
  }
  console.log('mute');
  await page.setViewportSize({ width: 520, height: 760 });
  await ev(() => Lull.app.setTab('play'));
  const barShot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: 0, width: 520, height: 64 } }); };
  const levels = () => ev(() => { const s = Lull.app.settings; return JSON.stringify([s.sound, s.volume, s.music, s.musicVolume, s.announcer, s.announcerVolume, Lull.Sound.enabled, Lull.Sound.volume]); });
  // The context starts on a gesture (a key), as in play; the gain is read once its short ramp has run.
  const muteState = async () => { await page.waitForTimeout(250); return ev(() => { const b = document.getElementById('btn-mute'); return { set: Lull.app.settings.muted, sound: Lull.Sound.muted, gain: Lull.Sound.muteGain ? Math.round(Lull.Sound.muteGain.gain.value * 1000) / 1000 : null, pressed: b.getAttribute('aria-pressed'), cls: b.classList.contains('muted'), title: b.getAttribute('aria-label') + ' (' + b.dataset.tipFoot + ')', tip: b.dataset.tip, ctx: Lull.Sound.ctx && Lull.Sound.ctx.state }; }); };
  await page.keyboard.press('ArrowLeft');
  await ev(() => { Lull.Sound.ensure(); Lull.Sound.play('lock'); });
  const levels0 = await levels();
  const m0 = await muteState();
  check('unmuted to start: speaker shown, gain at 1', !m0.set && m0.pressed === 'false' && !m0.cls && m0.gain === 1 && m0.title === 'Mute (M)', JSON.stringify(m0));
  await barShot('80-topbar-unmuted');
  await page.click('#btn-mute');
  const m1 = await muteState();
  check('the top-bar button mutes: gain ramps to 0, button pressed', m1.set && m1.sound && m1.gain === 0 && m1.pressed === 'true' && m1.cls && m1.title === 'Unmute (M)', JSON.stringify(m1));
  await page.mouse.move(260, 400);
  await barShot('81-topbar-muted');
  await page.keyboard.press('KeyM');
  const m2 = await muteState();
  check('M unmutes: gain back to 1', !m2.set && !m2.sound && m2.gain === 1 && m2.pressed === 'false', JSON.stringify(m2));
  await ev(() => Lull.app.setTab('factory'));
  await page.keyboard.press('KeyM');
  const m3 = await muteState();
  check('M mutes on another tab too', m3.set && m3.gain === 0, JSON.stringify(m3));
  check('muting leaves Sound effects, Classic music, the announcer and every volume as they were', (await levels()) === levels0, levels0);
  await page.click('#btn-settings');
  await page.click('.set-nav button:has-text("Sound")');
  await page.waitForTimeout(60);
  await shot('82-settings-sound-muted');
  check('Settings > Sound shows the mute', await ev(() => document.querySelector('.modal .switch[data-setting="muted"]').getAttribute('aria-checked') === 'true'));
  await page.click('.modal .switch[data-setting="muted"]');
  const m4 = await muteState();
  check('the Settings switch unmutes and the top bar follows', !m4.set && m4.gain === 1 && m4.pressed === 'false', JSON.stringify(m4));
  // M works over an open window too, and the switch in it follows.
  await page.keyboard.press('KeyM');
  const m4b = await muteState();
  check('M with Settings open mutes, and its switch follows', m4b.set && m4b.gain === 0 && await ev(() => document.querySelector('.modal .switch[data-setting="muted"]').getAttribute('aria-checked') === 'true'), JSON.stringify(m4b));
  // Listen while muted says why it is quiet.
  await page.click('.modal .btn:has-text("Listen")');
  check('Listen while muted explains the silence', await ev(() => Array.from(document.querySelectorAll('.toast')).some((t) => /Muted/.test(t.textContent))));
  await page.keyboard.press('KeyM');
  await page.click('.modal .switch[data-setting="muted"]');
  await page.keyboard.press('Escape');
  const m5 = await muteState();
  check('the Settings switch mutes again', m5.set && m5.gain === 0 && m5.pressed === 'true', JSON.stringify(m5));
  check('Escape still closes Settings', !(await page.isVisible('.modal')));
  // An M typed into a text field is just a letter.
  const typed = await ev(() => { const i = document.createElement('input'); document.body.appendChild(i); i.focus(); return true; });
  await page.keyboard.press('KeyM');
  const m5b = await muteState();
  check('M typed into a text field does not toggle mute', typed && m5b.set && await ev(() => { const i = document.querySelector('body > input'); const v = i.value; i.remove(); return v === 'm'; }), JSON.stringify(m5b));
  // Every control in the title bar keeps its size, in order, without overlapping, in the browser and in the app.
  const crowd = [];
  for (const w of [300, 380, 400, 460, 520, 900]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.waitForTimeout(60);
    crowd.push(...await ev((width) => {
      const bar = document.getElementById('titlebar'), bad = [];
      document.getElementById('wallet-n').textContent = '99,999'; // a well-off wallet, whatever this run earned
      // The app's panel is never narrower than 400 px; a browser window can be.
      for (const nat of width >= 400 ? [false, true] : [false]) {
        document.body.classList.toggle('native', nat); document.body.classList.toggle('browser', !nat);
        const els = Array.from(bar.querySelectorAll('.tabs button, #wallet, .icon-btn')).filter((el) => el.offsetParent && getComputedStyle(el).display !== 'none');
        const rs = els.map((el) => el.getBoundingClientRect()), br = bar.getBoundingClientRect();
        const mute = document.getElementById('btn-mute').getBoundingClientRect(), gear = document.getElementById('btn-settings').getBoundingClientRect();
        if (bar.scrollWidth > bar.clientWidth + 1) bad.push(width + (nat ? ' app' : ' browser') + ': overflows');
        if (mute.width < 23.5 || Math.abs(mute.width - gear.width) > 0.5 || mute.right > br.right) bad.push(width + (nat ? ' app' : ' browser') + ': mute squeezed');
        for (let k = 1; k < rs.length; k++) if (rs[k].left < rs[k - 1].right - 0.5) bad.push(width + (nat ? ' app' : ' browser') + ': ' + els[k].id + ' overlaps');
      }
      document.body.classList.remove('native'); document.body.classList.add('browser');
      Lull.app.refreshWallet();
      return bad;
    }, w));
  }
  await page.setViewportSize({ width: 520, height: 760 });
  check('the title bar holds the mute button without crowding (300 to 900 px; the app from its 400 px minimum)', crowd.length === 0, crowd.join('; '));
  // Its order: the places to play in one track, room to drag, the places to look by the wallet, sound, Settings.
  const bar = await ev(() => {
    const ids = (sel) => Array.from(document.querySelectorAll(sel)).map((b) => b.dataset.tab).join();
    const all = Array.from(document.querySelectorAll('#titlebar .tabs button'));
    const xs = all.map((b) => b.getBoundingClientRect().left);
    const kids = Array.from(document.getElementById('titlebar').children).map((e) => e.id || e.className);
    return { wallet: document.getElementById('wallet').dataset.tipFoot, modes: ids('#tabs button'), meta: ids('#tabs-meta button'), feet: all.map((b) => b.dataset.tipFoot).join(), ltr: xs.every((x, i) => !i || x > xs[i - 1]), tips: all.every((b) => b.dataset.tip === b.getAttribute('aria-label') && !b.dataset.tipTitle && !b.title), kids: kids.join() };
  });
  check('title bar: Play, Puzzles, Factory, Classic together; Stats, Achievements by the wallet (the Shop); ⌘1–⌘7 left to right, each in its tooltip',
    bar.modes === 'play,puzzle,factory,classic' && bar.meta === 'stats,achievements' && bar.ltr && bar.tips && bar.feet === '⌘1,⌘2,⌘3,⌘4,⌘5,⌘6' && bar.wallet === '⌘7'
    && /^brand,bar-idle,tabs,spacer,tabs-meta,wallet,tb-sep,btn-mute,btn-settings,tb-sep win,winbtns$/.test(bar.kids), JSON.stringify(bar));
  const shortcut = [];
  for (let n = 1; n <= 7; n++) { await page.keyboard.press('Control+Digit' + n); shortcut.push(await ev(() => { const on = document.querySelector('#titlebar .tabs button[aria-selected="true"], #wallet.active'); return Lull.app.tab + ':' + (on && (on.dataset.tab || on.id)); })); }
  check('⌘1–⌘7 open the tabs (and the Shop, by the wallet) in the order they sit, and light them', shortcut.join() === 'play:play,puzzle:puzzle,factory:factory,classic:classic,stats:stats,achievements:achievements,shop:wallet', shortcut.join());
  // Labels: every play tab named when wide; only the tab you are on when narrower; icons alone when narrow; the bar keeps room to drag.
  const labels = [];
  for (const [w, nat, want] of [[1100, false, 'Play,Puzzles,Factory,Classic|Stats,Achievements'], [900, false, 'Play,Puzzles,Factory,Classic|'], [900, true, 'Play,Puzzles,Factory,Classic|'], [560, false, 'Puzzles|'], [520, true, '|'], [460, false, '|'], [400, true, '|']]) {
    await page.setViewportSize({ width: w, height: 760 });
    await ev(() => Lull.app.setTab('puzzle'));
    const got = await ev((nat) => {
      document.body.classList.toggle('native', nat); document.body.classList.toggle('browser', !nat);
      const shown = (sel) => Array.from(document.querySelectorAll(sel)).filter((l) => l.getBoundingClientRect().width > 0).map((l) => l.textContent).join();
      const sp = document.querySelector('#titlebar .spacer').getBoundingClientRect(), bar = document.getElementById('titlebar');
      const r = { labels: shown('#tabs .lbl') + '|' + shown('#tabs-meta .lbl'), drag: Math.round(sp.width), fits: bar.scrollWidth <= bar.clientWidth + 1 };
      document.body.classList.remove('native'); document.body.classList.add('browser');
      return r;
    }, nat);
    if (got.labels !== want || got.drag < 4 || !got.fits) labels.push(w + (nat ? ' app ' : ' browser ') + JSON.stringify(got));
  }
  await page.setViewportSize({ width: 520, height: 760 });
  await ev(() => Lull.app.setTab('play'));
  check('title bar labels give way as the window narrows (all, then the tab you are on, then icons), always leaving room to drag', labels.length === 0, labels.join('; '));
  await page.hover('#tabs button[data-tab="factory"]');
  await page.waitForTimeout(450);
  const tip = await ev(() => { const t = document.querySelector('.tip'); return t.classList.contains('hidden') ? '' : t.textContent; });
  check('hovering a tab names it and gives its key, nothing more (and nothing reads "null")', /^Factory⌘3$/.test(tip) && !/null/.test(tip), tip);
  await page.hover('#btn-settings');
  await page.waitForTimeout(450);
  const tip2 = await ev(() => { const t = document.querySelector('.tip'); return (t.classList.contains('compact') ? 'compact ' : '') + t.textContent; });
  check('the small buttons get a one-line tooltip with their key', tip2 === 'compact Settings⌘,', tip2);
  if (OUT) await page.screenshot({ path: require('path').join(OUT, '83-topbar-tooltip.png'), clip: { x: 0, y: 0, width: 520, height: 110 } });
  await page.mouse.move(260, 400);

  // ---- the line glyph: one character, in its own font, in the page and on the canvases -------------------------------
  console.log('line glyph');
  const glyph = await ev(async () => {
    await document.fonts.load('12px "Lull Line"', Lull.LINE);
    const probe = (family) => { const s = document.createElement('span'); s.style.cssText = 'position:absolute;font:100px ' + family; s.textContent = Lull.LINE; document.body.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return Math.round(w); };
    const c = document.createElement('canvas').getContext('2d');
    c.font = '100px "Lull Line", ui-monospace, monospace';
    // Every tab's text, tooltips and labels: the line glyph.
    const texts = [];
    for (const t of ['play', 'puzzle', 'factory', 'shop', 'stats', 'achievements']) {
      Lull.app.setTab(t);
      texts.push(document.getElementById('app').innerText);
      for (const el of document.querySelectorAll('[title], [data-tip], [data-tip-title], [data-tip-foot], [aria-label]')) texts.push(el.title, el.dataset.tip, el.dataset.tipTitle, el.dataset.tipFoot, el.getAttribute('aria-label'));
    }
    Lull.app.setTab('play');
    const all = texts.join(' ');
    return { loaded: document.fonts.check('12px "Lull Line"', Lull.LINE), text: probe('var(--font)'), mono: probe('var(--mono-font)'), canvas: Math.round(c.measureText(Lull.LINE).width),
      lines: (all.match(/\u29B5/g) || []).length, wallet: !!document.querySelector('#wallet .lg svg') };
  });
  check('the line glyph\'s font is loaded and draws it in text, monospace and on canvas (one em wide, not a fallback)', glyph.loaded && glyph.text === 100 && glyph.mono === 100 && glyph.canvas === 100, JSON.stringify(glyph));
  check('lines amounts show the line glyph; the wallet draws it large', glyph.lines > 5 && glyph.wallet, JSON.stringify(glyph));
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowLeft');
  await ev(() => { Lull.Sound.ensure(); Lull.Sound.play('lock'); });
  const m6 = await muteState();
  check('mute survives a reload, silent from the first sound', m6.set && m6.sound && m6.gain === 0 && m6.pressed === 'true', JSON.stringify(m6));
  check('and the toggles and volumes are still as they were', (await levels()) === levels0);
  await page.keyboard.press('KeyM');
  const m7 = await muteState();
  check('M after a reload unmutes', !m7.set && m7.gain === 1, JSON.stringify(m7));

  // ---- control hints: a struggling player gets one terse hint, and hints retire ---------------------------------------
  console.log('control hints');
  const hintsSoFar = await ev(() => JSON.parse(JSON.stringify(Lull.app.store.state.hints.shown || {})));
  check('with Control hints off, the scripted run above never raised one', Object.keys(hintsSoFar).length === 0, JSON.stringify(hintsSoFar));
  // The run so far has set hundreds of pieces (past the 300 that retire every hint): start this player afresh.
  const hintState = () => ev(() => { const c = Lull.app.hints, el = document.querySelector('.lhint'); return { over: c.d.over, pending: c.d.pending && c.d.pending.id, shown: !!(el && el.classList.contains('show')), id: el && el.dataset.hint, text: el ? el.textContent : '', keys: el ? Array.from(el.querySelectorAll('kbd')).map((k) => k.textContent) : [], hs: JSON.parse(JSON.stringify(Lull.app.store.state.hints)) }; });
  const hintReset = (keep) => ev((k) => { const st = Lull.app.store.state; if (!k) st.hints = Lull.Hints.fresh(); st.settings.hints = true; const c = Lull.app.hints; c.hide(); c.sync(); c.d.lastAt = -Infinity; c.d.lastBy = {}; c.d.pending = null; }, keep);
  await hintReset();
  await page.click('.tabs button[data-tab="puzzle"]');
  const flipSeed = await ev(() => { for (let n = 1; n < 400; n++) for (const d of ['E', 'M', 'H']) { const s = Lull.Puzzles.numberedSeed(d, n), p = Lull.Puzzles.generate(s); if (p.mods.includes('flip') && !p.mods.some((m) => m === 'invert' || m === 'rigid' || m === 'side')) return s; } return null; });
  await ev((s) => Lull.app.modes.puzzle.load(s, {}), flipSeed);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(100);
  // On an Upside Down board Up lowers (toward the floor, at the top of the screen): a player pressing it to turn.
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(120); }
  let hs1 = await hintState();
  check('two presses of Up are not yet struggling', !hs1.shown && !hs1.pending, JSON.stringify(hs1));
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
  hs1 = await hintState();
  check('a third Up on an Upside Down puzzle shows the arrow that turns there: ↓ turns', hs1.shown && hs1.id === 'turnArrow' && hs1.keys.join() === '↓' && hs1.text === '↓turns' && hs1.hs.shown.turnArrow === 1, JSON.stringify(hs1));
  const pill = await ev(() => { const r = document.querySelector('.lhint').getBoundingClientRect(), c = Lull.app.modes.puzzle.canvas.getBoundingClientRect(); return { inside: r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom, h: r.height, n: document.querySelectorAll('.lhint').length }; });
  check('one small pill, on the board', pill.inside && pill.h < 30 && pill.n === 1, JSON.stringify(pill));
  await page.waitForTimeout(400);
  await shot('70-hint');
  await page.waitForTimeout(Math.max(0, (await ev(() => Lull.Hints.SHOW_MS))) + 200);
  check('it fades after a few seconds', !(await hintState()).shown);
  // More of the same right away: rate-limited, nothing new.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  check('never again straight away', !(await hintState()).shown);
  // Keys that do nothing (WASD) on the board: the arrows.
  await hintReset(true);
  for (const k of ['KeyW', 'KeyW', 'KeyD', 'KeyS']) await page.keyboard.press(k); // WASD, where A turns and W, S, D do nothing
  await page.waitForTimeout(200);
  const hk = await hintState();
  check('four keys that do nothing: the arrows that move and turn, in this board\'s directions', hk.shown && hk.id === 'keys' && hk.keys.join() === '→,←,↓' && /move/.test(hk.text) && /turns/.test(hk.text), JSON.stringify(hk));
  // Turning with the arrow that turns, a few times: that hint is retired for good.
  await hintReset(true);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(40); }
  const skill = await hintState();
  check('four turns on a turned board retire its hint', skill.hs.retired.turnArrow === true && skill.hs.skill.turnArrow >= 4, JSON.stringify(skill.hs));
  await ev(() => Lull.app.modes.puzzle.retry());
  for (let i = 0; i < 4; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(60); }
  await page.waitForTimeout(150);
  const gone = await hintState();
  check('and it never comes back', !gone.shown && !gone.pending, JSON.stringify(gone));
  // A mouse player: the same kind of hint in the mouse's own words.
  await hintReset(true);
  const mouseHint = await ev(() => { const m = Lull.app.modes.puzzle, c = Lull.app.hints; m.lastInput = 'mouse'; c.d.raise('lower', null, performance.now()); return new Promise((r) => setTimeout(() => { const el = document.querySelector('.lhint'); r(el.classList.contains('show') ? el.textContent : ''); m.lastInput = 'key'; }, 150)); });
  check('with the mouse, words for the mouse (no key caps)', mouseHint === 'Wheel lowers', mouseHint);
  // 300 pieces set: every hint stops for good, and stays stopped after a reload.
  await hintReset(true);
  await ev(() => { Lull.app.store.state.hints.pieces = Lull.Hints.RETIRE_PIECES - 1; Lull.app.hints.sync(); });
  await ev(() => Lull.app.modes.puzzle.retry());
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  for (const k of ['KeyW', 'KeyD', 'KeyS', 'KeyW']) await page.keyboard.press(k);
  await page.waitForTimeout(150);
  const done = await hintState();
  check('after 300 pieces every hint is retired: keys that do nothing get no hint', done.over && done.hs.over && !done.shown && !done.pending, JSON.stringify(done));
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(400);
  check('retired hints stay retired after a reload', await ev(() => Lull.app.store.state.hints.over === true && Lull.app.hints.d.over));
  // Settings ▸ Controls has one quiet switch for them.
  await ev(() => Lull.UI.openSettings(Lull.app, 'controls'));
  await page.waitForTimeout(150);
  check('Settings ▸ Controls: a Control hints switch, on', await ev(() => { const sw = document.querySelector('.switch[data-setting="hints"]'); return !!sw && sw.getAttribute('aria-checked') === 'true' && /Control hints/.test(sw.closest('.set-row').textContent); }));
  await ev(() => Lull.UI.closeTopModal());

  // ---- collapsed into the title bar ---------------------------------------------------------------------------------
  console.log('collapse');
  {
    await page.setViewportSize({ width: 520, height: 760 });
    await ev(() => { Lull.app.settings.motion = 'full'; Lull.app.setTab('play'); });
    await page.mouse.move(260, 400);
    const col = () => ev(() => {
      const app = document.getElementById('app').getBoundingClientRect(), bar = document.getElementById('titlebar');
      const cv = document.getElementById('bar-idle').getBoundingClientRect(), btn = document.getElementById('btn-collapse').getBoundingClientRect();
      const shown = Array.from(bar.querySelectorAll('*')).filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && !e.closest('svg') && e.id !== 'winbtns').map((e) => e.id || e.className);
      const b = document.getElementById('btn-collapse');
      return { on: document.body.classList.contains('collapsed') && Lull.Collapse.on, saved: Lull.app.state.collapsed, h: app.height, main: document.getElementById('main').getClientRects().length, shown: shown.join(), label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded'), cvLeft: cv.left - app.left, cvGap: btn.left - cv.right, btnRight: app.right - btn.right, tab: Lull.app.tab };
    });
    await page.click('#btn-collapse');
    await page.waitForTimeout(100);
    const c1 = await col();
    check('the chevron rolls the window up into its title bar: nothing below it, only the pieces and the expand button', c1.on && c1.saved === true && c1.h >= 40 && c1.h <= 44 && c1.main === 0 && c1.shown === 'bar-idle,btn-collapse' && c1.label === 'Expand' && c1.expanded === 'false', JSON.stringify(c1));
    check('the idle canvas spans the bar up to the expand button, which stays at the right', c1.cvLeft < 3 && c1.cvGap >= 0 && c1.cvGap < 8 && c1.btnRight < 12, JSON.stringify(c1));
    const pix = () => ev(() => document.getElementById('bar-idle').toDataURL());
    const f0 = await ev(() => Lull.Collapse.idle.frames), p0 = await pix();
    await page.waitForTimeout(400);
    const f1 = await ev(() => Lull.Collapse.idle.frames), p1 = await pix();
    check('pieces drift along the bar (about 30 fps, not faster)', p0 !== p1 && f1 - f0 >= 6 && f1 - f0 <= 16, (f1 - f0) + ' frames');
    const cells = await ev(() => Lull.Collapse.idle.pieces.length);
    check('in the equipped look, a few pieces along the bar', cells >= 3, String(cells));
    // Walk the march on by hand for two minutes of bar time and watch every step.
    const march = await ev(() => {
      const i = Lull.Collapse.idle, P = Lull.Pieces, bad = [];
      // A fixed seed: the march is random, and a rare one ends with a piece turning at the edge (not a landing).
      i.seed = 7919; i.reset(i.cols);
      const snap = () => new Map(i.pieces.map((p) => [p.n, { id: p.id, rot: p.rot, x: p.x, y: p.y, lo: i.span(p).lo }]));
      let prev = snap(), maxN = 0, minN = 99, turns = 0, nudges = 0, steps = 0, exits = 0, lastLo = [];
      const ex0 = i.exited;
      for (let f = 0; f < 120 * 30; f++) {
        i.step(1 / 30);
        const now = snap();
        maxN = Math.max(maxN, now.size); minN = Math.min(minN, now.size);
        const seen = new Set();
        for (const p of i.pieces) {
          const cells = i.cellsOf(p);
          if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) bad.push('not on the grid ' + p.id);
          if (!P.get(p.id).rots[p.rot]) bad.push('no such rotation');
          for (const [x, y] of cells) {
            if (y < 0 || y >= 4) bad.push('out of the lanes ' + p.id + ' ' + y);
            const k = x + ',' + y;
            if (seen.has(k)) bad.push('overlap at ' + k);
            seen.add(k);
          }
          const was = prev.get(p.n);
          if (!was) continue;
          const dx = p.x - was.x, dy = p.y - was.y;
          if (p.rot !== was.rot) {
            turns++;
            const d = (p.rot - was.rot + 4) % 4;
            const kicks = P.kicksFor(P.get(p.id), was.rot, p.rot);
            if (d === 2 || !kicks.some(([kx, ky]) => kx === dx && ky === dy)) bad.push('turn off its SRS centre ' + p.id + ' ' + was.rot + '>' + p.rot + ' ' + dx + ',' + dy);
          } else if (dx || dy) {
            if (!((dx === 1 && dy === 0) || (dx === 0 && Math.abs(dy) === 1))) bad.push('not one cell ' + dx + ',' + dy);
            if (dx) steps++; else nudges++;
          }
        }
        for (const [n, w] of prev) if (!now.has(n)) { exits++; lastLo.push(w.lo); }
        prev = now;
      }
      return { bad: bad.slice(0, 5), maxN, minN, turns, nudges, steps, exits, exited: i.exited - ex0, cols: i.cols, gone: lastLo.every((lo) => lo >= i.cols - 2), keys: Object.keys(i).filter((k) => /grid|stack|flying/.test(k)) };
    });
    check('the pieces step right a whole cell at a time, turn on the game\'s SRS centre and kicks, shift a lane now and then, and never touch', march.bad.length === 0 && march.steps > 200 && march.turns > 10 && march.nudges > 5, JSON.stringify(march));
    check('none of them land or stack: each walks off the right edge and more come, a few at a time', march.exits > 20 && march.exited === march.exits && march.gone && march.minN >= 2 && march.maxN <= Math.ceil(march.cols / 4) && march.keys.length === 0, JSON.stringify(march));
    for (const theme of ['dark', 'light']) {
      await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
      for (const w of [520, 900]) {
        await page.setViewportSize({ width: w, height: 760 });
        await page.waitForTimeout(250);
        if (OUT) await page.screenshot({ path: path.join(OUT, '95-collapsed-' + theme + '-' + w + '.png'), clip: { x: 0, y: 0, width: w, height: 70 } });
      }
    }
    await ev(() => { Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); });
    await page.setViewportSize({ width: 520, height: 760 });
    // Keys for the game do nothing while rolled up.
    const g0 = await ev(() => { const g = Lull.app.modes.play.game; return JSON.stringify([g.piece && g.piece.x, g.piece && g.piece.y, g.piece && g.piece.rot, g.s.pieces, g.board.count()]); });
    for (const k of ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space', 'KeyC']) await page.keyboard.press(k);
    const g1 = await ev(() => { const g = Lull.app.modes.play.game; return JSON.stringify([g.piece && g.piece.x, g.piece && g.piece.y, g.piece && g.piece.rot, g.s.pieces, g.board.count()]); });
    check('game keys are ignored while collapsed', g0 === g1, g0 + ' → ' + g1);
    await page.click('#bar-idle');
    check('a click on the bar does not expand it (it drags the window in the app)', (await col()).on);
    await page.dblclick('#bar-idle');
    const c2 = await col();
    check('a double-click on the bar expands it, back to the same tab', !c2.on && c2.saved === false && c2.h > 700 && c2.main === 1 && c2.tab === 'play' && c2.label === 'Collapse' && c2.expanded === 'true', JSON.stringify(c2));
    await page.dblclick('#titlebar .spacer');
    check('a double-click on the empty bar collapses it', (await col()).on);
    await page.dblclick('#bar-idle');
    await page.dblclick('#tabs button[data-tab="play"]');
    check('a double-click on a button is only clicks', !(await col()).on);
    await page.keyboard.press('Control+KeyJ');
    const k1 = (await col()).on;
    await page.keyboard.press('Control+KeyJ');
    check('⌘J collapses and expands, and says so in its tooltip', k1 && !(await col()).on && await ev(() => document.getElementById('btn-collapse').dataset.tipFoot === '⌘J'));
    // Classic pauses (like leaving its tab) and its music stops; expanding leaves it paused where it was.
    await ev(() => Lull.app.setTab('classic'));
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    const cl0 = await ev(() => ({ run: Lull.app.modes.classic.running(), music: Lull.Music.playing }));
    await page.keyboard.press('Control+KeyJ');
    await page.waitForTimeout(300);
    const cl1 = await ev(() => ({ paused: Lull.app.modes.classic.paused, music: Lull.Music.playing, y: Lull.app.modes.classic.game.piece.y }));
    await page.waitForTimeout(600);
    const y2 = await ev(() => Lull.app.modes.classic.game.piece.y);
    await page.keyboard.press('Control+KeyJ');
    await page.waitForTimeout(100);
    const cl2 = await ev(() => ({ tab: Lull.app.tab, paused: Lull.app.modes.classic.paused, view: document.getElementById('view-classic').classList.contains('active') }));
    check('collapsing pauses Classic and stops its music; expanding returns to it, still paused', cl0.run && cl1.paused && !cl1.music && y2 === cl1.y && cl2.tab === 'classic' && cl2.paused && cl2.view, JSON.stringify([cl0, cl1, y2, cl2]));
    // The factory runs on unseen, and its floor comes back.
    await ev(() => Lull.app.setTab('factory'));
    await page.keyboard.press('Control+KeyJ');
    const fa1 = await ev(() => Lull.app.modes.factory.visible);
    await page.keyboard.press('Control+KeyJ');
    check('the factory runs on unseen while collapsed, and its floor comes back', fa1 === false && await ev(() => Lull.app.modes.factory.visible && Lull.app.tab === 'factory'));
    // A tab's shortcut rolls the window down first.
    await page.keyboard.press('Control+KeyJ');
    await page.keyboard.press('Control+Digit2');
    check('⌘2 while collapsed expands onto Puzzles', await ev(() => !Lull.Collapse.on && Lull.app.tab === 'puzzle'));
    // Reduced motion: the bar holds still.
    await ev(() => { Lull.app.settings.motion = 'reduced'; });
    await page.keyboard.press('Control+KeyJ');
    await page.waitForTimeout(100);
    const r0 = await pix();
    await page.waitForTimeout(300);
    check('with reduced motion the pieces hold still', r0 === await pix());
    await ev(() => { Lull.app.settings.motion = 'full'; });
    // Collapsed is saved, and so is the tab under it.
    await ev(() => Lull.app.saveNow());
    await page.reload();
    await page.waitForTimeout(400);
    const re = await col();
    check('collapsed survives a reload', re.on && re.h <= 44 && re.tab === 'puzzle', JSON.stringify(re));
    await page.click('#btn-collapse');
    await ev(() => Lull.app.saveNow());
    await page.reload();
    await page.waitForTimeout(400);
    const re2 = await col();
    check('and so does expanded', !re2.on && re2.h > 700 && re2.tab === 'puzzle', JSON.stringify(re2));
  }

  // ---- achievements: a toast opens its achievement; Recent goes to the latest -----------------------------------------
  console.log('achievement toasts and Recent');
  {
    await page.setViewportSize({ width: 520, height: 760 });
    const theme0 = await ev(() => Lull.app.settings.theme), mouse0 = await ev(() => Lull.app.settings.mouse);
    // Mouse control off at first (with it on, a toast over a live board waits for the pointer to rest: tried below).
    await ev(() => { Lull.app.settings.mouse = false; Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); if (Lull.Collapse.on) Lull.Collapse.set(false); });
    // Earn one on the Play tab, with the list set against it: the To do filter, every group folded, scrolled to the top.
    const earn = (id, stay) => ev(([id, stay]) => {
      const app = Lull.app, S = app.store.state;
      if (!stay) app.setTab('play');
      document.getElementById('toasts').replaceChildren();
      app.achFilter = 'left'; app.achOpen = {};
      S.stats.days = Math.max(S.stats.days || 0, 30);
      delete S.achievements[id];
      app.achieve({ mode: 'tick' });
      const t = document.querySelector('.toast');
      return { earned: !!S.achievements[id], n: document.querySelectorAll('.toast').length, text: t && t.textContent, role: t && t.getAttribute('role'), tab: t && t.getAttribute('tabindex'), label: t && t.getAttribute('aria-label'),
        cursor: t && getComputedStyle(t).cursor, events: t && getComputedStyle(t).pointerEvents };
    }, [id, !!stay]);
    const t1 = await earn('lu_days30');
    check('an achievement\'s toast is a button: role, focusable, labelled, pointer cursor, takes the pointer', t1.earned && t1.n === 1 && /Familiar Face/.test(t1.text) && t1.role === 'button' && t1.tab === '0' && /Familiar Face/.test(t1.label) && t1.cursor === 'pointer' && t1.events === 'auto', JSON.stringify(t1));
    const bg0 = await ev(() => getComputedStyle(document.querySelector('.toast.link')).backgroundColor);
    const tb = await page.locator('.toast.link').boundingBox();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.waitForTimeout(220);
    const hov = await ev(() => { const t = document.querySelector('.toast.link'); return { bg: getComputedStyle(t).backgroundColor, lift: getComputedStyle(t).transform }; });
    check('pointed at, the toast lifts and lightens', hov.bg !== bg0 && hov.lift !== 'none', JSON.stringify({ bg0, hov }));
    await shot('52-ach-toast-hover');
    await page.waitForTimeout(3400);
    check('pointed at, it stays past its time', await ev(() => !!document.querySelector('.toast.link:not(.out)')));
    await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.waitForTimeout(700);
    const seen = () => ev(() => {
      const app = Lull.app, body = document.getElementById('ach-body'), row = document.querySelector('.ach.flash');
      const b = body.getBoundingClientRect(), r = row ? row.getBoundingClientRect() : null;
      return { tab: app.tab, active: document.getElementById('view-achievements').classList.contains('active'), filter: app.achFilter, id: row && row.dataset.id,
        open: row ? row.closest('.ach-group').open : false, inView: !!r && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5, scrolled: body.scrollTop > 0,
        page: document.scrollingElement.scrollTop === 0 && document.getElementById('app').scrollTop === 0 && document.getElementById('main').scrollTop === 0,
        toasts: document.querySelectorAll('.toast').length, glow: row ? getComputedStyle(row, '::after').content !== 'none' : false, menu: !!document.querySelector('.ach-menu') };
    });
    const j1 = await seen();
    check('clicking it opens the Achievements tab on that one: filter shows it, its group open, scrolled into the list (not the window), lit', j1.tab === 'achievements' && j1.active && j1.filter === 'all' && j1.id === 'lu_days30' && j1.open && j1.inView && j1.scrolled && j1.page && j1.glow, JSON.stringify(j1));
    check('and the toast is gone', j1.toasts === 0, JSON.stringify(j1));
    await shot('53-ach-jumped');
    await page.waitForTimeout(3000);
    check('the light fades after a moment', await ev(() => !document.querySelector('.ach.flash')));
    // The Earned filter already shows an earned one: it is kept.
    await ev(() => { Lull.app.achFilter = 'got'; Lull.UI.showAchievement(Lull.app, 'lu_days30'); });
    check('a filter that already shows it is kept', await ev(() => Lull.app.achFilter === 'got' && !!document.querySelector('.ach.flash[data-id="lu_days30"]')));
    // Keyboard: focus the toast, Enter opens it; the key never reaches the board.
    const t2 = await earn('lu_days30');
    const pieces = await ev(() => { document.querySelector('.toast.link').focus(); return Lull.app.modes.play.game.s.pieces; });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const j2 = await seen();
    check('Enter on a focused toast opens it the same way (and sets no piece)', t2.earned && j2.tab === 'achievements' && j2.id === 'lu_days30' && j2.inView && j2.open && (await ev(() => Lull.app.modes.play.game.s.pieces)) === pieces, JSON.stringify(j2));
    // Reduced motion: a still light, and no smooth scroll.
    await ev(() => { Lull.app.settings.motion = 'reduced'; Lull.UI.showAchievement(Lull.app, 'quad'); });
    const still = await ev(() => { const r = document.querySelector('.ach.flash'); return { id: r && r.dataset.id, still: r && r.classList.contains('still'), anim: r && getComputedStyle(r, '::after').animationName, op: r && getComputedStyle(r, '::after').opacity }; });
    check('reduced motion: the row is lit, still', still.id === 'quad' && still.still && still.op === '1', JSON.stringify(still));
    await ev(() => { Lull.app.settings.motion = 'full'; });
    // Other toasts stay plain notes.
    const plain = await ev(() => { document.getElementById('toasts').replaceChildren(); Lull.UI.toast('Copied', 'good', 1200); const t = document.querySelector('.toast'); return { role: t.getAttribute('role'), tab: t.getAttribute('tabindex'), link: t.classList.contains('link'), events: getComputedStyle(t).pointerEvents }; });
    check('other toasts are not clickable', !plain.role && !plain.tab && !plain.link && plain.events === 'none', JSON.stringify(plain));
    // Many from away: one toast, to Recent.
    const many = await ev(() => {
      const app = Lull.app, S = app.store.state, ids = ['quad', 'tsd', 'combo5', 'lines150'], now = Date.now();
      ids.forEach((id, i) => { S.achievements[id] = now - 60000 * (ids.length - i); });
      app.setTab('play');
      document.getElementById('toasts').replaceChildren();
      app.announce(ids.map((id) => Lull.Achievements.LIST.find((a) => a.id === id)), true);
      const t = document.querySelectorAll('.toast');
      return { n: t.length, text: t[0] && t[0].textContent, link: t[0] && t[0].getAttribute('role') === 'button' };
    });
    check('many from away: one toast, clickable', many.n === 1 && /4 achievements while you were away/.test(many.text) && many.link, JSON.stringify(many));
    await page.click('.toast.link');
    await page.waitForTimeout(500);
    const rc = await ev(() => ({ tab: Lull.app.tab, menu: !!document.querySelector('.ach-menu'), top: document.getElementById('ach-body').scrollTop, focus: document.activeElement && document.activeElement.getAttribute('role'), toasts: document.querySelectorAll('.toast').length }));
    check('clicking it opens the tab at Recent, the list open', rc.tab === 'achievements' && rc.menu && rc.top === 0 && rc.focus === 'menuitem' && rc.toasts === 0, JSON.stringify(rc));
    await page.keyboard.press('Escape');
    check('Esc closes the Recent list (and nothing else)', await ev(() => !document.querySelector('.ach-menu') && Lull.app.tab === 'achievements' && document.activeElement.classList.contains('ach-recent-more')));
    // Recent: the latest earned, and the last few newest first.
    const want = await ev(() => {
      const S = Lull.app.store.state, now = Date.now(), ids = ['pc', 'quad', 'tsd', 'combo5', 'lines150', 'lu_days30', 'mini2'];
      for (const id of Object.keys(S.achievements)) S.achievements[id] = now - 400 * 86400e3;
      ids.forEach((id, i) => { S.achievements[id] = now - 3600e3 * (ids.length - i); });
      Lull.app.achMenu = false; Lull.app.achFilter = 'all'; Lull.app.achOpen = {};
      Lull.UI.renderAchievements(Lull.app);
      document.getElementById('ach-body').scrollTop = 0;
      return ids.slice().reverse().map((id) => Lull.Achievements.LIST.find((a) => a.id === id).name);
    });
    const ctl = await ev(() => { const c = document.querySelector('.ach-recent'), s = document.querySelector('.ach-tools .seg'); return { name: c.querySelector('.ach-recent-go').textContent, left: c.getBoundingClientRect().right <= s.getBoundingClientRect().left, first: c.parentElement.firstElementChild === c }; });
    check('Recent sits left of the filter, showing the latest earned', ctl.left && ctl.first && ctl.name.startsWith(want[0]), JSON.stringify(ctl));
    await page.click('.ach-recent-go');
    await page.waitForTimeout(700);
    const j3 = await seen();
    check('it goes to the latest', j3.id === 'mini2' && j3.inView && j3.open, JSON.stringify(j3));
    await ev(() => { document.getElementById('ach-body').scrollTop = 0; });
    await page.waitForTimeout(100);
    await page.click('.ach-recent-more');
    await page.waitForTimeout(200);
    const list = await ev(() => ({ names: Array.from(document.querySelectorAll('.ach-menu [role="menuitem"] .nm')).map((n) => n.textContent), ago: Array.from(document.querySelectorAll('.ach-menu .ago')).map((n) => n.textContent), expanded: document.querySelector('.ach-recent-more').getAttribute('aria-expanded') }));
    check('its list: the last six, newest first, with how long ago', list.names.join() === want.slice(0, 6).join() && list.ago.join() === '1 h,2 h,3 h,4 h,5 h,6 h' && list.expanded === 'true', JSON.stringify({ list, want }));
    await shot('54-ach-recent-520-dark');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const j4 = await seen();
    check('arrows and Enter in the list go to that one', j4.id === 'lines150' && j4.inView && !j4.menu, JSON.stringify(j4));
    await page.click('.ach-recent-more');
    await page.mouse.click(400, 700);
    check('a click elsewhere closes the list', await ev(() => !document.querySelector('.ach-menu')));
    // It fits: 520×760 (dark and light), 400×700, where the name gives way to "Latest", and a 300 px browser, where the
    // star alone is left.
    for (const [w, hgt, theme] of [[520, 760, 'dark'], [520, 760, 'light'], [400, 700, 'dark'], [400, 700, 'light'], [300, 440, 'dark'], [300, 440, 'light']]) {
      await page.setViewportSize({ width: w, height: hgt });
      await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); Lull.app.achMenu = false; Lull.UI.renderAchievements(Lull.app); document.getElementById('ach-body').scrollTop = 0; }, theme);
      await page.waitForTimeout(80);
      await shot('55-ach-tools-' + w + 'x' + hgt + '-' + theme);
      await page.click('.ach-recent-more');
      await page.waitForTimeout(200);
      const fit = await ev(() => {
        const tools = document.querySelector('.ach-tools'), c = document.querySelector('.ach-recent'), s = document.querySelector('.ach-tools .seg'), m = document.querySelector('.ach-menu'), body = document.getElementById('ach-body');
        const cr = c.getBoundingClientRect(), sr = s.getBoundingClientRect(), mr = m.getBoundingClientRect(), br = body.getBoundingClientRect();
        const nm = c.querySelector('.ach-recent-go .nm'), sh = c.querySelector('.ach-recent-go .short');
        const inside = Array.from(c.querySelectorAll(':scope > button')).every((b) => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().right <= cr.right + 0.5);
        return { tools: tools.scrollWidth <= tools.clientWidth + 1, apart: cr.right <= sr.left, inside, oneLine: Math.abs(cr.height - sr.height) < 1, menuIn: mr.left >= br.left && mr.right <= br.right,
          page: document.documentElement.scrollWidth <= innerWidth + 1, label: getComputedStyle(nm).display !== 'none' ? nm.textContent : getComputedStyle(sh).display !== 'none' ? sh.textContent : '', rows: Array.from(m.querySelectorAll('[role="menuitem"]')).every((b) => b.scrollWidth <= b.clientWidth + 1) };
      });
      check(w + '×' + hgt + ' ' + theme + ': Recent and the filter share one row; its list fits', fit.tools && fit.apart && fit.inside && fit.oneLine && fit.menuIn && fit.page && fit.rows && (w < 380 ? fit.label === '' : w < 480 ? fit.label === 'Latest' : fit.label === want[0]), JSON.stringify(fit));
      await shot('55-ach-recent-' + w + 'x' + hgt + '-' + theme);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 520, height: 760 });
    await ev(() => { Lull.app.settings.theme = 'light'; Lull.app.applySettings(); Lull.UI.showAchievement(Lull.app, 'mini2'); });
    await page.waitForTimeout(700);
    await shot('56-ach-jumped-light');
    // Nothing earned: no Recent.
    const none = await ev(() => { const S = Lull.app.store.state, keep = S.achievements; S.achievements = {}; Lull.UI.renderAchievements(Lull.app); const r = !document.querySelector('.ach-recent') && !!document.querySelector('.ach-tools .seg'); S.achievements = keep; Lull.UI.renderAchievements(Lull.app); return r; });
    check('with nothing earned, Recent is not shown', none);
    // Earned while the Recent list is open (the minute check): the list is drawn again, and focus stays in it.
    await ev(() => { Lull.app.achMenu = false; Lull.UI.renderAchievements(Lull.app); });
    await page.click('.ach-recent-more');
    await page.waitForTimeout(150);
    const kept = await ev(() => {
      const app = Lull.app, S = app.store.state;
      document.getElementById('toasts').replaceChildren();
      S.stats.days = Math.max(S.stats.days || 0, 30);
      delete S.achievements.lu_days30;
      app.achieve({ mode: 'tick' });
      const f = document.activeElement;
      return { earned: !!S.achievements.lu_days30, menu: !!document.querySelector('.ach-menu'), role: f && f.getAttribute('role'), first: f && f.dataset.id };
    });
    await page.keyboard.press('ArrowDown');
    const moved = await ev(() => document.activeElement && document.activeElement.getAttribute('role') === 'menuitem' && document.activeElement !== document.querySelector('.ach-menu [role="menuitem"]'));
    check('one earned while the Recent list is open: focus stays in the list, arrows still move', kept.earned && kept.menu && kept.role === 'menuitem' && moved, JSON.stringify({ kept, moved }));
    await page.keyboard.press('Escape');
    // With mouse control, a click on the board where a toast sits sets a piece (the toast lets it through), and the tab stays.
    await ev(() => { const app = Lull.app; app.settings.mouse = true; document.getElementById('toasts').replaceChildren(); app.setTab('play'); app.focusedAt = -1e9; app.modes.play.setGrace = 0; });
    await page.waitForTimeout(200);
    const cv = await page.locator('#view-play canvas').first().boundingBox();
    await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
    await ev(() => { const app = Lull.app; app.store.state.achievements.quad = Date.now(); app.announce([Lull.Achievements.LIST.find((a) => a.id === 'quad')]); });
    const mt = await page.locator('.toast.link').boundingBox();
    const p0 = await ev(() => Lull.app.modes.play.game.s.pieces);
    await page.mouse.move(mt.x + mt.width / 2, mt.y + mt.height / 2, { steps: 4 });
    const under = await ev(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.tagName; }, [mt.x + mt.width / 2, mt.y + mt.height / 2]);
    await page.mouse.click(mt.x + mt.width / 2, mt.y + mt.height / 2);
    await page.waitForTimeout(250);
    const mc = await ev(() => ({ pieces: Lull.app.modes.play.game.s.pieces, tab: Lull.app.tab }));
    check('mouse control: a click on the board under a toast (on the way) sets a piece, and the tab stays', under === 'CANVAS' && mc.pieces === p0 + 1 && mc.tab === 'play', JSON.stringify({ under, p0, mc }));
    // Rested on a moment, it is the toast's: it lifts, and a click opens it.
    await page.mouse.move(mt.x + mt.width / 2 + 3, mt.y + mt.height / 2);
    await page.waitForTimeout(450);
    await page.mouse.move(mt.x + mt.width / 2 + 4, mt.y + mt.height / 2);
    const armed = await ev(([x, y]) => { const e = document.elementFromPoint(x, y), t = document.querySelector('.toast.link'); return { under: e && e.closest('.toast') ? 'TOAST' : e && e.tagName, hover: !!t && t.matches(':hover') }; }, [mt.x + mt.width / 2 + 4, mt.y + mt.height / 2]);
    await page.mouse.click(mt.x + mt.width / 2 + 4, mt.y + mt.height / 2);
    await page.waitForTimeout(300);
    const mo = await ev(() => ({ tab: Lull.app.tab, pieces: Lull.app.modes.play.game.s.pieces, id: (document.querySelector('.ach.flash') || {}).dataset?.id }));
    check('rested on a moment, the toast takes the click: opens it, no piece set', armed.under === 'TOAST' && armed.hover && mo.tab === 'achievements' && mo.id === 'quad' && mo.pieces === mc.pieces, JSON.stringify({ armed, mo }));
    // Keys can always open it.
    await ev(() => { const app = Lull.app; app.setTab('play'); app.store.state.achievements.quad = Date.now(); app.announce([Lull.Achievements.LIST.find((a) => a.id === 'quad')]); document.querySelector('.toast.link').focus(); });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check('and Enter on it opens it', await ev(() => Lull.app.tab === 'achievements' && !!document.querySelector('.ach.flash[data-id="quad"]')));
    await ev(() => { Lull.app.settings.mouse = false; document.getElementById('toasts').replaceChildren(); Lull.app.setTab('play'); });
    // A dialog open: the toast lets clicks through to it, and never jumps behind it.
    await ev(() => { Lull.app.openSettings(); const app = Lull.app; app.store.state.achievements.quad = Date.now(); app.announce([Lull.Achievements.LIST.find((a) => a.id === 'quad')]); });
    await page.waitForTimeout(100);
    const dt = await page.locator('.toast.link').boundingBox();
    await page.mouse.move(dt.x + dt.width / 2, dt.y + dt.height / 2, { steps: 3 });
    const dlg = await ev(([x, y]) => { const e = document.elementFromPoint(x, y); return { events: getComputedStyle(document.querySelector('.toast.link')).pointerEvents, inModal: !!(e && e.closest('.scrim')) }; }, [dt.x + dt.width / 2, dt.y + dt.height / 2]);
    await page.mouse.click(dt.x + dt.width / 2, dt.y + dt.height / 2);
    await page.waitForTimeout(200);
    const dl2 = await ev(() => ({ tab: Lull.app.tab, modal: Lull.UI.modalOpen() }));
    check('a dialog open: the toast lets the click through to it; no jump behind it', dlg.events === 'none' && dlg.inModal && dl2.tab === 'play', JSON.stringify({ dlg, dl2 }));
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); document.getElementById('toasts').replaceChildren(); });
    // A pointer resting where a toast appears holds it at most twice its time; one fading out lets clicks through.
    await ev(() => { Lull.UI.toast('Probe', 'good', 600, 'starOn', { onClick: () => {} }); });
    const pt = await page.locator('.toast.link').boundingBox();
    await ev(() => document.getElementById('toasts').replaceChildren());
    await page.mouse.move(pt.x + pt.width / 2, pt.y + pt.height / 2);
    await ev(() => { Lull.UI.toast('Probe', 'good', 600, 'starOn', { onClick: () => {} }); });
    await page.waitForTimeout(300);
    const held = await ev(() => !!document.querySelector('.toast.link:not(.out)') && document.querySelector('.toast.link').matches(':hover'));
    await page.waitForTimeout(1500);
    const capped = await ev(() => !document.querySelector('.toast.link:not(.out)'));
    check('a pointer resting on a toast holds it, but only up to twice its time', held && capped, JSON.stringify({ held, capped }));
    const fade = await ev(() => { const t = Lull.UI.toast('Probe', 'good', 5000, 'starOn', { onClick: () => {} }); t.classList.add('out'); return getComputedStyle(t).pointerEvents; });
    check('a toast fading out lets clicks through', fade === 'none', fade);
    await ev(() => document.getElementById('toasts').replaceChildren());
    // Rolled up, toasts have nowhere to show: one earned then is told on expanding, and still opens it.
    await ev(() => { Lull.app.setTab('play'); Lull.Collapse.set(true); });
    const col = await earn('lu_days30', true);
    const hidden = await ev(() => ({ toasts: document.querySelectorAll('.toast').length, unheard: (Lull.app.unheard || []).map((a) => a.id).join() }));
    await ev(() => Lull.Collapse.set(false));
    await page.waitForTimeout(500);
    const told = await ev(() => Array.from(document.querySelectorAll('.toast.link')).map((t) => t.textContent).join());
    check('earned while rolled up: told on expanding, as a clickable toast', col.earned && hidden.toasts === 0 && hidden.unheard === 'lu_days30' && /Familiar Face/.test(told), JSON.stringify({ hidden, told }));
    await ev(([t, m]) => { Lull.app.settings.theme = t; Lull.app.settings.mouse = m; Lull.app.applySettings(); document.getElementById('toasts').replaceChildren(); Lull.app.setTab('play'); }, [theme0, mouse0]);
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
  await browser.close();
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
