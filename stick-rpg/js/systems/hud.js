// The status HUD drawn over the top of the stage, positioned like the original:
// heart + slanted red HP bar "hp/ max", "$ cash", a 24-hour pie clock (blue = hours used),
// "DAY n", and — on the city map only — the backpack (inventory) and "?" (stats) buttons.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;

  function outlined(ctx, str, x, y, size, fill, stroke, align, sw) {
    ctx.font = 'bold ' + size + 'px ' + D.FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = sw || 3;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  function heart(ctx, x, y, frac) {
    // Healthy: glossy red. Hurt: cracked. Nearly dead: a brown, broken lump.
    var col = frac > 0.6 ? '#ee1111' : frac > 0.25 ? '#cc1111' : '#8a4a22';
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-13, -1, -9, -12, 0, -5);
    ctx.bezierCurveTo(9, -12, 13, -1, 0, 8);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#330000';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-4.5, -4, 2.2, 1.6, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (frac <= 0.6) {
      ctx.strokeStyle = '#330000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-2, -1);
      ctx.lineTo(2, 2);
      ctx.lineTo(-1, 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function hpBar(ctx, s) {
    var x0 = 38, x1 = 202, y0 = 12, y1 = 24, sk = 7;
    var frac = Math.max(0, Math.min(1, s.hp / s.hpmax));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + sk, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1 - sk, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.fillStyle = '#5c0000';
    ctx.fill();
    ctx.clip();
    // Filled in 5% steps like the original's bar clip.
    var stepped = Math.ceil(frac * 20) / 20;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x0, y0, (x1 - x0) * stepped, y1 - y0);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(x0 + sk, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1 - sk, y1);
    ctx.lineTo(x0, y1);
    ctx.closePath();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.font = 'bold 10px ' + D.FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.max(0, s.hp) + '/ ' + s.hpmax, 85, 18.5);
    heart(ctx, 25, 16, frac);
  }

  function clock(ctx, cx, cy, time) {
    var r = 15;
    ctx.save();
    D.circle(ctx, cx, cy, r, '#f4f4f4', '#555', 1.5);
    // Blue wedge = hours of the day already used (0..24), clockwise from 12 o'clock.
    var f = Math.max(0, Math.min(24, time)) / 24;
    if (f > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r - 1.5, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = '#0033ee';
      ctx.fill();
    }
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 0.8;
    for (var i = 0; i < 24; i++) {
      var a = (i / 24) * Math.PI * 2;
      var r0 = i % 6 === 0 ? r - 5 : r - 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
      ctx.lineTo(cx + Math.sin(a) * (r - 1.5), cy - Math.cos(a) * (r - 1.5));
      ctx.stroke();
    }
    D.circle(ctx, cx, cy, 1.3, '#333');
    D.circle(ctx, cx, cy, r, null, '#333', 1.2);
    ctx.restore();
  }

  function backpack(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    // straps / top handle
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, 7);
    ctx.lineTo(2, 1);
    ctx.lineTo(8, 0);
    ctx.moveTo(24, 7);
    ctx.lineTo(29, 1);
    ctx.lineTo(23, 0);
    ctx.stroke();
    D.roundRect(ctx, 3, 5, 26, 31, 6, '#2b3fc7', '#101a66', 1.4);
    D.roundRect(ctx, 7, 9, 18, 14, 4, '#3d57e0', '#101a66', 1);
    D.roundRect(ctx, 9, 26, 14, 6, 2, '#3d57e0', '#101a66', 1);
    // yellow star
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      var rr = i % 2 ? 2.6 : 6;
      ctx.lineTo(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd400';
    ctx.fill();
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function statsIcon(ctx, x, y, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.font = 'bold 34px ' + D.FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(80,80,170,0.8)';
    ctx.fillText('?', 0, -3);
    // little stick figure
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.1;
    D.circle(ctx, 22, 9, 4, color || '#0066cc', '#000', 1);
    ctx.beginPath();
    ctx.moveTo(22, 13);
    ctx.lineTo(22, 24);
    ctx.moveTo(22, 16);
    ctx.lineTo(17, 21);
    ctx.moveTo(22, 16);
    ctx.lineTo(27, 21);
    ctx.moveTo(22, 24);
    ctx.lineTo(18, 32);
    ctx.moveTo(22, 24);
    ctx.lineTo(26, 32);
    ctx.stroke();
    ctx.restore();
  }

  SRPG.hud = {
    INVENTORY_BOX: { x: 462, y: 3, w: 36, h: 38 },
    STATS_BOX: { x: 512, y: 3, w: 36, h: 38 },

    // mode: 'map' (with backpack + stats), 'inside' (buildings), 'fight' (HP only).
    draw: function (ctx, s, mode) {
      if (!s) return;
      hpBar(ctx, s);
      if (mode === 'fight') return;
      outlined(ctx, '$', 225, 18, 22, '#ffcc00', '#a05a00', 'center', 2.5);
      outlined(ctx, SRPG.util.commas(s.cash), 240, 19, 17, '#ffcc88', '#c46a00', 'left', 2.5);
      clock(ctx, 348, 18, s.time);
      outlined(ctx, 'DAY', 376, 19, 13, '#0a66ee', '#bfe3ff', 'left', 2.5);
      outlined(ctx, String(s.day), 417, 19, 13, '#0a66ee', '#bfe3ff', 'left', 2.5);
      if (mode === 'map') {
        backpack(ctx, 463, 4);
        statsIcon(ctx, 513, 5, SRPG.game.personColor(s.karma));
      }
    },

    // Which map HUD button (if any) is at stage point x, y.
    hit: function (x, y) {
      var b = SRPG.hud.INVENTORY_BOX;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'inventory';
      b = SRPG.hud.STATS_BOX;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'stats';
      return null;
    },

    heart: heart,
    clock: clock,
    outlined: outlined,
  };
})();
