// Lull — Physics in Free Play (js/physics.js has its rules): the controller that runs the simulation in real time
// (a fixed step, every frame the board is in front), throws a hard drop, hurries a soft one, pays the bands as they
// clear and turns time back five seconds (Rewind 5 s, in Undo's place); the look (each body one soft outline drawn
// from its particles, so every squash and stretch on screen is the simulation's own, with a rim and a shine); the
// New board window's Material setting; the summary's tile and the Stats rows.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Physics, Render, CELL } = L;
  if (!Recipe || !Physics || !Render) return;
  const { shade, rgba } = Render;
  const UI = L.UI, h = UI ? UI.h : null;
  const fmtInt = L.fmtInt || ((n) => String(Math.floor(n)));

  const REWIND_NAME = 'Rewind 5 s';
  const REWIND_DESC = 'Turn time back five seconds: the pieces where they were, the queue, and the lines banked since. Costs an Undo.';

  // ---- Free Play ------------------------------------------------------------------------------------------------------

  /**
   * A Physics board's controller (composed over the plain one, and under Classic's where Classic drives the piece).
   * Its frame steps the world while the board is in front and nothing is over it; away (another window or app, the
   * pointer gone with Pause when the pointer leaves), it waits at a Paused card.
   */
  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const X = () => Physics.of(play.game);
    const classic = () => !!(play.game && play.game.recipe && play.game.recipe.mode === 'classic');
    const book = () => { const F = app.store.state.stats.free; return F.physics || (F.physics = { pieces: 0, cleared: 0, bands: 0, rewinds: 0, full: 0 }); };

    return {
      id: 'physics', soft: 0, waiting: false,
      attach() { this.soft = 0; this.waiting = false; },
      detach() { this.waiting = false; },
      /** The world moves now: Free Play in front, nothing over the board, the page shown, the board not over. */
      running() {
        const G = g();
        return !!G && !!X() && app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen() && !play.cardOpen && !play.fullView && !document.hidden && !G.over;
      },
      counts() { return this.running(); },
      frame(now, dt) {
        const G = g(), x = X();
        if (!G || !x) return;
        x.W.reduced = !!play.reduced;
        if (this.soft > 0) this.soft -= dt;
        if (!this.running()) return;
        const evs = x.tick(G, dt, { soft: this.soft > 0 });
        for (const e of evs) this.event(e);
        play.view.dirty = true;
      },
      event(e) {
        if (e.type === 'clear') this.paid(e);
        else if (e.type === 'land' && e.hard) play.view.partsCall('onImpact', e, play.reduced);
      },
      /** Bands cleared: what they pay (Physics.WORTH of a cell of a row a mino, by the board's worth), counted. */
      paid(e) {
        const G = g(), st = app.store, F = st.state.stats.free, lk = L.Library.worth(G);
        const banked = L.Library.bank(e.pay);
        if (banked) { st.addLines(banked, 'play'); G.s.banked = L.Library.bank((G.s.banked || 0) + banked); }
        F.lines = L.Library.bank(F.lines + e.rowsOwn * lk);
        F.bestScore = Math.max(F.bestScore || 0, G.s.score);
        F.bestLines = Math.max(F.bestLines || 0, L.Library.bank(G.s.own * lk));
        const B = book();
        B.cleared += e.own; B.bands += e.bands;
        // A power-up for every hundred (Standard) lines, as on every board.
        if (L.Earn) { const due = L.Earn.lines(st.state.earn, G.s.startedAt, G.s.own * lk, (G.s.own - e.rowsOwn) * lk); for (let k = 0; k < due; k++) play.earnItem(); }
        app.sound.play('clear', Math.min(4, e.bands));
        play.view.partsCall('onClear', e, play.reduced);
        app.refreshWallet(true);
        play.renderStatus();
        st.touch();
      },
      /** A hard drop: thrown straight down (Physics.hardDrop); a lowered piece only hurries while ↓ is held. */
      gate(act, rep) {
        const G = g();
        if (!G || G.over) return undefined;
        if (this.waiting) { if (!rep && (act === 'drop' || act === 'pause')) this.resume(); return true; }
        if (act === 'pause') { if (!rep) this.pause('key'); return true; }
        if (act === 'drop') {
          if (rep || play.settling('drop')) return false;
          return X().hardDrop(G);
        }
        return undefined;
      },
      softDrop() { if (!g().piece) return false; this.soft = 0.16; g().s.lowers++; return true; },
      blocked() { return this.waiting; },
      tapStarts() { return this.waiting; },
      pause(why) {
        // A window over the board only holds it; Classic has its own Paused card.
        if (why === 'modal' || classic()) return;
        const G = g();
        if (!G || G.over || play.cardOpen || play.fullView) return;
        this.waiting = true;
        play.showCard([
          h('h2', null, 'Paused'),
          h('p', null, 'The pieces wait where they are.'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'ph-go', onclick: () => this.resume() }, 'Resume ', h('kbd', null, 'Space'))),
        ], 'ph-wait');
      },
      resume() { this.waiting = false; play.hideCard(); play.view.dirty = true; },

      onLock(r) {
        const st = app.store, F = st.state.stats.free, G = g();
        play.syncCounters();
        if (play.armed) { play.armed = null; play.renderItems(); }
        F.pieces++;
        st.day().pieces++;
        const key = L.Pieces.TYPES[r.type] && L.Pieces.TYPES[r.type].family === 'tetromino' ? r.type : (L.Pieces.get(r.type) || { family: 'other' }).family;
        F.byType[key] = (F.byType[key] || 0) + 1;
        book().pieces++;
        L.Modes.playLockSound(app.sound, r);
        play.view.onLock(r, play.reduced);
        play.renderStatus();
        st.touch();
        app.achieve({ mode: 'play', r, g: G });
      },
      onEnd(kind, silent) {
        if (!silent) { app.store.state.stats.free.topouts++; book().full++; app.store.touch(); }
        this.waiting = false;
        const card = this.cards[kind] || this.cards.full;
        play.showCard(card(play, kind), 'topout');
        play.fadeEdges(play.overlay.querySelector('.board-sum'));
      },
      cards: {
        /** Board full: the board's numbers, then Rewind 5 s (while there is a moment to go back to), Boards, Retire. */
        full(pm) {
          const G = pm.game, x = Physics.of(G), ctl = pm.ctl;
          return [
            h('h2', null, 'Board full'),
            pm.boardSummary(L.Library.summarize(G.s, Date.now(), G), G.recipe, ctl.tiles(G)),
            h('div', { class: 'row' },
              x && x.rewindTarget() && !G.rules.refuse.rewind ? ctl.rewindButton({ class: 'btn', id: 'topout-rewind', onclick: () => ctl.cardRewind() }) : null,
              h('button', { class: 'btn', onclick: () => pm.openLibrary() }, UI.icon('boards'), 'Boards'),
              h('button', { class: 'btn primary', onclick: () => pm.newBoard('full') }, UI.icon('retire'), 'Retire')),
          ];
        },
      },
      /** Rewind 5 s as a button: how many Undos are held, or the price of one. */
      rewindButton(attrs) {
        const it = L.ITEMS.rewind, n = app.store.state.inventory.rewind || 0;
        return h('button', Object.assign({ 'aria-label': REWIND_NAME + ', ' + (n ? n + ' held' : 'costs ' + fmtInt(it.price) + ' lines'), 'data-tip-title': REWIND_NAME, 'data-tip': n ? n + ' ' + (n > 1 ? it.plural : it.name) + ' held' : 'Buys an Undo for ' + fmtInt(it.price) + ' ' + L.LINE }, attrs),
          UI.icon('item-rewind'), h('span', { class: 'lbl' }, REWIND_NAME), n ? h('span', { class: 'cnt' }, String(n)) : h('span', { class: 'gem' }, L.LINE + fmtInt(it.price)));
      },
      /** The card's Rewind: an Undo held is used; with none, one is bought at its price (it is on the button). */
      cardRewind() {
        const st = app.store, it = L.ITEMS.rewind;
        if (!X() || !X().rewindTarget()) return;
        if (!(st.state.inventory.rewind > 0)) {
          if (st.state.lines < it.price + this.rewindRefund()) { UI.toast('Not enough lines', 'bad'); app.sound.play('error'); return; }
          if (!st.buyItem('rewind')) return;
          app.refreshWallet();
        }
        play.apply('rewind');
      },
      /** What a rewind takes back from the wallet: what was banked since the moment it goes back to. */
      rewindRefund() {
        const G = g(), t = X() && X().rewindTarget();
        return t ? Math.round(Math.max(0, (G.s.banked || 0) - (t.s.banked || 0)) * 100) / 100 : 0;
      },
      /** Rewind 5 s (the Undo power-up here): true when time went back (the item is then used). */
      rewind() {
        const G = g(), x = X(), st = app.store;
        if (!x || !x.rewindTarget()) { UI.toast('Nothing to rewind', 'bad'); return false; }
        const need = this.rewindRefund();
        if (st.state.lines < need) { UI.toast('Not enough lines', 'bad'); app.sound.play('error'); return false; }
        const own0 = G.s.own || 0;
        x.rewind(G);
        if (need) st.addLines(-need, 'rewind');
        const F = st.state.stats.free;
        if (own0 > (G.s.own || 0)) F.lines = Math.max(0, L.Library.bank(F.lines - (own0 - (G.s.own || 0)) * L.Library.worth(G)));
        book().rewinds++;
        this.waiting = false;
        play.hideCard();
        play.setAt = play.now();
        play.snapshot();
        app.refreshWallet();
        play.renderStatus();
        play.view.partsCall('onRewind', play.reduced);
        return true;
      },
      /** The Undo power-up reads Rewind 5 s here. */
      itemText(id) { return id === 'rewind' ? { name: REWIND_NAME, desc: REWIND_DESC } : null; },
      status: (parts) => [parts.lines, parts.score, parts.side],
      // (Blocks cleared is on the summary already: the uiPart's tiles, from the board's summary numbers.)
      tiles: () => [],
    };
  }

  // ---- the look -------------------------------------------------------------------------------------------------------

  /** A board point (cells, y up) on screen. */
  function pt(view, x, y) { const s = view.lay.s, p = view.toScreen(x - 0.5, y - 0.5); return [p[0] + s / 2, p[1] + s / 2]; }
  const lightOf = (ctx) => !!ctx.__light;

  /** The path of a body's outline: each loop, its corners rounded (R of an edge), through screen points. */
  function outline(ctx, loops, P) {
    ctx.beginPath();
    for (const loop of loops) {
      const n = loop.length;
      for (let j = 0; j < n; j++) {
        const a = P(loop[(j + n - 1) % n]), v = P(loop[j]), b = P(loop[(j + 1) % n]);
        // Straight through (a vertex in the middle of a side), rounded at a corner.
        const ax = a[0] - v[0], ay = a[1] - v[1], bx = b[0] - v[0], by = b[1] - v[1];
        const r = Math.abs(ax * by - ay * bx) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1) > 0.2 ? 0.42 : 0;
        const p0 = [v[0] + ax * r, v[1] + ay * r], p1 = [v[0] + bx * r, v[1] + by * r];
        if (j === 0) ctx.moveTo(p0[0], p0[1]); else ctx.lineTo(p0[0], p0[1]);
        if (r) ctx.quadraticCurveTo(v[0], v[1], p1[0], p1[1]);
      }
      ctx.closePath();
    }
  }

  /**
   * One body: its outline filled in its colour, the seams between its minos faint, light along its top, a gloss on its
   * highest mino and a darker rim. P(i) is particle i on screen.
   */
  function drawShape(ctx, view, b, P, color, alpha) {
    const s = view.lay.s, light = lightOf(ctx);
    if (alpha < 1) { ctx.save(); ctx.globalAlpha *= alpha; }
    outline(ctx, b.loops, P);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // The seams: each mino's inner edges.
    ctx.beginPath();
    for (let k = 0; k < b.m; k++) for (let e = 0; e < 4; e++) {
      if (b.edge[k] & (1 << e)) continue;
      const i0 = b.q[4 * k + e], i1 = b.q[4 * k + ((e + 1) & 3)];
      if (i0 > i1) continue; // each inner edge once
      const p0 = P(i0), p1 = P(i1);
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    }
    ctx.strokeStyle = rgba(shade(color, -0.4), light ? 0.22 : 0.3);
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
    // Light along the top, a deeper tone low down.
    let top = Infinity, bot = -Infinity, hi = -1, hiY = Infinity;
    for (let i = 0; i < b.n; i++) { const p = P(i); if (p[1] < top) top = p[1]; if (p[1] > bot) bot = p[1]; }
    for (let k = 0; k < b.m; k++) { const p = P(b.q[4 * k + 3]); if (p[1] < hiY) { hiY = p[1]; hi = k; } }
    const gr = ctx.createLinearGradient(0, top, 0, Math.min(bot, top + s * 0.7));
    gr.addColorStop(0, 'rgba(255,255,255,' + (light ? 0.34 : 0.24) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(-1e4, top - 2, 2e4, s * 0.75);
    const lo = ctx.createLinearGradient(0, bot - s * 0.5, 0, bot);
    lo.addColorStop(0, rgba(shade(color, -0.5), 0)); lo.addColorStop(1, rgba(shade(color, -0.5), light ? 0.22 : 0.3));
    ctx.fillStyle = lo;
    ctx.fillRect(-1e4, bot - s * 0.5, 2e4, s * 0.5 + 2);
    // The gloss: an oval on the highest mino, tilted with it.
    if (hi >= 0) {
      const a = P(b.q[4 * hi + 3]), c = P(b.q[4 * hi + 2]), d = P(b.q[4 * hi]);
      const ux = c[0] - a[0], uy = c[1] - a[1], vx = d[0] - a[0], vy = d[1] - a[1];
      ctx.save();
      ctx.transform(ux, uy, vx, vy, a[0], a[1]);
      ctx.beginPath();
      ctx.ellipse(0.36, 0.24, 0.2, 0.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (light ? 0.55 : 0.42) + ')';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    outline(ctx, b.loops, P);
    ctx.strokeStyle = shade(color, light ? -0.3 : -0.45);
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (alpha < 1) ctx.restore();
  }

  function stateOf(view) {
    let S = view.physics;
    if (!S || S.game !== view.game) S = view.physics = { game: view.game, pops: [], shapes: new Map(), shake: null };
    return S;
  }
  const worldOf = (view) => { const x = view.game ? Physics.of(view.game) : null; return x ? x.W : null; };
  const now = () => (root.performance ? performance.now() : Date.now());

  /** The piece in play as a body shape (its grid corners), kept by type and turn. */
  function pieceShape(S, p) {
    const key = p.type.id + ':' + p.rot;
    let b = S.shapes.get(key);
    if (!b) {
      const cells = p.type.rots[p.rot].map(([x, y]) => [x, y]);
      b = Physics.fromCells(0, cells, cells.map(() => p.type.color), 0, 0, 0);
      if (S.shapes.size > 400) S.shapes.clear();
      S.shapes.set(key, b);
    }
    return b;
  }

  const POP_T = 0.32;
  const viewPart = {
    key: 'physics', order: 30,
    claims: 'rest',
    dangerRim: false,
    // The piece is drawn between rows (overPiece) and has no ghost (where it lands depends on bodies still moving);
    // the trays are the plain cells.
    cell(ctx, v, sx, sy, s, kind) { return kind === 'piece' || kind === 'ghost'; },
    overStack(ctx, view) {
      const W = worldOf(view);
      if (!W || !view.lay) return;
      const S = stateOf(view), t = now();
      ctx.save();
      const wl = view.lay.well || view.lay.board;
      if (wl) { ctx.beginPath(); ctx.rect(wl.x, wl.y - view.lay.s * 6, wl.w, wl.h + view.lay.s * 6); ctx.clip(); }
      for (const b of W.bodies) {
        const color = view.colorOf(b.col[0] & CELL.COLOR);
        drawShape(ctx, view, b, (i) => pt(view, b.x[i], b.y[i]), color, 1);
      }
      // What a clear took: each mino swells and fades where it was (reduced motion: fades only).
      S.pops = S.pops.filter((p) => t - p.t0 < POP_T * 1000);
      for (const p of S.pops) {
        const u = (t - p.t0) / (POP_T * 1000), s = view.lay.s, [cx, cy] = pt(view, p.x, p.y), r = s * 0.5 * (p.still ? 1 : 1 + 0.6 * u);
        ctx.globalAlpha = (1 - u) * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - r, cy - r, 2 * r, 2 * r, r * 0.45); else ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
    overPiece(ctx, view) {
      const G = view.game, p = G && G.piece, x = G ? Physics.of(G) : null;
      if (!p || !x || !view.lay || view.pileup) return;
      const S = stateOf(view), b = pieceShape(S, p), ox = p.x, oy = p.y - x.off;
      drawShape(ctx, view, b, (i) => pt(view, G.board.wx(b.lx[i] + ox), b.ly[i] + oy), view.colorOf(p.type.color), 1);
    },
    busy(view) {
      const W = worldOf(view), S = stateOf(view);
      if (!W) return false;
      if (S.pops.length || (view.game && view.game.piece && !view.game.over)) return true;
      for (const b of W.bodies) if (b.awake) return true;
      return false;
    },
    onClear(view, e, reduced) {
      const S = stateOf(view), t = now();
      for (const [x, y, v] of e.removed) S.pops.push({ x, y, color: view.colorOf(v & CELL.COLOR), t0: t, still: !!reduced });
      view.dirty = true;
    },
    onRewind(view) { const S = stateOf(view); S.pops = []; view.dirty = true; },
  };
  Recipe.viewPart(viewPart);

  // ---- the New board window, the summary, Stats ----------------------------------------------------------------------

  if (UI && h) {
    Recipe.uiPart({
      key: 'physics', order: 30, mod: 'physics', name: 'Physics',
      tab: 'mods',
      // Under the switch, once Physics is on: its material (Jelly is the only one yet).
      panel(r, api) {
        if (!Physics.on(r)) return null;
        return h('div', { class: 'cl-set ph-set' },
          h('div', { class: 'cl-row' }, h('span', { class: 'cl-nm' }, 'Material'),
            h('div', { class: 'seg cl-seg', role: 'group', 'aria-label': 'Material' }, Physics.MATERIAL_IDS.map((id) => api.option('physics.material', id, 'nb-level', Physics.MATERIALS[id].name)))),
          h('p', { class: 'ph-note' }, 'Pieces become soft bodies when they land. Rewind 5 s takes Undo’s place.'));
      },
      said(path, v) { return path === 'physics.material' ? 'Material ' + ((Physics.MATERIALS[v] || {}).name || v) : null; },
      tiles: (ext) => (ext && ext.cleared != null ? [[fmtInt(ext.cleared), 'Blocks cleared']] : []),
    });
    if (UI.statRow) {
      UI.statRow('physics', {
        sub: 'free', at: 'end', id: 'physics',
        render(app, S) {
          const B = S.free && S.free.physics;
          if (!B || !B.pieces) return null;
          const rows = [['Pieces', B.pieces], ['Blocks cleared', B.cleared], ['Bands cleared', B.bands], ['Rewinds', B.rewinds], ['Boards full', B.full]];
          return [h('h4', null, 'Physics'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, fmtInt(v || 0)))))];
        },
      });
    }
  }

  L.PhysicsView = { controller, view: viewPart, drawShape, REWIND_NAME, REWIND_DESC };
})(typeof globalThis !== 'undefined' ? globalThis : this);
