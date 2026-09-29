/* Memaze — the player sprite and its hitbox.
 *
 * The game paints the player itself, frame by frame, onto a canvas, and builds the hitbox from exactly the frame it
 * painted: every pixel that is at least half opaque (after the green-screen key, if on) is solid, transparent pixels
 * are not. Animated GIFs are decoded here (browsers only ever hand a canvas the first frame of an <img> GIF); APNG and
 * animated WebP/AVIF go through ImageDecoder where the browser has it; videos are read frame by frame.
 */
(function () {
  'use strict';
  const MZ = window.MZ;

  const MASK = 96;        // hitbox grid across the sprite's square box
  const INTERIOR = 6;     // interior sample spacing in grid cells (the outline is sampled at every cell)
  const SOLID = 128;      // alpha at or above this is part of the hitbox
  const MAX_FRAMES = 240, FRAME_MAX = 320;

  // ---------- shapes ----------
  // An uploaded picture is cut to a shape (a circle unless you choose otherwise), filling it, and rimmed like the
  // built-in star: a dark line round it, a white band round that. 'original' keeps it whole and uncut, as the built-in
  // pictures always are. The cut and its rim are the hitbox. Each outline is points round a unit box.
  const RIM = 22 / 256, LINE = 10 / 256; // how far the white band and the dark line reach out from the cut (the star's)
  const RIM_COLOR = '#fff', LINE_COLOR = '#1d1a3a';
  // Points along an SVG path of M, L, Q and Z, fitted and centred in the unit box.
  function pathPoints(d) {
    const t = d.match(/[MLQZ]|-?[\d.]+/g), out = [];
    let i = 0, x = 0, y = 0;
    const num = () => +t[i++];
    while (i < t.length) {
      const c = t[i++];
      if (c === 'M' || c === 'L') { x = num(); y = num(); out.push([x, y]); }
      else if (c === 'Q') {
        const cx = num(), cy = num(), ex = num(), ey = num();
        for (let k = 1; k <= 6; k++) { const u = k / 6, v = 1 - u; out.push([v * v * x + 2 * u * v * cx + u * u * ex, v * v * y + 2 * u * v * cy + u * u * ey]); }
        x = ex; y = ey;
      }
    }
    const xs = out.map((p) => p[0]), ys = out.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const k = 1 / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0), ox = (1 - (Math.max(...xs) - x0) * k) / 2, oy = (1 - (Math.max(...ys) - y0) * k) / 2;
    return out.map(([px, py]) => [ox + (px - x0) * k, oy + (py - y0) * k]);
  }
  const SHAPES = {
    circle: Array.from({ length: 48 }, (_, i) => [0.5 + 0.5 * Math.cos((i / 48) * Math.PI * 2), 0.5 + 0.5 * Math.sin((i / 48) * Math.PI * 2)]),
    rounded: (() => { const r = 0.22, out = []; for (const [cx, cy, a0] of [[1 - r, r, -90], [1 - r, 1 - r, 0], [r, 1 - r, 90], [r, r, 180]]) for (let k = 0; k <= 8; k++) { const a = ((a0 + (k / 8) * 90) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; })(),
    square: [[0, 0], [1, 0], [1, 1], [0, 1]],
    hexagon: Array.from({ length: 6 }, (_, i) => [0.5 + 0.5 * Math.cos(((i * 60 - 90) * Math.PI) / 180), 0.5 + 0.5 * Math.sin(((i * 60 - 90) * Math.PI) / 180)]),
    heart: Array.from({ length: 64 }, (_, i) => { // the classic parametric heart, fitted to the box
      const t = (i / 64) * Math.PI * 2, x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return [0.5 + x / 34, 0.47 + y / 34];
    }),
    star: pathPoints('M-16.5,-89.9Q0,-112 16.5,-89.9L22.6,-81.5Q41.1,-56.6 70.6,-46.7L80.4,-43.4Q106.5,-34.6 90.5,-12.1L84.5,-3.7Q66.6,21.6 66.2,52.7L66.1,63Q65.8,90.6 39.5,82.4L29.6,79.3Q0,70 -29.6,79.3L-39.5,82.4Q-65.8,90.6 -66.1,63L-66.2,52.7Q-66.6,21.6 -84.5,-3.7L-90.5,-12.1Q-106.5,-34.6 -80.4,-43.4L-70.6,-46.7Q-41.1,-56.6 -22.6,-81.5Z'), // the built-in star's own
  };
  // A shape's cut, drawn in from the box's edges to leave room for its rim.
  const cutOf = (shape) => SHAPES[shape].map(([x, y]) => [RIM + x * (1 - 2 * RIM), RIM + y * (1 - 2 * RIM)]);
  const polygonCSS = (pts, dp) => 'polygon(' + pts.map(([x, y]) => (x * 100).toFixed(dp) + '% ' + (y * 100).toFixed(dp) + '%').join(',') + ')';
  // The rim round a cut, behind whatever is already drawn in g.
  function drawRim(g, pts, size) {
    g.save();
    g.globalCompositeOperation = 'destination-over';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * size, y * size) : g.moveTo(x * size, y * size)));
    g.closePath();
    g.fillStyle = g.strokeStyle = LINE_COLOR; g.lineWidth = 2 * LINE * size; g.fill(); g.stroke();
    g.fillStyle = g.strokeStyle = RIM_COLOR; g.lineWidth = 2 * RIM * size; g.fill(); g.stroke();
    g.restore();
  }

  // ---------- GIF decoding ----------
  function lzw(minSize, data, count) {
    const clear = 1 << minSize, eoi = clear + 1;
    const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
    for (let i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; }
    const out = new Uint8Array(count);
    let size = minSize + 1, mask = (1 << size) - 1, next = eoi + 1, prev = -1, first = 0;
    let op = 0, pos = 0, bits = 0, cur = 0;
    while (op < count) {
      while (bits < size) {
        if (pos >= data.length) return out;
        cur |= data[pos++] << bits;
        bits += 8;
      }
      const code = cur & mask;
      cur >>>= size;
      bits -= size;
      if (code === clear) { size = minSize + 1; mask = (1 << size) - 1; next = eoi + 1; prev = -1; continue; }
      if (code === eoi) break;
      if (prev === -1) { out[op++] = suffix[code]; prev = first = code; continue; }
      let c = code, sp = 0;
      if (code >= next) { stack[sp++] = first; c = prev; }
      while (c >= clear) { stack[sp++] = suffix[c]; c = prefix[c]; }
      stack[sp++] = c;
      first = c;
      while (sp && op < count) out[op++] = stack[--sp];
      if (next < 4096) {
        prefix[next] = prev;
        suffix[next] = first;
        next++;
        if (next > mask && size < 12) { size++; mask = (1 << size) - 1; }
      }
      prev = code;
    }
    return out;
  }

  // Returns {width, height, frames: [{rgba, delay}]} with every frame fully composited (disposal handled). With onFrame,
  // each composited frame is handed over as it is made (the buffer is reused) and not kept: big GIFs stay small.
  function decodeGif(buf, onFrame) {
    const b = new Uint8Array(buf);
    if (b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) throw new Error('not a GIF');
    const u16 = (i) => b[i] | (b[i + 1] << 8);
    const W = u16(6), H = u16(8), packed = b[10];
    let p = 13, gct = null;
    if (packed & 0x80) { const n = 3 << ((packed & 7) + 1); gct = b.subarray(p, p + n); p += n; }
    const canvas = new Uint8ClampedArray(W * H * 4);
    const frames = [];
    let gce = { disposal: 0, delay: 10, trans: -1 };
    let pending = null; // disposal to apply before the next frame: {mode, rect, snapshot}
    const subBlocks = () => {
      const parts = [];
      let len = 0;
      while (p < b.length) {
        const n = b[p++];
        if (!n) break;
        parts.push(b.subarray(p, p + n));
        len += n;
        p += n;
      }
      const out = new Uint8Array(len);
      let o = 0;
      for (const part of parts) { out.set(part, o); o += part.length; }
      return out;
    };
    while (p < b.length && frames.length < MAX_FRAMES) {
      const id = b[p++];
      if (id === 0x3b) break;
      if (id === 0x21) {
        const label = b[p++];
        if (label === 0xf9) {
          const pk = b[p + 1];
          gce = { disposal: (pk >> 2) & 7, delay: u16(p + 2), trans: pk & 1 ? b[p + 4] : -1 };
          p += b[p] + 1;
          subBlocks();
        } else subBlocks();
        continue;
      }
      if (id !== 0x2c) break;
      const x = u16(p), y = u16(p + 2), w = u16(p + 4), h = u16(p + 6), ipk = b[p + 8];
      p += 9;
      let pal = gct;
      if (ipk & 0x80) { const n = 3 << ((ipk & 7) + 1); pal = b.subarray(p, p + n); p += n; }
      const minSize = b[p++];
      const idx = lzw(minSize, subBlocks(), w * h);
      if (pending) {
        if (pending.mode === 2) {
          for (let yy = pending.y; yy < pending.y + pending.h; yy++) {
            if (yy < 0 || yy >= H) continue;
            canvas.fill(0, (yy * W + Math.max(0, pending.x)) * 4, (yy * W + Math.min(W, pending.x + pending.w)) * 4);
          }
        } else if (pending.mode === 3 && pending.snapshot) canvas.set(pending.snapshot);
        pending = null;
      }
      const snapshot = gce.disposal === 3 ? canvas.slice() : null;
      // Rows of an interlaced image arrive in four passes.
      const rows = [];
      if (ipk & 0x40) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let r = s; r < h; r += st) rows.push(r); }
      else for (let r = 0; r < h; r++) rows.push(r);
      if (pal) {
        for (let i = 0; i < rows.length; i++) {
          const yy = y + rows[i];
          if (yy >= H) continue;
          for (let xx = 0; xx < w; xx++) {
            const ci = idx[i * w + xx];
            if (ci === gce.trans || x + xx >= W) continue;
            const o = (yy * W + x + xx) * 4, q = ci * 3;
            canvas[o] = pal[q]; canvas[o + 1] = pal[q + 1]; canvas[o + 2] = pal[q + 2]; canvas[o + 3] = 255;
          }
        }
      }
      const delay = (gce.delay <= 1 ? 10 : gce.delay) * 10;
      if (onFrame) { onFrame(canvas, W, H, delay); frames.push({ delay }); } else frames.push({ rgba: canvas.slice(), delay });
      if (gce.disposal === 2 || gce.disposal === 3) pending = { mode: gce.disposal, x, y, w, h, snapshot };
      gce = { disposal: 0, delay: 10, trans: -1 };
    }
    if (!frames.length) throw new Error('GIF has no frames');
    return { width: W, height: H, frames };
  }

  // Decode a GIF straight into small canvases (the sprite is never drawn larger than a few hundred pixels).
  function gifToCanvases(buf) {
    const out = [];
    let full = null, fg = null;
    const g = decodeGif(buf, (rgba, width, height) => {
      const k = Math.min(1, FRAME_MAX / Math.max(width, height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(width * k)); c.height = Math.max(1, Math.round(height * k));
      const cg = c.getContext('2d');
      if (k === 1) cg.putImageData(new ImageData(rgba, width, height), 0, 0);
      else {
        if (!full) { full = document.createElement('canvas'); full.width = width; full.height = height; fg = full.getContext('2d'); }
        fg.putImageData(new ImageData(rgba, width, height), 0, 0);
        cg.drawImage(full, 0, 0, c.width, c.height);
      }
      out.push(c);
    });
    return { width: g.width, height: g.height, canvases: out, delays: g.frames.map((f) => f.delay) };
  }

  // ---------- chroma key, the same maths as the WebGL key used for other media ----------
  function hexRgb(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function keyer(opts) {
    if (!opts || !opts.on) return null;
    const [kr, kg, kb] = hexRgb(opts.color);
    const kx = -0.169 * kr - 0.331 * kg + 0.5 * kb, ky = 0.5 * kr - 0.419 * kg - 0.081 * kb;
    const lo = opts.tol * 0.5, hi = lo + Math.max(0.005, opts.soft * 0.3);
    return function (d) {
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const r = d[i] / 255, g = d[i + 1] / 255, bl = d[i + 2] / 255;
        const x = -0.169 * r - 0.331 * g + 0.5 * bl - kx, y = 0.5 * r - 0.419 * g - 0.081 * bl - ky;
        const t = Math.min(1, Math.max(0, (Math.hypot(x, y) - lo) / (hi - lo)));
        const a = t * t * (3 - 2 * t);
        if (a < 1) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], m = a * 0.6 + 0.4;
          d[i] = l + (d[i] - l) * m; d[i + 1] = l + (d[i + 1] - l) * m; d[i + 2] = l + (d[i + 2] - l) * m;
          d[i + 3] *= a;
        }
      }
    };
  }

  // ---------- the hitbox from an alpha grid ----------
  // Points are cell centres in box units (-0.5..0.5): every solid cell on the outline, plus a coarse interior grid so
  // floor vanishing from under the middle of the sprite is noticed too.
  function buildMask(alpha, N) {
    const solid = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) solid[i] = alpha[i * 4 + 3] >= SOLID ? 1 : 0;
    const pts = [];
    let maxR = 0, count = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!solid[i]) continue;
      count++;
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1 || !solid[i - 1] || !solid[i + 1] || !solid[i - N] || !solid[i + N];
      if (!edge && (x % INTERIOR || y % INTERIOR)) continue;
      const px = (x + 0.5) / N - 0.5, py = (y + 0.5) / N - 0.5;
      pts.push(px, py);
      maxR = Math.max(maxR, Math.hypot(px, py));
    }
    return { pts: new Float32Array(pts), n: pts.length / 2, maxR: maxR + 0.75 / N, cells: count };
  }

  // The file's bytes without fetch where possible: fetch can be refused (file:// pages, embedded pages with strict
  // security rules), and the frames of an animated picture can only be decoded from its bytes.
  async function bytesOf(item) {
    if (item.blob) return item.blob;
    const u = item.url || '';
    if (u.startsWith('data:')) {
      const comma = u.indexOf(','), head = u.slice(5, comma), body = u.slice(comma + 1);
      const bin = /;base64/.test(head) ? atob(body) : decodeURIComponent(body);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 255;
      return new Blob([arr], { type: head.split(';')[0] || 'application/octet-stream' });
    }
    if (location.protocol === 'file:' && !u.startsWith('blob:')) return null;
    try { const r = await fetch(u); if (r.ok) return await r.blob(); } catch (e) { /* refused */ }
    return null;
  }

  class Sprite {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.mc = document.createElement('canvas');
      this.mc.width = this.mc.height = MASK;
      this.mctx = this.mc.getContext('2d', { willReadFrequently: true });
      this.src = null;
      this.mask = null;
      this.token = 0;
      this.hold = document.createElement('div');
      this.hold.className = 'sprite-hold';
      document.body.appendChild(this.hold);
    }

    // item: a media item; opts: {chroma}. Resolves once the first frame (and its hitbox) is ready.
    async load(item, opts) {
      const token = ++this.token;
      this.unload();
      this.key = keyer(opts && opts.chroma);
      this.pixel = !!(item && item.pixel);
      this.shape = SHAPES[opts && opts.shape] ? opts.shape : null; // (null: whole and uncut)
      if (!item || item.kind === 'builtin') { this.src = null; this.mask = null; this.clear(); return; }
      let src = null;
      try {
        if (item.kind === 'video') src = await this.loadVideo(item.url);
        else src = await this.loadImage(item);
      } catch (e) {
        console.warn('Memaze: could not load player media', e);
      }
      if (token !== this.token) { if (src && src.video) src.video.remove(); return; }
      this.src = src;
      if (src && src.live) { // shown by the browser itself, which keeps it animating
        src.img.className = 'media-el' + (this.pixel ? ' pixelated' : '');
        if (this.shape) { // (the rim goes on the canvas underneath)
          Object.assign(src.img.style, { position: 'absolute', left: 0, top: 0, boxSizing: 'border-box', padding: (RIM * 100).toFixed(2) + '%', objectFit: 'cover', clipPath: polygonCSS(cutOf(this.shape), 2) });
          this.clear(); drawRim(this.ctx, cutOf(this.shape), this.canvas.width);
        } else this.canvas.hidden = true;
        this.canvas.parentNode.appendChild(src.img);
      }
      this.start = performance.now();
      this.last = -1;
      this.lastSig = null;
      this.update(performance.now(), true);
    }
    unload() {
      if (this.src && this.src.live) { this.src.img.remove(); this.canvas.hidden = false; }
      if (this.src && this.src.video) { this.src.video.pause(); this.src.video.removeAttribute('src'); this.src.video.load(); this.src.video.remove(); }
      if (this.src && this.src.objectUrl) URL.revokeObjectURL(this.src.objectUrl);
      this.src = null;
    }
    clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

    async loadVideo(url) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
      v.src = url;
      this.hold.appendChild(v);
      await new Promise((res, rej) => {
        v.addEventListener('loadeddata', res, { once: true });
        v.addEventListener('error', () => rej(new Error('video failed')), { once: true });
      });
      v.play().catch(() => {});
      return { kind: 'video', video: v, w: v.videoWidth, h: v.videoHeight };
    }

    async loadImage(item) {
      const url = item.url, blob = await bytesOf(item);
      let animated = /\.(gif|png|apng|webp|avif)(\?|$)/i.test(item.name || url) || /^data:image\/(gif|png|webp|avif)/.test(url);
      if (blob) {
        const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
        const isGif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
        animated = false;
        if (isGif) {
          try {
            const g = gifToCanvases(await blob.arrayBuffer());
            if (g.canvases.length > 1) return this.framesSource(g.width, g.height, g.canvases, g.delays);
          } catch (e) { animated = true; } // a GIF this decoder can't read: let the browser play it
        } else if (typeof ImageDecoder === 'function' && /image\/(png|apng|webp|avif)/.test(blob.type)) {
          try {
            const anim = await this.decodeAnimated(blob);
            if (anim) return anim;
          } catch (e) { /* a still image */ }
        } else if (/image\/(png|webp|avif)/.test(blob.type)) animated = true; // maybe animated, and no frame decoder here
      }
      const img = new Image();
      img.decoding = 'async';
      const objectUrl = blob ? URL.createObjectURL(blob) : null;
      img.src = objectUrl || url;
      await img.decode();
      const src = { kind: 'image', img, w: img.naturalWidth || 256, h: img.naturalHeight || 256, objectUrl, svg: /svg/.test((blob && blob.type) || url) };
      // Last resort: the picture might be animated but its frames can't be read here. Let the browser play it (so it
      // still moves) and take the hitbox from whatever frame the browser hands a canvas.
      if (animated) { src.live = true; src.svg = true; }
      return src;
    }

    async decodeAnimated(blob) {
      const dec = new ImageDecoder({ data: blob.stream(), type: blob.type });
      await dec.tracks.ready;
      const track = dec.tracks.selectedTrack;
      if (!track || !track.animated || track.frameCount < 2) { dec.close(); return null; }
      const n = Math.min(MAX_FRAMES, track.frameCount), frames = [], delays = [];
      let W = 0, H = 0;
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        W = image.displayWidth; H = image.displayHeight;
        const k = Math.min(1, FRAME_MAX / Math.max(W, H));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
        c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
        delays.push(Math.max(20, (image.duration || 100000) / 1000));
        image.close();
        frames.push(c);
      }
      dec.close();
      return this.framesSource(W, H, frames, delays);
    }

    framesSource(w, h, frames, delays) {
      const at = [];
      let total = 0;
      for (const d of delays) { at.push(total); total += d; }
      return { kind: 'frames', frames, at, total, w, h };
    }

    // The frame to show now, and a signature that changes when it does.
    current(now) {
      const s = this.src;
      if (!s) return null;
      if (s.kind === 'frames') {
        const t = (now - this.start) % s.total;
        let i = s.at.length - 1;
        while (i > 0 && s.at[i] > t) i--;
        return { el: s.frames[i], sig: i, w: s.w, h: s.h };
      }
      if (s.kind === 'video') {
        const v = s.video;
        if (v.readyState < 2) return null;
        return { el: v, sig: v.currentTime, w: v.videoWidth, h: v.videoHeight };
      }
      // Still images; SVGs are re-read now and then in case they animate.
      return { el: s.img, sig: s.svg ? Math.floor((now - this.start) / 100) : 0, w: s.w, h: s.h };
    }

    // Sizes the canvas to the box it is shown in (CSS px) and repaints when the frame changed. Returns true when the
    // hitbox changed.
    update(now, force, cssSize, dpr) {
      if (cssSize) {
        const px = Math.max(8, Math.min(768, Math.round(cssSize * (dpr || 1))));
        if (this.canvas.width !== px) { this.canvas.width = this.canvas.height = px; force = true; }
      }
      const f = this.current(now);
      if (!f) return false;
      if (!force && f.sig === this.lastSig) return false;
      this.lastSig = f.sig;
      if (!this.src.live) this.paint(this.ctx, this.canvas.width, f, true);
      else if (this.shape && force) { this.clear(); drawRim(this.ctx, cutOf(this.shape), this.canvas.width); }
      this.paint(this.mctx, MASK, f, true);
      let data;
      try { data = this.mctx.getImageData(0, 0, MASK, MASK).data; } catch (e) { this.mask = null; return true; }
      this.mask = buildMask(data, MASK);
      return true;
    }

    // The picture as shown right now, copied into the square canvas c (for effects that cut it up). False if none yet.
    snapshot(c) {
      const f = this.current(performance.now());
      if (!f) return false;
      const px = this.canvas.width;
      if (c.width !== px || c.height !== px) { c.width = c.height = px; }
      const g = c.getContext('2d');
      if (this.src.live) this.paint(g, px, f, false);
      else { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px); g.drawImage(this.canvas, 0, 0); }
      return true;
    }

    // Draw a frame into a square box the way the player sees it: whole, centred (object-fit: contain); or, cut to a
    // shape, filling it (object-fit: cover), and rimmed. keyed: take out the chroma key colour (never from the rim).
    paint(g, size, f, keyed) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, size, size);
      const cut = this.shape && cutOf(this.shape), box = cut ? size * (1 - 2 * RIM) : size;
      const k = (cut ? Math.max : Math.min)(box / f.w, box / f.h), w = f.w * k, h = f.h * k;
      g.imageSmoothingEnabled = !this.pixel;
      if (cut) {
        g.save();
        g.beginPath();
        cut.forEach(([x, y], i) => (i ? g.lineTo(x * size, y * size) : g.moveTo(x * size, y * size)));
        g.closePath();
        g.clip();
      }
      g.drawImage(f.el, (size - w) / 2, (size - h) / 2, w, h);
      if (cut) g.restore();
      if (keyed && this.key) {
        try {
          const im = g.getImageData(0, 0, size, size);
          this.key(im.data);
          g.putImageData(im, 0, 0);
        } catch (e) { /* unreadable media: shown unkeyed */ }
      }
      if (cut) drawRim(g, cut, size);
    }
  }

  MZ.Sprite = Sprite;
  MZ.SHAPES = SHAPES;
  MZ.shapeCut = cutOf;
  MZ.shapeRim = { rim: RIM, line: LINE, rimColor: RIM_COLOR, lineColor: LINE_COLOR };
  MZ.decodeGif = decodeGif;
  MZ.buildMask = buildMask;
})();
