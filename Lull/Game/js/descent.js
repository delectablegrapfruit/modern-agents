// Lull — Descent (a board option: js/recipe.js). A second, upside-down stack hangs from the top of the well and lowers,
// lane by lane (each column is a lane). Your line clears are the weapon: every cell of a cleared row fires one shot up
// its lane at the lowest hanging block, and the piece the cell came from decides the shot. Where a hanging block
// reaches your stack it fuses into the board as stone, and the play space closes in; the board ends as any Relaxed board
// does, when the next piece has no room. A stage has a set depth: break (or fuse) all of it and the stage is cleared;
// Endless never runs out. Time runs on a clock in ticks of a tenth of a second while the board is in play (Free Play's
// controller, js/descentview.js); pieces never fall by themselves. Pure rules, no DOM.
//
//   Lanes      lanes[x] = { bot, iv, next, blocks }: blocks lowest first, blocks[i] at row bot + i (rows at h and above
//              are still out of sight, above the well); iv the lane's ticks between lowerings, next the ticks left to
//              the next one (always shown at the lane's top). A lane with blocks fills its column from its lowest
//              block to the ceiling: a lane running short hangs from a rod (HANG cells with no colour), so nothing ever
//              gets above it.
//   Lowering   the lane moves down a row (a Weight as the lowest block: two rows, and half as often again). Where the
//              row below holds a block of yours or stone (or is the floor), the lowest block fuses there instead, into
//              stone (an Echo leaves a second stone beside it); the piece in play is nudged down a row, and where it
//              cannot be, the lowering waits for it.
//   Shots      per cell of a cleared row, by its piece (the cell's SHOT bits, set when it is placed):
//                I pierce   two hits up its lane            O heavy   2 damage
//                T spread   its lane and both beside it     S, Z push  its lane's stack back up a row
//                L, J angle the lane its foot points to (L right, J left; at a wall its own)
//                stone      nothing                         other shapes: by their shape (shotOf)
//              Clears: one volley a row; a T-spin's volley breaks armour; back-to-back adds 1 to every hit; each clear
//              of a combo holds every lane's next lowering back a second; a perfect clear breaks every lane's lowest
//              block outright.
//   Blocks     glass 1 hit; dense 2; armour only a T-spin volley (or a perfect clear) breaks it; prism, when broken,
//              hits both lanes beside it; drip, as the lowest, lets a single stone fall into its lane every 8 s (shown
//              2 s before); weight lowers its lane two rows at a time; echo leaves two stones when it fuses; lock
//              cannot be hit while the lane it points to hangs lower than it.
//
// Cells: a hanging block FOREIGN | HANG | 14, a rod FOREIGN | HANG (no colour), stone FOREIGN | STONE | 8, your cells
// colour | shot << SHOT_SHIFT. Only own cells pay; a row holding stone is plain (js/engine.js, score); a row holding a
// hanging cell never clears; no item removes a hanging cell.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL, RNG, Pieces } = L;
  const { FOREIGN, HANG, STONE, SHOT, SHOT_SHIFT } = CELL;

  /** Ticks a second. */
  const TPS = 10;
  const IDS = ['easy', 'medium', 'hard'];
  const NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
  const STAGE_COUNT = 12;
  const STAGES_ALL = Array.from({ length: STAGE_COUNT }, (_, i) => i + 1).concat(['endless']);
  const HANG_CELL = FOREIGN | HANG | 14, ROD = FOREIGN | HANG, STONE_CELL = FOREIGN | STONE | 8;

  // ---- shots ---------------------------------------------------------------------------------------------------------

  const SHOTS = ['none', 'plain', 'pierce', 'heavy', 'spread', 'push', 'left', 'right'];
  const SH = Object.fromEntries(SHOTS.map((k, i) => [k, i]));
  const BY_ID = { I: SH.pierce, O: SH.heavy, T: SH.spread, S: SH.push, Z: SH.push, L: SH.right, J: SH.left };
  const shotCache = new Map();
  /**
   * The shot a piece's cells fire. The seven by name (a Big one as its base); any other shape by its form, on its
   * spawn turn: in one line, pierce; holding a 2 × 2 square, heavy; a cell with three neighbours or more (T, X, F, Y),
   * spread; a path with one bend (L, V), angle, toward the side its corner is on; a path with more bends (S, N, W, U),
   * push; anything else (a cluster), plain.
   */
  function shotOf(type) {
    if (!type) return SH.plain;
    if (shotCache.has(type.id)) return shotCache.get(type.id);
    let k = BY_ID[type.id];
    if (k == null && type.big) { const base = Pieces.get(String(type.id).slice(1)); if (base && !base.big) k = shotOf(base); }
    if (k == null) k = shapeShot(type.rots[0]);
    shotCache.set(type.id, k);
    return k;
  }
  function shapeShot(cells) {
    const set = new Set(cells.map(([x, y]) => x + ',' + y));
    const nb = ([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => set.has((x + dx) + ',' + (y + dy)));
    const xs = new Set(cells.map((c) => c[0])), ys = new Set(cells.map((c) => c[1]));
    if (xs.size === 1 || ys.size === 1) return SH.pierce;
    if (cells.some(([x, y]) => set.has((x + 1) + ',' + y) && set.has(x + ',' + (y + 1)) && set.has((x + 1) + ',' + (y + 1)))) return SH.heavy;
    const deg = cells.map(nb);
    if (deg.some((n) => n.length >= 3)) return SH.spread;
    const ends = deg.filter((n) => n.length === 1).length;
    if (ends !== 2 || deg.some((n) => n.length === 0)) return SH.plain;
    // A path: its bends are the cells whose two neighbours are not in line.
    const bends = cells.filter((c, i) => deg[i].length === 2 && deg[i][0][0] !== -deg[i][1][0]);
    if (bends.length === 1) {
      const mx = cells.reduce((a, c) => a + c[0], 0) / cells.length;
      return bends[0][0] >= mx ? SH.right : SH.left;
    }
    return SH.push;
  }
  const shotOfCell = (v) => (v & SHOT) >> SHOT_SHIFT;

  // ---- blocks, levels, stages --------------------------------------------------------------------------------------------

  const KINDS = ['glass', 'dense', 'armour', 'prism', 'drip', 'weight', 'echo', 'lock'];
  const KIND_NAMES = { glass: 'Glass', dense: 'Dense', armour: 'Armoured', prism: 'Prism', drip: 'Drip', weight: 'Weight', echo: 'Echo', lock: 'Lock' };
  const HP = { dense: 2 };
  /** A drip's stone every DRIP seconds, shown DRIP_WARN before; a combo's clear holds the lanes back COMBO seconds; a Weight lane lowers WEIGHT_SLOW times as seldom. */
  const DRIP = 8, DRIP_WARN = 2, COMBO = 1, WEIGHT_SLOW = 1.5;
  /** The rewind: a snapshot every SNAP_EVERY ticks, SNAP_SPAN ticks (5 s) back. */
  const SNAP_EVERY = 2, SNAP_SPAN = 5 * TPS;

  /**
   * The levels: iv, a lane's seconds between lowerings on a Standard board (by stage); uneven, how far one lane's pace
   * strays from it (Hard: ±30%, fixed per stage); start, the share of the well hanging when the board starts; deeper,
   * rows a stage's depth adds; endless, the kinds Endless brings and the rows broken at which each comes in.
   */
  const LEVELS = {
    easy: { iv: 13, uneven: 0, start: 0.25, deeper: 0, endless: { glass: 0, dense: 10, prism: 30 } },
    medium: { iv: 9.5, uneven: 0.12, start: 0.3, deeper: 1, endless: { glass: 0, dense: 0, prism: 8, weight: 16, drip: 24, armour: 36 } },
    hard: { iv: 7.5, uneven: 0.3, start: 0.3, deeper: 2, endless: { glass: 0, dense: 0, prism: 4, weight: 8, armour: 14, drip: 20, echo: 28, lock: 36 } },
  };

  /**
   * The 12 stages: each teaches one block or one clear (its line, for the Ready card), then they mix. kinds: by level,
   * [kind, weight]; depth: rows on Easy (Medium and Hard add their own); pace: the lanes' speed against the level's.
   */
  const G = 'glass';
  const STAGES = [
    { name: 'Glass', line: 'Clear a row: each of its cells fires up its lane.', depth: 5, pace: 1,
      kinds: { easy: [[G, 1]], medium: [[G, 1]], hard: [[G, 1], ['dense', 0.25]] } },
    { name: 'Dense', line: 'Dense blocks take two hits. An O hits for two.', depth: 6, pace: 1,
      kinds: { easy: [[G, 1], ['dense', 0.5]], medium: [[G, 1], ['dense', 0.6]], hard: [[G, 1], ['dense', 0.6], ['prism', 0.2]] } },
    { name: 'Push', line: 'S and Z push their lane back up a row.', depth: 6, pace: 0.85,
      kinds: { easy: [[G, 1]], medium: [[G, 1], ['dense', 0.3]], hard: [[G, 1], ['dense', 0.4]] } },
    { name: 'Prism', line: 'A broken prism also hits both lanes beside it.', depth: 7, pace: 1,
      kinds: { easy: [[G, 1], ['prism', 0.45]], medium: [[G, 1], ['dense', 0.3], ['prism', 0.45]], hard: [[G, 1], ['dense', 0.45], ['prism', 0.45]] } },
    { name: 'Weight', line: 'A weight lowers its lane two rows at a time.', depth: 7, pace: 1,
      kinds: { easy: [[G, 1], ['weight', 0.3]], medium: [[G, 1], ['dense', 0.3], ['weight', 0.3]], hard: [[G, 1], ['dense', 0.4], ['prism', 0.2], ['weight', 0.35]] } },
    { name: 'Armour', line: 'Only a T-spin clear breaks armour.', depth: 6, pace: 1.1,
      kinds: { easy: [[G, 1], ['armour', 0.12]], medium: [[G, 1], ['dense', 0.3], ['armour', 0.15]], hard: [[G, 1], ['dense', 0.4], ['prism', 0.2], ['weight', 0.2], ['armour', 0.18]] } },
    { name: 'Combo', line: 'Clear with piece after piece: each clear holds every lane back a second.', depth: 7, pace: 0.8,
      kinds: { easy: [[G, 1], ['dense', 0.3]], medium: [[G, 1], ['dense', 0.4], ['prism', 0.2]], hard: [[G, 1], ['dense', 0.45], ['prism', 0.2], ['weight', 0.25], ['armour', 0.1]] } },
    { name: 'Drip', line: 'A drip lets a single stone fall into its lane every 8 seconds.', depth: 7, pace: 1,
      kinds: { easy: [[G, 1], ['drip', 0.15]], medium: [[G, 1], ['dense', 0.3], ['drip', 0.18]], hard: [[G, 1], ['dense', 0.4], ['prism', 0.2], ['weight', 0.2], ['armour', 0.1], ['drip', 0.2]] } },
    { name: 'Echo', line: 'An echo that reaches your stack leaves two stones.', depth: 7, pace: 1,
      kinds: { easy: [[G, 1], ['echo', 0.35]], medium: [[G, 1], ['dense', 0.3], ['echo', 0.4]], hard: [[G, 1], ['dense', 0.4], ['prism', 0.2], ['weight', 0.2], ['drip', 0.12], ['echo', 0.4]] } },
    { name: 'Lock', line: 'A lock cannot be hit while the lane it points to hangs lower.', depth: 7, pace: 1,
      kinds: { easy: [[G, 1], ['lock', 0.2]], medium: [[G, 1], ['dense', 0.3], ['lock', 0.25]], hard: [[G, 1], ['dense', 0.4], ['prism', 0.2], ['weight', 0.2], ['armour', 0.1], ['echo', 0.2], ['lock', 0.25]] } },
    { name: 'Back to back', line: 'Tetrises and T-spins back to back hit one harder.', depth: 8, pace: 0.95,
      kinds: { easy: [[G, 1], ['dense', 0.5]], medium: [[G, 1], ['dense', 0.5], ['prism', 0.2], ['armour', 0.12]], hard: [[G, 1], ['dense', 0.5], ['prism', 0.2], ['weight', 0.2], ['armour', 0.15], ['drip', 0.12], ['echo', 0.15], ['lock', 0.12]] } },
    { name: 'The deep', line: 'Every kind of block, and deeper.', depth: 9, pace: 0.9,
      kinds: { easy: [[G, 1], ['prism', 0.35]], medium: [[G, 1], ['dense', 0.45], ['prism', 0.2], ['weight', 0.2], ['drip', 0.12]], hard: [[G, 1], ['dense', 0.5], ['prism', 0.25], ['weight', 0.25], ['armour', 0.15], ['drip', 0.15], ['echo', 0.2], ['lock', 0.15]] } },
  ];

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && (hi == null || v <= hi);
  const ticks = (s) => Math.max(1, Math.round(s * TPS));

  /** Is this recipe a Descent board? */
  const on = (r) => !!r && r.mode === 'descent';
  const stageOk = (s) => s === 'endless' || (Number.isInteger(s) && s >= 1 && s <= STAGE_COUNT);
  /** A stage in words: "Stage 3", "Endless". */
  const stageName = (s) => (s === 'endless' ? 'Endless' : 'Stage ' + s);
  /** Can the board's shapes make a T-spin (they deal the T)? Where not, armour is dense. */
  function hasT(r) {
    const sh = r && r.shapes;
    if (!sh || sh.preset === 'normal' || sh.preset === 'frantic') return true;
    const c = L.Shapes && L.Shapes.compile(sh), f = c && L.Shapes.fixedIds(c);
    return !!(f && f.includes('T'));
  }

  /** A block: { k, hp } (a lock its d: -1 or 1, the lane it points to; a drip its t, ticks to its next stone). */
  function block(k, x, w, rng) {
    const b = { k, hp: HP[k] || 1 };
    if (k === 'lock') b.d = x === 0 ? 1 : x === w - 1 ? -1 : (rng.chance(0.5) ? 1 : -1);
    if (k === 'drip') b.t = ticks(DRIP);
    return b;
  }
  function pickKind(pool, rng) {
    const total = pool.reduce((a, [, wt]) => a + wt, 0);
    let r = rng.next() * total;
    for (const [k, wt] of pool) { r -= wt; if (r < 0) return k; }
    return pool[0][0];
  }
  /** The kinds Endless brings at `rows` broken. */
  function endlessPool(level, rows) {
    const E = LEVELS[level].endless;
    return Object.entries(E).filter(([, at]) => rows >= at).map(([k]) => [k, k === G ? 1 : k === 'dense' ? 0.45 : 0.2]);
  }

  /** A stage's depth in rows at a level. */
  const depthOf = (level, stage) => STAGES[stage - 1].depth + LEVELS[level].deeper;

  /**
   * A new descent for a board w × h: the stage laid out the same way every time (its own stream: the level, the stage
   * and the width), Endless on the board's own stream. Not started.
   */
  function create(level, stage, w, h, seed, o) {
    level = LEVELS[level] ? level : 'easy';
    stage = stageOk(stage) ? stage : 1;
    o = o || {};
    const T = LEVELS[level], endless = stage === 'endless';
    const rng = endless ? new RNG(typeof seed === 'number' && isFinite(seed) ? ((seed ^ 0x2545f491) >>> 0) : String(seed) + ':descent') : new RNG('descent:' + level + ':' + stage + ':' + w);
    const st = endless ? null : STAGES[stage - 1];
    const pace = st ? st.pace : 1;
    // Lanes lower by the Standard board's clock: a narrower board's rows take fewer pieces, so its lanes are no slower.
    const ivBase = T.iv * pace * Math.min(1.4, Math.max(0.6, w / 10)) * Math.max(1, h / 20);
    const start = Math.max(2, Math.round(h * T.start));
    const D = {
      v: 1, level, stage, w, h, tk: 0, started: false, broken: 0, fused: 0, stones: 0, total: 0, items: 0,
      t: o.noT ? 0 : 1, rng: endless ? rng.state() : null, lanes: [],
      st: blankStats(), book: Object.assign(blankStats(), { tk: 0 }),
    };
    for (let x = 0; x < w; x++) {
      const f = 1 + T.uneven * (2 * rng.next() - 1);
      const iv = ticks(ivBase * f);
      D.lanes.push({ bot: h - start, iv, next: Math.max(TPS, Math.round(iv * (0.35 + 0.65 * rng.next()))), blocks: [] });
    }
    if (endless) refill(D);
    else {
      const depth = depthOf(level, stage), pool = st.kinds[level];
      for (let i = 0; i < depth; i++) for (let x = 0; x < w; x++) {
        let k = pickKind(pool, rng);
        // Never two locks side by side, and no armour where the shapes cannot spin a T.
        if (k === 'lock' && i && D.lanes[x - 1] && D.lanes[x - 1].blocks[i] && D.lanes[x - 1].blocks[i].k === 'lock') k = G;
        if (k === 'armour' && !D.t) k = 'dense';
        D.lanes[x].blocks.push(block(k, x, w, rng));
      }
      D.total = depth * w;
    }
    return D;
  }
  const blankStats = () => ({ broken: 0, fused: 0, stones: 0, drips: 0, shots: 0, armour: 0, locks: 0, perfect: 0 });

  /** Endless: every lane keeps at least a well's height of blocks to come, drawn on the descent's stream. */
  function refill(D) {
    if (D.stage !== 'endless') return;
    const rng = RNG.from(D.rng), rows = Math.floor(D.broken / D.w);
    const pool = endlessPool(D.level, rows).map(([k, wt]) => [k === 'armour' && !D.t ? 'dense' : k, wt]);
    for (let x = 0; x < D.w; x++) {
      const lane = D.lanes[x];
      while (lane.blocks.length < D.h + 2) lane.blocks.push(block(pickKind(pool, rng), x, D.w, rng));
    }
    D.rng = rng.state();
  }
  /** Endless quickens: a lane's pace at `rows` broken (a hundredth faster a row, to 0.55 of it). */
  const endlessPace = (rows) => Math.max(0.55, 1 - rows * 0.01);
  /** A lane's ticks until its next lowering, from now. */
  function intervalOf(D, lane) {
    let iv = lane.iv;
    if (D.stage === 'endless') iv = Math.round(iv * endlessPace(Math.floor(D.broken / D.w)));
    if (lane.blocks[0] && lane.blocks[0].k === 'weight') iv = Math.round(iv * WEIGHT_SLOW);
    return Math.max(TPS, iv);
  }

  /** Blocks left in the descent (Endless: Infinity). */
  const left = (D) => (D.stage === 'endless' ? Infinity : D.lanes.reduce((a, l) => a + l.blocks.length, 0));
  /** Rows broken: blocks broken over the lanes. */
  const rowsBroken = (D) => Math.floor(D.broken / D.w);
  /** Rows left to break or fuse (a stage), rounded up. */
  const rowsLeft = (D) => (D.stage === 'endless' ? Infinity : Math.ceil(left(D) / D.w));

  /** A descent as saved: whole and sound for a board w × h. */
  function valid(D, w, h) {
    if (!isObj(D) || D.v !== 1 || !LEVELS[D.level] || !stageOk(D.stage) || D.w !== w || D.h !== h) return false;
    if (!int(D.tk, 0) || !int(D.broken, 0) || !int(D.fused, 0) || !int(D.stones, 0) || !int(D.total, 0) || !isObj(D.st)) return false;
    if (!Array.isArray(D.lanes) || D.lanes.length !== w) return false;
    for (const l of D.lanes) {
      if (!isObj(l) || !int(l.bot, 0, h) || !int(l.iv, 1) || !int(l.next, 0) || !Array.isArray(l.blocks) || l.blocks.length > 4 * h + 64) return false;
      for (const b of l.blocks) if (!isObj(b) || !KINDS.includes(b.k) || !int(b.hp, 1, 2) || (b.k === 'lock' && b.d !== 1 && b.d !== -1) || (b.k === 'drip' && !int(b.t, 0))) return false;
    }
    if (D.stage === 'endless' && (!Array.isArray(D.rng) || D.rng.length !== 4)) return false;
    return true;
  }

  // ---- the board: hanging cells, the clear --------------------------------------------------------------------------------

  const isHang = (v) => !!(v & HANG) && !(v & CELL.WALL);
  const isStone = (v) => !!(v & STONE) && !(v & CELL.WALL);
  /** Writes the descent into the board: each lane's blocks, and the rod above a short one. Old hanging cells go. */
  function sync(D, b) {
    const W = b.w, H = b.h;
    for (let i = 0; i < b.cells.length; i++) if (b.cells[i] & HANG) b.cells[i] = 0;
    for (let x = 0; x < W; x++) {
      const l = D.lanes[x];
      if (!l || !l.blocks.length) continue;
      for (let y = Math.max(0, l.bot); y < H; y++) {
        const i = y - l.bot;
        // (A cell of yours already there, above the lane's top: a lane that went short under it. It stays.)
        if (b.cells[y * W + x] && !(b.cells[y * W + x] & HANG)) continue;
        b.cells[y * W + x] = i < l.blocks.length ? HANG_CELL : ROD;
      }
    }
  }
  /**
   * A clear on a board with hanging cells: they stay where they are, and the rest comes down as on any board (a row
   * holding a hanging cell never clears, so nothing of yours ever passes one). Returns the removed rows.
   */
  function clearOn(b, rows) {
    if (!rows.length) return [];
    const hang = [];
    for (let i = 0; i < b.cells.length; i++) if (b.cells[i] & HANG) { hang.push(i, b.cells[i]); b.cells[i] = 0; }
    const removed = b.clearRows(rows);
    for (let k = 0; k < hang.length; k += 2) if (!b.cells[hang[k]]) b.cells[hang[k]] = hang[k + 1];
    return removed;
  }

  /**
   * Where a piece appears: under the descent, as high as it fits with nothing but hanging cells over it (never in a
   * pocket of the stack), in its own turn, the column nearest the middle first; then the other turns. null: nowhere.
   */
  function spawnSpot(g, b, type, rot0, x0) {
    const W = b.w, H = b.h;
    const turns = type.kicks === 'none' || (g.mods && g.mods.noRotate) ? [rot0] : [rot0, (rot0 + 1) % 4, (rot0 + 3) % 4, (rot0 + 2) % 4];
    // The highest cell of yours (or stone) in each column: a piece must sit wholly above it.
    const top = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) { const v = b.cells[y * W + x]; if (v && !(v & HANG)) { top[x] = y; break; } }
    for (const rot of turns) {
      const cells = type.rots[rot], bnd = type.rotBounds[rot];
      const xs = [];
      for (let d = 0; d <= W; d++) { xs.push(x0 + d); if (d) xs.push(x0 - d); }
      for (const x of xs) {
        if (x + bnd.minX < 0 || x + bnd.maxX >= W) continue;
        for (let y = H - 1 - bnd.maxY; y >= -bnd.minY; y--) {
          if (!b.fits(cells, x, y)) continue;
          if (cells.every(([cx, cy]) => y + cy > top[x + cx])) return { x, y, rot };
          break;
        }
      }
    }
    return null;
  }

  // ---- shots ----------------------------------------------------------------------------------------------------------

  /** Is lane x's lowest block a lock that cannot be hit now (the lane it points to hangs lower)? */
  function locked(D, x) {
    const l = D.lanes[x], b = l && l.blocks[0];
    if (!b || b.k !== 'lock') return false;
    const n = D.lanes[x + b.d];
    return !!n && n.blocks.length > 0 && n.bot < l.bot;
  }

  /** Breaks lane x's lowest block (a prism hits both lanes beside it). */
  function breakLowest(D, x, ev, o) {
    const l = D.lanes[x], b = l.blocks.shift();
    l.bot += 1;
    D.broken++; D.st.broken++;
    if (b.k === 'armour') D.st.armour++;
    if (b.k === 'lock') D.st.locks++;
    ev.broken.push({ x, y: l.bot - 1, k: b.k });
    if (b.k === 'prism') { hit(D, x - 1, 1, ev, o, x); hit(D, x + 1, 1, ev, o, x); }
  }

  /**
   * One hit at lane x's lowest block (dmg damage; o.spin: a T-spin's volley, which breaks armour). Recorded in ev.hits:
   * { x, y (the block's row), r: 'break' | 'crack' | 'armour' | 'locked' | 'none', from }.
   */
  function hit(D, x, dmg, ev, o, from) {
    const l = D.lanes[x];
    if (!l) return;
    const b = l.blocks[0];
    if (!b) { ev.hits.push({ x, y: D.h, r: 'none', from }); return; }
    if (locked(D, x)) { ev.hits.push({ x, y: l.bot, r: 'locked', from }); return; }
    if (b.k === 'armour' && !o.spin) { ev.hits.push({ x, y: l.bot, r: 'armour', from }); return; }
    b.hp -= dmg;
    if (b.hp > 0) { ev.hits.push({ x, y: l.bot, r: 'crack', from }); return; }
    ev.hits.push({ x, y: l.bot, r: 'break', from });
    breakLowest(D, x, ev, o);
  }

  /**
   * The volleys of a clear: rows ([y]) and removed (their cells, as they were), o: { spin, b2b, combo, perfect }.
   * Returns the events, for the view: { shots: [{ x, y, kind }], hits, broken, pushed: [x], delay (ticks), perfect }.
   */
  function fire(D, rows, removed, o) {
    o = o || {};
    const ev = { shots: [], hits: [], broken: [], pushed: [], delay: 0, perfect: false };
    const plus = o.b2b ? 1 : 0, W = D.w;
    removed.forEach((row, i) => {
      const y = rows[i] != null ? rows[i] : 0;
      for (let x = 0; x < W; x++) {
        const v = row[x];
        if (!v || v & FOREIGN) continue;
        let k = shotOfCell(v);
        if (!k) k = SH.plain;
        ev.shots.push({ x, y, kind: SHOTS[k] });
        D.st.shots++;
        const d = 1 + plus;
        if (k === SH.pierce) { hit(D, x, d, ev, o, x); hit(D, x, d, ev, o, x); }
        else if (k === SH.heavy) hit(D, x, d + 1, ev, o, x);
        else if (k === SH.spread) { hit(D, x, d, ev, o, x); hit(D, x - 1, d, ev, o, x); hit(D, x + 1, d, ev, o, x); }
        else if (k === SH.push) {
          const l = D.lanes[x];
          if (l.blocks.length && l.bot < D.h) { l.bot += 1; ev.pushed.push(x); }
        }
        else if (k === SH.left) hit(D, x > 0 ? x - 1 : x, d, ev, o, x);
        else if (k === SH.right) hit(D, x < W - 1 ? x + 1 : x, d, ev, o, x);
        else hit(D, x, d, ev, o, x);
      }
    });
    if (o.combo > 0) { ev.delay = ticks(COMBO); for (const l of D.lanes) if (l.blocks.length) l.next += ev.delay; }
    if (o.perfect) {
      ev.perfect = true; D.st.perfect++;
      for (let x = 0; x < W; x++) if (D.lanes[x].blocks.length) { ev.hits.push({ x, y: D.lanes[x].bot, r: 'break', from: x }); breakLowest(D, x, ev, o); }
    }
    refill(D);
    return ev;
  }

  // ---- the clock -------------------------------------------------------------------------------------------------------

  /**
   * One tick (a tenth of a second of play) on a board b: drips, then each lane whose time has come lowers. o.piece:
   * the piece in play ({ cells(dy) -> [[x, y]] | null, nudge() -> bool }), which a lowering pushes down a row or
   * waits for. Returns { lowered: [{ x, rows }], fused: [{ x, y, k, echo: [x, y] | null }], drips: [{ x, from, to }] }.
   */
  function tick(D, b, o) {
    const ev = { lowered: [], fused: [], drips: [], held: [] };
    const W = b.w, H = b.h;
    D.tk++;
    const pieceAt = () => new Set(((o && o.piece && o.piece.cells()) || []).map(([x, y]) => x + ',' + y));
    let busy = pieceAt();
    const solid = (x, y) => { if (y < 0) return true; const v = b.get(x, y); return !!v && !(v & HANG); };
    const stone = (x, y) => { b.set(x, y, STONE_CELL); D.stones++; D.st.stones++; };
    // Drips: the lowest block of its lane lets a stone fall onto what is below.
    for (let x = 0; x < W; x++) {
      const l = D.lanes[x], d = l.blocks[0];
      if (!d || d.k !== 'drip' || l.bot >= H) continue;
      if (d.t > 0) d.t--;
      if (d.t > 0) continue;
      let land = l.bot - 1;
      while (land > 0 && !solid(x, land - 1)) land--;
      if (land >= l.bot || solid(x, land)) { d.t = ticks(DRIP); continue; }
      let blocked = false;
      for (let y = land; y < l.bot; y++) if (busy.has(x + ',' + y)) blocked = true;
      if (blocked) continue;
      stone(x, land);
      D.st.drips++;
      d.t = ticks(DRIP);
      ev.drips.push({ x, from: l.bot, to: land });
    }
    // Lowering.
    for (let x = 0; x < W; x++) {
      const l = D.lanes[x];
      if (!l.blocks.length) continue;
      if (l.next > 0) l.next--;
      if (l.next > 0) continue;
      const steps = l.blocks[0].k === 'weight' ? 2 : 1;
      let moved = 0, held = false;
      for (let s = 0; s < steps && l.blocks.length; s++) {
        const y = l.bot - 1;
        if (y >= H) { l.bot--; moved++; continue; }
        if (busy.has(x + ',' + y)) {
          if (o && o.piece && o.piece.nudge()) { busy = pieceAt(); }
          else { held = true; break; }
        }
        if (y < 0 || solid(x, y)) {
          // Contact: the lowest block fuses where it is (an echo leaves a second stone beside it).
          const blk = l.blocks.shift();
          l.bot += 1;
          D.fused++; D.st.fused++;
          const at = l.bot - 1, out = { x, y: at, k: blk.k, echo: null };
          if (at < H) {
            stone(x, at);
            if (blk.k === 'echo') {
              for (const nx of [x - 1, x + 1]) {
                if (nx < 0 || nx >= W || b.get(nx, at) || busy.has(nx + ',' + at)) continue;
                stone(nx, at); out.echo = [nx, at]; break;
              }
            }
          }
          ev.fused.push(out);
          break;
        }
        l.bot--; moved++;
      }
      if (held) { ev.held.push(x); if (!moved) continue; }
      if (moved) ev.lowered.push({ x, rows: moved });
      l.next = intervalOf(D, l);
    }
    refill(D);
    sync(D, b);
    return ev;
  }

  /** Whole seconds played, and the time as m:ss. */
  const secs = (D) => Math.floor(D.tk / TPS);
  function clock(D) { const s = secs(D); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  /** The lane that lowers next and in how many ticks ({ x, t }; null with none to come). */
  function nextLowering(D) {
    let best = null;
    D.lanes.forEach((l, x) => { if (l.blocks.length && (!best || l.next < best.t)) best = { x, t: l.next }; });
    return best;
  }

  /** The board's own numbers for its summary (and the library's record). */
  const summaryOf = (D) => (D ? { level: D.level, stage: D.stage, ms: D.tk * (1000 / TPS), rows: rowsBroken(D), broken: D.broken, fused: D.fused, stones: D.stones, depth: D.total ? D.total / D.w : 0, cleared: D.stage !== 'endless' && left(D) === 0 } : null);

  // ---- the engine's extension -------------------------------------------------------------------------------------------

  function extension(game, saved) {
    const r = game.recipe;
    let D;
    if (saved !== undefined && valid(saved, game.w, game.h)) D = clone(saved);
    else D = create(r.descent.level, r.descent.stage, game.w, game.h, game.seed, { noT: !hasT(game.recipe) });
    if (!D.book) D.book = Object.assign(blankStats(), { tk: 0 });
    sync(D, game.board);
    const X = {
      D, snaps: [], pend: null,
      // Under the descent, as high as it fits.
      spawnAt(g, b, pos, type) {
        const at = spawnSpot(g, b, type, pos.rot || 0, pos.x);
        return at || pos;
      },
      // Each cell remembers its piece's shot.
      afterPlace(g, b, abs, v, res) {
        const k = shotOf(Pieces.get(res.type) || (g.piece && g.piece.type));
        for (const [x, y] of abs) { const c = b.get(x, y); if (c && !(c & FOREIGN)) b.set(x, y, (c & ~SHOT) | (k << SHOT_SHIFT)); }
      },
      // A row holding a hanging cell never clears; the hanging cells stay put through a clear.
      rows(g, b, rows) { return rows.filter((y) => { for (let x = 0; x < b.w; x++) if (b.get(x, y) & HANG) return false; return true; }); },
      clearRows(g, b, rows) { return clearOn(b, rows); },
      afterClear(g, b, res) {
        if (b !== g.board || !res.rows || !res.rows.length) return;
        this.pend = { rows: res.rows.slice(), removed: res.removed.map((row) => row.slice()) };
      },
      // After the lock is scored: the volleys, and the stage cleared.
      step(g, res) {
        const p = this.pend;
        this.pend = null;
        if (!p) return;
        res.descent = fire(this.D, p.rows, p.removed, { spin: !!(res.tspin || res.mini), b2b: !!res.b2b, combo: res.combo || 0, perfect: !!res.perfect });
        sync(this.D, g.board);
        if (left(this.D) === 0) g.end('cleared');
      },
      // Settle's clear fires plain volleys.
      afterChange(g, kind, what) {
        const p = this.pend;
        this.pend = null;
        if (!p) return;
        if (what && typeof what === 'object') what.descent = fire(this.D, p.rows, p.removed, {});
        sync(this.D, g.board);
        if (left(this.D) === 0) g.end('cleared');
      },
      keep(g, b, v) { return !!(v & HANG); },
      clean(g, b) { for (let i = 0; i < b.cells.length; i++) if (b.cells[i] && !(b.cells[i] & HANG)) return false; return true; },
      allow(g, id) {
        if (id !== 'settle') return null;
        return this.clean(g, g.board) ? 'Nothing to settle' : null;
      },
      reset(g) {
        this.D = create(r.descent.level, r.descent.stage, g.w, g.h, g.seed, { noT: !hasT(g.recipe) });
        this.snaps = [];
        sync(this.D, g.board);
      },
      save() { return clone(this.D); },
      summary() { return summaryOf(this.D); },

      // ---- Rewind 5 s (Undo's place): the whole game as it was, a snapshot every 0.2 s of play ----
      remember(g) {
        const p = g.piece;
        this.snaps.push({
          tk: this.D.tk, cells: g.board.cells.slice(), D: (() => { const c = clone(Object.assign({}, this.D, { book: null })); return c; })(),
          piece: p ? { entry: Object.assign({}, p.entry, { special: p.special || null }), rot: p.rot, x: p.x, y: p.y } : null,
          hold: g.hold, holdLocked: g.holdLocked, queue: g.queue.map((e) => Object.assign({}, e)), bag: g.bag.slice(), rng: g.rng.state(), s: clone(g.s),
        });
        let drop = 0;
        while (drop + 1 < this.snaps.length && this.snaps[drop + 1].tk <= this.D.tk - SNAP_SPAN) drop++;
        if (drop) this.snaps.splice(0, drop);
      },
      /** The snapshot a rewind goes back to: the newest at least 5 s old, else the oldest; null with none. */
      rewindTarget() {
        if (!this.snaps.length) return null;
        let pick = this.snaps[0];
        for (const s of this.snaps) if (s.tk <= this.D.tk - SNAP_SPAN) pick = s;
        return pick;
      },
      rewind(g) {
        const s = this.rewindTarget();
        if (!s) return null;
        const back = this.D.tk - s.tk, book = this.D.book;
        g.board.cells.set(s.cells);
        this.D = clone(s.D); this.D.book = book;
        g.hold = s.hold; g.holdLocked = s.holdLocked;
        g.queue = s.queue.map((e) => Object.assign({}, e)); g.bag = s.bag.slice(); g.rng = RNG.from(s.rng);
        g.s = clone(s.s);
        g.over = false; g.endKind = null; g.endDue = false;
        this.snaps = this.snaps.filter((o) => o.tk <= s.tk);
        this.pend = null;
        const type = s.piece && Pieces.get(s.piece.entry.id);
        if (type) g.piece = { type, rot: s.piece.rot, x: s.piece.x, y: s.piece.y, special: s.piece.entry.special || null, entry: s.piece.entry, lastRot: false };
        else { g.piece = null; g.spawnNext(); }
        g.emit('undo');
        return { back };
      },
    };
    return X;
  }

  /** The descent of a game (null on a board that is not Descent), and its extension. */
  function extOf(game) { return game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'descent') || null : null; }
  function of(game) { const e = extOf(game); return e ? e.D : null; }

  /**
   * One tick on a game in play (Free Play's clock): the piece in play is nudged down a row, or waited for; a snapshot
   * for the rewind every 0.2 s; the stage cleared once the last block fused. Returns the tick's events (null when the
   * board is over or not Descent).
   */
  function advance(game) {
    const X = extOf(game);
    if (!X || game.over) return null;
    if (X.D.tk % SNAP_EVERY === 0) X.remember(game);
    const piece = {
      cells: () => (game.piece ? game.absCells(game.piece) : null),
      nudge: () => {
        const p = game.piece;
        if (!p || !game.fitsAt(p, p.rot, p.x, p.y - 1)) return false;
        p.y--; p.lastRot = false;
        return true;
      },
    };
    const ev = tick(X.D, game.board, { piece });
    if (left(X.D) === 0) { ev.out = true; game.end('cleared'); }
    return ev;
  }

  // ---- bots (the tests' and the tuning's: scripts/descent-unit.cjs) -----------------------------------------------------------

  /** Column heights (yours and stone), holes, bumps and wells, on a board with hanging cells left out. */
  function shape(b) {
    const W = b.w, H = b.h, hs = new Array(W).fill(0);
    let holes = 0, bump = 0, wells = 0, rowT = 0, colT = 0;
    for (let x = 0; x < W; x++) {
      let top = 0;
      for (let y = H - 1; y >= 0; y--) { const v = b.cells[y * W + x]; if (v && !(v & HANG)) { top = y + 1; break; } }
      hs[x] = top;
      for (let y = 0; y < top; y++) if (!b.cells[y * W + x]) holes++;
    }
    for (let x = 1; x < W; x++) bump += Math.abs(hs[x] - hs[x - 1]);
    for (let x = 0; x < W; x++) { const d = Math.min(x ? hs[x - 1] : 99, x < W - 1 ? hs[x + 1] : 99) - hs[x]; if (d > 0 && d < 90) wells += d * (d + 1) / 2; }
    for (let y = 0; y < H; y++) { let prev = 1; for (let x = 0; x < W; x++) { const v = b.cells[y * W + x]; const f = v && !(v & HANG) ? 1 : 0; if (f !== prev) rowT++; prev = f; } if (!prev) rowT++; }
    for (let x = 0; x < W; x++) { let prev = 1; for (let y = 0; y < hs[x]; y++) { const f = b.cells[y * W + x] ? 1 : 0; if (f !== prev) colT++; prev = f; } }
    return { hs, holes, bump, wells, rowT, colT };
  }

  /** Every spot the piece in play can be set (each turn and column, dropped from under the descent): [{ rot, x, y, abs }]. */
  function spots(g) {
    const p = g.piece, b = g.board, out = [];
    if (!p) return out;
    const X = extOf(g);
    const seen = new Set();
    for (let rot = 0; rot < 4; rot++) {
      const bnd = p.type.rotBounds[rot], key = Pieces.keyOf ? Pieces.keyOf(p.type.rots[rot]) : rot;
      if (seen.has(key)) continue;
      seen.add(key);
      for (let x = -bnd.minX; x <= b.w - 1 - bnd.maxX; x++) {
        // From the highest spot in this column it fits with nothing of yours over it (under the descent).
        let y = null;
        for (let yy = b.h - 1 - bnd.maxY; yy >= -bnd.minY; yy--) {
          if (!g.fitShape(p, rot, x, yy)) { if (y != null) break; continue; }
          if (y == null) {
            const cells = g.absCells(p, rot, x, yy);
            let covered = false;
            for (const [cx, cy] of cells) for (let k = cy + 1; k < b.h && !covered; k++) { const v = b.get(cx, k); if (v && !(v & HANG)) covered = true; }
            if (covered) continue;
          }
          y = yy;
        }
        if (y == null) continue;
        out.push({ rot, x, y, abs: g.absCells(p, rot, x, y) });
        // A T turned into its slot from there (the turn's kicks, as the engine takes them): a T-spin, where three of its box's corners are blocked.
        if (p.type.id === 'T' && !p.special && !(g.mods && g.mods.noRotate)) {
          for (const dir of [1, -1]) {
            const to = (rot + dir + 4) % 4, kicks = Pieces.kicksFor(p.type, rot, to);
            for (let i = 0; i < kicks.length; i++) {
              const nx = x + kicks[i][0], ny = y + kicks[i][1];
              if (!g.fitShape(p, to, nx, ny)) continue;
              if (g.fitShape(p, to, nx, ny - 1)) break;
              let corners = 0;
              for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (b.get(nx + dx, ny + dy) !== 0) corners++;
              if (corners >= 3 && (nx !== x || ny !== y || to !== rot)) out.push({ rot: to, x: nx, y: ny, abs: g.absCells(p, to, nx, ny), spin: true, kick: i, turns: 1 });
              break;
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * A careful player's choice: each spot judged by the board it would leave (El-Tetris weights, with the rows it
   * clears and the room left under the descent counted).
   */
  function judge(g, sp) {
    const t = g.board.clone();
    t.placeCells(sp.abs, g.piece.type.color);
    const rows = g.fullRows(t);
    clearOn(t, rows);
    const s = shape(t), land = sp.abs.reduce((a, c) => a + c[1], 0) / sp.abs.length;
    const D = of(g);
    // Room: how far each lane hangs over the stack (little room is danger).
    let squeeze = 0, armour = 0;
    if (D) D.lanes.forEach((l, x) => {
      if (!l.blocks.length) return;
      const gap = Math.min(l.bot, g.h) - s.hs[x];
      if (gap < 4) squeeze += (4 - gap) * (4 - gap);
      if (l.blocks[0].k === 'armour') armour++;
    });
    // A T-spin that clears is worth a lot where armour hangs lowest.
    const spin = sp.spin && rows.length ? 4 + 6 * armour : 0;
    return -4.5 * land + 3.4 * rows.length + spin - 3.2 * s.rowT - 9.3 * s.colT - 7.9 * s.holes - 3.4 * s.wells - 6 * squeeze;
  }

  /** Sets the piece in play at a spot (turn, column, then down: counted as the moves a player would make). */
  function setAt(g, sp) {
    const p = g.piece, dx = Math.abs(sp.x - p.x), turns = (sp.rot - p.rot + 4) % 4;
    g.s.rotations += (turns === 3 ? 1 : turns) + (sp.turns || 0);
    g.s.moves += dx;
    g.s.drops++;
    p.rot = sp.rot; p.x = sp.x; p.y = sp.y; p.lastRot = !!sp.spin;
    if (sp.spin) p.kick = sp.kick;
    return g.lock();
  }

  /** One piece: careful (the best spot) or careless (any spot, at random on rng). False with nowhere to set it. */
  function play(g, careful, rng) {
    const all = spots(g);
    if (!all.length) return false;
    let pick = all[0];
    if (careful) { let best = -Infinity; for (const sp of all) { const v = judge(g, sp); if (v > best) { best = v; pick = sp; } } }
    else pick = all[rng.int(all.length)];
    return !!setAt(g, pick);
  }

  /**
   * A bot run: a piece every `pace` seconds of play while the clock runs, careful or not, until the board ends or `max`
   * seconds (on a board without a descent: `pieces` pieces). Each lock's pay as Free Play pays it (Pay.clear). Returns
   * { won, over, secs, pieces, paid, perPiece, perAct, rows }.
   */
  function bot(g, o) {
    o = Object.assign({ pace: 2, max: 900, pieces: Infinity, careful: true, seed: 1 }, o || {});
    const rng = new RNG('bot:' + o.seed);
    let paid = 0;
    const Pay = L.Pay;
    g.on('lock', (r) => { if (!r.lines || !Pay) return; g.s.mult = Pay.mult(g); paid += Pay.clear(g.s, r, g.rules).pay; });
    const D = of(g), per = Math.max(1, Math.round(o.pace * TPS));
    let k = 0;
    while (!g.over && g.s.pieces < o.pieces && (!D || of(g).tk < o.max * TPS)) {
      if (k++ % per === 0 || !D) { if (!play(g, o.careful, rng)) break; }
      if (D && !g.over) advance(g);
    }
    const acts = g.s.moves + g.s.rotations + g.s.drops + g.s.lowers + g.s.holds;
    const d = of(g);
    return { won: g.endKind === 'cleared', over: g.over, secs: d ? d.tk / TPS : 0, pieces: g.s.pieces, paid, perPiece: paid / Math.max(1, g.s.pieces), perAct: paid / Math.max(1, acts), rows: d ? rowsBroken(d) : 0 };
  }

  // ---- the recipe part -----------------------------------------------------------------------------------------------------

  const PART = {
    key: 'descent', order: 47, mode: 'descent', name: 'Descent', owns: ['descent'],
    options: { 'descent.level': IDS.slice(), 'descent.stage': STAGES_ALL.slice() },
    // The stage is set when the board is made: an edit never makes a board Descent, or a Descent board another.
    editFixed: true,
    normalize(raw, out) {
      if (out.mode !== 'descent') return;
      const d = isObj(raw.descent) ? raw.descent : {};
      out.descent = { level: IDS.includes(d.level) ? d.level : 'easy', stage: stageOk(d.stage) ? d.stage : 1 };
    },
    label: (r) => (on(r) ? 'Descent ' + NAMES[r.descent.level] + ' · ' + stageName(r.descent.stage) : ''),
    // At least 8 wide, and room under the descent for the set's tallest piece and more.
    limits(r, lim) {
      if (!on(r)) return;
      lim.w[0] = Math.max(lim.w[0], 8);
      lim.h[0] = Math.max(14, Math.min(40, lim.h[0] + 6));
    },
    rules(r, R) {
      if (!on(r)) return;
      // No exact Undo (Rewind 5 s takes its place, js/descentview.js); Best Fit drops from the ceiling, where the descent hangs.
      R.undo = false;
      for (const id of ['tornado', 'trapdoor', 'flip', 'fit']) R.refuse[id] = 'Not in Descent';
    },
    conflicts(r, out) {
      if (on(r)) { out['mods.physics=true'] = 'Not in Descent'; out['mods.mirror=true'] = 'Not in Descent'; }
      if (r.mods && r.mods.physics) out['mode=descent'] = 'Not with Physics';
      else if (r.mods && r.mods.mirror) out['mode=descent'] = 'Not with Mirror';
    },
    valid(g, r) {
      if (!on(r)) return true;
      return valid(isObj(g.x) ? g.x.descent : null, g.w, g.h);
    },
    engine(game, saved) { return on(game.recipe) ? extension(game, saved) : null; },
    controller(play, game) { return game && on(game.recipe) && L.DescentView ? L.DescentView.controller(play, game) : null; },
    summary(x) { return isObj(x) && isObj(x.st) && Number.isInteger(x.tk) && Array.isArray(x.lanes) ? summaryOf(x) : null; },
    stats: { free: { descent: { ms: 0, broken: 0, fused: 0, stones: 0, shots: 0, cleared: 0, topped: 0, stages: { easy: [], medium: [], hard: [] }, endless: { easy: 0, medium: 0, hard: 0 } } }, timeMs: { descent: 0 } },
  };
  Recipe.part(PART);

  // ---- achievements (told by Free Play's controller: event { mode: 'descent', ev (a clear's volleys), kind ('cleared'), D, g }) ----

  if (L.Achievements) {
    const ds = (s) => (s.stats.free.descent || {});
    L.Achievements.group({
      id: 'descent', name: 'Descent', icon: 'descent', after: 'play',
      list: [
        { id: 'ds_first', name: 'Daylight', desc: 'Clear a Descent stage.', pay: 30, on: 'descent', test: (s, e) => e.kind === 'cleared' },
        { id: 'ds_lock', name: 'Unlocked', desc: 'Break a lock.', pay: 40, on: 'descent', test: (s, e) => !!e.ev && e.ev.broken.some((b) => b.k === 'lock') },
        { id: 'ds_armour', name: 'Through the Armour', desc: 'Break an armoured block with a T-spin.', pay: 80, on: 'descent', test: (s, e) => !!e.ev && e.ev.broken.some((b) => b.k === 'armour') && !e.ev.perfect },
        { id: 'ds_perfect', name: 'Clean Sky', desc: 'Make a perfect clear on a Descent board.', pay: 100, on: 'descent', test: (s, e) => !!e.ev && e.ev.perfect },
        { id: 'ds_endless', name: 'Fifty Down', desc: 'Break 50 rows in one Endless board.', pay: 120, on: 'descent', test: (s, e) => !!e.D && e.D.stage === 'endless' && rowsBroken(e.D) >= 50 },
        { id: 'ds_twelve', name: 'All Twelve', desc: 'Clear all 12 stages on one level.', pay: 200, on: 'descent',
          test: (s) => IDS.some((id) => ((ds(s).stages || {})[id] || []).length >= STAGE_COUNT),
          progress: (s) => [Math.max(...IDS.map((id) => ((ds(s).stages || {})[id] || []).length)), STAGE_COUNT] },
        { id: 'ds_deep', name: 'The Deep', desc: 'Clear stage 12 on Hard.', pay: 250, tier: 'legend', on: 'descent', test: (s, e) => e.kind === 'cleared' && !!e.D && e.D.level === 'hard' && e.D.stage === 12 },
      ],
    });
  }

  L.Descent = {
    TPS, IDS, NAMES, STAGES, STAGE_COUNT, STAGES_ALL, LEVELS, KINDS, KIND_NAMES, SHOTS, DRIP, DRIP_WARN, COMBO, WEIGHT_SLOW, SNAP_SPAN, HANG_CELL, ROD, STONE_CELL,
    on, stageOk, stageName, shotOf, shotOfCell, create, valid, sync, clearOn, spawnSpot, locked, hit, fire, tick, advance, refill, intervalOf, depthOf,
    left, rowsBroken, rowsLeft, secs, clock, nextLowering, summaryOf, isHang, isStone, of, extOf, hasT,
    shape, spots, judge, play, bot, PART,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
