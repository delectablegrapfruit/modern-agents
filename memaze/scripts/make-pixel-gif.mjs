#!/usr/bin/env node
// Generates assets/defaults/player-pixel.gif — the default pixel-art player
// sprite: a little green slime that bounces and squashes on a loop.
//
//   node scripts/make-pixel-gif.mjs
//
// Plain Node (22+), no dependencies. Contains a small GIF89a encoder:
// global colour table, Graphic Control Extension (transparent index,
// disposal 2 = restore to background), NETSCAPE2.0 infinite looping and a
// variable-width LZW compressor with clear codes.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../assets/defaults/player-pixel.gif');

// ---------------------------------------------------------------------------
// Palette (index 0 is the transparent colour)
// ---------------------------------------------------------------------------
const PALETTE = [
  [0, 0, 0], // 0 transparent
  [29, 26, 58], // 1 outline / eyes (deep indigo)
  [63, 208, 122], // 2 body
  [148, 242, 168], // 3 body light
  [34, 150, 92], // 4 body shade
  [255, 255, 255], // 5 white shine
  [255, 127, 174], // 6 cheeks
  [226, 64, 96], // 7 mouth inside
  [90, 60, 140], // 8 ground shadow
];
const T = 0, OUTLINE = 1, BODY = 2, LIGHT = 3, SHADE = 4, WHITE = 5, CHEEK = 6, MOUTH = 7, GSHADOW = 8;

// ---------------------------------------------------------------------------
// Pixel art: drawn on a 32x32 logical grid, scaled x2 to 64x64
// ---------------------------------------------------------------------------
const LOGICAL = 32;
const SCALE = 2;
const SIZE = LOGICAL * SCALE;
const GROUND = 28; // bottom row of the body when it is touching the ground
const CX = 16; // horizontal centre (between columns 15 and 16)

// One bounce: land squash -> rebound -> stretch up -> apex -> fall -> land.
// w/h: body size in logical px, lift: px above the ground.
const FRAMES = [
  { w: 24, h: 15, lift: 0 },
  { w: 20, h: 18, lift: 0 },
  { w: 16, h: 21, lift: 2 },
  { w: 17, h: 19, lift: 5, mouth: 'open' },
  { w: 19, h: 17, lift: 7, mouth: 'open' },
  { w: 19, h: 17, lift: 7, mouth: 'open', blink: true },
  { w: 17, h: 19, lift: 5 },
  { w: 16, h: 21, lift: 2 },
  { w: 22, h: 16, lift: 0 },
  { w: 26, h: 13, lift: 0 },
];
const DELAY_CS = 8; // 80 ms per frame (GIF delays are in 1/100 s)

