// Map art: the sky behind the paper-thin city, the static city picture (ground, the thickness of its
// west and south edges, sidewalks, curbs, roads, every building, trees) and the few animated bits on
// it (neon signs, castle flags, casino sparkles). Everything is drawn in map coordinates, measured
// from the original's map; a map point (X, Y) shows on the stage at (mapx + X, mapy + Y).
//
// Time of day: the original only fades its sky photo of clouds out as the day goes on
// (clouds._alpha = 100 + 8 * (12 - time)), uncovering a starry night sky with a comet behind it.
// The city itself is never tinted.
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var MAP = SRPG.MAP;

  // ---------------------------------------------------------------------------------------------
  // helpers

  function path(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  }
  // Filled polygon from a flat [x0, y0, x1, y1, ...] list, with an optional outline.
  function poly(ctx, p, fill, stroke, lw) {
    path(ctx, p);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
  }
  function rect(ctx, x, y, w, h, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
  }
  function line(ctx, p, color, lw, cap) {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (var i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1;
    ctx.lineCap = cap || 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  function lin(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rad(ctx, x, y, r, stops) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function ellipse(ctx, x, y, rx, ry, fill, stroke, lw, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  // Small deterministic random generator so the specks, cracks and stars never move.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Animated parts left out while rendering the backgrounds they are redrawn over each frame.
  var SKIP = {};

  var SANS = '"Arial Black", "Arial Bold", Arial, Helvetica, sans-serif';
  var SERIF = '"Times New Roman", Times, "Liberation Serif", serif';
  // Text placed with an affine transform [a, b, c, d] (rotation / skew / mirror) around (x, y).
  function label(ctx, str, x, y, o) {
    ctx.save();
    ctx.translate(x, y);
    if (o.m) ctx.transform(o.m[0], o.m[1], o.m[2], o.m[3], 0, 0);
    if (o.rot) ctx.rotate(o.rot);
    ctx.font = o.font;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    var sx = o.sx || 1;
    if (o.fitW) sx = (sx < 0 ? -1 : 1) * o.fitW / ctx.measureText(str).width;
    if (sx !== 1 || o.sy) ctx.scale(sx, o.sy || 1);
    if (o.extrude) {
      // stacked darker copies give the 3-D letters of the signs
      ctx.fillStyle = o.extrude;
      for (var k = o.depth || 3; k > 0; k--) ctx.fillText(str, (o.edx || 0.7) * k, (o.edy || 0.7) * k);
    }
    if (o.shadow) {
      ctx.fillStyle = o.shadow;
      ctx.fillText(str, o.sdx || 1.5, o.sdy || 1.5);
    }
    if (o.stroke) {
      ctx.lineWidth = o.lw || 2;
      ctx.strokeStyle = o.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, 0, 0);
    }
    if (o.fill) {
      ctx.fillStyle = o.fill;
      ctx.fillText(str, 0, 0);
    }
    if (o.inner) {
      ctx.lineWidth = o.ilw || 1;
      ctx.strokeStyle = o.inner;
      ctx.strokeText(str, 0, 0);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // sky (fixed to the stage, like the original's two full-stage pictures)

  var skyDay = null;
  var skyNight = null, skyNightK = 0;

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function paintNight(c, k) {
    var ctx = c.getContext('2d');
    ctx.scale(k, k);
    var W = c.width / k, H = c.height / k;
    ctx.fillStyle = '#26132a';
    ctx.fillRect(0, 0, W, H);
    // a photo of the night sky: dark purple, darker toward the corners
    ctx.fillStyle = rad(ctx, 280, 200, 380, [0, 'rgba(48,24,40,0.6)', 0.65, 'rgba(28,10,26,0.3)', 1, 'rgba(8,0,2,0.8)']);
    ctx.fillRect(0, 0, W, H);
    var r = prng(7);
    for (var i = 0; i < 1500; i++) {
      var x = r() * W, y = r() * H;
      var b = r();
      var tint = r();
      var col = tint < 0.55 ? '255,242,232' : tint < 0.85 ? '255,222,196' : '210,215,255';
      ctx.fillStyle = 'rgba(' + col + ',' + (0.15 + b * b * 0.85).toFixed(2) + ')';
      var sz = b > 0.97 ? 1.8 : b > 0.75 ? 1.2 : 0.8;
      ctx.fillRect(x, y, sz, sz);
    }
    // Halley's comet: bright head at the left, a warm dust tail fanning right, a faint blue ion tail
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var k, t;
    for (k = 0; k < 70; k++) {
      t = k / 70;
      ellipse(ctx, 50 + t * 200, 183 - t * 26, 9 + t * 26, 7 + t * 16, 'rgba(255,215,200,' + (0.09 * (1 - t) * (1 - t)).toFixed(3) + ')', null, 0, -0.12);
    }
    for (k = 0; k < 60; k++) {
      t = k / 60;
      ellipse(ctx, 60 + t * 250, 188 + t * 32, 6 + t * 10, 2 + t * 4, 'rgba(120,120,230,' + (0.045 * (1 - t)).toFixed(3) + ')', null, 0, 0.13);
    }
    for (k = 0; k < 16; k++) {
      t = k / 16;
      ellipse(ctx, 44 + t * 30, 183 - t * 3, 8 + t * 14, 5.5 + t * 5, 'rgba(255,240,230,' + (0.2 * (1 - t)).toFixed(3) + ')', null, 0, -0.08);
    }
    ellipse(ctx, 47, 182.5, 11, 5, 'rgba(255,252,245,0.55)', null, 0, -0.05);
    ctx.restore();
  }

  // The day sky: a photo-like blue with soft white clouds, composed like the original's picture.
  // Clouds are fractal noise shaped by a hand-placed mask of cloud bands, rendered at half size and
  // smoothed up.
  var CLOUDS = [
    // [x0, y0, x1, y1, radius] bands where the clouds gather
    [-20, 60, 130, 5, 40], [100, 15, 230, 60, 45], [215, 55, 290, 150, 48], [265, 140, 320, 250, 44],
    [320, 150, 470, 190, 38], [420, 170, 520, 225, 30], [290, -10, 560, 20, 40], [480, 20, 570, 115, 38],
    [-10, 190, 110, 235, 38], [90, 210, 200, 250, 34], [150, 250, 230, 285, 22], [-10, 310, 70, 335, 22],
    [80, 355, 250, 400, 30], [460, 335, 560, 360, 20], [380, 250, 440, 300, 16], [190, 120, 240, 160, 18],
    [500, 250, 560, 285, 20],
  ];
  function paintDay(c) {
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    ctx.fillStyle = lin(ctx, 0, 0, 0, H, [0, '#88b9e4', 0.5, '#7fb2df', 1, '#8ab7e1']);
    ctx.fillRect(0, 0, W, H);
    var gw = Math.ceil(W / 2), gh = Math.ceil(H / 2);
    var layer = canvas(gw, gh);
    var lx = layer.getContext('2d');
    var img = lx.createImageData(gw, gh);
    var d = img.data;
    var noise = valueNoise(11);
    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        var px = x * 2, py = y * 2;
        var m = 0;
        for (var k = 0; k < CLOUDS.length; k++) {
          var cl = CLOUDS[k];
          var dx = cl[2] - cl[0], dy = cl[3] - cl[1];
          var tt = ((px - cl[0]) * dx + (py - cl[1]) * dy) / (dx * dx + dy * dy);
          tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
          var ex = px - (cl[0] + dx * tt), ey = py - (cl[1] + dy * tt);
          var v = Math.exp(-(ex * ex + ey * ey) / (cl[4] * cl[4]));
          if (v > m) m = v;
        }
        var n = noise(px / 48, py / 48);
        var dens = (m * 1.1 + (n - 0.5) * 1.7 - 0.42) * 2.2;
        dens = dens < 0 ? 0 : dens > 1 ? 1 : dens;
        dens *= 0.55 + 0.45 * noise(px / 18 + 31, py / 18 + 17);
        // a touch of grey-blue shade on the lower, thinner parts
        var shade = noise(px / 25 + 7, py / 25 + 3);
        var i = (y * gw + x) * 4;
        d[i] = 250 - shade * 45;
        d[i + 1] = 252 - shade * 35;
        d[i + 2] = 255 - shade * 18;
        d[i + 3] = Math.round(dens * 245);
      }
    }
    lx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, 0, 0, W, H);
  }
  // Smooth 2-D value noise (5 octaves) on a seeded lattice, 0..1.
  function valueNoise(seed) {
    var r = prng(seed);
    var N = 64, lat = [];
    for (var i = 0; i < N * N; i++) lat.push(r());
    function at(x, y) { return lat[((y % N + N) % N) * N + ((x % N + N) % N)]; }
    function smooth(x, y) {
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var fx = x - x0, fy = y - y0;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      var a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), e = at(x0 + 1, y0 + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + e) * fx * fy;
    }
    return function (x, y) {
      var v = 0, amp = 0.5, f = 1, tot = 0;
      for (var o = 0; o < 5; o++) {
        v += smooth(x * f, y * f) * amp;
        tot += amp;
        amp *= 0.5;
        f *= 2.1;
      }
      return v / tot;
    };
  }

  // ---------------------------------------------------------------------------------------------
  // the ground

  var GRASS = '#33cc00';
  var WALK = '#999999';
  var JOINT = '#737373';
  var ROAD = '#666666';
  var YELLOW = '#ffff00';

  // Top surface of the paper-thin ground (the walkable city), and the part of it shown as sky
  // (the bus lot behind the parked bus).
  var SURFACE = [
    -987, -760, -574, -760, -574, -824, 437, -824, 437, -331, 918, -331, 918, 410, 444, 410, 444, 896,
    -457, 896, -457, -21, -987, -21,
  ];
  var HOLE = [519.5, 224, 593, 224, 593, 410, 519.5, 410];

  // The thickness of the ground seen along the west and south edges: a band of brown soil with
  // roots, a paler layer and grey rock with a ragged underside.
  var WEST_OUTER = [
    -760, -1039, -748, -1042, -736, -1043, -700, -1043, -676, -1042, -652, -1040, -628, -1037, -616, -1038,
    -592, -1041, -568, -1043, -532, -1043, -508, -1044, -490, -1046, -472, -1045, -460, -1042, -448, -1039,
    -412, -1038, -376, -1040, -340, -1040, -304, -1041, -280, -1039, -232, -1040, -220, -1040, -208, -1044,
    -196, -1047, -180, -1049, -150, -1049, -136, -1047, -124, -1045, -112, -1043, -100, -1041, -21, -1041,
  ];
  var WEST_LIGHT = [
    -760, -1012, -748, -1016, -736, -1022, -700, -1022, -652, -1019, -628, -1017, -604, -1019, -568, -1020,
    -532, -1022, -484, -1020, -460, -1016, -400, -1015, -340, -1016, -292, -1018, -244, -1020, -220, -1022,
    -196, -1021, -160, -1018, -124, -1016, -88, -1015, -52, -1013, -21, -1013,
  ];
  var SOUTH_OUTER = [
    -457, 948, -442, 947, -322, 948, -307, 951, -292, 953, -277, 955, -247, 956, -232, 953, -217, 949,
    -202, 946, -157, 944, -127, 948, -52, 947, -7, 945, 23, 946, 38, 951, 68, 952, 98, 950, 143, 950,
    173, 947, 203, 944, 233, 948, 263, 950, 308, 950, 323, 949, 338, 942, 353, 938, 383, 942, 428, 946,
    444, 946,
  ];
  var SOUTH_LIGHT = [
    -457, 909, -352, 910, -307, 911, -277, 912, -247, 915, -217, 917, -172, 915, -127, 914, -82, 912,
    -22, 912, 38, 913, 68, 917, 98, 919, 128, 918, 158, 912, 188, 915, 218, 914, 248, 917, 293, 920,
    323, 910, 353, 911, 383, 915, 428, 916, 444, 916,
  ];

  function drawEdges(ctx) {
    var i, p;
    // west face: from the outer rock line to the ground edge at X -987
    p = [-987, -760];
    for (i = 0; i < WEST_OUTER.length; i += 2) p.push(WEST_OUTER[i + 1], WEST_OUTER[i]);
    p.push(-987, -21);
    poly(ctx, p, '#666666', '#1a1a1a', 1.2);
    p = [-987, -760];
    for (i = 0; i < WEST_LIGHT.length; i += 2) p.push(WEST_LIGHT[i + 1], WEST_LIGHT[i]);
    p.push(-987, -21);
    poly(ctx, p, '#654b38');
    p = [-987, -760];
    for (i = 0; i < WEST_LIGHT.length; i += 2) p.push(WEST_LIGHT[i + 1] + 10, WEST_LIGHT[i]);
    p.push(-987, -21);
    poly(ctx, p, '#663300');
    // south face
    p = [-457, 896];
    for (i = 0; i < SOUTH_OUTER.length; i += 2) p.push(SOUTH_OUTER[i], SOUTH_OUTER[i + 1]);
    p.push(444, 896);
    poly(ctx, p, '#666666', '#1a1a1a', 1.2);
    p = [-457, 896];
    for (i = 0; i < SOUTH_LIGHT.length; i += 2) p.push(SOUTH_LIGHT[i], SOUTH_LIGHT[i + 1] + 11);
    p.push(444, 896);
    poly(ctx, p, '#654b38');
    p = [-457, 896];
    for (i = 0; i < SOUTH_LIGHT.length; i += 2) p.push(SOUTH_LIGHT[i], SOUTH_LIGHT[i + 1]);
    p.push(444, 896);
    poly(ctx, p, '#663300');
    // roots and cracks in the soil (under the slab ends drawn next)
    var r = prng(3);
    ctx.strokeStyle = 'rgba(214,170,120,0.8)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (i = 0; i < 70; i++) {
      var y = -752 + r() * 725;
      var x = -1003 + r() * 12;
      crack(ctx, x, y, r, true);
    }
    for (i = 0; i < 85; i++) {
      crack(ctx, -450 + r() * 890, 899 + r() * 7, r, false);
    }
    // the slabs' own thickness where the sidewalks and the road reach the edge
    rect(ctx, -999, -567, 12, 84, '#6b6560');
    rect(ctx, -999, -483, 12, 180, '#3b3b3b');
    rect(ctx, -999, -303, 12, 86, '#6b6560');
    // sidewalk and road ends on the south face: slanted slabs
    poly(ctx, [-210, 896, -126, 896, -126, 907, -222, 907], '#737373', '#333', 0.8);
    poly(ctx, [-126, 896, 55, 896, 55, 907, -126, 907], '#3b3b3b', '#1a1a1a', 0.8);
    poly(ctx, [55, 896, 141, 896, 141, 907, 55, 907], '#737373', '#333', 0.8);
  }
  function crack(ctx, x, y, r, vertical) {
    var a = (vertical ? Math.PI / 2 : 0) + (r() - 0.5) * 1.6;
    var l = 3 + r() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    var x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    ctx.lineTo(x2, y2);
    if (r() < 0.6) {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 + Math.cos(a + 1.1) * l * 0.6, y2 + Math.sin(a + 1.1) * l * 0.6);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 + Math.cos(a - 1.2) * l * 0.5, y2 + Math.sin(a - 1.2) * l * 0.5);
    }
    ctx.stroke();
  }

  // ---------------------------------------------------------------------------------------------
  // sidewalks, curbs, roads

  // Rounded curb corners where the side roads meet the main road (radius 70).
  var CURB_R = 70;
  function asphaltPath(ctx) {
    var R = CURB_R;
    ctx.beginPath();
    // main road, west road and east road outlined as one shape with rounded inner corners
    ctx.moveTo(-126, -826);
    ctx.lineTo(55, -826);
    ctx.lineTo(55, -54 - R);
    ctx.arc(55 + R, -54 - R, R, Math.PI, Math.PI / 2, true);
    ctx.lineTo(920, -54);
    ctx.lineTo(920, 127);
    ctx.lineTo(55 + R, 127);
    ctx.arc(55 + R, 127 + R, R, -Math.PI / 2, Math.PI, true);
    ctx.lineTo(55, 898);
    ctx.lineTo(-126, 898);
    ctx.lineTo(-126, -303 + R);
    ctx.arc(-126 - R, -303 + R, R, 0, -Math.PI / 2, true);
    ctx.lineTo(-989, -303);
    ctx.lineTo(-989, -483);
    ctx.lineTo(-126 - R, -483);
    ctx.arc(-126 - R, -483 - R, R, Math.PI / 2, 0, true);
    ctx.closePath();
  }
  function sidewalkPath(ctx) {
    ctx.beginPath();
    ctx.rect(-210.5, -824, 84.5, 1720); // main road, west side
    ctx.rect(55, -824, 86, 1720); // main road, east side
    ctx.rect(-987, -567.5, 861, 84.5); // west road, north side
    ctx.rect(-987, -303, 861, 86.5); // west road, south side
    ctx.rect(55, -138.5, 863, 84.5); // east road, north side
    ctx.rect(55, 127, 863, 86); // east road, south side
  }

  function drawStreets(ctx) {
    // sidewalk slabs
    sidewalkPath(ctx);
    ctx.fillStyle = WALK;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#7a7a7a';
    ctx.stroke();

    // slab joints every ~60 px (each stretch keeps its own phase, as measured on the original)
    ctx.save();
    sidewalkPath(ctx);
    ctx.clip();
    ctx.strokeStyle = JOINT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    var k, v;
    for (k = -14; k <= 14; k++) { // main road, west side
      v = 22 + 59.85 * k;
      if (v > -824 && (v < -567 || v > -217)) { ctx.moveTo(-210.5, v + 0.5); ctx.lineTo(-126, v + 0.5); }
    }
    for (k = 0; k <= 11; k++) { v = -796 + 59.85 * k; ctx.moveTo(55, v + 0.5); ctx.lineTo(141, v + 0.5); }
    for (k = 0; k <= 11; k++) { v = 220 + 59.85 * k; if (v < 896) { ctx.moveTo(55, v + 0.5); ctx.lineTo(141, v + 0.5); } }
    for (k = 0; k <= 13; k++) { // west road sidewalks
      v = -211 - 59.83 * k;
      if (v > -987) {
        ctx.moveTo(v + 0.5, -567.5); ctx.lineTo(v + 0.5, -483);
        ctx.moveTo(v + 0.5, -303); ctx.lineTo(v + 0.5, -217);
      }
    }
    for (k = 0; k <= 12; k++) { // east road sidewalks
      v = 200 + 59.7 * k;
      if (v < 918) {
        ctx.moveTo(v + 0.5, -138.5); ctx.lineTo(v + 0.5, -54);
        ctx.moveTo(v + 0.5, 127); ctx.lineTo(v + 0.5, 213);
      }
    }
    ctx.stroke();
    ctx.restore();

    // curbs: stripes following the edge of the asphalt, only where a sidewalk borders it
    ctx.save();
    sidewalkPath(ctx);
    ctx.clip();
    var bands = [[20, '#666666'], [18, '#999999'], [15, '#cccccc'], [11, '#a6a6a6'], [5, '#999999']];
    for (var b = 0; b < bands.length; b++) {
      asphaltPath(ctx);
      ctx.lineWidth = bands[b][0];
      ctx.strokeStyle = bands[b][1];
      ctx.stroke();
    }
    ctx.restore();
    // curb joints continue the slab lines across the curb
    // asphalt
    asphaltPath(ctx);
    ctx.fillStyle = ROAD;
    ctx.fill();
    ctx.save();
    ctx.clip();
    asphaltPath(ctx);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
    // sparse specks in the tarmac
    var r = prng(5);
    for (var i = 0; i < 900; i++) {
      var x = -989 + r() * 1909, y = -826 + r() * 1724;
      var t = r();
      ctx.fillStyle = t < 0.5 ? '#8d8d8d' : t < 0.75 ? '#4d4d4d' : t < 0.9 ? '#b3b3b3' : '#5f6a74';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    ctx.restore();

    // centre dashes
    ctx.fillStyle = YELLOW;
    ctx.strokeStyle = 'rgba(120,120,40,0.6)';
    ctx.lineWidth = 0.6;
    for (k = 0; k < 15; k++) dash(ctx, -40.5, -768.5 + 112.2 * k, 12, 52);
    for (k = 0; k < 7; k++) dash(ctx, -931.5 + 112.3 * k, -399.5, 53, 12);
    for (k = 0; k < 7; k++) dash(ctx, 135.5 + 112.4 * k, 32.5, 53, 12);
  }
  function dash(ctx, x, y, w, h) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  // The bus depot's lot: tarmac from the east road's sidewalk down to the south edge.
  function drawLot(ctx) {
    rect(ctx, 458.5, 212.5, 459.5, 197.5, ROAD);
    line(ctx, [458.5, 213, 458.5, 410], '#403300', 1);
    // the hole in the paper behind the parked bus shows the sky
    ctx.save();
    path(ctx, HOLE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    line(ctx, [519.5, 410, 519.5, 224, 593, 224, 593, 410], '#1a1a1a', 1.2, 'butt');
    line(ctx, [592, 225, 592, 410], '#c0c0c0', 1, 'butt');
  }

  // ---------------------------------------------------------------------------------------------
  // trees: a bent trunk with three leafy clumps (dark green and teal)

  // A leafy clump: a lobed blob about 30 x 29 at scale 1, centred on (x, y).
  function clump(ctx, x, y, sx, sy, fill, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -sx : sx, sy);
    ctx.beginPath();
    ctx.moveTo(-11, 2);
    ctx.bezierCurveTo(-17, 0, -15, -12, -7, -10);
    ctx.bezierCurveTo(-7, -16, 3, -17, 5, -11);
    ctx.bezierCurveTo(11, -15, 18, -9, 13, -3);
    ctx.bezierCurveTo(19, 0, 17, 9, 11, 8);
    ctx.bezierCurveTo(13, 14, 3, 17, 1, 11);
    ctx.bezierCurveTo(-4, 16, -12, 13, -9, 8);
    ctx.bezierCurveTo(-15, 8, -15, 3, -11, 2);
    ctx.closePath();
    ctx.restore();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#1a3300';
    ctx.stroke();
  }
  // (x, y) = top-left of the tree's box as in MAP.trees (110 x 94 at scale 1): a bent trunk lying
  // from the lower left, a thin branch up into each leafy clump.
  function tree(ctx, x, y, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    var DK = '#336600', TL = '#339966', BARK = '#cc6600', EDGE = '#330000';
    // branches
    poly(ctx, [31, 61, 31, 47, 35, 37, 42, 37, 39, 47, 40, 57], BARK, EDGE, 1.5);
    poly(ctx, [58, 40, 60, 28, 61, 19, 65, 19, 64, 30, 65, 36], BARK, EDGE, 1.5);
    poly(ctx, [54, 51, 60, 49, 66, 51, 71, 51, 71, 55, 62, 56, 55, 57], BARK, EDGE, 1.5);
    // trunk
    poly(ctx, [-1, 75, 8, 75, 14, 72, 20, 68, 26, 64, 32, 59, 41, 53, 47, 48, 53, 43, 59, 38, 65, 33, 71, 29,
      74, 26, 79, 29, 78, 33, 74, 35, 68, 39, 62, 44, 56, 50, 50, 54, 44, 59, 38, 64, 32, 69, 26, 75, 20, 81,
      14, 88, 8, 96, 5, 100, 1, 97, -2, 86], BARK, EDGE, 1.8);
    // darker underside and a lighter streak
    poly(ctx, [6, 97, 12, 89, 20, 80, 30, 71, 40, 63, 50, 55, 60, 47, 70, 39, 76, 34, 74, 35, 68, 39, 62, 44,
      56, 50, 50, 54, 44, 59, 38, 64, 32, 69, 26, 75, 20, 81, 14, 88, 8, 96, 5, 100], '#a34f00');
    ellipse(ctx, 1.5, 88, 2.5, 12, '#b35900', EDGE, 1, -0.12);
    clump(ctx, 49, 32, 0.5, 0.72, TL, true);
    clump(ctx, 37, 29, 0.72, 0.66, DK);
    clump(ctx, 70, 11, 0.58, 0.62, TL, true);
    clump(ctx, 54, 11, 0.74, 0.64, DK);
    clump(ctx, 95, 24, 1.02, 1.08, TL, true);
    clump(ctx, 80, 18.5, 0.6, 0.58, DK);
    clump(ctx, 76, 46, 0.52, 0.56, TL);
    clump(ctx, 83, 55, 0.92, 1.0, DK, true);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // buildings (west to east, north to south)

  function apartment(ctx) {
    // flat roof with five skylights; the pale triangle is the west wall
    poly(ctx, [-975, -760, -576, -760, -701, -632, -975, -632], '#604d0d');
    poly(ctx, [-975, -760, -850, -760, -975, -632], '#7b6411');
    ctx.fillStyle = lin(ctx, -850, -760, -576, -632, [0, 'rgba(96,86,15,0)', 1, 'rgba(96,86,15,0.5)']);
    path(ctx, [-850, -760, -576, -760, -701, -632, -975, -632]);
    ctx.fill();
    line(ctx, [-975, -632, -850, -760], '#1a1405', 1.2);
    poly(ctx, [-975, -760, -576, -760, -701, -632, -975, -632], null, '#1a1405', 1.2);
    skylight(ctx, -877, -720.7);
    skylight(ctx, -778, -720.7);
    skylight(ctx, -679, -720.7);
    skylight(ctx, -926, -668.7);
    skylight(ctx, -729, -668.7);
    // entrance: glass door, walkway and the red awning on two poles
    poly(ctx, [-828.5, -632, -815, -645, -815, -632], '#00ccff', '#1a1a1a', 1);
    rect(ctx, -828.5, -632, 42, 64, WALK, '#555', 1);
    line(ctx, [-839, -582, -815, -610], '#1a1a1a', 3.2, 'butt');
    line(ctx, [-839, -582, -815, -610], '#b39c4d', 1.8, 'butt');
    line(ctx, [-776, -582, -748, -606], '#1a1a1a', 3.2, 'butt');
    line(ctx, [-776, -582, -748, -606], '#b39c4d', 1.8, 'butt');
    poly(ctx, [-815, -661, -807.6, -665, -807.6, -606, -815, -601], '#d40000', '#1a0000', 1);
    ctx.beginPath();
    ctx.moveTo(-807.6, -665);
    ctx.quadraticCurveTo(-785, -660, -766.4, -671);
    ctx.lineTo(-766.4, -612);
    ctx.quadraticCurveTo(-785, -603, -807.6, -606);
    ctx.closePath();
    ctx.fillStyle = '#ff0000';
    ctx.fill();
    ctx.strokeStyle = '#1a0000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-766.4, -671);
    ctx.quadraticCurveTo(-762, -663, -755, -664);
    ctx.lineTo(-746.4, -666);
    ctx.lineTo(-746.4, -606.4);
    ctx.lineTo(-757, -607);
    ctx.quadraticCurveTo(-764, -608, -766.4, -612);
    ctx.closePath();
    ctx.fillStyle = '#b30000';
    ctx.fill();
    ctx.stroke();
  }
  // A skylight: a glass pane in a gold frame on a striped curb, sheared like the roof.
  // (x, y) = top-left corner of its striped front.
  function skylight(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    poly(ctx, [55, 0, 68, -12, 68, 5, 55, 17], '#4d4d4d', '#1a1a1a', 0.8);
    rect(ctx, 0, 0, 55, 17, '#ffffcc', '#1a1a1a', 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 55, 17);
    ctx.clip();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    for (var i = -8; i < 62; i += 7.5) { ctx.moveTo(i, 17); ctx.lineTo(i + 11, 0); }
    ctx.stroke();
    ctx.restore();
    rect(ctx, 0.5, 0.5, 54, 16, null, '#b3a030', 1.2);
    poly(ctx, [30, -29.5, 83, -29.5, 56, -0.5, 4, -0.5], '#c0ac1d', '#1a1405', 1);
    poly(ctx, [33.4, -25.5, 75, -25.5, 52, -2, 14, -2], '#00ccff', '#003340', 0.8);
    line(ctx, [47, -25.5, 27, -2], '#006680', 1.1);
    line(ctx, [61, -25.5, 40, -2], '#006680', 1.1);
    // railing
    line(ctx, [10, -8, 10, 5], '#1a1a1a', 1.6, 'butt');
    line(ctx, [63, -9, 63, 5], '#1a1a1a', 1.6, 'butt');
    line(ctx, [1, 4, 64, 4], '#333', 1.6, 'butt');
    ctx.restore();
  }

  function mansion(ctx) {
    // shown only once you live there (dwelling 4)
    // east wall with windows and the front door
    poly(ctx, [-261.7, -810, -210.7, -765, -210.7, -620.7, -261.7, -666.7], '#b45a01', '#1a0d00', 1.2);
    poly(ctx, [-366.7, -666.7, -261.7, -666.7, -210.7, -620.7, -318, -620.7], '#b45a01', '#1a0d00', 1.2);
    poly(ctx, [-368.3, -810, -261.7, -810, -300, -740, -406.7, -740], '#a95401', '#000', 1.2);
    poly(ctx, [-406.7, -740, -300, -740, -261.7, -666.7, -366.7, -666.7], '#a95401', '#000', 1.2);
    poly(ctx, [-261.7, -810, -300, -740, -261.7, -670], '#febc7a', '#000', 1.2);
    ellipse(ctx, -277.3, -738.3, 7, 7, '#e0c85a', '#333', 1);
    line(ctx, [-284, -738.3, -270.6, -738.3], '#333', 1);
    line(ctx, [-277.3, -745, -277.3, -731.6], '#333', 1);
    for (var i = 0; i < 3; i++) {
      var y0 = -783.6 + i * 34.5;
      poly(ctx, [-257.3, y0, -236, y0 + 12.6, -236, y0 + 40, -257.3, y0 + 28.6], '#ffffff', '#000', 1.2);
      // four grey panes behind a white cross bar
      poly(ctx, [-255, y0 + 3.5, -238.3, y0 + 13.5, -238.3, y0 + 37, -255, y0 + 26.5], '#e6e6e6', '#333', 0.8);
      line(ctx, [-246.6, y0 + 8.5, -246.6, y0 + 32], '#1a1a1a', 2.6, 'butt');
      line(ctx, [-255, y0 + 15, -238.3, y0 + 25.2], '#1a1a1a', 2.6, 'butt');
      line(ctx, [-246.6, y0 + 8.5, -246.6, y0 + 32], '#ffffff', 1.3, 'butt');
      line(ctx, [-255, y0 + 15, -238.3, y0 + 25.2], '#ffffff', 1.3, 'butt');
    }
    poly(ctx, [-231, -739, -211, -723, -211, -685.5, -231, -700.5], '#6b6b00', '#333300', 1);
    poly(ctx, [-228, -733, -213.5, -721.5, -213.5, -689, -228, -700], '#663300', '#331a00', 1);
    line(ctx, [-228, -716.5, -213.5, -705], '#331a00', 1);
    // three trees on the lawn in front (the usual tree, mirrored and turned)
    treeAt(ctx, -284, -604);
    treeAt(ctx, -263, -614);
    treeAt(ctx, -241, -618);
  }
  function treeAt(ctx, bx, by) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(0.2);
    ctx.scale(-0.58, 0.58);
    tree(ctx, -1, -92, 1);
    ctx.restore();
  }

  // The castle (dwelling 5): two front towers with flags, a tall tower with a blue cone roof, a
  // back tower, curtain walls with battlements, the east gate with its guard and the path out.
  function castle(ctx) {
    var OUT = '#333333';
    function grad(cx, r) {
      return lin(ctx, cx - r, 0, cx + r, 0, [0, '#6e6e6e', 0.3, '#a8a8a8', 0.55, '#9a9a9a', 1, '#6a6a6a']);
    }
    function body(cx, r, top, bottom) {
      ctx.beginPath();
      ctx.moveTo(cx - r, top);
      ctx.lineTo(cx - r, bottom);
      ctx.ellipse(cx, bottom, r, r * 0.3, 0, Math.PI, 0, true);
      ctx.lineTo(cx + r, top);
      ctx.closePath();
      ctx.fillStyle = grad(cx, r);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
    // A 3-D merlon on a straight wall: front face x0..x1 from y down to yb, a light top face and a
    // side face receding up and to the right.
    function block(x0, x1, y, yb, front, side) {
      var d = 4.5, u = 6.5;
      poly(ctx, [x1, y, x1 + d, y - u, x1 + d, yb - u, x1, yb], side, OUT, 1.4);
      poly(ctx, [x0, y, x1, y, x1 + d, y - u, x0 + d, y - u], '#e6e6e6', OUT, 1.4);
      poly(ctx, [x0, y, x1, y, x1, yb, x0, yb], front, OUT, 1.4);
    }
    // The crenellated crown on top of a round tower (a wider ring): its outer band down to the rim
    // ellipse at yb, the inner face of the far side with its merlons, the pale walkway inside and
    // the near merlons in front of it. Rim ellipse centred at yc, radii r / ry; 12 merlons.
    function crown(cx, r, yc, ry, yb) {
      var i, k, t, p;
      var H = 13.5, W = 19 * Math.PI / 180, IN = 15;
      var inner = lin(ctx, cx - r, 0, cx + r, 0, [0, '#bdbdbd', 0.45, '#9a9a9a', 1, '#7a7a7a']);
      // outer band
      ctx.beginPath();
      ctx.moveTo(cx - r, yc);
      ctx.lineTo(cx - r, yb);
      ctx.ellipse(cx, yb, r, ry, 0, Math.PI, 0, true);
      ctx.lineTo(cx + r, yc);
      ctx.closePath();
      ctx.fillStyle = grad(cx, r);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      function tooth(a0, a1, h) {
        var q = [];
        for (k = 0; k <= 4; k++) { t = a0 + (a1 - a0) * k / 4; q.push(cx + r * Math.cos(t), yc + ry * Math.sin(t)); }
        for (k = 4; k >= 0; k--) { t = a0 + (a1 - a0) * k / 4; q.push(cx + r * Math.cos(t), yc + ry * Math.sin(t) - h); }
        return q;
      }
      // far merlons (their inner faces), then the opening: inner face of the far wall above the
      // walkway, which runs round to the near rim
      for (i = 0; i < 12; i++) {
        t = (4 + 30 * i) * Math.PI / 180;
        if (Math.sin(t) >= 0) continue;
        poly(ctx, tooth(t - W / 2, t + W / 2, H - 1), inner, OUT, 1.6);
      }
      ellipse(ctx, cx, yc, r, ry, inner, OUT, 1.8);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, yc, r, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ellipse(ctx, cx, yc + IN, r, ry, '#d9d9d9', OUT, 1.6);
      ctx.restore();
      // near merlons, standing on the rim in front of the walkway
      for (i = 0; i < 12; i++) {
        t = (4 + 30 * i) * Math.PI / 180;
        if (Math.sin(t) < 0) continue;
        p = tooth(t - W / 2, t + W / 2, H);
        path(ctx, p);
        ctx.fillStyle = grad(cx, r);
        ctx.fill();
        // outline the top and sides only: the merlon grows out of the band
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        for (k = 18; k >= 10; k -= 2) ctx.lineTo(p[k], p[k + 1]);
        ctx.lineTo(p[8], p[9]);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = OUT;
        ctx.stroke();
      }
    }
    // A window on a crown's band, its bottom edge following the band's curve.
    function crownWindow(x, y, w, h, cx, r, ry) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      for (var k = 0; k <= 6; k++) {
        var xx = x + w - w * k / 6, u = (xx - cx) / r;
        ctx.lineTo(xx, y + h + ry * 0.3 * (Math.sqrt(Math.max(0, 1 - u * u)) - 1));
      }
      ctx.closePath();
      ctx.fillStyle = '#6e6e6e';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
    function slit(x, y) {
      ctx.beginPath();
      ctx.ellipse(x, y, 5.5, 17, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#595959';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
    var k;
    // back-right tower with the yellow flag
    body(-253, 26.5, -860, -738);
    crown(-254.5, 38.5, -882, 15.75, -860);
    slit(-241, -819);
    if (!SKIP.flag0) castleFlag(ctx, 0, 0);
    // back wall: dark face, a pale walkway and three merlons
    rect(ctx, -426.6, -817, 62.6, 60, '#4d4d4d', OUT, 2);
    rect(ctx, -426.6, -821.5, 62.6, 4.5, '#e0e0e0', OUT, 1.4);
    block(-423.5, -408.5, -829, -821.5, '#4d4d4d', '#8c8c8c');
    block(-399, -384.5, -829, -821.5, '#4d4d4d', '#8c8c8c');
    block(-376.5, -362, -829, -821.5, '#4d4d4d', '#8c8c8c');
    // tall tower with the blue cone
    body(-452.8, 26, -842, -760);
    body(-452, 37.5, -889, -842);
    ctx.beginPath();
    ctx.moveTo(-494.8, -886.5);
    ctx.lineTo(-450.6, -948);
    ctx.lineTo(-406.8, -886.5);
    ctx.ellipse(-450.8, -886.5, 44, 12.5, 0, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, -495, 0, -407, 0, [0, '#000080', 0.3, '#2244dd', 0.62, '#99ccff', 0.78, '#4477ff', 1, '#2244cc']);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#001a66';
    ctx.stroke();
    // walkway from the front-left tower to the tall tower
    poly(ctx, [-489, -801, -456.6, -823, -456.6, -810, -489, -788], '#cccccc', OUT, 1.8);
    // east wall with the gate: a portcullis of black bars over a pale opening
    poly(ctx, [-305.6, -766.7, -259, -824, -259, -729, -300, -679], lin(ctx, -305, 0, -259, 0, [0, '#9a9a9a', 1, '#7a7a7a']), OUT, 2);
    poly(ctx, [-305.6, -766.7, -259, -824, -259, -815, -303, -760], '#d0d0d0', OUT, 1.4);
    function gate() {
      ctx.beginPath();
      ctx.moveTo(-300, -682);
      ctx.lineTo(-300, -742);
      ctx.bezierCurveTo(-298, -770, -272, -782, -266, -760);
      ctx.lineTo(-266, -729);
      ctx.closePath();
    }
    gate();
    ctx.fillStyle = '#333333';
    ctx.fill();
    ctx.save();
    ctx.clip();
    // small pale gaps between the bars, in rows sloping up with the wall
    for (k = 0; k < 3; k++) {
      for (var j = 0; j < 9; j++) {
        var hx = -292.5 + k * 8.5, hy = -774 + j * 11 - k * 3.8;
        poly(ctx, [hx, hy, hx + 3, hy - 1.3, hx + 3, hy + 5.7, hx, hy + 7], '#cccccc');
      }
    }
    ctx.restore();
    gate();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
    // front curtain wall: face, a pale walkway behind five merlons
    rect(ctx, -501.6, -745.5, 140, 96.5, '#666666', OUT, 2);
    rect(ctx, -501.6, -751.5, 140, 6, '#e0e0e0', OUT, 1.4);
    var ML = [[-493.5, -477], [-465.5, -449.5], [-443, -426], [-414.5, -397.5], [-381.5, -365]];
    for (k = 0; k < ML.length; k++) block(ML[k][0], ML[k][1], -756, -745.5, '#7a7a7a', '#999999');
    // front towers
    body(-531.6, 28.5, -769, -649);
    crown(-530.5, 42.5, -812, 15, -783);
    crownWindow(-548.5, -789.5, 30, 18, -530.5, 42.5, 15);
    slit(-518, -719);
    if (!SKIP.flag1) castleFlag(ctx, 1, 0);
    body(-334.4, 28.7, -769, -649);
    crown(-334.5, 41.3, -812, 15, -783);
    crownWindow(-350.5, -789.5, 30.5, 18, -334.5, 41.3, 15);
    slit(-323, -719);
    if (!SKIP.flag2) castleFlag(ctx, 2, 0);
    // path from the gate to the sidewalk, and the guard waving at the gate
    poly(ctx, [-300, -684, -266, -728, -211, -728, -211, -684], '#cccccc');
    line(ctx, [-300, -684, -211, -684], '#1a1a1a', 1.4);
    line(ctx, [-266, -728, -211, -728], '#1a1a1a', 1.4);
    if (!SKIP.guard) guard(ctx, -260, -744, 0);
  }
  // The castle's three flags (yellow, green, red); `wave` -1..1 ripples them (the original's
  // 16-frame flag clips).
  var FLAGS = [
    [-251.6, -936.7, -879.5, '#ffff66', '#cccc00'],
    [-535, -884, -809.5, '#33cc33', '#009900'],
    [-337, -858, -811, '#ff3333', '#cc0000'],
  ];
  function castleFlag(ctx, i, wave) {
    var F = FLAGS[i], x = F[0], top = F[1];
    line(ctx, [x, top, x, F[2]], '#663300', 2.4, 'butt');
    line(ctx, [x, top, x, F[2]], '#cc9966', 1.1, 'butt');
    var w = wave * 2.5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + 15, top + 2 + w, x + 33, top + 7 + w * 0.4);
    ctx.quadraticCurveTo(x + 16, top + 11 - w, x, top + 16);
    ctx.closePath();
    ctx.fillStyle = lin(ctx, x, top, x + 33, top, [0, F[4], 1, F[3]]);
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
  }
  // The little guard at the castle gate waves (four poses, 3 frames each).
  function guard(ctx, x, y, pose) {
    ellipse(ctx, x, y, 4.5, 4.5, '#cccccc', '#000', 1.2);
    line(ctx, [x, y + 4.5, x, y + 20], '#000', 1.2);
    line(ctx, [x, y + 20, x - 4, y + 29], '#000', 1.2);
    line(ctx, [x, y + 20, x + 4, y + 29], '#000', 1.2);
    line(ctx, [x, y + 9, x + 5, y + 15], '#000', 1.2);
    var hand = [[-7, -2], [-8, -6], [-5, -8], [-9, -4]][pose || 0];
    line(ctx, [x, y + 9, x - 4, y + 5, x + hand[0], y + hand[1]], '#000', 1.2);
  }

  function bank(ctx) {
    // tall block B (east) and lower block A with BANK and the gold $ on its roof
    poly(ctx, [338.5, -827.5, 437, -827.5, 437, -585, 338.5, -585], '#a40000', '#1a0000', 1.2);
    poly(ctx, [338.5, -827.5, 338.5, -585, 293.5, -540, 293.5, -782.5], '#660000', '#1a0000', 1.2);
    poly(ctx, [301.5, -767.5, 331, -796, 331, -714, 301.5, -686], '#00ccff', '#1a0000', 1);
    poly(ctx, [301.5, -651, 331, -680, 331, -585, 301.5, -556], '#00ccff', '#1a0000', 1);
    line(ctx, [323, -785, 327, -789], '#fff', 0.8);
    line(ctx, [323, -669, 327, -673], '#fff', 0.8);
    poly(ctx, [191, -781.5, 293.5, -781.5, 293.5, -544, 191, -544], '#a40000', '#1a0000', 1.2);
    poly(ctx, [191, -781.5, 191, -544, 141, -494, 141, -731.5], '#660000', '#1a0000', 1.2);
    poly(ctx, [191, -544, 293.5, -544, 243.5, -494, 141, -494], '#510000', '#1a0000', 1.2);
    label(ctx, 'BANK', 175, -707, { font: 'bold 25px ' + SERIF, fill: '#ffcc00', stroke: '#b37700', lw: 0.8, m: [1, -0.99, 0, 1], rot: Math.PI / 2, fitW: 106 });
    // door
    poly(ctx, [141, -592.5, 174, -625, 174, -570, 141, -547.5], '#666666', '#1a1a1a', 1);
    poly(ctx, [143.5, -591, 171.5, -619, 171.5, -571, 143.5, -550], '#00ccff', '#333', 0.8);
    line(ctx, [150, -590, 150, -566], '#999999', 2);
    // the gold dollar sign
    // a tall, narrow 3-D $ standing slightly tilted, its dark sides toward the upper right
    label(ctx, '$', 241, -696.5, { font: 'bold 96px ' + SERIF, fill: '#ffcc00', extrude: '#4d3300', depth: 6, edx: 1.4, edy: -0.6,
      stroke: '#1a1400', lw: 1.6, rot: 0.34, sx: 0.58 });
  }

  function nli(ctx) {
    // New Lines Incorporated: grey tower, windows on the west wall, yellow sign on the roof
    poly(ctx, [288.5, -584, 437, -584, 437, -314, 288.5, -314], '#999999', '#1a1a1a', 1.2);
    poly(ctx, [288.5, -584, 288.5, -314, 141, -167.5, 141, -439], '#666666', '#1a1a1a', 1.2);
    poly(ctx, [288.5, -314, 437, -314, 290, -167.5, 141, -167.5], '#525252', '#1a1a1a', 1.2);
    var cols = [[152.5, -426.5, [0, 1]], [197.5, -469, [0, 1, 2]], [242.5, -512.5, [0, 1, 2]]];
    for (var c = 0; c < cols.length; c++) {
      for (var j = 0; j < cols[c][2].length; j++) {
        var row = cols[c][2][j];
        var x = cols[c][0], y = cols[c][1] + row * 77.5;
        if (c === 0 && row === 1) y = -270;
        nliWindow(ctx, x, y);
      }
    }
    // door
    poly(ctx, [141, -355, 174, -387.5, 174, -312.5, 141, -280], '#663300', '#1a0d00', 1.2);
    line(ctx, [141, -317.5, 174, -350], '#1a0d00', 1);
    line(ctx, [158, -366, 158, -350], '#331a00', 2);
    line(ctx, [158, -330, 158, -312], '#331a00', 2);
    // sign on the roof
    poly(ctx, [348.75, -559.5, 355, -559.5, 355, -426, 348.75, -426], '#ffff00', '#333300', 1);
    poly(ctx, [305.5, -383.75, 348.75, -426, 354, -425, 309, -382.5], '#cc9900', '#333300', 1);
    poly(ctx, [305.5, -517.5, 348.75, -559.5, 348.75, -426.25, 305.5, -383.75], '#cccc00', '#333300', 1.2);
    var sign = { font: 'bold 22px Impact, "Arial Black", ' + SANS, fill: '#1a1a00', stroke: '#1a1a00', lw: 1.4, m: [1, -0.97, 0, 1], rot: Math.PI / 2, fitW: 134 };
    label(ctx, 'NEW LINES', 334, -478, sign);
    sign.font = 'bold 11px Impact, "Arial Black", ' + SANS;
    sign.lw = 0.8;
    sign.fitW = 111;
    label(ctx, 'INCORPORATED', 315, -460.5, sign);
  }
  function nliWindow(ctx, x, y) {
    poly(ctx, [x, y, x + 30, y - 30, x + 30, y + 16, x, y + 46], '#00ccff', '#1a1a1a', 1);
    line(ctx, [x + 22, y - 19, x + 27, y - 24], '#fff', 0.8);
    line(ctx, [x + 22, y - 16, x + 27, y - 21], '#fff', 0.8);
  }

  function uofs(ctx) {
    // University of Stick: yellow stone hall with a portico and pediment
    var L = '#e9d96b', M = '#e0ca2e', XL = '#eee28e', G = '#c0ac1d', B = '#9c9141', T = '#b9ac55', O = '#3b371b';
    poly(ctx, [430, -331, 902, -331, 902, -211, 430, -211], L, O, 1);
    poly(ctx, [430, -331, 465, -331, 465, -211, 430, -211], M, O, 1);
    poly(ctx, [541.7, -331, 586.7, -331, 586.7, -223, 541.7, -223], M, O, 1);
    poly(ctx, [628.3, -331, 758.3, -331, 758.3, -275, 628.3, -275], XL, O, 1);
    poly(ctx, [758.3, -331, 823.3, -331, 823.3, -271.7, 758.3, -271.7], M, O, 1);
    line(ctx, [861.7, -331, 861.7, -270], O, 1);
    // pediment
    poly(ctx, [627, -273, 758.3, -304, 823.3, -270, 627, -270], '#9c9141', O, 1.2);
    poly(ctx, [663.3, -275.7, 756.7, -297.7, 798.3, -275.7], '#ff9900', O, 1);
    label(ctx, 'U of S', 743, -285.5, { font: 'italic bold 16px ' + SERIF, fill: '#1a1a1a', fitW: 50 });
    // portico front
    poly(ctx, [588.3, -271, 861.7, -271, 815, -222, 541.7, -222], G, O, 1.2);
    poly(ctx, [706.7, -253, 728, -262, 750, -253], '#ff9900', O, 1);
    rect(ctx, 680, -254, 91.7, 2.5, '#60560f', O, 0.6);
    uWin(ctx, 626.7, -246.7, 32.6, 25, 22.7);
    uWin(ctx, 691.7, -247.3, 31.6, 25, 25);
    uWin(ctx, 723.3, -247.3, 31.7, 25, 25);
    uWin(ctx, 786.7, -247.3, 32.6, 25, 23.4);
    // lower hall front with windows and the arched door
    poly(ctx, [430, -211, 902, -211, 865, -174.3, 430, -174.3], G, O, 1.2);
    uWin(ctx, 546.7, -199, 31.6, 24.7, 24);
    uWin(ctx, 609.3, -199, 32.4, 24.7, 22.6);
    uWin(ctx, 753.3, -199, 33.4, 24.7, 21.6);
    uWin(ctx, 818.3, -199, 31.7, 24.7, 23.3);
    // base
    poly(ctx, [417.3, -290, 430, -303, 430, -174.3, 417.3, -161.7], T, O, 1);
    poly(ctx, [430, -174.3, 865, -174.3, 856.7, -161.7, 417.3, -161.7], B, O, 1);
    // the arched entrance (sheared like the walls) and the path to the sidewalk
    rect(ctx, 642.5, -162, 40, 24, WALK, '#555', 1);
    ctx.save();
    ctx.translate(662, -161.7);
    ctx.transform(1, 0, -0.62, 1, 0, 0);
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-22, -26);
    ctx.bezierCurveTo(-22, -54, 22, -54, 22, -26);
    ctx.lineTo(22, 0);
    ctx.closePath();
    ctx.fillStyle = '#908116';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = O;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(-17, -26);
    ctx.bezierCurveTo(-17, -47, 17, -47, 17, -26);
    ctx.lineTo(17, 0);
    ctx.closePath();
    ctx.fillStyle = '#4f4f4f';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // A sheared window with a cream lintel: (x, y) top-left, w width, h height, dx bottom shift left.
  function uWin(ctx, x, y, w, h, dx) {
    poly(ctx, [x, y, x + w, y, x + w - dx, y + h, x - dx, y + h], '#99bbcc', '#1a1a1a', 1);
    poly(ctx, [x, y, x + w, y, x + w - 3, y + 3.5, x - 3, y + 3.5], '#f5eab8', '#1a1a1a', 0.8);
  }

  function furniture(ctx) {
    // Fine Line Furnishings: white box; the sign letters read mirrored, as in the original
    poly(ctx, [-880, -192.5, -569, -192.5, -569, -21, -880, -21], '#e9e9ec', '#1a1a1a', 1.2);
    poly(ctx, [-960, -112.5, -880, -192.5, -880, -21, -960, -21], '#c9c9c9', '#1a1a1a', 1.2);
    rect(ctx, -689, -217.5, 59, 25, WALK, '#555', 1);
    // thin outlined italic capitals (leaning right once mirrored) with a grey edge, on two bars
    // joined by two slanted struts
    var o = { font: '27px ' + SERIF, fill: '#e2e2e2', stroke: '#333333', lw: 0.8, sx: -1, extrude: '#8c8c8c', depth: 2,
      edx: 0.8, edy: 0.8, m: [1, 0, -0.3, 1], baseline: 'alphabetic' };
    o.fitW = 206;
    label(ctx, 'FINE LINE', -696, -163.5, o);
    o.font = '30px ' + SERIF;
    o.fitW = 271;
    label(ctx, 'FURNISHINGS', -731.5, -123.5, o);
    poly(ctx, [-766, -157.7, -759, -157.7, -790, -123, -797, -123], '#999999', '#262626', 0.9);
    poly(ctx, [-626, -157.7, -619, -157.7, -650, -123, -657, -123], '#999999', '#262626', 0.9);
    poly(ctx, [-808, -161.7, -586, -161.7, -590, -157.7, -812, -157.7], '#999999', '#262626', 0.9);
    poly(ctx, [-874, -123, -589, -123, -594, -118, -879, -118], '#999999', '#262626', 0.9);
  }

  function mcsticks(ctx) {
    ctx.fillStyle = lin(ctx, -535, -210, -217, -40, [0, '#c8b020', 1, '#c0ac1d']);
    poly(ctx, [-535, -210, -217.5, -210, -217.5, -40, -535, -40], ctx.fillStyle, '#1a1405', 1.2);
    poly(ctx, [-567.5, -177.5, -535, -210, -535, -40, -567.5, -7.5], '#998917', '#1a1405', 1.2);
    poly(ctx, [-535, -40, -217.5, -40, -282.5, 25, -600, 25], '#837514', '#1a1405', 1.2);
    // the sign: a red board leaning back on two legs (flat top, front face sloping down to the
    // lower left), with the golden 3-D M standing on it
    mcLeg(ctx, -425);
    mcLeg(ctx, -325);
    poly(ctx, [-432, -145, -436, -142, -455, -114, -455, -106, -432, -132], '#ff0000', '#1a0000', 1);
    poly(ctx, [-432, -145, -240, -145, -240, -133, -432, -133], '#cc0000', '#1a0000', 1);
    poly(ctx, [-432, -132.5, -240.5, -132.5, -274, -104, -454, -104], '#990000', '#1a0000', 1);
    label(ctx, 'McSticks', -360, -107.5, { font: 'bold 21px ' + SANS, fill: '#ffff00', stroke: '#ffff00', lw: 0.6, sx: -1,
      fitW: 168, m: [1, 0, -0.75, 1], baseline: 'alphabetic' });
    // golden arches: an M leaning right, its orange top faces showing above and to the left
    var M = [
      [-388, -131, -325, -182, -310, -195, -299, -201, -294, -196, -296, -181, -303, -167, -313, -156],
      [-313, -156, -290, -176, -266, -191, -247, -201, -239, -198, -242, -187, -251, -174, -265, -157, -279, -145,
        -290, -128],
    ];
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    var pass = [[-7.5, -8, '#1a1405', 15], [-7.5, -8, '#ff9900', 12.5], [0, 0, '#1a1405', 15], [0, 0, '#ffcc00', 12.5]];
    for (var q = 0; q < pass.length; q++) {
      for (var a = 0; a < M.length; a++) {
        ctx.save();
        ctx.translate(pass[q][0], pass[q][1]);
        var m = M[a];
        ctx.beginPath();
        ctx.moveTo(m[0], m[1]);
        for (var i = 2; i < m.length; i += 2) ctx.lineTo(m[i], m[i + 1]);
        ctx.strokeStyle = pass[q][2];
        ctx.lineWidth = pass[q][3];
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  // A leg under the board: its bright left side and dark front, sloping down to the left; x = the
  // front's top-left corner.
  function mcLeg(ctx, x) {
    poly(ctx, [x - 13.5, -102, x - 1.5, -102, x - 15, -88, x - 16.5, -88], '#ff0000', '#1a0000', 1);
    poly(ctx, [x - 1.5, -102, x + 17, -102, x + 3, -86.5, x - 15.5, -86.5], '#990000', '#1a0000', 1);
  }

  function bar(ctx) {
    // Sticky's: olive roof with a neon name and a big beer-mug sign
    poly(ctx, [-456.5, 41, -265, 41, -265, 387.5, -456.5, 387.5], '#669900', '#1a2700', 1.2);
    poly(ctx, [-456.5, 387.5, -265, 387.5, -277, 400, -456.5, 400], '#3d5900', '#1a2700', 1);
    rect(ctx, -265, 92.5, 55, 49, WALK, '#1a1a1a', 1);
    if (!SKIP.neon) barNeon(ctx, 55);
    beerMug(ctx);
  }
  // The neon "Sticky's" / "Liquor" on the roof: hollow script letters, mirrored and running up
  // the roof like every sign on the original's (flipped) map. n = frame of the original's 70-frame
  // clip. Unlit tubes are dark orange; 5-39 "Sticky's" lights up from the top in 5-frame steps,
  // 40-64 "Liquor" from the bottom, 65-69 everything flashes orange, 70 all lit, 1-4 all off.
  var NEON_OFF = '#cc6600', NEON_ON = '#ffcc00', NEON_FLASH = '#ff9900';
  var STK_LIT = [65, 97, 120, 143, 147, 164, 185]; // lit down to this y from frame 5, 10, ... 35
  var LIQ_LIT = [195, 187, 171.5, 149, 130]; // lit up to this y from frame 40, 45, ... 60
  function barNeon(ctx, n) {
    var stk = n < 5 ? 0 : n < 40 ? STK_LIT[Math.floor((n - 5) / 5)] : 300;
    var liq = n < 40 ? 300 : n < 65 ? LIQ_LIT[Math.floor((n - 40) / 5)] : 0;
    var flash = n >= 65 && n < 70;
    if (n === 70) { stk = 300; liq = 0; }
    neonWords(ctx, flash ? NEON_FLASH : NEON_OFF);
    if (flash) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-300, 0, 40, stk);
    ctx.rect(-340, liq, 44, 300 - liq);
    ctx.clip();
    neonWords(ctx, NEON_ON);
    ctx.restore();
  }
  function neonWords(ctx, col) {
    var o = { font: 'italic 26px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive, ' + SERIF,
      stroke: col, lw: 1.3, m: [0, -1, -1, 0], fitW: 150 };
    label(ctx, "Sticky's", -280, 112, o);
    o.font = o.font.replace('26px', '32px');
    o.fitW = 100;
    label(ctx, 'Liquor', -316, 152, o);
    // the long tail stroke under the words
    line(ctx, [-325, 216, -290, 185], col, 1.4);
  }
  // The big tilted beer mug on Sticky's roof: glass with bubbles, foam, a handle and two legs.
  function beerMug(ctx) {
    var OUT = '#1a1405';
    poly(ctx, [-329, 264, -321, 262, -319, 272, -327, 276], '#666666', OUT, 1);
    poly(ctx, [-329, 306, -321, 304, -319, 314, -327, 318], '#666666', OUT, 1);
    // handle
    ctx.beginPath();
    ctx.moveTo(-266, 262);
    ctx.bezierCurveTo(-256, 290, -262, 318, -282, 322);
    ctx.bezierCurveTo(-298, 325, -305, 318, -300, 308);
    ctx.lineWidth = 9;
    ctx.strokeStyle = OUT;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = '#ffcc00';
    ctx.stroke();
    poly(ctx, [-321, 249, -268, 200, -255, 256, -318, 320], '#ffcc00', OUT, 1.2);
    poly(ctx, [-315, 253, -271, 211, -262, 254, -314, 309], '#b37700', OUT, 1);
    var b = [[-286, 258, 2.4, 4.2], [-302, 262, 1.6, 2.8], [-311, 283, 1.9, 3], [-300, 285, 2.3, 3.6],
      [-278, 264, 1.2, 1.8], [-291, 246, 1, 1.4], [-265, 255, 2, 3], [-278, 228, 1.4, 2]];
    for (var i = 0; i < b.length; i++) ellipse(ctx, b[i][0], b[i][1], b[i][2], b[i][3], '#ffffff', OUT, 0.8, 0.2);
    // foam
    ctx.beginPath();
    ctx.moveTo(-275, 212);
    ctx.bezierCurveTo(-272, 198, -262, 196, -262, 192);
    ctx.bezierCurveTo(-258, 184, -248, 186, -250, 192);
    ctx.bezierCurveTo(-240, 196, -238, 214, -243, 220);
    ctx.bezierCurveTo(-236, 232, -244, 244, -250, 246);
    ctx.bezierCurveTo(-252, 256, -262, 257, -264, 253);
    ctx.lineTo(-262, 246);
    ctx.lineTo(-268, 243);
    ctx.lineTo(-265, 235);
    ctx.lineTo(-271, 231);
    ctx.lineTo(-268, 222);
    ctx.closePath();
    ctx.fillStyle = '#ffffcc';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }

  function casino(ctx) {
    // Silver Lining Casino: a blue C-shaped block with a pit holding two big dice
    var TOP = '#6699ff', OUT = '#3333cc';
    // "Know When to Draw the Line" billboard in front of Sticky's
    poly(ctx, [-457, 401, -270, 395, -306, 444, -457, 444], '#3d4d00');
    poly(ctx, [-456.25, 434.5, -316.25, 434.5, -320.5, 443.75, -456.25, 443.75], '#2e3a00', '#1a1a00', 0.8);
    poly(ctx, [-441.25, 402, -283.75, 402, -316.25, 434.5, -456.25, 434.5, -456.25, 417.5], '#dddddd', '#1a1a1a', 1);
    drunk(ctx);
    var t = { font: 'bold 11.5px ' + SANS, fill: '#ff0000', stroke: '#cc0000', lw: 0.9, m: [1, 0, -0.35, 1] };
    t.fitW = 90;
    label(ctx, 'Know When to', -344, 410, t);
    t.fitW = 88;
    label(ctx, 'Draw the Line', -359, 424.5, t);
    // red carpet and posts
    rect(ctx, -284, 656.7, 74, 61.6, '#ff0000');
    ctx.save();
    ctx.beginPath();
    ctx.rect(-284, 656.7, 74, 61.6);
    ctx.clip();
    ctx.strokeStyle = 'rgba(150,0,0,0.55)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (var k = -330; k < -180; k += 6) { ctx.moveTo(k, 722); ctx.lineTo(k + 60, 652); }
    ctx.stroke();
    ctx.restore();
    // velvet rope posts either side of the carpet (the C hides the ends of the first ones)
    var posts = [-261, -239, -216];
    for (var i = 0; i < posts.length; i++) {
      stanchion(ctx, posts[i], 638);
      stanchion(ctx, posts[i], 708);
    }
    // the C: faces, top, then the pit
    poly(ctx, [-456.7, 555, -400.7, 500, -456.7, 590], '#4884ff', OUT, 1);
    poly(ctx, [-456.7, 690, -400.7, 777.3, -456.7, 833.3], '#3070ff', OUT, 1);
    poly(ctx, [-400.7, 777.3, -233.3, 777.3, -303.3, 847.3, -456.7, 847.3, -456.7, 833.3], '#0044dd', OUT, 1);
    poly(ctx, [-400.7, 500, -233.3, 500, -283.3, 580, -283.3, 700, -233.3, 777.3, -400.7, 777.3, -456.7, 690,
      -456.7, 590], TOP, OUT, 1);
    poly(ctx, [-393.3, 590, -336.7, 521, -326, 521, -361.7, 563, -361.7, 620, -393.3, 650], '#3d7bff', OUT, 1);
    poly(ctx, [-336.7, 521, -266.7, 521, -291.7, 561, -291.7, 621.7, -268.3, 659.3, -339, 659.3, -361.7, 620,
      -361.7, 563, -326, 521], TOP, OUT, 1);
    poly(ctx, [-393.3, 650, -361.7, 620, -339, 659.3, -368.3, 690], '#1f5fff', OUT, 1);
    poly(ctx, [-368.3, 690, -339, 659.3, -268.3, 659.3, -300, 690], '#0044dd', OUT, 1);
    die(ctx, -329, 561, 0);
    die(ctx, -317, 617.5, 1);
    if (!SKIP.spark) {
      sparkle(ctx, -361.7, 619.3, 1);
      sparkle(ctx, -291.7, 646.7, 0.25);
    }
  }
  // A rope post along the carpet: a square bar leaning up to the right, its white cap at (x, y).
  function stanchion(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    line(ctx, [-17, 17, 0, 0], '#1a1a1a', 6, 'butt');
    line(ctx, [-17, 17, 0, 0], '#5c5c5c', 4.4, 'butt');
    line(ctx, [-17.8, 16.2, -0.8, -0.8], '#999999', 1.4, 'butt');
    poly(ctx, [-2.5, -1.5, 1, -4.5, 3.8, -1.5, 0.3, 1.5], '#e6e6e6', '#333', 0.7);
    ctx.restore();
  }
  // A white die in perspective (three faces with pips), about 55 px across.
  var PIPS = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.25, 0.22], [0.5, 0.5], [0.75, 0.78]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.25, 0.22], [0.25, 0.5], [0.25, 0.78], [0.75, 0.22], [0.75, 0.5], [0.75, 0.78]],
  };
  function dieFace(ctx, q, n, shade) {
    poly(ctx, q, shade, '#1a1a1a', 1.2);
    var pts = PIPS[n];
    for (var i = 0; i < pts.length; i++) {
      var u = pts[i][0], v = pts[i][1];
      // bilinear position inside the quad (corners in order a, b, c, d)
      var x = (1 - v) * ((1 - u) * q[0] + u * q[2]) + v * ((1 - u) * q[6] + u * q[4]);
      var y = (1 - v) * ((1 - u) * q[1] + u * q[3]) + v * ((1 - u) * q[7] + u * q[5]);
      var r = n === 1 ? 2.9 : 2.1;
      ellipse(ctx, x, y, r, r * 1.3, '#000', null, 0, 0.5);
    }
  }
  function die(ctx, x, y, which) {
    ctx.save();
    ctx.translate(x, y);
    if (which === 0) {
      dieFace(ctx, [0.7, -24.3, 29, -13.7, 20.7, 9.7, -11, 7.3], 1, '#ffffff');
      dieFace(ctx, [-19.3, -13.7, 0.7, -24.3, -11, 7.3, -27.7, 12.3], 2, '#f7f7f7');
      dieFace(ctx, [-27.7, 12.3, -11, 7.3, 20.7, 9.7, -1, 24], 4, '#eeeeee');
    } else {
      dieFace(ctx, [-14.7, -20.8, 12, -29.2, 23.7, 0.8, -8, 4.2], 1, '#ffffff');
      dieFace(ctx, [-24.7, -0.8, -14.7, -20.8, -8, 4.2, -14.7, 28.5], 3, '#f7f7f7');
      dieFace(ctx, [-8, 4.2, 23.7, 0.8, 13.7, 12.5, -14.7, 28.5], 5, '#eeeeee');
    }
    ctx.restore();
  }
  function sparkle(ctx, x, y, size) {
    if (size <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.moveTo(-3.5, -3.5); ctx.lineTo(3.5, 3.5);
    ctx.moveTo(-3.5, 3.5); ctx.lineTo(3.5, -3.5);
    ctx.stroke();
    ellipse(ctx, 0, 0, 1.6, 1.6, '#fff');
    ctx.restore();
  }
  // The drunk stick figure on the billboard: bottle in hand, green sick face, a puddle.
  function drunk(ctx) {
    poly(ctx, [-441, 405, -426, 401, -419, 404, -412, 403, -412, 407, -419, 408, -426, 412, -440, 412], '#999933', '#333300', 0.8);
    rect(ctx, -436, 404, 5, 6, '#e6e6e6');
    ellipse(ctx, -416, 424.5, 3, 1.5, '#66ccff');
    line(ctx, [-423, 419, -436, 422.5, -442, 421], '#1a1a1a', 1);
    line(ctx, [-436, 422.5, -442, 430], '#1a1a1a', 1);
    line(ctx, [-430, 421, -426, 425, -420, 425], '#1a1a1a', 1);
    line(ctx, [-429, 420.5, -432, 414], '#1a1a1a', 1);
    ellipse(ctx, -415, 415, 6.5, 6.5, '#339933', '#1a1a1a', 1);
    line(ctx, [-418, 412, -416, 414, -418, 414, -416, 412], '#000', 0.7);
    line(ctx, [-413, 413, -411, 415, -413, 415, -411, 413], '#000', 0.7);
    line(ctx, [-417, 418, -413, 418], '#000', 0.8);
  }

  function store(ctx) {
    // Funkytown Five-O convenience store
    poly(ctx, [197.5, 218.5, 457, 218.5, 457, 500, 197.5, 500], '#ffcc00', '#1a1a1a', 1.2);
    ctx.fillStyle = lin(ctx, 141, 0, 197.5, 0, [0, '#ff9900', 1, '#ffa31a']);
    poly(ctx, [197.5, 218.5, 197.5, 500, 141, 556, 141, 275], ctx.fillStyle, '#1a1a1a', 1.2);
    poly(ctx, [197.5, 500, 457, 500, 401, 556, 141, 556], '#d78100', '#1a1a1a', 1.2);
    // windows
    poly(ctx, [141, 350, 174, 319, 174, 402.5, 141, 435], '#00ccff', '#333', 1.2);
    line(ctx, [141, 350, 174, 319, 174, 402.5, 141, 435], '#4d4d4d', 2);
    line(ctx, [141, 392.5, 174, 361], '#4d4d4d', 2);
    line(ctx, [160, 339, 167, 333], '#fff', 0.8);
    line(ctx, [158, 344, 165, 338], '#fff', 0.8);
    line(ctx, [160, 381, 167, 375], '#fff', 0.8);
    if (!SKIP.enter) enterSign(ctx, 5);
    graffiti(ctx, 206, 531);
  }
  // The ENTER neon: `lit` = how many letters glow (0..5).
  function enterSign(ctx, lit) {
    poly(ctx, [177.5, 331, 191.5, 316, 191.5, 380, 177.5, 394], '#2e4d3a', '#1a1a1a', 1);
    var s = 'ENTER';
    for (var i = 0; i < 5; i++) {
      label(ctx, s[i], 184.5, 333 + i * 12 - (i * 0.3), {
        font: 'bold 11px ' + SANS, fill: i < lit ? '#00ff66' : '#1f7a3d', m: [1, -1, 0, 1], rot: Math.PI / 2,
      });
    }
  }
  // The multicoloured "CYCLONE" tag with flames and drips on the store's front, and its signature.
  function graffiti(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    // spiky orange flames along the top of the tag, outlined in black
    ctx.beginPath();
    ctx.moveTo(14, 4);
    for (var i = 0; i < 11; i++) {
      // flame tongues licking up and to the right
      var bx = 18 + i * 10;
      ctx.bezierCurveTo(bx + 1, -8, bx + 3, -13, bx + 9, -17 - (i % 3) * 2);
      ctx.quadraticCurveTo(bx + 6, -10, bx + 10, -6 - (i % 2) * 2);
    }
    ctx.lineTo(128, 4);
    ctx.closePath();
    ctx.fillStyle = '#ff6600';
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
    // pale green drips underneath
    ctx.beginPath();
    ctx.moveTo(2, 10);
    for (i = 0; i < 8; i++) ctx.quadraticCurveTo(7 + i * 11, 24 + (i % 2) * 3, 12 + i * 11, 13);
    ctx.lineTo(92, 9);
    ctx.closePath();
    ctx.fillStyle = '#80cc80';
    ctx.fill();
    ctx.lineWidth = 0.6;
    ctx.stroke();
    var word = 'CYCLONE';
    var cols = ['#0000ff', '#1a1aff', '#6633ff', '#9933ff', '#cc33ff', '#ff33cc', '#ff3399'];
    for (i = 0; i < word.length; i++) {
      label(ctx, word[i], 18 + i * 14.5, 3 + (i % 2 ? -2 : 1.5), { font: 'italic 900 38px ' + SANS, fill: cols[i], stroke: '#1a1a1a',
        lw: 1.6, rot: (i % 3 - 1) * 0.14, m: [1, 0, -0.45, 1], sx: 0.8 });
    }
    // the writer's signature
    label(ctx, 'Cr.MK', 128, 8, { font: 'italic 9px ' + SERIF, fill: '#1a1a1a', rot: -0.2 });
    label(ctx, '2002', 130, 16, { font: 'italic 7px ' + SERIF, fill: '#1a1a1a', rot: -0.2 });
    ctx.restore();
  }

  function pawn(ctx) {
    poly(ctx, [221, 577.5, 457, 577.5, 457, 811, 221, 811], '#9900ff', '#1a1a1a', 1.2);
    poly(ctx, [221, 577.5, 221, 811, 141, 890, 141, 656], '#7400c1', '#1a1a1a', 1.2);
    poly(ctx, [221, 811, 457, 811, 378, 890, 141, 890], '#570091', '#1a1a1a', 1.2);
    label(ctx, 'PAWN SHOP', 205, 648, { font: 'bold 15px Impact, ' + SANS, fill: '#d9d9d9', stroke: '#d9d9d9', lw: 1.1, m: [1, -0.99, 0, 1], rot: Math.PI / 2, fitW: 112 });
    label(ctx, 'BUY AND SELL', 191, 651, { font: 'bold 6.5px Impact, ' + SANS, fill: '#cccccc', stroke: '#cccccc', lw: 0.4, m: [1, -0.99, 0, 1], rot: Math.PI / 2, fitW: 66 });
    // door
    poly(ctx, [141, 688.5, 174, 657.5, 174, 705, 141, 735], '#999999', '#1a1a1a', 1);
    poly(ctx, [143.5, 688, 171.5, 662, 171.5, 704, 143.5, 730], '#ccccff', '#333', 0.8);
    line(ctx, [153, 689, 153, 709], '#666', 2);
    // barred window
    poly(ctx, [147.5, 752, 178.5, 725, 178.5 - 0.5, 832, 147.5, 860], '#00ccff', '#1a1a1a', 1);
    // seven round bars across it, rising to the right, and one upright in front
    for (var i = 0; i < 7; i++) {
      var y = 753 + i * 15;
      line(ctx, [148, y, 180, y - 20], '#262626', 6);
      line(ctx, [148, y, 180, y - 20], '#5c5c5c', 4.2);
      line(ctx, [148.5, y - 1.2, 180.5, y - 21.2], '#9a9a9a', 1.3);
    }
    line(ctx, [162, 730, 162, 852], '#262626', 4.6);
    line(ctx, [162, 730, 162, 852], '#a6a6a6', 2.8);
    line(ctx, [161.5, 731, 161.5, 851], '#d9d9d9', 0.9);
    pawnGraffiti(ctx);
  }
  function pawnGraffiti(ctx) {
    ctx.save();
    // painted on the shop's front face only
    path(ctx, [221, 811, 457, 811, 378, 890, 141, 890]);
    ctx.clip();
    // a white splash with spikes flying off to the left, then tall outlined letters leaning right
    poly(ctx, [262, 824, 214, 826, 236, 834, 190, 840, 228, 846, 176, 858, 230, 858, 196, 872, 240, 866, 226, 878,
      262, 870], '#ffffff');
    var o = { font: 'bold 86px ' + SANS, stroke: '#ffffff', lw: 1.6, m: [1, 0, -0.35, 1], fitW: 205, baseline: 'alphabetic' };
    label(ctx, 'LINE', 315.5, 882, o);
    o.stroke = 'rgba(255,255,255,0.6)';
    o.lw = 0.8;
    o.fitW = 194;
    o.sy = 0.88;
    label(ctx, 'LINE', 317, 879, o);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(292, 832, 6, 0, Math.PI * 2);
    ctx.moveTo(360, 872); ctx.lineTo(372, 880); ctx.lineTo(384, 868);
    ctx.stroke();
    ctx.restore();
  }

  function busDepot(ctx) {
    // parked bus (seen from above, tilted on its side), then the depot
    busSprite(ctx);
    poly(ctx, [662.5, 218.5, 925, 218.5, 925, 361, 662.5, 361], '#1cb5ff', '#072e40', 1.2);
    poly(ctx, [662.5, 218.5, 662.5, 361, 611, 410, 611, 268.5], '#0097df', '#072e40', 1.2);
    poly(ctx, [662.5, 361, 925, 361, 879, 410, 611, 410], '#0072a8', '#072e40', 1.2);
    rect(ctx, 739, 212.5, 59.5, 6, WALK, '#666', 0.8);
  }
  // "BUS DEPOT" on the roof: heavy capitals, mirrored like every sign on the map and leaning
  // right. n = frame of the original's 51-frame clip: 1-15 unlit, 16-31 flickering letter by
  // letter, 32-51 fully lit.
  var BUS_DARK = '#000099', BUS_LIT = '#0000ff', BUS_HALF = '#0033ff';
  function busColors(n) {
    var dep, bus;
    if (n <= 15) {
      dep = [BUS_DARK, BUS_DARK, BUS_DARK, BUS_DARK, BUS_DARK];
      bus = [BUS_DARK, BUS_DARK, BUS_DARK];
    } else if (n <= 31) {
      // D, E, P, O, T: D and E dark and the O pale while it flickers
      dep = [20, 24, 27, 28, 29, 30, 31].indexOf(n) >= 0 ? [BUS_LIT, BUS_LIT, BUS_LIT, BUS_LIT, BUS_LIT] :
        [BUS_DARK, BUS_DARK, BUS_LIT, BUS_HALF, BUS_LIT];
      bus = n === 17 ? [BUS_LIT, BUS_LIT, BUS_LIT] : [BUS_LIT, BUS_LIT, n === 22 || n === 30 ? BUS_HALF : BUS_DARK];
    } else {
      dep = [BUS_LIT, BUS_LIT, BUS_LIT, BUS_LIT, BUS_LIT];
      bus = [BUS_LIT, BUS_LIT, BUS_LIT];
    }
    return { dep: dep, bus: bus };
  }
  function busSign(ctx, n) {
    var c = busColors(n);
    var o = { font: '900 25px ' + SANS, sx: -1, m: [1, 0, -0.35, 1], baseline: 'alphabetic', lw: 1.8 };
    word(ctx, 'DEPOT', 746, 246.5, 135, c.dep, o);
    word(ctx, 'BUS', 876.5, 246.5, 86, c.bus, o);
  }
  // A word drawn letter by letter (each its own fill colour), fitted to width w and centred on x;
  // o.sx = -1 mirrors it, o.m shears it.
  function word(ctx, str, x, y, w, colors, o) {
    ctx.save();
    ctx.translate(x, y);
    if (o.m) ctx.transform(o.m[0], o.m[1], o.m[2], o.m[3], 0, 0);
    ctx.font = o.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = o.baseline || 'middle';
    var total = ctx.measureText(str).width;
    ctx.scale((o.sx || 1) * w / total, 1);
    var cx = -total / 2;
    ctx.lineJoin = 'round';
    for (var i = 0; i < str.length; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillText(str[i], cx, 0);
      if (o.lw) {
        // a stroke in the same colour makes the letters as heavy as the original's
        ctx.lineWidth = o.lw;
        ctx.strokeStyle = colors[i];
        ctx.strokeText(str[i], cx, 0);
      }
      cx += ctx.measureText(str[i]).width;
    }
    ctx.restore();
  }
  // The parked bus, seen from above and tipped onto its side: windows along the right, wheels left.
  function busSprite(ctx) {
    poly(ctx, [487, 245, 502, 229, 504, 228, 504, 410, 487, 410], '#e6e6e6', '#1a1a1a', 1);
    poly(ctx, [492, 239, 499, 232, 499, 410, 492, 410], '#000099');
    poly(ctx, [499, 232, 504, 228, 504, 410, 499, 410], '#f2f2f2');
    poly(ctx, [504, 228, 518.5, 224, 518.5, 410, 504, 410], '#00ccff', '#1a1a1a', 1);
    var d = [233, 266, 294, 325, 354, 382];
    for (var i = 0; i < d.length; i++) {
      line(ctx, [504.5, d[i] + 6, 518, d[i] - 5], '#1a1a1a', 3.2, 'butt');
      line(ctx, [504.5, d[i] + 6, 518, d[i] - 5], '#f2f2f2', 1.8, 'butt');
    }
    line(ctx, [487, 245, 502, 229, 518.5, 224], '#1a1a1a', 1.2);
    wheel(ctx, 492, 273);
    wheel(ctx, 491, 402);
  }
  function wheel(ctx, x, y) {
    ellipse(ctx, x, y, 9, 15.5, '#333', '#000', 1, 0.35);
    ellipse(ctx, x + 0.5, y, 5.5, 10, '#8c8c8c', '#1a1a1a', 0.8, 0.35);
    ctx.save();
    ctx.translate(x + 0.5, y);
    ctx.rotate(0.35);
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 0.8;
    for (var k = 0; k < 5; k++) {
      var a = k * Math.PI * 2 / 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 4, Math.sin(a) * 7.5);
      ctx.stroke();
    }
    ctx.restore();
    ellipse(ctx, x + 0.5, y, 1.4, 2.4, '#e6e6e6', '#333', 0.5, 0.35);
  }

  // Everything is clipped to the ground except the few things that stick out over the edge.
  function clipGround(ctx) {
    path(ctx, SURFACE);
    ctx.clip();
  }

  // ---------------------------------------------------------------------------------------------

  var mapArt = (SRPG.mapArt = {
    // Offscreen canvas bounds in map coordinates: the ground plus its edge bands, the castle's
    // towers and flags above the north edge and the depot sign past the east edge.
    BOUNDS: { x: -1070, y: -970, w: 2020, h: 1940 },

    // Opacity of the cloud picture over the night sky for the hour (the original's
    // clouds._alpha = 100 + 8 * (12 - time), which Flash caps at 100%).
    skyAlpha: function (time) {
      var a = 100 + 8 * (12 - time);
      return Math.max(0, Math.min(100, a)) / 100;
    },

    drawSky: function (ctx, s) {
      // the starry night at the screen's pixel scale (capped at 2) so the stars stay sharp; the soft
      // cloud picture at stage size
      var k = Math.min(2, (SRPG.engine && SRPG.engine.pixelScale) || 1);
      if (!skyNight || skyNightK !== k) {
        skyNight = canvas(Math.ceil(SRPG.W * k), Math.ceil(SRPG.H * k));
        paintNight(skyNight, k);
        skyNightK = k;
      }
      if (!skyDay) {
        skyDay = canvas(SRPG.W, SRPG.H);
        paintDay(skyDay);
      }
      ctx.drawImage(skyNight, 0, 0, SRPG.W, SRPG.H);
      var a = mapArt.skyAlpha(s ? s.time : 8);
      if (a > 0) {
        ctx.globalAlpha = a;
        ctx.drawImage(skyDay, 0, 0, SRPG.W, SRPG.H);
        ctx.globalAlpha = 1;
      }
    },

    // The whole city, in map coordinates. What is shown depends on s.dwelling (mansion at 4,
    // castle at 5); the parked car is a sprite drawn by the city scene.
    drawStatic: function (ctx, s) {
      var dw = s ? s.dwelling : 1;
      drawEdges(ctx);
      path(ctx, SURFACE);
      ctx.fillStyle = GRASS;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#333333';
      ctx.stroke();

      ctx.save();
      clipGround(ctx);
      drawStreets(ctx);
      drawLot(ctx);
      apartment(ctx);
      furniture(ctx);
      mcsticks(ctx);
      bar(ctx);
      casino(ctx);
      uofs(ctx);
      store(ctx);
      pawn(ctx);
      busDepot(ctx);
      ctx.restore();

      // parts that stick out over the edges of the ground
      bank(ctx);
      nli(ctx);
      if (!SKIP.bus) busSign(ctx, 40);
      // (the first entry of MAP.trees is the mansion's little grove, drawn with the mansion)
      MAP.trees.forEach(function (t, i) { if (i > 0) tree(ctx, t.x, t.y, 1); });
      if (dw === 5) castle(ctx);
      if (dw === 4) mansion(ctx);
    },

    // One building on its own (debugging and tests): 'castle' | 'mansion'.
    drawBuilding: function (ctx, name) {
      if (name === 'castle') castle(ctx);
      if (name === 'mansion') mansion(ctx);
    },

    // Animated bits of the map (neon signs, castle flags and guard, casino sparkles), drawn over
    // the static picture every frame, in stage coordinates. frame = SRPG.engine.frame (35 per
    // second). Each piece first repaints its patch of sky and of the city without it.
    drawAnimated: function (ctx, s, frame) {
      var f = frame || 0;
      var dw = s.dwelling;
      for (var i = 0; i < ANIMS.length; i++) {
        var a = ANIMS[i];
        if (a.dwelling && a.dwelling !== dw) continue;
        var sx = s.mapx + a.x, sy = s.mapy + a.y;
        if (sx > SRPG.W || sy > SRPG.H || sx + a.w < 0 || sy + a.h < 0) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, a.w, a.h);
        ctx.clip();
        if (a.sky) mapArt.drawSky(ctx, s);
        ctx.drawImage(basePatch(a, s), sx, sy, a.w, a.h);
        ctx.translate(s.mapx, s.mapy);
        a.draw(ctx, f);
        ctx.restore();
      }
    },
  });

  // The static city without one animated piece, for the patch it is redrawn over. Rendered at the
  // screen's pixel scale (capped at 2), like the city scene's static layer.
  var patches = {};
  function basePatch(a, s) {
    var k = Math.min(2, (SRPG.engine && SRPG.engine.pixelScale) || 1);
    var key = a.id + '|' + s.dwelling + '|' + k;
    var c = patches[key];
    if (c) return c;
    c = canvas(Math.ceil(a.w * k), Math.ceil(a.h * k));
    var x = c.getContext('2d');
    x.scale(k, k);
    x.beginPath();
    x.rect(0, 0, a.w, a.h);
    x.clip();
    x.translate(-a.x, -a.y);
    SKIP[a.id] = true;
    try { mapArt.drawStatic(x, s); } finally { SKIP[a.id] = false; }
    patches[key] = c;
    return c;
  }

  // The casino sparkle that runs round the dice pit (a 49-frame path, 75% opaque) and the ones
  // that pop up around the building (a 40-frame clip); each twinkles on a 9-frame loop.
  var SPARK_PATH = [
    136.35, -150.35, 131, -140.05, 127.8, -133.9, 126.75, -131.85, 120.3, -118.9, 116.95, -111.1, 115.95, -108.45,
    111.2, -93.7, 109.25, -84.05, 108.85, -80.75, 109.15, -62.35, 112.35, -52.3, 113.75, -49.45, 118.5, -41,
    121.65, -36.05, 122.75, -34.4, 130.95, -22.3, 135.55, -14.95, 135.85, -11.55, 117.15, -10.7, 105.9, -10.6,
    102.2, -10.6, 83.55, -10.7, 72.3, -10.9, 68.65, -11.15, 60.6, -20.2, 56.45, -26.3, 55.15, -28.45, 49, -40.85,
    46.05, -48.4, 45.2, -50.95, 41.6, -64.45, 40.2, -73, 39.85, -75.9, 39.6, -95.5, 41.65, -107, 42.75, -110.45,
    47.95, -119.85, 51.65, -125.2, 52.9, -126.95,
  ];
  var TWINKLE = [0.15, 0.45, 0.75, 1, 0.9, 0.7, 0.5, 0.3, 0.15];
  var POP = [ // [x, y, first frame, last frame] of the 40-frame clip
    [-291.35, 647.45, 0, 15], [-245.05, 506.65, 9, 25], [-285.85, 529.85, 14, 30], [-246.65, 771.05, 24, 40],
  ];
  function sparkPath(f) {
    var k = f % 49;
    var n = SPARK_PATH.length / 2;
    var x, y;
    if (k < n) { x = SPARK_PATH[k * 2]; y = SPARK_PATH[k * 2 + 1]; } else {
      // the last few frames carry it back to the start
      var t = (k - n + 1) / (49 - n + 1);
      x = SPARK_PATH[(n - 1) * 2] + (SPARK_PATH[0] - SPARK_PATH[(n - 1) * 2]) * t;
      y = SPARK_PATH[(n - 1) * 2 + 1] + (SPARK_PATH[1] - SPARK_PATH[(n - 1) * 2 + 1]) * t;
    }
    return [-405.1 + x, 670.8 + y];
  }
  function pops(ctx, f, only) {
    var k = f % 40;
    for (var i = 0; i < POP.length; i++) {
      if (only && only.indexOf(i) < 0) continue;
      var p = POP[i];
      if (k >= p[2] && k <= p[3]) sparkle(ctx, p[0], p[1], TWINKLE[(k - p[2]) % 9]);
    }
  }
  var ANIMS = [
    { id: 'enter', x: 174, y: 312, w: 22, h: 87, draw: function (ctx, f) {
      // ENTER lights up a letter at clip frames 10, 20, ... 50, then stays lit to 70
      enterSign(ctx, Math.min(5, Math.floor((f % 70 + 1) / 10)));
    } },
    { id: 'bus', x: 662, y: 222, w: 278, h: 32, sky: true, draw: function (ctx, f) { busSign(ctx, f % 51 + 1); } },
    { id: 'neon', x: -334, y: 30, w: 70, h: 196, draw: function (ctx, f) {
      barNeon(ctx, f % 70 + 1);
      beerMug(ctx); // the mug on the roof sits over the tail of the sign
    } },
    { id: 'spark', x: -374, y: 505, w: 140, h: 172, draw: function (ctx, f) {
      var p = sparkPath(f);
      ctx.globalAlpha = 0.75;
      sparkle(ctx, p[0], p[1], TWINKLE[f % 9]);
      ctx.globalAlpha = 1;
      pops(ctx, f, [0, 2]);
    } },
    { id: 'spark1', x: -256, y: 496, w: 22, h: 22, sky: true, draw: function (ctx, f) { pops(ctx, f, [1]); } },
    { id: 'spark3', x: -258, y: 760, w: 23, h: 23, draw: function (ctx, f) { pops(ctx, f, [3]); } },
    { id: 'flag0', dwelling: 5, x: -250, y: -941, w: 38, h: 26, sky: true, draw: function (ctx, f) { castleFlag(ctx, 0, flagWave(f, 0)); } },
    { id: 'flag1', dwelling: 5, x: -534, y: -888, w: 38, h: 26, sky: true, draw: function (ctx, f) { castleFlag(ctx, 1, flagWave(f, 1)); } },
    { id: 'flag2', dwelling: 5, x: -336, y: -862, w: 38, h: 26, sky: true, draw: function (ctx, f) { castleFlag(ctx, 2, flagWave(f, 2)); } },
    { id: 'guard', dwelling: 5, x: -272, y: -752, w: 22, h: 40, draw: function (ctx, f) { guard(ctx, -260, -744, Math.min(3, Math.floor((f % 11) / 3))); } },
  ];
  // Each flag clip shows four shapes, four frames apiece; at its frame 16 it jumps back to a random
  // frame (gotoAndPlay(random(12)), frame 0 counting as 1). Precomputed per flag with a private
  // seeded generator so drawing never touches the game's random numbers.
  function flagTimeline(seed) {
    var seq = [], n = 1, a = seed;
    while (seq.length < 3000 || n !== 1) {
      seq.push(n);
      n++;
      if (n === 16) {
        a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff;
        n = Math.max(1, (a >> 16) % 12);
      }
    }
    return seq;
  }
  var FLAG_T = [flagTimeline(11), flagTimeline(23), flagTimeline(37)];
  function flagWave(f, i) {
    var t = FLAG_T[i];
    var n = t[f % t.length];
    return [0, 0.8, 0, -0.8][Math.floor((n - 1) / 4)];
  }
})();
