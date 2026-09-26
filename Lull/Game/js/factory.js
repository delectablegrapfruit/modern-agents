// Lull — the Mino Factory: an idle assembly line. Presses stamp polyominoes onto a belt, the belt ships them for
// credits, and a share come out defective — the wrong number of cells, split in two, cracked or scorched. Pull them
// off the belt yourself (maintenance) or buy inspectors to do it. Product lines climb from monominoes to decominoes;
// retooling the plant trades it all in for patents that make the next plant faster.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG, hash32 } = L;

  const TIERS = [
    null,
    { n: 1, name: 'Monomino', short: 'Mono', value: 1, unlock: 0 },
    { n: 2, name: 'Domino', short: 'Di', value: 6, unlock: 150 },
    { n: 3, name: 'Tromino', short: 'Tri', value: 36, unlock: 1.2e4 },
    { n: 4, name: 'Tetromino', short: 'Tetro', value: 216, unlock: 2e6 },
    { n: 5, name: 'Pentomino', short: 'Pento', value: 1300, unlock: 5e8 },
    { n: 6, name: 'Hexomino', short: 'Hexo', value: 7800, unlock: 2e11 },
    { n: 7, name: 'Heptomino', short: 'Hepto', value: 4.7e4, unlock: 1e14 },
    { n: 8, name: 'Octomino', short: 'Octo', value: 2.8e5, unlock: 8e16 },
    { n: 9, name: 'Enneomino', short: 'Ennea', value: 1.7e6, unlock: 2e19 },
    { n: 10, name: 'Decomino', short: 'Deco', value: 1e7, unlock: 1e22 },
  ];
  // Patents a retool grants, by the highest product line the plant reached.
  const PATENTS_FOR_TIER = { 5: 1, 6: 3, 7: 8, 8: 20, 9: 50, 10: 120 };
  const MAX_TIER = 10;

  // Three things to invest in; the rest of the factory is played by hand.
  const UPGRADES = {
    press:   { name: 'Presses', icon: '⚙', desc: 'More presses, more minos.', base: 10, growth: 1.28, max: 1000 },
    quality: { name: 'Quality', icon: '✦', desc: 'Finer molds: minos worth more, and fewer defects.', base: 60, growth: 2.2, max: 200 },
    inspect: { name: 'Inspector', icon: '⌖', desc: 'A robot arm at the gate that pulls defects you miss.', base: 250, growth: 2.7, max: 18 },
  };
  const OFFLINE_HOURS = 8;

  const DEFECTS = {
    extra:    { name: 'Overweight', note: 'one cell too many' },
    missing:  { name: 'Underweight', note: 'one cell short' },
    split:    { name: 'Split', note: 'a cell broke away' },
    diagonal: { name: 'Corner-joined', note: 'held on by a corner' },
    crack:    { name: 'Cracked', note: 'hairline crack' },
    burnt:    { name: 'Scorched', note: 'burnt cell' },
  };

  const PLANT_ADJ = ['Cobalt', 'Maple', 'Harbor', 'Granite', 'Copper', 'Willow', 'Signal', 'Juniper', 'Ember', 'Northgate', 'Saffron', 'Tin'];
  const PLANT_NOUN = ['Works', 'Foundry', 'Mill', 'Yard', 'Assembly', 'Pressworks', 'Plant', 'Forge'];

  function plantName(seed) {
    const r = new RNG(hash32('plant:' + seed));
    return r.pick(PLANT_ADJ) + ' ' + r.pick(PLANT_NOUN);
  }

  function create() {
    return {
      v: 3,
      credits: 0, runEarned: 0, lifetime: 0,
      tier: 1, maxTierRun: 1,
      up: { press: 0, quality: 0, inspect: 0 },
      streak: 0, bestStreak: 0,
      patents: 0, retools: 0, plantSeed: (Math.random() * 1e9) | 0,
      ordersMade: 0,
      flawless: 0,
      stats: { shipped: 0, byTier: {}, caughtManual: 0, caughtAuto: 0, escaped: 0, falseRejects: 0, contractsDone: 0, bestRate: 0, offlineEarned: 0, watchedMs: 0, retooled: 0, golden: 0, orders: 0, orderPoints: 0, perfectOrders: 0, bestOrder: 0 },
      lastTick: Date.now(),
      unlocks: {},
    };
  }

  /** Saves from before the factory was simplified: seven upgrades fold into three. */
  function migrate(f) {
    if (f.v === 3) return f;
    if (f.v === 2) { delete f.contracts; delete f.contractCounter; f.stats = Object.assign({ orders: 0, orderPoints: 0, perfectOrders: 0, bestOrder: 0 }, f.stats); f.v = 3; return f; }
    const up = f.up || {};
    f.up = { press: up.press || 0, quality: Math.floor(((up.mold || 0) + (up.calib || 0)) / 2), inspect: Math.min(18, up.inspect || 0) };
    f.streak = f.streak || 0; f.bestStreak = f.bestStreak || 0;
    f.stats = Object.assign({ golden: 0, orders: 0, orderPoints: 0, perfectOrders: 0, bestOrder: 0 }, f.stats);
    delete f.contracts; delete f.contractCounter;
    f.v = 3;
    return f;
  }

  // ---- rates ---------------------------------------------------------------------------------------------------------

  function rates(f) {
    const presses = 1 + f.up.press;
    const P = 0.35 * (1 + 0.5 * f.up.press);
    const V = TIERS[f.tier].value * Math.pow(1.18, f.up.quality) * (1 + 0.25 * f.patents);
    const D = Math.min(0.5, Math.max(0.03, (0.08 + 0.02 * f.tier) * Math.pow(0.92, f.up.quality)));
    const C = Math.min(0.95, 1 - Math.pow(0.85, f.up.inspect));
    const perMino = (1 - D) + D * (C * 0.2 - (1 - C) * 0.6);
    const offlineHours = OFFLINE_HOURS;
    return { presses, P, V, D, C, perMino, perSec: P * V * perMino, offlineHours };
  }

  function cost(f, key) {
    const u = UPGRADES[key];
    const lvl = f.up[key];
    if (lvl >= u.max) return Infinity;
    return Math.ceil(u.base * Math.pow(u.growth, lvl));
  }

  function buy(f, key) {
    const c = cost(f, key);
    if (!(f.credits >= c)) return false;
    f.credits -= c;
    f.up[key]++;
    return true;
  }

  function nextTier(f) { return f.tier < MAX_TIER ? TIERS[f.tier + 1] : null; }

  function unlockTier(f) {
    const t = nextTier(f);
    if (!t || f.credits < t.unlock) return false;
    f.credits -= t.unlock;
    f.tier = t.n;
    f.maxTierRun = Math.max(f.maxTierRun || 1, t.n);
    return true;
  }

  // ---- earning -------------------------------------------------------------------------------------------------------

  function earn(f, amount) {
    f.credits = Math.max(0, f.credits + amount);
    if (amount > 0) { f.runEarned += amount; f.lifetime += amount; }
    progress(f, 'earn', Math.max(0, amount));
  }

  /** Unwatched running: the expected outcome of dt seconds of production. */
  function runExpected(f, dt) {
    if (dt <= 0) return { shipped: 0, credits: 0 };
    const r = rates(f);
    const made = r.P * dt;
    const good = made * (1 - r.D), bad = made * r.D;
    const caught = bad * r.C, escaped = bad - caught;
    const credits = r.P * r.V * r.perMino * dt;
    earn(f, credits);
    const shipped = good + escaped;
    f.stats.shipped += shipped;
    f.stats.byTier[f.tier] = (f.stats.byTier[f.tier] || 0) + shipped;
    f.stats.caughtAuto += caught;
    f.stats.escaped += escaped;
    progress(f, 'ship', shipped);
    // A flawless streak survives only as long as nothing escapes: about 1/(D(1−C)) minos.
    if (escaped >= 1) f.flawless = Math.min(f.flawless + shipped, Math.floor(1 / Math.max(1e-9, r.D * (1 - r.C))));
    else f.flawless += shipped;
    progress(f, 'flawless', 0);
    return { shipped, credits, caught, escaped };
  }

  /** Time passed while the page was closed or asleep, capped by the warehouse. */
  function catchUp(f, now) {
    const r = rates(f);
    const dt = Math.max(0, (now - f.lastTick) / 1000);
    const capped = Math.min(dt, r.offlineHours * 3600);
    f.lastTick = now;
    if (capped < 1) return null;
    const res = runExpected(f, capped);
    f.stats.offlineEarned += res.credits;
    return Object.assign(res, { seconds: dt, cappedSeconds: capped });
  }

  // ---- retooling (prestige) ------------------------------------------------------------------------------------------

  function retoolGain(f) { return PATENTS_FOR_TIER[Math.max(f.tier, f.maxTierRun || 1)] || 0; }
  function retool(f) {
    const gain = retoolGain(f);
    if (!gain) return 0;
    f.patents += gain;
    f.retools++;
    f.stats.retooled++;
    f.credits = 0;
    f.runEarned = 0;
    f.tier = 1;
    f.maxTierRun = 1;
    f.up = { press: 0, quality: 0, inspect: 0 };
    f.plantSeed = (f.plantSeed * 7919 + 13) | 0;
    f.flawless = 0;
    return gain;
  }

  // ---- orders: the hands-on part (in the spirit of the Papa's restaurant games) ------------------------------------
  //
  // A customer walks up and orders one mino: a shape and a paint. You build it cell by cell in the mold, paint it,
  // press it (stop the needle in the green), and hand it over. They grade each step; the grade sets the pay.

  const PAINTS = ['#ef6f6c', '#f7c548', '#6cc486', '#5aa9e6', '#b784d8', '#f39a4a'];
  const CUSTOMER_NAMES = ['Ada', 'Bo', 'Cleo', 'Dex', 'Edie', 'Finn', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kit', 'Lou', 'Mo', 'Nell', 'Otto', 'Pip', 'Quin', 'Rae', 'Sol', 'Tess', 'Uma', 'Vic', 'Wren', 'Yuki', 'Zed'];

  /** Paints on the shelf: three to start, one more every other product line. */
  function paintCount(f) { return Math.min(PAINTS.length, 3 + Math.floor((f.tier - 1) / 2)); }
  /** Orders are three-cell pieces at first and grow with the product line (up to eight cells). */
  function orderSize(f) { return Math.max(3, Math.min(8, f.tier)); }

  function newOrder(f, r) {
    const n = orderSize(f);
    const cat = catalog(n);
    let cells = cat[r.int(cat.length)].map((c) => c.slice());
    for (let t = r.int(4); t > 0; t--) cells = cells.map(([x, y]) => [y, -x]);
    cells = Pieces.normalize(cells);
    return {
      id: (f.ordersMade = (f.ordersMade || 0) + 1),
      cells, paint: r.int(paintCount(f)),
      customer: { name: r.pick(CUSTOMER_NAMES), hue: r.int(360), hat: r.int(4), size: 0.9 + r.next() * 0.25 },
      created: Date.now(),
    };
  }

  /**
   * Grades a finished order, each step out of 100: the shape (any turn or flip counts), the paint, the press
   * (0 = dead centre of the green), and the wait. Returns the scores, the total and the pay.
   */
  function gradeOrder(f, order, built) {
    const want = order.cells, got = built.cells;
    let shape;
    if (got.length && Pieces.freeKey(got) === Pieces.freeKey(want)) shape = 100;
    else {
      const off = Math.abs(got.length - want.length);
      shape = Math.max(0, 70 - off * 20 - (got.length && Pieces.isConnected(got) ? 0 : 30));
    }
    const paint = built.paint === order.paint ? 100 : 30;
    const press = Math.round(Math.max(0, 100 - Math.abs(built.press == null ? 1 : built.press) * 100));
    const waited = (Date.now() - order.created) / 1000;
    const wait = Math.round(Math.max(50, Math.min(100, 100 - (waited - 60) / 3)));
    const total = Math.round((shape * 2 + paint + press + wait) / 5);
    const r = rates(f);
    const credits = Math.round((r.perSec * 30 + TIERS[f.tier].value * 25) * (0.3 + total / 100));
    const tip = total >= 90 ? Math.round(credits * 0.3) : 0;
    const lines = total >= 97 ? 3 : total >= 88 ? 2 : total >= 70 ? 1 : 0;
    return { shape, paint, press, wait, total, credits, tip, lines, stars: total >= 95 ? 3 : total >= 80 ? 2 : total >= 55 ? 1 : 0 };
  }

  function serveOrder(f, grade) {
    earn(f, grade.credits + grade.tip);
    const s = f.stats;
    s.orders = (s.orders || 0) + 1;
    s.orderPoints = (s.orderPoints || 0) + grade.total;
    if (grade.total >= 95) s.perfectOrders = (s.perfectOrders || 0) + 1;
    s.bestOrder = Math.max(s.bestOrder || 0, grade.total);
  }

  function progress() { /* contracts are gone; kept so older callers stay harmless */ }

  // ---- products and defects ------------------------------------------------------------------------------------------

  const catalogCache = {};
  function catalog(n) {
    if (!catalogCache[n]) catalogCache[n] = Pieces.freePolyominoes(n);
    return catalogCache[n];
  }

  function productName(n, idx) {
    return TIERS[n].short + '-' + String(idx + 1).padStart(n > 6 ? 3 : 2, '0');
  }

  function neighbors(x, y) { return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]; }

  /** A belt item: a random product of the plant's tier, sometimes defective. */
  function makeItem(f, r, forceDefect, forceIdx) {
    const n = f.tier;
    const cat = catalog(n);
    const idx = forceIdx != null ? forceIdx : r.int(cat.length);
    let cells = cat[idx].map((c) => c.slice());
    // Random orientation.
    const turns = r.int(4);
    for (let t = 0; t < turns; t++) cells = cells.map(([x, y]) => [y, -x]);
    if (r.chance(0.5)) cells = cells.map(([x, y]) => [-x, y]);
    cells = Pieces.normalize(cells);
    const rt = rates(f);
    const defective = forceDefect != null ? forceDefect : r.chance(rt.D);
    let defect = null, mark = null;
    if (defective) {
      const kinds = n === 1 ? ['extra', 'crack', 'burnt'] : n === 2 ? ['extra', 'missing', 'diagonal', 'crack', 'burnt'] : ['extra', 'missing', 'split', 'diagonal', 'crack', 'burnt'];
      defect = r.pick(kinds);
      const set = new Set(cells.map((c) => c.join(',')));
      const free = (x, y) => !set.has(x + ',' + y);
      if (defect === 'extra') {
        const opts = [];
        for (const [x, y] of cells) for (const [nx, ny] of neighbors(x, y)) if (free(nx, ny)) opts.push([nx, ny]);
        cells.push(r.pick(opts));
      } else if (defect === 'missing') {
        const opts = cells.filter((c) => Pieces.isConnected(cells.filter((d) => d !== c)));
        const gone = r.pick(opts);
        cells = cells.filter((c) => c !== gone);
      } else if (defect === 'split' || defect === 'diagonal') {
        // Move a leaf cell somewhere it only touches by a corner (diagonal) or not at all (split).
        const leaves = cells.filter((c) => Pieces.isConnected(cells.filter((d) => d !== c)));
        const moved = r.pick(leaves);
        const rest = cells.filter((c) => c !== moved);
        const restSet = new Set(rest.map((c) => c.join(',')));
        const touches4 = (x, y) => neighbors(x, y).some(([a, b]) => restSet.has(a + ',' + b));
        const touches8 = (x, y) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => restSet.has((x + dx) + ',' + (y + dy)));
        const b = Pieces.boundsOf(rest);
        const opts = [];
        for (let y = b.minY - 2; y <= b.maxY + 2; y++) for (let x = b.minX - 2; x <= b.maxX + 2; x++) {
          if (restSet.has(x + ',' + y) || touches4(x, y)) continue;
          if (defect === 'diagonal' ? touches8(x, y) : (!touches8(x, y) && (Math.abs(x - b.minX) <= 1 || Math.abs(x - b.maxX) <= 1 || Math.abs(y - b.minY) <= 1 || Math.abs(y - b.maxY) <= 1))) opts.push([x, y]);
        }
        cells = rest.concat([opts.length ? r.pick(opts) : [b.maxX + 2, b.minY]]);
      } else {
        mark = r.int(cells.length);
      }
      cells = Pieces.normalize(cells);
    }
    return { cells, n, idx, name: productName(n, idx), defect, mark, hue: (idx * 47 + n * 31) % 360, golden: !defective && r.chance(1 / 70) };
  }

  // ---- the belt you can watch ---------------------------------------------------------------------------------------

  /**
   * The line on screen, and what you do there. Items ride from the press (x = 0) past the inspector's gate to the
   * shipping crate (x = 1); each stands for a batch of minos so the belt stays readable however fast the plant runs.
   *  - Click a defect: pulled, and your QC streak grows (worth up to double on everything you ship while watching).
   *    Pull a good one or let a defect ship and the streak starts over.
   *  - Golden minos: rare, click them for lines.
   */
  class Belt {
    constructor(f) {
      this.f = f;
      this.items = [];
      this.acc = 0;
      this.rng = new RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      this.travel = 14; // seconds end to end
      this.events = [];
      this.nextId = 1;
    }
    static get INSPECT() { return 0.64; }
    // Bigger products need more room on the belt, so they come in fewer, larger batches.
    batch() { return Math.max(1, Math.ceil(rates(this.f).P * (2.4 + 0.45 * this.f.tier))); }
    spawnInterval() { return this.batch() / rates(this.f).P; }
    streakMult() { return 1 + Math.min(1, this.f.streak * 0.05); }

    spawn(x) {
      const f = this.f;
      const it = makeItem(f, this.rng);
      it.id = this.nextId++;
      it.x = x;
      it.batch = this.batch();
      it.stamp = 0;
      return it;
    }

    step(dt) {
      const f = this.f;
      const r = rates(f);
      this.acc += dt;
      const interval = this.batch() / r.P;
      if (this.acc > interval * 4) this.acc = interval * 4;
      while (this.acc >= interval) {
        this.acc -= interval;
        this.items.push(this.spawn(0));
        this.events.push({ kind: 'stamp' });
      }
      const v = 1 / this.travel;
      for (const it of this.items) {
        if (it.gone) { it.fade += dt * 2.2; continue; }
        const before = it.x;
        it.x += v * dt;
        it.stamp += dt;
        if (before < Belt.INSPECT && it.x >= Belt.INSPECT && it.defect && !it.checked) {
          it.checked = true;
          if (this.rng.chance(r.C)) this.remove(it, 'auto');
        }
        if (it.x >= 1 && !it.gone) this.ship(it);
      }
      this.items = this.items.filter((it) => !(it.gone && it.fade >= 1));
    }

    /** Items already on their way when you look (their output was counted while nobody watched). */
    prefill() {
      const step = this.spawnInterval() / this.travel;
      for (let x = 0.9 - this.rng.next() * step; x > 0.02; x -= step) {
        const it = this.spawn(x);
        it.stamp = 1; it.pre = true;
        if (x > Belt.INSPECT) it.checked = true;
        this.items.unshift(it);
      }
    }

    ship(it) {
      const f = this.f, r = rates(f);
      it.gone = 'shipped'; it.fade = 0;
      if (it.pre) return;
      f.stats.shipped += it.batch;
      f.stats.byTier[f.tier] = (f.stats.byTier[f.tier] || 0) + it.batch;
      progress(f, 'ship', it.batch);
      if (it.defect) {
        earn(f, -0.6 * r.V * it.batch);
        f.stats.escaped += it.batch;
        f.flawless = 0;
        if (f.streak) this.events.push({ kind: 'streakLost', from: f.streak });
        f.streak = 0;
        progress(f, 'flawless', 0);
        this.events.push({ kind: 'escaped', item: it });
      } else {
        const v = r.V * it.batch * this.streakMult() * (it.golden ? 3 : 1);
        earn(f, v);
        f.flawless += it.batch;
        progress(f, 'flawless', 0);
        this.events.push({ kind: 'shipped', item: it, value: v });
      }
    }

    /** A click on an item (how = 'manual'), or the inspector's arm (how = 'auto'). */
    remove(it, how) {
      const f = this.f, r = rates(f);
      if (it.gone) return null;
      it.fade = 0;
      if (how === 'auto') {
        it.gone = 'auto';
        earn(f, 0.2 * r.V * it.batch);
        f.stats.caughtAuto += it.batch;
        this.events.push({ kind: 'auto', item: it });
      } else if (it.defect) {
        it.gone = 'caught';
        f.streak++;
        f.bestStreak = Math.max(f.bestStreak, f.streak);
        earn(f, 0.5 * r.V * it.batch * this.streakMult());
        f.stats.caughtManual += it.batch;
        progress(f, 'catch', 1);
        this.events.push({ kind: 'caught', item: it, streak: f.streak });
      } else if (it.golden) {
        it.gone = 'golden';
        const lines = 1 + this.rng.int(3);
        earn(f, 5 * r.V * it.batch);
        f.stats.golden++;
        this.events.push({ kind: 'golden', item: it, lines });
      } else {
        it.gone = 'wasted';
        f.stats.falseRejects += it.batch;
        if (f.streak) this.events.push({ kind: 'streakLost', from: f.streak });
        f.streak = 0;
        this.events.push({ kind: 'wasted', item: it });
      }
      return it.gone;
    }

    drain() { const e = this.events; this.events = []; return e; }
  }

  L.Factory = {
    TIERS, MAX_TIER, UPGRADES, DEFECTS, PATENTS_FOR_TIER,
    create, migrate, rates, cost, buy, OFFLINE_HOURS, nextTier, unlockTier, earn, runExpected, catchUp,
    retoolGain, retool, progress, PAINTS, paintCount, orderSize, newOrder, gradeOrder, serveOrder, catalog, makeItem, productName, plantName, Belt,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
