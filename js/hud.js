// Heads-up display on a 2D canvas laid over the WebGL one: score and multiplier top left, reserve ships and
// bombs top centre, high score top right, floating score popups and the crosshair, all in one glowing green.
// Also a 2D adapter so the enemy drawing code can paint the menu icons.
'use strict';
(function () {
  const GW = window.GW;
  const { clamp, css, fmt, TAU } = GW;
  const FONT = "'Orbitron', 'Eurostile', 'Segoe UI', 'Trebuchet MS', sans-serif";
  const HUD_GREEN = '#8DFF4A';
  const HUD_GLOW = '#2BFF2B';
  const POP_FILL = '#FFF04A';
  const POP_GLOW = '#FFB000';

  // Lets draw(e, R, ...) code target a CanvasRenderingContext2D.
  function adapter(ctx, lineScale = 1) {
    return {
      line(x1, y1, x2, y2, w, r, g, b) {
        const m = Math.max(r, g, b, 0.0001);
        const k = Math.min(1, m);
        ctx.strokeStyle = `rgba(${Math.round((r / m) * 255)},${Math.round((g / m) * 255)},${Math.round((b / m) * 255)},${k})`;
        ctx.lineWidth = w * lineScale;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      },
      circle: GW.Renderer.prototype.circle,
    };
  }

  // Collects GW.poly / circle output into the current path (joined where segments meet) so a whole row of
  // icons is stroked in one call per pass.
  function pathAdapter(ctx) {
    let lx = NaN, ly = NaN;
    return {
      reset() { lx = ly = NaN; },
      line(x1, y1, x2, y2) {
        if (!(Math.abs(x1 - lx) < 0.01 && Math.abs(y1 - ly) < 0.01)) ctx.moveTo(x1, y1); // NaN after reset() -> move
        ctx.lineTo(x2, y2);
        lx = x2; ly = y2;
      },
      circle: GW.Renderer.prototype.circle,
    };
  }

  // Bounding box of an outline in its own units (+x forward), cached per array.
  let bbFor = null, bb = null;
  function shipBox() {
    const pts = GW.SHIP;
    if (pts !== bbFor) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      bb = { x0, x1, y0, y1, w: y1 - y0 || 1, l: x1 - x0 || 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
      bbFor = pts;
    }
    return bb;
  }

  // Paints one enemy type into a small canvas for the How to Play screen.
  GW.drawEnemyIcon = function (canvas, type, size = 64) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = size * dpr;
    canvas.style.width = canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    const e = GW.makeEnemy(type, 0, 0);
    const d = e.def;
    e.spawn = 0;
    e.t = 12;
    e.angle = type === 'repulsor' ? -Math.PI / 2 : type === 'snake' ? -0.5 : 0.35;
    if (type === 'snake' && e.segs) {
      // A gently curving tail trailing down-left, segments exactly 14 px apart.
      const n = Math.min(8, e.segs.length >> 1);
      let x = 0, y = 0;
      for (let s = 0; s < n; s++) {
        const a = e.angle + 0.35 * Math.sin((s + 1) * 0.8);
        x -= Math.cos(a) * 14;
        y -= Math.sin(a) * 14;
        e.segs[s * 2] = x;
        e.segs[s * 2 + 1] = y;
      }
      e.len = n;
    }
    if (type === 'blackhole') e.active = true;
    if (type === 'mayfly') e.ph = 1.2;
    const extent = type === 'snake' ? 70 : type === 'blackhole' ? 44 : e.r * 1.9;
    const s = (size * dpr * 0.42) / extent;
    ctx.translate(size * dpr * (type === 'snake' ? 0.66 : 0.5), size * dpr * (type === 'snake' ? 0.32 : 0.5));
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = css(d.col);
    ctx.shadowBlur = 10 * dpr;
    d.draw(e, adapter(ctx, 1), 1, 1, null);
  };

  class HUD {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1;
      this.w = 1280;
      this.h = 720;
      this.visible = true;
      this.cap = 0.72; // Orbitron cap height / em; re-measured once the font has loaded
      this.path = pathAdapter(this.ctx);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.measure());
    }

    resize(cssW, cssH) {
      this.dpr = Math.min(2, devicePixelRatio || 1);
      this.w = cssW;
      this.h = cssH;
      this.c.width = Math.round(cssW * this.dpr);
      this.c.height = Math.round(cssH * this.dpr);
      this.measure();
    }

    measure() {
      const ctx = this.ctx;
      ctx.font = `600 100px ${FONT}`;
      const m = ctx.measureText('H');
      if (m.actualBoundingBoxAscent > 30 && m.actualBoundingBoxAscent < 100) this.cap = m.actualBoundingBoxAscent / 100;
    }

    // Draws fn() twice: a half-strength pass that carries the green glow, then the sharp core on top.
    // The glow pass is drawn source-over: Chrome renders a shadowed draw under any other composite mode through
    // two full-canvas offscreen layers per call, which made the HUD cost hundreds of times more to raster. The
    // core pass (no shadow) is added with 'lighter' on top.
    twice(fn, alpha = 1, glow = HUD_GLOW) {
      const ctx = this.ctx;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = glow;
      ctx.shadowBlur = 0.6 * this.u * this.dpr;
      ctx.globalAlpha = 0.5 * alpha;
      fn();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;
      fn();
    }

    // Plain text on the alphabetic baseline; returns its width.
    text(str, x, y, size, color, weight = 600, align = 'left') {
      const ctx = this.ctx;
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      return ctx.measureText(str).width;
    }

    measureSc(str, size, weight = 500) {
      const ctx = this.ctx;
      let w = 0;
      for (const [s, big] of this.scRuns(str)) {
        ctx.font = `${weight} ${big ? size : size * 0.78}px ${FONT}`;
        w += ctx.measureText(s).width;
      }
      return w;
    }

    // Capital plus small caps ("Score"): the first letter of each word at `size`, the rest upper-cased at
    // 0.78 size, all on the alphabetic baseline y. Returns the width.
    scText(str, x, y, size, color = HUD_GREEN, align = 'left', weight = 500) {
      const ctx = this.ctx;
      const total = this.measureSc(str, size, weight);
      let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      for (const [s, big] of this.scRuns(str)) {
        ctx.font = `${weight} ${big ? size : size * 0.78}px ${FONT}`;
        ctx.fillText(s, cx, y);
        cx += ctx.measureText(s).width;
      }
      return total;
    }

    scRuns(str) {
      const runs = [];
      const words = str.split(' ');
      words.forEach((wd, i) => {
        if (wd) {
          runs.push([wd[0].toUpperCase(), true]);
          if (wd.length > 1) runs.push([wd.slice(1).toUpperCase(), false]);
        }
        if (i < words.length - 1) runs.push([' ', false]);
      });
      return runs;
    }

    draw(game, show, input, best, playing = show) {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.c.width, this.c.height);
      // Chrome may keep presenting the last frame of a canvas that is only ever cleared, so hide it too.
      if (show !== this.visible) {
        this.visible = show;
        this.c.style.visibility = show ? 'visible' : 'hidden';
      }
      if (!show) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.textBaseline = 'alphabetic';
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const W = this.w, H = this.h;
      // One HUD unit is 1% of the height; narrow (portrait) screens are limited by the width instead.
      const u = (this.u = Math.min(clamp(H, 360, 1600) / 100, W / 70));
      const padX = Math.max(14, 0.03 * W), padY = 3.2 * u;
      const cap = this.cap;
      const score = Math.max(0, game.score || 0);

      // Score block, top left: "Score x4" over the score.
      const lbl = 2.5 * u, big = 4.2 * u;
      const base1 = padY + cap * lbl, base2 = padY + 3.0 * u + cap * big;
      const mult = 'x' + (game.mult || 1);
      const scoreStr = fmt(score);
      let leftEdge = 0;
      this.twice(() => {
        let x = padX;
        x += this.scText('Score', x, base1, lbl) + 1.2 * u;
        x += this.text('x', x, base1, 1.95 * u, HUD_GREEN);
        x += this.text(mult.slice(1), x, base1, lbl, HUD_GREEN);
        leftEdge = Math.max(x, padX + this.text(scoreStr, padX, base2, big, HUD_GREEN));
      });

      // High score, top right, dimmed.
      const hs = fmt(Math.max(best || 0, score));
      let rightEdge = W;
      this.twice(() => {
        const a = this.scText('High Score', W - padX, base1, lbl, HUD_GREEN, 'right');
        const b = this.text(hs, W - padX, padY + 3.0 * u + cap * 3.2 * u, 3.2 * u, HUD_GREEN, 600, 'right');
        rightEdge = W - padX - Math.max(a, b);
      }, 0.7);

      // Reserve ships (left of centre) and bombs (right of centre). The row sits at the top between the two text
      // blocks when a full row of nine fits there, otherwise on its own line below them.
      const half = 2.7 * u + 8 * 3.6 * u + 1.5 * u;
      const fits = W / 2 - half > leftEdge + u && W / 2 + half < rightEdge - u;
      const cy = fits ? padY + 1.3 * u : base2 + 1.6 * u + 1.3 * u;
      this.drawReserves(game, W / 2, cy, u);

      // Floating score and multiplier popups.
      const pops = game.popups || [];
      if (pops.length && game.worldToScreen) {
        for (const p of pops) {
          const h = p.total > 0 ? clamp(p.t / p.total, 0, 1) : 0;
          if (h <= 0) continue;
          const sc = h > 0.5 ? 1 : 0.6 + 0.8 * h;
          const al = h > 0.5 ? 1 : 2 * h;
          const [sx, sy] = game.worldToScreen(p.x, p.y);
          if (sx < -200 || sy < -50 || sx > W + 200 || sy > H + 50) continue;
          const size = (p.kind === 'mult' ? 1.9 : 1.6) * u * sc;
          this.twice(() => this.text(String(p.text), sx, sy + size * cap * 0.5, size, POP_FILL, 600, 'center'), al, POP_GLOW);
        }
      }

      // Centre messages (the game no longer sends any, but they are still shown if it does).
      const msgs = game.msgs || [];
      let my = H * 0.24;
      for (const m of msgs) {
        const f = clamp(Math.min(1, m.t / 20, (m.total - m.t) / 8 + 0.2), 0, 1);
        this.twice(() => this.text(m.text, W / 2, my, 2.2 * u, m.col || HUD_GREEN, 600, 'center'), f);
        my += 3 * u;
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';

      // Crosshair (mouse aim, or the orbiting reticle of locked aim).
      let ret = null;
      if (playing) {
        if (input.reticle) ret = input.reticle(game);
        else if (input.device === 'mouse' && input.mouse.seen && !input.touch.used && game.player.alive) ret = [input.mouse.x, input.mouse.y];
      }
      if (ret) {
        const [x, y] = ret;
        ctx.save();
        ctx.strokeStyle = 'rgba(200,240,255,0.9)';
        ctx.shadowColor = '#5cf';
        ctx.shadowBlur = 6 * this.dpr;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(x + dx * 5, y + dy * 5);
          ctx.lineTo(x + dx * 14, y + dy * 14);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Touch sticks.
      if (input.touch && input.touch.used) {
        for (const t of [input.touch.left, input.touch.right]) {
          if (!t) continue;
          ctx.save();
          ctx.strokeStyle = 'rgba(107,232,74,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(t.ox, t.oy, 55, 0, TAU);
          ctx.stroke();
          const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy), k = l > 55 ? 55 / l : 1;
          ctx.fillStyle = 'rgba(141,255,74,0.3)';
          ctx.beginPath();
          ctx.arc(t.ox + dx * k, t.oy + dy * k, 22, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Claw icons for the reserve ships, octagon-plus icons for the bombs; up to nine each, the newest one
    // blinking while its award flash runs.
    drawReserves(game, midX, cy, u) {
      const ctx = this.ctx;
      const P = this.path;
      const box = shipBox();
      const k = (3.0 * u) / box.w;
      const blink = (f) => f > 0 && Math.floor(f / 6) % 2 !== 0;

      const lives = clamp(Math.floor(game.lives || 0), 0, 9);
      const nl = lives - (blink(game.lifeFlash || 0) ? 1 : 0);
      if (nl > 0) {
        ctx.beginPath();
        P.reset();
        for (let i = 0; i < nl; i++) {
          const cx = midX - 2.7 * u - i * 3.6 * u;
          // Pointing up, centred on its bounding box: model (x, y) -> screen (y, -x).
          GW.poly(P, GW.SHIP, cx - box.cy * k, cy + box.cx * k, -Math.PI / 2, k, k, 2.6, 0, 0, 0);
          P.reset();
        }
        ctx.strokeStyle = HUD_GREEN;
        ctx.lineWidth = 2.6;
        this.twice(() => ctx.stroke());
      }

      const bombs = clamp(Math.floor(game.bombs || 0), 0, 9);
      const nb = bombs - (blink(game.bombFlash || 0) ? 1 : 0);
      if (nb > 0) {
        const r = 1.35 * u, arm = 0.55 * u;
        ctx.beginPath();
        for (let i = 0; i < nb; i++) {
          const cx = midX + 2.7 * u + i * 3.6 * u;
          for (let j = 0; j < 8; j++) {
            const a = Math.PI / 8 + (j * TAU) / 8;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
          ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
        }
        ctx.strokeStyle = HUD_GREEN;
        ctx.lineWidth = 0.22 * u;
        this.twice(() => ctx.stroke());
      }
    }
  }

  GW.HUD = HUD;
  GW.FONT = FONT;
  GW.HUD_GREEN = HUD_GREEN;
})();
