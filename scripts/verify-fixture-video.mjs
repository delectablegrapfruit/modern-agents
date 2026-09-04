#!/usr/bin/env node
/* Verifies the fixture clips produced by scripts/gen-fixture-video.mjs:
 *
 *  1. Container check (pure Node EBML walk): frame count, duration, keyframe interval, cue points,
 *     keyframe vs inter-frame sizes, colour metadata.
 *  2. Browser check (headless Chromium, clips served same-origin from a local http server):
 *     seeks to fixed / random / keyframe-offset / per-second targets, waits for 'seeked' and the
 *     next requestVideoFrameCallback, decodes the shown frame with test/fixtures/decode-frame.js
 *     and compares against the expected frame index; records the seek latency
 *     (performance.now() from `currentTime = t` to 'seeked', and to the rVFC).
 *
 * Usage: node scripts/verify-fixture-video.mjs [--json out.json] [--only short|long] [--quiet]
 * Exits non-zero when a check fails.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer } from '../test/helpers/static-server.mjs';
import { CLIPS, FIXTURE_DIR, SPEC } from './gen-fixture-video.mjs';

/* ---- 1. WebM/EBML analysis ------------------------------------------------------------------ */

const ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  CodecID: 0x86,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Colour: 0x55b0,
  MatrixCoefficients: 0x55b1,
  Range: 0x55b9,
  TransferCharacteristics: 0x55ba,
  Primaries: 0x55bb,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  ReferenceBlock: 0xfb,
  Cues: 0x1c53bb6b,
  CuePoint: 0xbb,
};
const MASTERS = new Set([ID.Segment, ID.Info, ID.Tracks, ID.TrackEntry, ID.Video, ID.Colour, ID.Cluster, ID.BlockGroup, ID.Cues]);

function vint(buf, pos, isId) {
  const first = buf[pos];
  if (first === undefined) throw new Error(`EBML: truncated at ${pos}`);
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len++;
    mask >>>= 1;
  }
  if (len > 8) throw new Error(`EBML: invalid vint at ${pos}`);
  let value = isId ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !isId && allOnes };
}

function* children(buf, start, end) {
  let pos = start;
  while (pos < end) {
    const id = vint(buf, pos, true);
    const size = vint(buf, pos + id.len, false);
    const dataStart = pos + id.len + size.len;
    const dataEnd = size.unknown ? end : Math.min(end, dataStart + size.value);
    yield { id: id.value, dataStart, dataEnd };
    pos = dataEnd;
  }
}

const uint = (buf, s, e) => {
  let v = 0;
  for (let i = s; i < e; i++) v = v * 256 + buf[i];
  return v;
};
const float = (buf, s, e) => (e - s === 4 ? buf.readFloatBE(s) : e - s === 8 ? buf.readDoubleBE(s) : NaN);

