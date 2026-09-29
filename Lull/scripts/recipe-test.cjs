// The board recipe in the browser (js/recipe.js, the foundation of the board options): the New board window's tabs,
// panels and rules, its fit at every window size in its tallest states, the library's labels, the Board tile and Past
// boards, a board's recipe kept by Retire, Delete and New board, the controller (a timed one pauses when the window
// loses focus; a board with no hints shows none), power-ups refused by a recipe, the dealer behind Reroll and Order
// Slip, the view parts' seams, and the board drawn pixel for pixel as before the render split (frozen time).
// Run by browser-test.cjs: require('./recipe-test.cjs')({ browser, check, PAGE, OUT }).
// The pixels are held to scripts/recipe-pixels.json, recorded from the tree before the split:
//   node Lull/scripts/recipe-test.cjs --write-pixels <Game dir of that tree>
// (re-recorded, like golden.json, when a change that is meant to move pixels lands before this one).
'use strict';
const fs = require('fs');
const path = require('path');

const PIXELS = path.join(__dirname, 'recipe-pixels.json');
const VIEWPORTS = [
  { name: '520x760', viewport: { width: 520, height: 760 }, deviceScaleFactor: 2 },
  { name: '400x700', viewport: { width: 400, height: 700 }, deviceScaleFactor: 2 },
  { name: '390x844', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { name: '320x568', viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
];

/**
 * The board drawn at one fixed moment, as numbers: the same on the tree before the render split and after it (both have
 * BoardView.render(now), makeLook(…, t) and thumb()). Scenes: a stack with a gem, a piece and its ghost, hold; an
 * animated look (Prism, stars, the rainbow frame); a stack near the top (the red rim) with a laser; library thumbnails;
 * the New board preview at three sizes.
 */
const PIXEL_SCENES = (T) => {
  const hash = (str) => { let hsh = 0x811c9dc5; for (let i = 0; i < str.length; i++) { hsh ^= str.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; } return hsh.toString(16) + ':' + str.length; };
  const app = Lull.app, m = app.modes.play, CELL = Lull.CELL;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  app.store.state.settings.hints = false;
  if (app.hints) { app.hints.sync(); if (app.hints.hide) app.hints.hide(); }
  const out = {};
  const board = (eq, fill, special) => {
    m.setGame(new Lull.Game({ w: 10, h: 20, seed: 7, previewCount: m.settings.preview }));
    const g = m.game, cols = [1, 2, 3, 4, 5, 6, 7, 8];
    for (let y = 0; y < fill; y++) for (let x = 0; x < 10; x++) if ((x * 3 + y * 5) % 7 !== 2) g.board.set(x, y, cols[(x + y * 3) % 8] | (x === 4 && y === 2 ? CELL.GEM : 0));
    g.replacePiece({ id: 'T' });
    if (special) g.setSpecial(special);
    g.hold = { id: 'L', rot: 0 };
    const v = m.view;
    v.fx.clear(); v.fx.shake = 0; v.pointerCol = null; v.holdHover = false; v.hint = null;
    v.setLook(Lull.Render.makeLook(eq, app.theme, T, false));
    v.resize(); v.lay = null;
    v.render(T);
    return hash(v.canvas.toDataURL());
  };
  const eq = Object.assign({}, app.store.state.equipped);
  out.board = board(eq, 5);
  out.animated = board(Object.assign({}, eq, { palette: 'prism', backdrop: 'stars', frame: 'rainbow' }), 5);
  out.danger = board(eq, 15, 'laser');
  const g = m.game;
  m.thumbs.clear();
  out.thumb = hash(m.thumb('px1', g.board.cells, 10, 20).src);
  out.thumbSmall = hash(m.thumb('px2', g.board.cells.slice(0, 32), 4, 8).src);
  out.thumbBig = hash(m.thumb('px3', Array.from({ length: 800 }, (_, i) => (i % 7) + 1), 20, 40).src);
  const B = app.store.state.boards;
  for (const [w, h] of [[10, 20], [4, 8], [20, 40]]) {
    B.size = { w, h };
    m.openNewBoard();
    out['preview' + w + 'x' + h] = hash(document.querySelector('.modal-newboard .nb-preview').toDataURL());
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  }
  B.size = { w: 10, h: 20 };
  return out;
};

/** Every viewport, light and dark: the scenes' numbers from the page at gameDir. */
async function pixelsOf(browser, gameDir, query) {
  const out = {};
  for (const vp of VIEWPORTS) for (const theme of ['light', 'dark']) {
    const { name, ...o } = vp;
    const ctx = await browser.newContext(Object.assign({ colorScheme: theme }, o));
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(gameDir, 'index.html') + (query || ''));
    await page.waitForTimeout(400);
    await page.evaluate((theme) => { Lull.app.settings.theme = theme; Lull.app.applySettings(); }, theme);
    // The fonts the trays' labels use are in (the first frame may draw before them).
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(100);
    out[vp.name + '-' + theme] = await page.evaluate(PIXEL_SCENES, 123456);
    await ctx.close();
  }
  return out;
}

// ---- stand-in parts: what the feature branches will register, enough to exercise every seam ---------------------------

/** Registers stand-ins for the five parts (shapes, mirror, jelly, protect, battle), their UI and view halves. */
const STAND_INS = () => {
  const R = Lull.Recipe, UI = Lull.UI, h = UI.h;
  const PRESETS = { normal: '', tiny: 'Tiny', frantic: 'Frantic', pentominoes: 'Pentominoes', big: 'Big', custom: 'Custom' };
  const isObj = (v) => !!v && typeof v === 'object';
  R.part({
    key: 'shapes', order: 10, owns: ['shapes'], options: { 'shapes.preset': Object.keys(PRESETS) },
    normalize(raw, out) { const p = isObj(raw.shapes) && raw.shapes.preset; if (PRESETS[p] !== undefined) out.shapes = { preset: p }; },
    label: (r) => PRESETS[r.shapes.preset] || '',
    limits(r, lim) { if (r.shapes.preset === 'big') { lim.w[0] = Math.max(lim.w[0], 6); lim.h[0] = Math.max(lim.h[0], 12); } },
    conflicts(r, out) { if (r.mode === 'battle') { out['shapes.preset=big'] = 'Not in Battle'; out['shapes.preset=custom'] = 'Not in Battle'; } },
    rules(r, Rr) { if (r.shapes.preset === 'big') Rr.u = 2; else if (r.shapes.preset !== 'normal') { Rr.rated = false; Rr.E = 3; } },
    // A dealer of its own for Tiny: the three small pieces (Reroll and Order Slip read it).
    engine(game) {
      if (game.recipe.shapes.preset !== 'tiny') return null;
      const ids = ['I3', 'V3', 'D2'];
      return { dealer: { next: (g) => ids[g.rng.int(3)], reroll: (g, ex) => ids.filter((i) => i !== ex)[0], candidates: () => ids.slice() } };
    },
  });
  R.part({ key: 'mirror', order: 20, mod: 'mirror', owns: ['mods.mirror'], conflicts(r, out) { if (r.mode === 'battle') out['mods.mirror=true'] = 'Not in Battle'; }, rules(r, Rr) { if (r.mods.mirror) { Rr.copies = 2; Rr.refuse.flip = 'Not on a Mirror board'; } } });
  R.part({ key: 'jelly', order: 30, mod: 'jelly', owns: ['mods.jelly'], rules(r, Rr) { if (r.mods.jelly) { Rr.noFeats = true; Rr.refuse.tornado = 'Not on a Jelly board'; } }, engine: (game) => (game.recipe.mods.jelly ? { key: 'jelly' } : null) });
  const LV = { protect: ['easy', 'medium', 'hard'], battle: ['easy', 'steady', 'brisk', 'swift'] };
  R.part({
    key: 'protect', order: 40, mode: 'protect', owns: ['protect'], options: { 'protect.level': LV.protect },
    normalize(raw, out) { if (out.mode === 'protect') out.protect = { level: LV.protect.includes(raw.protect && raw.protect.level) ? raw.protect.level : 'easy' }; },
    label: (r) => (r.mode === 'protect' ? 'Protect ' + r.protect.level.charAt(0).toUpperCase() + r.protect.level.slice(1) : ''),
    limits(r, lim) { if (r.mode === 'protect') { lim.w[0] = Math.max(lim.w[0], 6); lim.h[0] = Math.max(lim.h[0], 12); } },
    rules(r, Rr) { if (r.mode === 'protect') for (const id of ['tornado', 'trapdoor', 'flip']) Rr.refuse[id] = 'Not in Protect'; },
  });
  R.part({
    key: 'battle', order: 50, mode: 'battle', owns: ['battle'], options: { 'battle.level': LV.battle },
    normalize(raw, out) { if (out.mode === 'battle') out.battle = { level: LV.battle.includes(raw.battle && raw.battle.level) ? raw.battle.level : 'steady' }; },
    label: (r) => (r.mode === 'battle' ? 'Battle' : ''),
    limits(r, lim) { if (r.mode === 'battle') { lim.w = [6, 12]; lim.h = [6, 12]; } },
    rules(r, Rr) { if (r.mode === 'battle') { Rr.undo = false; Rr.hints = false; Rr.timed = true; } },
    // A timed controller: it counts its pauses, and its seconds count only while it runs.
    controller(play, game) {
      if (game.recipe.mode !== 'battle') return null;
      return {
        key: 'battle', timed: true, running: false, paused: [],
        frame(now, dt, running) { this.running = running; },
        pause(why) { this.paused.push(why); this.running = false; window.__battlePaused = this.paused; },
        counts() { return this.running; },
        tiles: () => [['3–2', 'Rounds']],
      };
    },
  });
  R.uiPart({
    key: 'shapes', order: 10, tab: 'shapes',
    chips: [{ value: 'tiny', name: 'Tiny', piece: 'V3' }, { value: 'frantic', name: 'Frantic', piece: 'S' }, { value: 'pentominoes', name: 'Pentominoes', piece: 'P' }, { value: 'big', name: 'Big', piece: 'O' }, { value: 'custom', name: 'Custom', piece: 'I3' }],
    panel: (r) => (r.shapes.preset === 'custom' ? h('div', { class: 'nb-custom' }, h('span', null, '4 and 5 blocks · Even'), h('button', { type: 'button', class: 'btn sm' }, 'Edit')) : null),
  });
  R.uiPart({ key: 'mirror', order: 20, mod: 'mirror', name: 'Mirror' });
  R.uiPart({ key: 'jelly', order: 30, mod: 'jelly', name: 'Jelly' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  R.uiPart({ key: 'protect', order: 40, mode: 'protect', name: 'Protect', levels: () => ({ path: 'protect.level', values: LV.protect.map((v) => [v, cap(v)]) }) });
  R.uiPart({
    key: 'battle', order: 50, mode: 'battle', name: 'Battle', levels: () => ({ path: 'battle.level', values: LV.battle.map((v) => [v, cap(v)]) }),
    stepper: (r, k) => (r.mode === 'battle' && k === 'h' ? { label: 'Rows' } : null),
    presets: (r) => (r.mode === 'battle' ? [['Quick', 8, 8], ['Standard', 10, 10], ['Long', 10, 12]] : null),
  });
  // A view part for Jelly: counts what it is asked to draw (every hook), and draws the preview's mark.
  window.__vp = { cells: 0, over: [], preview: 0, lock: 0, move: 0, turn: 0 };
  R.viewPart({
    key: 'jelly', order: 30, claims: 'rest', dangerRim: false,
    cell(ctx, v, x, y, s, kind) { window.__vp.cells++; window.__vp[kind] = (window.__vp[kind] || 0) + 1; return false; },
    overStack() { window.__vp.over.push('stack'); }, overPiece() { window.__vp.over.push('piece'); }, overRim() { window.__vp.over.push('rim'); },
    onLock() { window.__vp.lock++; }, onMove() { window.__vp.move++; }, onRotate() { window.__vp.turn++; },
    // A line down the middle, as Mirror's will be (a pixel probe finds it).
    preview(ctx, geom, recipe, theme) { if (recipe && recipe.mods && recipe.mods.jelly) { window.__vp.preview++; ctx.globalAlpha = 0.5; ctx.fillStyle = theme.accent; ctx.fillRect(geom.x + Math.floor(geom.w / 2) * geom.c - 1, geom.y, 2, geom.h * geom.c); } },
  });
  UI.statRow('protect', { sub: 'free', at: 'end', render: () => h('h4', { class: 'stand-in-row' }, 'Protect') });
};

module.exports = async function recipeTests({ browser, check, PAGE, OUT }) {
  console.log('board recipe');
  const errors = [];
  const shotDir = OUT || null;
  const open = async (o, query) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: 'light' }, o));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE + (query || ''));
    await page.waitForTimeout(400);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev((theme) => {
      Lull.app.settings.theme = theme; Lull.app.applySettings();
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, (o && o.colorScheme) || 'light');
    const shot = async (name) => { if (shotDir) await page.screenshot({ path: path.join(shotDir, name + '.png') }); };
    return { ctx, page, ev, shot };
  };

  // ---- the board as it was: frozen-time pixels against the tree before the render split ------------------------------
  if (fs.existsSync(PIXELS)) {
    const want = JSON.parse(fs.readFileSync(PIXELS, 'utf8'));
    const got = await pixelsOf(browser, path.dirname(PAGE.replace(/^file:\/\//, '')));
    for (const k of Object.keys(want)) {
      const diff = Object.keys(want[k]).filter((s) => want[k][s] !== (got[k] || {})[s]);
      check('pixels ' + k + ': the board, an animated look, the red rim, thumbnails and the New board preview are drawn as before (0 differ)', diff.length === 0, diff.join(', '));
    }
  } else check('recipe-pixels.json is there', false, 'record it: node Lull/scripts/recipe-test.cjs --write-pixels <Game dir>');

  // ?freeze=1: two frames of an animated look far apart in time are the same frame.
  {
    const F = await open({}, '?freeze=1');
    const same = await F.ev(() => {
      const m = Lull.app.modes.play, v = m.view, app = Lull.app;
      v.setLook(Lull.Render.makeLook(Object.assign({}, app.store.state.equipped, { palette: 'prism', backdrop: 'stars', frame: 'rainbow' }), app.theme, 0, false));
      v.fx.shake = 5;
      v.render(1000); const a = v.canvas.toDataURL();
      v.fx.shake = 5;
      v.render(987654); const b = v.canvas.toDataURL();
      return { frozen: Lull.Render.FREEZE != null, same: a === b };
    });
    check('?freeze=1 pins the time a frame is drawn at (Prism, stars, a shake: two frames far apart are one)', same.frozen && same.same, JSON.stringify(same));
    const moving = await F.page.evaluate(() => Lull.Render.clock(5) === Lull.Render.FREEZE);
    check('Render.clock gives the frozen moment', moving);
    await F.ctx.close();
  }

  // ---- the New board window: tabs, panels, rules --------------------------------------------------------------------
  const D = await open();
  let { page, ev, shot } = D;
  await ev(STAND_INS);
  const openNB = async () => { await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.openLibrary(); }); await page.click('.modal-lib .lib-new'); await page.waitForTimeout(250); };
  await openNB();
  const tabs = await ev(() => {
    const list = document.querySelector('.modal-newboard [role="tablist"]'), t = [...list.querySelectorAll('[role="tab"]')];
    return { n: t.length, names: t.map((b) => b.querySelector('.nm').textContent), vals: t.map((b) => (b.querySelector('.vl') || { textContent: '' }).textContent), sel: t.map((b) => b.getAttribute('aria-selected')), tabIndex: t.map((b) => b.tabIndex), panel: document.querySelector('.modal-newboard [role="tabpanel"]').getAttribute('aria-labelledby'), focus: document.activeElement.getAttribute('aria-label') };
  });
  check('New board: a tablist of Size, Shapes, Modifiers and Mode; Size selected (roving tabindex), its panel labelled by it; focus on Width', tabs.n === 4 && tabs.names.join() === 'Size,Shapes,Modifiers,Mode' && tabs.sel.join() === 'true,false,false,false' && tabs.tabIndex.join() === '0,-1,-1,-1' && tabs.panel === 'nb-tab-size' && tabs.focus === 'Width', JSON.stringify(tabs));
  check('the tabs\' values: Size none (it is on the steppers), Shapes Normal, Modifiers Off, Mode Plain', tabs.vals.join() === ',Normal,Off,Plain', tabs.vals.join());
  await page.focus('.nb-tab[data-tab="size"]');
  await page.keyboard.press('ArrowRight');
  const arrow = await ev(() => ({ sel: document.querySelector('.nb-tab[aria-selected="true"]').dataset.tab, focus: document.activeElement.dataset.tab, panel: document.querySelector('.nb-panel').dataset.tab }));
  await page.keyboard.press('End');
  const end = await ev(() => document.querySelector('.nb-tab[aria-selected="true"]').dataset.tab);
  await page.keyboard.press('ArrowRight');
  const wrap = await ev(() => document.querySelector('.nb-tab[aria-selected="true"]').dataset.tab);
  check('arrow keys move along the tabs (and wrap), End goes to the last', arrow.sel === 'shapes' && arrow.focus === 'shapes' && arrow.panel === 'shapes' && end === 'mode' && wrap === 'size', JSON.stringify({ arrow, end, wrap }));
  const n0 = await ev(() => Lull.app.store.state.boards.list.length);
  await page.focus('.nb-tab[data-tab="mods"]');
  await page.keyboard.press('Enter');
  const enter = await ev(() => ({ open: !!document.querySelector('.modal-newboard'), sel: document.querySelector('.nb-tab[aria-selected="true"]').dataset.tab, n: Lull.app.store.state.boards.list.length }));
  check('Enter on a tab selects it and does not Create', enter.open && enter.sel === 'mods' && enter.n === n0, JSON.stringify(enter));
  // Heights: one height whichever tab is open.
  const heights = await ev(() => ['size', 'shapes', 'mods', 'mode'].map((k) => { document.querySelector('.nb-tab[data-tab="' + k + '"]').click(); return Math.round(document.querySelector('.modal-newboard').getBoundingClientRect().height); }));
  check('the window is one height on every tab', new Set(heights).size === 1, heights.join());

  // The last choice wins; a ruled-out option says why; sizes follow the recipe and come back.
  await ev(() => { document.querySelector('.nb-tab[data-tab="mods"]').click(); document.querySelector('.nb-switch[data-path="mods.mirror"]').click(); });
  const mirrorOn = await ev(() => ({ on: document.querySelector('.nb-switch[data-path="mods.mirror"]').getAttribute('aria-checked'), val: document.querySelector('.nb-tab[data-tab="mods"] .vl').textContent, live: document.querySelector('.nb-live').textContent }));
  await ev(() => { document.querySelector('.nb-tab[data-tab="mode"]').click(); document.querySelector('.nb-mode[data-value="battle"]').click(); });
  const battle = await ev(() => ({ r: Lull.Recipe.key(Lull.app.modes.play.lastNB.nb.recipe), live: document.querySelector('.nb-live').textContent, mods: document.querySelector('.nb-tab[data-tab="mods"] .vl').textContent, lvl: [...document.querySelectorAll('.nb-lvl button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(), rows: document.querySelectorAll('.nb-label')[1].textContent, rowsAria: document.querySelector('.nb-val[data-k="h"]').getAttribute('aria-label'), size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x') }));
  check('the last choice wins: Mirror on, then Battle turns Mirror off and says so', mirrorOn.on === 'true' && mirrorOn.val === 'Mirror' && /Mirror on/.test(mirrorOn.live) && /"mirror":false/.test(battle.r) && /"mode":"battle"/.test(battle.r) && battle.live === 'Battle, Mirror off, 10 × 12' && battle.mods === 'Off', JSON.stringify({ mirrorOn, battle }));
  check('Battle: its level row (Steady first), the Height stepper named Rows, the size clamped to its range', battle.lvl === 'Easy,Steady*,Brisk,Swift' && battle.rows === 'Rows' && battle.rowsAria === 'Rows' && battle.size === '10x12', JSON.stringify(battle));
  await ev(() => { document.querySelector('.nb-tab[data-tab="mods"]').click(); document.querySelector('.nb-switch[data-path="mods.mirror"]').click(); });
  const why = await ev(() => ({ why: document.querySelector('.nb-why').textContent, dis: document.querySelector('.nb-switch[data-path="mods.mirror"]').getAttribute('aria-disabled'), on: document.querySelector('.nb-switch[data-path="mods.mirror"]').getAttribute('aria-checked'), r: Lull.app.modes.play.lastNB.nb.recipe.mods.mirror }));
  check('in Battle, Mirror is off (aria-disabled) and a press on it shows why in one muted line, changing nothing', why.why === 'Not in Battle' && why.dis === 'true' && why.on === 'false' && why.r === false, JSON.stringify(why));
  await shot('recipe-01-520x760-mods-why-light');
  await ev(() => { document.querySelector('.nb-tab[data-tab="mode"]').click(); document.querySelector('.nb-mode[data-value="plain"]').click(); });
  const back = await ev(() => ({ mirror: Lull.app.modes.play.lastNB.nb.recipe.mods.mirror, live: document.querySelector('.nb-live').textContent, size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x'), rows: document.querySelectorAll('.nb-label')[1].textContent }));
  check('back to Plain: Mirror comes back (asked for before), the size asked for comes back, Height is Height again', back.mirror === true && /Mirror on/.test(back.live) && back.size === '10x20' && back.rows === 'Height', JSON.stringify(back));
  // Big at 4 × 8 raises the size, and it comes back with Normal.
  await ev(() => { document.querySelector('.nb-tab[data-tab="size"]').click(); });
  await page.focus('.modal-newboard .nb-val[data-k="w"]'); await page.keyboard.press('Home');
  await page.focus('.modal-newboard .nb-val[data-k="h"]'); await page.keyboard.press('Home');
  await ev(() => { document.querySelector('.nb-tab[data-tab="shapes"]').click(); document.querySelector('.nb-chip[data-value="big"]').click(); });
  const big = await ev(() => ({ size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x'), live: document.querySelector('.nb-live').textContent, val: document.querySelector('.nb-tab[data-tab="shapes"] .vl').textContent, min: document.querySelector('.nb-step[aria-label="Fewer columns"]').getAttribute('aria-disabled') }));
  await ev(() => document.querySelector('.nb-chip[data-value="normal"]').click());
  const normal = await ev(() => [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x'));
  check('Big at 4 × 8 shows 6 × 12 (its smallest, − off there) and says so; Normal again brings back 4 × 8', big.size === '6x12' && big.live === 'Big, 6 × 12' && big.val === 'Big' && big.min === 'true' && normal === '4x8', JSON.stringify({ big, normal }));
  // Presets below the recipe's smallest size are off, with the reason.
  await ev(() => { document.querySelector('.nb-chip[data-value="big"]').click(); document.querySelector('.nb-tab[data-tab="size"]').click(); });
  const presetOff = await ev(() => { const b = document.querySelector('.nb-preset[data-w="16"]'); const small = document.querySelector('.nb-preset[data-w="6"]'); return { wide: b.getAttribute('aria-disabled'), small: small.getAttribute('aria-disabled') }; });
  check('the presets follow the limits (Small 6 × 12 fits Big)', presetOff.wide === null && presetOff.small === null, JSON.stringify(presetOff));
  // Create: the board is made of the recipe, and remembered.
  await ev(() => { document.querySelector('.nb-tab[data-tab="mods"]').click(); document.querySelector('.nb-switch[data-path="mods.jelly"]').click(); });
  await page.click('.modal-newboard footer .btn.primary');
  await page.waitForTimeout(150);
  const made = await ev(() => { const g = Lull.app.modes.play.game, B = Lull.app.store.state.boards; return { r: Lull.Recipe.label(g.recipe), size: g.w + 'x' + g.h, saved: Lull.Recipe.label(B.recipe), bsize: B.size.w + 'x' + B.size.h, json: Lull.Recipe.label(g.toJSON().recipe), lib: !!document.querySelector('.modal-lib') }; });
  check('Create makes a board of the recipe and size chosen, and remembers both (boards.recipe, boards.size)', made.r === 'Big · Jelly, Mirror' && made.size === '6x12' && made.saved === made.r && made.bsize === '6x12' && made.json === made.r, JSON.stringify(made));
  // The library row: the size, then the label; the full label is its tip.
  const row = await ev(() => { const r = document.querySelector('.modal-lib .lib-row.current .sz'); return { text: r.textContent, title: r.title }; });
  check('the library row reads "6 × 12 · Big · Jelly, Mirror"', row.text === '6 × 12 · Big · Jelly, Mirror' && row.title === 'Big · Jelly, Mirror', JSON.stringify(row));
  // A view part's preview draws over the New board preview and the library's thumbnails (Render.previewBoard).
  const probe = await ev(() => {
    const img = document.querySelector('.modal-lib .lib-row.current .lib-thumb'), c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, a = Lull.Render.rgb(Lull.app.theme.accent);
    let hits = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - a[0]) + Math.abs(d[i + 1] - a[1]) + Math.abs(d[i + 2] - a[2]) < 90 && d[i + 3] > 0) hits++;
    return { calls: window.__vp.preview, hits };
  });
  check('a view part draws over the preview and the thumbnails (a pixel probe finds its line)', probe.calls >= 2 && probe.hits > 4, JSON.stringify(probe));
  // The New board window opens on what was chosen last.
  await page.click('.modal-lib .lib-new'); await page.waitForTimeout(200);
  const reopen = await ev(() => ({ vals: [...document.querySelectorAll('.nb-tab .vl')].map((v) => v.textContent).join(), size: [...document.querySelectorAll('.nb-val')].map((v) => +v.textContent).join('x') }));
  check('New board opens on the recipe and size last chosen', reopen.vals === 'Big,Both,Plain' && reopen.size === '6x12', JSON.stringify(reopen));
  await page.click('.modal-newboard footer .btn:not(.primary)');
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });

  // ---- a board of a recipe: untouched, Retire, Delete, the view parts, items, dealer ------------------------------------
  const untouched = await ev(() => {
    const m = Lull.app.modes.play, R = Lull.Recipe, id0 = Lull.app.store.state.boards.cur;
    const same = m.shelveAndNew(null, m.game.recipe);
    const other = m.shelveAndNew(null, R.normalize({ mods: { jelly: true } }));
    return { same, other, label: R.label(m.game.recipe), size: m.game.w + 'x' + m.game.h, sameRecord: Lull.app.store.state.boards.cur === id0 };
  });
  check('an untouched board: the same recipe is not made again; another recipe rebuilds it, in its own record', untouched.same === false && untouched.other === true && untouched.label === 'Jelly' && untouched.sameRecord, JSON.stringify(untouched));
  const inherit = await ev(() => {
    const m = Lull.app.modes.play, R = Lull.Recipe, st = Lull.app.store.state;
    m.game.drop(); m.game.drop();
    const before = R.key(m.game.recipe);
    m.newBoard('manual');
    const afterRetire = R.key(m.game.recipe);
    const log = st.stats.free.boardLog[0], ret = st.boards.retired[0];
    m.game.drop();
    m.deleteBoard(st.boards.cur);
    const afterDelete = R.key(m.game.recipe);
    return { same: before === afterRetire && before === afterDelete, log: log.recipe && R.label(log.recipe), ret: ret.recipe && R.label(ret.recipe), size: m.game.w + 'x' + m.game.h };
  });
  check('Retire and Delete: the board that takes its place has the same recipe; the retired record and the log keep it (thin)', inherit.same && inherit.log === 'Jelly' && inherit.ret === 'Jelly', JSON.stringify(inherit));
  // The view part draws what it claims: the stack's own cells, the piece, the ghost and the trays go to it; its overlays
  // and animation triggers run; the danger rim is off; the preview is drawn over.
  const vp = await ev(() => {
    const m = Lull.app.modes.play, v = m.view, g = m.game;
    for (let x = 1; x < g.w; x++) g.board.set(x, 0, 3);
    g.hold = { id: 'T', rot: 0 };
    window.__vp = Object.assign(window.__vp, { cells: 0, over: [], stack: 0, piece: 0, ghost: 0, tray: 0, lock: 0, move: 0, turn: 0 });
    v.dirty = true; v.render(performance.now());
    const drew = Object.assign({}, window.__vp, { over: window.__vp.over.join(), w: g.w });
    const turns = [m.action('left'), m.action('cw'), m.action('ccw')];
    m.action('drop');
    window.__turns = turns;
    return { drew, parts: v.parts.map((p) => p.key), moved: window.__vp.move, turned: window.__vp.turn, locked: window.__vp.lock, turns: window.__turns };
  });
  check('a view part on the board: it is asked for the stack, piece, ghost and tray cells, and draws over the stack, piece and rim', vp.parts.join() === 'jelly' && vp.drew.stack === vp.drew.w - 1 && vp.drew.piece === 4 && vp.drew.ghost === 4 && vp.drew.tray >= 8 && vp.drew.over === 'stack,piece,rim', JSON.stringify(vp));
  check('a view part hears moves, turns and locks', vp.moved >= 1 && vp.turned >= 1 && vp.locked >= 1, JSON.stringify(vp));
  // Items refused by the recipe: in their place, off, the reason as the tip; a press spends nothing and says why.
  await ev(() => { const m = Lull.app.modes.play; Lull.app.store.state.inventory.tornado = 2; m.openTray('board'); });
  const refused = await ev(() => { const b = document.querySelector('.item-btn[data-item="tornado"]'); return { dis: b.getAttribute('aria-disabled'), tip: b.dataset.tip, cls: b.className, other: document.querySelector('.item-btn[data-item="settle"]').getAttribute('aria-disabled') }; });
  await page.click('.item-btn[data-item="tornado"]', { force: true });
  await page.waitForTimeout(150);
  const spent = await ev(() => ({ n: Lull.app.store.state.inventory.tornado, toast: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join('|'), used: (Lull.app.modes.play.game.s.items || {}).tornado || 0 }));
  check('Jelly refuses Tornado: aria-disabled, its reason as the tip; others are on', refused.dis === 'true' && refused.tip === 'Not on a Jelly board' && /refused/.test(refused.cls) && refused.other === null, JSON.stringify(refused));
  check('a refused power-up spends nothing and says why', spent.n === 2 && spent.used === 0 && /Not on a Jelly board/.test(spent.toast), JSON.stringify(spent));
  await shot('recipe-02-520x760-refused-light');
  await ev(() => Lull.app.modes.play.openTray(null));
  // Reroll and Order Slip ask the board's dealer.
  const dealer = await ev(() => new Promise((done) => {
    const m = Lull.app.modes.play, R = Lull.Recipe, st = Lull.app.store.state;
    m.setGame(new Lull.Game({ w: 10, h: 20, recipe: R.normalize({ shapes: { preset: 'tiny' } }), seed: 3, previewCount: 5 }));
    const g = m.game, ids = g.queue.map((e) => e.id);
    st.inventory.reroll = 1; st.inventory.order = 1;
    const was = g.piece.type.id;
    m.useItem('reroll');
    const rerolled = g.piece.type.id;
    m.disarm();
    m.useItem('order');
    setTimeout(() => {
      const picks = [...document.querySelectorAll('.modal .picker button')].map((b) => b.dataset.id);
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      m.setGame(new Lull.Game({ w: 10, h: 20, recipe: R.DEFAULT, seed: 3, previewCount: 5 }));
      st.inventory.order = 1;
      m.useItem('order');
      setTimeout(() => {
        const plain = [...document.querySelectorAll('.modal .picker button')].map((b) => b.dataset.id);
        while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
        done({ ids: [...new Set(ids)].sort().join(), was, rerolled, picks: picks.join(), plain: plain.join() });
      }, 50);
    }, 50);
  }));
  check('a board\'s dealer deals its pieces, Reroll asks it for another, Order Slip lists its candidates', dealer.ids.split(',').every((i) => ['I3', 'V3', 'D2'].includes(i)) && dealer.rerolled !== dealer.was && ['I3', 'V3', 'D2'].includes(dealer.rerolled) && dealer.picks === 'I3,V3,D2', JSON.stringify(dealer));
  check('Order Slip on a board of the seven: the seven and the small three, as before', dealer.plain === 'I,O,T,S,Z,J,L,I3,V3,D2', dealer.plain);
  // The Board full card: a Board tile with the label, and the controller's own tiles.
  await ev(() => {
    const m = Lull.app.modes.play, R = Lull.Recipe;
    m.setGame(new Lull.Game({ w: 10, h: 20, recipe: R.normalize({ shapes: { preset: 'frantic' }, mods: { jelly: true }, mode: 'protect', protect: { level: 'easy' } }), seed: 4, previewCount: 5 }));
    const g = m.game;
    for (let i = 0; i < 12; i++) g.drop();
    g.over = true; m.onTopout();
  });
  await ev(() => document.getElementById('toasts').replaceChildren());
  const card = await ev(() => { const t = document.querySelector('.card.topout .board-tile'); return t ? { v: t.querySelector('.v').textContent, l: t.querySelector('.l').textContent, title: t.title } : null; });
  check('the Board full card has a Board tile: "Frantic · Jelly · Protect Easy"', card && card.v === 'Frantic · Jelly · Protect Easy' && card.l === 'Board', JSON.stringify(card));
  await shot('recipe-03-520x760-board-full-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await ev(() => { Lull.app.settings.theme = 'dark'; Lull.app.applySettings(); });
  await shot('recipe-03-520x760-board-full-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await ev(() => { Lull.app.settings.theme = 'light'; Lull.app.applySettings(); Lull.app.modes.play.newBoard('full'); });
  // Stats ▸ Free Play: a part's rows (UI.statRow) and Past boards with the label under the size.
  await ev(() => { Lull.app.statsSub = 'free'; Lull.app.setTab('stats'); });
  await page.waitForTimeout(150);
  const stats = await ev(() => ({ row: !!document.querySelector('#stats-body .stand-in-row'), labels: [...document.querySelectorAll('#stats-body .past-lbl')].map((e) => e.textContent) }));
  check('Stats: a part\'s row (UI.statRow); Past boards show a board\'s recipe under its size', stats.row && stats.labels.includes('Frantic · Jelly · Protect Easy') && stats.labels.includes('Jelly'), JSON.stringify(stats));
  const pastEl = await page.$('#stats-body table.st.cols');
  if (shotDir && pastEl) { await pastEl.scrollIntoViewIfNeeded(); await shot('recipe-04-520x760-past-boards-light'); }
  await ev(() => Lull.app.setTab('play'));

  // ---- the controller: a timed board pauses when the window loses focus; its seconds count only while it runs -------
  const timed = await ev(() => {
    const m = Lull.app.modes.play, R = Lull.Recipe;
    m.setGame(new Lull.Game({ w: 10, h: 10, recipe: R.normalize({ mode: 'battle' }), seed: 4, previewCount: 5 }));
    window.__battlePaused = [];
    window.dispatchEvent(new Event('blur'));
    const blur = (window.__battlePaused || []).slice();
    Lull.app.setTab('stats'); Lull.app.setTab('play');
    const tab = (window.__battlePaused || []).slice();
    const ms0 = m.game.s.playMs;
    m.ctl.running = false; Lull.app.activity(); Lull.app.second();
    const ms1 = m.game.s.playMs;
    m.ctl.running = true; Lull.app.second();
    return { blur, tab, counted: [ms1 - ms0, m.game.s.playMs - ms1], timed: m.ctl.timed, hints: m.game.rules.hints, history: m.game.maxHistory, base: typeof m.ctl.base.onLock };
  });
  check('a blur pauses a timed controller (app.onAway), and leaving the tab does too', timed.timed && timed.blur.join() === 'blur' && timed.tab.join() === 'blur,tab', JSON.stringify(timed));
  // second() counts only with focus: done in the page directly (Playwright pages report focus).
  check('its seconds count on the board only while it runs (ctl.counts)', timed.counted[0] === 0 && (timed.counted[1] === 1000 || timed.counted[1] === 0), JSON.stringify(timed.counted));
  check('a Battle board has no Undo history and the controller reaches the plain one as base', timed.history === 0 && timed.base === 'function' && timed.hints === false, JSON.stringify(timed));
  const noHints = await ev(() => new Promise((done) => {
    const app = Lull.app, c = app.hints;
    app.store.state.settings.hints = true; c.sync();
    let asked = 0;
    const orig = c.frame;
    c.frame = function () { asked++; return orig.apply(this, arguments); };
    setTimeout(() => { c.frame = orig; app.store.state.settings.hints = false; c.sync(); done({ asked, pill: !!document.querySelector('.lhint') }); }, 300);
  }));
  check('a board whose rules have no hints never asks the control hints', noHints.asked === 0 && !noHints.pill, JSON.stringify(noHints));
  const canRun = await ev(() => { const m = Lull.app.modes.play; const a = m.canRun(); Lull.app.modes.play.openLibrary(); const b = m.canRun(); while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); return { a, b, focus: document.hasFocus() }; });
  check('canRun: not under a window (and only with focus)', canRun.b === false && canRun.a === canRun.focus, JSON.stringify(canRun));
  await ev(() => { const m = Lull.app.modes.play; m.setGame(new Lull.Game({ w: 10, h: 20, recipe: Lull.Recipe.DEFAULT, previewCount: 5 })); });
  await D.ctx.close();

  // ---- the window at every size, in its tallest states; screenshots of every tab ------------------------------------
  for (const vp of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      const { name, ...o } = vp;
      const P = await open(Object.assign({ colorScheme: theme }, o));
      await P.ev(STAND_INS);
      const touch = !!vp.hasTouch;
      await P.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.modes.play.openNewBoard(); });
      await P.page.waitForTimeout(400);
      const states = {
        size: () => document.querySelector('.nb-tab[data-tab="size"]').click(),
        shapes: () => { document.querySelector('.nb-tab[data-tab="shapes"]').click(); document.querySelector('.nb-chip[data-value="custom"]').click(); document.querySelector('.nb-tab[data-tab="mode"]').click(); document.querySelector('.nb-mode[data-value="battle"]').click(); document.querySelector('.nb-mode[data-value="plain"]').click(); document.querySelector('.nb-tab[data-tab="shapes"]').click(); document.querySelector('.modal-newboard .nb-why').textContent = 'Not in Battle'; },
        mods: () => { document.querySelector('.nb-tab[data-tab="mods"]').click(); document.querySelector('.nb-switch[data-path="mods.jelly"]').click(); },
        mode: () => { document.querySelector('.nb-tab[data-tab="mode"]').click(); document.querySelector('.nb-mode[data-value="battle"]').click(); document.querySelector('.nb-tab[data-tab="mods"]').click(); document.querySelector('.nb-switch[data-path="mods.mirror"]').click(); document.querySelector('.nb-tab[data-tab="mode"]').click(); document.querySelector('.modal-newboard .nb-why').textContent = 'Not in Battle'; },
      };
      const hs = [];
      for (const [k, fn] of Object.entries(states)) {
        await P.page.evaluate(fn);
        await P.page.waitForTimeout(60);
        const f = await P.ev((touch) => {
          const m = document.querySelector('.modal-newboard'), r = m.getBoundingClientRect(), foot = m.querySelector('footer').getBoundingClientRect(), body = m.querySelector('.body'), panel = m.querySelector('.nb-panel');
          // Targets: 44 px by touch (every control); with a mouse, the tabs and the options (the steppers and the footer keep their desktop size).
          const small = [...m.querySelectorAll('.nb-tab, .nb-chip, .nb-switch' + (touch ? ', .nb-mode, .nb-level, .nb-preset, footer .btn, .nb-step' : ''))].map((b) => { const q = b.getBoundingClientRect(); return [b.className.split(' ')[0] + (b.dataset.value || b.dataset.tab || ''), Math.round(Math.min(q.width, q.height))]; }).filter(([, s]) => s < 43.5);
          return {
            inside: r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth, footer: foot.bottom <= innerHeight + 0.5 && foot.top >= 0,
            noScroll: body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1, panelFits: panel.scrollHeight <= panel.clientHeight + 1,
            h: Math.round(r.height), small, why: m.querySelector('.nb-why').textContent, lvl: !!m.querySelector('.nb-lvl'), custom: !!m.querySelector('.nb-custom'),
            ellipsis: [...m.querySelectorAll('.nb-tab .nm')].filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent),
          };
        }, touch);
        hs.push(f.h);
        const tallest = k === 'shapes' ? f.custom && !!f.why : k === 'mode' ? f.lvl && !!f.why : true;
        check(vp.name + ' ' + theme + ' New board, ' + k + (k === 'shapes' ? ' (Custom, a reason shown)' : k === 'mode' ? ' (Battle, its levels, a reason shown)' : '') + ': fits, footer shown, nothing scrolls, targets 44 px' + (touch ? ' (touch)' : ''),
          tallest && f.inside && f.footer && f.noScroll && f.panelFits && f.small.length === 0 && f.ellipsis.length === 0, JSON.stringify(f));
        if (vp.name === '320x568' || vp.name === '520x760') await P.shot('recipe-nb-' + vp.name + '-' + k + '-' + theme);
      }
      check(vp.name + ' ' + theme + ' New board: one height across the tabs', new Set(hs).size === 1, hs.join());
      await P.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
      // Labelled library rows (and one plain), at 320.
      if (vp.name === '320x568') {
        await P.ev(() => {
          const m = Lull.app.modes.play, R = Lull.Recipe, st = Lull.app.store.state;
          const mk = (r, w, h) => { m.game.drop(); st.boards.recipe = R.normalize(r); m.shelveAndNew({ w, h }, st.boards.recipe); m.game.drop(); };
          mk({ shapes: { preset: 'frantic' }, mods: { jelly: true }, mode: 'protect', protect: { level: 'easy' } }, 12, 24);
          mk({ shapes: { preset: 'big' }, mods: { mirror: true } }, 6, 12);
          mk({}, 10, 20);
          m.openLibrary();
        });
        await P.page.waitForTimeout(300);
        const rows = await P.ev(() => [...document.querySelectorAll('.modal-lib .lib-row .sz')].map((e) => ({ t: e.textContent, own: e.getBoundingClientRect().width > e.parentElement.getBoundingClientRect().width * 0.8 || !e.parentElement.classList.contains('labelled'), fits: e.scrollWidth <= e.clientWidth + 0.5 || !!e.title, title: e.title })));
        check('320 ' + theme + ': library rows show the recipe after the size, on a line of their own, with ellipsis and the full label as the tip', rows.some((r) => /Frantic · Jelly · Protect Easy/.test(r.title)) && rows.some((r) => /^6 × 12 · Big · Mirror/.test(r.t)) && rows.every((r) => r.own && r.fits), JSON.stringify(rows));
        await P.shot('recipe-lib-320x568-' + theme);
        await P.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
      }
      await P.ctx.close();
    }
  }
  check('board recipe: no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};

module.exports.pixelsOf = pixelsOf;

if (require.main === module) {
  // node recipe-test.cjs --write-pixels <Game dir>: records the pixels from that tree (the one before the split).
  (async () => {
    const i = process.argv.indexOf('--write-pixels');
    if (i < 0 || !process.argv[i + 1]) { console.error('usage: node recipe-test.cjs --write-pixels <Game dir>'); process.exit(2); }
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); }
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const out = await pixelsOf(browser, path.resolve(process.argv[i + 1]));
    await browser.close();
    fs.writeFileSync(PIXELS, JSON.stringify(out, null, 1) + '\n');
    console.log('recorded ' + Object.keys(out).length + ' viewports to ' + PIXELS);
  })().catch((e) => { console.error(e); process.exit(1); });
}
