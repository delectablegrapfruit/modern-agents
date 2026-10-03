// Mural's photo import, measured (scripts/mural-unit.cjs): generated test photos (vivid primaries, a skin-tone gradient, a
// face, a street at dusk, a small saturated flower and door on a dull field) and how faithfully a mural keeps them: the
// mean OKLab error a quarter against the ideal (the photo area-averaged in linear light), the chroma kept on the vivid
// quarters, and how far each feature colour is from the nearest palette colour.
'use strict';
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// A small deterministic noise (a photo's grain).
const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5; };
const mixc = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const PHOTOS = {
  // Six vivid primaries in a 2 × 3 grid.
  primaries(x, y) { const C = [[230, 30, 35], [30, 170, 60], [30, 70, 220], [245, 210, 30], [210, 40, 170], [30, 190, 210]]; return C[(y < 0.5 ? 0 : 3) + Math.min(2, Math.floor(x * 3))]; },
  // Skin tones, light to deep, top to bottom, lit from the left.
  skin(x, y) { const s = [[[0, [250, 222, 196]], [0.35, [234, 180, 140]], [0.7, [176, 116, 78]], [1, [104, 62, 38]]]]; let c = s[0][0][1]; for (let i = 1; i < s[0].length; i++) if (y <= s[0][i][0]) { const [t0, c0] = s[0][i - 1], [t1, c1] = s[0][i]; c = mixc(c0, c1, (y - t0) / (t1 - t0)); break; } return c.map((v) => v * (1.06 - 0.14 * x)); },
  // A face (a skin gradient, lit from the left) before a teal wall, dark hair, red lips.
  face(x, y) {
    const dx = (x - 0.5) / 0.3, dy = (y - 0.52) / 0.36, r = dx * dx + dy * dy;
    if (r < 1) {
      if (y < 0.3 && r > 0.45) return [58, 36, 26];
      if (Math.abs(x - 0.5) < 0.08 && Math.abs(y - 0.72) < 0.022) return [190, 60, 70];
      const t = Math.max(0, Math.min(1, (x - 0.2) / 0.6)); return mixc(mixc([246, 208, 178], [214, 158, 120], t), [150, 96, 66], Math.max(0, r - 0.6));
    }
    return mixc([40, 128, 130], [26, 84, 92], y);
  },
  // A street at dusk: a sky from blue to orange, a sunlit ochre wall, green trees (fine leaves), a small red car, fine
  // stripes (red and green, finer than a quarter) on an awning.
  scene(x, y) {
    if (y < 0.42) {
      if (x > 0.55 && x < 0.9 && y > 0.3 && y < 0.36 && Math.floor(x * 400) % 2) return [220, 40, 40];
      if (x > 0.55 && x < 0.9 && y > 0.3 && y < 0.36) return [40, 170, 70];
      return mixc([60, 110, 200], [250, 160, 80], y / 0.42);
    }
    if (x < 0.45 && y < 0.8) { const leaf = Math.sin(x * 300) * Math.sin(y * 280) > 0.2; return leaf ? [70, 150, 50] : [30, 80, 30]; }
    if (y < 0.8) return mixc([226, 170, 80], [180, 120, 60], (y - 0.42) / 0.38);
    if (x > 0.62 && x < 0.74 && y > 0.84 && y < 0.9) return [210, 25, 40];
    return [92, 90, 96];
  },
  // A dull grey-green field with a small red flower and a small blue door.
  small(x, y) { if ((x - 0.68) ** 2 + (y - 0.4) ** 2 < 0.06 ** 2) return [225, 35, 45]; if (x > 0.2 && x < 0.27 && y > 0.62 && y < 0.74) return [35, 80, 210]; return mixc([128, 134, 120], [96, 104, 90], y); },
};
/** A photo w × h (rgba, 0-255) with a little grain. */
function photo(name, w, h) {
  const f = PHOTOS[name], px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = f((x + 0.5) / w, (y + 0.5) / h), i = (y * w + x) * 4, n = 10 * hash(x, y, 1);
    px[i] = c[0] + n; px[i + 1] = c[1] + n * 0.9 + 4 * hash(x, y, 2); px[i + 2] = c[2] + n * 1.1; px[i + 3] = 255;
  }
  return px;
}
/** The ideal grid: each quarter the exact area average of the photo in linear light, as OKLab. */
function ideal(px, w, h, QW, QH) {
  const out = [];
  for (let qy = 0; qy < QH; qy++) for (let qx = 0; qx < QW; qx++) {
    const x0 = qx * w / QW, x1 = (qx + 1) * w / QW, y0 = qy * h / QH, y1 = (qy + 1) * h / QH; let s = [0, 0, 0], n = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const a = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0)), i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) s[k] += lin(px[i + k]) * a; n += a;
    }
    const enc = (v) => { v /= n; return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
    out.push(lab(enc(s[0]), enc(s[1]), enc(s[2])));
  }
  return out;
}
const hexLab = (h) => lab(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
const chroma = (c) => Math.hypot(c[1], c[2]);
const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/** { err: mean OKLab error a quarter, chroma: palette chroma over the ideal's on the vivid quarters (chroma > 0.08), worst: the farthest a feature colour is from the palette }. */
function measure(own, px, w, h, feats) {
  const id = ideal(px, w, h, own.w, own.h), pal = own.pal.map(hexLab), B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  let e = 0, cs = 0, ci = 0;
  for (let i = 0; i < id.length; i++) { const p = pal[B36.indexOf(own.px[i])]; e += dE(p, id[i]); if (chroma(id[i]) > 0.08) { cs += chroma(p); ci += chroma(id[i]); } }
  const worst = (feats || []).reduce((m, f) => Math.max(m, Math.min(...pal.map((p) => dE(p, lab(...f))))), 0);
  return { err: e / id.length, chroma: ci ? cs / ci : 1, worst, k: own.pal.length };
}
const FEATS = { face: [[40, 128, 130], [58, 36, 26]], scene: [[210, 25, 40], [226, 170, 80]], primaries: [[230, 30, 35], [30, 170, 60], [30, 70, 220], [245, 210, 30], [210, 40, 170], [30, 190, 210]], skin: [], small: [[225, 35, 45], [35, 80, 210]] };
module.exports = { photo, ideal, measure, PHOTOS, FEATS, lab, hexLab };
