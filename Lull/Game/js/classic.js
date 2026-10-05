// Lull — Classic, a board mode (js/recipe.js): pieces fall on their own, faster as the levels go by, with a lock
// delay, the classic spawn flush with the ceiling and the classic top out; the score and the line bank at Classic's
// rates. Its settings are the recipe's `classic` key, in the spirit of the arcade and early home-console era:
//
//   classic = { type: 'a' | 'b', level: 1–15 (start), height: 0–5 (B's starting garbage), music: 'hush' | 'off',
//               drop: hard drop, hold, ghost (booleans), next: 0–5 (Next previews), rand: 'bag' | 'retro', lock: 'modern' | 'retro',
//               levelLock: the level stays at the start level (boolean, default off) }
//
// Pure rules and the engine's extension (no DOM); the controller, the New board window's panel and the library's tags
// are js/classicview.js.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Recipe, CELL, Pieces, RNG } = L;
  if (!Recipe) return;

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const DEFAULTS = Object.freeze({ type: 'a', level: 1, height: 0, music: 'hush', drop: true, hold: true, ghost: true, next: 3, rand: 'bag', lock: 'modern', levelLock: false });
  const LEVELS = [1, 15];
  const HEIGHTS = 5;
  const NEXT = 5;
  /** B type: the lines to clear. */
  const B_LINES = 25;
  /** B type's starting garbage, in rows of a 20-row well, by height (the old heights); scaled to the board's height. */
  const B_ROWS = [0, 3, 5, 8, 10, 12];
  /** The music there is: one Classic track (Hush, Lull's own), or none. */
  const MUSIC = ['hush', 'off'];
  const MUSIC_NAMES = { hush: 'Hush', off: 'Off' };
  /** The modern lock delay: half a second, renewed by a move or a turn up to 15 times. */
  const LOCK = { delay: 0.5, resets: 15 };

  const on = (r) => !!r && r.mode === 'classic';

  /**
   * Retro timing: frames a row (NTSC, 60.0988 frames a second) by level 0, 1, 2, ... of the 8-bit era's speed table:
   * Lull's level 1 is its 0. Retro lock falls by this table: its lock is the gravity tick, so the two belong together.
   */
  const RETRO_FPS = 60.0988;
  const RETRO_FRAMES = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3];
  function retroFrames(level) { const n = Math.max(0, level - 1); return n < RETRO_FRAMES.length ? RETRO_FRAMES[n] : n < 29 ? 2 : 1; }
  /** Seconds a row at a level: the modern curve (as Classic has always fallen), or with Retro lock the retro table. */
  function gravity(level, retro) {
    if (retro) return retroFrames(level) / RETRO_FPS;
    const l = Math.max(1, Math.min(level, 20));
    return Math.max(0.012, Math.pow(0.8 - (l - 1) * 0.007, l - 1));
  }
  // ---- falling: one frame of gravity and the lock, the soft drop, a move's reset (the controller's, and Watch's own runs) --

  /**
   * One frame of a Classic piece falling, on t = { acc, lockT } (the controller itself, or a headless run's own): the
   * gravity ticks due in dt seconds at iv seconds a row, then the lock. Retro: no lock timer at all; each tick tries to
   * move the piece down a row, and the tick that cannot sets it, there and then (so a piece that comes to rest sets one
   * gravity interval later, a slide off a ledge just falls on, and moving or turning buys nothing). Modern: half a
   * second of rest (LOCK.delay), renewed by moving or turning (rested). Returns 'lock' (it set), 'fell' (it came down a
   * row or more) or null.
   */
  function fall(t, G, dt, iv, retro) {
    const p = G.piece;
    if (!p) return null;
    let fell = false;
    t.acc += dt;
    while (t.acc >= iv) {
      t.acc -= iv;
      if (G.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; p.lastRot = false; t.lockT = 0; fell = true; }
      else if (retro) { t.acc = 0; G.lock(); return 'lock'; }
      else { t.acc = 0; break; }
    }
    if (!retro && G.piece === p && !G.fitsAt(p, p.rot, p.x, p.y - 1)) {
      t.lockT += dt;
      if (t.lockT >= LOCK.delay) { t.lockT = 0; G.lock(); return 'lock'; }
    }
    return fell ? 'fell' : null;
  }
  /**
   * Soft drop: a row a press (one point a row: true); ↓ on the stack sets the piece. A held ↓ (rep) sets it too on
   * Retro lock (as the old consoles did: the soft drop's next step down that cannot, sets), never on modern lock (false).
   */
  function softDrop(t, G, rep, retro) {
    const p = G.piece;
    if (!p) return false;
    if (G.fitsAt(p, p.rot, p.x, p.y - 1)) { p.y--; p.lastRot = false; G.s.score += 1; t.acc = 0; return true; }
    if (rep && !retro) return false;
    G.lock();
    return true;
  }
  /** A move or a turn of a resting piece buys it more time (modern lock: up to LOCK.resets times). t: { lockT, resets }. */
  function rested(t, G, retro) {
    const p = G.piece;
    if (!p || retro) return;
    if (!G.fitsAt(p, p.rot, p.x, p.y - 1) && t.resets < LOCK.resets) { t.lockT = 0; t.resets++; }
  }

  /** The garbage rows B type starts with, on a board hh tall. */
  function garbageRows(height, hh) { return Math.round((B_ROWS[height] || 0) * hh / 20); }

  /**
   * The level after `lines` cleared (since the board became Classic): A type goes up every ten lines from the start
   * level (never below it); B type, or a board with its level locked, stays at its start level.
   */
  function levelOf(k, lines) { return k.type === 'b' || k.levelLock ? k.level : Math.max(k.level, 1 + Math.floor(lines / 10)); }
  /**
   * The level the achievements and the records count: the level reached by lines alone (as from level 1), never more
   * than the level played, so a high start level does not reach Level Twenty by itself; none with the level locked.
   */
  function featLevel(k, lines) { return k.levelLock ? 0 : Math.min(levelOf(k, lines), 1 + Math.floor(lines / 10)); }

  function normalizeK(raw) {
    const o = isObj(raw) ? raw : {}, d = DEFAULTS;
    const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
    return {
      type: o.type === 'b' ? 'b' : 'a',
      level: int(o.level, LEVELS[0], LEVELS[1], d.level),
      height: int(o.height, 0, HEIGHTS, d.height),
      music: MUSIC.includes(o.music) ? o.music : d.music,
      drop: o.drop !== false,
      hold: o.hold !== false,
      ghost: o.ghost !== false,
      next: int(o.next, 0, NEXT, d.next),
      rand: o.rand === 'retro' ? 'retro' : 'bag',
      lock: o.lock === 'retro' ? 'retro' : 'modern',
      levelLock: o.levelLock === true,
    };
  }

  // ---- where the pieces come from: the retro random -----------------------------------------------------------------

  /**
   * The retro randomizer: a roll of eight (the seventh piece and one more), and a repeat of the last piece or the eighth
   * face rolls once more, of seven; so a repeat comes about one time in 28 (a 7-bag never repeats more than twice).
   * Drawn on the game's own stream; the last piece is kept with the board (x.classic.last).
   */
  function retroDealer(C) {
    const T = Pieces.TETROMINOES;
    return {
      next(game) {
        let i = game.rng.int(8);
        if (i === 7 || T[i] === C.last) i = game.rng.int(7);
        C.last = T[i];
        return T[i];
      },
      reroll(game, exclude) { const opts = T.filter((t) => t !== exclude); return opts[Math.floor(Math.random() * opts.length)]; },
      candidates() { return T.slice(); },
    };
  }

  // ---- the engine's extension ----------------------------------------------------------------------------------------

  /** B type's garbage on a new board: each row about three in five full, never a full row, on the board's own seed. */
  function placeGarbage(game, k) {
    const n = garbageRows(k.height, game.h);
    if (!n) return;
    const rng = new RNG('classic:garbage:' + game.seed), b = game.board;
    for (let y = 0; y < n; y++) {
      let filled = 0;
      for (let x = 0; x < game.w; x++) if (rng.next() < 0.6) { b.set(x, y, CELL.FOREIGN | 8); filled++; }
      if (filled === game.w) b.set(rng.int(game.w), y, 0);
      if (!filled) b.set(rng.int(game.w), y, CELL.FOREIGN | 8);
    }
  }

  const fresh = () => ({ v: 1, from: null, lines: 0, ms: 0, quads: 0, counted: false, started: false, last: null, bestLevel: 0, best: 0 });
  function validState(x) {
    return isObj(x) && x.v === 1 && Number.isFinite(x.lines) && x.lines >= 0 && Number.isFinite(x.ms) && x.ms >= 0 && Number.isFinite(x.quads);
  }

  /** A Classic board's hooks (see Game hooks in js/engine.js); its state is this.C (Classic.of(game)). */
  function extension(game, saved, o) {
    const k = game.recipe.classic;
    const C = validState(saved) ? Object.assign(fresh(), clone(saved)) : fresh();
    // Classic's engine rules: the spawn flush with the ceiling and the classic top out, hold once a piece (or none).
    game.ceiling = true;
    game.freeHold = false;
    game.findRoom = false;
    game.mods.noHold = !k.hold;
    // Next shows the recipe's count, whatever Settings ▸ Next says.
    Object.defineProperty(game, 'previewCount', { get: () => k.next, set() {}, configurable: true });
    // (Physics: no garbage; it would be grid cells the bodies could not stand on.)
    if (!o.saved && k.type === 'b' && !(game.recipe.mods && game.recipe.mods.physics)) placeGarbage(game, k);
    const ext = {
      C,
      step(g, res) {
        if (C.from == null) C.from = g.s.lines - (res.lines || 0);
        const before = levelOf(k, C.lines);
        C.lines += res.lines || 0;
        const level = levelOf(k, C.lines);
        // The Classic score: a clear's points times the level it was made at, two a row of a hard drop (soft drop's
        // one a row is added as it happens).
        const add = (res.score || 0) * (before - 1) + (res.dropDist ? res.dropDist * 2 : 0);
        g.s.score += add;
        if ((res.lines || 0) >= 4) C.quads++;
        C.bestLevel = Math.max(C.bestLevel || 0, featLevel(k, C.lines));
        res.classic = { before, level, score: g.s.score, lines: C.lines };
        if (k.type === 'b' && C.lines >= B_LINES) { res.classic.cleared = true; g.end('cleared'); }
      },
      save() { return clone(C); },
      summary() { return { level: levelOf(k, C.lines), lines: C.lines, quads: C.quads, ms: C.ms, type: k.type }; },
    };
    if (k.rand === 'retro') ext.dealer = retroDealer(C);
    return ext;
  }

  /**
   * Lines cleared between locks (Physics' bands, js/physics.js): counted toward the level and B type's 25, as a lock's
   * are (Physics pays and scores them itself).
   */
  function addLines(game, n) {
    const C = of(game);
    if (!C || !(n > 0)) return;
    const k = game.recipe.classic;
    C.lines += n;
    C.bestLevel = Math.max(C.bestLevel || 0, featLevel(k, C.lines));
    if (k.type === 'b' && C.lines >= B_LINES && !game.over) game.end('cleared');
  }

  /** The Classic state of a game (null on a board that is not Classic). */
  function of(game) {
    const e = game && Array.isArray(game.ext) ? game.ext.find((x) => x.key === 'classic') : null;
    return e ? e.C : null;
  }

  const TYPE_NAMES = { a: 'A', b: 'B' };

  const PART = {
    key: 'classic', order: 45, mode: 'classic', owns: ['classic'],
    options: { 'classic.rand': ['bag', 'retro'] },
    // Edits that change only these cost nothing (Recipe.editPrice): the music is not a rule.
    freeEdit: ['classic.music'],
    normalize(raw, out) {
      if (out.mode !== 'classic') return;
      out.classic = normalizeK(raw.classic);
    },
    label: (r, short) => {
      if (!on(r)) return '';
      const k = r.classic;
      return 'Classic ' + TYPE_NAMES[k.type] + (short ? '' : ' · Level ' + k.level + (k.levelLock ? ' (locked)' : '') + (k.type === 'b' && k.height ? ' · Height ' + k.height : ''));
    },
    rules(r, R) {
      if (!on(r)) return;
      // No power-ups (Classic is played as it falls: nothing stops the clock or takes a piece back), no Undo, no hints.
      for (const id of Object.keys(L.ITEMS || {})) R.refuse[id] = 'Not in Classic';
      R.undo = false;
      R.hints = false;
      R.classic = true;
    },
    conflicts(r, out) {
      if (!on(r)) return;
      // The retro roll draws the seven; other shapes come from their own dealer.
      const preset = isObj(r.shapes) ? r.shapes.preset : 'normal';
      if (preset !== 'normal') out['classic.rand=retro'] = 'Retro random needs Normal shapes';
    },
    valid(g, r) {
      if (!on(r)) return true;
      const x = isObj(g.x) ? g.x.classic : undefined;
      return x === undefined || validState(x);
    },
    engine(game, saved, o) { return on(game.recipe) ? extension(game, saved, o) : null; },
    controller(play, game) { return game && on(game.recipe) && L.ClassicView ? L.ClassicView.controller(play, game) : null; },
    summary(x, g) { return validState(x) && g && isObj(g.recipe) && on(Recipe.normalize(g.recipe)) ? { level: levelOf(Recipe.normalize(g.recipe).classic, x.lines), lines: x.lines, quads: x.quads, ms: x.ms } : null; },
  };
  Recipe.part(PART);

  L.Classic = { DEFAULTS, LEVELS, HEIGHTS, NEXT, B_LINES, B_ROWS, MUSIC, MUSIC_NAMES, LOCK, on, gravity, retroFrames, RETRO_FPS, fall, softDrop, rested, garbageRows, levelOf, featLevel, normalize: normalizeK, retroDealer, of, addLines, PART };
})(typeof globalThis !== 'undefined' ? globalThis : this);
