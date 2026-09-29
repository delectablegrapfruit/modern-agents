// tests/node/invariants.test.cjs — owner: W1-W. The city invariants of ARCHITECTURE §8.1 on the
// real worldmap (GDD §3), checked geometrically in Node: the §8.1 format; the original's doors and
// faces through the fixed transform (the recreation's map is read, never modified); door triggers
// on reachable ground; no mass overlapping another mass, a street or a path; the visibility rule
// (porch strips ≥ 96 × 24 and signatures clear of other buildings' projected rects); the door-face
// rule with its two exceptions; newLand; the lane graph; props on the island, off asphalt and 24 u
// clear of porches; railings on the outline; reachability (32 u of a connected nav cell) of every
// scrap, interactable, spawn point and trigger; scraps ≥ 64 u from unrailed edges; 200 points just
// outside unrailed edges are off the sheet and none across railings can be reached; plus the
// sidewalk graph, kerbs, home doors and the seeded props.
//   node tests/node/invariants.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('./load.cjs');

const T = L.suite('world invariants (W1-W)');
const WORLD = ['js/world/geometry.js', 'js/world/collision.js', 'js/world/nav.js', 'js/world/camera.js',
  'js/world/player.js', 'js/world/doors.js', 'js/world/fall.js', 'js/world/world.js'];

const res = L.load({ mode: 'all', extra: WORLD });
const SR = res.SR;
const G = SR.world.geometry;
const N = SR.world.nav;
const map = SR.reg.worldmap.main;
const U = G.util;

// ------------------------------------------------------------------------------------------------
T.section('format and loading');
{
  T.eq(res.errors.map((e) => e.file), [], 'mode all plus js/world/* loads and boots headless');
  const keys = ['size', 'transform', 'outline', 'newLand', 'holes', 'railings', 'walls', 'streets', 'junctions', 'zebras', 'portals',
    'buildings', 'props', 'people', 'interactables', 'homeLots', 'skyIslands', 'scraps', 'spawn'];
  T.eq(keys.filter((k) => !(k in map)), [], 'the worldmap has every ARCHITECTURE §8.1 field');
  T.eq(map.size, { w: 5120, h: 4608 }, 'world box 5120 × 4608 (GDD §3.2)');
  T.eq(map.transform, { sx: 2, sy: 2, ox: 2560, oy: 2304 }, 'transform X = 2x + 2560, Y = 2y + 2304');
  T.ok(SR.world.ready && G.built && N.built, 'the world builds at boot (prio 30, headless)');
  T.eq(SR.registry.hooks().filter((h) => h.file === 'js/world/world.js').map((h) => [h.prio, h.headless]), [[30, true]], 'one boot hook: prio 30, headless');
  T.eq(SR.world.cfg.missing, [], 'every world number is read from SR.tuning.world (B-15)');
  const again = L.load({ mode: 'rules', extra: WORLD }).SR.reg.worldmap.main;
  T.eq(again.props, map.props, 'the seeded props are identical on every load (no Math.random: load.cjs poisons it)');
  for (const seed of [11, 12]) {
    const sh = L.load({ mode: 'all', extra: WORLD, shuffle: seed, keepGoing: true });
    T.ok(!sh.errors.length && sh.SR.world.ready, 'shuffled load ' + seed + ' with js/world/* boots and builds the world');
  }
  const b = G.bounds;
  T.eq(b, [480, 200, 4396, 4440], 'island bounds X 480-4396, Y 200-4440 (GDD §3.3)');
  const bite = map.outline.filter((p) => Math.hypot(p[0] - 1060, p[1] - 4100) < 221 && p[1] <= 4100);
  T.eq(bite.length, 12, 'the Bite is an 11-segment arc (12 points on the r 220 circle)');
  T.ok(bite.every((p) => Math.abs(Math.hypot(p[0] - 1060, p[1] - 4100) - 220) < 0.2), 'every Bite point lies on the circle');
  T.ok(Math.abs(Math.min.apply(null, bite.map((p) => p[1])) - 3882.2) < 1, 'the arc reaches 2.2 u of (1060, 3880)');
}

