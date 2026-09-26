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

  const UPGRADES = {
    press:     { name: 'Press', desc: 'Another stamping press on the line.', base: 10, growth: 1.25, max: 1000 },
    tempo:     { name: 'Tempo', desc: 'Every press runs 10% faster.', base: 60, growth: 2.4, max: 200 },
    mold:      { name: 'Molds', desc: 'Finer molds: each mino is worth 12% more.', base: 100, growth: 2.5, max: 200 },
    calib:     { name: 'Calibration', desc: 'Defects are 10% rarer.', base: 150, growth: 2.6, max: 30 },
    inspect:   { name: 'Inspector', desc: 'A robot arm at the gate pulls more defects off the belt.', base: 400, growth: 2.8, max: 25 },
    warehouse: { name: 'Warehouse', desc: 'The plant keeps running an hour longer while you are away.', base: 800, growth: 3, max: 22 },
    lens:      { name: 'Inspection Lens', desc: 'Defects glow faintly on the belt.', base: 2500, growth: 1, max: 1 },
  };

  const DEFECTS = {
    extra:    { name: 'Overweight', note: 'one cell too many' },
    missing:  { name: 'Underweight', note: 'one cell short' },
    split:    { name: 'Split', note: 'a cell broke away' },
    diagonal: { name: 'Corner-joined', note: 'held on by a corner' },
    crack:    { name: 'Cracked', note: 'hairline crack' },
    burnt:    { name: 'Scorched', note: 'burnt cell' },
  };

  const SYL = ['quad', 'tro', 'mino', 'blok', 'pent', 'hex', 'cube', 'tile', 'grid', 'stack', 'brick', 'lat', 'pix', 'mor', 'ten', 'vox', 'nib', 'zel', 'cor', 'fen'];
  const FIRM = ['Logistics', '& Sons', 'Holdings', 'Supply', 'Toys', 'Architects', 'Freight', 'Co-op', 'Studios', 'Depot', 'Works', 'Guild'];
  const PLANT_ADJ = ['Cobalt', 'Maple', 'Harbor', 'Granite', 'Copper', 'Willow', 'Signal', 'Juniper', 'Ember', 'Northgate', 'Saffron', 'Tin'];
  const PLANT_NOUN = ['Works', 'Foundry', 'Mill', 'Yard', 'Assembly', 'Pressworks', 'Plant', 'Forge'];

  function cap(s) { return s[0].toUpperCase() + s.slice(1); }

  function plantName(seed) {
    const r = new RNG(hash32('plant:' + seed));
    return r.pick(PLANT_ADJ) + ' ' + r.pick(PLANT_NOUN);
  }

  function create() {
    return {
      v: 1,
      credits: 0, runEarned: 0, lifetime: 0,
      tier: 1, maxTierRun: 1,
      up: { press: 0, tempo: 0, mold: 0, calib: 0, inspect: 0, warehouse: 0, lens: 0 },
      patents: 0, retools: 0, plantSeed: (Math.random() * 1e9) | 0,
      contracts: [], contractCounter: 0,
      flawless: 0,
      stats: { shipped: 0, byTier: {}, caughtManual: 0, caughtAuto: 0, escaped: 0, falseRejects: 0, contractsDone: 0, bestRate: 0, offlineEarned: 0, watchedMs: 0, retooled: 0 },
      lastTick: Date.now(),
      unlocks: {},
    };
  }

  // ---- rates ---------------------------------------------------------------------------------------------------------

  function rates(f) {
    const presses = 1 + f.up.press;
    const P = presses * 0.35 * Math.pow(1.1, f.up.tempo);
    const V = TIERS[f.tier].value * Math.pow(1.12, f.up.mold) * (1 + 0.25 * f.patents);
    const D = Math.min(0.5, Math.max(0.01, (0.08 + 0.02 * f.tier) * Math.pow(0.9, f.up.calib)));
    const C = Math.min(0.98, 1 - Math.pow(0.82, f.up.inspect));
    const perMino = (1 - D) + D * (C * 0.2 - (1 - C) * 0.6);
    const offlineHours = 2 + f.up.warehouse;
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
    const keep = { warehouse: f.up.warehouse, lens: f.up.lens };
    f.up = Object.assign({ press: 0, tempo: 0, mold: 0, calib: 0, inspect: 0 }, keep);
    f.plantSeed = (f.plantSeed * 7919 + 13) | 0;
    f.flawless = 0;
    f.contracts = [];
    return gain;
  }

  // ---- contracts -----------------------------------------------------------------------------------------------------

  function clientName(r) { return cap(r.pick(SYL)) + r.pick(SYL) + ' ' + r.pick(FIRM); }

  function niceRound(x) {
    if (x < 10) return Math.max(1, Math.round(x));
    const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
    return Math.round(x / p) * p;
  }

  function newContract(f) {
    const r = new RNG(hash32('contract:' + f.plantSeed + ':' + f.contractCounter));
    f.contractCounter++;
    const rt = rates(f);
    const kinds = ['ship', 'ship', 'catch', 'earn', 'flawless'];
    const kind = r.pick(kinds);
    const c = { id: f.contractCounter, kind, client: clientName(r), progress: 0, reward: {} };
    const minutes = r.range(3, 10);
    if (kind === 'ship') {
      c.target = niceRound(rt.P * minutes * 60);
      c.reward.credits = Math.round(c.target * rt.V * 0.6);
      if (r.chance(0.5)) c.reward.lines = r.range(4, 12);
    } else if (kind === 'catch') {
      c.target = r.range(3, 8 + Math.min(12, f.tier * 2));
      c.reward.lines = r.range(10, 18) + f.tier * 2;
      c.reward.credits = Math.round(rt.perSec * 60 * r.range(2, 5));
    } else if (kind === 'earn') {
      c.target = niceRound(rt.perSec * minutes * 60 + 20);
      c.reward.item = r.pick(['reroll', 'mirror', 'pebble', 'rewind', 'sand', 'order', 'bomb']);
      c.reward.credits = Math.round(c.target * 0.25);
    } else {
      c.target = niceRound(Math.min(rt.P * minutes * 60, 40 + rt.P * 120));
      c.reward.lines = r.range(16, 30) + f.tier * 2;
      if (r.chance(0.35)) c.reward.item = r.pick(['drill', 'phase', 'settle', 'order']);
    }
    c.minutes = minutes;
    return c;
  }

  function fillContracts(f) {
    while (f.contracts.length < 3) f.contracts.push(newContract(f));
  }

  function progress(f, kind, amount) {
    for (const c of f.contracts) {
      if (c.done) continue;
      if (kind === 'flawless' && c.kind === 'flawless') c.progress = Math.min(c.target, f.flawless);
      else if (c.kind === kind) c.progress = Math.min(c.target, c.progress + amount);
      if (c.progress >= c.target) c.done = true;
    }
  }

  /** Takes a finished contract's reward (credits applied here; lines and items returned for the caller). */
  function claim(f, id) {
    const i = f.contracts.findIndex((c) => c.id === id);
    if (i < 0 || !f.contracts[i].done) return null;
    const c = f.contracts[i];
    if (c.reward.credits) earn(f, c.reward.credits);
    f.stats.contractsDone++;
    f.contracts.splice(i, 1, newContract(f));
    return c.reward;
  }

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
  function makeItem(f, r, forceDefect) {
    const n = f.tier;
    const cat = catalog(n);
    const idx = r.int(cat.length);
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
    return { cells, n, idx, name: productName(n, idx), defect, mark, hue: (idx * 47 + n * 31) % 360 };
  }

  // ---- the belt you can watch ---------------------------------------------------------------------------------------

  /**
   * The visible line: items ride from the press (x = 0) past the inspector (x = INSPECT) to shipping (x = 1).
   * Each item stands for a batch of minos so the belt stays readable however fast the plant runs.
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

    step(dt) {
      const f = this.f;
      const r = rates(f);
      const batch = this.batch();
      this.acc += dt;
      const interval = batch / r.P;
      // Never flood the belt after a long frame.
      if (this.acc > interval * 4) this.acc = interval * 4;
      while (this.acc >= interval) {
        this.acc -= interval;
        const it = makeItem(f, this.rng);
        it.id = this.nextId++;
        it.x = 0;
        it.batch = batch;
        it.stamp = 0;
        this.items.push(it);
        this.events.push({ kind: 'stamp' });
      }
      const v = 1 / this.travel;
      for (const it of this.items) {
        if (it.gone) { it.fade += dt * 2.5; continue; }
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
      const interval = this.batch() / rates(this.f).P;
      const step = interval / this.travel;
      for (let x = 0.9 - this.rng.next() * step; x > 0.02; x -= step) {
        const it = makeItem(this.f, this.rng);
        it.id = this.nextId++; it.x = x; it.batch = this.batch(); it.stamp = 1; it.pre = true;
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
        progress(f, 'flawless', 0);
        this.events.push({ kind: 'escaped', item: it });
      } else {
        earn(f, r.V * it.batch);
        f.flawless += it.batch;
        progress(f, 'flawless', 0);
      }
    }

    remove(it, how) {
      const f = this.f, r = rates(f);
      if (it.gone) return null;
      it.gone = how; it.fade = 0;
      if (how === 'auto') {
        earn(f, 0.2 * r.V * it.batch);
        f.stats.caughtAuto += it.batch;
        this.events.push({ kind: 'auto', item: it });
      } else if (it.defect) {
        earn(f, 0.5 * r.V * it.batch);
        f.stats.caughtManual += it.batch;
        progress(f, 'catch', 1);
        this.events.push({ kind: 'caught', item: it });
      } else {
        f.stats.falseRejects += it.batch;
        it.gone = 'wasted';
        this.events.push({ kind: 'wasted', item: it });
      }
      return it.gone;
    }

    drain() { const e = this.events; this.events = []; return e; }
  }

  L.Factory = {
    TIERS, MAX_TIER, UPGRADES, DEFECTS, PATENTS_FOR_TIER,
    create, rates, cost, buy, nextTier, unlockTier, earn, runExpected, catchUp,
    retoolGain, retool, newContract, fillContracts, progress, claim, catalog, makeItem, productName, plantName, Belt,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
