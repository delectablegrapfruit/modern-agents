// 'death' (root frame 100: YOU DIED) and 'results' (root frames 130..161: the end-of-game
// screen). Neither touches the save: the last saved game can still be continued afterwards.
//
// YOU DIED: all sound stops, HP shows 0, your stick figure staggers and falls over (frames
// 16..52), "YOU DIED" appears at frame 65 and at frame 150 (about 4.3 s) the results follow.
//
// Results: net worth counts up from -loans, one step per frame of max(100, round(final/500)),
// with the work "ka-ching" every step, until it reaches final + 100 and snaps to the final value
// (SKIP jumps straight to the stamp). The final figure flashes bright for 17 frames, then the
// rank stamp slams down (a thud on its 10th frame, the text on the page jolts crooked), and DONE
// returns to the title.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var fx = SRPG.titleFx;
  var D = SRPG.draw;

  function S() { return SRPG.game.s; }

  // ---- stick figures (the blue #0066cc one of these screens) ---------------------------------
  // Joints for a figure ~117 tall standing with its hips at the origin's (0, 16).
  var STAND = { h: [0, -40, 18], n: [-1, -22], s: [-1, -10.6], hip: [-1.9, 16.2],
    la: [-13.5, 0.5], lh: [-10.4, 18], ra: [7.7, 0.7], rh: [11.9, 18.4],
    lk: [-8.8, 41], lf: [-8.2, 58.1], rk: [8.1, 36.3], rf: [9.1, 55.7] };
  var AKIMBO = { la: [-14.2, 5.2], lh: [-2.7, 16.3], ra: [9.3, 7.1], rh: [-1.4, 16.4] };

  function figure(ctx, p, o) {
    o = o || {};
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.n[0], p.n[1]);
    ctx.lineTo(p.hip[0], p.hip[1]);
    [['s', 'la', 'lh'], ['s', 'ra', 'rh'], ['hip', 'lk', 'lf'], ['hip', 'rk', 'rf']].forEach(function (l) {
      ctx.moveTo(p[l[0]][0], p[l[0]][1]);
      ctx.lineTo(p[l[1]][0], p[l[1]][1]);
      ctx.lineTo(p[l[2]][0], p[l[2]][1]);
    });
    if (o.toe) { ctx.moveTo(p.rf[0], p.rf[1]); ctx.lineTo(o.toe[0], o.toe[1]); }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.h[0], p.h[1], p.h[2], 0, Math.PI * 2);
    ctx.fillStyle = '#0066cc';
    ctx.fill();
    ctx.stroke();
    if (o.xEyes) {
      o.xEyes.forEach(function (e) {
        D.line(ctx, e[0] - 2, e[1] - 2, e[0] + 2, e[1] + 2, '#000', 1);
        D.line(ctx, e[0] - 2, e[1] + 2, e[0] + 2, e[1] - 2, '#000', 1);
      });
    }
    ctx.restore();
  }

  function mix(a, b, t) {
    var o = {};
    for (var k in a) o[k] = b[k] ? a[k].map(function (v, i) { return v + (b[k][i] - v) * t; }) : a[k].slice();
    return o;
  }

  // Rotate every joint about the feet (0, 58) by angle a (clockwise = falling to the right).
  function tilt(p, a) {
    var o = {};
    var c = Math.cos(a), s = Math.sin(a);
    for (var k in p) {
      var x = p[k][0], y = p[k][1] - 58;
      o[k] = [x * c - y * s, 58 + x * s + y * c].concat(p[k].slice(2));
    }
    return o;
  }

  // Lying dead on the ground, head to the right, one leg bent, X for eyes.
  var DEAD = { h: [66, 34, 18], n: [47.5, 31.6], s: [38, 31], hip: [12.3, 31],
    la: [27, 43.5], lh: [10, 43.5], ra: [30, 18.3], rh: [12, 15],
    lk: [-9, 32.5], lf: [-30, 34], rk: [-7.5, 47.5], rf: [-26, 44] };

  // ================================================================================== DEATH
  var death = {
    t: 0,
    enter: function () {
      var s = S();
      if (s) { s.hp = 0; s.over = true; }
      death.t = 1;
      SRPG.sound.music(null); // stopSounds
    },
    tick: function () {
      death.t++;
      // Sprite 2334's last frame sends the player to the results.
      if (death.t >= 150) SRPG.engine.go('results');
    },
    render: function (ctx) {
      var s = S();
      fx.bg(ctx);
      var f = death.t;
      ctx.save();
      ctx.translate(262.4, 232.1);
      if (f <= 15) figure(ctx, STAND);
      else if (f <= 45) {
        // reel back, then twitch
        var lean = Math.min(4, f - 15) * 0.075;
        var p = tilt(STAND, lean);
        if (f >= 20) {
          var w = [0, 1, 2, 1, 0, 3, 4, 3, 2, 1][(f - 20) % 10];
          p.la = [p.la[0] - w, p.la[1] - w * 1.5];
          p.lh = [p.lh[0] - w * 2, p.lh[1] - w * 3];
          p.ra = [p.ra[0] + w, p.ra[1] - w];
          p.rh = [p.rh[0] + w * 2.5, p.rh[1] - w * 2];
        }
        figure(ctx, p);
      } else if (f <= 49) {
        figure(ctx, tilt(STAND, [0.55, 0.9, 1.25, 1.5][f - 46]));
      } else if (f <= 52) {
        ctx.translate(0, f === 50 ? -8 : 0);
        figure(ctx, mix(tilt(STAND, 1.57), DEAD, f === 52 ? 1 : 0.6));
      } else {
        figure(ctx, DEAD, { xEyes: [[72.3, 22.4], [71.5, 34.1]] });
      }
      ctx.restore();
      if (f >= 65) fx.text(ctx, 'YOU DIED', 177.5, 153.3, { size: 40, color: '#0066cc', width: 213.5 });
      if (s && SRPG.hud) SRPG.hud.draw(ctx, s, 'fight');
    },
  };
  SRPG.registerScreen('death', death);

  // ================================================================================ RESULTS
  // [text, face size, colour, normal x, y, jolted x, y, rotation (deg), local x, baseline]
  // x, y = the original's text-box origins; after the stamp lands (frame 160) every line is
  // nudged and tilted a little.
  var LABELS = [
    ['CHARM:', 14, '#003399', 152.2, 139.2, 152.4, 146.3, 1, -13.05, 15],
    ['STRENGTH:', 14, '#003399', 152.2, 159.2, 152.6, 164.9, 2, -13.2, 15],
    ['INTELLIGENCE:', 14, '#003399', 152.2, 179.2, 151.9, 190.1, -2, -12.55, 15],
    ['KARMA:', 14, '#003399', 152.2, 199.2, 151.8, 205, 2.5, -12.7, 15],
    ['CASH ON HAND', 16, '#003399', 105.2, 227.2, 105.7, 226.1, 2, -12.95, 18],
    ['CASH IN BANK', 16, '#003399', 105.2, 253.2, 104.8, 259.4, -2, -12.95, 18, '+', 187],
    ['LOANS', 16, '#003399', 105.2, 279.2, 105, 282.3, -1, -12.55, 18, '-', 191.05],
  ];
  // Values: [key, size, colour, normal x, y, jolted x, y, rotation]; text starts at x - 13.7.
  var VALUES = [
    ['pname', 26, '#000066', 152.7, 32.5, 153.9, 22.9, 3],
    ['jobtitle', 20, '#003399', 153.2, 66.2, 152.9, 69.3, -1],
    ['categ', 16, '#003399', 152.7, 104.5, 153.2, 106.4, 2],
    ['charm', 14, '#0033cc', 223.6, 139.2, 223.8, 147.4, 1],
    ['strength', 14, '#0033cc', 252.6, 159.2, 252.9, 168.4, 2],
    ['intelligence', 14, '#0033cc', 282.3, 179.2, 282, 185.4, -2],
    ['karma', 14, '#0033cc', 220.3, 199.2, 219.9, 207.9, 2.5],
    ['cash', 18, '#003399', 333.1, 228.2, 333.9, 228.1, 3],
    ['bankcash', 18, '#003399', 333.4, 253.2, 333.2, 254.9, -1],
    ['bankloan', 18, '#003399', 333.4, 280.2, 333.6, 278.4, 1],
  ];

  var rs = {
    rf: 130, // the original's root frame: 131 = counting, 133..149 flash, 150.. stamp, 161 DONE
    sf: 0, // stamp clip frame 1..50 (0 = not yet)
    anim: 0, // the stick figure's 114-frame idle loop
    netcalc: 0,
    final: 0,
    rank: '',
    v: {},
    hot: {},
    fpsT: 0,
    fpsN: 0,
    fps: 35,
  };

  // Frame 131: one step of the count-up (and the work sound every step).
  function countStep() {
    if (rs.netcalc < rs.final + 100) {
      rs.netcalc = rs.netcalc + Math.max(100, Math.round(rs.final / 500));
    } else {
      rs.netcalc = rs.final;
      rs.rf = 133; // SKIP goes away
      buildButtons();
    }
    SRPG.sound.play('work');
  }

  function toStamp() {
    rs.rf = 150;
    rs.sf = 1;
    buildButtons();
  }

  function buildButtons() {
    SRPG.ui.clear();
    rs.hot = {};
    if (rs.rf <= 132) {
      // SKIP (frames 130..132): show the final figure and go straight to the stamp.
      rs.hot.skip = fx.hotspot('skip', 504.4, 382, 45.6, 18, function () {
        rs.netcalc = rs.final;
        toStamp();
      });
    } else if (rs.rf >= 161) {
      // DONE (frame 161): back to the title screen. The save is left alone.
      rs.hot.done = fx.hotspot('done', 484.8, 368.3, 59.8, 25.6, function () {
        SRPG.engine.go('title', { again: true });
      });
    }
  }

  // Idle loop of the figure on the left: arms down, hands to hips, foot tapping, arms down.
  function resultsPose(a) {
    var f = (a % 114) + 1;
    var toe = null;
    var p;
    if (f <= 12 || f > 80) p = STAND;
    else if (f <= 24) p = mix(STAND, AKIMBO, Math.ceil((f - 12) / 4) / 3);
    else if (f <= 64) {
      p = mix(STAND, AKIMBO, 1);
      var k = Math.floor((f - 25) / 8);
      toe = [[12.3, 54], [13, 55.5], [12.8, 54], [13, 55.5], [12.8, 54]][k];
    } else p = mix(STAND, AKIMBO, 1 - Math.ceil((f - 64) / 4) / 4);
    return { p: p, toe: toe };
  }

  // Rank stamp: a rough frame and the rank in Courier New Bold 69px (wrapping at 17 letters),
  // dark red, dropping from 4x/10x size to 80% over 10 frames, then (frames 31..50) darkening to
  // black and fading to 20%.
  function drawStamp(ctx) {
    var k = Math.min(rs.sf, 50);
    var t = Math.min(1, (k - 1) / 9);
    var px = -0.95 + (10.4 + 0.95) * t, py = -28.25 + (21.3 + 28.25) * t;
    var sx = 4.3439 + (0.8 - 4.3439) * t, sy = 10 + (0.8 - 10) * t;
    var alpha = k <= 10 ? 0.8 * t : k <= 30 ? 0.8 : 0.8 - 0.6 * (k - 30) / 20;
    var mul = k <= 30 ? 1 : Math.max(0, 1 - (k - 30) / 10);
    var col = 'rgb(' + Math.round(153 * mul) + ',0,0)';
    ctx.save();
    ctx.translate(263.3, 229.1);
    ctx.rotate(-25 * Math.PI / 180);
    ctx.translate(px, py);
    ctx.scale(sx, sy);
    ctx.globalAlpha = Math.max(0, alpha);
    // rough frame
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.beginPath();
    var edge = [[-288, -38], [376, -38], [376, 48], [-288, 48]];
    ctx.moveTo(edge[0][0], edge[0][1]);
    for (var i = 1; i <= 4; i++) {
      var a = edge[i - 1], b = edge[i % 4];
      for (var j = 1; j <= 12; j++) {
        var jitter = Math.sin((i * 31 + j) * 12.9898) * 2.2;
        var u = j / 12;
        var ex = a[0] + (b[0] - a[0]) * u, ey = a[1] + (b[1] - a[1]) * u;
        if (a[1] === b[1]) ey += jitter; else ex += jitter;
        ctx.lineTo(ex, ey);
      }
    }
    ctx.closePath();
    ctx.stroke();
    // ink specks along the frame
    for (var n = 0; n < 90; n++) {
      var r1 = (Math.sin(n * 78.233) + 1) / 2, r2 = (Math.sin(n * 39.425) + 1) / 2;
      var side = n % 4;
      var qx = side < 2 ? -292 + r1 * 672 : side === 2 ? -296 + r2 * 10 : 368 + r2 * 12;
      var qy = side === 0 ? -46 + r2 * 14 : side === 1 ? 40 + r2 * 14 : -42 + r1 * 94;
      ctx.fillRect(qx, qy, 1.5 + r2 * 2, 1.5 + r1 * 2);
    }
    // the rank, word-wrapped like the original's 707-wide text box
    var words = String(rs.rank).split(' ');
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var tl = line ? line + ' ' + w : w;
      if (line && tl.length > 17) { lines.push(line); line = w; } else line = tl;
    });
    if (line) lines.push(line);
    lines.forEach(function (l, li) {
      fx.text(ctx, l, 58.15, 26.9 + li * 78, { face: 'courier', size: 69, color: col, align: 'center' });
    });
    ctx.restore();
  }

  var results = {
    st: rs,
    enter: function () {
      var s = S();
      if (!s) { SRPG.engine.go('title', { again: true }); return; }
      SRPG.game.karmaAdjust();
      s.over = true;
      rs.final = s.cash + s.bankcash - s.bankloan;
      rs.netcalc = 0 - s.bankloan;
      rs.rank = SRPG.game.rank(s);
      rs.v = {
        pname: s.pname,
        jobtitle: "'" + SRPG.game.jobTitle(s) + "'",
        categ: SRPG.game.gameLengthLabel(s),
        charm: s.charm, strength: s.strength, intelligence: s.intelligence, karma: s.karma,
        cash: s.cash, bankcash: s.bankcash, bankloan: s.bankloan,
      };
      rs.sf = 0;
      rs.anim = 0;
      rs.rf = 131;
      rs.fpsT = 0;
      buildButtons();
      countStep(); // frame 130 jumps straight into the first count step
    },
    tick: function () {
      rs.anim++;
      // the original prints its measured frame rate in the corner of this screen
      var now = window.performance ? performance.now() : Date.now();
      if (!rs.fpsT) rs.fpsT = now;
      rs.fpsN++;
      if (now - rs.fpsT >= 1000) {
        rs.fps = Math.min(99, Math.round(rs.fpsN * 1000 / (now - rs.fpsT)));
        rs.fpsT = now;
        rs.fpsN = 0;
      }
      if (rs.sf > 0 && rs.sf < 50) {
        rs.sf++;
        if (rs.sf === 10) SRPG.sound.play('punch'); // the stamp's thud
      }
      if (rs.rf === 131) countStep();
      else if (rs.rf < 161) {
        rs.rf++;
        if (rs.rf === 150) { rs.sf = 1; }
        if (rs.rf === 161) buildButtons();
      }
    },
    render: function (ctx) {
      fx.bg(ctx);
      var jolt = rs.rf >= 160;
      var v = rs.v;
      // the stick figure
      var fp = resultsPose(rs.anim);
      ctx.save();
      ctx.translate(69.5, 101.5);
      figure(ctx, fp.p, { toe: fp.toe });
      ctx.restore();
      // labels
      LABELS.forEach(function (L) {
        var x = jolt ? L[5] : L[3], y = jolt ? L[6] : L[4], r = jolt ? L[7] : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r * Math.PI / 180);
        fx.text(ctx, L[0], L[8], L[9], { size: L[1], color: L[2] });
        if (L[10]) fx.text(ctx, L[10], L[11], L[9], { size: L[1], color: L[2] });
        ctx.restore();
      });
      VALUES.forEach(function (V) {
        var x = jolt ? V[5] : V[3], y = jolt ? V[6] : V[4], r = jolt ? V[7] : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(r * Math.PI / 180);
        fx.text(ctx, String(v[V[0]]), -13.7, V[1] * 1.1, { size: V[1], color: V[2] });
        ctx.restore();
      });
      // the sum line and NET WORTH: $
      ctx.save();
      ctx.lineCap = 'round';
      D.line(ctx, 300, 312, 506, 312, '#003399', 3);
      ctx.restore();
      ctx.save();
      if (jolt) { ctx.translate(122, 315.1); ctx.rotate(2 * Math.PI / 180); } else ctx.translate(121.3, 322.2);
      fx.text(ctx, 'NET WORTH:', -29.45, 26, { size: 20, color: '#000066' });
      fx.text(ctx, '$', 198.6, 26, { size: 24, color: '#ffcc00' });
      ctx.restore();
      ctx.save();
      var flash = rs.rf >= 133 && rs.rf <= 149;
      if (flash) { ctx.translate(348.7, 321.3); ctx.scale(1.05, 1.05); } else if (jolt) {
        ctx.translate(354.1, 323.1);
        ctx.rotate(2 * Math.PI / 180);
      } else ctx.translate(353.6, 322.1);
      fx.text(ctx, String(rs.netcalc), -13.7, 26.4, { size: 24, color: flash ? '#ffff00' : '#ffcc00' });
      ctx.restore();
      // buttons
      if (rs.rf <= 132) fx.text(ctx, 'SKIP', 511.55, 398.1, { size: 14, color: '#000000', width: 36 });
      if (rs.rf >= 150) fx.text(ctx, String(rs.fps), 5.9, 394.6, { size: 14, color: '#ffffff' });
      if (rs.rf >= 161) fx.impactButton(ctx, 'DONE', 517.5 - 30.6, 380.9 - 14.6, rs.hot.done, 2);
      if (rs.sf > 0) drawStamp(ctx);
    },
  };
  SRPG.results = results;
  SRPG.registerScreen('results', results);
})();