// ------------------------------------------------------------------------------------------------
T.section('the original map through the transform (door positions and faces)');
{
  let orig = null;
  const file = path.resolve(L.ROOT, '..', 'stick-rpg', 'js', 'world', 'map.js');
  try {
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
    vm.runInContext('globalThis.window = globalThis; window.SRPG = {};', ctx);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
    orig = JSON.parse(JSON.stringify(ctx.SRPG.MAP.buildings));
  } catch (e) {
    orig = null;
  }
  // The faces of the original (stick-rpg/js/world/map.js), kept here too for a missing recreation.
  const FACES = { apartment: 'south', castle: 'east', mansion: 'east', bank: 'west', nli: 'west', uofs: 'south', furniture: 'north',
    mcsticks: 'east', bar: 'east', casino: 'east', store: 'west', pawn: 'west', bus: 'north' };
  T.ok(!!orig, 'the recreation\'s map is readable (reference only)');
  const tf = (x, y) => [2 * x + 2560, 2 * y + 2304];
  const F = { south: 'S', north: 'N', east: 'E', west: 'W' };
  for (const b of map.buildings) {
    if (!b.door) continue;
    if (b.id === 'home_castle' || b.id === 'home_pent') {
      T.ok(b.id === 'home_pent' ? b.orig === null : b.orig === 'castle', b.id + ': listed as (changed) / (new), exempt from the face rule');
      continue;
    }
    if (!b.orig) continue;                       // City Hall is new: no original face to keep
    const o = orig ? orig[b.orig] : null;
    const face = o ? o.face : FACES[b.orig];
    T.eq(b.door.face, F[face], b.id + ': door face ' + b.door.face + ' equals the original\'s (' + face + ')');
    if (o && o.door) {
      const a = tf(o.door.x, o.door.y), z = tf(o.door.x + o.door.w, o.door.y + o.door.h);
      const r = [Math.min(a[0], z[0]) - 24, Math.min(a[1], z[1]) - 24, Math.max(a[0], z[0]) + 24, Math.max(a[1], z[1]) + 24];
      T.ok(U.inRect(b.door.x, b.door.y, r), b.id + ': door (' + b.door.x + ', ' + b.door.y + ') on the original\'s door (×2 + offset, ±24 u)');
    }
  }
  const castle = map.buildings.find((b) => b.id === 'home_castle');
  const apt = G.buildings.home_apt.projected[0];
  T.eq(apt[1] - castle.masses[0].rect[3], 144, 'the castle stands 144 u north of the apartment\'s projected roof (GDD §3.4)');
}

// ------------------------------------------------------------------------------------------------
T.section('masses, streets and paths');
{
  const masses = [];
  map.buildings.forEach((b) => b.masses.forEach((m) => masses.push({ id: b.id, rect: m.rect })));
  const bad = [];
  for (let i = 0; i < masses.length; i++) {
    for (let j = i + 1; j < masses.length; j++) {
      if (masses[i].id !== masses[j].id && U.rectsOverlap(masses[i].rect, masses[j].rect)) bad.push(masses[i].id + '/' + masses[j].id);
    }
  }
  T.eq(bad, [], 'no mass overlaps another building\'s mass');
  const ways = map.streets.map((s) => ({ id: s.id, rect: s.rect })).concat(map.junctions.map((j) => ({ id: j.id, rect: j.rect })), map.zebras.map((z) => ({ id: 'zebra ' + z.id, rect: z.rect })));
  const hits = [];
  masses.forEach((m) => ways.forEach((w) => { if (U.rectsOverlap(m.rect, w.rect)) hits.push(m.id + '×' + w.id); }));
  T.eq(hits, [], 'no mass overlaps a street, sidewalk, path, plaza, junction or zebra');
  const jog = [];
  masses.forEach((m) => {
    for (let x = m.rect[0] + 1; x < m.rect[2]; x += 16) for (let y = m.rect[1] + 1; y < m.rect[3]; y += 16) if (G.surfaceAt(x, y) === 'path' && !ways.some((w) => U.inRect(x, y, w.rect))) jog.push(m.id);
  });
  T.eq([...new Set(jog)], [], 'no mass overlaps the jog loop');
  T.ok(masses.every((m) => G.onGround((m.rect[0] + m.rect[2]) / 2, (m.rect[1] + m.rect[3]) / 2)), 'every mass stands on the sheet');
  T.eq(map.junctions.filter((j) => !(j.rect[2] > j.rect[0] && j.rect[3] > j.rect[1])).map((j) => j.id), [], 'every junction has a box');
}

