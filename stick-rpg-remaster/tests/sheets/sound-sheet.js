// tests/sheets/sound-sheet.js — owner: W1-S. The sound test page's logic (tests/sheets/sound.html):
// builds the controls from the registries after SR.boot({ scene: false }), and exposes
// window.soundSheet for tests/e2e/audio.test.cjs: analyze(buffer, o) (the objective checks of
// ARCHITECTURE §18), check(kind, id) (render + analyze), chain() (the compressor's latency and the
// unity gain below its threshold), calibrate() (the CPU calibration of tests/perf/calibrate.js, with a
// local stand-in when that file is missing), stress(n) and contact() (the waveform contact sheet).
// Colours come from css/tokens.css custom properties (no colour literals).
(function () {
  'use strict';
  var SR = window.SR;
  var $ = function (id) { return document.querySelector('[data-id="' + id + '"]'); };
  var css = function (name, fb) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  };

  function button(label, onClick, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sb' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.setAttribute('data-id', 'play-' + label);
    b.addEventListener('click', onClick);
    return b;
  }

  // ---- analysis (ARCHITECTURE §18) ----

  var DB = function (x) { return x > 0 ? 20 * Math.log(x) / Math.LN10 : -Infinity; };

  /**
   * The objective checks of one rendered buffer.
   * @param {AudioBuffer} buf
   * @param {object} o { seam (s: the loop seam before latency), latency (s), window (s, ± around the seam) }
   * @returns {object} { seconds, peak, peakDb, rms, rmsDb, maxDiff, maxDiffAt, nan, denormals, first, tail5ms, seamDiff, onset }
   */
  function analyze(buf, o) {
    o = o || {};
    var sr = buf.sampleRate, n = buf.length;
    var peak = 0, sum = 0, nan = 0, den = 0, maxDiff = 0, maxDiffAt = 0, first = 0, tail = 0, onset = -1;
    var seamDiff = null;
    var s0 = -1, s1 = -1;
    if (typeof o.seam === 'number') {
      var at = Math.round((o.seam + (o.latency || 0)) * sr), w = Math.max(1, Math.round((o.window || 0.001) * sr));
      s0 = Math.max(1, at - w); s1 = Math.min(n - 1, at + w);
      seamDiff = 0;
    }
    var tailFrom = Math.max(0, n - Math.round(0.005 * sr));
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var d = buf.getChannelData(c);
      if (Math.abs(d[0]) > first) first = Math.abs(d[0]);
      var prev = d[0];
      for (var i = 0; i < n; i++) {
        var x = d[i];
        if (x !== x) { nan++; continue; }
        var ax = x < 0 ? -x : x;
        if (ax > 0 && ax < 1e-30) den++;
        if (ax > peak) peak = ax;
        if (onset < 0 && ax >= 0.01) onset = i;
        sum += x * x;
        if (i) {
          var df = x - prev; if (df < 0) df = -df;
          if (df > maxDiff) { maxDiff = df; maxDiffAt = i; }
          if (i >= s0 && i <= s1 && df > seamDiff) seamDiff = df;
        }
        if (i >= tailFrom && ax > tail) tail = ax;
        prev = x;
      }
    }
    var rms = Math.sqrt(sum / Math.max(1, n * buf.numberOfChannels));
    return { seconds: n / sr, peak: peak, peakDb: DB(peak), rms: rms, rmsDb: DB(rms), maxDiff: maxDiff,
      maxDiffAt: maxDiffAt / sr, nan: nan, denormals: den, first: first, tail5ms: tail, seamDiff: seamDiff,
      onset: onset < 0 ? null : onset / sr };
  }

  var buffers = {};
  var chainInfo = null;

  /** Measures the master chain on an offline context: the compressor's delay and the gain below its threshold. */
  function chain() {
    if (chainInfo) return Promise.resolve(chainInfo);
    var sr = 44100;
    var oac = new OfflineAudioContext(2, sr, sr);
    var G = SR.audio.engine.buildGraph(oac, { live: false });
    var o = oac.createOscillator();
    o.frequency.value = 440;
    var g = oac.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.setValueAtTime(0.0316, 0.1);           // -30 dBFS, from t = 0.1 s
    o.connect(g); g.connect(G.buses.sfx);
    o.start(0);
    return oac.startRendering().then(function (buf) {
      var d = buf.getChannelData(0), on = -1, s = 0, cnt = 0;
      for (var i = 0; i < d.length; i++) {
        if (on < 0 && Math.abs(d[i]) > 1e-4) on = i;
        if (i > 0.3 * sr) { s += d[i] * d[i]; cnt++; }
      }
      var rms = Math.sqrt(s / cnt);
      chainInfo = { latency: on / sr - 0.1, gain: rms / (0.0316 / Math.SQRT2), gainDb: DB(rms / (0.0316 / Math.SQRT2)) };
      return chainInfo;
    });
  }

  /**
   * Renders one song or sfx offline and returns its analysis (and keeps the buffer for the contact sheet).
   * Songs are rendered for one full order plus one bar; the seam is where the order loops.
   */
  function check(kind, id, opts) {
    opts = opts || {};
    return chain().then(function (ch) {
      var t0 = performance.now();
      return SR.audio.renderOffline(kind, id, opts.seconds, opts).then(function (buf) {
        var ms = performance.now() - t0;
        var o = { latency: ch.latency };
        var info = { kind: kind, id: id, ms: ms };
        if (kind === 'song') {
          var C = SR.audio.tracker.compile(SR.reg.song[id], opts.variant);
          info.once = C.once;
          info.loops = C.loopFrom !== null;
          if (C.loopFrom !== null) o.seam = C.once;
          var mot = (SR.reg.song[id].motif || []).map(function (m) {
            var notes = SR.audio.tracker.motifNotes(SR.reg.song[id], m, opts.variant);
            return { at: m, intervals: notes.map(function (x) { return x - notes[0]; }), ok: SR.audio.tracker.isMotif(notes) };
          });
          info.motif = mot;
          info.problems = SR.audio.validate('song', SR.reg.song[id]);
        } else if (kind === 'sfx') {
          info.loop = !!SR.reg.sfx[id].loop;
          info.length = SR.audio.lengthOf('sfx', id);
          info.problems = SR.audio.validate('sfx', SR.reg.sfx[id]);
        }
        info.stats = SR.audio.engine.lastRender();
        buffers[kind + ':' + id] = buf;
        info.a = analyze(buf, o);
        return info;
      });
    });
  }

  /** Verdicts of the objective test for an analysis (ARCHITECTURE §18). */
  function verdict(info) {
    var a = info.a, fails = [];
    var song = info.kind === 'song';
    if (a.nan) fails.push('NaN');
    if (a.denormals) fails.push('denormals');
    if (song ? a.peak > Math.pow(10, -10 / 20) : a.peak > Math.pow(10, -6 / 20)) fails.push('peak ' + a.peakDb.toFixed(1) + ' dBFS');
    if (!(a.peak > 0.003)) fails.push('silent');
    if (a.maxDiff > 0.25) fails.push('jump ' + a.maxDiff.toFixed(3));
    if (song && !(a.rmsDb >= -30 && a.rmsDb <= -16)) fails.push('RMS ' + a.rmsDb.toFixed(1) + ' dBFS');
    if (song && info.loops && a.seamDiff > 0.05) fails.push('seam ' + a.seamDiff.toFixed(3));
    if (!song && a.first >= 0.01) fails.push('start ' + a.first.toFixed(3));
    if (!song && a.tail5ms >= 0.01) fails.push('end ' + a.tail5ms.toFixed(3));
    if (info.problems && info.problems.length) fails.push(info.problems.length + ' format problems');
    (info.motif || []).forEach(function (m) { if (!m.ok) fails.push('motif ' + m.intervals.join(',')); });
    return fails;
  }

  // ---- the contact sheet ----

  var CELL_W = 280, CELL_H = 74, COLS = 4;

  function drawCell(ctx, x, y, w, h, key, info) {
    var buf = buffers[key];
    var fails = verdict(info);
    ctx.fillStyle = css('--paper-0', 'Canvas');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = fails.length ? css('--danger', 'CanvasText') : css('--ink-300', 'GrayText');
    ctx.lineWidth = fails.length ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    var top = y + 16, wh = h - 30, mid = top + wh / 2;
    ctx.strokeStyle = css('--ink-300', 'GrayText');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 4, mid + 0.5); ctx.lineTo(x + w - 4, mid + 0.5); ctx.stroke();
    // -6 / -10 dBFS guide lines
    var lim = info.kind === 'song' ? Math.pow(10, -10 / 20) : Math.pow(10, -6 / 20);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 4, mid - lim * wh / 2); ctx.lineTo(x + w - 4, mid - lim * wh / 2);
    ctx.moveTo(x + 4, mid + lim * wh / 2); ctx.lineTo(x + w - 4, mid + lim * wh / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (buf) {
      var d = buf.getChannelData(0), n = d.length, cols = w - 8;
      ctx.fillStyle = info.kind === 'song' ? css('--int', 'CanvasText') : css('--primary-600', 'CanvasText');
      for (var cx = 0; cx < cols; cx++) {
        var a = Math.floor(cx * n / cols), b = Math.max(a + 1, Math.floor((cx + 1) * n / cols));
        var lo = 0, hi = 0;
        for (var i = a; i < b; i++) { if (d[i] < lo) lo = d[i]; if (d[i] > hi) hi = d[i]; }
        ctx.fillRect(x + 4 + cx, mid - hi * wh / 2, 1, Math.max(1, (hi - lo) * wh / 2));
      }
      if (info.kind === 'song' && info.loops) {
        var sx = x + 4 + info.once / info.a.seconds * cols;
        ctx.fillStyle = css('--ok', 'CanvasText');
        ctx.fillRect(sx, top, 1, wh);
      }
    }
    ctx.fillStyle = css('--ink-900', 'CanvasText');
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(info.id + (info.loop ? ' (loop)' : ''), x + 5, y + 12);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = fails.length ? css('--danger', 'CanvasText') : css('--ink-700', 'CanvasText');
    var line = 'pk ' + info.a.peakDb.toFixed(1) + ' dB · rms ' + info.a.rmsDb.toFixed(1) + ' · jump ' + info.a.maxDiff.toFixed(3) +
      (info.a.seamDiff !== null ? ' · seam ' + info.a.seamDiff.toFixed(3) : '') + ' · ' + info.a.seconds.toFixed(2) + ' s';
    ctx.fillText(fails.length ? 'FAIL ' + fails.join(', ') : line, x + 5, y + h - 4);
  }

  /** Renders every sfx and song and draws the contact sheet. @returns {Promise<object[]>} the analyses */
  function contact(filter) {
    var list = [];
    Object.keys(SR.reg.song || {}).forEach(function (id) { list.push(['song', id]); });
    Object.keys(SR.reg.sfx || {}).sort().forEach(function (id) { list.push(['sfx', id]); });
    if (filter) list = list.filter(filter);
    var out = [];
    var cv = $('contact');
    var rows = Math.ceil(list.length / COLS);
    cv.width = COLS * CELL_W + 8;
    cv.height = rows * CELL_H + 8;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = css('--paper-1', 'Canvas');
    ctx.fillRect(0, 0, cv.width, cv.height);
    var i = 0;
    function next() {
      if (i >= list.length) { $('render-out').textContent = out.length + ' rendered, ' + out.filter(function (x) { return verdict(x).length; }).length + ' failing'; return Promise.resolve(out); }
      var it = list[i], k = i++;
      return check(it[0], it[1]).then(function (info) {
        out.push(info);
        drawCell(ctx, 4 + (k % COLS) * CELL_W, 4 + Math.floor(k / COLS) * CELL_H, CELL_W - 6, CELL_H - 6, it[0] + ':' + it[1], info);
        $('render-out').textContent = i + ' / ' + list.length;
        return next();
      });
    }
    return next();
  }

  // ---- CPU calibration (ARCHITECTURE §17) ----
  // tests/perf/calibrate.js (W1-Q, loaded by sound.html as window.SRCalibrate) times its fixed
  // workload; the budget scales by measured / reference, clamped 0.5-4. Without it (a checkout that
  // lacks the file) a local stand-in runs: the art sheet's workload, REF_MS its estimated time on the
  // reference machine.

  var REF_MS = 35;
  function calibrate() {
    var C = window.SRCalibrate;
    if (C && typeof C.run === 'function') {
      var r = C.run();
      return { ms: r.ms, ref: r.reference, factor: r.factor, source: 'tests/perf/calibrate.js' };
    }
    var best = Infinity, acc = 0;
    for (var run = 0; run < 5; run++) {
      var t0 = performance.now();
      var a = 1, b = 2, arr = new Float64Array(1024);
      for (var i = 0; i < 1400000; i++) {
        a = (a * 1.000001 + b) % 1000;
        b = Math.sin(a) * 3 + Math.sqrt(i & 1023);
        arr[i & 1023] += a * 0.5;
        acc += arr[(i * 7) & 1023];
      }
      var dt = performance.now() - t0;
      if (dt < best) best = dt;
    }
    window.__calAcc = acc;
    return { ms: best, ref: REF_MS, factor: Math.max(0.5, Math.min(4, best / REF_MS)), source: 'stand-in' };
  }

  // ---- live controls ----

  var loops = {};
  var songButtons = {};

  /** Fires n one-shot sfx at once (the voice stress) and samples the voice count for ms. */
  function stress(n, ms) {
    var names = Object.keys(SR.reg.sfx).filter(function (k) { return !SR.reg.sfx[k].loop; });
    var r = SR.rng.create(7);
    for (var i = 0; i < n; i++) SR.audio.sfx(names[r.int(0, names.length - 1)], { gain: 0.5 });
    var max = SR.audio.stats().voices;
    var t0 = performance.now();
    return new Promise(function (res) {
      (function poll() {
        max = Math.max(max, SR.audio.stats().voices);
        if (performance.now() - t0 < (ms || 800)) setTimeout(poll, 20);
        else res({ fired: n, maxVoices: max, stats: SR.audio.stats() });
      })();
    });
  }

  function build() {
    var songs = $('songs');
    Object.keys(SR.reg.song).filter(function (id) { return id.indexOf('stingers.') !== 0; }).forEach(function (id) {
      var def = SR.reg.song[id];
      var row = document.createElement('div');
      row.className = 'row';
      var b = button(id, function () { SR.audio.music(id, { fade: Number($('fade').value) }); });
      songButtons[id] = b;
      row.appendChild(b);
      Object.keys(def.variants || {}).forEach(function (v) {
        row.appendChild(button(id + ' · ' + v, function () { SR.audio.music(id, { fade: Number($('fade').value), variant: v }); }));
      });
      songs.appendChild(row);
    });
    var st = $('stingers');
    var any = false;
    Object.keys(SR.reg.song).filter(function (id) { return id.indexOf('stingers.') === 0; }).forEach(function (id) {
      any = true;
      st.appendChild(button(id.slice(9), function () { SR.audio.stinger(id); }));
    });
    if (!any) st.textContent = '(none registered yet: W2-Music)';
    $('duck').addEventListener('click', function () { SR.audio.duck(6, 1000); });
    $('duck-hold').addEventListener('click', function () { SR.audio.duck(6, Infinity); });
    $('duck-release').addEventListener('click', function () { SR.audio.duck(0); });
    $('unlock').addEventListener('click', function () { SR.audio.unlock(); });
    $('stop-all').addEventListener('click', function () {
      SR.audio.music(null, { fade: 0.3 });
      Object.keys(loops).forEach(function (k) { loops[k].stop(); delete loops[k]; });
      SR.audio.ambience.list().forEach(function (b) { SR.audio.ambience(b, 0); });
    });

    // Volumes: the session override (SR.audio.setVolume), starting from the settings.
    var vol = $('volumes');
    ['master', 'music', 'sfx', 'ambience', 'ui', 'voice'].forEach(function (bus) {
      var l = document.createElement('label');
      l.className = 'sl';
      var key = bus === 'voice' ? 'audio.sfx' : 'audio.' + bus;
      var v0 = SR.settings && SR.settings.get ? SR.settings.get(key) : 1;
      l.innerHTML = '<span>' + bus + '</span><input type="range" min="0" max="1" step="0.05" value="' + v0 + '"><span>' + Number(v0).toFixed(2) + '</span>';
      var inp = l.querySelector('input'), out = l.querySelectorAll('span')[1];
      inp.setAttribute('data-id', 'vol-' + bus);
      inp.addEventListener('input', function () { out.textContent = Number(inp.value).toFixed(2); SR.audio.setVolume(bus, Number(inp.value)); });
      vol.appendChild(l);
    });
    $('mono').addEventListener('change', function (e) { if (SR.settings && SR.settings.set) SR.settings.set('audio.mono', e.target.checked); });

    SR.audio.listener(0, 0, 1);
    $('horn-left').addEventListener('click', function () { SR.audio.sfx('horn', { x: -500, y: 0 }); });
    $('horn-mid').addEventListener('click', function () { SR.audio.sfx('horn', { x: 0, y: 0 }); });
    $('horn-right').addEventListener('click', function () { SR.audio.sfx('horn', { x: 500, y: 0 }); });
    $('horn-far').addEventListener('click', function () { SR.audio.sfx('horn', { x: 1000, y: 0 }); });
    $('stress').addEventListener('click', function () {
      stress(200).then(function (r) { $('stress-out').textContent = 'max ' + r.maxVoices + ' voices, stolen ' + r.stats.stolen + ', dropped ' + r.stats.dropped; });
    });
    SR.events.on('caption', function (p) {
      var el = $('captions');
      var dir = typeof p.dir === 'number' ? (p.dir < -0.2 ? ' ←' : p.dir > 0.2 ? ' →' : '') : '';
      el.textContent = '[' + SR.text(p.key) + dir + ']\n' + el.textContent;
    });

    var beds = $('beds');
    SR.audio.ambience.list().forEach(function (id) {
      var l = document.createElement('label');
      l.className = 'sl';
      l.innerHTML = '<span>' + id + '</span><input type="range" min="0" max="1" step="0.05" value="0"><span>0</span>';
      var inp = l.querySelector('input'), out = l.querySelectorAll('span')[1];
      inp.setAttribute('data-id', 'bed-' + id);
      inp.addEventListener('change', function () { out.textContent = inp.value; SR.audio.ambience(id, Number(inp.value)); });
      beds.appendChild(l);
    });
    $('clock').addEventListener('change', function (e) { SR.audio.ambience.time(e.target.value === '' ? null : Number(e.target.value)); });

    // SFX buttons, grouped as in ART_AUDIO §13.5 by the recipe's bus and loop flag.
    var groups = {};
    Object.keys(SR.reg.sfx).sort().forEach(function (n) {
      var rec = SR.reg.sfx[n];
      var g = rec.loop ? 'loops' : rec.bus || 'sfx';
      (groups[g] = groups[g] || []).push(n);
    });
    var box = $('sfx');
    ['ui', 'sfx', 'voice', 'ambience', 'loops'].forEach(function (g) {
      if (!groups[g]) return;
      var h = document.createElement('h3');
      h.textContent = g + ' (' + groups[g].length + ')';
      box.appendChild(h);
      var row = document.createElement('div');
      row.className = 'row';
      groups[g].forEach(function (n) {
        var loop = !!SR.reg.sfx[n].loop;
        var b = button(n, function () {
          if (!loop) { SR.audio.sfx(n); return; }
          if (loops[n]) { loops[n].stop(); delete loops[n]; b.classList.remove('on'); }
          else { loops[n] = SR.audio.sfx(n); b.classList.add('on'); }
        }, loop ? 'loop' : '');
        row.appendChild(b);
      });
      box.appendChild(row);
    });
    $('render').addEventListener('click', function () { contact(); });

    setInterval(function () {
      var s = SR.audio.stats();
      var el = $('audio-state');
      el.textContent = s.state;
      el.className = 'state ' + s.state;
      var m = s.music || {};
      Object.keys(songButtons).forEach(function (id) { songButtons[id].classList.toggle('on', m.song === id); });
      $('stats').textContent = 'voices ' + s.voices + ' / ' + s.maxVoices + ' (peak ' + s.peakVoices + ', stolen ' + s.stolen +
        ', dropped ' + s.dropped + ')\nsong ' + (m.song || '-') + (m.variant ? ' · ' + m.variant : '') +
        (m.position ? ' @ ' + m.position.order + ':' + m.position.step : '') + ' gain ' + (m.gain || 0).toFixed(2) +
        '\nduck ' + s.duckDb + ' dB (' + (s.duck || 1).toFixed(2) + ')' + (s.mono ? ' · mono' : '') +
        '\nbeds ' + JSON.stringify(s.ambience || {});
    }, 150);
  }

  window.soundSheet = {
    ready: false, analyze: analyze, check: check, verdict: verdict, chain: chain, contact: contact,
    calibrate: calibrate, stress: stress, buffers: buffers,
  };

  function start() {
    SR.boot({ scene: false });
    build();
    window.soundSheet.ready = true;
    if (/[?&]render\b/.test(location.search)) contact();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
