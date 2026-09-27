// Lull — Free Play's sandbox: matter and energy on the board, the settle that plays them out, the discoveries it
// pays a little for, the chain multiplier, the Luck odds and the daily gift. Pure rules, no drawing.
//
// What makes the falling-sand games fun (The Powder Toy, Noita, People Playground) — and what Lull takes from them:
//   - A few simple rules that are always the same. Sand always piles, water always finds the lowest hole, heat always
//     melts ice. You learn them once and can predict them, so you can plan with them.
//   - Every material meets every other. The rules are a table (heat, cold, acid, current, blasts, weight), not a list
//     of special cases, so things combine in ways nobody wrote down: fire boils the water that was feeding a vine,
//     steam drifts up to the ice and rains back into the hole below.
//   - You watch it happen. The world steps cell by cell; a chain unfolds in front of you instead of being announced.
//   - Cause and effect you set up on purpose: lay oil, then a spark; pour water, then drop a seed. Experiments pay off
//     in discoveries, not in scripted outcomes.
//   - Spectacle with consequence: what burns is gone, what melts runs, what freezes holds.
// How it fits Lull: calm, a grid, lines as the currency. So the world is the board itself, stepped slowly and
// quietly for a moment after a piece sets (never on its own clock, never in the way of the next piece); the only
// score is still full rows, which clear whenever the settle fills one; and the discoveries are small, found once,
// shown softly. Tetrominoes stay exactly as they were: matter only comes in when an item turns the piece into it.
//
// Matter (bits 8–11 of a cell, js/board.js; bits 12–15 hold its state):
//   grains   sand, seed, powder        fall, slide off edges into piles, sink through liquids
//   liquids  water, oil, acid, lava    fall and run sideways into the lowest hole they can reach, under overhangs
//                                      too; heavier ones sink under lighter ones (oil floats on water); lava is slow
//   gas      steam                     rises, drifts, fades; ice turns it back into water (rain)
//   solids   ice, steel, glass, vine, plain blocks and stone          stay where they are
//   fire     a flame on a cell: burns a few steps, then is gone
// Energy: heat (fire, lava, a spark), cold (ice), acid, current (through steel and water), blasts (powder, bombs).
// What acts on what is TABLE below; each entry is one line of step().
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { CELL, Game, BOMB_PATTERN } = L;
  const { MAT, ICE, OIL, STEEL, POWDER, WATER, SAND, STEAM, FIRE, GLASS, SEED, VINE, ACID, LAVA } = CELL;

  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const OUT = 255; // Board.get outside the walls
  const STONE = 8; // lava sets into a plain grey block
  const matOf = (v) => (v && v !== OUT ? v & MAT : 0);
  const present = (v) => !!v && v !== OUT;
  const stOf = (v) => (v >>> 12) & 15;
  const withSt = (v, s) => (v & 0x0fff) | ((s & 15) << 12);
  /** The same block (its colour kept) made of m, in state s. */
  const remake = (v, m, s) => ((v & CELL.COLOR) || 8) | m | ((s & 15) << 12);

  // ---- the materials ---------------------------------------------------------------------------------------------

  const K_SOLID = 1, K_GRAIN = 2, K_LIQUID = 3, K_GAS = 4, K_FIRE = 5;
  const NAMES = { 0: 'block', [ICE]: 'ice', [OIL]: 'oil', [STEEL]: 'steel', [POWDER]: 'powder', [WATER]: 'water', [SAND]: 'sand', [STEAM]: 'steam', [FIRE]: 'fire', [GLASS]: 'glass', [SEED]: 'seed', [VINE]: 'vine', [ACID]: 'acid', [LAVA]: 'lava' };
  const KIND = new Uint8Array(16), DENS = new Uint8Array(16), BURN = new Uint8Array(16), EATS = new Uint8Array(16), CONDUCT = new Uint8Array(16);
  const def = (m, kind, o) => { const k = m >> 8; KIND[k] = kind; DENS[k] = (o && o.dens) || 0; BURN[k] = (o && o.burn) || 0; EATS[k] = o && o.eats ? 1 : 0; CONDUCT[k] = o && o.conduct ? 1 : 0; };
  def(0, K_SOLID, { eats: 1 });
  def(ICE, K_SOLID, { eats: 1 });
  def(STEEL, K_SOLID, { conduct: 1 });
  def(GLASS, K_SOLID, { eats: 1 });
  def(VINE, K_SOLID, { burn: 4, eats: 1 });
  def(SAND, K_GRAIN, { dens: 3, eats: 1 });
  def(SEED, K_GRAIN, { dens: 3, burn: 2, eats: 1 });
  def(POWDER, K_GRAIN, { dens: 3, eats: 1 });
  def(WATER, K_LIQUID, { dens: 2, conduct: 1 });
  def(OIL, K_LIQUID, { dens: 1, burn: 9 });
  def(ACID, K_LIQUID, { dens: 2 });
  def(LAVA, K_LIQUID, { dens: 4 });
  def(STEAM, K_GAS, { dens: 0 });
  def(FIRE, K_FIRE);
  const kindOf = (v) => KIND[(v & MAT) >> 8];

  // How long things last, in steps of the settle.
  const LIFE = { flame: 5, steam: 7, lava: 12, acid: 3, sprout: 6, drink: 3, vineMax: 7 };

  /**
   * The interaction table: what each kind of energy (or meeting) does to each material. The rules themselves are in
   * step(); this is what the tests hold them to. A material with nothing listed for an energy shrugs it off.
   */
  const TABLE = {
    heat:    { oil: 'catches fire (burns long)', vine: 'catches fire', seed: 'catches fire', powder: 'explodes', ice: 'melts to water', sand: 'turns to glass', water: 'boils to steam', acid: 'boils to steam' },
    cold:    { water: 'freezes', steam: 'condenses to water', lava: 'sets into stone' },
    acid:    { block: 'dissolves', sand: 'dissolves', glass: 'dissolves', ice: 'dissolves', seed: 'dissolves', vine: 'dissolves', powder: 'dissolves, defused', water: 'dilutes the acid' },
    current: { steel: 'carries it', water: 'carries it', oil: 'catches fire', vine: 'catches fire', seed: 'catches fire', powder: 'explodes', ice: 'melts', sand: 'turns to glass' },
    blast:   { steel: 'stands', powder: 'goes off too', oil: 'catches fire', vine: 'catches fire', ice: 'shatters', glass: 'shatters', block: 'is blown away', grains: 'are thrown', liquids: 'are thrown' },
    water:   { seed: 'sprouts a vine', vine: 'is drunk, and the vine grows', lava: 'sets it into stone, and boils', fire: 'puts it out, and boils', acid: 'dilutes it' },
    weight:  { sand: 'sinks through liquids', seed: 'sinks through liquids', powder: 'sinks through liquids', water: 'sinks under oil', steam: 'rises through liquids' },
  };
  // What the meetings make: [what, and what].
  const MAKES = { glass: ['sand', 'heat'], steam: ['water', 'heat'], stone: ['lava', 'water'], vine: ['seed', 'water'], fire: ['oil', 'heat'], water: ['steam', 'ice'] };
  // Who brings each energy (the rest of a meeting is the table's row).
  const AGENTS = { heat: ['fire', 'lava'], cold: ['ice'], acid: ['acid'], current: ['steel', 'water'], blast: ['powder'], water: ['water'], weight: [] };

  // ---- one step of the settle ------------------------------------------------------------------------------------------

  const P_TIME = 1, P_LIFE = 2, P_ACID = 3, P_COLD = 4, P_HEAT = 5, P_BLAST = 6;

  function freshTally() {
    return { steps: 0, ignited: 0, burned: 0, steam: 0, condensed: 0, froze: 0, melted: 0, glassed: 0, quenched: 0, cooled: 0, dissolved: 0, diluted: 0, sprouted: 0, grew: 0, drank: 0, current: 0, explosions: 0, blasted: 0, shattered: 0, thrown: 0, floated: 0, consumed: 0, cascade: 0, clears: 0, bridged: 0, kinds: new Set() };
  }

  function makeSim(b) {
    const n = b.w * b.h;
    return { b, W: b.w, H: b.h, prev: new Uint16Array(n), claim: new Uint8Array(n), moved: new Uint8Array(n), lit: new Uint8Array(n), q: new Int16Array(n), from: new Int16Array(n), dist: new Int16Array(n), seen: new Int32Array(n), mark: 0, blasts: [], frames: [], n: 0, t: freshTally() };
  }

  /** A blast at (x0, y0): the bomb's diamond goes (steel stands); powder in it goes off next; beyond it, heat and a push. */
  function blast(sim, x0, y0, ev) {
    const { W, H } = sim, c = sim.b.cells, claim = sim.claim, T = sim.t, gone = [];
    T.explosions++; T.kinds.add('blast');
    const light = (i) => { if (!sim.lit[i]) { sim.lit[i] = 1; claim[i] = P_BLAST; sim.blasts.push([i % W, (i / W) | 0]); } };
    const inDiamond = (dx, dy) => Math.abs(dx) + Math.abs(dy) <= 2 || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1);
    for (const [dx, dy] of BOMB_PATTERN) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x, v = c[i], m = v & MAT;
      if (!v || m === STEEL) continue;
      if (m === POWDER && (dx || dy)) { light(i); continue; }
      if (BURN[m >> 8] && m !== SEED) { c[i] = remake(v, FIRE, BURN[m >> 8]); claim[i] = P_BLAST; T.ignited++; T.kinds.add('fire'); continue; }
      c[i] = 0; claim[i] = P_BLAST; gone.push([x, y, v]); T.blasted++; T.consumed++;
      if (m === ICE || m === GLASS) T.shattered++;
    }
    // Just beyond: flammables catch, powder goes off, and loose grains and liquids are thrown up and outward.
    for (let dy = 3; dy >= -3; dy--) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 10 || inDiamond(dx, dy)) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x, v = c[i], m = v & MAT, k = KIND[m >> 8];
      if (!v || claim[i] === P_BLAST) continue;
      if (m === POWDER) light(i);
      else if (BURN[m >> 8] && k !== K_GRAIN) { c[i] = remake(v, FIRE, BURN[m >> 8]); claim[i] = P_BLAST; T.ignited++; T.kinds.add('fire'); }
      else if (k === K_GRAIN || k === K_LIQUID) {
        const tx = x + Math.sign(dx), ty = Math.min(H - 1, y + (dy >= 0 ? 2 : 1));
        for (const [ax, ay] of [[tx, ty], [x, ty], [tx, y]]) {
          if (ax < 0 || ax >= W) continue;
          const j = ay * W + ax;
          if (c[j] || claim[j] === P_BLAST) continue;
          c[j] = v; c[i] = 0; claim[j] = claim[i] = P_BLAST; T.thrown++;
          break;
        }
      }
    }
    ev.push({ k: 'blast', x: x0, y: y0, gone });
  }

  /**
   * Where liquid at (x, y) runs: toward the lowest empty cell it can reach moving down and sideways (never up) through
   * empty cells or the rest of its own pool, the farthest of those. Returns the cell to move to: the first step on the
   * way when that is open, or — when the way is through its own pool — the far cell itself, the way water pressed
   * into a pool comes out at its lowest opening (so pools level out and a channel fills from the back). -1: stay.
   * Pressed from above (more liquid or grains on it), it also spreads along its own level to the farthest open cell.
   */
  function flow(sim, x, y, pressed) {
    const W = sim.W, start = y * W + x;
    let r = reach(sim, start, false);
    if (r.best >= 0) return r.first; // an open way down: one step along it
    const p = reach(sim, start, true);
    if (p.best >= 0) return p.best; // down only through its own pool: out at the far end
    return pressed && r.same >= 0 ? r.sameFirst : -1;
  }

  /** Breadth-first from a liquid cell, down and sideways through empty cells (and, with pool, its own liquid). */
  function reach(sim, start, pool) {
    const { W } = sim, c = sim.b.cells, q = sim.q, from = sim.from, seen = sim.seen, dist = sim.dist;
    const y = (start / W) | 0, mine = c[start] & MAT, mark = ++sim.mark;
    let head = 0, tail = 0, best = -1, bestY = y, bestD = 0, same = -1, sameD = 0;
    q[tail++] = start; from[start] = -1; seen[start] = mark; dist[start] = 0;
    while (head < tail) {
      const i = q[head++], cx = i % W, cy = (i / W) | 0, open = !c[i];
      // Through its pool, only the openings right at its edge count: the pool bulges out there, then that runs on.
      const edge = open && (!pool || c[from[i]]);
      if (edge && (cy < bestY || (cy === bestY && best >= 0 && dist[i] > bestD))) { best = i; bestY = cy; bestD = dist[i]; }
      if (open && cy === y && dist[i] > sameD) { same = i; sameD = dist[i]; }
      for (let k = 0; k < 3; k++) {
        const j = k === 0 ? (cy > 0 ? i - W : -1) : k === 1 ? (cx > 0 ? i - 1 : -1) : (cx < W - 1 ? i + 1 : -1);
        if (j < 0 || seen[j] === mark) continue;
        const u = c[j];
        if (u && !(pool && (u & MAT) === mine && (u & 0xf000) === (c[start] & 0xf000))) continue;
        seen[j] = mark; from[j] = i; dist[j] = dist[i] + 1; q[tail++] = j;
      }
    }
    const firstOf = (t) => { let f = t; while (f >= 0 && from[f] !== start) f = from[f]; return f; };
    return { best, first: best >= 0 ? firstOf(best) : -1, same, sameFirst: same >= 0 ? firstOf(same) : -1 };
  }

  /**
   * One step. Reactions read the board as it was at the start of the step (so the order cells are visited in does not
   * matter) and write with a priority — a blast beats heat beats cold beats acid beats growth beats time — then loose
   * matter moves. Records the step's changes as a frame; returns whether anything changed.
   */
  function step(sim) {
    const { W, H } = sim, c = sim.b.cells, prev = sim.prev, claim = sim.claim, T = sim.t, ev = [];
    prev.set(c); claim.fill(0);
    const put = (i, v, p) => { if (claim[i] >= p) return false; claim[i] = p; c[i] = v; return true; };
    const kind = (k) => T.kinds.add(k);
    // Blasts lit last step go off first.
    const lit = sim.blasts;
    sim.blasts = [];
    for (const [x, y] of lit) blast(sim, x, y, ev);

    const light = (j) => { if (!sim.lit[j]) { sim.lit[j] = 1; claim[j] = P_BLAST; sim.blasts.push([j % W, (j / W) | 0]); } };
    // Heat arriving at cell j (from fire, lava or current): the table's heat row.
    const heat = (j, byCurrent) => {
      const v = prev[j], m = v & MAT;
      if (!v || claim[j] === P_BLAST) return;
      if (BURN[m >> 8]) { if (put(j, remake(v, FIRE, BURN[m >> 8]), P_HEAT)) { T.ignited++; kind('fire'); } }
      else if (m === POWDER) light(j);
      else if (m === ICE) { if (put(j, remake(v, WATER, 0), P_HEAT)) { T.melted++; kind('heat'); } }
      else if (m === SAND) { if (put(j, remake(v, GLASS, 0), P_HEAT)) { T.glassed++; kind('heat'); } }
      else if (!byCurrent && (m === WATER || m === ACID)) { if (put(j, remake(v, STEAM, LIFE.steam), P_HEAT)) { T.steam++; kind('steam'); } }
    };
    const par = sim.n & 1;

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, v = prev[i], m = v & MAT;
      if (!m || claim[i] === P_BLAST) continue;
      const nbr = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx < 0 || nx >= W || ny < 0 || ny >= H ? -1 : ny * W + nx; };
      if (m === FIRE) {
        let wet = false;
        for (const [dx, dy] of N4) { const j = nbr(dx, dy); if (j < 0) continue; if ((prev[j] & MAT) === WATER) wet = true; heat(j, false); }
        const life = wet ? 0 : stOf(v) - 1;
        if (life <= 0) { if (put(i, 0, P_TIME)) { T.burned++; T.consumed++; } } else put(i, withSt(v, life), P_TIME);
      } else if (m === LAVA) {
        let quench = false;
        for (const [dx, dy] of N4) { const j = nbr(dx, dy); if (j < 0) continue; const nm = prev[j] & MAT; if (nm === WATER || nm === ICE) quench = true; heat(j, false); }
        const life = stOf(v) - 1;
        if (quench) { if (put(i, STONE, P_COLD)) { T.quenched++; kind('cold'); } }
        else if (life <= 0) { if (put(i, STONE, P_TIME)) T.cooled++; }
        else put(i, withSt(v, life), P_TIME);
      } else if (m === ICE) {
        for (const [dx, dy] of N4) {
          const j = nbr(dx, dy);
          if (j >= 0 && (prev[j] & MAT) === WATER && put(j, remake(prev[j], ICE, 0), P_COLD)) { T.froze++; kind('cold'); }
        }
      } else if (m === STEAM) {
        let cold = false;
        for (const [dx, dy] of N4) { const j = nbr(dx, dy); if (j >= 0 && (prev[j] & MAT) === ICE) cold = true; }
        if (cold) { if (put(i, remake(v, WATER, 0), P_COLD)) { T.condensed++; kind('cold'); } }
        else { const life = stOf(v) - 1; put(i, life <= 0 || y === H - 1 ? 0 : withSt(v, life), P_TIME); }
      } else if (m === ACID) {
        let wet = false;
        for (const [dx, dy] of N4) { const j = nbr(dx, dy); if (j >= 0 && (prev[j] & MAT) === WATER) wet = true; }
        if (wet) { if (put(i, remake(v, WATER, 0), P_ACID)) { T.diluted++; kind('acid'); } continue; }
        // It eats one block a step: the one below, else one beside it.
        const side = par ? 1 : -1;
        for (const [dx, dy] of [[0, -1], [side, 0], [-side, 0]]) {
          const j = nbr(dx, dy);
          if (j < 0 || !prev[j] || !EATS[(prev[j] & MAT) >> 8] || claim[j] >= P_ACID) continue;
          if (!put(j, 0, P_ACID)) continue;
          T.dissolved++; T.consumed++; kind('acid');
          const s = stOf(v) - 1;
          put(i, s > 0 ? withSt(v, s) : 0, P_ACID);
          ev.push({ k: 'eat', x: j % W, y: (j / W) | 0, v: prev[j] });
          break;
        }
      } else if (m === SEED) {
        for (const [dx, dy] of N4) {
          const j = nbr(dx, dy);
          if (j < 0 || (prev[j] & MAT) !== WATER || claim[j] >= P_LIFE) continue;
          const dir = x < W / 2 ? 8 : 0; // grows toward the middle first
          if (put(i, remake(v, VINE, LIFE.sprout | dir), P_LIFE)) { put(j, 0, P_LIFE); T.sprouted++; T.drank++; kind('growth'); }
          break;
        }
      } else if (m === VINE) {
        let e = stOf(v) & 7;
        const dir = stOf(v) & 8, e0 = e;
        if (e < LIFE.vineMax) for (const [dx, dy] of N4) {
          const j = nbr(dx, dy);
          if (j < 0 || (prev[j] & MAT) !== WATER || claim[j] >= P_LIFE) continue;
          if (put(j, 0, P_LIFE)) { e = Math.min(LIFE.vineMax, e + LIFE.drink); T.drank++; kind('growth'); }
          break;
        }
        if (e > 0) {
          // It grows along the row it is in (its own way first), then up.
          const side = dir ? 1 : -1;
          for (const [dx, dy] of [[side, 0], [0, 1], [-side, 0]]) {
            const j = nbr(dx, dy);
            if (j < 0 || prev[j] || c[j] || claim[j] >= P_LIFE) continue;
            const nd = dx ? (dx > 0 ? 8 : 0) : dir;
            if (put(j, remake(v, VINE, (e - 1) | nd), P_LIFE)) { e = 0; T.grew++; kind('growth'); }
            break;
          }
        }
        if (e !== e0) put(i, withSt(v, e | dir), P_LIFE);
      }
      if (CONDUCT[m >> 8] && claim[i] <= P_TIME) {
        // Current: a charge moves one cell a step along steel and water, and never back (head, then tail, then rest).
        const s = stOf(v) & 3;
        if (s === 2) {
          put(i, withSt(v, 1), P_TIME);
          T.current++; kind('current');
          for (const [dx, dy] of N4) { const j = nbr(dx, dy); if (j >= 0 && !CONDUCT[(prev[j] & MAT) >> 8]) heat(j, true); }
        } else if (s === 1) put(i, withSt(v, 0), P_TIME);
        else {
          for (const [dx, dy] of N4) {
            const j = nbr(dx, dy);
            if (j >= 0 && CONDUCT[(prev[j] & MAT) >> 8] && (stOf(prev[j]) & 3) === 2) { put(i, withSt(v, 2), P_TIME); break; }
          }
        }
      }
    }

    // Weight: grains and liquids fall (lava every other step), sinking through anything lighter; grains slide off
    // edges; liquids run toward the lowest hole they can reach. Then steam rises.
    const moved = sim.moved;
    moved.fill(0);
    const move = (i, j) => { const t = c[j]; c[j] = c[i]; c[i] = t; moved[i] = moved[j] = 1; };
    const lighter = (u, d) => { const k = kindOf(u); return (k === K_LIQUID || k === K_GAS) && DENS[(u & MAT) >> 8] < d; };
    for (let y = 0; y < H; y++) for (let k = 0; k < W; k++) {
      const x = par ? k : W - 1 - k, i = y * W + x, v = c[i];
      if (!v || moved[i] || claim[i] === P_BLAST) continue;
      const m = v & MAT, kd = KIND[m >> 8];
      if (kd !== K_GRAIN && kd !== K_LIQUID) continue;
      if (m === LAVA && par) continue;
      if (y === 0 && kd === K_GRAIN) continue;
      const d = DENS[m >> 8], bi = y > 0 ? i - W : -1, bv = y > 0 ? c[bi] : OUT;
      if (y > 0 && (!bv || (lighter(bv, d) && !moved[bi] && claim[bi] !== P_BLAST))) {
        if ((bv & MAT) === OIL && m === WATER) T.floated++;
        move(i, bi);
        continue;
      }
      if (kd === K_GRAIN) {
        const s1 = ((x * 7 + y * 3 + sim.n) & 1) ? 1 : -1;
        for (const dx of [s1, -s1]) {
          const nx = x + dx;
          if (nx < 0 || nx >= W || c[i + dx] || c[bi + dx]) continue;
          move(i, bi + dx);
          break;
        }
      } else {
        const above = y < H - 1 ? kindOf(c[i + W]) : 0;
        const to = flow(sim, x, y, above === K_LIQUID || above === K_GRAIN);
        if (to >= 0) move(i, to);
      }
    }
    for (let y = H - 2; y >= 0; y--) for (let k = 0; k < W; k++) {
      const x = par ? k : W - 1 - k, i = y * W + x, v = c[i];
      if ((v & MAT) !== STEAM || moved[i] || claim[i] === P_BLAST) continue;
      const ai = i + W, av = c[ai];
      if (!av || (kindOf(av) === K_LIQUID && !moved[ai])) { move(i, ai); continue; }
      const dx = ((x + y + sim.n) & 1) ? 1 : -1;
      if (x + dx >= 0 && x + dx < W && !c[i + dx]) move(i, i + dx);
    }

    const d = [];
    for (let i = 0; i < c.length; i++) if (c[i] !== prev[i]) d.push(i, c[i]);
    sim.n++; T.steps++;
    if (d.length || ev.length) sim.frames.push({ d, ev: ev.length ? ev : null });
    return d.length > 0 || sim.blasts.length > 0;
  }

  /** The lowest empty cell reachable from (x, y) moving down and sideways through empty cells (the farthest of those). */
  function lowestFrom(b, x, y) {
    const seen = new Set([y * b.w + x]), q = [[x, y, 0]];
    let best = q[0];
    for (let i = 0; i < q.length; i++) {
      const [cx, cy, d] = q[i];
      if (cy < best[1] || (cy === best[1] && d > best[2])) best = q[i];
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= b.w || ny < 0 || b.cells[ny * b.w + nx] || seen.has(ny * b.w + nx)) continue;
        seen.add(ny * b.w + nx);
        q.push([nx, ny, d + 1]);
      }
    }
    return [best[0], best[1]];
  }

  /**
   * The settle ran long (a liquid rocking on a ledge, a long burn): everything finishes at once. Flames and steam are
   * gone, lava sets, charges end, then every grain drops straight down and every liquid runs to the lowest spot it
   * can reach — each move only ever goes down, so it always ends.
   */
  function resolve(sim) {
    const { W, H } = sim, c = sim.b.cells, prev = sim.prev, T = sim.t;
    prev.set(c);
    while (sim.blasts.length) { const lit = sim.blasts; sim.blasts = []; sim.claim.fill(0); for (const [x, y] of lit) blast(sim, x, y, []); }
    for (let i = 0; i < c.length; i++) {
      const v = c[i], m = v & MAT;
      if (m === FIRE) { c[i] = 0; T.burned++; T.consumed++; }
      else if (m === STEAM) c[i] = 0;
      else if (m === LAVA) { c[i] = STONE; T.cooled++; }
      else if (CONDUCT[m >> 8] && stOf(v)) c[i] = withSt(v, 0);
    }
    for (let guard = 0, again = true; again && guard < 64; guard++) {
      again = false;
      for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, v = c[i], kd = kindOf(v);
        if (!v || (kd !== K_GRAIN && kd !== K_LIQUID)) continue;
        let ty = y, tx = x;
        if (kd === K_GRAIN) { while (ty > 0 && !c[(ty - 1) * W + x]) ty--; }
        else { const lo = lowestFrom(sim.b, x, y); if (lo[1] < y) { tx = lo[0]; ty = lo[1]; } }
        if (ty < y) { c[ty * W + tx] = v; c[i] = 0; again = true; }
      }
    }
    const d = [];
    for (let i = 0; i < c.length; i++) if (c[i] !== prev[i]) d.push(i, c[i]);
    if (d.length) sim.frames.push({ d, ev: [{ k: 'rest' }] });
  }

  /** Liquid resting under a solid block or a grain: a covered hole it filled. */
  function coveredLiquid(b) {
    let n = 0;
    for (let y = 0; y < b.h - 1; y++) for (let x = 0; x < b.w; x++) {
      const v = b.cells[y * b.w + x], u = b.cells[(y + 1) * b.w + x];
      if (v && u && kindOf(v) === K_LIQUID && (kindOf(u) === K_SOLID || kindOf(u) === K_GRAIN)) n++;
    }
    return n;
  }

  /** Anything on the board that could do something in a settle (steel, glass and plain blocks never do on their own). */
  function stirring(b) {
    for (let i = 0; i < b.cells.length; i++) { const m = b.cells[i] & MAT; if (m && m !== STEEL && m !== GLASS) return true; }
    return false;
  }

  /** Rows full of solid things (a flame or a wisp of steam does not fill a cell). */
  function solidRows(b) {
    const rows = [];
    for (let y = 0; y < b.h; y++) {
      let full = true;
      for (let x = 0; x < b.w && full; x++) { const v = b.cells[y * b.w + x], m = v & MAT; if (!v || m === FIRE || m === STEAM) full = false; }
      if (full) rows.push(y);
    }
    return rows;
  }

  const CAP = 110, ROUNDS = 6;

  /**
   * The settle after a piece is set (Game.lock, after its own full rows cleared; also bore, Settle and Tornado). Steps
   * the board until nothing moves or changes (at most CAP steps a round, then resolve), clears any rows that filled,
   * and goes again while anything above them can fall (at most ROUNDS rounds). Records every step as a frame for the
   * renderer to play back: result.sim = { start, frames: [{ d: [index, value, …], ev } | { clear: rows, removed }] },
   * with the totals on the result (result.cascade: the lines it cleared). The board is final when this returns.
   */
  Game.prototype.simulate = function (result) {
    const b = this.board, pend = this.simPending || [];
    this.simPending = null;
    if (!pend.length && !stirring(b)) return null;
    const sim = makeSim(b), T = sim.t;
    for (const [x, y] of pend) { sim.lit[y * b.w + x] = 1; sim.blasts.push([x, y]); }
    const start = b.snapshot(), covered0 = coveredLiquid(b);
    let flooded = 0;
    for (let round = 0; round < ROUNDS; round++) {
      let busy = true;
      for (let n = 0; busy && (n < CAP || sim.blasts.length); n++) busy = step(sim);
      if (busy) resolve(sim);
      // Covered holes liquid ran into (counted before any row it filled clears away).
      flooded = Math.max(flooded, coveredLiquid(b) - covered0);
      const rows = solidRows(b);
      if (!rows.length) break;
      // A vine hanging over a gap in a row that clears: it bridged it.
      for (const y of rows) for (let x = 0; x < b.w; x++) if ((b.cells[y * b.w + x] & MAT) === VINE && y > 0 && !b.cells[(y - 1) * b.w + x]) T.bridged++;
      const removed = b.clearRows(rows);
      sim.frames.push({ clear: rows, removed });
      T.cascade += rows.length; T.clears++;
    }
    if (!sim.frames.length) return null;
    result.sim = { start, frames: sim.frames, steps: T.steps };
    for (const k of Object.keys(T)) if (k !== 'kinds' && T[k]) result[k] = (result[k] || 0) + T[k];
    result.kinds = Array.from(T.kinds);
    result.flooded = flooded;
    return result.sim;
  };

  Game.prototype.fullRows = function () { return solidRows(this.board); };

  // ---- items entering the world -----------------------------------------------------------------------------------------

  // The piece becomes matter (its shape kept): [material, starting state].
  const MATTER = { sand: [SAND, 0], seed: [SEED, 0], tnt: [POWDER, 0], water: [WATER, 0], oil: [OIL, 0], acid: [ACID, LIFE.acid], lava: [LAVA, LIFE.lava], frost: [ICE, 0], steel: [STEEL, 0], torch: [FIRE, LIFE.flame] };

  /** Sets a cell's material, keeping its colour. */
  function setMat(b, x, y, m, s) { const v = b.get(x, y); if (present(v)) b.set(x, y, remake(v, m, s || 0)); }

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
   * The sandbox's part in setting a piece (Game.lock and Game.bore call it before full rows are found): what the new
   * blocks are made of, and what the item starts off. The settle that follows (simulate) plays it out.
   */
  Game.prototype.react = function (p, result) {
    const b = this.board, sp = p.special, pend = (this.simPending = []);
    const cells = result.cells || [];
    const mt = MATTER[sp];
    if (mt) for (const [x, y] of cells) setMat(b, x, y, mt[0], mt[1]);
    if (sp === 'bomb' && result.blastCenter) pend.push(result.blastCenter);
    if (sp === 'bolt' && cells.length) {
      // Not a block: a bolt, spent on the block it lands on. Steel and water carry it on; anything else takes the heat
      // (a plain block is scorched away).
      const [x, y] = cells[0];
      b.set(x, y, 0);
      result.cells = [];
      result.strike = [x, y];
      const v = y > 0 ? b.get(x, y - 1) : 0, m = matOf(v);
      if (!present(v)) result.fizzle = true;
      else if (CONDUCT[m >> 8]) b.set(x, y - 1, withSt(v, 2));
      else if (m === POWDER) pend.push([x, y - 1]);
      else if (BURN[m >> 8]) b.set(x, y - 1, remake(v, FIRE, BURN[m >> 8]));
      else if (m === ICE) b.set(x, y - 1, remake(v, WATER, 0));
      else if (m === SAND) b.set(x, y - 1, remake(v, GLASS, 0));
      else if (m === LAVA || m === ACID) result.fizzle = true;
      else { b.set(x, y - 1, 0); result.scorched = [[x, y - 1, v]]; }
    }
    // The heavy tools set powder off where they meet it.
    for (const list of [result.smashed, result.drilled]) if (list) for (const [x, y, v] of list) if (matOf(v) === POWDER) pend.push([x, y]);
    if ((result.tspin || result.mini) && sp !== 'frost') {
      // A T-spin into ice: the jolt shatters all the ice it touches.
      const hit = [];
      for (const [x, y] of cells) for (const [dx, dy] of N4) if (matOf(b.get(x + dx, y + dy)) === ICE) hit.push([x + dx, y + dy]);
      const ice = flood(b, hit, (v) => matOf(v) === ICE);
      for (const [x, y] of ice) b.set(x, y, 0);
      if (ice.length) { result.spinShatter = ice.length; result.shattered = (result.shattered || 0) + ice.length; result.shards = ice; }
    }
    if (!sp || sp === 'golden') {
      // Tucked under an overhang: a block of its own right above one of its cells.
      const mine = new Set(cells.map(([x, y]) => x + ',' + y));
      result.covered = cells.some(([x, y]) => !mine.has(x + ',' + (y + 1)) && present(b.get(x, y + 1)));
    }
  };

  /** A laser's beam, carried by steel: every row a steel block in a beamed row is joined to is beamed too. */
  Game.prototype.conduct = function (result) {
    const b = this.board, rows = new Set(result.laser), seen = new Set(), todo = result.laser.slice();
    result.conducted = []; result.wires = [];
    while (todo.length) {
      const y = todo.pop();
      for (let x = 0; x < b.w; x++) {
        if (matOf(b.get(x, y)) !== STEEL || seen.has(y * b.w + x)) continue;
        const net = flood(b, [[x, y]], (v) => matOf(v) === STEEL);
        for (const [nx, ny] of net) {
          seen.add(ny * b.w + nx);
          if (!rows.has(ny)) { rows.add(ny); result.conducted.push(ny); todo.push(ny); }
        }
        if (net.length > 1) result.wires.push(net.map(([nx, ny]) => [nx, ny]));
      }
    }
    result.laser = Array.from(rows).sort((a, c) => a - c);
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

  // ---- discoveries --------------------------------------------------------------------------------------------------
  //
  // Things worth a little more: a bonus in lines, a short boost (the next few clears pay more) or points. A few are
  // done by hand; the rest are discoveries — what the settle does when things meet. Free Play has no clock, so none
  // of it is for repeating: on one board each pays in full the first time, half the second, a quarter the third and
  // nothing after (it still shows); boosts come with the first two only. What the items cost is always more than a
  // discovery pays, so they are for finding, never for farming. (Kept under the old name, Combos.)

  const COMBOS = [
    { id: 'painted', kind: 'skill', name: 'Painted Row', how: 'Clear a row that is all one colour.', lines: 5, score: 1000 },
    { id: 'pocket', kind: 'skill', name: 'From the Pocket', how: 'A quad with an I brought back out of hold.', lines: 2, score: 300 },
    { id: 'keyhole', kind: 'skill', name: 'Keyhole', how: 'Clear a line with a piece tucked in under an overhang.', lines: 2, score: 300 },
    { id: 'twinspin', kind: 'skill', name: 'Twin Spin', how: 'Two T-spin doubles back to back.', lines: 4, boost: { x: 1.5, clears: 3 }, score: 800 },
    { id: 'bare', kind: 'skill', name: 'Bare Hands', how: 'Fifty pieces in a row without a power-up, clearing at least twelve lines.', lines: 0, boost: { x: 1.25, clears: 5 }, score: 500 },
    { id: 'steam', kind: 'item', name: 'First Mist', how: 'Heat meets water, and steam rises.', lines: 2, score: 300 },
    { id: 'rain', kind: 'item', name: 'Rain', how: 'Steam drifts up to ice and falls back as water.', lines: 3, score: 500 },
    { id: 'glass', kind: 'item', name: 'Glassblower', how: 'Heat turns sand to glass.', lines: 2, score: 300 },
    { id: 'quench', kind: 'item', name: 'Quench', how: 'Lava meets water and sets into stone.', lines: 2, score: 300 },
    { id: 'sprout', kind: 'item', name: 'Sprout', how: 'A seed finds water and grows.', lines: 2, score: 300 },
    { id: 'slick', kind: 'item', name: 'Oil Slick', how: 'Water sinks under oil, and the oil rises.', lines: 1, score: 200 },
    { id: 'bridge', kind: 'item', name: 'Hanging Garden', how: 'A vine grows out over a gap, and a line clears through it.', lines: 4, boost: { x: 1.25, clears: 3 }, score: 800 },
    { id: 'coldsnap', kind: 'item', name: 'Cold Snap', how: 'Ice freezes six or more water in one settle.', lines: 3, score: 500 },
    { id: 'etch', kind: 'item', name: 'Etching', how: 'Acid eats six or more blocks in one settle.', lines: 3, score: 500 },
    { id: 'wildfire', kind: 'item', name: 'Wildfire', how: 'Twelve or more things catch fire in one settle.', lines: 3, score: 600 },
    { id: 'livewire', kind: 'item', name: 'Live Wire', how: 'Current runs through six or more cells of steel or water.', lines: 4, score: 800 },
    { id: 'chain2', kind: 'item', name: 'Chain Reaction', how: 'One explosion sets off another.', lines: 4, score: 600 },
    { id: 'chain3', kind: 'item', name: 'Daisy Chain', how: 'Three explosions or more in one settle.', lines: 6, boost: { x: 1.5, clears: 3 }, score: 1500 },
    { id: 'undertow', kind: 'item', name: 'Undertow', how: 'Liquid runs into two covered holes or more, and a line clears.', lines: 3, score: 500 },
    { id: 'cascade', kind: 'item', name: 'Cascade', how: 'A line clears, what was above it settles, and another line clears.', lines: 5, boost: { x: 1.5, clears: 3 }, score: 1000 },
    { id: 'domino', kind: 'item', name: 'Domino', how: 'Three different reactions in one settle end in a line clear.', lines: 6, boost: { x: 1.5, clears: 3 }, score: 1500 },
    { id: 'shatterspin', kind: 'item', name: 'Shatter Spin', how: 'A T-spin into ice: the jolt shatters it.', lines: 4, boost: { x: 1.5, clears: 3 }, score: 1000 },
    { id: 'conductor', kind: 'item', name: 'Conductor', how: 'A laser beam carried by steel into another row.', lines: 4, score: 800 },
    { id: 'eye', kind: 'item', name: 'Eye of the Storm', how: 'A perfect clear from a Tornado.', lines: 12, score: 3000 },
    { id: 'scorched', kind: 'item', name: 'Scorched Earth', how: 'Empty the board with fire, acid or explosions (the Nuke does not count).', lines: 8, score: 2000 },
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
   * What a lock result found (Free Play). Keeps its own few counters on the board's stats: pieces and lines since the
   * last item (Bare Hands; apply() resets them) and whether the last clear was a T-spin double.
   */
  function detect(r, g) {
    const s = g.s, out = [];
    const counts = r.special !== 'settle' && r.special !== 'tornado';
    if (counts) { s.clean = (s.clean || 0) + 1; s.cleanLines = (s.cleanLines || 0) + (r.lines || 0); }
    if (r.lines && (r.removed || []).some((row) => { const c = row[0] & CELL.COLOR; return c && c !== 8 && row.every((v) => (v & CELL.COLOR) === c && !(v & MAT)); })) out.push('painted');
    if (r.lines >= 4 && r.type === 'I' && r.fromHold && !r.special) out.push('pocket');
    if (r.lines && r.covered) out.push('keyhole');
    const tsd = !!(r.tspin && r.lines === 2);
    if (tsd && r.b2b && s.lastTsd) out.push('twinspin');
    if (r.lines) s.lastTsd = tsd;
    if ((s.clean || 0) >= BARE.pieces && (s.cleanLines || 0) >= BARE.lines) { out.push('bare'); s.clean = 0; s.cleanLines = 0; }
    if (r.steam) out.push('steam');
    if (r.condensed) out.push('rain');
    if (r.glassed) out.push('glass');
    if (r.quenched) out.push('quench');
    if (r.sprouted) out.push('sprout');
    if (r.floated) out.push('slick');
    if (r.bridged) out.push('bridge');
    if ((r.froze || 0) >= 6) out.push('coldsnap');
    if ((r.dissolved || 0) >= 6) out.push('etch');
    if ((r.ignited || 0) >= 12) out.push('wildfire');
    if ((r.current || 0) >= 6) out.push('livewire');
    if ((r.explosions || 0) >= 3) out.push('chain3');
    else if ((r.explosions || 0) >= 2) out.push('chain2');
    if ((r.flooded || 0) >= 2 && r.lines) out.push('undertow');
    if ((r.clears || 0) >= 2 || (r.clears && r.rows && r.rows.length)) out.push('cascade');
    if ((r.kinds || []).length >= 3 && r.cascade) out.push('domino');
    if (r.spinShatter) out.push('shatterspin');
    if (r.conducted && r.conducted.length) out.push('conductor');
    if (r.special === 'tornado' && r.perfect) out.push('eye');
    if (r.sim && r.consumed && g.board.isEmpty() && r.special !== 'tornado') out.push('scorched');
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
  // Jackpot: three reels, each landing on a blank (7 in 16), a gem (5), a bolt (3) or a star (1). It pays:
  //   ★★★ 2,000 lines · ⦵⦵⦵ 300 · ϟϟϟ four Energy items · two ★ 400 · one ★ 60 · two ⦵ 80 · two ϟ an Energy item ·
  //   anything else nothing.
  // With the Energy items at their prices, a pull is worth a little under nine tenths of its 50 on average (the house
  // keeps the rest); more than half of all pulls pay nothing; one in ninety pays 400 or more, and one in 4,096 pays
  // 2,000. The test works it out exactly from the reels.

  const REELS = [
    { id: 'blank', icon: '·', w: 7 },
    { id: 'gem', icon: '⦵', w: 5 },
    { id: 'bomb', icon: 'ϟ', w: 3 },
    { id: 'star', icon: '★', w: 1 },
  ];
  const PAYS = [
    { match: 'star3', label: '★★★', lines: 2000 },
    { match: 'gem3', label: '⦵⦵⦵', lines: 300 },
    { match: 'bomb3', label: 'ϟϟϟ', items: 4 },
    { match: 'star2', label: '★★', lines: 400 },
    { match: 'star1', label: '★', lines: 60 },
    { match: 'gem2', label: '⦵⦵', lines: 80 },
    { match: 'bomb2', label: 'ϟϟ', items: 1 },
  ];
  const PRIZE_GROUP = 'energy';

  /** What three reels pay: { lines, items (Energy items), label } — or nothing. */
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
    GOLD_CLEARS: 5, GOLD_X: 3, PRIZE_GROUP,
    /** What gold adds over its clears, if they would have paid `pay` each. */
    goldValue(pay) { return Luck.GOLD_CLEARS * pay * (Luck.GOLD_X - 1); },
    REELS, PAYS, jackpotPay, reel, jackpotOdds,
  };

  // ---- the daily gift ---------------------------------------------------------------------------------------------------
  //
  // Once a calendar day (local date), three different power-ups, drawn by weight: the cheap, common ones often, the
  // dear ones rarely, Luck never. The draw is fixed by the save and the date, so reopening Lull or switching tabs
  // cannot re-roll it, and claiming is booked in the save at once, so it cannot be taken twice.

  const GIFT_TIERS = [{ upTo: 20, w: 8 }, { upTo: 30, w: 5 }, { upTo: 45, w: 3 }, { upTo: 70, w: 1.5 }, { upTo: Infinity, w: 0.5 }];
  const Gifts = {
    COUNT: 3, TIERS: GIFT_TIERS,
    /** An item's weight in the draw (0: never given). */
    weight(id) {
      const it = L.ITEMS && L.ITEMS[id];
      if (!it || it.group === 'luck') return 0;
      return GIFT_TIERS.find((t) => it.price <= t.upTo).w;
    },
    /** Three different items, drawn by weight from a random source (a function returning [0, 1)). */
    draw(rand) {
      const pool = (L.ITEM_ORDER || []).map((id) => [id, Gifts.weight(id)]).filter(([, w]) => w > 0), out = [];
      while (out.length < Gifts.COUNT && pool.length) {
        const tot = pool.reduce((a, [, w]) => a + w, 0);
        let t = rand() * tot, k = 0;
        while (k < pool.length - 1 && t >= pool[k][1]) { t -= pool[k][1]; k++; }
        out.push(pool[k][0]);
        pool.splice(k, 1);
      }
      return out;
    },
    /** The gift for one save on one date: the same every time it is asked for. */
    forDay(seed, day) { const rng = new L.RNG('lull:gift:' + seed + ':' + day); return Gifts.draw(() => rng.next()); },
    /** Can the gift be opened today? Never twice on a date, and never while the clock reads before the last one. */
    ready(state, day) { const last = state.gift && state.gift.last; return !last || day > last; },
    /** When the next one comes: the next local midnight. */
    nextAt(now) { const d = new Date(now); d.setHours(24, 0, 0, 0); return d.getTime(); },
  };

  Object.assign(L, { Sandbox: { step, flood, matOf, stOf, withSt, remake, NAMES, TABLE, MAKES, AGENTS, LIFE, MATTER, kindOf, K: { SOLID: K_SOLID, GRAIN: K_GRAIN, LIQUID: K_LIQUID, GAS: K_GAS, FIRE: K_FIRE }, solidRows, CAP, ROUNDS }, Chain, Combos, Luck, Gifts });
})(typeof globalThis !== 'undefined' ? globalThis : this);