// ------------------------------------------------------------------------------------------------
T.section('visibility: porches, awnings and signatures (GDD §3.6)');
{
  const proj = G.projectedRects();
  for (const d of G.doors) {
    const v = d.visible;
    const dims = v ? [v[2] - v[0], v[3] - v[1]].sort((a, b) => a - b) : [0, 0];
    T.ok(v && dims[1] >= 96 && dims[0] >= 24, d.id + ': visible strip ' + JSON.stringify(v) + ' is at least 96 × 24');
    const cover = proj.filter((p) => p.id !== d.building && v && U.rectsOverlap(p.rect, v)).map((p) => p.id);
    T.eq(cover, [], d.id + ': no other building\'s projected rect covers the visible strip');
    if (d.face === 'N') T.eq(v[3] - v[1], 32, d.id + ': a north porch keeps its outer 32 u uncovered');
  }
  const exteriors = SR.reg.exterior || {};
  for (const id of Object.keys(G.buildings)) {
    const sig = G.buildings[id].signature.concat(((exteriors[id] && exteriors[id].signature) || []));
    for (const r of sig) {
      const cover = proj.filter((p) => p.id !== id && U.rectsOverlap(p.rect, r)).map((p) => p.id);
      T.eq(cover, [], id + ': signature ' + JSON.stringify(r) + ' clear of other buildings\' projected rects');
    }
  }
  const want = { home_castle: 1, bank: 1, nli: 1, uofs: 1, cityhall: 2, mcsticks: 1, casino: 1, home_pent: 1 };
  T.eq(Object.keys(want).filter((id) => G.buildings[id].signature.length < want[id]), [], 'every GDD §3.4 signature has rects (castle, bank, NLI, U of S, City Hall ×2, McSticks, casino, Edgeview)');
  const nli = G.buildings.nli;
  T.eq(nli.masses[1].rect[1] - nli.masses[0].rect[1], 240, 'the NLI tower is set back 240 u from the podium\'s north face');
  const bus = G.buildings.bus.projected[0], pent = G.projected('home_pent');
  T.ok(pent.every((r) => !U.rectsOverlap(r, [bus[0], bus[3] - 90, bus[2], bus[3]])), 'Edgeview Tower keeps the bus depot\'s south face visible');
}

// ------------------------------------------------------------------------------------------------
T.section('land outside the original (GDD §2.5)');
{
  const o = [[-1040, -760], [-574, -760], [-574, -824], [437, -824], [437, -331], [918, -331], [918, 410], [442, 410], [442, 898], [-457, 898], [-457, -21], [-1040, -21]]
    .map((p) => [2 * p[0] + 2560, 2 * p[1] + 2304]);
  const allowed = [];
  map.pockets.forEach((p) => p.rects.forEach((r) => allowed.push(r)));
  map.newLand.forEach((n) => allowed.push(n.rect));
  const flap = map.features.dogEar.flap;
  let outside = 0, bad = 0;
  for (let x = 488; x < 4400; x += 16) {
    for (let y = 204; y < 4440; y += 16) {
      if (!G.onGround(x, y) || U.inPoly(x, y, o)) continue;
      outside++;
      if (!allowed.some((r) => U.inRect(x, y, r)) && !U.inPoly(x, y, flap)) bad++;
    }
  }
  T.ok(outside > 1000, 'the sheet has new land (' + outside + ' samples outside the original ground)');
  T.eq(bad, 0, 'every piece of it is a sky pocket, the Dog-Ear flap or newLand');
  T.eq(map.newLand.map((n) => n.id), ['castleRim'], 'exactly one strip of new land: the Castle Rim');
  T.eq(map.newLand[0].rect, [480, 200, 1746, 784], 'the Castle Rim is X 480-1746, Y 200-784');
}