function drawFrame({ w, h, lift, mouth = 'smile', blink = false }) {
  const g = new Uint8Array(LOGICAL * LOGICAL); // all transparent
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < LOGICAL && y < LOGICAL) g[y * LOGICAL + x] = c;
  };
  const get = (x, y) => (x >= 0 && y >= 0 && x < LOGICAL && y < LOGICAL ? g[y * LOGICAL + x] : T);

  const bottom = GROUND - lift + 1; // exclusive bottom edge (pixel rows < bottom)
  const top = bottom - h;
  const rx = w / 2;
  const ry = h * 0.62; // dome height; the lower part is a flatter superellipse
  const cy = top + ry;
  const lowerRy = bottom - cy;

  // Slime silhouette: round dome on top, flat-ish rounded bottom.
  const inside = (x, y) => {
    const px = x + 0.5 - CX, py = y + 0.5;
    const nx = Math.abs(px) / rx;
    if (py <= cy) {
      const ny = (cy - py) / ry;
      return nx * nx + ny * ny <= 1;
    }
    const ny = (py - cy) / lowerRy;
    return nx ** 4 + ny ** 4 <= 1;
  };

  // Ground shadow: a flat pixel ellipse with dithered tips; it shrinks as the
  // slime rises.
  const srx = Math.max(3, w / 2 - lift * 0.9);
  for (const [y, k] of [[GROUND + 1, 0.8], [GROUND + 2, 1], [GROUND + 3, 0.6]]) {
    for (let x = 0; x < LOGICAL; x++) {
      const dx = Math.abs(x + 0.5 - CX) / (srx * k);
      if (dx > 1) continue;
      if (dx < 0.7 || (x + y) % 2 === 0) set(x, y, GSHADOW);
    }
  }

  // Body with rim lighting.
  for (let y = 0; y < LOGICAL; y++) {
    for (let x = 0; x < LOGICAL; x++) {
      if (!inside(x, y)) continue;
      let c = BODY;
      if (!inside(x + 1, y + 2) || !inside(x + 2, y + 1)) c = SHADE;
      else if ((!inside(x - 1, y - 2) || !inside(x - 2, y - 1)) && y < cy) c = LIGHT;
      set(x, y, c);
    }
  }

  // Outline: transparent/shadow pixels 4-adjacent to the body.
  const body = g.map((c, i) => (c === BODY || c === LIGHT || c === SHADE ? 1 : 0));
  const isBody = (x, y) => x >= 0 && y >= 0 && x < LOGICAL && y < LOGICAL && body[y * LOGICAL + x] === 1;
  for (let y = 0; y < LOGICAL; y++) {
    for (let x = 0; x < LOGICAL; x++) {
      if (isBody(x, y)) continue;
      if (isBody(x - 1, y) || isBody(x + 1, y) || isBody(x, y - 1) || isBody(x, y + 1)) set(x, y, OUTLINE);
    }
  }

  // Specular shine (top-left of the dome).
  const sx = Math.round(CX - rx * 0.55);
  const sy = Math.round(top + ry * 0.35);
  set(sx, sy, WHITE);
  set(sx + 1, sy, WHITE);
  set(sx, sy + 1, WHITE);
  if (get(sx - 1, sy + 3) !== OUTLINE) set(sx - 1, sy + 3, WHITE);

  // Face.
  const eyeY = Math.round(top + h * 0.42);
  const eyeDX = Math.max(3, Math.round(w * 0.17));
  const eyeH = h >= 16 ? 3 : 2;
  for (const side of [-1, 1]) {
    const ex = side < 0 ? CX - eyeDX - 1 : CX + eyeDX - 1; // 2px wide eye, left column
    if (blink) {
      set(ex, eyeY + 1, OUTLINE);
      set(ex + 1, eyeY + 1, OUTLINE);
      set(ex - (side < 0 ? 1 : -2), eyeY, OUTLINE); // outer corner up: a happy closed eye
    } else {
      for (let yy = 0; yy < eyeH; yy++) {
        set(ex, eyeY + yy, OUTLINE);
        set(ex + 1, eyeY + yy, OUTLINE);
      }
      set(ex, eyeY, WHITE); // glint
    }
    // Cheeks
    const chx = side < 0 ? CX - eyeDX - 3 : CX + eyeDX + 1;
    const chy = eyeY + eyeH;
    for (const [cx2, cy2] of [[chx, chy], [chx + 1, chy]]) {
      if (isBody(cx2, cy2)) set(cx2, cy2, CHEEK);
    }
  }
  const my = eyeY + eyeH + 1;
  if (mouth === 'open') {
    // small "o" mouth
    set(CX - 1, my, OUTLINE);
    set(CX, my, OUTLINE);
    set(CX - 2, my + 1, OUTLINE);
    set(CX - 1, my + 1, MOUTH);
    set(CX, my + 1, MOUTH);
    set(CX + 1, my + 1, OUTLINE);
    set(CX - 1, my + 2, OUTLINE);
    set(CX, my + 2, OUTLINE);
  } else {
    // "w"-ish cat smile
    set(CX - 3, my, OUTLINE);
    set(CX - 2, my + 1, OUTLINE);
    set(CX - 1, my, OUTLINE);
    set(CX, my, OUTLINE);
    set(CX + 1, my + 1, OUTLINE);
    set(CX + 2, my, OUTLINE);
  }

  // Tiny two-leaf sprout on the head (leans with the squash).
  const lean = Math.sign(w - 19);
  const sx0 = CX - 1 + lean;
  const SPROUT = [
    //  -4 -3 -2 -1  0  1  2  3  4      (O = outline, L = light green)
    '.OO...OO.', // top - 5
    'OLLO.OLLO', // top - 4
    '.OOLOLOO.', // top - 3
    '....O....', // top - 2
    '....O....', // top - 1
  ];
  SPROUT.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      set(sx0 + c - 4, top - 5 + r, row[c] === 'O' ? OUTLINE : LIGHT);
    }
  });

  // Upscale to SIZE x SIZE.
  const out = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      out[y * SIZE + x] = g[Math.floor(y / SCALE) * LOGICAL + Math.floor(x / SCALE)];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// GIF89a encoder
