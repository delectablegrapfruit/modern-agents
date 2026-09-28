// Sticky's Liquor (root frame 35 of the original) and its beer-drinking animation (frame 36).
// DRINK BEER, BUY BOTTLE OF BEER, GET INTO A BAR FIGHT (screen 'fight', js/minigames/fight.js) and
// PLAY DRUNKEN DARTS (screen 'darts', js/minigames/darts.js). Prices, time costs and conditions are
// the original's; Sticky's greeting is reworded. The room is drawn in code after the original.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ui = SRPG.ui;
  var D = SRPG.draw;

  var FONT = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';
  var BLUE = '#003399'; // button-label blue
  // The blue panel (shape 105 scaled 1 x 1.25 at 354.4, 172.4 in the original).
  var PANEL = { x: 177, y: 47, w: 355, h: 251 };
  var DRINK_FRAMES = 25; // sprite 1242: +2 charm on its frame 11, back to the menu on frame 25
  var keepArmed = false; // the menu reopening after the drink: clicks there started in the bar

  // --- rules -----------------------------------------------------------------------------------
  // Frame 35's buttons, in the original's order of checks.
  var rules = {
    // DRINK BEER - $20 (+2 CHARM): needs time < 23 and cash > 19; 2 hours; the +2 charm (capped at
    // 999) lands during the drinking animation. The original silently ignores a refused click; we
    // play the error sound like every other refused action.
    drink: function (g) {
      var s = g.s;
      if (s.time < 23 && s.cash > 19) {
        s.cash -= 20;
        s.time += 2;
        g.drink = { t: 1 };
        return true;
      }
      return false; // refused silently, as the original (only BUY BOTTLE plays the error sound)
    },
    // BUY BOTTLE OF BEER - $30: one bottle (haveBooze) per click, no time cost, no limit.
    bottle: function (g) {
      var s = g.s;
      if (s.cash > 29) {
        s.cash -= 30;
        s.booze += 1;
        g.sfx('purchase');
        return true;
      }
      g.error();
      return false;
    },
    // GET INTO A BAR FIGHT: needs time < 22, costs 3 hours up front (win, lose or run).
    fight: function (g) {
      var s = g.s;
      if (s.time < 22) {
        s.time += 3;
        SRPG.engine.go('fight', { from: 'bar' });
        return true;
      }
      return false; // refused silently, as the original
    },
    // PLAY DRUNKEN DARTS: free, no time.
    darts: function () {
      SRPG.engine.go('darts', { from: 'bar' });
      return true;
    },
  };

  // --- the drinking animation (frame 36) --------------------------------------------------------
  function stepDrink(g) {
    var d = g.drink;
    d.t += 1;
    if (d.t === 11) {
      var s = g.s;
      s.charm += 2;
      if (s.charm > 999) s.charm = 999;
      if (d.num) d.num.style.fontSize = '20.8px'; // the number jumps from 110% to 130%
    }
    if (d.num) d.num.textContent = String(g.s.charm);
    if (d.cv) paintDrinker(d.cv.getContext('2d'), d.t);
    if (d.t >= DRINK_FRAMES) {
      g.drink = null;
      // gotoAndStop(35) re-runs the bar's entry script: the fade in from black.
      keepArmed = !!g.armed;
      SRPG.location.open('bar');
    }
  }

  // The drinker (sprite 1242 at 356.4, 142.9): a blue stick man lifts a mug, drains it with his
  // head tipped back, then flings it away over his shoulder and throws his other arm up.
  function paintDrinker(ctx, t) {
    ctx.setTransform(3, 0, 0, 3, 0, 0);
    ctx.clearRect(0, 0, 140, 130);
    // canvas origin = stage (286, 140)
    ctx.translate(-286, -140);
    var ink = '#000';
    var body = '#0066cc';
    var hx = 355, hy = 180, r = 13;
    var tilt = 0; // head lean back while drinking
    if (t >= 7 && t < 17) tilt = Math.min(1, (t - 6) / 4);
    else if (t >= 17) tilt = Math.max(0, 1 - (t - 16) / 4);
    hx -= tilt * 3;
    hy -= tilt * 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.2;
    // legs + body
    ctx.beginPath();
    ctx.moveTo(355, 226);
    ctx.lineTo(346, 258);
    ctx.moveTo(355, 226);
    ctx.lineTo(365, 258);
    ctx.moveTo(355, 226);
    ctx.lineTo(hx + 1, hy + r);
    ctx.stroke();
    var sh = { x: 355, y: 204 };
    // free arm: hangs out to the right, raised in triumph at the end
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    if (t < 19) { ctx.lineTo(370, 210); ctx.lineTo(383, 203); } else { ctx.lineTo(372, 196); ctx.lineTo(383, 184); }
    ctx.stroke();
    // mug arm + mug
    var mug;
    if (t < 7) { // lifting
      var u = (t - 1) / 6;
      mug = { x: 344 - u * 6, y: 205 - u * 34, a: -u * 0.9 };
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(342 - u * 4, 212 - u * 12);
      ctx.lineTo(mug.x + 2, mug.y + 4);
      ctx.stroke();
    } else if (t < 17) { // drinking
      mug = { x: 336 + tilt * 1, y: 168 - tilt * 2, a: -0.9 - tilt * 0.8 };
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(338, 196);
      ctx.lineTo(mug.x + 3, mug.y + 5);
      ctx.stroke();
    } else { // tossed over the shoulder: flies off to the left, spinning
      var v = (t - 16) / 9;
      mug = { x: 334 - v * 42, y: 168 + v * v * 40 - v * 8, a: -1.7 - v * 5 };
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(340, 212);
      ctx.lineTo(327, 219);
      ctx.stroke();
    }
    D.circle(ctx, hx, hy, r, body, ink, 1.2);
    // mouth on the mug while drinking, then a beady eye
    if (t >= 7 && t < 17) D.circle(ctx, hx - 7, hy - 2, 3.2, '#000');
    else if (t >= 17) D.circle(ctx, hx - 5, hy - 5, 1.3, '#000');
    drawMug(ctx, mug.x, mug.y, mug.a, t < 17 ? 1 - Math.max(0, (t - 8) / 9) : 0);
  }

  // Little glass beer mug: gold glass, white head of foam, handle on the right.
  function drawMug(ctx, x, y, a, full) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(1.45, 1.45);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = '#6b4a00';
    ctx.beginPath();
    ctx.arc(6.5, 1, 3.2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    D.roundRect(ctx, -5, -6, 11, 14, 2, 'rgba(255,240,170,0.9)', '#6b4a00', 0.9);
    if (full > 0) {
      var h = 12 * full;
      ctx.fillStyle = '#e8a000';
      ctx.fillRect(-4.2, 7.2 - h, 9.4, h);
      ctx.fillStyle = '#fffbe6';
      ctx.beginPath();
      ctx.arc(-2.5, 7.2 - h, 2.2, Math.PI, 0);
      ctx.arc(1, 7.2 - h - 0.5, 2.4, Math.PI, 0);
      ctx.arc(4, 7.2 - h, 2, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- the room ---------------------------------------------------------------------------------
  var bgCache = null;
  function drawBar(ctx) {
    if (!bgCache) {
      bgCache = document.createElement('canvas');
      bgCache.width = SRPG.W * 2;
      bgCache.height = SRPG.H * 2;
      var c = bgCache.getContext('2d');
      c.scale(2, 2);
      paintRoom(c);
    }
    ctx.drawImage(bgCache, 0, 0, SRPG.W, SRPG.H);
  }

  function poly(ctx, pts, fill, stroke, lw) { D.poly(ctx, pts, fill, stroke, lw); }

  function paintRoom(ctx) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var ink = '#333333';
    // ceiling and the dark strip under the HUD
    D.rect(ctx, 0, 0, 550, 400, '#666666');
    D.rect(ctx, 0, 0, 550, 9, '#333333');

    // back wall (dark olive), its top edge rising to the right
    poly(ctx, [0, 65, 550, 51, 550, 175, 0, 207], '#604d0d', ink, 1);
    // wood panelling at the far right
    poly(ctx, [531, 52, 550, 51, 550, 172, 531, 174], '#743f1f', ink, 1);

    // the cooler at the left: top, red sign with a white swoosh, grey body, black door
    poly(ctx, [0, 73.5, 17, 73.5, 46, 79.3, 0, 79.3], '#e2e2e2', ink, 1);
    D.rect(ctx, 0, 79, 48, 37, '#cc0000');
    ctx.strokeStyle = '#8a0000';
    ctx.lineWidth = 1;
    ctx.strokeRect(-1, 79, 49, 37);
    // a thick white ribbon that steps down to the right, and a short one under its tail
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-2, 94.8);
    ctx.lineTo(9, 94.8);
    ctx.bezierCurveTo(16, 94.8, 17, 101.4, 25, 101.4);
    ctx.lineTo(38.5, 101.4);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-2, 103.8);
    ctx.lineTo(10.5, 103.8);
    ctx.stroke();
    ctx.lineCap = 'round';
    var cg = ctx.createLinearGradient(0, 0, 48, 0);
    cg.addColorStop(0, '#d8d8d8');
    cg.addColorStop(0.7, '#c6c6c6');
    cg.addColorStop(1, '#a9a9a9');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 116, 48, 88);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(-1, 116, 49, 88);
    D.rect(ctx, 0, 140, 34, 64, '#000000');

    // back-bar cabinet: side face, top, front with a gold-framed window
    poly(ctx, [59, 116, 72, 94, 86, 94, 86, 200, 59, 202], '#985329', ink, 1);
    poly(ctx, [72, 94, 250, 89, 250, 92, 86, 97], '#a0603a', ink, 1);
    poly(ctx, [86, 94, 250, 90, 250, 196, 86, 200], '#8f4b24', ink, 1);
    D.rect(ctx, 100, 108, 150, 90, '#b4a749', '#5d5620', 1);
    D.rect(ctx, 104, 112, 142, 84, '#9c9141');
    glass(ctx, 108, 116, 32, 79);
    glass(ctx, 145, 116, 100, 79);
    D.line(ctx, 142.5, 112, 142.5, 196, '#6b6420', 1);

    // the bar counter: red rail, grey front, dark end, brown corner post and lip
    poly(ctx, [0, 200, 550, 169, 550, 180, 0, 214], '#8c0000', ink, 1);
    D.line(ctx, 0, 201.5, 550, 170.5, '#b01010', 1.2);
    var fg = ctx.createLinearGradient(40, 0, 550, 0);
    fg.addColorStop(0, '#a3a3a3');
    fg.addColorStop(0.25, '#8a8a8a');
    fg.addColorStop(1, '#5e5e5e');
    poly(ctx, [42, 212, 550, 180, 550, 288, 42, 323], fg, ink, 1);
    poly(ctx, [0, 214, 30, 212, 30, 320, 0, 318], '#595959', ink, 1);
    poly(ctx, [30, 212, 43, 211, 43, 324, 30, 322], '#663300', ink, 1);
    // the brown lip under the rail, thinning towards the back
    poly(ctx, [0, 214, 550, 180, 550, 184, 0, 222.3], '#663300', ink, 1);

    // floor: dark olive boards in perspective with lighter grain
    poly(ctx, [0, 318, 30, 322, 43, 324, 550, 288, 550, 400, 0, 400], '#604d0d');
    floorBoards(ctx);

    // bar stools / chairs, smaller towards the back
    chair(ctx, 70, 227, 1.0);
    chair(ctx, 187, 225, 0.97);
    chair(ctx, 320, 212, 0.9);
    chair(ctx, 492, 200, 0.85);
  }

  function glass(ctx, x, y, w, h) {
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#6fd3ff');
    g.addColorStop(0.55, '#50b6e9');
    g.addColorStop(1, '#3aa3dc');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#5d5620';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, w, h);
  }

  // Boards run into the distance, fanning out towards the viewer; each has one glossy streak
  // with a hard edge fading back into the dark olive, and thin dark seams.
  // Lines as [y at x=0, y at x=550]; the first is the foot of the counter.
  var SEAMS = [[327, 288], [361, 284], [404, 310], [443, 336], [488, 362], [534, 391]];
  // Streak per board: [from, to] as fractions of the board's height; the hard edge is at `from`.
  var GLOSS = [[0.5, 0.95], [0.34, 0.04], [0.4, 0.85], [0.3, 0.02], [0.45, 0.9]];
  function floorBoards(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 318);
    ctx.lineTo(43, 324);
    ctx.lineTo(550, 288);
    ctx.lineTo(550, 400);
    ctx.lineTo(0, 400);
    ctx.closePath();
    ctx.clip();
    function at(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
    for (var i = 1; i < SEAMS.length; i++) {
      var a = SEAMS[i - 1], b = SEAMS[i];
      var g0 = GLOSS[i - 1];
      var p0 = at(a, b, g0[0]), p1 = at(a, b, g0[1]);
      var grad = ctx.createLinearGradient(0, (p0[0] + p0[1]) / 2, 0, (p1[0] + p1[1]) / 2);
      grad.addColorStop(0, 'rgba(142,114,20,0.95)');
      grad.addColorStop(0.35, 'rgba(126,100,17,0.6)');
      grad.addColorStop(1, 'rgba(96,77,13,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, p0[0]);
      ctx.lineTo(550, p0[1]);
      ctx.lineTo(550, p1[1]);
      ctx.lineTo(0, p1[0]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#3f3a2a';
    ctx.lineWidth = 0.9;
    for (var j = 1; j < SEAMS.length; j++) D.line(ctx, 0, SEAMS[j][0], 550, SEAMS[j][1], '#3f3a2a', 0.9);
    ctx.restore();
  }

  // Wooden chair seen from behind, turned a little (the original's 3/4 view): the slatted back
  // faces the room, the seat's left side shows beside it, two stretchers run between the legs.
  // Local units: (0, 0) is the stage point (x, y) at scale 1 (the front chair: 70, 227).
  function chair(ctx, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    var wood = '#804000', ink = '#333333';
    function part(pts) { poly(ctx, pts, wood, ink, 1); }
    // the far legs (front-left and front-right), seen past the side and through the back
    part([-0.5, 32, 3.9, 32.5, 3.9, 92.5, -0.5, 92.5]);
    part([49.4, 38, 53.1, 38, 53.1, 92, 49.4, 92]);
    // the far side's stretchers, glimpsed between the right legs
    part([53.1, 53.5, 58, 53.5, 58, 56.5, 53.1, 56.5]);
    part([53.1, 66.5, 58, 66.5, 58, 69.5, 53.1, 69.5]);
    // the seat's left side: its rail and two stretchers, slanting back
    part([-0.5, 32, 8.25, 33.5, 8.25, 42.5, -0.5, 41]);
    part([3.9, 53, 8.25, 54.5, 8.25, 58, 3.9, 56.5]);
    part([3.9, 66, 8.25, 67.5, 8.25, 71, 3.9, 69.5]);
    // the back legs, the rail under the seat and the stretchers between them
    part([58, 33, 62, 33, 62, 92.5, 58, 92.5]);
    part([8.25, 33, 12.6, 33, 12.6, 95, 8.25, 95]);
    part([8.25, 35, 62, 35, 62, 42.5, 8.25, 42.5]);
    part([12.6, 52.5, 58, 52, 58, 55.5, 12.6, 56]);
    part([12.6, 66, 58, 65.5, 58, 69, 12.6, 69.5]);
    // the back: posts and a curved crest rail framing six gaps (the seat shows at their feet)
    ctx.beginPath();
    ctx.moveTo(8.25, 3.75);
    ctx.quadraticCurveTo(35, 0.2, 62, 0.6);
    ctx.lineTo(62, 35);
    ctx.lineTo(8.25, 35);
    ctx.closePath();
    var gaps = [[12, 17.6], [21, 25.75], [29.1, 33.6], [37.25, 41.75], [45.1, 49.5], [53.25, 58.25]];
    gaps.forEach(function (gx, i) {
      var top = 11.9 - i * 0.35;
      ctx.moveTo(gx[0], top);
      ctx.lineTo(gx[0], 35);
      ctx.lineTo(gx[1], 35);
      ctx.lineTo(gx[1], top);
      ctx.closePath();
    });
    ctx.fillStyle = wood;
    ctx.fill('evenodd');
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    // the seat, seen at the foot of each gap
    gaps.forEach(function (gx, i) { part([gx[0], 31 - i * 0.2, gx[1], 31.5 - i * 0.2, gx[1], 35, gx[0], 35]); });
    ctx.restore();
  }

  // --- menu --------------------------------------------------------------------------------------
  // Stage position -> position inside the panel (inside its 1px border).
  function rel(x, y) { return x != null ? x - PANEL.x - 1 : y - PANEL.y - 1; }

  function textBox(parent, html, x, y, w, o) {
    o = o || {};
    var t = ui.el('div', 'nopoint', parent, html);
    t.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;' + (w ? 'width:' + w + 'px;' : 'white-space:nowrap;') +
      'font:bold ' + (o.size || 11) + 'px ' + (o.font || FONT) + ';color:' + (o.color || '#000') + ';line-height:' +
      (o.lh || 13) + 'px;text-align:' + (o.align || 'left') + (o.extra || '');
    if (o.id) t.setAttribute('data-id', o.id);
    return t;
  }

  function lbl(html) {
    return '<span style="font-size:9px;line-height:13px;white-space:nowrap;color:' + BLUE + '">' + html + '</span>';
  }

  // Icon button placed by its tile's top-left corner in stage coordinates.
  function item(g, p, o) {
    var b = ui.iconButton(p, { icon: o.icon, label: lbl(o.label), x: rel(o.x), y: rel(null, o.y), w: o.w || 160, size: o.size || 36, id: o.id }, function (e) {
      // The second click of a double-click begun on another screen (the fight's OK sits over
      // DRINK BEER / GET INTO A BAR FIGHT) must not buy anything.
      if (e && e.detail > 1 && !g.armed) return;
      o.onClick(g);
      if (SRPG.engine.sceneName === 'location' && SRPG.location.current === 'bar') g.refresh();
    });
    b.querySelector('.lbl').style.marginLeft = (o.gap != null ? o.gap : 7) + 'px';
    return b;
  }

  function buildMenu(g) {
    var p = ui.panel(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    p.setAttribute('data-loc', 'bar');
    p.style.background = 'rgba(72,132,255,0.9)'; // the panel shape placed at 90% here
    // A press that starts here (not the tail of a double-click from the previous screen) arms the
    // menu for this visit, so fast repeated clicks (bottle after bottle) all count.
    p.addEventListener('mousedown', function (e) { if (e.detail <= 1) g.armed = true; }, true);
    if (g.drink) return buildDrink(g, p);
    // Centred on the original's text field (211.3..506.9, centre 359.1), not on the panel.
    textBox(p, '"\'Ello, name\'s Sticky.  What\'re ye havin\', mate?"', rel(359.1 - 177), rel(null, 68), 354,
      { size: 12, align: 'center', lh: 14, id: 'quote' });
    // Tiles: 48px buttons at 75% (36px), centred on the original's button positions.
    item(g, p, { icon: 'beer', id: 'drink', x: 211.4, y: 118.2, label: 'DRINK BEER - $20<br>(+2 CHARM)', onClick: rules.drink });
    item(g, p, { icon: 'bottle', id: 'bottle', x: 361, y: 118.2, label: 'BUY BOTTLE OF<br>BEER - $30', onClick: rules.bottle });
    item(g, p, { icon: 'barfight', id: 'barfight', x: 209.9, y: 170.2, label: 'GET INTO A<br>BAR FIGHT', onClick: rules.fight });
    item(g, p, { icon: 'darts', id: 'darts', x: 359.6, y: 170.2, size: 38, label: 'PLAY DRUNKEN<br>DARTS', gap: 6, onClick: rules.darts });
    var lv = item(g, p, { icon: 'leave', id: 'leave', x: 433.5, y: 249.9, w: 100, label: '<span style="font-size:10.5px">LEAVE</span>', gap: 6, onClick: function (gg) { gg.leave(); } });
    return lv;
  }

  // Frame 36: the menu is cleared, the panel stays; CHARM INCREASED!!! over the charm value and
  // the drinker.
  function buildDrink(g, p) {
    var d = g.drink;
    textBox(p, 'CHARM INCREASED!!!', rel(237.6), rel(null, 86), 238.7, { size: 14, align: 'center', color: '#ffffff', lh: 20, id: 'drinkhead' });
    d.num = textBox(p, String(g.s.charm), rel(300), rel(null, 117), 110, {
      size: 17.6, align: 'center', color: '#ffff33', lh: 24, font: 'Arial, Helvetica, sans-serif', id: 'drinkcharm',
      extra: ';font-weight:normal',
    });
    if (d.t >= 11) d.num.style.fontSize = '20.8px';
    var cv = document.createElement('canvas');
    cv.width = 140 * 3;
    cv.height = 130 * 3;
    cv.style.cssText = 'position:absolute;left:' + rel(286) + 'px;top:' + rel(null, 140) + 'px;width:140px;height:130px;pointer-events:none';
    p.appendChild(cv);
    d.cv = cv;
    paintDrinker(cv.getContext('2d'), d.t);
  }

  SRPG.registerLocation({
    id: 'bar',
    hud: 'inside',
    music: 'inside',
    exit: 'bar',
    panel: PANEL,
    background: function (ctx) { drawBar(ctx); },
    onEnter: function (g) {
      g.drink = null;
      g.armed = keepArmed;
      keepArmed = false;
    },
    tick: function (g) { if (g.drink) stepDrink(g); },
    view: function (g) {
      buildMenu(g);
      return { custom: true };
    },
  });

  // Shared with the tests and the minigames.
  SRPG.bar = { rules: rules, PANEL: PANEL, drawRoom: drawBar, DRINK_FRAMES: DRINK_FRAMES };
})();
