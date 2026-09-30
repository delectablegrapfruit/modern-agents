#!/usr/bin/env node
// Jelly in the page (js/jelly.js, js/jellyview.js): a Jelly board made from the New board window, Tornado, Settle and
// Trapdoor refused; every settled piece drawn as one soft blob (the piece, its ghost and the trays as lumps); at rest
// nothing asks for frames; a hard drop's knock and a soft drop played back; a band clearing whole minos and what it
// held coming down, heard and seen; reduced motion (no squash, played back fast, the same outcome); no console errors;
// and the screenshots (520 × 760, light and dark): a stack at rest, a hard drop knocking a stack frame by frame, a soft
// drop, a band clearing and splitting the pieces it crosses, and a 20 × 40 board.
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
      for (const k of ['play', 'puzzle']) Lull.app.modes[k].setGrace = 0;
      Lull.app.setTab('play');
      // Helpers in the page: a fresh Jelly board; a piece set by hand (hard dropped, or set down where it lands).
      window.__jelly = (w, h, seed) => {
        const m = Lull.app.modes.play;
        while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
        m.hideCard();
        document.getElementById('toasts').replaceChildren();
        m.setGame(new Lull.Game({ w, h, seed, recipe: Lull.Recipe.normalize({ mods: { jelly: true } }), previewCount: m.settings.preview }));
        return m.game;
      };
      window.__put = (id, x, rot, hard) => {
        const g = Lull.app.modes.play.game;
        g.replacePiece({ id });
        const p = g.piece, bnd = p.type.rotBounds[rot || 0];
        p.rot = rot || 0; p.x = x - bnd.minX; p.y = g.h - 1 - bnd.maxY;
        if (hard) return g.drop();
        p.y = g.ghostY(p);
        return g.lock();
      };
      window.__render = () => { const v = Lull.app.modes.play.view; Lull.JellyView.view.busy(v); v.dirty = true; v.resize(); v.layout(); v.render(performance.now()); };
      window.__world = () => { const W = Lull.Jelly.of(Lull.app.modes.play.game); return W.bodies.map((b) => [b.id, +b.x.toFixed(4), +b.y.toFixed(4), +b.s.toFixed(4)]); };
    }, (o && o.colorScheme) || 'light');
    return { ctx, page, ev, shot };
  };
  /** Holds time still (every animation reads performance.now) at `at`; release() lets it go again. */
  const freeze = (ev, at) => ev((at) => { if (!window.__realNow) window.__realNow = performance.now.bind(performance); performance.now = () => at; return at; }, at);
  const release = (ev) => ev(() => { if (window.__realNow) { performance.now = window.__realNow; delete window.__realNow; } });
  /** A tidy stack of pieces set down (no knocks), n of them, for a board of w × h. */
  const stack = (ev, w, h, n, seed) => ev(([w, h, n, seed]) => {
    const g = window.__jelly(w, h, seed), W0 = g.w, H = g.h;
    const holes = (c) => { let k = 0; for (let x = 0; x < W0; x++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (c[y * W0 + x]) roof = true; else if (roof) k++; } } return k; };
    for (let i = 0; i < n && g.piece; i++) {
      const t = g.piece.type;
      let best = null;
      for (let rot = 0; rot < 4; rot++) {
        const b = t.rotBounds[rot];
        for (let x = -b.minX; x <= W0 - 1 - b.maxX; x++) {
          const s = g.simulate(t, rot, x, g.board);
          if (!s) continue;
          let top = 0; for (let k = 0; k < W0 * H; k++) if (s.board.cells[k]) top = Math.max(top, Math.floor(k / W0));
          const cost = (s.n + s.c) * 5000 + holes(s.board.cells) * 40 + top * 6 + ((x * 7 + rot * 3 + i) % 5);
          if (!best || cost < best.cost) best = { cost, rot, x };
        }
      }
      if (!best) break;
      g.piece.rot = best.rot; g.piece.x = best.x; g.piece.y = g.ghostY(g.piece);
      g.lock();
    }
    const J = Lull.JellyView.stateOf(Lull.app.modes.play.view);
    J.replay = null; J.skins.clear();
    window.__render();
    return { pieces: g.s.pieces, bodies: Lull.Jelly.of(g).bodies.length, cells: g.board.count() };
  }, [w, h, n, seed || 5]);

  // ---- the window: Modifiers ▸ Jelly makes a Jelly board; its refusals ----
  {
    const { ctx, ev } = await open({});
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
      [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Create').click();
      await new Promise((r) => setTimeout(r, 120));
      const g = m.game;
      return { name, before, after, jelly: !!g.recipe.mods.jelly, ext: g.ext.map((e) => e.key).join(), parts: m.view.parts.map((p) => p.key).join(), refused: ['tornado', 'settle', 'trapdoor'].map((id) => g.allow(id)), flip: g.allow('flip') };
    });
    check('New board ▸ Modifiers: a Jelly switch; Create makes a Jelly board', made.name === 'Jelly' && made.before === 'false' && made.after === 'true' && made.jelly && made.ext === 'jelly' && made.parts === 'jelly', JSON.stringify(made));
    check('a Jelly board refuses Tornado, Settle and Trapdoor ("Not on a Jelly board"); Mirror World is allowed', made.refused.every((x) => x === 'Not on a Jelly board') && made.flip === null, JSON.stringify(made));
    const bar = await ev(() => {
      const m = Lull.app.modes.play;
      m.openTray('board');
      const out = ['tornado', 'settle', 'trapdoor'].map((id) => { const b = document.querySelector('.item-btn[data-item="' + id + '"]'); return b ? [b.getAttribute('aria-disabled'), b.getAttribute('data-tip')] : null; });
      m.openTray(null);
      return out;
    });
    check('its tray shows them off, the reason as the tip', bar.every((b) => !b || (b[0] === 'true' && b[1] === 'Not on a Jelly board')) && bar.some(Boolean), JSON.stringify(bar));
    await ctx.close();
  }

  // ---- the look: blobs, at rest nothing runs; a hard drop's knock, a soft drop, a band clearing ----
  let outcome = null;
  for (const theme of ['light', 'dark']) {
    const { ctx, page, ev, shot } = await open({ colorScheme: theme });
    for (const [w, h, n] of [[10, 20, 16], [20, 40, 50]]) {
      const b = await stack(ev, w, h, n, 5);
      await page.waitForTimeout(700);
      const drawn = await ev(() => {
        const m = Lull.app.modes.play, v = m.view, JV = Lull.JellyView;
        const calls = { body: 0, piece: 0, ghost: 0, tray: 0, stack: 0 };
        const vp = JV.view, cell = vp.cell, db = JV.drawBody;
        vp.cell = function (ctx, val, x, y, s, kind) { calls[kind]++; return cell.apply(this, arguments); };
        v.dirty = true; v.render(performance.now());
        vp.cell = cell;
        return { calls, busy: vp.busy(v), needs: v.needsFrame(), bodies: Lull.Jelly.of(m.game).bodies.length, awake: Lull.Jelly.of(m.game).awake.length, db: !!db };
      });
      check(theme + ' ' + w + ' × ' + h + ': the stack is bodies (asleep); the piece, its ghost and the trays are lumps', drawn.bodies === b.bodies && drawn.awake === 0 && drawn.calls.stack === b.cells && drawn.calls.piece >= 4 && drawn.calls.ghost >= 4 && drawn.calls.tray >= 8, JSON.stringify([b, drawn]));
      check(theme + ' ' + w + ' × ' + h + ': at rest nothing asks for frames', !drawn.busy && !drawn.needs, JSON.stringify(drawn));
      await shot('jelly-' + w + 'x' + h + '-rest-' + theme);
    }

    // A hard drop into a stack: an I stood on end dropped onto a ledge; frames 0.03, 0.1, 0.2, 0.4 s after the lock.
    await stack(ev, 10, 20, 12, 11);
    const hd = await ev(() => {
      const before = window.__world();
      const r = window.__put('O', 4, 0, true);
      const rp = Lull.JellyView.stateOf(Lull.app.modes.play.view).replay;
      const after = window.__world(), was = new Map(before.map((b) => [b[0], b]));
      let moved = 0;
      for (const b of after) { const o = was.get(b[0]); if (o) moved += Math.abs(b[1] - o[1]) + Math.abs(b[2] - o[2]) + Math.abs(b[3] - o[3]); }
      return { dist: r.dropDist, replay: !!rp, t0: rp ? rp.t0 : 0, frames: r.jelly ? r.jelly.frames.length : 0, moved: +moved.toFixed(4) };
    });
    check(theme + ': a hard drop is played back and knocks what it lands on', hd.replay && hd.frames > 5 && hd.dist > 5 && hd.moved > 0.005, JSON.stringify(hd));
    let k = 0;
    for (const dt of [30, 100, 200, 400]) {
      await freeze(ev, hd.t0 + dt);
      const sq = await ev(() => { window.__render(); const J = Lull.JellyView.stateOf(Lull.app.modes.play.view); let a = 0; for (const s of J.skins.values()) a = Math.max(a, Math.abs(s.a)); return +a.toFixed(3); });
      if (dt === 30) check(theme + ': the landing squashes (the skin)', sq > 0.03, String(sq));
      await shot('jelly-harddrop-' + (++k) + '-' + theme);
      await release(ev);
    }
    await page.waitForTimeout(1500);
    // A soft drop onto the same kind of stack: nothing it lands on moves.
    await stack(ev, 10, 20, 12, 11);
    const sd = await ev(() => {
      const before = window.__world();
      const r = window.__put('O', 4, 0, false);
      const rp = Lull.JellyView.stateOf(Lull.app.modes.play.view).replay;
      const after = window.__world(), was = new Map(before.map((b) => [b[0], b]));
      let moved = 0;
      for (const b of after) { const o = was.get(b[0]); if (o) moved += Math.abs(b[1] - o[1]) + Math.abs(b[2] - o[2]) + Math.abs(b[3] - o[3]); }
      return { t0: rp ? rp.t0 : 0, moved: +moved.toFixed(4), dist: r.dropDist || 0 };
    });
    check(theme + ': a soft drop sets the piece down; nothing it lands on moves', sd.moved < 1e-3 && !sd.dist, JSON.stringify(sd));
    await freeze(ev, sd.t0 + 60);
    await ev(() => window.__render());
    await shot('jelly-softdrop-' + theme);
    await release(ev);
    await page.waitForTimeout(800);

    // A band clearing: row 0 filled by a flat I, an I on end, two O's and last an I on end hard dropped: the minos in
    // row 0 go (whole minos: the upright I's bottom ones, the O's lower halves, the flat I), the rest come down.
    const bc = await ev(() => {
      const m = Lull.app.modes.play, g = window.__jelly(10, 20, 3);
      const sounds = [];
      const snd = Lull.app.sound, play = snd.play.bind(snd);
      snd.play = (id, n) => { if (id === 'clear' || id === 'quad') sounds.push(id); return play(id, n); };
      window.__sounds = sounds;
      window.__put('I', 0, 0); window.__put('I', 4, 1); window.__put('O', 5, 0); window.__put('O', 7, 0);
      const before = Lull.Jelly.of(g).bodies.length;
      const F = Lull.app.store.state.stats.free, c0 = F.cascades || 0;
      window.__render();
      const r = window.__put('I', 9, 1, true);
      const rp = Lull.JellyView.stateOf(m.view).replay;
      const W = Lull.Jelly.of(g);
      return { rows: (r.cascade || []).map((w) => w.rows), removed: (r.cascade || []).map((w) => w.removed.map((x) => x.length)), before, after: W.bodies.length, t: (r.cascade || [0]).map((w) => w.t), t0: rp ? rp.t0 : 0, heardNow: sounds.slice(), lines: r.lines, own: r.own, sizes: W.bodies.map((b) => b.m).sort().join('') };
    });
    check(theme + ': a band clears whole minos, splits what it crossed (two I\u2019s of three, two O halves), and the rest comes down', bc.rows.length === 1 && bc.rows[0][0] === 0 && bc.removed[0][0] === 10 && bc.sizes === '2233' && bc.heardNow.length === 0, JSON.stringify(bc));
    k = 0;
    const tc = (bc.t[0] || 0) * 1000;
    for (const dt of [tc - 60, tc + 20, tc + 120, tc + 450]) {
      await freeze(ev, bc.t0 + Math.max(10, dt));
      await ev(() => window.__render());
      await shot('jelly-band-' + (++k) + '-' + theme);
      await release(ev);
    }
    await page.waitForTimeout(1600);
    const heard = await ev(() => ({ sounds: window.__sounds.slice(), busy: Lull.JellyView.view.busy(Lull.app.modes.play.view) }));
    check(theme + ': the band is heard as the playback reaches it; then all is still', heard.sounds.length >= 1 && !heard.busy, JSON.stringify(heard));
    if (theme === 'light') outcome = await ev(() => JSON.stringify(Lull.Jelly.pack(Lull.Jelly.of(Lull.app.modes.play.game))));
    await ctx.close();
  }

  // ---- reduced motion: no squash, played back three times as fast, the same outcome ----
  {
    const { ctx, page, ev } = await open({ reducedMotion: 'reduce' });
    const rm = await ev(() => {
      const m = Lull.app.modes.play, g = window.__jelly(10, 20, 3);
      window.__put('I', 0, 0); window.__put('I', 4, 1); window.__put('O', 5, 0); window.__put('O', 7, 0);
      window.__put('I', 9, 1, true);
      const J = Lull.JellyView.stateOf(m.view);
      return { reduced: m.view.reducedMotion, speed: J.replay ? J.replay.speed : 0, pack: JSON.stringify(Lull.Jelly.pack(Lull.Jelly.of(g))) };
    });
    await page.waitForTimeout(250);
    const sk = await ev(() => { const v = Lull.app.modes.play.view; Lull.JellyView.view.busy(v); return Lull.JellyView.stateOf(v).skins.size; });
    check('reduced motion: played back three times as fast, no squash', rm.reduced && rm.speed === 3 && sk === 0, JSON.stringify([rm.speed, sk]));
    check('reduced motion: the same outcome', rm.pack === outcome);
    await page.waitForTimeout(1200);
    const done = await ev(() => { const v = Lull.app.modes.play.view; return { replay: !!Lull.JellyView.stateOf(v).replay, busy: Lull.JellyView.view.busy(v) }; });
    check('reduced motion: over soon, then still', !done.replay && !done.busy, JSON.stringify(done));
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
