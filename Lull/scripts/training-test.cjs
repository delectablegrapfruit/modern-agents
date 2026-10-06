// Training (js/training.js, js/trainingview.js), in the page: Training in Solo between Classic and Descent; its setup
// (Classic's rules, then the coach: Strictness, Hint after, Explanation), the coach's settings kept in Settings and over
// a reload; a poor set taken back (the piece drawn going back up for about 300 ms, the keys held meanwhile, then the
// game exactly as the piece appeared), a good one kept; the best spot's outline once Hint after is reached, gone on a
// good set; nothing counted (Stats, bests, past boards, the day's log, the
// time, achievements, the wallet, Classic's kept game); Continue (Training kept as its own game while Classic is
// played); the way back retracing the piece's own path (each move, turn and row in reverse, 0.4 to 0.9 s, the keys
// held, then the game exactly as the piece appeared); Explanation's moment at the set piece (rings fading over about a
// second, its word by them, nothing up where the pieces appear); Hold judged as it is pressed (a poor one back at once,
// marked at the Hold box); a good move's word, calmer; the music playing straight on through the way back. Then the
// four sizes in both themes (reduced motion: back at once, a flash, a still fade): the bar clear of the phones' tab
// bar, nothing sideways; the setup, a moment of the way back, the hint and Explanation's moment mid-fade in frames
// (OUT, or the folder in TRAINING_SHOTS).
// Run by browser-test.cjs: require('./training-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

