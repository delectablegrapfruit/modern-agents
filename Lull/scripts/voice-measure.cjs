// Lull — the announcer's measuring tape, shared by scripts/voice-clips.cjs (which records each clip's speech start,
// end and loudness trim into Game/js/voice-data.js) and scripts/browser-test.cjs (which holds the rendered calls to
// it). It runs in the page: page.evaluate(VoiceMeasure.SRC) defines window.VoiceMeasure, whose functions take a
// channel (Float32Array) and its sample rate.
//
//   span(x, rate)               -> { start, end } in seconds: where the speech is (10 ms frames of the signal above
//                                  100 Hz; the loudest run of them over a gate 30 dB under the loudest frame, and any
//                                  run close by within 12 dB of it, so a lone breath or a click at the end is left out)
//   loudness(x, rate, from, to) -> dB: the speech's level, a gated RMS (frames within 20 dB of the loudest), roughly
//                                  what a loudness meter reads for one short word
//   bands(x, rate, from, to)    -> { sib, body, ratio }: power in 5–9 kHz and 1–4 kHz (dB), and sib − body (the
//                                  harshness a de-esser should lower)
//   peak(x)                     -> dBFS
//   jump(x, rate, at, ms)       -> the largest sample-to-sample step within ms of a time (a click shows as a jump)
'use strict';

const SRC = `(() => {
  const db = (p) => (p > 0 ? 10 * Math.log10(p) : -200);
  function hp(x, rate) {
    // First-order high-pass at 100 Hz: breath rumble does not decide where the word is.
    const a = Math.exp(-2 * Math.PI * 100 / rate), y = new Float32Array(x.length);
    let px = 0, py = 0;
    for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
    return y;
  }
  function frames(x, rate, ms) {
    const n = Math.max(1, Math.round(rate * (ms || 10) / 1000)), out = [];
    for (let s = 0; s + n <= x.length; s += n) { let a = 0; for (let i = s; i < s + n; i++) a += x[i] * x[i]; out.push(db(a / n)); }
    return { db: out, step: n / rate };
  }
  function span(x, rate) {
    // Runs of frames over a low gate (30 dB under the loudest), joined across gaps under 150 ms; the run with the
    // loudest frame is the word, and a run near it (under 450 ms away) joins it if it is within 12 dB of the loudest
    // (the second word of "twist single"). A lone breath before or after the word, or a click at the end, does not.
    // The first 20 ms and the last 50 ms are left out: the clips start and end on a short click of the encoder's.
    const f = frames(hp(x, rate), rate, 10), d = f.db.slice(0, Math.max(1, f.db.length - 5)), n = d.length;
    for (let i = 0; i < Math.min(2, n - 1); i++) d[i] = -200;
    const loud = Math.max(...d), sorted = d.filter((v) => v > -200).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.1)];
    const gate = Math.max(loud - 30, floor + 6), join = Math.round(0.15 / f.step), near = Math.round(0.45 / f.step);
    const runs = [];
    for (let i = 0; i < n; i++) {
      if (d[i] <= gate) continue;
      const last = runs[runs.length - 1];
      if (last && i - last.b <= join) { last.b = i; last.top = Math.max(last.top, d[i]); }
      else runs.push({ a: i, b: i, top: d[i] });
    }
    const main = runs.findIndex((r) => r.top === loud);
    let a = main, b = main;
    for (let grew = true; grew;) {
      grew = false;
      if (a > 0 && runs[a].a - runs[a - 1].b <= near && runs[a - 1].top >= loud - 12) { a--; grew = true; }
      if (b < runs.length - 1 && runs[b + 1].a - runs[b].b <= near && runs[b + 1].top >= loud - 12) { b++; grew = true; }
    }
    return { start: runs[a].a * f.step, end: (runs[b].b + 1) * f.step, gate, floor, loud };
  }
  function loudness(x, rate, from, to) {
    const a = Math.max(0, Math.floor((from || 0) * rate)), b = Math.min(x.length, Math.ceil((to == null ? x.length / rate : to) * rate));
    const f = frames(hp(x.subarray(a, b), rate), rate, 20), d = f.db, top = Math.max(...d);
    const kept = d.filter((v) => v > top - 20);
    return db(kept.reduce((s, v) => s + Math.pow(10, v / 10), 0) / kept.length);
  }
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  function bands(x, rate, from, to) {
    const N = 2048, a = Math.max(0, Math.floor((from || 0) * rate)), b = Math.min(x.length, Math.ceil((to == null ? x.length / rate : to) * rate));
    let sib = 0, body = 0;
    for (let s = a; s + N <= b || s === a; s += N / 2) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N && s + i < x.length; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const hz = k * rate / N, p = re[k] * re[k] + im[k] * im[k];
        if (hz >= 5000 && hz <= 9000) sib += p; else if (hz >= 1000 && hz <= 4000) body += p;
      }
      if (s + N >= b) break;
    }
    return { sib: db(sib), body: db(body), ratio: db(sib) - db(body) };
  }
  function peak(x) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m > 0 ? 20 * Math.log10(m) : -200; }
  function jump(x, rate, at, ms) {
    const c = Math.round(at * rate), w = Math.round(rate * (ms || 3) / 1000);
    let m = 0;
    for (let i = Math.max(1, c - w); i < Math.min(x.length, c + w); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
    return m;
  }
  window.VoiceMeasure = { span, loudness, bands, peak, jump, frames };
})();`;

module.exports = { SRC };