// ------------------------------------------------------------------------------------------------
T.section('lanes, junctions and portals (GDD §3.10)');
{
  const lanes = G.lanes;
  T.eq(Object.keys(lanes).sort(), ['eastE', 'eastW', 'mainN', 'mainS', 'westE', 'westW'], 'six lanes');
  T.eq([lanes.mainS.at, lanes.mainN.at, lanes.westW.at, lanes.westE.at, lanes.eastW.at, lanes.eastE.at], [2398, 2580, 1424, 1616, 2286, 2476], 'lane centres of B-22 (drive on the right)');
  // Each lane's stops in its direction: its start, the junctions on its line, its end.
  function stops(l) {
    const r = l.rect, a0 = l.axis === 'y' ? r[1] : r[0], a1 = l.axis === 'y' ? r[3] : r[2];
    const js = map.junctions.filter((j) => (l.axis === 'y' ? j.rect[0] <= l.at && l.at <= j.rect[2] && j.rect[1] <= a1 && j.rect[3] >= a0
      : j.rect[1] <= l.at && l.at <= j.rect[3] && j.rect[0] <= a1 && j.rect[2] >= a0));
    const pos = (j) => (l.axis === 'y' ? (j.rect[1] + j.rect[3]) / 2 : (j.rect[0] + j.rect[2]) / 2);
    const list = js.map((j) => ({ j: j.id, at: pos(j) }));
    list.push({ end: 'lo', at: a0 }, { end: 'hi', at: a1 });
    list.sort((p, q) => (p.at - q.at) * l.dir);
    return list;
  }
  const segs = [];   // { lane, from, to } (from / to: a junction id or 'in' / 'out' / 'dead')
  const portalAt = (lane, end) => map.portals.find((p) => p.lane === lane && p.end === end);
  Object.keys(lanes).forEach((id) => {
    const st = stops(lanes[id]);
    // The avenues' lanes start (or end) at a junction box beyond their street's end: the part
    // between the two street ends is not a segment of its own.
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], b = st[i + 1];
      if (a.end && b.end) continue;
      const from = a.j || (portalAt(id, 'in') ? 'in' : 'dead'), to = b.j || (portalAt(id, 'out') ? 'out' : 'dead');
      if (a.end && from === 'dead' && b.j) continue;          // the stub between a street end and a junction the lane leaves from
      segs.push({ lane: id, from, to });
    }
  });
  const next = (s) => {
    if (s.to === 'out') return [];
    const j = map.junctions.find((q) => q.id === s.to);
    return ((j && j.exits[s.lane]) || []).map((lane) => segs.find((q) => q.lane === lane && q.from === s.to)).filter(Boolean);
  };
  const reachOut = (s0) => {
    const seen = new Set(), q = [s0];
    while (q.length) {
      const s = q.shift();
      if (s.to === 'out') return true;
      next(s).forEach((n) => { const k = n.lane + n.from; if (!seen.has(k)) { seen.add(k); q.push(n); } });
    }
    return false;
  };
  const ins = segs.filter((s) => s.from === 'in');
  T.eq(ins.map((s) => s.lane).sort(), ['eastW', 'mainN', 'mainS', 'westE'], 'in-portals: Main N end (southbound), Main S end (northbound), West Ave W end (eastbound), East Ave E end (westbound)');
  T.ok(ins.length === 4 && ins.every(reachOut), 'every in-portal reaches an out-portal');
  const onRoute = new Set();
  ins.forEach((s0) => {
    const q = [s0], seen = new Set([s0.lane + s0.from]);
    while (q.length) { const s = q.shift(); onRoute.add(s.lane + ':' + s.from); next(s).forEach((n) => { const k = n.lane + n.from; if (!seen.has(k)) { seen.add(k); q.push(n); } }); }
  });
  T.eq(segs.filter((s) => !onRoute.has(s.lane + ':' + s.from) || !reachOut(s)).map((s) => s.lane + ' ' + s.from + '→' + s.to), [], 'every lane segment is on some in-to-out route');
  T.eq(segs.filter((s) => s.to === 'dead' || s.from === 'dead').map((s) => s.lane), [], 'no lane dead-ends');
  const uturn = [];
  map.junctions.forEach((j) => Object.keys(j.exits).forEach((l) => j.exits[l].forEach((e) => {
    const a = lanes[l], b = lanes[e];
    if (a.axis === b.axis && a.dir === -b.dir) uturn.push(j.id + ' ' + l + '→' + e);
  })));
  T.eq(uturn, [], 'no U-turns at junctions');
  T.eq(map.junctions.map((j) => j.exits.mainS[0] + ',' + j.exits.mainN[0]), ['mainS,mainN', 'mainS,mainN'], 'Main is the through road of both T-junctions');
  T.ok(map.portals.every((p) => !G.onGround(p.at[0] + (lanes[p.lane].axis === 'x' ? lanes[p.lane].dir * (p.end === 'out' ? 8 : -8) : 0),
    p.at[1] + (lanes[p.lane].axis === 'y' ? lanes[p.lane].dir * (p.end === 'out' ? 8 : -8) : 0))), 'every portal sits on a road end at the sheet\'s edge');
}

