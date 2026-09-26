// Heads-up display (score, multiplier, lives, bombs, messages, crosshair, touch sticks) on a 2D canvas laid
// over the WebGL one, plus a 2D adapter so the enemy and ship drawing code can paint menu icons.
'use strict';
(function () {
  const GW = window.GW;
  const { clamp, css, fmt, TAU } = GW;
  const FONT = "'Orbitron', 'Eurostile', 'Segoe UI', 'Trebuchet MS', sans-serif";

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
    if (type === 'snake') {
      e.len = 9;
      for (let s = 0; s < e.len; s++) {
        const k = s + 1;
        e.segs[s * 2] = -Math.cos(0.5) * k * 7 + Math.sin(k * 0.7) * 4;
        e.segs[s * 2 + 1] = Math.sin(0.5) * k * 7 + Math.cos(k * 0.7) * 4;
      }
    }
    if (type === 'blackhole') e.active = true;
    if (type === 'mayfly') e.ph = 1.2;
    const extent = type === 'snake' ? 44 : type === 'blackhole' ? 34 : e.r * 1.9;
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
      this.visible = true;
    }

    resize(cssW, cssH) {
      this.dpr = Math.min(2, devicePixelRatio || 1);
      this.w = cssW;
      this.h = cssH;
      this.c.width = Math.round(cssW * this.dpr);
      this.c.height = Math.round(cssH * this.dpr);
    }

    text(str, x, y, size, color, glow, align = 'left', weight = 700) {
      const ctx = this.ctx;
      ctx.font = `${weight} ${size}px ${FONT}`;
      ctx.textAlign = align;
      ctx.shadowColor = glow || color;
      ctx.shadowBlur = size * 0.6;
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      ctx.shadowBlur = 0;
    }

    draw(game, show, input, best) {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.c.width, this.c.height);
      // Chrome may keep presenting the last frame of a canvas that is only ever cleared, so hide it too.
      if (show !== this.visible) {
        this.visible = show;
        this.c.style.visibility = show ? 'visible' : 'hidden';
      }
      if (!show) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.textBaseline = 'top';
      const W = this.w, H = this.h;
      const s = clamp(Math.min(W / 1100, H / 700), 0.62, 1.4);
      const pad = 16 * s + 4;

      // Score and multiplier, top left.
      this.text('SCORE', pad, pad, 11 * s, '#7fa8d8', '#1b4d9a', 'left', 500);
      this.text(fmt(game.score), pad, pad + 14 * s, 30 * s, '#f2fbff', '#3ad2ff');
      this.text('x' + game.mult, pad, pad + 50 * s, 20 * s, '#ffe45c', '#ffb000');

      // High score, top centre.
      this.text('HIGH SCORE', W / 2, pad, 11 * s, '#7fa8d8', '#1b4d9a', 'center', 500);
      this.text(fmt(Math.max(best, game.score)), W / 2, pad + 14 * s, 20 * s, '#cfe6ff', '#3a7dff', 'center');

      // Lives and bombs, top right.
      const icon = 22 * s;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#bfe9ff';
      ctx.shadowBlur = 8;
      const A = adapter(ctx, 1);
      const lives = Math.max(0, game.lives);
      const shown = Math.min(lives, 8);
      for (let i = 0; i < shown; i++) {
        ctx.save();
        ctx.translate(W - pad - icon * 0.5 - i * icon * 1.05, pad + icon * 0.55);
        ctx.scale(icon / 34, icon / 34);
        GW.poly(A, GW.SHIP, 0, 0, -Math.PI / 2, 1, 1, 2.6, 1, 1, 1);
        ctx.restore();
      }
      if (lives > 8) this.text('+' + (lives - 8), W - pad - icon * 8.6, pad + icon * 0.2, 13 * s, '#ffffff', '#9fd8ff', 'right');
      ctx.shadowColor = '#ffd84a';
      const bombs = Math.min(game.bombs, 8);
      for (let i = 0; i < bombs; i++) {
        const x = W - pad - icon * 0.5 - i * icon * 1.05, y = pad + icon * 1.75;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(icon / 34, icon / 34);
        A.circle(0, 0, 11, 2.4, 1, 0.85, 0.3, 18);
        A.circle(0, 0, 4.5, 2, 1, 0.85, 0.3, 10);
        ctx.restore();
      }
      if (game.bombs > 8) this.text('+' + (game.bombs - 8), W - pad - icon * 8.6, pad + icon * 1.45, 13 * s, '#ffe45c', '#ffb000', 'right');
      ctx.restore();

      // Messages.
      let y = H * 0.24;
      for (const m of game.msgs) {
        const f = Math.min(1, m.t / 20, (m.total - m.t) / 8 + 0.2);
        ctx.globalAlpha = clamp(f, 0, 1);
        this.text(m.text, W / 2, y, 22 * s, m.col, m.col, 'center');
        ctx.globalAlpha = 1;
        y += 30 * s;
      }

      // Crosshair for mouse aiming.
      if (input.device === 'mouse' && input.mouse.seen && !input.touch.used && game.player.alive) {
        const { x, y: my } = input.mouse;
        ctx.save();
        ctx.strokeStyle = 'rgba(200,240,255,0.9)';
        ctx.shadowColor = '#5cf';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(x, my, 9, 0, TAU);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(x + dx * 5, my + dy * 5);
          ctx.lineTo(x + dx * 14, my + dy * 14);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Touch sticks.
      if (input.touch.used) {
        for (const t of [input.touch.left, input.touch.right]) {
          if (!t) continue;
          ctx.save();
          ctx.strokeStyle = 'rgba(140,200,255,0.35)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(t.ox, t.oy, 55, 0, TAU);
          ctx.stroke();
          const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy), k = l > 55 ? 55 / l : 1;
          ctx.fillStyle = 'rgba(160,220,255,0.35)';
          ctx.beginPath();
          ctx.arc(t.ox + dx * k, t.oy + dy * k, 22, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  GW.HUD = HUD;
  GW.FONT = FONT;
})();
