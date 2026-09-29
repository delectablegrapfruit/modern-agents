// tests/e2e/traffic.test.cjs — owner: W2-City. The cars of GDD §3.10 / BALANCE B-22 in the real page
// (index.html over file://), driven through SR.world with the loop paused (BUILD_PLAN §4.1):
// the lane network (every in-portal reaches an out-portal, the T-junction odds, no U-turns), a
// 30-minute soak at ×8 (no stuck or overlapping cars, never more than 14, drop-ins at the road
// ends and tumbles off the far ends, walkers on zebras never touched), the notice formula
// clamp(0.55 + karma/250, 0.2, 0.95) by Monte Carlo (±3 %) on a scripted player in a lane, a car
// hit (-10 HP, the 1.14 s knockdown, a voicemail the next morning), zebras always stopping cars,
// Pedestrian Supremacy, skid marks only after an emergency stop (fading over 8 s), a crash of the
// player's car (-5 HP, both bounce), drivers braking for your car crossing their lane, a hit at
// 10 HP reaching the hospital (Standard) or death (Hardcore), the cars' and walkers' ARCHITECTURE
// §8.2 fields, no drop-in onto you or your parked car, and zero console errors.
//   node tests/e2e/traffic.test.cjs
'use strict';
const path = require('path');
const h = require('../harness.cjs');

const SHOTS = path.join(h.ROOT, 'shots', 'W2-City');

