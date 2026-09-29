// js/core/loop.js — owner: W1-K. SR.loop: the main loop (ARCHITECTURE §3; docs/CONTRACT.md §20).
// A fixed 60 Hz simulation step with an accumulator (at most 5 catch-up steps per frame), rendering
// on requestAnimationFrame with the interpolation alpha, an optional 30 fps cap (renders every
// other frame), pause / resume / step(n) for tests, SR.loop.time (seconds of unpaused play), work
// time `perf` over the last 300 frames (CPU time of the update steps and the render calls, and the
// drawImage / fill calls on the stage canvases), and the hidden-tab pause.
// Per step: SR.input.poll → SR.scenes.update(STEP). Per frame: SR.scenes.render(SR.stage.ctx, alpha)
// → SR.render.fx.render() → SR.ui.hud.flush(); each is called only if it exists (D30).
// Load-time clean: requestAnimationFrame and the DOM are used only after boot.
(function () {
  'use strict';
  var SR = window.SR;

  var MAX_CATCHUP = 5;          // steps per frame at most (§3)
  var MAX_FRAME_S = 0.25;       // a longer gap (a breakpoint, a stall) is not simulated
  var PERF_FRAMES = 300;        // perf window (§3)

  var L = {
    running: false, paused: false, hiddenPaused: false, time: 0, steps: 0, acc: 0, last: null,
    frames: 0, raf: 0, fpsCap: 60, draws: { images: 0, fills: 0 }, instrumented: [],
    // ring buffers: update ms, render ms, draw calls, frame timestamps (rendered frames only)
    upd: [], ren: [], img: [], fil: [], ts: [], stepAcc: 0,
  };

  function clock() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
  function call(obj, name, a, b) {
    if (obj && typeof obj[name] === 'function') {
      try { return obj[name](a, b); } catch (e) { if (typeof console !== 'undefined') console.error('SR.loop: ' + name + '() threw', e); }
    }
    return undefined;
  }

  /** Wraps a 2D context's drawImage and fills once so perf.draws counts them (the GPU-load proxy, §17). */
  function instrument(ctx) {
    if (!ctx || L.instrumented.indexOf(ctx) >= 0) return;
    L.instrumented.push(ctx);
    var d = L.draws;
    ['drawImage'].forEach(function (m) {
      var orig = ctx[m];
      if (typeof orig !== 'function') return;
      ctx[m] = function () { d.images++; return orig.apply(this, arguments); };
    });
    ['fill', 'fillRect'].forEach(function (m) {
      var orig = ctx[m];
      if (typeof orig !== 'function') return;
      ctx[m] = function () { d.fills++; return orig.apply(this, arguments); };
    });
  }

  /** One fixed simulation step. */
  function doStep() {
    if (SR.input && typeof SR.input.poll === 'function') call(SR.input, 'poll', SR.STEP);
    if (SR.scenes && typeof SR.scenes.update === 'function') SR.scenes.update(SR.STEP);
    L.time += SR.STEP;
    L.steps++;
  }

  /** One rendered frame: scenes, the fx layer, the batched HUD writes. */
  function renderFrame(alpha) {
    var st = SR.stage;
    var ctx = st && st.ctx ? st.ctx : null;
    if (ctx) {
      instrument(ctx);
      if (st.fxCtx) instrument(st.fxCtx);
      // Scenes draw in logical units; a scene that forgot to restore its transform cannot shift the next frame.
      ctx.setTransform(ctx.canvas.width / SR.W, 0, 0, ctx.canvas.height / SR.H, 0, 0);
      var fx = st.fxCtx;
      if (fx) fx.setTransform(fx.canvas.width / SR.W, 0, 0, fx.canvas.height / SR.H, 0, 0);
    }
    if (SR.scenes && typeof SR.scenes.render === 'function') SR.scenes.render(ctx, alpha);
    if (SR.render && SR.render.fx) call(SR.render.fx, 'render');
    if (SR.ui && SR.ui.hud) call(SR.ui.hud, 'flush');
    if (st && typeof st.tick === 'function') st.tick();
  }

  function push(list, v) { list.push(v); if (list.length > PERF_FRAMES) list.shift(); }

  /**
   * Records one rendered frame's work time and draw counts; `at` (the frame's time) feeds fps and
   * is given only for requestAnimationFrame frames, never for step(n) (tests step at any pace).
   */
  function record(updMs, renMs, at) {
    push(L.upd, updMs);
    push(L.ren, renMs);
    push(L.img, L.draws.images);
    push(L.fil, L.draws.fills);
    if (at !== undefined) push(L.ts, at);
    if (SR.quality && typeof SR.quality.sample === 'function') call(SR.quality, 'sample', updMs + renMs);
  }

  /** The requestAnimationFrame callback. */
  function frame(ts) {
    L.raf = requestAnimationFrame(frame);
    if (L.paused) { L.last = null; return; }
    var t0 = clock();
    if (L.last === null) L.last = ts;
    var dt = Math.min(Math.max((ts - L.last) / 1000, 0), MAX_FRAME_S);
    L.last = ts;
    L.acc += dt;
    var n = 0;
    try {
      while (L.acc >= SR.STEP && n < MAX_CATCHUP) { doStep(); L.acc -= SR.STEP; n++; }
    } catch (e) {
      console.error('SR.loop: step failed', e);
    }
    if (L.acc >= SR.STEP) L.acc = L.acc % SR.STEP;     // drop a backlog the catch-up could not absorb
    var t1 = clock();
    L.stepAcc += t1 - t0;
    L.frames++;
    if (L.fpsCap === 30 && (L.frames & 1)) return;       // 30 fps: render every other animation frame
    L.draws.images = 0; L.draws.fills = 0;
    try {
      renderFrame(L.acc / SR.STEP);
    } catch (e) {
      console.error('SR.loop: render failed', e);
    }
    var t2 = clock();
    record(L.stepAcc, t2 - t1, t2);
    L.stepAcc = 0;
  }

  function pct(list, p) {
    if (!list.length) return 0;
    var a = list.slice().sort(function (x, y) { return x - y; });
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  }
  function round(v) { return Math.round(v * 1000) / 1000; }

  /** @returns {object} { update: {p50, p95}, render: {p50, p95}, fps, draws, drawImages, fills, frames } */
  function perf() {
    var fps = 0;
    if (L.ts.length > 1) {
      var span = (L.ts[L.ts.length - 1] - L.ts[0]) / 1000;
      fps = span > 0 ? (L.ts.length - 1) / span : 0;
    }
    var total = L.img.map(function (v, i) { return v + L.fil[i]; });
    return {
      update: { p50: round(pct(L.upd, 0.5)), p95: round(pct(L.upd, 0.95)) },
      render: { p50: round(pct(L.ren, 0.5)), p95: round(pct(L.ren, 0.95)) },
      fps: Math.round(fps * 10) / 10,
      draws: pct(total, 0.95),
      drawImages: { p50: pct(L.img, 0.5), p95: pct(L.img, 0.95), max: L.img.length ? Math.max.apply(null, L.img) : 0 },
      fills: { p50: pct(L.fil, 0.5), p95: pct(L.fil, 0.95), max: L.fil.length ? Math.max.apply(null, L.fil) : 0 },
      frames: L.upd.length,
    };
  }

  /** Stops simulating and rendering (game time stands still). */
  function pause() { L.paused = true; L.last = null; }
  /** Starts again after pause() (without simulating the time spent paused; fps restarts its window). */
  function resume() { L.paused = false; L.hiddenPaused = false; L.last = null; L.acc = 0; L.ts.length = 0; }

  /**
   * Runs exactly n fixed steps, then renders one frame; works while paused (tests).
   * @param {number=} n steps (default 1)
   * @returns {number} the steps run
   */
  function step(n) {
    n = n === undefined ? 1 : Math.max(0, Math.floor(n));
    var t0 = clock();
    for (var i = 0; i < n; i++) doStep();
    var t1 = clock();
    L.draws.images = 0; L.draws.fills = 0;
    renderFrame(0);
    record(t1 - t0, clock() - t1);
    return n;
  }

  /** Starts requestAnimationFrame (boot); idempotent. */
  function start() {
    if (L.running || typeof requestAnimationFrame !== 'function') return;
    L.running = true;
    L.raf = requestAnimationFrame(frame);
  }

  /** The hidden tab pauses the loop; coming back resumes it and opens the pause overlay in play. */
  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      if (!L.paused) { pause(); L.hiddenPaused = true; }
      return;
    }
    if (!L.hiddenPaused) return;
    resume();
    var top = SR.scenes && SR.scenes.top ? SR.scenes.top() : null;
    if (top && (top.id === 'city' || top.id === 'minigame') && SR.reg.scene.pause) SR.scenes.push('pause');
  }

  SR.loop = {
    pause: pause,
    resume: resume,
    step: step,
    start: start,
  };
  Object.defineProperty(SR.loop, 'time', { enumerable: true, get: function () { return L.time; } });
  Object.defineProperty(SR.loop, 'steps', { enumerable: true, get: function () { return L.steps; } });
  Object.defineProperty(SR.loop, 'paused', { enumerable: true, get: function () { return L.paused; } });
  Object.defineProperty(SR.loop, 'perf', { enumerable: true, get: perf });
  Object.defineProperty(SR.loop, 'fpsCap', {
    enumerable: true,
    get: function () { return L.fpsCap; },
    set: function (v) {
      if (v !== 60 && v !== 30) throw new Error('SR.loop.fpsCap: 60 or 30');
      L.fpsCap = v;
    },
  });

  SR.onBoot(10, function () {
    if (SR.settings) {
      var cap = SR.settings.get('display.fpsCap');
      if (cap === 30 || cap === 60) L.fpsCap = cap;
      SR.events.on('settings:changed', function (p) {
        // A single key, or SR.settings.reset() (key '*', value: every setting).
        var v = !p ? undefined : p.key === 'display.fpsCap' ? p.value
          : p.key === '*' && p.value && p.value.display ? p.value.display.fpsCap : undefined;
        if (v === 30 || v === 60) L.fpsCap = v;
      });
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    start();
  });
})();
