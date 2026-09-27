// Lull — Free Play's sandbox: what a block can be made of (ice, oil, steel, TNT, water), the chain reactions between
// them and the older toys (bombs, anvils, drills, lasers), the combos Free Play pays a little extra for, the chain
// multiplier, and the odds behind the Luck items. Pure rules, no drawing: the engine calls in here as a piece sets
// (Game.react, Game.conduct, Game.afterClear) and records everything that happened on the lock result, so the
// renderer can play it back and Free Play can pay for it.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Game, BOMB_PATTERN } = L;

  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const OUT = 255; // Board.get outside the walls
  const matOf = (v) => (v && v !== OUT ? v & CELL.MAT : 0);
  const present = (v) => !!v && v !== OUT;
  const MAT_NAMES = { [CELL.ICE]: 'ice', [CELL.OIL]: 'oil', [CELL.STEEL]: 'steel', [CELL.TNT]: 'TNT', [CELL.WATER]: 'water' };

  // ---- materials ------------------------------------------------------------------------------------------------------
  //
  //  ice    frozen by Frost (and every block it touches). Brittle: a blast, an anvil, a drill or a T-spin that touches
  //         it shatters it, and all the ice joined to it. Fire melts it to water instead of burning it.
  //  oil    soaked by Oil. Burns whatever its colour, and lights everything it touches.
  //  steel  made by Steel. Blasts, fire, drills, anvils and purges leave it be (an anvil comes to rest on it); it
  //         carries a laser beam into every row it reaches, and lightning through all of it.
  //  TNT    set by TNT. Goes off when a blast, fire, lightning, an anvil or a drill reaches it — or when its row clears.
  //  water  poured by Water: it runs down and sideways into the lowest hole it can reach. Fire stops at it, lightning
  //         runs through it, and Frost turns all of it to ice.

  /** Sets a cell's material, keeping its colour. */
  function setMat(b, x, y, m) { const v = b.get(x, y); if (present(v)) b.set(x, y, (v & ~CELL.MAT) | m); }

  /** Every cell joined to (x, y) through 4-neighbours for which ok(v) holds. */
  function flood(b, starts, ok) {
    const seen = new Set(), out = [], stack = [];
    for (const [x, y] of starts) if (b.inside(x, y) && ok(b.get(x, y))) stack.push([b.wx(x), y]);
    while (stack.length) {
      const [x, y] = stack.pop(), k = y * b.w + x;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([x, y, b.get(x, y)]);
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        if (b.inside(nx, ny) && !seen.has(ny * b.w + b.wx(nx)) && ok(b.get(nx, ny))) stack.push([b.wx(nx), ny]);
      }
    }
    return out;
  }

  /**
   * Runs a chain reaction to the end. Events:
   *   blast (x, y)      a bomb's thirteen-block diamond (steel stands); TNT in it goes off, oil in it flares, ice in
   *                     it or touching it shatters
   *   shatter (x, y)    the ice there (or, if it is already gone, the ice touching it) and all ice joined to it breaks
   *   flare (x, y)      burning oil lights every block around (x, y)
   *   fire (x, y, c)    burns the block there and spreads through blocks of colour c and through oil; ice it meets
   *                     melts to water, TNT goes off, steel and water stop it
   *   charge (x, y)     lightning into the block there: through steel and water it runs on, frying everything they
   *                     touch (TNT goes off, ice shatters, oil burns); anything else just catches fire
   * Each step is recorded { kind, wave, at, cells (removed: [x, y, v]), melt, net, cause } in the order it happened;
   * wave counts the links in the chain, so the renderer can play it back one link after another.
   */
  function chain(game, seeds, steps) {
    const b = game.board, q = seeds.map((e) => Object.assign({ wave: 0 }, e)), gone = new Set();
    let guard = 0;
    const after = (list, wave, shock, cause) => {
      for (const [x, y, v] of list) {
        const m = matOf(v);
        if (m === CELL.TNT && !gone.has(y * b.w + x)) { gone.add(y * b.w + x); q.push({ kind: 'blast', x, y, wave, cause }); }
        else if (m === CELL.ICE) q.push({ kind: 'shatter', x, y, wave, cause });
        else if (m === CELL.OIL) q.push({ kind: 'flare', x, y, wave, cause });
      }
      if (shock) for (const [x, y] of list) for (const [dx, dy] of N4) if (matOf(b.get(x + dx, y + dy)) === CELL.ICE) q.push({ kind: 'shatter', x: b.wx(x + dx), y: y + dy, wave, cause });
    };
    while (q.length && guard++ < 600) {
      const e = q.shift(), w = e.wave + 1;
      const step = { kind: e.kind, wave: e.wave, at: [e.x, e.y], cells: [], cause: e.cause || null };
      if (e.kind === 'blast') {
        for (const [dx, dy] of BOMB_PATTERN) {
          const x = e.x + dx, y = e.y + dy;
          if (!b.inside(x, y)) continue;
          const v = b.get(x, y);
          if (!v || game.tough(v)) continue;
          b.set(x, y, 0);
          step.cells.push([b.wx(x), y, v]);
        }
        after(step.cells, w, true, e.cause);
      } else if (e.kind === 'shatter') {
        const isIce = (v) => matOf(v) === CELL.ICE;
        const starts = isIce(b.get(e.x, e.y)) ? [[e.x, e.y]] : N4.map(([dx, dy]) => [e.x + dx, e.y + dy]);
        step.cells = flood(b, starts, isIce);
        for (const [x, y] of step.cells) b.set(x, y, 0);
      } else if (e.kind === 'flare') {
        for (const [dx, dy] of N4) { const v = b.get(e.x + dx, e.y + dy); if (present(v)) q.push({ kind: 'fire', x: b.wx(e.x + dx), y: e.y + dy, color: v & CELL.COLOR, wave: w, cause: e.cause }); }
        continue;
      } else if (e.kind === 'fire') {
        const v0 = b.get(e.x, e.y), m0 = matOf(v0);
        if (!present(v0)) continue;
        step.melt = [];
        const melt = (x, y) => { setMat(b, x, y, CELL.WATER); step.melt.push([b.wx(x), y]); };
        if (m0 === CELL.ICE) melt(e.x, e.y);
        else if (m0 === CELL.TNT) { if (!gone.has(e.y * b.w + b.wx(e.x))) { gone.add(e.y * b.w + b.wx(e.x)); q.push({ kind: 'blast', x: b.wx(e.x), y: e.y, wave: w, cause: e.cause }); } continue; }
        else if (m0 === CELL.STEEL || m0 === CELL.WATER) continue;
        else {
          // It burns: through its own colour, through oil, and from oil into anything.
          const color = e.color, seen = new Set(), stack = [[b.wx(e.x), e.y]];
          while (stack.length) {
            const [x, y] = stack.pop(), k = y * b.w + x;
            if (seen.has(k)) continue;
            seen.add(k);
            const v = b.get(x, y), oily = matOf(v) === CELL.OIL;
            step.cells.push([x, y, v]);
            for (const [dx, dy] of N4) {
              const nx = b.wx(x + dx), ny = y + dy, nv = b.get(nx, ny), nm = matOf(nv);
              if (!present(nv) || seen.has(ny * b.w + nx)) continue;
              if (nm === CELL.ICE) { seen.add(ny * b.w + nx); melt(nx, ny); }
              else if (nm === CELL.TNT) { seen.add(ny * b.w + nx); if (!gone.has(ny * b.w + nx)) { gone.add(ny * b.w + nx); q.push({ kind: 'blast', x: nx, y: ny, wave: w, cause: e.cause }); } }
              else if (nm === CELL.STEEL || nm === CELL.WATER) continue;
              else if (nm === CELL.OIL || oily || (nv & CELL.COLOR) === color) stack.push([nx, ny]);
            }
          }
          for (const [x, y] of step.cells) b.set(x, y, 0);
        }
      } else if (e.kind === 'charge') {
        const v0 = b.get(e.x, e.y), m0 = matOf(v0);
        if (!present(v0)) continue;
        if (m0 !== CELL.STEEL && m0 !== CELL.WATER) {
          // Nothing to carry it: the block it hits catches fire.
          q.push({ kind: 'fire', x: e.x, y: e.y, color: v0 & CELL.COLOR, wave: e.wave, cause: e.cause });
          step.kind = 'strike';
          steps.push(step);
          continue;
        }
        const wire = (v) => matOf(v) === CELL.STEEL || matOf(v) === CELL.WATER;
        step.net = flood(b, [[e.x, e.y]], wire).map(([x, y]) => [x, y]);
        const inNet = new Set(step.net.map(([x, y]) => y * b.w + x)), touched = new Set();
        for (const [x, y] of step.net) for (const [dx, dy] of N4) {
          const nx = b.wx(x + dx), ny = y + dy, nv = b.get(nx, ny), k = ny * b.w + nx;
          if (!present(nv) || inNet.has(k) || touched.has(k)) continue;
          touched.add(k);
          const nm = matOf(nv);
          if (nm === CELL.TNT) { if (!gone.has(k)) { gone.add(k); q.push({ kind: 'blast', x: nx, y: ny, wave: w, cause: e.cause }); } }
          else if (nm === CELL.ICE) q.push({ kind: 'shatter', x: nx, y: ny, wave: w, cause: e.cause });
          else if (nm === CELL.OIL) q.push({ kind: 'fire', x: nx, y: ny, color: nv & CELL.COLOR, wave: w, cause: e.cause });
          else { b.set(nx, ny, 0); step.cells.push([nx, ny, nv]); }
        }
      }
      if (step.cells.length || (step.melt && step.melt.length) || step.net) steps.push(step);
    }
    return steps;
  }

  /** Totals over a chain's steps, added onto the lock result. */
  function tally(result, steps) {
    for (const st of steps) {
      if (st.kind === 'blast') {
        result.explosions = (result.explosions || 0) + 1;
        // Ice caught in a blast shatters with it.
        const ice = st.cells.filter(([, , v]) => matOf(v) === CELL.ICE).length;
        if (ice) result.shattered = (result.shattered || 0) + ice;
      }
      if (st.kind === 'fire') result.burned = (result.burned || 0) + st.cells.length;
      if (st.kind === 'shatter') { result.shattered = (result.shattered || 0) + st.cells.length; if (st.cause === 'spin') result.spinShatter = (result.spinShatter || 0) + st.cells.length; }
      if (st.melt) result.melted = (result.melted || 0) + st.melt.length;
      if (st.kind === 'charge') { result.net = Math.max(result.net || 0, st.net.length); result.fried = (result.fried || 0) + st.cells.length; }
    }
  }

  /** Frost: the piece and every block it touches freeze; water touching it freezes all through. */
  function freeze(game, cells) {
    const b = game.board, froze = [];
    const ice = (x, y) => { setMat(b, x, y, CELL.ICE); froze.push([b.wx(x), y]); };
    for (const [x, y] of cells) ice(x, y);
    const mine = new Set(cells.map(([x, y]) => y * b.w + b.wx(x)));
    for (const [x, y] of cells) for (const [dx, dy] of N4) {
      const nx = b.wx(x + dx), ny = y + dy, v = b.get(nx, ny), m = matOf(v);
      if (!present(v) || mine.has(ny * b.w + nx)) continue;
      mine.add(ny * b.w + nx);
      if (m === CELL.WATER) for (const [wx, wy] of flood(b, [[nx, ny]], (u) => matOf(u) === CELL.WATER)) { mine.add(wy * b.w + wx); ice(wx, wy); }
      else if (m !== CELL.STEEL && m !== CELL.TNT && m !== CELL.ICE) ice(nx, ny);
    }
    return froze;
  }

  /**
   * The lowest empty cell water at (x, y) can run to, moving down and sideways (never up) — and of those the farthest,
   * so water runs to the end of a channel and fills it from the back, leaving the way in open for the rest.
   */
  function lowest(b, x, y) {
    const seen = new Set([y * b.w + x]), q = [[x, y, 0]];
    let best = q[0];
    for (let i = 0; i < q.length; i++) {
      const [cx, cy, d] = q[i];
      if (cy < best[1] || (cy === best[1] && d > best[2])) best = q[i];
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!b.inside(nx, ny) || b.filled(nx, ny) || seen.has(ny * b.w + b.wx(nx))) continue;
        seen.add(ny * b.w + b.wx(nx));
        q.push([b.wx(nx), ny, d + 1]);
      }
    }
    return [best[0], best[1]];
  }

  /** Water: the piece's blocks run, lowest first, each into the lowest spot it can reach. */
  function pour(game, result) {
    const b = game.board, cells = result.cells.slice().sort((a, c) => a[1] - c[1] || a[0] - c[0]);
    result.flow = [];
    for (const [x, y] of cells) {
      const v = (b.get(x, y) & ~CELL.MAT) | CELL.WATER;
      b.set(x, y, 0);
      const [tx, ty] = lowest(b, x, y);
      b.set(tx, ty, v);
      result.flow.push([x, y, tx, ty, v]);
    }
    result.cells = result.flow.map(([, , x, y]) => [x, y]);
    // Covered holes it filled: a block (not more water) right above where it came to rest.
    result.flooded = result.cells.filter(([x, y]) => { const v = b.get(x, y + 1); return present(v) && matOf(v) !== CELL.WATER; }).length;
  }

  /**
   * The sandbox's part in setting a piece (called by Game.lock and Game.bore before full rows are found): what the new
   * block is made of, and every chain reaction that follows from it or from the item it carried.
   */
  Game.prototype.react = function (p, result) {
    const b = this.board, sp = p.special, seeds = [];
    const cells = result.cells || [];
    if (sp === 'frost') result.froze = freeze(this, cells);
    else if (sp === 'oil' || sp === 'steel' || sp === 'tnt') for (const [x, y] of cells) setMat(b, x, y, sp === 'oil' ? CELL.OIL : sp === 'steel' ? CELL.STEEL : CELL.TNT);
    else if (sp === 'water') pour(this, result);
    else if ((sp === 'torch' || sp === 'bolt') && cells.length) {
      // Not a block at all: a flame or a bolt, spent where it lands.
      const [x, y] = cells[0];
      b.set(x, y, 0);
      result.cells = [];
      result.strike = [x, y];
      if (sp === 'torch') {
        for (const [dx, dy] of N4) { const v = b.get(x + dx, y + dy); if (present(v)) seeds.push({ kind: 'fire', x: b.wx(x + dx), y: y + dy, color: v & CELL.COLOR }); }
      } else if (present(b.get(x, y - 1))) seeds.push({ kind: 'charge', x, y: y - 1 });
      result.fizzle = !seeds.length;
    }
    // The older toys meet the new materials.
    const hit = (list, shock) => {
      for (const [x, y, v] of list) {
        const m = matOf(v);
        if (m === CELL.TNT) seeds.push({ kind: 'blast', x, y });
        else if (m === CELL.ICE) seeds.push({ kind: 'shatter', x, y });
        else if (m === CELL.OIL) seeds.push({ kind: 'flare', x, y });
      }
      if (shock) for (const [x, y] of list) for (const [dx, dy] of N4) if (matOf(b.get(x + dx, y + dy)) === CELL.ICE) seeds.push({ kind: 'shatter', x: b.wx(x + dx), y: y + dy });
    };
    if (result.blast) {
      result.explosions = 1;
      const ice = result.blast.filter(([, , v]) => matOf(v) === CELL.ICE).length;
      if (ice) result.shattered = ice;
      hit(result.blast, true);
    }
    if (result.smashed) hit(result.smashed, false);
    if (result.drilled) hit(result.drilled, false);
    if ((result.tspin || result.mini) && sp !== 'frost') {
      // A T-spin into ice: the jolt shatters it.
      for (const [x, y] of cells) for (const [dx, dy] of N4) if (matOf(b.get(x + dx, y + dy)) === CELL.ICE) seeds.push({ kind: 'shatter', x: b.wx(x + dx), y: y + dy, cause: 'spin' });
    }
    if (!sp || sp === 'golden') {
      // Tucked under an overhang: a block of its own right above one of its cells.
      const mine = new Set(cells.map(([x, y]) => x + ',' + y));
      result.covered = cells.some(([x, y]) => !mine.has(x + ',' + (y + 1)) && present(b.get(x, y + 1)));
    }
    if (seeds.length) {
      result.react = chain(this, seeds, []);
      tally(result, result.react);
    }
  };

  /** A laser's beam, carried by steel: every row a steel block in a beamed row is joined to is beamed too. */
  Game.prototype.conduct = function (result) {
    const b = this.board, rows = new Set(result.laser), seen = new Set(), todo = result.laser.slice();
    result.conducted = []; result.wires = [];
    while (todo.length) {
      const y = todo.pop();
      for (let x = 0; x < b.w; x++) {
        if (matOf(b.get(x, y)) !== CELL.STEEL || seen.has(y * b.w + x)) continue;
        const net = flood(b, [[x, y]], (v) => matOf(v) === CELL.STEEL);
        for (const [nx, ny] of net) {
          seen.add(ny * b.w + nx);
          if (!rows.has(ny)) { rows.add(ny); result.conducted.push(ny); todo.push(ny); }
        }
        if (net.length > 1) result.wires.push(net.map(([nx, ny]) => [nx, ny]));
      }
    }
    result.laser = Array.from(rows).sort((a, c) => a - c);
  };

  /** TNT in a row that clears goes off where the row was, once the rows above have come down. */
  Game.prototype.afterClear = function (result) {
    const b = this.board, seeds = [];
    (result.rows || []).forEach((y, i) => {
      const row = result.removed[i] || [];
      // Rows are cleared lowest first, so i rows below this one went too.
      for (let x = 0; x < row.length; x++) if (matOf(row[x]) === CELL.TNT) seeds.push({ kind: 'blast', x, y: Math.min(b.h - 1, y - i), cause: 'fuse' });
    });
    if (!seeds.length) return;
    result.fused = seeds.length;
    result.post = chain(this, seeds, []);
    tally(result, result.post);
  };

  // ---- the chain multiplier -----------------------------------------------------------------------------------------
  //
  // The streak is the run of back-to-back quads and T-spins (this one included). It alone sets the multiplier: in
  // Free Play an eighth per link (so it only starts to pay past eight in a row), ×2.5 at most, reached at twenty; in
  // Classic a half per link, ×10 at most at twenty, on the lines Classic banks (never its score). The chain — the
  // number to be proud of — counts the streak and the combo together, and is shown beside the multiplier.

  const Chain = {
    RELAXED: { step: 1 / 8, cap: 2.5 },
    CLASSIC: { step: 0.5, cap: 10 },
    /** The multiplier a streak of n earns. */
    mult(n, mode) { const c = mode === 'classic' ? Chain.CLASSIC : Chain.RELAXED; return Math.min(c.cap, Math.max(1, (n || 0) * c.step)); },
    /** The streak after a lock (the engine's back-to-back count already includes it). */
    streak(g) { return g.s.b2b >= 0 ? g.s.b2b + 1 : 0; },
    /** The chain count: the streak plus the combo. */
    count(g) { return Chain.streak(g) + Math.max(0, g.s.combo); },
    /** "×1.75", "×2", "×1.125". */
    fmt(m) { return '×' + String(Math.round(m * 1000) / 1000); },
  };

  // ---- combos ---------------------------------------------------------------------------------------------------------
  //
  // Specific things worth a little more: a bonus in lines, a short boost (the next few clears pay more) or points.
  // Free Play has no clock, so none of it is for repeating: on one board a combo pays in full the first time, half
  // the second, a quarter the third and nothing after (it still shows); boosts come with the first two only. The
  // item ones cost more in items than they ever pay back, so they are for fun, never for farming.

  const COMBOS = [
    { id: 'painted', kind: 'skill', name: 'Painted Row', how: 'Clear a row that is all one colour.', lines: 5, score: 1000 },
    { id: 'pocket', kind: 'skill', name: 'From the Pocket', how: 'A quad with an I brought back out of hold.', lines: 2, score: 300 },
    { id: 'keyhole', kind: 'skill', name: 'Keyhole', how: 'Clear a line with a piece tucked in under an overhang.', lines: 2, score: 300 },
    { id: 'twinspin', kind: 'skill', name: 'Twin Spin', how: 'Two T-spin doubles back to back.', lines: 4, boost: { x: 1.5, clears: 3 }, score: 800 },
    { id: 'bare', kind: 'skill', name: 'Bare Hands', how: 'Fifty pieces in a row without an item, clearing at least twelve lines.', lines: 0, boost: { x: 1.25, clears: 5 }, score: 500 },
    { id: 'shatterspin', kind: 'item', name: 'Shatter Spin', how: 'A T-spin into frozen blocks: the jolt shatters the ice.', lines: 4, boost: { x: 1.5, clears: 3 }, score: 1000 },
    { id: 'coldsnap', kind: 'item', name: 'Cold Snap', how: 'Shatter six or more frozen blocks at once.', lines: 3, score: 500 },
    { id: 'chain2', kind: 'item', name: 'Chain Reaction', how: 'One explosion sets off another.', lines: 4, score: 600 },
    { id: 'chain3', kind: 'item', name: 'Daisy Chain', how: 'Three explosions or more in one chain.', lines: 6, boost: { x: 1.5, clears: 3 }, score: 1500 },
    { id: 'fuse', kind: 'item', name: 'Fuse Line', how: 'Clear a line with TNT in it: it goes off as the line goes.', lines: 3, score: 500 },
    { id: 'wildfire', kind: 'item', name: 'Wildfire', how: 'Burn twelve blocks or more in one go.', lines: 3, score: 600 },
    { id: 'conductor', kind: 'item', name: 'Conductor', how: 'A laser beam carried by steel into another row.', lines: 4, score: 800 },
    { id: 'livewire', kind: 'item', name: 'Live Wire', how: 'Lightning through six or more blocks of steel or water.', lines: 4, score: 800 },
    { id: 'undertow', kind: 'item', name: 'Undertow', how: 'Water runs into two covered holes or more, and a line clears.', lines: 3, score: 500 },
    { id: 'eye', kind: 'item', name: 'Eye of the Storm', how: 'A perfect clear from a Tornado.', lines: 12, score: 3000 },
    { id: 'scorched', kind: 'item', name: 'Scorched Earth', how: 'Empty the board with fire, ice or explosions (the Nuke does not count).', lines: 8, score: 2000 },
  ];
  const BY_ID = Object.fromEntries(COMBOS.map((c) => [c.id, c]));
  const SHARE = [1, 0.5, 0.25];
  const BARE = { pieces: 50, lines: 12 };

  /** What a combo pays the (k+1)th time on one board. */
  function reward(c, k) {
    const f = SHARE[k] || 0;
    return { lines: Math.floor((c.lines || 0) * f), boost: c.boost && k < 2 ? c.boost : null, score: c.score || 0 };
  }

  /**
   * The combos a lock result makes (Free Play). Keeps its own few counters on the board's stats: pieces and lines
   * since the last item (Bare Hands; apply() resets them) and whether the last clear was a T-spin double.
   */
  function detect(r, g) {
    const s = g.s, out = [];
    const counts = r.special !== 'settle' && r.special !== 'tornado';
    if (counts) { s.clean = (s.clean || 0) + 1; s.cleanLines = (s.cleanLines || 0) + (r.lines || 0); }
    if (r.lines && (r.removed || []).some((row) => { const c = row[0] & CELL.COLOR; return c && c !== 8 && row.every((v) => (v & CELL.COLOR) === c); })) out.push('painted');
    if (r.lines >= 4 && r.type === 'I' && r.fromHold && !r.special) out.push('pocket');
    if (r.lines && r.covered) out.push('keyhole');
    const tsd = !!(r.tspin && r.lines === 2);
    if (tsd && r.b2b && s.lastTsd) out.push('twinspin');
    if (r.lines) s.lastTsd = tsd;
    if ((s.clean || 0) >= BARE.pieces && (s.cleanLines || 0) >= BARE.lines) { out.push('bare'); s.clean = 0; s.cleanLines = 0; }
    if (r.spinShatter) out.push('shatterspin');
    if ((r.shattered || 0) >= 6) out.push('coldsnap');
    if ((r.explosions || 0) >= 3) out.push('chain3');
    else if ((r.explosions || 0) >= 2) out.push('chain2');
    if (r.fused && r.lines) out.push('fuse');
    if ((r.burned || 0) >= 12) out.push('wildfire');
    if (r.conducted && r.conducted.length) out.push('conductor');
    if ((r.net || 0) >= 6) out.push('livewire');
    if ((r.flooded || 0) >= 2 && r.lines) out.push('undertow');
    if (r.special === 'tornado' && r.perfect) out.push('eye');
    if ((r.react || r.post) && g.board.isEmpty() && r.special !== 'tornado') out.push('scorched');
    return out;
  }

  const Combos = { LIST: COMBOS, get: (id) => BY_ID[id], reward, detect, SHARE, BARE };

  // ---- luck -------------------------------------------------------------------------------------------------------------
  //
  // Golden Piece: gold for your next five clears, each paying ×3 (on top of the chain and any boost). Worth it with
  // good play and not without: what it adds is five clears × their usual pay × 2. Built for quads (a quad pays 5), it
  // adds 5 × 5 × 2 = 50 for its 35 — about 1.4 times its price; on ordinary clears (about 2 each) it adds 5 × 2 × 2 =
  // 20, a little over half. Unused gold waits on the board (hold and rewind keep it), so it is never wasted on a
  // piece that clears nothing.
  //
  // Jackpot: three reels, each landing on a blank (7 in 16), a gem (5), a bomb (3) or a star (1). It pays:
  //   ★★★ 2,000 lines · ⦵⦵⦵ 300 · ✹✹✹ three Demolition items · two ★ 400 · one ★ 60 · two ⦵ 80 · two ✹ one Demolition
  //   item · anything else nothing.
  // With the Demolition items at their prices (about 66 each), a pull is worth about 45 lines on average for its 50
  // (0.9 — the house keeps a tenth); more than half of all pulls pay nothing; one in ninety pays 400 or more, and one
  // in 4,096 pays 2,000. The test works it out exactly from the reels.

  const REELS = [
    { id: 'blank', icon: '·', w: 7 },
    { id: 'gem', icon: '⦵', w: 5 },
    { id: 'bomb', icon: '✹', w: 3 },
    { id: 'star', icon: '★', w: 1 },
  ];
  const PAYS = [
    { match: 'star3', label: '★★★', lines: 2000 },
    { match: 'gem3', label: '⦵⦵⦵', lines: 300 },
    { match: 'bomb3', label: '✹✹✹', items: 3 },
    { match: 'star2', label: '★★', lines: 400 },
    { match: 'star1', label: '★', lines: 60 },
    { match: 'gem2', label: '⦵⦵', lines: 80 },
    { match: 'bomb2', label: '✹✹', items: 1 },
  ];

  /** What three reels pay: { lines, items (Demolition items), label } — or nothing. */
  function jackpotPay(reels) {
    const n = (id) => reels.filter((r) => r === id).length;
    const key = n('star') === 3 ? 'star3' : n('gem') === 3 ? 'gem3' : n('bomb') === 3 ? 'bomb3' : n('star') === 2 ? 'star2' : n('star') === 1 ? 'star1' : n('gem') === 2 ? 'gem2' : n('bomb') === 2 ? 'bomb2' : null;
    const p = PAYS.find((x) => x.match === key);
    return p ? { lines: p.lines || 0, items: p.items || 0, label: p.label } : { lines: 0, items: 0, label: null };
  }

  /** One reel, from a random number in [0, 1). */
  function reel(u) {
    const tot = REELS.reduce((a, r) => a + r.w, 0);
    let t = u * tot;
    for (const r of REELS) { if (t < r.w) return r.id; t -= r.w; }
    return REELS[0].id;
  }

  /** The exact odds: expected lines per pull (items at itemValue each), the chance of nothing, of 400 or more. */
  function jackpotOdds(itemValue) {
    const tot = REELS.reduce((a, r) => a + r.w, 0);
    let ev = 0, bust = 0, big = 0, top = 0;
    for (const a of REELS) for (const b of REELS) for (const c of REELS) {
      const p = (a.w * b.w * c.w) / (tot * tot * tot), pay = jackpotPay([a.id, b.id, c.id]);
      const v = pay.lines + pay.items * itemValue;
      ev += p * v;
      if (!v) bust += p;
      if (v >= 400) big += p;
      top = Math.max(top, v);
    }
    return { ev, bust, big, top };
  }

  const Luck = {
    GOLD_CLEARS: 5, GOLD_X: 3,
    /** What gold adds over its clears, if they would have paid `pay` each. */
    goldValue(pay) { return Luck.GOLD_CLEARS * pay * (Luck.GOLD_X - 1); },
    REELS, PAYS, jackpotPay, reel, jackpotOdds,
  };

  Object.assign(L, { Sandbox: { chain, flood, freeze, pour, lowest, matOf, MAT_NAMES }, Chain, Combos, Luck });
})(typeof globalThis !== 'undefined' ? globalThis : this);
