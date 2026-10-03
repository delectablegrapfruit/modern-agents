// Lull — Race in Free Play (js/race.js has its rules and the AI): the controller that runs a round (the Ready card,
// 3-2-1, the opponent's turns in time slices, Send, Start over, pausing, the End card), the view that draws both boards
// (the opponent's on top, turned 180° and dimmer, the two buffers meeting in the middle), its bar under the board, and its
// place in the New board window, the library and Stats.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Race, UI, Render, Library, CELL, Pieces, fmtInt, fmtLines, fmtDuration, VersusView: VV } = L;
  if (!Recipe || !Race || !UI || !Render || !VV) return;
  const { h } = UI;
  const ico = UI.icon;
  const { LINE } = L;
  const toast = (...a) => UI.toast(...a);

  // The icons it adds: the place (two boards meeting at a line) and Send (an arrow over the line).
  const svg = (body) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  const blk = (x, y) => '<rect x="' + x + '" y="' + y + '" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>';
  if (L.Icons) {
    L.Icons.I.race = svg(blk(2, 1.5) + blk(6.5, 1.5) + blk(6.5, 10.5) + blk(10.5, 10.5) + '<path d="M1.75 8h12.5" stroke-dasharray="1.5 1.6"/>');
    L.Icons.I.send = svg('<path d="M8 13.5V3.5M4.25 7.25 8 3.5l3.75 3.75"/><path d="M2.25 1.75h11.5" opacity="0.55"/>');
  }

  /** Start over waits this long for its second press. */
  const ARM_MS = 3000;
  const { OppView, COUNT } = VV;

  const pct = (game) => Math.round(Race.fillOf(game) * 100) + '%';

  // ---- the controller ---------------------------------------------------------------------------------------------------------

  /**
   * A Race board's controller (composed over the plain one: Recipe.compose). Its clock runs only while play.canRun()
   * and the round is on (not at a card, not counting down); away (another tab, window or app, the page hidden, a window
   * over it, rolled up) it pauses at the Paused card, and Resume counts down again.
   */
  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const M = () => Race.matchOf(play.game);
    const me = () => M().me, ai = () => M().ai;
    const BS = () => app.store.state.stats.race;
    const name = () => Race.NAMES[M().level];
    const reduced = () => play.reduced;

    const own = {
      id: 'race', view: 'race', timed: true, timeKey: 'race',
      fade: { me: null, ai: null }, armedAt: 0, A: null, opp: null, stuckKey: null, sliceMax: 0, slices: 0,

      attach(game) {
        Object.assign(this, { paused: true, count: null, fade: { me: null, ai: null }, armedAt: 0, A: null, stuckKey: null });
        this.opp = new OppView(play.canvas);
        this.opp.attach(ai().game, { rot: 180 });
        this.opp.view.noGhost = true;
        play.view.race = { ctl: this, opp: this.opp };
        this.onKeyUp = (e) => {
          if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.shiftDown) {
            const alone = this.shiftDown === 'alone';
            this.shiftDown = null;
            // Shift alone, let go: Hold, as everywhere (Shift+S sent instead).
            if (alone) play.action('hold');
          }
        };
        root.addEventListener('keyup', this.onKeyUp);
        this.showPhase();
      },
      detach() {
        if (this.onKeyUp) root.removeEventListener('keyup', this.onKeyUp);
        this.onKeyUp = null;
        if (play.view.race && play.view.race.ctl === this) play.view.race = null;
      },

      gate(act, rep) {
        const t = this.gateRound(act, rep);
        if (t !== undefined) return t;
        if (this.fade.me) return false;
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
        this.fadeFrame('me', dt);
        this.fadeFrame('ai', dt);
        if (M().round.phase !== 'play') return;
        // No piece of yours can be set (in play, held or sent on): your board starts over.
        if (!this.fade.me) {
          const G = g(), key = G.piece ? me().ver + ':' + G.piece.type.id + ':' + (G.hold ? G.hold.id : '') + ':' + me().S.cd : null;
          if (key && key !== this.stuckKey) { this.stuckKey = key; if (Race.stuck(me())) this.startReset('me'); }
        }
        this.aiFrame(dt);
        if (m.round.phase === 'play' && Math.floor(m.round.ms / 1000) !== this.lastSec) { this.lastSec = Math.floor(m.round.ms / 1000); }
      },

      /** A board starting over, drawn fading out over its well. */
      fadeOver(ctx, view, who) {
        const f = this.fade[who];
        if (f) VV.fadeWell(ctx, view, f.dur ? Math.min(1, f.t / f.dur) : 1);
      },
      /** A board starting over: it fades (RESET_FADE seconds; at once with reduced motion), then empties. */
      startReset(who) {
        if (this.fade[who] || M().round.phase !== 'play') return;
        this.fade[who] = { t: 0, dur: reduced() ? 0 : Race.RESET_FADE };
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
        Race.resetSide(sd);
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
          A = this.A = { gen: Race.think(sd, me(), {}), ver: sd.ver, piece: G.piece, d: null, path: null, t: 0, wait: lv.pace * (0.7 + 0.6 * sd.rng.next()), stepT: 0 };
        }
        A.t += dt;
        if (A.gen) {
          // At most a couple of ms a frame (a generator: it stops between pieces of work).
          const r = Race.slice(A.gen, 0.75);
          this.sliceMax = Math.max(this.sliceMax, r.ms); this.slices++;
          if (this.sliceLog) this.sliceLog.push(Math.round(r.ms * 100) / 100);
          if (r.done) {
            A.d = r.value; A.gen = null;
            // How long its path will take (it thinks for the rest of the piece's time).
            const pth = A.d && A.d.kind === 'place' && !A.d.hold ? Race.pathTo(G, A.d.target) : null;
            A.est = pth ? pth.length : 8;
          }
          else return;
        }
        if (!A.path) {
          const d = A.d, sps = sd.lvl.sps;
          if (!d) return;
          if (d.kind === 'send') {
            if (A.t < Math.max(0.3, A.wait * 0.4)) return;
            const e = Race.send(sd, me(), 'current');
            if (e) { this.received(e); this.A = null; return; }
            A.gen = Race.think(sd, me(), { send: false }); A.d = null;
            return;
          }
          if (d.kind !== 'place') { this.startReset('ai'); return; }
          // Its path takes moves at its pace; it thinks for the rest of the piece's time.
          if (A.t < Math.max(0.25, A.wait - (A.est || 8) / sps)) return;
          if (d.hold && !G.holdPiece()) { this.A = null; return; }
          const path = Race.pathTo(G, d.target);
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
          const m = A.path.shift(), res = Race.play(G, m);
          if (res && typeof res === 'object') { this.A = null; this.aiLocked(res); return; }
          if (!res) {
            // The board changed under it (a filler): find the way again, or think again.
            const p = Race.pathTo(G, A.d.target);
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
        const ev = Race.afterLock(sd, me(), res);
        this.showFills(ev.filled, this.opp);
        if (ev.earned) this.earned();
        this.showFills(ev.foeFilled, play.view);
        if (ev.won) { this.endRound('ai'); return; }
        if (ev.foeWon) { this.endRound('me'); return; }
        if (ev.topout || Race.givesUp(sd)) this.startReset('ai');
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
        app.achieve({ mode: 'race', earned: true, level: M().level, cells: g().w * Race.goal(g()) });
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
        const ev = Race.afterLock(me(), ai(), r);
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
        const out = Race.send(sd, ai(), which);
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
        const pay = Library.bank(Race.endRound(m, winner));
        m.round.paid = pay;
        S.rounds++;
        if (won) S.wins++; else S.losses++;
        S.bestStreak = Math.max(S.bestStreak || 0, m.streak);
        const bl = S.byLevel[m.level] = Array.isArray(S.byLevel[m.level]) ? S.byLevel[m.level] : [0, 0];
        bl[won ? 0 : 1]++;
        if (pay > 0) {
          st.addLines(pay, 'race');
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
        app.achieve({ mode: 'race', won, level: m.level, cells: G.w * Race.goal(G), resets: m.round.resets, sealed: me().S.sealedAny, streak: m.streak });
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
        const m = M(), stat = o.stat, tip = Race.tallyText(m) + (m.streak > 1 ? ' · ' + m.streak + ' wins in a row' : '');
        return [stat('You', pct(g()), 'rc-you', tip), stat(name(), pct(ai().game), 'rc-them', tip)];
      },
      bar(el) {
        const m = M(), sd = me(), on = m.round.phase === 'play' && !this.paused && !this.count, ready = on && sd.S.cd === 0;
        const segs = Race.COOLDOWN, lit = segs - Math.min(segs, sd.S.cd);
        // The ring: one segment for each piece of the cooldown, lit as they are set; whole when Send is ready.
        const R = 15, C = 2 * Math.PI * R, seg = C / segs, gap = 2.2;
        const ring = '<svg class="rc-ring" viewBox="0 0 36 36" aria-hidden="true">' + Array.from({ length: segs }, (_, i) =>
          '<circle cx="18" cy="18" r="' + R + '" fill="none" stroke-width="3" class="' + (i < lit ? 'on' : 'off') + '" stroke-dasharray="' + (seg - gap).toFixed(2) + ' ' + (C - seg + gap).toFixed(2) + '" stroke-dashoffset="' + (-(i * seg) + C / 4).toFixed(2) + '"/>').join('') + '</svg>';
        const dots = h('span', { class: 'rc-dots', 'aria-hidden': 'true' }, Array.from({ length: Race.MAX_CHARGES }, (_, i) => h('i', { class: i < sd.S.charges ? 'on' : '' })));
        const armed = !!this.armedAt && performance.now() - this.armedAt <= ARM_MS;
        const fillWord = sd.S.charges ? ', ' + sd.S.charges + ' gap filler' + (sd.S.charges > 1 ? 's' : '') + ' held' : '';
        el.replaceChildren(
          h('button', { class: 'btn rc-send' + (ready ? ' ready' : ''), 'aria-disabled': String(!ready), 'aria-label': (ready ? 'Send' : 'Send, ready in ' + sd.S.cd) + fillWord,
            'data-tip': ready ? 'Send the piece in play' : 'Ready in ' + sd.S.cd + (sd.S.cd === 1 ? ' piece' : ' pieces'), 'data-tip-foot': 'S · Shift+S: the next one',
            onclick: () => this.sendMine('current') }, h('span', { class: 'rc-ic', html: ring + L.Icons.icon('send') }), h('span', { class: 'lbl' }, 'Send'), dots),
          h('button', { class: 'btn' + (armed ? ' armed' : ''), 'aria-disabled': String(!on), 'data-tip': armed ? 'Press again to start over' : 'Start this board over',
            onclick: () => this.startOver() }, ico('retry'), h('span', { class: 'lbl' }, armed ? 'Start over?' : 'Start over')),
          h('button', { class: 'btn', 'aria-disabled': String(!on), 'data-tip': 'Pause', 'data-tip-foot': 'P', onclick: () => this.setPause(true) }, ico('pause'), h('span', { class: 'lbl' }, 'Pause')));
        el.classList.add('rc-bar');
        return true;
      },
      tiles(game) {
        const m = Race.matchOf(game);
        if (!m) return [];
        const t = Race.tallyOf(m, m.level);
        return [[t[0] + '–' + t[1], 'vs ' + Race.NAMES[m.level]]];
      },
    };
    // The Ready card, 3-2-1, Paused, the End card and its picker, pausing when away: js/versusview.js.
    return Object.assign(VV.rounds(play, {
      title: 'Race', key: 'race', M, LEVELS: Race.LEVELS,
      endBody() {
        const m = M(), paid = Library.bank(m.round.paid || 0);
        return [
          h('p', null, 'You ' + pct(g()) + ' · ' + name() + ' ' + pct(ai().game)),
          h('p', null, Race.tallyText(m) + ' · ' + fmtDuration(Math.max(1000, m.round.ms)) + (paid ? ' · ' : ''), paid ? h('span', { class: 'gem' }, '+' + fmtLines(paid) + ' ' + LINE) : null),
        ];
      },
      rematch() {
        Race.newRound(M());
        this.A = null; this.fade = { me: null, ai: null }; this.stuckKey = null;
        play.view.fx.clear(); this.opp.fx.clear();
        play.view.dirty = true;
      },
    }), own);
  }

  // ---- the view part: both boards, the middle band, fillers and sealed gaps --------------------------------------------------

  /** Sealed cells of a game, worked out again only when its side changed (ver). */
  const sealedCache = new WeakMap();
  function sealedCells(game) {
    const sd = Race.side(game);
    if (!sd) return [];
    const c = sealedCache.get(game);
    if (c && c.ver === sd.ver && c.cells === game.board.cells) return c.list;
    const s = Race.sealedOf(game, { budget: 2 }), list = [];
    for (const reg of s.regions) for (const xy of reg) list.push(xy);
    sealedCache.set(game, { ver: sd.ver, cells: game.board.cells, list });
    return list;
  }

  const VIEW = {
    key: 'race', order: 50, layout: 'race',
    dangerRim: false,
    claims: (v) => !!(v & CELL.FILL),
    cell(ctx, v, x, y, s, kind, view) { VV.drawStone(ctx, x, y, s, view.look.theme); },
    /** The buffer (a soft band, the board's edge dashed) and the sealed gaps' hatch. */
    overStack(ctx, view) {
      const g = view.game, lay = view.lay, s = lay.s, k = g.h - Race.goal(g), th = view.look.theme, light = th.name === 'light';
      if (k > 0) {
        const [x0, y0] = view.toScreen(0, g.h - 1), [x1, y1] = view.toScreen(g.w - 1, Race.goal(g));
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
    busy(view) { const B = view.race; return !!(B && (B.ctl.fade.me || B.ctl.fade.ai || B.opp.fx.active || B.opp.dirty || (B.ctl.A && B.ctl.A.path && B.ctl.running()))); },

    /** The whole frame: the opponent's board on top (turned 180°, fainter), the midline, your board unit below. */
    render(view, ctx, now) {
      const B = view.race;
      if (!B || !B.opp.game) { if (!view.lay || view.lay.box) view.layout(); view.drawPlate(ctx); view.paint(ctx, null, now); return; }
      const ctl = B.ctl;
      VV.renderPair(view, ctx, now, B, {
        overOpp: (c, opp) => ctl.fadeOver(c, opp, 'ai'),
        overMine: (c, v) => {
          ctl.fadeOver(c, v, 'me');
          // A piece you were sent, waiting first in Next: ringed.
          const q0 = v.game.queue[0];
          if (q0 && q0.received) {
            const r = ctl.nextSlot();
            if (r) { const n = v.lay.next, ts = v.lay.ts, rr = v.lay.nextDir === 'v' ? { x: n.x, y: n.y, w: n.w, h: Math.round(ts * 2.5) } : { x: n.x, y: n.y, w: Math.min(n.w, Math.round(ts * 3.4)), h: n.h };
              c.save(); c.strokeStyle = '#f6c177'; c.lineWidth = 2; Render.rr(c, rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2, Math.min(10, ts * 0.36)); c.stroke(); c.restore(); }
          }
        },
      });
    },
  };
  Recipe.viewPart(VIEW);


  // ---- the New board window, the library, Stats ------------------------------------------------------------------------------

  // Race keeps its own size: entering it, the size asked for before is put aside (and comes back on leaving).
  let asideAsked = null, raceAsked = null;
  Recipe.uiPart({
    key: 'race', order: 50, mode: 'race', name: 'Race',
    levels: () => ({ path: 'race.level', values: Race.IDS.map((v) => [v, Race.NAMES[v]]) }),
    stepper: (r, k) => (Race.on(r) && k === 'h' ? { label: 'Rows' } : null),
    presets: (r) => (Race.on(r) ? Race.PRESETS.map((p) => p.slice()) : null),
    sizeFor(r, asked) {
      const inB = (z) => z && z.w >= Race.LIMITS.w[0] && z.w <= Race.LIMITS.w[1] && z.h >= Race.LIMITS.rows[0] && z.h <= Race.LIMITS.rows[1];
      if (Race.on(r)) {
        if (inB(asked)) return null;
        asideAsked = asked;
        return raceAsked || { w: Race.SIZE.w, h: Race.SIZE.h };
      }
      if (asideAsked && inB(asked)) { raceAsked = asked; const back = asideAsked; asideAsked = null; return back; }
      return null;
    },
    tags: (r, x) => (Race.on(r) && x && x.match ? [{ text: Race.tallyText(Object.assign({ tally: {} }, x.match, { tally: Object.assign({}, x.match.tally) })) }] : []),
    tiles: (ext) => (ext && ext.level ? [[ext.won + '–' + ext.lost, 'vs ' + Race.NAMES[ext.level]], [fmtInt(ext.rounds), 'Rounds']] : []),
  });

  UI.statRow('race', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const S = stats.race;
      if (!S || !S.rounds) return null;
      const rows = [['Rounds', S.rounds], ['Won', S.wins], ['Lost', S.losses], ['Most in a row', S.bestStreak || 0], ['Sent', S.sends], ['Gap fillers earned', S.earned], ['Started over', S.resets]];
      const lv = Race.IDS.filter((id) => Array.isArray(S.byLevel && S.byLevel[id])).map((id) => ['vs ' + Race.NAMES[id], S.byLevel[id][0] + '–' + S.byLevel[id][1]]);
      return [h('h4', null, 'Race'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, fmtInt(v)))).concat(
        lv.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, v))),
        [h('tr', null, h('td', null, 'Time played'), h('td', null, fmtDuration(stats.timeMs.race || 0)))]))];
    },
  });

  L.RaceView = { controller, OppView, VIEW, boxes: VV.boxes, sealedCells, ARM_MS, COUNT };
  void Pieces;
})(typeof globalThis !== 'undefined' ? globalThis : this);
