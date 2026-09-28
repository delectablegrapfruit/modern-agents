/* Memaze — seeded maze generation.
 *
 * A level is a graph laid out on a lattice (square, triangulated, hex, polar or organic Poisson points), cut to a shape
 * mask (heart, donut, spiral, islands…), carved into a spanning tree (growing-tree algorithm), optionally braided, then
 * turned into geometry: every maze edge is a polyline corridor of some half-width surrounded by void. Touch the void and
 * you lose. The same seed always gives the same maze.
 *
 * Endless mode uses chunks of a jittered square lattice keyed by chunk coordinates, so the world is unbounded.
 */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { rng, hashStr, hashInts, h01, clamp, lerp, segDist2, segSegDist2, segsCross } = MZ;

  const BALL_R = 18;
  const HW_MIN = 24;
  const DRAG_WIDE = 160, DRAG_NARROW = 110; // par drag speeds (world units/s) on the widest and the narrowest paths
  const GAP = 30; // minimum void between corridors that are not joined
  const gapFor = (hw) => Math.max(GAP, hw * 1.2); // wide easy paths get wide gaps too, so the maze still reads
  const TAU = Math.PI * 2;

  // ---------- shape masks: fn(u, v) with u in [-aspect, aspect], v in [-1, 1] ----------
  const MASKS = {
    rect: { name: 'Block', aspect: 1.25, fn: () => true },
    circle: { name: 'Disc', aspect: 1, fn: (u, v) => u * u + v * v < 1 },
    diamond: { name: 'Diamond', aspect: 1, fn: (u, v) => Math.abs(u) + Math.abs(v) < 1.05 },
    cross: { name: 'Cross', aspect: 1, fn: (u, v) => Math.abs(u) < 0.36 || Math.abs(v) < 0.36 },
    heart: {
      name: 'Heart', aspect: 1,
      fn: (u, v) => { const x = u * 1.2, y = -v * 1.2 + 0.3; const a = x * x + y * y - 1; return a * a * a - x * x * y * y * y < 0; },
    },
    ring: { name: 'Donut', aspect: 1, fn: (u, v) => { const r = Math.hypot(u, v); return r < 1 && r > 0.45; } },
    star: {
      name: 'Star', aspect: 1,
      fn: (u, v) => { const r = Math.hypot(u, v), t = Math.atan2(v, u) + Math.PI / 2; return r < 0.46 + 0.54 * Math.pow(Math.abs(Math.cos(2.5 * t)), 1.5); },
    },
    wave: { name: 'Serpent', aspect: 2, fn: (u, v) => Math.abs(v - 0.5 * Math.sin(u * 2.3)) < 0.45 },
    eight: {
      name: 'Figure Eight', aspect: 1.7,
      fn: (u, v) => { const a = (u - 0.8) ** 2 + v * v, b = (u + 0.8) ** 2 + v * v; return (a < 0.95 && a > 0.13) || (b < 0.95 && b > 0.13); },
    },
    crescent: { name: 'Crescent', aspect: 1, fn: (u, v) => u * u + v * v < 1 && (u - 0.5) ** 2 + v * v > 0.5 },
    hourglass: { name: 'Hourglass', aspect: 0.85, fn: (u, v) => Math.abs(u) < 0.2 + 0.65 * Math.abs(v) },
    blob: {
      name: 'Blob', aspect: 1,
      make: (r) => {
        const ks = [2, 3, 4, 5].map((k) => [k, r.range(0.05, 0.2) / (k * 0.6), r.range(0, TAU)]);
        return (u, v) => {
          const th = Math.atan2(v, u);
          let R = 0.76;
          for (const [k, a, p] of ks) R += a * Math.cos(k * th + p);
          return Math.hypot(u, v) < R;
        };
      },
    },
    islands: {
      name: 'Archipelago', aspect: 1.3,
      make: (r) => {
        const discs = [];
        const n = r.int(3, 5);
        for (let i = 0; i < n; i++) discs.push([r.range(-0.95, 0.95), r.range(-0.62, 0.62), r.range(0.3, 0.46)]);
        return (u, v) => discs.some(([x, y, rad]) => (u - x) ** 2 + (v - y) ** 2 < rad * rad);
      },
    },
    cheese: {
      name: 'Swiss Cheese', aspect: 1.2,
      make: (r) => {
        const holes = [];
        const n = r.int(4, 7);
        for (let i = 0; i < n; i++) holes.push([r.range(-1, 1), r.range(-0.8, 0.8), r.range(0.14, 0.26)]);
        return (u, v) => !holes.some(([x, y, rad]) => (u - x) ** 2 + (v - y) ** 2 < rad * rad);
      },
    },
    spiral: {
      name: 'Spiral', aspect: 1, minNodes: 140,
      make: (r) => {
        const turns = r.range(1.5, 2.1), dir = r.chance(0.5) ? 1 : -1, rot = r.range(0, TAU);
        const b = 1 / (turns * TAU), half = (0.62 / turns) / 2;
        return (u, v) => {
          const rad = Math.hypot(u, v);
          if (rad > 1) return false;
          if (rad < 0.14) return true;
          let th = Math.atan2(v, u) * dir + rot;
          th = ((th % TAU) + TAU) % TAU;
          const k = Math.round((rad / b - th) / TAU);
          let best = 9;
          for (let kk = k - 1; kk <= k + 1; kk++) { const phi = th + TAU * kk; if (phi >= 0) best = Math.min(best, Math.abs(rad - b * phi)); }
          return best < half;
        };
      },
    },
  };

  const LATTICES = {
    // k: closest approach of a corridor to a junction it doesn't touch, per unit spacing; stretch: extra length so
    // corridors meeting at sharp angles don't fuse into blobs.
    square: { name: 'Grid', k: 1, area: 1, stretch: 1 },
    tri: { name: 'Shards', k: 0.707, area: 1, stretch: 1.15 },
    hex: { name: 'Honeycomb', k: 0.866, area: 0.866, stretch: 1.3 },
    polar: { name: 'Rings', k: 0.8, area: 1, stretch: 1.1 },
    organic: { name: 'Wilds', k: 0.62, area: 1.05, stretch: 1.05 },
  };

  function makeMask(id, r) {
    const m = MASKS[id] || MASKS.rect;
    return { id, name: m.name, aspect: m.aspect, fn: m.make ? m.make(r) : m.fn };
  }
  function maskFill(mask) {
    let n = 0;
    const N = 48;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (mask.fn(((i + 0.5) / N * 2 - 1) * mask.aspect, (j + 0.5) / N * 2 - 1)) n++;
    }
    return Math.max(0.05, n / (N * N));
  }
  function spacingFor(lattice, hw, jw) {
    const L = LATTICES[lattice];
    return Math.max(110, ((2 * hw + gapFor(hw)) / Math.max(0.3, L.k - 2 * jw)) * L.stretch);
  }

  // ---------- lattices ----------
  function latGrid(W2, H2, S, jit, r, diag) {
    const cols = Math.max(2, Math.round((2 * W2) / S) + 1), rows = Math.max(2, Math.round((2 * H2) / S) + 1);
    const nodes = [], edges = [];
    const id = (i, j) => j * cols + i;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      nodes.push({ x: (i - (cols - 1) / 2) * S + r.range(-jit, jit) * S, y: (j - (rows - 1) / 2) * S + r.range(-jit, jit) * S });
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (i + 1 < cols) edges.push({ a: id(i, j), b: id(i + 1, j) });
      if (j + 1 < rows) edges.push({ a: id(i, j), b: id(i, j + 1) });
      if (diag && i + 1 < cols && j + 1 < rows) {
        edges.push(r.chance(0.5) ? { a: id(i, j), b: id(i + 1, j + 1) } : { a: id(i + 1, j), b: id(i, j + 1) });
      }
    }
    return { nodes, edges };
  }
  function latHex(W2, H2, S, jit, r) {
    const rh = (S * Math.sqrt(3)) / 2;
    const cols = Math.max(2, Math.round((2 * W2) / S) + 1), rows = Math.max(2, Math.round((2 * H2) / rh) + 1);
    const nodes = [], edges = [];
    const id = (i, j) => j * cols + i;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      nodes.push({
        x: (i - (cols - 1) / 2 + (j & 1 ? 0.25 : -0.25)) * S + r.range(-jit, jit) * S,
        y: (j - (rows - 1) / 2) * rh + r.range(-jit, jit) * S,
      });
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (i + 1 < cols) edges.push({ a: id(i, j), b: id(i + 1, j) });
      if (j + 1 < rows) {
        const l = j & 1 ? i : i - 1, rr = j & 1 ? i + 1 : i;
        if (l >= 0) edges.push({ a: id(i, j), b: id(l, j + 1) });
        if (rr < cols) edges.push({ a: id(i, j), b: id(rr, j + 1) });
      }
    }
    return { nodes, edges };
  }
  function latPolar(H2, S, r) {
    const rings = Math.max(2, Math.round(H2 / S));
    const nodes = [{ x: 0, y: 0, ring: 0, ang: 0 }], edges = [];
    let prev = [0];
    for (let k = 1; k <= rings; k++) {
      const n = Math.max(6, Math.round(TAU * k));
      const off = r.range(0, TAU);
      const ring = [];
      for (let i = 0; i < n; i++) {
        const ang = off + (i / n) * TAU;
        ring.push(nodes.length);
        nodes.push({ x: Math.cos(ang) * k * S, y: Math.sin(ang) * k * S, ring: k, ang });
      }
      for (let i = 0; i < n; i++) edges.push({ a: ring[i], b: ring[(i + 1) % n], arc: k * S });
      for (const id of ring) {
        if (k === 1) { edges.push({ a: id, b: 0 }); continue; }
        let best = -1, bd = 9;
        for (const pid of prev) {
          let d = Math.abs(nodes[pid].ang - nodes[id].ang) % TAU;
          if (d > Math.PI) d = TAU - d;
          if (d < bd) { bd = d; best = pid; }
        }
        edges.push({ a: id, b: best });
      }
      prev = ring;
    }
    return { nodes, edges };
  }
  function latOrganic(W2, H2, S, r) {
    // Bridson Poisson-disk sampling, then a greedy planar graph with clearance and angle rules.
    const d = S * 0.95, cell = d / Math.SQRT2;
    const gw = Math.ceil((2 * W2) / cell) + 1, gh = Math.ceil((2 * H2) / cell) + 1;
    const grid = new Int32Array(gw * gh).fill(-1);
    const pts = [], active = [];
    const put = (x, y) => {
      const i = pts.length;
      pts.push({ x, y });
      active.push(i);
      grid[Math.floor((y + H2) / cell) * gw + Math.floor((x + W2) / cell)] = i;
    };
    put(r.range(-W2, W2) * 0.2, r.range(-H2, H2) * 0.2);
    while (active.length) {
      const ai = Math.floor(r() * active.length), p = pts[active[ai]];
      let placed = false;
      for (let t = 0; t < 24; t++) {
        const ang = r() * TAU, rad = d * (1 + r());
        const x = p.x + Math.cos(ang) * rad, y = p.y + Math.sin(ang) * rad;
        if (x < -W2 || x > W2 || y < -H2 || y > H2) continue;
        const gx = Math.floor((x + W2) / cell), gy = Math.floor((y + H2) / cell);
        let ok = true;
        for (let yy = Math.max(0, gy - 2); ok && yy <= Math.min(gh - 1, gy + 2); yy++) {
          for (let xx = Math.max(0, gx - 2); xx <= Math.min(gw - 1, gx + 2); xx++) {
            const q = grid[yy * gw + xx];
            if (q >= 0 && (pts[q].x - x) ** 2 + (pts[q].y - y) ** 2 < d * d) { ok = false; break; }
          }
        }
        if (ok) { put(x, y); placed = true; break; }
      }
      if (!placed) active.splice(ai, 1);
    }
    const cand = [];
    const maxL = d * 1.75;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const l2 = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
      if (l2 < maxL * maxL) cand.push([l2, i, j]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    const edges = [], inc = pts.map(() => []);
    const clear = S * LATTICES.organic.k, minAng = (40 * Math.PI) / 180;
    for (const [, i, j] of cand) {
      const A = pts[i], B = pts[j];
      let ok = true;
      for (let k = 0; ok && k < pts.length; k++) {
        if (k !== i && k !== j && segDist2(pts[k].x, pts[k].y, A.x, A.y, B.x, B.y) < clear * clear) ok = false;
      }
      for (let e = 0; ok && e < edges.length; e++) {
        const E = edges[e];
        if (E.a === i || E.a === j || E.b === i || E.b === j) continue;
        if (segsCross(A.x, A.y, B.x, B.y, pts[E.a].x, pts[E.a].y, pts[E.b].x, pts[E.b].y)) ok = false;
      }
      const angOk = (n, o) => {
        const a1 = Math.atan2(pts[o].y - pts[n].y, pts[o].x - pts[n].x);
        for (const other of inc[n]) {
          let da = Math.abs(a1 - Math.atan2(pts[other].y - pts[n].y, pts[other].x - pts[n].x)) % TAU;
          if (da > Math.PI) da = TAU - da;
          if (da < minAng) return false;
        }
        return true;
      };
      if (ok && angOk(i, j) && angOk(j, i)) {
        edges.push({ a: i, b: j });
        inc[i].push(j);
        inc[j].push(i);
      }
    }
    return { nodes: pts, edges };
  }

  // ---------- graph helpers ----------
  function adjacency(n, edges) {
    const adj = Array.from({ length: n }, () => []);
    edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
    return adj;
  }
  function components(n, edges) {
    const adj = adjacency(n, edges), comp = new Int32Array(n).fill(-1), comps = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const list = [s];
      comp[s] = comps.length;
      for (let q = 0; q < list.length; q++) {
        for (const ei of adj[list[q]]) {
          const e = edges[ei], o = e.a === list[q] ? e.b : e.a;
          if (comp[o] < 0) { comp[o] = comps.length; list.push(o); }
        }
      }
      comps.push(list);
    }
    return { comp, comps };
  }
  function dijkstra(n, edges, adj, src) {
    const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[src] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const ei of adj[u]) {
        const e = edges[ei], v = e.a === u ? e.b : e.a, nd = best + e.len;
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    return { dist, prev };
  }

  function edgePoints(e, A, B, wob, S, r) {
    const pts = [];
    if (e.arc) {
      let a0 = Math.atan2(A.y, A.x), a1 = Math.atan2(B.y, B.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      const steps = Math.max(2, Math.ceil((Math.abs(da) * e.arc) / (S * 0.28)));
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (da * i) / steps;
        pts.push({ x: Math.cos(a) * e.arc, y: Math.sin(a) * e.arc });
      }
      pts[0] = { x: A.x, y: A.y };
      pts[steps] = { x: B.x, y: B.y };
      return pts;
    }
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const amp1 = wob * S * r.range(-1, 1), amp2 = wob * S * 0.5 * r.range(-1, 1);
    const steps = wob > 0 && !e.bridge ? Math.max(2, Math.ceil(len / (S * 0.3))) : 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, off = steps > 1 ? amp1 * Math.sin(Math.PI * t) + amp2 * Math.sin(TAU * t) : 0;
      pts.push({ x: A.x + dx * t + nx * off, y: A.y + dy * t + ny * off });
    }
    return pts;
  }
  function polyLen(pts) {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return l;
  }

  // ---------- the level generator ----------
  function generate(p) {
    if (p.layout) return fromLayout(p);
    const r = rng(p.seed >>> 0);
    const mask = makeMask(p.mask, r);
    const lat = LATTICES[p.lattice] ? p.lattice : 'square';
    const polarish = lat === 'polar';
    const aspect = polarish ? 1 : mask.aspect;
    const jit = lat === 'polar' || lat === 'organic' ? 0 : p.jitter;
    const S = spacingFor(lat, p.hw * (1 + p.hwVar), jit + p.wobble);
    const nodeArea = LATTICES[lat].area * S * S;
    const N = p.nodes / maskFill(mask);
    const H2 = Math.sqrt((N * nodeArea) / (4 * aspect)), W2 = H2 * aspect;

    let L;
    if (lat === 'square') L = latGrid(W2, H2, S, jit, r, false);
    else if (lat === 'tri') L = latGrid(W2, H2, S, jit, r, true);
    else if (lat === 'hex') L = latHex(W2, H2, S, jit, r);
    else if (lat === 'polar') L = latPolar(H2, S, r);
    else L = latOrganic(W2, H2, S, r);

    // Cut to the mask (and punch random holes), then re-index.
    const keep = L.nodes.map((nd) => mask.fn(nd.x / H2, nd.y / H2) && !(p.holes > 0 && r.chance(p.holes)));
    const remap = new Int32Array(L.nodes.length).fill(-1);
    let nodes = [];
    L.nodes.forEach((nd, i) => { if (keep[i]) { remap[i] = nodes.length; nodes.push({ x: nd.x, y: nd.y }); } });
    let edges = [];
    for (const e of L.edges) {
      if (remap[e.a] >= 0 && remap[e.b] >= 0) edges.push({ a: remap[e.a], b: remap[e.b], arc: e.arc || 0 });
    }

    // Join separate islands with narrow bridges where a clean one fits; drop whatever stays cut off.
    let { comp, comps } = components(nodes.length, edges);
    if (comps.length > 1) {
      comps.sort((a, b) => b.length - a.length);
      const main = new Set(comps[0]);
      let pending = comps.slice(1).filter((c) => c.length >= 3);
      let progress = true;
      while (pending.length && progress) {
        progress = false;
        for (let ci = 0; ci < pending.length; ci++) {
          const c = pending[ci];
          const pairs = [];
          for (const a of c) for (const b of main) pairs.push([(nodes[a].x - nodes[b].x) ** 2 + (nodes[a].y - nodes[b].y) ** 2, a, b]);
          pairs.sort((x, y) => x[0] - y[0]);
          for (const [d2, a, b] of pairs.slice(0, 12)) {
            if (d2 > (3.4 * S) ** 2) break;
            const A = nodes[a], B = nodes[b];
            let ok = true;
            for (let k = 0; ok && k < nodes.length; k++) {
              if (k !== a && k !== b && segDist2(nodes[k].x, nodes[k].y, A.x, A.y, B.x, B.y) < (0.62 * S) ** 2) ok = false;
            }
            for (let k = 0; ok && k < edges.length; k++) {
              const E = edges[k];
              if (E.a === a || E.b === a || E.a === b || E.b === b) continue;
              if (segSegDist2(A.x, A.y, B.x, B.y, nodes[E.a].x, nodes[E.a].y, nodes[E.b].x, nodes[E.b].y) < (0.5 * S) ** 2) ok = false;
            }
            if (ok) {
              edges.push({ a, b, arc: 0, bridge: true });
              c.forEach((x) => main.add(x));
              pending.splice(ci, 1);
              ci--;
              progress = true;
              break;
            }
          }
        }
      }
      ({ comp, comps } = components(nodes.length, edges));
      let mi = 0;
      comps.forEach((c, i) => { if (c.length > comps[mi].length) mi = i; });
      const remap2 = new Int32Array(nodes.length).fill(-1), n2 = [];
      comps[mi].sort((a, b) => a - b).forEach((i) => { remap2[i] = n2.length; n2.push(nodes[i]); });
      edges = edges.filter((e) => remap2[e.a] >= 0 && remap2[e.b] >= 0).map((e) => Object.assign({}, e, { a: remap2[e.a], b: remap2[e.b] }));
      nodes = n2;
    }
    const n = nodes.length;
    for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b];
      e.len = e.arc ? Math.abs(angleDiff(A, B)) * e.arc : Math.hypot(A.x - B.x, A.y - B.y);
    }

    // Carve: growing tree (newest-first ~ long winding corridors, random ~ many short branches).
    const adj = adjacency(n, edges);
    const inTree = new Uint8Array(edges.length), seen = new Uint8Array(n);
    const root = r.int(0, n - 1);
    const active = [root];
    seen[root] = 1;
    while (active.length) {
      const ai = r() < p.algo ? active.length - 1 : Math.floor(r() * active.length);
      const cur = active[ai];
      const opts = adj[cur].filter((ei) => { const e = edges[ei]; return !seen[e.a === cur ? e.b : e.a]; });
      if (!opts.length) { active.splice(ai, 1); continue; }
      const ei = r.pick(opts), e = edges[ei], nxt = e.a === cur ? e.b : e.a;
      inTree[ei] = 1;
      seen[nxt] = 1;
      active.push(nxt);
    }
    // Braid: reopen a few walls for loops — but never one that closes a tiny triangle (it reads as a blob).
    if (p.braid > 0) {
      const nb = Array.from({ length: n }, () => new Set());
      edges.forEach((e, i) => { if (inTree[i]) { nb[e.a].add(e.b); nb[e.b].add(e.a); } });
      edges.forEach((e, i) => {
        if (inTree[i] || e.bridge || !r.chance(p.braid)) return;
        for (const c of nb[e.a]) if (nb[e.b].has(c)) return;
        inTree[i] = 1;
        nb[e.a].add(e.b); nb[e.b].add(e.a);
      });
    }
    let maze = edges.filter((e, i) => inTree[i]);
    const madj = adjacency(n, maze);

    // Start and goal: the two ends of (roughly) the longest route.
    const d0 = dijkstra(n, maze, madj, r.int(0, n - 1)).dist;
    let a = 0;
    for (let i = 1; i < n; i++) if (d0[i] > d0[a]) a = i;
    const da = dijkstra(n, maze, madj, a);
    let b = a;
    const cap = p.maxPath || Infinity;
    for (let i = 0; i < n; i++) if (da.dist[i] <= cap && da.dist[i] > da.dist[b]) b = i;
    if (r.chance(0.5)) { const t = a; a = b; b = t; }
    const fromStart = dijkstra(n, maze, madj, a);
    const mainPath = [];
    for (let v = b; v >= 0; v = fromStart.prev[v]) mainPath.push(v);
    mainPath.reverse();
    const onMain = new Uint8Array(n);
    mainPath.forEach((v) => (onMain[v] = 1));
    const mainEdge = (e) => onMain[e.a] && onMain[e.b] && Math.abs(fromStart.dist[e.a] - fromStart.dist[e.b]) - e.len < 1e-6;

    // Geometry.
    for (const e of maze) {
      e.hw = Math.max(HW_MIN, p.hw * (1 + r.range(-p.hwVar, p.hwVar)));
      if (e.bridge) e.hw = Math.max(HW_MIN, p.hw * 0.72);
      if (e.a === a || e.b === a || e.a === b || e.b === b) e.hw = Math.max(e.hw, p.hw);
      e.wob = e.bridge ? 0 : p.wobble;
      e.seed = r() * 4294967296;
      e.pts = edgePoints(e, nodes[e.a], nodes[e.b], e.wob, S, rng(e.seed));
      e.main = mainEdge(e);
    }
    const fixes = enforceGaps(maze, nodes, S);

    // Vanishing bridges (never next to the start or the goal, never on island links).
    const nearEnds = (e) => e.a === a || e.b === a || e.a === b || e.b === b;
    const blinkAt = new Uint8Array(n); // no two vanishing bridges touch, so there's always solid ground to wait on
    for (const e of maze) {
      e.type = e.bridge ? 'bridge' : 'normal';
      if (e.bridge || nearEnds(e)) continue;
      if (r() < p.blink && !blinkAt[e.a] && !blinkAt[e.b]) {
        e.type = 'blink';
        // Up long enough to cross at a steady drag (the whole picture has to clear it), then gone for 1-1.8 s.
        const up = 1.5 + (e.len + 2 * BALL_R) / 100, period = Math.max(r.range(2.8, 4.4), up + r.range(1, 1.8));
        e.blink = { period, phase: r(), on: Math.max(r.range(0.55, 0.7), up / period) };
        blinkAt[e.a] = blinkAt[e.b] = 1;
      }
    }

    // Gems: at dead ends, the ones deepest off the main route first.
    const branchDepth = multiSource(n, maze, madj, mainPath);
    const leaves = [];
    for (let i = 0; i < n; i++) if (madj[i].length === 1 && i !== a && i !== b) leaves.push(i);
    leaves.sort((x, y) => branchDepth[y] - branchDepth[x]);
    const gems = leaves.slice(0, p.gems).map((i) => ({ x: nodes[i].x, y: nodes[i].y }));
    if (gems.length < p.gems) {
      const off = maze.filter((e) => !e.main && e.type !== 'blink' && !e.bridge);
      r.shuffle(off);
      for (const e of off) {
        if (gems.length >= p.gems) break;
        const P = e.pts[Math.floor(e.pts.length / 2)];
        gems.push({ x: P.x, y: P.y });
      }
    }

    const disc = (i) => ({ x: nodes[i].x, y: nodes[i].y, r: Math.max(BALL_R * 2.6, p.hw * 1.45) });
    const start = disc(a), goal = disc(b);
    const { turns, par } = parOf(nodes, maze, mainPath, goal, 0);
    return {
      seed: p.seed >>> 0, params: p, S, lattice: lat, mask: mask.id,
      nodes, edges: maze, start, goal, gems, mainPath, turns,
      bounds: boundsOf(maze),
      parTime: Math.ceil(par),
      timeLimit: Math.ceil((par * p.timeFactor + 15) / 5) * 5,
      fixes,
    };
  }
  function boundsOf(edges) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of edges) for (const q of e.pts) {
      minX = Math.min(minX, q.x - e.hw); maxX = Math.max(maxX, q.x + e.hw);
      minY = Math.min(minY, q.y - e.hw); maxY = Math.max(maxY, q.y + e.hw);
    }
    return { minX, minY, maxX, maxY };
  }
  // Par ~ a steady drag by someone who knows the way: slower on narrow paths, a beat per real turn, the average wait
  // at each vanishing bridge (gone, or not up long enough to cross), and a couple of seconds (plus pad).
  function parOf(nodes, maze, mainPath, goal, pad) {
    let turns = 0;
    for (let i = 1; i + 1 < mainPath.length; i++) {
      const P = nodes[mainPath[i - 1]], Q = nodes[mainPath[i]], R = nodes[mainPath[i + 1]];
      const c = ((Q.x - P.x) * (R.x - Q.x) + (Q.y - P.y) * (R.y - Q.y)) / (Math.hypot(Q.x - P.x, Q.y - P.y) * Math.hypot(R.x - Q.x, R.y - Q.y) || 1);
      if (c < 0.8) turns++;
    }
    let dragT = 0, waitT = 0;
    for (let i = 0; i + 1 < mainPath.length; i++) {
      const e = maze.find((x) => (x.a === mainPath[i] && x.b === mainPath[i + 1]) || (x.b === mainPath[i] && x.a === mainPath[i + 1]));
      const len = polyLen(e.pts), v = lerp(DRAG_WIDE, DRAG_NARROW, clamp((46 - e.hw) / 20, 0, 1));
      dragT += len / v;
      if (e.type === 'blink') {
        const P = e.blink.period, block = Math.min(P, P * (1 - e.blink.on) + len / v + 0.3);
        waitT += (block * block) / (2 * P);
      }
    }
    const par = dragT - (goal.r * 0.66 + BALL_R) / DRAG_WIDE + turns * 0.2 + waitT + 1.5 + (pad || 0); // the goal counts once the player touches it
    return { turns, par };
  }

  // ---------- hand-made layouts (chapter 1: MZ.Layouts, in layouts.js) ----------
  // The layout is the maze: its corridors exactly as drawn, START and GOAL discs, gems, and pins for what the rest of
  // the pipeline would otherwise place (doors with their keys and colours, mystery boxes, flags).
  function fromLayout(p) {
    const L = (MZ.Layouts || []).find((x) => x.id === p.layout);
    if (!L) throw new Error('Memaze: no layout ' + p.layout);
    const nodes = L.nodes.map(([x, y]) => ({ x, y }));
    const maze = L.edges.map((E, i) => {
      const pts = E.pts.map(([x, y]) => ({ x, y }));
      const e = { a: E.a, b: E.b, hw: E.hw, pts, type: E.type || 'normal', wob: 0, len: polyLen(pts), seed: hashInts(p.seed, i) };
      if (e.type === 'bridge') e.bridge = true;
      if (E.blink) e.blink = Object.assign({}, E.blink);
      return e;
    });
    const n = nodes.length, madj = adjacency(n, maze), a = L.start.node, b = L.goal.node;
    const fromStart = dijkstra(n, maze, madj, a);
    const mainPath = [];
    for (let v = b; v >= 0; v = fromStart.prev[v]) mainPath.push(v);
    mainPath.reverse();
    const onMain = new Uint8Array(n);
    mainPath.forEach((v) => (onMain[v] = 1));
    for (const e of maze) e.main = !!(onMain[e.a] && onMain[e.b] && Math.abs(fromStart.dist[e.a] - fromStart.dist[e.b]) - e.len < 1e-6);
    const fixes = enforceGaps(maze, nodes, 150); // a layout is drawn with room to spare: 0
    const start = { x: nodes[a].x, y: nodes[a].y, r: L.start.r }, goal = { x: nodes[b].x, y: nodes[b].y, r: L.goal.r };
    const { turns, par } = parOf(nodes, maze, mainPath, goal, L.parPad);
    const idxOf = (d) => mainPath.findIndex((v, j) => j + 1 < mainPath.length && ((v === d.a && mainPath[j + 1] === d.b) || (v === d.b && mainPath[j + 1] === d.a)));
    return {
      seed: p.seed >>> 0, params: p, S: 150, lattice: 'square', mask: L.id, name: L.name,
      nodes, edges: maze, start, goal, gems: L.gems.map(([x, y]) => ({ x, y })), mainPath, turns,
      bounds: boundsOf(maze),
      parTime: Math.ceil(par),
      timeLimit: Math.ceil((par * p.timeFactor + 15) / 5) * 5,
      fixes,
      fixed: (L.doors || []).map((d) => ({ kind: 'door', idx: idxOf(d), pinKey: d.key, pinColor: d.color })).sort((x, y) => x.idx - y.idx),
      boxesAt: L.boxes, flagsAt: L.flags,
    };
  }
  function angleDiff(A, B) {
    let d = Math.atan2(B.y, B.x) - Math.atan2(A.y, A.x);
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }
  function multiSource(n, edges, adj, srcs) {
    const dist = new Float64Array(n).fill(Infinity), q = [];
    for (const s of srcs) { dist[s] = 0; q.push(s); }
    for (let i = 0; i < q.length; i++) {
      const u = q[i];
      for (const ei of adj[u]) {
        const e = edges[ei], v = e.a === u ? e.b : e.a;
        if (dist[v] === Infinity) { dist[v] = dist[u] + e.len; q.push(v); }
      }
    }
    return dist;
  }

  // Corridors that aren't joined must keep a visible gap: straighten, then narrow, whatever crowds a neighbour.
  function enforceGaps(maze, nodes, S) {
    let fixes = 0;
    for (let pass = 0; pass < 3; pass++) {
      const segs = [];
      maze.forEach((e, ei) => { for (let i = 1; i < e.pts.length; i++) segs.push([ei, e.pts[i - 1], e.pts[i]]); });
      const cs = S * 1.5, grid = new Map();
      const key = (i, j) => i * 73856093 ^ j * 19349663;
      segs.forEach((s, si) => {
        const x0 = Math.floor((Math.min(s[1].x, s[2].x) - 60) / cs), x1 = Math.floor((Math.max(s[1].x, s[2].x) + 60) / cs);
        const y0 = Math.floor((Math.min(s[1].y, s[2].y) - 60) / cs), y1 = Math.floor((Math.max(s[1].y, s[2].y) + 60) / cs);
        for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(si);
        }
      });
      const bad = new Map();
      const checked = new Set();
      for (const list of grid.values()) {
        for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
          const s = segs[list[x]], t = segs[list[y]];
          if (s[0] === t[0]) continue;
          const E = maze[s[0]], F = maze[t[0]];
          if (E.a === F.a || E.a === F.b || E.b === F.a || E.b === F.b) continue;
          const pk = list[x] < list[y] ? list[x] * 1e6 + list[y] : list[y] * 1e6 + list[x];
          if (checked.has(pk)) continue;
          checked.add(pk);
          const d = Math.sqrt(segSegDist2(s[1].x, s[1].y, s[2].x, s[2].y, t[1].x, t[1].y, t[2].x, t[2].y));
          const need = E.hw + F.hw + GAP * 0.75;
          if (d < need) {
            bad.set(s[0], Math.min(bad.get(s[0]) || 1e9, d));
            bad.set(t[0], Math.min(bad.get(t[0]) || 1e9, d));
          }
        }
      }
      if (!bad.size) break;
      for (const [ei, d] of bad) {
        const e = maze[ei];
        fixes++;
        if (pass === 0 && e.wob > 0) {
          e.wob = 0;
          e.pts = edgePoints(e, nodes[e.a], nodes[e.b], 0, S, rng(e.seed));
        } else {
          e.hw = Math.max(HW_MIN, Math.min(e.hw, (d - GAP * 0.75) / 2));
        }
      }
    }
    return fixes;
  }

  // ---------- difficulty curves ----------
  const MASK_UNLOCK = [['rect', 1], ['circle', 1], ['diamond', 2], ['cross', 3], ['heart', 4], ['ring', 5], ['star', 6], ['wave', 8],
    ['eight', 9], ['crescent', 10], ['hourglass', 11], ['blob', 12], ['cheese', 13], ['islands', 14], ['spiral', 16]];
  const LAT_UNLOCK = [['square', 1], ['tri', 3], ['hex', 5], ['polar', 7], ['organic', 9]];

  function tierParams(level, r) {
    const t = clamp((level - 1) / 34, 0, 1);
    const lats = LAT_UNLOCK.filter(([, l]) => l <= level).map(([id, l]) => [id, l === level ? 50 : 2 + (id === 'square' ? 1 : 0)]);
    const lattice = level <= 2 ? 'square' : r.weighted(lats);
    const nodes = Math.round(lerp(14, 250, Math.pow(t, 1.15)) * r.range(0.85, 1.15));
    const masks = MASK_UNLOCK.filter(([id, l]) => l <= level && (!MASKS[id].minNodes || nodes >= MASKS[id].minNodes))
      .filter(([id]) => lattice !== 'polar' || MASKS[id].aspect === 1)
      .map(([id, l]) => [id, l === level ? 30 : l > level - 6 ? 3 : 1.5]);
    const mask = level === 1 ? 'rect' : level === 2 ? 'circle' : r.weighted(masks);
    return {
      lattice, mask, nodes,
      hw: lerp(46, 27, t) * r.range(0.95, 1.05),
      hwVar: lerp(0.04, 0.22, t),
      jitter: lerp(0, 0.08, t),
      wobble: level < 3 ? 0 : lerp(0.02, 0.1, t),
      algo: r.range(0.35, 1),
      braid: lerp(0.16, 0.03, t),
      holes: level >= 6 && r.chance(0.3) ? 0.05 : 0,
      blink: level >= 8 ? lerp(0.05, 0.1, t) : 0,
      gems: Math.min(8, 2 + Math.floor(level / 4)),
      timeFactor: lerp(3, 2.3, t), // you don't know the way yet: room to explore dead ends
      maxPath: lerp(2500, 7000, t),
    };
  }
  // ---------- endless: an unbounded chunked maze ----------
  const EC = 7, ES = 170;
  function endlessDifficulty(cx, cy) { return clamp(Math.max(Math.abs(cx), Math.abs(cy)) / 10, 0, 1); }
  function endlessNode(seed, gx, gy) {
    const cx = Math.floor(gx / EC), cy = Math.floor(gy / EC);
    const jit = lerp(0.02, 0.09, endlessDifficulty(cx, cy)) * ES;
    return { x: gx * ES + (h01(seed, gx, gy, 1) * 2 - 1) * jit, y: gy * ES + (h01(seed, gx, gy, 2) * 2 - 1) * jit };
  }
  function endlessHw(seed, cx, cy) {
    return lerp(42, 28, endlessDifficulty(cx, cy)) * (0.95 + 0.1 * h01(seed, cx, cy, 3));
  }
  function endlessChunk(seed, cx, cy) {
    const r = rng(hashInts(seed, cx, cy, 7));
    const d = endlessDifficulty(cx, cy);
    const hw = endlessHw(seed, cx, cy);
    const gx0 = cx * EC, gy0 = cy * EC;
    const id = (i, j) => j * EC + i;
    const nodes = [];
    for (let j = 0; j < EC; j++) for (let i = 0; i < EC; i++) nodes.push(endlessNode(seed, gx0 + i, gy0 + j));
    const lat = [];
    for (let j = 0; j < EC; j++) for (let i = 0; i < EC; i++) {
      if (i + 1 < EC) lat.push({ a: id(i, j), b: id(i + 1, j) });
      if (j + 1 < EC) lat.push({ a: id(i, j), b: id(i, j + 1) });
    }
    const adj = adjacency(nodes.length, lat);
    const inTree = new Uint8Array(lat.length), seen = new Uint8Array(nodes.length);
    const active = [r.int(0, nodes.length - 1)];
    seen[active[0]] = 1;
    while (active.length) {
      const ai = r() < 0.7 ? active.length - 1 : Math.floor(r() * active.length);
      const cur = active[ai];
      const opts = adj[cur].filter((ei) => !seen[lat[ei].a === cur ? lat[ei].b : lat[ei].a]);
      if (!opts.length) { active.splice(ai, 1); continue; }
      const ei = r.pick(opts), nxt = lat[ei].a === cur ? lat[ei].b : lat[ei].a;
      inTree[ei] = 1;
      seen[nxt] = 1;
      active.push(nxt);
    }
    lat.forEach((e, i) => { if (!inTree[i] && r.chance(0.12)) inTree[i] = 1; });
    const edges = [];
    lat.forEach((e, i) => {
      if (!inTree[i]) return;
      edges.push({ pts: [nodes[e.a], nodes[e.b]], hw: hw * (1 + r.range(-0.12, 0.12) * d), type: 'normal', a: e.a, b: e.b });
    });
    // Links to the right and lower neighbours, owned by this chunk.
    const link = (salt, dxc, dyc) => {
      const lr = rng(hashInts(seed, cx, cy, salt));
      const ks = [lr.int(0, EC - 1)];
      if (lr.chance(0.55)) { const k2 = lr.int(0, EC - 1); if (Math.abs(k2 - ks[0]) > 1) ks.push(k2); }
      const hw2 = Math.min(hw, endlessHw(seed, cx + dxc, cy + dyc));
      for (const k of ks) {
        const A = dxc ? nodes[id(EC - 1, k)] : nodes[id(k, EC - 1)];
        const B = dxc ? endlessNode(seed, gx0 + EC, gy0 + k) : endlessNode(seed, gx0 + k, gy0 + EC);
        edges.push({ pts: [A, B], hw: hw2, type: 'normal', link: true });
      }
    };
    link(11, 1, 0);
    link(13, 0, 1);
    const origin = cx === 0 && cy === 0;
    const deg = new Int32Array(nodes.length);
    for (const e of edges) if (!e.link) { deg[e.a]++; deg[e.b]++; }
    const blink = d > 0.2 ? lerp(0.03, 0.09, d) : 0;
    for (const e of edges) {
      if (e.link || (origin && (e.a === id(3, 3) || e.b === id(3, 3)))) continue;
      if (r() < blink) {
        e.type = 'blink';
        const len = Math.hypot(e.pts[1].x - e.pts[0].x, e.pts[1].y - e.pts[0].y), up = 1.5 + (len + 2 * BALL_R) / 100;
        const period = Math.max(r.range(2.8, 4.2), up + r.range(1, 1.8));
        e.blink = { period, phase: r(), on: Math.max(r.range(0.58, 0.7), up / period) };
      }
    }
    const safe = new Uint8Array(nodes.length);
    for (const e of edges) if (!e.link && e.type !== 'blink') { safe[e.a] = 1; safe[e.b] = 1; }
    const gems = [];
    for (let i = 0; i < nodes.length; i++) {
      if (deg[i] === 1 && safe[i] && !(origin && i === id(3, 3)) && r.chance(0.5) && gems.length < 4) gems.push({ x: nodes[i].x, y: nodes[i].y });
    }
    const beacons = [];
    if (!origin && r.chance(0.4)) {
      const cands = [];
      for (let i = 0; i < nodes.length; i++) if (safe[i] && deg[i] >= 2) cands.push(i);
      if (cands.length) { const i = r.pick(cands); beacons.push({ x: nodes[i].x, y: nodes[i].y, r: hw * 1.3 }); }
    }
    const safeNodes = [];
    for (let i = 0; i < nodes.length; i++) if (safe[i]) safeNodes.push(nodes[i]);
    return {
      cx, cy, edges, gems, beacons, safeNodes,
      discs: origin ? [{ x: nodes[id(3, 3)].x, y: nodes[id(3, 3)].y, r: Math.max(BALL_R * 2.6, hw * 1.45) }] : [],
      start: origin ? nodes[id(3, 3)] : null,
    };
  }

  // ---------- checkpoints and mystery boxes (placed on a finished maze; neither changes its layout or uses its rng) ----------
  const CLEAR = 16;
  // Flags go evenly along the main route (none on short mazes), each on a junction that no vanishing bridge touches,
  // with a round platform that stays clear of every corridor it doesn't join.
  function placeCheckpoints(m) {
    if (m.flagsAt) return m.flagsAt.map((v) => ({ idx: m.mainPath.indexOf(v), x: m.nodes[v].x, y: m.nodes[v].y, r: Math.max(BALL_R * 2.3, ((m.params && m.params.hw) || 36) * 1.3), lit: false, seen: false })); // pinned by a layout
    const mp = m.mainPath, nodes = m.nodes, edges = m.edges;
    if (!mp || mp.length < 6) return [];
    const inc = new Map();
    for (const e of edges) for (const v of [e.a, e.b]) { if (!inc.has(v)) inc.set(v, []); inc.get(v).push(e); }
    const cum = [0];
    for (let i = 0; i + 1 < mp.length; i++) {
      const e = (inc.get(mp[i]) || []).find((x) => x.a === mp[i + 1] || x.b === mp[i + 1]);
      cum.push(cum[i] + (e ? polyLen(e.pts) : Math.hypot(nodes[mp[i + 1]].x - nodes[mp[i]].x, nodes[mp[i + 1]].y - nodes[mp[i]].y)));
    }
    const L = cum[cum.length - 1];
    const count = Math.max(0, Math.min(3, Math.floor((L - 1000) / 2000)));
    if (!count) return [];
    const hw = (m.params && m.params.hw) || 36, R = Math.max(BALL_R * 2.3, hw * 1.3);
    const ends = [m.start, m.goal];
    const ok = (idx) => {
      const v = mp[idx], P = nodes[v], mine = inc.get(v) || [];
      if (mine.some((e) => e.type !== 'normal') || (m.reserved && m.reserved.has(v))) return false; // clear of bridges and mechanics
      for (const k of m.keepClear || []) if (Math.sqrt(segDist2(P.x, P.y, k.ax, k.ay, k.bx, k.by)) < k.r + R + CLEAR) return false;
      for (const a of m.avoid || []) if (Math.hypot(a.x - P.x, a.y - P.y) < a.r + R) return false;
      for (const d of ends) if (Math.hypot(d.x - P.x, d.y - P.y) < d.r + R + CLEAR) return false;
      for (const e of edges) {
        if (e.a === v || e.b === v) continue;
        for (let i = 1; i < e.pts.length; i++) {
          const a = e.pts[i - 1], b = e.pts[i];
          if (Math.sqrt(segDist2(P.x, P.y, a.x, a.y, b.x, b.y)) - e.hw < R + CLEAR) return false;
        }
      }
      return true;
    };
    const out = [], step = L / (count + 1);
    for (let k = 1; k <= count; k++) {
      const want = step * k;
      let best = -1, bd = Infinity;
      for (let i = 2; i < mp.length - 2; i++) {
        const d = Math.abs(cum[i] - want);
        if (d > step * 0.45 || d >= bd) continue;
        if (out.some((c) => Math.abs(cum[c.idx] - cum[i]) < step * 0.5)) continue;
        if (ok(i)) { best = i; bd = d; }
      }
      if (best >= 0) out.push({ idx: best, x: nodes[mp[best]].x, y: nodes[mp[best]].y, r: R, lit: false, seen: false });
    }
    return out;
  }

  // Mystery boxes: on junctions and dead ends touched by solid floor, one per ~1500 units of corridor, spread out
  // (each as far as possible from the others and the start), never on or next to the start, the goal, a flag or a gem.
  function placeBoxes(m, flags) {
    if (m.boxesAt) return m.boxesAt.map((v) => ({ x: m.nodes[v].x, y: m.nodes[v].y })); // pinned by a layout
    const r = rng(hashInts(m.seed, 0xb0c5));
    const solid = new Uint8Array(m.nodes.length);
    let total = 0;
    for (const e of m.edges) { total += polyLen(e.pts); if (e.type === 'normal' || e.type === 'bridge') solid[e.a] = solid[e.b] = 1; }
    const want = clamp(Math.round(total / 1500), 1, 10);
    const away = [{ x: m.start.x, y: m.start.y, r: m.start.r + 70 }, { x: m.goal.x, y: m.goal.y, r: m.goal.r + 90 }];
    for (const c of flags || []) away.push({ x: c.x, y: c.y, r: c.r + 50 });
    for (const g of m.gems) away.push({ x: g.x, y: g.y, r: 60 });
    for (const a of m.avoid || []) away.push(a);
    const cands = [];
    m.nodes.forEach((P, i) => { if (solid[i] && !(m.reserved && m.reserved.has(i)) && away.every((a) => Math.hypot(a.x - P.x, a.y - P.y) > a.r)) cands.push({ x: P.x, y: P.y }); });
    r.shuffle(cands);
    const out = [], MIN = 320;
    while (out.length < want && cands.length) {
      let best = -1, bd = -1;
      for (let i = 0; i < cands.length; i++) {
        let d = Math.hypot(cands[i].x - m.start.x, cands[i].y - m.start.y);
        for (const b of out) d = Math.min(d, Math.hypot(cands[i].x - b.x, cands[i].y - b.y));
        if (d > bd) { bd = d; best = i; }
      }
      if (bd < MIN) break;
      out.push(cands.splice(best, 1)[0]);
    }
    return out;
  }
  // Endless: up to one box per chunk, on its own rng so the chunk's layout is untouched.
  function chunkBoxes(seed, c) {
    const r = rng(hashInts(seed, c.cx, c.cy, 17));
    if (!r.chance(0.45)) return [];
    const taken = c.gems.concat(c.beacons, c.start ? [c.start] : []);
    const cands = c.safeNodes.filter((n) => taken.every((t) => Math.hypot(t.x - n.x, t.y - n.y) > 60));
    return cands.length ? [Object.assign({}, r.pick(cands))] : [];
  }

  MZ.Gen = {
    BALL_R, HW_MIN, GAP, MASKS, LATTICES, MASK_UNLOCK, LAT_UNLOCK,
    generate, tierParams, checkpoints: placeCheckpoints, boxes: placeBoxes,
    endless: { EC, ES, chunk: (seed, cx, cy) => { const c = endlessChunk(seed, cx, cy); c.boxes = chunkBoxes(seed, c); return c; }, difficulty: endlessDifficulty },
  };
})();
