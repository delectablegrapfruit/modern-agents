// tests/e2e/world.test.cjs — owner: W1-W. The world's behaviour in the real page (index.html over
// file://), driven through SR.world with scripted input (BUILD_PLAN §3.7 acceptance): a headless
// walker visits every sidewalk-graph node; walking along Main Street past every east / west door
// enters none, walking into each door enters it, exiting never re-enters; falls at 200 sampled
// unrailed edge points, never through railings or the castle wall, never with Safe edges; teeter
// grace; walk / skate / junker / sports speed ratios; the sidewalk speed cap; "Park and enter" at
// every kerb; click-to-walk to every door and scrap; the door resolver in 8 ownership states; the
// camera bounds; world.fall through SR.act; prompts and tags; people hopping aside; zero console
// errors. Scene changes from doors are recorded (SR.world.doors.go is this module's own hook)
// except in the one test that enters the real building scene. Also captures the world sheet
// (tests/sheets/world.html) into shots/W1-W/.
//   node tests/e2e/world.test.cjs
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const h = require('../harness.cjs');

/** In-page helpers (serialized into the page by Playwright). */
function install() {
  const SR = window.SR, W = SR.world, G = W.geometry, D = W.doors, F = W.fall, P = W.player;
  const STEP = 1 / 60;
  const X = window.W1W = { gone: [], realGo: D.go };
  D.go = function (r) { X.gone.push(r); };
  X.fresh = function (patch) {
    const s = SR.rules.state.create({ seed: 7 });
    s.stats.str = 200; s.stats.hpMax = SR.tuning.start.hpMaxBase + 200; s.stats.hp = s.stats.hpMax;
    if (patch) SR.util.merge(s, patch);
    SR.state = s;
    W.start(s);
    D.reset(); F.reset(); F.count = 0; X.gone.length = 0;
    W.camera.setLevel(1); W.camera.target = null; W.camera.snap();
    return s;
  };
  X.step = function (n, input) { input = input || { x: 0, y: 0, skate: false }; for (let i = 0; i < n; i++) W.update(STEP, input); };
  X.place = function (x, y) { F.reset(); P.place(x, y, 180); D.reset(); W.camera.snap(); };
  /** Steers toward (tx, ty) with the move input until within `within` u. */
  X.steer = function (tx, ty, maxSec, within, skate) {
    const limit = Math.ceil(maxSec / STEP);
    for (let i = 0; i < limit; i++) {
      const dx = tx - P.x, dy = ty - P.y, d = Math.hypot(dx, dy);
      if (d <= within) return true;
      if (F.active()) return false;
      W.update(STEP, { x: dx / d, y: dy / d, skate: !!skate });
    }
    return false;
  };
}

