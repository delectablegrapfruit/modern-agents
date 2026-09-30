// The Mirror modifier in the browser (js/mirror.js, js/mirrorview.js): made in the New board window (its switch, the
// line on the preview), the board it makes (the controller, Mirror World refused, the library label and thumbnail), the
// line and the copy as pixels, the mouse aiming the copy from its side, a touch on the copy's side moving the copy, and
// the screenshots: 10 × 20 and 11 × 20 in both themes, an L meeting its reflection, and the smallest phone.
// Run by browser-test.cjs: require('./mirror-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * In the page: a Mirror board w × h in play, a stack drawn from rows of letters (the left half, bottom row first; each
 * letter a piece's colour, '.' open) mirrored onto the right (an odd width's centre column from `centre`), and the piece
 * in play where asked ([id, x, y, rot]).
 */
const SCENE = ([w, h, rows, centre, show]) => {
  const app = Lull.app, m = app.modes.play, R = Lull.Recipe, P = Lull.Pieces;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  m.setGame(new Lull.Game({ w, h, seed: 5, recipe: R.normalize({ mods: { mirror: true } }), previewCount: m.settings.preview }));
  const g = m.game, col = (c) => (c === '.' ? 0 : P.TYPES[c].color);
  (rows || []).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) { g.board.set(x, y, col(row[x])); g.board.set(w - 1 - x, y, col(row[x])); }
    if (w % 2 && centre) g.board.set((w - 1) / 2, y, col(centre[y] || '.'));
  });
  if (show) {
    const [id, x, y, rot] = show, type = P.get(id);
    g.piece = { type, rot, x, y, special: null, entry: { id, rot: 0 }, lastRot: false };
  }
  g.hold = { id: 'S', rot: 0 };
  m.view.pointerCol = null; m.view.fx.clear();
  m.renderStatus(); m.renderItems();
  m.view.dirty = true; m.view.render(performance.now());
  return { w: g.w, h: g.h };
};

