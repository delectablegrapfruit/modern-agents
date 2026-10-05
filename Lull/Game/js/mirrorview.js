// Lull — the Mirror modifier's look (js/mirror.js has its rules) and its place in the Custom window. The copy of the
// piece in play is drawn at 0.8 of the piece's opacity, so the piece you steer reads first (the pair's ghost is drawn
// in full); the line down the middle is still, never animated, and runs through the open well (never across a block):
// on an even width a 1.5 px accent line between the two middle columns at 0.35, on an odd width the centre column (its
// own mirror) tinted at 0.06 with a hairline on each edge. The same line is on the Custom window's preview.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe } = L;
  const Render = L.Render;

  const COPY_ALPHA = 0.8, LINE_ALPHA = 0.35, LINE_W = 1.5, TINT_ALPHA = 0.06, HAIR_ALPHA = 0.3;

  /**
   * The line on a board view, in whatever turn the view is in (Sideways, Upside Down): each boundary is found from the
   * centres of the cells on either side of it, so it follows view.rot. It runs through the open well only: where both
   * cells beside it are filled (the stack, the piece in play) it is left out, so it never cuts across a block.
   */
  function drawLine(ctx, view) {
    const g = view.game, lay = view.lay;
    if (!g || !lay) return;
    const w = g.w, h = g.h, s = lay.s, acc = view.look.theme.accent;
    const own = new Set(g.piece ? g.absCells(g.piece).map(([x, y]) => x + ',' + y) : []);
    const full = (x, y) => g.board.get(x, y) !== 0 || own.has(x + ',' + y);
    const centre = (x, y) => { const [sx, sy] = view.toScreen(x, y); return [sx + s / 2, sy + s / 2]; };
    // The unit step along a column on screen (from row 0 toward the ceiling).
    const a0 = centre(0, 0), a1 = centre(0, 1), ux = a1[0] - a0[0], uy = a1[1] - a0[1], ul = Math.hypot(ux, uy) || 1;
    const dx = (ux / ul) * s / 2, dy = (uy / ul) * s / 2;
    /** The edge between columns a and a + 1, as runs of rows where it shows: [[x0, y0, x1, y1]]. */
    const runs = (a) => {
      const out = [];
      let from = null;
      for (let y = 0; y <= h; y++) {
        const show = y < h && !(full(a, y) && full(a + 1, y));
        if (show && from == null) from = y;
        if (!show && from != null) {
          const p = centre(a, from), q = centre(a + 1, from), r = centre(a, y - 1), t = centre(a + 1, y - 1);
          out.push([(p[0] + q[0]) / 2 - dx, (p[1] + q[1]) / 2 - dy, (r[0] + t[0]) / 2 + dx, (r[1] + t[1]) / 2 + dy]);
          from = null;
        }
      }
      return out;
    };
    const stroke = (list, width, alpha) => {
      if (!list.length) return;
      ctx.strokeStyle = Render.rgba(acc, alpha); ctx.lineWidth = width;
      ctx.beginPath();
      for (const e of list) { ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); }
      ctx.stroke();
    };
    if (w % 2 === 0) { stroke(runs(w / 2 - 1), LINE_W, LINE_ALPHA); return; }
    // Odd: the centre column's open cells tinted, between two hairlines.
    const m = (w - 1) / 2;
    ctx.fillStyle = Render.rgba(acc, TINT_ALPHA);
    for (let y = 0; y < h; y++) if (!full(m, y)) { const [sx, sy] = view.toScreen(m, y); ctx.fillRect(sx, sy, s, s); }
    stroke(runs(m - 1).concat(runs(m)), 1, HAIR_ALPHA);
  }

  /** The line on a board drawn small (Render.previewBoard: the Custom window's preview). */
  function drawPreview(ctx, geom, theme) {
    const { x, y, c, w, h } = geom, dpr = geom.dpr || 1, acc = theme.accent, H = h * c;
    if (w % 2 === 0) {
      const lw = Math.max(1, Math.round(LINE_W * dpr));
      ctx.fillStyle = Render.rgba(acc, LINE_ALPHA + 0.1);
      ctx.fillRect(Math.round(x + (w / 2) * c - lw / 2), y, lw, H);
      return;
    }
    const m = (w - 1) / 2, hw = Math.max(1, Math.round(dpr));
    ctx.fillStyle = Render.rgba(acc, TINT_ALPHA * 2);
    ctx.fillRect(x + m * c, y, c, H);
    ctx.fillStyle = Render.rgba(acc, HAIR_ALPHA + 0.1);
    ctx.fillRect(Math.round(x + m * c) - Math.floor(hw / 2), y, hw, H);
    ctx.fillRect(Math.round(x + (m + 1) * c) - Math.floor(hw / 2), y, hw, H);
  }

  Recipe.viewPart({
    key: 'mirror', order: 20,
    // The copy: the cells past the piece's own (placed puts them after it).
    pieceAlpha: (view, p, cell, copy) => (copy ? COPY_ALPHA : 1),
    overRim(ctx, view) { drawLine(ctx, view); },
    preview(ctx, geom, recipe, theme) { if (L.Mirror && L.Mirror.on(recipe)) drawPreview(ctx, geom, theme); },
  });

  // The Custom window: a switch on the Modifiers tab.
  Recipe.uiPart({ key: 'mirror', order: 20, mod: 'mirror', name: 'Mirror' });

  L.MirrorView = { drawLine, drawPreview, COPY_ALPHA, LINE_ALPHA };
})(typeof globalThis !== 'undefined' ? globalThis : this);
