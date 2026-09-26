// Lull — the playfield: a w×h grid of cells, y-up, with optional wraparound walls.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // A cell is one byte: bits 0–4 colour slot (0 = empty), bit 5 gem, bit 6 hidden (vanishing modifier).
  const CELL = { COLOR: 31, GEM: 32, HIDDEN: 64 };

  class Board {
    constructor(w, h, opts) {
      this.w = w;
      this.h = h;
      this.wrap = !!(opts && opts.wrap);
      this.cells = new Uint8Array(w * h);
    }

    wx(x) { return this.wrap ? ((x % this.w) + this.w) % this.w : x; }
    inside(x, y) { return y >= 0 && y < this.h && (this.wrap || (x >= 0 && x < this.w)); }
    get(x, y) {
      if (!this.inside(x, y)) return 255;
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

    /** Removes rows (ascending y) and lets everything above come down; returns the removed rows' cells. */
    clearRows(rows) {
      if (!rows.length) return [];
      const removed = rows.map((y) => Array.from(this.cells.subarray(y * this.w, (y + 1) * this.w)));
      const drop = new Set(rows);
      let dst = 0;
      for (let y = 0; y < this.h; y++) {
        if (drop.has(y)) continue;
        if (dst !== y) this.cells.copyWithin(dst * this.w, y * this.w, (y + 1) * this.w);
        dst++;
      }
      this.cells.fill(0, dst * this.w);
      return removed;
    }

    /** Every column's blocks fall to the floor, closing all holes. */
    compact() {
      for (let x = 0; x < this.w; x++) {
        let dst = 0;
        for (let y = 0; y < this.h; y++) {
          const v = this.cells[y * this.w + x];
          if (v) {
            if (dst !== y) { this.cells[dst * this.w + x] = v; this.cells[y * this.w + x] = 0; }
            dst++;
          }
        }
      }
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
