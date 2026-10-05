// Classic as a board mode in Node (js/classic.js): the recipe part and its settings, rules and conflicts, the engine
// (ceiling spawn, hold, Next, B type's garbage and its end, the retro randomizer, the score and levels), save and
// resume, and what it banks against Standard. Run by test.cjs: require('./classic-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function classicUnit({ L, test }) {
  const { Game, Pieces, Recipe, Classic, Chain, Library, CELL } = L;
  const CL = (k) => ({ mode: 'classic', classic: Object.assign({}, k || {}) });
  const mk = (k, w, h, seed) => new Game({ w: w || 10, h: h || 20, seed: seed == null ? 1 : seed, recipe: CL(k) });
  const dropAt = (g, id, x, rot) => {
    const type = Pieces.get(id);
    g.piece = { type, rot: rot || 0, x, y: g.h - 1 - type.rotBounds[rot || 0].maxY, special: null, entry: { id, rot: 0 }, lastRot: false };
    return g.drop();
  };
  /** Fills rows 0..n-1 but column `hole` (a well for an I). */
  const well = (g, n, hole) => { for (let y = 0; y < n; y++) for (let x = 0; x < g.w; x++) if (x !== hole) g.board.set(x, y, 5); };

  test('classic: the recipe part: a mode beside Plain and Descent, its settings made whole, its label', () => {
    assert.deepStrictEqual(Recipe.options().find((o) => o.path === 'mode').values, ['plain', 'classic'].concat(Recipe.get('descent') ? ['descent'] : [], Recipe.get('race') ? ['race'] : [], Recipe.get('battle') ? ['battle'] : [], Recipe.get('mural') ? ['mural'] : []));
    assert.strictEqual(Recipe.DEFAULT.classic, undefined, 'the default recipe is as it was');
    assert.strictEqual(Recipe.normalize({ classic: { type: 'b' } }).classic, undefined, 'settings only on a Classic board');
    const r = Recipe.normalize(CL());
    assert.deepStrictEqual(r.classic, Object.assign({}, Classic.DEFAULTS));
    const bad = Recipe.normalize(CL({ type: 'x', level: 99, height: -1, music: 'c', drop: 0, hold: 'no', ghost: false, next: 9, rand: 'tgm', lock: 'x' })).classic;
    assert.deepStrictEqual(bad, Object.assign({}, Classic.DEFAULTS, { ghost: false }), 'anything invalid is the default (false only as false)');
    assert.strictEqual(Recipe.label(CL()), 'Classic A · Level 1');
    assert.strictEqual(Recipe.label(CL({ type: 'b', level: 7, height: 3 })), 'Classic B · Level 7 · Height 3');
    assert.strictEqual(Recipe.label(CL({ type: 'b', level: 7 }), true), 'Classic B');
    assert.strictEqual(Recipe.label({ mode: 'classic', mods: { mirror: true } }), 'Mirror · Classic A · Level 1');
  });

  test('classic: rules: no power-ups (each says why), no Undo, no hints; rated as its shapes are; the retro roll needs Normal shapes', () => {
    const R = Recipe.rules(CL(), 10);
    for (const id of Object.keys(L.ITEMS)) assert.strictEqual(R.refuse[id], 'Not in Classic', id);
    assert(!R.undo && !R.hints && R.rated && R.feats && R.lk === 1);
    assert(!Recipe.rules(Object.assign(CL(), { shapes: { preset: 'frantic' } }), 10).rated, 'other shapes: unrated');
    assert.strictEqual(Recipe.rules(CL(), 8).feats, false, 'feats only 10 wide or more');
    assert.deepStrictEqual(Recipe.conflicts(Object.assign(CL({ rand: 'retro' }), { shapes: { preset: 'tiny' } })), { 'classic.rand=retro': 'Retro random needs Normal shapes' });
    assert.deepStrictEqual(Recipe.conflicts(CL({ rand: 'retro' })), {});
    // The last choice wins: other shapes move the roll to the 7-bag, and Normal brings it back.
    const memo = {};
    const a = Recipe.resolve(Object.assign(CL({ rand: 'retro' }), { shapes: { preset: 'frantic' } }), 'shapes.preset', memo);
    assert.strictEqual(a.recipe.classic.rand, 'bag');
    const b = Recipe.resolve(Object.assign({}, a.recipe, { shapes: { preset: 'normal' } }), 'shapes.preset', a.memo);
    assert.strictEqual(b.recipe.classic.rand, 'retro');
  });

  test('classic: the engine: spawn flush with the ceiling, no nearby spot tried, hold once a piece or off, Next as set, no history', () => {
    const g = mk({ next: 1 });
    assert(g.ceiling && !g.freeHold && !g.findRoom && g.maxHistory === 0 && g.previewCount === 1);
    g.previewCount = 5;
    assert.strictEqual(g.previewCount, 1, 'Settings ▸ Next does not change it');
    const p = g.piece;
    assert.strictEqual(p.y + p.type.rotBounds[p.rot].maxY, g.h - 1, 'its top in the top row');
    assert(g.holdPiece() && !g.holdPiece(), 'once a piece');
    const off = mk({ hold: false });
    assert(off.mods.noHold && !off.holdPiece(), 'hold off');
    dropAt(g, 'O', 0);
    assert.strictEqual(g.history.length, 0, 'no Undo');
    // A piece that cannot appear where it appears: game over.
    const t = mk();
    for (let y = 0; y < t.h; y++) for (let x = 3; x < 7; x++) t.board.set(x, y, 5);
    t.spawnNext();
    assert(t.over, 'blocked at the spawn spot');
  });

  test('classic: the score is the level times a clear\'s points (two a row of hard drop), levels every ten lines from the start level', () => {
    const g = mk({ level: 1 });
    well(g, 4, 9); g.board.set(0, 4, 5); // not a spotless clear
    const r = dropAt(g, 'I', 9 - 2, 1);
    assert.strictEqual(r.lines, 4);
    assert.strictEqual(g.s.score, 800 * 1 + r.dropDist * 2);
    assert.strictEqual(Classic.of(g).quads, 1);
    const k = Recipe.normalize(CL({ level: 5 })).classic;
    assert.deepStrictEqual([0, 9, 10, 49, 50, 60].map((n) => Classic.levelOf(k, n)), [5, 5, 5, 5, 6, 7]);
    assert.deepStrictEqual([0, 10, 50, 60].map((n) => Classic.featLevel(k, n)), [1, 2, 6, 7], 'a high start level does not reach a level feat by itself');
    const g5 = mk({ level: 5 });
    well(g5, 4, 9); g5.board.set(0, 4, 5);
    const r5 = dropAt(g5, 'I', 9 - 2, 1);
    assert.strictEqual(g5.s.score, 800 * 5 + r5.dropDist * 2);
    const kb = Recipe.normalize(CL({ type: 'b', level: 3 })).classic;
    assert.strictEqual(Classic.levelOf(kb, 24), 3, 'B type keeps its level');
    assert(Classic.gravity(1) > Classic.gravity(10) && Classic.gravity(20) === Classic.gravity(30), 'the modern curve, level 20 at most');
    // Retro lock falls by the retro table (Lull's level 1 is its level 0), NTSC frames.
    assert.deepStrictEqual([1, 2, 9, 10, 11, 13, 14, 16, 17, 19, 20, 29, 30].map(Classic.retroFrames), [48, 43, 8, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1]);
    assert.strictEqual(Classic.gravity(1, true), 48 / 60.0988);
  });

  test('classic: level lock: the level stays at the start level all game (gravity with it), the score as ever, no level feat', () => {
    const k = Recipe.normalize(CL({ level: 5, levelLock: true })).classic;
    assert.strictEqual(k.levelLock, true);
    assert.strictEqual(Recipe.normalize(CL({ levelLock: 'yes' })).classic.levelLock, false, 'on only as true');
    assert.deepStrictEqual([0, 10, 60, 190].map((n) => Classic.levelOf(k, n)), [5, 5, 5, 5]);
    assert.deepStrictEqual([0, 100, 190].map((n) => Classic.featLevel(k, n)), [0, 0, 0], 'a locked game reaches no level feat');
    assert.strictEqual(Recipe.label(CL({ level: 5, levelLock: true })), 'Classic A · Level 5 (locked)');
    const g = mk({ level: 5, levelLock: true });
    Classic.of(g).lines = 60;
    well(g, 4, 9); g.board.set(0, 4, 5);
    const r = dropAt(g, 'I', 9 - 2, 1);
    assert.strictEqual(r.classic.before, 5); assert.strictEqual(r.classic.level, 5);
    assert.strictEqual(g.s.score, 800 * 5 + r.dropDist * 2, 'scored at the level it is played at');
    assert.strictEqual(Classic.of(g).bestLevel, 0);
    const lv = L.Achievements.LIST.filter((x) => /^cl_l\d+$/.test(x.id));
    assert(lv.length >= 3);
    for (const a of lv) assert(!a.test({}, { level: Classic.featLevel(k, 250), g }), a.id);
  });

  test('classic: B type: garbage by height (scaled to the board, never a full row, the board\'s own seed), and the board ends at 25 lines', () => {
    for (const [hh, height, rows] of [[20, 0, 0], [20, 3, 8], [20, 5, 12], [40, 1, 6], [8, 5, 5]]) {
      const g = mk({ type: 'b', height }, 10, hh, 3);
      let top = 0;
      for (let y = 0; y < hh; y++) for (let x = 0; x < 10; x++) if (g.board.get(x, y)) top = Math.max(top, y + 1);
      assert.strictEqual(top, rows, hh + ' tall, height ' + height);
      for (let y = 0; y < rows; y++) {
        let n = 0;
        for (let x = 0; x < 10; x++) { const v = g.board.get(x, y); if (v) { n++; assert.strictEqual(v, CELL.FOREIGN | 8); } }
        assert(n > 0 && n < 10, 'a row with a hole');
      }
    }
    assert.deepStrictEqual(mk({ type: 'b', height: 4 }, 10, 20, 9).board.toArray(), mk({ type: 'b', height: 4 }, 10, 20, 9).board.toArray(), 'the same seed, the same garbage');
    assert.strictEqual(mk({ type: 'a', height: 4 }).board.count(), 0, 'A type: none');
    const g = mk({ type: 'b' });
    Classic.of(g).lines = 24;
    well(g, 1, 0);
    dropAt(g, 'I', -2, 1);
    assert(g.over && g.endKind === 'cleared', 'ended, cleared');
    const back = new Game({ saved: g.toJSON() });
    assert(back.over && back.endKind === 'cleared', 'and saved so');
  });

  test('classic: the retro random: a repeat about one time in 28, every piece, the game\'s own stream, the same after a resume', () => {
    const g = mk({ rand: 'retro' }, 10, 20, 7);
    const seq = [];
    for (let i = 0; i < 14000; i++) seq.push(g.dealer.next(g));
    let rep = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) rep++;
    const f = rep / (seq.length - 1);
    assert(f > 0.025 && f < 0.047, 'repeats ' + f);
    assert.strictEqual(new Set(seq).size, 7);
    const a = mk({ rand: 'retro' }, 10, 20, 11);
    for (let i = 0; i < 5; i++) dropAt(a, 'O', (i * 2) % 8);
    const b = new Game({ saved: JSON.parse(JSON.stringify(a.toJSON())) });
    const next = (x) => { const out = []; for (let i = 0; i < 30; i++) out.push(x.dealer.next(x)); return out.join(''); };
    assert.strictEqual(next(b), next(a), 'a resumed board deals what it would have');
    const bag = mk({}, 10, 20, 7);
    const seven = []; for (let i = 0; i < 7; i++) seven.push(bag.dealer.next(bag));
    assert.strictEqual(new Set(seven).size, 7, 'the 7-bag stays the default');
  });

  test('classic: a board resumes as it was left (its state, its settings), and a saved state that is not whole is refused', () => {
    const g = mk({ type: 'b', height: 2, next: 4, ghost: false }, 12, 24, 4);
    Classic.of(g).started = true; Classic.of(g).ms = 1234;
    dropAt(g, 'T', 3);
    const j = JSON.parse(JSON.stringify(g.toJSON()));
    assert(Library.playable(j));
    const b = new Game({ saved: j });
    assert.deepStrictEqual(Classic.of(b), Classic.of(g));
    assert(b.ceiling && b.previewCount === 4 && b.recipe.classic.ghost === false);
    assert.strictEqual(b.board.count(), g.board.count(), 'the garbage is not laid again');
    j.x.classic = { v: 1, lines: -3 };
    assert(!Recipe.valid(j) && !Library.playable(j));
  });

  test('classic: what a line banks is never more than Standard pays for it, at any width and streak', () => {
    for (let w = 4; w <= 20; w++) {
      const lk = Recipe.rules(CL(), w).lk, std = Recipe.rules({}, w).lk;
      assert.strictEqual(lk, std, 'a Classic row is worth what a plain one is');
      for (let n = 0; n <= 30; n++) assert(lk * Chain.CLASSIC.rate * Chain.mult(n, 'classic') <= std * Chain.mult(n) + 1e-9);
    }
  });
};
