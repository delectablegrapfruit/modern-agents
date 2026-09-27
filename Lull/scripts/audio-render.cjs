#!/usr/bin/env node
// Renders Lull's synthesized audio offline in headless Chromium (no speakers needed) and measures it: every sound of
// a pack, and a stretch of Classic's music, each as a WAV plus peak, loudness, brightness (spectral centroid) and gaps.
//   node Lull/scripts/audio-render.cjs [out-dir] [pack=soft] [music-seconds=60] [music-from-bar=0]
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
const OUT = process.argv[2] || null;
const PACK = process.argv[3] || 'soft';
const MUSIC_SECONDS = Number(process.argv[4] || 60);
const MUSIC_BAR = Number(process.argv[5] || 0);
// Every event name the game plays, with the argument it usually carries.
const EVENTS = [['move'], ['rotate'], ['lower'], ['lock'], ['hold'], ['blocked'], ['clear', 1], ['clear', 2], ['clear', 3], ['quad'],
  ['tspin'], ['perfect'], ['combo', 3], ['combo', 9], ['boom'], ['drill'], ['buy'], ['error'], ['solve'], ['fail'], ['golden'], ['item'],
  ['stamp'], ['pack'], ['land'], ['bell']];

// ---- measuring ------------------------------------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
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

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.waitForTimeout(300);
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
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