// ------------------------------------------------------------------------------------------------
T.section('props, railings and walls');
{
  const off = map.props.filter((p) => !G.onGround(p.x, p.y) || G.surfaceAt(p.x, p.y) === 'asphalt');
  T.eq(off.map((p) => p.type + '@' + p.x + ',' + p.y), [], 'every prop lies on the island and off asphalt');
  const near = [];
  map.props.forEach((p) => G.doors.forEach((d) => { if (U.rectDist(p.x, p.y, d.porch) < 24) near.push(p.type + '@' + p.x + ',' + p.y + '~' + d.id); }));
  T.eq(near, [], 'no prop stands within 24 u of a porch');
  const lamps = map.props.filter((p) => p.type === 'lamp'), trees = map.props.filter((p) => p.type === 'tree');
  T.ok(lamps.length >= 30 && trees.length >= 15, 'lamps (' + lamps.length + ') and trees (' + trees.length + ') are generated');
  const sw = map.streets.filter((s) => s.kind === 'sidewalk');
  const onSw = lamps.filter((l) => sw.some((s) => U.inRect(l.x, l.y, s.rect)));
  T.ok(onSw.length >= 30, 'sidewalk lamps stand on sidewalks (' + onSw.length + ')');
  const gaps = [];
  sw.forEach((s) => {
    const horiz = s.kerb === 'N' || s.kerb === 'S';
    const pos = lamps.filter((l) => U.inRect(l.x, l.y, s.rect)).map((l) => (horiz ? l.x : l.y)).sort((a, b) => a - b);
    for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] > 256 * 2 + 1) gaps.push(s.id);
  });
  T.eq([...new Set(gaps)], [], 'sidewalk lamps come every 256 u (a skipped one near a door, zebra or road end at most)');
  T.ok(trees.every((t) => G.surfaceAt(t.x, t.y) === 'lawn' && G.edgeDistance(t.x, t.y) >= 64), 'trees stand on lawns, well inside the edges');
  const outline = map.outline;
  const onOutline = (p) => outline.some((a, i) => { const b = outline[(i + 1) % outline.length]; return U.segClosest(p[0], p[1], a[0], a[1], b[0], b[1]).d < 0.5; });
  T.ok(map.railings.every((r) => onOutline(r.a) && onOutline(r.b)), 'railings lie on the outline');
  T.eq(G.edges.filter((e) => e.railed).map((e) => [e.a.map(Math.round), e.b.map(Math.round)]),
    [[[860, 200], [1746, 200]], [[1746, 200], [1746, 656]], [[3434, 656], [4228, 656]], [[4396, 840], [4396, 1642]]],
    'railed edges: the castle wall (north and east rim) and the Civic Promenade (north and east rim)');
  const rim = G.edges.reduce((a, e) => a + e.len, 0), unr = G.edges.filter((e) => !e.railed).reduce((a, e) => a + e.len, 0);
  T.ok(unr / rim > 0.75, 'most of the rim is unrailed (' + Math.round(100 * unr / rim) + ' %, GDD: about 80 % of the reachable rim)');
  T.ok(map.walls.every((w) => G.solids.some((s) => s.src === 'wall' && U.inRect((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, s.rect))), 'the castle wall is solid');
}

// ------------------------------------------------------------------------------------------------
T.section('reachability (ARCHITECTURE §8.1)');
{
  let walk = 0, conn = 0;
  for (let i = 0; i < N.walk.length; i++) { if (N.walk[i]) walk++; if (N.connected(i)) conn++; }
  T.ok(N.startCell >= 0 && conn / walk > 0.97, 'the start (outside Paperview) connects ' + conn + ' of ' + walk + ' walkable nav cells');
  const cell = N.center(N.startCell);
  T.ok(G.edgeDistance(cell.x, cell.y) >= 40, 'nav cells keep 40 u from unrailed edges');
  const unreach = [];
  const check = (what, x, y) => { if (!N.reachable(x, y).ok) unreach.push(what + ' (' + Math.round(x) + ', ' + Math.round(y) + ')'); };
  map.scraps.forEach((s) => check('scrap ' + s.n, s.x, s.y));
  // An interactable is an area (a rect, or a circle of radius r): some point of it must be reachable.
  const around = (x, y, r) => [[x, y]].concat([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [x + Math.cos(i * Math.PI / 4) * r, y + Math.sin(i * Math.PI / 4) * r]));
  map.interactables.forEach((it) => {
    const pts = it.rect ? [[(it.rect[0] + it.rect[2]) / 2, it.rect[1] - 16], [(it.rect[0] + it.rect[2]) / 2, it.rect[3] + 16], [it.rect[0] - 16, (it.rect[1] + it.rect[3]) / 2], [it.rect[2] + 16, (it.rect[1] + it.rect[3]) / 2]]
      : around(it.x, it.y, Math.min(it.r, 40));
    if (!pts.some((p) => N.reachable(p[0], p[1]).ok)) unreach.push(it.id);
  });
  ['newGame', 'afterJail', 'afterHospital'].forEach((n) => { const p = SR.world.spawnPoint(n, { homes: { living: 'apt' } }); check('spawn ' + n, p.x, p.y); });
  G.doors.forEach((d) => {
    check('trigger ' + d.id, d.tc[0], d.tc[1]);
    check('exit ' + d.id, d.exit.x, d.exit.y);
    if (!G.walkable(d.tc[0], d.tc[1], 0)) unreach.push('trigger off the ground ' + d.id);
  });
  map.people.forEach((p) => (p.path || [[p.x, p.y]]).forEach((q) => check('person ' + p.id, q[0], q[1])));
  // A spot (a person's place, maybe a bench) must be reachable within talking distance (24 u).
  Object.keys(map.spots).forEach((k) => { if (!around(map.spots[k][0], map.spots[k][1], 24).some((p) => N.reachable(p[0], p[1]).ok)) unreach.push('spot ' + k); });
  T.eq(unreach, [], 'every scrap, interactable, spawn point, door trigger, exit, person and spot is reachable');
  T.eq(map.scraps.filter((s) => G.edgeDistance(s.x, s.y) < SR.tuning.world.scrapEdgeMin).map((s) => s.n), [], 'every scrap is ≥ 64 u from any unrailed edge');
  T.eq(map.scraps.map((s) => [s.n, s.x, s.y]), [[1, 720, 460], [2, 4180, 890], [3, 1060, 3810], [4, 4125, 4372], [5, 3672, 3190]], 'the five Torn Scraps of GDD §6.9');
}

