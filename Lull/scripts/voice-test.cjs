// Lull — the announcer in the browser (js/audio.js, Announcer; js/voice-<id>.js): her lines for each clear, and in each voice every clip
// decoding with where her speech is, each played from its trimmed start, and her mix measured through her real chain
// with OfflineAudioContext (scripts/voice-measure.cjs): one level, a ceiling, no clicks, her place under the sound
// effects and over the music, the music's duck, and the voices at one level together. Prints a table of each clip, raw and mixed.
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
  const ids = await ev(() => Object.keys(Lull.VOICES)), levels = {};
  check('two announcer voices, Annie (the default) and Velvet', JSON.stringify(ids) === '["annie","velvet"]' && (await ev(() => Lull.defaultState().settings.announcerVoice)) === 'annie', JSON.stringify(ids));
  for (const id of ids) {
    await ev((v) => Lull.Announcer.setVoice(v), id);
    console.log('  ' + id);
    const clips = await ev(async () => { const out = {}; for (const k of Object.keys(Lull.Announcer.pack().clips)) { const b = await Lull.Announcer.decode(k); out[k] = b ? { file: +b.duration.toFixed(2), said: +Lull.Announcer.span(k, b).dur.toFixed(2) } : 0; } return out; });
    check(id + ': ' + 'every announcer clip decodes, with where her speech is (the part played: 0.3–2 s)', Object.keys(clips).length === 11 && VOICE_KEYS.every((k) => clips[k] && clips[k].said > 0.3 && clips[k].said < 2 && clips[k].said <= clips[k].file), JSON.stringify(clips));
    // She speaks right on the event: each key is played from just before its speech (its meta's start, less 20 ms of
    // pre-roll), never from the top of the file (every clip opens with a fifth of a second or so of silence).
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
          const m = A.pack().meta[k], s = seen[0] || {};
          out[k] = { offset: s.offset, want: Math.max(0, m.start - A.PRE), end: s.offset + s.duration, speechEnd: m.end };
        }
      } finally { P.start = real; }
      return out;
    }, VOICE_KEYS);
    check(id + ': ' + 'the announcer plays each clip from its trimmed start (20 ms before her speech) to just past its end', VOICE_KEYS.every((k) => {
      const s = starts[k];
      return s && Math.abs(s.offset - s.want) < 1e-6 && s.end > s.speechEnd && s.end < s.speechEnd + 0.15;
    }) && VOICE_KEYS.every((k) => starts[k].offset > 0.1), JSON.stringify(starts));
    // Her mix, every call rendered through her real chain (OfflineAudioContext): one level (a gated RMS of the speech,
    // about what a loudness meter reads) within ±1 dB; well under the limiter at the default volumes (it never acts) and
    // under −1 dBFS at full volume; no click where a clip is cut in or out; a few dB under the sound effects; and over
    // the music, ducked, at the default volumes.
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
          const x = cooked.getChannelData(0), xr = raw.getChannelData(0);
          out[k] = {
            rawLoud: r1(M.loudness(xr, raw.sampleRate, at, end)), loud: r1(M.loudness(x, cooked.sampleRate, at, end)),
            rawPeak: r1(M.peak(xr)), peakDefault: r1(Math.max(M.peak(x), M.peak(cooked.getChannelData(1)))),
            peak: r1(Math.max(M.peak(full.getChannelData(0)), M.peak(full.getChannelData(1)))),
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
      // The music at its default volume (12 s from the top): its usual level (the median of 0.4 s windows), less the duck.
      const keepMV = Mu.volume;
      let music;
      try {
        Mu.setVolume(Lull.defaultState().settings.musicVolume);
        const ws = [], r = await S.offline(13, (c) => { Mu.render(c, 13, 0); }), d = r.getChannelData(0), e = r.getChannelData(1), w = Math.floor(r.sampleRate * 0.4), h = Math.floor(r.sampleRate * 0.05);
        for (let s = r.sampleRate; s + w <= d.length; s += h) { let a = 0; for (let i = s; i < s + w; i++) a += (d[i] * d[i] + e[i] * e[i]) / 2; ws.push(10 * Math.log10(a / w)); }
        ws.sort((a, b) => a - b);
        music = { median: r1(ws[ws.length >> 1]), ducked: r1(ws[ws.length >> 1] + 20 * Math.log10(Mu.DUCK)) };
      } finally { Mu.setVolume(keepMV); }
      return { clips: out, sfx, duck, music };
    }, VOICE_KEYS);
    {
      const C = voice.clips, louds = VOICE_KEYS.map((k) => C[k].loud), mean = louds.reduce((a, x) => a + x, 0) / louds.length;
      const fx = Object.values(voice.sfx), fxMean = fx.reduce((a, x) => a + x, 0) / fx.length, moms = VOICE_KEYS.map((k) => C[k].mom), momMean = moms.reduce((a, x) => a + x, 0) / moms.length;
      console.log('       clip           loudness raw → mixed   peak raw → mixed → full vol   jump in/out');
      for (const k of VOICE_KEYS) {
        const c = C[k];
        console.log('       ' + k.padEnd(14) + (c.rawLoud + ' → ' + c.loud + ' dB').padStart(19) + (c.rawPeak + ' → ' + c.peakDefault + ' → ' + c.peak + ' dBFS').padStart(31) + ('   ' + c.jumpIn + ' / ' + c.jumpOut));
      }
      console.log('       her momentary level ' + momMean.toFixed(1) + ' dB; sound effects ' + JSON.stringify(voice.sfx) + '; the music ' + JSON.stringify(voice.music) + '; the duck ' + JSON.stringify(voice.duck));
      check(id + ': ' + 'the announcer\'s calls are all one level (loudness within ±1 dB of their mean)', louds.every((l) => Math.abs(l - mean) <= 1), JSON.stringify(louds));
      check(id + ': ' + 'her limiter never acts at the default volumes (every peak 6 dB or more under its −3 dBFS ceiling)', VOICE_KEYS.every((k) => C[k].peakDefault < -9), JSON.stringify(VOICE_KEYS.map((k) => C[k].peakDefault)));
      check(id + ': ' + 'her peak stays under −1 dBFS at full volume (the limiter)', VOICE_KEYS.every((k) => C[k].peak < -1), JSON.stringify(VOICE_KEYS.map((k) => C[k].peak)));
      check(id + ': ' + 'no click where a clip is cut in or out (the 10 ms fade in, the 70 ms fade out)', VOICE_KEYS.every((k) => C[k].jumpIn < 0.01 && C[k].jumpOut < 0.01), JSON.stringify(VOICE_KEYS.map((k) => [C[k].jumpIn, C[k].jumpOut])));
      check(id + ': ' + 'she sits about 3.5–6.5 dB under the sound effects, and every call under them', fxMean - momMean >= 3.5 && fxMean - momMean <= 6.5 && Math.max(...moms) < fxMean - 2, JSON.stringify({ fxMean, momMean, moms }));
      check(id + ': ' + 'she is clearly over the music at the default volumes (every call 1.5 dB or more over its usual level, ducked)', Math.min(...moms) >= voice.music.ducked + 1.5, JSON.stringify({ moms, music: voice.music }));
      levels[id] = momMean;
    check(id + ': ' + 'the music ducks 3–5 dB while she speaks, smoothly (not all at once), and comes back', voice.duck.depth >= 3 && voice.duck.depth <= 5 && voice.duck.after20ms < voice.duck.depth - 0.5 && voice.duck.back < 0.5, JSON.stringify(voice.duck));
    }
  }
  const chosen = await ev(() => {
    const a = Lull.app, keep = a.settings.announcerVoice, out = [];
    try { for (const v of ['velvet', 'annie', 'gone']) { a.settings.announcerVoice = v; a.applySettings(); out.push(Lull.Announcer.voice, Object.keys(Lull.Announcer.pack().clips).length); } } finally { a.settings.announcerVoice = keep; a.applySettings(); }
    return out;
  });
  check('Settings ▸ Sound picks her voice (one not there falls back to Annie)', JSON.stringify(chosen) === '["velvet",11,"annie",11,"gone",11]' && (await ev(() => Lull.Announcer.pack() === Lull.VOICES.annie)), JSON.stringify(chosen));
  check('the voices sit at one level together (mean momentary levels within 1 dB)', Math.max(...Object.values(levels)) - Math.min(...Object.values(levels)) <= 1, JSON.stringify(levels));
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
