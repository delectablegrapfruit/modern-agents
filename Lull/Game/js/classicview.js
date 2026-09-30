// Lull — Classic in Free Play (js/classic.js has its rules): the controller that makes a Classic board fall, pause and
// top out, its bar under the board, and its settings in the New board window's Mode tab.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Classic, UI, Chain, Library, Pieces, fmtInt, fmtLines, fmtDuration } = L;
  if (!Recipe || !Classic || !UI) return;
  const { h } = UI;
  const ico = UI.icon;
  const { LINE } = L;

  // The classic top out: after the piece that could not appear, this many more from the queue pile up on it, PILE_GAP
  // seconds apart; the card comes PILE_REST seconds after the last.
  const PILE_MORE = 3, PILE_GAP = 0.42, PILE_REST = 0.55;
  const MOVES = /^(moveL|moveR|rotate|rotateInv|cw|ccw|r180)$/;

  /**
   * A Classic board's controller (composed over the plain one: Recipe.compose). It waits at a card until Space, a tap
   * or Start; then pieces fall by the level's gravity and set after the lock delay. Away (another tab, window or
   * app, the pointer gone with Pause when the pointer leaves, rolled up) it pauses at a card; a window over it only
   * holds it. Its clock (C.ms) runs only while it falls.
   */
  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const K = () => play.game.recipe.classic;
    const C = () => Classic.of(play.game);
    const cs = () => app.store.state.stats.classic;
    const level = () => Classic.levelOf(K(), C().lines);

    return {
      id: 'classic', timeKey: 'classic',
      paused: true, pile: null, acc: 0, lockT: 0, resets: 0, newBest: false,

      attach(game) {
        Object.assign(this, { paused: true, pile: null, acc: 0, lockT: 0, resets: 0, newBest: false });
        play.view.noGhost = !K().ghost;
        play.view.pileup = null; play.view.queueSkip = 0;
        if (game.over) return;
        // Play again (the end card's button, or Space there): the next board starts at once.
        if (play.playAgain) { play.playAgain = false; this.go(); } else this.showWait();
      },
      detach() {
        this.finishPile({ quiet: true, noCard: true });
        play.view.noGhost = false;
        play.view.pileup = null; play.view.queueSkip = 0;
        if (L.Music && L.Music.playing) L.Music.stop();
      },

      /** Falling now: the Play tab in front, nothing over the board, started, not paused, not over. */
      running() {
        const G = g(), c = C();
        return !!G && !!c && app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen() && !play.cardOpen && !play.fullView && !document.hidden
          && c.started && !this.paused && !this.pile && !G.over;
      },
      blocked() { const c = C(); return this.paused || !(c && c.started) || !!this.pile; },
      tapStarts() { return (this.paused || !C().started) && !this.pile && !g().over && !UI.modalOpen(); },
      counts() { return this.running(); },

      /** The card it waits at: Start before the first piece falls, then Paused (Resume). Edit rules from either. */
      showWait() {
        const c = C(), first = !c.started, k = K();
        const lbl = Recipe.label(g().recipe) || 'Classic';
        play.showCard([
          h('h2', null, first ? 'Classic' : 'Paused'),
          h('p', { class: 'cl-sub' }, lbl.replace(/^Classic · /, '').replace(/^Classic /, 'Game ')),
          first && cs().best ? h('p', null, 'Best ', h('span', { class: 'big' }, fmtInt(cs().best))) : null,
          k.type === 'b' ? h('p', null, 'Clear ' + Classic.B_LINES + ' lines') : null,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => play.openEditRules(app.store.state.boards.cur) }, ico('settings'), 'Edit rules'),
            h('button', { class: 'btn primary', id: 'cl-go', onclick: () => this.go() }, first ? 'Start ' : 'Resume ', h('kbd', null, 'Space'))),
        ], 'cl-wait');
      },
      /** Play again: this board is retired (as Retire does) and the next, of the same rules, starts at once. */
      again(kind) {
        play.playAgain = true;
        play.newBoard(kind);
        play.playAgain = false;
      },
      /** Starts or resumes. */
      go() {
        const c = C();
        if (!c || g().over) return;
        if (!c.started) { c.started = true; if (c.from == null) c.from = g().s.lines; if (L.Music) L.Music.rewind(); }
        this.paused = false;
        this.acc = 0;
        play.hideCard();
        play.renderItems();
        app.store.touch();
      },
      setPause(on) {
        if (!C().started || g().over) return;
        this.paused = on;
        if (on) this.showWait(); else play.hideCard();
        play.renderItems();
      },
      pause(why) {
        if (why === 'modal') return;
        if (this.pile && !this.pile.done) { this.finishPile({ quiet: true }); return; }
        if (!this.paused && C() && C().started && !g().over) this.setPause(true);
        if (L.Music && L.Music.playing) L.Music.stop();
      },

      /** Keys and taps before the game's own: Space or P starts and resumes, P pauses; a hard drop may be off. */
      gate(act, rep) {
        const G = g();
        if (G.over) {
          const piling = this.pile && !this.pile.done;
          // During the top out, Space or P goes straight to the card; at the card, Space plays again (never a second
          // Space right after the drop that ended it: the set grace).
          if (piling && !rep && (act === 'drop' || act === 'pause')) { if (act === 'pause' || !play.settling('drop')) this.finishPile(); return true; }
          if (!piling && act === 'drop' && !rep && play.cardOpen && !play.settling('drop')) { this.again(G.endKind || 'full'); return true; }
          return undefined;
        }
        if (this.paused || !C().started) {
          if (!rep && (act === 'drop' || act === 'pause')) { this.go(); return true; }
          return false;
        }
        if (act === 'pause') { if (!rep) this.setPause(true); return true; }
        if (act === 'drop' && !K().drop) return false;
        return undefined;
      },

      frame(now, dt) {
        const G = g(), p = G.piece, c = C();
        if (this.pile && !this.pile.done) this.pileFrame(dt);
        // A piece with no room where it is (a stack changed under it): the classic top out.
        else if (this.running() && p && !G.fitsAt(p, p.rot, p.x, p.y)) { G.over = true; G.emit('topout'); }
        else if (this.running() && p) {
          c.ms += dt * 1000; // running time only, never paused time
          if (c.ms >= 60000) this.countGame();
          this.acc += dt;
          // (gravityFor: a test's own seconds a row.)
          const iv = typeof this.gravityFor === 'function' ? this.gravityFor() : Classic.gravity(level());
          while (this.acc >= iv) {
            this.acc -= iv;
            if (G.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; p.lastRot = false; if (K().lock !== 'nes') this.lockT = 0; play.view.dirty = true; } else { this.acc = 0; break; }
          }
          if (G.piece === p && !G.fitsAt(p, p.rot, p.x, p.y - 1)) {
            this.lockT += dt;
            // Modern: half a second, renewed by moving or turning; NES: it sets on the next row's time.
            if (this.lockT >= (K().lock === 'nes' ? iv : Classic.LOCK.delay)) { this.lockT = 0; G.lock(); }
          }
        }
        this.syncMusic();
      },

      syncMusic() {
        const M = L.Music;
        if (!M) return;
        const st = app.settings, G = g();
        const want = !!st.music && K().music !== 'off' && this.running() && !document.hidden;
        // Steady tempo; it only quickens as the stack nears the top (and eases back when it comes down).
        const hgt = G.board.stackHeight(), danger = Math.max(0, Math.min(1, (hgt - 0.55 * G.h) / (0.3 * G.h)));
        const target = 1 + 0.3 * danger;
        M.tempo += (target - M.tempo) * 0.05;
        if (Math.abs(target - M.tempo) < 0.002) M.tempo = target;
        M.setVolume(st.musicVolume);
        if (L.Announcer) L.Announcer.setVolume(st.announcerVolume != null ? st.announcerVolume : 0.35);
        if (want && !M.playing) M.start();
        else if (!want && M.playing) M.stop();
      },

      /** Moving or turning a resting piece buys it more time (modern lock: up to 15 times). */
      afterAction(a) {
        const G = g(), p = G.piece;
        if (!p || !MOVES.test(a) || K().lock === 'nes') return;
        if (!G.fitsAt(p, p.rot, p.x, p.y - 1) && this.resets < Classic.LOCK.resets) { this.lockT = 0; this.resets++; }
      },

      /** Soft drop: a row a press (one point a row); ↓ on the stack sets the piece, a held ↓ never does. */
      softDrop(rep) {
        const G = g(), p = G.piece;
        if (!p) return false;
        if (G.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; p.lastRot = false; G.s.score += 1; this.acc = 0; play.renderStatus(); return true; }
        if (rep) return false;
        G.lock();
        return true;
      },

      /** A game counts as played once it has run a minute or cleared ten lines. */
      countGame() {
        const c = C();
        if (c.counted) return;
        c.counted = true;
        cs().games++;
        app.store.touch();
      },

      onLock(r) {
        const st = app.store, S = cs(), G = g(), c = C(), k = K();
        const info = r.classic || { before: level(), level: level() };
        this.resets = 0; this.lockT = 0; this.acc = 0;
        // What a lock banks (never its score): seven tenths of a Standard line a row (Chain.CLASSIC.rate), by the board's
        // worth, times the back-to-back streak (×0.05 a link, ×1.5 at most); an unrated board has no streak.
        const mult = G.rules.rated ? Chain.mult(Chain.streak(G), 'classic') : 1;
        G.s.mult = mult;
        if (r.lines) {
          r.mult = mult;
          r.banked = Library.bank((r.own != null ? r.own : r.lines) * Library.worth(G) * Chain.CLASSIC.rate * mult);
          if (r.banked) { st.addLines(r.banked, 'play'); G.s.banked = Library.bank((G.s.banked || 0) + r.banked); }
          app.refreshWallet(true);
          S.lines += r.lines;
        }
        if (c.lines >= 10) this.countGame();
        S.pieces++;
        st.day().pieces++;
        L.Modes.playLockSound(app.sound, r);
        play.view.onLock(r, play.reduced);
        const set = app.settings;
        if (set.announcer !== false && set.sound && L.Announcer) {
          const say = L.Announcer.phrase(r, info.level > info.before && info.level);
          if (say) L.Announcer.say(say);
        }
        if (info.level > info.before) {
          app.sound.play('solve');
          const b = play.fxLay().board;
          play.view.fx.text('LEVEL ' + info.level, b.x + b.w / 2, b.y + b.h * 0.3, '#ffe28a', 20);
        }
        // The records and the achievements count on a board where the feats count (Normal shapes, 10 wide or more).
        const feats = !!G.rules.feats, fl = Classic.featLevel(k, c.lines);
        if (feats) {
          S.bestLevel = Math.max(S.bestLevel, fl);
          S.bestLines = Math.max(S.bestLines, c.lines);
          if (r.lines >= 4) st.day().tetris = 1;
        }
        play.renderStatus();
        st.touch();
        if (feats) app.achieve({ mode: 'classic', r, g: G, score: G.s.score, level: fl, lines: c.lines, tetrises: c.tetrises, ms: c.ms });
      },

      /** The end: topped out ('full': the classic pile first) or B type's lines cleared ('cleared'). */
      onEnd(kind, silent) {
        const S = cs(), G = g();
        if (!silent) {
          this.newBest = G.rules.feats && G.s.score > S.best;
          if (G.rules.feats) S.best = Math.max(S.best, G.s.score);
          app.store.touch();
          if (app.saveNow) app.saveNow();
        }
        play.renderItems();
        if (kind === 'full' && !silent && G.piece) { this.startPile(); return; }
        this.showEnd(kind);
      },
      showEnd(kind) {
        play.showCard((this.cards[kind] || this.cards.full)(play, kind), 'topout cl-over');
      },
      cards: {
        full(pm, kind) {
          const ctl = pm.ctl, G = pm.game, c = Classic.of(G), lv = Classic.levelOf(G.recipe.classic, c.lines), cleared = kind === 'cleared';
          return [
            h('h2', null, cleared ? 'Cleared' : ctl.newBest ? 'New best' : 'Game over'),
            h('p', null, h('span', { class: 'big' }, fmtInt(G.s.score)), ' points'),
            h('p', null, cleared ? Classic.B_LINES + ' lines in ' + fmtDuration(Math.max(1000, c.ms)) : 'Level ' + lv + ' · ' + c.lines + ' lines'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', onclick: () => pm.openLibrary() }, ico('boards'), 'Boards'),
              h('button', { class: 'btn primary', id: 'cl-again', onclick: () => ctl.again(cleared ? 'cleared' : 'full') }, ico('retire'), 'Play again')),
          ];
        },
      },

      /**
       * The classic top out: the piece that could not appear sets where it appears, over the stack, and the next few
       * from the queue appear one after another at the same spot, each over the last. The board is never touched: the
       * pile is only drawn (BoardView.pileup). Under reduced motion it is all there at once.
       */
      startPile() {
        const G = g(), steps = [];
        const add = (type, rot, x, y) => steps.push({ color: type.color, cells: type.rots[rot].map(([cx, cy]) => [G.board.wx(x + cx), y + cy]).filter(([, cy]) => cy >= 0 && cy < G.h) });
        if (G.piece) add(G.piece.type, G.piece.rot, G.piece.x, G.piece.y);
        for (const e of G.queue.slice(0, PILE_MORE)) {
          const type = Pieces.get(e.id);
          if (!type) continue;
          const rot = e.rot || 0, pos = G.spawnPosition(type, rot);
          add(type, pos.rot != null ? pos.rot : rot, pos.x, pos.y);
        }
        this.pile = { steps, shown: 0, t: 0, done: false, fromQueue: steps.length - (G.piece ? 1 : 0), quietFirst: play.now() - (play.setAt || -1e9) < 150 };
        play.view.pileup = [];
        play.view.queueSkip = 0;
        if (play.reduced) { this.finishPile(); return; }
        this.pileFrame(0);
      },
      pileStep(quiet) {
        const P = this.pile, s = P.steps[P.shown++];
        play.view.pileup.push({ cells: s.cells, color: s.color, t: quiet ? -1 : P.t });
        play.view.queueSkip = Math.max(0, P.shown - (P.steps.length - P.fromQueue));
        if (!quiet && !(P.shown === 1 && P.quietFirst)) app.sound.play('lock');
        play.view.dirty = true;
      },
      pileFrame(dt) {
        const P = this.pile;
        P.t += dt;
        while (P.shown < P.steps.length && P.t >= P.shown * PILE_GAP) this.pileStep();
        play.view.pileT = P.t;
        play.view.dirty = true;
        if (P.shown >= P.steps.length && P.t >= (P.steps.length - 1) * PILE_GAP + PILE_REST) this.finishPile();
      },
      /** The top out's end, now: the whole pile, the game over sound and call (unless quiet), and the card. */
      finishPile(o) {
        const P = this.pile;
        if (!P || P.done) return;
        while (P.shown < P.steps.length) this.pileStep(true);
        P.done = true;
        play.view.pileT = Infinity;
        play.view.dirty = true;
        if (!(o && o.quiet)) {
          app.sound.play('fail');
          if (app.settings.announcer !== false && app.settings.sound && L.Announcer) L.Announcer.say(['gameover']);
        }
        if (!(o && o.noCard)) this.showEnd('full');
      },

      /** Score, Level, Lines (B type: the lines left), the Bank's multiplier and the Best. */
      status(parts, o) {
        const G = g(), c = C(), k = K(), stat = o.stat, m = G.s.mult || 1, S = cs();
        return [
          stat('Score', fmtInt(G.s.score)),
          stat('Level', String(level())),
          k.type === 'b' ? stat('Left', String(Math.max(0, Classic.B_LINES - c.lines))) : stat('Lines', fmtInt(c.lines)),
          stat('Bank', Chain.fmt(m), m > 1 ? 'chain opt' : 'slot-off', this.bankTip(m)),
          stat('Best', fmtInt(Math.max(S.best, G.rules.feats ? G.s.score : 0)), 'opt'),
        ];
      },
      bankTip(m) {
        const R = Chain.CLASSIC;
        return 'Each line banks ' + fmtLines(R.rate) + ' ' + LINE + '; back-to-back multiplies it, up to ' + Chain.fmt(R.cap) +
          (m > 1 ? '. Now ' + Chain.fmt(m) + ': ' + fmtLines(Library.bank(R.rate * m)) + ' ' + LINE + ' a line' : '');
      },

      /** The bar under the board: Music and Pause (no power-ups in Classic). */
      bar(el) {
        const st = app.settings, off = K().music === 'off', G = g(), c = C();
        el.replaceChildren(
          h('button', { class: 'btn sm' + (st.music && !off ? ' on' : ''), 'aria-label': 'Music', 'aria-pressed': String(!!st.music && !off), 'aria-disabled': off ? 'true' : null, 'data-tip': off ? 'Music is off on this board' : 'Music',
            onclick: () => { if (off) return; st.music = !st.music; app.store.touch(); play.renderItems(); } }, ico(st.music && !off ? 'music' : 'musicOff'), st.music && !off ? 'On' : 'Off'),
          h('button', { class: 'btn sm', disabled: !c.started || G.over || !!this.pile, 'data-tip': this.paused ? 'Resume' : 'Pause', 'data-tip-foot': 'P', onclick: () => (this.paused ? this.go() : this.setPause(true)) },
            ico(this.paused ? 'playIcon' : 'pause'), this.paused ? 'Resume' : 'Pause'));
        el.classList.add('cl-bar');
        return true;
      },
      tiles(game) {
        const c = Classic.of(game);
        return c ? [[String(Classic.levelOf(game.recipe.classic, c.lines)), 'Level'], [fmtInt(c.tetrises), 'Tetrises']] : [];
      },
    };
  }

  // ---- the New board window's Mode tab: Classic's settings ------------------------------------------------------------

  const seg = (label, kids) => h('div', { class: 'cl-row' }, h('span', { class: 'cl-nm' }, label), h('div', { class: 'seg cl-seg', role: 'group', 'aria-label': label }, kids));

  Recipe.uiPart({
    key: 'classic', order: 45, mode: 'classic', name: 'Classic',
    levels: () => ({ path: 'classic.type', values: [['a', 'A type: endless'], ['b', 'B type: ' + Classic.B_LINES + ' lines']] }),
    tab: 'mode',
    panel(r, api) {
      if (!Classic.on(r)) return null;
      const k = r.classic, opt = api.option;
      const step = (path, v, lo, hi, label) => h('div', { class: 'cl-row' }, h('span', { class: 'cl-nm' }, label),
        h('div', { class: 'nb-stepper cl-step' },
          h('button', { type: 'button', class: 'icon-btn nb-step', 'data-focus': path + '-', 'aria-label': 'Lower ' + label.toLowerCase(), 'aria-disabled': String(v <= lo), html: L.Icons.icon('minus'), onclick: () => { if (v > lo) api.choose(path, v - 1); } }),
          h('div', { class: 'nb-val', role: 'spinbutton', tabindex: '0', 'data-focus': path, 'aria-label': label, 'aria-valuemin': String(lo), 'aria-valuemax': String(hi), 'aria-valuenow': String(v),
            onkeydown: (e) => { const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (!by) return; e.preventDefault(); e.stopPropagation(); const n = Math.max(lo, Math.min(hi, v + by)); if (n !== v) api.choose(path, n); } }, String(v)),
          h('button', { type: 'button', class: 'icon-btn nb-step', 'data-focus': path + '+', 'aria-label': 'Raise ' + label.toLowerCase(), 'aria-disabled': String(v >= hi), html: L.Icons.icon('plus'), onclick: () => { if (v < hi) api.choose(path, v + 1); } })));
      const sw = (path, label) => opt(path, !R0(r, path), 'nb-switch cl-sw', [h('span', { class: 'nm' }, label), h('span', { class: 'sw', 'aria-hidden': 'true' })], 'switch');
      const nums = (path, n) => Array.from({ length: n + 1 }, (_, i) => opt(path, i, 'nb-level', String(i)));
      return h('div', { class: 'cl-set' },
        step('classic.level', k.level, Classic.LEVELS[0], Classic.LEVELS[1], 'Start level'),
        k.type === 'b' ? seg('Garbage height', nums('classic.height', Classic.HEIGHTS)) : null,
        seg('Next', nums('classic.next', Classic.NEXT)),
        seg('Randomizer', [opt('classic.rand', 'bag', 'nb-level', '7-bag'), opt('classic.rand', 'nes', 'nb-level', 'NES random')]),
        seg('Lock delay', [opt('classic.lock', 'modern', 'nb-level', 'Modern'), opt('classic.lock', 'nes', 'nb-level', 'NES')]),
        seg('Music', Classic.MUSIC.map((m) => opt('classic.music', m, 'nb-level', Classic.MUSIC_NAMES[m]))),
        h('div', { class: 'cl-sws' }, sw('classic.drop', 'Hard drop'), sw('classic.hold', 'Hold'), sw('classic.ghost', 'Ghost')));
    },
    said(path, v) {
      const names = { 'classic.level': 'Start level ', 'classic.height': 'Garbage height ', 'classic.next': 'Next ' };
      if (names[path]) return names[path] + v;
      if (path === 'classic.drop') return 'Hard drop ' + (v ? 'on' : 'off');
      if (path === 'classic.hold') return 'Hold ' + (v ? 'on' : 'off');
      if (path === 'classic.ghost') return 'Ghost ' + (v ? 'on' : 'off');
      if (path === 'classic.rand') return v === 'nes' ? 'NES random' : '7-bag';
      if (path === 'classic.lock') return v === 'nes' ? 'NES lock' : 'Modern lock';
      if (path === 'classic.music') return 'Music ' + (Classic.MUSIC_NAMES[v] || v);
      return null;
    },
    tags: (r, x, info) => (Classic.on(r) && info && info.ended === 'cleared' ? [{ text: 'Cleared', cls: 'full cleared' }] : []),
    tiles: (ext) => (ext && ext.level != null ? [[String(ext.level), 'Level'], [fmtInt(ext.tetrises), 'Tetrises']] : []),
    endName: (reason) => (reason === 'cleared' ? 'Cleared' : null),
  });
  const R0 = (r, path) => !!Recipe.getPath(r, path);

  L.ClassicView = { controller, PILE_MORE, PILE_GAP, PILE_REST };
})(typeof globalThis !== 'undefined' ? globalThis : this);
