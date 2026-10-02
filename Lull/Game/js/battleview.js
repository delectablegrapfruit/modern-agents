// Lull — Battle in Free Play (js/battle.js has its rules and the AI): the controller that runs a round (the Ready card,
// 3-2-1, the opponent's turns in time slices, Send, Start over, pausing, the End card), the view that draws both boards
// (the opponent's on top, turned 180° and dimmer, the two buffers meeting in the middle), its bar under the board, and its
// place in the New board window, the library and Stats.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Battle, UI, Render, Library, CELL, Pieces, fmtInt, fmtLines, fmtDuration } = L;
  if (!Recipe || !Battle || !UI || !Render) return;
  const { h } = UI;
  const ico = UI.icon;
  const { LINE } = L;
  const toast = (...a) => UI.toast(...a);

  // The icons it adds: the place (two boards meeting at a line) and Send (an arrow over the line).
  const svg = (body) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  const blk = (x, y) => '<rect x="' + x + '" y="' + y + '" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>';
  if (L.Icons) {
    L.Icons.I.battle = svg(blk(2, 1.5) + blk(6.5, 1.5) + blk(6.5, 10.5) + blk(10.5, 10.5) + '<path d="M1.75 8h12.5" stroke-dasharray="1.5 1.6"/>');
    L.Icons.I.send = svg('<path d="M8 13.5V3.5M4.25 7.25 8 3.5l3.75 3.75"/><path d="M2.25 1.75h11.5" opacity="0.55"/>');
  }

  /** Start over waits this long for its second press. */
  const ARM_MS = 3000;
  /** The countdown before play, in seconds. */
  const COUNT = 3;
  /** The opponent is drawn this much fainter than your board. */
  const OPP_ALPHA = 0.72;

  const pct = (game) => Math.round(Battle.fillOf(game) * 100) + '%';

  // ---- the opponent's board: a board view with no trays, turned 180°, in a box of the canvas -------------------------------

  class OppView extends Render.BoardView {
    constructor(canvas) { super(canvas, {}); this.cellS = 8; }
    /** Its well alone, centred in the box at the cell size it was given (no Hold, no Next). */
    layout(box) {
      const g = this.game, s = this.cellS, cols = g.w, rows = g.h;
      const bw = cols * s, bh = rows * s, WP = Math.max(2, Math.round(s * 0.16));
      const bx = Math.round(box.x + (box.w - bw) / 2), by = Math.round(box.y + (box.h - bh) / 2);
      const plate = { x: bx - WP, y: by - WP, w: bw + WP * 2, h: bh + WP * 2 };
      const off = { x: -9999, y: -9999, w: 0, h: 0 };
      this.lay = { s, ts: s, cols, rows, board: { x: bx, y: by, w: bw, h: bh }, hold: off, next: off, nextDir: 'v', wide: true, plate, lab: 0, pad: 0, box };
      this.fx.maxW = bw + WP * 2;
      this.lay.well = Render.wellRect(this.lay.board, s);
      return this.lay;
    }
    drawSide() {}
  }

  // ---- the controller ---------------------------------------------------------------------------------------------------------

  /**
   * A Battle board's controller (composed over the plain one: Recipe.compose). Its clock runs only while play.canRun()
   * and the round is on (not at a card, not counting down); away (another tab, window or app, the page hidden, a window
   * over it, rolled up) it pauses at the Paused card, and Resume counts down again.
   */
  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const M = () => Battle.matchOf(play.game);
    const me = () => M().me, ai = () => M().ai;
    const BS = () => app.store.state.stats.battle;
    const name = () => Battle.NAMES[M().level];
    const reduced = () => play.reduced;

    return {
      id: 'battle', view: 'battle', timed: true, timeKey: 'battle',
      paused: true, count: null, fade: { me: null, ai: null }, armedAt: 0, A: null, opp: null, stuckKey: null, sliceMax: 0, slices: 0,

      attach(game) {
        Object.assign(this, { paused: true, count: null, fade: { me: null, ai: null }, armedAt: 0, A: null, stuckKey: null });
        this.opp = new OppView(play.canvas);
        this.opp.attach(ai().game, { rot: 180 });
        this.opp.view.noGhost = true;
        play.view.battle = { ctl: this, opp: this.opp };
        this.onKeyUp = (e) => {
          if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.shiftDown) {
            const alone = this.shiftDown === 'alone';
            this.shiftDown = null;
            // Shift alone, let go: Hold, as everywhere (Shift+S sent instead).
            if (alone) play.action('hold');
          }
        };
        root.addEventListener('keyup', this.onKeyUp);
        const ph = M().round.phase;
        if (ph === 'end') this.showEnd();
        else if (ph === 'play') this.showPaused();
        else this.showReady();
      },
      detach() {
        if (this.onKeyUp) root.removeEventListener('keyup', this.onKeyUp);
        this.onKeyUp = null;
        if (play.view.battle && play.view.battle.ctl === this) play.view.battle = null;
      },

      /** The round is on and nothing holds it. */
      running() {
        // (play.canRun, less its "not over": a board that could not take its next piece is starting over, in time.)
        return M().round.phase === 'play' && !this.paused && !this.count && app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen()
          && !play.cardOpen && !play.fullView && !document.hidden && document.hasFocus();
      },
      counts() { return this.running(); },
      tapStarts() { const ph = M().round.phase; return (ph === 'ready' || (ph === 'play' && this.paused)) && !UI.modalOpen(); },

      // ---- cards ----
      sub() { return 'Battle · ' + name(); },
      showReady() {
        play.showCard([
          h('h2', null, 'Battle'),
          h('p', { class: 'bt-sub' }, 'vs ' + name()),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => play.openLibrary() }, ico('boards'), 'Boards'),
            h('button', { class: 'btn primary', id: 'bt-go', onclick: () => this.go() }, 'Start ', h('kbd', null, 'Space'))),
        ], 'bt-card bt-ready');
      },
      showPaused() {
        play.showCard([
          h('h2', null, 'Paused'),
          h('p', { class: 'bt-sub' }, this.sub()),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => play.openLibrary() }, ico('boards'), 'Boards'),
            h('button', { class: 'btn primary', id: 'bt-go', onclick: () => this.go() }, 'Resume ', h('kbd', null, 'Space'))),
        ], 'bt-card bt-paused');
      },
      showCount() {
        const n = Math.max(1, Math.ceil(this.count.left));
        if (this.count.shown === n && play.cardOpen) return;
        this.count.shown = n;
        play.showCard([h('p', { class: 'bt-count', 'aria-live': 'assertive' }, String(n))], 'bt-card bt-counting');
      },
      showEnd() {
        const m = M(), won = m.round.winner === 'me', G = g();
        const paid = Library.bank(m.round.paid || 0);
        const picker = h('div', { class: 'seg bt-pick', role: 'group', 'aria-label': 'Opponent' }, Battle.IDS.map((id) => h('button', {
          type: 'button', 'aria-pressed': String(id === m.level), 'data-level': id,
          onclick: () => { this.setLevel(id); this.showEnd(); const b = play.overlay.querySelector('[data-level="' + id + '"]'); if (b) b.focus(); },
        }, Battle.NAMES[id])));
        play.showCard([
          h('h2', null, won ? 'You win' : 'Opponent wins'),
          h('p', null, 'You ' + pct(G) + ' · ' + name() + ' ' + pct(ai().game)),
          h('p', null, Battle.tallyText(m) + ' · ' + fmtDuration(Math.max(1000, m.round.ms)) + (paid ? ' · ' : ''), paid ? h('span', { class: 'gem' }, '+' + fmtLines(paid) + ' ' + LINE) : null),
          h('div', { class: 'bt-opp' }, h('span', { class: 'bt-opp-l' }, 'Opponent'), picker),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => play.openLibrary() }, ico('boards'), 'Boards'),
            h('button', { class: 'btn', onclick: () => play.newBoard('manual') }, ico('retire'), 'Retire'),
            h('button', { class: 'btn primary', id: 'bt-again', onclick: () => this.rematch() }, 'Rematch ', h('kbd', null, 'Space'))),
        ], 'bt-card bt-end topout');
      },

      /** The opponent's level for the rounds to come (the board's label says it too). */
      setLevel(id) {
        const m = M();
        if (!Battle.IDS.includes(id) || id === m.level) return;
        m.level = id;
        g().recipe.battle.level = id;
        ai().lvl = Battle.LEVELS[id];
        play.renderStatus();
        app.store.touch();
      },

      /** Start (the Ready card), Resume (Paused): a 3-2-1 first. */
      go() {
        const m = M();
        if (m.round.phase === 'end') return;
        this.count = { left: COUNT, shown: 0 };
        this.showCount();
        play.renderItems();
      },
      setPause(on) {
        const m = M();
        if (m.round.phase !== 'play' && !(m.round.phase === 'ready' && this.count)) return;
        if (on) { this.paused = true; this.count = null; this.showPaused(); }
        play.renderItems();
      },
      pause() {
        const m = M();
        // A countdown before the first piece goes back to the Ready card; a round on, to Paused.
        if (this.count && m.round.phase === 'ready') { this.count = null; this.showReady(); play.renderItems(); return; }
        if (m.round.phase === 'play' && (!this.paused || this.count)) this.setPause(true);
      },
      rematch() {
        const m = M();
        if (m.round.phase !== 'end') return;
        Battle.newRound(m);
        this.A = null; this.fade = { me: null, ai: null }; this.stuckKey = null;
        play.view.fx.clear(); this.opp.fx.clear();
        play.view.dirty = true;
        app.store.touch();
        this.go();
      },

      gate(act, rep) {
        const m = M(), ph = m.round.phase;
        if (ph === 'end') {
          if (act === 'drop' && !rep && play.cardOpen && !play.settling('drop')) { this.rematch(); return true; }
          return false;
        }
        if (this.count) return false;
        if (ph === 'ready' || this.paused) {
          if (!rep && (act === 'drop' || act === 'pause')) { this.go(); return true; }
          return false;
        }
        if (act === 'pause') { if (!rep) this.setPause(true); return true; }
        if (this.fade.me) return false;
        return undefined;
      },

      // ---- the clock ----
      frame(now, dt) {
        const m = M();
        if (!m) return;
        dt = Math.min(dt, 0.1);
        this.opp.fx.update(dt);
        if (this.count) {
          // The countdown runs only where play would (nothing over the board but its own card).
          const ok = app.tab === 'play' && !UI.modalOpen() && !document.hidden && !(L.Collapse && L.Collapse.on) && !play.fullView;
          if (ok) this.count.left -= dt;
          if (this.count.left <= 0) {
            this.count = null;
            this.paused = false;
            if (m.round.phase === 'ready') m.round.phase = 'play';
            play.hideCard();
            play.renderItems();
            app.store.touch();
          } else this.showCount();
          return;
        }
        if (!this.running()) return;
        m.round.ms += dt * 1000;
        this.fadeFrame('me', dt);
        this.fadeFrame('ai', dt);
        if (M().round.phase !== 'play') return;
        // No piece of yours can be set (in play, held or sent on): your board starts over.
        if (!this.fade.me) {
          const G = g(), key = G.piece ? me().ver + ':' + G.piece.type.id + ':' + (G.hold ? G.hold.id : '') + ':' + me().S.cd : null;
          if (key && key !== this.stuckKey) { this.stuckKey = key; if (Battle.stuck(me())) this.startReset('me'); }
        }
        this.aiFrame(dt);
        if (m.round.phase === 'play' && Math.floor(m.round.ms / 1000) !== this.lastSec) { this.lastSec = Math.floor(m.round.ms / 1000); }
      },

      /** A board starting over, drawn fading out over its well. */
      fadeOver(ctx, view, who) {
        const f = this.fade[who];
        if (!f || !view.lay) return;
        const k = f.dur ? Math.min(1, f.t / f.dur) : 1, b = view.lay.board;
        ctx.save();
        ctx.globalAlpha = 0.85 * k;
        ctx.fillStyle = view.look.theme.well || view.look.theme.bg || '#000';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
      },
      /** A board starting over: it fades (RESET_FADE seconds; at once with reduced motion), then empties. */
      startReset(who) {
        if (this.fade[who] || M().round.phase !== 'play') return;
        this.fade[who] = { t: 0, dur: reduced() ? 0 : Battle.RESET_FADE };
        if (who === 'ai') this.A = null;
        play.view.dirty = true;
        if (!this.fade[who].dur) this.fadeFrame(who, 0);
      },
      fadeFrame(who, dt) {
        const f = this.fade[who];
        if (!f) return;
        f.t += dt;
        play.view.dirty = true;
        if (f.t < f.dur) return;
        this.fade[who] = null;
        const sd = who === 'me' ? me() : ai();
        Battle.resetSide(sd);
        if (who === 'me') { M().round.resets++; BS().resets++; this.stuckKey = null; if (g().over) { g().over = false; if (!g().piece) g().spawnNext(); } play.renderStatus(); play.renderItems(); }
        else { this.A = null; if (sd.game.over) { sd.game.over = false; if (!sd.game.piece) sd.game.spawnNext(); } }
        app.store.touch();
      },

      // ---- the opponent ----
      aiFrame(dt) {
        const m = M(), sd = ai(), G = sd.game;
        if (this.fade.ai) return;
        if (G.over || !G.piece) { this.startReset('ai'); return; }
        let A = this.A;
        if (!A || (!A.path && (A.ver !== sd.ver || A.piece !== G.piece))) {
          const lv = sd.lvl;
          A = this.A = { gen: Battle.think(sd, me(), {}), ver: sd.ver, piece: G.piece, d: null, path: null, t: 0, wait: lv.pace * (0.7 + 0.6 * sd.rng.next()), stepT: 0 };
        }
        A.t += dt;
        if (A.gen) {
          // At most a couple of ms a frame (a generator: it stops between pieces of work).
          const r = Battle.slice(A.gen, 0.75);
          this.sliceMax = Math.max(this.sliceMax, r.ms); this.slices++;
          if (this.sliceLog) this.sliceLog.push(Math.round(r.ms * 100) / 100);
          if (r.done) {
            A.d = r.value; A.gen = null;
            // How long its path will take (it thinks for the rest of the piece's time).
            const pth = A.d && A.d.kind === 'place' && !A.d.hold ? Battle.pathTo(G, A.d.target) : null;
            A.est = pth ? pth.length : 8;
          }
          else return;
        }
        if (!A.path) {
          const d = A.d, sps = sd.lvl.sps;
          if (!d) return;
          if (d.kind === 'send') {
            if (A.t < Math.max(0.3, A.wait * 0.4)) return;
            const e = Battle.send(sd, me(), 'current');
            if (e) { this.received(e); this.A = null; return; }
            A.gen = Battle.think(sd, me(), { send: false }); A.d = null;
            return;
          }
          if (d.kind !== 'place') { this.startReset('ai'); return; }
          // Its path takes moves at its pace; it thinks for the rest of the piece's time.
          if (A.t < Math.max(0.25, A.wait - (A.est || 8) / sps)) return;
          if (d.hold && !G.holdPiece()) { this.A = null; return; }
          const path = Battle.pathTo(G, d.target);
          if (!path) { this.A = null; return; }
          A.path = path; A.stepT = 0;
          // With reduced motion the piece jumps: its path is played at once.
          if (reduced()) { this.playPath(A, Infinity); return; }
          this.opp.dirty = true;
        }
        A.stepT += dt;
        this.playPath(A, Math.floor(A.stepT * sd.lvl.sps));
      },
      playPath(A, n) {
        const sd = ai(), G = sd.game;
        while (n-- > 0 && A.path && A.path.length) {
          A.stepT = Math.max(0, A.stepT - 1 / sd.lvl.sps);
          const m = A.path.shift(), res = Battle.play(G, m);
          if (res && typeof res === 'object') { this.A = null; this.aiLocked(res); return; }
          if (!res) {
            // The board changed under it (a filler): find the way again, or think again.
            const p = Battle.pathTo(G, A.d.target);
            if (!p) { this.A = null; return; }
            A.path = p;
          }
        }
      },
      /** A piece the opponent sent you: it comes in at the front of your queue (after any sent before it). */
      received() {
        app.sound.play('hold');
        play.view.dirty = true;
        play.renderItems();
        const b = play.fxLay().board;
        if (!reduced()) play.view.fx.text('SENT TO YOU', b.x + b.w / 2, b.y + b.h * 0.25, '#f6c177', 14);
      },
      aiLocked(res) {
        const m = M(), sd = ai();
        this.opp.onLock(res, reduced());
        const ev = Battle.afterLock(sd, me(), res);
        this.showFills(ev.filled, this.opp);
        if (ev.earned) this.earned();
        this.showFills(ev.foeFilled, play.view);
        if (ev.won) { this.endRound('ai'); return; }
        if (ev.foeWon) { this.endRound('me'); return; }
        if (ev.topout || Battle.givesUp(sd)) this.startReset('ai');
        if (ev.foeFilled.length) play.renderStatus();
        if (m.round.phase === 'play') play.renderStatus();
      },
      /** You earned a Gap filler (a piece you sent sealed a gap on their board). */
      earned() {
        BS().earned++;
        app.sound.play('golden');
        const b = play.fxLay().board;
        play.view.fx.text('GAP FILLER', b.x + b.w / 2, b.y + b.h * 0.3, '#8fe3ff', 16);
        play.renderItems();
        app.achieve({ mode: 'battle', earned: true, level: M().level, cells: g().w * Battle.goal(g()) });
      },
      showFills(regions, view) {
        if (!regions || !regions.length) return;
        if (view === play.view) BS().fillers += regions.length;
        const s = view.lay && view.lay.s;
        if (!s) return;
        for (const reg of regions) for (const [x, y] of reg) { const [sx, sy] = view.toScreen(x, y); view.fx.flash(sx, sy, s, s, '#9ccfd8', reduced() ? 0.01 : 0.5); }
        view.dirty = true;
      },

      // ---- your pieces ----
      onLock(r) {
        const st = app.store, F = st.state.stats.free, G = g();
        play.syncCounters();
        F.pieces++;
        st.day().pieces++;
        L.Modes.playLockSound(app.sound, r);
        play.view.onLock(r, reduced());
        if (r.trimmed && r.trimmed.length && !reduced()) {
          const s = play.view.lay.s, look = play.view.look;
          play.view.fx.fadeCells(r.trimmed.map(([x, y]) => { const [sx, sy] = play.view.toScreen(x, y); return { x: sx, y: sy, s, color: play.view.colorOf(r.color || 8) }; }), look.skin, 0.6);
        }
        const ev = Battle.afterLock(me(), ai(), r);
        this.showFills(ev.filled, play.view);
        this.showFills(ev.foeFilled, this.opp);
        if (ev.won) this.endRound('me');
        else if (ev.foeWon) this.endRound('ai');
        else if (ev.topout) this.startReset('me');
        play.renderStatus();
        play.renderItems();
        st.touch();
        void G;
      },
      /** Your board could not take its next piece (no room at all): it starts over. */
      onEnd() { if (M().round.phase === 'play') this.startReset('me'); else { g().over = false; } },

      /** Send: the piece in play ('current') or the first Next piece ('next'). */
      sendMine(which) {
        const m = M();
        if (m.round.phase !== 'play' || !this.running() || this.fade.me) return false;
        const sd = me(), G = g();
        if (sd.S.cd > 0) { toast('Send is ready in ' + sd.S.cd + (sd.S.cd === 1 ? ' piece' : ' pieces'), 'bad', 1600); app.sound.play('error'); return false; }
        const e = which === 'next' ? G.queue[0] : G.piece && G.piece.entry;
        if (e && e.received) { toast('A piece you were sent stays', 'bad', 1600); app.sound.play('error'); return false; }
        const out = Battle.send(sd, ai(), which);
        if (!out) { app.sound.play('error'); return false; }
        BS().sends++;
        app.sound.play('hold');
        this.stuckKey = null;
        play.view.dirty = true; this.opp.dirty = true;
        play.renderItems();
        app.store.touch();
        return true;
      },
      /** Start over: the first press asks ("Start over?" for 3 s), the second does it. */
      startOver() {
        const m = M();
        if (m.round.phase !== 'play' || this.paused || this.count || this.fade.me) return;
        const t = performance.now();
        if (!this.armedAt || t - this.armedAt > ARM_MS) {
          this.armedAt = t;
          play.renderItems();
          clearTimeout(this.armTimer);
          this.armTimer = setTimeout(() => { this.armedAt = 0; play.renderItems(); }, ARM_MS);
          return;
        }
        this.armedAt = 0;
        clearTimeout(this.armTimer);
        this.startReset('me');
        play.renderItems();
      },

      /** The round is over: the tally, the pay (once, for your board as it ends), the records, the card. */
      endRound(winner) {
        const m = M(), st = app.store, S = BS(), G = g(), won = winner === 'me';
        if (m.round.phase !== 'play') return;
        this.A = null; this.fade = { me: null, ai: null };
        const pay = Library.bank(Battle.endRound(m, winner));
        m.round.paid = pay;
        S.rounds++;
        if (won) S.wins++; else S.losses++;
        S.bestStreak = Math.max(S.bestStreak || 0, m.streak);
        const bl = S.byLevel[m.level] = Array.isArray(S.byLevel[m.level]) ? S.byLevel[m.level] : [0, 0];
        bl[won ? 0 : 1]++;
        if (pay > 0) {
          st.addLines(pay, 'battle');
          S.paid = Library.bank((S.paid || 0) + pay);
          G.s.banked = Library.bank((G.s.banked || 0) + pay);
          const F = st.state.stats.free;
          F.lines = Library.bank(F.lines + pay);
          // A power-up for every two hundred Standard lines a board pays (Earn), counted from the match's start.
          const before = m.earnLines || 0;
          m.earnLines = Library.bank(before + pay);
          const due = L.Earn ? L.Earn.lines(st.state.earn, m.since, m.earnLines, before) : 0;
          for (let k = 0; k < due; k++) play.earnItem();
          app.refreshWallet(true);
        }
        app.sound.play(won ? 'solve' : 'fail');
        app.achieve({ mode: 'battle', won, level: m.level, cells: G.w * Battle.goal(G), resets: m.round.resets, sealed: me().S.sealedAny, streak: m.streak });
        this.showEnd();
        play.renderStatus();
        play.renderItems();
        st.touch();
        if (app.saveNow) app.saveNow();
      },

      // ---- keys and input ----
      onKey(e) {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          // Shift holds when it is let go alone; held for Shift+S it sends the first Next piece instead.
          if (!e.repeat) this.shiftDown = 'alone';
          return true;
        }
        if (e.code !== 'KeyS' || e.altKey || e.metaKey || e.ctrlKey) return false;
        if (e.repeat) return true;
        if (this.shiftDown) this.shiftDown = 'used';
        this.sendMine(e.shiftKey ? 'next' : 'current');
        return true;
      },
      action(a, rep) { if (a === 'pause') { if (!rep) this.setPause(true); return true; } return false; },
      /** The first Next slot's box (a tap or a click there sends that piece while Send is ready), at least 44 px. */
      nextSlot() {
        const lay = play.view.lay;
        if (!lay) return null;
        const n = lay.next, ts = lay.ts;
        const r = lay.nextDir === 'v' ? { x: n.x, y: n.y, w: n.w, h: Math.round(ts * 2.5) } : { x: n.x, y: n.y, w: Math.min(n.w, Math.round(ts * 3.4)), h: n.h };
        const w = Math.max(44, r.w), hh = Math.max(44, r.h);
        return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - hh / 2, w, h: hh };
      },
      onNext(pos) { const b = this.nextSlot(); return !!b && !!pos && pos[0] >= b.x && pos[0] <= b.x + b.w && pos[1] >= b.y && pos[1] <= b.y + b.h; },
      input(kind, v, pos) {
        if ((kind === 'click' || kind === 'tap') && this.running() && me().S.cd === 0 && this.onNext(kind === 'click' ? v : pos)) {
          this.sendMine('next');
          return kind === 'click' ? true : null;
        }
        return v;
      },
      fx() { return play.view.lay; },

      // ---- the status bar, the bar, the summary ----
      status(parts, o) {
        const m = M(), stat = o.stat, tip = Battle.tallyText(m) + (m.streak > 1 ? ' · ' + m.streak + ' wins in a row' : '');
        return [stat('You', pct(g()), 'bt-you', tip), stat(name(), pct(ai().game), 'bt-them', tip)];
      },
      bar(el) {
        const m = M(), sd = me(), on = m.round.phase === 'play' && !this.paused && !this.count, ready = on && sd.S.cd === 0;
        const segs = Battle.COOLDOWN, lit = segs - Math.min(segs, sd.S.cd);
        // The ring: one segment for each piece of the cooldown, lit as they are set; whole when Send is ready.
        const R = 15, C = 2 * Math.PI * R, seg = C / segs, gap = 2.2;
        const ring = '<svg class="bt-ring" viewBox="0 0 36 36" aria-hidden="true">' + Array.from({ length: segs }, (_, i) =>
          '<circle cx="18" cy="18" r="' + R + '" fill="none" stroke-width="3" class="' + (i < lit ? 'on' : 'off') + '" stroke-dasharray="' + (seg - gap).toFixed(2) + ' ' + (C - seg + gap).toFixed(2) + '" stroke-dashoffset="' + (-(i * seg) + C / 4).toFixed(2) + '"/>').join('') + '</svg>';
        const dots = h('span', { class: 'bt-dots', 'aria-hidden': 'true' }, Array.from({ length: Battle.MAX_CHARGES }, (_, i) => h('i', { class: i < sd.S.charges ? 'on' : '' })));
        const armed = !!this.armedAt && performance.now() - this.armedAt <= ARM_MS;
        const fillWord = sd.S.charges ? ', ' + sd.S.charges + ' gap filler' + (sd.S.charges > 1 ? 's' : '') + ' held' : '';
        el.replaceChildren(
          h('button', { class: 'btn bt-send' + (ready ? ' ready' : ''), 'aria-disabled': String(!ready), 'aria-label': (ready ? 'Send' : 'Send, ready in ' + sd.S.cd) + fillWord,
            'data-tip': ready ? 'Send the piece in play' : 'Ready in ' + sd.S.cd + (sd.S.cd === 1 ? ' piece' : ' pieces'), 'data-tip-foot': 'S · Shift+S: the next one',
            onclick: () => this.sendMine('current') }, h('span', { class: 'bt-ic', html: ring + L.Icons.icon('send') }), h('span', { class: 'lbl' }, 'Send'), dots),
          h('button', { class: 'btn' + (armed ? ' armed' : ''), 'aria-disabled': String(!on), 'data-tip': armed ? 'Press again to start over' : 'Start this board over',
            onclick: () => this.startOver() }, ico('retry'), h('span', { class: 'lbl' }, armed ? 'Start over?' : 'Start over')),
          h('button', { class: 'btn', 'aria-disabled': String(!on), 'data-tip': 'Pause', 'data-tip-foot': 'P', onclick: () => this.setPause(true) }, ico('pause'), h('span', { class: 'lbl' }, 'Pause')));
        el.classList.add('bt-bar');
        return true;
      },
      tiles(game) {
        const m = Battle.matchOf(game);
        if (!m) return [];
        const t = Battle.tallyOf(m, m.level);
        return [[t[0] + '–' + t[1], 'vs ' + Battle.NAMES[m.level]]];
      },
    };
  }

  // ---- the view part: both boards, the middle band, fillers and sealed gaps --------------------------------------------------

  /** Sealed cells of a game, worked out again only when its side changed (ver). */
  const sealedCache = new WeakMap();
  function sealedCells(game) {
    const sd = Battle.side(game);
    if (!sd) return [];
    const c = sealedCache.get(game);
    if (c && c.ver === sd.ver && c.cells === game.board.cells) return c.list;
    const s = Battle.sealedOf(game, { budget: 2 }), list = [];
    for (const reg of s.regions) for (const xy of reg) list.push(xy);
    sealedCache.set(game, { ver: sd.ver, cells: game.board.cells, list });
    return list;
  }

  /** A filler cell: a stone in the theme's grey with a fine diagonal grain (never one of the pieces' colours). */
  function drawFill(ctx, x, y, s, theme) {
    const light = theme.name === 'light';
    ctx.save();
    ctx.fillStyle = light ? '#b9b3a9' : '#5d6270';
    Render.rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, Math.max(1, s * 0.14)); ctx.fill();
    ctx.beginPath(); Render.rr(ctx, x + 0.5, y + 0.5, s - 1, s - 1, Math.max(1, s * 0.14)); ctx.clip();
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath();
    for (let k = -s; k < s; k += Math.max(3, s * 0.3)) { ctx.moveTo(x + k, y + s); ctx.lineTo(x + k + s, y); }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Where the two boards go in the canvas: yours at the bottom (its plate, trays beside the well), the opponent's well
   * above it, the middle band between. Your cells come first: the opponent is drawn at your scale while your cells stay
   * 16 px or more; below that theirs shrink, to half yours at the least. { mine (a box for BoardView.layout), opp (its
   * well's box), s, so }.
   */
  function boxes(view, ctl) {
    const W = view.cssW, H = view.cssH, g = view.game, a = ctl.opp.game;
    const Rm = g.h, Ro = a.h, cols = Math.max(g.w, a.w);
    const TOP = 2, GAP = 4, BOT = 2;
    const P = (s) => Math.round(0.42 * s), WP = (s) => Math.max(3, Math.round(0.16 * s));
    const plateH = (s) => s * Rm + 2 * P(s) + 2 * WP(s);
    const plateW = (s) => cols * s + 2 * (Math.max(Math.round(2.7 * s), 36) + Math.round(0.4 * s)) + 2 * P(s) + 2 * WP(s) + 16;
    const wellH = (so) => so * Ro + 2 * Math.max(2, Math.round(0.16 * so));
    const room = (s) => H - TOP - GAP - BOT - plateH(s);
    const fits = (s, so) => plateW(s) <= W && wellH(so) <= room(s);
    let s = 40;
    // At one scale for both, while yours stay 16 px or more.
    while (s > 16 && !fits(s, s)) s--;
    let so = s;
    if (!fits(s, s)) {
      // Theirs smaller (to half yours), yours as large as that leaves room for.
      s = 40;
      while (s > 4 && !fits(s, s / 2)) s--;
      so = s;
      while (so > s / 2 && wellH(so) > room(s)) so -= 0.5;
      so = Math.max(s / 2, so);
    }
    // (layout() keeps 8 px about the plate in its box and fits s to the box; render() then sets the plate on the bottom.)
    const bh = Math.ceil(s * (Rm + 1.24)) + 17;
    return { mine: { x: 0, y: H - BOT - bh + 8, w: W, h: bh }, s, so, wellH, GAP, BOT };
  }

  const VIEW = {
    key: 'battle', order: 50, layout: 'battle',
    dangerRim: false,
    claims: (v) => !!(v & CELL.FILL),
    cell(ctx, v, x, y, s, kind, view) { drawFill(ctx, x, y, s, view.look.theme); },
    /** The buffer (a soft band, the board's edge dashed) and the sealed gaps' hatch. */
    overStack(ctx, view) {
      const g = view.game, lay = view.lay, s = lay.s, k = g.h - Battle.goal(g), th = view.look.theme, light = th.name === 'light';
      if (k > 0) {
        const [x0, y0] = view.toScreen(0, g.h - 1), [x1, y1] = view.toScreen(g.w - 1, Battle.goal(g));
        const bx = Math.min(x0, x1), by = Math.min(y0, y1), bw = Math.abs(x1 - x0) + s, bh = Math.abs(y1 - y0) + s;
        ctx.fillStyle = light ? 'rgba(40,50,70,0.05)' : 'rgba(255,255,255,0.035)';
        ctx.fillRect(bx, by, bw, bh);
        // The board's edge: where a piece must reach to set.
        const ey = view.view.rot === 180 ? by : by + bh;
        ctx.strokeStyle = Render.rgba(th.accent, light ? 0.45 : 0.4); ctx.lineWidth = 1; ctx.setLineDash([Math.max(2, s * 0.25), Math.max(2, s * 0.2)]);
        ctx.beginPath(); ctx.moveTo(bx, Math.round(ey) + 0.5); ctx.lineTo(bx + bw, Math.round(ey) + 0.5); ctx.stroke();
        ctx.setLineDash([]);
      }
      // Sealed gaps: a soft hatch (no piece of the set can reach them; a Gap filler can).
      const list = sealedCells(g);
      if (list.length) {
        ctx.strokeStyle = light ? 'rgba(160,70,90,0.5)' : 'rgba(235,111,146,0.5)'; ctx.lineWidth = Math.max(1, s * 0.08);
        for (const [x, y] of list) {
          const [sx, sy] = view.toScreen(x, y);
          ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, s, s); ctx.clip();
          ctx.beginPath();
          for (let d = -s; d < s; d += Math.max(3, s / 3)) { ctx.moveTo(sx + d, sy + s); ctx.lineTo(sx + d + s, sy); }
          ctx.stroke(); ctx.restore();
        }
      }
    },
    /** A piece you were sent: outlined while it is in play. */
    overPiece(ctx, view) {
      const g = view.game, p = g.piece;
      if (!p || !(p.entry && p.entry.received)) return;
      const s = view.lay.s;
      ctx.strokeStyle = '#f6c177'; ctx.lineWidth = Math.max(1.5, s * 0.1);
      for (const [x, y] of g.absCells(p)) { const [sx, sy] = view.toScreen(x, y); ctx.strokeRect(sx + 1, sy + 1, s - 2, s - 2); }
    },
    busy(view) { const B = view.battle; return !!(B && (B.ctl.fade.me || B.ctl.fade.ai || B.opp.fx.active || B.opp.dirty || (B.ctl.A && B.ctl.A.path && B.ctl.running()))); },

    /** The whole frame: the opponent's board on top (turned 180°, fainter), the midline, your board unit below. */
    render(view, ctx, now) {
      const B = view.battle;
      if (!B || !B.opp.game) { if (!view.lay || view.lay.box) view.layout(); view.drawPlate(ctx); view.paint(ctx, null, now); return; }
      const ctl = B.ctl, opp = B.opp, th = view.look.theme;
      const bx = boxes(view, ctl);
      // Yours: laid out in its box (trays beside it), then theirs at a scale from yours.
      const same = (p, q) => p && q && p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
      if (!view.lay || !same(view.lay.box, view.battleBox)) {
        view.layout(bx.mine);
        // The plate on the bottom of the canvas (less its margin).
        const dy = view.cssH - bx.BOT - (view.lay.plate.y + view.lay.plate.h);
        view.battleBox = dy ? Object.assign({}, bx.mine, { y: bx.mine.y + dy }) : bx.mine;
        if (dy) view.layout(view.battleBox);
      }
      opp.cellS = Math.min(bx.so, view.lay.s);
      const oh = bx.wellH(opp.cellS);
      opp.layout({ x: 0, y: view.lay.plate.y - bx.GAP - oh, w: view.cssW, h: oh });
      opp.look = view.look; opp.reducedMotion = view.reducedMotion;
      ctx.save();
      ctx.globalAlpha = OPP_ALPHA;
      opp.paint(ctx, opp.lay.box, now);
      ctx.restore();
      ctl.fadeOver(ctx, opp, 'ai');
      // The midline between the two buffers.
      const midY = Math.round((opp.lay.board.y + opp.lay.board.h + view.lay.plate.y) / 2) + 0.5;
      ctx.save();
      ctx.strokeStyle = Render.rgba(th.accent, th.name === 'light' ? 0.35 : 0.3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(view.lay.plate.x + 6, midY); ctx.lineTo(view.lay.plate.x + view.lay.plate.w - 6, midY); ctx.stroke();
      ctx.restore();
      view.drawPlate(ctx);
      view.paint(ctx, view.battleBox, now);
      ctl.fadeOver(ctx, view, 'me');
      // A piece you were sent, waiting first in Next: ringed.
      const q0 = view.game.queue[0];
      if (q0 && q0.received) {
        const r = ctl.nextSlot();
        if (r) { const n = view.lay.next, ts = view.lay.ts, rr = view.lay.nextDir === 'v' ? { x: n.x, y: n.y, w: n.w, h: Math.round(ts * 2.5) } : { x: n.x, y: n.y, w: Math.min(n.w, Math.round(ts * 3.4)), h: n.h };
          ctx.save(); ctx.strokeStyle = '#f6c177'; ctx.lineWidth = 2; Render.rr(ctx, rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2, Math.min(10, ts * 0.36)); ctx.stroke(); ctx.restore(); }
      }
      opp.dirty = false;
    },
  };
  Recipe.viewPart(VIEW);


  // ---- the New board window, the library, Stats ------------------------------------------------------------------------------

  // Battle keeps its own size: entering it, the size asked for before is put aside (and comes back on leaving).
  let asideAsked = null, battleAsked = null;
  Recipe.uiPart({
    key: 'battle', order: 50, mode: 'battle', name: 'Battle',
    levels: () => ({ path: 'battle.level', values: Battle.IDS.map((v) => [v, Battle.NAMES[v]]) }),
    stepper: (r, k) => (Battle.on(r) && k === 'h' ? { label: 'Rows' } : null),
    presets: (r) => (Battle.on(r) ? Battle.PRESETS.map((p) => p.slice()) : null),
    sizeFor(r, asked) {
      const inB = (z) => z && z.w >= Battle.LIMITS.w[0] && z.w <= Battle.LIMITS.w[1] && z.h >= Battle.LIMITS.rows[0] && z.h <= Battle.LIMITS.rows[1];
      if (Battle.on(r)) {
        if (inB(asked)) return null;
        asideAsked = asked;
        return battleAsked || { w: Battle.SIZE.w, h: Battle.SIZE.h };
      }
      if (asideAsked && inB(asked)) { battleAsked = asked; const back = asideAsked; asideAsked = null; return back; }
      return null;
    },
    tags: (r, x) => (Battle.on(r) && x && x.match ? [{ text: Battle.tallyText(Object.assign({ tally: {} }, x.match, { tally: Object.assign({}, x.match.tally) })) }] : []),
    tiles: (ext) => (ext && ext.level ? [[ext.won + '–' + ext.lost, 'vs ' + Battle.NAMES[ext.level]], [fmtInt(ext.rounds), 'Rounds']] : []),
  });

  UI.statRow('battle', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const S = stats.battle;
      if (!S || !S.rounds) return null;
      const rows = [['Rounds', S.rounds], ['Won', S.wins], ['Lost', S.losses], ['Most in a row', S.bestStreak || 0], ['Sent', S.sends], ['Gap fillers earned', S.earned], ['Started over', S.resets]];
      const lv = Battle.IDS.filter((id) => Array.isArray(S.byLevel && S.byLevel[id])).map((id) => ['vs ' + Battle.NAMES[id], S.byLevel[id][0] + '–' + S.byLevel[id][1]]);
      return [h('h4', null, 'Battle'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, fmtInt(v)))).concat(
        lv.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, v))),
        [h('tr', null, h('td', null, 'Time played'), h('td', null, fmtDuration(stats.timeMs.battle || 0)))]))];
    },
  });

  L.BattleView = { controller, OppView, VIEW, boxes, sealedCells, ARM_MS, COUNT };
  void Pieces;
})(typeof globalThis !== 'undefined' ? globalThis : this);
