// js/audio/synth.js — owner: W1-S. SR.audio.synth: the voices (ARCHITECTURE §12; ART_AUDIO §13.2):
// oscillators, noise, biquads and ADSR gains built on any BaseAudioContext (the live one or an
// OfflineAudioContext), the instrument presets of ART_AUDIO §13.2 (bass, slap, lead, whistle, keys,
// clav, pluck, pad, brass, bell, vibes, organ, harmonica and the kit's nine drums), the SFX layer
// builder of the frozen recipe format (CONTRACT §14.3), Karplus-Strong plucks and the shared noise.
//
// Rules every voice follows, so the objective audio test (ARCHITECTURE §18) holds:
// - the envelope gain is the LAST node of a layer (after its filter), and every envelope ends with a
//   linear ramp to exactly 0, so filter tails and exponential decays never leave denormals behind;
// - attacks are ≥ 5 ms (drums 3-5 ms) and a stolen voice fades over 8 ms (no clicks);
// - noise is generated from a fixed seed (xorshift32), so offline renders are reproducible and no
//   browser random source is used.
// Render cost (ARCHITECTURE §17: ≤ 3 % of real time) is kept down by building a chord as one voice
// (per-note sources into one shared filter and envelope), by sharing the vibrato / PWM / tremolo
// LFOs per context, by music voices having no gate node, and by stopping each layer's sources when
// its own envelope ends.
// Load-time clean: nothing touches the audio API until a function is called.
(function () {
  'use strict';
  var SR = window.SR;

  var MIN_ENV = 0.005;          // ART_AUDIO §13.8: attacks ≥ 5 ms (no clicks); also the final ramp to 0
  var FLOOR = 0.001;            // exponential decays go to -60 dB, then ramp linearly to 0 in MIN_ENV
  var NOISE_SECONDS = 2;        // ARCHITECTURE §12: one shared 2 s white-noise buffer
  var NOISE_SEED = 0x5eed1234;
  var STEAL_FADE = 0.008;       // a stolen voice fades out over 8 ms
  var PLUCK_SECONDS = 1.6;      // Karplus-Strong buffers: length and the fade at their end
  var PLUCK_FADE = 0.06;
  var PLUCK_BURST = 0.004;      // ART_AUDIO §13.2: a 4 ms noise burst
  var PLUCK_FEEDBACK = 0.98;    // ... into a delay line with lowpass feedback 0.98
  var PULSE_HARMONICS = 64;

  // Per-context caches (noise buffers, pulse waves, pluck buffers).
  var caches = typeof WeakMap === 'function' ? new WeakMap() : null;
  function cache(ac) {
    var c = caches && caches.get(ac);
    if (!c) { c = { waves: {}, pluck: {} }; if (caches) caches.set(ac, c); else ac.__srCache = c; }
    return caches ? c : (ac.__srCache || c);
  }

  /** @returns {function(): number} a deterministic generator in [-1, 1) (xorshift32). */
  function xorshift(seed) {
    var x = (seed >>> 0) || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      return x / 2147483648 - 1;
    };
  }

  /** @returns {AudioBuffer} the shared white or pink noise buffer of this context (2 s, mono). */
  function noiseBuffer(ac, kind) {
    var c = cache(ac);
    var key = kind === 'pink' ? 'pink' : 'white';
    if (c[key]) return c[key];
    var n = Math.round(ac.sampleRate * NOISE_SECONDS);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    var r = xorshift(NOISE_SEED + (key === 'pink' ? 7 : 0));
    var i;
    if (key === 'white') {
      for (i = 0; i < n; i++) d[i] = r();
    } else {
      // Paul Kellet's economy pink filter, normalised to a peak of 1.
      var b0 = 0, b1 = 0, b2 = 0, peak = 0, w, v;
      for (i = 0; i < n; i++) {
        w = r();
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        v = b0 + b1 + b2 + w * 0.1848;
        d[i] = v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      for (i = 0; i < n; i++) d[i] /= peak;
    }
    c[key] = buf;
    return buf;
  }

  /** @returns {PeriodicWave} a band-limited pulse of the given duty (0..1), cached per context. */
  function pulseWave(ac, duty) {
    var dty = Math.max(0.01, Math.min(0.99, duty === undefined ? 0.5 : duty));
    var key = dty.toFixed(3);
    var c = cache(ac);
    if (c.waves[key]) return c.waves[key];
    var re = new Float32Array(PULSE_HARMONICS + 1), im = new Float32Array(PULSE_HARMONICS + 1);
    for (var k = 1; k <= PULSE_HARMONICS; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * dty);
    c.waves[key] = ac.createPeriodicWave(re, im);
    return c.waves[key];
  }

  /**
   * A Karplus-Strong string at freq, computed once per context into a buffer (a DelayNode cannot
   * hold a period shorter than one render quantum inside a feedback loop, so the delay line runs in
   * JS). Returns { buffer, rate }: play the buffer at `rate` for exact tuning.
   */
  function pluckBuffer(ac, freq) {
    var sr = ac.sampleRate;
    var f = Math.max(20, Math.min(4000, freq));
    var c = cache(ac);
    var key = f.toFixed(2);
    if (c.pluck[key]) return c.pluck[key];
    var period = sr / f;
    var N = Math.max(2, Math.floor(period - 0.5));    // the two-point average adds half a sample
    var n = Math.round(sr * PLUCK_SECONDS);
    var buf = ac.createBuffer(1, n, sr);
    var y = buf.getChannelData(0);
    var r = xorshift(NOISE_SEED ^ Math.round(f * 100));
    var burst = Math.round(sr * PLUCK_BURST);
    var fade = Math.round(sr * PLUCK_FADE);
    var lp = 0, peak = 0, i, e, a, b;
    for (i = 0; i < n; i++) {
      e = 0;
      if (i < burst) { lp = lp * 0.5 + r() * 0.5; e = lp; }      // a softened noise burst
      a = i - N >= 0 ? y[i - N] : 0;
      b = i - N - 1 >= 0 ? y[i - N - 1] : 0;
      y[i] = e + PLUCK_FEEDBACK * 0.5 * (a + b);
      if (Math.abs(y[i]) > peak) peak = Math.abs(y[i]);
    }
    var norm = peak > 0 ? 0.9 / peak : 1;
    for (i = 0; i < n; i++) {
      var k = i >= n - fade ? (n - 1 - i) / fade : 1;     // fade the tail to exactly 0 at the end
      y[i] *= norm * k;
    }
    c.pluck[key] = { buffer: buf, rate: period / (N + 0.5) };
    return c.pluck[key];
  }

  /** A saw and its inverse as matching periodic waves (the lead's pulse is their difference). */
  function sawWave(ac, inverted) {
    var c = cache(ac);
    var key = inverted ? 'isaw' : 'saw';
    if (c.waves[key]) return c.waves[key];
    var re = new Float32Array(PULSE_HARMONICS + 1), im = new Float32Array(PULSE_HARMONICS + 1);
    for (var k = 1; k <= PULSE_HARMONICS; k++) im[k] = (inverted ? -1 : 1) * (k % 2 ? 1 : -1) * 2 / (k * Math.PI);
    c.waves[key] = ac.createPeriodicWave(re, im);
    return c.waves[key];
  }

  /** Harmonics 1, 2, 3 at the given amplitudes as one wave (the organ's three sines). */
  function organWave(ac) {
    var c = cache(ac);
    if (c.waves.organ) return c.waves.organ;
    var re = new Float32Array(4), im = new Float32Array([0, 0.55, 0.3, 0.18]);
    c.waves.organ = ac.createPeriodicWave(re, im);
    return c.waves.organ;
  }

  /**
   * A shared sine LFO at `rate` Hz, running for the life of the context (one per rate, so every
   * note's vibrato or PWM reads the same oscillator through its own depth gain).
   */
  function sharedLfo(ac, rate) {
    var c = cache(ac);
    c.lfos = c.lfos || {};
    var key = String(rate);
    if (c.lfos[key]) return c.lfos[key];
    var o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = rate;
    o.start(ac.currentTime);
    c.lfos[key] = o;
    return o;
  }

  /** @returns {number} Hz of a MIDI note (A4 = 69 = 440 Hz). */
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---- voices ----

  /**
   * A new voice. With a gate (sfx: volume control, stealing), its envelopes end in a GainNode at
   * v.vol; without one (music notes), they connect straight to dest and a steal fades the
   * envelopes themselves.
   * @returns {object} the voice { t0, end, priority, gate, out, nodes, srcs, tune, envs, links, vol, loop, done }
   */
  function newVoice(ac, dest, t0, priority, withGate) {
    var gate = null;
    if (withGate !== false) {
      gate = ac.createGain();
      gate.gain.value = 1;
      gate.connect(dest);
    }
    return { ac: ac, t0: t0, end: t0, priority: priority || 0, gate: gate, out: gate || dest,
      nodes: gate ? [gate] : [], srcs: [], tune: [], envs: [], links: [], vol: 1, loop: false, done: false };
  }

  function track(v, node) { v.nodes.push(node); return node; }

  function gainNode(ac, v, value) {
    var g = ac.createGain();
    g.gain.value = value === undefined ? 1 : value;
    return track(v, g);
  }

  function filterNode(ac, v, type, freq, q) {
    var f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    return track(v, f);
  }

  function addSrc(v, s, tune, base) {
    track(v, s);
    v.srcs.push(s);
    if (tune) v.tune.push({ p: tune, base: base });
    return s;
  }

  /** An oscillator (type 'saw' → sawtooth, 'pulse' → a periodic wave, or a PeriodicWave) started at t. */
  function oscNode(ac, v, type, freq, t, duty, tune) {
    var o = ac.createOscillator();
    if (typeof type === 'object' && type) o.setPeriodicWave(type);
    else if (type === 'pulse') o.setPeriodicWave(pulseWave(ac, duty));
    else o.type = type === 'saw' ? 'sawtooth' : type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    return addSrc(v, o, tune === false ? null : o.frequency, freq);
  }

  /** A looping noise source ('white' | 'pink') started at t from a varied offset. */
  function noiseNode(ac, v, kind, t, rate) {
    var s = ac.createBufferSource();
    s.buffer = noiseBuffer(ac, kind);
    s.loop = true;
    if (rate && rate !== 1) s.playbackRate.setValueAtTime(rate, t);
    // Offsets spread over the buffer so two hits never sound identical (deterministic per time).
    var off = ((t * 7919.123) % NOISE_SECONDS + NOISE_SECONDS) % NOISE_SECONDS;
    s.start(t, off);
    return addSrc(v, s, s.playbackRate, rate || 1);
  }

  /** Feeds a shared LFO into `param` through a per-voice depth gain (returned; unlinked on dispose). */
  function lfoDepth(ac, v, rate, depth, param) {
    var l = sharedLfo(ac, rate);
    var g = gainNode(ac, v, depth);
    l.connect(g);
    v.links.push([l, g]);
    if (param) g.connect(param);
    return g;
  }

  /** Ends one source early (the rest of the voice keeps its own end). */
  function endSrc(s, t) {
    try { s.stop(t + 0.002); s.__end = t; } catch (e) { /* stopped */ }
  }

  /**
   * Schedules an ADSR on `param` (a gain) from t0 and returns the time it reaches exactly 0.
   * Attack linear; decay exponential to the sustain (or to -60 dB and a 5 ms ramp to 0 when s = 0);
   * release exponential to -60 dB then a 5 ms linear ramp to 0. `gate` is the note length from t0
   * (Infinity: hold the sustain until releaseVoice()). An interrupted attack or decay releases from
   * the level it reached.
   */
  function adsr(param, t0, peak, e, gate) {
    var a = Math.max(MIN_ENV, e.a || 0), d = Math.max(0, e.d || 0);
    var s = Math.max(0, Math.min(1, e.s || 0)), r = Math.max(MIN_ENV, e.r || 0);
    var tA = t0 + a, tD = tA + d, tG = t0 + Math.max(0, gate);
    var sus = s * peak, lo = peak * FLOOR;
    param.setValueAtTime(0, t0);
    if (!(peak > 0)) return t0;
    if (s === 0) {
      // One-shot: the gate only matters when it ends the sound early.
      var tEnd = d > 0 ? tD : tA;
      if (tG < tEnd) return release(param, t0, peak, a, d, s, r, tG);
      param.linearRampToValueAtTime(peak, tA);
      if (d > 0) param.exponentialRampToValueAtTime(lo, tD);
      param.linearRampToValueAtTime(0, tEnd + MIN_ENV);
      return tEnd + MIN_ENV;
    }
    if (tG < tD) return release(param, t0, peak, a, d, s, r, tG);
    param.linearRampToValueAtTime(peak, tA);
    if (d > 0) param.exponentialRampToValueAtTime(Math.max(sus, lo), tD);
    else param.setValueAtTime(sus, tA);
    if (gate === Infinity) return Infinity;
    param.setValueAtTime(sus, tG);
    param.exponentialRampToValueAtTime(Math.max(sus * FLOOR, 1e-7), tG + r);
    param.linearRampToValueAtTime(0, tG + r + MIN_ENV);
    return tG + r + MIN_ENV;
  }

  /** The level an ADSR (started at t0) has at time t ≥ t0 before its release. */
  function levelAt(t, t0, peak, a, d, s) {
    if (t <= t0) return 0;
    if (t < t0 + a) return peak * (t - t0) / a;
    var sus = Math.max(s * peak, peak * FLOOR);
    if (d > 0 && t < t0 + a + d) return peak * Math.pow(sus / peak, (t - t0 - a) / d);
    return s > 0 ? s * peak : 0;
  }

  /**
   * The level of a scheduled envelope record { t0, peak, e, gateAt } at time t, release included
   * (for stealing a voice or releasing a loop from exactly where its envelope is).
   */
  function envLevel(en, t) {
    var e = en.e;
    var a = Math.max(MIN_ENV, e.a || 0), d = Math.max(0, e.d || 0), s = Math.max(0, Math.min(1, e.s || 0));
    var r = Math.max(MIN_ENV, e.r || 0);
    if (en.relAt !== undefined && t >= en.relAt) {
      return t - en.relAt >= en.relR ? 0 : en.relLv * Math.pow(FLOOR, (t - en.relAt) / en.relR);
    }
    var g = en.gateAt;
    if (g === undefined || t <= g || (s === 0 && g >= en.t0 + a + d)) return levelAt(t, en.t0, en.peak, a, d, s);
    var lg = levelAt(g, en.t0, en.peak, a, d, s);
    return t - g >= r ? 0 : lg * Math.pow(FLOOR, (t - g) / r);
  }

  /** Schedules an attack/decay interrupted at tG, then the release; returns the end time. */
  function release(param, t0, peak, a, d, s, r, tG) {
    var tA = t0 + a;
    var lv = levelAt(tG, t0, peak, a, d, s);
    if (tG <= t0 || lv <= 0) { param.setValueAtTime(0, t0); return t0 + MIN_ENV; }
    if (tG < tA) param.linearRampToValueAtTime(lv, tG);
    else {
      param.linearRampToValueAtTime(peak, tA);
      if (tG > tA) param.exponentialRampToValueAtTime(lv, tG);
    }
    param.exponentialRampToValueAtTime(lv * FLOOR, tG + r);
    param.linearRampToValueAtTime(0, tG + r + MIN_ENV);
    return tG + r + MIN_ENV;
  }

  /** Stops every source of the voice that has no earlier end at time `end`; the voice ends then. */
  function stopAll(v, end) {
    v.end = end;
    if (end === Infinity) return;
    v.srcs.forEach(function (s) {
      if (s.__end !== undefined && s.__end <= end) return;
      endSrc(s, end);
    });
  }

  /** Ramps every envelope of a voice from its level at t to 0 over r seconds. @returns {number} the end */
  function rampDown(v, t, r) {
    var end = t;
    v.envs.forEach(function (en) {
      var p = en.p;
      if (en.end !== undefined && en.end <= t) return;
      var lv = envLevel(en, t);
      var rr = r === undefined ? Math.max(MIN_ENV, en.e.r || 0) : r;
      // Hold the level the envelope has at t (computed from its own curve), then ramp down from
      // it (exponential, then linear to 0). cancelAndHoldAtTime is not used: Chrome starts the
      // next ramp from the event before the hold when that event is a setValueAtTime.
      p.cancelScheduledValues(t);
      p.setValueAtTime(lv, t);
      if (lv > 0 && rr > MIN_ENV) p.exponentialRampToValueAtTime(lv * FLOOR, t + rr);
      p.linearRampToValueAtTime(0, t + rr + MIN_ENV);
      en.end = t + rr + MIN_ENV;
      en.relAt = t; en.relLv = lv; en.relR = rr;
      end = Math.max(end, en.end);
    });
    return end;
  }

  /**
   * Releases a held (looping) voice at time t: every envelope ramps to 0 from its level.
   * @returns {number} the new end time
   */
  function releaseVoice(v, t) {
    if (v.done) return v.end;
    var end = rampDown(v, t);
    v.loop = false;
    stopAll(v, end);
    return end;
  }

  /**
   * Cuts a voice quickly at t (stealing, or stopping a one-shot early) over 8 ms (or `fade`): its
   * gate fades, or without a gate its envelopes do. A voice that has not started yet is silenced
   * before it starts.
   */
  function cut(v, t, fade) {
    if (v.done) return;
    var f = fade || STEAL_FADE;
    var end;
    if (v.gate) {
      var g = v.gate.gain;
      if (v.t0 > t + 0.001) {
        g.cancelScheduledValues(0);
        g.setValueAtTime(0, 0);
        end = v.t0;
      } else {
        var cur = t <= v.ac.currentTime + 0.001 ? g.value : v.vol;
        g.cancelScheduledValues(t);
        g.setValueAtTime(cur, t);
        g.linearRampToValueAtTime(0, t + f);
        end = t + f;
      }
    } else if (v.t0 > t + 0.001) {
      v.envs.forEach(function (en) { en.p.cancelScheduledValues(0); en.p.setValueAtTime(0, 0); });
      end = v.t0;
    } else {
      end = Math.max(t + f, rampDown(v, t, f));
    }
    v.loop = false;
    v.end = end;
    v.srcs.forEach(function (s) { if (s.__end === undefined || s.__end > end) endSrc(s, end); });
  }

  /** Disconnects every node of a finished voice (and its links from the shared LFOs). */
  function dispose(v) {
    if (v.done) return;
    v.done = true;
    v.links.forEach(function (l) { try { l[0].disconnect(l[1]); } catch (e) { /* gone */ } });
    v.nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { /* not connected */ } });
    v.nodes.length = 0;
    v.srcs.length = 0;
    v.tune.length = 0;
    v.envs.length = 0;
    v.links.length = 0;
  }

  /** Retunes a running voice by a pitch ratio (sfx handles: the engine loop pitched by speed). */
  function retune(v, ratio, t) {
    v.tune.forEach(function (tu) {
      try { tu.p.setTargetAtTime(tu.base * ratio, t, 0.03); } catch (e) { /* ended */ }
    });
  }

  /** Sets a voice's volume (its gate) smoothly. */
  function setVolume(v, vol, t) {
    v.vol = vol;
    if (v.gate) { try { v.gate.gain.setTargetAtTime(vol, t, 0.03); } catch (e) { /* ended */ } }
  }

  /** Adds an envelope gain to the voice (the last node before its output) and schedules it. */
  function envelope(ac, v, t0, peak, e, gate) {
    var g = gainNode(ac, v, 0);
    var end = adsr(g.gain, t0, peak, e, gate);
    v.envs.push({ p: g.gain, t0: t0, peak: peak, e: e, end: end === Infinity ? undefined : end,
      gateAt: gate === Infinity ? undefined : t0 + Math.max(0, gate) });
    g.connect(v.out);
    return { node: g, end: end };
  }

  /** Schedules a frequency (Hz, or a list with `at` offsets, or a sweep) on an AudioParam. */
  function scheduleFreq(p, L, t0, mul) {
    if (L.sweep) {
      var sw = L.sweep;
      p.setValueAtTime(sw[0] * mul, t0);
      if (sw[3] === 'lin') p.linearRampToValueAtTime(sw[1] * mul, t0 + sw[2]);
      else p.exponentialRampToValueAtTime(Math.max(1e-3, sw[1] * mul), t0 + sw[2]);
      return sw[0] * mul;
    }
    if (Array.isArray(L.freq)) {
      var at = L.at || [];
      for (var i = 0; i < L.freq.length; i++) p.setValueAtTime(L.freq[i] * mul, t0 + (at[i] || 0));
      return L.freq[0] * mul;
    }
    p.setValueAtTime((L.freq || 440) * mul, t0);
    return (L.freq || 440) * mul;
  }

  function firstFreq(L) {
    if (L.sweep) return L.sweep[0];
    if (Array.isArray(L.freq)) return L.freq[0];
    return L.freq || 440;
  }

  /**
   * Builds one SFX layer (CONTRACT §14.3) into voice v, starting at t; its sources stop when its
   * envelope ends.
   * @param {object} o { pitch (ratio), amp (peak gain), loop (hold until release) }
   * @returns {number} the layer's end time (Infinity while a loop holds)
   */
  function layer(v, L, t, o) {
    var ac = v.ac;
    var t0 = t + (L.start || 0);
    var pitch = o.pitch || 1;
    var src, own = [];
    if (L.osc) {
      src = oscNode(ac, v, L.osc, firstFreq(L) * pitch, t0, L.duty);
      scheduleFreq(src.frequency, L, t0, pitch);
    } else if (L.noise) {
      src = noiseNode(ac, v, L.noise, t0, pitch);
    } else if (L.pluck) {
      var pb = pluckBuffer(ac, firstFreq(L) * pitch);
      src = ac.createBufferSource();
      src.buffer = pb.buffer;
      var f0 = firstFreq(L);
      src.playbackRate.setValueAtTime(pb.rate, t0);
      // Follow the frequency plan as a playback-rate plan relative to the first pitch.
      if (L.sweep || Array.isArray(L.freq)) scheduleFreq(src.playbackRate, L, t0, pb.rate / f0);
      src.start(t0);
      addSrc(v, src, src.playbackRate, pb.rate);
    } else if (L.fm) {
      var fm = L.fm;
      var ratio = fm.ratio || 1;
      src = oscNode(ac, v, fm.carrier || 'sine', firstFreq(L) * pitch, t0, L.duty);
      scheduleFreq(src.frequency, L, t0, pitch);
      var mod = oscNode(ac, v, 'sine', firstFreq(L) * pitch * ratio, t0);
      scheduleFreq(mod.frequency, L, t0, pitch * ratio);
      own.push(mod);
      // The index is the peak deviation in units of the modulator frequency (standard FM).
      var depth = gainNode(ac, v, 0);
      depth.gain.setValueAtTime((fm.index || 0) * firstFreq(L) * pitch * ratio, t0);
      if (fm.indexDecay > 0) depth.gain.setTargetAtTime(0, t0, fm.indexDecay);
      mod.connect(depth);
      depth.connect(src.frequency);
    } else {
      return t;
    }
    own.push(src);
    var out = src;
    if (L.filter) {
      var F = L.filter;
      var bf = filterNode(ac, v, F.type || 'lowpass', F.freq || 1000, F.q);
      if (F.sweep) {
        bf.frequency.setValueAtTime(F.sweep[0] * pitch, t0);
        if (F.sweep[3] === 'lin') bf.frequency.linearRampToValueAtTime(F.sweep[1] * pitch, t0 + F.sweep[2]);
        else bf.frequency.exponentialRampToValueAtTime(Math.max(1, F.sweep[1] * pitch), t0 + F.sweep[2]);
      } else {
        bf.frequency.setValueAtTime(Math.min(20000, (F.freq || 1000) * pitch), t0);
      }
      out.connect(bf);
      out = bf;
    }
    var peak = (o.amp === undefined ? 1 : o.amp) * (L.gain === undefined ? 1 : L.gain);
    var e = L.env || { a: MIN_ENV, d: L.dur || 0.1, s: 0, r: MIN_ENV };
    var en = envelope(ac, v, t0, peak, e, o.loop ? Infinity : (L.dur === undefined ? e.a + e.d : L.dur));
    out.connect(en.node);
    if (en.end !== Infinity) own.forEach(function (s) { endSrc(s, en.end); });
    return en.end;
  }

  // ---- instruments (ART_AUDIO §13.2) ----
  // A preset builds one note or chord (fs: the frequencies) into v: per-note sources into shared
  // filters and one envelope (summing before a linear filter is the same as filtering each note),
  // and returns the end time. `amp` is each note's peak (velocity × mix), `gate` the note length
  // in seconds. LEVEL evens out the presets' loudness at the same amp.

  // Measured so a C4 (E2 for the basses) at amp 1 sits near -19 dBFS RMS for sustained presets and
  // near -11 dBFS peak for plucked and struck ones, through the master chain.
  var LEVEL = {
    bass: 0.55, slap: 0.5, lead: 0.34, whistle: 0.27, keys: 0.27, clav: 0.7, pluck: 0.53, pad: 0.18,
    brass: 0.26, bell: 0.4, vibes: 0.4, organ: 0.25, harmonica: 0.53, kit: 0.5,
  };

  function finish(v, end) { stopAll(v, end); return end; }

  var PRESETS = {
    bass: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var lp = filterNode(ac, v, 'lowpass', 600, 1.2);
      lp.frequency.setValueAtTime(600 + 1200, t);                            // env amount +1,200 Hz
      lp.frequency.setTargetAtTime(600, t + 0.005, 0.04);
      fs.forEach(function (f) { oscNode(ac, v, 'saw', f, t).connect(lp); });
      var en = envelope(ac, v, t, amp, { a: 0.005, d: 0.12, s: 0.6, r: 0.08 }, gate);
      lp.connect(en.node);
      return finish(v, en.end);
    },
    slap: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var lp = filterNode(ac, v, 'lowpass', 800, 2);
      lp.frequency.setValueAtTime(800 + 2000, t);
      lp.frequency.setTargetAtTime(800, t + 0.005, 0.05);
      fs.forEach(function (f) {
        var o = oscNode(ac, v, 'saw', f * 1.5, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.015);               // the pitch blip
        o.connect(lp);
      });
      var en = envelope(ac, v, t, amp, { a: 0.005, d: 0.14, s: 0.55, r: 0.07 }, gate);
      lp.connect(en.node);
      var n = noiseNode(ac, v, 'white', t);                                   // the 20 ms click
      var bp = filterNode(ac, v, 'bandpass', 2500, 1.5);
      n.connect(bp);
      var cl = envelope(ac, v, t, amp * 0.35, { a: 0.003, d: 0.017, s: 0, r: 0.005 }, 0.02);
      bp.connect(cl.node);
      endSrc(n, cl.end);
      return finish(v, Math.max(en.end, cl.end));
    },
    lead: function (v, fs, t, gate, amp) {
      // Pulse 25 % as a saw minus the same saw delayed by duty / f; PWM (0.3 Hz) moves the delay;
      // vibrato 5.5 Hz ± 12 cents after 200 ms. Both LFOs are shared per context.
      var ac = v.ac;
      var lp = filterNode(ac, v, 'lowpass', 4200, 0.7);
      fs.forEach(function (f) {
        var o1 = oscNode(ac, v, sawWave(ac, false), f, t);
        var o2 = oscNode(ac, v, sawWave(ac, true), f, t);
        var dl = track(v, ac.createDelay(0.1));
        dl.delayTime.setValueAtTime(0.25 / f, t);
        lfoDepth(ac, v, 0.3, 0.08 / f, dl.delayTime);
        o2.connect(dl);
        o1.connect(lp); dl.connect(lp);
        var vib = lfoDepth(ac, v, 5.5, 0, null);
        vib.gain.setValueAtTime(0, t + 0.2);
        vib.gain.linearRampToValueAtTime(12, t + 0.4);
        vib.connect(o1.detune); vib.connect(o2.detune);
      });
      var en = envelope(ac, v, t, amp * 0.5, { a: 0.01, d: 0.1, s: 0.8, r: 0.1 }, gate);
      lp.connect(en.node);
      return finish(v, en.end);
    },
    whistle: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var sum = gainNode(ac, v, 1);
      fs.forEach(function (f) {
        var o = oscNode(ac, v, 'sine', f, t);
        var vib = lfoDepth(ac, v, 5, 0, o.detune);
        vib.gain.setValueAtTime(0, t + 0.18);
        vib.gain.linearRampToValueAtTime(15, t + 0.38);
        o.connect(sum);
      });
      var en = envelope(ac, v, t, amp, { a: 0.03, d: 0.08, s: 0.85, r: 0.09 }, gate);
      sum.connect(en.node);
      var n = noiseNode(ac, v, 'white', t);                                   // breath at -24 dB
      var bp = filterNode(ac, v, 'bandpass', Math.min(6000, fs[0] * 2), 0.8);
      n.connect(bp);
      var br = envelope(ac, v, t, amp * 0.063, { a: 0.03, d: 0.08, s: 0.7, r: 0.09 }, gate);
      bp.connect(br.node);
      return finish(v, Math.max(en.end, br.end));
    },
    keys: function (v, fs, t, gate, amp) {
      // Two-operator FM 1:14 (a Rhodes tine), index decaying 3 → 0.5. Here the index is the peak
      // deviation in units of the carrier frequency (a gentle tine; in units of the 14 × modulator
      // it would ring up to 15 kHz, against ART_AUDIO §13.1). A lowpass keeps it soft.
      var ac = v.ac;
      var lp = filterNode(ac, v, 'lowpass', 4500, 0.5);
      fs.forEach(function (f) {
        var c = oscNode(ac, v, 'sine', f, t);
        var m = oscNode(ac, v, 'sine', f * 14, t);
        var dep = gainNode(ac, v, 0);
        dep.gain.setValueAtTime(3 * f, t);
        dep.gain.setTargetAtTime(0.5 * f, t, 0.12);
        m.connect(dep); dep.connect(c.frequency);
        c.connect(lp);
      });
      var en = envelope(ac, v, t, amp, { a: 0.005, d: 1.4, s: 0.2, r: 0.25 }, gate);
      lp.connect(en.node);
      return finish(v, en.end);
    },
    clav: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var bp = filterNode(ac, v, 'bandpass', 1200, 2.2);
      fs.forEach(function (f) { oscNode(ac, v, 'square', f, t).connect(bp); });
      var en = envelope(ac, v, t, amp, { a: 0.004, d: 0.16, s: 0, r: 0.03 }, gate);
      bp.connect(en.node);
      return finish(v, en.end);
    },
    pluck: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var sum = gainNode(ac, v, 1);
      var hold = gate;
      fs.forEach(function (f) {
        var pb = pluckBuffer(ac, f);
        var s = ac.createBufferSource();
        s.buffer = pb.buffer;
        s.playbackRate.setValueAtTime(pb.rate, t);
        s.start(t);
        addSrc(v, s, s.playbackRate, pb.rate);
        s.connect(sum);
        hold = Math.min(hold, PLUCK_SECONDS / pb.rate - PLUCK_FADE - 0.12);
      });
      var en = envelope(ac, v, t, amp, { a: 0.005, d: 0, s: 1, r: 0.1 }, Math.max(0.02, hold));
      sum.connect(en.node);
      return finish(v, en.end);
    },
    pad: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var lp = filterNode(ac, v, 'lowpass', 1800, 0.6);
      fs.forEach(function (f) {
        [-7, 0, 7].forEach(function (c) {                                     // 3 saws ± 7 cents
          var o = oscNode(ac, v, 'saw', f, t);
          if (c) o.detune.setValueAtTime(c, t);
          o.connect(lp);
        });
      });
      var en = envelope(ac, v, t, amp, { a: 0.4, d: 0.3, s: 0.8, r: 0.6 }, gate);
      lp.connect(en.node);
      return finish(v, en.end);
    },
    brass: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var lp = filterNode(ac, v, 'lowpass', 500, 1.1);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(500 + 2000, t + 0.06);             // the filter swell
      lp.frequency.setTargetAtTime(1500, t + 0.06, 0.12);
      fs.forEach(function (f) {
        [-6, 6].forEach(function (c) {
          var o = oscNode(ac, v, 'saw', f, t);
          o.detune.setValueAtTime(c, t);
          o.connect(lp);
        });
      });
      var en = envelope(ac, v, t, amp, { a: 0.06, d: 0.15, s: 0.8, r: 0.12 }, gate);
      lp.connect(en.node);
      return finish(v, en.end);
    },
    bell: function (v, fs, t, gate, amp) { return bellish(v, fs, t, gate, amp, false); },
    vibes: function (v, fs, t, gate, amp) { return bellish(v, fs, t, gate, amp, true); },
    organ: function (v, fs, t, gate, amp) {
      // Three sines at 1, 2, 3 × f, as one additive wave per note.
      var ac = v.ac;
      var sum = gainNode(ac, v, 1);
      fs.forEach(function (f) { oscNode(ac, v, organWave(ac), f, t).connect(sum); });
      var en = envelope(ac, v, t, amp, { a: 0.01, d: 0.05, s: 0.9, r: 0.08 }, gate);
      sum.connect(en.node);
      return finish(v, en.end);
    },
    harmonica: function (v, fs, t, gate, amp) {
      var ac = v.ac;
      var bp = filterNode(ac, v, 'bandpass', 1500, 1.2);
      fs.forEach(function (f) {
        var o = oscNode(ac, v, 'square', f, t);
        var vib = lfoDepth(ac, v, 5, 0, o.detune);
        vib.gain.setValueAtTime(0, t + 0.15);
        vib.gain.linearRampToValueAtTime(20, t + 0.35);
        o.connect(bp);
      });
      var en = envelope(ac, v, t, amp, { a: 0.04, d: 0.1, s: 0.75, r: 0.1 }, gate);
      bp.connect(en.node);
      return finish(v, en.end);
    },
  };

  /** Bell and vibes: FM 1:3.5 with a fast decay; vibes add a 5 Hz tremolo. */
  function bellish(v, fs, t, gate, amp, trem) {
    var ac = v.ac;
    var sum = gainNode(ac, v, trem ? 0.85 : 1);
    if (trem) lfoDepth(ac, v, 5, 0.15, sum.gain);
    fs.forEach(function (f) {
      var c = oscNode(ac, v, 'sine', f, t);
      var m = oscNode(ac, v, 'sine', f * 3.5, t);
      var dep = gainNode(ac, v, 0);
      dep.gain.setValueAtTime((trem ? 0.8 : 1.6) * f * 3.5 * 0.25, t);
      dep.gain.setTargetAtTime(0.1 * f * 3.5 * 0.25, t, trem ? 0.3 : 0.18);
      m.connect(dep); dep.connect(c.frequency);
      c.connect(sum);
    });
    var en = envelope(ac, v, t, amp, { a: 0.005, d: trem ? 1.6 : 1.1, s: 0, r: 0.15 }, gate);
    sum.connect(en.node);
    return finish(v, en.end);
  }

  // Drums (ART_AUDIO §13.2). Each returns the end time; `amp` is the hit's peak.
  var DRUMS = {
    k: function (v, t, amp) {
      var ac = v.ac;
      var o = oscNode(ac, v, 'sine', 120, t, undefined, false);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      var en = envelope(ac, v, t, amp, { a: 0.003, d: 0.28, s: 0, r: 0.01 }, 0.3);
      o.connect(en.node);
      return finish(v, en.end);
    },
    s: function (v, t, amp) {
      var ac = v.ac;
      var n = noiseNode(ac, v, 'white', t);
      var bp = filterNode(ac, v, 'bandpass', 1800, 0.9);
      n.connect(bp);
      var a = envelope(ac, v, t, amp * 0.7, { a: 0.004, d: 0.16, s: 0, r: 0.01 }, 0.2);
      bp.connect(a.node);
      var o = oscNode(ac, v, 'triangle', 190, t, undefined, false);
      var b = envelope(ac, v, t, amp * 0.6, { a: 0.004, d: 0.09, s: 0, r: 0.01 }, 0.1);
      o.connect(b.node);
      endSrc(o, b.end);
      return finish(v, Math.max(a.end, b.end));
    },
    h: function (v, t, amp) { return hat(v, t, amp, 0.03); },
    o: function (v, t, amp) { return hat(v, t, amp, 0.18); },
    c: function (v, t, amp) {
      var ac = v.ac;
      var n = noiseNode(ac, v, 'white', t);
      var bp = filterNode(ac, v, 'bandpass', 1200, 1);
      n.connect(bp);
      var g = gainNode(ac, v, 0);
      var p = g.gain;
      // Three bursts 10 ms apart, the last with a longer tail.
      p.setValueAtTime(0, t);
      for (var i = 0; i < 3; i++) {
        var ti = t + i * 0.01;
        p.linearRampToValueAtTime(amp * 0.85, ti + 0.003);
        p.linearRampToValueAtTime(i < 2 ? amp * 0.17 : amp * 0.85, ti + 0.009);
      }
      var end = t + 0.03 + 0.12 + MIN_ENV;
      p.exponentialRampToValueAtTime(amp * 0.85 * FLOOR, t + 0.03 + 0.12);
      p.linearRampToValueAtTime(0, end);
      v.envs.push({ p: p, t0: t, peak: amp * 0.85, e: { a: 0.003, d: 0.14, s: 0, r: 0.01 }, end: end });
      bp.connect(g);
      g.connect(v.out);
      return finish(v, end);
    },
    b: function (v, t, amp) {
      var ac = v.ac;
      var n = noiseNode(ac, v, 'pink', t);
      var bp = filterNode(ac, v, 'bandpass', 3000, 0.6);
      n.connect(bp);
      var en = envelope(ac, v, t, amp * 0.9, { a: 0.03, d: 0.12, s: 0, r: 0.01 }, 0.15);
      bp.connect(en.node);
      return finish(v, en.end);
    },
    r: function (v, t, amp) {
      var ac = v.ac;
      var o = oscNode(ac, v, 'triangle', 1700, t, undefined, false);
      var a = envelope(ac, v, t, amp * 0.35, { a: 0.003, d: 0.03, s: 0, r: 0.005 }, 0.04);
      o.connect(a.node);
      var n = noiseNode(ac, v, 'white', t);
      var bp = filterNode(ac, v, 'bandpass', 3000, 2);
      n.connect(bp);
      var b = envelope(ac, v, t, amp * 0.25, { a: 0.003, d: 0.025, s: 0, r: 0.005 }, 0.03);
      bp.connect(b.node);
      return finish(v, Math.max(a.end, b.end));
    },
    z: function (v, t, amp) {
      var ac = v.ac;
      var n = noiseNode(ac, v, 'white', t);
      var bp = filterNode(ac, v, 'bandpass', 5000, 1.5);
      n.connect(bp);
      var en = envelope(ac, v, t, amp * 0.42, { a: 0.01, d: 0.05, s: 0, r: 0.01 }, 0.07);
      bp.connect(en.node);
      return finish(v, en.end);
    },
    t: function (v, t, amp) {
      var ac = v.ac;
      var o = oscNode(ac, v, 'sine', 160, t, undefined, false);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.15);
      var en = envelope(ac, v, t, amp * 0.8, { a: 0.004, d: 0.3, s: 0, r: 0.01 }, 0.32);
      o.connect(en.node);
      return finish(v, en.end);
    },
  };

  function hat(v, t, amp, d) {
    var ac = v.ac;
    var n = noiseNode(ac, v, 'white', t);
    var hp = filterNode(ac, v, 'highpass', 7000, 0.7);
    n.connect(hp);
    var en = envelope(ac, v, t, amp * 0.3, { a: 0.004, d: d, s: 0, r: 0.01 }, d + 0.01);
    hp.connect(en.node);
    return finish(v, en.end);
  }

  /**
   * Plays one note or chord of a preset into dest (a music voice: no gate node).
   * @param {object} E { ac } the audio environment
   * @param {AudioNode} dest the track input
   * @param {string} preset an ART_AUDIO §13.2 preset (not 'kit')
   * @param {number|number[]} midi a MIDI note or a chord's notes
   * @param {number} t start time (s, context time)
   * @param {number} gate note length (s)
   * @param {number} amp velocity × mix (0..1), per note
   * @param {number} priority voice priority
   * @returns {object} the voice
   */
  function note(E, dest, preset, midi, t, gate, amp, priority) {
    var v = newVoice(E.ac, dest, t, priority, false);
    var P = PRESETS[preset] || PRESETS.keys;
    var fs = (Array.isArray(midi) ? midi : [midi]).map(mtof);
    P(v, fs, t, gate, amp * (LEVEL[preset] || 0.3));
    return v;
  }

  /**
   * Plays one drum hit ('k', 's', 'h', 'o', 'c', 'b', 'r', 'z', 't') into dest.
   * @returns {object} the voice
   */
  function drum(E, dest, token, t, amp, priority) {
    var v = newVoice(E.ac, dest, t, priority, false);
    (DRUMS[token] || DRUMS.k)(v, t, amp * LEVEL.kit);
    return v;
  }

  SR.audio.synth = {
    MIN_ENV: MIN_ENV,
    PRESETS: Object.keys(PRESETS).concat(['kit']),
    DRUMS: Object.keys(DRUMS),
    LEVEL: LEVEL,
    mtof: mtof,
    xorshift: xorshift,
    noiseBuffer: noiseBuffer,
    pulseWave: pulseWave,
    pluckBuffer: pluckBuffer,
    newVoice: newVoice,
    adsr: adsr,
    envelope: envelope,
    layer: layer,
    note: note,
    drum: drum,
    cut: cut,
    releaseVoice: releaseVoice,
    retune: retune,
    setVolume: setVolume,
    stopAll: stopAll,
    dispose: dispose,
  };
})();