// ------------------------------------------------------------------------------------------------
T.section('edges: 200 points just outside unrailed edges are off the sheet; railings hold');
{
  const unr = G.edges.filter((e) => !e.railed), total = unr.reduce((a, e) => a + e.len, 0);
  let n = 0, off = 0, inside = 0;
  for (let i = 0; i < 200; i++) {
    let t = (i + 0.5) / 200 * total, e = null;
    for (const q of unr) { if (t <= q.len) { e = q; break; } t -= q.len; }
    const f = t / e.len, x = e.a[0] + (e.b[0] - e.a[0]) * f, y = e.a[1] + (e.b[1] - e.a[1]) * f;
    n++;
    if (!G.onGround(x + e.out[0] * 4, y + e.out[1] * 4)) off++;
    if (G.onGround(x - e.out[0] * 4, y - e.out[1] * 4) || G.solidAt(x - e.out[0] * 4, y - e.out[1] * 4, 0)) inside++;
  }
  T.eq([n, off], [200, 200], '200 points 4 u outside unrailed edges are off the sheet (a centre there falls)');
  T.ok(inside >= 196, 'and the points 4 u inside are sheet or a solid footing (' + inside + ')');
  const C = SR.world.collide, rails = G.edges.filter((e) => e.railed);
  let held = 0, tries = 0;
  rails.forEach((e) => {
    for (let k = 1; k < 10; k++) {
      const f = k / 10, x = e.a[0] + (e.b[0] - e.a[0]) * f, y = e.a[1] + (e.b[1] - e.a[1]) * f;
      const sx = x - e.out[0] * 40, sy = y - e.out[1] * 40;
      if (!G.walkable(sx, sy, 14)) continue;
      tries++;
      let p = { x: sx, y: sy };
      for (let s = 0; s < 30; s++) p = C.move({ x: p.x, y: p.y, r: 14 }, e.out[0] * 8, e.out[1] * 8);
      if (G.onGround(p.x, p.y)) held++;
    }
  });
  T.ok(tries >= 20 && held === tries, 'pushing into railings and the castle wall never leaves the sheet (' + held + '/' + tries + ')');
}

