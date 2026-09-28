// Headless check of the ring toss physics: lifts the physics script out of index.html and throws rings in Node.
// Run: node Games/RingToss/physics-check.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.match(/<script id="physics">([\s\S]*?)<\/script>/)[1];
const ctx = { Math };
vm.runInNewContext(src, ctx);
const { Sim } = ctx.RingPhysics;

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function toss(mode, power, aim, rnd) {
  const sim = new Sim(mode), ring = sim.throwRing(power, aim, rnd);
  let t = 0, res = null, gripAt = null, stuckAt = null, snapAt = null, maxTilt = 0;
  while (t < 12) {
    sim.step(1 / 120); t += 1 / 120;
    maxTilt = Math.max(maxTilt, Math.acos(Math.min(1, sim.target.ay)));
    for (const e of sim.events) {
      if (e.ring !== ring.id) continue;
      if (e.kind === 'grip' && gripAt === null) gripAt = { t, s: ring.grip.s };
      if (e.kind === 'stuck' && stuckAt === null) stuckAt = { t, s: ring.grip.s };
      if (e.kind === 'snap') snapAt = t;
    }
    sim.events.length = 0;
    if (!res) { res = sim.result(ring, t); if (res) res.t = t; }
    if (res && (res.key !== 'ringer' || snapAt !== null)) break;
  }
  return { key: res.key, t: res.t, gripAt, stuckAt, snapAt, tiltDeg: (maxTilt * 180) / Math.PI };
}

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const steady = () => 0.5; // no hand wobble

const good = toss('hotdog', 0.6, 0, steady);
check(good.key === 'ringer', 'a straight 60% toss rings the hot dog');
check(good.gripAt && good.stuckAt && good.gripAt.s - good.stuckAt.s > 0.02, `the ring squeezes on and slides down before it holds (${good.gripAt && good.stuckAt ? ((good.gripAt.s - good.stuckAt.s) * 100).toFixed(1) : '?'} cm)`);
check(good.snapAt && good.snapAt - good.stuckAt.t > 1.7 && good.snapAt - good.stuckAt.t < 2.7, 'the dog snaps the ring about 2 s after it stops');
check(toss('hotdog', 0.3, 0, steady).key === 'miss', 'a 30% toss falls short into the void');
check(toss('hotdog', 0.9, 0, steady).key !== 'ringer', 'a 90% toss sails past');
check(toss('hotdog', 0.5, 0, steady).tiltDeg > 3, 'clipping the dog swings it on its pivot');

// Same grid of good-looking throws at both targets: the knot must be clearly harder than the hot dog.
let ringers = 0, knots = 0, slowest = 0, n = 0;
for (let p = 0.56; p <= 0.66001; p += 0.02) for (let a = -0.15; a <= 0.15001; a += 0.05) {
  const seed = Math.round(p * 1e4 + a * 1e6 + 3);
  const h = toss('hotdog', p, a, seeded(seed)), b = toss('balloon', p, a, seeded(seed));
  ringers += h.key === 'ringer'; knots += b.key === 'bullseye'; slowest = Math.max(slowest, h.t, b.t); n++;
}
console.log(`     near-perfect throws (${n}): hot dog ringers ${ringers}, balloon bullseyes ${knots}, slowest result ${slowest.toFixed(1)} s`);
check(ringers >= n * 0.4, 'near-perfect throws often ring the hot dog (the assist is doing its job)');
check(knots > 0 && knots <= ringers / 2, 'the knot is at most half as easy');

// A dead-centre throw at the knot threads it and stays: the short neck must not let the rebound hop off.
let centre = 0, cn = 0;
for (let seed = 1; seed <= 40; seed++) for (const p of [0.58, 0.6, 0.62]) { centre += toss('balloon', p, 0, seeded(seed * 7919)).key === 'bullseye'; cn++; }
console.log(`     dead-centre throws at the knot: ${centre} of ${cn} bullseyes`);
check(centre >= cn * 0.7, 'most dead-centre throws at the knot stay on it');
check(slowest <= 7.01, 'every throw is decided within 7 s');

process.exit(failed ? 1 : 0);
