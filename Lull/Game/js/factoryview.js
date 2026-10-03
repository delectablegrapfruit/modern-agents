// Lull — the Factory floor, drawn like the board: on the board's own plate, in its materials and the player's mino
// skin and palette. As sketched: the two stages stacked on the left (the droppers over the assemblers), the store
// and the sign down the right, and the conveyor across the bottom, a serpentine of up to three runs ending at the
// drop-off. No words or numbers are drawn here. The sign is a small dot-matrix panel, a roadside sign in miniature:
// its pixel animations and colours tell how the line runs (smooth, working, full, idle) and nothing else; its name
// for a screen reader is on the page around it. The model moves in quarter-second ticks; everything that moves is
// drawn between where it was and where it is.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Render, Factory } = L;
  const { rr, rgba, mix } = Render;
  const T = Factory.TUNE;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;
  const cssVar = (k, dflt) => { try { return getComputedStyle(document.documentElement).getPropertyValue(k).trim() || dflt; } catch (e) { return dflt; } };

  // Motion, in seconds.
  const FALL = 0.35, SLIDE = 0.55;      // a dropped mino: down to the rail, then along it into the store
  const FEED = 0.5;                     // a mino from the store into an assembler
  const BUILD = 0.55;                   // a finished piece down the chute onto the conveyor's entry
  const PAY = 0.6;                      // a piece off the end of the belt into the drop-off
  const SIGN_FPS = 6;                   // the sign's frames a second

  // ---- the sign: a 16 × 7 dot matrix ---------------------------------------------------------------------------------

  const SIGN_W = 16, SIGN_H = 7;
  // Colours as on a real sign: amber by default, green when all is well, a warm red-orange when something is full.
  const LED = { amber: '#ffb238', green: '#7ee08a', warm: '#ff6a3d' };
  /** The sign's frame at step n for a mood: a list of [x, y, brightness 0–1] dots, and its colour. Still: one frame. */
  function signFrame(mood, n, still) {
    const dots = [];
    const on = (x, y, b) => { if (x >= 0 && x < SIGN_W && y >= 0 && y < SIGN_H) dots.push([x, y, b == null ? 1 : b]); };
    if (mood === 'smooth') {
      // Chevrons flowing to the right, one dot a frame.
      const s = still ? 0 : n % 6;
      for (let c = -6; c < SIGN_W + 6; c += 6) for (let i = 0; i < 4; i++) { on(c + s + i, 3 - (3 - i), 1); on(c + s + i, 3 + (3 - i), 1); }
      for (let c = -6; c < SIGN_W + 6; c += 6) on(c + s + 3, 3, 1);
      return { color: LED.green, dots };
    }
    if (mood === 'working') {
      // Dots marching along the middle row over a dim rail, one column every other frame.
      const s = still ? 0 : Math.floor(n / 2) % 4;
      for (let x = 0; x < SIGN_W; x++) on(x, 5, 0.25);
      for (let x = -4; x < SIGN_W + 4; x += 4) { on(x + s, 3, 1); on(x + s + 1, 3, 0.6); }
      return { color: LED.amber, dots };
    }
    if (mood === 'full') {
      // A full stack, blinking slowly.
      const lit = still || Math.floor(n / 4) % 2 === 0;
      for (let y = 1; y < 6; y++) for (let x = 3; x < 13; x++) on(x, y, lit ? (y === 1 ? 0.7 : 1) : 0.18);
      return { color: LED.warm, dots };
    }
    // Idle: a dim pause sign, blinking slowly.
    const b = still ? 0.5 : (Math.floor(n / 6) % 2 === 0 ? 0.5 : 0.15);
    for (let y = 1; y < 6; y++) { on(6, y, b); on(7, y, b); on(9, y, b); on(10, y, b); }
    return { color: LED.amber, dots };
  }

  // ---- the floor ------------------------------------------------------------------------------------------------------

  class FloorView {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.plate = canvas.closest ? canvas.closest('.fac-plate') : null;
      this.w = 1; this.h = 1; this.dpr = 1;
      this.t = 0; this.reduced = false;
      this.G = null;                                    // the scene's geometry (layout)
      this.flying = [];                                 // minos and pieces on their way: { kind, t0, … }
      this.built = new WeakMap();                       // belt piece → when it left its assembler
      this.signMood = 'working'; this.signJump = true; this.signNext = null; this.signSince = 0; this.signN = 0; this.signAcc = 0;
      this.dropAt = -9;                                 // the drop-off's last pay (its glow)
      this.tread = 0;                                   // how far the belt's treads have run, CSS px
      this.sty = null; this.styTheme = null;
      this.preview = false;                             // Collect is hovered or focused
      this.frames = 0;
    }

    // ---- layout -----------------------------------------------------------------------------------------------------

    resize(w, h) {
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      if (w === this.w && h === this.h && dpr === this.dpr && this.G) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.G = null;
    }

    /** Snaps a CSS length to whole device pixels. */
    px(v) { return Math.round(v * this.dpr) / this.dpr; }

    /** Where everything sits, in CSS px, for this size and this factory's conveyor length. */
    layout(f) {
      const key = this.w + 'x' + this.h + '@' + this.dpr + ':' + f.beltLen;
      if (this.G && this.G.key === key) return this.G;
      const W = this.w, H = this.h, px = (v) => this.px(v), pad = W < 360 ? 7 : 9, gap = W < 360 ? 6 : 8;
      const RW = px(Math.max(80, Math.min(150, W * 0.28)));
      const LW = W - 2 * pad - gap - RW;
      // The conveyor: three rows; a run's slots are wide enough for a pentomino lying flat.
      const rowH = px(Math.max(24, Math.min(54, H * 0.085))), rowGap = px(Math.max(6, rowH * 0.3));
      const turn = Math.ceil(rowH + rowGap / 2) + 1;
      const x0 = pad + turn, x1 = W - pad - turn;
      const dropW = px(Math.max(46, RW * 0.62));
      const x3 = W - pad - dropW - gap - rowH / 2;
      const p1 = (x1 - x0) / T.RUN, p3 = (x3 - x0) / T.RUN;
      const c = Math.max(3, Math.floor(Math.min(p3 / 5.4, (rowH - 8) / 3) * this.dpr) / this.dpr);
      const CH = 3 * rowH + 2 * rowGap;
      const cy = H - pad - CH;
      const rows = [0, 1, 2].map((r) => cy + r * (rowH + rowGap) + rowH / 2);
      // The upper part: the stages on the left, the store and the sign on the right.
      const top = pad, bottom = cy - gap - Math.max(8, rowGap), UH = bottom - top;
      const h1 = px(UH * 0.36), s1 = { x: pad, y: top, w: LW, h: h1 }, s2 = { x: pad, y: top + h1 + gap, w: LW, h: UH - h1 - gap };
      const dp = Math.max(2, Math.floor(((RW - 10) / SIGN_W) * this.dpr) / this.dpr);
      const signW = dp * SIGN_W + 10, signH = dp * SIGN_H + 10;
      const rx = pad + LW + gap;
      const sign = { x: px(rx + (RW - signW) / 2), y: px(bottom - signH), w: signW, h: signH, dp };
      const store = { x: rx, y: top, w: RW, h: sign.y - gap - top };
      const dx = px(x3 + rowH / 2 + gap), drop = { x: dx, y: rows[2] - rowH / 2 - 2, w: W - pad - dx, h: rowH + 4 };
      // Machines: three of each across their stage.
      const slotW = LW / 3;
      const droppers = [0, 1, 2].map((j) => ({ x: s1.x + slotW * j, w: slotW, cx: px(s1.x + slotW * (j + 0.5)) }));
      const ac = Math.max(3, Math.floor(Math.min((slotW - 14) / 5, (s2.h - 18) / 3.4, 20) * this.dpr) / this.dpr);
      const asm = [0, 1, 2].map((k) => {
        const fw = ac * 5 + 10, fh = ac * 3 + 10, cx = s2.x + slotW * (k + 0.5);
        return { x: px(cx - fw / 2), y: px(s2.y + (s2.h - fh) / 2 + 2), w: fw, h: fh, c: ac };
      });
      // The slots along the belt, by its length: the last run alone; half of the first two then the last; all three.
      const slots = [];
      const run = (r, n, from, pitch, dir) => { for (let i = 0; i < n; i++) slots.push({ x: dir > 0 ? from + (i + 0.5) * pitch : from - (i + 0.5) * pitch, y: rows[r] }); };
      const len = Factory.beltLen(f), half = T.RUN / 2;
      if (len === T.RUN) run(2, T.RUN, x0, p3, 1);
      else if (len === 2 * T.RUN) { run(0, half, x0, p1, 1); run(1, half, x0 + half * p1, p1, -1); run(2, T.RUN, x0, p3, 1); }
      else { run(0, T.RUN, x0, p1, 1); run(1, T.RUN, x1, p1, -1); run(2, T.RUN, x0, p3, 1); }
      const entry = slots[0];
      this.G = { lvl: f.beltLen, key, W, H, pad, gap, RW, LW, x0, x1, x3, p1, p3, rows, rowH, rowGap, c, s1, s2, store, sign, drop, droppers, asm, slots, entry, len, turn };
      return this.G;
    }

    /** A part's rect (CSS px), for the hotspots: the store, the sign. */
    rect(kind, f) {
      const G = this.layout(f);
      if (kind === 'store') return Object.assign({}, G.store);
      if (kind === 'sign') return { x: G.sign.x, y: G.sign.y, w: G.sign.w, h: G.sign.h };
      if (kind === 'drop') return Object.assign({}, G.drop);
      return { x: 0, y: 0, w: 0, h: 0 };
    }

    /** A layout key: hotspots move only when it changes. */
    layoutKey(f) { return this.layout(f).key; }

    // ---- the store's grid ---------------------------------------------------------------------------------------------

    storeGrid(f) {
      const G = this.layout(f), cap = Factory.storeCap(f), st = G.store, inner = { w: st.w - 12, h: st.h - 12 };
      let best = null;
      for (let cols = 3; cols <= 8; cols++) {
        const rows = Math.ceil(cap / cols), s = Math.floor(Math.min(inner.w / cols, inner.h / rows, 16) * this.dpr) / this.dpr;
        if (!best || s > best.s) best = { cols, rows, s };
      }
      const gw = best.cols * best.s, gh = best.rows * best.s;
      best.x = this.px(st.x + (st.w - gw) / 2); best.y = this.px(st.y + st.h - 6 - gh); best.bottom = best.y + gh;
      return best;
    }
    storeCell(g, i) { return { x: g.x + (i % g.cols) * g.s, y: g.bottom - (Math.floor(i / g.cols) + 1) * g.s }; }

    // ---- events -------------------------------------------------------------------------------------------------------

    /** What the model did this frame, turned into motion. */
    events(evs, f, reduced) {
      this.reduced = reduced;
      if (reduced) { this.flying.length = 0; return; }
      for (const e of evs) {
        if (e.kind === 'drop') this.flying.push({ kind: 'drop', j: e.j, t0: this.t });
        else if (e.kind === 'feed') this.flying.push({ kind: 'feed', k: e.k, t0: this.t, i: f.asm[e.k] ? f.asm[e.k].got - 1 : 0, from: f.store });
        else if (e.kind === 'build') this.built.set(e.item, { t0: this.t, k: e.k });
        else if (e.kind === 'pay') { this.flying.push({ kind: 'pay', item: e.item, t0: this.t }); this.dropAt = this.t; }
      }
      if (this.flying.length > 60) this.flying.splice(0, this.flying.length - 60);
    }

    /** Minos still on their way into the store (drawn on the way, not in it yet). */
    inbound() { let n = 0; for (const a of this.flying) if (a.kind === 'drop') n++; return n; }

    /** Everything on its way lands at once (a tab change, a collect, time away). */
    settle() { this.flying.length = 0; this.built = new WeakMap(); this.signJump = true; }

    // ---- the sign -----------------------------------------------------------------------------------------------------

    /** The sign's mood, held a moment so a passing state (a feed between two minos) never makes it flicker. */
    updateSign(f, dt) {
      const m = Factory.mood(f).mood;
      if (this.signJump) { this.signJump = false; this.signMood = m; this.signNext = null; }
      else if (m === this.signMood) this.signNext = null;
      else if (this.signNext !== m) { this.signNext = m; this.signSince = this.t; }
      else if (this.t - this.signSince >= 1.2 || this.reduced) { this.signMood = m; this.signNext = null; this.signN = 0; }
      this.signAcc += dt;
      while (this.signAcc >= 1 / SIGN_FPS) { this.signAcc -= 1 / SIGN_FPS; this.signN++; }
      return this.signMood;
    }

    // ---- materials ----------------------------------------------------------------------------------------------------

    style(th) {
      if (th === this.styTheme && this.sty) return this.sty;
      this.styTheme = th;
      const light = th.name === 'light';
      const fg = th.fg || (light ? '#1a2030' : '#eceff5');
      this.sty = {
        light, fg, accent: th.accent || '#6aa9ff', warn: cssVar('--warn', light ? '#b8741a' : '#f2c27d'),
        top: light ? '#fcfdfe' : 'rgba(255,255,255,0.075)', bot: light ? '#e9edf3' : 'rgba(255,255,255,0.035)',
        hair: light ? 'rgba(22,32,60,0.24)' : (th.plateLine || 'rgba(255,255,255,0.085)'), hi: th.plateHi || 'rgba(255,255,255,0.16)',
        well0: th.wellTop || th.well || (light ? '#eef1f6' : '#11141b'), well1: th.wellBottom || th.well || (light ? '#e6eaf1' : '#0d1016'),
        rim: th.rim || th.line || 'rgba(255,255,255,0.1)', shade: th.innerShade || 'rgba(0,0,0,0.3)',
        ink: rgba(fg, light ? 0.24 : 0.17), ink2: rgba(fg, light ? 0.12 : 0.08), ink3: rgba(fg, light ? 0.4 : 0.32),
        slot: light ? 'rgba(22,32,60,0.07)' : 'rgba(255,255,255,0.045)',
        band: light ? 'rgba(22,32,60,0.08)' : 'rgba(255,255,255,0.06)',
        ghost: light ? 'rgba(22,32,60,0.05)' : 'rgba(255,255,255,0.035)', beltTop: light ? '#dfe4ec' : 'rgba(255,255,255,0.025)',
        housing: '#15181d', housingLine: light ? 'rgba(22,32,60,0.45)' : 'rgba(255,255,255,0.12)',
      };
      return this.sty;
    }

    raised(c, x, y, w, h, r) {
      const S = this.sty;
      if (w <= 0 || h <= 0) return;
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, S.top); g.addColorStop(1, S.bot);
      c.fillStyle = g; rr(c, x, y, w, h, r); c.fill();
      c.save(); rr(c, x, y, w, h, r); c.clip(); c.fillStyle = S.hi; c.fillRect(x, y, w, 1); c.restore();
      c.strokeStyle = S.hair; c.lineWidth = 1; rr(c, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, r - 0.5)); c.stroke();
    }

    recessed(c, x, y, w, h, r) {
      const S = this.sty;
      if (w <= 0 || h <= 0) return;
      c.save(); rr(c, x, y, w, h, r); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, S.well0); g.addColorStop(1, S.well1);
      c.fillStyle = g; c.fillRect(x, y, w, h);
      const sh = c.createLinearGradient(0, y, 0, y + 6);
      sh.addColorStop(0, S.shade); sh.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sh; c.fillRect(x, y, w, 6);
      c.restore();
      c.strokeStyle = S.rim; c.lineWidth = 1; rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
    }

    dashed(c, x, y, w, h, r, alpha) {
      c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.setLineDash([3, 3]); c.strokeStyle = this.sty.ink; c.lineWidth = 1;
      rr(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke(); c.restore();
    }

    /** One mino in the skin (a flat square under 6 device px). */
    mino(c, look, color, x, y, s, alpha) {
      const d = this.dpr;
      x = this.px(x); y = this.px(y);
      if (alpha != null && alpha < 1) c.globalAlpha = Math.max(0, alpha);
      if (Math.round(s * d) >= 6) c.drawImage(Render.cellSprite(look.skin, color, s * d, this.sty.light), x, y, s, s);
      else { c.fillStyle = color; c.fillRect(x, y + 1 / d, s - 1 / d, s - 1 / d); }
      if (alpha != null && alpha < 1) c.globalAlpha = 1;
    }

    dropMino(G) { return Math.max(4, Math.min(20, Math.floor(G.s1.h * 0.17))); }
    hopperH(G) { return this.px(Math.max(10, Math.min(40, G.s1.h * 0.26))); }

    raw(look) { return look.colors[T.RAW] || look.theme.muted || '#8d99ae'; }

    /** A piece lying flat, centred on (cx, cy), its cells s wide. */
    piece(c, look, it, cx, cy, s, alpha) {
      const cells = Factory.shapes(it.n)[it.s], w = cells.w, h = cells.h, color = look.colors[it.c] || look.colors[1];
      const x0 = cx - (w * s) / 2, y0 = cy - (h * s) / 2;
      for (const [x, y] of cells) this.mino(c, look, color, x0 + x * s, y0 + (h - 1 - y) * s, s, alpha);
    }

    // ---- a frame ------------------------------------------------------------------------------------------------------

    render(dt, f, look) {
      const c = this.ctx, S = this.style(look.theme), G = this.layout(f), reduced = this.reduced;
      this.t += dt; this.frames++;
      const k = reduced ? 1 : clamp01((f.bt + f.acc / Factory.TICK_MS) / Factory.beltTicks(f));
      if (!reduced && f.moved) this.tread = (this.tread + dt * G.p1 / T.BELT_T[f.beltSpeed]) % 1000;
      this.flying = this.flying.filter((a) => this.t - a.t0 < (a.kind === 'drop' ? FALL + SLIDE : a.kind === 'feed' ? FEED : PAY));
      const mood = Factory.mood(f);
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.w, this.h);
      this.drawStage1(c, f, look, G, S, mood);
      this.drawStage2(c, f, look, G, S, mood);
      this.drawStore(c, f, look, G, S, mood);
      this.drawBelt(c, f, look, G, S, k);
      this.drawDrop(c, G, S);
      this.drawFlying(c, f, look, G);
      this.drawSign(c, f, G, S, dt);
    }

    drawStage1(c, f, look, G, S) {
      const s1 = G.s1, r = Math.min(10, G.c * 1.2 + 4);
      this.recessed(c, s1.x, s1.y, s1.w, s1.h, r);
      // The rail along the stage's floor, out through its right side to the store.
      const railY = this.px(s1.y + s1.h - 8);
      c.fillStyle = S.ink2; c.fillRect(s1.x + 6, railY, G.store.x - s1.x - 6, 2);
      const raw = this.raw(look), dt = Factory.dropTicks(f), ms = this.dropMino(G);
      for (let j = 0; j < 3; j++) {
        const D = G.droppers[j], hw = this.px(Math.min(D.w * 0.42, 34)), hh = this.px(Math.max(10, s1.h * 0.24));
        const hx = this.px(D.cx - hw / 2), hy = this.px(s1.y + 6);
        if (j >= f.droppers) { this.dashed(c, hx, hy, hw, hh, 4, j === f.droppers ? 0.9 : 0.45); continue; }
        const d = f.drops[j], paused = d.held;
        c.globalAlpha = paused ? 0.55 : 1;
        this.raised(c, hx, hy, hw, hh, 4);
        // The nozzle, and the next mino growing under it.
        const nw = this.px(Math.max(6, ms * 0.9));
        c.fillStyle = S.ink3; c.fillRect(this.px(D.cx - nw / 2), hy + hh, nw, 2);
        c.globalAlpha = 1;
        const grow = paused ? 1 : this.reduced ? 1 : clamp01((d.t + f.acc / Factory.TICK_MS) / dt);
        const s = this.px(ms * (0.35 + 0.65 * grow));
        this.mino(c, look, raw, D.cx - s / 2, hy + hh + 3, s, paused ? 0.5 : 0.35 + 0.65 * grow);
      }
    }

    drawStage2(c, f, look, G, S, mood) {
      const s2 = G.s2, r = Math.min(10, G.c * 1.2 + 4);
      this.recessed(c, s2.x, s2.y, s2.w, s2.h, r);
      // The feed rail from the store along the stage's top.
      c.fillStyle = S.ink2; c.fillRect(s2.x + 6, this.px(s2.y + 6), G.store.x - s2.x - 6, 2);
      // The chute down the left to the conveyor's entry.
      const e = G.entry, cx = this.px(Math.min(e.x, s2.x + 10));
      c.fillStyle = S.ink2; c.fillRect(cx - 1, s2.y + s2.h, 2, e.y - G.rowH / 2 - s2.y - s2.h);
      for (let k = 0; k < 3; k++) {
        const A = G.asm[k];
        if (k >= f.asm.length) { this.dashed(c, A.x, A.y, A.w, A.h, 5, k === f.asm.length ? 0.9 : 0.45); continue; }
        const a = f.asm[k], cells = Factory.shapes(a.n)[a.s], s = A.c, starved = a.got < a.n && a.t >= Factory.FEED_TT && f.store === 0;
        const idle = a.held || starved;
        c.globalAlpha = idle ? 0.55 : 1;
        this.raised(c, A.x, A.y, A.w, A.h, 5);
        c.globalAlpha = 1;
        const x0 = A.x + (A.w - cells.w * s) / 2, y0 = A.y + (A.h - cells.h * s) / 2, color = look.colors[a.c] || look.colors[1];
        // Feeding: the minos landing now are drawn in flight, not yet in place.
        const landing = this.flying.filter((fl) => fl.kind === 'feed' && fl.k === k).length;
        cells.forEach(([x, y], i) => {
          const px = this.px(x0 + x * s), py = this.px(y0 + (cells.h - 1 - y) * s);
          if (i < a.got - landing) this.mino(c, look, color, px, py, s, idle ? 0.5 : 1);
          else { c.fillStyle = S.slot; c.fillRect(px + 0.5, py + 0.5, s - 1, s - 1); }
        });
        // Finishing: a soft glow under a whole piece while it sets.
        if (a.got === a.n && !a.held && !this.reduced) {
          const g = clamp01(a.t / Factory.SET_TT);
          c.save(); c.globalAlpha = 0.25 * Math.sin(Math.PI * g); c.strokeStyle = S.accent; c.lineWidth = 2;
          rr(c, A.x + 1, A.y + 1, A.w - 2, A.h - 2, 4); c.stroke(); c.restore();
        }
      }
      void mood;
    }

    drawStore(c, f, look, G, S, mood) {
      const st = G.store, g = this.storeGrid(f), cap = Factory.storeCap(f), raw = this.raw(look);
      this.recessed(c, st.x, st.y, st.w, st.h, 8);
      const shown = Math.max(0, f.store - this.inbound());
      for (let i = 0; i < cap; i++) {
        const p = this.storeCell(g, i), s = g.s;
        if (i < shown) this.mino(c, look, raw, p.x, p.y, s, this.preview && i < Math.floor(f.store / T.MPL) * T.MPL ? 0.55 : 1);
        else { c.fillStyle = S.slot; c.fillRect(this.px(p.x + 1), this.px(p.y + 1), s - 2, s - 2); }
      }
      // Full: the store's rim warms, so the paused droppers read at a glance.
      if (mood.storeFull) {
        c.save(); c.strokeStyle = rgba(S.warn.startsWith('#') ? S.warn : '#f2c27d', 0.8); c.lineWidth = 2;
        rr(c, st.x + 1, st.y + 1, st.w - 2, st.h - 2, 7); c.stroke(); c.restore();
      }
    }

    /** The serpentine: built runs as belts with treads, the rest dashed; the pieces on it, between slots. */
    drawBelt(c, f, look, G, S, k) {
      const len = G.len, rowH = G.rowH, x0 = G.x0, x1 = G.x1, xm = x0 + (T.RUN / 2) * G.p1, [y0, y1, y2] = G.rows;
      // The serpentine as one path (its U-turns half circles), stroked thick: a ghost of the whole belt, then the built
      // part as a belt in the well's material with a rim.
      const path = (lv) => {
        c.beginPath();
        if (lv === 0) { c.moveTo(x0, y2); c.lineTo(G.x3, y2); return; }
        const xe = lv === 1 ? xm : x1, r1 = (y1 - y0) / 2, r2 = (y2 - y1) / 2;
        c.moveTo(x0, y0); c.lineTo(xe, y0); c.arc(xe, y0 + r1, r1, -Math.PI / 2, Math.PI / 2); c.lineTo(x0, y1);
        c.arc(x0, y1 + r2, r2, -Math.PI / 2, Math.PI / 2, true); c.lineTo(G.x3, y2);
      };
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (G.lvl < 2) { path(2); c.strokeStyle = S.ghost; c.lineWidth = rowH; c.stroke(); }
      path(G.lvl); c.strokeStyle = S.rim; c.lineWidth = rowH; c.stroke();
      c.strokeStyle = S.well1; c.lineWidth = rowH - 2; c.stroke();
      c.strokeStyle = S.beltTop; c.lineWidth = rowH - 8; c.stroke();
      c.restore();
      // Treads: faint ticks across the straight runs that slide while the belt moves.
      c.fillStyle = S.band;
      const pitch = Math.max(6, G.p1 / 4), off = this.tread % pitch;
      const ticks = (from, to, y, dir) => {
        for (let x = from + (dir > 0 ? off : pitch - off); x < to; x += pitch) c.fillRect(this.px(x), this.px(y - rowH / 2 + 4), 1, rowH - 8);
      };
      if (G.lvl === 2) { ticks(x0, x1, y0, 1); ticks(x0, x1, y1, -1); }
      else if (G.lvl === 1) { ticks(x0, xm, y0, 1); ticks(x0, xm, y1, -1); }
      ticks(x0, G.x3, y2, 1);
      // The entry: a small hopper mouth over the first slot.
      const e = G.entry;
      c.fillStyle = S.ink3; c.fillRect(this.px(e.x - G.c * 1.5), this.px(e.y - rowH / 2 - 2), this.px(G.c * 3), 2);
      // The pieces.
      for (const it of f.belt) {
        const a = G.slots[Math.min(len - 1, it.pp)], b = G.slots[Math.min(len - 1, it.p)];
        let x = lerp(a.x, b.x, easeInOut(k)), y = lerp(a.y, b.y, easeInOut(k));
        const born = this.built.get(it);
        if (born && !this.reduced) {
          const e2 = clamp01((this.t - born.t0) / BUILD), A = G.asm[born.k];
          if (e2 < 1) { const q = easeOut(e2); x = lerp(A.x + A.w / 2, x, q); y = lerp(A.y + A.h / 2, y, q); }
          else this.built.delete(it);
        }
        this.piece(c, look, it, x, y, G.c);
      }
    }

    drawDrop(c, G, S) {
      const d = G.drop;
      this.raised(c, d.x, d.y, d.w, d.h, 6);
      // Its mouth, and a soft glow as a piece pays.
      c.fillStyle = S.ink2; c.fillRect(this.px(d.x + 5), this.px(d.y + d.h / 2 - 1), this.px(d.w - 10), 2);
      const g = this.reduced ? 0 : clamp01(1 - (this.t - this.dropAt) / 0.9);
      if (g > 0) {
        c.save(); c.globalAlpha = 0.5 * g; c.strokeStyle = S.accent; c.lineWidth = 2;
        rr(c, d.x + 1, d.y + 1, d.w - 2, d.h - 2, 5); c.stroke(); c.restore();
      }
    }

    drawFlying(c, f, look, G) {
      const raw = this.raw(look), s1 = G.s1, s2 = G.s2, g = this.storeGrid(f);
      for (const a of this.flying) {
        const e = this.t - a.t0;
        if (a.kind === 'drop') {
          const D = G.droppers[a.j], ms = this.dropMino(G), railY = s1.y + s1.h - 8 - ms;
          const hy = s1.y + 6 + this.hopperH(G) + 3;
          if (!D) continue;
          if (e < FALL) this.mino(c, look, raw, D.cx - ms / 2, lerp(hy, railY, easeOut(e / FALL) * (e / FALL)), ms);
          else {
            const q = easeInOut(clamp01((e - FALL) / SLIDE)), to = this.storeCell(g, Math.max(0, f.store - 1));
            const x = lerp(D.cx - ms / 2, G.store.x + 4, Math.min(1, q * 1.15));
            const y = q < 0.87 ? railY : lerp(railY, to.y, (q - 0.87) / 0.13);
            this.mino(c, look, raw, x, y, q > 0.87 ? g.s : ms);
          }
        } else if (a.kind === 'feed') {
          const A = G.asm[a.k], asm = f.asm[a.k];
          if (!A || !asm) continue;
          const cells = Factory.shapes(asm.n)[asm.s], cell = cells[Math.min(cells.length - 1, a.i)] || [0, 0], s = A.c;
          const tx = A.x + (A.w - cells.w * s) / 2 + cell[0] * s, ty = A.y + (A.h - cells.h * s) / 2 + (cells.h - 1 - cell[1]) * s;
          const q = easeInOut(clamp01(e / FEED)), from = { x: G.store.x + 4, y: s2.y + 2 };
          const color = q > 0.8 ? (look.colors[asm.c] || raw) : raw;
          this.mino(c, look, color, lerp(from.x, tx, q), lerp(from.y, ty, q) - Math.sin(Math.PI * q) * 6, s);
        } else if (a.kind === 'pay') {
          const end = G.slots[G.len - 1], d = G.drop, q = clamp01(e / PAY);
          this.piece(c, look, a.item, lerp(end.x, d.x + d.w / 2, easeOut(q)), end.y, G.c * (1 - 0.4 * q), 1 - q);
        }
      }
    }

    /** The sign: a dark housing, its unlit dots faint, the lit ones round and in whole device pixels. */
    drawSign(c, f, G, S, dt) {
      const sg = G.sign, dp = sg.dp, mood = this.updateSign(f, dt);
      c.fillStyle = S.housing; rr(c, sg.x, sg.y, sg.w, sg.h, 4); c.fill();
      c.strokeStyle = S.housingLine; c.lineWidth = 1; rr(c, sg.x + 0.5, sg.y + 0.5, sg.w - 1, sg.h - 1, 3.5); c.stroke();
      const fr = signFrame(mood, this.signN, this.reduced), x0 = sg.x + 5, y0 = sg.y + 5, r = Math.max(0.6, dp * 0.36);
      const lit = new Map();
      for (const [x, y, b] of fr.dots) lit.set(y * SIGN_W + x, b);
      for (let y = 0; y < SIGN_H; y++) for (let x = 0; x < SIGN_W; x++) {
        const b = lit.get(y * SIGN_W + x) || 0, cx = this.px(x0 + x * dp + dp / 2), cy = this.px(y0 + y * dp + dp / 2);
        c.fillStyle = b > 0 ? mix('#2a2420', fr.color, 0.25 + 0.75 * b) : 'rgba(255,255,255,0.07)';
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
      }
    }
  }

  /** A shape on its own little canvas (Stats): delivered ones in the skin, the rest a quiet fill. */
  function shapeCanvas(look, cells, size, color, made, quiet) {
    const cv = document.createElement('canvas');
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__dpr = dpr; ctx.__light = look.theme.name === 'light';
    const b = L.Pieces.boundsOf(cells), s = Math.max(2, Math.floor(Math.min((size - 4) / b.w, (size - 4) / b.h, 11)));
    const ox = Math.round((size - b.w * s) / 2), oy = Math.round((size - b.h * s) / 2);
    const fill = rgba(look.theme.muted || '#9aa1ae', quiet == null ? 0.22 : quiet);
    for (const [x, y] of cells) {
      const px = ox + (x - b.minX) * s, py = oy + (b.maxY - y) * s;
      if (made) Render.drawCell(ctx, look.skin, color, px, py, s);
      else { ctx.fillStyle = fill; rr(ctx, px + 0.5, py + 0.5, s - 1, s - 1, Math.min(2, s * 0.2)); ctx.fill(); }
    }
    return cv;
  }

  L.FloorView = FloorView;
  L.FactoryArt = { shapeCanvas, signFrame, SIGN_W, SIGN_H, LED };
})(typeof globalThis !== 'undefined' ? globalThis : this);
