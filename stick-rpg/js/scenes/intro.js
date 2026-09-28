// The opening film ('intro', the original's sprite 199: 850 frames at 35 fps) with SKIP.
// Frame by frame as in the original, drawn in our own art:
//   2..400    the camera pulls out of your sleeping stick figure's head (seen from above), turning
//             a quarter turn as it zooms from 20x down to 0.5x; a slow breath every ~100 frames
//   478..628  a grey "?" floats beside the head
//   672..699  the figure unfolds, stands up with its arms raised, then recedes upright into the
//             distance until it is a dot (the shift)
//   727       a black blink
//   761..766  a big figure drops through the screen into the 2nd Dimension
//   796       a car horn/crash and black; 850 the city fades in with you lying on the road
// SKIP jumps to frame 795. The story itself is told on the INSTRUCTIONS pages, not here.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var fx = SRPG.titleFx;

  var END = 850;
  var SKIP_TO = 795;
  var FX = 255.35, FY = 188; // where the film clip sits on the stage
  var BREATHS = [2, 100, 200, 300, 401, 500, 600];

  // blackHold: the root black clip was stopped on its first (fully black) frame at 796.
  var st = { f: 2, blackHold: false, skip: null, done: false };

  // ---- sound: the sleeper's slow breath (a ~2 s snore, starting 0.175 s after the frame) ------
  function breath() {
    SRPG.sound.play('breath');
  }


  // ---- art ---------------------------------------------------------------------------------
  // The sleeper seen from above: head (r 18.5) and two arms poking out sideways. Drawn in the
  // film's own units so the outline thickens as the camera zooms in, like the original.
  function topDown(ctx) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(1.25, 1, 18.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0066cc';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000';
    ctx.stroke();
    SRPG.draw.line(ctx, -17.4, 1.3, -27.4, -0.8, '#000', 1);
    SRPG.draw.line(ctx, 19.7, 0.7, 28.1, -1.7, '#333', 1);
  }

  // The shift (frames 672..699): the figure unfolds, stands up with its arms raised and then
  // recedes, staying upright and shrinking to a dot. Each frame is its own drawing in the original;
  // these are simplified poses of our own (a head circle plus polylines, film units).
  var SHIFT_POSES = {
    // seen from above, limbs folded in: four stubs round the head
    folded: { head: [1.25, 0.6, 9.4], lines: [[-13.1, 0.6, -8.1, 0.6], [10.6, -1.25, 13.5, -1.25, 13.5, -6.9],
      [2.75, 9.5, 2.75, 11.5], [-3.1, -8.75, -3.1, -11.9]] },
    // unfolding: one arm hooked out to the left, one stub to the right, a leg swinging down
    rise: { head: [0.9, -4.1, 9.1], lines: [[-8.1, -1.9, -13.1, -1.9, -13.1, 3.1], [9.5, -4.5, 13.5, -5.5, 13.8, -8],
      [3.1, 5, 5.6, 13.75]] },
    // standing, both arms thrown up in a V
    armsUp: { head: [-0.3, -8.5, 8.4], lines: [[-0.6, -0.1, -0.6, 6.25], [-7.6, -6.2, -12.5, -11], [7.4, -6.2, 12.9, -12.75],
      [-0.6, 6.25, -7.5, 14.4], [-0.6, 6.25, 4.75, 17.25]] },
    // standing, arms in one slanted line across the chest
    stand: { head: [0.6, -10.9, 7.5], lines: [[0.25, -3.4, 0.25, 8.5], [-8.75, 3.75, 8.75, -4.1],
      [0.25, 8.5, -5.6, 16.25], [0.25, 8.5, 4.75, 18.1]] },
    // smaller and further away, one arm up, one knee bent
    walk: { head: [0.9, -9.1, 5.3], lines: [[0.5, -3.8, 0.6, 5.6], [0.4, -2.5, -5.6, -6], [0.5, -1.8, 3.75, 5],
      [0.6, 5.6, -1, 7.5, -4.6, 9.4], [0.6, 5.6, 2.75, 14.4]] },
  };
  // Which pose each frame 672..699 shows.
  var SHIFT_SEQ = ['folded', 'folded', 'rise', 'rise', 'rise', 'rise', 'armsUp', 'armsUp', 'armsUp', 'armsUp', 'armsUp',
    'armsUp', 'stand', 'stand', 'stand', 'stand', 'stand', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk',
    'walk', 'walk', 'walk'];
  // The figure's extent on each frame 672..699 (film units: left, top, right, bottom), from the
  // original's timeline: it rises and grows to ~38 tall by 686, then shrinks away to a dot.
  var SHIFT_BOX = [[-15.9, -13.1, 11.85, 11.1], [-15.9, -14.2, 11.85, 11.1], [-15.9, -18.2, 11.85, 7.1],
    [-15.9, -22.2, 11.85, 5.6], [-15.75, -26.05, 11.75, 1.5], [-15.65, -29.9, 13.05, -0.7], [-15.5, -33.75, 13.4, -2.85],
    [-16.15, -37.3, 13.45, -3.25], [-13.95, -40.9, 11.7, -5.65], [-12.35, -44.4, 9.6, -7.15], [-9.9, -47.8, 8.2, -11.75],
    [-12.55, -51.05, 6.7, -14.5], [-10.95, -54.25, 6.5, -17.35], [-11.15, -57.15, 6.65, -20.4], [-10.6, -59.7, 6.65, -21.75],
    [-8.15, -58.15, 6.55, -19.35], [-8.3, -57.65, 6.5, -24.8], [-8.95, -56.65, 4.25, -27], [-9.05, -54.6, 3.55, -25.25],
    [-8.2, -53.75, 2.95, -28.85], [-7.2, -52.1, 2.5, -29.85], [-5.3, -50.3, 3.55, -30.65], [-4.05, -48.85, 3.2, -32.3],
    [-3.1, -47.65, 3.25, -34.3], [-3.35, -47.3, 1.75, -36.25], [-3.6, -45.25, 0.55, -36.85], [-3.9, -45.2, -0.6, -38.95],
    [-3.45, -42.75, -1.5, -39.25]];

  function poseBox(p) {
    var b = [p.head[0] - p.head[2], p.head[1] - p.head[2], p.head[0] + p.head[2], p.head[1] + p.head[2]];
    p.lines.forEach(function (l) {
      for (var i = 0; i < l.length; i += 2) {
        b[0] = Math.min(b[0], l[i]); b[2] = Math.max(b[2], l[i]);
        b[1] = Math.min(b[1], l[i + 1]); b[3] = Math.max(b[3], l[i + 1]);
      }
    });
    return b;
  }

  // Draw a pose scaled so its height fills box (film units); strokes stay 1 px on screen.
  function drawPoseInBox(ctx, p, box) {
    var pb = poseBox(p);
    var sc = (box[3] - box[1]) / (pb[3] - pb[1]);
    ctx.save();
    ctx.translate(FX + (box[0] + box[2]) / 2, FY + (box[1] + box[3]) / 2);
    ctx.scale(sc, sc);
    ctx.translate(-(pb[0] + pb[2]) / 2, -(pb[1] + pb[3]) / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1 / sc;
    ctx.beginPath();
    p.lines.forEach(function (l) {
      ctx.moveTo(l[0], l[1]);
      for (var i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
    });
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.head[0], p.head[1], p.head[2], 0, Math.PI * 2);
    ctx.fillStyle = '#0066cc';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawShift(ctx, f) {
    var k = f - 672;
    drawPoseInBox(ctx, SHIFT_POSES[SHIFT_SEQ[k]], SHIFT_BOX[k]);
  }

  // The big figure dropping through the frame (761..766), lying flat with its head on the left
  // (stage x 236), 80 px lower each frame, limbs flung about differently each frame. Offsets are
  // from the head centre: the body runs to the hips at +89.5, arms fork at +45.5.
  var DROP_LIMBS = [
    [[30, -40], [60, 38], [130, -38], [150, 25]],
    [[69, -31.5], [43, 39.5], [133, -28], [133, 38]],
    [[19.5, -44.5], [85, 30], [99.5, -60], [139, -32.5]],
    [[46.5, -48.5], [65, 43.5], [123.5, -42.5], [147, 17]],
    [[69, -43], [51, 45], [141.5, -29.5], [145, 40]],
    [[60, -45], [35, 40], [128, -40], [146, 30]],
  ];
  // two specks of debris falling past on the first frames (761, 762)
  var DROP_SPECKS = [[251.5, 147.5], [252, 387.5]];
  function drawDrop(ctx, f) {
    var k = f - 761;
    var hx = 236.3, hy = 40.4 + k * 80;
    var L = DROP_LIMBS[k];
    ctx.save();
    ctx.translate(hx, hy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(31, 0);
    ctx.lineTo(89.5, 0);
    ctx.moveTo(45.5, 0); ctx.lineTo(L[0][0], L[0][1]);
    ctx.moveTo(45.5, 0); ctx.lineTo(L[1][0], L[1][1]);
    ctx.moveTo(89.5, 0); ctx.lineTo(L[2][0], L[2][1]);
    ctx.moveTo(89.5, 0); ctx.lineTo(L[3][0], L[3][1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 31, 0, Math.PI * 2);
    ctx.fillStyle = '#0066cc';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (DROP_SPECKS[k]) SRPG.draw.rect(ctx, DROP_SPECKS[k][0] - 1, DROP_SPECKS[k][1] - 1, 2, 2, '#333333');
  }

  // ---- scene ---------------------------------------------------------------------------------
  function finish() {
    if (st.done) return;
    st.done = true;
    // Root frame 2 on day 0: you start the game lying on the road, just hit (person frames
    // 231..270), and the black clip fades the city in.
    SRPG.engine.go('city', { fade: 19 }); // black.gotoAndPlay(11): a 19-frame fade in
  }

  function gotoFrame(f) {
    st.f = f;
    frameActions(f);
  }

  // Actions attached to film frames (sprite 199). The fades are the root black clip's.
  function frameActions(f) {
    if (BREATHS.indexOf(f) >= 0) breath();
    if (f === 727) { SRPG.engine.blackPlay(1); st.blackHold = false; } // black.gotoAndPlay(1)
    if (f === 796) {
      SRPG.sound.play('carhit');
      SRPG.engine.blackPlay(1); // black.gotoAndStop(1): stays black
      st.blackHold = true;
    }
    if (f >= END) finish();
  }

  var scene = {
    st: st,
    enter: function () {
      st.f = 2;
      st.done = false;
      // DONE on CREATE CHARACTER: the title music stops and black fades out over 19 frames
      // (black.gotoAndPlay(11)).
      SRPG.engine.blackPlay(11);
      st.blackHold = false;
      SRPG.sound.setVolume(100); // LoopB/C/D.setVolume(100): full volume again
      SRPG.sound.stopAll(); // loopA.stop(): every sound stops
      st.skip = fx.hotspot('skip', 496, 373, 48, 21, function () { gotoFrame(SKIP_TO); });
      frameActions(2);
    },
    exit: function () {},
    tick: function () {
      if (st.done) return;
      // stopped on frame 1: undo the engine's step of the clip
      if (st.blackHold) SRPG.engine.blackPlay(1);
      st.f += 1;
      frameActions(st.f);
    },
    render: function (ctx) {
      var f = st.f;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SRPG.W, SRPG.H);
      if (f <= 671) {
        // camera: 20x and turned -90 degrees at frame 2, 0.5x upright from frame 400
        var t = Math.min(1, (f - 2) / 398);
        var sc = 20 - 19.5 * t;
        var rot = (-90 + 90 * t) * Math.PI / 180;
        ctx.save();
        ctx.translate(FX - 0.2, FY + 1.8);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        topDown(ctx);
        ctx.restore();
        if (f >= 478 && f <= 628) {
          SRPG.draw.line(ctx, 268.8, 176.3, 275.3, 167.8, '#999999', 1);
          fx.text(ctx, '?', 278, 164.8, { face: 'impact', size: 20, color: '#999999' });
        }
      } else if (f <= 699) {
        drawShift(ctx, f);
      } else if (f >= 761 && f <= 766) {
        drawDrop(ctx, f);
      }
      // SKIP
      fx.text(ctx, 'SKIP', 503.2, 389, { size: 14, color: '#000000', width: 36 });
      SRPG.engine.drawBlack();
    },
    // tests
    gotoFrame: gotoFrame,
    finish: finish,
  };

  SRPG.intro = scene;
  SRPG.registerScreen('intro', scene);
})();
