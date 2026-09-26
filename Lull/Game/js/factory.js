// Lull — the Mino Works: a little workshop in the spirit of the Papa's games. Online orders print as tickets;
// each ticket goes down the line — pour the shape in the Mold, fire it in the Kiln, spray and sticker it in the
// Paint booth, ship it — and after a short wait the customer's review comes back, graded station by station.
// Stars raise your rank, and rank brings new work (more colours, stickers, two-tone jobs, pentominoes …).
// Beside that, an automatic assembly line stamps stock minos for pocket money (it runs while you are away, too);
// now and then one comes out defective, and you flick it into the bin.
(function (root) {
  'use strict';
  const L = (root.Lull = root.Lull || {});
  const { Pieces, RNG } = L;

  const VERSION = 4;

  // The paints, in the order a rank unlocks them.
  const PAINTS = [
    { name: 'Tomato', c: '#ef6f6c' },
    { name: 'Sky', c: '#5aa9e6' },
    { name: 'Lemon', c: '#f7c548' },
    { name: 'Mint', c: '#6cc486' },
    { name: 'Grape', c: '#a77fd8' },
    { name: 'Tangerine', c: '#f39a4a' },
    { name: 'Bubblegum', c: '#f28dc0' },
    { name: 'Ink', c: '#3d4a66' },
  ];

  // Firing: how long a piece stays in the kiln. The gauge fills in KILN_SECONDS.
  const FIRING = [null, { name: 'Soft', at: 0.32 }, { name: 'Firm', at: 0.57 }, { name: 'Hard', at: 0.82 }];
  const KILN_SECONDS = 15;
  const FIRE_BAND = 0.075;

  const UPGRADES = {
    line:   { name: 'Faster line', icon: '⚙', desc: 'The assembly line stamps more minos.', base: 25, growth: 1.55, max: 40 },
    qc:     { name: 'QC arm', icon: '🦾', desc: 'A robot arm pulls defects you miss.', base: 90, growth: 1.9, max: 12 },
    kiln:   { name: 'Kiln slot', icon: '🔥', desc: 'Fire one more piece at a time.', base: 160, growth: 5, max: 2 },
    nozzle: { name: 'Wide nozzle', icon: '🎨', desc: 'Paint goes on faster.', base: 70, growth: 2.6, max: 4 },
  };
  const OFFLINE_HOURS = 8;

  const DEFECTS = ['crack', 'chip', 'blob', 'burnt'];

  function create() {
    return {
      v: VERSION,
      credits: 0, lifetime: 0,
      rank: 1, rp: 0,
      up: { line: 0, qc: 0, kiln: 0, nozzle: 0 },
      orderNo: 100,
      streak: 0, bestStreak: 0,
      lastTick: Date.now(),
      // Work in progress (saved, so a half-painted piece is still there tomorrow).
      work: { inbox: [], tickets: [] },
      stats: {
        orders: 0, stars: 0, perfect: 0, bestScore: 0, points: 0, orderCredits: 0, orderLines: 0,
        byStation: { shape: 0, fire: 0, paint: 0, stickers: 0 }, stickerOrders: 0,
        shipped: 0, caught: 0, caughtAuto: 0, escaped: 0, wasted: 0, lineCredits: 0, offlineEarned: 0,
      },
    };
  }

  /** Saves from the older factories: the workshop starts fresh, with a little money for the trouble. */
  function migrate(f) {
    if (f && f.v === VERSION) { f.work = f.work || { inbox: [], tickets: [] }; return f; }
    const n = create();
    if (f && f.stats) {
      n.credits = Math.round(Math.min(600, 60 * Math.log10(1 + (f.lifetime || 0))));
      n.stats.caught = f.stats.caughtManual || 0;
      n.stats.orders = f.stats.orders || 0;
    }
    return n;
  }

  // ---- rank ------------------------------------------------------------------------------------------------------

  /** Stars needed to go from rank r to r + 1. */
  function rankNeed(r) { return 6 + 4 * r; }

  /** What the work looks like at a rank. */
  function rankInfo(rank) {
    const r = rank;
    return {
      rank: r,
      colors: Math.min(PAINTS.length, 3 + (r >= 2) + (r >= 4) + (r >= 7) + (r >= 10) + (r >= 14)),
      stickers: r >= 3 ? Math.min(4, 1 + Math.floor((r - 3) / 4)) : 0,
      twoTone: r >= 6,
      sizes: r >= 12 ? [4, 5, 5, 6] : r >= 9 ? [4, 5, 5] : r >= 5 ? [4, 4, 5] : [4],
      maxQty: Math.min(4, 1 + Math.floor(r / 4)),
      pay: 1 + 0.35 * (r - 1),
    };
  }

  /** The unlocks a new rank brings, for the rank-up card. */
  function rankNews(r) {
    const a = rankInfo(r - 1), b = rankInfo(r), out = [];
    if (b.colors > a.colors) out.push('New paint: ' + PAINTS[b.colors - 1].name);
    if (b.stickers && !a.stickers) out.push('Sticker jobs');
    else if (b.stickers > a.stickers) out.push('Up to ' + b.stickers + ' stickers');
    if (b.twoTone && !a.twoTone) out.push('Two-tone jobs');
    if (Math.max(...b.sizes) > Math.max(...a.sizes)) out.push(Math.max(...b.sizes) === 5 ? 'Pentominoes' : 'Hexominoes');
    if (b.maxQty > a.maxQty) out.push('Orders of up to ' + b.maxQty);
    out.push('Better pay');
    return out;
  }

  // ---- orders ----------------------------------------------------------------------------------------------------

  const catalogCache = {};
  function catalog(n) {
    if (!catalogCache[n]) catalogCache[n] = Pieces.freePolyominoes(n);
    return catalogCache[n];
  }

  /** Cells in screen order (x right, y down), shifted to start at 0,0 and sorted. */
  function norm(cells) {
    let mx = Infinity, my = Infinity;
    for (const [x, y] of cells) { mx = Math.min(mx, x); my = Math.min(my, y); }
    return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  function bounds(cells) {
    let w = 0, h = 0;
    for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
    return { w, h };
  }

  /**
   * A new online order: one shape, in the orientation shown on the ticket, with a paint (two for a two-tone job,
   * split by rows or columns), a firing, maybe stickers on some cells, and a quantity.
   */
  function newOrder(f, r) {
    const info = rankInfo(f.rank);
    const n = r.pick(info.sizes);
    let cells = r.pick(catalog(n)).map((c) => c.slice());
    const turns = r.int(4);
    for (let i = 0; i < turns; i++) cells = cells.map(([x, y]) => [-y, x]);
    if (r.next() < 0.5) cells = cells.map(([x, y]) => [-x, y]);
    cells = norm(cells);
    const paint = r.int(info.colors);
    const colors = cells.map(() => paint);
    let second = null;
    if (info.twoTone && r.next() < 0.5) {
      second = (paint + 1 + r.int(info.colors - 1)) % info.colors;
      const b = bounds(cells), byRow = b.h >= b.w;
      const cut = byRow ? 1 + r.int(b.h - 1) : 1 + r.int(b.w - 1);
      cells.forEach(([x, y], i) => { if ((byRow ? y : x) >= cut) colors[i] = second; });
    }
    const stickers = [];
    if (info.stickers && r.next() < 0.6) {
      const k = 1 + r.int(Math.min(info.stickers, cells.length - 1));
      const idx = cells.map((_, i) => i);
      for (let i = 0; i < k; i++) stickers.push(idx.splice(r.int(idx.length), 1)[0]);
      stickers.sort((a, b) => a - b);
    }
    f.orderNo++;
    return {
      no: f.orderNo, cells, colors, paint, second, fire: 1 + r.int(3), stickers,
      qty: 1 + (info.maxQty > 1 && r.next() < 0.45 ? r.int(info.maxQty) : 0),
      rank: f.rank,
    };
  }

  // ---- grading ---------------------------------------------------------------------------------------------------

  /**
   * How the poured shape matches the ticket (same orientation; it may sit anywhere in the mold).
   * Returns { score 0–100, dx, dy }: the shift that lays the ticket over the pour.
   */
  function gradeShape(order, built) {
    if (!built.length) return { score: 0, dx: 0, dy: 0 };
    const want = order.cells, set = new Set(built.map((c) => c.join(',')));
    let best = { score: -1, dx: 0, dy: 0 };
    let bx = Infinity, by = Infinity;
    for (const [x, y] of built) { bx = Math.min(bx, x); by = Math.min(by, y); }
    for (let dy = by - 6; dy <= by + 6; dy++) {
      for (let dx = bx - 6; dx <= bx + 6; dx++) {
        let hit = 0;
        for (const [x, y] of want) if (set.has((x + dx) + ',' + (y + dy))) hit++;
        const union = want.length + built.length - hit;
        const score = Math.round((hit / union) * 100);
        if (score > best.score) best = { score, dx, dy };
      }
    }
    return best;
  }

  /** Firing: full marks inside the band, falling away outside it. */
  function gradeFire(order, heat) {
    const d = Math.abs(heat - FIRING[order.fire].at);
    if (d <= FIRE_BAND) return 100;
    return Math.max(15, Math.round(100 - (d - FIRE_BAND) * 420));
  }

  /**
   * Paint: every poured cell's coat. `coat[i]` is an array of paint amounts on built cell i. A cell scores for
   * coverage (up to a full coat) times the share of the right colour. Cells the ticket does not have count against.
   */
  function gradePaint(order, built, coat, shift) {
    if (!built.length) return 0;
    const target = new Map(order.cells.map(([x, y], i) => [(x + shift.dx) + ',' + (y + shift.dy), order.colors[i]]));
    let sum = 0;
    built.forEach(([x, y], i) => {
      const a = coat[i] || [];
      const total = a.reduce((s, v) => s + (v || 0), 0);
      const want = target.has(x + ',' + y) ? target.get(x + ',' + y) : order.paint;
      const cover = Math.min(1, total / 0.9);
      const pure = total ? (a[want] || 0) / total : 0;
      sum += cover * pure;
    });
    return Math.round((sum / Math.max(built.length, order.cells.length)) * 100);
  }

  /** Stickers: the right cells, and nothing else. */
  function gradeStickers(order, built, placed, shift) {
    const want = new Set(order.stickers.map((i) => (order.cells[i][0] + shift.dx) + ',' + (order.cells[i][1] + shift.dy)));
    const got = new Set(Array.from(placed).map((i) => built[i] && built[i].join(',')).filter(Boolean));
    if (!want.size) return got.size ? Math.max(0, 100 - got.size * 25) : null;
    let hit = 0;
    for (const k of got) if (want.has(k)) hit++;
    return Math.round((hit / (want.size + got.size - hit)) * 100);
  }

  function starsFor(score) { return score >= 96 ? 5 : score >= 86 ? 4 : score >= 70 ? 3 : score >= 50 ? 2 : 1; }

  const REVIEWS = {
    5: ['Exactly what I ordered. Perfect!', 'Flawless. Ordering again!', 'Could not be better.'],
    4: ['Really nice work.', 'Great — tiny nitpicks only.', 'Very happy with this.'],
    3: ['It’s fine.', 'Close enough, thanks.', 'Decent.'],
    2: ['Not quite what I asked for.', 'Hmm. It’ll do, I guess.', 'Some mix-ups here.'],
    1: ['This is not my order…', 'Was this a joke?', 'Wrong in every way.'],
  };

  /**
   * The customer's review of a finished piece.
   * job: { built: [[x, y]], heat: 0–1, coat: [[amounts]], stickers: Set of built-cell indexes }
   */
  function review(f, order, job, rng) {
    const shape = gradeShape(order, job.built);
    const shift = { dx: shape.dx, dy: shape.dy };
    const rows = [
      { id: 'shape', label: 'Shape', score: shape.score },
      { id: 'fire', label: 'Firing', score: job.heat == null ? 0 : gradeFire(order, job.heat) },
      { id: 'paint', label: 'Paint', score: gradePaint(order, job.built, job.coat || [], shift) },
    ];
    const st = gradeStickers(order, job.built, job.stickers || new Set(), shift);
    if (st != null && (order.stickers.length || (job.stickers && job.stickers.size))) rows.push({ id: 'stickers', label: 'Stickers', score: st });
    // Shape matters most: a wrong shape spoils everything after it.
    const weights = { shape: 1.4, fire: 1, paint: 1.2, stickers: 0.8 };
    let wsum = 0, sum = 0;
    for (const r of rows) { sum += r.score * weights[r.id]; wsum += weights[r.id]; }
    const score = Math.round(sum / wsum);
    const stars = starsFor(score);
    const info = rankInfo(order.rank || f.rank);
    const qty = order.qty || 1;
    const size = order.cells.length;
    const credits = Math.round((8 + size * 3) * info.pay * qty * (score / 100) * (stars === 5 ? 1.25 : 1));
    const lines = Math.max(1, Math.round((2 + size * 0.5 + order.stickers.length * 0.5 + (order.second != null ? 1 : 0)) * (score / 100) * (1 + (qty - 1) * 0.5) * (stars === 5 ? 1.5 : 1)));
    const text = (rng ? rng.pick(REVIEWS[stars]) : REVIEWS[stars][0]);
    return { rows, score, stars, credits, lines, text, order };
  }

  /** Books a review: money, stats, rank. Returns the ranks gained (usually none). */
  function settle(f, rev) {
    const S = f.stats;
    f.credits += rev.credits; f.lifetime += rev.credits;
    S.orders++; S.stars += rev.stars; S.points += rev.score;
    S.orderCredits += rev.credits; S.orderLines += rev.lines;
    if (rev.stars === 5) S.perfect++;
    S.bestScore = Math.max(S.bestScore, rev.score);
    for (const r of rev.rows) S.byStation[r.id] = (S.byStation[r.id] || 0) + r.score;
    if (rev.rows.some((r) => r.id === 'stickers')) S.stickerOrders++;
    f.rp += rev.stars;
    const gained = [];
    while (f.rp >= rankNeed(f.rank)) { f.rp -= rankNeed(f.rank); f.rank++; gained.push(f.rank); }
    return gained;
  }

  // ---- upgrades --------------------------------------------------------------------------------------------------

  function cost(f, key) {
    const u = UPGRADES[key], lvl = f.up[key] || 0;
    if (lvl >= u.max) return Infinity;
    return Math.ceil(u.base * Math.pow(u.growth, lvl));
  }

  function buy(f, key) {
    const c = cost(f, key);
    if (!(f.credits >= c)) return false;
    f.credits -= c;
    f.up[key] = (f.up[key] || 0) + 1;
    return true;
  }

  function kilnSlots(f) { return 1 + (f.up.kiln || 0); }
  function sprayRate(f) { return 1.4 * (1 + 0.3 * (f.up.nozzle || 0)); }

  // ---- the assembly line (idle) ----------------------------------------------------------------------------------

  /**
   * Rates for the line: M minos a second, worth V each; a share D come out defective; the QC arm catches a
   * share C of those. A shipped defect costs its value back (a refund); a caught one is scrap (a fifth).
   */
  function rates(f) {
    const lvl = f.up.line || 0;
    const M = 0.25 * (1 + 0.3 * lvl);
    const V = 1 + 0.2 * (f.rank - 1);
    const D = 0.12;
    const C = Math.min(0.95, 1 - Math.pow(0.8, f.up.qc || 0));
    const perMino = (1 - D) + D * (C * 0.2 - (1 - C) * 0.5);
    return { M, V, D, C, perSec: M * V * perMino, offlineHours: OFFLINE_HOURS };
  }

  function earn(f, amount) {
    f.credits = Math.max(0, f.credits + amount);
    if (amount > 0) { f.lifetime += amount; f.stats.lineCredits += amount; }
  }

  /** The line running unwatched for dt seconds, in expectation. */
  function runExpected(f, dt) {
    if (!(dt > 0)) return 0;
    const r = rates(f), n = r.M * dt;
    const gained = r.perSec * dt;
    earn(f, gained);
    const S = f.stats;
    S.shipped += n * (1 - r.D) + n * r.D * (1 - r.C);
    S.caughtAuto += n * r.D * r.C;
    S.escaped += n * r.D * (1 - r.C);
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

  /** A stock mino for the line: one of the rank's shapes, sometimes defective. */
  function makeItem(f, r, forceDefect) {
    const n = rankInfo(f.rank).sizes[0];
    let cells = norm(r.pick(catalog(n)).map((c) => c.slice()));
    const defect = forceDefect === true ? r.pick(DEFECTS) : forceDefect === false ? null : r.next() < rates(f).D ? r.pick(DEFECTS) : null;
    const item = { cells, color: r.int(rankInfo(f.rank).colors), defect, mark: null, x: 0, golden: false };
    if (defect === 'chip') { item.mark = r.int(cells.length); }
    else if (defect === 'burnt' || defect === 'crack') item.mark = r.int(cells.length);
    else if (defect === 'blob') {
      // A stray lump of material on one side.
      const set = new Set(cells.map((c) => c.join(',')));
      const opts = [];
      for (const [x, y] of cells) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (!set.has(k) && !set.has((x + dx) + ',' + y) && !set.has(x + ',' + (y + dy))) opts.push([x + dx, y + dy]);
      }
      if (opts.length) { cells = norm(cells.concat([r.pick(opts)])); item.cells = cells; item.mark = cells.length - 1; }
      else { item.defect = 'burnt'; item.mark = 0; }
    }
    if (!item.defect && r.next() < 0.03) item.golden = true;
    return item;
  }

  /** The line on screen: minos ride from the press (x = 0) to the crate (x = 1). */
  class Line {
    constructor(f, seed) {
      this.f = f;
      this.rng = new RNG(seed == null ? (Date.now() >>> 0) : seed);
      this.items = [];
      this.events = [];
      this.acc = 0.6;
      this.nextId = 1;
      this.speed = 0.075;
    }

    step(dt) {
      const r = rates(this.f);
      this.acc += dt * r.M;
      while (this.acc >= 1) {
        this.acc -= 1;
        const it = makeItem(this.f, this.rng);
        it.id = this.nextId++;
        it.x = 0;
        this.items.push(it);
        this.events.push({ kind: 'stamp', item: it });
      }
      for (const it of this.items) {
        if (it.leaving) continue;
        it.x += dt * this.speed * Math.max(1, r.M / 0.25); // a faster line runs a faster belt, so minos keep their spacing
        // The QC arm looks at each defect once as it passes, near the end.
        if (it.defect && !it.checked && it.x > 0.72) {
          it.checked = true;
          if (this.rng.next() < r.C) this.remove(it, 'auto');
        }
      }
      const done = this.items.filter((it) => !it.leaving && it.x >= 1);
      for (const it of done) {
        it.leaving = true;
        const S = this.f.stats;
        if (it.defect) { earn(this.f, -r.V * 0.5); S.escaped++; this.f.streak = 0; this.events.push({ kind: 'escaped', item: it, value: -r.V * 0.5 }); }
        else {
          const v = r.V * (it.golden ? 10 : 1);
          earn(this.f, v); S.shipped++;
          this.events.push({ kind: it.golden ? 'golden' : 'shipped', item: it, value: v });
        }
      }
      this.items = this.items.filter((it) => !it.leaving);
    }

    /** A mino pulled off the line, by hand (manual) or by the arm (auto). */
    remove(it, how) {
      if (it.leaving || !this.items.includes(it)) return null;
      it.leaving = true;
      this.items = this.items.filter((x) => x !== it);
      const r = rates(this.f), S = this.f.stats;
      if (it.defect) {
        const v = r.V * 0.2;
        earn(this.f, v);
        if (how === 'manual') { S.caught++; this.f.streak++; this.f.bestStreak = Math.max(this.f.bestStreak, this.f.streak); }
        else S.caughtAuto++;
        const e = { kind: 'caught', how, item: it, value: v, streak: this.f.streak };
        this.events.push(e);
        return e;
      }
      S.wasted++;
      this.f.streak = 0;
      const e = { kind: 'wasted', item: it, value: 0 };
      this.events.push(e);
      return e;
    }

    drain() { const e = this.events; this.events = []; return e; }
  }

  L.Factory = {
    VERSION, PAINTS, FIRING, KILN_SECONDS, FIRE_BAND, UPGRADES, DEFECTS, OFFLINE_HOURS,
    create, migrate, rankNeed, rankInfo, rankNews, catalog, norm, bounds, newOrder,
    gradeShape, gradeFire, gradePaint, gradeStickers, starsFor, review, settle,
    cost, buy, kilnSlots, sprayRate, rates, runExpected, catchUp, makeItem, Line,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
