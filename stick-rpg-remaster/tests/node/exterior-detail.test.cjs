// tests/node/exterior-detail.test.cjs — owner: W2-Exterior. The Node side of BUILD_PLAN §4.2: the
// four art files load headless and shuffled (Node-loadable, CONTRACT §1); every worldmap building's
// `exterior.detail` is a registered SR.def.exterior with a detail function and signature rects; the
// visibility invariant holds with those signatures (clear of every other building's projected rect
// and porch, and near their own building); each detail stays within 150 lines; the state keys (For
// Sale, the memorial, the cityReacts elements behind their flag); props cover every worldmap prop
// and every ART_AUDIO §6 type with a sprite box that holds its anchor, and no prop's sprite covers a
// door's visible porch strip; the glyphs and the six skyline silhouettes; no Math.random and no
// colour literal in the four files; the sign words they name (registered or requested); details
// placed by the data (the departures board's SR.def.city order, NLI's billboard in its worldmap
// signature, the kid's memorial at spots.kidCorner inside a mansion signature rect).
//   node tests/node/exterior-detail.test.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./load.cjs');

const T = L.suite('exterior detail, props, logos, skyline (W2-Exterior)');
const FILES = ['js/art/exteriors-detail.js', 'js/art/props.js', 'js/art/logos.js', 'js/art/skyline.js'];
const PROJ = 0.5;
const MAX_DETAIL_LINES = 150;          // BUILD_PLAN §4.2
const PORCH_CLEAR = 24;                // GDD §3.6: no prop within 24 u of a porch
// Sign words the files name that W2-City's en-world.js may not register yet (docs/requests/W2-Exterior.md).
const REQUESTED = ['place.sign.forSale', 'place.sign.slushee', 'place.sign.departures', 'place.sign.skybus', 'place.sign.ceo',
  'place.sign.nliAd', 'place.sign.billboard.1', 'place.sign.billboard.2', 'place.sign.billboard.3', 'place.sign.billboard.4', 'place.sign.billboard.5'];

const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const grow = (r, m) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];

// -------------------------------------------------------------------------------------------------
T.section('loading (Node-loadable registration files)');
const res = L.load({ mode: 'all', keepGoing: true });
T.eq(res.errors.map((e) => String(e.message || e)), [], 'mode all loads and boots headless with no error');
const SR = res.SR;
T.ok(FILES.slice(0, 3).every((f) => res.files.indexOf(f) >= 0), 'mode all loads the three registration files (detail, props, logos)', FILES.filter((f) => res.files.indexOf(f) < 0));
for (const seed of [3, 17, 2024]) {
  const sh = L.load({ mode: 'all', shuffle: seed, keepGoing: true });
  T.eq(sh.errors.map((e) => String(e.message || e)), [], 'shuffled load (seed ' + seed + ') has no error');
}
T.ok(typeof SR.art.props.draw === 'function' && typeof SR.art.props.size === 'function', 'SR.art.props.{draw, size} (CONTRACT §15.2)');
T.ok(typeof SR.art.props.railing === 'function' && typeof SR.art.props.wall === 'function', 'the optional railing / wall painters exist');
T.ok(typeof SR.art.logos.draw === 'function' && SR.art.logos.names().length >= 10, 'SR.art.logos.draw and its glyphs');
T.ok(typeof SR.art.exteriorDetail.stateKey === 'function' && typeof SR.art.exteriorDetail.refresh === 'function', 'SR.art.exteriorDetail.{stateKey, refresh}');
T.ok(SR.art.skyline === undefined, 'js/art/skyline.js is not a registration file (mode all leaves it out; the sky pass loads it)');
const sk = L.load({ mode: 'all', extra: ['js/art/skyline.js'], keepGoing: true });
T.ok(!sk.errors.length && typeof sk.SR.art.skyline.draw === 'function', 'js/art/skyline.js also loads headless (nothing runs at load time)');

