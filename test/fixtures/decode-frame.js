/* Browser-side helper that identifies which frame of a fixture clip a <video> element is
 * currently showing, by decoding the pixels of the frame (see scripts/gen-fixture-video.mjs
 * for the frame layout). Classic script; exposes:
 *
 *   window.readVideoFrame(video) -> {
 *     second,          // 0..59, from the background hue at (320, 100)
 *     frameInSecond,   // 0..29, from the white bar run length on scan line y = 340
 *     frameIndex,      // second * 30 + frameInSecond
 *     hueDeg,          // measured hue in degrees
 *     hueError,        // |hueDeg - second * 6| in degrees (signed distance on the circle)
 *     saturation,      // measured HSL saturation 0..1 (should be near 1)
 *     rgb,             // averaged probe colour [r, g, b]
 *     barStart,        // x of the first white pixel on the scan line (expected 20)
 *     barWidth,        // white run length in px (expected round((frameInSecond+1)/30*600))
 *     barError,        // barWidth - nominal width for the decoded frameInSecond
 *     ok               // true when everything is within tolerance (see below)
 *   }
 *
 * Tolerances (the encoding is designed so that lossy JPEG -> VP8 -> YUV 4:2:0 round trips
 * cannot push a value across a decision boundary):
 *   - seconds are 6 deg of hue apart, so hue may be off by up to +-3 deg and still decode
 *     correctly; `ok` demands |hueError| <= 2.5 deg and saturation >= 0.5. The probe is the
 *     mean of the 5x5 block centred on (320, 100) to average out compression noise.
 *   - bar widths are 20 px apart (frame f -> (f+1)*20 px, starting at x = 20), so the white
 *     run may be up to +-10 px long/short (edge blur, ringing) and still decode; `ok` demands
 *     |barError| <= 8 px and 12 <= barStart <= 28. A pixel counts as white when its
 *     luma (0.299 R + 0.587 G + 0.114 B) > 128, halfway between video black (16) and white (235).
 *   - the frame is always drawn at 640x360 regardless of the element's CSS size, so the
 *     probe coordinates are in intrinsic clip pixels.
 *
 * Which frame to expect after `video.currentTime = t` (measured in Chromium 141): the last frame
 * whose WebM timestamp (frame i has round(i * 1000 / 30) ms, 1 ms granularity) is <= t, i.e.
 * floor(t * 30) except when t * 1000 falls just below a rounded-up timestamp
 * (e.g. t = 30.9667 shows frame 928, not 929). round(t * 30) is therefore within +-1.
 *
 * Requires the video to be same-origin (or CORS-enabled), otherwise getImageData throws.
 */
(function () {
  'use strict';

  var W = 640;
  var H = 360;
  var FPS = 30;
  var BAR_X = 20;
  var BAR_SPAN = 600;
  var BAR_Y = 340;
  var HUE_X = 320;
  var HUE_Y = 100;
  var PROBE = 5; // probe block size (odd)

  var canvas = null;
  var ctx = null;

  function ensureCanvas() {
    if (ctx) return ctx;
    canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    return ctx;
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var l = (max + min) / 2;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: s, l: l };
  }

  function readVideoFrame(video) {
    var c = ensureCanvas();
    c.drawImage(video, 0, 0, W, H);

    // (a) background hue -> second
    var half = (PROBE - 1) / 2;
    var probe = c.getImageData(HUE_X - half, HUE_Y - half, PROBE, PROBE).data;
    var r = 0;
    var g = 0;
    var b = 0;
    var n = PROBE * PROBE;
    for (var i = 0; i < n; i++) {
      r += probe[i * 4];
      g += probe[i * 4 + 1];
      b += probe[i * 4 + 2];
    }
    r /= n;
    g /= n;
    b /= n;
    var hsl = rgbToHsl(r, g, b);
    var second = Math.round(hsl.h / 6) % 60;
    var hueError = hsl.h - second * 6;
    if (hueError > 180) hueError -= 360;
    if (hueError < -180) hueError += 360;

    // (b) white run length on the scan line -> frame within the second
    var row = c.getImageData(0, BAR_Y, W, 1).data;
    var barStart = -1;
    var barWidth = 0;
    for (var x = 0; x < W; x++) {
      var luma = 0.299 * row[x * 4] + 0.587 * row[x * 4 + 1] + 0.114 * row[x * 4 + 2];
      if (luma > 128) {
        if (barStart < 0) barStart = x;
        barWidth++;
      } else if (barStart >= 0) {
        break; // end of the first white run
      }
    }
    var frameInSecond = Math.min(FPS - 1, Math.max(0, Math.round(barWidth / (BAR_SPAN / FPS)) - 1));
    var nominal = Math.round(((frameInSecond + 1) / FPS) * BAR_SPAN);
    var barError = barWidth - nominal;

    var ok =
      Math.abs(hueError) <= 2.5 &&
      hsl.s >= 0.5 &&
      barStart >= BAR_X - 8 &&
      barStart <= BAR_X + 8 &&
      Math.abs(barError) <= 8;

    return {
      second: second,
      frameInSecond: frameInSecond,
      frameIndex: second * FPS + frameInSecond,
      hueDeg: hsl.h,
      hueError: hueError,
      saturation: hsl.s,
      rgb: [r, g, b],
      barStart: barStart,
      barWidth: barWidth,
      barError: barError,
      ok: ok,
    };
  }

  readVideoFrame.SPEC = { width: W, height: H, fps: FPS, barX: BAR_X, barSpan: BAR_SPAN, barY: BAR_Y, hueProbe: { x: HUE_X, y: HUE_Y } };
  window.readVideoFrame = readVideoFrame;
})();
