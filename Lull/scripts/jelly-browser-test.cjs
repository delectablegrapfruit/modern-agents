#!/usr/bin/env node
// Jelly in the page (js/jelly.js, js/jellyview.js): a Jelly board made from the New board window, drawn in the Jelly
// look (stack, piece, ghost, trays), its wobble at rest again within a second, none under reduced motion, a cascade
// replayed and counted (CASCADE, the Cascades tile, Stats, Knock-On), Tornado refused, no console errors; and the
// screenshots: at rest and mid-wobble at 10 × 20 and 20 × 40 in both themes, a cascade mid-wave, the trays, and a lump
// oozing down a crack and a bar flopping over a ledge, frame by frame, in both themes.
// Run by browser-test.cjs: require('./jelly-browser-test.cjs')({ browser, check, PAGE, OUT }); or on its own:
//   node Lull/scripts/jelly-browser-test.cjs [screenshot-dir]
'use strict';
const path = require('path');

module.exports = async function jellyTests({ browser, check, PAGE, OUT }) {
  console.log('jelly');
  const errors = [];
  const open = async (o) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 520, height: 760 }, deviceScaleFactor: 2, colorScheme: 'light' }, o));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(500);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const shot = async (name, clip) => { if (OUT) await page.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, clip ? { clip } : null)); };
    await ev((theme) => {
      Lull.app.settings.theme = theme; Lull.app.applySettings();
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      for (const k of ['play', 'puzzle', 'classic']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
    }, (o && o.colorScheme) || 'light');
    return { ctx, page, ev, shot };
  };
  /** A Jelly board of w × h in play, a stack built by a steady greedy hand (n pieces), none of it clearing yet. */
  const jellyBoard = (ev, w, h, n, seed) => ev(([w, h, n, seed]) => {
    const m = Lull.app.modes.play, R = Lull.Recipe;
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    m.hideCard();
    document.getElementById('toasts').replaceChildren();
    m.setGame(new Lull.Game({ w, h, seed, recipe: R.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
    const g = m.game, W = g.w, H = g.h;
    const holes = (c) => { let k = 0; for (let x = 0; x < W; x++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (c[y * W + x]) roof = true; else if (roof) k++; } } return k; };
    for (let i = 0; i < n && g.piece; i++) {
      const t = g.piece.type;
      let best = null;
      for (let rot = 0; rot < 4; rot++) {
        const b = t.rotBounds[rot];
        for (let x = -b.minX; x <= W - 1 - b.maxX; x++) {
          const s = g.simulate(t, rot, x, g.board);
          if (!s) continue;
          let top = 0; for (let k = 0; k < W * H; k++) if (s.board.cells[k]) top = Math.max(top, Math.floor(k / W));
          // Keep it from clearing (a stack to look at), low and with few holes, a little ragged.
          const cost = (s.n + s.c) * 5000 + holes(s.board.cells) * 40 + top * 6 + ((x * 7 + rot * 3 + i) % 5);
          if (!best || cost < best.cost) best = { cost, rot, x };
        }
      }
      if (!best) break;
      g.piece.rot = best.rot; g.piece.x = best.x; g.piece.y = H - 1 - t.rotBounds[best.rot].maxY;
      g.drop();
    }
    m.view.dirty = true; m.view.resize(); m.view.layout(); m.view.render(performance.now());
    return { pieces: g.s.pieces, cells: g.board.count(), links: Array.from(g.board.cells).filter((v) => v & (Lull.CELL.JOIN_R | Lull.CELL.JOIN_U)).length };
  }, [w, h, n, seed || 5]);
  /** Holds time still (every animation reads performance.now) for a screenshot; release() lets it go again. */
  const freeze = (ev, at) => ev((at) => { if (!window.__realNow) window.__realNow = performance.now.bind(performance); const t = at != null ? at : window.__realNow(); performance.now = () => t; return t; }, at);
  const release = (ev) => ev(() => { if (window.__realNow) { performance.now = window.__realNow; delete window.__realNow; } });
  const settle = (page) => page.waitForTimeout(1100);

  // ---- the window: Modifiers ▸ Jelly makes a Jelly board ----
  {
    const { ctx, page, ev } = await open({});
    const made = await ev(async () => {
      const m = Lull.app.modes.play;
      m.openNewBoard();
      await new Promise((r) => setTimeout(r, 80));
      document.querySelector('.nb-tab[data-tab="mods"]').click();
      const sw = document.querySelector('.nb-switch[data-path="mods.jelly"]');
      const name = sw && sw.querySelector('.nm').textContent;
      const before = sw && sw.getAttribute('aria-checked');
      sw.click();
      const after = document.querySelector('.nb-switch[data-path="mods.jelly"]').getAttribute('aria-checked');
      const tab = document.querySelector('.nb-tab[data-tab="mods"] .vl').textContent;
      const r = sw.getBoundingClientRect();
      [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Create').click();
      await new Promise((r) => setTimeout(r, 120));
      const g = m.game;
      return { name, before, after, tab, h: Math.round(r.height), jelly: !!g.recipe.mods.jelly, ext: g.ext.map((e) => e.key).join(), label: Lull.Recipe.label(g.recipe, true), parts: m.view.parts.map((p) => p.key).join(), refused: g.allow('tornado') };
    });
    check('New board ▸ Modifiers: a Jelly switch; on, the tab reads Jelly; Create makes a Jelly board', made.name === 'Jelly' && made.before === 'false' && made.after === 'true' && made.tab === 'Jelly' && made.jelly && made.ext === 'jelly' && made.label === 'Jelly' && made.parts === 'jelly', JSON.stringify(made));
    check('a Jelly board refuses Tornado ("Not on a Jelly board")', made.refused === 'Not on a Jelly board');
    const bar = await ev(() => {
      const m = Lull.app.modes.play;
      m.openTray('board');
      const b = document.querySelector('.item-btn[data-item="tornado"]');
      const out = b ? { dis: b.getAttribute('aria-disabled'), tip: b.getAttribute('data-tip') } : null;
      m.openTray(null);
      return out;
    });
    check('its tray shows Tornado off, the reason as its tip', !!bar && bar.dis === 'true' && bar.tip === 'Not on a Jelly board', JSON.stringify(bar));
    await ctx.close();
  }

  // ---- the look, the wobble, reduced motion, a cascade, counts ----
  for (const theme of ['light', 'dark']) {
    const { ctx, page, ev, shot } = await open({ colorScheme: theme });
    for (const [w, h, n] of [[10, 20, 14], [20, 40, 46]]) {
      const b = await jellyBoard(ev, w, h, n, 5);
      await release(ev);
      await settle(page);
      const drawn = await ev(() => {
        const m = Lull.app.modes.play, v = m.view, J = Lull.JellyView.stateOf(v);
        const calls = { stack: 0, piece: 0, ghost: 0, tray: 0 };
        const vp = Lull.JellyView.view, cell = vp.cell;
        vp.cell = function (ctx, val, x, y, s, kind) { calls[kind]++; return cell.apply(this, arguments); };
        v.dirty = true; v.render(performance.now());
        vp.cell = cell;
        return { calls, busy: vp.busy(v), springs: J.springs.length, needs: v.needsFrame() };
      });
      check(theme + ' ' + w + ' × ' + h + ': every block in the Jelly look (stack, piece, ghost, trays), linked lumps', drawn.calls.stack === b.cells && drawn.calls.piece >= 4 && drawn.calls.ghost >= 4 && drawn.calls.tray >= 8 && b.links > 0, JSON.stringify([b, drawn.calls]));
      check(theme + ' ' + w + ' × ' + h + ': at rest within a second of the last lock (nothing asks for frames)', !drawn.busy && drawn.springs === 0 && !drawn.needs, JSON.stringify(drawn));
      await shot('jelly-' + w + 'x' + h + '-rest-' + theme);
      // Mid-wobble: a lock, a turn and a move, time held a moment later.
      const wob = await ev(() => {
        const m = Lull.app.modes.play, g = m.game, v = m.view, J = Lull.JellyView.stateOf(v);
        // Where the piece sets and stays (an O, nothing to ooze, no row): a lock that plays no replay.
        g.replacePiece({ id: 'O' });
        const p = g.piece, bnd = p.type.rotBounds[p.rot];
        for (let x = -bnd.minX; x <= g.w - 1 - bnd.maxX; x++) {
          if (!g.fitsAt(p, p.rot, x, p.y)) continue;
          const sim = g.simulate(p.type, p.rot, x, g.board);
          if (sim && !sim.n && !sim.c && !(sim.res.cascade || []).length) { p.x = x; break; }
        }
        m.action('drop');
        m.action('cw');
        m.action('moveL');
        const t0 = performance.now();
        const real = performance.now.bind(performance);
        window.__realNow = real;
        performance.now = () => t0 + 8;
        Lull.JellyView.view.busy(v);
        v.dirty = true; v.render(t0 + 8);
        return { springs: J.springs.length, cells: J.springs.reduce((a, s) => a + s.cells.length, 0), piece: !!J.piece, a: J.springs.length ? +J.springs[0].a.toFixed(3) : 0 };
      });
      check(theme + ' ' + w + ' × ' + h + ': a lock wobbles the lump it set (and what it rests on), a turn and a move the piece; 60 cells at most', wob.springs >= 1 && wob.cells <= 60 && wob.piece, JSON.stringify(wob));
      await shot('jelly-' + w + 'x' + h + '-wobble-' + theme);
      await release(ev);
      await settle(page);
      const rest = await ev(() => { const v = Lull.app.modes.play.view, J = Lull.JellyView.stateOf(v); return { springs: J.springs.length, piece: !!J.piece, busy: Lull.JellyView.view.busy(v) }; });
      check(theme + ' ' + w + ' × ' + h + ': the wobble is over within a second', rest.springs === 0 && !rest.piece && !rest.busy, JSON.stringify(rest));
      if (w === 10 && theme === 'light') {
        // The trays, close up.
        const clip = await ev(() => { const L = Lull.app.modes.play.view.lay, c = document.getElementById('cv-play').getBoundingClientRect(); const x = Math.min(L.hold.x, L.next.x), y = Math.min(L.hold.y, L.next.y); return { x: c.left + L.plate.x, y: c.top + L.plate.y, width: L.plate.w, height: Math.min(L.plate.h, Math.max(L.hold.y + L.hold.h, L.next.y + L.next.h) - L.plate.y + 8) }; });
        await shot('jelly-trays', clip);
      }
    }

    // A cascade: an overhang falls and clears twice; replayed wave by wave, then the board as it is.
    const casc = await ev(() => {
      const m = Lull.app.modes.play, R = Lull.Recipe, C = Lull.CELL;
      m.setGame(new Lull.Game({ w: 10, h: 20, seed: 9, recipe: R.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
      const g = m.game;
      const rows = ['.bb.cc.dd.', 'rrrrrrrrr.', 'X..fffffff', 'XXXX..gggg', 'XXXXXXX..X'];
      const H = rows.length;
      for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) {
        const ch = rows[H - 1 - y][x];
        if (ch === '.') continue;
        const at = (xx, yy) => (yy >= 0 && yy < H && xx >= 0 && xx < 10 ? rows[H - 1 - yy][xx] : '.');
        let v = 1 + ((x * 3 + y) % 7);
        if (/[a-z]/.test(ch)) { v = 1 + ('bcdrfg'.indexOf(ch) % 7); if (at(x + 1, y) === ch) v |= C.JOIN_R; if (at(x, y + 1) === ch) v |= C.JOIN_U; }
        g.board.set(x, y, v);
      }
      g.replacePiece({ id: 'I' });
      g.piece.rot = 1; g.piece.x = 7; g.piece.y = 12;
      const F = Lull.app.store.state.stats.free, before = F.cascades || 0;
      // The sounds of rows clearing, as [id, rows] (a quad or a clear), from here on.
      const sounds = [];
      const snd = Lull.app.sound, play = snd.play.bind(snd);
      snd.play = (id, n) => { if (id === 'clear' || id === 'quad' || id === 'lock') sounds.push([id, n || 0]); return play(id, n); };
      window.__sounds = sounds;
      window.__snd = () => sounds.filter(([id]) => id !== 'lock').map(([id]) => id);
      // The next piece moved (before a frame is drawn) where neither it nor its ghost meets a lump the replay still
      // draws in the air, so the replay runs its course, and where most of its ghost shows; its column, or null.
      window.__safe = () => {
        const m = Lull.app.modes.play, g = m.game, v = m.view, JV = Lull.JellyView, rp = JV.stateOf(v).replay, p = g.piece;
        if (!rp || !p) return null;
        const x0 = p.x, bnd = p.type.rotBounds[p.rot];
        let best = null;
        for (let x = -bnd.minX; x <= g.w - 1 - bnd.maxX; x++) {
          if (!g.fitsAt(p, p.rot, x, p.y)) continue;
          p.x = x;
          if (!rp.waves.every((wv) => !JV.meets(v, { wv, t: 0 }) && !JV.meets(v, { wv, t: wv.fall }))) continue;
          const gy = g.ghostY(p), shows = gy == null ? 0 : g.absCells(p, p.rot, x, gy).filter(([cx, cy]) => !JV.ghostCovered(v, cx, cy)).length;
          if (!best || shows > best.shows) best = { x, shows };
        }
        p.x = best ? best.x : x0;
        return best ? best.x : null;
      };
      m.action('drop');
      const safe = window.__safe();
      const J = Lull.JellyView.stateOf(m.view);
      return { replay: !!J.replay, waves: J.replay ? J.replay.waves.length : 0, t0: J.replay ? J.replay.t0 : 0, cascades: (F.cascades || 0) - before, ach: !!Lull.app.store.state.achievements.knock_on, safe, atLock: sounds.slice() };
    });
    check(theme + ': a lock with cascades starts a replay of its waves; the cascades are counted; Knock-On (3 waves) is earned', casc.replay && casc.waves === 3 && casc.cascades === 3 && casc.ach && casc.safe != null, JSON.stringify(casc));
    check(theme + ': the lock is heard for the piece\'s own row only (the cascade\'s rows are heard as the replay reaches them)', JSON.stringify(casc.atLock) === '[["clear",1]]', JSON.stringify(casc.atLock));
    // Mid-wave: time held a little into the first wave's fall.
    await freeze(ev, casc.t0 + 130);
    await ev(() => { const v = Lull.app.modes.play.view; v.dirty = true; v.render(performance.now()); });
    if (theme === 'light') await shot('jelly-cascade-midwave-light');
    const mid = await ev(() => { const v = Lull.app.modes.play.view, J = Lull.JellyView.stateOf(v); const at = J.replay && Lull.JellyView.replayAt(J.replay, performance.now()); return { wave: at ? at.i : -1, falling: at ? at.t < at.wv.fall : null }; });
    check(theme + ': mid-wave, the first wave is falling', mid.wave === 0 && mid.falling === true, JSON.stringify(mid));
    await release(ev);
    await page.waitForTimeout(2000);
    const after = await ev(() => {
      const m = Lull.app.modes.play, v = m.view, J = Lull.JellyView.stateOf(v);
      return { replay: !!J.replay, sounds: window.__snd().filter((s) => s === 'clear').length, texts: v.fx.texts.map((t) => t.str) };
    });
    // Four clears heard: the piece's own row at the lock, then one for each of the three waves (never a row twice).
    check(theme + ': the replay ends by itself (each wave heard once, as it clears)', !after.replay && after.sounds === 4, JSON.stringify(after));
    // CASCADE words over the board: the replay puts them up wave by wave (seen on the next cascade, held mid-way).
    const words = await ev(async () => {
      const m = Lull.app.modes.play, v = m.view, J = Lull.JellyView.stateOf(v);
      // A new cascade, and a lower during it ends it at once.
      const g = m.game, C = Lull.CELL;
      g.board.cells.fill(0);
      const put = (x, y, v2) => g.board.set(x, y, v2);
      for (let x = 0; x < 9; x++) put(x, 1, 3 | (x < 8 ? C.JOIN_R : 0));
      for (let x = 0; x < 10; x++) if (x !== 3 && x !== 4) put(x, 0, 5);
      put(3, 2, 2 | C.JOIN_R); put(4, 2, 2);
      for (let x = 0; x < 3; x++) put(x, 0, 5);
      g.replacePiece({ id: 'I' }); g.piece.rot = 1; g.piece.x = 7; g.piece.y = 12;
      // Row 1 (the 9 joined) is held by row 0; the I fills column 9 of row 1: it clears, the pair falls into row 0.
      m.action('drop');
      const started = !!J.replay, safe = window.__safe();
      await new Promise((r) => setTimeout(r, 300));
      const seen = v.fx.texts.map((t) => t.str), still = !!J.replay;
      m.action('down');
      const lowered = !J.replay;
      return { started, safe, seen, still, lowered };
    });
    check(theme + ': "CASCADE" over the board as the wave clears; a lower ends the replay at once', words.started && words.safe != null && words.seen.includes('CASCADE') && words.still && words.lowered, JSON.stringify(words));
    // The Board full card: a Cascades tile; Stats ▸ Free Play: the Jelly rows.
    const card = await ev(async () => {
      const m = Lull.app.modes.play;
      m.ctl.onEnd('full', true);
      await new Promise((r) => setTimeout(r, 60));
      const tiles = [...document.querySelectorAll('#play-overlay .board-sum .bs')].map((t) => [t.querySelector('.v').textContent, t.querySelector('.l').textContent]);
      const sum = document.querySelector('#play-overlay .board-sum');
      const fits = sum ? [...sum.querySelectorAll('.bs')].every((t) => t.scrollWidth <= t.clientWidth + 1) : false;
      m.hideCard();
      Lull.app.setTab('stats');
      Lull.UI.renderStats(Lull.app, 'free');
      await new Promise((r) => setTimeout(r, 60));
      const heads = [...document.querySelectorAll('#stats-body h4')].map((x) => x.textContent);
      const i = heads.indexOf('Jelly');
      const rows = i >= 0 ? [...document.querySelectorAll('#stats-body h4')][i].nextElementSibling.textContent : '';
      Lull.app.setTab('play');
      return { cascades: (tiles.find(([, l]) => l === 'Cascades') || [])[0], board: (tiles.find(([, l]) => l === 'Board') || [])[0], fits, heads: i, rows };
    });
    check(theme + ': the Board full card has a Cascades tile (and the Board tile says Jelly); nothing in it overflows', card.cascades === '4' && card.board === 'Jelly' && card.fits, JSON.stringify(card));
    check(theme + ': Stats ▸ Free Play has the Jelly rows', card.heads >= 0 && card.rows === 'Cascades4Most from one piece3', JSON.stringify(card));
    // The next piece high up, its ghost landing where a lump is still drawn in mid-air: the replay ends at once (and
    // its clear is still seen and heard); with the ghost clear of it, it goes on. And a lock whose only rows are a
    // cascade's (a lump left hanging falls at the next lock) is heard as a lock, its row once, as the replay reaches it.
    const ghost = await ev(async () => {
      const m = Lull.app.modes.play, v = m.view, R = Lull.Recipe, C = Lull.CELL, JV = Lull.JellyView;
      const setUp = () => {
        m.setGame(new Lull.Game({ w: 10, h: 20, seed: 9, recipe: R.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
        const g = m.game;
        // Row 0 full but column 4; a lump of two over it, hanging (it falls into row 0 at the next lock, which clears).
        for (let x = 0; x < 10; x++) if (x !== 4) g.board.set(x, 0, 5);
        g.board.set(4, 3, 2 | C.JOIN_U); g.board.set(4, 4, 2);
        g.replacePiece({ id: 'O' }); g.piece.rot = 0; g.piece.x = 7; g.piece.y = 12;
        return g;
      };
      const vertical = (g, col) => { g.replacePiece({ id: 'I' }); g.piece.rot = 1; g.piece.x = col - 2; g.piece.y = 14; };
      const sounds = window.__sounds, J = { get replay() { return JV.stateOf(v).replay; } };
      // Its ghost clear of the lump (column 8): the replay goes on.
      let g = setUp();
      sounds.length = 0;
      m.action('drop');
      const lock = sounds.slice();
      vertical(g, 8);
      const at = { wv: J.replay && J.replay.waves[0], t: 0 };
      const clearOf = !!J.replay && !JV.meets(v, at);
      // Its ghost (column 8, rows 2-5) runs under the piece set before, which the clear has yet to bring down (row 2):
      // that cell of the ghost is not drawn, the rest are.
      const gy = g.ghostY(g.piece), covered = g.absCells(g.piece, g.piece.rot, g.piece.x, gy).filter(([x, y]) => JV.ghostCovered(v, x, y));
      const vp = JV.view, cell = vp.cell, ghostDraws = [];
      vp.cell = function (ctx, val, x, y, s, kind) {
        if (kind !== 'ghost') return cell.apply(this, arguments);
        const di = ctx.drawImage;
        let k = 0;
        ctx.drawImage = function () { k++; return di.apply(this, arguments); };
        try { return cell.apply(this, arguments); } finally { ctx.drawImage = di; ghostDraws.push(k); }
      };
      v.dirty = true; v.render(performance.now());
      vp.cell = cell;
      await new Promise((r) => setTimeout(r, 80));
      const goesOn = !!J.replay;
      await new Promise((r) => setTimeout(r, 900));
      const heard = sounds.slice(lock.length);
      // Its ghost in column 4, landing on the lump's place in the air (the piece itself far above it): over at once.
      g = setUp();
      m.action('drop');
      sounds.length = 0;
      vertical(g, 4);
      const rp = J.replay, wv = rp && rp.waves[0];
      const pieceOnly = !!wv && g.absCells(g.piece).some(([x, y]) => y < g.h && wv.before[y * g.w + x] && !g.board.cells[y * g.w + x]);
      const meets = !!wv && JV.meets(v, { wv, t: 0 });
      await new Promise((r) => setTimeout(r, 80));
      return { lock, clearOf, covered, ghostDraws, goesOn, heard, pieceOnly, meets, ended: !J.replay, flushed: sounds.slice() };
    });
    check(theme + ': a lock whose rows are only a cascade\'s is heard as a lock, then its row once as the replay clears it', JSON.stringify(ghost.lock) === '[["lock",0]]' && JSON.stringify(ghost.heard) === '[["clear",1]]', JSON.stringify(ghost));
    check(theme + ': during the replay the ghost is not drawn under a block it still shows (and is drawn elsewhere)', JSON.stringify(ghost.covered) === '[[8,2]]' && ghost.ghostDraws.length === 4 && ghost.ghostDraws.filter((k) => k > 0).length === 3, JSON.stringify(ghost));
    check(theme + ': the ghost landing on a lump still in the air ends the replay at once (its clear still heard); clear of it, it goes on', ghost.clearOf && ghost.goesOn && !ghost.pieceOnly && ghost.meets && ghost.ended && JSON.stringify(ghost.flushed) === '[["clear",1]]', JSON.stringify(ghost));
    // Physics: a lump oozes down a crack one wide, and a bar hanging over a ledge flops over it; each replayed step by
    // step (frames held at a few moments), the board final at once.
    for (const [name, rows, piece] of [
      ['crack', ['XXXXX.XXX.', 'XXXXX.XXX.', 'XXXXX.XXX.', 'XXXXX.XXX.'], { id: 'O', rot: 0, x: 4 }],
      ['flop', ['XXXX......', 'XXXX......', 'XXXX......', 'XXXX......'], { id: 'I', rot: 0, x: 2 }],
    ]) {
      const oz = await ev(([rows, piece]) => {
        const m = Lull.app.modes.play, R = Lull.Recipe;
        m.setGame(new Lull.Game({ w: 10, h: 20, seed: 11, recipe: R.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
        const g = m.game, H = rows.length;
        for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) if (rows[H - 1 - y][x] === 'X') g.board.set(x, y, 1 + ((x * 3 + y) % 7));
        g.replacePiece({ id: piece.id }); g.piece.rot = piece.rot; g.piece.x = piece.x; g.piece.y = 12;
        const r = m.action('drop') || null;
        g.replacePiece({ id: 'T' }); g.piece.x = 0; g.piece.y = 15;
        const J = Lull.JellyView.stateOf(m.view), rp = J.replay;
        const col = (x) => { let s = ''; for (let y = 5; y >= 0; y--) s += g.board.get(x, y) ? '#' : '.'; return s; };
        return { replay: !!rp, t0: rp ? rp.t0 : 0, steps: rp ? rp.waves.map((wv) => (wv.ooze ? 'ooze' : wv.falls.length ? 'fall' : '-') + '@' + wv.dur.toFixed(2)) : [], cols: [col(4), col(5), col(6)], count: g.board.count() };
      }, [rows, piece]);
      const want = name === 'crack' ? oz.cols[1] === '..####' : oz.steps.length >= 2;
      check(theme + ': ' + name + ': the lump oozes, a step at a time, replayed (' + oz.steps.join(' ') + ')', oz.replay && oz.steps.filter((x) => x.startsWith('ooze')).length >= 2 && want && oz.count === (name === 'crack' ? 36 : 20), JSON.stringify(oz));
      let k = 0;
      for (const dt of [70, 230, 420, 1400]) {
        await freeze(ev, oz.t0 + dt);
        await ev(() => { const v = Lull.app.modes.play.view; Lull.JellyView.view.busy(v); v.dirty = true; v.render(performance.now()); });
        await shot('jelly-' + name + '-' + (++k) + '-' + theme);
        await release(ev);
      }
      await page.waitForTimeout(100);
    }
    await ctx.close();
  }

  // ---- reduced motion: no springs; a cascade is short crossfades ----
  {
    const { ctx, page, ev } = await open({ reducedMotion: 'reduce' });
    await jellyBoard(ev, 10, 20, 10, 7);
    const rm = await ev(() => {
      const m = Lull.app.modes.play, v = m.view, J = Lull.JellyView.stateOf(v);
      m.action('cw'); m.action('moveL'); m.action('down'); m.action('drop');
      Lull.JellyView.view.busy(v);
      return { reduced: v.reducedMotion, springs: J.springs.length, piece: !!J.piece };
    });
    check('reduced motion: no springs (a lock, a turn, a move, a lower)', rm.reduced && rm.springs === 0 && !rm.piece, JSON.stringify(rm));
    const cf = await ev(() => {
      const m = Lull.app.modes.play, R = Lull.Recipe, C = Lull.CELL;
      m.setGame(new Lull.Game({ w: 10, h: 20, seed: 9, recipe: R.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
      const g = m.game;
      for (let x = 0; x < 9; x++) g.board.set(x, 1, 3 | (x < 8 ? C.JOIN_R : 0));
      for (let x = 0; x < 10; x++) if (x !== 3 && x !== 4) g.board.set(x, 0, 5);
      g.board.set(3, 2, 2 | C.JOIN_R); g.board.set(4, 2, 2);
      g.replacePiece({ id: 'I' }); g.piece.rot = 1; g.piece.x = 7; g.piece.y = 12;
      m.action('drop');
      const J = Lull.JellyView.stateOf(m.view);
      return J.replay ? J.replay.waves.map((w) => +(w.fall + w.clear).toFixed(2)) : null;
    });
    check('reduced motion: each wave is a 0.15 s crossfade (and its clear)', cf && cf.every((d) => d <= 0.3 + 1e-9), JSON.stringify(cf));
    const inst = await ev(() => {
      const m = Lull.app.modes.play, R = Lull.Recipe;
      m.setGame(new Lull.Game({ w: 10, h: 20, seed: 9, recipe: R.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
      const g = m.game;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) if (x !== 5 && x !== 9) g.board.set(x, y, 5);
      g.replacePiece({ id: 'O' }); g.piece.rot = 0; g.piece.x = 4; g.piece.y = 12;
      m.action('drop');
      const rp = Lull.JellyView.stateOf(m.view).replay;
      return rp ? rp.waves.map((w) => (w.ooze ? 'ooze' : 'fall') + '@' + w.dur) : [];
    });
    check('reduced motion: ooze steps are instant (no warping)', inst.filter((x) => x.startsWith('ooze')).length >= 2 && inst.every((x) => x === 'ooze@0' || x.startsWith('fall')), JSON.stringify(inst));
    await page.waitForTimeout(800);
    const done = await ev(() => { const v = Lull.app.modes.play.view; return { replay: !!Lull.JellyView.stateOf(v).replay, busy: Lull.JellyView.view.busy(v) }; });
    check('reduced motion: the replay is over at once', !done.replay && !done.busy, JSON.stringify(done));
    await ctx.close();
  }

  check('jelly: no console errors', errors.length === 0, errors.slice(0, 5).join('\n'));
};

if (require.main === module) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) {
    try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) { console.error('Playwright is not installed; skipping.'); process.exit(0); }
  }
  const PAGE = 'file://' + path.join(__dirname, '..', 'Game', 'index.html');
  const OUT = process.argv[2] || null;
  let failures = 0;
  const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra && !ok ? ' — ' + extra : '')); if (!ok) failures++; };
  (async () => {
    const launchOpts = {};
    if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
    const browser = await chromium.launch(launchOpts);
    if (OUT) require('fs').mkdirSync(OUT, { recursive: true });
    await module.exports({ browser, check, PAGE, OUT });
    await browser.close();
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
