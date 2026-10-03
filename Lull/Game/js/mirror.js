// Lull — the Mirror modifier (a board option: js/recipe.js). A line runs down the middle of the well, and the piece in
// play has a copy: its reflection across the line (x → w − 1 − x), moving and turning with it as one rigid pair. The
// line is not a wall: the piece may cross it and meet its own reflection (the two may overlap; on an odd width the
// centre column is its own mirror). Everything that asks where a piece is sees the pair (the engine's `placed` hook:
// fits, the ghost, lock, Best Fit, hold and replace), so the pair collides with the stack on either side, and a board
// that is not symmetric (another option's threats) still plays true. Items that act at a spot act at both (`targets`:
// Drill, Bomb, Black Hole, Laser, Patch; a Ghost is the pair), Tornado shuffles the left half and mirrors that on the
// right, and Mirror World is refused. Pure rules, no DOM (the look is js/mirrorview.js; the controller only reads the
// board view it is given).
//
// Pay: the copy is placed by the piece, never by hand, so a piece is worth its pair: copies 2 (E doubles: f = 0.5 on
// Normal shapes, a row is worth w/20 Standard lines), wEff = w / 2 (the feats count on a Mirror board 20 wide).
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe } = L;

  /** Is Mirror on in this recipe? */
  const on = (r) => !!(r && r.mods && r.mods.mirror === true);

  /** A cell's reflection across the line on a board w wide. */
  const reflect = (w, x) => w - 1 - x;

  /**
   * The pair: the cells given (a piece's own, first, in their order), then each one's reflection that is not already
   * there (so a copy that overlaps its piece, or a cell in the centre column of an odd width, is counted once).
   */
  function pair(w, abs) {
    const n = abs.length, out = abs.slice();
    for (let i = 0; i < n; i++) {
      const x = w - 1 - abs[i][0], y = abs[i][1];
      let dup = false;
      for (let j = 0; j < n && !dup; j++) if (abs[j][0] === x && abs[j][1] === y) dup = true;
      for (let j = n; j < out.length && !dup; j++) if (out[j][0] === x && out[j][1] === y) dup = true;
      if (!dup) out.push([x, y]);
    }
    return out;
  }

  /**
   * Where a piece appears: centred in the left half, at the height it was given (a piece wider than the half keeps the
   * spot it had: centred on the board, overlapping its copy).
   */
  function spawnX(w, type, rot, x) {
    const b = type.rotBounds[rot], half = Math.floor(w / 2);
    if (b.w > half) return x;
    return Math.floor((half - b.w) / 2) - b.minX;
  }

  /**
   * Tornado on a Mirror board: the shuffle drawn on the game's stream (order[x]: the column that lands at x) gives the
   * left half its order (its left columns, in the order they come), never the one it has; the right half takes that
   * order's reflection, and the centre column of an odd width stays put. Every row keeps its count: still no clear.
   */
  function tornadoOrder(w, order) {
    const half = Math.floor(w / 2);
    const left = order.filter((c) => c < half);
    if (left.every((c, i) => c === i)) left.push(left.shift());
    const out = [];
    for (let x = 0; x < w; x++) out.push(x);
    for (let x = 0; x < half; x++) { out[x] = left[x]; out[w - 1 - x] = w - 1 - left[x]; }
    return out;
  }

  /**
   * How many blocks one half took (Full Blast and Event Horizon count one half: both of a pair's bombs go off at once).
   * The larger half, the centre column of an odd width counted in each: a pair that met at the line is not undercounted.
   */
  function halfCount(w, cells) {
    let left = 0, right = 0;
    for (const c of cells || []) {
      const x = c[0];
      if (2 * x <= w - 1) left++;
      if (2 * x >= w - 1) right++;
    }
    return Math.max(left, right);
  }

  /** Items that act at a spot: each acts at the spot's reflection too. */
  const PAIRED = new Set(['bomb', 'blackhole', 'bore', 'patch', 'laser']);

  /** The engine's hooks on a Mirror board (see Game hooks in js/engine.js). The copy is always derived: nothing is saved. */
  const EXT = {
    spawnAt(g, b, pos, type) {
      const rot = pos.rot != null ? pos.rot : 0, x = spawnX(b.w, type, rot, pos.x);
      return x === pos.x ? pos : Object.assign({}, pos, { x });
    },
    placed(g, b, abs) { return pair(b.w, abs); },
    targets(g, b, kind, cells) { return PAIRED.has(kind) ? pair(b.w, cells) : cells; },
    columns(g, b, kind, order) { return kind === 'tornado' ? tornadoOrder(b.w, order) : order; },
    comboCount(g, id, cells) { return id === 'fullblast' || id === 'horizon' ? halfCount(g.w, cells) : null; },
  };

  /**
   * Free Play's controls on a Mirror board (Recipe.compose): keys steer the piece (the copy follows); a mouse pointed
   * on the copy's side of the line (nearer the copy than the piece) aims the copy, so the copy lands under it; a touch
   * that starts on the copy's side turns that gesture's sideways moves around, so the copy follows the finger.
   */
  function controller(play, game) {
    // The piece's middle column (as Game.moveToward measures it), and whether column c is on its copy's side.
    const mid = (p) => { const cells = p.type.rots[p.rot]; return p.x + Math.round(cells.reduce((a, [cx]) => a + cx, 0) / cells.length - 0.01); };
    const copySide = (c) => {
      const g = play.game, p = g && g.piece;
      if (!p || c == null) return false;
      const own = mid(p), copy = g.w - 1 - own;
      return Math.abs(c - copy) < Math.abs(c - own);
    };
    return {
      id: 'mirror',
      input(kind, v, pos) {
        const g = play.game;
        if (!g || !g.piece) return v;
        if (kind === 'aim' && typeof v === 'number') return copySide(v) ? g.w - 1 - v : v;
        if (kind === 'touch' && v && typeof v === 'object' && !v.tapOnly && pos && play.view && play.view.lay) {
          const cell = play.view.cellClamped(pos[0], pos[1]);
          if (cell && copySide(cell.x)) return Object.assign({}, v, { swap: true });
        }
        return v;
      },
    };
  }

  const PART = {
    key: 'mirror', order: 20, mod: 'mirror', owns: ['mods.mirror'],
    // Mirror is never in Race or Battle (its conflicts: the last choice wins).
    conflicts(r, out) { if (r.mode === 'race' || r.mode === 'battle') out['mods.mirror=true'] = r.mode === 'race' ? 'Not in Race' : 'Not in Battle'; },
    rules(r, R) {
      if (!on(r)) return;
      R.copies = 2;
      R.E = (R.E || 4) * 2;
      R.refuse.flip = 'Not on a Mirror board';
    },
    engine(game) { return on(game.recipe) ? Object.assign({}, EXT) : null; },
    controller(play, game) { return game && on(game.recipe) ? controller(play, game) : null; },
  };
  Recipe.part(PART);

  // Butterfly: a perfect clear by hand on a Mirror board 20 wide (it counts there whatever the feats say).
  if (L.Achievements) {
    L.Achievements.add({
      id: 'butterfly', group: 'play', name: 'Butterfly', desc: 'Clear the whole board on a Mirror board 20 wide. No power-ups on the board.', pay: 45, on: 'play',
      counts: (r, g) => on(r) && !!g && g.w === 20,
      test: (s, e) => !!e.r.perfect && !!e.r.hand,
    });
  }

  L.Mirror = { on, reflect, pair, spawnX, tornadoOrder, halfCount, PAIRED, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
