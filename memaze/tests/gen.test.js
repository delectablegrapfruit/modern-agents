// Headless checks for the maze generator (determinism, connectivity, corridor gaps, surface types, sane timing) and
// for the level design on top of it (mechanics placed, a route that solves every level, par and time limits).
// Run: node tests/gen.test.js
const assert = require('assert');
const MZ = require('./load.js')(['util.js', 'gen.js', 'world.js', 'levels.js']);
const G = MZ.Gen, LV = MZ.Levels;
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

let total = 0, badMazes = 0, blinks = 0, bridges = 0, boxTotal = 0, flagTotal = 0;
const cases = [];
for (let L = 1; L <= 80; L++) cases.push(['level ' + L, LV.levelParams(L)]);
// Gauntlet mazes from many seeds, every difficulty and style: every layout and shape turns up.
const diffs = Object.keys(LV.GAUNTLET);
for (let i = 0; i < 120; i++) {
  const o = { seed: MZ.hashStr('test' + i), style: i % 2 ? 'random' : 'progressive', diff: diffs[i % diffs.length] };
  cases.push(['gauntlet ' + o.diff + '/' + o.style + ' #' + i, LV.gauntletParams(o, i % 25)]);
}
const lats = new Set(), masks = new Set();
for (const [label, p] of cases) {
  assert.ok(noOldParams(p), label + ': params still carry ice/sticky/boost');
  const m = G.generate(p);
  lats.add(m.lattice); masks.add(m.mask);
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
  assert.ok(m.parTime >= len / 180, label + ': par ' + m.parTime + ' faster than dragging ' + Math.round(len) + ' at 180/s');
  assert.ok(m.parTime <= len / 110 + m.turns * 0.2 + 1.5 + 3 * m.edges.filter((e) => e.type === 'blink').length + 1, label + ': par too slack');
  assert.ok(m.timeLimit % 5 === 0 && m.timeLimit >= (m.parTime - 1) * Math.min(2.3, p.timeFactor) + 15, label + ': time limit ' + m.timeLimit + ' vs par ' + m.parTime);
  // Flags and mystery boxes: deterministic, on solid floor (never a vanishing bridge), clear of the start and the goal.
  const flags = G.checkpoints(m), boxes = G.boxes(m, flags);
  assert.strictEqual(JSON.stringify(boxes), JSON.stringify(G.boxes(m2, G.checkpoints(m2))), label + ': boxes not deterministic');
  assert.ok(boxes.length >= 1, label + ': no mystery boxes');
  const w = MZ.World.fromMaze(m), solid = new MZ.World();
  solid.addPart('solid', { edges: m.edges.filter((e) => e.type !== 'blink') });
  for (const b of boxes) {
    assert.ok(solid.query(b.x, b.y, 0).depth > 0, label + ': box off solid floor');
    assert.ok(Math.hypot(b.x - m.start.x, b.y - m.start.y) > m.start.r && Math.hypot(b.x - m.goal.x, b.y - m.goal.y) > m.goal.r, label + ': box on the start or the goal');
    for (const c of boxes) if (c !== b) assert.ok(Math.hypot(b.x - c.x, b.y - c.y) >= 320, label + ': boxes too close');
  }
  for (const c of flags) assert.ok(w.query(c.x, c.y, 0).depth > 0, label + ': flag off the floor');
  boxTotal += boxes.length; flagTotal += flags.length;
  const g = gapViolations(m);
  total++;
  if (g.bad) { badMazes++; console.log('gap violations', label, g.bad, 'worst slack', g.worst.toFixed(1)); }
}
assert.ok(blinks > 0, 'no vanishing bridges generated at all');
assert.strictEqual(lats.size, Object.keys(G.LATTICES).length, 'not every layout turns up: ' + [...lats]);
assert.ok(masks.size >= 12, 'too few shapes turn up: ' + [...masks]);

