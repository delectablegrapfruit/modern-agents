// Top-down sprites for the city map: the player (standing, walking, skating, driving, falling off
// the edge, knocked flat), the street people and the cars. Positions are stage coordinates of the
// sprite's registration point (the original's clip origin), rotations in degrees (0 = heading up).
//
// The player's look follows the original's 400-frame "person" clip: 20 standing, 185-229 falling
// into the sky, 230-270 knocked flat by a car (231 on waking up), 275-302 walking, 305-326
// skateboarding, 327 in the car, 361-400 the car crash. The clip is rotated to the walking
// direction as a whole, so a fall off the south edge drops "down" the screen.
//
// Standing still never gets past frame 21: the walk clip's first frame (every other tick) sends the
// person back to frame 20 whenever no key is held (person.gotoAndPlay(20)), so the stretch and the
// sleeping "Z" drawn in frames 84-180 never show in the game.
(function () {
  'use strict';
  var SRPG = window.SRPG;

  var ARM = '#2b2b2b';
  var LEG = '#666666';
  var INK = '#000000';
  var HEAD_R = 9.2;
  var NPC_BLUE = '#0066cc';

  // ---------------------------------------------------------------------------------------------
  // drawing helpers

  function strokeLine(ctx, p, color, lw) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  function head(ctx, x, y, r, color, outline) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.lineWidth = outline;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }
  function poly(ctx, p, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function oval(ctx, x, y, rx, ry, fill, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = 0.4;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
  function now() { return SRPG.engine ? SRPG.engine.frame : 0; }

  // Standing (frame 20), seen from above: head with the elbows out and forearms forward.
  function standing(ctx, color) {
    strokeLine(ctx, [-9.4, -1.4, -13, -3.9, -13, -8.4], ARM, 1.1);
    strokeLine(ctx, [9, -1, 13.4, -3.6, 13.4, -7.6], INK, 1.1);
    head(ctx, -0.4, -0.6, HEAD_R, color, 1.3);
  }

  // Walking: the person clip's frames 275-301 (frame 302 jumps straight back to 275, so a stride
  // lasts 27 ticks), each pose held for two ticks. Measured from the original's frames: head centre,
  // then each visible limb as [shade, x0, y0, x1, y1, ...] (shade 0 black, 1 dark grey, 2 grey); the
  // first point lies under the head. Legs stick out ahead of and behind the head, the arms swing.
  var WALK_FRAMES = 27, SKATE_FRAMES = 21;
  var LIMB = ['#000000', '#333333', '#666666'];
  var WALK = [
    [-0.3, -0.6, [[2, 1.2, -8.5, 1.5, -10, 2.2, -16.2], [2, -8.3, -1.8, -9.8, -2, -14.5, -3.5, -14.2, -13.2], [0, 7.8, -0.7, 9.2, -0.8, 12.5, -1.2], [2, -3.2, 6.8, -3.8, 8.2, -4.5, 16]]],
    [-0.5, -0.7, [[1, 1.4, -8.5, 1.8, -10, 1.5, -12.5], [1, -8.8, -0.7, -10.2, -0.8, -14.2, -3, -14.8, -11.5], [1, 7.5, -2, 9, -2.2, 12.8, -4], [1, -4.5, 6.4, -5.2, 7.8, -4.2, 12.2]]],
    [-0.8, -0.7, [[1, -9, -0.8, -10.5, -0.8, -14.8, -3, -15, -9.2], [1, 7.3, -1.6, 8.8, -1.8, 13.2, -5.5]]],
    [-1.2, -0.7, [[1, 7, -0.8, 8.5, -0.8, 12.5, -3.2, 12.5, -7.8], [1, -9.5, -0.8, -11, -0.8, -15.2, -3.2, -15.2, -7.5]]],
    [-1.5, -0.8, [[1, 6.8, -0.8, 8.2, -0.8, 12.8, -3.8, 12.5, -10.2], [1, -9.8, -0.8, -11.2, -0.8, -15.5, -3.2]]],
    [-1.8, -0.8, [[1, -4.9, -8.4, -5.5, -9.8, -6, -13.2], [2, 6.3, -1.8, 7.8, -2, 12.5, -4, 12, -12.8], [0, -10, -0.8, -11.5, -0.8, -15.8, -0.5], [1, -0.9, 7.3, -0.8, 8.8, 0.8, 11.2]]],
    [-1.8, -0.7, [[2, -4.7, -8.3, -5.2, -9.8, -6, -17.2], [2, 6.3, -1.6, 7.8, -1.8, 11.8, -4.2, 11.5, -12.8], [1, -10, -0.8, -11.5, -0.8, -15.5, 2.2], [2, 0.6, 7.1, 1, 8.5, 0, 15]]],
    [-1.8, -0.6, [[2, -4.5, -8.3, -5, -9.8, -5.8, -17.2], [1, 6.3, -1.6, 7.8, -1.8, 11.2, -3.2, 11.2, -9.8], [2, -9.8, 1.2, -11.2, 1.5, -14.2, 5.2], [2, -1.8, 7.5, -1.8, 9, 0.8, 8.8, 0.2, 15]]],
    [-1.6, -0.7, [[1, -5.1, -8.1, -5.8, -9.5, -5.5, -13.2], [1, 6.5, -0.8, 8, -0.8, 11.8, -3.5, 11.2, -8], [0, -9.8, -0.3, -11.2, -0.2, -16, -0.8], [1, -0, 7.3, 0.2, 8.8, 0.5, 11]]],
    [-1.4, -0.7, [[1, 6.8, -0.8, 8.2, -0.8, 12.2, -6.8], [1, -9.5, -1.8, -11, -2, -15.2, -4.5]]],
    [-1.3, -0.8, [[1, -9.5, -0.8, -11, -0.8, -14.5, -6.5], [1, 6.8, 0.1, 8.2, 0.2, 12.8, -3.5]]],
    [-0.9, -0.7, [[1, -9.2, -0.8, -10.8, -0.8, -15.2, -4.2, -14.8, -9.5], [0, 7.2, -0.8, 8.8, -0.8, 13, -1]]],
    [-0.6, -0.7, [[1, -8.8, -0.3, -10.2, -0.2, -14.5, -4.5, -14.2, -11.8], [1, 7.5, -0.8, 9, -0.8, 13, 3]]],
    [-0.3, -0.7, [[2, -8.5, -0.8, -10, -0.8, -13.8, -4.5, -13.5, -13.8], [1, 1, -8.8, 1.2, -10.2, 2, -12.8], [2, 7.5, 1.4, 9, 1.8, 11.8, 5.8], [1, -3.9, 6.7, -4.5, 8, -4, 11.8]]]
  ];
  function walking(ctx, color, i) {
    var p = WALK[Math.min(13, Math.floor(i / 2))];
    for (var k = 0; k < p[2].length; k++) {
      var l = p[2][k];
      strokeLine(ctx, l.slice(1), LIMB[l[0]], 1.2);
    }
    head(ctx, p[0], p[1], HEAD_R, color, 1.3);
  }

  // Skateboarding: frames 305-325 (326 jumps back to 305, a 21-tick cycle): on the board, one arm up
  // and forward, the other down and out.
  function skating(ctx, color, i) {
    var w = Math.sin((i / SKATE_FRAMES) * Math.PI * 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-5.5, -18.2, 11.7, 35, 5.8);
    else ctx.rect(-5.5, -18.2, 11.7, 35);
    var g = ctx.createLinearGradient(0, -18.2, 0, 16.8);
    g.addColorStop(0, '#222222');
    g.addColorStop(0.2, '#555555');
    g.addColorStop(0.5, '#7a7a7a');
    g.addColorStop(0.8, '#555555');
    g.addColorStop(1, '#222222');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#111';
    ctx.stroke();
    strokeLine(ctx, [-8.7, -1.2, -10 - w * 0.6, -11.2, -6.7 - w, -17.5], ARM, 1.2);
    strokeLine(ctx, [8.2, 5, 13.2, 5.7 + w * 0.5, 15 + w * 0.5, -0.7], INK, 1.2);
    head(ctx, 0, -0.8, HEAD_R, color, 1.3);
  }

  // Knocked flat (frames 230..269, also the waking-up 231..): the whole stick figure lying on its
  // back, head solid (the outline clip is removed on this frame).
  function flat(ctx, color) {
    strokeLine(ctx, [0, -5, -0.5, 11.2], INK, 1.5);
    strokeLine(ctx, [11.2, 3.25, -0.5, -1.3, -9.7, 4.9], INK, 1.5);
    strokeLine(ctx, [6.6, 19.5, -0.5, 11.2, -5.5, 24.1], INK, 1.5);
    head(ctx, 0.5, -14.5, 9.4, color, 0);
  }

  // Falling off the edge (frames 185..229): the figure tips up out of the ground, flails and
  // drops away into the sky, shrinking to nothing by frame 213 (the head is solid again).
  var FALL_Y = [0, -4.5, -9, -13, -17, -21, -25, -28.5, -32, -35, -39, -43, -47, -49, -50.5, -51, -50.5, -50,
    -49, -48, -47, -46, -45.5, -45, -44.5, -43, -42, -41];
  var FALL_S = [1, 1, 0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.79, 0.76, 0.73, 0.71, 0.66,
    0.6, 0.55, 0.5, 0.45, 0.4, 0.33, 0.26, 0.2, 0.14, 0.09, 0.05];
  function falling(ctx, color, k) {
    if (k >= FALL_Y.length) return;
    ctx.save();
    ctx.translate(0, FALL_Y[k]);
    var s = FALL_S[k];
    ctx.scale(s, s);
    if (k < 3) {
      // still the top view, arms thrown out
      strokeLine(ctx, [-9.4, -1, -14, 0, -14, 4], ARM, 1.1);
      strokeLine(ctx, [9, -2, 13.4, -5, 14, -9], INK, 1.1);
      head(ctx, 0, 0, HEAD_R, color, 0);
    } else {
      // seen from the side now: body, flailing arms and legs, head on top
      var u = Math.min(1, (k - 3) / 6); // body grows out from under the head
      var fl = Math.sin(k * 1.3);
      var neck = 9, hip = 9 + 13 * u, foot = hip + 11 * u;
      strokeLine(ctx, [0, neck, 0, hip], INK, 1.4);
      strokeLine(ctx, [0, hip, -5 + fl * 2, foot], INK, 1.4);
      strokeLine(ctx, [0, hip, 5 - fl * 2, foot - fl], INK, 1.4);
      strokeLine(ctx, [0, neck + 3, -8, neck - 4 + fl * 5], INK, 1.4);
      strokeLine(ctx, [0, neck + 3, 8, neck - 6 - fl * 4], INK, 1.4);
      head(ctx, 0, 0, HEAD_R * (0.95 - 0.1 * u), color, 0);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // cars

  // The car picture: a small yellow hatchback seen from above, nose up. Drawn once into a canvas at
  // twice the size, then recoloured like the original's Color.setTransform on the traffic.
  var CAR_W = 64, CAR_H = 100, CAR_OX = 32, CAR_OY = 66; // canvas box in car coords (origin = clip origin)
  var carCache = {};

  function drawCarArt(ctx, sports) {
    var body = sports ? '#dd0000' : null;
    var edge = sports ? '#660000' : '#806600';
    // side mirrors
    poly(ctx, [-22, -41, -29.4, -37, -28.5, -34.5, -22, -35], sports ? '#cc0000' : '#e6c000', edge, 0.6);
    poly(ctx, [21, -41, 27.4, -37, 26.5, -34.5, 21, -35], sports ? '#cc0000' : '#e6c000', edge, 0.6);
    // body shell
    ctx.beginPath();
    ctx.moveTo(-22.8, -44);
    ctx.bezierCurveTo(-24.5, -58, -12, -63.7, -1, -63.7);
    ctx.bezierCurveTo(10, -63.7, 22.5, -58, 21.5, -44);
    ctx.lineTo(21.8, 20);
    ctx.quadraticCurveTo(21.5, 29.6, 12, 30);
    ctx.lineTo(-13.5, 30);
    ctx.quadraticCurveTo(-22.8, 29.6, -22.8, 20);
    ctx.closePath();
    var g;
    if (sports) {
      g = body;
    } else {
      g = ctx.createRadialGradient(-8, -10, 2, -2, -8, 44);
      g.addColorStop(0, '#ffff00');
      g.addColorStop(0.55, '#f2d200');
      g.addColorStop(1, '#c79a00');
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // side windows (dark strips down the flanks)
    var sw = ctx.createLinearGradient(-23, 0, -18, 0);
    sw.addColorStop(0, '#111');
    sw.addColorStop(1, '#666');
    poly(ctx, [-22.2, -38, -18.8, -30, -19.5, 12, -21.6, 18], sw);
    sw = ctx.createLinearGradient(21, 0, 16, 0);
    sw.addColorStop(0, '#111');
    sw.addColorStop(1, '#666');
    poly(ctx, [21.2, -38, 17.8, -30, 18.5, 12, 20.6, 18], sw);
    // windscreen with a diagonal highlight
    ctx.beginPath();
    ctx.moveTo(-21.5, -43);
    ctx.quadraticCurveTo(-1, -52, 20.5, -43);
    ctx.lineTo(17.2, -21);
    ctx.quadraticCurveTo(-1, -23, -19.2, -21);
    ctx.closePath();
    g = ctx.createLinearGradient(-20, -46, 18, -20);
    g.addColorStop(0, '#0d0d0d');
    g.addColorStop(0.4, '#5a5a5a');
    g.addColorStop(0.52, '#bdbdbd');
    g.addColorStop(0.65, '#707070');
    g.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = edge;
    ctx.stroke();
    if (sports) {
      // open top: seats, dash and the driver (always the default blue head)
      poly(ctx, [-18, -21, 16, -21, 16, 19, -18, 19], '#999999', '#333', 0.6);
      poly(ctx, [-18, -15, 16, -15, 16, 0, -18, 0], '#000000');
      strokeLine(ctx, [-1, 0, -1, 19], '#000', 1.4);
      strokeLine(ctx, [-11, -9, -12, -18], '#000', 1.3);
      strokeLine(ctx, [-3, -9, -2, -18], '#000', 1.3);
      head(ctx, -7.5, -4.5, 8.2, NPC_BLUE, 1.2);
    } else {
      // roof: already the body gradient; a soft edge where it meets the windows
      ctx.beginPath();
      ctx.moveTo(-19.5, -21);
      ctx.quadraticCurveTo(-1, -23, 17.5, -21);
      ctx.lineTo(18, 13.5);
      ctx.quadraticCurveTo(-1, 12, -19.5, 13.5);
      ctx.closePath();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(128,102,0,0.8)';
      ctx.stroke();
    }
    // rear window
    ctx.beginPath();
    ctx.moveTo(-19.8, 13.5);
    ctx.quadraticCurveTo(-1, 12, 18.3, 13.5);
    ctx.lineTo(17.8, 25);
    ctx.quadraticCurveTo(-1, 27.5, -19.5, 25);
    ctx.closePath();
    g = ctx.createLinearGradient(-18, 12, 16, 27);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.45, '#262626');
    g.addColorStop(0.6, '#9a9a9a');
    g.addColorStop(0.75, '#333333');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // lights and plates
    var head_ = sports ? '#6666ff' : '#ffffff';
    var tail = sports ? '#6666ff' : '#990000';
    poly(ctx, [-19.5, -58.5, -15.5, -60.5, -14.5, -58.2], head_, '#333', 0.4);
    poly(ctx, [17.5, -58.5, 13.5, -60.5, 12.5, -58.2], head_, '#333', 0.4);
    oval(ctx, -16.5, 27.3, 3.3, 1.7, tail);
    oval(ctx, 14.5, 27.3, 3.3, 1.7, tail);
    oval(ctx, -1, -60.6, 2.4, 0.9, sports ? '#ffe680' : '#cccccc', '#333');
    oval(ctx, -1, 28.7, 2.4, 0.9, sports ? '#ffe680' : '#cccccc', '#333');
  }

  // Colour transform in percent, as Flash applies it: channel = channel * mult / 100 (capped).
  function carCanvas(sports, tint) {
    var key = (sports ? 's' : 'c') + (tint ? '|' + tint.r + '|' + tint.g + '|' + tint.b : '');
    var c = carCache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = CAR_W * 2;
    c.height = CAR_H * 2;
    var x = c.getContext('2d');
    x.scale(2, 2);
    x.translate(CAR_OX, CAR_OY);
    drawCarArt(x, sports);
    if (tint) {
      try {
        var img = x.getImageData(0, 0, c.width, c.height);
        var d = img.data;
        for (var i = 0; i < d.length; i += 4) {
          d[i] = Math.min(255, (d[i] * tint.r) / 100);
          d[i + 1] = Math.min(255, (d[i + 1] * tint.g) / 100);
          d[i + 2] = Math.min(255, (d[i + 2] * tint.b) / 100);
        }
        x.putImageData(img, 0, 0);
      } catch (e) { /* a tainted canvas can't be recoloured; keep yellow */ }
    }
    carCache[key] = c;
    return c;
  }

  // Map an old-style CSS colour to a colour transform that turns the yellow car that colour.
  function tintFromColor(col) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(col || '');
    if (!m) return null;
    return { r: Math.round(parseInt(m[1], 16) / 2.55), g: Math.round(parseInt(m[2], 16) / 2.55), b: 150 };
  }

  // A traffic car leaving the road plays its 33-frame clip: it rolls on 40 px past the edge while
  // shrinking away into the sky, gone from frame 26 (frame 1 = the car on the road).
  var CARFALL_Y = [17, 17, 11, 5.5, 0.5, -4, -8, -11.5, -14.5, -17, -19, -20.5, -21.5, -22, -23, -23, -23, -23, -23,
    -23, -23, -23, -23, -23, -23, -23];
  var CARFALL_S = [1, 1, 1, 0.99, 0.98, 0.97, 0.95, 0.93, 0.91, 0.88, 0.85, 0.82, 0.78, 0.74, 0.7, 0.65, 0.6,
    0.55, 0.49, 0.43, 0.37, 0.3, 0.23, 0.16, 0.09, 0.02];

  // ---------------------------------------------------------------------------------------------
  // the player's animation state (which clip section is playing and since when)

  var pst = { key: '', since: 0, last: -10 };
  function sectionTicks(key) {
    var t = now();
    // not drawn for a while (inside a building, a new game): the clip starts over, as the
    // original's root frame 2 restarts the person clip at frame 20 on every return to the map
    if (t - pst.last > 12 || t < pst.last) pst.key = '';
    pst.last = t;
    if (pst.key !== key) {
      pst.key = key;
      pst.since = t;
    }
    return t - pst.since;
  }

  var sprites = (SRPG.sprites = {
    // opts: { rot (deg, 0 = up), color, phase (walk cycle; null = standing), mode: 'walk' | 'skate' |
    //         'car' | 'sportscar', anim: null | 'fall' | 'hit' | 'crash' | 'wake', t: anim progress 0..1 }
    player: function (ctx, x, y, o) {
      o = o || {};
      var color = o.color || NPC_BLUE;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((o.rot || 0) * Math.PI) / 180);
      var k = Math.max(0, Math.min(39, Math.floor((o.t || 0) * 40)));
      var driving = o.mode === 'car' || o.mode === 'sportscar';
      if (o.anim === 'fall') {
        sectionTicks('fall');
        falling(ctx, color, k);
      } else if (o.anim === 'hit' || o.anim === 'wake') {
        sectionTicks(o.anim);
        flat(ctx, color);
      } else if (driving) {
        // frame 327 (and the crash, 361-400, which shows the same car standing still)
        sectionTicks('car');
        ctx.drawImage(carCanvas(o.mode === 'sportscar', null), 0.2 - CAR_OX, 12.5 - CAR_OY, CAR_W, CAR_H);
      } else if (o.phase != null) {
        var i = sectionTicks(o.mode === 'skate' ? 'skate' : 'walk');
        if (o.mode === 'skate') skating(ctx, color, i % SKATE_FRAMES);
        else walking(ctx, color, i % WALK_FRAMES);
      } else {
        sectionTicks('idle');
        standing(ctx, color);
      }
      ctx.restore();
    },

    // Street people seen from above. opts: { color, rot, phase, kind: 'smokes' | 'hobo' | 'dealer' }
    npc: function (ctx, x, y, o) {
      o = o || {};
      var f = now();
      ctx.save();
      ctx.translate(x, y);
      if (o.kind === 'hobo') {
        // Homeless Harold sits against Sticky's wall, legs out toward the sidewalk; now and then
        // he lifts his bottle and drinks for a while.
        ctx.rotate(0.087);
        hobo(ctx, o.color || '#ff9900', f);
      } else if (o.kind === 'smokes') {
        // the smokes kid idles with a hand on his hip (drawn at 85%, as placed on the map)
        ctx.scale(0.85, 0.85);
        kid(ctx, o.color || '#33ccff', f);
      } else {
        ctx.rotate(((o.rot || 0) * Math.PI) / 180);
        if (o.phase != null && o.phase !== 0) walking(ctx, o.color || '#990000', Math.floor(o.phase) % WALK_FRAMES);
        else dealerStand(ctx, o.color || '#990000', f);
      }
      ctx.restore();
    },

    // Car seen from above, nose up at rot 0. opts: { rot, tint: { r, g, b } (percent colour transform,
    // as the original's traffic), color (older callers), parked, sports, fall: frames since it left
    // the road (the edge-fall clip), local }
    car: function (ctx, x, y, o) {
      o = o || {};
      var tint = o.tint || (o.color && !o.parked ? tintFromColor(o.color) : null);
      var rot = o.parked ? 90 : o.rot || 0; // the car on the apartment lawn faces east
      var fall = o.fall || 0;
      if (fall >= CARFALL_S.length) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rot * Math.PI) / 180);
      var dy = o.parked ? 16.75 : CARFALL_Y[fall];
      var s = CARFALL_S[fall];
      ctx.translate(0.9, dy);
      ctx.scale(s, s);
      ctx.drawImage(carCanvas(!!o.sports, tint), -CAR_OX, -CAR_OY, CAR_W, CAR_H);
      ctx.restore();
    },

    // exposed for tests
    hoboFrame: hoboFrame,
    WALK_FRAMES: WALK_FRAMES,
    SKATE_FRAMES: SKATE_FRAMES,
    carCanvas: carCanvas,
    CARFALL_FRAMES: CARFALL_S.length,
    FALL_VISIBLE: FALL_Y.length,
  });

  // Homeless Harold's 165-frame clip, run tick by tick with its own frame scripts: at frame 45 he
  // goes back to frame 1 unless random(5) == 0 (then 46-140 he lifts the bottle and drinks); at 140
  // he drinks again from 71 unless random(5) == 0; at 165 back to 1. Precomputed once with a
  // private seeded generator (so drawing never touches the game's random numbers) and looped where
  // the clip is back at frame 1.
  var HOBO = (function () {
    var seq = [], n = 1, a = 20051;
    function rnd5() { a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff; return (a >> 16) % 5; }
    while (seq.length < 7000 || n !== 1) {
      seq.push(n);
      n++;
      if (n === 45 && rnd5() !== 0) n = 1;
      else if (n === 140 && rnd5() !== 0) n = 71;
      else if (n === 165) n = 1;
    }
    return seq;
  })();
  function hoboFrame(f) { return HOBO[((f % HOBO.length) + HOBO.length) % HOBO.length]; }

  // Homeless Harold (orange head), sitting; `f` = engine frame.
  function hobo(ctx, color, f) {
    var k = hoboFrame(f) - 1;
    var lift = 0;
    if (k > 45) lift = k < 71 ? (k - 45) / 26 : k < 140 ? 1 : Math.max(0, 1 - (k - 140) / 25);
    strokeLine(ctx, [3, -8, 10, -16, 19, -7], ARM, 1.1); // knees up
    strokeLine(ctx, [7, -5.5, 12.5, -7, 21, -4], ARM, 1.1);
    strokeLine(ctx, [7, 6, 12, 7.5, 20, 6.5], ARM, 1.1); // arm resting on the knee
    var hx = 10 - lift * 10, hy = 11 - lift * 11;
    strokeLine(ctx, [-1, 9, 6, 15 - lift * 4, hx, hy], ARM, 1.1);
    if (lift > 0.2) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(-0.6);
      ctx.fillStyle = '#336600';
      ctx.fillRect(-1.5, -6, 3, 7);
      ctx.restore();
    }
    head(ctx, 0, 0, 9, color, 1.3);
  }
  // The smokes kid (light blue), standing with a hand on his hip, shifting a little now and then.
  function kid(ctx, color, f) {
    var k = f % 130;
    var shift = k > 65 && k < 92 ? Math.sin(((k - 65) / 27) * Math.PI) * 1.5 : 0;
    strokeLine(ctx, [8.1, -3.75, 13.75, -3.1 - shift, 16, 0.25 - shift], ARM, 1.2);
    strokeLine(ctx, [-7.75, 4.1, -10.6, 8.1 + shift, -8.75, 11.9 + shift], ARM, 1.2);
    head(ctx, 0, 0, 9.4, color, 1.3);
  }
  // The dealer (red) standing between walks: arms in front, shifting his weight.
  function dealerStand(ctx, color, f) {
    var w = Math.sin(f / 9) * 1.5;
    strokeLine(ctx, [-6.5, -7, -7.5, -13 + w], ARM, 1.2);
    strokeLine(ctx, [6, 7, 7, 13, 3, 18 + w], ARM, 1.2);
    head(ctx, 0, 0, 9, color, 1.3);
  }
})();