(async () => {
  const T = h.suite('e2e traffic (W2-City)');
  const t = await h.open({ fast: true });
  const { page } = t;
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // ------------------------------------------------------------------------------------------------
  T.section('the lane network');
  const netw = await ev(() => {
    const SR = window.SR, TR = SR.world.traffic, n = TR.net();
    const byIn = {};
    Object.keys(n.byIn).forEach((l) => { byIn[l] = n.byIn[l].reduce((a, r) => a + r.prob, 0); });
    const G = SR.world.geometry, map = G.map;
    const outs = map.portals.filter((p) => p.end === 'out').map((p) => p.at);
    const ends = TR.routes().map((r) => r.end);
    const reachOut = TR.routes().every((r) => outs.some((o) => Math.hypot(o[0] - r.end[0], o[1] - r.end[1]) < 1));
    // No U-turn: a route never runs a lane's street back the way it came.
    const uturn = TR.routes().some((r) => {
      for (let i = 1; i < r.head.length; i++) { const d = Math.abs(((r.head[i] - r.head[i - 1] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (d > 1.6) return true; }
      return false;
    });
    const stopsOrdered = TR.routes().every((r) => r.stops.every((s, i) => s.s < s.exit && (i === 0 || r.stops[i - 1].exit < s.s)));
    const eachInHasRoutes = map.portals.filter((p) => p.end === 'in').every((p) => (n.byIn[p.lane] || []).length > 0);
    const everyOutUsed = outs.every((o) => ends.some((e) => Math.hypot(o[0] - e[0], o[1] - e[1]) < 1));
    return { routes: TR.routes().length, byIn, reachOut, uturn, stopsOrdered, eachInHasRoutes, everyOutUsed,
      keys: TR.routes().map((r) => r.key), junctions: n.junctions.map((j) => j.id) };
  });
  T.eq(netw.routes, 12, 'twelve routes from the four road ends (' + netw.keys.join(', ') + ')');
  T.ok(netw.eachInHasRoutes && netw.reachOut && netw.everyOutUsed, 'every in-portal reaches an out-portal, and every out-portal is reached');
  T.ok(Object.keys(netw.byIn).every((l) => Math.abs(netw.byIn[l] - 1) < 1e-9), 'the route odds of each road end add up to 1', netw.byIn);
  T.ok(!netw.uturn, 'no route turns back on itself (no U-turns)');
  T.ok(netw.stopsOrdered, 'each route meets its junction boxes in order, each box once');

  T.section('the T-junction odds (B-22), drawn as spawns draw them');
  const odds = await ev(() => {
    const SR = window.SR, TR = SR.world.traffic;
    SR.rng.world.seed(20260929);
    const N = 20000, out = {};
    ['mainS', 'mainN', 'westE', 'eastW'].forEach((lane) => {
      const c = {};
      for (let i = 0; i < N; i++) { const r = TR.pick(lane); c[r.key] = (c[r.key] || 0) + 1; }
      out[lane] = c;
    });
    const probs = {};
    TR.routes().forEach((r) => { probs[r.key] = r.prob; });
    return { out, probs, N };
  });
  const frac = (lane, pred) => Object.keys(odds.out[lane]).filter(pred).reduce((a, k) => a + odds.out[lane][k], 0) / odds.N;
  T.ok(Math.abs(frac('mainS', (k) => /J1:mainS/.test(k)) - 0.7) < 0.015, 'from Main at J1: straight 0.7 (' + frac('mainS', (k) => /J1:mainS/.test(k)).toFixed(3) + ')');
  T.ok(Math.abs(frac('mainS', (k) => /J1:westW/.test(k)) - 0.3) < 0.015, 'from Main at J1: turn into West Ave 0.3');
  T.ok(Math.abs(frac('mainN', (k) => /J2:eastE/.test(k)) - 0.3) < 0.015, 'from Main at J2: turn into East Ave 0.3');
  T.ok(Math.abs(frac('westE', (k) => /J1:mainN/.test(k)) - 0.5) < 0.015 && Math.abs(frac('westE', (k) => /J1:mainS/.test(k)) - 0.5) < 0.015,
    'from West Ave at J1: left 0.5, right 0.5');
  T.ok(Math.abs(frac('eastW', (k) => /J2:mainN/.test(k)) - 0.5) < 0.015, 'from East Ave at J2: left 0.5, right 0.5');
  T.ok(Object.keys(odds.probs).every((k) => { const lane = k.split('|')[0]; return Math.abs((odds.out[lane][k] || 0) / odds.N - odds.probs[k]) < 0.015; }),
    'every route comes up at its product of junction odds (20,000 draws per road end)');

  // ------------------------------------------------------------------------------------------------
  T.section('a 30-minute soak at ×8 (the camera tours the sidewalks, day and night)');
  const soak = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, PD = W.pedestrians, G = W.geometry;
    SR.debug.newGame({ seed: 777 });
    SR.debug.goto('city');
    TR.clear();
    const idle = { x: 0, y: 0, skate: false };
    const spots = [[2220, 1900], [2760, 1500], [2760, 2100], [2220, 3200], [900, 1250], [3600, 2120], [2220, 900], [2760, 3900], [1400, 1790], [4000, 2650]];
    const hours = [480, 720, 1020, 1320, 60];
    const ins = G.map.portals.filter((p) => p.end === 'in'), outs = G.map.portals.filter((p) => p.end === 'out');
    let overlaps = 0, maxCars = 0, maxStill = 0, stuck = null, walkerTouch = 0, badDrop = 0, drops = {}, tumbles = {}, frames = 0, rendered = 0;
    const seenDrop = new Set(), seenTumble = new Set();
    const t0 = performance.now();
    for (let m = 0; m < 30; m++) {
      if (m % 6 === 0) SR.debug.setTime(hours[(m / 6) % hours.length]);
      const sp = spots[m % spots.length];
      W.teleport(sp[0], sp[1]);
      for (let f = 0; f < 60 * 60 / 8; f++) {          // one minute: 450 frames of 8 fixed steps
        for (let k = 0; k < 8; k++) W.update(1 / 60, idle);
        frames++;
        const cars = TR.cars;
        maxCars = Math.max(maxCars, cars.length);
        for (let a = 0; a < cars.length; a++) {
          const A = cars[a];
          if (A.still > maxStill) { maxStill = A.still; stuck = TR.probe(A); }
          if (A.phase === 'drop' && !seenDrop.has(A.id)) {
            seenDrop.add(A.id);
            const p = ins.find((q) => q.lane === A.route.lane);
            if (!p || Math.hypot(A.gx - p.at[0], A.gy - p.at[1]) > A.half + 20) badDrop++;
            drops[A.route.lane] = (drops[A.route.lane] || 0) + 1;
          }
          if (A.phase === 'tumble' && !seenTumble.has(A.id)) {
            seenTumble.add(A.id);
            const o = outs.find((q) => Math.hypot(q.at[0] - A.route.end[0], q.at[1] - A.route.end[1]) < 1);
            if (o) tumbles[o.lane] = (tumbles[o.lane] || 0) + 1;
          }
          if (A.phase !== 'drive') continue;
          for (let b = a + 1; b < cars.length; b++) if (cars[b].phase === 'drive' && TR.overlap(A, cars[b])) overlaps++;
          if (A.v > 1) for (const p of PD.list) if (p.zebra && TR.touches(A, p.x, p.y, 8)) walkerTouch++;
        }
        if (f % 225 === 0) { SR.loop.step(0); rendered++; }
      }
    }
    return { overlaps, maxCars, maxStill, stuck, walkerTouch, badDrop, drops, tumbles, frames, rendered, stats: Object.assign({}, TR.stats),
      crossed: PD.stats.crossed, ms: Math.round(performance.now() - t0) };
  });
  T.ok(soak.frames === 13500, '30 minutes simulated: 13,500 frames of 8 fixed steps (' + soak.ms + ' ms)');
  T.eq(soak.overlaps, 0, 'no two cars ever overlap (oriented boxes, every frame)');
  // A queue behind a busy box waits a few light cycles (cars keep the box clear and let walkers
  // cross, and a car waiting at a crosswalk's stop line keeps its turn until the box is free); a
  // stuck car would sit for the rest of the soak.
  T.ok(soak.maxStill < 30, 'no car is stuck: the longest standstill is ' + soak.maxStill.toFixed(1) + ' s (a junction queue)', soak.stuck);
  T.ok(soak.maxCars <= 14 && soak.maxCars >= 10, 'at most 14 cars at once (max ' + soak.maxCars + ')');
  T.ok(Object.keys(soak.drops).length === 4 && soak.badDrop === 0, 'cars drop in from the sky at all four road ends', soak.drops);
  T.ok(Object.keys(soak.tumbles).length === 4, 'and tumble off all four far ends into the clouds', soak.tumbles);
  T.ok(soak.stats.exited > 100 && soak.stats.spawned > 400, 'traffic flows: ' + soak.stats.spawned + ' cars in, ' + soak.stats.exited + ' over the rim, ' + soak.stats.despawned + ' out of range');
  T.ok(soak.walkerTouch === 0 && soak.crossed > 50, 'walkers crossed ' + soak.crossed + ' times and no moving car ever touched one on a zebra');

  // ------------------------------------------------------------------------------------------------
  // A scripted player standing in the southbound lane of Main Street, cars coming one at a time.
  T.section('the player in a lane: noticed per the formula, or hit (Monte Carlo)');
  const mc = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player;
    SR.debug.newGame({ seed: 99 });
    SR.debug.goto('city');
    W.pedestrians.list.length = 0;
    W.pedestrians.live = false;
    TR.spawning = false;
    SR.debug.set({ stats: { str: 900, hpMax: 915, hp: 915 } });
    SR.rng.world.seed(4242);
    const route = 'mainS|J1:mainS|J2:mainS', py = 3700, start = py - 656 - 430;
    const out = {};
    [-100, -50, 0, 50, 100].forEach((karma) => {
      SR.state.stats.karma = karma;
      const n = 1500;
      let hits = 0, braked = 0, other = 0;
      for (let i = 0; i < n; i++) {
        TR.clear();
        P.knockdown = 0;
        W.teleport(2398, py);
        SR.state.stats.hp = 915;
        const car = TR.add(route, { s: start, v: 440, cruise: 440, kind: 'sedan' });
        const h0 = TR.stats.hits;
        let done = false;
        for (let k = 0; k < 300 && !done; k++) {
          TR.update(1 / 60);
          if (TR.stats.hits > h0) { hits++; done = true; } else if (car.v < 1 && car.s > start + 100) { braked++; done = true; }
        }
        if (!done) other++;
      }
      out[karma] = { hits, braked, other, n, p: TR.noticeChance(karma) };
    });
    TR.spawning = true;
    return out;
  });
  Object.keys(mc).forEach((k) => {
    const r = mc[k], got = r.braked / r.n;
    T.ok(r.other === 0 && Math.abs(got - r.p) <= 0.03, 'karma ' + k + ': braked for ' + (got * 100).toFixed(1) + ' % of ' + r.n + ' drivers, hit by the rest (the formula says ' + (r.p * 100).toFixed(1) + ' %)', r);
  });

  T.section('a car hit: -10 HP, the 1.14 s knockdown, a voicemail the next morning');
  const hit = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player;
    SR.debug.newGame({ seed: 5 });
    SR.debug.goto('city');
    W.pedestrians.list.length = 0;
    TR.clear();
    TR.spawning = false;
    SR.debug.set({ stats: { karma: 0 } });
    W.teleport(2398, 3700);
    const s0 = JSON.parse(JSON.stringify(SR.state));
    TR.add('mainS|J1:mainS|J2:mainS', { s: 3700 - 656 - 90, v: 480, cruise: 480 });   // too close to stop: it hits
    let k = 0;
    while (TR.stats.hits === 0 && k < 120) { W.update(1 / 60, { x: 0, y: 0, skate: false }); k++; }
    const after = { hp: SR.state.stats.hp, min: SR.state.clock.min, knock: P.knockdown, flag: !!SR.state.flags.carHitVm, hits: SR.state.records.carHits, last: TR.last && TR.last.kind };
    // Knocked down: no control for the knockdown, and cars stop for the flattened stick.
    const x0 = P.x;
    for (let i = 0; i < 30; i++) W.update(1 / 60, { x: 1, y: 0, skate: false });
    const stillDown = Math.abs(P.x - x0) < 1;
    const car2 = TR.add('mainS|J1:mainS|J2:mainS', { s: 3700 - 656 - 400, v: 440, cruise: 440 });
    for (let i = 0; i < 90; i++) W.update(1 / 60, { x: 0, y: 0, skate: false });
    const noSecond = TR.stats.hits === 1 && car2.v < 1;
    TR.spawning = true;
    SR.debug.night('sleep');
    const vm = SR.state.msgs.filter((m) => /^vm\.carhit\.[123]$/.test(m.key)).map((m) => ({ key: m.key, text: SR.text(m.key, m.vars), vars: m.vars }));
    return { before: { hp: s0.stats.hp, min: s0.clock.min }, after, stillDown, noSecond, vm, flagAfterNight: !!SR.state.flags.carHitVm };
  });
  T.eq([hit.after.hp - hit.before.hp, hit.after.min - hit.before.min], [-10, 0], 'a car hit costs 10 HP and no time (orig)');
  T.ok(Math.abs(hit.after.knock - 1.14) < 0.02 && hit.stillDown, 'the knockdown lasts 1.14 s (orig: 40 ticks) and the input moves nothing meanwhile', hit.after);
  T.ok(hit.after.flag && hit.after.hits === 1 && hit.after.last === 'hit', 'world.carHit records the hit and asks the night for a voicemail');
  T.ok(hit.noSecond, 'the next driver stops for the flattened stick (no second hit)');
  T.ok(hit.vm.length === 1 && hit.vm[0].text.indexOf('⟦') < 0 && hit.vm[0].text.indexOf(hit.vm[0].vars.money) >= 0 && !hit.flagAfterNight,
    'the next morning brings one of the three lawyers\' voicemails (en-city.js), naming the settlement', hit.vm);

  T.section('zebras always stop cars; Pedestrian Supremacy');
  const zebra = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player, G = W.geometry;
    SR.debug.newGame({ seed: 6 });
    SR.debug.goto('city');
    W.pedestrians.list.length = 0;
    TR.spawning = false;
    SR.debug.set({ stats: { karma: -100, str: 900, hpMax: 915, hp: 915 } });
    const z = G.map.zebras.find((q) => q.id === 'mid');
    const zy = (z.rect[1] + z.rect[3]) / 2;
    const route = 'mainS|J1:mainS|J2:mainS';
    let hits = 0, shortOk = 0;
    for (let i = 0; i < 300; i++) {
      TR.clear();
      P.knockdown = 0;
      W.teleport(2398, zy);
      const car = TR.add(route, { s: zy - 656 - 300 - (i % 7) * 20, v: 520, cruise: 520 });
      const h0 = TR.stats.hits;
      for (let k = 0; k < 240; k++) TR.update(1 / 60);
      if (TR.stats.hits > h0) hits++;
      if (car.s + car.half <= z.rect[1] - 656 + 1) shortOk++;
    }
    const zebraRun = { hits, shortOk };
    // Pedestrian Supremacy: every driver notices you, anywhere in the lane.
    SR.state.election.decrees = ['pedestrianSupremacy'];
    hits = 0;
    let stopped = 0;
    for (let i = 0; i < 300; i++) {
      TR.clear();
      P.knockdown = 0;
      W.teleport(2398, 3700);
      const car = TR.add(route, { s: 3700 - 656 - 400, v: 480, cruise: 480 });
      const h0 = TR.stats.hits;
      for (let k = 0; k < 240; k++) TR.update(1 / 60);
      if (TR.stats.hits > h0) hits++;
      if (car.v < 1) stopped++;
    }
    SR.state.election.decrees = [];
    TR.spawning = true;
    return { zebraRun, supremacy: { hits, stopped } };
  });
  T.ok(zebra.zebraRun.hits === 0 && zebra.zebraRun.shortOk === 300, 'a player on a zebra is always noticed: 300 drivers at karma -100 stop short of it, none hits', zebra.zebraRun);
  T.ok(zebra.supremacy.hits === 0 && zebra.supremacy.stopped === 300, 'under Pedestrian Supremacy every driver notices you (300 of 300 at karma -100)', zebra.supremacy);

  // Skid marks (ART_AUDIO §8): only an emergency stop leaves them, and they fade out.
  const skid = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player, G = W.geometry;
    const z = G.map.zebras.find((q) => q.id === 'mid');
    const zy = (z.rect[1] + z.rect[3]) / 2;
    const route = 'mainS|J1:mainS|J2:mainS';
    TR.spawning = false;
    TR.clear(); P.knockdown = 0;
    W.teleport(2398, zy);
    let car = TR.add(route, { s: zy - 656 - 400, v: 520, cruise: 520 });
    for (let k = 0; k < 240; k++) TR.update(1 / 60);
    const calm = { skids: TR.skids.length, v: car.v };
    TR.clear(); P.knockdown = 0;
    W.teleport(2398, zy);
    car = TR.add(route, { s: z.rect[1] - 656 - car.half - 70, v: 520, cruise: 520 });
    const h0 = TR.stats.hits;
    for (let k = 0; k < 90; k++) TR.update(1 / 60);
    const m = TR.skids[0];
    const hard = { skids: TR.skids.length, len: m ? Math.round(m.len) : 0, kind: m && m.kind, alpha: m && m.alpha, v: car.v, hits: TR.stats.hits - h0,
      behind: m ? Math.abs(m.x - car.gx) + Math.abs(m.y - car.gy) : -1 };
    for (let k = 0; k < 60 * 4; k++) TR.update(1 / 60);
    const half = m ? +m.alpha.toFixed(2) : -1;
    for (let k = 0; k < 60 * 5; k++) TR.update(1 / 60);
    const gone = TR.skids.length;
    TR.clear();
    TR.spawning = true;
    return { calm, hard, half, gone };
  });
  T.ok(skid.calm.skids === 0 && skid.calm.v < 1, 'a normal stop at a zebra leaves no skid marks', skid.calm);
  T.ok(skid.hard.skids === 1 && skid.hard.len > 20 && skid.hard.len <= 140 && skid.hard.v < 1 && skid.hard.hits === 0 && skid.hard.behind < 1,
    'an emergency stop lays one skid mark behind the car (' + skid.hard.len + ' u), and nobody is hit', skid.hard);
  T.ok(skid.half > 0.3 && skid.half < 0.7 && skid.gone === 0, 'the mark fades out over 8 s', { half: skid.half, gone: skid.gone });

  T.section('the player\'s car driving into traffic: a crash');
  const crash = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player;
    SR.debug.newGame({ seed: 8 });
    SR.debug.goto('city');
    W.pedestrians.list.length = 0;
    TR.clear();
    TR.spawning = false;
    SR.debug.set({ player: { cars: { junker: { owned: true, x: 2398, y: 2800, a: Math.PI / 2, towed: false } } } });
    W.teleport(2398, 2740);
    P.board('junker', true);
    const car = TR.add('mainS|J1:mainS|J2:mainS', { s: 3040 - 656, v: 0, cruise: 0 });
    const hp0 = SR.state.stats.hp, min0 = SR.state.clock.min;
    let k = 0, vBefore = 0;
    while (TR.stats.crashes === 0 && k < 180) { vBefore = P.v; W.update(1 / 60, { x: 0, y: 1, skate: false }); k++; }
    const vAfter = P.v, hp1 = SR.state.stats.hp;
    // One crash per bump: the cool-down keeps a scrape from counting twice.
    for (let i = 0; i < 20; i++) W.update(1 / 60, { x: 0, y: 0, skate: false });
    TR.spawning = true;
    return { crashes: TR.stats.crashes, dhp: hp1 - hp0, dmin: SR.state.clock.min - min0, vBefore, vAfter, carV: car.v, hold: car.hold, last: TR.last && TR.last.kind };
  });
  T.ok(crash.crashes === 1 && crash.last === 'crash', 'driving into a traffic car is one crash (world.carCrash)', crash);
  T.eq([crash.dhp, crash.dmin], [-5, 0], 'a crash costs 5 HP and no time');
  T.ok(crash.vBefore > 100 && crash.vAfter < 0 && crash.carV === 0, 'both bounce: your car rebounds, theirs is knocked still', crash);
  // Your car crossing a lane (or coming the wrong way) is braked for; only one driving away along
  // the lane is followed at its speed.
  const cross = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player, out = {};
    TR.spawning = false;
    SR.debug.set({ player: { cars: { junker: { owned: true, x: 2398, y: 2900, a: 0, towed: false } } } });
    W.teleport(2398, 2860);
    P.board('junker', true);
    [['crossing', 0], ['oncoming', -Math.PI / 2], ['away', Math.PI / 2]].forEach(([name, a]) => {
      TR.clear();
      const c = TR.add('mainS|J1:mainS|J2:mainS', { s: 2900 - 656 - 150, v: 440, cruise: 440 });
      P.a = a; P.v = 600;
      TR.update(1 / 60);
      out[name] = { vTarget: Math.round(c.vTarget), why: c.why };
    });
    P.v = 0;
    P.park(2398, 2900, 0);
    SR.debug.set({ player: { cars: { junker: { owned: false } } } });
    TR.clear();
    TR.spawning = true;
    return out;
  });
  T.ok(cross.crossing.why === 'playerCar' && cross.crossing.vTarget < 440 && cross.oncoming.vTarget < 440 && cross.away.vTarget === 440,
    'a driver brakes for your car crossing its lane or coming the wrong way, and follows it driving away', cross);

  T.section('a hit at 10 HP: the hospital (Standard), death (Hardcore)');
  const down = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, P = W.player, out = {};
    ['standard', 'hardcore'].forEach((difficulty) => {
      SR.debug.newGame({ seed: 9, difficulty });
      SR.debug.goto('city');
      const stack = SR.scenes.stack().join(',');
      W.pedestrians.list.length = 0;
      TR.live = true;             // the Standard run's hospital flow may still be taking the stage
      TR.clear();
      TR.spawning = false;
      SR.debug.set({ stats: { hp: 10 } });
      let got = null;
      const off = SR.events.on('player:down', (p) => { got = { outcome: p.outcome, cause: p.cause }; });
      W.teleport(2398, 3700);
      P.knockdown = 0;            // the Standard run ended on a hit
      TR.add('mainS|J1:mainS|J2:mainS', { s: 3700 - 656 - 90, v: 480, cruise: 480 });
      for (let k = 0; k < 120 && !got; k++) W.update(1 / 60, { x: 0, y: 0, skate: false });
      off();
      out[difficulty] = { got, over: SR.state.over, stack };
      TR.spawning = true;
    });
    return out;
  });
  T.eq(down.standard.got, { outcome: 'hospital', cause: 'carHit' }, 'Standard: a hit at 10 HP reaches the hospital flow (player:down, cause carHit)');
  T.eq([down.hardcore.got, down.hardcore.over], [{ outcome: 'death', cause: 'carHit' }, true], 'Hardcore: it is death (' + down.hardcore.stack + ')');

  T.section('the entity fields of ARCHITECTURE §8.2; no car drops in on you or your parked car');
  const fields = await ev(() => {
    const SR = window.SR, W = SR.world, TR = W.traffic, PD = W.pedestrians, G = W.geometry, out = {};
    const idle = { x: 0, y: 0, skate: false };
    SR.debug.newGame({ seed: 10 });
    SR.debug.goto('city');
    SR.debug.setTime(720);
    PD.list.length = 0;
    TR.clear(); TR.spawning = false;
    W.teleport(2220, 1300);
    const c = TR.add('mainS|J1:mainS|J2:mainS', { s: 400, v: 300, cruise: 440 });
    TR.update(1 / 60);
    out.car = { id: typeof c.id, lane: c.lane, v: typeof c.v, vTarget: c.vTarget, kind: c.kind, state: c.state, honkT: typeof c.honkT, a: typeof c.a, braking: typeof c.braking };
    PD.clear();
    const p = PD.list[0];
    out.ped = p ? { id: typeof p.id, node: typeof p.node, next: typeof p.next, speed: typeof p.speed, archetype: typeof p.archetype, look: typeof p.look, state: typeof p.state, facing: typeof p.facing } : null;
    // Main's north road end: cars of that lane never land on your parked car, or on you, there.
    const inp = G.map.portals.find((q) => q.end === 'in' && q.lane === 'mainS');
    const drops = (sec) => {
      const seen = new Set();
      for (let k = 0; k < 60 * sec; k++) {
        W.update(1 / 60, idle);
        for (const car of TR.cars) if (car.route.lane === 'mainS' && car.phase === 'drop') seen.add(car.id);
      }
      return seen.size;
    };
    TR.clear(); TR.spawning = true;
    SR.debug.set({ player: { cars: { junker: { owned: true, x: inp.at[0], y: inp.at[1] + 40, a: Math.PI / 2, towed: false } } } });
    W.teleport(2760, 760);
    out.onCar = drops(20);
    SR.debug.set({ player: { cars: { junker: { owned: false, towed: false } } } });
    TR.clear();
    W.teleport(inp.at[0], inp.at[1] + 70);
    SR.world.player.knockdown = 0;
    out.onYou = drops(20);
    TR.clear();
    W.teleport(2760, 760);
    out.clear = drops(20);
    return out;
  });
  T.eq(fields.car, { id: 'number', lane: 'mainS', v: 'number', vTarget: 440, kind: 'sedan', state: 'drive', honkT: 'number', a: 'number', braking: 'boolean' },
    'a car carries id, lane, x, y, a, v, vTarget, kind, state and honkT (ARCHITECTURE §8.2)');
  T.ok(fields.ped && Object.keys(fields.ped).every((k) => fields.ped[k] !== 'undefined') && fields.ped.look === 'object',
    'a walker carries id, node, next, speed, archetype, look and state', fields.ped);
  T.ok(fields.onCar === 0 && fields.onYou === 0 && fields.clear >= 2, 'no car drops onto your car parked at a road end, or onto you standing there; once clear they drop in again', fields);

  // ------------------------------------------------------------------------------------------------
  T.section('screenshots');
  await t.newGame({ seed: 31 });
  await t.goto('city');
  await t.setTime(1080);
  await ev(() => { const SR = window.SR; SR.world.traffic.clear(); SR.world.teleport(2760, 2100); for (let i = 0; i < 60 * 25; i++) SR.world.update(1 / 60); SR.render.warm(); });
  await t.step(1);
  await t.step(100);
  await t.eval(() => { if (window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });
  await t.shot(path.join(SHOTS, 'traffic-j2-dusk.png'));
  await t.setTime(1380);
  await ev(() => { const SR = window.SR; SR.world.teleport(2220, 1450); for (let i = 0; i < 60 * 8; i++) SR.world.update(1 / 60); SR.render.warm(); });
  await t.step(1);
  await t.step(100);
  await t.eval(() => { if (window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });
  await t.shot(path.join(SHOTS, 'traffic-j1-night.png'));
  await t.setTime(720);
  await ev(() => { const SR = window.SR; SR.world.teleport(2760, 760); for (let i = 0; i < 60 * 6; i++) SR.world.update(1 / 60); SR.render.warm(); });
  await t.step(1);
  await t.step(100);
  await t.eval(() => { if (window.SR.ui.toast.clear) window.SR.ui.toast.clear(); });
  await t.shot(path.join(SHOTS, 'traffic-north-end.png'));

  T.section('result');
  T.eq(t.errors(), [], 'zero console errors');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
