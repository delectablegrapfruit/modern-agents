// A plain player for the board recipe's shapes (js/shapes.js), shared by scripts/minsize.cjs (how small a board each
// set can be dealt on) and the Shapes tests (fairness: nothing earns faster per piece or per action than Normal
// shapes). Each piece goes where a classic evaluation likes it best (Dellacherie's: landing height, rows cleared, row
// and column transitions, holes, wells), among the spots it reaches falling straight down in any turn.
'use strict';

/** Every straight-down spot of the piece in play: [{ rot, x, y, v }], best first. */
function spots(g) {
  const p = g.piece, b = g.board, W = b.w, H = b.h, type = p.type;
  const cells = b.cells, top = new Int32Array(W);
  for (let x = 0; x < W; x++) { let t = 0; for (let y = H - 1; y >= 0; y--) if (cells[y * W + x]) { t = y + 1; break; } top[x] = t; }
  const grid = new Uint8Array(W * H), out = [], seen = new Set();
  for (let rot = 0; rot < 4; rot++) {
    if (seen.has(type.keys[rot])) continue;
    seen.add(type.keys[rot]);
    const cs = type.rots[rot], bd = type.rotBounds[rot];
    if (bd.w > W || bd.h > H) continue;
    // The lowest cell of each of the piece's columns.
    const low = new Map();
    for (const [cx, cy] of cs) if (!low.has(cx) || low.get(cx) > cy) low.set(cx, cy);
    for (let x = -bd.minX; x <= W - 1 - bd.maxX; x++) {
      let y = -bd.minY;
      for (const [cx, cy] of low) y = Math.max(y, top[x + cx] - cy);
      if (y + bd.maxY >= H) continue;
      if (!g.fitsAt(p, rot, x, y)) continue;
      grid.set(cells);
      for (const [cx, cy] of cs) grid[(y + cy) * W + x + cx] = 1;
      out.push({ rot, x, y, v: judge(grid, W, H, y + (bd.minY + bd.maxY) / 2) });
    }
  }
  return out.sort((a, c) => c.v - a.v);
}

/** How good a stack is after a piece set at landing height lh (Dellacherie's weights). Full rows are taken out first. */
function judge(grid, W, H, lh) {
  let rows = 0;
  for (let y = H - 1; y >= 0; y--) {
    let full = true;
    for (let x = 0; x < W; x++) if (!grid[y * W + x]) { full = false; break; }
    if (full) { rows++; grid.copyWithin(y * W, (y + 1) * W, H * W); grid.fill(0, (H - 1) * W); }
  }
  let rowT = 0, colT = 0, holes = 0, wells = 0;
  for (let y = 0; y < H; y++) {
    let prev = 1;
    for (let x = 0; x < W; x++) { const f = grid[y * W + x] ? 1 : 0; if (f !== prev) rowT++; prev = f; }
    if (!prev) rowT++;
  }
  for (let x = 0; x < W; x++) {
    let prev = 1;
    for (let y = 0; y < H; y++) { const f = grid[y * W + x] ? 1 : 0; if (f !== prev) colT++; prev = f; }
    let roof = false, top = 0;
    for (let y = H - 1; y >= 0; y--) { if (grid[y * W + x]) { if (!roof) top = y + 1; roof = true; } else if (roof) holes++; }
    // Wells: open cells above the column's top with both sides filled (the walls count), each as deep as the run so far.
    for (let y = top, run = 0; y < H; y++) {
      const l = x === 0 || grid[y * W + x - 1], r = x === W - 1 || grid[y * W + x + 1];
      if (l && r) { run++; wells += run; } else run = 0;
    }
  }
  return -4.5 * lh + 3.42 * rows - 3.22 * rowT - 9.35 * colT - 7.9 * holes - 3.39 * wells;
}

/** Sets the piece in play at the best spot, as if carried there (no inputs counted). The lock's result, or false. */
function place(g) {
  if (!g.piece || g.over) return false;
  const best = spots(g)[0];
  if (!best) return false;
  const p = g.piece;
  p.rot = best.rot; p.x = best.x; p.y = best.y;
  return g.lock();
}

/**
 * Plays the piece in play with real inputs, as a person would: turns (the short way), steps sideways, drops. The lock's
 * result, or false (the piece could not get there: it drops where it is).
 */
function play(g) {
  if (!g.piece || g.over) return false;
  const list = spots(g);
  if (!list.length) return false;
  const best = list[0], p = g.piece, k = (best.rot - p.rot + 4) % 4;
  if (k === 3) g.rotate(-1); else for (let i = 0; i < k; i++) g.rotate(1);
  for (let i = 0; i < g.w + 4 && g.piece && g.piece.x !== best.x; i++) if (!g.move(Math.sign(best.x - g.piece.x))) break;
  return g.drop();
}

/** Pieces a board lives (placed until full), at most cap. */
function life(Game, recipe, w, h, seed, cap) {
  const g = new Game({ w, h, seed, recipe, previewCount: 1, maxHistory: 0 });
  let n = 0;
  while (n < cap && !g.over && g.piece) { if (!place(g)) break; n++; }
  return n;
}

module.exports = { spots, judge, place, play, life };