// -------------------------------------------------------------------------------------------------
T.section('every building has its detail and signature rects');
const wm = SR.reg.worldmap.main;
const ex = SR.reg.exterior || {};
const ids = wm.buildings.map((b) => b.id);
T.eq(ids.length, 16, 'the worldmap has 16 buildings');
T.eq(wm.buildings.filter((b) => !(b.exterior && ex[b.exterior.detail])).map((b) => b.id), [], "every building's exterior.detail is a registered SR.def.exterior");
T.eq(Object.keys(ex).filter((id) => ids.indexOf(id) < 0), [], 'no exterior is registered for a building the worldmap lacks');
T.eq(ids.filter((id) => !ex[id] || typeof ex[id].detail !== 'function' || !Array.isArray(ex[id].signature)), [], 'each has detail(ctx, geom, state) and a signature array');
const badRects = [];
ids.forEach((id) => (ex[id].signature || []).forEach((r) => { if (!(Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3])) badRects.push([id, r]); }));
T.eq(badRects, [], 'every signature rect is [x0, y0, x1, y1] with x0 < x1, y0 < y1');

// -------------------------------------------------------------------------------------------------
T.section('the visibility invariant with the detail drawn (ARCHITECTURE §8.1)');
const projected = [];
wm.buildings.forEach((b) => {
  b.masses.forEach((m) => projected.push({ id: b.id, rect: [m.rect[0], m.rect[1] - PROJ * m.h, m.rect[2], m.rect[3]] }));
  ((b.exterior && b.exterior.tops) || []).forEach((t) => projected.push({ id: b.id, rect: [t.rect[0], t.rect[1] - PROJ * t.h, t.rect[2], t.rect[3]] }));
});
function porchOf(b) {
  const d = b.door;
  if (!d) return null;
  if (d.face === 'S') return [d.x - 48, d.y, d.x + 48, d.y + 40];
  if (d.face === 'E') return [d.x, d.y - 48, d.x + 32, d.y + 48];
  if (d.face === 'W') return [d.x - 32, d.y - 48, d.x, d.y + 48];
  const annex = b.masses.find((m) => Math.abs(m.rect[1] - d.y) < 2) || b.masses.find((m) => m.role === 'annex') || b.masses[0];
  return [d.x - 48, d.y - (PROJ * annex.h + 32), d.x + 48, d.y];
}
const porches = wm.buildings.map((b) => ({ id: b.id, rect: porchOf(b) })).filter((p) => p.rect);
const covered = [], nearOwn = [], onPorch = [];
ids.forEach((id) => {
  const own = projected.filter((p) => p.id === id).map((p) => p.rect);
  const box = own.reduce((a, r) => [Math.min(a[0], r[0]), Math.min(a[1], r[1]), Math.max(a[2], r[2]), Math.max(a[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  (ex[id].signature || []).forEach((r) => {
    projected.filter((p) => p.id !== id && overlap(p.rect, r)).forEach((p) => covered.push([id, r, p.id]));
    porches.filter((p) => p.id !== id && overlap(p.rect, r)).forEach((p) => onPorch.push([id, r, p.id]));
    if (!overlap(grow(box, 80), r)) nearOwn.push([id, r]);
  });
});
T.eq(covered, [], "every registered signature rect is clear of every other building's projected rect");
T.eq(onPorch, [], "no signature rect lies on another building's porch or awning");
T.eq(nearOwn, [], 'every signature rect lies on or beside its own building (within 80 u of its projection)');

// -------------------------------------------------------------------------------------------------
T.section('each detail is at most 150 lines (BUILD_PLAN §4.2)');
const src = fs.readFileSync(path.join(L.ROOT, 'js/art/exteriors-detail.js'), 'utf8').split('\n');
const lengths = {};
src.forEach((line, i) => {
  const m = /^\s*SR\.def\.exterior\('([a-z_]+)'/.exec(line);
  if (!m) return;
  let j = i + 1;
  while (j < src.length && !/^\s{2}\}\);\s*$/.test(src[j])) j++;
  lengths[m[1]] = j - i + 1;
});
T.eq(Object.keys(lengths).sort(), ids.slice().sort(), 'one SR.def.exterior block per building');
T.eq(Object.keys(lengths).filter((id) => lengths[id] > MAX_DETAIL_LINES).map((id) => [id, lengths[id]]), [], 'every block ≤ ' + MAX_DETAIL_LINES + ' lines (longest ' + Math.max.apply(null, Object.values(lengths)) + ')');

// -------------------------------------------------------------------------------------------------
T.section('state keys: For Sale and the memorial (P0), the reacting elements behind cityReacts');
const D = SR.art.exteriorDetail;
const newGame = () => ({ homes: { owned: ['apt'], living: 'apt' }, job: { ranks: { mcsticks: 'cook', nli: null }, office: null },
  election: { status: 'none', path: null }, stats: { karma: 0, heat: 0 }, npc: { kid: { dead: false } }, player: { name: 'Stick', look: { acc: 'none' } } });
const rich = () => ({ homes: { owned: ['apt', 'apt2', 'mansion', 'castle', 'pent'], living: 'castle' }, job: { ranks: { mcsticks: 'cook', nli: 'ceo' }, office: 'president' },
  election: { status: 'office', path: 'president' }, stats: { karma: 64, heat: 60 }, npc: { kid: { dead: true } }, player: { name: 'Stick', look: { acc: 'tophat' } } });
const sale = (id, s) => D.stateKey(id, s).split('|')[0] === 'sale';
T.eq(['home_apt', 'home_mansion', 'home_castle', 'home_pent'].map((id) => sale(id, null)), [true, true, true, true], 'outside a game every home shows For Sale');
T.eq(['home_apt', 'home_mansion', 'home_castle', 'home_pent'].map((id) => sale(id, newGame())), [true, true, true, true], 'a new game (the apartment only): the top floor, mansion, castle and penthouse are for sale');
T.eq(['home_apt', 'home_mansion', 'home_castle', 'home_pent'].map((id) => sale(id, rich())), [false, false, false, false], 'owning a tier removes its For Sale sign');
SR.features.cityReacts = false;
T.ok(/memorial/.test(D.stateKey('home_mansion', rich())), "the kid's memorial shows once he is gone, flag or no flag (BALANCE kid.givePack: P0)");
T.eq(['nli', 'bank', 'cityhall', 'mcsticks', 'bar', 'casino', 'store', 'pawn'].map((id) => D.stateKey(id, rich()).replace(/\|/g, '')), ['', '', '', '', '', '', '', ''], 'with cityReacts off, CEO and office change no building');
T.ok(!/butler/.test(D.stateKey('home_mansion', rich())) && D.stateKey('home_castle', rich()) === '|', 'with cityReacts off, no butler and no karma flags');
SR.features.cityReacts = true;
T.ok(/^ceo:/.test(D.stateKey('nli', rich())) && /president/.test(D.stateKey('nli', rich())), 'with cityReacts on, the billboard shows the CEO and the banners the office');
T.ok(/butler/.test(D.stateKey('home_mansion', rich())) && D.stateKey('home_castle', rich()) !== '|', 'with cityReacts on, the butler waves and the castle flags take your karma colour');
const r2 = rich(); r2.stats.karma = -64;
T.ok(D.stateKey('home_castle', r2) !== D.stateKey('home_castle', rich()), 'the castle flags follow your karma band');
T.eq(['bank', 'cityhall', 'store'].map((id) => D.stateKey(id, Object.assign(rich(), { job: { ranks: {}, office: 'dictator' } }))), ['dictator', 'dictator', 'dictator'], "a Dictator's red banners");
T.eq(D.stateKey('uofs', rich()), '', 'a building without state-driven detail has an empty key');
T.eq(D.refresh(), [], 'refresh() without a render core invalidates nothing (Node)');
const P = SR.art.props;
SR.state = rich();
T.eq([P.stateKey('plinth'), /^wanted/.test(P.stateKey('lamp')), /^wanted/.test(P.stateKey('shelter')), P.stateKey('tree')], ['president', true, true, ''], 'props: the statue and the wanted posters (Heat ≥ tuning.crime.police.posters)');
SR.state.stats.heat = SR.tuning.crime.police.posters - 1;
T.eq(P.stateKey('lamp'), '', 'no posters below the threshold');
SR.features.cityReacts = false;
SR.state = rich();
T.eq([P.stateKey('plinth'), P.stateKey('lamp')], ['', ''], 'with cityReacts off the props never react');
SR.state = null;

// -------------------------------------------------------------------------------------------------
T.section('every detail, prop and glyph draws headless under every state (a recording mock canvas)');
// The art rigs the details call (drawing only; nothing runs at load time), then a canvas stand-in
// that records calls and any non-finite number passed to a drawing method.
const AR = L.load({ mode: 'all', extra: ['js/art/draw.js', 'js/art/stick.js', 'js/art/portraits.js', 'js/art/vehicles.js'], keepGoing: true });
T.eq(AR.errors.map((e) => String(e.message || e)), [], 'the details load headless beside the drawing rigs');
const S2 = AR.SR, D2 = S2.art.exteriorDetail, X2 = S2.reg.exterior;
function mockCtx() {
  const rec = { n: 0, bad: [], texts: [], rects: [] };
  const st = { font: '10px sans-serif', canvas: { width: 100, height: 100 } };
  const fns = {
    measureText: (s) => { const m = /([\d.]+)px/.exec(st.font); return { width: String(s).length * (m ? +m[1] : 10) * 0.6 }; },
    fillText: (str) => { rec.n++; rec.texts.push(String(str)); },
    fillRect: (x, y, w, h) => { rec.n++; rec.rects.push([x, y, x + w, y + h]); for (const a of [x, y, w, h]) if (!Number.isFinite(a)) rec.bad.push('fillRect'); },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}),
  };
  const ctx = new Proxy(st, {
    get(t, k) {
      if (k in fns) return fns[k];
      if (k in t || typeof k === 'symbol') return t[k];
      return function () { rec.n++; for (const a of arguments) if (typeof a === 'number' && !Number.isFinite(a)) rec.bad.push(String(k)); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, rec };
}
/** The painter's detail geometry (js/art/exteriors.js detailGeom) for a worldmap entry, rebuilt here. */
function geomOf(b) {
  const col = (k) => S2.art.draw.color(k);
  const pal = (keys) => { const list = Array.isArray(keys) ? keys : [keys]; for (const k of list) { const c = col(k); if (c && c !== k) return c; } return col(list[list.length - 1]); };
  const id = b.exterior.palette || 'bld.' + b.id;
  const masses = b.masses.map((m) => {
    const r = m.rect;
    return { role: m.role, rect: r.slice(), h: m.h, proj: [r[0], r[1] - PROJ * m.h, r[2], r[3]], facade: [r[0], r[3] - PROJ * m.h, r[2], r[3]], roof: [r[0], r[1] - PROJ * m.h, r[2], r[3] - PROJ * m.h] };
  });
  const d = b.door, main = masses[0];
  let canopy = null, sign = null;
  if (d && d.face === 'N') {
    const annex = masses.find((m) => Math.abs(m.rect[1] - d.y) < 2) || main;
    const cw = Math.min(annex.rect[2] - annex.rect[0] - 16, 150), ry = annex.rect[1] - PROJ * annex.h;
    canopy = [d.x - cw / 2, ry - 8, d.x + cw / 2, ry + 18];
    sign = canopy;
  } else if (d && (d.face === 'E' || d.face === 'W')) {
    const f = main.facade;
    sign = [f[0] + 14, f[1] + 8, f[0] + 168, f[1] + 26];
  }
  const colors = { walls: pal([id + '.walls', 'stone']), shade: pal([id + '.shade', 'stoneShade']), roof: pal([id + '.roof', 'stoneShade']), trim: pal([id + '.trim', 'paperEdge']),
    stripe: pal([id + '.trim', 'paperEdge']), glass: col('glass'), glassLit: col('glassLit'), ink: col('ink'), paper: col('paperEdge'), stone: col('stone'), stoneShade: col('stoneShade') };
  return { id: b.id, archetype: b.exterior.archetype, masses, door: d ? { face: d.face, x: d.x, y: d.y } : null, canopy, sign, colors, windows: [],
    lineWidth: 2, projection: PROJ, zoom: 1, dpr: 1, scale: 1, tone: (c, k) => S2.art.draw.tone(c, k), pal };
}
const dictator = () => Object.assign(rich(), { job: { ranks: { nli: 'ceo' }, office: null }, election: { status: 'office', path: 'dictator' }, stats: { karma: -85, heat: 90 } });
const STATES = [['no game', null, false], ['a new game', newGame(), false], ['every reacting element, flag off', rich(), false],
  ['every reacting element, flag on', rich(), true], ['a Dictator, flag on', dictator(), true]];
const threw = [], nonFinite = [], unrecorded = [], badWin = [];
STATES.forEach(([tag, s, flag]) => {
  S2.features.cityReacts = flag;
  wm.buildings.forEach((b) => {
    const m = mockCtx(), g = geomOf(b);
    try { X2[b.id].detail(m.ctx, g, s); } catch (e) { threw.push([tag, b.id, e.message]); return; }
    if (m.rec.bad.length) nonFinite.push([tag, b.id, [...new Set(m.rec.bad)]]);
    if (D2.baked()[b.id] !== D2.stateKey(b.id, s)) unrecorded.push([tag, b.id]);
    g.windows.forEach((w) => { if (!(Array.isArray(w) && w.length >= 4 && w.slice(0, 4).every(Number.isFinite) && w[2] > 0 && w[3] > 0)) badWin.push([tag, b.id, w]); });
  });
});
T.eq(threw, [], 'every detail draws under no game, a new game, every reacting element (flag off and on) and a Dictator');
T.eq(nonFinite, [], 'no detail passes NaN or Infinity to the canvas');
T.eq(unrecorded, [], 'each bake records the state key it drew with (SR.art.exteriorDetail.baked)');
T.eq(badWin, [], 'the lit windows a detail adds or keeps are finite [x, y, w, h] rects');
// refresh(): the render core re-bakes exactly the buildings whose key changed, once.
const invalidated = [];
const hadRender = S2.render;
S2.render = Object.assign({}, hadRender, { invalidate: (what) => invalidated.push(what) });
S2.features.cityReacts = true;
S2.state = newGame();
wm.buildings.forEach((b) => X2[b.id].detail(mockCtx().ctx, geomOf(b), S2.state));
T.eq(D2.refresh(), [], 'refresh() with an unchanged state re-bakes nothing');
S2.state = rich();
const changed = D2.refresh().sort();
T.eq(changed, D2.stateful().slice().sort(), 'every stateful building re-bakes when you own every home, run NLI, hold office and outlive the kid');
T.eq(invalidated.slice().sort(), changed.map((id) => 'building:' + id), 'through SR.render.invalidate(\'building:<id>\')');
T.eq(D2.refresh(), [], 'a building invalidated once is not invalidated again until it re-bakes');
S2.state.stats.karma = -64;
wm.buildings.forEach((b) => X2[b.id].detail(mockCtx().ctx, geomOf(b), S2.state));
S2.state.stats.karma = 64;
T.eq(D2.refresh().sort(), ['home_castle', 'nli'], "a karma band change re-bakes only the castle (its flags) and NLI (the CEO portrait's head)");
S2.render = hadRender; S2.state = null; S2.features.cityReacts = false;
// Details that place things by the worldmap and the data rather than by hand-typed numbers.
const bOf = (id) => wm.buildings.find((b) => b.id === id);
const same4 = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
{
  const m = mockCtx();
  X2.bus.detail(m.ctx, geomOf(bOf('bus')), null);
  const order = Object.keys(S2.reg.city).sort((a, b) => S2.reg.city[a].order - S2.reg.city[b].order).map((id) => S2.text(S2.reg.city[id].name));
  T.eq(m.rec.texts.filter((x) => order.indexOf(x) >= 0), order, 'the departures board lists the six cities of SR.def.city in their board order');
  T.ok(m.rec.texts.filter((x) => x === '00:00').length === 6, "each at the red-eye's 24 h time, whatever the player's clock setting");
}
{
  const sig = bOf('nli').exterior.signature[0], m = mockCtx();
  X2.nli.detail(m.ctx, geomOf(bOf('nli')), null);
  T.ok(m.rec.rects.some((r) => same4(r, sig)), "NLI's rooftop billboard fills the worldmap's signature rect (the one the invariant protects)", sig);
}
{
  // The kid's memorial stands at his corner (worldmap spots.kidCorner), inside a mansion signature
  // rect: if W2-City moves the spot, the rect must follow or the sprite would crop the memorial.
  const kc = wm.spots && wm.spots.kidCorner, sz = S2.art.props.size('memorial', 0, 0);
  const box = kc && [kc[0] - sz.ax, kc[1] - sz.ay, kc[0] - sz.ax + sz.w, kc[1] - sz.ay + sz.h];
  const inside = (r, q) => q[0] <= r[0] && q[1] <= r[1] && q[2] >= r[2] && q[3] >= r[3];
  T.ok(!!box && X2.home_mansion.signature.some((q) => inside(box, q)), "the memorial's sprite box at spots.kidCorner lies inside a mansion signature rect", [kc, box]);
  const tr = [], m = mockCtx();
  const ctx = new Proxy(m.ctx, { get(t, k) { if (k === 'translate') return (x, y) => tr.push([x, y]); return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
  X2.home_mansion.detail(ctx, geomOf(bOf('home_mansion')), { homes: { owned: ['apt'] }, npc: { kid: { dead: true } }, stats: { karma: 0 } });
  T.ok(tr.some((p) => same4(p, kc)), 'and the detail draws it there once the kid is gone', tr);
}
// Props and glyphs on the mock under the reacting states (the statue, wanted posters).
const propThrew = [], propBad = [];
STATES.forEach(([tag, s, flag]) => {
  S2.features.cityReacts = flag; S2.state = s;
  S2.art.props.types().forEach((type) => {
    for (let v = 0; v < S2.art.props.variants(type); v++) [0, 45, 90, 270].forEach((a) => {
      const m = mockCtx();
      try { S2.art.props.draw(m.ctx, type, v, a); } catch (e) { propThrew.push([tag, type, v, a, e.message]); }
      if (m.rec.bad.length) propBad.push([tag, type, v, a]);
    });
  });
});
S2.art.logos.names().forEach((n) => [{}, { mono: 'light.neonPink' }].forEach((o) => {
  const m = mockCtx();
  try { S2.art.logos.draw(m.ctx, n, 0, 0, 40, o); } catch (e) { propThrew.push(['glyph', n, e.message]); }
  if (m.rec.bad.length) propBad.push(['glyph', n]);
}));
S2.features.cityReacts = false; S2.state = null;
T.eq(propThrew, [], 'every prop (type, variant, angle) and glyph draws under every state');
T.eq(propBad, [], 'no prop or glyph passes NaN or Infinity to the canvas');

// -------------------------------------------------------------------------------------------------
T.section('props (ART_AUDIO §6)');
const types = P.types();
const want = ['tree', 'lamp', 'bench', 'hydrant', 'bin', 'planter', 'mailbox', 'newsbox', 'shelter', 'billboard', 'sawhorse', 'plinth', 'chessTable', 'binoculars', 'car', 'fountainJet', 'duck', 'memorial', 'forSale', 'flagpole'];
T.eq(want.filter((t) => types.indexOf(t) < 0), [], 'every ART_AUDIO §6 prop type is drawn (plus the memorial, For Sale post and flagpole)');
T.eq([...new Set(wm.props.map((p) => p.type))].filter((t) => types.indexOf(t) < 0), [], 'every worldmap prop type is drawn');
T.eq(P.variants('tree'), 3, 'trees: the round oak, the poplar and the cloud tree');
T.eq(P.variants('billboard'), 5, 'five billboards');
const boxBad = [];
types.forEach((t) => {
  for (let v = 0; v < P.variants(t); v++) [0, 45, 90, 180, 270].forEach((a) => {
    const s = P.size(t, v, a);
    if (!s || !(s.w > 0 && s.h > 0 && s.ax >= 0 && s.ax <= s.w && s.ay >= 0 && s.ay <= s.h)) boxBad.push([t, v, a, s]);
  });
});
T.eq(boxBad, [], "every type, variant and angle has a sprite box that holds its ground contact point");
T.ok(P.size('nope', 0, 0) === null && P.draw({}, 'nope') === false, 'an unknown type has no box and draws nothing');
T.ok(P.size('bench', 0, 90).h > P.size('bench', 0, 0).h && P.size('shelter', 0, 90).h > P.size('shelter', 0, 0).h, 'benches and shelters along a north-south path get their end-on boxes');
const plinth = wm.features && wm.features.plinth;
T.ok(!!plinth, 'the worldmap has the statue plinth the render core draws as a prop');
// No prop stands within 24 u of a porch, and no prop's sprite covers a door's visible porch strip.
const visible = wm.buildings.filter((b) => b.door).map((b) => {
  const p = porchOf(b);
  if (b.door.face !== 'N') return { id: b.id, rect: p };
  const annex = b.masses.find((m) => Math.abs(m.rect[1] - b.door.y) < 2) || b.masses[0];
  return { id: b.id, rect: [p[0], p[1], p[2], b.door.y - PROJ * annex.h] };
});
const near = [], hides = [];
wm.props.forEach((p) => {
  const s = P.size(p.type, p.variant || 0, p.a || 0);
  const foot = [p.x - s.w / 4, p.y - 6, p.x + s.w / 4, p.y + 6];
  porches.forEach((q) => { if (overlap(grow(q.rect, PORCH_CLEAR), foot)) near.push([p.type, p.x, p.y, q.id]); });
  const spr = [p.x - s.ax, p.y - s.ay, p.x - s.ax + s.w, p.y - s.ay + s.h];
  visible.forEach((q) => { if (p.y > q.rect[3] && overlap(spr, q.rect)) hides.push([p.type, p.x, p.y, q.id]); });
});
T.eq(near, [], 'no worldmap prop stands within 24 u of a porch (GDD §3.6)');
T.eq(hides, [], "no prop drawn in front of a door covers that door's visible porch strip");

// -------------------------------------------------------------------------------------------------
T.section('glyphs and the distant islands');
T.eq(['burger', 'lines', 'dollar', 'cloud', 'balls', 'mug', 'slushee', 'sofa', 'bus', 'mortarboard', 'clock'].filter((n) => !SR.art.logos.has(n)), [], 'the ART_AUDIO §5.2 brand glyphs exist');
T.ok(SR.art.logos.draw({}, 'nope', 0, 0, 10) === false && SR.art.logos.aspect('nope') === 1, 'an unknown glyph draws nothing');
const cities = sk.SR.art.skyline.cities();
T.eq(wm.skyIslands.map((i) => i.city).filter((c) => cities.indexOf(c) < 0), [], 'every worldmap sky island has a silhouette of its own');
T.eq(cities.length, 6, 'six silhouettes (crayons, chimneys, sequins, windmills, erasers, pegs)');
T.ok(Array.isArray(wm.skyRibbon.to) && wm.skyRibbon.to.every((c) => cities.indexOf(c) >= 0), 'the Sky Ribbon reaches two drawn islands (Port Eraser, Las Pegas)');

// -------------------------------------------------------------------------------------------------
T.section('code rules: no Math.random, no colour literal, sign words');
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
const lits = [], rnd = [];
FILES.forEach((f) => fs.readFileSync(path.join(L.ROOT, f), 'utf8').split('\n').forEach((line, i) => {
  const code = line.replace(/\/\/.*$/, '');
  if (COLOUR.test(code)) lits.push(f + ':' + (i + 1));
  if (/Math\.random/.test(code)) rnd.push(f + ':' + (i + 1));
}));
T.eq(lits, [], 'no colour literal in the four files (palette keys only)');
T.eq(rnd, [], 'no Math.random (deterministic hashes for ivy, speckles and islands)');
const keys = new Set();
FILES.forEach((f) => { const t = fs.readFileSync(path.join(L.ROOT, f), 'utf8'); (t.match(/'place\.sign\.[A-Za-z0-9_.]+'/g) || []).forEach((k) => keys.add(k.slice(1, -1))); });
const missing = [...keys].filter((k) => !SR.reg.text[k] && REQUESTED.indexOf(k) < 0);
T.eq(missing, [], 'every sign word named is registered or requested from W2-City');
const pending = [...keys].filter((k) => !SR.reg.text[k]);
console.log('  info ' + pending.length + ' requested sign words not registered yet (signs stay blank until then): ' + pending.join(', '));

T.done();
