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
  // Classic is a board mode now: its checks read the Classic board in play through CM (scripts/classic-shim.cjs).
  await ctx.addInitScript(require('./classic-shim.cjs'));
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
  await ev(() => { for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; });
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
  // The chain: back-to-back quads (streak) plus the combo; only the streak multiplies, ×0.05 a link after the first,
  // ×2 at most (Chain.mult: the expected values are the game's own).
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
    const C = Lull.Chain, bank = Lull.Library.bank;
    const want = [1, 2, 14, 32].map((n) => [bank(5 * C.mult(n)), C.mult(n)]);
    return { out, status2, status14, want, fmt14: C.fmt(C.mult(14)), cap: C.RELAXED.cap };
  });
  check('two quads pay 5 and 5.25 (×1.05 at a streak of 2), chain 3', chain.out[0][0] === chain.want[0][0] && chain.out[0][0] === 5 && chain.out[1][0] === chain.want[1][0] && chain.out[1][0] === 5.25 && chain.out[1][1] === chain.want[1][1] && chain.out[1][2] === 3 && /Chain 3 · ×1\.05/.test(chain.status2), JSON.stringify(chain));
  check('fourteen in a row pay ×1.65 (a quad: 8.25); the chain shows beside it', chain.out[2][0] === chain.want[2][0] && chain.out[2][0] === 8.25 && chain.out[2][1] === 1.65 && new RegExp('Chain 16 · ' + chain.fmt14.replace('.', '\\.')).test(chain.status14) && /Chain 16 · ×1\.65/.test(chain.status14), JSON.stringify(chain));
  check('the multiplier stops at ×2 (a quad: 10)', chain.out[3][1] === chain.cap && chain.out[3][0] === chain.want[3][0] && chain.out[3][0] === 10, JSON.stringify(chain));
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
  const noodlePrice = await ev(() => Lull.ITEMS.noodle.price);
  check('one you have none of shows its price', priced.empty && priced.n === '⦵' + noodlePrice && noodlePrice === 30, JSON.stringify(priced));
  await shot('11-tray-price');
  const wallet0 = await ev(() => Lull.app.store.state.lines);
  await page.click('.item-tray [data-item="noodle"]');
  check('  it asks once: Buy & use, with the price', new RegExp('Buy & use · ' + noodlePrice).test(await page.textContent('.modal footer')));
  await page.click('.modal footer .btn.primary');
  await page.waitForTimeout(60);
  check('  bought for its price and put straight to use', (await ev(() => Lull.app.store.state.lines)) === wallet0 - noodlePrice && (await ev(() => Lull.app.store.state.inventory.noodle)) === 0);
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
  // Timed in the animation's own time: the live loop runs it, but on the app's test clock (Lull.app.frameStep), a
  // steady 60 fps whatever the machine is doing (a busy one delivers frames late, and the physics' capped steps would
  // stretch the same animation well past its length in wall time).
  const BOARD = ['settle', 'tornado', 'trapdoor', 'flip'];
  const fxRun = (id, motion) => ev(async ([id, motion, BOARD]) => {
    const m = Lull.app.modes.play, g = m.game, st = Lull.app.store.state, w = m.view.fx.world, fx = m.view.fx;
    const motion0 = st.settings.motion, STEP = 1 / 60;
    st.settings.motion = motion;
    Lull.app.frameStep = STEP;
    if (g.over) m.newBoard();
    fx.clear();
    g.board.cells.fill(0);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 10; x++) if (x !== (y * 3) % 10 && (x + y) % 5) g.board.set(x, y, 1 + ((x * 7 + y * 3) % 7));
    g.replacePiece({ id: 'T' });
    st.inventory[id] = (st.inventory[id] || 0) + 1;
    m.apply(id);
    if (!BOARD.includes(id)) { g.piece.y = Math.min(g.piece.y, 15); m.action('drop'); }
    const next = !!g.piece && !g.piece.special;
    let peak = 0, props = 0, frames = 0;
    const out = await new Promise((res) => {
      // Each display frame the app's loop (registered first) steps the animation by STEP; then this looks.
      const f = () => {
        peak = Math.max(peak, w.nb + w.np); props = Math.max(props, fx.props.length + fx.movers.length);
        const t = ++frames * STEP * 1000;
        if ((t > 50 && !w.active && !fx.props.length && !fx.movers.length) || t > 5000) res(t); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    Lull.app.frameStep = null;
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
    // The callouts the drop put on the board (the entries themselves: read later, one that faded on its own is told
    // apart from one taken off early).
    window.__callouts = m.view.fx.texts.filter((t) => t.callout);
    return { lines: r ? r.lines : 0, gained: (g.s.banked || 0) - w0 };
  }, [rows, piece, item, x, y]);
  // A Patch dropped into a covered hole completes the row: Patch Job, paid at once, called out on the board, written
  // in the book — and, found for the first time ever, a power-up comes with it.
  await ev(() => { delete Lull.app.store.state.combos.patchjob; });
  const bag0 = await ev(() => Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0));
  const got0 = await ev(() => Object.assign({}, Lull.app.store.state.stats.items.got));
  // Every toast from here on, kept as it comes (a toast leaves after 2.2 s: a late read must not miss it).
  await ev(() => { window.__toasts = []; window.__toastObs = new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); }); window.__toastObs.observe(document.getElementById('toasts'), { childList: true }); });
  const pj = await scene(['XXXX.XXXXX', 'XXXXXXXXX.'], 'O', 'patch', 4, 12);
  await page.waitForTimeout(250);
  await shot('16-patch-job');
  await page.waitForTimeout(1100);
  // Found for the first time, a power-up comes with it (0.9 s later, on a timer): waited for, however busy the machine.
  await page.waitForFunction((b0) => Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0) > b0, bag0, { timeout: 20000 }).catch(() => {});
  const pjAfter = await ev(() => { const m = Lull.app.modes.play, g = m.game; window.__toastObs.disconnect(); return { found: Object.keys(g.s.combos || {}), book: Object.keys(Lull.app.store.state.combos || {}),
    // Called out: on the board still, or gone only once its own time was up (never taken off early).
    texts: window.__callouts.filter((t) => m.view.fx.texts.includes(t) || t.t >= t.dur).map((t) => t.str), bag: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), toast: window.__toasts.join() }; });
  check('a Patch into a covered hole that completes the row is Patch Job: paid, called out, in the book', pj.lines === 1 && pj.gained === 3 && pjAfter.found.includes('patchjob') && pjAfter.book.includes('patchjob') && pjAfter.texts.includes('Patch Job'), JSON.stringify({ pj, pjAfter }));
  // One entry, drawn from the power-ups: one of it, or an Undo's pack of five.
  const earned = await ev((g0) => { const got = Lull.app.store.state.stats.items.got; return Object.keys(got).filter((k) => (got[k] || 0) !== (g0[k] || 0)).map((k) => [k, got[k] - (g0[k] || 0), Lull.packOf(k)]); }, got0);
  check('  found for the first time: a power-up comes with it (an Undo as five)', earned.length === 1 && earned[0][2] === earned[0][1] && pjAfter.bag === bag0 + earned[0][1] && pjAfter.toast.length > 0, JSON.stringify({ bag0, earned, pjAfter }));
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
    return { waited, left: g.s.gold, banked: r.banked, want: 5 * Lull.Luck.GOLD_X, status: document.getElementById('play-status').textContent };
  });
  check('gold waits through a piece that clears nothing, then a quad pays ×2 (10) and leaves four', gold.waited === 5 && gold.left === 4 && gold.banked === gold.want && gold.want === 10 && /Gold 4/.test(gold.status), JSON.stringify(gold));
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
  const gift = await ev(() => { const ids = Lull.app.store.state.gift.log[0].ids; return { ids, gain: ids.reduce((a, id) => a + (Lull.FREEBIES[id] ? 0 : Lull.packOf(id)), 0), cards: [...document.querySelectorAll('.modal-gift .gift-card b')].map((b) => b.textContent), inv: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), at: Lull.app.store.state.gift.at, now: Date.now(), ready: !!document.querySelector('#gift-btn.ready'), tip: document.getElementById('gift-btn').dataset.tip }; });
  check('it turns over three different entries, already in the bag, the claim booked', gift.cards.length === 3 && new Set(gift.cards).size === 3 && gift.ids.length === 3 && gift.inv === inv0 + gift.gain && Math.abs(gift.now - gift.at) < 5000, JSON.stringify(gift));
  check('once opened, the button says how long until the next one (24 hours on)', !gift.ready && /^Next gift in (23h 59m|24h 0m|1d 0h)$/.test(gift.tip), gift.tip);
  await page.click('.modal-gift footer .btn.primary');
  await page.click('#gift-btn');
  const twice = await ev(() => ({ modal: !!document.querySelector('.modal-gift'), inv: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join() }));
  check('not again within 24 hours: a quiet note of when, nothing more', !twice.modal && twice.inv === inv0 + gift.gain && /Next gift in/.test(twice.toast), JSON.stringify(twice));
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(400);
  await ev(() => { for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; });
  const reloaded = await ev(() => ({ ready: !!document.querySelector('#gift-btn.ready'), inv: Object.values(Lull.app.store.state.inventory).reduce((a, b) => a + b, 0), again: Lull.app.store.openGift(Date.now()) }));
  check('nor by reopening Lull', !reloaded.ready && reloaded.inv === inv0 + gift.gain && reloaded.again === null, JSON.stringify(reloaded));
  await page.click('#wallet');
  await page.click('.tabs button[data-tab="play"]');
  check('nor by switching tabs', !(await page.isVisible('#gift-btn.ready')));
  const later = await ev(() => { const st = Lull.app.store.state; st.gift.at -= 24 * 3600e3; Lull.app.modes.play.renderGift(); return !!document.querySelector('#gift-btn.ready'); });
  check('24 hours after the claim, it is waiting again', later);
  await ev(() => { const st = Lull.app.store.state; st.gift.at = Date.now(); Lull.app.modes.play.renderGift(); });
  // A gift holding a free hint and an Undo pack (the draw forced): each card says what it is.
  const forced = await ev(() => {
    const G = Lull.Gifts, keep = G.forClaim, st = Lull.app.store.state;
    G.forClaim = () => ['free-hint', 'rewind', 'bomb'];
    st.gift.at = null;
    const before = { undo: st.inventory.rewind || 0, bomb: st.inventory.bomb || 0, hint: st.freebies.hint || 0 };
    Lull.app.modes.play.openGift();
    G.forClaim = keep;
    return { before, after: { undo: st.inventory.rewind, bomb: st.inventory.bomb, hint: st.freebies.hint } };
  });
  await page.waitForTimeout(1500);
  await shot('18-gift-freebies');
  const cardsF = await ev(() => [...document.querySelectorAll('.modal-gift .gift-card')].map((c) => ({ id: c.dataset.gift, name: c.querySelector('b').textContent, rarity: c.className.replace('gift-card ', ''), small: c.querySelector('small') ? c.querySelector('small').textContent : null, tip: c.dataset.tip, tipTitle: c.dataset.tipTitle, icon: c.querySelector('.gi').innerHTML })));
  const icons = await ev(() => { const as = (k) => { const d = document.createElement('span'); d.innerHTML = Lull.Icons.icon(k); return d.innerHTML; }; return { hint: as('hint'), undo: as('undo') }; });
  const [cH, cU, cB] = cardsF;
  check('the gift\'s free hint card: the hint icon, named Hint, uncommon, and what it does', cH && cH.id === 'free-hint' && cH.name === 'Hint' && cH.icon === icons.hint && /uncommon/.test(cH.rarity) && cH.small === 'uncommon' && cH.tip === 'One puzzle hint at no cost. Still halves the pay.', JSON.stringify(cH));
  check('the Undo card says it is five, with the Undo icon', cU && cU.name === '5 Undos' && cU.tipTitle === '5 Undos' && cU.icon === icons.undo && cB && cB.name === 'Bomb', JSON.stringify(cardsF));
  check('the gift gave five Undos, a Bomb and a free hint', forced.after.undo === forced.before.undo + 5 && forced.after.bomb === forced.before.bomb + 1 && forced.after.hint === forced.before.hint + 1, JSON.stringify(forced));
  const giftFit = await ev(() => [...document.querySelectorAll('.modal-gift .gift-face')].every((f) => f.scrollHeight <= f.clientHeight + 1 && f.scrollWidth <= f.clientWidth + 1));
  check('the gift cards fit their words', giftFit);
  await page.click('.modal-gift footer .btn.primary');
  await ev(() => { const st = Lull.app.store.state; st.gift.at = Date.now(); Lull.app.modes.play.renderGift(); });
  // With the system's reduced motion (every animation off), the cards are shown at rest, not left unturned.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ev(() => { const G = Lull.Gifts, keep = G.forClaim; G.forClaim = () => ['free-hint', 'rewind', 'bomb']; Lull.app.store.state.gift.at = null; Lull.app.modes.play.openGift(); G.forClaim = keep; });
  await page.waitForTimeout(400);
  const stillCards = await ev(() => [...document.querySelectorAll('.modal-gift .gift-card')].map((c) => { const cs = getComputedStyle(c); return cs.opacity + '/' + cs.transform; }));
  await shot('18-gift-reduced-motion');
  check('under the system\'s reduced motion the gift cards show, at rest', stillCards.length === 3 && stillCards.every((c) => c === '1/none'), JSON.stringify(stillCards));
  await page.click('.modal-gift footer .btn.primary');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ev(() => { const st = Lull.app.store.state; st.gift.at = Date.now(); Lull.app.modes.play.renderGift(); });
  // An Undo earned in play (the draw forced) comes as its pack of five, and the note says so.
  const earnU = await ev(() => {
    const G = Lull.Gifts, keep = G.draw, st = Lull.app.store.state, n0 = st.inventory.rewind || 0, g0 = st.stats.items.got.rewind || 0;
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    G.draw = () => ['rewind'];
    try { Lull.app.modes.play.earnItem(); } finally { G.draw = keep; }
    return { gained: st.inventory.rewind - n0, got: (st.stats.items.got.rewind || 0) - g0, toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|') };
  });
  check('an Undo earned in play is five, and the note says 5 Undos', earnU.gained === 5 && earnU.got === 5 && /5 Undos/.test(earnU.toast), JSON.stringify(earnU));

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
  // The slip and the click carry their own time stamps (as touch-test's touches do): the slip 20 ms before the press,
  // however slowly a busy machine delivers them (the grace is timed by the events' stamps).
  const cdp = await ctx.newCDPSession(page);
  const t0m = await ev(() => (performance.timeOrigin + performance.now()) / 1000), slip = [c3[0] + s0 * 1.0, c3[1]];
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: slip[0], y: slip[1], timestamp: t0m });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: slip[0], y: slip[1], button: 'left', buttons: 1, clickCount: 1, timestamp: t0m + 0.02 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: slip[0], y: slip[1], button: 'left', buttons: 0, clickCount: 1, timestamp: t0m + 0.03 });
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

  // ---- classic: a board mode (the New board window's Mode tab), played on the Play tab ---------------------------------
  console.log('classic');
  await page.mouse.move(5, 300);
  check('no Classic tab and no Classic view: Classic is a board mode', await ev(() => !document.querySelector('.tabs button[data-tab="classic"]') && !document.getElementById('view-classic') && !Lull.app.modes['clas' + 'sic']
    && Lull.Recipe.options().find((o) => o.path === 'mode').values.includes('classic')));
  // The board in play (a plain one) and the window's last choice, to come back to at the end.
  const keepB = await ev(() => { const B = Lull.app.store.state.boards; return { id: B.cur, recipe: JSON.parse(JSON.stringify(B.recipe)), size: Object.assign({}, B.size), lines: Lull.app.store.state.lines }; });
  await ev(() => Lull.app.modes.play.openNewBoard());
  await page.click('.nb-tab[data-tab="mode"]');
  await page.click('.nb-mode[data-value="classic"]');
  const clPanel = await ev(() => ({ set: !!document.querySelector('.modal .cl-set'), rows: [...document.querySelectorAll('.modal .cl-row .cl-nm')].map((x) => x.textContent).join(), sws: [...document.querySelectorAll('.modal .cl-sws .nm')].map((x) => x.textContent).join(), tab: document.querySelector('.nb-tab[data-tab="mode"] .vl').textContent }));
  check('New board ▸ Mode ▸ Classic shows its settings: type, start level, next, randomizer, lock delay, music; hard drop, hold, ghost, level lock', clPanel.set && clPanel.rows === 'Start level,Next,Randomizer,Lock delay,Music' && clPanel.sws === 'Hard drop,Hold,Ghost,Level lock' && clPanel.tab === 'Classic', JSON.stringify(clPanel));
  await page.click('.nb-level[data-path="classic.type"][data-value="b"]');
  await page.click('[data-path="classic.height"][data-value="2"]');
  await page.click('[data-focus="classic.level+"]');
  await page.click('[data-focus="classic.level+"]');
  await page.click('[data-path="classic.next"][data-value="1"]');
  await page.click('[data-path="classic.hold"]');
  await page.click('[data-path="classic.lock"][data-value="nes"]');
  await page.click('[data-path="classic.levelLock"]');
  await page.waitForTimeout(100);
  await shot('13a-newboard-classic');
  const nbRecipe = await ev(() => Lull.app.modes.play.lastNB.nb.recipe.classic);
  check('its settings are the recipe: B type, height 2, start level 3, Next 1, hold off, NES lock, level lock on', nbRecipe.type === 'b' && nbRecipe.height === 2 && nbRecipe.level === 3 && nbRecipe.next === 1 && nbRecipe.hold === false && nbRecipe.lock === 'nes' && nbRecipe.levelLock === true && nbRecipe.drop && nbRecipe.ghost && nbRecipe.rand === 'bag', JSON.stringify(nbRecipe));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(200);
  const clNarrow = await ev(() => { const m = document.querySelector('.modal'), p = document.querySelector('.nb-panel'); return { fits: m.scrollWidth <= m.clientWidth + 1 && p.scrollWidth <= p.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1, scrolls: p.scrollHeight > p.clientHeight }; });
  await shot('13b-newboard-classic-320');
  check('at 320 × 568 the Classic settings fit across (the panel scrolls, the footer stays)', clNarrow.fits, JSON.stringify(clNarrow));
  await page.setViewportSize({ width: 520, height: 760 });
  await page.click('.modal footer .btn.primary');
  await page.waitForTimeout(150);
  const made = await ev((keep) => { const pm = Lull.app.modes.play, g = pm.game, B = Lull.app.store.state.boards; return { mode: g.recipe.mode, ceiling: g.ceiling, garbage: g.board.count(), next: g.previewCount, noHold: g.mods.noHold, card: pm.cardOpen, text: document.getElementById('play-overlay').textContent, newRec: B.cur !== keep.id, shelved: !!B.list.find((r) => r.id === keep.id), items: document.getElementById('itembar').textContent }; }, keepB);
  check('Create makes a Classic board in the library (the plain one shelved) with its garbage, Next and hold, waiting at its Start card', made.mode === 'classic' && made.ceiling && made.garbage > 10 && made.next === 1 && made.noHold && made.card && /Start/.test(made.text) && /Edit rules/.test(made.text) && made.newRec && made.shelved && /Resume/.test(made.items), JSON.stringify(made));
  await page.keyboard.press('Space');
  const gy0 = await ev(() => CM.game.piece.y);
  await page.waitForTimeout(1800);
  const gy1 = await ev(() => ({ y: CM.game.piece.y, pieces: CM.game.s.pieces, started: CM.started, status: document.getElementById('play-status').textContent }));
  check('Space starts it and the pieces fall on their own; the status bar has Score, Level 3 (locked), Left 25, Bank, Best', gy1.started && (gy1.y < gy0 || gy1.pieces > 0) && /Level\s*3 \(locked\)/.test(gy1.status) && /Left\s*25/.test(gy1.status) && /Bank/.test(gy1.status) && /Best/.test(gy1.status), JSON.stringify([gy0, gy1]));
  await shot('13c-classic-board');
  const refused = await ev(() => { const pm = Lull.app.modes.play; const n = Lull.app.store.state.inventory; return { hold: pm.action('hold'), items: Object.keys(Lull.ITEMS).every((id) => pm.game.allow(id) === 'Not in Classic'), undo: pm.game.maxHistory }; });
  check('hold off refuses; every power-up is refused (Not in Classic); no Undo', !refused.hold && refused.items && refused.undo === 0, JSON.stringify(refused));
  // The library row says what it is; a standard Classic board for the checks that follow (CM).
  await ev(() => Lull.app.modes.play.openLibrary());
  const row = await ev(() => { const r = document.querySelector('.lib-row.current'); return r ? r.textContent : ''; });
  check('its library row: Playing, its size and Classic B', /Playing/.test(row) && /Classic B/.test(row), row);
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); CM.newGame(false); });
  await page.waitForTimeout(150);
  check('classic waits for a start', await ev(() => !CM.started && CM.cardOpen));
  await page.keyboard.press('Space');
  const y0 = await ev(() => CM.game.piece.y);
  await page.waitForTimeout(2200);
  const fell = await ev(() => ({ y: CM.game.piece.y, pieces: CM.game.s.pieces, music: Lull.Music.playing }));
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
  // A double Space: the second press 100 ms after the first on the set grace's clock (BoardMode.clock, held for the two
  // presses), however slowly a busy machine delivers them.
  await ev(() => { const m = CM; m.setGrace = Lull.Modes.SET_GRACE_MS; window.__graceT = performance.now(); m.clock = () => window.__graceT; });
  const cp0 = await ev(() => CM.game.s.pieces);
  await page.keyboard.press('Space');
  await ev(() => { window.__graceT += 100; });
  await page.keyboard.press('Space');
  const { cp1, cy1, ms1 } = await ev(() => { const m = CM, g = m.game; delete m.clock; return { cp1: g.s.pieces, cy1: g.piece.y, ms1: m.ms }; });
  // Gravity carries on: 1.2 s on Classic's own clock (running time, the clock its gravity counts), however slowly frames come.
  await page.waitForFunction((ms) => CM.ms - ms >= 1200, ms1, { timeout: 30000 });
  check('Classic: a double Space hard drops one piece; gravity carries on', cp1 === cp0 + 1 && (await ev((y) => { const g = CM.game; return g.s.pieces > 0 && (!g.piece || g.piece.y < y || g.s.pieces > 1); }, cy1)), JSON.stringify([cp0, cp1]));
  await ev(() => { CM.setGrace = 0; });
  check('hard drop scores', await ev(() => CM.score > 0));
  const clock = await ev(() => CM.ms);
  check('Classic keeps its own clock (for the sprints)', clock > 1500 && clock < 6000, String(clock));
  // Restarting while the music plays starts the suite again from the top (it used to go silent, throwing every tick).
  const games0 = await ev(() => Lull.app.store.state.stats.classic.games);
  for (let i = 0; i < 5; i++) await ev(() => CM.restart());
  await page.waitForTimeout(900);
  const rw = await ev(() => ({ playing: Lull.Music.playing, pos: Lull.Music.pos && { bar: Lull.Music.pos.bar, ahead: +(Lull.Music.pos.at - Lull.Sound.ctx.currentTime).toFixed(2) }, games: Lull.app.store.state.stats.classic.games }));
  check('a new game during the music starts it again from the top, still scheduling, no errors', rw.playing && rw.pos && rw.pos.ahead > 0 && rw.pos.bar <= 2 && errors.length === 0, JSON.stringify(rw) + ' ' + errors.slice(0, 1).join(''));
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
  await ev(() => { const m = CM; m.lines = 9; const g = m.game; for (let x = 1; x < 10; x++) g.board.set(x, 0, 8); g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1)); });
  await page.keyboard.press('Space');
  check('ten lines: level 2', await ev(() => CM.level === 2));
  // Back-to-back tetrises multiply the lines Classic banks (0.7 a line, ×0.05 a link, ×1.5 at most), never its score.
  const bank = await ev(() => {
    const m = CM, g = m.game;
    g.s.b2b = 5; // six before: this makes seven, ×1.3
    for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) g.board.set(x, y, 8);
    g.replacePiece({ id: 'I' }); g.rotate(1); while (g.move(-1));
    const s0 = m.score, lvl = m.level;
    let r = null; g.on('lock', (x) => { r = r || x; });
    g.drop();
    const C = Lull.Chain, out = { banked: r.banked, mult: m.mult, points: m.score - s0, want: r.score * lvl + r.dropDist * 2, status: document.getElementById('play-status').textContent,
      wantMult: C.mult(7, 'classic'), wantBank: Lull.Library.bank(4 * C.CLASSIC.rate * C.mult(7, 'classic')), tip: (document.querySelector('#play-status .chain, #play-status [data-tip]') || {}).dataset };
    // Back as it was, so the checks further on see the game they expect.
    m.score = s0; m.lines -= 4; m.level = lvl; g.s.b2b = -1; m.mult = 1; m.renderStatus();
    out.line = Lull.LINE; out.tip1 = [...document.querySelectorAll('#play-status .stat')].map((x) => x.dataset.tip).find(Boolean);
    return out;
  });
  check('Classic: seven tetrises in a row bank ×1.3 (3.64 lines: 4 × 0.7 × 1.3), the score untouched', bank.banked === bank.wantBank && bank.banked === 3.64 && bank.mult === bank.wantMult && bank.mult === 1.3 && bank.points === bank.want && /Bank ×1\.3/.test(bank.status), JSON.stringify(bank));
  // The Bank tile shows the multiplier; its tooltip says what a line banks, in lines, and at ×1.3 what that makes.
  check('  the Bank tooltip gives a line\'s 0.7 with its unit, and at ×1.3 the 0.91 a line banks now', !!bank.tip && bank.tip.tip.includes('banks 0.7 ' + bank.line + ';') && bank.tip.tip.includes('×1.3: 0.91 ' + bank.line + ' a line') &&
    bank.tip1 === 'Each line banks 0.7 ' + bank.line + '; back-to-back multiplies it, up to ×1.5', JSON.stringify([bank.tip, bank.tip1]));
  check('and ten lines make it a game played', await ev((g0) => Lull.app.store.state.stats.classic.games === g0 + 1, games0));
  // Pausing mid-bar comes back to that bar, not the one after it.
  await page.waitForTimeout(700);
  const resumeBar = await ev(() => {
    const M = Lull.Music, now = Lull.Sound.ctx.currentTime, sounding = M.pos.sched.filter((b) => b.at <= now).pop();
    CM.togglePause(true); M.stop();
    const out = { sounding: sounding && sounding.bar, next: M.pos.bar };
    CM.togglePause(false);
    return out;
  });
  check('a pause resumes the bar that was playing', resumeBar.sounding != null && resumeBar.next === resumeBar.sounding, JSON.stringify(resumeBar));
  await page.waitForTimeout(150);
  // The pointer leaving the window pauses a running game (a browser's mouseleave, or the panel's pointer message);
  // coming back shows the paused card, and P carries on. Settings ▸ Controls turns it off.
  {
    const st = () => ev(() => { const m = CM; return { paused: m.paused, card: !!(m.cardOpen), running: m.running() }; });
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
    check('P pauses (and the music stops)', await ev(() => CM.paused && !Lull.Music.playing));
  await shot('14-classic-paused');
  const pausedMs = await ev(() => CM.ms);
  await page.waitForTimeout(300);
  check('its clock stops while paused', (await ev(() => CM.ms)) === pausedMs);
  await page.keyboard.press('KeyP');
  await ev(() => { const g = CM.game; for (let y = 0; y < 19; y++) for (let x = 0; x < 10; x++) if (x !== y % 10) g.board.set(x, y, 8); });
  await page.waitForTimeout(2500);
  check('topping out ends the game', await ev(() => CM.over && Lull.app.store.state.stats.classic.best > 0));
  check('and the card comes after the top out, over the piled-up well', await ev(() => { const m = CM; return m.cardOpen && m.pile && m.pile.done && m.view.pileup.length === 4; }));
  await shot('15-classic-over');
  // The best is the board's own: kept with it (C.best), another Classic board starts at none, and Play again carries it on.
  const perBoard = await ev(() => {
    const pm = Lull.app.modes.play, mine = Lull.Classic.of(pm.game).best, score = pm.game.s.score;
    const keep = pm.game;
    window.makeClassic();
    const other = Lull.Classic.of(pm.game).best, otherStat = [...document.querySelectorAll('#play-status .stat')].map((x) => x.textContent).find((t) => /Best/.test(t));
    pm.setGame(keep);
    pm.classicBest = mine; pm.ctl.attach(window.makeClassic());
    const carried = Lull.Classic.of(pm.game).best;
    pm.setGame(keep);
    return { mine, score, other, otherStat, carried };
  });
  check('Classic\'s best is per board: this board\'s is its score, a new board\'s is 0, and Play again carries it on', perBoard.mine === perBoard.score && perBoard.mine > 0 && perBoard.other === 0 && perBoard.carried === perBoard.mine, JSON.stringify(perBoard));

  // The classic top out: the piece that cannot appear sets over the stack, and three more from the queue pile up on it
  // one after another before the card. Everything counted is as it was at the top out.
  {
    // A stack to row 17 (a hole a row), an O floating over it, gravity held; the O set makes the next T top out.
    const topout = (o) => ev((o) => {
      const m = CM, app = Lull.app;
      app.settings.motion = o && o.reduced ? 'reduced' : 'full';
      m.newGame(true);
      const g = m.game;
      for (let y = 0; y < 18; y++) for (let x = 0; x < 10; x++) if (x !== (y * 3) % 10) g.board.set(x, y, 1 + ((x + y) % 7));
      g.queue.splice(0, 4, { id: 'T', rot: 0 }, { id: 'I', rot: 0 }, { id: 'L', rot: 0 }, { id: 'S', rot: 0 });
      // An O over it, gravity held: set, it fills the top two rows under the T's spot, and the T cannot appear.
      g.piece = null; g.spawn({ id: 'O' }); m.acc = -1000; m.score = 4321; m.lines = 12; m.level = 2;
      const snd = (window.__snd = []), play = app.sound.play;
      if (!app.sound.__spied) { app.sound.__spied = true; app.sound.play = function (n) { (window.__snd || []).push([n, performance.now()]); return play.apply(this, arguments); }; }
      const t0 = performance.now();
      m.action('drop');
      const S = app.store.state.stats.classic;
      return { t0, over: m.over, card: m.cardOpen, pile: m.view.pileup ? m.view.pileup.length : -1, score: m.score, lines: m.lines, level: m.level, best: S.best, stats: JSON.stringify(S), cells: g.board.count(), queue: JSON.stringify(g.queue), ach: Object.keys(app.store.state.achievements).sort().join(), piece: g.piece && g.piece.type.id, snd: snd.length };
    }, o);
    const after = () => ev(() => {
      const m = CM, g = m.game, S = Lull.app.store.state.stats.classic;
      return { over: m.over, card: m.cardOpen, h2: m.cardOpen ? document.querySelector('#play-overlay h2').textContent : null, pile: m.view.pileup ? m.view.pileup.length : -1, done: !!(m.pile && m.pile.done), started: m.started, score: m.score, lines: m.lines, level: m.level, best: S.best, stats: JSON.stringify(S), cells: g.board.count(), queue: JSON.stringify(g.queue), ach: Object.keys(Lull.app.store.state.achievements).sort().join(), skip: m.view.queueSkip };
    });
    const same = (a, b) => ['score', 'lines', 'level', 'best', 'stats', 'cells', 'queue', 'ach'].every((k) => a[k] === b[k]);

    const at = await topout();
    check('Classic: the O sets in the top rows and the T that cannot appear tops out at once (no card yet)', at.over && !at.card && at.piece === 'T' && at.pile === 1, JSON.stringify(at));
    const seen = [];
    for (let i = 0; i < 30; i++) {
      const a = await after();
      seen.push([Math.round((await ev(() => performance.now())) - at.t0), a.pile, a.card]);
      if (a.card) break;
      await page.waitForTimeout(90);
    }
    const early = seen.filter(([t]) => t < 300), firstCard = seen.find(([, , c]) => c);
    const grows = seen.every(([, n], i) => !i || n >= seen[i - 1][1]) && new Set(seen.map(([, n]) => n)).size === 4;
    check('the pile-up: four pieces appear one after another at the spawn spot, a calm step apart, then the card', early.every(([, n, c]) => n <= 1 && !c) && grows && firstCard && firstCard[1] === 4 && firstCard[0] > 1300 && firstCard[0] < 3000, JSON.stringify(seen));
    const fin = await after();
    const snd = await ev((t0) => window.__snd.map(([n, t]) => [n, Math.round(t - t0)]), at.t0);
    const locks = snd.filter(([n]) => n === 'lock'), fail = snd.filter(([n]) => n === 'fail');
    check('each with a soft set sound; the game over sound comes last, once', locks.length === 4 && fail.length === 1 && fail[0][1] >= Math.max(...locks.map(([, t]) => t)), JSON.stringify(snd));
    check('score, lines, level, best, stats, the board and the queue are as they were at the top out', same(at, fin) && fin.best >= at.score && /New best|Game over/.test(fin.h2), JSON.stringify([at, fin]));
    check('the Next tray gives up the pieces that piled up', fin.skip === 3);
    const cells = await ev(() => CM.view.pileup.map((p) => p.cells.map((c) => c.join(',')).sort().join(' ')));
    check('they pile up where each would appear, over one another', cells.length === 4 && cells.every((c) => /,19/.test(c)) && cells[0] === '3,18 4,18 4,19 5,18' && cells[1] === '3,19 4,19 5,19 6,19', JSON.stringify(cells));
    // Frames of it (see also the frame sequences made by hand in the Classic notes).
    await shot('15b-classic-pileup-card');
    // The layers read whatever the palette: each piece's outline is its own (no two run on the same line where their
    // edges meet, so they never stack into one heavy line), each is stroked once, and the shade behind the pile is laid
    // once per cell, in one even pass per piece.
    const themeWas = await ev(() => Lull.app.settings.theme);
    for (const theme of ['light', 'dark']) {
      const drawn = await ev((theme) => {
        const app = Lull.app, v = CM.view;
        app.settings.theme = theme; app.applySettings(); v.render(performance.now());
        const c = document.createElement('canvas'); c.width = 1200; c.height = 1800;
        const real = c.getContext('2d'), ops = [];
        let path = [];
        const ctx = new Proxy(real, {
          get(t, k) {
            const f = t[k];
            if (typeof f !== 'function') return f;
            return (...a) => {
              if (k === 'beginPath') path = [];
              else if (k === 'moveTo' || k === 'lineTo' || k === 'rect') path.push([k].concat(a));
              else if (k === 'stroke') ops.push({ op: 'stroke', path });
              else if (k === 'fill') ops.push({ op: 'fill', rects: path.filter((q) => q[0] === 'rect').length });
              else if (k === 'fillRect') ops.push({ op: 'fillRect' });
              return f.apply(t, a);
            };
          },
          set(t, k, x) { t[k] = x; return true; },
        });
        v.drawPileup(ctx, v.lay.s);
        const cells = new Set(); for (const pc of v.pileup) for (const [x, y] of pc.cells) cells.add(x + ',' + y);
        return { ops, cells: cells.size, pieces: v.pileup.length, s: v.lay.s };
      }, theme);
      const strokes = drawn.ops.filter((o) => o.op === 'stroke');
      const shadeRects = drawn.ops.reduce((a, o) => a + (o.op === 'fill' ? o.rects : o.op === 'fillRect' ? 1 : 0), 0);
      // Every point along each piece's lines, by direction: two pieces' lines on the same spot, the same way, coincide.
      const pts = strokes.map((st) => {
        const set = new Set();
        let at = null;
        for (const [k, x, y] of st.path) {
          if (k === 'lineTo' && at) {
            const [x0, y0] = at, hz = Math.abs(y - y0) < 0.01, n = Math.ceil(Math.hypot(x - x0, y - y0) / 0.5);
            for (let i = 1; i < n; i++) set.add((hz ? 'h' : 'v') + Math.round((x0 + (x - x0) * i / n) * 2) + ',' + Math.round((y0 + (y - y0) * i / n) * 2));
          }
          at = [x, y];
        }
        return set;
      });
      const shared = [];
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { let n = 0; for (const q of pts[i]) if (pts[j].has(q)) n++; if (n) shared.push([i, j, n]); }
      check('the pile\'s layers (' + theme + '): one outline per piece, none on the same line as another where they meet, the shade once per cell', drawn.pieces === 4 && strokes.length === 4 && shared.length === 0 && shadeRects === drawn.cells, JSON.stringify({ strokes: strokes.length, shared, shadeRects, cells: drawn.cells }));
    }
    await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, themeWas);

    // Space during the pile-up goes straight to the card (and does not start the next game).
    const at2 = await topout();
    await page.waitForTimeout(250);
    await page.keyboard.press('Space');
    const sk = await after();
    check('Space during the pile-up skips to the card, the whole pile shown; no new game', sk.card && sk.done && sk.pile === 4 && sk.over && same(at2, sk), JSON.stringify([at2, sk]));
    await page.keyboard.press('Space');
    check('and the next Space plays again', await ev(() => { const m = CM; return m.started && !m.over && !m.cardOpen && !m.view.pileup; }));

    // Reduced motion: the whole pile at once, then the card.
    const rm = await topout({ reduced: true });
    const rm1 = await after();
    check('reduced motion: the pile is all there at once, and the card with it', rm.card && rm.pile === 4 && rm1.done && same(rm, rm1), JSON.stringify(rm));
    await shot('15c-classic-pileup-reduced');
    await ev(() => { Lull.app.settings.motion = 'full'; });

    // Pausing or leaving the tab mid pile-up: it ends at the card, never a paused or resumed game.
    const pz = await topout();
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyP');
    const pz1 = await after();
    check('P during the pile-up ends it at the card (not paused, not resumed)', pz1.card && pz1.done && pz1.over && !(await ev(() => CM.paused)) && same(pz, pz1) && /New best|Game over/.test(pz1.h2), JSON.stringify(pz1));
    const tb = await topout();
    await page.waitForTimeout(200);
    await ev(() => Lull.app.setTab('puzzle'));
    await page.waitForTimeout(150);
    await ev(() => Lull.app.setTab('play'));
    await page.waitForTimeout(100);
    const tb1 = await after();
    check('leaving the tab during the pile-up: back, it is the game over card', tb1.card && tb1.done && tb1.over && same(tb, tb1) && !(await ev(() => CM.paused)), JSON.stringify(tb1));
    const rs = await topout();
    await page.waitForTimeout(200);
    await ev(() => CM.restart());
    check('Restart during the pile-up starts a clean game', await ev(() => { const m = CM; return m.started && !m.over && !m.pile && !m.view.pileup && !m.view.queueSkip && m.game.board.count() === 0; }) && rs.over);
    check('Relaxed boards and Puzzles keep their own spawn and never pile up', await ev(() => !new Lull.Game({ w: 10, h: 20, recipe: {} }).ceiling && !(Lull.app.modes.puzzle.game && Lull.app.modes.puzzle.game.ceiling) && !Lull.app.modes.puzzle.view.pileup && CM.game.ceiling));

    // A reload during the pile-up: the top out was already saved; Classic comes back to its start card with that best.
    const rctx = await browser.newContext({ viewport: { width: 520, height: 760 } });
    await rctx.addInitScript(require('./classic-shim.cjs'));
    const rp = await rctx.newPage();
    rp.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    const rev = (fn, a) => rp.evaluate(fn, a);
    // Up when the app has started (and a first run's welcome, on its 250 ms timer, is open to be closed), however long a
    // busy machine takes to load it.
    const booted = () => rp.waitForFunction(() => window.Lull && Lull.app && Lull.app.lastTime > 0 && (Lull.app.store.loadedFrom !== 'new' || Lull.UI.modalOpen()), null, { timeout: 30000 });
    await rp.goto(PAGE);
    await booted();
    await rev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); Lull.app.setTab('play'); });
    const rl = await rev(() => {
      const m = CM; m.newGame(true);
      const g = m.game; m.score = 987654;
      for (let y = 0; y < 19; y++) for (let x = 0; x < 10; x++) if (x !== y % 10) g.board.set(x, y, 8);
      // A busy machine can take more than one frame to set the piece and top out.
      for (let i = 0; i < 120 && !m.over; i++) m.frame(performance.now(), 0.016);
      const raw = localStorage.getItem('lull.save.v1');
      return { over: m.over, card: m.cardOpen, pile: m.view.pileup && m.view.pileup.length, best: Lull.app.store.state.stats.classic.best, stored: raw ? JSON.parse(raw).stats.classic.best : null };
    });
    await rp.reload();
    await booted();
    const rl1 = await rev(() => { const m = CM; Lull.app.setTab('play'); return { best: Lull.app.store.state.stats.classic.best, over: m.over, card: m.cardOpen, text: document.getElementById('play-overlay').textContent }; });
    check('reload during the pile-up: the game over is kept (the best saved at the top out); the board comes back at its Game over card', rl.over && !rl.card && rl.pile === 1 && rl.stored === 987654 && rl1.best === 987654 && rl1.over && rl1.card && /987,654/.test(rl1.text) && /Play again/.test(rl1.text), JSON.stringify([rl, rl1]));
    await rctx.close();
    await ev(() => Lull.app.setTab('play'));
  }
  await page.click('.tabs button[data-tab="puzzle"]');
  check('leaving the Play tab stops the Classic music', await ev(() => !Lull.Music.playing));
  await page.click('.tabs button[data-tab="play"]');
  // Hard drop off: Space and a click do nothing but the piece still falls and sets on its own.
  const noDrop = await ev(() => { window.makeClassic({ drop: false }); const pm = Lull.app.modes.play; pm.ctl.go(); const n = pm.game.s.pieces; const a = pm.action('drop'); return { a, same: pm.game.s.pieces === n }; });
  check('hard drop off: a drop is refused', noDrop.a === false && noDrop.same, JSON.stringify(noDrop));

  // ---- editing a board's rules, for a price ----
  {
    const pmId = await ev((keep) => { const pm = Lull.app.modes.play, cid = Lull.app.store.state.boards.cur; pm.switchTo(keep.id); pm.deleteBoard(cid); const g = pm.game; g.board.set(0, 12, 5); Lull.app.store.state.lines = 100; Lull.app.refreshWallet(); return { id: keep.id, count: g.board.count(), w: g.w, h: g.h, recipe: JSON.parse(JSON.stringify(g.recipe)) }; }, keepB);
    await ev(() => Lull.app.modes.play.openLibrary());
    await page.click('.lib-row.current [aria-label="Edit rules"]');
    await page.waitForTimeout(100);
    const e0 = await ev(() => ({ title: document.querySelector('.modal-edit header .ttl').textContent, apply: document.querySelector('.modal-edit footer .btn.primary').textContent }));
    check('Edit rules opens the New board window on the board\'s rules, Apply free while nothing changed', e0.title === 'Edit rules' && e0.apply === 'Apply', JSON.stringify(e0));
    await page.focus('.modal-edit .nb-val[data-k="h"]');
    await page.keyboard.press('Home');
    const cut = await ev(() => ({ why: document.querySelector('.modal-edit .nb-why').textContent, off: document.querySelector('.modal-edit footer .btn.primary').getAttribute('aria-disabled') }));
    await ev(() => document.querySelector('.modal-edit footer .btn.primary').click()); // quiet (aria-disabled): a press says why
    const cut1 = await ev(() => ({ open: !!document.querySelector('.modal-edit'), lines: Lull.app.store.state.lines }));
    check('a height that would cut the stack is refused, with the reason; Apply changes nothing', cut.why === 'Blocks stand in the rows it would lose' && cut.off === 'true' && cut1.open && cut1.lines === 100, JSON.stringify([cut, cut1]));
    await page.focus('.modal-edit .nb-val[data-k="h"]');
    await page.keyboard.press('End');
    const p1 = await ev(() => document.querySelector('.modal-edit footer .btn.primary').textContent);
    await page.click('.modal-edit .nb-tab[data-tab="mode"]');
    await page.click('.modal-edit .nb-mode[data-value="classic"]');
    const p2 = await ev(() => ({ text: document.querySelector('.modal-edit footer .btn.primary').textContent, protect: document.querySelector('.modal-edit .nb-mode[data-value="protect"]').getAttribute('aria-disabled') }));
    await shot('16-edit-rules');
    check('the price is on Apply: 20 lines for the size, 40 with the mode too; Protect is off (it starts on a new board)', /20$/.test(p1) && /40$/.test(p2.text) && p2.protect === 'true', JSON.stringify([p1, p2]));
    await page.click('.modal-edit footer .btn.primary');
    await page.waitForTimeout(150);
    const ap = await ev(() => { const g = Lull.app.modes.play.game; return { open: !!document.querySelector('.modal-edit'), lines: Lull.app.store.state.lines, mode: g.recipe.mode, h: g.h, count: g.board.count(), hist: g.history.length, piece: !!g.piece, card: Lull.app.modes.play.cardOpen }; });
    check('Apply spends 40 lines and changes the board where it is: Classic, 40 tall, the stack kept, no Undo history', !ap.open && ap.lines === 60 && ap.mode === 'classic' && ap.h === 40 && ap.count === pmId.count && ap.hist === 0 && ap.piece && ap.card, JSON.stringify([ap, pmId]));
    await shot('16b-edited-board');
    // Back as it was (by the same path), for the checks that follow.
    const back = await ev((k) => {
      const pm = Lull.app.modes.play, st = Lull.app.store;
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      let why = null;
      const ok = pm.applyEdit({ id: st.state.boards.cur, recipe: pm.game.recipe, size: { w: pm.game.w, h: pm.game.h }, json: pm.boardJSON() }, k.recipe, { w: k.w, h: k.h }, null, (t) => { why = t; });
      const out = { ok, why, lines: st.state.lines, mode: pm.game.recipe.mode, h: pm.game.h };
      pm.game.board.set(0, 12, 0);
      return out;
    }, pmId);
    check('and edited back (40 lines more)', back.ok && back.lines === 20 && back.mode === 'plain' && back.h === pmId.h, JSON.stringify(back));
    await ev((keep) => { const st = Lull.app.store, B = st.state.boards; st.state.lines = keep.lines; B.recipe = keep.recipe; B.size = keep.size; Lull.app.refreshWallet(); Lull.app.modes.play.persist(); }, keepB);
  }
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
  // Movement, every note it can play (the pack picks one at random each time), each rendered until two renders agree
  // within 1 dB. A render that does not reproduce is a fault of the render, not the sound: once in a few hundred runs on
  // a loaded machine, Chromium handed back lower's render with the set sound's audio in it (-26 dB, the set sound's
  // exact figures). A sound that is too loud is too loud every time it renders, and fails.
  const moves = await ev(async () => {
    const S = Lull.Sound, soft = S.PACKS.soft, out = {};
    const peak = (buf) => { let p = 0; for (let c = 0; c < buf.numberOfChannels; c++) for (const x of buf.getChannelData(c)) p = Math.max(p, Math.abs(x)); return +(20 * Math.log10(p)).toFixed(1); };
    for (const n of ['move', 'rotate', 'lower']) {
      out[n] = [];
      let notes = 1;
      for (let i = 0; i < notes; i++) {
        const render = () => {
          const pick = soft.pick;
          soft.pick = (list) => { notes = list.length; return list[i]; };
          try { return S.offline(2, () => { const { pack, list } = S.voices(n, 2, 'soft'); for (const v of list) S.voice(v, 0.02, pack); }); } finally { soft.pick = pick; }
        };
        const peaks = [peak(await render()), peak(await render())];
        while (Math.abs(peaks[peaks.length - 1] - peaks[peaks.length - 2]) > 1 && peaks.length < 6) peaks.push(peak(await render()));
        const [a, b] = peaks.slice(-2);
        out[n].push({ peak: Math.max(a, b), agreed: Math.abs(a - b) <= 1, renders: peaks.length > 2 ? peaks : undefined });
      }
    }
    return out;
  });
  check('movement sounds stay faint', ['move', 'rotate', 'lower'].every((n) => moves[n].length && moves[n].every((r) => r.agreed && r.peak < -36)), JSON.stringify(moves));
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
  // Every scripted press here is a tap. A tap is a key-down and a key-up sent one after the other, and on a busy machine
  // the key-up can reach the page after the repeat delay (230 ms): the game then rightly takes the key for held and
  // repeats it (a second turn, a move too far, or a ↓ that lowers the piece onto the stack so the next ↓ sets it, and the
  // solver plays on past the end of the queue). These checks prove what each key does, not auto-repeat, so the repeat
  // delay is put out of reach until the arrow-only solves below are done, then given back.
  const das0 = await ev(() => { const s = Lull.app.store.state.settings, d = s.das; s.das = 1e9; return d; });
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
        // No piece in play before the last target: the queue ran out early, so a press set a piece it should not have.
        const ok = await ev((j) => { const m = Lull.app.modes.puzzle, pc = m.game.piece, s = m.puzzle.solution[j]; return pc ? pc.type.id === s.id && (pc.entry.rot || 0) === (s.rot || 0) : null; }, i);
        if (ok === null) return { solved: false, mods: plan.mods, why: 'no piece for target ' + (i + 1) + ' of ' + plan.targets.length };
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
      if (r.solved) { solved++; r.mods.forEach((m) => modsSolved.add(m)); } else console.log('    unsolved ' + seed + ' ' + r.mods.join(',') + (r.why ? ' (' + r.why + ')' : ''));
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
  await ev((d) => { Lull.app.store.state.settings.das = d; }, das0);

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
    const d = Lull.app.modes.puzzle.puzzle.diff, tip = document.querySelector('#puz-diff button[aria-pressed="true"]').dataset.tip;
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
    m.load('MS-23MDS22', {});
    const foot = document.querySelector('#puz-mods .mod-spin').dataset.tipFoot, g = m.game, r0 = g.piece.rot;
    m.action('ccw');
    const turned = (g.piece.rot - r0 + 4) % 4;
    Lull.app.settings.ccwPuzzles = keep;
    return { mods: m.puzzle.mods.join(' '), foot, turned };
  });
  check('Both Ways + Inverted: the chip says Z turns clockwise, and it does', /invert/.test(spinInv.mods) && /Z turns clockwise/.test(spinInv.foot) && spinInv.turned === 1, JSON.stringify(spinInv));
  await ev(() => Lull.app.modes.puzzle.loadNumbered('H', 3));
  // Big Minos: a puzzle per difficulty and mix, big pieces and tetrominoes side by side in the queue (light theme).
  const bigSeeds = { 'E-sparse': 'E-3DHK822', 'E-half': 'E-5NHAQ22', 'E-all': 'E-4CN8C22', 'M-sparse': 'M-3ZGV822', 'M-half': 'M-3GB2RA2', 'M-all': 'M-4WUW342', 'H-sparse': 'H-4AWWJW2', 'H-half': 'H-5WX4E22', 'H-all': 'H-3MXTG22' };
  const bigTheme0 = await ev(() => Lull.app.settings.theme);
  await ev(() => { Lull.app.settings.theme = 'light'; Lull.app.applySettings(); });
  let bigQueues = 0;
  for (const k of Object.keys(bigSeeds)) {
    const big = await ev((s) => {
      const m = Lull.app.modes.puzzle;
      m.load(s, {});
      const p = m.puzzle, chip = document.querySelector('#puz-mods .mod-big');
      m.view.dirty = true; m.view.render(performance.now());
      // The pieces as the queue draws them: [id, big, width, height, cell] each.
      const drawn = (m.view.drawnQueue || []).map((d) => [d.id, d.big, d.w, d.h, d.cell]);
      let pop = null;
      if (chip) { chip.click(); const b = document.querySelector('.puz-pop .tip-body'); pop = b && b.textContent; chip.click(); }
      return { mix: p.mix, kinds: p.pieces.map((e) => (Lull.Pieces.get(e.id).big ? 'B' : 'r')).join(''), tip: chip && chip.dataset.tip, pop, queue: m.game.queue.length + 1 === p.pieces.length, drawn };
    }, bigSeeds[k]);
    const mix = k.slice(2), allBig = !/r/.test(big.kinds), note = allBig ? 'Every piece is twice the size.' : 'Some pieces are twice the size.';
    check('Big Minos ' + k + ' (' + big.kinds + '): the chip says "' + note + '", and big pieces' + (mix === 'all' ? '' : ' among tetrominoes') + ' in the queue',
      big.mix === mix && big.tip === note && big.pop === note && big.queue && /B/.test(big.kinds) && (mix === 'all' || !allBig), JSON.stringify(big));
    // In a queue of big pieces and tetrominoes, every big piece is drawn larger than any tetromino beside it.
    const bigs = big.drawn.filter((d) => d[1]), smalls = big.drawn.filter((d) => !d[1]);
    if (bigs.length && smalls.length) {
      const area = (d) => d[2] * d[3];
      check('Big Minos ' + k + ': the queue draws big pieces larger than the tetrominoes', Math.min(...bigs.map(area)) > Math.max(...smalls.map(area)), JSON.stringify(big.drawn));
      bigQueues++;
    }
    await page.waitForTimeout(80);
    await shot('26-big-' + k);
  }
  check('mixed Big Minos queues were measured', bigQueues >= 4, String(bigQueues));
  await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); Lull.app.modes.puzzle.loadNumbered('H', 3); }, bigTheme0);

  // ---- Undo: one item for Relaxed and Puzzles; a puzzle undo uses one held, or buys one at its price --------------
  console.log('puzzle undo');
  {
    const U = await ev(() => ({ price: Lull.ITEMS.rewind.price, name: Lull.ITEMS.rewind.name }));
    check('the Undo item: 5 lines, named Undo', U.price === 5 && U.name === 'Undo', JSON.stringify(U));
    // Sets the wallet and the Undos held, then plays a piece of a fresh puzzle (no redraw asked for: the tab must follow).
    const setup = (a) => ev(([lines, held, drops]) => {
      const m = Lull.app.modes.puzzle, st = Lull.app.store;
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      m.loadNumbered('H', 3);
      st.state.lines = lines; st.state.inventory.rewind = held; st.itemsChanged(); Lull.app.refreshWallet();
      for (let i = 0; i < drops; i++) m.action('drop');
      return true;
    }, a);
    const read = () => ev(() => {
      const m = Lull.app.modes.puzzle, S = Lull.app.store.state, b = document.getElementById('puz-undo');
      return { pieces: m.game.s.pieces, lines: S.lines, wallet: document.getElementById('wallet-n').textContent, held: S.inventory.rewind, used: S.stats.items.used.rewind || 0, bought: S.stats.items.bought.rewind || 0, undos: (S.puzzle.current || {}).undos || 0, cnt: b.querySelector('.cnt') ? b.querySelector('.cnt').textContent : null, gem: b.querySelector('.gem') ? b.querySelector('.gem').textContent : null, tip: b.dataset.tip, aria: b.getAttribute('aria-label'), card: m.cardOpen };
    });
    await setup([100, 2, 1]);
    const a0 = await read();
    check('holding Undos, the button shows how many (tooltip and label too)', a0.cnt === '2' && a0.gem === null && a0.tip === '2 Undos held' && a0.aria === 'Undo, 2 held', JSON.stringify(a0));
    await page.click('#puz-undo');
    const a1 = await read();
    check('a puzzle undo uses a held Undo first: no lines spent, counted as used, the count goes down', a1.pieces === 0 && a1.held === 1 && a1.lines === 100 && a1.used === a0.used + 1 && a1.bought === a0.bought && a1.undos === a0.undos + 1 && a1.cnt === '1', JSON.stringify(a1));
    await setup([100, 0, 1]);
    const b0 = await read();
    check('none held: the button shows the price, as Hint does', b0.cnt === null && b0.gem === '⦵5' && /^Buys one for 5 /.test(b0.tip) && b0.aria === 'Undo, costs 5 lines', JSON.stringify(b0));
    await shot('29-undo-price');
    await page.click('#puz-undo');
    const b1 = await read();
    check('none held: the undo buys one for 5 lines and uses it at once (no question), the wallet follows', b1.pieces === 0 && b1.lines === 95 && b1.wallet === '95' && b1.held === 0 && b1.bought === b0.bought + 1 && b1.used === b0.used + 1 && b1.undos === b0.undos + 1 && !(await ev(() => Lull.UI.modalOpen())), JSON.stringify(b1));
    await setup([4, 0, 1]);
    const c0 = await read();
    await page.click('#puz-undo');
    const c1 = await read();
    const toastC = await ev(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join('|'));
    check('none held and under 5 lines: refused with a note, nothing changes', /Not enough lines/.test(toastC) && c1.pieces === 1 && c1.lines === 4 && c1.held === 0 && c1.bought === c0.bought && c1.used === c0.used && c1.undos === c0.undos, JSON.stringify({ c0, c1, toastC }));
    // Nothing to take back: no charge.
    await setup([50, 0, 0]);
    await ev(() => Lull.app.modes.puzzle.undo());
    check('with nothing to take back, an undo costs nothing', (await read()).lines === 50);
    // The not-yet card's Undo pays the same way, and says so.
    await setup([50, 0, 0]);
    await ev(() => { const m = Lull.app.modes.puzzle; let guard = 0; while (m.game.piece && !m.cardOpen && guard++ < 30) m.action('drop'); });
    const d0 = await ev(() => { const b = document.getElementById('puz-card-undo'); return b && { gem: b.querySelector('.gem') && b.querySelector('.gem').textContent, aria: b.getAttribute('aria-label'), pieces: Lull.app.modes.puzzle.game.s.pieces }; });
    await shot('29-undo-card-price');
    await page.click('#puz-card-undo');
    const d1 = await read();
    check('the not-yet card\'s Undo shows the price and pays it', d0 && d0.gem === '⦵5' && d0.aria === 'Undo, costs 5 lines' && d1.lines === 45 && !d1.card && d1.pieces === d0.pieces - 1, JSON.stringify({ d0, d1 }));
    // The not-yet card stays up across tabs; its Undo follows the shared count, so it never shows one held that is gone.
    await setup([50, 1, 0]);
    await ev(() => { const m = Lull.app.modes.puzzle; let guard = 0; while (m.game.piece && !m.cardOpen && guard++ < 30) m.action('drop'); });
    const cardUndo = () => ev(() => { const b = document.getElementById('puz-card-undo'); return b && { cnt: b.querySelector('.cnt') && b.querySelector('.cnt').textContent, gem: b.querySelector('.gem') && b.querySelector('.gem').textContent, aria: b.getAttribute('aria-label'), visible: !document.getElementById('puz-overlay').classList.contains('hidden') }; });
    const k0 = await cardUndo();
    await page.click('.tabs button[data-tab="play"]');
    await ev(() => Lull.app.store.useItem('rewind'));
    await page.click('.tabs button[data-tab="puzzle"]');
    const k1 = await cardUndo();
    check('an Undo used in Relaxed while the not-yet card is up: its Undo shows the price again', k0 && k0.cnt === '1' && k1 && k1.visible && k1.cnt === null && k1.gem === '⦵5' && k1.aria === 'Undo, costs 5 lines', JSON.stringify({ k0, k1 }));
    await ev(() => Lull.app.store.grant('rewind'));
    const k2 = await cardUndo();
    check('  and five given: it shows five held', k2 && k2.cnt === '5' && k2.gem === null && k2.aria === 'Undo, 5 held', JSON.stringify(k2));
    const k3 = await read();
    await page.click('#puz-card-undo');
    const k4 = await read();
    check('  its Undo then uses a held one, no lines spent', k4.lines === k3.lines && k4.held === 4 && k4.bought === k3.bought && !k4.card, JSON.stringify({ k3, k4 }));
    // Keys: Backspace pays once per press, however long it is held (the system's repeats undo nothing); ⌘Z too.
    await setup([50, 0, 3]);
    const e0 = await read();
    await page.keyboard.down('Backspace');
    await ev(() => { for (let i = 0; i < 6; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backspace', key: 'Backspace', repeat: true, bubbles: true })); });
    await page.waitForTimeout(400);
    await page.keyboard.up('Backspace');
    const e1 = await read();
    check('a held Backspace undoes once and pays once', e1.pieces === e0.pieces - 1 && e1.lines === 45 && e1.bought === e0.bought + 1, JSON.stringify({ e0, e1 }));
    await ev(() => { for (let i = 0; i < 4; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', ctrlKey: true, repeat: i > 0, bubbles: true })); });
    const e2 = await read();
    check('so does a held ⌘Z', e2.pieces === e1.pieces - 1 && e2.lines === 40, JSON.stringify(e2));
    await page.keyboard.press('KeyU');
    const e3 = await read();
    check('and U', e3.pieces === e2.pieces - 1 && e3.lines === 35, JSON.stringify(e3));
    // Shared with Relaxed: one given there shows here at once, one used here shows there, and back.
    await setup([50, 0, 1]);
    await ev(() => Lull.app.store.grant('rewind'));
    const f0 = await read();
    check('Undos given in Relaxed (a pack of five) show on the puzzle button at once', f0.cnt === '5', JSON.stringify(f0));
    await page.click('#puz-undo');
    await page.click('.tabs button[data-tab="play"]');
    const badge = await ev(() => { const S = Lull.app.store.state, el = document.querySelector('#itembar .group-btn[data-group="board"] .n'); return { badge: el ? el.textContent : null, tot: Object.keys(Lull.ITEMS).filter((id) => Lull.ITEMS[id].group === 'board').reduce((a, id) => a + (S.inventory[id] || 0), 0) }; });
    check('the Relaxed bar\'s Board count follows an Undo used in Puzzles, with nothing opened', badge.badge === String(badge.tot) && badge.tot >= 4, JSON.stringify(badge));
    await ev(() => { const m = Lull.app.modes.play; m.hideCard(); if (m.game.over) m.newBoard(); m.game.board.cells.fill(0); if (!m.game.piece) m.game.spawnNext(); });
    await page.click('#itembar .group-btn[data-group="board"]');
    const f1 = await ev(() => { const b = document.querySelector('.item-tray [data-item="rewind"]'); return b && { n: b.querySelector('.n').textContent, name: b.querySelector('.il').textContent, icon: (() => { const d = document.createElement('span'); d.innerHTML = Lull.Icons.icon('undo'); return b.querySelector('.ii').innerHTML === d.innerHTML && d.innerHTML === document.querySelector('#puz-undo .pz-i').innerHTML; })() }; });
    check('one used in Puzzles leaves four in the Relaxed tray, named Undo, with the puzzle button\'s icon', f1 && f1.n === '4' && f1.name === 'Undo' && f1.icon, JSON.stringify(f1));
    await shot('29-relaxed-undo-tray');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Space');
    await page.click('#itembar .group-btn[data-group="board"]');
    await page.click('.item-tray [data-item="rewind"]');
    await page.click('.tabs button[data-tab="puzzle"]');
    const f2 = await read();
    check('one used in Relaxed leaves three on the puzzle button', f2.cnt === '3' && f2.held === 3, JSON.stringify(f2));
    // An Undo bought in Relaxed (with none held, Buy & use) is the same item: stats count it once, as bought and used.
    await ev(() => { const st = Lull.app.store; st.state.inventory.rewind = 0; st.itemsChanged(); });
    await page.click('.tabs button[data-tab="play"]');
    await page.keyboard.press('Space');
    await page.click('#itembar .group-btn[data-group="board"]');
    const g0 = await ev(() => ({ n: document.querySelector('.item-tray [data-item="rewind"] .n').textContent, bought: Lull.app.store.state.stats.items.bought.rewind, lines: Lull.app.store.state.lines }));
    await page.click('.item-tray [data-item="rewind"]');
    const ask = await ev(() => { const b = document.querySelector('.modal footer .btn.primary'); return b ? b.textContent : null; });
    await page.click('.modal footer .btn.primary');
    const g1 = await ev(() => ({ bought: Lull.app.store.state.stats.items.bought.rewind, lines: Lull.app.store.state.lines }));
    check('Relaxed, none held: the tray shows 5 and Buy & use asks once, for 5', g0.n === '⦵5' && /Buy & use · 5/.test(ask) && g1.bought === g0.bought + 1 && g1.lines === g0.lines - 5, JSON.stringify({ g0, ask, g1 }));
    await page.click('.tabs button[data-tab="puzzle"]');

    // A free hint (from the gift) goes before lines, and still halves the pay.
    const h0 = await ev(() => {
      const m = Lull.app.modes.puzzle, st = Lull.app.store;
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      let n = 700; while (m.ps.solved[Lull.Puzzles.numberedSeed('E', n, m.spin)]) n++;
      m.loadNumbered('E', n);
      st.state.lines = 50; st.state.freebies.hint = 0; st.grant('free-hint'); Lull.app.refreshWallet();
      const b = document.getElementById('puz-hint');
      return { held: st.state.freebies.hint, label: b.textContent, tip: b.dataset.tip, aria: b.getAttribute('aria-label') };
    });
    const hTwo = await ev(() => {
      const st = Lull.app.store, keep = st.state.freebies.hint;
      st.state.freebies.hint = 0; st.itemsChanged();
      const paid = document.getElementById('puz-hint').getAttribute('aria-label');
      st.state.freebies.hint = 2; st.itemsChanged();
      const b = document.getElementById('puz-hint'), two = { label: b.textContent, tip: b.dataset.tip, aria: b.getAttribute('aria-label') };
      st.state.freebies.hint = keep; st.itemsChanged();
      return { paid, two };
    });
    check('the Hint label says its cost as a cost, and two free hints as two', /^Hint, costs \d+ lines$/.test(hTwo.paid) && /2 free/.test(hTwo.two.label) && hTwo.two.tip === 'Hint · 2 free' && hTwo.two.aria === 'Hint, 2 free', JSON.stringify(hTwo));
    check('a free hint held: the Hint button says free instead of its price', h0.held === 1 && /free/.test(h0.label) && !/⦵/.test(h0.label) && h0.tip === 'Hint · free' && h0.aria === 'Hint, free', JSON.stringify(h0));
    await shot('29-hint-free');
    await page.click('#puz-hint');
    const hAsk = await ev(() => { const b = document.querySelector('.modal footer .btn.primary'); return b ? b.textContent : null; });
    await shot('29-hint-free-confirm');
    await page.click('.modal footer .btn.primary');
    const h1 = await ev(() => {
      const m = Lull.app.modes.puzzle, S = Lull.app.store.state, P = S.stats.lines.puzzles;
      const out = { lines: S.lines, held: S.freebies.hint, on: !!(m.ps.current && m.ps.current.hint), used: S.stats.items.used['free-hint'] || 0 };
      const cur = m.ps.current;
      out.want = Lull.Puzzles.pay(m.puzzle.diff, { try: cur.attempts, undos: cur.undos || 0, hint: true, daily: !!m.meta.daily }).pay;
      out.full = Lull.Puzzles.pay(m.puzzle.diff, { try: cur.attempts, undos: cur.undos || 0, hint: false, daily: !!m.meta.daily }).pay;
      m.solved();
      out.paid = S.stats.lines.puzzles - P;
      out.label = [...document.querySelectorAll('#puz-overlay .bs .l')].map((l) => l.textContent).join('|');
      out.steps = (document.querySelector('#puz-overlay .pz-pay-steps') || {}).textContent;
      return out;
    });
    check('the free hint is used before lines: Show · free, nothing spent, and the pay is still halved', hAsk === 'Show · free' && h1.lines === 50 && h1.held === 0 && h1.on && h1.used >= 1 && h1.paid === h1.want && h1.want < h1.full && !h1.steps && /Lines/.test(h1.label), JSON.stringify({ hAsk, h1 }));
    const h2 = await ev(() => { const m = Lull.app.modes.puzzle; m.next(); const b = document.getElementById('puz-hint'), c = m.ps.current; return { gem: b.querySelector('.gem') && b.querySelector('.gem').textContent, cost: Lull.Puzzles.hintCost(m.puzzle.diff, c.attempts + (c.live ? 0 : 1)) }; });
    check('with none left, Hint shows its price again (half what the puzzle pays at this try)', h2.gem === '⦵' + h2.cost, JSON.stringify(h2));

    // What solving pays, and the tries it counts: a try counts once it sets a piece, and tries, a hint and Undos stay
    // with the seed across a reload and a trip through History; the card's Pays says what solving pays now.
    const pick = await ev(() => {
      const m = Lull.app.modes.puzzle;
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      for (let n = 900; n < 1400; n++) {
        const s = Lull.Puzzles.numberedSeed('H', n, m.spin);
        if (m.ps.solved[s] || (m.ps.tries || {})[s]) continue;
        const p = Lull.Puzzles.generate(s);
        if (!p.mods.includes('hold') && !p.mods.includes('vanish')) return { seed: s, n };
      }
      return null;
    });
    await ev((t) => { Lull.app.store.state.lines = 200; Lull.app.refreshWallet(); Lull.app.modes.puzzle.loadNumbered('H', t.n); }, pick);
    const readPay = () => ev(() => {
      const m = Lull.app.modes.puzzle, el = document.querySelector('#puz-id .pz-pays'), c = m.ps.current || {}, now = m.payNow();
      return { seed: m.puzzle.seed, text: el && !el.hidden ? el.textContent : '', tip: el ? el.dataset.tip || '' : '', aria: el ? el.getAttribute('aria-label') : null, attempts: c.attempts, live: !!c.live, hint: !!c.hint, undos: c.undos || 0,
        tries: JSON.stringify((m.ps.tries || {})[m.puzzle.seed] || null), now: now && now.pay, lines: Lull.app.store.state.lines,
        pieces: m.game.s.pieces, cells: m.game.board.toArray().join(','), piece: m.game.piece && m.game.piece.type.id, queue: m.game.queue.map((e) => e.id).join(), goal: m.lines,
        undoTip: document.getElementById('puz-undo').dataset.tip, retryTip: document.getElementById('puz-retry').dataset.tip,
        toast: [...document.querySelectorAll('.toast:not(.out)')].map((t) => t.textContent).join('|') };
    });
    const payAt = (o) => ev((q) => Lull.Puzzles.pay('H', q).pay, o);
    const setOne = () => ev(() => { const m = Lull.app.modes.puzzle, g = m.game, t = m.puzzle.targets[g.s.pieces]; g.piece.rot = t.r; g.piece.x = t.x; g.piece.y = t.y; m.action('drop'); return g.s.pieces; });
    const t0 = await readPay();
    for (let i = 0; i < 3; i++) await page.click('#puz-retry');
    const t1 = await readPay(), clean = await payAt({ try: 1 });
    check('Pays: a fresh Hard puzzle pays the clean first try; Retry three times with no piece set costs nothing', t0.now === clean && clean === 27 && t1.now === clean && t1.attempts === 0 && new RegExp('Pays ⦵' + clean + '$').test(t1.text) && t1.aria === 'Pays ' + clean + ' lines' && !t1.tip, JSON.stringify({ t0, t1 }));
    await setOne();
    const t2 = await readPay();
    // Puzzles explain no pay: Undo and Retry say only what they are.
    check('a clean first try: neither Undo\'s nor Retry\'s tooltip explains pay', !/Pays|×1\.5/.test(t2.undoTip) && t2.retryTip === 'Retry', JSON.stringify({ u: t2.undoTip, r: t2.retryTip }));
    await ev(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
    await page.click('#puz-retry');
    const t3 = await readPay();
    check('  Retry that lowers the pay shows no note; Retry says only Retry', !/Pays/.test(t3.toast) && t3.retryTip === 'Retry' && !/Ends/.test(t3.undoTip || ''), JSON.stringify({ toast: t3.toast, r: t3.retryTip, u: t3.undoTip }));
    await setOne();
    const t4 = await readPay(), try2 = await payAt({ try: 2 });
    check('a piece set counts the try; Retry, a piece set: Pays shows the second try\'s pay', t2.attempts === 1 && t2.live && t3.attempts === 1 && !t3.live && t3.now === try2 && t4.attempts === 2 && t4.live && t4.now === try2 && try2 === 14 && !t4.tip && t4.tries === JSON.stringify({ n: 2, hint: false, undos: 0 }), JSON.stringify({ t2, t3, t4 }));
    await shot('29-pays');
    // An Undo (bought at 5) is kept with the seed too.
    await page.click('#puz-undo');
    await setOne();
    const t5 = await readPay();
    await ev(() => Lull.app.saveNow());
    await page.reload();
    await page.waitForTimeout(500);
    await ev(() => { for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); if (Lull.app.tab !== 'puzzle') Lull.app.setTab('puzzle'); });
    await page.waitForTimeout(150);
    const t6 = await readPay();
    check('a reload keeps the try, its Undos and the pay', t5.undos === 1 && t6.seed === pick.seed && t6.attempts === t5.attempts && t6.undos === 1 && t6.live && t6.now === t5.now && t6.text === t5.text && t6.tries === t5.tries && t6.tries === JSON.stringify({ n: 2, hint: false, undos: 1 }), JSON.stringify({ t5, t6 }));
    // ... and the board: the attempt goes on as it stood, never a fresh board on the same try (a free Retry).
    check('  and the attempt\'s board: the same cells, piece in play, queue, pieces set and lines toward the goal', t5.pieces === 1 && t6.pieces === t5.pieces && t6.cells === t5.cells && t6.piece === t5.piece && t6.queue === t5.queue && t6.goal === t5.goal, JSON.stringify({ t5: [t5.pieces, t5.piece, t5.queue], t6: [t6.pieces, t6.piece, t6.queue], same: t6.cells === t5.cells }));
    // A saved attempt that cannot come back (here: none kept) is over: the fresh board is the next try once a piece is set.
    const lost = await ev(async () => {
      const m = Lull.app.modes.puzzle, c = m.ps.current;
      c.board = null;
      m.load(c.seed, c, true);
      return { pieces: m.game.s.pieces, live: m.ps.current.live, attempts: m.ps.current.attempts, now: m.payNow().pay };
    });
    check('  an attempt with no board to come back to is over: a fresh board, and the next piece set is the next try', lost.pieces === 0 && !lost.live && lost.attempts === t5.attempts && lost.now === await payAt({ try: t5.attempts + 1, undos: 1 }), JSON.stringify(lost));
    // Away to another puzzle and back through History: the board starts over, so the next piece set is the next try.
    await ev((t) => Lull.app.modes.puzzle.loadNumbered('H', t.n + 1), pick);
    await page.click('#puz-history');
    await page.waitForTimeout(150);
    await ev((s) => { const row = [...document.querySelectorAll('.modal-hist .hist-row')].find((r) => r.textContent.includes(s)); row.querySelector('.icon-btn.play').click(); }, pick.seed);
    await page.waitForTimeout(150);
    const t7 = await readPay(), try3 = await payAt({ try: 3 });
    check('away and back through History: the tries, the Undos and a hint stay with the seed; Pays is the next try\'s', t7.seed === pick.seed && t7.tries === t6.tries && t7.attempts === 2 && t7.undos === 1 && !t7.live && t7.now === try3, JSON.stringify({ t6, t7 }));
    // A hint: its price is half of what it pays now; the question says nothing about pay.
    await page.click('#puz-hint');
    const hq = await ev(() => ({ body: document.querySelector('.modal .modal-body, .modal p') && document.querySelector('.modal').textContent, btn: document.querySelector('.modal footer .btn.primary').textContent }));
    const hcost = await ev(() => Lull.Puzzles.hintCost('H', 3)), withHint = await payAt({ try: 3, hint: true });
    check('the hint asks without explaining pay, and costs half of what the puzzle pays at this try', !/Pays/.test(hq.body) && hq.btn === 'Show · ' + hcost + ' ⦵' && hcost === withHint, JSON.stringify({ hq, hcost, withHint }));
    const w0 = (await readPay()).lines;
    await page.click('.modal footer .btn.primary');
    const t8 = await readPay();
    check('bought: charged at the moment, the hint kept with the seed, Pays halved', t8.lines === w0 - hcost && t8.hint && t8.tries === JSON.stringify({ n: 2, hint: true, undos: 1 }) && t8.now === withHint && !t8.tip, JSON.stringify(t8));
    // Solved (on the third try): the card says how the pay was made, and the wallet rises by it.
    const sol = await ev(async () => {
      const m = Lull.app.modes.puzzle, S = Lull.app.store.state, w = S.lines;
      let guard = 0;
      while (!m.done && m.game.piece && guard++ < 40) { const g = m.game, t = m.puzzle.targets[g.s.pieces]; g.piece.rot = t.r; g.piece.x = t.x; g.piece.y = t.y; m.action('drop'); }
      await new Promise((r) => setTimeout(r, 60));
      const hb = document.getElementById('puz-hint');
      return { done: m.done, gained: Math.round((S.lines - w) * 100) / 100, steps: (document.querySelector('#puz-overlay .pz-pay-steps') || {}).textContent, pay: [...document.querySelectorAll('#puz-overlay .bs.pay')].map((x) => x.textContent).join(), tries: (m.ps.tries || {})[m.puzzle.seed] || null, pays: (document.querySelector('#puz-id .pz-pays') || {}).hidden,
        hint: { text: hb.textContent, on: hb.classList.contains('on'), pressed: hb.getAttribute('aria-pressed'), disabled: hb.disabled, gem: !!hb.querySelector('.gem') } };
    });
    const r3 = await ev(() => Lull.Puzzles.pay('H', { try: 3, undos: 1, hint: true }));
    check('solved on the third try with a hint: +' + r3.pay + ', with no steps explaining it', sol.done && sol.gained === r3.pay && !sol.steps && /^\+6 ⦵Lines$/.test(sol.pay) && sol.tries === null && sol.pays === true, JSON.stringify({ sol, r3 }));
    check('  solved with a hint: the Hint button, off, still says Hints on and shows no price', sol.hint.disabled && sol.hint.on && sol.hint.pressed === 'true' && /Hints on/.test(sol.hint.text) && !sol.hint.gem, JSON.stringify(sol.hint));
    await shot('29-solved-steps');
    // Replaying it: a solved seed pays nothing, so its hint is free (no price, no question, the gift's hint kept).
    const rep = await ev(async () => {
      const m = Lull.app.modes.puzzle, S = Lull.app.store.state, w = S.lines;
      m.hideCard(); m.retry();
      S.freebies.hint = 1; Lull.app.store.itemsChanged();
      const b = document.getElementById('puz-hint'), before = { text: b.textContent, gem: !!b.querySelector('.gem'), tip: b.dataset.tip };
      b.click();
      await new Promise((r) => setTimeout(r, 60));
      const out = { before, modal: Lull.UI.modalOpen(), on: !!(m.ps.current && m.ps.current.hint), spent: w - S.lines, freeLeft: S.freebies.hint, cost: m.hintCost() };
      S.freebies.hint = 0; Lull.app.store.itemsChanged();
      return out;
    });
    check('  a replay of a solved seed: Hint has no price, shows at once, costs nothing and keeps the gift\'s free hint', !rep.before.gem && /free on a puzzle solved before/.test(rep.before.tip) && !rep.modal && rep.on && rep.spent === 0 && rep.freeLeft === 1 && rep.cost === 0, JSON.stringify(rep));
    await ev(() => Lull.app.modes.puzzle.hideCard());
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.puzzle.loadNumbered('H', 3); });
  }

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
      spin: !!document.querySelector('#puz-mods .mod-spin') && /^Z turns (counter-)?clockwise/.test(document.querySelector('#puz-mods .mod-spin').dataset.tipFoot || ''),
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
  // The Daily's ×2 comes once a date for each difficulty: the other turn setting's Daily is another puzzle, not another ×2.
  const dTwice = await ev(() => {
    const m = Lull.app.modes.puzzle, S = Lull.app.store.state, keep = Lull.app.settings.ccwPuzzles, key = Lull.dateKey(), d = m.puzzle.diff, first = m.puzzle.seed;
    Lull.app.settings.ccwPuzzles = !keep;
    m.loadDaily();
    const now = m.payNow(), out = { first, seed: m.puzzle.seed, daily: m.meta.daily === key, nowDaily: now.daily, now: now.pay, plain: Lull.Puzzles.pay(d, { try: 1 }).pay, tip: document.querySelector('#puz-id .pz-pays').dataset.tip, rec: (m.ps.dailyPaid || {})[key] || '' };
    const P = S.stats.lines.puzzles;
    m.solved();
    out.paid = Math.round((S.stats.lines.puzzles - P) * 100) / 100;
    out.steps = (document.querySelector('#puz-overlay .pz-pay-steps') || {}).textContent;
    Lull.app.settings.ccwPuzzles = keep;
    out.d = d;
    return out;
  });
  check('the Daily with the other turn setting: another puzzle, paid without a second ×2 (and no tooltip explaining it)', dTwice.daily && dTwice.seed !== dTwice.first && dTwice.rec.includes(dTwice.d) && !dTwice.nowDaily && dTwice.now === dTwice.plain && dTwice.paid === dTwice.plain && !dTwice.steps && !dTwice.tip, JSON.stringify(dTwice));
  // The info line gives way a whole part at a time, never a character of a date or a number: a Daily down to 320 px.
  {
    const fitAt = [];
    for (const [w, hgt] of [[520, 760], [441, 760], [400, 700], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await page.waitForTimeout(120);
      if (!fitAt.length) await ev(() => { const m = Lull.app.modes.puzzle; while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); m.hideCard(); m.ps.diff = 'M'; m.loadDaily(); });
      await page.waitForTimeout(120);
      fitAt.push(await ev((w) => {
        const box = document.getElementById('puz-id'), where = box.querySelector('.pz-where'), pays = box.querySelector('.pz-pays');
        const shown = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        const text = box.innerText.replace(/\s+/g, ' ').trim(); // only what shows (innerText skips the parts set to display: none)
        return { w, cut: where.scrollWidth > where.clientWidth + 1, text, pays: shown(pays) && /Pays ⦵\d+$/.test(pays.textContent), cls: [...box.classList].filter((c) => c.startsWith('no-')).join(' ') };
      }, w));
    }
    const day = await ev(() => new Date().getDate());
    check('a Medium Daily\'s info line fits at every width without cutting a word: parts go whole (count, weekday, difficulty, date)', fitAt.every((f) => !f.cut && f.pays && /^Daily/.test(f.text)) && /Medium/.test(fitAt[0].text) && /pieces/.test(fitAt[0].text) && fitAt.filter((f) => f.w >= 390).every((f) => new RegExp('\\b' + day + '\\b').test(f.text)), JSON.stringify(fitAt));
    await page.setViewportSize({ width: 520, height: 760 });
    await page.waitForTimeout(120);
  }
  // Retry on a solved puzzle plays it again (it used to throw: a solved puzzle has no current entry).
  await page.click('#puz-retry');
  check('Retry after solving starts it again (a try that counts once a piece is set)', await ev(() => { const m = Lull.app.modes.puzzle; return m.game.s.pieces === 0 && !m.done && !m.cardOpen && m.ps.current && m.ps.current.attempts === 0 && !m.ps.current.live; }));
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
  // A factory state set in the page: `src` is a function's source run with (f, F) — the save's factory and Lull.Factory —
  // then the page rebuilt. The states every layout check runs through:
  const FAC = {
    fresh: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); Lull.app.store.state.lines = 0; },
    affordable: (f, F) => { Lull.app.store.state.lines = 5000; f.crate = '12341234123'; },
    full: (f, F) => { f.crate = '3'.repeat(F.capacity(f)); f.lift = [{ n: 4, s: 0, c: 1, u: 1, y: F.LIFT.len, py: F.LIFT.len }]; f.lastTick = Date.now(); },
    maxed: (f, F) => { for (const k of ['stamp', 'store', 'press', 'crate']) while (F.upgrade(f, k)); f.lift = []; f.belt = []; f.crate = '1'.repeat(200); Lull.app.store.state.lines = 0; },
  };
  const facSet = (fn, p) => (p || page).evaluate((src) => {
    const f = Lull.app.store.state.factory;
    new Function('return ' + src)()(f, Lull.Factory);
    f.lastTick = Date.now();
    Lull.app.refreshWallet(); Lull.app.modes.factory.build();
  }, fn.toString());
  await facSet(FAC.fresh);
  await page.click('.tabs button[data-tab="factory"]');
  await page.waitForTimeout(300);
  const floor = await ev(() => {
    const c = document.getElementById('cv-floor'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]);
    return { w: c.width, colors: colors.size, stats: Array.from(document.querySelectorAll('#fac-top .fac-stat i')).map((e) => e.textContent).join('|') };
  });
  check('the factory floor is drawn, over three plain figures', floor.w > 0 && floor.colors > 8 && floor.stats === 'Lines / hour|Lines in crate|Full in', JSON.stringify(floor));
  const fresh = await ev(() => { const b = document.querySelector('#fac-collect .btn'); return { disabled: b.disabled, text: b.textContent }; });
  check('nothing to collect yet in a new crate (four minos, half a line): Collect says when (the first ship, under five minutes)', fresh.disabled && /^Collect in [3-5]m$/.test(fresh.text), JSON.stringify(fresh));
  // The floor draws no text; with the whole chain at rest (a full crate, all the way back) its still layers are never
  // repainted, and a frame is cheap even with the store and the crate full.
  await facSet((f, F) => { for (const k of ['stamp', 'store', 'press', 'crate']) while (F.upgrade(f, k)); f.lastTick = Date.now() - 40 * 3600e3; F.catchUp(f, Date.now()); });
  await page.waitForTimeout(1000); // the bigger store and crate grow into place first
  const idle = await ev(async () => {
    const v = Lull.app.modes.factory.view, ctx = v.ctx, orig = ctx.fillText, f = Lull.app.store.state.factory;
    let texts = 0, frames = 0, ms = 0;
    ctx.fillText = function () { texts++; return orig.apply(this, arguments); };
    const render = v.render;
    v.render = function () { const t0 = performance.now(); render.apply(this, arguments); ms += performance.now() - t0; frames++; };
    const d0 = v.staticDraws;
    await new Promise((r) => setTimeout(r, 6000));
    ctx.fillText = orig; v.render = render;
    return { texts, redraws: v.staticDraws - d0, frames, avg: +(ms / Math.max(1, frames)).toFixed(3), store: f.store, cap: Lull.Factory.storeCap(f), crate: f.crate.length, full: Lull.Factory.isFull(f) };
  });
  console.log('       floor frame: ' + JSON.stringify(idle));
  check('the floor draws no text, repaints nothing still while the chain rests, and a full frame is quick', idle.texts === 0 && idle.redraws === 0 && idle.frames > 10 && idle.avg < 4 && idle.full && idle.store === idle.cap, JSON.stringify(idle));
  // Waiting, all the way back: the view's flags are the model's, the figures warn, the tab has its dot, Collect breathes.
  const backed = await ev(() => {
    const M = Lull.app.modes.factory, v = M.view, f = Lull.app.store.state.factory, w = Lull.Factory.waits(f);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
      flags: v.flags.crateFull === w.crateFull && v.flags.storeFull === w.storeFull && same(v.flags.stampHeld, w.stamps) && same(v.flags.pressHeld, w.pressHeld) && same(v.flags.starving, f.molds.map((m, k) => w.starving.includes(k))),
      w, warn: Array.from(document.querySelectorAll('#fac-top .fac-stat.warn')).map((e) => e.textContent).join('|'),
      badge: !!document.querySelector('.tabs button[data-tab="factory"] .badge'), ring: document.querySelector('#fac-collect .btn').classList.contains('full'),
      store: document.querySelector('.fac-hot[data-hot=store]').dataset.tip, head: document.querySelector('.fac-hot[data-hot=head]').dataset.tip,
    };
  });
  check('a full crate backs the chain up: the floor\'s waiting states are the model\'s, the figures say so, the tab has its dot, Collect breathes',
    backed.flags && backed.w.crateFull && backed.w.storeFull && backed.w.stamps.every(Boolean) && /Full in\s*Now/.test(backed.warn) && /Lines in crate/.test(backed.warn) && backed.badge && backed.ring
    && backed.store === '216 of 216 minos\nFull' && backed.head === 'Waiting: store full', JSON.stringify(backed));
  await shot('30-factory-backed-up');
  // A full store's warm cues hold steady: the model's flag drops for a few seconds after every feed (the next mino is
  // still rolling to the belt's end), but the rim, the belt's head and the held heads do not blink with it.
  const warmth = await ev(() => {
    const F = Lull.Factory, M = Lull.app.modes.factory, v = M.view, look = Lull.app.look();
    const g = F.create();
    for (const k of ['stamp', 'stamp', 'stamp', 'press', 'press', 'press', 'store', 'store', 'crate', 'crate', 'crate', 'crate']) F.upgrade(g, k);
    g.store = F.storeCap(g); F.run(g, 3600 * 1000); F.collect(g, 'd');
    let model = 0, warm = 0, pm = null, pw = null, on = 0, n = 0;
    for (let i = 0; i < 2400; i++) {
      F.run(g, 500);
      if (i % 600 === 0) F.collect(g, 'd');
      v.render(0.5, g, look);
      const a = v.flags.storeFull, b = v.flags.storeWarm;
      if (i > 0) { if (a !== pm) model++; if (b !== pw) warm++; }
      if (a && !b) return { bad: 'the model waits at a full store but the floor is not warm', i };
      pm = a; pw = b; n++; if (b) on++;
    }
    v.render(0, M.f, look);
    return { model, warm, on: +(on / n).toFixed(2), store: g.store, cap: F.storeCap(g) };
  });
  check('a full store\'s warm cues hold steady while presses draw on it (the model\'s own flag flickers)', !warmth.bad && warmth.model >= 10 && warmth.warm <= 2 && warmth.on > 0.9, JSON.stringify(warmth));
  // Short of minos: one stamper, two presses, an empty store.
  await facSet((f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); F.upgrade(f, 'press'); F.upgrade(f, 'crate'); f.store = 0; f.stamps[0].t = 0; f.molds[1].t = 0; f.molds[1].got = 0; });
  await page.waitForTimeout(500);
  const starved = await ev(() => {
    const M = Lull.app.modes.factory, v = M.view, f = Lull.app.store.state.factory, w = Lull.Factory.waits(f);
    M.refreshTips(); M.update();
    return { w, flags: v.flags.starving, tip: document.querySelector('.fac-hot[data-hot=press][data-k="1"]').dataset.tip, rate: document.querySelector('#fac-top .fac-stat').dataset.tip, store: document.querySelector('.fac-hot[data-hot=store]').dataset.tip };
  });
  check('short of minos: the store is empty, the press waits for minos, the rate\'s tooltip shows both ends of the chain',
    starved.w.storeEmpty && starved.w.starving.length && starved.flags.some(Boolean) && /\nWaiting for minos$/.test(starved.tip) && starved.rate === 'Stampers make 36 minos an hour\nPresses use 54 minos an hour' && /^0 of 54 minos\nEmpty$/.test(starved.store), JSON.stringify(starved));
  await shot('31-factory-starved');
  // Collect, three ways: the button (the lines fly to the wallet, which counts them only on arrival), the crate, C.
  const lines0 = await ev(() => { const f = Lull.app.store.state.factory; f.crate = '1234'.repeat(12); f.lift = []; Lull.app.modes.factory.view.flushLift(); return Lull.app.store.state.lines; });
  await page.waitForTimeout(350);
  const label = await ev(() => document.querySelector('#fac-collect .btn').textContent);
  check('every eight minos in the crate are a line: 48 read Collect 6', /^Collect 6 ⦵$/.test(label) && (await ev(() => Lull.Factory.MPL)) === 8, label);
  const flight = await ev(async () => {
    const app = Lull.app, ach = app.achieve, n = () => document.getElementById('wallet-n').textContent;
    app.achieve = () => {};
    const before = n();
    document.querySelector('#fac-collect .btn').click();
    const at0 = { wallet: n(), fly: !!document.querySelector('.fac-fly'), text: (document.querySelector('.fac-fly') || {}).textContent };
    let changedWhileFlying = false;
    const t0 = performance.now();
    while (document.querySelector('.fac-fly') && performance.now() - t0 < 3000) { if (n() !== before) changedWhileFlying = true; await new Promise((r) => requestAnimationFrame(r)); }
    await new Promise((r) => setTimeout(r, 30));
    app.achieve = ach;
    return { before, at0, changedWhileFlying, after: n(), gone: !document.querySelector('.fac-fly') };
  });
  check('collecting banks the lines; they fly into the wallet, which counts them on arrival', (await ev(() => Lull.app.store.state.lines)) === lines0 + 6 && flight.at0.fly && /^\+6 ⦵$/.test(flight.at0.text) && flight.at0.wallet === flight.before && !flight.changedWhileFlying && flight.gone && flight.after !== flight.before, JSON.stringify(flight));
  await ev(() => { Lull.app.store.state.factory.crate = '5'.repeat(9); });
  await page.waitForTimeout(100);
  await page.click('.fac-hot[data-hot=crate]');
  check('clicking the crate collects, leaving the loose mino', (await ev(() => [Lull.app.store.state.lines, Lull.app.store.state.factory.crate].join())) === (lines0 + 7) + ',5');
  await ev(() => { Lull.app.store.state.factory.crate = '6'.repeat(8); });
  await page.keyboard.press('KeyC');
  check('C collects', (await ev(() => Lull.app.store.state.lines)) === lines0 + 8);
  const still = await ev(() => {
    const app = Lull.app, ach = app.achieve; app.achieve = () => {};
    app.settings.motion = 'reduced'; app.applySettings();
    Lull.app.store.state.factory.crate = '7'.repeat(8);
    const before = document.getElementById('wallet-n').textContent;
    Lull.app.modes.factory.collect();
    const after = document.getElementById('wallet-n').textContent;
    app.settings.motion = 'full'; app.applySettings(); app.achieve = ach;
    return { before, after };
  });
  check('with reduced motion, the wallet counts collected lines at once', still.before !== still.after, JSON.stringify(still));
  // The floor's hotspots: ten, in the chain's order, each named.
  const hots = await ev(() => Array.from(document.querySelectorAll('#fac-hots .fac-hot')).map((b) => b.dataset.id + ':' + b.dataset.hot + ':' + (b.getAttribute('aria-label') || '')));
  check('ten hotspots in the chain\'s order: four heads, the store, four bays, the crate', hots.length === 10 && hots.map((s) => s.split(':')[0]).join() === 'head0,head1,head2,head3,store,press0,press1,press2,press3,crate' && hots.every((s) => s.split(':')[2]), JSON.stringify(hots));
  // Building, from the list's rows: a quiet Build until it can be afforded; then each kind, in the chain's order.
  await facSet(FAC.fresh);
  await page.waitForTimeout(200);
  const rowsList = await ev(() => ({ form: Lull.app.modes.factory.form, ups: Array.from(document.querySelectorAll('.fac-up')).map((u) => u.dataset.up + '|' + u.querySelector('.t').textContent + '|' + u.querySelector('.d').textContent + '|' + u.querySelector('.btn').textContent),
    quiet: Array.from(document.querySelectorAll('.fac-up .btn')).every((b) => b.getAttribute('aria-disabled') === 'true' && !b.classList.contains('primary') && !b.disabled) }));
  // What each row says, from the model (Factory.nextUpgrade, in lines at TUNE.PAY), and in words.
  const rowsWant = await ev(() => {
    const F = Lull.Factory, f = F.create(), q = F.quarters, P = F.TUNE.PAY, u = (k) => F.nextUpgrade(f, k);
    const ph = F.perHour(f), press = u('press'), stamp = u('stamp'), store = u('store'), crate = u('crate');
    return ['stamp|Second stamper|' + stamp.from + ' → ' + stamp.to + ' minos / hour|Build · ' + stamp.cost + ' ⦵',
      'store|Bigger store|' + store.from + ' → ' + store.to + ' minos|Build · ' + store.cost + ' ⦵',
      'press|Pentomino press|+' + q((Math.min(F.supply(f), press.to) - ph) * P) + ' lines / hour|Build · ' + press.cost + ' ⦵',
      'crate|Bigger crate|' + crate.from + ' → ' + crate.to + ' lines|Build · ' + crate.cost + ' ⦵'];
  });
  check('the list, in the chain\'s order, in plain words; a Build that cannot be afforded yet is quiet', rowsList.form === 'rows' && rowsList.quiet && rowsList.ups.join('\n') === rowsWant.join('\n') && rowsWant.join('\n') === [
    'stamp|Second stamper|36 → 72 minos / hour|Build · 350 ⦵', 'store|Bigger store|54 → 108 minos|Build · 150 ⦵',
    'press|Pentomino press|+1.5 lines / hour|Build · 300 ⦵', 'crate|Bigger crate|6 → 12 lines|Build · 30 ⦵'].join('\n'), JSON.stringify({ rowsList, rowsWant }));
  await ev(() => { Lull.app.store.state.lines = 2000; Lull.app.refreshWallet(); });
  await page.waitForTimeout(350);
  for (const kind of ['press', 'stamp', 'store', 'crate']) await page.click('.fac-up[data-up=' + kind + '] .btn:not([aria-disabled])');
  const built = await ev(() => { const f = Lull.app.store.state.factory; return { lv: [f.stampers, f.storeLevel, f.presses, f.crateLevel], spent: f.stats.spent, stamp: document.querySelector('.fac-up[data-up=stamp] .d').textContent, press: document.querySelector('.fac-up[data-up=press] .d').textContent }; });
  check('building each kind from its row: a stamper, a store, a press, a crate', built.lv.join() === '2,1,2,1' && built.spent === 300 + 350 + 150 + 30 && built.stamp === '72 → 108 minos / hour' && built.press === '+2.25 lines / hour', JSON.stringify(built));
  // A bigger store says what it is for: once the presses use more than the stampers make, how long it feeds them.
  const storeRow = await ev(() => {
    const f = Lull.app.store.state.factory, F = Lull.Factory, keep = JSON.parse(JSON.stringify(f));
    F.upgrade(f, 'press'); Lull.app.modes.factory.build();
    const out = { t: document.querySelector('.fac-up[data-up=store] .d').textContent, tip: document.querySelector('.fac-up[data-up=store] .d').dataset.tip, S: F.supply(f), D: F.demand(f), from: F.nextUpgrade(f, 'store').from, to: F.nextUpgrade(f, 'store').to };
    for (const k of Object.keys(f)) delete f[k];
    Object.assign(f, keep); Lull.app.modes.factory.build();
    return out;
  });
  const feedH = Math.max(0.5, Math.round(storeRow.to / (storeRow.D - storeRow.S) * 2) / 2);
  check('the store row, presses short of minos: how long the bigger store feeds them (its tooltip says it whole)', storeRow.D > storeRow.S && storeRow.t === 'Feeds the presses ' + feedH + ' h' && storeRow.tip === 'A full store keeps the presses going ' + feedH + ' h while the stampers fall behind\n' + storeRow.from + ' → ' + storeRow.to + ' minos', JSON.stringify(storeRow));
  const keepTip = await ev(() => { Lull.app.modes.factory.build(); const d = document.querySelector('.fac-up[data-up=store] .d'); return d && d.dataset.tip; });
  check('  and while the stampers keep up, its tooltip says so', /^Stampers keep up · [\d,]+ → [\d,]+ minos$/.test(keepTip || ''), keepTip);
  // The next head builds from the floor, and the keyboard focus stays there.
  const headBuild = await ev(() => {
    const M = Lull.app.modes.factory, f = Lull.app.store.state.factory;
    document.querySelector('.fac-hot[data-id=head2]').focus();
    document.activeElement.click();
    const a = document.activeElement;
    return { stampers: f.stampers, id: a.dataset.id, hot: a.dataset.hot };
  });
  check('the next head builds from the floor, and the keyboard focus stays on it', headBuild.stampers === 3 && headBuild.id === 'head2' && headBuild.hot === 'head', JSON.stringify(headBuild));
  const pointTo = await ev(() => {
    document.querySelector('.fac-hot[data-id=store]').click();
    const a = document.activeElement.closest('.fac-up');
    document.querySelector('.fac-hot[data-id=head0]').click();
    const b = document.activeElement.closest('.fac-up');
    return [a && a.dataset.up, b && b.dataset.up];
  });
  check('a head or the store on the floor points to its entry in the list', pointTo.join() === 'store,stamp', JSON.stringify(pointTo));
  // A press opens its mold picker; a shape pins it.
  await page.click('.fac-hot[data-hot=press][data-k="1"]');
  await page.mouse.move(2, 2);
  await page.waitForTimeout(150);
  const mold = await ev(() => ({ title: (document.querySelector('.modal header') || {}).textContent, tiles: document.querySelectorAll('.modal .mold').length, cap: (document.querySelector('.modal .mold-cap') || {}).textContent }));
  check('clicking a press opens its mold picker', /^Pentomino mold/.test(mold.title) && mold.tiles === 12 && mold.cap === 'Any', JSON.stringify(mold));
  await shot('32-factory-mold');
  await page.click('.modal .mold[data-s="3"]');
  const pinned = await ev(() => ({ pin: Lull.app.store.state.factory.molds[1].pin, name: Lull.Factory.shapeName(5, 3), label: document.querySelector('.fac-hot[data-hot=press][data-k="1"]').getAttribute('aria-label'), modal: !!document.querySelector('.modal') }));
  check('choosing a mold pins the press', pinned.pin === 3 && !pinned.modal && pinned.label === 'Pentomino press, mold ' + pinned.name, JSON.stringify(pinned));
  // Time away with the Factory in front: nothing to read, the new minos fade in.
  const awayHere = await ev(() => {
    const f = Lull.app.store.state.factory;
    f.crate = ''; f.lastTick = Date.now() - 12 * 3600e3;
    document.getElementById('toasts').replaceChildren();
    Lull.fromNative({ type: 'shown' });
    const v = Lull.app.modes.factory.view;
    return { len: f.crate.length, cap: Lull.Factory.capacity(f), fading: !!v.catchA, toast: document.getElementById('toasts').textContent };
  });
  check('time away on the Factory tab fills the crate, the new rows fading in, with no message', awayHere.len <= awayHere.cap && awayHere.len > awayHere.cap - 8 && awayHere.fading && !/While you were away/.test(awayHere.toast), JSON.stringify(awayHere));
  await ev(() => Lull.Factory.collect(Lull.app.store.state.factory));
  await page.click('.tabs button[data-tab="play"]');
  const away = await ev(() => {
    const f = Lull.app.store.state.factory;
    f.crate = ''; f.lastTick = Date.now() - 12 * 3600e3;
    document.getElementById('toasts').replaceChildren();
    Lull.fromNative({ type: 'shown' });
    return { len: f.crate.length, cap: Lull.Factory.capacity(f), toast: document.getElementById('toasts').textContent };
  });
  check('time away elsewhere fills the crate and says so, in lines', away.len <= away.cap && away.len > away.cap - 8 && /While you were away: [\d.,]+ lines · Crate full/.test(away.toast), JSON.stringify(away));
  await ev(() => Lull.Factory.collect(Lull.app.store.state.factory));
  // Timers crawl while Lull is hidden: the quiet catch-ups they run are still announced on return.
  const quiet = await ev(() => {
    const f = Lull.app.store.state.factory;
    f.lastTick = Date.now() - 3 * 3600e3;
    document.getElementById('toasts').replaceChildren();
    Lull.app.modes.factory.tick();
    const silent = document.getElementById('toasts').textContent;
    document.getElementById('toasts').replaceChildren();
    Lull.fromNative({ type: 'shown' });
    return { silent, after: document.getElementById('toasts').textContent };
  });
  check('time caught up behind the scenes is announced on return', /While you were away: [\d.,]+ lines/.test(quiet.after) && !/While you were away/.test(quiet.silent), JSON.stringify(quiet));
  await ev(() => Lull.Factory.collect(Lull.app.store.state.factory));
  await ev(() => Lull.app.setTab('factory'));
  const facKeep = await ev(() => JSON.stringify({ f: Lull.app.store.state.factory, lines: Lull.app.store.state.lines, owned: Lull.app.store.state.owned, ach: Lull.app.store.state.achievements || {} }));

  // The layout follows the room the bar and the list leave: the form of the list, the cell size and the scene's height
  // by the rule (factoryview.js fit), worked out here from what the page measures; the plate takes it all, so no empty
  // band is left under the list (or under the bar once the list is gone) at any stage; the plate starts where the other
  // tabs start; nothing sideways, no scroll (a phone on its side scrolls below the plate).
  const LAY = {
    fresh: FAC.fresh,
    starved: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); F.upgrade(f, 'press'); F.upgrade(f, 'press'); F.upgrade(f, 'crate'); F.upgrade(f, 'crate'); f.store = 0; Lull.app.store.state.lines = 0; },
    mid: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); while (F.upgrade(f, 'stamp')); while (F.upgrade(f, 'store')); F.upgrade(f, 'press'); F.run(f, 2 * 3600e3); Lull.app.store.state.lines = 0; },
    full: FAC.full,
    maxed: FAC.maxed,
  };
  const layoutAt = async (p, w, hgt, want, touch) => {
    const pev = (fn, arg) => p.evaluate(fn, arg);
    await p.setViewportSize({ width: w, height: hgt });
    await pev(() => Lull.app.setTab('puzzle'));
    await p.waitForTimeout(150);
    const other = await pev(() => { const v = document.getElementById('view-puzzle').getBoundingClientRect(), b = document.querySelector('#view-puzzle .puz-bar').firstElementChild.getBoundingClientRect(); return Math.round(b.top - v.top); });
    await pev(() => Lull.app.setTab('factory'));
    await p.waitForTimeout(150);
    const Hs = [];
    for (const [name, fn] of Object.entries(LAY)) {
      await facSet(fn, p);
      await p.waitForTimeout(250);
      const R = await pev(() => {
        const M = Lull.app.modes.factory, v = M.view, vw = document.getElementById('view-factory'), vr = vw.getBoundingClientRect();
        const plate = document.getElementById('fac-plate').getBoundingClientRect(), col = document.querySelector('.fac-col').getBoundingClientRect();
        const list = document.getElementById('fac-list'), lr = list.getBoundingClientRect(), bar = document.querySelector('.fac-bar'), cb = document.querySelector('#fac-collect .btn').getBoundingClientRect();
        const stage = document.querySelector('.fac-stage'), sr = stage.getBoundingClientRect();
        const st = getComputedStyle(vw), inner = vw.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
        const hidden = list.classList.contains('hidden'), g = list.firstElementChild, n = hidden ? 0 : list.querySelectorAll('.fac-up').length;
        return { cs: v.cs, boxW: v.boxWidth(), form: M.form, H: v.S.H, plateH: Math.round(plate.height), plateW: plate.width, plateL: plate.left - col.left, colW: col.width, plateTop: Math.round(plate.top - vr.top), plateBottom: Math.round(plate.bottom), viewBottom: Math.round(vr.bottom),
          inner, chrome: stage.offsetHeight - document.getElementById('fac-plate').offsetHeight, listM: parseFloat(getComputedStyle(list).marginTop) || 0, listH: g ? g.offsetHeight : 0, n, cards: list.classList.contains('cards'),
          // The room left under the last thing on the tab (the list, or the bar once the list is gone), to the view's
          // padding.
          under: Math.round((vr.bottom - parseFloat(st.paddingBottom)) - (hidden ? sr.bottom : lr.bottom)),
          col: Math.round(col.width), primary: vw.querySelectorAll('.btn.primary').length, listHidden: hidden, listBottom: Math.round(lr.bottom), collectBottom: Math.round(cb.bottom),
          sideways: vw.scrollWidth > vw.clientWidth || bar.scrollWidth > bar.clientWidth + 1, scrolled: vw.scrollHeight > vw.clientHeight + 1 };
      });
      const tag = w + '×' + hgt + (touch ? ' touch' : '') + ' ' + name + ': ';
      // The rule, from the measured room: the list as rows where the room holds all four rows beside a scene 27 cells
      // high at the width's cell (by the window alone); the scene takes what the list leaves, 23 to 84 cells high (a
      // phone on its side: the view's own height).
      const sidewaysPhone = touch && w > hgt, csw = Math.max(6, Math.min(22, Math.floor(R.boxW / 37.5)));
      const listH = (form, n = R.n) => (!n ? 0 : R.listM + (form === 'rows' ? n * 48 + 2 : Math.ceil(n / 2) * 48 + (n > 2 ? 2 : 0)));
      const left = R.inner - R.chrome, form = !sidewaysPhone && left - listH('rows', 4) >= csw * 27 ? 'rows' : 'cards';
      const avail = sidewaysPhone ? R.inner : left - listH(form);
      let cs = Math.min(csw, Math.floor(avail / 23));
      if (cs < 6) cs = Math.min(csw, Math.floor(R.inner / 23));
      cs = Math.max(6, cs);
      const H = Math.max(23, Math.min(84, Math.floor((avail / cs) * 4) / 4));
      check(tag + 'the rule: ' + R.form + ' list, cell ' + R.cs + ', ' + R.H + ' cells high' + (want ? ' (wanted ' + want.join(' ') + ')' : ''), R.form === form && R.cs === cs && R.H === H && (!want || (R.form === want[0] && (want[1] == null || R.cs === want[1]))) && R.cards === (R.form === 'cards'), JSON.stringify({ R, form, cs, H }));
      check(tag + 'the plate is its scene\'s height in cells (' + R.plateH + ' px)', R.plateH === Math.round(R.cs * R.H) && R.col <= 720, JSON.stringify(R));
      // A scene capped by the height has a plate its own width (a cell of margin each side), centred: no empty strips.
      const capped = R.cs < csw, wantW = capped ? Math.min(R.colW, Math.ceil(39.5 * R.cs) + 2) : R.colW;
      check(tag + 'the plate is ' + (capped ? 'its scene\'s width, centred' : 'the column\'s width') + ' (' + R.plateW + ' of ' + R.colW + ' px)', Math.abs(R.plateW - wantW) <= 0.5 && Math.abs(R.plateL - (R.colW - R.plateW) / 2) <= 1, JSON.stringify(R));
      if (R.n) check(tag + 'the list is as tall as the layout counts it (' + R.listH + ' px)', R.listM + R.listH === listH(R.form), JSON.stringify(R));
      const scrollOk = hgt < 440 ? R.plateBottom <= R.viewBottom : !R.scrolled && (R.listHidden || R.listBottom <= R.viewBottom) && R.collectBottom <= R.viewBottom;
      check(tag + 'one primary button; nothing sideways; ' + (hgt < 440 ? 'the whole plate on screen' : 'everything on screen'), R.primary === 1 && !R.sideways && scrollOk, JSON.stringify(R));
      if (hgt >= 440) {
        check(tag + 'no empty band under the ' + (R.listHidden ? 'bar' : 'list') + ' (' + R.under + ' px left, cell ' + R.cs + ')', R.under >= 0 && (R.under < R.cs + 2 || R.H === 84), JSON.stringify(R));
        check(tag + 'the plate starts where the other tabs start (' + R.plateTop + ' px, Puzzles ' + other + ' px)', Math.abs(R.plateTop - other) <= 8, JSON.stringify(R));
      }
      if (name === 'maxed') check(tag + 'with everything built, the list is gone', R.listHidden, JSON.stringify(R));
      Hs.push([R.H, R.plateH, R.form]);
      if (OUT && !touch && [520, 400, 300].includes(w) && (name === 'fresh' || name === 'maxed')) await p.screenshot({ path: require('path').join(OUT, '33-factory-' + w + '-' + name + '.png') });
    }
    // Fresh (four entries) to maxed (none): the scene grows as the list shrinks, and never shrinks.
    check(w + '×' + hgt + (touch ? ' touch' : '') + ': the list keeps its form in every state (by the window alone)', new Set(Hs.map((x) => x[2])).size === 1, JSON.stringify(Hs));
    if (!(touch && w > hgt)) check(w + '×' + hgt + (touch ? ' touch' : '') + ': the plate grows as the list shrinks (' + Hs.map((x) => x[1]).join(' / ') + ' px)', Hs[Hs.length - 1][1] > Hs[0][1] || Hs[0][0] === 84, JSON.stringify(Hs));
  };
  for (const [w, hgt, want] of [[520, 760, ['rows', 12]], [400, 700, ['rows', 9]], [900, 560, ['cards']], [900, 900, ['rows', 19]], [420, 900, ['rows', 10]], [300, 440, ['cards']]]) await layoutAt(page, w, hgt, want, false);
  {
    // A phone, upright and on its side, with touch (the plate's hotspots at least 32 px square, none over another).
    const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    await tp.goto(PAGE);
    await tp.waitForTimeout(500);
    await tp.evaluate(() => { const m = document.querySelector('.modal'); if (m) Lull.UI.closeModal && Lull.UI.closeModal(); });
    await tp.keyboard.press('Enter');
    await tp.evaluate(() => { Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
    const fingers = () => tp.evaluate(() => {
      const r = Array.from(document.querySelectorAll('#fac-hots .fac-hot')).map((b) => ({ x: parseFloat(b.style.left), y: parseFloat(b.style.top), w: parseFloat(b.style.width), h: parseFloat(b.style.height), id: b.dataset.hot + (b.dataset.k || '') }));
      const over = [];
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].x < r[j].x + r[j].w && r[j].x < r[i].x + r[i].w && r[i].y < r[j].y + r[j].h && r[j].y < r[i].y + r[i].h) over.push(r[i].id + '/' + r[j].id);
      return { small: r.filter((x) => x.w < 31.5 || x.h < 31.5).map((x) => x.id + ' ' + x.w + 'x' + x.h), over };
    });
    await layoutAt(tp, 390, 844, ['rows', 9], true);
    const tall = await fingers();
    check('390×844 touch: every hotspot at least 32 px square under a finger, none over another', !tall.over.length && tall.small.length <= 4, JSON.stringify(tall));
    // Smaller phones upright: the store's grown hotspot and the bays' meet halfway, never overlap.
    for (const [pw, ph] of [[375, 667], [360, 640], [320, 568]]) {
      await layoutAt(tp, pw, ph, null, true);
      const small = await fingers(), sc = await tp.evaluate(() => Lull.app.modes.factory.view.scene);
      check(pw + '×' + ph + ' touch (' + sc + '): no hotspot over another', !small.over.length, JSON.stringify(small));
    }
    // The bar's figures at phone widths with a full biggest crate ("59.75 / 60"): none is cut to an ellipsis.
    for (const [pw, ph] of [[320, 568], [360, 640], [390, 844]]) {
      await tp.setViewportSize({ width: pw, height: ph });
      await tp.waitForTimeout(150);
      const cut = await tp.evaluate(async () => {
        const f = Lull.app.store.state.factory, F = Lull.Factory;
        for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create());
        for (const k of ['stamp', 'store', 'press', 'crate']) while (F.upgrade(f, k));
        f.crate = '3'.repeat(F.capacity(f) - 1); f.lastTick = Date.now(); Lull.app.modes.factory.build();
        await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
        const out = Array.from(document.querySelectorAll('.fac-stat')).map((el) => { const b = el.querySelector('b'), i = el.querySelector('i'); return { text: b.textContent, b: b.scrollWidth > b.clientWidth, i: i.scrollWidth > i.clientWidth }; });
        for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); Lull.app.modes.factory.build();
        return out;
      });
      check(pw + '×' + ph + ' touch: a full biggest crate\'s figures fit the bar, none cut (' + cut.map((c) => c.text).join(' | ') + ')', cut.length === 3 && cut.some((c) => /59\.75 \/ 60/.test(c.text)) && cut.every((c) => !c.b && !c.i), JSON.stringify(cut));
    }
    await layoutAt(tp, 844, 390, ['cards'], true);
    if (OUT) await tp.screenshot({ path: require('path').join(OUT, '33-factory-844x390-touch.png') });
    await tctx.close();
  }

  // Every mino held is drawn as a mino, at every store and crate size, at each size of window: slots inside their
  // trays, none over another, cells of at least MINBC; the store and the crate draw exactly what they hold (less what
  // is still on its way), every one (nothing pans); the molds exactly what they have been fed. Empty, each tray is its
  // rack alone: a slot for everything it can hold, no well.
  for (const [w, hgt] of [[400, 700], [520, 760], [900, 900], [900, 560], [300, 440]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await page.waitForTimeout(200);
    const held = await ev(() => {
      const M = Lull.app.modes.factory, v = M.view, F = Lull.Factory, f0 = Lull.app.store.state.factory, look = Lull.app.look(), out = [], orig = v.mino;
      const f = JSON.parse(JSON.stringify(f0));
      const box = { x: 0, y: 0 };
      for (let lv = 0; lv < 5; lv++) {
        f.crateLevel = lv; f.storeLevel = Math.min(2, lv); f.lift = []; f.belt = [];
        for (const fill of [1, 0.5, 0]) {
          f.store = Math.floor(F.storeCap(f) * fill); f.crate = '1234567'.repeat(500).slice(0, Math.floor(F.capacity(f) * fill));
          v.flushAll(); v.layout(f);
          let drawn = 0, odd = 0, outside = 0;
          const pos = new Set();
          v.mino = function (c, lk, color, x, y, s) { drawn++; if (Math.abs(x * v.dpr - Math.round(x * v.dpr)) > 1e-6 || Math.abs(y * v.dpr - Math.round(y * v.dpr)) > 1e-6) odd++; pos.add(x + ',' + y); return orig.apply(this, arguments); };
          v.storeMinoKey.length = 0; if (f.store) v.storeLayer(look, v.storeLanded(f), v.srows);
          const sDrawn = drawn, sPos = pos.size; drawn = 0; pos.clear();
          v.crateMinoKey.length = 0; if (f.crate.length) v.crateLayer(f, look, v.landed(f));
          v.mino = orig;
          // Every slot inside its tray, and no two the same.
          const sl = new Set(), cl = new Set();
          for (let i = 0; i < F.storeCap(f); i++) { v.storeSlot(i, box); sl.add(box.x + ',' + box.y); if (box.x < v.PX(0.75) - 1e-6 || box.x + v.scc > v.PX(27.75) + 1e-6 || box.y < v.st - 1e-6 || box.y + v.scc > v.sb + 1e-6) outside++; }
          for (let i = 0; i < F.crateMinos(lv); i++) { v.crateSlot(i, box); cl.add(box.x + ',' + box.y); if (box.x < v.tx0 - 1e-6 || box.x + v.bc > v.tx1 + 1e-6 || box.y < v.bt - 1e-6 || box.y + v.bc > v.bb + 1e-6) outside++; }
          // The racks and wells a frame draws, the still layers painted afresh.
          v.floorKey.length = 0; v.crateKey.length = 0;
          v.render(0, f, look);
          out.push({ lv, fill, store: f.store, sDrawn, sPos, sl: sl.size, cap: F.storeCap(f), crate: f.crate.length, cDrawn: drawn, cPos: pos.size, cl: cl.size, cMax: F.crateMinos(lv), odd, outside, scD: v.scD, bcD: v.bcD,
            rack: [v.drawnRack.store, v.drawnRack.crate], well: [v.drawnWell.store, v.drawnWell.crate], sRows: Math.ceil(f.store / v.scols), cRows: Math.ceil(f.crate.length / v.cols), scc: v.scc, bc: v.bc });
        }
      }
      v.lvShown = -1; v.storeShown = -1; v.storeMinoKey.length = 0; v.crateMinoKey.length = 0; v.floorKey.length = 0; v.crateKey.length = 0; v.layout(f0);
      return out;
    });
    const near = (a, b) => Math.abs(a - b) < 0.51;
    const ok = (r) => r.sDrawn === r.store && r.sPos === r.store && r.sl === r.cap && r.cDrawn === r.crate && r.cPos === r.crate && r.cl === r.cMax && r.odd === 0 && r.outside === 0 && r.scD >= 3 && r.bcD >= 3
      && r.rack[0] === r.cap && r.rack[1] === r.cMax && near(r.well[0], r.sRows * r.scc) && near(r.well[1], r.cRows * r.bc);
    check(w + '×' + hgt + ': every mino in the store and the crate is drawn, in its own slot inside its tray, in whole pixels; each tray racks its whole capacity, its well only the rows in use (store ' + [...new Set(held.map((r) => r.scD))].join() + ' px, crate ' + [...new Set(held.map((r) => r.bcD))].join() + ' px)', held.every(ok), JSON.stringify(held.filter((r) => !ok(r)).slice(0, 3)));
    const empty = held.filter((r) => r.fill === 0);
    check(w + '×' + hgt + ': an empty store and an empty crate are racks with no well', empty.length === 5 && empty.every((r) => r.well[0] === 0 && r.well[1] === 0 && r.rack[0] === r.cap && r.rack[1] === r.cMax), JSON.stringify(empty.map((r) => [r.rack, r.well])));
  }
  await page.setViewportSize({ width: 520, height: 760 });
  await page.waitForTimeout(200);
  const molds = await ev(() => {
    const M = Lull.app.modes.factory, v = M.view, F = Lull.Factory, look = Lull.app.look();
    const f = JSON.parse(JSON.stringify(Lull.app.store.state.factory));
    for (const k of ['stamp', 'press']) while (F.upgrade(f, k));
    const got = [2, 1, 4, 7];
    f.molds.forEach((m, k) => { m.got = Math.min(got[k], F.MOLDS[k]); m.t = m.got < F.MOLDS[k] ? F.B(F.MOLDS[k], m.got) - 5 : 2000; m.held = false; });
    f.q = [];
    const cell = v.cell, pos = new Set();
    v.cell = function (c, lk, color, x, y, w, h, alpha) { if (this.inBays && alpha == null) pos.add(Math.round(x) + ',' + Math.round(y)); return cell.apply(this, arguments); };
    const bays = v.drawBays;
    v.drawBays = function () { this.inBays = true; try { return bays.apply(this, arguments); } finally { this.inBays = false; } };
    v.stampReal = [false, false, false, false]; v.tubes = [null, null, null, null];
    v.flags.starving = [false, false, false, false];
    v.drawBays(v.ctx, f, look, v.style(look.theme));
    v.cell = cell; v.drawBays = bays;
    return { drawn: pos.size, want: f.molds.reduce((a, m) => a + m.got, 0) };
  });
  check('the molds draw exactly the minos they have been fed', molds.drawn === molds.want, JSON.stringify(molds));

  // The scene's geometry at its heights (the least, three between, the most), at cell sizes from the smallest to the
  // biggest, with the store at each size: the conveyor keeps at least 0.8 of a cell a model row (8 cells or more from
  // the belt to the station); the collector stands on the conveyor's head rail and takes about a third of the column;
  // every store and collector size packs all it holds into its tray in whole device pixels, 3 at least, with no top
  // row under a quarter full; the tiers add up to the scene, the store's grid filling its tray from rim to beam, and
  // what the store leaves goes to the machinery (the heads' and the presses' hang, the drop), within its bounds; the
  // store's rack takes no more than its share of the plate (STORE_SHARE) until the machinery has grown its most.
  const geom = await ev(() => {
    const A = Lull.FactoryArt, Lz = A.LAYOUT, F = Lull.Factory, bad = [], shares = [];
    let n = 0;
    const ragged = (n, c) => { const r = n % c; return r > 0 && r < c / 4; };
    for (const H of [23, 34, 42, 51.5, 69.25, 84]) for (const [cs, d] of [[6, 2], [6, 3], [8, 2], [9, 3], [12, 2], [18, 2], [22, 2], [10, 1], [13, 1]]) for (let lv = 0; lv < 3; lv++) {
      const S = A.sceneOf(H, cs, d, lv), u = cs * d, tag = H + '@' + cs + 'x' + d + '/' + lv;
      n++;
      if (d === 1 && H < 34) continue; // a 1x screen's smallest scenes may pack under 3 px (never tested here)
      if (!(S.k >= 0.8 - 1e-9 && S.BY - S.STATION >= 8 - 1e-9)) bad.push(tag + ' conveyor ' + S.k);
      if (Math.abs(S.RAIL - (S.CB + Lz.CRATE.foot)) > 1e-9) bad.push(tag + ' collector off its rail');
      if (!(S.Hc >= 5.5 && S.Hc <= 0.3 * H + 0.25 + 1e-9)) bad.push(tag + ' Hc ' + S.Hc);
      if (!(S.ht >= 0 && S.ht <= Lz.HANG.heads + 1e-9 && S.dd >= 0 && S.dd <= Lz.HANG.drop + 1e-9 && S.hp >= -1e-9 && Math.abs(S.ht + S.dd + S.hp - S.grow) < 1e-9)) bad.push(tag + ' growth ' + [S.ht, S.hp, S.dd, S.grow]);
      if (Math.abs(S.BY - (S.WB + S.drop)) > 1e-9 || Math.abs(S.drop - Lz.DROP_DY - S.dd) > 1e-9 || Math.abs(S.H - (S.FY + Lz.GROUND)) > 1e-9) bad.push(tag + ' tiers');
      const g = S.store[lv], trayS = S.SB - S.ST;
      if (Math.abs(g.rows * g.p - trayS * u) > 1e-6) bad.push(tag + ' store grid ' + g.rows * g.p + ' in a tray of ' + trayS * u);
      const share = (g.cols * g.p * g.rows * g.p) / (u * u) / (Lz.COLS * S.H);
      shares.push(share);
      if (S.grow < Lz.GROW - 1e-9 && share > Lz.STORE_SHARE + 0.02) bad.push(tag + ' store share ' + share.toFixed(3) + ' with the machinery grown only ' + S.grow);
      S.store.forEach((g, l) => {
        const cap = F.TUNE.STORE_COLS * F.TUNE.STORE_ROWS[l];
        if (!(Number.isInteger(g.p) && g.p >= 3 && g.cols * g.rows >= cap && g.cols * g.p <= (Lz.STORE.x1 - Lz.STORE.x0) * u + 1e-6 && g.p <= Lz.STORE_MAX * u)) bad.push(tag + ' store ' + l + ' ' + JSON.stringify(g));
        if (ragged(cap, g.cols)) bad.push(tag + ' store ' + l + ' leaves ' + (cap % g.cols) + ' of ' + g.cols + ' in its top row');
      });
      S.crate.forEach((g, l) => {
        if (!(Number.isInteger(g.p) && g.p >= 3 && g.cols * g.rows >= F.crateMinos(l) && g.cols * g.p <= (Lz.CRATE.x1 - Lz.CRATE.x0 - 2 * Lz.CRATE.wall) * u + 1e-6 && g.rows * g.p <= S.Hc * u + 1e-6)) bad.push(tag + ' crate ' + l + ' ' + JSON.stringify(g));
        if (ragged(F.crateMinos(l), g.cols)) bad.push(tag + ' crate ' + l + ' leaves a ragged top row');
      });
    }
    // Live: the store's bottom row on the beam, the collector's on its floor, at every size.
    const v = Lull.app.modes.factory.view, f = JSON.parse(JSON.stringify(Lull.app.store.state.factory)), o = { x: 0, y: 0 };
    for (let l = 0; l < 5; l++) {
      f.storeLevel = Math.min(2, l); f.crateLevel = l; v.layout(f);
      if (Math.abs(v.storeSlot(0, o).y + v.scc - v.PY(v.S.SB)) > 1e-6) bad.push('store grid off the beam ' + l);
      if (Math.abs(v.crateSlot(0, o).y + v.bc - v.PY(v.S.CB)) > 1e-6) bad.push('collector grid off its floor ' + l);
      if (v.S.lv !== f.storeLevel) bad.push('the scene is not laid out for the store at size ' + f.storeLevel);
    }
    v.layout(Lull.app.store.state.factory);
    return { n, bad: bad.slice(0, 6), share: Math.max(...shares) };
  });
  check('the scene at every height and store size: a conveyor at least 0.8 a row, the collector on its head rail, every tray packed whole in whole pixels with no lone slots on top, grids on their floors, the tiers adding up, the store within its share of the plate until the machinery has grown its most (' + geom.n + ' scenes)', !geom.bad.length, JSON.stringify(geom.bad));

  // A busy line, sampled at four heights: nothing moving ever overlaps anything else (top-belt minos, belt pieces,
  // conveyor pieces, the molds' windows, the store, the collector, the chute), and the conveyor keeps its pieces flat
  // in its band, between the station and the belt.
  const overlaps = await ev(() => {
    const F = Lull.Factory, A = Lull.FactoryArt, Lz = A.LAYOUT, out = { frames: 0, bad: [], lane: 0 };
    for (const H of [23, 34, 51.5, 84]) {
      const f = F.create(), name = 'H' + H;
      for (const k of ['stamp', 'press', 'crate']) while (F.upgrade(f, k));
      const S = A.sceneOf(H, 12, 2, f.storeLevel);
      f.seed = 42;
      const still = [];
      for (let k = 0; k < 4; k++) { const b = A.WIN[k]; still.push({ id: 'win' + k, x: b.x, y: S.WB - b.h, w: b.w, h: b.h }); }
      still.push({ id: 'store', x: Lz.STORE.x0, y: S.ST, w: Lz.STORE.x1 - Lz.STORE.x0, h: S.SB - S.ST });
      still.push({ id: 'crate', x: Lz.CRATE.x0, y: Lz.CRATE.rimMin, w: Lz.CRATE.x1 - Lz.CRATE.x0, h: S.RAIL - Lz.CRATE.rimMin });
      still.push({ id: 'chute', x: Lz.CHUTE.x0, y: A.CHUTE_TOP, w: Lz.CHUTE.x1 - Lz.CHUTE.x0, h: S.STATION + A.CHUTE_FOOT - A.CHUTE_TOP });
      const band = { x0: Lz.BAND.x0 + Lz.BAND.rail, x1: Lz.BAND.in1 };
      for (let i = 0; i < 300; i++) {
        F.run(f, 7000 + (i % 7) * 250);
        if (i % 40 === 0) F.collect(f, 'd');
        const moving = [];
        f.top.forEach((it, j) => moving.push({ id: 'top' + j, x: Lz.TOPB.x0 + it.x, y: Lz.TOPB.y + S.ht - 1, w: 1, h: 1 }));
        f.belt.forEach((it, j) => { for (const [cx, cy] of F.shapes(it.n)[it.s]) moving.push({ id: 'belt' + j, x: Lz.BELT_X0 + it.x + cx, y: S.BY - cy - 1, w: 1, h: 1 }); });
        f.lift.forEach((it, j) => {
          const cells = F.shapes(it.n)[it.s], bottom = S.BY - it.y * S.k, x0 = A.liftX(cells.w);
          if (bottom > S.BY + 1e-9 || bottom < S.STATION - 1e-9) out.lane++;
          for (const [c, r] of cells) {
            const b = { id: 'lift' + j, x: x0 + c, y: bottom - r - 1, w: 1, h: 1 };
            moving.push(b);
            if (b.x < band.x0 - 1e-9 || b.x + 1 > band.x1 + 1e-9 || b.y < S.RAIL + Lz.BAND.head - 1e-9) out.lane++;
          }
        });
        const hit = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
        for (let a = 0; a < moving.length; a++) {
          for (let b = a + 1; b < moving.length; b++) if (moving[a].id !== moving[b].id && hit(moving[a], moving[b])) out.bad.push(name + ' ' + moving[a].id + '/' + moving[b].id);
          for (const s of still) if (hit(moving[a], s)) out.bad.push(name + ' ' + moving[a].id + '/' + s.id);
        }
        out.frames++;
      }
    }
    out.bad = out.bad.slice(0, 5);
    return out;
  });
  check('a busy line never draws anything over anything else, and its conveyor keeps its pieces flat in the band (' + overlaps.frames + ' frames)', overlaps.frames === 1200 && !overlaps.bad.length && overlaps.lane === 0, JSON.stringify(overlaps));
  // The corridor as drawn, at every collector size: a piece on the conveyor rides up it smoothly (never down, never a
  // jump), clear under the collector, flat inside the band; and its minos, leaving the station one by one, go along
  // their row into the chute's mouth, up inside the chute at its steady pace (never a flick), spaced apart, and drop
  // into the collector from over its rim: never anywhere else.
  await page.setViewportSize({ width: 520, height: 760 });
  await page.waitForTimeout(200);
  const ride = await ev(async () => {
    const M = Lull.app.modes.factory, v = M.view, f = Lull.app.store.state.factory, F = Lull.Factory, A = Lull.FactoryArt, Lz = A.LAYOUT, out = [];
    const cell = v.cell, lift = v.drawLift, riders = v.drawRiders, mino = v.mino;
    const shape = F.shapes(7).findIndex((c) => c.h === 3);
    for (let l = 0; l < 5; l++) {
      for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create());
      f.crateLevel = l; f.crate = ''; f.lift = [{ n: 7, s: shape, c: 3, u: 1, y: F.LIFT.len - 2, py: F.LIFT.len - 2 }]; f.lastTick = Date.now(); f.acc = 0;
      M.build();
      let top = Infinity, xs = [];
      const ys = [], chute = { n: 0, out: 0, rim: 0, where: [] };
      v.cell = function (c, lk, color, x, y, w) { if (this.inLift) { top = Math.min(top, y); xs.push(x, x + w); } return cell.apply(this, arguments); };
      v.drawLift = function () { this.inLift = true; top = Infinity; xs = []; try { return lift.apply(this, arguments); } finally { this.inLift = false; } };
      v.drawRiders = function () { this.inRiders = true; try { return riders.apply(this, arguments); } finally { this.inRiders = false; } };
      v.mino = function (c, lk, color, x, y, s) {
        if (this.inRiders && color !== this.raw(lk)) {
          const e = 0.5, sc = this.S;
          // At the station (its rows, from the band into the chute's mouth), in the chute, or over the collector's rim
          // and down into it: nowhere else.
          const station = x >= this.PX(Lz.BAND.x0 + Lz.BAND.rail) - e && x + s <= this.PX(Lz.CHUTE.x1) + e && y >= this.PY(sc.RAIL + Lz.BAND.head) - e && y + s <= this.PY(sc.STATION) + e;
          const inChute = x >= this.PX(Lz.CHUTE.x0) - e && x + s <= this.PX(Lz.CHUTE.x1) + e && y >= this.PY(A.CHUTE_TOP) - e && y + s <= this.PY(sc.STATION + A.CHUTE_FOOT) + e;
          const crate = x >= this.tx0 - e && x + s <= this.tx1 + e && y + s <= this.bb + e;
          const over = y + s <= this.bt + e;
          chute.n++;
          if (!(station || inChute || crate || over)) { chute.out++; if (chute.where.length < 3) chute.where.push([x, y, s].map((q) => +q.toFixed(1))); }
          if (x + s <= this.tx1 + e && x >= this.tx0 - e && y < this.bt - s) chute.rim++;
        }
        return mino.apply(this, arguments);
      };
      // Each rider's place up the chute, frame by frame (on the view's own clock): its fastest pace, the closest two
      // come, and when each left the station.
      const seen = new Map(), lefts = [];
      let fastest = 0, closest = Infinity, frames = 0;
      try {
        for (let i = 0; i < 1800 && (f.lift.length || v.station || v.riders.length); i++) {
          await new Promise((r) => requestAnimationFrame(r));
          frames++;
          // The ride (the station, as its minos leave from the top row down, is not a ride).
          if (top < Infinity && f.lift.length) ys.push([top, Math.min(...xs), Math.max(...xs)]);
          const up = [], cx0 = v.PX(Lz.CHUTE.x0) - 0.5, cx1 = v.PX(Lz.CHUTE.x1) + 0.5;
          for (const r of v.riders) {
            if (v.t < r.t0) continue;
            const p = v.crateRiderPos(r, {});
            if (!seen.has(r)) { seen.set(r, null); lefts.push(r.t0); }
            if (p.x >= cx0 && p.x + p.s <= cx1 && p.y + p.s <= v.PY(v.S.STATION) + 0.5) {
              const last = seen.get(r);
              if (last && v.t > last.t + 1e-4) fastest = Math.max(fastest, (last.y - p.y) / (v.t - last.t) / v.cs);
              seen.set(r, { y: p.y, t: v.t });
              up.push(p.y, p.s);
            }
          }
          const tops = [];
          for (let j = 0; j < up.length; j += 2) tops.push([up[j], up[j + 1]]);
          tops.sort((a, b) => a[0] - b[0]);
          for (let j = 1; j < tops.length; j++) closest = Math.min(closest, (tops[j][0] - tops[j - 1][0] - tops[j - 1][1]) / v.cs);
        }
      } finally { v.cell = cell; v.drawLift = lift; v.drawRiders = riders; v.mino = mino; }
      let down = 0, jump = 0, outside = 0, under = 0;
      const bx0 = v.PX(Lz.BAND.x0 + Lz.BAND.rail), bx1 = v.PX(Lz.BAND.in1);
      for (let i = 0; i < ys.length; i++) {
        if (ys[i][1] < bx0 - 0.5 || ys[i][2] > bx1 + 0.5) outside++;
        if (ys[i][0] < v.PY(v.S.RAIL) - 0.5) under++;
        if (i && ys[i][0] - ys[i - 1][0] > 1e-6) down++;
        if (i && ys[i - 1][0] - ys[i][0] > 0.35 * v.cs) jump++;
      }
      lefts.sort((a, b) => a - b);
      let gap = Infinity;
      for (let j = 1; j < lefts.length; j++) gap = Math.min(gap, lefts[j] - lefts[j - 1]);
      out.push({ l, n: ys.length, frames, rose: ys.length ? +((ys[0][0] - ys[ys.length - 1][0]) / v.cs).toFixed(2) : 0, down, jump, outside, under, band: +((v.S.BY - v.S.STATION)).toFixed(2), chute,
        landed: f.crate.length, pace: +fastest.toFixed(2), closest: +closest.toFixed(2), gap: +gap.toFixed(3), riders: lefts.length, steady: +(1 / A.MOTION.RISE_CELL).toFixed(2) });
    }
    for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); M.build();
    return out;
  });
  check('at every collector size a piece rides up the conveyor smoothly, flat in its band and clear of the collector; its minos leave one by one, go up inside the chute at a steady pace, spaced, and over the rim',
    ride.length === 5 && ride.every((r) => r.n > 60 && r.rose > 2 && r.down === 0 && r.jump === 0 && r.outside === 0 && r.under === 0 && r.band >= 8 && r.chute.n > 0 && r.chute.out === 0 && r.chute.rim > 0 && r.landed === 7
      && r.riders === 7 && r.gap >= 0.25 && r.pace > 0 && r.pace <= r.steady * 1.15 && r.closest >= 0.25), JSON.stringify(ride));
  // Short of minos (one stamp head, four presses, the biggest store empty: a steady state) the store is a pale shelf
  // of slots, never the biggest thing on the plate; in dark the shelf and the conveyor's band are lighter than the
  // plate (no dark holes). The conveyor runs while it is empty and stops only while its head waits under a full
  // collector.
  await page.setViewportSize({ width: 520, height: 760 });
  await page.waitForTimeout(200);
  const shelf = await ev(async () => {
    const app = Lull.app, M = app.modes.factory, v = M.view, f = app.store.state.factory, F = Lull.Factory, A = Lull.FactoryArt, Lz = A.LAYOUT;
    const theme0 = app.settings.theme;
    app.settings.theme = 'dark'; app.applySettings();
    for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create());
    for (let i = 0; i < 3; i++) F.upgrade(f, 'press');
    F.upgrade(f, 'store'); F.upgrade(f, 'store'); for (let i = 0; i < 3; i++) F.upgrade(f, 'crate');
    f.store = 0; F.run(f, 3600e3); F.collect(f, 'd'); f.lift = []; f.lastTick = Date.now(); f.acc = 0;
    M.build(); M.relayout();
    await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
    const plate = document.getElementById('fac-plate').getBoundingClientRect();
    const share = (v.scols * v.scc * v.srows * v.scc) / (plate.width * plate.height), state = { store: f.store, cap: F.storeCap(f), scene: v.scene, waits: F.waits(f).storeEmpty };
    // The still layer over the plate's own colours (its base and its lighter top wash), sampled: the rack between its
    // slots, the band beside the chevrons.
    const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    const c = document.createElement('canvas'); c.width = v.floorC.width; c.height = v.floorC.height;
    const x = c.getContext('2d');
    x.fillStyle = css('--plate-base'); x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = css('--plate'); x.fillRect(0, 0, c.width, c.height);
    const bare = x.getImageData(2, 2, 1, 1).data;
    x.drawImage(v.floorC, 0, 0);
    const luma = (d) => 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
    const mean = (x0, y0, w, h) => { const d = x.getImageData(Math.round(x0 * v.dpr), Math.round(y0 * v.dpr), Math.max(1, Math.round(w * v.dpr)), Math.max(1, Math.round(h * v.dpr))).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += luma([d[i], d[i + 1], d[i + 2]]); return t / (d.length / 4); };
    const rack = mean(v.sx0 + v.scc * 2, v.st + 2, v.scc * 6, v.sb - v.st - 4);
    const bx0 = v.PX(Lz.BAND.x0 + Lz.BAND.rail) + 3, bx1 = v.PX(Lz.BAND.in1) - 3;
    const band = mean(bx0, v.PY(v.S.RAIL + 2), bx1 - bx0, v.PY(v.S.BY - 1) - v.PY(v.S.RAIL + 2));
    // The conveyor, empty: running. Its head under a full collector: still.
    const c0 = v.chain;
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    const runs = v.chain !== c0;
    f.crate = '3'.repeat(F.capacity(f)); f.lift = [{ n: 4, s: 0, c: 1, u: 1, y: F.LIFT.len, py: F.LIFT.len }]; f.lastTick = Date.now(); f.acc = 0; M.build();
    for (let i = 0; i < 5; i++) await new Promise((r) => requestAnimationFrame(r));
    const c1 = v.chain;
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    const waits = v.chain === c1;
    app.settings.theme = theme0; app.applySettings();
    for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); M.build();
    return { share: +share.toFixed(3), state, plate: +luma(bare).toFixed(1), rack: +rack.toFixed(1), band: +band.toFixed(1), runs, waits };
  });
  check('short of minos the empty store is a pale shelf, a fifth of the plate at most; in dark it and the conveyor\'s band are lighter than the plate; the conveyor runs empty and waits only under a full collector',
    shelf.state.cap === 216 && shelf.state.store <= 4 && shelf.share <= 0.22 && shelf.rack >= shelf.plate + 12 && shelf.band >= shelf.plate + 6 && shelf.runs && shelf.waits, JSON.stringify(shelf));
  // The belts are drawn between ticks: a piece's drawn place (read from what the view draws, not worked out here)
  // never goes back, moves smoothly frame to frame, and is often between where the model had it a tick ago and now.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(200);
  const glide = await ev(async () => {
    const M = Lull.app.modes.factory, v = M.view, f = Lull.app.store.state.factory, F = Lull.Factory;
    for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create());
    f.belt = [{ n: 4, s: 0, c: 1, x: 2, px: 2, u: 1 }]; f.lastTick = Date.now(); f.acc = 0;
    const it = f.belt[0], xs = [], cell = v.cell, belt = v.drawBelt;
    let drawn = Infinity, model = null;
    v.cell = function (c, lk, color, x) { if (this.inBelt) drawn = Math.min(drawn, x); return cell.apply(this, arguments); };
    v.drawBelt = function () {
      this.inBelt = true; drawn = Infinity;
      try { return belt.apply(this, arguments); } finally { this.inBelt = false; model = [this.PX(0.5 + it.px), this.PX(0.5 + it.x)]; }
    };
    let last = performance.now();
    try {
      for (let i = 0; i < 150 && f.belt[0] === it; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const now = performance.now();
        if (drawn < Infinity) xs.push([drawn, now - last, model[0], model[1]]);
        last = now;
      }
    } finally { v.cell = cell; v.drawBelt = belt; }
    const cs = v.cs, dev = 1 / v.dpr;
    let back = 0, jump = 0, between = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i][0] - xs[i - 1][0];
      if (d < -1e-6) back++;
      if (d > Math.max(dev, 0.1 * cs * Math.max(1, xs[i][1] / 16)) + 1e-6) jump++;
    }
    for (const [x, , a, b] of xs) if (x > a + 1e-6 && x < b - 1e-6) between++;
    return { n: xs.length, back, jump, between, cs, moved: xs.length ? (xs[xs.length - 1][0] - xs[0][0]) / cs : 0 };
  });
  check('a belt piece is drawn gliding between ticks: never backwards, never a jump, often between two ticks\' places', glide.n > 60 && glide.back === 0 && glide.jump === 0 && glide.moved > 0.3 && glide.between >= glide.n / 5, JSON.stringify(glide));

  // The scene takes the room the list leaves: building everything from the list, one entry at a time, the plate grows
  // (never shrinks), and when an entry leaves the list the plate takes about its height at once (within a cell).
  for (const [w, hgt, form] of [[520, 760, 'rows'], [300, 440, 'cards']]) {
    await page.setViewportSize({ width: w, height: hgt });
    await facSet((f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); Lull.app.store.state.lines = 50000; });
    await page.waitForTimeout(250);
    const plateAt = () => ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const p = document.getElementById('fac-plate').getBoundingClientRect(), list = document.getElementById('fac-list');
      r({ top: Math.round(p.top), h: Math.round(p.height), cs: Lull.app.modes.factory.view.cs, form: Lull.app.modes.factory.form, listH: list.classList.contains('hidden') ? 0 : list.offsetHeight + (parseFloat(getComputedStyle(list).marginTop) || 0), n: list.querySelectorAll('.fac-up').length });
    }))));
    const buys = [await plateAt()];
    for (const kind of ['stamp', 'stamp', 'stamp', 'store', 'store', 'press', 'press', 'press', 'crate', 'crate', 'crate', 'crate']) {
      // A row builds from its button, a card from anywhere on it.
      await page.click('.fac-up[data-up=' + kind + ']' + (form === 'rows' ? ' .btn' : ''));
      buys.push(await plateAt());
    }
    const bought = await ev(() => { const f = Lull.app.store.state.factory; return [f.stampers, f.storeLevel, f.presses, f.crateLevel]; });
    let shrank = 0, off = 0;
    for (let i = 1; i < buys.length; i++) {
      const a = buys[i - 1], b = buys[i];
      if (b.h < a.h || b.top !== a.top || b.form !== form) shrank++;
      // An entry gone: the plate takes what the list gave up (the list's own height, as it was and is now), give or take a cell.
      if (b.n < a.n && Math.abs((b.h - a.h) - (a.listH - b.listH)) > b.cs) off++;
    }
    check(w + '×' + hgt + ': building everything from the ' + form + ', the scene grows as each entry leaves the list, never shrinks or moves (' + buys.map((b) => b.h).join(' ') + ' px)',
      bought.join() === '4,2,4,4' && !shrank && !off && buys[buys.length - 1].h > buys[0].h && buys[0].form === form, JSON.stringify({ bought, shrank, off, buys }));
  }
  // A card says it all to a screen reader and in its tooltip; short of lines it is quiet, and a click on it only flashes.
  await facSet((f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); Lull.app.store.state.lines = 99; });
  await page.waitForTimeout(250);
  const card = await ev(() => { const c = document.querySelector('.fac-up[data-up=stamp]'); c.click(); return { tag: c.tagName, label: c.getAttribute('aria-label'), tip: c.dataset.tip, text: c.textContent, dis: c.getAttribute('aria-disabled'), stampers: Lull.app.store.state.factory.stampers }; });
  check('a card: one button, its whole meaning in its label and tooltip, quiet when short of lines', card.tag === 'BUTTON' && card.label === 'Build Second stamper, 36 to 72 minos an hour, 350 lines' && card.tip === card.label && card.text === 'Stamper350 ⦵' && card.dis === 'true' && card.stampers === 1, JSON.stringify(card));
  if (OUT) for (const theme of ['dark', 'light']) {
    await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
    for (const [w, hgt] of [[520, 760], [400, 700], [300, 440]]) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const [name, fn] of Object.entries({
        fresh: FAC.fresh,
        starved: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); F.upgrade(f, 'press'); F.upgrade(f, 'press'); for (let i = 0; i < 3; i++) F.upgrade(f, 'crate'); F.run(f, 2 * 3600e3); Lull.app.store.state.lines = 0; },
        storefull: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); for (let i = 0; i < 3; i++) F.upgrade(f, 'stamp'); F.upgrade(f, 'crate'); F.upgrade(f, 'crate'); F.run(f, 4 * 3600e3); F.collect(f, 'd'); F.run(f, 600e3); Lull.app.store.state.lines = 0; },
        cratefull: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); F.upgrade(f, 'press'); F.upgrade(f, 'stamp'); F.upgrade(f, 'crate'); F.run(f, 5 * 3600e3); Lull.app.store.state.lines = 0; },
        maxed: (f, F) => { for (const k of Object.keys(f)) delete f[k]; Object.assign(f, F.create()); for (const k of ['stamp', 'store', 'press', 'crate']) while (F.upgrade(f, k)); F.run(f, 3 * 3600e3); Lull.app.store.state.lines = 0; },
      })) {
        await facSet(fn);
        await page.mouse.move(2, 2);
        await page.waitForTimeout(700);
        // Each picture shows the state it is named for (a short line is short of minos, not backed up behind the crate).
        const w8 = await ev(() => Object.assign(Lull.Factory.waits(Lull.app.store.state.factory), { warm: Lull.app.modes.factory.view.flags.storeWarm }));
        const is = { fresh: true, starved: w8.storeEmpty && !w8.crateFull, storefull: w8.warm && !w8.crateFull, cratefull: w8.crateFull, maxed: true }[name];
        check(w + '×' + hgt + ' ' + theme + ' ' + name + ': the picture shows that state', is, JSON.stringify(w8));
        await shot('35-factory-' + w + '-' + theme + '-' + name);
      }
    }
    await ev(() => { Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); });
  }
  await page.setViewportSize({ width: 520, height: 760 });
  // The mold picker fits a narrow window: whole tiles, no sideways scroll, six rows at most.
  await page.setViewportSize({ width: 400, height: 700 });
  await facSet((f, F) => { while (F.upgrade(f, 'press')); });
  await ev(() => Lull.app.modes.factory.openMold(3));
  await page.waitForTimeout(400);
  const narrow = await ev(() => {
    const g = document.querySelector('.modal .catalog.molds'), gr = g.getBoundingClientRect(), tiles = Array.from(g.querySelectorAll('.mold')).map((t) => t.getBoundingClientRect());
    const seen = tiles.filter((t) => t.top < gr.bottom), cut = Math.max(...seen.map((t) => t.bottom - gr.bottom));
    return { sideways: g.scrollWidth > g.clientWidth, rows: new Set(seen.map((t) => Math.round(t.top))).size, cut: +cut.toFixed(2), tile: Math.round(tiles[0].width) };
  });
  check('the mold picker fits 400 px: no sideways scroll, six whole rows (the sixth not cut)', !narrow.sideways && narrow.rows === 6 && narrow.cut <= 0 && narrow.tile >= 44, JSON.stringify(narrow));
  await shot('34-factory-mold-400');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 520, height: 760 });
  await page.waitForTimeout(150);
  // The collector's click target is the collector's, the same at every size (a bigger crate packs smaller, in place).
  const crateHot = await ev(() => {
    const M = Lull.app.modes.factory, f = Lull.app.store.state.factory, out = [];
    Lull.app.store.state.lines = 5000; f.crateLevel = 0; M.build();
    for (let i = 0; i < 4; i++) {
      M.upgrade('crate');
      const b = document.querySelector('.fac-hot[data-hot=crate]'), r = M.view.rect('crate', 0, f);
      out.push([Math.round(parseFloat(b.style.height)), Math.round(r.h), Math.round(parseFloat(b.style.width)), Math.round(r.w), Math.round(parseFloat(b.style.top)), Math.round(r.y), Math.round(M.view.Y(M.view.S.RAIL + 0.2) - M.view.Y(0.25))]);
    }
    return out;
  });
  check('the collector\'s click target is the whole collector at every crate size', crateHot.length === 4 && crateHot.every(([a, b, c, d, e, g, hh]) => Math.abs(a - b) <= 1 && Math.abs(c - d) <= 1 && Math.abs(e - g) <= 1 && Math.abs(b - hh) <= 1), JSON.stringify(crateHot));
  // Leaving the tab mid-collect: nothing half-played resumes on return.
  const settle = await ev(async () => {
    const M = Lull.app.modes.factory, f = Lull.app.store.state.factory;
    f.crate = '2'.repeat(60); f.lift = []; f.lastTick = Date.now();
    await new Promise((r) => setTimeout(r, 100));
    M.collect();
    await new Promise((r) => setTimeout(r, 60));
    Lull.app.setTab('play');
    await new Promise((r) => setTimeout(r, 300));
    Lull.app.setTab('factory');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { collect: !!M.view.collectA, fx: M.view.fx.parts.length, fly: !!document.querySelector('.fac-fly') };
  });
  check('a collect cut short by a tab change does not replay on return', !settle.collect && !settle.fx && !settle.fly, JSON.stringify(settle));
  // Collect's label counts what it takes, minos still hopping into the crate included (it lands them first).
  const lifted = await ev(async () => {
    const M = Lull.app.modes.factory, f = Lull.app.store.state.factory;
    const y = Lull.Factory.LIFT.len - Lull.Factory.LIFT.speed * Lull.Factory.TICK; // a tick from the station
    f.crate = '3'.repeat(38); f.lift = [{ n: 6, s: 0, c: 1, u: 1, y, py: y }]; f.lastTick = Date.now();
    M.view.flushLift();
    await new Promise((r) => setTimeout(r, 400));
    M.update();
    const riding = M.view.inflight, label = document.querySelector('#fac-collect .btn').textContent, before = Lull.app.store.state.lines;
    M.collect();
    return { riding, label, took: Lull.app.store.state.lines - before };
  });
  check('Collect says what it takes, even with minos on their way into the crate', lifted.riding > 0 && lifted.label === 'Collect ' + lifted.took + ' ⦵', JSON.stringify(lifted));
  // An achievement a collect earns is paid after the lines land, so the wallet still moves only on arrival.
  const achFly = await ev(async () => {
    const app = Lull.app, M = app.modes.factory, f = app.store.state.factory, n = () => document.getElementById('wallet-n').textContent;
    M.flushFly();
    if (app.store.state.achievements) delete app.store.state.achievements.fac_sweep;
    f.crateLevel = 3; f.lift = []; f.crate = '4'.repeat(Lull.Factory.crateMinos(3)); f.lastTick = Date.now(); M.view.flushLift();
    await new Promise((r) => setTimeout(r, 300));
    const before = n(), lines0 = app.store.state.lines;
    M.collect();
    let changed = false;
    const t0 = performance.now();
    while (document.querySelector('.fac-fly') && performance.now() - t0 < 3000) { if (n() !== before) changed = true; await new Promise((r) => requestAnimationFrame(r)); }
    await new Promise((r) => setTimeout(r, 30));
    return { changed, gained: app.store.state.lines - lines0, after: n(), before };
  });
  check('a collect that earns an achievement still counts into the wallet only when its lines land', !achFly.changed && achFly.after !== achFly.before && achFly.gained >= 40 + 40, JSON.stringify(achFly));
  await page.setViewportSize({ width: 520, height: 760 });
  await ev((keep) => { const k = JSON.parse(keep), f = Lull.app.store.state.factory; for (const x of Object.keys(f)) delete f[x]; Object.assign(f, k.f, { lastTick: Date.now() }); Lull.app.store.state.lines = k.lines; Lull.app.store.state.owned = k.owned; Lull.app.store.state.achievements = k.ach; Lull.app.refreshWallet(); Lull.app.modes.factory.build(); }, facKeep);
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
  const ach = await ev(() => ({ legends: document.querySelectorAll('.ach.legend').length, got: document.querySelectorAll('.ach.got').length, all: document.querySelectorAll('.ach').length, groups: document.querySelectorAll('.ach-group').length, partGroups: Lull.Achievements.GROUPS.filter((g) => g.part).length, open: document.querySelectorAll('.ach-group[open]').length, quad: !!Lull.app.store.state.achievements.quad, paid: Lull.app.store.state.stats.lines.achievements }));
  check('achievements: earned in play, listed in their own tab (legendary ones too), and paid', ach.quad && ach.got >= 1 && ach.all >= 85 && ach.legends >= 28 && ach.paid >= 15, JSON.stringify(ach));
  // (Five places, and a group for each board option loaded that has one: Protect's.)
  check('achievements: five groups (and the board options’), folded away at first', ach.groups === 5 + ach.partGroups && ach.open === 0, JSON.stringify(ach));
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
    for (const tab of ['play', 'puzzle', 'factory']) {
      await ev((t) => Lull.app.setTab(t), tab);
      await page.waitForTimeout(150);
      const overflow = await ev(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (tab === 'play') check(w + '×' + hgt + ' the daily gift sits inside the status bar', await ev(() => { const g = document.getElementById('gift-btn'), b = document.getElementById('play-status'); if (!g) return false; const r = g.getBoundingClientRect(), q = b.getBoundingClientRect(); return r.width > 0 && r.left >= q.left - 0.5 && r.right <= q.right + 0.5 && r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5; }));
      if (tab === 'play' || tab === 'classic') check(w + '×' + hgt + ' ' + tab + ' status bar shows everything', await ev((t) => { const b = document.getElementById(t === 'play' ? 'play-status' : 'classic-status'); return b.scrollWidth <= b.clientWidth + 1; }, tab));
      check(w + '×' + hgt + ' ' + tab + ' fits', !overflow);
      if (tab === 'puzzle') check(w + '×' + hgt + ' puzzle card and wildcards fit', await ev(() => ['view-puzzle', 'puz-card', 'puz-mods', 'puz-actions'].every((id) => { const el = document.getElementById(id); return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1; })));
      // The action bar with its widest words: prices (none held), then counts (25 Undos, 2 free hints): one line, inside.
      if (tab === 'puzzle') for (const [held, free] of [[0, 0], [25, 2]]) {
        const bar = await ev(([u, f]) => {
          const st = Lull.app.store; st.state.inventory.rewind = u; st.state.freebies.hint = f; st.itemsChanged();
          const a = document.getElementById('puz-actions'), r = a.getBoundingClientRect();
          const btns = [...a.querySelectorAll('.btn')].map((b) => { const q = b.getBoundingClientRect(); return { id: b.id, h: Math.round(q.height), in: q.left >= r.left - 0.5 && q.right <= r.right + 0.5, fits: b.scrollWidth <= b.clientWidth + 1 }; });
          return { over: a.scrollWidth > a.clientWidth + 1, btns, ok: btns.every((b) => b.in && b.fits && b.h === btns[0].h) };
        }, [held, free]);
        check(w + '×' + hgt + ' the puzzle actions fit on one line, ' + (held ? 'with counts' : 'with prices'), !bar.over && bar.ok, JSON.stringify(bar));
      }
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
  // New board asks for a size (sizes-test.cjs has the window itself); Create keeps the one it opens on.
  await page.click('.modal-lib .lib-new');
  await page.waitForTimeout(150);
  await page.click('.modal-newboard footer .btn.primary');
  await page.waitForTimeout(150);
  const libB = await ev(() => { const g = Lull.app.modes.play.game, B = Lull.app.store.state.boards; return { id: B.cur, n: B.list.length, pieces: g.s.pieces, empty: g.board.isEmpty(), rng: g.rng.state(), rows: document.querySelectorAll('.modal-lib .lib-row').length, first: document.querySelector('.modal-lib .lib-row').dataset.id }; });
  check('New board shelves the one in play and starts an empty one (its own seed)', libB.id !== libA.id && libB.n === libA.n + 1 && libB.pieces === 0 && libB.empty && JSON.stringify(libB.rng) !== JSON.stringify(JSON.parse(libA.json).rng) && libB.rows === libA.n + 1 && libB.first === libB.id, JSON.stringify(libB));
  await page.click('.modal-lib .lib-new');
  await page.click('.modal-newboard footer .btn.primary');
  await page.waitForTimeout(100);
  const libB2 = await ev(() => { const B = Lull.app.store.state.boards; return { id: B.cur, n: B.list.length }; });
  check('an untouched board never shelves another empty one: it is made again in its own record', libB2.id === libB.id && libB2.n === libB.n, JSON.stringify([libB, libB2]));
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
  // The Board full card's Undo follows the shared count (used or given in Puzzles or by a gift), shown as Puzzles shows
  // it: none held, its price (scripts/undo-test.cjs pays it every way there is).
  const topU = await ev(() => {
    const m = Lull.app.modes.play, st = Lull.app.store, F = st.state.stats.free, t0 = F.topouts, keep = st.state.inventory.rewind || 0;
    const btn = () => { const b = document.getElementById('topout-undo'); return b && { text: b.textContent, cnt: b.querySelector('.cnt') && b.querySelector('.cnt').textContent, gem: b.querySelector('.gem') && b.querySelector('.gem').textContent, aria: b.getAttribute('aria-label'), icon: !!b.querySelector('svg') }; };
    st.state.inventory.rewind = 3; st.itemsChanged(); const three = btn();
    st.state.inventory.rewind = 0; st.itemsChanged(); const none = btn();
    st.grant('rewind'); const five = btn();
    const btns = Array.from(document.querySelectorAll('#play-overlay .card button')).map((b) => b.textContent);
    return { three, none, five, btns, topouts: F.topouts - t0, keep };
  });
  check('the Board full card\'s Undo follows the shared count: 3, the price (5) at 0, 5 when given', topU.three && topU.three.cnt === '3' && topU.three.aria === 'Undo, 3 held' && topU.three.text === 'Undo3' && topU.three.icon && topU.none && topU.none.cnt === null && topU.none.gem === '⦵5' && topU.none.aria === 'Undo, costs 5 lines' && topU.five && topU.five.cnt === '5' && topU.btns.includes('Boards') && topU.btns.includes('Retire') && topU.topouts === 0, JSON.stringify(topU));
  await shot('77-topout-undo');
  await ev((n) => { const st = Lull.app.store; st.state.inventory.rewind = n; st.itemsChanged(); }, topU.keep);
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
    // A T in open air always turns (a random piece, or one against the stack, may not).
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.board.set(x, y, 0);
    g.replacePiece({ id: 'T' });
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
  await ev(() => { for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0; Lull.app.store.state.settings.hints = false; Lull.app.hints.sync(); });
  }

  // ---- save and reload ----------------------------------------------------------------------------------------------
  console.log('persistence');
  await ev(() => { const m = Lull.app.modes.puzzle; m.loadNumbered('E', 1); m.action('drop'); });
  const pzBefore = await ev(() => JSON.stringify(Lull.app.store.state.puzzle.current && { seed: Lull.app.store.state.puzzle.current.seed, attempts: Lull.app.store.state.puzzle.current.attempts, live: !!Lull.app.store.state.puzzle.current.live }));
  const snap = await ev(() => { Lull.app.setTab('play'); Lull.app.saveNow(); const s = Lull.app.store.state; return { lines: s.lines, cells: Lull.app.modes.play.game.board.count(), skin: s.equipped.skin, solved: Object.keys(s.puzzle.solved).length }; });
  await page.reload();
  await page.waitForTimeout(400);
  const back = await ev(() => { const s = Lull.app.store.state; return { lines: s.lines, cells: Lull.app.modes.play.game.board.count(), skin: s.equipped.skin, solved: Object.keys(s.puzzle.solved).length, modal: !!document.querySelector('.modal') }; });
  check('progress survives a reload', back.lines === snap.lines && back.cells === snap.cells && back.skin === snap.skin && back.solved === snap.solved, JSON.stringify([snap, back]));
  check('no welcome on the second run', !back.modal);
  const pzAfter = await ev(() => { Lull.app.setTab('puzzle'); const c = Lull.app.store.state.puzzle.current; return JSON.stringify(c && { seed: c.seed, attempts: c.attempts, live: !!c.live }); });
  check('a puzzle resumed after a reload is the same attempt (a first try that set a piece stays the first try)', pzBefore === pzAfter && /"attempts":[1-9]\d*,"live":true/.test(pzAfter), pzBefore + ' → ' + pzAfter);
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
  check('title bar: Play, Puzzles, Factory together (no Classic: it is a board mode); Stats, Achievements by the wallet (the Shop); ⌘1–⌘6 left to right, each in its tooltip',
    bar.modes === 'play,puzzle,factory' && bar.meta === 'stats,achievements' && bar.ltr && bar.tips && bar.feet === '⌘1,⌘2,⌘3,⌘4,⌘5' && bar.wallet === '⌘6'
    && /^brand,bar-idle,tabs,spacer,tabs-meta,wallet,tb-sep,btn-mute,btn-settings,tb-sep win,winbtns$/.test(bar.kids), JSON.stringify(bar));
  const shortcut = [];
  for (let n = 1; n <= 6; n++) { await page.keyboard.press('Control+Digit' + n); shortcut.push(await ev(() => { const on = document.querySelector('#titlebar .tabs button[aria-selected="true"], #wallet.active'); return Lull.app.tab + ':' + (on && (on.dataset.tab || on.id)); })); }
  check('⌘1–⌘6 open the tabs (and the Shop, by the wallet) in the order they sit, and light them', shortcut.join() === 'play:play,puzzle:puzzle,factory:factory,stats:stats,achievements:achievements,shop:wallet', shortcut.join());
  // Labels: every play tab named when wide; only the tab you are on when narrower; icons alone when narrow; the bar keeps room to drag.
  const labels = [];
  for (const [w, nat, want] of [[1100, false, 'Play,Puzzles,Factory|Stats,Achievements'], [900, false, 'Play,Puzzles,Factory|'], [900, true, 'Play,Puzzles,Factory|'], [560, false, 'Puzzles|'], [520, true, '|'], [460, false, '|'], [400, true, '|']]) {
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
    const K = await ev(() => { const B = Lull.BarIdle; return { ROWS: B.ROWS, CLEAR: B.CLEAR, POOL: B.POOL, slow: B.speedAt(B.KINDS[0][1]), fast: B.speedAt(B.KINDS[B.KINDS.length - 1][2]) }; });
    check('four lanes, and speeds from the game\'s own gravity: a Level 1 drift (a cell a second) up to a dart', K.ROWS === 4 && Math.abs(K.slow - 1) < 1e-9 && K.fast > 6 && K.fast < 14, JSON.stringify(K));
    // Drawn every display frame: as many frames drawn as display frames the page was given (counted by a frame callback
    // of its own, at least 60 of them and 1.5 s; a busy machine gives fewer a second, so it may take longer).
    const p0 = await pix();
    const drawn = await ev(() => new Promise((res) => {
      const i = Lull.Collapse.idle, f0 = i.frames, t0 = performance.now();
      let shown = 0;
      const f = (now) => { shown++; if ((shown >= 60 && now - t0 >= 1500) || now - t0 > 15000) res({ drawn: i.frames - f0, shown }); else requestAnimationFrame(f); };
      requestAnimationFrame(f);
    }));
    const p1 = await pix();
    check('pieces travel along the bar, drawn every display frame', p0 !== p1 && drawn.shown >= 60 && Math.abs(drawn.drawn - drawn.shown) <= 1, JSON.stringify(drawn));
    const cells = await ev(() => Lull.Collapse.idle.pieces.length);
    check('in the equipped look, a few pieces along the bar', cells >= 3, String(cells));
    // Run the parade by hand for four minutes of bar time at 30 fps and watch every frame and every move.
    const march = await ev((K) => {
      const i = Lull.Collapse.idle, P = Lull.Pieces;
      const run = (seed, uneven) => {
        const bad = [], log = [];
        i.seed = seed; i.reset(i.cols);
        i.onMove = (p, kind, from, to) => log.push({ n: p.n, id: p.id, kind, from: { ...from }, to: { rot: to.rot, x: to.x, y: to.y } });
        const at = () => new Map(i.pieces.map((p) => [p.n, { id: p.id, rot: p.rot, x: p.x, y: p.y, v0: p.v0 }]));
        let prev = at(), minN = 99, maxN = 0, subcell = 0, turns = 0, shifts = 0, passes = 0, fastPasses = 0, rainMax = 0, rainBehind = 0, rainLooks = 0, braked = 0, darts = 0;
        const v0s = new Set(), spawnT = [], ex0 = i.exited, ov0 = i.overtakes, y0 = i.yields, d0 = i.dodges;
        for (let f = 0; f < 240 * 30; f++) {
          log.length = 0;
          const dt = uneven ? (f % 3 ? 1 / 60 : 1 / 20) : 1 / 30;
          i.step(dt);
          const now = at();
          const onBar = i.pieces.filter((p) => i.hi(p) > 0);
          minN = Math.min(minN, onBar.length); maxN = Math.max(maxN, onBar.length);
          // Nothing overlaps, and pieces sharing a lane keep CLEAR cells apart, checked from the shapes themselves.
          const cellsOf = (p) => P.get(p.id).rots[p.rot].map(([cx, cy]) => [p.x + cx, p.y + cy]);
          for (const p of i.pieces) {
            if (!Number.isInteger(p.y) || !P.get(p.id).rots[p.rot]) bad.push('off the lanes ' + p.id);
            for (const [, y] of cellsOf(p)) if (y < 0 || y >= K.ROWS) bad.push('out of the lanes ' + p.id);
            for (const q of i.pieces) if (q !== p) for (const [ax, ay] of cellsOf(p)) for (const [bx, by] of cellsOf(q)) {
              if (ay === by && Math.abs(ax - bx) < 1 - 1e-6) bad.push('overlap ' + p.id + q.id);
              if (ay === by && Math.abs(ax - bx) < 1 + K.CLEAR - 1e-6) bad.push('closer than ' + K.CLEAR + ' ' + p.id + q.id);
            }
          }
          // Moves: whole lanes, or the game's SRS turn with one of its kicks; nothing else jumps.
          for (const m of log) {
            const dx = m.to.x - m.from.x, dy = m.to.y - m.from.y;
            if (m.kind === 'shift') { shifts++; if (Math.abs(dx) > 1e-9 || Math.abs(dy) !== 1 || m.to.rot !== m.from.rot) bad.push('shift not one lane'); }
            else {
              turns++;
              const d = (m.to.rot - m.from.rot + 4) % 4, ks = P.kicksFor(P.get(m.id), m.from.rot, m.to.rot);
              if ((d !== 1 && d !== 3) || !ks.some(([kx, ky]) => Math.abs(kx - dx) < 1e-9 && ky === dy)) bad.push('turn not SRS ' + m.id + ' ' + m.from.rot + '>' + m.to.rot + ' ' + dx + ',' + dy);
            }
          }
          for (const p of i.pieces) {
            v0s.add(p.v0);
            const was = prev.get(p.n);
            if (!was) { spawnT.push(i.t); if (p.v0 > 5) darts++; if (p.x + P.get(p.id).rotBounds[p.rot].maxX + 1 > 0.5) bad.push('came in on the bar'); continue; }
            // Nobody ever slows down (or speeds up): every step is its own speed, exactly.
            if (Math.abs(p.x - was.x - p.v0 * dt) > 1e-6 || p.v !== p.v0) braked++;
            const moved = log.some((m) => m.n === p.n);
            // Travel is smooth: forward only, less than a cell a frame, and mostly between whole cells.
            if (!moved) {
              const dx = p.x - was.x;
              if (dx < -1e-9 || dx >= 1 || p.y !== was.y || p.rot !== was.rot) bad.push('jumped ' + p.id + ' ' + dx);
              if (Math.abs(p.x - Math.round(p.x)) > 0.01) subcell++;
            }
          }
          // Overtakes: one piece's centre passing another's, and who passed whom.
          for (const [n, a] of now) for (const [m, b] of now) {
            const pa = prev.get(n), pb = prev.get(m);
            if (pa && pb && pa.x < pb.x && a.x > b.x) { passes++; if (a.v0 > b.v0) fastPasses++; }
          }
          // The rain: bounded, and lit behind the pieces that make it.
          const lit = i.rainCount();
          rainMax = Math.max(rainMax, lit);
          if (f % 30 === 0) for (const p of onBar) {
            const b = P.get(p.id).rotBounds[p.rot];
            if (p.v < 0.8 || p.x + b.minX < 6 || p.x + b.maxX > i.cols - 8) continue;
            rainLooks++;
            for (let k = 0; k < K.POOL; k++) {
              if (!(i.t - i.rt[k] < i.rl[k])) continue;
              const col = i.rainX(k, i.t - i.rt[k]), row = i.ry[k];
              if (row >= p.y + b.minY && row <= p.y + b.maxY && col < p.x + b.minX && col > p.x + b.minX - 4) { rainBehind++; break; }
            }
          }
          prev = now;
        }
        i.onMove = null;
        const gaps = spawnT.slice(1).map((t, k) => Math.round((t - spawnT[k]) * 10) / 10);
        const vs = [...v0s];
        return { bad: bad.slice(0, 5), nbad: bad.length, minN, maxN, subcell, turns, shifts, passes, fastPasses, overtakes: i.overtakes - ov0, exited: i.exited - ex0, cols: i.cols, braked, darts, yields: i.yields - y0, dodges: i.dodges - d0,
          speeds: vs.length, vmin: Math.min(...vs), vmax: Math.max(...vs), gaps, rainMax, rainBehind, rainLooks,
          sig: JSON.stringify(i.pieces.map((p) => [p.id, p.rot, p.x.toFixed(6), p.y])) };
      };
      // The same seed makes the same parade whatever ran before it: b starts where a ended, and a where the live bar was,
      // here with a dart still owed a way in from that parade (its bar time runs on from 0 again: nothing may carry over).
      i.owed = { kind: Lull.BarIdle.KINDS[Lull.BarIdle.KINDS.length - 1], until: i.t + 3 };
      const a = run(7919), b = run(7919), c = run(104729), d = run(31337, true);
      i.reset(i.cols);
      return { a, c: { bad: c.bad, passes: c.passes, braked: c.braked, yields: c.yields }, d: { bad: d.bad, passes: d.passes, braked: d.braked }, same: a.sig === b.sig && a.turns === b.turns && a.gaps.join() === b.gaps.join(), differs: a.sig !== c.sig };
    }, K);
    const m = march.a;
    check('never an overlap, and pieces sharing a lane always a clear cell apart, over minutes of passing (uneven frames too)', m.nbad === 0 && march.c.bad.length === 0 && march.d.bad.length === 0, JSON.stringify([m.bad, march.c.bad, march.d.bad]));
    check('they fall along the bar smoothly, between whole cells, each at its own speed from a drift to a dart', m.subcell > 10000 && m.speeds >= 20 && m.vmin < 1.5 && m.vmax > 4, JSON.stringify({ subcell: m.subcell, speeds: m.speeds, vmin: m.vmin, vmax: m.vmax }));
    check('lanes and turns are the game\'s: whole lanes, SRS turns with their kicks, now and then', m.turns >= 20 && m.shifts >= 20, JSON.stringify({ turns: m.turns, shifts: m.shifts }));
    check('nobody ever slows down: every piece travels at its own speed all the way, darts included', m.braked === 0 && march.c.braked === 0 && march.d.braked === 0 && m.darts >= 3, JSON.stringify({ braked: [m.braked, march.c.braked, march.d.braked], darts: m.darts }));
    check('meetings are made together: the faster piece moves over early and the slower one steps aside for it too', m.yields >= 5 && m.dodges >= 5 && march.c.yields >= 5, JSON.stringify({ yields: m.yields, dodges: m.dodges, c: march.c.yields }));
    check('fast pieces pass slow ones, weaving round them', m.passes >= 5 && m.fastPasses === m.passes && m.overtakes === m.passes && march.c.passes >= 3 && march.d.passes >= 3, JSON.stringify({ passes: m.passes, fast: m.fastPasses, overtakes: m.overtakes, c: march.c.passes, d: march.d.passes }));
    check('a new piece comes in at varying intervals, and the parade flows on: never empty, never crowded', m.gaps.length > 20 && new Set(m.gaps).size >= 10 && m.minN >= 2 && m.maxN <= Math.ceil(m.cols / 5) && m.exited >= 20, JSON.stringify({ gaps: m.gaps.slice(0, 12), minN: m.minN, maxN: m.maxN, exited: m.exited }));
    check('a rain of glyphs trails behind the moving pieces, bounded', m.rainMax > 10 && m.rainMax <= K.POOL && m.rainLooks > 50 && m.rainBehind >= m.rainLooks * 0.8, JSON.stringify({ rainMax: m.rainMax, looks: m.rainLooks, behind: m.rainBehind }));
    check('the parade is the same for the same seed, and another seed goes another way', march.same && march.differs, JSON.stringify({ same: march.same, differs: march.differs }));
    // Smooth travel: at an even frame rate every piece moves by the same amount every frame (drawn at its exact,
    // sub-pixel place: no rounding to whole pixels), and in the live loop too, paced to whole display frames.
    const smooth = await ev(async () => {
      const i = Lull.Collapse.idle, sd = (a) => { const m = a.reduce((u, v) => u + v, 0) / a.length; return [m, Math.sqrt(a.reduce((u, v) => u + (v - m) ** 2, 0) / a.length)]; };
      i.seed = 424242; i.reset(i.cols);
      const steps = new Map(), last = new Map();
      for (let f = 0; f < 600; f++) {
        i.step(1 / 60);
        for (const p of i.pieces) { const X = i.screenX(p) * i.dpr; if (last.has(p.n)) { if (!steps.has(p.n)) steps.set(p.n, []); steps.get(p.n).push(X - last.get(p.n)); } last.set(p.n, X); }
      }
      let worst = 0;
      for (const a of steps.values()) if (a.length > 30) { const [m, d] = sd(a); worst = Math.max(worst, d / m); }
      // Live: the real loop's displacement per display frame, for 3 seconds. A busy machine skips display frames (a
      // callback comes two or three frames after the last, or later after a stall), and the loop rightly steps whole
      // frames then: so each callback's displacement is divided by the display frames it spans, counted from the
      // callbacks' own timestamps (whole multiples of one frame: the median of the gaps within half again of the
      // shortest; a stall counts as at most a tenth of a second, as the loop takes it).
      const live = await new Promise((res) => {
        const rec = new Map(), ts = [];
        let n = 0;
        const frame = (now) => {
          ts.push(now);
          for (const p of i.pieces) { if (!rec.has(p.n)) rec.set(p.n, []); rec.get(p.n).push([n, i.screenX(p) * i.dpr]); }
          if (++n < 180) requestAnimationFrame(frame);
          else {
            const gaps = ts.slice(1).map((t, k) => Math.min(100, t - ts[k])), single = gaps.filter((g) => g <= Math.min(...gaps) * 1.5).sort((u, v) => u - v), one = single[single.length >> 1];
            const spans = gaps.map((g) => Math.max(1, Math.round(g / one)));
            const out = [];
            for (const a of rec.values()) if (a.length > 90) { const [m, d] = sd(a.slice(1).map(([k, x], j) => (x - a[j][1]) / spans[k - 1])); out.push(+(d / m).toFixed(4)); }
            res({ out, skipped: spans.filter((k) => k > 1).length });
          }
        };
        requestAnimationFrame(frame);
      });
      return { worst, live: live.out, skipped: live.skipped, pieces: steps.size, subpx: i.pieces.some((p) => Math.abs(i.screenX(p) * i.dpr - Math.round(i.screenX(p) * i.dpr)) > 0.01), rows: Number.isInteger(i.top * i.dpr) && Number.isInteger(i.s * i.dpr) };
    });
    check('travel is even: the same step every frame for a steady piece, drawn at sub-pixel places (rows on whole pixels), in the live loop too', smooth.worst < 1e-6 && smooth.live.length >= 2 && Math.max(...smooth.live) < 0.03 && smooth.subpx && smooth.rows, JSON.stringify(smooth));
    // The rain is a steady stream: one piece alone on the bar keeps about the same number of glyphs lit, each fading
    // smoothly over two to three seconds and changing its character only now and then, gently.
    const rain = await ev((K) => {
      const i = Lull.Collapse.idle, B = Lull.BarIdle;
      i.seed = 99; i.reset(i.cols);
      // A Level 4 walker, alone.
      const p = i.pieces[0];
      i.pieces = [p]; p.com = []; p.calm = Infinity; i.due = Infinity; i.rt.fill(-1e9);
      p.x0 = 2; p.t0 = i.t; p.x = 2; p.v0 = p.v = B.speedAt(4);
      const counts = [], track = [], k0 = [];
      let jumps = 0, rises = 0, swaps = 0, glyphFrames = 0, minLife = Infinity;
      const prevA = new Float64Array(K.POOL), prevG = new Int32Array(K.POOL).fill(-1);
      for (let f = 0; f < 60 * 8; f++) {
        i.step(1 / 60);
        if (i.xAt(p, i.t) > i.cols - 12) { p.x0 = 2; p.t0 = i.t; }
        if (f >= 60 * 3.5) counts.push(i.rainCount());
        for (let k = 0; k < K.POOL; k++) {
          const age = i.t - i.rt[k], a = i.rainAlpha(k, age);
          if (age >= 0 && age < i.rl[k]) {
            minLife = Math.min(minLife, i.rl[k]);
            if (age > 1 / 30) { if (Math.abs(a - prevA[k]) > i.ra[k] / (Lull.BarIdle.RAIN_IN * 60) + 1e-6) jumps++; if (age > 0.2 && a > prevA[k] + 1e-9) rises++; }
            const g = i.rainGlyph(k, age);
            glyphFrames++;
            if (prevG[k] >= 0 && g[0] !== prevG[k] && age > 1 / 30) swaps++;
            prevG[k] = g[0];
          } else prevG[k] = -1;
          prevA[k] = a;
        }
      }
      const mean = counts.reduce((u, v) => u + v, 0) / counts.length, spread = Math.sqrt(counts.reduce((u, v) => u + (v - mean) ** 2, 0) / counts.length) / mean;
      return { v: p.v0, mean, spread, min: Math.min(...counts), max: Math.max(...counts), jumps, rises, minLife, swapsPerGlyphSecond: swaps / (glyphFrames / 60), life: B.RAIN_LIFE };
    }, K);
    check('the rain streams steadily behind a piece: a stable count lit, fading smoothly over 2 to 3 seconds, glyphs changing only now and then',
      rain.mean > 8 && rain.spread < 0.15 && rain.min > 0 && rain.jumps === 0 && rain.rises === 0 && rain.minLife >= 1.5 && rain.swapsPerGlyphSecond < 0.5, JSON.stringify(rain));
    await ev(() => { const i = Lull.Collapse.idle; i.reset(i.cols); });
    // Reduced motion: one still frame, no rain.
    const still = await ev(async () => {
      const i = Lull.Collapse.idle;
      Lull.app.settings.motion = 'reduced';
      const t0 = i.t, x0 = i.pieces.map((p) => p.x).join();
      await new Promise((r) => setTimeout(r, 900));
      i.atlas.clear(); i.draw();
      const out = { t: i.t === t0, x: i.pieces.map((p) => p.x).join() === x0, rain: i.atlas.size, lit: i.rainCount() };
      Lull.app.settings.motion = 'full';
      return out;
    });
    check('under reduced motion the bar holds one still frame, and draws no rain', still.t && still.x && still.rain === 0, JSON.stringify(still));
    // Dragging the collapsed bar's edge keeps the parade: the same pieces in the same places.
    const pose = () => ev(() => { const i = Lull.Collapse.idle; i.resize(); return { cols: i.cols, t: i.t, serial: i.serial, pieces: i.pieces.map((p) => [p.n, p.id, p.rot, p.x, p.y].join()), los: i.pieces.map((p) => i.lo(p)) }; });
    await ev(() => Lull.Collapse.idle.stop());
    const rz0 = await pose();
    await page.setViewportSize({ width: 540, height: 760 });
    const rz1 = await pose();
    await page.setViewportSize({ width: 420, height: 760 });
    const rz2 = await pose();
    await page.setViewportSize({ width: 520, height: 760 });
    await ev(() => Lull.Collapse.idle.start());
    const same = (a, b) => a.t === b.t && a.serial === b.serial;
    check('resizing the collapsed bar keeps its pieces where they were (no reshuffle)',
      rz1.cols > rz0.cols && rz2.cols < rz0.cols && same(rz0, rz1) && same(rz1, rz2) && rz1.pieces.join('|') === rz0.pieces.join('|')
        && rz2.pieces.length >= 1 && rz2.pieces.every((q) => rz1.pieces.includes(q)) && rz2.los.every((lo) => lo < rz2.cols)
        && rz1.pieces.filter((q, k) => rz1.los[k] < rz2.cols).join('|') === rz2.pieces.join('|'),
      JSON.stringify({ rz0, rz1, rz2 }));
    // The same drawing in both themes and two widths, as a frame strip.
    for (const theme of ['dark', 'light']) {
      await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); }, theme);
      for (const w of [520, 900]) {
        await page.setViewportSize({ width: w, height: 760 });
        await page.waitForTimeout(250);
        const strip = await ev(() => {
          const i = Lull.Collapse.idle;
          // As the bar opens at this width (dragged to it, the pieces would keep their places and travel on into the rest).
          i.stop(); i.look = i.getLook(); i.resize(true); i.reset(i.cols);
          const cv = i.cv, n = 8, out = document.createElement('canvas');
          out.width = cv.width; out.height = cv.height * n;
          const o = out.getContext('2d');
          o.fillStyle = 'rgb(' + getComputedStyle(document.body).getPropertyValue('--bg').trim() + ')'; o.fillRect(0, 0, out.width, out.height);
          const sums = [];
          let crisp = true;
          for (let k = 0; k < n; k++) {
            for (let f = 0; f < 12; f++) i.step(1 / 30);
            i.draw();
            o.drawImage(cv, 0, cv.height * k);
            const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
            let sum = 0; for (let j = 3; j < d.length; j += 16) sum += d[j]; sums.push(sum);
            // Rows and cell sizes on whole device pixels (the travel along the bar is sub-pixel, from sharp sprites).
            if (!Number.isInteger(i.top * i.dpr) || !Number.isInteger(i.s * i.dpr)) crisp = false;
          }
          i.start();
          return { url: out.toDataURL(), distinct: new Set(sums).size, drawn: sums.every((x) => x > 0), crisp };
        });
        check('the bar draws its pieces and their rain as they travel, rows on whole device pixels (' + theme + ', ' + w + ')', strip.drawn && strip.distinct >= 6 && strip.crisp, JSON.stringify({ distinct: strip.distinct, crisp: strip.crisp }));
        if (OUT) {
          await page.screenshot({ path: path.join(OUT, '95-collapsed-' + theme + '-' + w + '.png'), clip: { x: 0, y: 0, width: w, height: 60 } });
          require('fs').writeFileSync(path.join(OUT, '95-collapsed-strip-' + theme + '-' + w + '.png'), Buffer.from(strip.url.split(',')[1], 'base64'));
        }
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
    // A Classic board pauses (like leaving its tab) and its music stops; expanding leaves it paused where it was.
    await ev(() => { Lull.app.setTab('play'); window.__keepPlain = Lull.app.modes.play.game.toJSON(); window.makeClassic(); });
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    const cl0 = await ev(() => ({ run: CM.running(), music: Lull.Music.playing }));
    await page.keyboard.press('Control+KeyJ');
    await page.waitForTimeout(300);
    const cl1 = await ev(() => ({ paused: CM.paused, music: Lull.Music.playing, y: CM.game.piece.y }));
    await page.waitForTimeout(600);
    const y2 = await ev(() => CM.game.piece.y);
    await page.keyboard.press('Control+KeyJ');
    await page.waitForTimeout(100);
    const cl2 = await ev(() => ({ tab: Lull.app.tab, paused: CM.paused, view: document.getElementById('view-play').classList.contains('active') }));
    check('collapsing pauses a Classic board and stops its music; expanding returns to it, still paused', cl0.run && cl1.paused && !cl1.music && y2 === cl1.y && cl2.tab === 'play' && cl2.paused && cl2.view, JSON.stringify([cl0, cl1, y2, cl2]));
    await ev(() => { const pm = Lull.app.modes.play; pm.setGame(new Lull.Game({ saved: window.__keepPlain, previewCount: Lull.app.settings.preview })); });
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

  // ---- achievements: coloured by place to play ------------------------------------------------------------------------
  console.log('achievement areas');
  {
    const theme0 = await ev(() => Lull.app.settings.theme);
    // Some earned in every group (a legendary one too), all groups open.
    await ev(() => {
      const S = Lull.app.store.state, A = Lull.Achievements, now = Date.now();
      for (const g of A.GROUPS) A.LIST.filter((a) => a.group === g.id && a.tier !== 'legend').slice(0, 2).forEach((a, i) => { S.achievements[a.id] = S.achievements[a.id] || now - 3600e3 * (i + 1); });
      const leg = A.LIST.find((a) => a.group === 'factory' && a.tier === 'legend'); S.achievements[leg.id] = S.achievements[leg.id] || now - 86400e3;
      // The latest few from different places, for Recent.
      A.GROUPS.forEach((g, i) => { S.achievements[A.LIST.find((a) => a.group === g.id && a.tier !== 'legend').id] = now - 60e3 * (i + 1); });
    });
    // In-page helpers: colours parsed from computed styles (rgb() or color(srgb …)), stacked backgrounds composited over
    // the solid window, and the WCAG contrast ratio.
    const probe = () => ev(() => {
      const parse = (c) => {
        let m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
        if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
        m = /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/.exec(c);
        if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
        return null;
      };
      const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
      const base = parse('rgb(' + getComputedStyle(document.documentElement).getPropertyValue('--bg') + ')');
      const behind = (el) => { const chain = []; for (let e = el; e && e.id !== 'app'; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor)); return chain.reverse().reduce((u, t) => (t && t[3] > 0 ? over(t, u) : u), base); };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const col = (el, prop, pseudo) => getComputedStyle(el, pseudo || null)[prop];
      const out = { groups: {}, rows: {}, worst: 99, worstAt: '', fit: true, over: [] }, pays = { got: {}, plain: {} };
      const low = (r, at) => { if (r < out.worst) { out.worst = r; out.worstAt = at; } };
      for (const g of document.querySelectorAll('.ach-group')) {
        const id = g.dataset.group, badge = g.querySelector('summary .ach-area'), fill = g.querySelector('summary .bar > i');
        out.groups[id] = { area: getComputedStyle(g).getPropertyValue('--area').trim(), badge: col(badge, 'color'), ring: col(badge, 'boxShadow'), fill: col(fill, 'backgroundImage'), icon: !!badge.querySelector('svg') };
        low(ratio(parse(col(badge, 'color')), behind(badge)), id + ' header badge');
        const rows = { plain: new Set(), got: new Set(), legend: new Set(), area: new Set(), bars: new Set() };
        for (const r of g.querySelectorAll('.ach')) {
          const i = r.querySelector('.ach-i');
          rows.area.add(getComputedStyle(r).getPropertyValue('--area').trim());
          if (r.classList.contains('legend')) {
            rows.legend.add(col(i, 'backgroundColor', '::after'));
            // Its gold words (the tier, and the pay once earned) read too.
            const tier = r.querySelector('.tier'); if (tier) low(ratio(parse(col(tier, 'color')), behind(tier)), r.dataset.id + ' tier');
            if (r.classList.contains('got')) { const pay = r.querySelector('.ach-pay'); low(ratio(parse(col(pay, 'color')), behind(pay)), r.dataset.id + ' legendary pay'); }
          } else {
            (r.classList.contains('got') ? rows.got : rows.plain).add(col(i, 'color'));
            if (r.classList.contains('got')) {
              low(ratio(parse(col(i, 'color')), behind(i)), r.dataset.id + ' badge');
              const pay = r.querySelector('.ach-pay'); low(ratio(parse(col(pay, 'color')), behind(pay)), r.dataset.id + ' pay');
              pays.got[id] = parse(col(pay, 'color'));
            } else pays.plain[id] = parse(col(r.querySelector('.ach-pay'), 'color'));
          }
          const bar = r.querySelector('.ach-prog .bar > i'); if (bar) rows.bars.add(col(bar, 'backgroundImage'));
          if (r.scrollWidth > r.clientWidth + 1) { out.fit = false; out.over.push(r.dataset.id + ' ' + r.scrollWidth + '>' + r.clientWidth); }
        }
        out.rows[id] = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, [...v]]));
        const sum = g.querySelector('summary'); if (sum.scrollWidth > sum.clientWidth + 1) { out.fit = false; out.over.push(id + ' header ' + sum.scrollWidth + '>' + sum.clientWidth); }
      }
      out.page = document.documentElement.scrollWidth <= innerWidth + 1;
      const root = getComputedStyle(document.documentElement), tok = (k) => parse(root.getPropertyValue(k).trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => 'rgb(' + [r, g, b].map((x) => parseInt(x, 16)).join(',') + ')'));
      // Apart from the accent, the legendary gold and the good and bad colours: the distance in OKLab (0.02 is about the
      // smallest difference anyone sees).
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const oklab = (c) => { const [r, g, b] = c.slice(0, 3).map(lin);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
      const d = (a, b) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
      // ... and for colour-blind eyes too: the least over normal sight and full deuteranopia and protanopia (Machado 2009).
      const M = { deut: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
        prot: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]] };
      const unlin = (v) => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055); };
      const sim = (c, k) => { const l = c.slice(0, 3).map(lin); return M[k].map((row) => unlin(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])); };
      const dcvd = (a, b) => Math.min(d(a, b), ...['deut', 'prot'].map((k) => d(sim(a, k), sim(b, k))));
      const places = ['play', 'puzzle', 'factory'], min = (ks, f) => Math.min(...places.flatMap((a) => ks.map((k) => f(tok('--area-' + a), tok(k)))));
      out.apart = min(['--accent', '--gold', '--good', '--bad'], d);
      out.apartCvd = min(['--accent', '--gold'], dcvd);
      out.apartCvdGB = min(['--good', '--bad'], dcvd);
      // Earned pay in each place stands clear of the muted pay of one not yet earned.
      out.payGap = Math.min(...Object.keys(pays.got).filter((g) => pays.plain[g]).map((g) => d(pays.got[g], pays.plain[g])));
      out.payGapAt = Object.keys(pays.got).filter((g) => pays.plain[g]).map((g) => g + ':' + d(pays.got[g], pays.plain[g]).toFixed(3)).join(' ');
      return out;
    });
    const areas = ['play', 'classic', 'puzzle', 'factory', 'lull'], seen = {};
    for (const theme of ['dark', 'light']) for (const [w, hgt] of [[520, 760], [400, 700]]) {
      await page.setViewportSize({ width: w, height: hgt });
      await ev((t) => { const app = Lull.app; app.settings.theme = t; app.applySettings(); app.setTab('achievements'); app.achFilter = 'all'; app.achMenu = false; app.achOpen = { play: true, classic: true, puzzle: true, lull: true, factory: true }; Lull.UI.renderAchievements(app); document.getElementById('ach-body').scrollTop = 0; }, theme);
      await page.waitForTimeout(80);
      await shot('57-ach-areas-' + w + 'x' + hgt + '-' + theme);
      const r = await probe();
      const G = r.groups, R = r.rows, one = (a) => a.length === 1;
      const headers = new Set(areas.map((a) => G[a] && G[a].badge)).size === 5 && new Set(areas.map((a) => G[a].fill)).size === 5 && areas.every((a) => G[a].icon && G[a].badge !== 'rgba(0, 0, 0, 0)');
      const rows = areas.every((a) => one(R[a].area) && R[a].area[0] === G[a].area && one(R[a].plain) && one(R[a].got) && (R[a].bars.length <= 1) && (!R[a].bars.length || R[a].bars[0] === G[a].fill))
        && new Set(areas.map((a) => R[a].plain[0])).size === 5 && new Set(areas.map((a) => R[a].got[0])).size === 5 && R.factory.legend.length === 1 && R.factory.legend[0] !== R.play.got[0];
      check(w + '×' + hgt + ' ' + theme + ': each group and its rows carry their place\'s colour (header icon, bar, badges; one per place, five apart)', headers && rows, JSON.stringify({ G, R }));
      check(w + '×' + hgt + ' ' + theme + ': the colours on their tints (and earned pay) read at 4.5:1 or more', r.worst >= 4.5, r.worst.toFixed(2) + ' at ' + r.worstAt);
      check(w + '×' + hgt + ' ' + theme + ': headers and rows fit, no page scroll', r.fit && r.page, JSON.stringify({ over: r.over, page: r.page }));
      if (w === 520) {
        // Recent and its list: each one by its place's icon, in its colour.
        await page.click('.ach-recent-more');
        await page.waitForTimeout(150);
        const rec = await ev(() => {
          const A = Lull.Achievements, badge = (id) => getComputedStyle(document.querySelector('.ach-group[data-group="' + id + '"] summary .ach-area')).color;
          const ref = (n) => { const e = document.createElement('span'); e.innerHTML = Lull.Icons.icon(n); return e.innerHTML; };
          const one = (b) => { const a = A.LIST.find((x) => x.id === b.dataset.id) || A.LIST.find((x) => x.name === b.getAttribute('aria-label').replace(/^Latest: /, '')), i = b.querySelector('.ico.area-i');
            return a && i.innerHTML === ref(A.groupOf(a).icon) && getComputedStyle(i).color === badge(a.group) ? a.group : null; };
          const items = [...document.querySelectorAll('.ach-menu [role="menuitem"]')].map(one);
          return { latest: one(document.querySelector('.ach-recent-go')), items };
        });
        await page.keyboard.press('Escape');
        check(theme + ': Recent and its list show each one in its place\'s icon and colour', !!rec.latest && rec.items.length > 1 && rec.items.every(Boolean) && new Set(rec.items).size > 1, JSON.stringify(rec));
        check(theme + ': the place colours stand apart from the accent, gold, good and bad', r.apart >= 0.07, r.apart.toFixed(3));
        // The accent (focus, a jumped-to row) and the gold (legendary) sit beside them in the tab; good and bad don't.
        check(theme + ': ... and from the accent and gold for colour-blind eyes too (deutan, protan)', r.apartCvd >= 0.075, r.apartCvd.toFixed(3) + ' (good, bad: ' + r.apartCvdGB.toFixed(3) + ')');
        check(theme + ': earned pay in every place stands clear of pay not yet earned', r.payGap >= 0.05, r.payGapAt);
        seen[theme] = areas.map((a) => G[a].badge).join();
      }
    }
    check('the place colours change with the theme', seen.dark !== seen.light, JSON.stringify(seen));
    // Toasts: each in its place's colour and icon, a legendary one edged in gold.
    await page.setViewportSize({ width: 520, height: 760 });
    for (const theme of ['dark', 'light']) {
      const t = await ev((th) => {
        const app = Lull.app, A = Lull.Achievements;
        app.settings.theme = th; app.applySettings(); app.setTab('play');
        const out = {};
        for (const g of A.GROUPS) {
          document.getElementById('toasts').replaceChildren();
          const a = A.LIST.find((x) => x.group === g.id && x.tier !== 'legend');
          app.announce([a]);
          const el = document.querySelector('.toast'), i = el.querySelector('.ico');
          const ref = document.createElement('span'); ref.innerHTML = Lull.Icons.icon(g.icon);
          out[g.id] = { area: el.dataset.area, icon: i.innerHTML === ref.innerHTML, color: getComputedStyle(i).color, border: getComputedStyle(el).borderTopColor };
        }
        document.getElementById('toasts').replaceChildren();
        const leg = A.LIST.find((x) => x.group === 'puzzle' && x.tier === 'legend');
        app.announce([leg]);
        const el = document.querySelector('.toast');
        out.legend = { area: el.dataset.area, color: getComputedStyle(el.querySelector('.ico')).color, border: getComputedStyle(el).borderTopColor, gold: getComputedStyle(el.querySelector('.leg')).color, text: el.textContent };
        // Its gold word reads at 4.5:1 on the toast, and on the toast under the pointer.
        const rgb = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c) || /color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/.exec(c);
          const v = [+m[1], +m[2], +m[3]]; return c.startsWith('color(') ? v.map((x) => x * 255) : v; };
        const hexRgb = (h) => { const e = document.createElement('i'); e.style.color = h; document.body.append(e); const c = getComputedStyle(e).color; e.remove(); return rgb(c); };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const root = getComputedStyle(document.documentElement), word = rgb(out.legend.gold);
        out.legend.contrast = Math.min(ratio(word, rgb(getComputedStyle(el).backgroundColor)), ratio(word, hexRgb(root.getPropertyValue('--raised-2').trim())));
        return out;
      }, theme);
      await page.waitForTimeout(250);
      await shot('58-ach-toast-area-' + theme);
      const ids = ['play', 'classic', 'puzzle', 'factory', 'lull'];
      const ok = ids.every((id) => t[id].area === id && t[id].icon) && new Set(ids.map((id) => t[id].color)).size === 5 && new Set(ids.map((id) => t[id].border)).size === 5
        && t.legend.area === 'puzzle' && t.legend.color === t.puzzle.color && t.legend.border !== t.puzzle.border && /^Legendary: /.test(t.legend.text);
      check(theme + ': an achievement\'s toast carries its place\'s icon and colour; a legendary one is edged and named in gold', ok, JSON.stringify(t));
      check(theme + ': a legendary toast\'s gold word reads at 4.5:1 or more (and on hover)', t.legend.contrast >= 4.5, t.legend.contrast.toFixed(2));
    }
    await ev((t) => { Lull.app.settings.theme = t; Lull.app.applySettings(); document.getElementById('toasts').replaceChildren(); Lull.app.achOpen = {}; Lull.app.setTab('play'); }, theme0);
  }

  // ---- Settings ▸ Data ▸ Reset, and Import: the page starts over from exactly the save it was given --------------------
  console.log('reset and import');
  {
    const closeAll = () => ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    await closeAll();
    // Progress everywhere, a setting that must be kept, and changes still unsaved when Reset is pressed (the old page's
    // last save on its way out, and its boards and factory in memory, must not come back).
    await ev(() => {
      const app = Lull.app, st = app.store.state;
      st.lines = 4321; st.achievements.quad = Date.now(); st.achievements.pc = Date.now();
      st.settings.das = 199;
      st.factory.crateLevel = 2; st.factory.stats.collects = 9; st.factory.stats.minos = 5000;
      app.setTab('play');
      const g = app.modes.play.game;
      for (let x = 1; x < 10; x++) g.board.set(x, 0, 8);
      app.saveNow();
      st.lines = 5000; app.store.touch();
    });
    const before = await ev(() => ({ retired: Lull.app.store.state.boards.retired.length, cells: Lull.app.modes.play.game.board.count() }));
    await ev(() => Lull.UI.openSettings(Lull.app, 'data'));
    await page.click('.modal .btn.danger:has-text("Reset…")');
    await Promise.all([page.waitForEvent('load'), page.locator('.modal .btn.danger', { hasText: /^Reset$/ }).last().click()]);
    await page.waitForTimeout(600);
    await closeAll();
    const fresh = await ev(() => {
      const app = Lull.app, st = app.store.state, B = st.boards, f = st.factory;
      const stored = JSON.parse(localStorage.getItem('lull.save.v1'));
      return {
        lines: st.lines, ach: Object.keys(st.achievements).length, retired: B.retired.length, shelved: B.list.filter((b) => b.id !== B.cur).length,
        cells: app.modes.play.game.board.count(), collects: f.stats.collects, crateLevel: f.crateLevel, minos: f.stats.minos,
        das: st.settings.das, storedLines: stored.lines, storedDas: stored.settings.das, storedAch: Object.keys(stored.achievements).length,
      };
    });
    check('the test had progress to lose', before.cells > 0, JSON.stringify(before));
    check('Reset: lines 0, no achievements, no boards kept, the play board empty, the factory new', fresh.lines === 0 && fresh.ach === 0 && fresh.retired === 0 && fresh.shelved === 0
      && fresh.cells === 0 && fresh.collects === 0 && fresh.crateLevel === 0 && fresh.minos < 100, JSON.stringify(fresh));
    check('Reset keeps the settings, and the stored save is the fresh one', fresh.das === 199 && fresh.storedDas === 199 && fresh.storedLines === 0 && fresh.storedAch === 0, JSON.stringify(fresh));
    await ev(() => { Lull.app.store.state.lines = 50; Lull.app.saveNow(); });
    check('saving works again after the reset', await ev(() => JSON.parse(localStorage.getItem('lull.save.v1')).lines === 50));

    // Import: the pasted save, not the one in memory, is what comes back.
    const text = await ev(() => { const st = JSON.parse(Lull.app.store.serialize()); st.lines = 777; st.achievements = { quad: 1 }; return JSON.stringify(st); });
    await ev(() => { Lull.app.store.state.lines = 12; Lull.app.store.touch(); Lull.UI.openSettings(Lull.app, 'data'); });
    await page.click('.modal .btn:has-text("Import")');
    await page.fill('.modal textarea', text);
    await Promise.all([page.waitForEvent('load'), page.locator('.modal .btn.primary', { hasText: /^Import$/ }).last().click()]);
    await page.waitForTimeout(600);
    await closeAll();
    const imported = await ev(() => ({ lines: Lull.app.store.state.lines, ach: Object.keys(Lull.app.store.state.achievements).join(), stored: JSON.parse(localStorage.getItem('lull.save.v1')).lines }));
    check('Import: the pasted save comes back after the reload, and is the stored one', imported.lines === 777 && imported.stored === 777 && /quad/.test(imported.ach), JSON.stringify(imported));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));

  // ---- board sizes: the New board window, sizes at every extreme, pay by width, layout (scripts/sizes-test.cjs) --------
  await require('./sizes-test.cjs')({ browser, check, PAGE, OUT });
  // ---- the board recipe: the New board window's tabs and rules, labels, the controller, pixels as before (recipe-test.cjs)
  await require('./recipe-test.cjs')({ browser, check, PAGE, OUT });
  // ---- the Mirror modifier: made, drawn, the mouse and a touch on the copy's side, screenshots (mirror-test.cjs) --------
  await require('./mirror-test.cjs')({ browser, check, PAGE, OUT });
  // ---- Protect: made, played, wilted and undone, reloaded, retired; the window at 320 × 568; screenshots (protect-test.cjs)
  await require('./protect-test.cjs')({ browser, check, PAGE, OUT });
  // ---- touch: an emulated phone, played with gestures (scripts/touch-test.cjs) -----------------------------------------
  await require('./touch-test.cjs')({ browser, check, PAGE, OUT });
  // ---- what the device can do: a phone, a desktop browser, the app, a tablet with a trackpad (device-test.cjs) -------
  await require('./device-test.cjs')({ browser, check, PAGE, OUT });
  // ---- Undo is 5 everywhere; the Board full card's Undo; the result cards on the smallest phone (undo-test.cjs) --------
  await require('./undo-test.cjs')({ browser, check, PAGE, OUT });
  // ---- a retired board in full view: at play size, read-only, stepping, back exactly (retired-test.cjs) ----------------
  await require('./retired-test.cjs')({ browser, check, PAGE, OUT });
  // ---- Shapes: the chips, Custom and its picker, a board of picks, the trays and the fit on a phone (shapes-browser-test.cjs)
  await require('./shapes-browser-test.cjs')({ browser, check, PAGE, OUT });
  // ---- Physics: the window, live bodies, knocks, a clear, Rewind 5 s, the full card, a phone (physics-browser-test.cjs)
  await require('./physics-browser-test.cjs')({ browser, check, PAGE, OUT });
  // The Home Screen web app, served over http as it is deployed: offline, updates, full screen (web-browser-test.cjs).
  console.log('web app');
  await require('./web-browser-test.cjs')({ browser, check, OUT });
  await browser.close();
  console.log(failures ? failures + ' failed' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
