// js/art/intro.js — owner: W2-Front. The intro cutscene's art (UI §5.4; ART_AUDIO §1, §7, §12):
// SR.art.intro.draw(ctx, t, opts) paints the first four of its five beats in stage units (1280 ×
// 720), in palette keys only:
//   1 desk    a desk at night lit by a lamp; you doodle a city on a sheet of paper;
//   2 doze    you doze off over it (the lamp hums, the Zs rise);
//   3 curl    the sheet curls up and pulls you in as you flatten into ink lines;
//   4 fall    you fall past floating paper cities through the clouds, night turning to morning;
//   5 reveal  (the scene: the real renderer pulls out of your apartment's roof to show the city
//             floating in the sky, then the "Day 1" card).
// BEATS / DURATION give the timeline the scene and the captions follow. opts: { still } (Reduced
// Motion: no drift or spin), { look } (the player's look for the stick). Deterministic: layouts come
// from a stream seeded with a fixed hash, never Math.random.
// Load-time rule: defines functions only (no DOM, canvas or audio until draw is called).
(function () {
  'use strict';
  var SR = window.SR;

  var W = 1280, H = 720;
  var BEATS = [
    { id: 'desk', from: 0, to: 5 },
    { id: 'doze', from: 5, to: 9.5 },
    { id: 'curl', from: 9.5, to: 14 },
    { id: 'fall', from: 14, to: 19.5 },
    { id: 'reveal', from: 19.5, to: 25 },
  ];
  var DURATION = 25;
  var DESK = { x: 620, y: 470, w: 560, h: 34 };          // the desk top (stage units)
  var SHEET = { x: 700, y: 452, w: 250, h: 22 };         // the sheet on it, seen at a slant
  var LAMP = { x: 1040, y: 470 };
  var STICK = { x: 470, y: 600, scale: 1.45 };
  var FALL_CITIES = ['crayonburg', 'gusty', 'glitter', 'pegas'];

  var layout = null;   // the seeded clouds, stars and islands (built once)

  function A() { return SR.art.draw; }
  function col(k) { return A().color(k); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { return SR.util.easeInOut(clamp01(v)); }

  function build() {
    if (layout) return layout;
    var r = SR.rng.create(SR.util.hash('paper-sky', 'intro'));
    layout = { stars: [], clouds: [], doodle: [], islands: [] };
    for (var i = 0; i < 26; i++) layout.stars.push({ x: r.float(0, 1), y: r.float(0, 1), s: r.float(0.8, 2.2) });
    for (var c = 0; c < 16; c++) layout.clouds.push({ x: r.float(-0.1, 1.1), y: r.float(0, 1.4), r: r.float(40, 110), layer: r.int(0, 2) });
    for (var d = 0; d < 9; d++) layout.doodle.push({ x: d / 9, w: r.float(0.06, 0.1), h: r.float(0.35, 1) });
    FALL_CITIES.forEach(function (id, k) { layout.islands.push({ id: id, x: k % 2 ? r.float(0.72, 0.9) : r.float(0.1, 0.28), at: 0.12 + k * 0.23, s: r.float(0.34, 0.5) }); });
    return layout;
  }

  /** @returns {{i: number, id: string, k: number}} the beat at time t and how far into it (0..1). */
  function beatAt(t) {
    for (var i = 0; i < BEATS.length; i++) {
      var b = BEATS[i];
      if (t < b.to || i === BEATS.length - 1) return { i: i, id: b.id, k: clamp01((t - b.from) / (b.to - b.from)) };
    }
    return { i: 0, id: 'desk', k: 0 };
  }

  // ------------------------------------------------------------------------------------------------
  // Beats 1-2: the desk at night
  // ------------------------------------------------------------------------------------------------
  function room(ctx, t, flicker) {
    var L = build();
    ctx.fillStyle = A().mix(col('int.apt.wallShade'), col('sky.0.top'), 0.72);
    ctx.fillRect(0, 0, W, H);
    // the window: the night sky and the moon over the city you do not know yet
    var wx = 120, wy = 90, ww = 300, wh = 220;
    A().roundRect(ctx, wx, wy, ww, wh, 6);
    A().paperFill(ctx, 'sky.0.top');
    ctx.save(); ctx.clip();
    ctx.fillStyle = col('light.star');
    L.stars.forEach(function (s) { ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.3 + s.x * 9)); ctx.fillRect(wx + s.x * ww, wy + s.y * wh, s.s, s.s); });
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(wx + ww * 0.74, wy + wh * 0.3, 26, 0, Math.PI * 2); A().paperFill(ctx, 'light.moon');
    ctx.restore();
    A().roundRect(ctx, wx, wy, ww, wh, 6); A().inkStroke(ctx, 4, { color: 'int.apt.trim' });
    ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
    A().inkStroke(ctx, 3, { color: 'int.apt.trim' });
    // the floor
    ctx.fillStyle = A().mix(col('int.apt.floorB'), col('sky.0.top'), 0.6);
    ctx.fillRect(0, 610, W, H - 610);
    // the lamp's pool of light (gradients are for light only, ART_AUDIO §1.1)
    var g = ctx.createRadialGradient(LAMP.x - 150, DESK.y, 20, LAMP.x - 150, DESK.y, 520);
    g.addColorStop(0, A().alpha(col('light.lamp'), 0.55 * flicker));
    g.addColorStop(1, A().alpha(col('light.lamp'), 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function desk(ctx) {
    var A_ = A();
    A_.shadow(ctx, function (g) { g.beginPath(); g.rect(DESK.x, DESK.y, DESK.w, DESK.h); });
    ctx.beginPath(); ctx.rect(DESK.x + 30, DESK.y + DESK.h, 18, 610 - DESK.y - DESK.h); ctx.rect(DESK.x + DESK.w - 48, DESK.y + DESK.h, 18, 610 - DESK.y - DESK.h);
    A_.paperFill(ctx, 'kit.woodDark'); A_.inkStroke(ctx, 2.5);
    ctx.beginPath(); ctx.rect(DESK.x, DESK.y, DESK.w, DESK.h);
    A_.paperFill(ctx, 'kit.wood'); A_.inkStroke(ctx, 3);
    ctx.beginPath(); ctx.rect(DESK.x, DESK.y, DESK.w, 8); A_.paperFill(ctx, 'kit.woodLight');
    // the chair
    ctx.beginPath(); ctx.rect(STICK.x - 70, 540, 90, 14); ctx.rect(STICK.x - 70, 430, 14, 124); ctx.rect(STICK.x - 64, 554, 10, 56); ctx.rect(STICK.x + 6, 554, 10, 56);
    A_.paperFill(ctx, 'kit.woodDark'); A_.inkStroke(ctx, 2.5);
  }

  function lamp(ctx, flicker) {
    var A_ = A();
    ctx.beginPath(); ctx.ellipse(LAMP.x, LAMP.y - 4, 44, 10, 0, 0, Math.PI * 2); A_.paperFill(ctx, 'kit.metalDark'); A_.inkStroke(ctx, 2.5);
    ctx.beginPath(); ctx.moveTo(LAMP.x, LAMP.y - 8); ctx.lineTo(LAMP.x + 20, LAMP.y - 150); ctx.lineTo(LAMP.x - 60, LAMP.y - 210);
    A_.inkStroke(ctx, 7, { color: 'kit.metal' });
    ctx.beginPath(); ctx.moveTo(LAMP.x - 60, LAMP.y - 210); ctx.lineTo(LAMP.x - 140, LAMP.y - 170); ctx.lineTo(LAMP.x - 90, LAMP.y - 130); ctx.closePath();
    A_.paperFill(ctx, 'kit.brass'); A_.inkStroke(ctx, 3);
    ctx.beginPath(); ctx.arc(LAMP.x - 110, LAMP.y - 146, 9, 0, Math.PI * 2);
    ctx.fillStyle = A_.alpha(col('light.lamp'), 0.6 + 0.4 * flicker); ctx.fill();
  }

  /** The sheet on the desk with a doodled city; `k` of it is drawn (you are still doodling). */
  function sheet(ctx, k) {
    var L = build(), A_ = A();
    var x0 = SHEET.x, y0 = SHEET.y, w = SHEET.w, hh = SHEET.h;
    A_.poly(ctx, [x0 + 16, y0, x0 + w - 10, y0, x0 + w + 8, y0 + hh, x0 - 6, y0 + hh]);
    A_.paperFill(ctx, 'kit.paper'); A_.inkStroke(ctx, 2);
    ctx.save();
    ctx.beginPath();
    var n = Math.floor(L.doodle.length * clamp01(k));
    for (var i = 0; i < n; i++) {
      var d = L.doodle[i], bx = x0 + 18 + d.x * (w - 36), bw = d.w * w * 0.8, bh = d.h * 13;
      ctx.rect(bx, y0 + hh - 4 - bh, bw, bh);
    }
    ctx.moveTo(x0 + 10, y0 + hh - 3); ctx.lineTo(x0 + 10 + (w - 16) * clamp01(k), y0 + hh - 3);
    A_.inkStroke(ctx, 1.2);
    ctx.restore();
  }

  function stick(ctx, pose, t, o, extra) {
    if (!SR.art.stick || typeof SR.art.stick.draw !== 'function') return;
    var opts = { x: STICK.x, y: STICK.y, view: 'side', facing: 'right', scale: STICK.scale, player: true, karma: 0, t: t, shadow: false };
    if (o && o.look) opts.look = o.look;
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) opts[k] = extra[k];
    try { SR.art.stick.draw(ctx, pose, opts); } catch (e) { SR.util.warnOnce('intro.stick', 'SR.art.intro: the stick could not be drawn (' + e.message + ')'); }
  }

  function zzz(ctx, k, t) {
    var A_ = A();
    for (var i = 0; i < 3; i++) {
      var p = (k * 2 + i / 3) % 1;
      var x = STICK.x + 40 + p * 90 + Math.sin(t * 2 + i) * 6, y = STICK.y - 150 - p * 120;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      A_.text(ctx, SR.text('front.intro.z'), x, y, { size: 22 + i * 8, role: 'display', color: 'ui.ink-700', upper: false });
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------------------------------------
  // Beat 3: the sheet curls up and pulls you in
  // ------------------------------------------------------------------------------------------------
  function curl(ctx, k, t, o) {
    var A_ = A();
    var e = ease(k);
    room(ctx, t, 1 - e * 0.6);
    desk(ctx);
    lamp(ctx, 1);
    // the stick flattens toward the sheet: squashed, then streaks of ink
    ctx.save();
    ctx.translate(STICK.x + e * 180, STICK.y - e * 130);
    ctx.scale(1 - e * 0.6, 1 - e * 0.92);
    ctx.translate(-STICK.x, -STICK.y);
    ctx.globalAlpha = 1 - clamp01((k - 0.6) / 0.4);
    stick(ctx, 'sit', t, o, { mood: 'surprised' });
    ctx.restore();
    ctx.beginPath();
    for (var i = 0; i < 7; i++) {
      var yy = STICK.y - 160 + i * 18, len = e * 260;
      ctx.moveTo(STICK.x + 20 + e * 120, yy); ctx.quadraticCurveTo(STICK.x + 140 + len * 0.3, yy - 20, STICK.x + 60 + len, yy - 40 * e);
    }
    A_.inkStroke(ctx, 2, { alpha: e * 0.8 });
    // the sheet rises and curls over the whole frame
    var lift = e * (SHEET.y + 60);
    var left = SHEET.x - e * SHEET.x, right = SHEET.x + SHEET.w + e * (W - SHEET.x - SHEET.w);
    var bottom = SHEET.y + SHEET.h + e * (H - SHEET.y - SHEET.h);
    var top = SHEET.y - lift;
    var curlR = 60 + (1 - e) * 60;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, top + curlR);
    ctx.quadraticCurveTo(left, top, left + curlR, top);
    ctx.lineTo(right - curlR, top);
    ctx.quadraticCurveTo(right, top - curlR * (1 - e), right, top + curlR);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    ctx.globalAlpha = 0.35 + 0.65 * e;
    A_.paperFill(ctx, 'ui.paper-0');
    ctx.globalAlpha = 1;
    A_.inkStroke(ctx, 3, { alpha: 1 - e * 0.7 });
    // the curled corner
    ctx.beginPath(); ctx.arc(right - curlR * 0.5, top + curlR * 0.5, curlR * 0.5, -Math.PI / 2, Math.PI, true);
    A_.inkStroke(ctx, 3, { alpha: 1 - e });
  }

  // ------------------------------------------------------------------------------------------------
  // Beat 4: the fall past floating paper cities
  // ------------------------------------------------------------------------------------------------
  function sky(ctx, k) {
    var A_ = A();
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, A_.mix(col('sky.1.top'), col('sky.3.top'), k));
    g.addColorStop(1, A_.mix(col('sky.1.horizon'), col('sky.3.horizon'), k));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function cloud(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2); ctx.arc(x + r * 0.9, y + r * 0.2, r * 0.75, 0, Math.PI * 2); ctx.arc(x - r * 0.9, y + r * 0.25, r * 0.7, 0, Math.PI * 2);
    A().paperFill(ctx, 'cloud');
    A().inkStroke(ctx, 2, { color: 'cloudLine' });
  }

  function fallBeat(ctx, k, t, o) {
    var L = build(), A_ = A();
    var still = o && o.still;
    sky(ctx, k);
    var scroll = still ? 0 : k * 1.6;
    [0, 1].forEach(function (layer) {
      L.clouds.forEach(function (c) {
        if (c.layer !== layer) return;
        var y = ((c.y - scroll * (0.6 + layer * 0.5)) % 1.4 + 1.4) % 1.4 - 0.2;
        cloud(ctx, c.x * W, y * H, c.r * (0.7 + layer * 0.2));
      });
    });
    var island = SR.reg.interior && SR.reg.interior.trip && SR.reg.interior.trip.fns && SR.reg.interior.trip.fns.island;
    L.islands.forEach(function (it) {
      var y = H * 1.25 - (k - it.at + 0.3) * H * 2.2;
      if (y < -200 || y > H + 260) return;
      if (typeof island === 'function') {
        try { island(ctx, it.id, it.x * W, y, it.s, t, { night: k < 0.4, still: still }); return; } catch (e) { SR.util.warnOnce('intro.island', 'SR.art.intro: island painter failed (' + e.message + ')'); }
      }
      A_.poly(ctx, [it.x * W - 150, y, it.x * W + 150, y, it.x * W + 110, y + 40, it.x * W, y + 90, it.x * W - 110, y + 40]);
      A_.paperFill(ctx, 'city.' + it.id + '.ground'); A_.inkStroke(ctx, 2.5);
    });
    ctx.save();
    ctx.translate(W / 2 + (still ? 0 : Math.sin(t * 1.7) * 30), H * 0.46);
    if (!still) ctx.rotate(t * 2.4);
    ctx.translate(-W / 2, -H * 0.46);
    if (SR.art.stick && typeof SR.art.stick.draw === 'function') {
      try {
        SR.art.stick.draw(ctx, 'fall', { x: W / 2, y: H * 0.46, view: 'side', facing: 'right', scale: 1.3, player: true, karma: 0, t: t, anchor: 'hip', shadow: false, look: o && o.look });
      } catch (e) { SR.util.warnOnce('intro.fall', 'SR.art.intro: the falling stick could not be drawn (' + e.message + ')'); }
    }
    ctx.restore();
    // wind streaks rushing up
    if (!still) {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) { var x = (i * 211 + 90) % W, y0 = ((i * 137 - t * 900) % H + H) % H; ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 60); }
      A_.inkStroke(ctx, 2, { color: 'white', alpha: 0.6 });
    }
  }

  /**
   * Draws the intro at time t (seconds) for the beats 1-4; beat 5 is the scene's (the renderer).
   * @param {CanvasRenderingContext2D} ctx in stage units
   * @param {number} t
   * @param {{still: boolean, look: object}=} o
   * @returns {{i: number, id: string, k: number}} the beat drawn
   */
  function draw(ctx, t, o) {
    o = o || {};
    var b = beatAt(t);
    ctx.save();
    if (b.id === 'desk' || b.id === 'doze') {
      var doze = b.id === 'doze';
      var flicker = doze && !o.still ? 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 3.1) : 1;
      room(ctx, t, flicker);
      desk(ctx);
      lamp(ctx, flicker);
      sheet(ctx, doze ? 1 : b.k * 1.2);
      stick(ctx, doze ? 'sit' : 'study', o.still ? 0 : t, o, doze ? { mood: 'sleep', rot: -0.12 * ease(b.k * 2) } : { mood: 'happy' });
      if (doze) zzz(ctx, b.k, t);
    } else if (b.id === 'curl') {
      curl(ctx, b.k, t, o);
    } else if (b.id === 'fall') {
      fallBeat(ctx, b.k, t, o);
    }
    ctx.restore();
    return b;
  }

  SR.art.intro = { draw: draw, beatAt: beatAt, BEATS: BEATS, DURATION: DURATION };
})();