module.exports = async function trainingTests({ browser, check, PAGE, OUT }) {
  console.log('training');
  const SHOTS = process.env.TRAINING_SHOTS || OUT;
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
    await install(ev, o.theme || 'dark');
    return { ctx, page, ev };
  };
  /** The page made ready (no windows, no control hints, no set grace), and its helpers (again after a reload). */
  const install = (ev, theme) => ev((theme) => {
      while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
      Lull.app.settings.theme = theme; Lull.app.applySettings();
      Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
      Lull.app.modes.play.setGrace = 0;
      // The page's helpers: a stack with a gap at the far left (the turn taken again), the poorest placement there is
      // and the best (each set where it rests, and dropped by the board's own action), the game as the coach sees it.
      window.__tr = {
        stack() {
          const m = Lull.app.modes.play, g = m.game;
          g.board.cells.fill(0);
          for (let y = 0; y < 4; y++) for (let x = 1; x < 10; x++) if (!(y === 3 && x > 5)) g.board.set(x, y, 3);
          Lull.Training.newTurn(Lull.Training.of(g), Lull.Training.snap(g));
          m.ctl.forTurn = null;
          m.view.dirty = true;
        },
        /** The ranked placement asked for: the best, or a poor one (no Hold, losing more than 25). */
        pick(which) {
          const g = Lull.app.modes.play.game, ranked = Lull.Training.rankingOf(g), best = Lull.Training.bestOf(ranked);
          if (which === 'best') return best;
          const plain = ranked.slice().reverse().filter((x) => !x.hold);
          return plain.find((x) => best.value - ranked.deepen(x) > 25) || plain.sort((a, b) => ranked.deepen(a) - ranked.deepen(b))[0];
        },
        set(which) {
          const m = Lull.app.modes.play, g = m.game, e = window.__tr.pick(which);
          if (e.hold) m.action('hold');
          Object.assign(g.piece, { rot: e.r, x: e.x, y: e.y });
          window.__tr.cells = g.absCells(g.piece);
          return m.action('drop');
        },
        state() {
          const g = Lull.app.modes.play.game, j = g.toJSON();
          delete j.s.playMs; if (j.x.classic) delete j.x.classic.ms; delete j.x.training;
          return JSON.stringify(j);
        },
        /** Pixels of the board's canvas that differ between two pictures taken with fn() between them. */
        /**
         * A hand's way to a ranked placement, by the board's own actions (moves, turns, soft drop rows, then the drop):
         * the search's route from where the piece is. The actions sent.
         */
        walk(e) {
          const m = Lull.app.modes.play, g = m.game, p = g.piece, B = Lull.Bot;
          const rch = B.reach(B.rowsOf(g.board), g.w, g.h, p.type, { rot: p.rot, x: p.x, y: p.y }, { r180: true, ceiling: g.ceiling, twist: true });
          const want = Lull.Training.cellKey(e.cells), pl = rch.places.find((q) => Lull.Training.cellKey(p.type.rots[q.r].map(([cx, cy]) => [q.x + cx, q.y + cy])) === want);
          const route = rch.route(pl), A = { L: 'moveL', R: 'moveR', D: 'lower', CW: 'cw', CCW: 'ccw', R180: 'r180', drop: 'drop' };
          for (const mv of route) { m.action(A[mv]); m.ctl.track(); }
          return route;
        },
        /** Pixels of the board's canvas inside screen boxes [x, y, w, h] (CSS px) that differ between two pictures taken with fn() between. */
        diffIn(boxes, fn) {
          const m = Lull.app.modes.play, cv = document.getElementById('cv-play'), ctx = cv.getContext('2d'), k = cv.width / cv.getBoundingClientRect().width;
          const grab = () => { m.view.dirty = true; m.view.render(performance.now()); return ctx.getImageData(0, 0, cv.width, cv.height).data; };
          const a = grab(); fn(); const b = grab();
          let n = 0;
          for (const [x, y, w, h] of boxes) for (let py = Math.floor(y * k); py < (y + h) * k; py++) for (let px = Math.floor(x * k); px < (x + w) * k; px++) {
            const i = (py * cv.width + px) * 4;
            if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
          }
          return n;
        },
        diff(fn) {
          const m = Lull.app.modes.play, cv = document.getElementById('cv-play'), ctx = cv.getContext('2d');
          const grab = () => { m.view.dirty = true; m.view.render(performance.now()); return ctx.getImageData(0, 0, cv.width, cv.height).data; };
          const a = grab(); fn(); const b = grab();
          let n = 0;
          for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
          return n;
        },
      };
    }, theme);
  const ledger = (ev) => ev(() => {
    const S = Lull.app.store.state, d = Object.assign({}, S.history[Lull.dateKey()] || {});
    return JSON.stringify({ classic: S.stats.classic, free: S.stats.free, time: S.stats.timeMs, lines: S.lines, ach: Object.keys(S.achievements).sort(), day: d, classicGame: S.boards.games.classic || null, hints: S.hints, combos: S.combos });
  });

  // ---- the menu and the setup -------------------------------------------------------------------------------------------
  const D = await open(520, 760);
  const { page, ev } = D;
  // A Classic game of your own first (kept as Classic's when Training comes into play).
  await ev(() => Lull.app.modes.play.openMenu('classic'));
  await page.waitForTimeout(150);
  await page.click('.mn-start');
  await page.waitForTimeout(100);
  await ev(() => { const m = Lull.app.modes.play; m.ctl.go(); for (let i = 0; i < 3; i++) m.action('drop'); m.ctl.setPause(true); Lull.app.saveNow(); });
  const classicJSON = await ev(() => JSON.stringify(Lull.app.modes.play.game.toJSON()));

  await ev(() => Lull.app.modes.play.openMenu('solo'));
  await page.waitForTimeout(150);
  const solo = await ev(() => [...document.querySelectorAll('.mn-modes .mn-tile b')].map((b) => b.textContent));
  check('Solo: Training between Classic and Descent', solo.join() === 'Relaxed,Classic,Training,Descent,Mural,Custom', solo.join());
  await page.click('.mn-mode[data-mode="training"]');
  await page.waitForTimeout(150);
  const setup = await ev(() => ({
    title: document.querySelector('.modal-menu header .ttl').textContent,
    type: !!document.querySelector('.mn-setup [data-path="classic.type"]'), level: !!document.querySelector('.mn-setup [data-focus="classic.level+"]'),
    rand: !!document.querySelector('.mn-setup [data-path="classic.rand"]'), lock: !!document.querySelector('.mn-setup [data-path="classic.lock"]'), hold: !!document.querySelector('.mn-setup [data-path="classic.hold"]'),
    strict: [...document.querySelectorAll('.tr-coach [data-focus^="trainStrict="]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(),
    hint: [...document.querySelectorAll('.tr-coach [data-focus^="trainHint="]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(),
    explain: document.querySelector('.tr-coach .tr-explain').getAttribute('aria-checked'),
    watch: !!document.querySelector('.mn-foot .mn-watch'), start: document.querySelector('.mn-foot .mn-start').textContent,
  }));
  check('Training setup: Classic\'s rules (type, level, randomizer, lock timing, hold), then the coach: Standard, hint after 3, Explanation off', setup.title === 'Training' && setup.type && setup.level && setup.rand && setup.lock && setup.hold
    && setup.strict === 'Gentle,Standard*,Strict' && setup.hint === '1,2,3*,4,5' && setup.explain === 'false' && !setup.watch && setup.start === 'Start', JSON.stringify(setup));
  // The coach's settings: kept in Settings as they are pressed, and shown so again.
  await page.click('.tr-coach [data-focus="trainStrict=strict"]');
  await page.click('.tr-coach [data-focus="trainHint=2"]');
  await page.click('.tr-coach .tr-explain');
  await page.click('.mn-setup [data-path="classic.next"][data-value="2"]');
  const kept = await ev(() => ({ s: Lull.app.settings.trainStrict, h: Lull.app.settings.trainHint, e: Lull.app.settings.trainExplain, focus: document.activeElement && document.activeElement.dataset.path, pressed: document.querySelector('.tr-coach [data-focus="trainHint=2"]').getAttribute('aria-pressed'), on: document.querySelector('.tr-coach .tr-explain').getAttribute('aria-checked') }));
  check('the coach\'s settings kept as pressed (Strict, hint after 2, Explanation on)', kept.s === 'strict' && kept.h === 2 && kept.e === true && kept.pressed === 'true' && kept.on === 'true', JSON.stringify(kept));
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(600);
  await install(ev, 'dark');
  await ev(() => Lull.app.modes.play.openMenu('training'));
  await page.waitForTimeout(150);
  const after = await ev(() => ({ s: Lull.app.settings.trainStrict, h: Lull.app.settings.trainHint, e: Lull.app.settings.trainExplain, strict: document.querySelector('.tr-coach [aria-pressed="true"][data-focus^="trainStrict"]').textContent, next: document.querySelector('.mn-setup [data-path="classic.next"][aria-pressed="true"]').textContent }));
  check('over a reload: the coach\'s settings and the setup\'s rules as left', after.s === 'strict' && after.h === 2 && after.e === true && after.strict === 'Strict' && after.next === '2', JSON.stringify(after));
  // Back to Standard, hint after 3, Explanation off for what follows; then Start.
  await page.click('.tr-coach [data-focus="trainStrict=standard"]');
  await page.click('.tr-coach [data-focus="trainHint=3"]');
  await page.click('.tr-coach .tr-explain');
  await page.click('.mn-start');
  await page.waitForTimeout(150);
  {
    const p2 = await ev(() => { const m = Lull.app.modes.play; return { mode: m.game.recipe.mode, next: m.game.recipe.classic.next, card: document.querySelector('#play-overlay .card h2') && document.querySelector('#play-overlay .card h2').textContent, cur: Lull.app.store.state.boards.cur, kept: Lull.app.store.state.boards.games.classic ? JSON.stringify(Lull.app.store.state.boards.games.classic.game) : null, bar: document.getElementById('itembar').textContent, s: [Lull.app.settings.trainStrict, Lull.app.settings.trainHint, Lull.app.settings.trainExplain].join() }; });
    check('a Training game: Classic\'s rules as set up (Next 2), its Training card, kept apart from Classic\'s game', p2.mode === 'training' && p2.next === 2 && p2.card === 'Training' && p2.cur === 'training' && p2.kept === classicJSON && /Training/.test(p2.bar) && /0 placed/.test(p2.bar) && p2.s === 'standard,3,false', JSON.stringify(Object.assign({}, p2, { kept: !!p2.kept })));
    await ev(() => Lull.app.modes.play.ctl.go());
    const before = await ledger(ev);

    // A good set is kept.
    await ev(() => window.__tr.stack());
    await page.waitForTimeout(250);
    const good = await ev(() => { const m = Lull.app.modes.play, ok = window.__tr.set('best'), T = Lull.Training.of(m.game); return { ok, back: !!m.ctl.back, placed: T.placed, first: T.first, rewinds: T.rewinds, pieces: m.game.s.pieces }; });
    check('a good set is kept: counted as placed at the first try', good.ok && !good.back && good.placed === 1 && good.first === 1 && good.rewinds === 0 && good.pieces === 1, JSON.stringify(good));

    // A poor set is taken back.
    await ev(() => window.__tr.stack());
    await page.waitForTimeout(250);
    const was = await ev(() => window.__tr.state());
    const poor = await ev(() => {
      const m = Lull.app.modes.play, T = Lull.Training.of(m.game);
      window.__tf = 0;
      const ok = window.__tr.set('poor');
      return { ok, back: !!m.ctl.back, due: m.ctl.back && m.ctl.back.due, tries: T.tries, rewinds: T.rewinds, hint: !!Lull.Training.hintOf(T, Lull.app.settings) };
    });
    await page.waitForTimeout(60);
    const mid = await ev((was) => { const m = Lull.app.modes.play; return { back: !!m.ctl.back, t: m.ctl.back && m.ctl.back.t, blocked: m.blocked(), move: m.action('moveL'), drop: m.action('drop'), same: window.__tr.state() === was }; }, was);
    await page.waitForTimeout(1000);
    const done = await ev((was) => { const m = Lull.app.modes.play, T = Lull.Training.of(m.game); return { back: !!m.ctl.back, same: window.__tr.state() === was, placed: T.placed, rewinds: T.rewinds, bar: document.getElementById('itembar').textContent, blocked: m.blocked() }; }, was);
    check('a poor set is taken back: one try more, the way back begun', poor.ok && poor.back && poor.due && poor.tries === 1 && poor.rewinds === 1 && !poor.hint, JSON.stringify(poor));
    check('on the way back (0.4 to 0.9 s): the game already as it was, the keys held', mid.back && mid.t < 0.4 && mid.blocked && !mid.move && !mid.drop && mid.same, JSON.stringify(mid));
    check('then the same piece in play again, exactly as it appeared; the bar counts the rewind', !done.back && done.same && done.placed === 1 && done.rewinds === 1 && /1 rewind/.test(done.bar) && !done.blocked, JSON.stringify(done));

    // Hint after 3: shown at the third poor set in a row, not before; gone on a good one.
    const tries = [];
    for (let k = 2; k <= 3; k++) {
      await ev(() => window.__tr.set('poor'));
      await page.waitForTimeout(1000);
      tries.push(await ev(() => { const T = Lull.Training.of(Lull.app.modes.play.game); return { tries: T.tries, hint: !!Lull.Training.hintOf(T, Lull.app.settings) }; }));
    }
    check('Hint after 3: no outline at 2 tries, the best spot at 3', !tries[0].hint && tries[0].tries === 2 && tries[1].hint && tries[1].tries === 3, JSON.stringify(tries));
    const drawn = await ev(() => { const st = Lull.app.settings; return window.__tr.diff(() => { st.trainHint = 5; }) + ':' + window.__tr.diff(() => { st.trainHint = 3; }); });
    const [off1, on1] = drawn.split(':').map(Number);
    check('the best spot\'s outline is drawn on the board (and goes with a higher Hint after)', off1 > 40 && on1 > 40, drawn);
    // Explanation on: why, at the cells the piece was set, for a moment (rings rising and fading, its word by them).
    await ev(() => { Lull.app.settings.trainExplain = true; });
    const spark = await ev(() => {
      const m = Lull.app.modes.play;
      Lull.app.frameStep = 0.0001;
      window.__tr.set('poor');
      const sp = m.ctl.spark, view = m.view, s = view.lay.s;
      const boxes = sp.cells.map(([x, y]) => { const [sx, sy] = view.toScreen(x, y); return [sx - s * 0.2, sy - s * 1.2, s * 1.4, s * 1.4]; });
      const elsewhere = [[view.lay.board.x, view.toScreen(0, view.game.h - 1)[1], view.lay.board.w, s * 2]];
      const keep = m.ctl.spark;
      keep.t = 0.25; const early = window.__tr.diffIn(boxes, () => { m.ctl.spark = null; }); m.ctl.spark = keep;
      keep.t = 0.95; const late = window.__tr.diffIn(boxes, () => { m.ctl.spark = null; }); m.ctl.spark = keep;
      keep.t = 0.25; const top = window.__tr.diffIn(elsewhere.filter(() => !sp.cells.some(([, y]) => y >= view.game.h - 3)), () => { m.ctl.spark = null; }); m.ctl.spark = keep;
      const same = Lull.Training.cellKey(sp.cells) === Lull.Training.cellKey(window.__tr.cells);
      return { same, word: sp.word, holes: sp.holes.length, early, late, top, dur: sp.dur, wait: m.ctl.back && m.ctl.back.wait };
    });
    check('Explanation: why shown at the cells the piece was set (its word by them), rings fading over about a second; nothing drawn up where the pieces appear', spark.same && spark.word && spark.early > 40 && spark.late < spark.early * 0.6 && spark.top === 0 && spark.dur >= 0.8 && spark.dur <= 1.2 && spark.wait > 0, JSON.stringify(spark));
    await ev(() => { Lull.app.frameStep = null; });
    await page.waitForTimeout(1600);
    const sparkGone = await ev(() => ({ spark: !!Lull.app.modes.play.ctl.spark, back: !!Lull.app.modes.play.ctl.back }));
    check('then gone, and the way back done', !sparkGone.spark && !sparkGone.back, JSON.stringify(sparkGone));
    await ev(() => { Lull.app.settings.trainExplain = false; });

    // The way back retraces the piece's own path: its moves, turns and rows undone in turn, to where it appeared.
    const was2 = await ev(() => { window.__tr.stack(); return window.__tr.state(); });
    await page.waitForTimeout(250);
    const bt = await ev(() => {
      const m = Lull.app.modes.play, g = m.game, e = window.__tr.pick('poor'), tp = Lull.Training.of(g).turn.piece;
      const spawn = Lull.Pieces.get(tp.entry.id).rots[tp.rot].map(([cx, cy]) => [tp.x + cx, tp.y + cy]);
      Lull.app.frameStep = 0.0001;
      const route = window.__tr.walk(e), b = m.ctl.back, path = m.ctl.path.filter((q) => !q.hold);
      const key = Lull.Training.cellKey, cellsAt = (q) => Lull.Pieces.get(q.id).rots[q.rot].map(([cx, cy]) => [q.x + cx, q.y + cy]);
      const back = path.map(cellsAt).map(key).reverse();
      // Each keyframe is a pose of the path, in reverse order.
      let j = 0, inOrder = true;
      for (const st of b.steps.slice(1)) { const k = back.indexOf(key(st.cells), j); if (k < 0) { inOrder = false; break; } j = k; }
      return { route: route.join(' '), poses: path.length, steps: b.steps.length, total: +b.total.toFixed(3), first: key(b.steps[0].cells) === key(e.cells), last: key(b.steps[b.steps.length - 1].cells) === key(spawn), inOrder, glides: b.steps.filter((x) => x.glide).length, minStep: Math.min(...b.steps.slice(1).map((x) => x.dur)) };
    });
    check('the way back: the path from where the piece appeared kept (each move, turn and row), retraced in reverse from where it was set to where it appeared, in 0.4 to 0.9 s, a fall in one glide', bt.poses >= 3 && bt.steps >= 3 && bt.first && bt.last && bt.inOrder && bt.total >= 0.4 && bt.total <= 0.9 && bt.glides >= 1 && bt.minStep >= 0.04, JSON.stringify(bt));
    const btMid = await ev(() => { const m = Lull.app.modes.play; m.ctl.frame(0, 0.016); return { blocked: m.blocked(), move: m.action('moveL'), hold: m.action('hold') }; });
    await ev(() => { Lull.app.frameStep = null; });
    await page.waitForTimeout(1100);
    const btDone = await ev((was) => ({ same: window.__tr.state() === was, back: !!Lull.app.modes.play.ctl.back, path: Lull.app.modes.play.ctl.path.length }), was2);
    check('on the way back the keys wait; then the game exactly as the piece appeared, a new path begun', btMid.blocked && !btMid.move && !btMid.hold && btDone.same && !btDone.back && btDone.path === 1, JSON.stringify([btMid, btDone]));

    // Hold is a move: pressed where it is poor it goes back at once (marked at the Hold box with Explanation on); pressed
    // where it is good it stays.
    await ev(() => { Lull.app.settings.trainExplain = true; Lull.app.settings.trainStrict = 'strict'; });
    const hd = await ev(() => {
      const m = Lull.app.modes.play, g = m.game, ranked = Lull.Training.rankingOf(g), v = Lull.Training.assessHold(ranked, 'strict');
      const before = JSON.stringify([g.piece.type.id, g.hold, g.queue.map((e) => e.id)]), T = Lull.Training.of(g), r0 = T.rewinds;
      Lull.app.frameStep = 0.0001;
      m.action('hold');
      const b = m.ctl.back, sp = m.ctl.spark, hb = m.view.holdBox(), s = m.view.lay.s;
      let marked = 0;
      if (sp) { const keep = sp; keep.t = 0.3; marked = window.__tr.diffIn([[hb.x - s, hb.y - s * 2, hb.w + s * 2, hb.h + s * 3]], () => { m.ctl.spark = null; }); m.ctl.spark = keep; }
      return { good: v.good, held: !!v.held, back: !!b, hold: !!(sp && sp.hold), word: sp && sp.word, marked, rewinds: T.rewinds - r0, before, path: m.ctl.path.some((q) => q.hold) };
    });
    await ev(() => { Lull.app.frameStep = null; });
    await page.waitForTimeout(1600);
    const hd2 = await ev(() => { const g = Lull.app.modes.play.game; return { now: JSON.stringify([g.piece.type.id, g.hold, g.queue.map((e) => e.id)]), back: !!Lull.app.modes.play.ctl.back }; });
    check('Hold judged as it is pressed: ' + (hd.held && !hd.good ? 'a poor one goes back at once, marked at the Hold box ("T fits better now"), the piece and Hold as they were' : 'a good one stays'),
      hd.held && !hd.good ? hd.back && hd.hold && / fits better now$/.test(hd.word || '') && hd.marked > 20 && hd.rewinds === 1 && hd.path && hd2.now === hd.before && !hd2.back : !hd.back && hd.rewinds === 0, JSON.stringify([hd, hd2]));
    await ev(() => { Lull.app.settings.trainExplain = false; Lull.app.settings.trainStrict = 'standard'; });

    // A good move's word too, with Explanation on: smaller and calmer, at the cells it was set, in the accent.
    await ev(() => { Lull.app.settings.trainExplain = true; window.__tr.stack(); });
    await page.waitForTimeout(250);
    const gd = await ev(() => {
      const m = Lull.app.modes.play;
      Lull.app.frameStep = 0.0001;
      window.__tr.set('best');
      const sp = m.ctl.spark, view = m.view, s = view.lay.s;
      if (!sp) return null;
      const boxes = sp.cells.map(([x, y]) => { const [sx, sy] = view.toScreen(x, y); return [sx - s * 0.2, sy - s * 1.2, s * 1.4, s * 1.4]; });
      sp.t = 0.2; const drawn = window.__tr.diffIn(boxes, () => { m.ctl.spark = null; }); m.ctl.spark = sp;
      return { good: sp.good, word: sp.word, bad: sp.bad, dur: sp.dur, back: !!m.ctl.back, same: Lull.Training.cellKey(sp.cells) === Lull.Training.cellKey(window.__tr.cells), drawn };
    });
    await ev(() => { Lull.app.frameStep = null; Lull.app.settings.trainExplain = false; });
    check('a good move\'s word with Explanation on: at the cells it was set, calmer (shorter, the accent), kept', !!gd && gd.good && !!gd.word && !gd.bad && !gd.back && gd.same && gd.dur < 1 && gd.drawn > 20, JSON.stringify(gd));
    await page.waitForTimeout(900);

    // The music plays straight on through the way back: never stopped, restarted or rewound.
    await ev(() => window.__tr.stack());
    await page.waitForTimeout(250);
    const mu = await ev(() => new Promise((done) => {
      const M = Lull.Music, m = Lull.app.modes.play, calls = [];
      Lull.app.settings.music = true;
      const spy = ['start', 'stop', 'rewind'].map((k) => { const f = M[k]; M[k] = function () { calls.push(k); return f.apply(this, arguments); }; return [k, f]; });
      const was = { playing: true, tempo: M.tempo };
      M.playing = true;
      window.__tr.set('poor');
      const seen = [];
      const tick = () => {
        seen.push({ playing: M.playing, tempo: M.tempo, back: !!m.ctl.back });
        if (m.ctl.back || seen.length < 5) { requestAnimationFrame(tick); return; }
        for (const [k, f] of spy) M[k] = f;
        M.playing = false; Lull.app.settings.music = false;
        let jump = 0;
        for (let i = 1; i < seen.length; i++) jump = Math.max(jump, Math.abs(seen[i].tempo - seen[i - 1].tempo));
        done({ calls, frames: seen.length, backFrames: seen.filter((x) => x.back).length, playing: seen.every((x) => x.playing), jump: +jump.toFixed(4), was });
      };
      requestAnimationFrame(tick);
    }));
    check('the music through the way back: still playing, never stopped, restarted or rewound, its tempo with no jump', mu.calls.length === 0 && mu.playing && mu.backFrames >= 10 && mu.jump < 0.02, JSON.stringify(mu));
    const kept2 = await ev(() => { const m = Lull.app.modes.play; window.__tr.set('best'); const T = Lull.Training.of(m.game); return { back: !!m.ctl.back, tries: T.tries, hint: !!Lull.Training.hintOf(T, Lull.app.settings), placed: T.placed, first: T.first, bar: document.getElementById('itembar').textContent }; });
    check('the best spot set: kept, the hint gone, placed (not at the first try)', !kept2.back && kept2.tries === 0 && !kept2.hint && kept2.placed === 3 && kept2.first === 2 && /67% first try/.test(kept2.bar), JSON.stringify(kept2));

    // Nothing of it counted. (A couple of seconds of play went by: no time either.)
    await page.waitForTimeout(1300);
    await ev(() => { Lull.app.modes.play.syncCounters(); Lull.app.saveNow(); });
    const after2 = await ledger(ev);
    check('nothing counted: Stats, bests, past boards, the day, the time, achievements, the wallet, Classic\'s game, the hints', after2 === before, diff(before, after2));
    // The end card: its counters, Play again (not counted either).
    await ev(() => { const m = Lull.app.modes.play, g = m.game; for (let y = 0; y < g.h - 1; y++) for (let x = 0; x < g.w; x++) if (x !== y % g.w) g.board.set(x, y, 3); g.over = true; m.onTopout(true); });
    await page.waitForTimeout(100);
    const card = await ev(() => ({ h: document.querySelector('#play-overlay .card h2').textContent, sum: (document.querySelector('#play-overlay .card .tr-sum') || {}).textContent, sub: (document.querySelector('#play-overlay .card .cl-sub') || {}).textContent }));
    check('the end card: Game over, not counted, its counters', card.h === 'Game over' && /not counted/.test(card.sub) && /3 placed · 67% first try · [4-7] rewinds/.test(card.sum || ''), JSON.stringify(card));
    await page.click('#cl-again');
    await page.waitForTimeout(150);
    const again = await ev(() => { const m = Lull.app.modes.play, T = Lull.Training.of(m.game); return { mode: m.game.recipe.mode, placed: T.placed, over: m.game.over, started: Lull.Classic.of(m.game).started }; });
    const after3 = await ledger(ev);
    check('Play again: a new Training game, started; still nothing counted', again.mode === 'training' && again.placed === 0 && !again.over && again.started && after3 === before, JSON.stringify(again) + ' ' + diff(before, after3));

    // Continue: Classic played in between, then Training resumed exactly.
    await ev(() => { const m = Lull.app.modes.play; window.__tr.stack(); });
    await page.waitForTimeout(200);
    await ev(() => window.__tr.set('poor'));
    await page.waitForTimeout(1000);
    const tr = await ev(() => { const m = Lull.app.modes.play; m.ctl.setPause(true); return { json: window.__tr.state(), T: JSON.stringify(Object.assign({}, Lull.Training.of(m.game), { back: undefined, ranked: undefined, rankedFor: undefined })) }; });
    await ev(() => Lull.app.modes.play.openMenu('classic'));
    await page.waitForTimeout(150);
    await page.click('.mn-foot .mn-continue');
    await page.waitForTimeout(150);
    const cl = await ev(() => ({ mode: Lull.app.modes.play.game.recipe.mode, json: JSON.stringify(Lull.app.modes.play.game.toJSON()) }));
    await ev(() => Lull.app.modes.play.openMenu('training'));
    await page.waitForTimeout(150);
    const prog = await ev(() => (document.querySelector('.mn-foot .mn-continue') || {}).textContent);
    await page.click('.mn-foot .mn-continue');
    await page.waitForTimeout(150);
    const back = await ev(() => { const m = Lull.app.modes.play; return { mode: m.game.recipe.mode, json: window.__tr.state(), T: JSON.stringify(Object.assign({}, Lull.Training.of(m.game), { back: undefined, ranked: undefined, rankedFor: undefined })), card: document.querySelector('#play-overlay .card h2').textContent }; });
    check('Continue: Classic\'s own game in between, then Training exactly as left (its turn, tries and counters)', cl.mode === 'classic' && cl.json === classicJSON && back.mode === 'training' && back.json === tr.json && back.T === tr.T && back.card === 'Paused' && /Continue/.test(prog || ''), JSON.stringify({ cl: cl.mode, same: cl.json === classicJSON, mode: back.mode, json: back.json === tr.json, T: back.T === tr.T, card: back.card, prog }));
    // Not in the Custom window's modes.
    await ev(() => Lull.app.modes.play.openNewBoard());
    await page.waitForTimeout(150);
    await page.click('.modal-newboard [data-tab="mode"]').catch(() => {});
    const modes = await ev(() => [...document.querySelectorAll('.modal-newboard .nb-mode')].map((b) => b.dataset.value));
    check('the Custom window offers no Training mode', modes.length >= 3 && !modes.includes('training'), modes.join());
    await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); });
    await D.ctx.close();
  }

  // ---- four sizes, both themes (and reduced motion): the bar, the setup, the way back, the hint, the explanation -------
  const sizes = [[320, 568, true], [390, 844, true], [520, 760, false], [900, 700, false]];
  const shot = async (P, name) => { if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, name) }); };
  for (const [w, hh, touch] of sizes) {
    for (const theme of ['light', 'dark']) {
      const reduced = theme === 'light' && w === 390;
      const P = await open(w, hh, { theme, touch, reduced });
      const tag = w + 'x' + hh + '-' + theme;
      await P.ev(() => { const st = Lull.app.settings; st.trainStrict = 'standard'; st.trainHint = 3; st.trainExplain = false; Lull.app.modes.play.nextSeed = 11; Lull.app.modes.play.openMenu('training'); });
      await P.page.waitForTimeout(200);
      const su = await P.ev(() => {
        const R = (e) => e.getBoundingClientRect(), menu = R(document.querySelector('.modal-menu'));
        const btns = [...document.querySelectorAll('.tr-coach button')].map(R);
        return { sideways: document.documentElement.scrollWidth > innerWidth || btns.some((r) => r.left < menu.left - 0.5 || r.right > menu.right + 0.5), minH: Math.round(Math.min(...btns.map((r) => r.height))), n: btns.length };
      });
      check('Training setup at ' + w + ' × ' + hh + ' ' + theme + ': the coach whole, nothing sideways' + (touch ? ', 44 px targets' : ''), su.n === 9 && !su.sideways && (!touch || su.minH >= 44), JSON.stringify(su));
      // (The coach in sight: the setup scrolled down to it where it does not all fit.)
      await P.ev(() => document.querySelector('.tr-coach').scrollIntoView({ block: 'end' }));
      await shot(P, 'training-setup-' + tag + '.png');
      await P.ev(() => document.querySelector('.mn-foot .mn-start').click());
      await P.page.waitForTimeout(150);
      await P.ev(() => { Lull.app.modes.play.ctl.go(); window.__tr.stack(); });
      await P.page.waitForTimeout(250);
      // The way back, held still part way (the frame step a test can set) for its picture.
      const was = await P.ev(() => window.__tr.state());
      await P.ev(() => { Lull.app.frameStep = 0.0001; window.__tr.set('poor'); });
      await P.page.waitForTimeout(80);
      const way = await P.ev(() => { const b = Lull.app.modes.play.ctl.back; if (b && !b.reduced) b.t = 0.12; if (b && b.reduced) b.t = 0.04; Lull.app.modes.play.view.dirty = true; return b ? { reduced: b.reduced, due: b.due } : null; });
      await P.page.waitForTimeout(80);
      await shot(P, 'training-rewind-' + tag + '.png');
      await P.ev(() => { Lull.app.frameStep = null; });
      await P.page.waitForTimeout(1000);
      const restored = await P.ev((was) => ({ same: window.__tr.state() === was, back: !!Lull.app.modes.play.ctl.back }), was);
      check('the way back at ' + w + ' × ' + hh + ' ' + theme + (reduced ? ' (reduced motion: at once, a flash)' : ' (the piece goes back up)') + ', then the game as it was',
        !!way && way.reduced === reduced && !way.due && restored.same && !restored.back, JSON.stringify({ way, restored }));
      // The hint (two more poor sets), then the explanation over it.
      for (let k = 0; k < 2; k++) { await P.ev(() => window.__tr.set('poor')); await P.page.waitForTimeout(1000); }
      const lay = await P.ev(() => {
        const R = (e) => e.getBoundingClientRect(), bar = R(document.getElementById('itembar')), tabs = R(document.getElementById('tabs'));
        const kids = [...document.querySelectorAll('#itembar button, #itembar .tr-label')].map(R);
        const phone = innerWidth <= 500, T = Lull.Training.of(Lull.app.modes.play.game);
        return {
          hint: !!Lull.Training.hintOf(T, Lull.app.settings), clear: !phone || bar.bottom <= tabs.top + 0.5, inside: kids.every((r) => r.left >= bar.left - 0.5 && r.right <= bar.right + 0.5 && r.bottom <= bar.bottom + 0.5),
          sideways: document.documentElement.scrollWidth > innerWidth, minH: Math.round(Math.min(...[...document.querySelectorAll('#itembar button')].map((b) => R(b).height))), bar: document.getElementById('itembar').textContent,
        };
      });
      check('Training at ' + w + ' × ' + hh + ' ' + theme + ': the hint at 3 tries, the bar whole and clear of the tab bar, nothing sideways' + (touch ? ', 40 px+ targets' : ''),
        lay.hint && lay.clear && lay.inside && !lay.sideways && (!touch || lay.minH >= 40) && /3 rewinds/.test(lay.bar), JSON.stringify(lay));
      await shot(P, 'training-hint-' + tag + '.png');
      // Explanation's moment at the set piece, held mid-fade for its picture (reduced motion: the still fade).
      await P.ev(() => { const st = Lull.app.settings; st.trainExplain = true; st.trainHint = 5; Lull.app.frameStep = 0.0001; window.__tr.set('poor'); });
      await P.page.waitForTimeout(80);
      const sp = await P.ev(() => { const c = Lull.app.modes.play.ctl; if (c.spark) c.spark.t = c.spark.reduced ? 0.25 : 0.42; if (c.back && !c.back.reduced) c.back.t = 0.2; Lull.app.modes.play.view.dirty = true; return c.spark ? { word: c.spark.word, reduced: c.spark.reduced, steps: c.back ? c.back.steps.length : -1 } : null; });
      await P.page.waitForTimeout(80);
      await shot(P, 'training-explain-' + tag + '.png');
      check('Explanation at ' + w + ' × ' + hh + ' ' + theme + ': at the set piece' + (reduced ? ', still (no way back drawn)' : ''), !!sp && !!sp.word && sp.reduced === reduced && (reduced ? sp.steps === 0 : sp.steps >= 2), JSON.stringify(sp));
      await P.ev(() => { Lull.app.frameStep = null; });
      await P.page.waitForTimeout(1600);
      await P.ev(() => { const st = Lull.app.settings; st.trainExplain = false; st.trainHint = 3; Lull.app.store.touch(); });
      await P.ctx.close();
    }
  }
  check('no page errors (training)', errors.length === 0, errors.slice(0, 4).join('\n'));
};

/** The first place two ledgers part (for the message). */
function diff(a, b) {
  const x = JSON.parse(a), y = JSON.parse(b);
  for (const k of Object.keys(x)) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) return k + ': ' + JSON.stringify(x[k]).slice(0, 300) + ' → ' + JSON.stringify(y[k]).slice(0, 300);
  return '';
}
