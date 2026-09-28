// Synthesized sound effects and music loops (Web Audio) — no audio files. Every effect is built
// from breakpoint voices (an oscillator or noise, optional filters, an envelope in dB) whose
// length, level, envelope and spectrum follow measurements of the original's sounds. Those are
// 11 kHz samples, so everything goes through a ~4.8 kHz low-pass. Names mirror the original's
// sounds: error, eat, drink, work, purchase, fall, carhit, crash, footstep, skate, ansmachine,
// roulette, reel1-3, handle, win, ignition, the fight clip's punch / kick / fireball / energy,
// the intro's breath and the results stamp ('click' exists but, as in the original, nothing
// plays it). Music loops: 'beginning' (title), 'main' (city), 'inside' (buildings), 'fight'.
//
// The original's Sound objects are global, so LoopX.stop() / SFXwork.stop() / stopSounds all
// silence every sound: music() cuts the effects still playing whenever the loop changes, and
// stopAll() does it explicitly. setVolume() is the global Sound.setVolume (50 on the title).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ctx = null;
  var master = null;
  var musicGain = null;
  var noiseBuf = null;
  var sfxOn = true;
  var live = []; // sources still playing, for stopAll()
  var volume = 1;
  var trimNow = 0; // the level trim (dB) of the effect being built

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        // Nothing above ~5 kHz, like the 11 kHz originals. A soft clipper (transparent below
        // -6 dBFS) stands in for Flash's hard clipping when loud sounds stack up.
        var lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 4800;
        lp.Q.value = 0.6;
        var clip = ctx.createWaveShaper();
        var curve = new Float32Array(2049);
        for (var c = 0; c < 2049; c++) {
          var x = c / 1024 - 1, ax = Math.abs(x);
          curve[c] = ax < 0.5 ? x : (x < 0 ? -1 : 1) * (0.5 + 0.5 * Math.tanh((ax - 0.5) / 0.5));
        }
        clip.curve = curve;
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(lp);
        lp.connect(clip);
        clip.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = 1;
        musicGain.connect(master);
        var n = ctx.sampleRate * 4;
        noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        ctx = null;
        return null;
      }
    }
    return ctx;
  }

  function g(dB) { return Math.pow(10, dB / 20); }
  function pts(v) { return typeof v === 'number' ? [[0, v]] : v; }
  function hz(v) { return Math.max(1, v); }

  // Breakpoints [[t, value], ...] from t0, joined by exponential ramps (straight lines in dB and
  // in octaves). Unless noHold, the parameter has the first value before t0 as well: otherwise an
  // oscillator's or filter's first render quantum runs at the default 440 / 350 Hz.
  function automate(param, t0, list, conv, noHold) {
    list = pts(list);
    if (!noHold) param.value = conv(list[0][1]);
    param.setValueAtTime(conv(list[0][1]), t0 + list[0][0]);
    for (var i = 1; i < list.length; i++) param.exponentialRampToValueAtTime(conv(list[i][1]), t0 + list[i][0]);
  }

  // One voice: { w: wave | 'noise', f: Hz | [[t, Hz]], filt: [{ type, f, Q }], env: [[t, dB]],
  // am: { rate, depth, w } }. The envelope's first and last points are its start and end.
  function voice(v, t0, dest) {
    var a = ctx;
    var env = v.env;
    var start = t0 + env[0][0], end = t0 + env[env.length - 1][0];
    var src;
    if (v.w === 'noise') {
      src = a.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
    } else {
      src = a.createOscillator();
      src.type = v.w;
      automate(src.frequency, t0, v.f, hz);
    }
    var node = src;
    (v.filt || []).forEach(function (fd) {
      var bq = a.createBiquadFilter();
      bq.type = fd.type;
      bq.Q.value = fd.Q || 0.7;
      automate(bq.frequency, t0, fd.f, hz);
      node.connect(bq);
      node = bq;
    });
    var amp = a.createGain();
    // Silent until the envelope starts: a gain node's default of 1 would let the source's first
    // sample through at full scale (a click) before the first automation event.
    amp.gain.value = 0;
    // Noise voices: the envelope is the band's RMS level, so make up for what the filters remove
    // (white noise is -4.8 dB RMS; a band of equivalent width B keeps B / (sampleRate / 2) of it).
    var trim = trimNow;
    if (v.w === 'noise') {
      var bw = a.sampleRate / 2;
      (v.filt || []).forEach(function (fd) {
        var f0 = pts(fd.f)[0][1];
        var b = fd.type === 'bandpass' ? 1.57 * f0 / (fd.Q || 0.7)
          : fd.type === 'lowpass' ? 1.11 * f0 : a.sampleRate / 2 - f0;
        if (b < bw) bw = b;
      });
      trim += 4.77 + 10 * Math.log10(a.sampleRate / 2 / bw);
    }
    automate(amp.gain, t0, env.map(function (p) { return [p[0], p[1] + trim]; }), g, true);
    amp.gain.setValueAtTime(0, end);
    node.connect(amp);
    var out = amp;
    if (v.am) {
      var lfo = a.createOscillator();
      lfo.type = v.am.w || 'sine';
      lfo.frequency.value = v.am.rate;
      var depth = a.createGain();
      depth.gain.value = v.am.depth;
      var vca = a.createGain();
      vca.gain.value = 1 - v.am.depth;
      lfo.connect(depth);
      depth.connect(vca.gain);
      amp.connect(vca);
      out = vca;
      lfo.start(start);
      lfo.stop(end + 0.02);
      track(lfo);
    }
    out.connect(dest || master);
    if (v.w === 'noise') src.start(start, Math.random() * 3);
    else src.start(start);
    src.stop(end + 0.02);
    track(src);
  }

  function track(node) {
    live.push(node);
    node.onended = function () { var i = live.indexOf(node); if (i >= 0) live.splice(i, 1); };
  }

  // Start a list of voices `delay` seconds from now.
  function play(voices, delay, dest) {
    var a = ac();
    if (!a) return;
    var t0 = a.currentTime + (delay || 0);
    voices.forEach(function (v) { voice(v, t0, dest); });
  }

  // Shorthands. env points are [seconds, dB at the output].
  function N(filt, env, am) { return { w: 'noise', filt: filt, env: env, am: am }; }
  function O(w, f, env, filt, am) { return { w: w, f: f, env: env, filt: filt, am: am }; }
  function bp(f, Q) { return { type: 'bandpass', f: f, Q: Q }; }
  function lp(f, Q) { return { type: 'lowpass', f: f, Q: Q }; }
  // Short clanks / grains at the given times (each a band of noise with a fast decay).
  function grains(times, f, Q, dB, len) {
    return times.map(function (t, i) {
      var d = typeof dB === 'number' ? dB : dB[i % dB.length];
      return N([bp(typeof f === 'number' ? f : f[i % f.length], Q)],
        [[t, -80], [t + 0.004, d], [t + (len || 0.05), d - 30]]);
    });
  }

  // A slot reel spinning down: a whirr with a clunk each time the reel catches.
  function reel(clunks, len) {
    var v = [N([bp(2100, 1)], [[0, -60], [0.02, -33], [len - 0.1, -34], [len, -60]],
      { rate: 20, depth: 0.4, w: 'square' })];
    clunks.forEach(function (t) {
      v.push(N([bp(1250, 2)], [[t, -70], [t + 0.005, -21], [t + 0.06, -27], [t + 0.15, -50]]));
      v.push(O('sine', 495, [[t, -70], [t + 0.005, -30], [t + 0.12, -48]]));
    });
    play(v);
  }

  var SQ = 'square';
  var sfx = {
    // (nothing plays it: the original loads _click.wav but no script starts it)
    click: function () {
      play([O(SQ, 1010, [[0.14, -80], [0.145, -8], [0.2, -12], [0.26, -30], [0.33, -70]], [bp(1200, 1.5)])]);
    },
    // a short nasal buzz; the sample starts with 0.15 s of silence
    error: function () {
      play([O('sawtooth', 129, [[0, -80], [0.025, -12], [0.06, -13], [0.09, -22], [0.13, -60]], [bp(2100, 1)])], 0.15);
    },
    // a 0.36 s low-mid crunch
    eat: function () {
      play([
        N([bp(495, 5)], [[0, -60], [0.012, -21], [0.05, -20], [0.25, -23], [0.3, -33], [0.36, -55]],
          { rate: 26, depth: 0.45, w: SQ }),
        N([bp(172, 5)], [[0, -60], [0.02, -25], [0.2, -27], [0.3, -40]]),
        N([bp(1300, 4)], [[0.12, -80], [0.125, -29], [0.3, -36], [0.36, -60]], { rate: 18, depth: 0.5, w: SQ }),
      ]);
    },
    // three gulps over 0.66 s, 0.04 s after the click
    drink: function () {
      play([
        O('triangle',
          [[0, 330], [0.07, 420], [0.075, 350], [0.33, 440], [0.335, 360], [0.52, 430], [0.525, 360], [0.66, 380]],
          [[0, -60], [0.03, -16], [0.062, -26], [0.08, -15], [0.3, -15], [0.325, -27], [0.342, -14], [0.5, -15],
            [0.515, -26], [0.53, -15], [0.6, -20], [0.66, -60]]),
        N([bp(600, 1.2)], [[0, -60], [0.03, -24], [0.6, -26], [0.66, -60]], { rate: 12, depth: 0.4 }),
        O('sine', 990, [[0.1, -80], [0.12, -22], [0.6, -24], [0.66, -70]]),
      ], 0.04);
    },
    // a soft noisy strike, then a ~2 kHz ring to 0.9 s (only its first 1/35 s is heard while
    // the results count up: every step stops and restarts it)
    work: function () {
      play([
        N([bp(1600, 0.8)], [[0, -70], [0.02, -47], [0.025, -38], [0.04, -38], [0.05, -32], [0.08, -30], [0.1, -25],
          [0.12, -20], [0.15, -26], [0.2, -45]]),
        N([bp(650, 2)], [[0.08, -60], [0.11, -22], [0.14, -30], [0.2, -55]]),
        O('sine', 2046, [[0.08, -80], [0.14, -21], [0.4, -23], [0.5, -21], [0.88, -28], [0.9, -70]]),
        O('sine', 1250, [[0.1, -80], [0.14, -27], [0.5, -31], [0.9, -70]]),
        N([bp(1550, 1)], [[0.4, -70], [0.45, -26], [0.52, -30], [0.6, -55]]),
      ]);
    },
    // a cash-register rattle (0.5 s), then the drawer's clank at 0.72 s
    purchase: function () {
      play([
        N([bp(2400, 1.4)], [[0, -40], [0.02, -18], [0.45, -19], [0.5, -32], [0.55, -55]],
          { rate: 22, depth: 0.35, w: SQ }),
        N([bp(1000, 1.5)], [[0, -40], [0.02, -19], [0.45, -21], [0.5, -45]]),
        O('sine', 2497, [[0.02, -80], [0.04, -26], [0.45, -30], [0.55, -50]]),
        O('sine', [[0, 210], [0.2, 190]], [[0, -60], [0.01, -14], [0.2, -24], [0.35, -45]]),
        N([bp(1600, 1)], [[0.715, -70], [0.72, -27], [0.8, -31], [0.87, -55]]),
        N([bp(700, 1.5)], [[0.715, -70], [0.72, -30], [0.8, -34], [0.87, -60]]),
      ]);
    },
    // a loud ~1 kHz tone sagging to 790 Hz (0.76 s), 0.04 s after the fall
    fall: function () {
      var env = [[0, -50], [0.12, -11], [0.16, -8], [0.5, -10], [0.6, -14], [0.68, -19], [0.73, -24], [0.76, -45]];
      var f = [[0, 1050], [0.15, 1000], [0.5, 930], [0.76, 790]];
      play([
        O('sine', f, env),
        O('sine', f.map(function (p) { return [p[0], p[1] * 2]; }),
          env.map(function (p) { return [p[0], p[1] - 16]; })),
      ], 0.04);
    },
    // a heavy low thump and a light rattle (0.4 s)
    carhit: function () {
      play([
        O('sine', [[0, 260], [0.1, 110]], [[0, -60], [0.004, -7], [0.07, -11], [0.12, -28], [0.18, -60]]),
        N([bp(500, 0.8)], [[0, -60], [0.004, -12], [0.06, -16], [0.12, -34], [0.16, -60]]),
      ].concat(grains([0.175, 0.28, 0.35], [1200, 1750, 1300], 3, [-34, -36, -38], 0.06)));
    },
    // the part the script plays (it starts the sample 1.32 s in): 2.6 s of metal debris
    crash: function () {
      var clanks = grains([0.0, 0.08, 0.21, 0.37, 0.53, 0.82, 1.0, 1.24, 1.5, 1.77, 1.97, 2.12, 2.52],
        [650, 860, 1100, 760, 1800, 660, 940, 1130, 950, 520, 640, 1900, 540], 6,
        [-10, -12, -13, -14, -13, -11, -15, -19, -22, -20, -21, -19, -34], 0.18);
      play([
        N([bp(750, 1.2)],
          [[0, -40], [0.01, -13], [0.3, -17], [1.0, -20], [1.1, -25], [2.0, -30], [2.4, -40], [2.62, -60]],
          { rate: 17, depth: 0.4 }),
        O('sine', [[0, 260], [0.3, 200]], [[0, -60], [0.01, -12], [0.25, -20], [0.4, -50]]),
      ].concat(clanks));
    },
    // a soft knock 0.04 s after the step, ringing at ~650 Hz (also the darts' hit: the original
    // has no dart sound)
    footstep: function () {
      play([
        O('sine', [[0, 710], [0.05, 650], [0.2, 620]],
          [[0, -70], [0.002, -25], [0.015, -38], [0.05, -54], [0.12, -60], [0.2, -71], [0.22, -80]]),
        O('sine', 470, [[0.001, -70], [0.003, -31], [0.02, -45], [0.06, -80]]),
        O('sine', 770, [[0.0005, -70], [0.0025, -31], [0.012, -47], [0.04, -80]]),
        O('sine', 560, [[0.26, -80], [0.263, -54], [0.29, -75]]),
      ], 0.04);
    },
    // 0.26 s of rolling noise: at one every 6 ticks (0.17 s) they overlap into a steady roll
    skate: function () {
      play([
        N([bp(1100, 0.8)], [[0, -60], [0.02, -33], [0.2, -34], [0.26, -50]], { rate: 30, depth: 0.2 }),
        N([bp(450, 2.5)], [[0, -60], [0.02, -39], [0.2, -40], [0.26, -55]]),
      ]);
    },
    // a bright click-whirr, then a buzzy ~440 Hz chatter to 1 s (0.07 s after the button)
    ansmachine: function () {
      play([
        N([bp(2600, 1.2)], [[0, -60], [0.01, -22], [0.12, -23], [0.25, -32], [0.35, -45]]),
        O('sawtooth', [[0.1, 440], [0.5, 420], [0.95, 450]],
          [[0.1, -60], [0.15, -18], [0.8, -17], [0.9, -22], [0.97, -27], [1.0, -60]], [bp(800, 1.2)],
          { rate: 9, depth: 0.35, w: SQ }),
        N([bp(1500, 2)], [[0.8, -70], [0.82, -30], [0.95, -32], [1.0, -60]]),
      ], 0.07);
    },
    // start(1): the ball rolling round and slowing, then dropping and bouncing into a pocket,
    // ending at 7.3 s, about when the ball clip shows the result
    roulette: function () {
      var bounce = grains([6.1, 6.22, 6.38, 6.5, 6.72, 6.8, 6.95, 7.05, 7.12],
        [1980, 1700, 3100, 1580, 2600, 1500, 2100, 1400, 1900], 3,
        [-17, -20, -19, -19, -16, -16, -15, -15, -17], 0.09);
      play([
        N([bp(1650, 1.5)], [[0, -16], [0.3, -14], [0.6, -17], [2.2, -19], [3.0, -23], [3.7, -27], [4.7, -33],
          [6.0, -34], [6.1, -22], [7.2, -20], [7.3, -60]], { rate: 24, depth: 0.45, w: SQ }),
        N([bp(1100, 2)], [[0, -22], [3.0, -28], [6.0, -38], [7.3, -60]]),
      ].concat(bounce));
    },
    // the slot machine's three reel sounds (firstReel, secondReel, thirdReel)
    reel1: function () { reel([0.33, 0.62], 0.84); },
    reel2: function () { reel([0.13, 0.52, 0.78], 1.0); },
    reel3: function () { reel([0.22, 0.45, 0.72], 0.89); },
    // pulling the handle: a ratchet, the clunk at 0.31 s, a rattle, then the machine's hum
    handle: function () {
      play([
        N([bp(1700, 1)], [[0, -70], [0.02, -42], [0.27, -36], [0.3, -40]], { rate: 25, depth: 0.5, w: SQ }),
        N([bp(460, 2)], [[0.29, -70], [0.31, -20], [0.36, -26], [0.45, -34], [0.55, -45]]),
        O('sine', [[0.31, 470], [0.4, 440]], [[0.29, -70], [0.31, -26], [0.5, -45]]),
        N([bp(1600, 1)], [[0.33, -60], [0.35, -28], [0.6, -28], [0.8, -38], [0.9, -60]],
          { rate: 11, depth: 0.5, w: SQ }),
        O('sine', 229, [[0.85, -80], [0.95, -50], [1.7, -50], [1.74, -80]]),
        O('sine', 462, [[0.85, -80], [0.95, -49], [1.7, -49], [1.74, -80]]),
        O('sine', 1152, [[0.85, -80], [0.95, -55], [1.7, -55], [1.74, -80]]),
      ], 0.035);
    },
    // start(0.1, 3): a 0.64 s legato jingle, three times back to back (one call)
    win: function () {
      var v = [];
      for (var k = 0; k < 3; k++) {
        [[0, 740, 988], [0.21, 830, 1110], [0.42, 988, 1245]].forEach(function (n, i) {
          var t = k * 0.636 + n[0], e = i === 2 ? 0.216 : 0.21;
          v.push(O('triangle', n[1], [[t, -40], [t + 0.03, -24], [t + e, -26], [t + e + 0.06, -60]]));
          v.push(O('triangle', n[2], [[t, -44], [t + 0.03, -28], [t + e, -30], [t + e + 0.06, -60]]));
        });
      }
      play(v);
    },
    // start(0.25): the starter, then the engine catching and idling (2.05 s)
    ignition: function () {
      play([
        O('sawtooth', 64, [[0, -60], [0.02, -27], [0.14, -25], [0.18, -40]], [lp(300, 1)],
          { rate: 14, depth: 0.5, w: SQ }),
        O('sawtooth', [[0.15, 75], [0.65, 80], [0.9, 86], [1.5, 75], [2.05, 64]],
          [[0.15, -40], [0.21, -9], [0.65, -9], [0.72, -21], [0.85, -15], [1.7, -16], [2.0, -24], [2.05, -50]],
          [lp(240, 1.2)], { rate: 9, depth: 0.35 }),
        N([lp(180, 1)], [[0.15, -60], [0.21, -18], [0.65, -20], [1.7, -26], [2.05, -60]]),
      ]);
    },
    // the fight clip's sounds: punch (played twice, 2 frames apart), kick, fireball, energy blast
    punch: function () {
      play([
        O('sine', [[0, 260], [0.05, 140], [0.2, 80]],
          [[0, -60], [0.004, -3], [0.07, -5], [0.1, -12], [0.15, -26], [0.21, -45]]),
        N([bp(250, 1)], [[0, -60], [0.004, -9], [0.06, -12], [0.12, -30], [0.2, -60]]),
      ]);
    },
    kick: function () {
      play([
        N([bp(700, 2)], [[0, -60], [0.005, -8], [0.1, -11], [0.35, -16], [0.45, -22], [0.57, -34], [0.59, -70]]),
        O('sine', [[0, 430], [0.55, 380]], [[0, -60], [0.01, -12], [0.3, -20], [0.57, -40]]),
        O('sine', [[0.6, 150], [0.7, 90], [0.95, 65]],
          [[0.59, -60], [0.605, -7], [0.72, -10], [0.8, -15], [0.9, -24], [0.96, -45]]),
        N([lp(400, 1)], [[0.59, -60], [0.605, -13], [0.8, -24], [0.95, -60]]),
      ]);
    },
    fireball: function () {
      play([
        N([lp(320, 1.2), lp(420, 0.7)],
          [[0, -60], [0.01, -2], [1.4, -3], [2.0, -11], [2.5, -16], [2.8, -26], [2.88, -60]], { rate: 7, depth: 0.25 }),
        O('sawtooth', [[0, 90], [2.88, 70]], [[0, -60], [0.02, -14], [1.4, -15], [2.0, -22], [2.88, -60]],
          [lp(260, 1)]),
      ]);
    },
    energy: function () {
      play([
        N([bp(280, 1.2), lp(700, 0.7)], [[0, -60], [0.01, -2], [0.5, -2], [0.56, -7], [1.1, -12], [1.3, -19],
          [1.55, -21], [1.58, -29], [1.76, -31], [1.78, -60]], { rate: 11, depth: 0.25 }),
        O('sawtooth', [[0, 110], [1.78, 95]], [[0, -60], [0.01, -8], [0.5, -9], [1.1, -18], [1.78, -60]], [lp(520, 1)]),
      ]);
    },
    // the intro's sleeper: a buzzy ~131 Hz snore whose formant opens from ~300 Hz to ~2.4 kHz
    breath: function () {
      play([
        O('sawtooth', [[0, 131], [1.0, 131], [2.0, 128]],
          [[0, -60], [0.03, -26], [0.5, -14], [0.67, -11], [1.2, -13], [1.5, -17], [1.8, -22], [1.95, -40], [2.0, -70]],
          [bp([[0, 300], [0.4, 520], [0.7, 1100], [0.95, 2100], [2.0, 2400]], 2.5)]),
        O('sawtooth', 262, [[0.6, -70], [0.9, -18], [1.3, -16], [1.8, -24], [2.0, -70]], [bp(3160, 3)]),
      ], 0.175);
    },
    // the results screen's rank stamp: a short, heavy thud
    stamp: function () {
      play([
        O('sine', [[0, 250], [0.05, 130], [0.22, 70]],
          [[0, -60], [0.003, -2], [0.025, -6], [0.075, -14], [0.15, -30], [0.22, -50]]),
        N([bp(220, 1)], [[0, -60], [0.003, -9], [0.05, -16], [0.15, -38], [0.2, -60]]),
      ]);
    },
  };
  // older names
  sfx.reel = sfx.reel1;
  sfx.swoosh = sfx.kick;
  sfx.dart = sfx.footstep;

  // Level trims (dB) that bring each effect to the original's loudness (K-weighted).
  var TRIM = {
    eat: 1.8, fall: 2.1, carhit: -0.7, crash: 2.7, footstep: 9.4, skate: 2.1, ansmachine: 2.2,
    roulette: 2.7, reel1: 3.5, reel2: 1.4, reel3: 1.3, handle: 0.5, win: 3.3, ignition: 5.3,
    breath: 17.2, punch: -0.1, kick: 1.4, fireball: -4.8, energy: 2.1, stamp: 2.35, error: 5.9,
    drink: 1.8, work: 1.6, purchase: -0.1,
  };
  TRIM.reel = TRIM.reel1;
  TRIM.swoosh = TRIM.kick;
  TRIM.dart = TRIM.footstep;

  // --- Music: a small step sequencer, written for this version. Tempo, loop length, register and
  // loudness follow the original's loops; the tunes are new. Patterns are one bar each ('.' is a
  // rest, numbers are MIDI notes); a loop cycles through its bars. gain: the loop's level (dB).
  //   beginning  159.7 bpm, 16 beats (6.0 s), soft chords in the 0.6-1.3 kHz range, no bass
  //   main       100 bpm, 24 bars (57.6 s), a ~65 Hz bass on a kick; the lead enters at bar 9
  //   inside     140 bpm, 4 bars (6.86 s), a quiet staccato bass at 55-150 Hz
  //   fight      140 bpm, 4 bars (6.86 s), a heavy syncopated ~65 Hz bass and kick
  function bar(str) { return str.split(' ').map(function (x) { return x === '.' ? null : +x; }); }
  function bars(list) { return list.map(bar); }
  var loops = {
    beginning: { bpm: 159.7, sub: 1, steps: 16, gain: -1.3,
      // a chord every 3 beats, the fifth held for 4 so the loop runs on without a gap (the
      // original's never falls silent), with a bell on each beat
      chords: [[76, 79, 84], [77, 81, 86], [79, 83, 86], [76, 81, 84], [77, 81, 84]], chordBeats: 3 },
    // (bars 1-8 are 3 dB quieter, without the lead, like the original's)
    main: { bpm: 100, sub: 4, steps: 16 * 24, gain: -2.4, introGain: -3.2, leadFrom: 8, bassLen: 1.2, bassLP: 160,
      kick: bars(['1 . . . 1 . . . 1 . . . 1 . . .']),
      bass: bars([
        '36 . . 36 . . 43 . 36 . . 41 . . . .',
        '36 . . 36 . . 43 . 36 . . 43 . . . .',
        '32 . . 32 . . 39 . 32 . . 37 . . . .',
        '34 . . 34 . . 41 . 34 . . 39 . . . .']),
      lead: bars([
        '72 . . 75 . . 79 . 77 . 75 . 72 . . .',
        '70 . . 72 . . 75 . . . 72 . . . . .',
        '72 . . 75 . . 80 . 79 . 75 . 72 . . .',
        '74 . . 77 . . 82 . 79 . 77 . 74 . . .',
        '79 . . 79 . 77 . 75 . . 77 . 79 . . .',
        '84 . . 82 . . 79 . . . 75 . 77 . . .',
        '80 . . 79 . . 75 . 72 . . 75 . . . .',
        '74 . . . 77 . . . 79 . . . . . . .']) },
    inside: { bpm: 140, sub: 4, steps: 64, gain: -6.6, bassLen: 0.8, leadLen: 0.6,
      bass: bars([
        '38 . . . 50 . 45 . 50 . . . 48 . 50 .',
        '34 . . . 46 . 41 . 46 . . . 45 . 46 .',
        '36 . . . 48 . 43 . 48 . . . 47 . 48 .',
        '33 . . . 45 . 40 . 45 . . . 44 . 45 .']),
      lead: bars([
        '69 . . . . . 65 . . . 62 . . . . .',
        '65 . . . . . 62 . . . 58 . . . . .',
        '64 . . . . . 67 . . . 72 . . . . .',
        '69 . . . . . 64 . . . 61 . . . 64 .']) },
    fight: { bpm: 140, sub: 4, steps: 64, gain: -7.1, bassLP: 180, leadGain: 7,
      kick: bars(['1 . . . 1 . . 1 1 . . . 1 . 1 .']),
      bass: bars([
        '36 . 36 . . 36 . 43 36 . 36 . 39 . 36 .',
        '36 . 36 . . 36 . 43 36 . 36 . 41 . 43 .',
        '32 . 32 . . 32 . 39 32 . 32 . 36 . 39 .',
        '31 . 31 . . 31 . 38 31 . 35 . 38 . 43 .']),
      lead: bars([
        '60 . 63 . 67 . 63 . 60 . . . 58 . 60 .',
        '60 . 63 . 67 . 70 . 67 . 63 . 60 . . .',
        '60 . 63 . 68 . 67 . 63 . 60 . 56 . . .',
        '59 . 62 . 67 . 65 . 62 . 59 . 55 . . .']) },
  };
  var current = null;
  var timer = null;
  var step = 0;
  var musicOn = true;
  var forced = false; // playing although music is off (see music())
  var nextT = 0;

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function at(list, i, per) { var b = list[Math.floor(i / per) % list.length]; return b[i % per]; }

  // One step of the current loop, `t` seconds from now.
  function playStep(L, i, t) {
    var lg = L.gain + (Math.floor(i / 16) < (L.leadFrom || 0) ? L.introGain || 0 : 0), stepDur = 60 / L.bpm / L.sub;
    if (L.chords) {
      var nc = L.chords.length, c = Math.min(Math.floor(i / L.chordBeats), nc - 1);
      var k = i - c * L.chordBeats, ch = L.chords[c];
      if (k === 0) {
        // the last chord lasts to the end of the loop
        var pl = stepDur * (c === nc - 1 ? L.steps - i : L.chordBeats);
        ch.forEach(function (n, j) {
          // the top note (a triangle) leads; the lower ones are sines
          var lv = lg - 17 - (2 - j) * 2;
          var env = [[0, -70], [0.08, lv], [pl - 0.05, lv - 2], [pl + 0.05, -70]];
          play([O(j === 2 ? 'triangle' : 'sine', midi(n), env)], t, musicGain);
        });
      }
      var bell = ch[k === 1 ? 2 : 1] + 12;
      play([O('sine', midi(bell), [[0, -70], [0.01, lg - 26], [0.25, lg - 38], [0.35, -70]])], t, musicGain);
    }
    if (L.kick && at(L.kick, i, 16)) {
      play([O('sine', [[0, 120], [0.06, 55], [0.25, 40]], [[0, -70], [0.004, lg - 6], [0.12, lg - 12], [0.3, -70]])],
        t, musicGain);
    }
    var b = L.bass && at(L.bass, i, 16);
    if (b) {
      var bd = stepDur * (L.bassLen || 1.9);
      play([O('triangle', midi(b), [[0, -70], [0.01, lg - 11], [bd, lg - 18], [bd + 0.04, -70]],
        [lp(L.bassLP || 300, 0.8)])], t, musicGain);
    }
    var m = L.lead && Math.floor(i / 16) >= (L.leadFrom || 0) && at(L.lead, i - 16 * (L.leadFrom || 0), 16);
    if (m) {
      var md = stepDur * (L.leadLen || 1.6), ll = lg + (L.leadGain || 0);
      play([O('square', midi(m), [[0, -70], [0.01, ll - 27], [md, ll - 33], [md + 0.03, -70]], [lp(1400, 0.7)])],
        t, musicGain);
    }
  }

  // Schedule ahead in audio time (0.2 s, topped up every 50 ms) so the tempo does not drift with
  // timer jitter.
  function schedule() {
    var a = ac();
    timer = null;
    if (!a || !current) return;
    var L = loops[current];
    var stepDur = 60 / L.bpm / L.sub;
    if (nextT < a.currentTime) nextT = a.currentTime + 0.05;
    while (nextT < a.currentTime + 0.2) {
      playStep(L, step % L.steps, nextT - a.currentTime);
      nextT += stepDur;
      step++;
    }
    timer = setTimeout(schedule, 50);
  }

  function startMusic() {
    stopMusic();
    step = 0;
    nextT = 0;
    if (current && (musicOn || forced) && ctx && ctx.state === 'running') schedule();
  }

  function stopMusic() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function killAll() {
    var now = ctx ? ctx.currentTime : 0;
    live.splice(0).forEach(function (s) { try { s.stop(now); } catch (e) {} });
  }

  SRPG.sound = {
    play: function (name) {
      if (!sfxOn || !sfx[name]) return;
      trimNow = TRIM[name] || 0;
      try { sfx[name](); } catch (e) {}
      trimNow = 0;
    },
    // Start a named music loop from the top (no-op if it is already the current loop); null stops
    // it. force: play it even with music switched off, as the original's arrival after the intro
    // or a load starts main.mp3 without checking the option (the next switch stops it).
    // A change of loop is the original's LoopX.stop(), which silences every sound.
    music: function (name, force) {
      if (name === current && (!force || forced || musicOn)) return;
      if (name !== current) killAll();
      current = name;
      forced = !!(force && name);
      startMusic();
    },
    // MUSIC ON is LoopB.start(): the loop from the top. MUSIC OFF is LoopB.stop(): every sound
    // stops.
    setMusic: function (on) {
      musicOn = !!on;
      forced = false;
      if (!musicOn) killAll();
      startMusic();
    },
    get musicOn() { return musicOn; },
    // The original's stopSounds / stop() on any of its global Sound objects: every effect and the
    // music stop (music(name) starts a loop again from the top).
    stopAll: function () {
      stopMusic();
      current = null;
      forced = false;
      killAll();
    },
    // The original's global Sound.setVolume(0-100): 50 on the title screen, 100 from START / LOAD.
    setVolume: function (v) {
      volume = Math.max(0, v) / 100;
      if (master) master.gain.setValueAtTime(volume, ctx.currentTime);
    },
    get volume() { return Math.round(volume * 100); },
    setSfx: function (on) { sfxOn = !!on; },
    get sfxOn() { return sfxOn; },
    // for tests: the loop, its next step, and how many sources are still playing
    state: function () {
      return { music: current, playing: !!timer, step: step, sources: live.length, volume: Math.round(volume * 100) };
    },
    // for tests: a loop's tempo and length
    loopInfo: function (name) {
      var L = loops[name];
      return L ? { bpm: L.bpm, beats: L.steps / L.sub, seconds: L.steps / L.sub * 60 / L.bpm } : null;
    },
    // Browsers only allow audio after a user gesture; engine.js calls this on the first input.
    unlock: function () {
      var a = ac();
      if (!a) return;
      var go = function () { if (!timer && current && (musicOn || forced)) schedule(); };
      if (a.state === 'suspended') a.resume().then(go);
      else go();
    },
  };
})();
