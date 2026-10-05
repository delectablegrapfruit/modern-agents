// Lull — Descent's look and its place in Free Play (the rules are js/descent.js): the hanging blocks, stone and rods on
// the board, each lane's next lowering as a tick at its top, shots as thin lines of light, the clock that runs the
// descent (its Ready and Paused cards, pausing whenever the board is not in front), Stage, Broken and Next in the status
// bar, the Cleared and Topped out cards, Rewind 5 s in Undo's place, the Custom window's level row and stage picker
// (and the menu's Descent setup), the summary's tiles, and the Descent line in Stats.
//
//   Blocks     glass, a clear pane with a slow shimmer; dense, smoky and thicker (a crack once hit); armoured, banded top
//              and bottom; prism, faceted; drip, a bead underneath that swells before it falls; weight, dark with two
//              chevrons down; echo, a doubled outline; lock, a keyhole and a notch on the side of the lane it points to.
//   Stone      a matte grey cell with two specks; a rod a thin line from the ceiling to a short lane's top.
//   Lanes      a short bar at the top of each lane fills toward its next lowering; in its last two seconds the cell (or
//              two, for a weight) it will move into is outlined, warm where the block would fuse into stone.
//   Reduced motion: no shimmer; shots and breaks are a short fade.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Descent, CELL, Render, UI, Library, fmtInt, fmtDuration } = L;
  if (!Recipe || !Descent || !UI || !Render) return;
  const { h } = UI;
  const ico = UI.icon;
  const { HANG, STONE } = CELL;
  const TPS = Descent.TPS;

  const COLORS = {
    light: {
      glass: 'rgba(78,98,124,0.2)', edge: 'rgba(58,78,104,0.62)', shine: 'rgba(255,255,255,0.7)', dense: 'rgba(58,70,88,0.46)', denseEdge: 'rgba(40,50,64,0.8)',
      band: 'rgba(40,48,60,0.78)', prism: 'rgba(116,92,170,0.22)', facet: 'rgba(96,72,150,0.55)', weight: 'rgba(38,44,54,0.86)', mark: 'rgba(255,255,255,0.78)',
      bead: '#3f74a6', key: 'rgba(30,38,50,0.85)', rod: 'rgba(58,78,104,0.28)', stone: '#aaa79e', speck: 'rgba(70,66,58,0.5)', stoneEdge: 'rgba(90,86,78,0.55)',
      tick: 'rgba(58,78,104,0.22)', tickOn: '#3f6a9c', warn: '#3f6a9c', fuse: '#b8742c', shot: 'rgba(63,106,156,0.85)', crack: 'rgba(30,36,46,0.7)',
    },
    dark: {
      glass: 'rgba(168,196,228,0.13)', edge: 'rgba(190,214,240,0.5)', shine: 'rgba(255,255,255,0.42)', dense: 'rgba(140,162,190,0.3)', denseEdge: 'rgba(200,220,242,0.62)',
      band: 'rgba(214,226,242,0.7)', prism: 'rgba(176,150,240,0.2)', facet: 'rgba(196,176,250,0.55)', weight: 'rgba(14,17,24,0.92)', mark: 'rgba(214,226,242,0.75)',
      bead: '#8fc2f0', key: 'rgba(222,232,246,0.85)', rod: 'rgba(190,214,240,0.22)', stone: '#55575d', speck: 'rgba(200,198,190,0.35)', stoneEdge: 'rgba(170,170,165,0.35)',
      tick: 'rgba(190,214,240,0.18)', tickOn: '#9cc4f0', warn: '#9cc4f0', fuse: '#e7b46a', shot: 'rgba(196,222,250,0.9)', crack: 'rgba(230,238,250,0.7)',
    },
  };
  const colorsFor = (theme) => (theme && theme.name === 'light' ? COLORS.light : COLORS.dark);
  const now = () => (Render.FREEZE != null ? 4321 : performance.now());

  // The group's icon: three lanes hanging from a line, the middle one lowest.
  if (L.Icons) L.Icons.I.descent = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M1.75 2h12.5"/><rect x="2.25" y="4" width="3" height="3" rx="0.8"/><rect x="6.5" y="4" width="3" height="3" rx="0.8"/><rect x="6.5" y="8.25" width="3" height="3" rx="0.8"/><rect x="10.75" y="4" width="3" height="3" rx="0.8"/><path d="M8 13.25v1"/></svg>';

  // ---- drawing -------------------------------------------------------------------------------------------------------

  const rr = (ctx, x, y, w, hh, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh); };

  /** A hanging block in a cell (sx, sy, s): its kind's look. blk: { k, hp, d, t }; o: { t (now), x (its lane), lockedNow, still }. */
  function drawBlock(ctx, blk, sx, sy, s, col, o) {
    o = o || {};
    const k = blk.k, pad = Math.max(1, s * 0.07), x = sx + pad, y = sy + pad, w = s - pad * 2, r = Math.max(1.5, s * 0.14);
    const lw = Math.max(1, s * 0.06);
    ctx.save();
    if (k === 'weight') {
      ctx.fillStyle = col.weight; rr(ctx, x, y, w, w, r); ctx.fill();
      ctx.strokeStyle = col.denseEdge; ctx.lineWidth = lw; rr(ctx, x + lw / 2, y + lw / 2, w - lw, w - lw, r); ctx.stroke();
      ctx.strokeStyle = col.mark; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const dy of [0.36, 0.56]) { ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + w * dy); ctx.lineTo(x + w * 0.5, y + w * (dy + 0.14)); ctx.lineTo(x + w * 0.7, y + w * dy); ctx.stroke(); }
      ctx.restore();
      return;
    }
    const dense = k === 'dense';
    ctx.fillStyle = dense ? col.dense : k === 'prism' ? col.prism : col.glass;
    rr(ctx, x, y, w, w, r); ctx.fill();
    ctx.strokeStyle = dense ? col.denseEdge : col.edge;
    ctx.lineWidth = dense ? lw * 1.8 : lw;
    rr(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, w - ctx.lineWidth, r); ctx.stroke();
    // The slow shimmer: a soft band of light crossing the pane (none when still).
    if (!o.still && (k === 'glass' || k === 'prism' || k === 'echo' || k === 'drip' || k === 'lock')) {
      const ph = ((o.t || 0) / 5200 + (o.x || 0) * 0.11 + (o.y || 0) * 0.07) % 1;
      const bx = x - w * 0.6 + ph * w * 2.2;
      ctx.save(); rr(ctx, x, y, w, w, r); ctx.clip();
      const g = ctx.createLinearGradient(bx, y, bx + w * 0.5, y + w);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, col.shine); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.35; ctx.fillStyle = g; ctx.fillRect(x, y, w, w);
      ctx.restore();
    } else if (o.still && k !== 'armour') {
      ctx.strokeStyle = col.shine; ctx.globalAlpha = 0.45; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x + w * 0.22, y + w * 0.3); ctx.lineTo(x + w * 0.38, y + w * 0.18); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = col.crack; ctx.lineWidth = lw; ctx.lineCap = 'round';
    if (dense && blk.hp < 2) { ctx.beginPath(); ctx.moveTo(x + w * 0.2, y + w * 0.25); ctx.lineTo(x + w * 0.45, y + w * 0.5); ctx.lineTo(x + w * 0.4, y + w * 0.72); ctx.moveTo(x + w * 0.45, y + w * 0.5); ctx.lineTo(x + w * 0.78, y + w * 0.6); ctx.stroke(); }
    if (k === 'armour') {
      ctx.fillStyle = col.band;
      const bh = Math.max(2, w * 0.2);
      rr(ctx, x, y, w, bh, [r, r, 0, 0]); ctx.fill();
      rr(ctx, x, y + w - bh, w, bh, [0, 0, r, r]); ctx.fill();
    } else if (k === 'prism') {
      ctx.strokeStyle = col.facet; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + w * 0.12); ctx.lineTo(x + w * 0.88, y + w / 2); ctx.lineTo(x + w / 2, y + w * 0.88); ctx.lineTo(x + w * 0.12, y + w / 2); ctx.closePath();
      ctx.moveTo(x + w * 0.12, y + w / 2); ctx.lineTo(x + w * 0.88, y + w / 2); ctx.stroke();
    } else if (k === 'echo') {
      ctx.strokeStyle = col.edge; ctx.lineWidth = lw; const i = w * 0.22;
      rr(ctx, x + i, y + i, w - 2 * i, w - 2 * i, r * 0.6); ctx.stroke();
    } else if (k === 'lock') {
      ctx.fillStyle = col.key; ctx.globalAlpha = o.lockedNow ? 1 : 0.5;
      ctx.beginPath(); ctx.arc(x + w / 2, y + w * 0.42, w * 0.13, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + w * 0.44, y + w * 0.45); ctx.lineTo(x + w * 0.56, y + w * 0.45); ctx.lineTo(x + w * 0.6, y + w * 0.74); ctx.lineTo(x + w * 0.4, y + w * 0.74); ctx.closePath(); ctx.fill();
      // The notch: the side of the lane it points to.
      const ex = blk.d > 0 ? x + w : x;
      ctx.beginPath(); ctx.moveTo(ex, y + w * 0.36); ctx.lineTo(ex - blk.d * w * 0.16, y + w / 2); ctx.lineTo(ex, y + w * 0.64); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (k === 'drip') {
      const warn = Descent.DRIP_WARN * TPS, grow = o.lowest && blk.t <= warn ? 1 - blk.t / warn : 0;
      ctx.fillStyle = col.bead;
      ctx.beginPath(); ctx.arc(x + w / 2, y + w * 0.82, Math.max(1.4, w * (0.1 + 0.08 * grow)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  /** Stone: a matte grey cell with two specks. */
  function drawStone(ctx, sx, sy, s, col) {
    const pad = Math.max(0.5, s * 0.04), w = s - 2 * pad;
    ctx.fillStyle = col.stone; rr(ctx, sx + pad, sy + pad, w, w, Math.max(1, s * 0.1)); ctx.fill();
    ctx.strokeStyle = col.stoneEdge; ctx.lineWidth = Math.max(1, s * 0.05); rr(ctx, sx + pad + 0.5, sy + pad + 0.5, w - 1, w - 1, Math.max(1, s * 0.1)); ctx.stroke();
    ctx.fillStyle = col.speck;
    ctx.beginPath(); ctx.arc(sx + s * 0.34, sy + s * 0.38, Math.max(0.8, s * 0.06), 0, Math.PI * 2); ctx.arc(sx + s * 0.64, sy + s * 0.66, Math.max(0.8, s * 0.05), 0, Math.PI * 2); ctx.fill();
  }

  /** The block in a hanging cell at (x, y), from the board's descent (null: a rod, or a record with no state). */
  function blockAt(D, x, y) {
    const l = D && D.lanes[x];
    if (!l) return null;
    return l.blocks[y - l.bot] || null;
  }
  /** The screen box of a cell, whatever the view's turn. */
  const cellBox = (view, x, y) => { const [sx, sy] = view.toScreen(x, y); return { x: sx, y: sy, s: view.lay.s }; };

  // ---- the board view's part -------------------------------------------------------------------------------------------

  const VIEW = {
    key: 'descent', order: 47, dangerRim: false,
    active(game) { return !!Descent.of(game); },
    claims(v) { return !!(v & (HANG | STONE)); },
    cell(ctx, v, sx, sy, s, kind, view, at) {
      if (kind !== 'stack') return false;
      const col = colorsFor(view.look.theme);
      if (v & STONE) { drawStone(ctx, sx, sy, s, col); return true; }
      const D = Descent.of(view.game), blk = at ? blockAt(D, at.x, at.y) : null;
      if (!blk) {
        // A rod: a thin line from the ceiling.
        ctx.strokeStyle = col.rod; ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.beginPath(); ctx.moveTo(sx + s / 2, sy); ctx.lineTo(sx + s / 2, sy + s); ctx.stroke();
        return true;
      }
      const lane = D.lanes[at.x];
      drawBlock(ctx, blk, sx, sy, s, col, { t: now(), x: at.x, y: at.y, still: !!view.reducedMotion || Render.FREEZE != null, lowest: lane.blocks[0] === blk, lockedNow: lane.blocks[0] === blk && Descent.locked(D, at.x) });
      return true;
    },
    overStack(ctx, view) {
      const g = view.game, D = Descent.of(g);
      if (!D || g.over) return;
      const col = colorsFor(view.look.theme), s = view.lay.s, frac = view.descentFrac || 0;
      const lw = Math.max(1, s * 0.07), up = view.screenDir ? view.screenDir(0, 1)[1] : -1;
      for (let x = 0; x < D.w; x++) {
        const l = D.lanes[x];
        if (!l.blocks.length) continue;
        const iv = Descent.intervalOf(D, l), left = Math.max(0, l.next - frac), k = Math.max(0, Math.min(1, 1 - left / iv));
        const top = cellBox(view, x, g.h - 1);
        // The tick: a short bar just over the lane's top, outside the well, filling toward its next lowering.
        const bw = s * 0.62, bh = Math.max(2, Math.round(s * 0.11)), bx = top.x + (s - bw) / 2, by = up < 0 ? top.y - bh - Math.max(2, s * 0.08) : top.y + s + Math.max(2, s * 0.08);
        const soon = left <= 2 * TPS;
        ctx.fillStyle = col.tick; rr(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
        ctx.fillStyle = soon ? col.tickOn : col.edge; rr(ctx, bx, by, Math.max(bh, bw * k), bh, bh / 2); ctx.fill();
        if (!soon) continue;
        // In its last two seconds: where it moves to, or the block that fuses (warm).
        const steps = l.blocks[0].k === 'weight' ? 2 : 1;
        for (let i = 1; i <= steps; i++) {
          const y = l.bot - i;
          if (y >= g.h) continue;
          const v = y >= 0 ? g.board.get(x, y) : CELL.WALL;
          const fuse = y < 0 || (!!v && !(v & HANG));
          const c = fuse ? cellBox(view, x, y + 1) : cellBox(view, x, y);
          if (fuse && y + 1 >= g.h) break;
          ctx.strokeStyle = fuse ? col.fuse : col.warn; ctx.lineWidth = lw;
          ctx.globalAlpha = 0.35 + 0.5 * (1 - left / (2 * TPS));
          ctx.setLineDash(fuse ? [] : [Math.max(2, s * 0.18), Math.max(2, s * 0.14)]);
          rr(ctx, c.x + lw, c.y + lw, s - 2 * lw, s - 2 * lw, Math.max(1.5, s * 0.12)); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
          if (fuse) break;
        }
      }
      // A drip about to let its stone fall: where it lands, outlined.
      for (let x = 0; x < D.w; x++) {
        const l = D.lanes[x], d = l.blocks[0];
        if (!d || d.k !== 'drip' || l.bot >= g.h || d.t > Descent.DRIP_WARN * TPS) continue;
        let land = l.bot - 1;
        const solid = (yy) => { if (yy < 0) return true; const v = g.board.get(x, yy); return !!v && !(v & HANG); };
        while (land > 0 && !solid(land - 1)) land--;
        if (land >= l.bot || solid(land)) continue;
        const c = cellBox(view, x, land);
        ctx.fillStyle = col.bead; ctx.globalAlpha = 0.18 + 0.3 * (1 - d.t / (Descent.DRIP_WARN * TPS));
        rr(ctx, c.x + s * 0.3, c.y + s * 0.3, s * 0.4, s * 0.4, s * 0.2); ctx.fill(); ctx.globalAlpha = 1;
      }
    },
    /** A clear's volleys: a thin line of light from each cell up to what it hit; what broke shatters (fades, still). */
    onLock(view, r, reduced) {
      const ev = r && r.descent;
      if (!ev || !view.lay) return;
      showShots(view, ev, reduced);
    },
    /** A tick's events: stone fused or fallen, in a short fade. */
    onTick(view, ev, reduced) {
      if (!ev || !view.lay) return;
      const col = colorsFor(view.look.theme), s = view.lay.s, cells = [];
      for (const f of ev.fused) if (f.y < view.game.h) { cells.push(f); if (f.echo) cells.push({ x: f.echo[0], y: f.echo[1] }); }
      for (const d of ev.drips) cells.push({ x: d.x, y: d.to });
      if (cells.length) {
        const boxes = cells.map((c) => cellBox(view, c.x, c.y));
        view.fx.prop(reduced ? 0.25 : 0.5, (ctx, k) => {
          ctx.save(); ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = col.shine;
          for (const b of boxes) { rr(ctx, b.x + s * 0.08, b.y + s * 0.08, s * 0.84, s * 0.84, s * 0.14); ctx.fill(); }
          ctx.restore();
        });
      }
      view.dirty = true;
    },
    busy() { return false; },
    /** The Custom window's preview: the rows that hang when the board starts. */
    preview(ctx, gm, recipe, theme) {
      if (!Descent.on(recipe)) return;
      const lv = Descent.LEVELS[recipe.descent.level] || Descent.LEVELS.easy, rows = Math.max(2, Math.round(gm.h * lv.start)), c = gm.c, col = colorsFor(theme);
      for (let yy = 0; yy < rows; yy++) for (let x = 0; x < gm.w; x++) {
        const px = gm.x + x * c, py = gm.y + yy * c;
        drawBlock(ctx, { k: 'glass', hp: 1 }, px, py, c, col, { still: true });
      }
    },
  };
  Recipe.viewPart(VIEW);

  /** The shots of a clear, drawn: each hit a line from the cleared row's cell to the block it reached. */
  function showShots(view, ev, reduced) {
    const col = colorsFor(view.look.theme), s = view.lay.s, g = view.game, fx = view.fx;
    const lines = [];
    for (const hgt of ev.hits) {
      const shot = ev.shots.find((sh) => sh.x === hgt.from) || { y: 0 };
      if (hgt.y >= g.h) continue;
      const a = cellBox(view, hgt.from, Math.min(g.h - 1, shot.y)), b = cellBox(view, hgt.x, Math.min(g.h - 1, hgt.y));
      lines.push({ x0: a.x + s / 2, y0: a.y + s / 2, x1: b.x + s / 2, y1: b.y + s / 2, r: hgt.r });
    }
    if (lines.length) {
      fx.prop(reduced ? 0.2 : 0.42, (ctx, k) => {
        ctx.save();
        ctx.lineWidth = Math.max(1, s * 0.06); ctx.lineCap = 'round';
        ctx.globalAlpha = reduced ? 0.6 * (1 - k) : 0.85 * (1 - k);
        ctx.strokeStyle = col.shot;
        ctx.beginPath();
        for (const ln of lines) { ctx.moveTo(ln.x0, ln.y0); ctx.lineTo(ln.x1, ln.y1); }
        ctx.stroke();
        ctx.restore();
      });
    }
    const broke = ev.broken.filter((b) => b.y < g.h).map((b) => { const c = cellBox(view, b.x, b.y); return { x: c.x, y: c.y, color: view.look.theme.name === 'light' ? '#7d93ad' : '#a9c3df' }; });
    if (broke.length) fx.burst(reduced ? 'fade' : 'ripple', broke, s, reduced);
    view.dirty = true;
  }

  // ---- Free Play: the controller ----------------------------------------------------------------------------------------

  const MS = 1000 / TPS;
  const BOOK = ['broken', 'fused', 'stones', 'shots'];
  const REWIND_NAME = 'Rewind 5 s';
  const REWIND_DESC = 'Turn time back five seconds: the descent, your stack, the piece and the queue, and the lines banked since. Costs an Undo.';
  const blank = () => ({ ms: 0, broken: 0, fused: 0, stones: 0, shots: 0, cleared: 0, topped: 0, stages: { easy: [], medium: [], hard: [] }, endless: { easy: 0, medium: 0, hard: 0 } });
  const statsOf = (store) => { const F = store.state.stats.free; const B = F.descent || (F.descent = blank()); if (!B.stages) B.stages = { easy: [], medium: [], hard: [] }; if (!B.endless) B.endless = { easy: 0, medium: 0, hard: 0 }; return B; };

  /** The lifetime stats: what the board did since last booked, never twice (D.book). */
  function book(store, D) {
    const B = statsOf(store);
    let any = false;
    for (const k of BOOK) {
      const d = (D.st[k] || 0) - (D.book[k] || 0);
      if (d <= 0) continue;
      any = true; B[k] = (B[k] || 0) + d; D.book[k] = D.st[k];
    }
    if (D.tk > (D.book.tk || 0)) { any = true; B.ms = (B.ms || 0) + (D.tk - (D.book.tk || 0)) * MS; D.book.tk = D.tk; }
    if (D.stage === 'endless' && Descent.rowsBroken(D) > (B.endless[D.level] || 0)) { any = true; B.endless[D.level] = Descent.rowsBroken(D); }
    if (any) store.touch();
  }

  /** "Stage 3 · Easy", "Endless · Hard". */
  const subOf = (D) => Descent.stageName(D.stage) + ' · ' + Descent.NAMES[D.level];
  const nextOf = (stage) => (stage === 'endless' ? 'endless' : stage >= Descent.STAGE_COUNT ? 'endless' : stage + 1);

  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const D = () => Descent.of(play.game);
    const X = () => Descent.extOf(play.game);
    return {
      id: 'descent', timeKey: 'descent', waiting: false, acc: 0, shown: -1,

      attach(game) {
        this.acc = 0; this.waiting = false; this.shown = -1;
        if (game.over) return;
        this.wait();
      },
      detach() { this.waiting = false; play.view.descentFrac = 0; },

      /** The clock runs now: Free Play in front, nothing over the board, the page shown and focused, not waiting, not over. */
      running() {
        const gm = g();
        return !!gm && !!D() && app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen() && !play.cardOpen && !document.hidden && document.hasFocus() && !this.waiting && !gm.over;
      },
      counts() { return this.running(); },
      blocked() { return this.waiting; },
      tapStarts() { return this.waiting && !UI.modalOpen(); },

      /** The card it waits at: Ready before the clock first runs (the stage's line), then Paused. */
      wait() {
        const x = D();
        if (!x || g().over) return;
        this.waiting = true;
        const first = !x.started, st = x.stage === 'endless' ? null : Descent.STAGES[x.stage - 1];
        const best = x.stage === 'endless' ? (statsOf(app.store).endless[x.level] || 0) : 0;
        play.showCard([
          h('h2', null, first ? 'Descent' : 'Paused'),
          h('p', { class: 'cl-sub' }, subOf(x) + (first ? '' : ' · ' + Descent.clock(x))),
          first && st ? h('p', { class: 'ds-line' }, st.line) : null,
          first && !st ? h('p', { class: 'ds-line' }, best ? 'Best ' + fmtInt(best) + ' rows' : 'The descent never runs out.') : null,
          h('div', { class: 'row' },
            play.menuButton(),
            h('button', { class: 'btn primary', id: 'ds-go', onclick: () => this.go() }, first ? 'Start ' : 'Resume ', h('kbd', null, 'Space'))),
        ], 'ds-card ds-wait');
        play.renderStatus();
      },
      go() {
        const x = D();
        if (!x || g().over) return;
        x.started = true;
        this.waiting = false;
        this.acc = 0;
        play.hideCard();
        play.view.dirty = true;
        play.renderStatus();
      },
      /** Away from the board (blur, the pointer gone, hidden, another tab, a window over it, rolled up): Paused. */
      pause() {
        const x = D();
        if (this.waiting || !x || !x.started || g().over || play.cardOpen) return;
        this.wait();
      },
      gate(act, rep) {
        const gm = g();
        if (!gm) return undefined;
        if (gm.over) {
          if (act === 'drop' && !rep && play.cardOpen && !play.settling('drop')) { this.primary(gm.endKind || 'full'); return true; }
          return undefined;
        }
        if (this.waiting) { if (!rep && (act === 'drop' || act === 'pause')) this.go(); return true; }
        if (act === 'pause') { if (!rep) this.wait(); return true; }
        return undefined;
      },

      frame(now, dt) {
        const gm = g(), x = D();
        if (!gm || !x || !this.running()) return;
        this.acc += Math.min(dt, 0.25) * 1000;
        while (this.acc >= MS && !gm.over) {
          this.acc -= MS;
          const ev = Descent.advance(gm);
          if (!ev) break;
          this.onTick(ev);
        }
        play.view.descentFrac = this.acc / MS;
        play.view.dirty = true;
      },
      onTick(ev) {
        const x = D(), snd = app.sound;
        if (ev.fused.length || ev.drips.length) play.view.partsCall('onTick', ev, play.reduced);
        if (ev.fused.length) snd.play('land');
        else if (ev.drips.length) snd.play('stamp');
        const sec = Descent.secs(x), nx = Descent.nextLowering(x), nsec = nx ? Math.ceil(nx.t / TPS) : -1;
        if (sec !== this.shown || nsec !== this.nshown || ev.fused.length || ev.lowered.length) { this.shown = sec; this.nshown = nsec; play.renderStatus(); }
        if (x.tk % (5 * TPS) === 0) book(app.store, x);
      },

      onLock(r) {
        this.base.onLock(r);
        const x = D();
        if (!x) return;
        book(app.store, x);
        if (r.descent) app.achieve({ mode: 'descent', ev: r.descent, D: x, g: g() });
      },

      /** Stage, Broken and Next in Score's place, and a Pause button. */
      status(parts, o) {
        const x = D();
        if (!x) return o.prev;
        const nx = Descent.nextLowering(x), stat = o.stat, endless = x.stage === 'endless';
        const leftTip = endless ? 'Endless: the descent never runs out' : Descent.rowsLeft(x) + ' of ' + (x.total / x.w) + ' rows left';
        const stage = stat('Stage', endless ? 'Endless' : String(x.stage), null, Descent.stageName(x.stage) + ', ' + Descent.NAMES[x.level]);
        const broken = stat('Broken', fmtInt(Descent.rowsBroken(x)), null, leftTip);
        const next = stat('Next', nx ? Math.max(0, Math.ceil(nx.t / TPS)) + ' s' : '—', null, nx ? 'Lane ' + (nx.x + 1) + ' lowers next' : 'Nothing left to lower');
        const btn = h('button', { class: 'icon-btn ds-pause', 'aria-label': this.waiting ? 'Resume' : 'Pause', 'data-tip': this.waiting ? 'Resume' : 'Pause', 'data-tip-foot': 'P', disabled: g().over ? true : null,
          html: L.Icons.icon(this.waiting ? 'playIcon' : 'pause'), onclick: () => (this.waiting ? this.go() : this.wait()) });
        const out = [];
        // (Lines steps aside on a narrow window, as the other optional figures do.)
        for (const el of o.prev) { if (el === parts.score) out.push(stage, broken, next); else if (el === parts.lines) out.push(stat('Lines', fmtInt(g().s.lines), 'opt')); else if (el !== parts.side) out.push(el); }
        out.push(btn);
        return out;
      },

      onEnd(kind, silent) {
        this.waiting = false;
        const st = app.store, x = D(), gm = g();
        if (x && !silent) {
          const B = statsOf(st);
          if (kind === 'cleared') {
            B.cleared++;
            const list = B.stages[x.level] || (B.stages[x.level] = []);
            if (x.stage !== 'endless' && !list.includes(x.stage)) list.push(x.stage);
            list.sort((a, b) => a - b);
          } else B.topped++;
          book(st, x);
          st.touch();
          if (kind === 'cleared') { app.sound.play('solve'); app.achieve({ mode: 'descent', kind, D: x, g: gm }); }
          else app.sound.play('fail');
          if (app.saveNow) app.saveNow();
        }
        play.showCard((this.cards[kind === 'cleared' ? 'cleared' : 'full'])(play, kind), 'topout ds-card ds-end');
        play.renderStatus();
        play.renderItems();
      },
      /** The end card's main button (Space too): the next stage once cleared, else the same stage again. */
      primary(kind) {
        const x = D();
        if (!x) return;
        if (kind === 'cleared') this.startStage(nextOf(x.stage), 'cleared');
        else this.startStage(x.stage, kind || 'full');
      },
      /** A new game in this one's place (New game), of the same size and level at that stage, waiting at its Ready card. */
      startStage(stage, reason) {
        const gm = g();
        play.newBoard(reason, Recipe.normalize(Object.assign({}, gm.recipe, { descent: { level: gm.recipe.descent.level, stage } })));
      },
      cards: {
        cleared(pm) {
          const ctl = pm.ctl, x = Descent.of(pm.game), nxt = nextOf(x.stage);
          return [
            h('h2', null, 'Cleared'),
            h('p', { class: 'cl-sub' }, subOf(x)),
            h('p', null, fmtInt(x.total / x.w) + ' rows in ' + fmtDuration(Math.max(1000, x.tk * MS))),
            h('div', { class: 'row' },
              pm.menuButton(),
              h('button', { class: 'btn primary', id: 'ds-next', onclick: () => ctl.primary('cleared') }, nxt === 'endless' ? 'Endless ' : 'Stage ' + nxt + ' ', h('kbd', null, 'Space'))),
          ];
        },
        full(pm) {
          const ctl = pm.ctl, gm = pm.game, x = Descent.of(gm), X2 = Descent.extOf(gm);
          const endless = x && x.stage === 'endless';
          const best = endless ? statsOf(app.store).endless[x.level] || 0 : 0;
          return [
            h('h2', null, 'Topped out'),
            x ? h('p', { class: 'cl-sub' }, subOf(x)) : null,
            x ? h('p', null, endless ? h('span', { class: 'big' }, fmtInt(Descent.rowsBroken(x))) : null, endless ? ' rows' + (best > Descent.rowsBroken(x) ? ' · best ' + fmtInt(best) : '') : Descent.rowsBroken(x) + ' of ' + (x.total / x.w) + ' rows broken') : null,
            h('div', { class: 'row' },
              X2 && X2.rewindTarget() && !gm.rules.refuse.rewind ? ctl.rewindButton({ class: 'btn', id: 'ds-rewind', onclick: () => ctl.cardRewind() }) : null,
              pm.menuButton(),
              h('button', { class: 'btn primary', id: 'ds-again', onclick: () => ctl.primary('full') }, 'Try again ', h('kbd', null, 'Space'))),
          ];
        },
      },

      // ---- Rewind 5 s, in Undo's place ----
      rewindButton(attrs) {
        const it = L.ITEMS.rewind, n = app.store.state.inventory.rewind || 0;
        return h('button', Object.assign({ 'aria-label': REWIND_NAME + ', ' + (n ? n + ' held' : 'costs ' + fmtInt(it.price) + ' lines'), 'data-tip-title': REWIND_NAME, 'data-tip': n ? n + ' ' + (n > 1 ? it.plural : it.name) + ' held' : 'Buys an Undo for ' + fmtInt(it.price) + ' ' + L.LINE }, attrs),
          ico('item-rewind'), h('span', { class: 'lbl' }, REWIND_NAME), n ? h('span', { class: 'cnt' }, String(n)) : h('span', { class: 'gem' }, L.LINE + fmtInt(it.price)));
      },
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
        const gm = g(), t = X() && X().rewindTarget();
        return t ? Math.round(Math.max(0, (gm.s.banked || 0) - (t.s.banked || 0)) * 100) / 100 : 0;
      },
      /** Rewind 5 s (the Undo power-up here): true when time went back (the item is then used). */
      rewind() {
        const gm = g(), x = X(), st = app.store;
        if (!x || !x.rewindTarget()) { UI.toast('Nothing to rewind', 'bad'); return false; }
        const need = this.rewindRefund();
        if (st.state.lines < need) { UI.toast('Not enough lines', 'bad'); app.sound.play('error'); return false; }
        const own0 = gm.s.own || 0;
        x.rewind(gm);
        if (need) st.addLines(-need, 'rewind');
        const F = st.state.stats.free;
        if (own0 > (gm.s.own || 0)) F.lines = Math.max(0, Library.bank(F.lines - (own0 - (gm.s.own || 0)) * Library.worth(gm)));
        play.hideCard();
        play.setAt = play.now();
        play.snapshot();
        app.refreshWallet();
        play.view.fx.clear();
        play.view.dirty = true;
        // Back where it was, at the Paused card: Space to go on.
        this.wait();
        return true;
      },
      itemText(id) { return id === 'rewind' ? { name: REWIND_NAME, desc: REWIND_DESC } : null; },

      tiles(game) {
        const x = Descent.of(game);
        return x ? tilesOf(Descent.summaryOf(x)) : [];
      },
    };
  }

  const clockOf = (ms) => { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const tilesOf = (ext) => (ext && ext.rows != null ? [[fmtInt(ext.rows), 'Rows broken'], [fmtInt(ext.stones || 0), 'Stone'], [clockOf(ext.ms), 'Time']] : []);

  // ---- the Custom window and the menu's setup, Stats ----------------------------------------------------------------

  Recipe.uiPart({
    key: 'descent', order: 47, mode: 'descent', name: 'Descent',
    levels: () => ({ path: 'descent.level', values: Descent.IDS.map((v) => [v, Descent.NAMES[v]]) }),
    tab: 'mode',
    /** The stage: a stepper through 1–12 and Endless, and how many of the 12 are cleared on this level. */
    panel(r, api) {
      if (!Descent.on(r)) return null;
      const B = api.app && api.app.store.state.stats.free.descent, done = (B && B.stages && B.stages[r.descent.level]) || [];
      const all = Descent.STAGES_ALL, i = Math.max(0, all.indexOf(r.descent.stage)), v = all[i], path = 'descent.stage';
      const word = v === 'endless' ? 'Endless' : String(v), cleared = v !== 'endless' && done.includes(v);
      const to = (j) => { if (j >= 0 && j < all.length && j !== i) api.choose(path, all[j]); };
      return h('div', { class: 'cl-row ds-row' }, h('span', { class: 'cl-nm' }, 'Stage'),
        h('span', { class: 'ds-done' }, !done.length ? '' : cleared ? 'Cleared (' + done.length + ' of ' + Descent.STAGE_COUNT + ')' : done.length + ' of ' + Descent.STAGE_COUNT + ' cleared'),
        h('div', { class: 'nb-stepper cl-step ds-step' },
          h('button', { type: 'button', class: 'icon-btn nb-step', 'data-focus': path + '-', 'aria-label': 'Earlier stage', 'aria-disabled': String(i <= 0), html: L.Icons.icon('minus'), onclick: () => to(i - 1) }),
          h('div', { class: 'nb-val ds-val' + (cleared ? ' done' : ''), role: 'spinbutton', tabindex: '0', 'data-focus': path, 'aria-label': 'Stage', 'aria-valuemin': '1', 'aria-valuemax': String(all.length), 'aria-valuenow': String(i + 1),
            'aria-valuetext': Descent.stageName(v) + (cleared ? ', cleared' : ''),
            onkeydown: (e) => { const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (!by) return; e.preventDefault(); e.stopPropagation(); to(Math.max(0, Math.min(all.length - 1, i + by))); } }, word),
          h('button', { type: 'button', class: 'icon-btn nb-step', 'data-focus': path + '+', 'aria-label': 'Later stage', 'aria-disabled': String(i >= all.length - 1), html: L.Icons.icon('plus'), onclick: () => to(i + 1) })));
    },
    said(path, v) { return path === 'descent.stage' ? Descent.stageName(v) : null; },
    tiles: (ext) => tilesOf(ext),
    endName: (reason) => (reason === 'cleared' ? 'Cleared' : null),
  });

  UI.statRow('descent', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const P = stats.free && stats.free.descent;
      if (!P || !(P.ms || P.broken || P.cleared || P.topped)) return null;
      const rows = [['Time', fmtDuration(P.ms || 0)], ['Stages cleared', fmtInt(P.cleared)], ['Blocks broken', fmtInt(P.broken)], ['Turned to stone', fmtInt(P.fused)], ['Topped out', fmtInt(P.topped)]];
      for (const id of Descent.IDS) {
        const n = ((P.stages || {})[id] || []).length;
        if (n) rows.push([Descent.NAMES[id] + ' stages', n + ' of ' + Descent.STAGE_COUNT]);
      }
      for (const id of Descent.IDS) if ((P.endless || {})[id]) rows.push(['Endless best, ' + Descent.NAMES[id], fmtInt(P.endless[id]) + ' rows']);
      return [h('h4', null, 'Descent'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, v))))];
    },
  });

  L.DescentView = { controller, drawBlock, drawStone, COLORS, VIEW, book };
})(typeof globalThis !== 'undefined' ? globalThis : this);
