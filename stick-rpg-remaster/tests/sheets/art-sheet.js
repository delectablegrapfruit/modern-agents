// tests/sheets/art-sheet.js — owner: W1-A. Shared helpers for the W1-A contact sheets (art, icons,
// actors, kit): test-only text fakes for keys other packages will carry (CONTRACT D27: installed after
// the scripts load and before SR.boot), a HiDPI canvas maker, cell labels, the CPU calibration
// (tests/perf/calibrate.js when the sheet loads it) and the sheet's readiness flag window.__sheet that
// tests/e2e/art.test.cjs waits for.
(function () {
  'use strict';
  var SR = window.SR;

  // Keys W1-A draws but does not own (requested in docs/requests/W1-A.md). Fakes only fill gaps.
  var FAKE_TEXT = {
    'game.title': 'Paper Sky',
    'game.tag': 'a Stick RPG fan remaster',
    'ui.bible.title': 'Art bible',
    'ui.bible.palette': 'Palette',
    'ui.bible.materials': 'Materials',
    'ui.bible.lines': 'Line weights',
    'ui.bible.doors': 'Door treatments',
    'ui.bible.poses': 'Poses and looks',
    'ui.bible.karma': 'Karma bands',
    'ui.bible.interior': 'Interior corner',
    'ui.bible.icons': 'Icons',
    'ui.bible.grain': 'Paper grain',
    'ui.bible.stamp': 'Stamp',
    'ui.bible.float': 'FloatText',
    'bark.preacher.board': 'The Fold is coming',
  };

  function installFakes() {
    var add = {};
    Object.keys(FAKE_TEXT).forEach(function (k) { if (!SR.reg.text[k]) add[k] = FAKE_TEXT[k]; });
    if (Object.keys(add).length) SR.def.text(add);
  }

  var state = { ready: false, errors: [], perf: null, notes: [] };
  window.__sheet = state;
  window.addEventListener('error', function (e) { state.errors.push(String(e.message)); });

  /** Makes a canvas of w × h CSS px at the device pixel ratio; returns its 2D context in CSS px. */
  function canvas(parent, w, h, id) {
    var c = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    if (id) c.setAttribute('data-id', id);
    (parent || document.body).appendChild(c);
    var g = c.getContext('2d');
    g.scale(dpr, dpr);
    return g;
  }

  function label(ctx, str, x, y, o) {
    o = o || {};
    ctx.save();
    ctx.font = (o.weight || 600) + ' ' + (o.size || 11) + 'px system-ui, sans-serif';
    ctx.fillStyle = SR.art.draw.color(o.color || 'ui.ink-500');
    ctx.textAlign = o.align || 'left';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function section(title) {
    var h = document.createElement('h2');
    h.textContent = title;
    document.body.appendChild(h);
    return h;
  }

  function paper(ctx, w, h) {
    ctx.fillStyle = SR.art.draw.color('ui.paper-1');
    ctx.fillRect(0, 0, w, h);
  }

  // The calibration of ARCHITECTURE §17: tests/perf/calibrate.js (W1-Q, loaded by the actors sheet as
  // window.SRCalibrate) times its fixed workload; CPU budgets scale by measured / reference, clamped
  // 0.5-4. Without it (a checkout that lacks the file) a local stand-in runs: its REF_MS is an
  // estimate of the stand-in's time on the reference machine (an i5-1135G7 class laptop).
  var REF_MS = 35;
  function calibrate() {
    var C = window.SRCalibrate;
    if (C && typeof C.run === 'function') {
      var r = C.run();
      return { ms: r.ms, ref: r.reference, factor: r.factor, source: 'tests/perf/calibrate.js' };
    }
    var best = Infinity;
    for (var run = 0; run < 5; run++) {
      var t0 = performance.now();
      var a = 1, b = 2, acc = 0, arr = new Float64Array(1024);
      for (var i = 0; i < 1400000; i++) {
        a = (a * 1.000001 + b) % 1000;
        b = Math.sin(a) * 3 + Math.sqrt(i & 1023);
        arr[i & 1023] += a * 0.5;
        acc += arr[(i * 7) & 1023];
      }
      var dt = performance.now() - t0;
      if (dt < best) best = dt;
      if (acc === 42) state.notes.push('');
    }
    var factor = Math.max(0.5, Math.min(4, best / REF_MS));
    return { ms: best, ref: REF_MS, factor: factor, source: 'stand-in' };
  }

  /**
   * Median time per call of fn over `reps` rounds of n calls (after a warm-up round). With a canvas
   * context `flush`, each round ends by reading one pixel, so the rasterisation Chrome defers is
   * counted too (otherwise a round would only measure the recording of the draw calls).
   */
  function timeIt(fn, n, reps, flush) {
    fn(n);
    if (flush) flush.getImageData(0, 0, 1, 1);
    var times = [];
    for (var r = 0; r < (reps || 5); r++) {
      var t0 = performance.now();
      fn(n);
      if (flush) flush.getImageData(0, 0, 1, 1);
      times.push((performance.now() - t0) / n);
    }
    times.sort(function (x, y) { return x - y; });
    return times[Math.floor(times.length / 2)];
  }

  function boot() {
    installFakes();
    SR.boot({ scene: false });
  }

  window.ArtSheet = { canvas: canvas, label: label, section: section, paper: paper, calibrate: calibrate, timeIt: timeIt,
    boot: boot, state: state, FAKE_TEXT: FAKE_TEXT };
})();