// ---------------------------------------------------------------------------
class ByteWriter {
  constructor() {
    this.chunks = [];
  }
  byte(b) {
    this.chunks.push(b & 0xff);
  }
  u16(v) {
    this.byte(v & 0xff);
    this.byte((v >> 8) & 0xff);
  }
  bytes(arr) {
    for (const b of arr) this.byte(b);
  }
  ascii(s) {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }
  toBuffer() {
    return Buffer.from(this.chunks);
  }
}

/** LZW-compress `indices` (colour indices) for GIF with the given minimum code size. */
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out = [];
  let bitBuf = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuf & 0xff);
      bitBuf >>>= 8;
      bitCount -= 8;
    }
  };

  let dict = new Map();
  let nextCode = eoiCode + 1;
  emit(clearCode);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      // Table full: emit a clear code (at the current 12-bit width) and restart.
      emit(clearCode);
      dict = new Map();
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
    } else {
      // The decoder lags one code behind, so widen as soon as the code we are
      // about to assign no longer fits in the current width.
      if (nextCode >= 1 << codeSize) codeSize++;
      dict.set(key, nextCode++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuf & 0xff);
  return out;
}

function encodeGif({ width, height, palette, frames, delayCs, transparentIndex }) {
  const w = new ByteWriter();
  // Colour table size must be a power of two >= 2.
  let bits = 1;
  while (1 << bits < palette.length) bits++;
  const tableSize = 1 << bits;

  // Header + Logical Screen Descriptor
  w.ascii('GIF89a');
  w.u16(width);
  w.u16(height);
  w.byte(0x80 | ((bits - 1) << 4) | (bits - 1)); // GCT present, colour res, GCT size
  w.byte(transparentIndex); // background colour index
  w.byte(0); // pixel aspect ratio

  // Global Colour Table
  for (let i = 0; i < tableSize; i++) w.bytes(palette[i] ?? [0, 0, 0]);

  // NETSCAPE2.0 application extension: loop forever
  w.bytes([0x21, 0xff, 0x0b]);
  w.ascii('NETSCAPE2.0');
  w.bytes([0x03, 0x01]);
  w.u16(0); // 0 = infinite
  w.byte(0);

  const minCodeSize = Math.max(2, bits);
  for (const pixels of frames) {
    // Graphic Control Extension: disposal 2 (restore to background), transparency on
    w.bytes([0x21, 0xf9, 0x04]);
    w.byte((2 << 2) | 0x01);
    w.u16(delayCs);
    w.byte(transparentIndex);
    w.byte(0);

    // Image Descriptor (full frame, no local colour table, not interlaced)
    w.byte(0x2c);
    w.u16(0);
    w.u16(0);
    w.u16(width);
    w.u16(height);
    w.byte(0);

    // Image data: LZW minimum code size + sub-blocks of <= 255 bytes
    w.byte(minCodeSize);
    const data = lzwEncode(pixels, minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255);
      w.byte(block.length);
      w.bytes(block);
    }
    w.byte(0); // block terminator
  }

  w.byte(0x3b); // trailer
  return w.toBuffer();
}

// ---------------------------------------------------------------------------
const frames = FRAMES.map(drawFrame);
const gif = encodeGif({
  width: SIZE,
  height: SIZE,
  palette: PALETTE,
  frames,
  delayCs: DELAY_CS,
  transparentIndex: T,
});
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, gif);
console.log(`wrote ${OUT} (${gif.length} bytes, ${frames.length} frames, ${SIZE}x${SIZE})`);
