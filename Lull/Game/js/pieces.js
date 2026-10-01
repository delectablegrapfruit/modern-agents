// Lull — piece shapes: the seven SRS tetrominoes, pentominoes and friends, big (2×) pieces, custom shapes,
// and polyomino tools that enumerate the shapes the factory presses.
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

  // Types made on demand, by id (see LRU below).
  const MADE = new Map();
  let tracking = false;
  function add(id, cells, opts) { TYPES[id] = defineType(id, cells, opts); if (tracking) made(id); return TYPES[id]; }

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
  // The mirror images of the six chiral ones (the board recipe's shapes deal all eighteen one-sided pentominoes, as J and
  // L are both dealt): each its base's colour, and a pair for mirrorOf. PENTOMINOES stays the twelve; PENTO18
  // (below) is all eighteen, which the Relaxed shapes and the puzzles' Odd Shapes deal.
  const CHIRAL5 = ['F', 'P', 'N', 'Y', 'Z5', 'L5'];
  for (const id of CHIRAL5) {
    const base = TYPES[id];
    add(id + 'm', base.rots[0].map(([x, y]) => [base.n - 1 - x, y]), { n: base.n, color: base.color, family: 'pentomino', name: base.name + ' (mirror)' });
  }
  /** The eighteen one-sided pentominoes: the twelve and the six mirror images. */
  const PENTO18 = PENTOMINOES.concat(CHIRAL5.map((id) => id + 'm'));

  /** A 2× scaled copy of a type: every cell becomes a 2×2 block (TGM's big mode). Any type that get() knows can be doubled. */
  function bigOf(id) {
    const key = 'B' + id;
    if (TYPES[key]) return TYPES[key];
    const base = get(id);
    if (!base) return null;
    const cells = [];
    for (const [x, y] of base.rots[0]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) cells.push([2 * x + dx, 2 * y + dy]);
    return add(key, cells, { n: base.n * 2, color: base.color, kicks: base.kicks === 'none' ? 'none' : 'big', family: 'big', big: true, name: 'Big ' + base.name });
  }

  /**
   * A player-drawn shape (Blueprint item), a mirrored piece or a board recipe's shape. Registered under a key derived
   * from its cells: opts { prefix ('C'), color, family ('custom'), name }.
   */
  function customType(cells, opts) {
    opts = opts || {};
    const b = boundsOf(cells);
    const norm = cells.map(([x, y]) => [x - b.minX, y - b.minY]);
    const key = (opts.prefix || 'C') + ':' + shapeKey(norm);
    if (TYPES[key]) return TYPES[key];
    return add(key, norm, { color: opts.color || COLOR.CUSTOM, family: opts.family || 'custom', name: opts.name || 'Custom', kicks: norm.length === 1 ? 'none' : 'generic' });
  }

  // ---- the board recipe's shapes: polyominoes of any size ('P:') and clusters ('K:') ------------------------------------
  //
  // A shape the board recipe deals (js/shapes.js) is named by its cells in its canonical turn (of its four turns, the
  // one whose key sorts first), so a shape has one id however it was found, and its colour (one of the other shapes'
  // slots, 9-14, by that key: slot 15 stays for Blueprint) survives a reload. 'P:' is a polyomino (its blocks joined by
  // their sides, no sealed hole), family '<n> blocks'; 'K:' a cluster (joined by sides or corners), family 'cluster'.

  /** The key of cells in their canonical turn: the least of the four turns' keys. */
  function canonKey(cells) {
    let best = null, cur = cells;
    for (let r = 0; r < 4; r++) {
      const k = shapeKey(cur);
      if (best === null || k < best) best = k;
      cur = cur.map(([x, y]) => [y, -x]);
    }
    return best;
  }
  const cellsOf = (key) => key.split(';').map((p) => p.split(',').map(Number));
  /** Cells from a key, or null: whole numbers 0-23, each cell once, 1 to 48 of them. */
  function parseKey(key) {
    if (typeof key !== 'string' || !/^\d{1,2},\d{1,2}(;\d{1,2},\d{1,2}){0,47}$/.test(key)) return null;
    const cells = cellsOf(key);
    if (cells.some(([x, y]) => x > 23 || y > 23) || new Set(cells.map((c) => c.join(','))).size !== cells.length) return null;
    return cells;
  }
  /** Joined through corners too. */
  function isLinked(cells) {
    if (!cells.length) return false;
    const set = new Set(cells.map((c) => c.join(','))), seen = new Set([cells[0].join(',')]), stack = [cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = (x + dx) + ',' + (y + dy);
        if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
      }
    }
    return seen.size === set.size;
  }
  /** Whether cells enclose an empty cell (one no path through the sides of empty cells leads out of). */
  function hasHole(cells) {
    const b = boundsOf(cells), w = b.w + 2, hh = b.h + 2, g = new Uint8Array(w * hh);
    for (const [x, y] of cells) g[(y - b.minY + 1) * w + (x - b.minX + 1)] = 1;
    const st = [0]; g[0] = 2; let reached = 1;
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0 && !g[i - 1]) { g[i - 1] = 2; reached++; st.push(i - 1); }
      if (x < w - 1 && !g[i + 1]) { g[i + 1] = 2; reached++; st.push(i + 1); }
      if (y > 0 && !g[i - w]) { g[i - w] = 2; reached++; st.push(i - w); }
      if (y < hh - 1 && !g[i + w]) { g[i + w] = 2; reached++; st.push(i + w); }
    }
    return reached + cells.length < w * hh;
  }
  const SIZE_NAMES = ['', '1 block'].concat(Array.from({ length: 11 }, (_, i) => (i + 2) + ' blocks'));
  /** A polyomino of the board recipe's shapes by its cells (any turn): 'P:' + its canonical key. */
  function polyType(cells) {
    const key = canonKey(cells.map(([x, y]) => [x, y]));
    const id = 'P:' + key;
    if (TYPES[id]) return TYPES[id];
    const t = customType(cellsOf(key), { prefix: 'P', color: hashColor(key), family: SIZE_NAMES[cells.length] || cells.length + ' blocks', name: SIZE_NAMES[cells.length] || 'Shape' });
    return t;
  }
  /** A cluster by its cells (any turn): 'K:' + its canonical key. */
  function clusterType(cells) {
    const key = canonKey(cells.map(([x, y]) => [x, y]));
    const id = 'K:' + key;
    if (TYPES[id]) return TYPES[id];
    return customType(cellsOf(key), { prefix: 'K', color: hashColor(key), family: 'cluster', name: 'Cluster' });
  }

  const MIRROR = { I: 'I', O: 'O', T: 'T', S: 'Z', Z: 'S', J: 'L', L: 'J' };
  for (const id of CHIRAL5) { MIRROR[id] = id + 'm'; MIRROR[id + 'm'] = id; }

  /**
   * The mirror image of a type (J and L, S and Z, a pentomino and its mirror; a board recipe's shape is another of its
   * kind, 'P:' or 'K:'; any other shape is reflected).
   */
  function mirrorOf(type) {
    if (MIRROR[type.id]) return TYPES[MIRROR[type.id]];
    const cells = type.rots[0].map(([x, y]) => [-x, y]);
    if (/^P:/.test(type.id)) return polyType(cells);
    if (/^K:/.test(type.id)) return clusterType(cells);
    return customType(cells, { prefix: 'M', color: type.color, name: type.name + ' (mirror)' });
  }

  // Ids that name a shape by its cells ("C:0,0;1,0", "M:…"; the board recipe's shapes add their own prefixes) are
  // rebuilt from the id alone, so a type can always be asked for again: a save, the queue, a cache keyed by id.
  const RESOLVERS = {};
  /** Adds a prefix handler: get('P:…') calls fn(rest, id), which registers the type under id and returns it. */
  function resolver(prefix, fn) { RESOLVERS[prefix] = fn; }
  const cellsFrom = (rest) => rest.split(';').map((p) => p.split(',').map(Number));
  resolver('C', (rest) => customType(cellsFrom(rest), { prefix: 'C' }));
  resolver('M', (rest) => customType(cellsFrom(rest), { prefix: 'M' }));
  // A board recipe's shape: only a key in its canonical turn names one ('P:' 1-12 blocks joined by their sides with no
  // sealed hole; 'K:' 2-8 joined through corners, not all by sides, with no sealed hole).
  resolver('P', (rest) => {
    const cells = parseKey(rest);
    if (!cells || cells.length > 12 || canonKey(cells) !== rest || !isConnected(cells) || hasHole(cells)) return null;
    return polyType(cells);
  });
  resolver('K', (rest) => {
    const cells = parseKey(rest);
    if (!cells || cells.length < 2 || cells.length > 8 || canonKey(cells) !== rest || !isLinked(cells) || isConnected(cells) || hasHole(cells)) return null;
    return clusterType(cells);
  });

  /** The type an id names: a built-in one, 'B' + any id (doubled, recursively), or one a resolver rebuilds. */
  function get(id) {
    if (typeof id !== 'string' || !id) return null;
    if (TYPES[id]) { if (MADE.has(id)) { MADE.delete(id); MADE.set(id, true); } return TYPES[id]; }
    const m = /^([A-Za-z]+):(.+)$/.exec(id);
    if (m && RESOLVERS[m[1]]) {
      return RESOLVERS[m[1]](m[2], id) || null;
    }
    if (id[0] === 'B' && id.length > 1 && get(id.slice(1))) return bigOf(id.slice(1));
    return null;
  }

  // Types made on demand (doubled, drawn, resolved) can be dropped and rebuilt from their ids: the seven and the other
  // built-in shapes stay.
  const BUILTIN = new Set(Object.keys(TYPES));
  /** Drops a type made on demand (the next get rebuilds it); built-in ones stay. Returns whether it went. */
  function evict(id) { if (BUILTIN.has(id) || !TYPES[id]) return false; delete TYPES[id]; MADE.delete(id); return true; }
  // The types made on demand, least recently asked for first: past LRU of them, the oldest is dropped (a board of
  // 12-block shapes makes a new one nearly every piece; every cache is keyed by id, and get rebuilds it).
  const LRU = 512;
  tracking = true;
  function made(id) {
    if (BUILTIN.has(id)) return;
    MADE.delete(id); MADE.set(id, true);
    while (MADE.size > LRU) evict(MADE.keys().next().value);
  }

  /** A colour slot for a shape known by its key: one of the other shapes' slots, 9–14, the same every time. */
  function hashColor(key) {
    let h = 0x811c9dc5;
    for (const ch of String(key)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return 9 + (h % 6);
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

  Object.assign(L, {
    Pieces: {
      COLOR, TYPES, TETROMINOES, PENTOMINOES, PENTO18, MIRROR, LRU,
      get, bigOf, customType, mirrorOf, defineType, kicksFor, rotateCW, boundsOf, shapeKey, resolver, evict, hashColor, BUILTIN,
      canonKey, parseKey, polyType, clusterType, isLinked, hasHole, made: () => MADE.size,
      normalize, keyOf, freeKey, isConnected, freePolyominoes,
    },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
