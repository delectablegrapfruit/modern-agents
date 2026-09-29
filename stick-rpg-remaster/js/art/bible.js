// js/art/bible.js — owner: W1-A. SR.art.bible.draw(ctx, opts): the art-bible screen (ART_AUDIO §1),
// one 1280 × 720 page every art package checks its contact sheet against: every palette swatch with
// its name (per group; nested sets as one labelled row with a field legend), the three tones of five
// materials, line weights at zoom 0.8 / 1.0 / 1.25, a sample building with the three door treatments
// (south step, east awning, north porch), a sample stick in 8 poses and every karma band, a sample
// interior corner, 24 icons, the paper grain, the Stamp and a FloatText. The #artbible route
// (js/core/debug.js, W1-K) draws it; tests/sheets/art.html shows it standalone.
// Section labels are text keys ui.bible.* (en-ui.js); until they exist the key's last segment shows.
//
// draw(ctx, opts) — ctx in logical units (1280 × 720); opts.t (seconds) animates the FloatText and
// the stick; default 0.45.
(function () {
  'use strict';
  var SR = window.SR;

  function D() { return SR.art.draw; }
  function col(k) { return SR.art.draw.color(k); }
  function label(key, fallback) {
    if (SR.text && SR.text.has && SR.text.has(key)) return SR.text(key);
    return fallback !== undefined ? fallback : key.split('.').pop();
  }
  // The samples reuse real game strings: the INT stamp (en-prog) and its HUD abbreviation.
  function has(key) { return !!(SR.text && SR.text.has && SR.text.has(key)); }
  function heading(ctx, key, x, y) {
    D().text(ctx, label(key), x, y, { size: 11, weight: 800, color: 'ui.ink-500', upper: true, tracking: 0.08 });
    ctx.fillStyle = col('ui.paper-3');
    ctx.fillRect(x, y + 4, 60, 1.5);
  }
  function chip(ctx, c, x, y, s) {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, s, s);
    ctx.lineWidth = 1;
    ctx.strokeStyle = col('ui.ink-300');
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }
  function leaves(obj) {
    // enumerable string leaves in key order (numbers and functions skipped)
    var out = [];
    Object.keys(obj).forEach(function (k) { if (typeof obj[k] === 'string') out.push([k, obj[k]]); });
    return out;
  }

  // ---- palette ---------------------------------------------------------------------------------------
  function palette(ctx, x0, y0) {
    var P = SR.art.palette;
    heading(ctx, 'ui.bible.palette', x0, y0);
    var y = y0 + 14;
    // world: named swatches, 4 columns
    var world = leaves(P);
    var cw = 110;
    ctx.save();
    for (var i = 0; i < world.length; i++) {
      var cx = x0 + (i % 4) * cw, cy = y + Math.floor(i / 4) * 12;
      chip(ctx, world[i][1], cx, cy, 10);
      D().text(ctx, world[i][0], cx + 13, cy + 9, { size: 9, color: 'ui.ink-700' });
    }
    y += Math.ceil(world.length / 4) * 12 + 6;
    // sky keyframes
    var sky = P.sky;
    var sw = Math.floor(440 / sky.length);
    for (var s = 0; s < sky.length; s++) {
      var g = ctx.createLinearGradient(0, y, 0, y + 30);
      g.addColorStop(0, sky[s].top); g.addColorStop(1, sky[s].horizon);
      ctx.fillStyle = g;
      ctx.fillRect(x0 + s * sw, y, sw - 3, 30);
      chip(ctx, sky[s].ambient, x0 + s * sw, y + 32, 8);
      D().text(ctx, SR.util.pad(sky[s].h, 2) + 'h', x0 + s * sw + 10, y + 40, { size: 8, color: 'ui.ink-700' });
    }
    y += 50;
    // flat groups: label + chips (names in the label order)
    var flat = ['ui', 'karma.good', 'karma.evil', 'npc', 'stick', 'light', 'weather', 'fighter', 'mat', 'acc', 'kit', 'car', 'prop', 'fx'];
    flat.forEach(function (g2) {
      var node = g2.split('.').reduce(function (o, k) { return o[k]; }, P);
      var items = Array.isArray(node) ? node.map(function (v, idx) { return [String(idx), v]; }) : leaves(node);
      if (g2 === 'fx') items = items.concat(P.fx.confetti.map(function (v, idx) { return ['confetti.' + idx, v]; }));
      D().text(ctx, g2, x0, y + 9, { size: 9, weight: 700, color: 'ui.ink-900' });
      var cx2 = x0 + 62, cy2 = y;
      for (var k = 0; k < items.length; k++) {
        if (cx2 > x0 + 430) { cx2 = x0 + 62; cy2 += 11; }
        chip(ctx, items[k][1], cx2, cy2, 9);
        cx2 += 10.5;
      }
      y = cy2 + 12;
    });
    y += 2;
    // nested sets: one row per id, fields in the legend's order
    function nested(group, legend, xs, ys, width) {
      var ids = Object.keys(P[group]);
      D().text(ctx, group + '.<id>: ' + legend.join(' '), xs, ys + 8, { size: 8, weight: 700, color: 'ui.ink-500', maxWidth: width - 4 });
      var yy = ys + 11;
      for (var n = 0; n < ids.length; n++) {
        var set = P[group][ids[n]];
        D().text(ctx, ids[n], xs, yy + 8, { size: 8, color: 'ui.ink-700', maxWidth: 62 });
        var fields = leaves(set);
        for (var f = 0; f < fields.length; f++) chip(ctx, fields[f][1], xs + 64 + f * 9.5, yy, 8.5);
        yy += 9.5;
      }
      return yy;
    }
    var yb = nested('bld', ['walls', 'shade', 'roof', 'trim', '…'], x0, y, 215);
    var yc = nested('city', ['ground', 'base', 'tower', 'roof', 'accent', 'trim', 'window'], x0, yb + 2, 215);
    nested('int', ['wall', 'wallHi', 'wallShade', 'trim', 'floorA', 'floorB', 'counter', 'accent', 'light'], x0 + 222, y, 215);
    ctx.restore();
    return yc;
  }

  // ---- materials, lines, building --------------------------------------------------------------------
  function materials(ctx, x0, y0) {
    heading(ctx, 'ui.bible.materials', x0, y0);
    var mats = Object.keys(SR.art.palette.mat);
    for (var i = 0; i < mats.length; i++) {
      var key = 'mat.' + mats[i], x = x0 + i * 78, y = y0 + 12;
      // a little cube: highlight top, base front, shade side
      var base = col(key);
      D().poly(ctx, [x + 8, y + 12, x + 38, y + 12, x + 48, y + 2, x + 18, y + 2]); ctx.fillStyle = D().tone(base, 1); ctx.fill(); D().inkStroke(ctx, 1.5);
      ctx.beginPath(); ctx.rect(x + 8, y + 12, 30, 26); ctx.fillStyle = base; ctx.fill(); D().inkStroke(ctx, 1.5);
      D().poly(ctx, [x + 38, y + 12, x + 48, y + 2, x + 48, y + 28, x + 38, y + 38]); ctx.fillStyle = D().tone(base, -1); ctx.fill(); D().inkStroke(ctx, 1.5);
      for (var t = -1; t <= 1; t++) chip(ctx, D().tone(base, t), x + 8 + (t + 1) * 14, y + 44, 12);
      D().text(ctx, mats[i], x + 8, y + 70, { size: 9, color: 'ui.ink-700' });
    }
  }

  function lineWeights(ctx, x0, y0) {
    heading(ctx, 'ui.bible.lines', x0, y0);
    var zooms = [0.8, 1, 1.25];
    for (var i = 0; i < zooms.length; i++) {
      var z = zooms[i], x = x0 + i * 92, y = y0 + 14;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(z, z);
      D().poly(ctx, [4, 30, 34, 8, 64, 30, 64, 56, 4, 56]);
      ctx.fillStyle = col('bld.home_apt.walls'); ctx.fill();
      D().inkStroke(ctx, D().lineWidth(ctx, 2));
      ctx.restore();
      D().text(ctx, '×' + z + ' · ' + (2 * z).toFixed(1) + ' u', x, y + 80, { size: 9, color: 'ui.ink-700' });
    }
    // interiors 3 u, details 1 u, UI 2 px
    var lx = x0 + 280, ly = y0 + 22;
    [['3', 3], ['1', 1], ['2px', 2]].forEach(function (w, j) {
      ctx.beginPath(); ctx.moveTo(lx, ly + j * 22); ctx.lineTo(lx + 70, ly + j * 22);
      D().inkStroke(ctx, w[1]);
      D().text(ctx, w[0], lx + 76, ly + j * 22 + 4, { size: 9, color: 'ui.ink-700' });
    });
  }

  // A small building in the city projection (screenY = y - 0.5 z) with a door treatment.
  function building(ctx, x, y, w, dp, h, id, door, s) {
    var pal = 'bld.' + id;
    var fh = h * 0.5 * s, W2 = w * s, Dp = dp * s;
    var roofY = y - fh - Dp;
    D().shadow(ctx, function (g) { g.beginPath(); g.rect(x, roofY, W2, Dp + fh); }, { dx: 5, dy: 6 });
    // south face
    ctx.beginPath(); ctx.rect(x, y - fh, W2, fh); ctx.fillStyle = col(pal + '.walls'); ctx.fill(); D().inkStroke(ctx, 1.5);
    ctx.fillStyle = col(pal + '.shade'); ctx.fillRect(x + 1, y - fh * 0.18, W2 - 2, fh * 0.18 - 1);
    for (var wx = x + 8; wx < x + W2 - 14; wx += 18) { ctx.beginPath(); ctx.rect(wx, y - fh + 6, 10, fh * 0.35); ctx.fillStyle = col('glass'); ctx.fill(); D().inkStroke(ctx, 1); }
    // roof with parapet
    ctx.beginPath(); ctx.rect(x, roofY, W2, Dp); ctx.fillStyle = col(pal + '.roof'); ctx.fill(); D().inkStroke(ctx, 1.5);
    ctx.beginPath(); ctx.rect(x + 3, roofY + 3, W2 - 6, Dp - 6); ctx.strokeStyle = col(pal + '.trim'); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.rect(x + W2 * 0.2, roofY + Dp * 0.3, 10, 8); ctx.fillStyle = col('stone'); ctx.fill(); D().inkStroke(ctx, 1);
    var cx = x + W2 / 2;
    if (door === 'S') {
      ctx.beginPath(); ctx.rect(cx - 7, y - 20, 14, 20); ctx.fillStyle = col(pal + '.trim'); ctx.fill(); D().inkStroke(ctx, 1.5);
      ctx.beginPath(); ctx.rect(cx - 11, y, 22, 4); ctx.fillStyle = col('sidewalkJoint'); ctx.fill(); D().inkStroke(ctx, 1);
      ctx.beginPath(); ctx.rect(cx - 9, y + 6, 18, 7); ctx.fillStyle = col('acc.red'); ctx.fill(); D().inkStroke(ctx, 1);
    } else if (door === 'E') {
      var ax = x + W2, ay = y - fh * 0.9, aw = 32 * s * 1.6;
      ctx.beginPath(); ctx.rect(ax + 2, y - 4, 10, 16); ctx.fillStyle = col('acc.red'); ctx.fill(); D().inkStroke(ctx, 1);
      D().poly(ctx, [ax, ay - 8, ax + aw, ay, ax + aw, ay + 16, ax, ay + 6]);
      ctx.fillStyle = col(pal + '.trim'); ctx.fill(); D().inkStroke(ctx, 1.5);
      for (var st = 0; st < 3; st++) { D().poly(ctx, [ax + st * aw / 3, ay - 8 + st * 8 / 3, ax + (st + 0.5) * aw / 3, ay - 8 + (st + 0.5) * 8 / 3, ax + (st + 0.5) * aw / 3, ay + 6 + (st + 0.5) * 10 / 3, ax + st * aw / 3, ay + 6 + st * 10 / 3]); ctx.fillStyle = col('white'); ctx.fill(); }
      ctx.beginPath(); ctx.rect(ax + aw - 4, ay - 30, 5, 22); ctx.fillStyle = col(pal + '.walls'); ctx.fill(); D().inkStroke(ctx, 1);
    } else if (door === 'N') {
      // annex on the north side with its canopy; the porch on the ground north of it
      var anW = W2 * 0.4, anD = 20 * s * 1.5, anY = roofY;
      ctx.beginPath(); ctx.rect(cx - anW / 2, anY - anD, anW, anD); ctx.fillStyle = col(pal + '.roof'); ctx.fill(); D().inkStroke(ctx, 1.5);
      ctx.beginPath(); ctx.rect(cx - anW / 2 - 2, anY - anD - 5, anW + 4, 6); ctx.fillStyle = col(pal + '.trim'); ctx.fill(); D().inkStroke(ctx, 1.5);
      var py = anY - anD - 8;
      ctx.beginPath(); ctx.rect(cx - 12, py - 8, 24, 5); ctx.fillStyle = col('sidewalkJoint'); ctx.fill(); D().inkStroke(ctx, 1);
      ctx.beginPath(); ctx.rect(cx - 10, py - 18, 20, 8); ctx.fillStyle = col('acc.red'); ctx.fill(); D().inkStroke(ctx, 1);
      ctx.beginPath(); ctx.moveTo(cx + 22, py - 2); ctx.lineTo(cx + 22, py - 26); D().inkStroke(ctx, 2);
      ctx.beginPath(); ctx.rect(cx + 14, py - 34, 18, 12); ctx.fillStyle = col(pal + '.walls'); ctx.fill(); D().inkStroke(ctx, 1);
    }
  }

  function buildings(ctx, x0, y0) {
    heading(ctx, 'ui.bible.doors', x0, y0);
    var s = 0.36;
    building(ctx, x0 + 6, y0 + 150, 300, 220, 160, 'mcsticks', 'S', s);
    building(ctx, x0 + 128, y0 + 150, 260, 220, 160, 'bank', 'E', s);
    building(ctx, x0 + 262, y0 + 150, 300, 200, 120, 'bus', 'N', s);
    ['S', 'E', 'N'].forEach(function (d, i) { D().text(ctx, d, x0 + 40 + i * 128, y0 + 170, { size: 10, weight: 800, color: 'ui.ink-500' }); });
  }

  // ---- sticks, karma, interior, icons, grain, stamp ---------------------------------------------------
  var POSES = ['stand', 'walk0', 'sit', 'cheer0', 'guard', 'punch', 'kick', 'knocked'];
  function sticks(ctx, x0, y0, t) {
    heading(ctx, 'ui.bible.poses', x0, y0);
    for (var i = 0; i < POSES.length; i++) {
      SR.art.stick.draw(ctx, POSES[i], { view: 'side', x: x0 + 22 + i * 46, y: y0 + 104, scale: 0.44, look: i === 0 ? 'player' : 'mel', player: i === 0, karma: 0, mood: i === 3 ? 'happy' : i === 7 ? 'hurt' : 'neutral' });
    }
    // city scale, four facings
    var f = ['down', 'right', 'up', 'left'];
    for (var j = 0; j < 4; j++) SR.art.stick.draw(ctx, 'walk', { x: x0 + 26 + j * 30, y: y0 + 168, facing: f[j], t: t + j * 0.1, player: true, karma: 35 });
    SR.art.stick.draw(ctx, 'idle', { x: x0 + 170, y: y0 + 168, look: 'harold', t: t });
    SR.art.stick.draw(ctx, 'idle', { x: x0 + 200, y: y0 + 168, look: 'kid', t: t });
    SR.art.stick.draw(ctx, 'idle', { x: x0 + 230, y: y0 + 168, look: 'dealer', t: t });
    SR.art.stick.draw(ctx, 'skate', { x: x0 + 272, y: y0 + 168, facing: 'right', mount: 'board', player: true, karma: -45, t: t });
    SR.art.stick.draw(ctx, 'idle', { x: x0 + 318, y: y0 + 168, look: 'preacher', t: t });
    SR.art.stick.draw(ctx, 'idle', { x: x0 + 356, y: y0 + 168, look: 'fighter.9', t: t });
  }

  function karma(ctx, x0, y0) {
    heading(ctx, 'ui.bible.karma', x0, y0);
    var K = SR.art.palette.karma;
    ['good', 'evil'].forEach(function (side, r) {
      for (var i = 0; i < K[side].length; i++) {
        var x = x0 + 12 + i * 38, y = y0 + 22 + r * 26;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fillStyle = K[side][i]; ctx.fill(); D().inkStroke(ctx, 1.5);
        D().text(ctx, (side === 'good' ? '+' : '-') + (i * 10 + (i ? 1 : 0)), x + 12, y + 4, { size: 8, color: 'ui.ink-500' });
      }
    });
  }

  var SAMPLE = null;
  /** @returns {object} the ART_AUDIO §9 McSticks example as an interior def (palette keys only). */
  function sampleInterior() {
    if (SAMPLE) return SAMPLE;
    SAMPLE = {
      wall: { type: 'tiles', color: 'int.mcsticks.wall', trim: 'bld.mcsticks.walls' },
      floor: { type: 'checker', a: 'int.mcsticks.floorA', b: 'int.mcsticks.floorB', perspective: 0.35 },
      window: { x: 60, y: 90, w: 220, h: 140 },
      props: [{ type: 'counter', x: 120, y: 470, w: 520, color: 'bld.mcsticks.walls' },
        { type: 'menuBoard', x: 300, y: 90, items: ['fries', 'burger', 'milkshake'] },
        { type: 'fryer', x: 520, y: 400 }, { type: 'register', x: 200, y: 372, sortY: 470 }],
      owner: { id: 'mel', x: 360, y: 430, pose: 'idle' },
      you: { x: 250, y: 560 },
      lights: [{ x: 300, y: 60, r: 220, color: 'int.mcsticks.light' }],
    };
    return SAMPLE;
  }
  function interiorCorner(ctx, x0, y0, t) {
    heading(ctx, 'ui.bible.interior', x0, y0);
    var r = SR.art.interior.fromDef('bible_mcsticks', sampleInterior());
    var s = 0.36, w = 700 * s, h = 640 * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 + 10, w, h); ctx.clip();
    ctx.translate(x0, y0 + 10);
    ctx.scale(s, s);
    r.drawStatic(ctx, null);
    r.drawAnim(ctx, t, null, { owner: { clip: 'talk' } });
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = col('ui.ink-900'); ctx.strokeRect(x0, y0 + 10, w, h);
  }

  var ICONS = ['money', 'time', 'hp', 'karma', 'heat', 'str', 'int', 'cha', 'fries', 'burger', 'beer', 'slots',
    'bank', 'deposit', 'work', 'promotion', 'study', 'bus', 'election', 'punch', 'guard', 'rain', 'car', 'trophy'];
  function icons(ctx, x0, y0) {
    heading(ctx, 'ui.bible.icons', x0, y0);
    for (var i = 0; i < ICONS.length; i++) SR.art.icon(ctx, ICONS[i], x0 + (i % 8) * 48, y0 + 12 + Math.floor(i / 8) * 42, 36);
  }

  function grain(ctx, x0, y0) {
    heading(ctx, 'ui.bible.grain', x0, y0);
    var y = y0 + 12;
    ctx.fillStyle = col('ui.paper-0'); ctx.fillRect(x0, y, 120, 64);
    SR.art.paper.apply(ctx, x0, y, 120, 64, 0.06);
    ctx.fillStyle = col('grass'); ctx.fillRect(x0 + 128, y, 120, 64);
    SR.art.paper.apply(ctx, x0 + 128, y, 120, 64, 0.06);
    ctx.fillStyle = col('ui.paper-0'); ctx.fillRect(x0 + 256, y, 120, 64);
    SR.art.paper.apply(ctx, x0 + 256, y, 120, 64, 0.6);
    ctx.lineWidth = 1; ctx.strokeStyle = col('ui.paper-3');
    ctx.strokeRect(x0, y, 120, 64); ctx.strokeRect(x0 + 128, y, 120, 64); ctx.strokeRect(x0 + 256, y, 120, 64);
    D().text(ctx, '6 %', x0 + 4, y + 76, { size: 9, color: 'ui.ink-500' });
    D().text(ctx, '6 %', x0 + 132, y + 76, { size: 9, color: 'ui.ink-500' });
    D().text(ctx, '×10', x0 + 260, y + 76, { size: 9, color: 'ui.ink-500' });
  }

  function stampAndFloat(ctx, x0, y0, t) {
    heading(ctx, 'ui.bible.stamp', x0, y0);
    D().stamp(ctx, has('stamp.stats.int') ? SR.text('stamp.stats.int', { n: 2 }) : '+2', x0 + 190, y0 + 46, { size: 24 });
    heading(ctx, 'ui.bible.float', x0, y0 + 90);
    var str = '+2' + (has('reason.stat.int') ? ' ' + SR.text('reason.stat.int') : '');
    D().floatText(ctx, str, x0 + 60, y0 + 140, 'ui.int', 0);
    D().floatText(ctx, str, x0 + 170, y0 + 140, 'ui.money', t % 0.9);
    D().floatText(ctx, '+20 ' + (has('reason.stat.hp') ? SR.text('reason.stat.hp') : ''), x0 + 290, y0 + 140, 'ui.hp', 0.25);
  }

  /**
   * Draws the art-bible page.
   * @param {CanvasRenderingContext2D} ctx logical 1280 × 720
   * @param {{t: number}=} opts
   */
  function draw(ctx, opts) {
    var t = opts && opts.t !== undefined ? opts.t : 0.45;
    ctx.save();
    ctx.fillStyle = col('ui.paper-1');
    ctx.fillRect(0, 0, 1280, 720);
    SR.art.paper.apply(ctx, 0, 0, 1280, 720, 0.04);
    SR.art.logo.draw(ctx, undefined, { x: 118, y: 36, width: 200, tag: false });
    D().text(ctx, label('ui.bible.title', ''), 240, 34, { size: 16, weight: 800, color: 'ui.ink-700', upper: true, tracking: 0.12 });
    palette(ctx, 16, 58);
    materials(ctx, 472, 58);
    lineWeights(ctx, 472, 160);
    buildings(ctx, 472, 270);
    interiorCorner(ctx, 472, 462, t);
    sticks(ctx, 876, 58, t);
    karma(ctx, 876, 250);
    icons(ctx, 876, 318);
    grain(ctx, 876, 462);
    stampAndFloat(ctx, 876, 566, t);
    ctx.restore();
  }

  SR.art.bible = { draw: draw, sampleInterior: sampleInterior };
})();
