/* Memaze — the playable world: corridor segments in a spatial hash, answering "how far inside the floor is this point".
 * A world is made of parts (tiles of a finished maze, or endless chunks), each also carrying its cached drawing paths.
 * Some floor comes and goes: vanishing bridges (on a clock), switch bridges (on a switch), moving platforms. */
(function () {
  'use strict';
  const MZ = window.MZ;
  const { segDist2 } = MZ;
  const CELL = 180;
  const QUERY_MARGIN = 48; // segments are indexed a bit wider than they are, so a point just off the floor still finds it

  const key = (i, j) => (i & 0xffff) * 65536 + (j & 0xffff);
  const blinkPhase = (b, t) => (((t / b.period + b.phase) % 1) + 1) % 1;
  const blinkOn = (b, t) => blinkPhase(b, t) < b.on;
  // Where a moving platform is at time t: resting at each end for `pause`, gliding between (eased).
  function moverAt(mv, t) {
    const c = ((((t / mv.period + mv.phase) % 1) + 1) % 1) * mv.period, T = mv.travel, P = mv.pause;
    let k;
    if (c < P) k = 0;
    else if (c < P + T) k = (c - P) / T;
    else if (c < 2 * P + T) k = 1;
    else k = 1 - (c - 2 * P - T) / T;
    k = k * k * (3 - 2 * k);
    return { x: mv.a.x + (mv.b.x - mv.a.x) * k, y: mv.a.y + (mv.b.y - mv.a.y) * k, k };
  }

  class World {
    constructor() {
      this.grid = new Map();
      this.parts = new Map();
      this.sw = {};      // switch states by colour group (0 or 1)
      this.movers = [];  // moving platforms
    }

    addPart(id, data) {
      const part = { id, segs: [], blinks: [], edges: data.edges || [], discs: data.discs || [], paths: null, data };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const add = (ax, ay, bx, by, hw, blink, sw, ice) => {
        const s = { ax, ay, bx, by, hw, blink, sw, ice, dyn: !!(blink || sw) };
        part.segs.push(s);
        minX = Math.min(minX, ax - hw, bx - hw); maxX = Math.max(maxX, ax + hw, bx + hw);
        minY = Math.min(minY, ay - hw, by - hw); maxY = Math.max(maxY, ay + hw, by + hw);
        const m = hw + QUERY_MARGIN;
        const i0 = Math.floor((Math.min(ax, bx) - m) / CELL), i1 = Math.floor((Math.max(ax, bx) + m) / CELL);
        const j0 = Math.floor((Math.min(ay, by) - m) / CELL), j1 = Math.floor((Math.max(ay, by) + m) / CELL);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const k = key(i, j);
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(s);
        }
      };
      for (const e of part.edges) {
        const blink = e.type === 'blink' ? e.blink : null, sw = e.type === 'switch' ? e.sw : null;
        if (blink || sw) part.blinks.push(e);
        for (let i = 1; i < e.pts.length; i++) add(e.pts[i - 1].x, e.pts[i - 1].y, e.pts[i].x, e.pts[i].y, e.hw, blink, sw, !!e.ice);
      }
      for (const d of part.discs) add(d.x, d.y, d.x, d.y, d.r, null);
      part.bbox = { minX, minY, maxX, maxY };
      this.parts.set(id, part);
      return part;
    }

    removePart(id) {
      const part = this.parts.get(id);
      if (!part) return;
      const dead = new Set(part.segs);
      for (const s of part.segs) {
        const m = s.hw + QUERY_MARGIN;
        const i0 = Math.floor((Math.min(s.ax, s.bx) - m) / CELL), i1 = Math.floor((Math.max(s.ax, s.bx) + m) / CELL);
        const j0 = Math.floor((Math.min(s.ay, s.by) - m) / CELL), j1 = Math.floor((Math.max(s.ay, s.by) + m) / CELL);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const k = key(i, j), list = this.grid.get(k);
          if (!list) continue;
          const kept = list.filter((x) => !dead.has(x));
          if (kept.length) this.grid.set(k, kept); else this.grid.delete(k);
        }
      }
      this.parts.delete(id);
    }

    clear() { this.grid.clear(); this.parts.clear(); }

    // The deepest floor under (x, y): depth > 0 means inside a corridor by that much, < 0 means that far out in the void.
    // Also returns the segment (seg.dyn: floor that can go away; seg.ice: icy).
    query(x, y, t) {
      const list = this.grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL)));
      const out = { depth: -Infinity, seg: null };
      if (list) for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s.blink && !blinkOn(s.blink, t)) continue;
        if (s.sw && (this.sw[s.sw.g] | 0) !== s.sw.on) continue;
        const d = s.hw - Math.sqrt(segDist2(x, y, s.ax, s.ay, s.bx, s.by));
        if (d > out.depth) { out.depth = d; out.seg = s; }
      }
      for (let i = 0; i < this.movers.length; i++) {
        const mv = this.movers[i], p = moverAt(mv, t), d = mv.r - Math.hypot(x - p.x, y - p.y);
        if (d > out.depth) { out.depth = d; out.seg = mv.seg; }
      }
      return out;
    }

    visibleParts(minX, minY, maxX, maxY) {
      const out = [];
      for (const p of this.parts.values()) {
        const b = p.bbox;
        if (b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY) out.push(p);
      }
      return out;
    }
  }

  // A finished maze is split into square tiles so drawing can skip what's off screen.
  World.fromMaze = function (maze) {
    const w = new World();
    const T = 1100;
    const tiles = new Map();
    const tileOf = (x, y) => Math.floor(x / T) + ',' + Math.floor(y / T);
    const get = (k) => { if (!tiles.has(k)) tiles.set(k, { edges: [], discs: [] }); return tiles.get(k); };
    for (const e of maze.edges) {
      const m = e.pts[Math.floor(e.pts.length / 2)];
      get(tileOf(m.x, m.y)).edges.push(e);
    }
    for (const d of [maze.start, maze.goal].concat(maze.pads || [])) get(tileOf(d.x, d.y)).discs.push({ x: d.x, y: d.y, r: d.r });
    for (const [k, v] of tiles) w.addPart(k, v);
    for (const mv of maze.movers || []) { mv.seg = { dyn: true, mover: mv }; w.movers.push(mv); }
    return w;
  };

  MZ.World = World;
  MZ.blinkOn = blinkOn;
  MZ.blinkPhase = blinkPhase;
  MZ.moverAt = moverAt;
})();