export function analyzeWebm(path) {
  const buf = readFileSync(path);
  const out = {
    path,
    bytes: buf.length,
    timecodeScale: 1e6,
    durationMs: NaN,
    codec: null,
    width: 0,
    height: 0,
    colour: null,
    clusters: 0,
    cues: 0,
    frames: [], // { i, ms, key, bytes }
  };
  let clusterTc = 0;
  const walk = (start, end, depth) => {
    for (const el of children(buf, start, end)) {
      switch (el.id) {
        case ID.TimecodeScale:
          out.timecodeScale = uint(buf, el.dataStart, el.dataEnd);
          break;
        case ID.Duration:
          out.durationMs = (float(buf, el.dataStart, el.dataEnd) * out.timecodeScale) / 1e6;
          break;
        case ID.CodecID:
          out.codec = buf.toString('latin1', el.dataStart, el.dataEnd);
          break;
        case ID.PixelWidth:
          out.width = uint(buf, el.dataStart, el.dataEnd);
          break;
        case ID.PixelHeight:
          out.height = uint(buf, el.dataStart, el.dataEnd);
          break;
        case ID.Colour:
          out.colour = {};
          for (const c of children(buf, el.dataStart, el.dataEnd)) {
            const v = uint(buf, c.dataStart, c.dataEnd);
            if (c.id === ID.MatrixCoefficients) out.colour.matrix = v;
            else if (c.id === ID.Range) out.colour.range = v;
            else if (c.id === ID.TransferCharacteristics) out.colour.transfer = v;
            else if (c.id === ID.Primaries) out.colour.primaries = v;
          }
          break;
        case ID.Cluster:
          out.clusters++;
          walk(el.dataStart, el.dataEnd, depth + 1);
          break;
        case ID.Timecode:
          clusterTc = uint(buf, el.dataStart, el.dataEnd);
          break;
        case ID.SimpleBlock: {
          const tn = vint(buf, el.dataStart, false);
          const p = el.dataStart + tn.len;
          const rel = buf.readInt16BE(p);
          const flags = buf[p + 2];
          out.frames.push({
            i: out.frames.length,
            ms: ((clusterTc + rel) * out.timecodeScale) / 1e6,
            key: !!(flags & 0x80),
            bytes: el.dataEnd - (p + 3),
          });
          break;
        }
        case ID.BlockGroup: {
          let block = null;
          let ref = false;
          for (const c of children(buf, el.dataStart, el.dataEnd)) {
            if (c.id === ID.Block) block = c;
            else if (c.id === ID.ReferenceBlock) ref = true;
          }
          if (block) {
            const tn = vint(buf, block.dataStart, false);
            const p = block.dataStart + tn.len;
            out.frames.push({
              i: out.frames.length,
              ms: ((clusterTc + buf.readInt16BE(p)) * out.timecodeScale) / 1e6,
              key: !ref,
              bytes: block.dataEnd - (p + 3),
            });
          }
          break;
        }
        case ID.CuePoint:
          out.cues++;
          break;
        default:
          if (MASTERS.has(el.id)) walk(el.dataStart, el.dataEnd, depth + 1);
      }
    }
  };
  walk(0, buf.length, 0);

  const keys = out.frames.filter((f) => f.key);
  const inter = out.frames.filter((f) => !f.key);
  const keyIdx = keys.map((f) => f.i);
  const gaps = keyIdx.slice(1).map((k, j) => k - keyIdx[j]);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  out.summary = {
    frames: out.frames.length,
    keyframes: keys.length,
    keyframeIndices: keyIdx,
    gopMin: gaps.length ? Math.min(...gaps) : null,
    gopMax: gaps.length ? Math.max(...gaps) : null,
    keyBytesAvg: keys.length ? Math.round(sum(keys.map((f) => f.bytes)) / keys.length) : 0,
    interBytesAvg: inter.length ? Math.round(sum(inter.map((f) => f.bytes)) / inter.length) : 0,
    keyBytesTotal: sum(keys.map((f) => f.bytes)),
    interBytesTotal: sum(inter.map((f) => f.bytes)),
    lastFrameMs: out.frames.length ? out.frames[out.frames.length - 1].ms : NaN,
    monotonic: out.frames.every((f, i) => i === 0 || f.ms > out.frames[i - 1].ms),
  };
  return out;
}

/* ---- 2. browser verification ---------------------------------------------------------------- */

// decode-frame.js is inlined so the harness works whatever directory is being served.
const harnessHtml = () =>
  `<!doctype html><html><head><meta charset="utf-8"><title>fixture verify</title>
<script>${readFileSync(join(FIXTURE_DIR, 'decode-frame.js'), 'utf8')}</script></head><body></body></html>`;

// Runs in the page: create the <video>, wait for metadata + first frame.
async function loadVideo(src) {
  const old = document.getElementById('v');
  if (old) old.remove();
  const v = document.createElement('video');
  v.id = 'v';
  v.muted = true;
  v.preload = 'auto';
  v.src = src;
  document.body.appendChild(v);
  await new Promise((res, rej) => {
    v.addEventListener('loadeddata', res, { once: true });
    v.addEventListener('error', () => rej(new Error('video error code ' + (v.error && v.error.code))), { once: true });
  });
  return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, readyState: v.readyState };
}

