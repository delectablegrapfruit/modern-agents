// Descent's rules in Node (js/descent.js): the recipe (a mode between Classic and Battle; its level and stage; 8 × 14 at
// least; Physics and Mirror ruled out both ways; kept for the board's life), the stages laid out the same every time,
// each shot (I pierce, O heavy, T spread, S and Z push, L and J angle, stone nothing; other shapes by their form), each
// block (glass, dense, armour, prism, drip, weight, echo, lock), the clear effects (a volley a row, a T-spin through
// armour, back-to-back, the combo's delay, a perfect clear), contact into stone, pieces appearing under the descent,
// the stage cleared and the top out, save and resume mid-stage, Rewind 5 s, pay (stone rows plain), the achievements,
// a careful bot that beats most stages of each level and a careless one that loses on Hard, and bots that earn no
// more per piece or per action than on Standard. Run by test.cjs: require('./descent-unit.cjs')({ L, test }).
'use strict';
const assert = require('assert');

module.exports = function descentUnit({ L, test }) {
  const { Game, Pieces, Recipe, CELL, Descent: Ds, RNG } = L;
  const TPS = Ds.TPS;
  const R = (level, stage) => ({ mode: 'descent', descent: { level: level || 'easy', stage: stage == null ? 1 : stage } });
  const mk = (level, stage, w, h, seed) => new Game({ w: w || 10, h: h || 20, seed: seed == null ? 1 : seed, recipe: R(level, stage) });
  const D = (g) => Ds.of(g);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const own = (k, color) => (color || 5) | (Ds.SHOTS.indexOf(k) << CELL.SHOT_SHIFT);
  /** The descent made quiet (no lane lowers) and laid out by hand: lanes[x] = { bot, kinds: 'gdap…' } (lowest first). */
  const KIND = { g: 'glass', d: 'dense', a: 'armour', p: 'prism', r: 'drip', w: 'weight', e: 'echo', k: 'lock' };
  function lay(g, lanes, o) {
    const x = D(g);
    x.lanes.forEach((l, i) => {
      const s = lanes[i] || { bot: g.h, kinds: '' };
      l.bot = s.bot; l.next = 1e6;
      l.blocks = s.kinds.split('').map((c) => { const k = KIND[c]; const b = { k, hp: k === 'dense' ? 2 : 1 }; if (k === 'lock') b.d = s.d || 1; if (k === 'drip') b.t = Ds.DRIP * TPS; return b; });
    });
    x.total = x.lanes.reduce((a, l) => a + l.blocks.length, 0) + ((o && o.extra) || 0);
    Ds.sync(x, g.board);
    return x;
  }
  /** A bare descent (no board) of w lanes, for the volleys alone. */
  function bare(lanes, w) {
    w = w || lanes.length;
    const x = { w, h: 20, stage: 1, level: 'easy', broken: 0, fused: 0, stones: 0, st: { broken: 0, fused: 0, stones: 0, drips: 0, shots: 0, armour: 0, locks: 0, perfect: 0 }, lanes: [] };
    for (let i = 0; i < w; i++) {
      const s = lanes[i] || { bot: 10, kinds: '' };
      x.lanes.push({ bot: s.bot == null ? 10 : s.bot, iv: 100, next: 50, blocks: s.kinds.split('').map((c) => { const k = KIND[c]; const b = { k, hp: k === 'dense' ? 2 : 1 }; if (k === 'lock') b.d = s.d || 1; return b; }) });
    }
    return x;
  }
  const LETTER = Object.fromEntries(Object.entries(KIND).map(([c, k]) => [k, c]));
  const kinds = (x, i) => x.lanes[i].blocks.map((b) => LETTER[b.k] + (b.hp > 1 ? b.hp : '')).join('');
  /** The piece in play becomes `id`, turned rot, at x, y (or dropped from where it is). */
  const put = (g, id, x, y, rot) => { g.piece = { type: Pieces.get(id), rot: rot || 0, x, y, special: null, entry: { id, rot: 0 }, lastRot: false }; };
  const picture = (g) => { const x = D(g), rows = []; for (let y = g.h - 1; y >= 0; y--) { let s = ''; for (let i = 0; i < g.w; i++) { const v = g.board.get(i, y); s += !v ? '.' : v & CELL.HANG ? (x.lanes[i].blocks[y - x.lanes[i].bot] ? 'H' : '|') : v & CELL.STONE ? '#' : 'o'; } rows.push(s); } return rows.join('\n'); };

  console.log('descent');

  test('descent: the recipe — a mode between Classic and Battle, its level and stage, its label, 8 × 14 at least, refusals, Physics and Mirror ruled out both ways', () => {
    const modes = Recipe.options().find((o) => o.path === 'mode').values;
    assert.deepStrictEqual(modes.filter((m) => ['plain', 'classic', 'descent', 'battle'].includes(m)), ['plain', 'classic', 'descent', 'battle']);
    assert(!modes.includes('protect'), 'Protect is gone');
    assert.deepStrictEqual(Recipe.normalize({ mode: 'descent' }).descent, { level: 'easy', stage: 1 });
    assert.deepStrictEqual(Recipe.normalize({ mode: 'descent', descent: { level: 'hard', stage: 'endless' } }).descent, { level: 'hard', stage: 'endless' });
    assert.deepStrictEqual(Recipe.normalize({ mode: 'descent', descent: { level: 'x', stage: 13 } }).descent, { level: 'easy', stage: 1 });
    assert.strictEqual(Recipe.normalize({}).descent, undefined);
    assert.strictEqual(Recipe.label(R('medium', 4)), 'Descent Medium · Stage 4');
    assert.strictEqual(Recipe.label(R('hard', 'endless')), 'Descent Hard · Endless');
    const lim = Recipe.limits(R());
    assert.deepStrictEqual([lim.w[0], lim.h[0]], [8, 14]);
    assert.deepStrictEqual(Recipe.clampSize({ w: 4, h: 8 }, R()), { w: 8, h: 14 });
    const rules = Recipe.rules(R(), 10);
    assert.strictEqual(rules.undo, false, 'Rewind 5 s takes Undo’s place');
    for (const id of ['tornado', 'trapdoor', 'flip', 'fit']) assert.strictEqual(rules.refuse[id], 'Not in Descent');
    assert(rules.rated && rules.feats, 'rated as Normal shapes are');
    const c = Recipe.conflicts(R());
    assert.strictEqual(c['mods.physics=true'], 'Not in Descent');
    assert.strictEqual(c['mods.mirror=true'], 'Not in Descent');
    assert.strictEqual(Recipe.conflicts({ mods: { physics: true } })['mode=descent'], 'Not with Physics');
    assert.strictEqual(Recipe.conflicts({ mods: { mirror: true } })['mode=descent'], 'Not with Mirror');
    // The last choice wins: Descent turns Mirror off, and Mirror back on leaves Descent for Plain.
    const res = Recipe.resolve({ mods: { mirror: true }, mode: 'descent' }, 'mode');
    assert(!res.recipe.mods.mirror && res.recipe.mode === 'descent');
    assert.strictEqual(Recipe.editConflicts({}, {})['mode=descent'], 'Descent starts on a new board');
    const fromD = Recipe.editConflicts(R('easy', 3), R('easy', 3));
    assert(fromD['mode=plain'] && fromD['descent.stage=4'] && fromD['descent.level=hard'] && !fromD['descent.stage=3']);
    // With shapes: Pentominoes need their own room under the descent.
    assert(Recipe.limits({ mode: 'descent', shapes: { preset: 'pentominoes' } }).h[0] >= 14);
  });

  test('descent: a stage is laid out the same every time (its level, stage and width), deeper on harder levels; lanes start a share of the well down', () => {
    const a = D(mk('medium', 5, 10, 20, 1)), b = D(mk('medium', 5, 10, 20, 99));
    assert.deepStrictEqual(a.lanes, b.lanes, 'the board’s seed does not change a stage');
    assert.strictEqual(a.total, Ds.depthOf('medium', 5) * 10);
    for (let st = 1; st <= 12; st++) assert(Ds.depthOf('hard', st) > Ds.depthOf('easy', st));
    assert(a.lanes.every((l) => l.bot === 20 - Math.round(20 * Ds.LEVELS.medium.start)));
    // Easy: at most two kinds a stage; Hard every kind by the end.
    for (let st = 1; st <= 12; st++) {
      const k = new Set(D(mk('easy', st)).lanes.flatMap((l) => l.blocks.map((x) => x.k)));
      assert(k.size <= 2, 'stage ' + st + ' easy: ' + [...k]);
    }
    assert.strictEqual(new Set(D(mk('hard', 12)).lanes.flatMap((l) => l.blocks.map((x) => x.k))).size, 8);
    // Hard lanes keep uneven paces; Easy lanes one pace.
    assert(new Set(D(mk('hard', 1)).lanes.map((l) => l.iv)).size > 3);
    assert.strictEqual(new Set(D(mk('easy', 1)).lanes.map((l) => l.iv)).size, 1);
    // No armour where the shapes cannot spin a T (it is dense there).
    const tiny = new Game({ w: 10, h: 20, seed: 1, recipe: { mode: 'descent', descent: { level: 'hard', stage: 6 }, shapes: { preset: 'tiny' } } });
    assert(!D(tiny).lanes.some((l) => l.blocks.some((x) => x.k === 'armour')));
    assert(D(mk('hard', 6)).lanes.some((l) => l.blocks.some((x) => x.k === 'armour')));
    // Endless: more to come in every lane, on the board's own stream.
    const e = D(mk('hard', 'endless', 10, 20, 3));
    assert(e.lanes.every((l) => l.blocks.length >= 20) && e.total === 0 && Ds.left(e) === Infinity);
  });

  test('descent: each cell remembers its piece’s shot; the seven by name, Big as its base, other shapes by their form', () => {
    const want = { I: 'pierce', O: 'heavy', T: 'spread', S: 'push', Z: 'push', L: 'right', J: 'left' };
    for (const [id, k] of Object.entries(want)) assert.strictEqual(Ds.SHOTS[Ds.shotOf(Pieces.get(id))], k, id);
    assert.strictEqual(Ds.SHOTS[Ds.shotOf(Pieces.bigOf('T'))], 'spread', 'Big T');
    const form = { I5: 'pierce', I3: 'pierce', D2: 'pierce', M1: 'pierce', P: 'heavy', X: 'spread', T5: 'spread', Y: 'spread', F: 'spread', N: 'push', W: 'push', Z5: 'push', U: 'push', L5: 'left', L5m: 'right', V3: 'left' };
    for (const [id, k] of Object.entries(form)) assert.strictEqual(Ds.SHOTS[Ds.shotOf(Pieces.get(id))], k, id);
    // On the board: a piece's cells carry its shot; stone and hanging cells carry none.
    const g = mk('easy', 1);
    lay(g, []);
    put(g, 'T', 3, 0);
    g.drop();
    const shots = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 10; x++) { const v = g.board.get(x, y); if (v) shots.push(Ds.SHOTS[Ds.shotOfCell(v)]); }
    assert.deepStrictEqual(shots, ['spread', 'spread', 'spread', 'spread']);
    assert.strictEqual(g.board.get(4, 0) & CELL.COLOR, Pieces.TYPES.T.color, 'the colour is as ever');
  });

  test('descent: each shot — I pierces two, O hits for two, T spreads to both sides, S and Z push the lane up, L and J angle (at a wall, their own lane), stone fires nothing', () => {
    const row = (cells) => { const r = new Array(5).fill(0); for (const [x, v] of cells) r[x] = v; return r; };
    let x = bare([{ kinds: 'ggg' }, { kinds: 'ggg' }, { kinds: 'ggg' }, { kinds: 'ggg' }, { kinds: 'ggg' }]);
    let ev = Ds.fire(x, [0], [row([[2, own('pierce')]])]);
    assert.deepStrictEqual([kinds(x, 2), x.lanes[2].bot, ev.broken.length], ['g', 12, 2]);
    x = bare([{ kinds: 'dg' }]);
    Ds.fire(x, [0], [[own('heavy')]]);
    assert.strictEqual(kinds(x, 0), 'g', 'heavy: a dense block in one shot');
    x = bare([{ kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }]);
    Ds.fire(x, [0], [row([[2, own('spread')]])]);
    assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => kinds(x, i)), ['g', '', '', '', 'g']);
    x = bare([{ kinds: 'gg', bot: 10 }]);
    ev = Ds.fire(x, [0], [[own('push')]]);
    assert.deepStrictEqual([kinds(x, 0), x.lanes[0].bot, ev.pushed], ['gg', 11, [0]]);
    x = bare([{ kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }]);
    Ds.fire(x, [0], [row([[1, own('right')], [3, own('left')]])]);
    assert.deepStrictEqual([0, 1, 2, 3, 4].map((i) => kinds(x, i)), ['g', 'g', '', 'g', 'g'], 'L at 1 hits 2, J at 3 hits 2');
    x = bare([{ kinds: 'gg' }, { kinds: 'g' }, { kinds: 'g' }, { kinds: 'g' }, { kinds: 'gg' }]);
    Ds.fire(x, [0], [row([[0, own('left')], [4, own('right')]])]);
    assert.deepStrictEqual([kinds(x, 0), kinds(x, 4)], ['g', 'g'], 'at a wall: its own lane');
    x = bare([{ kinds: 'g' }]);
    ev = Ds.fire(x, [0], [[Ds.STONE_CELL]]);
    assert.deepStrictEqual([kinds(x, 0), ev.shots.length], ['g', 0], 'stone: a dead spot');
  });

  test('descent: each block — glass breaks at a hit, dense at two (cracked after one), armour only to a T-spin volley, a prism hits both sides, a lock while its lane hangs lower', () => {
    let x = bare([{ kinds: 'dg' }]);
    let ev = Ds.fire(x, [0], [[own('plain')]]);
    assert.deepStrictEqual([kinds(x, 0), ev.hits[0].r], ['d1g'.replace('1', ''), 'crack']);
    assert.strictEqual(x.lanes[0].blocks[0].hp, 1);
    Ds.fire(x, [0], [[own('plain')]]);
    assert.strictEqual(kinds(x, 0), 'g');
    x = bare([{ kinds: 'ag' }]);
    ev = Ds.fire(x, [0], [[own('heavy')]]);
    assert.deepStrictEqual([kinds(x, 0), ev.hits[0].r], ['ag', 'armour'], 'no T-spin: armour holds, and shields the lane');
    ev = Ds.fire(x, [0], [[own('plain')]], { spin: true });
    assert.deepStrictEqual([kinds(x, 0), x.st.armour], ['g', 1]);
    x = bare([{ kinds: 'gg' }, { kinds: 'p' }, { kinds: 'gg' }]);
    Ds.fire(x, [0], [[0, own('plain'), 0]]);
    assert.deepStrictEqual([0, 1, 2].map((i) => kinds(x, i)), ['g', '', 'g'], 'a prism broken hits both lanes beside it');
    // A lock points right: it cannot be hit while lane 1 hangs lower than it.
    x = bare([{ kinds: 'kg', bot: 10, d: 1 }, { kinds: 'ggg', bot: 8 }]);
    assert(Ds.locked(x, 0));
    ev = Ds.fire(x, [0], [[own('plain'), 0]]);
    assert.deepStrictEqual([kinds(x, 0), ev.hits[0].r], ['kg', 'locked']);
    Ds.fire(x, [0], [[0, own('pierce')]]);
    assert.strictEqual(x.lanes[1].bot, 10, 'level with it now');
    assert(!Ds.locked(x, 0));
    Ds.fire(x, [0], [[own('plain'), 0]]);
    assert.deepStrictEqual([kinds(x, 0), x.st.locks], ['g', 1]);
    // Two locks pointing at each other never both hold (only a lane strictly lower locks).
    x = bare([{ kinds: 'k', bot: 9, d: 1 }, { kinds: 'k', bot: 9, d: -1 }]);
    assert(!Ds.locked(x, 0) && !Ds.locked(x, 1));
  });

  test('descent: drip — as the lowest block, a stone falls into its lane every 8 s (shown for 2 s first), never through the piece in play', () => {
    const g = mk('easy', 1), x = lay(g, [{ bot: 15, kinds: 'rg' }]);
    for (let i = 0; i < 3; i++) g.board.set(0, i, 5);
    let ev = null;
    for (let t = 0; t < Ds.DRIP * TPS - 1; t++) { ev = Ds.tick(x, g.board, {}); assert(!ev.drips.length); }
    assert(x.lanes[0].blocks[0].t <= Ds.DRIP_WARN * TPS, 'shown before it falls');
    ev = Ds.tick(x, g.board, {});
    assert.deepStrictEqual(ev.drips, [{ x: 0, from: 15, to: 3 }]);
    assert(g.board.get(0, 3) & CELL.STONE);
    // The piece in play in its way: it waits.
    x.lanes[0].blocks[0].t = 1;
    ev = Ds.tick(x, g.board, { piece: { cells: () => [[0, 8]], nudge: () => false } });
    assert(!ev.drips.length && x.lanes[0].blocks[0].t === 0);
    ev = Ds.tick(x, g.board, {});
    assert.strictEqual(ev.drips.length, 1);
  });

  test('descent: weight lowers its lane two rows at a time, half as often again; echo fuses into two stones', () => {
    const g = mk('easy', 1), x = lay(g, [{ bot: 15, kinds: 'wg' }, { bot: 15, kinds: 'gg' }]);
    x.lanes[0].next = 1; x.lanes[1].next = 1;
    const ev = Ds.tick(x, g.board, {});
    assert.deepStrictEqual(ev.lowered, [{ x: 0, rows: 2 }, { x: 1, rows: 1 }]);
    assert.deepStrictEqual([x.lanes[0].bot, x.lanes[1].bot], [13, 14]);
    assert.strictEqual(x.lanes[0].next, Math.round(x.lanes[0].iv * Ds.WEIGHT_SLOW));
    // Echo: it reaches the stack and leaves a second stone beside it.
    const g2 = mk('easy', 1), y = lay(g2, [null, { bot: 3, kinds: 'eg' }]);
    for (let i = 0; i < 3; i++) g2.board.set(1, i, 5);
    y.lanes[1].next = 1;
    const e2 = Ds.tick(y, g2.board, {});
    assert.deepStrictEqual(e2.fused, [{ x: 1, y: 3, k: 'echo', echo: [0, 3] }]);
    assert((g2.board.get(1, 3) & CELL.STONE) && (g2.board.get(0, 3) & CELL.STONE) && y.stones === 2);
  });

  test('descent: contact — a lane lowering onto your stack (or the floor) fuses its lowest block into stone; the piece in play is nudged down, or waited for', () => {
    const g = mk('easy', 1), x = lay(g, [{ bot: 4, kinds: 'gg' }, { bot: 1, kinds: 'g' }]);
    for (let i = 0; i < 3; i++) g.board.set(0, i, 5);
    x.lanes[0].next = 1; x.lanes[1].next = 1;
    let ev = Ds.tick(x, g.board, {});
    assert.deepStrictEqual(ev.lowered, [{ x: 0, rows: 1 }, { x: 1, rows: 1 }], 'one row down, onto the stack’s top and the floor');
    x.lanes[0].next = 1; x.lanes[1].next = 1;
    ev = Ds.tick(x, g.board, {});
    assert.deepStrictEqual(ev.fused.map((f) => [f.x, f.y]), [[0, 3], [1, 0]]);
    assert((g.board.get(0, 3) & CELL.STONE) && (g.board.get(1, 0) & CELL.STONE));
    assert.deepStrictEqual([kinds(x, 0), x.lanes[0].bot, kinds(x, 1)], ['g', 4, '']);
    assert.strictEqual(x.fused, 2);
    // Stone is a row's cell like any other (a FOREIGN one): it clears with its row, and pays nothing.
    assert(g.board.get(0, 3) & CELL.FOREIGN);
    // The piece in play right under a lane: nudged down a row; resting on the stack, the lane waits for it.
    const g2 = mk('easy', 1), y = lay(g2, [null, null, null, null, { bot: 10, kinds: 'g' }]);
    put(g2, 'O', 4, 8);
    y.lanes[4].next = 1;
    Ds.advance(g2);
    assert.deepStrictEqual([g2.piece.y, y.lanes[4].bot], [7, 9]);
    put(g2, 'O', 4, 0);
    for (let i = 0; i < 8; i++) { y.lanes[4].next = 1; Ds.advance(g2); }
    assert.deepStrictEqual([g2.piece.y, y.lanes[4].bot], [0, 2], 'it waits over the piece');
  });

  test('descent: the clear effects — a volley a row, a T-spin’s volley breaks armour, back-to-back adds a hit, a combo holds every lane back a second, a perfect clear breaks every lane’s lowest', () => {
    const W = 4;
    let x = bare([{ kinds: 'ggg' }, { kinds: 'ggg' }, { kinds: 'ggg' }, { kinds: 'ggg' }], W);
    const full = (k) => new Array(W).fill(own(k));
    Ds.fire(x, [0, 1, 2], [full('plain'), full('plain'), full('plain')]);
    assert(x.lanes.every((l) => !l.blocks.length), 'a triple: three volleys');
    x = bare([{ kinds: 'dd' }], 1);
    Ds.fire(x, [0], [[own('plain')]], { b2b: true });
    assert.strictEqual(kinds(x, 0), 'd2', 'back-to-back: 2 damage from a plain shot');
    x = bare([{ kinds: 'ag' }], 1);
    Ds.fire(x, [0], [[own('plain')]], { b2b: true });
    assert.strictEqual(kinds(x, 0), 'ag', 'back-to-back alone does not break armour');
    x = bare([{ kinds: 'gg' }, { kinds: 'gg' }], 2);
    const next0 = x.lanes.map((l) => l.next);
    let ev = Ds.fire(x, [0], [[Ds.STONE_CELL, Ds.STONE_CELL]], { combo: 2 });
    assert.deepStrictEqual(x.lanes.map((l) => l.next), next0.map((n) => n + TPS));
    assert.strictEqual(ev.delay, TPS);
    x = bare([{ kinds: 'ag' }, { kinds: 'dg' }, { kinds: 'kg', d: -1 }, { kinds: '' }], 4);
    x.lanes[0].bot = 5;
    ev = Ds.fire(x, [0], [[0, 0, 0, 0]], { perfect: true });
    assert.deepStrictEqual([0, 1, 2].map((i) => kinds(x, i)), ['g', 'g', 'g'], 'armour, dense and a lock all break');
    assert(ev.perfect && x.st.perfect === 1);
    // On a real board: a T-spin double into armour.
    const g = mk('easy', 1), d = lay(g, [null, { bot: 12, kinds: 'ag' }]);
    const rows = ['oo.ooooooo', 'o...oooooo', '.o........'];
    rows.forEach((r, y) => { for (let i = 0; i < 10; i++) if (r[i] === 'o') g.board.set(i, y, own('plain')); });
    g.board.set(2, 2, own('plain'));
    g.board.set(0, 2, own('plain'));
    put(g, 'T', 1, 0, 2);
    g.piece.lastRot = true;
    const res = g.lock();
    assert(res.tspin && res.lines === 2, JSON.stringify({ tspin: res.tspin, mini: res.mini, lines: res.lines }));
    assert(res.descent.broken.some((b) => b.k === 'armour'));
    assert.strictEqual(kinds(d, 1), '');
  });

  test('descent: pieces appear under the descent, as high as they fit, never in a pocket; a row holding a hanging block never clears; hanging blocks stay put through a clear and no item takes them', () => {
    const g = mk('medium', 1), x = D(g);
    const bot = x.lanes[4].bot;
    const cells = g.absCells(g.piece);
    assert(cells.every(([cx, cy]) => cy < x.lanes[cx].bot), 'under the descent');
    assert(Math.max(...cells.map((c) => c[1])) === bot - 1, 'as high as it fits');
    // A row with a hanging cell in it never clears.
    const g2 = mk('easy', 1), y = lay(g2, [{ bot: 0, kinds: 'g' }]);
    for (let i = 1; i < 10; i++) g2.board.set(i, 0, 5);
    assert.deepStrictEqual(g2.fullRows(), []);
    // A clear below a lane: everything of yours comes down; the descent stays.
    const g3 = mk('easy', 1), z = lay(g3, [{ bot: 6, kinds: 'gg' }]);
    for (let i = 0; i < 10; i++) g3.board.set(i, 0, own('plain'));
    g3.board.set(0, 1, 5); g3.board.set(0, 2, 5);
    Ds.clearOn(g3.board, [0]);
    assert(g3.board.get(0, 0) && g3.board.get(0, 1) && !g3.board.get(0, 2) && (g3.board.get(0, 6) & CELL.HANG) && (g3.board.get(0, 19) & CELL.HANG));
    // A short lane hangs from a rod to the ceiling: nothing of yours gets above it.
    assert(Ds.isHang(g3.board.get(0, 19)) && !(g3.board.get(0, 19) & CELL.COLOR), 'a rod: no colour');
    assert.strictEqual(z.lanes[0].bot, 6);
    // No item removes a hanging cell; Settle with nothing of yours is refused.
    assert(g3.kept(g3.board.get(0, 6)));
    const g4 = mk('easy', 1);
    g4.board.cells.forEach((v, i) => { if (!(v & CELL.HANG)) g4.board.cells[i] = 0; });
    assert.strictEqual(g4.allow('settle'), 'Nothing to settle');
    assert(g4.isClean(), 'the hanging blocks do not count against a perfect clear');
  });

  test('descent: the last block gone clears the stage (Cleared); a board with no room for the next piece tops out', () => {
    const g = mk('easy', 3), x = lay(g, [{ bot: 10, kinds: 'g' }]);
    for (let i = 0; i < 9; i++) g.board.set(i, 0, own('plain'));
    put(g, 'I', 7, 0, 1);
    let topped = 0;
    g.on('topout', () => topped++);
    const r = g.drop();
    assert(r && r.lines === 1);
    assert(g.over && g.endKind === 'cleared' && topped === 1 && Ds.left(x) === 0);
    // Topped out: the descent two rows over the floor, and nowhere for the next piece once the O is set.
    const g2 = mk('easy', 1), y = lay(g2, Array.from({ length: 10 }, () => ({ bot: 2, kinds: 'gggggggggggggggggg' })));
    for (let i = 0; i < 10; i++) if (i !== 3 && i !== 4 && i !== 9) g2.board.set(i, 0, 5);
    for (let i = 0; i < 10; i++) if (i !== 3 && i !== 4 && i !== 8) g2.board.set(i, 1, 5);
    put(g2, 'O', 3, 0);
    g2.lock();
    assert(g2.over && !g2.endKind, 'no room for the next piece: an ordinary top out');
    void y;
  });

  test('descent: save and resume mid-stage plays on exactly as an unbroken run (lanes, timers, drips, stone, the piece)', () => {
    const run = (g, n, rng) => { for (let i = 0; i < n && !g.over; i++) { if (i % 17 === 0) Ds.play(g, true, rng); Ds.advance(g); } };
    const a = mk('hard', 12, 10, 20, 4);
    D(a).started = true;
    run(a, 230, new RNG('r'));
    const json = JSON.parse(JSON.stringify(a.toJSON()));
    assert(Recipe.valid(json), 'a saved board is sound');
    const b = new Game({ saved: json });
    assert.deepStrictEqual(clone(D(b)), clone(D(a)));
    assert.deepStrictEqual(Array.from(b.board.cells), Array.from(a.board.cells));
    const ra = new RNG('s'), rb = new RNG('s');
    run(a, 300, ra); run(b, 300, rb);
    assert.deepStrictEqual(Array.from(b.board.cells), Array.from(a.board.cells));
    assert.deepStrictEqual(clone(D(b)), clone(D(a)));
    // Unsound saves are not resumed.
    const bad = clone(json); bad.x.descent.lanes.pop();
    assert(!Recipe.valid(bad));
    const bad2 = clone(json); bad2.x.descent.lanes[0].blocks[0] = { k: 'moss', hp: 1 };
    assert(!Recipe.valid(bad2));
    // The summary carries its numbers.
    const m = Recipe.summary(json).descent;
    assert(m && m.level === 'hard' && m.stage === 12 && m.ms === D(a).tk * 100 - 300 * 100 && m.rows >= 0);
  });

  test('descent: Rewind 5 s — the board, the descent, the piece, the queue and the numbers as they were five seconds of play back', () => {
    const g = mk('medium', 8, 10, 20, 2), X = Ds.extOf(g), rng = new RNG('w');
    for (let i = 0; i < 40; i++) { if (i % 15 === 0) Ds.play(g, true, rng); Ds.advance(g); }
    const tk0 = D(g).tk, mark = { cells: Array.from(g.board.cells), D: clone(Object.assign({}, D(g), { book: null })), queue: g.queue.map((e) => e.id).join(), pieces: g.s.pieces };
    for (let i = 0; i < 5 * TPS; i++) { if (i % 12 === 6) Ds.play(g, true, rng); Ds.advance(g); }
    assert(g.s.pieces > mark.pieces);
    const t = X.rewindTarget();
    assert(t && t.tk <= D(g).tk - 5 * TPS && t.tk >= D(g).tk - 5 * TPS - 2, 'five seconds back');
    assert.strictEqual(t.tk, tk0);
    const back = X.rewind(g);
    assert.strictEqual(back.back, 5 * TPS);
    assert.deepStrictEqual(Array.from(g.board.cells), mark.cells);
    assert.deepStrictEqual(clone(Object.assign({}, D(g), { book: null })), mark.D);
    assert.deepStrictEqual([g.queue.map((e) => e.id).join(), g.s.pieces], [mark.queue, mark.pieces]);
    // And from a top out: back in play.
    g.over = true; g.endKind = null;
    for (let i = 0; i < 4; i++) Ds.advance(Object.assign(g, { over: false }));
    g.over = true;
    assert(X.rewind(g) && !g.over && g.piece);
  });

  test('descent: pay — only your cells pay; a row holding stone is plain (never a quad, no streak)', () => {
    const g = mk('easy', 1);
    lay(g, [null, null, null, null, null, null, null, null, null, { bot: 15, kinds: 'g' }]);
    for (let y = 0; y < 4; y++) for (let i = 1; i < 10; i++) g.board.set(i, y, y === 0 && i === 5 ? Ds.STONE_CELL : own('plain'));
    put(g, 'I', -2, 0, 1);
    const r = g.drop();
    assert.strictEqual(r.n, 3, 'three rows of yours'); assert.strictEqual(r.plain, 1, 'the stone row is plain');
    assert(!r.quad);
    assert.strictEqual(r.ownCells, 39);
  });

  test('descent: the achievements are told by Descent’s own events, and pay on the current scale', () => {
    const A = L.Achievements, list = A.LIST.filter((a) => a.group === 'descent');
    assert.deepStrictEqual(list.map((a) => a.name), ['Daylight', 'Unlocked', 'Through the Armour', 'Clean Sky', 'Fifty Down', 'All Twelve', 'The Deep']);
    assert(list.every((a) => a.pay >= 30 && a.pay <= 250 && a.on === 'descent'));
    assert(!A.LIST.some((a) => /^pr_/.test(a.id)), 'Protect’s are gone');
    assert(A.GROUPS.some((g) => g.id === 'descent') && !A.GROUPS.some((g) => g.id === 'protect'));
    const st = () => ({ achievements: {}, stats: { free: { descent: { stages: { easy: [], medium: [], hard: [] } } } } });
    const g = mk('hard', 12);
    let s = st();
    assert.deepStrictEqual(A.check(s, { mode: 'descent', kind: 'cleared', D: D(g), g }).map((a) => a.id), ['ds_first', 'ds_deep']);
    s = st();
    const ev = { broken: [{ k: 'armour' }, { k: 'lock' }], perfect: false };
    assert.deepStrictEqual(A.check(s, { mode: 'descent', ev, D: D(g), g }).map((a) => a.id), ['ds_lock', 'ds_armour']);
    s = st(); s.stats.free.descent.stages.medium = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    assert(A.check(s, { mode: 'descent', ev: { broken: [], perfect: true }, D: D(g), g }).map((a) => a.id).includes('ds_twelve'));
    const e = mk('easy', 'endless'); D(e).broken = 50 * 10;
    assert(A.check(st(), { mode: 'descent', ev: { broken: [], perfect: false }, D: D(e), g: e }).some((a) => a.id === 'ds_endless'));
  });

  // The bots: a careful player (the best spot for each piece, by El-Tetris weights and the room under the descent, with
  // T-spins where armour hangs lowest) and a careless one (any spot), a piece every 2 seconds of play, on each stage of
  // each level, 2 seeds a stage. The measured results are printed.
  const RESULTS = {};
  test('descent: a careful bot beats most stages on every level; a careless one loses on Hard', () => {
    const SEEDS = [1, 2];
    const fmt = (rs) => rs.map((r) => (r.won ? 'W' : 'L') + Math.round(r.secs)).join(' ');
    for (const level of Ds.IDS) {
      const care = [], loose = [];
      for (let st = 1; st <= Ds.STAGE_COUNT; st++) for (const seed of SEEDS) {
        care.push(Ds.bot(mk(level, st, 10, 20, seed), { pace: 2, seed, careful: true, max: 900 }));
        if (level === 'hard') loose.push(Ds.bot(mk(level, st, 10, 20, seed), { pace: 2, seed, careful: false, max: 900 }));
      }
      RESULTS[level] = { care: care.filter((r) => r.won).length, n: care.length, loose: loose.filter((r) => r.won).length, ln: loose.length };
      console.log('       careful bot, ' + level + ': ' + RESULTS[level].care + '/' + care.length + ' cleared — ' + fmt(care));
      if (loose.length) console.log('       careless bot, ' + level + ': ' + RESULTS[level].loose + '/' + loose.length + ' cleared — ' + fmt(loose));
      assert(RESULTS[level].care > care.length / 2, level + ': the careful bot clears most stages');
      if (loose.length) assert(RESULTS[level].loose <= loose.length / 10, 'Hard: the careless bot loses');
      assert(care.every((r) => r.won || r.over), 'every run ends');
    }
    assert(RESULTS.easy.care >= RESULTS.medium.care && RESULTS.medium.care >= RESULTS.hard.care, 'harder levels are harder');
  });

  test('descent: bots earn no more per piece or per action than on Standard (a piece every 1 and 2 seconds; stages and Endless)', () => {
    const SEEDS = [1, 2, 3];
    const mean = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const base = SEEDS.map((seed) => Ds.bot(new Game({ w: 10, h: 20, seed, recipe: {} }), { pieces: 500 }));
    assert(base.every((b) => b.pieces === 500), 'the bot keeps a Standard board going');
    const f4 = (v) => v.toFixed(4), out = [];
    for (const level of Ds.IDS) {
      const rs = [];
      for (const stage of [1, 4, 7, 10, 'endless']) for (const pace of [1, 2]) for (const seed of SEEDS.slice(0, 2)) rs.push(Ds.bot(mk(level, stage, 10, 20, seed), { pace, seed, max: 600 }));
      assert(rs.reduce((a, r) => a + r.pieces, 0) >= 500, level + ': it plays');
      out.push(level + ' ' + f4(mean(rs, 'perPiece')) + '/' + f4(mean(rs, 'perAct')));
      assert(mean(rs, 'perPiece') <= mean(base, 'perPiece'), level + ': ' + f4(mean(rs, 'perPiece')) + ' a piece vs ' + f4(mean(base, 'perPiece')));
      assert(mean(rs, 'perAct') <= mean(base, 'perAct'), level + ': ' + f4(mean(rs, 'perAct')) + ' an action vs ' + f4(mean(base, 'perAct')));
    }
    console.log('       pay a piece / an action: standard ' + f4(mean(base, 'perPiece')) + '/' + f4(mean(base, 'perAct')) + '; ' + out.join('; '));
  });

  test('descent: a tick is quick (20 × 40, Hard Endless, a full well)', () => {
    const g = mk('hard', 'endless', 20, 40, 9), x = D(g);
    for (let y = 0; y < 20; y++) for (let i = 0; i < 20; i++) if ((i * 7 + y * 3) % 5) g.board.set(i, y, 5);
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) { for (const l of x.lanes) l.next = Math.min(l.next, 2); Ds.tick(x, g.board, {}); }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
    assert(ms < 2, ms.toFixed(3) + ' ms a tick');
    void picture;
  });
};
