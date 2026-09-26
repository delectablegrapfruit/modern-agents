// Lull — procedural puzzles. A puzzle is built backwards from its solution: rows are filled solid, then pieces are
// lifted out of them one by one, each only where it could have been flown in and set. What remains is the garbage;
// the lifted pieces, in reverse, are the queue. Every candidate is then played forwards (line clears and all) and
// kept only if it solves, so every seed has at least one known solution.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Board, CELL, Pieces, RNG, hash32, codeFromInt, intFromCode, spawnPos } = L;

  const GEN_VERSION = 3;
  const DIFFS = {
    E: { id: 'E', name: 'Easy', reward: 4, color: '#7bd88f' },
    M: { id: 'M', name: 'Medium', reward: 10, color: '#f6c177' },
    H: { id: 'H', name: 'Hard', reward: 24, color: '#eb6f92' },
  };

  // Wildcards. w = weight per difficulty (0 = never), x = incompatible with.
  const MODS = {
    big:    { name: 'Big Minos', icon: '⬛', desc: 'Every piece is twice the size.', w: { E: 1, M: 2, H: 2 }, x: ['odd'] },
    odd:    { name: 'Odd Shapes', icon: '✳', desc: 'Trominoes and pentominoes join the queue.', w: { E: 0.6, M: 2, H: 2 }, x: ['big'] },
    wrap:   { name: 'Wraparound', icon: '↔', desc: 'The side walls are portals: leave on one side, arrive on the other.', w: { E: 0.6, M: 2, H: 2 } },
    rigid:  { name: 'Rigid', icon: '⊘', desc: 'Pieces cannot turn. Each one arrives already facing its way.', w: { E: 1, M: 1.5, H: 1.5 } },
    heavy:  { name: 'Heavy', icon: '⤓', desc: 'No lowering: pieces only hard-drop, so nothing slides under a ledge.', w: { E: 1.5, M: 1, H: 0.6 } },
    invert: { name: 'Inverted Controls', icon: '⇄', desc: 'Left moves right, right moves left, and turns go the other way.', w: { E: 0.7, M: 1.5, H: 1.5 } },
    flip:   { name: 'Upside Down', icon: '↕', desc: 'The board hangs from the ceiling; pieces fall up.', w: { E: 1, M: 1.2, H: 1.2 }, x: ['side'] },
    side:   { name: 'Sideways', icon: '↩', desc: 'Gravity pulls to the left. Arrow keys follow the screen.', w: { E: 1, M: 1.2, H: 1.2 }, x: ['flip'] },
    fog:    { name: 'Fog', icon: '☁', desc: 'Blocks are only visible near your piece.', w: { E: 0, M: 1.2, H: 1.5 } },
    vanish: { name: 'Vanishing', icon: '◌', desc: 'Pieces turn invisible once set.', w: { E: 0, M: 0.6, H: 1.5 } },
    blind:  { name: 'Blind Queue', icon: '?', desc: 'You only see the piece in play.', w: { E: 0, M: 1, H: 1.5 } },
    // Puzzles have no hold slot, except with this wildcard — and then the queue comes out of order, so it is needed.
    hold:   { name: 'Hold', icon: '⇆', desc: 'The hold slot is open, and you will need it: the queue arrives out of order.', w: { E: 0.8, M: 1.3, H: 1.6 } },
    mono:   { name: 'Monochrome', icon: '◐', desc: 'Garbage and pieces share one colour.', w: { E: 1, M: 1, H: 1 } },
  };

  const GOALS = {
    clear: { name: 'Clear the board', short: 'Perfect clear' },
    lines: { name: 'Clear lines', short: 'Lines' },
    gems:  { name: 'Clear every gem', short: 'Gems' },
  };

  const ADJ = ['Quiet', 'Folded', 'Hidden', 'Crooked', 'Gentle', 'Hollow', 'Twisted', 'Paper', 'Velvet', 'Tidy', 'Narrow', 'Sunken', 'Lazy', 'Clever', 'Sleepy', 'Brass', 'Glass', 'Loose', 'Patient', 'Tiny', 'Stubborn', 'Wobbly', 'Silent', 'Cozy', 'Crumpled', 'Slanted', 'Secret', 'Rusty', 'Mossy', 'Lucky'];
  const NOUN = ['Hinge', 'Staircase', 'Keyhole', 'Pocket', 'Ledge', 'Burrow', 'Drawer', 'Nook', 'Attic', 'Cellar', 'Alcove', 'Ladder', 'Bridge', 'Tunnel', 'Envelope', 'Knot', 'Cradle', 'Lantern', 'Harbor', 'Orchard', 'Pantry', 'Porch', 'Tower', 'Garden', 'Chimney', 'Quarry', 'Hallway', 'Locket', 'Mailbox', 'Teacup'];

  // ---- seeds ----------------------------------------------------------------------------------------------------------

  function numberedSeed(diff, n) { return diff + '-' + codeFromInt(hash32('lull:' + diff + ':' + n)); }

  /**
   * Dailies. Every date has its own seed per difficulty and every seed belongs to exactly one date: day numbers
   * (days since 1 January 2000) go through a fixed, keyed shuffle of all 2^32 seed numbers — a four-round Feistel
   * network, which can be run backwards to find the date a seed belongs to. The keys are built in, so every copy
   * of Lull agrees on today's puzzle.
   */
  const DAY0 = Date.UTC(2000, 0, 1);
  function feistel(n, diff, back) {
    let l = (n >>> 16) & 0xffff, r = n & 0xffff;
    const round = (i, x) => hash32('lull:daily:' + diff + ':' + i + ':' + x) & 0xffff;
    if (!back) for (let i = 0; i < 4; i++) { const t = l ^ round(i, r); l = r; r = t; }
    else for (let i = 3; i >= 0; i--) { const t = r ^ round(i, l); r = l; l = t; }
    return ((l << 16) | r) >>> 0;
  }
  function dayOf(key) { const [y, m, d] = key.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - DAY0) / 86400000); }
  function keyOfDay(day) { const dt = new Date(DAY0 + day * 86400000); return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0'); }
  function dailySeed(diff, key) { return diff + '-' + codeFromInt(feistel(dayOf(key) >>> 0, diff)); }
  /** The date whose Daily a seed is (every seed has one; it may be thousands of years away). */
  function dailyDateOf(seed) {
    const p = parseSeed(seed);
    if (!p) return null;
    const day = feistel(intFromCode(p.code), p.diff, true);
    return { day, key: day < 2900000 ? keyOfDay(day) : null, years: Math.floor(day / 365.2425) };
  }
  const SEEDS_PER_DIFF = 4294967296;
  function randomSeed(diff) { return diff + '-' + codeFromInt((Math.random() * 4294967296) >>> 0); }
  function parseSeed(s) {
    const m = /^\s*([EMH])\s*[-–·:\s]?\s*([0-9A-Za-z]{7})\s*$/i.exec(String(s || ''));
    if (!m) return null;
    const diff = m[1].toUpperCase(), n = intFromCode(m[2]);
    if (n == null) return null;
    // Seven symbols can spell more than 2^32 numbers; the ones that wrap around read as the seed they wrap to.
    const code = codeFromInt(n);
    return { diff, code, seed: diff + '-' + code };
  }

  // ---- reachability ---------------------------------------------------------------------------------------------------

  const MOVES = ['L', 'R', 'D', 'CW', 'CCW', '180'];

  /**
   * Breadth-first search over (rotation, x, y) from the spawn spot, with the same moves and kicks the engine uses.
   * Returns the path of moves to the first goal state reached, or null. `heavy` pieces cannot lower: they reach a
   * goal by hard-dropping from any state they can fly to.
   */
  function reach(board, type, startRot, goals, opts) {
    opts = opts || {};
    const W = board.w, H = board.h, n = type.n, wrap = board.wrap;
    const XO = n + 2, YO = n + 2;
    const W2 = wrap ? W : W + 2 * XO, H2 = H + 2 * YO;
    const norm = (x) => (wrap ? ((x % W) + W) % W : x);
    const key = (r, x, y) => (r * H2 + (y + YO)) * W2 + (wrap ? norm(x) : x + XO);
    const goalSet = new Set(goals.map(([r, x, y]) => key(r, x, y)));
    const prev = new Int32Array(4 * H2 * W2).fill(-2);
    const how = new Int8Array(4 * H2 * W2);
    const start = spawnPos(W, H, type, startRot);
    const sx = norm(start.x), sy = start.y;
    if (!board.fits(type.rots[startRot], sx, sy)) return null;
    const sk = key(startRot, sx, sy);
    prev[sk] = -1;
    const qr = [startRot], qx = [sx], qy = [sy];
    const canRotate = !opts.noRotate && type.kicks !== 'none';
    const maxKick = type.kicks === 'i' || type.big ? 2 : 1;
    const path = (k) => {
      const out = [];
      while (prev[k] >= 0) { out.push(MOVES[how[k]]); k = prev[k]; }
      return out.reverse();
    };
    const landing = (r, x, y) => { while (board.fits(type.rots[r], x, y - 1)) y--; return y; };
    const check = (r, x, y, k) => {
      if (opts.heavy) {
        const ly = landing(r, x, y);
        if (goalSet.has(key(r, x, ly))) return path(k).concat(['DROP']);
        return null;
      }
      return goalSet.has(k) ? path(k) : null;
    };
    let found = check(startRot, sx, sy, sk);
    if (found) return found;
    for (let head = 0; head < qr.length; head++) {
      const r = qr[head], x = qx[head], y = qy[head];
      const k0 = key(r, x, y);
      for (let m = 0; m < 6; m++) {
        let nr = r, nx = x, ny = y;
        if (m === 0) nx = x - 1;
        else if (m === 1) nx = x + 1;
        else if (m === 2) { if (opts.heavy) continue; ny = y - 1; }
        else {
          if (!canRotate) break;
          nr = (r + (m === 3 ? 1 : m === 4 ? 3 : 2)) % 4;
          const kicks = Pieces.kicksFor(type, r, nr);
          let ok = false;
          for (const [kx, ky] of kicks) {
            if (board.fits(type.rots[nr], x + kx, y + ky)) {
              // The engine takes the first kick that fits. Puzzles only count on turns a person would expect:
              // in place, or nudged sideways off a wall — never the SRS kicks that hop a piece down or through
              // a gap it visibly does not fit.
              if (ky !== 0 || Math.abs(kx) > maxKick) break;
              nx = x + kx; ny = y + ky; ok = true; break;
            }
          }
          if (!ok) continue;
        }
        if (m < 3 && !board.fits(type.rots[nr], nx, ny)) continue;
        nx = norm(nx);
        const k = key(nr, nx, ny);
        if (prev[k] !== -2) continue;
        prev[k] = k0;
        how[k] = m;
        found = check(nr, nx, ny, k);
        if (found) return found;
        qr.push(nr); qx.push(nx); qy.push(ny);
      }
    }
    return null;
  }

  /** Every (rotation, x, y) whose cells are exactly those of the target placement. */
  function goalStates(type, r, x, y, board) {
    const out = [];
    const b0 = type.rotBounds[r];
    for (let q = 0; q < 4; q++) {
      if (type.keys[q] !== type.keys[r]) continue;
      const b = type.rotBounds[q];
      out.push([q, board.wx(x + b0.minX - b.minX), y + b0.minY - b.minY]);
    }
    return out;
  }

  /** Could the piece fall straight into place from the top (no tuck or spin needed)? */
  function straightDrop(board, type, r, x, y) {
    for (let yy = y; yy < board.h - type.rotBounds[r].maxY; yy++) if (!board.fits(type.rots[r], x, yy)) return false;
    return true;
  }

  // ---- hold puzzles ----------------------------------------------------------------------------------------------------

  /** Every spot a piece can come to rest from its spawn (same moves and kicks as reach), one per distinct shape. */
  function restingStates(board, type, startRot, opts, accept) {
    opts = opts || {};
    const W = board.w, wrap = board.wrap;
    const norm = (x) => (wrap ? ((x % W) + W) % W : x);
    const start = spawnPos(W, board.h, type, startRot);
    const sx = norm(start.x), sy = start.y;
    if (!board.fits(type.rots[startRot], sx, sy)) return [];
    const seen = new Set([startRot + ',' + sx + ',' + sy]);
    const q = [[startRot, sx, sy]];
    const out = new Map();
    const canRotate = !opts.noRotate && type.kicks !== 'none';
    const maxKick = type.kicks === 'i' || type.big ? 2 : 1;
    const rest = (r, x, y) => {
      let yy = y;
      while (board.fits(type.rots[r], x, yy - 1)) yy--;
      if (!opts.heavy && yy !== y) return;
      if (accept && !accept(r, x, yy)) return;
      const cells = type.rots[r].map(([cx, cy]) => [board.wx(x + cx), yy + cy]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const k = cells.join(';');
      if (!out.has(k)) out.set(k, [r, x, yy]);
    };
    for (let head = 0; head < q.length && head < 6000; head++) {
      const [r, x, y] = q[head];
      rest(r, x, y);
      for (let m = 0; m < 6; m++) {
        let nr = r, nx = x, ny = y;
        if (m === 0) nx = x - 1;
        else if (m === 1) nx = x + 1;
        else if (m === 2) { if (opts.heavy) continue; ny = y - 1; }
        else {
          if (!canRotate) break;
          nr = (r + (m === 3 ? 1 : m === 4 ? 3 : 2)) % 4;
          let ok = false;
          for (const [kx, ky] of Pieces.kicksFor(type, r, nr)) {
            if (board.fits(type.rots[nr], x + kx, y + ky)) { if (ky !== 0 || Math.abs(kx) > maxKick) break; nx = x + kx; ny = y + ky; ok = true; break; }
          }
          if (!ok) continue;
        }
        if (m < 3 && !board.fits(type.rots[nr], nx, ny)) continue;
        nx = norm(nx);
        const k = nr + ',' + nx + ',' + ny;
        if (seen.has(k)) continue;
        seen.add(k); q.push([nr, nx, ny]);
      }
    }
    return Array.from(out.values());
  }

  /**
   * Can the puzzle be solved playing the queue exactly in order (no hold)? Exhaustive search. For the "clear" and
   * "lines" goals every piece cell must land in a hole of the band (the pieces fill it exactly), which keeps the
   * search small. Returns true, false, or null when it gave up (too many positions to be sure).
   */
  function solvableInOrder(puzzle, queue, limit) {
    const opts = { noRotate: puzzle.mods.includes('rigid'), heavy: puzzle.mods.includes('heavy') };
    const board = Board.fromArray(puzzle.w, puzzle.h, puzzle.cells, { wrap: puzzle.wrap });
    const exact = puzzle.goal.type !== 'gems';
    const seen = new Set();
    let nodes = 0, gaveUp = false;
    const types = queue.map((e) => Pieces.get(e.id));
    // Exact goals: only spots where every cell fills a hole in the band and the piece rests; each is then checked
    // for a way in. (Cheaper than listing every reachable spot.)
    const holeSpots = (type, band) => {
      const out = [], seenShape = new Set();
      for (let r = 0; r < 4; r++) {
        if (seenShape.has(type.keys[r])) continue;
        seenShape.add(type.keys[r]);
        const cells = type.rots[r], bnd = type.rotBounds[r];
        const xs = board.wrap ? board.w : board.w - bnd.w + 1;
        for (let i = 0; i < xs; i++) {
          const x = board.wrap ? i : i - bnd.minX;
          for (const y0 of band) {
            const y = y0 - bnd.minY;
            if (cells.some(([, cy]) => !band.includes(y + cy))) continue;
            if (!board.fits(cells, x, y) || board.fits(cells, x, y - 1)) continue;
            out.push([r, x, y]);
          }
        }
      }
      return out;
    };
    const dfs = (i, band, lines) => {
      if (i === queue.length) return goalMet(puzzle, board, lines);
      const k = i + '|' + board.cells.join('');
      if (seen.has(k)) return false;
      seen.add(k);
      const type = types[i], rot = queue[i].rot || 0;
      let spots;
      if (exact) {
        const holes = holeSpots(type, band);
        if (!holes.length) return false;
        const want = new Set(holes.map(([r, x, y]) => type.rots[r].map(([cx, cy]) => board.wx(x + cx) + ',' + (y + cy)).sort().join(';')));
        spots = restingStates(board, type, rot, opts, (r, x, y) => want.has(type.rots[r].map(([cx, cy]) => board.wx(x + cx) + ',' + (y + cy)).sort().join(';')));
      } else spots = restingStates(board, type, rot, opts);
      for (const [r, x, y] of spots) {
        if (++nodes > limit) { gaveUp = true; return false; }
        const cells = type.rots[r];
        const snap = board.snapshot();
        board.place(cells, x, y, type.color);
        const rows = board.fullRows();
        board.clearRows(rows);
        const nb = band.filter((b) => !rows.includes(b)).map((b) => b - rows.filter((rr) => rr < b).length);
        const ok = dfs(i + 1, nb, lines + rows.length);
        board.restore(snap);
        if (ok) return true;
        if (gaveUp) return false;
      }
      return false;
    };
    const band = [];
    for (let y = puzzle.base; y < puzzle.base + puzzle.goal.lines; y++) band.push(y);
    const found = dfs(0, band, 0);
    return found ? true : gaveUp ? null : false;
  }

  /**
   * Makes a Hold puzzle: the queue is the solution's order with pieces swapped (one pair; two on Hard), kept only
   * when the search proves the puzzle cannot be solved without holding.
   */
  function requireHold(puzzle, rng) {
    const n = puzzle.pieces.length;
    const pairs = [];
    for (let i = 0; i + 1 < n; i++) if (puzzle.pieces[i].id !== puzzle.pieces[i + 1].id) pairs.push(i);
    rng.shuffle(pairs);
    for (const i of pairs.slice(0, 6)) {
      const q = puzzle.pieces.slice();
      [q[i], q[i + 1]] = [q[i + 1], q[i]];
      if (puzzle.diff === 'H') {
        const j = pairs.find((k) => k > i + 1 && q[k].id !== q[k + 1].id);
        if (j != null) [q[j], q[j + 1]] = [q[j + 1], q[j]];
      }
      if (solvableInOrder(puzzle, q, puzzle.goal.type === 'gems' ? 600 : 1500) === false) return q;
    }
    return null;
  }

  // ---- specs ----------------------------------------------------------------------------------------------------------

  function pickMods(rng, diff) {
    const count = diff === 'E' ? (rng.chance(0.45) ? 1 : 0) : diff === 'M' ? (rng.chance(0.35) ? 2 : 1) : (rng.chance(0.4) ? 3 : 2);
    const chosen = [];
    for (let i = 0; i < count; i++) {
      const pool = Object.keys(MODS).filter((id) => MODS[id].w[diff] > 0 && !chosen.includes(id) &&
        !chosen.some((c) => (MODS[c].x || []).includes(id) || (MODS[id].x || []).includes(c)));
      if (!pool.length) break;
      chosen.push(rng.weighted(pool, (id) => MODS[id].w[diff]));
    }
    return chosen;
  }

  function makeSpec(rng, diff, forceMods) {
    const mods = forceMods || pickMods(rng, diff);
    const has = (m) => mods.includes(m);
    const spec = { diff, mods };
    if (has('big')) {
      spec.pieces = diff === 'E' ? 2 : diff === 'M' ? rng.range(2, 3) : rng.range(3, 4);
      spec.w = rng.range(8, 10);
    } else {
      spec.pieces = diff === 'E' ? rng.range(3, 4) : diff === 'M' ? rng.range(4, 6) : rng.range(6, 8);
      spec.w = diff === 'E' ? rng.range(5, 7) : diff === 'M' ? rng.range(6, 8) : rng.range(7, 10);
    }
    // Hold puzzles stay short: the out-of-order queue is the puzzle (and proving hold is needed stays quick).
    if (has('hold') && !has('big')) spec.pieces = Math.min(spec.pieces, diff === 'E' ? 3 : diff === 'M' ? 4 : 5);
    spec.tuck = { E: 0.12, M: 0.45, H: 0.75 }[diff];
    spec.fill = { E: [0.55, 0.75], M: [0.45, 0.65], H: [0.4, 0.6] }[diff];
    const gw = { E: { clear: 5, lines: 3.5, gems: 1.5 }, M: { clear: 3.5, lines: 3.5, gems: 3 }, H: { clear: 4, lines: 3, gems: 3 } }[diff];
    spec.goal = rng.weighted(Object.keys(gw), (g) => gw[g]);
    spec.base = spec.goal === 'clear' ? 0 : rng.range(1, diff === 'E' ? 2 : 3);
    // The piece pool.
    let pool;
    if (has('big')) pool = Pieces.TETROMINOES.map((id) => Pieces.bigOf(id).id).filter((id) => id !== 'BI' || rng.chance(0.4));
    else if (has('odd')) pool = Pieces.PENTOMINOES.concat(['I3', 'V3', 'I3', 'V3']).concat(Pieces.TETROMINOES);
    else pool = Pieces.TETROMINOES.slice();
    spec.pool = pool;
    return spec;
  }

  // ---- construction ---------------------------------------------------------------------------------------------------

  function build(spec, rng) {
    const opts = { noRotate: spec.mods.includes('rigid'), heavy: spec.mods.includes('heavy') };
    const wrap = spec.mods.includes('wrap');
    const W = spec.w;
    // Choose the pieces first: their total size and the fill fraction fix the band's height.
    const types = [];
    for (let i = 0; i < spec.pieces; i++) types.push(Pieces.get(rng.pick(spec.pool)));
    const total = types.reduce((a, t) => a + t.size, 0);
    const f = spec.fill[0] + rng.next() * (spec.fill[1] - spec.fill[0]);
    let K = Math.max(1, Math.round(total / (W * f)));
    K = Math.min(K, total, spec.mods.includes('big') ? 8 : 6);
    const maxN = Math.max(...types.map((t) => t.n));
    const base = spec.base;
    const H = base + K + maxN + 2;
    const board = new Board(W, H, { wrap });
    const G = Pieces.COLOR.GARBAGE;
    // Bedrock: rows under the band with holes, not part of the goal.
    for (let y = 0; y < base; y++) {
      const holes = new Set();
      const nh = rng.range(1, Math.max(1, Math.floor(W / 4)));
      while (holes.size < nh) holes.add(rng.int(W));
      for (let x = 0; x < W; x++) if (!holes.has(x)) board.set(x, y, G);
    }
    const y0 = base, y1 = base + K; // band rows [y0, y1)
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) board.set(x, y, G);

    const steps = []; // in removal order
    const removedPerRow = new Array(K).fill(0);
    for (let i = 0; i < types.length; i++) {
      let step = null;
      // Try the planned type first, then the rest of the pool in random order.
      const tryTypes = [types[i]].concat(rng.shuffle(spec.pool.slice()).map((id) => Pieces.get(id)).filter((t) => t !== types[i]));
      const wantTuck = rng.chance(spec.tuck);
      for (const type of tryTypes.slice(0, 5)) {
        step = removeOne(board, type, y0, y1, removedPerRow, wantTuck, opts, rng);
        if (step) break;
      }
      if (!step) return null;
      steps.push(step);
    }
    // Every band row must be missing something, or it would already be clear.
    if (removedPerRow.some((c) => c === 0)) return null;
    // Something must be on the board to think about.
    const garbage = board.count() - countBase(board, base);
    if (garbage < 2) return null;
    return { board, steps: steps.reverse(), W, H, K, base, opts, wrap };
  }

  function countBase(board, base) {
    let n = 0;
    for (let y = 0; y < base; y++) for (let x = 0; x < board.w; x++) if (board.get(x, y)) n++;
    return n;
  }

  function removeOne(board, type, y0, y1, removedPerRow, wantTuck, opts, rng) {
    const W = board.w;
    const cands = [];
    const seenRot = new Set();
    for (let r = 0; r < 4; r++) {
      if (seenRot.has(type.keys[r])) continue;
      seenRot.add(type.keys[r]);
      const cells = type.rots[r], b = type.rotBounds[r];
      const xs = board.wrap ? W : W - b.w + 1;
      for (let i = 0; i < xs; i++) {
        const x = board.wrap ? i : i - b.minX;
        for (let y = y0 - b.minY; y + b.maxY < y1; y++) {
          let ok = true;
          for (const [cx, cy] of cells) if (!board.get(x + cx, y + cy)) { ok = false; break; }
          if (!ok) continue;
          let fresh = 0, height = 0;
          for (const [cx, cy] of cells) { if (!removedPerRow[y + cy - y0]) fresh++; height += y + cy - y0; }
          cands.push({ r, x, y, fresh, height: height / cells.length });
        }
      }
    }
    if (!cands.length) return null;
    // Evaluate lazily, heaviest first by a random weighted order.
    const scored = cands.map((c) => ({ c, key: Math.pow(rng.next(), 1 / (1 + c.height * 0.6 + c.fresh * 1.5)) }));
    scored.sort((a, b) => b.key - a.key);
    let fallback = null, tries = 0;
    for (const { c } of scored) {
      if (tries > 28) break;
      const cells = type.rots[c.r];
      board.place(cells, c.x, c.y, 0);
      // It must rest where it is (lowering onto it sets it) …
      const rests = !board.fits(cells, c.x, c.y - 1);
      if (!rests) { board.place(cells, c.x, c.y, Pieces.COLOR.GARBAGE); continue; }
      tries++;
      const startRot = opts.noRotate ? c.r : 0;
      const goals = goalStates(type, c.r, c.x, c.y, board);
      const path = reach(board, type, startRot, goals, opts);
      if (path) {
        const straight = straightDrop(board, type, c.r, c.x, c.y);
        const step = { id: type.id, r: c.r, x: board.wx(c.x), y: c.y, rot: startRot, straight };
        if (straight !== wantTuck || tries > 10) {
          for (const [, cy] of cells) removedPerRow[c.y + cy - y0]++;
          return step;
        }
        if (!fallback) fallback = { step, cells };
      }
      board.place(cells, c.x, c.y, Pieces.COLOR.GARBAGE);
    }
    if (fallback) {
      const { step, cells } = fallback;
      board.place(cells, step.x, step.y, 0);
      for (const [, cy] of cells) removedPerRow[step.y + cy - y0]++;
      return step;
    }
    return null;
  }

  /**
   * Plays the solution forwards on the real rules (line clears shift later targets down) and returns the per-step
   * targets as they appear in play, or null if any step cannot be reached or the goal is not met.
   */
  function verify(puzzle) {
    const board = Board.fromArray(puzzle.w, puzzle.h, puzzle.cells, { wrap: puzzle.wrap });
    const opts = { noRotate: puzzle.mods.includes('rigid'), heavy: puzzle.mods.includes('heavy') };
    const cleared = []; // original row indices already cleared
    const targets = [];
    let lines = 0;
    for (const st of puzzle.solution) {
      const type = Pieces.get(st.id);
      const b = type.rotBounds[st.r];
      const shift = cleared.filter((row) => row < st.y + b.minY).length;
      const ty = st.y - shift;
      const goals = goalStates(type, st.r, st.x, ty, board);
      const path = reach(board, type, st.rot, goals, opts);
      if (!path) return null;
      if (!board.fits(type.rots[st.r], st.x, ty) || board.fits(type.rots[st.r], st.x, ty - 1)) return null;
      targets.push({ id: st.id, r: st.r, x: st.x, y: ty, path });
      board.place(type.rots[st.r], st.x, ty, type.color);
      const rows = board.fullRows();
      // Map the rows being cleared now back to original indices (against the rows cleared before this step).
      const sorted = cleared.slice().sort((a, c) => a - c);
      for (const row of rows) {
        let k = 0;
        for (const c of sorted) if (c <= row + k) k++;
        cleared.push(row + k);
      }
      board.clearRows(rows);
      lines += rows.length;
    }
    if (!goalMet(puzzle, board, lines)) return null;
    return targets;
  }

  function goalMet(puzzle, board, lines) {
    if (puzzle.goal.type === 'clear') return board.isEmpty();
    if (puzzle.goal.type === 'lines') return lines >= puzzle.goal.lines;
    if (puzzle.goal.type === 'gems') return board.count((v) => v & CELL.GEM) === 0;
    return false;
  }

  function fallbackSpec(diff) {
    return { diff, mods: [], pieces: 3, w: 6, tuck: 0, fill: [0.6, 0.7], goal: 'clear', base: 0, pool: Pieces.TETROMINOES.slice() };
  }

  /** The puzzle for a seed like "M-3K7Q2XA". Deterministic: the same seed always gives the same puzzle. */
  function generate(seedStr) {
    const parsed = parseSeed(seedStr);
    if (!parsed) return null;
    const { diff, seed } = parsed;
    const rng = new RNG(hash32('lull-puzzle:v' + GEN_VERSION + ':' + seed));
    const title = rng.pick(ADJ) + ' ' + rng.pick(NOUN);
    let spec = makeSpec(rng, diff);
    for (let attempt = 0; attempt < 80; attempt++) {
      // After a run of failures, loosen: keep the wildcards but try a fresh size and queue.
      if (attempt && attempt % 8 === 0) spec = makeSpec(rng, diff, attempt >= 48 ? pickMods(rng, diff) : spec.mods);
      else if (attempt) spec = Object.assign(makeSpec(rng, diff, spec.mods), {});
      const built = build(spec, rng);
      if (!built) continue;
      const puzzle = finish(built, spec, seed, diff, title, rng);
      const targets = verify(puzzle);
      if (!targets) continue;
      if (spec.mods.includes('hold')) {
        const q = requireHold(puzzle, rng);
        if (!q) continue;
        puzzle.pieces = q;
      }
      puzzle.targets = targets; puzzle.attempts = attempt + 1;
      return puzzle;
    }
    for (let attempt = 0; attempt < 200; attempt++) {
      const spec2 = fallbackSpec(diff);
      const built = build(spec2, rng);
      if (!built) continue;
      const puzzle = finish(built, spec2, seed, diff, title, rng);
      const targets = verify(puzzle);
      if (targets) { puzzle.targets = targets; puzzle.fallback = true; return puzzle; }
    }
    return null;
  }

  function finish(built, spec, seed, diff, title, rng) {
    const { board, steps, W, H, K, base, wrap } = built;
    const goal = { type: spec.goal, lines: K };
    if (spec.goal === 'gems') {
      const garbage = [];
      for (let y = base; y < base + K; y++) for (let x = 0; x < W; x++) if (board.get(x, y)) garbage.push([x, y]);
      if (garbage.length) {
        rng.shuffle(garbage);
        const n = Math.min(garbage.length, rng.range(1, diff === 'E' ? 2 : 3));
        for (let i = 0; i < n; i++) board.set(garbage[i][0], garbage[i][1], board.get(garbage[i][0], garbage[i][1]) | CELL.GEM);
        goal.gems = n;
      } else goal.type = 'lines';
    }
    return {
      v: GEN_VERSION, seed, diff, title, w: W, h: H, wrap,
      cells: board.toArray(), mods: spec.mods.slice(), goal, base,
      pieces: steps.map((s) => ({ id: s.id, rot: s.rot })),
      solution: steps.map((s) => ({ id: s.id, r: s.r, x: s.x, y: s.y, rot: s.rot })),
      tucks: steps.filter((s) => !s.straight).length,
    };
  }

  function goalText(p) {
    if (p.goal.type === 'clear') return 'Clear the whole board';
    if (p.goal.type === 'gems') return 'Clear ' + (p.goal.gems === 1 ? 'the gem' : 'all ' + p.goal.gems + ' gems');
    return 'Clear ' + p.goal.lines + ' line' + (p.goal.lines === 1 ? '' : 's');
  }

  L.Puzzles = { DIFFS, MODS, GOALS, generate, verify, reach, goalStates, goalMet, parseSeed, numberedSeed, dailySeed, dailyDateOf, randomSeed, goalText, GEN_VERSION, SEEDS_PER_DIFF, restingStates, solvableInOrder };
})(typeof globalThis !== 'undefined' ? globalThis : this);
