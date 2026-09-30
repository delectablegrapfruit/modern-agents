// Lull — Jelly, a board modifier (js/recipe.js): every piece sets as one soft lump that keeps living after it lands: it
// falls when nothing holds it up, sags and flops over edges, and oozes a block at a time down through cracks, until it
// settles; the rows that fills clear (cascades). Pure rules on the grid, no DOM: the links, settling, the part's rules
// and engine hooks, its Free Play controller, its stats and Knock-On. The look (the lumps, their wobble, settling
// replayed step by step) is js/jellyview.js.
//
// Links live in the cells (js/board.js: JOIN_R, joined to the cell on its right; JOIN_U, to the cell above), so Undo,
// the save and a resumed board keep them with no state of their own. At a lock every 4-adjacent pair of the cells the
// piece set is joined (Mirror's copy too: its part runs first); cells the player never placed (FOREIGN) and the sprout
// (ASSET) are never joined, and the sprout never falls: what rests on it is held up.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Recipe } = L;
  const JR = CELL.JOIN_R, JU = CELL.JOIN_U, SOLO = CELL.FOREIGN | CELL.ASSET;
  /** A simulated placement (Best Fit, a bot) runs the cascade only when it clears rows, at most this many a piece. */
  const SIM_CAP = 200;
  /**
   * What a row a cascade clears is worth, of a row the piece cleared itself: half. Cascades forgive holes, so a stack
   * on Jelly clears more of its blocks for the same pieces and keys; at half, measured with bots over widths 4-20, a
   * Jelly board never pays more per piece than Standard, nor per action than a Normal board of its width
   * (scripts/jelly-test.cjs, fairness).
   */
  const CASCADE_WORTH = 0.5;

  const isOn = (r) => !!(r && r.mods && r.mods.jelly);

  /** Joins every 4-adjacent pair of the cells a piece just set (absolute [[x, y]]; outside the board is skipped). */
  function link(b, abs) {
    const w = b.w, h = b.h, c = b.cells, set = new Set();
    for (const [x, y] of abs) if (x >= 0 && x < w && y >= 0 && y < h) set.add(y * w + x);
    for (const i of set) {
      let v = c[i];
      if (!v || v & SOLO) continue;
      const x = i % w;
      if (x + 1 < w && set.has(i + 1) && c[i + 1] && !(c[i + 1] & SOLO)) v |= JR;
      if (i + w < w * h && set.has(i + w) && c[i + w] && !(c[i + w] & SOLO)) v |= JU;
      c[i] = v;
    }
  }

  /**
   * The lumps: { id (a lump per cell; -1 empty, or not looked at), list: [[cell index]] }, by flood fill over the links.
   * from: only lumps with a cell in row `from` or above (all of each such lump, wherever it reaches).
   */
  let scratch = null;
  function lumps(b, from, reuse) {
    const w = b.w, c = b.cells, N = c.length;
    // reuse: the settling loop's own scratch arrays (its lumps are never kept past the next step).
    if (reuse && (!scratch || scratch.id.length !== N)) scratch = { id: new Int32Array(N), st: new Int32Array(N) };
    const id = reuse ? scratch.id.fill(-1) : new Int32Array(N).fill(-1), list = [], st = reuse ? scratch.st : new Int32Array(N);
    for (let i = (from || 0) * w; i < N; i++) {
      if (!c[i] || id[i] >= 0) continue;
      const k = list.length, cells = [i];
      let top = 0;
      st[top++] = i; id[i] = k;
      while (top) {
        const j = st[--top], v = c[j], x = j % w;
        if (v & JR && x + 1 < w && c[j + 1] && id[j + 1] < 0) { id[j + 1] = k; cells.push(j + 1); st[top++] = j + 1; }
        if (v & JU && j + w < N && c[j + w] && id[j + w] < 0) { id[j + w] = k; cells.push(j + w); st[top++] = j + w; }
        if (x > 0 && c[j - 1] & JR && id[j - 1] < 0) { id[j - 1] = k; cells.push(j - 1); st[top++] = j - 1; }
        if (j >= w && c[j - w] & JU && id[j - w] < 0) { id[j - w] = k; cells.push(j - w); st[top++] = j - w; }
      }
      list.push(cells);
    }
    return { id, list };
  }

  /**
   * Every lump that nothing holds up falls, row by row, until all rest: a lump is held up by the floor, by the sprout,
   * or by resting on a lump that is. from: only lumps reaching row `from` or above can fall (the board below it is
   * known to rest: what is there stays and holds up what is on it). Returns the cells that fell, [[x, y, dy]] (where
   * each was, and how far it fell).
   */
  function drop(b, from, rest) {
    const w = b.w, c = b.cells, N = c.length;
    const lm = lumps(b, from, !!rest), { id, list } = lm;
    if (rest) rest.lumps = lm;
    const n = list.length;
    if (!n) return [];
    const anchor = new Uint8Array(n), dy = new Int32Array(n), from0 = [];
    for (let k = 0; k < n; k++) for (const j of list[k]) if (c[j] & CELL.ASSET) anchor[k] = 1;
    const sup = new Uint8Array(n), st = [];
    let moved = false;
    for (let guard = 0; guard <= b.h; guard++) {
      sup.fill(0); st.length = 0;
      for (let k = 0; k < n; k++) {
        if (anchor[k]) { sup[k] = 1; st.push(k); continue; }
        // On the floor, or on a block that is not one of these lumps (below the rows looked at: it rests).
        for (const j of list[k]) if (j < w || (c[j - w] && id[j - w] < 0)) { sup[k] = 1; st.push(k); break; }
      }
      while (st.length) {
        const k = st.pop();
        for (const j of list[k]) {
          const a = j + w;
          if (a >= N) continue;
          const m = id[a];
          if (m >= 0 && !sup[m]) { sup[m] = 1; st.push(m); }
        }
      }
      let any = false;
      for (let k = 0; k < n; k++) if (!sup[k]) { any = true; break; }
      if (!any) break;
      moved = true;
      // Down one row together: every falling cell is lifted, then set one row lower.
      const vals = [];
      for (let k = 0; k < n; k++) {
        if (sup[k]) continue;
        if (!dy[k]) from0[k] = list[k].slice();
        for (const j of list[k]) { vals.push(c[j]); c[j] = 0; id[j] = -1; }
      }
      let t = 0;
      for (let k = 0; k < n; k++) {
        if (sup[k]) continue;
        const cells = list[k];
        for (let q = 0; q < cells.length; q++) { const j = cells[q] - w; c[j] = vals[t++]; id[j] = k; cells[q] = j; }
        dy[k]++;
      }
    }
    if (!moved) return [];
    const falls = [];
    for (let k = 0; k < n; k++) if (dy[k]) for (const j of from0[k]) falls.push([j % w, (j - (j % w)) / w, dy[k]]);
    return falls;
  }

  /** A seeded hash of two numbers (the ooze's tie-breaks: the same board and seed always settle the same way). */
  function hash(a, b) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
    h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f);
    return (h ^ (h >>> 15)) >>> 0;
  }

  /** Are these cell indices (a lump, small) one 4-connected body? */
  function connected(cells, w) {
    const n = cells.length;
    if (n < 2) return true;
    const seen = new Uint8Array(n), st = [0];
    seen[0] = 1;
    let got = 1;
    while (st.length) {
      const j = cells[st.pop()];
      for (let q = 0; q < n; q++) {
        if (seen[q]) continue;
        const d = cells[q] - j;
        if (d === w || d === -w || (d === 1 && j % w !== w - 1) || (d === -1 && j % w !== 0)) { seen[q] = 1; got++; st.push(q); }
      }
    }
    return got === n;
  }

  /** Joins a lump's cells (indices) afresh: every 4-adjacent pair of them, and nothing else. */
  function relink(b, cells) {
    const c = b.cells, w = b.w;
    for (const j of cells) c[j] &= ~(JR | JU);
    link(b, cells.map((j) => [j % w, (j - (j % w)) / w]));
  }

  /**
   * One ooze step (the board rests: nothing hangs). Each lump of two or more placed blocks, in order of its lowest,
   * leftmost cell, moves at most one of its blocks, strictly down:
   *   targets: an empty cell right under one of its blocks (it sags, flops over an edge, drips into a crack), or beside
   *     a block in its bottom row over a notch one wide and one deep (mouth: it slips in);
   *   sources: its blocks with nothing on top (the cell above empty), higher than the target;
   *   the lump must still be one body (4-connected) with the block moved.
   * The lowest target that has a source wins (ties: seeded), then the highest source (ties: the nearest to the
   * target, then seeded); the block squeezes through the lump to it and the lump is joined afresh. Blocks the player
   * never placed and the sprout never ooze; lumps never merge. from: only lumps reaching row `from` or above.
   * Returns the moves, [[from index, to index]].
   */
  function ooze(b, salt, from, lm) {
    const w = b.w, c = b.cells, N = c.length;
    const { list } = lm || lumps(b, from);
    const moves = [];
    for (const cells of list) {
      if (cells.length < 2) continue;
      if (cells.some((j) => c[j] & SOLO)) continue;
      let minY = Infinity;
      for (const j of cells) minY = Math.min(minY, (j - (j % w)) / w);
      const T = new Set();
      for (const j of cells) {
        const x = j % w, y = (j - x) / w;
        if (y > 0 && !c[j - w]) T.add(j - w);
        if (y === minY && y > 0) {
          if (x > 0 && mouth(b, j - 1)) T.add(j - 1);
          if (x + 1 < w && mouth(b, j + 1)) T.add(j + 1);
        }
      }
      if (!T.size) continue;
      const ts = Array.from(T).sort((p, q) => (p - (p % w)) - (q - (q % w)) || hash(salt, p) - hash(salt, q));
      for (const t of ts) {
        const ty = (t - (t % w)) / w, tx = t % w;
        let best = -1, bk = null;
        for (const s of cells) {
          const sy = (s - (s % w)) / w;
          if (sy <= ty || (s + w < N && c[s + w])) continue;
          const key = [sy, Math.abs((s % w) - tx) + (sy - ty), hash(salt ^ 0x5bd1e995, s)];
          if (bk && (key[0] < bk[0] || (key[0] === bk[0] && (key[1] > bk[1] || (key[1] === bk[1] && key[2] <= bk[2]))))) continue;
          const q = cells.indexOf(s);
          cells[q] = t;
          const ok = connected(cells, w);
          cells[q] = s;
          if (ok) { best = s; bk = key; }
        }
        if (best < 0) continue;
        c[t] = c[best] & ~(JR | JU); c[best] = 0;
        cells[cells.indexOf(best)] = t;
        relink(b, cells);
        moves.push([best, t]);
        break;
      }
    }
    return moves;
  }

  /**
   * Is cell t the mouth of a notch: empty, over an empty cell that is walled in on both sides (a block or the board's
   * edge) and has a block or the floor under it: a hole one wide and one deep. (A deeper crack is only oozed into from
   * above: a mouth into any crack would let a stack pour into its wells by itself, and pay more a key than a Normal
   * board; scripts/jelly-test.cjs, fairness.)
   */
  function mouth(b, t) {
    const w = b.w, c = b.cells, x = t % w, u = t - w;
    return u >= 0 && !c[t] && !c[u] && (x === 0 || !!c[u - 1]) && (x === w - 1 || !!c[u + 1]) && (u < w || !!c[u - w]);
  }

  /** Could the lump of these just-set cells ([[x, y]]) ooze at all: a block of it over an empty cell, or a mouth beside its bottom row? */
  function mayOoze(b, abs) {
    const w = b.w, c = b.cells;
    let minY = Infinity;
    for (const [, y] of abs) minY = Math.min(minY, y);
    for (const [x, y] of abs) {
      if (x < 0 || x >= w || y <= 0 || y >= b.h) continue;
      const i = y * w + x;
      if (!c[i - w]) return true;
      if (y === minY && ((x > 0 && mouth(b, i - 1)) || (x + 1 < w && mouth(b, i + 1)))) return true;
    }
    return false;
  }

  /**
   * Settling (after a lock, a clear, or anything that took blocks away): links to nothing are dropped, then step after
   * step until nothing moves:
   *   1. every lump that nothing holds up falls, whole, until it rests (drop); if none does,
   *   2. every resting lump oozes at most one block one step (ooze);
   *   3. the rows that fills (the game's own rule: fullRows) clear.
   * Every step lowers a block or takes blocks away, so it ends (at most the board's blocks times its height steps; a
   * guard stops it there anyway). Returns the steps, [{ before (the board before it), falls: [[x, y, dy]], moves:
   * [[from, to]], after (the board after it moved, before its rows went), rows, removed }]; those that clear rows are
   * the cascades. quick: no before, falls, moves or after (a test or a simulation). from: the lowest row that can move
   * (a board that rested before a clear or a piece: nothing lower can), 0 to look at everything. The ooze's ties are
   * seeded from the game's seed and its piece count (the same board settles the same way on Undo and replay).
   */
  function cascade(g, b, quick, from) {
    if (b.fixJoins) b.fixJoins();
    const waves = [];
    const salt = ((g && g.seed) | 0) ^ Math.imul(((g && g.s && g.s.pieces) | 0) + 1, 0x9e3779b1);
    let low = from || 0;
    const cap = b.w * b.h * b.h + b.h;
    for (let guard = 0; guard < cap; guard++) {
      const before = quick ? null : b.cells.slice();
      const rest = {};
      const falls = drop(b, low, rest);
      const moves = falls.length ? [] : ooze(b, salt + guard, low, rest.lumps);
      if (!falls.length && !moves.length) break;
      for (const [, t] of moves) low = Math.min(low, (t - (t % b.w)) / b.w);
      for (const [, y, dy] of falls) low = Math.min(low, y - dy);
      const after = quick ? null : b.cells.slice();
      const rows = g && g.fullRows ? g.fullRows(b) : b.fullRows();
      const removed = rows.length ? b.clearRows(rows) : [];
      waves.push({ before, falls: quick ? null : falls, moves: quick ? null : moves, after, rows, removed });
      if (rows.length) low = Math.min(low, rows[0]);
    }
    return waves;
  }

  /** Mirror World turned the board left to right: each row's links across turn with it (JOIN_R at x was at w − 2 − x). */
  function flipLinks(b) {
    const w = b.w, c = b.cells;
    for (let y = 0; y < b.h; y++) {
      const o = y * w;
      // After the flip the cell at x holds what was at w − 1 − x, its old link pointing the wrong way: the link that
      // now starts at x is the one the cell at x + 1 carried.
      const r = [];
      for (let x = 0; x < w; x++) r.push(x + 1 < w ? c[o + x + 1] & JR : 0);
      for (let x = 0; x < w; x++) c[o + x] = (c[o + x] & ~JR) | (c[o + x] ? r[x] : 0);
    }
    b.fixJoins();
  }

  /** How many of a lock's waves cleared rows (its cascades). */
  const cleared = (res) => (res && res.cascade ? res.cascade.filter((wv) => wv.rows && wv.rows.length).length : 0);

  // ---- the engine's hooks ------------------------------------------------------------------------------------------

  /** The extension a Jelly board's Game gets (Recipe.engine). */
  function makeExt() {
    // Simulated placements' cascades, counted per piece in play (Best Fit asks about each candidate of each piece).
    let simKey = null, simPieces = -1, simN = 0;
    const simulating = (g, b) => b !== g.board;
    return {
      afterPlace(g, b, abs) { link(b, abs); },
      afterClear(g, b, res) {
        if (simulating(g, b)) {
          // A placement that clears nothing moves only if the piece can ooze (a block over a hole, or its bottom row
          // beside one): most do not, and are judged as they are.
          if ((!res.rows || !res.rows.length) && res.cells && !mayOoze(b, res.cells)) return;
          if (simKey !== g.piece || simPieces !== g.s.pieces) { simKey = g.piece; simPieces = g.s.pieces; simN = 0; }
          if (simN >= (L.Jelly ? L.Jelly.SIM_CAP : SIM_CAP)) return;
          simN++;
          // A simulated board rested before the piece: only the piece's lump, and what is at or above its lowest
          // cleared row, can move.
          const rows = res.rows || [];
          let low = rows.length ? rows[0] : b.h;
          for (const [, y] of res.cells || []) low = Math.min(low, y);
          if (!res.cells) low = 0;
          const waves = cascade(g, b, true, Math.max(0, low - rows.length));
          if (waves.length) res.cascade = (res.cascade || []).concat(waves);
          return;
        }
        const waves = cascade(g, b, false);
        if (waves.length) res.cascade = (res.cascade || []).concat(waves);
      },
      // Settle's and Trapdoor's "would the piece still fit" test: what would fall, falls in it too.
      roomAfter(g, b) { cascade(g, b, true); },
      afterChange(g, kind) {
        const b = g.board;
        if (kind === 'flip') flipLinks(b);
        // A Trapdoor takes the bottom row: nothing is left hanging (everything comes down one), but links to what it
        // took go, and the rule is the same as its test's (roomAfter).
        else if (kind === 'trapdoor') cascade(g, b, true);
        else b.fixJoins();
      },
      // After the lock is scored: the rows its cascades cleared are worth half (res.own and s.own: what pays, the
      // records and Earn; the lines shown count them whole); each wave that cleared rows scores 100 times its number
      // (points, never pay), and the board counts its cascades.
      step(g, res) {
        const waves = res && res.cascade;
        if (!waves || !waves.length) return;
        let k = 0, pts = 0, own = 0;
        waves.forEach((wv) => {
          if (!wv.rows || !wv.rows.length) return;
          k++; pts += 100 * k;
          for (const row of wv.removed || []) for (let x = 0; x < row.length; x++) if (!(row[x] & CELL.FOREIGN)) own++;
        });
        res.waves = k;
        if (!k) return;
        const cut = (own / g.w) * (1 - CASCADE_WORTH);
        res.cascadeOwn = own / g.w;
        res.own -= cut;
        g.s.own = (g.s.own || 0) - cut;
        g.s.score += pts;
        res.score = (res.score || 0) + pts;
        g.s.cascades = (g.s.cascades || 0) + k;
        g.s.bestCascade = Math.max(g.s.bestCascade || 0, k);
      },
      summary(g) { return { cascades: g.s.cascades || 0, best: g.s.bestCascade || 0 }; },
    };
  }

  // ---- Free Play ----------------------------------------------------------------------------------------------------

  /** The rows a lock's cascade cleared, all its waves. */
  const cascadeRows = (r) => (r && r.cascade ? r.cascade.reduce((a, wv) => a + ((wv.rows && wv.rows.length) || 0), 0) : 0);

  /**
   * Free Play's controller on a Jelly board: the plain lock, heard for the piece's own rows only (r.heardLater: the
   * cascade's are heard wave by wave as the board shows them), then the cascades counted.
   */
  function controller(play, game) {
    if (!game || !isOn(game.recipe)) return null;
    return {
      id: 'jelly',
      onLock(r) {
        const later = cascadeRows(r);
        if (later) r.heardLater = later;
        this.base.onLock(r);
        if (later) {
          // Each wave's clear is heard when the board shows it (js/jellyview.js replays them); with no replay, now.
          const rp = play.view && play.view.jelly && play.view.jelly.replay;
          const snd = play.app.sound;
          if (rp) rp.onWave = (wv) => { if (wv.rows.length && snd) snd.play('clear', wv.rows.length); };
          else if (snd) snd.play('clear', later);
        }
        const k = r.waves || 0;
        if (!k) return;
        const F = play.app.store.state.stats.free;
        F.cascades = (F.cascades || 0) + k;
        F.bestCascade = Math.max(F.bestCascade || 0, k);
        play.app.store.touch();
      },
    };
  }

  // ---- the part ------------------------------------------------------------------------------------------------------

  const part = {
    key: 'jelly', order: 30, mod: 'jelly', owns: ['mods.jelly'],
    // Rated for pay on a piece's own rows (a cascade's are plain); feats and skill combos are off, and Tornado is
    // refused (it would tear every lump apart).
    rules(r, R) {
      if (!isOn(r)) return;
      R.noFeats = true;
      R.refuse.tornado = 'Not on a Jelly board';
    },
    engine(game) { return isOn(game.recipe) ? makeExt() : null; },
    controller,
    // A saved board's numbers for its summary (the Cascades tile): kept in its s.
    summary(x, g) { return g && isOn(g.recipe) ? { cascades: (g.s && g.s.cascades) || 0, best: (g.s && g.s.bestCascade) || 0 } : null; },
    stats: { free: { cascades: 0, bestCascade: 0 } },
  };
  if (Recipe) Recipe.part(part);

  // Knock-On: counts on any Jelly board (the feats' rule does not hide it).
  if (L.Achievements) {
    L.Achievements.add({
      id: 'knock_on', group: 'play', name: 'Knock-On', desc: 'Three cascades that clear lines, from one piece. On a Jelly board.', pay: 30, on: 'play',
      counts: (r) => isOn(r),
      test: (s, e) => !!e.r && e.r.special !== 'settle' && (e.r.waves || cleared(e.r)) >= 3,
    });
  }

  L.Jelly = { link, lumps, drop, ooze, connected, cascade, flipLinks, cleared, cascadeRows, isOn, part, SIM_CAP, CASCADE_WORTH };
})(typeof globalThis !== 'undefined' ? globalThis : this);
