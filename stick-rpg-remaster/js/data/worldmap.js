// js/data/worldmap.js — owner: W1-W (W2-City fixes in wave 2, W3-Park in wave 3). The whole city of
// GDD §3 in the ARCHITECTURE §8.1 format: the torn outline with the Bite, new land, the Bus Hole,
// railings and the castle wall, every street, sidewalk, path, plaza, junction, zebra, lane and
// portal, every building's masses, door, kerb and exterior (signature rects in projected space),
// people and their spots, interactables, home lots, park and plaza features, sky islands, Torn
// Scraps and spawn points. Lamps, trees and the small street furniture are generated here from
// seeded rules (a local integer hash, never the platform RNG) and kept 24 u clear of every porch.
// Pure data: no DOM, no other module is called at load time (Node-loadable).
(function () {
  'use strict';
  var SR = window.SR;

  // ---------------------------------------------------------------------------------------------
  // Outline (GDD §3.3), clockwise, with the Bite as an 11-segment arc (centre (1060, 4100), r 220)
  // bulging north into the park's south edge.
  // ---------------------------------------------------------------------------------------------
  var BITE = { x: 1060, y: 4100, r: 220, segments: 11 };

  function biteArc() {
    var pts = [];
    for (var i = 0; i <= BITE.segments; i++) {
      var a = -Math.PI * i / BITE.segments;
      pts.push([Math.round((BITE.x + BITE.r * Math.cos(a)) * 10) / 10, Math.round((BITE.y + BITE.r * Math.sin(a)) * 10) / 10]);
    }
    return pts; // (1280, 4100) ... (840, 4100)
  }

  var OUTLINE = [
    [480, 620], [860, 200], [1746, 200], [1746, 656], [4228, 656], [4228, 840], [4396, 840],
    [4396, 4000], [4300, 4000], [4300, 4440], [4060, 4440], [4060, 4000], [3444, 4000],
    [3444, 4100],
  ].concat(biteArc(), [[480, 4100]]);

  // ---------------------------------------------------------------------------------------------
  // Streets, sidewalks, paths and plazas (GDD §3.3). Sidewalks are split where the avenues cut
  // them; `kerb` names the side that faces the asphalt (lamps stand there).
  // ---------------------------------------------------------------------------------------------
  var STREETS = [
    { id: 'main', kind: 'asphalt', rect: [2308, 656, 2670, 4100],
      lanes: [{ id: 'mainS', axis: 'y', dir: 1, at: 2398 }, { id: 'mainN', axis: 'y', dir: -1, at: 2580 }] },
    { id: 'westAve', kind: 'asphalt', rect: [480, 1328, 2308, 1712],
      lanes: [{ id: 'westW', axis: 'x', dir: -1, at: 1424 }, { id: 'westE', axis: 'x', dir: 1, at: 1616 }] },
    { id: 'eastAve', kind: 'asphalt', rect: [2670, 2192, 4396, 2570],
      lanes: [{ id: 'eastW', axis: 'x', dir: -1, at: 2286 }, { id: 'eastE', axis: 'x', dir: 1, at: 2476 }] },
    { id: 'mainSW1', kind: 'sidewalk', rect: [2138, 656, 2308, 1328], kerb: 'E' },
    { id: 'mainSW2', kind: 'sidewalk', rect: [2138, 1712, 2308, 4100], kerb: 'E' },
    { id: 'mainSE1', kind: 'sidewalk', rect: [2670, 656, 2842, 2192], kerb: 'W' },
    { id: 'mainSE2', kind: 'sidewalk', rect: [2670, 2570, 2842, 4100], kerb: 'W' },
    { id: 'westAveN', kind: 'sidewalk', rect: [480, 1168, 2138, 1328], kerb: 'S' },
    { id: 'westAveS', kind: 'sidewalk', rect: [480, 1712, 2138, 1870], kerb: 'N' },
    { id: 'eastAveN', kind: 'sidewalk', rect: [2842, 2032, 4396, 2192], kerb: 'S' },
    { id: 'eastAveS', kind: 'sidewalk', rect: [2842, 2570, 4396, 2730], kerb: 'N' },
    { id: 'castleDrive', kind: 'path', rect: [1420, 620, 1548, 1168] },
    { id: 'castleForecourt', kind: 'path', rect: [940, 540, 1548, 620] },
    { id: 'bankLane', kind: 'path', rect: [2842, 1232, 3434, 1360] },
    { id: 'originPlaza', kind: 'plaza', rect: [3434, 1160, 4396, 1642] },
    { id: 'campusWalk', kind: 'path', rect: [3370, 1642, 3450, 2032] },
    { id: 'parkPath', kind: 'path', rect: [1646, 3130, 2138, 3258] },
    { id: 'dealerAlley', kind: 'path', rect: [2842, 3390, 3700, 3518] },
    { id: 'marginPath', kind: 'path', rect: [4140, 3730, 4260, 4000] },
  ];

  // The park's jog loop: a 64 u wide path ring (outer rounded rectangle, corner radius r).
  var JOG_LOOP = { id: 'jogLoop', kind: 'path', rect: [600, 2400, 1540, 3800], r: 160, w: 64 };

  var JUNCTIONS = [
    // Main is the through road of both T-junctions (GDD §3.10, B-22). exits[lane] lists the lanes a
    // car arriving on that lane may leave by, the straight-on lane first (Main only); no U-turns.
    { id: 'J1', kind: 'T', through: 'main', rect: [2308, 1328, 2670, 1712],
      exits: { mainS: ['mainS', 'westW'], mainN: ['mainN', 'westW'], westE: ['mainN', 'mainS'] } },
    { id: 'J2', kind: 'T', through: 'main', rect: [2308, 2192, 2670, 2570],
      exits: { mainS: ['mainS', 'eastE'], mainN: ['mainN', 'eastE'], eastW: ['mainN', 'mainS'] } },
  ];

  var ZEBRAS = [
    { id: 'j1n', rect: [2308, 1260, 2670, 1328] },
    { id: 'j1s', rect: [2308, 1712, 2670, 1780] },
    { id: 'j1w', rect: [2160, 1328, 2290, 1712] },
    { id: 'j2n', rect: [2308, 2124, 2670, 2192] },
    { id: 'j2s', rect: [2308, 2570, 2670, 2638] },
    { id: 'j2e', rect: [2690, 2192, 2820, 2570] },
    { id: 'mid', rect: [2308, 3190, 2670, 3258] },
  ];

  // Cars drop in at 'in' portals and tumble off at 'out' portals (GDD §3.10): Main N end spawns
  // southbound, Main S end northbound, West Ave W end eastbound, East Ave E end westbound.
  var PORTALS = [
    { lane: 'mainS', end: 'in', at: [2398, 656] }, { lane: 'mainS', end: 'out', at: [2398, 4100] },
    { lane: 'mainN', end: 'in', at: [2580, 4100] }, { lane: 'mainN', end: 'out', at: [2580, 656] },
    { lane: 'westE', end: 'in', at: [480, 1616] }, { lane: 'westW', end: 'out', at: [480, 1424] },
    { lane: 'eastW', end: 'in', at: [4396, 2286] }, { lane: 'eastE', end: 'out', at: [4396, 2476] },
  ];

  // ---------------------------------------------------------------------------------------------
  // Buildings (GDD §3.4). Masses: footprint rect [x0, y0, x1, y1] and height h (u, before the 0.5
  // projection). door.kerb: the point on the nearest drivable surface in front of the door, 22 u
  // inside it (parking, ARCHITECTURE §8.5); on the castle forecourt, the plaza and Edgeview Walk it
  // stands beside the door's trigger, so a parked car never sits in it. exterior: the painter's inputs (ART_AUDIO §5); `tops`
  // are tall roof features (sign, dome, dice, turrets) that stay inside the footprint but reach
  // higher; `signature` rects are in projected space (x, y - 0.5 z) and must stay uncovered.
  // `homes` lists a home door's tiers, cheapest first (B-08a).
  // ---------------------------------------------------------------------------------------------
  var BUILDINGS = [
    { id: 'home_apt', name: 'place.home_apt', orig: 'apartment',
      masses: [{ role: 'main', rect: [608, 784, 1404, 1040], h: 200 }],
      door: { face: 'S', x: 998, y: 1040, kerb: [998, 1350] }, homes: ['apt', 'apt2'],
      exterior: { archetype: 'house', palette: 'bld.home_apt', sign: 'place.sign.home_apt', detail: 'home_apt', roof: 'pitched', floors: 3 } },
    { id: 'home_castle', name: 'place.home_castle', orig: 'castle',
      masses: [{ role: 'main', rect: [940, 240, 1540, 540], h: 360 }],
      door: { face: 'S', x: 1240, y: 540, kerb: [1340, 590] }, homes: ['castle'],
      exterior: { archetype: 'castle', palette: 'bld.home_castle', sign: null, detail: 'home_castle', roof: 'crenel',
        tops: [{ kind: 'turret', rect: [940, 240, 1020, 320], h: 460 }, { kind: 'turret', rect: [1460, 240, 1540, 320], h: 460 },
          { kind: 'turret', rect: [940, 460, 1020, 540], h: 460 }, { kind: 'turret', rect: [1460, 460, 1540, 540], h: 460 }],
        signature: [[940, 360, 1540, 540]] } },
    { id: 'home_mansion', name: 'place.home_mansion', orig: 'mansion',
      masses: [{ role: 'main', rect: [1746, 700, 2138, 1064], h: 200 }],
      door: { face: 'E', x: 2138, y: 890, kerb: [2330, 890] }, homes: ['mansion'],
      exterior: { archetype: 'house', palette: 'bld.home_mansion', sign: 'place.sign.home_mansion', detail: 'home_mansion', roof: 'pitched' } },
    { id: 'bank', name: 'place.bank', orig: 'bank',
      masses: [{ role: 'main', rect: [2842, 656, 3434, 1232], h: 280 }],
      door: { face: 'W', x: 2842, y: 1135, kerb: [2648, 1135] },
      exterior: { archetype: 'hall', palette: 'bld.bank', sign: 'place.sign.bank', detail: 'bank', roof: 'flat',
        signature: [[2842, 1092, 3434, 1232]] } },
    { id: 'nli', name: 'place.nli', orig: 'nli',
      masses: [{ role: 'main', rect: [2842, 1360, 3370, 1970], h: 200 }, { role: 'tower', rect: [2930, 1600, 3370, 1970], h: 600 }],
      door: { face: 'W', x: 2842, y: 1640, kerb: [2648, 1640] },
      exterior: { archetype: 'tower', palette: 'bld.nli', sign: 'place.sign.nli', detail: 'nli', roof: 'flat',
        signature: [[3000, 1236, 3300, 1300]] } },
    { id: 'uofs', name: 'place.uofs', orig: 'uofs',
      masses: [{ role: 'main', rect: [3450, 1690, 4380, 2000], h: 220 }],
      door: { face: 'S', x: 3885, y: 2000, kerb: [3885, 2214] },
      exterior: { archetype: 'hall', palette: 'bld.uofs', sign: 'place.sign.uofs', detail: 'uofs', roof: 'flat',
        signature: [[3665, 1860, 4105, 1960]] } },
    { id: 'cityhall', name: 'place.cityhall', orig: null,
      masses: [{ role: 'main', rect: [3560, 720, 4120, 1160], h: 300 }],
      door: { face: 'S', x: 3840, y: 1160, kerb: [3910, 1222] },
      exterior: { archetype: 'hall', palette: 'bld.cityhall', sign: 'place.sign.cityhall', detail: 'cityhall', roof: 'dome',
        tops: [{ kind: 'dome', rect: [3720, 820, 3960, 1060], h: 420 }],
        signature: [[3560, 1010, 4120, 1160], [3720, 610, 3960, 1060]] } },
    { id: 'furniture', name: 'place.furniture', orig: 'furniture',
      masses: [{ role: 'main', rect: [640, 2016, 1428, 2262], h: 160 }, { role: 'annex', rect: [1090, 1920, 1390, 2016], h: 48 }],
      door: { face: 'N', x: 1240, y: 1920, kerb: [1240, 1690] },
      exterior: { archetype: 'shop', palette: 'bld.furniture', sign: 'place.sign.furniture', detail: 'furniture', roof: 'flat' } },
    { id: 'mcsticks', name: 'place.mcsticks', orig: 'mcsticks',
      masses: [{ role: 'main', rect: [1460, 1900, 2120, 2330], h: 160 }],
      door: { face: 'E', x: 2120, y: 2050, kerb: [2330, 2050] },
      exterior: { archetype: 'shop', palette: 'bld.mcsticks', sign: 'place.sign.mcsticks', detail: 'mcsticks', roof: 'flat',
        tops: [{ kind: 'sign', rect: [1690, 2080, 1890, 2130], h: 260 }],
        signature: [[1690, 1950, 1890, 2130]] } },
    { id: 'bar', name: 'place.bar', orig: 'bar',
      masses: [{ role: 'main', rect: [1646, 2384, 2100, 3088], h: 180 }],
      door: { face: 'E', x: 2100, y: 2537, kerb: [2330, 2537] },
      exterior: { archetype: 'shop', palette: 'bld.bar', sign: 'place.sign.bar', detail: 'bar', roof: 'flat' } },
    { id: 'casino', name: 'place.casino', orig: 'casino',
      masses: [{ role: 'main', rect: [1646, 3296, 2100, 4000], h: 260 }],
      door: { face: 'E', x: 2100, y: 3676, kerb: [2330, 3676] },
      exterior: { archetype: 'box', palette: 'bld.casino', sign: 'place.sign.casino', detail: 'casino', roof: 'flat',
        tops: [{ kind: 'dice', rect: [1760, 3560, 1990, 3740], h: 360 }],
        signature: [[1760, 3380, 1990, 3740]] } },
    { id: 'store', name: 'place.store', orig: 'store',
      masses: [{ role: 'main', rect: [2842, 2736, 3474, 3390], h: 160 }],
      door: { face: 'W', x: 2842, y: 3055, kerb: [2648, 3055] },
      exterior: { archetype: 'shop', palette: 'bld.store', sign: 'place.sign.store', detail: 'store', roof: 'flat' } },
    { id: 'pawn', name: 'place.pawn', orig: 'pawn',
      masses: [{ role: 'main', rect: [2842, 3518, 3444, 4088], h: 170 }],
      door: { face: 'W', x: 2842, y: 3681, kerb: [2648, 3681] },
      exterior: { archetype: 'box', palette: 'bld.pawn', sign: 'place.sign.pawn', detail: 'pawn', roof: 'flat' } },
    { id: 'bus', name: 'place.bus', orig: 'bus',
      masses: [{ role: 'main', rect: [3782, 2832, 4396, 3124], h: 180 }, { role: 'annex', rect: [3960, 2736, 4220, 2832], h: 48 }],
      door: { face: 'N', x: 4089, y: 2736, kerb: [4089, 2548] },
      exterior: { archetype: 'depot', palette: 'bld.bus', sign: 'place.sign.bus', detail: 'bus' } },
    { id: 'skybus', name: 'place.skybus', orig: 'bus', prop: true,
      masses: [{ role: 'main', rect: [3510, 2746, 3596, 3124], h: 70 }],
      door: null,
      exterior: { archetype: 'vehicle', palette: 'bld.skybus', sign: null, detail: 'skybus' } },
    { id: 'home_pent', name: 'place.home_pent', orig: null,
      masses: [{ role: 'main', rect: [3700, 3290, 4140, 3730], h: 120 }, { role: 'tower', rect: [3760, 3450, 4100, 3730], h: 520 }],
      door: { face: 'W', x: 3700, y: 3454, kerb: [3600, 3454] }, homes: ['pent'],
      exterior: { archetype: 'tower', palette: 'bld.home_pent', sign: 'place.sign.home_pent', detail: 'home_pent', roof: 'flat',
        signature: [[3760, 3470, 4100, 3520]] } },
  ];

  // Plaza and park features (GDD §3.3, §3.4). Solid ones block walking (GDD §3.8).
  var FEATURES = {
    fountain: { x: 3840, y: 1460, r: 90, solid: true },
    plinth: { rect: [3808, 1258, 3872, 1322], solid: true },
    pond: { x: 1000, y: 3000, rx: 220, ry: 150, solid: true },
    skateBowl: { rect: [1240, 2500, 1460, 2700] },
    duckSpot: [1240, 3000],
    chessTables: [[1240, 3480], [1340, 3480], [1290, 3560]],
    haroldBench: [760, 2620],
    buskerSpot: [1560, 3190],
    jogLoop: JOG_LOOP,
    bite: BITE,
    dogEar: { crease: [[480, 620], [860, 200]], flap: [[480, 620], [860, 200], [898, 578]] },
  };

  // Walkway links across lawns that join the jog loop and Margin Path to the sidewalk graph.
  var LINKS = [
    { id: 'parkLink', points: [[1710, 3194], [1508, 3194]] },
    { id: 'marginLink', points: [[3620, 3454], [3620, 3790], [4200, 3790]] },
  ];

  var PEOPLE = [
    { id: 'harold', x: 2160, y: 2440, spot: 'haroldCorner' },
    { id: 'kid', x: 2090, y: 1110, spot: 'kidCorner' },
    { id: 'dealer', path: [[2880, 3420], [2960, 3420]], spot: 'dealerAlley' },
  ];

  // Named places for people's schedules (data/people.js placeId). A building id as a placeId means
  // "inside, in the interior art" (GDD §6.2).
  var SPOTS = {
    haroldCorner: [2160, 2440], haroldBench: [760, 2620], kidCorner: [2090, 1110], skateBowl: [1350, 2600],
    dealerAlley: [2920, 3420], chessTables: [1290, 3520], pointMargin: [4120, 4200], lookout: [4210, 4330],
    precinctSteps: [3840, 1208], busker: [1560, 3190],
  };

  var INTERACTABLES = [
    { id: 'junker', kind: 'car', rect: [636, 1064, 818, 1162], p: 0 },
    // P1 walk-ups (W3-Park owns the actions; the spots are here so the geometry keeps them reachable).
    { id: 'lookout', kind: 'spot', x: 4210, y: 4330, r: 48, action: 'park.lookout', p: 1, feature: 'park' },
    { id: 'ducks', kind: 'spot', x: 1240, y: 3000, r: 48, action: 'park.ducks', p: 1, feature: 'park' },
    { id: 'chess', kind: 'spot', x: 1290, y: 3520, r: 64, action: 'park.chess', p: 1, feature: 'park' },
    { id: 'bench', kind: 'spot', x: 760, y: 2620, r: 48, action: 'park.bench', p: 1, feature: 'park' },
    { id: 'bowl', kind: 'spot', x: 1350, y: 2600, r: 96, action: 'park.skate', p: 1, feature: 'park' },
    { id: 'jog', kind: 'spot', x: 1508, y: 3100, r: 48, action: 'park.jog', p: 1, feature: 'park' },
    { id: 'preacher', kind: 'spot', x: 4120, y: 4200, r: 64, action: 'park.preacher', p: 1, feature: 'park' },
  ];

  var HOME_LOTS = { junker: [636, 1064, 818, 1162], sports: [1770, 1080, 1960, 1160] };

  // The six bus destinations float in the sky (parallax 0.15). x, y: offset in sky units from the
  // island's centre at parallax 1 (the painter scales by parallax); the Sky Ribbon runs from under
  // the Bus Hole to Port Eraser and Las Pegas (GDD §3.1, ART_AUDIO §4).
  var SKY_ISLANDS = [
    { city: 'crayonburg', x: -2300, y: -1500, scale: 0.5, parallax: 0.15 },
    { city: 'rustbelt', x: -2900, y: 200, scale: 0.45, parallax: 0.15 },
    { city: 'glitter', x: -2100, y: 2000, scale: 0.5, parallax: 0.15 },
    { city: 'gusty', x: 700, y: -2600, scale: 0.45, parallax: 0.15 },
    { city: 'eraser', x: 2900, y: 900, scale: 0.55, parallax: 0.15 },
    { city: 'pegas', x: 2500, y: 2300, scale: 0.5, parallax: 0.15 },
  ];
  var SKY_RIBBON = { from: [3672, 3124], to: ['eraser', 'pegas'] };

  // Theory of the Fold (GDD §6.9, P1): one Torn Scrap at each landmark of the sheet.
  var SCRAPS = [
    { n: 1, x: 720, y: 460, when: 'always' },
    { n: 2, x: 4180, y: 890, when: 'always' },
    { n: 3, x: 1060, y: 3810, when: 'dawn' },       // 04:00-07:00
    { n: 4, x: 4125, y: 4372, when: 'always' },
    { n: 5, x: 3672, y: 3190, when: 'fogOrRain' },
  ];

  // ---------------------------------------------------------------------------------------------
  // Seeded street furniture. A local integer hash keeps the layout identical on every load
  // (never the platform RNG; ARCHITECTURE §1). Rules (GDD §3.6, ART_AUDIO §6): lamps every 256 u on the
  // kerb side of sidewalks, trees on open lawns, nothing within 24 u of a porch, door trigger,
  // exit point, crossing, spot, scrap or link, and trees well away from edges and walls.
  // ---------------------------------------------------------------------------------------------
  var PROP_SEED = 0x5eed;

  function hash3(a, b, c) {
    var h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul((c | 0) + PROP_SEED, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  function rectDist(x, y, r) {
    var dx = x < r[0] ? r[0] - x : x > r[2] ? x - r[2] : 0;
    var dy = y < r[1] ? r[1] - y : y > r[3] ? y - r[3] : 0;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var qx = ax + t * dx - px, qy = ay + t * dy - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function inPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function polyEdgeDist(x, y, poly) {
    var d = Infinity;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, y, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
    return d;
  }
  function rectPoly(r) { return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; }

  var HOLES = [{ id: 'bushole', rect: [3599, 2752, 3746, 3124] }];

  /** Distance from (x, y) to the sheet's edge (outline or hole), railed or not. */
  function edgeDist(x, y) {
    var d = polyEdgeDist(x, y, OUTLINE);
    for (var i = 0; i < HOLES.length; i++) d = Math.min(d, polyEdgeDist(x, y, rectPoly(HOLES[i].rect)));
    return d;
  }

  /** The porch rect of a door (ARCHITECTURE §8.4): S step, E / W awning, N ground porch. */
  function porchOf(b) {
    var d = b.door, annexH = 0;
    b.masses.forEach(function (m) { if (m.role === 'annex') annexH = m.h; });
    if (d.face === 'S') return [d.x - 48, d.y, d.x + 48, d.y + 40];
    if (d.face === 'E') return [d.x, d.y - 48, d.x + 32, d.y + 48];
    if (d.face === 'W') return [d.x - 32, d.y - 48, d.x, d.y + 48];
    return [d.x - 48, d.y - (0.5 * annexH + 32), d.x + 48, d.y];
  }
  var NORMALS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  /** The door trigger (96 × 48, long side along the face, centred 24 u outside). */
  function triggerOf(d) {
    var n = NORMALS[d.face], cx = d.x + n[0] * 24, cy = d.y + n[1] * 24;
    return n[0] ? [cx - 24, cy - 48, cx + 24, cy + 48] : [cx - 48, cy - 24, cx + 48, cy + 24];
  }

  var DOORS = BUILDINGS.filter(function (b) { return b.door; });
  var PORCHES = DOORS.map(porchOf);
  var TRIGGERS = DOORS.map(function (b) { return triggerOf(b.door); });
  var EXITS = DOORS.map(function (b) { var n = NORMALS[b.door.face]; return [b.door.x + n[0] * 56, b.door.y + n[1] * 56]; });
  var MASS_RECTS = [];
  BUILDINGS.forEach(function (b) { b.masses.forEach(function (m) { MASS_RECTS.push(m.rect); }); });
  var WALK_RECTS = STREETS.map(function (s) { return s.rect; }).concat(ZEBRAS.map(function (z) { return z.rect; }), JUNCTIONS.map(function (j) { return j.rect; }));

  function inRoundRect(x, y, r, rad) {
    if (x < r[0] || x > r[2] || y < r[1] || y > r[3]) return false;
    var cx = x < r[0] + rad ? r[0] + rad : x > r[2] - rad ? r[2] - rad : x;
    var cy = y < r[1] + rad ? r[1] + rad : y > r[3] - rad ? r[3] - rad : y;
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad;
  }
  /** Distance from a point to the jog loop's ring (0 on it). */
  function jogDist(x, y) {
    var o = JOG_LOOP.rect, w = JOG_LOOP.w;
    var inner = [o[0] + w, o[1] + w, o[2] - w, o[3] - w];
    if (inRoundRect(x, y, o, JOG_LOOP.r) && !inRoundRect(x, y, inner, JOG_LOOP.r - w)) return 0;
    // Approximate distance: to the ring's centre line, minus half the width.
    var c = [o[0] + w / 2, o[1] + w / 2, o[2] - w / 2, o[3] - w / 2], rad = JOG_LOOP.r - w / 2;
    var qx = x < c[0] + rad ? c[0] + rad : x > c[2] - rad ? c[2] - rad : x;
    var qy = y < c[1] + rad ? c[1] + rad : y > c[3] - rad ? c[3] - rad : y;
    var dCorner = Math.sqrt((x - qx) * (x - qx) + (y - qy) * (y - qy));
    var cornerZone = (x < c[0] + rad || x > c[2] - rad) && (y < c[1] + rad || y > c[3] - rad);
    var dLine = cornerZone ? Math.abs(dCorner - rad) :
      Math.min(Math.abs(x - c[0]) + (y < c[1] || y > c[3] ? 1e6 : 0), Math.abs(x - c[2]) + (y < c[1] || y > c[3] ? 1e6 : 0),
        Math.abs(y - c[1]) + (x < c[0] || x > c[2] ? 1e6 : 0), Math.abs(y - c[3]) + (x < c[0] || x > c[2] ? 1e6 : 0));
    return Math.max(0, dLine - w / 2);
  }

  /** Distance from a point to the pond ellipse's rim (0 inside), approximated through its scaling. */
  function pondDist(x, y) {
    var p = FEATURES.pond, dx = (x - p.x) / p.rx, dy = (y - p.y) / p.ry, k = Math.sqrt(dx * dx + dy * dy);
    return k <= 1 ? 0 : (k - 1) * Math.min(p.rx, p.ry);
  }

  // Bus shelters at the kerb (ART_AUDIO §6; wanted posters go on them with Heat ≥ 50, GDD §3.14).
  var SHELTERS = [
    { type: 'shelter', x: 2282, y: 2900, a: 90, variant: 0 },
    { type: 'shelter', x: 900, y: 1300, a: 0, variant: 0 },
    { type: 'shelter', x: 3300, y: 2598, a: 0, variant: 0 },
  ];

  var KEEP_CLEAR = [];   // points props keep away from, [x, y, radius]
  SHELTERS.forEach(function (sh) { KEEP_CLEAR.push([sh.x, sh.y, 64]); });
  EXITS.forEach(function (e) { KEEP_CLEAR.push([e[0], e[1], 40]); });
  PEOPLE.forEach(function (p) { if (p.path) p.path.forEach(function (q) { KEEP_CLEAR.push([q[0], q[1], 60]); }); else KEEP_CLEAR.push([p.x, p.y, 60]); });
  Object.keys(SPOTS).forEach(function (k) { KEEP_CLEAR.push([SPOTS[k][0], SPOTS[k][1], 60]); });
  SCRAPS.forEach(function (s) { KEEP_CLEAR.push([s.x, s.y, 72]); });
  FEATURES.chessTables.forEach(function (c) { KEEP_CLEAR.push([c[0], c[1], 40]); });
  KEEP_CLEAR.push([FEATURES.duckSpot[0], FEATURES.duckSpot[1], 60], [FEATURES.fountain.x, FEATURES.fountain.y, FEATURES.fountain.r + 40]);

  function linkDist(x, y) {
    var d = Infinity;
    LINKS.forEach(function (l) {
      for (var i = 1; i < l.points.length; i++) d = Math.min(d, segDist(x, y, l.points[i - 1][0], l.points[i - 1][1], l.points[i][0], l.points[i][1]));
    });
    return d;
  }

  /** Whether a prop of radius r may stand at (x, y) (the shared clearance rules). */
  function clearForProp(x, y, r, nearJunction) {
    var i;
    for (i = 0; i < PORCHES.length; i++) if (rectDist(x, y, PORCHES[i]) < 24 + r) return false;
    for (i = 0; i < TRIGGERS.length; i++) if (rectDist(x, y, TRIGGERS[i]) < 24 + r) return false;
    for (i = 0; i < KEEP_CLEAR.length; i++) {
      var k = KEEP_CLEAR[i];
      if ((x - k[0]) * (x - k[0]) + (y - k[1]) * (y - k[1]) < (k[2] + r) * (k[2] + r)) return false;
    }
    for (i = 0; i < ZEBRAS.length; i++) if (rectDist(x, y, ZEBRAS[i].rect) < 40 + r) return false;
    if (!nearJunction) for (i = 0; i < JUNCTIONS.length; i++) if (rectDist(x, y, JUNCTIONS[i].rect) < 24 + r) return false;
    if (linkDist(x, y) < 40 + r) return false;
    return true;
  }

  var PROPS = SHELTERS.slice();

  // Lamps: every 256 u along the kerb side of each sidewalk, 12 u in from the kerb (a lamp may stand
  // beside a junction box, never beside a zebra); a gap left by a skipped lamp gets one in its middle.
  STREETS.forEach(function (s, si) {
    if (s.kind !== 'sidewalk') return;
    var r = s.rect, horiz = s.kerb === 'N' || s.kerb === 'S';
    var a0 = horiz ? r[0] : r[1], a1 = horiz ? r[2] : r[3];
    var fixed = s.kerb === 'E' ? r[2] - 12 : s.kerb === 'W' ? r[0] + 12 : s.kerb === 'S' ? r[3] - 12 : r[1] + 12;
    var n = Math.max(1, Math.round((a1 - a0) / 256));
    var step = (a1 - a0) / n, placed = [];
    var at = function (t) { return horiz ? [t, fixed] : [fixed, t]; };
    var lampOk = function (t) { var q = at(t); return edgeDist(q[0], q[1]) >= 80 && clearForProp(q[0], q[1], 6, true); };
    for (var k = 0; k <= n; k++) {
      var t = a0 + Math.max(24, Math.min(a1 - a0 - 24, k * step));
      var x = at(t)[0], y = at(t)[1];
      if (!lampOk(t)) continue;
      placed.push(t);
      PROPS.push({ type: 'lamp', x: Math.round(x), y: Math.round(y), variant: 0 });
      // A hydrant every third lamp gap, halfway to the next lamp.
      if (k < n && hash3(si, k, 7) < 0.34) {
        var t2 = t + step / 2, hx = horiz ? t2 : fixed, hy = horiz ? fixed : t2;
        if (edgeDist(hx, hy) >= 80 && clearForProp(hx, hy, 6)) PROPS.push({ type: 'hydrant', x: Math.round(hx), y: Math.round(hy), variant: 0 });
      }
    }
    for (var g = 1; g < placed.length; g++) {
      if (placed[g] - placed[g - 1] <= 1.5 * step) continue;
      for (var tries = 0; tries <= 8; tries++) {
        var mid = (placed[g - 1] + placed[g]) / 2 + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * 32;
        if (!lampOk(mid)) continue;
        var q = at(mid);
        PROPS.push({ type: 'lamp', x: Math.round(q[0]), y: Math.round(q[1]), variant: 0 });
        break;
      }
    }
  });

  // Lamps around Origin Plaza's rim (the promenade lights) and a few bins.
  [[3470, 1196], [3790, 1196], [4110, 1196], [4360, 1300], [4360, 1606], [4050, 1606], [3730, 1606], [3470, 1520]].forEach(function (p, i) {
    if (clearForProp(p[0], p[1], 6) && edgeDist(p[0], p[1]) >= 40) PROPS.push({ type: i % 3 === 2 ? 'bin' : 'lamp', x: p[0], y: p[1], variant: 0 });
  });

  // Road ends: a "ROAD ENDS. OBVIOUSLY." sawhorse beside each (ART_AUDIO §1.1), on the sidewalk.
  [[2292, 704], [2686, 4052], [528, 1316], [4348, 2582]].forEach(function (p) { PROPS.push({ type: 'sawhorse', x: p[0], y: p[1], variant: 0 }); });

  // The park: Harold's bench, benches every 400 u around the jog loop (outside it), chess tables,
  // and the Point Margin binoculars.
  PROPS.push({ type: 'bench', id: 'haroldBench', x: 760, y: 2620, a: 0, variant: 1 });
  FEATURES.chessTables.forEach(function (c, i) { PROPS.push({ type: 'chessTable', x: c[0], y: c[1], variant: i }); });
  PROPS.push({ type: 'binoculars', x: 4210, y: 4330, variant: 0 });
  (function jogBenches() {
    var o = JOG_LOOP.rect, off = 28;
    var runs = [
      { a: [o[0] + JOG_LOOP.r, o[1] - off], b: [o[2] - JOG_LOOP.r, o[1] - off], ang: 0 },
      { a: [o[2] + off, o[1] + JOG_LOOP.r], b: [o[2] + off, o[3] - JOG_LOOP.r], ang: 90 },
      { a: [o[2] - JOG_LOOP.r, o[3] + off], b: [o[0] + JOG_LOOP.r, o[3] + off], ang: 0 },
      { a: [o[0] - off, o[3] - JOG_LOOP.r], b: [o[0] - off, o[1] + JOG_LOOP.r], ang: 90 },
    ];
    runs.forEach(function (run) {
      var len = Math.abs(run.b[0] - run.a[0]) + Math.abs(run.b[1] - run.a[1]);
      for (var s = 200; s < len; s += 400) {
        var f = s / len, x = run.a[0] + (run.b[0] - run.a[0]) * f, y = run.a[1] + (run.b[1] - run.a[1]) * f;
        if (edgeDist(x, y) >= 80 && clearForProp(x, y, 24)) PROPS.push({ type: 'bench', x: Math.round(x), y: Math.round(y), a: run.ang, variant: 0 });
      }
    });
  })();

  // Trees: a jittered 176 u grid over open lawn, thinned by the hash.
  (function trees() {
    var G = 176;
    for (var gy = 0; gy * G < 4608; gy++) {
      for (var gx = 0; gx * G < 5120; gx++) {
        if (hash3(gx, gy, 1) > 0.8) continue;
        var x = gx * G + G / 2 + (hash3(gx, gy, 2) - 0.5) * 80;
        var y = gy * G + G / 2 + (hash3(gx, gy, 3) - 0.5) * 80;
        if (!inPoly(x, y, OUTLINE) || edgeDist(x, y) < 80) continue;
        if (inPoly(x, y, FEATURES.dogEar.flap)) continue;
        var ok = true, i;
        for (i = 0; i < MASS_RECTS.length && ok; i++) if (rectDist(x, y, MASS_RECTS[i]) < 64) ok = false;
        for (i = 0; i < WALK_RECTS.length && ok; i++) if (rectDist(x, y, WALK_RECTS[i]) < 36) ok = false;
        if (!ok || jogDist(x, y) < 40 || pondDist(x, y) < 48 || rectDist(x, y, FEATURES.skateBowl.rect) < 48) continue;
        if (rectDist(x, y, HOME_LOTS.junker) < 60 || rectDist(x, y, HOME_LOTS.sports) < 60) continue;
        if (!clearForProp(x, y, 40)) continue;
        for (i = 0; i < PROPS.length && ok; i++) {
          var q = PROPS[i];
          if ((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) < 80 * 80) ok = false;
        }
        if (!ok) continue;
        PROPS.push({ type: 'tree', x: Math.round(x), y: Math.round(y), variant: Math.floor(hash3(gx, gy, 4) * 3) });
      }
    }
  })();

  SR.def.worldmap({
    size: { w: 5120, h: 4608 },
    // Original map → world: X = 2x + 2560, Y = 2y + 2304 (GDD §3.2; documentation and tests).
    transform: { sx: 2, sy: 2, ox: 2560, oy: 2304 },
    outline: OUTLINE,
    // Land the original never had (GDD §2.5), and the original's sky pockets the sheet now fills.
    newLand: [{ id: 'castleRim', rect: [480, 200, 1746, 784] }],
    pockets: [
      { id: 'civicPlaza', rects: [[3434, 656, 4396, 1642]] },
      { id: 'stickwoodPark', rects: [[480, 2262, 1646, 4100]] },
      { id: 'edgeview', rects: [[3444, 3124, 4396, 4000], [4060, 4000, 4300, 4440]] },
    ],
    holes: HOLES,
    railings: [{ a: [3434, 656], b: [4228, 656] }, { a: [4396, 840], b: [4396, 1642] }],
    walls: [{ a: [860, 210], b: [1746, 210], w: 20 }, { a: [1736, 200], b: [1736, 656], w: 20 }],
    streets: STREETS,
    jogLoop: JOG_LOOP,
    junctions: JUNCTIONS,
    zebras: ZEBRAS,
    portals: PORTALS,
    links: LINKS,
    buildings: BUILDINGS,
    features: FEATURES,
    props: PROPS,
    people: PEOPLE,
    spots: SPOTS,
    interactables: INTERACTABLES,
    homeLots: HOME_LOTS,
    skyIslands: SKY_ISLANDS,
    skyRibbon: SKY_RIBBON,
    scraps: SCRAPS,
    // newGame and afterHospital name a door or 'homeDoor' (the door of the home you live in);
    // afterJail is a point (the City Hall steps, where the Precinct desk is).
    spawn: { newGame: 'home_apt', afterJail: [3840, 1208], afterHospital: 'homeDoor' },
  });
})();
