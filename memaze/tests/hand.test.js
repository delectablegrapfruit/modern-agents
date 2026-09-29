// Hand-made layouts (chapters 1 and 2): each level uses its layout, and the layout keeps the rules the generator keeps
// and the ones a hand-made level can break without anyone noticing (a door the pipeline silently dropped, a corridor
// pruned, a squeeze you can't avoid, a vanishing bridge too short-lived to cross, a box in the wrong place, a gate or a
// switch or an item puzzle not where it was pinned, a gap too long to cross, a Shrink box too far from its gate, and
// a way to get stuck: every state the level can be put in must still reach GOAL).
//
//   node tests/hand.test.js
const assert = require('assert');
const MZ = require('./load.js')(['util.js', 'gen.js', 'layouts.js', 'world.js', 'levels.js']);
const G = MZ.Gen, LV = MZ.Levels;
const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return l; };
const GAP_MIN = 180; // a gap is a real crossing, broken edge to broken edge (and no wider than its item can do: LV.GAP_VOID)
const ITEMS = ['carpet', 'launch', 'shrink'];

assert.ok(MZ.Layouts && MZ.Layouts.length === 20, 'twenty hand-made layouts (chapters 1 and 2)');
assert.strictEqual(MZ.Layouts.map((l) => l.level).join(), Array.from({ length: 20 }, (_, i) => i + 1).join(), 'one layout per level, 1-20 in order');
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
  { // room to spare between corridors that don't meet: 27 u of void at least (enforceGaps acts under 22.5)
    const segs = [];
    base.edges.forEach((e, ei) => { for (let i = 1; i < e.pts.length; i++) segs.push([ei, e.pts[i - 1], e.pts[i]]); });
    let worst = Infinity;
    for (let x = 0; x < segs.length; x++) for (let y = x + 1; y < segs.length; y++) {
      const s = segs[x], t = segs[y], E = base.edges[s[0]], F = base.edges[t[0]];
      if (s[0] === t[0] || E.a === F.a || E.a === F.b || E.b === F.a || E.b === F.b) continue;
      worst = Math.min(worst, Math.sqrt(MZ.segSegDist2(s[1].x, s[1].y, s[2].x, s[2].y, t[1].x, t[1].y, t[2].x, t[2].y)) - E.hw - F.hw);
    }
    assert.ok(worst >= 26.9, tag + 'corridors only ' + worst.toFixed(1) + ' u apart');
  }
  const m = LV.build(p), m2 = LV.build(p);
  const sig = (x) => JSON.stringify([x.route.map((l) => l.type), x.doors, x.keys, x.gates, x.plates, x.gaps.map((q) => [q.item, q.from, q.to]), x.squeezes, x.gboxes, x.edges.map((e) => [e.id, e.type, e.sw]), x.parTime]);
  assert.strictEqual(sig(m), sig(m2), tag + 'not deterministic');
  const eid = (d) => base.edges.findIndex((e) => (e.a === d.a && e.b === d.b) || (e.a === d.b && e.b === d.a));
  const onPath = (d) => base.mainPath.findIndex((v, j) => j + 1 < base.mainPath.length && ((v === d.a && base.mainPath[j + 1] === d.b) || (v === d.b && base.mainPath[j + 1] === d.a)));
  // Everything placed where pinned (build() silently drops a barrier it can't solve), nothing pruned.
  assert.strictEqual(m.doors.length, (lay.doors || []).length, tag + 'doors placed ' + m.doors.length + ' of ' + (lay.doors || []).length);
  assert.strictEqual(m.edges.length, lay.edges.length - (lay.gaps || []).length, tag + 'corridors were pruned (or a gap is still there)');
  for (const d of lay.doors || []) {
    const color = LV.KEY_COLORS[d.color];
    assert.ok(m.keys.some((k) => k.node === d.key && k.color === color), tag + 'key not on its pinned node, or the wrong colour');
    const idx = onPath(d);
    assert.ok(idx > 0 && idx < base.mainPath.length - 2, tag + 'a door off the route, or on its first or last corridor');
  }
  for (const d of m.doors) {
    const e = m.edges.find((x) => x.id === d.edge);
    assert.ok(e.hw >= 46, tag + 'a door in a corridor narrower than hw 46');
    assert.ok(Math.hypot(d.x - m.start.x, d.y - m.start.y) - m.start.r >= LV.DOOR_R + 30, tag + 'a door too close to START');
    assert.ok(Math.hypot(d.x - m.goal.x, d.y - m.goal.y) - m.goal.r * 0.66 >= LV.DOOR_R + 30 + G.BALL_R, tag + 'a door too close to GOAL');
  }
  // One-way gates: exactly the pinned ones, each pointing the pinned way; on the route, the way the route goes.
  assert.strictEqual(m.gates.length, (lay.gates || []).length, tag + 'gates placed ' + m.gates.length + ' of ' + (lay.gates || []).length);
  for (const g of lay.gates || []) {
    assert.ok(m.gates.some((x) => x.edge === eid(g) && x.from === g.from), tag + 'a gate not where it was pinned, or pointing the wrong way');
    const i = onPath(g);
    if (i >= 0) assert.strictEqual(base.mainPath[i], g.from, tag + 'a gate on the route pointing against it');
  }
  // Switches: route bridges pinned (colour, state), their switches on dead ends, the level's other switch bridges as drawn.
  const deg = new Int32Array(n);
  for (const e of base.edges) { deg[e.a]++; deg[e.b]++; }
  for (const s of lay.switches || []) {
    const e = m.edges.find((x) => x.id === eid(s));
    assert.ok(e && e.type === 'switch' && e.sw.g === s.g && e.sw.on === (s.on == null ? 1 : s.on), tag + 'a switch bridge not as pinned');
    assert.ok(onPath(s) >= 0, tag + 'a pinned switch bridge off the route');
    assert.ok(m.plates.some((pl) => pl.node === s.plate && pl.g === s.g), tag + 'a switch not on its pinned node, or the wrong colour');
  }
  for (const x of lay.plates || []) assert.ok(m.plates.some((pl) => pl.node === x.node && pl.g === x.g), tag + 'an extra switch not placed');
  assert.strictEqual(m.plates.length, new Set((lay.switches || []).map((s) => s.plate).concat((lay.plates || []).map((x) => x.node))).size, tag + 'switches placed');
  for (const pl of m.plates) assert.ok(deg[pl.node] === 1 && pl.node !== base.mainPath[0], tag + 'a switch that is not at a dead end (you would step on it by accident)');
  lay.edges.forEach((E, i) => { if (E.sw) { const e = m.edges.find((x) => x.id === i); assert.ok(e && e.type === 'switch' && e.sw.g === E.sw.g && e.sw.on === E.sw.on, tag + 'a switch bridge off the route not as drawn'); } });
  assert.ok(m.edges.filter((e) => e.type === 'switch').length === (lay.switches || []).length + lay.edges.filter((E) => E.sw).length, tag + 'switch bridges that were not drawn');
  // Item puzzles: gaps (short enough to cross) and shrink gates where pinned, each with its item box.
  assert.strictEqual(m.gaps.length, (lay.gaps || []).length, tag + 'gaps placed ' + m.gaps.length + ' of ' + (lay.gaps || []).length);
  for (const q of lay.gaps || []) {
    const g = m.gaps.find((x) => (x.from === q.a && x.to === q.b) || (x.from === q.b && x.to === q.a));
    assert.ok(g && g.item === q.item, tag + 'a gap not where it was pinned, or needing the wrong item');
    const cap = (u) => Math.max(0, ...m.edges.filter((e) => e.a === u || e.b === u).map((e) => e.hw)), wide = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y) - cap(g.from) - cap(g.to);
    assert.ok(wide <= LV.GAP_VOID[q.item][1] + 1, tag + 'a gap too wide for its item (' + Math.round(wide) + ', broken edge to broken edge)');
    assert.ok(wide >= GAP_MIN, tag + 'a gap too narrow to be a real crossing (' + Math.round(wide) + ')');
    assert.ok(m.gboxes.some((gb) => gb.node === q.box && gb.item === q.item), tag + 'a gap without its item box on the pinned node');
  }
  assert.strictEqual(m.crawls.length, (lay.squeezes || []).length, tag + 'Shrink ways placed ' + m.crawls.length + ' of ' + (lay.squeezes || []).length);
  for (const q of lay.squeezes || []) {
    assert.ok(m.squeezes.some((x) => x.edge === eid(q)), tag + 'a shrink gate not where it was pinned');
    assert.ok(m.gboxes.some((gb) => gb.node === q.box && gb.item === 'shrink'), tag + 'a shrink gate without its Shrink box on the pinned node');
  }
  for (const x of lay.itemBoxes || []) assert.ok(m.gboxes.some((gb) => gb.node === x.node && gb.item === x.item), tag + 'an extra item box not placed');
  for (const id of lay.mech.list || []) assert.ok(m.mechs.includes(id), tag + 'mechanic ' + id + ' not listed');
  { // GOAL ends the maze, so nothing may lie only beyond it: a GOAL on a junction is fine only where each other corridor
    // there is just another way round to it.
    const g = base.mainPath[base.mainPath.length - 1], links = m.nodes.map(() => []);
    for (const e of m.edges) { links[e.a].push(e.b); links[e.b].push(e.a); }
    for (const q of m.gaps) { links[q.from].push(q.to); links[q.to].push(q.from); }
    for (const pt of m.portals) { links[pt.a.node].push(pt.b.node); links[pt.b.node].push(pt.a.node); }
    for (const mv of m.movers) { const a = m.nodes.findIndex((v) => v.x === mv.from.x && v.y === mv.from.y), b = m.nodes.findIndex((v) => v.x === mv.to.x && v.y === mv.to.y); if (a >= 0 && b >= 0) { links[a].push(b); links[b].push(a); } }
    const seen = new Set([g, base.mainPath[0]]), q = [base.mainPath[0]];
    for (let i = 0; i < q.length; i++) for (const o of links[q[i]]) if (!seen.has(o)) { seen.add(o); q.push(o); }
    const beyond = m.nodes.filter((v, i) => !seen.has(i) && links[i].length);
    assert.ok(!beyond.length, tag + beyond.length + ' places only reachable through GOAL');
  }
  // No squeeze you can't avoid: the widest way to GOAL and to every key, switch and item box is at least hw 30 (gaps
  // and Shrink ways count as crossed, since their item is there).
  const adj = Array.from({ length: n }, () => []);
  for (const e of m.edges) { const x = e.crawl ? Object.assign({}, e, { hw: 999 }) : e; adj[e.a].push(x); adj[e.b].push(x); }
  for (const q of m.gaps) { const e = { a: q.from, b: q.to, hw: 999, gap: q }; adj[q.from].push(e); adj[q.to].push(e); }
  const widest = (from, to) => {
    let lo = 0, hi = 1000;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2, ok = new Uint8Array(n), q = [from];
      ok[from] = 1;
      for (let i = 0; i < q.length; i++) for (const e of adj[q[i]]) { if (e.hw < mid) continue; const w = e.a === q[i] ? e.b : e.a; if (!ok[w]) { ok[w] = 1; q.push(w); } }
      if (ok[to]) lo = mid; else hi = mid;
    }
    return lo;
  };
  const s0 = base.mainPath[0], g0 = base.mainPath[base.mainPath.length - 1];
  for (const to of [g0, ...m.keys.map((k) => k.node), ...m.plates.map((pl) => pl.node), ...m.gboxes.map((gb) => gb.node)]) assert.ok(widest(s0, to) >= 29.9, tag + 'a compulsory squeeze below hw 30');
  // Vanishing bridges: up long enough to cross, never two on one node, never at START or GOAL; gone at most 1.8 s at a
  // time unless a twin (another bridge between the same two places) is up meanwhile.
  const blinkAt = new Map();
  const blinks = m.edges.filter((x) => x.type === 'blink');
  for (const e of blinks) {
    const up = e.blink.period * e.blink.on, off = e.blink.period - up;
    assert.ok(up >= 1.5 + (polyLen(e.pts) + 36) / 100 - 1e-6, tag + 'a vanishing bridge not up long enough to cross');
    assert.ok((polyLen(e.pts) + 24) / (up - 0.3) <= 75, tag + 'a vanishing bridge only a fast drag gets across');
    for (const v of [e.a, e.b]) { assert.ok(!blinkAt.has(v), tag + 'two vanishing bridges on one node'); blinkAt.set(v, 1); assert.ok(v !== s0 && v !== g0, tag + 'a vanishing bridge at START or GOAL'); }
    if (off > 1.8 + 1e-6) { // a twin: some other bridge always up while this one is gone
      const twin = blinks.some((f) => f !== e && f.blink.period === e.blink.period && Array.from({ length: 200 }, (_, k) => (k / 200) * e.blink.period).every((t) => MZ.blinkOn(e.blink, t) || MZ.blinkOn(f.blink, t)));
      assert.ok(twin, tag + 'a vanishing bridge gone ' + off.toFixed(1) + ' s with no twin up meanwhile');
    }
  }
  // Pinned flags and boxes where they may go; gems on the floor; item boxes, switches clear of them.
  const solid = new MZ.World(); solid.addPart('solid', { edges: m.edges.filter((e) => e.type === 'normal' || e.type === 'bridge') });
  const all = new MZ.World(); all.addPart('all', { edges: m.edges.map((e) => Object.assign({}, e, { type: 'normal', blink: undefined, sw: undefined })) });
  const flags = G.checkpoints(m), boxes = G.boxes(m, flags);
  assert.strictEqual(boxes.length, (lay.boxes || []).length, tag + 'boxes not as pinned');
  assert.ok(boxes.length >= 1, tag + 'no mystery boxes');
  const walked = new Set([s0]);
  { let at = s0; for (const leg of m.route) { if (leg.type === 'walk') for (const st of leg.steps) { at = st.e.a === at ? st.e.b : st.e.a; walked.add(at); } if (leg.type === 'cross') { at = m.gaps[leg.gap].to; walked.add(at); } } }
  for (const f of flags) {
    const v = base.nodes.findIndex((nd) => nd.x === f.x && nd.y === f.y);
    assert.ok(walked.has(v), tag + 'a flag off the route (as walked, errands included)');
    assert.ok(adj[v].every((e) => e.type === 'normal'), tag + 'a flag by a bridge or a gap');
    for (const d of m.doors.concat(m.gates, m.squeezes)) assert.ok(Math.sqrt(MZ.segDist2(f.x, f.y, d.ax, d.ay, d.bx, d.by)) >= f.r + 16, tag + 'a flag platform over a door, gate or shrink gate');
    for (const e of m.edges) if (e.a !== v && e.b !== v) for (let i = 1; i < e.pts.length; i++) assert.ok(Math.sqrt(MZ.segDist2(f.x, f.y, e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y)) - e.hw >= f.r + 16, tag + 'a flag platform crowding a corridor it does not join');
  }
  const things = m.gems.concat(m.keys, m.plates, m.gboxes);
  for (const b of boxes) {
    assert.ok(solid.query(b.x, b.y, 0).depth > 0, tag + 'a box off solid floor');
    assert.ok(Math.hypot(b.x - m.start.x, b.y - m.start.y) > m.start.r + 70 && Math.hypot(b.x - m.goal.x, b.y - m.goal.y) > m.goal.r + 90, tag + 'a box too near START or GOAL');
    for (const c of boxes) if (c !== b) assert.ok(Math.hypot(b.x - c.x, b.y - c.y) >= 320, tag + 'boxes closer than 320');
    for (const o of things) assert.ok(Math.hypot(b.x - o.x, b.y - o.y) >= 60, tag + 'a box on top of a gem, key, switch or item box');
  }
  for (const gb of m.gboxes) {
    assert.ok(solid.query(gb.x, gb.y, 0).depth > 0, tag + 'an item box off solid floor');
    for (const o of m.gems.concat(m.keys, m.plates)) assert.ok(Math.hypot(gb.x - o.x, gb.y - o.y) >= 60, tag + 'an item box on top of a gem, key or switch');
  }
  for (const pl of m.plates) for (const o of m.gems.concat(m.keys)) assert.ok(Math.hypot(pl.x - o.x, pl.y - o.y) >= 60, tag + 'a switch on top of a gem or key');
  for (const gm of m.gems) assert.ok(all.query(gm.x, gm.y, 0).depth > 0, tag + 'a gem off the floor');
  assert.strictEqual(JSON.stringify(m.gems), JSON.stringify(lay.gems.map(([x, y]) => ({ x, y }))), tag + 'gems moved (one sits where an item went)');
  // Bars (doors, gates) across straight floor: 45 u of it either side, along the way through. (A Shrink way's stops are
  // inside its narrow corridor, and never seen.)
  for (const d of m.doors.concat(m.gates)) for (const s of [-45, 45]) assert.ok(all.query(d.x + d.nx * s, d.y + d.ny * s, 0).depth > 18, tag + 'a door or gate without straight floor either side');
  // Gaps are real: the middle of the missing corridor is void, and the far end has floor straight on.
  for (const q of m.gaps) {
    assert.ok(all.query((q.a.x + q.b.x) / 2, (q.a.y + q.b.y) / 2, 0).depth < -20, tag + 'a gap with floor in its middle (walk across it)');
  }
  // A Shrink box near enough its gate (shrink lasts 10 s): at most 700 u of corridor away.
  for (const q of m.squeezes) {
    const box = m.gboxes.filter((gb) => gb.item === 'shrink'), dist = new Float64Array(n).fill(Infinity), qq = [];
    for (const gb of box) { dist[gb.node] = 0; qq.push(gb.node); }
    for (let i = 0; i < qq.length; i++) for (const e of adj[qq[i]]) { if (e.gap) continue; const w = e.a === qq[i] ? e.b : e.a, d = dist[qq[i]] + polyLen(e.pts); if (d < dist[w]) { dist[w] = d; qq.push(w); } }
    const e = m.edges.find((x) => x.id === q.edge);
    assert.ok(Math.min(dist[e.a], dist[e.b]) + polyLen(e.pts) / 2 <= 700, tag + 'a Shrink box too far from its gate');
  }
  // Something to touch on the first screen (desktop 480x300 or phone 300x649 around START).
  const S = m.start, onScreen = (o) => (Math.abs(o.x - S.x) <= 240 && Math.abs(o.y - S.y) <= 150) || (Math.abs(o.x - S.x) <= 150 && Math.abs(o.y - S.y) <= 324);
  const dynPts = m.edges.filter((e) => e.type === 'blink' || e.type === 'switch').flatMap((e) => e.pts).concat(m.gaps.flatMap((q) => q.pts));
  assert.ok(m.gems.concat(boxes, m.keys, m.doors, m.gates, m.plates, m.gboxes, m.squeezes, dynPts, [m.goal]).some(onScreen), tag + 'nothing to touch on the first screen');
  // No way to get stuck: every state you can reach (where you stand, switch colours, the item you hold, keys and open
  // doors) can still reach GOAL; and every gem can be reached. Items: from item boxes only (a mystery box is luck).
  {
    const gateOf = new Map(m.gates.map((g) => [g.edge, g.from])), doorOf = new Map(m.doors.map((d, i) => [d.edge, i])), sqOf = new Set(m.squeezes.map((q) => q.edge));
    const keyAt = new Map(m.keys.map((k, i) => [k.node, i])), plateAt = new Map(), boxAt = new Map();
    for (const pl of m.plates) { if (!plateAt.has(pl.node)) plateAt.set(pl.node, []); plateAt.get(pl.node).push(pl.g); }
    for (const gb of m.gboxes) { if (!boxAt.has(gb.node)) boxAt.set(gb.node, []); boxAt.get(gb.node).push(ITEMS.indexOf(gb.item) + 1); }
    const colors = LV.KEY_COLORS;
    // state: v, sw (2 bits), held (0 none, 1 carpet, 2 launch, 3 shrink), keys taken (bits), doors open (bits)
    const K = (s) => s.v + ',' + s.sw + ',' + s.held + ',' + s.kt + ',' + s.dopen;
    const held = (s, c) => { let h = 0; m.keys.forEach((k, i) => { if (s.kt >> i & 1 && k.color === c) h++; }); m.doors.forEach((d, i) => { if (s.dopen >> i & 1 && d.color === c) h--; }); return h; };
    const arrive = (s) => { const i = keyAt.get(s.v); return i != null && !(s.kt >> i & 1) ? Object.assign({}, s, { kt: s.kt | (1 << i) }) : s; };
    const next = (s) => {
      const out = [];
      for (const e of adj[s.v]) {
        const w = e.a === s.v ? e.b : e.a;
        if (e.gap) { if (s.held === 1 || s.held === 2) out.push(arrive(Object.assign({}, s, { v: w, held: 0 }))); continue; }
        if (e.type === 'switch' && ((s.sw >> e.sw.g) & 1) !== e.sw.on) continue;
        if (gateOf.has(e.id) && gateOf.get(e.id) !== s.v) continue;
        let t = Object.assign({}, s, { v: w });
        if (sqOf.has(e.id)) { if (s.held !== 3) continue; t.held = 0; }
        if (doorOf.has(e.id)) { const i = doorOf.get(e.id); if (!(s.dopen >> i & 1)) { if (held(s, m.doors[i].color) <= 0) continue; t.dopen = s.dopen | (1 << i); } }
        out.push(arrive(t));
      }
      for (const g of plateAt.get(s.v) || []) out.push(Object.assign({}, s, { sw: s.sw ^ (1 << g) }));
      for (const h of boxAt.get(s.v) || []) out.push(Object.assign({}, s, { held: h }));
      for (const f of flagNodes) out.push(Object.assign({}, s, { v: f, held: 0 })); // a loss: back to a flag (switches, keys, doors as they were; the item's gone)
      return out;
    };
    const flagNodes = flags.map((f) => base.nodes.findIndex((nd) => nd.x === f.x && nd.y === f.y));
    const seen = new Map(), list = [], edgesOut = [];
    const s00 = arrive({ v: s0, sw: 0, held: 0, kt: 0, dopen: 0 });
    seen.set(K(s00), 0); list.push(s00);
    for (let i = 0; i < list.length; i++) {
      edgesOut.push([]);
      for (const t of next(list[i])) { const k = K(t); if (!seen.has(k)) { seen.set(k, list.length); list.push(t); } edgesOut[i].push(seen.get(k)); }
      assert.ok(list.length < 400000, tag + 'state space too big to check');
    }
    const into = list.map(() => []);
    edgesOut.forEach((o, i) => o.forEach((j) => into[j].push(i)));
    const good = new Uint8Array(list.length), q = [];
    list.forEach((s, i) => { if (s.v === g0) { good[i] = 1; q.push(i); } });
    for (let i = 0; i < q.length; i++) for (const j of into[q[i]]) if (!good[j]) { good[j] = 1; q.push(j); }
    const stuck = list.findIndex((s, i) => !good[i]);
    assert.ok(stuck < 0, tag + 'a way to get stuck: at node ' + (stuck >= 0 && list[stuck].v) + ' ' + JSON.stringify(list[stuck]));
    const reachedV = new Set(list.map((s) => s.v)); // (a gem lies on a corridor one of whose ends you can reach)
    for (const gm of m.gems) assert.ok(m.edges.some((e) => (reachedV.has(e.a) || reachedV.has(e.b)) && e.pts.some((pt, k) => k && Math.sqrt(MZ.segDist2(gm.x, gm.y, e.pts[k - 1].x, e.pts[k - 1].y, pt.x, pt.y)) < e.hw)), tag + 'a gem that can never be reached');
  }
  assert.ok(m.timeLimit % 5 === 0 && m.timeLimit >= m.parTime * 1.4, tag + 'time limit');
  sizes[L] = { nodes: n, par: m.parTime, limit: m.timeLimit };
}
assert.ok(sizes[6].limit >= 110, 'L6 (a search for the key) has room: limit ' + sizes[6].limit);
for (const B of [10, 20]) assert.ok(sizes[B].nodes > sizes[B - 1].nodes * 1.2, 'the boss (L' + B + ') is bigger than the level before it');
console.log('20 hand-made layouts: ' + Object.entries(sizes).map(([L, s]) => 'L' + L + ' ' + s.par + '/' + s.limit + 's').join(', '));
