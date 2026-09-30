// Lull — Jelly's look and window (js/jelly.js has its rules). On a Jelly board every block is drawn as soft jelly
// (the stack, the piece in play, its ghost and the trays): a lump is one rounded body, its joined sides meeting with no
// seam. It wobbles a little when it lands, moves, turns or lowers (render-only springs, at rest again within half a
// second), and a cascade is replayed wave by wave over the board that is already final. Reduced motion: no springs,
// and each wave is a short crossfade. Also the New board window's switch, the Cascades tile and the Stats rows.
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
    for (const wv of r.cascade) {
      if (!wv.before || !wv.falls) return null;
      const mid = wv.before.slice(), moved = new Map();
      let maxDy = 0;
      for (const [x, y] of wv.falls) mid[y * w + x] = 0;
      for (const [x, y, dy] of wv.falls) { mid[(y - dy) * w + x] = wv.before[y * w + x]; moved.set(y * w + x, dy); maxDy = Math.max(maxDy, dy); }
      const fall = reduced ? 0.15 : Math.min(0.4, 0.12 + 0.07 * Math.sqrt(maxDy));
      const clear = wv.rows.length ? (reduced ? 0.15 : 0.2) : 0.06;
      waves.push({ before: wv.before, mid, moved, rows: wv.rows, removed: wv.removed, falls: wv.falls, fall, clear, dur: fall + clear });
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
    // The next piece meets a lump still drawn where it was: the replay jumps to its end.
    if (g.piece) {
      const arr = at.t < at.wv.fall ? at.wv.before : at.wv.mid;
      for (const [x, y] of g.absCells(g.piece)) if (x >= 0 && x < g.w && y >= 0 && y < g.h && arr[y * g.w + x] && !g.board.cells[y * g.w + x]) { endReplay(view, J, false); return; }
    }
    // Each wave's clear, in order, as the replay reaches it (every one, even when a slow frame skipped past it).
    const upto = at.t >= at.wv.fall ? at.i : at.i - 1;
    while (rp.fired < upto) fireWave(view, rp, rp.waves[++rp.fired]);
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
      if (J.replay) endReplay(view, J, false);
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
      if (J.replay) endReplay(view, J, false);
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

  L.JellyView = { lumpSprite, stateOf, startReplay, replayAt, maskIn, view: viewPart };
})(typeof globalThis !== 'undefined' ? globalThis : this);
