// Lull — Shapes: the board recipe's shape sets (js/recipe.js). A Relaxed board deals the seven in a 7-bag (Normal), or
// one of the presets (Tiny, Frantic, Pentominoes, Big), or a Custom set: groups of 1 to 12 blocks, each All or hand-
// picked (up to 60 picks, as canonical keys), clusters of blocks joined through corners, and Big pieces (a share of
// them, or all). Pure rules and data, no DOM (the New board window's part and the Custom shapes window are in
// js/shapepicker.js).
//
//   recipe.shapes = { preset: 'normal' | 'tiny' | 'frantic' | 'pentominoes' | 'big' | 'custom',
//                     custom?: { groups: [{ n: 1..12, weight: 'less' | 'even' | 'more', picks?: [key], picked?: count }],
//                                clusters?: { min: 2..8, max: 2..8, weight }, big: 'off' | 'less' | 'even' | 'more' | 'all' } }
//
// A board deals in rounds (Shapes.round): a round is a shuffled list of tokens, q of them for each source (Less 7, Even
// 14, More 28; a preset's own), each list source's drawn without repeats from shuffled cycles of its shapes. The rest of
// the round is game.bag ('<source>.<index>' for a list, '<source>' for a draw), and so is the rest of Frantic's
// persistent bag of pentominoes ('~<index>'): Undo, the save and a resume need nothing new, and every draw is on the
// game's own stream, so a resumed board, or one after Undo, deals exactly the same pieces. Groups of 7 to 12 blocks are
// drawn uniformly through a table (js/polytable.js, built by scripts/polytable.cjs): the shape with index k of its
// group (Shapes.poly) is found by walking the enumeration to the table's node that holds it, then only that node's
// subtree. Normal is today's code path, unchanged (no dealer of its own).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;

  /** One-sided shapes of n blocks with no sealed hole (mirror images apart, as J and L are). */
  const TOTAL = [0, 1, 1, 2, 7, 18, 60, 195, 693, 2432, 8808, 31968, 117487];
  const MAX_N = 12, MAX_PICKS = 60;
  const WEIGHTS = { less: 7, even: 14, more: 28 };
  const WEIGHT_NAMES = { less: 'Less', even: 'Even', more: 'More', all: 'All' };
  const BIGS = ['off', 'less', 'even', 'more', 'all'];
  const PRESETS = ['normal', 'tiny', 'frantic', 'pentominoes', 'big', 'custom'];
  const NAMES = { normal: 'Normal', tiny: 'Tiny', frantic: 'Frantic', pentominoes: 'Pentominoes', big: 'Big', custom: 'Custom', mixed: 'Mixed' };
  const SEVEN = Pieces.TETROMINOES;
  /** The built-in ids of each group of 1 to 5 blocks (the seven keep Lull kicks and twists). */
  const SMALL = { 1: ['M1'], 2: ['D2'], 3: ['I3', 'V3'], 4: SEVEN, 5: Pieces.PENTO18 };
  /** Custom when first chosen: the seven and the pentominoes. */
  const CUSTOM_DEFAULT = Object.freeze({ groups: [{ n: 4, weight: 'even' }, { n: 5, weight: 'even' }], big: 'off' });

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---- enumerating shapes (Redelmeier, over fixed polyominoes in the half plane) --------------------------------------
  //
  // Cells (x, y) with y > 0, or y = 0 and x >= 0, grown from (0, 0) one cell at a time: every fixed polyomino once. Of
  // those, the leaves counted are each one-sided shape's canonical turn (of its four turns, the one whose sorted cell
  // codes are least) without a sealed hole. Typed arrays throughout: a draw allocates nothing but its answer.

  const ENUMS = [];
  function enumFor(n) {
    if (ENUMS[n]) return ENUMS[n];
    const W = 2 * n + 1, H = n + 1, N = W * H, OX = n, S = 4 * n + 8;
    const seen = new Uint8Array(N);
    for (let x = 0; x < OX; x++) seen[x] = 1;
    const poly = new Int32Array(n), list = new Int32Array((n + 1) * S);
    const xs = new Int32Array(n), ys = new Int32Array(n), k0 = new Int32Array(n), kr = new Int32Array(n), tx = new Int32Array(n);
    const grid = new Uint8Array(16 * 16), stack = new Int32Array(16 * 16);
    let D1 = -1, D = -1, onNode1 = null, onNode = null, onLeaf = null, stop = false;

    function codes(out, r) {
      let mx = 1e9, my = 1e9;
      for (let i = 0; i < n; i++) {
        let x = xs[i], y = ys[i];
        if (r === 1) { const t = x; x = y; y = -t; } else if (r === 2) { x = -x; y = -y; } else if (r === 3) { const t = x; x = -y; y = t; }
        tx[i] = x; kr[i] = y;
        if (x < mx) mx = x; if (y < my) my = y;
      }
      for (let i = 0; i < n; i++) out[i] = (kr[i] - my) * 16 + (tx[i] - mx);
      for (let i = 1; i < n; i++) { const v = out[i]; let j = i - 1; while (j >= 0 && out[j] > v) { out[j + 1] = out[j]; j--; } out[j + 1] = v; }
    }
    /** The polyomino now in poly: its canonical turn, with no sealed hole. */
    function counted() {
      for (let i = 0; i < n; i++) { const v = poly[i]; xs[i] = (v % W) - OX; ys[i] = (v / W) | 0; }
      codes(k0, 0);
      for (let r = 1; r < 4; r++) {
        codes(kr, r);
        for (let i = 0; i < n; i++) { if (kr[i] !== k0[i]) { if (kr[i] < k0[i]) return false; break; } }
      }
      return !holed();
    }
    function holed() {
      let mx = 1e9, my = 1e9, Mx = -1e9, My = -1e9;
      for (let i = 0; i < n; i++) { const x = xs[i], y = ys[i]; if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y; }
      const w = Mx - mx + 3, h = My - my + 3;
      if (w < 5 || h < 5) return false;
      grid.fill(0, 0, w * h);
      for (let i = 0; i < n; i++) grid[(ys[i] - my + 1) * w + (xs[i] - mx + 1)] = 1;
      let sp = 0, reached = 1;
      grid[0] = 2; stack[sp++] = 0;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0;
        if (x > 0 && !grid[i - 1]) { grid[i - 1] = 2; reached++; stack[sp++] = i - 1; }
        if (x < w - 1 && !grid[i + 1]) { grid[i + 1] = 2; reached++; stack[sp++] = i + 1; }
        if (y > 0 && !grid[i - w]) { grid[i - w] = 2; reached++; stack[sp++] = i - w; }
        if (y < h - 1 && !grid[i + w]) { grid[i + w] = 2; reached++; stack[sp++] = i + w; }
      }
      return reached + n < w * h;
    }
    function rec(size, base, cnt) {
      const next = base + S;
      while (cnt > 0 && !stop) {
        cnt--;
        const c = list[base + cnt];
        poly[size] = c;
        const sz = size + 1;
        if (sz === n) { if (counted() && onLeaf()) stop = true; continue; }
        if (sz === D1 && !onNode1()) continue;
        if (sz === D && !onNode()) continue;
        let m = cnt;
        for (let i = 0; i < cnt; i++) list[next + i] = list[base + i];
        let q = c + 1; if (!seen[q]) { seen[q] = 1; list[next + m++] = q; }
        q = c - 1; if (q >= 0 && !seen[q]) { seen[q] = 1; list[next + m++] = q; }
        q = c + W; if (q < N && !seen[q]) { seen[q] = 1; list[next + m++] = q; }
        q = c - W; if (q >= 0 && !seen[q]) { seen[q] = 1; list[next + m++] = q; }
        rec(sz, next, m);
        for (let i = cnt; i < m; i++) seen[list[next + i]] = 0;
      }
    }
    /**
     * Walks the enumeration: onNode1() at depth d1 and onNode() at depth d (false: skip that subtree), onLeaf() at each
     * shape counted (true: stop). A depth of -1 is never met.
     */
    function run(d1, d, n1, nd, lf) {
      D1 = d1; D = d; onNode1 = n1; onNode = nd; onLeaf = lf; stop = false;
      if (n === 1) { poly[0] = OX; xs[0] = 0; ys[0] = 0; lf(); return; }
      seen[OX] = 1; list[0] = OX;
      rec(0, 0, 1);
      seen[OX] = 0;
      onNode1 = onNode = onLeaf = null;
    }
    /** The cells of the shape now in poly, as [[x, y]] from (0, 0). */
    function cells() {
      let mx = 1e9, my = 1e9;
      for (let i = 0; i < n; i++) { if (xs[i] < mx) mx = xs[i]; if (ys[i] < my) my = ys[i]; }
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = [xs[i] - mx, ys[i] - my];
      return out;
    }
    return (ENUMS[n] = { n, run, cells });
  }

  // ---- the sampling table (js/polytable.js) ---------------------------------------------------------------------------
  //
  // For each n, the depth d of the tree its counts are kept at, and for each node there (in enumeration order) how many
  // counted shapes lie below it. Shape k of the group lies below the node whose running total passes k.

  const TABLES = [];
  const tableOf = (n) => (L.PolyTable && L.PolyTable[n]) || null;
  function table(n) {
    if (TABLES[n]) return TABLES[n];
    const t = tableOf(n);
    if (!t || t.d < 1) return null;
    const counts = decode(t.c);
    const pre = new Int32Array(counts.length + 1);
    for (let i = 0; i < counts.length; i++) pre[i + 1] = pre[i] + counts[i];
    // The depth-d nodes under each node at depth d1 (found once, walking the tree to depth d): the walk to a node
    // skips every other d1 subtree whole.
    const d = t.d, d1 = d > 4 ? d - 4 : -1;
    let first = null;
    if (d1 > 0) {
      const f = [];
      let nodes = 0;
      enumFor(n).run(d1, d, () => { f.push(nodes); return true; }, () => { nodes++; return false; }, () => false);
      f.push(nodes);
      first = Int32Array.from(f);
    }
    return (TABLES[n] = { d, d1, pre, first, total: pre[counts.length] });
  }
  /** The table's counts, from its text: base-36 numbers joined by ',', a run of z zeros as '_' + z. */
  function decode(text) {
    const out = [];
    for (const p of String(text).split(',')) {
      if (p[0] === '_') { const z = parseInt(p.slice(1), 36); for (let i = 0; i < z; i++) out.push(0); } else out.push(parseInt(p, 36));
    }
    return Int32Array.from(out);
  }
  function encode(counts) {
    const out = [];
    for (let i = 0; i < counts.length;) {
      if (counts[i] === 0) { let j = i; while (j < counts.length && counts[j] === 0) j++; out.push(j - i === 1 ? '0' : '_' + (j - i).toString(36)); i = j; } else out.push(counts[i++].toString(36));
    }
    return out.join(',');
  }

  /**
   * Shapes start … start+len-1 of the group of n blocks (in the table's order), each as cells from (0, 0), in its
   * canonical turn. Walks only to the node holding shape `start`, then on.
   */
  function range(n, start, len) {
    n |= 0; start = Math.max(0, start | 0); len = Math.max(0, Math.min(len | 0, TOTAL[n] - start));
    const out = [];
    if (!(n >= 1 && n <= MAX_N) || !len) return out;
    const E = enumFor(n), T = table(n);
    if (!T || n <= 2 || T.d < 1) {
      let k = 0;
      E.run(-1, -1, null, null, () => { if (k++ >= start) out.push(E.cells()); return out.length >= len; });
      return out;
    }
    // The node holding shape `start`, and how many counted shapes come before it in its subtree.
    let lo = 0, hi = T.pre.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T.pre[m] <= start) lo = m; else hi = m - 1; }
    const j = lo;
    let skip = start - T.pre[j], node = -1, sub = -1, on = false;
    const onNode1 = () => {
      sub++;
      if (on) return true;
      // Before the d1 subtree holding j: skipped whole (its nodes counted).
      if (T.first[sub + 1] <= j) { node = T.first[sub + 1] - 1; return false; }
      return true;
    };
    const onNode = () => { node++; if (node >= j) on = true; return on; };
    E.run(T.first ? T.d1 : -1, T.d, onNode1, onNode, () => {
      if (!on) return false;
      if (skip > 0) { skip--; return false; }
      out.push(E.cells());
      return out.length >= len;
    });
    return out;
  }
  /** Shape k of the group of n blocks: its cells from (0, 0), in its canonical turn. */
  function poly(n, k) { const r = range(n, k, 1); return r[0] || null; }
  /** How many shapes the group of n blocks has. */
  const count = (n) => TOTAL[n] || 0;
  /** A page of a group: len shapes from start, as ids ('P:' or, for 1-5 blocks, the built-in one). */
  function page(n, start, len) { return range(n, start, len).map((c) => idOfCells(c)); }

  // ---- keys and ids ---------------------------------------------------------------------------------------------------

  /** A built-in shape of 1-5 blocks by its canonical key. */
  let BUILT = null;
  function builtIn() {
    if (BUILT) return BUILT;
    BUILT = new Map();
    for (const n of [1, 2, 3, 4, 5]) for (const id of SMALL[n]) BUILT.set(Pieces.canonKey(Pieces.TYPES[id].rots[0]), id);
    return BUILT;
  }
  /** A shape's canonical key (from cells in any turn). */
  const canon = (cells) => Pieces.canonKey(cells);
  /** The id a board deals for these cells: a built-in one for 1-5 blocks (the seven keep their kicks), else 'P:' + key. */
  function idOfCells(cells) {
    const key = canon(cells);
    if (cells.length <= 5) { const id = builtIn().get(key); if (id) return id; }
    return Pieces.polyType(cells).id;
  }
  /** The id a pick (a canonical key) deals, or null for a key that is not one. */
  function idOfKey(key) {
    const cells = Pieces.parseKey(key);
    return cells ? idOfCells(cells) : null;
  }
  /**
   * A drawn shape (cells on a grid) checked: { ok, n, key, why }. Why is 'Not joined' (blocks not joined by their sides)
   * or 'Has a hole'; n its blocks (the view says "7 of 9 blocks").
   */
  function checkDrawn(cells, n) {
    cells = (cells || []).map(([x, y]) => [x, y]);
    const out = { ok: false, n: cells.length, key: null, why: null };
    if (!cells.length) return out;
    if (!Pieces.isConnected(cells)) { out.why = 'Not joined'; return out; }
    if (Pieces.hasHole(cells)) { out.why = 'Has a hole'; return out; }
    out.key = canon(cells);
    out.ok = n == null || cells.length === n;
    return out;
  }

  // ---- clusters ---------------------------------------------------------------------------------------------------------
  //
  // k blocks (from min to max, evenly), grown from one: a random block, then one of its eight neighbours (sides three
  // times as likely as corners to be tried, then two to three), inside a B×B box (B = ⌈√k⌉ + 1). Kept only when at least
  // one join is through a corner alone (else it is a polyomino, which the groups deal) and no empty cell is sealed in;
  // else drawn again on the same stream.

  const NB8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  /** The box side a cluster of k blocks fits. */
  const clusterBox = (k) => Math.ceil(Math.sqrt(k)) + 1;
  function cluster(rng, min, max) {
    const k = rng.range(min, max), B = clusterBox(k);
    for (let tries = 0; tries < 400; tries++) {
      const cells = [[0, 0]], set = new Set(['0,0']);
      let minX = 0, maxX = 0, minY = 0, maxY = 0;
      for (let guard = 0; cells.length < k && guard < 200; guard++) {
        const [x, y] = cells[rng.int(cells.length)];
        const r = rng.int(20), d = NB8[r < 12 ? r >> 2 : 4 + ((r - 12) >> 1)];
        const nx = x + d[0], ny = y + d[1], key = nx + ',' + ny;
        if (set.has(key)) continue;
        if (Math.max(maxX, nx) - Math.min(minX, nx) >= B || Math.max(maxY, ny) - Math.min(minY, ny) >= B) continue;
        set.add(key); cells.push([nx, ny]);
        minX = Math.min(minX, nx); maxX = Math.max(maxX, nx); minY = Math.min(minY, ny); maxY = Math.max(maxY, ny);
      }
      if (cells.length === k && !Pieces.isConnected(cells) && !Pieces.hasHole(cells)) return cells;
    }
    // Never met in practice (a few tries are the rule): two blocks corner to corner, and a line on.
    const out = [[0, 0], [1, 1]];
    for (let i = 2; i < k; i++) out.push([1 + ((i - 1) % (B - 1)), 1 + Math.floor((i - 1) / (B - 1))]);
    return out;
  }

  // ---- recipes --------------------------------------------------------------------------------------------------------

  const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  /**
   * A shapes recipe made whole and safe: an unknown preset is Normal; Custom's groups each n once (1-12, in order), a
   * weight each (Even by default), picks that are real shapes of n blocks (canonical keys, each once, 60 in all at
   * most; none: All); clusters 2-8 blocks, min ≤ max; Big one of off, less, even, more, all. A Custom set with no source
   * is Normal.
   */
  function normalize(raw) {
    raw = isObj(raw) ? raw : {};
    // (Mixed: Mural's own set, kept here; js/mural.js makes it Normal on any other board.)
    const preset = PRESETS.includes(raw.preset) || raw.preset === 'mixed' ? raw.preset : 'normal';
    if (preset !== 'custom') return { preset };
    const c = isObj(raw.custom) ? raw.custom : CUSTOM_DEFAULT;
    const out = { groups: [], big: BIGS.includes(c.big) ? c.big : 'off' };
    const w = (x) => (WEIGHTS[x] ? x : 'even');
    let picks = 0;
    const seen = new Set();
    const groups = (Array.isArray(c.groups) ? c.groups : []).filter((g) => isObj(g) && intIn(g.n, 1, MAX_N)).sort((a, b) => a.n - b.n);
    for (const g of groups) {
      if (seen.has(g.n)) continue;
      seen.add(g.n);
      const o = { n: g.n, weight: w(g.weight) };
      if (Array.isArray(g.picks)) {
        const keys = [];
        for (const k of g.picks) {
          if (picks >= MAX_PICKS) break;
          const cells = Pieces.parseKey(k);
          if (!cells || cells.length !== g.n || !Pieces.isConnected(cells) || Pieces.hasHole(cells)) continue;
          const ck = canon(cells);
          if (keys.includes(ck)) continue;
          keys.push(ck); picks++;
        }
        // Every shape of the group picked is All.
        if (keys.length && keys.length < TOTAL[g.n]) o.picks = keys;
      }
      // A retired board's thin copy keeps how many were picked (only shown).
      if (!o.picks && intIn(g.picked, 1, MAX_PICKS) && g.picked < TOTAL[g.n]) o.picked = g.picked;
      out.groups.push(o);
    }
    if (isObj(c.clusters)) {
      let min = c.clusters.min, max = c.clusters.max;
      if (!intIn(min, 2, 8) || !intIn(max, 2, 8) || min > max) { min = 3; max = 5; }
      out.clusters = { min, max, weight: w(c.clusters.weight) };
    }
    if (!out.groups.length && !out.clusters && out.big === 'off') return { preset: 'normal' };
    return { preset, custom: out };
  }
  /** A thin copy (a retired board's): picks become a count. */
  function thin(sh) {
    const out = normalize(sh);
    if (out.custom) for (const g of out.custom.groups) if (g.picks) { g.picked = g.picks.length; delete g.picks; }
    return out;
  }

  /**
   * What a shapes recipe deals: null for Normal (today's 7-bag), else { src, all, key }. A source: { ids, q } a list
   * (dealt in shuffled cycles), { bag: ids, q } Frantic's pentominoes (a bag kept between rounds), { poly: n, q } a
   * uniform draw of n blocks, { cluster: [min, max], q }, and big: true on a source whose pieces are doubled; all: every
   * piece doubled. Cached by the recipe's key.
   */
  const COMPILED = new Map();
  function compile(sh) {
    sh = normalize(sh);
    if (sh.preset === 'normal') return null;
    const key = JSON.stringify(sh);
    if (COMPILED.has(key)) return COMPILED.get(key);
    let src = [], all = false;
    if (sh.preset === 'tiny') src = [{ ids: ['M1'], q: 2 }, { ids: ['D2'], q: 4 }, { ids: ['I3'], q: 4 }, { ids: ['V3'], q: 4 }];
    else if (sh.preset === 'frantic') src = [{ ids: SEVEN, q: 7 }, { bag: Pieces.PENTO18, q: 7 }, { ids: ['I3'], q: 2 }, { ids: ['V3'], q: 2 }, { ids: ['D2'], q: 2 }, { ids: ['M1'], q: 1 }];
    else if (sh.preset === 'pentominoes') src = [{ ids: Pieces.PENTO18, q: 18 }];
    else if (sh.preset === 'big') { src = [{ ids: SEVEN, q: 7 }]; all = true; }
    else {
      const c = sh.custom, pool = [];
      for (const g of c.groups) {
        const q = WEIGHTS[g.weight];
        let s;
        if (g.picks) s = { ids: g.picks.map(idOfKey), q };
        else if (g.n <= 5) s = { ids: SMALL[g.n], q };
        else if (g.n === 6) s = { ids: page(6, 0, TOTAL[6]), q };
        else s = { poly: g.n, q };
        s.group = g.n;
        src.push(s);
        if (g.n <= 5) pool.push(...s.ids);
      }
      if (c.clusters) src.push({ cluster: [c.clusters.min, c.clusters.max], q: WEIGHTS[c.clusters.weight] });
      if (c.big === 'all') all = true;
      if (c.big !== 'off' && (c.big !== 'all' || !src.length)) src.push({ ids: pool.length ? pool : SEVEN, q: WEIGHTS[c.big] || 14, big: true });
    }
    const out = { src, all, key };
    COMPILED.set(key, out);
    if (COMPILED.size > 64) COMPILED.delete(COMPILED.keys().next().value);
    return out;
  }

  /** A new round's tokens (drawn on rng); `keep` is the rest of Frantic's bag ('~k'), used and refilled. Returns the new bag. */
  function round(c, rng, keep) {
    let persist = (keep || []).filter((t) => typeof t === 'string' && t[0] === '~');
    const out = [];
    c.src.forEach((s, si) => {
      if (s.ids) {
        let cyc = [];
        for (let i = 0; i < s.q; i++) {
          if (!cyc.length) cyc = rng.shuffle(s.ids.map((_, k) => k));
          out.push(si + '.' + cyc.shift());
        }
      } else if (s.bag) {
        for (let i = 0; i < s.q; i++) {
          if (!persist.length) persist = rng.shuffle(s.bag.map((_, k) => k)).map((k) => '~' + k);
          out.push(si + '.' + persist.shift().slice(1));
        }
      } else for (let i = 0; i < s.q; i++) out.push(String(si));
    });
    return rng.shuffle(out).concat(persist);
  }
  /** The id a token deals (drawing on rng for a draw), or null for one that names nothing here. */
  function resolve(tok, c, rng) {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(tok);
    const s = m && c.src[+m[1]];
    if (!s) return null;
    let id = null;
    if (s.ids || s.bag) { id = (s.ids || s.bag)[+m[2]]; if (m[2] == null || id == null) return null; }
    else if (s.poly) id = Pieces.polyType(poly(s.poly, rng.int(TOTAL[s.poly]))).id;
    else if (s.cluster) id = Pieces.clusterType(cluster(rng, s.cluster[0], s.cluster[1])).id;
    if (s.big || c.all) id = Pieces.bigOf(id).id;
    return id;
  }
  /** A token drawn by weight (for Reroll and Order Slip: never the game's stream). */
  function sampleToken(c, rng) {
    let r = rng.int(c.src.reduce((a, s) => a + s.q, 0));
    for (let si = 0; si < c.src.length; si++) {
      const s = c.src[si];
      if (r < s.q) return s.ids || s.bag ? si + '.' + rng.int((s.ids || s.bag).length) : String(si);
      r -= s.q;
    }
    return '0.0';
  }
  const mathRng = () => new RNG((Math.random() * 4294967296) >>> 0);

  /** Every id a set can deal, when it is a short fixed list (29 at most: Normal, Tiny, Frantic, Pentominoes, groups of 1-5), else null. */
  function fixedIds(c) {
    if (!c) return SEVEN.slice();
    if (c.src.some((s) => !(s.ids || s.bag))) return null;
    const set = new Set();
    for (const s of c.src) for (const id of s.ids || s.bag) set.add(s.big || c.all ? 'B' + id : id);
    return set.size <= 29 ? Array.from(set) : null;
  }
  /** What Best Fit and Order Slip choose from: the fixed list, else 7 samples (Math.random). */
  function candidates(c) {
    const fixed = fixedIds(c);
    if (fixed) return fixed;
    const rng = mathRng(), out = [];
    for (let i = 0; i < 40 && out.length < 7; i++) { const id = resolve(sampleToken(c, rng), c, rng); if (id && !out.includes(id)) out.push(id); }
    return out;
  }

  /** The turn a piece appears in: the flattest that fits the width; ties: more blocks on its bottom row, then the lowest turn. */
  const ROT_CACHE = new Map();
  function spawnRot(type, w) {
    const key = type.id + '|' + w;
    let best = ROT_CACHE.get(key);
    if (best != null) return best;
    let bk = null;
    best = 0;
    for (let r = 0; r < 4; r++) {
      const b = type.rotBounds[r];
      if (b.w > w) continue;
      let base = 0;
      for (const [, y] of type.rots[r]) if (y === b.minY) base++;
      if (!bk || b.h < bk[0] || (b.h === bk[0] && base > bk[1])) { bk = [b.h, base]; best = r; }
    }
    if (ROT_CACHE.size > 4096) ROT_CACHE.clear();
    ROT_CACHE.set(key, best);
    return best;
  }

  // ---- numbers: blocks a piece, block scale, rated, minimum size ------------------------------------------------------

  const sizeOf = (id) => { const t = Pieces.get(id); return t ? t.size : 4; };
  const mean = (ids) => ids.reduce((a, id) => a + sizeOf(id), 0) / ids.length;
  /** The mean blocks a piece (E): each source's mean by its share of a round, a doubled piece four times its blocks. */
  function meanCells(sh) {
    const c = compile(sh);
    if (!c) return 4;
    let num = 0, den = 0;
    for (const s of c.src) {
      const m = s.ids || s.bag ? mean(s.ids || s.bag) : s.poly ? s.poly : (s.cluster[0] + s.cluster[1]) / 2;
      num += m * s.q * (s.big || c.all ? 4 : 1); den += s.q;
    }
    return num / den;
  }
  /** A shape's different turns (1, 2 or 4): the seven have 19 between them. */
  const turnsOf = (id) => { const t = Pieces.get(id); return t ? new Set(t.keys).size : 4; };
  /**
   * How many different turns of shapes a set deals, by share (19 or more: 19 is enough to know): the turns between its
   * listed shapes (every list together) for the listed share of a round, 19 for the share drawn fresh (clusters, groups
   * of 7 or more blocks). A set mostly of one easy shape stays near that shape's turns, however few clusters it adds.
   */
  function variety(sh) {
    const c = compile(sh);
    if (!c) return 19;
    let n = 0, listQ = 0, drawnQ = 0;
    const ids = new Set();
    for (const s of c.src) {
      if (s.poly || s.cluster) { drawnQ += s.q; continue; }
      listQ += s.q;
      for (const id of s.ids || s.bag) if (!ids.has(id)) { ids.add(id); n += turnsOf(id); }
    }
    return (listQ * Math.min(19, n) + drawnQ * 19) / (listQ + drawnQ);
  }
  /**
   * The mean blocks a piece as the pay counts them (R.E: f = min(1, 4/E)): meanCells, counted up by 19/D for a set
   * whose shapes have D < 19 different turns between them by share (the seven's 19). A set of few turns is quicker to
   * place (a set of bars and squares alone is dropped where it appears, a press or two a piece), so it pays that share
   * of Standard's a block: no board of other shapes earns faster a piece or a press than the seven do.
   */
  function payCells(sh) { return meanCells(sh) * Math.max(1, 19 / variety(sh)); }
  /** Whether the set deals the seven alone (none doubled or all of them): the only rated sets. */
  function rated(sh) {
    sh = normalize(sh);
    if (sh.preset === 'normal' || sh.preset === 'big') return true;
    if (sh.preset !== 'custom') return false;
    const c = sh.custom;
    if (c.clusters) return false;
    if (!c.groups.length) return true; // Big alone: the seven, doubled
    return c.groups.length === 1 && c.groups[0].n === 4 && !c.groups[0].picks && (c.big === 'off' || c.big === 'all');
  }
  /** The block scale: 2 when every piece is doubled. */
  function unit(sh) {
    sh = normalize(sh);
    if (sh.preset === 'big') return 2;
    return sh.preset === 'custom' && (sh.custom.big === 'all' || (!sh.custom.groups.length && !sh.custom.clusters)) ? 2 : 1;
  }

  /** The measured minimums (js/minsize.js): by source key, [w, h]. */
  const measured = (key) => (L.ShapeMins && L.ShapeMins[key]) || null;
  /** A set's sources as the minimums know them: [{ key, M, L }] (M the largest short side, L the longest side, in blocks). */
  function sources(sh) {
    sh = normalize(sh);
    const out = [];
    const ofIds = (ids, u, key) => {
      let M = 0, Lg = 0;
      for (const id of ids) { const t = Pieces.get(id); if (!t) continue; const b = t.rotBounds[0]; M = Math.max(M, Math.min(b.w, b.h)); Lg = Math.max(Lg, b.w, b.h); }
      out.push({ key, M: M * u, L: Lg * u });
    };
    if (sh.preset === 'normal') return [{ key: 'g4', M: 2, L: 4 }];
    if (sh.preset !== 'custom') {
      const c = compile(sh);
      const ids = [].concat(...c.src.map((s) => s.ids || s.bag));
      ofIds(ids, c.all ? 2 : 1, sh.preset);
      return out;
    }
    const c = sh.custom, all = c.big === 'all', pool = [];
    for (const g of c.groups) {
      const u = all ? 2 : 1, key = 'g' + g.n + (all ? 'B' : '');
      if (g.picks) ofIds(g.picks.map(idOfKey), 1, key);
      else out.push({ key, M: Math.floor((g.n + 1) / 2) * u, L: g.n * u });
      if (g.picks && all) { const o = out[out.length - 1]; o.M *= 2; o.L *= 2; }
      if (g.n <= 5) pool.push(g.n);
    }
    if (c.clusters) { const B = clusterBox(c.clusters.max) * (all ? 2 : 1); out.push({ key: 'c' + c.clusters.max + (all ? 'B' : ''), M: B, L: B }); }
    // Big pieces of their own (Less, Even, More; or Big alone): the groups of 1-5 blocks doubled (none on: the seven).
    if (c.big !== 'off' && (c.big !== 'all' || (!c.groups.length && !c.clusters))) for (const n of pool.length ? pool : [4]) out.push({ key: 'g' + n + 'B', M: Math.floor((n + 1) / 2) * 2, L: n * 2 });
    return out;
  }
  /**
   * The smallest board a set is dealt on: the geometric floor (w ≥ max(4, M+2), h ≥ max(8, L+4)) raised to the measured
   * one (scripts/minsize.cjs: where a plain bot's median life is 60 pieces), over every source. { w, h }.
   */
  function minSize(sh) {
    let w = 4, h = 8;
    for (const s of sources(sh)) {
      w = Math.max(w, s.M + 2); h = Math.max(h, s.L + 4);
      const m = measured(s.key);
      if (m) { w = Math.max(w, m[0]); h = Math.max(h, m[1]); }
    }
    return { w: Math.min(20, w), h: Math.min(40, h) };
  }

  /** Race's buffer rows for a set (k): Normal 4, Tiny 3, Frantic and Pentominoes 5. */
  function raceK(sh) { return { normal: 4, tiny: 3, frantic: 5, pentominoes: 5 }[normalize(sh).preset] || 5; }

  // ---- words ----------------------------------------------------------------------------------------------------------

  const listed = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  /** Custom's sources in words: "4 and 5 blocks, clusters of 3–5, some Big". */
  function describe(c) {
    if (!c) return '';
    const parts = [];
    const whole = c.groups.filter((g) => !g.picks && !g.picked).map((g) => g.n);
    const picked = c.groups.filter((g) => g.picks || g.picked);
    if (whole.length) parts.push(listed(whole.map(String)) + (whole.length === 1 && whole[0] === 1 ? ' block' : ' blocks'));
    for (const g of picked) parts.push(g.n + (g.n === 1 ? ' block' : ' blocks') + ' (' + (g.picks ? g.picks.length : g.picked) + ' picked)');
    if (c.clusters) parts.push('clusters of ' + (c.clusters.min === c.clusters.max ? c.clusters.min : c.clusters.min + '–' + c.clusters.max));
    if (c.big === 'all' || (c.big !== 'off' && !parts.length)) parts.push('all Big');
    else if (c.big !== 'off') parts.push('some Big');
    return parts.join(', ');
  }
  /** A set's name: '' for Normal; the preset's; Custom and its sources ("Custom: 4 and 5 blocks") unless short. */
  function label(sh, short) {
    sh = normalize(sh);
    if (sh.preset === 'normal') return '';
    if (sh.preset !== 'custom' || short) return NAMES[sh.preset];
    return 'Custom: ' + describe(sh.custom);
  }

  // ---- the part ---------------------------------------------------------------------------------------------------------

  // A Mural board cuts its picture into its set's pieces itself (js/mural.js): none of this part's dealing, pay or sizes.
  const presetOf = (r) => (r && isObj(r.shapes) && r.mode !== 'mural' ? r.shapes.preset : 'normal');
  const part = {
    key: 'shapes', order: 10, owns: ['shapes'],
    options: { 'shapes.preset': PRESETS.slice() },
    normalize(raw, out) {
      const sh = normalize(isObj(raw.shapes) ? raw.shapes : null);
      out.shapes = sh;
    },
    label: (r, short) => (r.mode === 'mural' ? '' : label(r.shapes, short)),
    thin(r) { r.shapes = thin(r.shapes); },
    // A saved board of a set: its bag holds this set's tokens.
    valid(g, r) {
      if (presetOf(r) === 'normal') return true;
      return Array.isArray(g.bag) && g.bag.every((t) => typeof t === 'string' && /^~?\d{1,2}(\.\d{1,3})?$/.test(t));
    },
    rules(r, R) {
      const sh = r.shapes;
      if (presetOf(r) === 'normal') return;
      R.E = payCells(sh);
      R.u = unit(sh);
      if (!rated(sh)) R.rated = false;
      if (r.mode === 'race') R.k = raceK(sh);
    },
    limits(r, lim) {
      if (presetOf(r) === 'normal') return;
      const m = minSize(r.shapes);
      lim.w[0] = Math.max(lim.w[0], m.w);
      lim.h[0] = Math.max(lim.h[0], Math.min(40, m.h));
    },
    conflicts(r, out) {
      // Race and Battle read boards as rows of bits (their AI, Race's cover): no Big, no groups over 5 blocks, no Clusters.
      const why = { race: 'Not in Race', battle: 'Not in Battle' }[r.mode];
      if (!why) return;
      out['shapes.preset=big'] = why;
      const c = r.shapes.custom || normalize({ preset: 'custom' }).custom;
      if (c.big !== 'off' || c.clusters || c.groups.some((g) => g.n > 5)) out['shapes.preset=custom'] = why;
    },
    engine(game) {
      const c = presetOf(game.recipe) === 'normal' ? null : compile(game.recipe && game.recipe.shapes);
      if (!c) return null;
      const dealer = {
        next(g) {
          for (let guard = 0; guard < 4; guard++) {
            if (!g.bag.length || g.bag[0][0] === '~') g.bag = round(c, g.rng, g.bag);
            while (g.bag.length && g.bag[0][0] !== '~') {
              const id = resolve(g.bag.shift(), c, g.rng);
              if (id) return id;
            }
          }
          return 'T';
        },
        reroll(g, exclude) {
          const rng = mathRng();
          let id = null;
          for (let i = 0; i < 24; i++) { id = resolve(sampleToken(c, rng), c, rng); if (id && id !== exclude) return id; }
          return id || 'T';
        },
        candidates: () => candidates(c),
      };
      return {
        dealer,
        // Every piece appears with its top in the top row, turned its flattest way (spawnRot), centred.
        spawnAt(g, b, pos, type) {
          const rot = spawnRot(type, g.w), bb = type.rotBounds[rot];
          return { x: Math.floor((g.w - bb.w) / 2) - bb.minX, y: g.h - 1 - bb.maxY, rot };
        },
      };
    },
  };

  const Shapes = {
    TOTAL, MAX_N, MAX_PICKS, WEIGHTS, WEIGHT_NAMES, BIGS, PRESETS, NAMES, SMALL, CUSTOM_DEFAULT,
    normalize, thin, compile, round, resolve, spawnRot, cluster, clusterBox, poly, range, page, count, canon, checkDrawn,
    idOfKey, idOfCells, minSize, sources, meanCells, payCells, variety, unit, rated, label, describe, candidates, fixedIds, raceK,
    enumFor, table, encode, decode, part,
  };
  L.Shapes = Shapes;
  if (L.Recipe) L.Recipe.part(part);
})(typeof globalThis !== 'undefined' ? globalThis : this);
