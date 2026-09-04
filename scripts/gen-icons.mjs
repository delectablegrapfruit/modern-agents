/* Generates extension/icons/icon{16,32,48,128}.png without any dependencies.
 *
 * The icon: a rounded dark square, a play triangle and a two-headed
 * horizontal arrow under it (scroll sideways to scrub). Everything is drawn
 * with signed-distance functions at 4x resolution and box-downsampled, so
 * edges are anti-aliased at every size.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling factor

/* ---- PNG encoding ---------------------------------------------------- */

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---- Drawing ---------------------------------------------------------- */

/* Signed distance to a rounded box centred at (cx, cy). */
function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/* Signed distance to a triangle (a, b, c), counter-clockwise. */
function sdTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const seg = (x0, y0, x1, y1) => {
    const ex = x1 - x0;
    const ey = y1 - y0;
    const t = Math.min(1, Math.max(0, ((px - x0) * ex + (py - y0) * ey) / (ex * ex + ey * ey)));
    const dx = px - (x0 + t * ex);
    const dy = py - (y0 + t * ey);
    return dx * dx + dy * dy;
  };
  const d = Math.sqrt(Math.min(seg(ax, ay, bx, by), seg(bx, by, cx, cy), seg(cx, cy, ax, ay)));
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  return inside ? -d : d;
}

/* Signed distance to a line segment with round caps. */
function sdSegment(px, py, x0, y0, x1, y1, radius) {
  const ex = x1 - x0;
  const ey = y1 - y0;
  const t = Math.min(1, Math.max(0, ((px - x0) * ex + (py - y0) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(px - (x0 + t * ex), py - (y0 + t * ey)) - radius;
}

function coverage(d) {
  // 1 px wide anti-aliasing ramp in supersampled space
  return Math.min(1, Math.max(0, 0.5 - d));
}

function blend(dst, i, r, g, b, a) {
  const da = dst[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  dst[i] = Math.round((r * a + dst[i] * da * (1 - a)) / oa);
  dst[i + 1] = Math.round((g * a + dst[i + 1] * da * (1 - a)) / oa);
  dst[i + 2] = Math.round((b * a + dst[i + 2] * da * (1 - a)) / oa);
  dst[i + 3] = Math.round(oa * 255);
}

function render(size) {
  const S = size * SS;
  const img = Buffer.alloc(S * S * 4);
  const u = S / 128; // unit: design coordinates are on a 128 grid

  // Geometry (design grid 0..128)
  const bgRadius = 28 * u;
  const tri = [
    [40 * u, 30 * u],
    [40 * u, 78 * u],
    [86 * u, 54 * u],
  ];
  const arrowY = 100 * u;
  const arrowX0 = 26 * u;
  const arrowX1 = 102 * u;
  const stroke = 5 * u;
  const head = 12 * u;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const i = (y * S + x) * 4;

      // Background: rounded square with a vertical gradient.
      const dBg = sdRoundBox(px, py, S / 2, S / 2, S / 2, S / 2, bgRadius);
      const aBg = coverage(dBg);
      if (aBg > 0) {
        const t = y / S;
        blend(img, i, 30 + 20 * t, 41 + 24 * t, 82 + 30 * t, aBg);
      }

      // Play triangle.
      const aTri = coverage(sdTriangle(px, py, tri[0], tri[1], tri[2]));
      if (aTri > 0) blend(img, i, 255, 255, 255, aTri);

      // Two-headed horizontal arrow.
      let dArrow = sdSegment(px, py, arrowX0 + head * 0.6, arrowY, arrowX1 - head * 0.6, arrowY, stroke / 2);
      dArrow = Math.min(dArrow, sdSegment(px, py, arrowX0, arrowY, arrowX0 + head, arrowY - head, stroke / 2));
      dArrow = Math.min(dArrow, sdSegment(px, py, arrowX0, arrowY, arrowX0 + head, arrowY + head, stroke / 2));
      dArrow = Math.min(dArrow, sdSegment(px, py, arrowX1, arrowY, arrowX1 - head, arrowY - head, stroke / 2));
      dArrow = Math.min(dArrow, sdSegment(px, py, arrowX1, arrowY, arrowX1 - head, arrowY + head, stroke / 2));
      const aArrow = coverage(dArrow);
      if (aArrow > 0) blend(img, i, 125, 211, 252, aArrow);
    }
  }

  // Box downsample SS x SS -> 1 px, in premultiplied space.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const j = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const pa = img[j + 3] / 255;
          r += img[j] * pa;
          g += img[j + 1] * pa;
          b += img[j + 2] * pa;
          a += pa;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round((a / (SS * SS)) * 255);
      }
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT, `icon${size}.png`);
  writeFileSync(file, encodePng(size, size, render(size)));
  console.log('wrote', file);
}
