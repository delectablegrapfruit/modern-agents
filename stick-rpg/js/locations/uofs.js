// University of Stick (root frame 60): STUDY, GO TO CLASS and GO TO THE GYM. Each costs 2 hours
// (only before 23:00) and gives +1 karma; the stat rises part-way through a short animation
// (root frames 61-63) that then returns to the menu, exactly as the original's timelines.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;
  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';
  var VERDANA = 'Verdana, "DejaVu Sans", Arial, sans-serif';

  // The three animations: frames long, the frame whose script raises the stat, and what it does.
  var ANIMS = {
    study: { frames: 25, at: 10, stat: 'intelligence', title: 'INTELLIGENCE INCREASED!!!' },
    'class': { frames: 25, at: 11, stat: 'intelligence', title: 'INTELLIGENCE INCREASED!!!' },
    gym: { frames: 24, at: 11, stat: 'strength', title: 'STRENGTH INCREASED!!!' },
  };

  var st = { anim: null, frame: 0, canvas: null }; // anim: key of ANIMS while one plays; frame: 1-based

  function S() { return SRPG.game.s; }

  var rules = {
    // Starting an activity (the button handlers): all need time < 23; class also needs $20.
    start: function (s, kind) {
      if (!(s.time < 23)) return false;
      if (kind === 'class' && !(s.cash > 19)) return false;
      SRPG.game.addKarma(1);
      s.time += 2;
      if (kind === 'class') s.cash -= 20;
      return true;
    },
    // The animation's stat script: study +1 INT, class +2 INT, gym +1 STR and +1 max HP (the max
    // HP goes up even when strength is already 999). All capped at 999.
    raise: function (s, kind) {
      if (kind === 'study') s.intelligence = Math.min(s.intelligence + 1, 999);
      if (kind === 'class') {
        s.intelligence += 2;
        if (s.intelligence > 999) s.intelligence = 999;
      }
      if (kind === 'gym') SRPG.game.addStat('strength', 1);
    },
  };

  function begin(kind) {
    if (!rules.start(S(), kind)) {
      // The original just ignores the click; the error buzz is the brief's rule for refused actions.
      SRPG.sound.play('error');
      refresh();
      return;
    }
    st.anim = kind;
    st.frame = 1;
    refresh();
  }

  // One 35 Hz tick of the animation (the sprite's timeline).
  function tick() {
    if (!st.anim) return;
    var a = ANIMS[st.anim];
    st.frame += 1;
    if (st.frame === a.at) rules.raise(S(), st.anim);
    if (st.frame >= a.frames) {
      st.anim = null;
      st.frame = 0;
      refresh();
    }
  }

  function refresh() {
    if (SRPG.location.current === 'uofs') SRPG.location.g.refresh();
  }

  // --- menu ---------------------------------------------------------------------------------------
  function text(html, x, y, opts) {
    opts = opts || {};
    var e = ui.el('div', 'nopoint', null, html);
    e.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:bold ' + (opts.size || 12) + 'px ' + FONT +
      ';color:' + (opts.color || '#000') + ';white-space:pre;line-height:17px;' + (opts.w ? 'width:' + opts.w + 'px;text-align:center;' : '');
    return e;
  }

  // Menu button with a coloured second line that lights up with the rest of the label.
  function button(o, onClick) {
    var sub = o.sub ? '<br><span class="sub" style="color:' + o.subColor + '">' + o.sub + '</span>' : '';
    var b = ui.iconButton(null, { icon: o.icon, label: '<span>' + o.label + sub + '</span>', x: o.x, y: o.y, w: o.w || 180, size: 36, id: o.id },
      function () {
        SRPG.sound.play('click');
        onClick();
      });
    var lbl = b.querySelector('.lbl');
    lbl.style.fontSize = '9px';
    lbl.style.marginLeft = '5px';
    lbl.style.lineHeight = '12.6px';
    var s2 = b.querySelector('.sub');
    if (s2) {
      b.addEventListener('mouseenter', function () { s2.style.color = o.subHover; });
      b.addEventListener('mouseleave', function () { s2.style.color = o.subColor; });
    }
    return b;
  }

  function view() {
    var p = ui.panel(181, 46, 356, 252);
    p.setAttribute('data-loc', 'uofs');
    text('UNIVERSITY OF STICK', 181, 63, { color: '#000066', w: 356 });
    if (st.anim) {
      // The animation replaces the buttons and sits above the panel, so it gets its own canvas.
      var c = ui.el('canvas', 'nopoint');
      c.width = 1100;
      c.height = 800;
      c.style.cssText = 'position:absolute;left:0;top:0;width:550px;height:400px;';
      c.setAttribute('data-anim', st.anim);
      st.canvas = c;
      paintAnim();
      return { custom: true };
    }
    st.canvas = null;
    var INT = { subColor: '#557100', subHover: '#daff6a' };
    button({ icon: 'study', label: 'STUDY', sub: '(+1 INTELLIGENCE)', subColor: INT.subColor, subHover: INT.subHover,
      x: 187, y: 120, id: 'study' }, function () { begin('study'); });
    button({ icon: 'class', label: 'GO TO CLASS - <span style="font-size:10.5px">$20</span>', sub: '(+2 INTELLIGENCE)',
      subColor: INT.subColor, subHover: INT.subHover, x: 187, y: 169, id: 'class' }, function () { begin('class'); });
    button({ icon: 'gym', label: 'GO TO THE GYM', sub: '(+1 STRENGTH)', subColor: '#600093', subHover: '#e4b3ff',
      x: 370.5, y: 121, w: 160, id: 'gym' }, function () { begin('gym'); });
    var leave = ui.iconButton(null, { icon: 'leave', label: 'LEAVE', x: 372, y: 250, w: 81, size: 36, id: 'leave' }, function () {
      SRPG.sound.play('click');
      SRPG.location.leave();
    });
    leave.querySelector('.lbl').style.fontSize = '10.5px';
    return { custom: true };
  }

  // --- animation art (drawn over the panel, centred on the original sprite's origin 359,145) ---------
  function figureHead(ctx, x, y, r) {
    D.circle(ctx, x, y, r, '#0066cc', '#000', 1);
  }

  function paintAnim() {
    if (!st.canvas || !st.anim) return;
    var ctx = st.canvas.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 550, 400);
    drawAnim(ctx);
  }

  function drawAnim(ctx) {
    var a = ANIMS[st.anim];
    var f = st.frame;
    var ox = 359, oy = 145;
    var s = S();
    // title and the stat, which swells when it goes up
    D.text(ctx, a.title, ox, oy - 46, { size: 16, align: 'center', baseline: 'middle', color: '#fff', font: VERDANA, bold: true });
    var big = f >= a.at;
    ctx.save();
    ctx.translate(ox, oy - 12.5);
    ctx.scale(big ? 1.3 : 1.1, big ? 1.3 : 1.1);
    D.text(ctx, String(s[a.stat]), 0, 0, { size: 16, align: 'center', baseline: 'middle', color: '#ffff00', font: VERDANA });
    ctx.restore();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (st.anim === 'gym') drawGym(ctx, ox, oy, f);
    else if (st.anim === 'study') drawStudy(ctx, ox, oy, f);
    else drawClass(ctx, ox, oy, f);
    ctx.restore();
  }

  // Lifting a barbell: it wobbles at chest height, then goes up overhead from frame 13 (the
  // sprite's positions: bar centre 199.5, 189.5, 179.5, 169.5).
  function drawGym(ctx, ox, oy, f) {
    var barY = f < 13 ? 199.5 + (f % 4 >= 2 ? 1 : 0) + (f >= 9 ? 1 : 0) : f < 15 ? 189.5 : f < 17 ? 179.5 : 169.5;
    var x = ox - 2;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x - 12, 261);
    ctx.lineTo(x - 2, 232);
    ctx.lineTo(x + 10, 261);
    ctx.moveTo(x - 2, 232);
    ctx.lineTo(x - 1, 198);
    // arms: elbows out, hands on the bar
    ctx.moveTo(x - 1, 204);
    ctx.lineTo(x - 17, Math.max(barY + 6, 196));
    ctx.lineTo(x - 22, barY);
    ctx.moveTo(x - 1, 204);
    ctx.lineTo(x + 17, Math.max(barY + 6, 196));
    ctx.lineTo(x + 22, barY);
    ctx.stroke();
    figureHead(ctx, x, 182, 16);
    // bar and plates
    D.rect(ctx, x - 53, barY - 1.5, 106, 3, '#999999', '#333333', 0.6);
    [-1, 1].forEach(function (sd) {
      var px = x + sd * 38;
      D.circle(ctx, px, barY, 12.5, '#000000', '#333333', 1);
      D.circle(ctx, px - sd * 2, barY - 1, 9, '#1a1a1a', '#555555', 0.8);
      D.rect(ctx, px - 3, barY - 3, 6, 6, '#c4c4c4', '#333333', 0.6);
    });
  }

  // Studying at a desk with a stack of books, pencil scribbling.
  function drawStudy(ctx, ox, oy, f) {
    var x = ox - 2;
    var y = oy + 5;
    var wob = (f % 4 < 2) ? 0 : 2;
    // stool legs / figure's legs under the desk
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 67);
    ctx.lineTo(x - 12, y + 118);
    ctx.moveTo(x + 8, y + 67);
    ctx.lineTo(x + 14, y + 118);
    ctx.stroke();
    // body and arm to the pencil
    ctx.beginPath();
    ctx.moveTo(x, y + 36);
    ctx.lineTo(x, y + 70);
    ctx.moveTo(x, y + 50);
    ctx.lineTo(x + 12 + wob, y + 62);
    ctx.lineTo(x + 5 + wob, y + 64);
    ctx.stroke();
    figureHead(ctx, x, y + 20, 16);
    // desk
    D.poly(ctx, [x - 55, y + 70, x + 36, y + 70, x + 46, y + 81, x - 45, y + 81], '#ccb71e', '#000', 1);
    D.poly(ctx, [x - 55, y + 70, x - 45, y + 81, x - 45, y + 123, x - 55, y + 113], '#787032', '#000', 1);
    D.poly(ctx, [x - 45, y + 81, x + 46, y + 81, x + 46, y + 123, x + 28, y + 123, x + 28, y + 100, x - 27, y + 100, x - 27, y + 123,
      x - 45, y + 123], '#9c9141', '#000', 1);
    // paper and pencil
    D.poly(ctx, [x - 10, y + 72, x + 18, y + 70, x + 26, y + 77, x - 3, y + 79], '#ffffff', '#000', 0.8);
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 4 + wob, y + 72);
    ctx.lineTo(x + 12 + wob, y + 60);
    ctx.stroke();
    // books
    D.poly(ctx, [x - 53, y + 59, x - 22, y + 58, x - 18, y + 65, x - 50, y + 66], '#3399ff', '#000', 0.8);
    D.poly(ctx, [x - 54, y + 51, x - 22, y + 51, x - 19, y + 58, x - 52, y + 59], '#cccccc', '#000', 0.8);
    D.poly(ctx, [x - 58, y + 43, x - 30, y + 42, x - 21, y + 51, x - 53, y + 52], '#ff6633', '#000', 0.8);
  }

  // Class: sitting at a school desk (with an apple for the teacher), then nodding off from frame 11
  // until the head rests on the desk (the sprite's head top: 166, then 179 -> 215).
  function drawClass(ctx, ox, oy, f) {
    var x = ox - 2;
    var top = f < 11 ? 166 : 179 + (f - 11) * (36 / 14);
    var sleep = (top - 166) / 49; // 0 awake .. 1 face down
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x - 2, top + 30);
    ctx.lineTo(x, 262);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x - 2, top + 16 - sleep * 7, 16 + sleep * 2, 16 - sleep * 7.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0066cc';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    // desk: grey top, front rail and four legs
    D.poly(ctx, [x - 33, 221, x + 36, 221, x + 43, 238, x - 17, 238], '#cccccc', '#000', 1);
    D.poly(ctx, [x - 33, 221, x - 17, 238, x - 17, 248, x - 33, 231], '#999999', '#000', 1);
    D.rect(ctx, x - 17, 238, 60, 10, '#999999', '#000', 1);
    [[-31, 231, 39], [-17, 248, 39], [27, 244, 25], [34, 248, 39]].forEach(function (l) {
      D.rect(ctx, x + l[0], l[1], 5, l[2], '#999999', '#000', 1);
    });
    // paper and apple
    D.poly(ctx, [x + 2, 227, x + 19, 226, x + 24, 233, x + 7, 234], '#ffffff', '#000', 0.6);
    var g = ctx.createRadialGradient(x + 29, 227, 1, x + 31, 230, 8);
    g.addColorStop(0, '#ff3333');
    g.addColorStop(1, '#990000');
    D.circle(ctx, x + 31, 230, 6, null);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    D.line(ctx, x + 31, 224, x + 33, 220, '#336600', 1.2);
    D.poly(ctx, [x + 33, 222, x + 38, 219, x + 34, 224], '#009933');
  }

  // --- the campus -----------------------------------------------------------------------------------
  function windowAt(ctx, x, y, w, h) {
    D.rect(ctx, x, y, w, h, '#ccb71e', '#333333', 1);
    D.rect(ctx, x + 3, y + 3, w - 6, h - 6, '#604d0d', '#333333', 0.6);
    D.rect(ctx, x + 3, y + h - 9, w - 6, 6, '#787032');
  }

  function background(ctx) {
    D.rect(ctx, 0, 0, 550, 400, '#3399cc');
    // top tier
    D.poly(ctx, [114, -2, 436, -2, 441, 30, 110, 30], '#9c9141', '#333333', 1);
    D.rect(ctx, 108, 29, 335, 6, '#787032', '#333333', 1);
    // middle tier
    D.poly(ctx, [37, 35, 513, 35, 527, 133, 23, 133], '#9c9141', '#333333', 1);
    [146, 200, 362, 415, 468].forEach(function (x) { D.line(ctx, x, 35, x + (x < 275 ? -1 : 1), 133, '#333333', 1); });
    D.poly(ctx, [37, 35, 146, 35, 145, 133, 23, 133], '#9c9141', '#333333', 1);
    windowAt(ctx, 155, 67, 35, 36);
    windowAt(ctx, 370, 67, 36, 36);
    windowAt(ctx, 423, 67, 36, 36);
    // lower tier with its ledge
    D.rect(ctx, 3, 133, 544, 7, '#787032', '#333333', 1);
    D.rect(ctx, 0, 140, 550, 80, '#9c9141', '#333333', 1);
    [70, 134, 200, 350, 430, 493].forEach(function (x) { D.line(ctx, x, 140, x - 2, 215, '#333333', 1); });
    [[17, 152], [82, 152], [147, 152], [377, 152], [440, 152], [503, 152]].forEach(function (w) { windowAt(ctx, w[0], w[1], 42, 42); });
    // the entrance arch behind the statue
    ctx.beginPath();
    ctx.moveTo(205, 215);
    ctx.lineTo(205, 130);
    ctx.bezierCurveTo(205, 70, 360, 70, 360, 130);
    ctx.lineTo(360, 215);
    ctx.closePath();
    ctx.fillStyle = '#787032';
    ctx.fill();
    ctx.strokeStyle = '#333333';
    ctx.stroke();
    D.rect(ctx, 242, 160, 70, 55, '#604d0d', '#333333', 1);
    // lawn
    var g = ctx.createLinearGradient(0, 0, 550, 0);
    g.addColorStop(0, '#00ff00');
    g.addColorStop(0.38, '#009900');
    g.addColorStop(1, '#006600');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 214);
    ctx.bezierCurveTo(80, 210, 150, 222, 275, 212);
    ctx.bezierCurveTo(390, 204, 480, 214, 550, 208);
    ctx.lineTo(550, 400);
    ctx.lineTo(0, 400);
    ctx.closePath();
    ctx.fill();
    // stone plaza with a few specks
    ctx.beginPath();
    ctx.ellipse(275, 480, 450, 217, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#666666';
    ctx.fill();
    ctx.strokeStyle = '#333333';
    ctx.stroke();
    ctx.fillStyle = '#999999';
    [[95, 292], [176, 275], [132, 336], [251, 342], [305, 361], [371, 336], [402, 373], [453, 348], [518, 312], [470, 290],
      [40, 380], [206, 381], [311, 395], [509, 375], [424, 297], [60, 340], [168, 355]].forEach(function (p) {
      ctx.fillRect(p[0], p[1], 3, 1.5);
    });
    // the statue: a dark sphere on three silver horns
    [[205, 1], [278, 0], [350, -1]].forEach(function (h) {
      var gx = ctx.createLinearGradient(h[0] - 12, 0, h[0] + 12, 0);
      gx.addColorStop(0, '#999999');
      gx.addColorStop(0.45, '#cccccc');
      gx.addColorStop(1, '#333333');
      ctx.fillStyle = gx;
      ctx.beginPath();
      ctx.moveTo(h[0] - 12, 338);
      ctx.quadraticCurveTo(h[0] - 10 + h[1] * 6, 290, h[0] + h[1] * 8, 262);
      ctx.quadraticCurveTo(h[0] + 12, 300, h[0] + 12, 338);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#333333';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    var gs = ctx.createRadialGradient(262, 214, 8, 280, 240, 66);
    gs.addColorStop(0, '#666666');
    gs.addColorStop(0.7, '#1a1a1a');
    gs.addColorStop(1, '#000000');
    D.circle(ctx, 280, 240, 65, null);
    ctx.fillStyle = gs;
    ctx.fill();
  }

  SRPG.registerLocation({
    id: 'uofs',
    hud: 'inside',
    music: 'inside',
    exit: 'uofs',
    panel: { x: 181, y: 46, w: 356, h: 252 },
    onEnter: function () {
      st.anim = null;
      st.frame = 0;
    },
    onLeave: function () {
      st.anim = null;
      st.frame = 0;
    },
    tick: tick,
    background: background,
    foreground: function () {
      if (st.anim) paintAnim();
    },
    view: view,
  });

  SRPG.uofs = { rules: rules, ANIMS: ANIMS, state: st };
})();
