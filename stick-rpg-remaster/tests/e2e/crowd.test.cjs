// tests/e2e/crowd.test.cjs — owner: W2-City. The pedestrians of GDD §3.11 / BALANCE B-22 in the real
// page (index.html over file://), driven through SR.world with the loop paused (BUILD_PLAN §4.1):
// counts by the hour table × the pinned preset's crowd factor (and × 0.5 in rain with `weather`),
// walkers on sidewalks, paths and plazas crossing roads only on zebras, pausing at shop windows,
// busking only in the park and on the plaza, recycled out of view and respawned near the camera,
// giving way to the player on foot, hopping aside from the player's car with no HP, karma or Heat
// change; P1 reactions and barks behind `cityReacts`; zero console errors.
//   node tests/e2e/crowd.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-City');

(async () => {
  const T = h.suite('e2e crowd (W2-City)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);

  await ev(() => {
    const SR = window.SR;
    window.W2C = {
      city(seed, patch) {
        SR.debug.newGame({ seed: seed || 11 });
        if (patch) SR.debug.set(patch);
        SR.debug.goto('city');
        return SR.state;
      },
      run(sec) { for (let i = 0; i < Math.round(sec * 60); i++) SR.world.update(1 / 60, { x: 0, y: 0, skate: false }); },
    };
  });

  // ------------------------------------------------------------------------------------------------
  T.section('counts by the hour (B-22) × the preset\'s crowd factor');
  const counts = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, X = window.W2C, out = [];
    X.city(12);
    W.teleport(2220, 1900);
    [[480, 18], [720, 26], [1140, 30], [1380, 12], [60, 12], [240, 4]].forEach(([min, want]) => {
      // Out of a building after some hours: the city fills the street afresh for the new hour.
      SR.debug.goto('title');
      SR.debug.setTime(min);
      SR.debug.goto('city');
      W.teleport(2220, 1900);
      X.run(4);
      out.push({ min, want, target: PD.target(), live: PD.list.length });
    });
    return out;
  });
  counts.forEach((c) => T.ok(c.target === c.want && c.live === c.want, SRtime(c.min) + ': ' + c.live + ' walkers around the camera (the table says ' + c.want + ')', c));
  const low = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, X = window.W2C;
    SR.quality.set('low');
    SR.debug.setTime(720);
    PD.invalidate();
    X.run(4);
    const r = { preset: SR.quality.preset, crowd: SR.quality.params.crowd, target: PD.target(), live: PD.list.length };
    SR.quality.set('high');
    X.run(8);
    r.back = PD.list.length;                 // more walkers come in from off screen at once
    return r;
  });
  T.ok(low.crowd === 0.5 && low.target === 13 && low.live === 13 && low.back === 26, 'Low preset (crowd × 0.5): 13 at noon; back on High: 26', low);
  const rain = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, X = window.W2C;
    SR.debug.feature('weather', true);
    SR.debug.set({ world: { weather: 'rain' } });
    PD.invalidate();
    X.run(4);
    const r = { target: PD.target(), live: PD.list.length };
    SR.debug.set({ world: { weather: 'clear' } });
    SR.debug.feature('weather', false);
    X.run(8);
    return r;
  });
  T.ok(rain.target === 13 && rain.live === 13, 'rain halves the crowd (flag weather): 13 at noon', rain);

  // ------------------------------------------------------------------------------------------------
  T.section('where they walk: sidewalks, paths and plazas; roads only on zebras');
  const walk = await ev(() => {
    const SR = window.SR, W = SR.world, G = W.geometry, PD = W.pedestrians, X = window.W2C;
    X.city(13);
    SR.debug.setTime(720);
    const spots = [[2220, 1900], [2760, 1500], [3900, 1500], [1100, 3000], [3000, 3450], [900, 1250]];
    const bad = [], surfaces = {}, archs = {};
    let samples = 0, crossing = 0, pausedAtShop = 0, buskers = 0, buskerOut = 0;
    spots.forEach((sp) => {
      W.teleport(sp[0], sp[1]);
      for (let i = 0; i < 60 * 40; i++) {
        W.update(1 / 60, { x: 0, y: 0, skate: false });
        if (i % 10) continue;
        PD.list.forEach((p) => {
          samples++;
          archs[p.arch] = (archs[p.arch] || 0) + 1;
          const s = G.surfaceAt(p.x, p.y);
          surfaces[s] = (surfaces[s] || 0) + 1;
          if (s === 'asphalt') { if (p.zebra || G.zebraAt(p.x, p.y)) crossing++; if (!p.zebra && !G.zebraAt(p.x, p.y) && p.hopT <= 0) bad.push([p.id, Math.round(p.x), Math.round(p.y), p.mode]); }
          if (s === 'sky' || s === 'hole') bad.push([p.id, Math.round(p.x), Math.round(p.y), s]);
          if (p.mode === 'pause' && !p.busker && SR.world.geometry.doors.some((d) => !d.homes && Math.hypot(d.x - p.x, d.y - p.y) < 200)) pausedAtShop++;
          if (p.busker) {
            buskers++;
            const park = G.map.pockets.find((q) => q.id === 'stickwoodPark').rects[0], plaza = G.map.streets.find((q) => q.id === 'originPlaza').rect;
            if (!G.util.inRect(p.x, p.y, park) && !G.util.inRect(p.x, p.y, plaza)) buskerOut++;
          }
        });
      }
    });
    return { samples, bad: bad.slice(0, 10), nBad: bad.length, surfaces, crossing, pausedAtShop, buskers, buskerOut, archs, crossed: PD.stats.crossed };
  });
  T.ok(walk.samples > 20000 && walk.nBad === 0, 'no walker ever stands on a road off a zebra, or in the sky (' + walk.samples + ' samples)', walk.bad);
  T.ok(walk.crossing > 0 && walk.crossed > 10, 'they cross roads on zebras (' + walk.crossed + ' crossings)');
  T.ok((walk.surfaces.sidewalk || 0) > walk.samples * 0.5, 'most of them walk the sidewalks', walk.surfaces);
  T.ok(walk.pausedAtShop > 0, 'they pause at shop windows');
  T.ok(walk.buskerOut === 0, 'buskers play only in the park and on the plaza (' + walk.buskers + ' busker samples)');
  T.ok(['office', 'student', 'jogger', 'tourist', 'shopper', 'busker'].every((a) => walk.archs[a] > 0), 'the day\'s archetypes are all out', walk.archs);

  T.section('the night owls; the look of each archetype');
  const night = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, X = window.W2C;
    SR.debug.setTime(1380);
    W.teleport(2220, 1900);
    PD.invalidate();
    X.run(10);
    const archs = {};
    PD.list.forEach((p) => { archs[p.arch] = (archs[p.arch] || 0) + 1; });
    const looks = PD.list.map((p) => ({ arch: p.arch, acc: p.look.acc, head: p.look.head }));
    const lookWarn = [];
    looks.forEach((l) => { try { SR.art.stick.look(l); } catch (e) { lookWarn.push(e.message); } });
    return { archs, sample: looks.slice(0, 4), lookWarn, headsNeutral: looks.every((l) => /^npc\./.test(l.head)) };
  });
  T.ok((night.archs.nightowl || 0) > 0 && !night.archs.office, 'at 23:00 the night owls (glow sticks) are out and the office sticks home', night.archs);
  T.ok(night.headsNeutral && night.lookWarn.length === 0, 'heads come from the neutral list, never the karma palette; every look resolves on the rig', night.sample);

  // ------------------------------------------------------------------------------------------------
  T.section('recycled out of view, respawned near the camera');
  const recycle = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, X = window.W2C;
    SR.debug.setTime(720);
    W.teleport(2220, 1900);
    X.run(6);
    const before = PD.stats.recycled;
    W.teleport(3600, 3500);
    X.run(10);
    const cam = W.camera, far = PD.list.filter((p) => Math.abs(p.x - cam.x) > 1100 || Math.abs(p.y - cam.y) > 900);
    // New walkers appear out of view (the first fill after a jump is the only exception).
    const z = cam.zoom, hw = 640 / z, hh = 360 / z;
    const inView = () => PD.list.filter((p) => Math.abs(p.x - cam.x) < hw && Math.abs(p.y - cam.y) < hh).map((p) => p.id);
    const seen = new Set(inView());
    let popped = 0;
    for (let i = 0; i < 60 * 20; i++) {
      W.update(1 / 60, { x: 0, y: 0, skate: false });
      PD.list.forEach((p) => { if (!seen.has(p.id) && Math.abs(p.x - cam.x) < hw - 40 && Math.abs(p.y - cam.y) < hh - 40) popped++; seen.add(p.id); });
    }
    return { recycled: PD.stats.recycled - before, far: far.length, live: PD.list.length, target: PD.target(), popped };
  });
  T.ok(recycle.recycled >= 20 && recycle.far === 0 && recycle.live === recycle.target, 'a jump across the city recycles the walkers left behind and refills around the camera', recycle);
  T.eq(recycle.popped, 0, 'nobody pops into view: new walkers appear off screen');

  // ------------------------------------------------------------------------------------------------
  T.section('the player on foot and in a car');
  const people = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, P = W.player, X = window.W2C;
    X.city(14, { player: { cars: { junker: { owned: true, x: 2223, y: 2400, a: -Math.PI / 2, towed: false } } } });
    SR.debug.setTime(720);
    W.teleport(2223, 2460);
    X.run(4);
    // On foot: walkers give way; the player is never pushed.
    const p = PD.list[0];
    p.x = P.x + 4; p.y = P.y; p.mode = 'pause'; p.t = 30;
    const px0 = P.x, py0 = P.y;
    W.update(1 / 60, { x: 0, y: 0, skate: false });
    const gave = Math.hypot(p.x - P.x, p.y - P.y), still = P.x === px0 && P.y === py0;
    // In the car: drive north up the Main W sidewalk through the crowd.
    P.board('junker', true);
    const s0 = { hp: SR.state.stats.hp, karma: SR.state.stats.karma, heat: SR.state.stats.heat };
    const hops0 = P.hops;
    // Park walkers ahead on the car's way.
    PD.list.slice(1, 6).forEach((q, i) => { q.x = 2223 + (i % 2 ? 6 : -6); q.y = 2300 - i * 70; q.mode = 'pause'; q.t = 30; q.hopT = 0; });
    let states = new Set(), barks = new Set(), under = 0;
    for (let i = 0; i < 90; i++) {
      W.update(1 / 60, { x: 0, y: -1, skate: false });
      PD.list.forEach((q) => { if (q.state === 'hop') { states.add(q.id); if (q.bark) barks.add(q.bark); } if (Math.hypot(q.x - P.x, q.y - P.y) < 12) under++; });
    }
    const s1 = { hp: SR.state.stats.hp, karma: SR.state.stats.karma, heat: SR.state.stats.heat };
    X.run(3);
    const settled = PD.list.filter((q) => q.state === 'hop').length;
    return { gave, still, hops: P.hops - hops0, hopped: states.size, barks: Array.from(barks), same: JSON.stringify(s0) === JSON.stringify(s1), under, settled, drove: 2400 - P.y };
  });
  T.ok(people.still && people.gave >= 20, 'on foot, walkers give way (the player is never pushed)', people);
  T.ok(people.drove > 200 && people.hopped >= 3 && people.barks.indexOf('toast.world.hey') >= 0, 'driving through the crowd makes people hop aside with a "Hey!" (' + people.hopped + ' hopped)', people);
  T.ok(people.same && people.under === 0, 'your car never hurts anyone: no HP, karma or Heat change');
  T.eq(people.settled, 0, 'the hop and its bark wear off, and they walk on');

  // ------------------------------------------------------------------------------------------------
  T.section('P1 reactions and barks (flag cityReacts)');
  const react = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, P = W.player, X = window.W2C;
    X.city(15);
    SR.debug.setTime(720);
    W.teleport(2223, 2460);
    X.run(3);
    const off = { waved: PD.stats.waved, barks: PD.stats.barks };
    X.run(8);
    const offAfter = { waved: PD.stats.waved, barks: PD.stats.barks };
    SR.debug.feature('cityReacts', true);
    SR.debug.set({ stats: { karma: 80 } });
    const w0 = PD.stats.waved, b0 = PD.stats.barks;
    const times = [];
    let last = PD.lastBark;
    for (let i = 0; i < 60 * 30; i++) {
      // Walk up and down the sidewalk among the crowd.
      W.update(1 / 60, { x: 0, y: (Math.floor(i / 240) % 2 ? 1 : -1), skate: false });
      if (PD.lastBark !== last) { last = PD.lastBark; times.push(last.t); }
    }
    const waved = PD.stats.waved - w0, barks = PD.stats.barks - b0;
    const gaps = times.slice(1).map((x, i) => x - times[i]);
    const keys = new Set();
    SR.debug.set({ stats: { karma: -80 } });
    W.teleport(2223, 2460);
    X.run(1);
    // Five walkers set off from the graph nodes nearest the player, toward the player.
    const g = W.geometry.graph, near = g.nodes.map((n) => [n.id, Math.hypot(n.x - P.x, n.y - P.y)]).filter((q) => q[1] < 230).sort((a, b) => a[1] - b[1]);
    const walkers = PD.list.slice(0, Math.min(5, near.length));
    walkers.forEach((p, i) => {
      const n = g.nodes[near[i][0]];
      p.x = n.x; p.y = n.y; p.node = n.id; p.from = -1; p.mode = 'walk'; p.state = 'walk'; p.flee = false; p.zebra = null; p.hopT = 0;
      p.next = g.adj[n.id].slice().sort((a, b) => Math.hypot(g.nodes[a].x - P.x, g.nodes[a].y - P.y) - Math.hypot(g.nodes[b].x - P.x, g.nodes[b].y - P.y))[0];
    });
    const d0 = walkers.map((p) => Math.hypot(p.x - P.x, p.y - P.y));
    X.run(2);
    let away = 0, total = walkers.length;
    walkers.forEach((p, k) => { if (Math.hypot(p.x - P.x, p.y - P.y) > d0[k]) away++; });
    if (PD.lastBark) keys.add(PD.lastBark.key);
    SR.debug.feature('cityReacts', false);
    return { off, offAfter, waved, barks, minGap: gaps.length ? Math.min.apply(null, gaps) : null, away, total, keys: Array.from(keys) };
  });
  T.eq([react.offAfter.waved - react.off.waved, react.offAfter.barks - react.off.barks], [0, 0], 'with the flag off nobody waves or barks (P0)');
  T.ok(react.waved > 0 && react.barks >= 3, 'with cityReacts at karma +80: people wave (' + react.waved + ') and bark (' + react.barks + ')', react);
  T.ok(react.minGap === null || react.minGap >= 3.99, 'at most one bark every 4 s (shortest gap ' + react.minGap + ' s)');
  T.ok(react.total >= 3 && react.away === react.total, 'at karma -80 people near you turn and step away (' + react.away + ' of ' + react.total + ')', react);
  const react2 = await ev(() => {
    const SR = window.SR, W = SR.world, PD = W.pedestrians, P = W.player, X = window.W2C, g = W.geometry.graph, idle = { x: 0, y: 0, skate: false };
    X.city(17);
    SR.debug.setTime(720);
    SR.debug.feature('cityReacts', true);
    SR.debug.set({ stats: { karma: -80 } });
    W.teleport(2223, 2460);
    X.run(1);
    // One in five scurries: the roll is once per encounter, not once a step. Each trial sets a
    // walker off 40-90 u from you and watches it for half a second (it stays in reach meanwhile).
    const zebra = new Set(g.edges.filter((e) => e[2]).map((e) => e[0] + ':' + e[1]));
    const near = g.nodes.filter((n) => { const d = Math.hypot(n.x - P.x, n.y - P.y); return d > 40 && d < 90; });
    let trials = 0, fled = 0;
    for (let i = 0; i < 400; i++) {
      const p = PD.list[i % PD.list.length], n = near[i % near.length];
      const next = g.adj[n.id].find((a) => !zebra.has(n.id + ':' + a) && !zebra.has(a + ':' + n.id));
      if (next === undefined) continue;
      Object.assign(p, { x: n.x, y: n.y, node: n.id, from: -1, next, mode: 'walk', state: 'walk', flee: false, shy: false, zebra: null, zebraAt: null, hopT: 0 });
      let ever = false;
      for (let k = 0; k < 30; k++) { W.update(1 / 60, idle); if (p.flee) ever = true; }
      trials++;
      if (ever) fled++;
    }
    // Bumped: a walker you walk into barks a "bumped" line (the nearest one barks next).
    SR.debug.set({ stats: { karma: 0 } });
    const b = PD.list[0];
    let key = null;
    for (let k = 0; k < 60 * 5 && !key; k++) {
      Object.assign(b, { x: P.x + 4, y: P.y, mode: 'pause', state: 'pause', t: 30, hopT: 0 });
      const before = PD.lastBark;
      W.update(1 / 60, idle);
      if (PD.lastBark !== before && PD.lastBark && PD.lastBark.id === b.id) key = PD.lastBark.key;
    }
    // The reactions' karma threshold is tuning.karma.crowd (±50, B-04).
    const th = SR.tuning.karma.crowd;
    SR.tuning.karma.crowd = 90;
    SR.debug.set({ stats: { karma: 80 } });
    PD.list.forEach((p) => { p.waved = false; });
    const w0 = PD.stats.waved;
    X.run(3);
    const wavedAt90 = PD.stats.waved - w0;
    SR.tuning.karma.crowd = th;
    const w1 = PD.stats.waved;
    X.run(3);
    const wavedAt50 = PD.stats.waved - w1;
    SR.debug.feature('cityReacts', false);
    return { trials, fled, share: fled / trials, key, th, wavedAt90, wavedAt50 };
  });
  T.ok(react2.trials >= 300 && Math.abs(react2.share - 0.2) <= 0.06, 'one in five scurries (' + react2.fled + ' of ' + react2.trials + ' walkers in reach)', react2);
  T.ok(/^bark\.ped\.bumped\.[123]$/.test(react2.key || ''), 'someone you walk into barks a "bumped" line (' + react2.key + ')');
  T.ok(react2.th === 50 && react2.wavedAt90 === 0 && react2.wavedAt50 > 0, 'the wave threshold is tuning.karma.crowd: nobody waves at +80 when it reads 90, people do at 50', react2);

  // ------------------------------------------------------------------------------------------------
  T.section('screenshots');
  await ev(() => { const SR = window.SR, X = window.W2C; X.city(16); SR.debug.setTime(840); SR.world.teleport(3900, 1450); X.run(6); SR.render.warm(); if (SR.ui.toast.clear) SR.ui.toast.clear(); });
  await t.step(1);
  await t.step(100);
  await t.shot(path.join(SHOTS, 'crowd-plaza-afternoon.png'));
  await ev(() => { const SR = window.SR, X = window.W2C; SR.debug.setTime(1320); SR.world.teleport(2220, 2500); X.run(6); SR.render.warm(); if (SR.ui.toast.clear) SR.ui.toast.clear(); });
  await t.step(1);
  await t.step(100);
  await t.shot(path.join(SHOTS, 'crowd-main-night.png'));

  T.section('result');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });

function SRtime(min) { const h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
