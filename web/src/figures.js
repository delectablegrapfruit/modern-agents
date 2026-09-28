// figures.js: the app's Figures.swift and Sketch.image: each frame of a figure drawn once from its RoninArt sketch
// (the core's `sketch`), cut down to what it draws, anchored at the feet; the rim of light round the body; and the
// setting's light laid over it as the app's tint shader does (mix(c.rgb, tint * c.a, amount)).

/** A colour from the core: [r, g, b, a] or {r, g, b, a}, 0...1. */
function paintCSS(p) {
  if (!p) return null;
  const r = p.r ?? p[0], g = p.g ?? p[1], b = p.b ?? p[2], a = p.a ?? p.alpha ?? p[3] ?? 1;
  const c = (v) => Math.round(clamp(v, 0, 1) * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

/** A shape's path, as a Path2D in the sketch's pixels (y up). Paths come as pen moves: in a Float32Array, an op then
 *  its points (0 move x y, 1 line x y, 2 quad x y cx cy, 3 close), or as tokens ('M', x, y, 'L', ..., 'Q', x, y, cx, cy, 'Z'). */
function shapePath(shape) {
  if (shape._p) return shape._p;
  const p = new Path2D();
  if (shape.ellipse) {
    const e = shape.ellipse;
    const x = e.x ?? e[0], y = e.y ?? e[1], w = e.w ?? e.width ?? e[2], h = e.h ?? e.height ?? e[3];
    p.ellipse(x + w / 2, y + h / 2, Math.max(0.01, w / 2), Math.max(0.01, h / 2), 0, 0, TAU);
  } else if (shape.path) {
    const d = shape.path;
    let i = 0;
    if (typeof d[0] === 'string') {
      while (i < d.length) {
        const op = d[i++];
        if (op === 'M') { p.moveTo(d[i], d[i + 1]); i += 2; }
        else if (op === 'L') { p.lineTo(d[i], d[i + 1]); i += 2; }
        else if (op === 'Q') { p.quadraticCurveTo(d[i + 2], d[i + 3], d[i], d[i + 1]); i += 4; }
        else if (op === 'Z') p.closePath();
      }
    } else {
      while (i < d.length) {
        const op = d[i++];
        if (op === 0) { p.moveTo(d[i], d[i + 1]); i += 2; }
        else if (op === 1) { p.lineTo(d[i], d[i + 1]); i += 2; }
        else if (op === 2) { p.quadraticCurveTo(d[i + 2], d[i + 3], d[i], d[i + 1]); i += 4; }
        else if (op === 3) p.closePath();
        else break;
      }
    }
  }
  shape._p = p;
  return p;
}

/** Every point a shape touches, for its bounds (Sketch.bounds). */
function shapeBounds(shape, box) {
  const grow = shape.stroke ? (shape.width || 0) / 2 : 0;
  const add = (x, y) => {
    box.minX = Math.min(box.minX, x - grow); box.minY = Math.min(box.minY, y - grow);
    box.maxX = Math.max(box.maxX, x + grow); box.maxY = Math.max(box.maxY, y + grow);
  };
  if (shape.ellipse) {
    const e = shape.ellipse;
    const x = e.x ?? e[0], y = e.y ?? e[1], w = e.w ?? e.width ?? e[2], h = e.h ?? e.height ?? e[3];
    add(x, y); add(x + w, y + h);
  } else if (shape.path) {
    const d = shape.path;
    let i = 0;
    if (typeof d[0] === 'string') {
      while (i < d.length) {
        const op = d[i++];
        if (op === 'M' || op === 'L') { add(d[i], d[i + 1]); i += 2; }
        else if (op === 'Q') { add(d[i], d[i + 1]); add(d[i + 2], d[i + 3]); i += 4; }
      }
    } else {
      while (i < d.length) {
        const op = d[i++];
        if (op === 0 || op === 1) { add(d[i], d[i + 1]); i += 2; }
        else if (op === 2) { add(d[i], d[i + 1]); add(d[i + 2], d[i + 3]); i += 4; }
        else if (op !== 3) break;
      }
    }
  }
}

function drawShape(ctx, shape) {
  const path = shapePath(shape);
  if (shape.fill) { ctx.fillStyle = paintCSS(shape.fill); ctx.fill(path); }
  if (shape.stroke) {
    ctx.strokeStyle = paintCSS(shape.stroke);
    ctx.lineWidth = shape.width || 1;
    ctx.lineCap = shape.round ? 'round' : 'butt';
    ctx.lineJoin = shape.round ? 'round' : 'miter';
    ctx.stroke(path);
  }
}

let layerCanvas = null;

/** A drawn frame: its sketch, the part of the canvas it covers, and its rasters at each scale and tint. */
class Piece {
  constructor(sketch) {
    this.sketch = sketch;
    this.W = sketch.width; this.H = sketch.height;
    const rim = sketch.rimRadius ?? sketch.rim?.radius ?? 1.4;
    this.rimRadius = rim;
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const list of [sketch.underlay, sketch.body, sketch.overlay]) for (const s of list || []) shapeBounds(s, box);
    const margin = rim * 3 + 2;
    if (!(box.minX <= box.maxX)) { box.minX = 0; box.minY = 0; box.maxX = 1; box.maxY = 1; }
    const x0 = Math.max(0, Math.floor(box.minX - margin)), y0 = Math.max(0, Math.floor(box.minY - margin));
    const x1 = Math.min(this.W, Math.ceil(box.maxX + margin)), y1 = Math.min(this.H, Math.ceil(box.maxY + margin));
    this.bx = x0; this.by = y0; this.bw = Math.max(1, x1 - x0); this.bh = Math.max(1, y1 - y0);
    // As fractions of the canvas (Figures.Piece.rect, y up).
    this.rect = { x: x0 / this.W, y: y0 / this.H, w: this.bw / this.W, h: this.bh / this.H };
    this.rasters = new Map();
    this.empty = !(sketch.body?.length || sketch.overlay?.length || sketch.underlay?.length);
  }

  /** The frame drawn `k` device pixels to a sketch pixel: underlay, the body with its rim, then the overlay. */
  raster(k) {
    const key = Math.round(k * 100);
    let c = this.rasters.get(key);
    if (c) return c;
    k = key / 100;
    const s = this.sketch;
    const w = Math.ceil(this.bw * k), h = Math.ceil(this.bh * k);
    c = makeCanvas(w, h);
    const x = c.getContext('2d');
    const place = (ctx) => ctx.setTransform(k, 0, 0, -k, -this.bx * k, (this.by + this.bh) * k);
    place(x);
    for (const shape of s.underlay || []) drawShape(x, shape);
    if (s.body && s.body.length) {
      if (!layerCanvas || layerCanvas.width < w || layerCanvas.height < h) {
        layerCanvas = makeCanvas(Math.max(w, layerCanvas?.width || 0), Math.max(h, layerCanvas?.height || 0));
      }
      const l = layerCanvas.getContext('2d');
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.clearRect(0, 0, w, h);
      place(l);
      for (const shape of s.body) drawShape(l, shape);
      x.save();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.shadowColor = paintCSS(s.rim ? (s.rim.color ?? s.rim) : [0.7, 0.72, 0.8, 0.3]);
      x.shadowBlur = this.rimRadius * 1.6 * k;
      x.drawImage(layerCanvas, 0, 0, w, h, 0, 0, w, h);
      x.restore();
      place(x);
    }
    for (const shape of s.overlay || []) drawShape(x, shape);
    c.tints = new Map();
    this.rasters.set(key, c);
    return c;
  }

  /** The raster with a tint over it (`amount` of the way to `color`), kept for reuse. */
  tinted(k, color, amount) {
    const base = this.raster(k);
    const a = Math.round(clamp(amount, 0, 1) * 48) / 48;
    if (a <= 0) return base;
    const key = color.key() + '|' + a;
    let c = base.tints.get(key);
    if (c) return c;
    c = makeCanvas(base.width, base.height);
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.globalAlpha = a;
    x.fillStyle = color.css();
    x.fillRect(0, 0, c.width, c.height);
    if (base.tints.size > 40) base.tints.delete(base.tints.keys().next().value);
    base.tints.set(key, c);
    return c;
  }
}

/** The figures, as the core draws them. */
const Figures = {
  core: null,
  cache: new Map(),
  frameLists: new Map(),
  smears: new Map(),

  key(cast, frame) { return cast + '|' + frame; },

  piece(cast, frame) {
    const key = Figures.key(cast, frame);
    let p = Figures.cache.get(key);
    if (!p) {
      p = new Piece(Figures.core.sketch(cast, frame));
      Figures.cache.set(key, p);
    }
    return p;
  },

  /** A figure's frames (Figure.frames). */
  frames(cast) {
    let f = Figures.frameLists.get(cast);
    if (!f) { f = new Set(Figures.core.frames(cast)); Figures.frameLists.set(cast, f); }
    return f;
  },
  has(cast, frame) { return Figures.frames(cast).has(frame); },

  /** Whether a frame carries its own smear: no ghost of the pose before should be left behind it (Figures.smeared). */
  smeared(cast, frame) {
    const key = Figures.key(cast, frame);
    let s = Figures.smears.get(key);
    if (s === undefined) {
      const core = Figures.core;
      if (typeof core.smeared === 'function') s = !!core.smeared(cast, frame);
      else s = !!Figures.piece(cast, frame).sketch.smeared;
      Figures.smears.set(key, s);
    }
    return s;
  },

  /** A figure's whole canvas on screen for a ronin `ronin` points tall (Figures.size). */
  size(cast, ronin) {
    const h = ronin * Builds[cast].height;
    return { w: FigureCanvas.width * h, h: FigureCanvas.height * h };
  },

  /** Device pixels to a sketch pixel for a ronin `ronin` points tall. */
  scale(cast, ronin) { return ronin * R.px / Builds[cast].pixels; },

  /** Draws every frame of the casts given now, a few at a time, so the first fight doesn't stutter. */
  preload(casts, ronin, budgetMs = 6) {
    const queue = [];
    for (const cast of casts) for (const f of Figures.frames(cast)) queue.push([cast, f]);
    return queue;
  },
};

/** A sprite that draws a figure's frame (SKSpriteNode with Figures.apply and the tint shader). */
class FigureSprite extends Node {
  constructor(cast) {
    super();
    this.cast = cast;
    this.piece = null;
    this.ronin = 60;
    this.tint = { color: Palette.blood, amount: 0 };
    this.silhouette = null; // draw as a flat silhouette of this colour (the ghost of a pose)
  }
  /** Puts a frame on it for a ronin `ronin` points tall (Figures.apply). */
  apply(frame, ronin) { this.applyPiece(Figures.piece(this.cast, frame), ronin); }
  applyPiece(piece, ronin) { this.piece = piece; this.ronin = ronin; }
  setTint(color, amount) { this.tint = { color, amount }; }
  get paints() { return !!this.piece && !this.piece.empty; }
  paint(ctx) {
    const p = this.piece;
    const full = Figures.size(this.cast, this.ronin);
    const w = full.w * p.rect.w, h = full.h * p.rect.h;
    const ax = (FigureCanvas.anchorX - p.rect.x) / p.rect.w, ay = (FigureCanvas.anchorY - p.rect.y) / p.rect.h;
    const k = Figures.scale(this.cast, this.ronin);
    const img = this.silhouette ? p.tinted(k, this.silhouette, 1) : p.tinted(k, this.tint.color, this.tint.amount);
    ctx.scale(1, -1);
    ctx.drawImage(img, -ax * w, -(1 - ay) * h, w, h);
  }
}
