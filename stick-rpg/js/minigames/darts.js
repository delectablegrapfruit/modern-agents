// Drunken darts (root frame 37 of the original). Ten darts, no entry fee and no prize: the
// original just keeps score. The board drifts in a circle with a see-through double (you're
// seeing double), and the crosshair wobbles on its own while the mouse is still. As in the
// original the dart lands where the (hidden) mouse pointer is, and the ghost board sits on top,
// so a click on the ghost scores off the ghost. OK goes back to the bar.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;

  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';
  var PALE = '#95caff';
  var BLUE = '#003399';

  // The dart_board clip sits at (282.1, 185.5). Its two boards follow these 40-frame loops
  // (x, y offsets): the solid board and, on top at 30% opacity, the double.
  var ORIGIN = { x: 282.1, y: 185.5 };
  var MAIN = [22, 0, 22.9, 5.7, 25.1, 10.9, 27.9, 15.8, 31.3, 20, 35.4, 23.6, 39.9, 26.4, 44.5, 29.6, 49.6, 31.4, 55, 32.2,
    60.2, 32.4, 65.2, 30.9, 70.3, 30.2, 74.8, 27.4, 79.6, 24.9, 83.2, 21, 86.3, 16.6, 88.5, 11.7, 89.9, 6.3, 90, 1,
    90.2, -4.5, 89.2, -9.8, 87.2, -14.9, 84.3, -19.7, 80.8, -23.9, 76.7, -27.5, 72.2, -31.2, 66.9, -32.5, 61.5, -33.8, 56, -34,
    50.8, -33.6, 45.6, -32.4, 40.7, -30.3, 36.2, -27.4, 32.2, -23.9, 28.8, -19.9, 27.4, -14.6, 24.9, -10.1, 23.1, -5.2, 22, 0];
  var GHOST = [21.9, 0.5, 22.6, -5.2, 24.4, -10.5, 26.8, -15.8, 30.4, -20.1, 34, -24.6, 39.4, -26.4, 44, -29.4, 49.5, -30.8, 55, -31.3,
    60.2, -30.9, 65.4, -29.7, 70.3, -27.6, 75.8, -26.3, 80, -22.6, 83.7, -18.4, 86.5, -13.8, 88.6, -8.6, 89.1, -3, 89.6, 2.4,
    89.5, 7.7, 88.2, 12.7, 86, 17.6, 83.2, 21.9, 79.7, 25.9, 75.7, 29.2, 71.2, 32, 66.2, 33.6, 61.1, 34.6, 56, 34.4,
    50.9, 33.5, 46, 31.9, 40.2, 31.8, 35.6, 28.8, 31.6, 25.1, 28.1, 21, 26.1, 15.8, 24, 10.9, 22.6, 5.8, 21.9, 0.5];
  var GHOST_ALPHA = 77 / 256;

  // Scoring rings of one board (buttons inside the board clip), topmost first: each ring is an
  // annulus [inner, outer] around its own small offset.
  var RINGS = [
    { pts: 5, dx: 0.5, dy: -0.1, r0: 48.6, r1: 78.7 },
    { pts: 15, dx: 0.5, dy: -0.8, r0: 14, r1: 49.2 },
    { pts: 35, dx: 0.9, dy: 0, r0: 6.65, r1: 14.5 },
    { pts: 50, dx: 1.1, dy: 0, r0: 0, r1: 6.65 },
  ];
  // Anywhere else in this rectangle (the rest of the room above the panel) is a miss; outside it a
  // click does nothing.
  var MISS = { x0: -6.5, x1: 558.65, y0: 30.55, y1: 304.6 };

  // Throw messages (reworded).
  var MSG = {
    0: 'Yikes, that was sad.  No points at all.',
    50: 'BULLSEYE!!  That\'s 50 points!',
    35: 'Sweet throw; that one\'s worth 35 points!',
    15: 'That one gets you 15 points.',
    5: 'Just 5 points, sucka.',
  };

  var st = null;

  function boardPos(table, frame) {
    var i = (frame - 1) * 2;
    return { x: ORIGIN.x + table[i], y: ORIGIN.y + table[i + 1] };
  }

  function ringAt(b, x, y) {
    for (var i = 0; i < RINGS.length; i++) {
      var R = RINGS[i];
      var d = Math.sqrt((x - b.x - R.dx) * (x - b.x - R.dx) + (y - b.y - R.dy) * (y - b.y - R.dy));
      if (d >= R.r0 && d <= R.r1) return R.pts;
    }
    return null;
  }

  // Points for a click at stage (x, y) on board frame f: null = no throw (outside the room).
  function scoreAt(x, y, f) {
    var p = ringAt(boardPos(GHOST, f), x, y);
    if (p != null) return p;
    p = ringAt(boardPos(MAIN, f), x, y);
    if (p != null) return p;
    if (x >= MISS.x0 && x <= MISS.x1 && y >= MISS.y0 && y <= MISS.y1) return 0;
    return null;
  }

  function throwAt(x, y) {
    if (!(st.throws > 0)) return false;
    var p = scoreAt(x, y, st.bf);
    if (p == null) return false;
    st.throws -= 1;
    st.last = MSG[p];
    if (p > 0) {
      st.points += p;
      SRPG.sound.play('footstep'); // a scoring throw plays SFXfootstep (there is no dart sound)
    }
    refresh();
    return true;
  }

  // --- DOM -------------------------------------------------------------------------------------
  // Text in the original's fields (Arial Black, #95caff), spaces kept as typed. The static texts
  // are 12 px with lines 16.85 apart; (x, y) is the box's top-left in stage px.
  function txt(parent, html, x, y, o) {
    o = o || {};
    var t = ui.el('div', 'nopoint', parent, html);
    t.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:bold ' + (o.size || 12) + 'px ' + FONT + ';color:' + PALE +
      ';line-height:' + (o.lh || 16.85) + 'px;' + (o.w ? 'width:' + o.w + 'px;' : '') + 'white-space:pre;text-align:' + (o.align || 'left');
    if (o.id) t.setAttribute('data-id', o.id);
    return t;
  }

  function build() {
    var el = st.el = {};
    // Panel: shape 105 at 120% x 50%, 80% opaque; clicks pass through to the room below.
    var p = ui.panel(3.3, 301.1, 427.5, 101);
    p.setAttribute('data-screen', 'darts');
    p.style.pointerEvents = 'none';
    p.style.background = 'rgba(72,132,255,0.8)'; // opaque panel colour at this placement's 80%
    var ox = 4.3, oy = 302.1;
    // Static texts (baselines 321.65 / 338.5, 355.65 / 372.5 and 363.65 in the original): the
    // instruction breaks before its last word, as the original's does.
    txt(p, 'YOU\'RE SMASHED.  CLICK THE DART BOARD TO LET A<br>DART FLY.', 19 - ox, 308.5 - oy, { id: 'darts-help' });
    txt(p, 'DARTS<br>REMAINING:', 26 - ox, 342.5 - oy);
    txt(p, 'POINTS', 348 - ox, 350.5 - oy);
    // The fields: dartThrows and dartPoints are 22 px, lastThrow 14 px (centred).
    el.throws = txt(p, '', 95.5 - ox, 342.8 - oy, { size: 22, lh: 31, id: 'darts-left' });
    el.points = txt(p, '', 247 - ox, 342.8 - oy, { size: 22, lh: 31, w: 96, align: 'right', id: 'darts-points' });
    el.last = txt(p, '', 20 - ox, 377.4 - oy, { size: 14, lh: 19.75, w: 387, align: 'center', id: 'darts-last' });

    var ok = ui.el('div', '', null, 'OK');
    ok.setAttribute('data-id', 'darts-ok');
    ok.style.cssText = 'position:absolute;left:465.5px;top:358.5px;width:69px;height:25.5px;box-sizing:border-box;cursor:none;' +
      'background:#3399ff;border:1.5px solid #3373d9;border-radius:10px;text-align:center;font:bold 10px ' + FONT +
      ';color:' + BLUE + ';line-height:22.5px';
    // Rolling over OK steadies the dart; releasing on it goes back to the bar.
    ok.addEventListener('mouseenter', function () { st.stopShake = 1; ok.style.background = '#66b3ff'; });
    ok.addEventListener('mouseleave', function () { st.stopShake = 0; ok.style.background = '#3399ff'; });
    ok.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    ok.addEventListener('click', function (e) {
      e.stopPropagation();
      leave();
    });
    el.ok = ok;
    // The dart sits above everything (depth 158), panel and OK included: its own layer on top.
    var cv = document.createElement('canvas');
    cv.width = SRPG.W * 2;
    cv.height = SRPG.H * 2;
    cv.style.cssText = 'position:absolute;left:0;top:0;width:' + SRPG.W + 'px;height:' + SRPG.H + 'px;pointer-events:none;z-index:40';
    ui.el('div', 'nopoint', null, '').appendChild(cv);
    el.dart = cv;
    refresh();
  }

  function refresh() {
    if (!st || !st.el.throws) return;
    st.el.throws.textContent = String(st.throws);
    st.el.points.textContent = String(st.points);
    st.el.last.textContent = st.last;
  }

  function stage() { return document.getElementById('stage'); }

  function leave() {
    var from = st.from;
    SRPG.location.open(from);
  }

  // --- drawing ---------------------------------------------------------------------------------
  var boardImg = null;
  function boardCanvas() {
    if (boardImg) return boardImg;
    var S = 3;
    boardImg = document.createElement('canvas');
    boardImg.width = boardImg.height = 180 * S;
    var c = boardImg.getContext('2d');
    c.scale(S, S);
    c.translate(90, 90);
    D.circle(c, 0, 0, 87.2, '#666600', '#1f1f00', 1);
    // 20 alternating wedges, a cream one at the top
    for (var i = 0; i < 20; i++) {
      var a0 = -Math.PI / 2 + (i - 0.5) * Math.PI / 10;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 78.7, a0, a0 + Math.PI / 10);
      c.closePath();
      c.fillStyle = i % 2 ? '#000000' : '#eee28e';
      c.fill();
    }
    D.circle(c, 0, 0, 78.7, null, '#1f1f00', 0.8);
    D.circle(c, 0, 0, 48.8, null, 'rgba(204,204,204,0.9)', 0.6);
    D.circle(c, 0, 0, 14.3, '#33cc22', '#003300', 1);
    D.circle(c, 0.2, 0, 6.65, '#ff3322', '#660000', 0.8);
    return boardImg;
  }

  function drawBoard(ctx, b, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(boardCanvas(), b.x - 90, b.y - 90, 180, 180);
    ctx.restore();
  }

  function chalk(ctx, pts, w) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w || 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
    ctx.restore();
  }

  // The score board on the wall: chalk tallies, a bottle, the chalk tray.
  function drawChalkboard(ctx) {
    D.rect(ctx, 13, 100.5, 133, 162, '#000000', '#cccccc', 1.6);
    D.line(ctx, 79.5, 100.5, 79.5, 262, '#ffffff', 1.4);
    chalk(ctx, [24, 118, 23, 131, 24, 140]);
    chalk(ctx, [31, 121, 30, 133, 32, 142]);
    chalk(ctx, [38, 123, 37, 135, 39, 144]);
    chalk(ctx, [46, 123, 45, 136, 47, 146]);
    chalk(ctx, [19, 129, 36, 134, 53, 144]);
    chalk(ctx, [22, 159, 21.5, 176]);
    chalk(ctx, [30.5, 160, 29.5, 178]);
    chalk(ctx, [93, 116, 91, 127, 91.5, 136, 90.5, 138]);
    chalk(ctx, [103, 118, 103, 140]);
    chalk(ctx, [114, 119, 114, 142]);
    // bottle of beer standing in the corner
    ctx.save();
    var g = ctx.createLinearGradient(20, 0, 38, 0);
    g.addColorStop(0, '#6f6f10');
    g.addColorStop(0.45, '#c9c93a');
    g.addColorStop(1, '#6a6a0c');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#3a3a00';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(27.5, 215.5);
    ctx.lineTo(31.5, 215.5);
    ctx.lineTo(32, 226);
    ctx.quadraticCurveTo(37.5, 230, 38, 238);
    ctx.lineTo(38, 260);
    ctx.lineTo(20.5, 260);
    ctx.lineTo(20.5, 238);
    ctx.quadraticCurveTo(21, 230, 27, 226);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    D.rect(ctx, 21, 234, 16.5, 13, '#d9d9d9', '#555555', 0.6);
    D.text(ctx, 'XXX', 29.2, 244, { size: 7, align: 'center', color: '#222222' });
    ctx.restore();
    // chalk tray
    D.roundRect(ctx, 7, 261, 145, 10, 4, '#663300', '#cccccc', 0.8);
    D.roundRect(ctx, 77.5, 263.5, 22, 5, 2.5, '#ffffff');
    D.roundRect(ctx, 114.5, 263.5, 22, 5, 2.5, '#ffffff');
  }

  // The dart: a magenta crosshair with a cyan dot.
  function drawDart(ctx, x, y) {
    ctx.save();
    D.circle(ctx, x, y, 3, '#00ffff');
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x - 15, y);
    ctx.lineTo(x + 15, y);
    ctx.moveTo(x, y - 12.6);
    ctx.lineTo(x, y + 12.6);
    ctx.stroke();
    ctx.restore();
  }

  // --- screen ----------------------------------------------------------------------------------
  SRPG.registerScreen('darts', {
    enter: function (params) {
      var m = SRPG.engine.mouse;
      st = {
        from: (params && params.from) || 'bar',
        throws: 10,
        points: 0,
        last: '',
        bf: 1, // dart_board frame, 1..40
        shown: false, // frame 1 has had its turn on screen
        stopShake: 0,
        armed: false, // a fresh (detail 1) press has happened on this screen
        // startDrag(lockCenter): the dart jumps to the pointer; placed at 619, 198 before that.
        dx: m && m.x >= 0 ? m.x : 619,
        dy: m && m.y >= 0 ? m.y : 198.3,
        el: {},
      };
      if (stage()) stage().style.cursor = 'none'; // Mouse.hide()
      build();
    },
    exit: function () {
      if (stage()) stage().style.cursor = ''; // Mouse.show()
    },
    tick: function () {
      if (!st) return;
      // The board clip shows its frame 1 first, then moves on one frame per tick.
      if (st.shown) st.bf = st.bf % 40 + 1;
      st.shown = true;
      // The drunken wobble: each frame, maybe a nudge of 0-6px left, right, up or down. It adds
      // up while the mouse is still; moving the mouse snaps the dart back onto the pointer.
      if (st.stopShake === 0) {
        var r1 = SRPG.rng.random(7);
        var r2 = SRPG.rng.random(8);
        if (r2 === 0) st.dx += r1;
        else if (r2 === 1) st.dx -= r1;
        else if (r2 === 2) st.dy += r1;
        else if (r2 === 3) st.dy -= r1;
      }
    },
    onMouseMove: function (x, y) {
      if (!st) return;
      st.dx = x;
      st.dy = y;
    },
    onMouseDown: function (x, y, e) {
      if (!st) return;
      // Flash buttons only answer the left button.
      if (e && e.button != null && e.button !== 0) return;
      // The second press of a double-click that started on the bar's PLAY DRUNKEN DARTS is not a
      // throw; quick presses that start here (detail 1 first) all count.
      if (e && e.detail > 1 && !st.armed) return;
      st.armed = true;
      throwAt(x, y);
    },
    render: function (ctx) {
      var s = SRPG.game.s;
      if (!st || !s) return;
      ctx.fillStyle = '#604d0d';
      ctx.fillRect(0, 0, SRPG.W, SRPG.H);
      drawChalkboard(ctx);
      drawBoard(ctx, boardPos(MAIN, st.bf), 1);
      drawBoard(ctx, boardPos(GHOST, st.bf), GHOST_ALPHA);
      SRPG.hud.draw(ctx, s, 'inside');
      var dc = st.el.dart && st.el.dart.getContext('2d');
      if (dc) {
        dc.setTransform(2, 0, 0, 2, 0, 0);
        dc.clearRect(0, 0, SRPG.W, SRPG.H);
        drawDart(dc, st.dx, st.dy);
      } else drawDart(ctx, st.dx, st.dy);
    },
  });

  // For tests.
  SRPG.darts = {
    get st() { return st; },
    scoreAt: scoreAt,
    throwAt: function (x, y) { return throwAt(x, y); },
    boardPos: function (which, f) { return boardPos(which === 'ghost' ? GHOST : MAIN, f); },
    MSG: MSG,
  };
})();
