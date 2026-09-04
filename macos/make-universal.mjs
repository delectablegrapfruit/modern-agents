#!/usr/bin/env node
// Combine thin Mach-O binaries into a universal (fat) binary. Usage: make-universal.mjs out x86_64.bin arm64.bin
import { readFileSync, writeFileSync } from 'node:fs';
const [out, x86Path, armPath] = process.argv.slice(2);
if (!out || !x86Path || !armPath) { console.error('usage: make-universal.mjs <out> <x86_64> <arm64>'); process.exit(1); }
const slices = [
  { cputype: 0x01000007, cpusubtype: 0x00000003, data: readFileSync(x86Path) }, // x86_64
  { cputype: 0x0100000c, cpusubtype: 0x00000000, data: readFileSync(armPath) }, // arm64
];
const ALIGN = 1 << 14;
const header = Buffer.alloc(8 + 20 * slices.length);
header.writeUInt32BE(0xcafebabe, 0); header.writeUInt32BE(slices.length, 4);
let offset = ALIGN;
const parts = [];
slices.forEach((s, i) => {
  const o = 8 + i * 20;
  header.writeUInt32BE(s.cputype, o); header.writeUInt32BE(s.cpusubtype, o + 4);
  header.writeUInt32BE(offset, o + 8); header.writeUInt32BE(s.data.length, o + 12); header.writeUInt32BE(14, o + 16);
  parts.push({ offset, data: s.data });
  offset = Math.ceil((offset + s.data.length) / ALIGN) * ALIGN;
});
const file = Buffer.alloc(offset);
header.copy(file, 0);
for (const p of parts) p.data.copy(file, p.offset);
writeFileSync(out, file, { mode: 0o755 });
console.log(`wrote ${out} (${file.length} bytes, ${slices.length} slices)`);
