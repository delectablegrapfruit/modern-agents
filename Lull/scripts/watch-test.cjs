// Watch (js/watch.js, js/bot.js), in the page: the Classic setup's Watch beside Start; a watched game on the setup's
// rules, played through the board's own actions (every move the bot makes is a press of play.action), at a hand's
// pace; your keys and the mouse do nothing to it but pause it; Mistakes kept in Settings and changed as it plays; the
// pause card; Take over (the bot lets go, your keys play on); the end card's Play again and Done; and nothing of it
// counted or kept: Stats, bests, the day's log, achievements, the wallet, the library and the board you were playing
// are exactly as they were. Then the four sizes in both themes (reduced motion too): the bar clear of the phones' tab
// bar, nothing sideways; frames of each (OUT, or the scratch folder in WATCH_SHOTS).
// Run by browser-test.cjs: require('./watch-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

module.exports = async function watchTests({ browser, check, PAGE, OUT }) {
  console.log('watch');
  const SHOTS = process.env.WATCH_SHOTS || OUT;
  const errors = [];
  const open = async (width, height, o) => {
    o = o || {};
    const ctx = await browser.newContext(Object.assign({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: o.theme || 'dark', reducedMotion: o.reduced ? 'reduce' : 'no-preference' }, o.touch ? { hasTouch: true, isMobile: true } : {}));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(PAGE);
    await page.waitForTimeout(450);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    await ev((theme) => {
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.settings.theme = theme; Lull.app.applySettings();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
    }, o.theme || 'dark');
    return { ctx, page, ev };
  };
  // Everything a watched game must leave alone, as it stands.
  const ledger = (ev) => ev(() => {
    // (The day's time and its played mark tick by themselves while your own board is in front: watching's are checked apart.)
    const S = Lull.app.store.state, d = Object.assign({}, S.history[Lull.dateKey()] || {});
    delete d.ms; delete d.played;
    return JSON.stringify({ classic: S.stats.classic, free: S.stats.free, lines: S.lines, ach: Object.keys(S.achievements).sort(), day: d, boards: S.boards.list.map((b) => b.id), cur: S.boards.cur, retired: S.boards.retired.length, saved: S.free, hints: S.hints, combos: S.combos });
  });

  // ---- a Classic game of your own first, then Watch ------------------------------------------------------------------
  const D = await open(520, 760);
  const { page, ev } = D;
  await ev(() => {
    const m = Lull.app.modes.play;
    m.setGrace = 0;
    m.openMenu('classic');
  });
  await page.waitForTimeout(150);
  await page.click('.mn-start');
  await page.waitForTimeout(150);
  // Your own game: started, a few pieces set, then paused (saved as it stands).
  await ev(() => { const m = Lull.app.modes.play; m.ctl.go(); for (let i = 0; i < 3; i++) m.action('drop'); m.ctl.setPause(true); m.syncCounters(); Lull.app.saveNow(); });
  const mine = await ev(() => { const m = Lull.app.modes.play; return { pieces: m.game.s.pieces, json: JSON.stringify(m.game.toJSON()) }; });
  const before = await ledger(ev);

  await ev(() => Lull.app.modes.play.openMenu('classic'));
  await page.waitForTimeout(150);
  // Rules for the watched game: level 6, Next 2 (the bot must play on these).
  await page.click('.mn-setup [data-path="classic.next"][data-value="2"]');
  for (let i = 0; i < 5; i++) await page.click('.mn-setup [data-focus="classic.level+"]');
  const pair = await ev(() => {
    const w = document.querySelector('.mn-foot .mn-watch'), s = document.querySelector('.mn-foot .mn-start');
    if (!w || !s) return null;
    const a = w.getBoundingClientRect(), b = s.getBoundingClientRect();
    return { watch: w.textContent.trim(), start: s.textContent.trim(), side: Math.abs(a.top - b.top) < 2 && a.right <= b.left + 1, parent: w.parentElement === s.parentElement };
  });
  check('Classic setup: Watch beside Start', !!pair && pair.watch === 'Watch' && pair.side && pair.parent, JSON.stringify(pair));
  const noWatch = await ev(() => { const m = Lull.app.modes.play; m.menuHandle.menu.openSetup('descent'); const has = !!document.querySelector('.mn-foot .mn-watch'); m.menuHandle.menu.openSetup('classic'); return has; });
  check('only Classic has Watch', !noWatch);
  await page.click('.mn-foot .mn-watch');
  await page.waitForTimeout(200);
  // Every action the game takes, and whose it was: the bot's (acting) or anyone else's.
  await ev(() => {
    const m = Lull.app.modes.play, act = m.action.bind(m);
    window.__acts = [];
    m.action = (a, rep) => { const r = act(a, rep); window.__acts.push({ a, bot: !!(m.watch && m.watch.acting), ok: r, t: performance.now() }); return r; };
    window.__locks = [];
    m.game.on('lock', () => window.__locks.push(performance.now()));
  });
  const w0 = await ev(() => { const m = Lull.app.modes.play, k = m.game.recipe.classic; return { watch: !!m.watch, menu: !!document.querySelector('.modal-menu'), level: k.level, next: k.next, mode: m.game.recipe.mode, label: document.querySelector('#itembar .wt-label') && document.querySelector('#itembar .wt-label').textContent, card: m.cardOpen, running: m.ctl.running() }; });
  check('Watch: the menu closes and the bot plays at once on the setup\'s rules, "Watching" under the board', w0.watch && !w0.menu && w0.mode === 'classic' && w0.level === 6 && w0.next === 2 && w0.label === 'Watching' && !w0.card && w0.running, JSON.stringify(w0));
  await page.waitForTimeout(5000);
  const played = await ev(() => {
    const m = Lull.app.modes.play, acts = window.__acts;
    const kinds = {};
    for (const x of acts) kinds[x.a] = (kinds[x.a] || 0) + 1;
    return { pieces: m.game.s.pieces, acts: acts.length, bot: acts.filter((x) => x.bot).length, kinds, locks: window.__locks.length, moves: m.game.s.moves, rotations: m.game.s.rotations, drops: m.game.s.drops };
  });
  // Time: watching is not time played (no day, no clock).
  const clock = await ev(() => { const S = Lull.app.store.state, a = JSON.stringify([S.stats.timeMs, S.history[Lull.dateKey()]]); Lull.app.activity(); for (let i = 0; i < 3; i++) Lull.app.second(); return a === JSON.stringify([S.stats.timeMs, S.history[Lull.dateKey()]]); });
  check('watching is not time played: the clocks and the day stand still', clock);
  check('the bot plays pieces through the board\'s actions (moves, turns, drops: a press each)', played.pieces >= 4 && played.acts === played.bot && played.bot >= played.pieces && (played.kinds.drop || 0) >= 3 && played.moves + played.rotations > 0, JSON.stringify(played));
  const pace = await ev(() => { const L = window.__locks; const d = L.slice(1).map((t, i) => t - L[i]); const mean = d.reduce((a, b) => a + b, 0) / d.length, sd = Math.sqrt(d.reduce((a, b) => a + (b - mean) * (b - mean), 0) / d.length); return { n: d.length, mean: Math.round(mean), sd: Math.round(sd) }; });
  check('at a hand\'s pace: pieces some hundreds of ms apart, never on a fixed beat', pace.n >= 3 && pace.mean > 200 && pace.mean < 3000 && pace.sd > 20, JSON.stringify(pace));

  // Your keys and the mouse: nothing but pause.
  const keys = await ev(() => { window.__acts.length = 0; return Lull.app.modes.play.game.s.pieces; });
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyX', 'KeyZ', 'KeyC', 'ArrowDown', 'Space']) await page.keyboard.press(k);
  const box = await page.$('#cv-play').then((e) => e.boundingBox());
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const afterKeys = await ev(() => ({ mine: window.__acts.filter((x) => !x.bot && x.ok).map((x) => x.a), watch: !!Lull.app.modes.play.watch, paused: Lull.app.modes.play.ctl.paused }));
  check('your keys, a click and the mouse do nothing to the watched game', afterKeys.mine.length === 0 && afterKeys.watch && !afterKeys.paused, JSON.stringify(afterKeys));
  await page.keyboard.press('KeyP');
  const pz = await ev(() => { const m = Lull.app.modes.play; return { paused: m.ctl.paused, card: m.cardOpen, btns: [...document.querySelectorAll('#play-overlay .card button')].map((b) => b.textContent.trim()) }; });
  check('P pauses it: Done, Take over, Resume', pz.paused && pz.card && pz.btns.join('|') === 'Done|Take over|Resume Space', JSON.stringify(pz));
  const still = await ev(() => Lull.app.modes.play.game.s.pieces);
  await page.waitForTimeout(700);
  check('paused, the bot waits', (await ev(() => Lull.app.modes.play.game.s.pieces)) === still);
  await page.keyboard.press('Space');
  check('Space resumes it', await ev(() => !Lull.app.modes.play.ctl.paused && !Lull.app.modes.play.cardOpen));
  check('the pointer leaving the window does not pause a watched game (it plays on to be watched)', await ev(() => { Lull.app.onAway('pointer'); return !Lull.app.modes.play.ctl.paused; }));

  // Mistakes: set under the board, kept in Settings, the bot's at once.
  await page.click('#itembar [data-mistakes="some"]');
  const mk = await ev(() => { const m = Lull.app.modes.play; return { set: Lull.app.settings.watchMistakes, bot: m.watch.bot.mistakes, pressed: document.querySelector('#itembar [data-mistakes="some"]').getAttribute('aria-pressed'), off: document.querySelector('#itembar [data-mistakes="off"]').getAttribute('aria-pressed') }; });
  check('Mistakes: Some, kept in Settings and the bot\'s at once', mk.set === 'some' && mk.bot === 'some' && mk.pressed === 'true' && mk.off === 'false', JSON.stringify(mk));
  await page.click('#itembar [data-mistakes="off"]');

  // Pause from the bar, then Take over from it.
  await page.click('#itembar .wt-pause');
  check('Pause under the board pauses it', await ev(() => Lull.app.modes.play.ctl.paused));
  await page.click('#play-overlay #wt-take');
  await page.waitForTimeout(100);
  const tk = await ev(() => { const m = Lull.app.modes.play; return { free: m.watch && m.watch.free, bot: m.watch && m.watch.bot, running: m.ctl.running(), label: document.querySelector('#itembar .wt-label').textContent }; });
  check('Take over (from the pause): the bot lets go, the game runs on in your hands, "Your game · not counted"', tk.free && !tk.bot && tk.running && /Your game/.test(tk.label), JSON.stringify(tk));
  const moved = await ev(() => {
    const m = Lull.app.modes.play, g = m.game;
    window.__acts.length = 0;
    const p = g.piece, x0 = p.x;
    const ok = m.action('moveL') || m.action('moveR');
    return { ok, moved: g.piece === p && g.piece.x !== x0, botActs: window.__acts.filter((x) => x.bot).length };
  });
  await page.waitForTimeout(600);
  check('after Take over your keys move the piece, and the bot presses nothing', moved.ok && moved.moved && (await ev(() => window.__acts.filter((x) => x.bot).length)) === 0, JSON.stringify(moved));
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const mid = await ledger(ev);
  check('a watched (and taken over) game counts toward nothing: Stats, bests, the day, achievements, wallet, library and your saved board as they were', mid === before, mid === before ? '' : diff(before, mid));

  // The end: the pile, the card, Play again (a new watched game), Done (your board back, as it was).
  await ev(() => {
    const m = Lull.app.modes.play, g = m.game;
    // A stack up to the ceiling, round the piece (a gap a row it does not fill, so nothing clears): set where it is,
    // the next piece has no room to appear.
    const mine = new Set(g.absCells(g.piece).map(([x, y]) => x + ',' + y));
    for (let y = 0; y < g.h; y++) {
      let gap = y % g.w;
      while (mine.has(gap + ',' + y)) gap = (gap + 1) % g.w;
      for (let x = 0; x < g.w; x++) if (!mine.has(x + ',' + y)) g.board.set(x, y, x === gap ? 0 : 5);
    }
    g.drop();
  });
  await page.waitForTimeout(200);
  await ev(() => { const c = Lull.app.modes.play.ctl; if (c.pile && !c.pile.done) c.finishPile({ quiet: true }); });
  await page.waitForTimeout(100);
  const end = await ev(() => { const m = Lull.app.modes.play; return { over: m.game.over, card: m.cardOpen, h2: document.querySelector('#play-overlay h2') && document.querySelector('#play-overlay h2').textContent, sub: document.querySelector('#play-overlay .cl-sub') && document.querySelector('#play-overlay .cl-sub').textContent, btns: [...document.querySelectorAll('#play-overlay .card button')].map((b) => b.textContent.trim()) }; });
  check('the end card: Game over, not counted, Done and Play again', end.over && end.card && end.h2 === 'Game over' && /not counted/.test(end.sub) && end.btns.join('|') === 'Done|Play again Space', JSON.stringify(end));
  check('the end counts toward nothing either (no best, no game, no top out)', (await ledger(ev)) === before);
  await page.click('#wt-again');
  await page.waitForTimeout(1500);
  const again = await ev(() => { const m = Lull.app.modes.play; return { watch: !!m.watch, free: m.watch && m.watch.free, bot: !!(m.watch && m.watch.bot), over: m.game.over, pieces: m.game.s.pieces, level: m.game.recipe.classic.level, running: m.ctl.running() }; });
  check('Play again: a new watched game on the same rules, the bot at the keys again', again.watch && !again.free && again.bot && !again.over && again.level === 6 && again.running && again.pieces >= 1, JSON.stringify(again));
  await page.keyboard.press('KeyP');
  await page.click('#play-overlay #wt-done');
  await page.waitForTimeout(150);
  const back = await ev(() => { const m = Lull.app.modes.play; return { watch: !!m.watch, pieces: m.game.s.pieces, json: JSON.stringify(m.game.toJSON()), bar: document.querySelector('#itembar .wt-label') ? 'wt' : 'cl', card: document.querySelector('#play-overlay h2') && document.querySelector('#play-overlay h2').textContent }; });
  check('Done: your own board back exactly as you left it (paused, at its card)', !back.watch && back.json === mine.json && back.bar === 'cl' && back.card === 'Paused', JSON.stringify({ watch: back.watch, same: back.json === mine.json, bar: back.bar, card: back.card }));
  const back2 = await ledger(ev);
  check('and still nothing counted', back2 === before, diff(before, back2));

  // The menu while watching leaves the bot's game be; what the menu does next brings your board back first.
  await ev(() => { Lull.app.modes.play.openMenu('classic'); });
  await page.waitForTimeout(100);
  await page.click('.mn-foot .mn-watch');
  await page.waitForTimeout(500);
  await ev(() => Lull.app.modes.play.openMenu());
  await page.waitForTimeout(100);
  const inMenu = await ev(() => ({ watch: !!Lull.app.modes.play.watch, match: Lull.app.modes.play.boardJSON().s.pieces }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const esc = await ev(() => ({ watch: !!Lull.app.modes.play.watch, menu: !!document.querySelector('.modal-menu') }));
  check('the menu over a watched game: the board it knows is yours; Esc goes back to watching', inMenu.watch && inMenu.match === mine.pieces && esc.watch && !esc.menu, JSON.stringify([inMenu, esc]));
  // Resume (your Classic board, by its rules) from the menu over a watched game: your board, the watching over.
  await ev(() => Lull.app.modes.play.openMenu('classic'));
  await page.waitForTimeout(100);
  // (Back to your board's rules: level 1, Next 3.)
  await page.click('.mn-setup [data-path="classic.next"][data-value="3"]');
  for (let i = 0; i < 5; i++) await page.click('.mn-setup [data-focus="classic.level-"]');
  const canResume = await ev(() => !!document.querySelector('.mn-foot .mn-resume'));
  if (canResume) await page.click('.mn-foot .mn-resume');
  await page.waitForTimeout(100);
  const resumed = await ev(() => { const m = Lull.app.modes.play; return { watch: !!m.watch, menu: !!document.querySelector('.modal-menu'), json: JSON.stringify(m.game.toJSON()) }; });
  check('Resume from the menu over a watched game: your own board again', canResume && !resumed.watch && !resumed.menu && resumed.json === mine.json, JSON.stringify({ canResume, watch: resumed.watch, menu: resumed.menu }));
  await ev(() => Lull.app.modes.play.openMenu('classic'));
  await page.waitForTimeout(100);
  await page.click('.mn-foot .mn-watch');
  await page.waitForTimeout(400);
  await ev(() => Lull.app.modes.play.openLibrary());
  await page.waitForTimeout(150);
  const lib = await ev(() => { const m = Lull.app.modes.play; const r = { watch: !!m.watch, json: JSON.stringify(m.game.toJSON()) }; while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); return r; });
  check('the library (Manage) ends the watching first: your board in play again', !lib.watch && lib.json === mine.json, JSON.stringify({ watch: lib.watch }));
  // Reloaded mid-watch, the save holds your board (the watched game is never written).
  await ev(() => { Lull.app.modes.play.openMenu('classic'); });
  await page.click('.mn-foot .mn-watch');
  await page.waitForTimeout(600);
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(700);
  const reloaded = await ev(() => { const m = Lull.app.modes.play; return { watch: !!m.watch, json: JSON.stringify(m.game.toJSON()) }; });
  check('saved mid-watch and reloaded: your own board, as it was', !reloaded.watch && reloaded.json === mine.json);
  const last = await ledger(ev);
  check('and the ledger as it was', last === before, diff(before, last));
  await D.ctx.close();

  // ---- four sizes, both themes (and reduced motion): the bar clear of the tab bar, nothing sideways; frames ----------
  const sizes = [[320, 568, true], [390, 844, true], [520, 760, false], [900, 700, false]];
  for (const [w, hh, touch] of sizes) {
    for (const theme of ['light', 'dark']) {
      const reduced = theme === 'light' && w === 390;
      const P = await open(w, hh, { theme, touch, reduced });
      await P.ev(() => { Lull.app.modes.play.openMenu('classic'); });
      await P.page.waitForTimeout(150);
      if (SHOTS && w !== 900) await P.page.screenshot({ path: path.join(SHOTS, 'watch-setup-' + w + 'x' + hh + '-' + theme + '.png') });
      const tap = async (sel) => { const b = await P.page.$(sel); const r = await b.boundingBox(); if (touch) await P.page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await P.page.click(sel); };
      await tap('.mn-foot .mn-watch');
      await P.page.waitForTimeout(1500);
      await P.page.waitForFunction(() => Lull.app.modes.play.game.s.pieces >= 1, null, { timeout: 8000 }).catch(() => {});
      const lay = await P.ev(() => {
        const R = (e) => e.getBoundingClientRect(), bar = R(document.getElementById('itembar')), tabs = R(document.getElementById('tabs'));
        const kids = [...document.querySelectorAll('#itembar button, #itembar .wt-label')].map(R);
        const phone = innerWidth <= 500;
        return {
          watching: !!Lull.app.modes.play.watch, pieces: Lull.app.modes.play.game.s.pieces,
          clear: !phone || bar.bottom <= tabs.top + 0.5, inside: kids.every((r) => r.left >= bar.left - 0.5 && r.right <= bar.right + 0.5 && r.bottom <= bar.bottom + 0.5),
          sideways: document.documentElement.scrollWidth > innerWidth, minH: Math.round(Math.min(...[...document.querySelectorAll('#itembar button')].map((b) => R(b).height))),
        };
      });
      check('Watch at ' + w + ' × ' + hh + ' ' + theme + (reduced ? ' (reduced motion)' : '') + ': playing, its bar whole, clear of the tab bar, nothing sideways' + (touch ? ', 40 px+ targets' : ''),
        lay.watching && lay.pieces >= 1 && lay.clear && lay.inside && !lay.sideways && (!touch || lay.minH >= 40), JSON.stringify(lay));
      if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, 'watch-' + w + 'x' + hh + '-' + theme + '.png') });
      // The pause card at the smallest size: its buttons in the board.
      if (w === 320) {
        await tap('#itembar .wt-pause');
        await P.page.waitForTimeout(200);
        const card = await P.ev(() => { const c = document.querySelector('#play-overlay .card').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth && [...document.querySelectorAll('#play-overlay .card button')].every((b) => { const r = b.getBoundingClientRect(); return r.left >= c.left - 0.5 && r.right <= c.right + 0.5; }); });
        check('the pause card fits at 320 × 568 (' + theme + ')', card);
        if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, 'watch-paused-' + w + 'x' + hh + '-' + theme + '.png') });
      }
      await P.ctx.close();
    }
  }
  check('no page errors (watch)', errors.length === 0, errors.slice(0, 4).join('\n'));
};

/** The first place two ledgers part (for the message). */
function diff(a, b) {
  const x = JSON.parse(a), y = JSON.parse(b);
  for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return k + ': ' + JSON.stringify(x[k]).slice(0, 300) + ' → ' + JSON.stringify(y[k]).slice(0, 300);
  return '';
}
