// Synthesized sound effects and music loops (Web Audio) — no audio files. The names mirror the
// original's sounds: click, error, eat, drink, work, purchase, fall, carhit, footstep, skate,
// ansmachine, roulette, reel, handle, win, ignition, crash. Music loops: 'beginning' (title),
// 'main' (city), 'inside' (buildings), 'fight' (bar fight).
(function () {
  'use strict';
  var SRPG = window.SRPG;
  var ctx = null;
  var master = null;
  var musicGain = null;
  var sfxOn = true;

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.35;
        musicGain.connect(master);
      } catch (e) {
        return null;
      }
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo, dest) {
    var a = ac();
    if (!a) return;
    var t = a.currentTime + (when || 0);
    var o = a.createOscillator();
    var g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol || 0.08, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(dur, vol, when, hp) {
    var a = ac();
    if (!a) return;
    var t = a.currentTime + (when || 0);
    var n = Math.floor(a.sampleRate * dur);
    var buf = a.createBuffer(1, n, a.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = a.createBufferSource();
    src.buffer = buf;
    var f = a.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp || 600;
    var g = a.createGain();
    g.gain.setValueAtTime(vol || 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  var sfx = {
    click: function () { tone(900, 0.04, 'square', 0.04); },
    error: function () { tone(180, 0.09, 'square', 0.07); tone(140, 0.12, 'square', 0.07, 0.09); },
    eat: function () { noise(0.06, 0.12, 0, 1500); noise(0.06, 0.12, 0.12, 1500); noise(0.06, 0.1, 0.24, 1500); },
    drink: function () { for (var i = 0; i < 4; i++) tone(300 + i * 60, 0.08, 'sine', 0.08, i * 0.1, 500 + i * 60); },
    work: function () { tone(1318, 0.07, 'square', 0.05); tone(1760, 0.14, 'square', 0.05, 0.07); noise(0.05, 0.05, 0, 3000); },
    purchase: function () { tone(1046, 0.06, 'square', 0.05); tone(1568, 0.16, 'square', 0.05, 0.06); },
    fall: function () { tone(900, 1.1, 'sine', 0.1, 0, 90); },
    carhit: function () { noise(0.35, 0.3, 0, 200); tone(110, 0.3, 'sawtooth', 0.12, 0, 50); },
    crash: function () { noise(0.6, 0.35, 0, 150); tone(80, 0.5, 'sawtooth', 0.12, 0, 40); },
    footstep: function () { noise(0.03, 0.035, 0, 2500); },
    skate: function () { noise(0.08, 0.03, 0, 800); },
    ansmachine: function () { tone(1400, 0.12, 'sine', 0.07); tone(1400, 0.12, 'sine', 0.07, 0.2); },
    roulette: function () { for (var i = 0; i < 40; i++) tone(1800, 0.015, 'square', 0.025, i * (0.05 + i * 0.004)); },
    reel: function () { noise(0.05, 0.08, 0, 2000); tone(600, 0.05, 'square', 0.04); },
    handle: function () { tone(220, 0.15, 'triangle', 0.1, 0, 110); noise(0.1, 0.06, 0.02, 800); },
    win: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, 0.12, 'square', 0.05, i * 0.09); }); },
    ignition: function () { noise(0.5, 0.12, 0, 100); tone(60, 0.6, 'sawtooth', 0.08, 0.1, 90); },
    punch: function () { noise(0.08, 0.25, 0, 300); tone(90, 0.1, 'square', 0.1, 0, 50); },
    swoosh: function () { noise(0.15, 0.06, 0, 1200); },
    fireball: function () { noise(0.4, 0.15, 0, 400); tone(300, 0.4, 'sawtooth', 0.05, 0, 900); },
    energy: function () { tone(200, 0.5, 'sine', 0.1, 0, 1600); tone(400, 0.5, 'triangle', 0.05, 0.05, 2400); },
    stat: function () { tone(784, 0.08, 'triangle', 0.08); tone(1175, 0.18, 'triangle', 0.08, 0.08); },
    sleep: function () { [392, 330, 294, 262].forEach(function (f, i) { tone(f, 0.3, 'sine', 0.07, i * 0.22); }); },
    dart: function () { tone(1200, 0.05, 'triangle', 0.05, 0, 400); noise(0.03, 0.08, 0.06, 1500); },
    cards: function () { noise(0.05, 0.06, 0, 3000); },
    // the intro's sleeper: a 2.3 s swelling hiss, the band sweeping up as he breathes in
    breath: function () {
      var a = ac();
      if (!a) return;
      var dur = 2.4, t = a.currentTime;
      var n = Math.floor(a.sampleRate * dur);
      var buf = a.createBuffer(1, n, a.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      var src = a.createBufferSource();
      src.buffer = buf;
      var bp = a.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(450, t);
      bp.frequency.linearRampToValueAtTime(900, t + 0.7);
      bp.frequency.linearRampToValueAtTime(2400, t + 1.4);
      bp.frequency.linearRampToValueAtTime(2300, t + dur);
      var g = a.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.2);
      g.gain.linearRampToValueAtTime(0.18, t + 0.5);
      g.gain.linearRampToValueAtTime(0.26, t + 1.2);
      g.gain.linearRampToValueAtTime(0.14, t + 1.5);
      g.gain.linearRampToValueAtTime(0.05, t + 1.95);
      g.gain.linearRampToValueAtTime(0.0001, t + 2.3);
      src.connect(bp);
      bp.connect(g);
      g.connect(master);
      src.start(t);
    },
    // the results screen's rank stamp: a short low thud
    stamp: function () { noise(0.12, 0.3, 0, 120); tone(70, 0.2, 'sine', 0.2, 0, 45); },
    door: function () { noise(0.12, 0.08, 0, 600); tone(160, 0.08, 'triangle', 0.05, 0.02, 120); },
    chip: function () { tone(2400, 0.03, 'square', 0.03); tone(2000, 0.03, 'square', 0.03, 0.03); },
  };

  // --- Music: tiny step sequencer. Each loop: tempo (bpm), bass line, melody (semitone offsets
  // from a root; null = rest), 16 steps per bar.
  var N = null;
  var loops = {
    beginning: { bpm: 96, root: 57, wave: 'triangle', bass: [0, N, N, N, 7, N, N, N, 5, N, N, N, 3, N, N, N],
      mel: [12, N, 15, N, 19, N, 17, 15, 12, N, 10, N, 12, N, N, N, 12, N, 15, N, 19, N, 22, N, 19, N, 17, N, 15, N, N, N] },
    main: { bpm: 118, root: 45, wave: 'square', bass: [0, N, 0, N, 7, N, 0, N, 5, N, 5, N, 7, N, 3, N],
      mel: [24, N, 22, 24, N, 19, N, 17, 19, N, 15, N, 17, N, N, N, 24, N, 22, 24, N, 27, N, 24, 22, N, 19, N, 17, N, 19, N] },
    inside: { bpm: 100, root: 50, wave: 'sine', bass: [0, N, N, 7, N, N, 5, N, 0, N, N, 7, N, N, 3, N],
      mel: [19, N, N, 17, 15, N, 12, N, 14, N, N, 15, 17, N, N, N, 19, N, N, 22, 24, N, 22, N, 19, N, 17, N, 15, N, N, N] },
    fight: { bpm: 150, root: 40, wave: 'sawtooth', bass: [0, 0, 12, 0, 0, 12, 0, 10, 0, 0, 12, 0, 7, 8, 10, 12],
      mel: [24, N, 24, 27, N, 24, 29, N, 27, N, 24, N, 22, N, 24, N, 24, N, 24, 27, N, 31, 29, N, 27, N, 24, N, 22, 20, 22, N] },
  };
  var current = null;
  var timer = null;
  var step = 0;
  var musicOn = true;
  var forced = false; // playing although music is off (see music())

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function schedule() {
    var a = ac();
    if (!a || !current) return;
    var L = loops[current];
    var stepDur = 60 / L.bpm / 4;
    var b = L.bass[step % L.bass.length];
    var m = L.mel[step % L.mel.length];
    if (b !== null) tone(midi(L.root + b), stepDur * 1.8, 'triangle', 0.09, 0, null, musicGain);
    if (m !== null) tone(midi(L.root + m), stepDur * 1.5, L.wave, L.wave === 'sine' ? 0.06 : 0.035, 0, null, musicGain);
    if (current === 'fight' && step % 4 === 0) noise(0.04, 0.05, 0, 4000);
    if (current === 'main' && step % 8 === 4) noise(0.03, 0.03, 0, 5000);
    step++;
    timer = setTimeout(schedule, stepDur * 1000);
  }

  SRPG.sound = {
    play: function (name) {
      if (!sfxOn || !sfx[name]) return;
      try { sfx[name](); } catch (e) {}
    },
    // Start a named music loop from the top (no-op if it is already the current loop). null stops
    // music. force: play it even with music switched off, as the original's arrival after the
    // intro or a load starts main.mp3 without checking the option (the next switch stops it).
    music: function (name, force) {
      if (name === current && (!force || forced || musicOn)) return;
      if (timer) clearTimeout(timer);
      timer = null;
      current = name;
      step = 0;
      forced = !!(force && name);
      if (name && (musicOn || forced) && ctx && ctx.state === 'running') schedule();
    },
    setMusic: function (on) {
      musicOn = !!on;
      forced = false;
      if (timer) clearTimeout(timer);
      timer = null;
      if (musicOn && current && ctx && ctx.state === 'running') schedule();
    },
    get musicOn() { return musicOn; },
    setSfx: function (on) { sfxOn = !!on; },
    get sfxOn() { return sfxOn; },
    // Browsers only allow audio after a user gesture; engine.js calls this on the first input.
    unlock: function () {
      var a = ac();
      if (!a) return;
      if (a.state === 'suspended') a.resume().then(function () { if (!timer && current && (musicOn || forced)) schedule(); });
      else if (!timer && current && (musicOn || forced)) schedule();
    },
  };
})();
