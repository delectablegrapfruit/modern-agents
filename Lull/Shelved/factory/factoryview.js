// Lull — the Factory floor, drawn whole from the first day: the droppers over the two mino conveyors, the assemblers
// under them, the store and its sign on the right, the belt winding down, and the board at the bottom. One logical
// floor (Factory.GEO, 360 units wide) scaled to fit the tab and centred. Every box has a header row: its progress on the
// left, its upgrade's price on the right (dimmed while the wallet is short); a spot not yet bought is dashed, with + and
// its price. Minos and pieces are drawn where the model has them, between where they were a tick ago and where they are
// now, so nothing jumps from one part to the next. Minos and pieces wear the player's skin and palette; everything else
// is drawn in the theme's own colours. The sign is a 16 × 7 dot matrix: chevrons running faster the busier the line is,
// amber and still when something is stuck, and the board's lifetime lines for a few seconds when it is tapped.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { rr, rgba, mix } = Render;
  const T = Factory.TUNE, G = Factory.GEO, P = Factory.paths, TR = Factory.TRACK, at = Factory.at;
  const { HEAD } = G;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => k * k * (3 - 2 * k);
  const cssVar = (k, dflt) => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim() || dflt; } catch (e) { return dflt; } };

  const MINO = 9;                        // a mino riding a conveyor or a lift, in units
  const BELT_CELL = 7;                   // a piece's cells on the belt
  const COUNT_S = 4;                     // seconds the sign shows the lifetime lines
  const FLASH = 0.75;                    // a cleared row's flash (the model's three ticks)
  const SETTLE = 0.25;                   // a store column settling down a cell
  const MAX_E = 36;                      // the most each chute by the belt grows on a tall screen, in units
  const BX = G.board.x + (G.board.w - T.BOARD_W * G.board.cell) / 2, BY = G.board.y + (G.board.h - T.BOARD_H * G.board.cell) / 2;

  // ---- the sign: a 16 × 7 dot matrix ---------------------------------------------------------------------------------

  const SIGN_W = 16, SIGN_H = 7;
  // 3 × 5 digits, and a k for thousands.
  const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111', k: '100101110101101' };
  /** A count as the sign spells it: up to 9999 in full, then thousands ("12k"), at most 999k. */
  const signText = (n) => (n < 10000 ? String(Math.max(0, Math.floor(n))) : Math.min(999, Math.floor(n / 1000)) + 'k');
  /** The sign's lit dots (a 7 × 16 grid of booleans): a count, or chevrons at a phase. */
  function signDots(count, phase) {
    const on = Array.from({ length: SIGN_H }, () => new Array(SIGN_W).fill(false));
    if (count != null) {
      const str = signText(count), w = str.length * 4 - 1, x0 = Math.floor((SIGN_W - w) / 2);
      [...str].forEach((ch, i) => { const g = DIG[ch]; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') on[r + 1][x0 + i * 4 + c] = true; });
    } else {
      const off = Math.floor(phase);
      for (let x = 0; x < SIGN_W; x++) for (let y = 0; y < SIGN_H; y++) on[y][x] = (((x - off + Math.abs(y - 3)) % 6) + 6) % 6 === 0;
    }
    return on;
  }

  // ---- the parts ------------------------------------------------------------------------------------------------------

  /** Every part you can tap: its id, the box drawn, and the area that takes a tap (a little larger where a box is small). */
  function parts() {
    const out = [];
    G.drop.x.forEach((x, k) => out.push({ id: 'drop' + k, k, box: { x, y: G.drop.y, w: G.drop.w, h: G.drop.h }, hit: { x: x - 2, y: 4, w: G.drop.w + 4, h: G.rail.y[0] - 10 } }));
    out.push({ id: 'store', box: G.store, hit: G.store });
    G.bay.x.forEach((x, k) => out.push({ id: 'bay' + k, k, box: { x, y: G.bay.y, w: G.bay.w, h: G.bay.h }, hit: { x: x - 2, y: G.bay.y - 4, w: G.bay.w + 4, h: G.bay.h + 6 } }));
    // The belt takes a tap anywhere left of the sign's column (the sign's own area is beside it, not over it).
    const bt = G.belt.y[0] - 13, bh = G.belt.y[3] - G.belt.y[0] + 26;
    out.push({ id: 'belt', box: { x: 12, y: bt, w: 336, h: bh }, hit: { x: 12, y: bt, w: G.sign.x - 8 - 12, h: bh } });
    out.push({ id: 'sign', box: G.sign, hit: { x: G.sign.x - 4, y: G.sign.y - 6, w: G.sign.w + 8, h: 64 } });
    return out;
  }
  const PARTS = parts();

  // ---- the floor ------------------------------------------------------------------------------------------------------

  class FloorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.w = 1; this.h = 1; this.dpr = 1; this.K = 1; this.OX = 0; this.OY = 0;
      this.E1 = 0; this.E2 = 0;                       // spare height, given to the chutes above and below the belt
      this.t = 0; this.reduced = false;
      this.sty = null; this.styKey = '';
      this.tread = { mino: 0, belt: 0 };              // how far the conveyors' treads have run, in units
      this.phase = 0;                                 // the sign's chevrons
      this.countUntil = -1; this.count = 0;           // the sign showing the lifetime lines, until then
      this.settling = new Array(T.STORE_COLS).fill(-9); // a store column settling down a cell, since then
      this.paid = [];                                  // lines just paid on the board: { y, pay, t0 }
      this.signMood = '';                              // the line's mood, held a moment (set by FactoryMode)
      this.frames = 0;
    }

    // ---- layout -----------------------------------------------------------------------------------------------------

    /** Fits the floor to the canvas (CSS px): one scale, centred. A tall canvas lengthens the chutes into and out of
     *  the belt (up to MAX_E units each) rather than leave bands above and below. */
    resize(w, h) {
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      if (w === this.w && h === this.h && dpr === this.dpr) return false;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.K = Math.min(w / G.W, h / G.H);
      const spare = Math.max(0, h / this.K - G.H);
      this.E1 = Math.floor(Math.min(MAX_E, spare / 2)); this.E2 = Math.floor(Math.min(MAX_E, spare - this.E1));
      this.OX = (w - G.W * this.K) / 2; this.OY = (h - (G.H + this.E1 + this.E2) * this.K) / 2;
      return true;
    }

    /** A layout key: the hit areas move only when it changes. */
    layoutKey() { return this.w + 'x' + this.h + '@' + this.dpr; }

    /** A part's box and its hit area, in CSS px. */
    rect(id, hit) {
      const p = PARTS.find((q) => q.id === id);
      if (!p) return { x: 0, y: 0, w: 0, h: 0 };
      const r = hit ? p.hit : p.box, K = this.K, dy = id === 'belt' ? this.E1 : 0;
      return { x: this.OX + r.x * K, y: this.OY + (r.y + dy) * K, w: r.w * K, h: r.h * K };
    }

    // ---- what happened ------------------------------------------------------------------------------------------------

    /** What the model did this frame, for the few things drawn from events: a column settling, lines paid. */
    events(evs, reduced) {
      this.reduced = reduced;
      for (const e of evs) {
        if (e.kind === 'out' && !reduced) this.settling[e.c] = this.t;
        else if (e.kind === 'clear') this.paid.push({ y: e.rows.reduce((a, b) => a + b, 0) / e.rows.length, pay: Factory.linesOf(e.pay), t0: this.t });
      }
      if (this.paid.length > 6) this.paid.splice(0, this.paid.length - 6);
    }

    /** Everything drawn from events lets go, and the sign takes the line's mood at once (a tab change, time away). */
    settle() { this.settling.fill(-9); this.paid.length = 0; this.signMood = ''; }

    /** The sign shows the lifetime lines for a few seconds; a second tap puts the chevrons back. */
    toggleCount(lines) {
      if (this.countUntil > this.t) { this.countUntil = -1; return false; }
      this.count = lines; this.countUntil = this.t + COUNT_S;
      return true;
    }
    get counting() { return this.countUntil > this.t; }

    /** Stuck, as the sign shows it: its mood held a moment (FactoryMode.sayMood), so a passing wait never flickers. */
    stuck(md) { return this.signMood ? this.signMood === 'full' : md.stuck; }

    // ---- materials ----------------------------------------------------------------------------------------------------

    /** The theme's colours, read once per theme and accent. */
    style(th) {
      const key = th.name + '|' + th.accent + '|' + th.fg;
      if (key === this.styKey && this.sty) return this.sty;
      this.styKey = key;
      const light = th.name === 'light', fg = th.fg || (light ? '#1a2030' : '#eceff5'), accent = th.accent || '#8fb3ff';
      const bg = cssVar('--bg', light ? '240, 242, 246' : '13, 16, 23');
      this.sty = {
        light, fg, accent, ink: light ? mix(accent, '#1a2030', 0.45) : accent,
        muted: th.muted || (light ? '#586074' : '#9ba3b5'), faint: th.faint || (light ? '#8a91a2' : '#676f84'),
        good: cssVar('--good', light ? '#2f9a58' : '#7fd79a'), warn: cssVar('--warn', light ? '#b8741a' : '#f2c27d'),
        well0: th.wellTop || (light ? '#e6eaf1' : '#0e121b'), well1: th.wellBottom || (light ? '#f1f3f7' : '#090b11'),
        line: light ? 'rgba(22,32,60,0.16)' : 'rgba(255,255,255,0.11)', track: 'rgb(' + bg + ')',
        off: rgba(fg, light ? 0.13 : 0.1), dot: rgba(fg, light ? 0.12 : 0.09), chip: rgba(accent, light ? 0.16 : 0.14),
        grid: rgba(fg, light ? 0.06 : 0.045),
      };
      return this.sty;
    }

    /** One mino in the skin, centred on (x, y), s units wide (a flat square when it would be under 6 device px). */
    mino(c, look, color, x, y, s, alpha) {
      const d = this.K * this.dpr, px = s * d;
      if (alpha != null && alpha < 1) c.globalAlpha = Math.max(0, alpha);
      if (px >= 6) c.drawImage(Render.cellSprite(look.skin, color, px, this.sty.light), x - s / 2, y - s / 2, s, s);
      else { c.fillStyle = color; c.fillRect(x - s / 2 + 0.5 / this.K, y - s / 2 + 0.5 / this.K, s - 1 / this.K, s - 1 / this.K); }
      if (alpha != null && alpha < 1) c.globalAlpha = 1;
    }
    raw(look) { return look.colors[T.RAW] || look.theme.muted || '#8d99ae'; }
    color(look, c) { return look.colors[c] || look.colors[1]; }

    /** A piece lying flat, centred on (cx, cy), its cells s wide. */
    piece(c, look, it, cx, cy, s, alpha) {
      const cells = Factory.shapes(it.n)[it.s], color = this.color(look, it.c), x0 = cx - (cells.w * s) / 2, y0 = cy - (cells.h * s) / 2;
      for (const [x, y] of cells) this.mino(c, look, color, x0 + (x + 0.5) * s, y0 + (y + 0.5) * s, s, alpha);
    }

    /** A box: the well's wash with a hairline edge. */
    box(c, r) {
      const S = this.sty, g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, S.well0); g.addColorStop(1, S.well1);
      c.fillStyle = g; rr(c, r.x, r.y, r.w, r.h, 10); c.fill();
      c.strokeStyle = S.line; c.lineWidth = 1 / this.K; rr(c, r.x + 0.5 / this.K, r.y + 0.5 / this.K, r.w - 1 / this.K, r.h - 1 / this.K, 10); c.stroke();
    }

    /** A price tag, right-aligned at x: a small upward arrow and the price; returns its width. */
    tag(c, x, y, cost, ok) {
      const S = this.sty, text = L.fmtInt ? L.fmtInt(cost) : String(cost);
      c.font = '650 11px ' + Render.FONT;
      const w = c.measureText(text).width + 21, h = 15;
      c.fillStyle = ok ? S.chip : S.off; rr(c, x - w, y, w, h, 7.5); c.fill();
      c.fillStyle = ok ? S.ink : S.muted;
      c.beginPath(); c.moveTo(x - w + 6.5, y + 10.5); c.lineTo(x - w + 10.5, y + 4.5); c.lineTo(x - w + 14.5, y + 10.5); c.closePath(); c.fill();
      c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(text, x - w + 17, y + h / 2 + 0.5);
      return w;
    }

    /** A box's header row: its progress on the left, its upgrade's price on the right (none at the top). */
    header(c, r, u, wallet, k, warn) {
      const S = this.sty, tw = u ? this.tag(c, r.x + r.w - 4, r.y + 4, u.cost, wallet >= u.cost) : 0;
      const x0 = r.x + 8, x1 = r.x + r.w - 8 - (tw ? tw + 2 : 0), y = r.y + 10.5;
      c.fillStyle = S.off; rr(c, x0, y, x1 - x0, 2, 1); c.fill();
      if (k > 0) { c.fillStyle = warn ? S.warn : S.ink; rr(c, x0, y, (x1 - x0) * clamp01(k), 2, 1); c.fill(); }
    }

    /** A spot not bought yet: dashed, with + and its price (the next one to buy only). */
    empty(c, r, u, wallet, next) {
      const S = this.sty, ok = next && u && wallet >= u.cost;
      c.save(); c.setLineDash([4, 4]); c.strokeStyle = S.line; c.lineWidth = 1 / this.K;
      rr(c, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 10); c.stroke(); c.restore();
      c.fillStyle = next ? (ok ? S.ink : S.muted) : S.off; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '600 22px ' + Render.FONT;
      c.fillText('+', r.x + r.w / 2, r.y + r.h / 2 - (next && u ? 7 : 0));
      if (next && u) { c.font = '650 12px ' + Render.FONT; c.fillText(L.fmtInt ? L.fmtInt(u.cost) : String(u.cost), r.x + r.w / 2, r.y + r.h / 2 + 12); }
      c.textAlign = 'left';
    }

    /** A conveyor along a sampled path: a track, and treads crossing it that run its way. */
    conveyor(c, path, width, run, gap) {
      const S = this.sty, n = path.length - 1;
      const trace = () => { c.beginPath(); c.moveTo(path[0][0], path[0][1]); for (let i = 3; i < n; i += 3) c.lineTo(path[i][0], path[i][1]); c.lineTo(path[n][0], path[n][1]); };
      c.lineCap = 'round'; c.lineJoin = 'round';
      trace(); c.strokeStyle = S.line; c.lineWidth = width + 2 / this.K; c.stroke();
      trace(); c.strokeStyle = S.track; c.lineWidth = width; c.stroke();
      const half = width / 2 - 2.5;
      c.strokeStyle = S.off; c.lineWidth = 1.2; c.lineCap = 'butt';
      c.beginPath();
      for (let s = run % gap; s < n; s += gap) {
        const [x, y] = at(path, s), [x2, y2] = at(path, s + 1);
        let nx = -(y2 - y), ny = x2 - x;
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        c.moveTo(x - nx * half, y - ny * half); c.lineTo(x + nx * half, y + ny * half);
      }
      c.stroke();
    }

    /** A chute between two parts: two short rails, dotted where the part below is not bought yet. */
    chute(c, x, y0, y1, on) {
      const S = this.sty;
      c.save(); c.strokeStyle = on ? S.line : S.off; c.lineWidth = 1 / this.K; if (!on) c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(x - 5, y0); c.lineTo(x - 5, y1); c.moveTo(x + 5, y0); c.lineTo(x + 5, y1); c.stroke(); c.restore();
    }

    // ---- a frame ------------------------------------------------------------------------------------------------------

    /**
     * Draws the floor. ctx: { wallet } (the price tags dim while it is short). Reduced motion: movers are drawn where the
     * model has them (no gliding between ticks), treads and chevrons stand still, and a cleared row does not flash.
     */
    render(dt, f, look, ctx) {
      const c = this.ctx, S = this.style(look.theme), reduced = this.reduced, wallet = ctx.wallet;
      this.t += dt; this.frames++;
      const k = reduced ? 1 : clamp01(f.acc / Factory.TICK_MS);
      const md = Factory.mood(f);
      if (!reduced) {
        this.tread.mino += dt * T.MINO_V / T.TICK;
        this.tread.belt += dt * (TR.BELT_LEN / 100) / T.BELT_T[f.beltSpeed];
        if (!this.stuck(md)) this.phase += dt * (2 + 8 * md.busy);
      }
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      c.setTransform(this.dpr * this.K, 0, 0, this.dpr * this.K, this.dpr * this.OX, this.dpr * this.OY);
      const up = (kind) => Factory.nextUpgrade(f, kind);
      this.drawDroppers(c, f, look, S, k, wallet, up);
      this.drawStore(c, f, look, S, k, wallet, up('store'));
      this.drawConveyors(c, f, look, S, k);
      this.drawSign(c, S, md);
      this.drawAssemblers(c, f, look, S, k, wallet, up);
      c.translate(0, this.E1);
      this.drawBelt(c, f, look, S, k, wallet, up('beltSpeed'));
      c.translate(0, this.E2);
      this.drawBoard(c, f, look, S, k);
      this.drawPaid(c, S);
      c.translate(0, -this.E1 - this.E2);
      this.drawMovers(c, f, look, S, k);
    }

    drawDroppers(c, f, look, S, k, wallet, up) {
      const dt = Factory.dropTicks(f), raw = this.raw(look);
      for (let j = 0; j < 3; j++) {
        const r = { x: G.drop.x[j], y: G.drop.y, w: G.drop.w, h: G.drop.h }, cx = Factory.dropCX(j);
        if (j >= f.droppers) { this.chute(c, cx, r.y + r.h, G.rail.y[0] - 6, false); this.empty(c, r, up('dropper'), wallet, j === f.droppers); continue; }
        const d = f.drops[j];
        this.chute(c, cx, r.y + r.h, G.rail.y[0] - 6, true);
        this.box(c, r);
        this.header(c, r, up('speed'), wallet, d.held ? 1 : (d.t + (d.t < dt ? k : 0)) / dt, d.held);
        // The hopper and its nozzle; a mino waiting in it while the spot below is taken.
        c.fillStyle = S.off; rr(c, cx - 15, r.y + HEAD + 3, 30, 12, 3); c.fill(); c.fillRect(cx - 4, r.y + HEAD + 15, 8, 5);
        if (d.held) this.mino(c, look, raw, cx, r.y + r.h - 8, MINO);
      }
    }

    drawStore(c, f, look, S, k, wallet, u) {
      const g = G.store, raw = this.raw(look), cap = Factory.storeCap(f), rows = Factory.storeRows(f), have = Factory.inStore(f), ps = G.pile.s;
      this.box(c, g);
      this.header(c, g, u, wallet, have / cap, have >= cap);
      // The doors where the conveyors meet its wall.
      c.fillStyle = S.track; for (const y of G.rail.y) c.fillRect(g.x - 1, y - 6, 3, 12);
      // The columns: rows bought from the bottom; the rest hatched, as whole rows.
      const x0 = G.pile.x, top = G.pile.bot - 14 * ps;
      for (let row = 0; row < 14; row++) {
        const y = G.pile.bot - (row + 1) * ps;
        if (row >= rows) {
          c.save(); rr(c, x0 + 1, y + 1, T.STORE_COLS * ps - 2, ps - 2, 2); c.clip();
          c.strokeStyle = S.off; c.lineWidth = 1.2; c.beginPath();
          for (let t = -12; t < T.STORE_COLS * ps; t += 4) { c.moveTo(x0 + t, y + ps); c.lineTo(x0 + t + 10, y); }
          c.stroke(); c.restore();
        }
      }
      // The rail along the top, over the columns, where minos cross to their column.
      c.fillStyle = S.off; c.fillRect(G.lift.x + 6, G.lift.top + MINO / 2 + 0.5, x0 + T.STORE_COLS * ps - G.lift.x - 6, 1);
      void top;
      for (let col = 0; col < T.STORE_COLS; col++) {
        const h = f.pile[col], x = Factory.colX(col), e = this.t - this.settling[col], drop = e < SETTLE ? (1 - ease(e / SETTLE)) * ps : 0;
        for (let i = 0; i < rows; i++) {
          const y = Factory.cellY(i);
          if (i < h) this.mino(c, look, raw, x, y - drop, ps);
          else { c.fillStyle = S.dot; rr(c, x - 2.5, y - 2.5, 5, 5, 1.5); c.fill(); }
        }
      }
    }

    drawConveyors(c, f, look, S, k) {
      this.conveyor(c, P.top, 10, this.tread.mino, 10);
      this.conveyor(c, P.low, 10, this.tread.mino, 10);
      const raw = this.raw(look);
      // The top conveyor's riders (falling into the store: in drawMovers).
      for (const m of f.top) {
        if (m.y > 0 || m.f > 0) continue;
        const s = lerp(m.ps, m.s, k);
        if (s <= TR.TOP_END) { const [x, y] = at(P.top, s); this.mino(c, look, raw, x, y, MINO); }
        else this.mino(c, look, raw, G.lift.x + 6 + (s - TR.TOP_END), G.lift.top, MINO);
      }
      // The lower conveyor's: out along the store's bottom, up the lift, and left over the assemblers.
      for (const m of f.out) {
        if (m.h > 0) continue;
        const s = lerp(m.ps, m.s, k);
        if (s < 0) this.mino(c, look, raw, G.lift.x - s, Factory.cellY(0), MINO);
        else { const [x, y] = at(P.low, s); this.mino(c, look, raw, x, y, MINO); }
      }
    }

    drawSign(c, S, md) {
      const g = G.sign, p = 5, ox = g.x + (g.w - SIGN_W * p) / 2 + p / 2, oy = g.y + (g.h - SIGN_H * p) / 2 + p / 2;
      const counting = this.counting, on = signDots(counting ? this.count : null, this.phase);
      this.box(c, g);
      const lit = counting ? S.ink : this.stuck(md) ? S.warn : S.good;
      for (let x = 0; x < SIGN_W; x++) for (let y = 0; y < SIGN_H; y++) {
        c.fillStyle = on[y][x] ? lit : S.off;
        c.beginPath(); c.arc(ox + x * p, oy + y * p, on[y][x] ? 1.7 : 1.1, 0, Math.PI * 2); c.fill();
      }
    }

    /** Where assembler k's i-th mino sits, its cells 10 units, the piece centred under the header. */
    bayCell(k, a, i) {
      const sh = Factory.shapes(a.n)[a.s], s = 10, cx = Factory.bayCX(k), cy = G.bay.y + HEAD + (G.bay.h - HEAD) / 2;
      const cell = sh[Math.min(sh.length - 1, i)];
      return [cx - (sh.w * s) / 2 + (cell[0] + 0.5) * s, cy - (sh.h * s) / 2 + (cell[1] + 0.5) * s];
    }

    drawAssemblers(c, f, look, S, k, wallet, up) {
      const raw = this.raw(look);
      for (let j = 0; j < 3; j++) {
        const r = { x: G.bay.x[j], y: G.bay.y, w: G.bay.w, h: G.bay.h }, cx = Factory.bayCX(j), on = j < f.asm.length;
        this.chute(c, cx, G.rail.y[1] + 6, r.y, on); this.chute(c, cx, r.y + r.h, G.belt.y[0] - 13 + this.E1, on);
        if (!on) { this.empty(c, r, up('assembler'), wallet, j === f.asm.length); continue; }
        const a = f.asm[j], prog = a.set === a.n ? 1 : (a.set + (a.set < a.got ? (a.t + k) / Factory.FEED_TT : 0)) / a.n;
        this.box(c, r);
        this.header(c, r, up('size'), wallet, prog, a.held);
        // Received minos grey; set ones in the piece's colour (no outline of what is to come).
        for (let i = 0; i < a.got; i++) { const [x, y] = this.bayCell(j, a, i); this.mino(c, look, i < a.set ? this.color(look, a.c) : raw, x, y, 10); }
      }
    }

    drawBelt(c, f, look, S, k, wallet, u) {
      this.conveyor(c, P.belt, 25, this.tread.belt, 14);
      this.chute(c, G.belt.x1, G.belt.y[3] + 13, G.board.y + this.E2, true);
      for (const it of f.belt) {
        if (it.f > 0) continue;
        const [x, y] = at(P.belt, lerp(it.pp, it.p, k) / 100);
        this.piece(c, look, it, x, y, BELT_CELL);
      }
      // Its price, inside its first loop.
      if (u) {
        c.font = '650 11px ' + Render.FONT;
        const w = c.measureText(L.fmtInt ? L.fmtInt(u.cost) : String(u.cost)).width + 21;
        this.tag(c, (G.belt.x0 + G.belt.start) / 2 + w / 2, G.belt.y[0] + G.belt.r - 7.5, u.cost, wallet >= u.cost);
      }
    }

    drawBoard(c, f, look, S, k) {
      const b = G.board, s = b.cell, W = T.BOARD_W, H = T.BOARD_H;
      this.box(c, b);
      c.strokeStyle = S.grid; c.lineWidth = 0.6; c.beginPath();
      for (let x = 1; x < W; x++) { c.moveTo(BX + x * s, BY); c.lineTo(BX + x * s, BY + H * s); }
      for (let y = 1; y < H; y++) { c.moveTo(BX, BY + y * s); c.lineTo(BX + W * s, BY + y * s); }
      c.stroke();
      // Full rows flash before they go (not under reduced motion).
      const clr = f.ct > 0 && f.clr ? f.clr : null, e = clr ? (T.TICK * (Factory.TRACK.CLEAR - f.ct) + k * T.TICK) / FLASH : 0;
      const flash = clr && !this.reduced ? 0.35 + 0.65 * Math.abs(Math.cos(e * Math.PI * 2.5)) : 1;
      for (let y = 0; y < H; y++) {
        const row = f.grid[y], hot = clr && clr.indexOf(y) >= 0;
        for (let x = 0; x < W; x++) {
          const cell = Factory.Board.cellOf(row[x]);
          if (!cell) continue;
          const cx = BX + (x + 0.5) * s, cy = BY + (y + 0.5) * s;
          if (hot && !this.reduced) { this.mino(c, look, this.color(look, cell.c), cx, cy, s, flash); c.globalAlpha = 0.5 * (1 - flash); c.fillStyle = S.fg; c.fillRect(cx - s / 2, cy - s / 2, s, s); c.globalAlpha = 1; }
          else this.mino(c, look, this.color(look, cell.c), cx, cy, s);
        }
      }
      // The piece in play, and a faint outline where it will land.
      const p = f.cur;
      if (p && !(p.in > 0)) {
        const rs = Factory.Board.turns(p.n, p.s), r = rs[p.r], g = Factory.Board.masks(f.grid), color = this.color(look, p.c);
        let gy = p.y;
        while (Factory.Board.fits(g, r, p.x, gy + 1)) gy++;
        c.strokeStyle = color; c.globalAlpha = 0.45; c.lineWidth = 1;
        for (const [x, y] of r.cells) { rr(c, BX + (p.x + x) * s + 1.5, BY + (gy + y) * s + 1.5, s - 3, s - 3, 2); c.stroke(); }
        c.globalAlpha = 1;
        const px = lerp(p.ox, p.x, ease(k)), py = lerp(p.oy, p.y, k);
        for (const [x, y] of r.cells) this.mino(c, look, color, BX + (px + x + 0.5) * s, BY + (py + y + 0.5) * s, s);
      }
    }

    /** Everything between two parts: minos dropping onto the conveyor, falling into the store, hopping into an
     *  assembler; pieces down the chutes to the belt and into the board. */
    drawMovers(c, f, look, S, k) {
      const raw = this.raw(look);
      for (const m of f.top) {
        if (m.f > 0) {
          // From the dropper's nozzle down onto the conveyor.
          const j = TR.DROP_S.indexOf(m.s), cx = j >= 0 ? Factory.dropCX(j) : at(P.top, m.s)[0], q = clamp01((TR.DROP_FALL - m.f + k) / TR.DROP_FALL);
          this.mino(c, look, raw, cx, lerp(G.drop.y + G.drop.h - 8, G.rail.y[0], ease(q)), MINO);
        } else if (m.y > 0) this.mino(c, look, raw, Factory.colX(m.c), lerp(m.py, m.y, k), G.pile.s);
      }
      // Into an assembler: down the chute from the conveyor to its place in the piece.
      const order = {};
      for (const m of f.out.filter((q) => q.h > 0).sort((a, b) => a.h - b.h)) {
        const a = f.asm[m.k];
        if (!a) continue;
        const i = a.got + (order[m.k] = (order[m.k] || 0) + 1) - 1, q = clamp01((TR.HOP - m.h + k) / TR.HOP);
        const cx = Factory.bayCX(m.k), [tx, ty] = this.bayCell(m.k, a, i), mid = G.bay.y + HEAD - 2;
        const d1 = mid - G.rail.y[1], d2 = Math.hypot(tx - cx, ty - mid), e = ease(q) * (d1 + d2);
        if (e < d1) this.mino(c, look, raw, cx, G.rail.y[1] + e, MINO);
        else { const w = d2 ? (e - d1) / d2 : 1; this.mino(c, look, raw, lerp(cx, tx, w), lerp(mid, ty, w), lerp(MINO, 10, w)); }
      }
      // A finished piece down the chute onto the belt.
      for (const it of f.belt) {
        if (!(it.f > 0)) continue;
        const cx = Factory.bayCX(it.k), y0 = G.bay.y + HEAD + (G.bay.h - HEAD) / 2, q = clamp01((TR.CHUTE - it.f + k) / TR.CHUTE);
        this.piece(c, look, it, cx, lerp(y0, G.belt.y[0] + this.E1, ease(q)), lerp(10, BELT_CELL, q));
      }
      // The belt's end, down the chute into the board, to its place at the top.
      const p = f.cur;
      if (p && p.in > 0) {
        const rs = Factory.Board.turns(p.n, p.s), r = rs[0], s = G.board.cell, sx = Math.min(T.BOARD_W - r.w, TR.SPAWN_X);
        const q = ease(clamp01((TR.ENTER - p.in + k) / TR.ENTER)), e = at(P.belt, TR.BELT_LEN / 100), end = [e[0], e[1] + this.E1];
        const dy = this.E1 + this.E2, tx = BX + (sx + r.w / 2) * s, ty = BY + dy + (r.h / 2) * s, mid = G.board.y + dy;
        const x = q < 0.5 ? end[0] : lerp(end[0], tx, (q - 0.5) * 2), y = q < 0.5 ? lerp(end[1], mid, q * 2) : lerp(mid, ty, (q - 0.5) * 2);
        this.piece(c, look, p, x, y, lerp(BELT_CELL, s, q));
      }
    }

    /** A line just paid: its pay rising softly over the board, then gone (not under reduced motion). */
    drawPaid(c, S) {
      if (this.reduced) { this.paid.length = 0; return; }
      this.paid = this.paid.filter((p) => this.t - p.t0 < 1.4);
      c.font = '650 12px ' + Render.FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const p of this.paid) {
        const e = (this.t - p.t0) / 1.4;
        c.globalAlpha = Math.min(1, 3 * (1 - e)); c.fillStyle = S.good;
        c.fillText('+' + (Math.round(p.pay * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }), G.board.x + G.board.w / 2, BY + (p.y + 0.5) * G.board.cell - 18 * ease(e));
      }
      c.globalAlpha = 1; c.textAlign = 'left';
    }
  }

  L.FloorView = FloorView;
  L.FactoryArt = { signDots, signText, SIGN_W, SIGN_H, PARTS, COUNT_S };
})(typeof globalThis !== 'undefined' ? globalThis : this);
