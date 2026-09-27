// Headless check of the ring toss physics: lifts the physics script out of index.html and throws rings in Node.
// Run: node Games/RingToss/physics-check.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.match(/<script id="physics">([\s\S]*?)<\/script>/)[1];
const ctx = {};
vm.runInNewContext(src, ctx);
const { Sim } = ctx.RingPhysics;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function toss(mode, power, aim, rnd) {
  const sim = new Sim(mode), ring = sim.throwRing(power, aim, rnd);
  let t = 0;
  while (t < 8 && !sim.settled(ring)) { sim.step(1 / 120); t += 1 / 120; }
  return { key: sim.classify(ring).key, t };
}

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const steady = () => 0.5; // no hand wobble

check(toss('hotdog', 0.58, 0, steady).key === 'ringer', 'a straight 58% toss rings the hot dog');
check(toss('hotdog', 0.3, 0, steady).key !== 'ringer', 'a 30% toss falls short');
check(toss('hotdog', 0.9, 0, steady).key !== 'ringer', 'a 90% toss sails past');

// Same grid of good-looking throws at both targets: the knot must be clearly harder than the hot dog.
let ringers = 0, knots = 0, slowest = 0, n = 0;
for (let p = 0.54; p <= 0.62001; p += 0.02) for (let a = -0.15; a <= 0.15001; a += 0.05) {
  const seed = Math.round(p * 1e4 + a * 1e6 + 3);
  const h = toss('hotdog', p, a, seeded(seed)), b = toss('balloon', p, a, seeded(seed));
  ringers += h.key === 'ringer'; knots += b.key === 'bullseye'; slowest = Math.max(slowest, h.t, b.t); n++;
}
console.log(`     near-perfect throws (${n}): hot dog ringers ${ringers}, balloon bullseyes ${knots}, slowest settle ${slowest.toFixed(1)} s`);
check(ringers >= n * 0.4, 'near-perfect throws often ring the hot dog');
check(knots > 0 && knots <= ringers / 2, 'the knot is at most half as easy');
check(slowest < 8, 'every throw settles within 8 s');

process.exit(failed ? 1 : 0);
