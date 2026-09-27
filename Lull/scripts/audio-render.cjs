#!/usr/bin/env node
// Renders Lull's synthesized audio offline in headless Chromium (no speakers needed) and measures it: every sound of
// a pack, and a stretch of Classic's music, each as a WAV plus peak, loudness, brightness (spectral centroid) and gaps.
//   node Lull/scripts/audio-render.cjs [out-dir] [pack=soft] [music-seconds=60] [music-from-bar=0]
// With --harmony it checks instead that sound effects sit in the music's chords: each pack's pitched sounds rendered
// on their own over one bar of every chord of the suite (tuned to it, and as the pack made them), the notes found in
// them, and how much of their power is on the chord's tones; plus, into out-dir, A/B mixes of the music with them.
//   node Lull/scripts/audio-render.cjs [out-dir] --harmony [pack=all]
// Needs Playwright, like browser-test.cjs.
'use strict';
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) {
    console.error('Playwright is not installed.');
    process.exit(0);
  }
}

const PAGE = 'file://' + path.join(__dirname, '..', 'Game', 'index.html');
const HARMONY = process.argv.includes('--harmony');
const ARGS = process.argv.slice(2).filter((a) => a !== '--harmony');
const OUT = ARGS[0] || null;
const PACK = ARGS[1] || (HARMONY ? null : 'soft');
const MUSIC_SECONDS = Number(ARGS[2] || 60);
const MUSIC_BAR = Number(ARGS[3] || 0);
// Every event name the game plays, with the argument it usually carries.
const EVENTS = [['move'], ['rotate'], ['lower'], ['lock'], ['hold'], ['blocked'], ['clear', 1], ['clear', 2], ['clear', 3], ['quad'],
  ['tspin'], ['perfect'], ['combo', 3], ['combo', 9], ['boom'], ['drill'], ['buy'], ['error'], ['solve'], ['fail'], ['golden'], ['item'],
  ['stamp'], ['pack'], ['land'], ['bell']];

// ---- measuring ------------------------------------------------------------------------------------------------------
const { fft, share, overBar, chordBars } = require('./pitch.cjs');
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -200);
function measure(L, R, rate) {
  const n = L.length, mono = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) { mono[i] = (L[i] + R[i]) / 2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  // Loudness: the loudest 300 ms stretch (RMS), so short and long sounds compare fairly.
  const win = Math.floor(rate * 0.3), hop = Math.floor(rate * 0.05);
  let loud = 0;
  for (let s = 0; s + win <= n || s === 0; s += hop) {
    let acc = 0;
    const end = Math.min(n, s + win);
    for (let i = s; i < end; i++) acc += mono[i] * mono[i];
    loud = Math.max(loud, Math.sqrt(acc / win));
    if (end === n) break;
  }
  // Brightness: centroid of the power spectrum, averaged over 2048-sample frames weighted by their energy.
  const N = 2048;
  const spec = new Float64Array(N / 2);
  for (let s = 0; s + N <= n; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mono[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) spec[k] += re[k] * re[k] + im[k] * im[k];
  }
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) { num += k * rate / N * spec[k]; den += spec[k]; }
  // Gaps: the quietest 100 ms after the first second (music only).
  let quiet = Infinity;
  const w2 = Math.floor(rate * 0.1);
  for (let s = rate; s + w2 <= n; s += w2) {
    let acc = 0;
    for (let i = s; i < s + w2; i++) acc += mono[i] * mono[i];
    quiet = Math.min(quiet, Math.sqrt(acc / w2));
  }
  return { peakDb: +db(peak).toFixed(1), loudDb: +db(loud).toFixed(1), centroid: Math.round(den ? num / den : 0), quietDb: quiet === Infinity ? null : +db(quiet).toFixed(1) };
}
function wav(L, R, rate) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return buf;
}

// ---- rendering in the page -----------------------------------------------------------------------------------------
// The page renders and hands back 16-bit samples as base64 (float arrays are too big to pass as JSON).
async function render(page, kind, a, b, seconds) {
  const out = await page.evaluate(async ([kind, a, b, seconds]) => {
    const S = Lull.Sound;
    const buf = await S.offline(seconds, (ctx) => {
      if (kind === 'music') Lull.Music.render(ctx, seconds, a);
      else { const { pack, list } = S.voices(a, b, kind); for (const v of list || []) S.voice(v, 0.02, pack); }
    });
    const enc = (d) => { const i16 = new Int16Array(d.length); for (let i = 0; i < d.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767))); let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    return { rate: buf.sampleRate, l: enc(buf.getChannelData(0)), r: enc(buf.getChannelData(1)) };
  }, [kind, a, b, seconds]);
  const dec = (s) => { const u8 = Buffer.from(s, 'base64'); const i16 = new Int16Array(u8.buffer, u8.byteOffset, u8.length / 2); return Float32Array.from(i16, (x) => x / 32767); };
  return { rate: out.rate, L: dec(out.l), R: dec(out.r) };
}

// ---- harmony: the sound effects against the music's chords -----------------------------------------------------------
// Pitched sounds worth hearing against a chord (the rest are noise, clicks and thuds, which are left alone).
const TONAL = [['rotate'], ['hold'], ['lock'], ['clear', 2], ['clear', 3], ['quad'], ['tspin'], ['perfect'], ['combo', 3], ['solve'], ['golden'], ['buy'], ['item'], ['bell']];

