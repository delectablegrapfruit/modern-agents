// Lull — Training on the Play tab (js/training.js has its rules): the controller over Classic's that judges each set
// and takes a poor one back (a Hold too), the coach's settings in the Training setup, and what it draws on the board:
// the piece retracing its own way back to where it appeared, its moves undone in turn (0.4 to 0.9 s, a fall in one
// glide; with reduced motion, back at once under a brief soft flash), the best spot as a calm outline once Hint after
// is reached (the Hold box framed when the best is through Hold), and, with Explanation on, why, right where your
// piece was set and only for a moment: small rings rising from its cells and fading, the holes it made pulsing, and a
// word or two beside it (a beat before it goes back, so the eye is there already; a Hold: at the Hold box); a good
// move's word too, smaller and calmer, in the accent. The music plays straight on through the way back.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Classic, Training, UI, Render, fmtInt } = L;
  // (Patterns, the second style: js/patterns.js and js/patternsview.js; absent, Per move is all there is.)
  const Pat = () => L.Patterns, PV = () => L.PatternsView;
  if (!Recipe || !Classic || !Training || !UI) return;
  const { h } = UI;
  const ico = UI.icon;

  /**
   * The piece's way back (seconds): its own path retraced from where it was set to where it appeared, in BACKTRACK[0]
   * to BACKTRACK[1] however long the path (a fall in one glide, each other step at least STEP), and the reduced-motion
   * flash (back at once).
   */
  const BACKTRACK = [0.4, 0.9], STEP = 0.045, FLASH = 0.22;
  /**
   * Explanation's moment at the set piece (seconds): it lasts SPARK (SPARK_STILL with reduced motion: a still fade), and
   * the piece waits where it was set for BEAT of it before it goes back up.
   */
  const SPARK = 1.05, SPARK_STILL = 0.75, BEAT = 0.35;
  /** A good move's word (Explanation): shorter, and with reduced motion a still fade. */
  const GOOD = 0.8, GOOD_STILL = 0.6;
  /** Thinking a frame (ms) while a piece is in play, so the judgement is ready by the time it is set. */
  const SLICE = 3;

  const cellsAt = (q) => L.Pieces.get(q.id).rots[q.rot].map(([cx, cy]) => [q.x + cx, q.y + cy]);
  /**
   * The way back, as keyframes from where the piece was set (cells) to where it appeared, each { cells, color, dur
   * (seconds from the one before), glide (a fall retraced: its rows in one) }: the path (track's) backwards, a fall
   * (the same turn and column, rows only) in one glide, Hold's swap a step of its own. Too many steps for the time,
   * the slides are taken in one glide each, then steps are left out evenly (the first and last kept); the times share
   * out BACKTRACK by weight (a glide counts more), never under STEP a step.
   */
  function backSteps(path, cells, color) {
    const poses = path.filter((q) => !q.hold).length ? path : [];
    let keys = [{ cells: cells.map((c) => c.slice()), color, pose: null }];
    for (let i = poses.length - 1; i >= 0; i--) {
      const q = poses[i];
      if (q.hold) { const k = keys[keys.length - 1]; k.swap = true; continue; }
      keys.push({ cells: cellsAt(q), color: q.color, pose: q });
    }
    // A pose only a fall (or a slide, with slides) apart from both its neighbours is left out: the glide goes through it.
    const same = (a, b, slide) => !!a.pose && !!b.pose && a.pose.id === b.pose.id && a.pose.rot === b.pose.rot && (a.pose.x === b.pose.x || (slide && a.pose.y === b.pose.y));
    const merge = (slide) => {
      const out = [keys[0]];
      for (let i = 1; i < keys.length; i++) {
        const k = keys[i], prev = out[out.length - 1], next = keys[i + 1];
        if (next && !k.swap && same(prev, k, slide) && same(k, next, slide) && (slide ? (prev.pose.x === k.pose.x) === (k.pose.x === next.pose.x) : true)) continue;
        out.push(k);
      }
      return out;
    };
    keys = merge(false);
    if ((keys.length - 1) * STEP * 1.6 > BACKTRACK[1]) keys = merge(true);
    const most = Math.floor(BACKTRACK[1] / (STEP * 1.3));
    if (keys.length - 1 > most) { const n = keys.length - 1, out = []; for (let j = 0; j <= most; j++) out.push(keys[Math.round(j * n / most)]); keys = out; }
    if (keys.length < 2) return [];
    const glide = (a, b) => a.pose ? a.pose.id === b.pose.id && a.pose.rot === b.pose.rot && Math.abs(a.pose.y - b.pose.y) > 1 : Math.abs(a.cells[0][1] - b.cells[0][1]) > 1;
    const w = keys.map((k, i) => (i ? (glide(keys[i - 1], k) ? 2 : 1) : 0)), sum = w.reduce((a, b) => a + b, 0);
    const total = Math.max(BACKTRACK[0], Math.min(BACKTRACK[1], 0.25 + 0.06 * sum));
    return keys.map((k, i) => ({ cells: k.cells, color: k.color, dur: i ? Math.max(STEP, total * w[i] / sum) : 0, glide: !!w[i] && w[i] > 1, swap: !!k.swap }));
  }

  /**
   * The controller over Classic's (Recipe.compose: its hooks replace Classic's, reached as this.base): the bot's
   * judgement thought out a slice a frame, each set judged (kept, or taken back), the way back drawn, its bar (the
   * counters and Pause), its cards. Nothing it does counts (uncounted: the page's hints, stats and day leave it alone).
   */
  function controller(play) {
    const app = play.app;
    const G = () => play.game;
    const T = () => Training.of(play.game);
    const K = () => play.game.recipe.classic;
    const C = () => Classic.of(play.game);
    /** The style in play: Patterns (no judging, no way back: the fit strip and the notes), or Per move. */
    const pat = () => !!Pat() && !!PV() && Pat().settingsOf(app.settings).style === 'patterns';

    return {
      id: 'training', timeKey: null, uncounted: true,
      back: null, spark: null, gen: null, ranked: null, forTurn: null,

      attach(game) {
        Object.assign(this, { back: null, spark: null, gen: null, ranked: null, forTurn: null, note: null, noteCard: null, fit: null, showFit: null, fitSticky: 0, keys: 0, sinceI: 0, lastNote: null });
        play.view.training = this;
        // Hold is a move too: judged as it is pressed.
        for (const off of this.offs || []) off();
        this.path = []; this.pathTurn = null;
        this.offs = [game.on('hold', () => this.onHold()), game.on('move', () => this.track()), game.on('rotate', () => this.track()), game.on('spawn', () => this.track(true))];
        // (A game from before its first turn was kept: its turn starts where it stands.)
        const t = T();
        if (t && !t.turn && game.piece && !game.over && !game.holdLocked) Training.newTurn(t, Training.snap(game));
      },
      detach() { this.finishBack(); this.spark = null; for (const off of this.offs || []) off(); this.offs = null; if (play.view.training === this) play.view.training = null; },

      /** Classic's running, and not on the way back. */
      running() { return !this.back && this.base.running(); },
      blocked() { return !!this.back || this.base.blocked(); },
      /** The mouse and touch wait on the way back too. */
      handsOff() { return !!this.back; },
      /** On the way back, the keys wait (it is over in a moment); otherwise Classic's. */
      gate(act, rep) {
        if (this.back && !G().over) return false;
        // (A key pressed for the piece in play, a held one once: Fewest keys counts them.)
        if (!rep && /^(moveL|moveR|cw|ccw|r180)$/.test(act)) this.keys = (this.keys || 0) + 1;
        return this.base.gate(act, rep);
      },
      /** G: the Guide (both styles). */
      onKey(e) {
        if (e.code !== 'KeyG' || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return false;
        if (!e.repeat) this.openGuide();
        return true;
      },
      /** The Guide over the board: the game holds while it is open (a window), and goes on when it closes. */
      openGuide() {
        if (!PV()) return null;
        const t = T();
        return PV().openGuide(app, this.noteCard, { gid: t && t.gid });
      },
      countGame() {},
      counts() { return this.running(); },

      frame(now, dt) {
        if (this.back) this.backFrame(dt);
        else this.track();
        if (this.spark) { this.spark.t += dt; play.view.dirty = true; if (this.spark.t >= this.spark.dur) this.spark = null; }
        // Patterns: the note's moment, and a tapped piece's spots for a few seconds.
        if (this.note) { this.note.t += dt; play.view.dirty = true; if (this.note.t >= this.note.dur) this.note = null; }
        if (this.fitSticky > 0) { this.fitSticky -= dt; if (this.fitSticky <= 0) { this.fitSticky = 0; this.showFit = null; play.view.dirty = true; play.renderItems(); } }
        this.ponder();
      },
      /**
       * The music goes on through the way back as it was: Classic's sync (which would stop it while nothing falls, and
       * set its tempo by the stack) waits until the piece is in play again, and then eases as ever.
       */
      syncMusic() { if (!this.back) this.base.syncMusic(); },
      /** Leaving (a window, another tab, the app put away): the way back ends at once, so the game is saved as it is. */
      pause() { this.finishBack(); this.spark = null; },

      /**
       * The judgement of the turn in play, a slice a frame (ready, almost always, before the piece is set), kept with
       * the turn (Training.rankingOf), so each try at the piece and its hint go by the same.
       */
      ponder(all) {
        const t = T(), g = G();
        if (!t || !t.turn || g.over || (this.back && !all) || pat()) return;
        if (this.forTurn !== t.turn) { this.forTurn = t.turn; this.ranked = t.rankedFor === t.turn ? t.ranked : null; this.gen = this.ranked ? null : Training.think(g, t.turn); }
        const t0 = performance.now();
        while (this.gen && (all || performance.now() - t0 < SLICE)) {
          const r = this.gen.next();
          if (r.done) { this.ranked = r.value; this.gen = null; Training.rankingOf(g, this.ranked); }
        }
      },

      /** A set: judged; kept (its sound and picture, the level's callout) or taken back. Nothing is banked or counted. */
      onLock(r) {
        const g = G(), t = T();
        this.resets = 0; this.lockT = 0; this.acc = 0;
        g.s.mult = 1;
        // Patterns: every set kept, looked at for its note; nothing judged.
        if (pat()) {
          PV().onLock(this, play, r);
          this.kept(r);
          if (this.fitSticky) { this.fitSticky = 0; this.showFit = null; }
          play.renderStatus();
          play.renderItems();
          return;
        }
        // (Not thought out yet, a piece set at once: the rest now, never a judgement on half a search.)
        if (t && this.forTurn === t.turn && this.gen) this.ponder(true);
        const ranked = t && this.forTurn === t.turn ? this.ranked : null;
        const res = Training.place(g, r, app.settings, ranked || undefined);
        if (res.act === 'rewind') this.startBack(r);
        else { this.kept(r); this.praised(res.praise, r.cells, false, res.col); }
        play.renderStatus();
        play.renderItems();
      },
      /**
       * Hold pressed: judged at once (the thinking finished first, if need be). A poor one goes back as a poor set does:
       * the piece Hold brought goes back up to where the piece in play appeared, and the piece and Hold are as they were.
       */
      onHold() {
        const g = G(), t = T();
        if (!t || !t.turn || this.back || pat()) return;
        if (this.forTurn === t.turn && this.gen) this.ponder(true);
        const res = Training.holdPress(g, app.settings, t && this.forTurn === t.turn && this.ranked ? this.ranked : undefined);
        if (res.act !== 'rewind') { this.praised(res.praise, [], true); return; }
        const p = g.piece;
        this.startBack({ cells: p ? g.absCells(p) : [], color: p ? p.type.color : 1 }, true);
        play.renderStatus();
        play.renderItems();
      },
      /**
       * The way the piece in play has come this turn (path: its poses { id, rot, x, y, color } from where it appeared,
       * a { hold } between the piece and the one Hold brought), a pose each time it moves, turns or falls (a frame's
       * fall, a soft drop's rows: one step). Begun again with each turn, and from where the piece is after a rewind.
       */
      track(spawned) {
        const g = G(), t = T(), p = g && g.piece;
        if (!t || !t.turn || !p || this.back || t.back) return;
        if (this.pathTurn !== t.turn) { this.pathTurn = t.turn; this.path = []; }
        else if (spawned && g.holdLocked) this.path.push({ hold: true });
        const last = this.path[this.path.length - 1], pose = { id: p.type.id, rot: p.rot, x: p.x, y: p.y, color: p.type.color };
        if (!last || last.hold || last.id !== pose.id || last.rot !== pose.rot || last.x !== pose.x || last.y !== pose.y) this.path.push(pose);
      },
      /**
       * A good move's word, with Explanation on: said where the piece was set (or at the Hold box), smaller and calmer
       * than a poor one's, in the accent (GOOD; with reduced motion, a still fade).
       */
      praised(word, cells, hold, col) {
        if (!word || !Training.settingsOf(app.settings).explain) return;
        const reduced = play.reduced;
        this.spark = { t: 0, dur: reduced ? GOOD_STILL : GOOD, good: true, hold, cells: cells.map((c) => c.slice()), holes: [], word, bad: false, col: col != null ? col : null, rows: null, reduced };
        play.view.dirty = true;
      },
      /** A set kept: as Classic sounds and shows it (without the lines banked: there are none). */
      kept(r) {
        const info = r.classic || { before: 1, level: 1 };
        L.Modes.playLockSound(app.sound, r);
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
      },

      /**
       * A poor set (or Hold): the game goes back to the turn's start in the next frame (after the lock is done with the
       * next piece; the rows it cleared are back at once), and the piece is drawn retracing its own path from where it
       * was set to where it appeared (backSteps), or, with reduced motion, back at once under a flash.
       */
      startBack(r, hold) {
        const reduced = play.reduced, why = Training.whyOf(T(), app.settings);
        // With Explanation on, why, at the cells it was set (a Hold: at the Hold box): the piece waits there a beat
        // first (not with reduced motion).
        // (The band shows what the word says, and only that: the well's column with "Blocks the well", the rows with
        // "Best clears"; never one for a reason not said.)
        const said = why ? why.words[0] || null : null;
        this.spark = why ? { t: 0, dur: reduced ? SPARK_STILL : SPARK, hold: !!hold, cells: r.cells.map((c) => c.slice()), holes: why.holes.map((c) => c.slice()), word: said, bad: true, col: why.well && said === 'Blocks the well' ? why.well.x : null, rows: why.lines && /^Best clears/.test(said || '') ? why.lines.rows.slice() : null, reduced } : null;
        const steps = reduced ? [] : backSteps(this.path, r.cells, r.color);
        this.back = { due: true, t: 0, wait: why && !reduced ? BEAT : 0, steps, total: steps.reduce((a, k) => a + k.dur, 0), reduced };
        app.sound.play('item');
        play.view.dirty = true;
      },
      backFrame(dt) {
        const b = this.back, g = G();
        if (b.due) {
          b.due = false;
          Training.rewind(g);
          this.acc = 0; this.lockT = 0; this.resets = 0;
          this.path = []; this.pathTurn = null;
          play.renderStatus();
          play.renderItems();
          return;
        }
        b.t += dt;
        play.view.dirty = true;
        if (b.t >= b.wait + (b.reduced ? FLASH : b.total)) this.endBack();
      },
      endBack() {
        this.back = null;
        this.acc = 0;
        this.track();
        play.view.dirty = true;
        play.renderItems();
        // (A finger still on the board: the piece back in play is a new one to it.)
        if (play.gest && play.gest.active) play.gest.newPiece();
      },
      /** The way back, done at once (the game back where it was, nothing drawn). */
      finishBack() {
        const b = this.back;
        if (!b) return;
        if (b.due) Training.rewind(G());
        this.endBack();
      },

      /** The end: only a placement kept ends it (one taken back never does). The classic pile, then the card. */
      onEnd(kind, silent) {
        if (this.back) return;
        // Patterns' record: this game topped out.
        const t = T();
        if (pat() && kind === 'full' && !silent && t && t.gid) { Pat().logLine(PV().memOf(app), t.gid, Date.now()).topout = true; app.store.touch(); }
        play.renderItems();
        if (kind === 'full' && !silent && G().piece && !G().rules.physics) { this.startPile(); return; }
        this.showEnd(kind);
      },
      cards: {
        full(pm, kind) {
          const ctl = pm.ctl, g = pm.game, c = Classic.of(g), t = Training.of(g), cleared = kind === 'cleared';
          return [
            h('h2', null, cleared ? 'Cleared' : 'Game over'),
            h('p', { class: 'cl-sub' }, 'Training · not counted'),
            h('p', null, h('span', { class: 'big' }, fmtInt(g.s.score)), ' points'),
            h('p', null, 'Level ' + Classic.levelOf(g.recipe.classic, c.lines) + ' · ' + c.lines + ' lines'),
            t && ctl.isPatterns() ? h('div', { class: 'tr-sum pt-end' }, L.PatternsView.recordRows(pm.app, t.gid)) : null,
            t && !ctl.isPatterns() ? h('p', { class: 'tr-sum' }, fmtInt(t.placed) + ' placed · ' + (t.placed ? Training.firstPct(t) + ' first try · ' : '') + fmtInt(t.rewinds) + (t.rewinds === 1 ? ' rewind' : ' rewinds')) : null,
            h('div', { class: 'row' },
              pm.menuButton(),
              h('button', { class: 'btn primary', id: 'cl-again', onclick: () => ctl.again(cleared ? 'cleared' : 'full') }, ico('newBoard'), 'Play again')),
          ];
        },
      },

      isPatterns: () => pat(),
      /** The card it waits at: Training before the first piece falls, then Paused. The Menu from either. */
      showWait() {
        const c = C(), first = !c.started, o = Training.settingsOf(app.settings);
        const lbl = Recipe.label(G().recipe) || 'Training';
        play.showCard([
          h('h2', null, first ? 'Training' : 'Paused'),
          h('p', { class: 'cl-sub' }, lbl.replace(/^Training /, 'Game ')),
          first ? h('p', { class: 'tr-sub' }, pat() ? 'Patterns · notes ' + Pat().settingsOf(app.settings).notes + ' · Guide: G' : Training.STRICT_NAMES[o.strict] + ' · hint after ' + o.hint + (o.hint === 1 ? ' try' : ' tries')) : null,
          h('div', { class: 'row' },
            play.menuButton(),
            h('button', { class: 'btn primary', id: 'cl-go', onclick: () => this.go() }, first ? 'Start ' : 'Resume ', h('kbd', null, 'Space'))),
        ], 'cl-wait tr-wait');
      },

      /** Score, Level and Lines (no Bank and no Best: a Training game has neither). */
      status(parts, o) {
        const g = G(), c = C(), k = K(), stat = o.stat;
        return [
          stat('Score', fmtInt(g.s.score)),
          stat('Level', String(Classic.levelOf(k, c.lines)) + (k.levelLock ? ' (locked)' : '')),
          k.type === 'b' ? stat('Left', String(Math.max(0, Classic.B_LINES - c.lines))) : stat('Lines', fmtInt(c.lines)),
        ];
      },

      /** The bar under the board: a quiet "Training" and its counters (placed, first try once one is, rewinds), and Pause. */
      bar(el) {
        const g = G(), c = C(), t = T() || Training.fresh();
        const n = (v, label, cls) => h('span', { class: 'tr-n' + (cls ? ' ' + cls : '') }, h('b', null, v), ' ' + label);
        const guide = PV() ? h('button', { class: 'btn sm tr-guide', 'aria-label': 'Guide', 'data-tip': 'Guide', 'data-tip-foot': 'G', onclick: () => this.openGuide() }, ico('guide'), h('span', { class: 'lbl' }, 'Guide')) : null;
        const pause = h('button', { class: 'btn sm tr-pause', disabled: !c.started || g.over || !!this.pile, 'aria-label': this.paused ? 'Resume' : 'Pause', 'data-tip': this.paused ? 'Resume' : 'Pause', 'data-tip-foot': 'P', onclick: () => (this.paused ? this.go() : this.setPause(true)) },
          ico(this.paused ? 'playIcon' : 'pause'), h('span', { class: 'lbl' }, this.paused ? 'Resume' : 'Pause'));
        el.classList.toggle('pt-bar', pat());
        if (pat()) {
          // Patterns: the fit strip where the counters were, then the Guide and Pause.
          el.replaceChildren(h('span', { class: 'pt-fits-l', 'aria-hidden': 'true' }, 'Fits'), PV().strip(this, play), guide, pause);
          el.classList.add('cl-bar', 'tr-bar');
          return true;
        }
        el.replaceChildren(
          h('span', { class: 'tr-label', role: 'status', 'aria-label': 'Training: ' + t.placed + ' placed, ' + (t.placed ? Training.firstPct(t) + ' first try, ' : '') + t.rewinds + ' rewinds' },
            ico('training'), h('span', { class: 'tr-nm' }, 'Training'),
            h('span', { class: 'tr-ns', 'aria-hidden': 'true' }, n(fmtInt(t.placed), 'placed', 'tr-placed'), t.placed ? n(Training.firstPct(t), 'first try', 'tr-first') : null, n(fmtInt(t.rewinds), t.rewinds === 1 ? 'rewind' : 'rewinds', 'tr-rewinds'))),
          guide, pause);
        el.classList.add('cl-bar', 'tr-bar');
        return true;
      },
      tiles: () => [],
    };
  }

  // ---- the setup: Classic's rules, then the coach --------------------------------------------------------------------

  /**
   * The coach's settings (Settings, so they apply at once and stay): Style (Per move, Patterns), then Per move's
   * (Strictness, Hint after, Explanation) or Patterns' (Notes, Detail, Advanced notes).
   */
  function coach(api) {
    const app = api.app || L.app, st = app.settings, o = Training.settingsOf(st), po = Pat() ? Pat().settingsOf(st) : null;
    const set = (k, v) => { st[k] = v; app.store.touch(); if (app.modes && app.modes.play) app.modes.play.view.dirty = true; api.refresh(); };
    const btn = (k, v, label, on, tip) => h('button', { type: 'button', class: 'nb-level', 'data-focus': k + '=' + v, 'aria-pressed': String(on), 'data-tip': tip || null, onclick: () => set(k, v) }, label);
    const row = (label, kids) => h('div', { class: 'cl-row' }, h('span', { class: 'cl-nm' }, label), h('div', { class: 'seg cl-seg', role: 'group', 'aria-label': label }, kids));
    const TIPS = { gentle: 'Only clear mistakes: a new hole, needless height', standard: 'Any new hole, needless height, a rough top', strict: 'Anything notably below the best' };
    const P = Pat();
    const style = P ? row('Style', P.STYLE_IDS.map((id) => btn('trainStyle', id, P.STYLE_NAMES[id], po.style === id, id === 'move' ? 'Each piece judged; a poor one goes back' : 'Play on; notes on shapes as they form'))) : null;
    if (po && po.style === 'patterns') {
      return h('div', { class: 'mn-field tr-coach' },
        h('span', { class: 'mn-lab' }, 'Coach'),
        h('div', { class: 'cl-set' }, style,
          row('Notes', P.NOTE_IDS.map((id) => btn('trainNotes', id, P.NOTE_NAMES[id], po.notes === id, 'At most one every ' + P.NOTES[id] + ' pieces'))),
          row('Detail', P.DETAIL_IDS.map((id) => btn('trainDetail', id, P.DETAIL_NAMES[id], po.detail === id, id === 'full' ? 'Words and the pieces that fit' : 'A word or two'))),
          h('button', { type: 'button', class: 'nb-switch cl-sw tr-explain pt-adv', role: 'switch', 'data-focus': 'trainAdvanced', 'aria-checked': String(po.advanced), onclick: () => set('trainAdvanced', !po.advanced) },
            h('span', { class: 'nm' }, 'Advanced notes'), h('span', { class: 'sw', 'aria-hidden': 'true' }))));
    }
    return h('div', { class: 'mn-field tr-coach' },
      h('span', { class: 'mn-lab' }, 'Coach'),
      h('div', { class: 'cl-set' }, style,
        row('Strictness', Training.STRICT_IDS.map((id) => btn('trainStrict', id, Training.STRICT_NAMES[id], o.strict === id, TIPS[id]))),
        row('Hint after', Array.from({ length: Training.HINT[1] - Training.HINT[0] + 1 }, (_, i) => Training.HINT[0] + i).map((n) => btn('trainHint', n, String(n), o.hint === n, n === 1 ? 'Show the best spot after one try' : 'Show the best spot after ' + n + ' tries'))),
        h('button', { type: 'button', class: 'nb-switch cl-sw tr-explain', role: 'switch', 'data-focus': 'trainExplain', 'aria-checked': String(o.explain), onclick: () => set('trainExplain', !o.explain) },
          h('span', { class: 'nm' }, 'Explanation'), h('span', { class: 'sw', 'aria-hidden': 'true' }))));
  }

  Recipe.uiPart({
    key: 'training', order: 46, mode: 'training', name: 'Training',
    levels: (r) => { const u = Recipe.uis().find((x) => x.key === 'classic'); return u && u.levels ? u.levels(r) : null; },
    panel(r, api) {
      if (!Training.on(r)) return null;
      const u = Recipe.uis().find((x) => x.key === 'classic');
      return h('div', { class: 'tr-setup' }, u && u.panel ? u.panel(r, api) : null, coach(api));
    },
    said: (path, v) => { const u = Recipe.uis().find((x) => x.key === 'classic'); return u && u.said ? u.said(path, v) : null; },
    tiles: (ext) => (ext && ext.placed != null ? [[fmtInt(ext.placed), 'Placed'], [fmtInt(ext.rewinds), 'Rewinds']] : []),
    endName: (reason) => (reason === 'cleared' ? 'Cleared' : null),
  });

  // ---- on the board ----------------------------------------------------------------------------------------------------

  const ROSE = { dark: '#eb8fa8', light: '#b8486a' };
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  /** The outline around a set of cells (only the edges between a cell of it and one that is not), in screen space. */
  function outline(ctx, view, cells) {
    const s = view.lay.s, keys = new Set(cells.map(([x, y]) => x + ',' + y));
    ctx.beginPath();
    for (const [x, y] of cells) {
      const [sx, sy] = view.toScreen(x, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (keys.has((x + dx) + ',' + (y + dy))) continue;
        const [nx, ny] = view.toScreen(x + dx, y + dy);
        if (nx > sx) { ctx.moveTo(sx + s, sy); ctx.lineTo(sx + s, sy + s); }
        else if (nx < sx) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + s); }
        else if (ny > sy) { ctx.moveTo(sx, sy + s); ctx.lineTo(sx + s, sy + s); }
        else { ctx.moveTo(sx, sy); ctx.lineTo(sx + s, sy); }
      }
    }
    ctx.stroke();
  }
  const inside = (view, cells) => cells.filter(([x, y]) => x >= 0 && x < view.game.w && y >= 0 && y < view.game.h);

  /**
   * Explanation's moment, where the piece was set (sp: the controller's spark): a small ring rising from each of its
   * cells and fading (one after another, a few hundredths apart), the holes it made pulsing twice, and its word in a
   * small pill just above the piece (below it at the ceiling), rising a little, and what the word is about in a soft
   * band (the well's column, the rows the best clears); rose for a poor move, the accent for a good one (smaller rings,
   * rising less). With reduced motion: nothing moves, the cells' rings, the holes and the word fade out together.
   */
  function drawSpark(ctx, view, sp) {
    const { s, board } = view.lay, theme = view.look.theme, light = theme.name === 'light';
    const rose = light ? ROSE.light : ROSE.dark, tone = sp.bad ? rose : theme.accent, p = Math.min(1, sp.t / sp.dur);
    if (sp.hold) { holdSpark(ctx, view, sp, rose, p); return; }
    // What it points at: the well's column, the rows the best clears, as soft bands fading out.
    const band = (sp.reduced ? 0.12 : 0.16) * (1 - p);
    if (sp.col != null) {
      // The well's column from the floor to a row over the stack, never up where the pieces appear.
      const g = view.game, top = Math.min(g.h - 2, g.board.stackHeight() + 1), [sx, y0] = view.toScreen(sp.col, 0), [, y1] = view.toScreen(sp.col, top - 1);
      ctx.fillStyle = Render.rgba(sp.good ? theme.accent : rose, band); ctx.fillRect(sx, Math.min(y0, y1), s, Math.abs(y0 - y1) + s);
    }
    for (const y of sp.rows || []) { const [, sy] = view.toScreen(0, y); ctx.fillStyle = Render.rgba(theme.accent, band); ctx.fillRect(board.x, sy, board.w, s); }
    const cells = inside(view, sp.cells);
    if (!cells.length) return;
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    if (sp.reduced) {
      const a = 1 - p;
      ctx.fillStyle = Render.rgba(tone, (sp.good ? 0.1 : 0.16) * a); ctx.strokeStyle = Render.rgba(tone, (sp.good ? 0.55 : 0.8) * a);
      for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); ctx.fillRect(sx, sy, s, s); ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * 0.26, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      cells.forEach(([x, y], i) => {
        const q = Math.max(0, Math.min(1, (sp.t - i * 0.05) / (sp.dur * 0.85)));
        if (q <= 0 || q >= 1) return;
        const [sx, sy] = view.toScreen(x, y), e = 1 - Math.pow(1 - q, 2);
        ctx.strokeStyle = Render.rgba(tone, 0.95 * Math.pow(1 - q, 1.1));
        // (A good move's: smaller, fainter, rising less.)
        const g = sp.good ? 0.6 : 1;
        if (sp.good) ctx.strokeStyle = Render.rgba(tone, 0.7 * Math.pow(1 - q, 1.1));
        ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2 - e * s * 0.9 * g, s * (0.2 + 0.14 * e) * g, 0, Math.PI * 2); ctx.stroke();
      });
    }
    // The holes it made: rings in place, pulsing twice (still, with reduced motion).
    ctx.strokeStyle = Render.rgba(rose, 0.9 * (1 - p));
    for (const [x, y] of inside(view, sp.holes)) {
      const [sx, sy] = view.toScreen(x, y), k = sp.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(p * Math.PI * 4 - Math.PI / 2);
      ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * (0.16 + 0.1 * k), 0, Math.PI * 2); ctx.stroke();
    }
    if (!sp.word) return;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); left = Math.min(left, sx); right = Math.max(right, sx + s); top = Math.min(top, sy); bottom = Math.max(bottom, sy + s); }
    word(ctx, view, sp, tone, p, { left, right, top, bottom }, board);
  }
  /**
   * A word in a small pill over a box on the screen (below it when there is no room above), kept inside `room`: in
   * quickly, rising a little, out over the last third (still, with reduced motion, fading).
   */
  function word(ctx, view, sp, tone, p, box, room) {
    const { s } = view.lay, light = view.look.theme.name === 'light';
    const a = sp.reduced ? 1 - p : Math.min(1, sp.t / 0.12) * Math.min(1, (1 - p) / 0.35);
    const fs = Math.max(10, Math.min(13, s * 0.5)), pad = fs * 0.55, ht = fs * 1.6;
    ctx.font = '650 ' + fs + 'px ' + Render.FONT;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(sp.word).width + pad * 2;
    const rise = sp.reduced ? 0 : (1 - Math.pow(1 - p, 2)) * s * 0.4;
    let y = box.top - ht - s * 0.2 - rise;
    if (y < room.y + 2) y = box.bottom + s * 0.2 + rise;
    const x = Math.max(room.x + 2, Math.min(room.x + room.w - tw - 2, (box.left + box.right) / 2 - tw / 2));
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(20,22,30,0.84)';
    Render.rr(ctx, x, y, tw, ht, ht / 2); ctx.fill();
    ctx.strokeStyle = Render.rgba(tone, 0.6); ctx.lineWidth = 1; Render.rr(ctx, x + 0.5, y + 0.5, tw - 1, ht - 1, ht / 2); ctx.stroke();
    ctx.fillStyle = sp.bad || !light ? tone : Render.shade(tone, -0.35);
    ctx.fillText(sp.word, x + pad, y + ht / 2 + 0.5);
    ctx.globalAlpha = 1;
  }
  /**
   * A Hold taken back, at the Hold box: its frame drawn in rose, pulsing twice and fading, a ring rising from it (still
   * with reduced motion), and the word by it.
   */
  function holdSpark(ctx, view, sp, rose, p) {
    if (view.game.mods.noHold) return;
    // (A good Hold: the accent, calmer.)
    if (sp.good) rose = view.look.theme.accent;
    const b = view.holdBox(), { s } = view.lay;
    const k = sp.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(p * Math.PI * 4 - Math.PI / 2), grow = 2 + 3 * k;
    ctx.strokeStyle = Render.rgba(rose, 0.9 * (1 - p)); ctx.lineWidth = Math.max(1.5, s * 0.08);
    Render.rr(ctx, b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2, 8); ctx.stroke();
    if (!sp.reduced) {
      const e = 1 - Math.pow(1 - p, 2);
      ctx.strokeStyle = Render.rgba(rose, 0.8 * Math.pow(1 - p, 1.4));
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2 - e * s * 0.9, s * (0.25 + 0.15 * e), 0, Math.PI * 2); ctx.stroke();
    }
    if (sp.word) word(ctx, view, sp, rose, p, { left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h }, { x: 0, y: 0, w: view.cssW || 9999, h: 0 });
  }

  Recipe.viewPart({
    key: 'training', order: 46,
    busy: (view) => !!(view.training && (view.training.back || view.training.spark || view.training.note || view.training.fitSticky)),
    /** On the way back the piece in play is drawn by overPiece, moving: its own cells wait. */
    pieceAlpha: (view) => (view.training && view.training.back && !view.training.back.reduced ? 0 : 1),
    /** Under the piece: the best spot's outline (Hint after). */
    overStack(ctx, view) {
      const g = view.game, t = Training.of(g), ctl = view.training, st = L.app && L.app.settings;
      if (!t || !view.lay || g.over || (ctl && ctl.back && !ctl.back.reduced)) return;
      // Patterns: the spots of the piece pointed at in the fit strip.
      if (ctl && PV() && ctl.showFit) { ctx.save(); PV().drawFits(ctx, view, ctl); ctx.restore(); }
      const { s } = view.lay, theme = view.look.theme, light = theme.name === 'light', acc = theme.accent;
      const best = Training.hintOf(t, st);
      if (best) {
        const cells = inside(view, best.cells);
        ctx.fillStyle = Render.rgba(acc, light ? 0.12 : 0.14);
        for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); ctx.fillRect(sx, sy, s, s); }
        ctx.strokeStyle = Render.rgba(acc, 0.95); ctx.lineWidth = Math.max(2, s * 0.09);
        outline(ctx, view, cells);
        if (best.hold && cells.length) {
          // The best is the piece in Hold: said beside the outline.
          const top = cells.reduce((a, c) => (view.toScreen(c[0], c[1])[1] < view.toScreen(a[0], a[1])[1] ? c : a));
          const [sx, sy] = view.toScreen(top[0], top[1]);
          ctx.font = '650 ' + Math.max(9, Math.min(12, s * 0.45)) + 'px ' + Render.FONT; ctx.textBaseline = 'bottom'; ctx.fillStyle = acc;
          ctx.fillText('Hold', sx, sy - 2);
        }
      }
    },
    /**
     * Over the piece: the piece where it was set (Explanation's beat), then on its way back up, or (reduced motion) a
     * brief soft flash over the well; Explanation's moment over it all.
     */
    overPiece(ctx, view) {
      const ctl = view.training, b = ctl && ctl.back;
      if (!view.lay) return;
      if (ctl && ctl.spark && !view.game.over) { ctx.save(); drawSpark(ctx, view, ctl.spark); ctx.restore(); }
      if (ctl && ctl.note && PV() && !view.game.over) PV().drawNote(ctx, view, ctl);
      // The hint, when the best move is Hold: the Hold box framed in the accent until it is used.
      const t = Training.of(view.game), best = t && !(b && !b.reduced) ? Training.hintOf(t, L.app && L.app.settings) : null;
      if (best && best.hold && !view.game.holdLocked && !view.game.mods.noHold && !view.game.over) {
        const hb = view.holdBox();
        ctx.strokeStyle = Render.rgba(view.look.theme.accent, 0.95); ctx.lineWidth = Math.max(2, view.lay.s * 0.09);
        Render.rr(ctx, hb.x - 3, hb.y - 3, hb.w + 6, hb.h + 6, 8); ctx.stroke();
      }
      if (!b || b.due) return;
      const { s, board } = view.lay, look = view.look;
      if (b.reduced) {
        ctx.fillStyle = Render.rgba(look.theme.accent, 0.12 * Math.max(0, 1 - b.t / FLASH));
        ctx.fillRect(board.x, board.y, board.w, board.h);
        return;
      }
      // The keyframe it is between: the same turn glides from one to the next, a turn or Hold's swap changes halfway.
      const steps = b.steps;
      if (!steps.length) return;
      let at = Math.max(0, b.t - b.wait), i = 1;
      while (i < steps.length - 1 && at > steps[i].dur) { at -= steps[i].dur; i++; }
      const A = steps[i - 1], Z = steps[Math.min(i, steps.length - 1)], k = Z.dur ? Math.min(1, at / Z.dur) : 1;
      const same = A.cells.length === Z.cells.length && A.color === Z.color && A.cells.every((c, j) => Z.cells[j] && Math.abs(Z.cells[j][0] - c[0] - (Z.cells[0][0] - A.cells[0][0])) + Math.abs(Z.cells[j][1] - c[1] - (Z.cells[0][1] - A.cells[0][1])) === 0);
      const e = Z.glide ? ease(k) : k, cur = same ? null : k < 0.5 ? A : Z;
      const g = view.game;
      for (let j = 0; j < (cur || A).cells.length; j++) {
        const c = cur ? cur.cells[j] : [A.cells[j][0] + (Z.cells[j][0] - A.cells[j][0]) * e, A.cells[j][1] + (Z.cells[j][1] - A.cells[j][1]) * e];
        if (c[1] > g.h - 0.01 || c[1] < 0) continue;
        const [sx, sy] = view.toScreen(c[0], c[1]);
        Render.drawCell(ctx, look.skin, view.colorOf((cur || A).color), sx, sy, s);
      }
    },
  });

  L.TrainingView = { controller, coach, backSteps, BACKTRACK, STEP, FLASH, SPARK, SPARK_STILL, BEAT, GOOD, GOOD_STILL };
})(typeof globalThis !== 'undefined' ? globalThis : this);
