// Lull — the floating-piece game: pieces never fall on their own. They move, turn, lower one row at a time,
// and set when lowered onto something or hard-dropped. Shared by Free Play and Puzzle mode.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Board, CELL, Pieces, RNG, Emitter } = L;

  const CLEAR_SCORE = [0, 100, 300, 500, 800, 1200, 1600, 2000];
  const TSPIN_SCORE = [400, 800, 1200, 1600];
  const MINI_SCORE = [100, 200, 400];
  // The two corners on the side the T points to, per rotation (box coordinates, y up).
  const T_FRONT = [[[0, 2], [2, 2]], [[2, 0], [2, 2]], [[0, 0], [2, 0]], [[0, 0], [0, 2]]];
  const BOMB_PATTERN = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2 || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1)) BOMB_PATTERN.push([dx, dy]);

  /** Where a piece appears: centred, its rotation box touching the ceiling. */
  function spawnPos(w, h, type, rot) {
    const b = type.rotBounds[rot];
    const x = Math.floor((w - b.w) / 2) - b.minX;
    let y = h - type.n;
    if (y + b.minY < 0 || y + b.maxY >= h) y = h - 1 - b.maxY;
    return { x, y };
  }

  // Specials that turn the piece into a single block (a bomb, a drill bit, a black hole, a stick of TNT, a torch, a
  // bolt of lightning), and those that keep its shape and change what it does or what it is made of.
  const SINGLE = new Set(['bomb', 'drill', 'blackhole', 'tnt', 'torch', 'bolt']);
  const SHAPED = new Set(['phase', 'sand', 'anvil', 'magnet', 'laser', 'golden', 'frost', 'water', 'oil', 'steel']);

  /**
   * A board's numbers. The h- ones count only what was done by hand (for achievements): hand is whether the stack was
   * built without an item that touches the pieces or the board since it was last empty; hb2b, hcombo, hquads and
   * hchain are the back-to-back streak, combo, quads in a row and chain, broken by any such item (Rewind too) and
   * never fed by an item's clear; htspins counts T-spins that clear lines, htst T-spin triples and hperfect perfect
   * clears, all by hand; pace keeps [time, lines] for the last 101 pieces set by hand in a row (Game.notePace).
   */
  function freshStats() {
    return { pieces: 0, lines: 0, score: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, combo: -1, maxCombo: 0, b2b: -1, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {}, startedAt: Date.now(), playMs: 0, items: {}, banked: 0, chain: 0, bestChain: 0, tst: 0, quadRun: 0,
      hand: true, hb2b: -1, hcombo: -1, hquads: 0, hchain: 0, bestHChain: 0, htspins: 0, htst: 0, hperfect: 0, goldRun: 0, pace: [] };
  }
  const HAND_KEYS = ['hand', 'hb2b', 'hcombo', 'hquads', 'hchain', 'goldRun', 'pace', 'clean', 'cleanLines'];

  /**
   * A board saved before the hand counts existed: if no item was ever used on it, everything on it was by hand (its
   * streaks carry over); otherwise it starts again from its next perfect clear. T-spins that cleared lines were not
   * told apart, so that count starts at zero.
   */
  function migrateHand(s, saved) {
    if (!saved || saved.hand !== undefined) return s;
    const clean = !Object.values(saved.items || {}).some((n) => n > 0);
    if (clean) Object.assign(s, { hand: true, hb2b: s.b2b, hcombo: s.combo, hquads: s.quadRun || 0, htst: s.tst || 0, hperfect: s.perfect || 0 });
    else s.hand = false;
    s.hchain = (s.hb2b >= 0 ? s.hb2b + 1 : 0) + Math.max(0, s.hcombo);
    s.bestHChain = s.hchain;
    return s;
  }

  class Game extends Emitter {
    /**
     * o: { w, h, wrap, mode, mods: {noRotate, heavy, noHold, vanish}, queue: [{id, rot}] (fixed list: puzzles),
     *      seed, previewCount, board (Board), saved (from toJSON), freeHold (hold swaps back and forth as often as
     *      you like; Classic turns it off: once per piece) }
     */
    constructor(o) {
      super();
      o = o || {};
      this.mode = o.mode || 'free';
      this.mods = Object.assign({ noRotate: false, heavy: false, noHold: false, vanish: false }, o.mods || {});
      this.previewCount = o.previewCount == null ? 5 : o.previewCount;
      this.maxHistory = o.maxHistory == null ? 30 : o.maxHistory;
      this.freeHold = o.freeHold !== false;
      // Relaxed play: a piece (spawned, held or swapped in by an item) that does not fit where it would appear is
      // fitted into the nearest open spot above the stack instead; only when there is none is the board full.
      // Classic (block out at the spawn spot) and puzzles (a fixed queue) keep the plain spawn.
      this.findRoom = o.findRoom != null ? !!o.findRoom : (this.freeHold && !o.queue && !(o.saved && o.saved.fixed));
      this.history = [];
      this.over = false;
      const sv = o.saved;
      if (sv) {
        this.board = Board.fromArray(sv.w, sv.h, sv.cells, { wrap: sv.wrap });
        this.fixed = !!sv.fixed;
        this.queue = sv.queue.map((e) => Object.assign({}, e));
        this.bag = sv.bag.slice();
        this.rng = RNG.from(sv.rng);
        this.hold = sv.hold;
        this.holdLocked = sv.holdLocked;
        this.s = migrateHand(Object.assign(freshStats(), sv.s), sv.s);
        this.piece = null;
        if (sv.piece) {
          const type = Pieces.get(sv.piece.entry.id);
          if (type) this.piece = { type, rot: sv.piece.rot, x: sv.piece.x, y: sv.piece.y, special: sv.piece.entry.special || null, entry: sv.piece.entry, lastRot: false };
        }
        this.fillQueue();
        if (!this.piece) this.spawnNext();
        // Saved with the board full: the piece has nowhere to be.
        else if (!this.fitsAt(this.piece, this.piece.rot, this.piece.x, this.piece.y)) this.over = true;
        return;
      }
      this.board = o.board ? o.board.clone() : new Board(o.w || 10, o.h || 20, { wrap: o.wrap });
      this.fixed = !!o.queue;
      this.queue = o.queue ? o.queue.map((e) => Object.assign({ rot: 0 }, e)) : [];
      this.bag = [];
      this.rng = new RNG(o.seed == null ? (Date.now() ^ (Math.random() * 4294967296)) >>> 0 : o.seed);
      this.hold = null;
      this.holdLocked = false;
      this.piece = null;
      this.s = freshStats();
      this.fillQueue();
      this.spawnNext();
    }

    get w() { return this.board.w; }
    get h() { return this.board.h; }

    // ---- queue --------------------------------------------------------------------------------------------------------

    fillQueue() {
      if (this.fixed) return;
      while (this.queue.length < Math.max(6, this.previewCount + 1)) {
        if (!this.bag.length) this.bag = this.rng.shuffle(Pieces.TETROMINOES.slice());
        this.queue.push({ id: this.bag.shift(), rot: 0 });
      }
    }

    /** o: { soft (a failed spawn changes nothing and is not a top-out: hold swaps), from (cells of the piece in play) } */
    spawnNext(o) {
      let entry = this.queue.shift();
      this.fillQueue();
      // A fixed queue that has run out still has the held piece to give.
      if (!entry && this.hold) { entry = this.hold; this.hold = null; this.holdLocked = true; }
      if (!entry) {
        this.piece = null;
        this.emit('empty');
        return false;
      }
      return this.spawn(entry, o);
    }

    spawnPosition(type, rot) { return spawnPos(this.w, this.h, type, rot); }

    spawn(entry, o) {
      o = o || {};
      const type = Pieces.get(entry.id);
      const rot = entry.rot || 0;
      const pos = this.spawnPosition(type, rot);
      const piece = { type, rot, x: pos.x, y: pos.y, special: entry.special || null, entry, lastRot: false };
      const place = (x, y, r) => {
        piece.x = this.board.wx(x); piece.y = y; piece.rot = r;
        this.piece = piece;
        this.emit('spawn', piece);
        return true;
      };
      // Near the spawn spot, but never down inside the stack: a spot below it counts only if the piece could get
      // there (sliding and lowering through open cells from the ceiling or the spawn spot).
      const seeds = this.fitsAt(piece, rot, pos.x, pos.y) ? [[pos.x, pos.y]] : [];
      const open = this.findRoom ? null : new Set(this.reach(piece, rot, seeds, o.from).map(([x, y]) => x + ',' + y));
      const tries = this.findRoom ? [[0, 0]] : [[0, 0], [0, -1], [-1, 0], [1, 0], [0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -3], [-2, -1], [2, -1], [0, -4]];
      for (const [dx, dy] of tries) {
        const x = this.board.wx(pos.x + dx), y = pos.y + dy;
        if (this.fitsAt(piece, rot, x, y) && (!open || open.has(x + ',' + y))) return place(x, y, rot);
      }
      if (this.findRoom) {
        const b = type.rotBounds[rot];
        const at = this.room(piece, rot, pos.x + b.minX + b.w / 2, pos.y + b.minY + b.h / 2, o.from);
        if (at) return place(at.x, at.y, at.rot);
      }
      if (o.soft) return false;
      this.piece = piece;
      this.over = true;
      this.emit('topout');
      return false;
    }

    /**
     * Every spot one turn of a piece could get to: from the ceiling (its top row in the board's top row), from the
     * given seed spots, or from anywhere it would overlap the cells in `from` (where the piece in play is now),
     * moving sideways and down through open cells — never up, so never into a pocket under blocks. Returns [[x, y]].
     */
    reach(p, rot, seeds, from) {
      const b = this.board, bnd = p.type.rotBounds[rot], cells = p.type.rots[rot];
      const x0 = b.wrap ? 0 : -bnd.minX, x1 = b.wrap ? this.w - 1 : this.w - 1 - bnd.maxX;
      const y0 = -bnd.minY, y1 = this.h - 1 - bnd.maxY;
      const seen = new Set(), out = [];
      const visit = (x, y) => {
        x = b.wx(x);
        if (x < x0 || x > x1 || y < y0 || y > y1) return;
        const k = x + ',' + y;
        if (seen.has(k)) return;
        seen.add(k);
        if (this.fitsAt(p, rot, x, y)) out.push([x, y]);
      };
      for (let x = x0; x <= x1; x++) visit(x, y1);
      for (const [x, y] of seeds || []) visit(x, y);
      if (from && from.length) {
        const was = new Set(from.map(([x, y]) => b.wx(x) + ',' + y));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (cells.some(([cx, cy]) => was.has(b.wx(x + cx) + ',' + (y + cy)))) visit(x, y);
        }
      }
      for (let i = 0; i < out.length; i++) {
        const [x, y] = out[i];
        visit(x - 1, y); visit(x + 1, y); visit(x, y - 1);
      }
      return out;
    }

    /**
     * The open spot nearest a point (the box centre the piece should keep) that a piece could get to (see reach), in
     * its own turn first, then the others. Ties go to the higher spot, then the nearer column. Returns
     * { x, y, rot } or null: nowhere above the stack has room for it.
     */
    room(p, rot, cx, cy, from) {
      const turns = this.mods.noRotate || p.type.kicks === 'none' ? [rot] : [rot, (rot + 1) % 4, (rot + 3) % 4, (rot + 2) % 4];
      for (const r of turns) {
        const bnd = p.type.rotBounds[r];
        const tx = Math.round(cx - bnd.w / 2 - bnd.minX), ty = Math.round(cy - bnd.h / 2 - bnd.minY);
        let best = null, bestCost = Infinity;
        for (const [x, y] of this.reach(p, r, [], from)) {
          let dx = Math.abs(x - tx);
          if (this.board.wrap) dx = Math.min(dx % this.w, this.w - (dx % this.w));
          const dy = y - ty;
          // Distance first; then prefer up over down, then the nearer column.
          const cost = (dx * dx + dy * dy) * 1000 + (dy < 0 ? 100 : 0) - dy + dx * 0.01;
          if (cost < bestCost) { bestCost = cost; best = { x, y, rot: r }; }
        }
        if (best) return best;
      }
      return null;
    }

    // ---- movement -----------------------------------------------------------------------------------------------------

    passes(p) { return p.special === 'phase' || p.special === 'drill' || p.special === 'anvil'; }

    /** Steel (a sandbox material): blasts, fire, drills, anvils and purges leave it be. */
    tough(v) { return (v & CELL.MAT) === CELL.STEEL; }

    fitsAt(p, rot, x, y) {
      const cells = p.type.rots[rot];
      if (!this.passes(p)) return this.board.fits(cells, x, y);
      if (!this.board.inBounds(cells, x, y)) return false;
      // An anvil falls through everything but steel, and comes to rest on it.
      if (p.special === 'anvil') for (const [cx, cy] of cells) if (this.tough(this.board.get(x + cx, y + cy))) return false;
      return true;
    }

    cellsOf(p, rot, x, y) {
      p = p || this.piece;
      if (!p) return [];
      rot = rot == null ? p.rot : rot; x = x == null ? p.x : x; y = y == null ? p.y : y;
      return p.type.rots[rot].map(([cx, cy]) => [this.board.wx(x + cx), y + cy]);
    }

    move(dx) {
      const p = this.piece;
      if (!p || this.over) return false;
      if (!this.fitsAt(p, p.rot, p.x + dx, p.y)) { this.emit('blocked', 'move'); return false; }
      p.x = this.board.wx(p.x + dx);
      p.lastRot = false;
      this.s.moves++;
      this.emit('move');
      return true;
    }

    /** Lowers one row; lowered onto something, the piece sets. Returns 'moved', a lock result, or false. */
    lower() {
      const p = this.piece;
      if (!p || this.over) return false;
      if (this.mods.heavy) return this.drop();
      if (this.fitsAt(p, p.rot, p.x, p.y - 1)) {
        p.y--;
        p.lastRot = false;
        this.s.lowers++;
        this.emit('move');
        return 'moved';
      }
      if (p.special === 'drill') return this.drop();
      return this.lock();
    }

    rotate(dir) {
      const p = this.piece;
      if (!p || this.over || this.mods.noRotate || p.type.kicks === 'none') return false;
      const from = p.rot, to = (p.rot + dir + 4) % 4;
      const kicks = Pieces.kicksFor(p.type, from, to);
      for (let i = 0; i <= kicks.length; i++) {
        // Past the end of the table, one last try: a nudge off the wall, ceiling or stack (odd shapes only).
        const k = i < kicks.length ? kicks[i] : this.nudge(p, to);
        if (!k) break;
        const [kx, ky] = k;
        if (this.fitsAt(p, to, p.x + kx, p.y + ky)) {
          p.rot = to;
          p.x = this.board.wx(p.x + kx);
          p.y += ky;
          p.lastRot = true;
          p.kick = i;
          this.s.rotations++;
          this.emit('rotate');
          return true;
        }
      }
      this.emit('blocked', 'rotate');
      return false;
    }

    /**
     * The turn no kick could fit, nudged just enough: a long or big shape (a Noodle is six tall on end, a Giant up to
     * eight) that would poke out past the ceiling, floor or a wall slides back in by exactly the overflow, as long as
     * the way back in is clear; one that would dip into the stack is lifted onto it, or slid off a block beside it,
     * by the fewest rows or columns that fit, as long as it still covers a cell it covered before (so it stands up
     * where it was and never hops out of a well or through a wall of blocks). Returns [dx, dy] or null.
     * Only for shapes beyond the seven (whose SRS kicks stay exactly SRS), and never in puzzles: a fixed queue keeps
     * exactly the turns its generator searched.
     */
    nudge(p, to) {
      if (this.fixed || (p.type.kicks !== 'generic' && p.type.kicks !== 'big')) return null;
      const b = this.board, cells = p.type.rots[to], bnd = p.type.rotBounds[to], ghost = this.passes(p);
      let ox = 0, oy = 0;
      if (!b.wrap) {
        if (p.x + bnd.minX < 0) ox = -(p.x + bnd.minX);
        else if (p.x + bnd.maxX >= this.w) ox = this.w - 1 - (p.x + bnd.maxX);
      }
      if (p.y + bnd.minY < 0) oy = -(p.y + bnd.minY);
      else if (p.y + bnd.maxY >= this.h) oy = this.h - 1 - (p.y + bnd.maxY);
      // Sliding back in from outside, every step of the way must be clear (cells still outside do not count).
      const steps = Math.max(Math.abs(ox), Math.abs(oy));
      let clear = steps > 0;
      for (let t = 0; clear && t <= steps && !ghost; t++) {
        const sx = Math.sign(ox) * Math.min(t, Math.abs(ox)), sy = Math.sign(oy) * Math.min(t, Math.abs(oy));
        for (const [cx, cy] of cells) if (b.inside(p.x + sx + cx, p.y + sy + cy) && b.filled(p.x + sx + cx, p.y + sy + cy)) clear = false;
      }
      if (clear && this.fitsAt(p, to, p.x + ox, p.y + oy)) return [ox, oy];
      // Blocked by the stack: lift it, or slide it sideways, by the least that fits.
      const was = new Set(this.cellsOf(p).map((c) => c.join(',')));
      const covers = (dx, dy) => cells.some(([cx, cy]) => was.has(b.wx(p.x + dx + cx) + ',' + (p.y + dy + cy)));
      for (let k = 1; k < p.type.n; k++) {
        for (const [dx, dy] of [[ox - k, oy], [ox + k, oy], [ox, oy + k]]) {
          if (this.fitsAt(p, to, p.x + dx, p.y + dy) && covers(dx, dy)) return [dx, dy];
        }
      }
      return null;
    }

    /** Steps sideways toward a column (mouse play). */
    moveToward(targetX) {
      const p = this.piece;
      if (!p) return false;
      // The piece's middle column: the average of its cells' columns (so a T pointing left is centred on its stem,
      // not its nub), rounding halves down.
      const cells = p.type.rots[p.rot];
      const cur = p.x + Math.round(cells.reduce((a, [cx]) => a + cx, 0) / cells.length - 0.01);
      let dx = targetX - cur;
      if (this.board.wrap) {
        dx = ((dx % this.w) + this.w) % this.w;
        if (dx > this.w / 2) dx -= this.w;
      }
      if (!dx) return false;
      return this.move(Math.sign(dx));
    }

    ghostY(p) {
      p = p || this.piece;
      if (!p) return null;
      if (p.special === 'drill') return null;
      if (p.special === 'phase') return this.phaseTarget(p);
      let y = p.y;
      // An anvil goes straight to the floor, through everything but steel.
      if (p.special === 'anvil') { while (this.fitsAt(p, p.rot, p.x, y - 1)) y--; return y; }
      while (this.board.fits(p.type.rots[p.rot], p.x, y - 1)) y--;
      return y;
    }

    /** A phasing piece drops into the first gap below it where it would rest. */
    phaseTarget(p) {
      const cells = p.type.rots[p.rot];
      for (let y = p.y; y + p.type.rotBounds[p.rot].minY >= 0; y--) {
        if (this.board.fits(cells, p.x, y) && !this.board.fits(cells, p.x, y - 1)) return y;
      }
      return null;
    }

    drop() {
      const p = this.piece;
      if (!p || this.over) return false;
      if (p.special === 'drill') return this.bore();
      const y = this.ghostY(p);
      if (y == null) { this.emit('blocked', 'drop'); return false; }
      this.pendingDrop = { dist: p.y - y, cells: this.cellsOf(p) };
      // Falling is a move: a piece turned in the air and then dropped is not a spin.
      if (y !== p.y) p.lastRot = false;
      p.y = y;
      this.s.drops++;
      const r = this.lock();
      this.pendingDrop = null;
      return r;
    }

    holdPiece() {
      const p = this.piece;
      if (!p || this.over || this.mods.noHold || (this.holdLocked && !this.freeHold)) { this.emit('blocked', 'hold'); return false; }
      const cur = Object.assign({}, p.entry, { special: p.special || null });
      const keep = { hold: this.hold, holdLocked: this.holdLocked, queue: this.queue.map((e) => Object.assign({}, e)), bag: this.bag.slice(), rng: this.rng.state() };
      const prev = this.hold;
      this.hold = cur;
      this.holdLocked = true;
      // Free hold (Relaxed, puzzles): a swap to a piece with no room anywhere above the stack is refused and changes
      // nothing. Classic keeps the rule it has always had: a held piece that cannot appear is a block out.
      const o = { soft: this.freeHold, from: this.cellsOf(p) };
      const ok = prev ? this.spawn(prev, o) : this.spawnNext(o);
      if (!ok && o.soft) {
        Object.assign(this, { piece: p, hold: keep.hold, holdLocked: keep.holdLocked, queue: keep.queue, bag: keep.bag, rng: RNG.from(keep.rng) });
        this.emit('blocked', 'hold');
        this.emit('noroom', 'hold');
        return false;
      }
      if (prev && this.piece) this.piece.fromHold = true;
      this.s.holds++;
      this.emit('hold');
      return true;
    }

    // ---- setting a piece --------------------------------------------------------------------------------------------

    pushHistory() {
      const p = this.piece;
      this.history.push({
        cells: this.board.snapshot(),
        entry: Object.assign({}, p.entry, { special: p.special || null }),
        hold: this.hold, holdLocked: this.holdLocked,
        queue: this.queue.map((e) => Object.assign({}, e)),
        bag: this.bag.slice(), rng: this.rng.state(),
        s: JSON.parse(JSON.stringify(this.s)),
      });
      if (this.history.length > this.maxHistory) this.history.shift();
    }

    /** Takes back the last placement; returns the lines it had cleared (so the caller can take them back too). */
    undo() {
      const h = this.history.pop();
      if (!h) return null;
      const linesBefore = this.s.lines;
      this.board.restore(h.cells);
      this.hold = h.hold; this.holdLocked = h.holdLocked;
      this.queue = h.queue; this.bag = h.bag; this.rng = RNG.from(h.rng);
      this.s = h.s;
      this.over = false;
      this.spawn(h.entry);
      this.emit('undo');
      return { lines: linesBefore - this.s.lines };
    }

    lock() {
      const p = this.piece;
      if (!p) return false;
      const shape = p.type.rots[p.rot];
      if (p.special !== 'anvil' && !this.board.fits(shape, p.x, p.y)) { this.emit('blocked', 'lock'); return false; }
      this.pushHistory();
      const cells = this.cellsOf(p);
      const result = { type: p.type.id, color: p.type.color, special: p.special, cells, rows: [], removed: [], lines: 0, tspin: false, perfect: false, combo: 0, b2b: false, score: 0, blast: null };
      if (this.pendingDrop) { result.dropDist = this.pendingDrop.dist; result.dropCells = this.pendingDrop.cells; }
      const v = p.type.color | (this.mods.vanish ? CELL.HIDDEN : 0);

      if (p.special === 'anvil') {
        // Smashes every block in its columns from where it was down to where it lands (the floor, or steel).
        const from = this.pendingDrop ? this.pendingDrop.cells : cells;
        const top = new Map(), bottom = Math.min(...cells.map(([, y]) => y));
        for (const [x, y] of from) top.set(x, Math.max(top.has(x) ? top.get(x) : -1, y));
        result.smashed = [];
        for (const [x, t] of top) for (let y = Math.min(t, this.h - 1); y >= bottom; y--) { const old = this.board.get(x, y); if (this.tough(old)) break; if (old) { result.smashed.push([x, y, old]); this.board.set(x, y, 0); } }
        result.smashed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        this.board.place(shape, p.x, p.y, v);
      } else if (p.special === 'blackhole') {
        const [cx, cy] = cells[0];
        result.swallowed = [];
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
          const dx = this.board.wrap ? Math.min(Math.abs(x - cx), this.w - Math.abs(x - cx)) : x - cx;
          if (dx * dx + (y - cy) * (y - cy) > 11) continue;
          const old = this.board.get(x, y);
          if (old) { result.swallowed.push([x, y, old]); this.board.set(x, y, 0); }
        }
        result.center = [cx, cy];
      } else if (p.special === 'bomb') {
        const [cx, cy] = cells[0];
        result.blast = [];
        for (const [dx, dy] of BOMB_PATTERN) {
          const x = cx + dx, y = cy + dy;
          if (!this.board.inside(x, y)) continue;
          const old = this.board.get(x, y);
          if (old && !this.tough(old)) { result.blast.push([this.board.wx(x), y, old]); this.board.set(x, y, 0); }
        }
        result.blastCenter = [cx, cy];
      } else {
        // T-spin (guideline): the last move was a turn and three of the box's four corners are blocked. With both
        // corners the T points at blocked it is a full T-spin; with only one it is a Mini, unless the turn needed
        // the last, far kick (the T-spin triple shape), which counts as full.
        if (p.type.id === 'T' && p.lastRot) {
          const blocked = (dx, dy) => this.board.get(p.x + dx, p.y + dy) !== 0;
          let corners = 0;
          for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (blocked(dx, dy)) corners++;
          if (corners >= 3) {
            const front = T_FRONT[p.rot].filter(([dx, dy]) => blocked(dx, dy)).length;
            if (front === 2 || p.kick === 4) result.tspin = true;
            else result.mini = true;
          }
        }
        this.board.place(shape, p.x, p.y, v);
        if (p.special === 'sand') this.settleCells(cells, v, result);
        if (p.special === 'magnet') {
          // Pulls every block in the piece's columns down tight.
          result.moves = [];
          for (const x of new Set(cells.map(([cx]) => cx))) {
            let dst = 0;
            for (let y = 0; y < this.h; y++) {
              const val = this.board.get(x, y);
              if (!val) continue;
              if (dst !== y) { this.board.set(x, dst, val); this.board.set(x, y, 0); result.moves.push([x, y, x, dst, val]); }
              dst++;
            }
          }
        }
      }
      if (p.special === 'golden') result.golden = true;
      if (p.fromHold) result.fromHold = true;
      // The sandbox (js/sandbox.js): what the new block is made of, and the chain reactions it sets off.
      if (this.react) this.react(p, result);

      let rows = this.board.fullRows();
      if (p.special === 'laser') {
        // Every row the piece touches is vaporised, full or not (and, through steel, the rows the steel reaches).
        result.laser = Array.from(new Set(cells.map(([, cy]) => cy))).filter((y) => y >= 0 && y < this.h).sort((a, b) => a - b);
        if (this.conduct) this.conduct(result);
        rows = Array.from(new Set(rows.concat(result.laser))).sort((a, b) => a - b);
      }
      result.rows = rows;
      result.removed = this.board.clearRows(rows);
      result.lines = rows.length;
      if (this.afterClear) this.afterClear(result);
      this.score(result);
      this.s.pieces++;
      this.s.byType[p.type.family === 'tetromino' ? p.type.id : p.type.family] = (this.s.byType[p.type.family === 'tetromino' ? p.type.id : p.type.family] || 0) + 1;
      this.holdLocked = false;
      this.piece = null;
      this.emit('lock', result);
      if (!this.over) this.spawnNext();
      return result;
    }

    /** Sand: every cell of the piece falls on its own until it lands. */
    settleCells(cells, v, result) {
      const sorted = cells.slice().sort((a, b) => a[1] - b[1]);
      result.sand = [];
      for (const [x, y] of sorted) {
        this.board.set(x, y, 0);
        let ny = y;
        while (ny > 0 && !this.board.filled(x, ny - 1)) ny--;
        this.board.set(x, ny, v);
        result.sand.push([x, y, ny]);
      }
      result.cells = result.sand.map(([x, , ny]) => [x, ny]);
    }

    /** Drill: bores the column under the bit down to the floor. */
    bore() {
      const p = this.piece;
      this.pushHistory();
      const [x, y] = this.cellsOf(p)[0];
      const result = { type: p.type.id, special: 'drill', cells: [], rows: [], removed: [], lines: 0, score: 0, drilled: [], bit: [x, y] };
      for (let yy = y; yy >= 0; yy--) {
        const old = this.board.get(x, yy);
        if (this.tough(old)) { result.stopped = [x, yy]; break; } // the bit blunts itself on steel
        if (old) { result.drilled.push([x, yy, old]); this.board.set(x, yy, 0); }
      }
      if (this.react) this.react(p, result);
      this.s.pieces++;
      this.holdLocked = false;
      this.piece = null;
      this.emit('lock', result);
      this.spawnNext();
      return result;
    }

    score(result) {
      const s = this.s, n = result.lines;
      let pts = 0;
      if (result.tspin) {
        pts = TSPIN_SCORE[Math.min(n, 3)];
        s.tspins++;
        if (n >= 3) s.tst = (s.tst || 0) + 1;
        s.tspinLines += n;
      } else if (result.mini) {
        pts = MINI_SCORE[Math.min(n, 2)];
      } else if (n) pts = CLEAR_SCORE[Math.min(n, CLEAR_SCORE.length - 1)];
      if (n) {
        s.combo++;
        const difficult = n >= 4 || result.tspin || result.mini;
        if (difficult) { s.b2b++; if (s.b2b > 0) { pts = Math.round(pts * 1.5); result.b2b = true; } }
        else s.b2b = -1;
        if (s.combo > 0) pts += 50 * s.combo;
        s.clears[Math.min(n, 5)]++;
        if (this.board.isEmpty()) { result.perfect = true; s.perfect++; pts += 3000; }
        // Quads in a row: set by hand (a golden piece counts; lasers and board items do not); any other clear ends it.
        if (n >= 4 && (!result.special || result.special === 'golden')) s.quadRun = (s.quadRun || 0) + 1;
        else s.quadRun = 0;
      } else {
        s.combo = -1;
      }
      // By hand: a piece with no item on it, on a stack built without items (see freshStats). A board item's clear
      // (Settle, Tornado) or an item piece's breaks every hand streak; so does any item used in between (noteItem).
      const hand = s.hand !== false && !result.special;
      result.hand = hand;
      if (!hand) { s.hb2b = -1; s.hcombo = -1; s.hquads = 0; }
      else if (n) {
        s.hcombo++;
        if (n >= 4 || result.tspin || result.mini) s.hb2b++; else s.hb2b = -1;
        s.hquads = n >= 4 ? (s.hquads || 0) + 1 : 0;
        if (result.tspin) { s.htspins = (s.htspins || 0) + 1; if (n >= 3) s.htst = (s.htst || 0) + 1; }
        if (result.perfect) s.hperfect = (s.hperfect || 0) + 1;
      } else s.hcombo = -1;
      // An empty board is a fresh start: whatever came before, the next stack is built from nothing.
      if (result.perfect && !result.special) s.hand = true;
      s.hchain = (s.hb2b >= 0 ? s.hb2b + 1 : 0) + Math.max(0, s.hcombo);
      s.bestHChain = Math.max(s.bestHChain || 0, s.hchain);
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.maxB2B = Math.max(s.maxB2B, s.b2b);
      s.lines += n;
      s.score += pts;
      result.combo = Math.max(0, s.combo);
      result.score = pts;
    }

    // ---- by hand ------------------------------------------------------------------------------------------------------

    /**
     * An item that touches the pieces or the board was used (Free Play calls this; Luck items do not count): every
     * hand streak ends, and the stack is no longer built by hand — unless the item acted on the board at once
     * (emptied: a Nuke, a Tornado, Rewind …) and left it empty, a fresh start.
     */
    noteItem(emptied) {
      const s = this.s;
      s.hand = !!emptied && this.board.isEmpty();
      s.hb2b = -1; s.hcombo = -1; s.hquads = 0; s.hchain = 0; s.goldRun = 0; s.pace = [];
    }

    /** The hand counts, to put back if the item is taken back before the piece is set. */
    handState() { const o = {}; for (const k of HAND_KEYS) o[k] = JSON.parse(JSON.stringify(this.s[k] === undefined ? null : this.s[k])); return o; }
    restoreHand(o) { if (o) for (const k of HAND_KEYS) this.s[k] = o[k] === null ? undefined : o[k]; }

    /**
     * The pace of hand play: each piece set by hand notes when (wall clock) and the board's lines after it; the last
     * 101 are kept, so the last 100 pieces' time and lines can be read (Game.paceOf). Anything not by hand starts over.
     */
    notePace(result, now) {
      const s = this.s;
      if (!result || !result.hand) { s.pace = []; return; }
      s.pace = (s.pace || []).concat([[now, s.lines]]);
      if (s.pace.length > 101) s.pace = s.pace.slice(-101);
    }

    // ---- items --------------------------------------------------------------------------------------------------------

    /**
     * Swaps the current piece for another (reroll, order slip, pebble, mirror, blueprint, bomb …), keeping its place:
     * the same box centre if it fits there, else the nearest open spot it could get to (in its own turn, then the
     * others). With no room anywhere above the stack the swap is refused (false) and nothing changes — it is never
     * a full board: the piece in play still fits where it is.
     */
    replacePiece(entry) {
      const p = this.piece;
      if (!p) return false;
      const type = Pieces.get(entry.id);
      const next = { type, rot: 0, x: p.x, y: p.y, special: entry.special || null, entry: Object.assign({ rot: 0 }, entry), lastRot: false };
      const b0 = p.type.rotBounds[p.rot];
      const at = this.room(next, 0, p.x + b0.minX + b0.w / 2, p.y + b0.minY + b0.h / 2, this.cellsOf(p));
      if (!at) { this.emit('blocked', 'replace'); return false; }
      next.x = this.board.wx(at.x); next.y = at.y; next.rot = at.rot;
      this.piece = next;
      this.emit('replace', next);
      return true;
    }

    setSpecial(special) {
      if (!this.piece) return false;
      if (SINGLE.has(special)) return this.replacePiece({ id: 'M1', special });
      if (SHAPED.has(special)) {
        this.piece.special = special;
        this.piece.entry = Object.assign({}, this.piece.entry, { special });
        this.emit('replace', this.piece);
        return true;
      }
      return false;
    }

    /** Settle: every column's blocks fall, then full rows clear. */
    settle() {
      if (!this.piece) return null;
      this.pushHistory();
      const before = this.board.snapshot();
      this.board.compact();
      const rows = this.board.fullRows();
      const result = { type: 'settle', special: 'settle', cells: [], rows, removed: this.board.clearRows(rows), lines: rows.length, score: 0, before };
      this.score(result);
      this.emit('lock', result);
      return result;
    }

    /** Nuke: the whole board, gone. (No lines for it — it is not tidy, it is a nuke.) */
    nuke() {
      if (!this.piece || this.board.isEmpty()) return null;
      this.pushHistory();
      const gone = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const v = this.board.get(x, y); if (v) gone.push([x, y, v]); }
      this.board.cells.fill(0);
      this.emit('nuke', gone);
      return gone;
    }

    /** Tornado: lifts every block and drops them back packed into solid rows from the floor up; full rows clear. */
    tornado() {
      if (!this.piece || this.board.isEmpty()) return null;
      this.pushHistory();
      const blocks = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const v = this.board.get(x, y); if (v) blocks.push([x, y, v]); }
      this.board.cells.fill(0);
      const moves = [];
      const order = this.rng.shuffle(blocks.slice());
      order.forEach(([x, y, v], i) => {
        const nx = i % this.w, ny = Math.floor(i / this.w);
        this.board.set(nx, ny, v);
        moves.push([x, y, nx, ny, v]);
      });
      const rows = this.board.fullRows();
      const result = { type: 'tornado', special: 'tornado', cells: [], rows, removed: this.board.clearRows(rows), lines: rows.length, score: 0, moves };
      this.score(result);
      this.emit('lock', result);
      return result;
    }

    /** Mirror World: the whole board flips left to right. */
    flipWorld() {
      if (!this.piece || this.board.isEmpty()) return null;
      const before = this.board.snapshot();
      this.pushHistory();
      const moves = [];
      for (let y = 0; y < this.h; y++) {
        const row = [];
        for (let x = 0; x < this.w; x++) row.push(this.board.get(x, y));
        for (let x = 0; x < this.w; x++) { this.board.set(x, y, row[this.w - 1 - x]); if (row[this.w - 1 - x]) moves.push([this.w - 1 - x, y, x, y, row[this.w - 1 - x]]); }
      }
      const p = this.piece;
      if (!this.fitsAt(p, p.rot, p.x, p.y)) { this.board.restore(before); this.history.pop(); return null; }
      this.emit('flip', moves);
      return moves;
    }

    /** Purge: removes every block the colour of the current piece. */
    purge() {
      const p = this.piece;
      if (!p) return null;
      this.pushHistory();
      const color = p.type.color, gone = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const v = this.board.get(x, y);
        if (v && (v & CELL.COLOR) === color && !this.tough(v)) { gone.push([x, y, v]); this.board.set(x, y, 0); }
      }
      this.emit('purge', gone);
      return gone;
    }

    resetBoard() {
      this.board.cells.fill(0);
      this.over = false;
      this.history = [];
      this.hold = null;
      this.holdLocked = false;
      this.s = freshStats();
      if (!this.piece || !this.fitsAt(this.piece, this.piece.rot, this.piece.x, this.piece.y)) {
        const e = this.piece ? this.piece.entry : this.queue.shift();
        this.fillQueue();
        this.spawn(e);
      }
      this.emit('reset');
    }

    toJSON() {
      const p = this.piece;
      return {
        w: this.w, h: this.h, wrap: this.board.wrap, cells: this.board.toArray(), fixed: this.fixed,
        queue: this.queue, bag: this.bag, rng: this.rng.state(), hold: this.hold, holdLocked: this.holdLocked, s: this.s,
        piece: p ? { entry: Object.assign({}, p.entry, { special: p.special || null }), rot: p.rot, x: p.x, y: p.y } : null,
      };
    }
  }

  /** The last n hand pieces: { ms, lines } between the lock before them and the last one; null if there are not n. */
  function paceOf(s, n) {
    const p = (s && s.pace) || [];
    if (p.length < n + 1) return null;
    const a = p[p.length - 1 - n], b = p[p.length - 1];
    return { ms: b[0] - a[0], lines: b[1] - a[1] };
  }

  Object.assign(L, { Game, freshStats, paceOf, migrateHand, spawnPos, BOMB_PATTERN, SINGLE_SPECIALS: SINGLE });
})(typeof globalThis !== 'undefined' ? globalThis : this);
