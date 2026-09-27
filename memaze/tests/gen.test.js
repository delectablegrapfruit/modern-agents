// Headless checks for the maze generator: determinism, connectivity, corridor gaps, sane timing. Run: node tests/gen.test.js
const assert = require('assert');
const MZ = require('./load.js')(['util.js', 'gen.js']);
const G = MZ.Gen;

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

let total = 0, badMazes = 0;
const cases = [];
for (let L = 1; L <= 80; L++) cases.push(['journey ' + L, G.levelParams(L)]);
for (let i = 0; i < 120; i++) {
  const lat = Object.keys(G.LATTICES)[i % 5], mask = Object.keys(G.MASKS)[i % Object.keys(G.MASKS).length];
  cases.push(['custom ' + lat + '/' + mask, G.customParams({ seed: 'test' + i, lattice: lat, mask, size: (i % 7) / 6, width: (i % 5) / 4, difficulty: (i % 3) / 2 })]);
}
for (const [label, p] of cases) {
  const m = G.generate(p);
  const m2 = G.generate(p);
  assert.strictEqual(JSON.stringify(m.edges.map((e) => e.pts)), JSON.stringify(m2.edges.map((e) => e.pts)), label + ': not deterministic');
  assert.ok(m.nodes.length >= 8, label + ': too few nodes (' + m.nodes.length + ')');
  assert.ok(connected(m), label + ': disconnected');
  assert.ok(m.start.x !== m.goal.x || m.start.y !== m.goal.y, label + ': start == goal');
  assert.ok(m.timeLimit > m.parTime, label + ': time limit below par');
  assert.ok(m.edges.every((e) => e.hw >= G.HW_MIN), label + ': corridor too narrow');
  const g = gapViolations(m);
  total++;
  if (g.bad) { badMazes++; console.log('gap violations', label, g.bad, 'worst slack', g.worst.toFixed(1)); }
}
// Endless chunks: deterministic and seamless links (the link's far end is the neighbour's node).
for (let cx = -3; cx <= 3; cx++) for (let cy = -3; cy <= 3; cy++) {
  const c = G.endless.chunk(1234, cx, cy), c2 = G.endless.chunk(1234, cx, cy);
  assert.strictEqual(JSON.stringify(c.edges.map((e) => e.pts)), JSON.stringify(c2.edges.map((e) => e.pts)));
  const right = G.endless.chunk(1234, cx + 1, cy);
  for (const e of c.edges.filter((e) => e.link)) {
    const B = e.pts[1];
    const hit = right.edges.concat(G.endless.chunk(1234, cx, cy + 1).edges).some((f) => f.pts.some((q) => Math.abs(q.x - B.x) < 1e-9 && Math.abs(q.y - B.y) < 1e-9));
    assert.ok(hit, 'endless link dangling at chunk ' + cx + ',' + cy);
  }
}
console.log(total + ' mazes, ' + badMazes + ' with gap violations; endless chunks ok');
assert.strictEqual(badMazes, 0);
