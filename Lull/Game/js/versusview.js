// Lull — what Race and Battle share in Free Play (js/raceview.js, js/battleview.js): the opponent's board (a board view
// with no trays, turned 180°), where the two boards go in the canvas and drawing them, a stone cell, and a round's
// cards and clock (the Ready card, 3-2-1, Paused, the End card with its opponent picker, pausing when away).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { UI, Render, Versus } = L;
  if (!UI || !Render || !Versus) return;
  const { h } = UI;
  const ico = UI.icon;

  /** The countdown before play, in seconds. */
  const COUNT = 3;
  /** The opponent is drawn this much fainter than your board. */
  const OPP_ALPHA = 0.72;

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

  /** A stone cell: the theme's grey with a fine diagonal grain (never one of the pieces' colours). */
  function drawStone(ctx, x, y, s, theme) {
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
   * 16 px or more; below that theirs shrink, to half yours at the least. { mine (a box for BoardView.layout), s, so, wellH, GAP, BOT }.
   */
  function boxes(view, opp) {
    const W = view.cssW, H = view.cssH, g = view.game, a = opp.game;
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

  /**
   * The whole frame for two boards: the opponent's on top (turned 180°, fainter), the midline, your board unit below.
   * hooks: { overOpp(ctx, opp), overMine(ctx, view), last(ctx, view, opp) }.
   */
  function renderPair(view, ctx, now, B, hooks) {
    hooks = hooks || {};
    const opp = B.opp, th = view.look.theme;
    const bx = boxes(view, opp);
    // Yours: laid out in its box (trays beside it), then theirs at a scale from yours.
    const same = (p, q) => p && q && p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
    if (!view.lay || !same(view.lay.box, view.pairBox)) {
      view.layout(bx.mine);
      // The plate on the bottom of the canvas (less its margin).
      const dy = view.cssH - bx.BOT - (view.lay.plate.y + view.lay.plate.h);
      view.pairBox = dy ? Object.assign({}, bx.mine, { y: bx.mine.y + dy }) : bx.mine;
      if (dy) view.layout(view.pairBox);
    }
    opp.cellS = Math.min(bx.so, view.lay.s);
    const oh = bx.wellH(opp.cellS);
    opp.layout({ x: 0, y: view.lay.plate.y - bx.GAP - oh, w: view.cssW, h: oh });
    opp.look = view.look; opp.reducedMotion = view.reducedMotion;
    ctx.save();
    ctx.globalAlpha = OPP_ALPHA;
    opp.paint(ctx, opp.lay.box, now);
    ctx.restore();
    if (hooks.overOpp) hooks.overOpp(ctx, opp);
    // The midline between the two boards.
    const midY = Math.round((opp.lay.board.y + opp.lay.board.h + view.lay.plate.y) / 2) + 0.5;
    ctx.save();
    ctx.strokeStyle = Render.rgba(th.accent, th.name === 'light' ? 0.35 : 0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(view.lay.plate.x + 6, midY); ctx.lineTo(view.lay.plate.x + view.lay.plate.w - 6, midY); ctx.stroke();
    ctx.restore();
    view.drawPlate(ctx);
    view.paint(ctx, view.pairBox, now);
    if (hooks.overMine) hooks.overMine(ctx, view);
    if (hooks.last) hooks.last(ctx, view, opp);
    opp.dirty = false;
  }

  /** Fades a board's well (a board starting over), k of the way. */
  function fadeWell(ctx, view, k) {
    if (!view.lay) return;
    const b = view.lay.board;
    ctx.save();
    ctx.globalAlpha = 0.85 * k;
    ctx.fillStyle = view.look.theme.well || view.look.theme.bg || '#000';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  // ---- a round's cards and clock ----------------------------------------------------------------------------------------------

  /**
   * The part of a two-board controller every such mode has (mixed into its own; this = the composed controller): its
   * clock runs only while the round is on (not at a card, not counting down) and nothing holds it; away (another tab,
   * window or app, the page hidden, a window over it, rolled up, the window losing focus) it pauses at the Paused card,
   * and Resume counts down again. o: { title ('Race'), key (its recipe key), M() (the match: { level, round, me, ai }),
   * level(id) (the opponent's level on this game), rules() (the game's rule set in words, or ''), onLevel?(id),
   * rematch() (both boards anew), endBody() -> [elements] (the End card's lines) }.
   */
  function rounds(play, o) {
    const app = play.app;
    const M = () => o.M();
    const name = () => Versus.NAMES[M().level];
    return {
      paused: true, count: null,

      /** The round is on and nothing holds it. */
      running() {
        // (play.canRun, less its "not over": the board's own rules say when a round ends.)
        return M().round.phase === 'play' && !this.paused && !this.count && app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen()
          && !play.cardOpen && !document.hidden && document.hasFocus();
      },
      counts() { return this.running(); },
      tapStarts() { const ph = M().round.phase; return (ph === 'ready' || (ph === 'play' && this.paused)) && !UI.modalOpen(); },
      /** The round's card, again (as the board comes into play). */
      showPhase() {
        const ph = M().round.phase;
        if (ph === 'end') this.showEnd();
        else if (ph === 'play') this.showPaused();
        else this.showReady();
      },

      // ---- cards ----
      sub() { return o.title + ' · ' + name(); },
      /** The game's rule set (Standard or Frantic), a quiet line under the card's title; null when it has none. */
      rulesLine() { const t = o.rules ? o.rules() : ''; return t ? h('p', { class: 'vs-rules' }, t) : null; },
      showReady() {
        play.showCard([
          h('h2', null, o.title),
          h('p', { class: 'vs-sub' }, 'vs ' + name()),
          this.rulesLine(),
          h('div', { class: 'row' },
            play.menuButton(),
            h('button', { class: 'btn primary', id: 'vs-go', onclick: () => this.go() }, 'Start ', h('kbd', null, 'Space'))),
        ], 'vs-card vs-ready');
      },
      showPaused() {
        play.showCard([
          h('h2', null, 'Paused'),
          h('p', { class: 'vs-sub' }, this.sub()),
          this.rulesLine(),
          h('div', { class: 'row' },
            play.menuButton(),
            h('button', { class: 'btn primary', id: 'vs-go', onclick: () => this.go() }, 'Resume ', h('kbd', null, 'Space'))),
        ], 'vs-card vs-paused');
      },
      showCount() {
        const n = Math.max(1, Math.ceil(this.count.left));
        if (this.count.shown === n && play.cardOpen) return;
        this.count.shown = n;
        play.showCard([h('p', { class: 'vs-count', 'aria-live': 'assertive' }, String(n))], 'vs-card vs-counting');
      },
      showEnd() {
        const m = M(), won = m.round.winner === 'me';
        const picker = h('div', { class: 'seg vs-pick', role: 'group', 'aria-label': 'Opponent' }, Versus.IDS.map((id) => h('button', {
          type: 'button', 'aria-pressed': String(id === m.level), 'data-level': id,
          onclick: () => { this.setLevel(id); this.showEnd(); const b = play.overlay.querySelector('[data-level="' + id + '"]'); if (b) b.focus(); },
        }, Versus.NAMES[id])));
        play.showCard([
          h('h2', null, won ? 'You win' : 'Opponent wins'),
          ...o.endBody.call(this),
          h('div', { class: 'vs-opp' }, h('span', { class: 'vs-opp-l' }, 'Opponent'), picker),
          h('div', { class: 'row' },
            play.menuButton(),
            h('button', { class: 'btn', onclick: () => play.newBoard('manual') }, ico('newBoard'), 'New game'),
            h('button', { class: 'btn primary', id: 'vs-again', onclick: () => this.rematch() }, 'Rematch ', h('kbd', null, 'Space'))),
        ], 'vs-card vs-end topout');
      },

      /** The opponent's level for the rounds to come (the board's label says it too). */
      setLevel(id) {
        const m = M();
        if (!Versus.IDS.includes(id) || id === m.level) return;
        m.level = id;
        play.game.recipe[o.key].level = id;
        m.ai.lvl = o.level(id);
        if (o.onLevel) o.onLevel(id);
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
        if (M().round.phase !== 'end') return;
        o.rematch.call(this);
        app.store.touch();
        this.go();
      },

      /** The keys a round's cards take (Space starts, resumes and rematches; P pauses): an answer, or undefined. */
      gateRound(act, rep) {
        const ph = M().round.phase;
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
        return undefined;
      },
      /** The countdown's frame: true while it runs (nothing else moves). */
      countFrame(dt) {
        if (!this.count) return false;
        const m = M();
        // The countdown runs only where play would (nothing over the board but its own card).
        const ok = app.tab === 'play' && !UI.modalOpen() && !document.hidden && !(L.Collapse && L.Collapse.on);
        if (ok) this.count.left -= dt;
        if (this.count.left <= 0) {
          this.count = null;
          this.paused = false;
          if (m.round.phase === 'ready') m.round.phase = 'play';
          play.hideCard();
          play.renderItems();
          app.store.touch();
        } else this.showCount();
        return true;
      },
    };
  }

  L.VersusView = { OppView, boxes, renderPair, drawStone, fadeWell, rounds, COUNT, OPP_ALPHA };
})(typeof globalThis !== 'undefined' ? globalThis : this);
