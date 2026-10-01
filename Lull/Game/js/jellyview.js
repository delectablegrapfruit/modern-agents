// Lull — Jelly's look and window (js/jelly.js has its rules). On a Jelly board every block is drawn as soft jelly: the
// settled pieces are bodies (js/jelly.js), each drawn as one rounded blob following its shape wherever the physics put
// it (tilted, toppled), the piece in play, its ghost and the trays as lumps on the grid. A lock is played back from its
// record: the piece set down (a hard drop bouncing) and what it struck jostling, bands clearing the moment they fill
// (whole minos going, with the look's own effect) and what they held coming down at once. Over the rigid bodies, a
// render-only skin: each body squashes as it lands (and so does what it lands on), shears when knocked, ripples across
// its minos, stretches while it falls fast, and bulges at its foot under the weight stacked on it (springs of 5 and 9
// Hz, lightly damped: a few jiggles, still within a second). Reduced motion: a quarter of the jiggle, no ripple or
// stretch, the playback three times as fast; the outcome is the same. Also the New board window's switch, the Cascades
// tile and the Stats rows.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Recipe, Render } = L;
  if (!Recipe || !Render) return;
  const { shade, rgba } = Render;

  // Screen sides of a cell, as bits: right, up, left, down.
  const S_R = 1, S_U = 2, S_L = 4, S_D = 8;
  const sideBit = (d) => (d[0] > 0 ? S_R : d[0] < 0 ? S_L : d[1] < 0 ? S_U : S_D);

  // ---- the lump sprites (the piece, its ghost, the trays) ----------------------------------------------------------------

  /** A path round a box whose corners each have their own radius. */
  function shape(ctx, x0, y0, x1, y1, tl, tr, br, bl) {
    const m = Math.min((x1 - x0) / 2, (y1 - y0) / 2);
    tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m);
    ctx.beginPath();
    ctx.moveTo(x0 + tl, y0);
    ctx.lineTo(x1 - tr, y0);
    if (tr) ctx.arcTo(x1, y0, x1, y0 + tr, tr); else ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1 - br);
    if (br) ctx.arcTo(x1, y1, x1 - br, y1, br); else ctx.lineTo(x1, y1);
    ctx.lineTo(x0 + bl, y1);
    if (bl) ctx.arcTo(x0, y1, x0, y1 - bl, bl); else ctx.lineTo(x0, y1);
    ctx.lineTo(x0, y0 + tl);
    if (tl) ctx.arcTo(x0, y0, x0 + tl, y0, tl); else ctx.lineTo(x0, y0);
    ctx.closePath();
  }

  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  const sprites = new Map();
  /**
   * One cell of a lump, P device pixels, drawn on a canvas one pixel larger on every side (its joined sides reach past
   * the cell's edge, so neighbours overlap and no seam shows). mask: its joined screen sides. kind: 'body', or the
   * ghost's style ('outline', 'soft', 'dotted', 'glow').
   */
  function lumpSprite(color, mask, P, light, kind) {
    P = Math.max(4, Math.round(P));
    const key = color + '|' + mask + '|' + P + '|' + (light ? 1 : 0) + '|' + kind;
    let c = sprites.get(key);
    if (c) return c;
    if (sprites.size > 3000) sprites.clear();
    c = makeCanvas(P + 2, P + 2);
    const ctx = c.getContext('2d');
    ctx.translate(1, 1);
    const R = mask & S_R, U = mask & S_U, Lf = mask & S_L, D = mask & S_D;
    const g = Math.max(1, P * 0.05), r = P * 0.34, out = kind === 'body' ? 1 : 4;
    const x0 = Lf ? -out : g, x1 = R ? P + out : P - g, y0 = U ? -out : g, y1 = D ? P + out : P - g;
    const tl = !U && !Lf ? r : 0, tr = !U && !R ? r : 0, br = !D && !R ? r : 0, bl = !D && !Lf ? r : 0;
    if (kind === 'body') {
      const e = Math.max(1, Math.round(P * 0.04));
      shape(ctx, x0, y0, x1, y1, tl, tr, br, bl);
      ctx.fillStyle = rgba(shade(color, light ? -0.3 : -0.42), 0.95);
      ctx.fill();
      const ix0 = Lf ? x0 : x0 + e, ix1 = R ? x1 : x1 - e, iy0 = U ? y0 : y0 + e, iy1 = D ? y1 : y1 - e;
      shape(ctx, ix0, iy0, ix1, iy1, Math.max(0, tl - e), Math.max(0, tr - e), Math.max(0, br - e), Math.max(0, bl - e));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.save(); ctx.clip();
      if (!U) {
        const t = ctx.createLinearGradient(0, iy0, 0, iy0 + P * 0.32);
        t.addColorStop(0, 'rgba(255,255,255,' + (light ? 0.34 : 0.26) + ')'); t.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = t; ctx.fillRect(-2, iy0, P + 4, P * 0.32);
      }
      if (!D) {
        const gl = ctx.createLinearGradient(0, iy1 - P * 0.3, 0, iy1);
        gl.addColorStop(0, rgba(shade(color, 0.5), 0)); gl.addColorStop(1, rgba(shade(color, 0.5), light ? 0.2 : 0.28));
        ctx.fillStyle = gl; ctx.fillRect(-2, iy1 - P * 0.3, P + 4, P * 0.3);
      }
      ctx.restore();
      if (!U && !Lf) {
        ctx.fillStyle = 'rgba(255,255,255,' + (light ? 0.6 : 0.5) + ')';
        shape(ctx, P * 0.2, P * 0.15, P * 0.56, P * 0.27, P * 0.06, P * 0.06, P * 0.06, P * 0.06);
        ctx.fill();
      }
    } else {
      const lw = Math.max(1, P * 0.07);
      if (kind === 'soft') { shape(ctx, x0, y0, x1, y1, tl, tr, br, bl); ctx.fillStyle = rgba(color, 0.24); ctx.fill(); }
      else {
        const h = lw / 2, ax0 = Lf ? x0 : x0 + h, ax1 = R ? x1 : x1 - h, ay0 = U ? y0 : y0 + h, ay1 = D ? y1 : y1 - h;
        shape(ctx, ax0, ay0, ax1, ay1, Math.max(0, tl - h), Math.max(0, tr - h), Math.max(0, br - h), Math.max(0, bl - h));
        if (kind === 'dotted') { ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, P * 0.08); ctx.setLineDash([0.01, ctx.lineWidth * 2.4]); ctx.strokeStyle = rgba(color, 0.85); ctx.stroke(); }
        else if (kind === 'glow') { ctx.shadowColor = color; ctx.shadowBlur = P * 0.3; ctx.lineWidth = Math.max(1.25, P * 0.06); ctx.strokeStyle = rgba(color, 0.95); ctx.stroke(); }
        else { ctx.fillStyle = rgba(color, 0.05); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = rgba(color, 0.62); ctx.stroke(); }
      }
    }
    sprites.set(key, c);
    return c;
  }
  /** The joined sides of one cell of a shape (every 4-adjacent pair of its cells is joined); dir maps to screen. */
  function maskOfShape(cells, x, y, dir) {
    let m = 0;
    for (const [cx, cy] of cells) {
      const dx = cx - x, dy = cy - y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      m |= sideBit(dir(dx, dy));
    }
    return m;
  }
  function blit(ctx, img, x, y, s, P, exact) {
    // See-through (a later Next slot, Mirror's copy, a ghost): exactly the cell, so neighbours never overlap and
    // double up; opaque: a pixel past it on every side, so they meet with no seam.
    if (exact || ctx.globalAlpha < 1) { ctx.drawImage(img, 1, 1, img.width - 2, img.height - 2, x, y, s, s); return; }
    const m = s / P;
    ctx.drawImage(img, x - m, y - m, s + 2 * m, s + 2 * m);
  }
  const lightOf = (ctx) => !!ctx.__light;
  const dprOf = (ctx) => ctx.__dpr || 1;

  // ---- a body's outline --------------------------------------------------------------------------------------------------

  const outlines = new Map();
  /**
   * The outline of a body's shape at rest (its cells: x0 y0 x1 y1 …), in cells about its centre of mass, inset by g
   * (a hair of gap between bodies): [[x, y, x, y, …] a loop, counter-clockwise; holes clockwise]. Minos joined only at
   * a corner are loops of their own.
   */
  function outlineOf(cells, g) {
    const key = cells.join(',') + '|' + g;
    let o = outlines.get(key);
    if (o) return o;
    if (outlines.size > 2000) outlines.clear();
    const m = cells.length / 2, has = new Set();
    let cx = 0, cy = 0;
    for (let k = 0; k < m; k++) { has.add(cells[2 * k] * 4096 + cells[2 * k + 1]); cx += cells[2 * k] + 0.5; cy += cells[2 * k + 1] + 0.5; }
    cx /= m; cy /= m;
    const at = (x, y) => has.has(x * 4096 + y);
    // Directed boundary edges, counter-clockwise round each cell (inside on the left): from → to.
    const edges = new Map();
    const add = (x0, y0, x1, y1) => { const k = x0 + ',' + y0; if (!edges.has(k)) edges.set(k, []); edges.get(k).push([x1, y1]); };
    for (let k = 0; k < m; k++) {
      const x = cells[2 * k], y = cells[2 * k + 1];
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
    const loops = [];
    for (;;) {
      let start = null;
      for (const [k, l] of edges) if (l.length) { start = k; break; }
      if (!start) break;
      const pts = [];
      let [x, y] = start.split(',').map(Number), dx = 0, dy = 0;
      for (let guard = 0; guard < 4 * m + 8; guard++) {
        const l = edges.get(x + ',' + y);
        if (!l || !l.length) break;
        // At a corner two loops share, turn left (keep to one mino's side).
        let i = 0;
        if (l.length > 1) i = l.findIndex(([nx, ny]) => (dx * (ny - y) - dy * (nx - x)) > 0);
        if (i < 0) i = 0;
        const [nx, ny] = l.splice(i, 1)[0];
        const ndx = nx - x, ndy = ny - y;
        if (ndx !== dx || ndy !== dy) pts.push(x, y);
        dx = ndx; dy = ndy; x = nx; y = ny;
      }
      // Inset: each corner moves by g along both edges' inward normals (the left of each).
      const n = pts.length / 2, out = [];
      for (let i = 0; i < n; i++) {
        const px = pts[2 * ((i + n - 1) % n)], py = pts[2 * ((i + n - 1) % n) + 1], x0 = pts[2 * i], y0 = pts[2 * i + 1], qx = pts[2 * ((i + 1) % n)], qy = pts[2 * ((i + 1) % n) + 1];
        const ax = Math.sign(x0 - px), ay = Math.sign(y0 - py), bx = Math.sign(qx - x0), by = Math.sign(qy - y0);
        out.push(x0 - cx + g * (-ay - by), y0 - cy + g * (ax + bx));
      }
      if (out.length >= 6) loops.push(out);
    }
    o = { loops, cx, cy };
    outlines.set(key, o);
    return o;
  }

  // ---- a view's state ---------------------------------------------------------------------------------------------

  // The skin's springs: a squash and a shear of about 5 Hz, lightly damped (it jiggles: a few swings, still within a
  // second), and a ripple of about 9 Hz (each mino of it lagging the next: the wobble across a body). Still under 0.003.
  const OMEGA = 2 * Math.PI * 5, ZETA = 0.16, K = OMEGA * OMEGA, C = 2 * ZETA * OMEGA, REST = 0.003;
  const OMEGA2 = 2 * Math.PI * 9, K2 = OMEGA2 * OMEGA2, C2 = 2 * 0.14 * OMEGA2;
  // Reduced motion: every kick this much (less jiggle; the same outcome).
  const QUIET = 0.25;

  /** The Jelly state kept on a board view: the piece's spring, the lock being played back, each body's skin. */
  function stateOf(view) {
    let J = view.jelly;
    if (!J || J.game !== view.game) J = view.jelly = { game: view.game, piece: null, replay: null, last: 0, skins: new Map(), load: null };
    return J;
  }
  const quiet = (view) => !!view.reducedMotion;
  const worldOf = (view) => (L.Jelly && view.game ? L.Jelly.of(view.game) : null);

  function springStep(sp, h) {
    sp.va += (-K * sp.a - C * sp.va) * h; sp.a += sp.va * h;
    sp.vb += (-K * sp.b - C * sp.vb) * h; sp.b += sp.vb * h;
    sp.vc += (-K2 * sp.c - C2 * sp.vc) * h; sp.c += sp.vc * h;
  }
  const atRest = (sp) => Math.abs(sp.a) < REST && Math.abs(sp.b) < REST && Math.abs(sp.c) < REST && Math.abs(sp.va) < 0.05 && Math.abs(sp.vb) < 0.05 && Math.abs(sp.vc) < 0.08;
  /** Steps the springs (the piece's, the bodies' skins) to now; drops those at rest. */
  function stepSprings(J, now) {
    const dt = J.last ? Math.min(0.05, Math.max(0, (now - J.last) / 1000)) : 0;
    J.last = now;
    if (!dt) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      if (J.piece) springStep(J.piece, h);
      for (const sp of J.skins.values()) springStep(sp, h);
    }
    for (const [id, sp] of J.skins) if (atRest(sp)) J.skins.delete(id);
    if (J.piece && atRest(J.piece)) J.piece = null;
  }
  const spring = () => ({ a: 0, va: 0, b: 0, vb: 0, c: 0, vc: 0 });
  function pieceKick(view, da, db) {
    const J = stateOf(view), q = quiet(view) ? QUIET : 1;
    if (!J.piece) J.piece = spring();
    J.piece.a = Math.max(-0.25, Math.min(0.25, J.piece.a + da * q));
    J.piece.b = Math.max(-0.25, Math.min(0.25, J.piece.b + db * q));
  }
  /**
   * A body's skin kicked (speeds): a squashes it (a landing, a weight put on it), b shears it (a knock sideways), c
   * sets it rippling. At most 120 at once.
   */
  function skinKick(J, id, da, db, dc, q) {
    let sp = J.skins.get(id);
    if (!sp) { if (J.skins.size >= 120) return; sp = spring(); J.skins.set(id, sp); }
    q = q || 1;
    sp.va += da * q; sp.vb += db * q; sp.vc += (dc || 0) * q * (q < 1 ? 0 : 1);
  }

  /**
   * Draws with a spring's squash and shear about the lump's floor side (where gravity points on screen). box: the
   * lump's cells on screen, { x0, y0, x1, y1 }.
   */
  function withSpring(ctx, view, sp, box, draw) {
    const d = view.screenDir(0, -1);
    const a = sp.a, b = sp.b;
    ctx.save();
    if (d[1] !== 0) {
      const ax = (box.x0 + box.x1) / 2, ay = d[1] > 0 ? box.y1 : box.y0;
      ctx.translate(ax, ay);
      ctx.transform(1 + 0.5 * a, 0, b * d[1], 1 - a, 0, 0);
      ctx.translate(-ax, -ay);
    } else {
      const ay = (box.y0 + box.y1) / 2, ax = d[0] > 0 ? box.x1 : box.x0;
      ctx.translate(ax, ay);
      ctx.transform(1 - a, b * d[0], 0, 1 + 0.5 * a, 0, 0);
      ctx.translate(-ax, -ay);
    }
    draw();
    ctx.restore();
  }
  /** The screen box of board cells [[x, y]]. */
  function boxOf(view, cells) {
    const s = view.lay.s;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx + s); y1 = Math.max(y1, sy + s); }
    return { x0, y0, x1, y1 };
  }

  // ---- drawing a body -------------------------------------------------------------------------------------------------

  /** A point on the board (cells, y up) on screen. */
  function pt(view, x, y) { const s = view.lay.s, p = view.toScreen(x - 0.5, y - 0.5); return [p[0] + s / 2, p[1] + s / 2]; }

  /**
   * One body as a blob: its outline (rounded, a hair inset) where its pose puts it, then the skin: squashed and sheared
   * about its lowest point (along gravity), rippling across its minos, stretched while it falls fast, its foot bulging
   * under the weight on it (fx: { sag, vy }); a darker rim inside the edge, light along the top, a gloss.
   */
  function drawBody(ctx, view, def, pose, skin, alpha, fx) {
    const s = view.lay.s, light = lightOf(ctx);
    const [x, y, c, sn] = pose;
    // Colour groups (a body is nearly always one colour: one piece).
    const groups = new Map();
    for (let k = 0; k < def.m; k++) {
      const v = def.v[k];
      if (v & CELL.HIDDEN) continue;
      const key = v & CELL.COLOR;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(def.cells[2 * k], def.cells[2 * k + 1]);
    }
    if (!groups.size) return;
    // The skin's frame: the body's lowest point (board y), its middle, its height and width.
    let yLow = Infinity, yTop = -Infinity, xLo = Infinity, xHi = -Infinity, xMid = 0;
    for (let k = 0; k < def.m; k++) {
      const wy = y + sn * def.lx[k] + c * def.ly[k], wx = x + c * def.lx[k] - sn * def.ly[k];
      yLow = Math.min(yLow, wy - 0.5); yTop = Math.max(yTop, wy + 0.5); xLo = Math.min(xLo, wx - 0.5); xHi = Math.max(xHi, wx + 0.5);
      xMid += wx;
    }
    xMid /= def.m;
    const H = Math.max(1, yTop - yLow), HW = Math.max(0.5, (xHi - xLo) / 2);
    const vy = fx && fx.vy < 0 ? fx.vy : 0, stretch = Math.min(0.16, -vy * 0.01);
    const sa = Math.max(-0.35, Math.min(0.38, (skin ? skin.a : 0) - stretch)), sb = skin ? Math.max(-0.35, Math.min(0.35, skin.b)) : 0, sc = skin ? skin.c : 0, sag = (fx && fx.sag) || 0;
    const bent = !!(sa || sb || sc || sag);
    const toScr = (bx, by) => {
      // Body frame (cells about its centre of mass) → board → the skin → screen.
      let wx = x + c * bx - sn * by, wy = y + sn * bx + c * by;
      if (bent) {
        const hgt = wy - yLow, u = Math.max(0, Math.min(1, hgt / H)), v = (wx - xMid) / HW;
        const nx = xMid + (wx - xMid) * (1 + 0.7 * sa) + sb * hgt + sag * v * (1 - u) * (1 - u) + sc * 0.1 * Math.cos(2.7 * hgt + 0.4);
        const ny = yLow + hgt * (1 - sa) + sc * 0.45 * u * Math.sin(3.1 * (wx - xLo) + 1.3);
        wx = nx; wy = ny;
      }
      return pt(view, wx, wy);
    };
    const g = 0.045;
    if (alpha < 1) { ctx.save(); ctx.globalAlpha *= alpha; }
    for (const [colorKey, cells] of groups) {
      const color = view.colorOf(colorKey);
      const o = outlineOf(Int32Array.from(cells), g);
      // Its centre of mass on the body's (the group may be part of it).
      const dx = o.cx - def.ccx, dy = o.cy - def.ccy;
      ctx.beginPath();
      let top = Infinity, bot = -Infinity, left = Infinity;
      for (const loop of o.loops) {
        // Each edge in pieces of at most half a cell (the skin bends them), then rounded through the middles: every
        // corner a curve.
        const n = loop.length / 2, P = [];
        for (let i = 0; i < n; i++) {
          const ax = loop[2 * i] + dx, ay = loop[2 * i + 1] + dy, bx = loop[2 * ((i + 1) % n)] + dx, by = loop[2 * ((i + 1) % n) + 1] + dy;
          const cut = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
          for (let j = 0; j < cut; j++) { const q = toScr(ax + ((bx - ax) * j) / cut, ay + ((by - ay) * j) / cut); P.push(q); top = Math.min(top, q[1]); bot = Math.max(bot, q[1]); left = Math.min(left, q[0]); }
        }
        const N = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const m0 = mid(P[N - 1], P[0]);
        ctx.moveTo(m0[0], m0[1]);
        for (let i = 0; i < N; i++) { const a = P[i], m = mid(a, P[(i + 1) % N]); ctx.quadraticCurveTo(a[0], a[1], m[0], m[1]); }
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Light along the top, a glow along the bottom (screen up and down: the blob as it is drawn).
      const t = ctx.createLinearGradient(0, top, 0, top + s * 0.45);
      t.addColorStop(0, 'rgba(255,255,255,' + (light ? 0.34 : 0.26) + ')'); t.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = t; ctx.fillRect(left - s, top, s * (def.m + 4) * 2, s * 0.45);
      const gl = ctx.createLinearGradient(0, bot - s * 0.35, 0, bot);
      gl.addColorStop(0, rgba(shade(color, 0.5), 0)); gl.addColorStop(1, rgba(shade(color, 0.5), light ? 0.2 : 0.28));
      ctx.fillStyle = gl; ctx.fillRect(left - s, bot - s * 0.35, s * (def.m + 4) * 2, s * 0.35);
      // The rim: a darker line inside the edge.
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, s * 0.09);
      ctx.strokeStyle = rgba(shade(color, light ? -0.3 : -0.42), 0.95);
      ctx.stroke();
      ctx.restore();
      // A gloss at the top of its top-left mino.
      let gk = -1, gv = -Infinity;
      for (let k = 0; k < cells.length / 2; k++) { const v = cells[2 * k + 1] * 64 - cells[2 * k]; if (v > gv) { gv = v; gk = k; } }
      if (gk >= 0) {
        const bx = cells[2 * gk] + 0.5 - def.ccx, by = cells[2 * gk + 1] + 0.5 - def.ccy;
        const a = toScr(bx - 0.28, by + 0.32), b = toScr(bx + 0.06, by + 0.2);
        ctx.fillStyle = 'rgba(255,255,255,' + (light ? 0.6 : 0.5) + ')';
        ctx.beginPath();
        ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(1, Math.abs(b[0] - a[0]) / 2 + s * 0.02), Math.max(1, s * 0.06), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (alpha < 1) ctx.restore();
  }
  /** A body of the world as the view draws it (def: its shape and values; pose). */
  function defOfBody(b) {
    const d = { id: b.id, m: b.m, cells: b.cells, v: b.v, lx: b.lx, ly: b.ly, ccx: 0, ccy: 0 };
    return centred(d);
  }
  function centred(d) {
    let cx = 0, cy = 0;
    for (let k = 0; k < d.m; k++) { cx += d.cells[2 * k] + 0.5; cy += d.cells[2 * k + 1] + 0.5; }
    d.ccx = cx / d.m; d.ccy = cy / d.m;
    return d;
  }

  // ---- the lock played back ----------------------------------------------------------------------------------------------

  /**
   * A lock's record (js/jelly.js, Recorder) played over the view: shown are the bodies as the record has them at the
   * time, each frame's poses eased between the frames either side. Clears fire the look's effect and the sound as they
   * are reached; landings kick the skins. Input is never held up: a lower, a drop or a lock, or the next piece reaching
   * a body still on its way, ends it at once.
   */
  function startReplay(view, r) {
    const rec = r && r.jelly;
    if (!rec || !rec.frames || !rec.frames.length) return null;
    const g = view.game, reduced = quiet(view);
    const shown = new Map();
    for (const d of rec.start) shown.set(d.id, { def: centred(Object.assign({}, d)), pose: d.pose.slice(), vy: 0, vx: 0 });
    const rp = { rec, shown, i: 0, at: 0, t0: performance.now(), speed: reduced ? 3 : 1, reduced, pieces: g.s.pieces, final: g.board.cells.slice(), fired: 0, n: 0, onWave: null };
    // A hard drop lands with a squash (and a wobble) that grows with the fall, and its weight squashes what it lands on.
    const J = stateOf(view), q = reduced ? QUIET : 1;
    if (r.dropDist > 0) for (const d of rec.frames[0].add) {
      const k = Math.min(14, 3 * Math.sqrt(r.dropDist));
      skinKick(J, d.id, k, 0, k * 1.2, q);
      rp.shown.set(d.id, { def: centred(Object.assign({}, d)), pose: d.pose.slice(), vy: 0, vx: 0 });
      kickBelow(J, rp, d.id, k * 0.45, q);
      rp.shown.delete(d.id);
    }
    return rp;
  }
  /** The board box of a shown body: [x0, y0, x1, y1]. */
  function boxShown(e) {
    const [x, y, c, s] = e.pose, d = e.def, h = 0.5 * (Math.abs(c) + Math.abs(s));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < d.m; k++) {
      const cx = x + c * d.lx[k] - s * d.ly[k], cy = y + s * d.lx[k] + c * d.ly[k];
      x0 = Math.min(x0, cx - h); x1 = Math.max(x1, cx + h); y0 = Math.min(y0, cy - h); y1 = Math.max(y1, cy + h);
    }
    return [x0, y0, x1, y1];
  }
  /** Something landed on what is under body id: those squash too (its weight), a little less. */
  function kickBelow(J, rp, id, da, q) {
    const me = rp.shown.get(id);
    if (!me || da < 0.3) return;
    const [ax0, ay0, ax1] = boxShown(me);
    for (const [oid, e] of rp.shown) {
      if (oid === id) continue;
      const [bx0, , bx1, by1] = boxShown(e);
      if (bx1 > ax0 + 0.1 && bx0 < ax1 - 0.1 && by1 <= ay0 + 0.25 && by1 > ay0 - 0.35) skinKick(J, oid, da, 0, da * 0.6, q);
    }
  }
  /** Applies frame i: its adds, removals, clear (fired) and poses; landing kicks the skins. */
  function applyFrame(view, J, rp, f) {
    for (const id of f.del) rp.shown.delete(id);
    for (const d of f.add) rp.shown.set(d.id, { def: centred(Object.assign({}, d)), pose: d.pose.slice(), vy: 0, vx: 0 });
    if (f.clear) fireClear(view, rp, f.clear);
    const dt = Math.max(1e-4, f.t);
    const q = rp.reduced ? QUIET : 1, landed = [];
    for (const [id, x, y, c, s] of f.set) {
      const e = rp.shown.get(id);
      if (!e) continue;
      const vy = (y - e.pose[1]) / dt, vx = (x - e.pose[0]) / dt;
      // A landing (or a bounce): falling fast, now stopped or going up: a squash and a wobble. A knock: a sudden
      // change sideways: a shear.
      if (e.vy < -2 && vy > e.vy * 0.4) { const k = Math.min(12, -e.vy); skinKick(J, id, k, 0, k * 1.2, q); landed.push([id, k]); }
      if (Math.abs(vx - e.vx) > 1.2) skinKick(J, id, 0, Math.max(-3, Math.min(3, (vx - e.vx) * 0.35)), 0, q);
      e.vy = vy; e.vx = vx;
      e.pose[0] = x; e.pose[1] = y; e.pose[2] = c; e.pose[3] = s;
    }
    for (const [id, k] of landed) kickBelow(J, rp, id, k * 0.4, q);
  }
  /** A band clearing: its minos burst with the look's effect, "CASCADE ×n" from the second, a little shake, its sound. */
  function fireClear(view, rp, cl) {
    const s = view.lay.s, b = view.lay.board;
    rp.n++;
    const cells = cl.cells.map((c) => { const [sx, sy] = pt(view, c.x, c.y); return { x: sx - s / 2, y: sy - s / 2, color: view.colorOf(c.v) }; });
    view.fx.burst(view.look.effect, cells, s, rp.reduced);
    if (cl.n > 1) view.fx.text(cl.n > 2 ? 'CASCADE ×' + (cl.n - 1) : 'CASCADE', b.x + b.w / 2, b.y + b.h * 0.3, '#ffffff', Math.max(13, Math.min(20, s * 0.8)));
    if (!rp.reduced) view.fx.shake = Math.max(view.fx.shake, Math.min(2, 0.5 * cl.rows.length));
    if (rp.onWave) { try { rp.onWave({ rows: cl.rows }, rp.n); } catch (e) { /* a sound that fails is only a sound */ } }
  }
  function sameCells(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  /** Moves the playback on to now; ends it when it is over or the board changed under it. */
  function tickReplay(view, J, now) {
    const rp = J.replay, g = view.game;
    if (!rp) return;
    if (g.s.pieces !== rp.pieces || !sameCells(g.board.cells, rp.final)) { endReplay(view, J, false); return; }
    const t = ((now - rp.t0) / 1000) * rp.speed, fr = rp.rec.frames;
    while (rp.i < fr.length && rp.at + fr[rp.i].t <= t) { rp.at += fr[rp.i].t; applyFrame(view, J, rp, fr[rp.i]); rp.i++; }
    if (rp.i >= fr.length) { endReplay(view, J, true); return; }
    if (meets(view, rp)) endReplay(view, J, true);
  }
  /** Ends the playback: every clear not yet reached is still seen and heard; the board is drawn as it rests. */
  function endReplay(view, J, flushIt) {
    const rp = J.replay;
    J.replay = null;
    view.dirty = true;
    if (!rp || !flushIt) return;
    const fr = rp.rec.frames;
    while (rp.i < fr.length) { const f = fr[rp.i++]; if (f.clear) fireClear(view, rp, f.clear); }
  }
  /** Does the piece in play overlap a body still drawn where the board (its grid) has nothing? */
  function meets(view, rp) {
    const g = view.game, p = g.piece;
    if (!p) return false;
    const w = g.w, fin = g.board.cells, mine = new Set();
    for (const [x, y] of g.absCells(p)) if (x >= 0 && x < w && y >= 0 && y < g.h && !fin[y * w + x]) mine.add(y * w + x);
    if (!mine.size) return false;
    for (const e of rp.shown.values()) {
      const [x, y, c, s] = e.pose, d = e.def;
      for (let k = 0; k < d.m; k++) {
        const cx = Math.floor(x + c * d.lx[k] - s * d.ly[k]), cy = Math.floor(y + s * d.lx[k] + c * d.ly[k]);
        if (mine.has(cy * w + cx)) return true;
      }
    }
    return false;
  }
  /** The poses to draw now: each shown body eased toward the next frame's pose. */
  function drawReplay(ctx, view, J, now) {
    const rp = J.replay, fr = rp.rec.frames, f = fr[rp.i];
    const t = ((now - rp.t0) / 1000) * rp.speed, k = f && f.t > 0 ? Math.max(0, Math.min(1, (t - rp.at) / f.t)) : 0;
    const next = new Map();
    if (f) for (const e of f.set) next.set(e[0], e);
    for (const [id, e] of rp.shown) {
      let pose = e.pose;
      const n = next.get(id);
      if (n && k > 0) {
        let c = pose[2] + (n[3] - pose[2]) * k, s = pose[3] + (n[4] - pose[3]) * k;
        const l = Math.sqrt(c * c + s * s) || 1;
        c /= l; s /= l;
        pose = [pose[0] + (n[1] - pose[0]) * k, pose[1] + (n[2] - pose[1]) * k, c, s];
      }
      drawBody(ctx, view, e.def, pose, J.skins.get(id), 1, { sag: sagOf(view, J, id), vy: rp.reduced ? 0 : e.vy });
    }
  }
  /**
   * The weight on each body (the minos stacked right above it, column by column, of the board at rest): its foot
   * bulges by SAG a mino of it (at most SAG_MAX a side). Worked out once a board state.
   */
  const SAG = 0.007, SAG_MAX = 0.08;
  function sagOf(view, J, id) {
    const W = worldOf(view);
    if (!W) return 0;
    const key = view.game.s.pieces + ':' + W.bodies.length + ':' + W.next;
    if (!J.load || J.load.key !== key) {
      const w = W.w, h = W.h, at = new Int32Array(w * h).fill(-1), sag = new Map();
      W.bodies.forEach((b, i) => { for (let k = 0; k < b.m; k++) { const x = Math.floor(b.cx(k)), y = Math.floor(b.cy(k)); if (x >= 0 && x < w && y >= 0 && y < h && at[y * w + x] < 0) at[y * w + x] = i; } });
      W.bodies.forEach((b, i) => {
        let load = 0;
        for (let x = 0; x < w; x++) {
          let top = -1;
          for (let y = 0; y < h; y++) if (at[y * w + x] === i) top = y;
          if (top < 0) continue;
          for (let y = top + 1; y < h && at[y * w + x] >= 0 && at[y * w + x] !== i; y++) load++;
        }
        if (load) sag.set(b.id, Math.min(SAG_MAX, SAG * load));
      });
      J.load = { key, sag };
    }
    return J.load.sag.get(id) || 0;
  }

  // ---- the painter ----------------------------------------------------------------------------------------------------

  /**
   * The painter for every own cell (claims: 'rest'): the stack's cells are left to the bodies (overStack); the piece,
   * its ghost and the trays are lumps on the grid.
   */
  function cell(ctx, v, sx, sy, s, kind, view, at) {
    if (!view.lay) return false;
    const J = stateOf(view);
    if (kind === 'stack') {
      // A cell that stays on the grid (a stone, garbage) is drawn as ever; the rest are bodies.
      if (L.Jelly && v & L.Jelly.STATIC) return false;
      return !!worldOf(view);
    }
    const P = Math.round(s * dprOf(ctx)), color = view.colorOf(v);
    if (kind === 'piece') {
      const cells = at.cells || [[at.x, at.y]];
      const img = lumpSprite(color, maskOfShape(cells, at.x, at.y, (dx, dy) => view.screenDir(dx, dy)), P, lightOf(ctx), 'body');
      const sp = J.piece;
      if (sp) withSpring(ctx, view, sp, boxOf(view, cells), () => blit(ctx, img, sx, sy, s, P));
      else blit(ctx, img, sx, sy, s, P);
      return true;
    }
    if (kind === 'ghost') {
      const style = at.style === 'soft' || at.style === 'dotted' || at.style === 'glow' ? at.style : 'outline';
      blit(ctx, lumpSprite(color, maskOfShape(at.cells || [[at.x, at.y]], at.x, at.y, (dx, dy) => view.screenDir(dx, dy)), P, lightOf(ctx), style), sx, sy, s, P, true);
      return true;
    }
    if (kind === 'tray') {
      // The trays stand upright: up in the piece is up on screen.
      const img = lumpSprite(color, maskOfShape(at.cells || [[at.x, at.y]], at.x, at.y, (dx, dy) => [dx, -dy]), P, lightOf(ctx), 'body');
      const a = at.alpha != null && at.alpha < 1 ? at.alpha : 1;
      if (a < 1) { ctx.save(); ctx.globalAlpha *= a; blit(ctx, img, sx, sy, s, P); ctx.restore(); }
      else blit(ctx, img, sx, sy, s, P);
      return true;
    }
    return false;
  }

  /** The bodies as they rest (no playback): each drawn where the world has it. */
  function drawRest(ctx, view, J) {
    const W = worldOf(view);
    if (!W) return;
    for (const b of W.bodies) drawBody(ctx, view, defOfBody(b), [b.x, b.y, b.c, b.s], J.skins.get(b.id), 1, { sag: sagOf(view, J, b.id), vy: 0 });
  }

  // ---- the view part ----------------------------------------------------------------------------------------------

  const viewPart = {
    key: 'jelly', order: 30,
    claims: 'rest',
    cell,
    // Each frame drawn: the springs and the playback move on; the bodies are drawn over the (empty) stack.
    overStack(ctx, view) {
      const J = stateOf(view), now = performance.now();
      stepSprings(J, now);
      tickReplay(view, J, now);
      ctx.save();
      // Clipped to the well: a body never draws over the frame.
      const wl = view.lay.well || view.lay.board;
      if (wl) { ctx.beginPath(); ctx.rect(wl.x, wl.y - view.lay.s * 4, wl.w, wl.h + view.lay.s * 4); ctx.clip(); }
      if (J.replay) drawReplay(ctx, view, J, now);
      else drawRest(ctx, view, J);
      ctx.restore();
    },
    busy(view) {
      const J = stateOf(view), now = performance.now();
      stepSprings(J, now);
      tickReplay(view, J, now);
      return !!(J.piece || J.replay || J.skins.size);
    },
    onLock(view, r, reduced) {
      const J = stateOf(view);
      if (J.replay) endReplay(view, J, true);
      J.piece = null;
      J.last = performance.now();
      J.replay = startReplay(view, r);
      view.dirty = true;
      void reduced;
    },
    // A move leaves the top behind for a moment (a shear against the move), a turn and a lower squash it a little.
    onMove(view, act) { pieceKick(view, 0, 0.13 * (act === 'moveL' ? -1 : 1)); },
    onRotate(view) { pieceKick(view, 0.1, 0); },
    onLower(view) {
      const J = stateOf(view);
      if (J.replay) endReplay(view, J, true);
      pieceKick(view, 0.05, 0);
    },
  };
  Recipe.viewPart(viewPart);

  // ---- the New board window, the board's summary and Stats ----------------------------------------------------------

  const fmtInt = L.fmtInt || ((n) => String(Math.floor(n)));
  Recipe.uiPart({
    key: 'jelly', order: 30, mod: 'jelly', name: 'Jelly',
    // The board's cascades (bands a clear's fall filled), on its summary: the Board full card, Retire, the library.
    tiles: (x) => (x && typeof x === 'object' ? [[fmtInt(x.cascades || 0), 'Cascades']] : []),
  });

  if (L.UI && L.UI.statRow) {
    L.UI.statRow('jelly', {
      sub: 'free', at: 'end', id: 'jelly',
      render(app, S) {
        const F = S.free || {};
        if (!F.cascades) return null;
        const h = L.UI.h;
        return [h('h4', null, 'Jelly'), h('table', { class: 'st' },
          [['Cascades', fmtInt(F.cascades)], ['Most from one piece', fmtInt(F.bestCascade || 0)]].map((r) => h('tr', null, r.map((c) => h('td', null, c)))))];
      },
    });
  }

  L.JellyView = { lumpSprite, stateOf, startReplay, outlineOf, drawBody, view: viewPart };
})(typeof globalThis !== 'undefined' ? globalThis : this);
