// Silver Lining Casino (the original's root frame 40): the vaulted red-carpet lobby with its fountain,
// and the menu PLAY SLOTS / PLAY BLACKJACK / PLAY ROULETTE / LEAVE. The casino has no entry
// conditions and no time cost: it is open around the clock and the games never advance the clock.
// The lobby art is shared with the slots screen (SRPG.casinoArt), which is drawn in the same room.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;
  var W = SRPG.W, H = SRPG.H;

  // --- lobby art -------------------------------------------------------------------------------
  // A tunnel-like vault: two grey arch ribs (fitted to the original's outlines), dark-red walls,
  // a black opening at the far end, a red carpet with pink rugs, two potted palms, a ceiling lamp
  // and a round fountain in the middle. Static parts are cached; the fountain water animates.
  var cache = null;

  function ell(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  // Ring between two ellipses (outer, inner) filled with `fill`, outlined in #333.
  function ring(ctx, o, i, fill) {
    ctx.beginPath();
    ctx.ellipse(o[0], o[1], o[2], o[3], 0, 0, Math.PI * 2);
    ctx.ellipse(i[0], i[1], i[2], i[3], 0, 0, Math.PI * 2, true);
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333';
    ell(ctx, o[0], o[1], o[2], o[3]);
    ctx.stroke();
    ell(ctx, i[0], i[1], i[2], i[3]);
    ctx.stroke();
  }

  function palm(ctx, x, y, s) {
    // (x, y) = bottom centre of the pot; s = scale (1 = the big palm on the left)
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // trunk: a tall, slightly bent olive stem, thinner at the top
    ctx.beginPath();
    ctx.moveTo(-3, -33);
    ctx.bezierCurveTo(-4, -70, -12, -100, -11, -127);
    ctx.lineTo(-4, -127);
    ctx.bezierCurveTo(-4, -100, 5, -70, 7, -33);
    ctx.closePath();
    var tg = ctx.createLinearGradient(-12, 0, 8, 0);
    tg.addColorStop(0, '#6e5e3c');
    tg.addColorStop(0.5, '#958558');
    tg.addColorStop(1, '#6e5e3c');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = '#604000';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // fronds: broad ribbons that arch up out of the crown and curl down at the tips (a teal upper
    // face over a dark green underside, crossed by fold lines), back fronds first
    var cx = -7.5, cy = -130;
    var leaves = [
      [4, -26, 20, -27], [-10, -26, -18, -22], [18, -20, 34, 2], [-20, -17, -30, 12],
      [-26, -5, -34, 23], [24, -11, 36, 23], [-12, -19, -19, 5], [-2, -15, -5, 20], [9, -12, 17, 27],
    ];
    leaves.forEach(function (L, i) {
      var left = [], right = [], mid = [];
      for (var k = 0; k <= 14; k++) {
        var u = k / 14;
        var px = 2 * (1 - u) * u * L[0] + u * u * L[2];
        var py = 2 * (1 - u) * u * L[1] + u * u * L[3];
        var dx = 2 * (1 - u) * L[0] + 2 * u * (L[2] - L[0]);
        var dy = 2 * (1 - u) * L[1] + 2 * u * (L[3] - L[1]);
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var w = 0.3 + 4.4 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.5);
        left.push([cx + px - (dy / len) * w, cy + py + (dx / len) * w]);
        right.push([cx + px + (dy / len) * w, cy + py - (dx / len) * w]);
        mid.push([cx + px, cy + py, -dy / len, dx / len, w]);
      }
      var pts = left.concat(right.slice().reverse());
      ctx.beginPath();
      pts.forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fillStyle = '#107a10';
      ctx.fill();
      // the upper face: the half of the ribbon facing up, up to where the tip curls under
      var face = (L[2] < 0 ? left : right).slice(0, 11);
      ctx.beginPath();
      mid.slice(0, 11).forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      face.reverse().forEach(function (p) { ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      var fg = ctx.createLinearGradient(cx, cy, cx + L[2], cy + L[3]);
      fg.addColorStop(0, i % 2 ? '#30905f' : '#2f9a2f');
      fg.addColorStop(0.6, i % 2 ? '#45a872' : '#3cae3c');
      fg.addColorStop(1, '#1f801f');
      ctx.fillStyle = fg;
      ctx.fill();
      // a fold across the ribbon where it turns over
      var m = mid[6];
      ctx.strokeStyle = '#0a5a0a';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(m[0] - m[2] * m[4], m[1] - m[3] * m[4]);
      ctx.lineTo(m[0] + m[2] * m[4], m[1] + m[3] * m[4]);
      ctx.stroke();
      ctx.beginPath();
      pts.forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.strokeStyle = '#005a00';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    });
    // pot: red flower pot with soil
    ctx.beginPath();
    ctx.moveTo(-19, -33);
    ctx.lineTo(19, -33);
    ctx.lineTo(15, 0);
    ctx.lineTo(-15, 0);
    ctx.closePath();
    var pg = ctx.createLinearGradient(-19, 0, 19, 0);
    pg.addColorStop(0, '#880000');
    pg.addColorStop(0.5, '#bb0000');
    pg.addColorStop(1, '#7a0000');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ell(ctx, 0, -33, 19, 4);
    ctx.fillStyle = '#3a3a3a';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();
    ctx.restore();
  }

  function rug(ctx, cx, cy, rx, ry) {
    ell(ctx, cx, cy, rx, ry);
    ctx.fillStyle = '#993333';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#990033';
    ctx.stroke();
  }

  function buildLobby() {
    var c = document.createElement('canvas');
    c.width = W * 2;
    c.height = H * 2;
    var ctx = c.getContext('2d');
    ctx.scale(2, 2);

    // ceiling colour everywhere first (the light grey beyond the front rib)
    ctx.fillStyle = '#999';
    ctx.fillRect(0, 0, W, H);

    // walls: dark red below the wall-top line, converging to the far opening
    ctx.beginPath();
    ctx.moveTo(0, 86);
    ctx.lineTo(200, 102);
    ctx.lineTo(350, 102);
    ctx.lineTo(W, 86);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = '#660000';
    ctx.fill();

    // far ceiling (inside the back rib): dark grey, lighter towards the sides
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 86);
    ctx.lineTo(350, 102);
    ctx.lineTo(200, 102);
    ctx.lineTo(0, 86);
    ctx.closePath();
    var cg = ctx.createLinearGradient(0, 0, W, 0);
    cg.addColorStop(0, '#5a5a5a');
    cg.addColorStop(0.35, '#3a3a3a');
    cg.addColorStop(0.5, '#333');
    cg.addColorStop(0.65, '#3a3a3a');
    cg.addColorStop(1, '#5a5a5a');
    ctx.fillStyle = cg;
    ctx.fill();
    D.line(ctx, 0, 86, 200, 102, '#333', 1);
    D.line(ctx, 350, 102, W, 86, '#333', 1);

    // the far opening at the end of the hall
    var og = ctx.createLinearGradient(0, 102, 0, 230);
    og.addColorStop(0, '#383838');
    og.addColorStop(1, '#000');
    ctx.fillStyle = og;
    ctx.fillRect(200, 102, 150, 128);
    D.line(ctx, 200, 102, 200, 229, '#222', 1);
    D.line(ctx, 350, 102, 350, 236, '#222', 1);

    // floor: red carpet
    ctx.beginPath();
    ctx.moveTo(0, 299);
    ctx.lineTo(200, 229);
    ctx.lineTo(350, 229);
    ctx.lineTo(W, 309);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = '#990000';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 299);
    ctx.lineTo(200, 229);
    ctx.lineTo(350, 229);
    ctx.lineTo(W, 309);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ribs of the vault: the back rib, then the front rib (outer bands) drawn over it
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    // back rib underside (dark, lighter low down) and face (light grey)
    var ug = ctx.createLinearGradient(0, 0, 0, 300);
    ug.addColorStop(0, '#404040');
    ug.addColorStop(0.55, '#515151');
    ug.addColorStop(1, '#6a6a6a');
    ring(ctx, [275, 290, 284, 285], [275, 360, 279, 334], ug);
    ring(ctx, [275, 280, 283, 286], [275, 290, 284, 285], '#999');
    // between the ribs: the ceiling above the wall line (#666)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(275, 285, 324, 325, 0, 0, Math.PI * 2);
    ctx.ellipse(275, 280, 283, 286, 0, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, 86);
    ctx.lineTo(0, 86);
    ctx.closePath();
    ctx.fillStyle = '#666';
    ctx.fill();
    ctx.restore();
    // front rib: underside (dark grey) and face (light grey band with outlines)
    var fg = ctx.createLinearGradient(0, 0, 0, 120);
    fg.addColorStop(0, '#464646');
    fg.addColorStop(1, '#5c5c5c');
    ring(ctx, [275, 285, 346, 348], [275, 285, 324, 325], fg);
    ring(ctx, [275, 285, 351, 364], [275, 285, 346, 348], '#999');
    ctx.restore();

    // ceiling lamp: dark disc, light grey bowl, glowing yellow opening
    ell(ctx, 275, 36, 90, 22);
    ctx.fillStyle = '#4d4d4d';
    ctx.fill();
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(275, 46, 80, 15, 0, Math.PI, 0);
    ctx.lineTo(337, 72);
    ctx.ellipse(275, 72, 62, 13, 0, 0, Math.PI);
    ctx.closePath();
    var lg = ctx.createLinearGradient(195, 0, 355, 0);
    lg.addColorStop(0, '#e6e6e6');
    lg.addColorStop(0.5, '#bdbdbd');
    lg.addColorStop(1, '#6e6e6e');
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();
    ell(ctx, 275, 72, 62, 13);
    var yg = ctx.createRadialGradient(262, 70, 5, 275, 72, 62);
    yg.addColorStop(0, '#ffffaa');
    yg.addColorStop(1, '#ffff22');
    ctx.fillStyle = yg;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();

    // rugs on the carpet
    rug(ctx, 336, 259, 24, 5.5);
    rug(ctx, 108, 304, 22, 8);
    rug(ctx, 490, 314, 40, 7.5);
    rug(ctx, 18, 345, 28, 9.5);
    rug(ctx, 423, 370, 52, 10);
    rug(ctx, 116, 394, 52, 10);

    // potted palms
    palm(ctx, 375, 250, 0.72);
    palm(ctx, 105, 270, 1);

    // fountain basin: a round grey stone rim around a blue pool
    ctx.beginPath();
    ctx.ellipse(273, 338, 148.5, 30.5, 0, 0, Math.PI);
    ctx.lineTo(124.5, 305.5);
    ctx.ellipse(273, 305.5, 148.5, 30.5, 0, Math.PI, 0, true);
    ctx.closePath();
    var bg = ctx.createLinearGradient(124, 0, 422, 0);
    bg.addColorStop(0, '#6a6a6a');
    bg.addColorStop(0.5, '#989898');
    bg.addColorStop(1, '#5e5e5e');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
    ell(ctx, 273, 305.5, 148.5, 30.5);
    var tg2 = ctx.createLinearGradient(124, 0, 422, 0);
    tg2.addColorStop(0, '#5a5a5a');
    tg2.addColorStop(0.5, '#9a9a9a');
    tg2.addColorStop(1, '#575757');
    ctx.fillStyle = tg2;
    ctx.fill();
    ctx.stroke();
    // inner wall of the pool (dark at the back) and the water
    ell(ctx, 273, 313, 94, 19.5);
    ctx.fillStyle = '#4a4a4a';
    ctx.fill();
    ctx.stroke();
    ell(ctx, 273, 315.5, 91, 16.5);
    var wg = ctx.createRadialGradient(273, 318, 10, 273, 316, 92);
    wg.addColorStop(0, '#00ccff');
    wg.addColorStop(0.7, '#00b0f2');
    wg.addColorStop(1, '#0077d8');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();
    // the crown-shaped nozzle in the middle
    ctx.beginPath();
    ctx.moveTo(243, 303);
    ctx.lineTo(249, 303);
    ctx.lineTo(249, 297);
    ctx.lineTo(257, 297);
    ctx.lineTo(257, 304);
    ctx.lineTo(268, 304);
    ctx.lineTo(268, 300);
    ctx.lineTo(283, 300);
    ctx.lineTo(283, 304);
    ctx.lineTo(294, 304);
    ctx.lineTo(294, 297);
    ctx.lineTo(302, 297);
    ctx.lineTo(302, 303);
    ctx.lineTo(310, 303);
    ctx.lineTo(310, 318);
    ctx.quadraticCurveTo(276, 327, 243, 318);
    ctx.closePath();
    var ng = ctx.createLinearGradient(243, 0, 311, 0);
    ng.addColorStop(0, '#6a6a6a');
    ng.addColorStop(0.5, '#a0a0a0');
    ng.addColorStop(1, '#5c5c5c');
    ctx.fillStyle = ng;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.stroke();
    return c;
  }

  // Water: a translucent column from the nozzle up to a mushroom-shaped spray (the original's
  // 14-frame fountain loop); it shimmers slightly.
  function water(ctx, frame) {
    var t = (frame % 14) / 14;
    var wob = Math.sin(t * Math.PI * 2);
    ctx.save();
    ctx.globalAlpha = 0.75;
    var g = ctx.createLinearGradient(262, 0, 290, 0);
    g.addColorStop(0, '#39a6f2');
    g.addColorStop(0.5, '#8fd8ff');
    g.addColorStop(1, '#39a6f2');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(268, 302);
    ctx.lineTo(282, 302);
    ctx.bezierCurveTo(284, 260, 281, 220, 283 + wob, 192);
    ctx.lineTo(267 - wob, 192);
    ctx.bezierCurveTo(269, 220, 266, 260, 268, 302);
    ctx.closePath();
    ctx.fill();
    // spray cap
    ctx.beginPath();
    ctx.moveTo(232, 190);
    ctx.bezierCurveTo(240, 172 - wob, 312, 170 + wob, 318, 188);
    ctx.bezierCurveTo(300, 184, 290, 196, 276, 194);
    ctx.bezierCurveTo(262, 196, 250, 184, 232, 190);
    ctx.closePath();
    ctx.fillStyle = '#6cc4ff';
    ctx.fill();
    ctx.restore();
  }

  function lobby(ctx, frame) {
    if (!cache) cache = buildLobby();
    ctx.drawImage(cache, 0, 0, W, H);
    water(ctx, frame || 0);
  }

  // --- type ------------------------------------------------------------------------------------
  // The original's casino text is Arial Black (Impact on the slot machine). Where Arial Black is
  // not installed, bold Arial is widened and outlined in its own colour to keep the weight.
  var arialBlack = null;
  function hasArialBlack() {
    if (arialBlack === null) {
      var c = document.createElement('canvas').getContext('2d');
      c.font = '40px monospace';
      var a = c.measureText('mmmmmWWWWWiiiii0123').width;
      c.font = '40px "Arial Black", monospace';
      arialBlack = c.measureText('mmmmmWWWWWiiiii0123').width !== a;
    }
    return arialBlack;
  }

  // opts: { align, baseline, stroke (outline colour), strokeWidth }
  function heavyText(ctx, str, x, y, size, color, opts) {
    opts = opts || {};
    var real = hasArialBlack();
    ctx.save();
    ctx.font = (real ? '' : 'bold ') + size + 'px ' + (real ? '"Arial Black"' : 'Arial, Helvetica, sans-serif');
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    ctx.translate(x, y);
    if (!real) ctx.scale(1.12, 1);
    ctx.lineJoin = 'round';
    if (opts.stroke) {
      ctx.lineWidth = opts.strokeWidth || 3;
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(str, 0, 0);
    }
    if (!real) {
      ctx.lineWidth = Math.max(0.6, size * 0.07);
      ctx.strokeStyle = color;
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  // Inline CSS for heavy DOM text (menu quote, button labels).
  function heavyCss(size, color) {
    return 'font-family:\'Arial Black\',\'Arial Bold\',Arial,Helvetica,sans-serif;font-weight:900;font-size:' + size +
      'px;color:' + color + (hasArialBlack() ? '' : ';letter-spacing:0.06em;-webkit-text-stroke:' + (size * 0.045).toFixed(2) + 'px ' + color);
  }

  // --- chips (blackjack and roulette) ------------------------------------------------------------
  // A solid disc in the chip colour with a bevelled edge (light top-left, dark bottom-right) and
  // three darker bands on the rim, each with a white spot (top, lower left, lower right). The
  // original's chip buttons turn the chip 5 degrees while hovered and 25 degrees while pressed.
  // c: { x, y, r, v, fill, band, light, dark }; rot: extra rotation in degrees.
  function chip(ctx, c, rot) {
    var r = c.r;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(((rot || 0) * Math.PI) / 180);
    D.circle(ctx, 0, 0, r, c.fill);
    for (var k = 0; k < 3; k++) {
      var a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, a - 0.47, a + 0.47);
      ctx.arc(0, 0, r * 0.72, a + 0.47, a - 0.47, true);
      ctx.closePath();
      ctx.fillStyle = c.band;
      ctx.fill();
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = '#fff';
      ctx.fillRect(r * 0.7, -r * 0.15, r * 0.23, r * 0.3);
      ctx.restore();
    }
    var eg = ctx.createLinearGradient(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7);
    eg.addColorStop(0, c.light);
    eg.addColorStop(0.45, c.fill);
    eg.addColorStop(1, c.dark);
    ctx.beginPath();
    ctx.arc(0, 0, r - 0.7, 0, Math.PI * 2);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = eg;
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.font = (r < 15 ? 10.5 : 15) + 'px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.v), 0, 1);
    ctx.restore();
  }

  // The five chip colourings (body, rim bands, light edge, dark edge), sampled from the original.
  var CHIP_COLORS = {
    0: { fill: '#999999', band: '#666666', light: '#f2f2f2', dark: '#4d4d4d' },
    5: { fill: '#cc0000', band: '#990000', light: '#ff3300', dark: '#660000' },
    25: { fill: '#0066cc', band: '#003399', light: '#0099ff', dark: '#003080' },
    100: { fill: '#009900', band: '#006600', light: '#00ee00', dark: '#004d00' },
    500: { fill: '#9900ff', band: '#6a00b0', light: '#a0a0ff', dark: '#4d1a75' },
  };

  SRPG.casinoArt = { lobby: lobby, heavyText: heavyText, heavyCss: heavyCss, hasArialBlack: hasArialBlack,
    chip: chip, CHIP_COLORS: CHIP_COLORS };

  // --- the menu --------------------------------------------------------------------------------
  // The greeting is paraphrased; the button labels are the original's.
  var GREETING = '"Step inside the Silver Lining Casino!<br>Care to let us lighten your wallet?"';

  // Menu labels are the original's 12 px Arial Black at the buttons' 0.75 scale, in #003399.
  function label(text, size) {
    return '<span style="' + heavyCss(size || 9.5, '#003399') + '">' + text + '</span>';
  }

  SRPG.registerLocation({
    id: 'casino',
    hud: 'inside',
    music: 'inside', // root frame 40 stops the street loop and starts the "inside" loop
    exit: 'casino', // LEAVE: mapx - 8, back to the street
    panel: { x: 182, y: 45, w: 355, h: 251 },
    background: function (ctx, s, frame) { lobby(ctx, frame); },
    view: function () {
      return {
        quoteHtml: '<div style="text-align:left;padding-left:43px;line-height:16.85px;' + heavyCss(12, '#000') + '">' +
          GREETING + '</div>',
        quoteY: 16,
        buttons: [
          { icon: 'slots', label: label('PLAY SLOTS'), x: 27, y: 101, w: 130, size: 35, id: 'slots',
            onClick: function (g) { g.go('slots'); } },
          { icon: 'blackjack', label: label('PLAY BLACKJACK'), x: 182, y: 101, w: 160, size: 35, id: 'blackjack',
            onClick: function (g) { g.go('blackjack'); } },
          { icon: 'roulette', label: label('PLAY ROULETTE'), x: 28, y: 153, w: 150, size: 35, id: 'roulette',
            onClick: function (g) { g.go('roulette'); } },
          // (the original's LEAVE label sits a little lower beside its tile than the others)
          { icon: 'leave', label: label('LEAVE', 10).replace('<span style="', '<span style="position:relative;top:3px;'),
            x: 252, y: 199, w: 100, size: 35, id: 'leave',
            onClick: function (g) { g.leave(); } },
        ],
        leave: false,
      };
    },
  });
})();
