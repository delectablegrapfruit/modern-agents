// Lull — procedural puzzles. A puzzle is built backwards from its solution: rows are filled solid, then pieces are
// lifted out of them one by one, each only where it could have been flown in and set. What remains is the garbage;
// the lifted pieces, in reverse, are the queue. Every candidate is then played forwards (line clears and all) and
// kept only if it solves, so every seed has at least one known solution.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Board, CELL, Pieces, RNG, hash32, codeFromInt, intFromCode, spawnPos } = L;

  const GEN_VERSION = 4;
  const GEM_GLANCE = 300, GEM_SEARCH = 2000; // positions the needs-every-piece search tries on a layout: a first look, then a long one
  // Gem puzzles must need every piece (needsEveryPiece). Once one is turned down, generate may go on to GEM_ATTEMPTS
  // attempts; after GEM_BOARDS gem boards or GEM_BUDGET search positions in all, it settles for a lines puzzle.
  const GEM_ATTEMPTS = 160, GEM_BOARDS = 30, GEM_BUDGET = 6000;
  const GEM_TRIES = 3; // gem layouts tried per board
  const GEM_SPARE = { E: 99, M: 4, H: 3 }; // most cells a gem layout may leave a shortcut to spare (see gemLayouts)
  const DIFFS = {
    E: { id: 'E', name: 'Easy', reward: 4, color: '#7bd88f' },
    M: { id: 'M', name: 'Medium', reward: 10, color: '#f6c177' },
    H: { id: 'H', name: 'Hard', reward: 24, color: '#eb6f92' },
  };

  // Wildcards. w = weight per difficulty (0 = never), x = incompatible with.
  const MODS = {
    big:    { name: 'Big Minos', icon: '▣', desc: 'Every piece is twice the size.', w: { E: 1, M: 2, H: 2 }, x: ['odd'] },
    odd:    { name: 'Odd Shapes', icon: '✲', desc: 'Trominoes and pentominoes in the queue.', w: { E: 0.6, M: 2, H: 2 }, x: ['big'] },
    wrap:   { name: 'Wraparound', icon: '⇆', desc: 'The side walls are portals.', w: { E: 0.6, M: 2, H: 2 } },
    rigid:  { name: 'Rigid', icon: '⊘', desc: 'Pieces cannot turn.', w: { E: 1, M: 1.5, H: 1.5 } },
    heavy:  { name: 'Heavy', icon: '⤓', desc: 'Hard drops only.', w: { E: 1.5, M: 1, H: 0.6 } },
    invert: { name: 'Inverted Controls', icon: '⇄', desc: 'Left and right swap. Turns reverse.', w: { E: 0.7, M: 1.5, H: 1.5 } },
    flip:   { name: 'Upside Down', icon: '⇅', desc: 'The board is upside down. Pieces fall up.', w: { E: 1, M: 1.2, H: 1.2 }, x: ['side'] },
    side:   { name: 'Sideways', icon: '↰', desc: 'Gravity pulls to the left.', w: { E: 1, M: 1.2, H: 1.2 }, x: ['flip'] },
    fog:    { name: 'Fog', icon: '≋', desc: 'Blocks are only visible near your piece.', w: { E: 0, M: 1.2, H: 1.5 } },
    vanish: { name: 'Vanishing', icon: '◌', desc: 'Pieces turn invisible once set.', w: { E: 0, M: 0.6, H: 1.5 } },
    blind:  { name: 'Blind Queue', icon: '?', desc: 'No preview.', w: { E: 0, M: 1, H: 1.5 } },
    // Puzzles have no hold slot, except with this wildcard — and then the queue comes out of order, so it is needed.
    hold:   { name: 'Hold', icon: '⇆', desc: 'Pieces arrive out of order. Hold is needed.', w: { E: 0.8, M: 1.3, H: 1.6 } },
    // Only on "S" seeds (Settings ▸ Controls ▸ Counter-clockwise puzzles): turns go both ways, and the puzzle needs it.
    spin:   { name: 'Both Ways', icon: '↺', desc: 'Needs the other turn or a half turn.', w: { E: 0, M: 0, H: 0 }, x: ['rigid'] },
    mono:   { name: 'Monochrome', icon: '◐', desc: 'One colour for everything.', w: { E: 1, M: 1, H: 1 } },
  };

  const GOALS = {
    clear: { name: 'Clear the board', short: 'Perfect clear' },
    lines: { name: 'Clear lines', short: 'Lines' },
    gems:  { name: 'Clear every gem', short: 'Gems' },
  };

  const ADJ = ['Quiet', 'Folded', 'Hidden', 'Crooked', 'Gentle', 'Hollow', 'Twisted', 'Paper', 'Velvet', 'Tidy', 'Narrow', 'Sunken', 'Lazy', 'Clever', 'Sleepy', 'Brass', 'Glass', 'Loose', 'Patient', 'Tiny', 'Stubborn', 'Wobbly', 'Silent', 'Cozy', 'Crumpled', 'Slanted', 'Secret', 'Rusty', 'Mossy', 'Lucky'];
  const NOUN = ['Hinge', 'Staircase', 'Keyhole', 'Pocket', 'Ledge', 'Burrow', 'Drawer', 'Nook', 'Attic', 'Cellar', 'Alcove', 'Ladder', 'Bridge', 'Tunnel', 'Envelope', 'Knot', 'Cradle', 'Lantern', 'Harbor', 'Orchard', 'Pantry', 'Porch', 'Tower', 'Garden', 'Chimney', 'Quarry', 'Hallway', 'Locket', 'Mailbox', 'Teacup'];

  // ---- seeds ----------------------------------------------------------------------------------------------------------

  // An "S" after the difficulty (MS-3K7Q2XA) is the both-ways puzzle for that code: turns the other way count.
  const tag = (diff, spin) => diff + (spin ? 'S' : '');
  function numberedSeed(diff, n, spin) { return tag(diff, spin) + '-' + codeFromInt(hash32('lull:' + diff + ':' + n)); }

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
  function dailySeed(diff, key, spin) { return tag(diff, spin) + '-' + codeFromInt(feistel(dayOf(key) >>> 0, diff)); }
  /** The date whose Daily a seed is (every seed has one; it may be thousands of years away). */
  function dailyDateOf(seed) {
    const p = parseSeed(seed);
    if (!p) return null;
    const day = feistel(intFromCode(p.code), p.diff, true);
    return { day, key: day < 2900000 ? keyOfDay(day) : null, years: Math.floor(day / 365.2425) };
  }
  const SEEDS_PER_DIFF = 4294967296;
  function randomSeed(diff, spin) { return tag(diff, spin) + '-' + codeFromInt((Math.random() * 4294967296) >>> 0); }
  function parseSeed(s) {
    const m = /^\s*([EMH])(S?)\s*[-–·:\s]?\s*([0-9A-Za-z]{7})\s*$/i.exec(String(s || ''));
    if (!m) return null;
    const diff = m[1].toUpperCase(), spin = !!m[2], n = intFromCode(m[3]);
    if (n == null) return null;
    // Seven symbols can spell more than 2^32 numbers; the ones that wrap around read as the seed they wrap to.
    const code = codeFromInt(n);
    return { diff, spin, code, seed: tag(diff, spin) + '-' + code };
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
    const kickTable = [];
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
          // One direction only, unless the puzzle turns both ways: every ordinary puzzle can be solved with a single
          // turn button (Up, or a right-click), so nobody playing with arrows or the mouse alone meets a spin that
          // needs the other direction. That button turns clockwise, or counter-clockwise under Inverted Controls.
          if (!opts.both && m !== (opts.turn < 0 ? 4 : 3)) continue;
          nr = (r + (m === 3 ? 1 : m === 4 ? 3 : 2)) % 4;
          const kicks = kickTable[r * 4 + nr] || (kickTable[r * 4 + nr] = Pieces.kicksFor(type, r, nr));
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

  /**
   * Every spot a piece can come to rest from its spawn (same moves and kicks as reach), one per distinct shape. With
   * opts.engine, every move the engine allows instead: all three turns, each taking the first kick that fits.
   */
  function restingStates(board, type, startRot, opts, accept) {
    opts = opts || {};
    const W = board.w, wrap = board.wrap;
    const norm = (x) => (wrap ? ((x % W) + W) % W : x);
    const start = spawnPos(W, board.h, type, startRot);
    const sx = norm(start.x), sy = start.y;
    if (!board.fits(type.rots[startRot], sx, sy)) return [];
    // Visited states in a flat array (as in reach), with a Set for any state outside its bounds.
    const XO = type.n + 2, YO = type.n + 2, W2 = wrap ? W : W + 2 * XO, H2 = board.h + 2 * YO;
    const flat = new Uint8Array(4 * W2 * H2), far = new Set();
    const visit = (r, x, y) => {
      const xi = wrap ? x : x + XO, yi = y + YO;
      if (xi < 0 || xi >= W2 || yi < 0 || yi >= H2) { const k = r + ',' + x + ',' + y; if (far.has(k)) return false; far.add(k); return true; }
      const k = (r * H2 + yi) * W2 + xi;
      if (flat[k]) return false;
      flat[k] = 1; return true;
    };
    // Whether a spot fits, worked out once each (1 = fits, 2 = does not).
    const fitCache = new Uint8Array(4 * W2 * H2);
    const fits = (r, x, y) => {
      const xi = wrap ? ((x % W) + W) % W : x + XO, yi = y + YO;
      if (xi < 0 || xi >= W2 || yi < 0 || yi >= H2) return board.fits(type.rots[r], x, y);
      const k = (r * H2 + yi) * W2 + xi;
      if (!fitCache[k]) fitCache[k] = board.fits(type.rots[r], x, y) ? 1 : 2;
      return fitCache[k] === 1;
    };
    visit(startRot, sx, sy);
    const qr = [startRot], qx = [sx], qy = [sy];
    const out = new Map();
    const canRotate = !opts.noRotate && type.kicks !== 'none';
    const maxKick = type.kicks === 'i' || type.big ? 2 : 1;
    const kicks = [];
    for (let r = 0; r < 4; r++) kicks.push([Pieces.kicksFor(type, r, (r + 1) % 4), Pieces.kicksFor(type, r, (r + 3) % 4), Pieces.kicksFor(type, r, (r + 2) % 4)]);
    const rest = (r, x, y) => {
      let yy = y;
      while (fits(r, x, yy - 1)) yy--;
      if (accept && !accept(r, x, yy)) return;
      // One per distinct set of cells: the same shape with the same lowest-left corner.
      const b = type.rotBounds[r];
      const k = type.keys[r] + '@' + board.wx(x + b.minX) + ',' + (yy + b.minY);
      if (!out.has(k)) out.set(k, [r, x, yy]);
    };
    const push = (r, x, y) => { x = norm(x); if (visit(r, x, y)) { qr.push(r); qx.push(x); qy.push(y); } };
    for (let head = 0; head < qr.length && head < 6000; head++) {
      const r = qr[head], x = qx[head], y = qy[head];
      const down = fits(r, x, y - 1);
      if (opts.heavy || !down) rest(r, x, y);
      if (fits(r, x - 1, y)) push(r, x - 1, y);
      if (fits(r, x + 1, y)) push(r, x + 1, y);
      if (!opts.heavy && down) push(r, x, y - 1);
      if (!canRotate) continue;
      for (let m = 3; m < 6; m++) {
        if (!opts.both && !opts.engine && m !== (opts.turn < 0 ? 4 : 3)) continue;
        const nr = (r + (m === 3 ? 1 : m === 4 ? 3 : 2)) % 4;
        const ks = kicks[r][m - 3];
        for (let j = 0; j < ks.length; j++) {
          const kx = ks[j][0], ky = ks[j][1];
          if (fits(nr, x + kx, y + ky)) { if (opts.engine || (ky === 0 && Math.abs(kx) <= maxKick)) push(nr, x + kx, y + ky); break; }
        }
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
    const opts = optsOf(puzzle.mods);
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
        // A placement's cells, as the shape and its lowest-left corner.
        const at = (r, x, y) => type.keys[r] + '@' + board.wx(x + type.rotBounds[r].minX) + ',' + (y + type.rotBounds[r].minY);
        const want = new Set(holes.map(([r, x, y]) => at(r, x, y)));
        spots = restingStates(board, type, rot, opts, (r, x, y) => want.has(at(r, x, y)));
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
   * Can a gem puzzle be won with fewer pieces than it has? Play checks the goal after every piece, so this searches
   * every spot each piece can come to rest, for up to pieces − 1 placements, and stops at the first one that leaves no
   * gem. With the Hold wildcard the player may set the held piece instead of the next one (one slot, as in the
   * engine; once the queue runs out the held piece comes into play), so every order a hold slot allows is searched —
   * "fewer pieces" there means fewer placements, whichever piece is left over. Pruned by counting: every empty cell
   * of a row holding a gem must be filled before that gem can go, and the pieces still to come have only so many
   * cells. Returns true, false, or null when it gave up.
   */
  function winsEarly(puzzle, queue, limit, used) {
    // Every move a player has, not only the turns the solution is built from: a shortcut may use any of them.
    const opts = Object.assign(optsOf(puzzle.mods), { engine: true });
    const board = Board.fromArray(puzzle.w, puzzle.h, puzzle.cells, { wrap: puzzle.wrap });
    const hold = puzzle.mods.includes('hold');
    const n = queue.length, W = board.w;
    const types = queue.map((e) => Pieces.get(e.id));
    const seen = new Set();
    let nodes = 0, gaveUp = false;
    const need = () => {
      let sum = 0;
      for (let y = 0; y < board.h; y++) {
        let gem = false, empty = 0;
        for (let x = 0; x < W; x++) { const v = board.cells[y * W + x]; if (!v) empty++; else if (v & CELL.GEM) gem = true; }
        if (gem) sum += empty;
      }
      return sum;
    };
    // The most cells `m` more placements can bring, from the queue's pieces from i on plus the held one.
    const capacity = (i, held, m) => {
      const sizes = types.slice(i).map((t) => t.size);
      if (held >= 0) sizes.push(types[held].size);
      sizes.sort((a, b) => b - a);
      let s = 0;
      for (let k = 0; k < m && k < sizes.length; k++) s += sizes[k];
      return s;
    };
    const dfs = (i, held) => {
      const placed = i - (held >= 0 ? 1 : 0);
      const left = n - 1 - placed;
      if (left <= 0) return false;
      const needed = need();
      if (needed > capacity(i, held, left)) return false;
      const k = i + '|' + (held >= 0 ? queue[held].id + (queue[held].rot || 0) : '') + '|' + board.cells.join('');
      if (seen.has(k)) return false;
      seen.add(k);
      // [piece to set, next queue index, piece held after]
      const moves = [];
      if (i < n) moves.push([i, i + 1, held]);
      if (hold) {
        if (held >= 0) moves.push([held, Math.min(i + 1, n), i < n ? i : -1]);
        else if (i + 1 < n) moves.push([i + 1, i + 2, i]);
      }
      const gemRow = [];
      for (let y = 0; y < board.h; y++) { gemRow[y] = false; for (let x = 0; x < W; x++) if (board.cells[y * W + x] & CELL.GEM) gemRow[y] = true; }
      for (const [pi, ni, nh] of moves) {
        const type = types[pi];
        // Spots that fill the most gem-row holes first: a shortcut, if there is one, turns up sooner.
        const useful = (r, y) => type.rots[r].reduce((a, [, cy]) => a + (gemRow[y + cy] ? 1 : 0), 0);
        // Only spots that leave the rest of the pieces enough cells for the gem rows' holes (the same count as above,
        // made before the spot is tried).
        const capAfter = capacity(ni, nh, left - 1);
        const spots = restingStates(board, type, queue[pi].rot || 0, opts, (r, x, y) => { const rest = needed - useful(r, y); return rest <= 0 || (left > 1 && rest <= capAfter); })
          .sort((p, q) => useful(q[0], q[2]) - useful(p[0], p[2]));
        for (const [r, x, y] of spots) {
          if (++nodes > limit) { gaveUp = true; return false; }
          const snap = board.snapshot();
          board.place(type.rots[r], x, y, type.color);
          board.clearRows(board.fullRows());
          const ok = board.count((v) => v & CELL.GEM) === 0 || dfs(ni, nh);
          board.restore(snap);
          if (ok) return true;
          if (gaveUp) return false;
        }
      }
      return false;
    };
    const found = dfs(0, -1);
    if (used) used.nodes -= Math.min(nodes, limit);
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

  /**
   * The board turn a puzzle's single turn button gives: the arrow that turns (Up, or whichever arrow points away from
   * the floor on a turned view) and right-click turn clockwise, and Inverted Controls reverses both. Upside Down and
   * Sideways are true rotations of the picture, never mirror images, so a clockwise turn looks clockwise there too.
   * Returns the move's name in reach's paths: 'CW' or 'CCW'.
   */
  function primaryTurn(mods) { return mods.includes('invert') ? 'CCW' : 'CW'; }

  function optsOf(mods) {
    return { noRotate: mods.includes('rigid'), heavy: mods.includes('heavy'), both: mods.includes('spin'), turn: primaryTurn(mods) === 'CCW' ? -1 : 1 };
  }

  // ---- specs ----------------------------------------------------------------------------------------------------------

  function pickMods(rng, diff, spin) {
    const count = diff === 'E' ? (rng.chance(0.45) ? 1 : 0) : diff === 'M' ? (rng.chance(0.35) ? 2 : 1) : (rng.chance(0.4) ? 3 : 2);
    const chosen = spin ? ['spin'] : [];
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
    const opts = optsOf(spec.mods);
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
   * targets as they appear in play, or null if any step cannot be reached or the goal is not met. `primaryOnly`
   * allows only the single turn button's direction, even on a both-ways puzzle.
   */
  function verify(puzzle, primaryOnly) {
    const board = Board.fromArray(puzzle.w, puzzle.h, puzzle.cells, { wrap: puzzle.wrap });
    const opts = optsOf(puzzle.mods);
    if (primaryOnly) opts.both = false;
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

  function fallbackSpec(diff, spin) {
    return { diff, mods: spin ? ['spin'] : [], pieces: 3, w: 6, tuck: 0, fill: [0.6, 0.7], goal: 'clear', base: 0, pool: Pieces.TETROMINOES.slice() };
  }

  /** The puzzle for a seed like "M-3K7Q2XA". Deterministic: the same seed always gives the same puzzle. */
  function generate(seedStr) {
    const parsed = parseSeed(seedStr);
    if (!parsed) return null;
    const { diff, seed, spin } = parsed;
    const rng = new RNG(hash32('lull-puzzle:v' + GEN_VERSION + ':' + seed));
    const title = rng.pick(ADJ) + ' ' + rng.pick(NOUN);
    let spec = makeSpec(rng, diff, pickMods(rng, diff, spin));
    let gemsOnly = false;
    const gemBudget = { nodes: GEM_BUDGET, boards: GEM_BOARDS };
    for (let attempt = 0; attempt < (gemsOnly ? GEM_ATTEMPTS : 80); attempt++) {
      // After a run of failures, loosen: keep the wildcards but try a fresh size and queue.
      // (A gem puzzle keeps its wildcards.)
      if (attempt && attempt % 8 === 0) spec = makeSpec(rng, diff, attempt >= 48 && !gemsOnly ? pickMods(rng, diff, spin) : spec.mods);
      else if (attempt) spec = Object.assign(makeSpec(rng, diff, spec.mods), {});
      // Once a gem puzzle was turned down for a shortcut, the next boards stay gem puzzles.
      if (gemsOnly && spec.goal !== 'gems') Object.assign(spec, { goal: 'gems', base: spec.base || 1 });
      const built = build(spec, rng);
      if (!built) continue;
      const puzzle = finish(built, spec, seed, diff, title, rng);
      // (Past the first gem puzzle turned down, a board with no promising gem layout is dropped straight away.)
      if (gemsOnly && puzzle.goal.type === 'gems' && gemBudget.boards > 1 && !(built.layouts = layoutsFor(puzzle, built)).layouts.length) {
        gemBudget.boards--;
        continue;
      }
      const targets = verify(puzzle);
      if (!targets) continue;
      // A both-ways puzzle has to need it: no way through with the single turn button alone (late tries let that go).
      if (spin && attempt < (gemsOnly ? GEM_ATTEMPTS - 16 : 64) && verify(puzzle, true)) continue;
      if (spec.mods.includes('hold')) {
        const q = requireHold(puzzle, rng);
        if (!q) continue;
        puzzle.pieces = q;
      }
      // A gem puzzle has to need every piece; once one is turned down for a shortcut, the next boards stay gem puzzles.
      if (puzzle.goal.type === 'gems' && !needsEveryPiece(puzzle, built, rng, gemBudget)) {
        gemsOnly = true;
        if (--gemBudget.boards > 0 && gemBudget.nodes > 0) continue;
        // Out of time for gems: the board becomes a lines puzzle, which needs every piece by itself (its lines hold
        // exactly the pieces' cells).
        puzzle.cells = puzzle.cells.map((v) => v & ~CELL.GEM);
        puzzle.goal = { type: 'lines', lines: puzzle.goal.lines };
        puzzle.pieces = puzzle.solution.map((st) => ({ id: st.id, rot: st.rot }));
        if (spec.mods.includes('hold')) {
          const q = requireHold(puzzle, rng);
          if (!q) continue;
          puzzle.pieces = q;
        }
      }
      puzzle.targets = targets; puzzle.attempts = attempt + 1;
      return puzzle;
    }
    for (let attempt = 0; attempt < 200; attempt++) {
      const spec2 = fallbackSpec(diff, spin);
      const built = build(spec2, rng);
      if (!built) continue;
      const puzzle = finish(built, spec2, seed, diff, title, rng);
      const targets = verify(puzzle);
      if (targets) { puzzle.targets = targets; puzzle.fallback = true; return puzzle; }
    }
    return null;
  }

  /** The band's garbage cells: where gems can go. */
  function gemSpots(board, base, K) {
    const out = [];
    for (let y = base; y < base + K; y++) for (let x = 0; x < board.w; x++) if (board.get(x, y)) out.push([x, y]);
    return out;
  }

  /**
   * Ways to set the gems, best first: at least n of them, at most `most`, each in its own row. One sits in a row the
   * solution's last piece completes, so the known solution only takes every gem with its last piece. A gem's row cannot
   * go until each of its holes is filled, so a shortcut (one piece fewer) has only the cells the gem rows leave over
   * to spare; layouts that leave more than `spare` are dropped — there a shortcut is nearly always possible, and proving
   * otherwise is slow. The fewest gems come first, then the least to spare.
   */
  function gemLayouts(board, spots, n, most, spare, steps) {
    const last = steps[steps.length - 1];
    const lastRows = Pieces.get(last.id).rots[last.r].map(([, cy]) => last.y + cy);
    const sizes = steps.map((st) => Pieces.get(st.id).size);
    const cap = sizes.reduce((a, b) => a + b, 0) - Math.min(...sizes); // the most cells one piece fewer can bring
    const rows = [];
    for (const [, y] of spots) if (!rows.includes(y)) rows.push(y);
    const holes = {};
    for (const y of rows) { holes[y] = 0; for (let x = 0; x < board.w; x++) if (!board.get(x, y)) holes[y]++; }
    const found = [];
    const pick = (from, k, acc) => {
      if (!k) { found.push(acc); return; }
      for (let i = 0; i < from.length; i++) pick(from.slice(i + 1), k - 1, acc.concat([from[i]]));
    };
    for (let g = Math.min(n, rows.length); g <= Math.min(most, rows.length); g++) {
      for (const f of rows.filter((y) => lastRows.includes(y))) pick(rows.filter((y) => y !== f), g - 1, [f]);
    }
    return found
      .map((set, i) => ({ set, i, left: cap - set.reduce((a, y) => a + holes[y], 0) }))
      .filter((o) => o.left <= spare)
      .sort((a, b) => a.set.length - b.set.length || a.left - b.left || a.i - b.i)
      .map((o) => o.set.map((y) => spots.find(([, sy]) => sy === y)));
  }

  /** The gem layouts worth a search on this board (see gemLayouts), and the board without gems. */
  function layoutsFor(puzzle, built) {
    const clean = Board.fromArray(puzzle.w, puzzle.h, puzzle.cells.map((v) => v & ~CELL.GEM), { wrap: puzzle.wrap });
    const { spots, n } = built.gems;
    // Big Minos puzzles have only a few pieces: the search is quick whatever they spare.
    const spare = puzzle.mods.includes('big') ? Infinity : GEM_SPARE[puzzle.diff];
    return { clean, layouts: gemLayouts(clean, spots, n, puzzle.diff === 'E' ? 2 : 3, spare, built.steps) };
  }

  /**
   * Gives a gem puzzle gems that need every piece: no way to the last gem with fewer (with Hold, in any order the hold
   * slot allows). The best few layouts are tried; a search that gives up counts as a way through — only a proof keeps
   * a layout. Returns false when none is proven.
   */
  function needsEveryPiece(puzzle, built, rng, budget) {
    const { clean, layouts } = built.layouts || layoutsFor(puzzle, built);
    const order = puzzle.solution.map((s) => ({ id: s.id, rot: s.rot }));
    const use = (c) => { puzzle.cells = c.cells; puzzle.goal.gems = c.gems; puzzle.pieces = c.pieces; };
    // A quick look at each layout first (most are settled in a few hundred positions either way), then a longer one
    // at the first that was left open.
    const open = [];
    for (const layout of layouts.slice(0, GEM_TRIES)) {
      const board = clean.clone();
      setGems(board, layout);
      const c = { cells: board.toArray(), gems: layout.length, pieces: order };
      use(c);
      if (puzzle.mods.includes('hold')) {
        const q = requireHold(puzzle, rng);
        if (!q) continue;
        c.pieces = puzzle.pieces = q;
      }
      if (budget.nodes <= 0) return false;
      const r = winsEarly(puzzle, puzzle.pieces, Math.min(GEM_GLANCE, budget.nodes), budget);
      if (r === false) return true;
      if (r === null) open.push(c);
    }
    if (open.length && budget.nodes > 0) {
      use(open[0]);
      if (winsEarly(puzzle, puzzle.pieces, Math.min(GEM_SEARCH, budget.nodes), budget) === false) return true;
    }
    return false;
  }

  function setGems(board, layout) {
    for (let x = 0; x < board.w; x++) for (let y = 0; y < board.h; y++) if (board.get(x, y) & CELL.GEM) board.set(x, y, board.get(x, y) & ~CELL.GEM);
    for (const [x, y] of layout) board.set(x, y, board.get(x, y) | CELL.GEM);
  }

  function finish(built, spec, seed, diff, title, rng) {
    const { board, steps, W, H, K, base, wrap } = built;
    const goal = { type: spec.goal, lines: K };
    if (spec.goal === 'gems') {
      const garbage = gemSpots(board, base, K);
      if (garbage.length) {
        rng.shuffle(garbage);
        const n = Math.min(garbage.length, rng.range(1, diff === 'E' ? 2 : 3));
        // The gems' first spots, as generate has always drawn them: every step up to the gem check sees the same board
        // it always did, so any seed that does not end as a gem puzzle stays exactly as it was. The check
        // (needsEveryPiece) then moves them.
        for (let i = 0; i < n; i++) board.set(garbage[i][0], garbage[i][1], board.get(garbage[i][0], garbage[i][1]) | CELL.GEM);
        goal.gems = n;
        built.gems = { spots: garbage, n };
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

  L.Puzzles = { DIFFS, MODS, GOALS, generate, verify, reach, goalStates, goalMet, parseSeed, numberedSeed, dailySeed, dailyDateOf, randomSeed, goalText, GEN_VERSION, SEEDS_PER_DIFF, restingStates, solvableInOrder, winsEarly, primaryTurn };
})(typeof globalThis !== 'undefined' ? globalThis : this);
