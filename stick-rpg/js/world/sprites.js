// Top-down sprites for the city map: the player (standing, walking, skating, driving, falling off
// the edge, knocked flat), the street people and the cars. Positions are stage coordinates of the
// sprite's registration point (the original's clip origin), rotations in degrees (0 = heading up).
//
// The player's look follows the original's 400-frame "person" clip: 20-116 standing (twice a
// cycle a stretch, 104-113), after three cycles 120-180 falling asleep with a rising "Z",
// 185-229 falling into the sky, 230-270 knocked flat by a car (231 on waking up), 275-302 walking,
// 305-326 skateboarding, 327 in the car, 361-400 the car crash. The clip is rotated to the
// walking direction as a whole, so a fall off the south edge drops "down" the screen.
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

  // ---------------------------------------------------------------------------------------------
  // the standing / sleeping timeline (frames 20..180 of the person clip), precomputed tick by tick
  // with the clip's own frame scripts: 84 count2 = 0; 115 count2++ and back to 85 until it is 2;
  // 116 back to 21 and count++, on the third time on to 120; 180 back to 132.

  var IDLE = (function () {
    var seq = [];
    var f = 20, count = 0, count2 = 0;
    while (seq.length < 600) {
      seq.push(f);
      var next = f + 1;
      if (next === 84) count2 = 0;
      if (next === 115) {
        seq.push(115);
        count2++;
        next = count2 < 2 ? 85 : 116;
      }
      if (next === 116) {
        seq.push(116);
        count++;
        next = count === 3 ? 120 : 21;
      }
      if (next === 181) next = 132;
      f = next;
    }
    return seq;
  })();
  function idleFrame(ticks) {
    if (ticks < IDLE.length) return IDLE[ticks];
    // after the first pass the clip loops 132..180 for ever
    var start = IDLE.indexOf(132);
    return 132 + ((ticks - start) % 49);
  }

  // Standing, seen from above: head with the elbows out and forearms forward.
  function standing(ctx, color, f) {
    var stretch = f >= 104 && f <= 113 ? f - 104 : -1;
    if (stretch < 0) {
      strokeLine(ctx, [-9.4, -1.4, -13, -3.9, -13, -8.4], ARM, 1.1);
      strokeLine(ctx, [9, -1, 13.4, -3.6, 13.4, -7.6], INK, 1.1);
      head(ctx, -0.4, -0.6, HEAD_R, color, 1.3);
      return;
    }
    // the stretch: arms out, a big yawn (head tipped back), arms folded in again
    var poses = [
      [-9.5, -2, -14, 0, -17, -5, 9, -1, 14, -4, 17, -8],
      [-9.5, -1, -15, 1, -19, -1, 9.5, -1, 15, -3, 18, -5],
      [-9.5, 0, -15, 2, -19, 1, 9.5, 0, 15, -2, 19, -3],
      [-9.5, 0, -15, 1, -18, -2, 9.5, 0, 15, -1, 18, -4],
      [-9.5, 1, -15, 0, -10, -3, 9.5, 1, 15, 0, 10, -3],
      [-9.5, 1, -14, -1, -9, -5, 9.5, 1, 14, -1, 9, -5],
      [-9.5, 0, -12, -4, -9, -8, 9.5, 0, 12, -4, 9, -8],
      [-9.5, -1, -13, -4, -11, -8, 9, -1, 13, -4, 12, -8],
    ];
    var p = poses[Math.min(poses.length - 1, stretch)];
    strokeLine(ctx, p.slice(0, 6), ARM, 1.1);
    strokeLine(ctx, p.slice(6), INK, 1.1);
    head(ctx, -0.4, -0.6, HEAD_R + (stretch >= 2 && stretch <= 4 ? 0.6 : 0), color, stretch >= 2 && stretch <= 4 ? 2.2 : 1.3);
  }

  // Asleep on the ground (frames 132..180): a body lying with bent knees, the head beside it and a
  // "Z" floating up and fading (a 60-frame loop).
  function sleeping(ctx, color, f) {
    strokeLine(ctx, [-22.4, 14.2, -17.2, 11.2, -10, 18.8, -5, 4.4, 3.4, -1.2, 9.4, -6.4], INK, 1.3);
    strokeLine(ctx, [3.4, -1.2, 11, -3.4], INK, 1.3);
    head(ctx, 28.8, -19.5, HEAD_R, color, 1.3);
    var z = ((f - 132) % 60 + 60) % 60;
    var a = z < 40 ? 1 : 1 - (z - 40) / 20;
    ctx.save();
    ctx.globalAlpha = Math.max(0, a) * 0.9;
    ctx.font = (6 + z * 0.08).toFixed(1) + 'px "Times New Roman", Times, serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', 12.4 + z * 0.12, -30.4 - z * 0.25);
    ctx.restore();
  }

  // Walking (28 frames): legs stride forward/back under the head, arms swing opposite.
  function walking(ctx, color, i) {
    var t = (i / 28) * Math.PI * 2;
    var s = Math.sin(t);
    leg(ctx, -3.5, s);
    leg(ctx, 2.5, -s);
    arm(ctx, -1, -s);
    arm(ctx, 1, s);
    head(ctx, -0.4, -0.6, HEAD_R, color, 1.3);
  }
  function leg(ctx, x, s) {
    if (Math.abs(s) < 0.12) return;
    var l = 8.5 * Math.abs(s);
    if (s > 0) strokeLine(ctx, [x, -8, x + 0.8, -8 - l], LEG, 1.3);
    else strokeLine(ctx, [x, 8, x - 0.8, 8 + l], LEG, 1.3);
  }
  // side = -1 left, 1 right; a = -1 (back) .. 1 (forward)
  function arm(ctx, side, a) {
    var sx = side * 9.4, ex = side * 13.2;
    var ang = a * 1.05; // forearm angle from straight ahead
    var hx = ex + side * Math.sin(Math.max(0, -ang)) * 4 + side * Math.sin(Math.max(0, ang)) * -1.5;
    var hy = -3 - 6.5 * Math.cos(ang);
    if (a < -0.5) hy = -3 + 5 * (-a - 0.5) * 2;
    strokeLine(ctx, [sx, -1, ex, -3 - a * 1.5, hx, hy], side < 0 ? ARM : INK, 1.1);
  }

  // Skateboarding (22 frames): on the board, one arm up and forward, the other down and out.
  function skating(ctx, color, i) {
    var w = Math.sin((i / 22) * Math.PI * 2);
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
    //         'car' | 'sportscar', anim: null | 'fall' | 'hit' | 'crash' | 'wake', t: anim progress 0..1,
    //         idle: ticks standing still (optional; otherwise counted here from engine frames) }
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
        if (o.mode === 'skate') skating(ctx, color, i % 22);
        else walking(ctx, color, i % 28);
      } else {
        var idle = o.idle != null ? o.idle : sectionTicks('idle');
        var f = idleFrame(idle);
        if (f >= 132) sleeping(ctx, color, f);
        else standing(ctx, color, f);
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
        // he lifts his bottle (the original's 165-frame loop with random repeats).
        ctx.rotate(0.087);
        hobo(ctx, o.color || '#ff9900', f);
      } else if (o.kind === 'smokes') {
        // the smokes kid idles with a hand on his hip (drawn at 85%, as placed on the map)
        ctx.scale(0.85, 0.85);
        kid(ctx, o.color || '#33ccff', f);
      } else {
        ctx.rotate(((o.rot || 0) * Math.PI) / 180);
        if (o.phase != null && o.phase !== 0) walking(ctx, o.color || '#990000', Math.floor(o.phase) % 28);
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
    idleFrame: idleFrame,
    carCanvas: carCanvas,
    CARFALL_FRAMES: CARFALL_S.length,
    FALL_VISIBLE: FALL_Y.length,
  });

  // Homeless Harold (orange head), sitting; `f` = engine frame.
  function hobo(ctx, color, f) {
    // 1-45 sitting, then (one time in five) 46-140 raising the bottle and drinking, 141-165 lowering
    var cyc = Math.floor(f / 165);
    var drinks = ((cyc * 2654435761) >>> 0) % 5 === 0;
    var k = f % 165;
    var lift = 0;
    if (drinks && k > 45) lift = k < 71 ? (k - 45) / 26 : k < 140 ? 1 : Math.max(0, 1 - (k - 140) / 25);
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