(async () => {
  const T = h.suite('e2e world (W1-W)');
  const t = await h.open();
  const { page } = t;
  await page.evaluate(install);
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // ----------------------------------------------------------------------------------------------
  T.section('boot');
  const boot = await ev(() => ({ ready: window.SR.world.ready, missing: window.SR.world.cfg.missing, doors: window.SR.world.geometry.doors.length,
    nodes: window.SR.world.geometry.graph.nodes.length, act: typeof window.SR.act }));
  T.ok(boot.ready && boot.doors === 15 && boot.nodes > 150, 'the world is built at boot in the page', boot);
  T.eq(boot.missing, [], 'every world number comes from SR.tuning.world');
  T.eq(boot.act, 'function', 'SR.act is live (W1-R)');

  // ----------------------------------------------------------------------------------------------
  T.section('the headless walker visits every sidewalk-graph node');
  const walk = await ev(() => {
    const SR = window.SR, X = window.W1W, G = SR.world.geometry, g = G.graph, P = SR.world.player, D = SR.world.doors;
    X.fresh();
    let cur = 0, best = Infinity;
    g.nodes.forEach((n) => { const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < best) { best = d; cur = n.id; } });
    P.walkTo(g.nodes[cur].x, g.nodes[cur].y);
    X.step(60 * 10);
    const visited = new Set(), stuck = [];
    if (Math.hypot(P.x - g.nodes[cur].x, P.y - g.nodes[cur].y) < 16) visited.add(cur);
    // Depth-first order over the graph; hops between targets follow graph links (BFS).
    const order = [], seen = new Set([cur]), stack = [cur];
    while (stack.length) {
      const n = stack.pop();
      order.push(n);
      g.adj[n].slice().reverse().forEach((m) => { if (!seen.has(m)) { seen.add(m); stack.push(m); } });
    }
    function route(a, b) {
      const prev = new Map([[a, -1]]), q = [a];
      while (q.length) {
        const n = q.shift();
        if (n === b) break;
        g.adj[n].forEach((m) => { if (!prev.has(m)) { prev.set(m, n); q.push(m); } });
      }
      const out = [];
      for (let k = b; k !== a && k !== undefined && k !== -1; k = prev.get(k)) out.push(k);
      return out.reverse();
    }
    let hops = 0;
    for (const target of order) {
      if (visited.has(target)) continue;
      for (const n of route(cur, target)) {
        const node = g.nodes[n], d = Math.hypot(node.x - P.x, node.y - P.y);
        hops++;
        if (!X.steer(node.x, node.y, d / 150 + 1, 10)) { stuck.push([n, Math.round(P.x), Math.round(P.y)]); P.place(node.x, node.y, 180); }
        visited.add(n);
        cur = n;
      }
    }
    return { total: g.nodes.length, visited: visited.size, hops, stuck, entered: D.entered.map((e) => e.id), falls: SR.world.fall.count };
  });
  T.eq(walk.visited, walk.total, 'visited ' + walk.visited + ' of ' + walk.total + ' nodes (' + walk.hops + ' hops)');
  T.eq(walk.stuck, [], 'never stuck');
  T.eq(walk.entered, [], 'walking the pavements entered no door');
  T.eq(walk.falls, 0, 'and never fell');

  // ----------------------------------------------------------------------------------------------
  T.section('doors: passing by, walking in, exiting, prompts');
  const doors = await ev(() => {
    const SR = window.SR, X = window.W1W, G = SR.world.geometry, D = SR.world.doors, P = SR.world.player;
    const out = { pass: [], passPrompt: [], enter: [], exitBounce: [], exitRearm: [] };
    X.fresh();
    const main = G.doors.filter((d) => (d.face === 'E' && d.x <= 2138) || (d.face === 'W' && d.x === 2842));
    main.forEach((d) => {
      // Along the sidewalk through the trigger's centre line, both ways, and along the pavement's centre.
      const lines = [d.tc[0], d.face === 'E' ? 2223 : 2756];
      lines.forEach((lx) => {
        [1, -1].forEach((dir) => {
          X.place(lx, d.y - dir * 170);
          let prompted = false;
          for (let i = 0; i < 200 && (P.y - d.y) * dir < 170; i++) { SR.world.update(1 / 60, { x: 0, y: dir, skate: false }); if (D.prompt && D.prompt.door === d.id) prompted = true; }
          if (D.entered.length || SR.world.fall.active() || SR.world.fall.count) out.pass.push(d.id + '@' + lx + '/' + dir + ':' + D.entered.map((e) => e.id).join() + ' falls ' + SR.world.fall.count);
          if (lx === d.tc[0] && !prompted) out.passPrompt.push(d.id);
        });
      });
    });
    out.mainDoors = main.map((d) => d.id);
    G.doors.forEach((d) => {
      X.place(d.x + d.out[0] * 90, d.y + d.out[1] * 90);
      for (let i = 0; i < 60 && !D.entered.length; i++) SR.world.update(1 / 60, { x: -d.out[0], y: -d.out[1], skate: false });
      const e = D.entered[0];
      if (!e || e.id !== d.id || e.via !== 'walk') out.enter.push(d.id + ':' + (e ? e.id + '/' + e.via : 'none'));
      // Exit: stand 56 u outside facing away; idling and walking straight back in never re-enter...
      D.exit(d.id);
      const ex = { x: P.x, y: P.y, facing: P.facing };
      D.entered.length = 0;
      X.step(60);
      for (let i = 0; i < 30; i++) SR.world.update(1 / 60, { x: -d.out[0], y: -d.out[1], skate: false });
      if (D.entered.length || Math.abs(ex.x - (d.x + d.out[0] * 56)) > 1e-6 || Math.abs(ex.y - (d.y + d.out[1] * 56)) > 1e-6 || ex.facing !== d.facing) out.exitBounce.push(d.id);
      // ...until the player has been more than 64 u from the trigger: then walking in enters again.
      const side = [d.out[1], -d.out[0]], away = [0, 60, -60, 100, -100].map((k) => [d.tc[0] + d.out[0] * 100 + side[0] * k, d.tc[1] + d.out[1] * 100 + side[1] * k])
        .find((q) => G.walkable(q[0], q[1], 16));
      X.steer(away[0], away[1], 3, 6);
      const armedAway = Math.hypot(P.x - d.tc[0], P.y - d.tc[1]) > 64;
      D.entered.length = 0;
      for (let i = 0; i < 120 && !D.entered.length; i++) {
        const dx = d.x - P.x, dy = d.y - P.y, l = Math.hypot(dx, dy) || 1;
        SR.world.update(1 / 60, { x: dx / l, y: dy / l, skate: false });
      }
      if (!armedAway) out.exitRearm.push(d.id + ':not away');
      if (!D.entered.length || D.entered[0].id !== d.id) out.exitRearm.push(d.id);
      D.reset();
    });
    // Prompt ranges: [E] within 96 u of the door, a plain tag from 96 to 160 u, nothing beyond.
    const m = G.doorById.mcsticks, rng = [];
    [[80, 'enter'], [130, 'tag'], [175, 'none']].forEach((c) => {
      X.place(m.x + c[0], m.y);
      SR.world.update(1 / 60, { x: 0, y: 0 });
      const kind = D.prompt && D.prompt.door === 'mcsticks' ? 'enter' : D.tags.some((q) => q.door === 'mcsticks') ? 'tag' : 'none';
      rng.push([c[0], kind, c[1]]);
    });
    out.ranges = rng;
    // Interact enters within 96 u; never through a wall (from the far side of the building).
    X.place(m.x + 60, m.y + 10);
    SR.world.update(1 / 60, { x: 0, y: 0 });
    out.interact = SR.world.onAction('interact') && D.last && D.last.id === 'mcsticks' && D.last.via === 'interact';
    X.place(m.x - 700, m.y);
    SR.world.update(1 / 60, { x: 0, y: 0 });
    out.farSide = D.prompt ? D.prompt.door : null;
    return out;
  });
  T.eq(doors.mainDoors.sort(), ['bank', 'bar', 'casino', 'home_mansion', 'mcsticks', 'nli', 'pawn', 'store'], 'the eight Main Street doors (east and west faces)');
  T.eq(doors.pass, [], 'walking along the Main Street sidewalks past every east / west door enters none');
  T.eq(doors.passPrompt, [], 'passing through each trigger shows its [E] prompt');
  T.eq(doors.enter, [], 'walking into each of the 15 doors enters it (dwell 0.2 s, within 45°)');
  T.eq(doors.exitBounce, [], 'exiting places the player 56 u outside facing away and never re-enters');
  T.eq(doors.exitRearm, [], 'the trigger re-arms once the player has been more than 64 u from it');
  T.eq(doors.ranges.map((r) => r[1]), doors.ranges.map((r) => r[2]), 'prompt within 96 u, name tag from 96 to 160 u, nothing beyond');
  T.ok(doors.interact, 'Interact enters the prompted door within 96 u');
  T.eq(doors.farSide, null, 'no prompt through a building from its far side');

  // ----------------------------------------------------------------------------------------------
  T.section('the door resolver (ARCHITECTURE §8.4): 4 home doors × 8 ownership states');
  const resolver = await ev(() => {
    const SR = window.SR, D = SR.world.doors;
    const doors = { home_apt: ['apt', 'apt2'], home_pent: ['pent'], home_mansion: ['mansion'], home_castle: ['castle'] };
    const states = [
      { owned: ['apt'], living: 'apt' }, { owned: ['apt', 'apt2'], living: 'apt2' }, { owned: ['apt', 'apt2'], living: 'apt' },
      { owned: ['apt', 'pent'], living: 'pent' }, { owned: ['apt', 'mansion'], living: 'apt' }, { owned: ['apt', 'castle'], living: 'castle' },
      { owned: ['apt', 'apt2', 'pent', 'mansion', 'castle'], living: 'mansion' }, { owned: ['pent', 'castle'], living: 'pent' },
    ];
    const bad = [];
    let n = 0;
    states.forEach((homes) => {
      Object.keys(doors).forEach((door) => {
        const tiers = doors[door], ownedHere = homes.owned.filter((h) => tiers.indexOf(h) >= 0);
        const want = tiers.indexOf(homes.living) >= 0 ? { homeId: homes.living, mode: 'live' }
          : ownedHere.length ? { homeId: ownedHere.sort((a, b) => tiers.indexOf(b) - tiers.indexOf(a))[0], mode: 'owned' }
            : { homeId: tiers[0], mode: 'forSale' };
        const got = D.resolve(door, { homes: { owned: homes.owned.slice(), living: homes.living, lets: {} } });
        n++;
        if (got.scene !== 'building' || got.id !== 'home' || JSON.stringify(got.params) !== JSON.stringify(want)) bad.push([door, homes, got]);
      });
    });
    const plain = ['bank', 'mcsticks', 'bus', 'cityhall'].map((id) => D.resolve(id, SR.rules.state.create({ seed: 1 })));
    return { n, bad, plain };
  });
  T.eq(resolver.n, 32, '32 resolutions');
  T.eq(resolver.bad, [], 'Live / Owned / For Sale correct for every home door in every state (best owned tier, cheapest for sale)');
  T.eq(resolver.plain, ['bank', 'mcsticks', 'bus', 'cityhall'].map((id) => ({ scene: 'building', id, params: {} })), 'other doors resolve to their own building with params {}');

  // ----------------------------------------------------------------------------------------------
  T.section('edges: 200 falls, railings, the castle wall, Safe edges, teeter grace');
  const edges = await ev(() => {
    const SR = window.SR, X = window.W1W, G = SR.world.geometry, F = SR.world.fall, P = SR.world.player;
    X.fresh();
    const unr = G.edges.filter((e) => !e.railed), total = unr.reduce((a, e) => a + e.len, 0), cand = [];
    for (let i = 0; i < 2000; i++) {
      let t = (i + 0.5) / 2000 * total, e = null;
      for (const q of unr) { if (t <= q.len) { e = q; break; } t -= q.len; }
      const f = t / e.len, x = e.a[0] + (e.b[0] - e.a[0]) * f, y = e.a[1] + (e.b[1] - e.a[1]) * f;
      const sx = x - e.out[0] * 40, sy = y - e.out[1] * 40;
      // a rim point the player can walk straight off: the approach is on the sheet and clear of solids
      let clear = G.walkable(sx, sy, 16);
      for (let q = 1; q <= 4 && clear; q++) clear = !G.solidAt(sx + (x - sx) * q / 5, sy + (y - sy) * q / 5, 15);
      if (clear) cand.push({ x, y, sx, sy, out: e.out });
    }
    const samples = [];
    for (let i = 0; i < 200; i++) samples.push(cand[Math.floor(i * cand.length / 200)]);
    const fails = [], hpBad = [], landBad = [];
    let falls = 0;
    const s = SR.state;
    samples.forEach((p, i) => {
      s.stats.hp = s.stats.hpMax;
      X.place(p.sx, p.sy);
      const before = s.records.falls, hp0 = s.stats.hp, min0 = s.clock.min;
      let started = false;
      for (let k = 0; k < 60 && !started; k++) { SR.world.update(1 / 60, { x: p.out[0], y: p.out[1] }); started = F.active(); }
      if (!started) { fails.push([i, Math.round(p.x), Math.round(p.y)]); return; }
      X.step(120);
      if (F.active()) { fails.push([i, 'still falling']); return; }
      falls++;
      if (s.records.falls !== before + 1 || s.stats.hp !== hp0 - SR.tuning.world.fall.hp || s.clock.min !== min0) hpBad.push(i);
      if (!G.onGround(P.x, P.y) || G.edgeDistance(P.x, P.y) < 64 - 1e-6 || !SR.world.nav.reachable(P.x, P.y).ok) landBad.push([i, Math.round(P.x), Math.round(P.y)]);
    });
    // Railings and the castle wall: pushing outward along them never starts a teeter.
    const railFails = [];
    let railTries = 0;
    G.edges.filter((e) => e.railed).forEach((e) => {
      for (let k = 1; k < 20; k++) {
        const f = k / 20, x = e.a[0] + (e.b[0] - e.a[0]) * f, y = e.a[1] + (e.b[1] - e.a[1]) * f;
        const sx = x - e.out[0] * 50, sy = y - e.out[1] * 50;
        if (!G.walkable(sx, sy, 16)) continue;
        railTries++;
        X.place(sx, sy);
        for (let j = 0; j < 60; j++) SR.world.update(1 / 60, { x: e.out[0], y: e.out[1] });
        if (F.active() || !G.onGround(P.x, P.y)) { railFails.push([Math.round(x), Math.round(y)]); F.reset(); }
      }
    });
    // Safe edges (Assist): the same 200 points bounce the player back.
    const safeFails = [];
    const had = SR.settings.get('access.safeEdges');
    SR.settings.set('access.safeEdges', true);
    samples.forEach((p, i) => {
      X.place(p.sx, p.sy);
      for (let k = 0; k < 60; k++) SR.world.update(1 / 60, { x: p.out[0], y: p.out[1] });
      if (F.active() || !G.onGround(P.x, P.y)) { safeFails.push(i); F.reset(); }
    });
    SR.settings.set('access.safeEdges', had);
    // Teeter grace: reversing within 150 ms saves; after it, the fall goes on.
    const p0 = samples[17];
    const teeter = [];
    [5, 7, 8, 12].forEach((frames) => {
      s.stats.hp = s.stats.hpMax;
      X.place(p0.sx, p0.sy);
      const before = s.records.falls;
      let k = 0;
      while (!F.active() && k++ < 60) SR.world.update(1 / 60, { x: p0.out[0], y: p0.out[1] });
      const grace = F.grace;
      for (let j = 0; j < frames; j++) SR.world.update(1 / 60, { x: p0.out[0], y: p0.out[1] });
      const phaseAt = F.phase;
      SR.world.update(1 / 60, { x: -p0.out[0], y: -p0.out[1] });
      const saved = !F.active();
      X.step(120);
      teeter.push({ frames, grace, phaseAt, saved, fell: s.records.falls - before, onGround: G.onGround(P.x, P.y) });
    });
    return { cand: cand.length, falls, fails, hpBad, landBad, railTries, railFails, safeFails, teeter };
  });
  T.ok(edges.cand >= 400, edges.cand + ' reachable unrailed rim points to sample from');
  T.eq(edges.falls, 200, 'falls trigger at 200 sampled unrailed edge points');
  T.eq(edges.fails, [], 'no sample failed to fall');
  T.eq(edges.hpBad, [], 'every fall costs 10 HP and no time, and counts (records.falls)');
  T.eq(edges.landBad, [], 'every landing is on the sheet, reachable, ≥ 64 u inside');
  T.ok(edges.railTries >= 40 && !edges.railFails.length, 'never through railings or the castle wall (' + edges.railTries + ' pushes)', edges.railFails);
  T.eq(edges.safeFails, [], 'never with Safe edges (the same 200 points)');
  // The teeter starts in the step that leaves the sheet (1/60 s in); a reversal after f more steps
  // comes at (f + 2) / 60 s: 117 ms and 150 ms save, 167 ms and 233 ms fall.
  T.eq(edges.teeter.map((q) => [q.frames, q.saved, q.fell]), [[5, true, 0], [7, true, 0], [8, false, 1], [12, false, 1]], 'teeter grace: reversing within 150 ms saves; later, the fall goes on');
  T.ok(edges.teeter.filter((q) => q.saved).every((q) => q.onGround && q.phaseAt === 'teeter'), 'a saved player stands back on the sheet');
  T.ok(edges.teeter.every((q) => Math.abs(q.grace - 0.15) < 1e-9), 'the teeter window is 150 ms (B-15)');

  // ----------------------------------------------------------------------------------------------
  T.section('world.fall through SR.act, Hard Landing, Pilot Ori, HP 0');
  const fallRes = await ev(() => {
    const SR = window.SR, X = window.W1W, s = X.fresh(), got = [];
    const off = SR.events.on('fall', (p) => got.push(p));
    const r1 = SR.act('world.fall', { x: 700, y: 400 });
    const r2 = SR.act('world.fall', { x: 700, y: 400 });
    SR.debug.feature('perks', true);
    s.perks.owned.push('hardLanding');
    const hp = s.stats.hp;
    const r3 = SR.act('world.fall', { x: 700, y: 400 });
    const hard = hp - s.stats.hp;
    const daily = s.daily.falls, log = s.log.today.map((l) => l.kind), min = s.clock.min;
    SR.debug.feature('perks', false);
    s.stats.hp = 8;
    const r4 = SR.act('world.fall', { x: 700, y: 400 });
    off();
    const hit = X.fresh();
    const r5 = SR.act('world.carHit');
    const r6 = SR.act('world.carCrash');
    hit.player.cars.junker.owned = true;
    const r7 = SR.act('world.carFished', { car: 'junker' });
    const r8 = SR.act('world.enter', { building: 'mcsticks' });
    const pick = (r) => ({ ok: r.ok, deltas: r.deltas.map((d) => [d.kind, d.n]), toasts: r.toasts.map((q) => q.key), events: r.events.map((e) => e.name) });
    return { r1: pick(r1), r2: pick(r2), hard, r3: pick(r3), r4: { down: r4.down && r4.down.outcome, cause: r4.down && r4.down.cause, events: r4.events.map((e) => e.name) },
      got, r5: pick(r5), vm: hit.flags.carHitVm, carHits: hit.records.carHits, r6: pick(r6), towed: hit.player.cars.junker.towed, r7: pick(r7),
      r8: pick(r8), enterPayload: r8.events[0] && r8.events[0].payload, falls: s.records.falls, daily, log, min, day: s.clock.day, dailyAfter: s.daily.falls };
  });
  T.eq(fallRes.r1.deltas, [['hp', -10]], 'a fall costs 10 HP and no time');
  T.ok(fallRes.r1.toasts.indexOf('ori.fall1') >= 0 && fallRes.r2.toasts.indexOf('ori.fall2') >= 0, 'Pilot Ori speaks on falls 1 and 2');
  T.eq(fallRes.got.slice(0, 2), [{ count: 1, x: 700, y: 400 }, { count: 2, x: 700, y: 400 }], 'the fall event carries { count, x, y }');
  T.eq(fallRes.hard, 5, 'Hard Landing (perks on): a fall costs 5 HP');
  T.ok(fallRes.r3.toasts.indexOf('ori.fall3') < 0, 'no line on fall 3');
  T.eq([fallRes.r4.down, fallRes.r4.cause], ['hospital', 'fall'], 'a fall at 8 HP reaches HP 0: the hospital (Standard), cause fall');
  T.eq([fallRes.daily, fallRes.min], [3, 480], 'daily.falls counts and no time passes (08:00 after three falls)');
  T.eq([fallRes.falls, fallRes.day, fallRes.dailyAfter], [4, 2, 0], 'the fourth (the hospital night) counts in records.falls; the next day starts with daily.falls 0');
  T.ok(fallRes.log.indexOf('fall') >= 0, 'falls reach the daily log (B-29 kind fall)', fallRes.log);
  T.eq(fallRes.r5.deltas, [['hp', -10]], 'a car hit costs 10 HP');
  T.ok(fallRes.vm === true && fallRes.carHits === 1 && fallRes.r5.events.indexOf('carHit') >= 0, 'a car hit counts, raises carHit and asks for a lawyer\'s voicemail (flags.carHitVm)');
  T.eq(fallRes.r6.deltas, [['hp', -5]], 'a crash costs 5 HP');
  T.ok(fallRes.towed === true && fallRes.r7.ok && fallRes.r7.toasts[0] === 'toast.world.carFished', 'a car off the edge is towed (state.player.cars.<car>.towed)');
  T.eq([fallRes.r8.ok, fallRes.r8.deltas, fallRes.enterPayload], [true, [], { building: 'mcsticks' }], 'world.enter is free and raises enter { building }');

  // ----------------------------------------------------------------------------------------------
  T.section('speeds, surfaces, cars and people');
  const speeds = await ev(() => {
    const SR = window.SR, X = window.W1W, P = SR.world.player;
    const measure = (setup, input, warm, span) => {
      X.fresh(setup.patch);
      if (setup.car) { const c = SR.state.player.cars[setup.car]; c.owned = true; c.x = setup.x; c.y = setup.y; c.a = Math.PI / 2; P.place(setup.x, setup.y, 180); P.board(setup.car, true); }
      else P.place(setup.x, setup.y, 180);
      X.step(Math.round(warm * 60), input);
      const y0 = P.y;
      X.step(Math.round(span * 60), input);
      return (P.y - y0) / span;
    };
    const down = { x: 0, y: 1, skate: false }, skate = { x: 0, y: 1, skate: true };
    const walk = measure({ x: 2489, y: 800 }, down, 0.5, 1);
    const board = measure({ x: 2489, y: 800, patch: { items: { skateboard: 1 } } }, skate, 0.5, 1);
    const noBoard = measure({ x: 2489, y: 800 }, skate, 0.5, 1);
    const junker = measure({ x: 2398, y: 700, car: 'junker' }, down, 1.2, 0.5);
    const sports = measure({ x: 2398, y: 700, car: 'sports' }, down, 1.4, 0.5);
    const sidewalk = measure({ x: 2223, y: 700, car: 'junker' }, down, 1, 1);
    const path = measure({ x: 1484, y: 640, car: 'junker' }, down, 0.5, 0.4);
    // Reverse: the back key brakes, then reverses at 200 u/s.
    X.fresh();
    const c = SR.state.player.cars.junker; c.owned = true; c.x = 2398; c.y = 2800; c.a = Math.PI / 2;
    P.place(2398, 2800, 180); P.board('junker', true);
    X.step(60, { x: 0, y: -1 });
    const rev = P.v;
    // Getting in and out (C / Y within 64 u), the zoom easing out while driving, the knockdown.
    X.fresh();
    const j = SR.state.player.cars.junker; j.owned = true; j.x = 2398; j.y = 2800; j.a = 0;
    P.place(2398 + 100, 2800, 180);
    const far = SR.world.onAction('car');
    P.place(2398 + 50, 2800, 180);
    const inCar = SR.world.onAction('car') && P.car === 'junker' && SR.state.player.driving === 'junker';
    X.step(60);
    const zoom = SR.world.camera.zoom;
    X.step(30, { x: 1, y: 0 });
    const outCar = SR.world.onAction('car') && !P.car && SR.state.player.driving === null && P.carNear() === 'junker';
    const parked = [SR.state.player.cars.junker.x, SR.state.player.cars.junker.y];
    X.step(60);
    const zoomOut = SR.world.camera.zoom;
    P.knock();
    const kx = P.x;
    X.step(60, { x: 1, y: 0 });
    const knocked = P.x === kx;
    X.step(10, { x: 1, y: 0 });
    return { walk, board, noBoard, junker, sports, sidewalk, path, rev, far, inCar, zoom, outCar, parked, zoomOut, knocked, movedAfter: P.x !== kx };
  });
  const r = (a, b) => a / b;
  T.ok(Math.abs(speeds.walk - 280) / 280 < 0.02, 'walking: ' + speeds.walk.toFixed(1) + ' u/s (280)');
  T.ok(Math.abs(r(speeds.board, speeds.walk) - 2) / 2 < 0.02, 'skate / walk = ' + r(speeds.board, speeds.walk).toFixed(3) + ' (2)');
  T.ok(Math.abs(r(speeds.junker, speeds.walk) - 3) / 3 < 0.02, 'junker / walk = ' + r(speeds.junker, speeds.walk).toFixed(3) + ' (3)');
  T.ok(Math.abs(r(speeds.sports, speeds.walk) - 5) / 5 < 0.02, 'sports car / walk = ' + r(speeds.sports, speeds.walk).toFixed(3) + ' (5)');
  T.ok(Math.abs(speeds.noBoard - speeds.walk) < 1, 'holding skate without a board walks');
  T.ok(speeds.sidewalk > 150 && speeds.sidewalk <= 200 + 1e-6, 'a car on a sidewalk is capped at 200 u/s (' + speeds.sidewalk.toFixed(1) + ')');
  T.ok(Math.abs(speeds.path - 840 * 0.6) < 5, 'on a path the junker runs at 60 % (' + speeds.path.toFixed(1) + ')');
  T.ok(Math.abs(speeds.rev + 200) < 1e-6, 'the back key brakes, then reverses at 200 u/s');
  T.ok(speeds.far === false && speeds.inCar, 'C / Y gets into your car within 64 u, not from farther');
  T.ok(Math.abs(speeds.zoom - 0.8) < 0.01 && Math.abs(speeds.zoomOut - 1) < 0.01, 'driving eases the zoom one level out (1.0 → 0.8) and back');
  T.ok(speeds.outCar && speeds.parked[0] > 2398, 'getting out parks the car where it stands, beside you');
  T.ok(speeds.knocked && speeds.movedAfter, 'a car-hit knockdown freezes the player for 1.14 s');

  const people = await ev(() => {
    const SR = window.SR, X = window.W1W, P = SR.world.player;
    const had = SR.world.pedestrians;
    const ped = { id: 'p1', x: 2398, y: 2950, state: 'walk' };
    SR.world.pedestrians = { list: [ped], update() {} };   // a test fake of W2-City's module
    const s = X.fresh();
    const c = s.player.cars.junker; c.owned = true; c.x = 2398; c.y = 2700; c.a = Math.PI / 2;
    P.place(2398, 2700, 180); P.board('junker', true);
    const hp = s.stats.hp, karma = s.stats.karma, heat = s.stats.heat, before = { x: ped.x, y: ped.y };
    X.step(40, { x: 0, y: 1 });
    SR.world.pedestrians = had;
    return { moved: Math.hypot(ped.x - before.x, ped.y - before.y), state: ped.state, bark: ped.bark, hops: P.hops, same: s.stats.hp === hp && s.stats.karma === karma && s.stats.heat === heat };
  });
  T.ok(people.hops >= 1 && Math.abs(people.moved - 24) < 1e-6 && people.state === 'hop' && people.bark === 'toast.world.hey', 'a pedestrian hops 24 u aside from your car with a bark', people);
  T.ok(people.same, 'no HP, karma or Heat change');

  // ----------------------------------------------------------------------------------------------
  T.section('Park and enter at every kerb');
  const park = await ev(() => {
    const SR = window.SR, X = window.W1W, G = SR.world.geometry, D = SR.world.doors, P = SR.world.player;
    const bad = [];
    G.doors.forEach((d) => {
      const s = X.fresh();
      const c = s.player.cars.junker; c.owned = true;
      const along = d.face === 'E' || d.face === 'W' ? [0, 1] : [1, 0];
      c.x = d.kerb[0] - along[0] * 40; c.y = d.kerb[1] - along[1] * 40; c.a = 0;
      P.place(c.x, c.y, 180); P.board('junker', true);
      SR.world.update(1 / 60, { x: 0, y: 0 });
      const prompt = D.prompt && D.prompt.kind === 'park' && D.prompt.door === d.id;
      const ok = SR.world.onAction('interact');
      const e = D.last, row = s.player.cars.junker;
      if (!prompt || !ok || !e || e.id !== d.id || e.via !== 'park' || row.x !== Math.round(d.kerb[0]) || row.y !== Math.round(d.kerb[1]) ||
          s.player.driving !== null || P.car !== null || X.gone.length !== 1) bad.push([d.id, prompt, ok, e && e.id, row.x, row.y]);
    });
    // Driving along the pavement past a door, hugging its building, never enters it.
    const past = [];
    G.doors.filter((d) => d.face === 'E' || d.face === 'W').forEach((d) => {
      [1, -1].forEach((dir) => {
        const s = X.fresh(), c = s.player.cars.junker;
        c.owned = true; c.x = d.x + d.out[0] * 30; c.y = d.y - dir * 200; c.a = dir * Math.PI / 2;
        P.place(c.x, c.y, 180); P.board('junker', true);
        X.step(150, { x: 0, y: dir });
        if (D.entered.length) past.push(d.id + '/' + dir);
      });
    });
    // Driving into a door trigger does the same.
    const s = X.fresh(), m = G.doorById.mcsticks, c = s.player.cars.junker;
    c.owned = true; c.x = m.kerb[0]; c.y = m.kerb[1]; c.a = Math.PI;
    P.place(c.x, c.y, 270); P.board('junker', true);
    for (let i = 0; i < 240 && !D.last; i++) SR.world.update(1 / 60, { x: -1, y: 0 });
    return { bad, past, driveIn: D.last && D.last.id + '/' + D.last.via };
  });
  T.eq(park.bad, [], '"Park and enter" at every door\'s kerb: the car parks at the kerb and you enter on foot');
  T.eq(park.past, [], 'driving along the sidewalk past every east / west door (through its trigger) enters none');
  T.eq(park.driveIn, 'mcsticks/park', 'driving into a door\'s trigger parks and enters too');

  // ----------------------------------------------------------------------------------------------
  T.section('click-to-walk from the apartment to every door and every scrap');
  const clicks = await ev(() => {
    const SR = window.SR, X = window.W1W, G = SR.world.geometry, D = SR.world.doors, P = SR.world.player, F = SR.world.fall, N = SR.world.nav;
    const bad = [], times = [];
    G.doors.forEach((d) => {
      X.fresh();
      const b = G.buildings[d.building].masses[0].rect;
      const t0 = performance.now();
      const ok = P.walkTo((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);       // a click on the building
      times.push(performance.now() - t0);
      let i = 0;
      for (; i < 60 * 60 && !D.last && !F.active(); i++) SR.world.update(1 / 60, { x: 0, y: 0 });
      if (!ok || !D.last || D.last.id !== d.id || D.last.via !== 'route' || F.count) bad.push([d.id, ok, D.last && D.last.id, F.count, Math.round(P.x), Math.round(P.y)]);
    });
    const scraps = [];
    G.map.scraps.forEach((sc) => {
      X.fresh();
      const ok = P.walkTo(sc.x, sc.y);
      for (let i = 0; i < 60 * 60 && (P.path.length) && !F.active(); i++) SR.world.update(1 / 60, { x: 0, y: 0 });
      const d = Math.hypot(P.x - sc.x, P.y - sc.y);
      if (!ok || d > 32 || F.count || D.entered.length) scraps.push([sc.n, ok, Math.round(d), F.count]);
    });
    // Any movement input cancels a route; a click into the sky walks to the nearest safe ground.
    X.fresh();
    P.walkTo(3840, 1300);
    SR.world.update(1 / 60, { x: 1, y: 0 });
    const cancelled = P.path.length === 0 && P.route === null;
    const sky = P.walkTo(300, 300);
    const end = P.path.length ? P.path[P.path.length - 1] : null;
    // Routing time in the page: cross-map routes after the JIT has warmed up (past the 1 s cache).
    const far = [[720, 460], [4125, 4372], [1060, 3810], [4180, 890], [3672, 3190], [998, 1096], [520, 3900]], rt = [];
    for (let rep = 0; rep < 3; rep++) {
      far.forEach((a) => far.forEach((b) => {
        if (a === b) return;
        N.tick(2);
        const t0 = performance.now();
        N.path({ x: a[0], y: a[1] }, { x: b[0], y: b[1] });
        if (rep) rt.push(performance.now() - t0);
      }));
    }
    rt.sort((a, b) => a - b);
    return { bad, scraps, cancelled, sky, skyEnd: end && G.onGround(end.x, end.y) && G.edgeDistance(end.x, end.y) >= 40,
      maxMs: Math.max.apply(null, times), routeMed: rt[rt.length >> 1], routeMax: rt[rt.length - 1], cache: N.stats };
  });
  T.eq(clicks.bad, [], 'a click on each of the 15 buildings walks there and enters its door');
  T.eq(clicks.scraps, [], 'a click on each Torn Scrap walks there (within 32 u), without falling');
  T.ok(clicks.cancelled, 'any movement input cancels the route');
  T.ok(clicks.sky && clicks.skyEnd, 'a click in the sky walks to the nearest safe ground');
  T.ok(clicks.maxMs < 20, 'a click-to-walk (reachability, route, string pulling) takes ' + clicks.maxMs.toFixed(1) + ' ms at most, cold');
  T.ok(clicks.routeMed <= 2, 'nav.path across the map: median ' + clicks.routeMed.toFixed(2) + ' ms (budget 2 ms), max ' + clicks.routeMax.toFixed(2) + ' ms');

  // ----------------------------------------------------------------------------------------------
  T.section('camera');
  const cam = await ev(() => {
    const SR = window.SR, X = window.W1W, C = SR.world.camera, G = SR.world.geometry;
    X.fresh();
    const b = G.bounds, out = {};
    C.target = { x: -9000, y: -9000 };
    X.step(600);
    out.min = [C.x, C.y];
    C.target = { x: 99999, y: 99999 };
    X.step(600);
    out.max = [C.x, C.y];
    C.target = null;
    out.want = [b[0] - 480, b[1] - 480, b[2] + 480, b[3] + 480];
    // The spring settles on the player (dead zone 96 × 64).
    SR.world.player.place(2000, 2000, 180);
    X.step(240);
    out.settle = Math.max(Math.abs(C.x - 2000), Math.abs(C.y - 2000));
    out.levels = [C.setLevel(0), C.zoomIn(), C.zoomIn(), C.zoomIn(), C.cycle()];
    C.setLevel(1);
    C.snap(2000, 2000);
    const s0 = C.toScreen(2000, 2000, 100), s1 = C.toScreen(2100, 2000, 0), w0 = C.toWorld(640, 360);
    out.proj = [s0.x, s0.y, s1.x, Math.round(w0.x), Math.round(w0.y)];
    return out;
  });
  T.eq(cam.min, [cam.want[0], cam.want[1]], 'the camera centre clamps to the island bounds − 480');
  T.eq(cam.max, [cam.want[2], cam.want[3]], 'and to the island bounds + 480');
  T.ok(cam.settle <= 48 + 1e-3, 'the spring settles at the dead zone around the player (' + cam.settle.toFixed(1) + ' u ≤ 48)');
  T.eq(cam.levels, [0, 1, 2, 2, 0], 'three zoom levels (0.8 / 1.0 / 1.25), cycling');
  T.eq(cam.proj, [640, 310, 740, 2000, 2000], '3/4 projection: screenY = y - 0.5 z around the camera; the stage centre maps back to it');

  // ----------------------------------------------------------------------------------------------
  T.section('the real building scene and zero errors');
  const real = await ev(() => {
    const SR = window.SR, X = window.W1W, D = SR.world.doors, G = SR.world.geometry;
    X.fresh();
    D.go = X.realGo;
    const m = G.doorById.mcsticks;
    X.place(m.x + 90, m.y);
    for (let i = 0; i < 60 && !D.last; i++) SR.world.update(1 / 60, { x: -1, y: 0 });
    const stack = SR.scenes.stack();
    D.go = function (r) { X.gone.push(r); };
    const top = SR.scenes.top();
    return { stack, params: top && top.params, sync: [SR.state.player.x, SR.state.player.y] };
  });
  T.eq(real.stack, ['building'], 'walking into McSticks opens the building scene');
  T.eq(real.params && real.params.id, 'mcsticks', 'with { id: mcsticks, params: {} }');
  T.ok(real.sync[0] >= 2120 && real.sync[0] <= 2168 && real.sync[1] === 2050, 'the position is written to state.player on entering', real.sync);
  const perf = await ev(() => {
    const SR = window.SR, X = window.W1W;
    X.fresh();
    SR.scenes.go('title', null, { transition: false });
    const t0 = performance.now();
    X.step(600, { x: 0.7, y: 0.7 });
    return (performance.now() - t0) / 600;
  });
  T.ok(perf < 2, 'a world step (player, fall, doors, camera) costs ' + perf.toFixed(3) + ' ms (budget 2 ms for every world system)');

  // Contact sheet captures (shots/W1-W, git-ignored).
  const sheet = await h.open({ url: pathToFileURL(path.join(h.ROOT, 'tests/sheets/world.html')).href + '?shot', width: 1280, height: 1152 });
  const shots = [['world-map', null, ''], ['world-nav', null, 'nav'], ['world-main-street', [2050, 600, 2950, 4150], ''], ['world-northwest', [440, 160, 2200, 1400], 'nav'],
    ['world-civic', [3350, 600, 4450, 2150], ''], ['world-park', [440, 2200, 2200, 4200], ''], ['world-edgeview', [3300, 2500, 4460, 4480], 'nav']];
  for (const [name, view, layers] of shots) {
    const lay = {};
    layers.split(',').filter(Boolean).forEach((l) => { lay[l] = true; });
    await sheet.page.evaluate(([v, l]) => window.sheet.render(v, l), [view, lay]);
    await sheet.page.locator('canvas[data-id="sheet-map"]').screenshot({ path: path.join(h.ROOT, 'shots', 'W1-W', name + '.png') });
  }
  T.eq(sheet.errors(), [], 'the world sheet opens from disk with zero console errors');
  await sheet.close();

  T.eq(t.errors(), [], 'zero console errors, page errors and failed requests');
  await t.close();
  T.done();
})().catch((e) => { console.error(e); process.exit(1); });