// ------------------------------------------------------------------------------------------------
T.section('doors, kerbs, homes and spawn points');
{
  T.eq(G.doors.length, 15, '15 doors (every building but the parked Sky Bus)');
  T.ok(G.doors.every((d) => Math.abs(d.trigger[2] - d.trigger[0] - (d.face === 'E' || d.face === 'W' ? 48 : 96)) < 1e-9 &&
    Math.abs(d.trigger[3] - d.trigger[1] - (d.face === 'E' || d.face === 'W' ? 96 : 48)) < 1e-9), 'triggers are 96 × 48 u, the long side along the face');
  T.ok(G.doors.every((d) => Math.abs(Math.hypot(d.tc[0] - d.x, d.tc[1] - d.y) - 24) < 1e-9), 'trigger centres 24 u outside the door');
  T.ok(G.doors.every((d) => Math.abs(Math.hypot(d.exit.x - d.x, d.exit.y - d.y) - 56) < 1e-9), 'exit points 56 u outside the door');
  const kerbs = G.doors.filter((d) => !d.kerb || ['asphalt', 'path', 'plaza'].indexOf(G.surfaceAt(d.kerb[0], d.kerb[1])) < 0 ||
    (d.kerb[0] - d.x) * d.out[0] + (d.kerb[1] - d.y) * d.out[1] <= 0);
  T.eq(kerbs.map((d) => d.id), [], 'every kerb lies on a drivable surface in front of its door');
  T.ok(G.doors.every((d) => d.kerb && G.walkable(d.kerb[0], d.kerb[1], SR.world.cfg.carRadius)), 'a car fits at every kerb');
  T.eq(G.doors.filter((d) => G.doors.some((e) => U.inRect(d.kerb[0], d.kerb[1], e.trigger))).map((d) => d.id), [], 'no kerb lies in a door trigger');
  T.ok(G.doors.every((d) => Math.hypot(d.kerb[0] - d.x, d.kerb[1] - d.y) <= 320), 'every kerb is near its door (≤ 320 u)');
  T.eq(map.buildings.filter((b) => b.homes).map((b) => [b.id, b.homes]),
    [['home_apt', ['apt', 'apt2']], ['home_castle', ['castle']], ['home_mansion', ['mansion']], ['home_pent', ['pent']]], 'the four home doors and their tiers (B-08a)');
  T.ok(map.buildings.filter((b) => b.homes).every((b) => JSON.stringify(SR.rules.homes.doorHomes(b.id)) === JSON.stringify(b.homes)), 'the tiers agree with SR.rules.homes.doorHomes');
  T.ok(Object.keys(SR.reg.home).every((h) => map.buildings.some((b) => b.id === SR.reg.home[h].door && b.homes.indexOf(h) >= 0)), 'every home def\'s door is a worldmap home door');
  T.eq(map.homeLots, SR.tuning.world.homeLots, 'home lots equal B-15 homeLots');
  const s = SR.rules.state.create({ seed: 1 });
  T.ok(['junker', 'sports'].every((c) => U.inRect(s.player.cars[c].x, s.player.cars[c].y, map.homeLots[c])), 'the default cars stand on their home lots');
  T.ok(G.walkable(s.player.x, s.player.y, 14), 'the new game\'s player position is walkable');
  T.eq(SR.world.spawnPoint('newGame', s), { x: 998, y: 1096, facing: 180 }, 'a new game starts outside Paperview facing away');
  T.eq(SR.world.spawnPoint('afterJail', s), { x: 3840, y: 1208, facing: 180 }, 'after jail: the City Hall steps');
  T.eq(SR.world.spawnPoint('afterHospital', Object.assign({}, s, { homes: { owned: ['apt', 'mansion'], living: 'mansion' } })), { x: 2194, y: 890, facing: 90 },
    'after hospital: outside the door of the home you live in');
}

// ------------------------------------------------------------------------------------------------
T.section('the sidewalk graph');
{
  const g = G.graph;
  T.ok(g.nodes.length > 150, g.nodes.length + ' nodes');
  const seen = new Set([0]), q = [0];
  while (q.length) { const n = q.shift(); g.adj[n].forEach((m) => { if (!seen.has(m)) { seen.add(m); q.push(m); } }); }
  T.eq(seen.size, g.nodes.length, 'the graph is connected (links join the jog loop and Margin Path)');
  const badNode = g.nodes.filter((n) => (n.kind !== 'link' && ['sidewalk', 'path', 'plaza'].indexOf(G.surfaceAt(n.x, n.y)) < 0) || G.edgeDistance(n.x, n.y) < 48);
  T.eq(badNode.map((n) => n.id), [], 'nodes lie on sidewalks, paths and plazas (links on lawn), ≥ 48 u from edges');
  const len = (e) => Math.hypot(g.nodes[e[0]].x - g.nodes[e[1]].x, g.nodes[e[0]].y - g.nodes[e[1]].y);
  T.ok(g.edges.every((e) => len(e) <= (e[2] ? 480 : 256)), 'links are short (≤ 256 u; a zebra crossing spans its road)');
  T.eq(map.zebras.filter((z) => !g.edges.some((e) => e[2] === z.id)).map((z) => z.id), [], 'every zebra carries a crossing link');
  const onAsphalt = g.edges.filter((e) => {
    if (e[2]) return false;
    const a = g.nodes[e[0]], b = g.nodes[e[1]];
    for (let i = 0; i <= 10; i++) if (G.surfaceAt(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10) === 'asphalt') return true;
    return false;
  });
  T.eq(onAsphalt.length, 0, 'pedestrians cross roads only on zebras');
  T.ok(['mainSW1', 'mainSE2', 'westAveN', 'eastAveS', 'originPlaza', 'jogLoop', 'marginPath'].every((l) => g.nodes.some((n) => n.line.indexOf(l) === 0)), 'sidewalks, the plaza, the jog loop and Margin Path all carry nodes');
}

