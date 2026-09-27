// Canvas drawing helpers shared by the map, interiors and minigames. All art is drawn procedurally —
// no bitmap assets — in the flat, thick-outlined vector look of the Flash original.
(function () {
  'use strict';
  var SRPG = window.SRPG;

  var draw = (SRPG.draw = {
    // The original's type is Arial Black / bold Arial; fall back to any heavy sans-serif.
    FONT: '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif',
    FONT_PLAIN: 'Arial, Helvetica, sans-serif',

    rect: function (ctx, x, y, w, h, fill, stroke, lw) {
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
      if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
    },

    roundRect: function (ctx, x, y, w, h, r, fill, stroke, lw) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    },

    circle: function (ctx, x, y, r, fill, stroke, lw) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    },

    line: function (ctx, x1, y1, x2, y2, color, lw) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color || '#000';
      ctx.lineWidth = lw || 2;
      ctx.stroke();
    },

    poly: function (ctx, pts, fill, stroke, lw) {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.stroke(); }
    },

    // opts: { size, color, align, baseline, bold, stroke, strokeWidth, font }
    text: function (ctx, str, x, y, opts) {
      opts = opts || {};
      ctx.font = (opts.bold ? 'bold ' : '') + (opts.italic ? 'italic ' : '') + (opts.size || 14) + 'px ' + (opts.font || draw.FONT);
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = opts.baseline || 'alphabetic';
      if (opts.stroke) {
        ctx.lineWidth = opts.strokeWidth || 3;
        ctx.strokeStyle = opts.stroke;
        ctx.lineJoin = 'round';
        ctx.strokeText(str, x, y);
      }
      ctx.fillStyle = opts.color || '#000';
      ctx.fillText(str, x, y);
    },

    // Word-wrapped text; returns the y after the last line.
    wrap: function (ctx, str, x, y, maxW, lineH, opts) {
      opts = opts || {};
      ctx.font = (opts.bold ? 'bold ' : '') + (opts.size || 14) + 'px ' + (opts.font || draw.FONT);
      var words = String(str).split(/\s+/);
      var line = '';
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) {
          draw.text(ctx, line, x, y, opts);
          line = words[i];
          y += lineH;
        } else line = test;
      }
      if (line) draw.text(ctx, line, x, y, opts);
      return y + lineH;
    },

    // Stick figure standing on (x, y) (feet), about `h` px tall.
    // opts: { color, dir: 'down'|'up'|'left'|'right', walk: phase (radians) or null, lw,
    //         pose: 'stand'|'wave'|'punch'|'hurt'|'sit'|'down'|'cheer', hat, holding }
    stick: function (ctx, x, y, h, opts) {
      opts = opts || {};
      var c = opts.color || '#000';
      var lw = opts.lw || Math.max(2, h / 16);
      var headR = h * 0.13;
      var neckY = y - h + headR * 2;
      var hipY = y - h * 0.42;
      var shoulderY = neckY + h * 0.08;
      var swing = opts.walk != null ? Math.sin(opts.walk) : 0;
      var pose = opts.pose || 'stand';
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c;
      ctx.lineWidth = lw;

      if (pose === 'down') {
        // lying on the ground, knocked out
        ctx.beginPath();
        ctx.moveTo(x - h * 0.45, y - 2);
        ctx.lineTo(x + h * 0.3, y - 2);
        ctx.moveTo(x + h * 0.3, y - 2);
        ctx.lineTo(x + h * 0.55, y - h * 0.12);
        ctx.moveTo(x + h * 0.3, y - 2);
        ctx.lineTo(x + h * 0.58, y - 1);
        ctx.moveTo(x - h * 0.2, y - 2);
        ctx.lineTo(x - h * 0.05, y - h * 0.18);
        ctx.stroke();
        draw.circle(ctx, x - h * 0.45 - headR, y - headR, headR, '#fff', c, lw);
        ctx.restore();
        return;
      }

      var lean = pose === 'hurt' ? -h * 0.08 : 0;
      // legs
      ctx.beginPath();
      if (pose === 'sit') {
        ctx.moveTo(x, hipY);
        ctx.lineTo(x + h * 0.22, hipY);
        ctx.lineTo(x + h * 0.22, y);
        ctx.moveTo(x, hipY);
        ctx.lineTo(x + h * 0.26, hipY + 2);
        ctx.lineTo(x + h * 0.28, y);
      } else {
        var stride = h * 0.2 * swing;
        ctx.moveTo(x + lean, hipY);
        ctx.lineTo(x - h * 0.14 + stride, y);
        ctx.moveTo(x + lean, hipY);
        ctx.lineTo(x + h * 0.14 - stride, y);
      }
      // body
      ctx.moveTo(x + lean, hipY);
      ctx.lineTo(x + lean * 1.5, neckY);
      // arms
      var sx = x + lean * 1.3;
      var arm = h * 0.3;
      var dirSign = opts.dir === 'left' ? -1 : 1;
      if (pose === 'wave' || pose === 'cheer') {
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx + arm * 0.6, shoulderY - arm * 0.8);
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx - (pose === 'cheer' ? arm * 0.6 : arm * 0.4), shoulderY + (pose === 'cheer' ? -arm * 0.8 : arm * 0.9));
      } else if (pose === 'punch') {
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx + dirSign * arm * 1.1, shoulderY + 1);
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx + dirSign * arm * 0.35, shoulderY + arm * 0.5);
        ctx.lineTo(sx + dirSign * arm * 0.55, shoulderY + arm * 0.1);
      } else if (pose === 'hurt') {
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx - arm * 0.7, shoulderY - arm * 0.5);
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx + arm * 0.5, shoulderY - arm * 0.6);
      } else {
        var a = h * 0.16 * swing;
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx - h * 0.2 - a * 0.3, shoulderY + arm * 0.9 + a * 0.2);
        ctx.moveTo(sx, shoulderY);
        ctx.lineTo(sx + h * 0.2 + a * 0.3, shoulderY + arm * 0.9 - a * 0.2);
      }
      ctx.stroke();
      // head
      var hx = x + lean * 1.6;
      var hy = neckY - headR;
      draw.circle(ctx, hx, hy, headR, opts.headFill || '#fff', c, lw);
      if (opts.dir === 'left' || opts.dir === 'right' || opts.dir === 'down' || !opts.dir) {
        // eyes: a hint of facing
        var ex = opts.dir === 'left' ? -headR * 0.35 : opts.dir === 'right' ? headR * 0.35 : 0;
        if (opts.dir !== 'up') {
          ctx.fillStyle = c;
          ctx.fillRect(hx + ex - headR * 0.35, hy - headR * 0.2, Math.max(1.5, lw * 0.6), Math.max(1.5, lw * 0.6));
          ctx.fillRect(hx + ex + headR * 0.2, hy - headR * 0.2, Math.max(1.5, lw * 0.6), Math.max(1.5, lw * 0.6));
        }
      }
      if (opts.hat) opts.hat(ctx, hx, hy - headR, headR);
      ctx.restore();
    },

    // '#RRGGBB' from a 0xRRGGBB number.
    hex: function (n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); },

    // Simple shaded sky/ground backdrop used by several interiors.
    gradient: function (ctx, x, y, w, h, top, bottom) {
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    },
  });
})();
