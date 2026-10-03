// Mural in the browser (js/mural.js, js/muralview.js): made in the New board window (Mode ▸ Mural; a picture and a
// level; the size set by the level; the preview shows the picture; Physics, Mirror and other shapes off), the board it
// makes (Placed and Level in the status bar, the progress under the board), the place outlined, a drop or a set out of
// place declined with no sound, shake or note, a set in place paid, every block drawn as its four quarters (turned with
// the piece in play and in Next), the Finished card (Look, Space), a reload mid-mural, the library (Finished, the
// thumbnail in the picture's colours, the full view), a photo chosen through the file picker, cropped and previewed in
// its own window and made a mural, Stats and the achievements, the phones (both themes: everything fits, quarters at
// least 5 px, 44 px targets), and frames of the three pictures at levels 1, 3 and 5.
// Run by browser-test.cjs: require('./mural-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');
const zlib = require('zlib');

/** A PNG (rgb) of w × h from fn(x, y) -> [r, g, b]. */
function png(w, h, fn) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y), o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  const T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = T[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** The test photo: a harbour at noon, 300 × 220 (wider than any board, so it is cropped). */
const PHOTO = png(300, 220, (x, y) => {
  if ((x - 210) ** 2 + (y - 60) ** 2 < 28 * 28) return [250, 214, 90];
  if (y < 120) return [110 + y / 3, 170 + y / 4, 235];
  if (x > 40 && x < 120 && y > 95 && y < 140 && y > 95 + Math.abs(x - 80) * 0.5) return [196, 70, 52];
  if (y < 175) return [36, 92, 140 + ((x + y) % 23 < 3 ? 40 : 0)];
  return [214, 190, 150];
});

/** In the page: a Mural board (pic, level, seed; set and w × h when given) with `placed` pieces set (a negative count: all but that many). */
const SCENE = (o) => {
  const app = Lull.app, m = app.modes.play, R = Lull.Recipe;
  while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
  m.hideCard();
  const r = R.normalize({ mode: 'mural', mural: { pic: o.pic || 'coast', level: o.level || 3 }, shapes: { preset: o.set || 'normal' } }), z = o.w ? { w: o.w, h: o.h } : R.clampSize({}, r);
  m.setGame(new Lull.Game({ w: z.w, h: z.h, seed: o.seed || 3, recipe: r, previewCount: m.settings.preview }));
  const g = m.game, X = Lull.Mural.extOf(g);
  const n = o.placed === 'all' ? X.plan().pieces.length : o.placed < 0 ? X.plan().pieces.length + o.placed : o.placed || 0;
  for (let i = 0; i < n && !g.over; i++) { const q = X.current(g).goals[0], p = g.piece; p.rot = q.rot; p.x = q.x; p.y = q.y; g.lock(); }
  if (g.over) m.onTopout(true);
  m.view.pointerCol = null; m.view.fx.clear(); m.view.muralNudge = 0;
  m.renderStatus(); m.renderItems();
  m.view.dirty = true; m.view.render(performance.now());
  return { w: g.w, h: g.h, n: X.plan().pieces.length };
};

module.exports = async function muralTests({ browser, check, PAGE, OUT }) {
  console.log('mural');
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
      for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, theme || 'light');
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const shot = async (name) => { if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png') }); };
    return { ctx, page, ev, shot };
  };
  const card = (ev) => ev(() => { const m = Lull.app.modes.play, ov = m.overlay; return { open: m.cardOpen, title: (ov.querySelector('h2') || {}).textContent, sub: (ov.querySelector('.cl-sub') || {}).textContent || null, btns: [...ov.querySelectorAll('.btn')].map((b) => b.textContent.trim()) }; });
  const status = (ev) => ev(() => [...document.querySelectorAll('#play-status .stat')].map((s) => s.textContent.trim()));

  // ---- the New board window: Mode ▸ Mural ▸ Still life ▸ Level 3; its size; the preview; Create ------------------------------
  const D = await open();
  let { page, ev } = D;
  await ev(() => { const B = Lull.app.store.state.boards; B.size = { w: 10, h: 20 }; B.recipe = Lull.Recipe.normalize({ mods: { mirror: true } }); Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
  await ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
  const modes = await ev(() => [...document.querySelectorAll('.nb-mode')].map((b) => b.textContent.trim()));
  await ev(() => document.querySelector('.nb-mode[data-value="mural"]').click());
  await ev(() => document.querySelector('.mu-pic[data-value="still"]').click());
  await ev(() => document.querySelector('.mu-lv .nb-level[data-value="3"]').click());
  await page.waitForTimeout(80);
  const win = await ev(() => {
    const cv = document.querySelector('.modal-newboard .nb-preview'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let blue = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > d[i] + 40 && d[i + 3] > 200) blue++;
    const panel = document.querySelector('.nb-panel');
    return {
      pics: [...document.querySelectorAll('.mu-pic')].map((b) => b.textContent.trim()), pressed: [...document.querySelectorAll('.mu-pic[aria-pressed="true"]')].map((b) => b.dataset.value),
      levels: [...document.querySelectorAll('.mu-lv .nb-level')].map((b) => b.textContent), level: (document.querySelector('.mu-lv .nb-level[aria-pressed="true"]') || {}).textContent,
      w: document.querySelector('.nb-val[data-k="w"]').textContent, h: document.querySelector('.nb-val[data-k="h"]').textContent,
      tab: document.querySelector('.nb-tab[data-tab="mode"] .vl').textContent, live: document.querySelector('.nb-live').textContent, blue, scrolls: panel.scrollHeight > panel.clientHeight + 1,
      mods: document.querySelector('.nb-tab[data-tab="mods"] .vl').textContent,
    };
  });
  check('the Mode tab has Mural; Mural ▸ Still life ▸ Level 3: four pictures, levels 1–5, 12 × 18 (the level\'s), the preview shows the picture (its blue bowl and window), Mirror turned off', modes.includes('Mural') && win.pics.join() === 'Coast,Still life,Abstract,Photo' && win.pressed.join() === 'still' && win.levels.join() === '1,2,3,4,5' && win.level === '3' && win.w === '12' && win.h === '18' && win.tab === 'Mural' && /Level 3/.test(win.live) && win.blue > 200 && !win.scrolls && win.mods === 'Off', JSON.stringify({ modes, win }));
  await D.shot('mural-newboard-520x760');
  const off = await ev(() => {
    document.querySelector('.nb-tab[data-tab="mods"]').click();
    const sw = [...document.querySelectorAll('.nb-switch')].map((b) => [b.dataset.path, b.getAttribute('aria-disabled'), b.dataset.tip]);
    document.querySelector('.nb-tab[data-tab="shapes"]').click();
    const chips = Object.fromEntries([...document.querySelectorAll('.nb-chip')].map((b) => [b.dataset.value, b.getAttribute('aria-disabled') === 'true']));
    document.querySelector('.nb-tab[data-tab="size"]').click();
    const presets = [...document.querySelectorAll('.nb-preset')].map((b) => b.textContent);
    document.querySelector('.nb-tab[data-tab="mode"]').click();
    return { sw, chips, presets };
  });
  check('Physics and Mirror are off ("Not in Mural"); the piece sets Mixed, Normal, Frantic and Pentominoes are on offer (Tiny, Big and Custom not shown); Size offers the level\'s size first, then larger ones up to 20 × 36',
    off.sw.every((s) => s[1] === 'true' && s[2] === 'Not in Mural') && ['mixed', 'normal', 'frantic', 'pentominoes'].every((v) => off.chips[v] === false) && ['tiny', 'big', 'custom'].every((v) => !(v in off.chips)) && off.presets[0] === 'Level 312 × 18' && off.presets[off.presets.length - 1] === 'Largest20 × 36', JSON.stringify(off));
  await ev(() => { [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Create').click(); });
  await page.waitForTimeout(200);
  const made = await ev(() => { const m = Lull.app.modes.play, g = m.game; return { label: Lull.Recipe.label(g.recipe), w: g.w, h: g.h - Lull.Mural.BUF, ext: g.ext.map((e) => e.key).join(), parts: m.view.parts.map((p) => p.key).join(), card: m.cardOpen, bar: document.querySelector('#itembar').classList.contains('mu-bar') && !!document.querySelector('#itembar .mu-prog'), next: (g.queue || []).length, fixed: g.fixed }; });
  const st0 = await status(ev);
  check('Create: a Mural board (12 × 18, Still life, Level 3) in play at once; Placed and Level in the status bar; the progress under the board; Next counts down', made.label === 'Mural · Still life · Level 3' && made.w === 12 && made.h === 18 && made.ext === 'mural' && made.parts === 'mural' && !made.card && made.bar && made.fixed && made.next > 40 && /^Placed\s*0 of \d+$/.test(st0[0]) && /^Level\s*3$/.test(st0[1]), JSON.stringify({ made, st0 }));

  // ---- out of place: a drop and a set declined (no sound, no shake, no note); in place: set and paid ------------------------
  await ev(SCENE, { pic: 'still', level: 3, seed: 3, placed: 5 });
  const refused = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g), pc = X.current(g), p = g.piece;
    // Somewhere it does not belong: across from its place (or turned).
    let tries = 0;
    while (pc.goals.some((q) => q.rot === p.rot && q.x === p.x) && tries++ < 4) m.action(p.x > 0 ? 'moveL' : 'moveR');
    const sounds = []; const play0 = m.app.sound.play; m.app.sound.play = (n) => { sounds.push(n); return play0.call(m.app.sound, n); };
    const before = { x: p.x, y: p.y, rot: p.rot, i: X.M.i, lines: m.app.store.state.lines };
    const r1 = m.action('drop');
    while (g.fitsAt(p, p.rot, p.x, p.y - 1)) g.lower();
    const r2 = m.action('lower');
    m.app.sound.play = play0;
    return { r1, r2, same: g.piece === p && X.M.i === before.i && p.x === before.x, shake: m.view.fx.shake, nudge: !!m.view.muralNudge, sounds, toast: !!document.querySelector('.toast.bad'), lines: m.app.store.state.lines === before.lines };
  });
  check('out of place, Space and Down do nothing: no set, no pay, no sound, no shake, no note; its place brightens', !refused.r1 && !refused.r2 && refused.same && refused.shake === 0 && refused.nudge && !refused.sounds.includes('blocked') && !refused.toast && refused.lines, JSON.stringify(refused));
  await ev(SCENE, { pic: 'still', level: 3, seed: 3, placed: 5 });
  await page.waitForTimeout(60);
  await D.shot('mural-play-outline-520x760');
  const keyed = await ev(() => {
    // As a player would: turn, step across, Space.
    const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g), pc = X.current(g), p = g.piece, q = pc.goals[0];
    const lines0 = m.app.store.state.lines, i0 = X.M.i, rot0 = p.rot;
    for (let k = 0; k < 4 && p.rot !== q.rot; k++) m.action('cw');
    for (let k = 0; k < 20 && p.x !== q.x; k++) m.action(p.x > q.x ? 'moveL' : 'moveR');
    const ready = X.exact(g, p.rot, p.x, g.ghostY(p));
    m.action('drop');
    return { rot0, rt: q.rot, all: pc.goals.length, ready, i: X.M.i - i0, paid: Math.round((m.app.store.state.lines - lines0) * 100) / 100, want: Math.floor(pc.cells.length * Lull.Mural.PAY_CELL * 100 + 1e-6) / 100, placed: [...document.querySelectorAll('#play-status .stat')][0].textContent };
  });
  check('in place (turned and stepped there by keys), Space sets it and pays a little (0.04 a block); it appeared in another turn', keyed.ready && keyed.i === 1 && keyed.paid === keyed.want && (keyed.rot0 !== keyed.rt || keyed.all === 4) && /6 of/.test(keyed.placed), JSON.stringify(keyed));

  // ---- the quarters: each block its picture's four colours, on the board and in play (turned) ---------------------------------
  const quarters = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, v = m.view, X = Lull.Mural.extOf(g), P = X.plan(), pic = P.pic;
    v.fx.clear(); v.dirty = true; v.render(performance.now());
    const cv = v.canvas, dpr = cv.width / v.cssW, ctx = cv.getContext('2d'), s = v.lay.s;
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40;
    const at = (sx, sy) => Array.from(ctx.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data).slice(0, 3);
    let ok = 0, bad = 0;
    const cellOk = (x, y, q) => {
      const [sx, sy] = v.toScreen(x, y);
      [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].forEach(([fx, fy], k) => { if (near(at(sx + s * fx, sy + s * fy), rgb(pic.pal[q[k]]))) ok++; else bad++; });
    };
    for (let y = 0; y < 2; y++) for (let x = 0; x < g.w; x++) if (g.board.get(x, y)) cellOk(x, y, Lull.Mural.quartersAt(pic, pic.QH / 2, x, y));
    const stack = { ok, bad }; ok = 0; bad = 0;
    const p = g.piece, pc = X.current(g);
    g.absCells(p).forEach(([x, y], i) => cellOk(x, y, Lull.Mural.cellQ(pc, p.rot, i)));
    return { stack, piece: { ok, bad }, s, q: s / 2 };
  });
  check('every block is drawn as its four quarters in the picture\'s colours: the stack, and the piece in play turned as it is', quarters.stack.bad <= 2 && quarters.stack.ok > 60 && quarters.piece.bad === 0 && quarters.piece.ok >= 4, JSON.stringify(quarters));

  // ---- Finished: the card (Boards, Look, New board), Look, Space; Stats and the achievements --------------------------------------
  await ev(() => { const s = Lull.app.store.state; s.stats.free.mural = null; for (const k of Object.keys(s.achievements || {})) if (/^mu_/.test(k)) delete s.achievements[k]; });
  await ev(SCENE, { pic: 'still', level: 3, seed: 3, placed: 5 });
  await ev(() => {
    const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g);
    while (!g.over) { const q = X.current(g).goals[0], p = g.piece; p.rot = q.rot; p.x = q.x; p.y = g.h - 1 - p.type.rotBounds[q.rot].maxY; m.action('drop'); }
  });
  await page.waitForTimeout(150);
  const fin = { card: await card(ev), st: await status(ev), stats: await ev(() => Lull.app.store.state.stats.free.mural), ach: await ev(() => Object.keys(Lull.app.store.state.achievements || {}).filter((k) => /^mu_/.test(k)).sort()) };
  check('the last piece set: the Finished card (Still life · Level 3; Boards, Look, New board); Stats and the achievements (First Mural, Panel)', fin.card.open && fin.card.title === 'Finished' && fin.card.sub === 'Still life · Level 3' && fin.card.btns.join() === 'Boards,Look,New board Space' && fin.stats.finished === 1 && fin.stats.levels[3] === 1 && fin.ach.join() === 'mu_first,mu_l3' && /^Placed\s*(\d+) of \1$/.test(fin.st[0]), JSON.stringify(fin));
  await D.shot('mural-finished-card-520x760');
  await ev(() => document.querySelector('#mu-look').click());
  await page.waitForTimeout(80);
  const look = await card(ev);
  await D.shot('mural-finished-look-520x760');
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  const back = await card(ev);
  check('Look hides the card (the whole picture shows); Space brings it back', !look.open && back.open && back.title === 'Finished', JSON.stringify({ look, back }));

  // ---- the library: New board keeps it as Finished, its thumbnail in the picture's colours; its full view draws the picture -----
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  const lib = await ev(() => {
    const m = Lull.app.modes.play, B = Lull.app.store.state.boards, e = B.retired[0];
    const nb = !!document.querySelector('.modal-newboard');
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    return { nb, reason: e && e.reason, recipe: e && e.recipe && e.recipe.mode, fresh: m.game.s.pieces === 0 && Lull.Mural.on(m.game.recipe), id: e && e.id };
  });
  await ev(() => Lull.app.modes.play.openLibrary());
  await page.waitForTimeout(150);
  await ev(() => { const t = [...document.querySelectorAll('.modal-lib .lib-tabs button')].find((b) => b.dataset.k === 'retired'); if (t) t.click(); });
  await page.waitForTimeout(200);
  const row = await ev((id) => {
    const r = document.querySelector('.lib-row.retired[data-id="' + id + '"]');
    if (!r) return null;
    const img = r.querySelector('.lib-thumb');
    return { tags: [...r.querySelectorAll('.tag')].map((t) => t.textContent), src: img && img.src.length };
  }, lib.id);
  const thumbPx = await ev((id) => new Promise((res) => {
    const img = document.querySelector('.lib-row.retired[data-id="' + id + '"] .lib-thumb');
    if (!img) { res(null); return; }
    const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let blue = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 2] > d[k] + 50) blue++; res(blue); }; i.src = img.src;
  }), lib.id);
  await D.shot('mural-library-520x760');
  check('New board on the card: the mural kept in the library (Finished), the New board window opened; its thumbnail in the picture\'s colours', lib.nb && lib.reason === 'finished' && lib.recipe === 'mural' && lib.fresh && row && row.tags.includes('Finished') && thumbPx > 40, JSON.stringify({ lib, row, thumbPx }));
  const full = await ev((id) => {
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    const m = Lull.app.modes.play;
    m.openRetiredView(id);
    const fv = m.fullView;
    return { open: !!fv, parts: fv && fv.view.parts.map((p) => p.key).join() };
  }, lib.id);
  await page.waitForTimeout(200);
  await D.shot('mural-fullview-520x760');
  check('its full view draws the picture (the Mural painter)', full.open && full.parts === 'mural', JSON.stringify(full));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });

  // ---- a reload mid-mural: the same piece in play, the same count -------------------------------------------------------------
  await ev(SCENE, { pic: 'coast', level: 2, seed: 8, placed: 21 });
  const pre = await ev(() => { const g = Lull.app.modes.play.game; Lull.app.saveNow(); return { i: Lull.Mural.of(g).i, id: g.piece.type.id, rot: g.piece.rot, x: g.piece.x }; });
  await page.reload();
  await page.waitForTimeout(500);
  const post = await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.setTab('play'); const g = Lull.app.modes.play.game; return { i: Lull.Mural.of(g).i, id: g.piece.type.id, rot: g.piece.rot, x: g.piece.x, label: Lull.Recipe.label(g.recipe) }; });
  check('a reload mid-mural: the same mural, piece and count', post.i === pre.i && post.id === pre.id && post.rot === pre.rot && post.x === pre.x && post.label === 'Mural · Coast · Level 2', JSON.stringify({ pre, post }));

  // ---- a photo: the file picker, the Photo window (crop, Zoom, the preview in the level's colours), Use photo, Create ---------------
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const B = Lull.app.store.state.boards; B.recipe = Lull.Recipe.normalize({ mode: 'mural', mural: { pic: 'coast', level: 4 } }); B.size = { w: 14, h: 22 }; Lull.app.modes.play.openNewBoard(); });
  await page.waitForTimeout(150);
  await ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), ev(() => document.querySelector('.mu-pic[data-value="own"]').click())]);
  await chooser.setFiles({ name: 'harbour.png', mimeType: 'image/png', buffer: PHOTO });
  await page.waitForTimeout(400);
  const crop = await ev(() => {
    const c = Lull.MuralView.lastCrop, own = c && c.mural.own, cv = document.querySelector('.mu-crop');
    return { open: !!document.querySelector('.modal-mural-photo'), title: (document.querySelector('.modal-mural-photo .ttl') || {}).textContent, own: own && { w: own.w, h: own.h, k: own.pal.length }, cv: cv && cv.getBoundingClientRect().width, zoom: !!document.querySelector('.mu-zoom'), photo: Lull.MuralView.photo && [Lull.MuralView.photo.w, Lull.MuralView.photo.h] };
  });
  await D.shot('mural-photo-crop-520x760');
  // Drag the frame left, zoom in: the preview follows.
  const box = await ev(() => { const r = document.querySelector('.mu-crop').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const before = await ev(() => Lull.MuralView.lastCrop.mural.own.px);
  await page.mouse.move(box.x, box.y); await page.mouse.down(); await page.mouse.move(box.x - 60, box.y, { steps: 4 }); await page.mouse.up();
  await ev(() => { const z = document.querySelector('.mu-zoom'); z.value = '1.6'; z.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(80);
  const moved = await ev((b) => ({ changed: Lull.MuralView.lastCrop.mural.own.px !== b, cx: Lull.MuralView.photo.cx, z: Lull.MuralView.photo.z }), before);
  await D.shot('mural-photo-zoomed-520x760');
  check('Photo: the file picker opens; the photo in the Photo window (crop frame, Zoom), previewed as a level 4 mural (28 × 44 quarters, 13 colours at most: a photo\'s own); a drag and Zoom change it', crop.open && crop.title === 'Photo' && crop.own && crop.own.w === 28 && crop.own.h === 44 && crop.own.k <= 13 && crop.zoom && crop.cv > 150 && moved.changed && moved.cx < 0.5 && moved.z === 1.6, JSON.stringify({ crop, moved }));
  await ev(() => [...document.querySelectorAll('.modal-mural-photo .btn')].find((b) => b.textContent.trim() === 'Use photo').click());
  await page.waitForTimeout(120);
  const used = await ev(() => { const nb = Lull.app.modes.play.lastNB.nb, r = nb.recipe; return { pic: r.mural.pic, w: r.mural.own && r.mural.own.w, pressed: (document.querySelector('.mu-pic[aria-pressed="true"]') || {}).dataset.value, size: nb.size, json: JSON.stringify(r).length }; });
  await D.shot('mural-photo-newboard-520x760');
  await ev(() => { [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Create').click(); });
  await page.waitForTimeout(200);
  const ownMade = await ev(() => { const g = Lull.app.modes.play.game; return { label: Lull.Recipe.label(g.recipe), w: g.w, h: g.h - Lull.Mural.BUF, saved: JSON.stringify(Lull.app.store.state.boards.recipe).length }; });
  await D.shot('mural-photo-play-520x760');
  check('Use photo: the picture is the photo (its grid only, a few KB); Create makes a 14 × 22 mural of it', used.pic === 'own' && used.w === 28 && used.pressed === 'own' && used.size.w === 14 && used.json < 4000 && ownMade.label === 'Mural · Photo · Level 4' && ownMade.w === 14 && ownMade.h === 22 && ownMade.saved < 4000, JSON.stringify({ used, ownMade }));
  // The level changed with the photo still at hand: cropped again for it.
  await ev(() => Lull.app.modes.play.openNewBoard());
  await page.waitForTimeout(150);
  await ev(() => { document.querySelector('.nb-tab[data-tab="mode"]').click(); });
  await ev(() => document.querySelector('.mu-lv .nb-level[data-value="2"]').click());
  await page.waitForTimeout(150);
  const relevel = await ev(() => { const r = Lull.app.modes.play.lastNB.nb.recipe; return { pic: r.mural.pic, w: r.mural.own.w, h: r.mural.own.h, k: r.mural.own.pal.length }; });
  check('another level with the photo at hand: cropped again for it (20 × 28 quarters, 7 colours at most)', relevel.pic === 'own' && relevel.w === 20 && relevel.h === 28 && relevel.k <= 7, JSON.stringify(relevel));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });

  // ---- Stats and the achievements' group ----------------------------------------------------------------------------------------
  await ev(() => { Lull.app.setTab('stats'); Lull.UI.renderStats(Lull.app, 'free'); });
  await page.waitForTimeout(150);
  const stats = await ev(() => { const hs = [...document.querySelectorAll('h4')].find((x) => x.textContent === 'Mural'); return hs ? [...hs.nextElementSibling.querySelectorAll('td')].map((t) => t.textContent) : null; });
  check('Stats: a Mural section (time, murals finished, pieces placed, by level)', !!stats && stats.includes('Murals finished') && stats.includes('Pieces placed') && stats.includes('Level 3'), JSON.stringify(stats));
  const grp = await ev(() => { const G = Lull.Achievements.GROUPS.find((g) => g.id === 'mural'); return { group: !!G, names: Lull.Achievements.LIST.filter((a) => a.group === 'mural').map((a) => a.name), area: getComputedStyle(document.documentElement).getPropertyValue('--area-mural').trim(), icon: !!Lull.Icons.I.mural }; });
  check('the achievements: a Mural group of seven, its place colour and icon', grp.group && grp.names.length === 7 && !!grp.area && grp.icon, JSON.stringify(grp));
  await ev(() => Lull.app.setTab('play'));
  await D.ctx.close();

  // ---- the frames: the three pictures at levels 1, 3 and 5, finished (520 × 760 light; 400 × 700 dark) ------------------------------
  for (const [vw, vh, theme] of [[520, 760, 'light'], [400, 700, 'dark']]) {
    const F = await open({ viewport: { width: vw, height: vh } }, theme);
    // (Earned already: no toasts over the pictures.)
    await F.ev(() => { const a = Lull.app.store.state.achievements = Lull.app.store.state.achievements || {}; for (const x of Lull.Achievements.LIST) if (x.group === 'mural') a[x.id] = 1; });
    for (const pic of ['coast', 'still', 'soft']) for (const level of [1, 3, 5]) {
      await F.ev(SCENE, { pic, level, seed: level, placed: 'all' });
      await F.ev(() => { const m = Lull.app.modes.play; m.hideCard(); m.renderStatus(); m.view.dirty = true; });
      await F.page.waitForTimeout(60);
      await F.shot('mural-' + pic + '-' + level + '-' + vw + 'x' + vh + '-' + theme);
    }
    await F.ctx.close();
  }

  // ---- the phones and the window sizes, both themes: in play, the window's Mode tab, the Finished card --------------------------------
  const SIZES = [[520, 760], [400, 700], [390, 844], [320, 568]];
  for (const [vw, vh] of SIZES) for (const theme of ['light', 'dark']) {
    const phone = vw < 500 && vh !== 700;
    const F = await open(Object.assign({ viewport: { width: vw, height: vh } }, phone ? { hasTouch: true, isMobile: true } : {}), theme);
    await F.ev(() => { const a = Lull.app.store.state.achievements = Lull.app.store.state.achievements || {}; for (const x of Lull.Achievements.LIST) if (x.group === 'mural') a[x.id] = 1; });
    await F.ev(SCENE, { pic: 'coast', level: 5, seed: 2, placed: 70 });
    await F.page.waitForTimeout(80);
    const fit = await F.ev(() => {
      const m = Lull.app.modes.play, bar = document.querySelector('#play-status'), r = bar.getBoundingClientRect(), cv = m.view.canvas.getBoundingClientRect();
      const boards = document.querySelector('#play-status .boards-btn').getBoundingClientRect(), ib = document.querySelector('#itembar').getBoundingClientRect();
      return { bar: r.right <= window.innerWidth + 0.5 && boards.right <= window.innerWidth + 0.5, page: document.documentElement.scrollWidth <= window.innerWidth, board: cv.width > 100 && cv.bottom <= window.innerHeight, items: ib.bottom <= window.innerHeight + 0.5, quarter: m.view.lay.s / 2 };
    });
    check(vw + ' × ' + vh + ' ' + theme + ': level 5 in play fits (status bar, board, progress, no sideways scroll); a quarter is 5 px or more', fit.bar && fit.page && fit.board && fit.items && fit.quarter >= 5, JSON.stringify(fit));
    await F.shot('mural-play-' + vw + 'x' + vh + '-' + theme);
    // The buffer open (the stack near the top): the board grows to show it, the cells a little smaller, and all still fits.
    const buf = await F.ev(() => { const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g); m.view.render(performance.now()); return { n: X.plan().pieces.length, low: !X.open(g) && m.view.lay.gh === X.plan().H && g.h === X.plan().H + Lull.Mural.BUF }; });
    await F.ev(SCENE, { pic: 'coast', level: 5, seed: 2, placed: buf.n - 6 });
    await F.page.waitForTimeout(650);
    const fitB = await F.ev(() => {
      const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g), cv = m.view.canvas.getBoundingClientRect(), ib = document.querySelector('#itembar').getBoundingClientRect();
      m.view.dirty = true; m.view.render(performance.now());
      const L0 = m.view.lay, wells = L0.board, btns = [...document.querySelectorAll('#play-status button, #itembar button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
      return { open: X.open(g), shown: L0.gh, h: g.h, inside: wells.y >= 0 && wells.y + wells.h <= cv.height + 0.5, board: cv.bottom <= window.innerHeight, items: ib.bottom <= window.innerHeight + 0.5, page: document.documentElement.scrollWidth <= window.innerWidth, quarter: L0.s / 2, small: btns.filter((r) => r.height < 43.5 && r.width < 43.5).length, top: g.piece && g.piece.y + g.piece.type.rotBounds[g.piece.rot].maxY };
    });
    check(vw + ' × ' + vh + ' ' + theme + ': the buffer hidden while the stack is low; near the top it shows (all its rows, the piece at its top) and the board still fits (no clipping or sideways scroll, quarters 4 px or more; on a phone 44 px controls)',
      buf.low && fitB.open && fitB.shown === fitB.h && fitB.top === fitB.h - 1 && fitB.inside && fitB.board && fitB.items && fitB.page && fitB.quarter >= 4 && (!phone || fitB.small === 0), JSON.stringify({ buf, fitB }));
    await F.shot('mural-buffer-' + vw + 'x' + vh + '-' + theme);
    if (phone || vw === 400) {
      // The largest board (20 × 36, the picture at 40 × 72 quarters), its buffer open: it still fits, and its quarters are stated.
      await F.ev(SCENE, { pic: 'still', level: 5, seed: 4, set: 'frantic', w: 20, h: 36, placed: -5 });
      await F.page.waitForTimeout(650);
      const big = await F.ev(() => {
        const m = Lull.app.modes.play, g = m.game, cv = m.view.canvas.getBoundingClientRect(), ib = document.querySelector('#itembar').getBoundingClientRect();
        m.view.dirty = true; m.view.render(performance.now());
        const L0 = m.view.lay, btns = [...document.querySelectorAll('#play-status button, #itembar button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
        return { shown: L0.gh, h: g.h, inside: L0.board.y >= 0 && L0.board.y + L0.board.h <= cv.height + 0.5 && L0.board.x >= 0 && L0.board.x + L0.board.w <= cv.width + 0.5, board: cv.bottom <= window.innerHeight, items: ib.bottom <= window.innerHeight + 0.5, page: document.documentElement.scrollWidth <= window.innerWidth, quarter: L0.s / 2, small: btns.filter((r) => r.height < 43.5 && r.width < 43.5).length };
      });
      console.log('    ' + vw + ' x ' + vh + ' ' + theme + ': the largest board (20 x 36) draws a quarter cell at ' + big.quarter + ' px');
      check(vw + ' × ' + vh + ' ' + theme + ': the largest board (20 × 36) with its buffer open fits (no clipping or sideways scroll' + (phone ? ', 44 px controls' : '') + '); a quarter is 3 px or more (' + big.quarter + ' px)',
        big.shown === big.h && big.inside && big.board && big.items && big.page && big.quarter >= 3 && (!phone || big.small === 0), JSON.stringify(big));
      await F.shot('mural-largest-' + vw + 'x' + vh + '-' + theme);
    }
    if (vw === 520 && theme === 'light') {
      // As each piece appears (set in place one after another, as the real controls would): by default its badge shows
      // one press of the single turn button (or a tick for a look-alike); under Inverted Controls the counter-clockwise
      // one; with Counter-clockwise puzzles on, either way.
      const spawn = {};
      for (const [mode, ccw, inv] of [['one', false, false], ['inv', false, true], ['both', true, false]]) {
        spawn[mode] = await F.ev(([ccw, inv, SC]) => {
          Lull.app.settings.ccwPuzzles = ccw; Lull.app.modes.play.inverted = inv;
          (0, eval)('(' + SC + ')')({ pic: 'still', level: 3, seed: 5, placed: 0 });
          const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g), seen = {};
          while (!g.over) {
            const t = Lull.MuralView.placeState(m.view).turns;
            seen[t] = (seen[t] || 0) + 1;
            const q = X.current(g).goals[0], p = g.piece; p.rot = q.rot; p.x = q.x; p.y = g.h - 1 - p.type.rotBounds[q.rot].maxY; m.action('drop');
          }
          Lull.app.settings.ccwPuzzles = false; m.inverted = false;
          return seen;
        }, [ccw, inv, SCENE.toString()]);
      }
      const only = (o, keys) => Object.keys(o).every((k) => keys.includes(k));
      check('each piece appears one press of the single turn button from its place (clockwise; counter-clockwise under Inverted Controls); both ways with Counter-clockwise puzzles on',
        only(spawn.one, ['1', '0']) && spawn.one[1] > 40 && only(spawn.inv, ['-1', '0']) && spawn.inv[-1] > 40 && spawn.both[1] > 10 && spawn.both[-1] > 10, JSON.stringify(spawn));
      await F.ev(SCENE, { pic: 'coast', level: 5, seed: 2, placed: 70 });
    }
    await F.ev(SCENE, { pic: 'coast', level: 5, seed: 2, placed: 70 });
    if (phone) {
      // The turn badge on the place: a tick once the turn is right (filled when a drop would set it there), else the
      // arrow round the way to turn. By default only the single turn button's arrow (clockwise; counter-clockwise under
      // Inverted Controls), with the presses in it past one; with Counter-clockwise puzzles on, either arrow or a 2.
      const MODES = { one: [false, false], inv: [false, true], both: [true, false] };
      const WANT = { one: { cw: 1, ccw: 3, half: 2 }, inv: { cw: -3, ccw: -1, half: -2 }, both: { cw: 1, ccw: -1, half: 2 } };
      const cues = {};
      for (const mode of Object.keys(MODES)) {
        const cue = cues[mode] = {};
        for (const want of ['cw', 'ccw', 'half', 'right', 'ready']) {
          cue[want] = await F.ev(([want, ccw, inv]) => {
            const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g), p = g.piece, pc = X.current(g), q = pc.goals[0];
            Lull.app.settings.ccwPuzzles = ccw; m.inverted = inv;
            const d = { cw: -1, ccw: 1, half: 2, right: 0, ready: 0 }[want], rot = (q.rot + d + 4) % 4, top = g.h - 1 - p.type.rotBounds[rot].maxY;
            // Its own column over its place when ready, else a column away from it.
            const xs = want === 'ready' ? [q.x] : [q.x + 3, q.x - 3, q.x + 4, q.x - 4, q.x + 2, q.x - 2];
            const x = xs.find((x) => g.fitsAt(p, rot, x, top));
            if (x == null) return null;
            p.rot = rot; p.x = x; p.y = top;
            m.view.dirty = true; m.view.render(performance.now());
            const st = Lull.MuralView.placeState(m.view);
            return { turns: st.turns, ready: st.ready, all: pc.goals.length };
          }, [want, ...MODES[mode]]);
          await F.page.waitForTimeout(40);
          if (cue[want] && mode !== 'both') await F.shot('mural-turn-' + mode + '-' + want + '-' + vw + 'x' + vh + '-' + theme);
        }
      }
      await F.ev(() => { Lull.app.settings.ccwPuzzles = false; Lull.app.modes.play.inverted = false; });
      const ok = (c, t, r) => !c || (c.turns === t && c.ready === r) || c.all > 1;
      const good = (mode) => { const c = cues[mode], w = WANT[mode]; return !!c.right && !!c.ready && ok(c.cw, w.cw, false) && ok(c.ccw, w.ccw, false) && ok(c.half, w.half, false) && c.right.turns === 0 && !c.right.ready && c.ready.turns === 0 && c.ready.ready; };
      check(vw + ' × ' + vh + ' ' + theme + ': the turn badge shows only the one turn button\'s arrow (clockwise; counter-clockwise under Inverted Controls; the presses in it past one), either way or a 2 with Counter-clockwise puzzles on, a tick once right, filled when a drop sets it',
        good('one') && good('inv') && good('both'), JSON.stringify(cues));
      await F.ev(SCENE, { pic: 'coast', level: 5, seed: 2, placed: 70 });
    }
    if (phone) {
      // A swipe down (the drop) out of place does nothing; the Finished card's buttons are 44 px targets.
      const swiped = await F.ev(() => { const m = Lull.app.modes.play, g = m.game, i = Lull.Mural.of(g).i, X = Lull.Mural.extOf(g), p = g.piece, pc = X.current(g); if (pc.goals.some((q) => q.rot === p.rot && q.x === p.x)) m.action('moveL'); m.touchActing = true; const ok = m.action('drop'); m.touchActing = false; return { ok, same: Lull.Mural.of(g).i === i }; });
      await F.ev(SCENE, { pic: 'soft', level: 3, seed: 2, placed: 'all' });
      await F.page.waitForTimeout(80);
      const t44 = await F.ev(() => ['#mu-look', '#mu-new'].every((q) => { const el = document.querySelector(q); if (!el) return false; const b = el.getBoundingClientRect(); return b.height >= 43.5 && b.width >= 43.5 && b.bottom <= window.innerHeight; }));
      await F.shot('mural-finished-' + vw + 'x' + vh + '-' + theme);
      const box2 = await F.ev(() => { const r = document.querySelector('#mu-look').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await F.page.touchscreen.tap(box2.x, box2.y);
      await F.page.waitForTimeout(100);
      const cv = await F.ev(() => { const r = Lull.app.modes.play.view.canvas.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await F.page.touchscreen.tap(cv.x, cv.y);
      await F.page.waitForTimeout(150);
      const tapBack = await card(F.ev);
      check(vw + ' × ' + vh + ' ' + theme + ': a swipe down out of place sets nothing; the Finished card\'s buttons are 44 px; Look, then a tap on the board brings the card back', !swiped.ok && swiped.same && t44 && tapBack.open, JSON.stringify({ swiped, t44, tapBack }));
    }
    await F.ev(() => { const B = Lull.app.store.state.boards; B.recipe = Lull.Recipe.normalize({ mode: 'mural', mural: { pic: 'soft', level: 5 } }); Lull.app.modes.play.openNewBoard(); });
    await F.page.waitForTimeout(150);
    await F.ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
    await F.page.waitForTimeout(100);
    const nb = await F.ev(() => {
      const m = document.querySelector('.modal-newboard'), r = m.getBoundingClientRect(), panel = m.querySelector('.nb-panel'), pr = panel.getBoundingClientRect();
      const btns = [...m.querySelectorAll('.mu-pic, .mu-lv .nb-level')].map((b) => b.getBoundingClientRect());
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight, minH: Math.min(...btns.map((b) => b.height)), inPanel: btns.every((b) => b.bottom <= pr.bottom + 0.5 && b.right <= pr.right + 0.5), scrolls: panel.scrollHeight > panel.clientHeight + 1, page: document.documentElement.scrollWidth <= window.innerWidth };
    });
    check(vw + ' × ' + vh + ' ' + theme + ': the window\'s Mode tab on Mural fits (the pictures and levels in the panel, nothing scrolls' + (phone ? ', 44 px targets' : '') + ')', nb.top >= 0 && nb.bottom <= nb.vh && nb.inPanel && !nb.scrolls && nb.page && (!phone || nb.minH >= 43.5), JSON.stringify(nb));
    await F.shot('mural-newboard-' + vw + 'x' + vh + '-' + theme);
    // The Shapes tab on Mural: Mixed joins the sets; everything in the panel, nothing scrolls.
    await F.ev(() => document.querySelector('.nb-tab[data-tab="shapes"]').click());
    await F.page.waitForTimeout(80);
    const shp = await F.ev(() => {
      const m = document.querySelector('.modal-newboard'), r = m.getBoundingClientRect(), panel = m.querySelector('.nb-panel'), pr = panel.getBoundingClientRect();
      const chips = [...m.querySelectorAll('.nb-chip')], bs = chips.map((b) => b.getBoundingClientRect());
      return { n: chips.length, mixed: chips.some((b) => b.dataset.value === 'mixed'), top: r.top, bottom: r.bottom, vh: window.innerHeight, minH: Math.min(...bs.map((b) => b.height)), inPanel: bs.every((b) => b.bottom <= pr.bottom + 0.5 && b.right <= pr.right + 0.5), scrolls: panel.scrollHeight > panel.clientHeight + 1 };
    });
    check(vw + ' × ' + vh + ' ' + theme + ': the window\'s Shapes tab on Mural (Mixed among the sets) fits: every chip in the panel, nothing scrolls' + (phone ? ', 44 px targets' : ''), shp.mixed && shp.top >= 0 && shp.bottom <= shp.vh && shp.inPanel && !shp.scrolls && (!phone || shp.minH >= 43.5), JSON.stringify(shp));
    await F.shot('mural-newboard-shapes-' + vw + 'x' + vh + '-' + theme);
    await F.ev(() => document.querySelector('.nb-tab[data-tab="mode"]').click());
    await F.page.waitForTimeout(60);
    if (vw === 320 || vw === 390) {
      // The Photo window on a phone.
      const [ch] = await Promise.all([F.page.waitForEvent('filechooser'), F.ev(() => document.querySelector('.mu-pic[data-value="own"]').click())]);
      await ch.setFiles({ name: 'harbour.png', mimeType: 'image/png', buffer: PHOTO });
      await F.page.waitForTimeout(400);
      const pw = await F.ev(() => { const m = document.querySelector('.modal-mural-photo'), r = m && m.getBoundingClientRect(), z = document.querySelector('.mu-zoom').getBoundingClientRect(); return m && { top: r.top, bottom: r.bottom, vh: window.innerHeight, right: r.right, vw: window.innerWidth, zoomH: z.height }; });
      check(vw + ' × ' + vh + ' ' + theme + ': the Photo window fits the phone (Zoom 44 px tall)', !!pw && pw.top >= 0 && pw.bottom <= pw.vh && pw.right <= pw.vw && pw.zoomH >= 43.5, JSON.stringify(pw));
      await F.shot('mural-photo-' + vw + 'x' + vh + '-' + theme);
    }
    await F.ctx.close();
  }

  // ---- piece sets, sizes and a fresh cut: Pentominoes at Detailed (16 × 26) made in the window and played to the end ---------------------
  const S2 = await open();
  const newWith = async () => {
    await S2.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const B = Lull.app.store.state.boards; B.size = { w: 10, h: 14 }; B.recipe = Lull.Recipe.normalize({ mode: 'mural', mural: { pic: 'soft', level: 2 } }); Lull.app.modes.play.openNewBoard(); });
    await S2.page.waitForTimeout(150);
    await S2.ev(() => document.querySelector('.nb-tab[data-tab="shapes"]').click());
    await S2.ev(() => document.querySelector('.nb-chip[data-value="pentominoes"]').click());
    const tab = await S2.ev(() => ({ value: document.querySelector('.nb-tab[data-tab="shapes"] .vl').textContent, pressed: (document.querySelector('.nb-chip[aria-pressed="true"]') || {}).dataset.value }));
    await S2.ev(() => document.querySelector('.nb-tab[data-tab="size"]').click());
    await S2.ev(() => [...document.querySelectorAll('.nb-preset')].find((b) => /Detailed/.test(b.textContent)).click());
    await S2.page.waitForTimeout(60);
    await S2.shot('mural-sets-window-520x760');
    await S2.ev(() => { [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Create').click(); });
    await S2.page.waitForTimeout(250);
    return tab;
  };
  const setTab = await newWith();
  const setMade = await S2.ev(() => {
    const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g), P = X.plan();
    return { set: g.recipe.shapes.preset, label: Lull.Recipe.label(g.recipe), w: g.w, h: g.h - Lull.Mural.BUF, q: [P.pic.QW, P.pic.QH], five: P.pieces.every((p) => p.cells.length === 5 || p.cells.length === 1), ok: P.check && P.check.ok, first: JSON.stringify(P.pieces.slice(0, 8).map((p) => p.cells)) };
  });
  await S2.shot('mural-pentominoes-520x760');
  const setPlayed = await S2.ev(() => {
    const m = Lull.app.modes.play, g = m.game, X = Lull.Mural.extOf(g);
    let n = 0;
    while (!g.over && n < 400) { const q = X.current(g).goals[0], p = g.piece; p.rot = q.rot; p.x = q.x; p.y = g.h - 1 - p.type.rotBounds[q.rot].maxY; m.action('drop'); n++; }
    let left = 0; for (let y = g.h - Lull.Mural.BUF; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.board.get(x, y)) left++;
    return { done: g.endKind === 'finished', n, left };
  });
  await S2.page.waitForTimeout(150);
  await S2.ev(() => Lull.app.modes.play.hideCard());
  await S2.shot('mural-pentominoes-finished-520x760');
  check('Shapes ▸ Pentominoes and Size ▸ Detailed in the window: Create makes a 16 × 26 Pentominoes mural (its picture at 32 × 52 quarters, every piece of five blocks), checked solvable; it plays to Finished, nothing left in the buffer',
    setTab.value === 'Pentominoes' && setTab.pressed === 'pentominoes' && setMade.set === 'pentominoes' && setMade.label === 'Mural · Abstract · Level 2 · Pentominoes' && setMade.w === 16 && setMade.h === 26 && setMade.q.join() === '32,52' && setMade.five && setMade.ok && setPlayed.done && setPlayed.left === 0, JSON.stringify({ setTab, setMade: Object.assign({}, setMade, { first: undefined }), setPlayed }));
  await newWith();
  const again = await S2.ev(() => JSON.stringify(Lull.Mural.extOf(Lull.app.modes.play.game).plan().pieces.slice(0, 8).map((p) => p.cells)));
  check('a new board with the same picture, level, size and set is cut differently (a fresh seed)', again !== setMade.first);
  // Plan time in Chromium, the CPU slowed 4 ×: a fresh seed each, cut and checked from nothing.
  const cdp = await S2.ctx.newCDPSession(S2.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const ms = await S2.ev(() => {
    const out = {};
    for (const set of Lull.Mural.SETS) for (const [w, hh] of [[16, 26], [20, 36]]) {
      const r = Lull.Recipe.normalize({ mode: 'mural', mural: { pic: 'still', level: 5 }, shapes: { preset: set } });
      const t0 = performance.now(); Lull.Mural.plan(r, 777000 + w + set.length, w, hh); out[set + ' ' + w + 'x' + hh] = Math.round(performance.now() - t0);
    }
    return out;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log('    plan ms in Chromium at 4 x CPU throttle:', JSON.stringify(ms));
  check('a level 5 board (16 × 26) plans in under half a second in Chromium at 4 × CPU throttle, every set', Object.entries(ms).filter(([k]) => /16x26/.test(k)).every(([, v]) => v < 500), JSON.stringify(ms));
  await S2.ctx.close();

  // ---- reduced motion: the nudge is drawn still (no shake ever) ----------------------------------------------------------------------
  const RM = await open({ reducedMotion: 'reduce' });
  await RM.ev(SCENE, { pic: 'coast', level: 1, seed: 1, placed: 3 });
  const rm = await RM.ev(() => { const m = Lull.app.modes.play, g = m.game, p = g.piece, X = Lull.Mural.extOf(g), pc = X.current(g); if (pc.goals.some((q) => q.rot === p.rot && q.x === p.x)) m.action('moveR'); m.action('drop'); return { reduced: m.reduced, shake: m.view.fx.shake }; });
  check('reduced motion: a declined drop never shakes', rm.reduced && rm.shake === 0, JSON.stringify(rm));
  await RM.ctx.close();

  check('mural: no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
};