// Runs in the page: seek to t, wait for 'seeked' and for the rVFC reporting that frame, decode it.
async function seekAndRead({ t, rvfcTimeoutMs }) {
  const v = document.getElementById('v');
  const fps = 30;
  const seen = [];
  let done = false;
  const seekedP = new Promise((res, rej) => {
    v.addEventListener('seeked', () => res(performance.now()), { once: true });
    setTimeout(() => rej(new Error('seeked timeout at t=' + t)), 10000);
  });
  // Register before seeking so the frame presented by the seek cannot be missed; keep asking
  // until the presented frame is the one at t (+-1 frame) or we give up.
  const rvfcP = new Promise((res) => {
    const cb = (now, md) => {
      seen.push({ mediaTime: md.mediaTime, presentedFrames: md.presentedFrames });
      if (done || Math.abs(md.mediaTime - t) <= 1 / fps + 1e-3) res(performance.now());
      else v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
  });
  const t0 = performance.now();
  v.currentTime = t;
  const tSeeked = await seekedP;
  const tFrame = await Promise.race([rvfcP, new Promise((res) => setTimeout(() => res(-1), rvfcTimeoutMs))]);
  done = true;
  const read = window.readVideoFrame(v);
  return {
    t,
    expected: Math.round(t * fps),
    seekMs: tSeeked - t0,
    frameMs: tFrame < 0 ? null : tFrame - t0,
    currentTime: v.currentTime,
    rvfcMediaTime: seen.length ? seen[seen.length - 1].mediaTime : null,
    rvfcCount: seen.length,
    ...read,
  };
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seekTargets() {
  const rnd = mulberry32(20260904);
  const fixed = [0, 0.5, 12.34, 33.0, 59.9];
  const random = Array.from({ length: 20 }, () => Math.round((0.2 + rnd() * 59.6) * 1000) / 1000);
  // offsets from the keyframe at 30.0 s (a keyframe in both clips): shows cost vs. decode distance
  const gopOffset = [0, 1 / 30, 0.5, 29 / 30, 2, 5, 9 + 29 / 30].map((o) => Math.round((30 + o) * 10000) / 10000);
  const sweep = Array.from({ length: 60 }, (_, s) => s + 0.5);
  return { fixed, random, gopOffset, sweep };
}

const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))))];
};
const stats = (arr) => ({
  n: arr.length,
  min: Math.min(...arr),
  median: pct(arr, 50),
  mean: arr.reduce((a, b) => a + b, 0) / arr.length,
  p90: pct(arr, 90),
  max: Math.max(...arr),
});
const fmt = (s) => `n=${s.n} min=${s.min.toFixed(1)} med=${s.median.toFixed(1)} mean=${s.mean.toFixed(1)} p90=${s.p90.toFixed(1)} max=${s.max.toFixed(1)} ms`;