module.exports = async function mirrorTests({ browser, check, PAGE, OUT }) {
  console.log('mirror');
  const errors = [];
  const open = async (o, theme) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: theme || 'light' }, o || {}));
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
      for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, theme || 'light');
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, ev, shot };
  };
  // A symmetric stack for the screenshots: the left half, bottom row first (the right half is its reflection).
  const STACK = ['IIII.', 'JLLL.', 'JJJL.', 'OO.S.', 'OOSS.', '.TS..', 'TTT..'];
  const CENTRE = 'TTT';

  // ---- the New board window: the switch, the line on the preview; Create -------------------------------------------
  const D = await open();
  let { page, ev } = D;
  await ev(() => { Lull.app.store.state.boards.size = { w: 10, h: 20 }; Lull.app.modes.play.openLibrary(); });
  await page.click('.modal-lib .lib-new');
  await page.waitForTimeout(200);
  /** How far the preview's middle boundary is from the one two columns left (a pixel probe: the line is extra there). */
  const previewLine = () => ev(() => {
    const cv = document.querySelector('.modal-newboard .nb-preview'), x = cv.getContext('2d'), w = +document.querySelector('.nb-val[data-k="w"]').textContent;
    const d = x.getImageData(0, 0, cv.width, cv.height).data, c = cv.width / w;
    const col = (px) => { let r = 0, g = 0, b = 0, n = 0; for (let y = Math.round(cv.height * 0.3); y < cv.height * 0.7; y++) { const i = (y * cv.width + Math.round(px)) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n]; };
    const a = col((w / 2) * c), b = col((w / 2 - 2) * c);
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  });
  const offLine = await previewLine();
  await ev(() => { document.querySelector('.nb-tab[data-tab="mods"]').click(); document.querySelector('.nb-switch[data-path="mods.mirror"]').click(); });
  const sw = await ev(() => ({ on: document.querySelector('.nb-switch[data-path="mods.mirror"]').getAttribute('aria-checked'), name: document.querySelector('.nb-switch[data-path="mods.mirror"] .nm').textContent, val: document.querySelector('.nb-tab[data-tab="mods"] .vl').textContent, live: document.querySelector('.nb-live').textContent }));
  const onLine = await previewLine();
  check('New board: the Mirror switch turns on, the Modifiers tab says Mirror, the live region says so', sw.on === 'true' && sw.name === 'Mirror' && sw.val === 'Mirror' && /Mirror on/.test(sw.live), JSON.stringify(sw));
  check('the New board preview draws the line down the middle once Mirror is on (a pixel probe)', onLine > 25 && offLine < 6, JSON.stringify({ offLine, onLine }));
  await page.click('.modal-newboard footer .btn.primary');
  await page.waitForTimeout(200);
  const made = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, row = document.querySelector('.modal-lib .lib-row.current .sz');
    return { mirror: g.recipe.mods.mirror, size: g.w + 'x' + g.h, ctl: m.ctl.id, row: row && row.textContent, flip: (() => { m.openTray('board'); const b = document.querySelector('.item-btn[data-item="flip"]'); return b && [b.getAttribute('aria-disabled'), b.dataset.tip]; })(),
      turnabout: (() => { m.openTray('shape'); const b = document.querySelector('.item-btn[data-item="mirror"]'); const t = b && [b.querySelector('.il').textContent, b.getAttribute('aria-disabled')]; m.openTray(null); return t; })() };
  });
  check('Create makes a Mirror board (its controller in play), its library row reads "10 × 20 · Mirror"', made.mirror === true && made.size === '10x20' && made.ctl === 'mirror' && made.row === '10 × 20 · Mirror', JSON.stringify(made));
  check('Mirror World is off on a Mirror board, its reason as the tip; the power-up that flips a piece is Turnabout', made.flip && made.flip[0] === 'true' && made.flip[1] === 'Not on a Mirror board' && made.turnabout && made.turnabout[0] === 'Turnabout' && made.turnabout[1] === null, JSON.stringify(made));
  // The library's thumbnail carries the line too.
  const thumb = await ev(() => {
    const img = document.querySelector('.modal-lib .lib-row.current .lib-thumb'), c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, a = Lull.Render.rgb(Lull.app.theme.accent), mid = Math.round(c.width / 2);
    let hits = 0;
    for (let y = 0; y < c.height; y++) for (let dx = -2; dx <= 2; dx++) { const i = (y * c.width + mid + dx) * 4; if (Math.abs(d[i] - a[0]) + Math.abs(d[i + 1] - a[1]) + Math.abs(d[i + 2] - a[2]) < 150) hits++; }
    return hits;
  });
  check('the library thumbnail of a Mirror board shows the line', thumb > 8, String(thumb));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });

  // ---- the line and the copy as pixels -------------------------------------------------------------------------------
  const probe = (w) => ev((w) => {
    const m = Lull.app.modes.play, v = m.view, g = m.game, dpr = v.dpr;
    g.board.cells.fill(0);
    g.piece = { type: Lull.Pieces.TYPES.O, rot: 0, x: 0, y: 10, special: null, entry: { id: 'O', rot: 0 }, lastRot: false };
    v.pointerCol = null; v.dirty = true; v.render(performance.now());
    const s = v.lay.s;
    const d = v.ctx.getImageData(0, 0, v.canvas.width, v.canvas.height).data;
    const at = (px, py) => { const i = (Math.round(py * dpr) * v.canvas.width + Math.round(px * dpr)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    // A column boundary (between column c − 1 and c), averaged over the rows 2 to 8 (no piece there).
    const edge = (c) => { let sum = [0, 0, 0]; for (let y = 2; y <= 8; y++) { const [sx, sy] = v.toScreen(c, y); const p = at(sx, sy + s / 2); sum = sum.map((t, k) => t + p[k]); } return sum.map((t) => t / 7); };
    const centre = (x, y) => { const [sx, sy] = v.toScreen(x, y); return at(sx + s / 2, sy + s / 2); };
    const mid = w % 2 ? (w - 1) / 2 : w / 2;
    return {
      line: dist(edge(mid), edge(mid - 2)),
      own: centre(1, 10), copy: centre(w - 2, 10), empty: centre(4, 10),
      ownVsEmpty: dist(centre(1, 10), centre(3, 10)), copyVsEmpty: dist(centre(w - 2, 10), centre(3, 10)), ownVsCopy: dist(centre(1, 10), centre(w - 2, 10)),
    };
  }, w);
  const p10 = await probe(10);
  check('the line down the middle is drawn (a pixel probe at the middle boundary)', p10.line > 12, JSON.stringify(p10));
  check('the copy is drawn, fainter than the piece you steer (0.8)', p10.copyVsEmpty > 60 && p10.ownVsCopy > 4 && p10.ownVsCopy < p10.copyVsEmpty, JSON.stringify(p10));
  await ev(SCENE, [11, 20, [], '', null]);
  const p11 = await probe(11);
  check('11 wide: the centre column is tinted (a pixel probe)', p11.line > 3, JSON.stringify(p11));
  // A plain board has no line.
  const plain = await ev(() => { const m = Lull.app.modes.play; m.setGame(new Lull.Game({ w: 10, h: 20, seed: 5, recipe: {}, previewCount: m.settings.preview })); return true; });
  const p0 = plain && await probe(10);
  check('a plain board draws no line and no copy', p0.line < 4 && p0.copyVsEmpty < 8, JSON.stringify(p0));

  // ---- the mouse: on the copy's side of the line it aims the copy -----------------------------------------------------
  await ev(SCENE, [10, 20, [], '', ['T', 1, 16, 0]]);
  await page.waitForTimeout(350);
  const cellPt = (x, y) => ev(([cx, cy]) => { const v = Lull.app.modes.play.view; const [sx, sy] = v.toScreen(cx, cy); const r = v.canvas.getBoundingClientRect(); return [r.left + sx + v.lay.s / 2, r.top + sy + v.lay.s / 2]; }, [x, y]);
  const mids = () => ev(() => { const g = Lull.app.modes.play.game, p = g.piece, c = p.type.rots[p.rot]; const own = p.x + Math.round(c.reduce((a, [x]) => a + x, 0) / c.length - 0.01); return { own, copy: g.w - 1 - own }; });
  let pt = await cellPt(2, 10);
  await page.mouse.move(pt[0] + 3, pt[1]); await page.mouse.move(pt[0], pt[1]);
  const left = await mids();
  pt = await cellPt(7, 10);
  await page.mouse.move(pt[0] - 3, pt[1]); await page.mouse.move(pt[0], pt[1]);
  const right = await mids();
  pt = await cellPt(6, 10);
  await page.mouse.move(pt[0] + 3, pt[1]); await page.mouse.move(pt[0], pt[1]);
  const right2 = await mids();
  check('the mouse on the piece’s side steers the piece; on the copy’s side the copy lands under the pointer', left.own === 2 && right.copy === 7 && right.own === 2 && right2.copy === 6, JSON.stringify({ left, right, right2 }));
  const pcs = await ev(() => Lull.app.modes.play.game.s.pieces);
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(100);
  const dropped = await ev(() => { const g = Lull.app.modes.play.game; return { pieces: g.s.pieces, col6: [0, 1].some((y) => g.board.get(6, y)) }; });
  check('a click there drops the pair with the copy under the pointer', dropped.pieces === pcs + 1 && dropped.col6, JSON.stringify(dropped));

  // ---- the screenshots at 520 × 760, both themes ---------------------------------------------------------------------
  for (const theme of ['light', 'dark']) {
    const S = theme === 'light' ? D : await open({}, 'dark');
    await S.ev(() => { const v = Lull.app.modes.play.view; v.pointerCol = null; });
    await S.page.mouse.move(2, 2);
    await S.ev(SCENE, [10, 20, STACK, '', ['T', 1, 14, 0]]);
    await S.page.waitForTimeout(150);
    await S.shot('mirror-10x20-' + theme);
    await S.ev(SCENE, [11, 20, STACK, CENTRE, ['J', 1, 13, 1]]);
    await S.page.waitForTimeout(150);
    await S.shot('mirror-11x20-' + theme);
    if (theme === 'light') {
      // An L meeting its reflection: across the line, overlapping where they meet (a hat of six cells).
      await S.ev(SCENE, [10, 20, STACK, '', ['L', 3, 12, 0]]);
      const meet = await S.ev(() => { const g = Lull.app.modes.play.game; return { cells: g.absCells().length, fits: g.fitsAt(g.piece, g.piece.rot, g.piece.x, g.piece.y) }; });
      check('an L across the line meets its reflection: six cells, and it fits', meet.cells === 6 && meet.fits, JSON.stringify(meet));
      await S.page.waitForTimeout(150);
      await S.shot('mirror-L-meets-light');
    } else await S.ctx.close();
  }
  await D.ctx.close();

  // ---- the phone: a touch on the copy's side moves the copy; 320 × 568 -----------------------------------------------
  for (const [W, H] of [[390, 844], [320, 568]]) {
    const T = await open({ viewport: { width: W, height: H }, deviceScaleFactor: W === 320 ? 2 : 3, hasTouch: true, isMobile: true }, 'light');
    const cdp = await T.ctx.newCDPSession(T.page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) });
    const drag = async (x, y, dx) => {
      const n = Math.max(2, Math.ceil(Math.abs(dx) / 6));
      await touch('touchStart', [[x, y]]);
      for (let i = 1; i <= n; i++) { await sleep(17); await touch('touchMove', [[x + (dx * i) / n, y]]); }
      await sleep(8); await touch('touchEnd', []);
    };
    await T.ev(SCENE, [10, 20, [], '', ['O', 2, 14, 0]]);
    await T.page.waitForTimeout(200);
    const G = await T.ev(() => { const v = Lull.app.modes.play.view, r = v.canvas.getBoundingClientRect(), b = v.lay.board; return { x: r.left + b.x, y: r.top + b.y, s: v.lay.s, step: Lull.Touch.stepFor(v.lay.s, Lull.app.settings.touchSens) }; });
    const px = () => T.ev(() => Lull.app.modes.play.game.piece.x);
    const x0 = await px();
    // On the copy's side (column 7), drag right two steps: the copy goes right, the piece left.
    await drag(G.x + 7.5 * G.s, G.y + 6.5 * G.s, 2 * G.step + G.step * 0.4);
    await T.page.waitForTimeout(150);
    const x1 = await px();
    // On the piece's side (column 1), drag right one step: the piece goes right.
    await drag(G.x + 1.5 * G.s, G.y + 6.5 * G.s, G.step + G.step * 0.4);
    await T.page.waitForTimeout(150);
    const x2 = await px();
    if (W === 390) check('touch: a drag that starts on the copy’s side moves the copy with the finger (the piece the other way); on the piece’s side, the piece', x0 === 2 && x1 === 0 && x2 === 1, JSON.stringify({ x0, x1, x2, G }));
    if (W === 320) {
      await T.ev(SCENE, [10, 20, STACK, '', ['T', 1, 14, 0]]);
      await T.page.waitForTimeout(150);
      const fit = await T.ev(() => { const d = document.documentElement; return { sw: d.scrollWidth, cw: d.clientWidth, sh: d.scrollHeight, ch: d.clientHeight }; });
      check('320 × 568: a Mirror board fits the smallest phone (no page scroll)', fit.sw <= fit.cw && fit.sh <= fit.ch + 1, JSON.stringify(fit));
      await T.shot('mirror-320x568-light');
    }
    await T.ctx.close();
  }

  check('mirror: no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};
