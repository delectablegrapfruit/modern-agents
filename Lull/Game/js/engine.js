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

  function freshStats() {
    return { pieces: 0, lines: 0, score: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, combo: -1, maxCombo: 0, b2b: -1, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {} };
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
        this.s = Object.assign(freshStats(), sv.s);
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

    spawnNext() {
      let entry = this.queue.shift();
      this.fillQueue();
      // A fixed queue that has run out still has the held piece to give.
      if (!entry && this.hold) { entry = this.hold; this.hold = null; this.holdLocked = true; }
      if (!entry) {
        this.piece = null;
        this.emit('empty');
        return false;
      }
      return this.spawn(entry);
    }

    spawnPosition(type, rot) { return spawnPos(this.w, this.h, type, rot); }

    spawn(entry) {
      const type = Pieces.get(entry.id);
      const rot = entry.rot || 0;
      const pos = this.spawnPosition(type, rot);
      const piece = { type, rot, x: pos.x, y: pos.y, special: entry.special || null, entry, lastRot: false };
      const tries = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -3], [-2, -1], [2, -1], [0, -4]];
      for (const [dx, dy] of tries) {
        if (this.fitsAt(piece, rot, pos.x + dx, pos.y + dy)) {
          piece.x = this.board.wx(pos.x + dx);
          piece.y = pos.y + dy;
          this.piece = piece;
          this.emit('spawn', piece);
          return true;
        }
      }
      this.piece = piece;
      this.over = true;
      this.emit('topout');
      return false;
    }

    // ---- movement -----------------------------------------------------------------------------------------------------

    passes(p) { return p.special === 'phase' || p.special === 'drill'; }

    fitsAt(p, rot, x, y) {
      const cells = p.type.rots[rot];
      return this.passes(p) ? this.board.inBounds(cells, x, y) : this.board.fits(cells, x, y);
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
      for (let i = 0; i < kicks.length; i++) {
        const [kx, ky] = kicks[i];
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

    /** Steps sideways toward a column (mouse play). */
    moveToward(targetX) {
      const p = this.piece;
      if (!p) return false;
      const b = p.type.rotBounds[p.rot];
      const cur = p.x + b.minX + Math.floor((b.w - 1) / 2);
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
      this.s.holds++;
      const prev = this.hold;
      this.hold = cur;
      this.holdLocked = true;
      if (prev) this.spawn(prev);
      else this.spawnNext();
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
      if (!this.board.fits(shape, p.x, p.y)) { this.emit('blocked', 'lock'); return false; }
      this.pushHistory();
      const cells = this.cellsOf(p);
      const result = { type: p.type.id, color: p.type.color, special: p.special, cells, rows: [], removed: [], lines: 0, tspin: false, perfect: false, combo: 0, b2b: false, score: 0, blast: null };
      if (this.pendingDrop) { result.dropDist = this.pendingDrop.dist; result.dropCells = this.pendingDrop.cells; }
      const v = p.type.color | (this.mods.vanish ? CELL.HIDDEN : 0);

      if (p.special === 'bomb') {
        const [cx, cy] = cells[0];
        result.blast = [];
        for (const [dx, dy] of BOMB_PATTERN) {
          const x = cx + dx, y = cy + dy;
          if (!this.board.inside(x, y)) continue;
          const old = this.board.get(x, y);
          if (old) { result.blast.push([this.board.wx(x), y, old]); this.board.set(x, y, 0); }
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
      }

      const rows = this.board.fullRows();
      result.rows = rows;
      result.removed = this.board.clearRows(rows);
      result.lines = rows.length;
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
      const result = { type: p.type.id, special: 'drill', cells: [], rows: [], removed: [], lines: 0, score: 0, drilled: [] };
      for (let yy = y; yy >= 0; yy--) {
        const old = this.board.get(x, yy);
        if (old) { result.drilled.push([x, yy, old]); this.board.set(x, yy, 0); }
      }
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
      } else {
        s.combo = -1;
      }
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.maxB2B = Math.max(s.maxB2B, s.b2b);
      s.lines += n;
      s.score += pts;
      result.combo = Math.max(0, s.combo);
      result.score = pts;
    }

    // ---- items --------------------------------------------------------------------------------------------------------

    /** Swaps the current piece for another (reroll, order slip, pebble, mirror, blueprint, bomb …), keeping its place. */
    replacePiece(entry) {
      const p = this.piece;
      if (!p) return false;
      const type = Pieces.get(entry.id);
      const next = { type, rot: 0, x: p.x, y: p.y, special: entry.special || null, entry: Object.assign({ rot: 0 }, entry), lastRot: false };
      // Keep it where it floats if it fits there (same box centre), else back to the spawn spot.
      const b0 = p.type.rotBounds[p.rot], b1 = type.rotBounds[0];
      const cx = p.x + b0.minX + b0.w / 2, cy = p.y + b0.minY + b0.h / 2;
      const tx = Math.round(cx - b1.w / 2 - b1.minX), ty = Math.round(cy - b1.h / 2 - b1.minY);
      for (const [dx, dy] of [[0, 0], [0, 1], [-1, 0], [1, 0], [0, -1], [0, 2], [-1, 1], [1, 1]]) {
        if (this.fitsAt(next, 0, tx + dx, ty + dy)) {
          next.x = this.board.wx(tx + dx); next.y = ty + dy;
          this.piece = next;
          this.emit('replace', next);
          return true;
        }
      }
      const saved = this.piece;
      if (this.spawn(next.entry)) { this.emit('replace', this.piece); return true; }
      this.piece = saved;
      this.over = false;
      return false;
    }

    setSpecial(special) {
      if (!this.piece) return false;
      if (special === 'bomb' || special === 'drill') return this.replacePiece({ id: 'M1', special });
      if (special === 'phase' || special === 'sand') {
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

    /** Purge: removes every block the colour of the current piece. */
    purge() {
      const p = this.piece;
      if (!p) return null;
      this.pushHistory();
      const color = p.type.color, gone = [];
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const v = this.board.get(x, y);
        if (v && (v & CELL.COLOR) === color) { gone.push([x, y, v]); this.board.set(x, y, 0); }
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

  Object.assign(L, { Game, freshStats, spawnPos, BOMB_PATTERN });
})(typeof globalThis !== 'undefined' ? globalThis : this);
