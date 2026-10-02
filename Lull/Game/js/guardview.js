// Lull — Protect's look and its place in Free Play (the rules are js/guard.js): the sprout, the moles and the meteors
// on the board, what is coming, the clock that runs the guard (its Ready and Paused cards), the New board window's
// level row, Leaves and Time in the status bar, the Wilted card, the library's Wilted tag and the summary's tiles, and
// the Protect line in Stats.
//
//   The sprout   a soil mound, a stem and its leaves (a lost one a faint shape), drawn over its cells. Light: leaf
//                #4f9a5e, soil #a88468; dark: leaf #8fd19e, soil #6d5647.
//   Meteors      a faint column over where one will fall, down to where it would land, deepening as it comes (rose,
//                #eb6f92, when it would reach the sprout), the cells it would break outlined; then a small warm stone
//                falls down the column and breaks them (shards; with reduced motion a short fade). Nothing shakes.
//   Moles        a small round body with a pale nose to the way it goes, stepping from cell to cell (they jump with
//                reduced motion); a bite growing in the block it is eating; a soft earthy tunnel where it has been,
//                fading; a notch at the wall a moment before one comes in; its next two cells as faint dots.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, Guard, CELL, Render, UI } = L;
  const { h } = UI;
  const { ASSET, MOLE } = CELL;
  const ico = UI.icon;

  const ROSE = '#eb6f92';
  const COLORS = {
    light: { leaf: '#4f9a5e', soil: '#a88468', mole: '#6f5a4c', nose: '#f0b3a9', eye: '#1d1712', warn: 'rgba(60,52,44,0.62)', band: 'rgba(60,52,44,', tunnel: 'rgba(120,90,66,', bite: 'rgba(60,44,32,0.55)', meteor: '#b9764a', glow: 'rgba(214,138,82,0.35)', text: '#4f5d52' },
    dark: { leaf: '#8fd19e', soil: '#6d5647', mole: '#b39a86', nose: '#f3c0b6', eye: '#241c16', warn: 'rgba(236,230,222,0.6)', band: 'rgba(236,230,222,', tunnel: 'rgba(176,140,112,', bite: 'rgba(14,10,8,0.6)', meteor: '#e0a072', glow: 'rgba(240,170,110,0.3)', text: '#cfe6d3' },
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
   * a record without its state). o: { grow: { i, k } (a leaf coming back), fade (reduced motion: alpha, not size) }.
   */
  function drawSprout(ctx, x, y, w, hh, leaves, col, o) {
    o = o || {};
    const g = geom(x, y, w, hh), s = g.s;
    ctx.save();
    ctx.fillStyle = col.soil;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.06, g.bottom);
    ctx.quadraticCurveTo(x + w * 0.1, g.bottom - s * 0.5, g.cx, g.bottom - s * 0.5);
    ctx.quadraticCurveTo(x + w * 0.9, g.bottom - s * 0.5, x + w * 0.94, g.bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col.leaf; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, s * 0.12);
    ctx.beginPath(); ctx.moveTo(g.stem[0], g.stem[1]); ctx.quadraticCurveTo(g.cx - s * 0.06, (g.stem[1] + g.stem[3]) / 2, g.stem[2], g.stem[3]); ctx.stroke();
    if (leaves != null) {
      g.leaves.forEach((lf, i) => {
        const growing = o.grow && o.grow.i === i && o.grow.k < 1;
        if (i >= leaves) {
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
  /** A meteor: a small warm stone with a soft glow, centred at (cx, cy); a short streak above it unless still. */
  function drawMeteor(ctx, cx, cy, s, wide, col, still, up) {
    const r = s * (wide ? 0.62 : 0.4);
    ctx.save();
    if (!still) {
      const g = ctx.createLinearGradient(cx, cy, cx, cy + up * s * 1.6);
      g.addColorStop(0, col.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - r * 0.8, cy); ctx.lineTo(cx + r * 0.8, cy); ctx.lineTo(cx, cy + up * s * 1.6); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = col.glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.meteor;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.25, r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---- the board view's part -------------------------------------------------------------------------------------------

  // Each board view's moments in motion (a mole stepping, a leaf coming back): kept by view.
  const STATE = new WeakMap();
  const stateOf = (view) => { let st = STATE.get(view); if (!st) { st = { moles: new Map(), grow: null, until: 0 }; STATE.set(view, st); } return st; };
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
  /** The screen box of cells x0..x1 and rows y0..y1 (any turn of the view). */
  function boxOf(view, x0, y0, x1, y1) {
    const s = view.lay.s, a = view.toScreen(x0, y0), b = view.toScreen(x1, y1);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
    return { x, y, w: Math.max(a[0], b[0]) + s - x, h: Math.max(a[1], b[1]) + s - y };
  }

  const VIEW = {
    key: 'protect', order: 40,
    // On a Protect board, and on a record of one in full view (its sprout's colour, with no state).
    active(game) { return !!Guard.of(game) || (!!game && !game.recipe && sproutCells(game).length > 0); },
    claims(v) { return !!(v & (ASSET | MOLE)) || (v & CELL.COLOR) === CELL.SPROUT; },
    cell(ctx, v, sx, sy, s, kind, view, at) {
      if (kind !== 'stack') return false;
      // The sprout is drawn whole, over its cells (overStack).
      if (v & ASSET || (v & CELL.COLOR) === CELL.SPROUT) return true;
      const col = colorsFor(view.look.theme), st = stateOf(view), t = now();
      const G = Guard.of(view.game), slot = Guard.slotOf(v), m = G && G.moles.find((x) => x.slot === slot);
      const a = st.moles.get(slot);
      let x = sx, y = sy, alpha = 1;
      if (a && at && a.to[0] === at.x && a.to[1] === at.y) {
        const k = kOf(a, t);
        if (a.from) { const f = view.toScreen(a.from[0], a.from[1]), e = ease(k); x = f[0] + (sx - f[0]) * e; y = f[1] + (sy - f[1]) * e; }
        else alpha = k;
      }
      drawMole(ctx, x, y, s, (m && m.face) || 1, col, alpha);
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
      const p = Guard.preview(G, view.game.board), s = view.lay.s, col = colorsFor(view.look.theme), frac = view.guardFrac || 0;
      const still = !!view.reducedMotion, P = Guard.pace(G.level, G.wave);
      const [, up] = view.screenDir ? view.screenDir(0, 1) : [0, -1];
      // The tunnel: where a mole has been, a soft earthy fill, fading over four seconds.
      for (const c of p.trail) {
        const [sx, sy] = view.toScreen(c.x, c.y), a = 0.3 * Math.max(0, 1 - c.age / (4 * Guard.TPS));
        if (a <= 0.01) continue;
        ctx.fillStyle = col.tunnel + a.toFixed(3) + ')';
        const r = s * 0.3;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx + s * 0.12, sy + s * 0.12, s * 0.76, s * 0.76, r); else ctx.rect(sx + s * 0.12, sy + s * 0.12, s * 0.76, s * 0.76);
        ctx.fill();
      }
      // Meteors: the column, the cells it would break, and the stone itself once it falls.
      ctx.lineWidth = Math.max(1, s * 0.08);
      for (const m of p.meteors) {
        const color = m.hit ? ROSE : col.warn, band = m.hit ? 'rgba(235,111,146,' : col.band;
        const ready = m.falling ? 1 : 1 - m.left / Math.max(1, m.warn);
        const bx = boxOf(view, m.x, Math.min(view.game.h - 1, m.top), m.x + m.sw - 1, view.game.h - 1);
        ctx.fillStyle = band + (0.05 + 0.1 * ready).toFixed(3) + ')';
        ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
        ctx.strokeStyle = color;
        ctx.setLineDash([Math.max(2, s * 0.2), Math.max(2, s * 0.14)]);
        for (const [x, y] of m.cells) { const [sx, sy] = view.toScreen(x, y); ctx.strokeRect(sx + ctx.lineWidth, sy + ctx.lineWidth, s - ctx.lineWidth * 2, s - ctx.lineWidth * 2); }
        ctx.setLineDash([]);
        if (m.hit && !m.cells.length) {
          // Straight onto the sprout: a rose bar just above it.
          const [sx, sy] = view.toScreen(m.x, m.cy);
          ctx.fillStyle = ROSE;
          ctx.fillRect(sx + s * 0.15, up < 0 ? sy - s * 0.12 : sy + s * 1.04, s * m.sw - s * 0.3, Math.max(2, s * 0.08));
        }
        if (m.falling) {
          const yc = Math.max(m.top * 100, m.yc - P.fall * frac) / 100;
          const a = view.toScreen(m.x, 0), b = view.toScreen(m.x + m.sw - 1, 0);
          const cx = (Math.min(a[0], b[0]) + Math.max(a[0], b[0]) + s) / 2;
          const y0 = view.toScreen(0, 0)[1] + s / 2;
          drawMeteor(ctx, cx, y0 + up * (yc + 0.5) * s, s, m.sw > 1, col, still, up);
        }
      }
      ctx.setLineDash([]);
      // A bite growing in the block a mole is eating, on the side it eats from.
      for (const d of p.digs) {
        const [sx, sy] = view.toScreen(d.to[0], d.to[1]), [fx, fy] = view.toScreen(d.at[0], d.at[1]);
        const dx = Math.sign(fx - sx), dy = Math.sign(fy - sy), r = s * (0.12 + 0.3 * d.k);
        ctx.fillStyle = col.bite;
        ctx.beginPath(); ctx.arc(sx + s / 2 + dx * s / 2, sy + s / 2 + dy * s / 2, r, 0, Math.PI * 2); ctx.fill();
      }
      for (const a of p.arrivals) {
        // A notch at the wall, on the row it comes in at.
        const [sx, sy] = view.toScreen(a.x, a.y), wallX = a.side ? sx + s : sx, dir = a.side ? -1 : 1;
        ctx.fillStyle = col.warn;
        ctx.beginPath(); ctx.arc(wallX, sy + s / 2, s * 0.26, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.fill();
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
    /** What a tick did, in motion: meteors breaking, moles stepping and coming in, a leaf lost or back, a wave. */
    onTick(view, ev, reduced) {
      const G = Guard.of(view.game);
      if (!G || !ev || !view.lay) return;
      const st = stateOf(view), t = performance.now(), s = view.lay.s, col = colorsFor(view.look.theme), fx = view.fx;
      const until = (ms) => { st.until = Math.max(st.until, t + ms); };
      for (const m of ev.meteors) {
        const cells = m.cells.map(([x, y, v]) => { const [sx, sy] = view.toScreen(x, y); return { x: sx, y: sy, color: Guard.isMole(v) ? col.mole : view.colorOf(v) }; });
        if (cells.length) fx.burst(reduced ? 'fade' : 'shatter', cells, s, reduced);
        if (!reduced) {
          const [sx, sy] = view.toScreen(m.x, m.cy);
          fx.puff(sx + s * m.sw / 2, sy + s / 2, col.meteor, 6, s * 0.4);
        }
      }
      for (const m of ev.moles) {
        if ((m.kind === 'move' || m.kind === 'eat') && !reduced) { st.moles.set(m.slot, { t0: t, dur: 160, from: m.from, to: m.to }); until(180); }
        else if (m.kind === 'nibble' && !reduced) { const [sx, sy] = view.toScreen(m.from[0], m.from[1]); fx.puff(sx + s / 2, sy + s / 2, col.mole, 5, s * 0.35); }
      }
      for (const a of ev.arrive) { st.moles.set(a.slot, { t0: t, dur: reduced ? 1 : 220, from: null, to: a.at }); until(240); }
      // A leaf lost drifts off (fades where it was, with reduced motion); one regrown comes back.
      if (ev.lost) {
        const bx = sproutBox(view, G), gm = geom(bx.x, bx.y, bx.w, bx.h);
        for (let j = 0; j < ev.lost; j++) {
          const i = G.leaves + j, lf = gm.leaves[Math.min(2, i)], dir = i === 0 ? -1 : 1;
          fx.prop(reduced ? 0.5 : 1.3, (ctx, k) => {
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

  // ---- Free Play: the controller (the clock, its cards, the status bar) ------------------------------------------------

  const fmtInt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const BOOK = ['waves', 'meteors', 'hits', 'taps', 'lost', 'moles', 'swept', 'eaten', 'broken'];
  const MS = 1000 / Guard.TPS;

  /** What the Leaves figure's tip says: the wave and the seconds left in it, or the calm and the seconds to the next. */
  function phaseTip(G) {
    const n = Math.ceil(G.left / Guard.TPS), sec = n + ' s';
    return G.phase === 'wave' ? 'Wave ' + G.wave + ' · ' + sec + ' left' : 'Calm · ' + sec + ' to wave ' + (G.wave + 1);
  }

  /** The lifetime stats (Stats ▸ Free Play ▸ Protect): what the board did since last booked, never twice (G.book). */
  function book(store, G) {
    const F = store.state.stats.free, B = (F.guard = F.guard || {});
    let any = false;
    for (const k of BOOK) {
      const d = (G.st[k] || 0) - (G.book[k] || 0);
      if (d <= 0) continue;
      any = true;
      B[k] = (B[k] || 0) + d;
      if (k === 'swept' && G.level !== 'easy') B.sweptHard = (B.sweptHard || 0) + d;
      G.book[k] = G.st[k];
    }
    if (G.tk > (G.book.tk || 0)) { any = true; B.ms = (B.ms || 0) + (G.tk - (G.book.tk || 0)) * MS; G.book.tk = G.tk; }
    const best = B.best || (B.best = { easy: 0, medium: 0, hard: 0 });
    if (G.tk * MS > (best[G.level] || 0)) { any = true; best[G.level] = G.tk * MS; }
    if (any) store.touch();
  }

  function controller(play) {
    const app = play.app;
    const g = () => play.game;
    const G = () => Guard.of(play.game);
    return {
      id: 'protect', waiting: false, acc: 0, shown: -1,

      attach(game) {
        this.acc = 0; this.waiting = false; this.shown = -1;
        if (game.over) return;
        this.wait();
      },
      detach() { this.waiting = false; play.view.guardFrac = 0; },

      /** The clock runs now: Free Play in front, nothing over the board, the page shown, not waiting, not over. */
      running() {
        const gm = g();
        return !!gm && !!G() && app.tab === 'play' && !(L.Collapse && L.Collapse.on) && !UI.modalOpen() && !play.cardOpen && !play.fullView && !document.hidden && !this.waiting && !gm.over;
      },
      counts() { return this.running(); },
      blocked() { return this.waiting; },
      tapStarts() { return this.waiting; },

      /** The card it waits at: Ready before the clock first runs, then Paused (the time and the wave). */
      wait() {
        const x = G();
        if (!x || g().over) return;
        this.waiting = true;
        const first = !x.started;
        play.showCard([
          h('h2', null, first ? 'Protect ' + Guard.NAMES[x.level] : 'Paused'),
          first ? null : h('p', { class: 'cl-sub' }, Guard.clock(x) + ' · ' + (x.wave ? 'Wave ' + x.wave : 'Before wave 1')),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'gd-go', onclick: () => this.go() }, first ? 'Start ' : 'Resume ', h('kbd', null, 'Space'))),
        ], 'gd-wait');
        play.renderStatus();
      },
      /** Starts or resumes the clock. */
      go() {
        const x = G();
        if (!x || g().over) return;
        x.started = true;
        this.waiting = false;
        this.acc = 0;
        play.hideCard();
        play.view.dirty = true;
        play.renderStatus();
      },
      pause(why) {
        // A window over the board only holds it (the clock waits while it is up).
        if (why === 'modal') return;
        if (this.waiting || !G() || g().over || play.cardOpen || play.fullView) return;
        this.wait();
      },
      /** Space or P starts and resumes; P pauses. */
      gate(act, rep) {
        if (!g() || g().over) return undefined;
        if (this.waiting) { if (!rep && (act === 'drop' || act === 'pause')) this.go(); return true; }
        if (act === 'pause') { if (!rep) this.wait(); return true; }
        return undefined;
      },

      frame(now, dt) {
        const gm = g(), x = G();
        if (!gm || !x) return;
        if (!this.running()) return;
        this.acc += Math.min(dt, 0.25) * 1000;
        while (this.acc >= MS && !gm.over) {
          this.acc -= MS;
          const ev = Guard.advance(gm);
          if (!ev) break;
          this.onTick(ev);
        }
        play.view.guardFrac = this.acc / MS;
        play.view.dirty = true;
      },

      /** A tick's events: drawn, heard, booked; the status bar each new second; achievements every 5 seconds. */
      onTick(ev) {
        const x = G(), snd = app.sound;
        if (ev.meteors.length || ev.moles.length || ev.arrive.length || ev.lost || ev.grew || ev.wave) play.view.partsCall('onTick', ev, play.reduced);
        if (ev.lost) snd.play('blocked');
        else if (ev.meteors.length) snd.play('land');
        const sec = Guard.secs(x);
        if (sec !== this.shown || ev.lost || ev.grew || ev.wave || ev.meteors.length || ev.moles.some((m) => m.kind === 'eat')) {
          this.shown = sec;
          play.renderStatus();
        }
        if (x.tk % (5 * Guard.TPS) === 0 || ev.wave) {
          book(app.store, x);
          app.achieve({ mode: 'play', r: { lines: 0 }, g: g() });
        }
      },

      onLock(r) {
        const x = G();
        if (x) book(app.store, x);
        this.base.onLock(r);
      },

      /** Leaves in place of Score, Time after it, and a Pause button. */
      status(parts, o) {
        const x = G();
        if (!x) return o.prev;
        const leaves = h('span', { class: 'stat leaves', 'data-tip-title': 'Leaves', 'data-tip': phaseTip(x) }, h('i', null, 'Leaves '), h('b', null, String(x.leaves)));
        const time = h('span', { class: 'stat gd-time' }, h('i', null, 'Time '), h('b', null, Guard.clock(x)));
        const btn = h('button', { class: 'icon-btn gd-pause', 'aria-label': this.waiting ? 'Resume' : 'Pause', 'data-tip': this.waiting ? 'Resume' : 'Pause', 'data-tip-foot': 'P', disabled: g().over ? true : null,
          html: L.Icons.icon(this.waiting ? 'playIcon' : 'pause'), onclick: () => (this.waiting ? this.go() : this.wait()) });
        const out = [];
        for (const el of o.prev) { if (el === parts.score) out.push(leaves, time); else out.push(el); }
        out.push(btn);
        return out;
      },
      onEnd(kind, silent) {
        this.waiting = false;
        if (kind !== 'wilted') return this.base.onEnd(kind, silent);
        const st = app.store, x = G();
        if (!silent) { const F = st.state.stats.free; F.guard = F.guard || {}; F.guard.wilted = (F.guard.wilted || 0) + 1; if (x) book(st, x); st.touch(); }
        play.showCard(this.cards.wilted(play, kind), 'topout');
        play.fadeEdges(play.overlay.querySelector('.board-sum'));
        play.renderStatus();
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

  const clockOf = (ms) => { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  Recipe.uiPart({
    key: 'protect', order: 40, mode: 'protect', name: 'Protect',
    levels: () => ({ path: 'protect.level', values: Guard.IDS.map((v) => [v, Guard.NAMES[v]]) }),
    // A board that wilted says so on its row (as a full one says Full).
    tags: (r, x, info) => (Guard.on(r) && info && info.ended === 'wilted' ? [{ text: 'Wilted', cls: 'full wilted' }] : []),
    tiles: (ext) => (ext && ext.waves != null ? [[clockOf(ext.ms), 'Time'], [fmtInt(ext.waves), 'Waves'], [fmtInt(ext.lost), 'Leaves lost'], [fmtInt(ext.meteors), 'Meteors']] : []),
    endName: (reason) => (reason === 'wilted' ? 'Wilted' : null),
  });

  UI.statRow('protect', {
    sub: 'free', at: 'end',
    render(app, stats) {
      const P = stats.free && stats.free.guard;
      if (!P || !(P.ms || P.waves || P.meteors || P.wilted)) return null;
      const best = P.best || {};
      const rows = [['Time', clockOf(P.ms)], ['Waves', fmtInt(P.waves)], ['Meteors', fmtInt(P.meteors)], ['Moles', fmtInt(P.moles)], ['Moles swept away', fmtInt(P.swept)], ['Leaves lost', fmtInt(P.lost)], ['Boards wilted', fmtInt(P.wilted)]];
      for (const id of Guard.IDS) if (best[id]) rows.push(['Longest, ' + Guard.NAMES[id], clockOf(best[id])]);
      return [h('h4', null, 'Protect'), h('table', { class: 'st' }, rows.map(([l, v]) => h('tr', null, h('td', null, l), h('td', null, v))))];
    },
  });

  L.GuardView = { controller, drawSprout, drawMole, drawMeteor, geom, phaseTip, book, COLORS, VIEW };
})(typeof globalThis !== 'undefined' ? globalThis : this);
