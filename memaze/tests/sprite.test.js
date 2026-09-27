// Headless checks for the player picture pipeline: the GIF decoder and the hitbox built from a frame's alpha.
// Run: node tests/sprite.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const MZ = require('./load.js')(['util.js', 'sprite.js', 'defaults-data.js']);

// The built-in animated GIF: 64x64, 10 frames of 80 ms, hard-edged transparency, and the frames really differ.
const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'defaults', 'player-pixel.gif'));
const g = MZ.decodeGif(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
assert.strictEqual(g.width, 64);
assert.strictEqual(g.height, 64);
assert.strictEqual(g.frames.length, 10, 'frames');
assert.ok(g.frames.every((f) => f.delay === 80), 'delays');
const alphaCount = (f) => { let n = 0; for (let i = 3; i < f.rgba.length; i += 4) n += f.rgba[i] ? 1 : 0; return n; };
const counts = g.frames.map(alphaCount);
assert.ok(counts.every((n) => n > 200 && n < 64 * 64), 'every frame has transparent and solid pixels: ' + counts);
assert.ok(g.frames.every((f) => { for (let i = 3; i < f.rgba.length; i += 4) if (f.rgba[i] !== 0 && f.rgba[i] !== 255) return false; return true; }), '1-bit alpha');
assert.ok(new Set(g.frames.map((f) => Buffer.from(f.rgba).toString('base64'))).size > 3, 'frames differ');

// The embedded copy is the same file.
const embedded = MZ.DEFAULT_DATA['player-pixel.gif'].split(',')[1];
assert.strictEqual(embedded, buf.toString('base64'), 'js/defaults-data.js is stale: run node scripts/embed-defaults.mjs');
const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'defaults', 'player-sticker.svg')).toString('base64');
assert.strictEqual(MZ.DEFAULT_DATA['player-sticker.svg'].split(',')[1], svg, 'js/defaults-data.js is stale: run node scripts/embed-defaults.mjs');

// Hitbox from an alpha grid: a disc of radius 30 cells in a 96-cell box, with a hole in the middle.
const N = 96, rgba = new Uint8ClampedArray(N * N * 4);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2);
  rgba[(y * N + x) * 4 + 3] = d < 30 && d > 10 ? 255 : d < 31 ? 100 : 0; // a faint (<50%) rim doesn't count
}
const m = MZ.buildMask(rgba, N);
assert.ok(m.n > 150, 'outline sampled: ' + m.n);
assert.ok(Math.abs(m.maxR - 30 / N) < 1.5 / N, 'reach ' + m.maxR * N);
for (let i = 0; i < m.pts.length; i += 2) {
  const d = Math.hypot(m.pts[i], m.pts[i + 1]) * N;
  assert.ok(d < 30.5 && d > 9.5, 'point outside the solid ring at ' + d.toFixed(2));
}
const empty = MZ.buildMask(new Uint8ClampedArray(N * N * 4), N);
assert.strictEqual(empty.n, 0);
console.log('sprite: GIF decoded (10 frames), embedded defaults current, hitbox mask ok');
