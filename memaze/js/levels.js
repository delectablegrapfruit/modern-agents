/* Memaze — level design. Chapters of ten levels, the tenth a boss maze; a new mechanic every few levels; remix
 * modifiers past level 35; Gauntlet depths. And fitting the mechanics into a generated maze (keys and doors, switches
 * and their bridges, moving platforms, one-way gates, ice, darkness, portals) together with a route that is sure to
 * solve it, which also sets par and the time limit. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { rng, hashStr, hashInts, clamp, lerp, segDist2 } = MZ;
  const Gen = MZ.Gen;
  const BALL_R = Gen.BALL_R;

  const CHAPTER = 10;
  // The order mechanics arrive in: each is introduced on its own level, then mixes in with the others.
  const MECHS = [
    { id: 'keys', name: 'Keys and doors', from: 5 },
    { id: 'blink', name: 'Vanishing bridges', from: 8 },
    { id: 'gates', name: 'One-way gates', from: 12 },
    { id: 'items', name: 'Item puzzles', from: 14 },
    { id: 'switches', name: 'Switches', from: 16 },
    { id: 'movers', name: 'Moving platforms', from: 21 },
    { id: 'portals', name: 'Portals', from: 25 },
    { id: 'ice', name: 'Ice', from: 28 },
    { id: 'dark', name: 'Darkness', from: 32 },
  ];
  const REMIX_FROM = 36;
  const MODS = {
    narrow: 'Narrow', rush: 'Rush', nomap: 'No map', blackout: 'Blackout', frost: 'Frost', flicker: 'Flicker', mirror: 'Mirror',
  };
  const CHAPTERS = ['First Steps', 'Locks and Levers', 'Moving Parts', 'Cold and Dark'];
  // Each chapter leans on its own layouts and shapes (still mixed with the others once they're unlocked).
  const THEMES = [
    { lat: ['square', 'tri'], mask: ['rect', 'circle', 'diamond', 'cross', 'heart', 'ring', 'star'] },
    { lat: ['hex', 'tri'], mask: ['wave', 'eight', 'crescent', 'hourglass', 'star', 'cross'] },
    { lat: ['polar', 'organic'], mask: ['circle', 'ring', 'blob', 'spiral', 'cheese'] },
    { lat: ['organic', 'hex'], mask: ['islands', 'blob', 'cheese', 'crescent', 'spiral'] },
  ];
  const KEY_COLORS = ['#ffc53d', '#3cf2ff', '#ff7ad9'];
  const GAP_MAX = 300; // the longest missing corridor (node to node): within a Launch's reach, and a carpet's float
  // Where keys and doors act, in world units, matching how they're drawn (render.js, ICON): a shut door blocks this far
  // either side of its bar (its dark rim); a key is picked up when the picture overlaps a circle this big around it.
  const DOOR_R = 16, KEY_R = 20;
  const SWITCH_COLORS = ['#b388ff', '#7dffb5'];
  const PORTAL_COLORS = ['#ff9f43', '#5ee7ff', '#c77dff'];
  const GAUNTLET = {
    easy: { name: 'Easy', start: 2, span: [1, 14], lives: Infinity },
    normal: { name: 'Normal', start: 6, span: [4, 26], lives: 5 },
    hard: { name: 'Hard', start: 16, span: [12, 42], lives: 3 },
    extreme: { name: 'Extreme', start: 30, span: [26, 70], lives: 1 },
  };

  const chapterOf = (L) => Math.ceil(L / CHAPTER);
  const isBoss = (L) => L % CHAPTER === 0;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const roman = (n) => (n <= 10 ? ROMAN[n - 1] : String(n));
  const chapterName = (c) => CHAPTERS[c - 1] || 'Remix ' + roman(c - CHAPTERS.length);
  const introOf = (L) => MECHS.find((m) => m.from === L) || null;
  const polyLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return l; };

  // ---------- parameters ----------
  // Which mechanics a level uses, and how much of each.
  function pickMechs(level, r, boss) {
    const avail = MECHS.filter((m) => m.from <= level).map((m) => m.id);
    const intro = introOf(level);
    let chosen;
    if (boss) chosen = avail.slice();
    else if (intro) chosen = [intro.id].concat(level > 12 && r.chance(0.35) ? [r.pick(avail.filter((x) => x !== intro.id))] : []);
    else {
      const count = Math.min(avail.length, (avail.length ? 1 : 0) + (r.chance(0.55) ? 1 : 0) + (level >= 30 && r.chance(0.45) ? 1 : 0));
      const pool = avail.map((id) => [id, 1 + (MECHS.find((m) => m.id === id).from > level - 8 ? 2 : 0)]); // recent ones more often
      chosen = [];
      while (chosen.length < count && pool.length) {
        const id = r.weighted(pool);
        chosen.push(id);
        pool.splice(pool.findIndex((x) => x[0] === id), 1);
      }
    }
    const has = (id) => chosen.includes(id);
    return {
      list: chosen,
      keys: has('keys') ? (boss ? 2 + (level >= 30 ? 1 : 0) : intro && intro.id === 'keys' ? 1 : r.int(1, 2)) : 0,
      blink: has('blink'),
      gates: has('gates') ? (boss ? 2 : 1) : 0,
      loopGates: has('gates') ? r.int(1, 2) : 0,
      switches: has('switches') ? (boss ? 2 : 1) : 0,
      movers: has('movers') ? (boss ? 2 : 1) : 0,
      portals: has('portals') ? 1 : 0,
      gaps: has('items') ? 1 : 0,                           // a missing corridor: float or hop across (a box gives what it takes)
      squeezes: has('items') && (boss || r.chance(0.5)) ? 1 : 0, // a gate only a shrunk picture fits through

      ice: has('ice') ? r.range(0.18, 0.32) : 0,
      dark: has('dark') ? (boss ? 125 : 140) : 0,
    };
  }
  function pickMods(level, r, boss) {
    const ids = Object.keys(MODS);
    r.shuffle(ids);
    return ids.slice(0, boss ? 2 : 1);
  }
  // A level (Chapters and Time Trial), or a Gauntlet maze (o: { seed, boss, salt }).
  function levelParams(level, o) {
    o = o || {};
    const r = rng(o.seed != null ? o.seed : hashStr('memaze/level/' + level));
    const boss = o.boss != null ? o.boss : isBoss(level);
    const p = Gen.tierParams(level, r);
    const c = chapterOf(level), k = ((level - 1) % CHAPTER) + 1, th = THEMES[(c - 1) % THEMES.length];
    // Pacing inside a chapter: its first levels breathe, then it builds up to the boss, which is the biggest.
    p.nodes = Math.round(p.nodes * (boss ? 1.55 : lerp(0.78, 1.1, (k - 1) / 8)));
    if (level > 2) {
      const lats = th.lat.filter((id) => Gen.LAT_UNLOCK.some(([x, l]) => x === id && l <= level));
      if (lats.length && r.chance(0.7)) p.lattice = r.pick(lats);
      const masks = th.mask.filter((id) => Gen.MASK_UNLOCK.some(([x, l]) => x === id && l <= level) && (!Gen.MASKS[id].minNodes || p.nodes >= Gen.MASKS[id].minNodes))
        .filter((id) => p.lattice !== 'polar' || Gen.MASKS[id].aspect === 1);
      if (masks.length && r.chance(0.7)) p.mask = r.pick(masks);
      if (p.lattice === 'polar' && Gen.MASKS[p.mask].aspect !== 1) p.mask = 'circle';
    }
    p.holes = c >= 3 && r.chance(0.25) ? 0.04 : 0; // punched holes only once the basics are down
    const mech = pickMechs(level, r, boss);
    if (!mech.blink) p.blink = 0;
    else if (!p.blink) p.blink = 0.06;
    const mods = level >= REMIX_FROM ? pickMods(level, r, boss) : [];
    if (mods.includes('narrow')) p.hw = Math.max(Gen.HW_MIN + 2, p.hw * 0.82);
    if (mods.includes('flicker')) { p.blink = Math.max(p.blink, 0.08) * 1.5; p.flicker = true; }
    if (mods.includes('frost')) mech.ice = Math.max(mech.ice, 0.6);
    if (mods.includes('blackout')) mech.dark = 90;
    if (mods.includes('rush')) p.timeFactor *= 0.7;
    if (boss) { p.timeFactor *= 1.1; p.gems += 2; p.maxPath *= 1.6; }
    if (mech.keys + mech.switches + mech.movers + mech.portals + mech.gates > 0) p.braid *= 0.6; // fewer loops: more real chokepoints
    p.mech = mech;
    p.mods = mods;
    p.boss = boss;
    p.chapter = c;
    p.seed = Math.floor(r() * 4294967296);
    p.level = level;
    // A hand-made layout (chapters 1 and 2) replaces the generated maze; its own mechanics, pace and pad. Gauntlet mazes (a
    // seed given) stay generated. Last, so no r() call above moves.
    const lay = o.seed == null && MZ.Layouts && MZ.Layouts.find((x) => x.level === level);
    if (lay) {
      Object.assign(p, { layout: lay.id, seed: lay.seed, hw: lay.hw, timeFactor: lay.timeFactor, parPad: lay.parPad || 0, gems: lay.gems.length });
      p.mech = Object.assign({ list: [], keys: 0, blink: false, gates: 0, loopGates: 0, switches: 0, movers: 0, portals: 0, gaps: 0, squeezes: 0, ice: 0, dark: 0 }, lay.mech);
    }
    return p;
  }
  // Gauntlet: o = { seed, style: 'progressive' | 'random', diff }. Progressive goes deeper and harder with every maze;
  // Random picks each maze's difficulty anywhere in the chosen band. Every tenth maze is a boss.
  function gauntletLevel(o, depth) {
    const D = GAUNTLET[o.diff] || GAUNTLET.normal;
    if (o.style === 'random') return rng(hashInts(o.seed, depth, 5)).int(D.span[0], D.span[1]);
    return D.start + Math.floor(depth * 1.4);
  }
  // Tox Boxes (Gauntlet only): how many tumble about a maze, by difficulty and depth (bosses get two more), and how fast.
  const TOX = {
    easy: { n: (d) => (d < 1 ? 0 : Math.min(2, 1 + Math.floor(d / 5))), roll: 0.6, rest: 0.5 },
    normal: { n: (d) => Math.min(4, 1 + Math.floor(d / 3)), roll: 0.52, rest: 0.42 },
    hard: { n: (d) => Math.min(6, 2 + Math.floor(d / 3)), roll: 0.46, rest: 0.36 },
    extreme: { n: (d) => Math.min(8, 3 + Math.floor(d / 3)), roll: 0.4, rest: 0.3 },
  };
  function gauntletParams(o, depth) {
    const level = gauntletLevel(o, depth), boss = (depth + 1) % 10 === 0;
    const p = levelParams(level, { seed: hashInts(o.seed, depth, 99), boss });
    p.timeFactor *= 0.9;
    const T = TOX[o.diff] || TOX.normal;
    p.tox = { count: T.n(depth) + (boss ? 2 : 0), roll: T.roll, rest: T.rest };
    return p;
  }

  // ---------- graph helpers ----------
  function adjacency(n, edges) {
    const adj = Array.from({ length: n }, () => []);
    for (const e of edges) { adj[e.a].push(e); adj[e.b].push(e); }
    return adj;
  }
  // Edges whose removal splits the maze (Tarjan).
  function bridgesOf(n, adj) {
    const disc = new Int32Array(n).fill(-1), low = new Int32Array(n), out = new Set();
    let time = 0;
    for (let s = 0; s < n; s++) {
      if (disc[s] >= 0) continue;
      const stack = [[s, null, 0]];
      disc[s] = low[s] = time++;
      while (stack.length) {
        const top = stack[stack.length - 1], [v, pe] = top;
        if (top[2] < adj[v].length) {
          const e = adj[v][top[2]++];
          if (e === pe) continue;
          const w = e.a === v ? e.b : e.a;
          if (disc[w] < 0) { disc[w] = low[w] = time++; stack.push([w, e, 0]); }
          else low[v] = Math.min(low[v], disc[w]);
        } else {
          stack.pop();
          if (stack.length) {
            const u = stack[stack.length - 1][0];
            low[u] = Math.min(low[u], low[v]);
            if (low[v] > disc[u]) out.add(pe.id);
          }
        }
      }
    }
    return out;
  }
  // Shortest path from a to b over the edges `ok(e, from)` lets through; returns [{e, from, to}] or null.
  function path(n, adj, a, b, ok) {
    if (a === b) return [];
    const dist = new Float64Array(n).fill(Infinity), prev = new Array(n).fill(null), done = new Uint8Array(n);
    dist[a] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const e of adj[u]) {
        if (!ok(e, u)) continue;
        const v = e.a === u ? e.b : e.a, d = dist[u] + e.plen;
        if (d < dist[v]) { dist[v] = d; prev[v] = { e, from: u, to: v }; }
      }
    }
    if (dist[b] === Infinity) return null;
    const out = [];
    for (let v = b; prev[v]; v = prev[v].from) out.push(prev[v]);
    return out.reverse();
  }
  // A point part-way along an edge from node `from` (f: 0..1 of its length), with the direction of travel.
  function along(e, from, f) {
    const P = e.a === from ? e.pts : e.pts.slice().reverse(), L = polyLen(P) * f;
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      const sl = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
      if (acc + sl >= L || i === P.length - 1) {
        const k = sl ? clamp((L - acc) / sl, 0, 1) : 0, tx = (P[i].x - P[i - 1].x) / (sl || 1), ty = (P[i].y - P[i - 1].y) / (sl || 1);
        return { x: P[i - 1].x + (P[i].x - P[i - 1].x) * k, y: P[i - 1].y + (P[i].y - P[i - 1].y) * k, tx, ty };
      }
      acc += sl;
    }
    return { x: P[0].x, y: P[0].y, tx: 1, ty: 0 };
  }
  // A bar straight across an edge's corridor, part-way along it.
  function across(e, from, f) {
    const q = along(e, from, f), w = e.hw + 3;
    return { x: q.x, y: q.y, ax: q.x - q.ty * w, ay: q.y + q.tx * w, bx: q.x + q.ty * w, by: q.y - q.tx * w, nx: q.tx, ny: q.ty };
  }

  // ---------- fitting the mechanics in ----------
  // Long corridors on the route get a piece cut out of their middle (split in three: floor, gap, floor), so an item
  // puzzle's gap is never longer than a Launch reaches. The middle piece is the one mechanize takes away.
  function cutGaps(m, count, r) {
    const mp = m.mainPath, nodes = m.nodes.slice(), edges = m.edges.slice(), path = mp.slice();
    const edgeAt = (a, b) => edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
    const cands = [];
    for (let i = 2; i < path.length - 3; i++) {
      const k = edgeAt(path[i], path[i + 1]), e = edges[k];
      if (e.type !== 'normal' || polyLen(e.pts) < 300) continue;
      cands.push({ i, k, score: Math.abs(i / path.length - 0.55) + r() * 0.2 });
    }
    cands.sort((a, b) => a.score - b.score);
    let done = 0;
    for (const c of cands) {
      if (done >= count) break;
      const e = edges[c.k], P = e.pts, cum = [0];
      for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
      const len = cum[cum.length - 1], gap = Math.min(len - 140, r.range(120, 210)), s0 = (len - gap) / 2, s1 = s0 + gap;
      const at = (d) => { let i = 1; while (i < P.length - 1 && cum[i] < d) i++; const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return { i, x: P[i - 1].x + (P[i].x - P[i - 1].x) * f, y: P[i - 1].y + (P[i].y - P[i - 1].y) * f }; };
      const A = at(s0), B = at(s1), nA = nodes.length, nB = nA + 1;
      nodes.push({ x: A.x, y: A.y }, { x: B.x, y: B.y });
      const piece = (a, b, pts) => Object.assign({}, e, { a, b, pts, len: polyLen(pts), main: true });
      const e1 = piece(e.a, nA, P.slice(0, A.i).concat([{ x: A.x, y: A.y }]));
      const e2 = Object.assign(piece(nA, nB, [{ x: A.x, y: A.y }].concat(P.slice(A.i, B.i), [{ x: B.x, y: B.y }])), { gapCut: true });
      const e3 = piece(nB, e.b, [{ x: B.x, y: B.y }].concat(P.slice(B.i)));
      edges.splice(c.k, 1, e1, e2, e3);
      const i = path.indexOf(e.a) + 1 === path.indexOf(e.b) ? path.indexOf(e.a) : path.indexOf(e.b);
      path.splice(i + 1, 0, ...(path[i] === e.a ? [nA, nB] : [nB, nA]));
      for (const q of cands) if (q.k > c.k) q.k += 2;
      done++;
    }
    return done ? Object.assign({}, m, { nodes, edges, mainPath: path }) : m;
  }

  function build(p) {
    let m = Gen.generate(p);
    if (p.mech && p.mech.gaps && !p.layout) m = cutGaps(m, p.mech.gaps, rng(hashInts(m.seed, 0x6a9))); // (a layout draws its own gaps)
    m.level = p.level; m.boss = !!p.boss; m.chapter = p.chapter || chapterOf(p.level || 1);
    m.mods = p.mods || []; m.mechs = (p.mech && p.mech.list) || [];
    let barriers = m.fixed ? m.fixed.map((b) => Object.assign({}, b)) : null; // a layout pins its barriers
    for (let tries = 0; tries < 6; tries++) {
      const res = mechanize(m, p, barriers);
      if (res.ok) { placeToxes(res.m, p); return res.m; }
      barriers = res.barriers.filter((x, i) => i !== res.failed); // leave out the one that couldn't be solved
    }
    const m0 = mechanize(m, Object.assign({}, p, { mech: {} }), []).m;
    placeToxes(m0, p);
    return m0;
  }

  // Tox Boxes, after the Cyclone Stone in Super Mario Galaxy: stone cubes as wide as the corridor, tumbling up and down
  // a stretch of it (round gentle bends only). Most sit on the route, where the only way past is to stand on a hollow
  // tile (marked on the floor) and let the box land hollow side down over you; the rest sit in side corridors, the dead
  // ends out to gems first. Each keeps clear of junctions, keys, switches, portals and item boxes; par allows for the wait.
  const TOX_MIN = 2, TOX_MAX = 7; // tumbles from one end of a track to the other (it's one more tiles long)
  function placeToxes(m, p) {
    m.toxes = [];
    const want = p.tox ? p.tox.count : 0;
    if (!want || !m.route) return;
    const r = rng(hashInts(m.seed, 0x70c5)), n = m.nodes.length, adj = adjacency(n, m.edges);
    const walked = new Map(); // edge id -> how often the route walks it
    for (const L of m.route) if (L.type === 'walk') for (const st of L.steps) walked.set(st.e.id, (walked.get(st.e.id) || 0) + 1);
    const gemAt = new Set(m.gems.map((g) => g.x + ',' + g.y));
    const barred = new Set([].concat(m.doors, m.gates, m.squeezes || []).map((d) => d.edge));
    const things = [].concat(
      m.keys.map((o) => ({ x: o.x, y: o.y, r: 40 })), m.plates.map((o) => ({ x: o.x, y: o.y, r: o.r + 10 })), (m.gboxes || []).map((o) => ({ x: o.x, y: o.y, r: 40 })),
      m.portals.flatMap((pt) => [pt.a, pt.b].map((o) => ({ x: o.x, y: o.y, r: pt.r + 10 }))), (m.gaps || []).flatMap((q) => [q.a, q.b].map((o) => ({ x: o.x, y: o.y, r: q.hw + 20 }))),
      m.movers.flatMap((mv) => [mv.a, mv.b].map((o) => ({ x: o.x, y: o.y, r: mv.r + 10 }))),
      [{ x: m.start.x, y: m.start.y, r: m.start.r + 260 }, { x: m.goal.x, y: m.goal.y, r: m.goal.r + 60 }], m.avoid || []);
    // How close a square (centre c, along u, half-size a) comes to the floor of another corridor f.
    const sqDist = (c, u, a, P, Q) => {
      const loc = (q) => ({ x: (q.x - c.x) * u.x + (q.y - c.y) * u.y, y: -(q.x - c.x) * u.y + (q.y - c.y) * u.x });
      const A = loc(P), B = loc(Q), inSq = (q) => Math.abs(q.x) <= a && Math.abs(q.y) <= a;
      if (inSq(A) || inSq(B) || MZ.segsCross(A.x, A.y, B.x, B.y, -a, -a, a, a) || MZ.segsCross(A.x, A.y, B.x, B.y, -a, a, a, -a)) return 0;
      const toSq = (q) => Math.hypot(Math.max(0, Math.abs(q.x) - a), Math.max(0, Math.abs(q.y) - a));
      let d = Math.min(toSq(A), toSq(B));
      for (const [x, y] of [[-a, -a], [a, -a], [a, a], [-a, a]]) d = Math.min(d, Math.sqrt(segDist2(x, y, A.x, A.y, B.x, B.y)));
      return d;
    };
    // Corridors from junction to junction (or out to a dead end), through the bends in between.
    const deg = adj.map((l) => l.length), inChain = new Set(), chains = [];
    for (let v0 = 0; v0 < n; v0++) {
      if (deg[v0] === 2 || !deg[v0]) continue;
      for (const e0 of adj[v0]) {
        if (inChain.has(e0.id)) continue;
        const es = [], pts = [];
        let v = v0, e = e0;
        for (;;) {
          inChain.add(e.id); es.push(e);
          const P = e.a === v ? e.pts : e.pts.slice().reverse();
          for (let k = pts.length ? 1 : 0; k < P.length; k++) pts.push({ x: P[k].x, y: P[k].y });
          v = e.a === v ? e.b : e.a;
          if (deg[v] !== 2) break;
          e = adj[v][0] === e ? adj[v][1] : adj[v][0];
          if (inChain.has(e.id)) break;
        }
        chains.push({ es, pts, ends: [v0, v] });
      }
    }
    const segKey = (P, Q) => Math.round(P.x) + ',' + Math.round(P.y) + '|' + Math.round(Q.x) + ',' + Math.round(Q.y);
    const clearOf = (own, c, u, a) => { // a box here keeps off every other corridor's floor
      for (const f of m.edges) {
        const P = f.pts;
        for (let i = 1; i < P.length; i++) {
          if (own.has(segKey(P[i - 1], P[i]))) continue;
          if (Math.sqrt(segDist2(c.x, c.y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y)) > a * 1.5 + f.hw + 4) continue;
          if (sqDist(c, u, a, P[i - 1], P[i]) < f.hw + 2) return false;
        }
      }
      return true;
    };
    const cands = [];
    chains.forEach((ch, ci) => {
      const times = walked.get(ch.es[0].id) || 0;
      if (ch.es.some((e) => e.type !== 'normal' || e.ice || e.blink || e.sw || barred.has(e.id) || (walked.get(e.id) || 0) !== times) || times > 1) return;
      const [v0, v1] = ch.ends, leaf0 = deg[v0] === 1, leaf1 = deg[v1] === 1;
      const gem = (leaf0 && gemAt.has(m.nodes[v0].x + ',' + m.nodes[v0].y)) || (leaf1 && gemAt.has(m.nodes[v1].x + ',' + m.nodes[v1].y));
      const kind = times ? 'route' : gem ? 'gem' : 'side';
      const hw = Math.min(...ch.es.map((e) => e.hw)), s = clamp(hw * 1.84, 60, 84), a = s / 2 + 2, P = ch.pts, cum = [0];
      for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k].x - P[k - 1].x, P[k].y - P[k - 1].y));
      const L = cum[cum.length - 1];
      if (L < (TOX_MIN + 1) * s + 16) return;
      const at = (d) => {
        d = clamp(d, 0, L);
        let k = 1;
        while (k < P.length - 1 && cum[k] < d) k++;
        const f = (d - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
        return { x: P[k - 1].x + (P[k].x - P[k - 1].x) * f, y: P[k - 1].y + (P[k].y - P[k - 1].y) * f };
      };
      const dirAt = (d) => { const p0 = at(d - s / 2), p1 = at(d + s / 2), l = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1; return { x: (p1.x - p0.x) / l, y: (p1.y - p0.y) / l }; };
      const own = (d0, d1) => { // this corridor's own floor, around the stretch d0..d1
        const o = new Set();
        for (let k = 1; k < P.length; k++) if (cum[k] > d0 - s && cum[k - 1] < d1 + s) { o.add(segKey(P[k - 1], P[k])); o.add(segKey(P[k], P[k - 1])); }
        return o;
      };
      // Each end pulls back until a box there is clear of the other corridors at the junction (and, at a dead end,
      // leaves room to stand by the gem).
      let mA = s / 2 + (leaf0 ? 30 : 8), mB = s / 2 + (leaf1 ? 30 : 8);
      while (mA < L / 2 && !clearOf(own(mA, mA), at(mA), dirAt(mA), a)) mA += 4;
      while (mB < L / 2 && !clearOf(own(L - mB, L - mB), at(L - mB), dirAt(L - mB), a)) mB += 4;
      const span = L - mA - mB, count = Math.floor(span / s) + 1;
      if (count < TOX_MIN + 1) return;
      const d0 = mA + (span - (count - 1) * s) / 2;
      const tiles = [];
      for (let k = 0; k < count; k++) { const c = at(d0 + k * s), u = dirAt(d0 + k * s); tiles.push({ x: c.x, y: c.y, ux: u.x, uy: u.y, d: d0 + k * s }); }
      // It tumbles round gentle bends only: split where the corridor turns sharply, and keep the longest run (no more
      // than TOX_MAX tumbles, from its middle) clear of keys, switches, portals, item boxes and the like.
      const runs = [];
      let run = [tiles[0]];
      for (let k = 1; k < count; k++) {
        const A = tiles[k - 1], B = tiles[k], turn = Math.acos(clamp(A.ux * B.ux + A.uy * B.uy, -1, 1));
        if (turn > 0.4) { runs.push(run); run = []; }
        run.push(B);
      }
      runs.push(run);
      for (let T of runs) {
        if (T.length > TOX_MAX + 1) { const k = Math.floor((T.length - TOX_MAX - 1) / 2); T = T.slice(k, k + TOX_MAX + 1); }
        if (T.length < TOX_MIN + 1) continue;
        if (T.some((c) => things.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < o.r + s * 0.71))) continue;
        cands.push({ chain: ci, kind, s, tiles: T.map((c) => ({ x: c.x, y: c.y, ux: c.ux, uy: c.uy })), score: r() + T.length * 0.05 });
      }
    });
    cands.sort((x, y) => y.score - x.score);
    const mid = (c) => c.tiles[Math.floor(c.tiles.length / 2)];
    const picked = [], ok = (c) => !picked.some((q) => q.chain === c.chain || Math.hypot(mid(q).x - mid(c).x, mid(q).y - mid(c).y) < 380);
    const take = (kind, upTo) => { for (const c of cands) if (picked.length < upTo && c.kind === kind && !picked.includes(c) && ok(c)) picked.push(c); };
    take('route', Math.ceil(want * 0.6));
    take('gem', want);
    take('route', want);
    take('side', want);
    let wait = 0;
    for (const c of picked) {
      const n = c.tiles.length - 1, roll = p.tox.roll * r.range(0.92, 1.08), rest = p.tox.rest * r.range(0.9, 1.15), end = rest + 0.5;
      const half = end + n * roll + (n - 1) * rest, h = r.int(1, Math.min(3, n - 1));
      m.toxes.push({ tiles: c.tiles, s: c.s, n, h, roll, rest, end, phase: r.range(0, 2 * half), route: c.kind === 'route', guard: c.kind === 'gem', seen: false });
      for (const t of c.tiles) if (m.avoid) m.avoid.push({ x: t.x, y: t.y, r: c.s * 0.71 + 20 }); // no mystery box or flag on its track
      for (let k = 1; k <= n; k++) if (m.keepClear) m.keepClear.push({ ax: c.tiles[k - 1].x, ay: c.tiles[k - 1].y, bx: c.tiles[k].x, by: c.tiles[k].y, r: c.s * 0.71 });
      if (c.kind === 'route') wait += half + 0.5; // waiting for it to come over you: half its round trip, on average
    }
    if (wait) {
      m.parTime = Math.ceil(m.parTime + wait);
      m.timeLimit = Math.max(m.timeLimit, Math.ceil((m.parTime * p.timeFactor + 15) / 5) * 5);
    }
  }

  function mechanize(base, p, fixed) {
    const mech = p.mech || {};
    const r = rng(hashInts(base.seed, 0x3ec4));
    const m = Object.assign({}, base);
    const nodes = m.nodes, n = nodes.length;
    const pinned = !!p.layout; // a hand-made layout: every mechanic is where it's pinned, nothing is placed at random
    let edges = base.edges.map((e, i) => Object.assign({}, e, { id: i, plen: polyLen(e.pts) }));
    for (const e of edges) if (pinned && e.pinSw) { e.type = 'switch'; e.sw = { g: e.pinSw.g, on: e.pinSw.on }; } // its switch bridges off the route
    let adj = adjacency(n, edges), bridges = bridgesOf(n, adj);
    const mp = base.mainPath, start = mp[0], goal = mp[mp.length - 1];
    const edgeBetween = (a, b) => adj[a].find((e) => e.a === b || e.b === b);
    const routeEdges = [];
    for (let i = 0; i + 1 < mp.length; i++) routeEdges.push(edgeBetween(mp[i], mp[i + 1]));
    const cum = [0];
    routeEdges.forEach((e, i) => cum.push(cum[i] + e.plen));
    const total = cum[cum.length - 1];
    const deg = adj.map((l) => l.length);
    const onMain = new Uint8Array(n);
    mp.forEach((v) => (onMain[v] = 1));

    // Barriers on the main route, spread along it. Each sits on an edge that splits the maze in two, so it can't be
    // walked around: where loops go round one, a few side corridors are taken out until none do (the maze stays whole).
    const pruned = new Set();
    const onRoute = new Set(routeEdges.map((e) => e.id));
    const chokepoint = (e) => {
      if (bridges.has(e.id)) return true;
      const cutIds = [];
      for (let k = 0; k < 6; k++) {
        const pth = path(n, adj, e.a, e.b, (f) => f !== e && !pruned.has(f.id) && !cutIds.includes(f.id));
        if (!pth) { cutIds.forEach((id) => pruned.add(id)); return true; }
        const side = pth.map((st) => st.e).filter((f) => !onRoute.has(f.id) && f.a !== start && f.b !== start && f.a !== goal && f.b !== goal);
        if (!side.length) return false;
        cutIds.push(side[Math.floor(side.length / 2)].id);
      }
      return false;
    };
    let barriers = fixed;
    // (A layout's barriers stay exactly as drawn, nothing taken out round them: a gate on a loop is what makes it
    // one-way, and a gap on a loop has another gap for company; tests/hand.test.js checks doors and the rest can't be
    // walked round.)
    if (fixed && !pinned) for (const b of fixed) chokepoint(routeEdges[b.idx]);
    if (!barriers) {
      const want = [];
      for (const [kind, count] of [['door', mech.keys], ['switch', mech.switches], ['mover', mech.movers], ['portal', mech.portals], ['gate', mech.gates], ['gap', mech.gaps], ['squeeze', mech.squeezes]]) {
        for (let i = 0; i < (count || 0); i++) want.push(kind);
      }
      r.shuffle(want);
      barriers = [];
      const usedIdx = new Set();
      want.forEach((kind, j) => {
        const target = total * (0.15 + (0.7 * (j + 0.5)) / want.length);
        let best = -1, bd = Infinity;
        for (let i = 1; i < routeEdges.length - 1; i++) {
          const e = routeEdges[i];
          if (e.type !== 'normal' || usedIdx.has(i) || usedIdx.has(i - 1) || usedIdx.has(i + 1)) continue;
          const solidBeside = (x) => adj[x].some((f) => f !== e && f.type === 'normal' && !pruned.has(f.id)); // somewhere to stand either side
          if (!solidBeside(mp[i]) || !solidBeside(mp[i + 1])) continue;
          if (kind === 'mover' && (e.plen < 2 * Math.max(38, e.hw * 1.2) + 70 || e.plen > 560)) continue;
          if (kind === 'gap' && !e.gapCut) { const d = Math.hypot(nodes[mp[i]].x - nodes[mp[i + 1]].x, nodes[mp[i]].y - nodes[mp[i + 1]].y); if (d < 2 * e.hw + 30 || d > GAP_MAX) continue; }
          if (kind !== 'gap' && e.gapCut) continue; // cut out for a gap: nothing else goes there
          if (kind !== 'mover' && kind !== 'portal' && e.plen < 70) continue;
          const d = Math.abs((cum[i] + cum[i + 1]) / 2 - target) + (bridges.has(e.id) ? 0 : 250) - (kind === 'gap' && e.gapCut ? 600 : 0); // real chokepoints first
          if (d < bd) { bd = d; best = i; }
        }
        if (best >= 0 && chokepoint(routeEdges[best])) { usedIdx.add(best); barriers.push({ kind, idx: best }); }
      });
      barriers.sort((a, b) => a.idx - b.idx);
    }
    if (pruned.size) { // take the pruned corridors out for good
      edges = edges.filter((e) => !pruned.has(e.id));
      adj = adjacency(n, edges);
      bridges = bridgesOf(n, adj);
    }

    // Regions: what's reachable between one barrier and the next.
    const cut = new Set(barriers.map((b) => routeEdges[b.idx].id));
    const comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const q = [s];
      comp[s] = nc;
      for (let i = 0; i < q.length; i++) for (const e of adj[q[i]]) {
        if (cut.has(e.id)) continue;
        const w = e.a === q[i] ? e.b : e.a;
        if (comp[w] < 0) { comp[w] = nc; q.push(w); }
      }
      nc++;
    }
    // Gems sit at dead ends; items keep off them.
    const gemNode = new Set();
    for (const g of base.gems) { const i = nodes.findIndex((nd) => nd.x === g.x && nd.y === g.y); if (i >= 0) gemNode.add(i); }
    const taken = new Set([start, goal]);
    // An item spot in `region`, reached from node `from`: a dead end off the main route, a fair walk away (not too
    // far), else any junction off the route, else the route itself.
    function spot(region, from, far, leafOnly, near) {
      const dist = new Float64Array(n).fill(Infinity);
      dist[from] = 0;
      const q = [from];
      for (let i = 0; i < q.length; i++) {
        const u = q[i];
        for (const e of adj[u]) {
          if (cut.has(e.id)) continue;
          const w = e.a === u ? e.b : e.a;
          if (dist[u] + e.plen < dist[w]) { dist[w] = dist[u] + e.plen; q.push(w); }
        }
      }
      const cap = near ? 450 : far ? 2600 : 1400; // near: a Shrink box must leave time to reach its gate
      let best = -1, bs = -Infinity;
      for (let v = 0; v < n; v++) {
        if (comp[v] !== region || taken.has(v) || dist[v] === Infinity) continue;
        if (!adj[v].some((e) => (e.type === 'normal' || e.type === 'bridge') && !cut.has(e.id))) continue; // never on floor that comes and goes
        if (leafOnly && (deg[v] !== 1 || onMain[v])) continue; // switches and portals only at dead ends: nobody steps on one by accident
        const d = dist[v], leaf = deg[v] === 1, s = (leaf ? 2000 : 0) + (onMain[v] ? -3000 : 0) + (gemNode.has(v) ? -1500 : 0) + (d <= cap ? d : cap - (d - cap) * 2) + (d < 200 ? -800 : 0);
        if (s > bs) { bs = s; best = v; }
      }
      if (best >= 0) taken.add(best);
      return best;
    }

    m.doors = []; m.keys = []; m.plates = []; m.movers = []; m.portals = []; m.gates = []; m.pads = [];
    m.gaps = []; m.squeezes = []; m.gboxes = []; // item puzzles: missing corridors, shrink gates, and the boxes that solve them
    const removed = new Set();
    const reserved = new Set(), avoid = [], keepClear = [];
    const reserve = (v) => { reserved.add(v); for (const e of adj[v]) { reserved.add(e.a); reserved.add(e.b); } };
    let doorN = 0, swN = 0;
    barriers.forEach((b) => {
      const e = routeEdges[b.idx], u = mp[b.idx], v = mp[b.idx + 1];
      b.u = u; b.v = v; b.e = e; b.item = null;
      reserve(u); reserve(v);
      if (b.kind === 'door') {
        const color = KEY_COLORS[(b.pinColor != null ? b.pinColor : doorN) % KEY_COLORS.length], k = b.pinKey != null ? (taken.add(b.pinKey), b.pinKey) : spot(comp[u], u); // (a layout pins key and colour)
        doorN++;
        const bar = across(e, u, 0.5);
        m.doors.push(Object.assign(bar, { color, edge: e.id, open: false }));
        avoid.push({ x: bar.x, y: bar.y, r: e.hw + 40 });
        if (k >= 0) { m.keys.push({ color, x: nodes[k].x, y: nodes[k].y, node: k }); b.item = k; reserve(k); avoid.push({ x: nodes[k].x, y: nodes[k].y, r: 55 }); }
        b.color = color;
      } else if (b.kind === 'switch') {
        const gi = swN++ % SWITCH_COLORS.length, g = b.pinGroup != null ? b.pinGroup : gi;
        const k = b.pinPlate != null ? (taken.add(b.pinPlate), b.pinPlate) : spot(comp[u], u, false, true); // (a layout pins the switch and its colour)
        e.type = 'switch';
        e.sw = { g, on: b.pinOn != null ? b.pinOn : 1 }; // (a layout's may be up at first and go when its switch is pressed)
        delete e.blink;
        const shared = b.pinPlate != null && m.plates.some((pl) => pl.node === k && pl.g === g); // one switch can bring in several bridges
        if (k >= 0) { if (!shared) m.plates.push({ g, color: SWITCH_COLORS[g], x: nodes[k].x, y: nodes[k].y, node: k, r: Math.max(26, e.hw * 0.75) }); b.item = k; reserve(k); avoid.push({ x: nodes[k].x, y: nodes[k].y, r: 60 }); }
        b.g = g;
      } else if (b.kind === 'mover') {
        removed.add(e.id);
        // It rests just off each corridor end (its rim reaching the end's middle): step on, ride across, step off.
        const R = Math.max(38, e.hw * 1.2), U = nodes[u], V = nodes[v], len = Math.hypot(V.x - U.x, V.y - U.y), dx = (V.x - U.x) / len, dy = (V.y - U.y) / len;
        const mv = { a: { x: U.x + dx * R, y: U.y + dy * R }, b: { x: V.x - dx * R, y: V.y - dy * R }, r: R, travel: (len - 2 * R) / 75, pause: 1.6, phase: r(), from: { x: U.x, y: U.y }, to: { x: V.x, y: V.y } };
        mv.period = 2 * (mv.travel + mv.pause);
        b.mover = m.movers.length;
        m.movers.push(mv);
        keepClear.push({ ax: U.x, ay: U.y, bx: V.x, by: V.y, r: R });
        avoid.push({ x: (U.x + V.x) / 2, y: (U.y + V.y) / 2, r: len / 2 + R });
      } else if (b.kind === 'portal') {
        removed.add(e.id);
        const k1 = spot(comp[u], u, true, true), k2 = spot(comp[v], v, false, true);
        const i = m.portals.length, color = PORTAL_COLORS[i % PORTAL_COLORS.length], R = Math.max(32, e.hw * 1.1), A = k1, B = k2;
        if (k1 < 0 || k2 < 0) { b.item = null; b.portal = -1; return; } // nowhere fitting: this one can't be solved, and goes
        m.portals.push({ color, r: R, a: { x: nodes[A].x, y: nodes[A].y, node: A }, b: { x: nodes[B].x, y: nodes[B].y, node: B } });
        m.pads.push({ x: nodes[A].x, y: nodes[A].y, r: R }, { x: nodes[B].x, y: nodes[B].y, r: R });
        reserve(A); reserve(B);
        avoid.push({ x: nodes[A].x, y: nodes[A].y, r: R + 40 }, { x: nodes[B].x, y: nodes[B].y, r: R + 40 });
        b.portal = i; b.a = A; b.b = B;
      } else if (b.kind === 'gate') {
        const bar = across(e, u, 0.5);
        m.gates.push(Object.assign(bar, { edge: e.id, from: u }));
        avoid.push({ x: bar.x, y: bar.y, r: e.hw + 40 });
      } else if (b.kind === 'gap') { // the corridor is missing: a Magic carpet floats you over, a Launch hops you over
        const U = nodes[u], V = nodes[v], d = Math.hypot(V.x - U.x, V.y - U.y), item = b.pinItem || (d > 200 || r.chance(0.45) ? 'launch' : 'carpet');
        removed.add(e.id);
        b.gap = m.gaps.length; b.need = item;
        m.gaps.push({ item, from: u, to: v, a: { x: U.x, y: U.y }, b: { x: V.x, y: V.y }, pts: e.pts, hw: e.hw });
        keepClear.push({ ax: U.x, ay: U.y, bx: V.x, by: V.y, r: e.hw });
        avoid.push({ x: (U.x + V.x) / 2, y: (U.y + V.y) / 2, r: d / 2 + 30 });
        const k = b.pinBox != null ? (taken.add(b.pinBox), b.pinBox) : spot(comp[u], u); // (a layout pins the item box)
        if (k >= 0) { if (!(b.pinBox != null && m.gboxes.some((gb) => gb.node === k && gb.item === item))) m.gboxes.push({ item, x: nodes[k].x, y: nodes[k].y, node: k }); b.item = k; reserve(k); avoid.push({ x: nodes[k].x, y: nodes[k].y, r: 55 }); }
      } else if (b.kind === 'squeeze') { // a low gate across the corridor: only a shrunk picture gets through
        const bar = across(e, u, 0.5);
        m.squeezes.push(Object.assign(bar, { edge: e.id, from: u }));
        avoid.push({ x: bar.x, y: bar.y, r: e.hw + 40 });
        b.need = 'shrink';
        const k = b.pinBox != null ? (taken.add(b.pinBox), b.pinBox) : spot(comp[u], u, false, false, true);
        if (k >= 0) { if (!(b.pinBox != null && m.gboxes.some((gb) => gb.node === k && gb.item === 'shrink'))) m.gboxes.push({ item: 'shrink', x: nodes[k].x, y: nodes[k].y, node: k }); b.item = k; reserve(k); avoid.push({ x: nodes[k].x, y: nodes[k].y, r: 55 }); }
      }
    });
    // Gates on loops too (never on an edge that splits the maze, so they only ever send you the long way round).
    const loopCands = edges.filter((e) => !bridges.has(e.id) && (!onMain[e.a] || !onMain[e.b]) && e.type === 'normal' && e.plen >= 90 && !cut.has(e.id));
    r.shuffle(loopCands);
    for (const e of loopCands.slice(0, mech.loopGates || 0)) {
      const from = r.chance(0.5) ? e.a : e.b, bar = across(e, from, 0.5);
      m.gates.push(Object.assign(bar, { edge: e.id, from }));
      reserve(e.a); reserve(e.b);
      avoid.push({ x: bar.x, y: bar.y, r: e.hw + 40 });
    }
    // A layout's gaps and shrink gates off the route (guarding a side way), each with its item box.
    const edgeAt = (a, b) => edges.find((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a));
    const itemBox = (item, k) => {
      if (!m.gboxes.some((gb) => gb.node === k && gb.item === item)) m.gboxes.push({ item, x: nodes[k].x, y: nodes[k].y, node: k });
      reserve(k); avoid.push({ x: nodes[k].x, y: nodes[k].y, r: 55 });
    };
    for (const q of (pinned && base.gapsAt) || []) {
      const e = edgeAt(q.a, q.b), U = nodes[q.a], V = nodes[q.b];
      removed.add(e.id);
      m.gaps.push({ item: q.item, from: q.a, to: q.b, a: { x: U.x, y: U.y }, b: { x: V.x, y: V.y }, pts: e.a === q.a ? e.pts : e.pts.slice().reverse(), hw: e.hw });
      keepClear.push({ ax: U.x, ay: U.y, bx: V.x, by: V.y, r: e.hw });
      avoid.push({ x: (U.x + V.x) / 2, y: (U.y + V.y) / 2, r: Math.hypot(V.x - U.x, V.y - U.y) / 2 + 30 });
      reserve(q.a); reserve(q.b);
      itemBox(q.item, q.box);
    }
    for (const q of (pinned && base.squeezesAt) || []) {
      const e = edgeAt(q.a, q.b), bar = across(e, q.a, 0.5);
      m.squeezes.push(Object.assign(bar, { edge: e.id, from: q.a }));
      avoid.push({ x: bar.x, y: bar.y, r: e.hw + 40 });
      reserve(q.a); reserve(q.b);
      itemBox('shrink', q.box);
    }
    for (const x of (pinned && base.itemBoxesAt) || []) itemBox(x.item, x.node);
    for (const x of (pinned && base.platesAt) || []) { // switches that aren't on the way (they flip their colour all the same)
      if (!m.plates.some((pl) => pl.node === x.node)) m.plates.push({ g: x.g, color: SWITCH_COLORS[x.g], x: nodes[x.node].x, y: nodes[x.node].y, node: x.node, r: 33 });
      reserve(x.node); avoid.push({ x: nodes[x.node].x, y: nodes[x.node].y, r: 60 });
    }
    for (const q of (pinned && base.loopGatesAt) || []) { // a layout's own one-way loops
      const e = edgeAt(q.a, q.b), bar = across(e, q.from, 0.5);
      m.gates.push(Object.assign(bar, { edge: e.id, from: q.from }));
      reserve(e.a); reserve(e.b);
      avoid.push({ x: bar.x, y: bar.y, r: e.hw + 40 });
    }
    // No traps: from anywhere you can reach, GOAL must still be reachable (gates one way only; doors, switches,
    // platforms and portals all passable). A loop gate that breaks this goes.
    const trapped = () => {
      const gates = new Map(m.gates.map((g) => [g.edge, g]));
      const into = Array.from({ length: n }, () => []); // reversed arcs
      const arc = (a, b) => into[b].push(a);
      for (const e of edges) {
        const g = gates.get(e.id);
        if (removed.has(e.id)) { arc(e.a, e.b); arc(e.b, e.a); continue; } // a platform or a portal still links the two sides
        if (!g || g.from === e.a) arc(e.a, e.b);
        if (!g || g.from === e.b) arc(e.b, e.a);
      }
      for (const pt of m.portals) { arc(pt.a.node, pt.b.node); arc(pt.b.node, pt.a.node); }
      const ok = new Uint8Array(n), q = [goal];
      ok[goal] = 1;
      for (let i = 0; i < q.length; i++) for (const a of into[q[i]]) if (!ok[a]) { ok[a] = 1; q.push(a); }
      for (let v = 0; v < n; v++) if (!ok[v] && adj[v].length) return true;
      return false;
    };
    while (m.gates.length && trapped()) {
      const i = m.gates.map((g) => onRoute.has(g.edge)).lastIndexOf(false);
      if (i < 0) break;
      m.gates.splice(i, 1);
      avoid.pop();
    }
    const gateOn = new Map(m.gates.map((g) => [g.edge, g]));
    const doorOn = new Map(m.doors.map((d) => [d.edge, d]));
    const squeezeOn = new Map(m.squeezes.map((q) => [q.edge, q]));

    // The route that solves it: fetch each key before its door, press each switch before its bridge, ride each
    // platform, step through each portal; then on to GOAL.
    const held = {}, opened = new Set(), sw = {}; // keys carried by colour; doors already opened (each takes a key)
    const shrunk = new Set(); // shrink gates you've been shrunk for
    const ok = (e, from) => {
      if (removed.has(e.id)) return false;
      if (squeezeOn.has(e.id) && !shrunk.has(e.id)) return false;
      const d = doorOn.get(e.id);
      if (d && !opened.has(e.id) && !(held[d.color] > 0)) return false;
      if (e.sw && (sw[e.sw.g] | 0) !== e.sw.on) return false;
      const g = gateOn.get(e.id);
      if (g && g.from !== from) return false;
      return true;
    };
    const legs = [];
    let pos = start, failed = -1;
    const walk = (to) => {
      const pth = path(n, adj, pos, to, ok);
      if (!pth) return false;
      for (const st of pth) { const d = doorOn.get(st.e.id); if (d && !opened.has(st.e.id)) { opened.add(st.e.id); held[d.color]--; } }
      if (pth.length) legs.push({ type: 'walk', steps: pth });
      pos = to;
      return true;
    };
    for (let i = 0; i < barriers.length && failed < 0; i++) {
      const b = barriers[i];
      if (b.kind === 'door') {
        if (b.item == null || !walk(b.item)) { failed = i; break; }
        legs.push({ type: 'key', color: b.color });
        held[b.color] = (held[b.color] || 0) + 1;
        if (!walk(b.v)) failed = i;
      } else if (b.kind === 'switch') {
        if (b.pinPlate == null || (sw[b.g] | 0) !== b.e.sw.on) { // (a pinned switch already pressed for an earlier bridge of its colour isn't pressed again)
          if (b.item == null || !walk(b.item)) { failed = i; break; }
          legs.push({ type: 'press', g: b.g });
          sw[b.g] = (sw[b.g] | 0) ^ 1;
        }
        if (!walk(b.v)) failed = i;
      } else if (b.kind === 'mover') {
        if (!walk(b.u)) { failed = i; break; }
        legs.push({ type: 'ride', mover: b.mover });
        pos = b.v;
      } else if (b.kind === 'portal') {
        if (b.portal < 0 || !walk(b.a)) { failed = i; break; }
        legs.push({ type: 'warp', portal: b.portal });
        pos = b.b;
      } else if (b.kind === 'gap' || b.kind === 'squeeze') { // fetch the box's item, then use it at the gap or the gate
        if (b.item == null || !walk(b.item)) { failed = i; break; }
        legs.push({ type: 'item', item: b.need });
        if (!walk(b.u)) { failed = i; break; }
        if (b.kind === 'gap') { legs.push({ type: 'cross', item: b.need, gap: b.gap }); pos = b.v; }
        else { legs.push({ type: 'shrink' }); shrunk.add(b.e.id); if (!walk(b.v)) failed = i; }
      } else if (!walk(b.v)) failed = i;
    }
    if (failed < 0 && !walk(goal)) failed = barriers.length - 1;
    if (failed >= 0) return { ok: false, barriers, failed: Math.max(0, failed) };

    // Switch decoys: bridges of the same colour elsewhere that are up at first and go when the switch is pressed
    // (never on the route above, so it always still works).
    const usedByRoute = new Set();
    for (const L of legs) if (L.type === 'walk') for (const s of L.steps) usedByRoute.add(s.e.id);
    const plateNodes = new Set(m.plates.map((pl) => pl.node));
    const decoyCands = edges.filter((e) => e.type === 'normal' && !usedByRoute.has(e.id) && !removed.has(e.id) && !gateOn.has(e.id) && !doorOn.has(e.id) && !squeezeOn.has(e.id) &&
      !plateNodes.has(e.a) && !plateNodes.has(e.b) && e.a !== start && e.b !== start && e.a !== goal && e.b !== goal && e.plen >= 80);
    r.shuffle(decoyCands);
    const groups = [...new Set(m.plates.map((pl) => pl.g))];
    for (const g of pinned ? [] : groups) { // (a layout draws its own)
      const e = decoyCands.shift();
      if (e) { e.type = 'switch'; e.sw = { g, on: 0 }; reserve(e.a); reserve(e.b); }
    }

    // Ice: some corridors, a few of them on the main route.
    if (mech.ice > 0) {
      const iceable = edges.filter((e) => e.type === 'normal' && !removed.has(e.id) && !gateOn.has(e.id) && !doorOn.has(e.id) && !squeezeOn.has(e.id));
      r.shuffle(iceable);
      iceable.sort((a, b) => (routeEdges.includes(b) ? 1 : 0) - (routeEdges.includes(a) ? 1 : 0) + (r() - 0.5) * 1.6);
      for (const e of iceable.slice(0, Math.round(iceable.length * mech.ice))) e.ice = true;
    }
    m.dark = mech.dark || 0;

    // Gems: any that sit where an item went move to another dead end.
    const itemNodes = new Set([...m.keys.map((k) => k.node), ...m.plates.map((pl) => pl.node), ...m.portals.flatMap((pt) => [pt.a.node, pt.b.node]), ...m.gboxes.map((gb) => gb.node)]);
    const gems = base.gems.filter((g) => { const i = nodes.findIndex((nd) => nd.x === g.x && nd.y === g.y); return !itemNodes.has(i); });
    const gemSet = new Set(gems.map((g) => g.x + ',' + g.y));
    const freeLeaves = [];
    for (let v = 0; v < n; v++) if (deg[v] === 1 && !itemNodes.has(v) && v !== start && v !== goal && !gemSet.has(nodes[v].x + ',' + nodes[v].y) && !reserved.has(v)) freeLeaves.push(v);
    r.shuffle(freeLeaves);
    while (gems.length < base.gems.length && freeLeaves.length) { const v = freeLeaves.pop(); gems.push({ x: nodes[v].x, y: nodes[v].y }); }

    m.edges = edges.filter((e) => !removed.has(e.id));
    m.gems = gems;
    m.route = legs;
    m.reserved = reserved;
    m.avoid = avoid;
    m.keepClear = keepClear;
    const t = timing(m, p);
    m.parTime = t.par;
    m.timeLimit = t.limit;
    m.routeLen = t.len;
    return { ok: true, m, barriers };
  }

  // Par: the route dragged steadily by someone who knows the way (slower on narrow and icy corridors and in the dark),
  // plus the average wait at vanishing bridges and moving platforms and a beat per real turn.
  function timing(m, p) {
    let dragT = 0, waitT = 0, len = 0, turns = 0;
    for (const L of m.route) {
      if (L.type === 'walk') {
        let prev = null;
        for (const s of L.steps) {
          const e = s.e, v = lerp(160, 110, clamp((46 - e.hw) / 20, 0, 1)) * (e.ice ? 0.8 : 1);
          dragT += e.plen / v;
          len += e.plen;
          if (e.type === 'blink') {
            const P = e.blink.period, block = Math.min(P, P * (1 - e.blink.on) + e.plen / v + 0.3);
            waitT += (block * block) / (2 * P);
          }
          const P = e.a === s.from ? e.pts : e.pts.slice().reverse();
          const dir = { x: P[P.length - 1].x - P[P.length - 2].x, y: P[P.length - 1].y - P[P.length - 2].y };
          const din = { x: P[1].x - P[0].x, y: P[1].y - P[0].y };
          if (prev && (prev.x * din.x + prev.y * din.y) / (Math.hypot(prev.x, prev.y) * Math.hypot(din.x, din.y) || 1) < 0.8) turns++;
          prev = dir;
        }
      } else if (L.type === 'ride') {
        const mv = m.movers[L.mover];
        waitT += mv.period / 2 + mv.travel + 0.6;
      } else if (L.type === 'cross') { const G = m.gaps[L.gap]; waitT += Math.hypot(G.b.x - G.a.x, G.b.y - G.a.y) / 140 + (L.item === 'launch' ? 1.45 : 0.4); }
      else if (L.type === 'shrink') waitT += 1;
      else waitT += 0.4;
    }
    if (m.dark) dragT *= 1.15;
    const par = Math.ceil(dragT + turns * 0.2 + waitT + 1.5 + ((p && p.parPad) || 0) - (m.goal.r * 0.66 + BALL_R) / 160);
    return { par: Math.max(3, par), limit: Math.ceil((par * p.timeFactor + 15) / 5) * 5, len };
  }

  MZ.Levels = {
    CHAPTER, MECHS, MODS, GAUNTLET, REMIX_FROM, KEY_COLORS, SWITCH_COLORS, DOOR_R, KEY_R,
    chapterOf, isBoss, chapterName, introOf, levelParams, gauntletParams, gauntletLevel, build,
    label(level) { return isBoss(level) ? 'Boss · Chapter ' + chapterOf(level) : 'Level ' + level; },
  };
})();
