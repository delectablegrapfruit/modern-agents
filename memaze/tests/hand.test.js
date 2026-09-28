// Hand-made layouts (chapter 1): each level uses its layout, and the layout keeps the rules the generator keeps and
// the ones a hand-made level can break without anyone noticing (a door the pipeline silently dropped, a corridor
// pruned, a squeeze you can't avoid, a vanishing bridge too short-lived to cross, a box in the wrong place).
//
//   node tests/hand.test.js
const assert = require('assert');
const MZ = require('./load.js')(['util.js', 'gen.js', 'layouts.js', 'world.js', 'levels.js']);
const G = MZ.Gen, LV = MZ.Levels;
const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return l; };

assert.ok(MZ.Layouts && MZ.Layouts.length === 10, 'ten chapter-1 layouts');
const sizes = {};
for (const lay of MZ.Layouts) {
  const L = lay.level, tag = 'L' + L + ' ' + lay.name + ': ';
  const p = LV.levelParams(L);
  assert.strictEqual(p.layout, lay.id, tag + 'the level does not use its layout');
  assert.ok(!LV.levelParams(L, { seed: 7 }).layout, tag + 'a Gauntlet maze (seeded) must stay generated');
  const base = G.generate(p);
  assert.strictEqual(base.fixes, 0, tag + 'enforceGaps had to fix the layout');
  const n = base.nodes.length;
  const pairs = new Set();
  for (const e of base.edges) {
    const k = Math.min(e.a, e.b) + ',' + Math.max(e.a, e.b);
    assert.ok(!pairs.has(k), tag + 'two corridors between the same nodes');
    pairs.add(k);
    const A = base.nodes[e.a], B = base.nodes[e.b], P0 = e.pts[0], P1 = e.pts[e.pts.length - 1];
    assert.ok(Math.hypot(P0.x - A.x, P0.y - A.y) < 0.01 && Math.hypot(P1.x - B.x, P1.y - B.y) < 0.01, tag + 'a corridor that does not end on its nodes');
    assert.ok(e.hw >= G.HW_MIN, tag + 'hw below the minimum');
  }
  const m = LV.build(p), m2 = LV.build(p);
  assert.strictEqual(JSON.stringify([m.route.map((l) => l.type), m.doors, m.keys, m.parTime]), JSON.stringify([m2.route.map((l) => l.type), m2.doors, m2.keys, m2.parTime]), tag + 'not deterministic');
  // Doors: all placed where pinned (build() silently drops a door it can't solve), keys and colours as pinned.
  assert.strictEqual(m.doors.length, (lay.doors || []).length, tag + 'doors placed ' + m.doors.length + ' of ' + (lay.doors || []).length);
  assert.strictEqual(m.edges.length, lay.edges.length, tag + 'corridors were pruned');
  for (const d of lay.doors || []) {
    const color = LV.KEY_COLORS[d.color];
    assert.ok(m.keys.some((k) => k.node === d.key && k.color === color), tag + 'key not on its pinned node, or the wrong colour');
    const idx = base.mainPath.findIndex((v, j) => j + 1 < base.mainPath.length && ((v === d.a && base.mainPath[j + 1] === d.b) || (v === d.b && base.mainPath[j + 1] === d.a)));
    assert.ok(idx > 0 && idx < base.mainPath.length - 2, tag + 'a door off the route, or on its first or last corridor');
  }
  for (const d of m.doors) {
    const e = m.edges.find((x) => x.id === d.edge);
    assert.ok(e.hw >= 46, tag + 'a door in a corridor narrower than hw 46');
    assert.ok(Math.hypot(d.x - m.start.x, d.y - m.start.y) - m.start.r >= LV.DOOR_R + 30, tag + 'a door too close to START');
    assert.ok(Math.hypot(d.x - m.goal.x, d.y - m.goal.y) - m.goal.r * 0.66 >= LV.DOOR_R + 30 + G.BALL_R, tag + 'a door too close to GOAL');
  }
  for (const id of lay.mech.list || []) assert.ok(m.mechs.includes(id), tag + 'mechanic ' + id + ' not listed');
  // No squeeze you can't avoid: the widest way to GOAL and to every key is at least hw 30.
  const adj = Array.from({ length: n }, () => []);
  for (const e of m.edges) { adj[e.a].push(e); adj[e.b].push(e); }
  const widest = (from, to) => {
    let lo = 0, hi = 200;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2, ok = new Uint8Array(n), q = [from];
      ok[from] = 1;
      for (let i = 0; i < q.length; i++) for (const e of adj[q[i]]) { if (e.hw < mid) continue; const w = e.a === q[i] ? e.b : e.a; if (!ok[w]) { ok[w] = 1; q.push(w); } }
      if (ok[to]) lo = mid; else hi = mid;
    }
    return lo;
  };
  const s0 = base.mainPath[0], g0 = base.mainPath[base.mainPath.length - 1];
  for (const to of [g0, ...m.keys.map((k) => k.node)]) assert.ok(widest(s0, to) >= 29.9, tag + 'a compulsory squeeze below hw 30');
  // Vanishing bridges: up long enough to cross, never two on one node, never at START or GOAL.
  const blinkAt = new Map();
  for (const e of m.edges.filter((x) => x.type === 'blink')) {
    const up = e.blink.period * e.blink.on;
    assert.ok(up >= 1.5 + (polyLen(e.pts) + 36) / 100 - 1e-6, tag + 'a vanishing bridge not up long enough to cross');
    for (const v of [e.a, e.b]) { assert.ok(!blinkAt.has(v), tag + 'two vanishing bridges on one node'); blinkAt.set(v, 1); assert.ok(v !== s0 && v !== g0, tag + 'a vanishing bridge at START or GOAL'); }
  }
  // Pinned flags and boxes where they may go; gems on the floor.
  const solid = new MZ.World(); solid.addPart('solid', { edges: m.edges.filter((e) => e.type !== 'blink') });
  const all = new MZ.World(); all.addPart('all', { edges: m.edges.map((e) => Object.assign({}, e, { type: 'normal', blink: undefined })) });
  const flags = G.checkpoints(m), boxes = G.boxes(m, flags);
  assert.strictEqual(boxes.length, (lay.boxes || []).length, tag + 'boxes not as pinned');
  const walked = new Set([s0]);
  { let at = s0; for (const leg of m.route) if (leg.type === 'walk') for (const st of leg.steps) { at = st.e.a === at ? st.e.b : st.e.a; walked.add(at); } }
  for (const f of flags) {
    const v = base.nodes.findIndex((nd) => nd.x === f.x && nd.y === f.y);
    assert.ok(walked.has(v), tag + 'a flag off the route (as walked, key errands included)');
    assert.ok(adj[v].every((e) => e.type === 'normal'), tag + 'a flag by a bridge');
  }
  for (const b of boxes) {
    assert.ok(solid.query(b.x, b.y, 0).depth > 0, tag + 'a box off solid floor');
    assert.ok(Math.hypot(b.x - m.start.x, b.y - m.start.y) > m.start.r + 70 && Math.hypot(b.x - m.goal.x, b.y - m.goal.y) > m.goal.r + 90, tag + 'a box too near START or GOAL');
    for (const c of boxes) if (c !== b) assert.ok(Math.hypot(b.x - c.x, b.y - c.y) >= 320, tag + 'boxes closer than 320');
    for (const o of m.gems.concat(m.keys)) assert.ok(Math.hypot(b.x - o.x, b.y - o.y) >= 60, tag + 'a box on top of a gem or a key');
  }
  for (const gm of m.gems) assert.ok(all.query(gm.x, gm.y, 0).depth > 0, tag + 'a gem off the floor');
  assert.ok(m.timeLimit % 5 === 0 && m.timeLimit >= m.parTime * 1.4, tag + 'time limit');
  sizes[L] = { nodes: n, par: m.parTime, limit: m.timeLimit };
}
assert.ok(sizes[6].limit >= 110, 'L6 (a search for the key) has room: limit ' + sizes[6].limit);
assert.ok(sizes[10].nodes > sizes[9].nodes * 1.2, 'the boss is bigger than the level before it');
console.log('10 hand-made layouts: ' + Object.entries(sizes).map(([L, s]) => 'L' + L + ' ' + s.par + '/' + s.limit + 's').join(', '));
