#!/usr/bin/env node
/* Generates the seekable test clips used by the scrubbing tests:
 *
 *   test/fixtures/clip-short-gop.webm   keyframe every  30 frames (1 s)
 *   test/fixtures/clip-long-gop.webm    keyframe every 300 frames (10 s, streaming-site style, expensive seeks)
 *
 * Both: 640x360, 30 fps, exactly 60.0 s (1800 frames), VP8 in WebM, low bitrate.
 *
 * Every frame is machine-identifiable from its pixels even after lossy compression:
 *   (a) solid background, hue = second * 6 deg (S 100 %, L 50 %)   -> whole second
 *   (b) black band across the bottom 40 px with a white bar starting at x = 20 whose width is
 *       round((frame % 30 + 1) / 30 * 600) px (20 px steps)         -> frame within the second
 *   (c) text "t=SS.FF  frame=N" in the middle (white bold monospace glyphs in 16 px cells on a
 *       black plate, cells aligned to the 16 px macroblock grid)  -> human readable
 * test/fixtures/decode-frame.js reads (a) and (b) back from a <video>.
 *
 * Pipeline: headless Chromium (playwright) renders each frame on a canvas -> JPEG (q 0.85) ->
 * piped into Playwright's bundled ffmpeg (image2pipe/mjpeg -> libvpx VP8 -> webm). Frames are
 * streamed one second (30 frames) at a time, so nothing large is held in memory.
 *
 * Usage:  node scripts/gen-fixture-video.mjs [--force] [--only short|long]
 * Idempotent: existing outputs are only regenerated with --force (or when missing / the wrong
 * size). Output is written to a temp file and renamed, so a failed run never leaves a bad clip.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const SPEC = Object.freeze({
  width: 640,
  height: 360,
  fps: 30,
  seconds: 60,
  frames: 1800,
  jpegQuality: 0.85,
  // frame-in-second bar (black band = bottom 40 px, white bar inside it)
  bandHeight: 40,
  barX: 20,
  barSpan: 600, // width of the bar for frame 29 (frame f -> round((f+1)/30*600) px)
  barY0: 328, // bar covers y 328..351, so scan line y = 340 hits it
  barY1: 352,
  // pixel used to read the background hue
  hueProbe: { x: 320, y: 100 },
  // label: 16 px glyph cells starting at x = 160, ink in macroblock rows 11-12 (y 176..207) on a
  // black plate covering rows 10-13 (y 160..223); clear of the hue probe row (y = 100).
  label: { cell: 16, x: 160, rowTop: 176, baselineY: 197, maxChars: 20, maxSize: 40, weight: 'bold', color: '#fff' },
});

export const CLIPS = Object.freeze([
  { key: 'short', file: 'clip-short-gop.webm', gop: 30 },
  { key: 'long', file: 'clip-long-gop.webm', gop: 300 },
]);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE_DIR = join(ROOT, 'test', 'fixtures');
const BATCH = 30; // frames per page.evaluate round trip (one second of video)
// Encoder settings (measured, see scripts/verify-fixture-video.mjs):
//  - a fixed quantizer (qmin = qmax = 30) instead of a bitrate target: libvpx's VP8 rate control
//    otherwise spends its whole budget (default 256 kbit/s even with -b:v 0) refining flat frames,
//    giving ~2 MB files regardless of -crf; and a quantizer above ~40 quantises the chroma DC of
//    the flat background so coarsely that the hue drifts by up to ~3.5 deg, which is the decode
//    step (6 deg / 2). At q30 the hue error stays <= 1.5 deg and the files are ~560 / ~430 KB.
//  - deadline good / cpu-used 0: realtime mode's cheap mode decision makes inter-frames 3x larger
//    (735 B vs 239 B per frame here); good/0 costs ~7 s per clip.
const ENCODE = { q: 30, deadline: 'good', cpuUsed: 0 };

/* ---- locate Playwright's ffmpeg ------------------------------------------------------------- */

export function findFfmpeg() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const dirs = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    join(process.env.HOME || '', '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      if (!entry.startsWith('ffmpeg')) continue;
      for (const bin of ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-mac-arm64', 'ffmpeg-win64.exe', 'ffmpeg']) {
        const p = join(dir, entry, bin);
        if (existsSync(p)) return p;
      }
    }
  }
  throw new Error('ffmpeg not found; set FFMPEG_PATH or PLAYWRIGHT_BROWSERS_PATH');
}

/* ---- frame renderer (runs inside the browser) ----------------------------------------------- */

