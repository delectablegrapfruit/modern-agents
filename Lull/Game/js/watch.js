// Lull — Watch: a Classic game played by the bot (js/bot.js) on the Play tab, from the Classic setup's Watch button.
// It plays on the setup's rules, through the same actions a player's keys send (no piece is ever put in place by
// hand), at a player's pace. Under the board: a quiet "Watching", Mistakes (Off, Rare, Some, Often: Settings keeps it,
// and it can be changed as it plays), Pause and Take over; at the end, Play again. Take over hands the game to you
// where it stands: the bot lets go, and the game stays as it was, uncounted.
//
// A watched game is nobody's: it is never saved, never shelved in the library, and it counts toward nothing (bests,
// Stats, the day's log, achievements, lines banked). The board you were playing waits, saved as it was, and comes back
// when the watching ends (Done, the Menu, the library). Your keys, taps and the mouse do nothing to the bot's game
// but pause it, until Take over. It pauses as Classic does when Lull is left (another window, tab or app), but not when
// the pointer only wanders off: there is nothing for it to do there.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Classic, Bot, UI, fmtInt } = L;
  if (!Classic || !Bot || !UI) return;
  const { h } = UI;
  const ico = UI.icon;

  /** The Mistakes setting as saved (Settings: watchMistakes), or Off. */
  const mistakesOf = (st) => (Bot.MISTAKES[st && st.watchMistakes] ? st.watchMistakes : 'off');

  /**
   * Starts watching: the board in play is saved as it is and set aside, and a new Classic game of `recipe` (the
   * setup's rules: Normal shapes, no modifiers) at `size` comes into play with the bot at its keys.
   */
  function start(play, recipe, size) {
    const R = L.Recipe, r = R.normalize(recipe);
    if (!Classic.on(r)) return false;
    // The board you were playing, saved now and kept (a second Watch keeps the first one's).
    const saved = play.watch ? play.watch.saved : (play.syncCounters(), play.save(), play.app.store.state.free);
    play.app.store.save();
    const z = R.clampSize(size || L.Menu.firstSize('classic'), r);
    play.watch = { saved, recipe: r, size: { w: z.w, h: z.h }, free: false, acting: false, bot: null, games: (play.watch ? play.watch.games : 0) + 1 };
    play.setGame(new L.Game({ w: z.w, h: z.h, recipe: r, previewCount: play.settings.preview }));
    return true;
  }

  /** Ends watching: the bot's game goes, and the board you were playing comes back exactly as it was saved. */
  function stop(play) {
    const w = play.watch;
    if (!w) return false;
    play.watch = null;
    let game = null;
    try { if (w.saved) game = new L.Game({ saved: w.saved, previewCount: play.settings.preview }); } catch (e) { game = null; }
    if (!game) { const B = play.app.store.state.boards; game = new L.Game({ w: B.size.w, h: B.size.h, recipe: B.recipe, previewCount: play.settings.preview }); }
    play.setGame(game);
    play.save();
    return true;
  }

  /**
   * The controller over Classic's (Recipe.compose: its hooks replace Classic's, reached as this.base) while a game is
   * watched: the bot's hands in frame, the keys kept from it, locks and the end that count toward nothing, its bar
   * and its cards.
   */
  function controller(play) {
    const app = play.app;
    const W = () => play.watch;
    const G = () => play.game;
    const K = () => play.game.recipe.classic;
    const C = () => Classic.of(play.game);

    /** The bot at the keys: it presses them through the board's own input, as a player's keys do. */
    const host = {
      game: () => play.game,
      send(a, rep) {
        const w = W();
        if (!w || w.free) return false;
        w.acting = true;
        try { return play.action(a, rep); } finally { w.acting = false; }
      },
      gravity: () => (typeof play.ctl.gravityFor === 'function' ? play.ctl.gravityFor() : Classic.gravity(Classic.levelOf(K(), C().lines), K().lock === 'retro')),
      get retro() { return K().lock === 'retro'; },
      rules: () => ({ hold: K().hold, drop: K().drop, r180: true, next: K().next }),
    };

    return {
      id: 'watch', timeKey: null,

      attach(game) {
        const w = W();
        if (!w || game.over) return;
        w.bot = new Bot.Driver(host, { mistakes: mistakesOf(app.settings), budget: 1.5 });
        // It starts at once (no Start card): watching is what was asked for.
        this.go();
      },
      detach() { const w = W(); if (w) w.bot = null; },

      /** The bot plays only while the game falls (Classic's running: nothing over it, not paused, the tab in front). */
      frame(now, dt) {
        const w = W();
        if (!w || w.free || !w.bot || !this.running()) return;
        w.bot.update(dt * 1000);
      },

      /**
       * Your keys and taps on the bot's game: P pauses and resumes, Space resumes it and, at the end, plays again;
       * nothing else reaches it (until Take over). The bot's own go the way a player's do (Classic's gate).
       */
      gate(act, rep) {
        const w = W();
        if (!w || w.free || w.acting) return this.base.gate(act, rep);
        if (G().over) {
          if (this.pile && !this.pile.done) { if (!rep && (act === 'drop' || act === 'pause')) this.finishPile(); return true; }
          if (act === 'drop' && !rep && play.cardOpen && !play.settling('drop')) { this.again(); return true; }
          return true;
        }
        if (!rep && act === 'pause') { if (this.paused) this.go(); else this.setPause(true); return true; }
        if (!rep && act === 'drop' && this.paused) { this.go(); return true; }
        return false;
      },
      /** Hands off: the mouse and touch reach the game only after Take over (and the bot's own keys). */
      handsOff() { const w = W(); return !!w && !w.free && !w.acting; },

      /** A set: its sound, its picture, the level's callout. Nothing is banked, counted or kept. */
      onLock(r) {
        const g = G(), info = r.classic || { before: 1, level: 1 };
        this.resets = 0; this.lockT = 0; this.acc = 0;
        g.s.mult = 1;
        L.Modes.playLockSound(app.sound, r);
        // (Its picture without the lines banked: there are none.)
        const bank = play.view.showBank;
        play.view.showBank = false;
        play.view.onLock(r, play.reduced);
        play.view.showBank = bank;
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
        play.renderStatus();
      },
      countGame() {},
      counts: () => false,

      /** The end: the classic pile, then the card. No best is kept. */
      onEnd(kind, silent) {
        play.renderItems();
        if (kind === 'full' && !silent && G().piece && !G().rules.physics) { this.startPile(); return; }
        this.showEnd(kind);
      },
      cards: {
        full(pm, kind) {
          const ctl = pm.ctl, g = pm.game, c = Classic.of(g), w = pm.watch, cleared = kind === 'cleared';
          return [
            h('h2', null, cleared ? 'Cleared' : 'Game over'),
            h('p', { class: 'cl-sub' }, w && w.free ? 'Taken over · not counted' : 'Watched · not counted'),
            h('p', null, h('span', { class: 'big' }, fmtInt(g.s.score)), ' points'),
            h('p', null, 'Level ' + Classic.levelOf(g.recipe.classic, c.lines) + ' · ' + c.lines + ' lines'),
            h('div', { class: 'row' },
              h('button', { class: 'btn', id: 'wt-done', onclick: () => stop(pm) }, ico('chevLeft'), 'Done'),
              h('button', { class: 'btn primary', id: 'wt-again', onclick: () => ctl.again() }, ico('watch'), 'Play again ', h('kbd', null, 'Space'))),
          ];
        },
      },
      /** Play again: another game on the same rules, watched from its first piece. */
      again() { const w = W(); if (w) start(play, w.recipe, w.size); },

      /** The pause card: Resume, Take over (while the bot plays) and Done. */
      showWait() {
        const w = W(), g = G();
        if (!w) { this.base.showWait(); return; }
        const lbl = L.Recipe.label(g.recipe) || 'Classic';
        play.showCard([
          h('h2', null, 'Paused'),
          h('p', { class: 'cl-sub' }, (w.free ? 'Your game · ' : 'Watching · ') + lbl.replace(/^Classic · /, '').replace(/^Classic /, 'Game ')),
          h('div', { class: 'row' },
            h('button', { class: 'btn', id: 'wt-done', onclick: () => stop(play) }, ico('chevLeft'), 'Done'),
            w.free ? null : h('button', { class: 'btn', id: 'wt-take', onclick: () => takeOver(play) }, ico('takeOver'), 'Take over'),
            h('button', { class: 'btn primary', id: 'cl-go', onclick: () => this.go() }, 'Resume ', h('kbd', null, 'Space'))),
        ], 'cl-wait wt-wait');
      },

      /** The status bar: Score, Level and Lines (no Bank and no Best: a watched game has neither). */
      status(parts, o) {
        const g = G(), c = C(), k = K(), stat = o.stat;
        return [
          stat('Score', fmtInt(g.s.score)),
          stat('Level', String(Classic.levelOf(k, c.lines))),
          k.type === 'b' ? stat('Left', String(Math.max(0, Classic.B_LINES - c.lines))) : stat('Lines', fmtInt(c.lines)),
        ];
      },

      /** The bar under the board: "Watching", Mistakes, Pause and Take over (after Take over: "Your game", Pause, Done). */
      bar(el) {
        const w = W(), g = G(), c = C();
        if (!w) return this.base.bar(el);
        const cur = mistakesOf(app.settings);
        const pauseBtn = h('button', { class: 'btn sm wt-pause', disabled: !c.started || g.over || !!this.pile, 'aria-label': this.paused ? 'Resume' : 'Pause', 'data-tip': this.paused ? 'Resume' : 'Pause', 'data-tip-foot': 'P', onclick: () => (this.paused ? this.go() : this.setPause(true)) },
          ico(this.paused ? 'playIcon' : 'pause'), h('span', { class: 'lbl' }, this.paused ? 'Resume' : 'Pause'));
        const kids = w.free
          ? [h('span', { class: 'wt-label' }, ico('takeOver'), h('span', null, 'Your game · not counted')), h('div', { class: 'wt-acts' }, pauseBtn,
            h('button', { class: 'btn sm', id: 'wt-bar-done', 'data-tip': 'Back to your board', onclick: () => stop(play) }, ico('chevLeft'), h('span', { class: 'lbl' }, 'Done')))]
          : [h('span', { class: 'wt-label', role: 'status' }, ico('watch'), h('span', null, 'Watching')),
            h('div', { class: 'seg wt-seg', role: 'group', 'aria-label': 'Mistakes' }, h('span', { class: 'wt-nm', 'aria-hidden': 'true' }, 'Mistakes'),
              Bot.MISTAKE_IDS.map((id) => h('button', { type: 'button', class: 'nb-level', 'data-mistakes': id, 'aria-pressed': String(id === cur), 'aria-label': 'Mistakes ' + Bot.MISTAKE_NAMES[id],
                onclick: () => setMistakes(play, id) }, Bot.MISTAKE_NAMES[id]))),
            h('div', { class: 'wt-acts' }, pauseBtn,
              h('button', { class: 'btn sm wt-take', id: 'wt-bar-take', disabled: g.over, 'data-tip': 'Play on from here yourself', onclick: () => takeOver(play) }, ico('takeOver'), h('span', { class: 'lbl' }, 'Take over')))];
        el.replaceChildren(...kids);
        el.classList.add('cl-bar', 'wt-bar');
        return true;
      },
      tiles: () => [],
    };
  }

  /** Mistakes, as set under the board (kept in Settings, and the bot plays by it from its next piece). */
  function setMistakes(play, id) {
    if (!Bot.MISTAKES[id]) return;
    play.app.settings.watchMistakes = id;
    play.app.store.touch();
    const w = play.watch;
    if (w && w.bot) w.bot.setMistakes(id);
    play.renderItems();
  }

  /** Take over: the bot lets go, and the game is yours from where it stands (still not counted). */
  function takeOver(play) {
    const w = play.watch;
    if (!w || w.free || play.game.over) return false;
    w.free = true;
    w.bot = null;
    play.renderItems();
    play.renderStatus();
    // From a pause it carries on at once, in your hands.
    if (play.ctl.paused) play.ctl.go();
    UI.toast('Your game now · not counted', '', 1800);
    return true;
  }

  L.Watch = { start, stop, controller, takeOver, setMistakes, mistakesOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
