// Lull — Jelly's look and window (js/jelly.js has its rules). On a Jelly board every block is drawn as soft jelly
// (the stack, the piece in play, its ghost and the trays): a lump is one rounded body, its joined sides meeting with no
// seam. It wobbles a little when it lands, moves, turns or lowers (render-only springs, at rest again within half a
// second), and settling is replayed step by step over the board that is already final: lumps fall and squash, an
// oozing block is a stretched blob squeezing along a strand of jelly while its lump warps. Reduced motion: no springs,
// no warping, ooze steps instant and each fall a short crossfade. Also the New board window's switch, the Cascades
// tile and the Stats rows.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Recipe, Render } = L;
  if (!Recipe || !Render) return;
  const { shade, rgba } = Render;
  const JR = CELL.JOIN_R, JU = CELL.JOIN_U;

  // Screen sides of a cell, as bits: right, up, left, down.
  const S_R = 1, S_U = 2, S_L = 4, S_D = 8;
  const sideBit = (d) => (d[0] > 0 ? S_R : d[0] < 0 ? S_L : d[1] < 0 ? S_U : S_D);

  // ---- the lump sprites -------------------------------------------------------------------------------------------

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
      // A darker rim on the open sides only, then the body inside it: one flat colour, so a lump reads as one piece
      // (its cells never band); light only along its open top, a glow along its open bottom, a gloss at a top-left corner.
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

  // ---- a view's state ---------------------------------------------------------------------------------------------

  // Springs: about 6 Hz, damping 0.35; a spring under 0.003 is at rest and goes; at most 60 cells wobble at once.
  const OMEGA = 2 * Math.PI * 6, ZETA = 0.35, K = OMEGA * OMEGA, C = 2 * ZETA * OMEGA, REST = 0.003, MAX_CELLS = 60;

  /** The Jelly state kept on a board view: its springs, the piece's spring and a cascade being replayed. */
  function stateOf(view) {
    let J = view.jelly;
    if (!J || J.game !== view.game) J = view.jelly = { game: view.game, springs: [], piece: null, replay: null, last: 0, byCell: new Map() };
    return J;
  }
  const quiet = (view) => !!view.reducedMotion;

  /** Steps the springs to now; drops those at rest. */
  function stepSprings(J, now) {
    const dt = J.last ? Math.min(0.05, Math.max(0, (now - J.last) / 1000)) : 0;
    J.last = now;
    if (!dt) return;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    const all = J.piece ? J.springs.concat([J.piece]) : J.springs;
    for (const sp of all) {
      for (let i = 0; i < n; i++) {
        sp.va += (-K * sp.a - C * sp.va) * h; sp.a += sp.va * h;
        sp.vb += (-K * sp.b - C * sp.vb) * h; sp.b += sp.vb * h;
      }
    }
    const rest = (sp) => Math.abs(sp.a) < REST && Math.abs(sp.b) < REST && Math.abs(sp.va) < 0.05 && Math.abs(sp.vb) < 0.05;
    const before = J.springs.length;
    J.springs = J.springs.filter((sp) => !rest(sp));
    if (J.springs.length !== before) indexSprings(J);
    if (J.piece && rest(J.piece)) J.piece = null;
  }
  function indexSprings(J) {
    J.byCell = new Map();
    for (const sp of J.springs) for (const i of sp.cells) J.byCell.set(i, sp);
  }
  /** A spring on a lump of the stack (cell indices on the board), kicked to a. */
  function kick(J, cells, a) {
    const used = J.springs.reduce((n, sp) => n + sp.cells.length, 0);
    if (!cells.length || used + cells.length > MAX_CELLS) return null;
    const sp = { cells, a, va: 0, b: 0, vb: 0 };
    J.springs.push(sp);
    for (const i of cells) J.byCell.set(i, sp);
    return sp;
  }
  function pieceKick(view, da, db) {
    if (quiet(view)) return;
    const J = stateOf(view);
    if (!J.piece) J.piece = { a: 0, va: 0, b: 0, vb: 0, cells: [] };
    J.piece.a = Math.max(-0.2, Math.min(0.2, J.piece.a + da));
    J.piece.b = Math.max(-0.2, Math.min(0.2, J.piece.b + db));
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

  // ---- drawing a cell ---------------------------------------------------------------------------------------------

  /** The screen side bits of the board's right, left, up and down, for the way the view is turned (kept per turn). */
  const SIDES = new Map();
  function sidesOf(view) {
    const rot = (view.view && view.view.rot) || 0;
    let s = SIDES.get(rot);
    if (!s) SIDES.set(rot, (s = [sideBit(view.screenDir(1, 0)), sideBit(view.screenDir(-1, 0)), sideBit(view.screenDir(0, 1)), sideBit(view.screenDir(0, -1))]));
    return s;
  }
  /** The joined screen sides of the cell at (x, y) of a board's cells (links to an empty cell do not count). */
  function maskIn(view, arr, w, h, x, y) {
    const i = y * w + x, v = arr[i], sd = sidesOf(view);
    let m = 0;
    if (v & JR && x + 1 < w && arr[i + 1]) m |= sd[0];
    if (x > 0 && arr[i - 1] & JR) m |= sd[1];
    if (v & JU && y + 1 < h && arr[i + w]) m |= sd[2];
    if (y > 0 && arr[i - w] & JU) m |= sd[3];
    return m;
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

  /** A block of the stack (or of a cascade's replay: arr is the board drawn), in the Jelly look. */
  function drawStackCell(ctx, view, arr, v, x, y, sx, sy, s, sp) {
    const g = view.game, P = Math.round(s * dprOf(ctx));
    const img = lumpSprite(view.colorOf(v), maskIn(view, arr, g.w, g.h, x, y), P, lightOf(ctx), 'body');
    if (sp) withSpring(ctx, view, sp, sp.box || { x0: sx, y0: sy, x1: sx + s, y1: sy + s }, () => blit(ctx, img, sx, sy, s, P));
    else blit(ctx, img, sx, sy, s, P);
  }

  /** The painter for every own cell (claims: 'rest'): the stack, the piece, its ghost and the trays. */
  function cell(ctx, v, sx, sy, s, kind, view, at) {
    if (!view.lay) return false;
    const J = stateOf(view), g = view.game;
    if (kind === 'stack') {
      // While a cascade is replayed the board is drawn by the replay (overStack).
      if (J.replay) { J.hid = true; return true; }
      const sp = J.byCell.size ? J.byCell.get(at.y * g.w + at.x) : null;
      drawStackCell(ctx, view, g.board.cells, v, at.x, at.y, sx, sy, s, sp);
      return true;
    }
    const P = Math.round(s * dprOf(ctx)), color = view.colorOf(v);
    if (kind === 'piece') {
      const cells = at.cells || [[at.x, at.y]];
      const img = lumpSprite(color, maskOfShape(cells, at.x, at.y, (dx, dy) => view.screenDir(dx, dy)), P, lightOf(ctx), 'body');
      const sp = J.piece;
      if (sp && !quiet(view)) withSpring(ctx, view, sp, boxOf(view, cells), () => blit(ctx, img, sx, sy, s, P));
      else blit(ctx, img, sx, sy, s, P);
      return true;
    }
    if (kind === 'ghost') {
      // Under a block a cascade's replay still draws (the stack a clear has yet to bring down), the ghost is hidden.
      if (J.replay && ghostCovered(view, at.x, at.y)) return true;
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

  // ---- landing: the lumps that just came to rest wobble -------------------------------------------------------------

  /** Kicks the lumps holding these board cells (a, at most 60 cells), and those they rest on (under). */
  function kickLumps(view, idxs, a, under) {
    const J = stateOf(view), g = view.game, b = g.board, w = g.w;
    if (!idxs.length || !L.Jelly) return;
    const { id, list } = L.Jelly.lumps(b);
    const mine = new Set();
    for (const i of idxs) if (id[i] >= 0) mine.add(id[i]);
    const below = new Set();
    for (const k of mine) {
      const cells = list[k];
      if (!kickSpring(view, J, cells, a)) continue;
      if (under) for (const i of cells) { const j = i - w; if (j >= 0 && id[j] >= 0 && !mine.has(id[j])) below.add(id[j]); }
    }
    for (const k of below) kickSpring(view, J, list[k], under);
  }
  function kickSpring(view, J, cells, a) {
    const w = view.game.w;
    const sp = kick(J, cells, a);
    if (sp) sp.box = boxOf(view, cells.map((i) => [i % w, (i - (i % w)) / w]));
    return sp;
  }

  // ---- the cascade replayed -----------------------------------------------------------------------------------------

  /**
   * A lock's cascade, replayed over the final board: each wave's lumps fall (ease in, as things fall), land with a
   * squash, and the rows they fill clear with the look's own effect, "CASCADE ×n" over the board. 0.35–0.5 s a wave;
   * under reduced motion a 0.15 s crossfade. Input is never held up: a lower, a drop or a lock, or the next piece
   * reaching a lump still in the air, ends it at once.
   */
  function startReplay(view, r) {
    const g = view.game, w = g.w, h = g.h, reduced = quiet(view);
    const waves = [];
    const oozes = r.cascade.filter((wv) => wv.moves && wv.moves.length).length;
    // An ooze step: 0.05–0.16 s, the more steps the quicker (about 1.8 s of oozing at most); instant under reduced motion.
    const step = reduced ? 0 : Math.max(0.05, Math.min(0.16, 1.8 / Math.max(1, oozes)));
    for (const wv of r.cascade) {
      if (!wv.before || !wv.falls) return null;
      const moved = new Map();
      let maxDy = 0, mid = wv.after;
      if (!mid) {
        mid = wv.before.slice();
        for (const [x, y] of wv.falls) mid[y * w + x] = 0;
        for (const [x, y, dy] of wv.falls) mid[(y - dy) * w + x] = wv.before[y * w + x];
      }
      for (const [x, y, dy] of wv.falls) { moved.set(y * w + x, dy); maxDy = Math.max(maxDy, dy); }
      const moves = wv.moves || [];
      // Each oozing block: where it goes from and to, the lump it joins (on the board after), a block of it to hang on.
      let ooze = null;
      if (moves.length && L.Jelly) {
        const { id, list } = L.Jelly.lumps({ w, h, cells: mid });
        ooze = moves.map(([from, to]) => {
          const k = id[to], cells = k >= 0 ? list[k] : [to];
          const x = to % w, nb = [to - w, to + w, x > 0 ? to - 1 : -1, x + 1 < w ? to + 1 : -1].find((j) => j >= 0 && j !== from && id[j] === k && j !== to);
          return { from, to, v: mid[to], cells: new Set(cells), hang: nb == null ? -1 : nb };
        });
      }
      const fall = wv.falls.length ? (reduced ? 0.15 : Math.min(0.4, 0.12 + 0.07 * Math.sqrt(maxDy))) : moves.length ? step : 0;
      const clear = wv.rows.length ? (reduced ? 0.15 : 0.2) : wv.falls.length ? 0.06 : 0;
      waves.push({ before: wv.before, mid, moved, rows: wv.rows, removed: wv.removed, falls: wv.falls, ooze, fall, clear, dur: fall + clear });
    }
    if (!waves.length) return null;
    return { waves, i: 0, t0: performance.now(), fired: -1, n: 0, reduced, final: g.board.cells.slice(), pieces: g.s.pieces, onWave: null, w, h };
  }
  /** The wave being shown and the time into it (seconds), or null once the replay is over. */
  function replayAt(rp, now) {
    let t = (now - rp.t0) / 1000;
    for (let i = 0; i < rp.waves.length; i++) {
      const wv = rp.waves[i];
      if (t < wv.dur) return { i, wv, t };
      t -= wv.dur;
    }
    return null;
  }
  function sameCells(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  /** Ends the replay: the board is drawn as it is; the lumps of its last fall wobble as they come to rest. */
  function endReplay(view, J, settle) {
    const rp = J.replay;
    J.replay = null;
    view.dirty = true;
    if (!rp || !settle || rp.reduced) return;
    const last = rp.waves[rp.waves.length - 1];
    if (last.rows.length) return;
    const w = rp.w, idxs = [];
    for (const [x, y, dy] of last.falls) if (dy > 0) idxs.push((y - dy) * w + x);
    for (const o of last.ooze || []) idxs.push(o.to);
    const dy = Math.max(1, ...last.falls.map((f) => f[2]));
    kickLumps(view, idxs, Math.min(0.15, 0.03 * dy), 0);
  }
  /** Each frame: where the replay is; its clear's effect, words and sound as a wave reaches it; its end. */
  function tickReplay(view, J, now) {
    const rp = J.replay, g = view.game;
    if (!rp) return;
    // The board changed under it (Undo, an item, a new board): it is over.
    if (g.s.pieces !== rp.pieces || !sameCells(g.board.cells, rp.final)) { endReplay(view, J, false); return; }
    const at = replayAt(rp, now);
    if (!at) {
      // Over: the clears a slow frame skipped are still seen and heard, then the board as it is.
      while (rp.fired < rp.waves.length - 1) fireWave(view, rp, rp.waves[++rp.fired]);
      endReplay(view, J, true);
      return;
    }
    // The next piece meets a block still drawn where it was, or its ghost a lump in mid-air: the replay jumps to its end.
    if (meets(view, at, rp.reduced)) { flush(view, rp, false); endReplay(view, J, false); return; }
    // Each wave's clear, in order, as the replay reaches it (every one, even when a slow frame skipped past it).
    const upto = at.t >= at.wv.fall ? at.i : at.i - 1;
    while (rp.fired < upto) fireWave(view, rp, rp.waves[++rp.fired]);
  }
  /**
   * Does the piece in play, or its ghost, meet a block the replay still draws (at `at`)? The piece: any block drawn
   * where the final board has none. Its ghost (where it lands on the final board, as the view draws it): a lump of
   * this wave in mid-air, where it is drawn now or on the rest of its way down. (The ghost below the replay's other
   * blocks, the stack a clear has yet to bring down, is only hidden under them: see ghostCovered.)
   */
  function meets(view, at, reduced) {
    const g = view.game, p = g.piece, wv = at.wv;
    if (!p) return false;
    const w = g.w, fin = g.board.cells, arr = at.t < wv.fall ? wv.before : wv.mid;
    for (const [x, y] of g.absCells(p)) if (x >= 0 && x < w && y >= 0 && y < g.h && arr[y * w + x] && !fin[y * w + x]) return true;
    if (at.t >= wv.fall || !wv.falls.length) return false;
    const gy = view.look && view.look.ghost === 'off' ? null : g.ghostY(p);
    if (gy == null || gy === p.y) return false;
    const k = at.t / wv.fall, e = reduced ? 0 : k * k;
    const ghost = g.absCells(p, p.rot, p.x, gy);
    for (const [x, y, dy] of wv.falls) {
      const top = Math.ceil(y - dy * e - 1e-9);
      for (const [gx, gy2] of ghost) if (gx === x && gy2 >= y - dy && gy2 <= top) return true;
    }
    return false;
  }
  /** While a cascade is replayed: does a block it draws cover board cell (x, y)? The ghost is not drawn under one. */
  function ghostCovered(view, x, y) {
    const rp = stateOf(view).replay;
    if (!rp || x < 0 || x >= rp.w || y < 0 || y >= rp.h) return false;
    const at = replayAt(rp, performance.now());
    if (!at) return false;
    const i = y * rp.w + x, wv = at.wv;
    if (at.t < wv.fall) return !!(wv.before[i] || (rp.reduced && wv.mid[i]));
    return !!wv.mid[i];
  }
  /**
   * The replay jumps to its end: the clears it had not reached yet are still seen and heard (heard only: the board has
   * moved on, another lock).
   */
  function flush(view, rp, heardOnly) {
    while (rp.fired < rp.waves.length - 1) {
      const wv = rp.waves[++rp.fired];
      if (!heardOnly) { fireWave(view, rp, wv); continue; }
      if (wv.rows.length) rp.n++;
      if (rp.onWave) { try { rp.onWave(wv, rp.n); } catch (e) { /* a sound that fails is only a sound */ } }
    }
  }
  /** A wave's rows clearing: the look's effect, "CASCADE ×n" over the board, a little shake, its sound. */
  function fireWave(view, rp, wv) {
    if (wv.rows.length) {
      rp.n++;
      const s = view.lay.s, b = view.lay.board;
      view.fx.burst(view.look.effect, view.rowCells(wv.rows, wv.removed), s, rp.reduced);
      view.fx.text(rp.n > 1 ? 'CASCADE \u00d7' + rp.n : 'CASCADE', b.x + b.w / 2, b.y + b.h * 0.3, '#ffffff', Math.max(13, Math.min(20, s * 0.8)));
      if (!rp.reduced) view.fx.shake = Math.max(view.fx.shake, Math.min(2, 0.5 * wv.rows.length));
    }
    if (rp.onWave) { try { rp.onWave(wv, rp.n); } catch (e) { /* a sound that fails is only a sound */ } }
  }
  /** Draws the replay's board: the wave's lumps falling, or landed with its rows clearing. */
  function drawReplay(ctx, view, now) {
    const J = stateOf(view), rp = J.replay;
    if (!rp || !view.lay) return;
    const at = replayAt(rp, now);
    if (!at) return;
    const g = view.game, w = g.w, h = g.h, s = view.lay.s, wv = at.wv;
    const each = (arr, fn) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = arr[y * w + x]; if (v && !(v & CELL.FOREIGN) && !(v & CELL.HIDDEN)) fn(v, x, y); } };
    const plain = (arr, alpha) => {
      if (alpha <= 0) return;
      if (alpha < 1) { ctx.save(); ctx.globalAlpha *= alpha; }
      each(arr, (v, x, y) => { const [sx, sy] = view.toScreen(x, y); drawStackCell(ctx, view, arr, v, x, y, sx, sy, s, null); });
      if (alpha < 1) ctx.restore();
    };
    if (at.t < wv.fall && wv.ooze) { drawOoze(ctx, view, wv, at.t / wv.fall, each); return; }
    if (at.t < wv.fall) {
      const k = at.t / wv.fall;
      if (rp.reduced) { plain(wv.before, 1 - k); plain(wv.mid, k); return; }
      const e = k * k;
      each(wv.before, (v, x, y) => {
        const dy = wv.moved.get(y * w + x) || 0;
        const [sx, sy] = view.toScreen(x, y - dy * e);
        drawStackCell(ctx, view, wv.before, v, x, y, sx, sy, s, null);
      });
      return;
    }
    // Landed: the rows it filled are going (the effect draws them); the lumps that fell settle with a squash.
    const rows = new Set(wv.rows), t = at.t - wv.fall;
    const squash = rp.reduced ? 0 : Math.exp(-ZETA * OMEGA * t) * Math.cos(OMEGA * Math.sqrt(1 - ZETA * ZETA) * t);
    each(wv.mid, (v, x, y) => {
      if (rows.has(y)) return;
      const [sx, sy] = view.toScreen(x, y);
      drawStackCell(ctx, view, wv.mid, v, x, y, sx, sy, s, null);
    });
    if (squash && wv.ooze) {
      // The lumps that oozed wobble as the block lands.
      for (const o of wv.ooze) {
        const cells = Array.from(o.cells).filter((i) => !rows.has((i - (i % w)) / w) && wv.mid[i]).map((i) => [i % w, (i - (i % w)) / w]);
        if (!cells.length) continue;
        const sp = { a: 0.07 * squash, b: 0 };
        withSpring(ctx, view, sp, boxOf(view, cells), () => { for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); drawStackCell(ctx, view, wv.mid, wv.mid[y * w + x], x, y, sx, sy, s, null); } });
      }
    }
    if (squash && wv.falls.length) {
      // The fallen lumps again, squashed over themselves (drawn once more with the spring's shape).
      const dy = Math.max(...wv.falls.map((f) => f[2]));
      const sp = { a: Math.min(0.15, 0.03 * dy) * squash, b: 0 };
      const cells = wv.falls.map(([x, y, d]) => [x, y - d]).filter(([, y]) => !rows.has(y));
      if (cells.length) {
        const box = boxOf(view, cells);
        withSpring(ctx, view, sp, box, () => { for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); drawStackCell(ctx, view, wv.mid, wv.mid[y * w + x], x, y, sx, sy, s, null); } });
      }
    }
  }

  /**
   * An ooze step, k of the way (0–1): the lumps as they are after it, each oozing lump warped (squashed, sheared the
   * way its block goes), and the block itself a stretched blob squeezing from where it was to where it goes, with a
   * strand of jelly bridging it to its lump and trailing back to where it left.
   */
  function drawOoze(ctx, view, wv, k, each) {
    const g = view.game, w = g.w, s = view.lay.s, e = k * k * (3 - 2 * k), bump = Math.sin(Math.PI * k);
    const skip = new Set(), inLump = new Map();
    for (const o of wv.ooze) { skip.add(o.to); for (const i of o.cells) inLump.set(i, o); }
    // The board after the step, less the blocks still on their way (their lumps round off where they will join).
    const arr = wv.mid.slice();
    for (const i of skip) arr[i] = 0;
    const xy = (i) => [i % w, (i - (i % w)) / w];
    const centre = (x, y) => { const [sx, sy] = view.toScreen(x, y); return [sx + s / 2, sy + s / 2]; };
    // The strands under the blocks: from the blob back to where it left (thinning as it goes) and to its lump.
    ctx.save();
    ctx.lineCap = 'round';
    for (const o of wv.ooze) {
      const [fx, fy] = xy(o.from), [tx, ty] = xy(o.to), bx = fx + (tx - fx) * e, by = fy + (ty - fy) * e;
      const color = view.colorOf(o.v), c0 = centre(fx, fy), c1 = centre(bx, by);
      const strands = [[c0, c1, s * (0.5 - 0.3 * k)]];
      if (o.hang >= 0) { const [hx, hy] = xy(o.hang); strands.push([centre(hx, hy), c1, s * (0.36 + 0.2 * k)]); }
      for (const [p0, p1, lw] of strands) {
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
        ctx.lineWidth = lw + Math.max(1, s * 0.08); ctx.strokeStyle = rgba(shade(color, lightOf(ctx) ? -0.3 : -0.42), 0.95); ctx.stroke();
        ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
      }
    }
    ctx.restore();
    // Every block but the oozing ones' lumps, as it is after the step.
    each(wv.mid, (v, x, y) => {
      const i = y * w + x;
      if (skip.has(i) || inLump.has(i)) return;
      const [sx, sy] = view.toScreen(x, y);
      drawStackCell(ctx, view, arr, v, x, y, sx, sy, s, null);
    });
    // Each oozing lump, warped: squashed a little and sheared towards the way its block goes.
    for (const o of wv.ooze) {
      const cells = Array.from(o.cells).filter((i) => i !== o.to && wv.mid[i]).map(xy);
      if (!cells.length) continue;
      const dx = (o.to % w) - (o.from % w), d = view.screenDir(dx > 0 ? 1 : dx < 0 ? -1 : 0, 0);
      const sp = { a: 0.08 * bump, b: 0.07 * bump * (d[0] || d[1] || 0) };
      withSpring(ctx, view, sp, boxOf(view, cells), () => { for (const [x, y] of cells) { const [sx, sy] = view.toScreen(x, y); drawStackCell(ctx, view, arr, arr[y * w + x], x, y, sx, sy, s, null); } });
    }
    // The blobs: round, stretched along the way they go.
    for (const o of wv.ooze) {
      const [fx, fy] = xy(o.from), [tx, ty] = xy(o.to);
      const [sx, sy] = view.toScreen(fx + (tx - fx) * e, fy + (ty - fy) * e);
      const P = Math.round(s * dprOf(ctx)), img = lumpSprite(view.colorOf(o.v), 0, P, lightOf(ctx), 'body');
      const [ax, ay] = view.toScreen(tx, ty), [bx0, by0] = view.toScreen(fx, fy);
      const ang = Math.atan2(ay - by0, ax - bx0), st = 1 + 0.35 * bump;
      ctx.save();
      ctx.translate(sx + s / 2, sy + s / 2);
      ctx.rotate(ang); ctx.scale(st, 1 / Math.sqrt(st)); ctx.rotate(-ang);
      blit(ctx, img, -s / 2, -s / 2, s, P);
      ctx.restore();
    }
  }

  // ---- the view part ----------------------------------------------------------------------------------------------

  const viewPart = {
    key: 'jelly', order: 30,
    claims: 'rest',
    cell,
    // Each frame drawn: the springs and the replay move on (busy is not asked while other effects keep frames coming).
    overStack(ctx, view) {
      const J = stateOf(view), now = performance.now();
      stepSprings(J, now);
      tickReplay(view, J, now);
      if (J.replay) drawReplay(ctx, view, now);
      else if (J.hid) {
        // The replay ended this very frame, after the stack was left to it: the board as it is.
        const g = view.game, s = view.lay.s;
        for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
          const v = g.board.cells[y * g.w + x];
          if (!v || v & CELL.FOREIGN || v & CELL.HIDDEN) continue;
          const [sx, sy] = view.toScreen(x, y);
          drawStackCell(ctx, view, g.board.cells, v, x, y, sx, sy, s, null);
        }
      }
      J.hid = false;
    },
    busy(view) {
      const J = stateOf(view), now = performance.now();
      stepSprings(J, now);
      tickReplay(view, J, now);
      return !!(J.springs.length || J.piece || J.replay);
    },
    onLock(view, r, reduced) {
      const J = stateOf(view), g = view.game;
      if (J.replay) { flush(view, J.replay, true); endReplay(view, J, false); }
      J.piece = null;
      J.springs = []; J.byCell = new Map();
      J.last = performance.now();
      if (r.cascade && r.cascade.length) {
        J.replay = startReplay(view, r);
        if (J.replay) { view.dirty = true; return; }
      }
      if (reduced || !r.cells || !r.cells.length) return;
      // The lump the piece set, where it is now (its rows that cleared gone, what was above them down), and those it rests on.
      const rows = (r.rows || []).slice().sort((a, b) => a - b), gone = new Set(rows), idxs = [];
      for (const [x, y] of r.cells) {
        if (gone.has(y) || x < 0 || x >= g.w || y < 0 || y >= g.h) continue;
        const ny = y - rows.filter((ry) => ry < y).length;
        idxs.push(ny * g.w + x);
      }
      kickLumps(view, idxs, 0.12, 0.05);
    },
    // A move leaves the top behind for a moment (a shear against the move), a turn and a lower squash it a little.
    onMove(view, act) { pieceKick(view, 0, 0.08 * (act === 'moveL' ? -1 : 1)); },
    onRotate(view) { pieceKick(view, 0.06, 0); },
    onLower(view) {
      const J = stateOf(view);
      if (J.replay) { flush(view, J.replay, false); endReplay(view, J, false); }
      pieceKick(view, 0.03, 0);
    },
  };
  Recipe.viewPart(viewPart);

  // ---- the New board window, the board's summary and Stats ----------------------------------------------------------

  const fmtInt = L.fmtInt || ((n) => String(Math.floor(n)));
  Recipe.uiPart({
    key: 'jelly', order: 30, mod: 'jelly', name: 'Jelly',
    // The board's cascades (waves that cleared rows), on its summary: the Board full card, Retire, the library.
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

  L.JellyView = { lumpSprite, stateOf, startReplay, replayAt, meets, ghostCovered, maskIn, view: viewPart };
})(typeof globalThis !== 'undefined' ? globalThis : this);