async function harmonyReport(page) {
  const packs = PACK ? [PACK] : await page.evaluate(() => Object.keys(Lull.Sound.PACKS));
  const bars = await chordBars(page);
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const report = {};
  console.log('share of the pitched sounds\' power on the chord\'s tones (a blip: on the key\'s), tuned / as made');
  console.log('pack        ' + Object.keys(bars).map((c) => c.padStart(13)).join(''));
  for (const pack of packs) {
    const row = {};
    for (const [chord, bar] of Object.entries(bars)) {
      let tunedOn = 0, rawOn = 0, n = 0, worst = 1;
      const offs = [], res = await overBar(page, pack, bar, TONAL);
      for (let i = 0; i < res.length; i += 2) {
        const a = res[i], b = res[i + 1];
        if (!a.found.length || a.glide || !a.pitched) continue;
        const sa = share(a.found, a.allowed), sb = share(b.found, b.allowed);
        tunedOn += sa.share; rawOn += sb.share; n++; worst = Math.min(worst, sa.share);
        if (sa.share < 0.9) offs.push(a.name + (a.arg || '') + ' ' + (sa.share * 100).toFixed(0) + '% (' + sa.off.slice(0, 3).map((x) => NAMES[x.pc]).join('/') + ')');
      }
      row[chord] = { tuned: n ? tunedOn / n : 1, raw: n ? rawOn / n : 1, worst, sounds: n, off: offs };
    }
    report[pack] = row;
    console.log(pack.padEnd(12) + Object.values(row).map((r) => ((r.tuned * 100).toFixed(0) + '% / ' + (r.raw * 100).toFixed(0) + '%').padStart(13)).join(''));
    for (const [chord, r] of Object.entries(row)) if (r.off.length) console.log('    ' + chord + ' below 90%: ' + r.off.join(' '));
  }
  return report;
}

/** Twenty seconds of the theme with big sounds landing off the beat, tuned and not, for listening side by side. */
async function harmonyMixes(page, pack) {
  for (const tuned of [true, false]) {
    const out = await page.evaluate(async ([pack, tuned]) => {
      const S = Lull.Sound, H = Lull.Harmony, SONG = Lull.SONG;
      const buf = await S.offline(20, (ctx) => {
        Lull.Music.render(ctx, 20, SONG.loopFrom);
        const seq = [['clear', 2, 1.3], ['quad', null, 3.9], ['tspin', null, 6.7], ['clear', 3, 9.2], ['perfect', null, 11.6], ['quad', null, 14.4], ['solve', null, 16.9]];
        for (const [n, arg, at] of seq) {
          const { pack: pk, list } = S.voices(n, arg, pack);
          const plan = tuned ? H.plan(n, list, at) : { list, delay: 0 };
          for (const v of plan.list) S.voice(v, at + plan.delay, pk);
        }
      });
      const enc = (d) => { const i16 = new Int16Array(d.length); for (let i = 0; i < d.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767))); let s = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
      return { rate: buf.sampleRate, l: enc(buf.getChannelData(0)), r: enc(buf.getChannelData(1)) };
    }, [pack, tuned]);
    const dec = (s) => { const u8 = Buffer.from(s, 'base64'); const i16 = new Int16Array(u8.buffer, u8.byteOffset, u8.length / 2); return Float32Array.from(i16, (x) => x / 32767); };
    fs.writeFileSync(path.join(OUT, 'harmony-' + pack + '-' + (tuned ? 'tuned' : 'as-made') + '.wav'), wav(dec(out.l), dec(out.r), out.rate));
  }
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  if (HARMONY) {
    const rep = await harmonyReport(page);
    if (OUT) {
      fs.writeFileSync(path.join(OUT, 'harmony.json'), JSON.stringify(rep, null, 1));
      for (const pack of Object.keys(rep)) await harmonyMixes(page, pack);
    }
    await browser.close();
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
    return;
  }
  const report = { pack: PACK, sounds: {}, music: null };
  for (const [name, arg] of EVENTS) {
    const r = await render(page, PACK, name, arg, 3.5);
    const key = name + (arg != null ? arg : '');
    report.sounds[key] = measure(r.L, r.R, r.rate);
    if (OUT) fs.writeFileSync(path.join(OUT, PACK + '-' + key + '.wav'), wav(r.L, r.R, r.rate));
  }
  if (MUSIC_SECONDS > 0) {
    const r = await render(page, 'music', MUSIC_BAR, null, MUSIC_SECONDS);
    report.music = measure(r.L, r.R, r.rate);
    if (OUT) fs.writeFileSync(path.join(OUT, 'music.wav'), wav(r.L, r.R, r.rate));
  }
  await browser.close();
  console.log('sound            peak dB  loud dB  centroid Hz');
  for (const [k, m] of Object.entries(report.sounds)) console.log(k.padEnd(16) + String(m.peakDb).padStart(8) + String(m.loudDb).padStart(9) + String(m.centroid).padStart(13));
  if (report.music) console.log('music ' + MUSIC_SECONDS + ' s: ' + JSON.stringify(report.music));
  if (OUT) fs.writeFileSync(path.join(OUT, 'audio-' + PACK + '.json'), JSON.stringify(report, null, 1));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
