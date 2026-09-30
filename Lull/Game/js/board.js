// Lull — the playfield: a w×h grid of cells, y-up, with optional wraparound walls.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // A cell is 16 bits. One table, owned here: features use the names, never the numbers.
  //   COLOR    0–31   colour slot (0 = empty; 31 is the sprout's green, drawn only in thumbnails)
  //   GEM      32     a puzzle's gem
  //   HIDDEN   64     set while invisible (Vanishing)
  //   FOREIGN  128    never placed by the player: it never pays, and a row holding one is plain (js/engine.js, score)
  //   JOIN_R   256    Jelly: joined to the cell on its right
  //   JOIN_U   512    Jelly: joined to the cell above
  //   ASSET    1024   Protect's sprout (also a Jelly anchor)
  //   MOLE     2048   Protect: a mole, its slot in MOLE_SLOT (bits 12–13, SLOT_SHIFT)
  //   FILL     16384  Battle's gap filler (always with FOREIGN)
  //   WALL     32768  what get() returns outside the board; never stored
  // Anything that reads a colour masks with COLOR.
  const CELL = Object.freeze({ COLOR: 31, GEM: 32, HIDDEN: 64, FOREIGN: 128, JOIN_R: 256, JOIN_U: 512, ASSET: 1024, MOLE: 2048, MOLE_SLOT: 4096 | 8192, SLOT_SHIFT: 12, FILL: 16384, WALL: 32768, SPROUT: 31 });

  class Board {
    constructor(w, h, opts) {
      this.w = w;
      this.h = h;
      this.wrap = !!(opts && opts.wrap);
      this.cells = new Uint16Array(w * h);
    }

    wx(x) { return this.wrap ? ((x % this.w) + this.w) % this.w : x; }
    inside(x, y) { return y >= 0 && y < this.h && (this.wrap || (x >= 0 && x < this.w)); }
    /** The cell at (x, y); outside the board, CELL.WALL (solid, and no stored flag). */
    get(x, y) {
      if (!this.inside(x, y)) return CELL.WALL;
      return this.cells[y * this.w + this.wx(x)];
    }
    set(x, y, v) { if (this.inside(x, y)) this.cells[y * this.w + this.wx(x)] = v; }
    filled(x, y) { return this.get(x, y) !== 0; }

    /** True when every cell of the shape at (px, py) is inside and empty. */
    fits(cells, px, py) {
      const w = this.w, h = this.h, c = this.cells, wrap = this.wrap;
      for (let i = 0; i < cells.length; i++) {
        let x = px + cells[i][0];
        const y = py + cells[i][1];
        if (y < 0 || y >= h) return false;
        if (wrap) x = ((x % w) + w) % w;
        else if (x < 0 || x >= w) return false;
        if (c[y * w + x]) return false;
      }
      return true;
    }

    /** fits, for cells already placed on the board ([[x, y]], absolute; wrapped by the caller). */
    fitsAbs(abs) {
      const w = this.w, h = this.h, c = this.cells, wrap = this.wrap;
      for (let i = 0; i < abs.length; i++) {
        let x = abs[i][0];
        const y = abs[i][1];
        if (y < 0 || y >= h) return false;
        if (wrap) x = ((x % w) + w) % w;
        else if (x < 0 || x >= w) return false;
        if (c[y * w + x]) return false;
      }
      return true;
    }

    /** inBounds, for absolute cells. */
    inBoundsAbs(abs) {
      for (let i = 0; i < abs.length; i++) {
        const x = abs[i][0], y = abs[i][1];
        if (y < 0 || y >= this.h) return false;
        if (!this.wrap && (x < 0 || x >= this.w)) return false;
      }
      return true;
    }

    /** Inside the walls, ignoring blocks (a phasing piece). */
    inBounds(cells, px, py) {
      for (let i = 0; i < cells.length; i++) {
        const x = px + cells[i][0], y = py + cells[i][1];
        if (y < 0 || y >= this.h) return false;
        if (!this.wrap && (x < 0 || x >= this.w)) return false;
      }
      return true;
    }

    place(cells, px, py, v) {
      for (const [cx, cy] of cells) this.set(px + cx, py + cy, v);
    }

    /** Sets absolute cells to v (a piece as the engine places it: js/engine.js, absCells). */
    placeCells(abs, v) {
      for (let i = 0; i < abs.length; i++) this.set(abs[i][0], abs[i][1], v);
    }

    rowFull(y) {
      const o = y * this.w;
      for (let x = 0; x < this.w; x++) if (!this.cells[o + x]) return false;
      return true;
    }

    fullRows() {
      const rows = [];
      for (let y = 0; y < this.h; y++) if (this.rowFull(y)) rows.push(y);
      return rows;
    }

    /**
     * Removes rows (ascending y) and lets everything above come down; returns the removed rows' cells. A Jelly link up
     * into a removed row (JOIN_U on the row under it) goes with it.
     */
    clearRows(rows) {
      if (!rows.length) return [];
      const removed = rows.map((y) => Array.from(this.cells.subarray(y * this.w, (y + 1) * this.w)));
      const drop = new Set(rows);
      for (const y of rows) {
        if (y < 1 || drop.has(y - 1)) continue;
        const o = (y - 1) * this.w;
        for (let x = 0; x < this.w; x++) if (this.cells[o + x] & CELL.JOIN_U) this.cells[o + x] &= ~CELL.JOIN_U;
      }
      let dst = 0;
      for (let y = 0; y < this.h; y++) {
        if (drop.has(y)) continue;
        if (dst !== y) this.cells.copyWithin(dst * this.w, y * this.w, (y + 1) * this.w);
        dst++;
      }
      this.cells.fill(0, dst * this.w);
      return removed;
    }

    /**
     * Every column's blocks fall to the floor, closing all holes. fixed(v), if given, marks cells that never move: they
     * stay where they are, and what is above them falls onto them. Jelly links: a run of blocks in a column comes down
     * together, so a link up stays only while the two still touch; a link across stays only when both blocks end in the
     * same row.
     */
    compact(fixed) {
      const w = this.w, h = this.h, c = this.cells;
      let links = false;
      for (let i = 0; i < c.length; i++) if (c[i] & (CELL.JOIN_R | CELL.JOIN_U)) { links = true; break; }
      // Where each block lands (its row), for the links; only on a board that has any.
      const to = links ? new Int16Array(c.length).fill(-1) : null;
      if (links) {
        for (let x = 0; x < w; x++) {
          let dst = 0;
          for (let y = 0; y < h; y++) {
            const v = c[y * w + x];
            if (!v) continue;
            if (fixed && fixed(v)) { to[y * w + x] = y; dst = y + 1; continue; }
            to[y * w + x] = dst++;
          }
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x, v = c[i];
          if (!(v & (CELL.JOIN_R | CELL.JOIN_U))) continue;
          let nv = v;
          if (v & CELL.JOIN_R && (x + 1 >= w || to[i + 1] !== to[i])) nv &= ~CELL.JOIN_R;
          if (v & CELL.JOIN_U && (y + 1 >= h || to[i + w] !== to[i] + 1)) nv &= ~CELL.JOIN_U;
          c[i] = nv;
        }
      }
      for (let x = 0; x < w; x++) {
        let dst = 0;
        for (let y = 0; y < h; y++) {
          const v = c[y * w + x];
          if (!v) continue;
          if (fixed && fixed(v)) { dst = y + 1; continue; }
          if (dst !== y) { c[dst * w + x] = v; c[y * w + x] = 0; }
          dst++;
        }
      }
    }

    /**
     * Jelly: drops every link that no longer joins two blocks (one to an empty cell, past an edge, to or from a cell
     * the player never placed, or the sprout). Returns how many were dropped.
     */
    fixJoins() {
      const w = this.w, h = this.h, c = this.cells, solo = CELL.FOREIGN | CELL.ASSET;
      let n = 0;
      for (let i = 0; i < c.length; i++) {
        const v = c[i];
        if (!(v & (CELL.JOIN_R | CELL.JOIN_U))) continue;
        const x = i % w, y = (i - x) / w;
        let nv = v;
        if (v & solo) nv &= ~(CELL.JOIN_R | CELL.JOIN_U);
        if (nv & CELL.JOIN_R && (x + 1 >= w || !c[i + 1] || c[i + 1] & solo)) nv &= ~CELL.JOIN_R;
        if (nv & CELL.JOIN_U && (y + 1 >= h || !c[i + w] || c[i + w] & solo)) nv &= ~CELL.JOIN_U;
        if (nv !== v) { c[i] = nv; n++; }
      }
      return n;
    }

    count(pred) {
      let n = 0;
      for (let i = 0; i < this.cells.length; i++) if (this.cells[i] && (!pred || pred(this.cells[i]))) n++;
      return n;
    }
    isEmpty() { for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) return false; return true; }

    /** Height of the stack: the first empty row above the highest block. */
    stackHeight() {
      for (let y = this.h - 1; y >= 0; y--) {
        const o = y * this.w;
        for (let x = 0; x < this.w; x++) if (this.cells[o + x]) return y + 1;
      }
      return 0;
    }

    clone() {
      const b = new Board(this.w, this.h, { wrap: this.wrap });
      b.cells.set(this.cells);
      return b;
    }
    snapshot() { return this.cells.slice(); }
    restore(cells) { this.cells.set(cells); }
    toArray() { return Array.from(this.cells); }
    static fromArray(w, h, arr, opts) {
      const b = new Board(w, h, opts);
      if (arr) b.cells.set(arr.slice(0, w * h));
      return b;
    }
  }

  Object.assign(L, { Board, CELL });
})(typeof globalThis !== 'undefined' ? globalThis : this);