// ------------------------------------------------------------------------------------------------
T.section('text and world actions');
{
  const keys = [];
  map.buildings.forEach((b) => { keys.push(b.name); if (b.exterior.sign) keys.push(b.exterior.sign); });
  keys.push('place.home', 'door.enter', 'door.park', 'door.live', 'door.owned', 'door.forSale', 'place.sign.roadEnds',
    'ori.fall1', 'ori.fall2', 'ori.fall5', 'ori.fall10', 'ori.fall25', 'ori.fall50', 'toast.world.phew', 'toast.world.hey',
    'toast.world.carHit', 'toast.world.crash', 'toast.world.carFished');
  Object.keys(SR.reg.action).filter((id) => id.indexOf('world.') === 0).forEach((id) => keys.push(SR.reg.action[id].label));
  T.eq(keys.filter((k) => !SR.text.has(k)), [], 'every text key the world names is registered (en-world.js)');
  const long = Object.keys(SR.reg.text).filter((k) => SR.registry.file('text', k) === 'js/data/text/en-world.js' &&
    ((k.indexOf('act.') === 0 && SR.reg.text[k].length > 28) || ((k.indexOf('toast.') === 0 || k.indexOf('ori.fall') === 0) && SR.reg.text[k].length > 80)));
  T.eq(long, [], 'labels ≤ 28 characters, toasts and Ori\'s lines ≤ 80');
  const own = Object.keys(SR.reg.text).filter((k) => SR.registry.file('text', k) === 'js/data/text/en-world.js');
  T.eq(own.filter((k) => !/^(place|door|ori|act\.world|toast\.world)\./.test(k)), [], 'en-world.js registers only place.*, door.*, ori.*, act.world.*, toast.world.*');
  T.eq(Object.keys(SR.reg.action).filter((id) => id.indexOf('world.') === 0).sort(), ['world.carCrash', 'world.carFished', 'world.carHit', 'world.enter', 'world.fall'], 'the five world actions of ARCHITECTURE §8.3');
  T.ok(['world.fall', 'world.carHit', 'world.carCrash', 'world.carFished', 'world.enter'].every((id) => {
    const d = SR.reg.action[id];
    return d.building === 'world' && d.p === 0 && d.timeRule === 'free' && !d.repeatable && !(d.requires || []).length;
  }), 'world actions: owner world, P0, free of the time wall, never repeatable, no requirements (involuntary)');
}

// ------------------------------------------------------------------------------------------------
T.section('the frozen SR.world names (CONTRACT §15), headless');
{
  const W = SR.world;
  const names = { 'update': W.update, 'geometry.edgeDistance': G.edgeDistance, 'geometry.railedAt': G.railedAt, 'geometry.nearestSafe': G.nearestSafe,
    'collide.move': W.collide.move, 'nav.path': N.path, 'camera.update': W.camera.update, 'player.update': W.player.update,
    'doors.update': W.doors.update, 'doors.resolve': W.doors.resolve, 'fall.update': W.fall.update };
  T.eq(Object.keys(names).filter((k) => typeof names[k] !== 'function'), [], 'every frozen function exists');
  const s = SR.rules.state.create({ seed: 3 });
  SR.state = s;
  W.start(s);
  const moved = W.collide.move({ x: 998, y: 1096, r: 14 }, 0, 20);
  T.ok(Math.abs(moved.y - 1116) < 1e-9 && !moved.hit && !moved.offGround && moved.surface === 'lawn', 'collide.move → { x, y, hit, offGround, surface }', moved);
  const into = W.collide.move({ x: 998, y: 1100, r: 14 }, 0, -80);
  T.ok(into.hit && into.y >= 1040 + 14 - 1e-6, 'a mass stops the body at its radius (slides, never enters)', into);
  let threw = null;
  try {
    W.player.update(1 / 60); W.doors.update(1 / 60); W.fall.update(1 / 60); W.camera.update(1 / 60);
    for (let i = 0; i < 60; i++) W.update(1 / 60);
  } catch (e) { threw = e.message; }
  T.eq(threw, null, 'every update runs with one argument and no SR.input (Node)');
  T.eq([s.player.x, s.player.y], [998, 1088], 'starts where state.player says; standing still, the position written back once a second is unchanged');
  T.eq(W.teleport(2223, 900), { x: 2223, y: 900 }, 'SR.world.teleport (the debug teleport, D39)');
  T.eq([s.player.x, s.player.y, W.camera.x, W.camera.y], [2223, 900, 2223, 900], 'teleporting writes the state and snaps the camera');
  const a = [], b = [];
  [a, b].forEach((out) => {
    W.start(SR.rules.state.create({ seed: 3 }));
    SR.state.player.x = 998;
    for (let i = 0; i < 300; i++) { W.update(1 / 60, { x: Math.sin(i / 20), y: Math.cos(i / 30), skate: false }); out.push(Math.round(W.player.x * 100) + ',' + Math.round(W.player.y * 100)); }
  });
  T.eq(a, b, 'the world is deterministic: the same input gives the same walk');
  SR.state = null;
}

T.done();
