// Lull — Battle in Free Play (js/battle.js has its rules and the AI): the controller that runs a round (the cards and
// the clock are js/versusview.js's; here the opponent's turns in time slices, aiming and throwing, the ceilings, the end),
// the view that draws both boards (the opponent's on top, turned 180°) with the aiming shadow, its bar under the board
// (Throw with its charge dots, Pause), and its place in the Custom window, the menu and Stats.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Battle, UI, Render, Library, fmtInt, fmtLines, fmtDuration, VersusView: VV } = L;
  if (!Recipe || !Battle || !UI || !Render || !VV) return;
  const { h } = UI;
  const ico = UI.icon;
  const { LINE } = L;
  const toast = (...a) => UI.toast(...a);
  const { OppView } = VV;

  // The icons it adds: the place (a block arcing over the line between two boards) and Throw (the arc alone).
  const svg = (body) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  if (L.Icons) {
    L.Icons.I.battle = svg('<rect x="9.5" y="1.5" width="4" height="4" rx="1" fill="currentColor" stroke="none"/><path d="M3 13.5C3 8 6 5 8.25 4" /><path d="M1.75 9.5h12.5" stroke-dasharray="1.5 1.6"/>');
    L.Icons.I.throw = svg('<path d="M3 13c0-5.5 3.5-9 9-9"/><path d="M8.75 2.5 12 4l-1.5 3.25"/>');
  }

  /** How long the opponent's throw is shown on your board before it lands (s). */
  const INCOMING = 0.8;
  const AMBER = '#f6c177';

  const clock = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  /** A piece's middle column (as Game.moveToward reads it). */
  const midCol = (p) => p.x + Math.round(p.type.rots[p.rot].reduce((a, [cx]) => a + cx, 0) / p.type.rots[p.rot].length - 0.01);

  // ---- the controller ---------------------------------------------------------------------------------------------------------

  /**
   * A Battle board's controller (composed over the plain one: Recipe.compose; the round's cards and pausing:
   * VersusView.rounds). T aims the piece in play at the opponent's board: arrows and turns move the shadow there (the
   * screen's directions), Space or Enter throws, Esc or T cancels; by touch, Throw, then a drag moves the shadow, a tap on
   * their board moves it there (on it: throws), a tap on yours turns it; with a mouse, the shadow follows the pointer over
   * their board and a click throws.
   */
  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const M = () => Battle.matchOf(play.game);
    const me = () => M().me, ai = () => M().ai;
    const BS = () => app.store.state.stats.battle;
    const name = () => Battle.NAMES[M().level];
    const reduced = () => play.reduced;

    const own = {
      id: 'battle', view: 'battle', timed: true, timeKey: 'battle',
      A: null, opp: null, aim: null, incoming: null, sliceMax: 0, slices: 0, lastSec: -1, lowering: false,

      attach(game) {
        Object.assign(this, { paused: true, count: null, A: null, aim: null, incoming: null, lastSec: -1 });
        this.opp = new OppView(play.canvas);
        this.opp.attach(ai().game, { rot: 180 });
        this.opp.view.noGhost = true;
        play.view.battle = { ctl: this, opp: this.opp };
        this.showPhase();
      },
      detach() {
        if (play.view.battle && play.view.battle.ctl === this) play.view.battle = null;
      },

      gate(act, rep) {
        const t = this.gateRound(act, rep);
        if (t !== undefined) return t;
        if (this.aim) return this.aimAction(act, rep);
        return undefined;
      },

      // ---- the clock ----
      frame(now, dt) {
        const m = M();
        if (!m) return;
        dt = Math.min(dt, 0.1);
        this.opp.fx.update(dt);
        if (this.countFrame(dt)) return;
        if (!this.running()) return;
        m.round.ms += dt * 1000;
        // Sudden death: both ceilings come down together.
        const was = me().S.ceil;
        this.lowering = true;
        let out;
        try { out = Battle.ceilings(m); } finally { this.lowering = false; }
        if (me().S.ceil !== was) {
          play.view.dirty = true; this.opp.dirty = true;
          if (!was && !reduced()) { const b = play.fxLay().board; play.view.fx.text('CEILINGS LOWER', b.x + b.w / 2, b.y + b.h * 0.35, '#c0c8d1', 14); }
          app.sound.play('lower');
          if (this.A && !this.A.path) this.A = null;
        }
        if (out) { this.endRound(out === 'me' ? 'ai' : 'me'); return; }
        if (g().over) { this.endRound('ai'); return; }
        if (ai().game.over) { this.endRound('me'); return; }
        this.incomingFrame(dt);
        if (M().round.phase !== 'play') return;
        this.aiFrame(dt);
        const sec = Math.floor(m.round.ms / 1000);
        if (sec !== this.lastSec) { this.lastSec = sec; play.renderStatus(); }
      },

      // ---- aiming and throwing ----
      /** Can a throw be aimed now: the round on, a charge, a piece in play. */
      canThrow() { return M().round.phase === 'play' && this.running() && me().S.charges > 0 && !!g().piece && !g().over; },
      /** T, or Throw: the shadow comes up on their board, across from your piece. */
      startAim() {
        if (this.aim) return true;
        if (!this.canThrow()) {
          if (M().round.phase === 'play' && this.running() && !me().S.charges) { toast('Clear a row for a charge', 'bad', 1600); app.sound.play('error'); }
          return false;
        }
        const p = g().piece, W = ai().game.w, rot = (p.rot + 2) % 4;
        this.aim = { rot, x: 0 };
        // Across from yours: their columns run the other way on the screen.
        this.centre(W - 1 - midCol(p) + (W - g().w) / 2);
        app.sound.play('rotate');
        this.dirty();
        return true;
      },
      cancelAim() { if (!this.aim) return false; this.aim = null; this.dirty(); return true; },
      /** The shadow's middle column on their board. */
      aimMid() { const a = this.aim, t = g().piece.type; return midCol({ x: a.x, rot: a.rot, type: t }); },
      /** Puts the shadow's middle on column c (in their board), inside the walls. */
      centre(c) {
        const a = this.aim, p = g().piece;
        if (!a || !p) return;
        const t = p.type, cells = t.rots[a.rot], off = Math.round(cells.reduce((s, [cx]) => s + cx, 0) / cells.length - 0.01);
        const [lo, hi] = Battle.xRange(ai().game, t, a.rot);
        a.x = Math.max(lo, Math.min(hi, Math.round(c) - off));
      },
      /** A move of the shadow, in the screen's direction (their board is turned: left on the screen is right on it). */
      moveAim(dir) {
        const a = this.aim, p = g().piece;
        if (!a || !p) return false;
        const [lo, hi] = Battle.xRange(ai().game, p.type, a.rot), x = Math.max(lo, Math.min(hi, a.x - dir));
        if (x === a.x) return false;
        a.x = x;
        app.sound.play('move');
        this.dirty();
        return true;
      },
      turnAim(d) {
        const a = this.aim, p = g().piece;
        if (!a || !p) return false;
        const mid = this.aimMid();
        a.rot = (a.rot + d + 4) % 4;
        this.centre(mid);
        app.sound.play('rotate');
        this.dirty();
        return true;
      },
      aimAction(act, rep) {
        switch (act) {
          case 'left': return this.moveAim(-1);
          case 'right': return this.moveAim(1);
          case 'cw': case 'up': case 'rotate': return rep ? false : this.turnAim(1);
          case 'ccw': return rep ? false : this.turnAim(-1);
          case 'r180': return rep ? false : this.turnAim(2);
          case 'drop': if (!rep && !play.settling('drop')) this.confirm(); return true;
          default: return false;
        }
      },
      /** Where the shadow lands now ({ rot, x, y, cells }), or null when it does not fit at their top. */
      aimLanding() {
        const a = this.aim, p = g().piece;
        if (!a || !p) return null;
        const [lo, hi] = Battle.xRange(ai().game, p.type, a.rot);
        a.x = Math.max(lo, Math.min(hi, a.x));
        return Battle.landing(ai().game, p.type, a.rot, a.x);
      },
      /** Space, Enter, a tap on the shadow, a click on their board, Throw here: it lands where the shadow shows. */
      confirm() {
        if (!this.aim) return false;
        if (!this.canThrow()) { this.cancelAim(); return false; }
        const color = g().piece.type.color;
        const r = Battle.throwAt(me(), ai(), this.aim);
        if (!r) { toast('No room there', 'bad', 1500); app.sound.play('error'); return false; }
        this.aim = null;
        BS().throws++;
        app.sound.play('hold');
        this.landFx(this.opp, r, color);
        if (r.res.lines) app.sound.play('clear');
        this.A = this.A && this.A.path ? this.A : null;
        play.syncCounters();
        app.achieve({ mode: 'battle', threw: true, level: M().level, cells: g().w * g().h });
        if (ai().game.over) { this.endRound('me'); return true; }
        play.renderStatus(); play.renderItems();
        app.store.touch();
        return true;
      },
      /** A piece landing on a board (a throw): a flash on its cells, and its rows going if it cleared any. */
      landFx(view, r, color) {
        view.dirty = true;
        if (!view.lay) return;
        const s = view.lay.s;
        if (r.res.lines) { const sb = view.showBank; view.showBank = false; try { view.onLock(Object.assign({}, r.res, { type: r.id, color, cells: [] }), reduced()); } finally { view.showBank = sb; } }
        if (reduced()) return;
        for (const [x, y] of r.land.cells) { const [sx, sy] = view.toScreen(x, y); view.fx.flash(sx, sy, s, s, '#ffffff', 0.35); }
      },
      dirty() { play.view.dirty = true; if (this.opp) this.opp.dirty = true; play.renderItems(); },
      escape() { return this.cancelAim(); },

      // ---- the opponent ----
      /** The opponent's throw, shown on your board for a moment, then landing. */
      incomingFrame(dt) {
        const I = this.incoming;
        if (!I) return;
        I.t += dt;
        play.view.dirty = true;
        if (I.t < I.dur) return;
        this.incoming = null;
        const sd = ai(), color = sd.game.piece ? sd.game.piece.type.color : 8;
        const r = Battle.throwAt(sd, me(), I.aim);
        this.A = null;
        if (!r) return;
        app.sound.play('hold');
        this.landFx(play.view, r, color);
        if (r.res.lines) {
          BS().backfires += r.res.lines;
          app.sound.play('clear');
          app.achieve({ mode: 'battle', backfire: r.res.lines, level: M().level, cells: g().w * g().h, charges: me().S.charges });
        }
        if (M().round.phase !== 'play') return;
        if (g().over) { this.endRound('ai'); return; }
        play.renderStatus(); play.renderItems();
        app.store.touch();
      },
      aiFrame(dt) {
        const sd = ai(), G = sd.game;
        if (G.over || !G.piece || this.incoming) return;
        let A = this.A;
        if (!A || (!A.path && (A.ver !== sd.ver || A.piece !== G.piece))) {
          const lv = sd.lvl;
          A = this.A = { gen: Battle.think(sd, me(), {}), ver: sd.ver, piece: G.piece, d: null, path: null, t: 0, wait: lv.pace * (0.7 + 0.6 * sd.rng.next()), stepT: 0 };
        }
        A.t += dt;
        if (A.gen) {
          // About a millisecond a frame (a generator: it stops between pieces of work).
          const r = Battle.slice(A.gen, 0.75);
          this.sliceMax = Math.max(this.sliceMax, r.ms); this.slices++;
          if (this.sliceLog) this.sliceLog.push(Math.round(r.ms * 100) / 100);
          if (!r.done) return;
          A.d = r.value; A.gen = null;
          const pth = A.d && A.d.kind === 'place' && !A.d.hold ? Battle.pathTo(G, A.d.target) : null;
          A.est = pth ? pth.length : 8;
        }
        if (!A.path) {
          const d = A.d, sps = sd.lvl.sps;
          if (!d) return;
          if (d.kind === 'throw') {
            if (A.t < Math.max(0.3, A.wait * 0.5)) return;
            this.incoming = { aim: d.aim, id: G.piece.type.id, t: 0, dur: INCOMING };
            play.view.dirty = true;
            return;
          }
          if (d.kind !== 'place') { if (A.t >= A.wait) { const r = G.drop(); this.A = null; if (r && typeof r === 'object') this.aiLocked(r); } return; }
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
            // The board changed under it (a throw, the ceiling): find the way again, or think again.
            const p = Battle.pathTo(G, A.d.target);
            if (!p) { this.A = null; return; }
            A.path = p;
          }
        }
      },
      aiLocked(res) {
        const sd = ai();
        this.opp.onLock(res, reduced());
        Battle.afterLock(sd, res);
        if (sd.game.over) { this.endRound('me'); return; }
        play.renderStatus();
      },

      // ---- your pieces ----
      onLock(r) {
        const st = app.store, F = st.state.stats.free;
        play.syncCounters();
        F.pieces++;
        st.day().pieces++;
        L.Modes.playLockSound(app.sound, r);
        // (Rows here pay at the round's end, so the lines a clear banks are not shown.)
        const sb = play.view.showBank;
        play.view.showBank = false;
        try { play.view.onLock(r, reduced()); } finally { play.view.showBank = sb; }
        Battle.afterLock(me(), r);
        if (r.lines) {
          BS().lines += r.lines;
          if (!reduced()) { const b = play.fxLay().board; play.view.fx.text('+' + r.lines + (r.lines === 1 ? ' CHARGE' : ' CHARGES'), b.x + b.w / 2, b.y + b.h * 0.3, '#8fe3ff', 14); }
          app.achieve({ mode: 'battle', charges: me().S.charges, level: M().level, cells: g().w * g().h });
        }
        play.renderStatus();
        play.renderItems();
        st.touch();
      },
      /** Your board could not take its next piece: the round is theirs. */
      onEnd() { if (this.lowering) return; if (M().round.phase === 'play') this.endRound('ai'); },

      /** The round is over: the tally, the pay (once, for your board as it ends), the records, the card. */
      endRound(winner) {
        const m = M(), st = app.store, S = BS(), G = g(), won = winner === 'me';
        if (m.round.phase !== 'play') return;
        this.A = null; this.aim = null; this.incoming = null;
        const sudden = m.round.ms >= Battle.suddenOf(G);
        const pay = Library.bank(Battle.endRound(m, winner));
        m.round.paid = pay;
        S.rounds++;
        if (won) S.wins++; else S.losses++;
        if (won && sudden) S.sudden++;
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
        app.achieve({ mode: 'battle', won, level: m.level, cells: G.w * G.h, sudden, streak: m.streak });
        this.showEnd();
        play.renderStatus();
        play.renderItems();
        st.touch();
        if (app.saveNow) app.saveNow();
      },

      // ---- keys and input ----
      onKey(e) {
        if (e.altKey || e.metaKey || e.ctrlKey) return false;
        if (e.code === 'KeyT') {
          if (!e.repeat) { if (this.aim) this.cancelAim(); else this.startAim(); }
          return true;
        }
        if (this.aim && (e.key === 'Enter' || e.code === 'NumpadEnter')) { if (!e.repeat) this.confirm(); return true; }
        return false;
      },
      action(a, rep) { if (a === 'pause') { if (!rep) this.setPause(true); return true; } return false; },
      /** Their board's column under a point of the canvas, or null. */
      oppCol(pos) {
        const o = this.opp;
        if (!o || !o.lay || !pos) return null;
        const b = o.lay.board, pad = Math.max(0, (44 - o.lay.s) / 2);
        if (pos[0] < b.x || pos[0] >= b.x + b.w || pos[1] < b.y - pad || pos[1] >= b.y + b.h + pad) return null;
        const c = o.cellAt(pos[0], Math.max(b.y, Math.min(b.y + b.h - 1, pos[1])));
        return c ? c.x : null;
      },
      input(kind, v, pos) {
        if (!this.aim) return v;
        const p = g().piece;
        if (kind === 'aim') {
          // The mouse over their board moves the shadow; your piece stays where it is.
          const c = this.oppCol(pos);
          if (c != null && c !== this.aimMid()) { this.centre(c); this.dirty(); }
          return p ? midCol(p) : v;
        }
        if (kind === 'click') {
          const e = pos;
          if (e && e.button === 2) { this.turnAim(1); return true; }
          const c = this.oppCol(v);
          if (c != null) { this.centre(c); this.confirm(); }
          return true;
        }
        if (kind === 'tap') {
          const c = this.oppCol(pos);
          if (c == null) { this.turnAim(v === 'left' ? -1 : 1); return null; }
          // On the shadow (a column either side of it on a small board): throw; elsewhere on their board: the shadow goes there.
          const land = this.aimLanding(), cols = land ? land.cells.map(([x]) => x) : [this.aimMid()];
          const near = Math.min(...cols.map((x) => Math.abs(x - c)));
          if (near <= (this.opp.lay.s < 14 ? 1 : 0)) this.confirm();
          else { this.centre(c); this.dirty(); app.sound.play('move'); }
          return null;
        }
        return v;
      },
      fx() { return play.view.lay; },

      // ---- the status bar, the bar, the summary ----
      status(parts, o) {
        const m = M(), stat = o.stat, tip = Battle.tallyText(m) + (m.streak > 1 ? ' · ' + m.streak + ' wins in a row' : '');
        const G = g(), sudden = m.round.ms >= Battle.suddenOf(G);
        return [stat('You', fmtInt(me().S.lines), 'bt-you', 'Rows cleared · ' + tip), stat(name(), fmtInt(ai().S.lines), 'bt-them', 'Rows cleared · ' + tip),
          stat('Time', clock(m.round.ms), 'bt-time' + (sudden ? ' sudden' : ''), sudden ? 'The ceilings come down a row every ' + Math.round(Battle.ceilOf(G) / 1000) + ' s' : 'The ceilings come down from ' + clock(Battle.suddenOf(G)))];
      },
      bar(el) {
        const m = M(), sd = me(), on = m.round.phase === 'play' && !this.paused && !this.count, n = sd.S.charges;
        const dots = h('span', { class: 'bt-dots', 'aria-hidden': 'true' }, Array.from({ length: Battle.MAX_CHARGES }, (_, i) => h('i', { class: i < n ? 'on' : '' })));
        const word = n + (n === 1 ? ' charge' : ' charges');
        let kids;
        if (this.aim) {
          kids = [
            h('button', { class: 'btn bt-cancel', 'data-tip': 'Cancel', 'data-tip-foot': 'Esc', onclick: () => this.cancelAim() }, h('span', { class: 'lbl' }, 'Cancel')),
            h('button', { class: 'btn bt-throw ready aiming', 'aria-label': 'Throw here, ' + word, 'data-tip': 'Throw it where the shadow is', 'data-tip-foot': 'Space', onclick: () => this.confirm() },
              ico('throw'), h('span', { class: 'lbl' }, 'Throw here'), dots),
          ];
        } else {
          const ready = on && n > 0;
          kids = [h('button', { class: 'btn bt-throw' + (ready ? ' ready' : ''), 'aria-disabled': String(!ready), 'aria-label': 'Throw, ' + word,
            'data-tip': n ? 'Aim the piece in play at their board' : 'Each row you clear is a charge', 'data-tip-foot': 'T', onclick: () => this.startAim() },
          ico('throw'), h('span', { class: 'lbl' }, 'Throw'), dots)];
        }
        kids.push(h('button', { class: 'btn', 'aria-disabled': String(!on), 'data-tip': 'Pause', 'data-tip-foot': 'P', onclick: () => this.setPause(true) }, ico('pause'), h('span', { class: 'lbl' }, 'Pause')));
        el.replaceChildren(...kids);
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
    // The Ready card, 3-2-1, Paused, the End card and its picker, pausing when away: js/versusview.js.
    return Object.assign(VV.rounds(play, {
      title: 'Battle', key: 'battle', M, level: (id) => Battle.levelOn(play.game, id), rules: () => Battle.setText(play.game),
      endBody() {
        const m = M(), paid = Library.bank(m.round.paid || 0);
        return [
          h('p', null, 'Rows: you ' + fmtInt(me().S.lines) + ' · ' + name() + ' ' + fmtInt(ai().S.lines)),
          h('p', null, Battle.tallyText(m) + ' · ' + fmtDuration(Math.max(1000, m.round.ms)) + (paid ? ' · ' : ''), paid ? h('span', { class: 'gem' }, '+' + fmtLines(paid) + ' ' + LINE) : null),
        ];
      },
      rematch() {
        Battle.newRound(M());
        this.A = null; this.aim = null; this.incoming = null; this.lastSec = -1;
        play.view.fx.clear(); this.opp.fx.clear();
        play.view.dirty = true;
      },
    }), own);
  }

  // ---- the view part: both boards, the ceilings' stone, the shadows ----------------------------------------------------------

  /** A piece's cells as a shadow on a board view: a soft fill and an outline (dashed: it would not fit there). */
  function shadow(ctx, view, cells, color, o) {
    const s = view.lay.s, light = view.look.theme.name === 'light';
    ctx.save();
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    if (o.dashed) ctx.setLineDash([Math.max(2, s * 0.3), Math.max(2, s * 0.22)]);
    for (const [x, y] of cells) {
      if (y < 0 || y >= view.game.h) continue;
      const [sx, sy] = view.toScreen(x, y);
      ctx.globalAlpha = o.fill;
      ctx.fillStyle = color;
      Render.rr(ctx, sx + 1, sy + 1, s - 2, s - 2, Math.max(1, s * 0.16)); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = o.stroke || color;
      Render.rr(ctx, sx + 1, sy + 1, s - 2, s - 2, Math.max(1, s * 0.16)); ctx.stroke();
    }
    ctx.restore();
    void light;
  }
  /** The column band a throw falls down, from the top under the ceiling to where it lands. */
  function band(ctx, view, cells, topY, color) {
    const s = view.lay.s;
    const xs = cells.map(([x]) => x), lo = Math.min(...xs), hi = Math.max(...xs), yLand = Math.max(...cells.map(([, y]) => y));
    if (yLand + 1 > topY - 1) return;
    const [ax, ay] = view.toScreen(lo, yLand + 1), [bx, by] = view.toScreen(hi, topY - 1);
    const x0 = Math.min(ax, bx), y0 = Math.min(ay, by), x1 = Math.max(ax, bx) + s, y1 = Math.max(ay, by) + s;
    ctx.save();
    ctx.globalAlpha = view.look.theme.name === 'light' ? 0.1 : 0.12;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  const VIEW = {
    key: 'battle', order: 55, layout: 'battle',
    dangerRim: false,
    claims: (v) => !!(v & L.CELL.FILL),
    cell(ctx, v, x, y, s, kind, view) { VV.drawStone(ctx, x, y, s, view.look.theme); },
    busy(view) { const B = view.battle; return !!(B && (B.ctl.incoming || B.opp.fx.active || B.opp.dirty || (B.ctl.A && B.ctl.A.path && B.ctl.running()))); },

    /** The whole frame: the opponent's board on top (turned 180°, fainter) with your aim on it, the midline, your board below. */
    render(view, ctx, now) {
      const B = view.battle;
      if (!B || !B.opp.game) { if (!view.lay || view.lay.box) view.layout(); view.drawPlate(ctx); view.paint(ctx, null, now); return; }
      const ctl = B.ctl;
      VV.renderPair(view, ctx, now, B, {
        overOpp: (c, opp) => {
          const p = view.game.piece;
          if (!ctl.aim || !p) return;
          const color = view.colorOf(p.type.color), land = ctl.aimLanding();
          if (land) {
            band(c, opp, land.cells, Battle.top(opp.game), color);
            shadow(c, opp, land.cells, color, { fill: 0.45, stroke: view.look.theme.name === 'light' ? '#1d2430' : '#ffffff' });
          } else {
            // No room at their top there: the piece where it would start, dashed.
            const t = Battle.top(opp.game), y0 = t - 1 - p.type.rotBounds[ctl.aim.rot].maxY;
            shadow(c, opp, p.type.rots[ctl.aim.rot].map(([x, y]) => [ctl.aim.x + x, y0 + y]), color, { fill: 0.15, dashed: true, stroke: '#eb6f92' });
          }
        },
        overMine: (c, v) => {
          const I = ctl.incoming;
          if (!I) return;
          const type = L.Pieces.get(I.id), land = type && Battle.landing(v.game, type, I.aim.rot, I.aim.x);
          if (!land) return;
          const k = v.reducedMotion ? 1 : 0.5 + 0.5 * Math.abs(Math.sin((I.t / I.dur) * Math.PI * 2));
          band(c, v, land.cells, Battle.top(v.game), AMBER);
          c.save(); c.globalAlpha = k;
          shadow(c, v, land.cells, AMBER, { fill: v.look.theme.name === 'light' ? 0.35 : 0.3, dashed: true });
          c.restore();
        },
      });
    },
  };
  Recipe.viewPart(VIEW);

  // ---- the Custom window, the menu, Stats ---------------------------------------------------------------------------

  // Battle keeps its own size: entering it, the size asked for before is put aside (and comes back on leaving).
  let asideAsked = null, battleAsked = null;
  Recipe.uiPart({
    key: 'battle', order: 55, mode: 'battle', name: 'Battle',
    levels: () => ({ path: 'battle.level', values: Battle.IDS.map((v) => [v, Battle.NAMES[v]]) }),
    presets: (r) => (Battle.on(r) ? Battle.PRESETS.map((p) => p.slice()) : null),
    sizeFor(r, asked) {
      const inB = (z) => z && z.w >= Battle.LIMITS.w[0] && z.w <= Battle.LIMITS.w[1] && z.h >= Battle.LIMITS.h[0] && z.h <= Battle.LIMITS.h[1];
      if (Battle.on(r)) {
        if (inB(asked)) return null;
        asideAsked = asked;
        return battleAsked || { w: Battle.SIZE.w, h: Battle.SIZE.h };
      }
      if (asideAsked && inB(asked)) { battleAsked = asked; const back = asideAsked; asideAsked = null; return back; }
      return null;
    },
    tiles: (ext) => (ext && ext.level ? [[ext.won + '–' + ext.lost, 'vs ' + Battle.NAMES[ext.level]], [fmtInt(ext.rounds), 'Rounds']] : []),
  });

  UI.statRow('battle', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const S = stats.battle;
      if (!S || !S.rounds) return null;
      const rows = [['Rounds', S.rounds], ['Won', S.wins], ['Lost', S.losses], ['Most in a row', S.bestStreak || 0], ['Rows cleared', S.lines], ['Thrown', S.throws], ['Backfired', S.backfires], ['Won in sudden death', S.sudden || 0]];
      const lv = Battle.IDS.filter((id) => Array.isArray(S.byLevel && S.byLevel[id])).map((id) => ['vs ' + Battle.NAMES[id], S.byLevel[id][0] + '–' + S.byLevel[id][1]]);
      return [h('h4', null, 'Battle'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, fmtInt(v)))).concat(
        lv.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, v))),
        [h('tr', null, h('td', null, 'Time played'), h('td', null, fmtDuration(stats.timeMs.battle || 0)))]))];
    },
  });

  L.BattleView = { controller, VIEW, INCOMING };
})(typeof globalThis !== 'undefined' ? globalThis : this);
