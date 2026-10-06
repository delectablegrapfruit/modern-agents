// Patterns (js/patterns.js, js/patternsview.js), in the page: Style in the Training setup (Per move, Patterns) and
// Patterns' own settings (Notes, Detail, Advanced notes), kept over a reload; play that never stops or goes back; the
// fit strip (lit by the detector's clean spots, a piece's spots outlined on the board when pointed at); a note at the
// cells it is about, gone in about two seconds, paced (Often: never two within two pieces) and on its learning curve
// (kept in the save); the Guide (the bar's Guide and G; the game held while it is open and going again when it
// closes; opened on the last note's card; every card's four diagrams drawn; the index by group, met shapes dotted;
// arrows); the player's record (a line a game) and the end card's; nothing counted; Per move as before. Then four sizes
// in both themes (reduced motion: a still note): the bar whole and clear of the phones' tab bar, the board as large as
// in Per move, the Guide inside the window, and pictures of play with a note and the fit strip, the Guide's index and a
// card (OUT, or the folder in PATTERNS_SHOTS).
// Run by browser-test.cjs: require('./patterns-test.cjs')({ browser, check, PAGE, OUT }).
'use strict';
const path = require('path');

module.exports = async function patternsTests({ browser, check, PAGE, OUT }) {
  console.log('patterns');
  const SHOTS = process.env.PATTERNS_SHOTS || OUT;
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
  /** The page made ready, and its helpers: a built stack, a piece dropped at a column, pixels changed by a step. */
  const install = (ev, theme) => ev((theme) => {
    while (Lull.UI.modalOpen()) Lull.UI.closeTopModal();
    Lull.app.settings.theme = theme; Lull.app.applySettings();
    Lull.app.store.state.settings.hints = false; Lull.app.hints.sync();
    Lull.app.modes.play.setGrace = 0;
    window.__pt = {
      /** A stack from rows (bottom first: each a string of '#' and '.'), the turn taken again as it is. */
      stack(rows) {
        const m = Lull.app.modes.play, g = m.game;
        g.board.cells.fill(0);
        rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') g.board.set(x, y, 8); }));
        Lull.Training.newTurn(Lull.Training.of(g), Lull.Training.snap(g));
        m.ctl.fit = Lull.PatternsView.fitsNow(g);
        m.renderItems();
        m.view.dirty = true;
      },
      /** The piece in play made `id` (turn rot), its leftmost cell at column col, hard dropped by the board's own action. */
      drop(id, col, rot) {
        const m = Lull.app.modes.play, g = m.game, t = Lull.Pieces.get(id), r = rot || 0, b = t.rotBounds[r];
        g.piece = { type: t, rot: r, x: col - b.minX, y: g.h - 1 - b.maxY, special: null, entry: { id, rot: 0 }, lastRot: false };
        const T = Lull.Training.of(g); T.turn.piece = { entry: { id, rot: 0, special: null }, rot: r, x: g.piece.x, y: g.piece.y };
        return m.action('drop');
      },
      diffIn(boxes, fn) {
        const m = Lull.app.modes.play, cv = document.getElementById('cv-play'), ctx = cv.getContext('2d'), k = cv.width / cv.getBoundingClientRect().width;
        const grab = () => { const fx = m.view.fx, sh = fx.shake; fx.shake = 0; m.view.dirty = true; m.view.render(1000); fx.shake = sh; return ctx.getImageData(0, 0, cv.width, cv.height).data; };
        const a = grab(); fn(); const b = grab();
        let n = 0;
        for (const [x, y, w, h] of boxes) for (let py = Math.max(0, Math.floor(y * k)); py < Math.min(cv.height, (y + h) * k); py++) for (let px = Math.max(0, Math.floor(x * k)); px < Math.min(cv.width, (x + w) * k); px++) {
          const i = (py * cv.width + px) * 4;
          if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
        }
        return n;
      },
      boardBox() { const v = Lull.app.modes.play.view, b = v.lay.board; return [b.x, b.y, b.w, b.h]; },
    };
  }, theme);
  const ledger = (ev) => ev(() => {
    const S = Lull.app.store.state, d = Object.assign({}, S.history[Lull.dateKey()] || {});
    return JSON.stringify({ classic: S.stats.classic, free: S.stats.free, time: S.stats.timeMs, lines: S.lines, ach: Object.keys(S.achievements).sort(), day: d, classicGame: S.boards.games.classic || null, hints: S.hints, combos: S.combos });
  });
  // A floor with a gap at column 4 and the well at 9: an O at 3–4 leaves a hole (and is an O on a step).
  const HOLE = ['####.####.'];

  // ---- the setup ----------------------------------------------------------------------------------------------------
  const D = await open(520, 760);
  const { page, ev } = D;
  await ev(() => Lull.app.modes.play.openMenu('training'));
  await page.waitForTimeout(150);
  const s0 = await ev(() => ({ style: [...document.querySelectorAll('.tr-coach [data-focus^="trainStyle="]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(), strict: !!document.querySelector('.tr-coach [data-focus^="trainStrict="]') }));
  check('Training setup: Style first, Per move chosen, its coach under it', s0.style === 'Per move*,Patterns' && s0.strict, JSON.stringify(s0));
  await page.click('.tr-coach [data-focus="trainStyle=patterns"]');
  const s1 = await ev(() => ({ notes: [...document.querySelectorAll('.tr-coach [data-focus^="trainNotes="]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(), detail: [...document.querySelectorAll('.tr-coach [data-focus^="trainDetail="]')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(), adv: document.querySelector('.tr-coach .pt-adv').getAttribute('aria-checked'), strict: !!document.querySelector('.tr-coach [data-focus^="trainStrict="]'), st: Lull.app.settings.trainStyle }));
  check('Patterns chosen: Notes (Sometimes), Detail (Full), Advanced notes off, in place of Per move\'s', s1.st === 'patterns' && s1.notes === 'Often,Sometimes*,Rare' && s1.detail === 'Full*,Brief' && s1.adv === 'false' && !s1.strict, JSON.stringify(s1));
  await page.click('.tr-coach [data-focus="trainNotes=rare"]');
  await page.click('.tr-coach [data-focus="trainDetail=brief"]');
  await page.click('.tr-coach .pt-adv');
  await ev(() => Lull.app.saveNow());
  await page.reload();
  await page.waitForTimeout(600);
  await install(ev, 'dark');
  const s2 = await ev(() => { const s = Lull.app.settings; return [s.trainStyle, s.trainNotes, s.trainDetail, s.trainAdvanced].join(); });
  check('Patterns\' settings kept over a reload', s2 === 'patterns,rare,brief,true', s2);
  await ev(() => { const s = Lull.app.settings; s.trainNotes = 'often'; s.trainDetail = 'full'; s.trainAdvanced = false; Lull.app.modes.play.nextSeed = 5; Lull.app.modes.play.openMenu('training'); });
  await page.waitForTimeout(150);
  // A new game (New game when one is kept).
  await ev(() => { const b = document.querySelector('.mn-foot .mn-new') || document.querySelector('.mn-foot .mn-start'); b.click(); });
  await page.waitForTimeout(200);
  await ev(() => { while (Lull.UI.modalOpen()) { const ok = document.querySelector('.modal footer .btn.primary, .modal footer .btn.danger'); if (ok) ok.click(); else Lull.UI.closeTopModal(); } });
  await page.waitForTimeout(150);
  await ev(() => Lull.app.modes.play.ctl.go());
  const before = await ledger(ev);

  // ---- the fit strip --------------------------------------------------------------------------------------------------
  // A flat floor but for the well: no S or Z has a clean spot; O does.
  await ev(() => window.__pt.stack(['#########.', '#########.']));
  await page.waitForTimeout(100);
  const fs = await ev(() => {
    const bar = document.getElementById('itembar'), b = [...bar.querySelectorAll('.pt-fit')];
    const fit = Lull.PatternsView.fitsNow(Lull.app.modes.play.game);
    return { n: b.length, dim: b.filter((x) => x.classList.contains('none')).map((x) => x.dataset.piece).join(''), want: Lull.Patterns.IDS.filter((id) => !fit[id].length).join(''), guide: !!bar.querySelector('.tr-guide'), pause: !!bar.querySelector('.tr-pause'), counters: !!bar.querySelector('.tr-ns') };
  });
  check('the fit strip: seven pieces, dimmed exactly where the detector finds no clean spot (S, Z on a flat floor); Guide and Pause by it, no counters', fs.n === 7 && fs.dim === fs.want && fs.dim === 'SZ' && fs.guide && fs.pause && !fs.counters, JSON.stringify(fs));
  await page.hover('.pt-fit[data-piece="O"]');
  await page.waitForTimeout(80);
  const hov = await ev(() => { const m = Lull.app.modes.play, c = m.ctl; const was = c.showFit; const n = window.__pt.diffIn([window.__pt.boardBox()], () => { c.showFit = null; }); c.showFit = was; return { show: was, drawn: n, spots: c.fit.O.length }; });
  check('pointed at, a piece\'s clean spots are outlined on the board', hov.show === 'O' && hov.spots > 3 && hov.drawn > 200, JSON.stringify(hov));
  await page.mouse.move(5, 5);

  // ---- a note, the pace, the curve, no way back -----------------------------------------------------------------------
  await ev((r) => window.__pt.stack(r), HOLE);
  await page.waitForTimeout(80);
  const n1 = await ev(() => {
    const m = Lull.app.modes.play, g = m.game, T = Lull.Training.of(g), pieces = g.s.pieces;
    Lull.app.frameStep = 0.0001;
    window.__pt.drop('O', 3);
    const N = m.ctl.note, v = m.view, s = v.lay.s;
    if (!N) return { none: true };
    N.t = 0.5;
    const boxes = N.e.cells.map(([x, y]) => { const [sx, sy] = v.toScreen(x, y); return [sx - s, sy - s * 2, s * 3, s * 3]; });
    const drawn = window.__pt.diffIn(boxes, () => { m.ctl.note = null; }); m.ctl.note = N;
    return { id: N.e.id, text: N.e.text, stage: N.e.stage, dur: N.dur, drawn, back: !!m.ctl.back, rewinds: T.rewinds, set: g.s.pieces - pieces, seen: Lull.app.store.state.patterns.seen[N.e.id], card: m.ctl.noteCard, holes: Lull.Patterns.analyze(Lull.Bot.rowsOf(g.board), g.w, g.h).holes.length };
  });
  check('a placement that makes a hole: kept (never taken back), a note in full at its cells, about two seconds', !n1.none && n1.set === 1 && !n1.back && n1.rewinds === 0 && n1.holes === 1 && n1.stage === 'full' && n1.text && n1.text.split(' ').length <= 4 && n1.drawn > 150 && n1.dur >= 1.8 && n1.dur <= 2.2 && n1.seen === 1 && !!n1.card, JSON.stringify(n1));
  await ev(() => { Lull.app.frameStep = null; });
  // The next piece makes another hole at once: Often keeps two pieces between notes.
  await ev((r) => window.__pt.stack(r), HOLE);
  const n2 = await ev(() => { const m = Lull.app.modes.play; m.ctl.note = null; window.__pt.drop('O', 3); return { note: !!m.ctl.note }; });
  await ev((r) => window.__pt.stack(r), HOLE);
  const n3 = await ev(() => { const m = Lull.app.modes.play; m.ctl.note = null; window.__pt.drop('O', 3); return { note: !!m.ctl.note, seen: Lull.app.store.state.patterns.seen[m.ctl.note ? m.ctl.note.e.id : 'x'] }; });
  check('Often: no note on the very next piece, one again two pieces on (the curve counts it: 2)', !n2.note && n3.note && n3.seen === 2, JSON.stringify([n2, n3]));
  await page.waitForTimeout(2300);
  const gone = await ev(() => !!Lull.app.modes.play.ctl.note);
  check('the note gone after about two seconds', !gone, String(gone));
  // The learning curve kept in the save, over a reload.
  await ev(() => Lull.app.saveNow());
  const seenKept = await ev(() => JSON.stringify(Lull.app.store.state.patterns.seen));
  // ---- the Guide ------------------------------------------------------------------------------------------------------
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  const g1 = await ev(() => {
    const m = Lull.app.modes.play, el = document.querySelector('.modal-guide'), cardEl = el && el.querySelector('.pt-card');
    const dias = el ? [...el.querySelectorAll('.pt-card canvas.pt-dia')] : [];
    const ink = dias.map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
    return { open: !!el, card: cardEl && cardEl.dataset.card, want: m.ctl.noteCard, running: m.ctl.running(), dias: dias.length, ok: dias.every((c) => c.dataset.ok === 'true'), ink: Math.min(...ink), caps: [...el.querySelectorAll('.pt-fig b')].map((b) => b.textContent.split(' ').length), cost: (el.querySelector('.pt-cost') || {}).textContent || '' };
  });
  check('G opens the Guide on the last note\'s card: four diagrams drawn from the detector, captions of four words at most, its measured cost; the game held', g1.open && g1.card === g1.want && !g1.running && g1.dias === 4 && g1.ok && g1.ink > 500 && g1.caps.every((n) => n <= 4) && /^(Cost|Gain): .*(score|stack|lines|top outs)/.test(g1.cost), JSON.stringify(g1));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(80);
  const g2 = await ev(() => { const el = document.querySelector('.modal-guide'); return { card: el.querySelector('.pt-card').dataset.card, pos: el.querySelector('.pt-pos').textContent }; });
  await page.click('.modal-guide .pt-all');
  await page.waitForTimeout(80);
  const g3 = await ev(() => {
    const el = document.querySelector('.modal-guide');
    return { groups: [...el.querySelectorAll('.pt-group h3')].map((h) => h.firstChild.textContent).join(), rows: el.querySelectorAll('.pt-row').length, met: [...el.querySelectorAll('.pt-row.met')].map((b) => b.dataset.card), mine: !!el.querySelector('.pt-mine .pt-record'), inside: el.getBoundingClientRect().right <= innerWidth + 0.5 };
  });
  check('the arrows step to the next card; All: the index by group (Risky, Good, Combinations, Advanced), met shapes dotted, your play', g2.card !== g1.card && /^\d+ of \d+$/.test(g2.pos) && /^Risky,Good,Combinations(,Advanced)?$/.test(g3.groups) && g3.rows >= 8 && g3.met.includes(g1.card) && g3.mine && g3.inside, JSON.stringify([g2, g3]));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  const g4 = await ev(() => ({ open: !!document.querySelector('.modal-guide'), running: Lull.app.modes.play.ctl.running() }));
  check('closed: the game goes on', !g4.open && g4.running, JSON.stringify(g4));
  await page.click('#itembar .tr-guide');
  await page.waitForTimeout(120);
  const g5 = await ev(() => !!document.querySelector('.modal-guide'));
  await page.keyboard.press('Escape');
  check('the bar\'s Guide opens it too', g5, String(g5));

  // ---- the record, nothing counted, the end card ---------------------------------------------------------------------
  await page.waitForTimeout(1200);
  await ev(() => { Lull.app.modes.play.syncCounters(); Lull.app.saveNow(); });
  const after = await ledger(ev);
  const rec = await ev(() => { const T = Lull.Training.of(Lull.app.modes.play.game), log = Lull.app.store.state.patterns.log; const e = log.find((x) => x.id === T.gid); return e ? { pieces: e.pieces, holes: e.holes } : null; });
  check('the record: this game\'s line (its pieces and the holes made); nothing counted (Stats, bests, the day, the time, achievements, the wallet)', rec && rec.pieces >= 3 && rec.holes >= 3 && after === before, JSON.stringify(rec) + ' ' + (after === before ? '' : 'ledger changed'));
  await ev(() => { const m = Lull.app.modes.play, g = m.game; for (let y = 0; y < g.h - 1; y++) for (let x = 0; x < g.w; x++) if (x !== y % g.w) g.board.set(x, y, 3); g.over = true; m.onTopout(true); });
  await page.waitForTimeout(150);
  const endc = await ev(() => ({ h: (document.querySelector('#play-overlay .card h2') || {}).textContent, rec: !!document.querySelector('#play-overlay .card .pt-record'), sub: (document.querySelector('#play-overlay .card .cl-sub') || {}).textContent }));
  check('the end card: not counted, the record (holes a 100 pieces, height, top outs) in place of the counters', endc.h === 'Game over' && endc.rec && /not counted/.test(endc.sub || ''), JSON.stringify(endc));
  await page.reload();
  await page.waitForTimeout(600);
  await install(ev, 'dark');
  const seenBack = await ev(() => JSON.stringify(Lull.app.store.state.patterns.seen));
  check('the learning curve kept in the save over a reload', seenBack === seenKept && seenKept !== '{}', seenBack);

  // ---- Per move as before (the same page): a poor set taken back; the Guide there too, at its index -------------------
  await ev(() => { Lull.app.settings.trainStyle = 'move'; Lull.app.modes.play.nextSeed = 9; Lull.app.modes.play.newBoard('full'); });
  await page.waitForTimeout(200);
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); const m = Lull.app.modes.play; if (!Lull.Classic.of(m.game).started || m.ctl.paused) m.ctl.go(); });
  await ev((r) => window.__pt.stack(r), HOLE);
  const pm = await ev(() => { const m = Lull.app.modes.play; window.__pt.drop('O', 3); const T = Lull.Training.of(m.game); return { back: !!m.ctl.back, rewinds: T.rewinds, note: !!m.ctl.note, strip: !!document.querySelector('#itembar .pt-strip'), guide: !!document.querySelector('#itembar .tr-guide') }; });
  check('Per move: the poor set taken back as ever, no note, no strip; the Guide on its bar', pm.back && pm.rewinds === 1 && !pm.note && !pm.strip && pm.guide, JSON.stringify(pm));
  await page.waitForTimeout(1100);
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  const pg = await ev(() => { const el = document.querySelector('.modal-guide'); return { open: !!el, index: !!(el && el.querySelector('.pt-list')), card: !!(el && el.querySelector('.pt-card')) }; });
  check('Per move: G opens the Guide at its index', pg.open && pg.index && !pg.card, JSON.stringify(pg));
  await ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.settings.trainStyle = 'move'; });
  await D.ctx.close();

  // ---- four sizes, both themes: the bar, the board's size, the note, the Guide; pictures ------------------------------
  const sizes = [[320, 568, true], [390, 844, true], [520, 760, false], [900, 700, false]];
  const shot = async (P, name) => { if (SHOTS) await P.page.screenshot({ path: path.join(SHOTS, name) }); };
  for (const [w, hh, touch] of sizes) {
    for (const theme of ['light', 'dark']) {
      const reduced = theme === 'light' && w === 390;
      const P = await open(w, hh, { theme, touch, reduced });
      const tag = w + 'x' + hh + '-' + theme;
      await P.ev(() => { const st = Lull.app.settings; st.trainStyle = 'move'; Lull.app.modes.play.nextSeed = 11; Lull.app.modes.play.openMenu('training'); });
      await P.page.waitForTimeout(150);
      await P.ev(() => { const b = document.querySelector('.mn-foot .mn-new') || document.querySelector('.mn-foot .mn-start'); b.click(); });
      await P.page.waitForTimeout(150);
      await P.ev(() => { while (Lull.UI.modalOpen()) { const ok = document.querySelector('.modal footer .btn.primary, .modal footer .btn.danger'); if (ok) ok.click(); else Lull.UI.closeTopModal(); } Lull.app.modes.play.ctl.go(); });
      await P.page.waitForTimeout(150);
      const sMove = await P.ev(() => Lull.app.modes.play.view.lay.s);
      await P.ev(() => { Lull.app.settings.trainStyle = 'patterns'; Lull.app.settings.trainNotes = 'often'; Lull.app.store.state.patterns.seen = {}; Lull.app.modes.play.renderItems(); Lull.app.onResize && Lull.app.onResize(); });
      await P.page.waitForTimeout(250);
      await P.ev(() => window.__pt.stack(['#########.', '#########.', '###.#####.', '##..#####.']));
      await P.page.waitForTimeout(100);
      const lay = await P.ev(() => {
        const R = (e) => e.getBoundingClientRect(), bar = R(document.getElementById('itembar')), tabs = R(document.getElementById('tabs'));
        const kids = [...document.querySelectorAll('#itembar button')].map(R), phone = innerWidth <= 500;
        return { s: Lull.app.modes.play.view.lay.s, clear: !phone || bar.bottom <= tabs.top + 0.5, inside: kids.every((r) => r.left >= bar.left - 0.5 && r.right <= bar.right + 0.5 && r.top >= bar.top - 0.5 && r.bottom <= bar.bottom + 0.5), rows: Math.max(...kids.map((r) => r.top)) < Math.min(...kids.map((r) => r.bottom)) ? 1 : 2, sideways: document.documentElement.scrollWidth > innerWidth, minH: Math.round(Math.min(...kids.map((r) => r.height))), fits: document.querySelectorAll('#itembar .pt-fit').length };
      });
      check('Patterns at ' + w + ' × ' + hh + ' ' + theme + ': the fit strip, Guide and Pause in one row of the bar, clear of the tab bar; the board as large as in Per move; nothing sideways' + (touch ? '; 40 px+ targets' : ''),
        lay.fits === 7 && lay.clear && lay.inside && lay.rows === 1 && Math.abs(lay.s - sMove) < 0.01 && !lay.sideways && (!touch || lay.minH >= 40), JSON.stringify(Object.assign(lay, { sMove })));
      // A note held part way, and a piece's spots in the strip, for the picture (reduced motion: the still fade).
      const nt = await P.ev(() => {
        const m = Lull.app.modes.play;
        Lull.app.frameStep = 0.0001;
        window.__pt.drop('O', 2);
        const N = m.ctl.note;
        if (N) N.t = N.reduced ? 0.3 : 0.6;
        m.ctl.showFit = 'I'; m.ctl.fitSticky = 99; m.renderItems(); m.view.dirty = true;
        return N ? { text: N.e.text, reduced: N.reduced, id: N.e.id } : null;
      });
      await P.page.waitForTimeout(100);
      await shot(P, 'patterns-play-' + tag + '.png');
      check('a note at ' + w + ' × ' + hh + ' ' + theme + (reduced ? ' (reduced motion: still)' : ''), !!nt && !!nt.text && nt.reduced === reduced, JSON.stringify(nt));
      await P.ev(() => { Lull.app.frameStep = null; const c = Lull.app.modes.play.ctl; c.fitSticky = 0; c.showFit = null; c.openGuide(); });
      await P.page.waitForTimeout(200);
      const gl = await P.ev(() => { const el = document.querySelector('.modal-guide'), r = el.getBoundingClientRect(); return { card: !!el.querySelector('.pt-card'), inside: r.left >= -0.5 && r.right <= innerWidth + 0.5, sideways: el.querySelector('.body').scrollWidth > el.querySelector('.body').clientWidth + 1 }; });
      await shot(P, 'guide-card-' + tag + '.png');
      await P.ev(() => document.querySelector('.modal-guide .pt-all').click());
      await P.page.waitForTimeout(120);
      await shot(P, 'guide-list-' + tag + '.png');
      const gi = await P.ev(() => { const el = document.querySelector('.modal-guide'); return { rows: el.querySelectorAll('.pt-row').length, sideways: el.querySelector('.body').scrollWidth > el.querySelector('.body').clientWidth + 1 }; });
      check('the Guide at ' + w + ' × ' + hh + ' ' + theme + ': on the note\'s card, then the index; inside the window, nothing sideways', gl.card && gl.inside && !gl.sideways && gi.rows >= 8 && !gi.sideways, JSON.stringify([gl, gi]));
      await P.ev(() => { while (Lull.UI.modalOpen()) Lull.UI.closeTopModal(); Lull.app.settings.trainStyle = 'move'; Lull.app.store.touch(); });
      await P.ctx.close();
    }
  }
  check('no page errors (patterns)', errors.length === 0, errors.slice(0, 4).join('\n'));
};