// `dir` / `clipList` let the same checks run against candidate encodes outside test/fixtures.
export async function verify({ only = null, log = console.log, json = null, dir = FIXTURE_DIR, clipList = CLIPS, sizeLimit = 600 * 1024 } = {}) {
  const clips = clipList.filter((c) => !only || c.key === only);
  const report = { clips: {} };
  let failures = 0;
  const fail = (msg) => {
    failures++;
    log('FAIL: ' + msg);
  };

  // 1. container
  for (const c of clips) {
    const a = analyzeWebm(join(dir, c.file));
    const s = a.summary;
    report.clips[c.key] = { file: c.file, gop: c.gop, container: { bytes: a.bytes, durationMs: a.durationMs, codec: a.codec, width: a.width, height: a.height, colour: a.colour, clusters: a.clusters, cues: a.cues, ...s, keyframeIndices: undefined } };
    log(`\n[${c.file}] ${(a.bytes / 1024).toFixed(1)} KB, ${a.codec} ${a.width}x${a.height}, duration ${a.durationMs} ms, ${s.frames} frames (last pts ${s.lastFrameMs.toFixed(2)} ms), ${s.keyframes} keyframes (gop ${s.gopMin}..${s.gopMax}), ${a.clusters} clusters, ${a.cues} cues, colour=${JSON.stringify(a.colour)}`);
    log(`  keyframe avg ${s.keyBytesAvg} B (total ${(s.keyBytesTotal / 1024).toFixed(1)} KB), inter-frame avg ${s.interBytesAvg} B (total ${(s.interBytesTotal / 1024).toFixed(1)} KB)`);
    if (s.frames !== SPEC.frames) fail(`${c.file}: ${s.frames} frames, expected ${SPEC.frames}`);
    if (Math.abs(a.durationMs - SPEC.seconds * 1000) > 1) fail(`${c.file}: duration ${a.durationMs} ms`);
    if (a.codec !== 'V_VP8') fail(`${c.file}: codec ${a.codec}`);
    if (a.width !== SPEC.width || a.height !== SPEC.height) fail(`${c.file}: ${a.width}x${a.height}`);
    if (s.gopMin !== c.gop || s.gopMax !== c.gop || s.keyframeIndices[0] !== 0) fail(`${c.file}: keyframes at ${s.keyframeIndices.join(',')}`);
    if (s.keyframes !== SPEC.frames / c.gop) fail(`${c.file}: ${s.keyframes} keyframes, expected ${SPEC.frames / c.gop}`);
    if (a.cues !== s.keyframes) fail(`${c.file}: ${a.cues} cue points for ${s.keyframes} keyframes`);
    if (!s.monotonic) fail(`${c.file}: timestamps not monotonic`);
    if (a.bytes > sizeLimit) fail(`${c.file}: ${a.bytes} bytes > ${sizeLimit} bytes`);
  }

  // 2. browser
  const srv = await startStaticServer(dir, { routes: { '/verify-harness.html': harnessHtml() } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    page.on('pageerror', (e) => log('page error: ' + e.message));
    await page.goto(srv.url + '/verify-harness.html');
    const targets = seekTargets();
    for (const c of clips) {
      const meta = await page.evaluate(loadVideo, `/${c.file}`);
      log(`\n[${c.file}] browser: duration=${meta.duration} ${meta.width}x${meta.height} readyState=${meta.readyState}`);
      if (Math.abs(meta.duration - SPEC.seconds) > 0.001) fail(`${c.file}: video.duration ${meta.duration}`);
      const samples = [];
      for (const [series, list] of Object.entries(targets)) {
        for (const t of list) {
          const r = await page.evaluate(seekAndRead, { t, rvfcTimeoutMs: 1000 });
          r.series = series;
          r.delta = r.frameIndex - r.expected;
          samples.push(r);
          if (Math.abs(r.delta) > 1) fail(`${c.file}: t=${t} decoded frame ${r.frameIndex} (sec ${r.second} f ${r.frameInSecond}), expected ${r.expected}+-1; hue ${r.hueDeg.toFixed(1)} bar ${r.barWidth}px`);
          if (!r.ok) fail(`${c.file}: t=${t} decode not within tolerance: hueErr ${r.hueError.toFixed(2)} sat ${r.saturation.toFixed(2)} barStart ${r.barStart} barErr ${r.barError}`);
        }
      }
      const exact = samples.filter((s) => s.delta === 0).length;
      const within1 = samples.filter((s) => Math.abs(s.delta) <= 1).length;
      const hueErr = samples.map((s) => Math.abs(s.hueError));
      const barErr = samples.map((s) => Math.abs(s.barError));
      const seekAll = stats(samples.map((s) => s.seekMs));
      const frameAll = stats(samples.filter((s) => s.frameMs != null).map((s) => s.frameMs));
      const rvfcMissing = samples.filter((s) => s.frameMs == null).length;
      log(`  accuracy: ${exact}/${samples.length} exact (frame == round(t*30)), ${within1}/${samples.length} within +-1; deltas ${JSON.stringify([...new Set(samples.map((s) => s.delta))].sort())}`);
      log(`  hue error max ${Math.max(...hueErr).toFixed(2)} deg (mean ${(hueErr.reduce((a, b) => a + b, 0) / hueErr.length).toFixed(2)}), bar width error max ${Math.max(...barErr)} px, saturation min ${Math.min(...samples.map((s) => s.saturation)).toFixed(3)}`);
      log(`  seek latency  (set currentTime -> seeked):        ${fmt(seekAll)}`);
      log(`  frame latency (set currentTime -> rVFC of frame): ${fmt(frameAll)}${rvfcMissing ? `  (${rvfcMissing} samples without matching rVFC within 1 s)` : ''}`);
      for (const series of Object.keys(targets)) {
        const ss = samples.filter((s) => s.series === series);
        log(`    ${series.padEnd(10)} seek ${fmt(stats(ss.map((s) => s.seekMs)))}`);
      }
      const go = samples.filter((s) => s.series === 'gopOffset');
      log('    gopOffset detail: ' + go.map((s) => `t=${s.t}:${s.seekMs.toFixed(1)}ms`).join('  '));
      report.clips[c.key].browser = { meta, exact, within1, n: samples.length, hueErrMax: Math.max(...hueErr), barErrMax: Math.max(...barErr), seek: seekAll, frame: frameAll, rvfcMissing, samples };
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  if (json) writeFileSync(json, JSON.stringify(report, null, 2));
  log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  return { report, failures };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const arg = (k) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : null);
  verify({ only: arg('--only'), json: arg('--json'), log: args.includes('--quiet') ? () => {} : console.log })
    .then(({ failures }) => process.exit(failures ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
