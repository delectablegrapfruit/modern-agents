// Lull — the announcer in the browser (js/audio.js, Announcer; js/voice-data.js): her lines for each clear, every clip
// decoding with where her speech is, each played from its trimmed start, and her mix measured through her real chain
// with OfflineAudioContext (scripts/voice-measure.cjs): one level, a ceiling, no clicks, the de-esser, her place under
// the sound effects and the music's duck. Prints a table of each clip, raw and mixed.
// Run by browser-test.cjs: require('./voice-test.cjs')({ browser, check, PAGE }); or on its own:
//   node Lull/scripts/voice-test.cjs
'use strict';
const path = require('path');

async function voiceTests({ browser, check, PAGE }) {
  console.log('the announcer');
  const ctx = await browser.newContext({ viewport: { width: 520, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(400);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const ann = await ev(() => { const A = Lull.Announcer; return [A.phrase({ lines: 1 }), A.phrase({ lines: 4, b2b: true }), A.phrase({ twist: true, lines: 2 }), A.phrase({ twist: true, lines: 3 }), A.phrase({ mini: true, lines: 0 }), A.phrase({ lines: 0 }), A.phrase({ lines: 2, perfect: true }, 3)]; });
  check('the announcer knows its lines', JSON.stringify(ann) === JSON.stringify([['single'], ['streak', 'quad'], ['twist_double'], ['twist', 'triple'], ['twist'], null, ['double', 'spotless', 'levelup']]), JSON.stringify(ann));
  const VOICE_KEYS = ['single', 'double', 'triple', 'quad', 'twist', 'twist_single', 'twist_double', 'streak', 'spotless', 'levelup', 'gameover'];
  const clips = await ev(async () => { const out = {}; for (const k of Object.keys(Lull.VOICE_CLIPS)) { const b = await Lull.Announcer.decode(k); out[k] = b ? { file: +b.duration.toFixed(2), said: +Lull.Announcer.span(k, b).dur.toFixed(2) } : 0; } return out; });
  check('every announcer clip decodes, with where her speech is (the part played: 0.3–2 s)', Object.keys(clips).length === 11 && VOICE_KEYS.every((k) => clips[k] && clips[k].said > 0.3 && clips[k].said < 2 && clips[k].said <= clips[k].file), JSON.stringify(clips));
  // She speaks right on the event: each key is played from just before its speech (VOICE_META.start, less 20 ms of
  // pre-roll), never from the top of the file (some clips have nearly two seconds of silence first).
  const starts = await ev(async (keys) => {
    const A = Lull.Announcer, P = AudioBufferSourceNode.prototype, real = P.start, seen = [];
    P.start = function (when, offset, duration) { seen.push({ offset, duration, len: this.buffer && this.buffer.duration }); return real.call(this, when, offset, duration); };
    const out = {};
    try {
      for (const k of keys) {
        seen.length = 0;
        const was = A.enabled; A.enabled = true;
        A.say([k]);
        A.enabled = was;
        for (let i = 0; i < 40 && !seen.length; i++) await new Promise((r) => setTimeout(r, 25));
        const m = Lull.VOICE_META[k], s = seen[0] || {};
        out[k] = { offset: s.offset, want: Math.max(0, m.start - A.PRE), end: s.offset + s.duration, speechEnd: m.end };
      }
    } finally { P.start = real; }
    return out;
  }, VOICE_KEYS);
  check('the announcer plays each clip from its trimmed start (20 ms before her speech) to just past its end', VOICE_KEYS.every((k) => {
    const s = starts[k];
    return s && Math.abs(s.offset - s.want) < 1e-6 && s.end > s.speechEnd && s.end < s.speechEnd + 0.15;
  }) && starts.gameover.offset > 1.8 && starts.quad.offset > 0.5 && starts.twist_single.offset > 0.7, JSON.stringify(starts));
  // Her mix, every call rendered through her real chain (OfflineAudioContext): one level (a gated RMS of the speech,
  // about what a loudness meter reads) within ±1 dB; under −1 dBFS at full volume; no click where a clip is cut in or
  // out; less of the 5–9 kHz hiss against the 1–4 kHz body than the raw clip; and clearly under the sound effects.
  await page.evaluate(require('./voice-measure.cjs').SRC);
  const voice = await ev(async (keys) => {
    const S = Lull.Sound, A = Lull.Announcer, M = window.VoiceMeasure, keepA = A.volume, keepS = S.volume, out = {};
    const mom = (buf) => {
      const d = buf.getChannelData(0), e = buf.getChannelData(1), w = Math.floor(buf.sampleRate * 0.4), h = Math.floor(buf.sampleRate * 0.05);
      let m = 0;
      for (let s = 0; s + w <= d.length; s += h) { let a = 0; for (let i = s; i < s + w; i++) a += (d[i] * d[i] + e[i] * e[i]) / 2; m = Math.max(m, a / w); }
      return +(10 * Math.log10(m)).toFixed(1);
    };
    const sfx = {};
    for (const n of ['clear', 'quad', 'twist', 'perfect']) sfx[n] = mom(await S.offline(2.5, () => { const { pack, list } = S.voices(n, 2, 'soft'); for (const v of list) S.voice(v, 0.02, pack); }));
    const r1 = (x) => Math.round(x * 10) / 10, at = 0.05;
    try {
      for (const k of keys) {
        const buf = await A.decode(k), sp = A.span(k, buf), end = at + sp.dur;
        // Raw: the same cut and trim straight to the speakers; processed: through her bus, at the default volumes.
        A.setVolume(Lull.defaultState().settings.announcerVolume); S.volume = Lull.defaultState().settings.volume != null ? Lull.defaultState().settings.volume : keepS;
        A.input = null;
        const raw = await S.offline(sp.dur + 0.3, () => { A.clip(k, buf, at, S.ctx.destination); });
        A.input = null;
        const cooked = await S.offline(sp.dur + 0.6, () => { A.clip(k, buf, at); });
        // At full volume (Volume and Announcer volume both 100 %): the peak.
        A.setVolume(1); S.volume = 1; A.input = null;
        const full = await S.offline(sp.dur + 0.6, () => { A.clip(k, buf, at); });
        const x = cooked.getChannelData(0), xr = raw.getChannelData(0), b0 = M.bands(xr, raw.sampleRate, at, end), b1 = M.bands(x, cooked.sampleRate, at, end);
        out[k] = {
          rawLoud: r1(M.loudness(xr, raw.sampleRate, at, end)), loud: r1(M.loudness(x, cooked.sampleRate, at, end)),
          rawPeak: r1(M.peak(xr)), peak: r1(Math.max(M.peak(full.getChannelData(0)), M.peak(full.getChannelData(1)))),
          rawHiss: r1(b0.ratio), hiss: r1(b1.ratio),
          jumpIn: +M.jump(x, cooked.sampleRate, at, 3).toFixed(4), jumpOut: +M.jump(x, cooked.sampleRate, end, 3).toFixed(4), mom: mom(cooked),
        };
      }
    } finally { A.input = null; A.setVolume(keepA); S.volume = keepS; }
    // The duck: the music's own level, while she speaks from 0.2 s to 0.8 s.
    const Mu = Lull.Music, keepG = Mu.gain, keepV = Mu.volume;
    let duck;
    try {
      const ctx = new OfflineAudioContext(1, 44100 * 2, 44100), src = ctx.createConstantSource(), g = ctx.createGain();
      g.gain.value = Mu.volume; src.connect(g).connect(ctx.destination); src.start();
      Mu.gain = g;
      Mu.duck(0.2, 0.8);
      const d = (await ctx.startRendering()).getChannelData(0), lv = (t) => 20 * Math.log10(d[Math.round(t * 44100)] / Mu.volume);
      duck = { depth: r1(-lv(0.7)), after20ms: r1(-lv(0.21)), back: r1(-lv(1.9)) };
    } finally { Mu.gain = keepG; Mu.volume = keepV; }
    return { clips: out, sfx, duck };
  }, VOICE_KEYS);
  {
    const C = voice.clips, louds = VOICE_KEYS.map((k) => C[k].loud), mean = louds.reduce((a, x) => a + x, 0) / louds.length;
    const fx = Object.values(voice.sfx), fxMean = fx.reduce((a, x) => a + x, 0) / fx.length, moms = VOICE_KEYS.map((k) => C[k].mom), momMean = moms.reduce((a, x) => a + x, 0) / moms.length;
    console.log('       clip           loudness raw → mixed   peak raw → full vol   hiss (5–9k vs 1–4k) raw → mixed   jump in/out');
    for (const k of VOICE_KEYS) {
      const c = C[k];
      console.log('       ' + k.padEnd(14) + (c.rawLoud + ' → ' + c.loud + ' dB').padStart(19) + (c.rawPeak + ' → ' + c.peak + ' dBFS').padStart(23) + (c.rawHiss + ' → ' + c.hiss + ' dB').padStart(25) + ('   ' + c.jumpIn + ' / ' + c.jumpOut));
    }
    console.log('       sound effects ' + JSON.stringify(voice.sfx) + '; the duck ' + JSON.stringify(voice.duck));
    check('the announcer\'s calls are all one level (loudness within ±1 dB of their mean)', louds.every((l) => Math.abs(l - mean) <= 1), JSON.stringify(louds));
    check('her peak stays under −1 dBFS at full volume (the limiter)', VOICE_KEYS.every((k) => C[k].peak < -1), JSON.stringify(VOICE_KEYS.map((k) => C[k].peak)));
    check('no click where a clip is cut in or out (the 10 ms fade in, the 70 ms fade out)', VOICE_KEYS.every((k) => C[k].jumpIn < 0.01 && C[k].jumpOut < 0.01), JSON.stringify(VOICE_KEYS.map((k) => [C[k].jumpIn, C[k].jumpOut])));
    check('the de-esser: less 5–9 kHz hiss against the 1–4 kHz body than the raw clip, on every call', VOICE_KEYS.every((k) => C[k].hiss < C[k].rawHiss - 0.5), JSON.stringify(VOICE_KEYS.map((k) => [C[k].rawHiss, C[k].hiss])));
    check('she sits about 6–8 dB under the sound effects, and every call under them', fxMean - momMean >= 6 && fxMean - momMean <= 8.5 && Math.max(...moms) < fxMean - 4, JSON.stringify({ fxMean, momMean, moms }));
    check('the music ducks 3–5 dB while she speaks, smoothly (not all at once), and comes back', voice.duck.depth >= 3 && voice.duck.depth <= 5 && voice.duck.after20ms < voice.duck.depth - 0.5 && voice.duck.back < 0.5, JSON.stringify(voice.duck));
  }
  check('no page errors in the announcer\'s checks', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

module.exports = voiceTests;

if (require.main === module) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); }
  (async () => {
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    let failures = 0;
    const check = (name, ok, extra) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (extra && !ok ? ' — ' + extra : '')); if (!ok) failures++; };
    try { await voiceTests({ browser, check, PAGE: 'file://' + path.join(__dirname, '..', 'Game', 'index.html') }); } finally { await browser.close(); }
    console.log(failures ? failures + ' failed' : 'all passed');
    process.exit(failures ? 1 : 0);
  })();
}