// Levels: mechanics placed where they were asked for, a route that solves each level (every corridor it walks is
// there, it picks up each key before its door, presses each switch before its bridge, rides each platform, steps
// through each portal), deterministic, and a time limit with room to spare.
let asked = 0, placed = 0;
const lvCases = [];
for (let L = 1; L <= 80; L++) lvCases.push(['level ' + L, LV.levelParams(L)]);
for (let i = 0; i < 40; i++) lvCases.push(['gauntlet #' + i, LV.gauntletParams({ seed: MZ.hashStr('lv' + i), style: i % 2 ? 'random' : 'progressive', diff: diffs[i % diffs.length] }, i)]);
for (const [label, p] of lvCases) {
  const m = LV.build(p), m2 = LV.build(p);
  const sig = (x) => JSON.stringify([x.route.map((l) => l.type + (l.steps ? l.steps.map((s) => s.e.id + ':' + s.from).join(',') : '')), x.doors, x.keys, x.plates, x.portals, x.gates, x.movers.map((v) => [v.a, v.b, v.period]), x.edges.map((e) => [e.id, e.type, !!e.ice]), x.parTime, x.timeLimit]);
  assert.strictEqual(sig(m), sig(m2), label + ': level not deterministic');
  const ids = new Set(m.edges.map((e) => e.id)), mech = p.mech;
  asked += mech.keys + mech.switches + mech.movers + mech.portals; placed += m.doors.length + m.plates.length + m.movers.length + m.portals.length;
  let at = m.mainPath[0], keys = Object.assign(new Map(), { opened: new Set() }), sw = {};
  const doorOn = new Map(m.doors.map((d) => [d.edge, d])), gateOn = new Map(m.gates.map((g) => [g.edge, g]));
  for (const leg of m.route) {
    if (leg.type === 'walk') {
      for (const st of leg.steps) {
        assert.strictEqual(st.from, at, label + ': the route jumps');
        assert.ok(ids.has(st.e.id), label + ': the route walks a corridor that isn\'t there');
        const d = doorOn.get(st.e.id);
        if (d && !keys.opened.has(st.e.id)) { assert.ok(keys.get(d.color) > 0, label + ': the route walks through a shut door without its key'); keys.set(d.color, keys.get(d.color) - 1); keys.opened.add(st.e.id); }
        assert.ok(!st.e.sw || (sw[st.e.sw.g] | 0) === st.e.sw.on, label + ': the route walks a switch bridge that is away');
        const g = gateOn.get(st.e.id);
        assert.ok(!g || g.from === st.from, label + ': the route goes the wrong way through a gate');
        at = st.e.a === at ? st.e.b : st.e.a;
      }
    } else if (leg.type === 'key') { const k = m.keys.find((x) => x.color === leg.color); assert.strictEqual(k.node, at, label + ': key not where the route is'); keys.set(leg.color, (keys.get(leg.color) || 0) + 1); }
    else if (leg.type === 'press') { const pl = m.plates.find((x) => x.g === leg.g); assert.strictEqual(pl.node, at, label + ': switch not where the route is'); sw[leg.g] = (sw[leg.g] | 0) ^ 1; }
    else if (leg.type === 'ride') { const mv = m.movers[leg.mover]; assert.ok(Math.hypot(mv.from.x - m.nodes[at].x, mv.from.y - m.nodes[at].y) < 1, label + ': platform not where the route is'); at = m.nodes.findIndex((n) => n.x === mv.to.x && n.y === mv.to.y); }
    else if (leg.type === 'warp') { const pt = m.portals[leg.portal]; assert.strictEqual(pt.a.node, at, label + ': portal not where the route is'); at = pt.b.node; }
  }
  assert.strictEqual(at, m.mainPath[m.mainPath.length - 1], label + ': the route doesn\'t reach GOAL');
  assert.ok(m.parTime >= m.routeLen / 190, label + ': par ' + m.parTime + ' faster than dragging the route (' + Math.round(m.routeLen) + ') at 190/s');
  assert.ok(m.timeLimit % 5 === 0 && m.timeLimit >= m.parTime * 1.4, label + ': time limit ' + m.timeLimit + ' vs par ' + m.parTime);
  for (const it of [...m.keys, ...m.plates]) assert.ok(m.edges.some((e) => (e.a === it.node || e.b === it.node) && (e.type === 'normal' || e.type === 'bridge')), label + ': an item on floor that comes and goes');
}
assert.ok(placed >= asked * 0.9, 'mechanics placed ' + placed + ' of ' + asked + ' asked for');
console.log(lvCases.length + ' levels solved by their route; ' + placed + '/' + asked + ' doors, switches, platforms and portals placed');

// Endless chunks: deterministic, only known surfaces, no pads, and seamless links (the link's far end is the neighbour's node).
let chunkBlinks = 0, chunkBoxes = 0;
for (let cx = -12; cx <= 12; cx += (Math.abs(cx) < 3 ? 1 : 3)) for (let cy = -3; cy <= 3; cy++) {
  const c = G.endless.chunk(1234, cx, cy), c2 = G.endless.chunk(1234, cx, cy);
  assert.strictEqual(JSON.stringify(c), JSON.stringify(c2), 'endless chunk not deterministic at ' + cx + ',' + cy);
  assert.ok(c.edges.every((e) => TYPES.has(e.type)), 'endless: unknown surface at ' + cx + ',' + cy);
  assert.ok(noPads(c), 'endless: pads at ' + cx + ',' + cy);
  chunkBlinks += c.edges.filter((e) => e.type === 'blink').length;
  for (const b of c.boxes) assert.ok(c.safeNodes.some((n) => n.x === b.x && n.y === b.y), 'endless: box off a safe junction at ' + cx + ',' + cy);
  chunkBoxes += c.boxes.length;
  const right = G.endless.chunk(1234, cx + 1, cy);
  for (const e of c.edges.filter((e) => e.link)) {
    const B = e.pts[1];
    const hit = right.edges.concat(G.endless.chunk(1234, cx, cy + 1).edges).some((f) => f.pts.some((q) => Math.abs(q.x - B.x) < 1e-9 && Math.abs(q.y - B.y) < 1e-9));
    assert.ok(hit, 'endless link dangling at chunk ' + cx + ',' + cy);
  }
}
assert.ok(chunkBlinks > 0, 'endless: no vanishing bridges far out');
assert.ok(chunkBoxes > 0, 'endless: no mystery boxes');
console.log(total + ' mazes (' + blinks + ' vanishing bridges, ' + bridges + ' island links, ' + flagTotal + ' flags, ' + boxTotal + ' mystery boxes), ' + badMazes + ' with gap violations; endless chunks ok (' + chunkBoxes + ' boxes)');
assert.strictEqual(badMazes, 0);