// Renders frames [start, end) and returns them as base64 JPEG strings.
export function renderBatch({ start, end, spec }) {
  const { width: W, height: H, fps } = spec;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  const out = [];
  for (let n = start; n < end; n++) {
    const sec = Math.floor(n / fps);
    const f = n % fps;
    // (a) background hue encodes the second
    ctx.fillStyle = `hsl(${sec * 6}, 100%, 50%)`;
    ctx.fillRect(0, 0, W, H);
    // (b) black band + white bar whose width encodes the frame within the second
    ctx.fillStyle = '#000';
    ctx.fillRect(0, H - spec.bandHeight, W, spec.bandHeight);
    const barW = Math.round(((f + 1) / fps) * spec.barSpan);
    ctx.fillStyle = '#fff';
    ctx.fillRect(spec.barX, spec.barY0, barW, spec.barY1 - spec.barY0);
    // (c) human readable label, white monospace glyphs on a static black plate. Each glyph is
    // drawn in its own 16 px cell aligned to the VP8 macroblock grid (cells span exactly two
    // macroblock rows), so the two or three digits that change from frame to frame touch only
    // 4-6 macroblocks and unchanged glyphs are pixel-identical: inter-frames stay tiny even at
    // a low quantizer, which keeps the background chroma (the hue channel) accurate.
    const L = spec.label;
    const label = `t=${String(sec).padStart(2, '0')}.${String(f).padStart(2, '0')}  frame=${n}`;
    if (n === start) {
      // pick the largest font size whose glyphs fit the cell (advance <= cell-1, ink height <= 22)
      let size = L.maxSize;
      for (; size > 8; size--) {
        ctx.font = `${L.weight} ${size}px monospace`;
        const m = ctx.measureText('0');
        if (m.width <= L.cell - 1 && m.actualBoundingBoxAscent <= L.cell + 6) break;
      }
      ctx.font = `${L.weight} ${size}px monospace`;
    }
    const plateX = L.x - L.cell;
    const plateW = (L.maxChars + 2) * L.cell;
    ctx.fillStyle = '#000';
    ctx.fillRect(plateX, L.rowTop - L.cell, plateW, 4 * L.cell); // rows 10..13 (y 160..223)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = L.color;
    for (let i = 0; i < label.length; i++) {
      if (label[i] !== ' ') ctx.fillText(label[i], L.x + i * L.cell + L.cell / 2, L.baselineY);
    }
    out.push(canvas.toDataURL('image/jpeg', spec.jpegQuality).split(',')[1]);
  }
  return out;
}

/* ---- encoder ------------------------------------------------------------------------------- */

function ffmpegArgs(gop, outPath) {
  const { fps } = SPEC;
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-c:v', 'mjpeg',
    '-i', 'pipe:0',
    '-an',
    '-c:v', 'libvpx',
    '-pix_fmt', 'yuv420p',
    // keyint_min == g makes libvpx place keyframes at a fixed interval (no scene-cut keyframes),
    // and disabling alt-ref / lag keeps every encoded frame a visible frame.
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-auto-alt-ref', '0',
    '-lag-in-frames', '0',
    // qmin == qmax pins the quantizer for every frame; -crf only has to lie inside that range.
    '-b:v', '0',
    '-crf', String(ENCODE.q),
    '-qmin', String(ENCODE.q),
    '-qmax', String(ENCODE.q),
    '-deadline', ENCODE.deadline,
    '-cpu-used', String(ENCODE.cpuUsed),
    '-r', String(fps),
    '-frames:v', String(SPEC.frames),
    '-f', 'webm',
    outPath,
  ];
}

async function encodeClip(page, clip, ffmpeg, outPath) {
  const tmp = outPath + '.tmp';
  rmSync(tmp, { force: true });
  const ff = spawn(ffmpeg, ffmpegArgs(clip.gop, tmp), { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ff.stderr.setEncoding('utf8');
  ff.stderr.on('data', (d) => (stderr += d));
  const exited = once(ff, 'exit');
  let stdinError = null;
  ff.stdin.on('error', (e) => (stdinError = e));

  const t0 = performance.now();
  for (let start = 0; start < SPEC.frames && !stdinError; start += BATCH) {
    const end = Math.min(SPEC.frames, start + BATCH);
    const frames = await page.evaluate(renderBatch, { start, end, spec: SPEC });
    for (const b64 of frames) {
      if (stdinError) break;
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await once(ff.stdin, 'drain').catch(() => {});
    }
    if (process.stdout.isTTY) process.stdout.write(`\r  ${clip.file}: ${end}/${SPEC.frames} frames`);
  }
  ff.stdin.end();
  const [code] = await exited;
  if (process.stdout.isTTY) process.stdout.write('\r');
  if (code !== 0 || stdinError) {
    rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed (exit ${code}${stdinError ? ', ' + stdinError.message : ''})\n${stderr}`);
  }
  renameSync(tmp, outPath);
  return { ms: performance.now() - t0, size: statSync(outPath).size };
}

/* ---- main ---------------------------------------------------------------------------------- */

export async function generate({ force = false, only = null, log = console.log } = {}) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const ffmpeg = findFfmpeg();
  const wanted = CLIPS.filter((c) => !only || c.key === only);
  const todo = wanted.filter((c) => {
    const p = join(FIXTURE_DIR, c.file);
    return force || !existsSync(p) || statSync(p).size < 1024;
  });
  const results = [];
  for (const c of wanted.filter((c) => !todo.includes(c))) {
    const p = join(FIXTURE_DIR, c.file);
    results.push({ ...c, path: p, size: statSync(p).size, skipped: true });
  }
  if (todo.length) {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: SPEC.width, height: SPEC.height } });
      await page.setContent(`<canvas id="c" width="${SPEC.width}" height="${SPEC.height}"></canvas>`);
      for (const c of todo) {
        const p = join(FIXTURE_DIR, c.file);
        const { ms, size } = await encodeClip(page, c, ffmpeg, p);
        results.push({ ...c, path: p, size, ms, skipped: false });
      }
    } finally {
      await browser.close();
    }
  }
  for (const r of results) {
    log(
      `${r.path}  ${(r.size / 1024).toFixed(1)} KB  gop=${r.gop}` +
        (r.skipped ? '  (exists, skipped; use --force to regenerate)' : `  (${(r.ms / 1000).toFixed(1)} s)`)
    );
  }
  return results;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
  generate({ force, only }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
