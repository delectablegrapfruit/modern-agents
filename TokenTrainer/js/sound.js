// Small synthesized sound effects (no audio files).
(function (root) {
  const TT = (root.TT = root.TT || {});
  let ctx = null;

  function tone(freq, start, dur, type = 'sine', gain = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + start);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02);
  }

  const SOUNDS = {
    tap: () => tone(660, 0, 0.06, 'triangle', 0.05),
    correct: () => { tone(784, 0, 0.12); tone(1175, 0.09, 0.22); },
    okay: () => { tone(587, 0, 0.12); tone(698, 0.1, 0.18); },
    wrong: () => { tone(220, 0, 0.18, 'sawtooth', 0.06); tone(185, 0.12, 0.25, 'sawtooth', 0.06); },
    complete: () => [523, 659, 784, 1047].forEach((f, k) => tone(f, k * 0.11, 0.3, 'triangle', 0.1)),
    fail: () => [392, 330, 262].forEach((f, k) => tone(f, k * 0.16, 0.3, 'triangle', 0.08)),
  };

  TT.sound = {
    play(name) {
      if (!TT.store.setting('sound')) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        SOUNDS[name] && SOUNDS[name]();
      } catch (e) { /* audio unavailable */ }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
