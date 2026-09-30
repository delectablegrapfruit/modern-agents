// Lull — Jelly, a board modifier (js/recipe.js): every piece sets as one soft lump, and a lump left hanging when rows
// clear falls as a whole until it rests, which can fill rows and clear them again (a cascade). Pure rules, no DOM: the
// links, the cascade, the part's rules and engine hooks, its Free Play controller, its stats and Knock-On. The look (the
// lumps, their wobble, the cascade replayed) is js/jellyview.js.
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
   * Jelly board never pays more per piece or per action than a Normal one (scripts/jelly-test.cjs, fairness).
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
  function lumps(b, from) {
    const w = b.w, c = b.cells, N = c.length, id = new Int32Array(N).fill(-1), list = [], st = new Int32Array(N);
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
  function drop(b, from) {
    const w = b.w, c = b.cells, N = c.length;
    const { id, list } = lumps(b, from);
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

  /**
   * The cascade on a board (after a clear, or anything that took blocks away): links to nothing are dropped, then
   * again and again: every lump left hanging falls, and the rows that fills (the game's own rule: fullRows) clear.
   * It ends when nothing falls, or a fall fills no row. Returns the waves, [{ before (the board before it fell; not
   * for a quick run), falls: [[x, y, dy]], rows, removed }]: the last may fill no row. quick: no record of the waves'
   * boards and falls (a test or a simulation); from: the lowest row a clear just took (a board that rested before it:
   * nothing lower can have lost its hold), 0 to look at everything.
   */
  function cascade(g, b, quick, from) {
    if (b.fixJoins) b.fixJoins();
    const waves = [];
    let low = from || 0;
    for (let guard = 0; guard <= b.h; guard++) {
      const before = quick ? null : b.cells.slice();
      const falls = drop(b, low);
      if (!falls.length) break;
      const rows = g && g.fullRows ? g.fullRows(b) : b.fullRows();
      const removed = rows.length ? b.clearRows(rows) : [];
      waves.push({ before, falls: quick ? null : falls, rows, removed });
      if (!rows.length) break;
      low = from ? rows[0] : 0;
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
          if (!res.rows || !res.rows.length) return;
          if (simKey !== g.piece || simPieces !== g.s.pieces) { simKey = g.piece; simPieces = g.s.pieces; simN = 0; }
          if (simN >= (L.Jelly ? L.Jelly.SIM_CAP : SIM_CAP)) return;
          simN++;
          // A simulated board rested before the piece: only what is at or above its lowest cleared row can fall.
          const waves = cascade(g, b, true, Math.max(0, Math.min.apply(null, res.rows)));
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
        waves.forEach((wv, i) => {
          if (!wv.rows || !wv.rows.length) return;
          k++; pts += 100 * (i + 1);
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

  /** Free Play's controller on a Jelly board: the plain lock, then the cascades counted and heard wave by wave. */
  function controller(play, game) {
    if (!game || !isOn(game.recipe)) return null;
    return {
      id: 'jelly',
      onLock(r) {
        this.base.onLock(r);
        const k = r.waves || 0;
        if (!k) return;
        const F = play.app.store.state.stats.free;
        F.cascades = (F.cascades || 0) + k;
        F.bestCascade = Math.max(F.bestCascade || 0, k);
        // Each wave's clear is heard when the board shows it (js/jellyview.js replays them).
        const rp = play.view && play.view.jelly && play.view.jelly.replay;
        const snd = play.app.sound;
        if (rp) rp.onWave = (wv) => { if (wv.rows.length && snd) snd.play('clear', wv.rows.length); };
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
      id: 'knock_on', group: 'play', name: 'Knock-On', desc: 'Three cascades that clear lines, from one piece. On a Jelly board.', pay: 60, on: 'play',
      counts: (r) => isOn(r),
      test: (s, e) => !!e.r && e.r.special !== 'settle' && (e.r.waves || cleared(e.r)) >= 3,
    });
  }

  L.Jelly = { link, lumps, drop, cascade, flipLinks, cleared, isOn, part, SIM_CAP, CASCADE_WORTH };
})(typeof globalThis !== 'undefined' ? globalThis : this);
