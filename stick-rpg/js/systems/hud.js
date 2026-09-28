// The status HUD along the top of the stage, laid out like the original (root frame 2):
// the beating heart + slanted HP bar "hp/ max", the gold "$" and Impact cash figure, the 24-hour
// pie clock (blue wedge = hours used), "DAY n", and on the city map the backpack (inventory) and
// "?" (stats) buttons. Also the SHOW FPS counter (the original's fpsShower, sprite 241).
// Positions are the original's placements in stage pixels (hp_bar at 120.75,16.9 scaled 1.2, the
// cash clip at 243.25,15.7, the clock at 347.85,17.35 scaled 0.2, buttons at 477.3,21.1 / 526,52.65).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var D = SRPG.draw;

  // --- fonts ----------------------------------------------------------------------------------
  // The original embeds Arial Black and Impact. Where they are missing (e.g. Linux) we fall back to
  // a bold sans and thicken it a little so the HUD keeps its weight.
  var AB = '"Arial Black", "Arial Bold", Gadget, Arial, sans-serif';
  var IMPACT = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';
  var fontCheck = null;
  function fonts() {
    if (fontCheck) return fontCheck;
    fontCheck = { black: true, impact: true };
    try {
      var c = document.createElement('canvas').getContext('2d');
      var probe = 'WMwm0123456789$';
      c.font = '40px monospace';
      var mono = c.measureText(probe).width;
      c.font = '40px "Arial Black", monospace';
      fontCheck.black = c.measureText(probe).width !== mono;
      c.font = '40px Impact, monospace';
      fontCheck.impact = c.measureText(probe).width !== mono;
    } catch (e) { /* keep defaults */ }
    if (!fontCheck.black && document.documentElement) document.documentElement.classList.add('srpg-noblack');
    return fontCheck;
  }

  // Arial Black text on the canvas (bold fallback gets a hairline stroke in its own colour).
  function abText(ctx, str, x, y, size, color, align) {
    var f = fonts();
    ctx.font = (f.black ? '' : 'bold ') + size + 'px ' + AB;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    if (!f.black) {
      ctx.lineWidth = size * 0.07;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.strokeText(str, x, y);
    }
  }

  // Impact text (the cash figure). Without Impact: a condensed bold sans of the same height.
  function impactText(ctx, str, x, y, size, color) {
    var f = fonts();
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    if (f.impact) {
      ctx.font = size + 'px ' + IMPACT;
      ctx.fillText(str, x, y);
    } else {
      ctx.translate(x, y);
      ctx.scale(0.8, 1);
      ctx.font = 'bold ' + Math.round(size * 1.1) + 'px Arial, Helvetica, sans-serif';
      ctx.fillText(str, 0, 0);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = color;
      ctx.strokeText(str, 0, 0);
    }
    ctx.restore();
  }

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

  // --- the heart ------------------------------------------------------------------------------
  // Four states picked by the HP bar's frame (int(hp / hpmax * 100)): 75%+ glossy red, 50-74%
  // scarred, 25-49% bruised and bleeding, under 25% a rotten lump in a pool of blood. Each beats on
  // its own loop (14, 17, 20 and 31 frames), slower as you weaken.
  var HEART = [
    { min: 75, len: 14, pos: [-79.5, -1.3] },
    { min: 50, len: 17, pos: [-79, -2.3] },
    { min: 25, len: 20, pos: [-79.25, -2.65] },
    { min: -1e9, len: 31, pos: [-83.9, -1.3] },
  ];

  function heartState(pct) {
    for (var i = 0; i < HEART.length; i++) if (pct >= HEART[i].min) return i;
    return 3;
  }

  // Heartbeat scale for animation frame f (1-based) of state k, from the original's tweens.
  function beat(k, f) {
    var sx = 1, sy = 1;
    function ease(t) { return 1 - (1 - t) * (1 - t) * (1 - t); }
    if (k === 0) { // 1 -> 1.1 in two frames, eases back by frame 14
      if (f <= 3) sx = sy = 1 + 0.05 * (f - 1);
      else sx = sy = 1.1 - 0.1 * ease((f - 3) / 11);
    } else if (k === 1) { // up by frame 4, back by 17
      if (f <= 4) sx = sy = 1 + 0.1 * (f - 1) / 3;
      else sx = sy = 1.1 - 0.1 * ease((f - 4) / 13);
    } else if (k === 2) { // stretches wide (1-5), then tall (6-7), eases back by 20
      if (f <= 5) { sx = 1 + 0.025 * (f - 1); sy = 1; }
      else if (f <= 7) { sx = 1.1; sy = 1 + 0.05 * (f - 5); }
      else sx = sy = 1.1 - 0.1 * ease((f - 7) / 13);
    } else { // rests 6 frames, widens (7-15), grows (16-17), eases back by 31
      if (f <= 6) sx = sy = 1;
      else if (f <= 15) { sx = 1 + 0.1 * (f - 6) / 9; sy = 1; }
      else if (f <= 17) { sx = 1.1; sy = 1 + 0.05 * (f - 15); }
      else sx = sy = 1.1 - 0.1 * ease((f - 17) / 14);
    }
    return [sx, sy];
  }

  function heartPath(ctx, lumpy) {
    ctx.beginPath();
    if (!lumpy) {
      ctx.moveTo(0, 9.6);
      ctx.bezierCurveTo(-5, 5, -10.3, 0.5, -10.3, -4.3);
      ctx.bezierCurveTo(-10.3, -8.4, -7.3, -10, -5, -10);
      ctx.bezierCurveTo(-2.4, -10, -0.8, -8.4, 0, -6.4);
      ctx.bezierCurveTo(0.8, -8.4, 2.4, -10, 5, -10);
      ctx.bezierCurveTo(7.3, -10, 10.3, -8.4, 10.3, -4.3);
      ctx.bezierCurveTo(10.3, 0.5, 5, 5, 0, 9.6);
    } else {
      // a squashed, tilted, lumpy heart
      ctx.moveTo(1.5, 8.6);
      ctx.bezierCurveTo(-3, 7.5, -9.8, 3.5, -10.2, -1.5);
      ctx.bezierCurveTo(-10.6, -6.2, -8, -8.8, -4.6, -8.2);
      ctx.bezierCurveTo(-2.4, -7.9, -1.6, -7.2, -0.8, -6.3);
      ctx.bezierCurveTo(0.6, -9, 3.2, -10.2, 6.2, -9.2);
      ctx.bezierCurveTo(9.8, -7.9, 10.8, -3.6, 9.9, 0.2);
      ctx.bezierCurveTo(9, 4, 5.5, 8.4, 1.5, 8.6);
    }
    ctx.closePath();
  }

  // Draw the heart for HP percentage pct at (x, y) (its centre), animation tick t.
  function drawHeart(ctx, x, y, pct, t, scale) {
    var k = heartState(pct);
    var st = HEART[k];
    var f = ((t || 0) % st.len) + 1;
    var sc = beat(k, f);
    var s = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (k >= 2) {
      // pool of blood under the heart
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      if (k === 2) ctx.ellipse(-0.2, 9.8, 8.1, 2.3, 0, 0, Math.PI * 2);
      else ctx.ellipse(-0.4, 8.2, 15.3, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.scale(sc[0], sc[1]);
    if (k === 0) {
      heartPath(ctx, false);
      ctx.fillStyle = '#ff0000';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,190,200,0.75)';
      ctx.beginPath();
      ctx.arc(-5.3, -4.8, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,180,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(6.2, 0.3);
      ctx.quadraticCurveTo(5.2, 3.6, 2.6, 5.6);
      ctx.stroke();
    } else if (k === 1) {
      heartPath(ctx, false);
      ctx.fillStyle = '#d00000';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = '#ff4a4a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-9, 1.5); ctx.lineTo(-4.5, 1); ctx.lineTo(-3.5, 4.5); ctx.lineTo(0.5, 5.5);
      ctx.moveTo(-3.5, 4.5); ctx.lineTo(-5.5, 7);
      ctx.moveTo(1.5, -7); ctx.lineTo(2.5, -3); ctx.lineTo(0.2, -1.5);
      ctx.moveTo(2.5, -3); ctx.lineTo(7.5, -4.5);
      ctx.moveTo(5.5, 0); ctx.lineTo(4, 4.5);
      ctx.stroke();
      ctx.restore();
      heartPath(ctx, false);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,170,180,0.7)';
      ctx.beginPath();
      ctx.arc(-5.4, -4.6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (k === 2) {
      ctx.rotate(-0.12);
      heartPath(ctx, true);
      ctx.fillStyle = '#9c3a3a';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = '#ff3030';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-8, 3); ctx.lineTo(-3.5, 2); ctx.lineTo(-2, 6); ctx.lineTo(2, 7);
      ctx.moveTo(1, -8); ctx.lineTo(2.5, -3.5); ctx.lineTo(-0.5, -1);
      ctx.moveTo(2.5, -3.5); ctx.lineTo(8, -5);
      ctx.moveTo(6, 0); ctx.lineTo(4.5, 4.5);
      ctx.stroke();
      ctx.restore();
      heartPath(ctx, true);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = 'rgba(230,150,160,0.75)';
      ctx.beginPath();
      ctx.arc(-5.2, -3.4, 2.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(-0.08);
      ctx.beginPath();
      ctx.moveTo(-9.5, 5.5);
      ctx.bezierCurveTo(-11.5, 1, -10.5, -6, -5.5, -7.5);
      ctx.bezierCurveTo(-4, -9.5, -0.5, -9.5, 0.5, -7.5);
      ctx.bezierCurveTo(3, -9.8, 7.5, -8.5, 8.8, -4.5);
      ctx.bezierCurveTo(11.5, -1, 11, 4.5, 8.5, 6.5);
      ctx.bezierCurveTo(4, 9, -5, 9, -9.5, 5.5);
      ctx.closePath();
      ctx.fillStyle = '#6e3b2c';
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.strokeStyle = '#8f8a2e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-6, -5); ctx.quadraticCurveTo(-1, -6, 0, -2); ctx.quadraticCurveTo(1, 2, 5, 1);
      ctx.moveTo(0, -2); ctx.lineTo(4, -6);
      ctx.moveTo(5, 1); ctx.lineTo(7, 5);
      ctx.moveTo(-3, 3); ctx.lineTo(-7, 3.5);
      ctx.stroke();
      ctx.fillStyle = '#7c7a2c';
      ctx.beginPath();
      ctx.arc(-6, 1.2, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // a squirt of blood on the beat for the hurt states
    if (k === 1 && f >= 4 && f <= 8) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.ellipse(10 + (f - 4) * 1.6, -9 + (f - 4) * 1.4, 1.2, 2.2, -0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (k === 2 && f >= 3 && f <= 10) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      if (f <= 6) ctx.ellipse(7 + (f - 3) * 3, -12 + (f - 3) * 0.6, 1.8 + (f - 3) * 0.6, 1.3, -0.4, 0, Math.PI * 2);
      else ctx.ellipse(-8.3, 9.5 + (f - 7) * 1.6, 1.3, 1.6 + (f - 7) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (k === 3 && f >= 17 && f <= 21) {
      ctx.fillStyle = '#ff0000';
      var g = f - 17;
      ctx.beginPath();
      ctx.ellipse(-2 + g * 1.2, -12 - g * 0.8, 1.5 + g * 0.8, 1.4 + g * 0.3, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- the HP bar -----------------------------------------------------------------------------
  // hp_bar is a 104-frame clip: frame n shows n% HP (keyframes every 5%), so the red fill snaps
  // down to the 5% step below; under 5% only a sliver is left. HP <= 0 is death (core handles it).
  function hpPct(hp, hpmax) { return hpmax > 0 ? Math.floor((hp / hpmax) * 100) : 0; }
  function fillFrac(pct) {
    if (pct >= 100) return 1;
    if (pct < 5) return pct > 0 ? 0.02 : 0;
    return Math.floor(pct / 5) * 5 / 100;
  }

  // ox, oy, sc: where the bar clip sits (the player's: 120.75, 16.9, 1.2; the bar-fight enemy's:
  // 450.85, 17.1, 1.25). opts: { t: animation tick, textDx: fine x offset of the numbers }.
  function hpBar(ctx, hp, hpmax, ox, oy, sc, opts) {
    opts = opts || {};
    if (ox == null) { ox = 120.75; oy = 16.9; sc = 1.2; }
    var pct = hpPct(hp, hpmax);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);
    // parallelogram: top edge -59.3..67.9 at y -3.4, bottom -69.1..56.6 at y 5.9 (bar-local)
    function path() {
      ctx.beginPath();
      ctx.moveTo(-59.3, -3.4);
      ctx.lineTo(67.9, -3.4);
      ctx.lineTo(56.6, 5.9);
      ctx.lineTo(-69.1, 5.9);
      ctx.closePath();
    }
    path();
    ctx.fillStyle = '#660000';
    ctx.fill();
    var f = fillFrac(pct);
    if (f > 0) {
      ctx.save();
      path();
      ctx.clip();
      ctx.fillStyle = '#ff0000';
      // the fill is cut vertically at the same fraction of the bar's mid-line
      ctx.fillRect(-70, -4, 5.8 + 126.8 * f, 10);
      ctx.restore();
    }
    path();
    ctx.lineWidth = 0.95;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#000';
    ctx.stroke();
    // "hp/ hpmax": hp right-aligned before the slash, max after it (Arial Black 10, white)
    var dx = opts.textDx || 0;
    abText(ctx, String(Math.max(0, Math.round(hp))), -32.15 + dx, 4.62, 10, '#fff', 'right');
    abText(ctx, '/', -32.8 + dx, 4.65, 10, '#fff', 'left');
    abText(ctx, String(Math.round(hpmax)), -26.85 + dx, 4.62, 10, '#fff', 'left');
    // the heart
    var k = heartState(pct);
    var hp0 = HEART[k].pos;
    ctx.translate(hp0[0], hp0[1]);
    ctx.scale(0.83, 0.83);
    drawHeart(ctx, 0, 0, pct, opts.t == null ? SRPG.engine.frame : opts.t, 1);
    ctx.restore();
  }

  // --- cash -------------------------------------------------------------------------------------
  function dollar(ctx, x, y) {
    // the gold "$" (a shape in the original, 16 x 22 px)
    var f = fonts();
    ctx.save();
    ctx.translate(x, y);
    ctx.font = (f.impact ? '' : 'bold ') + '27px ' + IMPACT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    var g = ctx.createLinearGradient(-8, -18, 8, 2);
    g.addColorStop(0, '#ffe34d');
    g.addColorStop(0.45, '#ffcc00');
    g.addColorStop(1, '#f08c00');
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8a4b00';
    if (!f.impact) { ctx.scale(0.85, 1); }
    ctx.strokeText('$', 0, 0);
    ctx.fillStyle = g;
    ctx.fillText('$', 0, 0);
    ctx.restore();
  }

  function cash(ctx, s) {
    dollar(ctx, 226.1, 26.3);
    var str = String(Math.round(s.cash));
    impactText(ctx, str, 238.95, 23.9, 20, '#cc6600'); // the darker copy peeks out up-left
    impactText(ctx, str, 239.7, 24.9, 20, '#ffcc66');
  }

  // --- the clock ------------------------------------------------------------------------------
  // Clip 682 has one picture per hour: frame (time * 2 + 2) -> floor(time) hours of blue wedge,
  // clockwise from 12 o'clock over a 24-hour dial; at 24 (and later) the whole face turns red.
  function clock(ctx, cx, cy, time, r) {
    r = r || 14.6;
    var hrs = Math.floor(time);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineJoin = 'round';
    // the dial's back rim shows as a second ring, down and to the right
    D.circle(ctx, 0.9, 1.1, r + 0.8, null, '#111', 1);
    D.circle(ctx, 0, 0, r, hrs >= 24 ? '#cc0000' : '#e4e4e4', null);
    if (hrs < 24) {
      // bevelled bezel with notches on the upper-left of the dial
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#7d7d7d';
      ctx.beginPath();
      ctx.arc(0, 0, r, Math.PI * 0.7, Math.PI * 1.5);
      ctx.arc(0, 0, r - 3.4, Math.PI * 1.5, Math.PI * 0.7, true);
      ctx.closePath();
      ctx.fill();
      // saw-tooth inner edge of the bezel
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (var i = 0; i <= 16; i++) {
        var a = Math.PI * (0.7 + i * 0.05);
        var rr2 = i % 2 ? r - 1.2 : r - 3.6;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
        else ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      }
      ctx.stroke();
      // small tick triangles along the bottom
      for (var j = 0; j < 3; j++) {
        var b = Math.PI * (0.3 + j * 0.13);
        ctx.beginPath();
        ctx.moveTo(Math.cos(b) * (r - 0.3), Math.sin(b) * (r - 0.3));
        ctx.lineTo(Math.cos(b + 0.06) * (r - 3), Math.sin(b + 0.06) * (r - 3));
        ctx.lineTo(Math.cos(b + 0.12) * (r - 0.3), Math.sin(b + 0.12) * (r - 0.3));
        ctx.stroke();
      }
      ctx.restore();
      if (hrs > 0) {
        var end = -Math.PI / 2 + (hrs / 24) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -Math.PI / 2, end);
        ctx.closePath();
        ctx.fillStyle = '#0000ff';
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = '#000066';
        ctx.stroke();
        // the hand along the wedge's leading edge
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(end) * r, Math.sin(end) * r);
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = '#222';
        ctx.stroke();
      }
    }
    D.circle(ctx, 0, 0, r, null, '#000', 1);
    D.circle(ctx, 0, 0, 1.6, '#fff', '#000', 0.7);
    ctx.restore();
  }

  function day(ctx, s) {
    var f = fonts();
    abText(ctx, 'DAY', 374.84, 22.9, 15, '#000099');
    abText(ctx, 'DAY', 375.97, 24.07, 15, '#0099ff');
    abText(ctx, String(s.day), 414.97, 23.32, 15, '#000000');
    abText(ctx, String(s.day), 415.97, 23.92, 15, '#0099ff');
    return f;
  }

  // --- map buttons ------------------------------------------------------------------------------
  // Backpack (inventory, button 713): pure blue/yellow art at half alpha; hovering shows it at
  // full strength (colour x1.2), pressing nudges it 1.2 px.
  // Flash fades the whole picture as one layer, so it is drawn opaque off-screen first.
  var packCache = {};
  function backpack(ctx, x, y, hover, down) {
    var key = hover ? 'h' : 'n';
    var c = packCache[key];
    if (!c) {
      c = packCache[key] = document.createElement('canvas');
      c.width = c.height = 150;
      var g = c.getContext('2d');
      g.scale(3, 3);
      g.translate(25, 25);
      backpackArt(g, hover);
    }
    ctx.save();
    ctx.globalAlpha = hover ? 1 : 0.5;
    ctx.drawImage(c, x - 25 + (down ? 1.2 : 0), y - 25 + (down ? 1.2 : 0), 50, 50);
    ctx.restore();
  }

  function backpackArt(ctx, hover) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    var edge = '#000066';
    // shoulder straps looping up at the top corners (grey)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-8.3, -12.2); ctx.lineTo(-12.9, -16.6); ctx.lineTo(-17, -8.2); ctx.lineTo(-11.6, 2.6);
    ctx.moveTo(4.6, -14.8); ctx.lineTo(8.9, -18.4); ctx.lineTo(12.6, -15.4); ctx.lineTo(13.9, -12.2);
    ctx.stroke();
    ctx.strokeStyle = hover ? '#e6e6e6' : '#cccccc';
    ctx.lineWidth = 1.9;
    ctx.stroke();
    // body (slightly tilted), darker flap across the top
    function body() {
      ctx.beginPath();
      ctx.moveTo(-6.2, -15.6);
      ctx.lineTo(12, -14);
      ctx.quadraticCurveTo(14.6, -13.7, 14.8, -11);
      ctx.lineTo(17.3, 15.8);
      ctx.quadraticCurveTo(17.5, 19.3, 14.2, 19.2);
      ctx.lineTo(-8.2, 16.4);
      ctx.quadraticCurveTo(-11.5, 16, -11.5, 12.8);
      ctx.lineTo(-10.3, -12);
      ctx.quadraticCurveTo(-9.8, -15.8, -6.2, -15.6);
      ctx.closePath();
    }
    body();
    ctx.fillStyle = '#0000ff';
    ctx.fill();
    ctx.save();
    body();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(-12, -9.8);
    ctx.lineTo(16, -8.3);
    ctx.lineTo(16, -17);
    ctx.lineTo(-12, -17);
    ctx.closePath();
    ctx.fillStyle = '#0000c8';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, -9.8);
    ctx.lineTo(16, -8.3);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.restore();
    body();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // front pocket with a thick rim
    ctx.beginPath();
    ctx.moveTo(-1.3, -7.4);
    ctx.lineTo(11.6, -6.9);
    ctx.quadraticCurveTo(13.5, -6.8, 13.7, -4.8);
    ctx.lineTo(14.5, 13.8);
    ctx.quadraticCurveTo(14.6, 16.4, 12.1, 16.3);
    ctx.lineTo(-0.9, 15.6);
    ctx.quadraticCurveTo(-3.4, 15.5, -3.4, 13.1);
    ctx.lineTo(-3.5, -5.2);
    ctx.quadraticCurveTo(-3.5, -7.4, -1.3, -7.4);
    ctx.closePath();
    ctx.fillStyle = '#0000ff';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#0000b8';
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // slot under the star
    D.roundRect(ctx, -0.4, 9, 10.8, 3.7, 1.2, '#0000b3', edge, 0.6);
    // yellow star
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      var rr = i % 2 ? 2.5 : 5.7;
      ctx.lineTo(4.8 + Math.cos(a) * rr, 1.8 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffff00';
    ctx.fill();
    ctx.strokeStyle = '#333300';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  }

  // "?" (stats): a big translucent question mark with a little stick figure beside it.
  function statsButton(ctx, hover, down) {
    var f = fonts();
    var o = down ? 1.2 : 0;
    ctx.save();
    ctx.globalAlpha = hover ? 0.5 : 0.324;
    ctx.fillStyle = ctx.strokeStyle = hover ? '#0000e6' : '#000099';
    if (f.black) {
      ctx.font = '45px ' + AB;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('?', 514.43 + o, 37.2 + o);
    } else {
      // no Arial Black: trace its heavy "?" (one layer, so the alpha does not stack)
      ctx.translate(o, o);
      ctx.beginPath();
      ctx.moveTo(515.9, 17.3);
      ctx.bezierCurveTo(515.4, 8.6, 520.8, 4.6, 528.2, 4.6);
      ctx.bezierCurveTo(535.8, 4.6, 540.6, 8.4, 540.6, 14);
      ctx.bezierCurveTo(540.6, 19.2, 536.8, 21.4, 534.6, 23);
      ctx.bezierCurveTo(533.2, 24, 532.9, 25, 532.9, 27);
      ctx.lineTo(524.9, 27);
      ctx.bezierCurveTo(524.7, 22.6, 526.4, 20.6, 529, 18.8);
      ctx.bezierCurveTo(531, 17.4, 532.1, 16.3, 532.1, 14.3);
      ctx.bezierCurveTo(532.1, 12.3, 530.7, 11.2, 528.4, 11.2);
      ctx.bezierCurveTo(525.9, 11.2, 524.4, 12.9, 524.2, 16.5);
      ctx.closePath();
      ctx.rect(524.6, 29.4, 8.7, 7.8);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(o, o);
    ctx.globalAlpha = hover ? 1 : 0.648;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(536.9, 19.3); ctx.lineTo(536.9, 29.4);
    ctx.moveTo(531.9, 24.1); ctx.lineTo(542.6, 24.1);
    ctx.moveTo(536.9, 29.4); ctx.lineTo(533.1, 36.9);
    ctx.moveTo(536.9, 29.4); ctx.lineTo(541.9, 36.9);
    ctx.stroke();
    D.circle(ctx, 536.9, 15, 4.3, hover ? '#1a8cff' : '#0066cc', '#000', 1.1);
    ctx.restore();
  }

  // --- SHOW FPS ---------------------------------------------------------------------------------
  // Sprite 241 counts frames each wall-clock second into frameRate ("35 fps"), shown by the
  // fpsShower text at the bottom-left (Arial Black 14, white) above everything. It starts hidden
  // (root frame 1); opening STATS shows it when fps == 1, and the ON/OFF buttons toggle it.
  var fps = { visible: false, text: '0 fps', el: null, lastSec: null, lastFrame: 0, state: null };

  function fpsSample(now) {
    var sec = Math.floor((now == null ? Date.now() : now) / 1000);
    var fr = SRPG.engine ? SRPG.engine.frame : 0;
    if (fps.lastSec === null) { fps.lastSec = sec; fps.lastFrame = fr; return; }
    if (sec !== fps.lastSec) {
      fps.text = Math.max(0, fr - fps.lastFrame) + ' fps';
      fps.lastSec = sec;
      fps.lastFrame = fr;
    }
  }

  // A new game (or a load) resets the counter's visibility, as the original's frame 1 did.
  function fpsSync() {
    var s = SRPG.game && SRPG.game.s;
    if (s !== fps.state) { fps.state = s; fps.visible = false; }
    return s;
  }

  function fpsUpdate() {
    var s = fpsSync();
    fpsSample();
    if (!fps.el) {
      var stage = document.getElementById('stage');
      if (!stage) return;
      fps.el = document.createElement('div');
      fps.el.className = 'fps-shower';
      fps.el.setAttribute('data-id', 'fps');
      stage.appendChild(fps.el);
    }
    if (fps.el.textContent !== fps.text) fps.el.textContent = fps.text;
    var show = fps.visible && !!s;
    if (fps.el.style.display !== (show ? 'block' : 'none')) fps.el.style.display = show ? 'block' : 'none';
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('load', function () {
      fonts();
      fpsUpdate();
      setInterval(fpsUpdate, 100);
    });
  }

  // --- public ---------------------------------------------------------------------------------
  function mouseIn(b) {
    var m = SRPG.engine && SRPG.engine.mouse;
    return !!m && m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
  }

  var hud = (SRPG.hud = {
    // hit areas of the two map buttons (the original's button hit shapes)
    INVENTORY_BOX: { x: 459, y: 2, w: 36.6, h: 38.6 },
    STATS_BOX: { x: 514.5, y: 4, w: 28.5, h: 34.3 },

    // mode: 'map' (with backpack + "?"), 'inside' (buildings), 'fight' (HP bar only).
    draw: function (ctx, s, mode) {
      if (!s) return;
      var t = SRPG.engine ? SRPG.engine.frame : 0;
      ctx.save();
      hpBar(ctx, s.hp, s.hpmax, 120.75, 16.9, 1.2, { t: t });
      if (mode !== 'fight') {
        cash(ctx, s);
        clock(ctx, 347.85, 17.35, s.time);
        day(ctx, s);
        // the backpack and "?" are only on the map, and vanish while a panel is open
        var panelOpen = SRPG.city && SRPG.city.st && SRPG.city.st.panel;
        if (mode === 'map' && !panelOpen) {
          var down = SRPG.engine && SRPG.engine.mouse.down;
          var hi = mouseIn(hud.INVENTORY_BOX);
          var hs = mouseIn(hud.STATS_BOX);
          backpack(ctx, 477.3, 21.1, hi, hi && down);
          statsButton(ctx, hs, hs && down);
        }
      }
      ctx.restore();
    },

    // Which map HUD button (if any) is at stage point x, y.
    hit: function (x, y) {
      var b = hud.INVENTORY_BOX;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'inventory';
      b = hud.STATS_BOX;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'stats';
      return null;
    },

    // Pieces other screens reuse (the bar fight's enemy bar: hpBar(ctx, hp, max, 450.85, 17.1, 1.25)).
    hpBar: hpBar,
    hpPct: hpPct,
    heartState: heartState,
    // heart(ctx, x, y, frac[, tick]) — frac is hp / hpmax
    heart: function (ctx, x, y, frac, t) { drawHeart(ctx, x, y, Math.floor(frac * 100), t == null ? SRPG.engine.frame : t, 0.83); },
    clock: clock,
    outlined: outlined,
    backpack: backpack,
    text: abText,
    impactText: impactText,
    fonts: fonts,

    // SHOW FPS counter
    fps: fps,
    get fpsVisible() { return fps.visible; },
    set fpsVisible(v) { fpsSync(); fps.visible = !!v; fpsUpdate(); },
    fpsSample: fpsSample,
    fpsUpdate: fpsUpdate,
  });
})();
