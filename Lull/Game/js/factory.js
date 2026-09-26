// Lull — the Factory: a small idler. Buy presses that stamp minos, from monominoes up to decominoes; every press
// earns credits a second, and doubles its output at 10, 25, 50, 100 and 200 owned. The income fills crates, and a
// full crate trades for ◆ lines. Now and then a mino comes off the line defective — flick it off the belt before it
// ships (or buy an inspector). It runs while Lull is closed, for up to eight hours.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces } = L;

  const VERSION = 5;
  const OFFLINE_HOURS = 8;

  // One press per product line: its first price and what one press earns a second.
  const TIERS = [
    null,
    { n: 1, name: 'Monomino', cost: 10, rate: 0.2 },
    { n: 2, name: 'Domino', cost: 120, rate: 1.4 },
    { n: 3, name: 'Tromino', cost: 1500, rate: 9 },
    { n: 4, name: 'Tetromino', cost: 1.8e4, rate: 60 },
    { n: 5, name: 'Pentomino', cost: 2.2e5, rate: 400 },
    { n: 6, name: 'Hexomino', cost: 2.8e6, rate: 2700 },
    { n: 7, name: 'Heptomino', cost: 3.6e7, rate: 1.8e4 },
    { n: 8, name: 'Octomino', cost: 4.8e8, rate: 1.25e5 },
    { n: 9, name: 'Enneomino', cost: 6.5e9, rate: 8.6e5 },
    { n: 10, name: 'Decomino', cost: 9e10, rate: 6e6 },
  ];
  const MAX_TIER = 10;
  const GROWTH = 1.15;
  const MILESTONES = [10, 25, 50, 100, 200, 400];

  const INSPECTOR = { base: 150, growth: 3.2, max: 12 };
  const DEFECT_RATE = 0.1;

  function create() {
    return {
      v: VERSION,
      credits: 10, lifetime: 0, // enough for the first press
      owned: {},
      inspect: 0,
      crates: 0, crate: 0,
      streak: 0, bestStreak: 0,
      lastTick: Date.now(),
      stats: { shipped: 0, caught: 0, caughtAuto: 0, escaped: 0, wasted: 0, offlineEarned: 0, lines: 0 },
    };
  }

  /** Older factories (the workshop, the counter …) start over, with a few credits for the trouble. */
  function migrate(f) {
    if (f && f.v === VERSION) { f.owned = f.owned || {}; f.stats = Object.assign(create().stats, f.stats); return f; }
    const n = create();
    if (f && f.stats) {
      n.credits = Math.round(Math.min(500, 20 + 40 * Math.log10(1 + (f.lifetime || 0))));
      n.stats.caught = f.stats.caught || f.stats.caughtManual || 0;
    }
    return n;
  }

  const owned = (f, t) => f.owned[t] || 0;

  /** Output doubles at each milestone reached. */
  function multiplier(f, t) { return Math.pow(2, MILESTONES.filter((m) => owned(f, t) >= m).length); }
  function nextMilestone(f, t) { return MILESTONES.find((m) => owned(f, t) < m) || null; }

  function cost(f, t, qty) {
    qty = qty || 1;
    const base = TIERS[t].cost * Math.pow(GROWTH, owned(f, t));
    return Math.ceil(base * (Math.pow(GROWTH, qty) - 1) / (GROWTH - 1));
  }

  /** How many presses of a line the credits can buy right now. */
  function affordable(f, t) {
    let n = 0;
    while (n < 1000 && cost(f, t, n + 1) <= f.credits) n++;
    return n;
  }

  function buy(f, t, qty) {
    qty = qty || 1;
    if (!TIERS[t] || !unlocked(f, t)) return false;
    const c = cost(f, t, qty);
    if (!(f.credits >= c)) return false;
    f.credits -= c;
    f.owned[t] = owned(f, t) + qty;
    return true;
  }

  /** A line opens once you own a press of the line before it. */
  function unlocked(f, t) { return t === 1 || owned(f, t - 1) > 0; }

  function tierRate(f, t) { return owned(f, t) * TIERS[t].rate * multiplier(f, t); }

  function inspectCost(f) { return f.inspect >= INSPECTOR.max ? Infinity : Math.ceil(INSPECTOR.base * Math.pow(INSPECTOR.growth, f.inspect)); }
  function buyInspector(f) {
    const c = inspectCost(f);
    if (!(f.credits >= c)) return false;
    f.credits -= c; f.inspect++;
    return true;
  }

  /** Income: every line's output, less what shipped defects cost (the inspector catches a share C of them). */
  function rates(f) {
    let gross = 0;
    for (let t = 1; t <= MAX_TIER; t++) gross += tierRate(f, t);
    const C = Math.min(0.95, 1 - Math.pow(0.78, f.inspect));
    const loss = DEFECT_RATE * (1 - C) * 0.5;
    return { gross, C, D: DEFECT_RATE, perSec: gross * (1 - loss), offlineHours: OFFLINE_HOURS };
  }

  // ---- crates: credits fill them; a full one trades for lines -----------------------------------------------------

  function crateSize(f) { return Math.round(50 * Math.pow(2.2, f.crates)); }
  function crateLines(f) { return 3 + Math.floor(f.crates / 2); }

  function earn(f, amount) {
    if (!(amount > 0)) { f.credits = Math.max(0, f.credits + (amount || 0)); return; }
    f.credits += amount; f.lifetime += amount;
    f.crate = Math.min(crateSize(f), f.crate + amount);
  }

  /** Opens a full crate: returns the lines it holds (the caller banks them), or 0. */
  function openCrate(f) {
    if (f.crate < crateSize(f)) return 0;
    const lines = crateLines(f);
    f.crates++; f.crate = 0;
    f.stats.lines += lines;
    return lines;
  }

  // ---- running --------------------------------------------------------------------------------------------------

  /** The factory running unwatched for dt seconds. */
  function runExpected(f, dt) {
    if (!(dt > 0)) return 0;
    const r = rates(f);
    const gained = r.perSec * dt;
    earn(f, gained);
    const minos = r.gross > 0 ? dt * minosPerSec(f) : 0;
    f.stats.shipped += minos * (1 - r.D * (1 - r.C));
    f.stats.caughtAuto += minos * r.D * r.C;
    f.stats.escaped += minos * r.D * (1 - r.C);
    return gained;
  }

  /** Time away (the app closed, or the machine asleep), up to OFFLINE_HOURS. */
  function catchUp(f, now) {
    const dt = (now - (f.lastTick || now)) / 1000;
    f.lastTick = now;
    if (!(dt > 1)) return null;
    const capped = Math.min(dt, OFFLINE_HOURS * 3600);
    const credits = runExpected(f, capped);
    f.stats.offlineEarned += credits;
    return { seconds: dt, cappedSeconds: capped, credits };
  }

  /** How busy the belt looks: more presses, more minos (it tops out so it stays readable). */
  function minosPerSec(f) {
    let presses = 0;
    for (let t = 1; t <= MAX_TIER; t++) presses += owned(f, t);
    return presses ? Math.min(2.2, 0.35 + Math.log2(1 + presses) * 0.25) : 0;
  }

  const shapeCache = {};
  function shapes(n) { return shapeCache[n] || (shapeCache[n] = Pieces.freePolyominoes(n)); }

  /** A mino for the belt: from a line you own (the bigger lines more often), lying flat, sometimes defective. */
  function makeItem(f, rng, forceDefect) {
    const lines = [];
    for (let t = 1; t <= MAX_TIER; t++) if (owned(f, t)) lines.push(t);
    const t = lines.length ? lines[Math.min(lines.length - 1, Math.floor(Math.pow(rng.next(), 0.6) * lines.length))] : 1;
    let cells = rng.pick(shapes(t)).map((c) => c.slice());
    let w = 0, h = 0;
    for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
    if (h > w) { cells = cells.map(([x, y]) => [y, x]); [w, h] = [h, w]; }
    const defect = forceDefect === true || (forceDefect == null && rng.next() < DEFECT_RATE);
    return { t, cells, w, h, color: 1 + rng.int(7), defect, mark: defect ? rng.int(cells.length) : -1, x: 0 };
  }

  /** The tallest mino the lines you own can make, lying flat (the belt sizes its cells by it). */
  const tallCache = {};
  function tallest(f) {
    let top = 1;
    for (let t = 1; t <= MAX_TIER; t++) if (owned(f, t)) top = t;
    if (tallCache[top]) return tallCache[top];
    let hmax = 1;
    for (const c of shapes(top)) { let w = 0, h = 0; for (const [x, y] of c) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); } hmax = Math.max(hmax, Math.min(w, h)); }
    return (tallCache[top] = hmax);
  }

  /**
   * The belt on screen, measured in cells: minos slide in from off the left edge (x = -width), ride along, and slide
   * off the right (x > length) to ship. A new one is stamped only when the last has cleared a gap, so they never
   * overlap; income runs on regardless (the belt only shows it).
   */
  class Belt {
    constructor(f, rng) {
      this.f = f; this.rng = rng;
      this.items = []; this.events = [];
      this.length = 40; this.gap = 2; this.speed = 1.4; this.acc = 1; this.nextId = 1; this.tallest = 1;
    }

    step(dt) {
      const f = this.f, r = rates(f), mps = minosPerSec(f), per = r.gross / Math.max(0.0001, mps);
      earn(f, r.gross * dt * (1 - DEFECT_RATE)); // good minos pay as they are made; defects settle when they ship
      this.acc = Math.min(1, this.acc + dt * mps);
      const last = this.items[this.items.length - 1];
      if (mps > 0 && this.acc >= 1 && (!last || last.x >= this.gap)) {
        this.acc -= 1;
        const it = makeItem(f, this.rng);
        it.id = this.nextId++; it.value = per; it.x = -it.w;
        this.items.push(it);
      }
      for (const it of this.items) {
        it.x += dt * this.speed;
        if (it.defect && !it.checked && it.x > this.length * 0.7) {
          it.checked = true;
          if (this.rng.next() < r.C) this.remove(it, 'auto');
        }
      }
      for (const it of this.items.filter((i) => i.x >= this.length)) {
        this.items.splice(this.items.indexOf(it), 1);
        if (it.defect) { f.stats.escaped++; f.streak = 0; earn(f, -it.value * 0.5); this.events.push({ kind: 'escaped', item: it }); }
        else { f.stats.shipped++; this.events.push({ kind: 'shipped', item: it }); }
      }
    }

    /** A mino pulled off the belt, by hand (manual) or by the inspector (auto). */
    remove(it, how) {
      const i = this.items.indexOf(it);
      if (i < 0) return null;
      this.items.splice(i, 1);
      const f = this.f;
      let e;
      if (it.defect) {
        if (how === 'manual') { f.stats.caught++; f.streak++; f.bestStreak = Math.max(f.bestStreak, f.streak); earn(f, it.value * 0.5 * Math.min(4, 1 + f.streak * 0.1)); }
        else f.stats.caughtAuto++;
        e = { kind: 'caught', how, item: it, streak: f.streak };
      } else { f.stats.wasted++; f.streak = 0; e = { kind: 'wasted', item: it }; }
      this.events.push(e);
      return e;
    }

    drain() { const e = this.events; this.events = []; return e; }
  }

  L.Factory = {
    VERSION, TIERS, MAX_TIER, MILESTONES, OFFLINE_HOURS, DEFECT_RATE,
    create, migrate, tallest, multiplier, nextMilestone, cost, affordable, buy, unlocked, tierRate, inspectCost, buyInspector,
    rates, crateSize, crateLines, earn, openCrate, runExpected, catchUp, minosPerSec, makeItem, Belt, shapes,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
