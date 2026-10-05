// Lull — Training on the Play tab (js/training.js has its rules): the controller over Classic's that judges each set
// and takes a poor one back, the coach's settings in the Training setup, and what it draws on the board: the piece
// going back up to where it appeared (about 300 ms; with reduced motion, back at once with a brief soft flash), the
// best spot as a calm outline once Hint after is reached, and, with Explanation on, why: the holes your spot covered
// (small rings), the rows the best one clears, the well it keeps open, how much higher yours stands, in at most two
// words.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Classic, Training, UI, Render, fmtInt } = L;
  if (!Recipe || !Classic || !Training || !UI) return;
  const { h } = UI;
  const ico = UI.icon;

  /** The piece's way back up (seconds), and the reduced-motion flash. */
  const BACK = 0.3, FLASH = 0.22;
  /** Thinking a frame (ms) while a piece is in play, so the judgement is ready by the time it is set. */
  const SLICE = 2;

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

    return {
      id: 'training', timeKey: null, uncounted: true,
      back: null, gen: null, ranked: null, forTurn: null,

      attach(game) {
        Object.assign(this, { back: null, gen: null, ranked: null, forTurn: null });
        play.view.training = this;
        // (A game from before its first turn was kept: its turn starts where it stands.)
        const t = T();
        if (t && !t.turn && game.piece && !game.over && !game.holdLocked) Training.newTurn(t, Training.snap(game));
      },
      detach() { this.finishBack(); if (play.view.training === this) play.view.training = null; },

      /** Classic's running, and not on the way back. */
      running() { return !this.back && this.base.running(); },
      blocked() { return !!this.back || this.base.blocked(); },
      /** The mouse and touch wait on the way back too. */
      handsOff() { return !!this.back; },
      /** On the way back, the keys wait (it is over in a moment); otherwise Classic's. */
      gate(act, rep) { return this.back && !G().over ? false : this.base.gate(act, rep); },
      countGame() {},
      counts() { return this.running(); },

      frame(now, dt) {
        if (this.back) this.backFrame(dt);
        this.ponder();
      },
      /** Leaving (a window, another tab, the app put away): the way back ends at once, so the game is saved as it is. */
      pause() { this.finishBack(); },

      /** The judgement of the turn in play, a slice a frame (ready, almost always, before the piece is set). */
      ponder() {
        const t = T(), g = G();
        if (!t || !t.turn || g.over || this.back) return;
        if (this.forTurn !== t.turn) { this.forTurn = t.turn; this.ranked = null; this.gen = Training.think(g, t.turn); }
        const t0 = performance.now();
        while (this.gen && performance.now() - t0 < SLICE) {
          const r = this.gen.next();
          if (r.done) { this.ranked = r.value; this.gen = null; }
        }
      },

      /** A set: judged; kept (its sound and picture, the level's callout) or taken back. Nothing is banked or counted. */
      onLock(r) {
        const g = G(), t = T();
        this.resets = 0; this.lockT = 0; this.acc = 0;
        g.s.mult = 1;
        const ranked = t && this.forTurn === t.turn ? this.ranked : null;
        const res = Training.place(g, r, app.settings, ranked);
        this.gen = null;
        if (res.act === 'rewind') this.startBack(r);
        else this.kept(r);
        play.renderStatus();
        play.renderItems();
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
       * A poor set: the game goes back to the turn's start in the next frame (after the lock is done with the next
       * piece), and the piece is drawn going back up from where it was set (BACK), or, with reduced motion, a flash.
       */
      startBack(r) {
        this.back = { due: true, t: 0, from: r.cells.map((c) => c.slice()), to: null, color: r.color, reduced: play.reduced };
        app.sound.play('item');
        play.view.dirty = true;
      },
      backFrame(dt) {
        const b = this.back, g = G();
        if (b.due) {
          b.due = false;
          Training.rewind(g);
          this.acc = 0; this.lockT = 0; this.resets = 0;
          b.to = g.piece ? g.absCells(g.piece) : b.from;
          play.renderStatus();
          play.renderItems();
          return;
        }
        b.t += dt;
        play.view.dirty = true;
        if (b.t >= (b.reduced ? FLASH : BACK)) this.endBack();
      },
      endBack() {
        this.back = null;
        this.acc = 0;
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
            t ? h('p', { class: 'tr-sum' }, fmtInt(t.placed) + ' placed · ' + (t.placed ? Training.firstPct(t) + ' first try · ' : '') + fmtInt(t.rewinds) + (t.rewinds === 1 ? ' rewind' : ' rewinds')) : null,
            h('div', { class: 'row' },
              pm.menuButton(),
              h('button', { class: 'btn primary', id: 'cl-again', onclick: () => ctl.again(cleared ? 'cleared' : 'full') }, ico('newBoard'), 'Play again')),
          ];
        },
      },

      /** The card it waits at: Training before the first piece falls, then Paused. The Menu from either. */
      showWait() {
        const c = C(), first = !c.started, o = Training.settingsOf(app.settings);
        const lbl = Recipe.label(G().recipe) || 'Training';
        play.showCard([
          h('h2', null, first ? 'Training' : 'Paused'),
          h('p', { class: 'cl-sub' }, lbl.replace(/^Training /, 'Game ')),
          first ? h('p', { class: 'tr-sub' }, Training.STRICT_NAMES[o.strict] + ' · hint after ' + o.hint + (o.hint === 1 ? ' try' : ' tries')) : null,
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
        el.replaceChildren(
          h('span', { class: 'tr-label', role: 'status', 'aria-label': 'Training: ' + t.placed + ' placed, ' + (t.placed ? Training.firstPct(t) + ' first try, ' : '') + t.rewinds + ' rewinds' },
            ico('training'), h('span', { class: 'tr-nm' }, 'Training'),
            h('span', { class: 'tr-ns', 'aria-hidden': 'true' }, n(fmtInt(t.placed), 'placed', 'tr-placed'), t.placed ? n(Training.firstPct(t), 'first try', 'tr-first') : null, n(fmtInt(t.rewinds), t.rewinds === 1 ? 'rewind' : 'rewinds', 'tr-rewinds'))),
          h('button', { class: 'btn sm tr-pause', disabled: !c.started || g.over || !!this.pile, 'aria-label': this.paused ? 'Resume' : 'Pause', 'data-tip': this.paused ? 'Resume' : 'Pause', 'data-tip-foot': 'P', onclick: () => (this.paused ? this.go() : this.setPause(true)) },
            ico(this.paused ? 'playIcon' : 'pause'), h('span', { class: 'lbl' }, this.paused ? 'Resume' : 'Pause')));
        el.classList.add('cl-bar', 'tr-bar');
        return true;
      },
      tiles: () => [],
    };
  }

  // ---- the setup: Classic's rules, then the coach --------------------------------------------------------------------

  /** The coach's settings (Settings, so they apply at once and stay): Strictness, Hint after, Explanation. */
  function coach(api) {
    const app = api.app || L.app, st = app.settings, o = Training.settingsOf(st);
    const set = (k, v) => { st[k] = v; app.store.touch(); if (app.modes && app.modes.play) app.modes.play.view.dirty = true; api.refresh(); };
    const btn = (k, v, label, on, tip) => h('button', { type: 'button', class: 'nb-level', 'data-focus': k + '=' + v, 'aria-pressed': String(on), 'data-tip': tip || null, onclick: () => set(k, v) }, label);
    const row = (label, kids) => h('div', { class: 'cl-row' }, h('span', { class: 'cl-nm' }, label), h('div', { class: 'seg cl-seg', role: 'group', 'aria-label': label }, kids));
    const TIPS = { gentle: 'Only clear mistakes: a new hole, needless height', standard: 'Any new hole, needless height, a rough top', strict: 'Anything notably below the best' };
    return h('div', { class: 'mn-field tr-coach' },
      h('span', { class: 'mn-lab' }, 'Coach'),
      h('div', { class: 'cl-set' },
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
   * Small pills of words, side by side and centred, under the rows where a piece appears (so the piece in play never
   * covers them), each in its colour.
   */
  function pills(ctx, view, words, colors) {
    const { board, s } = view.lay, fs = Math.max(10, Math.min(13, s * 0.5)), pad = fs * 0.55, ht = fs * 1.7, gap = 5;
    const light = view.look.theme.name === 'light';
    ctx.font = '650 ' + fs + 'px ' + Render.FONT;
    ctx.textBaseline = 'middle';
    const ws = words.map((w) => ctx.measureText(w).width + pad * 2);
    while (ws.length > 1 && ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1) > board.w - 8) ws.pop();
    let x = board.x + (board.w - (ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1))) / 2;
    const y = view.toScreen(0, view.game.h - 3)[1] + s * 0.15;
    ws.forEach((tw, i) => {
      const w = words[i];
      ctx.fillStyle = light ? 'rgba(255,255,255,0.88)' : 'rgba(20,22,30,0.82)';
      Render.rr(ctx, x, y, tw, ht, ht / 2); ctx.fill();
      ctx.strokeStyle = Render.rgba(colors[i], 0.55); ctx.lineWidth = 1; Render.rr(ctx, x + 0.5, y + 0.5, tw - 1, ht - 1, ht / 2); ctx.stroke();
      ctx.fillStyle = colors[i];
      ctx.fillText(w, x + pad, y + ht / 2 + 0.5);
      x += tw + gap;
    });
  }

  Recipe.viewPart({
    key: 'training', order: 46,
    busy: (view) => !!(view.training && view.training.back),
    /** On the way back the piece in play is drawn by overPiece, moving: its own cells wait. */
    pieceAlpha: (view) => (view.training && view.training.back && !view.training.back.reduced ? 0 : 1),
    /** Under the piece: Explanation's marks, then the best spot's outline (Hint after). */
    overStack(ctx, view) {
      const g = view.game, t = Training.of(g), ctl = view.training, st = L.app && L.app.settings;
      if (!t || !view.lay || g.over || (ctl && ctl.back && !ctl.back.reduced)) return;
      const { s, board } = view.lay, theme = view.look.theme, light = theme.name === 'light', acc = theme.accent, rose = light ? ROSE.light : ROSE.dark;
      const why = Training.whyOf(t, st), best = Training.hintOf(t, st);
      if (why) {
        // The rows the best spot clears, the well it keeps: soft bands.
        if (why.lines) for (const y of why.lines.rows) { const [, sy] = view.toScreen(0, y); ctx.fillStyle = Render.rgba(acc, 0.12); ctx.fillRect(board.x, sy, board.w, s); }
        if (why.well) {
          ctx.fillStyle = Render.rgba(acc, 0.1);
          for (let y = why.well.floor; y < g.h; y++) { const [sx, sy] = view.toScreen(why.well.x, y); ctx.fillRect(sx, sy, s, s); }
        }
        // Where yours went: a faint dashed outline; the holes it covered: small rings.
        ctx.strokeStyle = Render.rgba(rose, 0.75); ctx.lineWidth = Math.max(1.25, s * 0.06); ctx.setLineDash([Math.max(2, s * 0.16), Math.max(2, s * 0.12)]);
        outline(ctx, view, inside(view, why.mine));
        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        for (const [x, y] of why.holes) { const [sx, sy] = view.toScreen(x, y); ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, s * 0.2, 0, Math.PI * 2); ctx.stroke(); }
        // How high each stands after: a short tick at the side for yours (rose) and the best's (accent).
        if (why.height) {
          const tick = (rows, color) => { const [, sy] = view.toScreen(0, rows - 1); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(board.x + board.w - s * 0.9, sy); ctx.lineTo(board.x + board.w - 2, sy); ctx.stroke(); };
          tick(why.height.mine, Render.rgba(rose, 0.85));
          tick(why.height.best, Render.rgba(acc, 0.85));
        }
      }
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
      // (On a light board the accent's words a shade deeper, to read.)
      if (why && why.words.length) pills(ctx, view, why.words, why.words.map((w) => (/hole|high/.test(w) ? rose : light ? Render.shade(acc, -0.35) : acc)));
    },
    /** Over the piece: the piece on its way back up, or (reduced motion) a brief soft flash over the well. */
    overPiece(ctx, view) {
      const b = view.training && view.training.back;
      if (!b || b.due || !view.lay) return;
      const { s, board } = view.lay, look = view.look;
      if (b.reduced) {
        ctx.fillStyle = Render.rgba(look.theme.accent, 0.12 * Math.max(0, 1 - b.t / FLASH));
        ctx.fillRect(board.x, board.y, board.w, board.h);
        return;
      }
      const k = ease(Math.min(1, b.t / BACK)), to = b.to || b.from, color = view.colorOf(b.color);
      for (let i = 0; i < b.from.length; i++) {
        const a = b.from[i], z = to[i] || to[to.length - 1];
        const [ax, ay] = view.toScreen(a[0], a[1]), [zx, zy] = view.toScreen(z[0], z[1]);
        Render.drawCell(ctx, look.skin, color, ax + (zx - ax) * k, ay + (zy - ay) * k, s);
      }
    },
  });

  L.TrainingView = { controller, coach, BACK, FLASH };
})(typeof globalThis !== 'undefined' ? globalThis : this);
