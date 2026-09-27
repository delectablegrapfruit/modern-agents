// Headless checks for the maze generator: determinism, connectivity, corridor gaps, surface types, sane timing.
// Run: node tests/gen.test.js
const assert = require('assert');
const MZ = require('./load.js')(['util.js', 'gen.js']);
const G = MZ.Gen;
const TYPES = new Set(['normal', 'bridge', 'blink']);

function gapViolations(m) {
  let bad = 0, worst = Infinity;
  const segs = [];
  m.edges.forEach((e, ei) => { for (let i = 1; i < e.pts.length; i++) segs.push([ei, e.pts[i - 1], e.pts[i]]); });
  for (let x = 0; x < segs.length; x++) for (let y = x + 1; y < segs.length; y++) {
    const s = segs[x], t = segs[y];
    if (s[0] === t[0]) continue;
    const E = m.edges[s[0]], F = m.edges[t[0]];
    if (E.a === F.a || E.a === F.b || E.b === F.a || E.b === F.b) continue;
    const d = Math.sqrt(MZ.segSegDist2(s[1].x, s[1].y, s[2].x, s[2].y, t[1].x, t[1].y, t[2].x, t[2].y));
    const slack = d - (E.hw + F.hw);
    worst = Math.min(worst, slack);
    if (slack < G.GAP * 0.5) bad++;
  }
  return { bad, worst };
}
function connected(m) {
  const n = m.nodes.length, adj = Array.from({ length: n }, () => []);
  for (const e of m.edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const seen = new Uint8Array(n), q = [0];
  seen[0] = 1;
  for (let i = 0; i < q.length; i++) for (const v of adj[q[i]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
  return q.length === n;
}
const noPads = (o) => o.pads === undefined || o.pads.length === 0;
const noOldParams = (p) => !['ice', 'sticky', 'boost'].some((k) => k in p);
const routeLen = (m) => {
  let l = 0;
  for (let i = 0; i + 1 < m.mainPath.length; i++) {
    const a = m.mainPath[i], b = m.mainPath[i + 1], e = m.edges.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    for (let k = 1; k < e.pts.length; k++) l += Math.hypot(e.pts[k].x - e.pts[k - 1].x, e.pts[k].y - e.pts[k - 1].y);
  }
  return l;
};

let total = 0, badMazes = 0, blinks = 0, bridges = 0;
const cases = [];
for (let L = 1; L <= 80; L++) cases.push(['journey ' + L, G.levelParams(L)]);
for (let i = 0; i < 120; i++) {
  const lat = Object.keys(G.LATTICES)[i % 5], mask = Object.keys(G.MASKS)[i % Object.keys(G.MASKS).length];
  cases.push(['custom ' + lat + '/' + mask, G.customParams({ seed: 'test' + i, lattice: lat, mask, size: (i % 7) / 6, width: (i % 5) / 4, difficulty: (i % 3) / 2 })]);
}
for (const [label, p] of cases) {
  assert.ok(noOldParams(p), label + ': params still carry ice/sticky/boost');
  const m = G.generate(p);
  const m2 = G.generate(p);
  assert.strictEqual(JSON.stringify(m.edges.map((e) => [e.pts, e.hw, e.type, e.blink])), JSON.stringify(m2.edges.map((e) => [e.pts, e.hw, e.type, e.blink])), label + ': not deterministic');
  assert.strictEqual(m.parTime + '/' + m.timeLimit + '/' + JSON.stringify(m.gems), m2.parTime + '/' + m2.timeLimit + '/' + JSON.stringify(m2.gems), label + ': timing or gems not deterministic');
  assert.ok(m.nodes.length >= 8, label + ': too few nodes (' + m.nodes.length + ')');
  assert.ok(connected(m), label + ': disconnected');
  assert.ok(m.start.x !== m.goal.x || m.start.y !== m.goal.y, label + ': start == goal');
  assert.ok(m.edges.every((e) => e.hw >= G.HW_MIN), label + ': corridor too narrow');
  assert.ok(m.edges.every((e) => TYPES.has(e.type)), label + ': unknown surface ' + m.edges.map((e) => e.type).find((t) => !TYPES.has(t)));
  assert.ok(m.edges.every((e) => (e.type === 'blink') === !!e.blink), label + ': blink data mismatch');
  assert.ok(m.edges.every((e) => e.type !== 'bridge' || e.bridge), label + ': bridge type on a non-bridge');
  assert.ok(noPads(m), label + ': pads still generated');
  blinks += m.edges.filter((e) => e.type === 'blink').length;
  bridges += m.edges.filter((e) => e.type === 'bridge').length;
  // Timing: par is at least the route dragged at the fastest par speed, a clear finish is possible, the limit leaves room
  // to explore and is a multiple of 5.
  const len = routeLen(m);
  assert.ok(Number.isInteger(m.parTime) && m.parTime >= 3, label + ': par ' + m.parTime);
  assert.ok(m.parTime >= len / 520, label + ': par ' + m.parTime + ' faster than dragging ' + Math.round(len) + ' at 520/s');
  assert.ok(m.parTime <= len / 340 + m.turns * 0.2 + 1.5 + 3 * m.edges.filter((e) => e.type === 'blink').length + 1, label + ': par too slack');
  assert.ok(m.timeLimit % 5 === 0 && m.timeLimit >= (m.parTime - 1) * 2.3 + 15, label + ': time limit ' + m.timeLimit + ' vs par ' + m.parTime);
  const g = gapViolations(m);
  total++;
  if (g.bad) { badMazes++; console.log('gap violations', label, g.bad, 'worst slack', g.worst.toFixed(1)); }
}
assert.ok(blinks > 0, 'no vanishing bridges generated at all');
// Custom hazard switch: only 'blink' is left, and it works both ways.
for (const on of [false, true]) {
  const p = G.customParams({ seed: 'hz', difficulty: 1, hazards: { blink: on, ice: true, sticky: true, boost: true } });
  assert.ok(noOldParams(p), 'custom params still carry ice/sticky/boost');
  assert.ok(on ? p.blink > 0 : p.blink === 0, 'custom blink switch ' + on);
  const m = G.generate(p);
  assert.ok(m.edges.every((e) => TYPES.has(e.type)), 'custom hazards: unknown surface');
  if (!on) assert.ok(m.edges.every((e) => e.type !== 'blink'), 'custom blink off still has vanishing bridges');
}
// Endless chunks: deterministic, only known surfaces, no pads, and seamless links (the link's far end is the neighbour's node).
let chunkBlinks = 0;
for (let cx = -12; cx <= 12; cx += (Math.abs(cx) < 3 ? 1 : 3)) for (let cy = -3; cy <= 3; cy++) {
  const c = G.endless.chunk(1234, cx, cy), c2 = G.endless.chunk(1234, cx, cy);
  assert.strictEqual(JSON.stringify(c), JSON.stringify(c2), 'endless chunk not deterministic at ' + cx + ',' + cy);
  assert.ok(c.edges.every((e) => TYPES.has(e.type)), 'endless: unknown surface at ' + cx + ',' + cy);
  assert.ok(noPads(c), 'endless: pads at ' + cx + ',' + cy);
  chunkBlinks += c.edges.filter((e) => e.type === 'blink').length;
  const right = G.endless.chunk(1234, cx + 1, cy);
  for (const e of c.edges.filter((e) => e.link)) {
    const B = e.pts[1];
    const hit = right.edges.concat(G.endless.chunk(1234, cx, cy + 1).edges).some((f) => f.pts.some((q) => Math.abs(q.x - B.x) < 1e-9 && Math.abs(q.y - B.y) < 1e-9));
    assert.ok(hit, 'endless link dangling at chunk ' + cx + ',' + cy);
  }
}
assert.ok(chunkBlinks > 0, 'endless: no vanishing bridges far out');
console.log(total + ' mazes (' + blinks + ' vanishing bridges, ' + bridges + ' island links), ' + badMazes + ' with gap violations; endless chunks ok');
assert.strictEqual(badMazes, 0);
