// js/render/fx.js — owner: W1-G. The #fx layer (ARCHITECTURE §5, §9.1; CONTRACT §11.4, D30):
// scene transitions (pageTurn 350 ms: the outgoing frame folds away diagonally; doorZoom 200 ms of
// zoom toward the door, then the page turn; fade 200 ms; Reduced Motion turns all of them into the
// fade), confetti (120 paper bits, 40 with Reduced Motion), the stamp's 4 px paper jolt, plus the
// world's screen shake and hit flash read by the renderer. SR.render.fx.render() runs every frame
// after the scenes (the loop calls it) and clears #fx when nothing is running.
(function () {
  'use strict';
  var SR = window.SR;

  var PAGE_MS = 350, ZOOM_MS = 200, FADE_MS = 200;
  var FOLD_K = 0.42;             // how far the lifted flap reaches back over the page
  var CONFETTI = 120, CONFETTI_RM = 40, CONFETTI_S = 2.6;
  var JOLT_PX = 4, JOLT_MS = 250;
  var SHAKE_MAX = 6;

  function L() { return SR.render.lib; }

  var tr = null;                 // the running transition
  var bits = [];                 // confetti
  var confettiT0 = -1;
  var jolt = { t0: -1 };
  var shake = { t0: -1, amp: 0, ms: 0 };
  var flash = { t0: -1, ms: 0, a: 0 };
  var dirty = false;
  var capture = null;            // offscreen copy of the outgoing frame
  var ownLoop = 0;

  function nowMs() { return L().now() * 1000; }

  function stage() {
    var S = SR.stage;
    var world = S && S.world ? S.world : typeof document !== 'undefined' ? document.getElementById('world') : null;
    var fx = S && S.fx ? S.fx : typeof document !== 'undefined' ? document.getElementById('fx') : null;
    if (fx && world && (fx.width !== world.width || fx.height !== world.height) && !(S && S.fx)) {
      fx.width = world.width; fx.height = world.height;   // only while the kernel's stage is not managing them
    }
    return { world: world, fx: fx, ctx: fx ? fx.getContext('2d') : null };
  }

  function fast() {
    var D = SR.debug;
    return !!(D && typeof D.fast === 'function' && D.fast() === true);
  }

  /** The loop drives render() each frame; without a running loop (sheets, M0) we drive ourselves. */
  function ensureDriven() {
    var Lp = SR.loop;
    var running = Lp && typeof Lp.pause === 'function' && !Lp.paused;
    if (running || ownLoop || typeof requestAnimationFrame !== 'function') return;
    if (Lp && typeof Lp.pause === 'function' && Lp.paused) return;   // a paused loop: tests step it
    var tick = function () {
      ownLoop = 0;
      render();
      if (busy()) { ownLoop = requestAnimationFrame(tick); }
    };
    ownLoop = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------------------------

  /**
   * Runs a scene transition: captures the outgoing frame on #fx, calls swap() exactly once (the
   * kernel changes the scene stack there), then animates the cut.
   * @param {string} kind 'pageTurn' | 'doorZoom' | 'fade' (Reduced Motion: always 'fade')
   * @param {function()} swap
   * @returns {Promise<void>} resolved when the transition ends
   */
  function transition(kind, swap) {
    if (tr) finish(tr);          // a new transition cuts the running one short
    var st = stage();
    var k = kind === 'doorZoom' || kind === 'fade' || kind === 'pageTurn' ? kind : 'pageTurn';
    if (L().reducedMotion()) k = 'fade';
    var done;
    var p = new Promise(function (res) { done = res; });
    var ok = !!(st.fx && st.world && st.world.width > 0 && st.world.height > 0);
    if (ok && !fast()) {
      if (!capture) capture = document.createElement('canvas');
      if (capture.width !== st.world.width || capture.height !== st.world.height) {
        capture.width = st.world.width; capture.height = st.world.height;
      }
      var cx = capture.getContext('2d');
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, capture.width, capture.height);
      cx.drawImage(st.world, 0, 0);
    }
    try {
      if (typeof swap === 'function') swap();
    } catch (e) {
      console.error('SR.render.fx.transition: swap() threw', e);
    }
    if (!ok || fast()) {
      done();
      return p;
    }
    var focus = null;
    if (k === 'doorZoom') {
      var A = SR.render.actors, pp = A && A.playerPos ? A.playerPos() : null;
      focus = pp && SR.render.toScreen ? SR.render.toScreen(pp.x, pp.y, 26) : { x: SR.W / 2, y: SR.H / 2 };
    }
    tr = { kind: k, t0: nowMs(), resolve: done, focus: focus, dur: k === 'fade' ? FADE_MS : k === 'doorZoom' ? ZOOM_MS + PAGE_MS : PAGE_MS };
    dirty = true;
    render();
    ensureDriven();
    return p;
  }

  function finish(t) {
    if (tr === t) tr = null;
    dirty = true;
    if (t.resolve) { var r = t.resolve; t.resolve = null; r(); }
  }

  /** Clips a polygon (device px) to the half-plane s(p) = p·d ≤ f. */
  function clipHalf(poly, dx, dy, f) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var sa = a[0] * dx + a[1] * dy - f, sb = b[0] * dx + b[1] * dy - f;
      if (sa <= 0) out.push(a);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
        var t = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  function polyPath(ctx, poly) {
    ctx.beginPath();
    for (var i = 0; i < poly.length; i++) { if (i) ctx.lineTo(poly[i][0], poly[i][1]); else ctx.moveTo(poly[i][0], poly[i][1]); }
    ctx.closePath();
  }

  /** The page turn at progress k (0..1): the page folds from the bottom-right corner toward the top-left. */
  function drawPage(ctx, src, W, H, k, zoom) {
    var len = Math.hypot(W, H), dx = W / len, dy = H / len;
    var e = SR.util.easeInOut(k);
    var f = len * (1 - e);                          // the fold line: s = f
    var w = FOLD_K * (len - f);                     // the lifted flap covers [f - w, f]
    var rect = [[0, 0], [W, 0], [W, H], [0, H]];
    var page = clipHalf(rect, dx, dy, f - w);       // the part still lying flat
    ctx.save();
    if (page.length >= 3) {
      polyPath(ctx, page);
      ctx.clip();
      if (zoom) drawZoomed(ctx, src, W, H, zoom); else ctx.drawImage(src, 0, 0);
    }
    ctx.restore();
    // The flap: the back of the paper, shaded toward the fold, with a hard shadow beyond it.
    var flapPoly = clipHalf(rect, dx, dy, f);
    flapPoly = clipHalf(flapPoly.map(function (p) { return [-p[0], -p[1]]; }), dx, dy, -(f - w)).map(function (p) { return [-p[0], -p[1]]; });
    if (flapPoly.length >= 3) {
      ctx.save();
      polyPath(ctx, flapPoly);
      var g = ctx.createLinearGradient((f - w) * dx, (f - w) * dy, f * dx, f * dy);
      var back = L().pal(['paperBack', 'ui.paper-2'], 0.88);
      g.addColorStop(0, L().tone(back, 1));
      g.addColorStop(1, L().tone(back, -1));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = L().pal(['ui.ink-900', 'ink'], 0.1);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = Math.max(1.5, W / 800);
      ctx.stroke();
      ctx.restore();
    }
    // The fold's shadow on the revealed scene.
    var sw = Math.max(12, W * 0.02);
    var shade = clipHalf(rect.map(function (p) { return [-p[0], -p[1]]; }), dx, dy, -f).map(function (p) { return [-p[0], -p[1]]; });
    shade = clipHalf(shade, dx, dy, f + sw);
    if (shade.length >= 3) {
      ctx.save();
      polyPath(ctx, shade);
      var gs = ctx.createLinearGradient(f * dx, f * dy, (f + sw) * dx, (f + sw) * dy);
      var ink = L().pal('ink', 0.1), v = L().chan(ink);
      gs.addColorStop(0, L().hex(v[0], v[1], v[2]) + '59');
      gs.addColorStop(1, L().hex(v[0], v[1], v[2]) + '00');
      ctx.fillStyle = gs;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawZoomed(ctx, src, W, H, z) {
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.scale(z.s, z.s);
    ctx.translate(-z.x, -z.y);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  function drawTransition(ctx, W, H) {
    var t = tr;
    var ms = nowMs() - t.t0;
    if (ms >= t.dur) { finish(t); return false; }
    if (t.kind === 'fade') {
      ctx.globalAlpha = 1 - ms / t.dur;
      ctx.drawImage(capture, 0, 0);
      ctx.globalAlpha = 1;
      return true;
    }
    var zoom = null;
    if (t.kind === 'doorZoom') {
      var sc = W / SR.W;
      var fz = t.focus ? { x: t.focus.x * sc, y: t.focus.y * sc } : { x: W / 2, y: H / 2 };
      var zk = Math.min(1, ms / ZOOM_MS);
      zoom = { x: fz.x, y: fz.y, s: 1 + 0.35 * SR.util.easeIn(zk) };
      if (ms < ZOOM_MS) { drawZoomed(ctx, capture, W, H, zoom); return true; }
      ms -= ZOOM_MS;
    }
    drawPage(ctx, capture, W, H, Math.min(1, ms / PAGE_MS), zoom);
    return true;
  }

  // ---------------------------------------------------------------------------------------------
  // Confetti, jolt, shake, flash
  // ---------------------------------------------------------------------------------------------

  /** Throws confetti over the whole stage (promotions, degrees, the election, day 365). */
  function confetti() {
    var n = L().reducedMotion() ? CONFETTI_RM : CONFETTI;
    var p = SR.art && SR.art.palette;
    var cols = p && p.fx && Array.isArray(p.fx.confetti) && p.fx.confetti.length ? p.fx.confetti : [L().pal(['ui.primary-500', 'lanePaint'], 0.5)];
    var rng = SR.rng.fx;
    bits.length = 0;
    for (var i = 0; i < n; i++) {
      bits.push({
        x: rng.float(0, SR.W), y: rng.float(-SR.H * 0.4, -10), vx: rng.float(-40, 40), vy: rng.float(80, 220),
        rot: rng.float(0, Math.PI * 2), vr: rng.float(-8, 8), w: rng.float(6, 12), h: rng.float(4, 8),
        c: cols[i % cols.length], ph: rng.float(0, 6.28),
      });
    }
    confettiT0 = nowMs();
    dirty = true;
    ensureDriven();
    return n;
  }

  /** The stamp's paper jolt: the stage drops 4 px and springs back (off with Reduced Motion or Screen shake off). */
  function joltFn() {
    if (L().reducedMotion() || L().setting('display.screenShake', true) === false) return false;
    jolt.t0 = nowMs();
    dirty = true;
    ensureDriven();
    return true;
  }

  /** Shakes the world view (a car hit: 4 u for 250 ms; a fight hit: 6 u) unless shake is off. */
  function shakeFn(amp, ms) {
    if (L().reducedMotion() || L().setting('display.screenShake', true) === false) return false;
    shake.t0 = nowMs(); shake.amp = Math.min(SHAKE_MAX, amp || 4); shake.ms = ms || 250;
    return true;
  }

  /** A hit flash over the world (Flash reduction: a softer one). */
  function flashFn(ms, alpha) {
    flash.t0 = nowMs(); flash.ms = ms || 120; flash.a = (alpha || 0.6) * (L().flashReduction() ? 0.35 : 1);
  }

  /** @returns {{x: number, y: number}|null} the current shake offset in world units (the renderer applies it). */
  function offset() {
    if (shake.t0 < 0) return null;
    var ms = nowMs() - shake.t0;
    if (ms >= shake.ms) { shake.t0 = -1; return null; }
    var k = 1 - ms / shake.ms;
    return { x: Math.sin(ms * 0.11) * shake.amp * k, y: Math.cos(ms * 0.087) * shake.amp * k };
  }

  /** @returns {number} the hit flash's alpha now (0 when none). */
  function flashAlpha() {
    if (flash.t0 < 0) return 0;
    var ms = nowMs() - flash.t0;
    if (ms >= flash.ms) { flash.t0 = -1; return 0; }
    return flash.a * (1 - ms / flash.ms);
  }

  function drawConfetti(ctx, W, H) {
    var el = (nowMs() - confettiT0) / 1000;
    if (el > CONFETTI_S) { bits.length = 0; confettiT0 = -1; return false; }
    var sc = W / SR.W;
    ctx.save();
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    var byColour = {};
    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      var x = b.x + b.vx * el + Math.sin(el * 5 + b.ph) * 18, y = b.y + b.vy * el + 60 * el * el;
      if (y > SR.H + 20) continue;
      (byColour[b.c] || (byColour[b.c] = [])).push([x, y, b.rot + b.vr * el, b.w, b.h * Math.abs(Math.cos(el * 6 + b.ph))]);
    }
    ctx.globalAlpha = el > CONFETTI_S - 0.5 ? (CONFETTI_S - el) / 0.5 : 1;
    Object.keys(byColour).forEach(function (c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      byColour[c].forEach(function (q) {
        var ca = Math.cos(q[2]), sa = Math.sin(q[2]), hw = q[3] / 2, hh = Math.max(0.8, q[4] / 2);
        ctx.moveTo(q[0] - ca * hw + sa * hh, q[1] - sa * hw - ca * hh);
        ctx.lineTo(q[0] + ca * hw + sa * hh, q[1] + sa * hw - ca * hh);
        ctx.lineTo(q[0] + ca * hw - sa * hh, q[1] + sa * hw + ca * hh);
        ctx.lineTo(q[0] - ca * hw - sa * hh, q[1] - sa * hw + ca * hh);
        ctx.closePath();
      });
      ctx.fill();
    });
    ctx.restore();
    return true;
  }

  function drawJolt(ctx, st, W, H) {
    var ms = nowMs() - jolt.t0;
    if (ms >= JOLT_MS) { jolt.t0 = -1; return false; }
    // Down 4 px at once, then a damped spring back through zero (a stamp's thud on paper).
    var k = ms / JOLT_MS;
    var dy = Math.round(JOLT_PX * (W / SR.W) * Math.cos(k * Math.PI) * (1 - k) * (1 - k));
    if (dy) {
      ctx.drawImage(st.world, 0, dy);
      // The strip the page lifted off shows the paper's edge.
      ctx.fillStyle = L().pal(['paperEdge', 'ui.paper-1'], 0.93);
      if (dy > 0) ctx.fillRect(0, 0, W, dy); else ctx.fillRect(0, H + dy, W, -dy);
    }
    return true;
  }

  /** @returns {boolean} a transition, confetti or a jolt is running. */
  function busy() { return !!tr || confettiT0 >= 0 || jolt.t0 >= 0; }

  /** Per frame (after the scenes): draws the running transition, confetti and jolt on #fx; clears it when idle. */
  function render() {
    if (!busy() && !dirty) return;
    var st = stage();
    if (!st.ctx) return;
    var ctx = st.ctx, W = st.fx.width, H = st.fx.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var any = false;
    if (tr && capture) any = drawTransition(ctx, W, H) || any;
    if (!tr && jolt.t0 >= 0 && st.world) any = drawJolt(ctx, st, W, H) || any;
    if (confettiT0 >= 0) any = drawConfetti(ctx, W, H) || any;
    ctx.restore();
    dirty = any;
  }

  SR.render.fx = {
    transition: transition,
    confetti: confetti,
    jolt: joltFn,
    shake: shakeFn,
    flash: flashFn,
    offset: offset,
    flashAlpha: flashAlpha,
    render: render,
    busy: busy,
    /** @returns {object} what is running (tests). */
    state: function () { return { transition: tr ? tr.kind : null, confetti: confettiT0 >= 0 ? bits.length : 0, jolt: jolt.t0 >= 0 }; },
  };
})();
