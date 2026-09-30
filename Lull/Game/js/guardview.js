// Lull — Protect's look and its place in Free Play (the rules are js/guard.js): the sprout, stones and moles on the
// board, the still warnings of what is coming, the New board window's level row, Leaves in the status bar, the Wilted
// card, the library's Wilted tag and the summary's tiles, and the Protect line in Stats.
//
//   The sprout   a soil mound, a stem and its leaves (a lost one a faint shape), drawn over its cells; still (an idle
//                board draws nothing new). Light: leaf #4f9a5e, soil #a88468; dark: leaf #8fd19e, soil #6d5647.
//   Stones       a cell in a warm grey with two faint specks; a short fall when one lands (it fades in with reduced
//                motion), a puff of dust, and a stone that meets the sprout breaks.
//   Moles        a small round body with a pale nose to the way it goes, stepping from cell to cell (they jump with
//                reduced motion); fainter when about to give up.
//   Warnings     drawn still, and worked out again only when the board changes: a stone's dashed outline where it would
//                land now, with a dot for each piece left (rose, #eb6f92, when it would land on the sprout); a notch at
//                the wall where a mole will come in; each mole's next two cells as faint dots.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Guard, CELL, Render, UI } = L;
  const { h } = UI;
  const { FOREIGN, ASSET, MOLE, FILL } = CELL;

  const ROSE = '#eb6f92';
  const COLORS = {
    light: { leaf: '#4f9a5e', soil: '#a88468', stone: '#aaa39b', speck: 'rgba(52,40,30,0.3)', mole: '#6f5a4c', nose: '#f0b3a9', eye: '#1d1712', warn: 'rgba(60,52,44,0.62)', text: '#4f5d52' },
    dark: { leaf: '#8fd19e', soil: '#6d5647', stone: '#7a746e', speck: 'rgba(20,14,10,0.4)', mole: '#b39a86', nose: '#f3c0b6', eye: '#241c16', warn: 'rgba(236,230,222,0.6)', text: '#cfe6d3' },
  };
  const colorsFor = (theme) => (theme && theme.name === 'light' ? COLORS.light : COLORS.dark);
  const now = () => (Render.FREEZE != null ? Infinity : performance.now());

  // The group's icon: a sprout (a line drawing, on the icon set's 16-unit grid).
  L.Icons.I.protect = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M2.75 14.25h10.5M8 14.25V7.5"/><path d="M8 9.6C8 7.4 6.2 5.8 3.4 5.9c0 2.3 1.9 3.8 4.6 3.7zM8 7.5c0-2.4 1.9-4.2 4.8-4.1 0 2.5-2 4.2-4.8 4.1z"/></svg>';

  // ---- drawing -------------------------------------------------------------------------------------------------------

  /** The sprout's parts in a box (its cells: w = sw cells, h = 2 cells): where the soil, the stem and each leaf are. */
  function geom(x, y, w, hh) {
    const s = hh / 2, cx = x + w / 2, bottom = y + hh;
    return {
      s, cx, bottom, x, w,
      stem: [cx, bottom - s * 0.36, cx, y + s * 0.5],
      leaves: [
        { x: cx, y: bottom - s * 0.78, a: -Math.PI * 0.87, len: s * 0.84 },
        { x: cx, y: bottom - s * 1.1, a: -Math.PI * 0.13, len: s * 0.84 },
        { x: cx, y: y + s * 0.5, a: -Math.PI * 0.5, len: s * 0.52 },
      ],
    };
  }
  /** One leaf: an almond from its base along angle a, len long, scaled k (growing). */
  function leafPath(ctx, lf, k) {
    const len = lf.len * (k == null ? 1 : k), ca = Math.cos(lf.a), sa = Math.sin(lf.a);
    const tx = lf.x + ca * len, ty = lf.y + sa * len, mx = lf.x + ca * len * 0.5, my = lf.y + sa * len * 0.5, wd = len * 0.4;
    ctx.beginPath();
    ctx.moveTo(lf.x, lf.y);
    ctx.quadraticCurveTo(mx - sa * wd, my + ca * wd, tx, ty);
    ctx.quadraticCurveTo(mx + sa * wd, my - ca * wd, lf.x, lf.y);
    ctx.closePath();
  }
  /**
   * The sprout in its box: soil, stem, and its leaves (leaves < 3: the missing ones as faint shapes; null: none shown,
   * a record without its state). o: { grow: { i, k } (a leaf coming back), fade (reduced motion: alpha, not size), gone:
   * [i] (leaves drifting away: not drawn here) }.
   */
  function drawSprout(ctx, x, y, w, hh, leaves, col, o) {
    o = o || {};
    const g = geom(x, y, w, hh), s = g.s;
    ctx.save();
    // The soil: a low mound across the bottom of the box.
    ctx.fillStyle = col.soil;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.06, g.bottom);
    ctx.quadraticCurveTo(x + w * 0.1, g.bottom - s * 0.5, g.cx, g.bottom - s * 0.5);
    ctx.quadraticCurveTo(x + w * 0.9, g.bottom - s * 0.5, x + w * 0.94, g.bottom);
    ctx.closePath();
    ctx.fill();
    // The stem.
    ctx.strokeStyle = col.leaf; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, s * 0.12);
    ctx.beginPath(); ctx.moveTo(g.stem[0], g.stem[1]); ctx.quadraticCurveTo(g.cx - s * 0.06, (g.stem[1] + g.stem[3]) / 2, g.stem[2], g.stem[3]); ctx.stroke();
    if (leaves != null) {
      g.leaves.forEach((lf, i) => {
        if (o.gone && o.gone.includes(i)) return;
        const growing = o.grow && o.grow.i === i && o.grow.k < 1;
        if (i >= leaves) {
          // A lost leaf: its outline, faintly, where it was.
          ctx.globalAlpha = 0.45; ctx.strokeStyle = col.leaf; ctx.lineWidth = Math.max(1, s * 0.05); leafPath(ctx, lf); ctx.stroke(); ctx.globalAlpha = 1;
          return;
        }
        ctx.fillStyle = col.leaf;
        if (growing && o.fade) { ctx.globalAlpha = 0.16 + 0.84 * o.grow.k; leafPath(ctx, lf); ctx.fill(); ctx.globalAlpha = 1; }
        else { leafPath(ctx, lf, growing ? Math.max(0.05, o.grow.k) : 1); ctx.fill(); }
      });
    }
    ctx.restore();
    return g;
  }
  function drawStone(ctx, look, x, y, s, col, alpha) {
    Render.drawCell(ctx, look.skin, col.stone, x, y, s, alpha);
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.fillStyle = col.speck;
    const r = Math.max(0.8, s * 0.065);
    ctx.beginPath(); ctx.arc(x + s * 0.32, y + s * 0.36, r, 0, Math.PI * 2); ctx.arc(x + s * 0.66, y + s * 0.64, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawMole(ctx, x, y, s, face, col, alpha) {
    const cx = x + s / 2, cy = y + s * 0.54, r = s * 0.36;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = col.mole;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.08, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.nose;
    ctx.beginPath(); ctx.arc(cx + face * r * 0.98, cy - r * 0.08, Math.max(1, s * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.eye;
    ctx.beginPath(); ctx.arc(cx + face * r * 0.42, cy - r * 0.38, Math.max(0.7, s * 0.045), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- the board view's part -------------------------------------------------------------------------------------------

  // Each board view's moments in motion (a stone falling, a mole stepping, a leaf coming back): kept by view.
  const STATE = new WeakMap();
  const stateOf = (view) => { let st = STATE.get(view); if (!st) { st = { stones: new Map(), moles: new Map(), grow: null, until: 0, warn: null }; STATE.set(view, st); } return st; };
  const ease = (k) => 1 - (1 - k) * (1 - k);
  const kOf = (a, t) => Math.max(0, Math.min(1, (t - a.t0) / a.dur));

  /** The sprout's box on screen (its cells' top-left corner, its size), from any turn of the view. */
  function sproutBox(view, G) {
    const s = view.lay.s, a = view.toScreen(G.ax, 0), b = view.toScreen(G.ax + G.sw - 1, Guard.BED - 1);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    return { x, y, w: Math.max(a[0], b[0]) + s - x, h: Math.max(a[1], b[1]) + s - y };
  }
  /** Where a record without its state (a retired board in full view) has its sprout: its colour-31 cells. */
  function sproutCells(game) {
    const out = [];
    for (let y = 0; y < Math.min(Guard.BED, game.h); y++) for (let x = 0; x < game.w; x++) if ((game.board.get(x, y) & CELL.COLOR) === CELL.SPROUT) out.push([x, y]);
    return out;
  }

  /** The warnings, worked out again only when the board (or the guard) has changed since. */
  function warnings(view, G) {
    const st = stateOf(view), b = view.game.board;
    let hsh = 0x811c9dc5 ^ G.seq ^ (G.plan.length << 20);
    for (let i = 0; i < b.cells.length; i++) hsh = Math.imul(hsh ^ b.cells[i], 16777619);
    if (!st.warn || st.warn.key !== hsh) st.warn = { key: hsh, p: Guard.preview(G, b) };
    return st.warn.p;
  }

  const VIEW = {
    key: 'protect', order: 40,
    // On a Protect board, and on a record of one in full view (its sprout's colour, with no state).
    active(game) { return !!Guard.of(game) || (!!game && !game.recipe && sproutCells(game).length > 0); },
    claims(v) { return !!(v & (ASSET | MOLE)) || ((v & FOREIGN) && !(v & FILL)) || (v & CELL.COLOR) === CELL.SPROUT; },
    cell(ctx, v, sx, sy, s, kind, view, at) {
      if (kind !== 'stack') return false;
      // The sprout is drawn whole, over its cells (overStack).
      if (v & ASSET || (v & CELL.COLOR) === CELL.SPROUT) return true;
      const col = colorsFor(view.look.theme), st = stateOf(view), t = now();
      if (v & MOLE) {
        const G = Guard.of(view.game), slot = Guard.slotOf(v), m = G && G.moles.find((x) => x.slot === slot);
        const a = st.moles.get(slot);
        let x = sx, y = sy, alpha = m && m.patience <= 3 ? 0.6 : 1;
        if (a && at && a.to[0] === at.x && a.to[1] === at.y) {
          const k = kOf(a, t);
          if (a.from) { const f = view.toScreen(a.from[0], a.from[1]), e = ease(k); x = f[0] + (sx - f[0]) * e; y = f[1] + (sy - f[1]) * e; }
          else alpha *= k;
        }
        drawMole(ctx, x, y, s, (m && m.face) || 1, col, alpha);
        return true;
      }
      // A stone (or a mole curled up into one); falling or fading in when it has just landed.
      const a = at && st.stones.get(at.x + ',' + at.y);
      if (a) {
        const k = kOf(a, t);
        if (a.fade) { drawStone(ctx, view.look, sx, sy, s, col, k); return true; }
        const [, top] = view.screenDir ? view.screenDir(0, 1) : [0, -1];
        drawStone(ctx, view.look, sx, sy + top * (1 - k * k) * a.fall * s, s, col);
        return true;
      }
      drawStone(ctx, view.look, sx, sy, s, col);
      return true;
    },
    overStack(ctx, view) {
      const G = Guard.of(view.game), col = colorsFor(view.look.theme);
      if (!G) {
        // A record in full view: its sprout, with no leaves (what it had is not kept there).
        const cells = sproutCells(view.game);
        if (!cells.length) return;
        const s = view.lay.s, pts = cells.map(([x, y]) => view.toScreen(x, y));
        const x0 = Math.min(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1]));
        drawSprout(ctx, x0, y0, Math.max(...pts.map((p) => p[0])) + s - x0, Math.max(...pts.map((p) => p[1])) + s - y0, null, col);
        return;
      }
      const st = stateOf(view), bx = sproutBox(view, G), t = now();
      const o = { fade: !!view.reducedMotion };
      if (st.grow) { const k = kOf(st.grow, t); if (k < 1) o.grow = { i: st.grow.i, k }; else st.grow = null; }
      drawSprout(ctx, bx.x, bx.y, bx.w, bx.h, G.leaves, col, o);
    },
    overPiece(ctx, view) {
      const G = Guard.of(view.game);
      if (!G || view.game.over) return;
      const p = warnings(view, G), s = view.lay.s, col = colorsFor(view.look.theme);
      const dotR = Math.max(1.5, s * 0.09);
      const dots = (cx, cy, n, color, dx, dy) => { ctx.fillStyle = color; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(cx + dx * (i - (n - 1) / 2), cy + dy * (i - (n - 1) / 2), dotR, 0, Math.PI * 2); ctx.fill(); } };
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.setLineDash([Math.max(2, s * 0.2), Math.max(2, s * 0.14)]);
      for (const w of p.stones) {
        const color = w.hit ? ROSE : col.warn;
        ctx.strokeStyle = color;
        // Where it would land (one that would meet the sprout: just above it, where it would break).
        let top = null;
        for (const [x, y] of w.cells) {
          const [sx, sy] = view.toScreen(x, y);
          ctx.strokeRect(sx + ctx.lineWidth, sy + ctx.lineWidth, s - ctx.lineWidth * 2, s - ctx.lineWidth * 2);
          if (!top || sy < top[1]) top = [sx, sy];
        }
        if (!top) continue;
        // A dot for each piece left, over the outline (inside it at the top of the well).
        const [lx] = view.toScreen(w.x, 0), [rx] = view.toScreen(w.x + w.sw - 1, 0);
        const cy = top[1] - s * 0.5 >= view.lay.board.y ? top[1] - s * 0.45 : top[1] + s * 0.5;
        dots((Math.min(lx, rx) + Math.max(lx, rx) + s) / 2, cy, w.left, color, dotR * 3, 0);
      }
      ctx.setLineDash([]);
      for (const a of p.arrivals) {
        // A notch at the wall, on the row it comes in at, and a dot for each piece left.
        const [sx, sy] = view.toScreen(a.x, a.y), wallX = a.side ? sx + s : sx, dir = a.side ? -1 : 1;
        ctx.fillStyle = col.warn;
        ctx.beginPath(); ctx.arc(wallX, sy + s / 2, s * 0.26, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.fill();
        for (let i = 0; i < a.left; i++) { ctx.beginPath(); ctx.arc(wallX + dir * (s * 0.46 + i * dotR * 2.8), sy + s / 2, dotR * 0.85, 0, Math.PI * 2); ctx.fill(); }
      }
      for (const m of p.paths) {
        m.cells.forEach(([x, y], i) => {
          const [sx, sy] = view.toScreen(x, y);
          ctx.globalAlpha = i ? 0.45 : 0.8;
          ctx.fillStyle = col.warn;
          ctx.beginPath(); ctx.arc(sx + s / 2, sy + s / 2, Math.max(1.5, s * 0.11), 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    },
    busy(view, t) { const st = STATE.get(view); return !!st && Render.FREEZE == null && t < st.until; },
    onLock(view, r, reduced) {
      const G = Guard.of(view.game), ev = r && r.guard;
      if (!G || !ev || !view.lay) return;
      const st = stateOf(view), t = performance.now(), s = view.lay.s, col = colorsFor(view.look.theme), fx = view.fx;
      const until = (ms) => { st.until = Math.max(st.until, t + ms); };
      for (const w of ev.stones) {
        if (w.hit) {
          // It breaks on the sprout.
          const cells = w.tops.map((hh, i) => { const [sx, sy] = view.toScreen(w.x + i, Math.min(view.game.h - 1, hh)); return { x: sx, y: sy, color: col.stone }; });
          fx.burst('shatter', cells, s, reduced);
          continue;
        }
        const dur = reduced ? 320 : 240;
        for (const [x, y] of w.cells) st.stones.set(x + ',' + y, { t0: t, dur, fall: 2.2, fade: !!reduced });
        until(dur + 30);
        if (!reduced) {
          fx.prop(dur / 1000 + 0.02, () => {}, { update: (k) => {
            if (k < 1 || w.dusted) return;
            w.dusted = true;
            const low = new Map();
            for (const [x, y] of w.cells) low.set(x, Math.min(low.has(x) ? low.get(x) : Infinity, y));
            for (const [x, y] of low) { const [sx, sy] = view.toScreen(x, y); fx.dust(sx, sy + s, s, view.look.theme.muted); }
          } });
        }
      }
      for (const m of ev.moles) {
        if (m.kind === 'move' && !reduced) { st.moles.set(m.slot, { t0: t, dur: 180, from: m.from, to: m.to }); until(200); }
        else if (m.kind === 'nibble' && !reduced) { const [sx, sy] = view.toScreen(m.from[0], m.from[1]); fx.puff(sx + s / 2, sy + s / 2, col.mole, 5, s * 0.35); }
      }
      for (const a of ev.arrive) { st.moles.set(a.slot, { t0: t, dur: reduced ? 1 : 220, from: null, to: a.at }); until(240); }
      // A leaf lost drifts off (fades where it was, with reduced motion); one regrown comes back.
      if (ev.lost) {
        const bx = sproutBox(view, G), gm = geom(bx.x, bx.y, bx.w, bx.h);
        for (let j = 0; j < ev.lost; j++) {
          const i = G.leaves + j, lf = gm.leaves[Math.min(2, i)], dir = i === 0 ? -1 : 1;
          fx.prop(reduced ? 0.6 : 1.3, (ctx, k) => {
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = col.leaf;
            const off = reduced ? { x: lf.x, y: lf.y, a: lf.a } : { x: lf.x + dir * k * s * 1.4, y: lf.y + k * s * 0.9 - Math.sin(k * Math.PI) * s * 0.5, a: lf.a + dir * k * 2.2 };
            leafPath(ctx, Object.assign({}, lf, off));
            ctx.fill();
          });
        }
      }
      if (ev.grew) { st.grow = { i: G.leaves - 1, t0: t, dur: 300 }; until(320); }
      if (ev.wave) {
        const b = view.lay.board, text = ev.wave.start ? 'Wave ' + ev.wave.start : 'Calm', light = view.look.theme.name === 'light';
        if (!reduced) fx.text(text, b.x + b.w / 2, b.y + b.h * 0.3, col.text, 15);
        else {
          fx.prop(1.3, (ctx, k) => {
            ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
            ctx.font = '700 15px ' + Render.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : 'rgba(8,11,18,0.55)';
            ctx.strokeText(text, b.x + b.w / 2, b.y + b.h * 0.3); ctx.fillStyle = col.text; ctx.fillText(text, b.x + b.w / 2, b.y + b.h * 0.3);
          });
        }
      }
      view.dirty = true;
    },
    /** The New board preview and the library's thumbnails: the sprout on the floor, in the middle. */
    preview(ctx, gm, recipe, theme) {
      if (!Guard.on(recipe) || gm.w < 6) return;
      const { ax, sw } = Guard.sproutOf(gm.w), col = colorsFor(theme), c = gm.c;
      const x = gm.x + ax * c, y = gm.y + (gm.h - Guard.BED) * c;
      if (gm.style === 'thumb') {
        const gap = c >= 5 ? 1 : 0;
        ctx.fillStyle = col.leaf;
        for (let yy = 0; yy < Guard.BED; yy++) for (let xx = 0; xx < sw; xx++) ctx.fillRect(x + xx * c, y + yy * c, c - gap, c - gap);
        return;
      }
      drawSprout(ctx, x, y, sw * c, Guard.BED * c, Guard.LEAVES, col);
    },
  };
  Recipe.viewPart(VIEW);

  // ---- Free Play: the controller ---------------------------------------------------------------------------------------

  const fmtInt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const BOOK = ['waves', 'stones', 'hits', 'taps', 'lost', 'boxed', 'swept'];

  /** What the Leaves figure's tip says: the wave and the pieces left in it, or the calm and the pieces to the next. */
  function phaseTip(G) {
    const n = G.left, p = n === 1 ? ' piece' : ' pieces';
    return G.phase === 'wave' ? 'Wave ' + G.wave + ' · ' + n + p + ' left' : 'Calm · ' + n + p + ' to wave ' + (G.wave + 1);
  }

  /** The lifetime stats (Stats ▸ Free Play ▸ Protect): what the board did since last booked, never twice (G.book). */
  function book(store, G) {
    const F = store.state.stats.free, B = (F.guard = F.guard || {});
    for (const k of BOOK) {
      const d = (G.st[k] || 0) - (G.book[k] || 0);
      if (d <= 0) continue;
      B[k] = (B[k] || 0) + d;
      if (k === 'boxed' && G.level !== 'easy') B.boxedHard = (B.boxedHard || 0) + d;
      G.book[k] = G.st[k];
    }
  }

  function controller(play) {
    const G = () => Guard.of(play.game);
    return {
      id: 'protect',
      // Leaves in place of Score (Score stays in the summary and on the library's rows).
      status(parts, o) {
        const g = G();
        if (!g) return o.prev;
        const el = h('span', { class: 'stat leaves', 'data-tip-title': 'Leaves', 'data-tip': phaseTip(g) }, h('i', null, 'Leaves '), h('b', null, String(g.leaves)));
        return o.prev.map((x) => (x === parts.score ? el : x));
      },
      onLock(r) {
        const g = G(), ev = r && r.guard;
        if (g && ev) book(play.app.store, g);
        this.base.onLock(r);
        if (!ev) return;
        const snd = play.app.sound;
        if (ev.lost) setTimeout(() => snd.play('blocked'), 90);
        else if (ev.stones.some((w) => !w.hit)) setTimeout(() => snd.play('land'), 140);
      },
      onEnd(kind, silent) {
        if (kind !== 'wilted') return this.base.onEnd(kind, silent);
        const st = play.app.store;
        if (!silent) { const F = st.state.stats.free; F.guard = F.guard || {}; F.guard.wilted = (F.guard.wilted || 0) + 1; st.touch(); }
        play.showCard(this.cards.wilted(play, kind), 'topout');
        play.fadeEdges(play.overlay.querySelector('.board-sum'));
      },
      cards: {
        // The Board full card, as Wilted: the same summary and buttons (Undo brings the leaf back with the rest).
        wilted(pm) {
          const els = pm.fullCard();
          els[0] = h('h2', null, 'Wilted');
          const row = els[els.length - 1], old = row && row.querySelector && row.querySelector('.btn.primary');
          if (old) old.replaceWith(h('button', { class: old.className, onclick: () => pm.newBoard('wilted') }, Array.from(old.childNodes).map((n) => n.cloneNode(true))));
          return els;
        },
      },
    };
  }

  // ---- the New board window, the library, Stats ---------------------------------------------------------------------------

  Recipe.uiPart({
    key: 'protect', order: 40, mode: 'protect', name: 'Protect',
    levels: () => ({ path: 'protect.level', values: Guard.IDS.map((v) => [v, Guard.NAMES[v]]) }),
    // A board that wilted says so on its row (as a full one says Full).
    tags: (r, x, info) => (Guard.on(r) && info && info.ended === 'wilted' ? [{ text: 'Wilted', cls: 'full wilted' }] : []),
    tiles: (ext) => (ext && ext.waves != null ? [[fmtInt(ext.waves), 'Waves'], [fmtInt(ext.lost), 'Leaves lost'], [fmtInt(ext.stones), 'Stones'], [fmtInt(ext.boxed), 'Moles boxed in']] : []),
    endName: (reason) => (reason === 'wilted' ? 'Wilted' : null),
  });

  UI.statRow('protect', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const P = stats.free && stats.free.guard;
      if (!P || !(P.waves || P.stones || P.wilted || P.boxed)) return null;
      const rows = [['Waves', P.waves], ['Stones', P.stones], ['Leaves lost', P.lost], ['Moles boxed in', P.boxed], ['Moles swept away', P.swept], ['Boards wilted', P.wilted]];
      return [h('h4', null, 'Protect'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, fmtInt(v)))))];
    },
  });

  L.GuardView = { controller, drawSprout, drawStone, drawMole, geom, phaseTip, book, COLORS, VIEW };
})(typeof globalThis !== 'undefined' ? globalThis : this);
