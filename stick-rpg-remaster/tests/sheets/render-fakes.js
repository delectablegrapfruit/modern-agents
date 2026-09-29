// tests/sheets/render-fakes.js — owner: W1-G. Test-only fakes and helpers for the render sheets
// (tests/sheets/render.html, tests/sheets/exteriors.html) and tests/e2e/render.test.cjs. Loaded
// after the game scripts and before SR.boot (CONTRACT D27): it installs only what has not landed
// yet (place and sign names while js/data/text/en-world.js is a stub) and defines the stub actors
// of the perf test (40 walkers, 14 cars). Never loaded by index.html.
(function () {
  'use strict';
  var SR = window.SR;

  // Place names and sign lettering (GDD §3.4) until en-world.js (W1-W) registers them.
  var NAMES = {
    home_apt: ['Paperview Apartments', 'PAPERVIEW'], home_castle: ['The Castle', 'THE CASTLE'],
    home_mansion: ['Hillcrest Mansion', 'HILLCREST'], bank: ['Bank of the 2nd Dimension', 'BANK'],
    nli: ['New Lines Inc.', 'NEW LINES INC.'], uofs: ['University of Stick', 'U of S'], cityhall: ['City Hall', 'CITY HALL'],
    furniture: ['Fine Line Furnishings', 'FINE LINE FURNISHINGS'], mcsticks: ['McSticks', 'McSTICKS'],
    bar: ["Sticky's", "STICKY'S"], casino: ['Silver Lining Casino', 'SILVER LINING'], store: ['Funkytown Five-O', 'FIVE-O'],
    pawn: ['Pawn Shop', 'PAWN'], bus: ['Bus Depot', 'BUS DEPOT'], skybus: ['The Sky Bus', 'SKY BUS'], home_pent: ['Edgeview Tower', 'EDGEVIEW'],
  };
  var add = {};
  Object.keys(NAMES).forEach(function (id) {
    if (!SR.reg.text['place.' + id]) add['place.' + id] = NAMES[id][0];
    if (!SR.reg.text['place.sign.' + id]) add['place.sign.' + id] = NAMES[id][1];
  });
  if (Object.keys(add).length) SR.def.text(add);

  function q(name) {
    var m = new RegExp('[?&]' + name + '(=([^&#]*))?').exec(location.search);
    return m ? (m[2] === undefined ? '' : decodeURIComponent(m[2])) : null;
  }

  // Stub actors (BUILD_PLAN §3.8: the perf test's 40 walkers and 14 cars), driven by loop time.
  // opts.follow: they keep within the current view (walkers on the sidewalks and crossings in view,
  // cars in the lanes in view), so every one of them is drawn each frame.
  function stubActors(nPeds, nCars, opts) {
    opts = opts || {};
    var wm = SR.reg.worldmap.main;
    var walks = wm.streets.filter(function (s) { return s.kind === 'sidewalk'; });
    var lanes = [];
    wm.streets.forEach(function (s) { (s.lanes || []).forEach(function (l) { lanes.push({ street: s, lane: l }); }); });
    var peds = [], cars = [];
    for (var i = 0; i < nPeds; i++) {
      var s = walks[i % walks.length], r = s.rect, vert = r[3] - r[1] > r[2] - r[0];
      peds.push({ id: 'ped' + i, n: i, vert: vert, r: r, off: (i * 0.618) % 1, speed: 90 + (i * 7) % 50,
        lat: 0.25 + ((i * 0.37) % 0.5), x: 0, y: 0, facing: 'down', moving: true, phase: i * 0.13 });
    }
    for (var c = 0; c < nCars; c++) {
      var ln = lanes[c % lanes.length], rr = ln.street.rect, ax = ln.lane.axis;
      cars.push({ id: 'car' + c, lane: ln.lane.id, kind: ['compact', 'sedan', 'taxi', 'van', 'police'][c % 5], ax: ax, dir: ln.lane.dir,
        at: ln.lane.at, a0: ax === 'y' ? rr[1] : rr[0], a1: ax === 'y' ? rr[3] : rr[2], off: (c * 0.381) % 1, speed: 360 + (c * 11) % 160, x: 0, y: 0, a: 0 });
    }
    function t() { return SR.loop && typeof SR.loop.time === 'number' ? SR.loop.time : performance.now() / 1000; }
    function viewRect() { var v = SR.render.lastView(); return [v.x0 + 40, v.y0 + 60, v.x1 - 40, v.y1 - 20]; }
    SR.render.actors.source('stubPeds', function () {
      var now = t(), vr = opts.follow ? viewRect() : null;
      peds.forEach(function (p, i) {
        var len = p.vert ? p.r[3] - p.r[1] : p.r[2] - p.r[0];
        var u = ((p.off * len + now * p.speed) % (2 * len));
        var back = u > len;
        var d = back ? 2 * len - u : u;
        if (p.vert) { p.x = p.r[0] + (p.r[2] - p.r[0]) * p.lat; p.y = p.r[1] + d; p.facing = back ? 'up' : 'down'; }
        else { p.y = p.r[1] + (p.r[3] - p.r[1]) * p.lat; p.x = p.r[0] + d; p.facing = back ? 'left' : 'right'; }
        if (vr) {
          // Spread over the view in a jittered grid, strolling in place.
          var gx = i % 8, gy = Math.floor(i / 8);
          p.x = vr[0] + (vr[2] - vr[0]) * (gx + 0.5) / 8 + Math.sin(now * 0.8 + i) * 20;
          p.y = vr[1] + (vr[3] - vr[1]) * (gy + 0.5) / Math.ceil(peds.length / 8) + Math.cos(now * 0.6 + i) * 12;
          p.facing = ['down', 'left', 'right', 'up'][i % 4];
        }
      });
      return peds;
    }, 'stick');
    SR.render.actors.source('stubCars', function () {
      var now = t(), vr = opts.follow ? viewRect() : null;
      cars.forEach(function (c, i) {
        var len = c.a1 - c.a0;
        var u = (c.off * len + now * c.speed) % len;
        var s = c.dir > 0 ? c.a0 + u : c.a1 - u;
        if (vr) {
          var span = c.ax === 'y' ? vr[3] - vr[1] : vr[2] - vr[0];
          var base = c.ax === 'y' ? vr[1] : vr[0];
          s = base + ((c.off * span + now * c.speed * 0.3 + i * 97) % span);
        }
        if (c.ax === 'y') { c.x = vr ? SR.render.lastView().x + (c.dir > 0 ? -91 : 91) : c.at; c.y = s; c.a = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { c.y = vr ? SR.render.lastView().y + (c.dir > 0 ? 95 : -95) : c.at; c.x = s; c.a = c.dir > 0 ? 0 : Math.PI; }
      });
      return cars;
    }, 'car');
    return { peds: peds, cars: cars };
  }

  window.RenderSheet = { q: q, stubActors: stubActors, NAMES: NAMES };
})();
