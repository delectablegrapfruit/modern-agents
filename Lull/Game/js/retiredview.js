// Lull — a retired board in full view (Relaxed): its final stack drawn at play size, where the board in play is drawn,
// with the same board view, palette, skin, frame and backdrop; its own size. Read-only: it is a window over the play
// view (UI.openModal), so no key, click or touch reaches the board in play, and nothing is played, paid, counted or
// saved while it is up. The board in play is only hidden under it (body.fv-open), never touched: Back or Esc shows it
// again exactly as it was. Opened from the Boards window (a retired row's View or its thumbnail) and from a retired
// record (View). Previous and Next (← →, or a swipe) step through the retired boards in the library's order.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Game, Library, Pieces, Render, RNG, UI } = L;
  const { h } = UI;
  const ico = UI.icon;

  // A swipe that steps: this far sideways (CSS px), and mostly sideways.
  const SWIPE_MIN = 48;

  /** A retired record's piece entry, if it names a piece there is, in a turn that piece has. */
  const known = (x, rot) => {
    const t = x && typeof x.id === 'string' ? Pieces.get(x.id) : null, r = rot === undefined ? (x && x.rot) || 0 : rot;
    return !!(t && Number.isInteger(r) && t.rots[r]);
  };

  /**
   * The record as a game to draw (never to play): its stack at its size, the held piece and the next ones it kept;
   * on a board retired full, the piece that could not come in, where it would have come in. No ghost.
   */
  function recordGame(e, previewCount) {
    const n = e.w * e.h, vals = e.cells ? Library.decodeCells(e.cells) : [];
    const cells = vals.length === n ? vals : new Array(n).fill(0);
    const next = (e.next || []).filter((x) => known(x)).map((x) => Object.assign({}, x));
    const piece = e.reason === 'full' && e.piece && known(e.piece.entry) && known(e.piece.entry, e.piece.rot) ? JSON.parse(JSON.stringify(e.piece)) : null;
    // A fixed queue is never filled from a bag; the constructor's spawn (no piece given) is taken back just below.
    const hold = known(e.hold) ? Object.assign({}, e.hold) : null;
    const g = new Game({ saved: { w: e.w, h: e.h, cells, fixed: true, queue: next.slice(), bag: [], rng: new RNG(1).state(), hold, holdLocked: false, s: {}, piece }, previewCount });
    Object.assign(g, { fixed: false, queue: next, hold, holdLocked: false });
    if (!piece) g.piece = null;
    g.ghostY = () => null;
    if (L.Mural && e.recipe && e.recipe.mode === 'mural') { g.recipe = L.Recipe.normalize(e.recipe); g.mods.noHold = true; } // a mural's picture (js/muralview.js)
    return g;
  }

  /** "Sep 27", with the year when it was another year. */
  const day = (t) => { const d = new Date(t); return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
  /** How a board ended, in a word: Full, or a board option's own end (a uiPart's endName(reason): Descent's Cleared). */
  const ended = (e) => {
    if (e.reason === 'full') return 'Full';
    for (const u of L.Recipe ? L.Recipe.uis() : []) { const t = typeof u.endName === 'function' ? u.endName(e.reason) : null; if (t) return String(t); }
    return null;
  };
  const why = (e) => ended(e) || 'Retired by hand';
  /** When it was retired and why: "Full · retired Sep 27", "Retired by hand · Sep 27". */
  const when = (e) => (ended(e) ? ended(e) + ' \u00b7 retired ' : 'Retired by hand \u00b7 ') + day(e.at);

  class RetiredView {
    /** mode: the PlayMode; id: the record to show first; back: where focus goes when it closes. */
    constructor(mode, id, back) {
      this.mode = mode;
      this.app = mode.app;
      // The first board is made before anything opens: a record that cannot be drawn throws here, with nothing to undo.
      const first = this.prepare(id);
      if (!first) throw new Error('No retired board ' + id);
      this.back = back && back.focus ? back : null;
      this.id = id;
      this.canvas = h('canvas', { class: 'fv-canvas', role: 'img' });
      this.view = new Render.BoardView(this.canvas, { cellCap: mode.view.opts.cellCap });
      this.stage = h('div', { class: 'boardwrap fv-stage' }, this.canvas);
      this.nameEl = h('b', { class: 'fv-name' });
      this.subEl = h('i', { class: 'fv-sub' });
      this.posEl = h('span', { class: 'fv-pos', 'aria-hidden': 'true' });
      this.live = h('div', { class: 'fv-live', 'aria-live': 'polite' });
      const step = (d) => () => this.step(d);
      this.prevBtn = h('button', { class: 'group-btn fv-prev', 'aria-label': 'Previous', 'data-tip': 'Previous', 'data-tip-foot': '←', onclick: step(-1) }, h('span', { class: 'gi' }, ico('chevLeft')), h('span', { class: 'gl' }, 'Previous'));
      this.nextBtn = h('button', { class: 'group-btn fv-next', 'aria-label': 'Next', 'data-tip': 'Next', 'data-tip-foot': '→', onclick: step(1) }, h('span', { class: 'gl' }, 'Next'), h('span', { class: 'gi' }, ico('chevRight')));
      const bar = h('div', { class: 'statusbar fv-bar' },
        h('div', { class: 'stats' }, h('span', { class: 'stat fv-title' }, this.subEl, this.nameEl)),
        h('div', { class: 'acts' },
          h('button', { class: 'btn sm fv-sum', 'aria-label': 'Summary', 'data-tip': 'Summary', onclick: () => this.summary() }, ico('stats'), h('span', { class: 'lbl' }, 'Summary')),
          h('button', { class: 'btn sm fv-back', 'aria-label': 'Back', 'data-tip': 'Back', 'data-tip-foot': 'Esc', onclick: () => this.close() }, ico('close'), h('span', { class: 'lbl' }, 'Back'))));
      const foot = h('div', { class: 'itembar fv-foot' }, this.prevBtn, this.posEl, this.nextBtn);
      // Everything open now (the Boards window, a record) waits under it, out of sight; the board in play too.
      this.under = [...document.querySelectorAll('#modal-root .scrim')];
      this.under.forEach((s) => s.classList.add('fv-under'));
      document.body.classList.add('fv-open');
      this.app.keys.releaseAll();
      this.handle = UI.openModal({ title: 'Retired board', cls: 'modal-fullview', body: [this.stage, bar, foot, this.live], onClose: () => this.closed() });
      this.handle.scrim.classList.add('fv-scrim');
      this.el = this.handle.el;
      // ← → step (anywhere in the view; the buttons keep focus at the ends: they are marked off, never disabled).
      this.el.addEventListener('keydown', (ev) => {
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const d = { ArrowLeft: -1, ArrowRight: 1 }[ev.key];
        if (!d) return;
        ev.preventDefault(); ev.stopPropagation();
        this.step(d);
      });
      // A finger (or a pen) swiped sideways over the board steps: to the left, the next board; to the right, the one before.
      let sw = null;
      this.stage.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse') sw = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; });
      this.stage.addEventListener('pointerup', (ev) => {
        if (!sw || ev.pointerId !== sw.id) return;
        const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
        sw = null;
        if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) this.step(dx < 0 ? 1 : -1);
      });
      this.stage.addEventListener('pointercancel', () => { sw = null; });
      this.show(id, true, first);
      this.place();
    }

    get list() { return this.app.store.state.boards.retired; }
    get index() { return this.list.findIndex((r) => r.id === this.id); }

    /** The record and its game to draw, or null when there is no such record or it cannot be drawn. */
    prepare(id) {
      const e = Library.findRetired(this.app.store.state.boards, id);
      if (!e) return null;
      try { return { e, game: recordGame(e, this.app.settings.preview) }; } catch (err) { return null; }
    }

    /** Shows one record: its board, its name, when it was retired and why, where it is in the list (false: it cannot be shown). */
    show(id, first, made) {
      const p = made || this.prepare(id);
      if (!p) return false;
      const e = p.e;
      this.id = id;
      this.rec = e;
      this.game = p.game;
      this.view.attach(this.game, {});
      this.lookFor = null;
      const i = this.index, n = this.list.length, size = Library.sizeLabel(e.w, e.h);
      this.nameEl.textContent = e.name;
      this.subEl.textContent = when(e);
      this.posEl.textContent = (i + 1) + ' of ' + n;
      this.el.setAttribute('aria-label', 'Retired board: ' + e.name);
      const blocked = this.game.piece ? ', the ' + this.game.piece.type.name + ' piece that could not come in' : '';
      this.canvas.setAttribute('aria-label', e.name + ', ' + size + ', ' + why(e).toLowerCase() + blocked);
      for (const [b, off] of [[this.prevBtn, i <= 0], [this.nextBtn, i >= n - 1]]) b.setAttribute('aria-disabled', String(off));
      if (!first) this.live.textContent = e.name + ', ' + (i + 1) + ' of ' + n;
      return true;
    }

    /** One board on (d = 1) or back (d = -1), past any that cannot be drawn; nothing past either end. */
    step(d) {
      for (let i = this.index + d; i >= 0 && i < this.list.length; i += d) if (this.show(this.list[i].id)) return true;
      return false;
    }

    /** Its summary: when it lived and its numbers, in a window over the view (Close or Esc comes back here). */
    summary() {
      const e = this.rec;
      UI.openModal({ title: e.name, icon: 'retire', width: 420, cls: 'modal-retire', body: this.mode.recordBody(e, false), buttons: [{ label: 'Close', kind: 'primary' }] });
    }

    close() { this.handle.close(); }

    /** Closed (Back, Esc, a click outside): everything under it shows again, and focus goes back where it was. */
    closed() {
      this.under.forEach((s) => s.classList.remove('fv-under'));
      document.body.classList.remove('fv-open');
      this.mode.fullView = null;
      this.mode.view.dirty = true;
      if (this.back && this.back.isConnected) this.back.focus({ preventScroll: true });
    }

    /** Over the play view exactly (its rectangle in the window), so the board sits where the board in play does. */
    place() {
      const v = document.getElementById('view-play'), sc = this.handle.scrim;
      if (!v || !sc) return;
      const r = v.getBoundingClientRect(), o = sc.getBoundingClientRect();
      const key = [r.left - o.left, r.top - o.top, r.width, r.height].map(Math.round).join(',');
      if (key === this.placed) return;
      this.placed = key;
      const [x, y, w, hh] = key.split(',').map(Number);
      Object.assign(this.el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
    }

    /**
     * The piece that could not come in (a board retired full), marked: it is drawn as the Board full view draws it, over
     * the stack cells it would not fit on, so its outline is drawn round it in the theme's red, on a halo that keeps the
     * line apart from any block's colour, in either theme.
     */
    markBlocked() {
      const v = this.view, g = this.game, lay = v.lay;
      if (!g || !g.piece || !lay) return;
      const s = lay.s, at = g.cellsOf(g.piece).filter(([, y]) => y < g.h).map(([x, y]) => v.toScreen(x, y));
      if (!at.length) return;
      const keys = new Set(at.map(([x, y]) => Math.round(x) + ',' + Math.round(y)));
      const has = (x, y) => keys.has(Math.round(x) + ',' + Math.round(y));
      const light = this.app.theme.name === 'light', bad = this.bad || (light ? '#d0476f' : '#ef7a9c');
      // Only the piece's outer edges, a little inside its cells (so no stack cell beside it is touched).
      const lw = Math.max(2, Math.round(s * 0.07)), inset = (lw + 3) / 2;
      // Where an edge ends along a side: short of a convex corner, on through a straight run, past into a concave one.
      const end = (along, diag) => (!along ? -inset : diag ? inset : 0);
      const path = (ctx) => {
        ctx.beginPath();
        for (const [x, y] of at) {
          const L0 = has(x - s, y), R0 = has(x + s, y), U0 = has(x, y - s), D0 = has(x, y + s);
          if (!U0) { ctx.moveTo(x - end(L0, has(x - s, y - s)), y + inset); ctx.lineTo(x + s + end(R0, has(x + s, y - s)), y + inset); }
          if (!D0) { ctx.moveTo(x - end(L0, has(x - s, y + s)), y + s - inset); ctx.lineTo(x + s + end(R0, has(x + s, y + s)), y + s - inset); }
          if (!L0) { ctx.moveTo(x + inset, y - end(U0, has(x - s, y - s))); ctx.lineTo(x + inset, y + s + end(D0, has(x - s, y + s))); }
          if (!R0) { ctx.moveTo(x + s - inset, y - end(U0, has(x + s, y - s))); ctx.lineTo(x + s - inset, y + s + end(D0, has(x + s, y + s))); }
        }
      };
      const ctx = v.ctx;
      ctx.save();
      ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      path(ctx); ctx.strokeStyle = light ? 'rgba(255,255,255,0.95)' : 'rgba(8,10,16,0.9)'; ctx.lineWidth = lw + 3; ctx.stroke();
      path(ctx); ctx.strokeStyle = bad; ctx.lineWidth = lw; ctx.stroke();
      ctx.restore();
    }

    /** Each frame while it is up: kept in place and in the current look; drawn when something changed. */
    frame(now) {
      // A record that cannot be drawn closes the view (the board in play comes back); the app's loop runs on.
      try { this.draw(now); } catch (err) { console.warn('Lull: a retired board could not be drawn', err); this.close(); }
    }

    draw(now) {
      this.place();
      const v = this.view, look = this.app.theme, still = this.app.reducedMotion();
      // The theme can change under it (the system's light or dark); the rest of the look cannot while it is up.
      if (this.lookFor !== look || (v.look && v.look.still !== still)) { this.lookFor = look; v.setLook(this.app.look()); this.bad = getComputedStyle(document.documentElement).getPropertyValue('--bad').trim(); }
      v.resize();
      v.reducedMotion = still;
      if (v.needsFrame()) {
        v.render(now);
        this.markBlocked();
        const lay = v.lay;
        if (lay && lay.plate.w !== this.plateW) { this.plateW = lay.plate.w; this.el.style.setProperty('--plate-w', lay.plate.w + 'px'); }
      }
    }
  }

  L.RetiredView = RetiredView;
  L.RetiredView.recordGame = recordGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
