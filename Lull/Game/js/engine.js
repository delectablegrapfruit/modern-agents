// Lull — the floating-piece game: pieces never fall on their own. They move, turn, lower one row at a time,
// and set when lowered onto something or hard-dropped. Shared by Free Play and Puzzle mode.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Board, CELL, Pieces, RNG, Emitter, Recipe } = L;

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

  // Specials that turn the piece into a single block (a bomb, a drill bit, a black hole, a patch), and those that keep
  // its shape and change what it does.
  const SINGLE = new Set(['bomb', 'drill', 'blackhole', 'patch']);
  const SHAPED = new Set(['phase', 'laser']);

  /**
   * A board's numbers. lines is rows cleared (for show); own is the Standard-comparable rows (own cells cleared / w:
   * what pays and counts toward records, equal to lines on a board of the default recipe); cells is cells placed.
   * The h- ones count only what was done by hand (for achievements): hand is whether the stack was
   * built without an item that touches the pieces or the board since it was last empty; hb2b, hcombo, hquads and
   * hchain are the back-to-back streak, combo, quads in a row and chain, broken by any such item (Undo too) and
   * never fed by an item's clear; htspins counts T-spins that clear lines, htst T-spin triples and hperfect perfect
   * clears, all by hand; pace keeps [time, lines] for the last 101 pieces set by hand in a row (Game.notePace).
   */
  function freshStats() {
    return { pieces: 0, lines: 0, own: 0, cells: 0, score: 0, clears: [0, 0, 0, 0, 0, 0], tspins: 0, tspinLines: 0, perfect: 0, combo: -1, maxCombo: 0, b2b: -1, maxB2B: 0, holds: 0, rotations: 0, moves: 0, lowers: 0, drops: 0, byType: {}, startedAt: Date.now(), playMs: 0, items: {}, banked: 0, chain: 0, bestChain: 0, tst: 0, quadRun: 0,
      hand: true, hb2b: -1, hcombo: -1, hquads: 0, hchain: 0, bestHChain: 0, htspins: 0, htst: 0, hperfect: 0, goldRun: 0, pace: [] };
  }
  const HAND_KEYS = ['hand', 'hb2b', 'hcombo', 'hquads', 'hchain', 'goldRun', 'pace'];

  /**
   * Where the pieces come from: today's 7-bag, drawn on the game's own random stream (game.bag holds the rest of the
   * bag). A board recipe's shapes can bring another (one per game; see Game hooks). next(game) is the next id;
   * reroll(game, exclude) a different piece for the Reroll power-up (on Math.random: it never moves the game's stream
   * or the bag); candidates(game) the ids Best Fit and Order Slip choose from.
   */
  const BAG_DEALER = {
    next(game) {
      if (!game.bag.length) game.bag = game.rng.shuffle(Pieces.TETROMINOES.slice());
      return game.bag.shift();
    },
    reroll(game, exclude) {
      const opts = Pieces.TETROMINOES.filter((t) => t !== exclude);
      return opts[Math.floor(Math.random() * opts.length)];
    },
    candidates() { return Pieces.TETROMINOES.slice(); },
  };

  // Hooks a board recipe's parts can give a game (Recipe.engine: one extension per part, run in the parts' order). Each
  // takes (game, board, …), so simulate() can run them on a copy of the board:
  //   dealer            { next, reroll, candidates }: where the pieces come from (the first part that has one)
  //   spawnAt(g, b, pos, type) -> { x, y, rot }         where a piece appears (chained, from basePosition: the plain
  //                                                      spot, or with the ceiling option flush with the ceiling)
  //   placed(g, b, abs, p) -> abs                        the cells a piece covers (absCells: fits, ghost, lock …)
  //   targets(g, b, kind, cells) -> cells                where bomb, blackhole, bore, patch and laser act
  //   columns(g, b, kind, order) -> order                Tornado's shuffle ('tornado'): order[x] is the column that
  //                                                      lands at x, drawn on the game's stream as always (chained)
  //   refuseLock(g, b, abs) -> note                      a lock that may not happen here (the piece stays)
  //   afterPlace(g, b, abs, v, res)                      after a piece's cells are set
  //   rows(g, b, rows) -> rows                           which full rows clear
  //   beforeClear(g, b, res) / afterClear(g, b, res)     around a lock's (or Settle's) clear
  //   clearRows(g, b, rows, res) -> removed              takes a clear's rows away itself (null: the board's own
  //                                                      clearRows, everything above comes down)
  //   keep(g, b, v) -> true                              a cell no item removes
  //   roomAfter(g, b)                                    inside the "would the piece still fit" test of Settle and Trapdoor
  //   step(g, res)                                       after a piece lock (or a drill) is scored, before the next
  //                                                      piece; a part that ends the board here calls g.end(kind)
  //   clean(g, b) -> bool                                is the board empty (a perfect clear; an item leaving it empty)
  //   afterChange(g, kind, what)                         after settle (what: its result), trapdoor ({ row }), tornado
  //                                                      ({ moves, order }), flip ({ moves }), bore (its result: the
  //                                                      drill's rows are cleared and scored as plain before it)
  //   allow(g, itemId) -> reason                         an item refused here
  //   snap(g) / restore(g, snap)                         kept with each Undo step
  //   save(g) -> data                                    kept in the save (toJSON's x), given back to the part's engine()
  //   reset(g)                                           the board was started over (resetBoard)
  //   summary(g) -> numbers                              the board's own numbers for its summary (Library.summarize)
  //   comboCount(g, id, cells) -> n                      the blocks an item took that Full Blast or Event Horizon counts
  //                                                      (Combos.blocksOf; without it, the cells over R.copies)
  // A part's engine(game, saved, o) runs with game.recipe, game.rules, game.rng and game.seed (a new game's; a resumed
  // one has none: the part keeps its own state in save()) set, and o the Game's own options. A lock a part refuses
  // emits 'refused' with its note. Without a hook the plain code runs, exactly as before.

  class Game extends Emitter {
    /**
     * o: { w, h, wrap, mode, mods: {noRotate, heavy, noHold, vanish}, queue: [{id, rot}] (fixed list: puzzles),
     *      seed, previewCount, board (Board), saved (from toJSON), freeHold (hold swaps back and forth as often as
     *      you like; Classic turns it off: once per piece), ceiling (Classic: see below) }
     */
    constructor(o) {
      super();
      o = o || {};
      this.mode = o.mode || 'free';
      this.mods = Object.assign({ noRotate: false, heavy: false, noHold: false, vanish: false }, o.mods || {});
      this.previewCount = o.previewCount == null ? 5 : o.previewCount;
      this.maxHistory = o.maxHistory == null ? 30 : o.maxHistory;
      // The board recipe (js/recipe.js): Relaxed boards carry one (the default plays exactly as boards always have);
      // Classic and Puzzles pass none and keep the default rules.
      const rc = o.recipe != null ? o.recipe : (o.saved && o.saved.recipe != null ? o.saved.recipe : null);
      this.recipe = rc != null && Recipe ? Recipe.normalize(rc) : null;
      this.freeHold = o.freeHold !== false;
      // Relaxed play: a piece (spawned, held or swapped in by an item) that does not fit where it would appear is
      // fitted into the nearest open spot above the stack instead; only when there is none is the board full.
      // Classic (block out at the spawn spot) and puzzles (a fixed queue) keep the plain spawn.
      this.findRoom = o.findRoom != null ? !!o.findRoom : (this.freeHold && !o.queue && !(o.saved && o.saved.fixed));
      // Classic: the well's top row is a row like any other. Every piece appears with its top in that row (the I too),
      // a piece touching the ceiling still touches it after a turn, and a piece that cannot appear right where it
      // appears is the game over (no nearby spot is tried).
      this.ceiling = !!o.ceiling;
      this.history = [];
      this.over = false;
      const sv = o.saved;
      if (sv) {
        this.board = Board.fromArray(sv.w, sv.h, sv.cells, { wrap: sv.wrap });
        this.rng = RNG.from(sv.rng);
        this.setup(sv.x, o);
        this.fixed = !!sv.fixed;
        this.queue = sv.queue.map((e) => Object.assign({}, e));
        this.bag = sv.bag.slice();
        this.hold = sv.hold;
        this.holdLocked = sv.holdLocked;
        this.s = Object.assign(freshStats(), sv.s);
        this.piece = null;
        if (sv.piece) {
          const type = Pieces.get(sv.piece.entry.id), entry = sv.piece.entry;
          if (type) {
            // The piece's own flags come back too: a T twisted into its slot still spins, an I from hold is still one.
            this.piece = { type, rot: sv.piece.rot, x: sv.piece.x, y: sv.piece.y, special: entry.special || null, entry, lastRot: !!sv.piece.lastRot };
            if (sv.piece.kick != null) this.piece.kick = sv.piece.kick;
            if (sv.piece.fromHold) this.piece.fromHold = true;
          }
        }
        this.fillQueue();
        // Ended by a part (Game.end: Protect's wilt): it stays ended, with no new piece.
        if (sv.ended) { this.over = true; this.endKind = String(sv.ended); }
        else if (!this.piece) this.spawnNext();
        // Saved with the board full: the piece has nowhere to be.
        else if (!this.fitsAt(this.piece, this.piece.rot, this.piece.x, this.piece.y)) this.over = true;
        return;
      }
      this.board = o.board ? o.board.clone() : new Board(o.w || 10, o.h || 20, { wrap: o.wrap });
      // The seed is kept on the game (a part can seed its own stream from it: Protect's guard); the stream exists
      // before the parts' engines run.
      this.seed = o.seed == null ? (Date.now() ^ (Math.random() * 4294967296)) >>> 0 : o.seed;
      this.rng = new RNG(this.seed);
      this.setup(null, o);
      this.fixed = !!o.queue;
      this.queue = o.queue ? o.queue.map((e) => Object.assign({ rot: 0 }, e)) : [];
      this.bag = [];
      this.hold = null;
      this.holdLocked = false;
      this.piece = null;
      this.s = freshStats();
      this.fillQueue();
      this.spawnNext();
    }

    get w() { return this.board.w; }
    get h() { return this.board.h; }

    /** The rules (Recipe.rules), the recipe's extensions and their hooks, once the board (its width) is known. */
    setup(x, o) {
      this.rules = Recipe ? Recipe.rules(this.recipe || Recipe.DEFAULT, this.w) : { u: 1, copies: 1, E: 4, f: 1, lk: this.w / 10, rated: true, feats: this.w >= 10, quad: 4, undo: true, hints: true, refuse: {} };
      if (!this.rules.undo) this.maxHistory = 0;
      this.ext = this.recipe && Recipe ? Recipe.engine(this, x, o || {}) : [];
      const d = this.ext.find((e) => e.dealer);
      this.dealer = d ? d.dealer : BAG_DEALER;
      // Hooks by name, for the hot paths (no hook: the plain code runs, exactly as before).
      this.hooks = {};
      for (const e of this.ext) for (const k of Object.keys(e)) if (typeof e[k] === 'function') (this.hooks[k] = this.hooks[k] || []).push(e);
    }

    /** Runs every extension's hook `name` in order (game first); returns nothing. */
    hook(name, ...args) { const hs = this.hooks[name]; if (hs) for (const e of hs) e[name](this, ...args); }
    /** Passes v through every extension's hook `name` in order: v = call(ext, v) (an answer of undefined keeps v). */
    chain(name, v, call) {
      const hs = this.hooks[name];
      if (hs) for (const e of hs) { const r = call(e, v); if (r !== undefined && r !== null) v = r; }
      return v;
    }
    /** The first answer an extension's hook `name` gives (not undefined or null), or null. */
    ask(name, ...args) {
      const hs = this.hooks[name];
      if (hs) for (const e of hs) { const r = e[name](this, ...args); if (r !== undefined && r !== null) return r; }
      return null;
    }

    /** Why an item cannot be used on this board (the recipe's rules, then its parts), or null. */
    allow(itemId) {
      const why = this.rules.refuse && this.rules.refuse[itemId];
      if (why) return why;
      return this.ask('allow', itemId);
    }

    // ---- queue --------------------------------------------------------------------------------------------------------

    fillQueue() {
      if (this.fixed) return;
      while (this.queue.length < Math.max(6, this.previewCount + 1)) this.queue.push({ id: this.dealer.next(this), rot: 0 });
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

    /** Where a piece appears before the recipe has its say: the plain spawn spot, or (Classic) flush with the ceiling. */
    basePosition(type, rot) {
      const pos = spawnPos(this.w, this.h, type, rot);
      // Its own shape of object (never a write to spawnPos's {x, y}): a different y stored into that shape makes V8
      // widen its fields, and every later spawnPos caller (the puzzle generator) runs about a third slower.
      return this.ceiling ? { x: pos.x, y: this.h - 1 - type.rotBounds[rot].maxY, top: true } : pos;
    }

    /** Where a piece appears: { x, y, rot }, the recipe's parts having their say last (spawnAt, chained). */
    spawnPosition(type, rot) {
      const pos = this.basePosition(type, rot);
      if (!this.hooks.spawnAt) return pos;
      return this.chain('spawnAt', Object.assign({ rot }, pos), (e, v) => e.spawnAt(this, this.board, v, type));
    }

    spawn(entry, o) {
      o = o || {};
      const type = Pieces.get(entry.id);
      const pos = this.spawnPosition(type, entry.rot || 0);
      const rot = pos.rot != null ? pos.rot : entry.rot || 0;
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
      const only = this.findRoom || this.ceiling;
      const open = only ? null : new Set(this.reach(piece, rot, seeds, o.from).map(([x, y]) => x + ',' + y));
      const tries = only ? [[0, 0]] : [[0, 0], [0, -1], [-1, 0], [1, 0], [0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [0, -3], [-2, -1], [2, -1], [0, -4]];
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
      // Full: the piece stays where it would have come in, but always inside the walls (a Noodle or a Giant can be
      // wider than a narrow board): the first turn that fits across, pushed in from the walls and the ceiling.
      if (!this.board.wrap) {
        const r = [rot, (rot + 1) % 4, (rot + 3) % 4, (rot + 2) % 4].find((k) => type.rotBounds[k].w <= this.w && type.rotBounds[k].h <= this.h);
        if (r != null) {
          // Its turn's spot as the recipe's parts gave it (spawnAt), or, turned to fit, the plain one (Classic: at the ceiling).
          const b = type.rotBounds[r], at = r === rot ? pos : this.basePosition(type, r);
          piece.rot = r;
          piece.x = Math.min(Math.max(at.x, -b.minX), this.w - 1 - b.maxX);
          piece.y = Math.min(Math.max(at.y, -b.minY), this.h - 1 - b.maxY);
        }
      }
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

    passes(p) { return p.special === 'phase' || p.special === 'drill'; }

    fitsAt(p, rot, x, y) {
      if (!this.passes(p)) return this.fitShape(p, rot, x, y);
      if (!this.hooks.placed) return this.board.inBounds(p.type.rots[rot], x, y);
      return this.board.inBoundsAbs(this.absCells(p, rot, x, y));
    }

    /** Would the piece's cells (absCells) be inside and empty there, whatever it carries (a Ghost passes; this does not)? */
    fitShape(p, rot, x, y, board) {
      board = board || this.board;
      if (!this.hooks.placed) return board.fits(p.type.rots[rot], x, y);
      return board.fitsAbs(this.absCells(p, rot, x, y, board));
    }

    /**
     * The board cells a piece covers there: its shape's cells, wrapped, then passed through the recipe's `placed` hooks
     * (Mirror adds the reflection). Everything that asks where a piece is uses this: fits, the ghost, lock, render.
     */
    absCells(p, rot, x, y, board) {
      p = p || this.piece;
      if (!p) return [];
      board = board || this.board;
      rot = rot == null ? p.rot : rot; x = x == null ? p.x : x; y = y == null ? p.y : y;
      const abs = p.type.rots[rot].map(([cx, cy]) => [board.wx(x + cx), y + cy]);
      return this.hooks.placed ? this.chain('placed', abs, (e, v) => e.placed(this, board, v, p)) : abs;
    }
    cellsOf(p, rot, x, y) { return this.absCells(p, rot, x, y); }

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
      // Classic, touching the ceiling: each kick is taken from the spot where the turned shape touches it too (its box
      // would sink it a row, and a piece never moves up), and never goes up from there.
      const lift = this.ceiling && p.y + p.type.rotBounds[from].maxY === this.h - 1 ? this.h - 1 - p.type.rotBounds[to].maxY - p.y : null;
      for (let i = 0; i <= kicks.length; i++) {
        // Past the end of the table, one last try: a nudge off the wall, ceiling or stack (odd shapes only).
        const k = i < kicks.length ? kicks[i] : this.nudge(p, to);
        if (!k) break;
        const kx = k[0], ky = lift != null && i < kicks.length ? lift + Math.min(0, k[1]) : k[1];
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
      const was = new Set(p.type.rots[p.rot].map(([cx, cy]) => b.wx(p.x + cx) + ',' + (p.y + cy)));
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
      if (p.special === 'patch') { const t = this.patchTarget(p); if (t != null) return t; }
      let y = p.y;
      while (this.fitShape(p, p.rot, p.x, y - 1)) y--;
      return y;
    }

    /** A phasing piece drops into the first gap below it where it would rest. */
    phaseTarget(p) {
      for (let y = p.y; y + p.type.rotBounds[p.rot].minY >= 0; y--) {
        if (this.fitShape(p, p.rot, p.x, y) && !this.fitShape(p, p.rot, p.x, y - 1)) return y;
      }
      return null;
    }

    /**
     * A patch drops into the highest covered hole in its column below it (an empty cell with a block somewhere above
     * it); with none, it lands like any block. Returns that row, or null.
     */
    patchTarget(p) {
      const [x0, y0] = this.cellsOf(p)[0];
      // Every column the patch acts in (the recipe's targets: Mirror's pair) needs its hole in the same row.
      const cols = this.hooks.targets ? this.targets('patch', [[x0, y0]]).map(([x]) => x) : [x0];
      const roof = cols.map(() => false);
      for (let y = this.h - 1; y >= 0; y--) {
        let open = true;
        cols.forEach((x, i) => { if (this.board.get(x, y)) { roof[i] = true; open = false; } });
        if (open && roof.every(Boolean) && y <= y0) return y;
      }
      return null;
    }

    /** Where an item acts (bomb and black hole centres, the drill's column, the patch, the laser's cells): the recipe's parts can add to them. */
    targets(kind, cells) { return this.hooks.targets ? this.chain('targets', cells, (e, v) => e.targets(this, this.board, kind, v)) : cells; }
    /** A cell no item removes (the recipe's `keep`: Protect's sprout). */
    kept(v) { return !!this.hooks.keep && this.hooks.keep.some((e) => e.keep(this, this.board, v)); }

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
      if (!p || this.over || this.mods.noHold || (this.holdLocked && !this.freeHold) || (p.entry && p.entry.received)) { this.emit('blocked', 'hold'); return false; }
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
        x: this.hooks.snap ? this.snapExt() : null,
      });
      if (this.history.length > this.maxHistory) this.history.shift();
    }

    /** Each extension's own state, kept with an Undo step: { key: snap }. */
    snapExt() { const o = {}; for (const e of this.hooks.snap || []) o[e.key] = e.snap(this); return o; }

    /** Takes back the last placement; returns the lines it had cleared (so the caller can take them back too). */
    undo() {
      const h = this.history.pop();
      if (!h) return null;
      const linesBefore = this.s.lines, ownBefore = this.s.own || 0;
      this.board.restore(h.cells);
      this.hold = h.hold; this.holdLocked = h.holdLocked;
      this.queue = h.queue; this.bag = h.bag; this.rng = RNG.from(h.rng);
      this.s = h.s;
      if (h.x) for (const e of this.hooks.restore || []) if (e.key in h.x) e.restore(this, h.x[e.key]);
      this.over = false;
      this.endKind = null;
      this.spawn(h.entry);
      this.emit('undo');
      return { lines: linesBefore - this.s.lines, own: ownBefore - (this.s.own || 0) };
    }

    lock() {
      const p = this.piece;
      if (!p) return false;
      let fell = this.pendingDrop;
      if (p.special === 'patch') {
        // Into the covered hole below, if there is one.
        const t = this.patchTarget(p);
        if (t != null && t !== p.y) { fell = { dist: (fell ? fell.dist : 0) + p.y - t, cells: fell ? fell.cells : this.cellsOf(p) }; p.y = t; }
      }
      if (!this.fitShape(p, p.rot, p.x, p.y)) { this.emit('blocked', 'lock'); return false; }
      const cells = this.absCells(p);
      // A board's recipe can refuse a lock here (Battle: a piece must touch your board): the piece stays in play.
      const note = this.hooks.refuseLock ? this.ask('refuseLock', this.board, cells) : null;
      if (note) { this.emit('blocked', 'lock'); this.emit('refused', note); return false; }
      this.pushHistory();
      const result = { type: p.type.id, color: p.type.color, special: p.special, tag: (p.entry && p.entry.tag) || null, cells, rows: [], removed: [], lines: 0, tspin: false, perfect: false, combo: 0, b2b: false, score: 0, blast: null, had: this.board.count() };
      if (fell) { result.dropDist = fell.dist; result.dropCells = fell.cells; }
      const v = p.type.color | (this.mods.vanish ? CELL.HIDDEN : 0);

      result.placed = 0;
      if (p.special === 'blackhole') {
        const centers = this.targets('blackhole', [cells[0]]);
        result.swallowed = [];
        for (const [cx, cy] of centers) {
          for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
            const dx = this.board.wrap ? Math.min(Math.abs(x - cx), this.w - Math.abs(x - cx)) : x - cx;
            if (dx * dx + (y - cy) * (y - cy) > 11) continue;
            const old = this.board.get(x, y);
            if (old && !this.kept(old)) { result.swallowed.push([x, y, old]); this.board.set(x, y, 0); }
          }
        }
        result.center = centers[0];
        if (centers.length > 1) result.centers = centers;
        result.cells = [];
      } else if (p.special === 'bomb') {
        // Nothing is set: the bomb goes off where it lands, clearing a 13-block diamond. What was above stays put.
        const centers = this.targets('bomb', [cells[0]]);
        result.blast = [];
        for (const [cx, cy] of centers) {
          for (const [dx, dy] of BOMB_PATTERN) {
            const x = this.board.wx(cx + dx), y = cy + dy;
            if (!this.board.inside(x, y)) continue;
            const old = this.board.get(x, y);
            if (old && !this.kept(old)) { result.blast.push([x, y, old]); this.board.set(x, y, 0); }
          }
        }
        result.center = centers[0];
        if (centers.length > 1) result.centers = centers;
        result.cells = [];
      } else {
        // T-spin (guideline): the last move was a turn and three of the box's four corners are blocked. With both
        // corners the T points at blocked it is a full T-spin; with only one it is a Mini, unless the turn needed
        // the last, far kick (the T-spin triple shape), which counts as full. An item piece is never one.
        if (p.type.id === 'T' && p.lastRot && !p.special) {
          // Classic: the space above the ceiling is open (as in the guideline games), so a T turned flat against
          // the top row does not score a spin from box corners that lie above the well.
          const blocked = (dx, dy) => !(this.ceiling && p.y + dy >= this.h) && this.board.get(p.x + dx, p.y + dy) !== 0;
          let corners = 0;
          for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (blocked(dx, dy)) corners++;
          if (corners >= 3) {
            const front = T_FRONT[p.rot].filter(([dx, dy]) => blocked(dx, dy)).length;
            if (front === 2 || p.kick === 4) result.tspin = true;
            else result.mini = true;
          }
        }
        // Tucked under an overhang: a block right above one of its cells that is not its own.
        const mine = new Set(cells.map(([x, y]) => x + ',' + y));
        result.covered = cells.some(([x, y]) => !mine.has(x + ',' + (y + 1)) && y + 1 < this.h && this.board.get(x, y + 1) !== 0);
        this.board.placeCells(cells, v);
        result.placed = cells.length;
        this.hook('afterPlace', this.board, cells, v, result);
        if (p.special === 'patch') result.patched = true;
      }
      if (p.fromHold) result.fromHold = true;

      let rows = this.fullRows();
      if (p.special === 'laser') {
        // Every row the piece touches is vaporised, full or not (a row holding a cell no item removes is left).
        result.laser = Array.from(new Set(this.targets('laser', cells).map(([, cy]) => cy))).filter((y) => y >= 0 && y < this.h && !this.rowKept(y)).sort((a, b) => a - b);
        rows = Array.from(new Set(rows.concat(result.laser))).sort((a, b) => a - b);
      }
      this.clearInto(this.board, rows, result);
      this.score(result);
      this.s.pieces++;
      this.s.byType[p.type.family === 'tetromino' ? p.type.id : p.type.family] = (this.s.byType[p.type.family === 'tetromino' ? p.type.id : p.type.family] || 0) + 1;
      this.holdLocked = false;
      this.piece = null;
      this.stepOn(result);
      this.emit('lock', result);
      this.afterStep();
      return result;
    }

    /** The recipe's step after a piece lock; a part ending the board in it (end) is told after the lock. */
    stepOn(result) {
      if (!this.hooks.step) return;
      this.stepping = true;
      try { this.hook('step', result); } finally { this.stepping = false; }
    }
    /** After a lock's event: the next piece, or the end a part called for in its step ('topout', once the lock is out). */
    afterStep() {
      if (this.endDue) { this.endDue = false; this.emit('topout'); return; }
      if (!this.over) this.spawnNext();
    }

    /**
     * A part ends the board (Protect's wilt): over, with its own kind (game.endKind, kept in the save and by Free Play's
     * card: ctl.onEnd(kind)); 'topout' is emitted now, or, from a step, after the lock's own event. Undo and a reset
     * take it back.
     */
    end(kind) {
      this.over = true;
      this.endKind = kind ? String(kind) : null;
      if (this.stepping) this.endDue = true;
      else this.emit('topout');
      return true;
    }

    /** The rows that clear on a board: its full rows, as the recipe's parts decide (rows: Protect's bed never clears). */
    fullRows(board) {
      board = board || this.board;
      const rows = board.fullRows();
      return this.hooks.rows ? this.chain('rows', rows, (e, v) => e.rows(this, board, v)) : rows;
    }

    /**
     * Clears rows (a lock's, Settle's) into a result: rows, removed and lines, with the recipe's beforeClear and
     * afterClear around it (Jelly's cascades go on result.cascade). Rows holding a FOREIGN cell are plain.
     */
    clearInto(board, rows, result) {
      this.hook('beforeClear', board, result);
      result.rows = rows;
      // A part can take the rows away itself (clearRows: Jelly's bodies, where nothing comes down by itself).
      const own = this.hooks.clearRows ? this.ask('clearRows', board, rows, result) : null;
      result.removed = own || board.clearRows(rows);
      result.lines = rows.length;
      const foreign = result.removed.filter((row) => row.some((v) => v & CELL.FOREIGN)).length;
      if (foreign) { result.lines -= foreign; result.plain = (result.plain || 0) + foreign; }
      this.hook('afterClear', board, result);
      return result;
    }

    /** Does row y hold a cell no item removes? */
    rowKept(y) {
      if (!this.hooks.keep) return false;
      for (let x = 0; x < this.w; x++) if (this.kept(this.board.get(x, y))) return true;
      return false;
    }

    /** Is the board empty, as the recipe's parts see it (clean: Protect's sprout does not count)? */
    isClean(board) {
      board = board || this.board;
      if (this.hooks.clean) { const r = this.ask('clean', board); if (r !== null) return !!r; }
      return board.isEmpty();
    }

    /** Drill: bores the column under the bit down to the floor. */
    bore() {
      const p = this.piece;
      this.pushHistory();
      const [x, y] = this.cellsOf(p)[0];
      const result = { type: p.type.id, special: 'drill', cells: [], rows: [], removed: [], lines: 0, score: 0, drilled: [], bit: [x, y], placed: 0 };
      const bits = this.targets('bore', [[x, y]]);
      // More than one bit (the recipe's targets: Mirror's pair): each, for the view.
      if (bits.length > 1) result.bits = bits.map(([bx, by]) => [bx, by]);
      for (const [bx, by] of bits) {
        for (let yy = by; yy >= 0; yy--) {
          const old = this.board.get(bx, yy);
          if (!old) continue;
          // Down to a cell no item removes (Protect's sprout), and no further.
          if (this.kept(old)) break;
          result.drilled.push([bx, yy, old]); this.board.set(bx, yy, 0);
        }
      }
      // Rows the recipe fills after a drill (Jelly's cascades, in afterClear) clear and are scored, as plain rows; a
      // plain board's drill never fills one (nothing is scored, the combo is left as it was).
      if (this.ext.length) {
        this.clearInto(this.board, this.fullRows(), result);
        if (result.lines || (result.cascade && result.cascade.length)) this.score(result);
      }
      this.s.pieces++;
      this.holdLocked = false;
      this.piece = null;
      this.hook('afterChange', 'bore', result);
      this.stepOn(result);
      this.emit('lock', result);
      this.afterStep();
      return result;
    }

    /**
     * Points and streaks for a lock. Lines cleared by an item (a board item, or a piece carrying one — Golden aside)
     * are plain lines (result.plain): they add a clear's points and keep the combo going, but are never a quad or a
     * T-spin, so they never feed the back-to-back streak. Afterwards result.lines holds every line cleared.
     * A Safety Net (s.net) keeps the back-to-back streak through one clear that would have ended it.
     */
    score(result) {
      const s = this.s, R = this.rules;
      if (result.special && result.lines) { result.plain = (result.plain || 0) + result.lines; result.lines = 0; result.tspin = false; result.mini = false; }
      // n: rows the piece's own lock cleared with no FOREIGN cell; c: plain rows (an item's, a FOREIGN cell's, Jelly's
      // cascades), all in this one result. ownCells: removed cells that were not FOREIGN (a laser's empty ones too:
      // the row goes); own = ownCells / w, Standard-comparable rows: what pays and counts toward records.
      let ownCells = 0;
      const count = (rows) => { for (const row of rows || []) for (let i = 0; i < row.length; i++) if (!(row[i] & CELL.FOREIGN)) ownCells++; };
      count(result.removed);
      let cascade = 0;
      for (const wave of result.cascade || []) { cascade += (wave.rows || []).length; count(wave.removed); }
      if (cascade) result.plain = (result.plain || 0) + cascade;
      const n = result.lines, c = result.plain || 0, all = n + c;
      result.n = n; result.c = c; result.ownCells = ownCells; result.own = ownCells / this.w;
      // Rows a recipe's cascade cleared and nothing else (a piece whose own lock cleared none: Jelly's hanging part):
      // they count and keep the combo, but leave every streak as it was, neither adding to it nor ending it, and a
      // T-spin with no rows of its own is not made one by them. Never on a board without cascades.
      const still = !n && cascade > 0 && c === cascade && !result.special;
      if (still) { result.tspin = false; result.mini = false; }
      // An unrated board (shapes other than the seven: R.rated false) has no difficult clears: no quad, no streak, no
      // bonus (its T-spins still score their points).
      const rated = R.rated !== false;
      result.quad = rated && n >= R.quad && !result.special;
      let pts = 0;
      if (result.tspin) {
        pts = TSPIN_SCORE[Math.min(n, 3)];
        s.tspins++;
        if (n >= 3) s.tst = (s.tst || 0) + 1;
        s.tspinLines += n;
      } else if (result.mini) {
        pts = MINI_SCORE[Math.min(n, 2)];
      } else if (n) pts = CLEAR_SCORE[Math.min(n, CLEAR_SCORE.length - 1)];
      if (c) pts += CLEAR_SCORE[Math.min(c, CLEAR_SCORE.length - 1)];
      if (all) {
        s.combo++;
        const difficult = rated && (result.quad || result.tspin || result.mini);
        if (difficult) { s.b2b++; if (s.b2b > 0) { pts = Math.round(pts * 1.5); result.b2b = true; } }
        else if (still) { /* the streak is left as it was */ }
        else if (s.b2b >= 0 && s.net > 0) { s.net--; result.netSaved = s.b2b + 1; }
        else s.b2b = -1;
        if (s.combo > 0) pts += 50 * s.combo;
        s.clears[Math.min(all, 5)]++;
        if (this.isClean()) { result.perfect = true; s.perfect++; pts += 3000; }
        // Quads in a row: set by a piece (an item's lines are plain); any other clear ends it.
        if (result.quad) s.quadRun = (s.quadRun || 0) + 1;
        else if (!still) s.quadRun = 0;
      } else {
        s.combo = -1;
      }
      // By hand: a piece with no item on it, on a stack built without items (see freshStats). A board item's clear
      // (Settle) or an item piece's breaks every hand streak; so does any item used in between (noteItem).
      const hand = s.hand !== false && !result.special;
      result.hand = hand;
      if (!hand) { s.hb2b = -1; s.hcombo = -1; s.hquads = 0; }
      else if (all) {
        s.hcombo++;
        if (rated && (result.quad || result.tspin || result.mini)) s.hb2b++; else if (!still) s.hb2b = -1;
        s.hquads = result.quad ? (s.hquads || 0) + 1 : still ? s.hquads || 0 : 0;
        if (result.tspin) { s.htspins = (s.htspins || 0) + 1; if (n >= 3) s.htst = (s.htst || 0) + 1; }
        if (result.perfect) s.hperfect = (s.hperfect || 0) + 1;
      } else s.hcombo = -1;
      // An empty board is a fresh start: whatever came before, the next stack is built from nothing.
      if (result.perfect && !result.special) s.hand = true;
      s.hchain = (s.hb2b >= 0 ? s.hb2b + 1 : 0) + Math.max(0, s.hcombo);
      s.bestHChain = Math.max(s.bestHChain || 0, s.hchain);
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.maxB2B = Math.max(s.maxB2B, s.b2b);
      s.lines += all;
      s.own = (s.own || 0) + result.own;
      s.cells = (s.cells || 0) + (result.placed || 0);
      s.score += pts;
      result.lines = all;
      result.combo = Math.max(0, s.combo);
      result.score = pts;
    }

    // ---- by hand ------------------------------------------------------------------------------------------------------

    /**
     * An item that touches the pieces or the board was used (Free Play calls this; Luck items do not count): every
     * hand streak ends, and the stack is no longer built by hand — unless the item acted on the board at once
     * (emptied: a Board item — Settle, Trapdoor, Undo …) and left it empty, a fresh start.
     */
    noteItem(emptied) {
      const s = this.s;
      s.hand = !!emptied && this.isClean();
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
        // A Ghost piece or a drill bit can sit inside blocks; a piece that no longer passes through them cannot.
        const p = this.piece, next = Object.assign({}, p, { special });
        if (!this.passes(next) && !this.fitShape(p, p.rot, p.x, p.y)) { this.emit('blocked', 'replace'); return false; }
        this.piece.special = special;
        this.piece.entry = Object.assign({}, this.piece.entry, { special });
        this.emit('replace', this.piece);
        return true;
      }
      return false;
    }

    /**
     * A piece of `type` in turn `rot`, dropped straight down at column x from the top of `board` (the board in play by
     * default), set and cleared on a copy, with the recipe's hooks (placed, afterPlace, rows, the clear's) run on that
     * copy. Returns { board (after), n (own rows cleared), c (plain rows), placed (cells set), y, top, abs }, or null
     * when it does not fit at the top. The one way anything simulates a placement (Best Fit, a bot).
     */
    simulate(type, rot, x, board) {
      board = board || this.board;
      const p = { type, rot, x, y: 0, special: null, entry: { id: type.id, rot: 0 } };
      const top = board.h - 1 - type.rotBounds[rot].maxY;
      if (!this.fitShape(p, rot, x, top, board)) return null;
      let y = top;
      while (this.fitShape(p, rot, x, y - 1, board)) y--;
      const t = board.clone(), abs = this.absCells(p, rot, x, y, t), res = { cells: abs, placed: abs.length };
      t.placeCells(abs, type.color);
      this.hook('afterPlace', t, abs, type.color, res);
      this.clearInto(t, this.fullRows(t), res);
      let c = res.plain || 0;
      for (const wave of res.cascade || []) c += (wave.rows || []).length;
      return { board: t, n: res.lines, c, placed: res.placed, y, top, abs, res };
    }

    /**
     * Best Fit: of the pieces the board deals (dealer.candidates: the seven on a default board), in every turn and
     * column, the one that fits the stack best if dropped straight down — the most lines, then the fewest new holes,
     * then the lowest, then the flattest. The piece in play becomes it, over that spot (the ghost shows where it lands;
     * it can still be moved). Returns the spot, or null.
     */
    bestFit() {
      const p = this.piece;
      if (!p) return null;
      const b = this.board, W = this.w, H = this.h;
      const heights = (cells) => { const hs = []; for (let x = 0; x < W; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if (cells[y * W + x]) { t = y + 1; break; } hs.push(t); } return hs; };
      const holes = (cells) => { let n = 0; for (let x = 0; x < W; x++) { let roof = false; for (let y = H - 1; y >= 0; y--) { if (cells[y * W + x]) roof = true; else if (roof) n++; } } return n; };
      const holes0 = holes(b.cells);
      let best = null;
      for (const id of this.dealer.candidates(this)) {
        const type = Pieces.get(id), seen = new Set();
        if (!type) continue;
        for (let rot = 0; rot < 4; rot++) {
          const cells = type.rots[rot], key = Pieces.keyOf(cells);
          if (seen.has(key)) continue;
          seen.add(key);
          const bnd = type.rotBounds[rot];
          for (let x = -bnd.minX; x <= W - 1 - bnd.maxX; x++) {
            const sim = this.simulate(type, rot, x, b);
            if (!sim) continue;
            const t = sim.board, lines = sim.n + sim.c;
            const hs = heights(t.cells), bump = hs.slice(1).reduce((a, h, i) => a + Math.abs(h - hs[i]), 0);
            const cost = -lines * 1000 + (holes(t.cells) - holes0) * 60 + Math.max(...hs) * 4 + hs.reduce((a, h) => a + h, 0) * 0.5 + bump;
            if (!best || cost < best.cost) best = { cost, id, rot, x, y: sim.y, top: sim.top };
          }
        }
      }
      if (!best) return null;
      const next = { type: Pieces.get(best.id), rot: best.rot, x: best.x, y: best.top, special: null, entry: { id: best.id, rot: 0, tag: 'fit' }, lastRot: false };
      this.piece = next;
      this.emit('replace', next);
      return best;
    }

    /** Pick of Three: one of the next three pieces comes into play now; the piece in play takes its place in line. */
    pickFromQueue(i) {
      const p = this.piece, e = this.queue[i];
      if (!p || !e || i > 2) return false;
      const was = Object.assign({}, p.entry, { special: p.special || null });
      if (!this.replacePiece(Object.assign({}, e, { tag: 'pick' }))) return false;
      this.queue[i] = was;
      return true;
    }

    /**
     * Would the piece in play still fit once `change` has been made to the board? Tried and undone: the board is as it
     * was afterwards. (Blocks that come down could land in a piece tucked beside or under the stack.)
     */
    roomAfter(change) {
      const p = this.piece, before = this.board.snapshot();
      change();
      // Whatever the recipe does after such a change happens inside the test too (Jelly's cascades).
      this.hook('roomAfter', this.board);
      const ok = this.fitsAt(p, p.rot, p.x, p.y);
      this.board.restore(before);
      return ok;
    }

    /**
     * Settle: every column's blocks fall, then full rows clear (plain lines: see score). Refused (null) on an empty
     * board, or when a block would come down into the piece in play.
     */
    settle() {
      if (!this.piece || this.board.isEmpty()) return null;
      // Cells no item removes (the recipe's keep: Protect's sprout) stay put, and what is above them lands on them.
      const fixed = this.hooks.keep ? (v) => this.kept(v) : undefined;
      if (!this.roomAfter(() => { this.board.compact(fixed); this.board.clearRows(this.fullRows()); })) return null;
      this.pushHistory();
      const before = this.board.snapshot(), had = this.board.count();
      this.board.compact(fixed);
      const result = { type: 'settle', special: 'settle', cells: [], rows: [], removed: [], lines: 0, score: 0, before, had, placed: 0 };
      this.clearInto(this.board, this.fullRows(), result);
      this.score(result);
      this.hook('afterChange', 'settle', result);
      this.emit('lock', result);
      return result;
    }

    /**
     * Tornado: the columns are shuffled — each column, holes and all, lands somewhere else. Every row keeps as many
     * blocks as it had, so no row fills: it rearranges, it never clears. Refused on an empty board, or when the piece
     * in play would have no room.
     */
    tornado() {
      const p = this.piece;
      if (!p || this.board.isEmpty()) return null;
      const before = this.board.snapshot(), W = this.w;
      let order = this.rng.shuffle([...Array(W).keys()]);
      if (order.every((c, i) => c === i)) order.push(order.shift());
      // The recipe's parts can rearrange it (columns: Mirror shuffles the left half and mirrors it on the right).
      if (this.hooks.columns) {
        const asked = this.chain('columns', order, (e, v) => e.columns(this, this.board, 'tornado', v.slice()));
        // Only an order of every column once (anything else is ignored).
        if (Array.isArray(asked) && asked.length === W && new Set(asked).size === W && asked.every((c) => Number.isInteger(c) && c >= 0 && c < W)) order = asked;
      }
      this.pushHistory();
      const moves = [];
      for (let x = 0; x < W; x++) {
        const from = order[x];
        for (let y = 0; y < this.h; y++) { const v = before[y * W + from]; this.board.cells[y * W + x] = v; if (v) moves.push([from, y, x, y, v]); }
      }
      if (!this.fitsAt(p, p.rot, p.x, p.y)) { this.board.restore(before); this.history.pop(); return null; }
      this.hook('afterChange', 'tornado', { moves, order });
      this.emit('tornado', moves);
      return moves;
    }

    /**
     * Trapdoor: the bottom row falls away, whatever it holds; everything above comes down one. Pays nothing. Refused
     * (null) when the bottom row is empty, or when a block would come down into the piece in play.
     */
    trapdoor() {
      if (!this.piece) return null;
      let any = false;
      for (let x = 0; x < this.w; x++) if (this.board.get(x, 0)) any = true;
      if (!any) return null;
      if (!this.roomAfter(() => this.board.clearRows([0]))) return null;
      this.pushHistory();
      const row = this.board.clearRows([0])[0];
      this.hook('afterChange', 'trapdoor', { row });
      this.emit('trapdoor', row);
      return row;
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
      this.hook('afterChange', 'flip', { moves });
      this.emit('flip', moves);
      return moves;
    }

    resetBoard() {
      this.board.cells.fill(0);
      this.over = false;
      this.endKind = null;
      this.endDue = false;
      this.history = [];
      this.hold = null;
      this.holdLocked = false;
      this.s = freshStats();
      this.hook('reset');
      if (!this.piece || !this.fitsAt(this.piece, this.piece.rot, this.piece.x, this.piece.y)) {
        const e = this.piece ? this.piece.entry : this.queue.shift();
        this.fillQueue();
        this.spawn(e);
      }
      this.emit('reset');
    }

    // ---- pieces given and taken (Battle's Send) ----------------------------------------------------------------------

    /**
     * Puts a piece at the front of the queue: { id, received } entries go first, in the order they came (first in,
     * first out among received pieces). A received piece cannot be held or taken again.
     */
    inject(id, o) {
      const entry = Object.assign({ id, rot: 0 }, o && o.received ? { received: true } : null);
      let i = 0;
      if (entry.received) while (i < this.queue.length && this.queue[i].received) i++;
      this.queue.splice(i, 0, entry);
      this.emit('inject', entry);
      return entry;
    }

    /**
     * Takes the piece in play away (its entry, special and all); the next one comes in. Refused (null, nothing
     * changed) with no piece, a received one, or no room for the next (as a hold swap is: the same snapshot, rolled back).
     */
    takeCurrent() {
      const p = this.piece;
      if (!p || this.over || (p.entry && p.entry.received)) return null;
      const cur = Object.assign({}, p.entry, { special: p.special || null });
      const keep = { hold: this.hold, holdLocked: this.holdLocked, queue: this.queue.map((e) => Object.assign({}, e)), bag: this.bag.slice(), rng: this.rng.state() };
      if (!this.spawnNext({ soft: true, from: this.absCells(p) })) {
        Object.assign(this, { piece: p, hold: keep.hold, holdLocked: keep.holdLocked, queue: keep.queue, bag: keep.bag, rng: RNG.from(keep.rng) });
        this.emit('noroom', 'take');
        return null;
      }
      this.emit('take', cur);
      return cur;
    }

    /** Takes the first piece of the queue away (never a received one); the queue fills up behind it. Returns its entry, or null. */
    takeNext() {
      const e = this.queue[0];
      if (!e || e.received || this.fixed) return null;
      this.queue.shift();
      this.fillQueue();
      this.emit('take', e);
      return e;
    }

    toJSON() {
      const p = this.piece;
      const out = {
        w: this.w, h: this.h, wrap: this.board.wrap, cells: this.board.toArray(), fixed: this.fixed,
        queue: this.queue, bag: this.bag, rng: this.rng.state(), hold: this.hold, holdLocked: this.holdLocked, s: this.s,
        piece: p ? Object.assign({ entry: Object.assign({}, p.entry, { special: p.special || null }), rot: p.rot, x: p.x, y: p.y },
          p.lastRot ? { lastRot: true } : null, p.kick != null ? { kick: p.kick } : null, p.fromHold ? { fromHold: true } : null) : null,
      };
      // A Relaxed board keeps its recipe, and each part's own state (x); Classic and Puzzles have neither.
      if (this.recipe) {
        out.recipe = this.recipe;
        out.x = {};
        for (const e of this.hooks.save || []) out.x[e.key] = e.save(this);
        // Ended by a part (end): it comes back ended.
        if (this.over && this.endKind) out.ended = this.endKind;
      }
      return out;
    }
  }

  /** The last n hand pieces: { ms, lines } between the lock before them and the last one; null if there are not n. */
  function paceOf(s, n) {
    const p = (s && s.pace) || [];
    if (p.length < n + 1) return null;
    const a = p[p.length - 1 - n], b = p[p.length - 1];
    return { ms: b[0] - a[0], lines: b[1] - a[1] };
  }

  Object.assign(L, { Game, freshStats, paceOf, spawnPos, BOMB_PATTERN, SINGLE_SPECIALS: SINGLE, BAG_DEALER });
})(typeof globalThis !== 'undefined' ? globalThis : this);
