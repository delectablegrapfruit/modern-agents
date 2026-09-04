#!/usr/bin/env node
// Pack PNG renders of the app icon into an .icns file. Usage: make-icns.mjs out.icns dir-with-icon-<size>.png
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [out, dir] = process.argv.slice(2);
const TYPES = { 16: ['icp4'], 32: ['icp5', 'ic11'], 64: ['icp6', 'ic12'], 128: ['ic07'], 256: ['ic08', 'ic13'], 512: ['ic09', 'ic14'], 1024: ['ic10'] };
const elements = [];
for (const [size, types] of Object.entries(TYPES)) {
  const file = join(dir, `icon-${size}.png`);
  if (!existsSync(file)) continue;
  const png = readFileSync(file);
  for (const type of types) {
    const el = Buffer.alloc(8 + png.length);
    el.write(type, 0, 'ascii'); el.writeUInt32BE(8 + png.length, 4); png.copy(el, 8);
    elements.push(el);
  }
}
const total = 8 + elements.reduce((n, e) => n + e.length, 0);
const header = Buffer.alloc(8); header.write('icns', 0, 'ascii'); header.writeUInt32BE(total, 4);
writeFileSync(out, Buffer.concat([header, ...elements]));
console.log(`wrote ${out} (${total} bytes, ${elements.length} icon elements)`);
