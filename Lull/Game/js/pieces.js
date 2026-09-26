// Lull — piece shapes: the seven SRS tetrominoes, pentominoes and friends, big (2×) pieces, custom shapes,
// and polyomino tools the factory uses to tell a legal product from a defective one.
// Coordinates are y-up: row 0 is the floor.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});

  // Colour slots shared by every palette: 1–7 tetrominoes, 8 garbage, 9–14 other shapes, 15 custom.
  const COLOR = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7, GARBAGE: 8, CUSTOM: 15 };

  // ---- rotation --------------------------------------------------------------------------------------------------

  /** Rotates cells clockwise inside an n×n box (y-up): (x, y) → (y, n−1−x). */
  function rotateCW(cells, n) { return cells.map(([x, y]) => [y, n - 1 - x]); }

  function boundsOf(cells) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of cells) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  // ---- SRS kick tables (y-up), keyed "from>to" ------------------------------------------------------------------------

  const KICKS_JLSTZ = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  };
  const KICKS_I = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  };
  const KICKS_180 = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]];
  const KICKS_GENERIC = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [-1, 1], [1, 1]];
  const KICKS_BIG = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [0, -2], [-1, -1], [1, -1], [-2, -2], [2, -2], [0, 1], [-3, 0], [3, 0], [0, 2]];

  function kicksFor(type, from, to) {
    if (type.kicks === 'none') return [[0, 0]];
    if ((to - from + 4) % 4 === 2) return type.kicks === 'big' ? KICKS_BIG : KICKS_180;
    if (type.kicks === 'jlstz') return KICKS_JLSTZ[from + '>' + to];
    if (type.kicks === 'i') return KICKS_I[from + '>' + to];
    if (type.kicks === 'big') return KICKS_BIG;
    return KICKS_GENERIC;
  }

  // ---- piece types --------------------------------------------------------------------------------------------------

  const TYPES = {};

  /**
   * Builds a piece type from cells placed in an n×n box. The four rotations turn about the box centre, which for the
   * seven tetrominoes is exactly SRS.
   */
  function defineType(id, cells, opts) {
    opts = opts || {};
    let n = opts.n;
    if (!n) {
      // Normalise and centre the shape in a square box.
      const b = boundsOf(cells);
      n = Math.max(b.w, b.h);
      const ox = Math.floor((n - b.w) / 2) - b.minX, oy = Math.floor((n - b.h) / 2) - b.minY;
      cells = cells.map(([x, y]) => [x + ox, y + oy]);
    }
    const rots = [cells];
    for (let r = 1; r < 4; r++) rots.push(rotateCW(rots[r - 1], n));
    const type = {
      id,
      name: opts.name || id,
      n,
      rots,
      size: cells.length,
      color: opts.color || COLOR.CUSTOM,
      kicks: opts.kicks || 'generic',
      family: opts.family || 'custom',
      big: !!opts.big,
    };
    // For each rotation, the offset that makes it coincide with another rotation's cells (S/Z/I have two shapes,
    // O has one): used to recognise the same final placement reached in a different rotation state.
    type.keys = rots.map((c) => shapeKey(c));
    type.rotBounds = rots.map((c) => boundsOf(c));
    return type;
  }

  function shapeKey(cells) {
    const b = boundsOf(cells);
    return cells.map(([x, y]) => (x - b.minX) + ',' + (y - b.minY)).sort().join(';');
  }

  function add(id, cells, opts) { TYPES[id] = defineType(id, cells, opts); return TYPES[id]; }

  // The seven, in SRS spawn orientation.
  add('I', [[0, 2], [1, 2], [2, 2], [3, 2]], { n: 4, color: COLOR.I, kicks: 'i', family: 'tetromino' });
  add('O', [[0, 0], [1, 0], [0, 1], [1, 1]], { n: 2, color: COLOR.O, kicks: 'none', family: 'tetromino' });
  add('T', [[1, 2], [0, 1], [1, 1], [2, 1]], { n: 3, color: COLOR.T, kicks: 'jlstz', family: 'tetromino' });
  add('S', [[1, 2], [2, 2], [0, 1], [1, 1]], { n: 3, color: COLOR.S, kicks: 'jlstz', family: 'tetromino' });
  add('Z', [[0, 2], [1, 2], [1, 1], [2, 1]], { n: 3, color: COLOR.Z, kicks: 'jlstz', family: 'tetromino' });
  add('J', [[0, 2], [0, 1], [1, 1], [2, 1]], { n: 3, color: COLOR.J, kicks: 'jlstz', family: 'tetromino' });
  add('L', [[2, 2], [0, 1], [1, 1], [2, 1]], { n: 3, color: COLOR.L, kicks: 'jlstz', family: 'tetromino' });
  const TETROMINOES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  // Small pieces.
  add('M1', [[0, 0]], { n: 1, color: 13, kicks: 'none', family: 'small', name: 'Mono' });
  add('D2', [[0, 1], [1, 1]], { n: 2, color: 12, family: 'small', name: 'Domino' });
  add('I3', [[0, 1], [1, 1], [2, 1]], { n: 3, color: 9, family: 'small', name: 'I-tromino' });
  add('V3', [[0, 1], [0, 0], [1, 0]], { n: 2, color: 10, family: 'small', name: 'V-tromino' });

  // The twelve pentominoes (plus the mirror images of the chiral ones a player would expect).
  const PENTO = {
    F: [[1, 2], [2, 2], [0, 1], [1, 1], [1, 0]],
    P: [[0, 2], [1, 2], [0, 1], [1, 1], [0, 0]],
    U: [[0, 1], [2, 1], [0, 0], [1, 0], [2, 0]],
    V5: [[0, 2], [0, 1], [0, 0], [1, 0], [2, 0]],
    W: [[0, 2], [0, 1], [1, 1], [1, 0], [2, 0]],
    X: [[1, 2], [0, 1], [1, 1], [2, 1], [1, 0]],
    Y: [[1, 2], [0, 1], [1, 1], [2, 1], [3, 1]],
    N: [[0, 1], [1, 1], [1, 0], [2, 0], [3, 0]],
    T5: [[0, 2], [1, 2], [2, 2], [1, 1], [1, 0]],
    Z5: [[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]],
    L5: [[0, 1], [0, 0], [1, 0], [2, 0], [3, 0]],
    I5: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  };
  const PENTOMINOES = Object.keys(PENTO);
  PENTOMINOES.forEach((id, i) => add(id, PENTO[id], { color: 9 + (i % 6), family: 'pentomino', name: id.replace(/\d/, '') + '-pento' }));

  /** A 2× scaled copy of a type: every cell becomes a 2×2 block (TGM's big mode). */
  function bigOf(id) {
    const key = 'B' + id;
    if (TYPES[key]) return TYPES[key];
    const base = TYPES[id];
    const cells = [];
    for (const [x, y] of base.rots[0]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells.push([2 * x + dx, 2 * y + dy]);
    return add(key, cells, { n: base.n * 2, color: base.color, kicks: base.kicks === 'none' ? 'none' : 'big', family: 'big', big: true, name: 'Big ' + base.name });
  }

  /** A player-drawn shape (Blueprint item) or a mirrored piece. Registered under a key derived from its cells. */
  function customType(cells, opts) {
    opts = opts || {};
    const b = boundsOf(cells);
    const norm = cells.map(([x, y]) => [x - b.minX, y - b.minY]);
    const key = (opts.prefix || 'C') + ':' + shapeKey(norm);
    if (TYPES[key]) return TYPES[key];
    return add(key, norm, { color: opts.color || COLOR.CUSTOM, family: 'custom', name: opts.name || 'Custom', kicks: norm.length === 1 ? 'none' : 'generic' });
  }

  const MIRROR = { I: 'I', O: 'O', T: 'T', S: 'Z', Z: 'S', J: 'L', L: 'J' };

  /** The mirror image of a type (J↔L, S↔Z; any other shape is reflected). */
  function mirrorOf(type) {
    if (MIRROR[type.id]) return TYPES[MIRROR[type.id]];
    const cells = type.rots[0].map(([x, y]) => [-x, y]);
    return customType(cells, { prefix: 'M', color: type.color, name: type.name + ' (mirror)' });
  }

  function get(id) {
    if (TYPES[id]) return TYPES[id];
    if (id && id[0] === 'B' && TYPES[id.slice(1)]) return bigOf(id.slice(1));
    const m = /^([CM]):(.+)$/.exec(id || '');
    if (m) {
      const cells = m[2].split(';').map((p) => p.split(',').map(Number));
      return customType(cells, { prefix: m[1] });
    }
    return null;
  }

  // ---- polyomino tools (the factory's quality control) ----------------------------------------------------------------

  function normalize(cells) {
    const b = boundsOf(cells);
    return cells.map(([x, y]) => [x - b.minX, y - b.minY]).sort((a, c) => a[1] - c[1] || a[0] - c[0]);
  }
  function keyOf(cells) { return normalize(cells).map((c) => c.join(',')).join(';'); }

  /** The canonical key among the eight rotations and reflections: two free polyominoes are the same iff equal. */
  function freeKey(cells) {
    let best = null;
    let cur = cells;
    for (let m = 0; m < 2; m++) {
      for (let r = 0; r < 4; r++) {
        const k = keyOf(cur);
        if (best === null || k < best) best = k;
        cur = cur.map(([x, y]) => [y, -x]);
      }
      cur = cur.map(([x, y]) => [-x, y]);
    }
    return best;
  }

  function isConnected(cells) {
    if (!cells.length) return false;
    const set = new Set(cells.map((c) => c.join(',')));
    const seen = new Set([cells[0].join(',')]);
    const stack = [cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
      }
    }
    return seen.size === set.size;
  }

  const freeCache = { 1: [[[0, 0]]] };
  /** All free polyominoes of n cells (1, 1, 2, 5, 12, 35, 108, 369 … for n = 1…8). */
  function freePolyominoes(n) {
    if (freeCache[n]) return freeCache[n];
    const prev = freePolyominoes(n - 1);
    const seen = new Map();
    for (const p of prev) {
      const set = new Set(p.map((c) => c.join(',')));
      for (const [x, y] of p) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (x + dx) + ',' + (y + dy);
          if (set.has(k)) continue;
          const cells = p.concat([[x + dx, y + dy]]);
          const fk = freeKey(cells);
          if (!seen.has(fk)) seen.set(fk, normalize(cells));
        }
      }
    }
    freeCache[n] = Array.from(seen.keys()).sort().map((k) => seen.get(k));
    return freeCache[n];
  }

  /** Why a shape is not a legal n-omino, or null when it is. */
  function defectOf(cells, n) {
    if (cells.length > n) return 'overweight';
    if (cells.length < n) return 'underweight';
    if (!isConnected(cells)) return 'disconnected';
    return null;
  }

  Object.assign(L, {
    Pieces: {
      COLOR, TYPES, TETROMINOES, PENTOMINOES, MIRROR,
      get, bigOf, customType, mirrorOf, defineType, kicksFor, rotateCW, boundsOf, shapeKey,
      normalize, keyOf, freeKey, isConnected, freePolyominoes, defectOf,
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
