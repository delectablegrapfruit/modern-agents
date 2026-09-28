// Button icons, drawn in code: SRPG.icons.draw(ctx, name, size) paints one object into a size x size
// square, in the look of the original's menu art (flat cartoon fills, soft gradients, black
// outlines). The blue rounded tile behind it is CSS (.ibtn .ico), so icons are drawn on a
// transparent background. Every icon is designed on the original's 48-unit tile grid.
// SRPG.icons.item(ctx, id, box) draws the bigger inventory pictures around a registration point.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var PI = Math.PI;

  // --- helpers --------------------------------------------------------------------------------
  function lg(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rg(ctx, x, y, r0, r1, stops, x1, y1) {
    var g = ctx.createRadialGradient(x, y, r0, x1 == null ? x : x1, y1 == null ? y : y1, r1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function poly(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (close !== false) ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, PI * 2);
  }
  function fs(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1.4; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function line(ctx, pts, color, lw) {
    poly(ctx, pts, false);
    ctx.lineWidth = lw || 1.4;
    ctx.strokeStyle = color || '#000';
    ctx.stroke();
  }
  function txt(ctx, s, x, y, font, fill, stroke, lw, align) {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'alphabetic';
    if (stroke) { ctx.lineWidth = lw || 2; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    if (fill) { ctx.fillStyle = fill; ctx.fillText(s, x, y); }
  }
  function rot(ctx, cx, cy, a) {
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.translate(-cx, -cy);
  }
  // Draw f scaled by (sx, sy) about (cx, cy), optionally turned by a (radians).
  function scaled(f, sx, sy, cx, cy, a) {
    return function (ctx) {
      ctx.save();
      ctx.translate(cx, cy);
      if (a) ctx.rotate(a);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -cy);
      f(ctx);
      ctx.restore();
    };
  }
  var AB = '"Arial Black", "Arial Bold", Gadget, Arial, sans-serif';
  var IMPACT = 'Impact, Haettenschweiler, "Arial Black", sans-serif';
  var TIMES = '"Times New Roman", Times, "Liberation Serif", "DejaVu Serif", serif';

  // A stick figure: head centre (hx, hy), radius r; limbs as polylines (flat list of points).
  function stickman(ctx, hx, hy, r, limbs, color) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    limbs.forEach(function (l) { poly(ctx, l, false); ctx.stroke(); });
    ell(ctx, hx, hy, r, r);
    fs(ctx, color || '#0066cc', '#000', 1.3);
    ctx.restore();
  }

  // --- general ------------------------------------------------------------------------------
  function leave(ctx) {
    // blue arrow: shaded shaft and a big head
    rr(ctx, 7.9, 18, 21, 12, 0.5);
    fs(ctx, lg(ctx, 0, 18, 0, 30, [0, '#001f8c', 0.45, '#1a8cff', 0.55, '#1a8cff', 1, '#001a70']), '#000', 1.2);
    poly(ctx, [27.7, 11.6, 41.2, 24, 27.7, 37]);
    fs(ctx, lg(ctx, 0, 11.6, 0, 37, [0, '#002299', 0.5, '#0a8cff', 1, '#001a80']), '#000', 1.2);
    poly(ctx, [29, 16, 38.5, 24, 29, 24]);
    fs(ctx, 'rgba(120,200,255,0.35)');
  }

  function ok(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    line(ctx, [11, 25, 20, 34, 37, 13], '#003300', 8.5);
    line(ctx, [11, 25, 20, 34, 37, 13], '#33cc33', 5.5);
    line(ctx, [12.5, 24.5, 20, 31.5], 'rgba(200,255,200,0.7)', 1.4);
  }

  function cancel(ctx) {
    ctx.lineCap = 'round';
    line(ctx, [13, 13, 35, 35], '#330000', 8.5);
    line(ctx, [35, 13, 13, 35], '#330000', 8.5);
    line(ctx, [13, 13, 35, 35], '#ee1111', 5.5);
    line(ctx, [35, 13, 13, 35], '#ee1111', 5.5);
  }

  function house(ctx) {
    // grass strip
    rr(ctx, 6.5, 39.5, 35.5, 3.6, 1.2);
    fs(ctx, '#2e8b2e', '#1d5c1d', 0.6);
    // walls: lit left edge, shaded right edge
    ctx.fillStyle = '#878787';
    ctx.fillRect(9, 22, 30, 18);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(9, 22, 3, 18);
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(35.5, 22, 3.5, 18);
    // door with a lighter frame and a knob
    ctx.fillStyle = '#d2c04c';
    ctx.fillRect(17.5, 26.5, 12.5, 3);
    ctx.fillStyle = '#b8aa42';
    ctx.fillRect(18, 29.5, 11.5, 10.5);
    ctx.fillStyle = '#8e7e30';
    ctx.fillRect(21, 29.5, 8.5, 10.5);
    ell(ctx, 25.2, 34.2, 0.9, 1.1);
    fs(ctx, '#e0e0e0');
    // chimney
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(29.5, 8.5, 6, 11);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(33, 8.5, 2.5, 11);
    ell(ctx, 32.5, 8.6, 3.1, 1.6);
    fs(ctx, '#e6e6e6', '#888', 0.5);
    // roof: bright left slope, darker right, deep red eave
    poly(ctx, [3.5, 25.5, 23.5, 8, 44.5, 25.5]);
    fs(ctx, '#cc2020');
    poly(ctx, [3.5, 25.5, 23.5, 8, 26.5, 11, 9.5, 24.5]);
    fs(ctx, '#ff2626');
    poly(ctx, [3.5, 25.5, 9.5, 21.5, 38.5, 21.5, 44.5, 25.5, 43, 27, 5, 27]);
    fs(ctx, '#8b1c1c');
  }

  function dollarSign(ctx, cx, cy, size) {
    ctx.save();
    ctx.font = 'bold ' + size + 'px ' + IMPACT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = '#6b3a00';
    ctx.strokeText('$', cx, cy);
    ctx.fillStyle = lg(ctx, cx - size * 0.3, cy - size * 0.4, cx + size * 0.3, cy + size * 0.4, [0, '#ffe866', 0.5, '#ffcc00', 1, '#f28c00']);
    ctx.fillText('$', cx, cy);
    ctx.restore();
  }

  function money(ctx) { dollarSign(ctx, 24, 25.5, 36); }

  // The cash bundle (McSticks WORK - COOK, the NLI jobs, BUY/SELL STOCKS).
  function work(ctx) {
    ctx.save();
    rot(ctx, 24, 25, -0.22);
    for (var i = 5; i >= 1; i--) {
      rr(ctx, 5 + i * 0.4, 15 + i * 2.2, 38, 19, 1.2);
      fs(ctx, i % 2 ? '#1e9e1e' : '#39c439', '#0b4d0b', 0.9);
    }
    rr(ctx, 5, 13, 38, 19, 1.4);
    fs(ctx, lg(ctx, 5, 13, 43, 32, [0, '#6cff6c', 0.5, '#33d633', 1, '#20b020']), '#0b4d0b', 1.1);
    rr(ctx, 7, 15, 34, 15, 1);
    fs(ctx, null, '#138a13', 0.7);
    // portrait oval with the unhappy president
    ell(ctx, 24, 22.5, 6.2, 6.6);
    fs(ctx, '#9cff9c', '#0b4d0b', 1);
    ell(ctx, 24, 22.8, 4.3, 4.7);
    fs(ctx, '#46c846', '#0b4d0b', 0.6);
    ell(ctx, 22.4, 21.6, 0.8, 1);
    fs(ctx, '#0b3d0b');
    ell(ctx, 25.6, 21.6, 0.8, 1);
    fs(ctx, '#0b3d0b');
    ctx.beginPath();
    ctx.arc(24, 26.5, 1.9, PI * 1.1, PI * 1.9);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#0b3d0b';
    ctx.stroke();
    txt(ctx, '$', 11.5, 27, 'bold 10px ' + AB, '#0e6e0e');
    txt(ctx, '$', 36.5, 27, 'bold 10px ' + AB, '#0e6e0e');
    ctx.restore();
  }

  function sleep(ctx) {
    // three white "Z"s in Times New Roman (14, 21 and 28 px), smallest top right
    txt(ctx, 'Z', 4.9, 42, '28px ' + TIMES, '#fff', null, 0, 'left');
    txt(ctx, 'Z', 21.2, 26.3, '21px ' + TIMES, '#fff', null, 0, 'left');
    txt(ctx, 'Z', 33.1, 17, '14px ' + TIMES, '#fff', null, 0, 'left');
  }

  function save(ctx) {
    // a manila folder with papers sticking out
    ctx.save();
    rot(ctx, 24, 25, 0.1);
    ctx.translate(24, 25);
    ctx.scale(1.08, 1.08);
    ctx.translate(-24, -25);
    poly(ctx, [16, 7.5, 33, 5.5, 39.5, 36, 36.5, 40.5]);
    fs(ctx, '#f2f2f2', '#222', 0.9);
    for (var i = 0; i < 4; i++) line(ctx, [18 + i * 1.3, 8.5 + i * 0.6, 34 + i * 1.2, 7 + i * 0.4], '#9a9a9a', 0.5);
    poly(ctx, [18, 9, 35, 7.5, 40.5, 35, 37.5, 39]);
    fs(ctx, '#fff', '#555', 0.6);
    line(ctx, [35.5, 8.5, 41, 34], '#777', 0.5);
    line(ctx, [36.5, 9.5, 41.5, 32], '#999', 0.5);
    poly(ctx, [10, 13.5, 13.5, 9.5, 19.5, 10.5, 20.5, 13, 31.5, 12, 37.5, 39, 20, 43.5]);
    fs(ctx, lg(ctx, 10, 12, 37, 43, [0, '#ffffb0', 1, '#fff08a']), '#000', 1.2);
    line(ctx, [11.5, 15, 21, 42], 'rgba(160,140,40,0.5)', 0.6);
    ctx.restore();
  }

  function messages(ctx) {
    // the answering machine: dark body, speaker grille, red LED, blue arrow keys
    rr(ctx, 11.5, 5.5, 25, 38.5, 5);
    fs(ctx, lg(ctx, 11.5, 0, 36.5, 0, [0, '#2a2a2a', 0.5, '#4a4a4a', 1, '#1e1e1e']), '#000', 1.2);
    rr(ctx, 13.5, 7, 21, 9.5, 3.5);
    fs(ctx, '#3c3c3c', '#111', 0.6);
    for (var i = 0; i < 4; i++) line(ctx, [15, 8.8 + i * 2, 33, 8.8 + i * 2], '#8a8a8a', 0.8);
    rr(ctx, 19, 18, 10.5, 7.5, 0.6);
    fs(ctx, '#ff1a1a', '#000', 0.7);
    ctx.fillStyle = '#7a0000';
    ctx.fillRect(20.5, 19.3, 3, 5);
    ctx.fillRect(25, 19.3, 3, 5);
    ctx.fillStyle = '#ff5050';
    ctx.fillRect(21.3, 20.1, 1.4, 1.3);
    ctx.fillRect(25.8, 20.1, 1.4, 1.3);
    ctx.fillRect(21.3, 22.2, 1.4, 1.3);
    ctx.fillRect(25.8, 22.2, 1.4, 1.3);
    rr(ctx, 13.5, 20, 3.8, 3.6, 0.6);
    fs(ctx, '#a8a8a8', '#222', 0.5);
    rr(ctx, 31, 20, 3.8, 3.6, 0.6);
    fs(ctx, '#a8a8a8', '#222', 0.5);
    poly(ctx, [14.5, 31, 19, 28.5, 19, 33.5]);
    fs(ctx, '#1a66ff', '#001a66', 0.5);
    rr(ctx, 21.4, 29.3, 5.4, 3.4, 0.4);
    fs(ctx, '#1a66ff', '#001a66', 0.5);
    poly(ctx, [33.5, 31, 29, 28.5, 29, 33.5]);
    fs(ctx, '#1a66ff', '#001a66', 0.5);
    ell(ctx, 24, 38.5, 1.8, 1.8);
    fs(ctx, '#cc0000', '#330000', 0.5);
  }

  // --- the store ----------------------------------------------------------------------------
  function slushee(ctx) {
    // green straw, yellow slush dome, blue ribbed cup
    line(ctx, [25.5, 13, 32, 3], '#003300', 3.4);
    line(ctx, [25.5, 13, 32, 3], '#33dd33', 1.8);
    poly(ctx, [9, 14, 39, 14, 35.5, 44.5, 12.5, 44.5]);
    fs(ctx, lg(ctx, 9, 0, 39, 0, [0, '#1a40d9', 0.3, '#3366ff', 0.6, '#2e5cff', 1, '#1433b3']), '#000', 1.3);
    line(ctx, [16, 16, 17.5, 43], 'rgba(120,160,255,0.8)', 1.6);
    line(ctx, [31, 16, 30, 43], 'rgba(20,40,160,0.55)', 1.4);
    ctx.beginPath();
    ctx.moveTo(9, 14.5);
    ctx.bezierCurveTo(8, 6, 16, 3.5, 22, 6);
    ctx.bezierCurveTo(28, 3, 39, 5, 39, 14.5);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, 4, 0, 15, [0, '#ffff66', 1, '#e6d600']), '#000', 1.2);
    ell(ctx, 16, 9, 3, 1.8);
    fs(ctx, '#ffffb3');
    ell(ctx, 27, 8, 2.4, 1.4);
    fs(ctx, '#ffffb3');
    line(ctx, [25.5, 13, 28.5, 8.4], '#33dd33', 1.8);
  }

  function candybar(ctx) {
    ctx.save();
    rot(ctx, 24, 24, -0.8);
    ctx.translate(24, 24);
    ctx.scale(1.12, 1.12);
    ctx.translate(-24, -24);
    // crimped ends
    poly(ctx, [2, 17, 6, 18.5, 4, 20.5, 6.5, 22.5, 4, 24.5, 6.5, 26.5, 4, 28.5, 6, 30.5, 2, 31.5]);
    fs(ctx, '#ff9a1a', '#000', 0.9);
    poly(ctx, [46, 17, 42, 18.5, 44, 20.5, 41.5, 22.5, 44, 24.5, 41.5, 26.5, 44, 28.5, 42, 30.5, 46, 31.5]);
    fs(ctx, '#ff9a1a', '#000', 0.9);
    rr(ctx, 5.5, 17.5, 37, 13.5, 1);
    fs(ctx, lg(ctx, 0, 17.5, 0, 31, [0, '#ffd21a', 0.35, '#ffb31a', 1, '#ff8000']), '#000', 1.2);
    txt(ctx, 'UBER BAR', 24, 28, 'bold 8.6px ' + AB, '#ff3300');
    ctx.restore();
  }

  function nachos(ctx) {
    // chips standing in a lime tray
    var chips = [[9, 27, 13, 12, 18, 26], [14, 26, 20, 9.5, 25, 26], [21, 26, 27, 12.5, 30, 26], [27, 25, 33, 10, 36.5, 26],
      [33, 26, 40.5, 14.5, 41, 27], [13, 29, 17, 16.5, 22, 29], [24, 28, 31, 16, 33, 29]];
    chips.forEach(function (c, i) {
      poly(ctx, c);
      fs(ctx, i % 2 ? '#ffe680' : '#fff0a6', '#000', 1);
    });
    poly(ctx, [5, 27.5, 43, 27.5, 39, 36, 9, 36]);
    fs(ctx, lg(ctx, 0, 27, 0, 36, [0, '#e6ff4d', 1, '#b3e600']), '#000', 1.2);
    poly(ctx, [9, 36, 39, 36, 39, 38.5, 9, 38.5]);
    fs(ctx, '#99c200', '#000', 1);
    line(ctx, [8, 29.5, 40, 29.5], 'rgba(255,255,255,0.6)', 0.8);
  }

  // The pack of smokes: a black box, a skull, filters sticking out of the top.
  function smokesPack(ctx) {
    // back edge of the open top, then the cigarettes standing up out of it
    poly(ctx, [14, 10, 18, 6.5, 37, 6.5, 33, 10]);
    fs(ctx, '#2a2a2a', '#000', 0.9);
    var cig = [[15.8, 1.5], [19.6, 0.8], [23.4, 1.8], [27.2, 2.6]];
    cig.forEach(function (c) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(c[0], c[1], 3.4, 11);
      ctx.fillStyle = '#f0a030';
      ctx.fillRect(c[0], c[1], 3.4, 4);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(c[0], c[1], 3.4, 11);
    });
    // side face
    poly(ctx, [33, 10, 37, 6.5, 37, 38, 33, 43]);
    fs(ctx, '#3a3a3a', '#000', 1);
    rr(ctx, 14, 10, 19, 33, 0.8);
    fs(ctx, lg(ctx, 14, 0, 33, 0, [0, '#262626', 0.5, '#141414', 1, '#000']), '#000', 1.2);
    // skull
    ell(ctx, 23.5, 27, 6, 5.8);
    fs(ctx, '#f0f0f0', '#000', 0.8);
    rr(ctx, 20.5, 30.5, 6, 4.8, 1.2);
    fs(ctx, '#f0f0f0', '#000', 0.8);
    ell(ctx, 21.2, 27.2, 1.7, 2);
    fs(ctx, '#000');
    ell(ctx, 25.8, 27.2, 1.7, 2);
    fs(ctx, '#000');
    line(ctx, [22.3, 33, 22.3, 35.2], '#000', 0.6);
    line(ctx, [24.7, 33, 24.7, 35.2], '#000', 0.6);
  }
  function smokes(ctx) {
    ctx.save();
    rot(ctx, 24, 25, 0.5);
    ctx.translate(-0.5, 0);
    smokesPack(ctx);
    ctx.restore();
  }

  function pillBottle(ctx) {
    // orange bottle, white label with Rx, silver ridged cap
    rr(ctx, 12, 13, 24, 30, 3.5);
    fs(ctx, lg(ctx, 12, 0, 36, 0, [0, '#b35900', 0.35, '#ffad33', 0.6, '#e68a00', 1, '#8c4600']), '#000', 1.2);
    rr(ctx, 12.6, 19, 22.8, 14, 0.5);
    fs(ctx, '#f2f2f2', '#555', 0.5);
    for (var i = 0; i < 3; i++) line(ctx, [14.5, 22 + i * 3.2, 25, 22 + i * 3.2], '#777', 0.6);
    txt(ctx, 'Rx', 29.5, 29, 'bold 7px ' + AB, '#e60000');
    rr(ctx, 10.5, 6, 27, 8.5, 1.8);
    fs(ctx, lg(ctx, 10.5, 0, 37.5, 0, [0, '#8c8c8c', 0.4, '#f2f2f2', 1, '#7a7a7a']), '#000', 1.2);
    for (var j = 0; j < 7; j++) line(ctx, [13.5 + j * 3.5, 7, 13.5 + j * 3.5, 13.5], 'rgba(60,60,60,0.55)', 0.6);
  }
  function pills(ctx) {
    ctx.save();
    rot(ctx, 24, 25, 0.35);
    pillBottle(ctx);
    ctx.restore();
  }

  // --- New Lines Inc. -----------------------------------------------------------------------
  function apply(ctx) {
    // the businessman: blue head, grey suit, striped red tie
    poly(ctx, [10.5, 47, 11.5, 27, 16, 22.5, 24, 20.5, 32, 22.5, 36.5, 27, 37.5, 47]);
    fs(ctx, lg(ctx, 10, 0, 38, 0, [0, '#5a5a5a', 0.3, '#9a9a9a', 0.5, '#7a7a7a', 0.75, '#a6a6a6', 1, '#555']), '#000', 1.2);
    poly(ctx, [20, 21.5, 24, 31, 28, 21.5]);
    fs(ctx, '#fff', '#000', 0.8);
    poly(ctx, [22.3, 23, 25.7, 23, 26.8, 40, 24, 44, 21.2, 40]);
    fs(ctx, '#e60000', '#000', 0.8);
    ctx.save();
    poly(ctx, [22.3, 23, 25.7, 23, 26.8, 40, 24, 44, 21.2, 40]);
    ctx.clip();
    for (var i = 0; i < 6; i++) line(ctx, [20, 25 + i * 3.6, 28, 22 + i * 3.6], '#ffcc00', 1.1);
    ctx.restore();
    poly(ctx, [16, 22.5, 20, 21.5, 22.5, 30, 18.5, 29]);
    fs(ctx, '#666', '#000', 0.7);
    poly(ctx, [32, 22.5, 28, 21.5, 25.5, 30, 29.5, 29]);
    fs(ctx, '#666', '#000', 0.7);
    line(ctx, [24, 16.5, 24, 21], '#000', 1.2);
    ell(ctx, 24, 10.5, 6.6, 6.6);
    fs(ctx, '#0066cc', '#000', 1.2);
  }

  // --- the pawn shop --------------------------------------------------------------------------
  function alarm(ctx) {
    // CD alarm clock: silver dome, black display with red digits, round buttons, base
    rr(ctx, 12, 40, 24, 4.5, 1.5);
    fs(ctx, '#6e6e6e', '#000', 1);
    ctx.beginPath();
    ctx.moveTo(8.5, 40.5);
    ctx.bezierCurveTo(5, 28, 7, 5.5, 24, 5.5);
    ctx.bezierCurveTo(41, 5.5, 43, 28, 39.5, 40.5);
    ctx.closePath();
    fs(ctx, rg(ctx, 18, 14, 2, 30, [0, '#f2f2f2', 0.55, '#a8a8a8', 1, '#5c5c5c']), '#000', 1.2);
    rr(ctx, 14, 11.5, 20, 9.5, 1.2);
    fs(ctx, '#2a2a2a', '#000', 0.9);
    rr(ctx, 15.2, 12.7, 17.6, 7.1, 0.6);
    fs(ctx, '#140000');
    txt(ctx, '18:88', 24, 18.8, 'bold 6.2px "Courier New", monospace', '#ff1a1a');
    var btn = [[16.5, 27], [24, 25.5], [31.5, 27], [19.5, 33.5], [28.5, 33.5]];
    btn.forEach(function (b, i) {
      ell(ctx, b[0], b[1], i === 1 ? 3.4 : 2.8, i === 1 ? 3.4 : 2.8);
      fs(ctx, rg(ctx, b[0] - 0.8, b[1] - 0.8, 0.3, 3.2, [0, '#8a8a8a', 1, '#3a3a3a']), '#000', 0.8);
    });
  }

  function knifeArt(ctx) {
    // folding knife: silver blade out of a dark "KILLER" handle
    ctx.beginPath();
    ctx.moveTo(26, 9.5);
    ctx.bezierCurveTo(34, 12.5, 40.5, 23, 42, 41.5);
    ctx.bezierCurveTo(37.5, 36, 30, 25.5, 23.5, 17.5);
    ctx.closePath();
    fs(ctx, lg(ctx, 26, 12, 40, 36, [0, '#f5f5f5', 0.5, '#c4c4c4', 1, '#8a8a8a']), '#000', 1.1);
    line(ctx, [28, 14, 38.5, 35], 'rgba(255,255,255,0.8)', 0.7);
    poly(ctx, [5, 38.5, 25.5, 9.5, 31.5, 13.5, 11, 42.5]);
    fs(ctx, lg(ctx, 5, 38, 31, 13, [0, '#2e2e2e', 0.5, '#4a4a4a', 1, '#262626']), '#000', 1.2);
    line(ctx, [8.5, 38.5, 26.8, 12.6], '#6e6e6e', 0.8);
    ctx.save();
    rot(ctx, 17.5, 27, -0.95);
    txt(ctx, 'KILLER', 16.5, 29.2, 'bold 5.4px ' + AB, '#bdbdbd');
    ctx.restore();
    ell(ctx, 27.5, 12.5, 1.3, 1.3);
    fs(ctx, '#bbb', '#000', 0.5);
  }
  function knife(ctx) { knifeArt(ctx); }

  function gunArt(ctx) {
    // handgun pointing right: long silver slide, black grip raked back
    ctx.beginPath();
    ctx.moveTo(20.5, 20.5);
    ctx.quadraticCurveTo(21, 30, 31.5, 28);
    ctx.lineTo(31.5, 20.5);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#333';
    ctx.stroke();
    line(ctx, [24.5, 20.5, 26.5, 25.5], '#111', 1.6);
    poly(ctx, [6.5, 19, 21.5, 19, 20, 25, 19.5, 41, 10.5, 43.5, 4.5, 40.5, 8, 28]);
    fs(ctx, lg(ctx, 5, 0, 21, 0, [0, '#171717', 0.5, '#3d3d3d', 1, '#1f1f1f']), '#000', 1.3);
    for (var i = 0; i < 5; i++) line(ctx, [8 + i * 0.35, 29 + i * 2.6, 17.5 + i * 0.1, 28 + i * 2.6], '#565656', 0.7);
    rr(ctx, 4, 10, 41, 10.5, 1.2);
    fs(ctx, lg(ctx, 0, 10, 0, 20.5, [0, '#f5f5f5', 0.45, '#c8c8c8', 1, '#8a8a8a']), '#000', 1.3);
    rr(ctx, 4, 17, 41, 3.5, 0.8);
    fs(ctx, '#9a9a9a', '#000', 0.8);
    for (var j = 0; j < 5; j++) line(ctx, [7 + j * 1.6, 11.5, 7 + j * 1.6, 16.5], '#6e6e6e', 0.55);
    rr(ctx, 27, 11.8, 9, 3, 0.5);
    fs(ctx, '#6e6e6e');
    ctx.fillStyle = '#444';
    ctx.fillRect(43, 11.5, 1.6, 5);
  }
  function gun(ctx) { gunArt(ctx); }

  function ammo(ctx) {
    function bullet(x, y, a) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      rr(ctx, -3.6, -6, 7.2, 22, 0.8);
      fs(ctx, lg(ctx, -3.6, 0, 3.6, 0, [0, '#8a8a8a', 0.4, '#f5f5f5', 1, '#7a7a7a']), '#000', 1);
      ctx.beginPath();
      ctx.moveTo(-3.6, -6);
      ctx.bezierCurveTo(-3.6, -13, -1.5, -16, 0, -16);
      ctx.bezierCurveTo(1.5, -16, 3.6, -13, 3.6, -6);
      ctx.closePath();
      fs(ctx, lg(ctx, -3.6, 0, 3.6, 0, [0, '#8a8a8a', 0.4, '#ffffff', 1, '#8a8a8a']), '#000', 1);
      line(ctx, [-3.6, 13.5, 3.6, 13.5], '#555', 0.8);
      ctx.restore();
    }
    bullet(19, 20, 0);
    bullet(33, 36, 0.42);
  }

  function phoneArt(ctx) {
    // open flip phone: gold screen half, keypad half, antenna
    line(ctx, [36, 11, 43, 3.5], '#000', 1.4);
    ell(ctx, 43.3, 3.3, 1.3, 1.3);
    fs(ctx, '#000');
    poly(ctx, [24, 20, 34, 6.5, 44, 14, 34, 27.5]);
    fs(ctx, '#111', '#000', 1);
    poly(ctx, [26.8, 20, 34.5, 9.5, 41.5, 14.7, 33.8, 25]);
    fs(ctx, lg(ctx, 27, 10, 41, 25, [0, '#ffd95a', 1, '#c79a00']), '#000', 0.6);
    poly(ctx, [4, 33, 14.5, 19, 32, 31.5, 21.5, 45.5]);
    fs(ctx, '#111', '#000', 1);
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 3; c++) {
        var x0 = 9 + r * 3.9 + c * 3.6, y0 = 31.5 - r * 3.6 + c * 2.6;
        poly(ctx, [x0, y0, x0 + 2.6, y0 - 1.95, x0 + 5.2, y0 + 0, x0 + 2.6, y0 + 1.95]);
        fs(ctx, r === 3 ? '#ffe680' : '#fffbe6');
      }
    }
  }
  function cellphone(ctx) { phoneArt(ctx); }

  // --- Sticky's -------------------------------------------------------------------------------
  function beer(ctx) {
    // frothy glass mug
    ctx.beginPath();
    ctx.moveTo(32, 18);
    ctx.bezierCurveTo(46, 16, 46, 38, 32, 37);
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineWidth = 4.2;
    ctx.strokeStyle = '#f2c200';
    ctx.stroke();
    rr(ctx, 7.5, 12, 26, 32.5, 2.5);
    fs(ctx, lg(ctx, 7.5, 0, 33.5, 0, [0, '#8a5a00', 0.25, '#e0a82e', 0.5, '#ffe08a', 0.75, '#d99a1e', 1, '#7a4d00']), '#000', 1.3);
    [[13, 33, 1.6], [20, 38, 1.2], [26, 30, 1.4], [16, 24, 1], [28, 39, 1]].forEach(function (b) {
      ell(ctx, b[0], b[1], b[2], b[2]);
      fs(ctx, 'rgba(255,255,255,0.85)');
    });
    ctx.beginPath();
    ctx.moveTo(6, 17);
    ctx.bezierCurveTo(3, 11, 7, 5, 12, 6.5);
    ctx.bezierCurveTo(14, 2, 21, 2.5, 22.5, 5.5);
    ctx.bezierCurveTo(26, 2.5, 33, 4, 33.5, 9);
    ctx.bezierCurveTo(37, 11, 35.5, 17, 32, 17.5);
    ctx.bezierCurveTo(30, 20.5, 27, 19, 26, 17.5);
    ctx.bezierCurveTo(24, 22, 19.5, 21, 19, 17.5);
    ctx.bezierCurveTo(16, 21, 12, 20, 11.5, 17.5);
    ctx.bezierCurveTo(10, 23, 6.5, 22, 6, 17);
    ctx.closePath();
    fs(ctx, '#fbfbf0', '#000', 1.1);
    ell(ctx, 13, 10, 3, 1.6);
    fs(ctx, '#fff');
  }

  function bottleArt(ctx) {
    // green bottle, grey XX label, neck up-left
    ctx.save();
    rot(ctx, 24, 24, -0.55);
    rr(ctx, 21, 1.5, 6, 4, 1);
    fs(ctx, '#556b00', '#000', 1);
    ctx.beginPath();
    ctx.moveTo(21.5, 5);
    ctx.lineTo(26.5, 5);
    ctx.lineTo(26.8, 13);
    ctx.bezierCurveTo(32, 16, 32.5, 19, 32.5, 22);
    ctx.lineTo(32.5, 46);
    ctx.lineTo(15.5, 46);
    ctx.lineTo(15.5, 22);
    ctx.bezierCurveTo(15.5, 19, 16, 16, 21.2, 13);
    ctx.closePath();
    fs(ctx, lg(ctx, 15.5, 0, 32.5, 0, [0, '#5c5c00', 0.35, '#a3a31f', 0.55, '#8c8c14', 1, '#4d4d00']), '#000', 1.3);
    rr(ctx, 15.5, 26, 17, 11, 0.3);
    fs(ctx, '#b8b8b8', '#000', 0.9);
    txt(ctx, 'XX', 24, 35, 'bold 9px ' + AB, '#111');
    line(ctx, [19, 8, 18.5, 20], 'rgba(255,255,160,0.5)', 1);
    ctx.restore();
  }
  function bottle(ctx) { bottleArt(ctx); }

  function barfight(ctx) {
    // the stick figure swinging a broken bottle
    stickman(ctx, 17, 13, 7.2, [[17, 20.2, 17, 34], [17, 34, 12.5, 45], [17, 34, 20.5, 45], [17, 24, 11, 32], [17, 24, 25, 25, 31.5, 21]]);
    poly(ctx, [30.5, 22, 36, 17.5, 38.5, 14, 37.5, 17.5, 42, 14.5, 39.5, 18.5, 44, 18, 39.5, 21, 43, 23, 37.5, 23, 33.5, 24.5]);
    fs(ctx, lg(ctx, 30, 0, 44, 0, [0, '#8a5a1e', 1, '#c8962e']), '#3d2600', 0.8);
  }

  function darts(ctx) {
    // dartboard: black rim, cream/black segments, green and red bull
    ell(ctx, 24, 24, 20.5, 20.5);
    fs(ctx, '#111', '#000', 1.1);
    ell(ctx, 24, 24, 18.5, 18.5);
    fs(ctx, '#2a2a10', '#6b6b10', 1);
    for (var i = 0; i < 20; i++) {
      var a0 = (i / 20) * PI * 2 - PI / 2 - PI / 20, a1 = a0 + PI / 10;
      ctx.beginPath();
      ctx.moveTo(24, 24);
      ctx.arc(24, 24, 17.2, a0, a1);
      ctx.closePath();
      fs(ctx, i % 2 ? '#111' : '#f2e6b0');
    }
    ctx.beginPath();
    ctx.arc(24, 24, 10.5, 0, PI * 2);
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = '#8a8a4a';
    ctx.stroke();
    ell(ctx, 24, 24, 3.4, 3.4);
    fs(ctx, '#1ea01e', '#000', 0.7);
    ell(ctx, 24, 24, 1.6, 1.6);
    fs(ctx, '#e60000');
  }

  // --- the casino -----------------------------------------------------------------------------
  function slots(ctx) {
    // handle
    line(ctx, [38.5, 30, 38.5, 17], '#555', 1.8);
    ell(ctx, 38.5, 15.5, 2, 2);
    fs(ctx, '#8a8a8a', '#000', 0.8);
    rr(ctx, 36, 28, 4, 4, 0.8);
    fs(ctx, '#7a7a7a', '#000', 0.7);
    // cabinet
    rr(ctx, 11, 5, 26, 38, 2);
    fs(ctx, lg(ctx, 11, 0, 37, 0, [0, '#b3a300', 0.4, '#fff033', 0.7, '#e6d200', 1, '#8a7d00']), '#000', 1.2);
    rr(ctx, 13, 7.5, 22, 5, 0.8);
    fs(ctx, '#3d4d1a', '#000', 0.6);
    txt(ctx, 'SUPER SLOTS', 24, 11.3, 'bold 3.3px ' + AB, '#e6f266');
    rr(ctx, 13, 15, 22, 10.5, 1);
    fs(ctx, '#222', '#000', 0.8);
    for (var i = 0; i < 3; i++) {
      rr(ctx, 14.3 + i * 7, 16.2, 5.9, 8, 0.6);
      fs(ctx, '#fff', '#555', 0.4);
      txt(ctx, '$', 17.25 + i * 7, 23, 'bold 6.8px ' + AB, '#139c13');
    }
    rr(ctx, 13, 28, 22, 5, 0.6);
    fs(ctx, '#006622', '#000', 0.6);
    for (var j = 0; j < 3; j++) { rr(ctx, 14.5 + j * 7, 29, 5, 3, 0.4); fs(ctx, '#e6d200'); }
    rr(ctx, 9.5, 40.5, 29, 5, 1);
    fs(ctx, '#bdbdbd', '#000', 1);
  }

  function card(ctx, x, y, a, rank, suit, red) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    rr(ctx, 0, 0, 17, 25, 1.5);
    fs(ctx, '#fff', '#000', 1);
    txt(ctx, rank, 3.8, 6.5, 'bold 5.5px ' + AB, red ? '#e60000' : '#000');
    txt(ctx, suit, 3.8, 12, '6px Arial, sans-serif', red ? '#e60000' : '#000');
    ctx.restore();
  }
  function blackjack(ctx) {
    card(ctx, 5, 14, -0.32, 'Q', '♥', true);
    card(ctx, 17, 9, -0.08, '7', '♠', false);
    card(ctx, 30, 7.5, 0.22, '10', '♣', false);
  }

  function roulette(ctx) {
    // a corner of the wheel: wooden rim, pockets, the ball
    ctx.save();
    rr(ctx, 0, 0, 48, 48, 5);
    ctx.clip();
    var cx = 46, cy = 50;
    ell(ctx, cx, cy, 42, 42);
    fs(ctx, lg(ctx, 0, 10, 40, 40, [0, '#6b3300', 0.5, '#a0521e', 1, '#5c2a00']), '#000', 1.3);
    ell(ctx, cx, cy, 36, 36);
    fs(ctx, '#e8e0d0', '#000', 1);
    ell(ctx, cx, cy, 33, 33);
    fs(ctx, '#8b4513', '#000', 1);
    for (var i = 0; i < 18; i++) {
      var a0 = PI + i * (PI / 18), a1 = a0 + PI / 18;
      ctx.beginPath();
      ctx.arc(cx, cy, 30, a0, a1);
      ctx.arc(cx, cy, 20, a1, a0, true);
      ctx.closePath();
      fs(ctx, i % 2 ? '#111' : '#e60000', '#c8a64a', 0.4);
    }
    ell(ctx, cx, cy, 20, 20);
    fs(ctx, rg(ctx, cx - 6, cy - 6, 2, 22, [0, '#c47a3a', 1, '#6b3300']), '#000', 1);
    ell(ctx, 20.5, 25.5, 2.2, 1.6, -0.6);
    fs(ctx, '#fff', '#555', 0.5);
    ctx.restore();
  }

  // --- McSticks -------------------------------------------------------------------------------
  function milkshake(ctx) {
    // metal cup, pink shake, bent straw, cherry
    line(ctx, [22.5, 18, 17, 5.5, 12.5, 7.5], '#1e1e1e', 3.4);
    line(ctx, [22.5, 18, 17, 5.5, 12.5, 7.5], '#8a8a8a', 1.8);
    ctx.beginPath();
    ctx.moveTo(11, 17);
    ctx.bezierCurveTo(10, 10, 17, 9.5, 21, 11);
    ctx.bezierCurveTo(26, 8.5, 36, 9.5, 37, 17);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, 9, 0, 17, [0, '#ff8cb3', 1, '#ff4d88']), '#000', 1.1);
    poly(ctx, [11, 16.5, 37, 16.5, 34, 43, 14, 43]);
    fs(ctx, lg(ctx, 11, 0, 37, 0, [0, '#8a8aa3', 0.3, '#c4c4dd', 0.5, '#a3a3bd', 0.7, '#cfcfe6', 1, '#7a7a94']), '#000', 1.3);
    line(ctx, [19, 18, 19.5, 42], 'rgba(255,255,255,0.45)', 1.4);
    line(ctx, [29.5, 18, 29, 42], 'rgba(90,90,120,0.45)', 1.2);
    line(ctx, [30.5, 11.5, 34, 6.5], '#006600', 0.9);
    poly(ctx, [32, 8.5, 36.5, 5, 35, 9.5]);
    fs(ctx, '#33aa33', '#004400', 0.5);
    ell(ctx, 29.5, 13.2, 3.5, 3.5);
    fs(ctx, rg(ctx, 28.3, 12, 0.5, 3.8, [0, '#ff6666', 1, '#cc0000']), '#330000', 0.8);
    ell(ctx, 28.2, 12, 0.9, 0.7);
    fs(ctx, '#fff');
  }

  function fries(ctx) {
    // yellow fries in a red carton
    var f = [[12, 21, 10.5, 6], [15, 21, 14, 3.5], [18, 21, 18.5, 5], [21, 20, 21, 2.5], [24, 20, 25, 4], [27, 20, 28, 3],
      [30, 20, 31.5, 5.5], [33, 21, 35.5, 4.5], [36, 21, 38.5, 7.5], [16.5, 21, 12.5, 9], [26, 21, 23, 7], [32, 21, 34, 9.5]];
    f.forEach(function (p) {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[2], p[3]);
      ctx.lineCap = 'butt';
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = '#b35900';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffd11a';
      ctx.stroke();
    });
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(9.5, 15.5);
    ctx.quadraticCurveTo(24, 26, 38.5, 15.5);
    ctx.lineTo(35, 44);
    ctx.lineTo(13, 44);
    ctx.closePath();
    fs(ctx, lg(ctx, 9, 0, 39, 0, [0, '#990000', 0.3, '#ff1a1a', 0.55, '#e60000', 1, '#8c0000']), '#000', 1.3);
    line(ctx, [15.5, 24, 16.5, 42], 'rgba(255,120,120,0.55)', 1.2);
  }

  function bunTop(ctx, x0, y0, w, h) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    ctx.bezierCurveTo(x0 - 1, y0 - h * 0.15, x0 + w * 0.2, y0, x0 + w / 2, y0);
    ctx.bezierCurveTo(x0 + w * 0.8, y0, x0 + w + 1, y0 - h * 0.15, x0 + w, y0 + h);
    ctx.closePath();
    fs(ctx, rg(ctx, x0 + w * 0.35, y0 + h * 0.3, 1, w * 0.7, [0, '#f2b35a', 0.5, '#cc8024', 1, '#8a4d0a']), '#000', 1.2);
    ell(ctx, x0 + w * 0.3, y0 + h * 0.4, w * 0.12, h * 0.16, -0.3);
    fs(ctx, 'rgba(255,230,170,0.55)');
  }
  function patty(ctx, x0, y0, w, h) {
    rr(ctx, x0, y0, w, h, h / 2);
    fs(ctx, lg(ctx, 0, y0, 0, y0 + h, [0, '#7a3d0a', 1, '#3d1a00']), '#000', 1);
  }
  function cheese(ctx, x0, y0, w) {
    poly(ctx, [x0, y0, x0 + w, y0, x0 + w + 2, y0 + 3.5, x0 + w * 0.7, y0 + 1.5, x0 + w * 0.5, y0 + 4.5, x0 + w * 0.3, y0 + 1.5, x0 - 2, y0 + 3.5]);
    fs(ctx, '#ffd11a', '#000', 0.8);
  }
  function lettuce(ctx, x0, y0, w) {
    ctx.beginPath();
    ctx.moveTo(x0 - 1.5, y0);
    for (var i = 0; i <= 10; i++) ctx.lineTo(x0 - 1.5 + (w + 3) * i / 10, y0 + (i % 2 ? 3.2 : 0.3));
    ctx.lineTo(x0 + w, y0 - 1);
    ctx.closePath();
    fs(ctx, '#3cb33c', '#0b4d0b', 0.7);
  }
  function burger(ctx) {
    bunTop(ctx, 5, 10, 38, 13);
    cheese(ctx, 6, 22.5, 36);
    patty(ctx, 5, 24, 38, 6);
    ctx.beginPath();
    ctx.moveTo(5.5, 31);
    ctx.lineTo(42.5, 31);
    ctx.bezierCurveTo(43, 37, 38, 38.5, 24, 38.5);
    ctx.bezierCurveTo(10, 38.5, 5, 37, 5.5, 31);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, 31, 0, 38.5, [0, '#e6a04a', 1, '#9a5a14']), '#000', 1.1);
  }

  function tripleburger(ctx) {
    bunTop(ctx, 6, 4.5, 36, 11);
    lettuce(ctx, 6, 14.5, 36);
    cheese(ctx, 7, 16, 34);
    patty(ctx, 6, 17.5, 36, 5);
    poly(ctx, [8, 23, 40, 23, 38, 26, 10, 26]);
    fs(ctx, '#e62e2e', '#600', 0.7);
    patty(ctx, 6, 25.5, 36, 5);
    lettuce(ctx, 6, 30.5, 36);
    cheese(ctx, 7, 31.5, 34);
    patty(ctx, 6, 33, 36, 5);
    ctx.beginPath();
    ctx.moveTo(6.5, 38.5);
    ctx.lineTo(41.5, 38.5);
    ctx.bezierCurveTo(42, 44, 37, 45, 24, 45);
    ctx.bezierCurveTo(11, 45, 6, 44, 6.5, 38.5);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, 38.5, 0, 45, [0, '#e6a04a', 1, '#9a5a14']), '#000', 1.1);
  }

  // --- bus depot, furniture, university -------------------------------------------------------
  function bus(ctx) {
    // a white coach driving at you, seen from the side and front
    ctx.save();
    rr(ctx, 0, 0, 48, 48, 5);
    ctx.clip();
    poly(ctx, [-6, 21, 26, 2, 52, 10, 52, 18, 21, 43, -6, 35]);
    fs(ctx, '#fafafa', '#000', 1.3);
    poly(ctx, [21, 43, 52, 18, 52, 10, 21, 35]);
    fs(ctx, '#e0e0e0', '#000', 1);
    poly(ctx, [-6, 35, 21, 43, 21, 35, -6, 27]);
    fs(ctx, '#f0f0f0');
    for (var i = 0; i < 4; i++) {
      var x = -3 + i * 6;
      poly(ctx, [x, 29.5 + i * 1.8, x + 4.8, 31 + i * 1.8, x + 4.8, 34.5 + i * 1.8, x, 33 + i * 1.8]);
      fs(ctx, '#33ccff', '#000', 0.7);
    }
    poly(ctx, [23.5, 35.5, 50, 14.5, 50, 19.5, 23.5, 40]);
    fs(ctx, '#1a66cc', '#000', 0.8);
    line(ctx, [-6, 38.5, 21, 46.5, 52, 22], '#1a33aa', 1.6);
    ell(ctx, 14, 43.5, 3.6, 3.6);
    fs(ctx, '#111', '#000', 1);
    ell(ctx, 14, 43.5, 1.4, 1.4);
    fs(ctx, '#999');
    ctx.restore();
  }

  function bed(ctx) {
    // orange frame, white mattress and pillows, headboard at the back
    poly(ctx, [27, 13, 44, 13, 44, 27, 38, 30, 38, 16, 27, 16]);
    fs(ctx, '#b35900', '#000', 1.1);
    poly(ctx, [4, 26, 13, 18, 43, 18, 36, 26]);
    fs(ctx, '#fafafa', '#000', 1.1);
    rr(ctx, 29, 19, 8, 3.8, 1.8);
    fs(ctx, '#fff', '#000', 0.8);
    rr(ctx, 20.5, 19, 8, 3.8, 1.8);
    fs(ctx, '#fff', '#000', 0.8);
    poly(ctx, [4, 26, 36, 26, 36, 37, 4, 37]);
    fs(ctx, lg(ctx, 0, 26, 0, 37, [0, '#e67300', 1, '#b35900']), '#000', 1.2);
    poly(ctx, [36, 26, 43, 18, 43, 29, 36, 37]);
    fs(ctx, '#8a4400', '#000', 1.1);
  }

  function tv(ctx) {
    // grey CRT box on a black base
    poly(ctx, [9, 9, 14, 5, 40, 5, 35, 9]);
    fs(ctx, '#c4c4c4', '#000', 1);
    poly(ctx, [35, 9, 40, 5, 40, 38, 35, 43]);
    fs(ctx, lg(ctx, 35, 0, 40, 0, [0, '#8a8a8a', 1, '#4d4d4d']), '#000', 1);
    rr(ctx, 9, 9, 26, 22, 0.5);
    fs(ctx, lg(ctx, 0, 9, 0, 31, [0, '#9a9a9a', 1, '#5c5c5c']), '#000', 1.1);
    rr(ctx, 11.5, 11.5, 21, 16.5, 1.5);
    fs(ctx, rg(ctx, 18, 16, 1, 16, [0, '#8a8a8a', 1, '#4a4a4a']), '#111', 1);
    rr(ctx, 9, 31, 26, 12, 0.5);
    fs(ctx, '#262626', '#000', 1.1);
  }

  function computer(ctx) {
    // CRT monitor with a black screen, and the tower beside it
    rr(ctx, 30, 9, 13, 29, 0.6);
    fs(ctx, lg(ctx, 30, 0, 43, 0, [0, '#f2f2f2', 1, '#b3b3b3']), '#000', 1.1);
    for (var i = 0; i < 3; i++) {
      rr(ctx, 31.5, 12 + i * 5.5, 10, 3.5, 0.4);
      fs(ctx, '#d6d6d6', '#333', 0.6);
    }
    ell(ctx, 40, 32.5, 1.2, 1.2);
    fs(ctx, '#333');
    rr(ctx, 4.5, 10.5, 24, 20, 1);
    fs(ctx, '#f2f2f2', '#000', 1.1);
    rr(ctx, 7, 13, 19, 14.5, 0.5);
    fs(ctx, '#050505', '#000', 0.6);
    poly(ctx, [13, 30.5, 20, 30.5, 22, 34.5, 11, 34.5]);
    fs(ctx, '#e6e6e6', '#000', 0.9);
    rr(ctx, 7.5, 34.5, 18, 2.8, 0.6);
    fs(ctx, '#e0e0e0', '#000', 0.9);
  }

  function satellite(ctx) {
    // a grey dish on a post, feed arm to the centre
    line(ctx, [20, 30, 16, 44], '#333', 3);
    line(ctx, [20, 30, 26, 44], '#333', 3);
    line(ctx, [11, 44, 31, 44], '#333', 3);
    ctx.save();
    rot(ctx, 22, 21, -0.6);
    ell(ctx, 22, 21, 17, 9.5);
    fs(ctx, rg(ctx, 18, 18, 1, 18, [0, '#f2f2f2', 0.6, '#b8b8b8', 1, '#7a7a7a']), '#000', 1.3);
    ell(ctx, 22, 21, 12, 6);
    fs(ctx, null, 'rgba(90,90,90,0.6)', 0.7);
    ctx.restore();
    line(ctx, [22, 21, 33, 11], '#222', 1.5);
    ell(ctx, 33.5, 10.5, 2.2, 2.2);
    fs(ctx, '#555', '#000', 0.8);
  }

  function books(ctx) {
    // the Xgenica collection: a row of hardbacks
    var cols = [['#b31a1a', '#e64d4d'], ['#1a4db3', '#4d80e6'], ['#1a8a33', '#4dbf66'], ['#8a1ab3', '#bf4de6']];
    cols.forEach(function (c, i) {
      var x = 7 + i * 8.6;
      rr(ctx, x, 7 + (i % 2) * 2, 8, 35 - (i % 2) * 2, 0.8);
      fs(ctx, lg(ctx, x, 0, x + 8, 0, [0, c[0], 0.5, c[1], 1, c[0]]), '#000', 1.1);
      ctx.fillStyle = '#e6c84d';
      ctx.fillRect(x + 1, 12, 6, 1.6);
      ctx.fillRect(x + 1, 34, 6, 1.6);
      ctx.fillRect(x + 2, 18, 4, 7);
    });
    rr(ctx, 5, 42, 38, 2.5, 0.6);
    fs(ctx, '#7a4a1a', '#000', 0.8);
  }

  function treadmill(ctx) {
    // belt deck, console post and hand rail
    line(ctx, [35, 36, 38, 12], '#333', 2.6);
    line(ctx, [38, 12, 28, 13], '#333', 2.2);
    rr(ctx, 34, 8, 10, 6, 1);
    fs(ctx, '#555', '#000', 1);
    ctx.fillStyle = '#33ff66';
    ctx.fillRect(36, 9.8, 6, 2.2);
    poly(ctx, [4, 36, 13, 29, 44, 32, 36, 40]);
    fs(ctx, '#2a2a2a', '#000', 1.2);
    poly(ctx, [4, 36, 36, 40, 36, 43.5, 4, 39.5]);
    fs(ctx, '#8a8a8a', '#000', 1.1);
    poly(ctx, [36, 40, 44, 32, 44, 35.5, 36, 43.5]);
    fs(ctx, '#5c5c5c', '#000', 1);
    for (var i = 0; i < 5; i++) line(ctx, [8 + i * 6, 35 - i * 0.8, 15 + i * 6, 30.5 + i * 0.4], '#444', 0.6);
  }

  function freezer(ctx) {
    // the Deep Freeze: a tall grey box with a handle
    poly(ctx, [10, 9, 15, 5, 38, 5, 33, 9]);
    fs(ctx, '#e6e6e6', '#000', 1);
    poly(ctx, [33, 9, 38, 5, 38, 39, 33, 44]);
    fs(ctx, '#8a8a8a', '#000', 1);
    rr(ctx, 10, 9, 23, 35, 0.6);
    fs(ctx, lg(ctx, 10, 0, 33, 0, [0, '#9a9a9a', 0.4, '#d6d6d6', 1, '#a8a8a8']), '#000', 1.2);
    rr(ctx, 12.5, 16, 1.8, 15, 0.8);
    fs(ctx, '#4a4a4a');
  }

  function minibar(ctx) {
    // a little bar fridge with bottles on top
    [[13, 4, '#1a8a1a'], [19, 7, '#8a1a1a'], [25, 3, '#8a8a1a']].forEach(function (b) {
      rr(ctx, b[0], b[1] + 5, 5, 11, 1.2);
      fs(ctx, b[2], '#000', 0.8);
      rr(ctx, b[0] + 1.5, b[1], 2, 6, 0.5);
      fs(ctx, b[2], '#000', 0.7);
    });
    rr(ctx, 8, 20, 32, 24, 1.2);
    fs(ctx, lg(ctx, 8, 0, 40, 0, [0, '#6b3a14', 0.5, '#a3642e', 1, '#5c3010']), '#000', 1.2);
    rr(ctx, 11, 23, 26, 18, 0.8);
    fs(ctx, '#e6e6e6', '#000', 0.9);
    rr(ctx, 33, 27, 1.8, 9, 0.8);
    fs(ctx, '#777');
  }

  function study(ctx) {
    // "6 NARCOTICS OF THE WORLD": a red hardback with a grey cover plate
    poly(ctx, [38, 7, 42, 9, 42, 44, 38, 42]);
    fs(ctx, '#f2f2f2', '#000', 0.9);
    for (var i = 0; i < 4; i++) line(ctx, [39, 11 + i * 8, 41.2, 12 + i * 8], '#aaa', 0.5);
    rr(ctx, 7, 5, 31, 38, 0.6);
    fs(ctx, '#cc3300', '#000', 1.2);
    rr(ctx, 13.5, 6.5, 23, 34.5, 0.5);
    fs(ctx, rg(ctx, 25, 20, 1, 22, [0, '#8a8a8a', 0.5, '#5c5c5c', 1, '#3d3d3d']), '#222', 0.6);
    ctx.save();
    rr(ctx, 13.5, 6.5, 23, 34.5, 0.5);
    ctx.clip();
    for (var j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.arc(30, 14, 4 + j * 4, 0, PI * 2);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(160,160,160,0.6)';
      ctx.stroke();
    }
    ctx.restore();
    rr(ctx, 9, 8, 8, 9, 0.4);
    fs(ctx, '#111', '#fff', 0.5);
    txt(ctx, '6', 13, 16, 'bold 8px ' + TIMES, '#fff');
    rr(ctx, 10, 22, 26, 8.5, 0.4);
    fs(ctx, '#111');
    txt(ctx, 'NARCOTICS', 23, 27, 'bold 4.1px ' + AB, '#fff');
    txt(ctx, 'OF THE WORLD', 23, 29.6, 'bold 2.2px ' + AB, '#ccc');
  }

  function klass(ctx) {
    // green chalkboard in a wooden frame, chalk scribbles
    rr(ctx, 6, 5, 36, 38, 1.5);
    fs(ctx, lg(ctx, 6, 5, 42, 43, [0, '#a36b2e', 1, '#6b4010']), '#000', 1.2);
    rr(ctx, 9, 8, 30, 30, 0.5);
    fs(ctx, '#235c2e', '#0f2e14', 0.8);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(11, 11); ctx.lineTo(13.5, 11); ctx.moveTo(11, 14); ctx.lineTo(15, 14);
    ctx.moveTo(11, 17); ctx.lineTo(14, 17); ctx.moveTo(11, 20); ctx.lineTo(16, 20);
    ctx.moveTo(20, 12); ctx.lineTo(27, 18); ctx.lineTo(33, 12); ctx.lineTo(20, 12);
    ctx.moveTo(27, 18); ctx.lineTo(27, 25); ctx.lineTo(33, 25); ctx.lineTo(33, 12);
    ctx.moveTo(12, 25); ctx.lineTo(18, 25); ctx.moveTo(14, 28); ctx.lineTo(21, 28);
    ctx.stroke();
    [[20, 12], [27, 18], [33, 12], [27, 25], [33, 25]].forEach(function (p) {
      ell(ctx, p[0], p[1], 1.2, 1.2);
      fs(ctx, null, 'rgba(255,255,255,0.9)', 0.5);
    });
    txt(ctx, 'PROPERTIES', 24, 33, 'bold 3.6px ' + AB, 'rgba(255,255,255,0.9)');
    txt(ctx, 'OF ELEMENTS', 24, 36.5, 'bold 2.6px ' + AB, 'rgba(255,255,255,0.8)');
    ctx.restore();
    rr(ctx, 9, 38.5, 30, 2.5, 0.4);
    fs(ctx, '#8a5a1e', '#000', 0.6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(28, 38.2, 5, 1.5);
  }

  function gym(ctx) {
    // a barbell with black plates, seen at an angle
    function plate(x, y, r) {
      ell(ctx, x, y, r * 0.75, r, -0.5);
      fs(ctx, rg(ctx, x - r * 0.3, y - r * 0.4, 0.5, r, [0, '#555', 1, '#111']), '#000', 1.1);
      ell(ctx, x, y, r * 0.3, r * 0.4, -0.5);
      fs(ctx, '#777', '#000', 0.6);
    }
    plate(10, 32, 10.5);
    plate(15, 30, 9.5);
    line(ctx, [10, 32, 38, 16], '#000', 3.6);
    line(ctx, [10, 32, 38, 16], '#b8b8b8', 2);
    plate(33, 19, 9.5);
    plate(38, 16, 10.5);
    line(ctx, [37, 16.5, 44, 12.5], '#000', 3.6);
    line(ctx, [37, 16.5, 44, 12.5], '#b8b8b8', 2);
    line(ctx, [4, 35.5, 11, 31.5], '#000', 3.6);
    line(ctx, [4, 35.5, 11, 31.5], '#b8b8b8', 2);
  }

  // --- home / TV ------------------------------------------------------------------------------
  function campaign(ctx) {
    // a ballot box with a marked ballot going in
    poly(ctx, [8, 20, 14, 15, 40, 15, 34, 20]);
    fs(ctx, '#cfcfcf', '#000', 1);
    poly(ctx, [34, 20, 40, 15, 40, 38, 34, 43]);
    fs(ctx, '#7a7a7a', '#000', 1);
    rr(ctx, 8, 20, 26, 23, 0.6);
    fs(ctx, lg(ctx, 8, 0, 34, 0, [0, '#1a4db3', 1, '#0d2e80']), '#000', 1.2);
    txt(ctx, 'VOTE', 21, 35, 'bold 7px ' + AB, '#fff');
    poly(ctx, [19, 17.5, 21, 3, 35, 5, 33, 18]);
    fs(ctx, '#fff', '#000', 0.9);
    line(ctx, [24, 9, 26.5, 12, 31, 6], '#e60000', 1.6);
    poly(ctx, [15, 17, 33, 17, 33, 18.6, 15, 18.6]);
    fs(ctx, '#111');
  }

  // --- the street -----------------------------------------------------------------------------
  function coin(ctx, x, y, rx, ry) {
    ell(ctx, x, y + 1.8, rx, ry);
    fs(ctx, '#8a8a8a', '#000', 0.9);
    ell(ctx, x, y, rx, ry);
    fs(ctx, lg(ctx, x - rx, y, x + rx, y, [0, '#bdbdbd', 0.45, '#ffffff', 1, '#a3a3a3']), '#000', 0.9);
    ell(ctx, x, y, rx * 0.75, ry * 0.7);
    fs(ctx, null, 'rgba(120,120,120,0.6)', 0.6);
  }
  function give10(ctx) {
    coin(ctx, 17, 25, 11, 4);
    coin(ctx, 29, 22.5, 11, 4);
    coin(ctx, 31, 28, 11, 4);
  }

  function powder(ctx) {
    // a little white heap
    ctx.beginPath();
    ctx.moveTo(4, 31);
    ctx.bezierCurveTo(10, 30, 14, 24, 19, 19);
    ctx.lineTo(22, 21);
    ctx.lineTo(25, 17);
    ctx.bezierCurveTo(30, 22, 36, 29, 44, 31);
    ctx.quadraticCurveTo(24, 33.5, 4, 31);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, 17, 0, 32, [0, '#ffffff', 1, '#d6dce6']), 'rgba(90,100,120,0.8)', 0.7);
    poly(ctx, [25, 17, 30, 23, 36, 29, 44, 31, 34, 31.5, 29, 26]);
    fs(ctx, 'rgba(150,160,180,0.45)');
  }
  function cocaine(ctx) { powder(ctx); }

  function hotwire(ctx) {
    // a silver key: ring bottom-left, bit top-right
    line(ctx, [16, 32, 38, 10], '#000', 5);
    line(ctx, [16, 32, 38, 10], '#d6d6d6', 3);
    poly(ctx, [30, 18, 33, 21, 35, 19, 32.5, 16.5]);
    fs(ctx, '#bdbdbd', '#000', 0.9);
    poly(ctx, [34, 14, 37, 17, 39, 15, 36.5, 12.5]);
    fs(ctx, '#bdbdbd', '#000', 0.9);
    ell(ctx, 12, 36, 7.5, 7.5);
    fs(ctx, lg(ctx, 5, 30, 19, 43, [0, '#f2f2f2', 1, '#8a8a8a']), '#000', 1.2);
    ell(ctx, 11, 37, 3.2, 3.2);
    fs(ctx, '#3399ff', '#000', 1);
  }

  // --- the bar fight --------------------------------------------------------------------------
  function punch(ctx) {
    stickman(ctx, 19, 13, 7, [[19, 20, 19, 33], [19, 33, 15.5, 44], [19, 33, 19, 44], [19, 24, 12, 29.5, 16, 33],
      [19, 24, 29, 26.5, 34.5, 23]]);
  }
  function kick(ctx) {
    ctx.save();
    rr(ctx, 0, 0, 48, 48, 5);
    ctx.clip();
    stickman(ctx, 15, 3.5, 7, [[17, 10, 22, 26], [22, 26, 15, 36, 22, 43], [22, 26, 34, 27.5, 43, 37], [18.5, 14, 11, 23, 8, 18], [18.5, 14, 26, 20]]);
    ctx.restore();
  }
  function fireball(ctx) {
    stickman(ctx, 13, 13, 7, [[13, 20, 13, 33], [13, 33, 10, 44], [13, 33, 16, 44], [13, 24, 7, 30], [13, 24, 22, 27.5, 26, 25.5]]);
    // the fireball
    ctx.beginPath();
    var cx = 36, cy = 27;
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * PI * 2;
      var r = i % 2 ? 3.5 : 6.5 + (i % 3);
      ctx.lineTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 0.8);
    }
    ctx.closePath();
    fs(ctx, rg(ctx, cx, cy, 0.5, 8, [0, '#ffe066', 0.5, '#ff8000', 1, '#e63300']), '#992200', 0.6);
  }
  function energy(ctx) {
    stickman(ctx, 13, 13, 7, [[13, 20, 13, 33], [13, 33, 10, 44], [13, 33, 16, 44], [13, 24, 7, 30], [13, 24, 22, 27.5, 26, 25.5]]);
    ell(ctx, 34, 25, 6.5, 6.5);
    fs(ctx, rg(ctx, 32.5, 23.5, 0.5, 7, [0, '#ffffff', 0.5, '#bfe6ff', 1, '#3d8cff']), null);
    ctx.lineCap = 'round';
    [[34, 14.5, 34, 16.5], [43.5, 25, 41.5, 25], [41, 18, 39.5, 19.5], [41, 32, 39.5, 30.5], [27.5, 16.5, 29, 18]].forEach(function (l) {
      line(ctx, l, '#8cc8ff', 0.9);
    });
  }
  function run(ctx) {
    stickman(ctx, 32, 11.5, 6.5, [[31, 18, 26, 30], [26, 30, 21, 36, 16, 34], [26, 30, 31, 38, 30.5, 45], [29.5, 21, 22, 23, 20, 28],
      [29.5, 21, 36, 25, 41, 22]]);
    ctx.lineCap = 'round';
    line(ctx, [5, 13, 16, 13], '#000', 1.2);
    line(ctx, [3, 19, 14, 19], '#000', 1.2);
    line(ctx, [6, 25, 15, 25], '#000', 1.2);
  }
  function done(ctx) {
    // a round arrow closing on itself
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(24, 24, 12.5, PI * 0.85, PI * 2.45);
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    ctx.lineWidth = 6.8;
    ctx.strokeStyle = lg(ctx, 10, 10, 38, 38, [0, '#1a8cff', 0.5, '#0a4de6', 1, '#001a80']);
    ctx.stroke();
    poly(ctx, [27, 29.5, 38, 29, 33.5, 41]);
    fs(ctx, '#001a80', '#000', 1);
    ctx.restore();
  }

  // --- inventory extras -----------------------------------------------------------------------
  function skateArt(ctx) {
    // deck from below: navy with a light-blue X and stars, yellow wheels (drawn along the x axis)
    rr(ctx, -30, -7.5, 60, 15, 7.5);
    fs(ctx, lg(ctx, 0, -7.5, 0, 7.5, [0, '#3a4da6', 1, '#1f2b73']), '#000', 1.1);
    function star(x, y, r) {
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -PI / 2 + (i * PI) / 5;
        ctx.lineTo(x + Math.cos(a) * (i % 2 ? r * 0.45 : r), y + Math.sin(a) * (i % 2 ? r * 0.45 : r));
      }
      ctx.closePath();
      fs(ctx, '#3399ff', '#000', 0.5);
    }
    star(-23, 0.5, 2.6);
    star(23, -1, 2.6);
    txt(ctx, 'X', 1, 5, 'bold 14px ' + AB, '#33ccff', '#001a4d', 1.2);
    [[-15, 5.5], [-8, 7.5], [9, 5.5], [16, 7.5]].forEach(function (w) {
      rr(ctx, w[0] - 2, w[1] - 3, 4, 4.5, 0.6);
      fs(ctx, '#9a9a9a', '#000', 0.6);
      ell(ctx, w[0], w[1] + 2, 3.3, 3.3);
      fs(ctx, '#ffff99', '#000', 0.9);
      ell(ctx, w[0], w[1] + 2, 1.3, 1.3);
      fs(ctx, '#888');
    });
  }
  function skateboard(ctx) {
    ctx.save();
    ctx.translate(24, 24);
    ctx.rotate(-0.55);
    ctx.scale(0.72, 0.72);
    skateArt(ctx);
    ctx.restore();
  }

  function car(ctx) {
    // the hotwired junker: a yellow hatchback from the side
    ctx.beginPath();
    ctx.moveTo(4, 32);
    ctx.lineTo(5, 25);
    ctx.lineTo(13, 23);
    ctx.lineTo(19, 15);
    ctx.lineTo(33, 15);
    ctx.lineTo(39, 23);
    ctx.lineTo(44, 25);
    ctx.lineTo(44, 32);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, 15, 0, 32, [0, '#ffe34d', 1, '#e6b800']), '#000', 1.2);
    poly(ctx, [15, 23, 20, 17, 25.5, 17, 25.5, 23]);
    fs(ctx, '#66ccff', '#000', 0.8);
    poly(ctx, [27.5, 23, 27.5, 17, 32, 17, 36.5, 23]);
    fs(ctx, '#66ccff', '#000', 0.8);
    ell(ctx, 13, 32, 4.6, 4.6);
    fs(ctx, '#222', '#000', 1);
    ell(ctx, 13, 32, 1.8, 1.8);
    fs(ctx, '#aaa');
    ell(ctx, 35, 32, 4.6, 4.6);
    fs(ctx, '#222', '#000', 1);
    ell(ctx, 35, 32, 1.8, 1.8);
    fs(ctx, '#aaa');
    rr(ctx, 41.5, 26, 2.5, 2, 0.5);
    fs(ctx, '#ff6600');
  }

  // --- registry -------------------------------------------------------------------------------
  var ICONS = {
    // general
    leave: leave, ok: ok, cancel: cancel, house: house, money: money, work: work, sleep: sleep, save: save,
    messages: messages, zzz: sleep, done: done,
    // store
    slushee: slushee, candybar: candybar, nachos: nachos, smokes: smokes, pills: pills, rob: gun,
    // New Lines Inc. (every job's WORK button shows the cash bundle, as in the original)
    apply: apply, promotion: apply, janitor: work, mailroom: work, sales: work, executive: work,
    vicepresident: work, ceo: work,
    // bank (real estate lists every home with the same house)
    deposit: money, withdraw: money, loan: money, repay: money, realestate: house, apartment: house,
    penthouse: house, mansion: house, castle: house,
    // pawn shop
    alarm: alarm, knife: knife, gun: gun, ammo: ammo, cellphone: cellphone,
    // Sticky's
    beer: beer, bottle: bottle, barfight: barfight, darts: darts,
    // casino
    slots: slots, blackjack: blackjack, roulette: roulette,
    // McSticks
    milkshake: milkshake, fries: fries, burger: burger, tripleburger: tripleburger, cook: work,
    // bus depot
    bus: bus,
    // furniture
    bed: bed, tv: tv, computer: computer, satellite: satellite, books: books, treadmill: treadmill,
    freezer: freezer, minibar: minibar,
    // University of Stick
    study: study, class: klass, gym: gym,
    // home: the satellite channels all show the TV; stocks the cash bundle
    news: tv, stocks: work, campaign: campaign, fitness: tv, dating: tv,
    // street people
    give10: give10, givebooze: bottle, givesmokes: smokes, cocaine: cocaine, hotwire: hotwire,
    // bar fight
    punch: punch, kick: kick, fireball: fireball, energy: energy, run: run,
    // inventory
    skateboard: skateboard, car: car,
  };

  // Deposit / withdraw / repay: the gold "$" with a small arrow or tick.
  ICONS.deposit = function (ctx) {
    dollarSign(ctx, 20, 25, 32);
    poly(ctx, [33, 28, 43, 28, 38, 36]);
    fs(ctx, '#33cc33', '#003300', 1);
    ctx.fillStyle = '#33cc33';
    ctx.fillRect(36, 18, 4, 11);
    ctx.strokeStyle = '#003300';
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 18, 4, 10.5);
  };
  ICONS.withdraw = function (ctx) {
    dollarSign(ctx, 20, 25, 32);
    poly(ctx, [33, 26, 43, 26, 38, 18]);
    fs(ctx, '#ff9900', '#4d2600', 1);
    ctx.fillStyle = '#ff9900';
    ctx.fillRect(36, 25.5, 4, 11);
    ctx.strokeStyle = '#4d2600';
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 26, 4, 10.5);
  };
  ICONS.repay = function (ctx) {
    dollarSign(ctx, 20, 25, 32);
    ctx.lineCap = 'round';
    line(ctx, [32, 30, 36, 35, 44, 23], '#003300', 5);
    line(ctx, [32, 30, 36, 35, 44, 23], '#33cc33', 2.8);
  };

  // sizes matched to the original tiles
  ICONS.burger = scaled(burger, 1.12, 1.15, 24, 25);
  ICONS.messages = scaled(messages, 1.2, 1.06, 24, 25);
  ICONS.smokes = scaled(smokes, 1.2, 1.2, 24, 25);
  ICONS.givesmokes = ICONS.smokes;
  ICONS.pills = scaled(pills, 1.15, 1.15, 24, 25);
  ICONS.knife = scaled(knife, 1.1, 1.1, 24, 26);
  ICONS.bottle = ICONS.givebooze = scaled(bottle, 1.12, 1.12, 24, 24);
  ICONS.house = ICONS.realestate = ICONS.apartment = ICONS.penthouse = ICONS.mansion = ICONS.castle = scaled(house, 1.1, 1.1, 24, 26);
  ICONS.tv = ICONS.news = ICONS.fitness = ICONS.dating = scaled(tv, 1.08, 1.05, 24, 24);

  var NAMES = Object.keys(ICONS);

  // Inventory pictures (sprite 724's item clips): which art, its size, and a turn.
  var ITEM_ART = {
    smokes: function (ctx) { ctx.rotate(0.36); ctx.scale(1.42, 1.42); ctx.translate(-25.5, -25); smokesPack(ctx); },
    knife: function (ctx) { ctx.scale(1.12, 1.12); ctx.translate(-24, -24); knifeArt(ctx); },
    gun: function (ctx) { ctx.scale(1.55, 1.55); ctx.translate(-24.5, -26); gunArt(ctx); },
    pills: function (ctx) { ctx.rotate(0.33); ctx.scale(1.08, 1.08); ctx.translate(-24, -25); pillBottle(ctx); },
    cocaine: function (ctx) { ctx.scale(0.78, 0.78); ctx.translate(-24, -26); powder(ctx); },
    skateboard: function (ctx) { ctx.rotate(-0.2); ctx.scale(1.42, 1.42); skateArt(ctx); },
    beer: function (ctx) { ctx.scale(1.05, 1.05); ctx.translate(-24, -24); bottleArt(ctx); },
    cellphone: function (ctx) { ctx.scale(-1, 1); ctx.rotate(0.3); ctx.scale(1.3, 1.1); ctx.translate(-24, -24.5); phoneArt(ctx); },
  };

  SRPG.icons = {
    names: NAMES,
    has: function (name) { return !!ICONS[name]; },
    // Draw icon `name` into a size x size square at the current origin.
    draw: function (ctx, name, size) {
      var f = ICONS[name];
      if (!f) return false;
      ctx.save();
      ctx.scale(size / 48, size / 48);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      f(ctx);
      ctx.restore();
      return true;
    },
    // Draw an inventory picture centred on its registration point (the current origin).
    item: function (ctx, id, box) {
      var f = ITEM_ART[id];
      if (!f) return false;
      ctx.save();
      if (box) ctx.translate(box[0] + box[2] / 2, box[1] + box[3] / 2);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      f(ctx);
      ctx.restore();
      return true;
    },
    dollar: dollarSign,
  };
})();
