// js/world/pedestrians.js — owner: W2-City. SR.world.pedestrians: the city's walkers (GDD §3.11,
// BALANCE B-22). A pool of 40; the number around the camera follows the hour (06-09: 18, 09-17: 26,
// 17-21: 30, 21-02: 12, 02-06: 4) × 0.5 in rain × the quality preset's crowd factor (Low 0.5). They
// walk the sidewalk graph (js/world/geometry.js), pause at shop windows and benches, cross roads
// only on zebras (waiting at the kerb until every car can stop: SR.world.traffic.zebraClear), keep
// 20 u apart, give way to the player, and hop aside from the player's car (W1-W's hopAside sets
// state 'hop' and the "Hey!" bark; the timers run here). Seven archetypes in P0: office stick (tie),
// student (backpack), jogger, tourist (camera), shopper (bag), night owl (glow stick) and busker
// (park and plaza only); police officers are W3-Crime's (flag `police`). New walkers appear out of
// view and far ones are recycled. P1 (flag `cityReacts`): at karma ≥ +50 people wave, at ≤ -50 they
// step away and one in five scurries, idle people within 80 u turn toward the player, and one-line
// barks (bark.ped.*, en-city.js) show at most every 4 s. Randomness: SR.rng.world. The city scene
// switches the simulation on (`live`). Node-safe (no DOM).
(function () {
  'use strict';
  var SR = window.SR;

  // Engine and presentation constants (CONTRACT D49); the game numbers are SR.tuning.crowd (B-22).
  var MARGIN = 420;            // u around the view where walkers live (off-screen spawns and recycling)
  var VIEW_PAD = 60;           // a spawn "out of view" is at least this far outside the view
  var SPAWN_SEC = 0.12;        // at most one new (or dropped) walker this often after the first fill
  var ARRIVE = 18;             // u: a node is reached (wider than the 20 u spacing's half: a crowd at a node never circles it)
  var SHOP_R = 150, BENCH_R = 90;   // u: a node near a shop door or a bench invites a pause
  var PAUSE_SHOP = 0.35, PAUSE_ANY = 0.06, PAUSE_MIN = 1.5, PAUSE_MAX = 4.5;
  var BUSK_MIN = 20, BUSK_MAX = 60;  // s a busker plays in one spot
  var PATIENCE = 6;            // s at a kerb before a walker turns back
  var CROSS_P = 0.35;          // the chance a walker at a kerb crosses rather than turning along it
  var CROSS_MAX = 12;          // s: a crossing that takes longer releases the zebra
  var JOG_X = 1.8;             // joggers run
  var PLAYER_PUSH = 10;        // u of room a walker gives the player on foot
  var HOP_SEC = 0.6, BARK_SEC = 1.5;
  var REACT_R = 120, WAVE_SEC = 1.2, FLEE_X = 2;   // P1 reactions (cityReacts)
  // GDD §3.11's numbers until tuning.crowd has them (docs/requests/W2-City.md 6): idle people within
  // 80 u turn toward the player; at karma ≤ -50 one walker in five scurries (rolled once per encounter).
  var TURN_R = 80, SCURRY_P = 0.2;
  var BARK_R = 200;            // P1: a bark comes from someone this close
  var FAMOUS_P = 0.4;          // P1: how often a walker who recognises an Executive (or better) says so
  var BUMP_SEC = 2;            // P1: a walker the player walked into barks "bumped" lines this long after

  // The archetypes (GDD §3.11): accessories on the rig (W1-A), hours they are about (clock minutes,
  // `to` < `from` wraps past midnight) and weights.
  var ARCH = [
    { id: 'office', acc: ['tie'], alt: ['glasses'], from: 420, to: 1170, w: 3 },
    { id: 'student', acc: ['backpack'], alt: ['cap', 'headphones'], from: 480, to: 1320, w: 3 },
    { id: 'jogger', acc: ['headband'], alt: ['headphones'], from: 360, to: 1200, w: 1.5, speed: JOG_X },
    { id: 'tourist', acc: ['camera'], alt: ['sunglasses', 'cap'], from: 540, to: 1140, w: 2 },
    { id: 'shopper', acc: ['bag'], alt: ['scarf'], from: 540, to: 1260, w: 3 },
    { id: 'nightowl', acc: ['glowstick'], alt: ['hood', 'beanie'], from: 1200, to: 240, w: 3 },
    { id: 'busker', acc: ['fedora'], alt: ['scarf'], from: 600, to: 1320, w: 0.8, busker: true },
  ];
  var HEADS = ['sage', 'mustard', 'sand', 'grey', 'mint', 'olive', 'peach', 'clay', 'moss', 'stone', 'butter', 'taupe'];
  var COLS = ['acc.red', 'acc.navy', 'acc.denim', 'acc.green', 'acc.teal', 'acc.purple', 'acc.orange', 'acc.pink', 'acc.tan', 'acc.charcoal'];

  function T() { return SR.tuning.crowd; }
  function W() { return SR.world; }
  function G() { return SR.world.geometry; }
  function rng() { return SR.rng.world; }

  var PD = {
    /**
     * The live walkers (the renderer's list), with ARCHITECTURE §8.2's fields: { id, x, y, px, py,
     * node, next, speed, archetype, look, facing, state, visible, bark, hopT, zebra, n, ... }.
     */
    list: [],
    /** The city scene switches the simulation on while it runs. */
    live: false,
    /** Counters for tests. */
    stats: { spawned: 0, recycled: 0, crossed: 0, waved: 0, barks: 0 },
    /** The last bark shown ({ id, key, t }) (P1). */
    lastBark: null,
  };

  var free = [];
  var nextId = 1;
  var meta = null;             // per graph node: { shop: [x, y] | null, bench, busk } and the zebra edges
  var needReset = true;
  var spawnT = 0;
  var barkT = 0;
  var VIEW = [0, 0, 0, 0], SIM = [0, 0, 0, 0];

  // ------------------------------------------------------------------------------------------------
  // Graph facts: zebra edges, shop windows, benches, busking spots
  // ------------------------------------------------------------------------------------------------
  function buildMeta() {
    var g = G(), gr = g.graph, map = g.map, doors = g.doors;
    var benches = (map.props || []).filter(function (p) { return p.type === 'bench'; });
    var park = null, plaza = null;
    (map.pockets || []).forEach(function (p) { if (p.id === 'stickwoodPark') park = p.rects[0]; });
    (map.streets || []).forEach(function (s) { if (s.id === 'originPlaza') plaza = s.rect; });
    meta = { nodes: [], zebra: {} };
    gr.nodes.forEach(function (n) {
      var m = { shop: null, bench: null, busk: false };
      for (var i = 0; i < doors.length; i++) {
        var d = doors[i];
        if (d.homes || Math.hypot(d.x - n.x, d.y - n.y) > SHOP_R) continue;
        m.shop = [d.x, d.y];
        break;
      }
      for (var k = 0; k < benches.length; k++) if (Math.hypot(benches[k].x - n.x, benches[k].y - n.y) < BENCH_R) { m.bench = [benches[k].x, benches[k].y]; break; }
      m.busk = !!((park && g.util.inRect(n.x, n.y, park)) || (plaza && g.util.inRect(n.x, n.y, plaza)));
      meta.nodes.push(m);
    });
    gr.edges.forEach(function (e) { if (e[2]) { meta.zebra[e[0] + ':' + e[1]] = e[2]; meta.zebra[e[1] + ':' + e[0]] = e[2]; } });
  }

  // ------------------------------------------------------------------------------------------------
  // Conditions: the hour's count, the weather, the preset
  // ------------------------------------------------------------------------------------------------
  function clockMin() {
    var s = SR.state;
    if (s && s.clock) return s.clock.min % 1440;
    var v = SR.render && SR.render.view;
    return v && typeof v.min === 'number' ? v.min % 1440 : 720;
  }
  function within(m, from, to) { return from <= to ? m >= from && m < to : m >= from || m < to; }
  function rainy() {
    var s = SR.state, w = SR.features && SR.features.weather && s && s.world ? s.world.weather : 'clear';
    return w === 'rain' || w === 'storm';
  }
  /** @returns {number} the quality preset's crowd factor (ARCHITECTURE §2; High 1, Medium 1, Low 0.5). */
  function crowdFactor() {
    var Q = SR.quality;
    if (Q && Q.params && typeof Q.params.crowd === 'number') return Q.params.crowd;
    var pre = T().preset, p = Q && Q.preset;
    return p && pre && typeof pre[p] === 'number' ? pre[p] : 1;
  }

  /**
   * B-22: how many walkers there are around the camera now.
   * @param {number=} min clock minute (default: now)
   * @returns {number} the hour's count × rain × the preset's crowd factor, at most maxPeds
   */
  PD.target = function (min) {
    var m = min === undefined ? clockMin() : ((min % 1440) + 1440) % 1440, t = T(), n = 0;
    for (var i = 0; i < t.byHour.length; i++) { var r = t.byHour[i]; if (within(m, r.from, r.to)) { n = r.n; break; } }
    if (rainy()) n *= t.rain;
    return Math.min(t.maxPeds, Math.round(n * crowdFactor()));
  };

  // ------------------------------------------------------------------------------------------------
  // Looks: one stable look object per archetype, head and accessory colour (the rig caches by identity)
  // ------------------------------------------------------------------------------------------------
  var looks = {};
  function lookOf(a, h, alt, col, hat) {
    var key = a.id + '|' + h + '|' + alt + '|' + col + (hat ? '|hat' : '');
    var l = looks[key];
    if (l) return l;
    var acc = a.acc.slice();
    if (alt >= 0) acc.push(a.alt[alt]);
    if (hat && acc.indexOf('tophat') < 0) acc.push('tophat');   // Mandatory Hats (GDD §3.14; P1 decree)
    var c = {};
    c[a.acc[0]] = COLS[col];
    l = looks[key] = { head: 'npc.' + HEADS[h], acc: acc, col: c };
    return l;
  }
  function hats() {
    var s = SR.state, d = s && s.election && s.election.decrees;
    return !!(d && d.indexOf('mandatoryHats') >= 0);
  }

  // ------------------------------------------------------------------------------------------------
  // Spawning and recycling
  // ------------------------------------------------------------------------------------------------
  function boxes() {
    var cam = W().camera, rv = SR.render && SR.render.view;
    var cx = rv && typeof rv.x === 'number' ? rv.x : cam.x, cy = rv && typeof rv.y === 'number' ? rv.y : cam.y;
    var z = cam.zoom || 1, hw = SR.W / 2 / z, hh = SR.H / 2 / z;
    VIEW[0] = cx - hw - VIEW_PAD; VIEW[1] = cy - hh - VIEW_PAD - 60; VIEW[2] = cx + hw + VIEW_PAD; VIEW[3] = cy + hh + VIEW_PAD;
    SIM[0] = cx - hw - MARGIN; SIM[1] = cy - hh - MARGIN; SIM[2] = cx + hw + MARGIN; SIM[3] = cy + hh + MARGIN;
  }
  function inBox(b, x, y) { return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]; }

  function pickArch(m, node) {
    var tot = 0, i, a;
    for (i = 0; i < ARCH.length; i++) { a = ARCH[i]; if (within(m, a.from, a.to) && (!a.busker || meta.nodes[node].busk)) tot += a.w; }
    var r = rng().float() * tot;
    for (i = 0; i < ARCH.length; i++) {
      a = ARCH[i];
      if (!within(m, a.from, a.to) || (a.busker && !meta.nodes[node].busk)) continue;
      r -= a.w;
      if (r < 0) return a;
    }
    return ARCH[4];
  }

  /** A random graph node in the living area (out of view unless `inView`), or -1. */
  function pickNode(inView) {
    var nodes = G().graph.nodes;
    for (var k = 0; k < 24; k++) {
      var i = rng().int(0, nodes.length - 1), n = nodes[i];
      if (!inBox(SIM, n.x, n.y)) continue;
      if (!inView && inBox(VIEW, n.x, n.y)) continue;
      return i;
    }
    return -1;
  }

  function neighbour(p, avoid) {
    var adj = G().graph.adj[p.node], n = adj.length;
    if (!n) return p.node;
    if (n === 1) return adj[0];
    var i = rng().int(0, n - 1);
    if (adj[i] === avoid) i = (i + 1 + rng().int(0, n - 2)) % n;
    return adj[i];
  }

  function spawn(inView) {
    if (PD.list.length >= T().maxPeds) return null;
    var node = pickNode(inView);
    if (node < 0) return null;
    var g = G().graph, n = g.nodes[node], m = clockMin(), a = pickArch(m, node), sp = T().speed;
    var p = free.pop() || {};
    p.id = 'ped' + nextId; p.n = nextId; nextId++;
    p.archetype = a.id; p.busker = !!a.busker;
    p.look = lookOf(a, rng().int(0, HEADS.length - 1), rng().int(-1, a.alt.length - 1), rng().int(0, COLS.length - 1), hats());
    p.x = p.px = n.x; p.y = p.py = n.y;
    p.node = node; p.from = -1; p.next = node;
    p.speed = rng().int(sp[0], sp[1]) * (a.speed || 1);
    p.mode = 'walk'; p.state = 'walk'; p.t = 0; p.zebra = null; p.zebraAt = null; p.crossT = 0;
    p.facing = 180; p.hopT = 0; p.hopUntil = 0; p.bark = null; p.barkT = 0;
    p.waved = false; p.flee = false; p.shy = false; p.bumpT = -1e9; p.visible = true; p.active = true; p.phase = rng().float() * 2;
    if (p.busker) { p.mode = 'pause'; p.state = 'pause'; p.t = rng().int(BUSK_MIN, BUSK_MAX); }
    else choose(p);                                   // a crossing starts at the kerb, like any other
    PD.list.push(p);
    PD.stats.spawned++;
    return p;
  }

  function drop(i) {
    var p = PD.list[i];
    PD.list.splice(i, 1);
    p.zebra = null;
    free.push(p);
    PD.stats.recycled++;
  }

  /** Removes every walker and fills the living area afresh on the next step (a new game, a new day). */
  PD.reset = function () {
    while (PD.list.length) drop(PD.list.length - 1);
    needReset = false;
    boxes();
    var n = PD.target();
    for (var i = 0; i < n; i++) spawn(true);
    spawnT = SPAWN_SEC;
    barkT = 0;
  };
  /** Clears the walkers and zeroes the counters (tests). */
  PD.clear = function () { PD.reset(); Object.keys(PD.stats).forEach(function (k) { PD.stats[k] = 0; }); };
  /** Asks for a fresh fill on the next step. */
  PD.invalidate = function () { needReset = true; };

  // ------------------------------------------------------------------------------------------------
  // Walking
  // ------------------------------------------------------------------------------------------------
  function faceTo(p, x, y) { p.facing = (Math.atan2(x - p.x, -(y - p.y)) * 180 / Math.PI + 360) % 360; }

  function pause(p, sec, look) {
    p.mode = 'pause'; p.state = 'pause'; p.t = sec;
    if (look) faceTo(p, look[0], look[1]);
  }

  /** Reached p.next: pause (a shop window, a bench, now and then), then pick the next edge. */
  function arrive(p) {
    p.from = p.node; p.node = p.next;
    if (p.zebra) { p.zebra = null; PD.stats.crossed++; }
    var m = meta.nodes[p.node], r = rng().float();
    if (m.shop && r < PAUSE_SHOP) { pause(p, rng().float(PAUSE_MIN, PAUSE_MAX), m.shop); return; }
    if (m.bench && r < PAUSE_SHOP) { pause(p, rng().float(PAUSE_MIN, PAUSE_MAX), m.bench); return; }
    if (r < PAUSE_ANY) { pause(p, rng().float(PAUSE_MIN, PAUSE_MAX), null); return; }
    choose(p);
  }

  function choose(p) {
    p.next = neighbour(p, p.from);
    var z = meta.zebra[p.node + ':' + p.next];
    // Most walkers keep to their side of the street: a crossing is taken one time in three.
    if (z && G().graph.adj[p.node].length > 1 && rng().float() > CROSS_P) {
      var alt = neighbour(p, p.next);
      if (!meta.zebra[p.node + ':' + alt]) { p.next = alt; z = null; }
    }
    if (z) { p.mode = 'wait'; p.state = 'pause'; p.t = 0; p.zebraAt = z; var n = G().graph.nodes[p.next]; faceTo(p, n.x, n.y); }
    else { p.mode = 'walk'; p.state = 'walk'; }
  }

  function step(p, dt, player, reacts) {
    if (p.barkT > 0) { p.barkT -= dt; if (p.barkT <= 0) { p.bark = null; p.barkT = 0; } }
    if (p.hopT > 0) {
      p.hopT -= dt;
      if (p.hopT <= 0) { p.hopT = 0; p.state = p.mode === 'walk' ? 'walk' : 'pause'; }
      return;
    }
    if (p.state === 'wave') { p.t2 -= dt; if (p.t2 <= 0) p.state = p.mode === 'walk' ? 'walk' : 'pause'; }
    if (reacts && player) react(p, player);
    if (p.mode === 'pause') {
      p.t -= dt;
      if (p.t <= 0) { if (p.busker) p.t = rng().int(BUSK_MIN, BUSK_MAX); else choose(p); }
      return;
    }
    if (p.mode === 'wait') {
      p.t += dt;
      var TR = W().traffic;
      if (!TR || typeof TR.zebraClear !== 'function' || TR.zebraClear(p.zebraAt)) {
        p.zebra = p.zebraAt; p.zebraAt = null; p.crossT = 0; p.mode = 'walk'; p.state = p.state === 'wave' ? 'wave' : 'walk';
      } else if (p.t > PATIENCE) {
        var back = p.from >= 0 ? p.from : neighbour(p, p.next);
        p.zebraAt = null; p.next = back; p.from = -1;
        if (meta.zebra[p.node + ':' + p.next]) { p.t = 0; p.zebraAt = meta.zebra[p.node + ':' + p.next]; }
        else { p.mode = 'walk'; p.state = 'walk'; }
      }
      return;
    }
    var n = G().graph.nodes[p.next], dx = n.x - p.x, dy = n.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
    var v = p.speed * (p.flee ? FLEE_X : 1), st = v * dt;
    if (d <= st) { p.x = n.x; p.y = n.y; arrive(p); return; }
    if (d <= ARRIVE) { arrive(p); return; }
    // A crossing never lasts: whatever held this walker up, it lets the cars go.
    if (p.zebra && (p.crossT += dt) > CROSS_MAX) { p.zebra = null; PD.stats.crossed++; }
    p.x += dx / d * st; p.y += dy / d * st;
    if (p.state !== 'wave') p.facing = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  }

  /**
   * Moves a walker `push` u away from a neighbour. A walker on its way gives way sideways (keeping
   * to its right), never backwards, so two meeting head-on on a crossing pass each other.
   */
  function sidestep(p, ux, uy, push) {
    if (p.mode === 'walk') {
      var n = G().graph.nodes[p.next], hx = n.x - p.x, hy = n.y - p.y, hl = Math.sqrt(hx * hx + hy * hy);
      if (hl > 1e-6) {
        hx /= hl; hy /= hl;
        var along = ux * hx + uy * hy, sx = ux - along * hx, sy = uy - along * hy, sl = Math.sqrt(sx * sx + sy * sy);
        if (sl < 0.3) { sx = -hy; sy = hx; sl = 1; }     // head-on: keep right
        ux = sx / sl; uy = sy / sl;
      }
    }
    p.x += ux * push; p.y += uy * push;
  }

  /** @returns {number} the karma threshold of the crowd's reactions (B-04 `karma.crowd`: ±50, the only one, GDD §3.11). */
  function crowdKarma() { return SR.tuning.karma.crowd; }

  /** P1 (cityReacts, GDD §3.11): wave at karma ≥ +50, step away at ≤ -50 (1 in 5 scurries), idle ones turn to look. */
  function react(p, P) {
    var dx = P.x - p.x, dy = P.y - p.y, d2 = dx * dx + dy * dy, s = SR.state, k = s && s.stats ? s.stats.karma : 0;
    var th = crowdKarma();
    if (d2 > REACT_R * REACT_R) {
      if (p.state === 'flee') p.state = p.mode === 'walk' ? 'walk' : 'pause';
      p.flee = false; p.shy = false;
      return;
    }
    if (k >= th && !p.waved) { p.waved = true; p.state = 'wave'; p.t2 = WAVE_SEC; faceTo(p, P.x, P.y); PD.stats.waved++; }
    else if (k <= -th && p.mode === 'walk') {
      // One roll per encounter (until the walker is out of range again): one in five scurries.
      if (!p.shy) { p.shy = true; p.flee = rng().float() < (typeof T().scurry === 'number' ? T().scurry : SCURRY_P); }
      if (p.flee) p.state = 'flee';
      // A walker on a zebra finishes crossing (turning back there would leave the crosswalk).
      if (p.zebra) return;
      // step away: head for the neighbour farthest from the player
      var adj = G().graph.adj[p.node], best = p.next, bd = -1;
      for (var i = 0; i < adj.length; i++) {
        var q = G().graph.nodes[adj[i]], e = (q.x - P.x) * (q.x - P.x) + (q.y - P.y) * (q.y - P.y);
        if (e > bd && !meta.zebra[p.node + ':' + adj[i]]) { bd = e; best = adj[i]; }
      }
      p.next = best;
    } else if (p.mode === 'pause') {
      var tr = typeof T().turnRange === 'number' ? T().turnRange : TURN_R;
      if (d2 < tr * tr) faceTo(p, P.x, P.y);
    }
  }

  /** P1 barks (GDD §3.11): one line, at most one every 4 s, from someone near the player, by context. */
  function bark(dt, P) {
    barkT -= dt;
    if (barkT > 0 || !P) return;
    barkT = T().barkIntervalSec;
    var best = null, bd = BARK_R * BARK_R;
    for (var i = 0; i < PD.list.length; i++) {
      var p = PD.list[i], d2 = (p.x - P.x) * (p.x - P.x) + (p.y - P.y) * (p.y - P.y);
      if (d2 < bd && p.hopT <= 0) { bd = d2; best = p; }
    }
    if (!best) return;
    var key = barkKey(best);
    if (!key) return;
    best.bark = key; best.barkT = BARK_SEC;
    PD.stats.barks++;
    PD.lastBark = { id: best.id, key: key, t: W().time };
  }

  /** The bark's context: bumped into, a famous face, the karma band, the weather, the hour, the archetype. */
  function barkKey(p) {
    var s = SR.state, k = s && s.stats ? s.stats.karma : 0, m = clockMin(), r = rng().int(1, 3), th = crowdKarma();
    var exec = false;
    if (s && s.job && s.job.ranks) {
      var lad = SR.tuning.jobs && SR.tuning.jobs.ladder && SR.tuning.jobs.ladder.nli;
      exec = !!(lad && s.job.ranks.nli && lad.indexOf(s.job.ranks.nli) >= lad.indexOf('exec'));
    }
    var key;
    if (W().time - p.bumpT < BUMP_SEC) key = 'bark.ped.bumped.' + r;
    else if (exec && rng().float() < FAMOUS_P) key = 'bark.ped.famous.' + r;
    else if (k >= th) key = 'bark.ped.good.' + r;
    else if (k <= -th) key = 'bark.ped.bad.' + r;
    else if (rainy()) key = 'bark.ped.rain.' + r;
    else if (m < 600) key = 'bark.ped.morning.' + r;
    else if (m >= 1200 || m < 300) key = 'bark.ped.night.' + r;
    else key = 'bark.ped.' + p.archetype + '.' + r;
    return SR.text && SR.text.has && SR.text.has(key) ? key : null;
  }

  // ------------------------------------------------------------------------------------------------
  // The step
  // ------------------------------------------------------------------------------------------------
  /**
   * One fixed step of the crowd (called by SR.world.update while the city runs).
   * @param {number} dt seconds
   */
  PD.update = function (dt) {
    if (!PD.live || !G().built || !G().graph) return;
    if (!meta) buildMeta();
    if (needReset) PD.reset();
    boxes();
    var s = SR.state, P = W().player, F = W().fall;
    var player = s && P && !P.car && !(F && F.active && F.active()) ? P : null;
    var reacts = !!(SR.features && SR.features.cityReacts);
    var sep = T().separation, pr = (W().cfg || W().readCfg()).playerRadius, i, j, p, q;
    for (i = 0; i < PD.list.length; i++) {
      p = PD.list[i];
      p.px = p.x; p.py = p.y;
      step(p, dt, player, reacts);
    }
    // Keep 20 u apart and give the player room (walkers yield; the player is never pushed).
    for (i = 0; i < PD.list.length; i++) {
      p = PD.list[i];
      if (p.hopT > 0) continue;
      for (j = i + 1; j < PD.list.length; j++) {
        q = PD.list[j];
        var dx = q.x - p.x, dy = q.y - p.y;
        if (Math.abs(dx) >= sep || Math.abs(dy) >= sep) continue;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d >= sep || q.hopT > 0) continue;
        var push = (sep - d) / 2, ux = d > 1e-6 ? dx / d : 1, uy = d > 1e-6 ? dy / d : 0;
        sidestep(p, -ux, -uy, push);
        sidestep(q, ux, uy, push);
      }
      if (player) {
        var r = pr + PLAYER_PUSH, ex = p.x - player.x, ey = p.y - player.y;
        if (Math.abs(ex) < r && Math.abs(ey) < r) {
          var e = Math.sqrt(ex * ex + ey * ey);
          if (e < r) {
            var nx = e > 1e-6 ? ex / e : 0, ny = e > 1e-6 ? ey / e : 1;
            var tx = player.x + nx * r, ty = player.y + ny * r;
            if (G().walkable(tx, ty, 4)) { p.x = tx; p.y = ty; }
            p.bumpT = W().time;                          // P1 barks: "Hey, watch the crease!"
          }
        }
      }
    }
    if (reacts) bark(dt, player);
    // Recycle far walkers; keep the count at the hour's target (spawn out of view, drop out of view).
    for (i = PD.list.length - 1; i >= 0; i--) {
      p = PD.list[i];
      if (!inBox(SIM, p.x, p.y)) drop(i);
    }
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = SPAWN_SEC;
      var target = PD.target();
      if (PD.list.length < target) spawn(false);
      else if (PD.list.length > target) {
        for (i = PD.list.length - 1; i >= 0; i--) {
          p = PD.list[i];
          if (!inBox(VIEW, p.x, p.y) && !p.zebra) { drop(i); break; }
        }
      }
    }
  };

  /** @returns {object|null} the walker with an id (tests). */
  PD.get = function (id) { for (var i = 0; i < PD.list.length; i++) if (PD.list[i].id === id) return PD.list[i]; return null; };
  /** @returns {string[]} the archetype ids. */
  PD.archetypes = function () { return ARCH.map(function (a) { return a.id; }); };

  SR.world.pedestrians = PD;

  SR.onBoot(30, function () {
    if (!SR.events || typeof SR.events.on !== 'function') return;
    SR.events.on('save:loaded', function () { needReset = true; });
    SR.events.on('day:started', function () { needReset = true; });
  }, { headless: true });
})();
