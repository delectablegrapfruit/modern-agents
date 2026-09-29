// js/art/paper.js — owner: W1-A. SR.art.paper: the paper grain (ART_AUDIO §1.1 rule 3: a 256 × 256
// pattern generated at boot from value noise plus short fibre strokes, multiplied at 6 % over ground
// chunks and building sprites and 4 % over UI paper) and the torn-paper edge used by tags and cards.
// Deterministic: the grain is drawn from its own SR.rng stream, so it is the same on every machine.
//
// Public: grain(kind) → canvas, grainURL(alpha) → data URL, pattern(ctx, kind) → CanvasPattern,
// apply(ctx, x, y, w, h, alpha), tornRect(ctx, x, y, w, h, opts), SIZE.
// Boot (prio 40, browser only): builds the grain and sets the CSS custom property --grain (UI.md §2.1)
// to the 4 % data URL unless the stylesheet already set one.
(function () {
  'use strict';
  var SR = window.SR;
  var SIZE = 256;
  var SEED = 0x9a9e5; // fixed: the grain is part of the look, identical on every machine
  var canvases = {};  // kind -> canvas ('multiply' | 'speck')
  var patterns = typeof WeakMap === 'function' ? new WeakMap() : null;
  var urls = {};

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
    return null;
  }

  /** Value noise on a wrapping grid of `cell` px, bilinear with smoothstep, from a lattice table. */
  function valueNoise(lattice, n, x, y, cell) {
    var gx = x / cell, gy = y / cell;
    var x0 = Math.floor(gx), y0 = Math.floor(gy);
    var fx = gx - x0, fy = gy - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var m = n - 1;
    var a = lattice[(y0 & m) * n + (x0 & m)], b = lattice[(y0 & m) * n + ((x0 + 1) & m)];
    var c = lattice[((y0 + 1) & m) * n + (x0 & m)], d = lattice[((y0 + 1) & m) * n + ((x0 + 1) & m)];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  var lumCache = null;

  /** @returns {Float32Array} per-pixel paper luminance 0..1 (1 = white paper, nothing multiplied). */
  function luminance() {
    if (lumCache) return lumCache;
    var rng = SR.rng.create(SEED);
    var L = new Float32Array(SIZE * SIZE);
    var coarse = new Float32Array(16 * 16), fine = new Float32Array(64 * 64);
    for (var i = 0; i < coarse.length; i++) coarse[i] = rng.float();
    for (var j = 0; j < fine.length; j++) fine[j] = rng.float();
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var v = 0.55 * valueNoise(coarse, 16, x, y, 16) + 0.3 * valueNoise(fine, 64, x, y, 4) + 0.15 * rng.float();
        L[y * SIZE + x] = 0.62 + 0.38 * v;
      }
    }
    // Short fibre strokes: 1 px lines 4-10 px long, mostly lighter (paper fibres catch the light).
    for (var f = 0; f < 420; f++) {
      var fx = rng.float(0, SIZE), fy = rng.float(0, SIZE), ang = rng.float(0, Math.PI * 2);
      var len = rng.float(4, 10), lighter = rng.chance(0.7), amt = rng.float(0.08, 0.2);
      for (var s = 0; s < len; s++) {
        var px = Math.floor(fx + Math.cos(ang) * s + SIZE) % SIZE, py = Math.floor(fy + Math.sin(ang) * s + SIZE) % SIZE;
        var k = py * SIZE + px;
        L[k] = Math.max(0, Math.min(1, L[k] + (lighter ? amt : -amt)));
      }
    }
    lumCache = L;
    return L;
  }

  function build(kind) {
    var c = makeCanvas(SIZE, SIZE);
    if (!c) return null;
    var g = c.getContext('2d');
    var img = g.createImageData(SIZE, SIZE);
    var d = img.data;
    var L = luminance();
    var ink = SR.art.draw ? SR.art.draw.parse('ink') : [27, 29, 43, 1];
    for (var i = 0; i < L.length; i++) {
      var o = i * 4;
      if (kind === 'speck') {
        // Opaque specks where the paper is darkest: the stamp's destination-out mask.
        var a = L[i] < 0.74 ? 255 : 0;
        d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2]; d[o + 3] = a;
      } else {
        var v = Math.round(L[i] * 255);
        d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /**
   * The 256 × 256 grain canvas (built once, lazily or at boot).
   * @param {string=} kind 'multiply' (default: opaque greyscale, to multiply over a surface) or
   *   'speck' (transparent with ink specks: a knock-out mask)
   * @returns {HTMLCanvasElement|null}
   */
  function grain(kind) {
    kind = kind || 'multiply';
    if (!canvases[kind]) canvases[kind] = build(kind);
    return canvases[kind];
  }

  /**
   * A CanvasPattern of the grain for ctx (cached per context).
   * @returns {CanvasPattern|null}
   */
  function pattern(ctx, kind) {
    kind = kind || 'multiply';
    var per = patterns ? patterns.get(ctx) : null;
    if (per && per[kind]) return per[kind];
    var g = grain(kind);
    if (!g) return null;
    var p = ctx.createPattern(g, 'repeat');
    if (patterns) {
      if (!per) { per = {}; patterns.set(ctx, per); }
      per[kind] = p;
    }
    return p;
  }

  /**
   * Multiplies the grain over a rect (ART_AUDIO §1.1: 0.06 over the world, 0.04 over UI paper).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number=} a alpha (default 0.06)
   */
  function apply(ctx, x, y, w, h, a) {
    var p = pattern(ctx, 'multiply');
    if (!p) return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha *= a === undefined ? 0.06 : a;
    ctx.fillStyle = p;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * The grain as a CSS background image: ink with alpha a × (1 - paper luminance), so layering it
   * over any paper colour darkens it like a multiply at a (UI.md §2.1 --grain; default 0.04).
   * @param {number=} a
   * @returns {string} data URL ('' without a canvas)
   */
  function grainURL(a) {
    a = a === undefined ? 0.04 : a;
    var key = String(a);
    if (urls[key]) return urls[key];
    var c = makeCanvas(SIZE, SIZE);
    if (!c || !c.toDataURL) return '';
    var g = c.getContext('2d');
    var img = g.createImageData(SIZE, SIZE);
    var d = img.data;
    var L = luminance();
    var ink = SR.art.draw ? SR.art.draw.parse('ink') : [27, 29, 43, 1];
    for (var i = 0; i < L.length; i++) {
      var o = i * 4;
      d[o] = ink[0]; d[o + 1] = ink[1]; d[o + 2] = ink[2];
      d[o + 3] = Math.round(255 * a * (1 - L[i]));
    }
    g.putImageData(img, 0, 0);
    urls[key] = c.toDataURL('image/png');
    return urls[key];
  }

  /**
   * Begins a path: a rectangle whose chosen edges are torn (seeded, so the same tag tears the same way).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {{seed: *, amp: number, step: number, edges: string}=} o edges: any of 't', 'r', 'b', 'l'
   *   (default 'lr'); amp: tear depth (default 3); step: tooth spacing (default 7)
   */
  function tornRect(ctx, x, y, w, h, o) {
    o = o || {};
    var seed = o.seed === undefined ? 1 : o.seed;
    var amp = o.amp === undefined ? 3 : o.amp;
    var step = o.step || 7;
    var edges = o.edges || 'lr';
    function j(i, side) { return ((SR.util.hash(seed, side, i) % 1000) / 1000) * amp; }
    function edge(ax, ay, bx, by, side, torn, nx, ny) {
      var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
      var n = torn ? Math.max(2, Math.round(len / step)) : 1;
      for (var i = 1; i <= n; i++) {
        var t = i / n;
        var dd = torn && i < n ? j(i, side) : 0;
        ctx.lineTo(ax + (bx - ax) * t + nx * dd, ay + (by - ay) * t + ny * dd);
      }
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    edge(x, y, x + w, y, 't', edges.indexOf('t') >= 0, 0, 1);
    edge(x + w, y, x + w, y + h, 'r', edges.indexOf('r') >= 0, -1, 0);
    edge(x + w, y + h, x, y + h, 'b', edges.indexOf('b') >= 0, 0, -1);
    edge(x, y + h, x, y, 'l', edges.indexOf('l') >= 0, 1, 0);
    ctx.closePath();
  }

  SR.art.paper = { SIZE: SIZE, grain: grain, grainURL: grainURL, pattern: pattern, apply: apply, tornRect: tornRect };

  // Boot: build the grain up front (it is part of the look of every sprite) and give the DOM its
  // 4 % version through --grain, unless the stylesheet already set a value other than none.
  SR.onBoot(40, function () {
    if (typeof document === 'undefined') return;
    grain('multiply');
    var root = document.documentElement;
    if (!root || !root.style || typeof getComputedStyle !== 'function') return;
    var cur = String(getComputedStyle(root).getPropertyValue('--grain') || '').trim();
    if (cur && cur !== 'none') return;
    var url = grainURL(0.04);
    if (url) root.style.setProperty('--grain', 'url("' + url + '")');
  });
})();
